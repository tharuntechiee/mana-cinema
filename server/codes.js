// Sign-in with a 6-digit code sent to your email (mailer.js sends it).
//
// The code is made here, kept only as a keyed hash, lasts 10 minutes and allows 5 tries. To stop one person
// flooding inboxes (or our mail account's daily limit), an address gets a new code at most once a minute and
// 5 times a day, one network address can ask 5 times an hour (routes/account.js), and the whole site sends at
// most CODES_DAILY_LIMIT codes a day. Every answer is the same whether or not the address has an account.
import crypto from "node:crypto";
import { db, nowISO, todayIST, getMeta, setMeta } from "./db.js";
import { config } from "./env.js";
import { keyed, signIn, emailKey, emailMethod } from "./accounts.js";
import { sendCode } from "./mailer.js";

const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const RESEND_S = 60;
const PER_ADDRESS_DAY = 5;

const cleanEmail = input => String(input ?? "").trim().toLowerCase();
const codeHash = (key, code) => keyed(`code:${key}:${code}`);
const notSetUp = { error: "Email sign-in isn't set up on this site.", status: 404 };
const badAddress = { error: "Enter your email address, like name@gmail.com.", status: 400 };

export async function startEmail(input) {
  if (!emailMethod()) return notSetUp;
  const email = cleanEmail(input), key = emailKey(email);
  if (!key) return badAddress;
  const eh = keyed(`email:${key}`);
  const now = Date.now();
  const row = db.prepare("SELECT * FROM sign_in_codes WHERE email_hash = ?").get(eh);
  const sent = JSON.parse(row?.sent_times || "[]").filter(t => now - Date.parse(t) < 864e5);
  const wait = row?.last_sent_at ? Math.ceil(RESEND_S - (now - Date.parse(row.last_sent_at)) / 1000) : 0;
  if (wait > 0) return { error: `Wait ${wait} seconds before asking for another code.`, status: 429, resendIn: wait };
  if (sent.length >= PER_ADDRESS_DAY) return { error: "That address has had too many codes today. Try again tomorrow, or sign in with Google.", status: 429 };
  const dayKey = `codes_sent:${todayIST()}`;
  const today = Number(getMeta(dayKey) || 0);
  if (today >= config.codesDailyLimit) return { error: "Email sign-in is busy today. Sign in with Google, or try again tomorrow.", status: 503 };

  const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  try {
    await sendCode(email, code, CODE_MINUTES);
  } catch (err) {
    console.error(`Sign-in email not sent: ${err.message}`);
    return { error: "We couldn't send the email. Check the address, or try again in a minute.", status: 502 };
  }
  setMeta(dayKey, today + 1);
  const at = new Date(now).toISOString();
  db.prepare(`
    INSERT INTO sign_in_codes (email_hash, code_hash, expires_at, attempts, last_sent_at, sent_times) VALUES (?, ?, ?, 0, ?, ?)
    ON CONFLICT (email_hash) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0,
      last_sent_at = excluded.last_sent_at, sent_times = excluded.sent_times
  `).run(eh, codeHash(key, code), new Date(now + CODE_MINUTES * 60e3).toISOString(), at, JSON.stringify([...sent, at]));
  return { ok: true, resendIn: RESEND_S, expiresIn: CODE_MINUTES * 60 };
}

export function verifyEmail(req, res, { email: input, code }, visitor) {
  if (!emailMethod()) return notSetUp;
  const email = cleanEmail(input), key = emailKey(email);
  if (!key) return badAddress;
  const clean = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return { error: "Enter the 6-digit code from the email.", status: 400 };
  const eh = keyed(`email:${key}`);
  const row = db.prepare("SELECT * FROM sign_in_codes WHERE email_hash = ?").get(eh);
  if (!row?.code_hash) return { error: "Ask for a code first.", status: 400 };
  if (row.expires_at <= nowISO()) return { error: "That code has expired. Ask for a new one.", status: 400 };
  if (row.attempts >= MAX_TRIES) return { error: "Too many wrong codes. Ask for a new one.", status: 429 };
  db.prepare("UPDATE sign_in_codes SET attempts = attempts + 1 WHERE email_hash = ?").run(eh);
  const ok = crypto.timingSafeEqual(Buffer.from(codeHash(key, clean)), Buffer.from(row.code_hash));
  if (!ok) {
    const left = MAX_TRIES - row.attempts - 1;
    return { error: left ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Ask for a new one.", status: 400 };
  }
  // A code works once
  db.prepare("UPDATE sign_in_codes SET code_hash = NULL, expires_at = NULL WHERE email_hash = ?").run(eh);
  return { user: signIn(req, res, { email }, visitor) };
}

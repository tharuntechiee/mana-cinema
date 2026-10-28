// Sends the sign-in code by email (see .env.example):
//
//   brevo     through Brevo's email API over HTTPS (free: 300 emails a day), from a sender address you've
//             verified in Brevo. For hosts that block mail ports, such as Render's free plan.
//   smtp      a real email through SMTP_HOST (default Gmail: smtp.gmail.com, port 465) with SMTP_USER and
//             SMTP_PASS (for Gmail, an app password, not your normal password). A free Gmail account can send
//             about 500 emails a day.
//   console   for testing on your own computer: the code is printed in the server window, nothing is sent.
//             Refused when NODE_ENV=production, so a live site can't run with it by mistake.
import nodemailer from "nodemailer";
import { config } from "./env.js";

let transport = null;
const smtp = () => transport || (transport = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  // Port 587 must upgrade to TLS before the password is sent; a mail server on this computer may have no TLS
  requireTLS: config.smtp.port !== 465 && !["localhost", "127.0.0.1"].includes(config.smtp.host),
  auth: { user: config.smtp.user, pass: config.smtp.pass },
  connectionTimeout: 10e3, greetingTimeout: 10e3, socketTimeout: 15e3,
}));

const message = (code, minutes) => ({
  subject: `${code} is your MANA CINEMA sign-in code`,
  text: `Your MANA CINEMA sign-in code is ${code}\n\nIt works for ${minutes} minutes. If you didn't ask for it, ignore this email: nobody can sign in without the code.\n\nMANA CINEMA`,
  html: `<div style="font-family:Arial,sans-serif;font-size:16px;color:#111">
    <p>Your MANA CINEMA sign-in code is</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
    <p>It works for ${minutes} minutes. If you didn't ask for it, ignore this email: nobody can sign in without the code.</p>
    <p style="color:#666">MANA CINEMA</p></div>`,
});

const SENDERS = {
  console: async (to, code) => {
    if (process.env.NODE_ENV === "production") throw new Error("EMAIL_SENDER=console is for testing only");
    const [name, domain] = to.split("@");
    console.log(`[test email] code for ${name.slice(0, 2)}•••@${domain}: ${code}`);
  },
  smtp: async (to, code, minutes) => {
    if (!config.smtp.user || !config.smtp.pass) throw new Error("SMTP_USER and SMTP_PASS aren't set");
    const m = message(code, minutes);
    await smtp().sendMail({ from: { name: "MANA CINEMA", address: config.mailFrom || config.smtp.user }, to, subject: m.subject, text: m.text, html: m.html });
  },
  brevo: async (to, code, minutes) => {
    if (!config.brevoKey || !config.mailFrom) throw new Error("BREVO_API_KEY and MAIL_FROM aren't set");
    // Brevo has two kinds of key; its SMTP key (xsmtpsib-) is refused by the API with "Key not found"
    if (config.brevoKey.startsWith("xsmtpsib-")) throw new Error("BREVO_API_KEY is Brevo's SMTP key (xsmtpsib-...). Make an API key instead: Brevo > SMTP & API > API keys (it starts xkeysib-)");
    const m = message(code, minutes);
    const res = await fetch(config.brevoUrl, {
      method: "POST",
      headers: { "api-key": config.brevoKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: { name: "MANA CINEMA", email: config.mailFrom }, to: [{ email: to }], subject: m.subject, textContent: m.text, htmlContent: m.html }),
      signal: AbortSignal.timeout(10e3),
    });
    if (!res.ok) throw new Error(`Brevo answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  },
};

export async function sendCode(to, code, minutes) {
  const send = SENDERS[config.emailSender];
  if (!send) throw new Error(`unknown EMAIL_SENDER "${config.emailSender}"`);
  await send(to, code, minutes);
}

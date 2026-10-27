// Viewers' sign-in and their account (accounts.js has the rules).
//
//   GET    /api/auth/nonce            a one-time value for Google's sign-in button: { nonce }
//   POST   /api/auth/google           { credential } Google's ID token -> { user }
//   POST   /api/auth/email/start      { email } email a 6-digit code -> { ok, resendIn }
//   POST   /api/auth/email/verify     { email, code } -> { user }
//   POST   /api/auth/signout          { everywhere? } sign out this browser, or every device
//   GET    /api/me                    { user } (null when signed out)
//   PATCH  /api/me                    { name } the name shown on ratings and comments
//   GET    /api/me/export             everything kept about the account, as a file
//   DELETE /api/me                    { confirm: "DELETE" } delete the account and everything it posted
import express from "express";
import { rateLimit } from "express-rate-limit";
import { reviewerFrom } from "../auth.js";
import { userFrom, userOut, googleNonce, googleSignIn, endUserSession, renameUser, exportUser, deleteUser } from "../accounts.js";
import { startEmail, verifyEmail } from "../codes.js";

export const accountApi = express.Router();

const limit = (minutes, max, error, { onlySent = false } = {}) => rateLimit({
  windowMs: minutes * 60e3, limit: max, standardHeaders: "draft-8", legacyHeaders: false, message: { error },
  skipFailedRequests: onlySent,   // count only codes actually sent, not mistyped addresses
});
const answer = (res, out, ok = 200) => (out.error ? res.status(out.status || 400).json({ error: out.error, ...(out.resendIn ? { resendIn: out.resendIn } : {}) }) : res.status(ok).json(out));
const signedIn = (req, res, next) => (userFrom(req) ? next() : res.status(401).json({ error: "You're signed out. Sign in again.", signIn: true }));

accountApi.get("/auth/nonce", limit(10, 60, "Too many sign-in attempts. Wait a few minutes."), (req, res) => {
  res.json({ nonce: googleNonce(req, res) });
});

accountApi.post("/auth/google", limit(10, 30, "Too many sign-in attempts. Wait a few minutes."), async (req, res) => {
  const out = await googleSignIn(req, res, req.body?.credential, reviewerFrom(req));
  answer(res, out.user ? { user: userOut(out.user), created: out.user.created } : out);
});

// 5 codes an hour from one network address, on top of the per-email limits in codes.js
accountApi.post("/auth/email/start", limit(60, 5, "Too many codes asked for from here. Try again in an hour.", { onlySent: true }), async (req, res) => {
  answer(res, await startEmail(req.body?.email));
});

accountApi.post("/auth/email/verify", limit(15, 20, "Too many tries. Wait a few minutes."), (req, res) => {
  const out = verifyEmail(req, res, req.body || {}, reviewerFrom(req));
  answer(res, out.user ? { user: userOut(out.user), created: out.user.created } : out);
});

accountApi.post("/auth/signout", (req, res) => {
  endUserSession(req, res, { everywhere: req.body?.everywhere === true });
  res.json({ ok: true });
});

accountApi.get("/me", (req, res) => res.json({ user: userOut(userFrom(req)) }));

accountApi.patch("/me", signedIn, limit(15, 20, "Too many changes. Wait a few minutes."), (req, res) => {
  answer(res, renameUser(userFrom(req), req.body?.name));
});

accountApi.get("/me/export", signedIn, (req, res) => {
  res.set("Content-Disposition", 'attachment; filename="mana-cinema-my-data.json"');
  res.json(exportUser(userFrom(req)));
});

accountApi.delete("/me", signedIn, (req, res) => {
  if (req.body?.confirm !== "DELETE") return res.status(400).json({ error: 'Type DELETE to confirm.' });
  deleteUser(userFrom(req));
  endUserSession(req, res);
  res.json({ ok: true });
});

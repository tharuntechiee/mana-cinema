// Checks a signed sign-in token (a JWT signed with RS256), such as a Google ID token, using only node:crypto.
// The signing keys come from the issuer's public key set (JWKS), kept in memory for as
// long as its Cache-Control header allows, and fetched again when a token names a key we don't have.
import crypto from "node:crypto";

const keySets = new Map();   // url -> { keys: Map(kid -> KeyObject), expires, fetchedAt }
const SKEW_S = 60;           // allowed clock difference with the issuer, in seconds

async function loadKeys(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`key server answered ${res.status}`);
  const body = await res.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    try { keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" })); } catch {}
  }
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1]) || 3600;
  return { keys, expires: Date.now() + Math.min(maxAge, 86400) * 1000 };
}

const loading = new Map();   // url -> the fetch in progress, shared by everyone waiting for it
async function keyFor(url, kid) {
  const set = keySets.get(url);
  const fresh = set && Date.now() < set.expires;
  if (fresh && set.keys.has(kid)) return set.keys.get(kid);
  // A key we don't know: refetch, but at most once a minute, so made-up tokens can't hammer the key server
  if (fresh && Date.now() - set.fetchedAt < 60e3) return null;
  if (!loading.has(url)) {
    loading.set(url, loadKeys(url)
      .then(next => { keySets.set(url, { ...next, fetchedAt: Date.now() }); })
      .finally(() => loading.delete(url)));
  }
  await loading.get(url);
  return keySets.get(url)?.keys.get(kid) || null;
}

const part = text => JSON.parse(Buffer.from(text, "base64url").toString("utf8"));

// Resolves to the token's claims when it's genuine, from one of `issuers`, for `audience` and still valid;
// throws an Error with a message for the visitor otherwise.
export async function verifyJwt(token, { jwksUrl, issuers, audience }) {
  if (typeof token !== "string" || token.length > 8192) throw new Error("That sign-in didn't work. Try again.");
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("That sign-in didn't work. Try again.");
  let header, claims;
  try { header = part(h); claims = part(p); } catch { throw new Error("That sign-in didn't work. Try again."); }
  if (header.alg !== "RS256" || !header.kid) throw new Error("That sign-in didn't work. Try again.");
  const key = await keyFor(jwksUrl, header.kid);
  const ok = key && crypto.verify("sha256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"));
  if (!ok) throw new Error("That sign-in didn't work. Try again.");
  const now = Math.floor(Date.now() / 1000);
  if (!issuers.includes(claims.iss)) throw new Error("That sign-in came from somewhere unexpected.");
  if (claims.aud !== audience) throw new Error("That sign-in was meant for another website.");
  if (!(Number(claims.exp) > now - SKEW_S)) throw new Error("That sign-in has expired. Try again.");
  for (const t of ["iat", "auth_time"]) {
    if (claims[t] !== undefined && Number(claims[t]) > now + SKEW_S) throw new Error("That sign-in didn't work. Try again.");
  }
  if (!claims.sub) throw new Error("That sign-in didn't work. Try again.");
  return claims;
}

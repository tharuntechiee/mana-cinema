# Sign-in options: one rating per person per film

Research for MANA CINEMA (Node 24, Express 5, node:sqlite, plain JS front end). Every page was accessed on 2026-10-27. [S#] points to Section 8. "Inference" marks my own reading, not a source's statement. Prices are as published on that date and exclude tax unless stated.

## 1. Bottom line

- **Build first: Sign in with Google (Google Identity Services, GIS).** It is free to use as far as I can find (no price is published, see Section 7), needs no SMS, and avoids TRAI DLT entirely. The browser gets a signed ID token (a JWT); the server checks it with `node:crypto` and Google's public keys. No npm library is needed. I checked that Node v24.21.0 can import a JWK with `crypto.createPublicKey({ key, format: 'jwk' })` and verify an `RSA-SHA256` signature [S7]. Key the user on the token's `sub`, never on `email` [S3].
- **Build second (only if users ask): phone OTP through Firebase Phone Auth.** Google sends the SMS, so you do not register on DLT yourself (inference: nothing in Firebase's docs asks for a DLT entity ID, header or template, and I found no Google statement either way). It costs **US$0.07 per SMS to India**, and the first 10 SMS a day are not billed [S9]. It needs the Blaze (pay as you go) plan [S10]. You must allow India in the SMS region policy, because new projects allow no regions [S11, S12].
- **Avoid for now:** running your own OTP through MSG91, 2Factor or Twilio's domestic route. To send OTPs to Indian numbers under your own name you must register as a Principal Entity, plus a header and content templates, on an operator DLT portal [S18, S19]. MSG91 can send OTPs from a default template without your own DLT registration, but it calls that a stopgap and says DLT is "the recommended practice" [S15]. Twilio's international route needs no DLT but sends from random short codes [S17].
- **One rating per film** is a database rule, not a sign-in feature: a `UNIQUE (user_id, film_id)` constraint on the ratings table. Sign-in only makes `user_id` hard to fake. A person with two Google accounts can still rate twice. Phone numbers are harder to multiply, but not impossible (inference).
- **DPDP:** from about May 2027 (inference: 18 months after the Rules were published on 13 November 2025) a small site must give a stand-alone notice, take clear consent, let people withdraw and delete, publish a contact, and report breaches [S21, S22]. Collect the least you can: Google `sub`, display name, and email only if you will use it.

## 2. Google sign-in (GIS)

### How it works

| Step | What happens | Source |
|---|---|---|
| Load library | `<script src="https://accounts.google.com/gsi/client" async>` on every page with a sign-in button. Self-hosting is not supported | [S2] |
| Button or One Tap | `google.accounts.id.initialize({ client_id, callback, nonce })`. Button defaults to `ux_mode: "popup"`; `"redirect"` posts the token to your `login_uri` | [S4] |
| Token | The ID token arrives in the `credential` field | [S1] |
| Server | POST the credential to your Express route; verify it (below); create your own session cookie | [S1, S3] |

One Tap "can only be displayed in HTTPS domains" [S2]. `use_fedcm_for_prompt` is now deprecated and ignored [S4]; the browser's FedCM controls the prompt.

### Verifying the ID token with node:crypto only

| Check | Rule | Source |
|---|---|---|
| Header | `alg` must be RS256 (the only alg Google's discovery document lists, checked live); pick the key whose `kid` matches | [S3, S8] |
| Keys | JWK set at `https://www.googleapis.com/oauth2/v3/certs` (PEM at `/oauth2/v1/certs`). Keys rotate; "examine the Cache-Control header" to know when to refetch | [S1, S3] |
| Cache | Live response on 2026-10-27: `Cache-Control: public, max-age=21224` (about 6 hours). Cache by `max-age`; refetch once if a `kid` is unknown (inference) | [S8] |
| Signature | `crypto.verify('RSA-SHA256', header.payload, publicKey, signature)` | [S7] |
| `iss` | `accounts.google.com` or `https://accounts.google.com` | [S1, S3] |
| `aud` | Equals your Web client ID | [S1, S3] |
| `exp` | Not passed (allow a small clock skew, inference) | [S1, S3] |
| `email_verified` | True if Google verified the email. Only matters if you use email; it can stay true after an address changes hands | [S1, S3] |
| `nonce` | Optional field in `initialize`. Generate it on the server, store it in the pre-login session, check the token echoes it, use once. The GIS verify page itself does not mention nonce; ASVS 10.5.1 asks for replay protection like this | [S3, S4, S6] |
| CSRF (redirect mode) | Compare the `g_csrf_token` cookie with the `g_csrf_token` body field before validating | [S1] |
| Identity | Use `sub`: "unique among all Google Accounts and never reused". Do not use `email` as the key | [S1, S3, S6] |

The `tokeninfo` endpoint is for debugging only; validate locally in production [S3].

### Google Cloud Console setup

| Item | What to do | Source |
|---|---|---|
| OAuth client | Application type **Web application** | [S2] |
| Authorised JavaScript origins | Scheme + host only, e.g. `https://manacinema.example`. For local work add **both** `http://localhost` and `http://localhost:<port>` | [S2] |
| Redirect URIs | Only needed for `ux_mode: "redirect"` | [S2] |
| Branding (consent screen) | App name, logo, support email, authorised domains, homepage and privacy policy links (links must be on an authorised domain). Default scopes are enough; no sensitive scopes | [S2] |
| Verification | "If your app utilizes only non-sensitive scopes, it is not mandatory" to verify. Showing your name and logo needs the lighter **brand verification**: a homepage that is not only a login page, a privacy policy on the same domain, domain ownership in Search Console | [S5] |
| Audience | User type **External**. **Testing** limits you to 100 listed test users; **In production** opens it to any Google account | [S5b] |
| Caps | The lifetime 100-user cap applies to unverified apps asking for sensitive or restricted scopes, so not to openid/email/profile. Test-user 7-day authorisation expiry also does not apply to these basic scopes | [S5b] |
| Headers | When testing over http on localhost set `Referrer-Policy: no-referrer-when-downgrade`; otherwise `strict-origin-when-cross-origin`. If you set a CSP, allow `https://accounts.google.com/gsi/` | [S2] |

The console now calls this area "Google Auth Platform" (Branding, Audience, Clients pages) [S5b] (my observation of the help page names; I did not log in to the console).

## 3. Phone OTP for +91 numbers

### Provider comparison

| Provider | Price to India | Plan / account | DLT for you? | Notes |
|---|---|---|---|---|
| **Firebase Phone Auth** [S9-S12] | US$0.07 per SMS sent; first 10 SMS a day not billed (Identity Platform price table, which Firebase's pricing page links to) | Blaze plan only for SMS; project cap 3,000 SMS a day (900 a minute); per IP 50 a minute, 500 an hour | Not asked for in any doc I read (inference: Google is the sender) | Uses reCAPTCHA (invisible or widget). SMS region policy: new projects allow none. `localhost` is not allowed as a domain for phone auth. Up to 10 test numbers. Optional reCAPTCHA SMS defense (toll-fraud score) [S13] |
| **MSG91 OTP** [S14, S15] | ₹0.25 per SMS on the 5,000 pack (₹1,250), falling to ₹0.18 at 8.5 lakh; plus 18% GST | KYC needed to leave DEMO mode | Default-template OTP widget works without your DLT ("not include any branding"); custom sender or templates need your DLT | Widget subscription prices are only in a dashboard image; not read |
| **Twilio Verify** [S16, S17] | US$0.05 per successful verification + India SMS US$0.0832 per segment (about US$0.13 per login) | Pay as you go | International route: "No DLT registration is required"; random 5NNNN short codes. Domestic alphanumeric sender needs your DLT first | A Twilio CSV lists 0.0682 for India carriers; currency not shown, so unresolved |
| **2Factor.in** | Not verified | - | Not verified | Every page returned HTTP 403 to my tools |

Rough per-login cost (inference): MSG91 about ₹0.30 with GST; Firebase about ₹6 at roughly ₹85 to the dollar (my assumed rate, not from a source) after the free 10 a day; Twilio about ₹11.

### TRAI DLT in plain words

| Question | Answer | Source |
|---|---|---|
| Who registers? | The **Principal Entity** (the business whose name the message carries) must register before sending commercial communication, "OTP, Transactional messages, Service messages or commercial messages" included | [S18] |
| What? | (a) PE registration, (b) header (sender ID, max 11 characters), (c) content templates, (d) pass PE ID, header and template ID to the operator, (e) consent template if any | [S18, S19] |
| Who else? | Telemarketers (direct operator link) and aggregators (no direct link) also register; the PE still owns its entity, header and templates | [S20] (vendor) |
| Time | Entity: max 7 days after complete papers; header: max 2 days (TRAI direction of 19.06.2020, quoted on TRAI's government-entities page) | [S19] |
| Fee | Not on TRAI's pages. Vendors say ₹5,900 one-time on the first portal; whether GST is included differs by source | [S20] (vendor, unverified) |
| Recent rules | Since 1 September 2024 messages with URLs, APKs, OTT links or call-back numbers not whitelisted are blocked; since 1 November 2024 messages without a defined telemarketer chain are rejected | [S18b] |

**How a small site avoids DLT itself:** (1) don't send SMS: Google sign-in; (2) let a provider be the sender: Firebase Phone Auth (inference, see above), MSG91's default-template widget (stopgap by MSG91's own words), or Twilio's international route (no DLT, but unbranded short-code senders and it bypasses DND per Twilio).

## 4. Security rules to follow (OWASP)

### OTP

| Rule | Value | Source |
|---|---|---|
| Length | At least 20 bits of entropy: 6 random digits is enough. OWASP's forgot-password PINs: 6 to 12 digits | [S23 ASVS 6.5.4, S26] |
| Generator | CSPRNG (`crypto.randomInt`) | [S23 ASVS 6.5.3] |
| Expiry | Max 10 minutes for out-of-band codes. Inference: 5 minutes is a sensible choice | [S23 ASVS 6.5.5] |
| Single use, bound | Usable once; tied to the request it was made for | [S23 ASVS 6.5.1, 6.6.2] |
| Attempts | Rate limit guesses. ASVS gives no number; inference: 5 wrong tries then a new code | [S23 ASVS 6.6.3, S24] |
| Storage | ASVS 6.5.2 asks for salted password-hash storage of short lookup secrets. Inference: hash OTPs too (HMAC-SHA256 with a server secret, or scrypt), compare with `crypto.timingSafeEqual` | [S23] |
| SMS caveats | Offer SMS only with a validated number and a stronger option alongside; warn users of SIM-swap risk | [S23 ASVS 6.6.1, S24] |
| Resend cooldown | No number in OWASP or ASVS. Inference: 30-60 s between sends, about 5 per number per hour | - |

### SMS pumping (toll fraud)

Attackers make your form send SMS to numbers they earn money from [S11, S27]. Protections:
- Allow only India (`IN`) in the SMS region policy or Twilio geo permissions [S11, S27].
- Rate limit by phone number, IP and device [S27]; Firebase also enforces per-IP limits [S10].
- CAPTCHA or bot detection before sending [S12, S27]; Firebase reCAPTCHA SMS defense blocks high-risk numbers above a score threshold (start in AUDIT mode) [S13].
- Watch the send-to-verify conversion rate and alert when it drops [S27]. MSG91 has a user-set monthly cap [S14]; set a Google Cloud budget alert (inference).

### Sessions

| Rule | Detail | Source |
|---|---|---|
| Session ID | At least 128 bits from a CSPRNG (ASVS); OWASP cheat sheet says at least 64 bits. Use `crypto.randomBytes(32)` | [S23 ASVS 7.2.3, S25] |
| Cookie | `__Host-session=...; Secure; HttpOnly; SameSite=Lax; Path=/` with no `Domain`. `__Host-` needs Secure, Path=/ and no Domain | [S23 ASVS 3.3.1-3.3.4, S25] |
| Rotate | New session ID at login; end the pre-login one (stops session fixation) | [S23 ASVS 7.2.4, S25] |
| Timeouts | Low-risk apps: idle 15-30 min; absolute "4 and 8 hours" in OWASP's office example. Inference: for a ratings site, 30 days absolute with sliding renewal is a common trade-off; document it as ASVS 7.1.1 asks | [S25, S23] |
| Logout | Delete the session row on the server; a deleted cookie alone does not kill a stolen copy. Logout visible on every signed-in page | [S23 ASVS 7.4.1, 7.4.4, S25] |
| Account deletion | End all sessions | [S23 ASVS 7.4.2] |
| Store sessions | A `sessions` table in SQLite, storing a hash of the ID (inference) | - |

### CSRF for cookie sessions

- SameSite is "defense-in-depth", not a full defence [S28]. Keep all writes on POST/PUT/DELETE [S23 ASVS 3.5.3].
- Check `Sec-Fetch-Site` (reject `cross-site`), fall back to `Origin`/`Referer` matching your origin; missing or `null` Origin is not proof of same origin [S28].
- Add either a synchronizer token bound to the session or a custom header such as `X-CSRF-Token` on `fetch` calls (forces a CORS preflight) [S28, S23 ASVS 3.5.1].
- Protect the login POST too (login CSRF) [S28].

### Account enumeration

Give the same response for known and unknown phone numbers, with similar timing [S24b, S26].

## 5. DPDP Act 2023 and DPDP Rules 2025

The Rules were notified 13 November 2025 (G.S.R. 846(E)) [S22]. Rules 1, 2, 17-21 started at once; Rule 4 (Consent Managers) after one year; Rules 3, 5-16, 22, 23 (notice, security, breach, retention, contact, children, rights) **18 months after publication**, about May 2027 (inference) [S22]. I did not read the notification that brings the Act's own sections into force.

| Duty | What it says | What MANA CINEMA should do | Source |
|---|---|---|---|
| Notice | Stand-alone, plain language; itemised data list; specific purpose; link and means to withdraw consent, use rights, complain to the Board. Offer English or any Eighth Schedule language | A short notice beside the sign-in button: "We store your Google ID, name and [email] to keep one rating per film". Telugu version is an option the Act allows | [S21 s.5, S22 r.3] |
| Consent | "free, specific, informed, unconditional and unambiguous with a clear affirmative action", limited to needed data | Unticked checkbox or the click on "Continue" with the notice shown; log time and notice version | [S21 s.6] |
| Withdraw | At any time, as easy as giving it | "Delete my account" button in profile | [S21 s.6, S22 r.3] |
| Erase | On withdrawal, or when the purpose is no longer served, unless a law needs it | Delete user row, sessions, OTP rows. Inference: keep or anonymise ratings as "deleted user", and say which in the notice | [S21 s.8(7), s.12] |
| Retention | Keep personal data, traffic data and processing logs at least one year (Rule 8(3), Seventh Schedule purposes). Fixed 3-year inactivity deletion applies only to big e-commerce, gaming and social media firms | Keep login logs one year, then delete | [S22 r.8, Third Schedule] |
| Security | Encryption or masking, access control, logs and monitoring, backups; logs kept one year | HTTPS only, hashed session IDs and OTPs, backups of the SQLite file | [S21 s.8(5), S22 r.6] |
| Breach | Tell each affected user without delay; tell the Board without delay and with full details within 72 hours | Write a one-page breach plan now | [S21 s.8(6), S22 r.7] |
| Contact | Publish contact of a person who can answer data questions | Email on the privacy page | [S22 r.9] |
| Rights requests | Publish how to ask; answer within 90 days | Same email; aim for days | [S22 r.14] |
| Children (under 18) | Verifiable parental consent before processing | Inference: state the site is for 18+ in the notice. Rule 10 checks are heavy for a hobby site | [S21 s.9, S22 r.10] |
| Penalties | Up to ₹250 crore for weak security, ₹200 crore for breach-notice or child failures, ₹50 crore other | - | [S22b] |

Section 17(3) lets the government exempt notified classes, including startups, from some duties; I found no such notification [S21].

## 6. Recommendation and setup

**Order.** (1) Google sign-in now. (2) Firebase phone OTP later, only if many users lack or avoid Google accounts. (3) Your own DLT and MSG91 only if SMS volume gets large enough that ₹0.25 beats US$0.07 by a lot (inference: from a few thousand logins a month).

**What the site owner must do (Google, about 30 minutes):**
1. Sign in at console.cloud.google.com, create a project "MANA CINEMA".
2. Google Auth Platform > Branding: app name, support email, logo (optional), authorised domain, homepage URL, privacy policy URL [S2].
3. Audience: External; publish to **In production** (no verification needed for basic scopes) [S5, S5b].
4. Clients > Create > Web application. Origins: your live `https://` origin, `http://localhost`, `http://localhost:3000` (your port) [S2].
5. Copy the **Client ID** (not secret; goes in front-end and server config). No client secret is needed for this flow (inference: verification uses public keys only).
6. Optional: verify the domain in Search Console and request brand verification so your name and logo show [S5].
7. Write and publish a privacy page (Section 5).

**If adding Firebase phone OTP later:**
1. console.firebase.google.com, add Firebase to the same Google Cloud project; upgrade to **Blaze** with a card [S10].
2. Authentication > Sign-in method > Phone: enable; add test numbers [S12].
3. Authentication > Settings > SMS region policy: allow only India [S11].
4. Authentication > Settings > Authorised domains: add your domain (localhost does not work for phone auth) [S12].
5. Set a budget alert in Google Cloud Billing (inference).
6. Give the developer the Firebase web config (apiKey, authDomain, projectId). The server checks Firebase ID tokens: RS256, `kid` from `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`, `aud` = project ID, `iss` = `https://securetoken.google.com/<projectId>`, `exp` future, `iat` and `auth_time` past, `sub` non-empty; refresh keys by `max-age` [S29]. These keys are PEM certificates, not JWK; `crypto.createPublicKey` reads PEM too (inference). The browser needs the Firebase JS SDK (Google CDN) for reCAPTCHA and sending; the server needs no npm package.

**Rough monthly cost for a small site** (inference from the prices above):

| Use | Google sign-in | Firebase OTP | MSG91 | Twilio Verify |
|---|---|---|---|---|
| 300 logins by SMS | ₹0 | about US$0 (10 a day free) | ₹1,475 first 5,000-pack (lasts many months; credit validity not checked) | about US$40 |
| 1,000 logins by SMS | ₹0 | about US$49 (700 billed) | about ₹295 | about US$133 |
| Plus | - | Blaze plan, card needed | Own DLT (~₹5,900 one-time, vendor figure) for branded SMS | - |

Logins, not page views, drive SMS cost: with 30-day sessions most visitors sign in once a month or less (inference).

## 7. Not verified

- **GIS price.** No Google page states that Sign in with Google is free; I found no price either. Identity Platform (a different product) is free to 50,000 MAU [S9].
- **Firebase and DLT.** No Google statement on whether Firebase SMS to India is sent under Google's own DLT registration.
- **Firebase free SMS.** "First ten SMS per day not billed" is on the Identity Platform price table; I did not confirm it applies to plain Firebase Auth on Blaze.
- **Firebase per-number limit.** Firebase says one exists but gives no number [S10].
- **2Factor.in:** pricing, DLT terms, all pages blocked (HTTP 403).
- **MSG91 OTP widget subscription prices** (shown only in a dashboard image) and credit validity.
- **Twilio India price:** pricing page US$0.0832 vs CSV 0.0682 (currency not shown).
- **DLT fee:** ₹5,900 comes from vendors (Infobip, Exotel, Fast2SMS), not from TRAI or an operator page; GST treatment differs.
- **DPDP Act commencement:** I read the Rules' commencement rule, not the notification for the Act's sections. No startup exemption notification found.
- **OWASP resend cooldown and attempt counts:** neither OWASP nor ASVS gives numbers; the figures above are mine.
- **Google console page names** ("Google Auth Platform", Branding, Audience, Clients): from help pages, not a logged-in console.

## 8. Sources (all accessed 2026-10-27)

- S1 https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- S2 https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- S3 https://developers.google.com/identity/openid-connect/openid-connect
- S4 https://developers.google.com/identity/gsi/web/reference/js-reference
- S5 https://support.google.com/cloud/answer/13464321 ; https://support.google.com/cloud/answer/13463073
- S5b https://support.google.com/cloud/answer/15549945
- S6 OWASP ASVS 5.0 V10 OAuth and OIDC: https://github.com/OWASP/ASVS/blob/master/5.0/en/0x19-V10-OAuth-and-OIDC.md
- S7 https://nodejs.org/api/crypto.html ; plus a local test on Node v24.21.0 (JWK import, RSA-SHA256 verify, `timingSafeEqual`, `randomInt`)
- S8 Live checks: https://www.googleapis.com/oauth2/v3/certs (response headers) ; https://accounts.google.com/.well-known/openid-configuration
- S9 https://cloud.google.com/identity-platform/pricing (India row; free 10 SMS a day; 50K MAU) ; https://firebase.google.com/pricing
- S10 https://firebase.google.com/docs/auth/limits
- S11 https://docs.cloud.google.com/identity-platform/docs/admin/sms-regions
- S12 https://firebase.google.com/docs/auth/web/phone-auth
- S13 https://docs.cloud.google.com/identity-platform/docs/recaptcha-tfp
- S14 https://msg91.com/in/pricing/otp ; https://msg91.com/help/sendotp/how-to-integrate-the-new-login-with-otp-widget/msg91-otp-widget-subscription-
- S15 https://msg91.com/help/msg91-common-faq-s (FAQ 74, KYC) ; https://msg91.com/help/dlt-registration-in-india/step-by-step-guide-to-implement-dlt-in-sms
- S16 https://www.twilio.com/en-us/verify/pricing ; https://www.twilio.com/en-us/sms/pricing/in
- S17 https://www.twilio.com/en-us/guidelines/in/sms ; https://www.twilio.com/docs/verify/verify-countries-and-regions-deliverability
- S18 https://trai.gov.in/advice-to-senders
- S18b TRAI Direction of 20.08.2024 on misuse of headers and content templates: https://www.trai.gov.in/sites/default/files/2024-09/Direction_20082024.pdf (para 10(b), 10(c)) ; list at https://www.trai.gov.in/release-publication/directions
- S19 https://trai.gov.in/government-entities ; TCCCPR 2018 text: https://www.trai.gov.in/sites/default/files/2024-09/RegulationUcc19072018.pdf (search excerpt only, not read in full)
- S20 https://www.infobip.com/docs/essentials/asia-registration/dlt-registration ; https://developer.exotel.com/docs/sms-support/dlt-entity-registration (vendors, secondary)
- S21 DPDP Act 2023: https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf (ss. 5, 6, 8, 9, 12, 17)
- S22 DPDP Rules 2025, G.S.R. 846(E): https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf (rr. 1, 3, 6-10, 14, Third Schedule)
- S22b PIB backgrounder and release: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf ; https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014
- S23 OWASP ASVS 5.0: https://github.com/OWASP/ASVS/blob/master/5.0/en/0x15-V6-Authentication.md ; .../0x16-V7-Session-Management.md ; .../0x12-V3-Web-Frontend-Security.md
- S24 https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- S24b https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- S25 https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- S26 https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- S27 https://www.twilio.com/docs/verify/preventing-toll-fraud
- S28 https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- S29 https://firebase.google.com/docs/auth/admin/verify-id-tokens

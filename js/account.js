// Viewers' sign-in: a "Sign in" button at the end of the navbar opens a window to sign in with Google or with
// a 6-digit code sent to your email. Signed in, the button shows the viewer's initial and opens their
// account: change the name shown on ratings, download their data, sign out (here or on every device), or
// delete the account. Public pages only, and only when the server has a sign-in method set up.
//
// openSignIn(reason) opens the window from anywhere; api() in data.js calls it when the server answers
// "sign in first". After signing in or out the page reloads, so every rating and comment shows as yours.
const ME = ONLINE ? MANA_SERVER.me || null : null;
const SIGN_IN = ONLINE ? MANA_SERVER.signIn || {} : {};
const SIGN_IN_ON = Boolean(SIGN_IN.google || SIGN_IN.email);
const PENDING_KEY = "manaPendingRating";   // a rating started before signing in, put back after the reload

const acIcon = name => `<i data-lucide="${name}"></i>`;
const acInitials = name => String(name).trim().split(/\s+/).map(w => w.match(/\p{L}/u)?.[0] || "").filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

let openSignIn = () => {};
let openAccount = () => {};

(function buildAccount() {
  const nav = document.querySelector(".nav-inner");
  if (!ONLINE || !SIGN_IN_ON || !nav || nav.classList.contains("admin-top")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = ME ? "icon-btn account-btn is-in" : "btn btn-ghost btn-sm account-btn";
  btn.id = "accountBtn";
  btn.setAttribute("aria-haspopup", "dialog");
  if (ME) {
    btn.setAttribute("aria-label", `Your account: ${ME.name}`);
    btn.title = ME.name;
    btn.innerHTML = `<span aria-hidden="true">${esc(acInitials(ME.name))}</span>`;
  } else {
    btn.innerHTML = `<i data-lucide="user-round"></i><span>Sign in</span>`;
  }
  nav.appendChild(btn);

  const dialog = document.createElement("dialog");
  dialog.className = "account-dialog";
  dialog.id = "accountDialog";
  document.body.appendChild(dialog);
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => document.documentElement.classList.remove("search-open"));
  const show = () => {
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add("search-open");   // stops the page scrolling behind
    icons();
  };
  const head = title => `
    <div class="account-head">
      <h2 id="accountTitle">${esc(title)}</h2>
      <button type="button" class="search-close" data-act="close" aria-label="Close">${acIcon("x")}</button>
    </div>`;
  dialog.setAttribute("aria-labelledby", "accountTitle");
  dialog.addEventListener("click", e => { if (e.target.closest('[data-act="close"]')) dialog.close(); });

  const NOTICE = `
    <details class="account-notice">
      <summary>How we use your details</summary>
      <p>We keep your name and your email address, in our own database. We use them only to run your account,
      send your sign-in codes and keep ratings to one per person.
      We don't sell or share them, and we don't send marketing. You can download or delete your account and
      everything you posted at any time from the account menu. Accounts are for people aged 18 or over.
      <a href="privacy.html" class="text-link">Read the full privacy notice</a>.</p>
    </details>
    <p class="fine-print">By continuing you agree to the <a href="privacy.html" class="text-link">privacy notice</a>.</p>`;

  // ---------- Signing in ----------
  openSignIn = (reason = "") => {
    if (ME) return openAccount();
    dialog.innerHTML = `
      ${head("Sign in to MANA CINEMA")}
      <div class="account-body">
        <p class="account-lead">${esc(reason || "Sign in to rate films and comment.")} One account, one rating per film, so the scores stay fair.</p>
        ${SIGN_IN.google ? `<div class="gsi-slot" id="gsiSlot"><p class="muted">Loading Google sign-in…</p></div>` : ""}
        ${SIGN_IN.google && SIGN_IN.email ? `<p class="account-or"><span>or get a code by email</span></p>` : ""}
        ${SIGN_IN.email ? `
          <form class="code-form" id="codeForm" novalidate>
            <div class="field" id="emailStep">
              <label for="emailInput">Email address</label>
              <input id="emailInput" type="email" inputmode="email" autocomplete="email" maxlength="200" placeholder="name@gmail.com" spellcheck="false" aria-describedby="signinError">
            </div>
            <div class="field" id="codeStep" hidden>
              <label for="codeInput">6-digit code sent to <span id="codeTo"></span></label>
              <input id="codeInput" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" aria-describedby="signinError codeHint">
              <p class="fine-print" id="codeHint">Not there? Check your spam folder. The code works for 10 minutes.</p>
              <p class="code-links">
                <button type="button" class="cm-btn" id="resendBtn" disabled>Resend code</button>
                <button type="button" class="cm-btn" id="changeEmail">Use another email</button>
              </p>
            </div>
            <p class="form-error" id="signinError" role="alert"></p>
            <button class="btn btn-primary btn-block" type="submit" id="codeSubmit">Email me a code</button>
            ${SIGN_IN.email.test ? `<p class="fine-print">Test mode: no email is sent. The code is printed in the server window.</p>` : ""}
          </form>` : ""}
        ${NOTICE}
      </div>`;
    show();
    if (SIGN_IN.google) mountGoogle();
    if (SIGN_IN.email) wireEmail();
    else dialog.querySelector("#gsiSlot")?.focus();
  };

  const signedIn = res => {
    if (res.created) return askName(res.user);
    toast(`Signed in as ${res.user.name}`);
    location.reload();
  };
  const fail = message => {
    const el = dialog.querySelector("#signinError") || dialog.querySelector(".gsi-error");
    if (el) el.textContent = message;
    else toast(message);
  };

  // Google's own button (Google Identity Services), loaded only when the window opens
  let gsiLoading = null;
  const loadGsi = () => gsiLoading || (gsiLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { gsiLoading = null; reject(new Error("Couldn't load Google sign-in. Check your connection, or get a code by email.")); };
    document.head.appendChild(s);
  }));

  async function mountGoogle() {
    const slot = dialog.querySelector("#gsiSlot");
    try {
      const [{ nonce }] = await Promise.all([api("auth/nonce"), loadGsi()]);
      if (!slot.isConnected) return;
      google.accounts.id.initialize({
        client_id: SIGN_IN.google,
        nonce,
        ux_mode: "popup",
        itp_support: true,
        callback: async ({ credential }) => {
          try { signedIn(await api("auth/google", { method: "POST", body: { credential } })); }
          catch (err) { slot.querySelector(".gsi-error").textContent = err.message; mountGoogle(); }
        },
      });
      slot.innerHTML = `<div id="gsiButton"></div><p class="form-error gsi-error" role="alert"></p>`;
      google.accounts.id.renderButton(slot.querySelector("#gsiButton"), {
        type: "standard", theme: "filled_black", size: "large", shape: "pill", text: "continue_with",
        width: Math.min(360, slot.clientWidth || 320), logo_alignment: "left",
      });
    } catch (err) {
      if (slot.isConnected) slot.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    }
  }

  // Email code: type your address, get a 6-digit code, type it in
  function wireEmail() {
    const form = dialog.querySelector("#codeForm");
    const email = form.querySelector("#emailInput"), code = form.querySelector("#codeInput");
    const submit = form.querySelector("#codeSubmit"), resend = form.querySelector("#resendBtn");
    let sentTo = "", timer = 0;
    const step = codeStep => {
      form.querySelector("#emailStep").hidden = codeStep;
      form.querySelector("#codeStep").hidden = !codeStep;
      submit.textContent = codeStep ? "Verify and sign in" : "Email me a code";
      (codeStep ? code : email).focus();
    };
    const countdown = seconds => {
      clearInterval(timer);
      let left = seconds;
      const tick = () => {
        resend.disabled = left > 0;
        resend.textContent = left > 0 ? `Resend code in ${left}s` : "Resend code";
        if (left-- <= 0) clearInterval(timer);
      };
      tick();
      timer = setInterval(tick, 1000);
    };
    const send = async address => {
      fail("");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error("Enter your email address, like name@gmail.com.");
      const res = await api("auth/email/start", { method: "POST", body: { email: address } });
      sentTo = address;
      form.querySelector("#codeTo").textContent = address;
      code.value = "";
      step(true);
      countdown(res.resendIn || 60);
    };
    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        if (form.querySelector("#codeStep").hidden) await send(email.value.trim());
        else signedIn(await api("auth/email/verify", { method: "POST", body: { email: sentTo, code: code.value } }));
      } catch (err) {
        fail(err.message);
      } finally {
        submit.disabled = false;
      }
    });
    code.addEventListener("input", () => {
      code.value = code.value.replace(/\D/g, "").slice(0, 6);
      if (code.value.length === 6) form.requestSubmit();
    });
    resend.addEventListener("click", async () => {
      try { await send(sentTo); toast("A new code is on its way"); } catch (err) { fail(err.message); }
    });
    form.querySelector("#changeEmail").addEventListener("click", () => { clearInterval(timer); fail(""); step(false); });
    dialog.addEventListener("close", () => clearInterval(timer), { once: true });
    email.focus();
  }

  // A new account: the name shown on its ratings and comments
  function askName(user) {
    dialog.innerHTML = `
      ${head("Welcome to MANA CINEMA")}
      <form class="account-body" id="nameForm" novalidate>
        <div class="field">
          <label for="nameInput">Name shown on your ratings and comments</label>
          <input id="nameInput" maxlength="40" autocomplete="nickname" value="${esc(user.name)}" aria-describedby="signinError">
        </div>
        <p class="form-error" id="signinError" role="alert"></p>
        <button class="btn btn-primary btn-block" type="submit">Continue</button>
      </form>`;
    show();
    const form = dialog.querySelector("#nameForm"), input = form.querySelector("#nameInput");
    input.select();
    form.addEventListener("submit", async e => {
      e.preventDefault();
      try {
        if (input.value.trim() !== user.name) await api("me", { method: "PATCH", body: { name: input.value } });
        location.reload();
      } catch (err) { fail(err.message); }
    });
    dialog.addEventListener("close", () => location.reload(), { once: true });
  }

  // ---------- The account ----------
  openAccount = () => {
    if (!ME) return openSignIn();
    const how = `${ME.method === "google" ? "Google" : "Email code"}${ME.email ? ` · ${ME.email}` : ""}`;
    dialog.innerHTML = `
      ${head("Your account")}
      <div class="account-body">
        <div class="account-who">
          <span class="cm-avatar" aria-hidden="true">${esc(acInitials(ME.name))}</span>
          <div><strong>${esc(ME.name)}</strong><small>${esc(how)}</small></div>
        </div>
        ${ME.blocked ? `<p class="form-error">Your account can't post ratings or comments. Use the feedback form if you think this is a mistake.</p>` : ""}
        <form id="renameForm" class="field" novalidate>
          <label for="renameInput">Name shown on your ratings and comments</label>
          <div class="inline-row">
            <input id="renameInput" maxlength="40" autocomplete="nickname" value="${esc(ME.name)}" aria-describedby="signinError">
            <button class="btn btn-ghost" type="submit">Save</button>
          </div>
        </form>
        <p class="form-error" id="signinError" role="alert"></p>
        <div class="account-actions">
          <a class="btn btn-ghost btn-block" href="api/me/export" download>${acIcon("download")}<span>Download my data</span></a>
          <button type="button" class="btn btn-ghost btn-block" data-act="signout">${acIcon("log-out")}<span>Sign out</span></button>
          <button type="button" class="btn btn-ghost btn-block" data-act="everywhere">${acIcon("monitor-smartphone")}<span>Sign out on every device</span></button>
        </div>
        <details class="account-danger">
          <summary>Delete my account</summary>
          <p>This deletes your account, your ratings, your comments (with their replies) and your likes. It can't be undone.</p>
          <form id="deleteForm" novalidate>
            <label for="deleteInput">Type DELETE to confirm</label>
            <div class="inline-row">
              <input id="deleteInput" autocomplete="off" spellcheck="false">
              <button class="btn btn-danger" type="submit">Delete</button>
            </div>
          </form>
        </details>
      </div>`;
    show();
    dialog.querySelector("#renameForm").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        await api("me", { method: "PATCH", body: { name: dialog.querySelector("#renameInput").value } });
        toast("Name saved");
        location.reload();
      } catch (err) { fail(err.message); }
    });
    for (const [act, everywhere] of [["signout", false], ["everywhere", true]]) {
      dialog.querySelector(`[data-act="${act}"]`).addEventListener("click", async () => {
        try { await api("auth/signout", { method: "POST", body: { everywhere } }); location.reload(); }
        catch (err) { fail(err.message); }
      });
    }
    dialog.querySelector("#deleteForm").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        await api("me", { method: "DELETE", body: { confirm: dialog.querySelector("#deleteInput").value.trim() } });
        toast("Your account is deleted");
        location.reload();
      } catch (err) { fail(err.message); }
    });
  };

  btn.addEventListener("click", () => (ME ? openAccount() : openSignIn()));
})();

// A rating typed before signing in: kept for this tab until the page is back, then put back in the form
function keepPendingRating(movieId, data) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ movieId: Number(movieId), ...data })); } catch {}
}
function takePendingRating(movieId) {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
    if (!p || p.movieId !== Number(movieId)) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return p;
  } catch { return null; }
}

// src/client/identity/render.ts
function shell(content, surface) {
  return `<div class="identity-shell surface" data-surface="${surface}">${content}</div>`;
}
function headerChrome(signedIn) {
  if (signedIn) {
    return `<header class="identity-header"><span class="identity-brand">Riffle Poker</span></header>`;
  }
  return `<header class="identity-header">
    <span class="identity-brand">Riffle Poker</span>
    <nav class="identity-nav" aria-label="Account">
      <a class="identity-link" href="/sign-in">Sign in</a>
      <a class="identity-link identity-link-accent" href="/sign-up">Create account</a>
    </nav>
  </header>`;
}
function renderEntryPage() {
  return shell(
    `${headerChrome(false)}
    <main class="identity-main">
      <h1 class="surface-title">Play poker on Riffle</h1>
      <p class="surface-copy">Choose how you want to start.</p>
      <div class="identity-actions">
        <a class="identity-button identity-button-primary" href="/sign-in">Sign in</a>
        <a class="identity-button" href="/sign-up">Create account</a>
        <button type="button" class="identity-button identity-button-text" id="identity-play-without-account">Play without account</button>
      </div>
    </main>`,
    "entry"
  );
}
function renderSignedInPage(context) {
  const detail = context.kind === "account" && context.email ? `<p class="identity-signed-in-email">${escapeText(context.email)}</p>` : "";
  return shell(
    `${headerChrome(true)}
    <main class="identity-main">
      <h1 class="surface-title">Signed in</h1>
      ${detail}
      <p class="surface-copy">You are ready to play when a table is available.</p>
      <button type="button" class="identity-button" id="identity-sign-out">Sign out</button>
    </main>`,
    "signed-in"
  );
}
function renderSignInPage(options) {
  const emailError = options?.emailError ? `<p class="field-error" id="sign-in-email-error" role="alert">${escapeText(options.emailError)}</p>` : "";
  const emailDescribedBy = options?.emailError ? ' aria-describedby="sign-in-email-error"' : "";
  const formError = options?.formError ? `<div class="form-alert" role="alert" aria-live="assertive">${escapeText(options.formError)}</div>` : "";
  const submitLabel = options?.submitting ? "Signing in\u2026" : "Sign in";
  const disabled = options?.submitting ? " disabled" : "";
  return shell(
    `${headerChrome(false)}
    <main class="identity-main identity-form-main">
      <h1 class="surface-title">Sign in</h1>
      ${formError}
      <form class="identity-form" id="identity-sign-in-form" novalidate>
        <div class="field">
          <label class="field-label" for="sign-in-email">Email</label>
          <input class="field-input" id="sign-in-email" name="email" type="email" autocomplete="email" value="${escapeAttr(options?.email ?? "")}"${emailDescribedBy}${disabled} />
          ${emailError}
        </div>
        <div class="field">
          <label class="field-label" for="sign-in-password">Password</label>
          <input class="field-input" id="sign-in-password" name="password" type="password" autocomplete="current-password"${disabled} />
        </div>
        <button type="submit" class="identity-button identity-button-primary"${disabled}>${submitLabel}</button>
      </form>
    </main>`,
    "sign-in"
  );
}
function renderSignUpPage(options) {
  const emailError = options?.emailError ? `<p class="field-error" id="sign-up-email-error" role="alert">${escapeText(options.emailError)}</p>` : "";
  const passwordError = options?.passwordError ? `<p class="field-error" id="sign-up-password-error" role="alert">${escapeText(options.passwordError)}</p>` : "";
  const confirmPasswordError = options?.confirmPasswordError ? `<p class="field-error" id="sign-up-confirm-password-error" role="alert">${escapeText(options.confirmPasswordError)}</p>` : "";
  const emailDescribedBy = options?.emailError ? ' aria-describedby="sign-up-email-error"' : "";
  const passwordDescribedBy = options?.passwordError ? ' aria-describedby="sign-up-password-error"' : "";
  const confirmDescribedBy = options?.confirmPasswordError ? ' aria-describedby="sign-up-confirm-password-error"' : "";
  const formError = options?.formError ? `<div class="form-alert" role="alert" aria-live="assertive">${escapeText(options.formError)}</div>` : "";
  const submitLabel = options?.submitting ? "Creating account\u2026" : "Create account";
  const disabled = options?.submitting ? " disabled" : "";
  return shell(
    `${headerChrome(false)}
    <main class="identity-main identity-form-main">
      <h1 class="surface-title">Create account</h1>
      ${formError}
      <form class="identity-form" id="identity-sign-up-form" novalidate>
        <div class="field">
          <label class="field-label" for="sign-up-email">Email</label>
          <input class="field-input" id="sign-up-email" name="email" type="email" autocomplete="email" value="${escapeAttr(options?.email ?? "")}"${emailDescribedBy}${disabled} />
          ${emailError}
        </div>
        <div class="field">
          <label class="field-label" for="sign-up-password">Password</label>
          <input class="field-input" id="sign-up-password" name="password" type="password" autocomplete="new-password"${passwordDescribedBy}${disabled} />
          ${passwordError}
        </div>
        <div class="field">
          <label class="field-label" for="sign-up-confirm-password">Confirm password</label>
          <input class="field-input" id="sign-up-confirm-password" name="confirmPassword" type="password" autocomplete="new-password"${confirmDescribedBy}${disabled} />
          ${confirmPasswordError}
        </div>
        <button type="submit" class="identity-button identity-button-primary"${disabled}>${submitLabel}</button>
      </form>
    </main>`,
    "sign-up"
  );
}
function escapeText(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function escapeAttr(value) {
  return escapeText(value);
}

// src/client/identity/session.ts
var IDENTITY_SESSION_KEY = "riffle.identity.session";
function readStoredSession() {
  const raw = window.sessionStorage.getItem(IDENTITY_SESSION_KEY);
  if (!raw) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.bearer === "string" && parsed.bearer.length > 0 && typeof parsed.playerSubject === "string" && parsed.playerSubject.length > 0) {
      return parsed;
    }
  } catch {
    return void 0;
  }
  return void 0;
}
function writeStoredSession(session) {
  window.sessionStorage.setItem(IDENTITY_SESSION_KEY, JSON.stringify(session));
}
function clearStoredSession() {
  window.sessionStorage.removeItem(IDENTITY_SESSION_KEY);
}
function identityAuthHeaders() {
  const session = readStoredSession();
  if (!session) {
    return { "Content-Type": "application/json" };
  }
  return {
    Authorization: `Bearer ${session.bearer}`,
    "Content-Type": "application/json"
  };
}

// src/client/identity.ts
var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function mountRoot() {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Missing #app root");
  }
  return root;
}
function setHtml(root, html) {
  root.innerHTML = html;
}
function isValidEmail(value) {
  const email = value.trim().toLowerCase();
  return email.length > 0 && EMAIL_PATTERN.test(email);
}
async function fetchSession() {
  const response = await fetch("/v1/identity/session", {
    headers: identityAuthHeaders()
  });
  if (!response.ok) {
    return void 0;
  }
  return await response.json();
}
async function persistIssue(result, kind, email) {
  writeStoredSession({
    bearer: result.bearer,
    playerSubject: result.playerSubject,
    kind,
    email
  });
  window.location.assign("/");
}
async function issueAnonymous() {
  const response = await fetch("/v1/identity/anonymous", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  if (!response.ok) {
    return;
  }
  const body = await response.json();
  await persistIssue(body, "anonymous");
}
async function signOut() {
  await fetch("/v1/identity/sign-out", {
    method: "POST",
    headers: identityAuthHeaders()
  });
  clearStoredSession();
  window.location.assign("/");
}
function wireEntry(root) {
  root.querySelector("#identity-play-without-account")?.addEventListener("click", () => {
    void issueAnonymous();
  });
}
function wireSignedIn(root) {
  root.querySelector("#identity-sign-out")?.addEventListener("click", () => {
    void signOut();
  });
}
function wireSignIn(root) {
  const form = root.querySelector("#identity-sign-in-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleSignIn(root, form);
  });
}
async function handleSignIn(root, form) {
  const emailInput = form.querySelector("#sign-in-email");
  const passwordInput = form.querySelector("#sign-in-password");
  const email = emailInput.value;
  const password = passwordInput.value;
  if (!isValidEmail(email)) {
    setHtml(root, renderSignInPage({ email, emailError: "Enter a valid email address." }));
    wireSignIn(root);
    return;
  }
  setHtml(root, renderSignInPage({ email, submitting: true }));
  wireSignIn(root);
  const response = await fetch("/v1/identity/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (response.ok) {
    const body = await response.json();
    await persistIssue(body, "account", email.trim().toLowerCase());
    return;
  }
  setHtml(
    root,
    renderSignInPage({
      email,
      formError: "Incorrect email or password."
    })
  );
  wireSignIn(root);
}
function wireSignUp(root) {
  const form = root.querySelector("#identity-sign-up-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleSignUp(root, form);
  });
}
async function handleSignUp(root, form) {
  const emailInput = form.querySelector("#sign-up-email");
  const passwordInput = form.querySelector("#sign-up-password");
  const confirmInput = form.querySelector("#sign-up-confirm-password");
  const email = emailInput.value;
  const password = passwordInput.value;
  const confirmPassword = confirmInput.value;
  if (!isValidEmail(email)) {
    setHtml(root, renderSignUpPage({ email, emailError: "Enter a valid email address." }));
    wireSignUp(root);
    return;
  }
  if (password !== confirmPassword) {
    setHtml(
      root,
      renderSignUpPage({
        email,
        passwordError: "Passwords must match.",
        confirmPasswordError: "Passwords must match."
      })
    );
    wireSignUp(root);
    return;
  }
  setHtml(root, renderSignUpPage({ email, submitting: true }));
  wireSignUp(root);
  const response = await fetch("/v1/identity/sign-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (response.ok) {
    const body = await response.json();
    await persistIssue(body, "account", email.trim().toLowerCase());
    return;
  }
  setHtml(
    root,
    renderSignUpPage({
      email,
      formError: "Could not create account. Try again."
    })
  );
  wireSignUp(root);
}
async function bootstrapIdentity() {
  const root = mountRoot();
  const path = window.location.pathname;
  if (path === "/sign-in") {
    setHtml(root, renderSignInPage());
    wireSignIn(root);
    return;
  }
  if (path === "/sign-up") {
    setHtml(root, renderSignUpPage());
    wireSignUp(root);
    return;
  }
  const stored = readStoredSession();
  if (stored) {
    const session = await fetchSession();
    if (session) {
      setHtml(root, renderSignedInPage({ kind: session.kind, email: session.email }));
      wireSignedIn(root);
      return;
    }
    clearStoredSession();
  }
  setHtml(root, renderEntryPage());
  wireEntry(root);
}
void bootstrapIdentity();

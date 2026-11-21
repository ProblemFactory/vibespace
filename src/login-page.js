'use strict';
// THE SIGN-IN PAGE (moved verbatim out of src/auth.js by the separation's B3b-1, 主开发 r1517): ONE page for both holders of the
// sign-in table — the plain form's hub and the piped form's interface serve the same words. PURE but for the words module.
const { LOGIN_WORDS, loginWords } = require('./login-words.js'); // lane ui-language: the sign-in page's words, whole in en / zh / ja

/**
 * The login page. Password form when a password is set; Clerk SSO section
 * when Clerk is configured (either alone or alongside the password). The
 * ClerkJS bundle is served from the instance's own Clerk frontend-API host.
 * SSO flow: button → Clerk hosted sign-in (redirect back here) → on load with
 * a live Clerk session, auto-exchange the session JWT at /api/clerk-login →
 * our cookie. A 403 (email not allowed / missing claim) offers an SSO
 * sign-out link so the user can retry with a different account.
 */
function loginHtml({ clerk = null, passwordEnabled = true, held = null, nonce = '', lang = 'en' } = {}) {
  const clerkOn = !!clerk?.enabled;
  // lane ui-language (the walk's first-run-3): the page's words in the browser's language (src/login-words.js); its script
  // re-applies this device's own choice below — the app's per-device rule (localStorage `vibespace.lang`)
  const W = loginWords(lang);
  const e = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sub = passwordEnabled ? W.subPassword : W.subSso;
  return `<!DOCTYPE html>
<html lang="${e(lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja' : 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(W.title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0f1115; color:#e2e5ea; font-family:-apple-system,'Segoe UI',Roboto,sans-serif; }
  .card { background:#161a21; border:1px solid #262c37; border-radius:12px; padding:36px 40px;
          width:320px; box-shadow:0 12px 40px rgba(0,0,0,.5); }
  h1 { margin:0 0 4px; font-size:20px; letter-spacing:.3px; }
  p  { margin:0 0 22px; font-size:12px; color:#8a93a3; }
  input { width:100%; box-sizing:border-box; padding:10px 12px; font-size:14px; border-radius:8px;
          border:1px solid #2b3341; background:#0d1015; color:#e2e5ea; outline:none; }
  input:focus { border-color:#2dd4bf; }
  button { width:100%; margin-top:14px; padding:10px; font-size:14px; font-weight:600; border:none;
           border-radius:8px; background:#2dd4bf; color:#042f2a; cursor:pointer; }
  button:hover { background:#575af0; }
  button.sso { background:#3b4252; color:#e2e5ea; }
  button.sso:hover { background:#4c566a; }
  .or { display:flex; align-items:center; gap:10px; margin:16px 0 2px; color:#5b6270; font-size:11px; }
  .or::before, .or::after { content:''; flex:1; height:1px; background:#262c37; }
  .err { color:#f87171; font-size:12px; min-height:16px; margin-top:10px; }
  .err a { color:#8a93a3; }
  .held { color:#fbbf24; font-size:13px; }
</style></head>
<body><form class="card" id="f">
  <h1>VibeSpace</h1>
  <p data-w="${passwordEnabled ? 'subPassword' : 'subSso'}">${e(sub)}</p>
  ${held ? `<p class="held" data-w="signin-held-sso">${e(W['signin-held-sso'])}</p><p class="held" data-w="signin-held-sso-fix">${e(W['signin-held-sso-fix'])}</p>` : ''}
  ${passwordEnabled ? `
  <input type="password" id="pw" placeholder="${e(W.password)}" data-w-ph="password" autofocus autocomplete="current-password">
  <button type="submit" data-w="signIn">${e(W.signIn)}</button>` : ''}
  ${clerkOn ? `${passwordEnabled ? `<div class="or" data-w="or">${e(W.or)}</div>` : ''}
  <button type="button" class="sso" id="sso" disabled>${e(W.ssoLoading)}</button>` : ''}
  <div class="err" id="err"></div>
</form>
<script nonce="${nonce}">
  // the device's own language wins over the browser's ask (the app's rule); the words are the page's own table
  const ALL = ${JSON.stringify(LOGIN_WORDS).replace(/</g, '\\u003c')};
  const LANG = (() => { let p = null; try { p = localStorage.getItem('vibespace.lang'); } catch {} const n = (navigator.language || '').toLowerCase();
    return p && p !== 'auto' && ['en', 'zh', 'ja'].includes(p) ? p : n.startsWith('zh') ? 'zh' : n.startsWith('ja') ? 'ja' : 'en'; })();
  const w = (k) => (ALL[k] && (ALL[k][LANG] || ALL[k].en)) || k;
  if (LANG !== ${JSON.stringify(lang)}) {
    document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : LANG; document.title = w('title');
    for (const el of document.querySelectorAll('[data-w]')) el.textContent = w(el.dataset.w);
    for (const el of document.querySelectorAll('[data-w-ph]')) el.placeholder = w(el.dataset.wPh);
    const sb = document.getElementById('sso'); if (sb) sb.textContent = w('ssoLoading');
  }
  const err = document.getElementById('err');
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwEl = document.getElementById('pw');
    if (!pwEl) return;
    err.textContent = '';
    try {
      const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ password: pwEl.value }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) location.href = '/';
      else err.textContent = d.code && ALL[d.code] ? w(d.code) : (d.error || w('loginFailed'));
    } catch { err.textContent = w('network'); }
  });
  ${clerkOn ? `
  (() => {
    const PK = ${JSON.stringify(clerk.publishableKey)};
    const ssoBtn = document.getElementById('sso');
    const s = document.createElement('script');
    s.src = ${JSON.stringify(`https://${clerk.frontendApi}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`)};
    s.async = true;
    s.crossOrigin = 'anonymous';
    // clerk-js v5 from the CDN self-bootstraps window.Clerk as an INSTANCE
    // using this attribute ("window.Clerk is not a constructor" without it).
    s.setAttribute('data-clerk-publishable-key', PK);
    s.onerror = () => { ssoBtn.textContent = w('ssoUnavailable'); };
    s.onload = async () => {
      try {
        // Instance (v5 CDN) or constructor (older builds) — accept both.
        const clerk = typeof window.Clerk === 'function' ? new window.Clerk(PK) : window.Clerk;
        await clerk.load({ standardBrowser: true });
        const exchange = async () => {
          ssoBtn.disabled = true;
          ssoBtn.textContent = w('signingIn');
          let token = null;
          // Prefer a "vibespace" JWT template (guaranteed email claim); fall
          // back to the plain session token (works when the dashboard adds
          // email to the session token's custom claims).
          try { token = await clerk.session.getToken({ template: 'vibespace' }); } catch {}
          if (!token) token = await clerk.session.getToken();
          const r = await fetch('/api/clerk-login', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ token }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok) { location.href = '/'; return; }
          ssoBtn.disabled = false;
          ssoBtn.textContent = w('ssoSignIn');
          err.innerHTML = '';
          err.appendChild(document.createTextNode(d.code && ALL[d.code] ? w(d.code) : (d.error || w('ssoFailed'))));
          const out = document.createElement('a');
          out.href = '#'; out.textContent = ' ' + w('switchAccount');
          out.onclick = (e) => { e.preventDefault(); clerk.signOut({ redirectUrl: location.href }); };
          err.appendChild(out);
        };
        if (clerk.user) { exchange(); }
        else {
          ssoBtn.disabled = false;
          ssoBtn.textContent = w('ssoSignIn');
          ssoBtn.onclick = () => clerk.redirectToSignIn({ redirectUrl: location.href });
        }
      } catch (e) { ssoBtn.textContent = w('ssoUnavailable'); err.textContent = String(e.message || e); }
    };
    document.head.appendChild(s);
  })();` : ''}
</script></body></html>`;
}

module.exports = { loginHtml };

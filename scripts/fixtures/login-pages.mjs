// FAKE LOGIN PAGES on loopback (lane vault-login-chrome) — never the real Google: the SHAPES of a one-step form, a
// Google-like two-step sign-in (an identifier view, then a password view behind a script "Next", then a two-step code
// page) and a React-like controlled form (a value tracker: a script's `.value =` is not an edit). Each page reports what
// it RECEIVED to this server (the suite reads `received()`), never to the page's own text.
import http from 'node:http';

const VALUE_TRACKER = `function track(el, onEdit) { // a React-like controlled input: the framework's tracker hears the element's own setter
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); let tracked = el.value;
  Object.defineProperty(el, 'value', { configurable: true, get() { return d.get.call(this); }, set(v) { tracked = String(v); d.set.call(this, v); } });
  el.addEventListener('input', () => { const v = d.get.call(el); if (v === tracked) return; tracked = v; onEdit(v); });
}`;
const page = (title, body, script = '') => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px sans-serif;margin:40px} input{display:block;margin:8px 0;padding:6px;width:280px;font:16px monospace} .btn{display:inline-block;padding:6px 14px;background:#1a73e8;color:#fff;cursor:pointer} [hidden]{display:none!important}</style></head><body>${body}<script>${script}</script></body></html>`;
const post = `function post(path, body) { return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }`;

const PAGES = {
  '/one': () => page('Sign in — one step', `<form id="f" method="post" action="/done/one"><label>User <input id="u" name="username" autocomplete="username"></label><label>Password <input id="p" type="password" name="password" autocomplete="current-password" minlength="4"></label><button type="submit">Sign in</button></form>`),
  '/two': () => page('Sign in – Google-like', `<div id="vid"><h1>Sign in</h1><input type="email" id="identifierId" name="identifier" autocomplete="username" aria-label="Email or phone" spellcheck="false"><div role="button" class="btn" id="idNext" tabindex="0">Next</div><div id="iderr" hidden>Enter an email or phone number</div></div>
<div id="vpw" hidden><h1>Welcome</h1><div id="who"></div><input type="password" name="Passwd" aria-label="Enter your password" autocomplete="current-password"><div role="button" class="btn" id="pwNext" tabindex="0">Next</div><div id="pwerr" hidden>Enter a password</div></div>`,
  `${VALUE_TRACKER}${post}
const st = { identifier: '', password: '' };
const idEl = document.getElementById('identifierId'), pwEl = document.querySelector('input[name=Passwd]');
track(idEl, (v) => { st.identifier = v; }); track(pwEl, (v) => { st.password = v; });
function idNext() { if (!st.identifier) { document.getElementById('iderr').hidden = false; post('/seen/two-id', { empty: true }); return; } post('/seen/two-id', { identifier: st.identifier }); document.getElementById('vid').hidden = true; document.getElementById('who').textContent = st.identifier; document.getElementById('vpw').hidden = false; history.pushState({}, '', '/two/challenge/pwd'); pwEl.focus(); }
function pwNext() { if (!st.password) { document.getElementById('pwerr').hidden = false; post('/seen/two-pw', { empty: true }); return; } post('/done/two', { identifier: st.identifier, Passwd: st.password }).then(() => { location.href = '/totp'; }); }
document.getElementById('idNext').addEventListener('click', idNext); document.getElementById('pwNext').addEventListener('click', pwNext);
idEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); idNext(); } });
pwEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); pwNext(); } });`),
  '/totp': () => page('2-Step Verification', `<h1>2-Step Verification</h1><input type="tel" id="totpPin" name="totpPin" autocomplete="one-time-code" inputmode="numeric" aria-label="Enter code" maxlength="8"><div role="button" class="btn" id="totpNext" tabindex="0">Next</div>`,
  `${VALUE_TRACKER}${post}
let code = ''; const el = document.getElementById('totpPin'); track(el, (v) => { code = v; });
function next() { post('/done/totp', { code }).then(() => { location.href = '/welcome'; }); }
document.getElementById('totpNext').addEventListener('click', next); el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } });`),
  '/react': () => page('Sign in — controlled', `<div><input id="ru" autocomplete="username" placeholder="Username"><input id="rp" type="password" autocomplete="current-password" placeholder="Password"><div role="button" class="btn" id="rgo">Log in</div></div>`,
  `${VALUE_TRACKER}${post}
const st = { u: '', p: '' }; track(document.getElementById('ru'), (v) => { st.u = v; }); track(document.getElementById('rp'), (v) => { st.p = v; });
function go() { post('/done/react', { username: st.u, password: st.p }).then(() => { location.href = '/welcome'; }); }
document.getElementById('rgo').addEventListener('click', go); document.getElementById('rp').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });`),
  '/plain': () => page('Nothing to sign in', '<p>No form here.</p><input id="q" placeholder="Search">'),
  '/welcome': () => page('Welcome', '<h1>Signed in</h1>'),
};

export function startLoginPages() {
  const got = [];
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST') {
      let b = ''; req.on('data', (d) => { b += d; if (b.length > 65536) req.destroy(); });
      req.on('end', () => {
        let body = {}; try { body = /json/.test(String(req.headers['content-type'])) ? JSON.parse(b || '{}') : Object.fromEntries(new URLSearchParams(b)); } catch { body = { raw: b }; }
        got.push({ path: url.pathname, body, at: Date.now() });
        if (url.pathname === '/done/one') { res.writeHead(303, { location: '/welcome' }); return res.end(); }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
      });
      return;
    }
    const p = PAGES[url.pathname.replace(/\/challenge\/pwd$/, '')];
    if (!p) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(p());
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ origin: `http://127.0.0.1:${srv.address().port}`, port: srv.address().port, received: () => got.slice(), clear: () => { got.length = 0; }, close: () => new Promise((r) => srv.close(() => r())) })));
}

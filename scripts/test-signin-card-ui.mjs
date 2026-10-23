#!/usr/bin/env node
// test-signin-card-ui — the humane sign-in CARD rendered for real (lane door-signin-card):
// the REAL src/lib/signin-card.js (esbuild-bundled for node, utils/i18n/icons stubbed, the PURE
// src/signin-model.js kept) driven over a lean DOM + a stub fetch + a stub WS, English. Covers the
// five card states, the paste-code flow, the finalize, and the chat's «Send my message again».
//   ① no-login → a «Sign in with Claude» button; starting creates a subscription then the sign-in
//   ② a url push → an «Open the sign-in page» link (href = the server URL, new tab) + a code box
//   ③ a pasted code → POST …/signin/code with exactly { code } (and nowhere else)
//   ④ connected → finalize (POST …/finalize); with a waiting message, «Send my message again» → onResend
//   ⑤ failed → the reason is shown + a Try again button
//   ⑥ a STALE snapshot (older rev of the same run) never repaints over a newer one
// THE VERIFY ROUND (lane door-signin-fixes — each leg below was RED on 959d583e):
//   ⑦ claim 4: closing the card mid-sign-in sends DELETE …/signin (keepalive) — also when it closes
//      while the start is in flight; a card whose sign-in ended sends nothing
//   ⑧ the page HOLDS its run over its socket (claude-signin-hold), again after a reconnect, and reads
//      what it missed (a run the hub ended while it was away shows the start button)
//   ⑨ claim 5: «Send my message again» sends ONCE (a later re-render offers no second press);
//      nothing waiting ⇒ «Connected», no button
//   ⑩ debris: «Try again» reuses the card's own never-signed-in account (ONE create over three
//      attempts; the create asks for the sign-in row); a reused account that is gone → one fresh
//   ⑪ claim 5: chat-view's waiting-text method (read off its source, run over _messages): an answered
//      history → nothing; a waiting turn with an image → its words; an image alone → nothing, never
//      an older turn; the CLI's own «Not logged in» record is not an answer
//   ⑫ claim 8: chat-view's exited branch run over a stub view — a local Claude death → the card; a
//      Codex or a remote-host death → the old terminal bar and its words
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = require('esbuild');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); if (info !== undefined) console.log('    ', JSON.stringify(info).slice(0, 400)); } };
const flush = () => new Promise((r) => setTimeout(r, 0));

const stubs = {
  'utils.js': `export const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    export const fetchJson = (...a) => globalThis.__fetchJson(...a);
    export const showToast = (...a) => { (globalThis.__toasts ||= []).push(a); };
    export const copyText = (s) => { globalThis.__copied = s; };`,
  'i18n.js': `export const t = (s, p) => { let x = String(s); if (p) x = x.replace(/\\{(\\w+)\\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)); return x; };`,
  'icons.js': `export const UI_ICONS = new Proxy({}, { get: () => '' });`,
};
const out = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/lib/signin-card.js')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\/(utils|i18n|icons)\.js$/ }, (a) => (a.importer.endsWith('signin-card.js') ? { path: path.basename(a.path), namespace: 'stub' } : null));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js', resolveDir: ROOT }));
  } }],
});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-signin-ui-'));
const bundle = path.join(tmp, 'signin-card.cjs');
fs.writeFileSync(bundle, out.outputFiles[0].text);
const { SignInCard } = require(bundle);

class Node {
  constructor() { this.listeners = {}; this.value = ''; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  fire(t, ev = {}) { for (const fn of this.listeners[t] || []) fn({ currentTarget: this, preventDefault() { }, ...ev }); }
  click() { if (!this.disabled) this.fire('click'); } // a real DOM never clicks a disabled button
}
class Host {
  constructor() { this._html = ''; this._nodes = {}; this.classList = { add() { }, remove() { }, contains: () => false }; }
  set innerHTML(v) {
    this._html = v; this._nodes = {};
    for (const m of v.matchAll(/data-act="([^"]+)"/g)) this._nodes['[data-act="' + m[1] + '"]'] = new Node();
    if (/signin-code-input/.test(v)) this._nodes['.signin-code-input'] = new Node();
  }
  get innerHTML() { return this._html; }
  querySelector(sel) { return this._nodes[sel] || null; }
}
function makeWs() { let cb = null; return { onGlobal: (fn) => { cb = fn; return () => { cb = null; }; }, push: (signin) => cb && cb({ type: 'claude-signin', signin }) }; }
function fetchStub(routes) { const calls = []; globalThis.__fetchJson = async (url, opts = {}) => { calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null }); return routes(url); }; return calls; }
const SIGNIN = (phase, extra = {}) => ({ accountId: 'acc-x', id: 'si-1', phase, rev: extra.rev || 1, url: extra.url || null, error: extra.error || null, email: extra.email || null, startedAt: 1 });
const URL = 'https://claude.ai/oauth/authorize?code=true&state=zz';

// ①②③④ the happy path with a waiting message
{
  let resent = 0;
  const calls = fetchStub((url) => {
    if (url === '/api/accounts/subscription') return { id: 'acc-x' };
    if (url === '/api/accounts/acc-x/signin') return { signin: SIGNIN('url', { url: URL, rev: 1 }) };
    if (url === '/api/accounts/acc-x/signin/code') return { signin: SIGNIN('connecting', { url: URL, rev: 2 }) };
    if (url === '/api/accounts/subscription/acc-x/finalize') return { loggedIn: true, email: 'me@co.example' };
    return { ok: true };
  });
  const ws = makeWs();
  const host = new Host();
  const card = new SignInCard({ ws, hasWaiting: () => true, onResend: () => { resent++; } });
  card.mount(host);
  ok(/Sign in with Claude/.test(host.innerHTML) && host.querySelector('[data-act="begin"]'), '① no-login shows a Sign in with Claude button', host.innerHTML.slice(0, 80));

  await card._begin();
  ok(calls.some((c) => c.url === '/api/accounts/subscription' && c.method === 'POST') && calls.some((c) => c.url === '/api/accounts/acc-x/signin' && c.method === 'POST'), '① begin creates a subscription then starts the sign-in', calls.map((c) => c.url));
  ok(/href="https:\/\/claude\.ai\/oauth/.test(host.innerHTML) && /target="_blank"/.test(host.innerHTML) && !!host.querySelector('.signin-code-input'), '② a url shows an Open-the-sign-in-page link + a code box', host.innerHTML.slice(0, 180));

  const codeNode = host.querySelector('.signin-code-input');
  if (codeNode) { codeNode.value = '  mycode#state  '; host.querySelector('[data-act="code"]').click(); await flush(); }
  const codeCall = calls.find((c) => c.url === '/api/accounts/acc-x/signin/code');
  ok(codeCall && codeCall.body && codeCall.body.code === 'mycode#state', '③ the pasted code (trimmed) is POSTed to …/signin/code', codeCall);

  ws.push(SIGNIN('connected', { rev: 3 }));
  await flush(); await flush();
  ok(calls.some((c) => c.url === '/api/accounts/subscription/acc-x/finalize'), '④ connected → finalize is called', calls.map((c) => c.url));
  ok(/Connected/.test(host.innerHTML) && /me@co\.example/.test(host.innerHTML), '④ the card shows Connected as the e-mail', host.innerHTML.slice(0, 160));
  const resend = host.querySelector('[data-act="resend"]');
  ok(!!resend, '④ a waiting message shows «Send my message again»', host.innerHTML.slice(0, 200));
  if (resend) resend.click();
  ok(resent === 1, '④ one press fires onResend (the chat re-sends the waiting turn)');
  ok(calls.filter((c) => JSON.stringify(c.body || {}).indexOf('mycode') >= 0).length === 1, '③ the code rides only the /signin/code request', calls.map((c) => c.body));
}

// ⑤ failed state
{
  fetchStub((url) => (url === '/api/accounts/subscription' ? { id: 'acc-x' } : url === '/api/accounts/acc-x/signin' ? { signin: SIGNIN('starting') } : { ok: true }));
  const ws = makeWs(); const host = new Host();
  const card = new SignInCard({ ws, hasWaiting: () => false });
  card.mount(host);
  await card._begin();
  ws.push(SIGNIN('failed', { error: 'OAuth error: the code was rejected', rev: 2 }));
  ok(/OAuth error: the code was rejected/.test(host.innerHTML) && !!host.querySelector('[data-act="begin"]'), '⑤ failed shows the reason + a Try again button', host.innerHTML.slice(0, 180));
}

// ⑥ a stale snapshot never repaints over a newer one
{
  fetchStub((url) => (url === '/api/accounts/subscription' ? { id: 'acc-x' } : url === '/api/accounts/acc-x/signin' ? { signin: SIGNIN('url', { url: URL, rev: 5 }) } : { ok: true }));
  const ws = makeWs(); const host = new Host();
  const card = new SignInCard({ ws, hasWaiting: () => false });
  card.mount(host);
  await card._begin();
  const before = host.innerHTML;
  ws.push(SIGNIN('starting', { rev: 2 })); // an older publication of the same run
  ok(host.innerHTML === before && /signin-code-input/.test(host.innerHTML), '⑥ an older-rev snapshot of the same run is ignored (no repaint back to starting)', host.innerHTML.slice(0, 80));
}

// ── THE VERIFY ROUND (lane door-signin-fixes — each leg below was RED on 959d583e) ──
const leg = async (name, fn) => { try { await fn(); } catch (e) { fail++; console.log('  ✗ ' + name + ' — threw: ' + String((e && e.message) || e).slice(0, 200)); } };
const flush3 = async () => { await flush(); await flush(); await flush(); };
// a WS stub that also takes sends and state listeners (the reconnect road)
function makeWs2() { let cb = null; const sent = [], states = []; return { sent, onGlobal: (fn) => { cb = fn; return () => { cb = null; }; }, push: (signin) => cb && cb({ type: 'claude-signin', signin }), send: (m) => sent.push(m), onStateChange: (h) => states.push(h), offStateChange: (h) => { const i = states.indexOf(h); if (i >= 0) states.splice(i, 1); }, reconnect: () => states.slice().forEach((h) => h(true)), get live() { return !!cb; } }; }
function fetchStub2(routes) { const calls = []; globalThis.__fetchJson = async (url, opts = {}) => { calls.push({ url, method: opts.method || 'GET', keepalive: !!opts.keepalive, body: opts.body ? JSON.parse(opts.body) : null }); await flush(); return routes(url, opts); }; return calls; }
const happy = (url, opts) => (url === '/api/accounts/subscription' ? { id: 'acc-x' } : url === '/api/accounts/acc-x/signin' && opts.method === 'POST' ? { signin: SIGNIN('url', { url: URL, rev: 1 }) } : url === '/api/accounts/subscription/acc-x/finalize' ? { loggedIn: true, email: 'me@co.example' } : { ok: true });
const deletes = (calls) => calls.filter((c) => c.method === 'DELETE' && c.url === '/api/accounts/acc-x/signin');

// ⑦ claim 4 (client): closing the card ends its sign-in
await leg('⑦', async () => {
  const calls = fetchStub2(happy); const ws = makeWs2(); const host = new Host();
  const card = new SignInCard({ ws }); card.mount(host);
  host.querySelector('[data-act="begin"]').click(); await flush3();
  ok(/signin-code-input/.test(host.innerHTML), '⑦ (setup) the sign-in is running (url shown, the code box up)');
  card.destroy(); await flush();
  ok(!ws.live, '⑦ destroy unsubscribes the WS');
  const d = deletes(calls);
  ok(d.length === 1 && d[0].keepalive, '⑦ CLAIM 4: destroying the card mid-sign-in sends DELETE /api/accounts/:id/signin (keepalive)', calls.map((c) => c.method + ' ' + c.url));
  // CONTROL: a card whose sign-in already ended sends nothing
  const c2 = fetchStub2(happy); const ws2 = makeWs2(); const h2 = new Host();
  const card2 = new SignInCard({ ws: ws2 }); card2.mount(h2);
  await card2._begin(); ws2.push(SIGNIN('connected', { rev: 3 })); await flush3();
  card2.destroy(); await flush();
  ok(deletes(c2).length === 0, '⑦ CONTROL: a card closed after its sign-in ended sends no DELETE', c2.map((c) => c.method + ' ' + c.url));
  // closed while the start was in flight: the DELETE follows the start's answer
  const c3 = fetchStub2(happy); const h3 = new Host();
  const card3 = new SignInCard({ ws: makeWs2() }); card3.mount(h3);
  const p = card3._begin(); card3.destroy(); await p; await flush();
  ok(deletes(c3).length === 1, '⑦ a card closed while its sign-in was starting cancels it once the start answers', c3.map((c) => c.method + ' ' + c.url));
});

// ⑧ the page holds its run over its socket — again after a reconnect, and learns what it missed
await leg('⑧', async () => {
  let getAnswer = { signin: SIGNIN('url', { url: URL, rev: 1 }) };
  const calls = fetchStub2((url, opts) => (url === '/api/accounts/acc-x/signin' && (opts.method || 'GET') === 'GET' ? getAnswer : happy(url, opts)));
  const ws = makeWs2(); const host = new Host();
  const card = new SignInCard({ ws }); card.mount(host);
  await card._begin(); await flush();
  const holds = () => ws.sent.filter((m) => m && m.type === 'claude-signin-hold');
  ok(holds().length === 1 && holds()[0].accountId === 'acc-x' && holds()[0].id === 'si-1', '⑧ the started run is HELD over the page’s socket (claude-signin-hold {accountId, id})', ws.sent);
  getAnswer = { signin: SIGNIN('cancelled', { rev: 9 }) }; // the hub ended it while the page was away
  ws.reconnect(); await flush3();
  ok(holds().length === 2, '⑧ a reconnected socket holds it again', ws.sent);
  ok(calls.some((c) => c.method === 'GET' && c.url === '/api/accounts/acc-x/signin') && !!host.querySelector('[data-act="begin"]') && !host.querySelector('.signin-code-input'), '⑧ … and reads what it missed: a run ended while away shows the start button, not a dead code box', host.innerHTML.slice(0, 160));
  card.destroy();
  ws.reconnect(); await flush();
  ok(holds().length === 2, '⑧ a destroyed card holds nothing on a later reconnect');
});

// ⑨ claim 5 (the card): the re-send is pressed ONCE; nothing waiting ⇒ «Connected», no button
await leg('⑨', async () => {
  fetchStub2(happy); const ws = makeWs2(); const host = new Host(); let resent = 0;
  const card = new SignInCard({ ws, hasWaiting: () => true, onResend: () => { resent++; } }); card.mount(host);
  await card._begin(); ws.push(SIGNIN('connected', { rev: 3 })); await flush3();
  const r = host.querySelector('[data-act="resend"]');
  r.click(); r.click();
  ok(resent === 1, '⑨ a double press → ONE re-send', { resent });
  ws.push(SIGNIN('connected', { rev: 4 })); await flush(); // a later snapshot of the same run re-renders
  ok(!host.querySelector('[data-act="resend"]'), '⑨ a later re-render offers no second re-send', host.innerHTML.slice(0, 200));
  fetchStub2(happy); const ws2 = makeWs2(); const h2 = new Host();
  const card2 = new SignInCard({ ws: ws2, hasWaiting: () => false, onResend: () => { resent++; } }); card2.mount(h2);
  await card2._begin(); ws2.push(SIGNIN('connected', { rev: 3 })); await flush3();
  ok(/Connected/.test(h2.innerHTML) && !h2.querySelector('[data-act="resend"]'), '⑨ nothing waiting ⇒ the card says «Connected» with NO re-send button', h2.innerHTML.slice(0, 200));
});

// ⑩ debris (the card): «Try again» reuses the card's own never-signed-in account
await leg('⑩', async () => {
  const calls = fetchStub2(happy); const ws = makeWs2(); const host = new Host();
  const card = new SignInCard({ ws }); card.mount(host);
  for (let i = 0; i < 3; i++) {
    host.querySelector('[data-act="begin"]').click(); await flush3();
    ws.push(SIGNIN('failed', { error: 'OAuth error: the code was rejected', rev: 10 + i, id: 'si-' + i })); await flush();
  }
  const creates = calls.filter((c) => c.url === '/api/accounts/subscription');
  const starts = calls.filter((c) => c.url === '/api/accounts/acc-x/signin' && c.method === 'POST');
  ok(creates.length === 1 && starts.length === 3, '⑩ three attempts (Sign in + Try again ×2) → ONE account created, three sign-ins on it', { creates: creates.length, starts: starts.length });
  ok(creates[0] && creates[0].body && creates[0].body.signin === true, '⑩ the card asks for the sign-in row ({signin:true}: the server reuses an idle one too)', creates[0]);
  // the reused account is gone (swept) → a fresh one, once
  const c2 = fetchStub2((url, opts) => (url === '/api/accounts/acc-x/signin' && opts.method === 'POST' && c2.filter((c) => c.url === '/api/accounts/subscription').length === 0 ? { error: 'unknown account: acc-x', code: 'unknown_account' } : happy(url, opts)));
  host.querySelector('[data-act="begin"]').click(); await flush3();
  ok(c2.filter((c) => c.url === '/api/accounts/subscription').length === 1 && /signin-code-input/.test(host.innerHTML), '⑩ a reused account that is gone → ONE fresh account, the sign-in runs', c2.map((c) => c.method + ' ' + c.url));
});

// ⑪ claim 5 (the chat): what «Send my message again» re-sends — chat-view's own method, read off the source
const M = require(path.join(ROOT, 'src/signin-model.js'));
const CV = fs.readFileSync(path.join(ROOT, 'src/lib/chat-view.js'), 'utf8');
const methodBody = (name) => { const at = CV.indexOf('\n  ' + name + '() {'); if (at < 0) return null; let i = CV.indexOf('{', at), depth = 0; for (let j = i; j < CV.length; j++) { if (CV[j] === '{') depth++; else if (CV[j] === '}' && --depth === 0) return CV.slice(i + 1, j); } return null; };
await leg('⑪', async () => {
  const show = methodBody('_showSignInCard') || '';
  const name = (show.match(/this\._waitingText = this\.(\w+)\(\)/) || [])[1];
  const body = name && methodBody(name);
  ok(!!body, '⑪ (setup) the chat’s waiting-text method is read off _showSignInCard', name);
  const fn = new Function('waitingTurnOf', 'return function () {' + body + '}')(M.waitingTurnOf);
  const U = (text, extra = {}) => ({ role: 'user', typed: true, content: [{ type: 'text', text }], ...extra });
  const A = (text, extra = {}) => ({ role: 'assistant', content: [{ type: 'text', text }], meta: { model: 'claude-fable-5', usage: { input_tokens: 3, output_tokens: 2 } }, ...extra });
  const W = (msgs) => fn.call({ _messages: msgs });
  ok(W([U('deploy to prod'), A('Deployed.')]) === '', '⑪ CLAIM 5: an ANSWERED history (a resume that dies at boot) has nothing waiting — no re-send', W([U('deploy to prod'), A('Deployed.')]));
  const img = [U('rename these files'), A('ok'), { role: 'user', typed: true, content: [{ type: 'image', mediaType: 'image/png', data: 'AAAA' }, { type: 'text', text: 'what is in this picture?' }] }];
  ok(W(img) === 'what is in this picture?', '⑪ CLAIM 5: a waiting turn with an image → THAT turn’s words', W(img));
  const imgOnly = [U('rename these files'), A('ok'), { role: 'user', typed: true, content: [{ type: 'image', mediaType: 'image/png', data: 'AAAA' }] }];
  ok(W(imgOnly) === '', '⑪ CLAIM 5: a waiting turn of an image alone → nothing to re-send, NEVER an older message', W(imgOnly));
  ok(W([U('old'), A('done'), U('waiting one')]) === 'waiting one', '⑪ a waiting plain turn → that text');
  const refused = [U('old'), A('done'), U('waiting one'), { role: 'assistant', content: [{ type: 'text', text: 'Not logged in · Please run /login' }], meta: { model: null, usage: { input_tokens: 0, output_tokens: 0 } } }];
  ok(W(refused) === 'waiting one', '⑪ the CLI’s own «Not logged in» record is not an answer — the turn before it is still waiting', W(refused));
  const notes = [U('do x'), A('done'), { role: 'user', originKind: 'task-notification', content: [{ type: 'text', text: '<task-notification>…' }] }, { role: 'user', imageAttachment: true, synthetic: true, content: [{ type: 'image', data: 'B' }] }];
  ok(W(notes) === '', '⑪ a notification / the CLI’s page images after an answer are no waiting turn', W(notes));
  ok(W([A('hello')]) === '', '⑪ CONTROL: no user turn → nothing');
  ok(/_resendWaiting\(\) \{[\s\S]{0,700}this\._waitingText = ''/.test(CV), '⑪ the chat consumes the waiting text when it re-sends (sent once)');
});

// ⑫ claim 8: which wall a chat's «not logged in» gets — chat-view's own branch, run over a stub view
await leg('⑫', async () => {
  const at = CV.indexOf("if (msg.reason === 'not_logged_in'");
  const end = CV.indexOf('} else {\n          // Classified death detail', at);
  ok(at > 0 && end > at, '⑫ (setup) the exited branch is read off chat-view.js');
  const code = CV.slice(at, end) + '}';
  const CAPS = require(path.join(ROOT, 'src/backend-caps.js'));
  const wall = methodBody('_signinWall'); // the view's own verdict call (absent on a tree that has none)
  const run = (ids) => { const calls = []; const view = { _getSessionIds: () => ids, _setReadOnly: () => calls.push('readonly'), _showSignInCard: () => calls.push('card'), _showLoginBar: () => calls.push('terminal-bar'), _renderers: { appendSystem: (s) => calls.push('system: ' + s) } };
    if (wall) view._signinWall = new Function('signinWallOf', 'capsOf', 'return function () {' + wall + '}')(M.signinWallOf, CAPS.capsOf);
    new Function('msg', 't', code).call(view, { reason: 'not_logged_in' }, (s) => s); return calls; };
  const local = run({ backend: 'claude', host: null }), codex = run({ backend: 'codex', host: null }), remote = run({ backend: 'claude', host: 'h-remote' });
  ok(local.includes('card') && !local.includes('terminal-bar'), '⑫ a LOCAL Claude conversation’s death shows the sign-in card', local);
  ok(!codex.includes('card') && codex.includes('terminal-bar') && codex.includes('system: Not logged in — please log in to continue.'), '⑫ CLAIM 8: a Codex death keeps the terminal road and its words (no Claude card)', codex);
  ok(!remote.includes('card') && remote.includes('terminal-bar'), '⑫ CLAIM 8: a remote-host death keeps the terminal road (the card drives the LOCAL hub’s account only)', remote);
  const bar = methodBody('_showLoginBar') || '';
  ok(/Claude CLI is not logged in\. Open a terminal to run \/login, then retry\./.test(bar) && /Open Login Terminal/.test(bar) && /_resumeAndClose\(\)/.test(bar), '⑫ the terminal road is the old bar (its words, Open Login Terminal, Retry)', bar.slice(0, 120));
  const zh = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
  ok(['Claude CLI is not logged in. Open a terminal to run /login, then retry.', 'Not logged in — please log in to continue.', 'Open Login Terminal'].every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')), '⑫ its words keep their zh + ja');
});

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(`\ntest-signin-card-ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// LANE SITE-RESET — THE REAL LEG (heavy, run ALONE): the REAL keeper launches a headless browser in a scratch HOME (never
// ~/.agent-browser), the REAL routes + the REAL dialog watch + the REAL `vibespace-browser` CLI drive the installed
// agent-browser (0.38.1) against a LOCAL fixture that loops like userW's pod did (never a vendor site): a sign-in page that,
// with a stale cookie, sends the visitor to its app, whose page sends it straight back — every page answered after 300 ms
// and moving on BEFORE its load event (measured, scripts/measure-navigation-loop.mjs: `open` then sits 25 s and ends
// "Operation timed out", `snapshot` answers "(empty page)" after seconds).
//   ① `open` returns [navigation_loop] in < 5 s with the cycle's addresses and the ways out (never a 30 s timeout);
//   ② the next page-waiting verb repeats it at once; the browser fact carries the loop (the chip / the live view's banner);
//   ③ the ways out do not wait: `stop` < 2 s, a `snapshot` after it answers, `screenshot` < 5 s, `tab close` < 2 s;
//   ④ `site-reset <host>` clears the fixture's cookie (and the origin's local storage) in the conversation's own browser —
//      the next `open` settles on the sign-in form;
//   ⑤ a SHARED named profile: the same verb files ONE proposal (its card block), nothing is cleared until the user's Approve,
//      which clears exactly the frozen (profile, host) and tells the agent;
//   CONTROL: the pre-lane watch (no loop judgement) — the same `open` sits the browser CLI's own 25 s timeout.
// SKIPs with evidence when the binary or a browser cannot launch. Zero vendor calls; the scratch root, its daemons and its
// Chrome are ended by this run's own root.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
// 2.369.200 integration (lane hooks-create H5 × this suite): with no desktop and Xvfb on the keeper's PATH an UNSET window
// preference launches the hidden-window rung once H5's switch is on (OFF in 2.369.200, ON in .201 — a headed Chrome); this suite's subject is the dialog / loop watch on the
// rung it was measured on, so it pins headless — the hidden-window rung's own legs are test-browser-display-chrome's (and
// the watch on it is HELD: see the 2.369.200 engineering log, integration)
const HEADLESS_SETTING = (k) => (k === 'browser.noDisplayMode' ? 'headless' : undefined);
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const express = require('express');
const Kk = require('../src/server/browser-keeper.js'), Ff = require('../src/browser-facts.js');
const D = require('../src/server/browser-dialogs.js');
const ST = require('../src/browser-stuck.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 20) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')));
const ROOT = scratch('sreset-chrome');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { endRootedProcesses(ROOT); } catch { } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => { cleanup(); process.exit(130); });

const REAL_AB = (() => { try { return Ff.binaryResolver('agent-browser', BASE_ENV)(); } catch { return null; } })();
let ver = null; try { ver = REAL_AB ? execFileSync(REAL_AB, ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim() : null; } catch { }
if (!ver) { skip(`no real agent-browser resolves on PATH past the shim (PATH=${BASE_ENV.PATH || ''})`); console.log(`\nALL PASS (${pass}, ${skipped} skipped)`); process.exit(0); }
console.log(`agent-browser: ${REAL_AB} (${ver})`);

// ── the fixture (loopback): the always-pending sign-in loop, gated on a stale cookie ──
const PEND_MS = 300;
const PORT = await freePort();
const html = (title, body = '') => `<!doctype html><title>${title}</title>${body}`;
const cookieOf = (req, k) => { const m = new RegExp(`(?:^|;\\s*)${k}=([^;]*)`).exec(String(req.headers.cookie || '')); return m ? m[1] : null; };
let dashN = 0;
const pages = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  const u = req.url;
  if (u.startsWith('/set-stale')) { res.setHeader('set-cookie', ['fx_sess=stale; Path=/; Max-Age=3600']); return res.end(html('Stale cookie set', '<script>localStorage.setItem("fx_token","expired");</script><p>set')); }
  if (u.startsWith('/pd/login')) { const stale = cookieOf(req, 'fx_sess') === 'stale'; setTimeout(() => res.end(html('Log In | Fixture Bank', `<form><input id=u aria-label=user></form>${stale ? `<script>location.replace('/pd/app');</script>` : ''}`)), PEND_MS); return; }
  if (u.startsWith('/pd/app')) { if (cookieOf(req, 'fx_sess') !== 'stale') { res.statusCode = 302; res.setHeader('location', '/pd/login'); return res.end(); } setTimeout(() => res.end(html('Fixture Bank — Dashboard', `<script>location.replace('/pd/login?next=%2Fpd%2Fapp&state=' + Math.random().toString(36).slice(2) + '#s');</script>`)), PEND_MS); return; }
  // verify r3 #1: a page that opens a popup to the looping sign-in page a while after it loads; a page answered after a while
  if (u.startsWith('/popper?')) { const q = new URL(u, 'http://x').searchParams; return res.end(html('Popper', `<p>a page of its own</p><script>setTimeout(() => { window.open('/pd/login', '_blank'); }, ${Number(q.get('delay')) || 2500});</script>`)); }
  // verify r4 #4: a READABLE dashboard that refreshes itself every S seconds (<meta refresh>); a counter proves the reload
  if (u.startsWith('/dash?')) { const q = new URL(u, 'http://x').searchParams; const s = Number(q.get('s')) || 8; dashN++; return res.end(`<!doctype html><meta http-equiv="refresh" content="${s}"><title>Ops dashboard</title><h1 id=h>Ops dashboard</h1><p id=n>render ${dashN}</p><ul><li>queue depth 12</li><li>errors 0</li></ul>`); }
  if (u.startsWith('/slow?')) { const q = new URL(u, 'http://x').searchParams; setTimeout(() => res.end(html('Slow page', '<p>slow')), Number(q.get('ms')) || 5000); return; }
  if (u.startsWith('/probe')) return res.end(html('Probe', `<p id=c></p><script>document.getElementById('c').textContent = 'cookie=' + (document.cookie || '-') + ' ls=' + (localStorage.getItem('fx_token') || '-');</script>`));
  return res.end(html('Other ' + u, '<p>other'));
}).listen(PORT, '127.0.0.1');
const U = (p) => `http://127.0.0.1:${PORT}${p}`;

const MUT = mutantCopies('sreset-chrome', REPO);
async function world(tag, { Dmod = D, ephemeral = true, second = false } = {}) {
  const W = path.join(ROOT, tag);
  const KH = path.join(W, 'h'), KXD = path.join(W, 'x');
  for (const d of [path.join(KH, '.agent-browser'), KXD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
  const KEY = { eph: 'bk-00005ea1', ctl: 'bk-00005ec1', shared: 'bk-00005ed1' }[tag] || 'bk-00005ef1';
  const live = new Set([KEY]);
  const kk = Kk.create({ dataDir: path.join(W, 'data'), homeDir: KH, env: () => kenv, serverSetting: HEADLESS_SETTING, liveKeys: () => live, runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }), log: { log() { }, warn() { }, error() { } }, install: false, tickMs: 3600e3, conversationFacts: () => ({ turn: 'idle' }) }); // verify r2: a conversation's turn is over once its command returns — the other may drive the shared browser at once (the ruling's one-driver rule, not this suite's subject)
  const Bp = require('../src/browser-profiles.js');
  const prof = ephemeral ? null : kk.createProfile({ label: 'Bank ' + tag }, { owner: { kind: 'instance', id: null } });
  const TOKEN = 'vsst_sreset_' + tag;
  let pairs = null;
  if (ephemeral) {
    const cfg = path.join(W, 'spawn-config.json');
    fs.writeFileSync(cfg, JSON.stringify(Bp.generatedConfigParts({ userConfig: {}, headed: false, mark: KEY, holdDialogs: true }).config, null, 2), { mode: 0o600 });
    pairs = [`AGENT_BROWSER_SESSION=vs-${KEY}`, `AGENT_BROWSER_NAMESPACE=vs-${KEY}`, `AGENT_BROWSER_CONFIG=${cfg}`];
  }
  const sessions = new Map([['sess-' + tag, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', _browserEnv: pairs, name: 'Chat ' + tag, cwd: W }]]);
  const KEY_B = 'bk-00005eb2', TOKEN_B = TOKEN + '_b';
  if (second) { sessions.set('sess-' + tag + '-b', { agentToken: TOKEN_B, _browserKey: KEY_B, _browserVariant: 'D', _browserEnv: null, name: 'Chat ' + tag + ' B', cwd: W }); live.add(KEY_B); }
  const events = [];
  const R = require('../src/routes/browser.js');
  const mkKeeper = () => Kk.create({ dataDir: path.join(W, 'data'), homeDir: KH, env: () => kenv, serverSetting: HEADLESS_SETTING, liveKeys: () => live, runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }), log: { log() { }, warn() { }, error() { } }, install: false, tickMs: 3600e3, conversationFacts: () => ({ turn: 'idle' }) });
  // verify r4 #2: the PRODUCTION wiring's holdersOf (src/server/mounts-plugins-wiring.js — the lease rows + the user's own row); r3's
  // `() => []` stub made every tab an orphan (no holder named any), so the orphan rule read every loop as nobody's
  const holdersOfK = (k) => (profileId) => { try { const out = (k.list().leases || []).filter((l) => l && l.profileId === profileId && l.browserKey).map((l) => ({ browserKey: l.browserKey, sessionId: l.sessionId || null, ephemeral: !!l.ephemeral })); const h = typeof k.humanOf === 'function' ? k.humanOf(profileId) : null; if (h && h.browserKey) out.push({ browserKey: h.browserKey, sessionId: null, ephemeral: false, human: true, input: h.input === 'user' ? 'user' : 'agent' }); return out; } catch { return []; } };
  const mkDialogs = (k) => { const d = Dmod.create({ keeper: k, log: { warn() { }, log() { } }, leaseCountOf: (pid) => new Set(((k.list().leases) || []).filter((l) => l && l.profileId === pid && l.browserKey).map((l) => l.browserKey)).size, holdersOf: holdersOfK(k) }); d.setTabsOf((q) => { try { return k.holderTabs(q && q.profileId, q && q.browserKey) || []; } catch { return []; } }); return d; }; // verify r3 #2: the production wiring's tabsOf (the keeper's attributable tabs — the persisted witness among them)
  const dialogs = mkDialogs(kk);
  dialogs.onChange((e) => { events.push({ at: Date.now(), kind: e.kind, loop: e.loop || null }); });
  kk.setStuckSource((bk) => dialogs.stuckForKey(bk));
  // the proposal runner (lane browser-propose's, with lane site-reset's kind): its card / telling / broadcast captured here,
  // its clearing THE wiring's rule (the watch's own socket; the profile's browser started first when it does not run)
  const cards = [], told = [], bcasts = [];
  const propose = require('../src/server/browser-propose.js').create({ keeper: kk, activeSessions: sessions, userTodos: null, feedCard: (s0, b) => cards.push(b), tell: async (o) => { told.push(o); return { told: 'stashed' }; }, broadcast: (m) => bcasts.push(m), log: { log() { }, warn() { } },
    clearSite: require('../src/server/browser-propose.js').siteResetClearer({ dialogs, keeper: kk }) }); // THE wiring's clearer
  const app = express(); app.use(express.json());
  app.use(R.router);
  const srv = http.createServer(app); const port = await freePort(); await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  if (!ephemeral) await kk.attach({ profileId: prof.id, browserKey: KEY, sessionId: 'sess-' + tag, by: 'user' });
  if (second) await kk.attach({ profileId: prof.id, browserKey: KEY_B, sessionId: 'sess-' + tag + '-b', by: 'user' });
  const PASSWD = path.join(W, 'passwd.cjs'); fs.writeFileSync(PASSWD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(KH)} });\n`);
  const env = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD, VIBESPACE_API: `http://127.0.0.1:${port}`, VIBESPACE_SESSION_TOKEN: TOKEN, VIBESPACE_SESSION_CWD: W };
  const cli = (args, { timeoutMs = 90000, token = TOKEN } = {}) => new Promise((resolve) => {
    const t0 = Date.now(); const c = spawn(process.execPath, ['--require', PASSWD, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: { ...env, VIBESPACE_SESSION_TOKEN: token }, cwd: W });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out, err, ms: Date.now() - t0, exitAt: Date.now() }); });
  });
  const wire = (k, d, pr) => R.setup({ keeper: k, activeSessions: sessions, dialogs: d, tasksForSession: () => [],
    proposals: { filed: (r) => pr.filed(r), approve: (id, o) => pr.approve(id, o), reject: (id, o) => pr.reject(id, o), rejectionFor: (q) => pr.rejectionFor(q) },
    siteResets: { propose: ({ f, t, host, url }) => pr.fileSiteReset({ profileId: t.profileId, host, url, browserKey: f.browserKey, sessionId: f.sessionId }) } });
  wire(kk, dialogs, propose);
  const world = { kk, dialogs, propose };
  const close = async () => { world.dialogs.shutdown(); world.kk.shutdown(); await new Promise((r) => srv.close(() => r())); };
  /** verify r3 #2: "VibeSpace restarts" — the keeper, the watch and the routes are rebuilt from the registry on disk; the
   *  browser (its daemons, its Chrome) keeps running, the looping page keeps looping. */
  const restart = async () => {
    world.dialogs.shutdown(); world.kk.shutdown();
    const k2 = mkKeeper(); const d2 = mkDialogs(k2); k2.setStuckSource((bk) => d2.stuckForKey(bk));
    const pr2 = require('../src/server/browser-propose.js').create({ keeper: k2, activeSessions: sessions, userTodos: null, feedCard: (s0, b) => cards.push(b), tell: async (o) => { told.push(o); return { told: 'stashed' }; }, broadcast: (m) => bcasts.push(m), log: { log() { }, warn() { } }, clearSite: require('../src/server/browser-propose.js').siteResetClearer({ dialogs: d2, keeper: k2 }) });
    wire(k2, d2, pr2);
    world.kk = k2; world.dialogs = d2; world.propose = pr2;
    return d2.arm(prof.id, { budgetMs: 3000 });
  };
  const cliB = (args, o = {}) => cli(args, { ...o, token: TOKEN_B });
  const post = (p, body) => new Promise((resolve) => { const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { j = null; } resolve({ status: res.statusCode, body: j }); }); }); req.on('error', () => resolve({ status: 0, body: null })); req.end(JSON.stringify(body || {})); });
  return { get kk() { return world.kk; }, get dialogs() { return world.dialogs; }, get propose() { return world.propose; }, prof, cli, cliB, events, close, restart, KEY, KEY_B, sessions, port, ephemeral, W, cards, told, bcasts, post };
}
const LOOP_HEAD = 'The page keeps navigating by itself and will not settle — ';
const pid = new URL(U('/')).host;
try {
  console.log('— the conversation\'s own browser (rung D): a stale login loops the sign-in page');
  let w = null; try { w = await world('eph'); } catch (e) { skip(`the keeper could not start a browser here: ${e && e.message}`); }
  if (w) {
    let r = await w.cli(['open', U('/set-stale')]);
    ok(r.code === 0, 'setup: the fixture set its stale cookie (and a stale token in local storage)', r);
    // ① the loop, named at once
    r = await w.cli(['open', U('/pd/login')]);
    const ev = w.events.find((e) => e.kind === 'loop');
    ok(r.code === 1 && r.out.startsWith(LOOP_HEAD) && /\[navigation_loop\]/.test(r.err) && r.ms < 5000, `① \`open\` of the looping sign-in page ⇒ [navigation_loop] in ${r.ms} ms (the pre-lane shape: the browser CLI's own 25 s timeout)`, r);
    ok(/"http:\/\/127\.0\.0\.1:\d+\/pd\/(login|app)" and "http:\/\/127\.0\.0\.1:\d+\/pd\/(login|app)"/.test(r.out) && !/state=|#s/.test(r.out), '① …the sentence names the cycle — both addresses, the query and the fragment dropped (a sign-in `state` changes every hop)', r.out);
    ok(/site-reset 127\.0\.0\.1/.test(r.out) && /vibespace-browser stop/.test(r.out) && /vibespace-browser tab close/.test(r.out), '① …and the ways out: `site-reset <host>`, `stop`, `tab close`', r.out);
    ok(ev && ev.loop && ev.loop.hops >= ST.LOOP_MIN_HOPS && ev.loop.urls.length === 2, '① the watch emitted the loop (hops ≥ 6, two addresses) — what the chip and the live view read', ev);
    // ② the next page-waiting verb repeats it at once; the fact carries it
    r = await w.cli(['snapshot']);
    ok(r.code === 1 && r.out.startsWith(LOOP_HEAD) && r.ms < 3000, `② \`snapshot\` while it loops ⇒ the loop at once (${r.ms} ms), never "(empty page)" seconds later`, r);
    const fact = w.kk.factFor({ browserKey: w.KEY, sessionId: 'sess-eph', variant: 'D', remote: false, active: null });
    ok(fact && fact.stuck && fact.stuck.state === 'loop' && fact.stuck.loop && fact.stuck.loop.urls.length === 2, '② the conversation\'s browser fact carries the loop with its cycle (the status-bar chip, the live view\'s banner)', fact && fact.stuck);
    const words = ST.stuckWords(fact && fact.stuck, null);
    ok(words && words.chip === 'page keeps reloading' && / ↔ /.test(words.line), '② …in words: "page keeps reloading" and the two addresses', words);
    // ③ the ways out never wait for the page (the owner's addendum): a screenshot while it loops, `stop`, a snapshot after it,
    // and — the loop started again — `tab close`
    r = await w.cli(['screenshot', path.join(w.W, 'loop.png')]);
    ok(r.ms < 5000 && (r.code === 0 ? fs.existsSync(path.join(w.W, 'loop.png')) : /\[no_picture\]/.test(r.err) && /no picture: the page never drew a frame/.test(r.out)), `③ \`screenshot\` of the looping tab answers in ${r.ms} ms (< 5 s) — a picture, or [no_picture] said by name`, r);
    ok(!r.out.startsWith(LOOP_HEAD) && /\[navigation_loop\]/.test(r.err), '③ …it RAN (a way out, never refused by the loop) and was told the loop beside its result', r);
    r = await w.cli(['stop']);
    ok(r.code === 0 && r.ms < 2000 && /^stopped the page \(it was in a navigation loop\)/.test(r.out) && /site-reset 127\.0\.0\.1/.test(r.out), `③ \`stop\` answers in ${r.ms} ms (< 2 s) — "stopped the page (it was in a navigation loop)" with the way on`, r);
    ok(/still finishing the command the loop cut short \(about \d+ s more\)/.test(r.out), '③ …and says the session still finishes the cut `open` (measured: 0.38.1 keeps waiting until its own 25 s timeout — a stop does not shorten it)', r.out);
    await sleep(1500);
    r = await w.cli(['snapshot'], { timeoutMs: 40000 });
    ok(r.code === 0 && r.ms < ST.CLI_ACTION_TIMEOUT_MS + 5000 && !r.out.startsWith(LOOP_HEAD), `③ a \`snapshot\` AFTER \`stop\` answers (${r.ms} ms — behind the cut \`open\`'s own wait, never the loop again)`, r);
    const f3 = w.kk.factFor({ browserKey: w.KEY, sessionId: 'sess-eph', variant: 'D', remote: false, active: null });
    ok(!(f3 && f3.stuck && f3.stuck.state === 'loop'), '③ …and the fact no longer says it loops', f3 && f3.stuck);
    r = await w.cli(['open', U('/pd/login')]);
    ok(r.code === 1 && r.out.startsWith(LOOP_HEAD), '③ opening it again loops again (the stale login is still stored)', r);
    r = await w.cli(['tab', 'close']);
    ok(r.code === 0 && r.ms < 2000, `③ \`tab close\` of the looping tab answers in ${r.ms} ms (< 2 s)`, r);
    r = await w.cli(['tab', 'new', U('/other-after-close')]);
    const r3 = await w.cli(['get', 'title']);
    ok(r.code === 0 && r3.code === 0 && /Other \/other-after-close/.test(r3.out), '③ …and the browser works on (a new tab answers)', { r, r3 });
    // ④ clear the stale login (the conversation's own browser) — the next `open` settles
    r = await w.cli(['site-reset', 'other.test']);
    ok(r.code === 1 && /\[host_not_current\]/.test(r.err) && /site-reset --host other\.test/.test(r.err), '④ `site-reset` of a host none of its tabs is on ⇒ host_not_current, the explicit form named (nothing cleared)', r);
    r = await w.cli(['site-reset', '127.0.0.1'], { timeoutMs: 40000 });
    ok(r.code === 0 && /^cleared 127\.0\.0\.1's stored login: 1 cookie \(127\.0\.0\.1: 1\)/.test(r.out) && /http:\/\/127\.0\.0\.1:\d+/.test(r.out) && /HTTP cache is shared by every site and was left/.test(r.out), '④ `site-reset 127.0.0.1` clears the fixture\'s cookie (named, counted) and its origin\'s storage — the HTTP cache said to be left', r);
    r = await w.cli(['open', U('/pd/login')], { timeoutMs: 40000 });
    const t4 = await w.cli(['get', 'title']);
    ok(r.code === 0 && !r.out.startsWith(LOOP_HEAD) && /Log In \| Fixture Bank/.test(t4.out), `④ …and the next \`open\` SETTLES on the sign-in form (${r.ms} ms) — the loop is gone with the stale login`, { r, t4 });
    r = await w.cli(['open', U('/probe')]);
    const p4 = await w.cli(['get', 'text', '#c']);
    ok(/cookie=- ls=-/.test(p4.out), '④ the page sees neither the cookie nor the stale token in local storage any more', p4);
    // ⑫ verify r4 #4 (reproduced here before the fix): a READABLE page that refreshes itself every second (<meta refresh>) — judged
    // a loop (right: it never settles) and then every reading verb was refused with the loop sentence, no content (the page
    // answers in ms between reloads). Now `snapshot` / `get` answer with the loop beside them, the chip says the period, an
    // acting verb is still answered with the fact, `stop` ends the refresh
    console.log('— ⑫ verify r4: a readable page that refreshes itself every second');
    r = await w.cli(['open', U('/dash?s=1')], { timeoutMs: 40000 });
    ok(r.code === 0, `⑫ \`open\` of the self-refreshing dashboard settles (${r.ms} ms)`, r);
    const judged = await until(() => { const f = w.kk.factFor({ browserKey: w.KEY, sessionId: 'sess-eph', variant: 'D', remote: false, active: null }); return f && f.stuck && f.stuck.state === 'loop' ? f.stuck : null; }, 15000, 200);
    ok(judged && judged.loop && judged.loop.readable === true && judged.loop.period === 1000, '⑫ after six reloads it is judged a loop — READABLE, period 1 s (every hop loaded: measured)', judged && judged.loop);
    const words12 = ST.stuckWords(judged, null);
    ok(words12 && words12.chip === 'page refreshes itself every 1 s', '⑫ the chip says "page refreshes itself every 1 s" (before: "page keeps reloading" with a stale-login line)', words12);
    r = await w.cli(['snapshot']);
    ok(r.code === 0 && /Ops dashboard/.test(r.out) && /render \d+/.test(r.out) && /\[navigation_loop\]/.test(r.err) && /reloads itself every 1 s/.test(r.err), `⑫ \`snapshot\` ANSWERS the page (${r.ms} ms) with the loop told beside it (before: refused with the loop sentence, no content)`, r);
    r = await w.cli(['get', 'title']);
    ok(r.code === 0 && /^Ops dashboard/.test(r.out.trim()) && /\[navigation_loop\]/.test(r.err), `⑫ \`get title\` answers too (${r.ms} ms)`, r);
    r = await w.cli(['click', '#h']);
    ok(r.code === 1 && /reloads itself every 1 s/.test(r.out) && /\[navigation_loop\]/.test(r.err), '⑫ an acting verb is still answered with the fact at once (it would wait for a page that never settles)', r);
    r = await w.cli(['stop']);
    ok(r.code === 0 && /^stopped the page \(it was in a navigation loop\)/.test(r.out), '⑫ `stop` ends the refresh', r);
    r = await w.cli(['snapshot']);
    ok(r.code === 0 && /Ops dashboard/.test(r.out) && !/\[navigation_loop\]/.test(r.err), '⑫ …and the next `snapshot` reads it with no loop note', r);
    await w.close();
  }
  // ⑤ A SHARED named profile (two conversations use it): the same verb files ONE proposal; nothing is cleared until the
  // user's Approve, which clears exactly the frozen (profile, host) and tells the agent
  console.log('— a shared named profile: `site-reset` is a proposal the user approves');
  let s2 = null; try { s2 = await world('shared', { ephemeral: false, second: true }); } catch (e) { skip(`shared profile: the keeper could not launch: ${e && e.message}`); }
  if (s2) {
    let r = await s2.cli(['open', U('/set-stale')]);
    r = await s2.cli(['open', U('/probe')]);
    const p0 = await s2.cli(['get', 'text', '#c']);
    ok(/cookie=fx_sess=stale/.test(p0.out), 'setup: the shared profile holds the stale cookie', p0);
    // verify r2 (supersedes r1's row here): on the real 0.38.1 a cooperative session gets a page of its OWN on attach and `tab new`
    // opens more — each appears while that conversation's verb is in flight, so the watch's CREATION WITNESS attributes them
    // (verify r1 had the bare form refused `host_not_current`: nothing of A's was attributable then — its own tab was nobody's)
    r = await s2.cli(['site-reset', 'other.test']);
    ok(r.code === 1 && /\[host_not_current\]/.test(r.err) && !/could not read your current tab's address/.test(r.err) && /site-reset --host other\.test/.test(r.err), '⑤ verify r2: the bare `site-reset <host>` on the shared browser READS this conversation\'s own tab (witnessed at its creation) — a host it is not on is refused by name, the --host way named', r);
    r = await s2.cli(['site-reset', '127.0.0.1']);
    const pid5 = (/\(proposal (sr-[0-9a-f]{8})\)/.exec(r.out) || [])[1];
    ok(r.code === 0 && pid5 && /is shared \(2 conversations use it\)/.test(r.out) && /Tell the user in ONE sentence that the card waits/.test(r.out), '⑤ verify r2: …the bare form for the site its own tab is on files ONE proposal (2 conversations named — the shared profile is still the user\'s to clear) and tells the agent to say so and stop', r);
    const card = s2.cards.find((c) => c.id === pid5);
    ok(card && card.kind === 'site-reset' && card.state === 'open' && card.holders === 2 && card.profileLabel === 'Bank shared', '⑤ …its card block: kind site-reset, open, the profile\'s name and the holders it will sign out', card);
    const again = await s2.cli(['site-reset', '--host', '127.0.0.1']);
    ok(again.code === 0 && new RegExp(`the same card still waits for the user \\(proposal ${pid5}`).test(again.out), '⑤ asking again (the --host form) while it stands is the SAME card (no second one)', again);
    const p1 = await s2.cli(['get', 'text', '#c']);
    r = await s2.cli(['reload']);
    const p1b = await s2.cli(['get', 'text', '#c']);
    ok(/cookie=fx_sess=stale/.test(p1b.out), '⑤ nothing was cleared by the ask (the cookie is still there)', { p1, p1b });
    const wrong = await s2.post(`/api/browser/proposals/${pid5}/approve`, { shown: 'pd-00000000' });
    ok(wrong.status === 409 && wrong.body && wrong.body.code === 'proposal_changed', '⑤ an Approve naming another card\'s digest runs nothing (409 proposal_changed)', wrong);
    const ap = await s2.post(`/api/browser/proposals/${pid5}/approve`, { shown: card.digest });
    ok(ap.status === 200 && ap.body && ap.body.ok, '⑤ the user\'s Approve (the card\'s own digest) starts the run', ap);
    const done = await until(() => { const e = s2.kk.proposalEntry(pid5); return e && ['done', 'failed'].includes(e.proposal.state) ? e : null; }, 15000, 100);
    ok(done && done.proposal.state === 'done' && done.proposal.outcome.cookies === 1 && done.proposal.outcome.told === 'stashed', '⑤ …it ran exactly the frozen pair: done, 1 cookie cleared, the agent told', done && done.proposal);
    r = await s2.cli(['reload']);
    const p2 = await s2.cli(['get', 'text', '#c']);
    ok(/cookie=- ls=-/.test(p2.out), '⑤ the page sees neither the cookie nor the stale token any more', p2);
    ok(s2.told.length === 1 && /^Approved: 127\.0\.0\.1's stored login was cleared in the profile "Bank shared" \(1 cookie/.test(s2.told[0].text), '⑤ the agent is told what was cleared (free — the handback\'s ladder site)', s2.told);
    ok(s2.bcasts.some((m) => m.type === 'browser-site-reset' && m.profileId === s2.prof.id && m.host === '127.0.0.1'), '⑤ the holders\' live views get ONE notice (browser-site-reset for this profile)', s2.bcasts.map((m) => m.type));
    // ⑥ verify r2 (reproduced here before the fix): on the SHARED profile the conversation's own `tab new` of the looping page —
    // its `open` sat the binary's 25 s timeout, `snapshot` answered "(empty page)" with no loop word, `stop` was refused
    // `not_watched`. With the creation witness its own tab is its own: the loop cuts its verb, `stop` / `tab close` land on it,
    // and the other conversation's tab is untouched
    console.log('— ⑥ verify r2: the shared profile — the conversation\'s OWN tab loops');
    const rb = await s2.cliB(['tab', 'new', U('/other-b')]);
    ok(rb.code === 0, 'setup: conversation B opened a tab of its own', rb);
    await s2.cli(['open', U('/set-stale')]);
    r = await s2.cli(['tab', 'new', U('/pd/login')]);
    ok(r.code === 0 && r.ms < 5000, `⑥ A\'s \`tab new\` of the looping sign-in page answers (${r.ms} ms; 0.38.1 waits for nothing there)`, r);
    r = await s2.cli(['open', U('/pd/login')], { timeoutMs: 40000 });
    ok(r.code === 1 && r.out.startsWith(LOOP_HEAD) && /\[navigation_loop\]/.test(r.err) && r.ms < 5000, `⑥ A\'s \`open\` in its own tab ⇒ [navigation_loop] in ${r.ms} ms (before: the 25 s timeout — its tab was nobody\'s on the shared browser)`, r);
    r = await s2.cli(['stop']);
    ok(r.code === 0 && r.ms < 2000 && /^stopped the page \(it was in a navigation loop\)/.test(r.out), `⑥ A\'s \`stop\` lands on its own tab in ${r.ms} ms (before: refused not_watched / unattributed)`, r);
    r = await s2.cli(['open', U('/pd/login')], { timeoutMs: 40000 });
    ok(r.code === 1 && r.out.startsWith(LOOP_HEAD), '⑥ opening it again loops again', r);
    r = await s2.cli(['tab', 'close']);
    ok(r.code === 0 && r.ms < 2000 && /^closed the looping tab/.test(r.out), `⑥ A\'s \`tab close\` closes its own looping tab in ${r.ms} ms`, r);
    const ub = await s2.cliB(['get', 'url'], { timeoutMs: 40000 });
    ok(ub.code === 0 && /\/other-b/.test(ub.out), '⑥ conversation B\'s own tab is untouched (its url still answers)', ub);
    // ⑦ verify r3 #1 (reproduced here before the fix): a STRANGER's page (B's) opens a popup to the looping sign-in page while A's
    // verb is in flight — the r2 witness ("born during my verb") made it A's: A's `open` was cut with B's popup's addresses and
    // A's `stop` stopped B's page. The popup's targetCreated carries B's tab as `openerId` (measured, even under `noopener`):
    // it is B's; A's slow open settles on its own page, A's stop stops nothing of B's, B's own stop lands
    console.log('— ⑦ verify r3: a stranger\'s page opens a popup while this conversation\'s verb is in flight');
    r = await s2.cli(['tab', 'new', U('/a-fresh')], { timeoutMs: 40000 }); // ⑥ closed A's bound tab: "your next page command needs a tab of yours" (closeText) — behind the cut open's daemon wait
    ok(r.code === 0, 'setup: A opened a fresh tab of its own (the close said so)', r);
    r = await s2.cliB(['open', U('/popper?delay=2500')]);
    ok(r.code === 0, 'setup: B opened its own page, which opens a popup to the looping sign-in page 2.5 s later', r);
    r = await s2.cli(['open', U('/slow?ms=7000')], { timeoutMs: 40000 });
    ok(r.code === 0 && !r.out.startsWith(LOOP_HEAD) && r.ms >= 6500, `⑦ A's slow \`open\` SETTLES on its own page (${r.ms} ms) while B's popup loops — never cut by the stranger's loop (before: cut with B's addresses)`, r);
    const fA7 = s2.dialogs.factFor({ profileId: s2.prof.id, browserKey: s2.KEY, sessionId: 'sess-shared', ephemeral: false, consume: false });
    const fB7 = s2.dialogs.factFor({ profileId: s2.prof.id, browserKey: s2.KEY_B, sessionId: 'sess-shared-b', ephemeral: false, consume: false });
    ok(!fA7.loop && !fA7.loopAny && !!fB7.loopAny && fB7.loopAny.urls.length === 2, '⑦ the popup\'s loop is B\'s fact (its opener is B\'s page) and none of A\'s — not even loopAny', { a: fA7.loopAny, b: fB7.loopAny });
    r = await s2.cli(['stop']);
    ok(r.code === 0 && /^nothing of yours was loading/.test(r.out), '⑦ A\'s \`stop\` stops NOTHING (no page of A\'s loads) — the stranger\'s popup is not A\'s to stop', r);
    r = await s2.cliB(['stop']);
    ok(r.code === 0 && /^stopped the page \(it was in a navigation loop\)/.test(r.out), '⑦ …B\'s own \`stop\` lands on its popup', r);
    // ⑧ verify r3 #2 (reproduced here before the fix): a VibeSpace RESTART mid-loop (the user restarts on every Update) forgot the
    // witness — A's own looping tab was nobody's again: its loop read `loopShared`, its `stop` was refused `unattributed`. The
    // witness is on the lease record now (the registry on disk): the keeper + watch + routes rebuilt from it attribute the tab
    // at once, while Chrome kept looping
    console.log('— ⑧ verify r3: a VibeSpace restart mid-loop');
    r = await s2.cli(['tab', 'new', U('/pd/login')]);
    const lease8 = s2.kk.list().leases.find((l) => l.browserKey === s2.KEY);
    ok(r.code === 0 && lease8 && Array.isArray(lease8.tabs) && lease8.tabs.length >= 1, '⑧ A opened the looping sign-in page in a tab of its own — the witness is WRITTEN on its lease record', { code: r.code, tabs: lease8 && lease8.tabs });
    await sleep(2500);
    const armed8 = await s2.restart();
    await sleep(3000);
    const f8 = s2.dialogs.factFor({ profileId: s2.prof.id, browserKey: s2.KEY, sessionId: 'sess-shared', ephemeral: false, consume: false });
    const w8 = s2.dialogs._watches.get(s2.prof.id); const named8 = new Set([s2.KEY, s2.KEY_B].flatMap((bk) => s2.kk.holderTabs(s2.prof.id, bk)));
    ok(armed8.ok && f8.watched && !!f8.loop && f8.unattributed === false && f8.loopShared === false, '⑧ after the restart (keeper + watch + routes rebuilt from disk; Chrome kept looping) A\'s looping tab is still A\'s — its own loop fact, never loopShared / unattributed (before: nobody\'s again)', { armed: armed8, loop: !!f8.loop, unattributed: f8.unattributed, loopShared: f8.loopShared, orphans: s2.dialogs.orphansOf(s2.prof.id), loading: f8.loading, targets: w8 ? [...w8.targets.values()].map((e) => ({ tid: e.targetId.slice(0, 8), url: e.url.slice(0, 60), owner: e.owner, named: named8.has(e.targetId), navSince: e.navSince || 0, loop: !!e.loop, open: w8.open.has(e.targetId) })) : null });
    r = await s2.cli(['stop']);
    ok(r.code === 0 && r.ms < 2000 && /^stopped the page \(it was in a navigation loop\)/.test(r.out), `⑧ A's \`stop\` lands after the restart in ${r.ms} ms (before: refused not_watched / unattributed)`, r);
    // ⑨ verify r4 #1 (reproduced here before the fix): B's `tab new` of the looping page WHILE A's slow `open` is in flight — two
    // verbs in flight ⇒ nobody's (the event is judged before B's verb ends: measured 37 ms), and B, holding other witnessed tabs,
    // was told nothing: its `open` there sat the 25 s timeout with no loop word, its `stop` said "nothing of yours". THE ACK
    // BINDS: B's `tab new` ack (`tab list --json`'s active tab) names the tab, the audit binds it to B — its loop is B's at once
    console.log('— ⑨ verify r4: B\'s `tab new` while A\'s command is in flight');
    r = await s2.cli(['tab', 'new', U('/a-nine')], { timeoutMs: 40000 });
    ok(r.code === 0, 'setup: A opened a fresh tab of its own', r);
    // measured (verify r4): B's FIRST command after another session's `tab new` + pending `open` waits ~5.4 s inside 0.38.1 itself
    // (text or --json, any url; 90 ms thereafter; the ack's own cost is ~3 ms) — B settles that here, before the verb under test
    r = await s2.cliB(['get', 'url'], { timeoutMs: 40000 });
    ok(r.code === 0, 'setup: B ran one command of its own', r);
    const pA9 = s2.cli(['open', U('/slow?ms=6000')], { timeoutMs: 40000 });
    await sleep(700);
    const rB9 = await s2.cliB(['tab', 'new', U('/pd/login')]);
    ok(rB9.code === 0 && rB9.ms < 5000, `⑨ B's \`tab new\` of the looping page answers (${rB9.ms} ms) while A's open runs`, rB9);
    await sleep(3000);
    const fB9 = s2.dialogs.factFor({ profileId: s2.prof.id, browserKey: s2.KEY_B, sessionId: 'sess-shared-b', ephemeral: false, consume: false });
    const fA9 = s2.dialogs.factFor({ profileId: s2.prof.id, browserKey: s2.KEY, sessionId: 'sess-shared', ephemeral: false, consume: false });
    ok(!!fB9.loop && fB9.unattributed === false && !fA9.loopAny, '⑨ the loop in B\'s new tab is B\'s own fact (bound by its ack) and none of A\'s (before: nobody\'s — B heard nothing, A nothing)', { b: !!fB9.loop, bUn: fB9.unattributed, aAny: !!fA9.loopAny });
    const rA9 = await pA9;
    ok(rA9.code === 0 && !rA9.out.startsWith(LOOP_HEAD), `⑨ A's slow \`open\` settles on its own page (${rA9.ms} ms) — never cut by B's loop`, rA9);
    r = await s2.cliB(['stop']);
    ok(r.code === 0 && r.ms < 2000 && /^stopped the page \(it was in a navigation loop\)/.test(r.out), `⑨ B's \`stop\` lands on its own tab in ${r.ms} ms (before: "nothing of yours was loading")`, r);
    r = await s2.cli(['stop']);
    ok(r.code === 0 && /^nothing of yours was loading/.test(r.out), '⑨ A\'s `stop` stops nothing (B\'s tab is not A\'s)', r);
    // ⑩ verify r4 #2 (reproduced here before the fix): a loop in an ORPHAN tab — the browser's own first tab (`t1`, born before
    // any conversation's command: named to nobody). B switches its session to it and opens the looping page there: the loop is
    // nobody's, so B — holding tabs of its own — heard NOTHING: its `open` sat the 25 s timeout with no loop word, its `stop`
    // said "nothing of yours". Now the orphan's loop is told as a kind ([navigation_loop_shared]) and `stop` refuses by name
    console.log('— ⑩ verify r4: a loop in a tab named to nobody (the browser\'s own first tab)');
    r = await s2.cliB(['tab', 't1']);
    ok(r.code === 0, 'setup: B switched its session to the browser\'s first tab (t1 — born before any command, nobody\'s)', r);
    r = await s2.cliB(['open', U('/pd/login')], { timeoutMs: 40000 });
    ok(r.code !== 0 && /\[navigation_loop_shared\]/.test(r.err) && /named to no conversation/.test(r.err) && !/pd\/(login|app)/.test(r.err.replace(/profile:.*\n/, '')), `⑩ B's \`open\` in the orphan tab is told, after its own wait (${r.ms} ms), that a tab named to no conversation loops — a kind, never the page's address (before: the bare timeout line)`, r);
    r = await s2.cliB(['stop']);
    ok(r.code === 1 && /\[not_watched\]/.test(r.err) && /named to no conversation/.test(r.err), '⑩ B\'s `stop` is refused BY NAME with the way out (before: "nothing of yours was loading")', r);
    // ⑪ verify r4 #3 (reproduced here before the fix): the browser HEALED (its Chrome killed; the keeper relaunches it in the same
    // daemon on the next command — new target ids): the dead ids stayed on every lease's `tabs` (no lease event on a relaunch,
    // the dead socket sent no targetDestroyed), a ghost-only scope read as attributed. Now the replacement drops them and the
    // new watch's first look prunes; the conversation's next tab is its own again
    console.log('— ⑪ verify r4: the browser is healed (Chrome killed, relaunched in place)');
    r = await s2.cli(['tab', 'new', U('/a-eleven')], { timeoutMs: 40000 });
    const lease11 = s2.kk.list().leases.find((l) => l.browserKey === s2.KEY);
    const pid11 = (s2.kk.list().browsers[s2.prof.id] || {}).browser?.pid;
    ok(r.code === 0 && lease11 && Array.isArray(lease11.tabs) && lease11.tabs.length >= 1 && Number.isInteger(pid11), 'setup: A holds witnessed tabs on its lease; the keeper knows its Chrome\'s pid', { tabs: lease11 && lease11.tabs, pid11 });
    try { process.kill(pid11, 'SIGKILL'); } catch { }
    await sleep(1500);
    // the keeper's OWN join heals the record (a verb's start path) — no watch arms here, so what the leases hold right after is the
    // keeper's replacement-time drop alone (the watch's connect-time prune comes with the next verb)
    let healed11 = null; try { healed11 = await s2.kk.start(s2.prof.id, { why: 'verify r4 Q7', browserKey: s2.KEY }); } catch (e) { healed11 = { error: String(e && e.message) }; }
    const lease11h = s2.kk.list().leases.find((l) => l.browserKey === s2.KEY);
    const pid11h = (s2.kk.list().browsers[s2.prof.id] || {}).browser?.pid;
    ok(Number.isInteger(pid11h) && pid11h !== pid11 && !(lease11h && Array.isArray(lease11h.tabs) && lease11h.tabs.length) && ![...s2.dialogs._watches.values()].some((w) => w.state === 'open'), `⑪ the keeper's replacement-time drop alone (healed in its own join, pid ${pid11} → ${pid11h}; no watch connected yet): A's lease holds no dead id`, { pid11, pid11h, tabs: lease11h && lease11h.tabs, healed: healed11 && (healed11.error || healed11.state || 'ok') });
    r = await s2.cli(['get', 'url'], { timeoutMs: 40000 });
    const pid11b = (s2.kk.list().browsers[s2.prof.id] || {}).browser?.pid;
    const lease11b = s2.kk.list().leases.find((l) => l.browserKey === s2.KEY);
    // 2.369.200 integration: lane profile-lock-roll L2 — the first command after a replaced Chrome REBINDS the lease to a new tab
    // ([tab_rebound]) instead of the binary's tab_gone; either way no DEAD id survives on A's lease (the rebound tab is new)
    const idOf11 = (t) => (typeof t === 'string' ? t : t && (t.id || t.targetId));
    const dead11 = new Set(((lease11 && lease11.tabs) || []).map(idOf11));
    ok(Number.isInteger(pid11b) && pid11b !== pid11 && (/tab_gone/.test(r.out + r.err) || /\[tab_rebound\]/.test(r.out + r.err)) && !(lease11b && Array.isArray(lease11b.tabs) && lease11b.tabs.some((t) => dead11.has(idOf11(t)))), `⑪ the keeper healed the browser (pid ${pid11} → ${pid11b}; the binary's own tab_gone names \`tab new\`, or profile-lock-roll's [tab_rebound]) and the dead ids are GONE from A's lease (before: kept — a ghost-only scope)`, { pid11, pid11b, tabs: lease11b && lease11b.tabs, r: r.code });
    r = await s2.cli(['tab', 'new', U('/pd/login')], { timeoutMs: 40000 });
    await sleep(3000);
    const f11 = s2.dialogs.factFor({ profileId: s2.prof.id, browserKey: s2.KEY, sessionId: 'sess-shared', ephemeral: false, consume: false });
    ok(r.code === 0 && !!f11.loop && f11.unattributed === false, '⑪ A\'s next `tab new` on the healed browser is its own (bound by its ack): the loop there is A\'s own fact', { code: r.code, loop: !!f11.loop, un: f11.unattributed });
    r = await s2.cli(['stop']);
    ok(r.code === 0 && /^stopped the page \(it was in a navigation loop\)/.test(r.out), '⑪ …and A\'s `stop` lands on it', r);
    await s2.close();
  }
  // CONTROL: the pre-lane watch (it judges no loop) — the same `open` sits out the browser CLI's own 25 s timeout
  console.log('— CONTROL: a watch that judges no loop (the pre-lane shape)');
  const dsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  const nd = 'const v = ST.navigationLoopVerdict(e.hops, { now: t, commands: w.commands, quietMs });';
  if (!ok(dsrc.includes(nd), 'control setup: the loop judgement is found in src/server/browser-dialogs.js')) { /* the leg below needs it */ }
  else {
    const Dm = MUT.load('src/server/browser-dialogs.js', dsrc.replace(nd, 'const v = null;'), 'no-loop');
    let c = null; try { c = await world('ctl', { Dmod: Dm }); } catch (e) { skip(`control: the keeper could not start a browser: ${e && e.message}`); }
    if (c) {
      await c.cli(['open', U('/set-stale')]);
      const r = await c.cli(['open', U('/pd/login')], { timeoutMs: 60000 });
      ok(r.code !== 0 && r.ms >= 20000 && /Operation timed out/.test(r.out + r.err) && !/navigation_loop/.test(r.out + r.err), `CONTROL: without the judgement the \`open\` sits out the browser CLI's own timeout (${r.ms} ms, "Operation timed out") — userW's every-verb-times-out; the ① leg reddens on it`, { code: r.code, ms: r.ms, out: r.out.slice(0, 300), err: r.err.slice(0, 300) });
      await c.close();
    }
  }
} finally { pages.close(); cleanup(); }
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed, ${skipped} skipped)` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);

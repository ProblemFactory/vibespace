#!/usr/bin/env node
// LANE BROWSER-STUCK — THE REAL LEG (heavy, run ALONE): the REAL keeper launches ONE headless profile browser in a
// scratch HOME (never ~/.agent-browser), the REAL routes + the REAL dialog watch + the REAL `vibespace-browser` CLI drive
// the installed agent-browser (0.38.1) against a real page that holds its navigation with `beforeunload` (a field the
// agent clicked and typed into — Chrome shows no beforeunload dialog without that activation).
//   ① `open <elsewhere>` returns [dialog_open] with THE sentence first, within 1 s of Chrome's own
//      Page.javascriptDialogOpening (the watch's event) — the pre-lane shape sat 30 s (measured: `CDP command timed out:
//      Page.navigate`, /json/list = the pending url over the old title);
//   ② the next verb repeats it; `get url` puts it first;
//   ③ `dialog dismiss` ⇒ the page stays WITH the typed draft; ④ `dialog accept` ⇒ the navigation completes;
//   ⑤ an alert from a click is accepted and said once;
//   ⑥ USERW'S SHAPE: the lease's daemon dies while the dialog holds the page — the daemon that comes next can neither
//      see nor answer it (measured: 16 s "tab is not responding"), the watch can: `dialog accept` completes the navigation;
//   CONTROL: a keeper copy whose launch holds nothing (the pre-lane config) — the same `open` answers ok in ms and the
//   typed draft is GONE (0.38.1's own silent auto-accept, what the lane turns off).
// SKIPs with evidence when the binary or a browser cannot launch. Zero vendor calls; the scratch root, its daemons and
// its Chrome are ended by this run's own root.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, endRootedProcesses } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const express = require('express');
const Kk = require('../src/server/browser-keeper.js'), Ff = require('../src/browser-facts.js');
const D = require('../src/server/browser-dialogs.js');
const ST = require('../src/browser-stuck.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 20) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_') && !k.startsWith('VIBESPACE_')));
const ROOT = scratch('bstuck-chrome');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { endRootedProcesses(ROOT); } catch { } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sg of ['SIGINT', 'SIGTERM']) process.on(sg, () => { cleanup(); process.exit(130); });

let ver = null; try { ver = execFileSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 8000, env: BASE_ENV }).trim(); } catch { }
if (!ver) { skip('agent-browser is not runnable here (put the real binary first on PATH)'); console.log(`\nALL PASS (${pass}, ${skipped} skipped)`); process.exit(0); }
console.log(`agent-browser: ${ver}`);

// the pages (loopback)
const PORT = await freePort();
const FORM = `<!doctype html><title>COMPOSE-DRAFT</title><input id=f><button id=b onclick="alert('hello from alert')">alert</button><button id=c onclick="confirm('Discard this draft?')">confirm</button>
<script>window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = 'unsaved'; return 'unsaved'; });</script>`;
const pages = http.createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); if (req.url.startsWith('/form')) return res.end(FORM); if (req.url.startsWith('/ask/')) { const who = req.url.slice(5, 6).replace(/[^AB]/g, 'X'); return res.end(`<!doctype html><title>ASK ${who}</title><button id=c onclick="confirm('${who} asks: ${who === 'A' ? 'discard' : 'transfer'}?')">ask</button>`); } /* verify r2 #3: a page per conversation */ res.end(`<!doctype html><title>OTHER ${req.url}</title><p>other`); }).listen(PORT, '127.0.0.1');
const U = (p) => `http://127.0.0.1:${PORT}${p}`;

const MUT = mutantCopies('bstuck-chrome', REPO);
async function world(tag, { Kmod = Kk, ephemeral = false, second = false } = {}) {
  const W = path.join(ROOT, tag);
  const KH = path.join(W, 'h'), KXD = path.join(W, 'x');
  for (const d of [path.join(KH, '.agent-browser'), KXD]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const kenv = { ...BASE_ENV, HOME: KH, XDG_RUNTIME_DIR: KXD };
  const KEY = tag === 'ctl' ? 'bk-0000c7a1' : tag === 'eph' ? 'bk-0000e7a1' : 'bk-0000d7a1';
  const live = new Set([KEY]);
  const kk = Kmod.create({ dataDir: path.join(W, 'data'), homeDir: KH, env: () => kenv, serverSetting: () => undefined, liveKeys: () => live, runtime: Ff.createBrowserRuntime({ env: kenv }), facts: Ff.createBrowserFacts({ env: kenv }), log: { log() { }, warn() { }, error() { } }, install: false, tickMs: 3600e3, ...(second ? { driveHoldMs: 1500 } : {}) }); // verify r2 #3: one driver at a time (owner ruling A) — the claim lapses after 1.5 s quiet here, 90 s in the product
  const Bp = require('../src/browser-profiles.js');
  const prof = ephemeral ? null : kk.createProfile({ label: 'Mail ' + tag }, { owner: { kind: 'instance', id: null } });
  const TOKEN = 'vsst_bstuck_' + tag;
  // an EPHEMERAL world = rung D as a new spawn makes it: the session's own pairs name browser-env's generated config (holdDialogs)
  let pairs = null;
  if (ephemeral) {
    const cfg = path.join(W, 'spawn-config.json');
    fs.writeFileSync(cfg, JSON.stringify(Bp.generatedConfigParts({ userConfig: {}, headed: false, mark: KEY, holdDialogs: true }).config, null, 2), { mode: 0o600 });
    pairs = [`AGENT_BROWSER_SESSION=vs-${KEY}`, `AGENT_BROWSER_NAMESPACE=vs-${KEY}`, `AGENT_BROWSER_CONFIG=${cfg}`];
  }
  const sessions = new Map([['sess-' + tag, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', _browserEnv: pairs, name: 'Chat ' + tag, cwd: W }]]);
  // verify r2 #3: a SECOND conversation on the same named profile (its own key, token and lease)
  const KEY_B = 'bk-0000d7b2', TOKEN_B = TOKEN + '_b';
  if (second) { sessions.set('sess-' + tag + '-b', { agentToken: TOKEN_B, _browserKey: KEY_B, _browserVariant: 'D', _browserEnv: null, name: 'Chat ' + tag + ' B', cwd: W }); live.add(KEY_B); }
  const opens = [];
  let dialogs = null;
  const R = require('../src/routes/browser.js');
  // verify r1 A5: `restartWatch` = what a VibeSpace restart does to the watch (a new one, attached AFTER any open dialog)
  const armWatch = () => {
    dialogs = D.create({ keeper: kk, log: { warn() { }, log() { } }, leaseCountOf: (pid) => new Set(((kk.list().leases) || []).filter((l) => l && l.profileId === pid && l.browserKey).map((l) => l.browserKey)).size, holdersOf: () => [] }); // the wiring's own count (verify r2 #3)
    dialogs.onChange((e) => { if (e.kind === 'open') opens.push({ at: Date.now(), type: e.dialog.type }); });
    kk.setStuckSource((bk) => dialogs.stuckForKey(bk));
    R.setup({ keeper: kk, activeSessions: sessions, dialogs, tasksForSession: () => [] });
  };
  armWatch();
  const app = express(); app.use(express.json());
  app.use(R.router);
  const srv = http.createServer(app); const port = await freePort(); await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  // the lease: the conversation attaches the profile (the keeper launches its ONE Chrome); an ephemeral one starts on the first verb
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
  const cdpHttp = () => String(kk.browserOf(prof.id).cdpUrl || '').replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*$/, ''); // a named world only
  const jsonList = () => new Promise((resolve) => http.get(cdpHttp() + '/json/list', (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve([]); } }); }).on('error', () => resolve([])));
  const leaseDaemons = () => fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map(Number).filter((pid) => { try { const e = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); return e.includes(`AGENT_BROWSER_SESSION=vs-${KEY}`) && e.includes(`HOME=${KH}`) && fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('agent-browser'); } catch { return false; } });
  const close = async () => { dialogs.shutdown(); kk.shutdown(); await new Promise((r) => srv.close(() => r())); };
  const cliB = (args, o = {}) => cli(args, { ...o, token: TOKEN_B });
  return { kk, prof, cli, cliB, opens, jsonList, leaseDaemons, close, get dialogs() { return dialogs; }, restartWatch: () => { dialogs.shutdown(); armWatch(); }, KEY, ephemeral, launchCfg: () => { try { return JSON.parse(fs.readFileSync(kk.machineConfigFile('machine', prof.id), 'utf8')); } catch { return null; } } };
}
const HEAD = 'A page dialog is open and the page will not move until it is answered — ';
async function typeDraft(w, text) {
  let r = await w.cli(['open', U('/form')]); if (r.code !== 0) return r;
  r = await w.cli(['click', '#f']); if (r.code !== 0) return r;
  return w.cli(['type', '#f', text]);
}
try {
  let w;
  try { w = await world('lane'); } catch (e) { skip(`the keeper could not launch a browser here: ${e && e.message}`); w = null; }
  if (w) {
    console.log('— the lane: a real beforeunload through the real keeper + routes + CLI + watch');
    ok(w.launchCfg() && w.launchCfg().noAutoDialog === true, 'the keeper\'s LAUNCH config for this browser holds page dialogs (noAutoDialog — launched after the lane)', w.launchCfg());
    let r = await typeDraft(w, 'draft text');
    ok(r.code === 0, 'the agent opened the compose page, clicked and typed (sticky user activation)', r);
    // ① the navigation the page holds
    const before = w.opens.length;
    r = await w.cli(['open', U('/other-1')]);
    const ev = w.opens[before];
    ok(r.code === 1 && r.out.startsWith(HEAD + 'beforeunload: "Leave site? Changes you made may not be saved.". Answer it: vibespace-browser dialog accept [text]  |  vibespace-browser dialog dismiss.  (beforeunload: accept = leave the page and lose unsaved input; dismiss = stay.)') && /\[dialog_open\]/.test(r.err), '① `open` elsewhere ⇒ [dialog_open], exit 1, THE sentence first (the real 0.38.1 + Chrome)', r);
    ok(ev && ev.type === 'beforeunload' && r.exitAt - ev.at > 0 && r.exitAt - ev.at < 1000, `① …within 1 s of Chrome's own javascriptDialogOpening (${ev ? r.exitAt - ev.at : '?'} ms; the pre-lane shape sat 30 s)`, { ev, r: r.ms });
    const jl = (await w.jsonList()).find((t) => t.type === 'page' && /\/other-1|\/form/.test(t.url));
    ok(jl && /\/other-1$/.test(jl.url) && jl.title === 'COMPOSE-DRAFT', `① Chrome's /json/list shows userW's signature — the pending url over the OLD title ("${jl && jl.title}")`, jl);
    // ②
    r = await w.cli(['get', 'url']);
    ok(r.code === 1 && r.out.split('\n')[0].startsWith(HEAD + 'beforeunload:') && /It has been open for/.test(r.out) && r.ms < 5000, `② the next verb repeats it at once (${r.ms} ms) — \`get url\` with the dialog line first`, r);
    // ③ dismiss ⇒ stay, draft kept
    r = await w.cli(['dialog', 'dismiss']);
    ok(r.code === 0 && /dismissed — the page stays/.test(r.out), '③ `dialog dismiss` answers it through the watch', r);
    await sleep(500);
    r = await w.cli(['get', 'value', '#f']);
    const t1 = await w.cli(['get', 'title']);
    ok(r.code === 0 && /draft text/.test(r.out) && /COMPOSE-DRAFT/.test(t1.out), '③ …the page STAYS with the typed draft (never silently discarded)', { v: r, t: t1 });
    // ④ accept ⇒ leave
    r = await w.cli(['open', U('/other-2')]);
    ok(r.code === 1 && r.out.startsWith(HEAD), '④ the next navigation is held again (the draft is still unsaved)', r);
    r = await w.cli(['dialog', 'accept']);
    ok(r.code === 0 && /accepted — the page is being left/.test(r.out), '④ `dialog accept` = leave', r);
    const t2 = await until(async () => { const x = await w.cli(['get', 'title']); return /OTHER \/other-2/.test(x.out) ? x : null; }, 8000, 300);
    ok(!!t2, '④ …the held navigation completes');
    // ⑤ an alert
    await w.cli(['open', U('/form')]);
    r = await w.cli(['click', '#b']);
    ok(r.code === 0 && /\(a page alert was auto-accepted: "hello from alert"\)/.test(r.err) && !/blocking the page/.test(r.out + r.err), '⑤ an alert from a click is accepted by the watch and said once (the browser CLI\'s own "blocking" line replaced)', r);
    const r5 = await w.cli(['get', 'title']);
    ok(r5.code === 0 && !/auto-accepted/.test(r5.err), '⑤ …once');
    // ⑥ userW's shape: the lease's daemon dies under an open dialog
    r = await typeDraft(w, 'second draft');
    const held = await w.cli(['open', U('/other-3')]);
    ok(held.code === 1 && held.out.startsWith(HEAD), '⑥ a dialog holds the page again', held);
    const pids = w.leaseDaemons();
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch { } }
    await until(() => w.leaseDaemons().length === 0, 3000);
    r = await w.cli(['dialog', 'accept']);
    ok(pids.length >= 1 && r.code === 0 && /accepted/.test(r.out), `⑥ the lease's daemon (${pids.join(',')}) killed mid-hold — a new daemon could neither see nor answer it (measured), the watch answers it: \`dialog accept\``, r);
    const st6 = await w.cli(['dialog', 'status']);
    const next = await w.cli(['get', 'title']);
    ok(st6.code === 0 && st6.out.trim() === ST.NO_DIALOG_TEXT && next.code === 0 && next.ms < 10000 && !/not responding/.test(next.out + next.err), `⑥ …the dialog is gone and the page ANSWERS the next daemon (${next.ms} ms: "${next.out.trim()}") — never the measured 16 s "tab is not responding"`, { st6, next });
    // measured here: Chrome cancelled the held navigation when its initiator went away — the page stays alive; the agent re-runs `open`
    let again = await w.cli(['open', U('/other-3')]);
    if (again.code === 1 && again.out.startsWith(HEAD)) { await w.cli(['dialog', 'accept']); }
    const t3 = await until(async () => { const x = await w.cli(['get', 'title']); return /OTHER \/other-3/.test(x.out) ? x : null; }, 15000, 400);
    ok(!!t3, '⑥ …and the agent reaches the page it was going to (re-run `open`, answering the page\'s dialog again if it asks)', again);
    // ⑦ VERIFY r1 A5: a confirm held across a VibeSpace RESTART — the new watch attaches after the dialog opened and
    // cannot see into the tab (measured: its Page.enable never answers); before the fix `dialog status|dismiss` said "No
    // page dialog is open" and the stuck words pushed a Restart, while the lease's own daemon had seen the dialog
    await w.cli(['open', U('/form')]);
    r = await w.cli(['click', '#c']);
    ok(r.code === 1 && r.out.startsWith(HEAD + 'confirm: "Discard this draft?" (the page\'s own words)'), '⑦ a confirm holds the page', r);
    w.restartWatch();
    r = await w.cli(['open', U('/other-7')]);
    ok(r.code === 1 && r.out.startsWith(HEAD + 'confirm: "Discard this draft?"') && /\[dialog_open\]/.test(r.err) && r.ms < 10000, `⑦ right after the restart the next verb still names the dialog (${r.ms} ms) — the lease's daemon's line, as THE sentence`, r);
    r = await w.cli(['dialog', 'status']);
    ok(r.code === 0 && /confirm dialog is open: "Discard this draft\?"/.test(r.out) && !/No page dialog is open/.test(r.out), '⑦ `dialog status` asks the browser\'s own view — never "No page dialog is open"', r);
    r = await w.cli(['dialog', 'dismiss']);
    const t7 = await w.cli(['get', 'title']);
    ok(r.code === 0 && t7.code === 0 && /COMPOSE-DRAFT/.test(t7.out) && t7.ms < 10000, `⑦ \`dialog dismiss\` is answered by the daemon that saw it; the page answers again (${t7.ms} ms) — no Restart, nothing typed lost`, { r, t7 });
    await w.close();
  }
  // VERIFY r2 #3 (the real stack): a SHARED named profile, TWO conversations each on ITS tab, a confirm held on BOTH tabs at
  // once, no live view (the watch cannot tell whose tab is whose: `unattributed`) — each conversation's verbs name and
  // answer ITS OWN tab's dialog only (the lease's own daemon answers for its tab; the watch attributes nothing)
  console.log('— r2 #3: two conversations on one shared profile, a dialog on both tabs');
  let s2 = null; try { s2 = await world('two', { second: true }); } catch (err) { skip(`two conversations: the keeper could not launch: ${err && err.message}`); }
  if (s2) {
    // one driver at a time (owner ruling A (2)): each conversation acts in ITS turn — A, then (A quiet) B, then A, then B
    const turn = () => sleep(1700);
    const oa = await s2.cli(['open', U('/ask/A')]);
    const ca = await s2.cli(['click', '#c']); // A's page asks — [dialog_open] (the lease daemon's own line, converted: the watch cannot tell whose tab)
    await turn();
    const ob = await s2.cliB(['open', U('/ask/B')]);
    const cb = await s2.cliB(['click', '#c']); // …and B's page asks too: BOTH dialogs are open at once
    const pages = (await s2.jsonList()).filter((t) => t.type === 'page' && /\/ask\//.test(t.url));
    ok(oa.code === 0 && ob.code === 0 && pages.length === 2, `r2 #3 setup: each conversation opened ITS page in ITS tab of the one shared browser (${pages.length} tabs), one driver at a time`, { oa: oa.err.slice(0, 300), ob: ob.err.slice(0, 300), pages: pages.map((x) => x.url) });
    await turn();
    const sa = await s2.cli(['dialog', 'status']);
    await turn();
    const sb = await s2.cliB(['dialog', 'status']);
    ok(/A asks: discard\?/.test(ca.out) && /B asks: transfer\?/.test(cb.out) && !/B asks/.test(ca.out + ca.err) && !/A asks/.test(cb.out + cb.err)
      && /A asks: discard\?/.test(sa.out) && !/B asks/.test(sa.out + sa.err) && /B asks: transfer\?/.test(sb.out) && !/A asks/.test(sb.out + sb.err),
      'r2 #3: with BOTH dialogs held, each conversation\'s click and `dialog status` name ITS page\'s dialog only (never the other conversation\'s words)', { ca: ca.out.slice(0, 160) + ca.err.slice(0, 160), cb: cb.out.slice(0, 160) + cb.err.slice(0, 160), sa: sa.out.slice(0, 200) + sa.err.slice(0, 200), sb: sb.out.slice(0, 200) + sb.err.slice(0, 200) });
    await turn();
    const da = await s2.cli(['dialog', 'dismiss']);
    await sleep(300);
    const sa2 = await s2.cli(['get', 'title']);
    await turn();
    const sb2 = await s2.cliB(['dialog', 'status']);
    ok(da.code === 0 && sa2.code === 0 && /ASK A/.test(sa2.out) && /B asks: transfer\?/.test(sb2.out), 'r2 #3: A\'s `dialog dismiss` answers A\'s dialog only — A\'s page answers again, B\'s dialog is still open for B', { da: da.out + da.err, sa2: sa2.out + sa2.err, sb2: sb2.out + sb2.err });
    const db = await s2.cliB(['dialog', 'accept']);
    await sleep(300);
    const sb3 = await s2.cliB(['get', 'title']);
    ok(db.code === 0 && sb3.code === 0 && /ASK B/.test(sb3.out), 'r2 #3: B answers its own', { db: db.out + db.err, sb3: sb3.out + sb3.err });
    await s2.close();
  }
  // THE COMMON AGENT PATH: the conversation's own EPHEMERAL browser (rung D — its spawn config holds dialogs)
  console.log('— the ephemeral browser (rung D): the same dialog through the conversation\'s own browser');
  let e = null; try { e = await world('eph', { ephemeral: true }); } catch (err) { skip(`ephemeral: the keeper could not start a browser: ${err && err.message}`); }
  if (e) {
    let r = await typeDraft(e, 'eph draft');
    const rec = e.kk.ephemeralFor(e.KEY);
    ok(r.code === 0 && rec && rec.state === 'ready' && e.kk.holdsDialogsFor(rec.profileId) === true, 'the first verbs started the conversation\'s own browser (managed ephemeral); it holds dialogs (its spawn config says noAutoDialog)', { r, rec });
    const b0 = e.opens.length;
    r = await e.cli(['open', U('/other-e')]);
    const ev = e.opens[b0];
    ok(r.code === 1 && r.out.startsWith(HEAD + 'beforeunload:') && ev && r.exitAt - ev.at < 1000, `ephemeral: \`open\` elsewhere ⇒ [dialog_open] within 1 s of the event (${ev ? r.exitAt - ev.at : '?'} ms)`, r);
    r = await e.cli(['dialog', 'dismiss']);
    await sleep(400);
    const v = await e.cli(['get', 'value', '#f']);
    ok(r.code === 0 && /draft/.test(v.out), 'ephemeral: `dialog dismiss` keeps the page and the draft', { r, v });
    await e.close();
  }
  // CONTROL: the pre-lane launch config (nothing holds the dialog) — 0.38.1 accepts the beforeunload silently
  console.log('— CONTROL: a keeper whose launch holds nothing (the pre-lane config)');
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const needle = "    if (!mark) return kind !== 'ephemeral';";
  if (!ksrc.includes(needle)) ok(false, 'control setup: the dialog rule is found in src/server/browser-keeper.js');
  else {
    const Kmut = MUT.load('src/server/browser-keeper.js', ksrc.replace(needle, '    return false;').split('rec.holdDialogs = true;').join(''), 'no-hold'); // the pre-lane keeper: no noAutoDialog in any file, no launch stamp
    let c = null; try { c = await world('ctl', { Kmod: Kmut }); } catch (e) { skip(`control: the keeper could not launch: ${e && e.message}`); }
    if (c) {
      ok(c.launchCfg() && c.launchCfg().noAutoDialog === undefined, 'control setup: its launch config carries no noAutoDialog');
      await typeDraft(c, 'lost draft');
      const r = await c.cli(['open', U('/other-c')]);
      const t = await c.cli(['get', 'title']);
      await c.cli(['open', U('/form')]);
      const v = await c.cli(['get', 'value', '#f']);
      ok(r.code === 0 && r.ms < 5000 && /OTHER \/other-c/.test(t.out) && !/lost draft/.test(v.out), `CONTROL: without it the navigation answers ok in ${r.ms} ms and the typed draft is GONE — the browser CLI's silent beforeunload accept the lane turns off`, { r, t: t.out, v: v.out });
      ok(/the browser accepted the page's leave-page dialog by itself — the page was left and what was typed on it is gone/.test(r.err) && !/dialog_open/.test(r.out + r.err), '…and on such a browser (launched before the lane) the watch never reports a dialog 0.38.1 closes itself — it SAYS afterwards that the draft is gone', r);
      await c.close();
    }
  }
} finally { pages.close(); cleanup(); }
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed, ${skipped} skipped)` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);

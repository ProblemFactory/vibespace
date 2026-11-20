#!/usr/bin/env node
// B-e674 UNIT 1 (the coordinator's r548 / r562) — THE FRONT OF THIS VIEW'S WINDOW, SAID. On a shared profile a tab that is not
// this holder's can sit in FRONT of its window (a plain create lands in Chrome's last focused window — src/browser-windows.js
// WINDOWS_PROOF), and the view's row could not name it: the root behind the owner's report of 2026-11-19 (B-c9e3). Fast,
// in-process, a stand-in driver only:
//   ① PURE src/browser-tabs.js — frontVerdict over every cell (no window · one tab · unread ×3 · own · foreign ×4 · the
//      person's own window ×2 · id case), RED CONTROL a guessing copy; frontText (whose it is, then what the view does); the
//      row DRAWS a foreign front tab (a blank nobody holds included), marks it, never folds it — CONTROL the same row
//      without the verdict hides it; its own / unread / id-less fronts draw nothing new;
//   ② THE REAL KEEPER over a stand-in agent-browser (test-browser-tabs' shape) and stand-in CDP reads (targets, windows,
//      visibility): tabOwnersFor answers the front of the viewed holder's window — a tab nobody holds, another
//      conversation's (whose), its own again, unread, one tab, the person's own browsing window; its own tab is asked FIRST;
//      ONE journal line a change and its end; NOTHING ACTED (no window opened, no tab closed or activated, no driver
//      command); RED CONTROL — the keeper copy without the read answers no front;
//   ③ THE REAL BRIDGE over a stand-in upstream: `tab-owners` carries the front of a tab this view lists (only its state
//      otherwise); the viewed tab going behind its window, and showing again, asks the owners again;
//   ④ the words: every key frontText asks t() for has a zh and a ja row.
// ~3 s, port 0, scratch dirs only, no real browser, no vendor call.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch, freePort, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000, step = 20) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
const quiet = { log() { }, warn() { }, error() { }, info() { } };
const T = (n) => n.toString(16).toUpperCase().padStart(4, '0') + 'E'.repeat(28);
const TT = require('../src/browser-tabs.js');
const ROOT = scratch('fronttab');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
const servers = [];
const pidFiles = [];
process.on('exit', () => {
  for (const s of servers) { try { s.close(); } catch { /* closed */ } }
  for (const f of pidFiles) { try { for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) { try { process.kill(Number(l), 'SIGKILL'); } catch { /* gone */ } } } catch { /* none */ } }
});
/** A copy of a src/ module with every relative require made absolute (a patched copy for a RED control). */
const absReq = (src, dir) => src.replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g, (m, q, rel) => 'require(' + JSON.stringify(path.resolve(dir, rel)) + ')');

// ═══ ① PURE ═══════════════════════════════════════════════════════════════════
console.log('— ① PURE: frontVerdict over every cell, its words, the row draws a foreign front (never folded)');
{
  const A = T(1), Bq = T(2), C = T(3), D = T(4), E = T(5);
  const windows = { [A]: 1, [Bq]: 1, [C]: 2, [D]: 1 };
  const owners = { [A]: 'agent', [Bq]: 'other', [C]: 'agent', [D]: 'orphan' };
  const fv = (o) => TT.frontVerdict({ windows, owners, ...o });
  const person = { [A]: 'you', [Bq]: 'other', [D]: 'orphan' };
  const cells = [
    ['no window known', fv({ windowId: null, visible: [A] }), { state: 'none' }],
    ['one tab in it', fv({ windowId: 2, visible: [C] }), { state: 'single', targetId: C, mates: 1 }],
    ['nobody answered visible', fv({ windowId: 1, visible: [] }), { state: 'unread', mates: 3 }],
    ['two answered visible (a window shows one tab: never guessed)', fv({ windowId: 1, visible: [A, Bq] }), { state: 'unread' }],
    ['a visible tab of ANOTHER window', fv({ windowId: 1, visible: [C] }), { state: 'unread' }],
    ['this holder\'s own tab in front', fv({ windowId: 1, visible: [A] }), { state: 'own', targetId: A, owner: 'agent' }],
    ['another conversation\'s tab in front', fv({ windowId: 1, visible: [Bq] }), { state: 'foreign', targetId: Bq, owner: 'other' }],
    ['a tab nobody holds in front', fv({ windowId: 1, visible: [D] }), { state: 'foreign', targetId: D, owner: 'orphan' }],
    ['the person\'s tab in front of a conversation\'s window', TT.frontVerdict({ windowId: 1, windows, owners: { ...owners, [D]: 'you' }, visible: [D] }), { state: 'foreign', owner: 'you' }],
    ['an unknown owner reads nobody\'s', TT.frontVerdict({ windowId: 1, windows, owners: { [A]: 'agent' }, visible: [Bq] }), { state: 'foreign', owner: 'orphan' }],
    ['the person\'s own window: their tab in front', TT.frontVerdict({ windowId: 1, windows, owners: person, visible: [A], human: true }), { state: 'own', owner: 'you' }],
    ['the person\'s own window: a conversation\'s tab in front', TT.frontVerdict({ windowId: 1, windows, owners: person, visible: [Bq], human: true }), { state: 'foreign', owner: 'other' }],
    ['a lower-case id is the same tab', fv({ windowId: 1, visible: [A.toLowerCase()] }), { state: 'own', targetId: A }],
  ];
  const bad = cells.filter(([, got, want]) => Object.entries(want).some(([k, v]) => got[k] !== v)).map(([n, got, want]) => ({ n, got, want }));
  ok(bad.length === 0 && cells.length === 13 && TT.FRONT_STATES.length === 5, `frontVerdict: ${cells.length} cells — none · single · unread ×3 · own · foreign ×4 · the person's window ×2 · the id's case`, bad);
  // RED CONTROL: a verdict that GUESSES (the first of several visible tabs) reads two visible tabs as one front
  const guess = anchored(fs.readFileSync(path.join(REPO, 'src/browser-tabs.js'), 'utf8'), "  if (vis.length !== 1) return { state: 'unread'", "  if (!vis.length) return { state: 'unread'", 'the guessing verdict');
  const gf = path.join(ROOT, 'browser-tabs-guess.js'); fs.writeFileSync(gf, absReq(guess, path.join(REPO, 'src')));
  const G = require(gf);
  ok(G.frontVerdict({ windowId: 1, windows, owners, visible: [A, Bq] }).state === 'own', 'RED CONTROL: the copy that takes the first of two visible tabs calls the front own — the «never guessed» cell can go red');
  const vO = fv({ windowId: 1, visible: [Bq] }), vN = fv({ windowId: 1, visible: [D] }), vY = TT.frontVerdict({ windowId: 1, windows, owners: { ...owners, [D]: 'you' }, visible: [D] });
  const w1 = TT.frontText(vO, { name: '企业助手' }), w2 = TT.frontText(vO, {}), w3 = TT.frontText(vY, {}), w4 = TT.frontText(vN, {}), w5 = TT.frontText(fv({ windowId: 1, visible: [A] }), {});
  ok(w1.mark === 'In front of this window' && w1.tip.startsWith('企业助手’s tab is in front of this window') && /the picture here stays this view’s own tab; nothing is moved or closed for it$/.test(w1.tip)
    && w2.tip.startsWith('Another conversation’s tab is in front') && w3.tip.startsWith('Your tab is in front') && w4.tip.startsWith('A tab nobody holds is in front') && w5.mark === '' && w5.tip === '',
  'frontText: whose it is (by name, another conversation\'s, yours, nobody\'s), then what the view does — nothing for its own tab', { w1, w2, w3, w4, w5 });
  const tabs = [{ targetId: A, url: 'https://a.example/', title: 'A', active: true }, { targetId: D, url: 'about:blank', title: '' }, { targetId: E, url: 'about:blank', title: '' }];
  const ow2 = { [A]: 'agent', [D]: 'orphan', [E]: 'agent' }, wn2 = { [A]: 1, [D]: 1, [E]: 1 };
  const leases = [{ windowId: 1, holder: { word: 'agent' } }];
  const front = TT.frontVerdict({ windowId: 1, windows: wn2, owners: ow2, visible: [D] });
  const m1 = TT.tabRowModel({ tabs, owners: ow2, windows: wn2, leases, front });
  const m0 = TT.tabRowModel({ tabs, owners: ow2, windows: wn2, leases });
  const rD = m1.rows.find((r) => r.targetId === D);
  console.log(`  · the row with the verdict: ${JSON.stringify(m1.rows.map((r) => [r.targetId.slice(0, 4), r.owner, r.front, r.frontText]))} · +${m1.blanks} blank; without it: ${JSON.stringify(m0.rows.map((r) => r.targetId.slice(0, 4)))} · +${m0.blanks} blank`);
  ok(front.state === 'foreign' && !!rD && rD.front === true && rD.frontText === 'In front of this window' && /nobody holds/.test(rD.frontTip) && m1.rows.filter((r) => r.front).length === 1 && m1.blanks === 1,
    'the row DRAWS the blank nobody holds that is in front of this window — marked, its tip says whose; the other spare blank still folds (+1)');
  ok(!m0.rows.some((r) => r.targetId === D) && !m0.rows.some((r) => r.front), 'CONTROL: the same row without the verdict hides that blank — the window would show a page the row cannot name (B-c9e3\'s report)');
  const mOwn = TT.tabRowModel({ tabs, owners: ow2, windows: wn2, leases, front: TT.frontVerdict({ windowId: 1, windows: wn2, owners: ow2, visible: [A] }) });
  const mUn = TT.tabRowModel({ tabs, owners: ow2, windows: wn2, leases, front: { state: 'unread' } });
  const mBare = TT.tabRowModel({ tabs, owners: ow2, windows: wn2, leases, front: { state: 'foreign' } }); // the bridge's answer for a tab this view does not list
  ok([mOwn, mUn, mBare].every((m) => !m.rows.some((r) => r.front) && !m.rows.some((r) => r.targetId === D)), 'its own tab in front, an unread front and a foreign front without a tab id draw nothing new');
  const gt = [{ targetId: A, url: 'https://a.example/', active: true, windowId: 1 }, { targetId: D, url: 'about:blank', windowId: 1 }, { targetId: E, url: 'about:blank', windowId: 1 }];
  const g1 = TT.tabGroups({ tabs: gt, front: D }), g0 = TT.tabGroups({ tabs: gt });
  ok(g1.order.includes(D) && !g1.order.includes(E) && g1.blanks === 1 && g0.blanks === 2 && !g0.order.includes(D), 'tabGroups: the tab in front of a window is never folded as a spare blank (CONTROL: without it both blanks fold)', { g1: g1.order, g0: g0.order });
}

// ═══ ② THE REAL KEEPER over a stand-in driver ═══════════════════════════════════════════
console.log('— ② the real keeper over a stand-in agent-browser + stand-in CDP reads: the front of the viewed holder\'s window');
const K = require('../src/server/browser-keeper.js'), F = require('../src/browser-facts.js'), B = require('../src/browser-profiles.js'), WIN = require('../src/browser-windows.js');
const KA = 'bk-0000fa01', KB = 'bk-0000fb02';
const DEAD_CDP = await freePort();
const F2 = (n) => n.toString(16).toUpperCase().padStart(4, '0') + 'F'.repeat(28); // the stand-in driver's own target ids
async function world(Kmod, tag) {
  const D0 = path.join(ROOT, tag), BIN = path.join(D0, 'bin'), AB = path.join(D0, 'ab'), HOME = path.join(D0, 'home'), DATA = path.join(D0, 'data'), XDG = path.join(D0, 'x');
  for (const d of [BIN, AB, path.join(HOME, '.agent-browser'), DATA, XDG]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  pidFiles.push(path.join(AB, 'pids'));
  // the stand-in agent-browser: test-browser-tabs' (ONE shared Chrome's tabs per namespace — the measured 0.38.1 shapes)
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const write = (s) => { fs.writeFileSync(f + '.part', JSON.stringify(s)); fs.renameSync(f + '.part', f); };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const raw = process.argv.slice(2);
const pin = raw.includes('--pin-tab');
const argv = raw.filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
fs.appendFileSync(path.join(st, 'cmds.log'), JSON.stringify({ ns, sess, argv: raw }) + '\\n');
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
let s = read();
const live = !!(s && alive(s.pid));
if (a === 'session' && b === 'info') { out({ success: true, data: { active: live, namespace: ns, pid: live ? s.pid : null, session: sess, socketDir: path.join(st, 'run') } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { if (!live) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { if (live) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'close') { out({ success: true, data: { closed: 1 } }); process.exit(0); }
const newTab = (url, label, opener) => { s.n = (s.n || 0) + 1; const t = { tabId: 't' + s.n, targetId: (s.n.toString(16).toUpperCase().padStart(4, '0') + 'F'.repeat(28)), url: url || 'about:blank', title: 'Page ' + String(url || 'blank').replace(/^https?:\\/\\//, ''), label: label || null, opener: opener || null }; s.tabs.push(t); return t; };
if (!live) {
  if (process.env.AGENT_BROWSER_CDP) { out({ success: false, error: 'fake: nothing at that CDP url' }); process.exit(1); }
  const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n');
  s = { pid: c.pid, n: 0, tabs: [], sessions: {} };
}
// a session's FIRST command binds a new tab of its own (measured: never an existing one)
if (!(sess in s.sessions)) { if (a === 'tab' && b === 'new') s.sessions[sess] = null; else { const t = newTab('about:blank'); s.sessions[sess] = t.targetId; } }
const bound = () => s.tabs.find((t) => t.targetId === s.sessions[sess]) || null;
const done = (o) => { write(s); out(o); process.exit(o.success ? 0 : 1); };
const gone = () => done({ success: false, code: 'tab_gone', data: { targetId: s.sessions[sess] }, error: 'tab_gone: bound tab is gone' });
const find = (ref) => s.tabs.find((t) => t.tabId === ref || t.targetId === String(ref).toUpperCase() || (t.label && t.label === ref)) || null;
if (a === 'stream' && b === 'status') { let ports = {}; try { ports = JSON.parse(fs.readFileSync(path.join(st, 'ports.json'), 'utf8')); } catch { } const port = ports[ns + '|' + sess] || null; done(port ? { success: true, data: { enabled: true, connected: true, port } } : { success: false, error: 'fake: no stream' }); }
if (a === 'tab') {
  const rest = argv.slice(1);
  if (!rest.length || rest[0] === 'list') done({ success: true, data: { tabs: s.tabs.map((t) => ({ active: t.targetId === s.sessions[sess], label: t.label, tabId: t.tabId, targetId: t.targetId, title: t.title, type: 'page', url: t.url })) } });
  if (rest[0] === 'new') { let label = null; const r2 = rest.slice(1); const li = r2.indexOf('--label'); if (li >= 0) { label = r2[li + 1]; r2.splice(li, 2); } const t = newTab(r2[0], label); s.sessions[sess] = t.targetId; done({ success: true, data: { tabId: t.tabId, targetId: t.targetId, total: s.tabs.length, url: t.url, label } }); }
  if (rest[0] === 'close') { const t = rest[1] ? find(rest[1]) : bound(); if (!t) { if (!rest[1]) gone(); done({ success: false, error: 'fake: no tab ' + rest[1] }); } s.tabs = s.tabs.filter((x) => x !== t); done({ success: true, data: { closed: true, tabId: t.tabId, targetId: t.targetId } }); }
  const t = find(rest[0]); if (!t) done({ success: false, error: 'fake: no tab ' + rest[0] }); s.sessions[sess] = t.targetId; done({ success: true, data: { tabId: t.tabId, targetId: t.targetId, title: t.title, url: t.url } });
}
if (pin && !bound()) gone();
if (a === 'open') { const t = bound() || newTab(b); t.url = b; t.title = 'Page ' + String(b).replace(/^https?:\\/\\//, ''); done({ success: true, data: { targetId: t.targetId, url: b } }); }
if (a === 'popup') { const t = newTab(b, null, s.sessions[sess]); done({ success: true, data: { targetId: t.targetId } }); } // the test's own verb: the bound page opens a popup (target=_blank)
done({ success: true, data: { ok: true } });
`, { mode: 0o755 });
  const env = { PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME, FAKE_AB_STATE: AB, XDG_RUNTIME_DIR: XDG };
  const nsState = (ns) => { try { return JSON.parse(fs.readFileSync(path.join(AB, ns + '.json'), 'utf8')); } catch { return null; } };
  const edit = (ns, fn) => { const s = nsState(ns); fn(s); fs.writeFileSync(path.join(AB, ns + '.json'), JSON.stringify(s)); };
  const cmds = () => { try { return fs.readFileSync(path.join(AB, 'cmds.log'), 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
  // the keeper's CDP reads, stand-ins: the targets (the namespace's tabs), each tab's window (a map), each page's visibility (a set)
  const winOf = new Map(), vis = new Set(), reads = { vis: [], win: 0 }, acted = [];
  const readTargets = async (url) => { const m = /fake-(.+)$/.exec(String(url)); const s = m ? nsState(m[1]) : null; return s ? { ok: true, targets: s.tabs.map((t) => ({ targetId: t.targetId, type: 'page', url: t.url, title: t.title, openerId: t.opener || undefined })) } : { ok: false, error: 'fake: no browser' }; };
  const windowOf = async (url, id) => { reads.win++; return winOf.has(id) ? winOf.get(id) : null; };
  const visibilityOf = async (url, id) => { reads.vis.push(id); return { ok: true, visibility: vis.has(id) ? 'visible' : 'hidden' }; };
  // every seam that ACTS on a window or a tab is a spy: the front is said, never acted on
  const spy = (name) => async () => { acted.push(name); return { ok: false, error: 'the gate opens no window' }; };
  const journal = [];
  const jlog = { log: (x) => journal.push(String(x)), warn: (x) => journal.push(String(x)), error() { }, info() { } };
  const k = Kmod.create({ dataDir: DATA, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => new Set([KA, KB]), runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: jlog, install: false, tickMs: 3600e3,
    readTargets, windowOf, visibilityOf, openWindow: spy('openWindow'), closeTarget: spy('closeTarget'), openTabInWindow: spy('openTabInWindow'), openTabByActivate: spy('openTabByActivate'), conversationFacts: () => ({ turn: 'idle' }) });
  await k._facts.probeVersion();
  const p = k.createProfile({ label: 'Work' }, { owner: { kind: 'instance', id: null } });
  const NS = B.sessionNameFor(p.id);
  await k.browse(p.id); // the person browses "Work" (their own tab)
  const HUK = require('../src/browser-human.js').humanKeyFor(p.id);
  for (const [bk, sid] of [[KA, 'sess-a'], [KB, 'sess-b']]) await k.attach({ profileId: p.id, browserKey: bk, sessionId: sid, by: 'agent' });
  const run = async (bk, argv) => k._runtime.exec(NS, argv, await k.leaseCliOpts(p.id, bk));
  const tid = (r) => (r && r.json && r.json.data && r.json.data.targetId) || null;
  const aTab = tid(await run(KA, ['--pin-tab', 'open', 'https://a.example/1'])), bTab = tid(await run(KB, ['--pin-tab', 'open', 'https://b.example/2']));
  const hisTab = (nsState(NS) || { sessions: {} }).sessions['vs-' + HUK] || null;
  // the leases' roots and windows — what the attach and the command's audit write on a real browser (the stand-in has no windows)
  const stamped = k.reshapeStore((reg) => {
    const rec = reg.browsers[p.id]; if (!rec || !WIN.instanceOf(rec)) return false;
    for (const [bk, tab, win] of [[KA, aTab, 1], [KB, bTab, 2]]) { const l = reg.leases.find((x) => x.profileId === p.id && String(x.browserKey) === bk); if (!l) return false; l.windowIn = WIN.instanceOf(rec); l.windowId = win; l.tabRoots = [tab]; }
    return true;
  });
  return { k, p, NS, HUK, aTab, bTab, hisTab, stamped, run, winOf, vis, reads, acted, journal, cmds, edit, nsState };
}
const W = await world(K, 'k');
const TA = { kind: 'attachment', profileId: W.p.id, sessionName: 'vs-' + KA, ns: W.NS }, TB = { kind: 'attachment', profileId: W.p.id, sessionName: 'vs-' + KB, ns: W.NS };
const TH = { kind: 'human', key: W.HUK, profileId: W.p.id };
ok(!!(W.stamped && W.aTab && W.bTab && W.hisTab && new Set([W.aTab, W.bTab, W.hisTab]).size === 3), 'the world: "Work" browsed by the person, leased by conversations A and B — each its own tab, each lease its own window (A 1, B 2)', { aTab: W.aTab, bTab: W.bTab, hisTab: W.hisTab, stamped: W.stamped });
// a raw create (a client the hub does not drive) lands a blank in A's window — Chrome's last focused one
const ORPH = F2(0x99);
W.edit(W.NS, (s) => { s.tabs.push({ tabId: 't99', targetId: ORPH, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
W.winOf.set(W.aTab, 1); W.winOf.set(ORPH, 1); W.winOf.set(W.bTab, 2); W.winOf.set(W.hisTab, 3);
const acted0 = W.acted.length;
let driverDuring = 0;
const owners = async (target, activeTarget) => { const c0 = W.cmds(); W.reads.vis.length = 0; const j0 = W.journal.length; const r = await W.k.tabOwnersFor(target, { activeTarget }); driverDuring += W.cmds() - c0; return { r, reads: W.reads.vis.slice(), said: W.journal.slice(j0).filter((l) => /in front/.test(l)) }; };
const id8 = (x) => String(x).slice(0, 8);
{
  W.vis.clear(); W.vis.add(ORPH);
  const a = await owners(TA, W.aTab);
  console.log(`  · A's view, a blank in front: ${JSON.stringify(a.r.front)} · reads ${JSON.stringify(a.reads.map(id8))} · said ${JSON.stringify(a.said)}`);
  ok(!!(a.r.ok && a.r.front && a.r.front.state === 'foreign' && a.r.front.owner === 'orphan' && a.r.front.targetId === ORPH && a.r.front.windowId === 1 && a.r.owners[ORPH] === 'orphan'), 'A\'s view: a tab NOBODY holds is in front of A\'s window — the keeper names it (foreign, nobody\'s, window 1)');
  ok(a.reads.length === 2 && a.reads[0] === W.aTab && a.reads[1] === ORPH, 'the reads: A\'s own tab on show is asked FIRST (it answered hidden), then its one window-mate — never another window\'s tab');
  ok(a.said.length === 1 && a.said[0].includes(`in front of the conversation ${KA}'s window 1: a tab nobody holds ${id8(ORPH)} — said on its view; nothing moved, closed or activated`), 'ONE journal line says it: whose window, whose tab, and that nothing was acted on');
  const a2 = await owners(TA, W.aTab);
  ok(a2.r.front && a2.r.front.state === 'foreign' && a2.r.front.targetId === ORPH && a2.said.length === 0, 'asked again with the same facts: the same verdict, nothing said twice');
  // B's page opens a popup that lands in A's window (B's driver's plain create) and takes the front
  const bPop = (await W.run(KB, ['popup', 'https://b.example/pop'])).json.data.targetId;
  W.winOf.set(bPop, 1); W.vis.clear(); W.vis.add(bPop);
  const b = await owners(TA, W.aTab);
  console.log(`  · A's view, B's popup in front: ${JSON.stringify(b.r.front)} · whose ${JSON.stringify(b.r.whose && b.r.whose[bPop])} · said ${JSON.stringify(b.said)}`);
  ok(!!(b.r.front && b.r.front.state === 'foreign' && b.r.front.owner === 'other' && b.r.front.targetId === bPop && b.r.whose && b.r.whose[bPop] && b.r.whose[bPop].sessionId === 'sess-b'), 'A\'s view: ANOTHER conversation\'s tab (B\'s popup, B\'s by the popup rule) in front of A\'s window — named, and whose (B\'s session)');
  ok(b.said.length === 1 && b.said[0].includes(`another conversation's tab (session sess-b) ${id8(bPop)}`), 'its journal line names the other conversation by its session — one line for the change');
  // A's own tab comes back to the front
  W.vis.clear(); W.vis.add(W.aTab);
  const c = await owners(TA, W.aTab);
  ok(!!(c.r.front && c.r.front.state === 'own' && c.r.front.targetId === W.aTab && c.reads.length === 1 && c.said.length === 1 && c.said[0].includes(`has its own tab ${id8(W.aTab)} in front again`)), 'A\'s own tab in front again: ONE read (asked first, it answered visible), and one line ends what was said', { front: c.r.front, reads: c.reads, said: c.said });
  // nobody answers visible
  W.vis.clear();
  const d = await owners(TA, W.aTab);
  ok(!!(d.r.front && d.r.front.state === 'unread' && d.reads.length === 3 && d.said.length === 0), 'nobody answers visible: unread — all three window-mates asked, nothing said, nothing guessed', { front: d.r.front, reads: d.reads.length });
  // B's view: one tab in its window
  const e = await owners(TB, W.bTab);
  ok(!!(e.r.front && e.r.front.state === 'single' && e.reads.length === 0), 'B\'s view: its window holds one tab — nothing can stand in front of it, and no page is asked', { front: e.r.front, reads: e.reads.length });
  // the person's own browsing window: A's popup lands there and takes the front
  const aPop = (await W.run(KA, ['popup', 'https://a.example/pop'])).json.data.targetId;
  W.winOf.set(aPop, 3); W.vis.clear(); W.vis.add(aPop);
  const h = await owners(TH, W.hisTab);
  console.log(`  · the person's window, A's popup in front: ${JSON.stringify(h.r.front)} · said ${JSON.stringify(h.said)}`);
  ok(!!(h.r.front && h.r.front.state === 'foreign' && h.r.front.owner === 'other' && h.r.front.targetId === aPop && h.reads[0] === W.hisTab && h.said.length === 1 && h.said[0].includes('in front of the person\'s browsing window 3: another conversation\'s tab')), 'the person\'s own browsing window: a conversation\'s tab in front of it is named too (their own tab asked first)');
  ok(W.acted.length === acted0 && driverDuring === 0, `NOTHING ACTED for any front: no window opened, no tab closed or activated (${W.acted.length - acted0} acting calls), no driver command (${driverDuring}) — reads only`);
}
// RED CONTROL: the keeper without the unit (its tabOwnersFor reads no front)
{
  let ks = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  ks = anchored(ks, '    const front = await frontOfView(p, rec, { windows, words, act, bk, h, leases, whose }); // B-e674 unit 1\n', '    const front = undefined;\n', 'the keeper without the front read');
  const kf = path.join(ROOT, 'keeper-pre.js'); fs.writeFileSync(kf, absReq(ks, path.join(REPO, 'src/server')));
  const P = await world(require(kf), 'pre');
  const O2 = F2(0x99);
  P.edit(P.NS, (s) => { s.tabs.push({ tabId: 't99', targetId: O2, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  P.winOf.set(P.aTab, 1); P.winOf.set(O2, 1); P.vis.add(O2);
  const r = await P.k.tabOwnersFor({ kind: 'attachment', profileId: P.p.id, sessionName: 'vs-' + KA, ns: P.NS }, { activeTarget: P.aTab });
  ok(!!(P.stamped && r.ok && r.front === undefined && r.owners[O2] === 'orphan' && !P.journal.some((l) => /in front of/.test(l))), 'RED CONTROL: the keeper without the unit answers no front for the same window and says nothing — the legs above can go red', { front: r.front, owner: r.owners && r.owners[O2] });
  P.k.shutdown();
}
W.k.shutdown();

// ═══ ③ THE REAL BRIDGE over a stand-in upstream ═══════════════════════════════════════════
console.log('— ③ the real bridge: tab-owners carries the front; the viewed tab going behind (and back) asks again');
{
  const { WebSocket, WebSocketServer } = require('ws');
  const Bmod = require('../src/server/browser-stream.js');
  const X1 = T(0x11), X2 = T(0x12), X3 = T(0x13);
  let frontAns = { state: 'foreign', windowId: 1, targetId: X2, owner: 'other', mates: 2 };
  let visAns = 'visible';
  const calls = [];
  const fakeKeeper = {
    setFor: () => ({ attachments: [{ profileId: 'bp-0000c0f1', alias: 'work', isDefault: true, label: 'Work' }], handles: ['work'], defaultId: 'bp-0000c0f1', children: [] }),
    list: () => ({ profiles: [{ id: 'bp-0000c0f1', label: 'Work' }] }),
    streamPortFor: async () => ({ ok: true, port: upPort }),
    inputStateFor: () => ({ input: 'agent' }),
    tabOwnersFor: async (target, o) => { calls.push({ activeTarget: o.activeTarget }); return { ok: true, owners: { [X1]: 'agent', [X2]: 'other' }, whose: { [X2]: { sessionId: 'sess-b' } }, windows: { [X1]: 1, [X2]: 1 }, leases: [{ windowId: 1, word: 'agent' }], front: frontAns, mediated: false, adoptable: false }; },
    tabVisibilityFor: async () => ({ ok: true, visibility: visAns }),
    captureTabFor: async () => ({ ok: false, error: 'the gate draws no picture' }), // a background tab's polled picture: none here
  };
  const upWss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await new Promise((r) => upWss.on('listening', r));
  const upPort = upWss.address().port;
  let upWs = null;
  const tabsRec = () => JSON.stringify({ type: 'tabs', tabs: [{ tabId: 't1', targetId: X1, title: 'A', url: 'https://a.example/', active: true }, { tabId: 't2', targetId: X2, title: 'B', url: 'https://b.example/' }] });
  upWss.on('connection', (ws) => { upWs = ws; ws.send(JSON.stringify({ type: 'status', connected: true })); ws.send(tabsRec()); });
  const activeS = new Map([['sess-a', { _browserKey: KA, webuiId: 'sess-a' }], ['sess-b', { name: 'Report', webuiId: 'sess-b' }]]);
  const bridge = Bmod.create({ keeper: fakeKeeper, activeSessions: activeS, requestAuthed: () => true, log: quiet, bgTickMs: 40, bgSilenceMs: 150 });
  const hs = http.createServer(); servers.push(hs); hs.on('upgrade', (req, sock, head) => bridge.handleUpgrade(req, sock, head));
  await new Promise((r) => hs.listen(0, '127.0.0.1', r));
  const ws = new WebSocket(`ws://127.0.0.1:${hs.address().port}/api/browser/stream?session=sess-a`); const got = [];
  ws.on('message', (d) => { try { got.push(JSON.parse(d)); } catch { /* not ours */ } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  const owners1 = await until(() => got.find((m) => m.type === 'tab-owners'), 3000);
  console.log(`  · the first tab-owners: front ${JSON.stringify(owners1 && owners1.front)} · names ${JSON.stringify(owners1 && owners1.names)}`);
  ok(!!(owners1 && owners1.front && owners1.front.state === 'foreign' && owners1.front.targetId === X2 && owners1.front.owner === 'other' && owners1.front.windowId === 1 && owners1.names[X2] && owners1.names[X2].name === 'Report'), 'tab-owners carries the front of this view\'s window (a tab it lists) — whose by name, as any other holder\'s tab');
  // the viewed tab goes BEHIND its window (no frame, it answers hidden): the owners are asked again
  const n0 = calls.length; visAns = 'hidden';
  const bg = await until(() => got.find((m) => m.type === 'tab-background' && m.targetId === X1), 3000);
  const again = await until(() => calls.length > n0, 3000);
  ok(!!(bg && again), `the viewed tab going behind its window asks the owners again (${calls.length - n0} more ask(s)) — the front is judged at the moment it changes, never on a timer of its own`);
  // …and showing again (its first frame, then it answers visible)
  const n1 = calls.length; visAns = 'visible';
  upWs.send(JSON.stringify({ type: 'frame', data: '', metadata: {} }));
  const cleared = await until(() => got.find((m) => m.type === 'tab-background' && m.targetId === null), 3000);
  const again2 = await until(() => calls.length > n1, 3000);
  ok(!!(cleared && again2), 'and its showing again asks once more');
  // CONTROL: a front naming a tab this view does not list carries only its state (nothing to name, nothing drawn)
  frontAns = { state: 'foreign', windowId: 1, targetId: X3, owner: 'orphan', mates: 3 };
  const n2 = got.filter((m) => m.type === 'tab-owners').length;
  upWs.send(tabsRec().replace('"t2"', '"t2b"'));
  const owners2 = await until(() => { const l = got.filter((m) => m.type === 'tab-owners'); return l.length > n2 ? l[l.length - 1] : null; }, 3000);
  ok(!!(owners2 && owners2.front && owners2.front.state === 'foreign' && owners2.front.targetId === undefined), 'CONTROL: a front naming a tab this view does not list carries its state alone — no id, so the row marks nothing', owners2 && owners2.front);
  ws.close(); bridge.shutdown?.(); upWss.close();
}

// ═══ ⑤ THE FIT (the coordinator's r608: line 97's picture at 390 px folded the front chip into «▾+1») ═══════════════════
console.log('— ⑤ the fit: a foreign front is never folded by width — this view\'s own chip cuts first, else the fold says it');
{
  const LS = require('../src/lib/live-strip-layout.js');
  const id = (c) => c.repeat(32);
  const own = { targetId: id('A'), title: 'Enterprise | Find a supplier', owner: 'agent', active: true };
  const fr = { targetId: id('E'), title: 'Read - Meeting Report', owner: 'other', front: true };
  const o = (n) => ({ targetId: id(String(n)), title: 'other page ' + n, owner: 'agent' });
  const W = (pairs) => Object.fromEntries(pairs.map(([r, w]) => [r.targetId, w]));
  const say = (r) => ({ v: r.visible.map((x) => x[0]), f: r.folded.map((x) => x[0]), cut: r.ownCutPx, foldFront: r.foldFront && r.foldFront[0] });
  const cells = [
    ['a row of two, roomy', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 240], [fr, 240]]), avail: 700, endPx: 60 }), (r) => r.visible.length === 2 && r.ownCutPx === null && r.foldFront === null],
    ['a row of two, narrow: this view\'s own chip cuts, the front stays whole', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 240], [fr, 200]]), avail: 420, endPx: 60, ownMinPx: 120 }), (r) => r.visible.includes(fr.targetId) && r.ownCutPx === 160 && r.foldFront === null],
    ['a row of five, narrow: three fold, own + front stay', LS.tabRowFit({ rows: [own, fr, o(1), o(2), o(3)], widths: W([[own, 240], [fr, 200], [o(1), 150], [o(2), 150], [o(3), 150]]), avail: 470, endPx: 60, ownMinPx: 120 }), (r) => r.visible.join() === [own.targetId, fr.targetId].join() && r.folded.length === 3 && r.ownCutPx === 166 && r.foldFront === null],
    ['one own chip with a long name', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 480], [fr, 200]]), avail: 420, endPx: 60, ownMinPx: 120 }), (r) => r.visible.includes(fr.targetId) && r.ownCutPx === 160],
    ['too narrow even for a cut own chip: the front folds and THE FOLD SAYS IT', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 240], [fr, 200]]), avail: 300, endPx: 60, ownMinPx: 140 }), (r) => !r.visible.includes(fr.targetId) && r.folded.includes(fr.targetId) && r.foldFront === fr.targetId && r.ownCutPx === 196],
    ['no front: the row\'s own fold, nothing cut, nothing said', LS.tabRowFit({ rows: [own, o(1), o(2)], widths: W([[own, 240], [o(1), 150], [o(2), 150]]), avail: 400, endPx: 60 }), (r) => r.ownCutPx === null && r.foldFront === null && r.folded.length >= 1],
  ];
  for (const [n, r] of cells) console.log(`  · ${n}: ${JSON.stringify(say(r))}`);
  const bad = cells.filter(([, r, judge]) => !judge(r)).map(([n, r]) => ({ n, r: say(r) }));
  ok(bad.length === 0, `tabRowFit over ${cells.length} cells: never a front folded unsaid — whole beside a cut own chip, or the fold names it`, bad);
  // RED CONTROL: the row before r608 (the front not kept) folds it at the narrow width — and nothing says so
  const pre = LS.tabRowFit({ rows: [own, { ...fr, front: false }], widths: W([[own, 240], [fr, 200]]), avail: 420, endPx: 60, ownMinPx: 120 });
  ok(pre.folded.includes(fr.targetId) && pre.foldFront === null, 'RED CONTROL: unmarked, the same narrow row folds that tab with nothing said (line 97\'s 390 picture) — the cells above can go red', say(pre));
  // the client's wiring of the fit
  const LW = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  const PINS = [
    ['the fit is asked with the own chip\'s floor', 'const f = tabRowFit({'], ['…its floor measured (the chip without its title + a few letters)', "ownEl.offsetWidth - ((ownEl.querySelector('.browser-live-tabchip-title') || {}).offsetWidth || 0) + 28"],
    ['a cut is re-judged from whole widths', "for (const c of chips) c.style.maxWidth = '';"], ['the own chip\'s cut', "if (ownEl && f.ownCutPx != null) ownEl.style.maxWidth = f.ownCutPx + 'px';"],
    ['the fold says it in WORDS', "(fr ? ' · ' + t('In front') : '')"], ['…its tip the front\'s words', "(fr && fr.frontTip ? fr.frontTip + '\\n' : '')"],
    ['…its edge', "tabRowMore.classList.toggle('front-foreign', !!fr);"], ['the menu\'s FIRST row is the front', 'if (fr) items.push({ label: `${fr.frontText} — ${fr.title} · ${fr.mark}`'],
  ];
  const n = (txt, x) => txt.split(x).length - 1;
  const miss = PINS.filter(([, x]) => n(LW, x) !== 1).map(([w, x]) => ({ w, x, n: n(LW, x) }));
  ok(miss.length === 0, `the client's fit wiring, each line ONCE (${PINS.length} pins)`, miss);
}

// ═══ ④ THE WORDS ═════════════════════════════════════════════════════════════
console.log('— ④ the words: every key frontText asks t() for has a zh and a ja row');
{
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const keys = []; const t = (s) => { keys.push(s); return s; };
  for (const owner of ['other', 'you', 'orphan']) { TT.frontText({ state: 'foreign', owner }, { name: 'N' }, t); TT.frontText({ state: 'foreign', owner }, {}, t); }
  const lit = (s) => JSON.stringify(s).replace(/\\u([0-9a-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const has = (dict, k) => dict.includes(lit(k) + ':');
  const uniq = [...new Set(keys)];
  const miss = uniq.filter((k) => !has(zh, k) || !has(ja, k));
  keys.push('In front'); uniq.push('In front'); miss.push(...['In front'].filter((k) => !has(zh, k) || !has(ja, k))); // B-e674 (r608): the fold's word
  ok(uniq.length === 7 && miss.length === 0, `every key frontText (and the fold's «In front») asks t() for (${uniq.length}) has a zh and a ja row`, miss);
}
report();

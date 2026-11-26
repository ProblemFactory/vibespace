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
//   ④ the words: every key frontText / frontNoteText (and the fold's «In front») asks t() for has a zh and a ja row;
//   ⑤ the fit (r608): a foreign front is never folded by width — the own chip cuts first, else the fold names it (6 cells,
//      a RED control, the client's 8 pins);
//   ⑥ the client's wiring (unit 2): the record kept, handed to the row and the pane, drawn, cleared, never folded — 9 pins + a RED control;
//   ⑦ the census of create roads (unit 2): every create site named, every road proved or «not on the box»; the birth stamp's wiring.
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
  // B-e674 unit 2 (its round's should 2): a foreign front this view does NOT list is said in general words, no name, no title
  const mNote = TT.tabRowModel({ tabs, owners: ow2, windows: wn2, leases, front: { state: 'foreign' } });
  const mNote2 = TT.tabRowModel({ tabs, owners: ow2, windows: wn2, leases, front: { state: 'foreign', targetId: T(0x77), owner: 'other' } });
  ok(!!(mNote.frontNote && mNote.frontNote.text === 'Another tab is in front of this window' && /does not list/.test(mNote.frontNote.tip) && mNote2.frontNote && !m1.frontNote && !mOwn.frontNote && !mUn.frontNote && !m0.frontNote),
    'the row says «Another tab is in front of this window» for a foreign front it cannot mark (no id, or a tab it does not list) — and never beside a marked chip, its own front, an unread one or none');
  // B-e674 unit 2: the birth stamp in words — ruling (i): a tab a page opened in the person's takeover stays its opener's, NAMED
  const mMade = TT.tabRowModel({ tabs: [{ targetId: A, url: 'https://a.example/', title: 'A', active: true }, { targetId: E, url: 'https://consent.example/', title: 'Consent' }, { targetId: C, url: 'https://c.example/', title: 'Mine' }], owners: { [A]: 'agent', [E]: 'agent', [C]: 'you' }, windows: {}, leases: [], made: { [E]: { made: 'takeover', person: false, mine: true }, [C]: { made: 'browse', person: true } } });
  const rE = mMade.rows.find((r) => r.targetId === E), rC = mMade.rows.find((r) => r.targetId === C), rA = mMade.rows.find((r) => r.targetId === A);
  const mNot = TT.tabRowModel({ tabs: [{ targetId: E, url: 'https://consent.example/', title: 'Consent' }], owners: { [E]: 'agent' }, windows: {}, leases: [], made: { [E]: { made: 'takeover', person: false, mine: false } } }).rows[0];
  ok(!!(mNot && mNot.mark === 'The agent’s' && !/takeover/.test(mNot.markTip)), 'CONTROL (r683): the same stamp on a view that is NOT the conversation taken over says nothing (`mine` false)', mNot && [mNot.mark, mNot.markTip]);
  ok(!!(rE && rE.mark === 'The agent’s · opened in your takeover' && rE.markTip.startsWith('Opened during your takeover — it stays this conversation’s tab') && rC && rC.mark === 'Yours' && rC.markTip.startsWith('Your tab — opened while you drove this window') && rA && rA.mark === 'The agent’s' && !/takeover/.test(rA.markTip)),
    'the birth stamp in words: A\'s tab opened in the person\'s takeover is still «The agent’s», NAMED «opened in your takeover»; the person\'s own says why it is theirs; an unstamped tab says nothing new', { E: rE && [rE.mark, rE.markTip], C: rC && [rC.mark, rC.markTip] });
  // r694 (3): THE HANDBACK SAYS WHAT STAYS — this takeover's own marked tabs this view lists (born at or after its start), once each
  const since = 1790000000000;
  const stayTabs = [{ targetId: A }, { targetId: E }, { targetId: C }, { targetId: D }, { targetId: Bq }, { targetId: E }];
  const stayMade = { [E]: { made: 'takeover', person: false, mine: true, at: since + 5 }, [C]: { made: 'browse', person: true, at: since + 6 }, [D]: { made: 'takeover', person: false, mine: true, at: since - 1 }, [Bq]: { made: 'takeover', person: false, mine: false, at: since + 7 } };
  const n1 = TT.takeoverStays({ tabs: stayTabs, made: stayMade, since }), n0 = TT.takeoverStays({ tabs: stayTabs, made: stayMade, since: since + 6 });
  ok(n1 === 1 && n0 === 0 && TT.handbackStayText(0) === '' && TT.handbackStayText(1) === '1 tab opened in your takeover stays with this conversation — its agent can read it now' && TT.handbackStayText(3) === '3 tabs opened in your takeover stay with this conversation — its agent can read them now',
    'r694 (3): the handback counts THIS takeover\'s own tabs that stay (an earlier takeover\'s, the person\'s own, another view\'s and a repeated row never count) and says it — nothing when none stays', { n1, n0 });
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
async function world(Kmod, tag, { browse = true, opts = {} } = {}) {
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
fs.appendFileSync(path.join(st, 'cmds.log'), JSON.stringify({ ns, sess, argv: raw, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('AGENT_BROWSER_'))) }) + '\\n');
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
  const fails = { throws: new Set(), notOk: new Set() }; // B-e674 unit 2: a read that throws / answers no `ok`
  const visibilityOf = async (url, id, o) => { reads.vis.push(id); reads.opts = o || null; if (fails.throws.has(id)) throw new Error('the gate: this page never answered'); if (fails.notOk.has(id)) return { ok: false, error: 'the gate: no answer' }; return { ok: true, visibility: vis.has(id) ? 'visible' : 'hidden' }; };
  // every seam that ACTS on a window or a tab is a spy: the front is said, never acted on
  const hooks = {}; // B-e674 unit 2's cure: a leg may act INSIDE the keeper's own create (its openWindow seam)
  const spy = (name) => async (...a) => { acted.push(name); if (hooks[name]) { try { const r = await hooks[name](...a); if (r) return r; } catch { /* the leg reads its own result */ } } return { ok: false, error: 'the gate opens no window' }; };
  const journal = [];
  const jlog = { log: (x) => journal.push(String(x)), warn: (x) => journal.push(String(x)), error() { }, info() { } };
  const k = Kmod.create({ dataDir: DATA, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => new Set([KA, KB]), runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: jlog, install: false, tickMs: 3600e3,
    readTargets, windowOf, visibilityOf, openWindow: spy('openWindow'), closeTarget: spy('closeTarget'), openTabInWindow: spy('openTabInWindow'), openTabByActivate: spy('openTabByActivate'), conversationFacts: () => ({ turn: 'idle' }), ...opts });
  await k._facts.probeVersion();
  const p = k.createProfile({ label: 'Work' }, { owner: { kind: 'instance', id: null } });
  const NS = B.sessionNameFor(p.id);
  if (browse) await k.browse(p.id); // the person browses "Work" (their own tab)
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
  return { k, p, NS, HUK, aTab, bTab, hisTab, stamped, run, winOf, vis, fails, reads, acted, journal, cmds, edit, nsState, hooks, DATA, HOME, env };
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
  // ── B-e674 unit 2 (its round's legs): the cap, a read that throws or answers no `ok`, the bound handed on, a dragged tab ──
  const mates10 = Array.from({ length: 10 }, (_, i) => F2(0xA0 + i));
  W.edit(W.NS, (s) => { for (const [i, id] of mates10.entries()) s.tabs.push({ tabId: 'ta' + i, targetId: id, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  for (const id of mates10) W.winOf.set(id, 1);
  W.vis.clear(); W.vis.add(mates10[9]); // the one visible tab sits past the cap: the window has 13 mates (A's, the blank, B's popup + ten)
  const cap = await owners(TA, W.aTab);
  ok(!!(cap.r.front && cap.r.front.state === 'unread' && cap.reads.length === 1 + TT.FRONT_READS_MAX && cap.reads[0] === W.aTab && !cap.reads.includes(mates10[9]) && cap.said.length === 0),
    `THE CAP: a window of ${3 + mates10.length} tabs asks A's own then ${TT.FRONT_READS_MAX} mates (${cap.reads.length} reads) — the visible tab past them is never guessed (unread, nothing said)`, { front: cap.r.front, reads: cap.reads.length });
  ok(!!(W.reads.opts && W.reads.opts.timeoutMs === TT.FRONT_READ_MS && TT.FRONT_READ_MS === 1000), `every front read is handed the shorter bound (${TT.FRONT_READ_MS} ms; a page reader's own is 2.5 s) — one hung page delays the record ≤ ~2 s`, W.reads.opts);
  W.vis.clear(); W.vis.add(mates10[0]); W.fails.throws.add(mates10[0]);
  const thr = await owners(TA, W.aTab);
  W.fails.throws.clear(); W.fails.notOk.add(mates10[0]);
  const nok = await owners(TA, W.aTab);
  W.fails.notOk.clear();
  ok(!!(thr.r.front && thr.r.front.state === 'unread' && nok.r.front && nok.r.front.state === 'unread' && thr.said.length === 0 && nok.said.length === 0), 'a read that THROWS, and one that answers no `ok`, is no answer: unread, nothing said — never a guessed front', { thr: thr.r.front, nok: nok.r.front });
  // a person drags the visible tab into another window (a headed desktop): its kept window is stale; the front ask reads it again
  W.vis.clear(); W.vis.add(mates10[1]); W.winOf.set(mates10[1], 5);
  const drag = await owners(TA, W.aTab);
  const after = await owners(TA, W.aTab);
  ok(!!(drag.r.front && drag.r.front.state === 'unread' && drag.r.windows[mates10[1]] === 5 && after.r.windows[mates10[1]] === 5 && drag.said.length === 0), 'a DRAGGED tab: the one about to be named in front has its window read again — now window 5, so it is not this window\'s front (unread), and its kept window follows it', { front: drag.r.front, win: drag.r.windows[mates10[1]], after: after.r.windows[mates10[1]] });
  W.vis.clear(); W.vis.add(mates10[2]);
  const back = await owners(TA, W.aTab);
  ok(!!(back.r.front && back.r.front.state === 'foreign' && back.r.front.targetId === mates10[2] && back.r.front.owner === 'orphan' && back.said.length === 1), 'CONTROL: a mate that did not move and answers visible is named in front again (one line)', { front: back.r.front, said: back.said });
  // ── B-e674 unit 2: THE BIRTH STAMP (the watch tells the keeper of each tab at its birth; here its call is made as the watch makes it) ──
  // r683's law: a stamp never outranks a holder's provable claim; «unclear» is not «nobody»; RULING (i): a takeover's birth is the
  // conversation's taken over (rooted to it, named on ITS view); the person's own tab is born while they drive THEIR OWN window
  W.vis.clear();
  const tkAt = Date.now();
  const tk = W.k.takeover({ browserKey: KA, profileId: W.p.id, viewerId: 7, sessionId: 'sess-a' });
  const popT = (await W.run(KA, ['popup', 'https://a.example/consent'])).json.data.targetId; // A's page opens a sign-in / consent window while the person drives A's view
  const sPop = await W.k.noteTabBorn(W.p.id, popT, { opener: W.aTab });
  const PT = F2(0xB7); W.edit(W.NS, (s) => { s.tabs.push({ tabId: 'tb7', targetId: PT, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  W.winOf.set(PT, 1); // r694 (1): born IN A's own window (window 1)
  const sTk = await W.k.noteTabBorn(W.p.id, PT, {}); // no opener, no agent's verb, in A's takeover (a link, the keyboard), in A's window: A's
  const WT = F2(0xB8); W.edit(W.NS, (s) => { s.tabs.push({ tabId: 'tb8', targetId: WT, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  const sWit = await W.k.noteTabBorn(W.p.id, WT, { witness: KB }); // B's verb was in flight: its witness's, never the person's
  const UT = F2(0xBA); W.edit(W.NS, (s) => { s.tabs.push({ tabId: 'tba', targetId: UT, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  const sUnc = await W.k.noteTabBorn(W.p.id, UT, { unclear: true }); // two agents' verbs were in flight: unclear — no stamp
  W.winOf.set(popT, 1); W.winOf.set(PT, 1); W.winOf.set(WT, 1); W.winOf.set(UT, 1);
  const st1 = await owners(TA, W.aTab);
  const stB = await owners(TB, W.bTab);
  const rootsA = (W.k._reg().leases.find((l) => l.profileId === W.p.id && l.browserKey === KA) || {}).tabRoots || [];
  console.log(`  · stamps: popup ${JSON.stringify(sPop)} · no-opener ${JSON.stringify(sTk)} · witnessed ${JSON.stringify(sWit)} · unclear ${JSON.stringify(sUnc)} · A's words ${JSON.stringify({ pop: st1.r.owners[popT], tk: st1.r.owners[PT], wit: st1.r.owners[WT], unc: st1.r.owners[UT] })} · made on A ${JSON.stringify(st1.r.made)}`);
  ok(!!(tk && tk.ok && sPop && sPop.made === 'takeover' && sPop.of === KA && sPop.person === false && st1.r.owners[popT] === 'agent' && st1.r.made[popT] && st1.r.made[popT].mine === true),
    'RULING (i): a tab A\'s page opened while the person took over A\'s view STAYS A\'s (the popup rule) — named «opened in your takeover» on A\'s view (born in the person\'s takeover)');
  ok(!!(sTk && sTk.person === false && sTk.of === KA && st1.r.owners[PT] === 'agent' && rootsA.map((x) => String(x).toUpperCase()).includes(PT) && st1.r.made[PT] && st1.r.made[PT].mine === true && !(stB.r.made[PT] && stB.r.made[PT].mine)),
    'RULING (i), r683: a tab with NO opener born in A\'s takeover (a link, the keyboard) is A\'S — rooted to A, named on A\'s view only (never on B\'s)');
  ok(!!(sWit && sWit.person === false && st1.r.owners[WT] !== 'you' && sUnc === null && st1.r.owners[UT] !== 'you'), 'r683 (c): a tab an agent\'s verb was witnessed making is never the person\'s, and one born while TWO verbs were in flight gets no stamp — unclear is not nobody', { sWit, sUnc, wit: st1.r.owners[WT], unc: st1.r.owners[UT] });
  // r694 (1): A TAKEOVER BIRTH IS A'S ONLY IN A'S OWN WINDOW — one born in the person's own window (3), in B's (2), or in a window that
  // never answers is not A's: no stamp, not rooted (the naming it had before the unit); each said in one journal line
  const P3 = F2(0xD3), P2 = F2(0xD2), P0 = F2(0xD0);
  W.edit(W.NS, (s) => { for (const [i, id] of [[3, P3], [2, P2], [0, P0]]) s.tabs.push({ tabId: 'td' + i, targetId: id, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  W.winOf.set(P3, 3); W.winOf.set(P2, 2); // P0's window never answers
  const s3 = await W.k.noteTabBorn(W.p.id, P3, {}), s2 = await W.k.noteTabBorn(W.p.id, P2, {}), s0 = await W.k.noteTabBorn(W.p.id, P0, {});
  const stW = await owners(TA, W.aTab);
  const rootsW = ((W.k._reg().leases.find((l) => l.profileId === W.p.id && l.browserKey === KA) || {}).tabRoots || []).map((x) => String(x).toUpperCase());
  console.log(`  · r694 (1) births in A's takeover outside A's window: the person's ${JSON.stringify(s3)} → ${stW.r.owners[P3]} · B's ${JSON.stringify(s2)} → ${stW.r.owners[P2]} · unanswered ${JSON.stringify(s0)} → ${stW.r.owners[P0]}`);
  ok(!!(s3 === null && s2 === null && s0 === null && ![P3, P2, P0].some((x) => rootsW.includes(x)) && ![P3, P2, P0].some((x) => stW.r.owners[x] === 'agent' || stW.r.made[x])),
    'r694 (1): a tab born in A\'s takeover OUTSIDE A\'s own window — in the person\'s own window, in B\'s, or one whose window never answers — is NOT A\'s: no stamp, not rooted (the naming before the unit)', { s3, s2, s0, owners: [P3, P2, P0].map((x) => stW.r.owners[x]) });
  ok(W.journal.some((l) => l.includes(`tab ${id8(P3)} born while the person drove (a takeover of ${KA}) in window 3, not that conversation's own (1) — not rooted to it, no stamp`)) && W.journal.some((l) => l.includes(`tab ${id8(P0)} born while the person drove (a takeover of ${KA}) in a window that did not answer — not rooted to it`)), 'r694 (1): each such birth is said in one journal line (the window it was born in, or that it did not answer)');
  ok(!!(st1.r.made[PT] && Number.isFinite(st1.r.made[PT].at) && st1.r.made[PT].at >= tkAt), 'r694 (3): a view\'s mark carries its birth\'s instant (a handback counts THIS takeover\'s tabs)', st1.r.made[PT]);
  const hb = W.k.handback({ browserKey: KA, profileId: W.p.id, viewerId: 7, cause: 'explicit' });
  const AT = F2(0xB9); W.edit(W.NS, (s) => { s.tabs.push({ tabId: 'tb9', targetId: AT, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  const sAfter = await W.k.noteTabBorn(W.p.id, AT, {});
  ok(!!(hb && sAfter === null), 'CONTROL: after the handback nobody drives — a tab born then gets no stamp (the ownership rules as before)', { hb: !!hb, sAfter });
  // THE PERSON'S OWN TAB: born while they drive THEIR OWN window (Browse yourself), no opener, no agent's verb — theirs, never an orphan
  const ht = W.k.humanTake({ key: W.HUK, viewerId: 5 });
  const OT = F2(0xBB); W.edit(W.NS, (s) => { s.tabs.push({ tabId: 'tbb', targetId: OT, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  const sOwn = await W.k.noteTabBorn(W.p.id, OT, {});
  // THE MUST (r683): a tab the keeper rooted to B (B's lease's own claim) born while the person drives — the person's stamp NEVER outranks it
  const XT = F2(0xBC); W.edit(W.NS, (s) => { s.tabs.push({ tabId: 'tbc', targetId: XT, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  W.k.reshapeStore((reg) => { const l = reg.leases.find((x) => x.profileId === W.p.id && x.browserKey === KB); if (l) l.tabRoots = [...(Array.isArray(l.tabRoots) ? l.tabRoots : []), XT]; return true; });
  const sX = await W.k.noteTabBorn(W.p.id, XT, {});
  W.winOf.set(OT, 3); W.winOf.set(XT, 2);
  const sh = await owners(TH, W.hisTab), sb = await owners(TB, W.bTab), sa = await owners(TA, W.aTab);
  const rowH = TT.tabRowModel({ tabs: [{ targetId: W.hisTab, url: 'https://h.example/', title: 'H', active: true }, { targetId: XT, url: 'https://b.example/x', title: 'B page' }, { targetId: OT, url: 'https://h.example/o', title: 'Mine' }], owners: sh.r.owners, viewer: { human: true }, windows: {}, leases: [], made: sh.r.made }).rows;
  const rx = rowH.find((r) => r.targetId === XT), ro = rowH.find((r) => r.targetId === OT);
  console.log(`  · the person drives their own window: own ${JSON.stringify(sOwn)} → ${sh.r.owners[OT]} · B's rooted tab stamped ${JSON.stringify(sX)} → on B's view ${sb.r.owners[XT]}, A's ${sa.r.owners[XT]}, theirs ${sh.r.owners[XT]}`);
  ok(!!(ht && ht.ok && sOwn && sOwn.person === true && sh.r.owners[OT] === 'you' && sa.r.owners[OT] === 'you' && ro && ro.markTip.startsWith('Your tab — opened while you drove this window')),
    'a tab NO page opened and no agent made, born while the person drives THEIR OWN window, is THE PERSON\'S — «yours» on every view, never an orphan');
  ok(!!(sb.r.owners[XT] === 'agent' && sa.r.owners[XT] === 'other' && sh.r.owners[XT] === 'other' && rx && !rx.canSwitch && !rx.canClose),
    'THE MUST (r683): a tab B\'s lease ROOTS stays B\'s though the person drove at its birth — B\'s own on B\'s view, another conversation\'s on A\'s and on the person\'s; the person\'s row offers no switch and no close on it', { b: sb.r.owners[XT], a: sa.r.owners[XT], h: sh.r.owners[XT], row: rx && { canSwitch: rx.canSwitch, canClose: rx.canClose } });
  W.k.humanRelease({ key: W.HUK, viewerId: 5 });
  // the stamp lives as long as its tab; ≤ 64 are kept
  W.edit(W.NS, (s) => { s.tabs = s.tabs.filter((x) => x.targetId !== OT); });
  await owners(TA, W.aTab);
  const rec1 = W.k._reg().browsers[W.p.id] || {};
  ok(!!(rec1.bornBy && !rec1.bornBy[OT] && rec1.bornBy[popT]), 'its tab closed, its stamp is gone at the next read (the others stay)', Object.keys(rec1.bornBy || {}).map((x) => x.slice(0, 4)));
  const tk2 = W.k.takeover({ browserKey: KA, profileId: W.p.id, viewerId: 7, sessionId: 'sess-a' });
  for (let i = 0; i < 70; i++) { W.winOf.set(F2(0xC000 + i), 1); await W.k.noteTabBorn(W.p.id, F2(0xC000 + i), {}); } // born in A's window (r694 (1))
  const rec2 = W.k._reg().browsers[W.p.id] || {};
  ok(!!(tk2 && tk2.ok && Object.keys(rec2.bornBy || {}).length === 64), `the stamps are BOUNDED: 70 births keep the newest 64 (${Object.keys(rec2.bornBy || {}).length})`);
  W.k.handback({ browserKey: KA, profileId: W.p.id, viewerId: 7, cause: 'explicit' });
  const lines = W.journal.filter((l) => /born while the person drove/.test(l));
  ok(lines.some((l) => l.includes(`tab ${id8(popT)} born while the person drove (a takeover of ${KA}) — its opener's, named «opened in your takeover» on that conversation's view`)) && lines.some((l) => l.includes(`tab ${id8(PT)} born while the person drove (a takeover of ${KA}) — rooted to ${KA}`)) && lines.some((l) => l.includes(`tab ${id8(OT)} born while the person drove (their browsing window) — the person's own tab`)), 'each stamp is ONE journal line: who drove, and whose the tab reads');
  ok(W.acted.length === acted0 && driverDuring === 0, `NOTHING ACTED for any front: no window opened, no tab closed or activated (${W.acted.length - acted0} acting calls), no driver command (${driverDuring}) — reads only`);
}
/** r683 (a), on a keeper (the cure's, or its RED control's copy): the person drives their own window; the keeper creates B's next tab
 *  IN B's window (B holds window 2 ⇒ openTabInWindow) — the stand-in makes that tab, and the watch's stamp is asked while the create is
 *  in flight (Chrome's targetCreated reaches the watch then), then for the tab the create reports (a late event). */
async function keeperCreateLeg(X, KTid, tbId) {
  X.winOf.set(X.aTab, 1); X.winOf.set(X.bTab, 2); // the holders' tabs answer their windows (a fresh world's stand-in knows none) — B's window lives
  const htA = X.k.humanTake({ key: X.HUK, viewerId: 5 });
  let inFlight = 'not asked';
  X.hooks.openTabInWindow = async () => {
    X.edit(X.NS, (s) => { s.tabs.push({ tabId: tbId, targetId: KTid, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
    X.winOf.set(KTid, 2);
    inFlight = await X.k.noteTabBorn(X.p.id, KTid, {});
    return { ok: true, targetId: KTid, windowId: 2 };
  };
  let made1 = null; try { made1 = await X.k.agentTabAct({ browserKey: KB, argv: ['tab', 'new', 'https://b.example/kc'] }); } catch (e) { made1 = { threw: String(e && e.message) }; }
  X.hooks.openTabInWindow = null;
  const newId = made1 && made1.opened && made1.opened.targetId ? made1.opened.targetId : null;
  const late = newId ? await X.k.noteTabBorn(X.p.id, newId, {}) : 'no id';
  X.k.humanRelease({ key: X.HUK, viewerId: 5 });
  return { htA, inFlight, late, newId, made1 };
}
// ── B-e674 unit 2's cure (r683): the legs that ACT (after «nothing acted» above) ──
{
  // (a) A TAB THE KEEPER CREATES for a holder is that holder's — a birth while its create is in flight gets no stamp, nor the tab it reports
  const { htA, inFlight, late, newId, made1 } = await keeperCreateLeg(W, F2(0xBD), 'tbd'); // the person drives their own window meanwhile
  console.log(`  · the keeper's own create for B while the person drove: in flight → ${JSON.stringify(inFlight)}; the tab it reported ${newId ? id8(newId) : '(none)'} → ${JSON.stringify(late)}`);
  ok(!!(htA && htA.ok && inFlight === null && newId && late === null), 'r683 (a): a tab THE KEEPER creates for B is B\'s by its own word — a birth while its create is in flight gets no stamp, nor the tab it reports (a late event)', { inFlight, late, made1 });
  // the stamps across a keeper reload (they ride the browser's record), and gone with a new browser run
  const tkR = W.k.takeover({ browserKey: KA, profileId: W.p.id, viewerId: 7, sessionId: 'sess-a' });
  const RT = F2(0xBE); W.edit(W.NS, (s) => { s.tabs.push({ tabId: 'tbe', targetId: RT, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  W.winOf.set(RT, 1); const sR = await W.k.noteTabBorn(W.p.id, RT, {});
  W.k.handback({ browserKey: KA, profileId: W.p.id, viewerId: 7, cause: 'explicit' });
  try { require('../src/store-writer.js').storeWriter().flushSync(); } catch { /* the store's own writer */ }
  const k2 = K.create({ dataDir: W.DATA, homeDir: W.HOME, env: () => W.env, serverSetting: () => undefined, liveKeys: () => new Set([KA, KB]), runtime: F.createBrowserRuntime({ env: W.env }), facts: F.createBrowserFacts({ env: W.env }), log: quiet, install: false, tickMs: 3600e3 });
  k2.list();
  const reloaded = ((k2._reg().browsers[W.p.id] || {}).bornBy || {})[RT] || null;
  k2.shutdown();
  await W.k.stop(W.p.id, { why: 'user' }).catch(() => { });
  await W.k.start(W.p.id, { why: 'the gate: a new browser run' }).catch(() => { });
  const fresh = (W.k._reg().browsers[W.p.id] || {}).bornBy || {};
  ok(!!(tkR && tkR.ok && sR && reloaded && reloaded.made === 'takeover' && !fresh[RT]), 'the stamps ride the browser\'s record: a keeper RELOADED from the store still reads them; a NEW browser run starts with none', { sR, reloaded, fresh: Object.keys(fresh).length });
}
// the person with NO Browse-yourself window (the world's option): a takeover's birth is the conversation's; nothing is ever «yours»
{
  const N = await world(K, 'nb', { browse: false });
  const TAn = { kind: 'attachment', profileId: N.p.id, sessionName: 'vs-' + KA, ns: N.NS };
  const tkN = N.k.takeover({ browserKey: KA, profileId: N.p.id, viewerId: 7, sessionId: 'sess-a' });
  const NT = F2(0x9E); N.edit(N.NS, (s) => { s.tabs.push({ tabId: 't9e', targetId: NT, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  N.winOf.set(N.aTab, 1); N.winOf.set(NT, 1);
  const sN = await N.k.noteTabBorn(N.p.id, NT, {});
  const oN = await N.k.tabOwnersFor(TAn, { activeTarget: N.aTab });
  N.k.handback({ browserKey: KA, profileId: N.p.id, viewerId: 7, cause: 'explicit' });
  ok(!!(tkN && tkN.ok && sN && sN.person === false && oN.owners[NT] === 'agent' && oN.made[NT] && oN.made[NT].mine === true && !Object.values(oN.owners).includes('you')), 'the person with NO Browse-yourself window: a birth in their takeover of A is A\'s (rooted, named) — no tab on that browser ever reads «yours»', { sN, owner: oN.owners[NT], made: oN.made[NT] });
  N.k.shutdown();
}
// B-21cc (the coordinator's r2491; report fb-03ae550a21): THE CONVERSATION's CURRENT TAB, read by the keeper from the lease's OWN
// session's `tab list` (the row marked active — the tab its `get url` and `snapshot` read), as the agent's `tab` fence reads it; the
// vault fill acts on that ONE tab. The stand-in's sessions keep their own bound tab, as the driver does (a `tab new` / `tab <id>`
// moves it). Unreadable ⇒ refused BY NAME, never a guess.
{
  const C = await world(K, 'b21cc');
  await C.run(KA, ['tab', 'new', 'https://b21cc.example/other']); // A's session: its second tab, now its current one
  const boundA = () => String(((C.nsState(C.NS) || { sessions: {} }).sessions['vs-' + KA]) || '').toUpperCase();
  const second = boundA();
  const c1 = await C.k.currentTabOf({ profileId: C.p.id, browserKey: KA });
  await C.run(KA, ['tab', C.aTab]); // back to its first tab
  const c2 = await C.k.currentTabOf({ profileId: C.p.id, browserKey: KA });
  const cB = await C.k.currentTabOf({ profileId: C.p.id, browserKey: KB });
  const none = await C.k.currentTabOf({ profileId: C.p.id, browserKey: 'bk-0000fc03' });
  const eph = await C.k.currentTabOf({ profileId: C.p.id, browserKey: KA, ephemeral: true });
  // r2711's ruling: the fill's ONE spawn is this read — its argv and env carry neither an entry's name nor a value (asserted on THIS
  // real keeper, over the stand-in driver's own log of each call)
  const logLines = () => fs.readFileSync(path.join(C.DATA, '..', 'ab', 'cmds.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const n0 = logLines().length;
  const cR = await C.k.currentTabOf({ profileId: C.p.id, browserKey: KA });
  const spawned = logLines().slice(n0);
  const blob = JSON.stringify(spawned);
  ok(!!(cR.ok && spawned.length === 1 && JSON.stringify(spawned[0].argv) === JSON.stringify(['tab', 'list', '--json']) && spawned[0].env.AGENT_BROWSER_CDP && !/web-login:|vault|password|#alice/i.test(blob)),
    'B-21cc (r2711\'s ruling): on a REAL keeper the fill\'s one spawn is the current tab\'s read — exactly `tab list --json` under the lease\'s own url; its argv and env hold no entry name and no value', { spawned });
  // r2760's small: TWO rows marked current (the stand-in's list carries A's current tab twice) ⇒ refused by name, never the first of them
  C.edit(C.NS, (s) => { const t0 = s.tabs.find((t) => t.targetId === s.sessions['vs-' + KA]) || s.tabs[0]; s.sessions['vs-' + KA] = t0.targetId; s.tabs.push({ ...t0, tabId: 'tdup' }); });
  const twoRows = await C.k.currentTabOf({ profileId: C.p.id, browserKey: KA });
  ok(!twoRows.ok && twoRows.code === 'current_tab_unreadable' && /more than one tab is marked current/.test(twoRows.error), 'B-21cc (the r2760 small): a list with TWO rows marked current is refused by name, never the first of them', twoRows);
  // no row marked current (the session bound to a tab gone from the list) ⇒ refused by name
  C.edit(C.NS, (s) => { s.sessions['vs-' + KA] = 'E'.repeat(32); });
  const noRow = await C.k.currentTabOf({ profileId: C.p.id, browserKey: KA });
  ok(!noRow.ok && noRow.code === 'current_tab_unreadable' && /no tab is marked current/.test(noRow.error), 'B-21cc (round w41hvnm5h): a list with NO row marked current is refused by name, never the first row', noRow);
  C.edit(C.NS, (s) => { s.pid = 2147483646; }); // the stand-in's browser gone: the lease's url answers nothing
  const dead = await C.k.currentTabOf({ profileId: C.p.id, browserKey: KA });
  ok(!!(c1.ok && c1.targetId === second && second && second !== C.aTab && c2.ok && c2.targetId === C.aTab && cB.ok && cB.targetId === C.bTab),
    'B-21cc: the conversation\'s CURRENT tab is the row its OWN session\'s `tab list` marks active — after `tab new` the new tab, after `tab <id>` that tab; each lease reads its own (B: its tab)', { c1, c2, cB, second, aTab: C.aTab, bTab: C.bTab });
  ok(!none.ok && none.code === 'current_tab_unreadable' && /holds no lease/.test(none.error) && !eph.ok && eph.code === 'current_tab_unreadable' && !dead.ok && dead.code === 'current_tab_unreadable' && /did not answer|no CDP url/.test(dead.error) && /nothing was filled/.test(dead.error),
    'B-21cc: a current tab that cannot be read is REFUSED BY NAME (current_tab_unreadable) — no lease, an ephemeral browser (never on the vault fill\'s road: the login-channel law refuses it first), a tab list that does not answer — never a guess', { none, eph, dead });
  C.k.shutdown();
}
// B-21cc line 520's follow (主开发 r2760 → r2849 (1) + the r2760 small): ON A REAL KEEPER COPY a snapshot's note adds ZERO lines to
// the stand-in driver's log and asks the browser nothing; a REAL fill by reference then makes the ONE read (`tab list --json`) while
// an entry's name and its value stand in the hub (the logins, the vault, the fill's own spec) — its argv and env carry neither.
// RED: 473fa577c's note (the read on every snapshot) adds a line per snapshot. The watch's CDP is a fake kernel's (the stand-in names
// a dead port), its pages Chrome-shaped so the keeper's read names the page the watch tracks.
{
  const { startFakeKernel } = await import('./fixtures/fake-kernel.mjs');
  const VE = require('../src/server/vault-engine.js'), GS = require('../src/server/grants-store.js'), Lm = require('../src/server/browser-logins.js'), Dm = require('../src/server/browser-dialogs.js'), BM = require('../src/browser-mediation.js');
  const C = await world(K, 'b21cc-note');
  const fk = await startFakeKernel({ firstUrl: 'https://shop.example.test/login', mode: { standard: true, hexIds: true } });
  const ROOTV = path.join(ROOT, 'b21cc-vault'); fs.mkdirSync(ROOTV, { recursive: true, mode: 0o700 });
  const eng = VE.create({ dataDir: ROOTV, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  await eng.setup('B21ccNote#Master9');
  const ws = [];
  try {
    const g = GS.create({ memory: true });
    const lg = Lm.create({ vault: eng, grants: () => g, log: () => { }, forYou: { add: () => 'fy-1', resolve() { } } });
    const PW = 'B21ccNote!' + require('crypto').randomBytes(4).toString('hex');
    lg.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: PW }, { who: 'owner' });
    lg.grant('web-login:https://shop.example.test#alice', 'any-account', 'session:conv-b21cc-note');
    const tid = fk.targets()[0].targetId;
    fk.setDom(tid, { url: 'https://shop.example.test/login', elements: [{ id: 'pw', tag: 'input', type: 'password', name: 'Password' }] });
    // A's session is bound to that page (the same id), so the REAL keeper's read names it
    C.edit(C.NS, (s) => { s.tabs.push({ tabId: 'tk1', targetId: tid, url: 'https://shop.example.test/login', title: 'Page shop', label: null, opener: null }); s.sessions['vs-' + KA] = tid; });
    const chan = ({ ephemeral = false, remoteSession = false, action = 'fill' } = {}) => BM.loginFillChannelVerdict(BM.leaseRoadVerdict({ mediated: false, proxy: true, ephemeral: Boolean(ephemeral), remote: Boolean(remoteSession), agent: true }), { proxy: true, external: false, remote: false, remoteSession: Boolean(remoteSession), hasCdp: true, usableProfiles: ['Work'], profileLabel: 'Work', action });
    // the REAL keeper — its browser's CDP the fake kernel's, its login channel the fill's road; every other member its own
    const kw = new Proxy(C.k, { get: (o, p) => (p === 'cdpEndpointFor' ? async () => ({ ok: true, url: fk.wsUrl }) : p === 'loginChannelFor' ? chan : (typeof o[p] === 'function' ? o[p].bind(o) : o[p])) });
    const Tn = { profileId: C.p.id, browserKey: KA };
    const logLines = () => fs.readFileSync(path.join(C.DATA, '..', 'ab', 'cmds.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const mk = async (Dmod) => {
      // the suite's own WebSocket: a patched copy lives outside the checkout, where `ws` does not resolve (its watch would never open)
      const w = Dmod.create({ keeper: kw, log: quiet, enableTimeoutMs: 400, holdersOf: () => [{ browserKey: KA, sessionId: 'sess-a' }], leaseCountOf: () => 1, logins: lg, WebSocketImpl: require('ws') });
      ws.push(w);
      await w.arm(C.p.id);
      await until(async () => { const a = await w.noteSnapshot(Tn, { parsedRefs: [{ ref: '@e0', role: 'textbox', name: 'Password', nth: 0 }], targetId: tid }); return !!(a && a.ok); });
      return w;
    };
    const note = (w) => w.noteSnapshot(Tn, { parsedRefs: [{ ref: '@e5', role: 'textbox', name: 'Password', nth: 0 }], since: Date.now() });
    const w = await mk(Dm);
    await sleep(5);
    const n0 = logLines().length, m0 = fk.mark();
    const notes = [];
    for (let i = 0; i < 3; i++) { await sleep(2); notes.push(await note(w)); }
    const noteSpawns = logLines().slice(n0), noteCalls = fk.mark() - m0;
    const n1 = logLines().length;
    const r = await w.fillVaultField(Tn, { target: '@e5', spec: 'shop.example.test#alice/password', facts: { conversationKeys: ['conv-b21cc-note'] } });
    const fillSpawns = logLines().slice(n1);
    const blob = JSON.stringify(fillSpawns);
    const landed = ((fk.readDomValues(tid) || {}).pw || '') === PW;
    ok(notes.every((x) => x && x.ok && x.pending) && noteSpawns.length === 0 && noteCalls === 0,
      'B-21cc (r2849 (1)): on a REAL keeper copy three snapshot notes add ZERO lines to the stand-in driver\'s log and ask the browser nothing', { notes, noteSpawns, noteCalls });
    ok(!!(r && r.ok && landed && fillSpawns.length === 1 && JSON.stringify(fillSpawns[0].argv) === JSON.stringify(['tab', 'list', '--json']) && fillSpawns[0].env.AGENT_BROWSER_CDP && !blob.includes(PW) && !/web-login:|vault|password|alice/i.test(blob)),
      'B-21cc (the r2760 small: the assert made to bite): a REAL fill by reference — the entry\'s name and value in the hub, its spec naming the entry — makes exactly ONE driver call, `tab list --json` under the lease\'s own url, whose argv and env carry neither; the value lands', { r: r && { ok: r.ok, code: r.code, error: r.error }, fillSpawns, landed });
    // RED: 473fa577c's note — the read on every snapshot (a patched copy of the dialogs over the same real keeper)
    let ds = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
    ds = anchored(ds, '    const slotKey = slotKeyOf(pid, target && target.browserKey);\n', '    const slotKey = slotKeyOf(pid, target && target.browserKey);\n    { const ct = await currentTabFor(w, target, targetId); if (!ct.ok) return { ok: false, count: 0, code: ct.code }; } // 473fa577c: the read on every snapshot\n', 'B-21cc control: the read on the snapshot');
    const df = path.join(ROOT, 'dialogs-b21cc-note-reads.js'); fs.writeFileSync(df, absReq(ds, path.join(REPO, 'src/server')));
    w.shutdown(); // one watch of the profile at a time
    const wR = await mk(require(df));
    await sleep(5);
    const n2 = logLines().length;
    const nR = await note(wR);
    const redSpawns = logLines().slice(n2);
    ok(!!(nR && nR.ok) && redSpawns.length === 1 && JSON.stringify(redSpawns[0].argv) === JSON.stringify(['tab', 'list', '--json']), 'RED CONTROL (B-21cc r2849 (1)): 473fa577c\'s note on the same real keeper — a snapshot spawns the driver\'s `tab list`: the zero-line leg above can go red', { redSpawns, nR });
  } finally {
    for (const x of ws) { try { x.shutdown(); } catch { /* its own */ } }
    try { eng.close(); } catch { /* its own */ }
    await fk.close();
    C.k.shutdown();
  }
}
// RED CONTROL (B-21cc): a keeper copy that takes the list's FIRST row instead of the one marked active names a tab the session is not on
{
  let ks = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  ks = anchored(ks, '    const act = rows.filter((x) => x && x.active);\n', '    const act = rows.slice(0, 1);\n', 'B-21cc control: the first row, not the active one');
  const kf9 = path.join(ROOT, 'keeper-b21cc-first-row.js'); fs.writeFileSync(kf9, absReq(ks, path.join(REPO, 'src/server')));
  const R9 = await world(require(kf9), 'b21cc-red');
  await R9.run(KA, ['tab', 'new', 'https://b21cc.example/other']);
  const bound9 = String(((R9.nsState(R9.NS) || { sessions: {} }).sessions['vs-' + KA]) || '').toUpperCase();
  const r9 = await R9.k.currentTabOf({ profileId: R9.p.id, browserKey: KA });
  ok(!!(r9 && r9.ok && r9.targetId !== bound9), 'RED CONTROL (B-21cc): the list\'s FIRST row taken for the current tab names a tab A\'s session is NOT on — the read leg above can go red', { r9, bound9 });
  R9.k.shutdown();
}
// RED CONTROL (B-21cc, r2760's small): a keeper copy that takes the FIRST of two rows marked current names one of them as if known
{
  let ks = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  ks = anchored(ks, "    if (act.length !== 1) return no(act.length ? 'more than one tab is marked current' : 'no tab is marked current');\n", "    if (act.length < 1) return no('no tab is marked current');\n", 'B-21cc control: the first of two rows marked current');
  const kfT = path.join(ROOT, 'keeper-b21cc-two-rows.js'); fs.writeFileSync(kfT, absReq(ks, path.join(REPO, 'src/server')));
  const RT = await world(require(kfT), 'b21cc-two-red');
  RT.edit(RT.NS, (s) => { const t0 = s.tabs.find((t) => t.targetId === s.sessions['vs-' + KA]) || s.tabs[0]; s.sessions['vs-' + KA] = t0.targetId; s.tabs.push({ ...t0, tabId: 'tdup' }); });
  const rT = await RT.k.currentTabOf({ profileId: RT.p.id, browserKey: KA });
  ok(!!(rT && rT.ok), 'RED CONTROL (B-21cc, r2760\'s small): the first of two rows marked current taken as known — the two-rows leg above can go red', { rT });
  RT.k.shutdown();
}
// RED CONTROL OF THE MUST: the unit's first order (the person's stamped roots FIRST, before every lease) — B's rooted tab reads «yours»
{
  let ks = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  ks = anchored(ks, '    if (h) out.push({ key: h.key, roots: [h.ownTab, ...(Array.isArray(h.adopted) ? h.adopted : [])].filter(Boolean) });\n', "    if (h) out.push({ key: h.key, roots: [h.ownTab, ...(Array.isArray(h.adopted) ? h.adopted : []), ...personRootsOf(profileId)].filter(Boolean) });\n", 'the person\'s stamps first');
  const kf2 = path.join(ROOT, 'keeper-stamp-first.js'); fs.writeFileSync(kf2, absReq(ks, path.join(REPO, 'src/server')));
  const Q = await world(require(kf2), 'q');
  const QX = F2(0xBC); Q.edit(Q.NS, (s) => { s.tabs.push({ tabId: 'tbc', targetId: QX, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  Q.k.reshapeStore((reg) => { const l = reg.leases.find((x) => x.profileId === Q.p.id && x.browserKey === KB); if (l) l.tabRoots = [...(Array.isArray(l.tabRoots) ? l.tabRoots : []), QX]; return true; });
  Q.k.humanTake({ key: Q.HUK, viewerId: 5 });
  await Q.k.noteTabBorn(Q.p.id, QX, {});
  Q.winOf.set(Q.bTab, 2); Q.winOf.set(QX, 2);
  const qb = await Q.k.tabOwnersFor({ kind: 'attachment', profileId: Q.p.id, sessionName: 'vs-' + KB, ns: Q.NS }, { activeTarget: Q.bTab });
  ok(qb.owners[QX] === 'you', 'RED CONTROL: with the person\'s stamps claiming FIRST (the unit\'s order), B\'s own rooted tab reads «yours» on B\'s view — the must\'s leg above can go red', { owner: qb.owners[QX] });
  Q.k.shutdown();
}
// RED CONTROLS of r683 (a) and of r694 (1): a keeper copy WITHOUT the mark (openOwnTabMarked calls the body bare) and WITHOUT the
// window rule (a takeover birth rooted wherever it is born) — each leg above can go red
{
  let ks = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  ks = anchored(ks, '  function openOwnTabMarked(p, holderKey, o = {}) { return keeperMakes(p && p.id, () => openOwnTab(p, holderKey, o)); }', '  function openOwnTabMarked(p, holderKey, o = {}) { return openOwnTab(p, holderKey, o); }', 'the keeper without the mark');
  ks = anchored(ks, '      if (own == null || born == null || born !== own) {\n', '      if (false) {\n', 'the keeper without the window rule');
  const kf3 = path.join(ROOT, 'keeper-no-mark-no-window.js'); fs.writeFileSync(kf3, absReq(ks, path.join(REPO, 'src/server')));
  const U = await world(require(kf3), 'u');
  const uc = await keeperCreateLeg(U, F2(0xBD), 'tbd');
  ok(!!(uc.inFlight && uc.inFlight.person === true), 'RED CONTROL of r683 (a): WITHOUT the mark, the birth while the keeper creates B\'s tab is stamped as the PERSON\'s — the keeper-create leg can go red', { inFlight: uc.inFlight, made1: uc.made1 });
  const tkU = U.k.takeover({ browserKey: KA, profileId: U.p.id, viewerId: 7, sessionId: 'sess-a' });
  const U3 = F2(0xD3); U.edit(U.NS, (s) => { s.tabs.push({ tabId: 'td3', targetId: U3, url: 'about:blank', title: 'Page blank', label: null, opener: null }); });
  U.winOf.set(U.aTab, 1); U.winOf.set(U3, 3);
  const sU = await U.k.noteTabBorn(U.p.id, U3, {});
  const oU = await U.k.tabOwnersFor({ kind: 'attachment', profileId: U.p.id, sessionName: 'vs-' + KA, ns: U.NS }, { activeTarget: U.aTab });
  U.k.handback({ browserKey: KA, profileId: U.p.id, viewerId: 7, cause: 'explicit' });
  ok(!!(tkU && tkU.ok && sU && sU.of === KA && oU.owners[U3] === 'agent'), 'RED CONTROL of r694 (1): WITHOUT the window rule, a tab born in the PERSON\'S own window during A\'s takeover is rooted to A (A\'s own on A\'s view) — the window leg can go red', { sU, owner: oU.owners[U3] });
  U.k.shutdown();
}
// r694 (4): THE MARK IS BOUNDED IN VIEW — a keeper create still in flight after the stated time says so in ONE journal line (the gate's
// clock here: 60 ms; the product's KEEPER_MAKE_SAY_MS); a create that settles in time says nothing (the (a) leg's world: its CONTROL)
{
  const M = await world(K, 'm', { opts: { markSayMs: 60 } });
  M.winOf.set(M.aTab, 1); M.winOf.set(M.bTab, 2); // B's window lives: its later tab is made IN it (openTabInWindow)
  const KM = F2(0xBF);
  M.hooks.openTabInWindow = async () => { await sleep(250); M.edit(M.NS, (s) => { s.tabs.push({ tabId: 'tbf', targetId: KM, url: 'about:blank', title: 'Page blank', label: null, opener: null }); }); M.winOf.set(KM, 2); return { ok: true, targetId: KM, windowId: 2 }; };
  // THE ACT'S OWN LINES (主开发 r1125, placed: a UTC pass of two whole-list runs read TWO lines): world() makes keeper creates of its
  // own before this leg acts (k.browse, k.attach ×2 — each a spawned stand-in agent-browser), and with markSayMs 60 a loaded runner
  // lets one of THOSE cross 60 ms and say its own line. The leg judges only the lines said DURING its act (from j0 on), prints them
  const j0 = M.journal.length;
  let mr = null; try { mr = await M.k.agentTabAct({ browserKey: KB, argv: ['tab', 'new', 'https://b.example/slow'] }); } catch (e) { mr = { threw: String(e && e.message) }; }
  M.hooks.openTabInWindow = null;
  const IN_FLIGHT = /a tab the keeper creates is still in flight after \d+ s \(1 on this browser\) — every tab born on it meanwhile is stamped for nobody until it settles/;
  const said = M.journal.slice(j0).filter((l) => IN_FLIGHT.test(l)), before = M.journal.slice(0, j0).filter((l) => IN_FLIGHT.test(l));
  console.log(`    r694 (4) judged the act's ${said.length} line(s): ${JSON.stringify(said)} · said before the act (world's own creates, not judged): ${before.length}`);
  // CONTROL: a line of the world's own create, planted before the act — the old whole-journal count reads it, the act's window does not
  const planted = [...M.journal.slice(0, j0), '[browser] bp-planted: a tab the keeper creates is still in flight after 0 s (1 on this browser) — every tab born on it meanwhile is stamped for nobody until it settles', ...M.journal.slice(j0)];
  ok(planted.filter((l) => IN_FLIGHT.test(l)).length === said.length + before.length + 1 && planted.slice(j0 + 1).filter((l) => IN_FLIGHT.test(l)).length === said.length, `CONTROL (r694 (4)'s window): a setup create's line, planted before the act, is counted by the whole journal (${planted.filter((l) => IN_FLIGHT.test(l)).length}) and NOT by the act's window (${said.length})`);
  const quietW = W.journal.filter((l) => /a tab the keeper creates is still in flight/.test(l));
  ok(said.length === 1 && quietW.length === 0, 'r694 (4): a keeper create still in flight past the stated time is said in ONE journal line (every birth there is stamped for nobody meanwhile); CONTROL: the creates that settled in time said nothing', { said, quietW: quietW.length, mr: mr && (mr.threw || (mr.opened && mr.opened.targetId)) });
  M.k.shutdown();
}
// r694 (2) + (5): THE REAL WATCH COUNTS THE VERBS IN FLIGHT — its own socket over a stand-in CDP endpoint (Target.targetCreated), the
// keeper's two doors spied: two agents' verbs ⇒ «unclear» (nobody's); one ⇒ its witness's (the release's rule — a CONTROL); one while
// the person drives THEIR OWN window ⇒ unclear too (they are a possible parent); none while they do ⇒ no witness (the keeper's: theirs)
{
  const { WebSocketServer } = require('ws');
  const DW = require('../src/server/browser-dialogs.js');
  const tabs = new Map(); let sn = 0;
  const wss = new WebSocketServer({ noServer: true });
  const cdp = http.createServer((q, r) => { r.statusCode = 404; r.end(); });
  cdp.on('upgrade', (q, sk, h) => wss.handleUpgrade(q, sk, h, (ws) => wss.emit('connection', ws)));
  wss.on('connection', (ws) => ws.on('message', (d) => {
    let m; try { m = JSON.parse(String(d)); } catch { return; }
    const reply = (o) => ws.send(JSON.stringify({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), ...o }));
    if (m.method === 'Target.getTargets') return reply({ result: { targetInfos: [...tabs.values()] } });
    if (m.method === 'Target.attachToTarget') return reply({ result: { sessionId: `S-${m.params && m.params.targetId}-${++sn}` } });
    return reply({ result: {} });
  }));
  await new Promise((r) => cdp.listen(0, '127.0.0.1', r)); servers.push(cdp);
  const url = `ws://127.0.0.1:${cdp.address().port}/devtools/browser/watch-gate`;
  const born = [], rooted = []; let browsing = false;
  const PID = 'p-watchgate';
  const keeperSpy = { cdpEndpointFor: async () => ({ ok: true, url }), holdsDialogsFor: () => false,
    noteTabBorn: async (pid, tid, o = {}) => { born.push({ tid, witness: o.witness || null, unclear: !!o.unclear, opener: o.opener || null }); return null; },
    noteOwnTab: (pid, bk, tid) => { rooted.push({ bk, tid }); }, personBrowsing: () => browsing };
  const dw = DW.create({ keeper: keeperSpy, log: quiet, enableTimeoutMs: 300 });
  const armed = await dw.arm(PID, { budgetMs: 2000 });
  const addTab = (id) => { const info = { targetId: id, type: 'page', url: 'about:blank', title: 'T', attached: false }; tabs.set(id, info); for (const c of wss.clients) c.send(JSON.stringify({ method: 'Target.targetCreated', params: { targetInfo: info } })); };
  const birth = async (id, verbs, person) => {
    browsing = person; for (const bk of verbs) dw.verbStarted(bk, { profileId: PID, verb: 'open' });
    addTab(id); const b = await until(() => born.find((x) => x.tid === id), 2000);
    for (const bk of verbs) dw.verbEnded(bk, { profileId: PID });
    browsing = false; return { b, rooted: rooted.filter((x) => x.tid === id).map((x) => x.bk) };
  };
  const two = await birth(F2(0xE2), [KA, KB], false), one = await birth(F2(0xE1), [KB], false), oneP = await birth(F2(0xE3), [KB], true), noneP = await birth(F2(0xE0), [], true);
  console.log(`  · the real watch: two verbs ${JSON.stringify(two)} · one ${JSON.stringify(one)} · one while the person browses ${JSON.stringify(oneP)} · none while they browse ${JSON.stringify(noneP)}`);
  ok(!!(armed && armed.ok && two.b && two.b.unclear === true && two.b.witness === null && !two.rooted.length), 'r694 (5): the REAL watch — TWO agents\' verbs in flight at a birth with no opener ⇒ «unclear» (no witness, no root)', { armed, two });
  ok(!!(one.b && one.b.unclear === false && one.b.witness === KB && one.rooted.join() === KB), 'CONTROL: ONE verb in flight ⇒ its witness\'s (the release\'s rule: rooted to B)', one);
  ok(!!(oneP.b && oneP.b.unclear === true && oneP.b.witness === null && !oneP.rooted.length), 'r694 (2): ONE verb of B in flight while the person drives THEIR OWN window ⇒ UNCLEAR — never B\'s by the witness, never the person\'s', oneP);
  ok(!!(noneP.b && noneP.b.unclear === false && noneP.b.witness === null && !noneP.rooted.length), 'r694 (2) CONTROL: no verb in flight while the person drives their own window ⇒ no witness and not unclear (the keeper stamps it as theirs)', noneP);
  dw.shutdown();
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
    tabOwnersFor: async (target, o) => { calls.push({ activeTarget: o.activeTarget }); return { ok: true, owners: { [X1]: 'agent', [X2]: 'other' }, whose: { [X2]: { sessionId: 'sess-b' } }, windows: { [X1]: 1, [X2]: 1 }, leases: [{ windowId: 1, word: 'agent' }], front: frontAns, made: { [X1]: { made: 'takeover', person: false, at: 1790000000123 }, [X3]: { made: 'takeover', person: true } }, mediated: false, adoptable: false }; },
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
  ok(!!(owners1 && owners1.made && owners1.made[X1] && owners1.made[X1].made === 'takeover' && owners1.made[X1].person === false && owners1.made[X1].at === 1790000000123 && !(X3 in owners1.made)), 'B-e674 unit 2: tab-owners carries the birth stamps of the tabs this view LISTS (an unlisted tab\'s stamp never reaches it)', owners1 && owners1.made);
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
  const say = (r) => ({ v: r.visible.map((x) => x[0]), f: r.folded.map((x) => x[0]), cut: r.ownCutPx, foldFront: r.foldFront && r.foldFront[0], bare: r.ownBare });
  const cells = [
    ['a row of two, roomy', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 240], [fr, 240]]), avail: 700, endPx: 60 }), (r) => r.visible.length === 2 && r.ownCutPx === null && r.foldFront === null],
    ['a row of two, narrow: this view\'s own chip cuts, the front stays whole', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 240], [fr, 200]]), avail: 420, endPx: 60, ownMinPx: 120 }), (r) => r.visible.includes(fr.targetId) && r.ownCutPx === 160 && r.foldFront === null],
    ['a row of five, narrow: three fold, own + front stay', LS.tabRowFit({ rows: [own, fr, o(1), o(2), o(3)], widths: W([[own, 240], [fr, 200], [o(1), 150], [o(2), 150], [o(3), 150]]), avail: 470, endPx: 60, ownMinPx: 120 }), (r) => r.visible.join() === [own.targetId, fr.targetId].join() && r.folded.length === 3 && r.ownCutPx === 166 && r.foldFront === null],
    ['one own chip with a long name', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 480], [fr, 200]]), avail: 420, endPx: 60, ownMinPx: 120 }), (r) => r.visible.includes(fr.targetId) && r.ownCutPx === 160],
    ['too narrow even for a cut own chip: the front folds and THE FOLD SAYS IT', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 240], [fr, 200]]), avail: 300, endPx: 60, ownMinPx: 140 }), (r) => !r.visible.includes(fr.targetId) && r.folded.includes(fr.targetId) && r.foldFront === fr.targetId && r.ownCutPx === 196],
    // line 100's cure (r618): the worded fold's pill is budgeted; only the title gives way — down to the floor, then the chip goes bare
    ['the fold that says it is WIDER: its worded pill is budgeted (the old plain-pill budget cut to 196)', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 240], [fr, 200]]), avail: 300, endPx: 60, morePx: 44, moreFrontPx: 90, ownMinPx: 140, ownBareMinPx: 40 }), (r) => r.foldFront === fr.targetId && r.ownCutPx === 150 && r.ownBare === false],
    ['the cut stops AT the floor (the chip without its title + an ellipsis), its parts whole', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 240], [fr, 200]]), avail: 290, endPx: 60, morePx: 44, moreFrontPx: 90, ownMinPx: 140, ownBareMinPx: 40 }), (r) => r.ownCutPx === 140 && r.ownBare === false],
    ['below the floor its parts go WHOLE (bare), never half — its title takes what is left', LS.tabRowFit({ rows: [own, fr], widths: W([[own, 240], [fr, 200]]), avail: 250, endPx: 60, morePx: 44, moreFrontPx: 90, ownMinPx: 140, ownBareMinPx: 40 }), (r) => r.ownCutPx === 100 && r.ownBare === true],
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
    ['the fit is asked with the own chip\'s floor', 'const f = tabRowFit({'], ['…its floor measured: the chip without its title + an ellipsis (r618: only the title gives way)', 'const ownMinPx = ownEl ? ownEl.offsetWidth - ownTitleW + 14 : 0'], ['…and its bare floor (no parts)', 'ownBareMinPx = ownEl ? Math.max(0, ownMinPx - ownPartsW) : 0'], ['the worded pill measured (r618)', "moreFrontPx = pillW('▾+' + nMax + ' · ' + t('In front'))"], ['…both handed to the fit', 'morePx, moreFrontPx, ownMinPx, ownBareMinPx,'], ['a bare chip hides its parts whole', "ownEl.classList.toggle('bare', !!f.ownBare)"],
    ['a cut is re-judged from whole widths (and a bare chip whole again)', "for (const c of chips) { c.style.maxWidth = ''; c.classList.remove('bare'); }"], ['the own chip\'s cut', "if (ownEl && f.ownCutPx != null) ownEl.style.maxWidth = f.ownCutPx + 'px';"],
    ['the fold says it in WORDS', "(fr ? ' · ' + t('In front') : '')"], ['…its tip the front\'s words', "(fr && fr.frontTip ? fr.frontTip + '\\n' : '')"],
    ['…its edge', "tabRowMore.classList.toggle('front-foreign', !!fr);"], ['the menu\'s FIRST row is the front', 'if (fr) items.push({ label: `${fr.frontText} — ${fr.title} · ${fr.mark}`'],
  ];
  const n = (txt, x) => txt.split(x).length - 1;
  const miss = PINS.filter(([, x]) => n(LW, x) !== 1).map(([w, x]) => ({ w, x, n: n(LW, x) }));
  ok(miss.length === 0, `the client's fit wiring, each line ONCE (${PINS.length} pins)`, miss);
  // r1111: THE ROW IS FITTED TO WHAT IS DRAWN, WHENEVER WHAT IT MEASURED CHANGES — the observer watches the end button and the pill
  // as well as the row's own box (the heavy leg: test-browser-resume-ui ⑨ grows the end button alone and reads the row fitted again)
  const REFIT = 'tabRo.observe(tabRow); tabRo.observe(tabRowQuit); tabRo.observe(tabRowMore);';
  const EACH = 'if (tabRo) for (const c of [...chips, ...dividers]) if (!tabRoSeen.has(c)) { tabRoSeen.add(c); tabRo.observe(c); }';
  const GONE = 'if (!keep.has(id)) { if (tabRo) tabRo.unobserve(el); el.remove(); }';
  ok(n(LW, REFIT) === 1, 'r1111: the row is fitted again when the end button or the pill changes size, not only when the row\'s own box does', REFIT);
  ok(n(LW, EACH) === 1 && n(LW, GONE) === 1, 'r1111: …and when a chip or a divider does — each watched ONCE as the fit first meets it (observe() again would report it anew: a loop), unwatched when it goes', { EACH: n(LW, EACH), GONE: n(LW, GONE) });
  // RED CONTROL: the release's wiring (the row's own box only) fails that pin
  const rel = anchored(LW, REFIT, 'tabRo.observe(tabRow);', 'r1111 the release\'s observer');
  ok(n(rel, REFIT) === 0, 'RED CONTROL: the release\'s observer (the row\'s own box only) is read as missing the refit — the pin above can go red');
}

// ═══ ⑥ THE CLIENT'S WIRING (B-e674 unit 2, its round's should 5: only the heavy ⑨ read it) ═══════════════════════
console.log('— ⑥ the client\'s wiring: the record kept, handed to the row and the pane, drawn on the chip, cleared on a switch');
{
  const LW = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  const PINS = [
    ['the record is KEPT', "st.tabFront = m.front && typeof m.front === 'object' ? { ...m.front } : null;"],
    ['…cleared with the other tab facts on a switch', 'st.tabOwners = {}; st.tabFront = null;'],
    ['…handed to the row', 'names: tabNamesNow(), front: st.tabFront, made: st.tabMade }, t);'],
    ['…handed to the pane (it never folds the marked tab)', "front: st.tabFront && st.tabFront.state === 'foreign' ? st.tabFront.targetId || null : null }, t);"],
    ['the chip\'s words', "const hx = r.hereText || r.frontText || '';"],
    ['the chip\'s class', "el.classList.toggle('front-foreign', !!r.front);"],
    ['the chip\'s tip, first', "(r.frontTip ? r.frontTip + '\\n' : '')"],
    ['the unlisted front\'s line', 'if (m.frontNote) {'],
    ['…and the fold never hides it', "d.dataset.group === 'blanks' || d.dataset.group === 'front-note' ||"],
  ];
  const n = (txt, x) => txt.split(x).length - 1;
  const miss = PINS.filter(([, x]) => n(LW, x) !== 1).map(([w, x]) => ({ w, x, n: n(LW, x) }));
  ok(miss.length === 0, `the client's wiring, each line ONCE (${PINS.length} pins): ${PINS.map(([w]) => w).join(' · ')}`, miss);
  // CONTROL: the copy without the row's hand-over is named by the pins
  const cut = anchored(LW, 'names: tabNamesNow(), front: st.tabFront, made: st.tabMade }, t);', 'names: tabNamesNow(), made: st.tabMade }, t);', 'the row without the front');
  ok(PINS.filter(([, x]) => n(cut, x) !== 1).map(([w]) => w).join() === '…handed to the row', 'CONTROL: a client copy that stops handing the front to the row is red on exactly that pin');
}

// ═══ ⑦ EVERY ROAD A TAB IS CREATED BY (B-e674 unit 2: the census, src/browser-windows.js CREATE_ROADS) ════════════════════
console.log('— ⑦ the census of create roads: every create site named by a road, every road proved or said «not on the box»');
{
  const WN = require('../src/browser-windows.js');
  const siteLines = (files, textOf) => files.flatMap((f) => textOf(f).split('\n').map((l, i) => ({ f, n: i + 1, l })).filter(({ l }) => !/^\s*(\/\/|\*|\/\*)/.test(l) && WN.CREATE_SITE_RE.test(l)));
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const named = (x) => WN.CREATE_ROADS.some((r) => r.sites.some(([f, needle]) => f === x.f && x.l.includes(needle)));
  const sites = siteLines(WN.CREATE_SITE_FILES, read);
  const unnamed = sites.filter((x) => !named(x)).map((x) => `${x.f}:${x.n} ${x.l.trim().slice(0, 90)}`);
  const stale = WN.CREATE_ROADS.flatMap((r) => r.sites.filter(([f, needle]) => !read(f).includes(needle)).map(([f, needle]) => `${r.id}: ${f} «${needle.slice(0, 50)}»`));
  console.log(`  · ${sites.length} create sites in ${WN.CREATE_SITE_FILES.length} files, ${WN.CREATE_ROADS.length} roads (${WN.CREATE_ROADS.filter((r) => r.notOnBox).length} not on the box)`);
  ok(sites.length >= 12 && unnamed.length === 0 && stale.length === 0, `every create site in the agent browser's code is named by a road (${sites.length} sites), and every road's needle is still there`, { unnamed, stale });
  const unproved = WN.CREATE_ROADS.filter((r) => {
    if (r.notOnBox) return !(typeof r.notOnBox === 'string' && r.notOnBox.length > 20) || !!r.proof || !!r.measure;
    const pm = r.proof || r.measure; // r683: a printed MEASURE is said as one (its words name it so), never counted as a proof
    if (!Array.isArray(pm) || pm.length !== 2 || (r.proof && r.measure) || (r.measure && !/^MEASURE /.test(r.measure[1]))) return true;
    const f = path.join(REPO, 'scripts', pm[0] + '.mjs');
    return !fs.existsSync(f) || !fs.readFileSync(f, 'utf8').includes(pm[1]);
  }).map((r) => r.id);
  ok(unproved.length === 0 && WN.CREATE_ROADS.every((r) => r.id && r.road && r.lands && r.whose), 'every road says where its tab lands and whose it reads — and is PROVED by a leg its suite carries (the words named are in it) or says why it is NOT ON THE BOX', unproved);
  // RED CONTROL: a copy of a create file with one more create no road names
  const extra = siteLines(['src/server/browser-keeper.js'], (f) => read(f) + "\n    const z = await rt.exec(ns, ['tab', 'new', 'about:blank'], o);\n");
  ok(extra.filter((x) => !named(x)).length === 1, 'RED CONTROL: one more create in the keeper that no road names is named by the census');
  // the wiring of the stamp: the watch tells the keeper at a tab's birth; the client hands the stamps to the row
  const DL = read('src/server/browser-dialogs.js'), LW = read('src/lib/browser-live-window.js'), BS = read('src/server/browser-stream.js');
  const n = (txt, x) => txt.split(x).length - 1;
  const PINS = [[DL, 'Promise.resolve(keeper.noteTabBorn(w.profileId, tid, { opener: e.opener, witness: !e.opener ? e.owner : null, unclear: !e.opener && !e.owner && (personOwn ? inFlight >= 1 : inFlight > 1) })).catch(fail)'],
    [DL, 'if (e.seenAt) e.owner = e.opener ? openerOwner(w, e.opener) : personOwn ? null : createdOwner(w);'], // r694 (2)
    [LW, "if (was === 'takeover' && wasMine && (m.mode || 'watch') === 'watch') st.lastStays = handbackStayText(takeoverStays({ tabs: st.tabs, made: st.tabMade, since: wasSince }), t);"], // r694 (3)
    [LW, "showToast(withStays(st.lastRerun ? t('Control handed back to the agent — it was told to re-run: {verbs}', { verbs: st.lastRerun }) : t('Control handed back to the agent'), stays)"], [LW, "t('Your takeover lapsed (no input) — the agent is driving again')), st.lastStays)"], [BS, 'mine: !!m.mine, at: Number.isFinite(Number(m.at)) ? Number(m.at) : 0 };'], [LW, 'st.tabOwners = {}; st.tabFront = null; st.tabMade = {};'], [LW, 'front: st.tabFront, made: st.tabMade }, t);'], [LW, "st.tabMade = m.made && typeof m.made === 'object' ? { ...m.made } : {};"], [BS, 'front, made, mediated: !!r.mediated']];
  ok(PINS.every(([txt, x]) => n(txt, x) === 1), 'the stamp\'s wiring, each line ONCE: the watch\'s birth call (with «unclear», r683; the person browsing their own window makes a witnessed birth unclear, r694 (2)), the bridge\'s record (its birth instant), the client\'s state, its hand-over to the row, the pane switch clearing it, and the handback\'s count in both of its toasts (r694 (3))', PINS.filter(([txt, x]) => n(txt, x) !== 1).map(([, x]) => x));
}

// ═══ ④ THE WORDS ═════════════════════════════════════════════════════════════
console.log('— ④ the words: every key frontText asks t() for has a zh and a ja row');
{
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const keys = []; const t = (s) => { keys.push(s); return s; };
  for (const owner of ['other', 'you', 'orphan']) { TT.frontText({ state: 'foreign', owner }, { name: 'N' }, t); TT.frontText({ state: 'foreign', owner }, {}, t); }
  TT.frontNoteText(t); // B-e674 unit 2
  TT.madeText({ made: 'takeover', person: false, mine: true }, 'agent', t); TT.madeText({ made: 'browse', person: true }, 'you', t); // B-e674 unit 2: the stamp's words (r683: named where `mine`)
  TT.handbackStayText(1, t); TT.handbackStayText(3, t); t('{first}. {second}'); // r694 (3): the handback's words + the client's joiner (withStays)
  const lit = (s) => JSON.stringify(s).replace(/\\u([0-9a-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const has = (dict, k) => dict.includes(lit(k) + ':');
  const uniq = [...new Set(keys)];
  const miss = uniq.filter((k) => !has(zh, k) || !has(ja, k));
  keys.push('In front'); uniq.push('In front'); miss.push(...['In front'].filter((k) => !has(zh, k) || !has(ja, k))); // B-e674 (r608): the fold's word
  ok(uniq.length === 15 && miss.length === 0, `every key frontText / frontNoteText / madeText / handbackStayText (+ the handback's joiner, and the fold's «In front») ask t() for (${uniq.length}) has a zh and a ja row`, miss);
}
console.log('— ⑧ 主开发 r5164 (2), a silence of the release: the hand-back\'s answer read whole — a note not queued (stash_refused: handed back all the same), a note not on disk, said; no path, no value');
{
  // the route's own answers (src/routes/browser.js: ok ⇒ its fields; a refusal ⇒ failVerdict's { error, code, handles })
  const ANS = { ok: { ok: true, id: 'bres-0a0b0c0d', stashed: true, durable: true, carded: true, tabs: 1 },
    notQueued: { error: 'the note could not be queued for the agent\'s next turn: the stash could not be written to disk (msg-stash.json) — the entry was not stored', code: 'stash_refused', handles: [] },
    notOnDisk: { ok: true, id: 'bres-0a0b0c0e', stashed: true, durable: false, carded: true, tabs: 1, why: 'taken, not on disk: the list could not be read' },
    other: { error: 'the browser keeper is not available', code: 'unavailable', handles: [] },
    early: { error: 'this conversation has no id yet (its first reply has not come back) — hand it back after the agent has answered once', code: 'no_conversation_id', handles: [] },   // r5235: refused BEFORE any act
    notQueuedOwn: { error: 'the note could not be queued for the agent\'s next turn: the stash could not be written — its next browser command is told instead', code: 'stash_refused', handles: [], own: true } };   // r5235 should: its own browser
  const words = (W) => Object.fromEntries(Object.entries(ANS).map(([k, r]) => [k, W(r)]));
  const w = words(TT.handBackAnswerWords);
  const noPath = [w.notQueued, w.notOnDisk].every((x) => !/msg-stash|\.json|EIO|\/srv\//.test(x.text));
  ok(w.ok.handedBack && !w.ok.warn && /reads your note and the tabs/.test(w.ok.text) && w.notQueued.handedBack && w.notQueued.warn && /could not be queued for the agent's next turn/.test(w.notQueued.text) && w.notOnDisk.handedBack && w.notOnDisk.warn && /not on disk yet/.test(w.notOnDisk.text) && !w.other.handedBack && !w.early.handedBack && /^Not handed back — this conversation has no id yet/.test(w.early.text) && w.notQueuedOwn.handedBack && /its next browser command is told instead/.test(w.notQueuedOwn.text) && noPath,
    '⑧ the hand-back\'s answer: queued and on disk ⇒ «handed back»; STASH_REFUSED ⇒ handed back WITH a warning that the note was not queued (never «could not hand back: <the stash\'s file>»); NOT ON DISK ⇒ a warning; another refusal ⇒ not handed back (the page\'s own words); never the stash\'s error text', JSON.stringify(w));
  { // the three sentences each have a zh and a ja row (new words a person reads: zh and ja with them)
    const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
    const keys = []; const rec = (k) => { keys.push(k); return k; };
    for (const r of Object.values(ANS)) TT.handBackAnswerWords(r, rec);
    const lit = (k) => JSON.stringify(k).replace(/\\u([0-9a-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    const miss = [...new Set(keys)].filter((k) => !zh.includes(lit(k) + ':') || !ja.includes(lit(k) + ':'));
    ok(new Set(keys).size === 5 && miss.length === 0, '⑧ …its five sentences each have a zh and a ja row', miss);
  }
  const LWS = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(LWS.includes("    const w = handBackAnswerWords(r, t);\n    if (!w.handedBack) { renderMode(); showToast(w.text || t('Could not hand the browser back: {why}'") && LWS.includes('    showToast(w.text, w.warn ? { type: \'warn\', duration: 9000 } : { duration: 5000 });'),
    '⑧ …the page decides by those words: a refusal only when not handed back, else its toast is the words (src/lib/browser-live-window.js)');
  const TSRC = fs.readFileSync(path.join(REPO, 'src/browser-tabs.js'), 'utf8');
  const cut1 = anchored(TSRC, "  if (r && (r.code === 'stash_refused' || (r.ok === true && r.stashed === false))) return { handedBack: true,", '  if (false) return { handedBack: true,', 'the release: a stash_refused read as a refusal');
  const cut2 = anchored(cut1, '  if (r.durable === false) return { handedBack: true,', '  if (false) return { handedBack: true,', 'the release: durable not read');
  const F = path.join(ROOT, 'browser-tabs-release-words.js'); fs.writeFileSync(F, absReq(cut2, path.join(REPO, 'src')));
  const wx = words(require(F).handBackAnswerWords);
  ok(!wx.notQueued.handedBack && !wx.notOnDisk.warn, '⑧ RED CONTROL (the release: the answer not read): a stash_refused reads «could not hand the browser back» (its error, the file named), a note not on disk «handed back»', JSON.stringify(wx));
}
report();

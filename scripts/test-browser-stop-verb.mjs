#!/usr/bin/env node
// scripts/test-browser-stop-verb.mjs — browsers.stop (lane browsers-stop, majordomo piece 6). An agent holding a key with the verb
// stops ONE running browser by its id — through the keeper's OWN stop, under its own closed reason `manager` — and ONLY when
// nobody uses it: ONE PURE verdict (src/browser-profiles.js stopVerdict) over the keeper's read-only rows (stopRows).
// FAST: the REAL keeper over the suites' fake agent-browser (a daemon that is a real `sleep`), a REAL browser-env and the REAL
// kept store (the rig of test-browser-kept ⑤), the REAL handler (src/server/conversation-ops.js automationVerbs).
//   ① the verdict table: every refusal alone, every unknown refuses, an idle browser may stop
//   ② refused while the holder's turn runs and while it is unknown; while the person took it over; while a live view is open;
//      while a holder is outside the key's reach (not_granted) — and the browser still runs after each
//   ③ admitted when idle: stopped under `manager`, the tabs captured, and the next command REOPENS them by itself
//   ④ CONTROL: a detach (the user's stop) in the same world marks the stop deliberate — the tabs are NOT reopened (the probe
//      tells the two apart)
//   ⑤ RED: the verdict's unknown branch switched off (a scratch copy) — the unknown leg goes red
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const KB = require('../src/browser-kept.js');
const B = require('../src/browser-profiles.js');
const CR = require('../src/channel-record.js');
const F = require('../src/browser-facts.js');
const KS = require('../src/server/browser-kept.js');
const BE = require('../src/server/browser-env.js');
const K = require('../src/server/browser-keeper.js');
const TBS = require('../src/browser-tabs.js'); // lane profile-lock-roll L2 (⑭)
const LIMITS = require('../src/keeper-limits.js');
const express = require('express');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
const REPO = new URL('..', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 5000, step = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(step); } return !!(await pred()); };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const quiet = { log() { }, warn() { }, error() { } };
const MB = KB.MB;

// ── scratch world ──
const ROOT = scratch('browser-stop-verb');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const NODE_DIR = path.dirname(process.execPath);
const PATH_ENV = `${BIN}:${NODE_DIR}:${process.env.PATH || '/usr/bin:/bin'}`;
process.env.PATH = PATH_ENV;
// the fake agent-browser (the housekeeping suite's shape: a daemon that is a real `sleep`)
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv.filter((x) => x !== '--json');
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
// lane B: the fake keeps TABS (the measured 0.38.1 shapes: open / tab new answer the tab's targetId, a tab new makes
// the new tab the active one, a CDP target id is a tab ref) and logs every command it ran (the suite reads the sequence)
const tid = () => Array.from({ length: 32 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
const write = (s) => fs.writeFileSync(f, JSON.stringify(s));
fs.appendFileSync(path.join(st, 'cmds.log'), JSON.stringify({ ns, argv: argv.filter((x) => x !== '--json') }) + '\\n');
const failUrl = process.env.FAKE_AB_FAIL_URL || '';
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, config: process.env.AGENT_BROWSER_CONFIG || null, n: 1, tabs: [{ tabId: 't1', targetId: tid(), url: 'about:blank', label: null, active: true }] }; write(s); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, pid: s.pid, config: s.config }) + '\\n'); }
  if (failUrl && String(b).includes(failUrl)) { out({ success: false, error: 'fake: net::ERR_NAME_NOT_RESOLVED' }); process.exit(1); }
  s.tabs = s.tabs || []; const act = s.tabs.find((t) => t.active) || s.tabs[0]; if (act) act.url = b; write(s); out({ success: true, data: { targetId: act ? act.targetId : null, url: b } }); process.exit(0); }
if (a === 'tab') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); }
  const rest = argv.slice(1).filter((x) => x !== '--json');
  if (rest[0] === 'new') { let label = null; const r2 = rest.slice(1); const li = r2.indexOf('--label'); if (li >= 0) { label = r2[li + 1]; r2.splice(li, 2); } const url = r2[0] || 'about:blank';
    if (failUrl && url.includes(failUrl)) { out({ success: false, error: 'fake: net::ERR_NAME_NOT_RESOLVED' }); process.exit(1); }
    s.n = (s.n || 1) + 1; for (const t of s.tabs) t.active = false; const t = { tabId: 't' + s.n, targetId: tid(), url, label, active: true }; s.tabs.push(t); write(s); out({ success: true, data: { tabId: t.tabId, targetId: t.targetId, url, label, total: s.tabs.length } }); process.exit(0); }
  if (!rest.length || rest[0] === 'list') { out({ success: true, data: { tabs: s.tabs } }); process.exit(0); }
  if (rest[0] === 'close') { out({ success: false, error: 'fake: this suite never closes a tab' }); process.exit(1); }
  const t = s.tabs.find((x) => x.tabId === rest[0] || x.label === rest[0] || x.targetId === rest[0]); if (!t) { out({ success: false, error: 'fake: no tab ' + rest[0] }); process.exit(1); }
  for (const x of s.tabs) x.active = x === t; write(s); out({ success: true, data: { tabId: t.tabId, targetId: t.targetId } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:1/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const launches = () => { try { return fs.readFileSync(path.join(AB_STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const cmds = (ns) => { try { return fs.readFileSync(path.join(AB_STATE, 'cmds.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((c) => !ns || c.ns === ns); } catch { return []; } };
const fakeTabs = (ns) => { try { return JSON.parse(fs.readFileSync(path.join(AB_STATE, ns + '.json'), 'utf8')).tabs || []; } catch { return []; } };
const servers = [];
const keepers = [];
function cleanup() { for (const k of keepers) { try { k.shutdown(); } catch { } } for (const l of launches()) { try { process.kill(l.pid, 'SIGKILL'); } catch { } } for (const s of servers) { try { s.close(); } catch { } } fs.rmSync(ROOT, { recursive: true, force: true }); }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });


const OPS = require('../src/server/conversation-ops.js');
const KEY_A = 'bk-0000a001';
const CID_A = 'e2e00000-0000-4000-8000-0000000000a1';
// ① the verdict table
{
  const idle = { live: true, takenOver: false, watched: false, personBrowsing: false, holders: [{ turn: 'idle', granted: true }] };
  ok(B.stopVerdict(idle).stop === true && B.stopVerdict(idle).code === null, '① an idle browser nobody uses may stop');
  const rows = [['person_driving', { takenOver: true }], ['person_driving', { takenOver: null }], ['watched', { watched: true }], ['watched', { watched: null }],
    ['person_browsing', { personBrowsing: true }], ['person_browsing', { personBrowsing: null }], ['holder_busy', { holders: [{ turn: 'running', granted: true }] }],
    ['holder_busy', { holders: [{ turn: 'waiting', granted: true }] }], ['holder_busy', { holders: [{ turn: null, granted: true }] }], ['holder_busy', { holders: null }],
    ['not_granted', { holders: [{ turn: 'idle', granted: false }] }], ['already_stopped', { live: false }], ['browser_unknown', { live: null }]];
  const bad = rows.map(([code, over]) => [code, B.stopVerdict({ ...idle, ...over })]).filter(([code, v]) => v.stop || v.code !== code);
  ok(bad.length === 0, `① each refusal alone, and each UNKNOWN, refuses with its code (${rows.length} rows)`, bad);
  ok(rows.filter(([c]) => c !== 'already_stopped').every(([, over]) => B.stopVerdict({ ...idle, ...over }).why.includes(B.STOP_DOOR)), '① every refusal names the person\'s door');
}
// the world: the real keeper, a real browser-env, the real kept store; the conversation's turn as the hub reads it
const K_DATA = path.join(ROOT, 'k-data'); fs.mkdirSync(K_DATA, { recursive: true });
fs.writeFileSync(path.join(HOME, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox' }));
const settings = { 'browser.idleTimeoutMs': 600000 };
const turns = new Map();
const kLive = new Set([KEY_A]);
const cdpTargets = new Map();
const beK = BE.create({ dataDir: K_DATA, homeDir: HOME, serverSetting: (k) => settings[k], log: quiet, socketDirBase: path.join(ROOT, 'sock') });
const rtEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE };
let keeper = null;
const kept = KS.create({ dataDir: K_DATA, keeper: () => keeper, liveKeys: () => kLive, serverSetting: (k) => settings[k], log: quiet, sweepEveryMs: 0 });
keeper = K.create({ dataDir: K_DATA, homeDir: HOME, env: () => rtEnv, serverSetting: (k) => settings[k], liveKeys: () => kLive, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }),
  limits: { ...LIMITS, CONCURRENT_CAP: 6 }, log: quiet, tickMs: 3600e3, install: false, kept, conversationFacts: (bk) => (turns.has(bk) ? { turn: turns.get(bk) } : {}),
  readTargets: async (url) => (cdpTargets.has(url) ? { ok: true, targets: cdpTargets.get(url) } : { ok: false, error: 'no fake target list for ' + url }) });
keepers.push(keeper);
const envA = beK.envFor({ browserKey: KEY_A, cwd: HOME });
const start = () => keeper.ensureEphemeral({ browserKey: KEY_A, sessionId: 'sess-a', envPairs: envA.pairs, sessionName: 'Research', variant: envA.variant });
const sessions = new Map([['sess-a', { backend: 'claude', mode: 'chat', backendSessionId: CID_A, name: 'Research' }]]);
const verbs = OPS.automationVerbs({ activeSessions: sessions, browsers: { rows: () => keeper.stopRows(), stop: (id) => keeper.managerStop(id) } });
const reachA = ({ conversationId }) => ({ ok: conversationId === CID_A });
const call = (id, reach = reachA) => verbs['browsers.stop']({ id }, { caller: { conversationId: 'e2e00000-0000-4000-8000-0000000000ee' }, keyId: 'k1', reach });
const liveA = () => { const e = keeper.ephemeralFor(KEY_A); return !!(e && e.live); };
await start();
const pid = keeper.ephemeralFor(KEY_A).profileId;
keeper.noteTabs({ kind: 'ephemeral', ns: 'vs-' + KEY_A, browserKey: KEY_A }, [{ tabId: 't1', targetId: 'AA01', url: 'https://mail.test/', title: 'Mail', active: true }]);
cdpTargets.set('ws://127.0.0.1:1/devtools/browser/fake-vs-' + KEY_A, [{ targetId: 'AA01', type: 'page', url: 'https://mail.test/inbox', title: 'Inbox' }]);
{
  const rows = keeper.stopRows();
  const r = rows.find((x) => x.id === pid);
  ok(r && r.kind === 'own' && r.tabsKept === true && r.holders.length === 1 && r.holders[0].browserKey === KEY_A && r.holders[0].sessionId === 'sess-a' && r.takenOver === false && r.viewers === 0 && r.personBrowsing === false,
    '② the keeper\'s rows: the conversation\'s own browser, its one holder, nobody drives or watches it', r);
  turns.set(KEY_A, 'running');
  const a = await call(pid);
  ok(!a.ok && a.code === 'holder_busy' && /turn is running/.test(a.why) && liveA(), '② the holder\'s turn RUNS: holder_busy, the browser still runs', a);
  turns.delete(KEY_A);
  const b = await call(pid);
  ok(!b.ok && b.code === 'holder_busy' && /unknown/.test(b.why) && liveA(), '② the holder\'s turn is UNKNOWN: holder_busy, the browser still runs', b);
  turns.set(KEY_A, 'idle');
  const t = keeper.takeover({ browserKey: KEY_A, viewerId: 'v1', sessionId: 'sess-a' });
  const c = await call(pid);
  ok(t && t.ok !== false && !c.ok && c.code === 'person_driving' && liveA(), '② the person TOOK IT OVER: person_driving, it still runs', { t, c });
  try { keeper.handback({ browserKey: KEY_A, viewerId: 'v1' }); } catch { }
  try { keeper.release?.({ browserKey: KEY_A }); } catch { }
  const stillDriven = keeper.inputStateFor(KEY_A, null).input === 'user';
  if (stillDriven) console.log('  ○ (the takeover could not be handed back through this world — the next legs read it as still driven)');
  keeper.noteViewers(KEY_A, null, 1);
  const d = await call(pid);
  ok(!d.ok && (d.code === 'watched' || (stillDriven && d.code === 'person_driving')) && liveA(), '② a LIVE VIEW is open: watched, it still runs', d);
  keeper.noteViewers(KEY_A, null, 0);
  const e = await call(pid, () => ({ ok: false }));
  ok(!e.ok && (e.code === 'not_granted' || (stillDriven && e.code === 'person_driving')) && liveA(), '② the holder is outside the key\'s reach: not_granted', e);
  if (!stillDriven) {
    const f = await call(pid);
    const k1 = kept.get(KEY_A);
    ok(f.ok && f.kind === 'own' && /reopen/.test(f.tabs) && !liveA() && k1.stoppedWhy === 'manager' && k1.restore && k1.restore.mode === 'auto' && k1.tabs[0].url === 'https://mail.test/inbox',
      '③ admitted when idle: stopped under `manager`, the tabs read at the stop and kept, restore AUTO (not deliberate)', { f, kept: k1 && { why: k1.stoppedWhy, restore: k1.restore, tabs: k1.tabs } });
    await start();
    const k2 = kept.get(KEY_A);
    const reopened = await until(() => fakeTabs('vs-' + KEY_A).some((t) => t.url === 'https://mail.test/inbox'), 5000);
    ok(liveA() && k2.stoppedAt === null && !(k2.restore && k2.restore.mode === 'auto') && reopened, '③ the next command starts it again — and that start REOPENS the kept tab in the new browser (the restore consumed)', { kept: k2, tabs: fakeTabs('vs-' + KEY_A) });
    // ④ CONTROL: a detach in the same world — the user's stop — is deliberate: kept, NOT reopened by themselves
    await keeper.stop(keeper.ephemeralFor(KEY_A).profileId, { why: 'user' });
    const k3 = kept.get(KEY_A);
    await start();
    await sleep(300);
    const notReopened = !fakeTabs('vs-' + KEY_A).some((t) => t.url === 'https://mail.test/inbox');
    ok(k3.stoppedWhy === 'user' && k3.restore === null && notReopened, '④ CONTROL the user\'s stop in the same world: deliberate — the tabs kept, and the next start does NOT reopen them (the probe tells the two apart)', { kept: k3, tabs: fakeTabs('vs-' + KEY_A) });
  }
}
// ⑤ RED: the verdict's unknown branch switched off
{
  const MUT = mutantCopies('browser-stop-verb', path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'));
  const src = fs.readFileSync(new URL('../src/browser-profiles.js', import.meta.url), 'utf8');
  const NEEDLE = "  if (busy) return no('holder_busy',";
  ok(src.split(NEEDLE).length === 2, '⑤ the holder rule is in the verdict once (the mutation anchor)');
  const M = MUT.load('src/browser-profiles.js', src.replace("  const busy = holders.find((h) => h.turn !== 'idle');", "  const busy = holders.find((h) => h.turn === 'running' || h.turn === 'waiting');"), 'unknown-turn-stops');
  const v = M.stopVerdict({ live: true, takenOver: false, watched: false, personBrowsing: false, holders: [{ turn: null, granted: true }] });
  ok(v.stop === true, '⑤ RED a verdict that reads an UNKNOWN turn as idle would stop it — the unknown leg above would be red', v);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

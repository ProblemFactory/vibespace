#!/usr/bin/env node
// THE MANAGED EPHEMERAL BROWSER (docs/design-browser-takeover.md §5, chunk C3;
// the owner 2026-09-24: "VibeSpace takes the browser over completely"). FAST
// tier: a fake `agent-browser` (a real `sleep` is its daemon), the REAL keeper,
// the REAL routes on an express app listening on 0, the SHIPPED CLI, scratch
// dirs and an isolated $HOME only — no real browser, no port claimed by name.
//
//   ① PURE (src/browser-profiles.js + src/browser-trace.js): the ephemeral
//      record's shape (owned by the conversation, never mediated), the registry
//      admits it only in that shape, the attachment set never lists it (no
//      handle, `profile_required` unaffected), the ceiling COUNTS it and the
//      count seam's holders (D2) and answers the typed `browser_cap` naming
//      every holder and the way out — a named start keeps its `cap` sentence
//      (control); the pairs verdict; a child's pairs; the housekeeping sweep
//      never touches its directory.
//   ② THE KEEPER + ROUTES + CLI: a conversation's first page verb records ONE
//      ephemeral record (ns `vs-<key>`), ONE lease aliased `ephemeral`, ONE
//      audit line, and `/resolve` answers `kind:'ephemeral'` with the
//      session's EXACT spawn pairs — the browser-env resolver is never asked
//      (no re-run of the ladder); the launch ran under those pairs; a second
//      verb reuses it; `profiles` omits it and `status` names it; an idle-out
//      (the daemon's pid gone) is recorded `stopped` without an error and the
//      next verb relaunches; the live view's stream port for it equals the
//      legacy ephemeral path's (parity); the takeover pauses its verbs; a fork
//      key gets its own record, a child handle its own (reaped with the
//      parent); conversation death drops the lease, stops the browser and
//      REMOVES the record — a named profile never (control); six holders
//      (named + ephemeral + a desktop app through the seam) ⇒ the seventh
//      conversation's first verb is refused `browser_cap` by name.
//      r2: every /resolve kind names the keeper's socket root (`socketDir` /
//      `runtimeDir`; rung H only `hostSocketBase`), and a decoy SOCKET_DIR +
//      XDG_RUNTIME_DIR in the shell still lands the shipped CLI on the keeper's
//      root (the r1 verb table beside a CLI copy is the control).
//      r3: the CONFIG FILE is named, never searched — the keeper launches a
//      browser whose pairs carry none with ITS machine file, /resolve names the
//      same file, the command from a directory holding an agent-browser.json
//      runs with it; the file is the user config by the one rule; a torn user
//      file names none (said); the pre-r3 keeper (patched copy) is the control.
//   r4: the keeper's memo names its file only while lstat says it is its own
//      regular file with its content — a swapped-in symlink / an edit is
//      re-written (the r3 existsSync check in a patched copy is the control).
//   ③ RESOURCE REPORT + RESTART (2026-09-25, the owner's ruling): an
//      over-threshold sample is REPORTED — ONE notice, the browser keeps
//      running, its next verb is served, nothing is parked; a new keeper over
//      the same data dir (a
//      server restart) ADOPTS a live ephemeral daemon under its recorded pairs
//      and records a gone one stopped.
//   ④ LANE H (2026-09-25 — the owner watched an agent's ephemeral browser start
//      and saw nothing: no live view, no recorded action): the managed
//      ephemeral browser is a FIRST-CLASS HOLDER — its lease is a row of the
//      digest's `leases` (and the status route's) while its browser is ready,
//      marked `ephemeral`, and leaves on an idle-out; its start / every verb /
//      its stop are lease-seam events carrying its conversation; a listener's
//      promise (the recorder arming) HOLDS the verb until it resolves, so the
//      first command lands on a tapped stream; the REAL recorder over this
//      keeper arms a viewer-less tap on THAT browser (EPHEMERAL_REF) and files
//      the navigation under data/browser-trace/ephemeral; a view of a stopped
//      one is refused `browser_stopped` without asking the CLI (which would
//      launch a daemon); `browserLive` says 'ephemeral'. CONTROL: a keeper copy
//      (scripts/mutant-copy.mjs) whose holder rows drop the ephemeral ⇒ no
//      digest row, no browserLive, and the recorder arms NOTHING.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const B = require('../src/browser-profiles.js');
const F = require('../src/browser-facts.js');
const K = require('../src/server/browser-keeper.js');
const S = require('../src/browser-stream.js');
const TR = require('../src/browser-trace.js');
const LIMITS = require('../src/keeper-limits.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } return !!c; };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const REPO = new URL('..', import.meta.url).pathname;

// ── scratch world ──
const ROOT = scratch('browser-ephemeral');
fs.rmSync(ROOT, { recursive: true, force: true });
const fakeHome = scratchHome('browser-ephemeral-home', fs, ['.agent-browser', '.vibespace']);
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const SOCK = path.join(ROOT, 'sock'); fs.mkdirSync(SOCK, { recursive: true });
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}`;

// THE FAKE agent-browser: state per NAMESPACE, its daemon a real `sleep`; every
// launch logs the env it ran under (so the suite can see WHICH pairs a launch
// used); page verbs start the daemon themselves like the real CLI and log the
// namespace they reached; `stream status` answers a port derived from the ns.
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
const launch = (by) => { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, pid: c.pid, by, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: process.env.AGENT_BROWSER_SOCKET_DIR || null, idle: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || null, config: process.env.AGENT_BROWSER_CONFIG || null }) + '\\n'); } return s; };
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); fs.appendFileSync(path.join(st, 'info.log'), JSON.stringify({ ns, socketDir: process.env.AGENT_BROWSER_SOCKET_DIR || null }) + '\\n'); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run') } }); process.exit(0); }
if (a === 'open' && b === 'about:blank') { launch('open'); out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } fs.appendFileSync(path.join(st, 'closes.log'), JSON.stringify({ ns, socketDir: process.env.AGENT_BROWSER_SOCKET_DIR || null }) + '\\n'); out({ success: true, data: { closed } }); process.exit(0); }
if (a === 'stream' && b === 'status') { fs.appendFileSync(path.join(st, 'stream.log'), JSON.stringify({ ns }) + '\\n'); let h = 0; for (const ch of ns) h = (h * 31 + ch.charCodeAt(0)) % 9000; let fixed = 0; try { fixed = Number(fs.readFileSync(path.join(st, 'stream-port-' + ns), 'utf8')) || 0; } catch { } out({ success: true, data: { enabled: true, connected: false, port: fixed || 20000 + h, screencasting: false } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19222/devtools/browser/fake-' + ns } }); process.exit(0); }
if (['open', 'snapshot', 'click', 'fill'].includes(a)) { launch(a); fs.appendFileSync(path.join(st, 'cmds.log'), JSON.stringify({ verb: a, ns, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: process.env.AGENT_BROWSER_SOCKET_DIR || null, config: process.env.AGENT_BROWSER_CONFIG || null, cwd: process.cwd() }) + '\\n'); out({ success: true, data: { ok: true } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const logOf = (name) => { try { return fs.readFileSync(path.join(AB_STATE, name), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const launches = () => logOf('launches.log');
const cmds = () => logOf('cmds.log');
const stateOf = (ns) => { try { return JSON.parse(fs.readFileSync(path.join(AB_STATE, ns + '.json'), 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
let srv = null;
function reapAll() { for (const l of launches()) if (l.pid) { try { process.kill(l.pid, 'SIGKILL'); } catch { /* gone */ } } }
function cleanup() { reapAll(); try { srv?.close(); } catch { /* */ } for (const d of [ROOT, fakeHome]) fs.rmSync(d, { recursive: true, force: true }); }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

const KEY_A = 'bk-0000000a', KEY_F = 'bk-0000000f', KEY_P = 'bk-00000011';
const pairsFor = (key) => [...B.browserEnvFor({ browserKey: key, variant: B.VARIANTS.N, idleMs: 600000 }), `AGENT_BROWSER_SOCKET_DIR=${SOCK}`];

// ═══ ① PURE ═══════════════════════════════════════════════════════════════
console.log('— ① the ephemeral record, the set, the ceiling (PURE)');
{
  const rec = B.newProfileRecord({ id: 'bp-000000e1', label: B.ephemeralLabel('fix the login bug'), dir: null, ephemeral: true, owner: { kind: 'conversation', id: KEY_A }, now: 5 });
  ok(rec.ephemeral === true && rec.owner.kind === 'conversation' && rec.owner.id === KEY_A && rec.sharing === 'owner' && rec.provider === 'chromium' && rec.label === '(ephemeral) fix the login bug' && B.isEphemeralProfile(rec), 'the record: ephemeral:true, owned by the CONVERSATION (its browser key), chromium, sharing owner, labelled "(ephemeral) <session name>"');
  ok(!B.isMediatedProfile({ ...rec, sharing: 'instance' }), 'an ephemeral record is never mediated (it has one conversation)');
  ok(B.isEphemeralProfile(B.newProfileRecord({ id: 'bp-000000e2', ephemeral: true, owner: { id: KEY_A + '.1' } })), 'a CHILD key owns its own record');
  ok(/needs its conversation/.test(String((() => { try { B.newProfileRecord({ id: 'bp-000000e3', ephemeral: true, owner: { id: 'nope' } }); return ''; } catch (e) { return e.message; } })())), 'an ephemeral record without a browser key is refused (the owner is what reaps it)');
  ok(B.ephemeralLabel('') === '(ephemeral) this conversation' && B.ephemeralLabel('a\u0007b') === '(ephemeral) a b', 'the label: a fallback, control characters folded');
  const reg = B.normalizeRegistry({ profiles: [rec, { ...rec, id: 'bp-000000e4', owner: { kind: 'instance', id: null } }, { id: 'bp-00000001', label: 'Work', owner: { kind: 'instance' } }] });
  ok(reg.profiles.map((p) => p.id).join() === 'bp-000000e1,bp-00000001', 'the registry ADMITS a well-shaped ephemeral record and DROPS one claiming `ephemeral` with a foreign owner');
  const work = { id: 'bp-00000001', label: 'Work', dir: '/p' };
  const set = B.attachmentsFor({ leases: [{ profileId: rec.id, browserKey: KEY_A, alias: 'ephemeral', since: 1 }], profiles: [rec, work], browserKey: KEY_A });
  ok(set.attachments.length === 0 && set.handles.length === 0 && B.resolveHandle({ set }).kind === 'none', 'the ephemeral lease is NOT an attachment: no handle, a bare command still resolves `none`');
  const set2 = B.attachmentsFor({ leases: [{ profileId: rec.id, browserKey: KEY_A, alias: 'ephemeral', since: 1 }, { profileId: work.id, browserKey: KEY_A, since: 2 }], profiles: [rec, work], browserKey: KEY_A });
  ok(set2.attachments.length === 1 && B.resolveHandle({ set: set2 }).kind === 'attachment', '…and beside ONE named attachment the set is one — `profile_required` is unaffected by it');
  const live = (id, label, ephemeral = false) => ({ profileId: id, label, state: 'ready', ephemeral });
  const L6 = { CONCURRENT_CAP: 6 };
  const five = [live('bp-00000001', 'Shopping'), live('bp-00000002', 'Work'), live('bp-000000e1', '(ephemeral) session B', true), live('bp-000000e5', '(ephemeral) session C', true), live('bp-000000e6', '(ephemeral) session D', true)];
  ok(B.ceilingVerdict(five, [], L6, { ephemeral: true }) === null, 'five live browsers of six: no refusal');
  const v = B.ceilingVerdict(five, [{ profileId: 'bp-00000001', browserKey: KEY_P }], L6, { ephemeral: true, others: [{ label: 'GIMP', kind: 'desktop-app' }], idleMs: 900000 });
  ok(v && v.code === 'browser_cap' && v.holders.length === 6 && v.holders.some((h) => h.kind === 'desktop-app' && h.label === 'GIMP') && v.holders.filter((h) => h.ephemeral).length === 3, 'five browsers + one desktop app through the seam ⇒ browser_cap with SIX holders (ephemerals counted, the desktop app named by kind)', v);
  ok(/6 browsers are running/.test(v.error) && /shared with desktop apps/.test(v.error) && /Shopping \(bk-00000011\)/.test(v.error) && /\(ephemeral\) session B/.test(v.error) && /GIMP \(desktop-app\)/.test(v.error) && /idles out \(15 min without a command\)/.test(v.error) && /stopped by the user/.test(v.error) && /nothing of yours is queued/.test(v.error) && v.remedy, 'the sentence names every holder and the two ways out (§5.3), with a remedy');
  const named = B.ceilingVerdict(five, [], L6, { others: [{ label: 'GIMP', kind: 'desktop-app' }] });
  ok(named && named.code === 'cap' && /^browser ceiling reached \(6\/6 running/.test(named.error), 'CONTROL: a named profile\'s start keeps its `cap` code and sentence');
  ok(B.ceilingVerdict(five.slice(0, 5), [], L6) === null && B.ceilingVerdict([...five, live('bp-00000009', 'X')], [], L6).code === 'cap', 'CONTROL: no seam, six named/ephemeral live ⇒ `cap` as before');
  const pv = B.ephemeralPairsVerdict(pairsFor(KEY_A), KEY_A);
  ok(pv.ok && pv.pairs.length === 4 && !B.ephemeralPairsVerdict(pairsFor(KEY_F), KEY_A).ok && !B.ephemeralPairsVerdict([], KEY_A).ok && !B.ephemeralPairsVerdict(null, KEY_A).ok, 'the pairs verdict: only pairs naming THIS conversation\'s browser are managed');
  ok(B.ephemeralDirOf(['AGENT_BROWSER_PROFILE=/s/x']) === '/s/x' && B.ephemeralDirOf(pairsFor(KEY_A)) === null, 'the directory: rung C\'s scratch dir, else none');
  const cp = B.childPairsOver(pairsFor(KEY_A), B.childEnvFor({ childKey: KEY_A + '.1', parentVariant: 'C' }));
  ok(cp.includes(`AGENT_BROWSER_SESSION=vs-${KEY_A}.1`) && cp.includes(`AGENT_BROWSER_SOCKET_DIR=${SOCK}`) && !cp.some((x) => x.startsWith('VIBESPACE_BROWSER=')), 'a child\'s pairs = the parent\'s, overridden by the child\'s own');
  ok(TR.sweepScope([rec, { ...work, provider: 'chromium' }]).map((p) => p.id).join() === 'bp-00000001' && TR.housekeepingVerdict({ profiles: [rec, { ...work, provider: 'chromium' }], now: 1 }).length === 1 && TR.forgetVerdict({ profile: rec }).code === 'not_ours', 'housekeeping: the trace sweep never touches an ephemeral dir, its row is not a profile row, it cannot be set aside');
}

// ═══ ② the keeper + routes + CLI ══════════════════════════════════════════
console.log('— ② the real keeper, the routes and the shipped CLI');
const express = require('express');
const R = require('../src/routes/browser.js');
const rtEnv = { PATH: PATH_ENV, HOME: fakeHome, FAKE_AB_STATE: AB_STATE };
const settings = { 'browser.idleTimeoutMs': 600000 };
const notices = [];
let desktopApps = [];
const live = new Set([KEY_A, KEY_F, KEY_P]);
const mkKeeper = (extra = {}) => K.create({ dataDir: DATA, homeDir: fakeHome, env: () => rtEnv, broadcast: null, serverSetting: (k) => settings[k], serverNotice: (key, text) => notices.push({ key, text }), getTelemetry: () => null,
  liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, install: false, otherHolders: () => desktopApps, ...extra });
const k = mkKeeper();
let beCalls = 0;
const spyBrowserEnv = new Proxy({}, { get: () => { beCalls++; return () => { beCalls++; return null; }; } });
const sessions = new Map();
const TOKEN = (n) => 'vsst_' + String(n).repeat(24).slice(0, 24);
const mkSession = (id, key, n, extra = {}) => { const s = { agentToken: TOKEN(n), _browserKey: key, _browserVariant: 'N', _browserEnv: pairsFor(key), name: `session ${id}`, ...extra }; sessions.set(id, s); return s; };
const sessA = mkSession('sess-a', KEY_A, 'a');
mkSession('sess-f', KEY_F, 'f');
const app = express(); app.use(express.json());
R.setup({ keeper: k, activeSessions: sessions, browserEnv: () => { beCalls++; return spyBrowserEnv; }, adoptRoots: { homeDir: fakeHome, dataDir: DATA }, tasksForSession: () => [] });
app.use(R.router);
srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const API = `http://127.0.0.1:${srv.address().port}`;
const post = async (p, body, token) => { const res = await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body || {}) }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
const CLI = path.join(REPO, 'data/bin/vibespace-browser');
const cliEnvFor = (s) => ({ PATH: PATH_ENV, HOME: fakeHome, FAKE_AB_STATE: AB_STATE, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: s.agentToken, ...S.pairsToEnv(s._browserEnv) });
const cli = (args, env) => new Promise((resolve) => execFile(process.execPath, [CLI, ...args], { env, encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
const ephOf = (key) => k._reg().profiles.filter((p) => B.isEphemeralProfile(p) && p.owner.id === key);
const auditLines = () => { try { return fs.readFileSync(k.auditFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
{
  // ─ the first page verb
  let c = await cli(['snapshot'], cliEnvFor(sessA));
  const recs = ephOf(KEY_A);
  const p = recs[0];
  ok(c.status === 0 && recs.length === 1 && p.ephemeral === true && p.label === '(ephemeral) session sess-a' && p.owner.id === KEY_A, 'the FIRST page verb (`vibespace-browser snapshot`) records ONE ephemeral record owned by the conversation', c.stderr);
  const rec = k.browserOf(p.id);
  ok(rec && rec.ns === 'vs-' + KEY_A && k.nsOf(p.id) === 'vs-' + KEY_A && rec.state === 'ready' && rec.ephemeral === true && Number.isInteger(rec.pid) && alive(rec.pid), 'its browser record: ns vs-<browserKey> (P0\'s identity, unchanged), ready, a live daemon pid', rec);
  const leases = k._reg().leases.filter((l) => l.profileId === p.id);
  ok(leases.length === 1 && leases[0].alias === 'ephemeral' && leases[0].browserKey === KEY_A && leases[0].sessionId === 'sess-a', 'ONE lease aliased `ephemeral`');
  ok(k.setFor(KEY_A).attachments.length === 0, '…and it is not an attachment (no handle)');
  const L = launches();
  ok(L.length === 1 && L[0].by === 'open' && L[0].ns === 'vs-' + KEY_A && L[0].session === 'vs-' + KEY_A && L[0].socketDir === SOCK && L[0].idle === '600000', 'the KEEPER launched it (open about:blank) under the session\'s EXACT pairs — its socket dir included — with the idle setting', L);
  ok(beCalls === 0, 'the browser-env resolver was never asked (no re-run of the ladder)', beCalls);
  const cm = cmds();
  ok(cm.length === 1 && cm[0].verb === 'snapshot' && cm[0].ns === 'vs-' + KEY_A && cm[0].socketDir === SOCK, 'the command itself ran on that browser');
  ok(/^profile: \(ephemeral\) this conversation's browser$/m.test(c.stderr), 'the CLI names the browser it acted on');
  const au = auditLines();
  ok(au.length === 1 && au[0].verb === 'snapshot' && au[0].profileId === p.id && au[0].browserKey === KEY_A && au[0].sessionId === 'sess-a', 'ONE audit line, naming the ephemeral record', au);
  // ─ the route's answer
  const r = await post('/api/agent/browser/resolve', { argv: ['click', '@e1'], wrapper: true }, sessA.agentToken);
  ok(r.status === 200 && r.json.kind === 'ephemeral' && JSON.stringify(r.json.env) === JSON.stringify(sessA._browserEnv) && r.json.profile.id === p.id && r.json.profile.ephemeral === true && r.json.created === false && !('cdpUrl' in r.json), '/resolve answers kind:\'ephemeral\' with the session\'s exact pairs and the record (no CDP url)', r.json);
  ok(JSON.stringify(r.json.spawnEnv) === JSON.stringify(sessA._browserEnv) && !('hostProfile' in r.json), 'r1: /resolve hands back the session\'s OWN spawn pairs as `spawnEnv` (what the CLI builds its child env on — it drops every AGENT_BROWSER_* key of its shell)', r.json);
  ok(ephOf(KEY_A).length === 1 && launches().length === 1 && beCalls === 0, 'a second verb REUSES it: one record, still one launch');
  // ─ r2 (takeover finding 2): the SOCKET ROOT is identity — the answer names the keeper's own
  ok(r.json.socketDir === SOCK && r.json.runtimeDir === null && k.socketRootOf(sessA._browserEnv).via === 'AGENT_BROWSER_SOCKET_DIR', 'r2: /resolve names the root the keeper launched this browser under (`socketDir` = the spawn pair\'s dir) and its runtime dir (none here)', r.json);
  // ─ profiles omits it, status names it
  c = await cli(['profiles'], cliEnvFor(sessA));
  ok(c.status === 0 && !/ephemeral/.test(c.stdout) && /no browser profiles yet/.test(c.stdout), '`profiles` omits it (not attachable)', c.stdout);
  c = await cli(['status'], cliEnvFor(sessA));
  ok(c.status === 0 && /browses its own managed browser \(ephemeral: ready, started \d+s ago, pid \d+\)/.test(c.stdout), '`status` names it: its own managed browser, its state and when it started', c.stdout);
  ok(k.list().profiles.every((x) => !x.ephemeral) && k.list().ephemerals.length === 1 && k.list().cap.used >= 1, 'the digest lists it under `ephemerals`, never as a profile; the ceiling counts it');
  // ─ the live view's port: the SAME as the legacy ephemeral path
  const target = S.streamTargetFor({ browserKey: KEY_A, set: k.setFor(KEY_A), envPairs: sessA._browserEnv, profiles: k.list().profiles });
  const legacy = await F.createBrowserRuntime({ env: rtEnv }).streamPort(null, { extraEnv: S.pairsToEnv(sessA._browserEnv) });
  const fresh = K.create({ dataDir: path.join(ROOT, 'data-legacy'), homeDir: fakeHome, env: () => rtEnv, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { } }, install: false });
  const managedPort = await k.streamPortFor(target), legacyPort = await fresh.streamPortFor(target);
  ok(target.ok && target.kind === 'ephemeral' && managedPort.ok && managedPort.port === legacy.port && legacyPort.port === managedPort.port, `PARITY: the live view of the managed ephemeral browser bridges the same port as the legacy ephemeral path (${managedPort.port})`, { target, managedPort, legacy });
  // ─ the takeover pauses its verbs (the `<bk>|ephemeral` key, unchanged)
  k.takeover({ browserKey: KEY_A, profileId: null, viewerId: 'v1', sessionId: 'sess-a' });
  c = await cli(['click', '@e1'], cliEnvFor(sessA));
  ok(c.status === 1 && /\[browser_paused\]/.test(c.stderr) && cmds().length === 1, 'while the user drives, a verb is refused browser_paused and did not run', c.stderr);
  k.handback({ browserKey: KEY_A, profileId: null, viewerId: 'v1', cause: 'explicit' });
  c = await cli(['click', '@e1'], cliEnvFor(sessA));
  ok(c.status === 0 && cmds().length === 2, '…handed back, it runs');
  // ─ an idle-out: the daemon's pid gone ⇒ stopped (not an error), the next verb relaunches
  const pid0 = k.browserOf(p.id).pid;
  process.kill(pid0, 'SIGKILL');
  for (let i = 0; i < 40 && alive(pid0); i++) await new Promise((res) => setTimeout(res, 25));
  await k.tick();
  const r0 = k.browserOf(p.id);
  ok(r0.state === 'stopped' && r0.stoppedBy === 'idle' && r0.lastError === null && /idled out/.test(r0.note || ''), 'the daemon gone ⇒ the tick records `stopped` (idle), no error', r0);
  ok(k._reg().leases.some((l) => l.profileId === p.id), '…and the lease stays (an idle-out is not a conversation end)');
  c = await cli(['snapshot'], cliEnvFor(sessA));
  const r1 = k.browserOf(p.id);
  ok(c.status === 0 && r1.state === 'ready' && r1.pid !== pid0 && launches().length === 2 && launches()[1].by === 'open', 'the next verb RELAUNCHES it through the keeper (a new daemon)', launches());
  // ─ a fork key ⇒ its own record
  c = await cli(['snapshot'], cliEnvFor(sessions.get('sess-f')));
  ok(c.status === 0 && ephOf(KEY_F).length === 1 && ephOf(KEY_F)[0].id !== p.id && ephOf(KEY_A).length === 1, 'a FORK (a new browser key) gets a NEW record, never its parent\'s');
  // ─ a child handle ⇒ its own record, reaped with the parent
  c = await cli(['new-child'], cliEnvFor(sessA));
  const child = (c.stdout.match(/VIBESPACE_BROWSER=(\S+)/) || [])[1];
  c = await cli(['snapshot'], { ...cliEnvFor(sessA), VIBESPACE_BROWSER: child });
  const kid = ephOf(child)[0];
  ok(c.status === 0 && child === KEY_A + '.1' && kid && k.browserOf(kid.id).ns === 'vs-' + child && launches().some((l) => l.ns === 'vs-' + child && l.socketDir === SOCK), 'a CHILD handle\'s first verb records its OWN ephemeral browser (ns vs-<child key>, the parent\'s socket dir kept)', c.stderr);
  const rch = await post('/api/agent/browser/resolve', { handle: child, argv: ['snapshot'] }, sessA.agentToken);
  ok(rch.status === 200 && rch.json.kind === 'child' && rch.json.socketDir === SOCK, 'r2: a child handle\'s answer names the root its pairs launched it under (the parent\'s dir)', rch.json);
  // ─ a named profile of the same conversation (the control for the reap)
  const named = k.createProfile({ label: 'Keep me' }, { owner: { kind: 'session', id: KEY_A } });
  await k.attach({ profileId: named.id, browserKey: KEY_A, sessionId: 'sess-a' });
  let rat = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, sessA.agentToken);
  if (rat.json && rat.json.code === 'profile_changed') rat = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, sessA.agentToken); // the set changed under the agent: refused ONCE
  ok(rat.status === 200 && rat.json.kind === 'attachment' && rat.json.socketDir === path.join(fakeHome, '.agent-browser') && rat.json.runtimeDir === null, 'r2: an ATTACHMENT names the keeper\'s own default root (its runtime\'s HOME here) — never the session\'s spawn SOCKET_DIR, which the keeper did not launch it under', { kind: rat.json.kind, socketDir: rat.json.socketDir, spawnEnv: rat.json.spawnEnv });
  // ─ conversation death ⇒ lease dropped ⇒ stop ⇒ record removed
  const parentPid = k.browserOf(p.id).pid, childPid = k.browserOf(kid.id).pid;
  live.delete(KEY_A);
  const rr = k.reconcile({ graceMs: 0 });
  await rr.retired;
  ok(rr.dropped.some((d) => d.lease.profileId === p.id) && rr.retiring.includes(p.id) && rr.retiring.includes(kid.id), 'the conversation gone: its ephemeral leases (the child\'s too) are dropped and both records retired', rr.retiring);
  ok(!k.profile(p.id) && !k.profile(kid.id) && !k.browserOf(p.id) && ephOf(KEY_A).length === 0 && ephOf(child).length === 0, '…the RECORDS ARE REMOVED by themselves');
  ok(!alive(parentPid) && !alive(childPid) && logOf('closes.log').some((x) => x.ns === 'vs-' + KEY_A && x.socketDir === SOCK), '…after the browsers were stopped under their own pairs (close --all with the socket dir)');
  ok(!!k.profile(named.id) && ephOf(KEY_F).length === 1, 'CONTROL: the named profile of the same conversation is NEVER auto-removed; the fork\'s record stays');
  // ─ resume ⇒ the same record
  const fid = ephOf(KEY_F)[0].id;
  mkSession('sess-f2', KEY_F, 'g');
  c = await cli(['snapshot'], cliEnvFor(sessions.get('sess-f2')));
  ok(c.status === 0 && ephOf(KEY_F).length === 1 && ephOf(KEY_F)[0].id === fid && k._reg().leases.find((l) => l.profileId === fid).sessionId === 'sess-f2', 'a RESUME (same key, new session) lands on the SAME record, its lease re-carried');
  // ─ r2 (takeover finding 2, harness A's shape): a conversation whose spawn pairs carry NO socket dir
  // (the common case — a short XDG root) and an agent that exports its own socket root: the shipped CLI
  // lands under the KEEPER's root; the r1 table (patched copy) is the control that drives the decoy
  {
    const KEY_X = 'bk-000000b1';
    live.add(KEY_X);
    const sx = mkSession('sess-x', KEY_X, 'x', { _browserEnv: B.browserEnvFor({ browserKey: KEY_X, variant: B.VARIANTS.N, idleMs: 600000 }) });
    const DECOY = path.join(ROOT, 'mine'), DECOY_XDG = path.join(ROOT, 'mine-xdg');
    const KROOT = path.join(fakeHome, '.agent-browser');
    const decoyEnv = { ...cliEnvFor(sx), AGENT_BROWSER_SOCKET_DIR: DECOY, XDG_RUNTIME_DIR: DECOY_XDG };
    const rx = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, sx.agentToken);
    const lx = launches().filter((l) => l.ns === 'vs-' + KEY_X);
    ok(rx.status === 200 && rx.json.kind === 'ephemeral' && rx.json.socketDir === KROOT && lx.length === 1 && lx[0].socketDir === null, 'r2: the keeper launched it with no SOCKET_DIR (the root its runtime derives: $HOME/.agent-browser here) and /resolve names exactly that root', { json: rx.json, lx });
    let cx = await cli(['click', '@e1'], decoyEnv);
    let last = cmds().filter((x) => x.ns === 'vs-' + KEY_X).pop();
    ok(cx.status === 0 && last && last.socketDir === KROOT, 'r2: `export AGENT_BROWSER_SOCKET_DIR=<mine>` (+ XDG_RUNTIME_DIR) — the shipped CLI still lands under the KEEPER\'s root', { st: cx.status, last, err: cx.stderr.slice(0, 300) });
    ok(/\[env_twin_dropped\]/.test(cx.stderr) && /AGENT_BROWSER_SOCKET_DIR/.test(cx.stderr) && /XDG_RUNTIME_DIR/.test(cx.stderr), 'r2: …and says, by name, that the shell\'s socket root was not used', cx.stderr);
    const vsrc = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
    const r1v = vsrc.replace("'AGENT_BROWSER_DEFAULT_TIMEOUT']);", "'AGENT_BROWSER_DEFAULT_TIMEOUT', 'AGENT_BROWSER_SOCKET_DIR']);").replace('if (absPath(a.socketDir)) {', 'if (false) {');
    const D2 = path.join(ROOT, 'r1-cli'); fs.mkdirSync(D2, { recursive: true });
    fs.copyFileSync(CLI, path.join(D2, 'vibespace-browser')); fs.writeFileSync(path.join(D2, 'vibespace-browser-verbs.js'), r1v);
    const ctl = await new Promise((resolve) => execFile(process.execPath, [path.join(D2, 'vibespace-browser'), 'click', '@e1'], { env: decoyEnv, encoding: 'utf8', timeout: 30000 }, (err, so, se) => resolve({ status: err ? err.code : 0, stderr: String(se || '') })));
    last = cmds().filter((x) => x.ns === 'vs-' + KEY_X).pop();
    ok(r1v !== vsrc && ctl.status === 0 && last && last.socketDir === DECOY, 'r2 CONTROL: the r1 table (patched copy) drives the agent\'s decoy root — a daemon the keeper never launched, streams or counts', { st: ctl.status, last, err: ctl.stderr.slice(0, 200) });
    for (const e of ephOf(KEY_X)) await k.stop(e.id).catch(() => { });
    live.delete(KEY_X);
  }
  // ─ r3 (takeover finding 2): THE CONFIG IS NAMED, NEVER SEARCHED. A rung-N conversation (its pairs carry no
  // config) with a user file that names a raw debugging port, and an agent standing in a directory whose
  // agent-browser.json sets launch keys: the keeper launches it with ITS file, /resolve names that same file,
  // and the command runs with it — the binary never searches either directory
  {
    const KEY_Y = 'bk-000000b2';
    live.add(KEY_Y);
    const UCFG = path.join(fakeHome, '.agent-browser', 'config.json');
    fs.writeFileSync(UCFG, JSON.stringify({ args: '--no-sandbox,--remote-debugging-port=41999', proxy: 'http://127.0.0.1:3128', profile: '/home/u/.agent-browser/default-profile', cdp: '9222', allowedDomains: ['example.com'] }));
    const DIRTY = path.join(ROOT, 'dirty'); fs.mkdirSync(DIRTY, { recursive: true });
    fs.writeFileSync(path.join(DIRTY, 'agent-browser.json'), JSON.stringify({ args: '--remote-debugging-port=42945', executablePath: '/x/dumpchrome', userAgent: 'R3-UA-LAYERED' }));
    const sy = mkSession('sess-y', KEY_Y, 'y', { _browserEnv: B.browserEnvFor({ browserKey: KEY_Y, variant: B.VARIANTS.N, idleMs: 600000 }) });
    // r4 (MAJOR 2): the keeper's file for a browser IT launches carries that browser's launch MARK — one file per mark
    // (`machine-ephemeral-<key>.json` / `machine-<profile id>.json`); a lease's own session never launches: machine.json
    const EPH_CFG = path.join(DATA, 'browser-env', `machine-ephemeral-${KEY_Y}.json`), MACH_CFG = path.join(DATA, 'browser-env', 'machine.json');
    const cy = await new Promise((resolve) => execFile(process.execPath, [CLI, 'snapshot'], { env: cliEnvFor(sy), cwd: DIRTY, encoding: 'utf8', timeout: 30000 }, (err, so, se) => resolve({ status: err ? err.code : 0, stderr: String(se || '') })));
    const ly = launches().filter((l) => l.ns === 'vs-' + KEY_Y);
    const my = cmds().filter((x) => x.ns === 'vs-' + KEY_Y).pop();
    ok(cy.status === 0 && ly.length === 1 && ly[0].config === EPH_CFG && my && my.config === EPH_CFG && my.cwd !== DIRTY && /\/vibespace-browser-cwd-\d+$/.test(my.cwd), 'r3/r4: the keeper launched the rung-N browser with ITS config file (machine-ephemeral-<key>.json, marked) and the command typed from the dirty directory ran with the SAME file — named, never searched (lane L r5: and the binary runs in the private daemon directory, never the agent\'s)', { st: cy.status, ly, my, err: cy.stderr.slice(0, 300) });
    const ry = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, sy.agentToken);
    ok(ry.status === 200 && ry.json.kind === 'ephemeral' && ry.json.config === EPH_CFG, 'r3: /resolve names that file (`config`) — the one the keeper launched with', ry.json);
    const ec = (() => { try { return JSON.parse(fs.readFileSync(EPH_CFG, 'utf8')); } catch { return {}; } })(); // a pre-r4 tree goes RED here, never crashes
    ok(ec.args === '--no-sandbox,' + B.keeperMarkArg(KEY_Y) && ec.proxy === 'http://127.0.0.1:3128' && JSON.stringify(ec.allowedDomains) === '["example.com"]' && !('profile' in ec) && !('cdp' in ec) && ((() => { try { return fs.statSync(EPH_CFG).mode; } catch { return 0; } })() & 0o777) === 0o600,
      'r3/r4: its content is the user file by the one rule — the machine\'s own args / proxy / fence carried, the raw debugging port, `cdp` and the ephemeral-denied `profile` gone, THIS conversation\'s launch mark appended; 0600', ec);
    ok(!/42945|dumpchrome|R3-UA-LAYERED/.test(JSON.stringify(ec)), 'r3: nothing of the agent directory\'s agent-browser.json reached it');
    // an attachment: the profile browser's file (the machine's own `profile` stays — AGENT_BROWSER_PROFILE names the dir anyway;
    // the fence goes first: a persistent profile is refused under one, §6.3)
    fs.writeFileSync(UCFG, JSON.stringify({ args: '--no-sandbox,--remote-debugging-port=41999', proxy: 'http://127.0.0.1:3128', profile: '/home/u/.agent-browser/default-profile', cdp: '9222' }));
    const nY = k.createProfile({ label: 'R3 named' }, { owner: { kind: 'session', id: KEY_Y } });
    await k.attach({ profileId: nY.id, browserKey: KEY_Y, sessionId: 'sess-y' });
    let ra = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, sy.agentToken);
    if (ra.json && ra.json.code === 'profile_changed') ra = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, sy.agentToken);
    const mc = JSON.parse(fs.readFileSync(MACH_CFG, 'utf8'));
    const PROF_CFG = path.join(DATA, 'browser-env', `machine-${nY.id}.json`);
    const pc = (() => { try { return JSON.parse(fs.readFileSync(PROF_CFG, 'utf8')); } catch { return {}; } })();
    ok(ra.status === 200 && ra.json.kind === 'attachment' && ra.json.config === MACH_CFG && mc.args === '--no-sandbox' && !('cdp' in mc) && mc.profile === '/home/u/.agent-browser/default-profile' && launches().some((l) => l.ns === B.sessionNameFor(nY.id) && l.config === PROF_CFG) && pc.args === '--no-sandbox,' + B.keeperMarkArg(nY.id) && pc.proxy === mc.proxy,
      'r3/r4: an ATTACHMENT names the keeper\'s machine.json (its lease session never launches: raw debugging port and `cdp` gone, the machine\'s own keys kept); the profile browser itself was launched with machine-<id>.json — the same rule plus ITS launch mark', { json: ra.json && { kind: ra.json.kind, config: ra.json.config }, mc, pc, l: launches().filter((l) => l.ns === B.sessionNameFor(nY.id)) });
    // a user file that does not parse: the keeper's calls keep the CLI's own search (the CLI would refuse it too) — said, not silent
    fs.writeFileSync(UCFG, '{ torn');
    const warned = [];
    const kb = mkKeeper({ dataDir: path.join(ROOT, 'data-torn'), log: { log() { }, warn: (x) => warned.push(String(x)), error() { } } });
    ok(kb.machineConfigFile('machine') === null && warned.some((w) => /does not parse/.test(w)), 'r3: a user file that does not parse names no file (the binary would refuse it too) and the journal says so', warned);
    kb.shutdown();
    // r4 (takeover finding 7): the keeper names its file only while it is its OWN — a regular file of this uid with the
    // content it wrote. A symlink swapped in at data/browser-env/machine.json is REPLACED (never followed), an edit re-written
    {
      fs.writeFileSync(UCFG, JSON.stringify({ args: '--no-sandbox' }));
      const AGENTF = path.join(ROOT, 'agent-own-config.json');
      fs.writeFileSync(AGENTF, JSON.stringify({ executablePath: '/x/dumpchrome', args: '--remote-debugging-port=41999' }));
      const swap = (f) => { fs.rmSync(f, { force: true }); fs.symlinkSync(AGENTF, f); };
      const kl = mkKeeper({ dataDir: path.join(ROOT, 'data-link') });
      const f1 = kl.machineConfigFile('machine');
      swap(f1);
      const f2 = kl.machineConfigFile('machine');
      const st2 = f2 ? fs.lstatSync(f2) : null;
      ok(f1 && f2 === f1 && st2 && st2.isFile() && !st2.isSymbolicLink() && !/dumpchrome|41999/.test(fs.readFileSync(f2, 'utf8')) && /dumpchrome/.test(fs.readFileSync(AGENTF, 'utf8')), 'r4: a symlink swapped in for the keeper\'s machine.json is REPLACED by a regular file with the keeper\'s content (never followed); the linked file is untouched', { f1, f2, link: st2 && st2.isSymbolicLink() });
      fs.writeFileSync(f2, JSON.stringify({ executablePath: '/x/dumpchrome' }));
      kl.machineConfigFile('machine');
      ok(!/dumpchrome/.test(fs.readFileSync(f2, 'utf8')), 'r4: …and an EDIT to it is re-written at the next call');
      kl.shutdown();
      // NEGATIVE CONTROL: the r3 memo check (`fs.existsSync`, which follows the link) keeps naming the swapped-in link
      const lsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
      const lpre = lsrc.replace('if (memo === text && own()) return file;', 'if (memo === text && fs.existsSync(file)) return file;');
      const { createRequire: crl } = await import('node:module');
      const lreq = crl(path.join(REPO, 'src/server/browser-keeper.js'));
      const lm = { exports: {} }; new Function('module', 'exports', 'require', '__dirname', '__filename', lpre)(lm, lm.exports, lreq, path.join(REPO, 'src/server'), path.join(REPO, 'src/server/browser-keeper.js'));
      const kc = lm.exports.create({ dataDir: path.join(ROOT, 'data-link-pre'), homeDir: fakeHome, env: () => rtEnv, serverSetting: (x) => settings[x], liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, install: false });
      const c1 = kc.machineConfigFile('machine');
      swap(c1);
      const c2 = kc.machineConfigFile('machine');
      ok(lpre !== lsrc && c2 === c1 && fs.lstatSync(c2).isSymbolicLink() && /dumpchrome/.test(fs.readFileSync(c2, 'utf8')), 'r4 NEGATIVE CONTROL: the r3 memo check (patched copy) keeps naming the swapped-in link — the binary would read the agent\'s file');
      kc.shutdown();
    }
    // NEGATIVE CONTROL: the keeper without the r3 wrapper (a patched copy loaded from the real path) launches with NO config — the search the finding is about
    fs.writeFileSync(UCFG, JSON.stringify({ args: '--no-sandbox' }));
    const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const kpre = ksrc.replace('const rt = configured(runtime || F.createBrowserRuntime({ env: rtEnv, log }));', 'const rt = runtime || F.createBrowserRuntime({ env: rtEnv, log });');
    const { createRequire: cr } = await import('node:module');
    const kreq = cr(path.join(REPO, 'src/server/browser-keeper.js'));
    const km = { exports: {} }; new Function('module', 'exports', 'require', '__dirname', '__filename', kpre)(km, km.exports, kreq, path.join(REPO, 'src/server'), path.join(REPO, 'src/server/browser-keeper.js'));
    const KEY_Z = 'bk-000000b3'; live.add(KEY_Z);
    const kz = km.exports.create({ dataDir: path.join(ROOT, 'data-pre'), homeDir: fakeHome, env: () => rtEnv, serverSetting: (x) => settings[x], liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, install: false });
    await kz.ensureEphemeral({ browserKey: KEY_Z, sessionId: 'sess-z', envPairs: B.browserEnvFor({ browserKey: KEY_Z, variant: B.VARIANTS.N, idleMs: 600000 }), sessionName: 'z', variant: 'N' });
    const lz = launches().filter((l) => l.ns === 'vs-' + KEY_Z);
    ok(kpre !== ksrc && lz.length === 1 && lz[0].config === null, 'r3 NEGATIVE CONTROL: the pre-r3 keeper (patched copy) launches a rung-N browser with NO config — the binary would search this process\'s directory and the user file', lz);
    for (const e of kz.ephemerals()) await kz.stop(e.profileId).catch(() => { });
    kz.shutdown();
    await k.stop(nY.id).catch(() => { });
    for (const e of ephOf(KEY_Y)) await k.stop(e.id).catch(() => { });
    fs.rmSync(UCFG, { force: true });
    live.delete(KEY_Y); live.delete(KEY_Z);
  }
  // ─ the ceiling: six holders ⇒ the seventh conversation's first verb is refused browser_cap
  live.add(KEY_A);
  const n1 = k.createProfile({ label: 'Shopping' }, { owner: { kind: 'instance', id: null } });
  await k.attach({ profileId: n1.id, browserKey: KEY_P, sessionId: 'sess-p' });
  await k.start(named.id);
  const more = ['bk-000000c1', 'bk-000000c2'];
  for (const [i, key] of more.entries()) { live.add(key); const s = mkSession('sess-c' + i, key, String(i + 1)); const cc = await cli(['snapshot'], cliEnvFor(s)); ok(cc.status === 0, `holder ${key} started`, cc.stderr); }
  desktopApps = [{ id: 'da-1', label: 'GIMP', kind: 'desktop-app' }];
  const running = Object.values(k._reg().browsers).filter(B.isLiveBrowser).length;
  ok(running === 5 && k.list().cap.used === 6, `five live browsers (two named, three ephemeral) + one desktop app = six (${running} + ${desktopApps.length})`);
  live.add('bk-000000c7');
  const s7 = mkSession('sess-7', 'bk-000000c7', '7');
  const before = launches().length;
  const r7 = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, s7.agentToken);
  ok(r7.status === 409 && r7.json.code === 'browser_cap' && r7.json.holders.length === 6 && r7.json.holders.some((h) => h.kind === 'desktop-app') && /nothing of yours is queued/.test(r7.json.error) && r7.json.remedy && launches().length === before, 'the SEVENTH conversation\'s first verb ⇒ 409 browser_cap naming all six holders and the way out — nothing launched', r7.json);
  c = await cli(['snapshot'], cliEnvFor(s7));
  ok(c.status === 1 && /\[browser_cap\]/.test(c.stderr) && /holder: GIMP \[desktop-app\]/.test(c.stderr) && /holder: \(ephemeral\) session sess-c0/.test(c.stderr) && /remedy: /.test(c.stderr), 'the CLI prints the code, every holder and the remedy', c.stderr);
  const n3 = k.createProfile({ label: 'Third' }, { owner: { kind: 'instance', id: null } });
  const capNamed = await threw(() => k.attach({ profileId: n3.id, browserKey: KEY_P, sessionId: 'sess-p' }));
  ok(capNamed && capNamed.code === 'cap' && /browser ceiling reached \(6\/6 running/.test(capNamed.message), 'CONTROL: a named profile\'s attach at the ceiling keeps its `cap` code and sentence', capNamed && capNamed.message);
  desktopApps = [];
  const r7b = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, s7.agentToken);
  ok(r7b.status === 200 && r7b.json.kind === 'ephemeral', 'one holder fewer (the desktop app closed) ⇒ the same verb starts it');
  // ─ the routes refuse an ephemeral record by id
  const e7 = r7b.json.profile.id;
  const at = await post('/api/agent/browser/use', { profile: e7 }, s7.agentToken);
  ok(at.status === 404 || at.json.code === 'not_attachable' || at.json.code === 'not-found', '`use <ephemeral id>` is refused (never attached by id)', at.json);
  ok((await threw(() => k.attach({ profileId: e7, browserKey: 'bk-000000c7' }))).code === 'not_attachable' && (await threw(() => k.updateProfile(e7, { label: 'x' }))).code === 'not_editable', 'the keeper refuses attach / edit of an ephemeral record by name');
  // ─ a shared-rung session stays unmanaged (D7), and a remote one (D8)
  const sh = mkSession('sess-sh', 'bk-000000d7', 'h', { _browserVariant: 'none', _browserEnv: null });
  live.add('bk-000000d7');
  const rs = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, sh.agentToken);
  ok(rs.status === 200 && rs.json.kind === 'none' && rs.json.shared === true && ephOf('bk-000000d7').length === 0, 'the SHARED rung stays unmanaged (kind none, shared) — D7');
  ok(Array.isArray(rs.json.spawnEnv) && rs.json.spawnEnv.length === 0, 'r1: …and its `spawnEnv` is EMPTY (rung none emitted nothing, so every AGENT_BROWSER_* key in that shell is the agent\'s)', rs.json);
  ok(rs.json.socketDir === path.join(fakeHome, '.agent-browser') && 'runtimeDir' in rs.json, 'r2: …and names the machine\'s root too (the shared browser lives there, not under a shell export)', rs.json);
  const rm = mkSession('sess-rm', 'bk-000000d8', 'r', { _browserVariant: 'H', host: 'lab-1' });
  live.add('bk-000000d8');
  const rr8 = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, rm.agentToken);
  ok(rr8.status === 200 && rr8.json.kind === 'none' && rr8.json.shared === false && ephOf('bk-000000d8').length === 0, 'a REMOTE session (rung H) stays unmanaged — D8');
  ok(JSON.stringify(rr8.json.spawnEnv) === JSON.stringify(rm._browserEnv) && rr8.json.hostProfile === 'vs-bk-000000d8', 'r1: …carrying its own spawn pairs and the session name whose host-side scratch dir the prelude may have exported (`hostProfile`)', rr8.json);
  ok(rr8.json.hostSocketBase === B.SOCKET_DIR_BASE && !('socketDir' in rr8.json) && !('runtimeDir' in rr8.json), 'r2: rung H names only the BASE of the short socket dir its prelude may export (no keeper root: nothing of ours runs there)', rr8.json);
  ok(!('config' in rr8.json) && typeof rs.json.config === 'string' && rs.json.config.endsWith('/browser-env/machine.json'), 'r3: rung H names no config file (none of ours is on that machine — its CLI composes one there by the same rule); the SHARED rung names the keeper\'s machine.json', { h: rr8.json.config, shared: rs.json.config });
  const old9 = mkSession('sess-old', 'bk-000000d9', 'o', { _browserEnv: null });
  live.add('bk-000000d9');
  const ro9 = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, old9.agentToken);
  ok(ro9.status === 200 && !('spawnEnv' in ro9.json), 'r1: an isolated-rung session with NO recorded pairs (it predates the record) answers no `spawnEnv` — the CLI keeps its identity pairs rather than drop them', ro9.json);
  // ─ the housekeeping view's rows
  const eps = k.ephemerals();
  ok(eps.length >= 3 && eps.every((e) => e.profileId && e.browserKey && typeof e.state === 'string') && eps.some((e) => e.live && e.pid), 'the keeper\'s ephemeral rows carry the record, the conversation and the state (the panel\'s section)');
  await k.stop(n1.id).catch(() => { }); await k.stop(named.id).catch(() => { });
  for (const e of k.ephemerals()) await k.stop(e.profileId).catch(() => { });
  k.shutdown(); fresh.shutdown();
}

// ═══ ③ runaway + restart adoption ═════════════════════════════════════════
console.log('— ③ an over-threshold sample is reported (never a stop); a restart adopts a live one and records a gone one stopped');
{
  const D3 = path.join(ROOT, 'data3'); fs.mkdirSync(D3, { recursive: true });
  const live3 = new Set(['bk-000000e1', 'bk-000000e2', 'bk-000000e3']);
  const mk3 = (extra = {}) => K.create({ dataDir: D3, homeDir: fakeHome, env: () => rtEnv, serverSetting: (k2) => settings[k2], serverNotice: (key, text) => notices.push({ key, text }), liveKeys: () => live3, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, install: false, guardSampleMs: 1, ...extra });
  const k3 = mk3();
  const e1 = await k3.ensureEphemeral({ browserKey: 'bk-000000e1', sessionId: 's1', envPairs: pairsFor('bk-000000e1'), sessionName: 'runner' });
  ok(e1.created && e1.browser.state === 'ready', 'an ephemeral browser started through ensureEphemeral');
  const realTree = F.treeUsage;
  const pid1 = e1.browser.pid;
  F.treeUsage = async (pid) => ({ memBytes: 8 * 2 ** 30, memMetric: 'pss', rssBytes: 20 * 2 ** 30, cpuTicks: 0, pids: [pid] });
  try { await k3.tick(); } finally { F.treeUsage = realTree; }
  await new Promise((res) => setTimeout(res, 300));
  const rb = k3.browserOf(e1.profile.id);
  const rn = notices.filter((n) => n.key.startsWith('browser-resource:' + e1.profile.id + ':'));
  ok(rb.state === 'ready' && alive(pid1) && !/runaway/.test(rb.lastError || '') && !('runawayParkedUntil' in k3._reg()), 'NO KILL: an 8 GB (PSS) sample leaves the ephemeral browser RUNNING — nothing parked, nothing on the record', rb);
  ok(rn.length === 1 && /^The agent browser of "[^"]+" is using 8\.0 GB \(PSS\) — Stop it from the Browser panel if that is not what you expect$/.test(rn[0].text) && k3.usageOf(e1.profile.id)?.memMetric === 'pss' && /memory \(PSS\) 8\.0 GB/.test(k3.usageOf(e1.profile.id)?.over || '') && k3.ephemerals().find((x) => x.profileId === e1.profile.id)?.usage?.over === k3.usageOf(e1.profile.id).over, 'ONE notice names the conversation\'s browser and the reading by its metric; the live row carries `over` — exactly like a named profile', { rn, live: k3.usageOf(e1.profile.id) });
  const served = await k3.ensureEphemeral({ browserKey: 'bk-000000e1', sessionId: 's1', envPairs: pairsFor('bk-000000e1') });
  ok(served && served.browser.state === 'ready' && served.browser.pid === pid1, '…and its next verb is SERVED by the same browser (a past sample never refuses a verb)', served && served.browser);
  // restart adoption
  const e2 = await k3.ensureEphemeral({ browserKey: 'bk-000000e2', sessionId: 's2', envPairs: pairsFor('bk-000000e2') });
  const e3 = await k3.ensureEphemeral({ browserKey: 'bk-000000e3', sessionId: 's3', envPairs: pairsFor('bk-000000e3') });
  const pid3 = k3.browserOf(e3.profile.id).pid;
  k3.shutdown();
  process.kill(pid3, 'SIGKILL');
  for (let i = 0; i < 40 && alive(pid3); i++) await new Promise((res) => setTimeout(res, 25));
  const infoBefore = logOf('info.log').length;
  const k4 = mk3();
  await k4.boot();
  const a2 = k4.browserOf(e2.profile.id), a3 = k4.browserOf(e3.profile.id);
  ok(a2.state === 'ready' && a2.adoptedAt && a2.pid === k3.browserOf(e2.profile.id).pid, 'after a RESTART the live ephemeral daemon is ADOPTED (same pid)', a2);
  ok(logOf('info.log').slice(infoBefore).some((x) => x.ns === 'vs-bk-000000e2' && x.socketDir === SOCK), '…asked under its recorded pairs (the socket dir included)');
  ok(a3.state === 'stopped' && /exited/.test(a3.lastError || ''), 'a gone one is recorded stopped', a3);
  const again = await k4.ensureEphemeral({ browserKey: 'bk-000000e2', sessionId: 's2b', envPairs: pairsFor('bk-000000e2') });
  ok(!again.created && again.profile.id === e2.profile.id && again.browser.pid === a2.pid, 'the resumed conversation\'s next verb lands on the adopted daemon (no relaunch)');
  for (const e of k4.ephemerals()) await k4.stop(e.profileId).catch(() => { });
  k4.shutdown();
}

// ═══ ④ lane H: the ephemeral browser is a first-class holder ═════════════════
console.log('— ④ lane H: the managed ephemeral browser is a holder row, its events hold the verb, the recorder traces it with no viewer');
{
  const TRC = require('../src/server/browser-trace.js');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const KEY_H = 'bk-0000a11c';
  live.add(KEY_H);
  const sh = mkSession('sess-h', KEY_H, 'u', { name: 'hold me' });
  const eph = () => ephOf(KEY_H)[0] || null;
  const nsH = 'vs-' + KEY_H;
  const cmdsH = () => cmds().filter((c) => c.ns === nsH);
  // the lease seam as the recorder sees it: every event, and a listener that HOLDS the ready one for 300 ms
  const evs = []; const heldAt = [];
  const unsub = k.onLease((ev) => {
    if (!ev || (ev.browserKey !== KEY_H && !(ev.profileId && eph() && ev.profileId === eph().id))) return null;
    evs.push({ ...ev, cmdsAt: cmdsH().length });
    if (ev.kind === 'browser-ready' && ev.ephemeral) return sleep(300).then(() => { heldAt.push(cmdsH().length); });
    return null;
  });
  const t0 = Date.now();
  let c = await cli(['open', 'https://example.com/lane-h'], cliEnvFor(sh));
  const took = Date.now() - t0;
  const ready = evs.find((e) => e.kind === 'browser-ready');
  ok(c.status === 0 && ready && ready.ephemeral === true && ready.browserKey === KEY_H && ready.sessionId === 'sess-h' && ready.child === false && ready.profileId === eph().id, '④ the ephemeral browser\'s START is a lease-seam event like a profile\'s: `browser-ready` with ephemeral:true, its key, its session', evs);
  ok(heldAt.length === 1 && heldAt[0] === 0 && cmdsH().length === 1 && cmdsH()[0].verb === 'open' && took >= 300, `④ the listener's promise HELD the verb: nothing ran on the browser while it was pending (${heldAt[0]} commands), the \`open\` ran after (${took} ms)`, { heldAt, cmds: cmdsH() });
  const rows = k.list().leases.filter((l) => l.profileId === eph().id);
  ok(rows.length === 1 && rows[0].ephemeral === true && rows[0].sessionId === 'sess-h' && rows[0].browserKey === KEY_H && rows[0].label === '(ephemeral) hold me' && rows[0].child === false, '④ THE DIGEST: `leases` carries the live ephemeral browser as a holder row (ephemeral:true, its session, its label) — what the live view\'s auto-bind opens on', rows);
  const st = k.statusFor(KEY_H);
  ok(st.leases.length === 1 && st.leases[0].ephemeral === true && st.leases[0].browser && st.leases[0].browser.state === 'ready' && st.attachments.length === 0 && st.ephemeral && st.ephemeral.state === 'ready', '④ the status route\'s `leases` names it too (the owner read `leases: []` beside a running ephemeral) — still no attachment, no handle', st.leases);
  ok(k.leasesOn(eph().id).length === 1 && k.leasesOn(eph().id)[0].ephemeral === true && k.holdersFor(KEY_H).length === 1 && k.liveHoldingFor(KEY_H, '') === 'ephemeral' && k.liveHoldingFor(KEY_H, null) === 'ephemeral', '④ leasesOn marks it; holdersFor lists it; the card/status fact `browserLive` = \'ephemeral\'');
  c = await cli(['snapshot'], cliEnvFor(sh));
  ok(c.status === 0 && evs.filter((e) => e.kind === 'browser-ready').length === 1 && evs.some((e) => e.kind === 'verb' && e.ephemeral && e.sessionId === 'sess-h'), '④ a verb on the already-live browser is a `verb` event (no second browser-ready) — a listener that lost its tap re-arms before the command runs');
  // an idle-out: the row LEAVES, the stop is said, a view is refused by name without asking the CLI
  const pid0 = k.browserOf(eph().id).pid;
  process.kill(pid0, 'SIGKILL');
  for (let i = 0; i < 40 && alive(pid0); i++) await sleep(25);
  // VERIFY r1 H2: a view reconnecting INSIDE the tick window (the client's 1 s reconnect after `upstream-closed`)
  // — the record still says `ready` until the 5 s tick — must be judged by the PROCESS, never by the record:
  // measured on 0.38.1, `stream status` with no daemon STARTS one the keeper never holds
  const tgt = S.streamTargetFor({ browserKey: KEY_H, set: k.setFor(KEY_H), profileRef: S.EPHEMERAL_REF, envPairs: sh._browserEnv, profiles: k.list().profiles });
  const stateBeforeView = k.browserOf(eph().id).state;
  const streamBefore0 = logOf('stream.log').filter((x) => x.ns === nsH).length;
  const sp0 = await k.streamPortFor(tgt);
  const streamAsked0 = logOf('stream.log').filter((x) => x.ns === nsH).length - streamBefore0;
  const rowAfterView = k.list().leases.some((l) => l.profileId === eph().id);
  ok(stateBeforeView === 'ready' && !sp0.ok && sp0.code === 'browser_stopped' && streamAsked0 === 0 && !rowAfterView && k.liveHoldingFor(KEY_H, '') === '' && k.browserOf(eph().id).state === 'stopped' && evs.some((e) => e.kind === 'browser-stopped' && e.ephemeral && e.sessionId === 'sess-h'), `④ H2: BEFORE any tick (the record still said \`${stateBeforeView}\`), a view of the dead ephemeral is judged by its PROCESS — refused browser_stopped, ${streamAsked0} \`stream status\` ask(s) (a daemon the keeper never holds), the holder row already gone, the stop said`, { sp0, streamAsked0, rowAfterView, state: k.browserOf(eph().id).state });
  await k.tick();
  ok(evs.filter((e) => e.kind === 'browser-stopped').length === 1 && evs.some((e) => e.kind === 'browser-stopped' && e.ephemeral && e.sessionId === 'sess-h' && e.why === 'idle') && !k.list().leases.some((l) => l.profileId === eph().id) && k.liveHoldingFor(KEY_H, '') === '' && k.leasesOn(eph().id).length === 1, '④ an idle-out: `browser-stopped` (ephemeral, why idle) said ONCE (the tick does not say it again), its holder row LEAVES the digest (the lease itself stays), browserLive = \'\'');
  const streamBefore = logOf('stream.log').filter((x) => x.ns === nsH).length;
  const sp = await k.streamPortFor(tgt);
  ok(tgt.ok && tgt.kind === 'ephemeral' && !sp.ok && sp.code === 'browser_stopped' && /next browser command starts it/.test(sp.error) && logOf('stream.log').filter((x) => x.ns === nsH).length === streamBefore, '④ a view of the stopped managed ephemeral is refused `browser_stopped` by name — the CLI is NOT asked (measured on 0.32.0: `stream status` with no daemon starts one)', sp);
  c = await cli(['snapshot'], cliEnvFor(sh));
  ok(c.status === 0 && evs.filter((e) => e.kind === 'browser-ready').length === 2 && k.list().leases.some((l) => l.profileId === eph().id && l.ephemeral), '④ its next verb restarts it: a second `browser-ready`, the holder row is BACK (the auto-bind\'s "it started" — an open view reconnects)');
  const sp2 = await k.streamPortFor(tgt);
  ok(sp2.ok && Number.isInteger(sp2.port), '④ …and the view\'s port is asked again (a ready browser)', sp2);
  // VERIFY r1 H2 (second half): THE BRIDGE — the daemon dying closes its stream server's socket; the REAL bridge's
  // upstream close on an EPHEMERAL relay tells the keeper, which judges the process and takes the row out AT ONCE
  // (no tick, no view asking); a copy of the bridge without that call leaves the row for the tick (the control)
  const BS = require('../src/server/browser-stream.js');
  const { WebSocketServer } = require('ws');
  const quiet = { log() { }, warn() { } };
  const bridgeLeg = async (BSmod, tag) => {
    const upW = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise((r) => upW.on('listening', r));
    fs.writeFileSync(path.join(AB_STATE, 'stream-port-' + nsH), String(upW.address().port));
    const br = BSmod.create({ keeper: k, activeSessions: sessions, requestAuthed: () => true, log: quiet });
    const tp = await br.tap('sess-h', S.EPHEMERAL_REF, () => { });
    for (let i = 0; i < 40 && !upW.clients.size; i++) await sleep(25);
    const connected = tp.ok && upW.clients.size === 1;
    const pidB = k.browserOf(eph().id).pid;
    const stopsBefore = evs.length;
    process.kill(pidB, 'SIGKILL');
    for (let i = 0; i < 40 && alive(pidB); i++) await sleep(25);
    const rowBefore = k.list().leases.some((l) => l.profileId === eph().id);
    const streamAt = logOf('stream.log').filter((x) => x.ns === nsH).length;
    for (const cl of upW.clients) cl.terminate();                                    // the daemon's stream server socket closes
    let gone = false; const t0 = Date.now();
    for (let i = 0; i < 24 && !(gone = !k.list().leases.some((l) => l.profileId === eph().id)); i++) await sleep(25);   // ≤ 600 ms (the real leg answers in one judge)
    const r = { tag, connected, rowBefore, gone, ms: Date.now() - t0, state: k.browserOf(eph().id).state, stopped: evs.slice(stopsBefore).filter((e) => e.kind === 'browser-stopped').length, asked: logOf('stream.log').filter((x) => x.ns === nsH).length - streamAt };
    br.shutdown(); await new Promise((res) => upW.close(() => res()));
    try { fs.unlinkSync(path.join(AB_STATE, 'stream-port-' + nsH)); } catch { }
    await k.tick();                                                                  // the control's row leaves here
    c = await cli(['snapshot'], cliEnvFor(sh));                                      // and the browser is back for the next leg
    return r;
  };
  const bReal = await bridgeLeg(BS, 'real');
  ok(bReal.connected && bReal.rowBefore && bReal.gone && bReal.state === 'stopped' && bReal.stopped === 1 && bReal.asked === 0 && c.status === 0, `④ H2: the REAL bridge's upstream close on the ephemeral relay tells the keeper — the dead browser's holder row left in ${bReal.ms} ms with no tick and no view asking (stopped said once, 0 stream asks)`, bReal);
  const MB = mutantCopies('browser-ephemeral-h2', REPO);
  const bsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
  const bmut = bsrc.replace(/\n\s*if \(relay\.target\.kind === 'ephemeral' && keeper && typeof keeper\.noteStreamClosed === 'function'\)[^\n]*/, '');
  const bCtl = bmut !== bsrc ? await bridgeLeg(MB.load('src/server/browser-stream.js', bmut, 'no-note'), 'control') : null;
  ok(bCtl && bCtl.connected && bCtl.rowBefore && !bCtl.gone && bCtl.state === 'ready', '④ H2 CONTROL: a bridge copy WITHOUT the keeper call leaves the dead browser\'s row (and its `ready` record) standing until the tick — the leg above can go red', bCtl || 'the anchor line was not found in src/server/browser-stream.js');
  // …and a keeper copy that reads the RECORD (the pre-fix streamPortFor) asks the CLI for a dead browser's port
  const MK2 = mutantCopies('browser-ephemeral-h2k', REPO);
  const ksrcH2 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const kmutH2 = ksrcH2.replace(/\n\s*if \(bk\) judgeEphemeral\(bk, 'a view asked for its port'\);[^\n]*/, '');
  if (kmutH2 !== ksrcH2) {
    const KH = MK2.load('src/server/browser-keeper.js', kmutH2, 'record-only');
    const KEY_Q = 'bk-0000a12a'; live.add(KEY_Q);
    const kq = KH.create({ dataDir: path.join(ROOT, 'data-h2'), homeDir: fakeHome, env: () => rtEnv, serverSetting: (x) => settings[x], liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, install: false });
    await kq.ensureEphemeral({ browserKey: KEY_Q, sessionId: 'sess-q', envPairs: pairsFor(KEY_Q), sessionName: 'q' });
    const pq = kq.browserOf(kq.ephemeralFor(KEY_Q).profileId).pid;
    process.kill(pq, 'SIGKILL'); for (let i = 0; i < 40 && alive(pq); i++) await sleep(25);
    const nq = 'vs-' + KEY_Q, before = logOf('stream.log').filter((x) => x.ns === nq).length;
    const spq = await kq.streamPortFor(S.streamTargetFor({ browserKey: KEY_Q, set: kq.setFor(KEY_Q), profileRef: S.EPHEMERAL_REF, envPairs: pairsFor(KEY_Q), profiles: kq.list().profiles }));
    const askedQ = logOf('stream.log').filter((x) => x.ns === nq).length - before;
    ok(spq.ok && askedQ === 1 && kq.list().leases.some((l) => l.ephemeral), `④ H2 CONTROL: a keeper copy that judges the RECORD (pre-fix) answers ok and asks the CLI ${askedQ} time(s) for the dead browser's port — the before-tick leg above can go red`, { spq, askedQ });
    for (const e of kq.ephemerals()) await kq.stop(e.profileId).catch(() => { });
    kq.shutdown();
  } else ok(false, '④ H2 CONTROL: the keeper anchor line (judgeEphemeral in streamPortFor) was not found');
  unsub();

  // THE REAL RECORDER over THIS keeper, a fake bridge: no viewer at all — the ephemeral's ready event arms a tap on THAT browser
  const D4 = path.join(ROOT, 'data4'); fs.mkdirSync(D4, { recursive: true });
  const tapped = []; const relays = new Map();
  const fakeBridge = {
    _relays: relays,
    tap: async (sessionId, ref, cb) => {
      // as the real bridge resolves it: a `~child:<key>` ref is the sub-agent's OWN browser (its key, its relay)
      const ck = S.childKeyOfRef(ref, activeKey(sessionId));
      const key = `${sessionId}|${ck ? 'child:' + ck : ref === S.EPHEMERAL_REF ? 'ephemeral' : ref}`;
      const rec = { sessionId, ref, cb, untapped: false };
      tapped.push(rec);
      relays.set(key, { key, browserKey: ck || activeKey(sessionId), target: { kind: ref === S.EPHEMERAL_REF || ck ? 'ephemeral' : 'attachment', profileId: null, child: !!ck } });
      await sleep(150);
      return { ok: true, key, untap: () => { rec.untapped = true; }, target: { kind: 'ephemeral', profileId: null } };
    },
    broadcastTo: () => 0,
  };
  const activeKey = (sid) => (sessions.get(sid) || {})._browserKey || null;
  const bc = [];
  const armedBy = (kk) => {
    const trc = TRC.create({ dataDir: D4, keeper: kk, bridge: fakeBridge, serverSetting: () => undefined, broadcast: (m) => bc.push(m), log: { log() { }, warn() { } }, sweepEveryMs: 0 });
    trc.install();
    return trc;
  };
  const trc = armedBy(k);
  // restart the browser so a ready event reaches the installed recorder
  const pid1 = k.browserOf(eph().id).pid;
  process.kill(pid1, 'SIGKILL');
  for (let i = 0; i < 40 && alive(pid1); i++) await sleep(25);
  await k.tick();
  const tBefore = tapped.length;
  c = await cli(['open', 'https://example.com/traced'], cliEnvFor(sh));
  const mine = tapped.slice(tBefore).filter((x) => x.sessionId === 'sess-h');
  ok(c.status === 0 && mine.length === 1 && mine[0].ref === S.EPHEMERAL_REF && trc._taps.has('sess-h|ephemeral'), '④ the REAL recorder armed ONE viewer-less tap on the session\'s OWN ephemeral browser (EPHEMERAL_REF) at its start — no live view open', tapped.map((x) => [x.sessionId, x.ref]));
  const cb = mine[0].cb;
  const FR = (n) => ({ type: 'frame', data: Buffer.from('frame-' + n).toString('base64'), metadata: { deviceWidth: 1280, deviceHeight: 720 } });
  cb(FR(1));
  cb({ type: 'command', id: 'r1', action: 'navigate', params: { action: 'navigate', url: 'https://example.com/traced' } });
  cb({ type: 'result', id: 'r1', action: 'navigate', success: true, data: { url: 'https://example.com/traced' } });
  await sleep(450); cb(FR(2));
  let entries = [];
  for (let i = 0; i < 60 && !entries.length; i++) { await sleep(50); try { entries = fs.readFileSync(path.join(D4, 'browser-trace', 'ephemeral', 'index.ndjson'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { entries = []; } }
  ok(entries.length === 1 && entries[0].action === 'navigate' && entries[0].sessionId === 'sess-h' && entries[0].browserKey === KEY_H && entries[0].profileId === null && entries[0].before && entries[0].after && /traced/.test(JSON.stringify(entries[0])), '④ the navigation is RECORDED under data/browser-trace/ephemeral (session + key, before/after frames) with nobody watching', entries[0]);
  ok(bc.some((m) => m.type === 'browser-trace-appended' && m.sessionId === 'sess-h' && m.entry && m.entry.scope === 'ephemeral'), '④ …and every client is told (`browser-trace-appended`, scope ephemeral) — the tool card row re-asks');
  ok(trc.list({ sessionId: 'sess-h', browserKey: KEY_H, anyOf: true }).length === 1, '④ the actions route\'s reader finds it by the session or the key');
  // the browser stops ⇒ the tap is dropped
  await k.stop(eph().id, { why: 'user' });
  ok(!trc._taps.has('sess-h|ephemeral') && mine[0].untapped === true, '④ the browser stopped ⇒ the recorder untapped it (`browser-stopped`, ephemeral)');
  // a sub-agent's ephemeral is a holder row but never tapped (its pairs are not its session's)
  const kidCli = await cli(['new-child'], cliEnvFor(sh));
  const childKey = (kidCli.stdout.match(/VIBESPACE_BROWSER=(\S+)/) || [])[1];
  const tB = tapped.length;
  c = await cli(['snapshot'], { ...cliEnvFor(sh), VIBESPACE_BROWSER: childKey });
  const kidRow = k.list().leases.find((l) => l.browserKey === childKey);
  // NAIVE STUDY 2 (finding 4): a helper's (sub-agent's) browser is RECORDED too — the operator's "Browser actions" rows said
  // "no recorded actions in this call" under every command that drove a helper's browser (nobody was viewing it). This pin
  // said the opposite ("the recorder taps NOTHING for it"); a sub-agent's browser still never gets a live view (auto-bind skips `child`).
  const kidTaps = tapped.slice(tB);
  ok(c.status === 0 && kidRow && kidRow.ephemeral && kidRow.child === true && kidTaps.length === 1 && kidTaps[0].ref === S.childRefFor(childKey) && trc._taps.has('sess-h|child:' + childKey), '④ a sub-agent\'s ephemeral is a holder row marked child — and the recorder taps ITS OWN browser (`~child:<key>`, never the session\'s pane)', { kidRow, taps: kidTaps.map((x) => x.ref) });
  kidTaps[0].cb({ type: 'command', id: 'k1', action: 'navigate', params: { action: 'navigate', url: 'https://example.org/helper' } });
  kidTaps[0].cb({ type: 'result', id: 'k1', action: 'navigate', success: true, data: { url: 'https://example.org/helper' } });
  let kidEntries = [];
  for (let i = 0; i < 60 && !kidEntries.length; i++) { await sleep(50); kidEntries = trc.list({ sessionId: 'sess-h', anyOf: true }).filter((e) => e.browserKey === childKey); }
  ok(kidEntries.length === 1 && kidEntries[0].action === 'navigate' && kidEntries[0].sessionId === 'sess-h' && kidEntries[0].profileId === null && trc.list({ browserKey: KEY_H, anyOf: true }).some((e) => e.browserKey === childKey), '④ …its navigation is RECORDED (scope ephemeral, the helper\'s key, the session\'s id) and the conversation\'s key finds it after the fact (a parent key matches its children)', kidEntries[0]);
  // …and the REAL bridge resolves that tap: the helper's OWN pairs from the keeper, its namespace, its key on the relay
  {
    const { WebSocketServer: WSS } = require('ws');
    const upK = new WSS({ port: 0, host: '127.0.0.1' }); await new Promise((r) => upK.on('listening', r));
    const nsK = 'vs-' + childKey;
    fs.writeFileSync(path.join(AB_STATE, 'stream-port-' + nsK), String(upK.address().port));
    const brK = BS.create({ keeper: k, activeSessions: sessions, requestAuthed: () => true, log: { log() { }, warn() { } } });
    const askedBefore = logOf('stream.log').filter((x) => x.ns === nsK).length;
    const tk = await brK.tap('sess-h', S.childRefFor(childKey), () => { });
    for (let i = 0; i < 40 && !upK.clients.size; i++) await sleep(25);
    const relK = [...brK._relays.values()].find((r) => r.key === 'sess-h|child:' + childKey);
    const vw = S.streamTargetFor({ browserKey: KEY_H, set: k.setFor(KEY_H), profileRef: S.childRefFor(childKey), envPairs: sh._browserEnv, profiles: k.list().profiles });
    ok(tk.ok && tk.target && tk.target.child === true && relK && relK.browserKey === childKey && logOf('stream.log').filter((x) => x.ns === nsK).length === askedBefore + 1 && upK.clients.size === 1 && !vw.ok && vw.code === 'no-browser', '④ the REAL bridge taps `~child:<key>` under the helper\'s OWN pairs (its namespace asked, its key on the relay, one upstream) — and a viewer\'s request for it carries no pairs and is refused (never a live view)', { tk, relay: relK && { key: relK.key, bk: relK.browserKey }, vw });
    try { tk.untap && tk.untap(); } catch { }
    brK.shutdown(); await new Promise((res) => upK.close(() => res()));
    try { fs.unlinkSync(path.join(AB_STATE, 'stream-port-' + nsK)); } catch { }
  }
  trc.shutdown();
  // a RESTART: the recorder boots over a keeper whose ephemeral browser is ready (adopted) — it is tapped with no event
  c = await cli(['snapshot'], cliEnvFor(sh));
  const tR = tapped.length;
  const trcBoot = TRC.create({ dataDir: D4, keeper: k, bridge: fakeBridge, serverSetting: () => undefined, broadcast: () => { }, log: { log() { }, warn() { } }, sweepEveryMs: 0 });
  const booted = await trcBoot.boot();
  ok(c.status === 0 && booted.armed >= 2 && tapped.slice(tR).some((x) => x.sessionId === 'sess-h' && x.ref === S.EPHEMERAL_REF) && tapped.slice(tR).some((x) => x.sessionId === 'sess-h' && x.ref === S.childRefFor(childKey)), '④ a recorder BOOTING over live ephemeral browsers (a server restart adopted them) taps the session\'s — and the sub-agent\'s under its own ref (naive study 2)', { armed: booted.armed, taps: tapped.slice(tR).map((x) => [x.sessionId, x.ref]) });
  trcBoot.shutdown();
  // CONTROL (scripts/mutant-copy.mjs): the pre-fix recorder that skips a sub-agent's browser ⇒ no tap, no entry
  {
    const MC = mutantCopies('browser-ephemeral-child', REPO);
    const tsrcC = fs.readFileSync(path.join(REPO, 'src/server/browser-trace.js'), 'utf8');
    const tmutC = tsrcC.replace('    if (!ev.sessionId) return Promise.resolve(null);\n    return watch({ sessionId: ev.sessionId, profileId: null, browserKey: ev.browserKey || null, child: !!ev.child }).catch(() => null);', '    if (!ev.sessionId || ev.child) return Promise.resolve(null);\n    return watch({ sessionId: ev.sessionId, profileId: null, browserKey: ev.browserKey || null, child: !!ev.child }).catch(() => null);');
    if (tmutC !== tsrcC) {
      const TC = MC.load('src/server/browser-trace.js', tmutC, 'child-skip');
      const trcC = TC.create({ dataDir: path.join(ROOT, 'data4c'), keeper: k, bridge: fakeBridge, serverSetting: () => undefined, broadcast: () => { }, log: { log() { }, warn() { } }, sweepEveryMs: 0 });
      trcC.install();
      const kPid = k.browserOf(k.ephemeralFor(childKey).profileId).pid;
      try { process.kill(kPid, 'SIGKILL'); } catch { }
      for (let i = 0; i < 40 && alive(kPid); i++) await sleep(25);
      await k.tick();
      const tC = tapped.length;
      const cc = await cli(['snapshot'], { ...cliEnvFor(sh), VIBESPACE_BROWSER: childKey });
      ok(cc.status === 0 && !tapped.slice(tC).some((x) => x.ref === S.childRefFor(childKey)) && !trcC._taps.has('sess-h|child:' + childKey), '④ CONTROL: a recorder copy that skips a sub-agent\'s browser (the pre-fix `ev.child` gate) taps nothing when it restarts — the helper legs above can go red', tapped.slice(tC).map((x) => x.ref));
      trcC.shutdown();
    } else ok(false, '④ CONTROL (child skip): the anchor was not found in src/server/browser-trace.js');
    for (const r of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 1, label: '④ child ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  }

  // VERIFY r1 L1: THE ARM WAIT BELONGS TO THE VERB THAT STARTED THE BROWSER. A tap stuck arming used to hold EVERY
  // verb for the whole arm wait (0.38.1, the default 3 s: open 3150 ms, snapshot 3098, click 3108) — a `verb` event
  // joined the pending arming it did not start; a FAILED arming was deleted and the next verb re-armed and waited
  // again. Now a `verb` never waits on an arming another event started, and a failed arming backs off per key.
  const ARMW = 1000;
  const l1Leg = async (TRCmod, KEY, tag, { third = true } = {}) => {
    live.add(KEY);
    const kl = K.create({ dataDir: path.join(ROOT, 'data-l1-' + tag), homeDir: fakeHome, env: () => rtEnv, serverSetting: (x) => settings[x], liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, install: false, armWaitMs: ARMW });
    let clock = Date.now(), mode = 'stuck';
    const calls = { stuck: 0, failing: 0 };
    const br = { _relays: new Map(), broadcastTo: () => 0, tap: () => { calls[mode]++; return mode === 'stuck' ? new Promise(() => { }) : sleep(400).then(() => ({ ok: false, code: 'refused', error: 'fake: no stream server' })); } };
    const bcs = [];   // VERIFY r2 L5: what every client is told about the tap
    const statuses = () => bcs.filter((m) => m && m.type === 'browser-trace-status');
    const tr = TRCmod.create({ dataDir: path.join(ROOT, 'data-l1t-' + tag), keeper: kl, bridge: br, serverSetting: () => undefined, broadcast: (m) => bcs.push(m), log: { log() { }, warn() { } }, sweepEveryMs: 0, now: () => clock });
    tr.install();
    const verb = async () => { const t0 = Date.now(); await kl.ensureEphemeral({ browserKey: KEY, sessionId: 'sess-' + tag, envPairs: pairsFor(KEY), sessionName: tag }); return Date.now() - t0; };
    const r = { first: await verb(), second: await verb() };
    if (third) r.third = await verb();
    r.stuckCalls = calls.stuck;
    await kl.stop(kl.ephemeralFor(KEY).profileId, { why: 'user' });            // its stop drops the stuck tap
    mode = 'failing';
    const failAt = clock;
    r.f1 = await verb(); r.statusAfterF1 = statuses().map((m) => ({ ...m })); r.f2 = await verb(); r.failCallsAfterF2 = calls.failing; r.statusAfterF2 = statuses().length;
    r.expectUntil = failAt + TRCmod.ARM_RETRY_MS;
    clock += 5 * 60 * 1000;                                                    // past the backoff
    r.f3 = await verb(); r.failCallsAfterF3 = calls.failing; r.statusAfterF3 = statuses().length;
    tr.shutdown();
    for (const e of kl.ephemerals()) await kl.stop(e.profileId).catch(() => { });
    kl.shutdown();
    return r;
  };
  const l1 = await l1Leg(TRC, 'bk-0000a12b', 'l1');
  ok(l1.first >= ARMW - 100 && l1.second < 500 && l1.third < 500 && l1.stuckCalls === 1, `④ L1: a tap STUCK arming holds only the verb that started the browser (${l1.first} ms ≈ the ${ARMW} ms arm wait) — the next verbs return in ${l1.second} / ${l1.third} ms and never re-ask the bridge (${l1.stuckCalls} tap call)`, l1);
  ok(l1.f1 >= 350 && l1.failCallsAfterF2 === 1 && l1.f2 < 500 && l1.failCallsAfterF3 === 2 && l1.f3 >= 350, `④ L1: a FAILED arming backs off per key — the next verb inside the backoff is not held and not re-armed (${l1.f2} ms, ${l1.failCallsAfterF2} tap call); past it the next verb arms again (${l1.failCallsAfterF3} calls, ${l1.f3} ms)`, l1);
  // VERIFY r2 L5: a verb inside the backoff records NOTHING — the failure is SAID, typed, once: `browser-trace-status
  // {sessionId, code:'arm_failed', until, error}` on the failed arming; the next verb inside the backoff adds no second
  // one; a new failure past it is a new status. The Browser actions row reads "not recorded until <t>: <why>".
  const s1 = (l1.statusAfterF1 || [])[0] || null;
  ok((l1.statusAfterF1 || []).length === 1 && s1.code === 'arm_failed' && s1.sessionId === 'sess-l1' && s1.browserKey === 'bk-0000a12b' && s1.until === l1.expectUntil && /no stream server/.test(s1.error || '') && l1.statusAfterF2 === 1 && l1.statusAfterF3 === 2, `④ r2 L5: a failed arming is SAID once (\`browser-trace-status\` arm_failed, its session + key, until = failure + ${TRC.ARM_RETRY_MS} ms, the why) — the verb inside the backoff adds none (${l1.statusAfterF2}), a new failure past it says it again (${l1.statusAfterF3})`, { first: s1, after2: l1.statusAfterF2, after3: l1.statusAfterF3 });
  // …and the words: the PURE overlap rule the tool card uses, and its wiring (chat-view routes the status to the loader)
  const gw = { from: 1000, to: 5000 };
  ok(TR.armGapFor(gw, { code: 'arm_failed', at: 4000, until: 34000, error: 'x' })?.until === 34000 && TR.armGapFor({ from: 40000, to: 41000 }, { code: 'arm_failed', at: 4000, until: 34000 }) === null && TR.armGapFor(gw, { code: 'armed', at: 4000 }) === null && TR.armGapFor(gw, null) === null, '④ r2 L5: armGapFor — a card window overlapping [at, until] of an arm_failed status gets the gap; a later window, `armed`, or no status gets none');
  const cvSrc = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8'), tvSrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  ok((cvSrc.match(/msg\.type === 'browser-trace-status'\) \{\n\s*(?:\/\/[^\n]*\n\s*)?this\._browserTrace\?\.onStatus\?\.\(msg\)/g) || []).length === 2 && /gap: armGapFor\(w, st\.armFail\)/.test(tvSrc) && /else if \(gap\) sum\.textContent = t\('not recorded until \{time\}: \{why\}'/.test(tvSrc), '④ r2 L5: WIRING — both chat-view handlers hand `browser-trace-status` to the loader, whose empty card reads "not recorded until {time}: {why}"');
  const ML = mutantCopies('browser-ephemeral-l1', REPO);
  const tsrc = fs.readFileSync(path.join(REPO, 'src/server/browser-trace.js'), 'utf8');
  const tmut = tsrc.replace("if (ev.kind === 'verb') return armOnVerb(ev);", "if (ev.kind === 'verb') return armEphemeral(ev);");
  if (tmut !== tsrc) {
    const l1c = await l1Leg(ML.load('src/server/browser-trace.js', tmut, 'verb-joins'), 'bk-0000a12c', 'l1c', { third: false });
    ok(l1c.second >= ARMW - 100 && l1c.failCallsAfterF2 === 2, `④ L1 CONTROL: a recorder copy whose \`verb\` joins the pending arming (pre-fix) holds the SECOND verb ${l1c.second} ms and re-arms a failed tap at once (${l1c.failCallsAfterF2} calls) — the legs above can go red`, l1c);
  } else ok(false, '④ L1 CONTROL: the anchor `if (ev.kind === \'verb\') return armOnVerb(ev);` was not found in src/server/browser-trace.js');
  // r2 L5 CONTROL: a recorder copy that never says the failure (the pre-fix silence) — the L5 leg can go red
  const tmut5 = tsrc.replace('    if (!tp || tp.profileId) return; // the backoff (and so the gap) is the ephemeral tap\'s alone', '    return;');
  if (tmut5 !== tsrc) {
    const l5c = await l1Leg(ML.load('src/server/browser-trace.js', tmut5, 'silent-arm-fail'), 'bk-0000a12f', 'l5c', { third: false });
    ok((l5c.statusAfterF1 || []).length === 0 && l5c.statusAfterF2 === 0 && l5c.failCallsAfterF2 === 1, `④ r2 L5 CONTROL: a recorder copy that does not say the failed arming leaves the backoff silent (${(l5c.statusAfterF1 || []).length} status) — the leg above can go red`, { f1: l5c.statusAfterF1, f2: l5c.statusAfterF2 });
  } else ok(false, '④ r2 L5 CONTROL: the sayTapStatus guard line was not found in src/server/browser-trace.js');

  // VERIFY r1 L2: `detach` on a conversation whose ONLY browser is its managed ephemeral — the detach said
  // "idles out unless re-attached" while the next tick stopped and REMOVED it; its seam events carried no
  // ephemeral/sessionId, so the recorder unwatched `<sess>|bp-…` and a stale `<sess>|ephemeral` tap blocked the
  // next arm. Now the detach event is an ephemeral one, the browser is retired by the detach itself, and the words say so.
  const l2Leg = async (kk, KEY, sid, { viaCli = true, sess = null } = {}) => {
    live.add(KEY);
    const tapsD = [];
    const okBridge = { _relays: new Map(), broadcastTo: () => 0, tap: async (s1, ref) => { tapsD.push({ s1, ref }); return { ok: true, key: `${s1}|ephemeral`, untap: () => { }, target: { kind: 'ephemeral', profileId: null } }; } };
    const trD = TRC.create({ dataDir: path.join(ROOT, 'data-l2-' + sid), keeper: kk, bridge: okBridge, serverSetting: () => undefined, broadcast: () => { }, log: { log() { }, warn() { } }, sweepEveryMs: 0 });
    trD.install();
    const r = { sid };
    if (viaCli) r.open = await cli(['open', 'https://example.com/detach'], cliEnvFor(sess));
    else await kk.ensureEphemeral({ browserKey: KEY, sessionId: sid, envPairs: pairsFor(KEY), sessionName: sid });
    const pD = kk.ephemeralFor(KEY);
    r.tappedBefore = trD._taps.has(sid + '|ephemeral');
    const evD = []; const unD = kk.onLease((ev) => { if (ev && (ev.browserKey === KEY || (pD && ev.profileId === pD.profileId))) evD.push({ ...ev }); return null; });
    if (viaCli) r.det = await cli(['detach'], cliEnvFor(sess)); else r.detAns = kk.detach({ browserKey: KEY });
    r.detEv = evD.find((e) => e.kind === 'detach') || null;
    r.tappedAfter = trD._taps.has(sid + '|ephemeral');
    await kk.retireEphemeral(pD.profileId);
    r.recordsLeft = kk.ephemerals().filter((e) => e.browserKey === KEY).length;
    r.stopEv = evD.find((e) => e.kind === 'browser-stopped') || null;
    if (viaCli) { r.next = await cli(['snapshot'], cliEnvFor(sess)); r.taps = tapsD.length; r.tappedNext = trD._taps.has(sid + '|ephemeral'); }
    unD(); trD.shutdown();
    for (const e of kk.ephemerals()) if (e.browserKey === KEY) await kk.stop(e.profileId).catch(() => { });
    return r;
  };
  const sd = mkSession('sess-d', 'bk-0000a11e', 'd', { name: 'detach me' });
  const l2 = await l2Leg(k, 'bk-0000a11e', 'sess-d', { sess: sd });
  ok(l2.open.status === 0 && l2.tappedBefore && l2.det.status === 0 && l2.detEv && l2.detEv.ephemeral === true && l2.detEv.sessionId === 'sess-d' && l2.detEv.browserKey === 'bk-0000a11e' && l2.detEv.child === false && !l2.tappedAfter, '④ L2: `detach` on an ephemeral-only session is an EPHEMERAL seam event (ephemeral:true, its session, its key) and the recorder dropped `sess-d|ephemeral` — before any tick', { detEv: l2.detEv, tappedAfter: l2.tappedAfter });
  ok(/this conversation's own browser/.test(l2.det.stdout) && /next browser command starts it again/.test(l2.det.stdout) && !/idles out unless re-attached/.test(l2.det.stdout), '④ L2: the CLI says what the detach does to it (its own browser stops; the next command starts it again) — never "idles out unless re-attached"', l2.det.stdout + l2.det.stderr);
  ok(l2.recordsLeft === 0 && l2.stopEv && l2.stopEv.ephemeral === true && l2.stopEv.sessionId === 'sess-d', '④ L2: the detach itself stops the browser and removes its record (no tick), and that stop still names its session (the lease was already gone)', { stopEv: l2.stopEv, left: l2.recordsLeft });
  ok(l2.next.status === 0 && l2.taps === 2 && l2.tappedNext, `④ L2: the next verb starts a fresh browser and the recorder taps it again (${l2.taps} taps — no stale tap blocking the arm)`, { taps: l2.taps, tappedNext: l2.tappedNext, err: l2.next.stderr });
  // VERIFY r2 L8 (the ephemeral half): the user took over the conversation's OWN browser — the agent's `detach` is refused
  // browser_paused by name (it used to retire the browser under the user: the input key `<key>|ephemeral` was never even
  // looked at); the user's own detach (the UI) retires it
  {
    const KEY8 = 'bk-0000a130'; live.add(KEY8);
    const s8 = mkSession('sess-8', KEY8, '8', { name: 'taken' });
    let c8 = await cli(['open', 'https://example.com/taken'], cliEnvFor(s8));
    const e8 = k.ephemeralFor(KEY8);
    const ev8 = []; const un8 = k.onInput((ev) => { if (ev && ev.browserKey === KEY8) ev8.push(ev); });
    k.takeover({ browserKey: KEY8, profileId: null, viewerId: 'v8', sessionId: 'sess-8' });
    c8 = await cli(['detach'], cliEnvFor(s8));
    const still = k.ephemeralFor(KEY8);
    ok(c8.status === 1 && /\[browser_paused\]/.test(c8.stderr) && /detach did NOT run/.test(c8.stderr) && still && still.state === 'ready' && still.leased && ev8.filter((e) => e.kind === 'handback').length === 0 && k.inputStateFor(KEY8, null).input === 'user', '④ r2 L8: while the user drives the conversation\'s own browser, the agent\'s `detach` is refused [browser_paused] — no handback, the browser still ready and leased, the takeover stands', { status: c8.status, se: c8.stderr.slice(0, 300), still, ev8 });
    const d8 = k.detach({ browserKey: KEY8, by: 'user' });
    await k.retireEphemeral(e8.profileId);
    ok(d8.ephemeral && ev8.some((e) => e.kind === 'handback' && e.cause === 'detach') && !k.ephemeralFor(KEY8) && k.inputsFor(KEY8).length === 0, '④ r2 L8: the USER\'s detach (the UI) ends it — a detach handback, its input state dropped (the `<key>|ephemeral` key), the browser retired', { d8, ev8: ev8.map((e) => e.kind + ':' + e.cause) });
    un8();
  }
  // VERIFY r6 LOW 3 (the ephemeral half): the user drives the conversation's OWN browser and presses its Stop in the panel —
  // the stop hands back (cause `stop`) under the `<key>|ephemeral` key, so the agent's next verb starts a NEW browser it
  // drives (it used to stay `browser_paused` until the 10-min idle handback)
  {
    const KEY9 = 'bk-0000a131'; live.add(KEY9);
    const s9 = mkSession('sess-9', KEY9, '9', { name: 'stopped' });
    let c9 = await cli(['open', 'https://example.com/stop-me'], cliEnvFor(s9));
    const e9 = k.ephemeralFor(KEY9);
    const ev9 = []; const un9 = k.onInput((ev) => { if (ev && ev.browserKey === KEY9) ev9.push(ev); });
    k.takeover({ browserKey: KEY9, profileId: null, viewerId: 'v9', sessionId: 'sess-9' });
    const paused9 = k.resolveFor({ browserKey: KEY9 }).code;
    await k.stop(e9.profileId, { why: 'user' });
    const st9 = k.inputStateFor(KEY9, null);
    const hb9 = ev9.filter((e) => e.kind === 'handback');
    c9 = await cli(['snapshot'], cliEnvFor(s9));
    const after9 = k.ephemeralFor(KEY9);
    ok(paused9 === 'browser_paused' && st9.input === 'agent' && st9.handbackCause === 'stop' && hb9.length === 1 && hb9[0].cause === 'stop' && c9.status === 0 && after9 && after9.state === 'ready', `④ r6 LOW 3: the user's Stop of the conversation's own browser while driving it hands back (cause \`${hb9[0] ? hb9[0].cause : '-'}\`, input ${st9.input}) — the agent's next verb starts a NEW browser and runs (exit ${c9.status})`, { paused9, st9, hb9, se: c9.stderr.slice(0, 200) });
    un9();
  }
  const MD = mutantCopies('browser-ephemeral-l2', REPO);
  const ksrcL2 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const kmutL2 = ksrcL2.replace("emitLease({ kind: 'detach', browserKey, profileId: id, sessionId: d.lease ? d.lease.sessionId || null : null, ...evFields });", "emitLease({ kind: 'detach', browserKey, profileId: id, sessionId: d.lease ? d.lease.sessionId || null : null });");
  if (kmutL2 !== ksrcL2) {
    const KD = MD.load('src/server/browser-keeper.js', kmutL2, 'detach-bare');
    const kd = KD.create({ dataDir: path.join(ROOT, 'data-l2m'), homeDir: fakeHome, env: () => rtEnv, serverSetting: (x) => settings[x], liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, install: false });
    const l2c = await l2Leg(kd, 'bk-0000a12d', 'sess-dm', { viaCli: false });
    ok(l2c.tappedBefore && l2c.detEv && !l2c.detEv.ephemeral && l2c.tappedAfter, '④ L2 CONTROL: a keeper copy whose detach event carries no ephemeral fields (pre-fix) leaves the recorder\'s `<sess>|ephemeral` tap standing — the leg above can go red', { detEv: l2c.detEv, tappedAfter: l2c.tappedAfter });
    kd.shutdown();
  } else ok(false, '④ L2 CONTROL: the detach emit line was not found in src/server/browser-keeper.js');

  // CONTROL (scripts/mutant-copy.mjs): a keeper whose holder rows DROP the ephemeral — the pre-lane representation
  const M = mutantCopies('browser-ephemeral-laneh', REPO);
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const kmut = ksrc.replace('const holders = (leases) => B.holderRows({ leases, profiles: reg.profiles, browsers: reg.browsers, view: leaseView });', 'const holders = (leases) => B.holderRows({ leases, profiles: reg.profiles, browsers: reg.browsers, view: leaseView }).filter((r) => !r.ephemeral);');
  const KM = M.load('src/server/browser-keeper.js', kmut, 'no-eph-holder');
  const KEY_M = 'bk-0000a11d'; live.add(KEY_M);
  mkSession('sess-m', KEY_M, 'w', { name: 'mutant' });
  const km = KM.create({ dataDir: path.join(ROOT, 'data-mut'), homeDir: fakeHome, env: () => rtEnv, serverSetting: (x) => settings[x], liveKeys: () => live, runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: { log() { }, warn() { }, error() { } }, install: false });
  const tM = tapped.length;
  const trcM = armedBy(km);
  const em = await km.ensureEphemeral({ browserKey: KEY_M, sessionId: 'sess-m', envPairs: pairsFor(KEY_M), sessionName: 'mutant' });
  await sleep(250);
  ok(kmut !== ksrc && em.browser.state === 'ready' && !km.list().leases.some((l) => l.ephemeral) && km.liveHoldingFor(KEY_M, '') === '' && tapped.slice(tM).length === 0 && !trcM._taps.size, '④ NEGATIVE CONTROL: a keeper copy whose holder rows drop the ephemeral (the pre-lane digest) — its browser runs, yet no digest row (no auto-bind), no browserLive (no chip) and the recorder arms NOTHING (no trace): the legs above can go red', { leases: km.list().leases, taps: tapped.slice(tM).length });
  trcM.shutdown();
  for (const e of km.ephemerals()) await km.stop(e.profileId).catch(() => { });
  km.shutdown();
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: '④ ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  for (const [MX, lbl] of [[MB, '④ H2 bridge '], [MK2, '④ H2 keeper '], [ML, '④ L1 '], [MD, '④ L2 ']]) for (const r of copiesCensus(MX.files, MX.dir, REPO, { minCopies: 1, label: lbl })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  for (const e of k.ephemerals()) await k.stop(e.profileId).catch(() => { });
}

// ═══ ⑤ NAIVE STUDY 2 (2026-09-25): THE KEEPER IS THE ONLY LAUNCHER OF A PROFILE BROWSER; A VIEW NEVER STARTS ONE ═══
// The owner's "bank" profile never started: Chrome "SingletonLock: File exists" on every launch and on Reconnect. Measured on
// the real 0.38.1 (this lane's fix-r1 notes): a daemon is per (namespace, SESSION); the keeper's own session launched Chrome on
// the profile directory, and every lease's session given `AGENT_BROWSER_PROFILE` launched a SECOND Chrome on it — which dies on
// the lock — its commands and the live view's `stream status` alike; given the keeper browser's CDP url, two sessions each get
// their own tab in the one Chrome. THIS fake binary models exactly that (the ③ fakes above key a daemon by namespace only —
// the very assumption that broke): per-(ns, session) daemons, a profile-directory lock held by a live pid, `stream status`
// starting a missing daemon, a CDP url connecting without a launch.
console.log('— ⑤ naive study 2: the keeper is the only launcher of a profile browser (CDP, never the directory); a view never starts one');
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const R5 = path.join(ROOT, 'one-launcher'); const BIN5 = path.join(R5, 'bin'), ST5 = path.join(R5, 'ab'), HOME5 = path.join(R5, 'home');
  for (const d of [BIN5, ST5, path.join(HOME5, '.agent-browser')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(BIN5, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
const prof = process.env.AGENT_BROWSER_PROFILE || null, cdp = process.env.AGENT_BROWSER_CDP || null;
const f = path.join(st, ns + '__' + sess + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const log = (n, o) => fs.appendFileSync(path.join(st, n), JSON.stringify(o) + '\\n');
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
// a session's daemon: connect over CDP (no launch), else launch a browser on PROFILE — refused while ANOTHER live daemon holds its lock
const view = process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || '';
// MEASURED on 0.38.1: a call whose LAUNCH VIEW (here: the idle timeout) differs from the daemon's RESTARTS it (and relaunches its browser)
const restartIfViewDiffers = () => { const s = read(); if (!(s && alive(s.pid)) || s.view === view) return; try { process.kill(s.pid, 'SIGKILL'); } catch { } if (s.profile) { try { fs.unlinkSync(path.join(s.profile, 'SingletonLock.fake')); } catch { } } try { fs.unlinkSync(f); } catch { } log('restarts.log', { ns, sess, from: s.view, to: view }); };
const daemon = (by) => {
  restartIfViewDiffers();
  let s = read(); if (s && alive(s.pid)) return s;
  if (cdp) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, cdp, view }; fs.writeFileSync(f, JSON.stringify(s)); log('connects.log', { ns, sess, cdp, by, pid: c.pid }); return s; }
  const lock = prof ? path.join(prof, 'SingletonLock.fake') : null;
  if (lock) { let h = null; try { h = Number(fs.readFileSync(lock, 'utf8')); } catch { } if (h && alive(h)) { log('refused.log', { ns, sess, by, prof }); return { refused: 'Chrome exited early (exit code: 21) ... Failed to create ' + prof + '/SingletonLock: File exists (17)' }; } }
  const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: prof, view }; fs.writeFileSync(f, JSON.stringify(s));
  if (lock) fs.writeFileSync(lock, String(c.pid));
  log('launches.log', { ns, sess, by, profile: prof, pid: c.pid });
  return s;
};
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: sess, socketDir: path.join(st, ns, 'run') } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s0 = read(); if (!(s0 && alive(s0.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } const s = daemon('get cdp-url'); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19777/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } if (s && s.profile) { try { fs.unlinkSync(path.join(s.profile, 'SingletonLock.fake')); } catch { } } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'stream' && b === 'status') { log('stream.log', { ns, sess, cdp, profile: prof }); const s = daemon('stream status'); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } out({ success: true, data: { enabled: true, connected: true, port: 21000 + (sess.length * 7) % 900, screencasting: false } }); process.exit(0); }
if (['open', 'snapshot', 'get', 'click'].includes(a)) { const s = daemon(a); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } log('cmds.log', { verb: a, ns, sess, cdp, profile: prof }); out({ success: true, data: { ok: true } }); process.exit(0); }
out({ success: false, error: 'fake: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const PATH5 = `${BIN5}:${path.dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}`;
  const env5 = { PATH: PATH5, HOME: HOME5, FAKE_AB_STATE: ST5 };
  const log5 = (n) => { try { return fs.readFileSync(path.join(ST5, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const killAll5 = () => { for (const n of ['launches.log', 'connects.log']) for (const l of log5(n)) { try { process.kill(l.pid, 'SIGKILL'); } catch { } } };
  process.on('exit', killAll5);
  const runAs = (pairs, args) => new Promise((resolve) => execFile(path.join(BIN5, 'agent-browser'), args, { env: { ...env5, ...S.pairsToEnv(pairs) }, encoding: 'utf8', timeout: 15000 }, (err, stdout) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(stdout || '') })));
  const KX = 'bk-00005a01', KY = 'bk-00005a02';
  const live5 = new Set([KX, KY]);
  const mk5 = (Kmod, tag) => Kmod.create({ dataDir: path.join(R5, 'data-' + tag), homeDir: HOME5, env: () => env5, serverSetting: (x) => settings[x], liveKeys: () => live5, runtime: F.createBrowserRuntime({ env: env5 }), facts: F.createBrowserFacts({ env: env5 }), log: { log() { }, warn() { }, error() { } }, install: false });
  const legOf = async (Kmod, tag) => {
    for (const n of ['launches.log', 'connects.log', 'refused.log', 'cmds.log', 'stream.log', 'restarts.log']) { try { fs.unlinkSync(path.join(ST5, n)); } catch { } }
    const kk = mk5(Kmod, tag);
    const bank = kk.createProfile({ label: 'Bank ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag, profileId: bank.id, dir: bank.dir };
    try {
      const ax = await kk.attach({ profileId: bank.id, browserKey: KX, sessionId: 'sess-x' });
      const ay = await kk.attach({ profileId: bank.id, browserKey: KY, sessionId: 'sess-y' });
      r.envX = ax.env; r.envY = ay.env;
      r.recPidAlive = alive(kk.browserOf(bank.id).pid);
      r.cmdX = await runAs(ax.env, ['open', 'https://bank.example/login']);
      r.cmdY = await runAs(ay.env, ['open', 'https://bank.example/statements']);
      const tgt = S.streamTargetFor({ browserKey: KX, set: kk.setFor(KX), profiles: kk.list().profiles });
      r.view = await kk.streamPortFor(tgt);
      r.launches = log5('launches.log'); r.refused = log5('refused.log'); r.stream = log5('stream.log'); r.cmds = log5('cmds.log'); r.restarts = log5('restarts.log');
      // A VIEW NEVER STARTS A BROWSER: the user stops it; the live view reconnects
      await kk.stop(bank.id, { why: 'user' });
      const L0 = log5('launches.log').length, S0 = log5('stream.log').length;
      r.viewStopped = await kk.streamPortFor(tgt);
      r.launchesByView = log5('launches.log').length - L0; r.streamAsksByView = log5('stream.log').length - S0;
      r.stateAfterView = kk.browserOf(bank.id).state;
    } catch (e) { r.threw = String(e && (e.code || '') + ' ' + e.message); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown();
    killAll5();
    return r;
  };
  const r5 = await legOf(K, 'real');
  const noDir = (env) => Array.isArray(env) && !env.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')) && env.some((kv) => kv.startsWith('AGENT_BROWSER_CDP=ws://127.0.0.1:19777/'));
  ok(!r5.threw && noDir(r5.envX) && noDir(r5.envY), '⑤ both leases of ONE named profile get the keeper browser\'s CDP url — never its directory', r5.threw || { envX: r5.envX, envY: r5.envY });
  ok(r5.cmdX && r5.cmdX.status === 0 && r5.cmdY && r5.cmdY.status === 0 && r5.launches.length === 1 && r5.launches[0].sess === 'vs-' + r5.profileId && r5.launches[0].profile === r5.dir && !r5.refused.length, `⑤ two sessions' commands BOTH run and exactly ONE browser was launched on the profile directory — by the keeper's own session (${r5.launches.length} launch, ${(r5.refused || []).length} SingletonLock refusals)`, r5);
  ok(r5.recPidAlive === true && r5.restarts.length === 0, `⑤ every call the keeper makes (its own session's \`get cdp-url\`, the lease sessions' \`stream status\`) carries the launch's OWN view — ${r5.restarts.length} daemon restart(s), the recorded daemon pid alive (measured on 0.38.1: a different idle value restarts the daemon and relaunches Chrome, and the recorded pid is dead at once)`, { restarts: r5.restarts, recPidAlive: r5.recPidAlive });
  ok(r5.view && r5.view.ok && r5.stream.length === 1 && r5.stream[0].sess === 'vs-' + KX && !!r5.stream[0].cdp && !r5.stream[0].profile && r5.launches.length === 1, '⑤ the live view\'s `stream status` runs under the lease\'s session over the CDP url (no directory) — no second launch, no lock failure (the S5-45 "Live view unavailable: … SingletonLock" screen)', { view: r5.view, stream: r5.stream });
  ok(r5.viewStopped && !r5.viewStopped.ok && r5.viewStopped.code === 'browser_stopped' && /next browser command starts it/.test(r5.viewStopped.error) && r5.launchesByView === 0 && r5.streamAsksByView === 0 && r5.stateAfterView === 'stopped', `⑤ finding 3: a view of a STOPPED profile browser never starts it — refused browser_stopped, ${r5.launchesByView} launch(es), ${r5.streamAsksByView} CLI ask(s)`, { viewStopped: r5.viewStopped, launchesByView: r5.launchesByView });
  // CONTROLS (scripts/mutant-copy.mjs): the pre-fix keeper, one edit each
  const M5 = mutantCopies('browser-ephemeral-one-launcher', REPO);
  const k5src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const k5dir = k5src.replace('env: B.attachedEnvFor({ browserKey, profileId: p.id, cdpUrl: leaseCdp })', 'env: [`AGENT_BROWSER_SESSION=vs-${browserKey}`, `AGENT_BROWSER_NAMESPACE=vs-${p.id}`, `AGENT_BROWSER_PROFILE=${p.dir}`, \'AGENT_BROWSER_IDLE_TIMEOUT_MS=0\']');
  if (k5dir !== k5src) {
    const c5 = await legOf(M5.load('src/server/browser-keeper.js', k5dir, 'env-dir'), 'ctl-dir');
    ok(c5.cmdX && c5.cmdX.status !== 0 && c5.cmdY && c5.cmdY.status !== 0 && c5.refused.length === 2 && c5.launches.length === 1, `⑤ CONTROL: a keeper copy that hands the lease the DIRECTORY (the pre-fix env) — both sessions' commands die on the lock (${c5.refused.length} SingletonLock refusals): the legs above can go red`, c5);
  } else ok(false, '⑤ CONTROL (directory env): the anchor was not found in src/server/browser-keeper.js');
  const k5view = k5src.replace("    if (starting.has(p.id)) { try { await starting.get(p.id); } catch { /* its own verdict */ } }\n    if (!reg.browsers[p.id] || reg.browsers[p.id].state !== 'ready') return", "    try { await start(p.id, { why: 'live view' }); } catch (e) { return { ok: false, port: null, code: e.code || 'launch_failed', error: String(e.message || e) }; }\n    if (!reg.browsers[p.id] || reg.browsers[p.id].state !== 'ready') return");
  if (k5view !== k5src) {
    const c6 = await legOf(M5.load('src/server/browser-keeper.js', k5view, 'view-starts'), 'ctl-view');
    ok(c6.launchesByView === 1 && c6.stateAfterView === 'ready', `⑤ CONTROL: a keeper copy whose view STARTS a stopped browser (P2's old rule) relaunches it (${c6.launchesByView} launch) — the finding-3 leg can go red`, { launchesByView: c6.launchesByView, state: c6.stateAfterView, view: c6.viewStopped });
  } else ok(false, '⑤ CONTROL (a view starts): the anchor was not found in src/server/browser-keeper.js');
  const k5view2 = k5src.replace("const cdp = await rt.cdpUrl(ns, { dir: p.dir, extraEnv: { ...launchEnv, ...vendorEnv } });", "const cdp = await rt.cdpUrl(ns, { dir: p.dir });");
  if (k5view2 !== k5src) {
    const c7 = await legOf(M5.load('src/server/browser-keeper.js', k5view2, 'cdp-no-view'), 'ctl-lview');
    ok(c7.restarts && c7.restarts.length >= 1 && c7.recPidAlive === false, `⑤ CONTROL: a keeper copy whose own \`get cdp-url\` drops the launch's idle value restarts its daemon (${(c7.restarts || []).length} restart(s)) and records a pid that is already dead — the launch-view leg can go red`, { restarts: c7.restarts, recPidAlive: c7.recPidAlive });
  } else ok(false, '⑤ CONTROL (launch view): the anchor was not found in src/server/browser-keeper.js');
  for (const r of copiesCensus(M5.files, M5.dir, REPO, { minCopies: 3, label: '⑤ ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
}

// ═══ ⑥ LANE H VERIFY r2 + r3 (2026-09-25): THE KEEPER ENDS THE CHROME ITS DEAD DAEMON LEFT BEHIND ═══════════════
// M1 (measured on the real 0.38.1): `kill -9` of a daemon (a crash, an OOM — and what stop() itself does after its close
// grace) leaves its Chrome ALIVE, reparented, still holding `<dir>/SingletonLock -> <host>-<pid>` and DevToolsActivePort;
// the tick marked the record stopped knowing only the daemon's pid, and the relaunch under the same env died "Chrome
// exited early (exit code: 21)" — the owner's "bank never starts" from a second path; an ephemeral's orphan just leaked
// (19 on this box, ≈3 GB). r3 (measured on the real 0.38.1, five shapes): the daemon survives its Chrome's death (the user
// closing a headed window / a crash) and its NEXT VERB relaunches Chrome IN THE SAME DAEMON — a new pid, a new lock and
// DevToolsActivePort, and without a profile a NEW temp user-data-dir (the old one removed) — so the record made at launch
// goes stale; and the Chrome's environ carries NO AGENT_BROWSER_* (the binary scrubs it), so "its environment names our
// namespace" never witnessed a real Chrome: after a daemon SIGKILL the relaunched Chrome was never ended and a named
// profile answered `profile_locked … it may be the user's own browser` FOREVER. THIS fake models all of it: per-(ns,
// session) daemons that are real node processes, each launching a "chrome" child with a SCRUBBED env (`env: {PATH}`),
// that writes the lock + DevToolsActivePort and outlives a SIGKILLed daemon; in FAKE_RESPAWN mode a verb on a live daemon
// whose chrome is dead makes THAT daemon relaunch one (a new temp dir when it has no profile); a launch on a dir whose
// lock names a LIVE pid is refused with the binary's exit-21 text.
// L4 + r3 LOW 3: a recycled pid (alive, another starttime) is not the daemon; neither is a pid whose record carries no
// starttime on a machine that reads every other one — a view of it is refused, the CLI never asked.
console.log('— ⑥ r2/r3: the keeper ends the Chrome its dead daemon left behind — recorded at launch, RE-CAPTURED when the daemon relaunches it, else proven by the directory the keeper minted; anything else is profile_locked by name');
{
  const os = require('os');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const R6 = path.join(ROOT, 'orphan'); const BIN6 = path.join(R6, 'bin'), ST6 = path.join(R6, 'ab'), HOME6 = path.join(R6, 'home'), HOME6S = path.join(R6, 'home with space');
  for (const d of [BIN6, ST6, path.join(HOME6, '.agent-browser'), path.join(HOME6S, '.agent-browser')]) fs.mkdirSync(d, { recursive: true });
  const UDD = "'--user-'+'data-dir='";   // never spelled whole inside the child's own code (its /proc cmdline carries the code)
  const CHROME_SRC = `const fs=require('fs'),path=require('path'),os=require('os');const k=${UDD};const udd=(process.argv.find((a)=>a.startsWith(k))||'').slice(k.length);const L=path.join(udd,'SingletonLock');try{fs.unlinkSync(L)}catch{}fs.symlinkSync(os.hostname()+'-'+process.pid,L);fs.writeFileSync(path.join(udd,'DevToolsActivePort'),String(30000+process.pid%20000)+'\\n/devtools/browser/'+process.pid+'-'+Date.now()+'\\n');const ttl=process.env.FAKE_CHROME_TTL;if(ttl!==undefined&&ttl!==''){setTimeout(()=>process.exit(0),Number(ttl));}setInterval(()=>{},1e9);`;
  // r5: FAKE_CHROME_TTL = the chrome dies N ms after writing its lock (a crash-on-load profile, a window the user keeps
  // closing, an OOM) — the only variable the daemon passes on besides PATH (never an AGENT_BROWSER_* key)
  // the daemon: its chrome runs with a SCRUBBED env (`{PATH}` — the real binary's child carries no AGENT_BROWSER_*); SIGUSR2
  // relaunches a dead chrome IN THIS daemon (FAKE_TEMP: a NEW temp dir, the old one removed when its chrome exits — 0.38.1's)
  // r4: the chrome is launched the way the real 0.38.1 launches it — `--remote-debugging-port=0` plus the `args` of the
  // config the launching call named (so a keeper launch carries its MARK, measured on the real binary); FAKE_SHAPE=helper
  // puts a NON-EXEC wrapper between the daemon and the chrome (its argv carries the chrome's flags — verify r4 LOW 4)
  const DAEMON_SRC = `const {spawn}=require('child_process'),fs=require('fs'),path=require('path');const temp=process.env.FAKE_TEMP==='1';let cur=null,dir=process.env.FAKE_UDD;let cfgArgs=[];try{const cf=JSON.parse(fs.readFileSync(process.env.AGENT_BROWSER_CONFIG,'utf8'));const a=cf&&cf.args;cfgArgs=Array.isArray(a)?a.map(String):(typeof a==='string'?a.split(/[,\\n]/).map((x)=>x.trim()).filter(Boolean):[]);}catch{}const go=()=>{if(temp&&cur)dir=fs.mkdtempSync(path.join(process.env.FAKE_AB_STATE,'agent-browser-chrome-'));const d0=dir;const args=['--',${UDD}+d0,'--headless=new','--remote-debugging-port=0',...cfgArgs];let c;if(process.env.FAKE_SHAPE==='helper'){c=spawn(process.execPath,['-e',process.env.FAKE_HELPER_SRC,...args],{stdio:'ignore',env:{PATH:process.env.PATH,FAKE_CHROME_SRC:process.env.FAKE_CHROME_SRC,FAKE_CHROME_PIDFILE:process.env.FAKE_CHROME_PIDFILE}});fs.writeFileSync(process.env.FAKE_CHROME_PIDFILE+'.helper',String(c.pid));}else{c=spawn(process.execPath,['-e',process.env.FAKE_CHROME_SRC,...args],{stdio:'ignore',env:{PATH:process.env.PATH,...(process.env.FAKE_CHROME_TTL?{FAKE_CHROME_TTL:process.env.FAKE_CHROME_TTL}:{})}});fs.writeFileSync(process.env.FAKE_CHROME_PIDFILE,String(c.pid));}cur=c;c.on('exit',()=>{if(temp){try{fs.rmSync(d0,{recursive:true,force:true})}catch{}}});};process.on('SIGUSR2',()=>{if(!cur||cur.exitCode!==null||cur.signalCode!==null)go();});go();setInterval(()=>{},1e9);`;
  // the NON-EXEC wrapper (r4 LOW 4, the verifier's p4-H shape): its own argv names the dir; the chrome is its child
  const HELPER_SRC = `const {spawn}=require('child_process');const c=spawn(process.execPath,['-e',process.env.FAKE_CHROME_SRC,'--',...process.argv.slice(1)],{stdio:'ignore',env:{PATH:process.env.PATH}});require('fs').writeFileSync(process.env.FAKE_CHROME_PIDFILE,String(c.pid));setInterval(()=>{},1e9);`;
  fs.writeFileSync(path.join(BIN6, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
const prof = process.env.AGENT_BROWSER_PROFILE || null;
const f = path.join(st, ns + '__' + sess + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const log = (n, o) => fs.appendFileSync(path.join(st, n), JSON.stringify(o) + '\\n');
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
const lockOf = (d) => { try { const t = fs.readlinkSync(path.join(d, 'SingletonLock')); const m = /^(.*)-(\\d+)$/.exec(t); return m ? { host: m[1], pid: Number(m[2]) } : null; } catch { return null; } };
const chromeNow = () => { try { return Number(fs.readFileSync(f + '.chrome', 'utf8')) || null; } catch { return null; } };
const uddOf = (pid) => { const k = '--user-' + 'data-dir='; try { const e = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\\0').find((x) => x.startsWith(k)); return e ? e.slice(k.length) : null; } catch { return null; } };
const respawn = (s, by) => {
  const c0 = chromeNow();
  if (c0 && alive(c0)) return;
  process.kill(s.pid, 'SIGUSR2');
  let c1 = null;
  for (let i = 0; i < 300; i++) { pause(10); const n = chromeNow(); const d = n && n !== c0 && alive(n) ? uddOf(n) : null; const l = d ? lockOf(d) : null; if (l && l.pid === n) { c1 = n; break; } }
  log('relaunches.log', { ns, sess, by, daemon: s.pid, from: c0, chrome: c1, dir: c1 ? uddOf(c1) : null });
};
const daemon = (by) => {
  let s = read();
  if (s && alive(s.pid)) {
    // FAKE_RESPAWN (0.38.1): a verb on a live daemon whose Chrome died relaunches one IN THAT DAEMON (same daemon pid)
    if (process.env.FAKE_RESPAWN === '1') respawn(s, by);
    return s;
  }
  const dir = prof || fs.mkdtempSync(path.join(st, 'agent-browser-chrome-'));
  if (prof) { const l = lockOf(prof); if (l && alive(l.pid)) { log('refused.log', { ns, sess, by, dir: prof, holder: l.pid }); return { refused: 'Chrome exited early (exit code: 21) without writing DevToolsActivePort\\nFailed to create ' + prof + '/SingletonLock: File exists (17)' }; } if (l) { try { fs.unlinkSync(path.join(prof, 'SingletonLock')); } catch { } } }
  const pidfile = f + '.chrome';
  try { fs.unlinkSync(pidfile); } catch { }
  const c = spawn(process.execPath, ['-e', ${JSON.stringify(DAEMON_SRC)}], { detached: true, stdio: 'ignore', env: { ...process.env, AGENT_BROWSER_DAEMON: '1', FAKE_UDD: dir, FAKE_TEMP: prof ? '0' : '1', FAKE_CHROME_SRC: ${JSON.stringify(CHROME_SRC)}, FAKE_HELPER_SRC: ${JSON.stringify(HELPER_SRC)}, FAKE_CHROME_PIDFILE: pidfile } });
  c.unref();
  for (let i = 0; i < 200 && !lockOf(dir); i++) pause(15);   // the real binary returns once its Chrome is up
  let chrome = chromeNow();
  s = { pid: c.pid, dir, chrome }; fs.writeFileSync(f, JSON.stringify(s));
  log('launches.log', { ns, sess, by, dir, pid: c.pid, chrome, idle: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || null, config: process.env.AGENT_BROWSER_CONFIG || null });
  return s;
};
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { if (process.env.FAKE_KILL_ON_INFO === '1' && fs.existsSync(path.join(st, 'info-kill-armed'))) { const k0 = chromeNow(); if (k0 && alive(k0)) { try { process.kill(k0, 'SIGKILL'); } catch { } for (let i = 0; i < 200 && alive(k0); i++) pause(5); log('killed.log', { ns, by: 'session info', chrome: k0 }); } } const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: sess, socketDir: path.join(st, ns, 'run') } }); process.exit(0); }
// r4 (measured on 0.38.1): \`get cdp-url\` on a live daemon whose Chrome is dead RELAUNCHES it in that daemon (161 ms) — the heal
// r5: every ask is logged (cdp.log — a heal's relaunch ATTEMPT is one); FAKE_CDP_FAIL (armed by <state>/cdp-fail-armed) =
// the binary's own failure ("Chrome exited early") with no relaunch; FAKE_DIE_AFTER_ANSWER (armed by <state>/die-armed) =
// the relaunched chrome dies right AFTER the url is answered (the heal's recapture then finds no process — the wipe)
if (a === 'get' && b === 'cdp-url') { const s = read(); log('cdp.log', { ns, sess }); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } if (process.env.FAKE_CDP_FAIL === '1' && fs.existsSync(path.join(st, 'cdp-fail-armed'))) { log('cdpfail.log', { ns, sess }); out({ success: false, error: 'fake: Chrome exited early (exit code: 1) without writing DevToolsActivePort' }); process.exit(1); } if (process.env.FAKE_NO_RESPAWN !== '1') respawn(s, 'get cdp-url'); const cn = chromeNow(); if (!(cn && alive(cn))) { out({ success: false, error: 'fake: the browser did not start' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19888/devtools/browser/fake-' + ns + '-' + cn } }); if (process.env.FAKE_DIE_AFTER_ANSWER === '1' && fs.existsSync(path.join(st, 'die-armed'))) { try { process.kill(cn, 'SIGKILL'); } catch { } for (let i = 0; i < 200 && alive(cn); i++) pause(5); log('killed.log', { ns, by: 'get cdp-url', chrome: cn }); } process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } const cn = chromeNow() || (s && s.chrome); if (cn) { try { process.kill(cn, 'SIGTERM'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'stream' && b === 'status') { log('stream.log', { ns, sess }); const s = daemon('stream status'); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } out({ success: true, data: { enabled: true, connected: false, port: 22000 + (sess.length * 7) % 900, screencasting: false } }); process.exit(0); }
if (['open', 'snapshot', 'click'].includes(a)) { const s = daemon(a); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } log('cmds.log', { verb: a, ns, sess }); out({ success: true, data: { ok: true } }); process.exit(0); }
out({ success: false, error: 'fake: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const PATH6 = `${BIN6}:${path.dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}`;
  const env6 = { PATH: PATH6, HOME: HOME6, FAKE_AB_STATE: ST6 };
  const log6 = (n) => { try { return fs.readFileSync(path.join(ST6, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const clear6 = () => { for (const n of ['launches.log', 'refused.log', 'stream.log', 'cmds.log', 'relaunches.log', 'cdp.log', 'cdpfail.log', 'killed.log', 'die-armed', 'cdp-fail-armed', 'info-kill-armed']) { try { fs.unlinkSync(path.join(ST6, n)); } catch { } } };
  const arm6 = (n, on = true) => { const f = path.join(ST6, n); if (on) fs.writeFileSync(f, '1'); else { try { fs.unlinkSync(f); } catch { } } };
  // every process this section starts carries ST6 in its environ (the fake's env) or R6 in its cmdline (a scrubbed chrome
  // names its --user-data-dir under R6) — ended by that evidence on exit
  const mine6 = () => fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map(Number).filter((pid) => pid !== process.pid && (() => { try { return fs.readFileSync(`/proc/${pid}/environ`, 'latin1').includes(ST6) || fs.readFileSync(`/proc/${pid}/cmdline`, 'latin1').includes(R6); } catch { return false; } })());
  const killAll6 = () => { for (const pid of mine6()) { try { process.kill(pid, 'SIGKILL'); } catch { } } };
  process.on('exit', killAll6);
  const waitGone = async (pid, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms && alive(pid)) await sleep(25); return !alive(pid); };
  const logs6 = [];
  const mk6 = (Kmod, tag, live6, home = HOME6, extra = {}, opts = {}) => { const e = { ...env6, HOME: home, ...extra }; return Kmod.create({ dataDir: path.join(R6, 'data-' + tag), homeDir: home, env: () => e, serverSetting: (x) => settings[x], liveKeys: () => live6, runtime: F.createBrowserRuntime({ env: e }), facts: F.createBrowserFacts({ env: e }), log: { log: (m) => logs6.push(String(m)), warn: (m) => logs6.push(String(m)), error() { } }, install: false, ...opts }); };
  const readLock = (d) => { try { const t = fs.readlinkSync(path.join(d, 'SingletonLock')); return Number((/-(\d+)$/.exec(t) || [])[1]) || null; } catch { return null; } };
  const devtools = (d) => { try { return fs.readFileSync(path.join(d, 'DevToolsActivePort'), 'utf8'); } catch { return null; } };
  const envKeysOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter((kv) => kv.startsWith('AGENT_BROWSER_')).map((kv) => kv.split('=')[0]); } catch { return null; } };
  /** A verb run by hand under a session's pairs (the agent's next command) — FAKE_RESPAWN: the daemon relaunches its dead chrome. */
  const verb6 = (pairEnv, home = HOME6) => new Promise((resolve) => execFile(path.join(BIN6, 'agent-browser'), ['open', 'about:blank'], { env: { ...env6, HOME: home, ...pairEnv, FAKE_RESPAWN: '1' }, encoding: 'utf8', timeout: 20000 }, (err, so, se) => resolve({ ok: !err, out: String(so || '') + String(se || '') })));
  // r4: the browsers on a directory (a /proc scan: a --user-data-dir naming it, never a renderer), their parents, their argv
  const chromesOn6 = (dir) => fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map(Number).filter((pid) => { try { const c = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); return c.split('\0').includes('--user-data-dir=' + dir) && !/(?:^|\0)--type=/.test(c); } catch { return false; } });
  const ppidOf6 = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); } catch { return null; } };
  const argvOf6 = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); } catch { return []; } };
  /** "The human": a chrome started BY HAND on a directory — no daemon, no --remote-debugging-port, no launch mark
   *  (`extra` adds argv: the pre-mark CLI shape / another record's mark). Its parent is this suite (a shell's stand-in). */
  const human6 = async (dir, extra = []) => { const h = spawn(process.execPath, ['-e', CHROME_SRC, '--', '--user-data-dir=' + dir, '--headless=new', ...extra], { stdio: 'ignore', env: { PATH: PATH6, HOME: HOME6, FAKE_MARK: ST6 } }); for (let i = 0; i < 150 && readLock(dir) !== h.pid; i++) await sleep(20); return h; };
  const cdpOf6 = (env) => (Array.isArray(env) ? (env.find((kv) => kv.startsWith('AGENT_BROWSER_CDP=')) || '') : '').slice('AGENT_BROWSER_CDP='.length);

  // (a) a NAMED profile: the daemon dies (SIGKILL), its Chrome stays holding the lock — the tick ends it; the relaunch runs.
  //     r3 MINOR 2: the SAME leg under a home directory whose path has a SPACE (M1 was inert there: `\S+` truncated the dir)
  const namedLeg = async (Kmod, tag, home = HOME6) => {
    clear6();
    const kk = mk6(Kmod, tag, new Set(), home);
    const bank = kk.createProfile({ label: 'Bank ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag, dir: bank.dir };
    try {
      await kk.start(bank.id, { why: 'test' });
      const rec = kk.browserOf(bank.id);
      r.recorded = rec.browser || null;
      r.chrome = (log6('launches.log')[0] || {}).chrome || null;
      r.chromeEnv = envKeysOf(r.chrome);
      r.dt0 = devtools(bank.dir);
      process.kill(rec.pid, 'SIGKILL'); await waitGone(rec.pid);
      r.orphanAliveAfterKill = alive(r.chrome) && readLock(bank.dir) === r.chrome;
      logs6.length = 0;
      await kk.tick();
      r.state = kk.browserOf(bank.id).state;
      r.orphanGoneAfterTick = await waitGone(r.chrome, 2500);
      r.said = logs6.filter((l) => /orphan/i.test(l) && l.includes(String(r.chrome)));
      try { await kk.start(bank.id, { why: 'test again' }); r.restarted = kk.browserOf(bank.id).state; } catch (e) { r.restartErr = (e.code || '') + ' ' + e.message; }
      r.launches = log6('launches.log').length; r.refused = log6('refused.log').length; r.dt1 = devtools(bank.dir);
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const a6 = await namedLeg(K, 'real');
  ok(!a6.threw && a6.recorded && a6.recorded.pid === a6.chrome && Number.isFinite(a6.recorded.starttime) && a6.recorded.dir && a6.orphanAliveAfterKill, `⑥ M1: a named profile's start RECORDS its browser (the daemon's child ${a6.chrome} on the profile dir, pid + starttime) — and a SIGKILLed daemon leaves it alive, holding the lock`, a6);
  ok(Array.isArray(a6.chromeEnv) && a6.chromeEnv.length === 0, `⑥ r3: the fake's chrome runs with a SCRUBBED environment (no AGENT_BROWSER_* — the real 0.38.1 child's), so no leg below can pass on a namespace witness`, a6.chromeEnv);
  ok(a6.state === 'stopped' && a6.orphanGoneAfterTick && a6.said.length >= 1, `⑥ M1: the tick that sees the daemon gone records it stopped AND ends its own orphaned browser (pid ${a6.chrome}), said in the journal`, { state: a6.state, gone: a6.orphanGoneAfterTick, said: a6.said });
  ok(a6.restarted === 'ready' && a6.launches === 2 && a6.refused === 0 && a6.dt1 && a6.dt1 !== a6.dt0, `⑥ M1: the next start launches on the profile dir with NO exit-21 refusal (${a6.launches} launches, ${a6.refused} refused) and a NEW DevToolsActivePort`, { restarted: a6.restarted, err: a6.restartErr, launches: a6.launches, refused: a6.refused });
  const s6 = await namedLeg(K, 'space', HOME6S);
  ok(!s6.threw && / /.test(s6.dir) && s6.recorded && s6.recorded.pid === s6.chrome && s6.recorded.dir === s6.dir && s6.orphanAliveAfterKill && s6.state === 'stopped' && s6.orphanGoneAfterTick && s6.restarted === 'ready' && s6.refused === 0 && s6.launches === 2, `⑥ r3 MINOR 2: under a home directory WITH A SPACE (${JSON.stringify(s6.dir)}) the browser is recorded with its whole directory, its orphan ended by the tick and the relaunch runs (${s6.refused} exit-21 refusals, ${s6.launches} launches)`, s6);
  // (b) the SAME orphan with nothing recorded (a record written before the capture, or one an upgrade found): the start's
  //     own lock check proves it — its --user-data-dir IS the directory this keeper minted (~/.agent-browser/vs-<id>) and
  //     no live browser daemon is its parent (r3: NOT its environment — the real binary scrubs it) — and ends it
  const noRecLeg = async (Kmod, tag) => {
    clear6();
    const kk = mk6(Kmod, tag, new Set());
    const bank = kk.createProfile({ label: 'Pre ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    try {
      await kk.start(bank.id, { why: 'test' });
      const rec = kk.browserOf(bank.id);
      r.chrome = (log6('launches.log')[0] || {}).chrome;
      delete kk._reg().browsers[bank.id].browser;               // no browser identity recorded
      process.kill(rec.pid, 'SIGKILL'); await waitGone(rec.pid);
      rec.state = 'stopped';                                       // …and already recorded stopped
      logs6.length = 0;
      try { await kk.start(bank.id, { why: 'after an unrecorded orphan' }); r.restarted = kk.browserOf(bank.id).state; } catch (e) { r.restartErr = (e.code || '') + ' ' + e.message; }
      r.orphanGone = !alive(r.chrome); r.refused = log6('refused.log').length; r.launches = log6('launches.log').length;
      r.said = logs6.filter((l) => l.includes(String(r.chrome)));
    } catch (e) { r.threw = String(e && e.stack); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const b6 = await noRecLeg(K, 'norec');
  ok(!b6.threw && b6.restarted === 'ready' && b6.orphanGone && b6.refused === 0 && b6.launches === 2 && b6.said.length >= 1 && b6.said.some((l) => /minted|created/.test(l)), `⑥ r3 M1: with NO recorded identity and a SCRUBBED environment the start's lock check proves the holder its own — its --user-data-dir is the directory this keeper minted, no live daemon its parent — ends pid ${b6.chrome} and launches (${b6.refused} exit-21 refusals)`, b6);
  // (b2) r3 MAJOR 1, the verifier's F8: the daemon RELAUNCHED its chrome in place (the user closed the window; the next verb
  //      under the keeper's own pairs), then the daemon is SIGKILLed before anything judged it — the tick ends the
  //      relaunched chrome (the minted directory's lock), and the profile starts again (never profile_locked)
  const respawnLeg = async (Kmod, tag, { judge = null } = {}) => {
    clear6();
    const kk = mk6(Kmod, tag, new Set());
    const bank = kk.createProfile({ label: 'Relaunch ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    try {
      await kk.start(bank.id, { why: 'test' });
      const rec = kk.browserOf(bank.id);
      r.c1 = (rec.browser || {}).pid; r.daemon = rec.pid;
      process.kill(r.c1, 'SIGTERM'); await waitGone(r.c1);
      const v = await verb6({ AGENT_BROWSER_NAMESPACE: rec.ns, AGENT_BROWSER_SESSION: rec.ns, AGENT_BROWSER_PROFILE: bank.dir, AGENT_BROWSER_IDLE_TIMEOUT_MS: '0' });
      const rl = log6('relaunches.log').pop() || {};
      r.c2 = rl.chrome; r.sameDaemon = rl.daemon === r.daemon && alive(r.daemon); r.verbOk = v.ok; r.c2Env = envKeysOf(r.c2);
      r.dt2 = devtools(bank.dir);
      if (judge === 'tick') { r.cdpBefore = kk.browserOf(bank.id).cdpUrl; await kk.tick(); r.recordAfterJudge = (kk.browserOf(bank.id).browser || {}).pid || null; r.cdpAfterJudge = kk.browserOf(bank.id).cdpUrl; }
      process.kill(r.daemon, 'SIGKILL'); await waitGone(r.daemon);
      r.c2AliveAfterKill = alive(r.c2);
      logs6.length = 0;
      await kk.tick();
      r.state = kk.browserOf(bank.id).state;
      r.c2GoneAfterTick = await waitGone(r.c2, 2500);
      r.said = logs6.filter((l) => l.includes(String(r.c2)));
      try { await kk.start(bank.id, { why: 'after the relaunched chrome' }); r.restarted = kk.browserOf(bank.id).state; } catch (e) { r.restartErr = (e.code || '') + ' ' + e.message; }
      r.refused = log6('refused.log').length; r.dt3 = devtools(bank.dir);
    } catch (e) { r.threw = String(e && e.stack); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const f6 = await respawnLeg(K, 'relaunch');
  ok(!f6.threw && f6.verbOk && f6.sameDaemon && f6.c2 && f6.c2 !== f6.c1 && Array.isArray(f6.c2Env) && f6.c2Env.length === 0 && f6.c2AliveAfterKill, `⑥ r3 M1 (the 0.38.1 shape): after its chrome ${f6.c1} died the next verb relaunched chrome ${f6.c2} IN THE SAME DAEMON ${f6.daemon} (scrubbed env), and a SIGKILL of that daemon leaves it alive`, f6);
  ok(f6.state === 'stopped' && f6.c2GoneAfterTick && f6.said.length >= 1 && f6.restarted === 'ready' && f6.refused === 0 && f6.dt3 && f6.dt3 !== f6.dt2, `⑥ r3 M1: the tick ends the RELAUNCHED chrome ${f6.c2} (nothing recorded it — the minted directory's lock proves it) and the profile starts again with a NEW DevToolsActivePort — never profile_locked (${f6.restartErr || 'ok'})`, f6);
  const g6 = await respawnLeg(K, 'recapture', { judge: 'tick' });
  ok(!g6.threw && g6.recordAfterJudge === g6.c2 && g6.c2GoneAfterTick && g6.restarted === 'ready' && g6.said.some((l) => /recorded|re-captured/.test(l)), `⑥ r3 M1 (a): a tick while the daemon is provably ours RE-CAPTURES the relaunched chrome (record ${g6.c1} → ${g6.recordAfterJudge}), so its end after the daemon's SIGKILL is by recorded identity`, g6);
  ok(String(g6.cdpBefore || '').endsWith('-' + g6.c1) && String(g6.cdpAfterJudge || '').endsWith('-' + g6.c2), `⑥ r3 M1 (a): …and the profile's CDP url follows the relaunched chrome (re-asked under the keeper's own session: ${String(g6.cdpBefore).split('/').pop()} → ${String(g6.cdpAfterJudge).split('/').pop()}) — a lease never dials the dead one`, g6);
  // (c) a holder the keeper CANNOT prove its own (a human's Chrome on a directory VibeSpace never minted — an ADOPTED
  //     one) — refused `profile_locked` BY NAME, naming the pid and saying it may be the user's; never signalled
  {
    const kk = mk6(K, 'foreign', new Set());
    const own = path.join(R6, 'my chrome profile'); fs.mkdirSync(own, { recursive: true });
    const adopted = kk.adoptDirectory({ label: 'Human', dir: own, owner: { kind: 'instance', id: null } });
    const bank = adopted.profile;
    const human = spawn(process.execPath, ['-e', CHROME_SRC, '--', '--user-data-dir=' + bank.dir, '--headless=new'], { stdio: 'ignore', env: { PATH: PATH6, HOME: HOME6, FAKE_MARK: ST6 } });
    for (let i = 0; i < 100 && readLock(bank.dir) !== human.pid; i++) await sleep(20);
    let err = null; try { await kk.start(bank.id, { why: 'test' }); } catch (e) { err = e; }
    ok(err && err.code === 'profile_locked' && err.message.includes(String(human.pid)) && /may be the user's|it may be theirs/.test(err.message) && !/exit code: 21/.test(err.message) && alive(human.pid) && log6('refused.log').filter((x) => x.dir === bank.dir).length === 0, `⑥ M1: a lock held on a directory VibeSpace never minted (an adopted one: a human's Chrome) is refused \`profile_locked\` naming pid ${human.pid} and saying it may be the user's — never signalled, never the raw exit 21, nothing launched`, err ? err.code + ' ' + err.message : 'no refusal');
    // r3: on a MINTED directory a holder whose parent is a LIVE browser daemon is refused too — by what holds it, never "the user's"
    const bank2 = kk.createProfile({ label: 'Held' }, { owner: { kind: 'instance', id: null } });
    const held = await verb6({ AGENT_BROWSER_NAMESPACE: 'vs-other', AGENT_BROWSER_SESSION: 'vs-other', AGENT_BROWSER_PROFILE: bank2.dir });
    const heldBy = readLock(bank2.dir);
    let err2 = null; try { await kk.start(bank2.id, { why: 'test' }); } catch (e) { err2 = e; }
    ok(held.ok && heldBy && err2 && err2.code === 'profile_locked' && err2.message.includes(String(heldBy)) && /live browser daemon/.test(err2.message) && !/may be the user's|it may be theirs/.test(err2.message) && alive(heldBy), `⑥ r3: a minted directory held by a Chrome whose LIVE daemon parents it (pid ${heldBy}) is refused profile_locked naming what holds it — "may be the user's" is said ONLY for a directory VibeSpace never minted`, err2 ? err2.message : 'no refusal');
    try { human.kill('SIGKILL'); } catch { }
    kk.shutdown(); killAll6();
  }
  // (c2) VERIFY r4 MAJOR 2 — a Chrome THE HUMAN opened on the directory the keeper MINTED (~/.agent-browser/vs-<id>) was
  //      ended on three paths (r3's rule: "the directory is minted" alone). Ownership is proven by the keeper's LAUNCH MARK
  //      on the process's command line (the config every keeper launch runs with carries `--vibespace-keeper=<id>`), never by
  //      the directory: A — the profile stopped, the human opens it, the agent's next start is REFUSED by name and the
  //      human's chrome lives; closed by hand ⇒ the start runs. B — the daemon alive, its chrome gone, the human opens the
  //      dir: the leased tick does not race it (no relaunch), an attach is refused naming it; the daemon SIGKILLed ⇒ the
  //      tick records it stopped and REPORTS the holder, alive. C — the same, then stop(idle): alive.
  const mintedHumanLeg = async (Kmod, tag) => {
    clear6();
    const KEYM = 'bk-0000c201';
    const kk = mk6(Kmod, tag, new Set([KEYM]));
    const bank = kk.createProfile({ label: 'Minted ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag, minted: bank.dir === path.join(HOME6, '.agent-browser', 'vs-' + bank.id) };
    const humans = [];
    try {
      await kk.start(bank.id, { why: 'own launch' });
      const own = (kk.browserOf(bank.id).browser || {}).pid;
      r.ownArgv = argvOf6(own).filter((a) => a.startsWith('--'));
      r.ownMarked = r.ownArgv.includes(B.keeperMarkArg(bank.id)) && r.ownArgv.includes('--remote-debugging-port=0');
      await kk.stop(bank.id);
      // A
      const hA = await human6(bank.dir); humans.push(hA);
      const l0 = log6('launches.log').length;
      logs6.length = 0;
      try { await kk.start(bank.id, { why: 'the agent\'s next verb' }); r.startedA = true; } catch (e) { r.errA = (e.code || '') + ' ' + e.message; }
      await sleep(150);
      r.humanAliveA = alive(hA.pid); r.launchedA = log6('launches.log').length - l0; r.humanPidA = hA.pid;
      try { hA.kill('SIGKILL'); } catch { } await waitGone(hA.pid);
      try { await kk.start(bank.id, { why: 'after the human closed it' }); r.afterClose = kk.browserOf(bank.id).state; } catch (e) { r.afterCloseErr = (e.code || '') + ' ' + e.message; }
      // B
      await kk.attach({ profileId: bank.id, browserKey: KEYM, sessionId: 'sess-m' });
      const recB = kk.browserOf(bank.id); const cB = (recB.browser || {}).pid;
      process.kill(cB, 'SIGTERM'); await waitGone(cB);
      const hB = await human6(bank.dir); humans.push(hB);
      const rl0 = log6('relaunches.log').length;
      await kk.tick();
      r.relaunchedB = log6('relaunches.log').length - rl0; r.humanAliveB1 = alive(hB.pid);
      try { await kk.attach({ profileId: bank.id, browserKey: KEYM, sessionId: 'sess-m' }); r.attachB = 'ok'; } catch (e) { r.attachB = (e.code || '') + ' ' + e.message; }
      process.kill(recB.pid, 'SIGKILL'); await waitGone(recB.pid);
      logs6.length = 0;
      await kk.tick(); await sleep(150);
      r.stateB = kk.browserOf(bank.id).state; r.humanAliveB2 = alive(hB.pid); r.saidB = logs6.filter((l) => l.includes(String(hB.pid)));
      try { hB.kill('SIGKILL'); } catch { } await waitGone(hB.pid);
      // C
      await kk.start(bank.id, { why: 'c' });
      const recC = kk.browserOf(bank.id); const cC = (recC.browser || {}).pid;
      process.kill(cC, 'SIGTERM'); await waitGone(cC);
      const hC = await human6(bank.dir); humans.push(hC);
      await kk.stop(bank.id, { why: 'idle' }); await sleep(150);
      r.stateC = kk.browserOf(bank.id).state; r.humanAliveC = alive(hC.pid);
    } catch (e) { r.threw = String(e && e.stack); }
    for (const h of humans) { try { h.kill('SIGKILL'); } catch { } }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const m6 = await mintedHumanLeg(K, 'major2');
  ok(!m6.threw && m6.minted && m6.ownMarked, `⑥ r4 MAJOR 2: the keeper's OWN launch on the minted directory carries its launch mark (${B.keeperMarkArg('<id>')}) beside the CLI's --remote-debugging-port=0 — the config's args reach the chrome, as on the real 0.38.1`, m6.ownArgv);
  ok(!m6.startedA && /^profile_locked /.test(m6.errA || '') && m6.errA.includes(String(m6.humanPidA)) && /may be your own browser — close it first/.test(m6.errA) && m6.humanAliveA && m6.launchedA === 0, `⑥ r4 MAJOR 2 (A): the profile stopped, a chrome the HUMAN opened on the MINTED directory (no mark) — the agent's next start is refused profile_locked naming pid ${m6.humanPidA} ("it may be your own browser — close it first"), nothing launched, the human's chrome ALIVE`, m6);
  ok(m6.afterClose === 'ready', `⑥ r4 MAJOR 2 (A): …closed by hand ⇒ the start runs (${m6.afterClose || m6.afterCloseErr})`, m6);
  ok(m6.relaunchedB === 0 && m6.humanAliveB1 && /^profile_locked /.test(m6.attachB || '') && /may be your own browser/.test(m6.attachB), `⑥ r4 MAJOR 2 (B): its chrome gone and the human's now on the directory — the leased tick does NOT relaunch over it (${m6.relaunchedB} relaunches) and an attach is refused by name (${String(m6.attachB).slice(0, 90)})`, m6);
  ok(m6.stateB === 'stopped' && m6.humanAliveB2 && m6.saidB.some((l) => /left running/.test(l)), `⑥ r4 MAJOR 2 (B): the daemon SIGKILLed — the tick records it stopped and REPORTS the holder (left running, said once), never signals it`, m6);
  ok(m6.stateC === 'stopped' && m6.humanAliveC, `⑥ r4 MAJOR 2 (C): stop(idle) with the human's chrome on the directory — stopped, the human's chrome ALIVE`, m6);
  // (c3) the PRE-MARK fallback (the upgrade window): a chrome the browser CLI launched before the mark existed (its
  //      --remote-debugging-port=0, no mark) orphaned on a minted directory is still the keeper's own — ended, the start
  //      runs; a chrome carrying ANOTHER record's mark is VibeSpace's but not this record's — refused, never "the user's"
  {
    clear6();
    const kk = mk6(K, 'premark', new Set());
    const bank = kk.createProfile({ label: 'Premark' }, { owner: { kind: 'instance', id: null } });
    const pre = await human6(bank.dir, ['--remote-debugging-port=0']);
    let e1 = null; try { await kk.start(bank.id, { why: 'after a pre-mark orphan' }); } catch (e) { e1 = e; }
    const preGone = await waitGone(pre.pid, 2500);
    ok(!e1 && preGone && kk.browserOf(bank.id).state === 'ready' && logs6.some((l) => l.includes(String(pre.pid)) && /before the launch mark/.test(l)), `⑥ r4 MAJOR 2: a PRE-MARK launch (the CLI's --remote-debugging-port=0, no mark) orphaned on the minted directory is still the keeper's own — pid ${pre.pid} ended, the start runs`, e1 ? e1.message : kk.browserOf(bank.id).state);
    await kk.stop(bank.id).catch(() => { });
    const other = await human6(bank.dir, ['--remote-debugging-port=0', B.keeperMarkArg('bp-0ther0ne')]);
    let e2 = null; try { await kk.start(bank.id, { why: 'another record\'s chrome' }); } catch (e) { e2 = e; }
    ok(e2 && e2.code === 'profile_locked' && e2.message.includes(String(other.pid)) && /another VibeSpace browser/.test(e2.message) && !/may be your own/.test(e2.message) && alive(other.pid), `⑥ r4 MAJOR 2: a chrome carrying ANOTHER record's mark is refused naming it ("another VibeSpace browser") — never ended, never called the user's`, e2 ? e2.message : 'no refusal');
    try { pre.kill('SIGKILL'); other.kill('SIGKILL'); } catch { }
    kk.shutdown(); killAll6();
  }
  // (h) VERIFY r4 MAJOR 1 — after a named profile's chrome dies (the user closing a headed window, a crash) the daemon LIVES
  //     with no browser; agents run under their LEASE's session over AGENT_BROWSER_CDP (a CDP client cannot launch), so
  //     nothing relaunched it: `ready` on a dead port for the rest of the conversation. The keeper HEALS where the absence is
  //     seen — its own `get cdp-url` relaunches the chrome in THAT daemon — at the tick (while leased), a start / an attach,
  //     a view's port; the lease's next /resolve carries the NEW url. An UNLEASED profile is not relaunched by the tick (no
  //     window reappears for nobody) — its next start heals it.
  const healLeg = async (Kmod, tag, { via = 'tick' } = {}) => {
    clear6();
    const KEYH = { tick: 'bk-0000c301', attach: 'bk-0000c302', view: 'bk-0000c303', unleased: 'bk-0000c304' }[via] || 'bk-0000c309';
    const kk = mk6(Kmod, tag, new Set([KEYH]));
    const bank = kk.createProfile({ label: 'Heal ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag, via };
    try {
      let a1 = null;
      if (via === 'unleased') await kk.start(bank.id, { why: 'no lease' });
      else a1 = await kk.attach({ profileId: bank.id, browserKey: KEYH, sessionId: 'sess-h' });
      const rec = kk.browserOf(bank.id);
      r.daemon = rec.pid; r.c1 = (rec.browser || {}).pid; r.cdp1 = a1 ? cdpOf6(a1.env) : rec.cdpUrl; r.dt1 = devtools(bank.dir);
      process.kill(r.c1, 'SIGTERM'); await waitGone(r.c1);
      logs6.length = 0;
      if (via === 'tick' || via === 'unleased') await kk.tick();
      else if (via === 'attach') r.a2 = await kk.attach({ profileId: bank.id, browserKey: KEYH, sessionId: 'sess-h' });
      else r.view = await kk.streamPortFor(S.streamTargetFor({ browserKey: KEYH, set: kk.setFor(KEYH), profiles: kk.list().profiles }));
      r.afterJudge = chromesOn6(bank.dir);
      if (via === 'unleased') { r.startNext = await kk.start(bank.id, { why: 'the next verb' }).then(() => 'ok', (e) => e.message); r.afterStart = chromesOn6(bank.dir); }
      const now6 = chromesOn6(bank.dir);
      r.c2 = now6[0] || null; r.count = now6.length; r.ppid = r.c2 ? ppidOf6(r.c2) : null;
      r.sameDaemon = kk.browserOf(bank.id).pid === r.daemon && alive(r.daemon);
      r.recorded = (kk.browserOf(bank.id).browser || {}).pid || null;
      r.cdpRec = kk.browserOf(bank.id).cdpUrl; r.dt2 = devtools(bank.dir);
      r.c2Marked = r.c2 ? argvOf6(r.c2).includes(B.keeperMarkArg(bank.id)) : false;
      if (via !== 'unleased') { const a3 = await kk.attach({ profileId: bank.id, browserKey: KEYH, sessionId: 'sess-h' }); r.cdp3 = cdpOf6(a3.env); }
      r.said = logs6.filter((l) => /started again/.test(l));
      r.state = kk.browserOf(bank.id).state;
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const healed = {};
  for (const via of ['tick', 'attach', 'view']) {
    const h = healed[via] = await healLeg(K, 'heal-' + via, { via });
    ok(!h.threw && h.state === 'ready' && h.count === 1 && h.c2 && h.c2 !== h.c1 && h.ppid === h.daemon && h.sameDaemon && h.recorded === h.c2 && h.c2Marked && h.dt2 && h.dt2 !== h.dt1 && String(h.cdpRec || '').endsWith('-' + h.c2) && String(h.cdp3 || '').endsWith('-' + h.c2) && h.said.length >= 1 && (via !== 'view' || (h.view && h.view.ok)), `⑥ r4 MAJOR 1 via ${via === 'tick' ? 'the tick (leased)' : via === 'attach' ? 'an attach alone' : 'a view\'s port'}: its chrome ${h.c1} SIGTERMed, the daemon ${h.daemon} alive — the keeper heals: ONE chrome ${h.c2} (ppid = the daemon, marked), a NEW DevToolsActivePort, the record + the lease's next /resolve carry the NEW url`, h);
  }
  const hu = await healLeg(K, 'heal-unleased', { via: 'unleased' });
  ok(!hu.threw && hu.afterJudge.length === 0 && hu.startNext === 'ok' && hu.count === 1 && hu.ppid === hu.daemon && hu.recorded === hu.c2, `⑥ r4 MAJOR 1: an UNLEASED profile is NOT relaunched by the tick (${hu.afterJudge.length} chromes after it — no window reappears for nobody); its next start heals it (one chrome ${hu.c2} under daemon ${hu.daemon})`, hu);
  // (k) VERIFY r5 MAJOR 1 — THE HEAL IS EVIDENCE-BOUND AND BUDGETED. r4's heal remembered nothing but the failed-heal gate
  //     (`rec.closed`) and cleared its evidence after every answer: (a) a chrome that dies ~1 s after every relaunch was
  //     relaunched on EVERY tick, forever (the verifier: 12/12 real ticks, ≈600 CPU-s/h, `ready`, no notice); (b) a chrome
  //     that died before the recapture left `ready` + no browser + no verdict — nothing healed it again and an attach handed
  //     out the dead url (the r4 dead lease, reached through the fix), the same at a START. Now a PERSISTED ledger per record:
  //     HEAL_BUDGET relaunches in HEAL_WINDOW_MS ⇒ `browser_unstable` + ONE For-you notice (origin browser); no identified
  //     browser after a heal / a start ⇒ `browser_closed` by name, retried through the 30 s gate (a verb at once).
  const inbox6 = () => { const items = []; return { items, store: { add: (key, item) => { items.push({ key, ...item }); return { id: 'ut-' + items.length, ...item }; } } }; };
  const cdpN = () => log6('cdp.log').length;
  const relaunchN = () => log6('relaunches.log').filter((x) => x.by === 'get cdp-url' && x.chrome).length;
  const recOf6 = (kk, id) => { const x = kk.browserOf(id) || {}; return { state: x.state, browser: x.browser ? x.browser.pid : null, closed: x.closed ? x.closed.code : null, lost: !!x.browserLost, text: x.closed ? x.closed.error : '' }; };
  const stormLeg = async (Kmod, tag) => {
    clear6();
    const KEYS = tag === 'storm' ? 'bk-0000c501' : 'bk-0000c502';
    const ib = inbox6();
    const kk = mk6(Kmod, tag, new Set([KEYS]), HOME6, { FAKE_CHROME_TTL: '1200' }, { userTodos: ib.store });
    const bank = kk.createProfile({ label: 'Storm ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag, label: 'Storm ' + tag, perTick: [] };
    try {
      await kk.attach({ profileId: bank.id, browserKey: KEYS, sessionId: 'sess-s' });
      r.c1 = (kk.browserOf(bank.id).browser || {}).pid || null;
      logs6.length = 0;
      for (let i = 0; i < 6; i++) { await sleep(1400); await kk.tick(); const x = recOf6(kk, bank.id); r.perTick.push(`${relaunchN()}:${x.closed || '-'}`); }
      r.relaunches = relaunchN(); r.cdp = cdpN();
      Object.assign(r, { rec: recOf6(kk, bank.id) });
      r.ledger = kk.browserOf(bank.id).heals || null;
      r.journal = logs6.length;
      r.notices = ib.items.map((x) => ({ key: x.key, origin: x.origin, kind: x.kind, text: x.text, detail: x.detail }));
      try { await kk.attach({ profileId: bank.id, browserKey: KEYS, sessionId: 'sess-s' }); r.attach = 'ok'; } catch (e) { r.attach = (e.code || '') + ' ' + e.message; }
      await kk.tick();
      r.relaunchesAfter = relaunchN(); r.noticesAfter = ib.items.length;
      // a Stop from the panel ends the record — the next start begins with a NEW ledger
      await kk.stop(bank.id, { why: 'user' });
      await kk.attach({ profileId: bank.id, browserKey: KEYS, sessionId: 'sess-s' });
      const y = kk.browserOf(bank.id);
      r.afterStop = { state: y.state, closed: y.closed ? y.closed.code : null, attempts: y.heals && Array.isArray(y.heals.attempts) ? y.heals.attempts.length : 0, browser: !!y.browser };
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const k1 = await stormLeg(K, 'storm');
  ok(!k1.threw && k1.relaunches === B.HEAL_BUDGET && k1.rec && k1.rec.closed === 'browser_unstable' && k1.rec.state === 'ready' && !k1.rec.browser && k1.ledger && Array.isArray(k1.ledger.attempts) && k1.ledger.attempts.length === B.HEAL_BUDGET && k1.ledger.lastOutcome === 'unstable', `⑥ r5 MAJOR 1 (a) THE STORM: a chrome that dies 1.2 s after every relaunch, six leased ticks — ${k1.relaunches} relaunches (the budget, ${B.HEAL_BUDGET} in ${B.HEAL_WINDOW_MS / 60000} min), then \`${k1.rec && k1.rec.closed}\`, the ledger persisted on the record (${k1.perTick.join(' ')})`, k1);
  ok(!k1.threw && k1.notices.length === 1 && k1.notices[0].key === 'browser' && k1.notices[0].origin === 'browser' && k1.notices[0].kind === 'notice' && k1.notices[0].text.includes(k1.label) && k1.notices[0].text.includes(String(B.HEAL_BUDGET)) && /Stop/.test(k1.notices[0].detail || ''), `⑥ r5 MAJOR 1 (a): ONE For-you notice (origin browser) naming the profile and the count — "${k1.notices[0] ? k1.notices[0].text : ''}"`, k1.notices);
  ok(!k1.threw && /^browser_unstable /.test(k1.attach || '') && /Browser panel/.test(k1.attach) && k1.relaunchesAfter === k1.relaunches && k1.noticesAfter === 1 && k1.journal <= 12, `⑥ r5 MAJOR 1 (a): an attach while unstable is refused by name (${String(k1.attach).slice(0, 90)}…), the next tick relaunches nothing and files no second notice; ${k1.journal} journal lines over the whole storm (never a line per tick forever)`, k1);
  ok(!k1.threw && k1.afterStop && k1.afterStop.state === 'ready' && !k1.afterStop.closed && k1.afterStop.attempts === 0 && k1.afterStop.browser, '⑥ r5 MAJOR 1 (a): a Stop from the panel ends the record — the next start runs with a NEW ledger (0 attempts, no verdict)', k1.afterStop);
  const wipeLeg = async (Kmod, tag) => {
    clear6();
    const KEYW = tag === 'wipe' ? 'bk-0000c503' : 'bk-0000c504';
    const kk = mk6(Kmod, tag, new Set([KEYW]), HOME6, { FAKE_DIE_AFTER_ANSWER: '1' });
    const bank = kk.createProfile({ label: 'Wipe ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    try {
      await kk.attach({ profileId: bank.id, browserKey: KEYW, sessionId: 'sess-w' });
      r.c1 = (kk.browserOf(bank.id).browser || {}).pid;
      arm6('die-armed');
      process.kill(r.c1, 'SIGTERM'); await waitGone(r.c1);
      const n0 = cdpN();
      await kk.tick();
      r.t1 = recOf6(kk, bank.id); r.cdpT1 = cdpN() - n0; r.killed = log6('killed.log').length;
      await kk.tick(); await kk.tick();
      r.cdpGate = cdpN() - n0; r.t3 = recOf6(kk, bank.id);
      try { const a = await kk.attach({ profileId: bank.id, browserKey: KEYW, sessionId: 'sess-w' }); r.attach1 = 'ok ' + cdpOf6(a.env); } catch (e) { r.attach1 = (e.code || '') + ' ' + e.message; }
      r.cdpAttach1 = cdpN() - n0;
      arm6('die-armed', false);
      try { const a = await kk.attach({ profileId: bank.id, browserKey: KEYW, sessionId: 'sess-w' }); r.attach2 = 'ok'; r.cdp2 = cdpOf6(a.env); } catch (e) { r.attach2 = (e.code || '') + ' ' + e.message; }
      r.cdpAttach2 = cdpN() - n0; r.after = recOf6(kk, bank.id); r.chromes = chromesOn6(bank.dir);
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const k2 = await wipeLeg(K, 'wipe');
  ok(!k2.threw && k2.cdpT1 === 1 && k2.killed === 1 && k2.t1.state === 'ready' && !k2.t1.browser && k2.t1.closed === 'browser_closed' && k2.t1.lost && /died before/.test(k2.t1.text), `⑥ r5 MAJOR 1 (b) THE WIPE: the healed chrome died right after its url was answered — the record is NOT a success: \`${k2.t1.closed}\` by name, the loss kept (never "ready, no browser, no verdict")`, k2);
  ok(!k2.threw && k2.cdpGate === 1 && k2.t3.closed === 'browser_closed' && /^browser_closed /.test(k2.attach1 || '') && k2.cdpAttach1 === 2, `⑥ r5 MAJOR 1 (b): the next two ticks are inside the 30 s gate (${k2.cdpGate} attempt), and an attach retries at once and is REFUSED by name (${String(k2.attach1).slice(0, 70)}…) — never the dead url`, k2);
  ok(!k2.threw && k2.attach2 === 'ok' && k2.cdpAttach2 === 3 && k2.chromes.length === 1 && k2.after.browser === k2.chromes[0] && !k2.after.closed && String(k2.cdp2 || '').endsWith('-' + k2.chromes[0]), `⑥ r5 MAJOR 1 (b): …the next verb heals once — ONE chrome ${k2.chromes[0]} recorded, its url handed out`, k2);
  const birthLeg = async (Kmod, tag) => {
    clear6();
    const KEYB = tag === 'birth' ? 'bk-0000c505' : 'bk-0000c506';
    const kk = mk6(Kmod, tag, new Set([KEYB]), HOME6, { FAKE_DIE_AFTER_ANSWER: '1', FAKE_KILL_ON_INFO: '1' });
    const bank = kk.createProfile({ label: 'Birth ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    try {
      arm6('info-kill-armed'); arm6('die-armed');
      try { const a = await kk.attach({ profileId: bank.id, browserKey: KEYB, sessionId: 'sess-b' }); r.attach1 = 'ok ' + cdpOf6(a.env); } catch (e) { r.attach1 = (e.code || '') + ' ' + e.message; }
      r.rec1 = recOf6(kk, bank.id); r.killed = log6('killed.log').map((x) => x.by);
      arm6('info-kill-armed', false); arm6('die-armed', false);
      const n0 = cdpN();
      await kk.tick(); r.cdpTick = cdpN() - n0;
      try { const a = await kk.attach({ profileId: bank.id, browserKey: KEYB, sessionId: 'sess-b' }); r.attach2 = 'ok'; r.cdp2 = cdpOf6(a.env); } catch (e) { r.attach2 = (e.code || '') + ' ' + e.message; }
      r.cdpAttach2 = cdpN() - n0; r.rec2 = recOf6(kk, bank.id); r.chromes = chromesOn6(bank.dir);
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const k3 = await birthLeg(K, 'birth');
  ok(!k3.threw && k3.killed.includes('session info') && k3.killed.includes('get cdp-url') && /^browser_closed /.test(k3.attach1 || '') && k3.rec1.state === 'ready' && !k3.rec1.browser && k3.rec1.closed === 'browser_closed' && k3.rec1.lost, `⑥ r5 MAJOR 1 (iii) AT A START: its chrome died before the capture (and the one \`get cdp-url\` relaunched, right after its answer) — the start's record is \`${k3.rec1.closed}\`, the attach REFUSED by name (${String(k3.attach1).slice(0, 60)}…), never a dead url`, k3);
  ok(!k3.threw && k3.cdpTick === 0 && k3.attach2 === 'ok' && k3.cdpAttach2 === 1 && k3.chromes.length === 1 && k3.rec2.browser === k3.chromes[0] && !k3.rec2.closed && String(k3.cdp2 || '').endsWith('-' + k3.chromes[0]), `⑥ r5 MAJOR 1 (iii): the tick inside the gate asks nothing; the next verb heals once (ONE chrome ${k3.chromes[0]}, recorded)`, k3);
  // (k2) r5 LOW 4 — the failed heal's pins: `browser_closed`, ONE relaunch attempt per HEAL_RETRY_MS on the tick, a verb at once
  const gateLeg = async (Kmod, tag) => {
    clear6();
    const KEYG = tag === 'gate' ? 'bk-0000c507' : 'bk-0000c508';
    const skew = { v: 0 };
    const ib = inbox6();
    const kk = mk6(Kmod, tag, new Set([KEYG]), HOME6, { FAKE_CDP_FAIL: '1' }, { now: () => Date.now() + skew.v, userTodos: ib.store });
    const bank = kk.createProfile({ label: 'Gate ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    const fails = () => log6('cdpfail.log').length;
    try {
      await kk.attach({ profileId: bank.id, browserKey: KEYG, sessionId: 'sess-g' });
      r.c1 = (kk.browserOf(bank.id).browser || {}).pid;
      arm6('cdp-fail-armed');
      process.kill(r.c1, 'SIGTERM'); await waitGone(r.c1);
      await kk.tick(); r.a1 = fails(); r.t1 = recOf6(kk, bank.id);
      for (let i = 0; i < 3; i++) await kk.tick();
      r.a2 = fails();
      try { await kk.attach({ profileId: bank.id, browserKey: KEYG, sessionId: 'sess-g' }); r.attach = 'ok'; } catch (e) { r.attach = (e.code || '') + ' ' + e.message; }
      r.a3 = fails();
      // r6 MINOR 1: past the gate FOUR more times with the binary still refusing — each ask failed and started nothing, so
      // none is a relaunch: never `browser_unstable` from the relaunch count, no "closed each time" notice; then a BURST of
      // commands (each retries at once) past the failed-ask COUNT but inside its SPAN — still `browser_closed`
      r.ext = [];
      for (let i = 0; i < 4; i++) { skew.v += B.HEAL_RETRY_MS + 1000; await kk.tick(); const x = recOf6(kk, bank.id); r.ext.push(`${fails()}:${x.closed || '-'}`); }
      r.a4 = fails();
      for (let i = 0; i < 8; i++) { try { await kk.attach({ profileId: bank.id, browserKey: KEYG, sessionId: 'sess-g' }); r.burst = 'ok'; } catch (e) { r.burst = (e.code || '') + ' ' + e.message; } }
      r.a5 = fails(); r.t5 = recOf6(kk, bank.id);
      const L5 = kk.browserOf(bank.id).heals || {};
      r.ledger5 = { attempts: Array.isArray(L5.attempts) ? L5.attempts.length : -1, failed: L5.failed || null };
      r.notices = ib.items.map((x) => x.text + ' || ' + x.detail);
      skew.v += B.HEAL_RETRY_MS + 1000; arm6('cdp-fail-armed', false);
      await kk.tick(); r.after = recOf6(kk, bank.id); r.chromes = chromesOn6(bank.dir);
      const L6 = kk.browserOf(bank.id).heals || {};
      r.ledger6 = { attempts: Array.isArray(L6.attempts) ? L6.attempts.length : -1, failed: L6.failed || null };
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const k4 = await gateLeg(K, 'gate');
  ok(!k4.threw && k4.a1 === 1 && k4.t1.closed === 'browser_closed' && /relaunch|no CDP url/.test(k4.t1.text) && /Browser panel/.test(k4.t1.text) && k4.a2 === 1, `⑥ r5 LOW 4: the relaunch FAILS at the binary — \`${k4.t1.closed}\` by name; three more ticks inside HEAL_RETRY_MS make ${k4.a2 - k4.a1} attempts (one per ${B.HEAL_RETRY_MS / 1000} s on the tick)`, k4);
  ok(!k4.threw && /^browser_closed /.test(k4.attach || '') && k4.a3 === 2 && k4.after.browser && k4.chromes.length === 1 && k4.after.browser === k4.chromes[0] && !k4.after.closed, `⑥ r5 LOW 4: a verb retries AT ONCE and is refused by name (${String(k4.attach).slice(0, 60)}…); ${B.HEAL_RETRY_MS / 1000} s after the close the tick tries again and heals (ONE chrome ${k4.chromes[0]})`, k4);
  // (k7) VERIFY r6 MINOR 1 — a FAILED relaunch ask is not a relaunch. r5 counted the attempt BEFORE `get cdp-url`, so three
  //     asks the binary refused ("Chrome exited early", nothing started) spent the budget in 93 s and the profile was
  //     `browser_unstable` with words describing a browser that "closed each time" — a transient fault (the binary
  //     mid-reinstall, the folder unreadable, a full disk) turned a self-retrying state into a manual Stop. Now only a relaunch
  //     whose url ANSWERED is an attempt; a failed ask keeps the 30 s gate and its OWN streak: HEAL_FAIL_BUDGET of them
  //     spanning HEAL_FAIL_SPAN_MS ⇒ `browser_unstable` in its own words ("could not be started").
  ok(!k4.threw && k4.a4 === k4.a3 + 4 && k4.ext.length === 4 && k4.ext.every((x) => /:browser_closed$/.test(x)) && k4.ledger5.attempts === 0 && k4.notices.length === 0, `⑥ r6 MINOR 1: past the gate four more times with the binary refusing — ${k4.a4 - k4.a3} more asks, every one \`browser_closed\` (${k4.ext.join(' ')}), never \`browser_unstable\`: a failed ask started nothing and is no relaunch (${k4.ledger5.attempts} in the ledger), ${k4.notices.length} "closed each time" notices`, k4);
  ok(!k4.threw && k4.a5 === k4.a4 + 8 && k4.a5 >= (B.HEAL_FAIL_BUDGET || 10) && k4.t5.closed === 'browser_closed' && k4.notices.length === 0 && k4.ledger5.failed && k4.ledger5.failed.count === k4.a5, `⑥ r6 MINOR 1: a burst of 8 commands (each retries at once) takes the streak to ${k4.a5} failed asks (≥ ${B.HEAL_FAIL_BUDGET}) inside ${Math.round((B.HEAL_RETRY_MS + 1000) * 4 / 1000)} s — still \`${k4.t5.closed}\`: the failed-ask cap is a count AND a span (${(B.HEAL_FAIL_SPAN_MS || 0) / 1000} s), so a burst during a short fault never spends it`, k4);
  ok(!k4.threw && k4.ledger6.attempts === 1 && !k4.ledger6.failed, `⑥ r6 MINOR 1: the heal whose url answered is the ledger's ONE attempt (${k4.ledger6.attempts}) and it ends the failed streak`, k4.ledger6);
  const failCapLeg = async (Kmod, tag) => {
    clear6();
    const KEYF = tag === 'failcap' ? 'bk-0000c601' : 'bk-0000c602';
    const skew = { v: 0 };
    const ib = inbox6();
    const kk = mk6(Kmod, tag, new Set([KEYF]), HOME6, { FAKE_CDP_FAIL: '1' }, { now: () => Date.now() + skew.v, userTodos: ib.store });
    const bank = kk.createProfile({ label: 'Cap ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag, label: 'Cap ' + tag, perTick: [], unstableAt: null };
    const fails = () => log6('cdpfail.log').length;
    try {
      await kk.attach({ profileId: bank.id, browserKey: KEYF, sessionId: 'sess-f' });
      r.c1 = (kk.browserOf(bank.id).browser || {}).pid;
      arm6('cdp-fail-armed');
      process.kill(r.c1, 'SIGTERM'); await waitGone(r.c1);
      for (let i = 0; i < 12; i++) {
        if (i) skew.v += B.HEAL_RETRY_MS + 1000;
        await kk.tick();
        const x = recOf6(kk, bank.id); r.perTick.push(`${fails()}:${x.closed || '-'}`);
        if (x.closed === 'browser_unstable' && r.unstableAt === null) { r.unstableAt = fails(); r.unstableSkew = skew.v; }
      }
      r.fails = fails(); r.rec = recOf6(kk, bank.id);
      const y0 = kk.browserOf(bank.id);
      r.unstable = y0.closed ? y0.closed.unstable || null : null;
      r.ledger = y0.heals || null;
      r.notices = ib.items.map((x) => ({ key: x.key, origin: x.origin, kind: x.kind, text: x.text, detail: x.detail }));
      try { await kk.attach({ profileId: bank.id, browserKey: KEYF, sessionId: 'sess-f' }); r.attach = 'ok'; } catch (e) { r.attach = (e.code || '') + ' ' + e.message; }
      r.view = await kk.streamPortFor({ ok: true, kind: 'attachment', profileId: bank.id, browserKey: KEYF, sessionName: 'vs-' + KEYF });
      await kk.tick();
      r.failsAfter = fails(); r.noticesAfter = ib.items.length;
      // a Stop from the panel resets it — the next start is a new record with a new ledger
      arm6('cdp-fail-armed', false);
      await kk.stop(bank.id, { why: 'user' });
      await kk.attach({ profileId: bank.id, browserKey: KEYF, sessionId: 'sess-f' });
      const y = kk.browserOf(bank.id);
      r.afterStop = { state: y.state, closed: y.closed ? y.closed.code : null, failed: y.heals ? y.heals.failed || null : null, browser: !!y.browser };
      r.chromes = chromesOn6(bank.dir).length;
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const kfc = await failCapLeg(K, 'failcap');
  ok(!kfc.threw && kfc.unstableAt === B.HEAL_FAIL_BUDGET && kfc.fails === B.HEAL_FAIL_BUDGET && kfc.unstableSkew >= B.HEAL_FAIL_SPAN_MS && kfc.perTick.slice(0, B.HEAL_FAIL_BUDGET - 1).every((x) => /:browser_closed$/.test(x)) && kfc.rec.closed === 'browser_unstable' && kfc.unstable === 'failing' && kfc.ledger && Array.isArray(kfc.ledger.attempts) && kfc.ledger.attempts.length === 0, `⑥ r6 MINOR 1 THE FAILED-ASK CAP: the binary refuses every relaunch ask, the tick asks once per ${B.HEAL_RETRY_MS / 1000} s — \`browser_closed\` for the first ${B.HEAL_FAIL_BUDGET - 1}, \`browser_unstable\` (failing) at the ${B.HEAL_FAIL_BUDGET}th, ${Math.round((kfc.unstableSkew || 0) / 1000)} s after the first (${kfc.perTick.join(' ')}); 0 relaunches in the ledger`, kfc);
  ok(!kfc.threw && /could not be started/.test(kfc.rec.text) && !/closed each time/.test(kfc.rec.text) && !/keeps closing/.test(kfc.rec.text) && /Browser panel/.test(kfc.rec.text) && /^browser_unstable /.test(kfc.attach || '') && /could not be started/.test(kfc.attach) && kfc.view && kfc.view.code === 'browser_unstable' && kfc.view.unstable === 'failing' && kfc.failsAfter === kfc.fails, `⑥ r6 MINOR 1: …in its OWN words — "${String(kfc.rec.text).slice(0, 110)}…" (never "closed each time"); the attach and the view refused by name (the view's status carries unstable: failing), nothing asked after`, kfc);
  ok(!kfc.threw && kfc.notices.length === 1 && kfc.notices[0].key === 'browser' && kfc.notices[0].origin === 'browser' && kfc.notices[0].kind === 'notice' && kfc.notices[0].text.includes(kfc.label) && kfc.notices[0].text.includes(String(B.HEAL_FAIL_BUDGET)) && /could not be started/.test(kfc.notices[0].text) && !/keeps closing/.test(kfc.notices[0].text) && !/closed each time/.test(kfc.notices[0].detail || '') && /Stop/.test(kfc.notices[0].detail || '') && kfc.noticesAfter === 1, `⑥ r6 MINOR 1: ONE For-you notice in those words — "${kfc.notices[0] ? kfc.notices[0].text : ''}"`, kfc.notices);
  ok(!kfc.threw && kfc.afterStop && kfc.afterStop.state === 'ready' && !kfc.afterStop.closed && !kfc.afterStop.failed && kfc.afterStop.browser && kfc.chromes === 1, '⑥ r6 MINOR 1: a Stop from the panel resets it — the next start is a new record, no streak, ONE chrome', kfc.afterStop);
  const cloakLeg = async (Kmod, tag) => {
    clear6();
    const KEYC = tag === 'cloak' ? 'bk-0000c509' : 'bk-0000c50a';
    const kk = mk6(Kmod, tag, new Set([KEYC]));
    const bank = kk.createProfile({ label: 'Cloak ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    try {
      await kk.attach({ profileId: bank.id, browserKey: KEYC, sessionId: 'sess-c' });
      r.c1 = (kk.browserOf(bank.id).browser || {}).pid;
      kk._reg().browsers[bank.id].launchFlags = true;          // launched with a provider's own flags (cloak's executable + seed)
      process.kill(r.c1, 'SIGTERM'); await waitGone(r.c1);
      const n0 = cdpN();
      await kk.tick(); r.t1 = recOf6(kk, bank.id); r.cdp = cdpN() - n0;
      try { await kk.attach({ profileId: bank.id, browserKey: KEYC, sessionId: 'sess-c' }); r.attach = 'ok'; } catch (e) { r.attach = (e.code || '') + ' ' + e.message; }
      r.cdp2 = cdpN() - n0; r.chromes = chromesOn6(bank.dir).length;
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const k5 = await cloakLeg(K, 'cloak');
  ok(!k5.threw && k5.t1.closed === 'browser_closed' && /started again only by a start/.test(k5.t1.text) && /Browser panel/.test(k5.t1.text) && k5.cdp === 0 && /^browser_closed /.test(k5.attach || '') && /Browser panel/.test(k5.attach) && k5.cdp2 === 0 && k5.chromes === 0, `⑥ r5 LOW 4: a browser launched with its provider's own flags (cloak) is NOT relaunched by a bare re-ask — \`browser_closed\` naming the panel, ${k5.cdp + k5.cdp2} CLI asks, ${k5.chromes} chromes`, k5);
  // (k3) r5 MINOR 2 — a VIEW of an UNLEASED profile whose browser was closed never starts it (the tick does not either):
  //      a typed `browser_closed` the view shows; the next command starts it and the digest says it runs again
  const viewLeg = async (Kmod, tag) => {
    clear6();
    const KEYV = tag === 'view' ? 'bk-0000c50b' : 'bk-0000c50c';
    const kk = mk6(Kmod, tag, new Set([KEYV]));
    const bank = kk.createProfile({ label: 'View ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    try {
      await kk.start(bank.id, { why: 'no lease' });
      r.c1 = (kk.browserOf(bank.id).browser || {}).pid;
      process.kill(r.c1, 'SIGTERM'); await waitGone(r.c1);
      await kk.tick(); r.afterTick = chromesOn6(bank.dir).length;
      const n0 = cdpN();
      r.view = await kk.streamPortFor({ ok: true, kind: 'attachment', profileId: bank.id, browserKey: KEYV, sessionName: 'vs-' + KEYV });
      r.afterView = chromesOn6(bank.dir).length; r.cdpView = cdpN() - n0;
      r.running1 = S.viewTargetRunning({ target: { kind: 'attachment', profileId: bank.id }, digest: kk.list() });
      await kk.start(bank.id, { why: 'the next verb' });
      r.afterStart = chromesOn6(bank.dir).length;
      r.running2 = S.viewTargetRunning({ target: { kind: 'attachment', profileId: bank.id }, digest: kk.list() });
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const k6 = await viewLeg(K, 'view');
  ok(!k6.threw && k6.afterTick === 0 && k6.view && !k6.view.ok && k6.view.code === 'browser_closed' && /next browser command starts it/.test(k6.view.error || '') && k6.afterView === 0 && k6.cdpView === 0 && k6.running1 === false, `⑥ r5 MINOR 2: a view of an UNLEASED profile whose browser was closed starts nothing (${k6.afterView} chromes, ${k6.cdpView} CLI asks) — typed \`${k6.view && k6.view.code}\` ("${String(k6.view && k6.view.error).slice(0, 70)}…"), and the digest does not call it running`, k6);
  ok(!k6.threw && k6.afterStart === 1 && k6.running2 === true, `⑥ r5 MINOR 2: …the next command starts it (${k6.afterStart} chrome) and the digest says it runs again — the greyed view resumes then`, k6);
  // (k4) r5 LOW 5 — somebody else's browser held the directory of a LEASED profile: the refusal attempted nothing, so it never
  //      arms the retry gate — the tick after the human closes it heals at once (r4: up to 30 s, the refusal re-armed it)
  const lockGateLeg = async (Kmod, tag) => {
    clear6();
    const KEYL = tag === 'lockgate' ? 'bk-0000c50d' : 'bk-0000c50e';
    const kk = mk6(Kmod, tag, new Set([KEYL]));
    const bank = kk.createProfile({ label: 'Held ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    let h = null;
    try {
      await kk.attach({ profileId: bank.id, browserKey: KEYL, sessionId: 'sess-l' });
      r.c1 = (kk.browserOf(bank.id).browser || {}).pid;
      process.kill(r.c1, 'SIGTERM'); await waitGone(r.c1);
      h = await human6(bank.dir); r.human = h.pid;
      logs6.length = 0;
      await kk.tick(); r.t1 = recOf6(kk, bank.id); r.at1 = (kk.browserOf(bank.id).closed || {}).at;
      await sleep(30); await kk.tick(); r.at2 = (kk.browserOf(bank.id).closed || {}).at;
      r.said = logs6.filter((l) => /NOT started again/.test(l)).length;
      try { h.kill('SIGKILL'); } catch { } await waitGone(h.pid);
      const n0 = cdpN();
      await kk.tick();
      r.after = recOf6(kk, bank.id); r.cdp = cdpN() - n0; r.chromes = chromesOn6(bank.dir);
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { if (h) h.kill('SIGKILL'); } catch { }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const k7 = await lockGateLeg(K, 'lockgate');
  ok(!k7.threw && k7.t1.closed === 'profile_locked' && k7.t1.text.includes(String(k7.human)) && Number.isFinite(k7.at1) && k7.at2 === k7.at1 && k7.said === 1, `⑥ r5 LOW 5: somebody else's browser (pid ${k7.human}) on a leased profile's directory — refused by name, said ONCE, and the close keeps its FIRST time (${k7.at1} → ${k7.at2}: a re-judged refusal never re-writes it)`, k7);
  ok(!k7.threw && k7.cdp === 1 && k7.chromes.length === 1 && k7.after.browser === k7.chromes[0] && !k7.after.closed, `⑥ r5 LOW 5: the human closes it ⇒ the VERY NEXT tick heals (ONE chrome ${k7.chromes[0]}) — the gate counts from a relaunch attempt's close, never from a refusal that attempted nothing`, k7);
  // (k5) r5 LOW 3 — the pre-mark fallback belongs to a record launched BEFORE the mark: a record launched WITH it never adopts
  //      an unmarked `--remote-debugging-port=0` holder (a hand-launched Chrome copying the binary's flag) — not even after a
  //      refused start (the failed record inherits the lineage)
  const premarkLeg = async (tag) => {
    clear6();
    const kk = mk6(K, tag, new Set());
    const bank = kk.createProfile({ label: 'Marked ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    let pre = null;
    try {
      await kk.start(bank.id, { why: 'a marked launch' }); r.mark = kk.browserOf(bank.id).mark; await kk.stop(bank.id);
      pre = await human6(bank.dir, ['--remote-debugging-port=0']); r.pre = pre.pid;
      try { await kk.start(bank.id, { why: 'after a hand-launched pre-mark-shaped chrome' }); r.e1 = 'started'; } catch (e) { r.e1 = (e.code || '') + ' ' + e.message; }
      await sleep(150); r.alive1 = alive(pre.pid);
      try { await kk.start(bank.id, { why: 'again' }); r.e2 = 'started'; } catch (e) { r.e2 = (e.code || '') + ' ' + e.message; }
      await sleep(150); r.alive2 = alive(pre.pid);
      kk._reg().browsers[bank.id].mark = null;                   // the record as one launched BEFORE the mark (the upgrade window)
      try { await kk.start(bank.id, { why: 'a pre-mark record' }); r.e3 = 'started'; } catch (e) { r.e3 = (e.code || '') + ' ' + e.message; }
      r.gone3 = await waitGone(pre.pid, 2500);
    } catch (e) { r.threw = String((e && (e.code || '')) + ' ' + (e && e.stack)); }
    try { if (pre) pre.kill('SIGKILL'); } catch { }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const k8 = await premarkLeg('premark-marked');
  ok(!k8.threw && k8.mark && /^profile_locked /.test(k8.e1 || '') && k8.e1.includes(String(k8.pre)) && /may be your own browser/.test(k8.e1) && k8.alive1 && /^profile_locked /.test(k8.e2 || '') && k8.alive2, `⑥ r5 LOW 3: a record launched WITH the mark (${k8.mark}) never adopts an unmarked --remote-debugging-port=0 chrome (pid ${k8.pre}) — refused "may be your own browser", ALIVE, and again after the refused start`, k8);
  ok(!k8.threw && k8.e3 === 'started' && k8.gone3, `⑥ r5 LOW 3: …a record from BEFORE the mark (mark: null) still ends it and starts (the upgrade window: ${k8.e3})`, k8);
  // (k6) r5 PURE: the budget, the ledger, the words; a greyed view's resume rule; the panel row says so and offers the Stop
  {
    const t0 = 10000000;
    ok(B.HEAL_BUDGET === 3 && B.HEAL_WINDOW_MS === 600000 && B.HEAL_RETRY_MS === 30000, '⑥ r5 PURE: the budget is 3 relaunches in 10 min; a failed heal is retried after 30 s', { b: B.HEAL_BUDGET, w: B.HEAL_WINDOW_MS, r: B.HEAL_RETRY_MS });
    const hv = (att) => (typeof B.healBudgetVerdict === 'function' ? B.healBudgetVerdict({ attempts: att, now: t0 }) : { ok: null });
    ok(hv([]).ok === true && hv([t0 - 1000, t0 - 2000]).ok === true && hv([t0 - 1000, t0 - 2000]).count === 2 && hv([t0 - 1000, t0 - 2000, t0 - 3000]).ok === false && hv([t0 - 1000, t0 - 2000, t0 - 3000]).count === 3 && hv([t0 - 700000, t0 - 650000, t0 - 1000]).ok === true && (hv([t0 - 700000, t0 - 650000, t0 - 1000]).recent || []).length === 1, '⑥ r5 PURE: healBudgetVerdict — 3 relaunches inside the window ⇒ refused; older ones fall out of it (and out of the ledger)');
    const L0 = typeof B.healLedger === 'function' ? B.healLedger({ attempts: [1, 'x', -5, 2e12, null], lastOutcome: 7, noticedAt: 'no' }) : null;
    ok(L0 && JSON.stringify(L0.attempts) === JSON.stringify([1, 2e12]) && L0.lastOutcome === null && L0.noticedAt === null && JSON.stringify(B.healLedger(null)) === JSON.stringify({ attempts: [], lastOutcome: null, noticedAt: null, unstableCount: null, failed: null, unstableKind: null, unstableSpanMs: null }), '⑥ r5 PURE: healLedger keeps only finite positive attempt times and drops garbage (a hand-edited store never throws)', L0);
    const ut = typeof B.unstableText === 'function' ? B.unstableText({ label: 'Bank', count: 3, windowMs: 600000 }) : '';
    ok(/"Bank"/.test(ut) && /3 times in 10 min/.test(ut) && /Browser panel/.test(ut) && /Stop/.test(ut), '⑥ r5 PURE: the unstable refusal names the profile, the count and the way out', ut);
    // r6 MINOR 1 PURE: the failed-ask streak, its cap (a count AND a span) and its own words
    ok(B.HEAL_FAIL_BUDGET === 10 && B.HEAL_FAIL_SPAN_MS === 9 * B.HEAL_RETRY_MS, '⑥ r6 PURE: the failed-ask cap is 10 asks spanning 4.5 min (what ten tick-paced asks take)', { b: B.HEAL_FAIL_BUDGET, s: B.HEAL_FAIL_SPAN_MS });
    const fav = (failed, now) => (typeof B.failedAskVerdict === 'function' ? B.failedAskVerdict({ failed, now }) : { ok: null });
    ok(fav(null, t0).ok === true && fav({ count: 9, since: t0 - 600000 }, t0).ok === true && fav({ count: 10, since: t0 - 269999 }, t0).ok === true && fav({ count: 30, since: t0 - 1000 }, t0).ok === true && fav({ count: 10, since: t0 - 270000 }, t0).ok === false && fav({ count: 10, since: t0 - 270000 }, t0).code === 'browser_unstable' && fav({ count: 10, since: t0 - 270000 }, t0).spanMs === 270000, '⑥ r6 PURE: failedAskVerdict — 10 failed asks spanning ≥ 4.5 min ⇒ refused; fewer, or a burst inside the span, keeps asking');
    const L1 = typeof B.healLedger === 'function' ? B.healLedger({ failed: { count: 4, since: 5 }, unstableKind: 'failing', unstableSpanMs: 280000 }) : null;
    ok(L1 && L1.failed && L1.failed.count === 4 && L1.failed.since === 5 && L1.unstableKind === 'failing' && L1.unstableSpanMs === 280000 && B.healLedger({ failed: { count: 0, since: 5 } }).failed === null && B.healLedger({ failed: 'x', unstableKind: 'boom' }).failed === null && B.healLedger({ unstableKind: 'boom' }).unstableKind === null, '⑥ r6 PURE: healLedger keeps the failed streak {count, since} and the unstable kind, drops garbage', L1);
    const uf = typeof B.unstableText === 'function' ? B.unstableText({ label: 'Bank', count: 10, kind: 'failing', spanMs: 280000 }) : '';
    ok(/"Bank"/.test(uf) && /could not be started/.test(uf) && /10 times in 5 min/.test(uf) && !/closed each time/.test(uf) && !/keeps closing/.test(uf) && /Browser panel/.test(uf) && /Stop/.test(uf) && B.unstableText({ label: 'Bank', count: 3, windowMs: 600000 }) === ut, '⑥ r6 PURE: the failing refusal has its own words (never "closed each time"); the closing one is unchanged', uf);
    const nf = typeof B.unstableNotice === 'function' ? B.unstableNotice({ label: 'Bank', count: 10, kind: 'failing', spanMs: 280000 }) : {};
    const nc = typeof B.unstableNotice === 'function' ? B.unstableNotice({ label: 'Bank', count: 3 }) : {};
    ok(/could not be started/.test(nf.text || '') && /10/.test(nf.text || '') && !/keeps closing/.test(nf.text || '') && !/closed each time/.test(nf.detail || '') && /Stop/.test(nf.detail || '') && /keeps closing/.test(nc.text || '') && /closed each time/.test(nc.detail || ''), '⑥ r6 PURE: the two notices say two different things', { nf, nc });
    const dg = { browsers: { a: { state: 'ready', browser: { pid: 1 } }, b: { state: 'ready', browser: null, closed: { code: 'browser_closed' } }, c: { state: 'ready', browser: null, browserLost: { pid: 1 } }, d: { state: 'ready' }, e: { state: 'ready', browser: null, closed: { code: 'browser_unstable' } } } };
    const vr = (id) => S.viewTargetRunning({ target: { kind: 'attachment', profileId: id }, digest: dg });
    ok(vr('a') === true && vr('b') === false && vr('c') === false && vr('d') === true && vr('e') === false, '⑥ r5 MINOR 2 PURE: a greyed view resumes only when its browser runs again — ready WITH a browser (or one never identifiable), never ready-but-closed / lost / unstable', ['a', 'b', 'c', 'd', 'e'].map(vr));
    const TRc = require('../src/browser-trace.js');
    const hk = TRc.housekeepingVerdict({ profiles: [{ id: 'bp-00000001', label: 'Bank', provider: 'chromium', dir: '/x/vs-bp-00000001' }], leases: [{ profileId: 'bp-00000001', browserKey: 'bk-00000001' }], browsers: { 'bp-00000001': { state: 'ready', browser: null, closed: { code: 'browser_unstable', error: 'x' } } }, now: 1 });
    ok(hk[0] && /keeps closing/.test(hk[0].why || '') && hk[0].browserClosed === 'browser_unstable', '⑥ r5: the Agent browser panel row says the browser keeps closing (not "attached"/"running" alone)', hk[0]);
    const hkf = TRc.housekeepingVerdict({ profiles: [{ id: 'bp-00000001', label: 'Bank', provider: 'chromium', dir: '/x/vs-bp-00000001' }], leases: [{ profileId: 'bp-00000001', browserKey: 'bk-00000001' }], browsers: { 'bp-00000001': { state: 'ready', browser: null, closed: { code: 'browser_unstable', error: 'x', unstable: 'failing' } } }, now: 1 });
    ok(hkf[0] && /could not be started/.test(hkf[0].why || '') && !/keeps closing/.test(hkf[0].why || '') && hkf[0].browserClosed === 'browser_unstable', '⑥ r6: …and a browser whose relaunch asks kept FAILING says it could not be started (never "keeps closing")', hkf[0]);
    const tv = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
    const pr = tv.slice(tv.indexOf('  function profileRow('), tv.indexOf('  function ephemeralRow('));
    ok(/bprof-stop/.test(pr) && /\/stop`/.test(pr) && /r\.live/.test(pr), '⑥ r5: a NAMED profile row carries a Stop while its browser is live — the unstable remedy the notice names is one click', pr.length);
  }
  // (i) VERIFY r4 LOW 4 — a wrapper that does not exec between the daemon and the chrome (its argv carries the chrome's
  //     flags): the record names the LOCK's holder (the chrome), so a daemon SIGKILL ends the chrome — never "ended" the
  //     wrapper while the chrome lived on holding the lock
  const wrapLeg = async (Kmod, tag) => {
    clear6();
    const kk = mk6(Kmod, tag, new Set(), HOME6, { FAKE_SHAPE: 'helper' });
    const bank = kk.createProfile({ label: 'Wrapped ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    try {
      await kk.start(bank.id, { why: 'test' });
      const rec = kk.browserOf(bank.id);
      const st = JSON.parse(fs.readFileSync(path.join(ST6, rec.ns + '__' + rec.ns + '.json'), 'utf8'));
      const pidf = path.join(ST6, rec.ns + '__' + rec.ns + '.json.chrome');
      r.chrome = Number(fs.readFileSync(pidf, 'utf8')); r.helper = Number(fs.readFileSync(pidf + '.helper', 'utf8'));
      r.lockHolder = readLock(bank.dir); r.recorded = (rec.browser || {}).pid; r.daemon = st.pid;
      process.kill(rec.pid, 'SIGKILL'); await waitGone(rec.pid);
      logs6.length = 0;
      await kk.tick();
      r.chromeGone = await waitGone(r.chrome, 2500);
      r.said = logs6.filter((l) => /ended its own orphaned browser/.test(l));
      try { await kk.start(bank.id, { why: 'again' }); r.restarted = kk.browserOf(bank.id).state; } catch (e) { r.restartErr = (e.code || '') + ' ' + e.message; }
    } catch (e) { r.threw = String(e && e.stack); }
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  const w6 = await wrapLeg(K, 'wrap');
  ok(!w6.threw && w6.lockHolder === w6.chrome && w6.recorded === w6.chrome && w6.recorded !== w6.helper && w6.chromeGone && w6.said.some((l) => l.includes(String(w6.chrome))) && !w6.said.some((l) => l.includes('pid ' + w6.helper + ' ')) && w6.restarted === 'ready', `⑥ r4 LOW 4: with a non-exec wrapper (${w6.helper}) between the daemon and the chrome, the record names the LOCK's holder ${w6.chrome}; the daemon SIGKILLed ⇒ the tick ends THAT chrome (the journal names it, never the wrapper) and the profile starts again`, w6);
  // (j) VERIFY r4 LOW 5 — an ephemeral is launched with the idle its session's spawn pairs froze, never the setting NOW
  //     (a live-applied change would make every existing session's next verb restart its browser: the binary compares it)
  const idleLeg = async (Kmod, tag) => {
    clear6();
    const KEYI = tag === 'idle' ? 'bk-0000c401' : 'bk-0000c402';
    const kk = mk6(Kmod, tag, new Set([KEYI]));
    const pairsI = [...B.browserEnvFor({ browserKey: KEYI, variant: B.VARIANTS.N, idleMs: 600000 })];
    const was = settings['browser.idleTimeoutMs'];
    settings['browser.idleTimeoutMs'] = 300000;          // the user changed the setting after this session spawned
    const r = { tag };
    try {
      await kk.ensureEphemeral({ browserKey: KEYI, sessionId: 'sess-i', envPairs: pairsI, sessionName: 'idle' });
      r.launchIdle = (log6('launches.log').filter((x) => x.ns === 'vs-' + KEYI).pop() || {}).idle;
    } catch (e) { r.threw = String(e && e.stack); } finally { settings['browser.idleTimeoutMs'] = was; }
    for (const e of kk.ephemerals()) await kk.stop(e.profileId).catch(() => { });
    kk.shutdown(); killAll6();
    return r;
  };
  const i6 = await idleLeg(K, 'idle');
  ok(!i6.threw && i6.launchIdle === '600000', `⑥ r4 LOW 5: the setting moved to 300000 after the session spawned with 600000 — the keeper launches its ephemeral with the PAIRS' idle (${i6.launchIdle}), so the agent's commands (which carry the pairs) never restart it`, i6);
  // (d) a managed EPHEMERAL (rung N, no profile dir): its browser is recorded from the launch (the binary's temp dir) —
  //     a daemon gone ⇒ the Chrome it left is ended by the same rule
  const ephLeg = async (Kmod, tag) => {
    const KEY6 = tag === 'real' ? 'bk-0000b601' : 'bk-0000b602';
    const kk = mk6(Kmod, tag, new Set([KEY6]));
    const pairs6 = [...B.browserEnvFor({ browserKey: KEY6, variant: B.VARIANTS.N, idleMs: 600000 })];
    const r = { tag };
    try {
      await kk.ensureEphemeral({ browserKey: KEY6, sessionId: 'sess-' + tag, envPairs: pairs6, sessionName: tag });
      const e = kk.ephemeralFor(KEY6); const rec = kk.browserOf(e.profileId);
      r.recorded = rec.browser || null;
      r.chrome = (log6('launches.log').filter((x) => x.ns === 'vs-' + KEY6).pop() || {}).chrome;
      process.kill(rec.pid, 'SIGKILL'); await waitGone(rec.pid);
      r.orphanAlive = alive(r.chrome);
      await kk.tick();
      r.state = kk.browserOf(e.profileId).state;
      r.orphanGone = await waitGone(r.chrome, 2500);
    } catch (err) { r.threw = String(err && err.stack); }
    for (const e of kk.ephemerals()) await kk.stop(e.profileId).catch(() => { });
    kk.shutdown(); killAll6();
    return r;
  };
  const d6 = await ephLeg(K, 'real');
  ok(!d6.threw && d6.recorded && d6.recorded.pid === d6.chrome && /agent-browser-chrome-/.test(d6.recorded.dir || '') && d6.orphanAlive && d6.state === 'stopped' && d6.orphanGone, `⑥ M1: a managed EPHEMERAL's browser is recorded from its launch (pid ${d6.chrome}, the binary's temp dir) and ended when the tick finds its daemon gone`, d6);
  // (d2) r3 MAJOR 1 (a), the invisible leak: an ephemeral's daemon relaunched its chrome in a NEW temp dir (0.38.1) — no
  //      directory the keeper knows names it, so only a RE-CAPTURE while the daemon is provably ours can; each of the
  //      three judges (the tick, a verb's start, a view's port) re-captures it, and the daemon's SIGKILL then ends it
  const ephRespawnLeg = async (Kmod, tag, judge) => {
    clear6();
    const KEYR = { tick: 'bk-0000b611', start: 'bk-0000b612', view: 'bk-0000b613', none: 'bk-0000b615' }[judge] || 'bk-0000b614';
    const kk = mk6(Kmod, tag, new Set([KEYR]));
    const pairsR = [...B.browserEnvFor({ browserKey: KEYR, variant: B.VARIANTS.N, idleMs: 600000 })];
    const r = { tag, judge };
    try {
      await kk.ensureEphemeral({ browserKey: KEYR, sessionId: 'sess-r' + judge, envPairs: pairsR, sessionName: 'r' + judge });
      const e = kk.ephemeralFor(KEYR); const rec = kk.browserOf(e.profileId);
      r.c1 = (rec.browser || {}).pid; r.d1 = (rec.browser || {}).dir; r.daemon = rec.pid;
      process.kill(r.c1, 'SIGTERM'); await waitGone(r.c1);
      await verb6(S.pairsToEnv(pairsR));
      const rl = log6('relaunches.log').pop() || {};
      r.c2 = rl.chrome; r.d2 = rl.dir; r.sameDaemon = rl.daemon === r.daemon;
      if (judge === 'tick') await kk.tick();
      else if (judge === 'start') await kk.ensureEphemeral({ browserKey: KEYR, sessionId: 'sess-r' + judge, envPairs: pairsR, sessionName: 'r' + judge });
      else if (judge === 'view') await kk.streamPortFor(S.streamTargetFor({ browserKey: KEYR, set: kk.setFor(KEYR), profileRef: S.EPHEMERAL_REF, envPairs: pairsR, profiles: kk.list().profiles }));
      r.recorded = kk.browserOf(e.profileId).browser || null;
      r.c2Marked = argvOf6(r.c2).includes(B.keeperMarkArg(KEYR));
      process.kill(r.daemon, 'SIGKILL'); await waitGone(r.daemon);
      r.c2AliveAfterKill = alive(r.c2);
      logs6.length = 0;
      await kk.tick();
      r.state = kk.browserOf(e.profileId).state;
      r.c2Gone = await waitGone(r.c2, 2500);
      r.said = logs6.filter((l) => l.includes(String(r.c2)));
    } catch (err) { r.threw = String(err && err.stack); }
    for (const e of kk.ephemerals()) await kk.stop(e.profileId).catch(() => { });
    kk.shutdown(); killAll6();
    return r;
  };
  for (const judge of ['tick', 'start', 'view']) {
    const h6 = await ephRespawnLeg(K, 'eph-' + judge, judge);
    ok(!h6.threw && h6.sameDaemon && h6.c2 && h6.c2 !== h6.c1 && h6.d2 !== h6.d1 && h6.recorded && h6.recorded.pid === h6.c2 && h6.recorded.dir === h6.d2 && h6.c2AliveAfterKill && h6.state === 'stopped' && h6.c2Gone, `⑥ r3 M1 (a) via ${judge === 'tick' ? 'the tick' : judge === 'start' ? 'a verb\'s start' : 'a view\'s port'}: an ephemeral's in-daemon relaunch (chrome ${h6.c1} → ${h6.c2}, a NEW temp dir) is RE-CAPTURED while the daemon is ours, and ended when the daemon dies`, h6);
  }
  // (d3) VERIFY r4 LOW 3 — the residual the r3 judges left: the daemon SIGKILLed INSIDE the window between the relaunching verb
  //      and any judge (no tick, no start, no view re-captured it) — the relaunched chrome sits in a NEW temp dir nothing
  //      recorded, but its command line carries THIS conversation's launch mark: the tick finds it by the mark and ends it
  const l3 = await ephRespawnLeg(K, 'eph-none', 'none');
  ok(!l3.threw && l3.sameDaemon && l3.c2 && l3.c2 !== l3.c1 && l3.d2 !== l3.d1 && l3.c2Marked && !(l3.recorded && l3.recorded.pid === l3.c2) && l3.c2AliveAfterKill && l3.state === 'stopped' && l3.c2Gone && l3.said.some((x) => /launch mark/.test(x)), `⑥ r4 LOW 3: an ephemeral's chrome relaunched in a NEW temp dir (${l3.c1} → ${l3.c2}) and its daemon SIGKILLed before any judge — nothing recorded it, its command line carries ${B.keeperMarkArg('bk-0000b615')}: the tick ends it by the mark`, l3);
  // (e) L4 + r3 LOW 3: a RECYCLED pid (alive, another starttime) is not the daemon — a view of the ephemeral is refused
  //     browser_stopped without asking the CLI; with NO /proc (every starttime unreadable, macOS) a record is NOT judged
  //     gone (never guessed); but on a machine that reads starttimes, a record that carries NONE is unprovable ⇒ gone
  const recycledLeg = async (Kmod, tag, KEY7) => {
    const kk = mk6(Kmod, tag, new Set([KEY7]));
    const pairs7 = [...B.browserEnvFor({ browserKey: KEY7, variant: B.VARIANTS.N, idleMs: 600000 })];
    await kk.ensureEphemeral({ browserKey: KEY7, sessionId: 'sess-7', envPairs: pairs7, sessionName: 'seven' });
    const e7 = kk.ephemeralFor(KEY7); const rec7 = kk.browserOf(e7.profileId);
    const tgt7 = S.streamTargetFor({ browserKey: KEY7, set: kk.setFor(KEY7), profileRef: S.EPHEMERAL_REF, envPairs: pairs7, profiles: kk.list().profiles });
    const r = { tag };
    const st0 = rec7.starttime;
    // no /proc (macOS): every starttime unreadable — never guessed gone, the view is served
    const realStart = F.procStart, realSame = F.sameProcess;
    rec7.starttime = null; F.procStart = () => null; F.sameProcess = () => false;
    let s0 = log6('stream.log').length;
    try { r.vNoProc = await kk.streamPortFor(tgt7); } finally { F.procStart = realStart; F.sameProcess = realSame; }
    r.askedNoProc = log6('stream.log').length - s0; r.stateNoProc = kk.browserOf(e7.profileId).state;
    // r3 LOW 3: /proc readable, the record has NO starttime, the pid alive (as another process) — two ticks
    F.sameProcess = () => false;
    r.ticks = [];
    try { for (let i = 0; i < 2; i++) { await kk.tick(); r.ticks.push(kk.browserOf(e7.profileId).state); } s0 = log6('stream.log').length; r.vUnrec = await kk.streamPortFor(tgt7); } finally { F.sameProcess = realSame; }
    r.askedUnrec = log6('stream.log').length - s0;
    rec7.starttime = st0;
    for (const e of kk.ephemerals()) await kk.stop(e.profileId).catch(() => { });
    kk.shutdown(); killAll6();
    return r;
  };
  {
    const r7 = await recycledLeg(K, 'unrecorded', 'bk-0000b605');
    ok(r7.vNoProc && r7.vNoProc.ok && r7.askedNoProc === 1 && r7.stateNoProc === 'ready', `⑥ L4: with NO /proc (every starttime unreadable — macOS) a record is not guessed gone: the view is served (${r7.askedNoProc} ask)`, r7);
    ok(r7.ticks[1] === 'stopped' && r7.vUnrec && !r7.vUnrec.ok && r7.vUnrec.code === 'browser_stopped' && r7.askedUnrec === 0, `⑥ r3 LOW 3: on a machine that reads starttimes, a record carrying NONE whose pid is alive (another process) is stopped by the 2nd tick (${r7.ticks.join(' → ')}) and its view refused with ${r7.askedUnrec} CLI asks`, r7);
  }
  // r3 LOW 3, the launch half: a daemon whose starttime cannot be read right after its launch — on a machine that reads
  // starttimes (ours is readable) — is not recorded `ready`: the start answers launch_failed by name
  const launchLeg = async (Kmod, tag) => {
    clear6();
    const kk = mk6(Kmod, tag, new Set());
    const bank = kk.createProfile({ label: 'Unread ' + tag }, { owner: { kind: 'instance', id: null } });
    const r = { tag };
    const realStart = F.procStart;
    F.procStart = (pid) => (pid === process.pid ? realStart(pid) : null);
    try { await kk.start(bank.id, { why: 'test' }); } catch (e) { r.err = (e.code || '') + ' ' + e.message; } finally { F.procStart = realStart; }
    r.state = (kk.browserOf(bank.id) || {}).state; r.lastError = (kk.browserOf(bank.id) || {}).lastError;
    try { await kk.stop(bank.id).catch(() => { }); } catch { }
    kk.shutdown(); killAll6();
    return r;
  };
  {
    const u6 = await launchLeg(K, 'unread');
    ok(u6.state === 'failed' && /^launch_failed /.test(u6.err || '') && /gone right after its launch/.test(u6.lastError || ''), `⑥ r3 LOW 3: a launch whose daemon starttime is unreadable (twice, 50 ms apart) on a machine that reads starttimes is NOT recorded ready — ${u6.state}, "${String(u6.lastError || '').slice(0, 90)}"`, u6);
  }
  {
    const KEY7 = 'bk-0000b603';
    const kk = mk6(K, 'recycled', new Set([KEY7]));
    const pairs7 = [...B.browserEnvFor({ browserKey: KEY7, variant: B.VARIANTS.N, idleMs: 600000 })];
    await kk.ensureEphemeral({ browserKey: KEY7, sessionId: 'sess-7', envPairs: pairs7, sessionName: 'seven' });
    const e7 = kk.ephemeralFor(KEY7);
    const tgt7 = S.streamTargetFor({ browserKey: KEY7, set: kk.setFor(KEY7), profileRef: S.EPHEMERAL_REF, envPairs: pairs7, profiles: kk.list().profiles });
    const realSame = F.sameProcess;
    F.sameProcess = () => false;                                     // the pid is alive but its starttime is ANOTHER process's
    const s1 = log6('stream.log').length;
    let v7; try { v7 = await kk.streamPortFor(tgt7); } finally { F.sameProcess = realSame; }
    const asked7 = log6('stream.log').length - s1;
    ok(v7 && !v7.ok && v7.code === 'browser_stopped' && asked7 === 0 && kk.browserOf(e7.profileId).state === 'stopped', `⑥ L4: a RECYCLED pid (alive, another starttime) is not the daemon — the view is refused browser_stopped with ${asked7} stream.log lines and the record is stopped`, { v7, asked7, state: kk.browserOf(e7.profileId).state });
    for (const e of kk.ephemerals()) await kk.stop(e.profileId).catch(() => { });
    kk.shutdown(); killAll6();
  }
  // THE PURE VERDICTS (src/browser-profiles.js), one row each
  {
    const D = '/home/u/.agent-browser/vs-bp-0000aaaa', NS = 'vs-bp-0000aaaa';
    const h = (x) => ({ pid: 77, alive: true, starttime: 500, cmdline: `/opt/chrome --user-data-dir=${D}/ --headless`, dirs: [D + '/'], namespace: null, parentPid: 3557, parentIsDaemon: false, ...x });
    const V = (x) => B.profileLockVerdict({ lock: { host: 'box', pid: 77 }, hostname: 'box', dir: D, minted: true, recorded: null, holder: h({}), ...x });
    const rows = [
      [B.profileLockVerdict({ lock: null, dir: D }).kind, 'free', 'no lock'],
      [V({ holder: { pid: 77, alive: false } }).kind, 'free', 'a stale lock (its pid is gone — Chrome clears it)'],
      [V({ lock: { host: 'other', pid: 77 } }).kind, 'foreign', 'another machine\'s lock'],
      [V({ holder: h({ cmdline: null, dirs: [] }) }).kind, 'foreign', 'an unreadable process (another uid)'],
      [V({ holder: h({ cmdline: '/usr/bin/sleep 600', dirs: [] }) }).kind, 'free', 'a recycled pid that does not name the directory'],
      [V({}).kind, 'foreign', 'r4 MAJOR 2: the directory the keeper minted, NO launch mark — the human\'s Chrome on our directory (r3 said own-orphan: "minted" alone)'],
      [V({}).user, true, 'r4 MAJOR 2: …and its refusal is the one that says it may be the user\'s'],
      [V({ mark: 'bp-0000aaaa', holder: h({ cmdline: `/opt/chrome --user-data-dir=${D}/ --headless --vibespace-keeper=bp-0000aaaa` }) }).kind, 'own-orphan', 'r4: minted + THIS record\'s launch mark (title-rewritten cmdline), no live daemon parent'],
      [V({ mark: 'bp-0000aaaa', holder: h({ cmdline: `/opt/chrome\0--user-data-dir=${D}\0--vibespace-keeper=bp-0000aaaa\0`, dirs: [D] }) }).kind, 'own-orphan', 'r4: …the NUL-separated form, read exactly'],
      [V({ mark: 'bp-0000aaaa', holder: h({ cmdline: `node\0-e\0x("--vibespace-keeper=bp-0000aaaa")\0--user-data-dir=${D}\0`, dirs: [D] }) }).kind, 'foreign', 'r4: a mark merely MENTIONED inside another argument is none'],
      [V({ mark: 'bp-0000aaaa', minted: false, holder: h({ cmdline: `/opt/chrome --user-data-dir=${D}/ --vibespace-keeper=bp-0000aaaa` }) }).kind, 'own-orphan', 'r4: THIS record\'s mark on an ADOPTED directory is proof too (only the keeper writes it)'],
      [V({ mark: 'bp-0000aaaa', holder: h({ cmdline: `/opt/chrome --user-data-dir=${D}/ --vibespace-keeper=bp-0000bbbb` }) }).kind, 'foreign', 'r4: ANOTHER record\'s mark — VibeSpace\'s, not this record\'s'],
      [V({ mark: 'bp-0000aaaa', holder: h({ cmdline: `/opt/chrome --user-data-dir=${D}/ --vibespace-keeper=bp-0000bbbb` }) }).user, undefined, 'r4: …and never called the user\'s'],
      [V({ mark: 'bp-0000aaaa', holder: h({ cmdline: `/opt/chrome --remote-debugging-port=0 --user-data-dir=${D}/` }) }).kind, 'own-orphan', 'r4: the PRE-MARK CLI launch (--remote-debugging-port=0, no mark) on a minted directory'],
      [V({ mark: 'bp-0000aaaa', minted: false, holder: h({ cmdline: `/opt/chrome --remote-debugging-port=0 --user-data-dir=${D}/` }) }).kind, 'foreign', 'r4: …never on a directory VibeSpace did not mint'],
      [V({ mark: 'bp-0000aaaa', holder: h({ cmdline: `/opt/chrome --user-data-dir=${D}/ --vibespace-keeper=bp-0000aaaa`, parentIsDaemon: true, parentPid: 900, daemonPid: 900 }) }).kind, 'foreign', 'r4: marked, but a live daemon (parent or grandparent) still holds it'],
      [V({ minted: false, recorded: { pid: 77, starttime: 500 } }).kind, 'own-orphan', 'the browser recorded at launch (pid + starttime) on a directory VibeSpace never minted'],
      [V({ minted: false, recorded: { pid: 77, starttime: 499 } }).kind, 'foreign', 'a recorded pid with ANOTHER starttime is not that browser (unminted dir)'],
      [V({ minted: false, holder: h({ namespace: NS }) }).kind, 'foreign', 'r3: a namespace in its environment is NO witness (the real binary scrubs it) — an unminted dir stays foreign'],
      [V({ minted: false }).kind, 'foreign', 'a human\'s Chrome on a directory VibeSpace never minted'],
      [V({ holder: h({ parentIsDaemon: true, parentPid: 900 }) }).kind, 'foreign', 'a live browser daemon still holds it (minted dir)'],
      [B.pidLiveness({ alive: false }), 'gone', 'liveness: dead'],
      [B.pidLiveness({ alive: true, sameStart: true, startKnown: true, startReadable: true }), 'ours', 'liveness: the recorded process'],
      [B.pidLiveness({ alive: true, sameStart: false, startKnown: true, startReadable: true }), 'recycled', 'liveness: alive with ANOTHER starttime'],
      [B.pidLiveness({ alive: true, sameStart: false, startKnown: false, startReadable: true }), 'unrecorded', 'r3 LOW 3: liveness: its starttime readable, the record has none — unprovable'],
      [B.pidLiveness({ alive: true, sameStart: false, startKnown: false, startReadable: false }), 'unknown', 'liveness: no starttime readable at all (never guessed gone)'],
    ];
    const bad = rows.filter(([got, want]) => got !== want);
    ok(!bad.length, `⑥ PURE: profileLockVerdict + pidLiveness, ${rows.length} rows (${rows.map((r) => r[2]).join(' · ')})`, bad);
    const rfU = B.profileLockedRefusal({ label: 'Bank', dir: D, verdict: V({ minted: false }) });
    const rfD = B.profileLockedRefusal({ label: 'Bank', dir: D, verdict: V({ holder: h({ parentIsDaemon: true, parentPid: 900 }) }) });
    ok(rfU.code === 'profile_locked' && rfU.holderPid === 77 && rfU.error.includes('pid 77') && rfU.error.includes(D) && !/exit code/.test(rfU.error) && /may be the user's|it may be theirs/.test(rfU.error), '⑥ PURE: the refusal is `profile_locked`, names the pid and the directory, never the raw exit code — and on a directory VibeSpace never minted says it may be the user\'s', rfU);
    ok(rfD.code === 'profile_locked' && rfD.error.includes('pid 77') && /live browser daemon \(pid 900\)/.test(rfD.error) && !/may be the user's|it may be theirs/.test(rfD.error), '⑥ PURE r3: a minted directory held under a live daemon is refused naming the daemon — never "it may be the user\'s"', rfD);
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // r4 LOW 6: a lock written under ANOTHER hostname names the file and the remedy that exists (a renamed machine)
    const vh = V({ lock: { host: 'old-pod-abc12', pid: 77 } });
    const rh = B.profileLockedRefusal({ label: 'Bank', dir: D, verdict: vh });
    ok(vh.kind === 'foreign' && rh.error.includes('old-pod-abc12') && rh.error.includes(D + '/SingletonLock') && /renamed/.test(rh.error) && /close it there/.test(rh.error), '⑥ PURE r4 LOW 6: a lock naming another hostname says which, and offers the remedy that exists — close it on that machine, or (this machine renamed) remove <dir>/SingletonLock', rh.error);
    // r4: the launch mark itself — composed into a config's args (a string stays a string, a forged mark dropped), read back
    ok(B.withKeeperMark(undefined, 'bp-1') === '--vibespace-keeper=bp-1' && B.withKeeperMark('--no-sandbox,--vibespace-keeper=bp-evil', 'bp-1') === '--no-sandbox,--vibespace-keeper=bp-1' && B.withKeeperMark('--a\n--b', 'bk-2') === '--a\n--b\n--vibespace-keeper=bk-2' && eq(B.withKeeperMark(['--a', '--vibespace-keeper=x'], 'bk-2'), ['--a', '--vibespace-keeper=bk-2']), '⑥ PURE r4: withKeeperMark composes the mark into `args` (string / newline string / list), dropping a forged one');
    ok(eq(B.keeperMarksOf('/opt/chrome --a --vibespace-keeper=bp-1 --b'), ['bp-1']) && eq(B.keeperMarksOf('n\0--vibespace-keeper=bk-2\0'), ['bk-2']) && eq(B.keeperMarksOf('n\0-e\0x --vibespace-keeper=bk-2\0'), []) && B.launchedByCli('/c --remote-debugging-port=0 --x') && !B.launchedByCli('/c --remote-debugging-port=9222'), '⑥ PURE r4: keeperMarksOf reads the mark off both cmdline forms (exact on NUL-separated argv); launchedByCli = the CLI\'s --remote-debugging-port=0');
    const V0 = require('../src/browser-verbs.js');
    ok(V0.sanctionedConfig({ user: { args: '--no-sandbox,--vibespace-keeper=bp-forged' } }).config.args === '--no-sandbox' && V0.sanctionedConfig({ user: { args: '--no-sandbox,--vibespace-keeper=bp-forged' } }).dropped.args.includes('--vibespace-keeper=bp-forged'), '⑥ PURE r4: a user / project file cannot carry the mark — sanctionedConfig drops it like every raw switch (only the keeper writes it)');
    ok(eq(B.userDataDirsOf('/c --x --user-data-dir=/a/b --y'), ['/a/b']) && eq(B.userDataDirsOf('/c\0--user-data-dir\0/a/c\0'), ['/a/c']), '⑥ PURE: userDataDirsOf reads a title-rewritten (space-joined) and a NUL-separated cmdline, both spellings');
    ok(eq(B.userDataDirsOf('/c\0--user-data-dir=/a b/c\0'), ['/a b/c']) && eq(B.userDataDirsOf('/c\0--user-data-dir\0/a b/c\0--x\0'), ['/a b/c']) && eq(B.userDataDirsOf('node\0-e\0spawn(c, ["--user-data-dir=/q"])\0'), []), '⑥ PURE r3 MINOR 2: a NUL-separated cmdline is parsed EXACTLY — a directory with a space is whole (both spellings), and a flag merely MENTIONED inside another argument is not one');
    ok(eq(B.userDataDirsOf('/opt/chrome --headless --user-data-dir=/a b/c --window-size=1', ['/a b/c']), ['/a b/c']) && eq(B.userDataDirsOf('/opt/chrome --user-data-dir=/a b/cd --x', ['/a b/c']), ['/a']) && eq(B.userDataDirsOf('/opt/chrome --user-data-dir=/a b/c/ --x', ['/a b/c']), ['/a b/c']), '⑥ PURE r3 MINOR 2: a title-rewritten (space-joined) cmdline names a KNOWN directory with a space whole when the flag ends at a word boundary (a longer path never matches it)');
  }
  // CONTROLS (scripts/mutant-copy.mjs, or a runtime neuter of a PURE export): the pre-fix keeper, one edit each — the legs
  // above can go red
  {
    const M6 = mutantCopies('browser-ephemeral-orphan', REPO);
    const k6src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    // (1) no orphan handling at all: no reap on a gone daemon, no lock check before a launch
    const k6a = k6src.replace('  function reapOrphan(rec, seenBy) {\n', '  function reapOrphan(rec, seenBy) { return Promise.resolve(null);\n').replace('  async function clearProfileLock(p, ns, prev) {\n', '  async function clearProfileLock(p, ns, prev) { return { ok: true };\n');
    if (k6a !== k6src && (k6a.match(/return Promise\.resolve\(null\);\n|return \{ ok: true \};\n/g) || []).length >= 2) {
      const ca = await namedLeg(M6.load('src/server/browser-keeper.js', k6a, 'no-orphan'), 'ctl');
      ok(ca.orphanAliveAfterKill && !ca.orphanGoneAfterTick && ca.refused >= 1 && /exit code: 21|launch_failed/.test(ca.restartErr || ''), `⑥ M1 CONTROL: a keeper copy with no orphan rule leaves pid ${ca.chrome} alive after the tick and the relaunch dies on the lock (${ca.refused} exit-21 refusal: ${String(ca.restartErr || '').slice(0, 80)})`, ca);
    } else ok(false, '⑥ M1 CONTROL: the reapOrphan / clearProfileLock anchors were not found in src/server/browser-keeper.js');
    // (2) L4 pre-fix: liveness = 'gone' only (a recycled pid stays ready and the CLI is asked)
    const DG = "  const daemonGone = (rec) => ['gone', 'recycled', 'unrecorded'].includes(livenessOf(rec));";
    const k6b = k6src.replace(DG, "  const daemonGone = (rec) => livenessOf(rec) === 'gone';");
    if (k6b !== k6src) {
      const KB = M6.load('src/server/browser-keeper.js', k6b, 'recycled-live');
      const KEY8 = 'bk-0000b604';
      const kk = mk6(KB, 'ctl-recycled', new Set([KEY8]));
      const pairs8 = [...B.browserEnvFor({ browserKey: KEY8, variant: B.VARIANTS.N, idleMs: 600000 })];
      await kk.ensureEphemeral({ browserKey: KEY8, sessionId: 'sess-8', envPairs: pairs8, sessionName: 'eight' });
      const tgt8 = S.streamTargetFor({ browserKey: KEY8, set: kk.setFor(KEY8), profileRef: S.EPHEMERAL_REF, envPairs: pairs8, profiles: kk.list().profiles });
      const realSame = F.sameProcess; F.sameProcess = () => false;
      const s8 = log6('stream.log').length;
      let v8; try { v8 = await kk.streamPortFor(tgt8); } finally { F.sameProcess = realSame; }
      ok(v8 && v8.ok && log6('stream.log').length - s8 === 1, `⑥ L4 CONTROL: a keeper copy whose liveness is 'gone' only answers the recycled pid's view and asks the CLI (${log6('stream.log').length - s8} line) — the L4 leg can go red`, v8);
      for (const e of kk.ephemerals()) await kk.stop(e.profileId).catch(() => { });
      kk.shutdown(); killAll6();
    } else ok(false, '⑥ L4 CONTROL: the daemonGone anchor was not found in src/server/browser-keeper.js');
    // (3) r3 MAJOR 1 (b): the r2 keeper — no re-capture, and the minted-directory witness absent (r2's namespace witness
    //     is dead on a scrubbed chrome): the relaunched chrome outlives the tick and the profile is profile_locked
    const RC = '  function recaptureBrowser(rec, seenBy) {\n', MD = '  function mintedDirOf(p, dir, recorded) {\n';
    // r4: the r2 keeper had no launch MARK either — the new layer is stripped from the old layer's control (else the mark
    // alone proves the relaunched chrome and this control would go green for the wrong reason)
    const MK = '  const markOf = (p) => (p ? (isEph(p) ? p.owner.id : p.id) : null);';
    const k6c = k6src.replace(RC, RC + '    return rec ? rec.browser || null : null;\n').replace(MD, MD + '    return false;\n').replace(MK, '  const markOf = () => null;');
    if (k6src.includes(RC) && k6src.includes(MD) && k6src.includes(MK)) {
      const KC = M6.load('src/server/browser-keeper.js', k6c, 'r2-witness');
      const cf = await respawnLeg(KC, 'ctl-relaunch');
      // (r4: the chrome carries a launch mark the neutered copy cannot match, so the refusal names "another VibeSpace browser")
      ok(cf.c2AliveAfterKill && !cf.c2GoneAfterTick && /profile_locked/.test(cf.restartErr || '') && /may be the user's|it may be theirs|another VibeSpace browser/.test(cf.restartErr || ''), `⑥ r3 M1 CONTROL (the r2 keeper): with no re-capture, no minted-directory witness and no mark the relaunched chrome ${cf.c2} outlives the tick and the profile answers profile_locked (${String(cf.restartErr || 'started').slice(0, 90)})`, cf);
      const cb = await noRecLeg(KC, 'ctl-norec');
      ok(!cb.orphanGone && /profile_locked/.test(cb.restartErr || ''), `⑥ r3 M1 CONTROL: …and an unrecorded orphan on the minted directory is refused profile_locked, never ended — the (b) leg can go red`, cb);
    } else ok(false, '⑥ r3 M1 CONTROL: the recaptureBrowser / mintedDirOf anchors were not found in src/server/browser-keeper.js');
    // (4) r3 MAJOR 1 (a): re-capture neutered alone — the tick no longer follows a relaunch, and an ephemeral's relaunched
    //     chrome (a temp dir nobody minted) LEAKS after its daemon's SIGKILL, whichever judge ran
    if (k6src.includes(RC)) {
      const KD = M6.load('src/server/browser-keeper.js', k6src.replace(RC, RC + '    return rec ? rec.browser || null : null;\n'), 'no-recapture');
      const cg = await respawnLeg(KD, 'ctl-recapture', { judge: 'tick' });
      ok(cg.recordAfterJudge !== cg.c2, `⑥ r3 M1 (a) CONTROL: a keeper copy with no re-capture keeps the stale record after the tick (${cg.c1} → ${cg.recordAfterJudge}, the live chrome is ${cg.c2})`, cg);
      for (const judge of ['tick', 'start', 'view']) {
        // r4: the scan by the launch mark (LOW 3) is a second layer that ends the relaunched chrome without a re-capture —
        // stripped here, so this control still proves the re-capture's own leg
        const realMB = F.markedBrowsers; F.markedBrowsers = async () => [];
        let ch; try { ch = await ephRespawnLeg(KD, 'ctl-eph-' + judge, judge); } finally { F.markedBrowsers = realMB; }
        ok(ch.c2AliveAfterKill && !ch.c2Gone && !(ch.recorded && ch.recorded.pid === ch.c2), `⑥ r3 M1 (a) CONTROL via ${judge}: …and an ephemeral's relaunched chrome ${ch.c2} LEAKS after its daemon's SIGKILL — the (d2) leg can go red`, ch);
        killAll6();
      }
    } else ok(false, '⑥ r3 M1 (a) CONTROL: the recaptureBrowser anchor was not found in src/server/browser-keeper.js');
    // (5) r3 LOW 3 (launch half) pre-fix: the named start's unread-starttime check neutered — the record is `ready` with no identity
    const LC = "      if (info.pid && rec.starttime == null && F.startsReadable()) { rec.state = 'failed'; rec.endedAt = now(); rec.lastError = unrecordedLaunch(info.pid); commit(); throw namedError('launch_failed', rec.lastError); }\n      captureBrowser(rec, p.dir);";
    if (k6src.includes(LC)) {
      const cu = await launchLeg(M6.load('src/server/browser-keeper.js', k6src.replace(LC, '      captureBrowser(rec, p.dir);'), 'launch-unread'), 'ctl-unread');
      ok(cu.state === 'ready' && !cu.err, `⑥ r3 LOW 3 CONTROL: a keeper copy without the launch check records the identity-less daemon ${cu.state} — the launch leg can go red`, cu);
    } else ok(false, '⑥ r3 LOW 3 CONTROL: the launch-check anchor was not found in src/server/browser-keeper.js');
    // (6) r4 MAJOR 1: the heal neutered — a named profile whose chrome died stays `ready` with NO browser after the leased
    //     tick, and the lease's next /resolve still carries the DEAD url (every verb "Connection refused" on the real binary)
    const HB = '  function healBrowser(rec, p, seenBy, { force = false } = {}) {\n';
    // r5: the new layer (a lost, unhealed browser is REFUSED `browser_closed` by name — MINOR 2) is stripped from this r4
    // control, else the refusal alone answers the attach and the control would prove nothing about the heal
    const LB = '    if (rec.browserLost) { const p = profile(profileId); return {';
    const noHeal = (src) => src.replace(HB, HB + '    return Promise.resolve(null);\n').replace(LB, '    if (false) { const p = profile(profileId); return {');
    if (k6src.includes(HB) && k6src.includes(LB)) {
      const ch = await healLeg(M6.load('src/server/browser-keeper.js', noHeal(k6src), 'no-heal'), 'ctl-heal', { via: 'tick' });
      ok(!ch.threw && ch.count === 0 && ch.state === 'ready' && String(ch.cdp3 || '').endsWith('-' + ch.c1), `⑥ r4 MAJOR 1 CONTROL: a keeper copy with no heal leaves ${ch.count} chromes after the leased tick, the record \`${ch.state}\`, and the lease's next /resolve carries the DEAD url (…-${String(ch.cdp3).split('-').pop()}) — the heal legs can go red`, ch);
      const ca2 = await healLeg(M6.load('src/server/browser-keeper.js', noHeal(k6src), 'no-heal-attach'), 'ctl-heal-a', { via: 'attach' });
      ok(!ca2.threw && ca2.count === 0 && String(ca2.cdp3 || '').endsWith('-' + ca2.c1), `⑥ r4 MAJOR 1 CONTROL: …and an attach alone answers the dead url too (${ca2.count} chromes)`, ca2);
    } else ok(false, '⑥ r4 MAJOR 1 CONTROL: the healBrowser / lost-refusal anchors were not found in src/server/browser-keeper.js');
    // (7) r4 LOW 4: the lock preference neutered (the keeper's lockHeldUnder + browser-facts' browserOfDaemon back to the
    //     shallowest argv match) — the record names the WRAPPER, and the chrome outlives the tick after the daemon's SIGKILL
    const LH = '  function lockHeldUnder(rec, dir) {\n';
    if (k6src.includes(LH)) {
      const realBOD = F.browserOfDaemon;
      const readKids = require('../src/cli-identity.js').readChildPids;
      F.browserOfDaemon = (daemonPid, { dir = null, depth = 2 } = {}) => { let fr = [daemonPid]; const seen = new Set(fr); for (let d = 0; d < depth && fr.length; d++) { const nx = []; for (const p0 of fr) for (const k of (readKids(p0) || []).map(Number)) { if (seen.has(k)) continue; seen.add(k); nx.push(k); const c = F.procCmdline(k); if (!c || /(?:^|[\s\0])--type=/.test(c)) continue; const ds = B.userDataDirsOf(c, dir ? [dir] : []); const pick = dir ? ds.find((x) => B.sameDir(x, dir)) : ds[0]; if (pick) return { pid: k, starttime: F.procStart(k), dir: pick }; } fr = nx; } return null; };
      let cw; try { cw = await wrapLeg(M6.load('src/server/browser-keeper.js', k6src.replace(LH, LH + '    return null;\n'), 'no-lock-pref'), 'ctl-wrap'); } finally { F.browserOfDaemon = realBOD; }
      ok(!cw.threw && cw.recorded === cw.helper && !cw.chromeGone, `⑥ r4 LOW 4 CONTROL: with the r3 capture (shallowest argv match) the record names the wrapper ${cw.helper} and the chrome ${cw.chrome} outlives the tick — the LOW 4 leg can go red`, cw);
      killAll6();
    } else ok(false, '⑥ r4 LOW 4 CONTROL: the lockHeldUnder anchor was not found in src/server/browser-keeper.js');
    // (8) r4 LOW 5: the launch back on the setting NOW — the ephemeral launches with 300000 while its pairs say 600000
    const IL = '        const r = await rt.launch(null, { idleMs: pairsIdleMs(pairs), headed: null, extraEnv: env0 });';
    if (k6src.includes(IL)) {
      const ci = await idleLeg(M6.load('src/server/browser-keeper.js', k6src.replace(IL, '        const r = await rt.launch(null, { idleMs: idleMs(), headed: null, extraEnv: env0 });'), 'idle-now'), 'ctl-idle');
      ok(!ci.threw && ci.launchIdle === '300000', `⑥ r4 LOW 5 CONTROL: a keeper copy launching with the setting NOW launches with ${ci.launchIdle} — the LOW 5 leg can go red`, ci);
    } else ok(false, '⑥ r4 LOW 5 CONTROL: the ephemeral launch anchor was not found in src/server/browser-keeper.js');
    // (9) r5 MAJOR 1 (a): the LEDGER neutered — the storm relaunches on EVERY tick and nobody is told
    const BUD = '      const bud = B.healBudgetVerdict({ attempts: L.attempts, now: now() });';
    if (k6src.includes(BUD)) {
      const cs = await stormLeg(M6.load('src/server/browser-keeper.js', k6src.replace(BUD, '      const bud = { ok: true, count: 0, recent: [] };'), 'no-ledger'), 'ctl-storm');
      ok(!cs.threw && cs.relaunches >= 5 && cs.rec.closed !== 'browser_unstable' && cs.notices.length === 0, `⑥ r5 MAJOR 1 (a) CONTROL: a keeper copy without the ledger relaunches ${cs.relaunches} times in six ticks (${cs.perTick.join(' ')}) and tells nobody — the storm leg can go red`, cs);
    } else ok(false, '⑥ r5 MAJOR 1 (a) CONTROL: the budget anchor was not found in src/server/browser-keeper.js');
    // (10) r5 MAJOR 1 (b): the identified-check neutered — a healed chrome that died before its recapture reads as a success
    const WP = '      if (!b) { // r5 MAJOR 1 (b)';
    if (k6src.includes(WP)) {
      const cw = await wipeLeg(M6.load('src/server/browser-keeper.js', k6src.replace(WP, '      if (false) { // r5 MAJOR 1 (b)'), 'no-identified-check'), 'ctl-wipe');
      ok(!cw.threw && !cw.t1.closed && !cw.t1.browser && !cw.t1.lost && /^ok /.test(cw.attach1 || ''), `⑥ r5 MAJOR 1 (b) CONTROL: a keeper copy without the identified-check leaves \`${cw.t1.state}\`, no browser, no verdict, and an attach hands out the dead url (${String(cw.attach1).slice(0, 60)}) — the wipe leg can go red`, cw);
    } else ok(false, '⑥ r5 MAJOR 1 (b) CONTROL: the identified-check anchor was not found in src/server/browser-keeper.js');
    // (11) r5 MAJOR 1 (iii): the START's identified-check neutered
    const SB = '      if (!rec.browser && launchEvidenced(p.dir, stamp0)) {';
    if (k6src.includes(SB)) {
      const cb3 = await birthLeg(M6.load('src/server/browser-keeper.js', k6src.replace(SB, '      if (false) {'), 'no-start-check'), 'ctl-birth');
      ok(!cb3.threw && /^ok /.test(cb3.attach1 || '') && !cb3.rec1.closed && !cb3.rec1.browser, `⑥ r5 MAJOR 1 (iii) CONTROL: a keeper copy without the start's check records \`${cb3.rec1.state}\` with no browser and no verdict, and the attach hands out the dead url — the start leg can go red`, cb3);
    } else ok(false, '⑥ r5 MAJOR 1 (iii) CONTROL: the start-check anchor was not found in src/server/browser-keeper.js');
    // (12) r5 LOW 4: the retry gate neutered — a failed heal is retried on every tick (the budget then trips)
    const GT = '  const healGated = (rec) => !!(rec && rec.closed && Number.isFinite(rec.closed.retryAt) && now() < rec.closed.retryAt);';
    if (k6src.includes(GT)) {
      const cg4 = await gateLeg(M6.load('src/server/browser-keeper.js', k6src.replace(GT, '  const healGated = () => false;'), 'no-gate'), 'ctl-gate');
      ok(!cg4.threw && cg4.a2 > cg4.a1 + 0, `⑥ r5 LOW 4 CONTROL: a keeper copy without the gate asks the binary ${cg4.a2 - cg4.a1} more time(s) in three ticks — the gate leg can go red`, cg4);
    } else ok(false, '⑥ r5 LOW 4 CONTROL: the gate anchor was not found in src/server/browser-keeper.js');
    // (13) r5 LOW 4: the cloak branch neutered — a bare re-ask relaunches a provider-flagged browser as plain chromium
    const CL = "      if (rec.launchFlags === true || (rec.launchFlags == null && String(p.provider) === 'cloak')) {";
    if (k6src.includes(CL)) {
      const cc5 = await cloakLeg(M6.load('src/server/browser-keeper.js', k6src.replace(CL, '      if (false) {'), 'no-cloak-branch'), 'ctl-cloak');
      ok(!cc5.threw && cc5.cdp >= 1 && cc5.chromes === 1, `⑥ r5 LOW 4 CONTROL: a keeper copy without the cloak branch re-asks the binary (${cc5.cdp}) and relaunches it bare (${cc5.chromes} chrome) — the cloak leg can go red`, cc5);
    } else ok(false, '⑥ r5 LOW 4 CONTROL: the cloak anchor was not found in src/server/browser-keeper.js');
    // (14) r5 MINOR 2: the view heals whatever the lease says (r4)
    const VW = "await followRelaunch(recV, 'a view asking for its port', { heal: leasedNow(p.id), force: true });";
    if (k6src.includes(VW)) {
      const cv6 = await viewLeg(M6.load('src/server/browser-keeper.js', k6src.replace(VW, "await followRelaunch(recV, 'a view asking for its port', { heal: true, force: true });"), 'view-heals'), 'ctl-view');
      ok(!cv6.threw && cv6.afterView === 1 && cv6.view && cv6.view.ok, `⑥ r5 MINOR 2 CONTROL: a keeper copy whose view heals regardless starts the unleased browser (${cv6.afterView} chrome, port ${cv6.view && cv6.view.port}) — the view leg can go red`, cv6);
    } else ok(false, '⑥ r5 MINOR 2 CONTROL: the view anchor was not found in src/server/browser-keeper.js');
    // (15) r5 LOW 5: every close arms the gate (r4: a refusal re-armed it) — the heal after the human closes waits
    const SC = '  function setClosed(rec, c, { retry = false } = {}) {\n';
    if (k6src.includes(SC)) {
      const cl7 = await lockGateLeg(M6.load('src/server/browser-keeper.js', k6src.replace(SC, SC + '    retry = true;\n'), 'refusal-arms'), 'ctl-lockgate');
      ok(!cl7.threw && cl7.cdp === 0 && cl7.chromes.length === 0 && cl7.after.closed === 'profile_locked', `⑥ r5 LOW 5 CONTROL: a keeper copy whose refusal arms the gate does NOT heal on the tick after the human closes (${cl7.chromes.length} chromes, still \`${cl7.after.closed}\`) — the LOW 5 leg can go red`, cl7);
    } else ok(false, '⑥ r5 LOW 5 CONTROL: the setClosed anchor was not found in src/server/browser-keeper.js');
    // (16) r6 MINOR 1: today's order (r5) — the attempt counted BEFORE the ask, so a FAILED ask spends the relaunch budget
    const BO = '      if (!bud.ok) { markUnstable(rec, p, bud.count, seenBy); commit(); return null; }\n';
    if (k6src.includes(BO)) {
      const KO = M6.load('src/server/browser-keeper.js', k6src.replace(BO, BO + '      noteHeal(rec, { attempts: [...bud.recent, now()] });\n'), 'count-before-ask');
      const cgo = await gateLeg(KO, 'ctl-gate-r6');
      ok(!cgo.threw && cgo.ext.some((x) => /:browser_unstable$/.test(x)) && cgo.notices.some((x) => /closed each time/.test(x)), `⑥ r6 MINOR 1 CONTROL: a keeper copy counting the attempt BEFORE the ask turns the gate leg's failed asks into \`browser_unstable\` (${cgo.ext.join(' ')}) with a "closed each time" notice — the gate leg can go red`, cgo);
      const cco = await failCapLeg(KO, 'ctl-failcap');
      ok(!cco.threw && cco.unstableAt !== null && cco.unstableAt <= B.HEAL_BUDGET + 1 && /closed each time/.test(cco.rec.text) && cco.notices.some((x) => /keeps closing/.test(x.text)), `⑥ r6 MINOR 1 CONTROL: …and the cap leg's profile is \`browser_unstable\` after ${cco.unstableAt} failed asks with "closed each time" words (${cco.perTick.join(' ')}) — the cap leg can go red`, cco);
    } else ok(false, '⑥ r6 MINOR 1 CONTROL: the budget-refusal anchor was not found in src/server/browser-keeper.js');
    for (const r of copiesCensus(M6.files, M6.dir, REPO, { minCopies: 17, label: '⑥ ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
  }
  // RUNTIME NEUTERS of the PURE module (the keeper and browser-facts read these exports at call time)
  {
    // r3 MINOR 2 CONTROL: the r2 parse (NULs → spaces, then `\S+`) — the space leg's record is never made and the relaunch dies on the lock
    const realU = B.userDataDirsOf;
    B.userDataDirsOf = (cmdline) => { const out = []; for (const m of String(cmdline == null ? '' : cmdline).replace(/\0/g, ' ').matchAll(/(?:^|\s)--user-data-dir(?:=|\s+)(\S+)/g)) out.push(m[1]); return out; };
    let cs; try { cs = await namedLeg(K, 'ctl-space', HOME6S); } finally { B.userDataDirsOf = realU; }
    ok(!cs.recorded && cs.orphanAliveAfterKill && !cs.orphanGoneAfterTick && (cs.refused >= 1 || /profile_locked|launch_failed/.test(cs.restartErr || '')), `⑥ r3 MINOR 2 CONTROL: with the r2 parse under a home with a space nothing is recorded, the orphan outlives the tick and the relaunch is refused (${cs.refused} exit-21, ${String(cs.restartErr || '').slice(0, 70)})`, cs);
    // r3 LOW 3 CONTROL: the r2 liveness (no 'unrecorded' rung) keeps the null-starttime record ready and serves its view
    const realL = B.pidLiveness;
    B.pidLiveness = ({ alive, sameStart, startKnown } = {}) => (!alive ? 'gone' : sameStart ? 'ours' : startKnown ? 'recycled' : 'unknown');
    let cl; try { cl = await recycledLeg(K, 'ctl-unrecorded', 'bk-0000b606'); } finally { B.pidLiveness = realL; }
    ok(cl.ticks.every((s) => s === 'ready') && cl.vUnrec && cl.vUnrec.ok && cl.askedUnrec === 1, `⑥ r3 LOW 3 CONTROL: the r2 liveness keeps a null-starttime record ${cl.ticks.join(' → ')} and serves its view (${cl.askedUnrec} ask) — the LOW 3 leg can go red`, cl);
    // r4 MAJOR 2 CONTROL: the r3 rule — "the directory is minted" ALONE makes a holder the keeper's own — ends the human's chrome
    const realV = B.profileLockVerdict;
    B.profileLockVerdict = (a) => { const v = realV(a); return v.kind === 'foreign' && v.user && a.minted ? { kind: 'own-orphan', pid: v.pid, why: 'CONTROL: its --user-data-dir is the directory this keeper created (r3: minted alone)' } : v; };
    let cm; try { cm = await mintedHumanLeg(K, 'ctl-minted'); } finally { B.profileLockVerdict = realV; }
    ok(!cm.threw && cm.startedA && !cm.humanAliveA, `⑥ r4 MAJOR 2 CONTROL: with "minted alone" (the r3 rule) the agent's next start ENDS the human's chrome ${cm.humanPidA} on the minted directory — the (A) leg can go red`, cm);
    ok(!cm.humanAliveB2 || !cm.humanAliveC, `⑥ r4 MAJOR 2 CONTROL: …and the tick after a daemon SIGKILL / stop(idle) end it too (B alive ${cm.humanAliveB2}, C alive ${cm.humanAliveC})`, cm);
    // r5 LOW 3 CONTROL: the pre-mark fallback applied by the profile id (r4) — a record launched WITH the mark ends the
    // hand-launched chrome that copies the binary's --remote-debugging-port=0
    const realV3 = B.profileLockVerdict;
    B.profileLockVerdict = (a) => realV3({ ...a, preMarkAllowed: true });
    let c8; try { c8 = await premarkLeg('ctl-premark'); } finally { B.profileLockVerdict = realV3; }
    ok(!c8.threw && c8.e1 === 'started' && !c8.alive1, `⑥ r5 LOW 3 CONTROL: with the fallback applied whatever the record says, the marked record's start ENDS the hand-launched chrome ${c8.pre} — the LOW 3 leg can go red`, c8);
    // r4 LOW 3 CONTROL: no scan by the mark — the relaunched chrome in a new temp dir LEAKS after its daemon's SIGKILL
    const realMB = F.markedBrowsers;
    F.markedBrowsers = async () => [];
    let cn; try { cn = await ephRespawnLeg(K, 'ctl-eph-none', 'none'); } finally { F.markedBrowsers = realMB; }
    ok(!cn.threw && cn.c2AliveAfterKill && !cn.c2Gone, `⑥ r4 LOW 3 CONTROL: without the scan by the mark the relaunched chrome ${cn.c2} LEAKS after the tick — the LOW 3 leg can go red`, cn);
    killAll6();
  }
  killAll6();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

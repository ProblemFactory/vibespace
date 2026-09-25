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
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome } from './scratch.mjs';
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
if (a === 'stream' && b === 'status') { let h = 0; for (const ch of ns) h = (h * 31 + ch.charCodeAt(0)) % 9000; out({ success: true, data: { enabled: true, connected: false, port: 20000 + h, screencasting: false } }); process.exit(0); }
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
    const EPH_CFG = path.join(DATA, 'browser-env', 'machine-ephemeral.json'), MACH_CFG = path.join(DATA, 'browser-env', 'machine.json');
    const cy = await new Promise((resolve) => execFile(process.execPath, [CLI, 'snapshot'], { env: cliEnvFor(sy), cwd: DIRTY, encoding: 'utf8', timeout: 30000 }, (err, so, se) => resolve({ status: err ? err.code : 0, stderr: String(se || '') })));
    const ly = launches().filter((l) => l.ns === 'vs-' + KEY_Y);
    const my = cmds().filter((x) => x.ns === 'vs-' + KEY_Y).pop();
    ok(cy.status === 0 && ly.length === 1 && ly[0].config === EPH_CFG && my && my.config === EPH_CFG && my.cwd === DIRTY, 'r3: the keeper launched the rung-N browser with ITS config file (machine-ephemeral.json) and the command from the dirty directory ran with the SAME file — named, never searched', { st: cy.status, ly, my, err: cy.stderr.slice(0, 300) });
    const ry = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, sy.agentToken);
    ok(ry.status === 200 && ry.json.kind === 'ephemeral' && ry.json.config === EPH_CFG, 'r3: /resolve names that file (`config`) — the one the keeper launched with', ry.json);
    const ec = JSON.parse(fs.readFileSync(EPH_CFG, 'utf8'));
    ok(ec.args === '--no-sandbox' && ec.proxy === 'http://127.0.0.1:3128' && JSON.stringify(ec.allowedDomains) === '["example.com"]' && !('profile' in ec) && !('cdp' in ec) && (fs.statSync(EPH_CFG).mode & 0o777) === 0o600,
      'r3: its content is the user file by the one rule — the machine\'s own args / proxy / fence carried, the raw debugging port, `cdp` and the ephemeral-denied `profile` gone; 0600', ec);
    ok(!/42945|dumpchrome|R3-UA-LAYERED/.test(fs.readFileSync(EPH_CFG, 'utf8')), 'r3: nothing of the agent directory\'s agent-browser.json reached it');
    // an attachment: the profile browser's file (the machine's own `profile` stays — AGENT_BROWSER_PROFILE names the dir anyway;
    // the fence goes first: a persistent profile is refused under one, §6.3)
    fs.writeFileSync(UCFG, JSON.stringify({ args: '--no-sandbox,--remote-debugging-port=41999', proxy: 'http://127.0.0.1:3128', profile: '/home/u/.agent-browser/default-profile', cdp: '9222' }));
    const nY = k.createProfile({ label: 'R3 named' }, { owner: { kind: 'session', id: KEY_Y } });
    await k.attach({ profileId: nY.id, browserKey: KEY_Y, sessionId: 'sess-y' });
    let ra = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, sy.agentToken);
    if (ra.json && ra.json.code === 'profile_changed') ra = await post('/api/agent/browser/resolve', { argv: ['snapshot'] }, sy.agentToken);
    const mc = JSON.parse(fs.readFileSync(MACH_CFG, 'utf8'));
    ok(ra.status === 200 && ra.json.kind === 'attachment' && ra.json.config === MACH_CFG && mc.args === '--no-sandbox' && !('cdp' in mc) && mc.profile === '/home/u/.agent-browser/default-profile' && launches().some((l) => l.ns === B.sessionNameFor(nY.id) && l.config === MACH_CFG),
      'r3: an ATTACHMENT names the keeper\'s machine.json — the one its profile browser was launched with (raw debugging port and `cdp` gone, the machine\'s own keys kept)', { json: ra.json && { kind: ra.json.kind, config: ra.json.config }, mc });
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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

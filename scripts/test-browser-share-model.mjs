#!/usr/bin/env node
// OWNER RULING A (2026-09-26, "A吧" — after two naive-user studies failed the same task): A NAMED BROWSER PROFILE IS
// USABLE BY ALL OF THE OWNER'S CONVERSATIONS BY DEFAULT. The fast gate of the ruling (the heavy one, on the real 0.38.1
// and a real Chrome, is test-browser-share):
//   ① PURE — the default (a new record with no owner is "all"; scope derived from ONE field), join-vs-launch, the
//      one-driver verdict + its words, the cap counted once per holding conversation, the scope patch, the words census
//      (every refusal on these paths names a button or a wait, never a command line)
//   ② the REAL keeper + routes over a fake agent-browser that behaves like 0.38.1 (per-session daemons, a profile lock
//      held by a live pid — a second launch on the directory is "Chrome exited early (exit code: 21) … SingletonLock"):
//      path A (conversation 1 `new work`, conversation 2 `use work` ⇒ joined, one launch), path B (a USER pin on a
//      rung-D conversation while another runs the profile ⇒ the SAME browser, never its own on the directory; CONTROL the
//      pre-ruling route in a patched copy ⇒ the exit-21 SingletonLock), a pin that cannot open is LOUD (CONTROL a copy
//      that falls back to a temporary browser), one driver at a time (browser_busy by name; the user's takeover from the
//      other conversation's live view; CONTROL a keeper copy without the check), the cap, the row switch through PATCH
//      (a narrowing takes it from every other conversation — a pinned one too: the user's LATEST choice wins — and a pin
//      made after it gives it back), Rename, Delete… with two pins (warn + unpin +
//      release), the strip's "who drives", the pre-ruling conversation's own browser holding the directory (named, never
//      ended), the client's DOM-free helpers.
// ~6 s, port 0, scratch dirs only, no real browser, no vendor call.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const B = require('../src/browser-profiles.js');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const S = require('../src/browser-stream.js');
const BE = require('../src/server/browser-env.js');
const express = require('express');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CMDLINE_RE = /`?vibespace-browser \w/; // a refusal on these paths never hands the user (or the agent's Ask-user card) a command line

const ROOT = scratch('browser-share-model');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const spawned = new Set();
function cleanup() {
  for (const p of spawned) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  try { for (const n of ['launches.log', 'connects.log']) for (const l of fs.readFileSync(path.join(ROOT, 'ab', n), 'utf8').trim().split('\n').filter(Boolean)) { try { process.kill(JSON.parse(l).pid, 'SIGKILL'); } catch { } } } catch { /* none */ }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* next run */ }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

const KA = 'bk-0000c001', KB = 'bk-0000c002', KC = 'bk-0000c003', KD = 'bk-0000c004', KF = 'bk-0000c006', KG = 'bk-0000c007';

// ═══ ① PURE ════════════════════════════════════════════════════════════════
console.log('— ① PURE: the default, one field, join-vs-launch, one driver, the cap, the scope patch, the words');
{
  // the default: a new NAMED record with no owner is usable by every conversation; createdBy is display only
  const r0 = B.newProfileRecord({ id: 'bp-0000c0a1', label: 'Work', dir: '/x/w', createdBy: KA + '.3' });
  ok(r0.owner.kind === 'instance' && B.scopeOf(r0) === 'all' && r0.createdBy === KA && r0.sharing === 'owner', 'a new named record with no owner is "All my conversations" (scope all), createdBy = the making conversation (a helper\'s key → its conversation), sharing (tab isolation) stays off');
  const one = B.newProfileRecord({ id: 'bp-0000c0a2', label: 'Mine', dir: '/x/m', owner: { kind: 'session', id: KA } });
  const eph = B.newProfileRecord({ id: 'bp-0000c0a3', label: '', dir: null, ephemeral: true, owner: { kind: 'conversation', id: KA } });
  ok(B.scopeOf(one) === 'one' && B.scopeOf(eph) === 'one' && B.scopeOf({ ...one, legacy: true }) === 'all' && B.scopeOf({ ...one, owner: { kind: 'task', id: 'T-1' } }) === 'task' && B.scopeOf(null) === null, 'scopeOf reads ONE field: session ⇒ one, instance/legacy ⇒ all, task ⇒ task, an ephemeral record is its conversation\'s');
  // the path-A contradiction is impossible by construction: `sharing` never admits
  ok(B.mayAttach({ ...one, sharing: 'instance' }, { browserKey: KB }).code === 'not_owner' && B.mayAttach(one, { browserKey: KB, pinned: true }).ok && B.mayAttach(one, { browserKey: KB, by: 'user' }).ok && B.mayAttach(one, { browserKey: KA + '.1' }).ok, 'admission reads `owner` only (sharing:instance on a record kept to one conversation admits nobody else); a USER pin and a USER attach admit; the keeper\'s children are its conversation');
  // join vs launch
  const T = [[null, false, 'launch'], [{ state: 'stopped' }, false, 'launch'], [{ state: 'failed' }, false, 'launch'], [{ state: 'stopped' }, true, 'wait'], [{ state: 'starting' }, true, 'wait'], [{ state: 'starting' }, false, 'join'], [{ state: 'ready' }, false, 'join'], [{ state: 'ready' }, true, 'join']];
  const bad = T.filter(([record, starting, want]) => B.joinOrLaunch({ record, starting }) !== want);
  ok(!bad.length, `joinOrLaunch: a live record is JOINED, a launch in flight is WAITED on (a half-started record is never handed out), only a dead one LAUNCHES (${T.length} rows)`, bad);
  // one driver at a time
  const H = B.DRIVE_HOLD_MS;
  const cases = [
    ['nobody drives', { drive: null, browserKey: KB, now: 10 }, true],
    ['the same conversation', { drive: { browserKey: KB, at: 5, since: 1 }, browserKey: KB, now: 10 }, true],
    ['its own helper', { drive: { browserKey: KB, at: 5, since: 1 }, browserKey: KB + '.2', now: 10 }, true],
    ['another mid-turn', { drive: { browserKey: KA, at: 5, since: 1 }, browserKey: KB, holder: { leased: true, turn: 'running' }, now: 10 }, false],
    ['another waiting on the user', { drive: { browserKey: KA, at: 5, since: 1 }, browserKey: KB, holder: { leased: true, turn: 'waiting' }, now: 10 }, false],
    ['another, turn unknown, recent', { drive: { browserKey: KA, at: 5, since: 1 }, browserKey: KB, holder: { leased: true, turn: null }, now: 10 }, false],
    ['another whose turn ended', { drive: { browserKey: KA, at: 5, since: 1 }, browserKey: KB, holder: { leased: true, turn: 'idle' }, now: 10 }, true],
    ['another quiet for the hold', { drive: { browserKey: KA, at: 5, since: 1 }, browserKey: KB, holder: { leased: true, turn: 'running' }, now: 5 + H }, true],
    ['another that let go (no lease)', { drive: { browserKey: KA, at: 5, since: 1 }, browserKey: KB, holder: { leased: false, turn: 'running' }, now: 10 }, true],
    ['the user drives from another view', { drive: null, browserKey: KB, userDriving: { browserKey: KA }, now: 10 }, false],
    ['the user drives from MY view (browser_paused, judged before)', { drive: null, browserKey: KB, userDriving: { browserKey: KB }, now: 10 }, true],
  ];
  const wrong = cases.filter(([, a, want]) => B.driveVerdict(a).ok !== want).map(([n]) => n);
  ok(!wrong.length, `driveVerdict: ${cases.length} rows — busy exactly while another conversation is mid-work on it (or the user drives it from another view)`, wrong);
  const v1 = B.driveVerdict(cases[3][1]);
  ok(v1.code === 'browser_busy' && v1.by === 'agent' && v1.holderKey === KA && v1.retryAfterMs === H - 5, 'a busy verdict names the holder\'s conversation and an upper bound to wait (the hold left)', v1);
  const v2 = B.driveVerdict(cases[6][1]);
  ok(v2.ok && v2.claim.browserKey === KB && v2.claim.at === 10 && v2.claim.since === 10, 'a released claim is taken over by the asker (since = now)');
  const busyA = B.browserBusyRefusal({ label: 'work', holderName: 'Second chat', by: 'agent', retryAfterMs: 42000 });
  const busyU = B.browserBusyRefusal({ label: 'work', holderName: 'Second chat', by: 'user' });
  ok(/"Second chat" is using "work" right now/.test(busyA.error) && /did NOT run/.test(busyA.error) && /at most 42 s/.test(busyA.error) && /live view/.test(busyA.error) && busyA.holder === 'Second chat' && /never in a loop/.test(busyA.remedy), 'browser_busy NAMES the other conversation (the ruling\'s "told so by name"), says the command did not run, a bound to wait, and the take-over-from-its-live-view way', busyA.error);
  ok(/driven by the user/.test(busyU.error) && /"Second chat"/.test(busyU.error) && /hands it back/.test(busyU.error), 'browser_busy by the USER names the live view they drive it from', busyU.error);
  // the cap: a shared browser counts once in EACH conversation that holds a lease on it, and once on the machine
  const profiles = [{ id: 'bp-0000c0b1', label: 'Work', owner: { kind: 'instance', id: null } }, { id: 'bp-0000c0b2', label: 'Other', owner: { kind: 'instance', id: null } }, eph];
  const browsers = { 'bp-0000c0b1': { profileId: 'bp-0000c0b1', state: 'ready' }, 'bp-0000c0b2': { profileId: 'bp-0000c0b2', state: 'stopped' }, 'bp-0000c0a3': { profileId: 'bp-0000c0a3', state: 'ready' } };
  const leases = [{ profileId: 'bp-0000c0b1', browserKey: KA }, { profileId: 'bp-0000c0b1', browserKey: KB + '.1' }, { profileId: 'bp-0000c0b2', browserKey: KA }, { profileId: 'bp-0000c0a3', browserKey: KA }];
  const cnt = (bk) => B.conversationOwnCount({ browsers, profiles, leases, browserKey: bk });
  ok(cnt(KA) === 2 && cnt(KB) === 1 && cnt(KC) === 0 && B.ceilingVerdict(Object.values(browsers), leases, { CONCURRENT_CAP: 3 }) === null, 'the cap: the shared Work browser counts in BOTH conversations holding it (KA 2 = Work + its own; KB 1 = Work through a helper), a stopped one in none, and ONCE on the machine (2 live < 3)');
  // the scope patch
  ok(B.scopePatchVerdict({ profile: one, scope: 'all' }).owner.kind === 'instance' && B.scopePatchVerdict({ profile: r0, scope: 'one', conversation: KB + '.4' }).owner.id === KB && B.scopePatchVerdict({ profile: r0, scope: 'one' }).code === 'bad-request' && B.scopePatchVerdict({ profile: { ...r0, legacy: true }, scope: 'one', conversation: KB }).code === 'bad-request' && B.scopePatchVerdict({ profile: eph, scope: 'all' }).code === 'not_editable' && B.scopePatchVerdict({ profile: r0, scope: 'task' }).code === 'bad-request', 'scopePatchVerdict: all ⇒ instance, one ⇒ the conversation (a helper key → its conversation, required), the legacy and ephemeral records have no switch, anything else is refused by name');
  // the words census (every refusal the ruling touches)
  const texts = [B.notOwnerRefusal({ label: 'work' }), B.notOwnerRefusal({ label: 'work', kind: 'task', taskId: 'T-1' }), busyA, busyU, B.ephemeralHolderRefusal({ label: 'work', holderPid: 5, holderName: 'Old chat' })].flatMap((r) => [r.error, r.remedy || '']);
  ok(texts.length === 10 && texts.every((x) => !CMDLINE_RE.test(x)), 'WORDS: not_owner (both kinds), browser_busy (both), the pre-ruling holder\'s profile_locked — no command line in any error or remedy', texts.filter((x) => CMDLINE_RE.test(x)));
  ok(/All my conversations/.test(texts[0]) && /Agent browser panel/.test(texts[0]) && /Session properties/.test(texts[0]) && /press Stop/.test(B.ephemeralHolderRefusal({ label: 'w' }).error), '…each names the button: "All my conversations" in the Agent browser panel / Session properties; Stop on that browser');
  ok(/opens "work"/.test(B.pinApplyNotice({ label: 'work', liveBrowser: true })) && !/RELAUNCHES/.test(B.pinApplyNotice({ label: 'work', liveBrowser: true })) && /never relaunched/.test(B.pinApplyNotice({ label: 'work', liveBrowser: true })), 'the pin\'s sentence: the next command OPENS the profile, nothing is relaunched');
  // resolveHandle: a pin opens only an EMPTY set (an attachment the agent made itself is never displaced)
  const set0 = B.attachmentsFor({ leases: [], profiles: [r0], browserKey: KB, pin: { profileId: r0.id } });
  const set1 = B.attachmentsFor({ leases: [{ profileId: 'bp-0000c0a2', browserKey: KB, since: 1 }], profiles: [r0, one], browserKey: KB, pin: { profileId: r0.id } });
  const setGone = B.attachmentsFor({ leases: [], profiles: [], browserKey: KB, pin: { profileId: r0.id } });
  ok(B.resolveHandle({ set: set0 }).kind === 'pin' && B.resolveHandle({ set: set0 }).profileId === r0.id && B.resolveHandle({ set: set1 }).kind === 'attachment' && B.resolveHandle({ set: setGone }).kind === 'none' && set0.fingerprint === B.attachmentsFor({ leases: [], profiles: [r0], browserKey: KB }).fingerprint, 'resolveHandle: an empty set with a pin ⇒ kind pin; an attachment the agent made stays the target; a pin on a profile that is gone opens nothing; the pin alone never moves the fingerprint (no one-time refusal for it)');
}

// ═══ the fake agent-browser (0.38.1's measured shape) ═══════════════════════
const BIN = path.join(ROOT, 'bin'), AB = path.join(ROOT, 'ab'), HOME = path.join(ROOT, 'home'), DATA = path.join(ROOT, 'data'), XDG = scratch('bshm');
for (const d of [BIN, AB, path.join(HOME, '.agent-browser'), DATA, XDG]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
process.on('exit', () => { try { fs.rmSync(XDG, { recursive: true, force: true }); } catch { } });
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default'; const sess = process.env.AGENT_BROWSER_SESSION || ns;
// the profile a launch opens: AGENT_BROWSER_PROFILE, else the config file's \`profile\` (rung D's generated config — how a
// pre-ruling pin handed a conversation the directory)
let cfgProf = null; try { const c = JSON.parse(fs.readFileSync(process.env.AGENT_BROWSER_CONFIG, 'utf8')); if (c && typeof c.profile === 'string') cfgProf = c.profile; } catch { }
const prof = process.env.AGENT_BROWSER_PROFILE || cfgProf, cdp = process.env.AGENT_BROWSER_CDP || null;
const f = path.join(st, ns + '__' + sess + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const log = (n, o) => fs.appendFileSync(path.join(st, n), JSON.stringify(o) + '\\n');
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
const view = process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || '';
const failDirs = (() => { try { return fs.readFileSync(path.join(st, 'fail-dirs'), 'utf8').split('\\n').filter(Boolean); } catch { return []; } })();
const daemon = (by) => {
  let s = read(); if (s && alive(s.pid)) return s;
  if (cdp) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, cdp, view }; fs.writeFileSync(f, JSON.stringify(s)); log('connects.log', { ns, sess, cdp, by, pid: c.pid }); return s; }
  if (prof && failDirs.includes(prof)) { log('failed.log', { ns, sess, by, prof }); return { refused: 'Chrome exited early (exit code: 1) — fake: this profile cannot start' }; }
  const lock = prof ? path.join(prof, 'SingletonLock.fake') : null;
  if (lock) { let h = null; try { h = Number(fs.readFileSync(lock, 'utf8')); } catch { } if (h && alive(h)) { log('refused.log', { ns, sess, by, prof }); return { refused: 'Chrome exited early (exit code: 21) ... Failed to create ' + prof + '/SingletonLock: File exists (17)' }; } }
  const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: prof, view }; fs.writeFileSync(f, JSON.stringify(s));
  if (lock) fs.writeFileSync(lock, String(c.pid));
  log('launches.log', { ns, sess, by, profile: prof, pid: c.pid });
  return s;
};
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: sess, socketDir: path.join(st, ns, 'run') } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s0 = read(); if (!(s0 && alive(s0.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19777/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } if (s && s.profile) { try { fs.unlinkSync(path.join(s.profile, 'SingletonLock.fake')); } catch { } } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'stream' && b === 'status') { log('stream.log', { ns, sess, cdp, profile: prof }); const s = daemon('stream status'); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } out({ success: true, data: { enabled: true, connected: true, port: 21000 + (sess.length * 7) % 900, screencasting: false } }); process.exit(0); }
if (['open', 'snapshot', 'get', 'click'].includes(a)) { const s = daemon(a); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } log('cmds.log', { verb: a, ns, sess, cdp, profile: prof }); out({ success: true, data: { ok: true } }); process.exit(0); }
out({ success: false, error: 'fake: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const PATH_ENV = `${BIN}:${path.dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}`;
const env = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB, XDG_RUNTIME_DIR: XDG };
const logOf = (n) => { try { return fs.readFileSync(path.join(AB, n), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const runAs = (pairs, args) => new Promise((resolve) => execFile(path.join(BIN, 'agent-browser'), args, { env: { ...env, ...S.pairsToEnv(pairs) }, encoding: 'utf8', timeout: 15000 }, (err, stdout) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(stdout || '') })));

// ═══ ② the REAL keeper + routes ════════════════════════════════════════════
console.log('— ② the real keeper + routes over a fake 0.38.1: path A, path B, loud pins, one driver, the cap, the switch, Rename, Delete…');
const facts = {}; // browserKey → { turn, name } (the wiring's conversationFacts)
let clock = 1_900_000_000_000;
const live = new Set([KA, KB, KC, KD, KF, KG]);
const mkKeeper = (Kmod, extra = {}) => Kmod.create({ dataDir: DATA, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => live, runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: { log() { }, warn() { }, error() { } }, install: false, now: () => clock, conversationFacts: (bk) => facts[bk] || { turn: null, name: null }, ...extra });
const lim = { ...require('../src/keeper-limits.js') }; // mutable: the ceiling leg lowers the machine ceiling for one assert
const k = mkKeeper(K, { limits: lim });
const M = mutantCopies('browser-share-model', REPO);
const be = BE.create({ dataDir: DATA, homeDir: HOME, serverNotice: null, telemetry: null, log: { warn() { }, log() { } }, env: { XDG_RUNTIME_DIR: XDG } });
const tok = (c) => 'vsst_' + String(c).repeat(24);
const mkSession = (id, bk, name, { rungD = false } = {}) => {
  const s = { agentToken: tok(id.slice(-1)), _browserKey: bk, _browserVariant: null, name, webuiName: name, mode: 'chat', createdAt: clock };
  if (rungD) { const e = be.envFor({ browserKey: bk, integrationOn: true, remote: false, cwd: ROOT }); s._browserVariant = e.variant; s._browserEnv = e.pairs.slice(); s._cfg = e.configPath; }
  return s;
};
const sA = mkSession('sess-1', KA, 'First chat'), sB = mkSession('sess-2', KB, 'Second chat', { rungD: true }), sC = mkSession('sess-3', KC, 'Third chat'), sD = mkSession('sess-4', KD, 'Fourth chat'), sF = mkSession('sess-6', KF, 'Sixth chat', { rungD: true });
const active = new Map([['sess-1', sA], ['sess-2', sB], ['sess-3', sC], ['sess-4', sD], ['sess-6', sF]]);
for (const [, s] of active) facts[s._browserKey] = { turn: 'idle', name: s.name };
const notices = [];
const ctxFor = (kk) => ({ keeper: kk, activeSessions: active, browserEnv: () => be, adoptRoots: { homeDir: HOME, dataDir: DATA }, notice: (sid, s, n) => notices.push({ sid, n }), persistPin: () => { }, tasksForSession: () => [] });
const R = require('../src/routes/browser.js');
R.setup(ctxFor(k));
const TR = require('../src/routes/browser-trace.js');
const trace = require('../src/server/browser-trace.js').create({ dataDir: DATA, homeDir: HOME, keeper: k, bridge: null, serverSetting: () => undefined, broadcast: () => { }, log: { log() { }, warn() { }, error() { } } });
TR.setup({ keeper: k, trace, activeSessions: active, releaseProfile: (id) => R.releaseProfile(id), unpinProfile: (id) => R.unpinProfile(id), notice: (sid, s, n) => notices.push({ sid, n }) });
const serve = async (router, router2 = null) => { const app = express(); app.use(express.json()); app.use(router); if (router2) app.use(router2); return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); }); };
const srv = await serve(R.router, TR.router);
const API = `http://127.0.0.1:${srv.address().port}`;
const jAt = (base) => async (method, p, body, headers = {}) => { const res = await fetch(base + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
const j = jAt(API);
const as = (s) => ({ Authorization: 'Bearer ' + s.agentToken });
const leasesOn = (pid) => k.leasesOn(pid).map((l) => l.browserKey).sort();
/** A conversation's managed ephemeral browser, gone: its lease detached by the user, the record retired (awaited). */
const dropEphemeral = async (bk) => { const e = k.ephemeralFor(bk); if (!e) return; try { k.detach({ profileId: e.profileId, browserKey: bk, by: 'user' }); } catch { /* none */ } await k.retireEphemeral(e.profileId, 'user').catch(() => { }); };
try {
  // ── path A: conversation 1 `new work` + browses; conversation 2 `use work` ──
  let r = await j('POST', '/api/agent/browser/new', { label: 'work' }, as(sA));
  const work = r.json && r.json.profile;
  ok(r.status === 200 && work && work.owner.kind === 'instance' && work.createdBy === KA && work.scope === 'all', 'path A: conversation 1\'s agent `new work` ⇒ a profile every conversation can use (created by conversation 1)', r.json);
  r = await j('POST', '/api/agent/browser/use', { profile: 'work' }, as(sA));
  const envA = r.json && r.json.env;
  ok(r.status === 200 && logOf('launches.log').length === 1 && logOf('launches.log')[0].profile === work.dir, 'conversation 1 attaches: the keeper launched the ONE browser on work\'s directory');
  r = await j('POST', '/api/agent/browser/use', { profile: 'work' }, as(sD));
  const envD = r.json && r.json.env;
  ok(r.status === 200 && r.json.others === 1 && logOf('launches.log').length === 1 && Array.isArray(envD) && envD.some((kv) => kv === `AGENT_BROWSER_CDP=ws://127.0.0.1:19777/devtools/browser/fake-vs-${work.id}`) && !envD.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')), 'path A: conversation 4 `use work` is ADMITTED (was not_owner) and JOINS the running browser — the same CDP endpoint, others 1, still ONE launch', r.json);
  const cA = await runAs(envA, ['open', 'https://work.example/a']), cD = await runAs(envD, ['open', 'https://work.example/d']);
  ok(cA.status === 0 && cD.status === 0 && logOf('launches.log').length === 1 && !logOf('refused.log').length && logOf('connects.log').length === 2, 'both conversations\' commands run over the CDP url — two connections, one browser, no SingletonLock');

  // ── path B: the USER pins work for conversation 2 (rung D) in Session properties while conversation 1 runs it ──
  ok(sB._browserVariant === 'D' && be.resolvedProfileDir(KB) === '', 'path B setup: conversation 2 spawned on rung D, its own config names no profile');
  r = await j('POST', '/api/browser/pin', { sessionId: 'sess-2', profile: 'work' });
  ok(r.status === 200 && r.json.pin && r.json.pin.profileId === work.id && r.json.pin.by === 'user' && be.resolvedProfileDir(KB) === '' && /opens "work"/.test(r.json.appliesFrom), 'path B: the user\'s pin names the profile and re-points NOTHING at its directory (the config still names no profile)', r.json);
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://work.example/b'], wrapper: true }, as(sB));
  const envB = r.json && r.json.env;
  ok(r.status === 200 && r.json.kind === 'attachment' && Array.isArray(envB) && envB.some((kv) => kv === `AGENT_BROWSER_CDP=ws://127.0.0.1:19777/devtools/browser/fake-vs-${work.id}`) && logOf('launches.log').length === 1 && !k.ephemeralFor(KB), 'path B: conversation 2\'s first bare command opens its pin THROUGH THE KEEPER — kind attachment, the same browser\'s CDP url, NO second launch, no temporary browser started', r.json);
  const cB = await runAs(envB, ['open', 'https://work.example/b']);
  ok(cB.status === 0 && !logOf('refused.log').length && logOf('launches.log').length === 1 && leasesOn(work.id).join() === [KA, KB, KD].sort().join() && k.leasesFor(KB).find((l) => l.profileId === work.id).via === 'pin', 'path B: its command runs in the one browser (no exit 21) — three conversations lease work; conversation 2\'s lease says the pin made it');
  const view = await k.streamPortFor(S.streamTargetFor({ browserKey: KB, set: k.setFor(KB), profiles: k.list().profiles }));
  ok(view.ok && logOf('launches.log').length === 1 && !logOf('refused.log').length, 'path B: conversation 2\'s live view is answered on the same browser (the study\'s red "SingletonLock" live view)', view);
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sB));
  ok(r.status === 200 && r.json.kind === 'attachment', '…and its next bare command lands on the attachment the pin made (no pin kind twice, no profile_changed)', r.json);

  // ── VERIFY S5 (2026-09-26) MAJOR: a FORK of a pinned conversation inherits the pin AS A KEEPER RECORD ──
  // The ladder answers the parent's pin under origin 'conversation' and ws-create records a pin only for the other
  // origins — so a fork's NEW key had no keeper pin, and (the directory no longer riding the spawn env) its bare command
  // opened a temporary browser while Session properties said "Pinned: work". The keeper's `copyPin` is an honest copy
  // (the parent's `by` and `at` verbatim); ws-create calls it on the fork branch (the wiring pin below).
  {
    const KFORK = 'bk-0000d0f1';
    live.add(KFORK);
    const pick = k.pinForCreate({ explicit: '', priorKey: '', forkParentKey: KB, taskGroupDefault: '', resume: false, fork: true });
    ok(pick.profileId === work.id && pick.origin === 'conversation', 'a fork of conversation 2: the ladder answers the parent\'s pin under origin conversation (ws-create records nothing for that origin)', pick);
    ok(!k.pinFor(KFORK), 'CONTROL: before the copy the fork\'s key has no keeper pin — its bare command would open a temporary browser');
    const cp = k.copyPin(KB, KFORK);
    const parentPin = k.pinFor(KB);
    ok(cp && cp.profileId === work.id && cp.by === parentPin.by && cp.at === parentPin.at && cp.origin === 'conversation' && k.pinFor(KFORK).profileId === work.id, 'copyPin: the fork\'s key now carries the parent\'s pin — the same by and at (no laundering), origin conversation', { cp, parentPin });
    const setF = k.setFor(KFORK);
    ok(setF.pinId === work.id && B.resolveHandle({ set: setF }).kind === 'pin', 'the fork\'s empty set resolves to its pin (kind pin) — its first bare command opens the profile through the keeper');
    // an AGENT's pin copied stays an agent's: never an authorization
    k.setPin(KC, work.id, { origin: 'chosen', by: 'agent' });
    const cp2 = k.copyPin(KC, 'bk-0000d0f2');
    ok(cp2 && cp2.by === 'agent' && !k.userPinned('bk-0000d0f2', work.id), 'an agent\'s pin copied to a fork is still an agent\'s (userPinned false)');
    k.setPin(KC, null); k.setPin('bk-0000d0f2', null); k.setPin(KFORK, null); live.delete(KFORK);
    ok(k.copyPin(KB, KB) === null && k.copyPin('bk-0000d0ff', KFORK) === null && !k.pinFor(KFORK), 'copyPin of a key onto itself / from a key with no pin copies nothing');
    const wsc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
    ok(/data\.fork && forkParentKey && forkParentKey !== bk\.key\) \{[\s\S]{0,900}copyPin\(forkParentKey, bk\.key\)/.test(wsc), 'WIRING PIN: ws-create copies the parent\'s pin onto a fork\'s new key on the fork branch');
  }

  // CONTROL (scripts/mutant-copy.mjs): the PRE-RULING route — the pin re-points conversation 2's own config at the
  // directory and a bare command falls to its own browser ⇒ a second Chrome on work's directory: exit 21 SingletonLock
  const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  const preRepoint = rsrc.replace('  const repoint = clearPinnedDir(k, f);\n', "  let repoint = null;\n  try { repoint = ctx.browserEnv?.()?.repointPin?.(f.browserKey, p ? p.dir : null) || null; } catch (e) { repoint = { ok: false, why: String(e && e.message) }; }\n")
    .replace("    if (v.ok && v.kind === 'pin') v = await attachPin(k, f, v);\n", "    if (v.ok && v.kind === 'pin') v = { ...v, kind: 'none' };\n");
  ok(preRepoint !== rsrc && preRepoint.includes("repointPin?.(f.browserKey, p ? p.dir : null)") && preRepoint.includes("v = { ...v, kind: 'none' };"), 'control: the patched copy carries both pre-ruling edits (the directory re-point, no pin branch)');
  {
    const Rpre = M.load('src/routes/browser.js', preRepoint, 'pre-ruling');
    Rpre.setup(ctxFor(k));
    const s2 = await serve(Rpre.router);
    const jp = jAt(`http://127.0.0.1:${s2.address().port}`);
    const L0 = logOf('launches.log').length;
    let rc = await jp('POST', '/api/browser/pin', { sessionId: 'sess-6', profile: 'work' });
    const namesDir = be.resolvedProfileDir(KF) === work.dir;
    rc = await jp('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://work.example/f'], wrapper: true }, as(sF));
    const refused = logOf('refused.log');
    ok(namesDir && rc.status >= 400 && rc.json.code === 'launch_failed' && refused.length === 1 && refused[0].sess === 'vs-' + KF && refused[0].prof === work.dir && logOf('launches.log').length === L0, `CONTROL: the pre-ruling route re-points conversation 6's config at work's directory and its own browser dies on the lock (the binary: "Chrome exited early (exit code: 21) … SingletonLock: File exists"; the route: ${rc.json && rc.json.code}) — the path-B legs above can go red`, rc.json);
    await new Promise((res) => s2.close(res));
    // put conversation 6 back the way the ruling's boot conversion does (and prove it) for the legs below
    R.setup(ctxFor(k));
    const n = R.convertPinnedDirs();
    ok(n === 1 && be.resolvedProfileDir(KF) === '' && k.pinFor(KF) && k.pinFor(KF).profileId === work.id, 'the boot conversion puts the pre-ruling pinned conversation back on its own browser (the pin stays — it is the default attachment now)');
    await dropEphemeral(KF);
    await j('POST', '/api/browser/pin', { sessionId: 'sess-6', profile: null });
  }

  // ── a pin that cannot open is LOUD (never a silent temporary browser) ──
  r = await j('POST', '/api/browser/profiles', { label: 'Broken' });
  const broken = r.json.profile;
  fs.writeFileSync(path.join(AB, 'fail-dirs'), broken.dir + '\n');
  await j('POST', '/api/browser/pin', { sessionId: 'sess-6', profile: 'Broken' });
  const L1 = logOf('launches.log').length;
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://x.example/'], wrapper: true }, as(sF));
  ok(r.status === 502 && r.json.code === 'launch_failed' && r.json.pinned === true && r.json.pinnedProfile && r.json.pinnedProfile.label === 'Broken' && /your pinned profile "Broken" did not open/.test(r.json.error) && /nothing else was opened instead/.test(r.json.error) && !k.ephemeralFor(KF) && logOf('launches.log').length === L1, 'a pin that does not open is a TYPED refusal naming the pin (pinned:true) — no temporary browser is started instead', r.json);
  ok(k.statusFor(KF).pinFailure && k.statusFor(KF).pinFailure.code === 'launch_failed' && k.statusFor(KF).pinFailure.label === 'Broken', '…and the conversation\'s facts record it (statusFor.pinFailure — the chip / Session properties read it)');
  ok(!CMDLINE_RE.test(r.json.error), '…with no command line in its words', r.json.error);
  {
    const loud = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
    const silent = loud.replace("    return { ok: false, code: (e && e.code) || 'launch_failed', pinned: true,", "    return { ...v, kind: 'none' }; return { ok: false, code: (e && e.code) || 'launch_failed', pinned: true,");
    ok(silent !== loud, 'control: the patched copy falls back instead of refusing');
    const Rs = M.load('src/routes/browser.js', silent, 'silent-fallback');
    Rs.setup(ctxFor(k));
    const s3 = await serve(Rs.router);
    const rc = await jAt(`http://127.0.0.1:${s3.address().port}`)('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://x.example/'], wrapper: true }, as(sF));
    ok(rc.status === 200 && rc.json.kind === 'ephemeral' && !!k.ephemeralFor(KF), 'CONTROL: a route that falls back on a pin refusal answers kind ephemeral — the silent temporary browser of the study — the leg above can go red', rc.json);
    await new Promise((res) => s3.close(res));
    await dropEphemeral(KF);
    R.setup(ctxFor(k));
  }
  fs.writeFileSync(path.join(AB, 'fail-dirs'), '');
  await j('POST', '/api/browser/pin', { sessionId: 'sess-6', profile: null });

  // ── one driver at a time ──
  clock += B.DRIVE_HOLD_MS + 1000; // every earlier command's claim (path B's two resolves) has lapsed: nobody drives
  facts[KA].turn = 'running'; facts[KB].turn = 'running'; facts[KD].turn = 'idle';
  let v = k.resolveFor({ browserKey: KA, handle: 'work' });
  ok(v.ok && v.kind === 'attachment' && k.list().drivers[work.id] && k.list().drivers[work.id].browserKey === KA, 'one driver: conversation 1\'s command claims the drive (the digest names its browser key — never a name: the digest reaches agents)');
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sB));
  ok(r.status === 409 && r.json.code === 'browser_busy' && r.json.holder === 'First chat' && r.json.by === 'agent' && r.json.retryAfterMs > 0 && r.json.retryAfterMs <= B.DRIVE_HOLD_MS && /"First chat" is using "work" right now/.test(r.json.error) && !CMDLINE_RE.test(r.json.error), 'conversation 2\'s command while conversation 1 is mid-turn on it ⇒ browser_busy BY NAME ("First chat"), with the bound to wait — its command did not run', r.json);
  const rowB = S.browserListFor(k.statusFor(KB)).find((x) => x.profileId === work.id);
  ok(rowB && rowB.driver === 'other' && rowB.driverKey === KA && rowB.owners === 2, 'the strip: conversation 2\'s tab for work says ANOTHER conversation drives it (driverKey = conversation 1) and that two others hold it', rowB);
  facts[KA].turn = 'idle';
  v = k.resolveFor({ browserKey: KB, handle: 'work' });
  ok(v.ok && k.list().drivers[work.id].browserKey === KB, 'conversation 1\'s turn ENDED ⇒ conversation 2\'s next command takes the drive');
  facts[KA].turn = 'running';
  v = k.resolveFor({ browserKey: KA, handle: 'work' });
  ok(!v.ok && v.code === 'browser_busy' && v.holder === 'Second chat', '…and now conversation 1 is the one told to wait ("Second chat")');
  clock += B.DRIVE_HOLD_MS + 1000;
  v = k.resolveFor({ browserKey: KA, handle: 'work' });
  ok(v.ok && k.list().drivers[work.id].browserKey === KA, `a driver that sent no command for ${B.DRIVE_HOLD_MS / 1000} s lets go even mid-turn`);
  // the user takes over from conversation 2's live view: its own command is browser_paused; conversation 1's is busy (the user drives)
  const to = k.takeover({ browserKey: KB, profileId: work.id, viewerId: 'viewer-b', sessionId: 'sess-2' });
  const vB = k.resolveFor({ browserKey: KB, handle: 'work' }), vA = k.resolveFor({ browserKey: KA, handle: 'work' });
  ok(to && to.ok !== false && vB.code === 'browser_paused' && vA.code === 'browser_busy' && vA.by === 'user' && /driven by the user/.test(vA.error) && /"Second chat"/.test(vA.error), 'the USER takes over from conversation 2\'s live view: conversation 2 is browser_paused (as today), conversation 1 is browser_busy — the user drives it, named by the view', { to, vB: vB.code, vA });
  const rowA = S.browserListFor(k.statusFor(KA)).find((x) => x.profileId === work.id);
  ok(rowA && rowA.driver === 'other-user' && rowA.driverKey === KB, 'the strip of conversation 1 says the user drives it in conversation 2\'s view', rowA);
  k.handback({ browserKey: KB, profileId: work.id, viewerId: 'viewer-b', cause: 'explicit', sessionId: 'sess-2' });
  v = k.resolveFor({ browserKey: KA, handle: 'work' });
  ok(v.ok, 'the handback frees it — conversation 1 acts again');
  facts[KA].turn = 'idle'; facts[KB].turn = 'idle';
  ok(Object.keys(k.activeDrivers()).length === 0, 'with every holder\'s turn ended nobody drives (the tick drops the claim; the strips stop naming a driver)');
  // CONTROL: a keeper copy without the one-driver check lets two conversations act at once
  {
    const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const noDrive = ksrc.replace("      if (v.kind === 'attachment') {\n        const dv = driveVerdictFor(bk, v.attachment.profileId);", "      if (false) {\n        const dv = driveVerdictFor(bk, v.attachment.profileId);");
    ok(noDrive !== ksrc, 'control: the patched keeper copy lost the drive check');
    const DATA2 = path.join(ROOT, 'data-nodrive'); fs.mkdirSync(DATA2, { recursive: true });
    const Kn = M.load('src/server/browser-keeper.js', noDrive, 'no-drive');
    const kn = Kn.create({ dataDir: DATA2, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => live, runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: { log() { }, warn() { }, error() { } }, install: false, now: () => clock, conversationFacts: (bk) => facts[bk] || { turn: null, name: null } });
    const p2 = kn.createProfile({ label: 'Twin' });
    await kn.attach({ profileId: p2.id, browserKey: KA }); await kn.attach({ profileId: p2.id, browserKey: KB });
    facts[KA].turn = 'running'; facts[KB].turn = 'running';
    const a1 = kn.resolveFor({ browserKey: KA }), b1 = kn.resolveFor({ browserKey: KB });
    ok(a1.ok && b1.ok, 'CONTROL: a keeper copy without the check lets conversation 2 act while conversation 1 is mid-turn — the one-driver legs can go red', { a1: a1.code, b1: b1.code });
    facts[KA].turn = 'idle'; facts[KB].turn = 'idle';
    await kn.stop(p2.id).catch(() => { }); kn.shutdown();
  }

  // ── the cap: counted once per holding conversation; a join never trips the machine ceiling ──
  r = await j('POST', '/api/browser/profiles', { label: 'Other' });
  const other = r.json.profile;
  await k.attach({ profileId: other.id, browserKey: KC, sessionId: 'sess-3' });
  k.setCap(KC, 1);
  let e = await threw(() => k.attach({ profileId: work.id, browserKey: KC, sessionId: 'sess-3' }));
  ok(e && e.code === 'browser_cap' && e.scope === 'conversation' && e.capOwn === 1 && e.capOf === 1, 'the cap: joining the SHARED work browser counts in conversation 3\'s own cap (1 of 1 already running ⇒ browser_cap scope conversation)', e && e.message);
  k.setCap(KC, null);
  const Lc = logOf('launches.log').length;
  const liveN = Object.values(k.list().browsers).filter((b) => b && (b.state === 'ready' || b.state === 'starting')).length;
  lim.CONCURRENT_CAP = liveN; // the machine is AT its ceiling now
  const jn = await k.attach({ profileId: work.id, browserKey: KC, sessionId: 'sess-3' });
  ok(jn && jn.others === 3 && logOf('launches.log').length === Lc && k.ownLive(KC) === 2, `a join never trips the MACHINE ceiling (${liveN} live browsers at a ceiling of ${liveN} — work is already one of them): conversation 3 now holds 2 (work + Other), nothing launched`, { others: jn && jn.others, own: k.ownLive(KC) });
  r = await j('POST', '/api/browser/profiles', { label: 'Third' });
  e = await threw(() => k.attach({ profileId: r.json.profile.id, browserKey: KC, sessionId: 'sess-3' }));
  ok(e && e.code === 'cap' && e.scope === 'machine' && logOf('launches.log').length === Lc, 'CONTROL: at the same ceiling a profile whose browser is NOT running is refused (cap, machine) — the join leg above is not a ceiling that never refuses', e && e.message);
  lim.CONCURRENT_CAP = 6;

  // ── the row switch through PATCH: narrowing takes it from every other conversation (the user's LATEST choice wins) ──
  ok(B.userPinAuthorizes({ pin: { profileId: 'bp-1', by: 'user', at: 5 }, profile: { id: 'bp-1', scopeAt: 5 } }) && !B.userPinAuthorizes({ pin: { profileId: 'bp-1', by: 'user', at: 4 }, profile: { id: 'bp-1', scopeAt: 5 } }) && !B.userPinAuthorizes({ pin: { profileId: 'bp-1', by: 'agent', at: 9 }, profile: { id: 'bp-1', scopeAt: 5 } }) && !B.userPinAuthorizes({ pin: { profileId: 'bp-2', by: 'user', at: 9 }, profile: { id: 'bp-1' } }) && B.userPinAuthorizes({ pin: { profileId: 'bp-1', at: 1 }, profile: { id: 'bp-1' } }), 'PURE userPinAuthorizes: a USER pin on this profile made no earlier than its last scope change (a pre-ruling pin has no `by` = the user\'s); an older one, an agent\'s, another profile\'s never');
  const n0 = notices.length;
  clock += 1000; // the switch comes AFTER conversation 2's pin
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { scope: 'one', conversation: KA });
  ok(r.status === 200 && r.json.profile.scope === 'one' && r.json.profile.owner.id === KA && r.json.detached.map((d) => d.browserKey).sort().join() === [KB, KC, KD].sort().join() && leasesOn(work.id).join() === KA, '"Only First chat": EVERY other conversation using it loses it — conversation 2 too, whose pin is older than this choice (the user\'s latest choice wins)', r.json);
  ok(notices.slice(n0).some((x) => x.sid === 'sess-4' && x.n.kind === 'browser-profile') && notices.slice(n0).some((x) => x.sid === 'sess-2'), '…each detached live conversation hears it on its next message (layer ②)', notices.slice(n0));
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sB));
  ok(r.status === 409 && r.json.code === 'profile_changed', 'conversation 2\'s next command is first told its set changed (§3.8 layer ①, once)', r.json);
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sB));
  ok(r.status === 403 && r.json.code === 'not_owner' && r.json.pinned === true && /pinned profile "work" did not open/.test(r.json.error) && /All my conversations/.test(r.json.error) && /Session properties/.test(r.json.error) && !CMDLINE_RE.test(r.json.error) && !k.ephemeralFor(KB), 'conversation 2\'s next command (its pin still names work): refused not_owner with the BUTTON sentence, pinned:true — no temporary browser instead', r.json);
  r = await j('POST', '/api/browser/pin', { sessionId: 'sess-2', profile: 'work' });
  const rB = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sB));
  ok(r.status === 200 && rB.status === 200 && rB.json.kind === 'attachment' && leasesOn(work.id).join() === [KA, KB].sort().join(), '…the user picks work for conversation 2 AGAIN (Session properties, after the switch) — that pick is the authorization: it opens work (the button the refusal named)', rB.json);
  r = await j('POST', '/api/agent/browser/use', { profile: 'work' }, as(sD));
  ok(r.status === 403 && r.json.code === 'not_owner' && /only its own conversation/.test(r.json.error) && /All my conversations/.test(r.json.error) && !CMDLINE_RE.test(r.json.error) && r.json.remedy, 'conversation 4 is refused not_owner with the BUTTON sentence (no command line — the study\'s Ask-user card offered one)', r.json);
  r = await j('POST', '/api/agent/browser/pin', { profile: 'work' }, as(sD));
  ok(r.status === 403 && r.json.code === 'not_owner', '…its agent cannot pin its way in either (only the user\'s pick authorizes)');
  r = await j('POST', '/api/browser/attach', { sessionId: 'sess-4', profile: 'work' });
  ok(r.status === 200 && leasesOn(work.id).includes(KD), '…while the USER\'s own attach (the UI) is the authorization — admitted');
  await j('POST', '/api/browser/detach', { sessionId: 'sess-4', profile: 'work' });
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { scope: 'all' });
  ok(r.status === 200 && r.json.profile.scope === 'all' && (await j('POST', '/api/agent/browser/use', { profile: 'work' }, as(sD))).status === 200, '"All my conversations" again ⇒ conversation 4 uses it');
  ok((await j('PATCH', `/api/browser/profiles/${work.id}`, { scope: 'one' })).json.code === 'bad-request' && (await j('PATCH', `/api/browser/profiles/${work.id}`, { conversation: KA })).json.code === 'bad-request', 'the switch refuses "one" without a conversation, and a conversation without the scope');

  // ── Rename ──
  const aliasBefore = k.setFor(KA).attachments.find((a) => a.profileId === work.id).alias;
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { label: 'Work (acme)' });
  ok(r.status === 200 && r.json.profile.label === 'Work (acme)' && k.setFor(KA).attachments.find((a) => a.profileId === work.id).alias === aliasBefore, 'Rename: the label changes; the handle an agent already uses does not', r.json);
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { label: 'other' });
  ok(r.status === 409 && r.json.code === 'label_taken', 'Rename validates like `new` (a name taken case-insensitively ⇒ label_taken)');

  // ── the housekeeping row says who uses it; Delete… warns, releases, unpins, sets aside ──
  await j('POST', '/api/browser/pin', { sessionId: 'sess-4', profile: 'work' });
  r = await j('GET', '/api/browser/housekeeping');
  const row = r.json && r.json.profiles.find((x) => x.id === work.id);
  const TV = await import(path.join(REPO, 'src/lib/browser-trace-view.js'));
  const opts = row ? TV.scopeOptions(row, r.json.conversations) : [];
  const users = row ? TV.usersOf(row) : [];
  ok(row && row.scope === 'all' && row.createdBy === KA && users.length === 3 && users.filter((u) => u.pinned).map((u) => u.name).sort().join() === 'Fourth chat,Second chat' && opts[0].value === 'all' && opts[0].selected && opts.some((o) => o.value === 'one:' + KA && /First chat/.test(o.label)) && new Set(opts.map((o) => o.value)).size === opts.length, 'the panel row names who uses it (3 conversations, 2 of them by the user\'s pin) and offers "All my conversations" (selected) + "Only <each conversation>" once each', { usedBy: row && row.usedBy, opts });
  r = await j('POST', `/api/browser/profiles/${work.id}/forget`, {});
  ok(r.status === 409 && r.json.code === 'leased', 'without the Delete… flags the set-aside keeps refusing a profile in use (the old two-step, unchanged)');
  const dirW = work.dir;
  r = await j('POST', `/api/browser/profiles/${work.id}/forget`, { release: true, unpin: true });
  ok(r.status === 200 && r.json.ok && r.json.detached === 3 && r.json.unpinned === 2 && r.json.stopped === true && !k.profile(work.id) && !fs.existsSync(dirW) && fs.existsSync(r.json.to), 'Delete… with two pins: every lease detached (3), the browser stopped, both pins cleared, then set aside (the directory moved beside itself — kept until Delete permanently)', r.json);
  ok(!k.pinFor(KB) && !k.pinFor(KD) && sB._browserProfileId === null && sD._browserProfileId === null && Object.values(k.list().pins).every((x) => x.profileId !== work.id), '…no conversation keeps a pin on it (keeper + the live sessions\' own record)');
  ok(notices.some((x) => x.sid === 'sess-2' && x.n.kind === 'browser-pin') && notices.some((x) => x.sid === 'sess-1' && x.n.kind === 'browser-profile'), '…each live conversation hears it on its next message (the unpin\'s browser-pin notice, the release\'s browser-profile notice)');

  // ── the pre-ruling case: a conversation's OWN browser holds a profile's directory (named, never ended) ──
  r = await j('POST', '/api/browser/profiles', { label: 'Old' });
  const old = r.json.profile;
  facts[KG] = { turn: 'running', name: 'Old chat' };
  const holder = spawn(process.execPath, ['-e', 'setInterval(()=>{},1e6)', '--', `--user-data-dir=${old.dir}`, `--vibespace-keeper=${KG}`], { stdio: 'ignore', detached: true });
  spawned.add(holder.pid);
  await sleep(250);
  fs.symlinkSync(`${os.hostname()}-${holder.pid}`, path.join(old.dir, 'SingletonLock'));
  e = await threw(() => k.attach({ profileId: old.id, browserKey: KC, sessionId: 'sess-3' }));
  let holderAlive = false; try { process.kill(holder.pid, 0); holderAlive = true; } catch { holderAlive = false; }
  ok(e && e.code === 'profile_locked' && /the conversation "Old chat"'s own browser \(a pin from before this version/.test(e.message) && /press Stop/.test(e.message) && !CMDLINE_RE.test(e.message) && holderAlive, 'a pre-ruling conversation\'s own browser on the directory (its mark names the conversation) ⇒ profile_locked naming that conversation and the Stop button — the keeper never ends it', e && e.message);
} catch (err) { ok(false, 'the keeper/routes legs threw', err && (err.stack || err.message)); }

// ── the client's DOM-free helpers ──
{
  const P = await import(path.join(REPO, 'src/lib/browser-profile-picker.js'));
  const profs = [{ id: 'bp-1', label: 'Work', scope: 'all', owner: { kind: 'instance' } }, { id: 'bp-2', label: 'Bank', scope: 'one', owner: { kind: 'session', id: KA } }, { id: 'bp-3', label: 'Team', scope: 'all', mediated: true, owner: { kind: 'instance' } }];
  const items = P.pickerItems({ profiles: profs, pinnedId: 'bp-2', onPin() { }, onAdopt() { }, nameOf: (bkx) => (bkx === KA ? 'First chat' : '') });
  const labels = items.map((x) => x.label || '').join('|');
  ok(/Work/.test(labels) && /✓ Bank \(only First chat\)/.test(labels) && /Team/.test(labels), 'the picker offers EVERY named profile — a separate-tabs (mediated) one too — and marks one kept to a conversation "(only <name>)"', labels);
}
for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 3 })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));

try { for (const p of k.list().profiles) await k.stop(p.id).catch(() => { }); } catch { /* none */ }
k.shutdown();
srv.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

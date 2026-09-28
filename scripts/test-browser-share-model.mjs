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
//   ③ B-f7ab THE LATE KEY: a live session with no browser key (it started before per-session browsers) gets one on its
//      FIRST browser use through ONE engine function (src/server/browser-key.js) — rung D's config, the pairs, bound to
//      THAT conversation through the meta choke point; a second call returns the same key; a conversation's existing
//      key comes back; a fork with a borrowed id / a remote session / an unknown conversation / a key another live
//      session holds / the switches off / a session gone are refused BY NAME. CONTROLS: an engine copy that mints a
//      second key on the second call, and one without the fork rule (the old terminal fork gets its PARENT's key).
//      ③f (verify r3): a pin dated 0 (the landing) authorizes nothing, a narrowed profile without a scope date included; a
//                       witness on a record with no start is dated 0 (PURE rows + the real keeper + a patched-copy control)
//      ③f (verify r1): the late key's DEFAULT pin is dated when the session STARTED — a profile the user kept to another
//      conversation since then stays closed to it (not_owner, by the button); CONTROL: the engine stamping the mint instant.
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
    .replace("    if (v.ok && v.kind === 'pin') v = await attachPin(k, f, v, verb);\n", "    if (v.ok && v.kind === 'pin') v = { ...v, kind: 'none' };\n"); // integration 2.369.192: the route threads S2's refused verb through attachPin
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
  // the user takes over from conversation 2's live view: the takeover is of the BROWSER (lane S2 r6, the owner's ruling
  // B-7199 "直接打断所有脚本和agent操作") — conversation 2 AND conversation 1 are browser_paused (1 taken WITH 2's view);
  // who drives still names the VIEW (integration 2.369.192: the sibling state's `with`)
  const to = k.takeover({ browserKey: KB, profileId: work.id, viewerId: 'viewer-b', sessionId: 'sess-2' });
  const vB = k.resolveFor({ browserKey: KB, handle: 'work' }), vA = k.resolveFor({ browserKey: KA, handle: 'work' });
  ok(to && to.ok !== false && vB.code === 'browser_paused' && vA.code === 'browser_paused', 'the USER takes over from conversation 2\'s live view: conversation 2 is browser_paused (as today), conversation 1 is browser_paused too — a takeover is of the browser (lane S2), never a one-conversation pause', { to, vB: vB.code, vA });
  ok(k.list().drivers !== undefined && (k.statusFor(KA).leases.find((l) => l.profileId === work.id) || {}).driver?.browserKey === KB, 'who drives conversation 1\'s lease names conversation 2 — the view the user drives FROM (never conversation 1 itself)', k.statusFor(KA).leases.map((l) => l.driver));
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

// ═══ ③ THE LATE KEY (B-f7ab) ═══════════════════════════════════════════════
// A session that started before per-session browsers (or while they were off) has no browser key; every browser route
// answered it "it predates the feature — it cannot hold a profile" and the owner's chat parked itself. Now the routes
// ask ONE engine function (src/server/browser-key.js `ensureBrowserKey`) — the spawn's own mint, env composition and
// pin ladder — and the binding rides the meta choke point (mirrored here exactly as session-stdout.writeSessionMeta
// runs it; its source line is pinned below). Refusals are BY NAME.
console.log('— ③ the late key: a keyless live session\'s first browser use mints its key (once), bound to THAT conversation; the rest refused by name');
{
  const BK = require('../src/server/browser-key.js');
  const BB = require('../src/server/browser-bindings.js');
  const BFx = require('../src/browser-fact.js');
  // (a) PURE: the verdict's order and its words
  const V = (o) => B.lateKeyVerdict({ conversationId: 'conv-x', ...o });
  const table = [
    [{ live: false }, 'session-gone', 'session_gone'], [{ remote: true }, 'no_browser_key', 'remote'], [{ integrationOn: false }, 'no_browser_key', 'integration_off'],
    [{ isolationOn: false }, 'no_browser_key', 'isolation_off'], [{ envAvailable: false }, 'no_browser_key', 'unavailable'], [{ conversationId: '' }, 'no_browser_key', 'conversation_unknown'],
    [{ forkPending: true }, 'no_browser_key', 'fork_pending'], [{ priorKey: 'bk-0000e001', priorHolder: 'Other chat' }, 'no_browser_key', 'held_elsewhere'],
    [{ remote: true, live: false }, 'session-gone', 'session_gone'], [{ forkPending: true, remote: true }, 'no_browser_key', 'remote'],
  ];
  const badRows = table.filter(([o, code, why]) => { const v = V(o); return v.ok || v.code !== code || v.why !== why || !v.error || !v.remedy; });
  ok(!badRows.length && B.LATE_KEY_WHYS.length === 8, `③a lateKeyVerdict: ${table.length} rows, each refusal NAMED (code + why + error + remedy), in the rule order`, JSON.stringify(badRows.map((r) => r[0])));
  const ok1 = V({}), ok2 = V({ priorKey: 'bk-0000e002' });
  ok(ok1.ok && ok1.reuse === '' && ok2.ok && ok2.reuse === 'bk-0000e002', '③a a known conversation of its own mints; one that already has a key and no live holder gets THAT key back (never a second one)');
  const words = B.LATE_KEY_WHYS.map((w) => B.lateKeyRefusal(w, { holderName: 'Other chat' }));
  ok(words.every((w) => !CMDLINE_RE.test(w.error) && !CMDLINE_RE.test(w.remedy) && !/predates the feature/.test(w.error))
    && ['remote', 'conversation_unknown', 'fork_pending'].every((w) => /^restart this session \(Terminate → Resume\) to get a browser key: /.test(B.lateKeyRefusal(w).error))
    && /\("Other chat"\)/.test(B.lateKeyRefusal('held_elsewhere', { holderName: 'Other chat' }).error) && /no restart needed/.test(B.lateKeyRefusal('isolation_off').remedy),
  '③a the words: never a command line, never "predates the feature"; the restart-remedied reasons say "restart this session (Terminate → Resume) to get a browser key: <reason>"; a setting names the setting; the holder is named', words.map((w) => w.error).join(' | '));

  // (b) the REAL engine + routes + keeper + browser-env over the fake 0.38.1
  const metas = new Map(); // sockName → the session's meta record (the file session-stdout writes)
  const store = BB.create({ dataDir: DATA, log: { warn() { } } }); // session-stdout's OWN instance (browser-env reads through another)
  const chokeLines = [];
  const persist = (session, patch) => { // THE choke point, as session-stdout.writeSessionMeta runs it (source pinned below)
    const meta = { ...(metas.get(session.sockName) || {}), ...patch };
    metas.set(session.sockName, meta);
    if (meta && meta.browserKey) { const sid = store.bindableIdOf(meta); if (sid) store.record(sid, meta.browserKey); else store.noteUnbound(meta, session.sockName); }
  };
  const logLines = [];
  const cap = { log: (m) => logLines.push(String(m)), warn: (m) => logLines.push(String(m)) };
  const mkEngine = (mod) => mod.create({ browserEnv: () => be, keeper: () => k, activeSessions: active, integrationEnabled: () => true,
    readMeta: (s) => metas.get(s.sockName) || null, persistMeta: persist, onLiveFactsChanged: () => chokeLines.push('facts'), log: cap });
  const eng = mkEngine(BK);
  R.setup({ ...ctxFor(k), ensureBrowserKey: (s, o) => eng.ensureBrowserKey(s, o) });
  let nTok = 0;
  const keyless = (id, name, { conv = null, meta = {}, extra = {} } = {}) => {
    const t = 'vsst_' + ('z' + String(++nTok)).repeat(12);
    const s = { agentToken: t, name, webuiName: name, mode: 'chat', createdAt: clock, cwd: ROOT, sockName: 'cw-' + id, ...(conv ? { claudeSessionId: conv } : {}), ...extra };
    metas.set(s.sockName, { webuiSessionId: id, name, cwd: ROOT, ...(conv ? { claudeSessionId: conv } : {}), ...meta });
    active.set(id, s);
    facts[id] = { turn: 'idle', name };
    return s;
  };
  const CONV_L = 'c0f7ab00-late-4000-8000-000000000001';
  const sL = keyless('sess-late', 'Late chat', { conv: CONV_L });
  ok(!sL._browserKey && BFx.browserFactWords(eng.keylessFactOf(sL)).line === 'no browser yet' && eng.keylessFactOf(sL).key === '' && BFx.browserFactWords(eng.keylessFactOf(sL)).show === false,
    '③b before its first use the session publishes the keyless fact — "no browser yet" (no chip: show false, no key)');
  let r = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://example.test/late'], wrapper: true }, as(sL));
  const K1 = sL._browserKey;
  const nsL = B.sessionNameFor(K1);
  ok(r.status === 200 && r.json.kind === 'ephemeral' && B.isBrowserKey(K1) && r.json.minted && r.json.minted.key === K1 && r.json.minted.origin === 'new'
    && sL._browserVariant === 'D' && Array.isArray(sL._browserEnv) && sL._browserEnv.includes(`AGENT_BROWSER_SESSION=${nsL}`)
    && r.json.env.includes(`AGENT_BROWSER_SESSION=${nsL}`) && r.json.spawnEnv.includes(`AGENT_BROWSER_SESSION=${nsL}`) && fs.existsSync(be.configPathFor(K1)),
  '③b its FIRST resolve mints a key (the spawn\'s rung D: the generated config written, the pairs recorded on the session) and answers kind ephemeral with `minted` — the CLI builds its child env from this answer, no respawn', r.json);
  ok(BB.create({ dataDir: DATA }).lookup(CONV_L) === K1 && metas.get(sL.sockName).browserKey === K1 && metas.get(sL.sockName).browserKeyFor === CONV_L && metas.get(sL.sockName).webuiSessionId === 'sess-late',
    '③b bindings.json holds the key for THAT conversation (a second store instance reads it), through the session\'s own record (browserKeyFor = its conversation id, the record kept whole)');
  const rr = await runAs(r.json.env, ['open', 'https://example.test/late']);
  ok(rr.status === 0 && logOf('cmds.log').some((x) => x.verb === 'open' && x.ns === nsL) && k.ephemeralFor(K1) && BFx.browserFactWords(k.factFor(BFx.sessionFactsOf(sL))).line === 'no profile (temporary browser)',
    '③b a command under the answer\'s env lands in the conversation\'s own browser (its namespace), which the keeper manages; the fact now names it', rr.out);
  const mintsBefore = logLines.filter((l) => /had no browser key/.test(l)).length;
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['get', 'title'], wrapper: true }, as(sL));
  const r3 = await j('GET', '/api/agent/browser/status', undefined, as(sL));
  ok(r.status === 200 && sL._browserKey === K1 && !r.json.minted && r.json.env.includes(`AGENT_BROWSER_SESSION=${nsL}`) && r3.status === 200 && BB.create({ dataDir: DATA }).lookup(CONV_L) === K1
    && logLines.filter((l) => /had no browser key/.test(l)).length === mintsBefore && mintsBefore === 1,
  '③b a second resolve (and the status route) returns the SAME key — nothing minted, the binding unchanged, ONE mint line in total', { json: r.json && r.json.minted, lines: logLines });
  ok(/const sid = b\.bindableIdOf\(meta\); if \(sid\) b\.record\(sid, meta\.browserKey\); else b\.noteUnbound\(meta, sockName\);/.test(fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf8')),
    '③b WIRING PIN: the choke point this leg mirrors is session-stdout.writeSessionMeta\'s own binding line, unchanged');
  // the cookie routes mint through the same function
  const sU = keyless('sess-ui', 'UI chat', { conv: 'c0f7ab00-ui00-4000-8000-000000000002' });
  r = await j('POST', '/api/browser/pin', { sessionId: 'sess-ui', profile: null });
  ok(r.status === 200 && B.isBrowserKey(sU._browserKey) && BB.create({ dataDir: DATA }).lookup('c0f7ab00-ui00-4000-8000-000000000002') === sU._browserKey, '③b a cookie route (the user\'s pin from Session properties) mints the same way', r.json);
  // a conversation that already has a key (and no live holder) gets it back; one another live session holds is refused
  const CONV_B = 'c0f7ab00-back-4000-8000-000000000003', KBACK = 'bk-0000e0b1';
  store.record(CONV_B, KBACK);
  const sBk = keyless('sess-back', 'Back chat', { conv: CONV_B });
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://example.test/b'], wrapper: true }, as(sBk));
  ok(r.status === 200 && sBk._browserKey === KBACK && r.json.minted && r.json.minted.origin === 'conversation' && BB.create({ dataDir: DATA }).lookup(CONV_B) === KBACK, '③b a conversation that already had a key gets THAT key back (the resume rung) — never a second key', r.json && r.json.minted);
  const sTwin = keyless('sess-twin', 'Twin window', { conv: CONV_B });
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://example.test/t'], wrapper: true }, as(sTwin));
  ok(r.status === 409 && r.json.code === 'no_browser_key' && r.json.why === 'held_elsewhere' && /"Back chat"/.test(r.json.error) && !sTwin._browserKey, '③b …while another LIVE session holds it, a second session of the same conversation is refused held_elsewhere, naming it (one conversation, one browser)', r.json);
  // a fork whose id is borrowed — both record shapes: stated (forkSourceId) and an older terminal fork's (forkRequested only)
  const PARENT = 'c0f7ab00-prnt-4000-8000-000000000004', KPARENT = 'bk-0000e0a1';
  store.record(PARENT, KPARENT);
  const sFk = keyless('sess-fork', 'Fork chat', { conv: PARENT, meta: { forkRequested: true, forkSourceId: PARENT }, extra: { _forkRequested: true } });
  const sFk2 = keyless('sess-fork2', 'Old terminal fork', { conv: PARENT, meta: { forkRequested: true } });
  const rf = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://example.test/f'], wrapper: true }, as(sFk));
  const rf2 = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://example.test/f'], wrapper: true }, as(sFk2));
  ok(rf.status === 409 && rf.json.why === 'fork_pending' && rf2.status === 409 && rf2.json.why === 'fork_pending' && /^restart this session \(Terminate → Resume\) to get a browser key: /.test(rf.json.error)
    && !sFk._browserKey && !sFk2._browserKey && BB.create({ dataDir: DATA }).lookup(PARENT) === KPARENT,
  '③b a fork still carrying the id it was forked from (forkSourceId, and an older terminal fork\'s bare forkRequested) is refused fork_pending — it never gets the PARENT\'s key and never binds the parent', { rf: rf.json, rf2: rf2.json });
  // remote, unknown conversation, the switches, a session gone
  const sRm = keyless('sess-remote', 'Remote chat', { conv: 'c0f7ab00-rmte-4000-8000-000000000005', extra: { hostId: 'h-remote' } });
  const sNo = keyless('sess-noid', 'No id yet', {});
  const rRm = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'x'] }, as(sRm));
  const rNo = await j('GET', '/api/browser/session/sess-noid');
  ok(rRm.status === 409 && rRm.json.why === 'remote' && /^restart this session \(Terminate → Resume\) to get a browser key: it runs on another machine/.test(rRm.json.error) && rNo.status === 409 && rNo.json.why === 'conversation_unknown' && !sRm._browserKey && !sNo._browserKey
    && eng.keylessFactOf(sRm) === null && eng.keylessFactOf(sNo) === null, '③b a remote session is refused `remote` (its rung is decided on its host at spawn — restart), a session whose conversation is not known yet `conversation_unknown` — and neither publishes "no browser yet"', { rRm: rRm.json, rNo: rNo.json });
  const beOff = BE.create({ dataDir: DATA, homeDir: HOME, serverSetting: (key) => (key === 'browser.isolateSessions' ? false : undefined), log: { warn() { }, log() { } }, env: { XDG_RUNTIME_DIR: XDG } });
  const sOff = keyless('sess-off', 'Off chat', { conv: 'c0f7ab00-off0-4000-8000-000000000006' });
  const vOff = BK.create({ browserEnv: () => beOff, keeper: () => k, activeSessions: active, readMeta: (s) => metas.get(s.sockName), persistMeta: persist, log: cap }).ensureBrowserKey(sOff, { sessionId: 'sess-off' });
  const vInt = BK.create({ browserEnv: () => be, keeper: () => k, activeSessions: active, integrationEnabled: () => false, readMeta: (s) => metas.get(s.sockName), persistMeta: persist, log: cap }).ensureBrowserKey(sOff, { sessionId: 'sess-off' });
  const gone = { claudeSessionId: 'c0f7ab00-gone-4000-8000-000000000007', sockName: 'cw-gone' };
  const vGone = eng.ensureBrowserKey(gone, { sessionId: 'sess-gone' });
  ok(vOff.why === 'isolation_off' && vInt.why === 'integration_off' && vGone.code === 'session-gone' && R.router && !sOff._browserKey && !gone._browserKey,
    '③b per-session browsers off ⇒ isolation_off, integration off ⇒ integration_off (each names its setting — a restart would not help), a session not running any more ⇒ session-gone', { vOff, vInt, vGone });

  // (c) CONTROL: an engine that forgets the session's key and decides as a NEW spawn every call mints a SECOND key
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-key.js'), 'utf8');
  const EARLY = "    if (session && B.isBrowserKey(session._browserKey)) return { ok: true, key: session._browserKey, minted: false };\n";
  const LADDER = 'const bk = B.browserKeyFor({ prior: v.reuse, resume: true, fork: false, mint: mintKey });';
  const twice = src.replace(EARLY, '').replace(LADDER, 'const bk = B.browserKeyFor({ prior: v.reuse, resume: false, fork: false, mint: mintKey });');
  // ONE judge for both engines: two calls for one keyless session — the second must answer the first's key, minting nothing
  const idempotent = (engX, id, conv) => {
    const s = keyless(id, 'Twice ' + id, { conv });
    const a = engX.ensureBrowserKey(s, { sessionId: id }), b = engX.ensureBrowserKey(s, { sessionId: id });
    return { pass: !!(a.ok && b.ok && a.minted === true && b.minted === false && a.key === b.key && s._browserKey === a.key && BB.create({ dataDir: DATA }).lookup(conv) === a.key), a: a.key, b: b.key };
  };
  const real2 = idempotent(eng, 'sess-twice-real', 'c0f7ab00-twcr-4000-8000-000000000009');
  ok(real2.pass, '③c the engine called twice for one session (two routes, two concurrent CLI commands — it is synchronous, so they cannot interleave) mints ONCE: the second answer is the first key, minted:false', real2);
  if (ok(twice !== src && !twice.includes(EARLY) && !twice.includes(LADDER), 'CONTROL ③c: the patched copy (no early return, the ladder asked as a NEW spawn) carries both edits')) {
    const engT = mkEngine(M.load('src/server/browser-key.js', twice, 'mints-twice'));
    const t2 = idempotent(engT, 'sess-twice', 'c0f7ab00-twce-4000-8000-000000000008');
    ok(!t2.pass && t2.a && t2.b && t2.a !== t2.b, 'CONTROL ③c: that copy mints a SECOND key on the second call — the same judge is RED on it (the session moves to another browser; the binding store refuses the move)', t2);
  }
  // (d) CONTROL: with the fork rule off, an older terminal fork (a bare forkRequested) gets the PARENT's key — two conversations on one browser
  const FORK = '    const forkPending = !!conversationId && (restoredForkPending(view) || BB.bindableIdOf({ ...view, browserKeyFor: conversationId }) !== conversationId);\n';
  const noFork = src.replace(FORK, '    const forkPending = false;\n');
  if (ok(noFork !== src, 'CONTROL ③d: the patched copy without the fork rule')) {
    const engF = mkEngine(M.load('src/server/browser-key.js', noFork, 'no-fork-rule'));
    const vF = engF.ensureBrowserKey(sFk2, { sessionId: 'sess-fork2' });
    ok(vF.ok && sFk2._browserKey === KPARENT, 'CONTROL ③d: that copy hands the old terminal fork its PARENT\'s key (the r6 incident — two conversations on one browser); the fork_pending assert above is what refuses it', vF);
    delete sFk2._browserKey;
  }
  // (e) WIRING: ONE mint, ONE writer of the key's session fields (spawn + first use); every route asks the engine;
  //     the server hands it the record reader + THE integration switch; the payload publishes the keyless fact
  const wsc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  const rts = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  const wir = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const svr = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(/mint: browserKeyMod\.mintKey,/.test(wsc) && /browserKeyMod\.applyKey\(session, \{ key: bk\.key, env: be, pin \}\);/.test(wsc) && !/mintBrowserKey\(/.test(wsc) && !/session\._browserKey = /.test(wsc),
    '③e WIRING PIN: ws-create\'s spawn mints through THE mint and writes the key\'s fields through THE writer (browser-key.js) — the late key calls the same two');
  ok(/r = typeof ctx\?\.ensureBrowserKey === 'function' \? ctx\.ensureBrowserKey\(f\.session, \{ sessionId: f\.sessionId \}\)/.test(rts) && !/— it cannot hold a profile'/.test(rts) && (rts.match(/needKey\(res, /g) || []).length >= 12,
    '③e WIRING PIN: needKey (every cookie route + agentFacts) asks ensureBrowserKey for a keyless session; the old dead-end sentence is gone');
  ok(/ensureBrowserKey: \(session, o\) => browserKeys\.ensureBrowserKey\(session, o\),/.test(wir) && /browserKeys = require\('\.\/browser-key'\)\.create\(\{/.test(wir) && /persistMeta: \(session, patch\) => \{ if \(persistSessionMeta && session\) persistSessionMeta\(session, patch\); \},/.test(wir)
    && /readSessionMetaOf: \(session\) => \(session\?\.sockName \? readSessionMeta\(session\.sockName\) : null\), integrationEnabled: \(\) => integrationEnabled\(\),/.test(svr),
    '③e WIRING PIN: the wiring builds the engine over the routes\' browser-env memo + the keeper, persists through persistSessionMeta (writeSessionMeta — THE choke point), and server.js hands it the record reader + THE integration switch');
  // (f) VERIFY r1 (2026-09-27, reproduced before the fix): THE LATE KEY'S DEFAULT PIN IS DATED WHEN THE SESSION STARTED.
  //     A pin is an authorization and the user's latest choice wins — a profile the user kept to ANOTHER conversation
  //     after this session started stays closed to it. The engine stamped the pin with the mint instant, so the agent's
  //     first browser command walked into the narrowed profile; the same session keyed at spawn was refused not_owner.
  // (f, r2) VERIFY r2 (2026-09-27, reproduced before the fix): A DEFAULT REACHES A CONVERSATION ONLY AT ITS START.
  //     The late key read the ladder at the MINT — so an instance / Task Group default the user set to a narrowed
  //     profile AFTER a keyless session started reached it, dated at its start ⇒ admitted (its spawn-keyed twin had
  //     landed on the default in force at ITS start). Now: a keyless spawn RECORDS its ladder's pick (`browserPinAtStart`,
  //     the WITNESS) and the late key restores exactly that (PURE lateDefaultPin / keeper.restorePin); a record without
  //     one gets the current default as a LANDING dated 0 — never an authorization on a narrowed profile; the group cap
  //     is the witness's, never the group's live value.
  {
    const T = [[{ recordedAt: 50, liveAt: 90 }, 50], [{ recordedAt: 90, liveAt: 50 }, 50], [{ recordedAt: null, liveAt: 70 }, 70], [{ recordedAt: 70 }, 70], [{}, 0], [{ recordedAt: 'x', liveAt: NaN }, 0], [{ recordedAt: 0, liveAt: -5 }, 0], [{ recordedAt: '1900000000000', liveAt: 80 }, 80]];
    const badT = T.filter(([a, want]) => B.latePinAt(a) !== want);
    ok(!badT.length && B.userPinAuthorizes({ pin: { profileId: 'bp-0000f001', by: 'user', at: B.latePinAt({ recordedAt: 50, liveAt: 90 }) }, profile: { id: 'bp-0000f001', scopeAt: 60 } }) === false
      && B.userPinAuthorizes({ pin: { profileId: 'bp-0000f001', by: 'user', at: B.latePinAt({ recordedAt: 70, liveAt: 90 }) }, profile: { id: 'bp-0000f001', scopeAt: 60 } }) === true
      && B.userPinAuthorizes({ pin: { profileId: 'bp-0000f001', by: 'user', at: B.latePinAt({}) }, profile: { id: 'bp-0000f001', scopeAt: 60 } }) === false,
    `③f latePinAt (${T.length} rows): the OLDEST of the record's and the live session's start, nothing finite ⇒ 0 — a session that started before a narrowing is not authorized by its default pin, one that started after it is, an unknown start never`, badT);
    // (r2) PURE lateDefaultPin: the witness wins over the ladder; no witness ⇒ a landing dated 0; an empty witness ⇒ nothing; the conversation's own row untouched
    const W = { profileId: 'bp-0000f002', origin: 'instance', at: 40, by: 'user' };
    const L = { profileId: 'bp-0000f003', origin: 'instance' };
    const rowsD = [
      [{ witness: W, ladder: L, startedAt: 90 }, { profileId: 'bp-0000f002', origin: 'instance', at: 40, by: 'user', source: 'witness' }],
      [{ witness: { ...W, at: 120 }, ladder: L, startedAt: 90 }, { profileId: 'bp-0000f002', origin: 'instance', at: 90, by: 'user', source: 'witness' }],
      [{ witness: { ...W, origin: 'conversation', by: 'agent' }, ladder: L, startedAt: 90 }, { profileId: 'bp-0000f002', origin: 'conversation', at: 40, by: 'agent', source: 'witness' }],
      [{ witness: { profileId: '', origin: 'harness', at: 40, by: 'user', cap: 2 }, ladder: L, startedAt: 90 }, { profileId: '', origin: 'harness', at: null, by: null, source: 'witness' }],
      [{ witness: null, ladder: L, startedAt: 90 }, { profileId: 'bp-0000f003', origin: 'instance', at: 0, by: 'user', source: 'landing' }],
      [{ witness: null, ladder: { profileId: 'bp-0000f003', origin: 'task-group' }, startedAt: 90 }, { profileId: 'bp-0000f003', origin: 'task-group', at: 0, by: 'user', source: 'landing' }],
      [{ witness: null, ladder: { profileId: 'bp-0000f004', origin: 'conversation' }, startedAt: 90 }, { profileId: 'bp-0000f004', origin: 'conversation', at: null, by: null, source: 'conversation' }],
      [{ witness: W, ladder: { profileId: 'bp-0000f004', origin: 'conversation' }, startedAt: 90 }, { profileId: 'bp-0000f004', origin: 'conversation', at: null, by: null, source: 'conversation' }],
      [{ witness: { profileId: 'not-a-profile', origin: 'instance', at: 1, by: 'user' }, ladder: L, startedAt: 90 }, { profileId: '', origin: 'harness', at: null, by: null, source: 'none', refused: 'the start-time pin record is not a pin witness' }],
      [{ witness: null, ladder: { profileId: '', origin: 'harness' }, startedAt: 90 }, { profileId: '', origin: 'harness', at: null, by: null, source: 'none' }],
    ];
    const badD = rowsD.filter(([a, want]) => JSON.stringify(B.lateDefaultPin(a)) !== JSON.stringify(want)).map(([a]) => a);
    ok(!badD.length && B.witnessCap({ cap: 2 }) === 2 && B.witnessCap({ cap: 'x' }) === null && B.witnessCap(null) === null && B.userPinAuthorizes({ pin: { profileId: 'bp-0000f003', by: 'user', at: 0 }, profile: { id: 'bp-0000f003', scopeAt: 60 } }) === false,
      `③f (r2) lateDefaultPin (${rowsD.length} rows): a witness is restored as the pick (dated no later than the start), an empty witness pins nothing, no witness ⇒ the current default as a LANDING dated 0 (never an authorization on a narrowed profile), the conversation's own row is never touched`, badD);
    // (r3) VERIFY r3 (2026-09-27, both reproduced by construction — neither shape is written by the product): ① `0 ≥ scopeAt`
    //      read TRUE on a NARROWED profile that carries no `scopeAt` (owner kind session / task with no scope date: a
    //      hand-edited or restored-after-the-migration registry), so the landing dated 0 ADMITTED the legacy session;
    //      ② a witness on a record that states NO start was dated by its own claim (a future `at` ⇒ the keeper's clock ⇒
    //      admitted to a profile narrowed just before). Now a pin dated 0 authorizes NOTHING, and a witness without a
    //      start is dated 0 like r1's unknown start.
    const narrowedNoDate = [{ id: 'bp-0000f005', owner: { kind: 'session', id: 'bk-0000f0a0' } }, { id: 'bp-0000f005', owner: { kind: 'task', id: 'T-x' } }, { id: 'bp-0000f005', owner: { kind: 'session', id: 'bk-0000f0a0' }, scopeAt: 0 }, { id: 'bp-0000f005', owner: { kind: 'instance', id: null } }];
    const rowsA = [
      ...narrowedNoDate.map((profile) => [{ pin: { profileId: 'bp-0000f005', by: 'user', at: 0 }, profile }, false]),
      ...narrowedNoDate.map((profile) => [{ pin: { profileId: 'bp-0000f005', by: 'user', at: 5 }, profile }, true]),
      [{ pin: { profileId: 'bp-0000f005', by: 'user', at: 0 }, profile: { id: 'bp-0000f005', owner: { kind: 'session', id: 'bk-0000f0a0' }, scopeAt: 60 } }, false],
      [{ pin: { profileId: 'bp-0000f005', by: 'user', at: '0' }, profile: { id: 'bp-0000f005', owner: { kind: 'task', id: 'T-x' } } }, false],
      [{ pin: { profileId: 'bp-0000f005', by: 'user' }, profile: { id: 'bp-0000f005', owner: { kind: 'task', id: 'T-x' } } }, false],
      [{ pin: { profileId: 'bp-0000f005', by: 'user', at: 60 }, profile: { id: 'bp-0000f005', owner: { kind: 'session', id: 'bk-0000f0a0' }, scopeAt: 60 } }, true],
    ];
    const badA = rowsA.filter(([a, want]) => B.userPinAuthorizes(a) !== want).map(([a]) => a);
    const rowsN = [
      [{ witness: { ...W, at: 120 }, ladder: L, startedAt: 0 }, { profileId: 'bp-0000f002', origin: 'instance', at: 0, by: 'user', source: 'witness' }],
      [{ witness: { ...W, at: 120 }, ladder: L }, { profileId: 'bp-0000f002', origin: 'instance', at: 0, by: 'user', source: 'witness' }],
      [{ witness: { ...W, at: 120 }, ladder: L, startedAt: NaN }, { profileId: 'bp-0000f002', origin: 'instance', at: 0, by: 'user', source: 'witness' }],
      [{ witness: { ...W, at: 120 }, ladder: L, startedAt: 100 }, { profileId: 'bp-0000f002', origin: 'instance', at: 100, by: 'user', source: 'witness' }],
    ];
    const badN = rowsN.filter(([a, want]) => JSON.stringify(B.lateDefaultPin(a)) !== JSON.stringify(want)).map(([a]) => a);
    ok(!badA.length && !badN.length, `③f (r3) userPinAuthorizes (${rowsA.length} rows): a pin dated 0 (the landing) authorizes NOTHING — not a narrowed profile without a scope date either; a dated pin answers by the date. lateDefaultPin (${rowsN.length} rows): a witness on a record with no known start is dated 0, never by its own claim`, { badA, badN });
    // the REAL keeper + routes + browser-env on their OWN data dir (an instance default needs its own keeper's setting)
    const DATA2 = path.join(ROOT, 'data-late-pin'), HOME2 = path.join(ROOT, 'home-late-pin');
    for (const d of [DATA2, path.join(HOME2, '.agent-browser')]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    const T0 = clock, T1 = clock + 60_000, T2 = clock + 120_000, T3 = clock + 180_000, T4 = clock + 240_000;
    const settings2 = { 'browser.defaultProfile': 'Bank' };
    const groups2 = [{ id: 'T-late', browserProfileId: null, browserCap: null }];
    const set2 = (key) => settings2[key];
    const active2 = new Map();
    const env2 = { ...env, HOME: HOME2 };
    const groupsFor2 = ({ initialGroupId = null } = {}) => groups2.filter((g) => initialGroupId && g.id === initialGroupId);
    const k2 = K.create({ dataDir: DATA2, homeDir: HOME2, env: () => env2, serverSetting: set2, liveKeys: () => new Set([...active2.values()].map((x) => x && x._browserKey).filter(Boolean)), runtime: F.createBrowserRuntime({ env: env2 }), facts: F.createBrowserFacts({ env: env2 }), log: { log() { }, warn() { }, error() { } }, install: false, now: () => clock, conversationFacts: () => ({ turn: 'idle', name: null }),
      taskGroupDefault: (f) => { const g = groupsFor2(f).find((x) => x.browserProfileId); return g ? g.browserProfileId : ''; }, taskGroupCap: (f) => { const g = groupsFor2(f).find((x) => Number.isInteger(x.browserCap)); return g ? g.browserCap : null; } });
    const be2 = BE.create({ dataDir: DATA2, homeDir: HOME2, serverSetting: set2, serverNotice: null, telemetry: null, log: { warn() { }, log() { } }, env: { XDG_RUNTIME_DIR: XDG } });
    const metas2 = new Map();
    const store2 = BB.create({ dataDir: DATA2, log: { warn() { } } });
    const persist2 = (session, patch) => { const meta = { ...(metas2.get(session.sockName) || {}), ...patch }; metas2.set(session.sockName, meta); if (meta && meta.browserKey) { const sid = store2.bindableIdOf(meta); if (sid) store2.record(sid, meta.browserKey); else store2.noteUnbound(meta, session.sockName); } };
    const mkEngine2 = (mod) => mod.create({ browserEnv: () => be2, keeper: () => k2, activeSessions: active2, integrationEnabled: () => true, readMeta: (x) => metas2.get(x.sockName) || null, persistMeta: persist2, log: cap });
    const ctx2 = (engine) => ({ keeper: k2, activeSessions: active2, browserEnv: () => be2, adoptRoots: { homeDir: HOME2, dataDir: DATA2 }, notice: () => { }, persistPin: () => { }, tasksForSession: () => [], ensureBrowserKey: (x, o) => engine.ensureBrowserKey(x, o) });
    let n2 = 0;
    /** a keyless LIVE session started at `startedAt`; `witness` = what ws-create records for a keyless spawn since r2 (undefined = a record from before r2) */
    const late2 = (id, name, conv, startedAt, { recorded = startedAt, witness = undefined, taskId = null, meta = {} } = {}) => {
      const x = { agentToken: 'vsst_' + ('y' + String(++n2)).repeat(12), name, webuiName: name, mode: 'chat', createdAt: startedAt, cwd: ROOT, sockName: 'cw-' + id, claudeSessionId: conv, _initialGroupId: taskId };
      metas2.set(x.sockName, { webuiSessionId: id, name, cwd: ROOT, claudeSessionId: conv, ...(recorded === null ? {} : { createdAt: recorded }), ...(witness === undefined ? {} : { browserPinAtStart: witness }), ...meta });
      active2.set(id, x);
      return x;
    };
    /** THE SPAWN PATH at the keeper's clock, verbatim in shape (ws-create: browserKeyFor → pinForCreate → envFor → applyKey → setPin / copyPin → stampGroupCap) */
    const spawn2 = (id, name, conv, { resumeId = null, fork = false, forkedFromId = null, explicit = '', taskId = null } = {}) => {
      const x = late2(id, name, conv, clock, { taskId });
      const prior = (resumeId && !fork) ? be2.priorKeyFor(resumeId) : '';
      const bk = B.browserKeyFor({ prior, resume: !!resumeId, fork, mint: BK.mintKey });
      const forkParentKey = fork ? be2.priorKeyFor(forkedFromId || resumeId) : '';
      const pin = k2.pinForCreate({ explicit, priorKey: prior, forkParentKey, taskGroupDefault: k2.taskGroupDefaultFor({ cwd: ROOT, initialGroupId: taskId }), resume: !!resumeId, fork });
      const e = be2.envFor({ browserKey: bk.key, integrationOn: true, remote: false, cwd: ROOT, pinnedDir: null });
      BK.applyKey(x, { key: bk.key, env: e, pin });
      if (pin.profileId && pin.origin !== 'conversation') k2.setPin(bk.key, pin.profileId, { origin: pin.origin });
      else if (pin.profileId && fork && forkParentKey && forkParentKey !== bk.key) k2.copyPin(forkParentKey, bk.key);
      k2.stampGroupCap(bk.key, { cwd: ROOT, initialGroupId: taskId }); x._browserCap = k2.capOf(bk.key);
      persist2(x, { browserKey: bk.key, browserVariant: e.variant, browserKeyFor: resumeId && !fork ? resumeId : undefined, forkSourceId: fork ? (forkedFromId || resumeId) : undefined, browserProfileId: x._browserProfileId || undefined, browserPinOrigin: x._browserPinOrigin || undefined });
      return x;
    };
    /** the WITNESS ws-create writes for a keyless spawn at the keeper's clock (the same ladder read, unapplied) */
    const witness2 = ({ taskId = null, explicit = '', forkParentKey = '' } = {}) => {
      const pin = k2.pinForCreate({ explicit, priorKey: '', forkParentKey, taskGroupDefault: k2.taskGroupDefaultFor({ cwd: ROOT, initialGroupId: taskId }), resume: false, fork: !!forkParentKey });
      const capv = k2.taskGroupCapFor({ cwd: ROOT, initialGroupId: taskId });
      if (pin.profileId && pin.origin !== 'conversation') return { profileId: pin.profileId, origin: pin.origin, at: clock, by: 'user', cap: capv };
      if (pin.profileId && forkParentKey) { const pp = k2.pinFor(forkParentKey); return pp ? { profileId: pp.profileId, origin: 'conversation', at: pp.at, by: pp.by, cap: capv } : null; }
      return { profileId: '', origin: 'harness', at: clock, by: 'user', cap: capv };
    };
    const openIn = (x) => j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://bank.example/'], wrapper: true }, as(x));
    /** a scene's sessions leave: their temporary browsers stopped, their leases released (the machine ceiling counts live records) */
    const retire = async (...xs) => {
      for (const x of xs) {
        if (x && B.isBrowserKey(x._browserKey)) { try { await k2.stopEphemeralOf(x._browserKey); } catch { /* none */ } for (const l of k2.leasesOn(PB).filter((l2) => l2.browserKey === x._browserKey)) { try { k2.detach({ profileId: PB, browserKey: x._browserKey, by: 'user' }); } catch { /* released */ } } }
        for (const [id, v] of active2) if (v === x) active2.delete(id);
      }
      try { await k2.stop(PB).catch(() => { }); } catch { /* none */ }
    };
    const admitted = (r, x, P) => (r.status === 200 && r.json.kind === 'attachment' && r.json.profile && r.json.profile.id === P) || (r.json && r.json.code === 'browser_busy') || k2.leasesOn(P).some((l) => l.browserKey === x._browserKey);
    const verdict = (r, x, P) => (admitted(r, x, P) ? 'admitted' : r.status === 200 ? r.json.kind : (r.json && r.json.code) || ('http' + r.status));
    /** The scene: "Bank" is the instance default; the USER keeps it to First chat at T1; a keyless session that STARTED
     *  at T0 issues its first bare command at T2. */
    R.setup(ctx2(mkEngine2(BK)));
    clock = T0;
    const made = await j('POST', '/api/browser/profiles', { label: 'Bank' });
    const PB = made.json && made.json.profile && made.json.profile.id;
    const PO = (await j('POST', '/api/browser/profiles', { label: 'Old' })).json.profile.id;
    const before = late2('sess-lp-before', 'Started before', 'c0f7ab00-lpb0-4000-8000-00000000000a', T0, { witness: witness2() });
    clock = T1;
    k2.updateProfile(PB, { scope: 'one', conversation: 'bk-0000f1a1' });
    clock = T2;
    const r1 = await openIn(before);
    const real = { P: PB, r1, pin1: k2.pinFor(before._browserKey), leased: k2.leasesOn(PB).map((l) => l.browserKey), key: before._browserKey };
    real.refused = r1.status === 403 && r1.json.code === 'not_owner' && r1.json.pinned === true && real.leased.length === 0 && !!real.pin1 && real.pin1.at === T0 && real.pin1.by === 'user';
    ok(real.refused && B.isBrowserKey(real.key) && !CMDLINE_RE.test(real.r1.json.error || ''), '③f a keyless session that STARTED before the user kept the instance-default profile to another conversation (its spawn witnessed Bank): its first command mints its key, its witnessed pin is dated at its START, and the profile stays closed to it — not_owner naming the button, nothing opened instead', { status: real.r1.status, json: real.r1.json, pin: real.pin1, leased: real.leased });
    // …and one that started AFTER the narrowing WITH the witness is admitted by the same default (what the spawn gave its twin)
    clock = T2 + 1000;
    const after = late2('sess-lp-after', 'Started after', 'c0f7ab00-lpa0-4000-8000-00000000000b', T2 + 1000, { witness: witness2() });
    const twinAfter = spawn2('sess-lp-after-spawn', 'Started after (spawned)', 'c0f7ab00-lpa1-4000-8000-00000000000e');
    const r2 = await openIn(after), r2s = await openIn(twinAfter);
    ok(verdict(r2, after, PB) === 'admitted' && verdict(r2s, twinAfter, PB) === 'admitted' && k2.pinFor(after._browserKey).at === T2 + 1000 && k2.pinFor(after._browserKey).origin === 'instance', '③f …a session that started AFTER the narrowing, its spawn having witnessed Bank, is admitted by that default exactly as its spawn-keyed twin is (the default in force at the start is the user\'s configured choice)', { late: verdict(r2, after, PB), spawn: verdict(r2s, twinAfter, PB), pin: k2.pinFor(after._browserKey) });
    // a restored session whose record states its start: the record wins over the (later) restore instant on the live session
    clock = T2 + 2000;
    const restored = late2('sess-lp-restored', 'Restored', 'c0f7ab00-lpr0-4000-8000-00000000000c', T2 + 2000, { recorded: T0, witness: { profileId: PB, origin: 'instance', at: T0, by: 'user' } });
    const r3 = await openIn(restored);
    ok(r3.status === 403 && r3.json.code === 'not_owner' && k2.pinFor(restored._browserKey).at === T0, '③f …a restored session is dated by its RECORD\'s start (the older of the two), never its restore instant', { status: r3.status, pin: k2.pinFor(restored._browserKey) });
    // the keeper only ever dates a pin EARLIER than its own clock
    const kf = 'bk-0000f1c1';
    k2.setPin(kf, real.P, { origin: 'instance', at: clock + 9_999_999 });
    const future = k2.pinFor(kf).at;
    k2.setPin(kf, real.P, { origin: 'instance', at: 'soon' });
    const rp = k2.restorePin('bk-0000f1c2', { profileId: real.P, origin: 'instance', at: clock + 9_999_999, by: 'user' });
    ok(future === clock && k2.pinFor(kf).at === clock && rp && rp.at === clock && k2.restorePin('bk-0000f1c3', { profileId: real.P, origin: 'harness', at: 1, by: 'user' }) === null && k2.restorePin('bk-0000f1c3', { profileId: 'bp-00000000', origin: 'instance', at: 1, by: 'user' }) === null,
      '③f keeper.setPin / restorePin: an `at` in the future (or not a number) is the keeper\'s own clock — no caller mints a fresher authorization; restorePin takes only a pin witness naming a profile that exists', { future, clock, rp });
    // ── (r2) THE FOUR REPRODUCED SCENES: a default set AFTER the start (instance / Task Group), the cap, the fork ──
    // A1: instance default Old at the start; Bank (narrowed at T1) becomes the default at T3 > start; the mint at T4
    // the order that reproduced: the user narrows Bank (T1), the sessions START on the default Old (T2), the user makes
    // Bank the default (T3), the mint (T4) — r1's date alone admits here (the start is after the narrowing)
    clock = T1 + 10; k2.updateProfile(PB, { scope: 'all' }); k2.updateProfile(PB, { scope: 'one', conversation: 'bk-0000f1a1' });
    clock = T2 + 10; settings2['browser.defaultProfile'] = 'Old';
    const keyedA1 = spawn2('sess-r2-a1-keyed', 'A1 keyed', 'c0f7ab00-r2a1-4000-8000-000000000001');
    const lateA1 = late2('sess-r2-a1-late', 'A1 late (witnessed)', 'c0f7ab00-r2a1-4000-8000-000000000002', T2 + 10, { witness: witness2() });
    const legacyA1 = late2('sess-r2-a1-legacy', 'A1 late (no witness)', 'c0f7ab00-r2a1-4000-8000-000000000003', T2 + 10);
    clock = T3; settings2['browser.defaultProfile'] = 'Bank';
    clock = T4;
    const vK = verdict(await openIn(keyedA1), keyedA1, PB), vL = await openIn(lateA1), vG = await openIn(legacyA1);
    ok(vK !== 'admitted' && k2.pinFor(keyedA1._browserKey).profileId === PO, 'CONTROL ③f (r2): the spawn-keyed twin landed on the default in force at ITS start (Old) — the later default never reached it');
    ok(verdict(vL, lateA1, PB) !== 'admitted' && k2.pinFor(lateA1._browserKey).profileId === PO && k2.pinFor(lateA1._browserKey).at === T2 + 10, '③f (r2) A1: the late key of a session that STARTED on Old (its spawn\'s witness) is pinned to Old, never to the Bank the user made the default later', { v: verdict(vL, lateA1, PB), pin: k2.pinFor(lateA1._browserKey) });
    ok(verdict(vG, legacyA1, PB) !== 'admitted' && vG.status === 403 && vG.json.code === 'not_owner' && vG.json.pinned === true && k2.pinFor(legacyA1._browserKey).profileId === PB && k2.pinFor(legacyA1._browserKey).at === 0, '③f (r2) A1: a record from before r2 (no witness) gets the current default as a LANDING dated 0 — the bare command names Bank and is refused not_owner by the button, never admitted, never a silent temporary browser', { v: verdict(vG, legacyA1, PB), json: vG.json && vG.json.code, pin: k2.pinFor(legacyA1._browserKey) });
    await retire(before, after, twinAfter, restored, keyedA1, lateA1, legacyA1);
    // A2 + A3: the Task Group's default / cap set after the start
    clock = T2 + 20; settings2['browser.defaultProfile'] = '';
    const keyedA2 = spawn2('sess-r2-a2-keyed', 'A2 keyed in T', 'c0f7ab00-r2a2-4000-8000-000000000001', { taskId: 'T-late' });
    const lateA2 = late2('sess-r2-a2-late', 'A2 late in T (witnessed)', 'c0f7ab00-r2a2-4000-8000-000000000002', T2 + 20, { witness: witness2({ taskId: 'T-late' }), taskId: 'T-late' });
    const legacyA2 = late2('sess-r2-a2-legacy', 'A2 late in T (no witness)', 'c0f7ab00-r2a2-4000-8000-000000000003', T2 + 20, { taskId: 'T-late' });
    clock = T3 + 20; groups2[0].browserProfileId = PB; groups2[0].browserCap = 5;
    clock = T4 + 20;
    const a2K = await openIn(keyedA2), a2L = await openIn(lateA2), a2G = await openIn(legacyA2);
    ok(a2K.status === 200 && a2K.json.kind === 'ephemeral' && k2.groupCapOf(keyedA2._browserKey) === null, 'CONTROL ③f (r2): the spawn-keyed twin in the group got NO default and NO group cap (none at its start) — its own temporary browser');
    ok(a2L.status === 200 && a2L.json.kind === 'ephemeral' && !k2.pinFor(lateA2._browserKey) && k2.groupCapOf(lateA2._browserKey) === null, '③f (r2) A2/A3: the witnessed late key in the group pins nothing and stamps no group cap — the group\'s later default and cap never reach a conversation that started before them', { v: verdict(a2L, lateA2, PB), pin: k2.pinFor(lateA2._browserKey), cap: k2.groupCapOf(lateA2._browserKey) });
    ok(verdict(a2G, legacyA2, PB) !== 'admitted' && a2G.json && a2G.json.code === 'not_owner' && k2.pinFor(legacyA2._browserKey).at === 0 && k2.groupCapOf(legacyA2._browserKey) === null, '③f (r2) A2/A3: a record without a witness lands on the group\'s default at 0 (refused by the button on a narrowed one) and stamps NO group cap (the group is never read live)', { v: verdict(a2G, legacyA2, PB), cap: k2.groupCapOf(legacyA2._browserKey) });
    await retire(keyedA2, lateA2, legacyA2);
    groups2[0].browserProfileId = null; groups2[0].browserCap = null;
    // A4: an adopted FORK — the spawn copies the parent's pin verbatim (the parent's user pin is STALE: older than the narrowing)
    clock = T0 + 30; settings2['browser.defaultProfile'] = 'Bank';
    const parentA4 = spawn2('sess-r2-a4-parent', 'A4 parent', 'c0f7ab00-r2a4-4000-8000-000000000001');
    k2.setPin(parentA4._browserKey, PB, { origin: 'chosen', by: 'user' });
    clock = T4 + 30;
    const forkK = spawn2('sess-r2-a4-fork-keyed', 'A4 fork keyed', 'c0f7ab00-r2a4-4000-8000-000000000002', { fork: true, forkedFromId: 'c0f7ab00-r2a4-4000-8000-000000000001' });
    const forkL = late2('sess-r2-a4-fork-late', 'A4 fork late (witnessed)', 'c0f7ab00-r2a4-4000-8000-000000000003', T4 + 30, { witness: witness2({ forkParentKey: parentA4._browserKey }), meta: { forkSourceId: 'c0f7ab00-r2a4-4000-8000-000000000001', forkedFrom: ['c0f7ab00-r2a4-4000-8000-000000000001'], forkRequested: false } });
    const a4K = await openIn(forkK), a4L = await openIn(forkL);
    ok(a4K.status === 403 && a4K.json.code === 'not_owner' && k2.pinFor(forkK._browserKey).origin === 'conversation' && k2.pinFor(forkK._browserKey).at === T0 + 30, 'CONTROL ③f (r2): the spawn-keyed fork carries its parent\'s STALE user pin verbatim (origin conversation, the parent\'s date) ⇒ not_owner');
    ok(a4L.status === 403 && a4L.json.code === 'not_owner' && k2.pinFor(forkL._browserKey).origin === 'conversation' && k2.pinFor(forkL._browserKey).at === T0 + 30 && k2.pinFor(forkL._browserKey).by === 'user', '③f (r2) A4: the witnessed late key of a fork restores the parent\'s row verbatim — the same stale pin, the same refusal (never the instance default dated at the fork\'s own start)', { v: verdict(a4L, forkL, PB), pin: k2.pinFor(forkL._browserKey) });
    await retire(parentA4, forkK, forkL);
    // an explicit pick at a keyless spawn (the New Session dialog's profile row is not gated on the switch) is the user's choice at the start: witnessed as `chosen`
    clock = T4 + 40; settings2['browser.defaultProfile'] = '';
    const chosen = late2('sess-r2-chosen', 'Chosen at a keyless spawn', 'c0f7ab00-r2ch-4000-8000-000000000001', T4 + 40, { witness: witness2({ explicit: PO }) });
    const rc = await openIn(chosen);
    ok(rc.status === 200 && rc.json.kind === 'attachment' && rc.json.profile.id === PO && k2.pinFor(chosen._browserKey).origin === 'chosen', '③f (r2) a profile the user picked in the New Session dialog while the switch was off is witnessed as `chosen` and restored — the pick is no longer lost', { v: verdict(rc, chosen, PO), pin: k2.pinFor(chosen._browserKey) });
    try { await k2.stop(PO).catch(() => { }); } catch { /* none */ }
    await retire(chosen);
    // ── (r2) THE SPAWN ↔ LATE PARITY TABLE: scope × start-vs-narrowing × default-set-before-vs-after-the-start — with the
    //    witness the two columns are identical; the spawn's own answers are pinned beside them ──
    {
      const rows = [];
      let seq = 0;
      const scene = async ({ scope, startBefore, defaultBefore }) => {
        clock = T0 + 1000 + (++seq) * 100;
        k2.updateProfile(PB, { scope: 'all' }); settings2['browser.defaultProfile'] = defaultBefore ? 'Bank' : '';
        const narrowAt = clock + 50;
        const startAt = startBefore ? clock : narrowAt + 10;
        const narrow = () => { clock = narrowAt; if (scope === 'one:X') k2.updateProfile(PB, { scope: 'one', conversation: 'bk-0000f9f9' }); };
        const start = () => { clock = startAt; const sp = spawn2(`sess-pt-${seq}-s`, `pt${seq} spawn`, `c0f7ab00-pt${String(seq).padStart(2, '0')}-4000-8000-000000000001`); const lt = late2(`sess-pt-${seq}-l`, `pt${seq} late`, `c0f7ab00-pt${String(seq).padStart(2, '0')}-4000-8000-000000000002`, startAt, { witness: witness2() }); return [sp, lt]; };
        let pair;
        if (startBefore) { pair = start(); narrow(); } else { narrow(); pair = start(); }
        if (!defaultBefore) { clock = Math.max(clock, startAt) + 20; settings2['browser.defaultProfile'] = 'Bank'; }
        clock = narrowAt + 1000;
        const vs = verdict(await openIn(pair[0]), pair[0], PB), vl = verdict(await openIn(pair[1]), pair[1], PB);
        rows.push({ scope, startBefore, defaultBefore, spawn: vs, late: vl });
        await retire(pair[0], pair[1]);
      };
      for (const scope of ['all', 'one:X']) for (const startBefore of [true, false]) for (const defaultBefore of [true, false]) await scene({ scope, startBefore, defaultBefore });
      const diff = rows.filter((r) => r.spawn !== r.late);
      console.log('    ' + rows.map((r) => `${r.scope}/${r.startBefore ? 'started-before' : 'started-after'}/${r.defaultBefore ? 'default-before' : 'default-after'}: spawn ${r.spawn} · late ${r.late}`).join('\n    '));
      // the spawn's own answers: the default in force at the start, dated at the start (r1); no default at the start ⇒ a temporary browser
      const expected = (r) => (!r.defaultBefore ? 'ephemeral' : r.scope === 'all' ? 'admitted' : r.startBefore ? 'not_owner' : 'admitted');
      const offRow = rows.filter((r) => r.spawn !== expected(r));
      ok(!diff.length && !offRow.length, `③f (r2) THE PARITY TABLE (${rows.length} rows: scope all / one:X × started before / after the narrowing × default set before / after the start): the spawn-keyed session and the witnessed late-keyed one answer IDENTICALLY (never looser, never stricter), and the spawn's column is its own rule`, rows);
    }
    // CONTROL 1: the engine as it was before r2 (the ladder's pick at the MINT, dated at the start) — the same judge ADMITS
    const AT2 = "late = B.lateDefaultPin({ witness, ladder: ladder.refused ? { profileId: '', origin: 'harness' } : ladder, startedAt });";
    const asBefore = src.replace(AT2, "late = ladder.refused ? { profileId: '', origin: 'harness', at: null, by: null, source: 'none' } : { profileId: ladder.profileId || '', origin: ladder.origin, at: startedAt, by: 'user', source: ladder.origin === 'conversation' ? 'conversation' : 'witness' };");
    if (ok(asBefore !== src && !asBefore.includes(AT2), 'CONTROL ③f (r2): the patched copy (the ladder read at the MINT, dated at the start — the r1 engine)')) {
      const engU = mkEngine2(M.load('src/server/browser-key.js', asBefore, 'ladder-at-mint'));
      R.setup(ctx2(engU));
      clock = T1 + 50; k2.updateProfile(PB, { scope: 'all' }); k2.updateProfile(PB, { scope: 'one', conversation: 'bk-0000f1a1' });
      clock = T2 + 50; settings2['browser.defaultProfile'] = 'Old';
      const legacyU = late2('sess-r2-ctl-legacy', 'A1 control (no witness)', 'c0f7ab00-r2c1-4000-8000-000000000001', T2 + 50);
      const witU = late2('sess-r2-ctl-wit', 'A1 control (witnessed Old)', 'c0f7ab00-r2c1-4000-8000-000000000002', T2 + 50, { witness: witness2() });
      clock = T3 + 50; settings2['browser.defaultProfile'] = 'Bank';
      clock = T4 + 50;
      const ru1 = await openIn(legacyU), ru2 = await openIn(witU);
      ok(verdict(ru1, legacyU, PB) === 'admitted' && k2.pinFor(legacyU._browserKey).profileId === PB && k2.pinFor(legacyU._browserKey).at === T2 + 50,
        'CONTROL ③f (r2): that copy ADMITS the session to the profile the user kept to another conversation (the default it never started on, dated at its start) — the landing at 0 is what stops it', { v: verdict(ru1, legacyU, PB), pin: k2.pinFor(legacyU._browserKey) });
      ok(verdict(ru2, witU, PB) === 'admitted' && k2.pinFor(witU._browserKey).profileId === PB, 'CONTROL ③f (r2): …and it ignores the witness too (the session that started on Old walks into Bank) — the witness is what the r2 engine restores', { v: verdict(ru2, witU, PB), pin: k2.pinFor(witU._browserKey) });
      await retire(legacyU, witU);
    }
    // CONTROL 2: a copy that stamps the group cap from the group LIVE — the same judge sees the later cap
    const CAP2 = "k.stampGroupCap(bk.key, groupFacts, { value: B.witnessCap(witness) });";
    const liveCap = src.replace(CAP2, 'k.stampGroupCap(bk.key, groupFacts);');
    if (ok(liveCap !== src && !liveCap.includes(CAP2), 'CONTROL ③f (r2): the patched copy (the group cap read LIVE at the mint)')) {
      const engC = mkEngine2(M.load('src/server/browser-key.js', liveCap, 'live-cap'));
      R.setup(ctx2(engC));
      clock = T0 + 60; groups2[0].browserProfileId = null; groups2[0].browserCap = null; settings2['browser.defaultProfile'] = '';
      const capL = late2('sess-r2-ctl-cap', 'A3 control', 'c0f7ab00-r2c2-4000-8000-000000000001', T0 + 60, { witness: witness2({ taskId: 'T-late' }), taskId: 'T-late' });
      clock = T3 + 60; groups2[0].browserCap = 4;
      clock = T4 + 60;
      await j('GET', '/api/agent/browser/status', undefined, as(capL));
      ok(k2.groupCapOf(capL._browserKey) === 4, 'CONTROL ③f (r2): that copy stamps the cap the group has NOW (4) on a conversation that started with none — the witness\'s value is what keeps it at none', { cap: k2.groupCapOf(capL._browserKey) });
    }
    // (r3) THE REAL KEEPER: the landing dated 0 on a narrowed profile that carries no scope date — the registry shape
    //      constructed in place (the product never writes it: every narrowing stamps scopeAt), the legacy late key refused
    R.setup(ctx2(mkEngine2(BK)));
    clock = T4 + 70; k2.updateProfile(PB, { scope: 'all' }); k2.updateProfile(PB, { scope: 'one', conversation: 'bk-0000f1a1' });
    const rec3 = k2.profile(PB); delete rec3.scopeAt; // a narrowed record with NO scope date (what a restored pre-ruling registry holds)
    ok(B.scopeOf(k2.profile(PB)) === 'one' && k2.profile(PB).scopeAt === undefined, 'setup ③f (r3): Bank is narrowed and carries no scopeAt');
    settings2['browser.defaultProfile'] = 'Bank';
    const legacy3 = late2('sess-r3-legacy', 'r3 legacy (no witness)', 'c0f7ab00-r3l0-4000-8000-000000000001', T4 + 71);
    const witness3 = late2('sess-r3-nostart', 'r3 witness, no start', 'c0f7ab00-r3l0-4000-8000-000000000002', 0, { recorded: null, witness: { profileId: PB, origin: 'instance', at: T4 + 999_999, by: 'user', cap: null } });
    witness3.createdAt = 0;
    clock = T4 + 72;
    const r3a = await openIn(legacy3), r3b = await openIn(witness3);
    ok(verdict(r3a, legacy3, PB) !== 'admitted' && r3a.status === 403 && r3a.json.code === 'not_owner' && k2.pinFor(legacy3._browserKey).at === 0, '③f (r3) the legacy landing (dated 0) on a narrowed profile WITHOUT a scope date is refused not_owner by the button — a landing is never an authorization', { v: verdict(r3a, legacy3, PB), pin: k2.pinFor(legacy3._browserKey) });
    ok(verdict(r3b, witness3, PB) !== 'admitted' && r3b.status === 403 && r3b.json.code === 'not_owner' && k2.pinFor(witness3._browserKey).at === 0, '③f (r3) a witness on a record that states no start is restored dated 0 — refused on the narrowed profile, never dated by its own (future) claim', { v: verdict(r3b, witness3, PB), pin: k2.pinFor(witness3._browserKey) });
    await retire(legacy3, witness3);
    // CONTROL 3 (r3): the PURE verdicts as they were — `0 ≥ (scopeAt||0)` and a start-less witness dated by its own claim — answer the OTHER way on the same rows
    const srcB = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
    const R3A = '  if (!(at > 0)) return false;\n';
    const R3N = "at: started ? Math.min(started, witness.at) : 0, by: witness.by, source: 'witness' };";
    const asWas = srcB.replace(R3A, '').replace(R3N, "at: started ? Math.min(started, witness.at) : witness.at, by: witness.by, source: 'witness' };");
    if (ok(asWas !== srcB && !asWas.includes(R3A) && !asWas.includes(R3N), 'CONTROL ③f (r3): the patched copy (the r2 verdicts: a landing at 0 passes `0 ≥ scopeAt`, a start-less witness keeps its own date)')) {
      const B0 = M.load('src/browser-profiles.js', asWas, 'r2-verdicts');
      const flippedA = rowsA.filter(([a, want]) => B0.userPinAuthorizes(a) !== want).map(([a]) => a);
      const flippedN = rowsN.filter(([a, want]) => JSON.stringify(B0.lateDefaultPin(a)) !== JSON.stringify(want)).map(([a]) => a);
      const wantFlipA = rowsA.filter(([a]) => !(Number(a.pin.at) > 0) && !(Number(a.profile.scopeAt) > 0)).length;
      ok(wantFlipA >= 4 && flippedA.length === wantFlipA && flippedA.every((a) => !(Number(a.pin.at) > 0)) && flippedN.length === 3, `CONTROL ③f (r3): that copy ADMITS the landing dated 0 on every narrowed profile without a scope date (${flippedA.length} rows flip) and dates the start-less witness by its own claim (${flippedN.length} rows flip) — the r3 rules are what refuse them`, { flippedA: flippedA.length, flippedN: flippedN.length });
    }
    try { for (const p of k2.list().profiles) await k2.stop(p.id).catch(() => { }); } catch { /* none */ }
    k2.shutdown();
    clock = T0;
  }
  R.setup(ctxFor(k));
  for (const id of ['sess-late', 'sess-ui', 'sess-back', 'sess-twin', 'sess-fork', 'sess-fork2', 'sess-remote', 'sess-noid', 'sess-off', 'sess-twice', 'sess-twice-real']) active.delete(id);
}

// ── the client's DOM-free helpers ──
{
  const P = await import(path.join(REPO, 'src/lib/browser-profile-picker.js'));
  const profs = [{ id: 'bp-1', label: 'Work', scope: 'all', owner: { kind: 'instance' } }, { id: 'bp-2', label: 'Bank', scope: 'one', owner: { kind: 'session', id: KA } }, { id: 'bp-3', label: 'Team', scope: 'all', mediated: true, owner: { kind: 'instance' } }];
  const items = P.pickerItems({ profiles: profs, pinnedId: 'bp-2', onPin() { }, onAdopt() { }, nameOf: (bkx) => (bkx === KA ? 'First chat' : '') });
  const labels = items.map((x) => x.label || '').join('|');
  ok(/Work/.test(labels) && /✓ Bank \(only First chat\)/.test(labels) && /Team/.test(labels), 'the picker offers EVERY named profile — a separate-tabs (mediated) one too — and marks one kept to a conversation "(only <name>)"', labels);
}
for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 8 })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));

try { for (const p of k.list().profiles) await k.stop(p.id).catch(() => { }); } catch { /* none */ }
k.shutdown();
srv.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

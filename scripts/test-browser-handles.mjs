#!/usr/bin/env node
// AGENT BROWSER P1 second half — THE ATTACHMENT SET, HANDLES AND THE TWO NAMED
// REFUSALS (docs/design-agent-browser-v2.md §3.7 + §3.8 layer ①, §3.2.5's
// adopt; §9's `test-browser-handles` row). FAST tier: no real browser, no port
// claimed by name (the express app listens on 0), scratch dirs only, ~5 s.
//
// What it proves, in order:
//   ① the PURE model: aliases (slug, uniqueness, fallback), child handles, a
//      filesystem PATH told apart from a handle, the attachment SET (which one
//      is the default, a fingerprint that moves on add/remove/default-move and
//      on nothing else), `resolveHandle`'s outcomes (none / one / two ⇒
//      profile_required listing every handle with the default marked — the
//      sub-agent clause an ASIDE and never the reason — / alias / id / label /
//      ambiguous / not_attached / profile_path_refused with the REMEDY), the
//      one-time `profile_changed` (told bookkeeping), the audit line (verb
//      only, never a fill's content), the child env (rung C unsets the
//      inherited profile symlink);
//   ② the REAL keeper over a FAKE `agent-browser`: attach with an alias (bad /
//      taken refused), the set view, `resolveFor` = the blindness check THEN
//      the handle, a pin moving the default ⇒ refused exactly once, children
//      minted / resolved / reaped by prefix, the audit file, `adoptScratch`
//      moving a scratch dir under ~/.agent-browser/, the Task-Group rung's
//      keeper dep;
//   ③ the routes + the shipped CLI + a REAL browser-env: two attachments ⇒ a
//      bare `--` command is refused `profile_required`, `--profile <handle>` /
//      `VIBESPACE_BROWSER` run under that profile's daemon, a PATH is refused
//      with the `new --adopt` remedy, a USER's pin (the UI route) re-points the
//      per-session config WITHOUT a restart (the direct `agent-browser` command
//      resolves to the DEFAULT's user-data-dir and to no other — layer ①'s
//      honest boundary) and refuses the CLI's next command ONCE with was → now,
//      the agent's OWN pin never earns a refusal, `new-child` + a child
//      command, the audit line, the UI attach/detach/pin notices, `--adopt`.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, deadPort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)
const require = createRequire(import.meta.url);
const B = require('../src/browser-profiles.js');
const F = require('../src/browser-facts.js');
const K = require('../src/server/browser-keeper.js');
const BE = require('../src/server/browser-env.js');
const LIMITS = require('../src/keeper-limits.js');
const { SessionStatusManager } = require('../src/session-status.js');
const S = require('../src/browser-stream.js');          // MULTIVIEW: the strip's list, the child rung, the witness naming
const BH = require('../src/server/browser-helpers.js'); // MULTIVIEW §4: the witness feed (stdout + the new-child route)

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const REPO = new URL('..', import.meta.url).pathname;
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

// ── scratch world ──
const ROOT = scratch('browser-handles');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const SHORT = scratch('bh'); fs.mkdirSync(SHORT, { recursive: true });
const SOCKBASE = path.join(ROOT, 'sock'); fs.mkdirSync(SOCKBASE, { recursive: true });
const NODE_DIR = path.dirname(process.execPath);
const PATH_ENV = `${BIN}:${NODE_DIR}:${process.env.PATH || '/usr/bin:/bin'}`;
process.env.PATH = PATH_ENV;

// The FAKE agent-browser (the pin suite's, plus `snapshot`/`fill`, which log the
// env they ran under so the suite can assert WHICH browser a command reached).
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const writeState = (s) => { const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(s)); fs.renameSync(t, f); };   // the fake's state by a temp file of its own process and a rename: no verb's read meets a torn file when two of its processes run at once (lane bl-loop-b, 主开发 r5152)
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const pinTab = process.argv.includes('--pin-tab');
const [a, b] = argv;
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null, idle: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || null }; writeState(s); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s, session: process.env.AGENT_BROWSER_SESSION || null }) + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
if (a === 'snapshot' || a === 'fill') { fs.appendFileSync(path.join(st, 'cmds.log'), JSON.stringify({ verb: a, ns, session: process.env.AGENT_BROWSER_SESSION || null, profile: process.env.AGENT_BROWSER_PROFILE || null, cdp: process.env.AGENT_BROWSER_CDP || null, config: process.env.AGENT_BROWSER_CONFIG || null, pinTab, argv }) + '\\n'); out({ success: true, data: { ok: true } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const launches = () => { try { return fs.readFileSync(path.join(AB_STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const cmds = () => { try { return fs.readFileSync(path.join(AB_STATE, 'cmds.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const spawnedPids = new Set();
function reapAll() { for (const l of launches()) if (l.pid) spawnedPids.add(l.pid); for (const pid of spawnedPids) { try { process.kill(pid, 'SIGKILL'); } catch { } } }
let srv = null;
function cleanup() { reapAll(); try { srv?.close(); } catch { } for (const d of [ROOT, SHORT]) fs.rmSync(d, { recursive: true, force: true }); }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

const KEY_A = 'bk-0000000a', KEY_B = 'bk-0000000b';
const P1 = { id: 'bp-00000001', label: 'Personal', dir: '/p/personal' }, P2 = { id: 'bp-00000002', label: 'Work account', dir: '/p/work' }, P3 = { id: 'bp-00000003', label: 'work-account', dir: '/p/work2' };

// ═══ ① PURE ═══════════════════════════════════════════════════════════════
console.log('— ① the attachment set, handles and the two refusals (§3.7 / §3.8), PURE');
{
  ok(B.aliasFor('Work account') === 'work-account' && B.aliasFor('  ---  ', [], 'bp-00000009') === 'bp-00000009' && B.aliasFor('Work', ['work']) === 'work-2' && B.aliasFor('Work', ['work', 'work-2']) === 'work-3', 'aliasFor: the label\'s slug, made unique, never empty');
  ok(B.isAlias('work') && B.isAlias('bp-00000001') && !B.isAlias('Work Account') && !B.isAlias('') && !B.isAlias('-x'), 'isAlias: 1-32 of [a-z0-9_-] starting with a letter or digit');
  ok(B.childHandleFor(KEY_A, 3) === KEY_A + '.3' && B.childHandleFor(KEY_A + '.3', 1) === KEY_A + '.1' && B.nextChildN({ [KEY_A + '.1']: {}, [KEY_A + '.2']: {}, [KEY_B + '.1']: {} }, KEY_A) === 3 && B.nextChildN({}, KEY_A) === 1, 'child handles: bk-<parent>.<n>, n = the lowest free suffix under THAT parent');
  for (const [v, want] of [['work', false], ['bp-00000001', false], ['/tmp/x', true], ['./x', true], ['../x', true], ['~/x', true], ['a/b', true], ['C:\\x', true], ['\\\\srv\\x', true], ['', false]]) ok(B.looksLikePath(v) === want, `looksLikePath(${JSON.stringify(v)}) = ${want}`);
  const profiles = [P1, P2, P3];
  const one = B.attachmentsFor({ leases: [{ profileId: P1.id, browserKey: KEY_A, since: 5 }], profiles, browserKey: KEY_A });
  ok(one.attachments.length === 1 && one.defaultId === P1.id && one.attachments[0].alias === 'personal' && one.attachments[0].isDefault, 'ONE attachment is the default by itself (alias = the label\'s slug)');
  const two = B.attachmentsFor({ leases: [{ profileId: P1.id, browserKey: KEY_A, since: 5 }, { profileId: P2.id, browserKey: KEY_A, since: 6, alias: 'work' }, { profileId: P3.id, browserKey: KEY_B, since: 1 }], profiles, browserKey: KEY_A });
  ok(two.attachments.length === 2 && two.defaultId === null && two.handles.map((h) => h.handle).join(',') === 'personal,work' && !two.attachments.some((a) => a.isDefault), 'TWO attachments with no pin among them ⇒ NO default; a stored alias wins over the slug; another key\'s lease is not in the set');
  const pinned = B.attachmentsFor({ leases: two.attachments.map((a) => ({ profileId: a.profileId, browserKey: KEY_A, since: a.since, alias: a.alias })), profiles, browserKey: KEY_A, pin: { profileId: P2.id } });
  ok(pinned.defaultId === P2.id && pinned.attachments.find((a) => a.profileId === P2.id).isDefault, 'the PIN among the attachments is the default');
  ok(B.attachmentsFor({ leases: [{ profileId: P1.id, browserKey: KEY_A, since: 5 }, { profileId: P2.id, browserKey: KEY_A, since: 6 }], profiles, browserKey: KEY_A, pin: { profileId: P3.id } }).defaultId === null, 'a pin NOT among the attachments names no default');
  ok(two.fingerprint !== pinned.fingerprint && one.fingerprint !== two.fingerprint, 'the fingerprint moves when the default moves and when a member is added');
  const twoLater = B.attachmentsFor({ leases: [{ profileId: P1.id, browserKey: KEY_A, since: 500 }, { profileId: P2.id, browserKey: KEY_A, since: 600, alias: 'work' }], profiles, browserKey: KEY_A });
  ok(twoLater.fingerprint === two.fingerprint, '…and on nothing else (a lease re-carried with a new `since` is the same set)');
  const kids = B.attachmentsFor({ leases: [], profiles, browserKey: KEY_A, children: [{ handle: KEY_A + '.1', since: 1 }, { handle: KEY_B + '.1', since: 1 }] });
  ok(kids.children.length === 1 && kids.handles[0].kind === 'child' && kids.handles[0].handle === KEY_A + '.1', 'a parent\'s children are listed beside the set (another parent\'s are not)');
  // resolveHandle
  const r0 = B.resolveHandle({ set: B.attachmentsFor({ profiles, browserKey: KEY_A }) });
  ok(r0.ok && r0.kind === 'none', 'no attachment ⇒ the session\'s OWN ephemeral browser');
  const r1 = B.resolveHandle({ set: one });
  ok(r1.ok && r1.kind === 'attachment' && r1.handle === 'personal', 'one attachment ⇒ a bare command lands on it');
  const r2 = B.resolveHandle({ set: two });
  ok(!r2.ok && r2.code === 'profile_required' && r2.default === null && r2.handles.length === 2 && /personal \(bp-00000001\), work \(bp-00000002\)/.test(r2.error) && /no default is set/.test(r2.error), 'two attachments ⇒ profile_required, EVERY handle listed, no default said plainly');
  const r2p = B.resolveHandle({ set: pinned });
  ok(!r2p.ok && r2p.code === 'profile_required' && r2p.default === 'work' && /work \(bp-00000002\) \[default\]/.test(r2p.error), 'with a pin among them the refusal MARKS the default (and still refuses the bare command)');
  const r2s = B.resolveHandle({ set: two, subagent: true });
  ok(!r2s.ok && r2s.code === 'profile_required' && /sub-agent/.test(r2s.error) && !/sub-agent/.test(r2.error), 'the sub-agent clause is an ASIDE on the same refusal — never a different code');
  ok(B.resolveHandle({ set: two, handle: 'work' }).attachment.profileId === P2.id && B.resolveHandle({ set: two, handle: P1.id }).attachment.profileId === P1.id && B.resolveHandle({ set: two, handle: 'Work Account' }).attachment.profileId === P2.id, 'a handle resolves by alias, by id, or by label (case-insensitive)');
  const amb = B.attachmentsFor({ leases: [{ profileId: P2.id, browserKey: KEY_A, since: 1 }, { profileId: P3.id, browserKey: KEY_A, since: 2 }], profiles: [P2, { ...P3, label: 'WORK ACCOUNT' }], browserKey: KEY_A });
  ok(B.resolveHandle({ set: amb, handle: 'work account' }).code === 'ambiguous', 'a label two attachments answer to is ambiguous ⇒ use the alias or the id');
  ok(B.resolveHandle({ set: two, handle: 'ghost' }).code === 'not_attached' && /vibespace-browser use ghost/.test(B.resolveHandle({ set: two, handle: 'ghost' }).error), 'a handle this session is not attached to is refused — never silently attached');
  const rp = B.resolveHandle({ set: two, handle: '/home/u/.agent-browser/profiles/work' });
  ok(!rp.ok && rp.code === 'profile_path_refused' && /vibespace-browser new <label> --adopt \/home\/u\/\.agent-browser\/profiles\/work/.test(rp.error), 'a filesystem PATH is refused BY NAME and the refusal carries the command that turns a path into a handle');
  ok(B.resolveHandle({ set: one, handle: '/x' }).code === 'profile_path_refused', '…even with exactly one attachment');
  // told / blindness
  const told1 = B.toldView(two, 10);
  ok(B.blindnessVerdict({ told: null, set: two }) === null, 'never told ⇒ nothing to say (the first command is told, not refused)');
  ok(B.blindnessVerdict({ told: told1, set: twoLater }) === null, 'the same fingerprint ⇒ nothing to say');
  const ch = B.blindnessVerdict({ told: told1, set: pinned });
  ok(ch && ch.code === 'profile_changed' && ch.was.default === null && ch.now.default === 'work' && /did NOT run/.test(ch.error) && /--profile <handle>/.test(ch.error), 'a moved default ⇒ profile_changed with was → now, and the command did not run');
  const chE = B.blindnessVerdict({ told: B.toldView(B.attachmentsFor({ profiles, browserKey: KEY_A })), set: one });
  ok(chE && chE.code === 'profile_changed' && /ephemeral|no default/.test(chE.error), 'told "nothing attached" then attached by somebody else ⇒ refused once too');
  // audit
  const line = JSON.parse(B.auditLine({ at: 7, sessionId: 's1', browserKey: KEY_A, profileId: P2.id, verb: B.auditVerbOf(['fill', '@e7', 'hunter2-secret']), ok: true }));
  ok(Object.keys(line).join(',') === 'at,sessionId,browserKey,profileId,verb,ok' && line.verb === 'fill' && !JSON.stringify(line).includes('hunter2'), 'the audit line is {at, sessionId, browserKey, profileId, verb, ok} and NOTHING else — a fill\'s content is never recorded');
  ok(B.auditVerbOf(['--pin-tab', 'snapshot']) === 'snapshot' && B.auditVerbOf([]) === null, 'the verb is the first non-flag word (null when none)');
  // child env
  const ce = B.childEnvFor({ childKey: KEY_A + '.1', parentVariant: 'C' });
  ok(ce.pairs.includes(`AGENT_BROWSER_SESSION=vs-${KEY_A}.1`) && ce.pairs.includes(`AGENT_BROWSER_NAMESPACE=vs-${KEY_A}.1`) && ce.pairs.includes(`VIBESPACE_BROWSER=${KEY_A}.1`) && ce.unset.includes('AGENT_BROWSER_PROFILE'), 'a child gets its OWN session + daemon, and on rung C the inherited profile symlink is UNSET (two daemons on one dir = SingletonLock)');
  // rung D (2026-09-21, the verifier's finding: a pinned parent's config named its directory to the child's namespace)
  const cd = B.childEnvFor({ childKey: KEY_A + '.1', parentVariant: 'D', childConfigPath: '/d/browser-env/' + KEY_A + '.1.json' });
  ok(cd.pairs.includes('AGENT_BROWSER_CONFIG=/d/browser-env/' + KEY_A + '.1.json') && cd.unset.length === 0 && /own generated config/.test(cd.why), 'on rung D the child gets a generated config of its OWN (the parent\'s AGENT_BROWSER_CONFIG is replaced, nothing unset)');
  const cdNone = B.childEnvFor({ childKey: KEY_A + '.1', parentVariant: 'D', childConfigPath: null, parentNamesProfile: true });
  ok(cdNone.unset.includes('AGENT_BROWSER_CONFIG') && !cdNone.pairs.some((p) => p.startsWith('AGENT_BROWSER_CONFIG=')) && /never the parent/.test(cdNone.why), '…without one, a parent config that NAMES a pinned directory is UNSET for the child (never the parent\'s dir)');
  const cdShare = B.childEnvFor({ childKey: KEY_A + '.1', parentVariant: 'D', childConfigPath: null, parentNamesProfile: false });
  ok(cdShare.unset.length === 0 && !cdShare.pairs.some((p) => p.startsWith('AGENT_BROWSER_CONFIG=')) && /names no profile/.test(cdShare.why), '…and a profile-less parent config is safe to inherit (each daemon gets its own ephemeral dir)');
  ok(B.childEnvFor({ childKey: KEY_A }).pairs.length === 0 && B.childEnvFor({ childKey: KEY_A + '.1', parentVariant: 'N' }).unset.length === 0, 'a non-child key gets no env; rung N unsets nothing');
  // adopt roots (2026-09-21): a session may register only what lives under ~/.agent-browser/ or data/browser-profiles/
  const AR = { homeDir: '/home/u', dataDir: '/srv/vs/data', browserKey: KEY_A };
  ok(B.adoptDirVerdict({ ...AR, dir: '/home/u/.agent-browser/profiles/work' }).ok && B.adoptDirVerdict({ ...AR, dir: '/srv/vs/data/browser-profiles/bk-0000000a' }).ok, 'a directory under ~/.agent-browser/ or data/browser-profiles/ is adoptable');
  ok(B.adoptDirVerdict({ ...AR, dir: '/home/u/.config/google-chrome' }).code === 'adopt_outside_roots' && /theirs to keep/.test(B.adoptDirVerdict({ ...AR, dir: '/home/u/.config/google-chrome' }).error), 'the user\'s own browser directory is refused adopt_outside_roots (never a session\'s to register)');
  ok(B.adoptDirVerdict({ ...AR, dir: '/home/u/.agent-browser/../.config/google-chrome' }).code === 'adopt_outside_roots' && B.adoptDirVerdict({ ...AR, dir: '/home/u/.agent-browser' }).code === 'adopt_outside_roots' && B.adoptDirVerdict({ ...AR, dir: 'relative/dir' }).code === 'adopt_failed', 'a `..` cannot walk out of a root, the root itself is not a profile, a relative path is refused');
  ok(B.adoptDirVerdict({ ...AR, dir: '/home/u/.agent-browser/default-profile' }).code === 'adopt_legacy_refused' && /Shared \(legacy\)/.test(B.adoptDirVerdict({ ...AR, dir: '/home/u/.agent-browser/default-profile' }).error), 'the legacy shared jar is the migration\'s record — refused by name with the `use` remedy');
  ok(B.adoptDirVerdict({ ...AR, dir: '/home/u/.agent-browser/profiles/x', existing: { id: 'bp-00000009', label: 'Theirs', owner: { kind: 'instance', id: null } } }).code === 'adopt_registered' && B.adoptDirVerdict({ ...AR, dir: '/home/u/.agent-browser/profiles/x', existing: { id: 'bp-00000009', label: 'Mine', owner: { kind: 'session', id: KEY_A } } }).ok, 'a directory somebody else registered is theirs (adopt_registered, `use` it); one this session owns is idempotent');
  ok(B.adoptDirVerdict({ dir: '/home/u/.agent-browser/profiles/x', browserKey: KEY_A }).code === 'adopt_failed', 'no roots configured ⇒ refused (fail closed)');
  const notice = B.profileChangeNotice({ was: 'Personal', now: 'Work account', by: 'user', handles: [{ handle: 'work' }, 'personal'] });
  ok(notice.kind === 'browser-profile' && notice.handles.join(',') === 'work,personal' && /browser profile changed: Personal → Work account \(by user\)/.test(B.renderProfileChangeNotice(notice)) && /<system-reminder>/.test(B.renderProfileChangeNotice(notice)), 'the layer-② notice is typed {kind:browser-profile,…} and renders as one <system-reminder>');
  const reg = B.normalizeRegistry({ children: { [KEY_A + '.1']: { parent: KEY_A } }, told: { [KEY_A]: { fingerprint: 'x' } }, extra: 1 });
  ok(reg.children[KEY_A + '.1'] && reg.told[KEY_A] && !('extra' in reg), 'normalizeRegistry keeps `children` and `told`');
}

// ═══ ② the REAL keeper ═══════════════════════════════════════════════════
console.log('— ② the keeper: aliases, the set, resolveFor (blindness first), children, the audit, adopt, the Task-Group dep');
const lines = [];
const log = { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push('WARN ' + a.join(' ')), error: (...a) => lines.push('ERROR ' + a.join(' ')) };
const settings = { 'browser.idleTimeoutMs': 60000 };
const bcast = [];
const keeperEnv = () => ({ PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE });
const mkKeeper = (live, extra = {}) => K.create({
  dataDir: DATA, homeDir: HOME, env: keeperEnv, broadcast: (m) => bcast.push(m),
  serverSetting: (k) => settings[k], serverNotice: () => { }, getTelemetry: () => null, liveKeys: () => live,
  limits: { ...LIMITS, CONCURRENT_CAP: 3 }, log, tickMs: 3600e3, install: false, ...extra,
});
const reg = (k) => k._reg();
let workId, persId;
{
  const live = new Set([KEY_A, KEY_B]);
  const k = mkKeeper(live, { taskGroupDefault: ({ initialGroupId }) => (initialGroupId === 'T-1' ? 'bp-0000feed' : '') });
  await k._facts.probeVersion();
  workId = k.createProfile({ label: 'Work account' }, { owner: { kind: 'session', id: KEY_A } }).id;
  persId = k.createProfile({ label: 'Personal' }, { owner: { kind: 'instance', id: null } }).id;
  const e1 = await threw(() => k.attach({ profile: 'Work account', browserKey: KEY_A, sessionId: 's1', alias: 'Bad Alias' }));
  ok(e1 && e1.code === 'bad_alias', 'an ill-formed alias is refused (bad_alias) — no lease, no launch');
  ok(!reg(k).leases.length && launches().length === 0, '…and nothing was attached or launched');
  const a1 = await k.attach({ profile: 'Work account', browserKey: KEY_A, sessionId: 's1', alias: 'work' });
  ok(a1.created && a1.lease.alias === 'work', 'attach with --alias stores the handle on the lease');
  const e2 = await threw(() => k.attach({ profile: 'Personal', browserKey: KEY_A, sessionId: 's1', alias: 'work' }));
  ok(e2 && e2.code === 'alias_taken', 'an alias already naming another attachment is refused (alias_taken)');
  const a2 = await k.attach({ profile: 'Personal', browserKey: KEY_A, sessionId: 's1' });
  ok(a2.created && a2.lease.alias === 'personal', 'no alias ⇒ the label\'s slug, stored ONCE on the lease');
  const set = k.setFor(KEY_A);
  ok(set.attachments.length === 2 && set.defaultId === null && set.handles.map((h) => h.handle).join(',') === 'work,personal', 'setFor = the set view (two attachments, no default without a pin)');
  const st = k.statusFor(KEY_A);
  ok(Array.isArray(st.attachments) && st.attachments.length === 2 && st.defaultProfile === null && st.told === null && st.fingerprint === set.fingerprint, 'statusFor carries the set, the default and the told fingerprint (null before any command)');
  // resolveFor: told first
  const r1 = k.resolveFor({ browserKey: KEY_A });
  ok(!r1.ok && r1.code === 'profile_required' && reg(k).told[KEY_A] && reg(k).told[KEY_A].fingerprint === set.fingerprint, 'the FIRST command is never refused for blindness — it is TOLD (the fingerprint is recorded) and then refused profile_required for the set of two');
  const r2 = k.resolveFor({ browserKey: KEY_A, handle: 'work' });
  ok(r2.ok && r2.kind === 'attachment' && r2.attachment.profileId === workId, '--profile work resolves');
  k.setPin(KEY_A, persId); // the USER's pin: nobody told the session
  const r3 = k.resolveFor({ browserKey: KEY_A, handle: 'work' });
  ok(!r3.ok && r3.code === 'profile_changed' && r3.was.default === null && r3.now.default === 'personal', 'a pin by SOMEBODY ELSE ⇒ the next command is refused ONCE with profile_changed (was: no default → now: personal)');
  const r4 = k.resolveFor({ browserKey: KEY_A, handle: 'work' });
  ok(r4.ok && r4.kind === 'attachment', '…and the following command runs (told exactly once per change, never once per command)');
  ok(lines.some((l) => /refused once with profile_changed/.test(l)), 'the keeper journals the one-time refusal');
  k.tell(KEY_A); k.setPin(KEY_A, persId);
  ok(k.resolveFor({ browserKey: KEY_A, handle: 'work' }).ok, 'a pin that moves nothing (same default) is not a change');
  // children
  const c1 = k.newChild({ browserKey: KEY_A, sessionId: 's1' });
  ok(c1.handle === KEY_A + '.1' && reg(k).children[c1.handle] && reg(k).children[c1.handle].parent === KEY_A, 'newChild mints bk-<parent>.1 under the parent');
  ok(k.newChild({ browserKey: KEY_A }).handle === KEY_A + '.2', '…then .2');
  const rc = k.resolveFor({ browserKey: KEY_A, handle: KEY_A + '.1' });
  ok(rc.ok && rc.kind === 'child' && rc.handle === KEY_A + '.1', 'a child handle resolves to kind child');
  ok(k.setFor(KEY_A).children.length === 2 && k.setFor(KEY_A).handles.filter((h) => h.kind === 'child').length === 2, 'the set lists the children beside the attachments');
  const cl = await k.attach({ profile: 'Work account', browserKey: KEY_A + '.1', sessionId: 's1' });
  ok(cl.created && cl.lease.browserKey === KEY_A + '.1', 'a child may lease a profile its parent owns');
  k.reconcile({ graceMs: 0 });
  ok(Object.keys(reg(k).children).length === 2 && reg(k).leases.some((l) => l.browserKey === KEY_A + '.1'), 'children of a LIVE parent survive reconciliation');
  live.delete(KEY_A);
  k.reconcile({ graceMs: 0 });
  ok(Object.keys(reg(k).children).length === 0 && !reg(k).leases.some((l) => l.browserKey.startsWith(KEY_A)) && !reg(k).told[KEY_A], 'a dead parent reaps its children, their leases and its told memory (at boot: at once)');
  live.add(KEY_A);
  // audit
  const al = k.audit({ sessionId: 's1', browserKey: KEY_A, profileId: workId, verb: ['fill', '@e7', 'hunter2-secret'], ok: true });
  const auditText = fs.readFileSync(k.auditFile, 'utf8');
  ok(auditText.trim() === al && JSON.parse(al).verb === 'fill' && !auditText.includes('hunter2') && (fs.statSync(k.auditFile).mode & 0o777) === 0o600, 'the audit file is append-only JSONL, 0600, verb only');
  // adoptScratch
  const scratchDir = path.join(DATA, 'browser-profiles', 'vs-' + KEY_B); fs.mkdirSync(scratchDir, { recursive: true }); fs.writeFileSync(path.join(scratchDir, 'Cookies'), 'jar');
  const ad = k.adoptScratch({ label: 'Adopted', scratchDir, owner: { kind: 'session', id: KEY_B } });
  const pend = await threw(() => k.start(ad.id));   // the moved2 cure 3: before the landing its folder has not moved — no start (a browser on the empty target would make the move fail under it)
  ok(pend && pend.code === 'adopt_pending', 'adoptScratch: a start of the adopted profile before its record landed is refused adopt_pending', pend && { code: pend.code, message: pend.message });
  const adL = await ad.landing;   // lane lg-store-writes (the moved2 cure 2): the folder moves once the new record LANDED (the keeper's step)
  ok(adL && adL.landed && adL.value && adL.value.moved === true, 'adoptScratch: the folder moved by the step that rides the new record\'s landing', adL);
  ok(ad.dir === path.join(HOME, '.agent-browser', 'vs-' + ad.id) && fs.existsSync(path.join(ad.dir, 'Cookies')) && !fs.existsSync(scratchDir) && ad.owner.kind === 'only' && ad.owner.who[0].id === KEY_B, 'adoptScratch MOVES the scratch dir under ~/.agent-browser/ (the login kept) and registers it (a pre-list single owner stored as a one-row list, 2026-09-27)');
  ok((await threw(() => k.adoptScratch({ label: 'Adopted', scratchDir: path.join(DATA, 'nope') }))).code === 'label_taken' && (await threw(() => k.adoptScratch({ label: 'Gone', scratchDir: path.join(DATA, 'nope') }))).code === 'adopt_failed', 'adopt refuses a taken label and a missing directory by name');
  // the Task-Group rung's dep
  ok(k.taskGroupDefaultFor({ initialGroupId: 'T-1' }) === 'bp-0000feed' && k.taskGroupDefaultFor({ initialGroupId: 'T-2' }) === '', 'taskGroupDefaultFor asks the wiring\'s dep (an id or nothing)');
  const kThrow = mkKeeper(live, { taskGroupDefault: () => { throw new Error('boom'); }, install: false });
  ok(kThrow.taskGroupDefaultFor({}) === '' && lines.some((l) => /task-group default unreadable/.test(l)), 'a throwing dep answers "" and is logged — never a throw out of a create');
  ok(mkKeeper(live, { install: false }).taskGroupDefaultFor({ initialGroupId: 'T-1' }) === '', 'no dep ⇒ ""');
  await k.stop(workId).catch(() => { }); await k.stop(persId).catch(() => { });
  k.shutdown();
}

// ═══ ③ routes + CLI + a REAL browser-env ══════════════════════════════════
console.log('— ③ the routes, the shipped CLI and the per-session config: a mid-task pin without a restart, the refusals, the audit');
{
  const express = require('express');
  const R = require('../src/routes/browser.js');
  try { require('../src/store-writer.js').storeWriter().flushSync(); } catch { }   // lane lg-store-writes U5b: the shut keepers' registry writes are the store writer's — landed BEFORE the folder is wiped (else the next keeper's load lands them into the fresh one)
  fs.rmSync(DATA, { recursive: true, force: true }); fs.mkdirSync(DATA, { recursive: true });
  fs.rmSync(AB_STATE, { recursive: true, force: true }); fs.mkdirSync(AB_STATE, { recursive: true });
  const live = new Set([KEY_A, KEY_B]);
  const k = mkKeeper(live);
  const be = BE.create({ dataDir: DATA, homeDir: HOME, serverNotice: null, telemetry: null, log: { warn() { }, log() { } }, env: { XDG_RUNTIME_DIR: SHORT }, socketDirBase: SOCKBASE });
  const TOKEN_A = 'vsst_' + 'a'.repeat(24);
  const sessA = { agentToken: TOKEN_A, _browserKey: KEY_A, _browserVariant: null, sockName: 'cw-1' };
  const active = new Map([['sess-1', sessA]]);
  const notices = [], persisted = [];
  const app = express(); app.use(express.json());
  R.setup({ keeper: k, activeSessions: active, browserEnv: () => be, adoptRoots: { homeDir: HOME, dataDir: DATA }, notice: (sid, s, n) => notices.push({ sid, n }), persistPin: (s, id, origin) => persisted.push({ id, origin }), tasksForSession: () => [] });
  app.use(R.router);
  srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const API = `http://127.0.0.1:${srv.address().port}`;
  const j = async (method, p, body, headers = {}) => { const res = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const bearer = (t) => ({ Authorization: 'Bearer ' + t });
  // the session's spawn env (variant D: a generated per-session config)
  const env0 = be.envFor({ browserKey: KEY_A, integrationOn: true, remote: false, cwd: ROOT });
  sessA._browserVariant = env0.variant;
  const cfgPath = env0.configPath;
  // lane browser-resume (§3.9): rung D's config names the conversation's OWN kept directory (data/browser-profiles/<key>) — never a profile's
  ok(env0.variant === 'D' && cfgPath && fs.existsSync(cfgPath) && be.resolvedProfileDir(KEY_A) === be.scratchDirFor(KEY_A), 'the session spawned on rung D with a generated config naming its OWN kept directory (no profile\'s — lane browser-resume §3.9)');
  const work = k.createProfile({ label: 'Work account' }, { owner: { kind: 'session', id: KEY_A } });
  const pers = k.createProfile({ label: 'Personal' }, { owner: { kind: 'instance', id: null } });
  const CLI = path.join(REPO, 'data/bin/vibespace-browser');
  const cliEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: TOKEN_A, ...Object.fromEntries(env0.pairs.map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])) };
  const cli = (args, env = cliEnv) => new Promise((resolve) => execFile(process.execPath, [CLI, ...args], { env, encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
  let c = await cli(['use', 'Work account', '--alias', 'work', '--print']);
  ok(c.status === 1 && /\[not_offered\]/.test(c.stderr) && !/handle work/.test(c.stdout), '`use … --print` is not offered (takeover C2: nothing to export — the page verbs run through this tool) and attaches nothing');
  c = await cli(['use', 'Work account', '--alias', 'work']);
  ok(c.status === 0 && /handle work/.test(c.stdout) && /attached — run `vibespace-browser <verb>`/.test(c.stdout) && !/export /.test(c.stdout), '`use <profile> --alias work` attaches with the handle — no subshell, no env, the next step named');
  c = await cli(['use', 'Personal']);
  ok(c.status === 0 && /handle personal/.test(c.stdout) && /holds 2 browsers/.test(c.stdout) && /--profile <handle>/.test(c.stdout), 'a second `use` names the set and the rule (two browsers ⇒ --profile on every command)');
  c = await cli(['--', 'snapshot']);
  ok(c.status === 1 && /\[profile_required\]/.test(c.stderr) && /handles: work \(bp-/.test(c.stderr) && /personal \(bp-/.test(c.stderr) && !/sub-agent/.test(c.stderr) && cmds().length === 0, 'a BARE command with two attachments is refused profile_required, listing every handle — and nothing ran');
  sessA._subNormalizers = new Map([['toolu_1', {}]]);
  c = await cli(['--', 'snapshot']);
  ok(c.status === 1 && /\[profile_required\]/.test(c.stderr) && /sub-agent/.test(c.stderr), 'with a sidechain OPEN the same refusal carries the sub-agent ASIDE (the code is unchanged)');
  sessA._subNormalizers = new Map();
  c = await cli(['--profile', 'work', '--', 'snapshot']);
  let last = cmds()[cmds().length - 1];
  // naive study 2: the command reaches Work's browser over its CDP url — never Work's directory (0.38.1: a second Chrome on it dies on SingletonLock)
  ok(c.status === 0 && last && last.verb === 'snapshot' && last.ns === 'vs-' + work.id && last.session === 'vs-' + KEY_A && last.profile === null && last.cdp === `ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-vs-` + work.id && /profile: Work account \(bp-.*handle work/.test(c.stderr), '`--profile work -- snapshot` runs in Work\'s namespace with MY session, over Work\'s browser\'s CDP url (never its directory), and names the profile it acted on');
  c = await cli(['--', 'snapshot'], { ...cliEnv, VIBESPACE_BROWSER: 'personal' });
  last = cmds()[cmds().length - 1];
  ok(c.status === 0 && last.ns === 'vs-' + pers.id, 'VIBESPACE_BROWSER=<handle> is the shell\'s default (identical to --profile on every command)');
  c = await cli(['--profile', '/tmp/some-profile-dir', '--', 'snapshot']);
  ok(c.status === 1 && /\[profile_path_refused\]/.test(c.stderr) && /new <label> --adopt \/tmp\/some-profile-dir/.test(c.stderr), 'a PATH is refused by name with the `new --adopt` remedy');
  c = await cli(['--profile', 'ghost', '--', 'snapshot']);
  ok(c.status === 1 && /\[not_attached\]/.test(c.stderr), 'an unknown handle ⇒ not_attached');
  ok(launches().length === 2, 'two profiles ⇒ two daemons (one per profile), the child commands launched nothing new');
  // ── lane J (2026-09-25): a pin that moves nothing says nothing ──
  // the owner re-chose the ticked "Unpinned (ephemeral)" row of the live view's title menu and the agent was told
  // "browser profile changed: ephemeral (no profile) → ephemeral (no profile) (by user)"
  {
    const n0 = notices.length;
    const r0 = await j('POST', '/api/browser/pin', { sessionId: 'sess-1', profile: null });
    ok(r0.status === 200 && r0.json.pin === null && r0.json.moved === false && notices.length === n0, 'lane J: re-pinning an UNPINNED session to "Unpinned" moved nothing and queues NO notice (was: "ephemeral → ephemeral (by user)")', JSON.stringify({ status: r0.status, moved: r0.json && r0.json.moved, notices: notices.slice(n0) }));
    // the CONTROL: the pre-fix route in a patched copy (both guards removed) queues exactly that notice through the same keeper
    const M = mutantCopies('browser-handles', REPO);
    const src = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
    const pre = editAnchor(editAnchor(src, "  if (String(was || '') === String(now || '')) return false;\n", '', "src/routes/browser.js"), 'if (by === \'user\') { if (moved) noteChange(', 'if (by === \'user\') { if (true) noteChange(', "src/routes/browser.js");
    ok(pre !== src && !pre.includes("String(was || '') === String(now || '')") && pre.includes('if (true) noteChange('), 'control: the patched copy really lost both guards (census of the patch)');
    const R0 = M.load('src/routes/browser.js', pre);
    const preNotices = [];
    R0.setup({ keeper: k, activeSessions: active, browserEnv: () => be, adoptRoots: { homeDir: HOME, dataDir: DATA }, notice: (sid, s2, n) => preNotices.push({ sid, n }), persistPin: () => { }, tasksForSession: () => [] });
    const app0 = express(); app0.use(express.json()); app0.use(R0.router);
    const srv0 = await new Promise((r) => { const s2 = app0.listen(0, '127.0.0.1', () => r(s2)); });
    const r1 = await fetch(`http://127.0.0.1:${srv0.address().port}/api/browser/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'sess-1', profile: null }) });
    await new Promise((r) => srv0.close(r));
    const text = preNotices[0] ? SessionStatusManager.renderNotice(preNotices[0].n) : '';
    ok(r1.status === 200 && preNotices.length === 1 && /browser profile changed: ephemeral \(no profile\) → ephemeral \(no profile\) \(by user\)/.test(text), 'control: the PRE-FIX route queues the owner\'s exact "ephemeral (no profile) → ephemeral (no profile) (by user)" notice for the same no-op pin', text.slice(0, 200));
    ok(notices.length === n0, '…and the real route\'s notice list is still untouched');
  }
  // ── THE MID-TASK PIN NEEDS NO RESTART (the chunk's exit condition) ──
  const before = k.statusFor(KEY_A).told;
  let r = await j('POST', '/api/browser/pin', { sessionId: 'sess-1', profile: 'Work account' });
  ok(r.status === 200 && r.json.pin.profileId === work.id && r.json.changedSet === true && r.json.defaultId === work.id, 'the USER pins Work through the UI route: the set\'s default moved');
  // OWNER RULING A (2026-09-26): a pin is the conversation's DEFAULT ATTACHMENT, never a directory — the running session's
  // own config is NOT re-pointed at the profile (that was the study's path B: its own browser launched a second Chrome on
  // the directory the keeper's held, exit 21); the set's default is Work and the keeper's one browser serves it
  ok(be.resolvedProfileDir(KEY_A) === be.scratchDirFor(KEY_A) && JSON.parse(fs.readFileSync(cfgPath, 'utf8')).profile === be.scratchDirFor(KEY_A) && k.setFor(KEY_A).defaultId === work.id, 'owner ruling A: the running session\'s per-session config names only its OWN kept directory after the pin (never the profile\'s directory — a second Chrome there dies on SingletonLock); the set\'s default is Work, reached through the keeper');
  ok(!JSON.stringify(JSON.parse(fs.readFileSync(cfgPath, 'utf8'))).includes(pers.dir) && !env0.pairs.some((p) => p.includes(pers.dir)) && !env0.pairs.some((p) => p.includes(work.dir)), '…and resolves to NO OTHER: the non-default\'s directory is in neither the config nor the spawn env (layer ①\'s honest boundary: only the default is reachable without a handle)');
  ok(sessA._browserProfileId === work.id && sessA._browserPinOrigin === 'chosen' && persisted[persisted.length - 1].id === work.id && persisted[persisted.length - 1].origin === 'chosen', 'the live session is stamped and the pin is persisted to its meta (a restart keeps it)');
  ok(notices.length === 1 && notices[0].sid === 'sess-1' && notices[0].n.kind === 'browser-pin' && notices[0].n.by === 'user' && notices[0].n.now === 'Work account' && notices[0].n.handles.includes('work'), 'a USER pin queues ONE typed browser-pin notice (§3.8 layer ②, zero billed turns)');
  ok(k.statusFor(KEY_A).told === before, '…and does NOT tell the session (only its own commands do)');
  r = await j('POST', '/api/browser/pin', { sessionId: 'sess-1', profile: 'Work account' });
  ok(r.status === 200 && r.json.moved === false && notices.length === 1, 'lane J: the USER re-choosing the ticked Work row moves nothing and queues no second notice');
  c = await cli(['--profile', 'work', '--', 'snapshot']);
  ok(c.status === 1 && /\[profile_changed\]/.test(c.stderr) && /was: no default/.test(c.stderr) && /now: work \[default\]/.test(c.stderr) && cmds().length === 2, 'the CLI\'s next command is refused ONCE with profile_changed (was → now) and did NOT run');
  c = await cli(['--profile', 'work', '--', 'snapshot']);
  ok(c.status === 0 && cmds().length === 3, '…and the one after runs');
  c = await cli(['pin', 'personal']);
  ok(c.status === 0 && /pinned this conversation to Personal/.test(c.stdout) && /default is now personal/.test(c.stdout), 'the agent pins by HANDLE');
  ok(notices.length === 1, '…an agent\'s own pin queues no notice (its answer is the telling)');
  c = await cli(['--profile', 'work', '--', 'snapshot']);
  ok(c.status === 0 && cmds().length === 4, '…and its next command is NOT refused (its own act told it)');
  ok(be.resolvedProfileDir(KEY_A) === be.scratchDirFor(KEY_A) && k.setFor(KEY_A).defaultId === pers.id, 'owner ruling A: the agent\'s pin moved the set\'s default to Personal and re-pointed NOTHING at its directory (the config still names only the conversation\'s own kept one)');
  c = await cli(['status']);
  ok(c.status === 0 && /^\* personal  →  Personal/m.test(c.stdout) && /^  work  →  Work account/m.test(c.stdout) && /2 attachments: every command needs --profile/.test(c.stdout) && /pin: Personal/.test(c.stdout), '`status` shows the set with handles, marks the default with *, states the rule and the pin');
  // children
  // A session pinned BEFORE owner ruling A has its generated config naming the pinned directory (the P1 mechanism, still in
  // browser-env for exactly this case) — set up here through that mechanism: the child legs below prove a child never
  // inherits it, and the boot conversion after them puts the parent back on its own browser
  { const rp = be.repointPin(KEY_A, pers.dir); ok(rp && rp.ok && JSON.parse(fs.readFileSync(cfgPath, 'utf8')).profile === pers.dir, 'precondition: a PRE-RULING pin — the parent\'s config names the pinned directory (set through the old mechanism)'); }
  // MULTIVIEW §4 (B-89d0): the claude stdout carries the WITNESS — a Task opening on the parent line and, under it, the
  // helper's own Bash call running `vibespace-browser new-child` (fed through the same module the stdout consumer uses)
  BH.observe(sessA, { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_T1', name: 'Task', input: { description: 'Check the prices', subagent_type: 'general-purpose', prompt: '…' } }] } });
  BH.observe(sessA, { type: 'assistant', parent_tool_use_id: 'toolu_T1', message: { content: [{ type: 'tool_use', id: 'toolu_B1', name: 'Bash', input: { command: 'eval "$(vibespace-browser new-child)"' } }] } });
  c = await cli(['new-child']);
  // lane P verify (finding 4): the witness is paired at its CLOSE — the helper's Bash tool_result (the CLI's own words, naming the handle it printed)
  BH.observe(sessA, { type: 'user', parent_tool_use_id: 'toolu_T1', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_B1', content: c.stderr + c.stdout }] } });
  const childCfg = path.join(DATA, 'browser-env', KEY_A + '.1.json');
  ok(c.status === 0 && /child handle bk-0000000a\.1 minted/.test(c.stderr) && c.stdout.trim() === 'export VIBESPACE_BROWSER=bk-0000000a.1', '`new-child` prints ONLY the child\'s handle on stdout (takeover C2 §3.4: the browser identity behind it is the server\'s business)', JSON.stringify(c.stdout));
  ok(fs.existsSync(childCfg), '…and on rung D the server still generated a config of the child\'s OWN, beside the parent\'s (<key>.<n>.json) — the child\'s commands get it through /resolve');
  const childCfgBody = JSON.parse(fs.readFileSync(childCfg, 'utf8'));
  ok(!('profile' in childCfgBody) && !JSON.stringify(childCfgBody).includes(pers.dir) && !JSON.stringify(childCfgBody).includes(work.dir), 'the child\'s config names NO profile — the pinned parent\'s user-data-dir is in neither key nor value (two namespaces on one dir = SingletonLock, the measured variant-B shape)');
  c = await cli(['--profile', KEY_A + '.1', '--', 'snapshot']);
  last = cmds()[cmds().length - 1];
  ok(c.status === 0 && last.session === 'vs-' + KEY_A + '.1' && last.ns === 'vs-' + KEY_A + '.1' && /child handle/.test(c.stderr), 'a child handle runs the command in the child\'s OWN ephemeral browser');
  ok(last.config === childCfg && last.config !== cfgPath && last.profile === null, '…under the child\'s config, not the parent\'s (the fake logged what it was handed: config ≠ the parent\'s, no AGENT_BROWSER_PROFILE)');
  ok(be.sweep(new Set([KEY_A]), { graceMs: 0 }).swept === 0 && fs.existsSync(childCfg), 'the sweep keeps the child\'s config while its PARENT lives (owned by the parent key)');
  const cc2 = be.childConfigFor(KEY_A + '.1');
  ok(cc2.path === childCfg && cc2.namesProfile === true && cc2.why === null, 'childConfigFor reports the parent NAMES a profile (the fact childEnvFor falls back on) and re-writes idempotently');
  ok(be.childConfigFor(KEY_A).path === null && /not a child key/.test(be.childConfigFor(KEY_A).why), 'a non-child key gets no child config');
  // OWNER RULING A — the boot conversion: a live session whose indirection still names a registered profile's directory is
  // put back on its own browser (the pin stays: it is the default attachment); a session whose config names none is untouched
  { const n = R.convertPinnedDirs(); ok(n === 1 && be.resolvedProfileDir(KEY_A) === be.scratchDirFor(KEY_A) && k.pinFor(KEY_A) && k.pinFor(KEY_A).profileId === pers.id, `owner ruling A: the boot conversion put the pre-ruling pinned session back on its own browser (${n} converted) — the pin itself stays (Personal)`); ok(R.convertPinnedDirs() === 0, '…and a second pass converts nothing (idempotent)'); }
  // audit
  await cli(['--profile', 'work', '--', 'fill', '@e7', 'hunter2-secret']);
  const audit = fs.readFileSync(k.auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  ok(audit.length >= 4 && audit.every((a) => a.sessionId === 'sess-1' && a.browserKey === KEY_A) && audit[audit.length - 1].verb === 'fill' && audit[audit.length - 1].profileId === work.id && !fs.readFileSync(k.auditFile, 'utf8').includes('hunter2'), 'every wrapped command leaves ONE audit line (session, key, profile, verb, ok) — never a fill\'s content');
  // UI attach / detach notices; aliases through the routes
  r = await j('POST', '/api/browser/attach', { sessionId: 'sess-1', profile: 'Personal' });
  ok(r.status === 200 && !r.json.created && notices.length === 1, 'a UI attach that creates NOTHING (already held) queues no notice');
  r = await j('POST', '/api/browser/detach', { sessionId: 'sess-1', profile: 'work' });
  ok(r.status === 200 && r.json.attachments.length === 1 && notices.length === 2 && notices[1].n.kind === 'browser-profile' && /work/.test(notices[1].n.was) && !/work/.test(notices[1].n.now), 'a UI detach by HANDLE queues a browser-profile notice (was → now)');
  c = await cli(['--profile', 'work', '--', 'snapshot']);
  ok(c.status === 1 && /\[profile_changed\]/.test(c.stderr), '…and the CLI\'s next command is refused once for the set change');
  c = await cli(['--', 'snapshot']);
  ok(c.status === 0, 'with one attachment left, a bare command runs again');
  c = await cli(['use', 'Work account', '--alias', 'personal']);
  ok(c.status === 1 && /\[alias_taken\]/.test(c.stderr), '`use --alias` refuses a handle another attachment holds');
  // --adopt (under the adoptable roots since 2026-09-21)
  const dir = path.join(HOME, '.agent-browser', 'existing-profile'); fs.mkdirSync(dir, { recursive: true });
  const outside = path.join(ROOT, 'the-users-own-chrome'); fs.mkdirSync(outside, { recursive: true });
  c = await cli(['new', 'Stolen', '--adopt', outside]);
  ok(c.status === 1 && /\[adopt_outside_roots\]/.test(c.stderr) && !k.profileByRef('Stolen'), 'a directory OUTSIDE ~/.agent-browser/ and data/browser-profiles/ (the user\'s own browser dir) is refused adopt_outside_roots — nothing registered');
  const legacyDir = path.join(HOME, '.agent-browser', 'default-profile'); fs.mkdirSync(legacyDir, { recursive: true });
  c = await cli(['new', 'Jar', '--adopt', legacyDir]);
  ok(c.status === 1 && /\[adopt_legacy_refused\]/.test(c.stderr) && !k.profileByRef('Jar'), 'the legacy shared jar is refused by name');
  c = await cli(['new', 'Theirs', '--adopt', pers.dir]);
  ok(c.status === 1 && /\[adopt_registered\]/.test(c.stderr) && /vibespace-browser use bp-/.test(c.stderr), 'a directory the instance already registered is refused adopt_registered with the `use` remedy');
  c = await cli(['new', 'Adopted', '--adopt', dir]);
  ok(c.status === 0 && /adopted Adopted \(bp-/.test(c.stdout) && k.profileByRef('Adopted').dir === dir && k.profileByRef('Adopted').owner.kind === 'instance' && k.profileByRef('Adopted').createdBy === KEY_A && /every conversation of the user's can use it/.test(c.stdout), 'owner ruling A: `new <label> --adopt <dir>` registers an existing directory in place — usable by ALL the user\'s conversations, created by this one');
  c = await cli(['new', 'Adopted', '--adopt', dir]);
  ok(c.status === 0 && /already registered/.test(c.stdout), '…idempotent on the directory (this conversation made it)');
  c = await cli(['new', 'Nope', '--adopt', path.join(HOME, '.agent-browser', 'missing')]);
  ok(c.status === 1 && /\[adopt_failed\]/.test(c.stderr), 'a missing directory (under a root) is refused by name');
  // GET /session carries the set
  r = await j('GET', '/api/browser/session/sess-1');
  ok(r.status === 200 && Array.isArray(r.json.attachments) && Array.isArray(r.json.handles) && 'defaultProfile' in r.json, 'GET /api/browser/session/:id answers the attachment set');
  // MULTIVIEW §4: the route pairs the ONE witness with the ONE handle it minted — the helper's browser is named by its Task
  ok(r.json.helperNames && r.json.helperNames[KEY_A + '.1'] === 'Check the prices', 'the new-child route + the stdout witness name the helper: helperNames[<handle>] = its Task\'s description', r.json.helperNames);
  const rowsR = S.browserListFor(r.json);
  const kidRow = rowsR.find((x) => x.ref === KEY_A + '.1');
  ok(kidRow && kidRow.kind === 'child' && kidRow.helper.name === 'Check the prices' && kidRow.helper.n === 1 && kidRow.driver === 'helper' && 'browser' in r.json.children.find((x) => x.handle === KEY_A + '.1'), 'the strip\'s list carries the helper row, named, and the status answer carries ITS browser slot', kidRow);
  ok(r.json.cap && Number.isInteger(r.json.cap.own) && r.json.cap.cap >= 1 && r.json.cap.machine, 'the answer carries the own/cap chip (D4)');
  await k.stop(work.id).catch(() => { }); await k.stop(pers.id).catch(() => { });
  k.shutdown();
  srv.close(); srv = null;
}

// ═══ ④ MULTIVIEW (docs/design-browser-multiview.zh.md §2 A1 / §4 B-89d0), PURE + the real bridge ═══
console.log('— ④ MULTIVIEW: the strip\'s list (truth table + negative control), the child rung, the helper naming by witness, the bridge\'s child relay');
{
  const bk = KEY_A;
  ok(String(S.CHILD_HANDLE_RE) === String(B.CHILD_KEY_RE), 'the stream module\'s child-handle spelling IS browser-profiles\' (this module imports nothing — the two sources are pinned equal)');
  // the truth table: attachments ∪ ephemeral ∪ children, nothing else
  const status = {
    browserKey: bk,
    attachments: [{ profileId: 'bp-00000001', alias: 'work', label: 'Work', isDefault: true }, { profileId: 'bp-00000002', alias: 'personal', label: 'Personal', isDefault: false }],
    leases: [
      { profileId: 'bp-00000001', browserKey: bk, others: 2, browser: { state: 'ready' } },
      { profileId: 'bp-00000002', browserKey: bk, others: 0, browser: { state: 'stopped' } },
      { profileId: 'bp-00000003', browserKey: bk + '.1', others: 0, browser: { state: 'ready' } }, // a helper's named lease: not an attachment of the parent
    ],
    ephemeral: { profileId: 'bp-000000e1', browserKey: bk, child: false, state: 'ready', live: true },
    children: [{ handle: bk + '.2', browser: null }, { handle: bk + '.1', browser: { profileId: 'bp-000000c1', state: 'ready' } }, { handle: KEY_B + '.1', browser: { state: 'ready' } }],
    inputs: [{ input: 'user', browserKey: bk, profileId: 'bp-00000002' }, { input: 'user', browserKey: bk + '.1', profileId: null }],
    // things that are NOT one of this session's browsers — none may ever become a row:
    desktopApps: [{ id: 'da-1', label: 'GIMP' }], profiles: [{ id: 'bp-00000009', label: 'Unleased' }], ephemerals: [{ profileId: 'bp-000000e9', browserKey: KEY_B }],
    pin: { profileId: 'bp-00000009' }, handles: [{ handle: 'ghost', kind: 'attachment' }],
  };
  const rows = S.browserListFor(status, { activity: { 'bp-00000001': true }, helpers: S.bindHelpers(S.bindHelpers(S.bindHelpers(S.bindHelpers(null, { kind: 'task', id: 't1', description: 'Scrape the menu' }), { kind: 'witness', id: 'w1', parent: 't1' }), { kind: 'child', handle: bk + '.1' }), { kind: 'witness-close', id: 'w1', text: `export VIBESPACE_BROWSER='${bk}.1'` }) });
  const want = [
    ['bp-00000001', 'attachment', 'running', 'agent', true, 2],
    ['bp-00000002', 'attachment', 'released', 'you', false, 0],
    [S.EPHEMERAL_REF, 'ephemeral', 'idle', 'agent', false, 0],
    [bk + '.1', 'child', 'idle', 'you', false, 0],
    [bk + '.2', 'child', 'released', 'helper', false, 0],
  ];
  ok(rows.length === want.length, `the list has exactly ${want.length} rows (2 attachments, the own browser, 2 helpers)`, rows.map((r) => r.ref));
  for (const [ref, kind, state, driver, isDef, owners] of want) {
    const r = rows.find((x) => x.ref === ref);
    ok(r && r.kind === kind && r.state === state && r.driver === driver && r.isDefault === isDef && r.owners === owners, `row ${ref}: ${kind} · ${state} · driver ${driver} · default ${isDef} · owners ${owners}`, r);
  }
  ok(rows.map((r) => r.ref).join() === ['bp-00000001', 'bp-00000002', S.EPHEMERAL_REF, bk + '.1', bk + '.2'].join(), 'order: attachments (lease order), the own browser, helpers by number');
  ok(rows.find((x) => x.ref === bk + '.1').helper.name === 'Scrape the menu' && rows.find((x) => x.ref === bk + '.2').helper.name === null && rows.find((x) => x.ref === bk + '.2').helper.n === 2, 'a WITNESSED helper is named by its Task; an unwitnessed one is numbered');
  // NEGATIVE CONTROL: every foreign record stays out — and a list that let one in would be caught by this very check
  const FOREIGN = ['bp-00000003', 'bp-00000009', 'bp-000000e9', KEY_B + '.1', 'da-1', 'ghost'];
  const leaked = (list) => list.filter((r) => FOREIGN.includes(r.ref) || FOREIGN.includes(r.profileId));
  ok(leaked(rows).length === 0, 'nothing outside the three kinds appears: a helper\'s named lease, an unleased profile, another session\'s ephemeral / helper, a desktop app, a stray handle, the pin', leaked(rows));
  const poisoned = S.browserListFor({ ...status, attachments: [...status.attachments, { profileId: 'bp-00000009', label: 'Unleased' }] });
  ok(leaked(poisoned).length === 1, 'NEGATIVE CONTROL: the same check catches a record that DOES get in (a planted attachment) — the check can fail');
  ok(S.browserListFor({ ...status, ephemeral: { ...status.ephemeral, child: true } }).every((r) => r.kind !== 'ephemeral') && S.browserListFor({ ...status, ephemeral: { ...status.ephemeral, browserKey: KEY_B } }).every((r) => r.kind !== 'ephemeral'), 'an ephemeral record that is a child\'s, or another key\'s, is never the session\'s own row');
  ok(S.browserListFor(null).length === 0 && S.browserListFor({}).length === 0 && S.browserListFor({ browserKey: bk, attachments: [{ profileId: 'bp-00000001', label: 'Work' }] }).length === 1, 'no status ⇒ no rows; one attachment ⇒ one row (the strip stays hidden below two)');
  ok(S.ownLiveCount(rows) === 3, 'the chip\'s numerator counts live rows only (running + idle)');
  // the child rung
  const set = { attachments: status.attachments.map((a) => ({ ...a })), children: [{ handle: bk + '.1' }] };
  const tc = S.streamTargetFor({ browserKey: bk, set, profileRef: bk + '.1', envPairs: ['AGENT_BROWSER_SESSION=vs-' + bk, 'AGENT_BROWSER_NAMESPACE=vs-' + bk] });
  ok(tc.ok && tc.kind === 'child' && tc.handle === bk + '.1' && tc.ns === 'vs-' + bk + '.1' && tc.sessionName === 'vs-' + bk + '.1' && !('envPairs' in tc) && tc.ref === bk + '.1', 'streamTargetFor: a child handle the set lists ⇒ {kind:"child", ns:"vs-<handle>"} — carrying NO pairs (never the parent\'s)', tc);
  const tn = S.streamTargetFor({ browserKey: bk, set, profileRef: bk + '.7' });
  ok(!tn.ok && tn.code === 'not_attached', 'a child handle the set does NOT list is not_attached');
  const te = S.streamTargetFor({ browserKey: bk, set, profileRef: S.EPHEMERAL_REF, envPairs: ['AGENT_BROWSER_SESSION=vs-' + bk] });
  ok(te.ok && te.kind === 'ephemeral' && te.ref === S.EPHEMERAL_REF && te.chosen === 'named', 'EPHEMERAL_REF names the session\'s own browser beside its attachments');
  ok(!S.streamTargetFor({ browserKey: bk, set, profileRef: S.EPHEMERAL_REF }).ok, '…and refuses no-browser without the session\'s pairs');
  ok(S.streamTargetFor({ browserKey: bk, set, profileRef: 'work' }).ref === 'bp-00000001' && S.hello({ target: tc }).target.handle === bk + '.1' && S.hello({ target: tc }).target.ref === bk + '.1', 'every target carries `ref`; hello names the helper\'s handle');
  // helper naming — THE OUTCOMES TABLE (never by time, never by order). lane P verify (finding 4, 2026-09-26): a
  // witness is paired at its CLOSE (the Bash tool_result): a helper is named only when EXACTLY ONE mint arrived
  // inside that witness's window (tool_use … tool_result), no other witness was open in it, and the result's own
  // words name that handle (the CLI prints it). A mint arriving with no open witness is "Helper N" for good.
  const task = (id, d) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'Task', input: { description: d, subagent_type: 'x' } }] } });
  const bash = (id, parent, cmd = 'vibespace-browser new-child') => ({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command: cmd } }] } });
  const minted = (h) => `child handle ${h} minted — its own ephemeral browser, reaped with this conversation.\nexport VIBESPACE_BROWSER='${h}'`;
  const close = (id, parent, text) => ({ type: 'user', parent_tool_use_id: parent, message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] } });
  const one = {}; BH.observe(one, task('T1', 'Compare flights')); BH.observe(one, bash('B1', 'T1')); BH.noteChild(one, bk + '.1');
  ok(!BH.namesOf(one)[bk + '.1'], 'a witness still OPEN names nothing yet (the pairing is decided at its close)');
  BH.observe(one, close('B1', 'T1', minted(bk + '.1')));
  ok(BH.namesOf(one)[bk + '.1'] === 'Compare flights', 'ONE witness, ONE mint inside its window, its result names the handle ⇒ "Helper: Compare flights"');
  // the verifier's sequence: a helper whose new-child ran inside a SCRIPT (no Bash witness) mints .1 while B1 is open, then B1's own mint .2
  const script = {}; BH.observe(script, task('T1', 'Check the prices')); BH.observe(script, bash('B1', 'T1')); BH.noteChild(script, bk + '.1'); BH.noteChild(script, bk + '.2'); BH.observe(script, close('B1', 'T1', minted(bk + '.2')));
  ok(Object.keys(BH.namesOf(script)).length === 0, 'TWO mints inside one witness\'s window (one from a script, no witness of its own) ⇒ neither is named — never paired by order', script._browserHelpers);
  const late = {}; BH.observe(late, task('T1', 'Late witness')); BH.noteChild(late, bk + '.1'); BH.observe(late, bash('B1', 'T1')); BH.observe(late, close('B1', 'T1', minted(bk + '.1')));
  ok(Object.keys(BH.namesOf(late)).length === 0, 'a mint with NO open witness is "Helper N" for good — a witness opening after it never claims it');
  const failed = {}; BH.observe(failed, task('T1', 'Failed call')); BH.observe(failed, bash('B1', 'T1')); BH.noteChild(failed, bk + '.1'); BH.observe(failed, close('B1', 'T1', '[bad-request] the server refused'));
  ok(Object.keys(BH.namesOf(failed)).length === 0, 'the witness\'s own result must NAME the handle: a failed new-child beside somebody else\'s mint names nobody');
  const two = {}; BH.observe(two, task('T1', 'A')); BH.observe(two, task('T2', 'B')); BH.observe(two, bash('B1', 'T1')); BH.observe(two, bash('B2', 'T2')); BH.noteChild(two, bk + '.1'); BH.noteChild(two, bk + '.2'); BH.observe(two, close('B1', 'T1', minted(bk + '.1'))); BH.observe(two, close('B2', 'T2', minted(bk + '.2')));
  ok(Object.keys(BH.namesOf(two)).length === 0, 'TWO witnesses open at once ⇒ both numbered ("Helper 1", "Helper 2") — never guessed, even when each result names its own handle');
  const nested = {}; BH.observe(nested, task('T1', 'A')); BH.observe(nested, task('T2', 'B')); BH.observe(nested, bash('B1', 'T1')); BH.observe(nested, bash('B2', 'T2')); BH.noteChild(nested, bk + '.1'); BH.observe(nested, close('B2', 'T2', minted(bk + '.1'))); BH.observe(nested, close('B1', 'T1', 'no output'));
  ok(Object.keys(BH.namesOf(nested)).length === 0, '…another witness open inside the window makes it ambiguous (the sole mint is not given to the one that closed first)');
  const clean = {}; BH.observe(clean, task('T1', 'First')); BH.observe(clean, bash('B1', 'T1')); BH.noteChild(clean, bk + '.1'); BH.observe(clean, close('B1', 'T1', minted(bk + '.1'))); BH.observe(clean, task('T2', 'Second')); BH.observe(clean, bash('B2', 'T2')); BH.noteChild(clean, bk + '.2'); BH.observe(clean, close('B2', 'T2', minted(bk + '.2')));
  ok(BH.namesOf(clean)[bk + '.1'] === 'First' && BH.namesOf(clean)[bk + '.2'] === 'Second', 'two helpers ONE AFTER THE OTHER are each named (the ambiguity is about overlapping windows)');
  ok(S.helperNames(S.bindHelpers(S.bindHelpers(S.bindHelpers(S.bindHelpers(null, { kind: 'task', id: 't', description: 'D' }), { kind: 'witness', id: 'w', parent: 't' }), { kind: 'child', handle: bk + '.1' }), { kind: 'witness-close', id: 'w', text: `export VIBESPACE_BROWSER='${bk}.10'` }))[bk + '.1'] === undefined, 'the handle is matched as a WHOLE token (…\\.1 is not named by a result printing …\\.10)');
  // NEGATIVE CONTROL (patched copy of src/browser-stream.js — the pre-fix pairing: the witness takes the FIRST mint it
  // saw, whatever else arrived, whatever its result says): the verifier's script sequence goes red on it
  {
    const MS = mutantCopies('browser-handles-naming', REPO);
    const ssrc = fs.readFileSync(path.join(REPO, 'src/browser-stream.js'), 'utf8');
    const A1 = 'if (!w.overlapped && w.mints.length === 1) {';
    const A2 = 'if (c && !c.witness && !c.orphan && namesHandle(ev.text, c.handle)) {';
    ok(ssrc.includes(A1) && ssrc.includes(A2), 'NEGATIVE CONTROL setup: the close-time judgement is found in src/browser-stream.js');
    if (ssrc.includes(A1) && ssrc.includes(A2)) {
      const PS = MS.load('src/browser-stream.js', editAnchor(editAnchor(ssrc, A1, 'if (w.mints.length >= 1) {', "src/browser-stream.js"), A2, 'if (c && !c.witness) {', "src/browser-stream.js"), 'pair-by-order');
      const run = (evs) => PS.helperNames(evs.reduce((st, ev) => PS.bindHelpers(st, ev), null));
      const got = run([{ kind: 'task', id: 'T1', description: 'Check the prices' }, { kind: 'witness', id: 'B1', parent: 'T1' }, { kind: 'child', handle: bk + '.1' }, { kind: 'child', handle: bk + '.2' }, { kind: 'witness-close', id: 'B1', text: minted(bk + '.2') }]);
      ok(got[bk + '.1'] === 'Check the prices', 'NEGATIVE CONTROL: pairing by order names the SCRIPT\'s helper (.1) with the other helper\'s Task — the outcomes table is red on it', got);
      for (const r of copiesCensus(MS.files, MS.dir, REPO, { label: 'naming control: ' })) ok(r.pass, r.name, r.detail);
    }
  }
  const codex = {}; BH.noteChild(codex, bk + '.1');
  ok(Object.keys(BH.namesOf(codex)).length === 0 && S.browserListFor({ browserKey: bk, children: [{ handle: bk + '.1', browser: null }] }, { helpers: codex._browserHelpers }).find((r) => r.kind === 'child').helper.n === 1, 'a CODEX helper (no witness on its stdout) ⇒ "Helper 1"');
  ok(S.newChildWitnessesOf(bash('B9', 'T9', 'vibespace-browser snapshot')).length === 0 && S.newChildWitnessesOf(bash('B9', null)).length === 0 && S.newChildWitnessesOf(bash('B9', 'T9', 'cd x && vibespace-browser --json new-child')).length === 1 && S.taskOpeningsOf(bash('B9', 'T9')).length === 0, 'the witness is exactly a sidechain Bash running `vibespace-browser … new-child` (not another verb, not the parent line)');
  // the REAL bridge: a helper's relay is keyed on ITS handle and uses ITS pairs (a tap needs no socket)
  const BS = require('../src/server/browser-stream.js');
  const asked = [];
  const stubKeeper = {
    setFor: () => ({ attachments: [], children: [{ handle: bk + '.1' }], handles: [] }), list: () => ({ profiles: [] }),
    pairsForKey: (h) => (h === bk + '.1' ? ['AGENT_BROWSER_SESSION=vs-' + h, 'AGENT_BROWSER_NAMESPACE=vs-' + h] : null),
    streamPortFor: async (t) => { asked.push(t); return { ok: false, code: 'stream_unavailable', error: 'stub' }; }, noteViewers: () => { },
  };
  const sess = new Map([['sess-9', { _browserKey: bk, _browserEnv: ['AGENT_BROWSER_SESSION=vs-' + bk, 'AGENT_BROWSER_NAMESPACE=vs-' + bk] }]]);
  const bridge = BS.create({ keeper: stubKeeper, activeSessions: sess, requestAuthed: () => true, log: { warn() { }, log() { } } });
  let relaySeen = null;
  const origCreate = bridge._relays.set.bind(bridge._relays);
  bridge._relays.set = (key, r) => { relaySeen = r; return origCreate(key, r); };
  await bridge.tap('sess-9', bk + '.1', () => { });
  ok(relaySeen && relaySeen.key === 'sess-9|child:' + bk + '.1' && relaySeen.browserKey === bk + '.1' && JSON.stringify(relaySeen.envPairs) === JSON.stringify(stubKeeper.pairsForKey(bk + '.1')), 'the bridge\'s helper relay: keyed on the handle, its takeover key IS the handle, its pairs are the HELPER\'s (never the parent\'s)', relaySeen && { key: relaySeen.key, bk: relaySeen.browserKey, pairs: relaySeen.envPairs });
  ok(asked.length === 1 && asked[0].kind === 'child' && asked[0].handle === bk + '.1', '…and the keeper is asked for the CHILD target\'s port');
  bridge.shutdown();
}

// ═══ r3079 (主开发; lane bl-machines-b's remover route R1) — THE CONVERSATIONS' RECORDS UNREAD ⇒ THE SWEEP REMOVES NOTHING ═══
// The env's boot sweep reads the live browser keys from the conversations' records (session-meta/): a failed LISTING answered «no
// conversation» and a record that did not parse was skipped, so a RUNNING conversation whose key was not in memory yet (right after a
// restart) lost its indirection — the pin reverted, the next launch landed elsewhere — and its own scratch folder. THE LAW: a failed
// listing or a record that cannot be read is UNKNOWN: that pass removes NO indirection. Placed refusals only, each leg's own data
// folder: the records' folder not a folder (a listing that fails), a listing this process may not read (judged only where it holds),
// a record that does not parse. CONTROL (RED): the release's reading in a copy removes the running conversation's indirection.
console.log('— r3079: the conversations\' records unread — the boot sweep removes nothing that pass');
{
  const quietR1 = { warn() { }, log() { } };
  const old = Date.now() / 1000 - 7200;   // past the sweep's in-flight grace
  const RUN = 'bk-0c0c0c01', STRAY = 'bk-0c0c0c02';   // a running conversation known only from its record; a key nobody names
  const placements = [
    { name: 'a listing of the records that fails (its folder is not a folder)', place: (md) => { fs.rmSync(md, { recursive: true, force: true }); fs.writeFileSync(md, 'not a folder'); }, holds: () => true },
    { name: 'a listing of the records this process may not read', place: (md) => fs.chmodSync(md, 0o000), holds: (md) => { try { fs.readdirSync(md); return false; } catch (e) { return e.code === 'EACCES'; } } },
    { name: 'a record that does not parse', place: (md, rec) => fs.writeFileSync(path.join(md, rec.file), rec.body.slice(0, 9)), holds: () => true },
  ];
  const scene = (Mod, tag) => {
    const d = path.join(ROOT, `r1-${tag}`), dataDir = path.join(d, 'data'), home = path.join(d, 'home');
    fs.mkdirSync(path.join(dataDir, 'browser-env'), { recursive: true }); fs.mkdirSync(path.join(home, '.agent-browser'), { recursive: true });
    const files = {};
    for (const k of [RUN, STRAY]) {
      const cfg = path.join(dataDir, 'browser-env', `${k}.json`); fs.writeFileSync(cfg, '{}'); fs.utimesSync(cfg, old, old);
      const prof = path.join(dataDir, 'browser-profiles', k); fs.mkdirSync(path.join(prof, 'Default'), { recursive: true }); fs.writeFileSync(path.join(prof, 'Default', 'Cookies'), `the sign-ins of ${k}`); fs.utimesSync(prof, old, old);
      files[k] = { cfg, prof };
    }
    const md = path.join(dataDir, 'session-meta'); fs.mkdirSync(md, { recursive: true });
    const rec = { file: 'cw-r1-0001.json', body: JSON.stringify({ browserKey: RUN, webuiSessionId: 'sess-r1-0001' }) };
    fs.writeFileSync(path.join(md, rec.file), rec.body);
    const e = Mod.create({ dataDir, homeDir: home, serverNotice: null, telemetry: null, log: quietR1, env: { XDG_RUNTIME_DIR: SHORT }, socketDirBase: SOCKBASE });
    return { e, md, rec, files };
  };
  const still = (f) => fs.existsSync(f.cfg) && fs.existsSync(f.prof);
  // the scene when the records READ: the running conversation's record keeps its indirection and folder; the unnamed key is swept
  {
    const sc = scene(BE, 'read');
    const r = sc.e.sweep(new Set());
    ok(still(sc.files[RUN]) && !fs.existsSync(sc.files[STRAY].cfg) && !r.metaUnreadable, 'PREMISE: with the records read, a running conversation known only from its record keeps its indirection and folder, and a key nobody names is swept (as before)', JSON.stringify({ r: { swept: r.swept, kept: r.kept }, run: still(sc.files[RUN]), stray: fs.existsSync(sc.files[STRAY].cfg) }));
  }
  let n = 0;
  for (const pl of placements) {
    n += 1;
    const sc = scene(BE, `p${n}`);
    pl.place(sc.md, sc.rec);
    if (!pl.holds(sc.md)) { try { fs.chmodSync(sc.md, 0o700); } catch { } console.log(`  (${pl.name}: this run lists a mode-0000 folder, so the placed refusal does not hold here — SAID, not judged)`); continue; }
    const r = sc.e.sweep(new Set());
    try { fs.chmodSync(sc.md, 0o700); } catch { }
    ok(still(sc.files[RUN]) && still(sc.files[STRAY]) && r.swept === 0 && r.metaUnreadable === true && /could not all be read/.test(String(r.skipped || '')),
      `${pl.name}: the boot sweep removes NO indirection that pass — the running conversation's config and folder stand (and the unnamed one waits too); it says why`, JSON.stringify({ r: { swept: r.swept, skipped: r.skipped || null, why: r.why || null }, run: still(sc.files[RUN]), stray: still(sc.files[STRAY]) }));
  }
  // CONTROL (RED): the release's reading in a copy — a failed listing is «no conversation»: the running conversation's indirection is removed
  {
    const M1 = mutantCopies('browser-handles-r1', REPO);
    const src = fs.readFileSync(path.join(REPO, 'src/server/browser-env.js'), 'utf8');
    let pre = null; try { pre = editAnchor(src, '    if (!metaRead.known) {\n', '    if (false) {\n', 'src/server/browser-env.js'); } catch { pre = null; }
    if (!pre) console.log('  (the control patches the cure\'s own line — not in this tree: no control here)');
    else {
    const BEpre = M1.load('src/server/browser-env.js', pre);
    const sc = scene(BEpre, 'ctl');
    placements[0].place(sc.md, sc.rec);
    const r = sc.e.sweep(new Set());
    ok(pre !== src && !fs.existsSync(sc.files[RUN].cfg) && r.swept >= 1, 'CONTROL (RED): with the release\'s reading (an unread listing is «no conversation») the copy\'s sweep removes the running conversation\'s indirection', JSON.stringify({ swept: r.swept, run: fs.existsSync(sc.files[RUN].cfg) }));
    }
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

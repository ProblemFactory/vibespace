#!/usr/bin/env node
// THE ROSTER-PER-PASS DRILL (lane roster-per-pass, 2026-11-11). The owner's hub held its main thread 85–93 %: one
// groups list() of the owner's 358 pair groups rebuilt the WHOLE live roster (every live conversation × its Task Groups) 1 432
// times, 280–410 ms, and every user-state write ran a sweep that rebuilt it once per id AND walked the codex sessions
// tree synchronously once per id. THE LAW, each leg below RED on master (the red controls run the same legs on a git
// archive of it) or on a patched copy of this tree (the mutants):
//   ① A PASS BUILDS THE ROSTER ONCE — list / listFor / announce / noteRoster / a steady sweep: ≤ 1 build each (a counting
//     builder handed to the real channels wiring, the real groups engine, the real TaskGroupManager), and a RATCHET:
//     list() at 400 groups × 36 live × 10 Task Groups ≤ K_RATCHET × one roster build, both measured in this run.
//   ② NOTHING SEEN CHANGES — a seeded corpus (live, stopped, ended, archived, closed groups; a legacy name; claude, codex
//     and remote-cache transcripts; a pending fork; a rename, a bind and a folder rule changed BETWEEN passes; an archive;
//     a conversation ending MID-SWEEP; an unarchive) read through BOTH trees in lockstep: list, listFor, liveRoster, reach,
//     every liveness verdict, the access verdicts (groupsOfSession, membersNow), the sweeps' results and the store after
//     them are deep-equal to master's.
//   ③ A READ AFTER A WRITE SEES THE WRITE — per writer class (a session added, removed, renamed, its addressable id adopted
//     or changed, its cwd changed, its reach override or initial Task Group set, a Task Group bind / folder rule / archive):
//     write, then read WITHOUT yielding and WITHOUT the broadcast; and the same read in a continuation queued BEFORE the
//     write — list, listFor, a liveness verdict, groupsOfSession, membersNow equal master's.
//   ④ WHAT THE ROSTER HANDS OUT IS NOT SHARED STATE — FROZEN ENTRIES (each entry and its `groups`; `reachability` is a
//     string), a fresh array per read; a write into an entry throws.
//   ⑤ A SWEEP READS EACH TRANSCRIPT TREE ONCE, OFF THE LOOP — readdir ≤ 1 per directory per sweep, no readdirSync of a
//     tree, never a subagents / workflows directory; A TREE THAT WAS NOT READ WHOLE SAYS NOTHING IS GONE (EACCES, EMFILE,
//     a directory vanishing mid-walk, a walk past its bound ⇒ 0 gone, while the same ids ARE gone on a whole tree); a walk
//     that never returns is unknown after the bound and the sweep ends; a stuck walk is not doubled; a transcript that
//     appears between two sweeps is seen by the second.
//     ROUND 2: A «GONE» VERDICT IS TRUE WHEN IT ACTS — the verifier's scenes (a conversation that writes its FIRST
//     transcript and leaves the roster while the sweep awaits an earlier act; a transcript written right after its
//     directory was listed) close nothing, equal to master; G gone candidates ⇒ G asks; a name a failed walk read is
//     `{stopped}` as master answers; a stuck walk is said ONCE in the journal.
//   ⑥ WRITES DO NOT QUEUE SWEEPS — the leading edge sweeps AT ONCE; 120 writes over 11 gaps ⇒ ≤ 12 sweeps; a write in a
//     gap is swept within the gap (the kb: «after an archive, a sender waiting on that conversation is told after at most
//     the sweep already running, 5 s, and one more sweep»).
// The scratch lives under os.tmpdir() (HOME is the drill's: no real transcript is read); nothing listens, no CLI runs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '3c7ae82a2';   // MASTER under this commit (2.369.394; its roster files are 2.369.390's byte for byte)
const K_RATCHET = 120;   // list() ≤ K × one build: master is > 1 000 × (a build per member read), this tree ~10–40 ×
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-roster-pass-'));
const HOME = path.join(ROOT, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME;   // before any tree's module is required: ~/.claude/projects and codex's sessions dir are the drill's
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
// the engines' own log lines are not this drill's output
const say = console.log.bind(console);
const quiet = (orig) => (...a) => { const s = String(a[0] || ''); if (/^\[(channels|groups|channel-touches|task-groups|webhook|channel-api)/.test(s)) return; orig(...a); };
console.log = quiet(console.log); console.warn = quiet(console.warn); console.info = quiet(console.info);

let passed = 0, failed = 0;
function ok(cond, name, detail) {
  if (cond) { passed++; say(`  ✓ ${name}`); }
  else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900)}`); }
  return !!cond;
}
const tick = () => new Promise((r) => setImmediate(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));
const canon = (v) => (v === undefined ? 'undefined' : JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((kk) => [kk, x[kk]])) : x)));
function firstDiff(a, b, at = '') {
  if (canon(a) === canon(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${at}.${k}`); if (d) return d; }
  }
  return `${at || '.'}: ${canon(a).slice(0, 300)} ≠ ${canon(b).slice(0, 300)}`;
}

// ── the trees under test: this one (a copy), master (a git archive), the mutants (hardlinked copies, one file patched)
const NM = fs.realpathSync(path.join(REPO, 'node_modules'));
function cpTree(a, b, link) {
  const st = fs.lstatSync(a);
  if (st.isSymbolicLink()) { fs.symlinkSync(fs.readlinkSync(a), b); return; }
  if (st.isDirectory()) { fs.mkdirSync(b, { recursive: true }); for (const n of fs.readdirSync(a)) cpTree(path.join(a, n), path.join(b, n), link); return; }
  if (link) { try { fs.linkSync(a, b); return; } catch { } }
  fs.copyFileSync(a, b);
}
function makeTree(name, from, { link = false } = {}) {
  const dst = path.join(ROOT, 'trees', name);
  fs.mkdirSync(dst, { recursive: true });
  for (const rel of ['server.js', 'package.json', 'src']) cpTree(path.join(from, rel), path.join(dst, rel), link);
  fs.symlinkSync(NM, path.join(dst, 'node_modules'));
  seedRemote(dst);
  return dst;
}
function baseTree() {
  // §75: the old object is probed first; a depth-1 checkout does not hold it ⇒ the legs that need it SKIP by name
  try {
    const probe = spawnSync('git', ['cat-file', '-e', `${BASE}^{commit}`], { cwd: REPO });
    if (probe.status !== 0) return null;
    const ar = spawnSync('git', ['archive', '--format=tar', BASE, 'server.js', 'package.json', 'src'], { cwd: REPO, maxBuffer: 1 << 30 });
    if (ar.status !== 0 || !ar.stdout) return null;
    const dst = path.join(ROOT, 'trees', 'base');
    fs.mkdirSync(dst, { recursive: true });
    const x = spawnSync('tar', ['-x', '-C', dst], { input: ar.stdout, maxBuffer: 1 << 26 });
    if (x.status !== 0) return null;
    const bv = path.join(REPO, 'src/lib/build-version.js');   // a generated file (npm run build), never in an archive
    if (!fs.existsSync(path.join(dst, 'src/lib/build-version.js')) && fs.existsSync(bv)) fs.copyFileSync(bv, path.join(dst, 'src/lib/build-version.js'));
    fs.symlinkSync(NM, path.join(dst, 'node_modules'));
    seedRemote(dst);
    return dst;
  } catch { return null; }
}
/** A mutant of roster-pass.js ALONE (it requires nothing): the patched module beside this tree's own wiring — the memo's
 *  life and the freeze read `RP` directly, a fingerprint mutant hands its `sessionRoster` to this tree's wiring. */
function rpMutant(name, edits) {
  let src = fs.readFileSync(path.join(HEAD_T, 'src/server/roster-pass.js'), 'utf8');
  for (const [a, b] of edits) { if (!src.includes(a)) throw new Error(`mutant ${name}: anchor not in roster-pass.js: ${a.slice(0, 90)}`); src = src.replace(a, b); }
  const d = path.join(ROOT, 'rp-mutants', name); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'roster-pass.js'), src);
  const RP = createRequire(path.join(d, 'x.js'))('./roster-pass.js');
  return { ...HEAD, label: 'm', small: true, RP, rosterOf: (sessions, tasks) => RP.sessionRoster({ sessions: () => sessions, tasks: () => tasks, addressableId: HEAD.addressableId, statusKey: HEAD.statusKey }) };
}
function mutant(name, file, edits) {
  const T = makeTree('m-' + name, HEAD_T, { link: true });
  const p = path.join(T, file);
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of edits) { if (!s.includes(a)) throw new Error(`mutant ${name}: anchor not in ${file}: ${a.slice(0, 90)}`); s = s.replace(a, b); }
  fs.rmSync(p); fs.writeFileSync(p, s);   // unlinked first: the hardlink's original is never written
  return T;
}

/** One tree's surface: its own server.js roster builder (master: the inline `liveSessions` arrow, evaluated; this tree:
 *  roster-pass sessionRoster, as server.js hands it), its own sessionStatusKey, wiring, Task Groups, session store. */
function api(T, label) {
  const req = createRequire(path.join(T, 'package.json'));
  const srv = fs.readFileSync(path.join(T, 'server.js'), 'utf8');
  const sk = srv.match(/\nfunction sessionStatusKey\(session, id\) \{\n[\s\S]*?\n\}\n/);
  const statusKey = new Function(`${sk[0]}\nreturn sessionStatusKey;`)();
  const { addressableId } = req('./src/claude-lock-capture.js');
  const hasPass = fs.existsSync(path.join(T, 'src/server/roster-pass.js'));
  let inline = null;
  if (!hasPass) { const line = srv.split('\n').find((l) => l.startsWith('  liveSessions: () => {')); inline = line.slice('  liveSessions: '.length, line.indexOf(', groupSetting: ')); }
  const rosterOf = (sessions, tasks) => (hasPass
    ? req('./src/server/roster-pass.js').sessionRoster({ sessions: () => sessions, tasks: () => tasks, addressableId, statusKey })
    : { build: new Function('activeSessions', 'addressableId', 'tasks', 'sessionStatusKey', `return (${inline});`)(sessions, addressableId, tasks, statusKey), fingerprint: null });
  const lazy = (f) => { let v; return () => (v === undefined ? (v = f()) : v); };   // a mutant leg loads only what it reads
  const W = lazy(() => req('./src/server/channels-wiring.js')), TGM = lazy(() => req('./src/task-groups.js').TaskGroupManager), EX = lazy(() => req('express'));
  return {
    T, label, req, hasPass, statusKey, addressableId, rosterOf, RP: hasPass ? req('./src/server/roster-pass.js') : null,
    get TGM() { return TGM(); }, get W() { return W(); }, get express() { return EX(); },
  };
}

// ── the corpus ────────────────────────────────────────────────────────────────────────────────────────────────────────
const U = (n) => `${n.toString(16).padStart(8, '0')}-${(n % 0xffff).toString(16).padStart(4, '0')}-4000-8000-${n.toString(16).padStart(12, '0')}`;
const T0 = Date.parse('2026-11-10T12:00:00Z');
const WORK = path.join(ROOT, 'work');
const W_A = path.join(WORK, 'a'), W_B = path.join(WORK, 'b'), W_B_SUB = path.join(WORK, 'b', 'sub'), W_C = path.join(WORK, 'c'), W_OTHER = path.join(WORK, 'other');
for (const d of [W_A, W_B_SUB, W_C, W_OTHER]) fs.mkdirSync(d, { recursive: true });
const C = {};   // name → cid
const NAMES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'LX', 'FORK', 'S1', 'S2', 'SX', 'SZ', 'SR', 'SRX', 'G1', 'G2', 'G3', 'RM', 'UN', 'AR', 'E1', 'E2', 'NEW', 'FORK_OWN', 'L4_NEXT', 'NEVER'];
NAMES.forEach((n, i) => { C[n] = U(0x5100 + i); });
const PROJ = path.join(HOME, '.claude', 'projects');
const CODEX = path.join(HOME, '.codex', 'sessions');
function seedHome() {
  const proj = (k) => { const d = path.join(PROJ, `-opt-corpus-${k}`); fs.mkdirSync(d, { recursive: true }); return d; };
  fs.writeFileSync(path.join(proj(0), C.S1 + '.jsonl'), '{}\n');
  fs.writeFileSync(path.join(proj(1), C.S2 + '.jsonl'), '{}\n');
  fs.writeFileSync(path.join(proj(1), C.E1 + '.jsonl'), '{}\n');            // E1: archived once, its transcript is there (revived)
  fs.writeFileSync(path.join(proj(2), C.L1 + '.jsonl'), '{}\n');
  fs.mkdirSync(path.join(proj(2), C.L1, 'subagents'), { recursive: true });  // never read by a sweep
  fs.writeFileSync(path.join(proj(2), C.L1, 'subagents', 'agent-x.jsonl'), '{}\n');
  fs.writeFileSync(path.join(PROJ, 'stray-file.txt'), 'x');                  // a file beside the project dirs
  const day = path.join(CODEX, '2026', '11', '10'); fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(path.join(day, `rollout-2026-11-10T00-00-00-${C.SX}.jsonl`), '{}\n');
  fs.writeFileSync(path.join(day, `rollout-2026-11-10T00-00-01-${C.SZ}.jsonl.zst`), 'z');
}
function seedRemote(T) {
  const h = path.join(T, 'data', 'remote-jsonl', 'host-1');
  fs.mkdirSync(path.join(h, 'codex'), { recursive: true });
  fs.writeFileSync(path.join(h, C.SR + '.jsonl'), '{}\n');
  fs.writeFileSync(path.join(h, 'codex', C.SRX + '.jsonl'), '{}\n');
}
seedHome();
const METAS = {   // session-meta: this machine's (no host) ⇒ local, another's ⇒ remote; none ⇒ unknown
  m1: { claudeSessionId: C.G1 }, m2: { claudeSessionId: C.G2 }, m3: { claudeSessionId: C.G3 }, m4: { claudeSessionId: C.RM, host: 'host-1' },
  m5: { claudeSessionId: C.L8 }, m6: { claudeSessionId: C.NEVER }, m7: { claudeSessionId: C.L2 },
};
const SESSIONS = [
  ['w-L1', { claudeSessionId: C.L1, name: 'alpha', cwd: W_A }],
  ['w-L2', { claudeSessionId: C.L2, name: 'beta', cwd: W_B }],
  ['w-L3', { claudeSessionId: C.L3, name: 'gamma', cwd: W_OTHER }],
  ['w-L4', { claudeSessionId: C.L4, name: 'delta', cwd: W_C }],
  ['w-L5', { claudeSessionId: C.L5, name: 'epsilon', cwd: W_OTHER }],
  ['w-L6', { claudeSessionId: C.L6, name: 'zeta', cwd: W_OTHER }],
  ['w-L7', { claudeSessionId: C.L7, name: 'eta', cwd: W_A }],
  ['w-L8', { claudeSessionId: C.L8, name: 'theta', cwd: W_OTHER }],
  ['w-LX', { backend: 'codex', backendSessionId: C.LX, name: 'codex one', cwd: W_B, _msgReachability: 'visible' }],
  ['w-FORK', { claudeSessionId: C.L1, _forkRequested: true, _forkSourceId: C.L1, name: 'a fork of alpha', cwd: W_A }],
  ['w-webui', { name: 'no id yet', cwd: W_A }],
];
const TASKS = {
  'T-a': { id: 'T-a', title: 'Bound', createdAt: 1, sessions: [`claude:${C.L1}`, `claude:${C.L2}`, `codex:${C.LX}`], ctx: [] },
  'T-b': { id: 'T-b', title: 'Folder b', createdAt: 2, sessions: [], ctx: [{ path: W_B, tags: ['discover'] }] },
  'T-c': { id: 'T-c', title: 'Archived', createdAt: 3, archived: true, sessions: [`claude:${C.L3}`], ctx: [{ path: W_OTHER, tags: ['discover'] }] },
  'T-d': { id: 'T-d', title: 'Spawned into', createdAt: 4, sessions: [], ctx: [] },
};
const USER_STATE = { archivedSessions: [`claude:${C.AR}`] };
let gidN = 0;
const GID = () => `g-${(0x7a000000 + (++gidN)).toString(16)}`;
function group(members, { name = null, pair = members.length === 2, archivedAt = null, closed = null, at = 0, legacyNames = {} } = {}) {
  const id = GID();
  const g = {
    id, name: name || `pair ${gidN}`, createdBy: members[0], createdAt: T0 - 10000 + at, lastAt: T0 - 5000 + at, lastText: 'hello',
    members: members.map((m, i) => ({ member: m, name: legacyNames[m] || `m${i}`, notify: 'next-turn', joinedAt: T0 - 10000 + at })),
  };
  if (pair) g.pair = members.slice().sort();
  if (archivedAt) g.archivedAt = archivedAt;
  if (closed) g.closed = closed;
  return g;
}
function corpusGroups() {
  gidN = 0;
  const gs = [
    group([C.L1, C.L2]), group([C.L1, C.S1]), group([C.L2, C.SX], { at: 1 }), group([C.L3, C.SZ], { at: 2 }),
    group([C.L4, C.SR], { at: 3 }), group([C.L5, C.SRX], { at: 4 }), group([C.L6, C.G1], { at: 5 }), group([C.L7, C.RM], { at: 6 }),
    group([C.L1, C.UN], { at: 7 }), group([C.L2, C.AR], { at: 8 }), group([C.L3, C.E1], { at: 9 }), group([C.L4, C.E2], { at: 10 }),
    group([C.L5, C.G2], { at: 11, archivedAt: T0 - 100 }), group([C.L6, C.G3], { at: 12, closed: { member: C.G3, why: 'gone', at: T0 - 50 } }),
    group([C.L1, C.L2, C.LX], { pair: false, name: 'legacy\u0007name\nwith a line', at: 13, legacyNames: { [C.L2]: 'beta (old name)' } }),
    group([C.S2, C.L8], { at: 14 }), group([C.L7, C.L8], { at: 15 }), group([C.LX, C.S2], { at: 16 }),
    group([C.L3, C.FORK_OWN], { at: 17 }), group([C.L4, C.L4_NEXT], { at: 18 }), group([C.L6, C.NEW], { at: 19 }),
  ];
  return { v: 1, groups: Object.fromEntries(gs.map((g) => [g.id, g])), ownerRead: {}, ended: { [C.E1]: { why: 'archived', at: T0 - 9000 }, [C.E2]: { why: 'gone', at: T0 - 9000 } } };
}
const CORPUS_CIDS = NAMES.map((n) => C[n]);
const PAIRS = [[C.L1, C.L2], [C.L2, C.LX], [C.LX, C.L1], [C.L6, C.L1], ['user', C.L3], [C.L3, C.L8], [C.L1, C.L6], [C.L2, C.L5]];

let wn = 0;
/** A world: the tree's REAL channels wiring over a scratch data dir, the REAL TaskGroupManager, a session map, a counting
 *  builder (`counter.builds` = roster builds), the wiring's own liveness reader (master builds the same one inside). */
async function world(A, spec = {}) {
  const dataDir = path.join(ROOT, 'worlds', `${A.label}-${++wn}`, 'data');
  fs.mkdirSync(path.join(dataDir, 'session-meta'), { recursive: true });
  for (const [f, m] of Object.entries(spec.metas || METAS)) fs.writeFileSync(path.join(dataDir, 'session-meta', f + '.json'), JSON.stringify(m));
  const tasks = new A.TGM({ dataDir, homeDir: HOME });
  tasks._state.tasks = clone(spec.tasks || TASKS);
  const sessions = new Map((spec.sessions || SESSIONS).map(([id, s]) => [id, clone(s)]));
  const R = A.rosterOf(sessions, tasks);
  const counter = { builds: 0 };
  const build = () => { counter.builds++; return R.build(); };
  const st = { userState: clone(spec.userState || USER_STATE) };
  const clock = { t: T0 };
  const app = A.express();
  const w = A.W.create({
    app, dataDir, liveSessions: build, rosterFingerprint: R.fingerprint, readUserState: () => st.userState, groupSetting: () => [],
    now: spec.now || (() => clock.t), sweepGapMs: spec.gap == null ? 0 : spec.gap, transcriptIndex: spec.io || null, bcastAll: () => { },
  });
  await sleep(15);
  try { w.channels.stop(); } catch { }
  await w.channels.store.groups.update((gr) => { const seed = clone(spec.groups || corpusGroups()); gr.groups = seed.groups; gr.ended = seed.ended || {}; gr.ownerRead = seed.ownerRead || {}; });
  const liveness = w.liveness || A.W.livenessReader({ liveSessions: build, readUserState: () => st.userState, convIndex: () => null, metaDir: path.join(dataDir, 'session-meta') });
  // the access verdicts (groupsOfSession, membersNow) of the tree's OWN channels-access, over the roster door its engine reads
  const access = A.req('./src/server/channels-access.js').create({ liveSessions: w.roster || build, log: { warn() { }, log() { }, info() { } }, now: () => clock.t });
  counter.builds = 0;
  return { A, w, tasks, sessions, st, counter, liveness, access, clock, dataDir, R };
}
function readAll(x, cids = CORPUS_CIDS) {
  const g = x.w.groups, ch = x.access;
  return {
    list: g.list(), listFor: cids.map((c) => g.listFor(c)), roster: g.liveRoster(), reach: PAIRS.map(([a, b]) => g.reach(a, b)),
    liveness: cids.map((c) => x.liveness(c)), groupsOf: cids.map((c) => ch.groupsOfSession(c)), members: ch.membersNow(),
  };
}
const storeOf = (x) => clone(x.w.channels.store.groups.live());
const SEED_ENDED = new Set(Object.keys(corpusGroups().ended));
const goneNew = (x) => Object.entries(x.w.channels.store.groups.live().ended || {}).filter(([k, e]) => e && e.why === 'gone' && !SEED_ENDED.has(k)).length;

// ── the shape (the owner's: 358 groups, 724 member rows, 339 members, 561 ended, 36 live, 7 Task Groups) ────────────────
function shapeSpec({ NG = 358, NL = 36, NTG = 7, NM = 339, NEND = 561 } = {}) {
  gidN = 0;
  const live = Array.from({ length: NL }, (_, i) => U(0x9000 + i));
  const others = Array.from({ length: NM - NL }, (_, i) => U(0xa000 + i));
  const sessions = live.map((cid, i) => [`w-s${i}`, { claudeSessionId: cid, name: `agent ${i}`, cwd: path.join(WORK, 'p' + (i % 8)) }]);
  for (let i = 0; i < 8; i++) fs.mkdirSync(path.join(WORK, 'p' + i), { recursive: true });
  const tasks = {};
  for (let j = 0; j < NTG; j++) tasks[`T-s${j}`] = { id: `T-s${j}`, title: `TG ${j}`, createdAt: j, sessions: live.filter((_, i) => i % NTG === j).map((c) => `claude:${c}`), ctx: [{ path: path.join(WORK, 'p' + (j % 8)), tags: ['discover'] }, { path: path.join(WORK, 'p' + ((j + 3) % 8)), tags: ['discover'] }] };
  const gs = {};
  for (let g = 0; g < NG; g++) {
    const a = live[g % NL], b = g < NM - NL ? others[g] : live[(g + 1) % NL];
    const three = g % 50 === 7;
    const gr = group(three ? [a, b, others[(g + 5) % others.length]] : [a, b], { at: g, pair: !three, archivedAt: g % 7 < 6 && g > 40 ? T0 - 1000 : null, closed: g % 2 === 0 && g > 180 ? { member: b, why: 'gone', at: T0 - 900 } : null });
    gs[gr.id] = gr;
  }
  // the ledger as a sweep leaves it (a steady sweep acts on nothing): the archived ones archived, the rest gone
  const ended = {};
  for (let i = 0; i < NEND; i++) ended[U(0xc000 + i)] = { why: i < 300 ? 'archived' : 'gone', at: T0 - 5000 };
  return { sessions, tasks, groups: { v: 1, groups: gs, ownerRead: {}, ended }, metas: {}, userState: { archivedSessions: Array.from({ length: 300 }, (_, i) => `claude:${U(0xc000 + i)}`) } };
}

// the owner's shape for this tree; a red control / a mutant only has to go red — a small shape (ROSTER_FULL=1: master at the
// owner's shape too, the report's before / after)
const FULL = process.env.ROSTER_FULL === '1';
const SHAPE = (A) => (A.small ? shapeSpec({ NG: 60, NL: 12, NTG: 3, NM: 50, NEND: 40 }) : shapeSpec());

// ── fs counting (readdir per path during a sweep) ───────────────────────────────────────────────────────────────────────
function countFs(roots) {
  const sync = new Map(), prom = new Map();
  const under = (p) => roots.some((r) => String(p).startsWith(r));
  const rs = fs.readdirSync, rp = fs.promises.readdir;
  fs.readdirSync = function (p, ...a) { if (under(p)) sync.set(String(p), (sync.get(String(p)) || 0) + 1); return rs.call(this, p, ...a); };
  fs.promises.readdir = function (p, ...a) { if (under(p)) prom.set(String(p), (prom.get(String(p)) || 0) + 1); return rp.call(this, p, ...a); };
  return { sync, prom, stop: () => { fs.readdirSync = rs; fs.promises.readdir = rp; } };
}

// ── the legs (each returns {ok, detail}; HEAD must pass every one, a red control / mutant must fail its own) ───────────
const LEGS = {
  // ① counts at the owner's shape
  async 'count:list'(A) { const x = await world(A, SHAPE(A)); x.counter.builds = 0; const t = performance.now(); x.w.groups.list(); const ms = performance.now() - t, n = x.counter.builds; return { ok: n <= 1, detail: `list() at ${A.small ? 'the small' : "the owner's"} shape: ${n} roster build(s), ${ms.toFixed(1)} ms`, n, ms }; },
  async 'count:listFor'(A) { const x = await world(A, SHAPE(A)); x.counter.builds = 0; x.w.groups.listFor(U(0x9000)); const n = x.counter.builds; return { ok: n <= 1, detail: `listFor(cid) at ${A.small ? 'the small' : "the owner's"} shape: ${n} build(s)`, n }; },
  async 'count:announce'(A) {
    const x = await world(A, SHAPE(A));
    if (A.hasPass) { x.w.groups.noteRoster(); await tick(); }   // the clients told once (master: its first announce IS the one measured — 1 448 builds each)
    x.sessions.get('w-s3').name = 'agent three, renamed';   // one member's name moved ⇒ ONE announce of its groups
    x.counter.builds = 0; const ch = x.w.groups.noteRoster(); const n = x.counter.builds;
    return { ok: n <= 1 && ch.length > 0, detail: `noteRoster → announce(${ch.length} groups): ${n} build(s)`, n };
  },
  async 'count:access'(A) {   // channels-access's per-id loops (a fan-out asks groupsOfSession per conversation, then membersNow)
    const x = await world(A, SHAPE(A));
    const ids = [...new Set(Object.values(x.w.channels.store.groups.live().groups).flatMap((g) => g.members.map((m) => m.member)))];
    x.counter.builds = 0; for (const c of ids) x.access.groupsOfSession(c); x.access.membersNow(); const n = x.counter.builds;
    return { ok: n <= 1, detail: `groupsOfSession × ${ids.length} conversations + membersNow in one run: ${n} build(s)`, n };
  },
  async 'count:sweep'(A) {
    const x = await world(A, SHAPE(A));
    const f = countFs([HOME, path.join(A.T, 'data')]);
    x.counter.builds = 0; const t0 = performance.now(); let hold = 0, last = performance.now(), on = true;
    const probe = () => { const t = performance.now(); hold = Math.max(hold, t - last); last = t; if (on) setImmediate(probe); };
    setImmediate(probe);
    const upd = x.w.channels.store.groups.update; let acts = 0; x.w.channels.store.groups.update = (fn) => { acts++; return upd(fn); };
    const out = await x.w.groups.sweepEnded(); on = false; f.stop(); x.w.channels.store.groups.update = upd;
    const ms = performance.now() - t0, n = x.counter.builds;
    const syncN = [...f.sync.values()].reduce((a, b) => a + b, 0), maxPer = Math.max(0, ...f.prom.values(), ...f.sync.values());
    const sub = [...f.prom.keys(), ...f.sync.keys()].filter((p) => /subagents|workflows/.test(p));
    // one build per synchronous segment: the sweep's own 20 ms slices (a loaded box) and its acts start a new one
    const segs = 1 + acts + Math.floor(ms / 20);
    return { ok: n <= segs && syncN === 0 && maxPer <= 1 && !sub.length, detail: `a steady sweep at ${A.small ? 'the small' : "the owner's"} shape: ${n} build(s) (≤ ${segs} segments; ${acts} acts: ${out.closed.length} closed, ${out.marked.length} marked, ${out.revived.length} revived), ${syncN} readdirSync of a tree, readdir per directory ≤ ${maxPer}, ${f.prom.size} directories read, ${sub.length} subagent dirs, ${ms.toFixed(1)} ms, the longest loop hold ${hold.toFixed(1)} ms`, n, syncN, maxPer, ms, hold };
  },
  // ① the ratchet: list() at 400 × 36 × 10 ≤ K × one build, both measured here
  async 'ratchet'(A) {
    const x = await world(A, shapeSpec({ NG: 400, NL: 36, NTG: 10, NM: 380, NEND: 600 }));
    const med = (f, n) => { const xs = []; for (let i = 0; i < n; i++) { const t = performance.now(); f(); xs.push(performance.now() - t); } xs.sort((a, b) => a - b); return xs[n >> 1]; };
    x.R.build(); if (A.hasPass) x.w.groups.list();     // warm (realpath cache, JIT; master's list warms itself 1 840 times)
    // THE UNIT holds still: one build whose Task-Group membership is THE WALK (groupsForSession as it was asked when K was
    // set) — groups-sweep-on-change commit 2's membership index makes a build ~3× cheaper, which would move the unit, not
    // list(); a tree without the walk (master) builds as it is
    const walk = typeof x.tasks._groupsForSessionWalk === 'function';
    if (walk) x.tasks.groupsForSession = (a) => x.tasks._groupsForSessionWalk(a);
    const one = med(() => x.R.build(), 15);
    if (walk) delete x.tasks.groupsForSession;
    const list = med(() => x.w.groups.list(), A.hasPass ? 9 : 1);
    const k = list / Math.max(one, 1e-3);
    return { ok: k <= K_RATCHET, detail: `list() ${list.toFixed(2)} ms = ${k.toFixed(1)} × one roster build (${one.toFixed(3)} ms${walk ? ', membership by the walk' : ''}) at 400 groups × 36 live × 10 Task Groups — the ratchet K = ${K_RATCHET}`, k, one, list };
  },
  // ① the memo never outlives its synchronous run
  async 'memo:run'(A) {
    if (!A.RP) return { ok: false, detail: 'no roster-pass module' };
    let b = 0; const P = A.RP.createRosterPass(() => { b++; return [{ cid: 'c', name: 'n', groups: [] }]; }, { fingerprint: () => 'same' });
    P.read(); P.read(); P.sessionOf('c'); const inRun = b;
    await null; P.read(); const after = b;
    await tick(); P.pass(() => { P.read(); P.sessionOf('c'); }); const pass = b - after;
    return { ok: inRun === 1 && after === 2 && pass === 1, detail: `one run: ${inRun} build; after an await: ${after}; a pass: ${pass}` };
  },
  // ④ frozen entries
  async 'frozen'(A) {
    if (!A.RP) return { ok: false, detail: 'no roster-pass module' };
    const dataDir = path.join(ROOT, 'worlds', `frozen-${++wn}`); fs.mkdirSync(dataDir, { recursive: true });
    const tasks = new A.TGM({ dataDir, homeDir: HOME }); tasks._state.tasks = clone(TASKS);
    const R = A.rosterOf(new Map(SESSIONS.map(([id, s0]) => [id, clone(s0)])), tasks);
    const P = A.RP.createRosterPass(() => R.build(), { fingerprint: R.fingerprint });
    const a = P.read(), b = P.read();
    let threw = 0;
    try { 'use strict'; a[0].name = 'changed'; } catch { threw++; }
    try { a[0].groups.push('T-x'); } catch { threw++; }
    a.push({ cid: 'planted' });
    const fresh = !b.some((e) => e.cid === 'planted') && !P.read().some((e) => e.cid === 'planted');
    const allFrozen = a.slice(0, -1).every((e) => Object.isFrozen(e) && Object.isFrozen(e.groups) && (e.reachability === null || typeof e.reachability === 'string'));
    return { ok: allFrozen && threw === 2 && fresh && a[0].name !== 'changed', detail: `entries frozen: ${allFrozen}; writes refused: ${threw}/2; a fresh array per read: ${fresh}` };
  },
  // ③ the rename between passes, no broadcast (the memo-kept-across-passes mutant is RED here)
  async 'rename:between-passes'(A) {
    const x = await world(A);
    const before = x.w.groups.listFor(C.L3).map((g) => g.members.find((m) => m.member === C.L3).name);
    await tick();
    x.sessions.get('w-L3').name = 'gamma renamed';
    await tick();
    const after = x.w.groups.listFor(C.L3).map((g) => g.members.find((m) => m.member === C.L3).name);
    const roster = x.w.groups.liveRoster().find((s) => s.cid === C.L3);
    return { ok: after.length > 0 && after.every((n) => n === 'gamma renamed') && roster && roster.name === 'gamma renamed', detail: `before ${JSON.stringify(before)} after ${JSON.stringify(after)} roster ${roster && roster.name}` };
  },
  // ⑤ the transcript trees: an unreadable / failing / vanishing / hung tree says nothing is gone
  async 'tree:whole-vs-unreadable'(A) {
    const rootsOf = (tag) => {
      const r = path.join(ROOT, 'trees-' + tag + '-' + (++wn));
      const proj = path.join(r, 'projects'), cx = path.join(r, 'codex'), remote = path.join(r, 'remote');
      for (let k = 0; k < 3; k++) fs.mkdirSync(path.join(proj, `-opt-p${k}`), { recursive: true });
      fs.writeFileSync(path.join(proj, '-opt-p0', C.S1 + '.jsonl'), '{}\n');
      fs.mkdirSync(cx, { recursive: true }); fs.mkdirSync(remote, { recursive: true });
      return { claude: { projectsRoot: proj, remoteRoot: remote }, codex: { sessionsDir: cx, remoteRoot: remote }, proj };
    };
    // the conversations a sweep newly judged GONE (an archive closes whatever the trees say — it is not counted)
    const closes = async (io) => { const x = await world(A, { io }); await x.w.groups.sweepEnded(); return goneNew(x); };
    const whole = rootsOf('whole');
    const nWhole = await closes(whole);
    const failing = (code, at) => ({ ...fs.promises, readdir: (p, o) => (String(p) === at ? Promise.reject(Object.assign(new Error(code), { code })) : fs.promises.readdir(p, o)) });
    const r1 = rootsOf('eacces'); const nAcc = await closes({ ...r1, claude: { ...r1.claude, fsp: failing('EACCES', path.join(r1.proj, '-opt-p1')) } });
    const r2 = rootsOf('emfile'); const nMf = await closes({ ...r2, claude: { ...r2.claude, fsp: failing('EMFILE', path.join(r2.proj, '-opt-p2')) } });
    const r3 = rootsOf('vanish');
    const vanish = { ...fs.promises, readdir: async (p, o) => { const r = await fs.promises.readdir(p, o); if (String(p) === r3.proj) fs.rmSync(path.join(r3.proj, '-opt-p2'), { recursive: true, force: true }); return r; } };
    const nVan = await closes({ ...r3, claude: { ...r3.claude, fsp: vanish } });
    const r4 = rootsOf('codex-eacces'); fs.mkdirSync(path.join(r4.codex.sessionsDir, '2026'), { recursive: true });
    const nCx = await closes({ ...r4, codex: { ...r4.codex, fsp: failing('EACCES', path.join(r4.codex.sessionsDir, '2026')) } });
    // round 2: under a FAILED walk (the remote cache refused, every project directory read) a name it read answers as the
    // per-id lookup does — {stopped}, never «unreadable»; only an absent one is unknown
    const r5 = rootsOf('read-under-fail'); const x5 = await world(A, { io: { ...r5, claude: { ...r5.claude, fsp: failing('EACCES', r5.claude.remoteRoot) } } });
    const j5 = await x5.liveness.forSweep(); const vRead = j5(C.S1), vAbsent = j5(C.G1);
    const readOk = canon(vRead) === canon({ state: 'stopped' }) && vAbsent.state === 'stopped' && vAbsent.why === 'unreadable';
    return { ok: nWhole > 0 && nAcc === 0 && nMf === 0 && nVan === 0 && nCx === 0 && readOk, detail: `conversations judged gone — a whole tree: ${nWhole}; one project dir EACCES: ${nAcc}; EMFILE: ${nMf}; a dir vanishing mid-walk: ${nVan}; a codex dir EACCES: ${nCx}; under a failed walk a READ name ${JSON.stringify(vRead)}, an absent one ${JSON.stringify(vAbsent)}` };
  },
  async 'tree:hung'(A) {
    const r = path.join(ROOT, 'trees-hung-' + (++wn)); const proj = path.join(r, 'projects'), remote = path.join(r, 'remote'), cx = path.join(r, 'codex');
    fs.mkdirSync(path.join(proj, '-opt-p0'), { recursive: true }); fs.mkdirSync(remote, { recursive: true }); fs.mkdirSync(cx, { recursive: true });
    let release = null, tops = 0;
    const hang = { ...fs.promises, readdir: (p, o) => { if (String(p) === proj) tops++; if (String(p) === path.join(proj, '-opt-p0') && !release) return new Promise((res) => { release = () => res(fs.promises.readdir(p, o)); }); return fs.promises.readdir(p, o); } };
    const io = { claude: { projectsRoot: proj, remoteRoot: remote, fsp: hang, boundMs: 60 }, codex: { sessionsDir: cx, remoteRoot: remote, boundMs: 60 } };
    const x = await world(A, { io });
    const said = []; const warn0 = console.warn; console.warn = (...a) => { const t = String(a[0] || ''); if (t.startsWith('[transcripts]')) said.push(t); else warn0(...a); };
    const t0 = performance.now();
    const out1 = await Promise.race([x.w.groups.sweepEnded(), sleep(3000).then(() => 'never')]);
    const ms1 = performance.now() - t0, gone1 = goneNew(x), stillOut1 = !!release;
    const topsAfter1 = tops;
    const out2 = await Promise.race([x.w.groups.sweepEnded(), sleep(3000).then(() => 'never')]);
    const doubled = tops - topsAfter1, gone2 = goneNew(x);
    const j = await x.liveness.forSweep(); const late = !!(j.index && j.index.trees && j.index.trees.projects && j.index.trees.projects.late);
    const saidWhileOut = said.slice();
    if (release) release(); await sleep(20);
    await x.w.groups.sweepEnded(); const gone3 = goneNew(x);
    console.warn = warn0;
    const once = saidWhileOut.length === 1 && saidWhileOut[0].includes(proj) && / has not answered since \d{4}-\d\d-\d\dT/.test(saidWhileOut[0]) && /nobody is judged gone on it/.test(saidWhileOut[0]);
    // the sweep ENDED while its walk was still out (the readdir unanswered): unknown after the bound, not after the walk
    return { ok: out1 !== 'never' && stillOut1 && gone1 === 0 && out2 !== 'never' && gone2 === 0 && doubled === 0 && late && gone3 > 0 && once, detail: `a walk that never returns: the sweep ended in ${ms1.toFixed(0)} ms (bound 60 ms) with the walk still out: ${stillOut1}, ${out1 === 'never' ? 'NEVER' : gone1} judged gone; the next sweep while it is still out: ${out2 === 'never' ? 'NEVER' : gone2} gone, ${doubled} new top read(s), late=${late}; once it returns: ${gone3} gone; the journal said it ${saidWhileOut.length}× («${(saidWhileOut[0] || '').slice(0, 90)}…»)` };
  },
  async 'tree:appears'(A) {
    const r = path.join(ROOT, 'trees-appear-' + (++wn)); const proj = path.join(r, 'projects'), remote = path.join(r, 'remote'), cx = path.join(r, 'codex');
    fs.mkdirSync(path.join(proj, '-opt-p0'), { recursive: true }); fs.mkdirSync(remote, { recursive: true }); fs.mkdirSync(cx, { recursive: true });
    const x = await world(A, { io: { claude: { projectsRoot: proj, remoteRoot: remote }, codex: { sessionsDir: cx, remoteRoot: remote } } });
    const j1 = await x.liveness.forSweep(); const v1 = j1(C.G1);
    fs.writeFileSync(path.join(proj, '-opt-p0', C.G1 + '.jsonl'), '{}\n');
    const j2 = await x.liveness.forSweep(); const v2 = j2(C.G1);
    return { ok: v1.state === 'gone' && v2.state === 'stopped', detail: `G1 at sweep 1: ${JSON.stringify(v1)}; its transcript written; at sweep 2: ${JSON.stringify(v2)}` };
  },
  // ⑤ round 2 — A «GONE» VERDICT IS TRUE WHEN IT ACTS
  // the .394 pick's small: a «gone» ALREADY SAID, in a live MULTI-member group, is no act (onConversationEnded skips it as
  // said) — so a steady sweep asks no fresh walk for it (round 2 asked one every sweep: M walks per steady sweep)
  async 'gone:said-asks-nothing'(A) {
    const n = ++wn, L = U(0x7b00 + n * 8), M = U(0x7b01 + n * 8), DANG = U(0x7b02 + n * 8);
    gidN = 200; const gM = group([L, M, DANG]);
    const spec = { sessions: [['w-gL', { claudeSessionId: L, name: 'ell', cwd: W_OTHER }], ['w-gM', { claudeSessionId: M, name: 'em', cwd: W_OTHER }]], tasks: {},
      groups: { v: 1, groups: { [gM.id]: gM }, ownerRead: {}, ended: { [DANG]: { why: 'gone', at: T0 - 60000 } } }, metas: { d: { claudeSessionId: DANG } }, userState: { archivedSessions: [] } };
    const x = await world(A, spec);
    if (typeof x.liveness.asks !== 'function') return { ok: false, detail: 'no sweep index (no asks counter)' };
    const a0 = x.liveness.asks();
    const o1 = await x.w.groups.sweepEnded(), o2 = await x.w.groups.sweepEnded();
    const asks = x.liveness.asks() - a0, marked = o1.marked.length + o2.marked.length, closed = o1.closed.length + o2.closed.length;
    return { ok: asks === 0 && marked === 0 && closed === 0, detail: `two steady sweeps, a gone member already said in a live 3-member group: ${asks} fresh walk(s) asked, ${marked} marked, ${closed} closed` };
  },
  async 'gone:true-when-it-acts'(A) {
    // scene B (the skeptic's, needs no fs wrapping — HOME's trees as master reads them): L live; DANG gone (a local meta, no
    // transcript); C live at the sweep's start with no transcript yet. gD = [L, DANG] is judged first: its act (the sweep's
    // first write) is the moment C writes its FIRST transcript and leaves the roster. Master asks the disk per id when it
    // judges ⇒ C stopped, only gD closes.
    const n = ++wn, L = U(0x7a00 + n * 8), DANG = U(0x7a01 + n * 8), Cc = U(0x7a02 + n * 8);
    const dir = path.join(PROJ, `-opt-scene-${n}`); fs.mkdirSync(dir, { recursive: true });
    gidN = 0; const gD = group([L, DANG]), gC = group([L, Cc], { at: 1 });
    const spec = { sessions: [['w-sL', { claudeSessionId: L, name: 'ell', cwd: W_OTHER }], ['w-sC', { claudeSessionId: Cc, name: 'cee', cwd: W_OTHER }]], tasks: {},
      groups: { v: 1, groups: { [gD.id]: gD, [gC.id]: gC }, ownerRead: {}, ended: {} }, metas: { d: { claudeSessionId: DANG }, c: { claudeSessionId: Cc } }, userState: { archivedSessions: [] } };
    const x = await world(A, spec);
    const upd = x.w.channels.store.groups.update; let fired = false;
    x.w.channels.store.groups.update = (fn) => { if (!fired) { fired = true; fs.writeFileSync(path.join(dir, Cc + '.jsonl'), '{}\n'); x.sessions.delete('w-sC'); } return upd(fn); };
    const asks0 = typeof x.liveness.asks === 'function' ? x.liveness.asks() : null;
    const out = await x.w.groups.sweepEnded();
    x.w.channels.store.groups.update = upd;
    const asks = asks0 === null ? null : x.liveness.asks() - asks0;
    const name = (g) => (g === gD.id ? 'gD' : g === gC.id ? 'gC' : g);
    const closedB = out.closed.map(name).join(',');
    // scene A (the verifier's): a transcript written right AFTER its directory was listed by the sweep's walk, before the
    // id is judged (this tree's own roots: master reads only HOME, where the file is on disk when it asks — stopped)
    let closedA = 'n/a';
    if (A.hasPass) {
      const r = path.join(ROOT, 'trees-scene-' + n); const proj = path.join(r, 'projects'), remote = path.join(r, 'remote'), cx = path.join(r, 'codex');
      for (const d of ['-opt-p0', '-opt-p1']) fs.mkdirSync(path.join(proj, d), { recursive: true }); fs.mkdirSync(remote, { recursive: true }); fs.mkdirSync(cx, { recursive: true });
      const C2 = U(0x7a03 + n * 8), L2 = U(0x7a04 + n * 8);
      let wrote = false;
      const after = { ...fs.promises, readdir: async (p, o) => { const res = await fs.promises.readdir(p, o); if (!wrote && String(p) === path.join(proj, '-opt-p1')) { wrote = true; fs.writeFileSync(path.join(proj, '-opt-p1', C2 + '.jsonl'), '{}\n'); } return res; } };
      gidN = 100; const gA = group([L2, C2]);
      const xa = await world(A, { sessions: [['w-aL', { claudeSessionId: L2, name: 'ell two', cwd: W_OTHER }]], tasks: {}, groups: { v: 1, groups: { [gA.id]: gA }, ownerRead: {}, ended: {} },
        metas: { c2: { claudeSessionId: C2 } }, userState: { archivedSessions: [] }, io: { claude: { projectsRoot: proj, remoteRoot: remote, fsp: after }, codex: { sessionsDir: cx, remoteRoot: remote } } });
      const outA = await xa.w.groups.sweepEnded();
      closedA = wrote ? (outA.closed.length ? 'gA' : '') : 'the file was never written';
    }
    const ok = fired && closedB === 'gD' && (asks === null || asks === 2) && (closedA === 'n/a' || closedA === '');
    return { ok, detail: `scene B — DANG's act wrote C's first transcript and took C off the roster: closed [${closedB}] (master: [gD]); gone candidates asked again: ${asks === null ? 'none (a per-id reader)' : asks} (G = 2: DANG, C) · scene A — a transcript written right after its directory was listed: closed [${closedA}]`, closedB, asks };
  },
  // ⑥ the gap
  async 'gap:leading-edge'(A) {
    const GAP = 60;
    const x = await world(A, { gap: GAP, now: () => Date.now() });
    let starts = 0; const real = x.w.groups.sweepEnded; x.w.groups.sweepEnded = (...a) => { starts++; return real(...a); };
    // each write ARCHIVES something (lane groups-sweep-on-change: a write that changes nothing the sweep judges starts none)
    let k = 0; const archive = () => { x.st.userState = { ...x.st.userState, archivedSessions: [...x.st.userState.archivedSessions, `claude:${U(0x6e00 + ++k)}`] }; return x.w.groups.noteUserState(); };
    const p = archive(); const atOnce = starts;
    await p; const end1 = Date.now();
    archive(); const inGap = starts;
    await sleep(GAP / 3); archive(); archive();   // more writes in the gap: one sweep answers them
    let startedAt = null; while (starts === inGap && Date.now() - end1 < 2000) await sleep(5); startedAt = Date.now();
    const waited = startedAt - end1;
    await sleep(GAP + 20);
    return { ok: atOnce === 1 && inGap === 1 && waited >= GAP - 10 && starts === 2, detail: `a write after a quiet gap: ${atOnce} sweep at once; a write within the gap: started after ${waited} ms (gap ${GAP} ms); sweeps: ${starts}` };
  },
  async 'gap:burst'(A) {
    // THE GAP IS SIZED BY THIS RUN'S OWN SWEEP (int402 — the .402 prep mirror's fast attempt 2: the mutant «no gap» NOT red here on a
    // runner, 4 sweeps where the bound is 13). A wiring with NO gap starts a sweep per write only while one sweep is shorter than the
    // writes' spacing; a sweep that outlasts the writes behind it folds them into one (sweepAgain), and the control looks obedient.
    // Made red on the box by slowing each sweep through this world's own hook: +15 ms and +30 ms ⇒ master (the before control) and the
    // mutant both «obedient». So the gap comes from the sweep time THIS run measures, in a probe world of the SAME tree (a cold sweep,
    // then two warm ones, the slower): G0 = max(12 ms, 8 × it) — one rule for the leg and its controls, so a control's verdict never
    // depends on the runner's speed (the law: the leg owns its gap; a slow machine widens it, it never flips a verdict).
    const N = 120;
    const probe = await world(A, { gap: 0, now: () => Date.now() });
    await probe.w.groups.sweepEnded();
    let sweepMs = 0; for (let k = 0; k < 2; k++) { const t = performance.now(); await probe.w.groups.sweepEnded(); sweepMs = Math.max(sweepMs, performance.now() - t); }
    const G0 = Math.max(12, Math.ceil(8 * sweepMs));
    const x = await world(A, { gap: G0, now: () => Date.now() });
    await x.w.groups.sweepEnded();   // this world's cold sweep, before the count (the engine's own call: the wiring's clock is untouched)
    let starts = 0; const real = x.w.groups.sweepEnded; x.w.groups.sweepEnded = (...a) => { starts++; return real(...a); };
    // write i at t0 + i·(11 gaps)/(N−1): the owner's 120 writes in 55 s against a 5 s gap, scaled
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const due = t0 + (i * 11 * G0) / (N - 1);
      while (performance.now() < due) await sleep(Math.max(0, Math.min(2, due - performance.now())));
      x.st.userState = { ...x.st.userState, archivedSessions: [...x.st.userState.archivedSessions, `claude:${U(0x6f00 + i)}`] }; x.w.groups.noteUserState();   // each write archives one (a change the sweep judges)
    }
    const span = performance.now() - t0;
    await sleep(G0 * 4);
    // a sweep starts no sooner than a gap after the last ENDED: the leading one + one per gap + the one after the last write
    const bound = Math.floor(span / G0) + 2;
    return { ok: starts <= bound && starts >= 2, detail: `${N} writes over ${span.toFixed(0)} ms (11 gaps of ${G0} ms = max(12, 8 × this run's sweep ${sweepMs.toFixed(1)} ms) — the owner's 120 writes in 55 s at 5 s, scaled): ${starts} sweeps (≤ ${bound}: 1 leading + 1 per gap + 1 trailing)`, starts, sweepMs, gap: G0 };
  },
};

// ── run ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const t00 = performance.now();
const HEAD_T = makeTree('head', REPO);
const HEAD = api(HEAD_T, 'head');
const BASE_T = baseTree();
const BASE_A = BASE_T ? api(BASE_T, 'base') : null;
if (BASE_A && !FULL) BASE_A.small = true;
const run = async (name, A) => { const t = performance.now(); let r; try { r = await LEGS[name](A); } catch (e) { r = { ok: false, detail: `threw: ${(e && e.stack) || e}`.slice(0, 900) }; } r.detail += ` [${(performance.now() - t).toFixed(0)} ms]`; return r; };

say('① a pass builds the roster once — counted at the owner\'s shape (358 groups, 724 rows, 339 members, 561 ended, 36 live, 7 Task Groups)');
const headCounts = {};
for (const leg of ['count:list', 'count:listFor', 'count:announce', 'count:access', 'count:sweep', 'ratchet', 'memo:run']) { const r = await run(leg, HEAD); headCounts[leg] = r; ok(r.ok, `${leg}: ${r.detail}`); }

say(`  [${(performance.now() - t00).toFixed(0)} ms]`); say('② nothing seen changes — the corpus through master and this tree in lockstep');
async function equality() {
  const xs = [await world(BASE_A), await world(HEAD)];
  const step = async (name, f) => {
    const got = [];
    for (const x of xs) got.push(await f(x));
    const d = firstDiff(got[0], got[1]);
    ok(!d, `equal to ${BASE}: ${name}`, d || undefined);
  };
  await step('seeded (list, listFor, liveRoster, reach, liveness, groupsOfSession, membersNow)', (x) => readAll(x));
  await step('the boot sweep: its result + the store after it', async (x) => ({ out: await x.w.groups.noteUserState(), store: storeOf(x), read: readAll(x) }));
  await step('a rename BETWEEN passes (no broadcast)', async (x) => { await tick(); x.sessions.get('w-L3').name = 'gamma renamed'; await tick(); return readAll(x); });
  await step('a Task Group bind changed between passes', async (x) => { await tick(); x.tasks.bind('T-b', `claude:${C.L5}`); await tick(); return readAll(x); });
  await step('a folder rule changed between passes', async (x) => { await tick(); x.tasks.update('T-b', { ctx: [{ path: W_OTHER, tags: ['discover'] }] }); await tick(); return readAll(x); });
  await step('an archive ⇒ a sweep: its result + the store', async (x) => { x.st.userState = { archivedSessions: [...x.st.userState.archivedSessions, `claude:${C.L7}`] }; return { out: await x.w.groups.noteUserState(), store: storeOf(x), read: readAll(x) }; });
  await step('a conversation ENDING MID-SWEEP (theta leaves the live roster at the sweep\'s first write)', async (x) => {
    const real = x.w.channels.store.groups.update; let fired = false;
    x.w.channels.store.groups.update = (fn) => { if (!fired) { fired = true; x.sessions.delete('w-L8'); } return real(fn); };
    x.st.userState = { archivedSessions: [...x.st.userState.archivedSessions, `claude:${C.S2}`] };
    const out = await x.w.groups.noteUserState();
    x.w.channels.store.groups.update = real;
    return { out, fired, store: storeOf(x), read: readAll(x) };
  });
  await step('an unarchive ⇒ revived', async (x) => { x.st.userState = { archivedSessions: x.st.userState.archivedSessions.filter((k) => k !== `claude:${C.L7}`) }; return { out: await x.w.groups.noteUserState(), store: storeOf(x), read: readAll(x) }; });
  { const rb = await run('gone:true-when-it-acts', BASE_A), rh = await run('gone:true-when-it-acts', HEAD); ok(rb.closedB === 'gD' && rh.closedB === rb.closedB, `equal to ${BASE}: a conversation that writes its first transcript while the sweep awaits an earlier act — master closed [${rb.closedB}], this tree [${rh.closedB}]`); }
  await step('every forSweep verdict = the per-id verdict of master', async (x) => { const j = typeof x.liveness.forSweep === 'function' ? await x.liveness.forSweep() : x.liveness; return CORPUS_CIDS.map((c) => j(c)); });
}
if (BASE_A) await equality(); else say(`  SKIP ② — ${BASE} is not in this clone (a depth-1 checkout): the equality legs run on a full clone`);

say(`  [${(performance.now() - t00).toFixed(0)} ms]`); say('③ a read after a write sees the write — per writer class, WITHOUT yielding and WITHOUT the broadcast; and in a continuation queued BEFORE the write');
const WRITERS = [
  ['a session added', (x) => { x.sessions.set('w-new', { claudeSessionId: C.NEW, name: 'newcomer', cwd: W_B }); }],
  ['a session removed', (x) => { x.sessions.delete('w-L2'); }],
  ['a session renamed', (x) => { x.sessions.get('w-L1').name = 'alpha prime'; }],
  ['its addressable id adopted (a pending fork takes its own id)', (x) => { x.sessions.get('w-FORK').claudeSessionId = C.FORK_OWN; }],
  ['its conversation id changed', (x) => { x.sessions.get('w-L4').claudeSessionId = C.L4_NEXT; }],
  ['its cwd changed (into a Task Group folder)', (x) => { x.sessions.get('w-L5').cwd = W_B_SUB; }],
  ['its reach override changed', (x) => { x.sessions.get('w-L6')._msgReachability = 'messageable'; }],
  ['its initial Task Group set', (x) => { x.sessions.get('w-L6')._initialGroupId = 'T-d'; }],
  ['its initial Task Groups set (the list)', (x) => { x.sessions.get('w-L5')._initialGroupIds = ['T-d']; }],
  ['a Task Group bind changed', (x) => { x.tasks.bind('T-d', `claude:${C.L3}`); }],
  ['a Task Group folder rule changed', (x) => { x.tasks.update('T-b', { ctx: [{ path: W_A, tags: ['discover'] }] }); }],
  ['a Task Group archived', (x) => { x.tasks.update('T-a', { archived: true }); }],
];
const SMALL = [C.L1, C.L2, C.L3, C.L4, C.L5, C.L6, C.LX, C.NEW, C.FORK_OWN, C.L4_NEXT, C.G1];
const readSmall = (x) => ({ reach: PAIRS.map(([a, b]) => x.w.groups.reach(a, b)), list: x.w.groups.list(), listFor: SMALL.map((c) => x.w.groups.listFor(c)), liveness: SMALL.map((c) => x.liveness(c)), groupsOf: SMALL.map((c) => x.access.groupsOfSession(c)), members: x.access.membersNow() });
// REF-FREE (the r2 acceptance's small): the read through the pass right after a write is compared with the SAME tree's FRESH
// BUILD — the memo dropped (the wiring's rosterChanged), the builder asked again — so the legs need no base archive and run
// on a depth-1 clone too; a fingerprint that misses a field the builder reads leaves the pass's read stale against it
async function writerLegs(A, { report = true, only = null } = {}) {
  const bad = [];
  for (const variant of ['no-yield', 'continuation']) {
    const x = await world(A);
    for (const [name, write] of WRITERS) {
      if (only && !only.test(name)) continue;
      let got = null;
      if (variant === 'no-yield') { readSmall(x); write(x); got = readSmall(x); }
      else { const c = Promise.resolve().then(() => { got = readSmall(x); }); readSmall(x); write(x); await c; }
      try { x.w.rosterChanged(); } catch { }
      const d = firstDiff(got, readSmall(x));
      if (d) bad.push(`${variant} · ${name}: ${d}`);
      if (report) ok(!d, `${variant} · ${name}`, d || undefined);
    }
  }
  return bad;
}
await writerLegs(HEAD);

say(`  [${(performance.now() - t00).toFixed(0)} ms]`); say('④ frozen entries · ⑤ the transcript trees · ⑥ the gap');
for (const leg of ['frozen', 'rename:between-passes', 'tree:whole-vs-unreadable', 'tree:hung', 'tree:appears', 'gone:true-when-it-acts', 'gone:said-asks-nothing', 'gap:leading-edge', 'gap:burst']) { const r = await run(leg, HEAD); ok(r.ok, `${leg}: ${r.detail}`); }

say('⑦ server.js hands the roster builder + its fingerprint (the suite cannot boot server.js: the line is pinned by name)');
{
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(/require\('\.\/src\/server\/roster-pass\.js'\)\.sessionRoster\(\{ sessions: \(\) => activeSessions, tasks: \(\) => tasks, addressableId, statusKey: sessionStatusKey \}\); return \{ liveSessions: R\.build, rosterFingerprint: R\.fingerprint \};/.test(srv), 'server.js: liveSessions = sessionRoster(...).build, rosterFingerprint = its fingerprint — the same session map, Task Groups, addressableId and sessionStatusKey');
  ok(/function broadcastActiveSessions\(\) \{ try \{ channelsWiring\.rosterChanged\(\); \} catch \{\} try \{ channelsWiring\.groups\.noteRoster\(\); \}/.test(srv), 'server.js: the session list\'s ONE notify point drops the memo BEFORE noteRoster');
  ok(/onChange: \(ch\) => \{\n(?:[^\n]*\n){0,3}?[^\n]*try \{ channelsWiring\.rosterChanged\(\); \} catch \{ \}/.test(srv), 'server.js: the Task Groups\' change drops the memo');
  const wsrc = fs.readFileSync(path.join(REPO, 'src/server/channels-wiring.js'), 'utf8');
  ok(/const rosterPass = require\('\.\/roster-pass\.js'\)\.createRosterPass\(liveSessions, \{ fingerprint: rosterFingerprint \}\);\n\s*liveSessions = rosterPass\.read;/.test(wsrc) && (wsrc.match(/\bliveSessions\b/g) || []).length >= 4, 'channels-wiring: every reader below (channels engine, groups engine, liveness) is handed the ONE roster door');
}

say(`  [${(performance.now() - t00).toFixed(0)} ms]`); say(`RED CONTROLS — the counting legs on master itself (${FULL ? 'the owner\'s shape' : 'a small shape: 60 groups, 12 live, 3 Task Groups — ROSTER_FULL=1 runs the owner\'s'}; the ratchet at its stated 400 × 36 × 10)`);
const before = {};
if (BASE_A) {
  for (const leg of ['count:list', 'count:listFor', 'count:announce', 'count:access', 'count:sweep', 'ratchet', 'gap:burst']) { const r = await run(leg, BASE_A); before[leg] = r; ok(!r.ok, `${BASE} is RED at ${leg}: ${r.detail}`); }
} else say(`  SKIP the red controls — ${BASE} is not in this clone`);

say(`  [${(performance.now() - t00).toFixed(0)} ms]`); say('MUTANTS — a patched copy of this tree, each RED at its own leg');
const MUTANTS = [
  ['sessionOf per call (the index bypassed: a build per lookup)', 'src/server/roster-pass.js', [['  const sessionOf = (cid) => {\n    const m = load();', '  const sessionOf = (cid) => { return (build() || []).find((s) => s && s.cid === cid) || null;\n    const m = load();']], 'count:list'],
  ['a memo kept across passes (no end of run, no fingerprint)', 'src/server/roster-pass.js', [['    if (memo && memo.fp === fp && fp !== null) return memo;', '    if (memo) return memo;'], ['    queueMicrotask(() => { if (memo === mine) memo = null; });', '']], 'rename:between-passes'],
  ['a memo kept past its run (the fingerprint alone)', 'rp', [['    queueMicrotask(() => { if (memo === mine) memo = null; });', '']], 'memo:run'],
  ['the walk per id (no sweep index)', 'src/server/channels-wiring.js', [['  reader.forSweep = async () => {\n    if (!indexes) return reader;', '  reader.forSweep = async () => {\n    return reader;']], 'count:sweep'],
  ['an unknown tree read as «absent»', 'src/server/channels-wiring.js', [['(c.ok && x.ok ? false : null)', 'false']], 'tree:whole-vs-unreadable'],
  ['a stuck walk doubled', 'src/session-store.js', [['  if (TRANSCRIPT_WALKS_OUT.has(key)) {', '  if (false) {']], 'tree:hung'],
  ['a gone already said acts in a live multi-member group (round 2, 24df0fb49)', 'src/server/groups-engine.js', [["(hasLive && hasLiveGroup.pair(cid))", "hasLive"]], 'gone:said-asks-nothing'],
  ['no re-ask before a gone act (round 1, efa03b334)', 'src/server/groups-engine.js', [["      if (act.end && act.end.why === 'gone' && typeof judge.confirm === 'function') {", "      if (false) {"]], 'gone:true-when-it-acts'],
  ['a failed walk forgets what it read', 'src/session-store.js', [["has: (id) => names.has(String(id) + '.jsonl') };", "has: (id) => ok && names.has(String(id) + '.jsonl') };"]], 'tree:whole-vs-unreadable'],
  ['a stuck walk said every sweep', 'src/session-store.js', [['  if (!e || e.said) return;', '  if (!e) return;']], 'tree:hung'],
  ['entries not frozen', 'rp', [['    if (Array.isArray(e.groups)) Object.freeze(e.groups);\n    return Object.freeze(e);', '    return e;']], 'frozen'],
  ['no leading edge', 'src/server/channels-wiring.js', [['    const wait = lastEnd + sweepGapMs - now();', '    const wait = Math.max(lastEnd + sweepGapMs - now(), sweepGapMs);']], 'gap:leading-edge'],
  ['no gap (a write queues a sweep)', 'src/server/channels-wiring.js', [['    const wait = lastEnd + sweepGapMs - now();', '    const wait = 0;']], 'gap:burst'],
];
for (const [name, file, edits, leg] of MUTANTS) {
  let A = null;
  const tag = name.replace(/[^a-z]+/gi, '-').slice(0, 40);
  try { A = file === 'rp' ? rpMutant(tag, edits) : api(mutant(tag, file, edits), 'm'); A.small = true; } catch (e) { ok(false, `mutant «${name}» could not be made`, String(e && e.message)); continue; }
  const r = await run(leg, A);
  ok(!r.ok, `mutant «${name}» is RED at ${leg}: ${r.detail}`);
}
{
  // each field the builder reads and the fingerprint holds, dropped from the fingerprint ⇒ its writer class red (ref-free)
  for (const [tag, what, edit, writer] of [
    ['fp-no-cwd', 'the cwd', ['s.cwd == null ? null : s.cwd, ', 'null, '], /cwd changed/],
    ['fp-no-initial-ids', 'the initial Task Groups list', ['s._initialGroupIds || null, s._msgReachability', 'null, s._msgReachability'], /initial Task Groups set \(the list\)/],
    ['fp-no-reach', 'the reach override', ['s._msgReachability || null])', 'null])'], /reach override changed/],
  ]) {
    const A = rpMutant(tag, [edit]);   // the fingerprint lives in sessionRoster: this tree's wiring, the mutant's fingerprint
    const bad = await writerLegs(A, { report: false, only: writer });
    ok(bad.some((b) => writer.test(b)), `mutant «the fingerprint misses ${what}» is RED at its writer (${bad.length} red: ${[...new Set(bad.map((b) => b.split(':')[0]))].join(' | ')})`);
  }
}

say(`\nbefore / after${FULL ? ' at the owner\'s shape' : ' (master at the small shape; ROSTER_FULL=1 for the owner\'s)'}: ${BASE_A ? `master list() ${before['count:list'].n} builds ${before['count:list'].ms.toFixed(0)} ms, sweep ${before['count:sweep'].n} builds + ${before['count:sweep'].syncN} readdirSync (${before['count:sweep'].ms.toFixed(0)} ms), ratchet ${before.ratchet.k.toFixed(0)} ×` : '(master not in this clone)'} · this tree list() ${headCounts['count:list'].n} build ${headCounts['count:list'].ms.toFixed(1)} ms, sweep ${headCounts['count:sweep'].n} build + ${headCounts['count:sweep'].syncN} readdirSync (${headCounts['count:sweep'].ms.toFixed(0)} ms), ratchet ${headCounts.ratchet.k.toFixed(1)} × (${(performance.now() - t00).toFixed(0)} ms)`);
say(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);

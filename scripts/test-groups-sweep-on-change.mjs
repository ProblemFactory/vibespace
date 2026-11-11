#!/usr/bin/env node
// A SWEEP ACTS ONLY ON A CHANGE (lane groups-sweep-on-change, the owner's performance profile 2026-11-11, rank 2: the
// ended-groups sweep chain was 5 729 ms of a 20 s capture — 28.6 % of the hub's main thread — run by EVERY user-state write:
// a star, a rename, an archive, a session setting; and an end that changed nothing still rewrote groups.json and broadcast
// the FULL group list to every page). Through the REAL channels wiring + groups engine of this tree, and as its red control
// on a git archive of master under it, 2.369.394 3c7ae82a2 (a COUNTED skip on a clone without it, §75):
//   ① 50 user-state writes that touch nothing the sweep judges ⇒ 0 sweeps, 0 groups.json writes, 0 broadcasts;
//   ② an archive ⇒ exactly one sweep and one announce naming that group; the waiting sender is told (the pair closes);
//   ③ an end already said in a live multi-member group ⇒ nothing written, nothing announced;
//   ④ a ledger row alone (an end for a conversation in no live group) ⇒ written, nothing announced;
//   ⑤ a lifted archive announces only the member's groups; nothing to lift ⇒ nothing written;
//   ⑥ THE SIGNATURE'S OTHER TWO PARTS: a member added to an unarchived group, nothing else moving ⇒ the next write sweeps;
//     a SWAP (one member leaves, another joins — the count equal) ⇒ the next write sweeps; an ended-ledger row written ⇒
//     the next write sweeps;
//   ⑦ A «GONE» IS STILL SAID WITHIN MINUTES: a transcript removed ⇒ 50 quiet writes inside ten minutes start no sweep; at
//     eleven minutes of virtual time ONE quiet write sweeps once and the waiting sender is told (the pair closes);
//   ⑧ THE BENCH at the owner's shape (358 groups, 724 member rows, 561 ended ids): ms per user-state write, before / after.
// ⑥ and ⑦ are green on master (every write swept there); their red controls are PATCHES THIS SUITE CARRIES on this tree's
// channels-wiring.js — the members out of the signature, the ledger out of it, the ten-minute bound out — never a lane branch.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '3c7ae82a2';   // master under this pair (2.369.394): the red controls come from what the repository has
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sweep-on-change-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
let passed = 0, failed = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail === undefined ? '' : ' — ' + String(detail).slice(0, 700)}`); } return !!c; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quietLog = { log() { }, warn() { }, info() { }, error() { } };

function archive(rev) {
  try {
    if (spawnSync('git', ['cat-file', '-e', `${rev}^{commit}`], { cwd: REPO }).status !== 0) return null;
    const ar = spawnSync('git', ['archive', '--format=tar', rev, 'src', 'server.js', 'package.json'], { cwd: REPO, maxBuffer: 1 << 30 });
    if (ar.status !== 0) return null;
    const dst = path.join(ROOT, 'base'); fs.mkdirSync(dst, { recursive: true });
    if (spawnSync('tar', ['-x', '-C', dst], { input: ar.stdout, maxBuffer: 1 << 26 }).status !== 0) return null;
    fs.symlinkSync(fs.realpathSync(path.join(REPO, 'node_modules')), path.join(dst, 'node_modules'));
    const bv = path.join(REPO, 'src/lib/build-version.js');
    if (fs.existsSync(bv) && !fs.existsSync(path.join(dst, 'src/lib/build-version.js'))) fs.copyFileSync(bv, path.join(dst, 'src/lib/build-version.js'));
    return dst;
  } catch { return null; }
}

// ── a world: the REAL wiring over a seeded group store, its own transcript trees (never this machine's) ──────────────────
const U = (n) => `${n.toString(16).padStart(8, '0')}-${(n % 0xffff).toString(16).padStart(4, '0')}-4000-8000-${n.toString(16).padStart(12, '0')}`;
const T0 = Date.now();
let gidN = 0, wn = 0;
function group(members, { pair = members.length === 2, archivedAt = null } = {}) {
  const id = 'g' + (++gidN).toString(36).padStart(6, '0');
  const g = { id, name: `group ${gidN}`, createdBy: members[0], createdAt: T0 - 10000, lastAt: T0 - 5000, lastText: 'hello',
    members: members.map((m, i) => ({ member: m, name: `m${i}`, notify: 'next-turn', joinedAt: T0 - 10000 })) };
  if (pair) g.pair = members.slice().sort();
  if (archivedAt) g.archivedAt = archivedAt;
  return g;
}
// THE ROSTER AS server.js HANDS IT (the bench): roster-pass sessionRoster over the live sessions and a TaskGroupManager whose
// Task Groups claim folders — every build asks each session's groups (groupsForSession), the cost under the owner's sweep
function realRoster(T, req, dataDir, live, tasksN = 7) {
  const srv = fs.readFileSync(path.join(T, 'server.js'), 'utf8');
  const sk = srv.match(/\nfunction sessionStatusKey\(session, id\) \{\n[\s\S]*?\n\}\n/);
  const statusKey = new Function(`${sk[0]}\nreturn sessionStatusKey;`)();
  const { addressableId } = req('./src/claude-lock-capture.js');
  const work = path.join(dataDir, '..', 'work'); fs.mkdirSync(work, { recursive: true });
  const tasks = new (req('./src/task-groups.js').TaskGroupManager)({ dataDir, homeDir: path.join(dataDir, '..', 'home') });
  tasks._state.tasks = Object.fromEntries(Array.from({ length: tasksN }, (_, i) => { const d = path.join(work, 't' + i); fs.mkdirSync(d, { recursive: true }); return ['T-' + i, { id: 'T-' + i, title: 'Task ' + i, createdAt: i + 1, sessions: [...live.filter((_, j) => j % tasksN === i).slice(0, 2).map((c) => 'claude:' + c), ...Array.from({ length: 200 }, (_, j) => 'claude:' + U(0x60000 + i * 1000 + j))], ctx: [{ path: d, tags: ['discover'] }] }]; }));   // ~200 conversations bound per Task Group (the owner's 1 388 over 7)
  const sessions = new Map(live.map((c, i) => ['w-' + i, { claudeSessionId: c, name: 'live ' + i, cwd: path.join(work, 't' + (i % tasksN), i % 2 ? 'sub' : '') }]));
  if (fs.existsSync(path.join(T, 'src/server/roster-pass.js'))) return req('./src/server/roster-pass.js').sessionRoster({ sessions: () => sessions, tasks: () => tasks, addressableId, statusKey });
  // master before roster-per-pass: its own inline `liveSessions` arrow (server.js), evaluated as it runs there
  const line = srv.split('\n').find((l) => l.startsWith('  liveSessions: () => {'));
  const inline = line.slice('  liveSessions: '.length, line.indexOf(', groupSetting: '));
  return { build: new Function('activeSessions', 'addressableId', 'tasks', 'sessionStatusKey', `return (${inline});`)(sessions, addressableId, tasks, statusKey), fingerprint: null };
}
async function world(T, { groups, ended = {}, live = [], transcripts = [], gone = [], archived = [], real = false }) {
  const req = createRequire(path.join(T, 'package.json'));
  const W = req('./src/server/channels-wiring.js');
  const root = path.join(ROOT, 'w' + (++wn)), dataDir = path.join(root, 'data');
  const proj = path.join(root, 'projects'), remote = path.join(root, 'remote'), cx = path.join(root, 'codex');
  for (const d of [path.join(dataDir, 'session-meta'), path.join(proj, '-opt-p0'), remote, cx]) fs.mkdirSync(d, { recursive: true });
  for (const c of transcripts) fs.writeFileSync(path.join(proj, '-opt-p0', c + '.jsonl'), '{}\n');
  for (const c of gone) fs.writeFileSync(path.join(dataDir, 'session-meta', c.slice(0, 8) + '.json'), JSON.stringify({ claudeSessionId: c }));
  const st = { userState: { archivedSessions: archived.map((c) => 'claude:' + c), starred: [] } };
  const casts = [], clock = { skew: 0 };   // the wiring's virtual clock: real time + skew (the ten-minute bound)
  const roster = live.map((c, i) => ({ cid: c, name: 'live ' + i, groups: [], webuiId: 'w-' + i }));
  const R = real ? realRoster(T, req, dataDir, live) : null;
  const w = W.create({
    app: req('express')(), dataDir, liveSessions: R ? R.build : () => roster, rosterFingerprint: R ? R.fingerprint : null, readUserState: () => st.userState, groupSetting: () => [], now: () => Date.now() + clock.skew, sweepGapMs: 0,
    transcriptIndex: { claude: { projectsRoot: proj, remoteRoot: remote }, codex: { sessionsDir: cx, remoteRoot: remote } },
    bcastAll: (m) => { if (m && m.type === 'channel-groups-updated') casts.push(m); },
  });
  await sleep(10);
  try { w.channels.stop(); } catch { }
  await w.channels.store.groups.update((gr) => { gr.groups = Object.fromEntries(groups.map((g) => [g.id, g])); gr.ended = ended; gr.ownerRead = {}; });
  let sweeps = 0, writes = 0, inflight = 0;
  const realSweep = w.groups.sweepEnded; w.groups.sweepEnded = (...a) => { sweeps++; inflight++; return Promise.resolve(realSweep(...a)).finally(() => { inflight--; }); };
  const realUpd = w.channels.store.groups.update; w.channels.store.groups.update = (...a) => { writes++; return realUpd(...a); };
  const write = async (mut = (s) => s) => { st.userState = mut({ ...st.userState }); await w.groups.noteUserState(); await sleep(0); };   // persistence.js writeUserState → onUserStateWrite → noteUserState
  const settle = async () => { let quiet = 0; for (let i = 0; i < 500 && quiet < 5; i++) { await sleep(2); quiet = inflight ? 0 : quiet + 1; } };   // until no sweep has run for five ticks (a re-run after a sweep starts inside its finally)
  const reset = () => { sweeps = 0; writes = 0; casts.length = 0; };
  return { w, st, casts, clock, root, proj, write, settle, reset, counts: () => ({ sweeps, writes, casts: casts.length }) };
}
// THE OWNER'S SHAPE (the roster drill's): 358 groups (356 pairs + 2 of three), 724 member rows, 561 ended ids, 36 live
function ownerShape() {
  gidN = 0;
  const live = Array.from({ length: 36 }, (_, i) => U(0x10000 + i));
  const groups = [], ended = {};
  let k = 0;
  for (let i = 0; i < 356; i++) { const a = live[i % live.length], b = U(0x20000 + (k++)); groups.push(group([a, b])); }
  groups.push(group([live[0], live[1], U(0x30000)])); groups.push(group([live[2], live[3], U(0x30001)]));
  const others = groups.flatMap((g) => g.members.map((m) => m.member)).filter((c) => !live.includes(c));
  for (let i = 0; i < 561; i++) ended[i < others.length ? others[i] : U(0x40000 + i)] = { why: i % 3 ? 'archived' : 'gone', at: T0 - 86400e3 };
  for (const g of groups) if (g.pair && g.members.some((m) => ended[m.member])) g.archivedAt = T0 - 86400e3;   // a past sweep closed these pairs (the store as a hub keeps it)
  const archived = Object.entries(ended).filter(([, e]) => e.why === 'archived').map(([c]) => c);
  for (let i = archived.length; i < 6291; i++) archived.push(U(0x70000 + i));   // the owner's sidebar: 6 291 archived conversations (B-1319)
  return { live, groups, ended, archived, transcripts: others.slice(561) };
}

// ── the legs: (T) → { ok, detail } ────────────────────────────────────────────────────────────────────────────────────
const LEGS = {
  async 'quiet-writes'(T) {
    gidN = 0;
    const L1 = U(1), L2 = U(2), M = U(3), P = U(4);
    const x = await world(T, { groups: [group([L1, L2, M]), group([L1, P])], live: [L1, L2], transcripts: [M, P] });
    await x.write(); await x.settle();   // the first ask (boot) sweeps
    x.reset();
    for (let i = 0; i < 50; i++) await x.write((s) => ({ ...s, starred: [...(s.starred || []), 'claude:' + U(100 + i)] }));   // a star, a rename, a setting
    await x.settle();
    const c = x.counts();
    return { ok: c.sweeps === 0 && c.writes === 0 && c.casts === 0, detail: `50 user-state writes that touch nothing the sweep judges: ${c.sweeps} sweeps, ${c.writes} groups.json writes, ${c.casts} broadcasts` };
  },
  async 'archive-once'(T) {
    gidN = 0;
    const L1 = U(11), Q = U(12), M = U(13);
    const pair = group([L1, Q]), multi = group([L1, M, U(14)]);
    const x = await world(T, { groups: [pair, multi], live: [L1], transcripts: [Q, M, U(14)] });
    await x.write(); await x.settle(); x.reset();
    await x.write((s) => ({ ...s, archivedSessions: [...s.archivedSessions, 'claude:' + Q] }));   // the person archives Q
    await x.settle();
    const c = x.counts();
    const named = x.casts.map((m) => (m.changed || []).join(',')).join(' | ');
    const closed = x.casts.some((m) => (m.changed || []).includes(pair.id) && (m.messages || []).some((r) => r && r.raw && r.raw.kind === 'closed' && r.raw.member === Q));
    return { ok: c.sweeps === 1 && c.casts === 1 && x.casts[0].changed.length === 1 && x.casts[0].changed[0] === pair.id && closed, detail: `an archive: ${c.sweeps} sweep, ${c.casts} announce naming [${named}]; the waiting member told the pair closed: ${closed}` };
  },
  async 'said-end-silent'(T) {
    gidN = 0;
    const L1 = U(21), L2 = U(22), A = U(23);
    const multi = group([L1, L2, A]);
    const x = await world(T, { groups: [multi], live: [L1, L2], ended: { [A]: { why: 'archived', at: T0 - 60000 } }, archived: [A] });
    x.reset();
    const r = await x.w.groups.onConversationEnded(A, { why: 'archived' });
    const c = x.counts();
    return { ok: c.writes === 0 && c.casts === 0 && r && r.ok, detail: `an end already said for a member of a live multi-member group: ${c.writes} groups.json writes, ${c.casts} broadcasts` };
  },
  async 'ledger-only-silent'(T) {
    gidN = 0;
    const L1 = U(31), L2 = U(32), Z = U(33);
    const x = await world(T, { groups: [group([L1, L2])], live: [L1, L2] });
    x.reset();
    await x.w.groups.onConversationEnded(Z, { why: 'archived' });   // a conversation in no live group: the ledger alone moves
    const c = x.counts();
    const row = !!(x.w.channels.store.groups.live().ended || {})[Z];
    return { ok: row && c.writes === 1 && c.casts === 0, detail: `an end for a conversation in no live group: the ledger row written ${row} (${c.writes} write), ${c.casts} broadcasts (no group changed)` };
  },
  async 'revive-names'(T) {
    gidN = 0;
    const L1 = U(41), A = U(42), B = U(43);
    const g1 = group([L1, A, U(44)]), g2 = group([L1, B]);
    const x = await world(T, { groups: [g1, g2], live: [L1], ended: { [A]: { why: 'archived', at: T0 - 60000 } }, transcripts: [A, B, U(44)] });
    x.reset();
    const moved = await x.w.groups.onConversationRevived(A);
    const named = x.casts.map((m) => (m.changed || []).join(',')).join(' | ');
    const c1 = x.counts(); x.reset();
    const none = await x.w.groups.onConversationRevived(B);   // nothing to lift
    const c2 = x.counts();
    return { ok: moved && c1.casts === 1 && named === g1.id && !none && c2.writes === 0 && c2.casts === 0, detail: `a lifted archive announces [${named}] (its groups only); nothing to lift: ${c2.writes} writes, ${c2.casts} broadcasts` };
  },
  // ⑥ a member joins an unarchived group (a group write, the user state untouched): the joiner was archived before it
  //   joined, so only a sweep says it — the next quiet write must run one
  async 'member-joins-sweeps'(T) {
    gidN = 0;
    const L1 = U(51), L2 = U(52), M = U(53), N = U(54);
    const multi = group([L1, L2, M]);
    const x = await world(T, { groups: [multi], live: [L1, L2], transcripts: [M, N], archived: [N] });
    await x.write(); await x.settle(); x.reset();
    await x.w.channels.store.groups.update((gr) => { gr.groups[multi.id].members.push({ member: N, name: 'm3', notify: 'next-turn', joinedAt: Date.now() }); });
    x.reset();
    await x.write((s) => ({ ...s, starred: [...(s.starred || []), 'claude:' + U(150)] }));   // a star: nothing else moves
    await x.settle();
    const c = x.counts(), row = (x.w.channels.store.groups.live().ended || {})[N];
    return { ok: c.sweeps === 1 && !!row && row.why === 'archived', detail: `a member added to an unarchived group, then one quiet write: ${c.sweeps} sweep; the joiner's end said: ${row ? row.why : 'no'}` };
  },
  // ⑥ a SWAP at an equal count (主开发's green mutant on 4f63129ce: the members out of the hash, their count kept in the
  //   prefix — a join moves the count, a swap does not): the joiner was archived before it joined, only a sweep says it
  async 'member-swap-sweeps'(T) {
    gidN = 0;
    const L1 = U(81), L2 = U(82), M = U(83), N = U(84);
    const multi = group([L1, L2, M]);
    const x = await world(T, { groups: [multi], live: [L1, L2], transcripts: [M, N], archived: [N] });
    await x.write(); await x.settle(); x.reset();
    await x.w.channels.store.groups.update((gr) => { const g = gr.groups[multi.id]; g.members = g.members.filter((m) => m.member !== M).concat([{ member: N, name: 'm3', notify: 'next-turn', joinedAt: Date.now() }]); });
    x.reset();
    await x.write((s) => ({ ...s, starred: [...(s.starred || []), 'claude:' + U(180)] }));
    await x.settle();
    const c = x.counts(), row = (x.w.channels.store.groups.live().ended || {})[N];
    return { ok: c.sweeps === 1 && !!row && row.why === 'archived', detail: `a swap at an equal count (one member out, another in), then one quiet write: ${c.sweeps} sweep; the joiner's end said: ${row ? row.why : 'no'}` };
  },
  // ⑥ an ended-ledger row written by another path (the store alone, the user state untouched): the next write must sweep —
  //   here the row says «archived» for a conversation that is not, so the sweep lifts it
  async 'ledger-row-sweeps'(T) {
    gidN = 0;
    const L1 = U(61), X = U(62);
    const x = await world(T, { groups: [group([L1, X])], live: [L1], transcripts: [X] });
    await x.write(); await x.settle(); x.reset();
    await x.w.channels.store.groups.update((gr) => { gr.ended = { ...(gr.ended || {}), [X]: { why: 'archived', at: Date.now() } }; });
    x.reset();
    await x.write((s) => ({ ...s, starred: [...(s.starred || []), 'claude:' + U(160)] }));
    await x.settle();
    const c = x.counts(), row = (x.w.channels.store.groups.live().ended || {})[X];
    return { ok: c.sweeps === 1 && !row, detail: `an ended-ledger row written, then one quiet write: ${c.sweeps} sweep; the row lifted (the conversation is not archived): ${!row}` };
  },
  // ⑦ the bound: a transcript leaves the disk (nothing the signature reads moves)
  async 'gone-within-minutes'(T) {
    gidN = 0;
    const L1 = U(71), Q = U(72);
    const pair = group([L1, Q]);
    const x = await world(T, { groups: [pair], live: [L1], transcripts: [Q], gone: [Q] });   // gone: Q's session-meta (this machine's)
    await x.write(); await x.settle(); x.reset();
    fs.rmSync(path.join(x.proj, '-opt-p0', Q + '.jsonl'));
    for (let i = 0; i < 50; i++) { x.clock.skew += 10e3; await x.write((s) => ({ ...s, starred: [...(s.starred || []), 'claude:' + U(170 + i)] })); }   // 50 writes over 500 s
    await x.settle();
    const inside = x.counts();
    x.clock.skew = 11 * 60e3; x.reset();
    await x.write((s) => ({ ...s, starred: [...(s.starred || []), 'claude:' + U(230)] }));
    await x.settle();
    const at11 = x.counts();
    const closed = x.casts.some((m) => (m.changed || []).includes(pair.id) && (m.messages || []).some((r) => r && r.raw && r.raw.kind === 'closed' && r.raw.member === Q));
    x.reset();
    await x.write((s) => ({ ...s, starred: [...(s.starred || []), 'claude:' + U(231)] }));
    await x.settle();
    const after = x.counts();
    return { ok: inside.sweeps === 0 && at11.sweeps === 1 && closed && after.sweeps === 0, detail: `a transcript removed: 50 quiet writes inside ten minutes ⇒ ${inside.sweeps} sweeps; at eleven minutes one quiet write ⇒ ${at11.sweeps} sweep, the waiting sender told the pair closed: ${closed}; the next quiet write ⇒ ${after.sweeps}` };
  },
};

async function bench(T) {
  const s = ownerShape();
  const x = await world(T, { ...s, real: true });
  await x.write(); await x.settle(); x.reset();
  const N = 10, t0 = performance.now();
  for (let i = 0; i < N; i++) await x.write((st) => ({ ...st, starred: [...(st.starred || []), 'claude:' + U(0x50000 + i)] }));   // each awaits its sweep, if one ran
  const ms = (performance.now() - t0) / N;
  await x.settle();
  return { ms, ...x.counts() };
}

const run = async (name, T) => { const t = performance.now(); try { const r = await LEGS[name](T); r.detail += ` [${(performance.now() - t).toFixed(0)} ms]`; return r; } catch (e) { return { ok: false, detail: `threw: ${(e && e.stack) || e}`.slice(0, 600) }; } };
say('this tree');
for (const leg of Object.keys(LEGS)) { const r = await run(leg, REPO); ok(r.ok, `${leg}: ${r.detail}`); }
const B = archive(BASE);
say(`RED CONTROLS — the same legs on ${BASE} (master under this pair)`);
let skipped = 0;
if (!B) { skipped = 4; say(`  SKIP the red controls — ${BASE} is not in this clone (a depth-1 checkout): 4 controls not run`); }
else for (const leg of ['quiet-writes', 'said-end-silent', 'ledger-only-silent', 'revive-names']) { const r = await run(leg, B); ok(!r.ok, `${BASE} is RED at ${leg}: ${r.detail}`); }
// THE PATCHES THIS SUITE CARRIES (never a lane's branch): this tree with ONE edit to channels-wiring.js — a scratch tree of
// symlinks with that one file rewritten. An anchor that is no longer in the file is a RED (the suite's patch went stale),
// never a skip.
const WIRING = fs.readFileSync(path.join(REPO, 'src/server/channels-wiring.js'), 'utf8');
const PATCHES = {
  // the bench's «before»: the gate taken out (every user-state write sweeps, as on the roster commit under it)
  gateless: ["    if (!force && sig !== null && lastSig !== null && sig === lastSig && !gapWait && now() - lastEnd <= SWEEP_STALE_MS) { counts.skipped++; return Promise.resolve(null); }   // nothing it judges moved, the last sweep < 10 min ago\n", ''],
  'no-members': ["      for (const g of Object.values(gr.groups || {})) if (g && !g.archivedAt) for (const m of g.members || []) mem.push(m.member);\n", ''],
  'no-members-hash': ["h.update(mem.sort().join('\\n')); ", ''],   // 主开发's mutant: the members out of the hash, `mem.length` kept in the prefix
  'no-ledger': ["h.update('\\u0000'); h.update(Object.keys(gr.ended || {}).sort().join('\\n'));", ''],
  'no-bound': [' && now() - lastEnd <= SWEEP_STALE_MS', ''],
};
function patched(tag) {
  const [from, to] = PATCHES[tag];
  if (WIRING.split(from).length !== 2) return null;
  const M = path.join(ROOT, 'patch-' + tag);
  const link = (rel) => { const src = path.join(REPO, rel), dst = path.join(M, rel); for (const e of fs.readdirSync(src, { withFileTypes: true })) { const r = path.join(rel, e.name); if (r === path.join('src', 'server')) { fs.mkdirSync(path.join(M, r), { recursive: true }); link(r); } else if (r === path.join('src', 'server', 'channels-wiring.js')) fs.writeFileSync(path.join(M, r), WIRING.replace(from, to)); else fs.symlinkSync(path.join(src, e.name), path.join(dst, e.name)); } };
  fs.mkdirSync(path.join(M, 'src'), { recursive: true });
  for (const f of ['package.json', 'server.js', 'node_modules']) fs.symlinkSync(path.join(REPO, f), path.join(M, f));
  link('src');
  return M;
}
say('RED CONTROLS — patches this suite carries on this tree (each leg RED with its part out)');
for (const [tag, leg, what] of [['no-members', 'member-joins-sweeps', 'the members of the unarchived groups out of the signature'], ['no-members-hash', 'member-swap-sweeps', 'the members out of the hash, their count kept'], ['no-ledger', 'ledger-row-sweeps', 'the ended ledger out of the signature'], ['no-bound', 'gone-within-minutes', 'the ten-minute bound out']]) {
  const M = patched(tag);
  if (!ok(!!M, `the patch «${tag}» applies to this tree's channels-wiring.js (its anchor is there once)`)) continue;
  const r = await run(leg, M); ok(!r.ok, `${what} ⇒ RED at ${leg}: ${r.detail}`);
}
const GL = patched('gateless');
const after = await bench(REPO), before = GL ? await bench(GL) : null;
const master = process.env.BENCH_MASTER === '1' && B ? await bench(B) : null;
say(`THE BENCH at the owner's shape (358 groups, 724 member rows, 561 ended ids, 36 live, 7 Task Groups of ~200, 6 291 archived): ms per user-state write — before (this tree, the gate taken out) ${before ? before.ms.toFixed(1) + ` (${before.sweeps} sweeps)` : '(no patch)'} / after ${after.ms.toFixed(1)} (${after.sweeps} sweeps)${master ? ` · master ${BASE} ${master.ms.toFixed(0)} (${master.sweeps} sweeps)` : ''}`);
ok(!!before && before.sweeps > 0 && after.sweeps === 0, 'the patch the suite carries (the gate taken out) sweeps on every quiet write — the bench measures the gate');
ok(after.sweeps === 0, `the bench's quiet writes start no sweep on this tree (${after.sweeps})`);
say(failed ? `\n${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${passed}${skipped ? `; ${skipped} red controls SKIPPED — not in this clone` : ''})`);
process.exit(failed ? 1 : 0);

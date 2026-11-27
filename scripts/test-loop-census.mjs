#!/usr/bin/env node
// test-loop-census — lane hub-loop-stalls, unit loop-day-report M3 (+ cure r2, S2 «EVERY HUB-SIDE FILE HAS AN OWNER»): WHAT
// THE MAIN LOOP SPENDS ITSELF ON, BY OWNER (FAST: PURE + a static census of the tree + the REAL watchdog thread in this
// process for ~6 s, 2.2 s of it planted burns; src/loop-census.js, the census in src/server/sync-fs-witness-worker.js,
// `census()` in src/server/sync-fs-witness.js).
//   ① PURE — ownerOf over a real file per owner (+ the families two owners share, the helpers, files with no row);
//      bookOf over the real shapes: a session's creation under the page handler books the conversation, the vault engine
//      under an agent route books the vault, a helper between an owner and its caller is passed and counted (viaHelper),
//      the walk never passes an owned frame, helpers or a library alone book outside, a full frame list with no owned frame
//      books deep; FRAME_LIMIT against the sample's own expression; slowerAfter; censusFold of a FIXED take ⇒ a FIXED result
//   ② THE OWNERS COVER THE HUB — every file the hub can load (server.js + src/**, less what ONLY the page bundles or the
//      device agent's bundles reach — their entries read off package.json's build) matches EXACTLY ONE owner or sits on
//      the helpers' list; the count per owner, the helpers (with why) and the unowned printed; an unowned file is red BY NAME
//   ③ LIVE — the real watchdog at a dense test rate (50 ms) over a scratch install: a burn inside
//      <scratch>/src/server/channels-burn.js ⇒ its busy ticks book «channels», the idle half books idle; the same burn inside
//      a helper it calls ⇒ «channels» through a helper (viaHelper); 40 helper frames deep ⇒ outside + deep; the setting off
//      ⇒ paused, nothing asked; a 0.8 s synchronous child under a 0.4 s hold bar ⇒ held, and THE HOLD TAKES the census's ask
//      in flight (its first sample — never a wait behind it); a capture running ⇒ the census asks nothing; the take resets.
//      B-518e (red only in packed runs): the idle half is waited for by its COUNT; a capture whose asks pass its cost bound
//      stops early and the census asks again (d0, placed) — (d)'s own capture (1.5 s) carries bounds it cannot reach
//   ④ the doors — no watchdog / the census off ⇒ census() answers null; the three takers through one function
// MUTANTS (each run on a scratch COPY outside every worktree, each red here): the walk passing owned frames (①b), no vault
// rule (①b ②), the helper not counted (①b ③a2), deep never said (①b ③a3), two owners' rules swapped (①a), a rule dropped
// (② by name), a new file with no row (② by name), the priority rule — the hold does not take the census's ask (③c) / the
// census asks while a capture runs (③d) — the reset at take (③e).
// CURE r3 (T1, «A FILE THAT HOLDS TWO OWNERS' WORK IS BOOKED UNDER ITS OWN NAME»): ① a sample inside a door file's OWN inline
// body (the page handler's, the agent routes') books `split:<short>`, never the interface; the walk stops at a split frame as
// at an owned one; the two real shapes read off the REAL route files (a create under the page handler — its case, the ops
// seam, the create handler — books the conversation; the vault engine under the VAULT's own route file, where every
// /api/agent/vault/* route lives, books the vault); the census smalls' owners; the fold's split rows. ② THE SPLIT LIST: each
// a real hub-side file with its short name, two or more known owners and its why, NO owner's rule matching it; the counts
// per owner printed again with the split files and the helpers. Mutants: the walk passing split frames (①b), ownerOf blind
// to the list (①), the fold folding split ids into outside (①), a split file back on an owner's rule (②), a split row with
// one owner (②), peer-text back on the helpers' list (①s), each small back on its old owner (①s).
// Run: TZ=UTC node scripts/test-loop-census.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const LC = require(path.join(REPO, 'src/loop-census.js'));
const LH = require(path.join(REPO, 'src/loop-hold.js'));
let pass = 0, fail = 0, skipped = 0;
// r5455: a check whose plant missed its band is a NAMED, COUNTED non-verdict, never a green
const skip = (n, why) => { skipped++; console.log(`  ⊘ SKIP ${n} — ${why}`); };
/** the MAIN thread's own time on the CPU or waiting for one (ms; its schedstat): the only time a census tick can find it
 *  running — idle in its loop, a tick books «idle» and asks nothing. null where there is no /proc */
const ssMain = () => { try { const t = fs.readFileSync('/proc/self/task/' + process.pid + '/schedstat', 'utf8').split(' '); return (Number(t[0]) + Number(t[1])) / 1e6; } catch { return null; } };
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-loop-census-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORDER = 'interface,vault,channels,money,workspace,machines,conversation';
// on a tree without the owners (d22a7b717) or without the split list (e1d9b088b) every new leg is RED by itself, never a
// throw that hides the others
const OWNERS = LC.OWNERS || [], HELPERS = LC.HELPERS || [], SPLIT = LC.SPLIT || [], ownerOf = LC.ownerOf || (() => undefined);
const SPLIT_IDS = SPLIT.map((s) => `split:${s.short}`);

// ── ① PURE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① PURE — the owners, one answer booked, the rate, one take folded');
{
  const FIX = [
    ['src/server/session-broadcast.js', 'interface'], ['src/auth.js', 'interface'], ['src/server/sync-fs-witness.js', 'interface'], ['src/store-writer.js', 'interface'], ['src/agentd/mux.js', 'interface'],
    ['src/server/vault-engine.js', 'vault'], ['src/routes/vault.js', 'vault'], ['src/server/integration-store.js', 'vault'], ['src/browser-login.js', 'vault'], ['src/secret-box.js', 'vault'],
    ['src/server/channels-engine.js', 'channels'], ['src/channels/slack.js', 'channels'], ['src/channel-store.js', 'channels'], ['src/channel-record.js', 'channels'], ['src/routes/channels.js', 'channels'],
    ['src/server/usage-pool-engine.js', 'money'], ['src/harnesses/claude-quota.js', 'money'], ['src/server/spend-guard.js', 'money'], ['src/server/conversation-deliver.js', 'money'], ['src/server/stream-wall.js', 'money'], ['src/account-pool-auto.js', 'money'],
    ['src/server/task-fanout.js', 'workspace'], ['src/server/groups-hold.js', 'workspace'], ['src/server/groups-engine.js', 'workspace'], ['src/channel-groups.js', 'workspace'], ['src/server/grants-store.js', 'workspace'], ['src/server/design-engine.js', 'workspace'],
    ['src/browser-profiles.js', 'machines'], ['src/server/window-targets-engine.js', 'machines'], ['src/job-model.js', 'machines'], ['src/server/jobs-wiring.js', 'machines'], ['src/mount-argv.js', 'machines'], ['src/plugins.js', 'machines'], ['src/server/plugin-install.js', 'machines'], ['src/server/mounts-plugins-wiring.js', 'machines'],
    ['src/ws-create.js', 'conversation'], ['src/server/conversation-ops.js', 'conversation'], ['src/server/stdout/claude-stream-json.js', 'conversation'], ['src/agent-routes/status.js', 'conversation'], ['src/server/session-brain.js', 'conversation'], ['src/server/browser-stream.js', 'conversation'],
    ['src/harnesses/claude-transport.js', 'conversation'], ['src/usage-walker.js', 'conversation'], ['src/design-fs.js', 'conversation'], ['src/server/browser-login-fill.js', 'conversation'], ['src/server/stream-relays.js', 'conversation'], ['src/account-material.js', 'conversation'],
    // cure r3 (T1): the files that hold two owners' work are each their OWN bucket
    ['src/ws-handler.js', 'split:ws-handler'], ['server.js', 'split:server'], ['src/agent-routes.js', 'split:agent-routes'], ['src/hosts.js', 'split:hosts'], ['src/agentd/client.js', 'split:agentd-client'],
    ['src/server/browser-keeper.js', 'split:browser-keeper'], ['src/jobs.js', 'split:jobs'], ['src/mounts.js', 'split:mounts'], ['src/accounts.js', 'split:accounts'], ['src/server/migrations.js', 'split:migrations'],
    ['src/server/lazy.js', LC.HELPER], ['src/hidden-chars.js', LC.HELPER], ['src/store-pace.js', LC.HELPER],
    ['node_modules/ws/lib/websocket.js', null], ['data/plugins/x/index.js', null], ['src/agentd/agentd.js', null], ['', null],
  ];
  const wrong = FIX.map(([p, id]) => [p, id, ownerOf(p)]).filter(([, id, got]) => got !== id);
  ok(!wrong.length && (LC.IDS || []).join() === [ORDER, ...SPLIT_IDS, 'outside'].join() && SPLIT.length && OWNERS.length === 7 && OWNERS.every((o) => FIX.some(([, id]) => id === o.id)) && FIX.every(([p]) => !p.startsWith('src/') || fs.existsSync(path.join(REPO, p))) && fs.existsSync(path.join(REPO, 'server.js')),
    `ownerOf: a real file of the tree per owner (${(LC.IDS || []).join(', ')} — that order: the seven, the split buckets, outside), the families two owners share (browser, harnesses, usage, stream, exit, session, jobs, mounts, plugins), the split files' own buckets, the helpers, and no row for node_modules / data / the device agent / nothing`, wrong);
  // THE CENSUS SMALLS (cure r3): each misfile the verifier named, with its owner now — or why it stays
  const SMALLS = [
    ['src/peer-text.js', 'channels'],   // not ownerless: it requires src/channel-record.js and runs its frame rule (carriesFrame, inertFrameLine) at every call — the channel record's belt
    ['src/msg-acl.js', 'workspace'],    // the reach between agents' conversations by task group and the grants' admission: agent-to-agent messages are the workspace's (the design's row)
    ['src/server/worker-dispatch.js', 'workspace'], ['src/dispatch-model.js', 'workspace'],   // a brief to a worker = a groups-engine send with the groups store's ledger and pacer
    ['src/job-logs-sweep.js', 'conversation'], ['src/job-logs-sweep-worker.js', 'conversation'],
    ['src/server/marked-walk.js', 'conversation'], ['src/server/marked-walk-child.js', 'conversation'],   // B-d8f4 (9): a job's processes by its mark, walked in a child (the design: the machine's)   // a job's logs on its machine, judged against the wrapper's pid stamp in /proc (the design: the machine agent's)
    ['src/backend-caps.js', 'conversation'],   // the harness capability table — each harness descriptor's caps ARE its row; the pool reads one field through capsOf
    ['src/server/migrations.js', 'split:migrations'],   // the design's own split row: each service migrates its own stores — one registry holds six owners' reshapes
    ['src/server/home-rename.js', 'split:home-rename'],   // B-8033 moved server.js's home-rename body here: claude's project folders AND the recorded paths in four owners' stores
    ['src/telemetry.js', 'interface'], ['src/migration-runner.js', 'interface'],   // STAY: telemetry's stringify runs at its own flush (a 2 s timer, the summary route, exit) and in the collector's door, never inside an engine's call; the runner holds no owner's store
  ];
  const smallsWrong = SMALLS.map(([p, id]) => [p, id, ownerOf(p)]).filter(([, id, got]) => got !== id);
  ok(!smallsWrong.length && !HELPERS.some((h) => h.path === 'src/peer-text.js') && SMALLS.every(([p]) => fs.existsSync(path.join(REPO, p))),
    'the census smalls: peer-text is channels\' (off the helpers\' list), msg-acl and the worker dispatch pair workspace\'s, the job-log sweep and the harness capability table the conversation\'s (the machine side), migrations a split file of its own; telemetry and the migration runner stay the interface\'s', smallsWrong);
  // B-403e FOLLOW-UP (5): THE RULE FOR THE READS HELPER, its reason held (src/loop-census.js 'money'): with a caller after it the
  // helper's frames are passed (the hold is the caller's); a stack that is the helper's ALONE keeps them, and the rule books it to
  // money. CONTROL: the same helper frame above a channel store's caller is booked to channels, never money
  {
    const RT = '/repo', fr = (f) => ({ fn: 'f', file: 'file://' + RT + '/' + f, line: 3, col: 1 });
    const trim = typeof LH.instrumentTrim === 'function' ? LH.instrumentTrim : (x) => x;
    const fileOf = (x) => String(x.file).replace('file://' + RT + '/', '');
    const alone = trim([fr('src/run-reads.js'), { fn: 'readFileSync', file: 'node:fs', line: 1, col: 1 }], RT);
    const withCaller = trim([fr('src/run-reads.js'), fr('src/run-reads.js'), fr('src/channel-store.js')], RT);
    ok(ownerOf('src/run-reads.js') === 'money' && fileOf(alone[0]) === 'src/run-reads.js' && ownerOf(fileOf(alone[0])) === 'money',
      'the reads helper\'s rule is KEPT for its one case: a stack that is the helper\'s ALONE keeps its frame and is booked to money (its own memo work)', alone.map(fileOf));
    ok(withCaller.length === 1 && fileOf(withCaller[0]) === 'src/channel-store.js' && ownerOf(fileOf(withCaller[0])) === 'channels',
      'CONTROL: the helper\'s frames above a caller are passed — the hold is the caller\'s (a channel store\'s write ⇒ channels), never money\'s', withCaller.map(fileOf));
  }
  // the sample's own encoding (src/loop-hold.js SAMPLE_EXPR): 'C' + <n>:<name><n>:<file><line>,<own line><e|n> each
  const C = (frames) => 'C' + frames.map(({ fn = 'f', file, ev = false }) => `${fn.length}:${fn}${file.length}:${file}3,1${ev ? 'e' : 'n'}`).join('');
  const R = '/srv/hub';
  const S = (lines) => { const t = ['Error', ...lines].join('\n'); return `S${t.length}:${t}`; };
  const at = (rel) => ({ file: `${R}/${rel}` });
  const lib = (i) => ({ file: `${R}/node_modules/lib${i}/index.js` });
  const helper20 = Array.from({ length: 20 }, () => at('src/hidden-chars.js'));
  const B = (owner, viaHelper = false, deep = false) => ({ owner, viaHelper, deep });
  // the libraries a real request or page message arrives through (their install-relative paths are node_modules': passed)
  const WS = [{ file: `${R}/node_modules/ws/lib/event-target.js` }, { file: `${R}/node_modules/ws/lib/websocket.js` }, { file: 'node:events' }];
  const HTTP = [{ file: `${R}/node_modules/express/lib/router/layer.js` }, { file: `${R}/node_modules/express/lib/router/route.js` }, { file: 'node:_http_server' }];
  const cases = [
    // THE REAL SHAPES (the coordinator's), read off the REAL route files (pinned beside): a create that arrives as a page message
    // runs the page handler's `case 'create'` → the ops seam (conversation-ops openConversation) → the create handler (ws-create)
    [C([at('src/ws-create.js'), at('src/server/conversation-ops.js'), at('src/ws-handler.js'), ...WS]), B('conversation'), 'a session\'s creation (src/ws-create.js, through the ops seam) under the page handler\'s case (src/ws-handler.js) books the conversation'],
    [C([lib(1), { file: 'node:internal/fs/utils' }, at('src/ws-create.js'), at('src/server/conversation-ops.js'), at('src/ws-handler.js'), ...WS]), B('conversation'), 'a library and Node\'s internals under the create are passed: the conversation'],
    //   …and an agent's vault ask runs the VAULT's own route file (src/routes/vault.js holds every /api/agent/vault/* route)
    [C([{ file: 'node:crypto' }, at('src/server/vault-engine.js'), at('src/routes/vault.js'), ...HTTP]), B('vault'), 'the vault engine under the vault\'s own route file (an /api/agent/vault/* request) books the vault'],
    // THE SHAPE THAT WENT WRONG (cure r3, T1): a sample inside a door file's OWN inline body is that file's bucket — never the interface
    [C([at('src/ws-handler.js'), ...WS]), B('split:ws-handler'), 'a sample inside the page handler\'s OWN inline body (attach\'s transcript parse — native time on its JavaScript caller) books split:ws-handler, never interface'],
    [C([{ file: 'node:internal/fs/utils' }, { file: 'node:fs' }, at('src/ws-handler.js'), ...WS]), B('split:ws-handler'), 'a synchronous read inside the page handler\'s own body: split:ws-handler'],
    [C([at('src/hidden-chars.js'), at('src/ws-handler.js'), ...WS]), B('split:ws-handler', true), 'a helper inside the page handler\'s own body is passed and counted: split:ws-handler, viaHelper'],
    [C([{ file: 'node:internal/streams/writable' }, at('src/agent-routes.js'), ...HTTP]), B('split:agent-routes'), 'a channels verb\'s answer written inline in the agent routes: split:agent-routes, never the conversation'],
    [C([at('src/server/channels-engine.js'), at('src/agent-routes.js'), ...HTTP]), B('channels'), 'an engine a split door CALLS is the engine\'s: the walk stops at the first owned frame, before the door'],
    [C([at('src/jobs.js'), at('src/server/jobs-wiring.js'), at('server.js')]), B('split:jobs'), 'the walk never passes a split frame: the jobs file\'s own work, not the machines wiring that called it'],
    [C([at('src/hidden-chars.js'), at('src/argv-words.js'), at('src/server/channels-engine.js'), at('src/ws-handler.js')]), B('channels', true), 'two helpers between the channels engine and its caller are passed and counted: channels, viaHelper'],
    // peer-text is the channel record's belt (cure r3): booked channels — never passed as a helper onto the door that called it
    [C([at('src/channel-record.js'), at('src/peer-text.js'), at('src/server/groups-engine.js')]), B('channels'), 'the belt\'s call into the channel record\'s frame rule books channels'],
    [C([at('src/hidden-chars.js'), at('src/peer-text.js'), at('src/server/groups-engine.js')]), B('channels', true), 'a sample inside the belt (peer-text) books channels, not the workspace door that called it'],
    [C([at('src/server/session-brain.js'), at('src/ws-handler.js')]), B('conversation'), 'the walk never passes an owned frame: the live-output consumer, not the page handler that called it'],
    [C([at('src/hidden-chars.js'), at('src/server/lazy.js')]), B('outside'), 'helpers alone: outside (nothing booked onto a caller, so no viaHelper)'],
    [C([lib(1), { file: 'node:internal/timers' }]), B('outside'), 'a library and Node\'s internals alone: outside'],
    [C([{ fn: 'hr', file: `${R}/src/server/loop-blame.js` }, at('src/server/sync-fs-witness.js'), { file: 'node:fs' }, at('src/usage-history.js')]), B('money'), 'the instrument\'s own frames after a wrapped sync call trimmed: its caller'],
    [C([{ fn: 'hr', file: `${R}/src/server/loop-blame.js` }, at('src/server/sync-fs-witness.js')]), B('interface'), 'a stack that is the instrument\'s alone stays the instrument\'s: the hub process\'s own (interface)'],
    [C([{ file: `${R}/src/jobs.js`, ev: true }, at('src/server/session-broadcast.js')]), B('interface'), 'an eval\'d frame is never the install\'s'],
    [C([at('data/plugins/x/index.js'), at('src/server/plugin-loader.js')]), B('split:plugin-loader'), 'an install file with no row (a plugin\'s own code) is passed: its loader (a split file: the registry and the child\'s supervision)'],
    [C([{ file: '' }, { file: 'node:internal/timers' }, { file: '/elsewhere/plugin.js' }]), B('outside'), 'no frame of the install: outside'],
    [C([]), B('native'), 'no JavaScript frame: native'],
    // THE FRAME LIMIT: a full list with no owned frame is deep — the owner may lie beyond it; under the limit, or an owner in it, is not
    [C([...helper20, ...Array.from({ length: LC.FRAME_LIMIT - 20 }, (_, i) => lib(i))]), B('outside', false, true), `a full list (${LC.FRAME_LIMIT} frames, the sample\'s limit) of helpers and libraries: outside, deep`],
    [C([...helper20, ...Array.from({ length: LC.FRAME_LIMIT - 21 }, (_, i) => lib(i))]), B('outside'), `${LC.FRAME_LIMIT - 1} frames, no owner: outside, not deep (nothing was cut)`],
    [C([...helper20, ...Array.from({ length: LC.FRAME_LIMIT - 21 }, (_, i) => lib(i)), at('src/browser-profiles.js')]), B('machines', true), `a full list whose last frame is owned: the owner (through the helpers), not deep`],
    [S(['    at f0 (/srv/hub/src/x.js:1:1)', '    at f (/srv/hub/src/browser-profiles.js:3:4)', '    at g (/srv/hub/src/ws-handler.js:5:6)']), B('machines'), 'the string form (locations only) books the same way'],
    [S(['    at f0 (/srv/hub/src/x.js:1:1)', '    at f (/srv/hub/src/server/browser-keeper.js:3:4)', '    at g (/srv/hub/src/browser-profiles.js:5:6)']), B('split:browser-keeper'), 'the string form books a split file\'s own bucket the same way'],
    [S(['    at f0 (/srv/hub/src/x.js:1:1)', ...Array.from({ length: LC.FRAME_LIMIT + 4 }, (_, i) => `    at g${i} (/srv/hub/node_modules/l/i.js:${i + 1}:1)`)]), B('outside', false, true), 'the string form cut at its limit with no owned frame: outside, deep'],
    // B-403e follow-up (5), END TO END through bookOf (its trim, then the owners): the reads helper ALONE books money; its frames
    // above a channel store's write are passed — the hold is the caller's
    [C([at('src/run-reads.js'), { file: 'node:fs' }]), B('money'), 'the reads helper ALONE (no caller of ours: its memo-drop microtask) books money — the rule kept for that one case'],
    [C([at('src/run-reads.js'), at('src/run-reads.js'), at('src/channel-store.js')]), B('channels'), 'the reads helper\'s frames above a channel store\'s write are passed: the hold is the caller\'s (channels), never money'],
    ['D', null, 'a debugger\'s stand-down: not sampled'], ['A', null, 'an accessor\'s stand-down: not sampled'], [S(['garbage']), null, 'frames unreadable: not sampled'], [null, null, 'no text: not sampled'],
  ];
  const bad = cases.map(([t, want, why]) => [why, want, LC.bookOf(t, R)]).filter(([, want, got]) => JSON.stringify(got) !== JSON.stringify(want));
  ok(!bad.length, `bookOf: ${cases.map(([, , why]) => why).join('; ')}`, bad);
  // THE REAL SHAPES' ROUTES, read off the tree: the stacks above are the roads the real files take
  const src = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
  const WSH = src('src/ws-handler.js'), OPS = src('src/server/conversation-ops.js'), RV = src('src/routes/vault.js'), AR = src('src/agent-routes.js');
  const vaultRoutes = [...RV.matchAll(/app\.(?:get|post|put|delete)\('\/api\/agent\/vault\//g)].length;
  ok(/case 'create': \{\s*await convOps\.openConversation\(data,/.test(WSH) && /if \(ws\) return D\(\)\.handleCreate\(ws, spec/.test(OPS)
    && /const \{ createWsCreateHandler \} = require\('\.\/ws-create'\);/.test(WSH) && /const handleCreate = createWsCreateHandler\(\{/.test(WSH)
    && vaultRoutes >= 5 && !/\/api\/agent\/vault/.test(AR) && ownerOf('src/routes/vault.js') === 'vault',
    `the real shapes' roads: the page handler's case 'create' → conversation-ops openConversation → the create handler from src/ws-create.js; every /api/agent/vault/* route (${vaultRoutes}) in the vault's own route file (src/routes/vault.js, the vault's), none in src/agent-routes.js`);
  ok(/E\.stackTraceLimit = 32;/.test(LH.SAMPLE_EXPR) && /for \(let i = 1; i < cs\.length; i\+\+\)/.test(LH.SAMPLE_EXPR) && LC.FRAME_LIMIT === 32 - 1,
    `FRAME_LIMIT ${LC.FRAME_LIMIT} = the sample's own expression: 32 frames asked of V8, its own skipped`);
  const sl = [LC.slowerAfter(1000, 4.5), LC.slowerAfter(1000, LC.ASK_BOUND_MS), LC.slowerAfter(4000, 9), LC.slowerAfter(8000, 50), LC.slowerAfter(1000, NaN), LC.slowerAfter(1000, 0.2)];
  ok(JSON.stringify(sl) === '[2000,null,8000,null,null,null]' && LC.ASK_BOUND_MS === 4 && LC.CENSUS_FLOOR_MS === 8000 && LC.CENSUS_EVERY_MS === 1000,
    `slowerAfter: an ask past 4 ms halves the rate (1 s → 2 s, 4 s → 8 s), never slower than one per 8 s; at the bound or under, unchanged — so the bound's worst hour is 3 600 asks × (4 + ${LC.DISPATCH_MS}) ms = ${(3600 * (LC.ASK_BOUND_MS + LC.DISPATCH_MS) / 1000).toFixed(1)} s`, sl);
  // the families of a take: owners, split buckets, outside, native — and two ids the table does not know: a retired owner's
  // and a split file no longer on the list (both are outside's)
  const TAKE = { ev: 'census', id: 7, fromM: 1000, toM: 3601000, everyMs: 1000, ticks: { idle: 1500, held: 30, stopped: 0, notSampled: 12, paused: 8 }, pausedBy: { heap: 8 },
    families: { channels: 600, money: 300, conversation: 150, interface: 150, 'split:ws-handler': 200, 'split:jobs': 40, outside: 90, native: 60, vault: 0, renamed: 6, 'split:gone': 4 }, viaHelper: 120, deep: 7, asks: 1290, askOwnMs: 258, askMaxMs: 1.75, halved: null };
  const BUSY = 1600;
  const w = (id) => (id === 'outside' ? (LC.OUTSIDE || {}).words : (OWNERS.find((o) => o.id === id) || {}).words);
  const row = (id, n) => ({ family: id, words: w(id), ticks: n, share: n / BUSY });
  const splitRow = (s, n) => ({ family: `split:${s.short}`, short: s.short, why: s.why, ticks: n, share: n / BUSY });
  const tk = { 'split:ws-handler': 200, 'split:jobs': 40 };
  const WANT = { fromM: 1000, toM: 3601000, everyMs: 1000, sampledTicks: 3130, busyTicks: BUSY, busyShare: BUSY / 3130,
    shares: [row('interface', 150), row('vault', 0), row('channels', 600), row('money', 300), row('workspace', 0), row('machines', 0), row('conversation', 150),
      ...SPLIT.map((s) => splitRow(s, tk[`split:${s.short}`] || 0)), row('outside', 100)],
    native: { ticks: 60, share: 60 / BUSY, words: LC.NATIVE_WORDS }, viaHelper: { ticks: 120 }, deep: { ticks: 7 },
    idle: { ticks: 1500, share: 1500 / 3130 }, held: { ticks: 30, share: 30 / 3130 }, stopped: { ticks: 0, share: 0 },
    notSampled: { ticks: 20, paused: 8, pausedBy: { heap: 8 } }, cost: { asks: 1290, ownMs: 258, meanMs: 0.2, maxMs: 1.75, halved: null, dispatchMs: 1290 * LC.DISPATCH_MS, paidMs: 258 + 1290 * LC.DISPATCH_MS }, words: LC.TICK_WORDS };
  const F = LC.censusFold(TAKE);
  ok(SPLIT.length && JSON.stringify(F) === JSON.stringify(WANT) && Math.abs(F.shares.reduce((s, x) => s + x.share, 0) + F.native.share - 1) < 1e-12,
    'censusFold of a FIXED take ⇒ a FIXED result: shares = the seven owners, then one row per split bucket (family split:<short>, its short and why, the list\'s order), then outside — each a share of the BUSY ticks (an id the table does not know, a retired owner\'s or a split file off the list, is outside\'s), native beside them — together 1; viaHelper and deep as ticks; idle / held of the sampled; paused counted not sampled; the asks\' cost', F);
  const E = LC.censusFold(null);
  ok(E.busyTicks === 0 && E.busyShare === null && E.shares.length === 8 + SPLIT.length && E.shares.every((x) => x.share === null) && E.viaHelper?.ticks === 0 && E.deep?.ticks === 0 && E.cost.meanMs === null, 'an empty take folds to nothing claimed (no share without a tick)', E);
  ok(/OWNER of the first owned frame walking outward/.test(LC.TICK_WORDS) && /split:<short>/.test(LC.TICK_WORDS) && !/innermost frame of/.test(LC.TICK_WORDS) && /outside/.test(LC.TICK_WORDS) && /deep/.test(LC.TICK_WORDS),
    'the tick words say the outward walk to the first owned frame, a two-owner file\'s own bucket, outside and deep — never «the innermost frame»', LC.TICK_WORDS);
}

// ── ② THE OWNERS COVER THE HUB ────────────────────────────────────────────────────────────────────────────────────────
console.log('② the owners cover the hub — every file the hub can load in exactly one owner, on the split list, or on the helpers\' list');
{
  // THE RULE for «the hub can load it»: server.js + every src/**/*.{js,mjs,cjs}, LESS the files that ONLY a page bundle or
  // ONLY a device bundle reaches — each bundle's closure walked from its entries (read off package.json's esbuild lines:
  // --platform=browser ⇒ a page bundle, --platform=node ⇒ the device agent's), never reached from server.js. A file no
  // closure reaches (a worker script, an adapter a registry loads by name) is the hub's.
  const PKG = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const entries = { browser: [], node: [] };
  for (const v of Object.values(PKG.scripts || {})) for (const m of String(v).matchAll(/esbuild (src\/\S+?\.[cm]?js) --bundle\b[^&]*?--platform=(browser|node)/g)) entries[m[2]].push(m[1]);
  const files = [];
  (function walk(rel) { for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) { const r = `${rel}/${e.name}`; if (e.isDirectory()) walk(r); else if (e.isFile() && /\.[cm]?js$/.test(e.name)) files.push(r); } })('src');
  files.push('server.js');
  const known = new Set(files);
  const resolve = (from, spec) => {
    if (!spec.startsWith('.')) return null;
    const b = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    for (const c of [b, `${b}.js`, `${b}/index.js`]) if (known.has(c)) return c;
    return null;
  };
  const text = new Map();
  const edges = (f) => {
    const t = text.get(f) ?? fs.readFileSync(path.join(REPO, f), 'utf8'); text.set(f, t);
    const out = [];
    for (const re of [/require\(\s*['"]([^'"]+)['"]\s*\)/g, /(?:^|[\s;])(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]/gm, /(?:^|[\s;])import\s*['"]([^'"]+)['"]/gm, /import\(\s*['"]([^'"]+)['"]\s*\)/g])
      for (const m of t.matchAll(re)) { const r = resolve(f, m[1]); if (r) out.push(r); }
    return out;
  };
  const closure = (from) => { const seen = new Set(), q = [...from]; while (q.length) { const f = q.pop(); if (seen.has(f) || !known.has(f)) continue; seen.add(f); q.push(...edges(f)); } return seen; };
  const HUB = closure(['server.js']), PAGE = closure(entries.browser), DEVICE = closure(entries.node);
  const pageOnly = [...PAGE].filter((f) => !HUB.has(f)), deviceOnly = [...DEVICE].filter((f) => !HUB.has(f));
  const hubSide = files.filter((f) => !(PAGE.has(f) && !HUB.has(f)) && !(DEVICE.has(f) && !HUB.has(f)));
  const by = Object.fromEntries(OWNERS.map((o) => [o.id, 0])), unowned = [], twice = [], helperRuled = [], splitRuled = [];
  const helperSet = new Set(HELPERS.map((h) => h.path)), splitSet = new Set(SPLIT.map((s) => s.path));
  for (const f of hubSide) {
    const hits = OWNERS.filter((o) => o.rules.some((re) => re.test(f))).map((o) => o.id);
    if (helperSet.has(f)) { if (hits.length) helperRuled.push(`${f} → ${hits.join(', ')}`); continue; }
    if (splitSet.has(f)) { if (hits.length) splitRuled.push(`${f} → ${hits.join(', ')}`); continue; }   // cure r3: a split file matches NO owner's rule
    if (!hits.length) unowned.push(f); else if (hits.length > 1) twice.push(`${f} → ${hits.join(' and ')}`); else by[hits[0]]++;
  }
  const dead = OWNERS.flatMap((o) => o.rules.map((re, i) => [o.id, i, re]).filter(([, , re]) => !hubSide.some((f) => re.test(f))).map(([id, i]) => `${id} rule ${i}`));
  const strayHelpers = HELPERS.filter((h) => !hubSide.includes(h.path)).map((h) => h.path);
  console.log(`    the page bundles (${entries.browser.join(', ')}) reach ${PAGE.size} files, ${pageOnly.length} of them only theirs; the device bundles (${entries.node.join(', ')}) ${DEVICE.size}, ${deviceOnly.length} only theirs`);
  console.log(`    THE HUB LOADS ${hubSide.length} files — ${OWNERS.map((o) => `${o.id} ${by[o.id]}`).join(' · ')} · split ${SPLIT.length} · helpers ${HELPERS.length} · unowned ${unowned.length}`);
  for (const s of SPLIT) console.log(`      split:${s.short} ${s.path} (${(s.owners || []).join(' + ')}) — ${s.why}`);
  for (const h of HELPERS) console.log(`      helper ${h.path} — ${h.why}`);
  if (unowned.length) console.log(`    UNOWNED (each needs an owner's rule or, holding no state, a helper's row): ${unowned.join(', ')}`);
  ok(entries.browser.includes('src/client.js') && entries.node.includes('src/agentd/agentd.js') && HUB.has('src/ws-handler.js') && pageOnly.length > 100 && hubSide.length > 600,
    `the bundles' entries read off package.json (${entries.browser.length} page, ${entries.node.length} device) and server.js's closure walked`, { entries, hub: HUB.size });
  ok(!unowned.length, `UNOWNED = 0 — every one of the ${hubSide.length} files the hub can load has an owner, is a split file or a helper`, unowned);
  ok(OWNERS.length === 7 && !twice.length && !helperRuled.length, 'EXACTLY ONE owner per file — no file matches two owners\' rules, no helper matches an owner\'s', { twice, helperRuled });
  ok(OWNERS.map((o) => o.id).join() === ORDER && OWNERS.every((o) => by[o.id] > 0) && !dead.length && !strayHelpers.length && HELPERS.length && HELPERS.length <= 16 && HELPERS.every((h) => h.why && fs.existsSync(path.join(REPO, h.path))),
    `the seven owners in their order, each takes files; no rule matches nothing; the helpers' list is short (${HELPERS.length}), each a real hub-side file with its why`, { by, dead, strayHelpers });
  ok(OWNERS.length && OWNERS.reduce((s, o) => s + by[o.id], 0) + SPLIT.length + HELPERS.length === hubSide.length, 'the owners\' counts, the split files and the helpers add up to the files the hub loads', { by, split: SPLIT.length, helpers: HELPERS.length });
  // THE SPLIT LIST (cure r3, T1): short, explicit, each a real hub-side file with its OWN short name, two or more owners of the
  // table (in its order) and one line of why; NO owner's rule matches a split file (it would be booked on that owner)
  const ids = OWNERS.map((o) => o.id);
  const shortOk = (s) => /^[a-z][a-z0-9-]*$/.test(s.short) && [path.posix.basename(s.path).replace(/\.[cm]?js$/, ''), `${path.posix.basename(path.posix.dirname(s.path))}-${path.posix.basename(s.path).replace(/\.[cm]?js$/, '')}`].includes(s.short);
  const badSplit = SPLIT.filter((s) => !hubSide.includes(s.path) || helperSet.has(s.path) || !shortOk(s) || !Array.isArray(s.owners) || s.owners.length < 2 || new Set(s.owners).size !== s.owners.length
    || s.owners.some((o) => !ids.includes(o)) || s.owners.join() !== ids.filter((o) => s.owners.includes(o)).join() || !(typeof s.why === 'string' && s.why.length > 40)).map((s) => s.path);
  ok(SPLIT.length >= 1 && SPLIT.length <= 16 && !splitRuled.length && !badSplit.length && new Set(SPLIT.map((s) => s.short)).size === SPLIT.length && new Set(SPLIT.map((s) => s.path)).size === SPLIT.length,
    `THE SPLIT LIST (${SPLIT.length}): each a real hub-side file under its own short name, two or more owners (the table's order) and its why — NO owner's rule matches one: ${SPLIT.map((s) => `split:${s.short}`).join(', ')}`, { splitRuled, badSplit });
}

// ── ③ LIVE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('③ LIVE — the real watchdog thread in this process, a dense test rate (50 ms), a scratch install');
const ROOT = path.join(TMP, 'install');
fs.mkdirSync(path.join(ROOT, 'src/server'), { recursive: true });
// the planted work: a module whose install-relative path is the channels owner's (its frames are the only owned frames), and a
// helper it calls — at the install-relative path of a real helper (src/shell-words.js): its frames are passed, never booked
fs.writeFileSync(path.join(ROOT, 'src/shell-words.js'), "'use strict';\nfunction spin(span) { const t0 = Date.now(); let x = 0; while (Date.now() - t0 < span) x += Math.sqrt(x + 1); return x; }\n"
  + "function deep(n, span) { return n > 0 ? deep(n - 1, span) + 1 : spin(span); }\nmodule.exports = { spin, deep };\n");
fs.writeFileSync(path.join(ROOT, 'src/server/channels-burn.js'), "'use strict';\nconst H = require('../shell-words.js');\n"
  + "function burn(span) { const t0 = Date.now(); let x = 0; while (Date.now() - t0 < span) x += Math.sqrt(x + 1); return x; }\n"
  + "function viaHelper(span) { return H.spin(span) + 1; }\nfunction deepBurn(span) { return H.deep(40, span) + 1; }\nmodule.exports = { burn, viaHelper, deepBurn };\n");
const B = require(path.join(ROOT, 'src/server/channels-burn.js'));
const SFW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
const said = [];
let samplingOn = true;
const quiet = { warn: (l) => said.push(String(l)), log() {}, error() {}, info() {} };
// the captures' own options (B-518e): handed to every capture as it starts (loop-holds spreads captureOpts into each ask) —
// (d0) places the cost bound, (d) lifts it
const CAP = {};
const W = SFW.create({ rootDir: ROOT, armed: true, readMountinfo: () => '', fresh: true, beatMs: 50, holdMs: 400, noAnswerMs: 50, liveMs: 60000, censusEveryMs: 50, samplingOn: () => samplingOn,
  log: quiet, holdsOptions: { eluEveryMs: 50, eluBeforeMs: 500, captureMs: 1500, captureEveryMs: 20, autoCapture: false, captureOpts: CAP } }).start({ installHook: false });
const sumOf = (t) => Object.values(t.ticks).reduce((s, n) => s + n, 0) + Object.values(t.families).reduce((s, n) => s + n, 0);
// B-3dbd (r4729, lane bl-chat-b): THE TAKES WAIT ON THE CENSUS'S OWN FACTS. The watchdog thread ticks on a timer of its own that runs late
// beside other suites, so a count of ticks is waited for by takes (summed, or one take after a growing pause), never by a fixed sleep; a
// take may wait long for its answer (TAKE_MS — the product's 2 s TAKE_WAIT_MS is a hub's, not a loaded test machine's); a wait that ends
// without its fact is a NAMED failed line, never a silent read of whatever was there
const TAKE_MS = 20000, LOOP_MS = 30000, PACE = 50;
const take = (w, ms = TAKE_MS) => w.census(Math.max(1, ms));
const noFact = (what, d) => ok(false, `the census never showed ${what} within its bound — a harness line, never the census's verdict`, d);
/** takes until one answers `done` (each take starts the next hour) → that take, or null with its named line — ONE deadline over the whole wait */
const takeUntil = async (w, done, what) => { const end = Date.now() + LOOP_MS; while (Date.now() < end) { const t = await take(w, end - Date.now()); if (t && done(t)) return t; await sleep(PACE); } noFact(what); return null; };
/** takes summed until `done(sum)` → the sum {takes, paused, off, asks}, its named line when the deadline ends first */
const sumUntil = async (w, done, what) => {
  const acc = { takes: 0, paused: 0, off: 0, asks: 0 }, end = Date.now() + LOOP_MS;
  while (!done(acc) && Date.now() < end) { await sleep(PACE); const t = await take(w, end - Date.now()); if (!t) continue; acc.takes++; acc.paused += t.ticks.paused || 0; acc.off += (t.pausedBy && t.pausedBy.off) || 0; acc.asks += t.asks || 0; }
  if (!done(acc)) noFact(what, acc);
  return acc;
};
/** the most ticks a fresh hour of this take's own length can hold (the census's tick comes every everyMs × 0.5 to 1.5) */
const maxTicks = (t) => Math.floor((t.toM - t.fromM) / (0.5 * t.everyMs)) + 1;
/** a condition of the main side, polled — its expiry a named line */
const factWithin = async (fn, what, ms = TAKE_MS) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await sleep(20); if (!fn()) noFact(what); return fn(); };
try {
  await sleep(400);   // the watchdog thread up
  ok(!!(await W.census()), 'census() answers the take of a running census');
  // (a) half busy inside the channels owner, half idle. B-518e: the idle half is WAITED FOR BY ITS COUNT — takes summed
  // until 5 idle ticks (at most 80 tries of 100 ms, an end for a census that never ticks), never «≥ 5 in 400 ms» of a 50 ms
  // timer: beside other suites the watchdog thread's own timer runs late (4 idle ticks in the 400 ms on the first test
  // machine in a packed run, green alone). The burn's take is the busy half alone; what the idle takes book is printed
  // (an ask in flight across a take books its later ticks on its answer's stack, so a tick of channels there is the law's)
  for (let i = 0; i < 4; i++) { B.burn(140); await sleep(1); }
  const a = await W.census(), fa = LC.censusFold(a), faCh = fa.shares.find((s) => s.family === 'channels') || {};
  let idleTicks = 0, idleChannels = 0, idleTakes = 0;
  for (let i = 0; i < 80 && idleTicks < 5; i++) {
    await sleep(100);
    const take = await W.census();
    if (!take) continue;
    idleTakes++; idleTicks += take.ticks.idle; idleChannels += take.families.channels || 0;
  }
  ok(a && a.families.channels >= 5 && faCh.share > 0.5 && fa.shares.every((s) => s === faCh || !(s.share > faCh.share)) && idleTicks >= 5 && a.asks >= 5 && a.askMaxMs > 0 && a.everyMs === 50 && a.viaHelper === 0 && a.deep === 0,
    `(a) a burn inside src/server/channels-burn.js: «channels» books ${a && a.families.channels} of ${fa.busyTicks} busy ticks; the idle half ${idleTicks} idle ticks over ${idleTakes} takes (${idleChannels} more on channels there); ${a && a.asks} asks, their own run ${a && a.askOwnMs.toFixed(2)} ms (largest ${a && a.askMaxMs.toFixed(3)} ms); none through a helper, none deep`, { a, idleTicks, idleChannels, idleTakes });
  // (a2) the same burn inside a HELPER the channels file calls: booked on channels, counted through a helper.
  // r5455 (the placement of its red at load 45, run 10f53ad7b-20261127010837-both): «outside» counts the ticks whose answer stood in
  // NO owned frame — here the TEST's own frames between the burns (an ask answered there books every tick that waited on it). The
  // release allowed ONE: a tolerance for frames that run a fraction of a millisecond. A main thread kept on the CPU or off it while
  // runnable between burns (a loaded box; placed at will below) books its ticks there TRULY. So the leg allows what that time can
  // hold: one, plus the ticks the main thread's own non-idle time OUTSIDE the burns (its schedstat: on the CPU or waiting for one)
  // can hold at the census's tightest spacing (0.5 × everyMs). Brief gaps keep the bound at ONE; the law (the helper's ticks booked
  // on channels, through the helper) is untouched; the stretched band is counted and printed every run
  const gapsOf = async (stallAt = -1, stallMs = 0) => {
    const s0 = ssMain(); let inBurns = 0;
    for (let i = 0; i < 4; i++) { const b0 = ssMain(); B.viaHelper(100); const b1 = ssMain(); if (b0 != null && b1 != null) inBurns += b1 - b0; if (i === stallAt) stall(stallMs); await sleep(1); }
    const t = await W.census(), s1 = ssMain();
    const busyMs = s0 != null && s1 != null ? Math.max(0, s1 - s0 - inBurns) : 0;
    return { t, busyMs, allowed: 1 + Math.floor(busyMs / (0.5 * ((t && t.everyMs) || 50))) };
  };
  // the placed stall: native calls ON THE CPU (short pbkdf2Sync — never asleep) for `ms` by the clock, in the TEST's own frames
  // (an ask is answered between two of them, in this function: outside, as a stretched gap's own)
  const crypto = require('crypto');
  const stall = (ms) => { const end = process.hrtime.bigint() + BigInt(Math.round(ms * 1e6)); while (process.hrtime.bigint() < end) crypto.pbkdf2Sync('a', 'b', 2000, 32, 'sha256'); };
  await W.census();
  const { t: a2, busyMs: g2, allowed: al2 } = await gapsOf(), fa2 = LC.censusFold(a2), out2 = (a2 && a2.families.outside) || 0;
  if (out2 > 1) console.log(`  · (a2) THE STRETCHED BAND (r5455): ${out2} ticks outside, the main thread ${g2.toFixed(0)} ms on the CPU or waiting for one between the burns (allowed ${al2})`);
  ok(a2 && a2.families.channels >= 3 && a2.viaHelper >= 3 && a2.viaHelper <= a2.families.channels && out2 <= al2 && fa2.viaHelper?.ticks === a2.viaHelper,
    `(a2) a burn inside a helper (src/shell-words.js) called by src/server/channels-burn.js: «channels» books ${a2 && a2.families.channels} ticks, ${a2 && a2.viaHelper} of them through the helper (viaHelper), ${out2} outside (the test's own frames between burns; allowed ${al2}: one, plus what the main thread's own ${g2.toFixed(0)} ms busy between the burns can hold)`, { a2, busyMs: g2, allowed: al2 });
  // (a2b) r5455 THE STRETCHED GAP, PLACED AT WILL with no load: the same four helper burns with a ~120 ms native call in the test's
  // own frames after the second one. The RELEASE's bound (outside ≤ 1) is red there by name; the cured bound is not. Witnessed:
  // the gap's own busy time ≥ 100 ms and ≥ 2 ticks outside, else a named, counted skip
  await W.census();
  const { t: a2b, busyMs: g2b, allowed: al2b } = await gapsOf(1, 120), out2b = (a2b && a2b.families.outside) || 0;
  console.log(`  · (a2b) the placed gap: the main thread ${g2b.toFixed(0)} ms busy between the burns; ${out2b} outside; «channels» ${a2b && a2b.families.channels}, through the helper ${a2b && a2b.viaHelper}`);
  if (!(g2b >= 100 && out2b >= 2)) skip('(a2b) the stretched gap, placed: the release\'s bound red, the cured bound green', `the plant missed its band: ${g2b.toFixed(0)} ms busy between the burns (≥ 100 wanted), ${out2b} outside (≥ 2 wanted)`);
  else {
    ok(!(out2b <= 1), `CONTROL r5455 (the RELEASE's bound, «outside ≤ 1») on a ~120 ms native call in the test's own frames between the helper burns: RED by name — «(a2) … ${out2b} outside (the test's own frames between burns)»`);
    ok(a2b && a2b.families.channels >= 3 && a2b.viaHelper >= 3 && a2b.viaHelper <= a2b.families.channels && out2b <= al2b, `r5455: the cured bound on that gap — ${out2b} outside ≤ ${al2b} allowed (one, plus what its ${g2b.toFixed(0)} ms can hold); the helper's ticks still booked on channels through the helper`, { a2b, busyMs: g2b, allowed: al2b });
  }
  // (a3) the burn 40 helper frames deep: the sample's 31 frames hold no owned one — outside, deep (the owner lies beyond)
  for (let i = 0; i < 4; i++) { B.deepBurn(100); await sleep(1); }
  const a3 = await W.census(), fa3 = LC.censusFold(a3);
  ok(a3 && a3.families.outside >= 3 && a3.deep >= 3 && a3.deep <= a3.families.outside && (a3.families.channels || 0) <= 1 && fa3.deep?.ticks === a3.deep,
    `(a3) the burn under 40 helper frames: ${a3 && a3.families.outside} ticks outside, ${a3 && a3.deep} of them deep — the sample's ${LC.FRAME_LIMIT} frames end before channels-burn.js`, a3);
  // (b) the setting off: paused, nothing asked. The flag reaches the thread on a beat: the take that first shows it paused ends the hour
  // the flag arrived in; the hours after it are paused WHOLE — summed until three paused ticks (r4729: was 120 + 300 + 150 ms of sleeps)
  samplingOn = false;
  await takeUntil(W, (t) => ((t.pausedBy && t.pausedBy.off) || 0) >= 1, 'the setting off reaching its thread');
  const b = await sumUntil(W, (acc) => acc.paused >= 3, 'three paused ticks after the setting went off');
  samplingOn = true;
  await takeUntil(W, (t) => sumOf(t) >= 1 && !((t.pausedBy && t.pausedBy.off) || 0), 'an hour wholly after the setting came back on');
  ok(b && b.paused >= 3 && b.off >= 3 && b.asks === 0, `(b) the sampling setting off pauses the census as it stops a capture: ${b && b.paused} ticks paused (off) over ${b && b.takes} takes, nothing asked`, b);
  // (c) a hold: a synchronous child (no JavaScript runs) past the 0.4 s bar — the census's ask in flight is TAKEN by the hold
  const h0 = W.holds().ring().length;
  cp.spawnSync('sleep', ['0.8']);
  await factWithin(() => W.holds().ring().slice(h0).some((r) => r.ms >= 700), 'the 0.8 s hold\'s own record in the ring');   // r4729: THAT hold's record (was a 300 ms sleep)
  // r4747 (the round's should): «exactly ONE hold record» is a never clause — read only after the product could have written another: a
  // hold is a gap past holdMs (400 ms here), seen by the watchdog on its beat (beatMs 50 ms), so a second record of that gap would land
  // within holdMs + two beats of the first (the product's own constants, named — never a guessed span)
  const HOLD_MS = 400, BEAT_MS = 50;
  await sleep(HOLD_MS + 2 * BEAT_MS);
  const c = await take(W), held = W.holds().ring().slice(h0);
  ok(c && held.length === 1 && held[0].samples >= 1 && c.ticks.held >= 1 && c.ticks.notSampled >= 1,
    `(c) a 0.8 s synchronous child: ${c && c.ticks.held} ticks held; the HOLD TOOK the census's ask in flight — its first sample «${held[0] && held[0].frame}» — and the census's waiting ticks are not sampled (${c && c.ticks.notSampled})`, { c, held });
  // (d0) B-518e — WHAT TURNED (d) RED IN A PACKED RUN, NAMED BY ELIMINATION AND PLACED: «7 asks — the capture took 2 samples»
  // (the first test machine, the box's zone, green alone). The old leg printed no `stopped`, so the road is read off what
  // could end the capture: its window (it began before (d)'s take, and that take lasted 421 ms of its 800), a debugger or
  // the heap (the census paused nothing), a halved rate (it frees no census tick) — and its COST bound: its asks' own run
  // past 2 % of the window, 16 ms here (an ask's own run is the main thread's, its first instruction to its note, so a
  // thread that waits for a CPU inside an ask spends it). With the capture gone the census asks again. Placed here with the
  // bound at 1 µs: the capture stops after its first answered ask, says «cost», and the census asks.
  CAP.costMaxMs = 0.001;
  const r0 = W.holds().startCapture({ auto: false });
  await W.census();
  for (let i = 0; i < 4; i++) { B.burn(100); await sleep(1); }
  const d0 = await W.census();
  for (let i = 0; i < 40 && (W.holds().captureReport().last || {}).id !== r0.id; i++) await sleep(100);   // its end and its names
  const last0 = W.holds().captureReport().last;
  ok(r0.ok && last0 && last0.id === r0.id && last0.stopped === 'cost' && d0 && d0.asks >= 1,
    `(d0) a capture whose asks pass its cost bound stops early («${last0 && last0.stopped}», ${last0 && last0.samples} samples) and the census asks again (${d0 && d0.asks} asks) — the packed run's shape, placed`, { r0, d0, last0: last0 && { id: last0.id, samples: last0.samples, stopped: last0.stopped, costMs: last0.costMs } });
  // (d) a capture running: the census asks nothing (its busy ticks are not sampled); the capture samples. This capture's cost
  // bounds are lifted (one ask past 4 ms halving its rate, the sum past 2 % stopping it — the capture's own law, judged in
  // test-cpu-capture-live) and its window is 1.5 s (was 0.8 s) for a take of ~0.4 s: what (d) judges is the census beside a
  // capture that RUNS through the take, and a red says how the capture ended and how long the take was against its window
  CAP.costMaxMs = 1e9; CAP.askBoundMs = 1e9;
  const r = W.holds().startCapture({ auto: false });
  await W.census();   // after the capture's message (one port, in order): this take's window lies inside the capture
  for (let i = 0; i < 4; i++) { B.burn(100); await sleep(1); }
  const d = await W.census();
  for (let i = 0; i < 40 && (W.holds().captureReport().last || {}).id !== r.id; i++) await sleep(100);   // the capture's end (its 1.5 s window, then its names)
  const last = W.holds().captureReport().last;
  const dSpan = d ? d.toM - d.fromM : null;
  ok(r.ok && d && d.asks === 0 && d.ticks.notSampled >= 3 && last && last.id === r.id && !last.stopped && dSpan < last.windowMs && last.samples >= 10,
    `(d) while a capture runs the census asks nothing: ${d && d.ticks.notSampled} busy ticks not sampled, ${d && d.asks} asks — the capture took ${last && last.samples} samples${last && last.stopped ? `, STOPPED «${last.stopped}»` : ''}; the take ${dSpan != null ? dSpan.toFixed(0) : '?'} ms of the capture's ${last && last.windowMs} ms window`, { r, d, last: last && { id: last.id, samples: last.samples, split: last.split, stopped: last.stopped, costMs: last.costMs, windowMs: last.windowMs } });
  // (e) the take resets: the next hour starts where it ended, from zero. A take holding three ticks is waited for by a growing pause
  // before each take (r4729: was one 250 ms sleep, three ticks of a 50 ms timer that runs late under load), then the very next take
  // r4729 (the adversarial read): e2's count is judged against ITS OWN window (the most a fresh hour of that length holds), never «≤ 2»
  // (a late scheduling between the takes is ticks of its own); e1 must hold more than e2 could — else the pair proves nothing and is taken again
  let e1 = null, e2 = null;
  const eEnd = Date.now() + LOOP_MS;
  for (let ms = 150; Date.now() < eEnd; ms = Math.min(ms * 2, 3000)) {
    await sleep(ms); e1 = await take(W, eEnd - Date.now()); if (!(e1 && sumOf(e1) >= 3)) continue;
    e2 = await take(W, eEnd - Date.now()); if (e2 && sumOf(e1) > maxTicks(e2)) break;
  }
  if (!(e1 && e2 && sumOf(e1) >= 3 && sumOf(e1) > maxTicks(e2))) noFact('a take of three ticks followed by a shorter one', { e1, e2 });
  ok(e1 && e2 && e2.fromM === e1.toM && sumOf(e1) >= 3 && sumOf(e2) <= maxTicks(e2) && sumOf(e1) > maxTicks(e2) && e2.asks <= maxTicks(e2) && (e2.halved === null || e2.asks >= 1),
    `(e) a take resets the counts: the next starts at its end (${e1 && sumOf(e1)} ticks, then ${e2 && sumOf(e2)} of at most ${e2 && maxTicks(e2)} its own ${e2 ? (e2.toM - e2.fromM).toFixed(0) : '?'} ms hold)`, { e1, e2 });
} finally { W.stop(); }

// THE PLACEMENT (the family's law 1) of (b)'s old wait — run AFTER the main watchdog stopped (a second watchdog takes the process-wide sample
// hook, whose property is put back after it). A census whose ticks come AT LEAST 2 s apart (its everyMs 4000, the test's own constant —
// never load) cannot count three ticks in the old fixed 300 ms window (three ticks need 4 s), whatever the machine: the old leg's red, at
// will. This leg's wait — takes summed on the fact — is (b) above, green on the live census.
{
  const HK = require(path.join(REPO, 'src/loop-hold.js')).HOOK_KEY, had = Object.getOwnPropertyDescriptor(globalThis, HK);
  const W2 = SFW.create({ rootDir: ROOT, armed: true, readMountinfo: () => '', fresh: true, beatMs: 50, holdMs: 400, noAnswerMs: 50, liveMs: 60000, censusEveryMs: 4000, samplingOn: () => false, log: quiet }).start({ installHook: false });
  try {
    await take(W2);   // the hour starts here
    await sleep(300); const old = await take(W2);
    ok(!!old && old.ticks.paused < 3 && maxTicks({ ...old, everyMs: 4000 }) < 3, `PLACED: a census ticking at least 2 s apart counts ${old && old.ticks.paused} paused ticks in the old fixed 300 ms window (three need 4 s) — the old leg's red, made at will; (b)'s summed wait is this leg's`, old && { ticks: old.ticks, span: old.toM - old.fromM });
  } finally { W2.stop(); try { if (had) Object.defineProperty(globalThis, HK, had); else delete globalThis[HK]; } catch { } }
}

// ── ④ THE DOORS ───────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ the doors');
{
  const none = SFW.create({ rootDir: ROOT, readMountinfo: () => '', fresh: true, live: false, log: quiet }).start({ installHook: false });
  const off = SFW.create({ rootDir: ROOT, readMountinfo: () => '', fresh: true, beatMs: 50, holdMs: 400, censusEveryMs: 0, log: quiet }).start({ installHook: false });
  // r4729: THE NEVER CLAUSE read on the product's own answer — no thread answers null at once; the census-off thread ANSWERS «off» once it
  // is up (its message waits in its port meanwhile): asked with a long wait, a null that came before that wait ran out is that answer, never
  // the take's own timeout (was: a 200 ms sleep, then takes whose 2 s bound could meet the leg by itself)
  const t0 = Date.now(), n1 = await none.census(TAKE_MS), n2 = await off.census(TAKE_MS), waited = Date.now() - t0;
  none.stop(); off.stop();
  if (waited >= TAKE_MS / 2) noFact('the census-off thread\'s own answer', { waited });
  ok(n1 === null && n2 === null && waited < TAKE_MS / 2, 'census() answers null with no watchdog thread and with the census off (no take, never a guess)', { n1, n2, waited });
  const WK = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8');
  ok(/const q = takeCensusAsk\(\{ kind: 'hold', h \}\) \|\| ask\(\{ kind: 'hold', h \}\);/.test(WK) && /if \(!openHold\(now\)\) takeCensusAsk\(\{ kind: 'capture', c, pending: \[\] \}\);/.test(WK)
    && /if \(!openHold\(now\) && takeCensusAsk\(\{ kind: 'profile', pr, pq: \{ countedTo: now, counted: false \} \}\)\) return;/.test(WK)
    && /const k = CC\.tickOf\(\{ state, wchan, sys, beatAgeMs: now - T\[1\], freshMs: 2 \* beatMs \+ noAnswerMs, holdOpen: openHold\(now\), mine: own, other: \(!!inflight && !own\) \|\| !!cap \|\| !!prof \}\);/.test(WK)
    && /startCensus\(censusEveryMs\);/.test(WK),
    'the watchdog: a hold, a capture and a profile TAKE the census\'s ask through ONE function; the census\'s tick is a capture\'s tick (CC.tickOf) with every other asker counted as «another ask out»; it starts with the watchdog');
}

fs.rmSync(TMP, { recursive: true, force: true });
const sk = skipped ? `, ${skipped} skipped` : '';
console.log(fail ? `\n${fail} FAILED (${pass} passed${sk})` : `\nALL PASS (${pass}${sk})`);
process.exit(fail ? 1 : 0);

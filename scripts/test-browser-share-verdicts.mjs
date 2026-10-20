#!/usr/bin/env node
// OWNER RULING A (2026-09-26, "A吧"): a NAMED browser profile is usable by ALL of the owner's conversations by default.
// THE PURE AUTHORITY VERDICTS, split out of test-browser-share-model so they run in the FAST pre-push gate (lane
// fence-hygiene, B-9e86). The model suite grew to ~48 s HEAVY over lane profile-lock-roll's real-keeper lock /
// lineage / marker / rebind legs, so the who-may-use + late-key verdicts never ran pre-push. These rows are PURE:
// decided by src/browser-profiles.js + browser-windows.js + keeper-limits.js ALONE — no keeper, no routes, no
// agent-browser, no spawn. The REAL keeper + routes + fake-0.38.1 SCENARIO WALKS stay in test-browser-share-model.mjs.
//   ① who-may-use: the 36-cell table (scopeOf / mayAttach / whoMayUse / useStamp / usePatchVerdict / agentUseOf),
//      join-vs-launch, the window verdicts, the cap — and the refusal WORDS census (no command line in any refusal).
//   ③a the late-key verdict's order + its words (the lineage of a keyless / forked / remote / held-elsewhere session).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../src/browser-profiles.js');
const WIN = require('../src/browser-windows.js'); // lane browser-windows: a window per holder (PURE)
const LIMITS = require('../src/keeper-limits.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const CMDLINE_RE = /`?vibespace-browser \w/; // a refusal on these paths never hands the user (or the agent's Ask-user card) a command line
const KA = 'bk-0000c001', KB = 'bk-0000c002', KC = 'bk-0000c003', KD = 'bk-0000c004', KE = 'bk-0000c005', KF = 'bk-0000c006', KG = 'bk-0000c007', KS = 'bk-0000c00f';

// ═══ ① PURE ════════════════════════════════════════════════════════════════
console.log('— ① PURE: the default, one field, join-vs-launch, one driver, the cap, the scope patch, the words');
{
  // the default: a new NAMED record with no owner is usable by every conversation; createdBy is display only
  const r0 = B.newProfileRecord({ id: 'bp-0000c0a1', label: 'Work', dir: '/x/w', createdBy: KA + '.3' });
  ok(r0.owner.kind === 'instance' && B.scopeOf(r0) === 'all' && r0.createdBy === KA && r0.sharing === 'owner', 'a new named record with no owner is "All my conversations" (scope all), createdBy = the making conversation (a helper\'s key → its conversation), sharing (tab isolation) stays off');
  const one = B.newProfileRecord({ id: 'bp-0000c0a2', label: 'Mine', dir: '/x/m', owner: { kind: 'session', id: KA } });
  const eph = B.newProfileRecord({ id: 'bp-0000c0a3', label: '', dir: null, ephemeral: true, owner: { kind: 'conversation', id: KA } });
  ok(B.scopeOf(one) === 'only' && B.scopeOf(eph) === 'only' && B.scopeOf({ ...one, legacy: true }) === 'all' && B.scopeOf({ ...one, owner: { kind: 'task', id: 'T-1' } }) === 'only' && B.scopeOf(null) === null && B.SCOPES.join() === 'all,only', 'scopeOf reads ONE field: a list (or a pre-list single session / task owner) ⇒ only, instance/legacy ⇒ all, an ephemeral record is its conversation\'s (only)');
  // the path-A contradiction is impossible by construction: `sharing` never admits
  ok(B.mayAttach({ ...one, sharing: 'instance' }, { browserKey: KB }).code === 'not_owner' && B.mayAttach(one, { browserKey: KB, pinned: true }).code === 'not_owner' && B.mayAttach(one, { browserKey: KB, by: 'user' }).code === 'not_owner' && B.mayAttach(one, { browserKey: KA + '.1' }).ok, 'admission reads `owner` only (sharing:instance on a record kept to one conversation admits nobody else); a pin or a `by:\'user\'` is NO input (the user\'s pick writes the list instead); a helper is its conversation');
  // join vs launch
  const T = [[null, false, 'launch'], [{ state: 'stopped' }, false, 'launch'], [{ state: 'failed' }, false, 'launch'], [{ state: 'stopped' }, true, 'wait'], [{ state: 'starting' }, true, 'wait'], [{ state: 'starting' }, false, 'join'], [{ state: 'ready' }, false, 'join'], [{ state: 'ready' }, true, 'join']];
  const bad = T.filter(([record, starting, want]) => B.joinOrLaunch({ record, starting }) !== want);
  ok(!bad.length, `joinOrLaunch: a live record is JOINED, a launch in flight is WAITED on (a half-started record is never handed out), only a dead one LAUNCHES (${T.length} rows)`, bad);
  // lane browser-windows (U2, 2026-10-01): NO DRIVER CLAIM between conversations — the 90 s "one driver at a time" verdict,
  // its hold and its `browser_busy` words are GONE (measured: one daemon per conversation, a window per holder)
  ok(!('driveVerdict' in B) && !('browserBusyRefusal' in B) && !('DRIVE_HOLD_MS' in B), 'the drive claim is deleted: no driveVerdict, no browserBusyRefusal, no DRIVE_HOLD_MS — a window has one holder, the only pause is the user\'s takeover of THAT window');
  // the window mates: who a takeover of a lease's window takes WITH it
  const INST = '1900000000000';
  const LW = [{ profileId: 'bp-0000c0b1', browserKey: KA, windowIn: INST }, { profileId: 'bp-0000c0b1', browserKey: KB, windowIn: INST }, { profileId: 'bp-0000c0b1', browserKey: KC }, { profileId: 'bp-0000c0b1', browserKey: KD, windowIn: '17' }, { profileId: 'bp-0000c0b2', browserKey: KE }];
  const mates = (bk, inst = INST) => WIN.windowMates({ leases: LW, profileId: 'bp-0000c0b1', browserKey: bk, instance: inst }).map((l) => l.browserKey).sort().join(',');
  const MT = [['own window (KA)', KA, INST, ''], ['own window (KB)', KB, INST, ''], ['legacy shared (KC) — the other legacy + a previous run\'s', KC, INST, [KC, KD].filter((x) => x !== KC).join(',')], ['a previous run\'s window (KD) is no window now', KD, INST, KC], ['no browser run known ⇒ everyone (fail closed)', KA, null, [KB, KC, KD].sort().join(',')]];
  const badM = MT.filter(([, bk, inst, want]) => mates(bk, inst) !== want).map(([n, bk, inst]) => `${n}: ${mates(bk, inst)}`);
  ok(!badM.length, `windowMates: ${MT.length} rows — a lease in its own window takes nobody with it; one in an older run's shared window takes the others still there; another profile never; no run known ⇒ all (fail closed)`, badM);
  ok(WIN.hasOwnWindow({ windowIn: INST }, INST) && !WIN.hasOwnWindow({ windowIn: '17' }, INST) && !WIN.hasOwnWindow({}, INST) && !WIN.hasOwnWindow({ windowIn: INST }, null) && WIN.instanceOf({ startedAt: 1900000000000 }) === INST && WIN.instanceOf({ startedAt: 0 }) === null && WIN.instanceOf(null) === null, 'hasOwnWindow / instanceOf: a window counts only in the browser run it was opened in (a restart has none of it)');
  // the create rewrite: a lease's new tab opens in an unfocused window of its own
  const RW = [[{ url: 'about:blank' }, true, { url: 'about:blank', newWindow: true, focus: false }], [{ url: 'x', focus: true }, true, { url: 'x', focus: true, newWindow: true }], [{ url: 'x', newWindow: true }, false, null], [{ url: 'x', hidden: true }, false, null], [{ url: 'x', forTab: true }, true, { url: 'x', forTab: true, newWindow: true, focus: false }], [{ url: 'x', background: true }, true, { url: 'x', background: true, newWindow: true, focus: false }], [null, true, { newWindow: true, focus: false }]];
  const badR = RW.filter(([p0, rw, want]) => { const o = WIN.ownWindowParams(p0); return o.rewritten !== rw || (want && JSON.stringify(o.params) !== JSON.stringify(want)); }).map(([p0]) => JSON.stringify(p0));
  ok(!badR.length && JSON.stringify(WIN.windowCreateParams('')) === JSON.stringify({ url: 'about:blank', newWindow: true, focus: false }), `ownWindowParams: ${RW.length} rows — a plain create becomes newWindow + focus:false (an asked focus kept), a window / hidden create is left as written, a tab-type one is placed like a page (verify r1 ②: measured in another holder's window); VibeSpace's own creates the same`, badR);
  const p0 = { url: 'x' }; WIN.ownWindowParams(p0);
  ok(JSON.stringify(p0) === JSON.stringify({ url: 'x' }), 'ownWindowParams never mutates the params it judges');
  // the labels of a tab VibeSpace opened (the binary labels only its own creates)
  let labs = {}; for (let i = 0; i < 40; i++) labs = WIN.withTabLabel(labs, 'l' + i, 'abc' + i);
  ok(Object.keys(labs).length === WIN.TAB_LABELS_MAX && labs.l39 === 'ABC39' && !labs.l0 && WIN.labelTargetOf(labs, 'l39') === 'ABC39' && WIN.labelTargetOf(labs, 'nope') === null && WIN.withLabelsOnRows([{ targetId: 'abc39' }, { targetId: 'abc39', label: 'mine' }, { targetId: 'zz' }], labs).map((x) => x.label || '').join() === 'l39,mine,', 'tab labels: the lease\'s map is bounded (the oldest goes), resolves a label to its tab and lays it on the rows that carry none (the binary\'s own label wins)');
  // the watch mode of a tab the live view only watches
  ok(WIN.watchModeVerdict({ framesSeen: 3, waitedMs: 0 }).mode === 'screencast' && WIN.watchModeVerdict({ framesSeen: 0, waitedMs: 200 }).waiting === true && WIN.watchModeVerdict({ framesSeen: 0, waitedMs: WIN.WATCH_FIRST_FRAME_MS }).mode === 'polling' && WIN.WATCH_POLL_MS >= 500, 'watchModeVerdict: the screencast while it paints, polling once it stayed silent a second; polling ≤ 2 fps');
  // U4: the machine's ceiling of running browsers is a setting
  const MR = [[undefined, 6], [null, 6], ['', 6], ['junk', 6], [0, 1], [-3, 1], [1, 1], ['9', 9], [9.4, 9], [32, 32], [500, 32]];
  const badMR = MR.filter(([v, want]) => WIN.maxRunningOf(v, 6) !== want).map(([v]) => String(v));
  ok(!badMR.length && WIN.maxRunningOf(undefined, LIMITS.CONCURRENT_CAP) === LIMITS.CONCURRENT_CAP, `maxRunningOf: ${MR.length} rows — unset/junk ⇒ the keeper's CONCURRENT_CAP (6), clamped to [${WIN.MAX_RUNNING_MIN}, ${WIN.MAX_RUNNING_MAX}]`, badMR);
  // the measurement the rules stand on, pinned like the cloak proof
  const PF = WIN.WINDOWS_PROOF;
  const rowOf = (re) => PF.rows.find((r) => re.test(r.fact)) || {};
  ok(PF.status === 'measured' && PF.measured === '2026-10-01' && PF.agentBrowser === '0.38.2' && PF.remeasured === '2026-10-10' && /154\.0\.8037\.57/.test(PF.chrome) && Object.isFrozen(PF) && PF.rows.length >= 18 && /4 ms/.test(rowOf(/another conversation's `get title`/).headless) && /4504 ms/.test(rowOf(/same conversation's `get title`/).headless) && /0 · hidden · 0/.test(rowOf(/not on show in a shared window/).hidden) && /60 · visible/.test(rowOf(/second window/).hidden) && /last focused|newest focused/.test(rowOf(/plain createTarget/).headless) && /opener/.test(rowOf(/page opens/).hidden) && /^no/.test(rowOf(/can name a window/).headless) && /fresh/.test(rowOf(/captureScreenshot of a hidden tab/).hidden) && /^60 · visible · false/.test(rowOf(/WITHOUT the focus/).hidden) && /answered .* 0 frames follow/.test(rowOf(/mouse press on a background tab/).hidden) && /real desktop/i.test(PF.notMeasured), 'WINDOWS_PROOF: dated, versioned (agent-browser 0.38.1 + Chrome 154.0.8037.57; re-measured on the 0.38.2 pin 2026-10-10 — a table bump re-measures it), both modes — one daemon per conversation (4 ms vs 4504 ms), a hidden shared-window tab at 0 fps, a second window\'s tab at 60 fps, no create into a chosen window, popups in their opener\'s window, a fresh capture of a hidden tab; U0b: a NON-FOCUSED window\'s foreground tab paints at 60 fps under Xvfb, a background tab takes a click but paints nothing; the real desktop named as NOT measured');
  // the cap: a shared browser counts once in EACH conversation that holds a lease on it, and once on the machine
  const profiles = [{ id: 'bp-0000c0b1', label: 'Work', owner: { kind: 'instance', id: null } }, { id: 'bp-0000c0b2', label: 'Other', owner: { kind: 'instance', id: null } }, eph];
  const browsers = { 'bp-0000c0b1': { profileId: 'bp-0000c0b1', state: 'ready' }, 'bp-0000c0b2': { profileId: 'bp-0000c0b2', state: 'stopped' }, 'bp-0000c0a3': { profileId: 'bp-0000c0a3', state: 'ready' } };
  const leases = [{ profileId: 'bp-0000c0b1', browserKey: KA }, { profileId: 'bp-0000c0b1', browserKey: KB + '.1' }, { profileId: 'bp-0000c0b2', browserKey: KA }, { profileId: 'bp-0000c0a3', browserKey: KA }];
  const cnt = (bk) => B.conversationOwnCount({ browsers, profiles, leases, browserKey: bk });
  ok(cnt(KA) === 2 && cnt(KB) === 1 && cnt(KC) === 0 && B.ceilingVerdict(Object.values(browsers), leases, { CONCURRENT_CAP: 3 }) === null, 'the cap: the shared Work browser counts in BOTH conversations holding it (KA 2 = Work + its own; KB 1 = Work through a helper), a stopped one in none, and ONCE on the machine (2 live < 3)');
  // ── "WHO CAN USE IT" IS A LIST (2026-09-27) ──
  // whoMayUse: THE ONE READER over every shape that can be on disk
  const P = (owner, extra = {}) => ({ id: 'bp-0000c0c1', label: 'work', owner, ...extra });
  const SHAPES = [
    ['instance', P({ kind: 'instance', id: null }), { mode: 'all' }],
    ['owner missing', P(undefined), { mode: 'all' }],
    ['owner null', P(null), { mode: 'all' }],
    ['pre-list session (a child key)', P({ kind: 'session', id: KA + '.2' }), { mode: 'only', who: [{ kind: 'session', id: KA }] }],
    ['pre-list task', P({ kind: 'task', id: 'T-G' }), { mode: 'only', who: [{ kind: 'task', id: 'T-G' }] }],
    ['a list', P({ kind: 'only', who: [{ kind: 'session', id: KA }, { kind: 'task', id: 'T-G' }] }), { mode: 'only', who: [{ kind: 'session', id: KA }, { kind: 'task', id: 'T-G' }] }],
    ['a list with junk rows (dropped), a duplicate and a child key', P({ kind: 'only', who: [{ kind: 'session', id: KA }, { kind: 'bogus', id: 'x' }, { kind: 'session', id: 'not-a-key' }, { kind: 'task', id: 'bad id!' }, { kind: 'session', id: KA + '.3' }, null, 5] }), { mode: 'only', who: [{ kind: 'session', id: KA }] }],
    ['ephemeral', { ...eph }, { mode: 'only', who: [{ kind: 'session', id: KA }], ephemeral: true }],
    ['legacy (even with a list)', P({ kind: 'only', who: [{ kind: 'session', id: KA }] }, { legacy: true }), { mode: 'all' }],
    ['a junk kind', P({ kind: 'everyone' }), { mode: 'unknown' }],
    ['a string owner', P('instance'), { mode: 'unknown' }],
    ['a list that is not an array', P({ kind: 'only', who: 'bk-0000c001' }), { mode: 'unknown' }],
    ['a pre-list session with a malformed key', P({ kind: 'session', id: 'nope' }), { mode: 'unknown' }],
  ];
  const badShapes = SHAPES.filter(([, p, want]) => JSON.stringify(B.whoMayUse(p)) !== JSON.stringify(want)).map(([n, p]) => [n, B.whoMayUse(p)]);
  ok(!badShapes.length && B.whoMayUse(null) === null, `whoMayUse over every stored shape (${SHAPES.length}): instance / missing / null ⇒ all; the pre-list single shapes ⇒ a one-row list; a list normalized (junk rows DROPPED, duplicates and child keys collapsed); ephemeral ⇒ its conversation; legacy ⇒ all; anything else ⇒ unknown (fail closed)`, badShapes);
  // THE TABLE: profile {all, only[s:A], only[t:G], only[s:A,t:G], only[t:deleted], unknown} × asker {A, A.3, B, B in G, B in H, B unreadable}
  const PROFS = {
    all: P({ kind: 'instance', id: null }),
    'only[s:A]': P({ kind: 'only', who: [{ kind: 'session', id: KA }] }),
    'only[t:G]': P({ kind: 'only', who: [{ kind: 'task', id: 'T-G' }] }),
    'only[s:A,t:G]': P({ kind: 'only', who: [{ kind: 'session', id: KA }, { kind: 'task', id: 'T-G' }] }),
    'only[t:deleted]': P({ kind: 'only', who: [{ kind: 'task', id: 'T-GONE' }] }),
    unknown: P({ kind: 'everyone' }),
  };
  const ASKERS = {
    A: { browserKey: KA }, 'A.3': { browserKey: KA + '.3' }, B: { browserKey: KB }, 'B in G': { browserKey: KB, taskIds: ['T-G'] },
    'B in H': { browserKey: KB, taskIds: ['T-H'] }, 'B unreadable': { browserKey: KB, taskIds: [], groupsUnreadable: true },
  };
  const WANT = { // ok:via or the refusal code — 36 cells, each named
    all: { A: 'ok:all', 'A.3': 'ok:all', B: 'ok:all', 'B in G': 'ok:all', 'B in H': 'ok:all', 'B unreadable': 'ok:all' },
    'only[s:A]': { A: 'ok:conversation', 'A.3': 'ok:conversation', B: 'not_owner', 'B in G': 'not_owner', 'B in H': 'not_owner', 'B unreadable': 'not_owner' },
    'only[t:G]': { A: 'not_owner', 'A.3': 'not_owner', B: 'not_owner', 'B in G': 'ok:task', 'B in H': 'not_owner', 'B unreadable': 'groups_unreadable' },
    'only[s:A,t:G]': { A: 'ok:conversation', 'A.3': 'ok:conversation', B: 'not_owner', 'B in G': 'ok:task', 'B in H': 'not_owner', 'B unreadable': 'groups_unreadable' },
    'only[t:deleted]': { A: 'not_owner', 'A.3': 'not_owner', B: 'not_owner', 'B in G': 'not_owner', 'B in H': 'not_owner', 'B unreadable': 'groups_unreadable' },
    unknown: { A: 'not_owner', 'A.3': 'not_owner', B: 'not_owner', 'B in G': 'not_owner', 'B in H': 'not_owner', 'B unreadable': 'not_owner' },
  };
  const tableOf = (Bm) => { const cells = []; for (const [pn, p] of Object.entries(PROFS)) for (const [an, a] of Object.entries(ASKERS)) { const v = Bm.mayAttach(p, a); cells.push([`${pn} × ${an}`, v.ok ? 'ok:' + v.via : v.code, WANT[pn][an]]); } return cells; };
  const cells = tableOf(B);
  const wrongCells = cells.filter(([, got, want]) => got !== want);
  ok(cells.length === 36 && !wrongCells.length, `THE TABLE: ${cells.length} cells (6 profiles × 6 askers) — a conversation by key (a helper = its parent), a Task Group by the asker's LIVE groups, an unreadable store with a Task Group row ⇒ groups_unreadable (never not_owner), a dead Task Group admits nobody, an unknown shape refuses everyone`, wrongCells);
  ok(B.mayAttach(PROFS['only[t:G]'], ASKERS['B in G']).taskId === 'T-G' && B.mayAttach(eph, { browserKey: KA }).via === 'own' && B.mayAttach(eph, { browserKey: KB }).code === 'not_attachable' && B.mayAttach(null, { browserKey: KA }).code === 'not-found', 'a Task Group admission names its group; an ephemeral record admits its own conversation (via own) and refuses anyone else (not_attachable); no record ⇒ not-found');
  // the whole-list stamp
  const sA = B.useStamp(PROFS['only[s:A,t:G]']);
  ok(sA === B.useStamp(P({ kind: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', id: KA + '.7' }] })) && sA !== B.useStamp(PROFS['only[s:A]']) && B.useStamp(PROFS.all) === '["m","all"]' && B.useStamp(P({ kind: 'session', id: KA })) === B.useStamp(PROFS['only[s:A]']), 'useStamp: the order a list is drawn in and a child key vs its parent are the SAME stamp; a moved row is not; a pre-list single owner stamps as its one-row list', sA);
  const bv = B.useBaseVerdict(PROFS['only[s:A,t:G]'], B.useStamp(PROFS['only[s:A]']));
  ok(B.useBaseVerdict(PROFS.all, undefined).ok && B.useBaseVerdict(PROFS.all, B.useStamp(PROFS.all)).ok && bv.code === 'list-changed' && bv.added.join() === 'task:T-G' && !bv.removed.length && B.useBaseVerdict(PROFS.all, 7).code === 'bad-request', 'useBaseVerdict: no base = unconditional (a script); the current stamp = ok; a moved list ⇒ list-changed naming the rows that differ (added task:T-G); a non-string base is refused', bv);
  // the write's verdicts
  const kn = (keys) => (k) => keys.includes(k);
  const PV = (p, use, keys = [], tasks = ['T-G', 'T-H']) => B.usePatchVerdict({ profile: p, use, knownTask: (id) => tasks.includes(id), knownKey: kn(keys) });
  const pv1 = PV(PROFS.all, { mode: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', key: KB + '.2' }, { kind: 'session', key: KB }, { kind: 'task', id: 'T-G' }] }, [KB]);
  ok(pv1.ok && JSON.stringify(pv1.owner) === JSON.stringify({ kind: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', id: KB }] }), 'usePatchVerdict: a list is written deduplicated, a helper\'s key stored as its conversation\'s', pv1);
  const PVT = [
    ['all', PV(PROFS['only[s:A]'], { mode: 'all' }), 'ok'],
    ['empty list', PV(PROFS.all, { mode: 'only', who: [] }), 'empty_list'],
    ['too many', PV(PROFS.all, { mode: 'only', who: Array.from({ length: B.WHO_MAX + 1 }, (_, i) => ({ kind: 'session', key: 'bk-' + (0xc100 + i).toString(16).padStart(8, '0') })) }, Array.from({ length: B.WHO_MAX + 1 }, (_, i) => 'bk-' + (0xc100 + i).toString(16).padStart(8, '0'))), 'too_many'],
    ['an unknown row kind', PV(PROFS.all, { mode: 'only', who: [{ kind: 'everyone' }] }), 'bad-request'],
    ['an unknown mode', PV(PROFS.all, { mode: 'some' }), 'bad-request'],
    ['who not a list', PV(PROFS.all, { mode: 'only', who: 'x' }), 'bad-request'],
    ['a malformed key', PV(PROFS.all, { mode: 'only', who: [{ kind: 'session', key: 'nope' }] }), 'bad-request'],
    ['an unknown task', PV(PROFS.all, { mode: 'only', who: [{ kind: 'task', id: 'T-NEW' }] }), 'unknown_task'],
    ['a dead task KEPT (already in the list)', PV(PROFS['only[t:deleted]'], { mode: 'only', who: [{ kind: 'task', id: 'T-GONE' }] }), 'ok'],
    ['an unknown conversation', PV(PROFS.all, { mode: 'only', who: [{ kind: 'session', key: KC }] }, [KA]), 'unknown_conversation'],
    ['a stopped conversation KEPT (already in the list)', PV(PROFS['only[s:A]'], { mode: 'only', who: [{ kind: 'session', key: KA }] }, []), 'ok'],
    ['a picked session left unresolved', PV(PROFS.all, { mode: 'only', who: [{ kind: 'session', session: 'sess-1' }] }), 'bad-request'],
    ['the legacy record', PV({ ...PROFS.all, legacy: true }, { mode: 'all' }), 'bad-request'],
    ['an ephemeral record', PV(eph, { mode: 'all' }), 'not_editable'],
    ['no record', PV(null, { mode: 'all' }), 'not-found'],
  ];
  const badPV = PVT.filter(([, v, want]) => (v.ok ? 'ok' : v.code) !== want).map(([n, v, want]) => [n, v.code || 'ok', want]);
  ok(!badPV.length, `usePatchVerdict: ${PVT.length} rows — empty_list, too_many (> ${B.WHO_MAX} after dedup), unknown kinds / modes / malformed ids refused by name, a task the store does not list / a key this profile never met refused (unless ALREADY in the list: a kept dead row), a picked session must be resolved first, legacy / ephemeral / missing records refused`, badPV);
  ok(B.useShapeVerdict({ mode: 'only', who: [{ kind: 'session', session: 'sess-1' }] }).rows[0].session === 'sess-1' && B.useShapeVerdict({ scope: 'one' }).code === 'bad-request', 'useShapeVerdict keeps a picked live session as a `session` row for the resolver; the 2.369.194 body shape is not a `use`');
  // the pick writes the list
  ok(JSON.stringify(B.ownerWithConversation(PROFS['only[t:G]'], KB + '.1')) === JSON.stringify({ kind: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', id: KB }] }) && B.ownerWithConversation(PROFS['only[s:A]'], KA) === null && B.ownerWithConversation(PROFS.all, KB) === null && B.ownerWithConversation(eph, KB) === null, 'ownerWithConversation: the list + the picked conversation (a helper → its parent); nothing to write when it is listed, the profile is everyone\'s, or the record has no list');
  // the agent's view: whether ITS conversation may, and through what — never the list, never another conversation's key
  const av = (p, a) => B.agentUseOf(p, a);
  ok(JSON.stringify(av(PROFS.all, ASKERS.B)) === JSON.stringify({ mode: 'all', you: true, via: 'all' }) && av(PROFS['only[s:A]'], ASKERS.A).via === 'conversation' && av(PROFS['only[t:G]'], ASKERS['B in G']).via === 'task' && av(PROFS['only[t:G]'], ASKERS.B).you === false && av(PROFS['only[t:G]'], ASKERS['B unreadable']).unreadable === true, 'agentUseOf: all / yours (through the conversation) / yours (through its Task Group) / not yours / unknown for yours (the Task Group list unreadable)');
  const apv = B.agentProfileView({ ...PROFS['only[s:A,t:G]'], createdBy: KA, scopeAt: 5, proxy: null }, ASKERS['B in G'], { mediated: false, owner: { leak: 1 }, use: { leak: 1 } });
  ok(!('owner' in apv) && !('createdBy' in apv) && !('scopeAt' in apv) && apv.use.you === true && apv.use.via === 'task' && !JSON.stringify(apv).includes(KA) && apv.scope === 'only', 'agentProfileView: the record MINUS owner / createdBy / scopeAt (and never the list) PLUS use for the asker — no other conversation\'s key anywhere in it', apv);
  // the words census (every refusal the ruling touches)
  const pinnedForm = { error: `your pinned profile "work" did not open: ${B.notOwnerRefusal({ label: 'work' }).error} — tell the user; nothing else was opened instead`, remedy: '' };
  const texts = [B.notOwnerRefusal({ label: 'work' }), B.groupsUnreadableRefusal({ label: 'work' }), pinnedForm, B.ephemeralHolderRefusal({ label: 'work', holderPid: 5, holderName: 'Old chat' })].flatMap((r) => [r.error, r.remedy || '']);
  ok(texts.length === 8 && texts.every((x) => !CMDLINE_RE.test(x)), 'WORDS: not_owner (ONE form now), groups_unreadable, the pinned form, the pre-ruling holder\'s profile_locked (browser_busy is gone with the drive claim) — no command line in any error or remedy', texts.filter((x) => CMDLINE_RE.test(x)));
  ok(/kept to some of the user's conversations and Task Groups/.test(texts[0]) && /"Who can use it" in the Agent browser panel \(Change…\)/.test(texts[0]) && /"All agents"/.test(texts[0]) && /Change… → add this conversation, or All agents/.test(texts[1]) && /run the same command again once/.test(texts[2]) && /press Stop/.test(B.ephemeralHolderRefusal({ label: 'w' }).error), '…each names the button: "Who can use it" → Change… in the Agent browser panel, or "All agents" (lane everyone-principal); groups_unreadable says run it again once; Stop on that browser');
  ok(/opens "work"/.test(B.pinApplyNotice({ label: 'work', liveBrowser: true })) && !/RELAUNCHES/.test(B.pinApplyNotice({ label: 'work', liveBrowser: true })) && /never relaunched/.test(B.pinApplyNotice({ label: 'work', liveBrowser: true })), 'the pin\'s sentence: the next command OPENS the profile, nothing is relaunched');
  // resolveHandle: a pin opens only an EMPTY set (an attachment the agent made itself is never displaced)
  const set0 = B.attachmentsFor({ leases: [], profiles: [r0], browserKey: KB, pin: { profileId: r0.id } });
  const set1 = B.attachmentsFor({ leases: [{ profileId: 'bp-0000c0a2', browserKey: KB, since: 1 }], profiles: [r0, one], browserKey: KB, pin: { profileId: r0.id } });
  const setGone = B.attachmentsFor({ leases: [], profiles: [], browserKey: KB, pin: { profileId: r0.id } });
  ok(B.resolveHandle({ set: set0 }).kind === 'pin' && B.resolveHandle({ set: set0 }).profileId === r0.id && B.resolveHandle({ set: set1 }).kind === 'attachment' && B.resolveHandle({ set: setGone }).kind === 'none' && set0.fingerprint === B.attachmentsFor({ leases: [], profiles: [r0], browserKey: KB }).fingerprint, 'resolveHandle: an empty set with a pin ⇒ kind pin; an attachment the agent made stays the target; a pin on a profile that is gone opens nothing; the pin alone never moves the fingerprint (no one-time refusal for it)');
}

// ═══ ③a THE LATE KEY: the verdict's order + its words (PURE — the lineage of a keyless / forked / remote session) ═══
console.log('— ③a the late-key verdict (lineage) + its words (PURE)');
{
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

}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

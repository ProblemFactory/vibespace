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
//      ③f (verify r2): the late key restores the pick its spawn WITNESSED at the start (`browserPinAtStart`) — a default
//      set later never reaches it; the parity table spawn ↔ late; CONTROLS the ladder read at the mint, the cap read live.
//      ③f (2.369.196, the list integration): the pin is a PREFERENCE — verify r1's dated pin (`latePinAt`) and r3's
//      "a pin dated 0 authorizes nothing" are gone with the rule they served; a restored witness (even the user's own
//      `chosen` pick) never edits any profile's "Who can use it", the list answers; CONTROL a restorePin that adds it.
// ~6 s, port 0, scratch dirs only, no real browser, no vendor call.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, deadPort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const B = require('../src/browser-profiles.js');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const S = require('../src/browser-stream.js');
const WIN = require('../src/browser-windows.js'); // lane browser-windows: a window per holder (PURE)
const LIMITS = require('../src/keeper-limits.js');
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
  ok(PF.status === 'measured' && PF.measured === '2026-10-01' && PF.agentBrowser === '0.38.1' && /154\.0\.8037\.57/.test(PF.chrome) && Object.isFrozen(PF) && PF.rows.length >= 18 && /4 ms/.test(rowOf(/another conversation's `get title`/).headless) && /4504 ms/.test(rowOf(/same conversation's `get title`/).headless) && /0 · hidden · 0/.test(rowOf(/not on show in a shared window/).hidden) && /60 · visible/.test(rowOf(/second window/).hidden) && /last focused|newest focused/.test(rowOf(/plain createTarget/).headless) && /opener/.test(rowOf(/page opens/).hidden) && /^no/.test(rowOf(/can name a window/).headless) && /fresh/.test(rowOf(/captureScreenshot of a hidden tab/).hidden) && /^60 · visible · false/.test(rowOf(/WITHOUT the focus/).hidden) && /answered .* 0 frames follow/.test(rowOf(/mouse press on a background tab/).hidden) && /real desktop/i.test(PF.notMeasured), 'WINDOWS_PROOF: dated, versioned (agent-browser 0.38.1 + Chrome 154.0.8037.57), both modes — one daemon per conversation (4 ms vs 4504 ms), a hidden shared-window tab at 0 fps, a second window\'s tab at 60 fps, no create into a chosen window, popups in their opener\'s window, a fresh capture of a hidden tab; U0b: a NON-FOCUSED window\'s foreground tab paints at 60 fps under Xvfb, a background tab takes a click but paints nothing; the real desktop named as NOT measured');
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
if (a === 'get' && b === 'cdp-url') { const s0 = read(); if (!(s0 && alive(s0.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } if (s && s.profile) { try { fs.unlinkSync(path.join(s.profile, 'SingletonLock.fake')); } catch { } } out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'close' && b !== '--all') { log('closes.log', { verb: 'close', ns, sess, cdp }); out({ success: true, data: { closed: 1 } }); process.exit(0); }
if (a === 'tab' && /^[0-9A-F]{32}$/.test(String(b || ''))) { if (fs.existsSync(path.join(st, 'refuse-bind'))) { out({ success: false, error: 'fake: no such tab' }); process.exit(1); } const s = daemon('tab'); if (s.refused) { out({ success: false, error: s.refused }); process.exit(1); } log('binds.log', { ns, sess, cdp, targetId: b }); out({ success: true, data: { targetId: b } }); process.exit(0); }
if (a === 'tab' && (b === 'close' || b === 'new')) { log('closes.log', { verb: 'tab ' + b, ns, sess, cdp }); out({ success: true, data: { closed: 1 } }); process.exit(0); }
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
// "Who can use it" (2026-09-27): the task store's live membership by browser key (+ keys whose store read THROWS) and
// the Task Groups it lists — the wiring's `taskIdsForKey` / `taskInfo` and the routes' `tasksForSession`
const groupsOf = new Map(), unreadable = new Set();
const TASKS = new Map([['T-G', { title: 'Ops', archived: false }], ['T-H', { title: 'Other group', archived: false }]]);
const taskDeps = {
  // the wiring's rule verbatim (mounts-plugins-wiring.js taskIdsForKey): the LIVE session carrying the key, else
  // `live: false` — a stopped conversation's membership is not readable now and is not "no groups" (verify 2026-09-28)
  taskIdsForKey: (bk) => { let hit = null; for (const [, x] of active) if (x && x._browserKey === bk) { hit = x; break; } if (!hit) return { ids: [], unreadable: false, live: false }; if (unreadable.has(bk)) throw new Error('fake: the task store is unreadable'); return { ids: groupsOf.get(bk) || [], unreadable: false }; },
  taskInfo: (id) => TASKS.get(id) || null,
};
// identity verify r2 (2026-09-28): the wiring's rule verbatim — the keys carried by live sessions on ANOTHER machine
const remoteKeys = () => new Set([...active.values()].filter((x) => x && x._browserKey && (x.hostId || x.host || x._browserVariant === 'H')).map((x) => x._browserKey));
const mkKeeper = (Kmod, extra = {}) => Kmod.create({ ...taskDeps, dataDir: DATA, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => live, remoteKeys, runtime: F.createBrowserRuntime({ env }), facts: F.createBrowserFacts({ env }), log: { log() { }, warn() { }, error() { } }, install: false, now: () => clock, conversationFacts: (bk) => facts[bk] || { turn: null, name: null }, ...extra });
const lim = { ...require('../src/keeper-limits.js') }; // mutable: the ceiling leg lowers the machine ceiling for one assert
// lane browser-windows: this keeper's browser has no CDP to open windows over (the fake binary) — every lease here stays in
// the browser's shared window (the legacy shape: a takeover still takes the others in it WITH it); the per-window legs
// below run on a second keeper whose window seam answers
const NO_WINDOW = async () => ({ ok: false, error: 'fake: no CDP endpoint' });
const k = mkKeeper(K, { limits: lim, openWindow: NO_WINDOW });
const M = mutantCopies('browser-share-model', REPO);
const be = BE.create({ dataDir: DATA, homeDir: HOME, serverNotice: null, telemetry: null, log: { warn() { }, log() { } }, env: { XDG_RUNTIME_DIR: XDG } });
const tok = (c) => 'vsst_' + String(c).repeat(24);
const mkSession = (id, bk, name, { rungD = false } = {}) => {
  const s = { agentToken: tok(id.slice(-1)), _browserKey: bk, _browserVariant: null, name, webuiName: name, mode: 'chat', createdAt: clock };
  if (rungD) { const e = be.envFor({ browserKey: bk, integrationOn: true, remote: false, cwd: ROOT }); s._browserVariant = e.variant; s._browserEnv = e.pairs.slice(); s._cfg = e.configPath; }
  return s;
};
const sA = mkSession('sess-1', KA, 'First chat'), sB = mkSession('sess-2', KB, 'Second chat', { rungD: true }), sC = mkSession('sess-3', KC, 'Third chat'), sD = mkSession('sess-4', KD, 'Fourth chat'), sE = mkSession('sess-5', KE, 'Fifth chat (a fork)'), sF = mkSession('sess-6', KF, 'Sixth chat', { rungD: true });
const active = new Map([['sess-1', sA], ['sess-2', sB], ['sess-3', sC], ['sess-4', sD], ['sess-6', sF]]);
for (const [, s] of active) facts[s._browserKey] = { turn: 'idle', name: s.name };
const notices = [];
const ctxFor = (kk) => ({ keeper: kk, activeSessions: active, browserEnv: () => be, adoptRoots: { homeDir: HOME, dataDir: DATA }, notice: (sid, s, n) => notices.push({ sid, n }), persistPin: () => { },
  tasksForSession: (s) => { if (unreadable.has(s && s._browserKey)) throw new Error('fake: the task store is unreadable'); return groupsOf.get(s && s._browserKey) || []; } });
const bindings = require('../src/server/browser-bindings.js').create({ dataDir: DATA, log: { warn() { }, log() { } } });
const R = require('../src/routes/browser.js');
R.setup(ctxFor(k));
const TR = require('../src/routes/browser-trace.js');
const trace = require('../src/server/browser-trace.js').create({ dataDir: DATA, homeDir: HOME, keeper: k, bridge: null, serverSetting: () => undefined, broadcast: () => { }, log: { log() { }, warn() { }, error() { } } });
TR.setup({ keeper: k, trace, activeSessions: active, bindings, releaseProfile: (id) => R.releaseProfile(id), unpinProfile: (id) => R.unpinProfile(id), notice: (sid, s, n) => notices.push({ sid, n }), keyForPickedSession: (id) => R.keyForPickedSession(id) });
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
  // identity r3: `new` answers the AGENT's view (no owner / createdBy on the wire); the record the keeper holds is everyone's, created by conversation 1
  ok(r.status === 200 && work && !('owner' in work) && !('createdBy' in work) && work.scope === 'all' && work.use && work.use.mode === 'all' && work.use.you === true && k.profile(work.id).owner.kind === 'instance' && k.profile(work.id).createdBy === KA, 'path A: conversation 1\'s agent `new work` ⇒ a profile every conversation can use (created by conversation 1; the answer is the agent\'s view)', r.json);
  r = await j('POST', '/api/agent/browser/use', { profile: 'work' }, as(sA));
  const envA = r.json && r.json.env;
  ok(r.status === 200 && logOf('launches.log').length === 1 && logOf('launches.log')[0].profile === work.dir, 'conversation 1 attaches: the keeper launched the ONE browser on work\'s directory');
  r = await j('POST', '/api/agent/browser/use', { profile: 'work' }, as(sD));
  const envD = r.json && r.json.env;
  ok(r.status === 200 && r.json.others === 1 && logOf('launches.log').length === 1 && Array.isArray(envD) && envD.some((kv) => kv === `AGENT_BROWSER_CDP=ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-vs-${work.id}`) && !envD.some((kv) => kv.startsWith('AGENT_BROWSER_PROFILE=')), 'path A: conversation 4 `use work` is ADMITTED (was not_owner) and JOINS the running browser — the same CDP endpoint, others 1, still ONE launch', r.json);
  const cA = await runAs(envA, ['open', 'https://work.example/a']), cD = await runAs(envD, ['open', 'https://work.example/d']);
  ok(cA.status === 0 && cD.status === 0 && logOf('launches.log').length === 1 && !logOf('refused.log').length && logOf('connects.log').length === 2, 'both conversations\' commands run over the CDP url — two connections, one browser, no SingletonLock');

  // ── path B: the USER pins work for conversation 2 (rung D) in Session properties while conversation 1 runs it ──
  ok(sB._browserVariant === 'D' && be.resolvedProfileDir(KB) === be.scratchDirFor(KB), 'path B setup: conversation 2 spawned on rung D, its own config names only its OWN kept directory (lane browser-resume §3.9 — never a profile\'s)');
  r = await j('POST', '/api/browser/pin', { sessionId: 'sess-2', profile: 'work' });
  ok(r.status === 200 && r.json.pin && r.json.pin.profileId === work.id && r.json.pin.by === 'user' && be.resolvedProfileDir(KB) === be.scratchDirFor(KB) && /opens "work"/.test(r.json.appliesFrom), 'path B: the user\'s pin names the profile and re-points NOTHING at its directory (the config still names only the conversation\'s own kept one)', r.json);
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://work.example/b'], wrapper: true }, as(sB));
  const envB = r.json && r.json.env;
  ok(r.status === 200 && r.json.kind === 'attachment' && Array.isArray(envB) && envB.some((kv) => kv === `AGENT_BROWSER_CDP=ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-vs-${work.id}`) && logOf('launches.log').length === 1 && !k.ephemeralFor(KB), 'path B: conversation 2\'s first bare command opens its pin THROUGH THE KEEPER — kind attachment, the same browser\'s CDP url, NO second launch, no temporary browser started', r.json);
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
    ok(cp2 && cp2.by === 'agent' && cp2.origin === 'conversation', 'an agent\'s pin copied to a fork is still an agent\'s (a copy never launders who pinned)');
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
    ok(n === 1 && be.resolvedProfileDir(KF) === be.scratchDirFor(KF) && k.pinFor(KF) && k.pinFor(KF).profileId === work.id, 'the boot conversion puts the pre-ruling pinned conversation back on its own browser (the pin stays — it is the default attachment now)');
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

  // ── lane browser-windows (U2): NO DRIVER CLAIM — two conversations act on one profile's browser at the same time ──
  facts[KA].turn = 'running'; facts[KB].turn = 'running'; facts[KD].turn = 'idle';
  let v = k.resolveFor({ browserKey: KA, handle: 'work' });
  ok(v.ok && v.kind === 'attachment' && !('drivers' in k.list()), 'conversation 1 resolves on work; the digest carries no `drivers` (the claim is gone — nothing to relay)');
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sB));
  ok(r.status === 200 && r.json.kind === 'attachment' && r.json.code === undefined, 'conversation 2\'s command while conversation 1 is mid-turn on the SAME browser resolves — no browser_busy (measured: one daemon each, 4 ms beside a running wait)', r.json);
  v = k.resolveFor({ browserKey: KA, handle: 'work' });
  ok(v.ok, '…and conversation 1 right after it — nobody waits for anybody');
  const rowB = S.browserListFor(k.statusFor(KB)).find((x) => x.profileId === work.id);
  ok(rowB && rowB.driver === 'agent' && rowB.driverKey === null && rowB.owners === 2, 'the strip: conversation 2\'s entry is ITS window, held by its agent (never "another conversation drives it"); two others hold the profile', rowB);
  // the LEGACY shared window (this keeper opened none — a browser started before this lane): a takeover still takes the
  // others IN that window with it (they share one window: the user's hands move what they see) — fail closed, as before
  const to = k.takeover({ browserKey: KB, profileId: work.id, viewerId: 'viewer-b', sessionId: 'sess-2' });
  const vB = k.resolveFor({ browserKey: KB, handle: 'work' }), vA = k.resolveFor({ browserKey: KA, handle: 'work' });
  ok(to && to.ok !== false && vB.code === 'browser_paused' && vA.code === 'browser_paused' && /the shared window of the "work" browser \(your tab is in it\)/.test(vA.error), 'a SHARED window (no window of their own — an older browser run): the takeover from conversation 2\'s view takes conversation 1, in the same window, WITH it (browser_paused, the words name THE SHARED window — verify r2 ⑦, never "your window")', { to, vB: vB.code, vA });
  ok((k.statusFor(KA).leases.find((l) => l.profileId === work.id) || {}).driver?.browserKey === KB, 'who drives conversation 1\'s window names conversation 2 — the view the user drives FROM', k.statusFor(KA).leases.map((l) => l.driver));
  const rowA = S.browserListFor(k.statusFor(KA)).find((x) => x.profileId === work.id);
  ok(rowA && rowA.driver === 'other-user' && rowA.driverKey === KB, 'the strip of conversation 1 says the user drives its (shared) window in conversation 2\'s view', rowA);
  k.handback({ browserKey: KB, profileId: work.id, viewerId: 'viewer-b', cause: 'explicit', sessionId: 'sess-2' });
  v = k.resolveFor({ browserKey: KA, handle: 'work' });
  ok(v.ok, 'the handback frees it — conversation 1 acts again');
  facts[KA].turn = 'idle'; facts[KB].turn = 'idle';
  // ── lane browser-windows (U1 + U2): A WINDOW PER HOLDER — a keeper whose window seam answers ──
  {
    const DATAW = path.join(ROOT, 'data-windows'); fs.mkdirSync(DATAW, { recursive: true });
    let wn = 0; const opened = [];
    const winSeam = async (cdpUrl, o) => { wn++; const targetId = ('F' + String(wn).padStart(4, '0')).padEnd(32, 'A'); opened.push({ cdpUrl, url: o && o.url, targetId }); return { ok: true, targetId, windowId: 7000 + wn }; };
    const mkW = (Kmod, extra = {}) => mkKeeper(Kmod, { dataDir: DATAW, openWindow: winSeam, closeTarget: async () => ({ ok: true }), ...extra });
    const kw = mkW(K);
    const pw = kw.createProfile({ label: 'Windows' });
    const b0 = logOf('binds.log').length;
    await kw.attach({ profileId: pw.id, browserKey: KA, sessionId: 'sess-1' });
    await kw.attach({ profileId: pw.id, browserKey: KB, sessionId: 'sess-2' });
    const inst = WIN.instanceOf(kw.browserOf(pw.id));
    const lw = kw.leasesOn(pw.id);
    const binds = logOf('binds.log').slice(b0);
    ok(opened.length === 2 && lw.length === 2 && lw.every((l) => l.windowIn === inst) && binds.length === 2 && binds.map((x) => x.sess).sort().join() === ['vs-' + KA, 'vs-' + KB].sort().join() && binds.every((x) => opened.some((o) => o.targetId === x.targetId)), 'U1: each NEW lease gets a window of its own at its attach — the keeper opens it over the browser\'s own endpoint and binds THAT conversation\'s session to its tab (`tab <targetId>`) before its first command', { opened: opened.map((o) => o.targetId.slice(0, 5)), binds, windowIn: lw.map((l) => l.windowIn) });
    await kw.attach({ profileId: pw.id, browserKey: KA, sessionId: 'sess-1' });
    ok(opened.length === 2, 'a re-attach of a lease that already has its window in this browser run opens nothing more');
    facts[KA].turn = 'running'; facts[KB].turn = 'running';
    const tw = kw.takeover({ browserKey: KB, profileId: pw.id, viewerId: 'viewer-w', sessionId: 'sess-2' });
    const wB = kw.resolveFor({ browserKey: KB, handle: 'windows' }), wA = kw.resolveFor({ browserKey: KA, handle: 'windows' });
    ok(tw && tw.ok !== false && wB.code === 'browser_paused' && /your window of the "Windows" browser/.test(wB.error) && wA.ok && wA.kind === 'attachment', 'U2: the user takes over conversation 2\'s WINDOW — conversation 2 is browser_paused (named: "your window of the "Windows" browser"), conversation 1 in its own window RUNS ON (userW\'s D-payments)', { tw, wB: wB.code, wA: wA.code });
    ok((kw.statusFor(KA).leases.find((l) => l.profileId === pw.id) || {}).driver === null && S.browserListFor(kw.statusFor(KA)).find((x) => x.profileId === pw.id).driver === 'agent', '…conversation 1\'s window is driven by nobody but its agent; its strip entry says so');
    const tw2 = kw.takeover({ browserKey: KA, profileId: pw.id, viewerId: 'viewer-w2', sessionId: 'sess-1' });
    ok(tw2 && tw2.ok !== false && kw.resolveFor({ browserKey: KA, handle: 'windows' }).code === 'browser_paused', 'ONE WINDOW, ONE HOLDER per window: a second view takes over conversation 1\'s window while the first still drives conversation 2\'s — two windows driven at once, never `held` across windows', tw2);
    kw.handback({ browserKey: KA, profileId: pw.id, viewerId: 'viewer-w2', cause: 'explicit', sessionId: 'sess-1' });
    // a conversation attached WHILE the user drives another's window gets its own window and is never paused from birth
    await kw.attach({ profileId: pw.id, browserKey: KD, sessionId: 'sess-4' });
    facts[KD].turn = 'running';
    const wD = kw.resolveFor({ browserKey: KD, handle: 'windows' });
    ok(opened.length === 3 && wD.ok && kw.inputStateFor(KD, pw.id).input !== 'user', 'a lease attached during another window\'s takeover gets a window of its own and is NOT paused from birth (only a lease in the driven window joins it)', { wD: wD.code, input: kw.inputStateFor(KD, pw.id).input });
    kw.handback({ browserKey: KB, profileId: pw.id, viewerId: 'viewer-w', cause: 'explicit', sessionId: 'sess-2' });
    ok(kw.resolveFor({ browserKey: KB, handle: 'windows' }).ok, 'the handback of conversation 2\'s window frees it');
    // a window the session could not be bound to is closed again, and the lease is left to its first command (never a stray window)
    const closedT = [];
    const kx = mkKeeper(K, { dataDir: path.join(ROOT, 'data-windows-x'), openWindow: async () => ({ ok: true, targetId: 'E'.repeat(32), windowId: 1 }), closeTarget: async (u, id) => { closedT.push(id); return { ok: true }; } });
    fs.mkdirSync(path.join(ROOT, 'data-windows-x'), { recursive: true });
    const px = kx.createProfile({ label: 'Unbindable' });
    fs.writeFileSync(path.join(AB, 'refuse-bind'), '1');
    await kx.attach({ profileId: px.id, browserKey: KF, sessionId: 'sess-6' }).catch(() => null);
    fs.rmSync(path.join(AB, 'refuse-bind'), { force: true });
    const lx = kx.leasesOn(px.id).find((l) => l.browserKey === KF);
    ok(closedT.length === 1 && closedT[0] === 'E'.repeat(32) && lx && !lx.windowIn, 'a window its session could not be bound to is CLOSED again (never left to nobody) and the lease is left to its first command (no window recorded)', { closedT, windowIn: lx && lx.windowIn });
    await kx.stop(px.id).catch(() => { }); kx.shutdown();
    facts[KA].turn = 'idle'; facts[KB].turn = 'idle'; facts[KD].turn = 'idle';
    // CONTROL: the pre-lane rule (every lease of the profile is a mate) — the per-window leg goes red
    const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const allMates = ksrc.replace("return WIN.windowMates({ leases: reg.leases, profileId, browserKey, instance: WIN.instanceOf(reg.browsers[profileId]) });", "return reg.leases.filter((l) => l && l.profileId === profileId && l.browserKey !== browserKey);");
    ok(allMates !== ksrc, 'control: the patched keeper copy takes every lease of the profile as a mate (the pre-lane rule)');
    const kc = mkKeeper(M.load('src/server/browser-keeper.js', allMates, 'all-mates'), { dataDir: path.join(ROOT, 'data-windows-c'), openWindow: winSeam, closeTarget: async () => ({ ok: true }) });
    fs.mkdirSync(path.join(ROOT, 'data-windows-c'), { recursive: true });
    const pc = kc.createProfile({ label: 'Control' });
    await kc.attach({ profileId: pc.id, browserKey: KA, sessionId: 'sess-1' }); await kc.attach({ profileId: pc.id, browserKey: KB, sessionId: 'sess-2' });
    kc.takeover({ browserKey: KB, profileId: pc.id, viewerId: 'viewer-c', sessionId: 'sess-2' });
    const cA = kc.resolveFor({ browserKey: KA, handle: 'control' });
    ok(cA.code === 'browser_paused', 'CONTROL: with the pre-lane mates rule conversation 1 is paused by a takeover of conversation 2\'s window — the per-window leg above can go red', cA.code);
    kc.handback({ browserKey: KB, profileId: pc.id, viewerId: 'viewer-c', cause: 'explicit', sessionId: 'sess-2' });
    await kc.stop(pc.id).catch(() => { }); kc.shutdown();
    await kw.stop(pw.id).catch(() => { }); kw.shutdown();
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

  // ── lane browser-windows (U4): the machine's ceiling is the SETTING `browser.maxRunning` (read at every start) ──
  {
    let capSetting = null;
    const DATAC = path.join(ROOT, 'data-cap'); fs.mkdirSync(DATAC, { recursive: true });
    const kc = mkKeeper(K, { dataDir: DATAC, openWindow: NO_WINDOW, serverSetting: (key) => (key === 'browser.maxRunning' ? capSetting : undefined) });
    const c1 = kc.createProfile({ label: 'Cap one' }), c2 = kc.createProfile({ label: 'Cap two' });
    await kc.attach({ profileId: c1.id, browserKey: KA, sessionId: 'sess-1' });
    ok(kc.list().cap.cap === LIMITS.CONCURRENT_CAP && kc.list().cap.setting === 'browser.maxRunning' && kc.statusFor(KA).cap.machine.cap === LIMITS.CONCURRENT_CAP, `U4: unset ⇒ the ceiling is the keeper's CONCURRENT_CAP (${LIMITS.CONCURRENT_CAP}); the digest names the setting it reads`, kc.list().cap);
    capSetting = 1;
    const ec = await threw(() => kc.attach({ profileId: c2.id, browserKey: KB, sessionId: 'sess-2' }));
    ok(ec && ec.code === 'cap' && ec.scope === 'machine' && /\(1\/1 running/.test(ec.message) && kc.list().cap.cap === 1 && kc.statusFor(KA).cap.machine.cap === 1, 'U4: browser.maxRunning = 1 ⇒ a second browser is refused BY NAME at the next start ("1/1 running"), the digest and the strip\'s machine count read 1', ec && ec.message);
    capSetting = 2;
    await kc.attach({ profileId: c2.id, browserKey: KB, sessionId: 'sess-2' });
    ok(kc.browserOf(c2.id) && kc.browserOf(c2.id).state === 'ready' && kc.list().cap.cap === 2, 'U4: raised to 2 ⇒ it starts — the setting is read at every start, no restart');
    capSetting = 1;
    await sleep(20);
    ok(kc.browserOf(c1.id).state === 'ready' && kc.browserOf(c2.id).state === 'ready' && kc.list().cap.used === 2 && kc.list().cap.cap === 1, 'U4: lowered BELOW what runs ⇒ nothing is stopped (the next start is refused) — 2 running at a ceiling of 1');
    capSetting = 'junk';
    ok(kc.list().cap.cap === LIMITS.CONCURRENT_CAP, 'U4: a junk value ⇒ the default (never 0, never NaN)');
    await kc.stop(c1.id).catch(() => { }); await kc.stop(c2.id).catch(() => { }); kc.shutdown();
    const ss = fs.readFileSync(path.join(REPO, 'src/lib/settings-schema.js'), 'utf8');
    ok(/'browser\.maxRunning': \{\s*type: 'number', default: 6, min: 1, max: 32,/.test(ss) && /category: t\('Agent browser'\), liveApply: true,\s*\},\s*'browser\.defaultPerConversationCap'/.test(ss) && /refused by name/.test(ss), 'U4: the schema declares browser.maxRunning (number, default 6, 1–32, Agent browser) and its words say what happens at the ceiling');
  }

  // ── "WHO CAN USE IT" IS A LIST (2026-09-27): the PATCH, the re-judge, the pick that writes the list, verb time ──
  // (entering: work is everyone's; First, Second (pinned by the user), Third and Fourth chat hold a tab in it)
  groupsOf.set(KB, ['T-G']); groupsOf.set(KD, ['T-H']); unreadable.add(KC);
  const n0 = notices.length;
  const useOf = async () => j('GET', `/api/browser/profiles/${work.id}/use`);
  const u0 = await useOf();
  ok(u0.status === 200 && u0.json.use.mode === 'all' && typeof u0.json.base === 'string' && u0.json.usedBy.filter((x) => x.leased).length === 4 && (u0.json.usedBy.find((x) => x.key === KB) || {}).taskIds.join() === 'T-G' && u0.json.createdBy && u0.json.createdBy.key === KA, 'GET …/use (FRESH): everyone\'s, the base stamp, who uses it now with each holder\'s Task Groups, the conversation that made it', u0.json);
  const staleBase = B.useStamp({ owner: { kind: 'only', who: [{ kind: 'session', id: KA }] } });
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [{ kind: 'task', id: 'T-G' }] }, base: staleBase });
  ok(r.status === 409 && r.json.code === 'list-changed' && r.json.added.includes('mode:all') && r.json.removed.includes('session:' + KA) && B.whoMayUse(k.profile(work.id)).mode === 'all' && leasesOn(work.id).length === 4, 'a stale base (the dialog read another list): 409 list-changed naming what differs — NOTHING written, nobody detached', r.json);
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { scope: 'one', conversation: KA });
  ok(r.status === 400 && r.json.code === 'bad-request' && /send `use`/.test(r.json.error), 'the 2.369.194 body (`scope` / `conversation`) is refused by name — "send `use`"', r.json);
  const refusedCodes = [];
  for (const who of [[], [{ kind: 'task', id: 'T-NOPE' }], [{ kind: 'session', key: 'bk-0000dead' }], [{ kind: 'session', session: 'sess-nope' }]]) refusedCodes.push((await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who }, base: u0.json.base })).json.code);
  ok(refusedCodes.join() === 'empty_list,unknown_task,unknown_conversation,session-gone' && B.whoMayUse(k.profile(work.id)).mode === 'all', 'refused BY NAME, nothing written: an empty list, a Task Group the store does not list, a key this profile never met, a picked session that is gone', refusedCodes);
  // THE ONE RESOLVER of a picked live session: a key-less one and one on another machine are refused BY NAME (never
  // silently dropped from a list the user saw) — and nothing of the list is written (one refusal, nothing saved)
  active.set('sess-nokey', mkSession('sess-nokey', null, 'Keyless chat'));
  active.set('sess-remote', { ...mkSession('sess-remote', 'bk-0000c0ee', 'Remote chat'), host: 'box' });
  const rk = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [{ kind: 'session', session: 'sess-1' }, { kind: 'session', session: 'sess-nokey' }] }, base: u0.json.base });
  const rr = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [{ kind: 'session', session: 'sess-remote' }] }, base: u0.json.base });
  ok(rk.status === 409 && rk.json.code === 'no_browser_key' && rk.json.name === 'Keyless chat' && /has no browser of its own yet — restart it \(Terminate → Resume\), then add it/.test(rk.json.error) && rr.status === 409 && rr.json.code === 'no_browser_key' && rr.json.why === 'remote' && B.whoMayUse(k.profile(work.id)).mode === 'all', 'the resolver: a key-less live session ⇒ no_browser_key naming it ("restart it, then add it"), a session on another machine ⇒ no_browser_key why remote — and First chat, resolvable, was NOT written either (one refusal, nothing saved)', [rk.json, rr.json]);
  active.delete('sess-nokey'); active.delete('sess-remote');
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', session: 'sess-1' }] }, base: u0.json.base });
  ok(r.status === 200 && r.json.profile.scope === 'only' && JSON.stringify(r.json.profile.use.who) === JSON.stringify([{ kind: 'task', id: 'T-G' }, { kind: 'session', key: KA }]) && r.json.detached.map((d) => d.browserKey).join() === KD && r.json.undecided.join() === KC && leasesOn(work.id).join() === [KA, KB, KC].sort().join(), '"Only these: Task Group G, First chat" (First chat picked as a live session — the ONE resolver gives its key): First chat and Second chat (in G) KEEP their tabs; Fourth chat (in H) is detached; Third chat — its Task Groups unreadable — is KEPT and reported undecided', r.json);
  ok(notices.slice(n0).some((x) => x.sid === 'sess-4' && x.n.kind === 'browser-profile') && !notices.slice(n0).some((x) => x.sid === 'sess-2' || x.sid === 'sess-3' || x.sid === 'sess-1'), '…the detached conversation hears it on its next message; the kept ones hear nothing', notices.slice(n0));
  for (let i = 0; i < 40 && logOf('closes.log').filter((x) => x.sess === 'vs-' + KD).length < 2; i++) await sleep(50);
  ok(logOf('closes.log').filter((x) => x.sess === 'vs-' + KD && x.ns === 'vs-' + work.id && /^ws:/.test(x.cdp || '')).map((x) => x.verb).join() === 'tab close,close' && !logOf('closes.log').some((x) => [KA, KB, KC].some((kk) => x.sess === 'vs-' + kk)), '…and its TAB closes: the lease session\'s own `tab close` (its bound tab) then `close` (its connection), under its session over the shared browser\'s CDP url — never the browser, never a kept conversation\'s session', logOf('closes.log'));
  ok(r.json.added.length === 2 && r.json.changed.use.was.mode === 'all', '…the answer names the rows added and what it was');
  const u1 = await useOf();
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', key: KA }, { kind: 'task', id: 'T-H' }] }, base: u1.json.base });
  ok(r.status === 200 && r.json.detached.length === 0 && r.json.undecided.join() === KC && r.json.added.map((w) => w.id).join() === 'T-H', 'a WIDENING (+ Task Group H) detaches nobody (Third chat stays undecided while its groups cannot be read)', r.json);
  const u2 = await useOf();
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', key: KA }] }, base: u2.json.base });
  ok(r.status === 200 && r.json.detached.length === 0, '…and back to [G, First chat] (Fourth chat was already gone)');
  // the AGENT's view: whether ITS conversation may, and through what — never the list, never another conversation's key
  const agentRow = async (s) => { const x = (await j('GET', '/api/agent/browser/profiles', undefined, as(s))).json; return { row: x.profiles.find((p) => p.id === work.id), pins: x.pins, all: x }; };
  const aA = await agentRow(sA), aB = await agentRow(sB), aD = await agentRow(sD), aC = await agentRow(sC);
  ok(aA.row.use.via === 'conversation' && aB.row.use.via === 'task' && aD.row.use.you === false && aC.row.use.unreadable === true && aC.row.use.you === false, 'the agent\'s digest: First chat "yours included", Second chat "through its Task Group", Fourth chat "not yours", Third chat "unknown for yours right now"', [aA.row.use, aB.row.use, aD.row.use, aC.row.use]);
  ok([aA, aB, aC, aD].every((a) => a.all.profiles.every((p) => !('owner' in p) && !('createdBy' in p)) && Object.keys(a.pins).every((kk) => [KA, KB, KC, KD].includes(kk)) && Object.keys(a.pins).length <= 1) && !JSON.stringify(aD.all.profiles).includes(KA) && Object.keys(aB.pins).join() === KB, '…with NO owner / createdBy and only its OWN pin (another conversation\'s key never reaches an agent through the profile rows)');
  // VERB TIME (the owner's default 2 — no store subscription): Third chat's groups are readable again and none is listed —
  // its next command is refused AND its tab closed in the same call
  unreadable.delete(KC);
  const aliasC = k.setFor(KC).attachments.find((a) => a.profileId === work.id).alias;
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'], handle: aliasC }, as(sC));
  ok(r.status === 403 && r.json.code === 'not_owner' && /Your tab in its browser was closed/.test(r.json.error) && !leasesOn(work.id).includes(KC) && !CMDLINE_RE.test(r.json.error), 'verb time: Third chat (no group on the list) — its next command refused not_owner AND its lease gone in the same call (the refusal says the tab closed)', r.json);
  // the USER's attach (the UI) WRITES the list: Third chat is added, then attached
  r = await j('POST', '/api/browser/attach', { sessionId: 'sess-3', profile: 'work' });
  ok(r.status === 200 && r.json.added && r.json.added.profileId === work.id && leasesOn(work.id).includes(KC) && B.whoMayUse(k.profile(work.id)).who.some((w) => w.id === KC), 'the USER\'s attach writes the list — Third chat is ADDED (the answer says so) and attached', r.json);
  await j('POST', '/api/browser/detach', { sessionId: 'sess-3', profile: 'work' });
  // unbind Second chat from G ⇒ its next command refused AND its tab closed
  groupsOf.set(KB, []);
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sB));
  ok(r.status === 403 && r.json.code === 'not_owner' && /Your tab in its browser was closed/.test(r.json.error) && !leasesOn(work.id).includes(KB), 'Second chat unbound from Task Group G: its next command is refused AND its tab in the shared browser is gone (lease census)', r.json);
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sB));
  ok(r.status === 403 && r.json.code === 'not_owner' && r.json.pinned === true && /pinned profile "work" did not open/.test(r.json.error) && !k.ephemeralFor(KB), '…and the one after it: its pin (it stays — a preference) opens nothing — not_owner, pinned:true, no temporary browser instead', r.json);
  // THE PICK WRITES THE LIST: the user pins work for Fourth chat (not admitted) ⇒ ADDED; its next command opens it
  r = await j('POST', '/api/browser/pin', { sessionId: 'sess-4', profile: 'work' });
  const rD0 = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sD)); // its set changed at the narrowing: told once (§3.8 layer ①)
  ok(rD0.status === 409 && rD0.json.code === 'profile_changed', 'Fourth chat\'s first command after the narrowing that took its tab is told once that its set changed (§3.8 layer ①)', rD0.json);
  const rD = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sD));
  ok(r.status === 200 && r.json.added && r.json.added.label === 'work' && !('added' in r.json.pin) && B.whoMayUse(k.profile(work.id)).who.some((w) => w.id === KD) && rD.status === 200 && rD.json.kind === 'attachment', 'a USER pin on a conversation the list does not admit ADDS it (`added` on the answer — the toast says it) and its next bare command opens work', { pin: r.json, rD: rD.json && rD.json.kind });
  ok(logOf('closes.log').filter((x) => x.sess === 'vs-' + KD).map((x) => x.verb).join() === 'tab close,close,tab new' && !k._reg().tabClosed[`${work.id}|${KD}`], '…and it is bound a NEW tab first (its last one was closed at the narrowing — measured on 0.38.1, it would answer tab_gone), the mark dropped', logOf('closes.log').filter((x) => x.sess === 'vs-' + KD));
  // a FORK's copied pin does not add (origin conversation): refused not_owner pinned:true
  live.add(KE); active.set('sess-5', sE); facts[KE] = { turn: 'idle', name: sE.name };
  k.setPin(KB, work.id, { origin: 'chosen', by: 'user' }); // Second chat is added back by the user's pick (the fork copies that pin)
  const before = B.useStamp(k.profile(work.id));
  k.copyPin(KB, KE);
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sE));
  ok(r.status === 403 && r.json.code === 'not_owner' && r.json.pinned === true && B.useStamp(k.profile(work.id)) === before, 'a FORK\'s copied pin (origin conversation) writes nothing — the fork is another conversation: refused not_owner, pinned:true', r.json);
  // a Task-Group-default pin of a group not on the list: refused by name at the first command, nothing added
  k.setPin(KF, work.id, { origin: 'task-group' });
  r = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sF));
  ok(r.status === 403 && r.json.code === 'not_owner' && r.json.pinned === true && /your pinned profile "work" did not open/.test(r.json.error) && /"Who can use it"/.test(r.json.error) && B.useStamp(k.profile(work.id)) === before, 'a Task-Group DEFAULT pin (origin task-group) adds nothing: the first command is refused by name (not_owner, the pinned form)', r.json);
  // a STOPPED conversation on the list: its conversation id comes from the bindings FILE (the panel names it from its rows)
  bindings.record('conv-stopped-0001', KS);
  k.setPin(KS, work.id, { origin: 'chosen', by: 'user' });
  const u3 = await useOf();
  const rowS = u3.json.use.who.find((w) => w.key === KS), rowD = u3.json.use.who.find((w) => w.key === KD), rowG = u3.json.use.who.find((w) => w.kind === 'task');
  ok(rowS && rowS.live === false && rowS.conversationId === 'conv-stopped-0001' && rowS.name === null && rowD && rowD.live && rowD.name === 'Fourth chat' && rowD.sessionId === 'sess-4' && rowG && rowG.title === 'Ops' && rowG.deleted === false, 'GET …/use names each row: a stopped conversation by the conversation id the bindings file holds for its key, a live one by its session, a Task Group by its title', u3.json.use);
  const WM = await import(path.join(REPO, 'src/lib/browser-who-model.js'));
  const chips = WM.whoChips(u3.json.use, { nameOfConversation: (cid) => (cid === 'conv-stopped-0001' ? 'An old chat' : '') }).chips;
  ok(chips.map((c) => c.name).join('|') === ['Ops', 'First chat', 'Third chat', 'Fourth chat', 'Second chat', 'An old chat'].join('|') && chips.find((c) => c.key === 'session:' + KS).live === false, 'the panel\'s chips from the same structure: the stopped conversation named from the client\'s own rows by its conversation id', chips.map((c) => c.name));
  const hk = await j('GET', '/api/browser/housekeeping');
  const hrow = hk.json.profiles.find((x) => x.id === work.id);
  ok(hrow && JSON.stringify(hrow.use) === JSON.stringify(u3.json.use) && !('scopeConversation' in hrow), 'the housekeeping row carries the SAME `use` (the panel\'s chips) — no scopeConversation any more');
  // ── the identity verifier (2026-09-28): three refuted claims, each reproduced on this keeper before the fix ──
  // (1) a STOPPED holder admitted only through its Task Group is not "in no group": a widening keeps it (undecided),
  //     a narrowing to conversations only detaches it (its key alone decides)
  groupsOf.set(KF, ['T-G']);
  r = await j('POST', '/api/agent/browser/use', { profile: 'work' }, as(sF));
  ok(r.status === 200 && leasesOn(work.id).includes(KF), 'Sixth chat (in Task Group G, not listed by key) holds a tab in work through the group');
  active.delete('sess-6'); // stopped: its lease — its tab in the shared browser — stays with its key
  const u4 = await useOf();
  const rowF = u4.json.usedBy.find((x) => x.key === KF);
  ok(rowF && rowF.leased && rowF.live === false && rowF.sessionId === null && !rowF.taskIds.length, 'GET …/use: the stopped holder is listed leased, live:false, no Task Group readable for it now', rowF);
  const drafted = u4.json.use.who.map((w) => (w.kind === 'session' ? { kind: 'session', key: w.key } : { kind: 'task', id: w.id }));
  const draftKeys = drafted.filter((w) => w.kind === 'session').map((w) => w.key), draftTasks = drafted.filter((w) => w.kind === 'task').map((w) => w.id);
  ok(WM.loseCount(u4.json.usedBy, { mode: 'only', keys: draftKeys, taskIds: [...draftTasks, 'T-H'] }) === 0 && WM.loseCount(u4.json.usedBy, { mode: 'only', keys: draftKeys, taskIds: [] }) === 1, 'the dialog\'s "will lose it" count mirrors the keeper: a widening (+H) loses nobody (the stopped holder is undecided); conversations only ⇒ 1 (the stopped holder, decided by its key)');
  const c4 = logOf('closes.log').length;
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [...drafted, { kind: 'task', id: 'T-H' }] }, base: u4.json.base });
  ok(r.status === 200 && !r.json.detached.some((d) => d.browserKey === KF) && r.json.undecided.join() === KF && leasesOn(work.id).includes(KF) && !logOf('closes.log').slice(c4).some((x) => x.sess === 'vs-' + KF), 'a WIDENING (+ Task Group H) while Sixth chat is stopped: its tab STAYS (undecided — judged at its next command), nothing closed for it (2026-09-28: "stopped" read as "no groups" detached it)', r.json);
  const u5 = await useOf();
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: u5.json.use.who.filter((w) => w.kind === 'session').map((w) => ({ kind: 'session', key: w.key })) }, base: u5.json.base });
  await sleep(150);
  ok(r.status === 200 && r.json.detached.some((d) => d.browserKey === KF) && !r.json.undecided.length && !leasesOn(work.id).includes(KF) && logOf('closes.log').slice(c4).some((x) => x.sess === 'vs-' + KF && x.verb === 'tab close'), '…narrowed to conversations only (no Task Group row could admit it): the stopped holder is detached now and its tab closed — its key alone decides', r.json);
  active.set('sess-6', sF); groupsOf.delete(KF);
  // (2) the agent's `backend` verb names ANY profile by ref: the record it answers is the AGENT's view, never the list
  const bkE = await j('GET', `/api/agent/browser/backend?profile=${work.id}`, undefined, as(sE));
  ok(bkE.status === 200 && bkE.json.profile && !('owner' in bkE.json.profile) && !('createdBy' in bkE.json.profile) && !('scopeAt' in bkE.json.profile) && bkE.json.profile.use && bkE.json.profile.use.you === false && bkE.json.profile.scope === 'only' && !JSON.stringify(bkE.json.profile).includes(KA), 'GET /api/agent/browser/backend?profile=work asked by the fork (not admitted): the profile is the agent\'s view — no owner / createdBy / scopeAt, no other conversation\'s key, use.you false', bkE.json && bkE.json.profile);
  // (3) a `key` row carried by a session on ANOTHER machine is refused like a picked one (the picker never offers it)
  const KR = 'bk-0000dead', sR = mkSession('sess-9', KR, 'Remote chat'); sR.hostId = 'h1'; active.set('sess-9', sR); live.add(KR);
  const u6 = await useOf();
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'only', who: [...u6.json.use.who.map((w) => (w.kind === 'session' ? { kind: 'session', key: w.key } : { kind: 'task', id: w.id })), { kind: 'session', key: KR }] }, base: u6.json.base });
  ok(r.status === 409 && r.json.code === 'no_browser_key' && r.json.why === 'remote' && /"Remote chat" runs on another machine/.test(r.json.error) && B.useStamp(k.profile(work.id)) === u6.json.base, 'a `key` row carried by a live session on another machine: refused no_browser_key / remote (the picked-session sentence) — nothing written', r.json);
  // (4) A CONVERSATION ON ANOTHER MACHINE NEVER USES A PROFILE (identity verify r2, 2026-09-28): its agent's `use` took a
  // lease and launched THIS machine's Chrome for a loopback CDP url the other machine cannot reach; the user's pin /
  // attach for it wrote its key into the list (the key the PATCH above refuses and the picker never offers)
  {
    const L0 = logOf('launches.log').length, s0 = B.useStamp(k.profile(work.id));
    let rr = await j('POST', '/api/agent/browser/use', { profile: 'work' }, as(sR));
    ok(rr.status === 409 && rr.json.code === 'remote_session' && /runs on another machine/.test(rr.json.error) && !leasesOn(work.id).includes(KR) && logOf('launches.log').length === L0 && !CMDLINE_RE.test(rr.json.error), 'a REMOTE session\'s agent `use work`: refused remote_session by name — no lease, no launch of this machine\'s browser', rr.json);
    rr = await j('POST', '/api/browser/attach', { sessionId: 'sess-9', profile: 'work' });
    ok(rr.status === 409 && rr.json.code === 'remote_session' && !leasesOn(work.id).includes(KR) && B.useStamp(k.profile(work.id)) === s0, 'the USER\'s attach for a remote session: refused remote_session — nothing added, nothing leased', rr.json);
    rr = await j('POST', '/api/browser/pin', { sessionId: 'sess-9', profile: 'work' });
    ok(rr.status === 409 && rr.json.code === 'remote_session' && !k.pinFor(KR) && B.useStamp(k.profile(work.id)) === s0, 'the USER\'s pin for a remote session: refused remote_session — no pin, nothing added', rr.json);
    rr = await j('POST', '/api/agent/browser/pin', { profile: 'work' }, as(sR));
    ok(rr.status === 409 && rr.json.code === 'remote_session' && !k.pinFor(KR), 'the remote session\'s own `pin`: refused the same way', rr.json);
    // ws-create's explicit New-Session pick for a REMOTE spawn (the session is not registered yet): `remote: true` adds nothing
    const p0 = k.setPin(KR, work.id, { origin: 'chosen', remote: true });
    ok(p0 && !('added' in p0) && B.useStamp(k.profile(work.id)) === s0, 'ws-create\'s explicit pick for a remote spawn (setPin remote:true): the pin is recorded, the list untouched');
    ok(k.setPin(KR, null) === null && !k.pinFor(KR), '…and an UNPIN of a remote session still works (the delete\'s unpin path)');
    rr = await j('POST', '/api/browser/pin', { sessionId: 'sess-9', profile: null });
    ok(rr.status === 200 && rr.json.pin === null, 'POST /api/browser/pin with profile null for a remote session: allowed (a clearing)');
  }
  active.delete('sess-9'); live.delete(KR);
  // (5) THE AGENT'S VIEW carries no other conversation's key / webui id / name (identity verify r2, 2026-09-28): the
  // `backend` GET of a profile the asker may not use answered every lease row whole; the digest did for every profile
  {
    const named = (o) => { const out = []; const walk = (v, pth) => { if (v === KA || v === 'sess-1' || v === 'First chat') out.push(pth); else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, pth + '.' + kk); }; walk(o, '$'); return out; };
    const dig = await j('GET', '/api/agent/browser/profiles', undefined, as(sE));
    const hits = named(dig.json).filter((pth) => !/^\$\.drivers\./.test(pth)); // owner ruling A (2): `drivers` names who drives, by key — the ONE deliberate exception
    ok(dig.status === 200 && !hits.length && dig.json.leases.some((l) => l.other === true && !('browserKey' in l) && !('sessionId' in l) && !('alias' in l) && !('label' in l)) && dig.json.leases.filter((l) => l.profileId === work.id).length === leasesOn(work.id).length, 'the fork\'s digest: First chat\'s key / webui id / name ride NOWHERE but `drivers`; another conversation\'s lease is `{profileId, mediated, other}` (the CLI\'s per-profile count keeps working)', hits.length ? hits : dig.json.leases);
    const bk2 = await j('GET', `/api/agent/browser/backend?profile=${work.id}`, undefined, as(sE));
    const hits2 = named(bk2.json);
    ok(bk2.status === 200 && !hits2.length && bk2.json.leases.length === leasesOn(work.id).length && bk2.json.leases.every((l) => l.other === true), 'the fork\'s `backend?profile=work` (not admitted): the lease rows carry no key / webui id / name — counts only', hits2.length ? hits2 : bk2.json.leases);
    const useA = await j('POST', '/api/agent/browser/use', { profile: 'work' }, as(sA));
    const resA = await j('POST', '/api/agent/browser/resolve', { argv: ['snapshot'] }, as(sA));
    ok(useA.status === 200 && !('owner' in useA.json.profile) && !('createdBy' in useA.json.profile) && !('scopeAt' in useA.json.profile) && useA.json.profile.use && useA.json.profile.use.you === true && resA.status === 200 && resA.json.kind === 'attachment' && !('owner' in resA.json.profile) && !('createdBy' in resA.json.profile) && resA.json.profile.use.via === 'conversation', 'the ADMITTED agent\'s `use` and `resolve` answers carry the record as the agent\'s view (use.you / via, never the list or createdBy)', { use: useA.json.profile && Object.keys(useA.json.profile), res: resA.json.profile && Object.keys(resA.json.profile) });
    // an own ephemeral browser rides the OWN digest; another conversation's does not (its key, webui id, pid, dir)
    const sX = mkSession('sess-8', 'bk-0000c0e8', 'Own browser chat', { rungD: true }); active.set('sess-8', sX); live.add('bk-0000c0e8'); facts['bk-0000c0e8'] = { turn: 'idle', name: sX.name };
    const rx = await j('POST', '/api/agent/browser/resolve', { argv: ['open', 'https://x.example/'] }, as(sX));
    const dOwn = await j('GET', '/api/agent/browser/profiles', undefined, as(sX)), dOther = await j('GET', '/api/agent/browser/profiles', undefined, as(sE));
    ok(rx.status === 200 && rx.json.kind === 'ephemeral' && dOwn.json.ephemerals.some((e) => e.browserKey === 'bk-0000c0e8') && !dOther.json.ephemerals.some((e) => e.browserKey === 'bk-0000c0e8') && dOther.json.ephemeralsOthers >= 1 && !JSON.stringify(dOther.json.ephemerals).includes('sess-8'), 'a managed ephemeral browser is in its OWN conversation\'s digest and not in another\'s (a count of the others instead)', { own: dOwn.json.ephemerals.length, other: dOther.json.ephemerals.length, others: dOther.json.ephemeralsOthers });
    await dropEphemeral('bk-0000c0e8'); active.delete('sess-8'); live.delete('bk-0000c0e8');
  }
  // back to everyone's (every conversation of the legs below uses it), the extra pins cleared
  k.setPin(KE, null); k.setPin(KF, null); k.setPin(KS, null); live.delete(KE); active.delete('sess-5');
  r = await j('PATCH', `/api/browser/profiles/${work.id}`, { use: { mode: 'all' }, base: (await useOf()).json.base });
  ok(r.status === 200 && r.json.profile.scope === 'all' && r.json.detached.length === 0 && (await j('POST', '/api/agent/browser/use', { profile: 'work' }, as(sB))).status === 200, '"All my conversations" again ⇒ nobody detached, Second chat uses it');
  groupsOf.clear();

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
  const users = row ? TV.usersOf(row) : [];
  ok(row && row.scope === 'all' && row.use && row.use.mode === 'all' && row.createdBy === KA && users.length === 3 && users.filter((u) => u.pinned).map((u) => u.name).sort().join() === 'Fourth chat,Second chat', 'the panel row names who uses it (3 conversations, 2 of them by the user\'s pin) and says who CAN use it (`use` all)', { usedBy: row && row.usedBy, use: row && row.use });
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
  // (f) THE LATE KEY'S PIN IS A PREFERENCE (B-f7ab verify r2's witness; since 2.369.196 "Who can use it" is a LIST and
  //     `whoMayUse` is the ONE admission — spec-who-may-use §3.3). verify r1 dated the late key's default pin at the
  //     session's START (`latePinAt`) and r3 pinned "a pin dated 0 authorizes nothing" — both guarded a rule in which a
  //     pin was an authorization; that rule is gone (no admission reads a pin or its date), and so are those legs.
  //     What stays (r2, reproduced before its fix): A DEFAULT REACHES A CONVERSATION ONLY AT ITS START. The late key read
  //     the ladder at the MINT — so an instance / Task Group default the user set AFTER a keyless session started reached
  //     it (its spawn-keyed twin had landed on the default in force at ITS start). A keyless spawn RECORDS its ladder's
  //     pick (`browserPinAtStart`, the WITNESS) and the late key restores exactly that (PURE lateDefaultPin / keeper
  //     restorePin); a record without one gets the current default as a LANDING; the group cap is the witness's, never
  //     the group's live value. NEW at the integration: a restored witness NEVER edits any profile's `owner.who` — a
  //     witness widens nothing (only the user's own `chosen` pick adds a conversation); CONTROL: a keeper copy whose
  //     restorePin adds the conversation.
  {
    // PURE lateDefaultPin: the witness wins over the ladder (its own date, informational); no witness ⇒ a LANDING
    // (undated); an empty witness ⇒ nothing; the conversation's own row untouched; a malformed record refused by name
    const W = { profileId: 'bp-0000f002', origin: 'instance', at: 40, by: 'user' };
    const L = { profileId: 'bp-0000f003', origin: 'instance' };
    const rowsD = [
      [{ witness: W, ladder: L }, { profileId: 'bp-0000f002', origin: 'instance', at: 40, by: 'user', source: 'witness' }],
      [{ witness: { ...W, origin: 'chosen' }, ladder: L }, { profileId: 'bp-0000f002', origin: 'chosen', at: 40, by: 'user', source: 'witness' }],
      [{ witness: { ...W, origin: 'conversation', by: 'agent' }, ladder: L }, { profileId: 'bp-0000f002', origin: 'conversation', at: 40, by: 'agent', source: 'witness' }],
      [{ witness: { profileId: '', origin: 'harness', at: 40, by: 'user', cap: 2 }, ladder: L }, { profileId: '', origin: 'harness', at: null, by: null, source: 'witness' }],
      [{ witness: null, ladder: L }, { profileId: 'bp-0000f003', origin: 'instance', at: null, by: 'user', source: 'landing' }],
      [{ witness: null, ladder: { profileId: 'bp-0000f003', origin: 'task-group' } }, { profileId: 'bp-0000f003', origin: 'task-group', at: null, by: 'user', source: 'landing' }],
      [{ witness: null, ladder: { profileId: 'bp-0000f004', origin: 'conversation' } }, { profileId: 'bp-0000f004', origin: 'conversation', at: null, by: null, source: 'conversation' }],
      [{ witness: W, ladder: { profileId: 'bp-0000f004', origin: 'conversation' } }, { profileId: 'bp-0000f004', origin: 'conversation', at: null, by: null, source: 'conversation' }],
      [{ witness: { profileId: 'not-a-profile', origin: 'instance', at: 1, by: 'user' }, ladder: L }, { profileId: '', origin: 'harness', at: null, by: null, source: 'none', refused: 'the start-time pin record is not a pin witness' }],
      [{ witness: null, ladder: { profileId: '', origin: 'harness' } }, { profileId: '', origin: 'harness', at: null, by: null, source: 'none' }],
    ];
    const badD = rowsD.filter(([a, want]) => JSON.stringify(B.lateDefaultPin(a)) !== JSON.stringify(want)).map(([a]) => a);
    ok(!badD.length && B.witnessCap({ cap: 2 }) === 2 && B.witnessCap({ cap: 'x' }) === null && B.witnessCap(null) === null && typeof B.latePinAt === 'undefined' && typeof B.userPinAuthorizes === 'undefined',
      `③f lateDefaultPin (${rowsD.length} rows): a witness is restored as the pick it records, an empty witness pins nothing, no witness ⇒ the current default as a LANDING, the conversation's own row is never touched; the dated-pin readers (latePinAt / userPinAuthorizes) are gone`, badD);
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
    const keeperOpts2 = { dataDir: DATA2, homeDir: HOME2, env: () => env2, serverSetting: set2, liveKeys: () => new Set([...active2.values()].map((x) => x && x._browserKey).filter(Boolean)), runtime: F.createBrowserRuntime({ env: env2 }), facts: F.createBrowserFacts({ env: env2 }), log: { log() { }, warn() { }, error() { } }, install: false, now: () => clock, conversationFacts: () => ({ turn: 'idle', name: null }),
      taskGroupDefault: (f) => { const g = groupsFor2(f).find((x) => x.browserProfileId); return g ? g.browserProfileId : ''; }, taskGroupCap: (f) => { const g = groupsFor2(f).find((x) => Number.isInteger(x.browserCap)); return g ? g.browserCap : null; } };
    const k2 = K.create(keeperOpts2);
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
    /** the user keeps Bank to ONE other conversation (the panel's Save — a list, never a scope + one conversation) */
    const KEPT = 'bk-0000f1a1';
    const keepBankTo = (key) => k2.updateProfile(PB, { use: { mode: 'only', who: [{ kind: 'session', key }] } }, { knownKeys: [key] });
    const openBank = () => k2.updateProfile(PB, { use: { mode: 'all' } });
    /** every profile's "Who can use it", byte for byte */
    const owners = (kk) => JSON.stringify(kk.list().profiles.map((p) => [p.id, (kk.profile(p.id) || {}).owner || null]));
    R.setup(ctx2(mkEngine2(BK)));
    clock = T0;
    const made = await j('POST', '/api/browser/profiles', { label: 'Bank' });
    const PB = made.json && made.json.profile && made.json.profile.id;
    const PO = (await j('POST', '/api/browser/profiles', { label: 'Old' })).json.profile.id;
    // ── A1: instance default Old at the start; Bank (kept to another conversation) becomes the default AFTER the start ──
    clock = T1; keepBankTo(KEPT);
    clock = T2; settings2['browser.defaultProfile'] = 'Old';
    const keyedA1 = spawn2('sess-r2-a1-keyed', 'A1 keyed', 'c0f7ab00-r2a1-4000-8000-000000000001');
    const lateA1 = late2('sess-r2-a1-late', 'A1 late (witnessed)', 'c0f7ab00-r2a1-4000-8000-000000000002', T2, { witness: witness2() });
    const legacyA1 = late2('sess-r2-a1-legacy', 'A1 late (no witness)', 'c0f7ab00-r2a1-4000-8000-000000000003', T2);
    clock = T3; settings2['browser.defaultProfile'] = 'Bank';
    clock = T4;
    const ownersA1 = owners(k2);
    const vK = await openIn(keyedA1), vL = await openIn(lateA1), vG = await openIn(legacyA1);
    ok(verdict(vK, keyedA1, PB) !== 'admitted' && k2.pinFor(keyedA1._browserKey).profileId === PO, 'CONTROL ③f (r2): the spawn-keyed twin landed on the default in force at ITS start (Old) — the later default never reached it');
    ok(verdict(vL, lateA1, PB) !== 'admitted' && k2.pinFor(lateA1._browserKey).profileId === PO && k2.pinFor(lateA1._browserKey).origin === 'instance', '③f (r2) A1: the late key of a session that STARTED on Old (its spawn\'s witness) is pinned to Old, never to the Bank the user made the default later', { v: verdict(vL, lateA1, PB), pin: k2.pinFor(lateA1._browserKey) });
    ok(verdict(vG, legacyA1, PB) !== 'admitted' && vG.status === 403 && vG.json.code === 'not_owner' && vG.json.pinned === true && k2.pinFor(legacyA1._browserKey).profileId === PB && k2.pinFor(legacyA1._browserKey).origin === 'instance' && owners(k2) === ownersA1,
      '③f (r2) A1: a record from before r2 (no witness) gets the current default as a LANDING — its bare command names Bank and the LIST refuses it not_owner by the button (never admitted, never a silent temporary browser); nobody\'s "Who can use it" changed', { v: verdict(vG, legacyA1, PB), json: vG.json && vG.json.code, pin: k2.pinFor(legacyA1._browserKey) });
    await retire(keyedA1, lateA1, legacyA1);
    // ── A2 + A3: the Task Group's default / cap set after the start ──
    clock = T2 + 20; settings2['browser.defaultProfile'] = '';
    const keyedA2 = spawn2('sess-r2-a2-keyed', 'A2 keyed in T', 'c0f7ab00-r2a2-4000-8000-000000000001', { taskId: 'T-late' });
    const lateA2 = late2('sess-r2-a2-late', 'A2 late in T (witnessed)', 'c0f7ab00-r2a2-4000-8000-000000000002', T2 + 20, { witness: witness2({ taskId: 'T-late' }), taskId: 'T-late' });
    const legacyA2 = late2('sess-r2-a2-legacy', 'A2 late in T (no witness)', 'c0f7ab00-r2a2-4000-8000-000000000003', T2 + 20, { taskId: 'T-late' });
    clock = T3 + 20; groups2[0].browserProfileId = PB; groups2[0].browserCap = 5;
    clock = T4 + 20;
    const a2K = await openIn(keyedA2), a2L = await openIn(lateA2), a2G = await openIn(legacyA2);
    ok(a2K.status === 200 && a2K.json.kind === 'ephemeral' && k2.groupCapOf(keyedA2._browserKey) === null, 'CONTROL ③f (r2): the spawn-keyed twin in the group got NO default and NO group cap (none at its start) — its own temporary browser');
    ok(a2L.status === 200 && a2L.json.kind === 'ephemeral' && !k2.pinFor(lateA2._browserKey) && k2.groupCapOf(lateA2._browserKey) === null, '③f (r2) A2/A3: the witnessed late key in the group pins nothing and stamps no group cap — the group\'s later default and cap never reach a conversation that started before them', { v: verdict(a2L, lateA2, PB), pin: k2.pinFor(lateA2._browserKey), cap: k2.groupCapOf(lateA2._browserKey) });
    ok(verdict(a2G, legacyA2, PB) !== 'admitted' && a2G.json && a2G.json.code === 'not_owner' && k2.pinFor(legacyA2._browserKey).origin === 'task-group' && k2.groupCapOf(legacyA2._browserKey) === null, '③f (r2) A2/A3: a record without a witness lands on the group\'s default (the list refuses it: Bank is kept to another conversation) and stamps NO group cap (the group is never read live)', { v: verdict(a2G, legacyA2, PB), cap: k2.groupCapOf(legacyA2._browserKey) });
    await retire(keyedA2, lateA2, legacyA2);
    groups2[0].browserProfileId = null; groups2[0].browserCap = null;
    // ── A4: an adopted FORK — the spawn copies the parent's pin verbatim; the fork is not in the list ──
    clock = T0 + 30; settings2['browser.defaultProfile'] = 'Bank';
    const parentA4 = spawn2('sess-r2-a4-parent', 'A4 parent', 'c0f7ab00-r2a4-4000-8000-000000000001');
    k2.setPin(parentA4._browserKey, PB, { origin: 'chosen', by: 'user' }); // the user's own pick ADDS the parent to the list
    clock = T4 + 30;
    const forkK = spawn2('sess-r2-a4-fork-keyed', 'A4 fork keyed', 'c0f7ab00-r2a4-4000-8000-000000000002', { fork: true, forkedFromId: 'c0f7ab00-r2a4-4000-8000-000000000001' });
    const forkL = late2('sess-r2-a4-fork-late', 'A4 fork late (witnessed)', 'c0f7ab00-r2a4-4000-8000-000000000003', T4 + 30, { witness: witness2({ forkParentKey: parentA4._browserKey }), meta: { forkSourceId: 'c0f7ab00-r2a4-4000-8000-000000000001', forkedFrom: ['c0f7ab00-r2a4-4000-8000-000000000001'], forkRequested: false } });
    const ownersA4 = owners(k2);
    const a4K = await openIn(forkK), a4L = await openIn(forkL);
    ok(a4K.status === 403 && a4K.json.code === 'not_owner' && k2.pinFor(forkK._browserKey).origin === 'conversation' && k2.pinFor(forkK._browserKey).at === T0 + 30, 'CONTROL ③f (r2): the spawn-keyed fork carries its parent\'s pin verbatim (origin conversation, the parent\'s date) and the list — which names the PARENT — refuses it not_owner');
    ok(a4L.status === 403 && a4L.json.code === 'not_owner' && k2.pinFor(forkL._browserKey).origin === 'conversation' && k2.pinFor(forkL._browserKey).at === T0 + 30 && k2.pinFor(forkL._browserKey).by === 'user' && owners(k2) === ownersA4, '③f (r2) A4: the witnessed late key of a fork restores the parent\'s row verbatim — the same pin, the same refusal (never the instance default), and the list is untouched', { v: verdict(a4L, forkL, PB), pin: k2.pinFor(forkL._browserKey) });
    await retire(parentA4, forkK, forkL);
    // an explicit pick at a keyless spawn (the New Session dialog's profile row is not gated on the switch) is the user's choice at the start: witnessed as `chosen`
    clock = T4 + 40; settings2['browser.defaultProfile'] = '';
    const chosen = late2('sess-r2-chosen', 'Chosen at a keyless spawn', 'c0f7ab00-r2ch-4000-8000-000000000001', T4 + 40, { witness: witness2({ explicit: PO }) });
    const rc = await openIn(chosen);
    ok(rc.status === 200 && rc.json.kind === 'attachment' && rc.json.profile.id === PO && k2.pinFor(chosen._browserKey).origin === 'chosen', '③f (r2) a profile the user picked in the New Session dialog while the switch was off is witnessed as `chosen` and restored — the pick is no longer lost', { v: verdict(rc, chosen, PO), pin: k2.pinFor(chosen._browserKey) });
    try { await k2.stop(PO).catch(() => { }); } catch { /* none */ }
    await retire(chosen);
    // ── (r2) THE SPAWN ↔ LATE PARITY TABLE: who-list × start-vs-narrowing × default-set-before-vs-after-the-start — with
    //    the witness the two columns are identical; the spawn's own answers are pinned beside them ──
    {
      const rows = [];
      let seq = 0;
      const scene = async ({ scope, startBefore, defaultBefore }) => {
        clock = T0 + 1000 + (++seq) * 100;
        openBank(); settings2['browser.defaultProfile'] = defaultBefore ? 'Bank' : '';
        const narrowAt = clock + 50;
        const startAt = startBefore ? clock : narrowAt + 10;
        const narrow = () => { clock = narrowAt; if (scope === 'one:X') keepBankTo('bk-0000f9f9'); };
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
      // the spawn's own answers: the default in force at the start; no default at the start ⇒ a temporary browser; a
      // profile kept to another conversation refuses a default's pin whenever it started (a default never adds, a date admits nothing)
      const expected = (r) => (!r.defaultBefore ? 'ephemeral' : r.scope === 'all' ? 'admitted' : 'not_owner');
      const offRow = rows.filter((r) => r.spawn !== expected(r));
      ok(!diff.length && !offRow.length, `③f (r2) THE PARITY TABLE (${rows.length} rows: open to all / kept to another conversation × started before / after the narrowing × default set before / after the start): the spawn-keyed session and the witnessed late-keyed one answer IDENTICALLY (never looser, never stricter), and the spawn's column is its own rule — the list, never the clock`, rows);
    }
    // CONTROL (r2): the engine as it was before r2 (the ladder's pick at the MINT) — the same judge sees the later default
    const AT2 = "late = B.lateDefaultPin({ witness, ladder: ladder.refused ? { profileId: '', origin: 'harness' } : ladder });";
    const asBefore = src.replace(AT2, "late = ladder.refused ? { profileId: '', origin: 'harness', at: null, by: null, source: 'none' } : { profileId: ladder.profileId || '', origin: ladder.origin, at: null, by: 'user', source: ladder.origin === 'conversation' ? 'conversation' : 'landing' };");
    if (ok(asBefore !== src && !asBefore.includes(AT2), 'CONTROL ③f (r2): the patched copy (the ladder read at the MINT — the pre-r2 engine)')) {
      const engU = mkEngine2(M.load('src/server/browser-key.js', asBefore, 'ladder-at-mint'));
      R.setup(ctx2(engU));
      clock = T1 + 50; openBank();
      clock = T2 + 50; settings2['browser.defaultProfile'] = 'Old';
      const witU = late2('sess-r2-ctl-wit', 'A1 control (witnessed Old)', 'c0f7ab00-r2c1-4000-8000-000000000002', T2 + 50, { witness: witness2() });
      clock = T3 + 50; settings2['browser.defaultProfile'] = 'Bank';
      clock = T4 + 50;
      const ru2 = await openIn(witU);
      ok(verdict(ru2, witU, PB) === 'admitted' && k2.pinFor(witU._browserKey).profileId === PB, 'CONTROL ③f (r2): that copy ignores the witness — the session that started on Old walks into Bank, the default the user set later; the witness is what keeps it on Old', { v: verdict(ru2, witU, PB), pin: k2.pinFor(witU._browserKey) });
      await retire(witU);
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
      await retire(capL);
    }
    // ── (2.369.196) A WITNESS WIDENS NOTHING: the late key restores the user's own `chosen` pick at a keyless spawn (the
    //    strongest witness there is) and a landing on the current default — neither edits ANY profile's "Who can use it";
    //    the LIST answers the command (Bank is kept to another conversation ⇒ not_owner, by the button) ──
    R.setup(ctx2(mkEngine2(BK)));
    clock = T4 + 70; openBank(); keepBankTo(KEPT); settings2['browser.defaultProfile'] = 'Bank';
    const WB = { profileId: PB, origin: 'chosen', at: T4 + 70, by: 'user', cap: null };
    const chosenB = late2('sess-196-chosen', 'Picked Bank at a keyless spawn', 'c0f7ab00-1960-4000-8000-000000000001', T4 + 70, { witness: WB });
    const landB = late2('sess-196-landing', 'No witness, Bank the default', 'c0f7ab00-1960-4000-8000-000000000002', T4 + 70);
    const owners196 = owners(k2);
    clock = T4 + 71;
    const rw = await openIn(chosenB), rl = await openIn(landB);
    const inList = (x) => B.whoMayUse(k2.profile(PB)).who.some((w) => w.id === B.parentKeyOf(x._browserKey));
    ok(owners(k2) === owners196 && rw.status === 403 && rw.json.code === 'not_owner' && k2.pinFor(chosenB._browserKey).profileId === PB && k2.pinFor(chosenB._browserKey).origin === 'chosen' && !inList(chosenB)
      && rl.status === 403 && rl.json.code === 'not_owner' && k2.pinFor(landB._browserKey).profileId === PB && !inList(landB),
      '③f (2.369.196) a late key restores the pin its start picked — even the user\'s own `chosen` pick — as a PREFERENCE: every profile\'s "Who can use it" byte-identical after the mint, the pin names Bank, the LIST refuses the command not_owner (a landing likewise)', { chosen: [rw.status, rw.json && rw.json.code, k2.pinFor(chosenB._browserKey)], landing: [rl.status, rl.json && rl.json.code], owner: k2.profile(PB).owner });
    await retire(chosenB, landB);
    // ONE judge for the real keeper and the control: restorePin of a `chosen` witness on a profile kept to another
    // conversation — did ANY profile's owner change, and does the list now admit the key?
    const restoreJudge = (kk, P, key) => { const b = owners(kk); const pin = kk.restorePin(key, { ...WB, profileId: P }); return { pin: !!(pin && pin.profileId === P), widened: owners(kk) !== b, admits: B.mayAttach(kk.profile(P), { browserKey: key }).ok }; };
    const realR = restoreJudge(k2, PB, 'bk-0000f1d1');
    ok(realR.pin && !realR.widened && !realR.admits, '③f (2.369.196) keeper.restorePin (the real keeper, direct): the pin is written, NO profile\'s owner changes, the list still refuses the key', realR);
    const ksrcR = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const RP = "    reg.pins[browserKey] = { profileId: p.id, origin: witness.origin, at: Math.min(now(), Number(witness.at) || 0), by: witness.by === 'agent' ? 'agent' : 'user' };\n";
    const widens = ksrcR.replace(RP, RP + "    addConversation(p, browserKey, null, {});\n");
    if (ok(ksrcR.split(RP).length === 2 && widens !== ksrcR, 'CONTROL ③f (2.369.196) setup: restorePin\'s pin write is found exactly once; the patched copy also ADDS the conversation (a witness read as an authorization)')) {
      const DATA3 = path.join(ROOT, 'data-late-pin-ctl'); fs.mkdirSync(DATA3, { recursive: true, mode: 0o700 });
      const kW = M.load('src/server/browser-keeper.js', widens, 'restore-widens').create({ ...keeperOpts2, dataDir: DATA3 });
      kW.reshapeStore((doc) => { const rec = B.newProfileRecord({ id: 'bp-0000f1e1', label: 'Bank', dir: path.join(DATA3, 'p'), now: 1 }); rec.owner = { kind: 'only', who: [{ kind: 'session', id: KEPT }] }; doc.profiles.push(rec); });
      const mutR = restoreJudge(kW, 'bp-0000f1e1', 'bk-0000f1d2');
      ok(mutR.pin && mutR.widened && mutR.admits, 'CONTROL ③f (2.369.196): that copy WIDENS "Who can use it" on a restore (the owner changes, the list now admits the key) — the same judge is RED on it; the real restorePin is what keeps a witness a preference', mutR);
      kW.shutdown();
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
  const profs = [{ id: 'bp-1', label: 'Work', scope: 'all', owner: { kind: 'instance' } }, { id: 'bp-2', label: 'Bank', scope: 'only', owner: { kind: 'only', who: [{ kind: 'session', id: KA }] } }, { id: 'bp-3', label: 'Team', scope: 'all', mediated: true, owner: { kind: 'instance' } }];
  const items = P.pickerItems({ profiles: profs, pinnedId: 'bp-2', onPin() { }, onAdopt() { } });
  const labels = items.map((x) => x.label || '').join('|');
  ok(/Work/.test(labels) && /✓ Bank \(only some conversations\)/.test(labels) && /Team/.test(labels) && !/First chat/.test(labels), 'the picker offers EVERY named profile — a separate-tabs (mediated) one too — and marks one kept to a list "(only some conversations)" (the list itself is drawn in ONE place, the panel)', labels);
  // the rebuilt switch dialog: the pinned profile's "Browser: <name>; switch…" row ONLY when another browser is available for it
  const noChoice = P.pickerItems({ profiles: profs, pinnedId: 'bp-2', chips: { 'bp-2': 'Chromium' }, onSwitch() { }, onPin() { }, onAdopt() { } }).map((x) => x.label || '').join('|');
  const opened = [];
  const withChoice = P.pickerItems({ profiles: profs, pinnedId: 'bp-2', chips: { 'bp-2': 'Chromium' }, choicesOf: (id) => (id === 'bp-2' ? ['cloak'] : []), onSwitch: (id) => opened.push(id), onPin() { }, onAdopt() { } });
  const row = withChoice.find((x) => /^Switch browser \(now Chromium\)…$/.test(x.label || ''));
  if (row) row.action();
  ok(!/Switch browser/.test(noChoice) && !!row && opened.length === 1 && opened[0] === 'bp-2' && !/Backend|chromium \d/.test(withChoice.map((x) => x.label || '').join('|')), 'the picker\'s switch row: absent with no other browser (choicesOf defaulted to none); with one, "Browser: Chromium; switch…" opens the dialog for the pinned profile — the name in words, never a version', { noChoice, withChoice: withChoice.map((x) => x.label) });
}
// ── "WHO CAN USE IT": the client's arithmetic (PURE src/lib/browser-who-model.js — the panel's chips, the dialog's rows) ──
{
  const WM = await import(path.join(REPO, 'src/lib/browser-who-model.js'));
  const t = (x, p) => String(x).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] !== undefined ? p[k] : `{${k}}`));
  const c1 = WM.whoChips({ mode: 'only', who: [{ kind: 'task', id: 'T-X', title: null, deleted: true }] }, { t });
  ok(c1.chips.length === 1 && c1.chips[0].name === 'a deleted Task Group' && c1.chips[0].amber && c1.chips[0].tooltip !== c1.chips[0].name && /Change…/.test(c1.chips[0].tooltip) && c1.nobody === 'Nobody can use it now: the Task Group it was limited to was deleted', 'whoChips: a list whose only row is a deleted Task Group ⇒ an amber chip and "Nobody can use it now: the Task Group it was limited to was deleted" (never everyone)', c1);
  const c2 = WM.whoChips({ mode: 'only', who: [{ kind: 'task', id: 'T-X', deleted: true }, { kind: 'session', key: KA, live: false, conversationId: 'cid-a' }] }, { t, nameOfConversation: () => '' });
  ok(!c2.nobody && c2.chips[1].name === 'A conversation that is not running now' && c2.chips[1].tooltip === 'not running now', '…a stopped conversation is NOT attrition (it resumes under its key): no "nobody" line; unnamed ⇒ "A conversation that is not running now"', c2);
  const c3 = WM.whoChips({ mode: 'only', who: [{ kind: 'task', id: 'T-A', title: 'A', archived: true }, { kind: 'task', id: 'T-B', deleted: true }] }, { t });
  ok(/deleted or archived/.test(c3.nobody) && WM.whoChips({ mode: 'all' }, { t }).mode === 'all' && WM.whoChips({ mode: 'unknown', who: [] }, { t }).nobody.startsWith('Nobody can use it now'), '…an archived + a deleted group ⇒ "deleted or archived"; "all" draws no chip; an unknown list says nobody too');
  const f = WM.foldChips([1, 2, 3, 4, 5, 6].map((n) => ({ name: 'c' + n })), 4, { t });
  ok(f.shown.length === 4 && f.more.n === 2 && f.more.text === '+2 more' && f.more.tooltip === 'c5\nc6' && WM.foldChips([{ name: 'a' }], 2).more === null, 'foldChips: past 4 ⇒ "+N more" whose tooltip lists the rest (2 on the phone)');
  const view = { use: { mode: 'only', who: [{ kind: 'session', key: KA, live: true, sessionId: 'w-1', name: 'First chat' }, { kind: 'session', key: KS, live: false, conversationId: 'cid-s' }, { kind: 'task', id: 'T-GONE', title: null, deleted: true }, { kind: 'task', id: 'T-G', title: 'Ops' }] }, createdBy: { key: 'bk-0000c0aa', conversationId: 'cid-made', live: false } };
  const sessions = [{ id: 'w-1', name: 'First chat', browserKey: KA, backend: 'claude', cwd: '/x/a' }, { id: 'w-2', name: 'Second chat', browserKey: KB, backend: 'codex', cwd: '/x/b' }, { id: 'w-3', name: 'Shell', backend: 'shell' }, { id: 'w-4', name: 'Remote', host: 'box', backend: 'claude' }, { id: 'w-5', name: 'No key yet', backend: 'claude' }];
  const groups = [{ id: 'T-G', title: 'Ops' }, { id: 'T-H', title: 'Other' }, { id: 'T-OLD', title: 'Old', archived: true }];
  const m = WM.pickerRows(view, { sessions, groups, t, nameOfConversation: (cid) => ({ 'cid-s': 'An old chat', 'cid-made': 'The maker' })[cid] || '' });
  const keys = m.rows.map((r) => r.key);
  ok(keys.join() === ['task:T-G', 'task:T-H', 'session:w-1', 'session:w-2', 'session:w-5', 'session:bk:' + KS, 'task:T-GONE', 'session:bk:bk-0000c0aa'].join() && m.remote === true, 'pickerRows: every non-archived Task Group, every live LOCAL agent session (no shell, no remote — `remote` set for the sentence), then the listed rows the roster does not cover and the maker', keys);
  ok(m.selected.join() === ['session:w-1', 'session:bk:' + KS, 'task:T-GONE', 'task:T-G'].join() && JSON.stringify(m.wire.get('session:w-1')) === JSON.stringify({ kind: 'session', key: KA }) && JSON.stringify(m.wire.get('session:w-2')) === JSON.stringify({ kind: 'session', session: 'w-2' }) && m.rows.find((r) => r.key === 'session:bk:bk-0000c0aa').hint === 'made it · not running now' && m.rows.find((r) => r.key === 'session:bk:' + KS).name === 'An old chat', '…the current list starts CHECKED; a listed live session goes back as its KEY, a new pick by its webui id (the server resolves it); the maker says "made it · not running now"', m.selected);
  const who = WM.draftWho(['task:T-G', 'session:w-2', 'nope'], m.wire);
  ok(JSON.stringify(who) === JSON.stringify([{ kind: 'task', id: 'T-G' }, { kind: 'session', session: 'w-2' }]), 'draftWho: the selection → the PATCH rows (an unknown key dropped)');
  const usedBy = [{ key: KA, leased: true, taskIds: [] }, { key: KB, leased: true, taskIds: ['T-G'] }, { key: KC, leased: true, taskIds: ['T-H'] }, { key: KD, leased: false, pinned: true, taskIds: [] }];
  ok(WM.loseCount(usedBy, { mode: 'only', keys: [KA], taskIds: ['T-G'] }) === 1 && WM.loseCount(usedBy, { mode: 'all' }) === 0 && WM.loseCount(usedBy, { mode: 'only', keys: [], taskIds: [] }) === 3, 'loseCount: a lease holder in the draft by key or by one of its Task Groups keeps it; pins are not tabs; "All" takes it from nobody');
  const rw = (code, extra = {}) => WM.refusalWords({ code, name: 'Chat', ...extra }, t);
  ok(rw('no_browser_key') === '“Chat” has no browser of its own yet — restart it (Terminate → Resume), then add it' && /another machine/.test(rw('no_browser_key', { why: 'remote' })) && /nothing was saved/.test(rw('list-changed')) && rw('bad-request') === null && WM.saveWords({ label: 'work', mode: 'only', names: ['Ops', 'First chat'] }, t) === 'Who can use work: Ops, First chat', 'the words by CODE (the device\'s own sentences, never the server\'s); the success toast names the list');
}
// ── "WHO CAN USE IT" IS A LIST — the patched-copy CONTROLS (scripts/mutant-copy.mjs, never src/) + the wiring pins ──
console.log('— the list\'s controls: each rule removed in a patched copy turns its own leg red; the wiring pins');
{
  const bsrc = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const P = (owner) => ({ id: 'bp-0000c0c1', label: 'work', owner });
  const PROFS = [P({ kind: 'instance', id: null }), P({ kind: 'only', who: [{ kind: 'session', id: KA }] }), P({ kind: 'only', who: [{ kind: 'task', id: 'T-G' }] }), P({ kind: 'everyone' })];
  const ASK = [{ browserKey: KA }, { browserKey: KB }, { browserKey: KB, taskIds: ['T-G'] }, { browserKey: KB, groupsUnreadable: true }];
  const sig = (Bm) => PROFS.flatMap((p) => ASK.map((a) => { const v = Bm.mayAttach(p, a); return v.ok ? 'ok' : v.code; })).join(',');
  const real = sig(B);
  // (a) a whoMayUse that reads an unknown shape as "all"
  const aNeedle = "  if (o.kind === 'only' && Array.isArray(o.who)) return { mode: 'only', who: normalizeWho(o.who) };\n  return { mode: 'unknown' };\n";
  ok(bsrc.split(aNeedle).length === 2, 'control (a) setup: the fall-through of whoMayUse is found exactly once');
  const Ba = M.load('src/browser-profiles.js', bsrc.replace(aNeedle, "  if (o.kind === 'only' && Array.isArray(o.who)) return { mode: 'only', who: normalizeWho(o.who) };\n  return { mode: 'all' };\n"), 'who-unknown-all');
  ok(sig(Ba) !== real && Ba.mayAttach(P({ kind: 'everyone' }), { browserKey: KB }).ok, 'CONTROL (a): a whoMayUse reading an unknown shape as "all" admits everyone — THE TABLE\'s unknown row goes red', sig(Ba));
  // (b) a mayAttach that ignores Task Group rows
  const bNeedle = "    if (hit) return { ok: true, via: 'task', taskId: hit.id };\n";
  ok(bsrc.split(bNeedle).length === 2, 'control (b) setup: the Task Group admission is found exactly once');
  const Bb = M.load('src/browser-profiles.js', bsrc.replace(bNeedle, ''), 'no-task-rows');
  ok(sig(Bb) !== real && Bb.mayAttach(PROFS[2], ASK[2]).code === 'not_owner', 'CONTROL (b): a mayAttach ignoring task rows refuses a conversation in the listed Task Group — THE TABLE\'s "B in G" cells go red', sig(Bb));
  // a scratch keeper world seeded straight into its registry (no browser needed: the re-judge and the write are registry acts)
  const seedKeeper = (Kmod, tag, keys = [KA, KB, KC]) => {
    const dd = path.join(ROOT, 'data-ctl-' + tag); fs.mkdirSync(dd, { recursive: true });
    const kk = Kmod.create({ ...taskDeps, dataDir: dd, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => new Set([KA, KB, KC]), log: { log() { }, warn() { }, error() { } }, install: false, now: () => clock });
    kk.reshapeStore((doc) => {
      doc.profiles.push(B.newProfileRecord({ id: 'bp-0000c0d1', label: 'Ctl', dir: path.join(dd, 'p'), now: 1 }));
      for (const bk of keys) doc.leases.push({ profileId: 'bp-0000c0d1', browserKey: bk, sessionId: null, targetId: null, since: 1, input: 'agent', viewers: 0, carrierLostAt: null });
    });
    return kk;
  };
  // (c) a re-judge that detaches on groups_unreadable
  const cNeedle = /      if \(may\.code === 'groups_unreadable'\) \{ out\.undecided\.push\(l\.browserKey\);[^\n]*\n/;
  ok(cNeedle.test(ksrc), 'control (c) setup: the re-judge\'s unreadable branch is found');
  groupsOf.set(KB, ['T-G']); unreadable.add(KC);
  const kReal = seedKeeper(K, 'real-c');
  const rc = kReal.updateProfile('bp-0000c0d1', { use: { mode: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', key: KA }] } });
  const Kc = M.load('src/server/browser-keeper.js', ksrc.replace(cNeedle, ''), 'rejudge-detaches-unreadable');
  const kMut = seedKeeper(Kc, 'mut-c');
  const rcm = kMut.updateProfile('bp-0000c0d1', { use: { mode: 'only', who: [{ kind: 'task', id: 'T-G' }, { kind: 'session', key: KA }] } });
  ok(rc.undecided.join() === KC && !rc.detached.length && kReal.leasesOn('bp-0000c0d1').some((l) => l.browserKey === KC), 'the re-judge (real keeper): an unreadable Task Group list KEEPS the lease (undecided), detaches nothing', rc);
  ok(rcm.detached.map((d) => d.browserKey).join() === KC, 'CONTROL (c): a re-judge that detaches on groups_unreadable takes Third chat\'s tab — the "kept, undecided" leg goes red', rcm);
  unreadable.delete(KC); groupsOf.clear();
  // (d) a PATCH that ignores `base`
  const dNeedle = "      if (!bv.ok) throw namedError(bv.code, bv.error, { added: bv.added || [], removed: bv.removed || [] });\n";
  ok(ksrc.split(dNeedle).length === 2, 'control (d) setup: the keeper\'s re-asked base check is found exactly once');
  const stale = B.useStamp({ owner: { kind: 'only', who: [{ kind: 'session', id: KC }] } });
  const kReal2 = seedKeeper(K, 'real-d');
  const ed = await threw(() => kReal2.updateProfile('bp-0000c0d1', { use: { mode: 'only', who: [{ kind: 'session', key: KA }] }, base: stale }));
  ok(ed && ed.code === 'list-changed' && B.whoMayUse(kReal2.profile('bp-0000c0d1')).mode === 'all', 'the keeper RE-ASKS the base (after the route\'s awaits): a stale one is list-changed, nothing written');
  const Kd = M.load('src/server/browser-keeper.js', ksrc.replace(dNeedle, ''), 'ignores-base');
  const kMut2 = seedKeeper(Kd, 'mut-d');
  const edm = await threw(() => kMut2.updateProfile('bp-0000c0d1', { use: { mode: 'only', who: [{ kind: 'session', key: KA }] }, base: stale }));
  ok(!edm && B.whoMayUse(kMut2.profile('bp-0000c0d1')).mode === 'only', 'CONTROL (d): a keeper ignoring `base` overwrites a list it never read — the 409 leg goes red');
  // (e) a setPin that does not write the list (the 2.369.194 world: the pin itself was the authorization)
  const eNeedle = "    const added = by !== 'agent' && origin === 'chosen' ? addConversation(p, browserKey, facts, { remote }) : null;\n";
  ok(ksrc.split(eNeedle).length === 2, 'control (e) setup: setPin\'s add is found exactly once');
  const kReal3 = seedKeeper(K, 'real-e');
  kReal3.updateProfile('bp-0000c0d1', { use: { mode: 'only', who: [{ kind: 'session', key: KA }] } });
  const pe = kReal3.setPin(KB, 'bp-0000c0d1', { origin: 'chosen', by: 'user' });
  ok(pe.added && B.whoMayUse(kReal3.profile('bp-0000c0d1')).who.some((w) => w.id === KB), 'the user\'s pick shows in the list (the panel draws the list — who can use it is never an invisible second reader)');
  const Ke = M.load('src/server/browser-keeper.js', ksrc.replace(eNeedle, "    const added = null;\n"), 'pin-not-in-list');
  const kMut3 = seedKeeper(Ke, 'mut-e');
  kMut3.updateProfile('bp-0000c0d1', { use: { mode: 'only', who: [{ kind: 'session', key: KA }] } });
  kMut3.setPin(KB, 'bp-0000c0d1', { origin: 'chosen', by: 'user' });
  ok(!B.whoMayUse(kMut3.profile('bp-0000c0d1')).who.some((w) => w.id === KB), 'CONTROL (e): a setPin that does not write the list leaves the pinned conversation OUT of the panel — the "panel shows it" leg goes red');
  // (f) a re-judge that reads a STOPPED holder (no live session carries its key) as "in no group" (2026-09-28)
  const fNeedle = "      const notNow = !!g.unreadable || g.live === false;\n";
  ok(ksrc.split(fNeedle).length === 2, 'control (f) setup: the re-judge\'s "not readable now" rule is found exactly once');
  const KX = 'bk-0000c0e9'; // a key NO live session carries
  const kReal4 = seedKeeper(K, 'real-f', [KA, KX]);
  const rf = kReal4.updateProfile('bp-0000c0d1', { use: { mode: 'only', who: [{ kind: 'task', id: 'T-G' }] } });
  const Kf = M.load('src/server/browser-keeper.js', ksrc.replace(fNeedle, "      const notNow = !!g.unreadable;\n"), 'stopped-is-no-group');
  const kMut4 = seedKeeper(Kf, 'mut-f', [KA, KX]);
  const rfm = kMut4.updateProfile('bp-0000c0d1', { use: { mode: 'only', who: [{ kind: 'task', id: 'T-G' }] } });
  ok(rf.undecided.join() === KX && rf.detached.map((d) => d.browserKey).join() === KA && kReal4.leasesOn('bp-0000c0d1').some((l) => l.browserKey === KX), 'the re-judge (real keeper): a list with a Task Group row keeps a STOPPED holder undecided (its groups are judged at its next command); the live one outside the group is detached', rf);
  ok(rfm.detached.map((d) => d.browserKey).sort().join() === [KA, KX].sort().join() && !rfm.undecided.length, 'CONTROL (f): a re-judge reading "stopped" as "in no group" detaches the stopped holder — the widening leg goes red', rfm);
  for (const kk of [kReal, kMut, kReal2, kMut2, kReal3, kMut3, kReal4, kMut4]) kk.shutdown();
  // (w) ONE WRITE, ONE BROADCAST PER SAVE (verifier 2026-09-28): a narrowing detaches every lease the list no longer
  // admits and `detach()` commits — unbatched, 50 leases were 50 registry writes and 50 whole-digest broadcasts (+ 50
  // active-sessions re-publishes) for one Save; `updateProfile` runs inside `batched`, so the outermost commit is the one
  const wNeedle = "  function updateProfile(id, patch = {}, opts = {}) { return batched(() => updateProfileNow(id, patch, opts)); }\n";
  ok(ksrc.split(wNeedle).length === 2, 'control (w) setup: updateProfile\'s batch wrapper is found exactly once');
  const MANY = Array.from({ length: 50 }, (_, i) => 'bk-' + (0xc100 + i).toString(16).padStart(8, '0'));
  const countedKeeper = (Kmod, tag) => {
    const dd = path.join(ROOT, 'data-ctl-' + tag); fs.mkdirSync(dd, { recursive: true });
    const counts = { broadcasts: 0, writes: 0 };
    const kk = Kmod.create({ ...taskDeps, dataDir: dd, homeDir: HOME, env: () => env, serverSetting: () => undefined, liveKeys: () => new Set(MANY), broadcast: () => { counts.broadcasts++; }, log: { log() { }, warn() { }, error() { } }, install: false, now: () => clock });
    kk.reshapeStore((doc) => {
      doc.profiles.push(B.newProfileRecord({ id: 'bp-0000c0d1', label: 'Ctl', dir: path.join(dd, 'p'), now: 1 }));
      for (const bk of MANY) doc.leases.push({ profileId: 'bp-0000c0d1', browserKey: bk, sessionId: null, targetId: null, since: 1, input: 'agent', viewers: 0, carrierLostAt: null });
    });
    return { kk, counts, dd };
  };
  const narrow = ({ kk, counts, dd }) => {
    const rename = fs.renameSync; counts.broadcasts = 0; counts.writes = 0;
    fs.renameSync = function (a, b) { if (String(b) === path.join(dd, 'browser-profiles.json')) counts.writes++; return rename.call(fs, a, b); };
    try { return kk.updateProfile('bp-0000c0d1', { use: { mode: 'only', who: [{ kind: 'session', key: MANY[0] }] } }); } finally { fs.renameSync = rename; }
  };
  const wReal = countedKeeper(K, 'real-w'); const rw = narrow(wReal);
  ok(rw.detached.length === 49 && wReal.kk.leasesOn('bp-0000c0d1').length === 1 && wReal.counts.writes === 1 && wReal.counts.broadcasts === 1, `a narrowing over 50 leases (real keeper): 49 detached, ONE registry write, ONE broadcast (${wReal.counts.writes} / ${wReal.counts.broadcasts})`, wReal.counts);
  const Kw = M.load('src/server/browser-keeper.js', ksrc.replace(wNeedle, "  function updateProfile(id, patch = {}, opts = {}) { return updateProfileNow(id, patch, opts); }\n"), 'unbatched-narrowing');
  const wMut = countedKeeper(Kw, 'mut-w'); const rwm = narrow(wMut);
  ok(rwm.detached.length === 49 && wMut.counts.writes >= 50 && wMut.counts.broadcasts >= 50, `CONTROL (w): the unbatched keeper writes and broadcasts once PER LEASE (${wMut.counts.writes} writes / ${wMut.counts.broadcasts} broadcasts) — the one-write leg goes red`, wMut.counts);
  wReal.kk.shutdown(); wMut.kk.shutdown();
  // (g) an agent `backend` GET answering the RAW record (the list, other conversations' keys) — 2026-09-28
  // identity r3 (2026-09-28): the routes now carry a SERVER BELT (`router.use(AGENT_PREFIX, agentBelt)`) that masks another
  // conversation's key on every agent answer — a third layer that would swallow these two controls of the VIEW layer (the
  // layered-guard rule: a new layer is peeled out of the old layer's controls, and gets its own — test-browser-identity-census)
  const rsrcAll = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  const BELT_LINE = 'router.use(AGENT_PREFIX, agentBelt);';
  ok(rsrcAll.split(BELT_LINE).length === 2, 'control (g)/(k) setup: the belt line is found once, and is peeled out of the view-layer controls below');
  const rsrcG = rsrcAll.replace(BELT_LINE, '');
  const gNeedle = /profile: B\.agentProfileView\(p, agentFactsOf\(f\), \{ mediated: !!\(v\.profile && v\.profile\.mediated\) \}\)/;
  ok(gNeedle.test(rsrcG), 'control (g) setup: the agent backend route\'s view is found');
  const Rg = M.load('src/routes/browser.js', rsrcG.replace(gNeedle, 'profile: v.profile'), 'backend-raw-record');
  const pG = k.createProfile({ label: 'Ctl G' }, { owner: { kind: 'only', who: [{ kind: 'session', id: KA }] } });
  const sX = mkSession('sess-8', 'bk-0000c0e8', 'Outsider'); active.set('sess-8', sX); live.add('bk-0000c0e8');
  Rg.setup(ctxFor(k));
  const srvG = await serve(Rg.router);
  const jG = jAt(`http://127.0.0.1:${srvG.address().port}`);
  const gReal = await j('GET', `/api/agent/browser/backend?profile=${pG.id}`, undefined, as(sX));
  const gMut = await jG('GET', `/api/agent/browser/backend?profile=${pG.id}`, undefined, as(sX));
  ok(gReal.status === 200 && !('owner' in gReal.json.profile) && !JSON.stringify(gReal.json.profile).includes(KA) && gReal.json.profile.use.you === false, 'the real route: an outsider asking `backend` of a profile kept to First chat gets the agent\'s view (no list, no key)');
  ok(gMut.status === 200 && gMut.json.profile.owner && JSON.stringify(gMut.json.profile.owner).includes(KA), 'CONTROL (g): a route answering the raw record hands the outsider the list with First chat\'s key — the backend leg goes red');
  srvG.close();
  // (h) a PATCH accepting a `key` row of a session on ANOTHER machine — 2026-09-28
  const tsrcH = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8');
  const hNeedle = /          if \(rs\) return res\.status\(STATUS\.no_browser_key\)\.json\([^\n]*\n/;
  ok(hNeedle.test(tsrcH), 'control (h) setup: the remote-holder refusal is found');
  const TRh = M.load('src/routes/browser-trace.js', tsrcH.replace(hNeedle, ''), 'remote-key-row-accepted');
  // identity verify r2 (2026-09-28): the KEEPER now refuses a remote key too (knownKeysOf skips it) — a second layer,
  // peeled out of THIS control: the route-only mutant runs over a keeper that knows no remote key, so the route's own check
  // is what the control measures (the real route over the same keeper still refuses)
  const dH = path.join(ROOT, 'data-ctl-h'); fs.mkdirSync(dH, { recursive: true });
  const kH = mkKeeper(K, { dataDir: dH, remoteKeys: () => new Set() });
  const pH = kH.createProfile({ label: 'Ctl H' }, { owner: { kind: 'only', who: [{ kind: 'session', id: KA }] } });
  const TRreal = M.load('src/routes/browser-trace.js', tsrcH, 'remote-key-row-real');
  for (const [mod, tag] of [[TRreal, 'real'], [TRh, 'mut']]) mod.setup({ keeper: kH, trace, activeSessions: active, bindings, releaseProfile: (id) => R.releaseProfile(id), unpinProfile: (id) => R.unpinProfile(id), notice: () => { }, keyForPickedSession: (id) => R.keyForPickedSession(id), tag });
  const srvHr = await serve(TRreal.router), srvH = await serve(TRh.router);
  const jHr = jAt(`http://127.0.0.1:${srvHr.address().port}`), jH = jAt(`http://127.0.0.1:${srvH.address().port}`);
  const sRh = mkSession('sess-9', 'bk-0000dead', 'Remote chat'); sRh.hostId = 'h1'; active.set('sess-9', sRh); live.add('bk-0000dead');
  const hReal = await jHr('PATCH', `/api/browser/profiles/${pH.id}`, { use: { mode: 'only', who: [{ kind: 'session', key: KA }, { kind: 'session', key: 'bk-0000dead' }] } });
  ok(hReal.status === 409 && hReal.json.code === 'no_browser_key' && hReal.json.why === 'remote' && !B.whoMayUse(kH.profile(pH.id)).who.some((w) => w.id === 'bk-0000dead'), 'the real route (over a keeper that knows no remote key): a remote session\'s key as a `key` row is refused by name, nothing written');
  const hMut = await jH('PATCH', `/api/browser/profiles/${pH.id}`, { use: { mode: 'only', who: [{ kind: 'session', key: KA }, { kind: 'session', key: 'bk-0000dead' }] } });
  ok(hMut.status === 200 && B.whoMayUse(kH.profile(pH.id)).who.some((w) => w.id === 'bk-0000dead'), 'CONTROL (h): a route without the check writes a remote session into the list — the remote-key leg goes red');
  const hKeeper = await threw(() => k.updateProfile(pG.id, { use: { mode: 'only', who: [{ kind: 'session', key: KA }, { kind: 'session', key: 'bk-0000dead' }] } }));
  ok(hKeeper && hKeeper.code === 'unknown_conversation' && !B.whoMayUse(k.profile(pG.id)).who.some((w) => w.id === 'bk-0000dead'), 'the keeper\'s own layer (identity verify r2): a remote key written straight into updateProfile is unknown_conversation (knownKeysOf never lists it)');
  srvH.close(); srvHr.close(); kH.shutdown(); active.delete('sess-9'); live.delete('bk-0000dead'); active.delete('sess-8'); live.delete('bk-0000c0e8');
  // (i) A REMOTE SESSION NEVER HOLDS A LEASE (identity verify r2, 2026-09-28): a keeper copy without the fence at the ONE
  // admission takes the lease and launches this machine's browser for a session on another machine
  const iNeedle = "    if (isRemoteKey(browserKey)) {\n      const rr = B.remoteSessionRefusal({ label: p.label });\n";
  ok(ksrc.split(iNeedle).length === 2, 'control (i) setup: the attach fence is found exactly once');
  const sRi = mkSession('sess-9', 'bk-0000dead', 'Remote chat'); sRi.hostId = 'h1'; active.set('sess-9', sRi); live.add('bk-0000dead');
  const dI = path.join(ROOT, 'data-ctl-i'); fs.mkdirSync(dI, { recursive: true });
  const kIreal = mkKeeper(K, { dataDir: dI });
  const pI = kIreal.createProfile({ label: 'Ctl I' }, { owner: { kind: 'instance', id: null } });
  const eI = await threw(() => kIreal.attach({ profileId: pI.id, browserKey: 'bk-0000dead', sessionId: 'sess-9' }));
  const LI = logOf('launches.log').length;
  ok(eI && eI.code === 'remote_session' && !kIreal.leasesOn(pI.id).length, 'the real keeper: a remote session\'s attach is refused remote_session at the ONE admission (before any launch)');
  kIreal.reshapeStore((doc) => { doc.leases.push({ profileId: pI.id, browserKey: 'bk-0000dead', sessionId: 'sess-9', targetId: null, since: 1, input: 'agent', viewers: 0, carrierLostAt: null }); });
  const eI2 = await threw(() => kIreal.attach({ profileId: pI.id, browserKey: 'bk-0000dead', sessionId: 'sess-9' }));
  ok(eI2 && eI2.code === 'remote_session' && !kIreal.leasesOn(pI.id).some((l) => l.browserKey === 'bk-0000dead'), '…and a lease such a session took BEFORE the fence (planted in the registry) goes with the refusal');
  const Ki = M.load('src/server/browser-keeper.js', ksrc.replace(iNeedle, "    if (false) {\n      const rr = B.remoteSessionRefusal({ label: p.label });\n"), 'no-remote-fence');
  const dIm = path.join(ROOT, 'data-ctl-im'); fs.mkdirSync(dIm, { recursive: true });
  const kImut = mkKeeper(Ki, { dataDir: dIm });
  const pIm = kImut.createProfile({ label: 'Ctl Im' }, { owner: { kind: 'instance', id: null } });
  const eIm = await threw(() => kImut.attach({ profileId: pIm.id, browserKey: 'bk-0000dead', sessionId: 'sess-9' }));
  ok(!eIm && kImut.leasesOn(pIm.id).some((l) => l.browserKey === 'bk-0000dead') && logOf('launches.log').length === LI + 1, 'CONTROL (i): a keeper without the fence leases a session on another machine and launches this machine\'s browser for it — the remote `use` leg goes red', eIm && eIm.message);
  await kImut.stop(pIm.id).catch(() => { }); kImut.shutdown();
  // (j) the ONE add ignoring a remote conversation: a keeper copy whose addConversation skips the remote check writes the
  // remote key into the list on a user's pick (ws-create's form)
  const jNeedle = "    if (isRemoteKey(browserKey, remote)) { log.log?.(`[browser] ${B.parentKeyOf(browserKey)} NOT added to who can use ${p.id} \"${p.label}\" — it runs on another machine`); return null; }\n";
  ok(ksrc.split(jNeedle).length === 2, 'control (j) setup: the add\'s remote check is found exactly once');
  kIreal.updateProfile(pI.id, { use: { mode: 'only', who: [{ kind: 'session', key: KA }] } });
  const pj = kIreal.setPin('bk-0000dead', pI.id, { origin: 'chosen', by: 'user', remote: true });
  ok(pj && !('added' in pj) && !B.whoMayUse(kIreal.profile(pI.id)).who.some((w) => w.id === 'bk-0000dead'), 'the real keeper: the user\'s pick for a remote spawn (remote:true) pins without adding');
  const pj2 = kIreal.setPin('bk-0000dead', pI.id, { origin: 'chosen', by: 'user' });
  ok(pj2 && !('added' in pj2) && !B.whoMayUse(kIreal.profile(pI.id)).who.some((w) => w.id === 'bk-0000dead'), '…and the same pick judged by the wiring\'s remote-key list (no `remote` flag) adds nothing either');
  const Kj = M.load('src/server/browser-keeper.js', ksrc.replace(jNeedle, ''), 'add-ignores-remote');
  const dJ = path.join(ROOT, 'data-ctl-j'); fs.mkdirSync(dJ, { recursive: true });
  const kJ = mkKeeper(Kj, { dataDir: dJ });
  const pJ = kJ.createProfile({ label: 'Ctl J' }, { owner: { kind: 'only', who: [{ kind: 'session', id: KA }] } });
  const pjm = kJ.setPin('bk-0000dead', pJ.id, { origin: 'chosen', by: 'user', remote: true });
  ok(pjm && pjm.added && B.whoMayUse(kJ.profile(pJ.id)).who.some((w) => w.id === 'bk-0000dead'), 'CONTROL (j): an add ignoring the remote check writes the remote session into the list — the "adds nothing" legs go red');
  kJ.shutdown(); kIreal.shutdown(); active.delete('sess-9'); live.delete('bk-0000dead');
  // (k) THE AGENT'S VIEW (identity verify r2, 2026-09-28): a routes copy answering the raw digest + the raw lease rows
  // hands the fork First chat's key and webui id; a PURE copy of agentDigestView keeping rows whole does the same
  const kNeedle1 = "  return B.agentDigestView(k.list(), agentFactsOf(f), (id) => k.profile(id));\n";
  const kNeedle2 = "    const agent = B.agentDigestView({ leases: v.leases, blocked: v.blocked }, agentFactsOf(f));\n";
  ok(rsrcG.split(kNeedle1).length === 2 && rsrcG.split(kNeedle2).length === 2, 'control (k) setup: the digest view and the backend view are found exactly once each');
  const Rk = M.load('src/routes/browser.js', rsrcG.replace(kNeedle1, "  return { ...k.list(), profiles: k.list().profiles.map((row) => B.agentProfileView(k.profile(row.id) || row, agentFactsOf(f), { mediated: row.mediated })) };\n").replace(kNeedle2, "    const agent = { leases: v.leases, blocked: v.blocked };\n"), 'digest-raw-rows');
  Rk.setup(ctxFor(k));
  const srvK = await serve(Rk.router);
  const jK = jAt(`http://127.0.0.1:${srvK.address().port}`);
  const sO = mkSession('sess-8', 'bk-0000c0e8', 'Outsider'); active.set('sess-8', sO); live.add('bk-0000c0e8');
  await k.attach({ profileId: pG.id, browserKey: KA, sessionId: 'sess-1' }).catch(() => { });
  const namesA = (o) => JSON.stringify(o).includes('"' + KA + '"') && JSON.stringify(o).includes('"sess-1"');
  const kReal5 = await j('GET', '/api/agent/browser/profiles', undefined, as(sO)), kMut5 = await jK('GET', '/api/agent/browser/profiles', undefined, as(sO));
  const kReal6 = await j('GET', `/api/agent/browser/backend?profile=${pG.id}`, undefined, as(sO)), kMut6 = await jK('GET', `/api/agent/browser/backend?profile=${pG.id}`, undefined, as(sO));
  ok(kReal5.status === 200 && !namesA(kReal5.json.leases) && kReal6.status === 200 && !namesA(kReal6.json.leases), 'the real routes: the outsider\'s digest and its `backend?profile=` carry no lease row naming First chat');
  ok(kMut5.status === 200 && namesA(kMut5.json.leases) && kMut6.status === 200 && namesA(kMut6.json.leases), 'CONTROL (k): routes answering the raw rows hand the outsider First chat\'s key + webui id in both answers — the agent-view legs go red');
  const kNeedleP = "  if (ownRow(l, myKey)) return { ...l };\n";
  ok(bsrc.split(kNeedleP).length === 2, 'control (k′) setup: agentLeaseRow\'s own-row branch is found exactly once');
  const Bk = M.load('src/browser-profiles.js', bsrc.replace(kNeedleP, "  return { ...l };\n"), 'lease-rows-whole');
  const dv = Bk.agentDigestView({ leases: [{ profileId: 'bp-0000c0c1', browserKey: KA, sessionId: 'sess-1' }], ephemerals: [], blocked: [], pins: {} }, { browserKey: KB });
  ok(dv.leases[0].browserKey === KA && !B.agentDigestView({ leases: [{ profileId: 'bp-0000c0c1', browserKey: KA, sessionId: 'sess-1' }], ephemerals: [], blocked: [], pins: {} }, { browserKey: KB }).leases[0].browserKey, 'CONTROL (k′): a PURE view keeping every lease row whole names the other conversation — the real one does not');
  srvK.close(); try { k.detach({ profileId: pG.id, browserKey: KA, by: 'user' }); } catch { } await k.stop(pG.id).catch(() => { }); active.delete('sess-8'); live.delete('bk-0000c0e8');
  // the wiring pins
  ok(/const added = by !== 'agent' && origin === 'chosen' \? addConversation\(p, browserKey, facts, \{ remote \}\) : null;/.test(ksrc) && /if \(by === 'user'\) \{ added = addConversation\(p, browserKey, facts\); if \(added\) commit\(\); \}/.test(ksrc), 'WIRING: setPin (the user\'s explicit pick) and the UI\'s attach call the ONE add (addConversation)');
  const rsrc2 = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  ok(/return B\.agentDigestView\(k\.list\(\), agentFactsOf\(f\), \(id\) => k\.profile\(id\)\);/.test(rsrc2) && /agentProfileView\(profileOf\(row\.id\) \|\| row, facts/.test(bsrc) && /res\.json\(\{ \.\.\.agentDigest\(k, f\), me: k\.statusFor\(f\.browserKey\) \}\)/.test(rsrc2), 'WIRING: the agent\'s profiles route answers the ONE PURE agent view (every row through agentProfileView, other conversations\' rows reduced)');
  // identity verify r2 (2026-09-28): the remote fence's wiring — the keeper's dep, ws-create's flag, the agent answers' view
  const wsrc0 = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const wscsrc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  ok(/remoteKeys: \(\) => new Set\(\[\.\.\.activeSessions\.values\(\)\]\.filter\(\(s\) => s && s\._browserKey && \(s\.hostId \|\| s\.host \|\| s\._browserVariant === 'H'\)\)/.test(wsrc0) && /setPin\(bk\.key, pin\.profileId, \{ origin: pin\.origin, remote: !!data\.hostId \}\)/.test(wscsrc), 'WIRING (identity verify r2): the wiring hands the keeper the remote sessions\' keys; ws-create\'s explicit pick names a remote spawn');
  ok((rsrc2.match(/attachAnswer\(r, \{ cdp: req\.body\?\.wrapper === true, agent: agentFactsOf\(f\) \}\)/g) || []).length === 3 && /async function resolveForJob\(req, res, k, f\) \{[\s\S]{0,1400}attachAnswer\(r, \{ cdp: req\.body\?\.wrapper === true, agent: agentFactsOf\(f\) \}\)/.test(rsrc2) && /if \(f\.remote\) \{ const rr = B\.remoteSessionRefusal/.test(rsrc2) && /const remote = !!\(s\.hostId \|\| s\.host \|\| s\._browserVariant === require\('\.\.\/browser-profiles\.js'\)\.VARIANTS\.H\);/.test(rsrc2), 'WIRING (identity verify r2): the agent\'s `use` and `resolve` answers ride attachAnswer with the asker\'s facts; pinAnswer refuses a remote session; sessionFacts names `remote`');
  const tsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8');
  ok(/await ctx\.keyForPickedSession\(r\.session\)/.test(tsrc) && /k\.updateProfile\(req\.params\.id, patch, \{ knownKeys \}\)/.test(tsrc), 'WIRING: the PATCH resolves picked sessions through the ONE resolver and hands the keeper the keys it resolved');
  const wsrc = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/if \(!hit\) return \{ ids: \[\], unreadable: false, live: false \};/.test(wsrc) && /live: r\.live !== false/.test(ksrc) && /live: !!u\.sessionId/.test(tsrc), 'WIRING (2026-09-28): the wiring\'s taskIdsForKey says `live: false` for a key no session carries, the keeper reads it, GET …/use carries `live` per holder');
  // THE CENSUS: no `pinned:` / `by:` admission input and no dated-pin reader is left in src/ (a pin never authorizes)
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const offenders = [];
  for (const f of walk(path.join(REPO, 'src'))) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const m of code.matchAll(/\b(?:mayAttach|decideAttach)\(([^)]{0,300})\)/g)) if (/\bpinned\s*:|\bby\s*:/.test(m[1])) offenders.push(path.relative(REPO, f) + ': ' + m[0].slice(0, 90));
    if (/\buserPinned\s*\(|\buserPinAuthorizes\s*\(|\blatePinAt\b/.test(code)) offenders.push(path.relative(REPO, f) + ': a dated-pin reader');
  }
  ok(!offenders.length, 'CENSUS: no `pinned:` / `by:` argument to mayAttach / decideAttach and no dated-pin reader (userPinned / userPinAuthorizes / latePinAt) anywhere in src/', offenders);
  // THE <select> CENSUS of the panel (the principal picker's rule, beside test-principal-picker's): no native select in the
  // Agent browser panel — the 2.369.194 row's `bprof-scope-select` is the pre-fix control
  const judgeSel = (src) => [...src.matchAll(/createElement\('select'\)[^\n]*|el\('select'[^\n]*/g)].map((m) => m[0].slice(0, 80));
  ok(!judgeSel(fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8')).length && !judgeSel(fs.readFileSync(path.join(REPO, 'src/lib/browser-who-dialog.js'), 'utf8')).length, 'the panel and the dialog build NO native <select> — "who" is the principal picker');
  ok(judgeSel("const sel = document.createElement('select'); sel.className = 'bprof-scope-select';\n").length === 1, 'CONTROL: the 2.369.194 row\'s select (planted) IS flagged by the same judge');
  let pre = null;
  try { pre = (await new Promise((res) => execFile('git', ['show', '371642a4:src/lib/browser-trace-view.js'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 24 }, (err, out) => res(err ? null : out)))); } catch { pre = null; }
  if (pre) ok(judgeSel(pre).length >= 1 && /bprof-scope-select/.test(pre), 'CONTROL: the 2.369.194 browser-trace-view.js itself (git 371642a4) is flagged — the census has teeth on the real shape');
  else console.log('  … (371642a4 is not reachable in this checkout — the planted control stands alone)');
  // THE NOTE-LINE CENSUS (the naive-user verifier, 2026-09-28): the who dialog wrote its "will lose it" and empty-list
  // sentences with `lose.querySelector('span')` — a WARNING note's first span is the alert glyph (line-height:0), so the
  // sentence became a 0 px line overlapping the next and running off the phone. Every noteLine() is re-worded through
  // noteText() (its own text span) — never through a bare span selector — in every file of src/lib.
  const judgeNotes = (src) => {
    const out = [];
    for (const m of src.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*noteLine\(/g)) {
      const v = m[1];
      if (new RegExp('\\b' + v + '\\.(?:querySelector|firstElementChild|firstChild|children\\[0\\]|childNodes\\[0\\])').test(src.replace(/\/\/.*$/gm, ''))) out.push(v);
    }
    return out;
  };
  const libDir = path.join(REPO, 'src/lib');
  const noteOffenders = fs.readdirSync(libDir).filter((f) => f.endsWith('.js')).flatMap((f) => judgeNotes(fs.readFileSync(path.join(libDir, f), 'utf8')).map((v) => f + ': ' + v));
  const wd = fs.readFileSync(path.join(libDir, 'browser-who-dialog.js'), 'utf8');
  ok(!noteOffenders.length && /noteText\(lose, /.test(wd) && (wd.match(/noteText\(refusal, /g) || []).length === 3, 'NOTE-LINE CENSUS: no noteLine() in src/lib is re-worded by reaching into its children — the who dialog writes both sentences through noteText()', noteOffenders);
  const preWho = wd.replace(/noteText\(lose, ([^;]*)\);/, "lose.querySelector('span').textContent = $1;");
  ok(preWho !== wd && judgeNotes(preWho).includes('lose'), 'CONTROL: the pre-fix write (`lose.querySelector(\'span\').textContent = …`) is flagged by the same judge');
  const CC = fs.readFileSync(path.join(libDir, 'channel-chrome.js'), 'utf8');
  ok(/s\.className = 'chan-note-text';/.test(CC) && /querySelector\(':scope > \.chan-note-text'\)/.test(CC), 'noteLine() names its text span and noteText() writes only there');
}
// ═══ ④ LANE PROFILE-LOCK-ROLL (2026-10-01): THE LOCK VERDICT KNOWS A RENAMED MACHINE ═══════════════════
// userW's pod rolled (a new hostname, the same RWO home); his pinned profile's SingletonLock named the dead pod and every
// start answered `profile_locked … names another machine … remove SingletonLock` until his agent removed it by hand (W1).
// The witness is the keeper's OWN registry: every launch stamps the record with the machine's hostname; a lock naming a
// hostname this keeper itself launched on is `stale-previous-host` — removed, launched; a foreign hostname it never launched
// on stays refused by name with the two hostnames and the one command. A legacy record inherits the registry FILE's writer.
console.log('— ④ lane profile-lock-roll: a lock under this machine\'s PREVIOUS name is taken over; a stranger\'s stays refused by name');
{
  const HOST = os.hostname();
  const deadPid = await new Promise((resolve) => { const c = spawn('true', [], { stdio: 'ignore' }); c.on('exit', () => resolve(c.pid)); });
  await sleep(50);
  // (a) PURE — the verdict table: ours / previous-host / foreign-unknown / live holder, and the refusal's words
  const D = '/h/.agent-browser/vs-bp-00000001';
  const V = (x) => B.profileLockVerdict({ lock: { host: HOST, pid: 77 }, hostname: HOST, dir: D, minted: true, recorded: null, mark: 'bp-00000001', holder: { pid: 77, alive: true, cmdline: `chrome\0--user-data-dir=${D}\0--vibespace-keeper=bp-00000001`, dirs: [D], starttime: 5, parentIsDaemon: false, parentPid: 1 }, ...x });
  // verify r1 (F1): the roll's lock names a pid that is GONE (the old pod died with it) — the hostname rule's rows say so;
  // the lane's first table left the baseline's LIVE holder under them and so encoded the takeover of a live holder
  const DEAD = { pid: 77, alive: false };
  const rows = [
    [V({}).kind, 'own-orphan', 'ours (this hostname, this record\'s mark, no daemon above it)'],
    [V({ lock: { host: 'pod-old', pid: 77 }, holder: DEAD, launchHosts: ['pod-old'] }).kind, 'stale-previous-host', 'previous-host: the lock names a hostname this keeper launched on (its pid gone — the roll)'],
    [V({ lock: { host: 'pod-old', pid: 77 }, holder: DEAD, launchHosts: ['pod-older', 'pod-old', HOST] }).kind, 'stale-previous-host', 'previous-host: anywhere in the lineage'],
    [V({ lock: { host: 'stranger', pid: 77 }, holder: DEAD, launchHosts: ['pod-old'] }).kind, 'foreign', 'foreign-unknown: a hostname never launched on'],
    [V({ lock: { host: 'stranger', pid: 77 }, holder: DEAD }).kind, 'foreign', 'foreign-unknown: no lineage at all (the pre-lane default)'],
    [V({ lock: { host: 'stranger', pid: 77 }, holder: DEAD, launchHosts: [''] }).kind, 'foreign', 'foreign-unknown: an empty lineage entry is no witness'],
    [V({ lock: { host: HOST, pid: 77 }, launchHosts: ['pod-old'], holder: { pid: 77, alive: true, cmdline: `chrome\0--user-data-dir=${D}\0--vibespace-keeper=bp-00000001`, dirs: [D], starttime: 5, parentIsDaemon: true, parentPid: 70, daemonPid: 70 } }).kind, 'foreign', 'live holder: our hostname, a live daemon above it (the lineage changes nothing on our own name)'],
    [V({ lock: null, launchHosts: ['pod-old'] }).kind, 'free', 'no lock'],
    // verify r1 (F1): a lock under a PREVIOUS name whose pid is ALIVE on this machine and names the directory (the machine
    // was renamed under a running browser) — judged by the holder's own facts, never taken over
    [V({ lock: { host: 'pod-old', pid: 77 }, launchHosts: ['pod-old'] }).kind, 'own-orphan', 'live holder under a previous name: our orphan (ended), never stale-previous-host'],
    [V({ lock: { host: 'pod-old', pid: 77 }, launchHosts: ['pod-old'], holder: { pid: 77, alive: true, cmdline: `chrome\0--user-data-dir=${D}\0--vibespace-keeper=bp-00000001`, dirs: [D], starttime: 5, parentIsDaemon: true, parentPid: 70, daemonPid: 70 } }).kind, 'foreign', 'live holder under a previous name with a live daemon above it: refused by name'],
    [V({ lock: { host: 'pod-old', pid: 77 }, launchHosts: ['pod-old'], preMarkAllowed: false, holder: { pid: 77, alive: true, cmdline: `chrome\0--user-data-dir=${D}`, dirs: [D], starttime: 5, parentIsDaemon: false, parentPid: 1 } }).kind, 'foreign', 'the USER\'s own Chrome on our directory under a previous name: refused by name'],
    [V({ lock: { host: 'pod-old', pid: 77 }, launchHosts: ['pod-old'], holder: { pid: 77, alive: true, cmdline: null } }).kind, 'foreign', 'alive but unreadable under a previous name: refused, never guessed'],
    [V({ lock: { host: 'pod-old', pid: 77 }, launchHosts: ['pod-old'], holder: { pid: 77, alive: true, cmdline: 'sleep\u0000600', dirs: [], starttime: 5, parentIsDaemon: false, parentPid: 1 } }).kind, 'stale-previous-host', 'a recycled pid alive here that does NOT name the directory: still the roll'],
  ];
  const badRows = rows.filter((r) => r[0] !== r[1]);
  ok(!badRows.length, `④a PURE profileLockVerdict: ${rows.length} rows (${rows.map((r) => r[2].split(':')[0]).join(' · ')})`, badRows);
  const prev = V({ lock: { host: 'pod-old', pid: 77 }, holder: DEAD, launchHosts: ['pod-old'] });
  ok(prev.host === 'pod-old' && /previous name, pod-old/.test(prev.why) && /taken over/.test(prev.why) && /SingletonLock/.test(prev.why), '④a the previous-host verdict names the old hostname and says "taken over"', prev.why);
  const unk = V({ lock: { host: 'stranger', pid: 77 }, holder: DEAD, launchHosts: ['pod-old'] });
  const rf = B.profileLockedRefusal({ label: 'Roll', dir: D, verdict: unk });
  ok(rf.code === 'profile_locked' && /stranger/.test(rf.error) && rf.error.includes(HOST) && /rm -f '\/h\/\.agent-browser\/vs-bp-00000001\/SingletonLock'/.test(rf.error) && !/held by another browser process/.test(rf.error) && !/it may be your own browser/.test(rf.error) && !CMDLINE_RE.test(rf.error), '④a the foreign-unknown refusal names BOTH hostnames and the ONE command (never "held by a browser process", never "your own browser")', rf.error);
  ok(B.launchHostsOf({ hosts: ['a', 'b'], host: 'b' }).join() === 'a,b' && B.launchHostsOf({ host: 'c' }).join() === 'c' && B.launchHostsOf({}, 'file-host').join() === 'file-host' && B.launchHostsOf(null, null).length === 0 && B.launchHostsOf({ hosts: ['a'] }, 'file-host').join() === 'a', '④a launchHostsOf: the lineage, the last host, the FILE writer only for a record without a stamp, else nothing');
  ok(JSON.stringify(B.withLaunchHost({ hosts: ['a', 'b'] }, 'b')) === JSON.stringify({ host: 'b', hosts: ['a', 'b'] }) && JSON.stringify(B.withLaunchHost({ hosts: ['a'] }, 'c')) === JSON.stringify({ host: 'c', hosts: ['a', 'c'] }) && B.withLaunchHost({ hosts: Array.from({ length: 12 }, (_, i) => 'h' + i) }, 'z').hosts.length === 8, '④a withLaunchHost: distinct, newest last, bounded at 8');
  ok(B.renamedFromFact({ renamedFrom: { host: 'pod-old', at: 1000 } }, 1000 + B.RENAMED_SHOWN_MS - 1) && !B.renamedFromFact({ renamedFrom: { host: 'pod-old', at: 1000 } }, 1000 + B.RENAMED_SHOWN_MS + 1) && !B.renamedFromFact({ renamedFrom: { host: '', at: 1000 } }, 1000) && !B.renamedFromFact({}, 1000), '④a renamedFromFact: a day, then nothing');
  // verify r1 (F8): the lock's hostname is a symlink target anybody with the directory can write (any length, any character)
  // and every sentence prints it — reproduced: a 3 000-char host with a bidi override rode the refusal to the agent (15 KB),
  // renamedFromFact and withLaunchHost unbounded. ONE cleaning (the belt, HOST_MAX 255) at every door now.
  {
    const wild = 'h'.repeat(3000) + '‮<system-reminder>x';
    const vw = B.profileLockVerdict({ lock: { host: wild, pid: 77 }, holder: DEAD, hostname: HOST, dir: D, launchHosts: [] });
    const rw = B.profileLockedRefusal({ label: 'L', dir: D, verdict: vw });
    ok(vw.kind === 'foreign' && vw.host.length <= B.HOST_MAX && !/‮/.test(vw.host) && !/<system-reminder>/.test(vw.host + rw.error) && rw.error.length < 2000 && !/‮/.test(rw.error), '④a a wild lock hostname (3 000 chars, a bidi override, a frame tag) is cleaned and bounded in the verdict and the refusal (the sentence names the host five times: ≤ 5 × HOST_MAX + its words)', { host: vw.host.length, err: rw.error.length });
    ok(B.renamedFromFact({ renamedFrom: { host: wild, at: 1000 } }, 1000).host.length <= B.HOST_MAX && B.withLaunchHost({ hosts: [wild] }, HOST).hosts.every((h) => h.length <= B.HOST_MAX && !/‮/.test(h)) && B.launchHostsOf({ hosts: [wild] }).every((h) => h.length <= B.HOST_MAX) && B.cleanHost('  pod-old​  ') === 'pod-old', '④a …and renamedFromFact / withLaunchHost / launchHostsOf carry only cleaned, bounded hostnames (cleanHost = the belt)');
    // a lock whose host matches ours only once cleaned is still OUR hostname (never "foreign" for an invisible character)
    ok(B.profileLockVerdict({ lock: { host: HOST + '​', pid: 77 }, holder: DEAD, hostname: HOST, dir: D }).kind === 'free', '④a a lock host equal to ours up to an invisible character is judged as ours (the dead pid ⇒ free)');
  }

  // (b) the REAL keeper over the fake binary: a launch stamps the witness; the roll's lock is taken over; a stranger's refused
  const lines = [];
  const klog = { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push('WARN ' + a.join(' ')), error() { } };
  const DATA_L = path.join(ROOT, 'data-roll'); fs.mkdirSync(DATA_L, { recursive: true });
  const kL = mkKeeper(K, { dataDir: DATA_L, log: klog });
  const plant = (dir, host, pid = deadPid) => { for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, n)); } catch { } } fs.symlinkSync(`${host}-${pid}`, path.join(dir, 'SingletonLock')); fs.symlinkSync(path.join(ROOT, 'gone-socket-dir', 'SingletonSocket'), path.join(dir, 'SingletonSocket')); fs.symlinkSync('0123456789abcdef', path.join(dir, 'SingletonCookie')); };
  const singletons = (dir) => ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].filter((n) => { try { fs.lstatSync(path.join(dir, n)); return true; } catch { return false; } });
  try {
    const roll = kL.createProfile({ label: 'Roll' });
    const L0 = logOf('launches.log').length;
    await kL.attach({ profileId: roll.id, browserKey: KA, sessionId: 'sess-1' });
    let rec = kL._reg().browsers[roll.id];
    ok(rec && rec.state === 'ready' && rec.host === HOST && Array.isArray(rec.hosts) && rec.hosts.join() === HOST && logOf('launches.log').length === L0 + 1, '④b a launch stamps the record with THIS machine\'s hostname (the witness the next pod reads)', { host: rec && rec.host, hosts: rec && rec.hosts });
    const onDisk = JSON.parse(fs.readFileSync(path.join(DATA_L, 'browser-profiles.json'), 'utf8'));
    ok(onDisk.host === HOST && onDisk.browsers[roll.id].host === HOST, '④b …and the registry file names its writer (the legacy witness of a record written before the stamp)', { host: onDisk.host });
    await kL.stop(roll.id, { why: 'user' });
    // THE ROLL: the registry says the last launch was on pod-old (as the file the old pod wrote would), the lock names pod-old
    rec = kL._reg().browsers[roll.id]; rec.host = 'pod-old'; rec.hosts = ['pod-old'];
    plant(roll.dir, 'pod-old');
    const L1 = logOf('launches.log').length;
    const n0 = lines.length;
    const a2 = await kL.attach({ profileId: roll.id, browserKey: KA, sessionId: 'sess-1' });
    rec = kL._reg().browsers[roll.id];
    const said = lines.slice(n0).find((l) => /taken over/.test(l)) || '';
    ok(a2 && a2.browser && a2.browser.state === 'ready' && logOf('launches.log').length === L1 + 1 && singletons(roll.dir).length === 0, '④b THE ROLL: a lock naming a hostname this keeper launched on is taken over — the three Singleton symlinks removed, the browser launched, never profile_locked', { state: a2 && a2.browser && a2.browser.state, left: singletons(roll.dir) });
    ok(/previous name pod-old/.test(said) && /SingletonLock, SingletonSocket, SingletonCookie removed/.test(said) && said.includes(HOST), '④b …said in the journal: the old name, what was removed, this machine\'s name', said);
    ok(rec.host === HOST && rec.hosts.join() === 'pod-old,' + HOST, '④b …the record carries the lineage (pod-old, then this machine)', rec.hosts);
    const pr = kL.profile(roll.id);
    ok(pr.renamedFrom && pr.renamedFrom.host === 'pod-old' && B.renamedFromFact(pr, clock) && B.renamedFromFact(pr, clock).host === 'pod-old' && kL.list().profiles.find((x) => x.id === roll.id).renamedFrom.host === 'pod-old' && kL.list().machine && kL.list().machine.host === HOST, '④b …the profile says "renamed from pod-old" (the digest carries it, the machine\'s own name beside it)', pr.renamedFrom);
    await kL.stop(roll.id, { why: 'user' });
    // THE STRANGER: a hostname this keeper never launched on — refused by name, nothing removed, nothing launched
    plant(roll.dir, 'stranger');
    const L2 = logOf('launches.log').length;
    const e = await threw(() => kL.attach({ profileId: roll.id, browserKey: KA, sessionId: 'sess-1' }));
    ok(e && e.code === 'profile_locked' && /stranger/.test(e.message) && e.message.includes(HOST) && /rm -f '/.test(e.message) && e.message.includes(roll.dir) && !/held by another browser process/.test(e.message) && logOf('launches.log').length === L2 && singletons(roll.dir).length === 3, '④b THE STRANGER: a lock naming a hostname this keeper never launched on is refused by name — both hostnames and the one command; nothing removed, nothing launched', e && e.message);
    for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(roll.dir, n)); } catch { } }
    // verify r1 (F1) THE LIVE HOLDER UNDER A PREVIOUS NAME: a process alive on THIS machine names the directory (the machine
    // was renamed under it); its lock names the old name + its live pid. Reproduced: the lock was unlinked under the live
    // holder and a second browser launched on the directory (the real Chrome refuses any existing lock itself — exit 21 —
    // so only this takeover could land two). Now: judged by the holder's own facts — here our orphan (the mark, no daemon
    // above it): ENDED, nothing taken over, the launch goes on; a user's Chrome would be refused by name (the PURE row).
    {
      rec = kL._reg().browsers[roll.id]; rec.host = 'pod-old'; rec.hosts = ['pod-old'];
      const hp = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)', '--', `--user-data-dir=${roll.dir}`, `--vibespace-keeper=${roll.id}`], { stdio: 'ignore' });
      spawned.add(hp.pid);
      await sleep(200);
      plant(roll.dir, 'pod-old', hp.pid);
      const L3 = logOf('launches.log').length, n3 = lines.length;
      const e3 = await threw(() => kL.attach({ profileId: roll.id, browserKey: KA, sessionId: 'sess-1' }));
      const holderAlive = (() => { try { process.kill(hp.pid, 0); return true; } catch { return false; } })();
      const said3 = lines.slice(n3);
      ok(!e3 && !holderAlive && !said3.some((l) => /taken over/.test(l)) && said3.some((l) => /ended its own orphaned browser pid \d+ before launching/.test(l)) && logOf('launches.log').length === L3 + 1, '④b THE LIVE HOLDER UNDER A PREVIOUS NAME: a process alive here naming the directory is judged by its own facts — our orphan is ENDED (never "taken over" under it), then the launch goes on', { e: e3 && e3.message, holderAlive, said: said3.filter((l) => /taken over|ended|NOT launched/.test(l)) });
      try { process.kill(hp.pid, 'SIGKILL'); } catch { }
      await kL.stop(roll.id, { why: 'user' });
      for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(roll.dir, n)); } catch { } }
    }
    // verify r1 (F5) THE LOCK THAT CANNOT BE REMOVED: the directory is not writable (a volume re-attached read-only after a
    // roll, a directory of another uid after a username migration). Reproduced: the journal said "taken over (nothing left
    // to remove)" and the launch went into the directory still locked (the real Chrome dies on it: exit 21 behind a generic
    // "could not start"). Now: the post-check refuses by name — the errno and the one command — nothing launched.
    const readOnly = async (kk, prof, tag) => {
      rec = kk._reg().browsers[prof.id]; rec.host = 'pod-old'; rec.hosts = ['pod-old']; rec.state = 'stopped';
      plant(prof.dir, 'pod-old');
      fs.chmodSync(prof.dir, 0o500);
      const Lr = logOf('launches.log').length, nr = lines.length;
      const er = await threw(() => kk.attach({ profileId: prof.id, browserKey: KA, sessionId: 'sess-1' }));
      const r = { err: er && er.code, msg: er && er.message, launched: logOf('launches.log').length - Lr, left: singletons(prof.dir).length, said: lines.slice(nr).filter((l) => /could NOT be removed|taken over/.test(l)) };
      fs.chmodSync(prof.dir, 0o700);
      for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(prof.dir, n)); } catch { } }
      try { await kk.stop(prof.id, { why: 'user' }); } catch { /* none */ }
      return r;
    };
    if (process.getuid && process.getuid() === 0) ok(true, '④b (read-only directory leg SKIPPED: root ignores directory modes)');
    else {
      const ro = await readOnly(kL, roll, 'product');
      ok(ro.err === 'profile_locked' && /could not remove the lock \(EACCES\)/.test(ro.msg) && new RegExp(`rm -f '${roll.dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/SingletonLock'`).test(ro.msg) && ro.launched === 0 && ro.left === 3 && ro.said.some((l) => /could NOT be removed \(EACCES\)/.test(l)) && !ro.said.some((l) => /taken over/.test(l)), '④b THE LOCK THAT CANNOT BE REMOVED: a takeover whose unlink fails is refused by name (the errno, the one command), nothing launched, the journal never says "taken over"', ro);
    }
    // (c) THE LEGACY WITNESS: a registry file written by the old pod (its `host` stamp) holding a record from before the
    // per-launch stamp — the lock naming that pod is taken over; the same file without the stamp refuses by name
    for (const [tag, fileHost, expectOk] of [['stamped', 'pod-old', true], ['unstamped', null, false]]) {
      const DATA_X = path.join(ROOT, 'data-legacy-' + tag); fs.mkdirSync(DATA_X, { recursive: true });
      const id = tag === 'stamped' ? 'bp-00000a11' : 'bp-00000a12';
      const dir = path.join(HOME, '.agent-browser', B.profileDirName(id)); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const legacy = { version: 1, ...(fileHost ? { host: fileHost } : {}), profiles: [B.newProfileRecord({ id, label: 'Legacy ' + tag, dir, now: 1 })], leases: [], browsers: { [id]: { profileId: id, ns: 'vs-' + id, pid: null, starttime: null, cdpUrl: null, state: 'stopped', startedAt: 1, endedAt: 2, lastError: null, mark: id } } };
      fs.writeFileSync(path.join(DATA_X, 'browser-profiles.json'), JSON.stringify(legacy));
      plant(dir, 'pod-old');
      const kX = mkKeeper(K, { dataDir: DATA_X, log: klog });
      const Lx = logOf('launches.log').length;
      const ex = await threw(() => kX.attach({ profileId: id, browserKey: KA, sessionId: 'sess-1' }));
      if (expectOk) ok(!ex && logOf('launches.log').length === Lx + 1 && singletons(dir).length === 0 && kX._reg().browsers[id].hosts.join() === 'pod-old,' + HOST, '④c LEGACY + the file\'s writer: a record from before the stamp inherits the hostname the registry file was saved under — the old pod\'s lock is taken over', ex && ex.message);
      else ok(ex && ex.code === 'profile_locked' && /pod-old/.test(ex.message) && logOf('launches.log').length === Lx && singletons(dir).length === 3, '④c LEGACY without a witness: a file with no writer stamp admits nothing — refused by name, the lock left in place (never guessed)', ex && ex.message);
      try { for (const p of kX.list().profiles) await kX.stop(p.id).catch(() => { }); } catch { /* none */ }
      kX.shutdown();
    }
    // verify r1 (F2) THE SECOND BOOT: the file's writer is persisted onto the legacy record at load, so a boot that saves
    // WITHOUT a launch (every boot does: the dead browser is marked stopped) does not lose the witness for the next
    // restart. Reproduced: boot → the file re-stamped under THIS name, the record still unstamped → a second keeper refused
    // the old pod's lock by name (userW's class, one Update later).
    const secondBoot = async (Kmod, tag) => {
      const DATA_X = path.join(ROOT, 'data-legacy2-' + tag); fs.mkdirSync(DATA_X, { recursive: true });
      const id = tag === 'product' ? 'bp-00000a21' : 'bp-00000a22';
      const dir = path.join(HOME, '.agent-browser', B.profileDirName(id)); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const legacy = { version: 1, host: 'pod-old', profiles: [B.newProfileRecord({ id, label: 'Legacy2 ' + tag, dir, now: 1 })], leases: [], browsers: { [id]: { profileId: id, ns: 'vs-' + id, pid: null, starttime: null, cdpUrl: null, state: 'stopped', startedAt: 1, endedAt: 2, lastError: null, mark: id } } };
      fs.writeFileSync(path.join(DATA_X, 'browser-profiles.json'), JSON.stringify(legacy));
      plant(dir, 'pod-old');
      const k1 = mkKeeper(Kmod, { dataDir: DATA_X, log: klog });
      await k1.boot(); k1.createProfile({ label: 'Other' }); // a boot, a save, no launch
      const onDisk = JSON.parse(fs.readFileSync(path.join(DATA_X, 'browser-profiles.json'), 'utf8'));
      k1.shutdown();
      const k2 = mkKeeper(Kmod, { dataDir: DATA_X, log: klog });
      const Lx = logOf('launches.log').length;
      const ex = await threw(() => k2.attach({ profileId: id, browserKey: KA, sessionId: 'sess-1' }));
      const r = { fileHost: onDisk.host, hosts: onDisk.browsers[id].hosts, err: ex && ex.code, launched: logOf('launches.log').length - Lx, left: singletons(dir).length };
      try { for (const p of k2.list().profiles) await k2.stop(p.id).catch(() => { }); } catch { /* none */ }
      k2.shutdown();
      return r;
    };
    const sb = await secondBoot(K, 'product');
    ok(sb.fileHost === HOST && Array.isArray(sb.hosts) && sb.hosts.join() === 'pod-old' && !sb.err && sb.launched === 1 && sb.left === 0, '④c THE SECOND BOOT: a boot that saved without a launch re-stamps the file under this name but the legacy record now CARRIES the old pod as its lineage — the next restart still takes the old pod\'s lock over', sb);
    // (d) CONTROLS — a patched copy per rule
    const bsrc = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
    const noLineage = bsrc.replace("if (ours.includes(lockHost)) return { step: 'hostname', kind: 'stale-previous-host'", "if (false) return { step: 'hostname', kind: 'stale-previous-host'");
    ok(noLineage !== bsrc, '④d control setup: the lineage rule is where the control cuts');
    const Bpre = M.load('src/browser-profiles.js', noLineage, 'no-lineage');
    ok(Bpre.profileLockVerdict({ lock: { host: 'pod-old', pid: 77 }, hostname: HOST, dir: D, launchHosts: ['pod-old'] }).kind === 'foreign', '④d CONTROL: a verdict without the lineage rule reads the previous-host lock as foreign — the ④a row catches it (the pre-lane shape: userW\'s profile_locked)');
    // verify r1 (F1): a copy whose hostname rule ignores a holder alive here — the lane's first shape
    const noLive = bsrc.replace('const liveHere = !!(holder && holder.alive && holder.cmdline != null && (holder.dirs || []).some((d) => sameDir(d, dir)));', 'const liveHere = false; /* CONTROL */');
    ok(noLive !== bsrc, '④d control setup: the live-holder precondition is where the control cuts');
    const Bnl = M.load('src/browser-profiles.js', noLive, 'no-live-here');
    ok(Bnl.profileLockVerdict({ lock: { host: 'pod-old', pid: 77 }, hostname: HOST, dir: D, minted: true, mark: 'bp-00000001', launchHosts: ['pod-old'], holder: { pid: 77, alive: true, cmdline: `chrome\0--user-data-dir=${D}\0--vibespace-keeper=bp-00000001`, dirs: [D], starttime: 5, parentIsDaemon: false, parentPid: 1 } }).kind === 'stale-previous-host', '④d CONTROL: a verdict that does not ask whether the lock\'s pid is alive here takes a LIVE holder\'s lock over — the ④a live-holder rows catch it');
    const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const noStamp = ksrc.replace(/stampLaunchHost\(rec, prevRec, p\.dir \|\| null\); \/\/ lane profile-lock-roll \(L1\)[^\n]*/, '/* CONTROL: no stamp */'); // (r4: the directory rides the stamp)
    const noRemove = ksrc.replace('const removed = F.removeSingletonFiles(dir);', 'const removed = []; /* CONTROL: nothing removed */');
    ok(noStamp !== ksrc && noRemove !== ksrc, '④d control setup: the stamp and the removal are where the controls cut');
    // verify r1 (F2): a copy that keeps the file's writer only in memory — the lane's first shape
    const noLoadStamp = ksrc.replace(/if \(fileHost\) for \(const rec of Object\.values\(reg\.browsers\)\)[^\n]*/, '/* CONTROL: the legacy witness stays in memory */');
    ok(noLoadStamp !== ksrc, '④d control setup: the load-time stamp is where the control cuts');
    const sbc = await secondBoot(M.load('src/server/browser-keeper.js', noLoadStamp, 'no-load-stamp'), 'control');
    ok(sbc.fileHost === HOST && !sbc.hosts && sbc.err === 'profile_locked' && sbc.launched === 0 && sbc.left === 3, '④d CONTROL: a keeper that never persists the file\'s writer onto the legacy record loses the witness at the first save — the second boot refuses the old pod\'s lock by name (the ④c second-boot leg catches it)', sbc);
    const DATA_N = path.join(ROOT, 'data-nostamp'); fs.mkdirSync(DATA_N, { recursive: true });
    const kN = mkKeeper(M.load('src/server/browser-keeper.js', noStamp, 'no-stamp'), { dataDir: DATA_N, log: klog });
    const pN = kN.createProfile({ label: 'NoStamp' });
    await kN.attach({ profileId: pN.id, browserKey: KA, sessionId: 'sess-1' });
    const recN = kN._reg().browsers[pN.id];
    ok(recN && recN.state === 'ready' && !recN.host && !recN.hosts, '④d CONTROL: a keeper that does not stamp the launch host leaves no witness on the record — the ④b stamp leg catches it (the next pod would refuse its own lock)', { host: recN && recN.host });
    await kN.stop(pN.id, { why: 'user' }); kN.shutdown();
    const DATA_R = path.join(ROOT, 'data-noremove'); fs.mkdirSync(DATA_R, { recursive: true });
    const kR = mkKeeper(M.load('src/server/browser-keeper.js', noRemove, 'no-remove'), { dataDir: DATA_R, log: klog });
    const pR = kR.createProfile({ label: 'NoRemove' });
    await kR.attach({ profileId: pR.id, browserKey: KA, sessionId: 'sess-1' });
    await kR.stop(pR.id, { why: 'user' });
    const recR = kR._reg().browsers[pR.id]; recR.host = 'pod-old'; recR.hosts = ['pod-old'];
    plant(pR.dir, 'pod-old');
    const eR = await threw(() => kR.attach({ profileId: pR.id, browserKey: KA, sessionId: 'sess-1' }));
    // verify r1 (F5): a takeover that removes nothing is now REFUSED by the post-check (the lock still there) — the ④b
    // "removed" leg catches the missing removal, the ④b read-only leg catches a missing post-check (the control below)
    ok(eR && eR.code === 'profile_locked' && /could not remove the lock/.test(eR.message) && singletons(pR.dir).length === 3, '④d CONTROL: a takeover that removes nothing leaves the three symlinks and is REFUSED by the post-check — never a launch into the locked directory (the ④b "removed" leg catches the removal)', eR && eR.message);
    for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(pR.dir, n)); } catch { } }
    kR.shutdown();
    if (!(process.getuid && process.getuid() === 0)) {
      const noPost = ksrc.replace('const left = F.singletonLeft(dir);', 'const left = []; /* CONTROL: no post-check */');
      ok(noPost !== ksrc, '④d control setup: the post-check is where the control cuts');
      const DATA_P = path.join(ROOT, 'data-nopost'); fs.mkdirSync(DATA_P, { recursive: true });
      const kP = mkKeeper(M.load('src/server/browser-keeper.js', noPost, 'no-post-check'), { dataDir: DATA_P, log: klog });
      const pP = kP.createProfile({ label: 'NoPost' });
      await kP.attach({ profileId: pP.id, browserKey: KA, sessionId: 'sess-1' });
      await kP.stop(pP.id, { why: 'user' });
      const rp = await readOnly(kP, pP, 'control');
      // (the fake binary writes its own SingletonLock.fake into the read-only directory and dies on it — `launch_failed` — where
      // the real Chrome dies on the lock itself: exit 21; either way the copy went ON to a launch instead of refusing)
      // (verify r3: the post-launch judgement (F3) now catches that launch and names the lock — the copy's own tell is the
      // journal's "nothing left to remove" and the ABSENCE of the F5 refusal before the launch)
      ok(!/could not remove the lock/.test(rp.msg || '') && rp.left === 3 && rp.said.some((l) => /taken over \(nothing left to remove/.test(l)) && !rp.said.some((l) => /could NOT be removed/.test(l)), '④d CONTROL: a takeover without the post-check says "taken over (nothing left to remove)" and goes on to a launch into the directory still locked (it dies there) — the ④b read-only leg catches it', rp);
      kP.shutdown();
    }
  } catch (err) { ok(false, '④ the profile-lock-roll legs threw', err && (err.stack || err.message)); }
  finally { try { for (const p of kL.list().profiles) await kL.stop(p.id).catch(() => { }); } catch { /* none */ } kL.shutdown(); }
}
// ═══ ④e VERIFY r2 (T1): THE LOCK VERDICT AS ONE CLOSED TABLE ═════════════════════════════════════════════════════
// pid {alive here / dead / unreadable} × the lock's hostname {ours / a previous name (witness) / foreign / empty} × the live
// pid's command line {our mark on THIS dir / a Chrome on ANOTHER dir / a Chrome with no mark on this dir (a human's) / NOT a
// Chrome at all (pid reuse: pid_max 4 194 304 wraps about daily on the dev box) / unreadable} × the record {local / ephemeral}
// — every cell pinned; a paired machine's profile is never judged here (browser-serve starts it where it runs). "Alive here"
// alone never makes a live holder: the command line's DIRECTORY must agree (a reused pid under a previous name is still the
// roll; measured on Chrome 154: a previous-host lock makes Chromium HANG on a dialog whether its pid is dead or reused — the
// takeover is the only way up; a same-host lock at a reused non-Chrome pid Chromium clears itself in 0.1 s).
console.log('— ④e verify r2 T1: the lock verdict as ONE closed table (pid × hostname × command line × record), the keeper on the key cells, a control per rule');
{
  const HOST = os.hostname(), PREV = 'pod-old', FOREIGN = 'stranger', D = '/h/.agent-browser/vs-bp-00000001', MARK = 'bp-00000001', EPH = 'bk-0000c001';
  const alive = (cmdline, dirs, extra = {}) => ({ pid: 77, alive: true, cmdline, dirs, starttime: 5, parentIsDaemon: false, parentPid: 1, ...extra });
  const CMD = {
    'mark/this-dir': (mark) => alive(`chrome\0--user-data-dir=${D}\0--vibespace-keeper=${mark}`, [D]),
    'chrome/other-dir': () => alive('chrome\0--user-data-dir=/h/other', ['/h/other']),
    'human/this-dir': () => alive(`chrome\0--user-data-dir=${D}`, [D]),
    'not-a-chrome(reuse)': () => alive('sleep\u0000600', []),
  };
  const HOSTS = { ours: HOST, previous: PREV, foreign: FOREIGN, empty: '' };
  const base = (rec) => ({ hostname: HOST, dir: D, minted: true, recorded: null, mark: rec === 'ephemeral' ? EPH : MARK, preMarkAllowed: false, launchHosts: [PREV] });
  const V = (rec, x) => B.profileLockVerdict({ ...base(rec), ...x });
  const name = (v) => v.kind === 'own-orphan' ? 'take-over' : v.kind === 'free' ? 'launch' : v.kind === 'foreign' && /cannot be read/.test(v.why || '') ? 'unreadable-refused' : v.kind === 'foreign' ? `refused${v.user ? '(user)' : ''}` : v.kind;
  const EXP = {
    none: 'launch',
    'dead|ours': 'launch', 'dead|previous': 'stale-previous-host', 'dead|foreign': 'refused', 'dead|empty': 'launch',
    'unreadable|ours': 'unreadable-refused', 'unreadable|previous': 'unreadable-refused', 'unreadable|foreign': 'unreadable-refused', 'unreadable|empty': 'unreadable-refused',
    'alive|ours|mark/this-dir': 'take-over', 'alive|ours|chrome/other-dir': 'launch', 'alive|ours|human/this-dir': 'refused(user)', 'alive|ours|not-a-chrome(reuse)': 'launch',
    'alive|previous|mark/this-dir': 'take-over', 'alive|previous|chrome/other-dir': 'stale-previous-host', 'alive|previous|human/this-dir': 'refused(user)', 'alive|previous|not-a-chrome(reuse)': 'stale-previous-host',
    'alive|foreign|mark/this-dir': 'take-over', 'alive|foreign|chrome/other-dir': 'refused', 'alive|foreign|human/this-dir': 'refused(user)', 'alive|foreign|not-a-chrome(reuse)': 'refused',
    'alive|empty|mark/this-dir': 'take-over', 'alive|empty|chrome/other-dir': 'launch', 'alive|empty|human/this-dir': 'refused(user)', 'alive|empty|not-a-chrome(reuse)': 'launch',
  };
  const table = (Bm) => { // every cell of both records → the mismatches
    const Vm = (rec, x) => Bm.profileLockVerdict({ ...base(rec), ...x });
    const bad = []; let n = 0;
    for (const rec of ['local', 'ephemeral']) {
      const mark = rec === 'ephemeral' ? EPH : MARK;
      const row = (key, v) => { n++; const got = name(v); if (got !== EXP[key]) bad.push(`${rec} ${key}: ${got} (expected ${EXP[key]})`); };
      row('none', Vm(rec, { lock: null }));
      for (const [hn, h] of Object.entries(HOSTS)) {
        row(`dead|${hn}`, Vm(rec, { lock: { host: h, pid: 77 }, holder: { pid: 77, alive: false } }));
        row(`unreadable|${hn}`, Vm(rec, { lock: { host: h, pid: 77 }, holder: { pid: 77, alive: true, cmdline: null } }));
        for (const cn of Object.keys(CMD)) row(`alive|${hn}|${cn}`, Vm(rec, { lock: { host: h, pid: 77 }, holder: CMD[cn](mark) }));
      }
    }
    // the live-holder column's variants, every hostname: a daemon above it, another record's mark, the recorded identity, a reused recorded pid, the pre-mark launch
    for (const [hn, h] of Object.entries(HOSTS)) {
      const L = { host: h, pid: 77 };
      const vv = [
        [Vm('local', { lock: L, holder: alive(`chrome\0--user-data-dir=${D}\0--vibespace-keeper=${MARK}`, [D], { parentIsDaemon: true, daemonPid: 70 }) }).kind, 'foreign', 'our mark under a live daemon'],
        [Vm('local', { lock: L, holder: alive(`chrome\0--user-data-dir=${D}\0--vibespace-keeper=bp-00000009`, [D]) }).kind, 'foreign', 'another record\'s mark'],
        [Vm('local', { lock: L, holder: alive(`chrome\0--user-data-dir=${D}`, [D]), recorded: { pid: 77, starttime: 5 } }).kind, 'own-orphan', 'the recorded browser (pid AND starttime)'],
        [Vm('local', { lock: L, holder: alive(`chrome\0--user-data-dir=${D}`, [D]), recorded: { pid: 77, starttime: 6 } }).kind, 'foreign', 'the recorded pid at another starttime (reused)'],
        [Vm('local', { lock: L, holder: alive(`chrome\0--user-data-dir=${D}\0--remote-debugging-port=0`, [D]), preMarkAllowed: true }).kind, 'own-orphan', 'the pre-mark CLI launch, a record from before the mark'],
      ];
      for (const [got, want, what] of vv) { n++; if (got !== want) bad.push(`${hn} ${what}: ${got} (expected ${want})`); }
    }
    return { n, bad };
  };
  const t = table(B);
  ok(!t.bad.length, `④e THE CLOSED TABLE: ${t.n} cells (2 records × (1 + 4 hosts × 6) + 4 hosts × 5 variants), every one as the rule says`, t.bad);
  // the KEEPER on the key cells with REAL processes (lockHolderFacts reads /proc): a live sleep at the lock's pid = pid reuse
  const procs = []; const liveP = (args) => { const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)', '--', ...args], { stdio: 'ignore' }); procs.push(c); return c; };
  const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const plantE = (dir, host, pid) => { for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, n)); } catch { } } fs.symlinkSync(`${host}-${pid}`, path.join(dir, 'SingletonLock')); fs.symlinkSync(path.join(ROOT, 'gone-socket-dir', 'SingletonSocket'), path.join(dir, 'SingletonSocket')); fs.symlinkSync('0123456789abcdef', path.join(dir, 'SingletonCookie')); };
  const singletonsE = (dir) => ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].filter((n) => { try { fs.lstatSync(path.join(dir, n)); return true; } catch { return false; } });
  const DATA_E = path.join(ROOT, 'data-table'); fs.mkdirSync(DATA_E, { recursive: true });
  const linesE = []; const klogE = { log: (...a) => linesE.push(a.join(' ')), warn: (...a) => linesE.push('WARN ' + a.join(' ')), error() { } };
  const kE = mkKeeper(K, { dataDir: DATA_E, log: klogE });
  const mkProf = async (label) => { const p = kE.createProfile({ label }); await kE.attach({ profileId: p.id, browserKey: KA, sessionId: 'sess-1' }); await kE.stop(p.id, { why: 'user' }); const r = kE._reg().browsers[p.id]; r.host = PREV; r.hosts = [PREV]; return p; };
  const leg = async (label, host, args, { err = null, launched = 1, left = 0, mark = null, ended = false } = {}) => {
    const p = await mkProf(label); const pr = liveP(args.map((a) => a.replace('<dir>', p.dir).replace('<mark>', p.id))); await sleep(120); plantE(p.dir, host, pr.pid);
    const L0 = logOf('launches.log').length, l0 = linesE.length;
    const e = await threw(() => kE.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-2' })); await sleep(150);
    const got = { err: e ? e.code : null, launched: logOf('launches.log').length - L0, left: singletonsE(p.dir).length, holderAlive: isAlive(pr.pid), said: linesE.slice(l0).filter((x) => /taken over|NOT launched|ended its own/.test(x)).map((x) => x.slice(0, 120)) };
    ok(got.err === err && got.launched === launched && got.left === left && got.holderAlive === !ended, `④e keeper: ${label} ⇒ ${got.err || 'launched'} (${got.launched} launch, ${got.left} singleton(s) left, the process ${got.holderAlive ? 'alive' : 'gone'})`, got);
    try { await kE.stop(p.id, { why: 'user' }); } catch { /* none */ }
  };
  await leg('pid REUSE under the previous name (a live sleep at the lock pid) — still the roll', PREV, ['--not-a-browser']);
  await leg('pid REUSE under OUR name — free, the stale lock left for Chromium (it clears a same-host one itself)', HOST, ['--not-a-browser'], { left: 3 });
  await leg('a Chrome on ANOTHER directory under the previous name — the roll', PREV, ['--user-data-dir=/h/elsewhere']);
  await leg('a HUMAN\'s Chrome on this directory under the previous name — refused by name, left running', PREV, ['--user-data-dir=<dir>'], { err: 'profile_locked', launched: 0, left: 3 });
  // verify r2 (F4): reproduced here — the ended orphan's lock stayed under the previous name (3 left) and the launch went into it
  await leg('OUR mark on this directory under the previous name — ours, ended, its stale lock removed, launched (never a takeover)', PREV, ['--user-data-dir=<dir>', '--vibespace-keeper=<mark>'], { ended: true });
  ok(linesE.some((l) => /the ended orphan's lock named this machine's previous name pod-old/.test(l) && /SingletonLock, SingletonSocket, SingletonCookie removed/.test(l)), '④e …said in the journal: the ended orphan\'s previous-name lock removed (the three names)');
  { // the recorded pid at ANOTHER starttime (a reused pid of the recorded browser), no mark ⇒ refused, left running
    const p = await mkProf('recorded pid reused'); const pr = liveP([`--user-data-dir=${p.dir}`]); await sleep(120); plantE(p.dir, HOST, pr.pid);
    kE._reg().browsers[p.id].browser = { pid: pr.pid, starttime: 1, dir: p.dir }; const L0 = logOf('launches.log').length;
    const e = await threw(() => kE.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-2' }));
    ok(e && e.code === 'profile_locked' && logOf('launches.log').length === L0 && isAlive(pr.pid), '④e keeper: the RECORDED pid at another starttime (reused), no mark ⇒ refused by name, left running', e && e.message);
    try { await kE.stop(p.id, { why: 'user' }); } catch { /* none */ }
  }
  try { for (const p of kE.list().profiles) await kE.stop(p.id).catch(() => { }); } catch { /* none */ } kE.shutdown();
  // CONTROLS — a patched copy per rule of the hostname branch (the lineage rule and the whole precondition have theirs in ④d)
  const bsrcE = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
  const aliveAlone = bsrcE.replace('const liveHere = !!(holder && holder.alive && holder.cmdline != null && (holder.dirs || []).some((d) => sameDir(d, dir)));', 'const liveHere = !!(holder && holder.alive); /* CONTROL: alive here alone */');
  const unreadableAsDead = bsrcE.replace("if (holder && holder.alive && holder.cmdline == null) return { step: 'hostname', kind: 'foreign', pid, host: lockHost, why: `the lock (${lockPath}) was written on ${lockHost} and names pid ${pid}, which is alive on this machine but whose command line cannot be read", "if (false) return { step: 'hostname', kind: 'foreign', pid, host: lockHost, why: `the lock (${lockPath}) was written on ${lockHost} and names pid ${pid}, which is alive on this machine but whose command line cannot be read");
  ok(aliveAlone !== bsrcE && unreadableAsDead !== bsrcE, '④e control setup: the directory test and the unreadable rule are where the controls cut');
  const tA = table(M.load('src/browser-profiles.js', aliveAlone, 'alive-alone'));
  ok(tA.bad.some((x) => /previous\|not-a-chrome\(reuse\): launch/.test(x)) && tA.bad.some((x) => /previous\|chrome\/other-dir: launch/.test(x)), '④e CONTROL: a verdict for which "alive here" alone is a live holder hands a reused pid under the previous name to Chromium as free — the launch hangs on its dialog (measured) — the table catches it', tA.bad.slice(0, 4));
  // verify r2 (F4) CONTROL: a keeper that ends its orphan under a previous name and launches into the lock it left
  {
    const ksrcE = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    const noClear = ksrcE.replace('function clearEndedOrphanLock(p, dir, endedPid = null) {\n    const lk = F.readSingletonLock(dir);', 'function clearEndedOrphanLock(p, dir, endedPid = null) {\n    const lk = null; /* CONTROL: the ended orphan\'s lock is left */');
    ok(noClear !== ksrcE, '④e control setup: the ended orphan\'s lock removal is where the control cuts');
    const DATA_C = path.join(ROOT, 'data-table-ctl'); fs.mkdirSync(DATA_C, { recursive: true });
    const kC = mkKeeper(M.load('src/server/browser-keeper.js', noClear, 'no-ended-orphan-lock-clear'), { dataDir: DATA_C, log: klogE });
    const pC = kC.createProfile({ label: 'Ctl' }); await kC.attach({ profileId: pC.id, browserKey: KA, sessionId: 'sess-1' }); await kC.stop(pC.id, { why: 'user' });
    const rC = kC._reg().browsers[pC.id]; rC.host = PREV; rC.hosts = [PREV];
    const prC = liveP([`--user-data-dir=${pC.dir}`, `--vibespace-keeper=${pC.id}`]); await sleep(120); plantE(pC.dir, PREV, prC.pid);
    const eC = await threw(() => kC.attach({ profileId: pC.id, browserKey: KB, sessionId: 'sess-2' })); await sleep(150);
    ok(!eC && !isAlive(prC.pid) && singletonsE(pC.dir).length === 3, '④e CONTROL: a keeper that leaves the ended orphan\'s previous-name lock launches into a directory Chromium will refuse (the three names still there) — the ④e "ours, ended" leg catches it', { err: eC && eC.code, left: singletonsE(pC.dir).length });
    try { await kC.stop(pC.id, { why: 'user' }); } catch { /* none */ } kC.shutdown();
  }
  const tU = table(M.load('src/browser-profiles.js', unreadableAsDead, 'unreadable-as-dead'));
  ok(tU.bad.some((x) => /unreadable\|previous: stale-previous-host/.test(x)), '④e CONTROL: a verdict that treats an unreadable live pid under the previous name as gone takes its lock over (a holder it could not read) — the table catches it', tU.bad.slice(0, 4));
  for (const pr of procs) { try { pr.kill('SIGKILL'); } catch { } }
}
// ═══ ④f VERIFY r2 (F1): A DIRECTORY TAKEN BETWEEN THE VERDICT AND THE LAUNCH IS NAMED ════════════════════════════
// Reproduced: the verdict read a free directory, the user's own Chrome took it before the launch ran, the binary refused
// (exit 21 on its SingletonLock) and the keeper answered a generic `launch_failed: the browser did not start` (the
// died-at-birth path: `browser_closed … a crash at startup?`); only the NEXT command said `profile_locked` by name. Now the
// failed launch judges the lock again and names the holder at the first answer; the holder is left running.
console.log('— ④f verify r2 F1: a holder that takes the directory between the verdict and the launch is named at the FIRST answer');
{
  const lines = [];
  const klog = { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push('WARN ' + a.join(' ')), error() { } };
  const DATA_F = path.join(ROOT, 'data-race'); fs.mkdirSync(DATA_F, { recursive: true });
  const procs = [];
  const singletonsF = (dir) => ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].filter((n) => { try { fs.lstatSync(path.join(dir, n)); return true; } catch { return false; } });
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  // the user's own browser on the directory: a live process whose command line names it (no mark of ours) + the three
  // symlinks under THIS hostname + the fake binary's own lock (so its launch refuses like Chrome's exit 21)
  const takeDir = async (dir) => { const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)', '--', `--user-data-dir=${dir}`], { stdio: 'ignore' }); procs.push(c); await sleep(120); for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, n)); } catch { } } fs.symlinkSync(`${os.hostname()}-${c.pid}`, path.join(dir, 'SingletonLock')); fs.symlinkSync(path.join(ROOT, 'gone-socket-dir', 'SingletonSocket'), path.join(dir, 'SingletonSocket')); fs.symlinkSync('0123456789abcdef', path.join(dir, 'SingletonCookie')); fs.writeFileSync(path.join(dir, 'SingletonLock.fake'), String(c.pid)); return c; };
  // the race: the runtime's launch is reached AFTER the verdict — the directory is taken right there, then the real launch runs
  const racing = (rt) => new Proxy(rt, { get(t, k) { if (k !== 'launch') return t[k]; return async (ns, o) => { if (o && o.dir && !fs.existsSync(path.join(o.dir, 'SingletonLock.fake'))) await takeDir(o.dir); return t.launch(ns, o); }; } });
  const run = async (Kmod, tag) => {
    const dd = path.join(DATA_F, tag); fs.mkdirSync(dd, { recursive: true });
    const kk = mkKeeper(Kmod, { dataDir: dd, runtime: racing(F.createBrowserRuntime({ env })), log: klog });
    const p = kk.createProfile({ label: 'Race ' + tag });
    const R0 = logOf('refused.log').length, L0 = logOf('launches.log').length;
    const e1 = await threw(() => kk.attach({ profileId: p.id, browserKey: KA, sessionId: 'sess-1' }));
    const e2 = await threw(() => kk.attach({ profileId: p.id, browserKey: KA, sessionId: 'sess-1' }));
    const holder = Number(fs.readFileSync(path.join(p.dir, 'SingletonLock.fake'), 'utf8'));
    const r = { e1: e1 && { code: e1.code, message: e1.message }, e2: e2 && { code: e2.code, message: e2.message }, refused: logOf('refused.log').length - R0, launched: logOf('launches.log').length - L0, left: singletonsF(p.dir).length, holderAlive: alive(holder) };
    kk.shutdown();
    return r;
  };
  const r = await run(K, 'product');
  ok(r.refused >= 1 && r.launched === 0 && r.e1 && r.e1.code === 'profile_locked' && /your own browser/.test(r.e1.message) && !/the browser did not start|crash at startup/.test(r.e1.message), '④f THE RACE: the binary refused the launch on the lock planted after the verdict (exit 21) and the FIRST answer names the holder — profile_locked, "it may be your own browser", never "did not start"', r);
  ok(r.e2 && r.e2.code === 'profile_locked' && r.left === 3 && r.holderAlive, '④f …the next command says the same; the holder is left running, its lock untouched', r);
  ok(lines.some((l) => /taken while launching/.test(l) && /profile_locked|your own browser/.test(l)), '④f …said in the journal: the directory was taken while launching', lines.filter((l) => /Race product/.test(l)).slice(-2));
  // CONTROL: a keeper that never judges the lock again after a failed launch — the reproduced shape
  const ksrcF = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const noRejudge = ksrcF.replace('function lockRefusalAfterLaunch(p, prev) {\n    if (!p || !p.dir) return null;', 'function lockRefusalAfterLaunch(p, prev) {\n    if (p) return null; /* CONTROL: no second judgement */');
  ok(noRejudge !== ksrcF, '④f control setup: the second judgement is where the control cuts');
  const c = await run(M.load('src/server/browser-keeper.js', noRejudge, 'no-rejudge-after-launch'), 'control');
  ok(c.e1 && c.e1.code === 'launch_failed' && c.e2 && c.e2.code === 'profile_locked', '④f CONTROL: without the second judgement the first answer is a generic launch_failed and only the next command names the holder — the ④f race leg catches it', c);
  for (const pr of procs) { try { pr.kill('SIGKILL'); } catch { } }
}
// ═══ ④g VERIFY r3: THE ONE ORDERED VERDICT, THE CENSUS OF SAID THINGS, AND THE FOUR FINDINGS ═══════════════════════
// T1: the ladder is ONE PURE function (`lockVerdict`, five steps in ONE order: a live holder's own facts → the hostname rule →
// the ended orphan's clear → the launch → the post-launch judgement); the order is pinned on the PURE answers (`step`), on the
// keeper's source (the call positions) and by a CONTROL that swaps two steps (the clear before the end: the ④e shape goes red).
// Every sentence the lane adds is in a grep-derived CENSUS — one wording per event, its sites counted. The findings, each
// reproduced first (plv3-attacks.mjs / plv3-real.mjs under the lane notes): F1 a clear that FAILS (EACCES) said and refused
// by name (it launched into the lock: "nothing removed"); F2 the clear keyed on the ORPHAN'S pid (a lock rewritten meanwhile was
// removed and called "this machine's previous name"); F3 a previous name's lock that reached the launch is taken over now and
// named (the real binary refused it in 1.4 s, the answer was a generic launch_failed with an empty journal); F4 the rebound note
// rides the lease until an answer is DELIVERED (a client gone before the write left the agent untold, the mark spent).
console.log('— ④g verify r3: the ONE ordered lock verdict (+ the swap control), the census of said things, F1–F4 with controls, the ephemeral row');
{
  const KS = require('../src/server/browser-kept.js');
  const HOSTg = os.hostname(), PREV = 'pod-old', STRANGER = 'stranger';
  const Dg = '/h/.agent-browser/vs-bp-00000001';
  // ── T1 (a) the PURE order: the ladder's steps, in order, and every answer names its step ──
  ok(JSON.stringify(B.LOCK_LADDER.map((s) => s.step)) === JSON.stringify(['live-holder', 'hostname', 'ended-orphan', 'launch', 'post-launch']) && B.LOCK_LADDER.every((s) => s.phase && s.what), '④g T1 LOCK_LADDER: five steps in ONE order — live-holder, hostname, ended-orphan, launch, post-launch', B.LOCK_LADDER.map((s) => s.step));
  const liveUnderPrev = B.lockVerdict({ lock: { host: PREV, pid: 77 }, holder: { pid: 77, alive: true, cmdline: `chrome\0--user-data-dir=${Dg}\0--vibespace-keeper=bp-00000001`, dirs: [Dg], starttime: 5 }, hostname: HOSTg, dir: Dg, minted: true, mark: 'bp-00000001', preMarkAllowed: false, launchHosts: [PREV] });
  const deadUnderPrev = B.lockVerdict({ lock: { host: PREV, pid: 77 }, holder: { pid: 77, alive: false }, hostname: HOSTg, dir: Dg, launchHosts: [PREV] });
  const noLock = B.lockVerdict({ lock: null, hostname: HOSTg, dir: Dg });
  ok(liveUnderPrev.step === 'live-holder' && liveUnderPrev.kind === 'own-orphan' && deadUnderPrev.step === 'hostname' && deadUnderPrev.kind === 'stale-previous-host' && noLock.step === 'live-holder' && noLock.kind === 'free', '④g T1 the `before` phase: a LIVE holder under a previous name is decided by its own facts (step live-holder, never the hostname rule); a dead one by the hostname rule; no lock = step live-holder', [liveUnderPrev.step, deadUnderPrev.step, noLock.step]);
  const endedOk = B.lockVerdict({ phase: 'ended', lock: { host: PREV, pid: 77 }, hostname: HOSTg, alive: false, endedPid: 77 });
  const endedOther = B.lockVerdict({ phase: 'ended', lock: { host: STRANGER, pid: 78 }, hostname: HOSTg, alive: false, endedPid: 77 });
  const endedAlive = B.lockVerdict({ phase: 'ended', lock: { host: PREV, pid: 77 }, hostname: HOSTg, alive: true, endedPid: 77 });
  const endedOurs = B.lockVerdict({ phase: 'ended', lock: { host: HOSTg, pid: 77 }, hostname: HOSTg, alive: false, endedPid: 77 });
  const endedNone = B.lockVerdict({ phase: 'ended', lock: null, hostname: HOSTg, endedPid: 77 });
  ok(endedOk.step === 'ended-orphan' && endedOk.kind === 'clear' && endedOther.kind === 'leave' && /not the orphan ended \(pid 77\)/.test(endedOther.why) && endedAlive.kind === 'leave' && endedOurs.kind === 'none' && endedNone.kind === 'none', '④g T1 the `ended` phase: THAT lock (the orphan\'s pid, a previous name, dead) ⇒ clear; another pid / alive ⇒ leave (judged again at the launch); ours / none ⇒ nothing', [endedOk.kind, endedOther.kind, endedAlive.kind, endedOurs.kind, endedNone.kind]);
  const afterForeign = B.lockVerdict({ phase: 'after-launch', lock: { host: STRANGER, pid: 77 }, holder: { pid: 77, alive: false }, hostname: HOSTg, dir: Dg, launchHosts: [PREV] });
  const afterPrev = B.lockVerdict({ phase: 'after-launch', lock: { host: PREV, pid: 77 }, holder: { pid: 77, alive: false }, hostname: HOSTg, dir: Dg, launchHosts: [PREV] });
  const afterOurs = B.lockVerdict({ phase: 'after-launch', lock: { host: HOSTg, pid: 77 }, holder: { pid: 77, alive: false }, hostname: HOSTg, dir: Dg, launchHosts: [PREV] });
  ok(afterForeign.step === 'post-launch' && afterForeign.kind === 'refuse' && afterPrev.kind === 'take-over' && afterOurs.kind === 'none', '④g T1 the `after-launch` phase: a foreign holder ⇒ refuse (named); a previous name\'s lock that reached the launch ⇒ take-over (named); our own dead-pid lock ⇒ none (the launch\'s own cause stands)', [afterForeign.kind, afterPrev.kind, afterOurs.kind]);
  // ── T1 (b) the keeper's source walks the ladder in that order (positions, grep-derived) ──
  const ksrcG = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const at = (re, from = 0) => { const i = ksrcG.slice(from).search(re); return i < 0 ? -1 : i + from; };
  const cpl = at(/async function clearProfileLock\(/), endAt = at(/const r = await endProcess\(v\.pid, facts\.holder\.starttime\);/, cpl), clrAt = at(/clearEndedOrphanLock\(p, p\.dir, v\.pid\)/, endAt);
  const startAt = at(/const lk = await clearProfileLock\(p, ns, prevRec\);/), launchAt = at(/const r = await rt\.launch\(ns, \{ dir: p\.dir/, startAt), postAt = at(/lockRefusalAfterLaunch\(p, prevRec\)/, launchAt);
  const healAt = at(/function healBrowser\(/), hEnd = at(/const e = await endProcess\(v\.pid, f\.holder\.starttime\);/, healAt), hClr = at(/clearEndedOrphanLock\(p, p\.dir, v\.pid\)/, hEnd), hFail = at(/if \(!c\.ok\) \{ setClosed\(rec, c\.refusal\); commit\(\); return null; \}/, hClr);
  ok(cpl > 0 && endAt > cpl && clrAt > endAt && startAt > 0 && launchAt > startAt && postAt > launchAt && healAt > 0 && hEnd > healAt && hClr > hEnd && hFail > hClr, '④g T1 the keeper walks the ladder in order at the start (verdict → end → clear → launch → post-launch) and at the heal (verdict → end → clear → a failed clear closes by name)', { cpl, endAt, clrAt, startAt, launchAt, postAt, healAt, hEnd, hClr, hFail });
  const ephStart = at(/const lk = await clearProfileLock\(p, ns, prev\);/), ephLaunch = at(/const r = await rt\.launch\(null, \{ idleMs: launchIdle/, ephStart), ephPost = at(/lockRefusalAfterLaunch\(p, prev\)/, ephLaunch);
  ok(ephStart > 0 && ephLaunch > ephStart && ephPost > ephLaunch, '④g T1 …and the ephemeral start walks the same order (verdict → launch → post-launch)', { ephStart, ephLaunch, ephPost });
  // ── the CENSUS OF SAID THINGS: one wording per event, its sites counted (grep-derived over the four files) ──
  const srcOf = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const count = (f, needle) => srcOf(f).split(needle).length - 1;
  const SAID = [
    ['the takeover', 'src/server/browser-keeper.js', 'previous name ${v.host} — taken over (', 1],
    ['the takeover that could not remove', 'src/server/browser-keeper.js', 'previous name ${v.host} but could NOT be removed', 1],
    ['the ended orphan\'s lock removed', 'src/server/browser-keeper.js', '${v.why} — ${removed.length ? removed.join', 1],
    ['the ended orphan\'s lock that could not be removed (r3 F1)', 'src/server/browser-keeper.js', '${v.why} but could NOT be removed', 1],
    ['a lock that is no longer the orphan\'s (r3 F2)', 'src/server/browser-keeper.js', 'after ending its own orphaned browser pid ${endedPid}, ${v.why}', 1],
    ['the orphan ended before a launch', 'src/server/browser-keeper.js', 'ended its own orphaned browser pid ${v.pid} before launching', 1],
    ['the orphan ended before a heal', 'src/server/browser-keeper.js', 'ended its own orphaned browser pid ${v.pid} before healing', 1],
    ['the directory taken while launching (r2 F1; the named + the ephemeral start)', 'src/server/browser-keeper.js', 'the directory was taken while launching', 2],
    ['a previous name\'s lock reached the launch (r3 F3; the named start, its birth death, the ephemeral start)', 'src/server/browser-keeper.js', 'reached the launch (taken over now)', 3],
    ['the directory held at a birth death', 'src/server/browser-keeper.js', 'the directory is held by somebody else', 1],
    ['the queued wait (r2 F3)', 'src/server/browser-keeper.js', 'a tab bind waits for the one in flight', 1],
    ['detached while queued (r2 F2)', 'src/server/browser-keeper.js', 'detached while waiting to bind a tab', 1],
    ['the rebind: the only tab', 'src/server/browser-keeper.js', "bound to the browser's only tab", 1],
    ['the rebind: a new tab (plain + mediated)', 'src/server/browser-keeper.js', 'a new tab bound', 2],
    ['PURE: the ended orphan\'s lock (the clear\'s why)', 'src/browser-profiles.js', "the ended orphan's lock named this machine's previous name ${host}", 1],
    ['PURE: not the orphan ended', 'src/browser-profiles.js', 'not the orphan ended (pid ${endedPid})', 1],
    ['PURE: a lock at a pid alive here is not the ended orphan\'s (r4 census: printed through the leave line, uncounted)', 'src/browser-profiles.js', "that pid is alive here — not the ended orphan's lock", 1],
    ['PURE: a previous-name lock at an unreadable live pid (r4 census: printed through the refusal, uncounted — pre-r3)', 'src/browser-profiles.js', 'whose command line cannot be read (another user\'s process?) — not provably free', 1],
    ['r5 (S37): a directory\'s lineage forgotten — the directory is gone', 'src/server/browser-keeper.js', 'forgotten — the directory is gone', 1],
    ['r5 (S36): a directory\'s lineage KEPT through a read error (a flapping PVC)', 'src/server/browser-keeper.js', 'kept — the directory cannot be read right now', 1],
    ['r5 (S34): the bound\'s evictions said', 'src/server/browser-keeper.js', 'forgotten at the ${B.DIR_HOSTS_MAX} bound (the oldest remembered)', 1],
    ['r5 (S42b): a lineage re-keyed to the directory\'s real path', 'src/server/browser-keeper.js', 'is remembered under its real path', 1],
    ['PURE: the previous-host verdict', 'src/browser-profiles.js', "names this machine's previous name, ${lockHost}", 1],
    ['PURE refusal: another machine\'s name', 'src/browser-profiles.js', "is locked under another machine's name", 1],
    ['PURE refusal: could not remove (the takeover + the ended orphan\'s)', 'src/browser-profiles.js', 'and VibeSpace could not remove the lock', 2],
    ['PURE refusal: still locked, its own browser ended (r3 F1)', 'src/browser-profiles.js', 'is still locked under this machine', 1],
    ['PURE refusal: taken over now (r3 F3)', 'src/browser-profiles.js', 'VibeSpace took the lock over now; run the command again', 1],
    ['the agent\'s note (the restart)', 'src/browser-tabs.js', 'your tab from the previous run is gone', 1],
    ['the agent\'s note (a new tab)', 'src/browser-tabs.js', 'a new tab was opened and bound for', 1],
    ['the route puts an undelivered note back (r3 F4; `use` + `resolve`, the two routes that attach)', 'src/routes/browser.js', 'k.restoreRebound(', 2],
    ['zh: renamed from', 'src/lib/i18n-zh.js', '"renamed from {host}"', 1],
    ['ja: renamed from', 'src/lib/i18n-ja.js', '"renamed from {host}"', 1],
  ];
  const offs = SAID.map(([name, f, needle, n]) => ({ name, got: count(f, needle), n })).filter((x) => x.got !== x.n);
  ok(!offs.length, `④g THE CENSUS OF SAID THINGS: ${SAID.length} sentences, each ONE wording at its counted sites (grep-derived)`, offs);
  // ── the keeper legs: helpers ──
  const linesG = []; const klogG = { log: (...a) => linesG.push(a.join(' ')), warn: (...a) => linesG.push('WARN ' + a.join(' ')), error() { } };
  const procsG = [];
  const isAliveG = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const deadPidG = () => new Promise((r) => { const c = spawn('true', [], { stdio: 'ignore' }); c.on('exit', () => r(c.pid)); });
  const plantG = (dir, host, pid) => { for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, n)); } catch { } } fs.symlinkSync(`${host}-${pid}`, path.join(dir, 'SingletonLock')); fs.symlinkSync(path.join(ROOT, 'gone', 'SingletonSocket'), path.join(dir, 'SingletonSocket')); fs.symlinkSync('0123456789abcdef', path.join(dir, 'SingletonCookie')); };
  const singletonsG = (dir) => ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].filter((n) => { try { fs.lstatSync(path.join(dir, n)); return true; } catch { return false; } });
  const unplant = (dir) => { for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, n)); } catch { } } };
  /** our marked orphan (a live process naming the directory with our mark); on SIGTERM it runs `onTerm` (a writer between the end and the clear) then exits */
  const relink = (dir, target) => `const fs=require('fs');const p=${JSON.stringify(dir)}+'/SingletonLock';try{fs.unlinkSync(p)}catch(e){};fs.symlinkSync(${JSON.stringify(target)},p);`;
  const holderG = (dir, mark, onTerm = '') => { const c = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => { try { ${onTerm} } catch (e) { } process.exit(0); }); setTimeout(() => {}, 600000);`, '--', `--user-data-dir=${dir}`, `--vibespace-keeper=${mark}`], { stdio: 'ignore' }); procsG.push(c); return c; };
  const mkProfG = async (kk, label) => { const p = kk.createProfile({ label }); await kk.attach({ profileId: p.id, browserKey: KA, sessionId: 'sess-1' }); await kk.stop(p.id, { why: 'user' }); const r = kk._reg().browsers[p.id]; r.host = PREV; r.hosts = [PREV]; return p; };
  const saidG = (from, re) => linesG.slice(from).filter((l) => re.test(l));
  const isRoot = !!(process.getuid && process.getuid() === 0);
  // ── F1: a clear that FAILS (EACCES) is refused by name — the start site (the heal site: the wiring pin above) ──
  const runF1 = async (Kmod, tag) => {
    const dd = path.join(ROOT, 'data-g-f1-' + tag); fs.mkdirSync(dd, { recursive: true });
    const kk = mkKeeper(Kmod, { dataDir: dd, log: klogG });
    const p = await mkProfG(kk, 'F1 ' + tag); const h = holderG(p.dir, p.id); await sleep(120); plantG(p.dir, PREV, h.pid); fs.chmodSync(p.dir, 0o500);
    const L0 = logOf('launches.log').length, l0 = linesG.length;
    const e = await threw(() => kk.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-2' }));
    const r = { err: e ? e.code : null, msg: e ? e.message : '', launched: logOf('launches.log').length - L0, left: singletonsG(p.dir).length, ended: !isAliveG(h.pid), said: saidG(l0, /could NOT be removed|nothing removed/).map((x) => x.slice(0, 160)) };
    fs.chmodSync(p.dir, 0o700); unplant(p.dir); try { await kk.stop(p.id, { why: 'user' }); } catch { } kk.shutdown();
    return r;
  };
  if (isRoot) ok(true, '④g F1 (read-only directory leg SKIPPED: root ignores directory modes)');
  else {
    const r = await runF1(K, 'product');
    ok(r.err === 'profile_locked' && /could not remove the lock \(EACCES\)/.test(r.msg) && /its own browser, ended now/.test(r.msg) && /rm -f '/.test(r.msg) && r.launched === 0 && r.left === 3 && r.ended && r.said.some((x) => /could NOT be removed \(EACCES\)/.test(x)), '④g F1 our orphan ended under a previous name, its lock could NOT be removed (EACCES) ⇒ profile_locked naming the errno and the one command, no launch, said in the journal', r);
    const noPost = ksrcG.replace("    if (left.includes('SingletonLock')) {\n      const f = (removed.failed || []).find((x) => x.name === 'SingletonLock');\n      const refusal = B.profileLockedRefusal({ label: p.label, dir, verdict: { kind: 'ended-unremovable'", "    if (false && left.includes('SingletonLock')) { /* CONTROL: no post-check after the ended orphan's clear */\n      const f = (removed.failed || []).find((x) => x.name === 'SingletonLock');\n      const refusal = B.profileLockedRefusal({ label: p.label, dir, verdict: { kind: 'ended-unremovable'");
    ok(noPost !== ksrcG, '④g F1 control setup: the post-check is where the control cuts');
    const c = await runF1(M.load('src/server/browser-keeper.js', noPost, 'no-postcheck-ended-clear'), 'control');
    // (the fake binary dies on the read-only directory — its own SingletonLock.fake — and the post-launch judgement (F3) then names
    // the lock; the copy's own tell: the clear said "nothing removed", never refused by its own name before the launch)
    ok(c.said.some((x) => /the ended orphan's lock .*nothing removed/.test(x)) && !c.said.some((x) => /the ended orphan's lock .*could NOT be removed/.test(x)) && !/its own browser, ended now/.test(c.msg) && c.left === 3, '④g F1 CONTROL: a keeper that does not post-check the ended orphan\'s clear says "nothing removed" and goes on to the launch (the reproduced shape) — the F1 leg catches it', c);
  }
  // ── F2: the clear is keyed on the ORPHAN'S pid — a lock rewritten between the end and the clear is left, never called ours ──
  const runF2 = async (Bmod, tag) => {
    const dd = path.join(ROOT, 'data-g-f2-' + tag); fs.mkdirSync(dd, { recursive: true });
    const Kx = tag === 'product' ? K : M.load('src/server/browser-keeper.js', ksrcG.replace("require('../browser-profiles.js')", `require(${JSON.stringify(Bmod.__file)})`), 'keeper-over-' + tag);
    const kk = mkKeeper(Kx, { dataDir: dd, log: klogG });
    const p = await mkProfG(kk, 'F2 ' + tag); const dead = await deadPidG(); const h = holderG(p.dir, p.id, relink(p.dir, `${STRANGER}-${dead}`)); await sleep(120); plantG(p.dir, PREV, h.pid);
    const l0 = linesG.length;
    const e = await threw(() => kk.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-2' }));
    const r = { err: e ? e.code : null, left: singletonsG(p.dir).length, lock: (() => { try { return fs.readlinkSync(path.join(p.dir, 'SingletonLock')); } catch { return null; } })(), leftSaid: saidG(l0, /not the orphan ended/).length, lied: saidG(l0, /previous name stranger/).length };
    unplant(p.dir); try { await kk.stop(p.id, { why: 'user' }); } catch { } kk.shutdown();
    return r;
  };
  const r2 = await runF2(B, 'product');
  ok(r2.left === 3 && r2.lock === `${STRANGER}-${r2.lock ? r2.lock.split('-').pop() : ''}` && r2.leftSaid === 1 && r2.lied === 0, '④g F2 a lock rewritten to a STRANGER\'s between the end and the clear is LEFT (not the orphan\'s pid), said so, never called "this machine\'s previous name"', r2);
  {
    const bsrcG = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
    const noIdentity = bsrcG.replace('  if (endedPid != null && Number(lock.pid) !== Number(endedPid)) return', '  if (false && endedPid != null && Number(lock.pid) !== Number(endedPid)) return /* CONTROL: the clear is not keyed on the orphan\'s pid */');
    ok(noIdentity !== bsrcG, '④g F2 control setup: the pid identity is where the control cuts');
    const fB = M.write('src/browser-profiles.js', noIdentity, 'no-ended-pid-identity', { esm: false }); const Bc = require(fB); Bc.__file = fB;
    const c2 = Bc.__file ? await runF2(Bc, 'control') : null;
    ok(c2 && c2.left === 0 && c2.lied === 1, '④g F2 CONTROL: a verdict not keyed on the orphan\'s pid removes the stranger\'s lock and calls it "this machine\'s previous name" — the F2 leg catches it', c2 || 'no control copy');
  }
  // ── F3: a previous name's lock that reached the launch (the ④f race under the roll's shape) is taken over NOW and named ──
  const runF3 = async (Bmod, tag) => {
    const dd = path.join(ROOT, 'data-g-f3-' + tag); fs.mkdirSync(dd, { recursive: true });
    const real = F.createBrowserRuntime({ env }); let once = false; // armed AFTER the setup launch (the lineage is stamped by then)
    const rt = new Proxy(real, { get(t, k2) { if (k2 !== 'launch') return t[k2]; return async (ns, o) => { if (once && o && o.dir) { once = false; plantG(o.dir, PREV, await deadPidG()); return { ok: false, stderr: 'Command failed: agent-browser open about:blank', stdout: '', error: null }; } return t.launch(ns, o); }; } });
    const Kx = tag === 'product' ? K : M.load('src/server/browser-keeper.js', ksrcG.replace("require('../browser-profiles.js')", `require(${JSON.stringify(Bmod.__file)})`), 'keeper-over-' + tag);
    const kk = mkKeeper(Kx, { dataDir: dd, runtime: rt, log: klogG });
    const p = await mkProfG(kk, 'F3 ' + tag); const l0 = linesG.length; once = true;
    const e1 = await threw(() => kk.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-2' }));
    const left1 = singletonsG(p.dir).length;
    const e2 = await threw(() => kk.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-2' }));
    const r = { e1: e1 ? `${e1.code}: ${e1.message}` : 'launched', left1, e2: e2 ? e2.code : null, renamed: !!(kk._reg().profiles.find((x) => x.id === p.id) || {}).renamedFrom, said: saidG(l0, /reached the launch \(taken over now\)/).length };
    try { await kk.stop(p.id, { why: 'user' }); } catch { } kk.shutdown();
    return r;
  };
  const r3 = await runF3(B, 'product');
  ok(/^profile_locked: /.test(r3.e1) && /previous name \(pod-old/.test(r3.e1) && /took the lock over now; run the command again/.test(r3.e1) && r3.left1 === 0 && r3.e2 === null && r3.renamed && r3.said === 1, '④g F3 the FIRST answer after a failed launch on a previous name\'s lock names it, takes it over (the lock gone, "renamed from"), says it once in the journal; the next command launches', r3);
  {
    const bsrcG = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
    const noTakeover = bsrcG.replace("  if (v.kind === 'stale-previous-host') return { step: 'post-launch', kind: 'take-over', verdict: v };", "  /* CONTROL: a previous name's lock after a failed launch is nobody's business */");
    ok(noTakeover !== bsrcG, '④g F3 control setup: the post-launch takeover is where the control cuts');
    const fB = M.write('src/browser-profiles.js', noTakeover, 'no-post-launch-takeover', { esm: false }); const Bc = require(fB); Bc.__file = fB;
    const c3 = Bc.__file ? await runF3(Bc, 'control') : null;
    ok(c3 && /^launch_failed: /.test(c3.e1) && c3.left1 === 3 && c3.e2 === null && c3.said === 0, '④g F3 CONTROL: without the post-launch takeover the first answer is a generic launch_failed, the lock stays for the next command, the journal says nothing (the reproduced shape) — the F3 leg catches it', c3 || 'no control copy');
  }
  // ── T1 (c) the SWAP control: the clear BEFORE the end — the ④e shape (a live orphan under a previous name) leaves its lock ──
  {
    const swapped = ksrcG
      .replace("    if (v.kind === 'own-orphan') {\n      const r = await endProcess(v.pid, facts.holder.starttime);", "    if (v.kind === 'own-orphan') {\n      const c0 = clearEndedOrphanLock(p, p.dir, v.pid); /* CONTROL: the clear swapped before the end */\n      const r = await endProcess(v.pid, facts.holder.starttime);")
      .replace("      if (r === 'ended' || r === 'gone') { const c = clearEndedOrphanLock(p, p.dir, v.pid); if (!c.ok) return { ok: false, ...c.refusal };", "      if (r === 'ended' || r === 'gone') { const c = c0; if (!c.ok) return { ok: false, ...c.refusal };");
    ok(swapped !== ksrcG && swapped.includes('const c = c0;'), '④g T1 swap-control setup: the clear and the end are where the control swaps');
    const dd = path.join(ROOT, 'data-g-swap'); fs.mkdirSync(dd, { recursive: true });
    const kk = mkKeeper(M.load('src/server/browser-keeper.js', swapped, 'clear-before-end'), { dataDir: dd, log: klogG });
    const p = await mkProfG(kk, 'Swap'); const h = holderG(p.dir, p.id); await sleep(120); plantG(p.dir, PREV, h.pid);
    const e = await threw(() => kk.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-2' }));
    ok(!e && !isAliveG(h.pid) && singletonsG(p.dir).length === 3, '④g T1 SWAP CONTROL: a keeper that clears BEFORE it ends sees the orphan alive, clears nothing, and launches into the previous-name lock (3 symlinks left: the ④e shape) — the order is load-bearing', { e: e && e.message, left: singletonsG(p.dir).length });
    unplant(p.dir); try { await kk.stop(p.id, { why: 'user' }); } catch { } kk.shutdown();
  }
  // ── F4: the rebound note is SAID in an answer that is DELIVERED — the real route, a client gone before the write: in
  // test-browser-kept ⑭f (its fake agent-browser keeps tabs and strips --pin-tab; this suite's fake binds no tab) ──
  // ── the EPHEMERAL ROW: a kept directory on a rolled home runs the same ladder (every cell the named row has) ──
  if (!isRoot) {
    const DATA_E = path.join(ROOT, 'data-g-eph'); fs.mkdirSync(DATA_E, { recursive: true });
    const settings = { 'browser.idleTimeoutMs': 600000 }; const quiet = { log() { }, warn() { }, error() { } };
    const beE = BE.create({ dataDir: DATA_E, homeDir: HOME, serverSetting: (x) => settings[x], log: quiet, socketDirBase: path.join(ROOT, 'sock-g'), env: { XDG_RUNTIME_DIR: XDG } });
    let kE = null; const keptE = KS.create({ dataDir: DATA_E, keeper: () => kE, liveKeys: () => live, serverSetting: (x) => settings[x], log: quiet, sweepEveryMs: 0 });
    kE = mkKeeper(K, { dataDir: DATA_E, kept: keptE, serverSetting: (x) => settings[x], log: klogG });
    const envE = beE.envFor({ browserKey: KG, cwd: HOME });
    const ensure = (kk = kE) => kk.ensureEphemeral({ browserKey: KG, sessionId: 'sess-7', envPairs: envE.pairs, sessionName: 'Eph', variant: envE.variant });
    const r0 = await ensure(); const eph = kE.ephemeralFor(KG); const dir = eph && eph.dir;
    ok(r0.browser.state === 'ready' && dir && fs.existsSync(dir), '④g ephemeral: the conversation\'s browser runs on its KEPT directory', { dir });
    const stopE = async () => { try { await kE.stop(eph.profileId, { why: 'user' }); } catch { } };
    const lineage = () => { const r = kE._reg().browsers[eph.profileId]; r.host = PREV; r.hosts = [PREV]; };
    await stopE(); lineage(); plantG(dir, PREV, await deadPidG()); { const l0 = linesG.length; const e = await threw(() => ensure());
      ok(!e && singletonsG(dir).length === 0 && saidG(l0, /previous name pod-old — taken over/).length === 1, '④g ephemeral (a): the roll\'s lock is taken over, said once', { e: e && e.message, left: singletonsG(dir).length }); }
    await stopE(); plantG(dir, STRANGER, await deadPidG()); { const e = await threw(() => ensure());
      ok(e && e.code === 'profile_locked' && /stranger/.test(e.message) && singletonsG(dir).length === 3, '④g ephemeral (b): a foreign name stays refused by name', e && `${e.code}: ${e.message.slice(0, 160)}`); unplant(dir); }
    { const h = holderG(dir, KG); await sleep(120); plantG(dir, PREV, h.pid); const l0 = linesG.length; const e = await threw(() => ensure());
      ok(!e && !isAliveG(h.pid) && singletonsG(dir).length === 0 && saidG(l0, /the ended orphan's lock named this machine's previous name pod-old/).length === 1, '④g ephemeral (c): our orphan (the conversation\'s mark) ended, its previous-name lock removed, said once, launched', { e: e && e.message, left: singletonsG(dir).length }); }
    { await stopE(); const h = holderG(dir, KG); await sleep(120); plantG(dir, PREV, h.pid); fs.chmodSync(dir, 0o500); const L0 = logOf('launches.log').length;
      const e = await threw(() => ensure()); fs.chmodSync(dir, 0o700);
      ok(e && e.code === 'profile_locked' && /EACCES/.test(e.message) && logOf('launches.log').length === L0 && singletonsG(dir).length === 3, '④g ephemeral (d): a clear that fails (EACCES) is refused by name with the errno (r3 F1 on this row)', e ? `${e.code}: ${e.message.slice(0, 160)}` : 'launched'); unplant(dir); }
    // F5 (verify r3): a REFUSED start on this row kept neither the lineage nor the mark on its new record — after a restart the
    // previous name was gone (its lock refused as FOREIGN) and the pre-mark adoption re-opened (a hand-launched CLI Chrome on the
    // kept directory would be ended as "our orphan"). (d) above was a refusal: the record must still carry both.
    { const r = kE._reg().browsers[eph.profileId];
      ok(r && r.state === 'failed' && Array.isArray(r.hosts) && r.hosts.includes(PREV) && r.mark === KG, '④g F5 ephemeral: a REFUSED start\'s record still carries the launch-host lineage (pod-old) and the conversation\'s mark', { state: r && r.state, hosts: r && r.hosts, mark: r && r.mark });
      // a hand-launched CLI Chrome (--remote-debugging-port=0, no mark) on the kept directory after that refusal: refused by name, never ended
      const hu = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)', '--', `--user-data-dir=${dir}`, '--remote-debugging-port=0'], { stdio: 'ignore' }); procsG.push(hu); await sleep(120); plantG(dir, HOSTg, hu.pid);
      const e = await threw(() => ensure());
      ok(e && e.code === 'profile_locked' && /your own browser/.test(e.message) && isAliveG(hu.pid) && singletonsG(dir).length === 3, '④g F5 ephemeral: …so a pre-mark CLI launch on the directory after the refusal is still refused by name and left running (the mark kept)', e ? `${e.code}: ${e.message.slice(0, 160)}` : `launched; holder alive ${isAliveG(hu.pid)}`);
      try { hu.kill('SIGKILL'); } catch { } unplant(dir);
      const noCarry = ksrcG.replace("      if (prev && prev.mark) rec.mark = prev.mark;\n      { const lh = launchHostsFor(prev, p.dir || null); if (lh.length) { rec.hosts = lh; rec.host = prev && prev.host ? prev.host : lh[lh.length - 1]; } } // verify r4 (S26b): a retired record's directory still knows\n      reg.browsers[profileId] = rec;", "      /* CONTROL: a refused ephemeral start carries nothing */\n      reg.browsers[profileId] = rec;");
      ok(noCarry !== ksrcG, '④g F5 control setup: the carry onto the new record is where the control cuts');
      const DATA_C5 = path.join(ROOT, 'data-g-eph-ctl'); fs.mkdirSync(DATA_C5, { recursive: true });
      const beC = BE.create({ dataDir: DATA_C5, homeDir: HOME, serverSetting: (x) => settings[x], log: quiet, socketDirBase: path.join(ROOT, 'sock-g-ctl'), env: { XDG_RUNTIME_DIR: XDG } }); const envC = beC.envFor({ browserKey: KG, cwd: HOME });
      let kC = null; const keptC = KS.create({ dataDir: DATA_C5, keeper: () => kC, liveKeys: () => live, serverSetting: (x) => settings[x], log: quiet, sweepEveryMs: 0 });
      kC = mkKeeper(M.load('src/server/browser-keeper.js', noCarry, 'eph-refusal-carries-nothing'), { dataDir: DATA_C5, kept: keptC, serverSetting: (x) => settings[x], log: klogG });
      await kC.ensureEphemeral({ browserKey: KG, sessionId: 'sess-7', envPairs: envC.pairs, sessionName: 'Eph', variant: envC.variant }); const eC = kC.ephemeralFor(KG);
      await kC.stop(eC.profileId, { why: 'user' }); const rC = kC._reg().browsers[eC.profileId]; rC.host = PREV; rC.hosts = [PREV]; plantG(eC.dir, STRANGER, await deadPidG());
      const eRef = await threw(() => kC.ensureEphemeral({ browserKey: KG, sessionId: 'sess-7', envPairs: envC.pairs, sessionName: 'Eph', variant: envC.variant }));
      const rAfter = kC._reg().browsers[eC.profileId];
      ok(eRef && eRef.code === 'profile_locked' && rAfter && !rAfter.hosts && !rAfter.mark, '④g F5 CONTROL: a keeper whose refused ephemeral start carries nothing leaves a record with no lineage and no mark (the reproduced shape: the next boot stamps this pod alone, the previous name is foreign) — the F5 leg catches it', { hosts: rAfter && rAfter.hosts, mark: rAfter && rAfter.mark });
      unplant(eC.dir); kC.shutdown(); }
    { const real = F.createBrowserRuntime({ env }); let once = true;
      const rt = new Proxy(real, { get(t, k2) { if (k2 !== 'launch') return t[k2]; return async (ns, o) => { if (once) { once = false; plantG(dir, PREV, await deadPidG()); return { ok: false, stderr: 'Command failed: agent-browser open about:blank', stdout: '', error: null }; } return t.launch(ns, o); }; } });
      kE.shutdown(); // the debounced save lands on disk before a second keeper reads the same data dir
      let kE2 = null; const keptE2 = KS.create({ dataDir: DATA_E, keeper: () => kE2, liveKeys: () => live, serverSetting: (x) => settings[x], log: quiet, sweepEveryMs: 0 });
      kE2 = mkKeeper(K, { dataDir: DATA_E, kept: keptE2, serverSetting: (x) => settings[x], runtime: rt, log: klogG }); const l0 = linesG.length;
      const e1 = await threw(() => ensure(kE2)); const e2 = await threw(() => ensure(kE2));
      ok(e1 && e1.code === 'profile_locked' && /took the lock over now/.test(e1.message) && saidG(l0, /ephemeral .*reached the launch \(taken over now\)/).length === 1 && !e2, '④g ephemeral (e): a previous name\'s lock that reached the launch is taken over and named on this row too (said in the journal); the next command launches', { e1: e1 && e1.message.slice(0, 160), e2: e2 && e2.message });
      try { await kE2.stop(kE2.ephemeralFor(KG).profileId, { why: 'user' }); } catch { } kE2.shutdown(); }
  } else ok(true, '④g ephemeral row SKIPPED under root (directory modes)');
  for (const pr of procsG) { try { pr.kill('SIGKILL'); } catch { } }
}
// ═══ ④h VERIFY r4 (T1): THE THIRD JUDGEMENT — USERW'S SCENARIOS AGAINST A HAND-WRITTEN TRUTH ════════════════════════════
// Every row = one thing userW's pod did (the 10-01 roll: W1 the previous-name lock refused twice then hand-fixed; the 17:22Z boot
// refusal of vs-bp-0f70bba2 at a pid REUSED across the roll; the ephemeral D-Payments on its kept directory) or one of r1–r3's
// findings, run through the REAL keeper and compared with what userW SEES: the answer code + sentence, the journal, the panel row's
// state / renamed-from, whether a browser launched, the symlinks left, the holder alive. A disagreement is a finding. The W2 rows
// (the bound tab of a previous life) are test-browser-kept ⑭g (its fake keeps tabs). Three patched-KEEPER controls: a keeper that
// forgets a retired record's lineage (S26b: userW's class one restart after the roll — the r4 finding), one that reads none of the
// directory's lineage, one whose post-launch judgement drops the holder's facts (S8: a live holder taken over).
console.log('— ④h verify r4: the third judgement — userW\'s scenarios through the real keeper vs a hand-written truth; three keeper controls');
{
  const KS = require('../src/server/browser-kept.js');
  const PREV = 'pod-old', STRANGER = 'stranger'; const HOSTh = os.hostname();
  const isRoot = !!(process.getuid && process.getuid() === 0);
  const procsH = [];
  const aliveH = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const deadPidH = () => new Promise((r) => { const c = spawn('true', [], { stdio: 'ignore' }); c.on('exit', () => r(c.pid)); });
  const plantH = (dir, host, pid) => { for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, n)); } catch { } } fs.symlinkSync(`${host}-${pid}`, path.join(dir, 'SingletonLock')); fs.symlinkSync(path.join(ROOT, 'gone', 'SingletonSocket'), path.join(dir, 'SingletonSocket')); fs.symlinkSync('0123456789abcdef', path.join(dir, 'SingletonCookie')); };
  const singletonsH = (dir) => ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].filter((n) => { try { fs.lstatSync(path.join(dir, n)); return true; } catch { return false; } });
  const unplantH = (dir) => { for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, n)); } catch { } } };
  const relinkH = (dir, target) => `const fs=require('fs');const p=${JSON.stringify(dir)}+'/SingletonLock';try{fs.unlinkSync(p)}catch(e){};fs.symlinkSync(${JSON.stringify(target)},p);`;
  const holderH = (dir, mark, onTerm = '') => { const c = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => { try { ${onTerm} } catch (e) { } process.exit(0); }); setTimeout(() => {}, 600000);`, '--', `--user-data-dir=${dir}`, ...(mark ? [`--vibespace-keeper=${mark}`] : [])], { stdio: 'ignore' }); procsH.push(c); return c; };
  const sleeperH = () => { const c = spawn('sleep', ['600'], { stdio: 'ignore' }); procsH.push(c); return c; };
  const linesH = []; const klogH = { log: (...a) => linesH.push(a.join(' ')), warn: (...a) => linesH.push('WARN ' + a.join(' ')), error() { } };
  const sleepH = (ms) => new Promise((r) => setTimeout(r, ms));
  const rowH = (kk, id) => { const d = kk.list(); const b = d.browsers[id] || null; const p = (d.profiles || []).find((x) => x.id === id) || null; return { state: b ? b.state : null, renamedFrom: p && p.renamedFrom ? p.renamedFrom.host : null }; };
  const TABLE = []; // {id, who, agree, diffs}
  const judge = (id, who, truth, got) => {
    const diffs = [];
    for (const [k2, want] of Object.entries(truth)) {
      const g = got[k2]; let pass2;
      if (want instanceof RegExp) pass2 = typeof g === 'string' && want.test(g);
      else if (Array.isArray(want) && want[0] === 'not') pass2 = !(typeof g === 'string' && want[1].test(g));
      else pass2 = JSON.stringify(g) === JSON.stringify(want);
      if (!pass2) diffs.push(`${k2}: truth ${String(want).slice(0, 90)} | product ${JSON.stringify(g === undefined ? null : g).slice(0, 200)}`);
    }
    TABLE.push({ id, who, agree: !diffs.length, diffs });
    return !diffs.length;
  };
  const actH = async (kk, p, fn, more = () => ({})) => { const l0 = linesH.length, L0 = logOf('launches.log').length; const e = await threw(fn); const r = rowH(kk, p.id); return { err: e ? e.code : null, msg: e ? e.message : '', journal: linesH.slice(l0).join('\n'), launched: logOf('launches.log').length - L0, left: singletonsH(p.dir).length, state: r.state, renamedFrom: r.renamedFrom, ...more(e) }; };
  const mkProfH = async (kk, label) => { const p = kk.createProfile({ label }); await kk.attach({ profileId: p.id, browserKey: KA, sessionId: 'sess-1' }); await kk.stop(p.id, { why: 'user' }); const r = kk._reg().browsers[p.id]; r.host = PREV; r.hosts = [PREV]; return p; };
  const noLineageH = (kk, p) => { const r = kk._reg().browsers[p.id]; r.host = null; r.hosts = []; };
  const attachH = (kk, p) => () => kk.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-2' });
  const stopH = async (kk, p) => { try { await kk.stop(p.id, { why: 'user' }); } catch { } };
  const armedRuntime = () => { const cfg = { armed: 0, stderr: 'Command failed: agent-browser open about:blank', during: null }; const real = F.createBrowserRuntime({ env }); const rt = new Proxy(real, { get(t, k2) { if (k2 !== 'launch') return t[k2]; return async (ns, o) => { if (cfg.armed > 0) { cfg.armed--; if (cfg.during) await cfg.during(o); return { ok: false, stderr: cfg.stderr, stdout: '', error: null }; } return t.launch(ns, o); }; } }); return { rt, cfg }; };
  const DH = path.join(ROOT, 'data-h'); fs.mkdirSync(DH, { recursive: true });
  // ── the named row (jarvis-work) ──
  const k = mkKeeper(K, { dataDir: DH, log: klogH });
  { const p = await mkProfH(k, 'S1'); plantH(p.dir, PREV, await deadPidH());
    judge('S1', 'W1 the roll: a previous-name lock at a dead pid, the lineage knows the name ⇒ taken over', { err: null, launched: 1, left: 0, state: 'ready', renamedFrom: PREV, journal: /previous name pod-old — taken over \(SingletonLock, SingletonSocket, SingletonCookie removed/ }, await actH(k, p, attachH(k, p))); await stopH(k, p); }
  { const p = await mkProfH(k, 'S2'); noLineageH(k, p); const d = await deadPidH(); plantH(p.dir, PREV, d);
    judge('S2', 'W1 pre-lane shape (no lineage anywhere) ⇒ refused by name: the two hostnames and the one command', { err: 'profile_locked', msg: new RegExp(`locked under another machine's name \\(pod-old, pid ${d} there\\).*this machine is ${HOSTh}.*rm -f '${p.dir}/SingletonLock'`), launched: 0, left: 3, state: 'failed', renamedFrom: null, journal: /NOT launched — .*another machine's name \(pod-old/ }, await actH(k, p, attachH(k, p)));
    judge('S3', 'W1 the second command 12 s later: the same refusal, the lock untouched', { err: 'profile_locked', msg: /another machine's name \(pod-old/, launched: 0, left: 3 }, await actH(k, p, attachH(k, p)));
    unplantH(p.dir);
    judge('S4', 'W1 the hand-fix (all three removed) ⇒ launched, nothing said about a lock', { err: null, launched: 1, left: 0, state: 'ready', renamedFrom: null, journal: ['not', /previous name|taken over|NOT launched/] }, await actH(k, p, attachH(k, p))); await stopH(k, p);
    plantH(p.dir, PREV, await deadPidH()); fs.unlinkSync(path.join(p.dir, 'SingletonLock'));
    judge('S5', 'W1 a partial hand-fix (SingletonLock alone) ⇒ launched (no lock = free), the two others left to Chromium', { err: null, launched: 1, left: 2, state: 'ready' }, await actH(k, p, attachH(k, p))); unplantH(p.dir); await stopH(k, p); }
  { const p = await mkProfH(k, 'S6'); const sp = sleeperH(); await sleepH(60); plantH(p.dir, PREV, sp.pid);
    judge('S6', '17:22Z: a previous-name lock at a REUSED pid (alive, not a Chrome on the dir), the lineage knows the name ⇒ taken over, the process left alone', { err: null, launched: 1, left: 0, state: 'ready', renamedFrom: PREV, holderAlive: true, journal: /previous name pod-old — taken over/ }, await actH(k, p, attachH(k, p), () => ({ holderAlive: aliveH(sp.pid) }))); await stopH(k, p);
    const p7 = await mkProfH(k, 'S7'); noLineageH(k, p7); const sp2 = sleeperH(); await sleepH(60); plantH(p7.dir, PREV, sp2.pid);
    judge('S7', '17:22Z shape without a lineage ⇒ refused by name, the reused process left alone', { err: 'profile_locked', msg: /another machine's name \(pod-old.*rm -f '/, launched: 0, left: 3, state: 'failed', holderAlive: true }, await actH(k, p7, attachH(k, p7), () => ({ holderAlive: aliveH(sp2.pid) }))); unplantH(p7.dir); }
  { const p = await mkProfH(k, 'S9'); const h = holderH(p.dir, p.id); await sleepH(120); plantH(p.dir, PREV, h.pid);
    judge('S9', 'r1 F1: our own live orphan under the previous name ⇒ ended by its own facts, its lock cleared, launched', { err: null, launched: 1, left: 0, state: 'ready', holderAlive: false, renamedFrom: null, journal: /ended its own orphaned browser pid \d+ before launching[\s\S]*the ended orphan's lock named this machine's previous name pod-old — SingletonLock, SingletonSocket, SingletonCookie removed/ }, await actH(k, p, attachH(k, p), () => ({ holderAlive: aliveH(h.pid) }))); await stopH(k, p); }
  { const p = await mkProfH(k, 'S10'); const h = holderH(p.dir, null); await sleepH(120); plantH(p.dir, PREV, h.pid);
    judge('S10', 'r1 F1: a user\'s live Chrome under the previous name ⇒ "it may be your own browser", left running', { err: 'profile_locked', msg: /open in a browser VibeSpace did not start \(pid \d+\) — it may be your own browser/, launched: 0, left: 3, state: 'failed', holderAlive: true }, await actH(k, p, attachH(k, p), () => ({ holderAlive: aliveH(h.pid) }))); try { h.kill('SIGKILL'); } catch { } unplantH(p.dir); }
  { const p = await mkProfH(k, 'S11'); const h = holderH(p.dir, 'bp-deadbeef'); await sleepH(120); plantH(p.dir, PREV, h.pid);
    judge('S11', 'another record\'s live browser under the previous name ⇒ refused naming its mark, left running', { err: 'profile_locked', msg: /another VibeSpace browser holds it \(its launch mark names bp-deadbeef/, launched: 0, left: 3, holderAlive: true }, await actH(k, p, attachH(k, p), () => ({ holderAlive: aliveH(h.pid) }))); try { h.kill('SIGKILL'); } catch { } unplantH(p.dir); }
  if (!isRoot) {
    { const p = await mkProfH(k, 'S12'); plantH(p.dir, PREV, await deadPidH()); fs.chmodSync(p.dir, 0o500);
      judge('S12', 'r1 F5: the takeover cannot remove the lock (EACCES) ⇒ refused with the errno + the one command, no launch', { err: 'profile_locked', msg: /locked under this machine's previous name \(pod-old, pid \d+ there\) and VibeSpace could not remove the lock \(EACCES\) — remove it yourself: rm -f '/, launched: 0, left: 3, state: 'failed', journal: /could NOT be removed \(EACCES\) — NOT launched/ }, await actH(k, p, attachH(k, p))); fs.chmodSync(p.dir, 0o700); unplantH(p.dir); }
    { const p = await mkProfH(k, 'S13'); const h = holderH(p.dir, p.id); await sleepH(120); plantH(p.dir, PREV, h.pid); fs.chmodSync(p.dir, 0o500);
      judge('S13', 'r3 F1: our orphan ended, its previous-name lock cannot be removed (EACCES) ⇒ refused by name, no launch', { err: 'profile_locked', msg: /still locked under this machine's previous name \(pod-old, pid \d+ there — its own browser, ended now\) and VibeSpace could not remove the lock \(EACCES\)/, launched: 0, left: 3, holderAlive: false, journal: /but could NOT be removed \(EACCES\) — NOT launched/ }, await actH(k, p, attachH(k, p), () => ({ holderAlive: aliveH(h.pid) }))); fs.chmodSync(p.dir, 0o700); unplantH(p.dir); }
  }
  { const p = await mkProfH(k, 'S14'); const d = await deadPidH(); const h = holderH(p.dir, p.id, relinkH(p.dir, `${STRANGER}-${d}`)); await sleepH(120); plantH(p.dir, PREV, h.pid);
    judge('S14', 'r3 F2: a lock rewritten to a stranger\'s between the end and the clear ⇒ left, said, never called "previous name stranger"', { holderAlive: false, left: 3, lock: `${STRANGER}-${d}`, journal: /not the orphan ended \(pid \d+\) — left alone/, lied: ['not', /previous name stranger/] }, await actH(k, p, attachH(k, p), () => ({ holderAlive: aliveH(h.pid), lock: (() => { try { return fs.readlinkSync(path.join(p.dir, 'SingletonLock')); } catch { return null; } })(), lied: linesH.slice(-12).join('\n') }))); unplantH(p.dir); await stopH(k, p); }
  { const p = await mkProfH(k, 'S28'); const lv = sleeperH(); await sleepH(60); const h = holderH(p.dir, p.id, relinkH(p.dir, `${PREV}-${lv.pid}`)); await sleepH(120); plantH(p.dir, PREV, h.pid);
    judge('S28', 'T2 ②: the lock rewritten to pod-old at a LIVE pid between the end and the clear ⇒ left ("that pid is alive here"), never cleared on the orphan\'s word', { holderAlive: false, left: 3, lock: `${PREV}-${lv.pid}`, journal: /that pid is alive here — not the ended orphan's lock/ }, await actH(k, p, attachH(k, p), () => ({ holderAlive: aliveH(h.pid), lock: (() => { try { return fs.readlinkSync(path.join(p.dir, 'SingletonLock')); } catch { return null; } })() }))); unplantH(p.dir); await stopH(k, p); }
  // ── what reaches the launch (a stub launch that fails) — each on its own keeper ──
  const runS15 = async (Kmod, tag) => { const { rt, cfg } = armedRuntime(); const kk = mkKeeper(Kmod, { dataDir: path.join(DH, 's15-' + tag), runtime: rt, log: klogH }); const p = await mkProfH(kk, 'S15 ' + tag); cfg.armed = 1; cfg.during = async (o) => { plantH(o.dir, PREV, await deadPidH()); }; const got = await actH(kk, p, attachH(kk, p)); const next = await actH(kk, p, attachH(kk, p)); await stopH(kk, p); kk.shutdown(); return { ...got, nextErr: next.err, nextLaunched: next.launched }; };
  judge('S15', 'r3 F3: a previous-name lock reached the launch ⇒ the FIRST answer names it + takes it over; the next command launches', { err: 'profile_locked', msg: /was locked under this machine's previous name \(pod-old, pid \d+ there\) when the browser was launched and the launch failed on it — VibeSpace took the lock over now; run the command again/, launched: 0, left: 0, renamedFrom: PREV, journal: /NOT started — a lock of this machine's previous name pod-old reached the launch \(taken over now\)/, nextErr: null, nextLaunched: 1 }, await runS15(K, 'product'));
  { const { rt, cfg } = armedRuntime(); const kk = mkKeeper(K, { dataDir: path.join(DH, 's16'), runtime: rt, log: klogH }); const p = await mkProfH(kk, 'S16'); let hp = null; cfg.armed = 1; cfg.stderr = 'Chrome exited early (exit code: 21)'; cfg.during = async (o) => { hp = holderH(o.dir, null); await sleepH(120); plantH(o.dir, HOSTh, hp.pid); };
    judge('S16', 'r2 F1: a user\'s Chrome took the directory while launching ⇒ "your own browser" at the FIRST answer, left running', { err: 'profile_locked', msg: /it may be your own browser/, launched: 0, left: 3, holderAlive: true, journal: /NOT started — the directory was taken while launching/ }, await actH(kk, p, attachH(kk, p), () => ({ holderAlive: !!(hp && aliveH(hp.pid)) }))); try { hp.kill('SIGKILL'); } catch { } unplantH(p.dir); kk.shutdown(); }
  { const { rt, cfg } = armedRuntime(); const kk = mkKeeper(K, { dataDir: path.join(DH, 's17'), runtime: rt, log: klogH }); const p = await mkProfH(kk, 'S17'); cfg.armed = 1; cfg.stderr = 'Xvfb: cannot open display :99'; cfg.during = async (o) => { plantH(o.dir, HOSTh, await deadPidH()); };
    judge('S17', 'r3 B1: our dead-pid lock under our own name + a launch failed on the display ⇒ launch_failed naming the display', { err: 'launch_failed', msg: /the browser did not start: Xvfb: cannot open display :99/, launched: 0, journal: ['not', /NOT started — /] }, await actH(kk, p, attachH(kk, p))); unplantH(p.dir); kk.shutdown(); }
  { const { rt, cfg } = armedRuntime(); const kk = mkKeeper(K, { dataDir: path.join(DH, 's18'), runtime: rt, log: klogH }); const p = await mkProfH(kk, 'S18'); cfg.armed = 1; cfg.during = async (o) => { plantH(o.dir, STRANGER, await deadPidH()); };
    judge('S18', 'a foreign lock reached the launch ⇒ refused by name at the first answer, the lock kept', { err: 'profile_locked', msg: /locked under another machine's name \(stranger, pid \d+ there\)/, launched: 0, left: 3, renamedFrom: null, journal: /NOT started — the directory was taken while launching/ }, await actH(kk, p, attachH(kk, p))); unplantH(p.dir); kk.shutdown(); }
  // S8 (T2 ①): a LIVE marked browser of ours under the previous name is there when the launch fails ⇒ its own facts first (step ① before ⑤): never a takeover
  const runS8 = async (Kmod, tag) => { const { rt, cfg } = armedRuntime(); const kk = mkKeeper(Kmod, { dataDir: path.join(DH, 's8-' + tag), runtime: rt, log: klogH }); const p = await mkProfH(kk, 'S8 ' + tag); let hp = null; cfg.armed = 1; cfg.during = async (o) => { hp = holderH(o.dir, p.id); await sleepH(120); plantH(o.dir, PREV, hp.pid); }; const got = await actH(kk, p, attachH(kk, p), () => ({ holderAlive: !!(hp && aliveH(hp.pid)) })); const next = await actH(kk, p, attachH(kk, p), () => ({ holderAlive: !!(hp && aliveH(hp.pid)) })); try { hp.kill('SIGKILL'); } catch { } unplantH(p.dir); await stopH(kk, p); kk.shutdown(); return { ...got, nextErr: next.err, nextLaunched: next.launched, nextHolderAlive: next.holderAlive, nextJournal: next.journal }; };
  judge('S8', 'T2 ①: our LIVE marked browser under the previous name at a failed launch ⇒ no takeover (judged by its own facts first), the holder left, the lock kept; the next command ends it and launches', { err: 'launch_failed', msg: /the browser did not start/, launched: 0, left: 3, holderAlive: true, renamedFrom: null, journal: ['not', /taken over/], nextErr: null, nextLaunched: 1, nextHolderAlive: false, nextJournal: /ended its own orphaned browser pid \d+ before launching[\s\S]*ended orphan's lock named this machine's previous name pod-old/ }, await runS8(K, 'product'));
  // ── the EPHEMERAL row (D-Payments on its kept directory) + THE r4 FINDING (S26b) ──
  const runEph = async (Kmod, tag) => {
    const DATA_H = path.join(ROOT, 'data-h-eph-' + tag); fs.mkdirSync(DATA_H, { recursive: true });
    const settings = { 'browser.idleTimeoutMs': 600000 }; const quiet = { log() { }, warn() { }, error() { } };
    const beH = BE.create({ dataDir: DATA_H, homeDir: HOME, serverSetting: (x) => settings[x], log: quiet, socketDirBase: path.join(ROOT, 'sock-h-' + tag), env: { XDG_RUNTIME_DIR: XDG } });
    const envH = beH.envFor({ browserKey: KG, cwd: HOME }); const liveH = new Set([KG]);
    const mk = () => { let kp = null; const kept = KS.create({ dataDir: DATA_H, keeper: () => kp, liveKeys: () => liveH, serverSetting: (x) => settings[x], log: quiet, sweepEveryMs: 0 }); kp = mkKeeper(Kmod, { dataDir: DATA_H, kept, serverSetting: (x) => settings[x], liveKeys: () => liveH, log: klogH }); kp.__kept = kept; return kp; };
    const ensure = (kk) => () => kk.ensureEphemeral({ browserKey: KG, sessionId: 'sess-7', envPairs: envH.pairs, sessionName: 'D-Payments', variant: envH.variant });
    const regFile = path.join(DATA_H, 'browser-profiles.json'); const out = {};
    let kk = mk(); await ensure(kk)(); const eph = kk.ephemeralFor(KG); const dir = eph.dir; const pid = eph.profileId;
    const stopE = async (k2) => { const e2 = k2.ephemeralFor(KG); try { if (e2) await k2.stop(e2.profileId, { why: 'user' }); } catch { } };
    const actE = async (k2, fn, more = () => ({})) => { const l0 = linesH.length, L0 = logOf('launches.log').length; const e = await threw(fn); return { err: e ? e.code : null, msg: e ? e.message : '', journal: linesH.slice(l0).join('\n'), launched: logOf('launches.log').length - L0, left: singletonsH(dir).length, ...more(e) }; };
    await stopE(kk); { const r = kk._reg().browsers[pid]; r.host = PREV; r.hosts = [PREV]; } plantH(dir, PREV, await deadPidH());
    out.S24 = await actE(kk, ensure(kk), () => ({ recDir: kk.ephemeralFor(KG).dir === dir }));
    await stopE(kk); plantH(dir, STRANGER, await deadPidH()); out.S25 = await actE(kk, ensure(kk)); unplantH(dir);
    kk.shutdown(); await sleepH(300);
    // the registry as the OLD pod left it, in the shape of a file from BEFORE r4 (no dirHosts — userW's today): host = the old pod,
    // the record's lineage = the old pod; the old pod's lock in the kept directory
    { const j = JSON.parse(fs.readFileSync(regFile, 'utf8')); j.host = PREV; delete j.dirHosts; const rec = j.browsers[pid]; if (rec) { rec.host = PREV; rec.hosts = [PREV]; } fs.writeFileSync(regFile, JSON.stringify(j)); }
    plantH(dir, PREV, await deadPidH());
    liveH.clear(); let k2 = mk(); const lb = linesH.length; await k2.boot(); const bootSaid = linesH.slice(lb).join('\n'); const recGone = !k2._reg().browsers[pid] && !k2._reg().profiles.some((x) => x.id === pid);
    liveH.add(KG); out.S26a = await actE(k2, ensure(k2), () => ({ recGone, bootSaid })); await stopE(k2); k2.shutdown(); await sleepH(300);
    // S26b = userW's own path: the roll, then ⚙ → Update BEFORE the conversation is resumed (no launch in between): the file as the OLD
    // pod left it (no dirHosts — a file from before r4), the roll's boot retires the record, the Update's boot saves under THIS pod
    { const j = JSON.parse(fs.readFileSync(regFile, 'utf8')); j.host = PREV; delete j.dirHosts; for (const rec of Object.values(j.browsers)) { rec.host = PREV; rec.hosts = [PREV]; } fs.writeFileSync(regFile, JSON.stringify(j)); }
    liveH.clear(); const k3 = mk(); await k3.boot(); k3.shutdown(); await sleepH(300); // the roll's boot: nothing live ⇒ the record retired; the file saved under THIS pod
    const k3b = mk(); await k3b.boot(); k3b.shutdown(); await sleepH(300); // the Update's boot: nothing to retire, the file's writer is THIS pod
    plantH(dir, PREV, await deadPidH()); liveH.add(KG); const k4 = mk(); await k4.boot();
    out.S26b = await actE(k4, ensure(k4)); unplantH(dir); await stopE(k4);
    { await ensure(k4)(); await stopE(k4); plantH(dir, PREV, await deadPidH()); const f = await threw(() => k4.__kept.forget(KG)); const movedAside = !fs.existsSync(dir); fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); /* (the fake binary writes its lock file into the directory a real Chrome creates) */ out.S27 = await actE(k4, ensure(k4), () => ({ forgot: f ? f.code : 'ok', movedAside })); await stopE(k4); }
    k4.shutdown(); return out;
  };
  if (!isRoot) {
    const e = await runEph(K, 'product');
    judge('S24', 'D-Payments after the roll (its record kept its lineage) ⇒ taken over, launched on the kept directory', { err: null, launched: 1, recDir: true, left: 0, journal: /previous name pod-old — taken over/ }, e.S24);
    judge('S25', 'D-Payments: a foreign name on its kept directory ⇒ refused by name, nothing launched', { err: 'profile_locked', msg: /another machine's name \(stranger/, launched: 0, left: 3 }, e.S25);
    judge('S26a', 'r4 ④ the RETIRED record, first life after the roll: boot retires the ephemeral record (nothing live); a resume is still taken over (the file\'s writer = the old pod)', { recGone: true, bootSaid: /no live session carries bk-0000c007 — stopping it and removing the record/, err: null, launched: 1, left: 0, journal: /previous name pod-old — taken over/ }, e.S26a);
    judge('S26b', 'r4 ④ THE FINDING: one restart later (an Update while the conversation was not running) the kept directory\'s previous-name lock is STILL taken over — the lineage outlives the record (the directory remembers)', { err: null, launched: 1, left: 0, journal: /previous name pod-old — taken over/ }, e.S26b);
    judge('S27', 'Forget after the roll: the kept directory moved aside with its lock ⇒ the next start is on a fresh directory, nothing about a lock', { forgot: 'ok', movedAside: true, err: null, launched: 1, left: 0, journal: ['not', /previous name|another machine|NOT launched/] }, e.S27);
  }
  const dis = TABLE.filter((r) => !r.agree);
  ok(TABLE.length >= 20 && !dis.length, `④h THE THIRD JUDGEMENT: ${TABLE.length} scenarios through the real keeper, every one as userW's truth says`, dis.map((r) => `${r.id}: ${r.diffs.join(' / ')}`));
  // ── the three patched-KEEPER controls ──
  const ksrcH = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  if (!isRoot) {
    const noRemember = ksrcH.replace("    if (p.dir && reg.browsers[id]) { const rr = reg.browsers[id]; if (rr.state !== 'failed') rememberDir(p.dir, launchHostsFor(rr, p.dir), { retire: true }); else lineageLedger('retire-skipped-refused', { dir: dirKeyOf(p.dir), id }); }", "    /* CONTROL: a retired record's lineage is nobody's memory */"); // (r5: re-anchored to the remember door)
    ok(noRemember !== ksrcH, '④h control setup: the retire-time remember is where the control cuts');
    const c1 = await runEph(M.load('src/server/browser-keeper.js', noRemember, 'no-dir-lineage-at-retire'), 'ctl1');
    ok(c1.S26a.err === null && c1.S26b.err === 'profile_locked' && /another machine's name \(pod-old/.test(c1.S26b.msg) && c1.S26b.launched === 0 && c1.S26b.left === 3, '④h CONTROL 1: a keeper that forgets a retired record\'s lineage takes the lock over in the first life (the file\'s writer) and REFUSES the conversation\'s own kept directory one restart later as FOREIGN — the reproduced shape (userW\'s class on the ephemeral row); S26b catches it', { a: c1.S26a.err, b: c1.S26b.err, msg: c1.S26b.msg.slice(0, 160) });
    const noRead = ksrcH.replace("const byDir = dir ? lineageOf(dir).hosts : []; if (byDir.length) return byDir;", "const byDir = []; /* CONTROL: the directory's lineage is never read */ if (byDir.length) return byDir;"); // (r5: re-anchored to the identity-keyed read; r6: the read carries the marker; r7: the read is the ONE lineage verdict)
    ok(noRead !== ksrcH, '④h control setup: the directory read is where the control cuts');
    const c2 = await runEph(M.load('src/server/browser-keeper.js', noRead, 'no-dir-lineage-read'), 'ctl2');
    ok(c2.S26a.err === null && c2.S26b.err === 'profile_locked' && c2.S26b.left === 3, '④h CONTROL 2: a keeper that never reads the directory\'s lineage — the same refusal one restart later; S26b catches it', { a: c2.S26a.err, b: c2.S26b.err });
  }
  { const holderless = ksrcH.replace("const a = B.lockVerdict({ phase: 'after-launch', lock: facts.lock, holder: facts.holder,", "const a = B.lockVerdict({ phase: 'after-launch', lock: facts.lock, holder: null, /* CONTROL: the post-launch judgement drops the holder's facts */");
    ok(holderless !== ksrcH, '④h control setup: the post-launch judgement\'s holder facts are where the control cuts');
    const c3 = await runS8(M.load('src/server/browser-keeper.js', holderless, 'post-launch-holderless'), 'ctl3');
    ok(c3.err === 'profile_locked' && /took the lock over now/.test(c3.msg) && c3.left === 0 && c3.holderAlive === true, '④h CONTROL 3: a post-launch judgement without the holder\'s facts takes a LIVE holder\'s lock over (step ⑤ before step ①: the lock gone under a running browser — two Chromes next) — S8 catches it', { err: c3.err, left: c3.left, alive: c3.holderAlive, msg: c3.msg.slice(0, 140) }); }
  for (const pr of procsH) { try { pr.kill('SIGKILL'); } catch { } }
  k.shutdown();
}
// ═══ ④i VERIFY r5 (T1/T2): THE FOURTH JUDGEMENT — THE DIRECTORY LINEAGE UNDER ATTACK, AGAINST A HAND-WRITTEN TRUTH ═══════════
// r4 made a DIRECTORY remember its launch hosts (the lineage outlives a retired record). r5 attacked that memory, each row through
// the REAL keeper: a PVC that flaps (an EACCES at ONE load pruned the lineage — the next resume was refused as foreign), ONE
// directory under TWO spellings (the fleet's home is reached through a symlink, /home/vibe → /home/<name>, proven read-only on
// userW's and userZ's pods — remembered under one, read under the other = orphaned), a FRESH directory made at a forgotten one's
// path (it inherited the lineage in-process, not after a reload — the inode is the witness now), a COPIED directory, the bound
// reached (silent; 200 kept directories at one roll's boot evicted 72 lineages at 128 — 512 now, the evictions said), a >bound file
// kept by insertion order (by `at` now). Three patched-keeper controls: prune on ANY stat error, the spelling as given, no inode witness.
// r6 (the fifth judgement) attacked the inode witness itself: ext4 hands a removed directory's inode to the next mkdir (the fleet's RBD
// filesystem, measured 20/20) so a stranger's old-pod lock at a forgotten path was taken over; a file-level restore (every inode new)
// orphaned every kept directory's lineage — the disaster-recovery path refused each as foreign; a tree under two mounts was two
// identities; 200 gone / re-keyed / unreadable directories at one boot were 200 lines each. THE DIRECTORY'S OWN MARKER is the
// witness now (S43p / S43 / S44 / S48 / S54), the load says once per kind (S49a–c); two more controls: a keeper that never reads the
// marker, the PURE rule without it.
console.log('— ④i verify r5: the fourth judgement — the directory lineage: a flapping PVC, two spellings, a forgotten path, a copy, the bound; three keeper controls');
{
  const KSt = require('../src/server/browser-kept.js');
  const PREV = 'pod-old'; const isRoot = !!(process.getuid && process.getuid() === 0);
  const linesI = []; const klogI = { log: (...a) => linesI.push(a.join(' ')), warn: (...a) => linesI.push('WARN ' + a.join(' ')), error() { } };
  const sleepI = (ms) => new Promise((r) => setTimeout(r, ms));
  const deadPidI = () => new Promise((r) => { const c = spawn('true', [], { stdio: 'ignore' }); c.on('exit', () => r(c.pid)); });
  const plantI = (dir, host, pid) => { for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, n)); } catch { } } fs.symlinkSync(`${host}-${pid}`, path.join(dir, 'SingletonLock')); fs.symlinkSync(path.join(ROOT, 'gone', 'SingletonSocket'), path.join(dir, 'SingletonSocket')); fs.symlinkSync('0123456789abcdef', path.join(dir, 'SingletonCookie')); };
  const unplantI = (dir) => { for (const n of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(dir, n)); } catch { } } };
  const singletonsI = (dir) => ['SingletonLock', 'SingletonSocket', 'SingletonCookie'].filter((n) => { try { fs.lstatSync(path.join(dir, n)); return true; } catch { return false; } });
  const TABLE = [];
  const judge = (id, who, truth, got) => {
    const diffs = [];
    for (const [k2, want] of Object.entries(truth)) {
      const g = got[k2]; let pass2;
      if (want instanceof RegExp) pass2 = typeof g === 'string' && want.test(g);
      else if (Array.isArray(want) && want[0] === 'not') pass2 = !(typeof g === 'string' && want[1].test(g));
      else pass2 = JSON.stringify(g) === JSON.stringify(want);
      if (!pass2) diffs.push(`${k2}: truth ${String(want).slice(0, 90)} | product ${JSON.stringify(g === undefined ? null : g).slice(0, 200)}`);
    }
    TABLE.push({ id, who, agree: !diffs.length, diffs });
    return !diffs.length;
  };
  const rowI = (kk, id) => { const d = kk.list(); const b = d.browsers[id] || null; const p = (d.profiles || []).find((x) => x.id === id) || null; return { state: b ? b.state : null, renamedFrom: p && p.renamedFrom ? p.renamedFrom.host : null }; };
  const actI = async (kk, p, fn, more = () => ({})) => { const l0 = linesI.length, L0 = logOf('launches.log').length; const e = await threw(fn); const r = rowI(kk, p.id); return { err: e ? e.code : null, msg: e ? e.message : '', journal: linesI.slice(l0).join('\n'), launched: logOf('launches.log').length - L0, left: singletonsI(p.dir).length, state: r.state, renamedFrom: r.renamedFrom, ...more(e) }; };
  const attachI = (kk, p) => () => kk.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-2' });
  const stopI = async (kk, p) => { try { await kk.stop(p.id, { why: 'user' }); } catch { } };
  /** a directory of ours under `parent`: adopted, launched once, stopped, its record's lineage [pod-old], its record REMOVED through the real door ⇒ the directory remembers */
  const retiredDirI = async (kk, parent, name) => { const dir = path.join(parent, name); fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); const p = kk.adoptDirectory({ label: name, dir }).profile; await kk.attach({ profileId: p.id, browserKey: KA, sessionId: 'sess-1' }); await stopI(kk, p); const r = kk._reg().browsers[p.id]; r.host = PREV; r.hosts = [PREV]; for (const l of kk._reg().leases.filter((l) => l.profileId === p.id)) { try { kk.detach({ profileId: p.id, browserKey: l.browserKey, by: 'user' }); } catch { } } kk.removeProfile(p.id); return dir; };
  const dhI = (kk, dir, ino = null) => B.dirHostsOf(kk._reg().dirHosts, dir, { ino });
  const IROOT = path.join(ROOT, 'i-dirs'); fs.mkdirSync(IROOT, { recursive: true });
  // ── the named rows: a forgotten path, a copy, a flapping PVC, a gone directory ──
  const runNamed = async (Kmod, tag) => {
    const out = {}; const DI = path.join(ROOT, 'data-i-' + tag); fs.mkdirSync(DI, { recursive: true }); const parent = path.join(IROOT, tag); fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    { let kk = mkKeeper(Kmod, { dataDir: DI, log: klogI }); const dir = await retiredDirI(kk, parent, 's32'); fs.renameSync(dir, dir + '.aside'); fs.mkdirSync(dir, { mode: 0o700 }); plantI(dir, PREV, await deadPidI()); const p2 = kk.adoptDirectory({ label: 's32-again', dir }).profile;
      out.S32a = await actI(kk, p2, attachI(kk, p2)); unplantI(dir); await stopI(kk, p2);
      const src = await retiredDirI(kk, parent, 's38'); const copy = src + '-copy'; fs.cpSync(src, copy, { recursive: true }); kk.shutdown(); await sleepI(150);
      { const rf = path.join(DI, 'browser-profiles.json'); const j = JSON.parse(fs.readFileSync(rf, 'utf8')); j.dirHosts = { ...(j.dirHosts || {}), [copy]: { ...(j.dirHosts[src] || { hosts: [PREV], at: 1 }) } }; fs.writeFileSync(rf, JSON.stringify(j)); }
      kk = mkKeeper(Kmod, { dataDir: DI, log: klogI }); await kk.boot(); unplantI(copy); plantI(copy, PREV, await deadPidI()); const p3 = kk.adoptDirectory({ label: 's38-copy', dir: copy }).profile;
      out.S38b = await actI(kk, p3, attachI(kk, p3), () => ({ inoDiffers: fs.statSync(copy).ino !== fs.statSync(src).ino })); unplantI(copy); await stopI(kk, p3); kk.shutdown(); await sleepI(150); }
    if (!isRoot) {
      let kk = mkKeeper(Kmod, { dataDir: DI, log: klogI }); const dir = await retiredDirI(kk, parent, 's36'); const had = dhI(kk, dir); kk.shutdown(); await sleepI(150);
      fs.chmodSync(parent, 0o000); kk = mkKeeper(Kmod, { dataDir: DI, log: klogI }); const l0 = linesI.length; await kk.boot(); const said = linesI.slice(l0).join('\n'); fs.chmodSync(parent, 0o700);
      const kept = dhI(kk, dir); plantI(dir, PREV, await deadPidI()); const p2 = kk.adoptDirectory({ label: 's36-again', dir }).profile;
      out.S36 = { had, kept, said, ...(await actI(kk, p2, attachI(kk, p2))) }; unplantI(dir); await stopI(kk, p2); kk.shutdown(); await sleepI(150);
    }
    { let kk = mkKeeper(Kmod, { dataDir: DI, log: klogI }); const dir = await retiredDirI(kk, parent, 's37'); kk.shutdown(); await sleepI(150); fs.rmSync(dir, { recursive: true, force: true });
      kk = mkKeeper(Kmod, { dataDir: DI, log: klogI }); const l0 = linesI.length; await kk.boot(); out.S37 = { pruned: dhI(kk, dir).length === 0, said: linesI.slice(l0).join('\n') }; kk.shutdown(); await sleepI(150); }
    return out;
  };
  // ── the bound ──
  const runBound = async (Kmod, tag) => {
    const out = {}; const N = B.DIR_HOSTS_MAX; let t = 1_700_000_000_000; const DI = path.join(ROOT, 'data-i-bound-' + tag); fs.mkdirSync(DI, { recursive: true });
    const kk = mkKeeper(Kmod, { dataDir: DI, log: klogI, now: () => (t += 1000) }); const parent = path.join(IROOT, 'bound-' + tag); fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    const liveDir = path.join(parent, 'live'); fs.mkdirSync(liveDir, { mode: 0o700 }); const live = kk.adoptDirectory({ label: 'live', dir: liveDir }).profile; await kk.attach({ profileId: live.id, browserKey: KB, sessionId: 'sess-2' }); // launched: stamped ⇒ the OLDEST `at`
    const first = dhI(kk, liveDir); const dirs = []; let said = '';
    for (let i = 0; i < N; i++) { const d = path.join(parent, 'd' + i); fs.mkdirSync(d, { mode: 0o700 }); const p = kk.adoptDirectory({ label: 'd' + i, dir: d }).profile; kk._reg().browsers[p.id] = { profileId: p.id, state: 'stopped', hosts: [PREV], host: PREV, pid: null }; dirs.push(d); const l0 = linesI.length; kk.removeProfile(p.id); if (i === N - 1) said = linesI.slice(l0).join('\n'); }
    const keys = Object.keys(kk._reg().dirHosts);
    out.S34 = { firstHadIt: first.length > 0, size: keys.length, liveEvicted: !keys.includes(liveDir), dir0Kept: keys.includes(dirs[0]), said, liveStillLaunches: (await threw(() => kk.attach({ profileId: live.id, browserKey: KA, sessionId: 'sess-1' }))) ? 'threw' : null };
    await stopI(kk, live); kk.shutdown(); await sleepI(150);
    { const DI2 = path.join(ROOT, 'data-i-bound2-' + tag); fs.mkdirSync(DI2, { recursive: true }); const m = {}; const bd = path.join(IROOT, 'bdirs-' + tag); for (let i = 0; i < N + 2; i++) { const d = path.join(bd, 'd' + i); fs.mkdirSync(d, { recursive: true }); m[d] = { hosts: [PREV], at: i < 2 ? 9_000_000_000_000 : 1_000_000_000 + i }; } // the two FIRST-inserted are the NEWEST
      fs.writeFileSync(path.join(DI2, 'browser-profiles.json'), JSON.stringify({ host: PREV, profiles: [], browsers: {}, dirHosts: m })); const k2 = mkKeeper(Kmod, { dataDir: DI2, log: klogI }); await k2.boot(); const ks2 = Object.keys(k2._reg().dirHosts);
      out.S35 = { size: ks2.length, newestKept: ks2.includes(path.join(bd, 'd0')) && ks2.includes(path.join(bd, 'd1')), oldestDropped: !ks2.includes(path.join(bd, 'd2')) && !ks2.includes(path.join(bd, 'd3')) }; k2.shutdown(); await sleepI(150); }
    return out;
  };
  // ── two spellings of one directory (the ephemeral row on its kept directory; the home reached through a symlink, then renamed) ──
  const runSpell = async (Kmod, tag) => {
    const out = {}; const settings = { 'browser.idleTimeoutMs': 600000 }; const quiet = { log() { }, warn() { }, error() { } };
    const realHome = path.join(ROOT, 'i-home-real-' + tag), linkHome = path.join(ROOT, 'i-home-link-' + tag); fs.mkdirSync(path.join(realHome, '.agent-browser'), { recursive: true, mode: 0o700 }); fs.symlinkSync(realHome, linkHome);
    fs.writeFileSync(path.join(realHome, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox' }));
    const DATA1 = path.join(linkHome, 'vibespace', 'data'), DATA2 = path.join(realHome, 'vibespace', 'data'); fs.mkdirSync(DATA2, { recursive: true });
    const liveS = new Set([KG]);
    const mkE = (DATA, homeDir) => { const beI = BE.create({ dataDir: DATA, homeDir, serverSetting: (x) => settings[x], log: quiet, socketDirBase: path.join(ROOT, 'sock-i-' + tag), env: { XDG_RUNTIME_DIR: XDG } }); let kp = null; const kept = KSt.create({ dataDir: DATA, keeper: () => kp, liveKeys: () => liveS, serverSetting: (x) => settings[x], log: quiet, sweepEveryMs: 0 }); kp = mkKeeper(Kmod, { dataDir: DATA, homeDir, kept, serverSetting: (x) => settings[x], liveKeys: () => liveS, log: klogI }); kp.__be = beI; return kp; };
    const ensureOf = (kk) => { const e = kk.__be.envFor({ browserKey: KG, cwd: HOME }); return () => kk.ensureEphemeral({ browserKey: KG, sessionId: 'sess-7', envPairs: e.pairs, sessionName: 'D-Payments', variant: e.variant }); };
    const actE = async (kk, dir, fn, more = () => ({})) => { const l0 = linesI.length, L0 = logOf('launches.log').length; const e = await threw(fn); return { err: e ? e.code : null, msg: e ? e.message : '', journal: linesI.slice(l0).join('\n'), launched: logOf('launches.log').length - L0, left: singletonsI(dir).length, ...more(e) }; };
    const stopE = async (kk) => { const e2 = kk.ephemeralFor(KG); try { if (e2) await kk.stop(e2.profileId, { why: 'user' }); } catch { } };
    let kk = mkE(DATA1, linkHome); await ensureOf(kk)(); const dir1 = kk.ephemeralFor(KG).dir; await stopE(kk); kk.shutdown(); await sleepI(150);
    const rf = path.join(DATA2, 'browser-profiles.json'); const asOld = () => { const j = JSON.parse(fs.readFileSync(rf, 'utf8')); j.host = PREV; delete j.dirHosts; for (const rec of Object.values(j.browsers)) { rec.host = PREV; rec.hosts = [PREV]; } fs.writeFileSync(rf, JSON.stringify(j)); };
    asOld(); liveS.clear(); kk = mkE(DATA1, linkHome); await kk.boot(); const rememberedUnder = Object.keys(kk._reg().dirHosts); kk.shutdown(); await sleepI(150); // the roll's boot, still the old spelling: the record retired, the directory remembers
    { const k3 = mkE(DATA2, realHome); await k3.boot(); k3.shutdown(); await sleepI(150); } // the personalization: the first boot under the new spelling (an Update — the file's writer is this pod)
    const dir2 = path.join(DATA2, 'browser-profiles', KG); const real2 = fs.realpathSync(dir2); plantI(dir2, PREV, await deadPidI()); liveS.add(KG); kk = mkE(DATA2, realHome); await kk.boot();
    out.S42 = await actE(kk, dir2, ensureOf(kk), () => ({ sameInode: fs.statSync(dir1).ino === fs.statSync(dir2).ino, rememberedUnder: rememberedUnder.map((x) => x.startsWith(linkHome + '/') ? 'LINK' : (x.startsWith(fs.realpathSync(realHome) + '/') ? 'REAL' : x)).join() }));
    unplantI(dir2); await stopE(kk); kk.shutdown(); await sleepI(150);
    { const j = JSON.parse(fs.readFileSync(rf, 'utf8')); j.host = PREV; const linkKey = path.join(DATA1, 'browser-profiles', KG); j.dirHosts = { [linkKey]: { hosts: [PREV], at: 5 } }; j.profiles = j.profiles.filter((p) => !p.ephemeral); for (const id of Object.keys(j.browsers)) delete j.browsers[id]; j.leases = []; fs.writeFileSync(rf, JSON.stringify(j));
      liveS.clear(); const k5 = mkE(DATA2, realHome); const l0 = linesI.length; await k5.boot(); const said = linesI.slice(l0).join('\n'); const keys = Object.keys(k5._reg().dirHosts); k5.shutdown(); await sleepI(150);
      { const k6 = mkE(DATA2, realHome); await k6.boot(); k6.shutdown(); await sleepI(150); }
      plantI(dir2, PREV, await deadPidI()); liveS.add(KG); const k7 = mkE(DATA2, realHome); await k7.boot();
      out.S42b = { rekeyed: keys.length === 1 && keys[0] === real2 && !keys.includes(linkKey), said, ...(await actE(k7, dir2, ensureOf(k7))) }; unplantI(dir2); await stopE(k7); k7.shutdown(); await sleepI(150); }
    return out;
  };

  // ── r6: THE IDENTITY WITNESS attacked (the fifth judgement): a file-level restore, inode reuse, two mounts, a directory moved aside, the said lines ──
  const runR6 = async (Kmod, tag) => {
    const out = {}; const DI = path.join(ROOT, 'data-r6-' + tag); fs.mkdirSync(DI, { recursive: true }); const parent = path.join(IROOT, 'r6-' + tag); fs.mkdirSync(parent, { recursive: true, mode: 0o700 }); const MK = B.LINEAGE_MARKER;
    // S44 a file-level RESTORE: the data tree AND the directories copied file by file (every inode new, the same paths); the new pod works (a save under its name); the kept directory resumes carrying the pre-restore pod's lock
    { let kk = mkKeeper(Kmod, { dataDir: DI, log: klogI }); const dir = await retiredDirI(kk, parent, 's44'); const tok = (kk._reg().dirHosts[dir] || {}).tok; kk.shutdown(); await sleepI(150);
      const ino1 = fs.statSync(dir).ino; for (const D of [DI, parent]) { fs.cpSync(D, D + '.restored', { recursive: true }); fs.rmSync(D, { recursive: true, force: true }); fs.renameSync(D + '.restored', D); } const ino2 = fs.statSync(dir).ino;
      kk = mkKeeper(Kmod, { dataDir: DI, log: klogI }); await kk.boot(); { const p = kk.createProfile({ label: 'other-' + tag }); kk.removeProfile(p.id); } const fileHost = JSON.parse(fs.readFileSync(path.join(DI, 'browser-profiles.json'), 'utf8')).host;
      plantI(dir, PREV, await deadPidI()); const p2 = kk.adoptDirectory({ label: 's44-again', dir }).profile;
      out.S44 = { tok: B.isLineageToken(tok), markerKept: fs.existsSync(path.join(dir, MK)), inoChanged: ino1 !== ino2, fileHostIsThis: fileHost === os.hostname(), ...(await actI(kk, p2, attachI(kk, p2))) }; unplantI(dir); await stopI(kk, p2); kk.shutdown(); await sleepI(150); }
    // S43 the keeper leg runs where the scratch filesystem REUSES a removed directory's inode (ext4 — the fleet's; measured 20/20); tmpfs never does, the PURE row S43p carries the rule
    { const probe = path.join(parent, 'probe'); fs.mkdirSync(probe, { recursive: true }); const a = fs.statSync(probe).ino; fs.rmSync(probe, { recursive: true, force: true }); fs.mkdirSync(probe); const reuses = fs.statSync(probe).ino === a; fs.rmSync(probe, { recursive: true, force: true });
      if (reuses) { const kk = mkKeeper(Kmod, { dataDir: path.join(DI, 'd43'), log: klogI }); const dir = await retiredDirI(kk, parent, 's43'); const i1 = fs.statSync(dir).ino; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { mode: 0o700 }); const i2 = fs.statSync(dir).ino; plantI(dir, PREV, await deadPidI()); const p2 = kk.adoptDirectory({ label: 's43-again', dir }).profile; out.S43 = { sameIno: i1 === i2, ...(await actI(kk, p2, attachI(kk, p2))) }; unplantI(dir); await stopI(kk, p2); kk.shutdown(); await sleepI(150); }
      else { out.S43 = null; if (Kmod === K) console.log('  (④i S43 keeper leg: the scratch filesystem does not reuse inodes — the PURE row S43p carries the rule)'); } }
    // S48 one tree under TWO MOUNTS (bindfs: one inode, two devices, two real paths — the owner's own box): remembered under one spelling, read under the other (SKIPPED without a user bindfs)
    { const src = path.join(parent, 'mnt-src'), dst = path.join(parent, 'mnt-dst'); fs.mkdirSync(src, { recursive: true, mode: 0o700 }); fs.mkdirSync(dst, { recursive: true, mode: 0o700 }); let mounted = false; try { execFileSync('bindfs', ['--no-allow-other', src, dst], { stdio: 'ignore', timeout: 10000 }); mounted = fs.statSync(dst).dev !== fs.statSync(src).dev; } catch { mounted = false; }
      if (mounted) { try { const DS = path.join(src, 'data'), DD = path.join(dst, 'data'); fs.mkdirSync(DS, { recursive: true }); const kS = mkKeeper(Kmod, { dataDir: DS, log: klogI }); const dirS = await retiredDirI(kS, src, 'p1'); kS.shutdown(); await sleepI(150); const dirD = path.join(dst, 'p1'); const kD = mkKeeper(Kmod, { dataDir: DD, log: klogI }); await kD.boot(); { const p = kD.createProfile({ label: 'other2-' + tag }); kD.removeProfile(p.id); } plantI(dirD, PREV, await deadPidI()); const p2 = kD.adoptDirectory({ label: 'p1-again', dir: dirD }).profile; out.S48 = { sameIno: fs.statSync(dirS).ino === fs.statSync(dirD).ino, ...(await actI(kD, p2, attachI(kD, p2))) }; unplantI(dirD); await stopI(kD, p2); kD.shutdown(); await sleepI(150); } finally { try { execFileSync('fusermount', ['-u', dst], { stdio: 'ignore', timeout: 10000 }); } catch { } } }
      else { out.S48 = null; if (Kmod === K) console.log('  (④i S48 bindfs leg: no user bindfs mount here — the PURE row S43p carries the by-token rule)'); } }
    // S54 a directory moved aside (Forget) and adopted again at its NEW path: found by its token ⇒ taken over, ONE entry re-keyed to the new spelling
    { const kk = mkKeeper(Kmod, { dataDir: path.join(DI, 'd54'), log: klogI }); const dir = await retiredDirI(kk, parent, 's54'); const aside = dir + '.aside'; fs.renameSync(dir, aside); plantI(aside, PREV, await deadPidI()); const p2 = kk.adoptDirectory({ label: 's54-aside', dir: aside }).profile; const got = await actI(kk, p2, attachI(kk, p2)); const keys = Object.keys(kk._reg().dirHosts); out.S54 = { ...got, oneEntry: keys.length === 1 && keys[0] === aside }; unplantI(aside); await stopI(kk, p2); kk.shutdown(); await sleepI(150); }
    // S49 what the load does to MANY directories is said ONCE per kind (40 gone / 40 r4-era keys / 40 unreadable)
    { const mkFile = (D, map) => { fs.mkdirSync(D, { recursive: true }); fs.writeFileSync(path.join(D, 'browser-profiles.json'), JSON.stringify({ host: PREV, profiles: [], browsers: {}, leases: [], dirHosts: map })); };
      { const D = path.join(DI, 'd49a'); const m = {}; for (let i = 0; i < 40; i++) m[path.join(parent, 'gone', 'g' + i)] = { hosts: [PREV], at: 1 + i }; mkFile(D, m); const kk = mkKeeper(Kmod, { dataDir: D, log: klogI }); const l0 = linesI.length; await kk.boot(); const said = linesI.slice(l0); out.S49a = { left: Object.keys(kk._reg().dirHosts).length, lines: said.filter((l) => /forgotten — the directory is gone/.test(l)).length, counted: said.some((l) => /40 directories forgotten — the directory is gone — each of: /.test(l)) }; kk.shutdown(); await sleepI(150); }
      { const D = path.join(DI, 'd49b'); const realH = path.join(parent, 'h-real'), linkH = path.join(parent, 'h-link'); fs.mkdirSync(realH, { recursive: true }); fs.symlinkSync(realH, linkH); const m = {}; for (let i = 0; i < 40; i++) { fs.mkdirSync(path.join(realH, 'd' + i), { recursive: true }); m[path.join(linkH, 'd' + i)] = { hosts: [PREV], at: 1 + i }; } mkFile(D, m); const kk = mkKeeper(Kmod, { dataDir: D, log: klogI }); const l0 = linesI.length; await kk.boot(); const said = linesI.slice(l0); const rp = fs.realpathSync(realH); out.S49b = { rekeyed: Object.keys(kk._reg().dirHosts).filter((x) => x.startsWith(rp + '/')).length, lines: said.filter((l) => /is remembered under its real path/.test(l)).length }; kk.shutdown(); await sleepI(150); }
      if (!isRoot) { const D = path.join(DI, 'd49c'); const pp = path.join(parent, 'unread'); const m = {}; for (let i = 0; i < 40; i++) { fs.mkdirSync(path.join(pp, 'd' + i), { recursive: true }); m[path.join(pp, 'd' + i)] = { hosts: [PREV], at: 1 + i }; } mkFile(D, m); fs.chmodSync(pp, 0o000); const kk = mkKeeper(Kmod, { dataDir: D, log: klogI }); const l0 = linesI.length; await kk.boot(); const said = linesI.slice(l0); fs.chmodSync(pp, 0o700); out.S49c = { kept: Object.keys(kk._reg().dirHosts).length, lines: said.filter((l) => /40 directories kept — the directory cannot be read right now \(EACCES\); judged again at the next load — each of: /.test(l)).length }; kk.shutdown(); await sleepI(150); } }
    return out;
  };
  /** PURE: the marker decides (an entry with `tok`), the inode only for an r5-era entry, a path miss found by the token, one entry per token. */
  const pureRows = (Bx) => { const d = path.join(IROOT, 'pure-d'); const T = 'feedfacefeedfacefeedface'; const m = { [d]: { hosts: [PREV], at: 1, ino: 5, tok: T } }; return { reuse: Bx.dirHostsOf(m, d, { ino: 5, tok: null }), restore: Bx.dirHostsOf(m, d, { ino: 6, tok: T }), stranger: Bx.dirHostsOf(m, d, { ino: 5, tok: 'deadbeefdeadbeefdeadbeef' }), moved: Bx.dirHostsOf(m, d + '.aside', { ino: 5, tok: T, bearer: () => null }), r5era: Bx.dirHostsOf({ [d]: { hosts: [PREV], at: 1, ino: 5 } }, d, { ino: 5, tok: null }), r5eraOther: Bx.dirHostsOf({ [d]: { hosts: [PREV], at: 1, ino: 5 } }, d, { ino: 6 }), oneEntry: Object.keys(Bx.rememberDirHosts(m, d + '.aside', [PREV], 2, 512, { tok: T })) }; };
  const e = await runNamed(K, 'product'); const bnd = await runBound(K, 'product'); const sp = await runSpell(K, 'product');
  judge('S32a', 'a FRESH directory at a forgotten one\'s path (no reload between): the inode witness says it is not that directory ⇒ refused by name', { err: 'profile_locked', msg: /another machine's name \(pod-old/, launched: 0, left: 3 }, e.S32a);
  judge('S38b', 'the directory COPIED (another inode) BESIDE its original, a duplicate entry hand-written at the copy\'s path: r7 — one token ⇒ one entry (the duplicate dropped at load), the token\'s bearer (the original) is still there with another inode ⇒ a COPY, not a restore ⇒ its lineage refused and SAID, the old-pod lock inside it refused by name (r6 took it over as "a restore\'s shape" and its remember stole the original\'s entry — ④j S56b)', { inoDiffers: true, err: 'profile_locked', launched: 0, left: 3, journal: /is a copy of/ }, e.S38b);
  if (e.S36) judge('S36', 'EACCES on the directory at ONE load (a flapping PVC) ⇒ the lineage KEPT (gone = ENOENT only), said once; the next resume taken over', { had: [PREV], kept: [PREV], said: /kept — the directory cannot be read right now \(EACCES\); judged again at the next load/, err: null, launched: 1, left: 0, renamedFrom: PREV }, e.S36);
  judge('S37', 'the directory gone at load (ENOENT) ⇒ pruned AND said', { pruned: true, said: /forgotten — the directory is gone/ }, e.S37);
  judge('S34', `the bound reached (${B.DIR_HOSTS_MAX + 1} directories): the OLDEST remembered is evicted (the live one's — its own record still knows), the eviction SAID with its path; the first retired one still remembered`, { firstHadIt: true, size: B.DIR_HOSTS_MAX, liveEvicted: true, dir0Kept: true, liveStillLaunches: null, said: new RegExp(`forgotten at the ${B.DIR_HOSTS_MAX} bound \\(the oldest remembered\\): `) }, bnd.S34);
  judge('S35', `a ${B.DIR_HOSTS_MAX + 2}-entry file at load: the bound keeps the ${B.DIR_HOSTS_MAX} NEWEST by at, never the last by insertion order`, { size: B.DIR_HOSTS_MAX, newestKept: true, oldestDropped: true }, bnd.S35);
  judge('S42', 'ONE directory, two spellings (launched through the symlinked home, read under the real one after the personalization): remembered under its IDENTITY ⇒ taken over', { sameInode: true, rememberedUnder: 'REAL', err: null, launched: 1, left: 0, journal: /previous name pod-old — taken over/ }, sp.S42);
  judge('S42b', 'an r4-era file keyed by the symlink spelling: re-keyed at load to the real path (said), persisted ⇒ the resume one Update later taken over', { rekeyed: true, said: /is remembered under its real path/, err: null, launched: 1, left: 0 }, sp.S42b);

  const r6 = await runR6(K, 'product'); const pr = pureRows(B);
  judge('S43p', 'PURE: the witness is the directory\'s MARKER — an entry with a token: the directory with none and the SAME inode (ext4 reuse) ⇒ none; the same token with ANOTHER inode (a restore) ⇒ answered; a stranger\'s token ⇒ none; the token under another path (moved / a mount) ⇒ answered; an r5-era entry keeps the inode rule; a remember under a new spelling leaves ONE entry', { reuse: [], restore: [PREV], stranger: [], moved: [PREV], r5era: [PREV], r5eraOther: [], oneEntry: [path.join(IROOT, 'pure-d') + '.aside'] }, pr);
  if (r6.S43) { judge('S43', 'KEEPER on a filesystem whose probe reused an inode: a forgotten directory removed, a stranger\'s (same old pod) put at its path ⇒ refused by name (the marker is absent; whether THIS mkdir reused the inode is printed, never pinned — the PURE row pins the rule)', { err: 'profile_locked', launched: 0, left: 3 }, r6.S43); console.log(`  (④i S43 keeper leg ran: the stranger's directory got ${r6.S43.sameIno ? 'the SAME' : 'another'} inode)`); }
  judge('S44', 'a file-level RESTORE (every inode new, the same paths; the new pod has saved under its own name): the conversation\'s own kept directory with the pre-restore pod\'s lock ⇒ taken over — the marker survives the copy, the inode is not asked', { tok: true, markerKept: true, inoChanged: true, fileHostIsThis: true, err: null, launched: 1, left: 0, journal: /previous name pod-old — taken over/ }, r6.S44);
  if (r6.S48) judge('S48', 'one tree under two MOUNTS (bindfs: one inode, two real paths): remembered under one spelling, read under the other ⇒ found by the token ⇒ taken over', { sameIno: true, err: null, launched: 1, left: 0 }, r6.S48);
  judge('S54', 'a directory moved aside (Forget) and adopted again at its NEW path: found by its token ⇒ its lineage ⇒ taken over; ONE entry, re-keyed to the new spelling', { err: null, launched: 1, left: 0, oneEntry: true }, r6.S54);
  judge('S49a', '40 directories gone at one load: every lineage pruned, said ONCE (the count and the first paths), never a line each', { left: 0, lines: 1, counted: true }, r6.S49a);
  judge('S49b', '40 r4-era keys at one load: every one re-keyed, said ONCE', { rekeyed: 40, lines: 1 }, r6.S49b);
  if (r6.S49c) judge('S49c', '40 directories unreadable at one load: every lineage kept, said ONCE with the code census', { kept: 40, lines: 1 }, r6.S49c);
  const dis = TABLE.filter((r) => !r.agree);
  ok(TABLE.length >= 13 && !dis.length, `④i THE FOURTH + FIFTH JUDGEMENT: ${TABLE.length} scenarios through the real keeper (and the PURE rule), every one as the truth says`, dis.map((r) => `${r.id}: ${r.diffs.join(' / ')}`));
  // ── the three patched-KEEPER controls ──
  const ksrcI = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  if (!isRoot) {
    const anyErr = ksrcI.replace("try { fs.lstatSync(d); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) gone = true; else err = e; }", "try { fs.lstatSync(d); } catch (e) { gone = true; /* CONTROL: any error prunes */ }");
    ok(anyErr !== ksrcI, '④i control setup: the prune\'s error classification is where the control cuts');
    const c4 = await runNamed(M.load('src/server/browser-keeper.js', anyErr, 'prune-on-any-error'), 'ctl4');
    ok(c4.S36 && c4.S36.kept.length === 0 && c4.S36.err === 'profile_locked' && c4.S36.left === 3 && c4.S36.launched === 0, '④i CONTROL 4: a keeper that prunes on ANY stat error loses the lineage at one unreadable load and refuses the directory as FOREIGN at the next resume — S36 catches it', c4.S36 && { kept: c4.S36.kept, err: c4.S36.err, left: c4.S36.left });
  }
  { const literal = ksrcI.replace("const id = F.dirIdentity(d); return id ? id.replace(/\\/+$/, '') || id : d; };", "return d; /* CONTROL: the spelling as given */ };");
    ok(literal !== ksrcI, '④i control setup: the identity key is where the control cuts');
    const c5k = await runSpell(M.load('src/server/browser-keeper.js', literal, 'literal-dir-key'), 'ctl5k');
    ok(c5k.S42.rememberedUnder === 'LINK' && c5k.S42.err === null && c5k.S42b.rekeyed === false, '④i CONTROL 5 (r6, the key alone): a keeper that keys by the spelling as given still remembers under the symlink spelling and never re-keys (S42 / S42b see the structure) — but the TOKEN finds the lineage the key missed, so the verdict holds', { under: c5k.S42.rememberedUnder, err: c5k.S42.err, rekeyed: c5k.S42b.rekeyed });
    const literalNoTok = literal.replace("const dirTokOf = (dir) => { try {", "const dirTokOf = (dir) => { return null; /* CONTROL: no marker read */ try {");
    ok(literalNoTok !== literal, '④i control setup: the marker read is where the second cut is');
    const c5 = await runSpell(M.load('src/server/browser-keeper.js', literalNoTok, 'literal-dir-key-no-marker'), 'ctl5');
    ok(c5.S42.rememberedUnder === 'LINK' && c5.S42.err === 'profile_locked' && c5.S42.left === 3 && c5.S42b.err === 'profile_locked', '④i CONTROL 5: a keeper that keys the lineage by the spelling as given AND reads no marker orphans it at the personalization (remembered under the symlink spelling, read under the real one — refused as foreign; the r4-era file never re-keyed) — S42 / S42b catch it', { under: c5.S42.rememberedUnder, err: c5.S42.err, left: c5.S42.left, b: c5.S42b.err }); }
  { const noIno = ksrcI.replace("const dirInoOf = (dir) => { try {", "const dirInoOf = (dir) => { return null; /* CONTROL: no inode witness */ try {").replace("const mintDirTok = (dir, { fresh = false } = {}) => { const have = fresh ? null : dirTokOf(dir); if (have) return have;", "const mintDirTok = (dir, { fresh = false } = {}) => { return null; /* CONTROL: no marker minted */ const have = fresh ? null : dirTokOf(dir); if (have) return have;");
    ok(noIno !== ksrcI && noIno.includes('no marker minted'), '④i control setup: the inode witness and the marker mint are where the control cuts');
    const c6 = await runNamed(M.load('src/server/browser-keeper.js', noIno, 'no-inode-witness'), 'ctl6');
    ok(c6.S32a.err === null && c6.S32a.launched === 1 && c6.S38b.err === null && c6.S38b.launched === 1, '④i CONTROL 6: a keeper with NEITHER witness (no inode, no marker — the r4 keeper) hands a forgotten directory\'s lineage to a fresh directory at its path (S32a catches it; a copy is taken over there as here)', { a: c6.S32a.err, b: c6.S38b.err }); }

  // ── r6: two more controls — a keeper that never reads the marker, the PURE rule without it ──
  { const noTok = ksrcI.replace("const dirTokOf = (dir) => { try {", "const dirTokOf = (dir) => { return null; /* CONTROL: the marker is never read */ try {");
    ok(noTok !== ksrcI, '④i control setup: the marker read is where the control cuts');
    const c7 = await runR6(M.load('src/server/browser-keeper.js', noTok, 'no-marker-read'), 'ctl7');
    ok(c7.S44.err === 'profile_locked' && c7.S44.left === 3 && c7.S44.launched === 0 && c7.S54.err === 'profile_locked' && c7.S54.launched === 0, '④i CONTROL 7: a keeper that never reads the directory\'s marker (the inode alone — r5\'s rule) refuses the RESTORED directory and the MOVED one as foreign — S44 / S54 catch it', { a: c7.S44.err, b: c7.S54.err }); }
  { const psrc = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8'); const noMarker = psrc.replace("if (asked && isLineageToken(e.tok)) {\n      if (e.tok === t) return", "if (false) { /* CONTROL: the marker is not asked */\n      if (e.tok === t) return").replace("const k = Object.keys(m).find((x) => x !== d && m[x] && m[x].tok === t);", "const k = null; /* CONTROL: no search by token */");
    ok(noMarker !== psrc && noMarker.includes('no search by token'), '④i control setup: the marker rule and the search by token are where the control cuts (the r5 rule: the inode alone)');
    const c8 = pureRows(M.load('src/browser-profiles.js', noMarker, 'no-marker-rule'));
    ok(c8.reuse.length === 1 && c8.stranger.length === 1 && c8.restore.length === 0, '④i CONTROL 8: the PURE rule without the marker hands a forgotten directory\'s lineage to a fresh directory with a REUSED inode and to a stranger\'s, and orphans a RESTORED one — S43p catches it', { reuse: c8.reuse, stranger: c8.stranger, restore: c8.restore }); }

  // ═══ ④j VERIFY r7 (T1/T2): THE MARKER'S TRUST MODEL — ONE TOKEN, ONE DIRECTORY; THE MARKER NEVER OUTRANKS A LIVE HOLDER ═══════
  // r6 found a path miss by the token anywhere and its remember deleted every other entry with that token: an agent's cp -a of a
  // profile directory (the marker rides along) was honoured beside its original, STOLE its entry, and once the copy was deleted the
  // original's own old-pod lock was refused as foreign (S56 / S56b / S56c / S56d; a stranger's copy of OUR marker the same, S61).
  // The RULE: the token's BEARER (the directory at the entry's own path, asked now) tells a restore from a copy — gone / another
  // token ⇒ moved (honoured), the same token + the same inode ⇒ a mount (honoured, S62), the same token + another inode ⇒ a COPY
  // (refused, said, its own marker at its first launch). UserW's EXACT upgrade (S59a): a fleet pod's checkout is pulled at the boot
  // AFTER a roll, so .200 first runs on the NEW pod against the .199 file (no host / dirHosts / marker — read on his pod); the one
  // witness .199 left is the record's own `browser.pid` in the lock ⇒ PURE legacyLockWitness at load. A deleted marker (S58a–c):
  // re-minted at the next remember with the hosts KEPT; the refusal between is said. The storm's names (S60): a per-boot LEDGER.
  console.log('— ④j verify r7: the marker table (PURE, 13 lineage rows × 6 locks) + the keeper legs: a copy beside its original, a stranger\'s copy of our marker, a live holder on the original, a deleted marker ×3, userW\'s .199 → roll ×2, two mounts, the ledger; five controls');
  {
    const TABLE7 = [];
    const judge7 = (id, who, truth, got) => { const diffs = []; for (const [k2, want] of Object.entries(truth)) { const g = got[k2]; let pass2; if (want instanceof RegExp) pass2 = typeof g === 'string' && want.test(g); else pass2 = JSON.stringify(g) === JSON.stringify(want); if (!pass2) diffs.push(`${k2}: truth ${String(want).slice(0, 90)} | product ${JSON.stringify(g === undefined ? null : g).slice(0, 200)}`); } TABLE7.push({ id, who, agree: !diffs.length, diffs }); return !diffs.length; };
    const MK = B.LINEAGE_MARKER; const tokOf7 = (dir) => { try { return fs.readFileSync(path.join(dir, MK), 'utf8').trim(); } catch { return null; } };
    const entry7 = (kk, dir) => (kk._reg().dirHosts || {})[dir] || null;
    const inoOf7 = (d) => { try { return fs.statSync(d).ino; } catch { return null; } };
    const bearer7 = (k) => { try { fs.lstatSync(k); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return null; } return { tok: tokOf7(k), ino: inoOf7(k) }; };
    const dh7 = (kk, dir) => B.dirHostsOf(kk._reg().dirHosts, dir, { ino: inoOf7(dir), tok: tokOf7(dir), bearer: bearer7 });
    // ── T1 PURE: THE MARKER TABLE. Rows = what the directory presents vs what the registry holds; columns = the lock in it. The law,
    //    hand-written: the LINEAGE is `lineageVerdict` (path | token | none); the LOCK verdict is the ladder's — ① a LIVE holder naming
    //    THIS directory is judged by its own facts whatever the marker says (no mark of ours ⇒ foreign by name, never ended); ② nothing
    //    live here: no lock ⇒ free, ours under this name ⇒ free (stale), a previous name ⇒ taken over iff the LINEAGE names it, a
    //    foreign name ⇒ foreign; a live holder of ANOTHER directory under a previous name (the copy's lock, the original's browser)
    //    ⇒ step ② by the lineage too, never own-orphan. ──
    const pureTable = (Bx) => {
      const d = path.join(IROOT, 'j-d'), other = path.join(IROOT, 'j-other'), elsewhere = path.join(IROOT, 'j-elsewhere'); const T = 'feedfacefeedfacefeedface', S = 'deadbeefdeadbeefdeadbeef';
      const baseMap = () => ({ [d]: { hosts: [PREV], at: 1, ino: 5, tok: T }, [path.join(IROOT, 'j-moved-from')]: { hosts: ['pod-moved'], at: 2, ino: 7, tok: S } });
      const rows = {
        'M1 absent (the entry remembers one)': { dir: d, opts: { ino: 5, tok: null }, bearers: {} },
        'M2 present, matches the entry at this path': { dir: d, opts: { ino: 5, tok: T }, bearers: {} },
        'M3 matches an entry at ANOTHER path whose bearer is gone (moved / restored elsewhere)': { dir: other, opts: { ino: 9, tok: S }, bearers: {} },
        'M4 matches NO entry': { dir: other, opts: { ino: 9, tok: 'abcdefabcdefabcdefabcdef' }, bearers: {} },
        'M5 unreadable (read as none, the entry remembers one)': { dir: d, opts: { ino: 5, tok: null }, bearers: {} },
        'M6 garbage': { dir: d, opts: { ino: 5, tok: 'not a token!' }, bearers: {} },
        "M7 a stranger's copy of OUR marker into THEIR dir (ours still bears it, another inode)": { dir: other, opts: { ino: 9, tok: T }, bearers: { [d]: { tok: T, ino: 5 } } },
        'M8 our marker + a different inode at the SAME path (a file-level restore)': { dir: d, opts: { ino: 6, tok: T }, bearers: {} },
        'M9 our marker + the same inode (a live directory)': { dir: d, opts: { ino: 5, tok: T }, bearers: {} },
        'M10 two directories, one token (the copy beside its original, judged for the COPY)': { dir: other, opts: { ino: 9, tok: T }, bearers: { [d]: { tok: T, ino: 5 } } },
        'M10b one tree under two mounts (the same token, the SAME inode under another path)': { dir: other, opts: { ino: 5, tok: T }, bearers: { [d]: { tok: T, ino: 5 } } },
        'M11 the bearer not answered for (a reader that asks about the token without it)': { dir: other, opts: { ino: 9, tok: T }, bearers: null },
        'M12 an r5-era entry (no token): the inode rule — the same inode': { dir: d, map: { [d]: { hosts: [PREV], at: 1, ino: 5 } }, opts: { ino: 5, tok: null }, bearers: {} },
        'M12b an r5-era entry: another inode': { dir: d, map: { [d]: { hosts: [PREV], at: 1, ino: 5 } }, opts: { ino: 6, tok: null }, bearers: {} },
      };
      const out = {};
      for (const [name, r] of Object.entries(rows)) {
        const m = r.map || baseMap(); const bearers = r.bearers; const opts = { ...r.opts, ...(bearers === null ? {} : { bearer: (k) => (k in bearers ? bearers[k] : null) }) };
        const v = Bx.lineageVerdict(m, r.dir, opts);
        const dead = { pid: 999, alive: false }; const liveHere = { pid: 777, alive: true, cmdline: `chrome\0--user-data-dir=${r.dir}`, dirs: [r.dir], starttime: 1 }; const liveElsewhere = { ...liveHere, cmdline: `chrome\0--user-data-dir=${elsewhere}`, dirs: [elsewhere] };
        const lock = (lk, holder) => { const x = Bx.profileLockVerdict({ lock: lk, holder, hostname: 'this', dir: r.dir, minted: true, recorded: null, mark: 'bp-x', preMarkAllowed: false, launchHosts: v.hosts }); return `${x.kind}@${x.step}`; };
        out[name] = { lineage: `${v.via}/${v.why}${v.fresh ? '/fresh' : ''}`, hosts: v.hosts, L1none: lock(null, null), L2ours: lock({ host: 'this', pid: 999 }, dead), L3previous: lock({ host: PREV, pid: 999 }, dead), L4foreign: lock({ host: 'elsewhere-host', pid: 999 }, dead), L5live: lock({ host: 'this', pid: 777 }, liveHere), L6liveOther: lock({ host: PREV, pid: 777 }, liveElsewhere) };
      }
      return out;
    };
    const lawCols = (hosts) => ({ L1none: 'free@live-holder', L2ours: 'free@live-holder', L3previous: hosts.includes(PREV) ? 'stale-previous-host@hostname' : 'foreign@hostname', L4foreign: 'foreign@hostname', L5live: 'foreign@live-holder', L6liveOther: hosts.includes(PREV) ? 'stale-previous-host@hostname' : 'foreign@hostname' });
    const truthRows = {
      'M1 absent (the entry remembers one)': ['none/marker-absent', []], 'M2 present, matches the entry at this path': ['path/path', [PREV]], 'M3 matches an entry at ANOTHER path whose bearer is gone (moved / restored elsewhere)': ['token/moved', ['pod-moved']], 'M4 matches NO entry': ['none/no-entry', []],
      'M5 unreadable (read as none, the entry remembers one)': ['none/marker-absent', []], 'M6 garbage': ['none/marker-absent', []], "M7 a stranger's copy of OUR marker into THEIR dir (ours still bears it, another inode)": ['none/copy/fresh', []],
      'M8 our marker + a different inode at the SAME path (a file-level restore)': ['path/path', [PREV]], 'M9 our marker + the same inode (a live directory)': ['path/path', [PREV]], 'M10 two directories, one token (the copy beside its original, judged for the COPY)': ['none/copy/fresh', []],
      'M10b one tree under two mounts (the same token, the SAME inode under another path)': ['token/mount', [PREV]], 'M11 the bearer not answered for (a reader that asks about the token without it)': ['none/bearer-unknown', []],
      'M12 an r5-era entry (no token): the inode rule — the same inode': ['path/r5era', [PREV]], 'M12b an r5-era entry: another inode': ['none/inode', []],
    };
    const pt = pureTable(B); let cells = 0;
    for (const [name, [lineage, hosts]] of Object.entries(truthRows)) { const truth = { lineage, hosts, ...lawCols(hosts) }; cells += Object.keys(truth).length; judge7('T1 ' + name, 'the marker table row', truth, pt[name] || {}); }
    ok(Object.keys(truthRows).length === 14 && cells === 14 * 8, `④j T1 THE MARKER TABLE: ${Object.keys(truthRows).length} lineage rows × (the lineage, its hosts, 6 lock columns) = ${cells} pinned cells; a token is honoured for AT MOST ONE directory (M7 / M10 refused, M10b a mount), the live holder (L5) rules before any marker`);
    // ── the keeper legs ──
    const KS7 = KSt; const settings7 = { 'browser.idleTimeoutMs': 600000 }; const quiet7 = { log() { }, warn() { }, error() { } };
    const OSM = require('os'); const realHostname = OSM.hostname;
    const readReg7 = (D) => JSON.parse(fs.readFileSync(path.join(D, 'browser-profiles.json'), 'utf8')); const writeReg7 = (D, j) => fs.writeFileSync(path.join(D, 'browser-profiles.json'), JSON.stringify(j));
    const runR7 = async (Kmod, tag, only = null) => {
      const want = (id) => !only || only.includes(id);
      const out = {}; const DI = path.join(ROOT, 'data-r7-' + tag); fs.mkdirSync(DI, { recursive: true }); const parent = path.join(IROOT, 'r7-' + tag); fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
      const mkE7 = (DATA, homeDir, liveS) => { const beI = BE.create({ dataDir: DATA, homeDir, serverSetting: (x) => settings7[x], log: quiet7, socketDirBase: path.join(ROOT, 'sock-j-' + tag), env: { XDG_RUNTIME_DIR: XDG } }); let kp = null; const kept = KS7.create({ dataDir: DATA, keeper: () => kp, liveKeys: () => liveS, serverSetting: (x) => settings7[x], log: quiet7, sweepEveryMs: 0 }); kp = mkKeeper(Kmod, { dataDir: DATA, homeDir, kept, now: Date.now, /* verify r8: the legacy witness judges a KERNEL fact (the lock's ctime, the port file's mtime) against the record's own startedAt — these keepers run on the real clock, as the fleet does */ serverSetting: (x) => settings7[x], liveKeys: () => liveS, log: klogI }); kp.__be = beI; return kp; };
      const ensureOf7 = (kk) => { const e = kk.__be.envFor({ browserKey: KG, cwd: HOME }); return () => kk.ensureEphemeral({ browserKey: KG, sessionId: 'sess-7', envPairs: e.pairs, sessionName: 'D-Payments', variant: e.variant }); };
      const actE7 = async (kk, dir, fn) => { const l0 = linesI.length, L0 = logOf('launches.log').length; const e = await threw(fn); return { err: e ? e.code : null, launched: logOf('launches.log').length - L0, left: singletonsI(dir).length, journal: linesI.slice(l0).join('\n') }; };
      const stopE7 = async (kk) => { const e2 = kk.ephemeralFor(KG); try { if (e2) await kk.stop(e2.profileId, { why: 'user' }); } catch { } };
      // S56 / S56d / S56b / S56c — a copy beside its original
      if (want('S56')) { let kk = mkKeeper(Kmod, { dataDir: path.join(DI, 'd56'), log: klogI }); const O = await retiredDirI(kk, parent, 's56-orig'); const T = (entry7(kk, O) || {}).tok; const C = path.join(parent, 's56-copy'); fs.cpSync(O, C, { recursive: true });
        out.S56c = { tokMinted: B.isLineageToken(T), copyCarriesIt: tokOf7(C) === T, origAnswered: dh7(kk, O), copyAnswered: dh7(kk, C) };
        plantI(C, PREV, await deadPidI()); const pC = kk.adoptDirectory({ label: 's56-copy', dir: C }).profile;
        out.S56 = await actI(kk, pC, attachI(kk, pC), () => ({ origEntryKept: !!entry7(kk, O), copyTokSame: tokOf7(C) === T, origTokSame: tokOf7(O) === T }));
        unplantI(C); out.S56d = await actI(kk, pC, attachI(kk, pC), () => { const eC = entry7(kk, C), eO2 = entry7(kk, O); return { copyTokDiffers: B.isLineageToken(tokOf7(C)) && tokOf7(C) !== T, copyEntryOwnTok: !!(eC && eC.tok === tokOf7(C)), origEntryKept: !!(eO2 && eO2.tok === T), origTokSame: tokOf7(O) === T }; });
        await stopI(kk, pC); for (const l of kk._reg().leases.filter((l) => l.profileId === pC.id)) { try { kk.detach({ profileId: pC.id, browserKey: l.browserKey, by: 'user' }); } catch { } } try { kk.removeProfile(pC.id); } catch { } kk.shutdown(); await sleepI(150);
        fs.rmSync(C, { recursive: true, force: true }); kk = mkKeeper(Kmod, { dataDir: path.join(DI, 'd56'), log: klogI }); await kk.boot(); plantI(O, PREV, await deadPidI()); const pO = kk.adoptDirectory({ label: 's56-orig-again', dir: O }).profile;
        out.S56b = await actI(kk, pO, attachI(kk, pO), () => ({ entryThere: !!entry7(kk, O) })); unplantI(O); await stopI(kk, pO); kk.shutdown(); await sleepI(150); }
      // S57 — a LIVE holder on the original while the copy (its lock copied) is judged
      if (want('S57')) { const kk = mkKeeper(Kmod, { dataDir: path.join(DI, 'd57'), log: klogI }); const O = await retiredDirI(kk, parent, 's57-orig'); const T = (entry7(kk, O) || {}).tok;
        const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)', '--', `--user-data-dir=${O}`, '--vibespace-keeper=bp-stranger'], { stdio: 'ignore' }); await sleepI(300);
        plantI(O, PREV, holder.pid); const C = path.join(parent, 's57-copy'); fs.cpSync(O, C, { recursive: true }); const pC = kk.adoptDirectory({ label: 's57-copy', dir: C }).profile;
        const aliveP = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
        out.S57 = await actI(kk, pC, attachI(kk, pC), () => ({ holderAlive: aliveP(holder.pid), origLeft: singletonsI(O).length, origEntryKept: !!entry7(kk, O), copyTokSame: tokOf7(C) === T }));
        const pO = kk.adoptDirectory({ label: 's57-orig', dir: O }).profile; out.S57b = await actI(kk, pO, attachI(kk, pO), () => ({ holderAlive: aliveP(holder.pid) }));
        try { holder.kill('SIGKILL'); } catch { } unplantI(O); unplantI(C); await stopI(kk, pC); await stopI(kk, pO); kk.shutdown(); await sleepI(150); }
      // S58a–c — the marker deleted
      if (want('S58')) { const D7 = path.join(DI, 'd58'); let kk = mkKeeper(Kmod, { dataDir: D7, log: klogI }); const D = await retiredDirI(kk, parent, 's58'); const T1 = (entry7(kk, D) || {}).tok; fs.unlinkSync(path.join(D, MK));
        plantI(D, os.hostname(), await deadPidI()); let p = kk.adoptDirectory({ label: 's58-same-pod', dir: D }).profile; out.S58a = await actI(kk, p, attachI(kk, p), () => { const e = entry7(kk, D); return { remintedOnDisk: B.isLineageToken(tokOf7(D)) && tokOf7(D) !== T1, entryUpdated: !!(e && e.tok === tokOf7(D)), hostsKept: !!(e && e.hosts.includes(PREV)) }; });
        unplantI(D); await stopI(kk, p); for (const l of kk._reg().leases.filter((l) => l.profileId === p.id)) { try { kk.detach({ profileId: p.id, browserKey: l.browserKey, by: 'user' }); } catch { } } kk.removeProfile(p.id); kk.shutdown(); await sleepI(150);
        fs.unlinkSync(path.join(D, MK)); { const j = readReg7(D7); j.host = PREV; writeReg7(D7, j); } kk = mkKeeper(Kmod, { dataDir: D7, log: klogI }); await kk.boot(); plantI(D, PREV, await deadPidI()); p = kk.adoptDirectory({ label: 's58-first-roll', dir: D }).profile;
        out.S58b = await actI(kk, p, attachI(kk, p), () => ({ entryUpdated: (entry7(kk, D) || {}).tok === tokOf7(D) })); unplantI(D); await stopI(kk, p); for (const l of kk._reg().leases.filter((l) => l.profileId === p.id)) { try { kk.detach({ profileId: p.id, browserKey: l.browserKey, by: 'user' }); } catch { } } kk.removeProfile(p.id); kk.shutdown(); await sleepI(150);
        fs.unlinkSync(path.join(D, MK)); { const j = readReg7(D7); j.host = PREV; writeReg7(D7, j); } { const k0 = mkKeeper(Kmod, { dataDir: D7, log: klogI }); await k0.boot(); k0.shutdown(); await sleepI(150); }
        kk = mkKeeper(Kmod, { dataDir: D7, log: klogI }); const l0 = linesI.length; await kk.boot(); plantI(D, PREV, await deadPidI()); p = kk.adoptDirectory({ label: 's58-update-then-roll', dir: D }).profile;
        out.S58c = await actI(kk, p, attachI(kk, p), () => ({ saidCause: linesI.slice(l0).join('\n') })); unplantI(D); await stopI(kk, p); kk.shutdown(); await sleepI(150); }
      // S59a / S59b — userW's exact upgrade, both orders
      if (want('S59')) { const DATA = path.join(DI, 'd59'); fs.mkdirSync(DATA, { recursive: true }); const liveS = new Set([KG]); let kk = mkE7(DATA, HOME, liveS); const J = path.join(parent, 's59-jarvis'); fs.mkdirSync(J, { recursive: true, mode: 0o700 });
        const pJ = kk.adoptDirectory({ label: 'jarvis-work', dir: J }).profile; await kk.attach({ profileId: pJ.id, browserKey: KA, sessionId: 'sess-1' }); await ensureOf7(kk)(); const E = kk.ephemeralFor(KG).dir; kk.shutdown(); await sleepI(150);
        for (const l of logOf('launches.log')) { try { process.kill(l.pid, 'SIGKILL'); } catch { } } const chromeJ = await deadPidI(), chromeE = await deadPidI(), daemonJ = await deadPidI(), daemonE = await deadPidI(); // the roll: every process of the old pod is dead
        const toV199 = () => { const j = readReg7(DATA); delete j.host; delete j.dirHosts; for (const [id, rec] of Object.entries(j.browsers)) { delete rec.host; delete rec.hosts; rec.state = 'ready'; rec.endedAt = null; rec.pid = id === pJ.id ? daemonJ : daemonE; rec.starttime = 1; rec.browser = { pid: id === pJ.id ? chromeJ : chromeE, starttime: 1, dir: id === pJ.id ? J : E, devtoolsPort: 1 }; } writeReg7(DATA, j); for (const d of [J, E]) { try { fs.unlinkSync(path.join(d, MK)); } catch { } } plantI(J, PREV, chromeJ); plantI(E, PREV, chromeE); };
        toV199(); const v199 = readReg7(DATA); const shape = { noHost: !('host' in v199), noDirHosts: !('dirHosts' in v199), recordsLegacy: Object.values(v199.browsers).every((r) => !r.host && !r.hosts && r.browser && r.browser.pid), noMarker: !fs.existsSync(path.join(J, MK)) && !fs.existsSync(path.join(E, MK)) };
        liveS.clear(); kk = mkE7(DATA, HOME, liveS); await kk.boot(); const pJ2 = kk.list().profiles.find((x) => x.id === pJ.id); out.S59a = { ...shape, ...(await actI(kk, pJ2, () => kk.attach({ profileId: pJ2.id, browserKey: KB, sessionId: 'sess-2' }))) }; liveS.add(KG); out.S59aEph = await actE7(kk, E, ensureOf7(kk));
        unplantI(J); unplantI(E); await stopI(kk, pJ2); await stopE7(kk); kk.shutdown(); await sleepI(150);
        toV199(); OSM.hostname = () => PREV; try { const live0 = new Set([KG]); const k0 = mkE7(DATA, HOME, live0); await k0.boot(); k0.shutdown(); await sleepI(150); } finally { OSM.hostname = realHostname; } // the Update on the OLD pod first: a boot + save under pod-old
        const fileHostAfterUpdate = readReg7(DATA).host; liveS.clear(); kk = mkE7(DATA, HOME, liveS); await kk.boot(); const pJ3 = kk.list().profiles.find((x) => x.id === pJ.id); out.S59b = { fileHostAfterUpdate, ...(await actI(kk, pJ3, () => kk.attach({ profileId: pJ3.id, browserKey: KB, sessionId: 'sess-2' }))) }; liveS.add(KG); out.S59bEph = await actE7(kk, E, ensureOf7(kk));
        unplantI(J); unplantI(E); await stopI(kk, pJ3); await stopE7(kk); kk.shutdown(); await sleepI(150); }
      // S61 — a stranger's directory carrying a copy of OUR marker
      if (want('S61')) { const kk = mkKeeper(Kmod, { dataDir: path.join(DI, 'd61'), log: klogI }); const O = await retiredDirI(kk, parent, 's61-orig'); const T = (entry7(kk, O) || {}).tok; const X = path.join(parent, 's61-theirs'); fs.mkdirSync(X, { mode: 0o700 }); fs.copyFileSync(path.join(O, MK), path.join(X, MK)); plantI(X, PREV, await deadPidI());
        const pX = kk.adoptDirectory({ label: 's61-theirs', dir: X }).profile; out.S61 = await actI(kk, pX, attachI(kk, pX), () => ({ origEntryKept: !!entry7(kk, O), theirTokSame: tokOf7(X) === T, origAnswered: dh7(kk, O) })); unplantI(X); await stopI(kk, pX); kk.shutdown(); await sleepI(150); }
      // S62 — two mounts of one tree (bindfs; skipped without one)
      if (want('S62')) { const src = path.join(parent, 's62-src'), dst = path.join(parent, 's62-dst'); fs.mkdirSync(src, { recursive: true, mode: 0o700 }); fs.mkdirSync(dst, { recursive: true, mode: 0o700 }); let mounted = false; try { execFileSync('bindfs', ['--no-allow-other', src, dst], { stdio: 'ignore', timeout: 10000 }); mounted = fs.statSync(dst).dev !== fs.statSync(src).dev; } catch { mounted = false; }
        if (mounted) { try { const DS = path.join(src, 'data'), DD = path.join(dst, 'data'); fs.mkdirSync(DS, { recursive: true }); const kS = mkKeeper(Kmod, { dataDir: DS, log: klogI }); const dirS = await retiredDirI(kS, src, 'p1'); kS.shutdown(); await sleepI(150); const dirD = path.join(dst, 'p1'); const kD = mkKeeper(Kmod, { dataDir: DD, log: klogI }); await kD.boot(); { const p = kD.createProfile({ label: 'other-j-' + tag }); kD.removeProfile(p.id); } plantI(dirD, PREV, await deadPidI()); const p2 = kD.adoptDirectory({ label: 'p1-again', dir: dirD }).profile; out.S62 = { sameIno: fs.statSync(dirS).ino === fs.statSync(dirD).ino, ...(await actI(kD, p2, attachI(kD, p2))) }; unplantI(dirD); await stopI(kD, p2); kD.shutdown(); await sleepI(150); } finally { try { execFileSync('fusermount', ['-u', dst], { stdio: 'ignore', timeout: 10000 }); } catch { } } }
        else { out.S62 = null; if (Kmod === K) console.log('  (④j S62 bindfs leg: no user bindfs mount here — the PURE row M10b carries the rule)'); } }
      // S60 — the storm's names in the ledger
      if (want('S60')) { const D = path.join(DI, 'd60'); fs.mkdirSync(D, { recursive: true }); const m = {}; const gone = []; for (let i = 0; i < 40; i++) { const d = path.join(parent, 's60-gone', 'g' + i); gone.push(d); m[d] = { hosts: [PREV], at: 1 + i, tok: 'feedface' + String(i).padStart(16, '0') }; } writeReg7(D, { host: PREV, profiles: [], browsers: {}, leases: [], dirHosts: m });
        const kk = mkKeeper(Kmod, { dataDir: D, log: klogI }); const l0 = linesI.length; await kk.boot(); const said = linesI.slice(l0).join('\n'); kk.shutdown(); await sleepI(150); let ledgerNamed = -1; try { const txt = fs.readFileSync(path.join(D, 'browser-lineage-journal.ndjson'), 'utf8'); ledgerNamed = gone.filter((d) => txt.includes(d)).length; } catch { ledgerNamed = -1; }
        out.S60 = { journalLines: said.split('\n').filter((l) => /forgotten — the directory is gone/.test(l)).length, journalNamed: gone.filter((d) => said.includes(d)).length, ledgerNamedAll: ledgerNamed === 40 }; }
      return out;
    };
    const r7 = await runR7(K, 'product');
    judge7('S56c', 'two directories present, one token (the original and its cp -a copy): the token is honoured for AT MOST ONE — the original (its registry path); the copy answers none', { tokMinted: true, copyCarriesIt: true, origAnswered: [PREV], copyAnswered: [] }, r7.S56c);
    judge7('S56', 'the copy (the original still present, another inode) adopted with the old pod\'s lock copied inside it: the token is NOT its lineage (said "a copy of <orig>"), the original\'s entry KEPT, the copied marker untouched by a judgement; the lock then judged by the remaining witnesses (this file\'s writer = this host ⇒ foreign by name)', { origEntryKept: true, copyTokSame: true, origTokSame: true, err: 'profile_locked', launched: 0, left: 3, journal: /is a copy of .* — not its lineage/ }, r7.S56);
    judge7('S56d', 'the copy with NO lock inside (a stopped profile copied): launched; at its first remember it is minted its OWN marker and its OWN entry; the original\'s entry and marker untouched (r6: the copy\'s remember deleted the original\'s entry)', { err: null, launched: 1, copyTokDiffers: true, copyEntryOwnTok: true, origEntryKept: true, origTokSame: true }, r7.S56d);
    judge7('S56b', 'the copy deleted (pruned at load): the ORIGINAL with the old pod\'s lock resumes — its lineage was never stolen ⇒ taken over (r6: refused as foreign — userW\'s class by a copy)', { entryThere: true, err: null, launched: 1, left: 0, renamedFrom: PREV }, r7.S56b);
    judge7('S57', 'the copy judged while a LIVE holder sits on the original (the lock under a previous name whose pid is alive here, copied with the directory): the holder is never signalled, the original\'s files untouched, its entry kept; the copy refused the token\'s lineage (said) and refused by name', { holderAlive: true, origLeft: 3, origEntryKept: true, copyTokSame: true, err: 'profile_locked', launched: 0, journal: /is a copy of/ }, r7.S57);
    judge7('S57b', 'the original under its live holder: ladder step ① — another VibeSpace browser\'s mark ⇒ refused by name, never ended; the marker is never asked', { holderAlive: true, err: 'profile_locked', msg: /another VibeSpace browser|did not start/, launched: 0, left: 3 }, r7.S57b);
    judge7('S58a', 'the marker deleted, resumed on the SAME pod (the lock under this name): launched; the marker RE-MINTED as a new token, the entry UPDATED to it and its hosts KEPT (r6 dropped pod-old at the re-mint)', { err: null, launched: 1, remintedOnDisk: true, entryUpdated: true, hostsKept: true }, r7.S58a);
    judge7('S58b', 'the marker deleted, the FIRST roll (the file last written by pod-old): the marker lineage is not answered but the file\'s writer still names pod-old ⇒ taken over; re-minted, the entry updated', { err: null, launched: 1, left: 0, renamedFrom: PREV, entryUpdated: true }, r7.S58b);
    judge7('S58c', 'the marker deleted, an Update saved under this pod, then the resume with the old pod\'s lock: no marker while the entry remembers one = a stranger\'s fresh directory at a forgotten path (S43) ⇒ refused by name — AND the cause SAID (HELD: the one window the marker cannot close)', { err: 'profile_locked', launched: 0, left: 3, saidCause: /carries no marker \(\.vibespace-lineage deleted\?\) while its entry remembers one/ }, r7.S58c);
    judge7('S59a', 'userW\'s EXACT upgrade: .199 (no host / dirHosts / marker; records with browser {pid, dir}) → the roll (the boot\'s git pull brings .200) → the first .200 boot on the NEW pod: the named profile\'s kept directory carries the old pod\'s lock naming the pid this keeper RECORDED as its own browser there ⇒ taken over (renamed from pod-old) — r6: profile_locked, his incident once more on the upgrade itself', { noHost: true, noDirHosts: true, recordsLegacy: true, noMarker: true, err: null, launched: 1, left: 0, renamedFrom: PREV }, r7.S59a);
    judge7('S59a-eph', 'userW: the same roll, the conversation\'s OWN kept directory (its record retired at the boot — the directory remembers what the record proved, the marker minted then) ⇒ taken over', { err: null, launched: 1, left: 0 }, r7.S59aEph);
    judge7('S59b', 'userW: the Update on the OLD pod first (a boot + save under pod-old), then the roll: the file\'s writer names pod-old ⇒ taken over (the r1 path)', { fileHostAfterUpdate: PREV, err: null, launched: 1, left: 0, renamedFrom: PREV }, r7.S59b);
    judge7('S59b-eph', 'userW: the same, the conversation\'s own directory', { err: null, launched: 1, left: 0 }, r7.S59bEph);
    judge7('S61', 'a stranger\'s directory carrying a COPY of OUR marker (ours still bears it, another inode): the token is not theirs (said), our entry kept and still answered; their lock judged by the remaining witnesses (foreign by name)', { origEntryKept: true, theirTokSame: true, origAnswered: [PREV], err: 'profile_locked', launched: 0, left: 3, journal: /is a copy of/ }, r7.S61);
    if (r7.S62) judge7('S62', 'one tree under two mounts (bindfs: one inode, two devices): the same token under another path AND the same inode ⇒ ONE directory ⇒ honoured ⇒ taken over', { sameIno: true, err: null, launched: 1, left: 0 }, r7.S62);
    judge7('S60', '40 lineages pruned at one load: the journal says it ONCE (r6) — and every pruned path is NAMED in the per-boot ledger (data/browser-lineage-journal.ndjson)', { journalLines: 1, journalNamed: 3, ledgerNamedAll: true }, r7.S60);
    const dis7 = TABLE7.filter((r) => !r.agree);
    ok(TABLE7.length >= 28 && !dis7.length, `④j THE SIXTH JUDGEMENT: ${TABLE7.length} rows (the marker table + ${TABLE7.length - 14} scenarios through the real keeper), every one as the truth says`, dis7.map((r) => `${r.id}: ${r.diffs.join(' / ')}`));
    // ── the controls: a keeper whose bearer is always "gone" (r6's token search), the PURE rule without the copy verdict, a keeper
    //    without the legacy witness, a keeper without the ledger, a keeper that never mints a fresh marker ──
    { const noBearer = ksrcI.replace("tok: dirTokOf(dir), bearer: dirBearerOf });", "tok: dirTokOf(dir), bearer: () => null /* CONTROL: the bearer is always gone — r6's search by token */ });");
      ok(noBearer !== ksrcI, '④j control setup: the bearer probe is where the control cuts');
      const c9 = await runR7(M.load('src/server/browser-keeper.js', noBearer, 'no-bearer'), 'ctl9', ['S56']);
      ok(c9.S56.err === null && c9.S56.launched === 1 && c9.S56d.origEntryKept === false && c9.S56b.err === 'profile_locked', '④j CONTROL 9: a keeper whose token search never asks the bearer honours the copy beside its original (its old-pod lock taken over), STEALS the original\'s entry at the copy\'s remember and refuses the original as foreign once the copy is gone — S56 / S56d / S56b catch it', { copy: c9.S56.err, kept: c9.S56d.origEntryKept, b: c9.S56b.err }); }
    { const psrc7 = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8'); const noCopy = psrc7.replace("return none('copy', k);", "return { hosts: hostsOf(m[k]), via: 'token', key: k, why: 'moved', fresh: false }; /* CONTROL: a copy is a move */");
      ok(noCopy !== psrc7, '④j control setup: the copy verdict is where the control cuts');
      const c10 = pureTable(M.load('src/browser-profiles.js', noCopy, 'no-copy-verdict'));
      ok(c10["M7 a stranger's copy of OUR marker into THEIR dir (ours still bears it, another inode)"].L3previous === 'stale-previous-host@hostname' && c10['M10 two directories, one token (the copy beside its original, judged for the COPY)'].hosts.length === 1, '④j CONTROL 10: the PURE rule without the copy verdict hands the lineage to a stranger\'s copy of our marker and to the copy beside the original — the table\'s M7 / M10 rows catch it'); }
    { const noWitness = ksrcI.replace("const w = B.legacyLockWitness({ rec, lock: F.readSingletonLock(own), lockAt, devtools, dir: own, hostname: os.hostname() });", "const w = null; /* CONTROL: no legacy witness */");
      ok(noWitness !== ksrcI, '④j control setup: the legacy witness is where the control cuts');
      const c11 = await runR7(M.load('src/server/browser-keeper.js', noWitness, 'no-legacy-witness'), 'ctl11', ['S59']);
      ok(c11.S59a.err === 'profile_locked' && c11.S59a.left === 3 && c11.S59aEph.err === 'profile_locked' && c11.S59b.err === null, '④j CONTROL 11: a keeper without the legacy lock witness refuses userW\'s named AND ephemeral kept directories on the upgrade-is-the-roll path (the Update-first order still works by the file\'s writer) — S59a / S59a-eph catch it', { a: c11.S59a.err, e: c11.S59aEph.err, b: c11.S59b.err }); }
    { const noLedger = ksrcI.replace("fs.appendFileSync(f, JSON.stringify({ at: now(), boot: bootId,", "if (false) fs.appendFileSync(f, JSON.stringify({ at: now(), boot: bootId, /* CONTROL: no ledger */");
      ok(noLedger !== ksrcI, '④j control setup: the ledger write is where the control cuts');
      const c12 = await runR7(M.load('src/server/browser-keeper.js', noLedger, 'no-ledger'), 'ctl12', ['S60']);
      ok(c12.S60.journalLines === 1 && c12.S60.ledgerNamedAll === false, '④j CONTROL 12: a keeper without the ledger says the storm once and names three — the other 37 pruned paths are nowhere — S60 catches it', c12.S60); }
    { const noFresh = ksrcI.replace("const tok = mintDirTok(dir, { fresh: !!v.fresh });", "const tok = mintDirTok(dir); /* CONTROL: never a fresh marker */");
      ok(noFresh !== ksrcI, '④j control setup: the fresh mint is where the control cuts');
      const c13 = await runR7(M.load('src/server/browser-keeper.js', noFresh, 'no-fresh-mint'), 'ctl13', ['S56']);
      ok(c13.S56d.copyTokDiffers === false && c13.S56d.origEntryKept === false, '④j CONTROL 13: a keeper that keeps the copied marker at the copy\'s first remember lets "one token, one entry" delete the original\'s entry — S56d catches it', { differs: c13.S56d.copyTokDiffers, kept: c13.S56d.origEntryKept }); }
  }
  // ═══ ④k VERIFY r8 (T1/T2): THE FLEET'S OTHER ORDER, THE WITNESS'S CLOCK, A RETIRE NEVER MINTS, THE LEDGER'S TAIL, A FORGET ═══════
  // CARRIES ITS LINEAGE — and THE SEEDED WALK. r7's legacy witness read the .199 record's `browser.pid`; the fleet's boot pull can be
  // REFUSED (userW's package-lock.json is dirty against .199 — read on his pod — and every bump touches it), so the .199 keeper boots
  // FIRST on the new pod and its reapOrphan NULLS `browser` (its reconcile removes every ephemeral record) before .200 runs — userW's
  // class once more, reproduced with the real .199 keeper (plv8-t1 S70). What survives: the record's `cdpUrl` and the directory's own
  // `DevToolsActivePort` (MEASURED on 0.38.1 + Chrome 154: the same endpoint, both past a SIGKILL) ⇒ the second witness form. A lock
  // that predates the record's own start (a reused pid) is not its browser's (S71: the kernel's ctime against startedAt, 5 s slack).
  // A refused start's retire minted a fresh marker INTO an adopted backup (S72) and the backup restored as a stranger (S72b). The
  // ledger's torn tail was glued to the next line (S74a). A Forget renamed the directory and the next boot pruned its lineage (S75b).
  console.log('— ④k verify r8: the fleet\'s other order (the .199 boot first), the witness\'s clock, a retire never mints, the ledger\'s tail, a Forget carries its lineage; the seeded walk; five controls');
  {
    const TABLE8 = [];
    const judge8 = (id, who, truth, got) => { const diffs = []; for (const [k2, want] of Object.entries(truth)) { const g = got[k2]; let pass2; if (want instanceof RegExp) pass2 = typeof g === 'string' && want.test(g); else pass2 = JSON.stringify(g) === JSON.stringify(want); if (!pass2) diffs.push(`${k2}: truth ${String(want).slice(0, 90)} | product ${JSON.stringify(g === undefined ? null : g).slice(0, 200)}`); } TABLE8.push({ id, who, agree: !diffs.length, diffs }); if (diffs.length) console.log(`    DISAGREE ${id} — ${diffs.join(' / ')}`); return !diffs.length; };
    const MK8 = B.LINEAGE_MARKER; const tokOf8 = (dir) => { try { return fs.readFileSync(path.join(dir, MK8), 'utf8').trim(); } catch { return null; } };
    const entry8 = (kk, dir) => (kk._reg().dirHosts || {})[dir] || null;
    const ledger8 = (D) => { try { return fs.readFileSync(path.join(D, 'browser-lineage-journal.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { kind: 'UNPARSABLE' }; } }); } catch { return []; } }; // verify r9
    const readReg8 = (D) => JSON.parse(fs.readFileSync(path.join(D, 'browser-profiles.json'), 'utf8')); const writeReg8 = (D, j) => fs.writeFileSync(path.join(D, 'browser-profiles.json'), JSON.stringify(j));
    const settings8 = { 'browser.idleTimeoutMs': 600000 }; const quiet8 = { log() { }, warn() { }, error() { } };
    const BT = require('../src/server/browser-trace.js');
    const runR8 = async (Kmod, tag, only = null, BTmod = BT) => {
      const want = (id) => !only || only.includes(id);
      const out = {}; const DI = path.join(ROOT, 'data-r8-' + tag); fs.mkdirSync(DI, { recursive: true }); const parent = path.join(IROOT, 'r8-' + tag); fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
      const mkE8 = (DATA, liveS) => { let kp = null; const kept = KSt.create({ dataDir: DATA, keeper: () => kp, liveKeys: () => liveS, serverSetting: (x) => settings8[x], log: quiet8, sweepEveryMs: 0 }); kp = mkKeeper(Kmod, { dataDir: DATA, homeDir: HOME, kept, now: Date.now, serverSetting: (x) => settings8[x], liveKeys: () => liveS, log: klogI }); return kp; }; // the real clock: the witness judges a KERNEL fact against startedAt
      const killLaunches = () => { for (const l of logOf('launches.log')) { try { process.kill(l.pid, 'SIGKILL'); } catch { } } };
      // S70 / S70x — the .199 keeper's boot on the NEW pod ran first: what it leaves (plv8-t1 S70 with the real .199 keeper, read off its file)
      if (want('S70')) { const DATA = path.join(DI, 'd70'); fs.mkdirSync(DATA, { recursive: true }); const liveS = new Set(); let kk = mkE8(DATA, liveS); const J = path.join(parent, 's70-jarvis'); fs.mkdirSync(J, { recursive: true, mode: 0o700 });
        const pJ = kk.adoptDirectory({ label: 'jarvis-work', dir: J }).profile; await kk.attach({ profileId: pJ.id, browserKey: KA, sessionId: 'sess-1' }); kk.shutdown(); await sleepI(150); killLaunches();
        const chromeJ = await deadPidI(), daemonJ = await deadPidI(); const cdp0 = readReg8(DATA).browsers[pJ.id].cdpUrl; // the LAUNCHED record's endpoint (a control's refused second start carries none)
        const toAfter199 = ({ devtools = true, guid = null } = {}) => { const j = readReg8(DATA); delete j.host; delete j.dirHosts; const rec = j.browsers[pJ.id]; delete rec.host; delete rec.hosts; rec.state = 'stopped'; rec.endedAt = Date.now(); rec.pid = daemonJ; rec.starttime = 1; rec.browser = null; rec.cdpUrl = cdp0; rec.lastError = 'the browser daemon exited while VibeSpace was down'; writeReg8(DATA, j); try { fs.unlinkSync(path.join(J, MK8)); } catch { } plantI(J, PREV, chromeJ); const u = new URL(rec.cdpUrl); try { fs.unlinkSync(path.join(J, 'DevToolsActivePort')); } catch { } if (devtools) fs.writeFileSync(path.join(J, 'DevToolsActivePort'), `${u.port}\n${guid || u.pathname}\n`); return rec.cdpUrl; };
        const cdp = toAfter199(); kk = mkE8(DATA, liveS); const l0 = linesI.length; await kk.boot(); const said = linesI.slice(l0).join('\n'); const pJ2 = kk.list().profiles.find((x) => x.id === pJ.id);
        out.S70 = { cdpKept: /^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\//.test(String(cdp)), witnessedByDevtools: /its CDP endpoint in DevToolsActivePort/.test(said), ...(await actI(kk, pJ2, attachI(kk, pJ2))) };
        unplantI(J); await stopI(kk, pJ2); kk.shutdown(); await sleepI(150); killLaunches();
        toAfter199({ guid: '/devtools/browser/00000000-another-launch' }); kk = mkE8(DATA, liveS); await kk.boot(); const pJ3 = kk.list().profiles.find((x) => x.id === pJ.id); out.S70x = await actI(kk, pJ3, attachI(kk, pJ3)); unplantI(J); await stopI(kk, pJ3); kk.shutdown(); await sleepI(150); killLaunches(); }
      // S71 — the lock predates the record's own start (pid reuse): the ctime bound
      if (want('S71')) { const DATA = path.join(DI, 'd71'); fs.mkdirSync(DATA, { recursive: true }); const liveS = new Set(); let kk = mkE8(DATA, liveS); const J = path.join(parent, 's71-j'); fs.mkdirSync(J, { recursive: true, mode: 0o700 });
        const pJ = kk.adoptDirectory({ label: 'j', dir: J }).profile; await kk.attach({ profileId: pJ.id, browserKey: KA, sessionId: 'sess-1' }); kk.shutdown(); await sleepI(150); killLaunches();
        const chrome = await deadPidI(); plantI(J, PREV, chrome); try { fs.unlinkSync(path.join(J, MK8)); } catch { } const lockAt = fs.lstatSync(path.join(J, 'SingletonLock')).ctimeMs;
        { const j = readReg8(DATA); delete j.host; delete j.dirHosts; const rec = j.browsers[pJ.id]; delete rec.host; delete rec.hosts; rec.state = 'ready'; rec.endedAt = null; rec.startedAt = Math.round(lockAt) + 10000; rec.browser = { pid: chrome, starttime: 1, dir: J, devtoolsPort: 1 }; writeReg8(DATA, j); }
        kk = mkE8(DATA, liveS); const l0 = linesI.length; await kk.boot(); const said = linesI.slice(l0).join('\n'); const pJ2 = kk.list().profiles.find((x) => x.id === pJ.id);
        out.S71 = { witnessed: /taken from the lock its own recorded browser left/.test(said), ...(await actI(kk, pJ2, attachI(kk, pJ2))) }; unplantI(J); await stopI(kk, pJ2); kk.shutdown(); await sleepI(150); killLaunches(); }
      // S72 / S72b — an adopted backup refused as a copy, its record removed; then the restore from it
      if (want('S72')) { let kk = mkKeeper(Kmod, { dataDir: path.join(DI, 'd72'), log: klogI }); const O = await retiredDirI(kk, parent, 's72-orig'); const T = (entry8(kk, O) || {}).tok; const C = path.join(parent, 's72-backup'); fs.cpSync(O, C, { recursive: true }); plantI(C, PREV, await deadPidI());
        const pC = kk.adoptDirectory({ label: 's72-backup', dir: C }).profile; const r1 = await actI(kk, pC, attachI(kk, pC)); const tokAtRefusal = tokOf8(C); try { kk.removeProfile(pC.id); } catch { }
        out.S72 = { ...r1, tokKeptAtRefusal: tokAtRefusal === T, tokKeptAtRemove: tokOf8(C) === T, noEntryForBackup: !entry8(kk, C) }; kk.shutdown(); await sleepI(150);
        fs.rmSync(O, { recursive: true, force: true }); fs.renameSync(C, O); unplantI(O); plantI(O, PREV, await deadPidI()); kk = mkKeeper(Kmod, { dataDir: path.join(DI, 'd72'), log: klogI }); await kk.boot(); const pO = kk.adoptDirectory({ label: 's72-restored', dir: O }).profile;
        out.S72b = await actI(kk, pO, attachI(kk, pO)); unplantI(O); await stopI(kk, pO); kk.shutdown(); await sleepI(150); killLaunches(); }
      // S74a — the ledger's tail torn by a crash mid-append
      if (want('S74')) { const DATA = path.join(DI, 'd74'); fs.mkdirSync(DATA, { recursive: true }); const LF = path.join(DATA, 'browser-lineage-journal.ndjson'); fs.writeFileSync(LF, JSON.stringify({ at: 1, boot: 'x', kind: 'pruned-gone', dir: '/a' }) + '\n' + '{"at":2,"boot":"x","kind":"pruned-go');
        const m = {}; for (let i = 0; i < 3; i++) m[path.join(parent, 's74-gone', 'g' + i)] = { hosts: [PREV], at: 1 + i, tok: 'feedface' + String(i).padStart(16, '0') }; writeReg8(DATA, { host: PREV, profiles: [], browsers: {}, leases: [], dirHosts: m });
        const kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); await kk.boot(); kk.shutdown(); await sleepI(100);
        const ls = fs.readFileSync(LF, 'utf8').split('\n').filter(Boolean); const bad = ls.filter((l) => { try { JSON.parse(l); return false; } catch { return true; } });
        out.S74a = { unparsable: bad.length, glued: bad.some((l) => l.includes('}{') || (l.match(/"kind"/g) || []).length > 1), terminated: ls.some((l) => l.includes('"torn-tail-terminated"')) }; }
      // S75b — a Forget (the real browser-trace module renames the directory aside), a restart, the forgotten directory adopted back, the roll's lock inside it
      if (want('S75')) { const DATA = path.join(DI, 'd75'); fs.mkdirSync(DATA, { recursive: true }); const AB8 = path.join(HOME, '.agent-browser'); fs.mkdirSync(AB8, { recursive: true, mode: 0o700 }); const FD = path.join(AB8, 'vs-s75b-' + tag); fs.mkdirSync(FD, { recursive: true, mode: 0o700 });
        let kb = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); const pF = kb.adoptDirectory({ label: 'to-forget', dir: FD }).profile; await kb.attach({ profileId: pF.id, browserKey: KA, sessionId: 'sess-1' }); await stopI(kb, pF); { const r = kb._reg().browsers[pF.id]; r.host = PREV; r.hosts = [PREV]; } for (const l of kb._reg().leases.filter((l) => l.profileId === pF.id)) { try { kb.detach({ profileId: pF.id, browserKey: l.browserKey, by: 'user' }); } catch { } }
        const TF = (entry8(kb, FD) || {}).tok; const bt = BTmod.create({ dataDir: DATA, homeDir: HOME, keeper: kb, log: quiet8, sweepEveryMs: 0 }); const fr = await bt.forgetProfile(pF.id); const TO = fr.to; kb.shutdown(); await sleepI(150); killLaunches();
        kb = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); const l0 = linesI.length; await kb.boot(); const bootSaid = linesI.slice(l0).join('\n'); const entryFollowed = !!(kb._reg().dirHosts[TO] && kb._reg().dirHosts[TO].tok === TF && kb._reg().dirHosts[TO].hosts.includes(PREV));
        plantI(TO, PREV, await deadPidI()); const pA = kb.adoptDirectory({ label: 'adopted-back', dir: TO }).profile; out.S75b = { entryFollowed, bootPruned: /forgotten — the directory is gone/.test(bootSaid), ...(await actI(kb, pA, attachI(kb, pA))) }; unplantI(TO); await stopI(kb, pA); kb.shutdown(); await sleepI(150); killLaunches(); }
      // S74b / S74c — verify r9 (⑤): the tail torn INSIDE a multi-byte UTF-8 sequence / INSIDE an escaped string — terminated once, exactly one unparsable line, this boot's lines parse
      if (want('S74')) { for (const [tg, torn] of [['b', Buffer.concat([Buffer.from('{"at":2,"boot":"x","kind":"pruned-gone","dir":"/a/日本'), Buffer.from([0xe8, 0xaa])])], ['c', Buffer.from('{"at":2,"boot":"x","kind":"pruned-gone","dir":"/a\\')]]) {
          const DATA = path.join(DI, 'd74' + tg); fs.mkdirSync(DATA, { recursive: true }); const LF = path.join(DATA, 'browser-lineage-journal.ndjson'); fs.writeFileSync(LF, Buffer.concat([Buffer.from(JSON.stringify({ at: 1, boot: 'x', kind: 'pruned-gone', dir: '/a' }) + '\n'), torn]));
          const m = {}; for (let i = 0; i < 2; i++) m[path.join(parent, 's74' + tg + '-gone', 'g' + i)] = { hosts: [PREV], at: 1 + i, tok: 'feedface' + String(i).padStart(16, '0') }; writeReg8(DATA, { host: PREV, profiles: [], browsers: {}, leases: [], dirHosts: m });
          const kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); await kk.boot(); kk.shutdown(); await sleepI(100);
          const raw = fs.readFileSync(LF); const kinds = raw.toString('utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).kind; } catch { return 'UNPARSABLE'; } });
          out['S74' + tg] = { unparsable: kinds.filter((x) => x === 'UNPARSABLE').length, terminated: kinds.includes('torn-tail-terminated'), thisBootParses: kinds.filter((x) => x === 'pruned-gone').length === 3, tailNewline: raw[raw.length - 1] === 0x0a }; } }
      // S76 — verify r9 (④): forgetOrphan (the real browser-trace) then a CRASH before any other save (the keeper dropped without shutdown — its timer is unref'd); the next boot; adopted back with the roll's lock inside
      if (want('S76')) { const DATA = path.join(DI, 'd76'); fs.mkdirSync(DATA, { recursive: true }); const AB9 = path.join(HOME, '.agent-browser'); fs.mkdirSync(AB9, { recursive: true, mode: 0o700 }); const OD = path.join(AB9, 'vs-s76-' + tag); fs.mkdirSync(OD, { recursive: true, mode: 0o700 });
        let kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); const pO = kk.adoptDirectory({ label: 'orphan-to-be', dir: OD }).profile; await kk.attach({ profileId: pO.id, browserKey: KA, sessionId: 'sess-1' }); await stopI(kk, pO); { const r = kk._reg().browsers[pO.id]; r.host = PREV; r.hosts = [PREV]; } for (const l of kk._reg().leases.filter((l) => l.profileId === pO.id)) { try { kk.detach({ profileId: pO.id, browserKey: l.browserKey, by: 'user' }); } catch { } } kk.removeProfile(pO.id); const T6 = (entry8(kk, OD) || {}).tok; kk.shutdown(); await sleepI(150); killLaunches();
        kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); await kk.boot(); const bt = BTmod.create({ dataDir: DATA, homeDir: HOME, keeper: kk, log: quiet8, sweepEveryMs: 0 }); const fr = bt.forgetOrphan(OD); const TO = fr.to; const disk = readReg8(DATA).dirHosts || {}; const diskNamesNew = !!(disk[TO] && disk[TO].tok === T6);
        kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); const l0 = linesI.length; await kk.boot(); const said = linesI.slice(l0).join('\n');
        const entryFollowed = !!(kk._reg().dirHosts[TO] && kk._reg().dirHosts[TO].tok === T6 && kk._reg().dirHosts[TO].hosts.includes(PREV));
        plantI(TO, PREV, await deadPidI()); const pA = kk.adoptDirectory({ label: 'adopted-back', dir: TO }).profile; out.S76 = { diskNamesNew, entryFollowed, bootPruned: /forgotten — the directory is gone/.test(said), ...(await actI(kk, pA, attachI(kk, pA))) }; unplantI(TO); await stopI(kk, pA); kk.shutdown(); await sleepI(150); killLaunches(); }
      // S76b — verify r9 (④): forgetProfile while data/ cannot be written (EACCES = the EIO class): refused, nothing moved; once writable the same Forget moves it WITH its lineage on disk; a crash; adopted back
      if (want('S76') && !isRoot) { const DATA = path.join(DI, 'd76b'); fs.mkdirSync(DATA, { recursive: true }); const AB9 = path.join(HOME, '.agent-browser'); fs.mkdirSync(AB9, { recursive: true, mode: 0o700 }); const FD = path.join(AB9, 'vs-s76b-' + tag); fs.mkdirSync(FD, { recursive: true, mode: 0o700 });
        let kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); const pF = kk.adoptDirectory({ label: 'to-forget', dir: FD }).profile; await kk.attach({ profileId: pF.id, browserKey: KA, sessionId: 'sess-1' }); await stopI(kk, pF); { const r = kk._reg().browsers[pF.id]; r.host = PREV; r.hosts = [PREV]; } for (const l of kk._reg().leases.filter((l) => l.profileId === pF.id)) { try { kk.detach({ profileId: pF.id, browserKey: l.browserKey, by: 'user' }); } catch { } }
        kk.shutdown(); await sleepI(150); killLaunches(); kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); await kk.boot(); const T6 = tokOf8(FD); const bt = BTmod.create({ dataDir: DATA, homeDir: HOME, keeper: kk, log: quiet8, sweepEveryMs: 0 });
        fs.chmodSync(DATA, 0o500); let ferr = null; try { await bt.forgetProfile(pF.id); } catch (e) { ferr = e; } fs.chmodSync(DATA, 0o700); const disk1 = readReg8(DATA).dirHosts || {}; const stillThere = fs.existsSync(FD) && !!kk.list().profiles.find((x) => x.id === pF.id);
        let fr = null, ferr2 = null; try { fr = await bt.forgetProfile(pF.id); } catch (e) { ferr2 = e; } const TO = fr ? fr.to : null; const disk2 = readReg8(DATA).dirHosts || {};
        kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); const l0 = linesI.length; await kk.boot(); const said = linesI.slice(l0).join('\n');
        let r = { err: 'no-move' }; if (TO) { plantI(TO, PREV, await deadPidI()); const pA = kk.adoptDirectory({ label: 'adopted-back', dir: TO }).profile; r = await actI(kk, pA, attachI(kk, pA)); unplantI(TO); await stopI(kk, pA); }
        out.S76b = { refusedCode: ferr ? ferr.code : null, stillThere, diskNamesOldAfterRefusal: !!(disk1[FD] && disk1[FD].tok === T6), thenMoved: !!TO && !ferr2, diskNamesNew: !!(TO && disk2[TO] && disk2[TO].tok === T6), bootPruned: /forgotten — the directory is gone/.test(said), ...r }; kk.shutdown(); await sleepI(150); killLaunches(); }
      // S77 / S77b / S77c — verify r9 (③): the legacy witness vs a cp -a copy beside / a file-level restore IN PLACE (cp -a semantics: the lock's ctime = now, the port file's mtime from the launch)
      if (want('S77')) { const DATA = path.join(DI, 'd77'); fs.mkdirSync(DATA, { recursive: true }); const liveS = new Set(); let kk = mkE8(DATA, liveS); const D7 = path.join(parent, 's77-D'); fs.mkdirSync(D7, { recursive: true, mode: 0o700 });
        const pD = kk.adoptDirectory({ label: 'D', dir: D7 }).profile; await kk.attach({ profileId: pD.id, browserKey: KA, sessionId: 'sess-1' }); kk.shutdown(); await sleepI(150); killLaunches();
        const chrome = await deadPidI(); const j = readReg8(DATA); const rec = j.browsers[pD.id]; const cdp = rec.cdpUrl; delete j.host; delete j.dirHosts; delete rec.host; delete rec.hosts; rec.state = 'stopped'; rec.browser = null; rec.endedAt = Date.now(); writeReg8(DATA, j);
        try { fs.unlinkSync(path.join(D7, MK8)); } catch { } { const ep = B.cdpEndpointOf(cdp); fs.writeFileSync(path.join(D7, 'DevToolsActivePort'), `${ep.port}\n${ep.path}\n`); } plantI(D7, PREV, chrome);
        const C7 = path.join(parent, 's77-C'); fs.cpSync(D7, C7, { recursive: true, verbatimSymlinks: true }); const tmp = D7 + '.restore'; fs.cpSync(D7, tmp, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true }); fs.rmSync(D7, { recursive: true, force: true }); fs.renameSync(tmp, D7);
        kk = mkE8(DATA, liveS); await kk.boot(); const w = ledger8(DATA).filter((x) => x.kind === 'legacy-lock-witness'); const pD2 = kk.list().profiles.find((x) => x.id === pD.id);
        out.S77 = { witnessed: w.length, form: w.length ? w[0].form : null, ownPathOnly: w.every((x) => x.dir === D7) };
        out.S77b = await actI(kk, pD2, attachI(kk, pD2)); unplantI(D7); await stopI(kk, pD2);
        const pC = kk.adoptDirectory({ label: 'C', dir: C7 }).profile; out.S77c = await actI(kk, pC, attachI(kk, pC)); unplantI(C7); await stopI(kk, pC); kk.shutdown(); await sleepI(150); killLaunches(); }
      return out;
    };
    // ── verify r9 (②): the second witness form on the PURE table — a stale port file (older than the record's own life) is never this record's, a mismatched endpoint never, the pid form unmoved by either ──
    { const rec9 = { startedAt: 1000000, cdpUrl: 'ws://127.0.0.1:43181/devtools/browser/d4253a72-1cd9-4fb2-9b0e-8bfdbd0a3853', browser: null, hosts: null, host: null, dir: '/p/d' }; const lock9 = { host: PREV, pid: 4242 }; const ep9 = { port: 43181, path: '/devtools/browser/d4253a72-1cd9-4fb2-9b0e-8bfdbd0a3853' };
      const W = (o) => B.legacyLockWitness({ rec: rec9, lock: lock9, lockAt: 1000500, dir: '/p/d', hostname: 'pod-new', ...o });
      const rows9 = [
        ['a port file of this endpoint written 1 s after the start', W({ devtools: { ...ep9, at: 1001000 } }), { host: PREV, form: 'devtools' }],
        ['a port file of this endpoint written 2 s BEFORE the start (inside the 5 s slack)', W({ devtools: { ...ep9, at: 998000 } }), { host: PREV, form: 'devtools' }],
        ['a port file of this endpoint from an EARLIER launch (6 s before the start): stale, not this record\'s', W({ devtools: { ...ep9, at: 994000 } }), null],
        ['a port file naming another port', W({ devtools: { ...ep9, port: 43182, at: 1001000 } }), null],
        ['a port file naming another browser GUID', W({ devtools: { ...ep9, path: '/devtools/browser/00000000-0000-4000-8000-000000000000', at: 1001000 } }), null],
        ['a port file with no clock (not judged by it): the endpoint decides', W({ devtools: { ...ep9, at: null } }), { host: PREV, form: 'devtools' }],
        ['the pid form beside a STALE port file: the lock\'s own pid + ctime decide', W({ rec: { ...rec9, browser: { pid: 4242, dir: '/p/d' } }, devtools: { ...ep9, at: 994000 } }), { host: PREV, form: 'pid' }],
        ['the lock itself from before the record\'s life: neither form', W({ lockAt: 990000, devtools: { ...ep9, at: 1001000 } }), null],
        ['no port file, browser nulled (the .199 boot): no witness', W({ devtools: null }), null],
      ];
      const badRows9 = rows9.filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want));
      ok(!badRows9.length, `④k verify r9 (②): the port-file witness on the PURE table — ${rows9.length} rows: a stale port file (older than the record's own life) is never its witness, a mismatched endpoint never, the pid form unmoved by a stale port file${badRows9.length ? ' — ' + badRows9.map(([n, g, w]) => n + ': ' + JSON.stringify(g) + ' vs ' + JSON.stringify(w)).join(' || ') : ''}`);
      ok(B.parseDevToolsActivePort('43181\n/devtools/browser/d4253a72-1cd9-4fb2-9b0e-8bfdbd0a3853\n') !== null && B.parseDevToolsActivePort('43181\n/devtools/page/abc\n') === null && B.parseDevToolsActivePort('99999\n/devtools/browser/d4253a72-1cd9-4fb2-9b0e-8bfdbd0a3853\n') === null && B.cdpEndpointOf('ws://10.0.0.1:43181/devtools/browser/d4253a72-1cd9-4fb2-9b0e-8bfdbd0a3853') === null && B.cdpEndpointOf('ws://127.0.0.1:43181/devtools/browser/d4253a72-1cd9-4fb2-9b0e-8bfdbd0a3853').port === 43181, '④k verify r9 (②): the port file is read only in Chrome\'s own shape (a port + /devtools/browser/<GUID>), the endpoint only off a loopback url'); }
    const r8 = await runR8(K, 'product');
    judge8('S70', 'the fleet\'s other order — the new pod booted .199 FIRST (its reapOrphan nulled `browser`, its boot kept `cdpUrl`; Chrome left DevToolsActivePort = that endpoint) — then .200: the named profile\'s kept directory is taken over by the second witness form (said: its CDP endpoint in DevToolsActivePort)', { cdpKept: true, witnessedByDevtools: true, err: null, launched: 1, left: 0, renamedFrom: PREV }, r8.S70);
    judge8('S70x', 'the same shape, the port file naming ANOTHER launch\'s endpoint (not this record\'s): no witness ⇒ refused by name with the one command (never a takeover without a witness)', { err: 'profile_locked', launched: 0, left: 3, msg: /rm -f '.*SingletonLock'/ }, r8.S70x);
    judge8('S71', 'a legacy record whose recorded browser pid equals the lock\'s, the lock written 10 s BEFORE the record\'s own start (a reused pid): not that browser\'s lock ⇒ no witness ⇒ refused by name (r7: pid equality alone took it over)', { witnessed: false, err: 'profile_locked', launched: 0, left: 3 }, r8.S71);
    judge8('S72', 'a backup copy adopted (refused as a copy, never launched) and its record removed: a judgement and a retire of a refused record write NOTHING into the copy — the marker stays the original\'s, no entry for the backup (r7: the retire minted a fresh marker into it)', { err: 'profile_locked', launched: 0, tokKeptAtRefusal: true, tokKeptAtRemove: true, noEntryForBackup: true }, r8.S72);
    judge8('S72b', 'the restore: the original deleted, the backup moved into its place — its marker is still the original\'s ⇒ the lineage answers at its own path ⇒ taken over', { err: null, launched: 1, left: 0, renamedFrom: PREV }, r8.S72b);
    judge8('S74a', 'a ledger whose last line was torn by a crash: the next boot terminates the tail before its first line — exactly the torn line fails to parse, alone (r7: appendFileSync glued the next record onto it)', { unparsable: 1, glued: false, terminated: true }, r8.S74a);
    judge8('S75b', 'a Forget moved the directory aside (<dir>.forgotten-<ts>), a restart, the forgotten directory adopted back, the roll\'s lock inside it: the product\'s own move carries the lineage (the entry follows the rename with the record\'s hosts, nothing pruned at the boot) ⇒ taken over (r7: pruned at the next boot — gone = ENOENT — and refused as foreign)', { entryFollowed: true, bootPruned: false, err: null, launched: 1, left: 0, renamedFrom: PREV }, r8.S75b);
    judge8('S74b', 'the tail torn INSIDE a multi-byte UTF-8 sequence (verify r9 ⑤): terminated once; exactly the torn line fails to parse, this boot\'s lines parse, the file ends in a newline', { unparsable: 1, terminated: true, thisBootParses: true, tailNewline: true }, r8.S74b);
    judge8('S74c', 'the tail torn INSIDE an escaped JSON string (verify r9 ⑤): the same', { unparsable: 1, terminated: true, thisBootParses: true, tailNewline: true }, r8.S74c);
    judge8('S76', 'verify r9 (④): forgetOrphan (the real browser-trace) then a crash before any other save — the entry was ON DISK under the forgotten path before the rename, the next boot prunes nothing, the directory adopted back is taken over (r8: re-keyed in memory only, never committed on the orphan path — pruned at the next boot, refused as foreign)', { diskNamesNew: true, entryFollowed: true, bootPruned: false, err: null, launched: 1, left: 0, renamedFrom: PREV }, r8.S76);
    if (!isRoot) judge8('S76b', 'verify r9 (④): a Forget while data/ cannot be written (EACCES, the EIO class) is REFUSED forget_failed with nothing moved (the directory and its record stay, the disk still names it); once writable the same Forget moves it WITH its lineage; a crash; adopted back ⇒ taken over (r8: moved, the disk named the old path)', { refusedCode: 'forget_failed', stillThere: true, diskNamesOldAfterRefusal: true, thenMoved: true, diskNamesNew: true, bootPruned: false, err: null, launched: 1, left: 0, renamedFrom: PREV }, r8.S76b);
    judge8('S77', 'verify r9 (③): the legacy witness reads ONLY the record\'s own path — one ledger line, the original, the devtools form; a cp -a copy beside carrying the same lock + port file is never witnessed', { witnessed: 1, form: 'devtools', ownPathOnly: true }, r8.S77);
    judge8('S77b', 'verify r9 (③): a file-level restore IN PLACE (cp -a semantics — the lock\'s ctime = now, the port file\'s mtime from the launch) is the directory the record names and its lock is the dead pod\'s ⇒ taken over', { err: null, launched: 1, left: 0, renamedFrom: PREV }, r8.S77b);
    judge8('S77c', 'verify r9 (③): the copy beside carries the same files but no record and no marker ⇒ refused by name with the one command (a copy never inherits)', { err: 'profile_locked', launched: 0, left: 3, msg: /rm -f '.*SingletonLock'/ }, r8.S77c);
    // ── T1 THE SEEDED WALK through the real keeper: ≤ 6 random events per seed, the invariants after every step, the PURE table as the oracle at every door ──
    const walk8 = async (Kmod, seeds) => {
      const EV = ['launchD', 'launchC', 'copyAppears', 'originalDeleted', 'roll', 'updateOnOldPod', 'fileLevelRestore', 'markerDeleted', 'journalFails', 'load', 'forget', 'liveHolder', 'crash']; // verify r9: a crash = the keeper dropped without shutdown (nothing in its memory saved)
      const OSM8 = require('os'); const realH = OSM8.hostname; const rngOf = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
      const exists = (d) => { try { fs.lstatSync(d); return true; } catch { return false; } }; const bearer = (key) => { try { fs.lstatSync(key); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return null; } let ino = null; try { ino = fs.statSync(key).ino; } catch { ino = null; } return { tok: tokOf8(key), ino }; };
      const aliveP = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
      const vio = []; let steps = 0, launchesN = 0, refusalsN = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        const r = rngOf(seed * 7919); const BASE = path.join(IROOT, 'walk8', 'w' + seed); fs.rmSync(BASE, { recursive: true, force: true }); const DATA = path.join(ROOT, 'data-walk8', 'w' + seed); fs.rmSync(DATA, { recursive: true, force: true }); fs.mkdirSync(DATA, { recursive: true });
        const D = path.join(BASE, 'D'), C = path.join(BASE, 'C'); const made = new Set([D]); const deleted = new Set(); let holder = null; let forgottenTo = null;
        let kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); fs.mkdirSync(D, { recursive: true, mode: 0o700 });
        { const p = kk.adoptDirectory({ label: 'D', dir: D }).profile; await kk.attach({ profileId: p.id, browserKey: KA, sessionId: 'sess-1' }); await stopI(kk, p); const rec = kk._reg().browsers[p.id]; rec.host = PREV; rec.hosts = [PREV]; for (const l of kk._reg().leases.filter((l) => l.profileId === p.id)) { try { kk.detach({ profileId: p.id, browserKey: l.browserKey, by: 'user' }); } catch { } } kk.removeProfile(p.id); }
        const dirOf = (n) => (n === 'D' ? (forgottenTo && !exists(D) ? forgottenTo : D) : C);
        const bad = (step, ev, what, extra) => vio.push(`seed ${seed} step ${step} after ${ev}: ${what}` + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 300) : ''));
        const launchOn = async (n) => { const dir = dirOf(n); if (!exists(dir)) return { skipped: 'absent' };
          const lk = F.readSingletonLock(dir); let key = dir; try { key = fs.realpathSync(dir); } catch { } const have = kk._reg().profiles.find((p) => p.dir === dir); const prev = have ? kk._reg().browsers[have.id] : null; const own = prev ? B.launchHostsOf(prev) : [];
          const lv = own.length ? { hosts: own, why: 'record' } : B.lineageVerdict(kk._reg().dirHosts, key, { ino: (bearer(key) || {}).ino, tok: tokOf8(dir), bearer }); const hostsExp = lv.hosts.length ? lv.hosts : B.launchHostsOf(null, kk._reg().host || null);
          const liveOnDir = holder && aliveP(holder.pid) && lk && lk.pid === holder.pid; const expect = liveOnDir ? 'refused' : (!lk ? 'launch' : lk.host === os.hostname() ? 'launch' : hostsExp.includes(lk.host) ? 'launch' : 'refused');
          const p = have || kk.adoptDirectory({ label: n, dir }).profile; const e = await threw(() => kk.attach({ profileId: p.id, browserKey: KB, sessionId: 'sess-2' }));
          if (!e) { launchesN++; await stopI(kk, p); for (const l of kk._reg().leases.filter((l) => l.profileId === p.id)) { try { kk.detach({ profileId: p.id, browserKey: l.browserKey, by: 'user' }); } catch { } } } else refusalsN++;
          return { dir, err: e ? e.code : null, msg: e ? e.message : '', expect, lineage: lv.why, lock: lk }; };
        for (let step = 1; step <= 6; step++) {
          const ev = EV[Math.floor(r() * EV.length)]; steps++; let res = null;
          try {
            switch (ev) {
              case 'launchD': res = await launchOn('D'); break;
              case 'launchC': res = await launchOn('C'); break;
              case 'copyAppears': if (exists(D) && !exists(C)) { fs.cpSync(D, C, { recursive: true }); made.add(C); } break;
              case 'originalDeleted': if (exists(D) && !(holder && aliveP(holder.pid))) { fs.rmSync(D, { recursive: true, force: true }); deleted.add(D); } break;
              case 'roll': { for (const l of logOf('launches.log')) { try { process.kill(l.pid, 'SIGKILL'); } catch { } } for (const d of [dirOf('D'), C]) if (exists(d) && !(holder && aliveP(holder.pid) && d === D)) plantI(d, PREV, await deadPidI()); break; }
              case 'updateOnOldPod': { kk.shutdown(); OSM8.hostname = () => PREV; try { const k0 = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); await k0.boot(); k0.shutdown(); } finally { OSM8.hostname = realH; } kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); await kk.boot(); break; }
              case 'fileLevelRestore': { const d = dirOf('D'); if (exists(d) && !(holder && aliveP(holder.pid))) { const tmp = d + '.restore'; fs.cpSync(d, tmp, { recursive: true }); fs.rmSync(d, { recursive: true, force: true }); fs.renameSync(tmp, d); } break; }
              case 'markerDeleted': { try { fs.unlinkSync(path.join(dirOf('D'), MK8)); } catch { } break; }
              case 'journalFails': { const f = path.join(DATA, 'browser-lineage-journal.ndjson'); try { fs.writeFileSync(f, '', { flag: 'a' }); fs.chmodSync(f, 0o444); } catch { } res = await launchOn('D'); try { fs.chmodSync(f, 0o600); } catch { } break; }
              case 'load': { kk.shutdown(); kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); await kk.boot(); break; } // verify r9 (⑥): shutdown is synchronous — no sleep stood for anything
              case 'forget': { const d = dirOf('D'); if (exists(d) && !forgottenTo && !(holder && aliveP(holder.pid))) { const key = kk.lineageKeyOf(d); const to = d + '.forgotten-' + Date.now(); const mv = kk.moveDirLineage(key, to); if (!mv.ok) bad(step, ev, 'the move refused on a writable data/', mv); else { fs.renameSync(d, to); forgottenTo = to; made.add(to); } const pr = kk._reg().profiles.find((p) => p.dir === d); if (pr) { try { kk.removeProfile(pr.id); } catch { } } } break; } // verify r9 (④): the product's order — the lineage WRITTEN, then the rename
              case 'crash': { kk = mkKeeper(Kmod, { dataDir: DATA, log: klogI }); await kk.boot(); break; }
              case 'liveHolder': { const d = dirOf('D'); if (exists(d) && !holder) { holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)', '--', `--user-data-dir=${d}`, '--vibespace-keeper=bp-stranger'], { stdio: 'ignore' }); await new Promise((r) => holder.once('spawn', r)); plantI(d, os.hostname(), holder.pid); } break; } // verify r9 (⑥): its cmdline is readable once it has exec'd (the spawn event), never after a guessed 250 ms
            }
          } catch (e) { bad(step, ev, 'the keeper THREW out of an event', { message: e && e.message }); continue; }
          const dh = kk._reg().dirHosts || {}; const byTok = {}; for (const [k3, e] of Object.entries(dh)) if (e && e.tok) (byTok[e.tok] = byTok[e.tok] || []).push(k3);
          for (const [t, ks] of Object.entries(byTok)) if (ks.length > 1) bad(step, ev, 'I1 one token ⇒ one entry', { tok: t, keys: ks });
          if (holder && !aliveP(holder.pid)) bad(step, ev, 'I2 the live holder was signalled');
          if (res && res.err === 'profile_locked' && !/rm -f '.*SingletonLock'|close it there|stop it from the Browser panel/.test(res.msg)) bad(step, ev, 'I3 a refusal without its cause and the one command', { msg: res.msg.slice(0, 200) });
          if (exists(D) && exists(C) && tokOf8(D) && tokOf8(D) === tokOf8(C) && dh[C] && dh[D] && dh[C].tok === dh[D].tok) bad(step, ev, 'I4 a copy inherited the original\'s entry');
          if (res && res.expect && res.err !== 'launch_failed') { const got = res.err ? 'refused' : 'launch'; if (got !== res.expect) bad(step, ev, `I5 the oracle disagrees with the door (${res.lineage}; expected ${res.expect}, product ${got})`, { dir: res.dir, lock: res.lock, err: res.err }); }
          for (const d of made) if (!deleted.has(d) && !exists(d) && d !== D) bad(step, ev, 'I6 a path disappeared', { d });
          if (!exists(D) && !deleted.has(D) && !forgottenTo) bad(step, ev, 'I6 the original directory vanished');
          let ledger = []; try { ledger = fs.readFileSync(path.join(DATA, 'browser-lineage-journal.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { kind: 'UNPARSABLE', raw: l }; } }); } catch { ledger = []; }
          for (const l of ledger) { if (l.kind === 'UNPARSABLE') { bad(step, ev, 'I7 an unparsable ledger line', l); continue; } for (const f of ['dir', 'from', 'to', 'original', 'keptAs']) if (f in l && l[f] !== null && !(typeof l[f] === 'string' && l[f].startsWith('/'))) bad(step, ev, 'I7 a ledger field that is not an absolute path', { line: l }); }
        }
        try { if (holder) holder.kill('SIGKILL'); } catch { } kk.shutdown(); for (const l of logOf('launches.log')) { try { process.kill(l.pid, 'SIGKILL'); } catch { } } OSM8.hostname = realH;
      }
      return { steps, launchesN, refusalsN, vio };
    };
    const WALK_SEEDS = Number(process.env.WALK_SEEDS || 10);
    const tw0 = Date.now(); const w = await walk8(K, WALK_SEEDS); const walkMs = Date.now() - tw0; // verify r9 (⑥): the walk's cost is printed (the fast tier's budget)
    ok(w.vio.length === 0 && w.steps === WALK_SEEDS * 6, `④k T1 THE SEEDED WALK: ${WALK_SEEDS} seeds × 6 random events (launch / a copy / the original deleted / a roll / an Update on the old pod / a file-level restore / the marker deleted / a journal write that fails / a load / a Forget / a live holder / a crash) through the REAL keeper in ${walkMs} ms = ${w.steps} steps, ${w.launchesN} launches, ${w.refusalsN} refusals — one token one entry, a live holder never signalled, every refusal names its cause and the one command, a copy never inherits, the PURE table agrees with the door at every launch, no path deleted, the ledger names absolute paths${w.vio.length ? ' — VIOLATIONS: ' + w.vio.slice(0, 5).join(' | ') : ''}`);
    const dis8 = TABLE8.filter((x) => !x.agree);
    ok(!dis8.length && TABLE8.length === (isRoot ? 13 : 14), `④k THE SEVENTH JUDGEMENT (+ verify r9's seven): ${TABLE8.length} scenarios through the real keeper (the .199 boot first ×2, the witness's clock, the backup ×2, the ledger's tail ×3, a Forget ×3, the witness's own path ×3), every one as the truth says${dis8.length ? ' — ' + dis8.map((x) => x.id + ': ' + x.diffs.join(' / ')).join(' || ') : ''}`);
    // ── the controls: each r8 part cut in a patched copy (never src/), the scenario that catches it ──
    const ksrc8 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8'); const tsrc8 = fs.readFileSync(path.join(REPO, 'src/server/browser-trace.js'), 'utf8');
    { const cut = "let devtools = null; try { const df = path.join(own, 'DevToolsActivePort'); const d = B.parseDevToolsActivePort(fs.readFileSync(df, 'utf8')); devtools = d ? { ...d, at: fs.statSync(df).mtimeMs } : null; } catch { devtools = null; }"; const noDev = ksrc8.replace(cut, 'let devtools = null; /* CONTROL: the port file never read */');
      ok(noDev !== ksrc8, '④k control setup: the port-file witness is where the control cuts');
      const c14 = await runR8(M.load('src/server/browser-keeper.js', noDev, 'no-devtools-witness'), 'ctl14', ['S70']);
      ok(c14.S70.err === 'profile_locked' && c14.S70.left === 3 && c14.S70x.err === 'profile_locked', '④k CONTROL 14: a keeper that never reads the directory\'s DevToolsActivePort refuses userW\'s named profile on the .199-boot-first order (the r7 keeper: its pid witness is nulled by that boot) — S70 catches it', { a: c14.S70.err, x: c14.S70x.err }); }
    { const cut = "let lockAt = null; try { lockAt = fs.lstatSync(path.join(own, 'SingletonLock')).ctimeMs; } catch { lockAt = null; }"; const noAt = ksrc8.replace(cut, 'let lockAt = null; /* CONTROL: the lock\'s ctime never handed in */');
      ok(noAt !== ksrc8, '④k control setup: the lock\'s ctime is where the control cuts');
      const c15 = await runR8(M.load('src/server/browser-keeper.js', noAt, 'no-lock-ctime'), 'ctl15', ['S71']);
      ok(c15.S71.witnessed === true && c15.S71.err === null && c15.S71.left === 0, '④k CONTROL 15: a keeper that never hands the lock\'s ctime in takes over a lock that predates the record\'s own start (pid equality alone — r7) — S71 catches it', { w: c15.S71.witnessed, e: c15.S71.err }); }
    { const cut = "if (rr.state !== 'failed') rememberDir(p.dir, launchHostsFor(rr, p.dir), { retire: true });"; const always = ksrc8.replace(cut, "if (true) rememberDir(p.dir, launchHostsFor(rr, p.dir)); /* CONTROL: a retire remembers a refused record and may mint */");
      ok(always !== ksrc8, '④k control setup: the retire rule is where the control cuts');
      const c16 = await runR8(M.load('src/server/browser-keeper.js', always, 'retire-mints'), 'ctl16', ['S72']);
      ok(c16.S72.tokKeptAtRemove === false && c16.S72b.err === 'profile_locked', '④k CONTROL 16: a keeper whose retire remembers a refused record mints a fresh marker INTO the adopted backup, and the restore from it is refused as foreign (r7) — S72 / S72b catch it', { kept: c16.S72.tokKeptAtRemove, r: c16.S72b.err }); }
    { const cut = 'if (!ledgerTailChecked) {'; const noTail = ksrc8.replace(cut, 'if (false) { /* CONTROL: a torn tail never terminated */');
      ok(noTail !== ksrc8, '④k control setup: the tail check is where the control cuts');
      const c17 = await runR8(M.load('src/server/browser-keeper.js', noTail, 'no-tail-termination'), 'ctl17', ['S74']);
      ok(c17.S74a.glued === true && c17.S74a.terminated === false, '④k CONTROL 17: a keeper that never terminates a torn tail glues this boot\'s first line onto it (two records, one unparsable line — r7) — S74a catches it', c17.S74a); }
    { const cut = 'let mv = null; try { mv = keeper.moveDirLineage(lineageKey, to); } catch (e) { mv = { ok: false, moved: false, key: null, error: e && e.message }; }'; const noMove = tsrc8.replace(cut, 'let mv = { ok: true, moved: false, key: null }; /* CONTROL: the lineage never follows a Forget */');
      ok(noMove !== tsrc8, '④k control setup: the Forget\'s re-key is where the control cuts');
      const c18 = await runR8(K, 'ctl18', ['S75'], M.load('src/server/browser-trace.js', noMove, 'no-forget-rekey'));
      ok(c18.S75b.entryFollowed === false && c18.S75b.err === 'profile_locked', '④k CONTROL 18: a Forget whose rename never re-keys the lineage leaves the entry at the old path (pruned at the next boot) and the adopted-back directory\'s old-pod lock is foreign by name (r7) — S75b catches it', { f: c18.S75b.entryFollowed, e: c18.S75b.err }); }
    { const cut = 'if (!save()) { reg.dirHosts = before;'; const noSave = ksrc8.replace(cut, 'if (false && !save()) { reg.dirHosts = before; /* CONTROL: the move re-keys in memory only (r8) */');
      ok(noSave !== ksrc8, '④k control setup: the move\'s save is where the control cuts');
      const c19 = await runR8(M.load('src/server/browser-keeper.js', noSave, 'move-never-saves'), 'ctl19', ['S76']);
      ok(c19.S76.diskNamesNew === false && c19.S76.bootPruned === true && c19.S76.err === 'profile_locked' && (isRoot || (c19.S76b.refusedCode === null && c19.S76b.stillThere === false)), '④k CONTROL 19 (verify r9): a keeper whose move re-keys in memory only (r8) loses the lineage at a crash after a Forget — pruned at the next boot, the adopted-back directory refused by name — and an unwritable data/ refuses nothing (moved, the disk names the old path): S76 / S76b catch it', { d: c19.S76.diskNamesNew, p: c19.S76.bootPruned, e: c19.S76.err, b: isRoot ? null : [c19.S76b.refusedCode, c19.S76b.stillThere] }); }
    // ── verify r9 (⑤): the ledger has NO product reader — a torn line can abort nothing (the keeper appends and rotates whole lines; the only parsers are suites) ──
    { let names = []; try { names = execFileSync('git', ['-C', REPO, 'grep', '-l', 'browser-lineage-journal', '--', 'src', 'data/bin', 'server.js'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch (e) { names = ['(git grep failed: ' + (e && e.message) + ')']; }
      const ledgerParse = /JSON\.parse\([^;\n]*(LINEAGE_LEDGER|lineage-journal)/.test(ksrc8);
      ok(names.length === 1 && names[0] === 'src/server/browser-keeper.js' && !ledgerParse, `④k verify r9 (⑤): the lineage ledger is named by exactly ONE product file (the keeper: append + whole-line rotation) and parsed by none — ${names.join(', ')}`); }
  }
}
for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 44 })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));

try { for (const p of k.list().profiles) await k.stop(p.id).catch(() => { }); } catch { /* none */ }
k.shutdown();
srv.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

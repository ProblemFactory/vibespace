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
  const texts = [B.notOwnerRefusal({ label: 'work' }), B.groupsUnreadableRefusal({ label: 'work' }), pinnedForm, busyA, busyU, B.ephemeralHolderRefusal({ label: 'work', holderPid: 5, holderName: 'Old chat' })].flatMap((r) => [r.error, r.remedy || '']);
  ok(texts.length === 12 && texts.every((x) => !CMDLINE_RE.test(x)), 'WORDS: not_owner (ONE form now), groups_unreadable, the pinned form, browser_busy (both), the pre-ruling holder\'s profile_locked — no command line in any error or remedy', texts.filter((x) => CMDLINE_RE.test(x)));
  ok(/kept to some of the user's conversations and Task Groups/.test(texts[0]) && /"Who can use it" in the Agent browser panel \(Change…\)/.test(texts[0]) && /All my conversations/.test(texts[0]) && /Change… → add this conversation, or All my conversations/.test(texts[1]) && /run the same command again once/.test(texts[2]) && /press Stop/.test(B.ephemeralHolderRefusal({ label: 'w' }).error), '…each names the button: "Who can use it" → Change… in the Agent browser panel, or "All my conversations"; groups_unreadable says run it again once; Stop on that browser');
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
if (a === 'close' && b !== '--all') { log('closes.log', { verb: 'close', ns, sess, cdp }); out({ success: true, data: { closed: 1 } }); process.exit(0); }
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
const k = mkKeeper(K, { limits: lim });
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
  ok((rsrc2.match(/attachAnswer\(r, \{ cdp: req\.body\?\.wrapper === true, agent: agentFactsOf\(f\) \}\)/g) || []).length === 2 && /if \(f\.remote\) \{ const rr = B\.remoteSessionRefusal/.test(rsrc2) && /const remote = !!\(s\.hostId \|\| s\.host \|\| s\._browserVariant === require\('\.\.\/browser-profiles\.js'\)\.VARIANTS\.H\);/.test(rsrc2), 'WIRING (identity verify r2): the agent\'s `use` and `resolve` answers ride attachAnswer with the asker\'s facts; pinAnswer refuses a remote session; sessionFacts names `remote`');
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
for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 22 })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));

try { for (const p of k.list().profiles) await k.stop(p.id).catch(() => { }); } catch { /* none */ }
k.shutdown();
srv.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

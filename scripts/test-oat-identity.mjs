#!/usr/bin/env node
// test-oat-identity — lane oat-identity-postcheck (B-3102's two left halves) + lane oat-identity-fix (verify r1 F1–F8):
// WHOSE IS THIS LONG-LIVED TOKEN, AFTER THE MINT. In process, fake readings only, never a vendor call, no real CLI.
//   §1 the PURE verdict table (src/oat-identity-model.js): identityPostCheck over fake readings — confirmed / a
//      SUSPECT, then the K-run's mismatch / no anchor yet / a HINT (another row's window, no anchor) / late /
//      pre-save / not the token / a STALE token (the previous generation, or none vouched for) / an INELIGIBLE
//      reading (the witness rule) / no weekly evidence / org; the 168-slot coincidence (F4: 0 marks); rowAnchorOf
//      (independence, weekly-only, `self`); anchorMoved (F5); the roster state (F8); the owner's answer; the (a) helpers
//   §2 the store: every save ARMS the check with the token's GENERATION, a removal drops check + anchor, the fields
//      survive a restart, moveOat keeps the generation; parseAuth names our token file's generation
//   §3 the ONE orchestrator over the REAL AccountManager + the REAL For-you store: confirmed journaled once (a panel
//      re-stamp of the same week re-arms nothing — F5); K readings before a mark (F2); a mismatch keeps the token,
//      marks the row, files ONE For-you notice, tells the pool and moves no link; the owner's act resolves it; a hint
//      (F4) / identity groups (F3) / a stale conversation (F1) / the anchor following the row (F6) / `self` /
//      unverified (F8) / the owner's answer
//   §4 (a) the anchor in the mint ladder (src/server/oat-mint.js over a fake PTY) + M1: the anchor is never written
//      into the guard's `.window-` sidecar (a planted write is RED)
//   §5 the roster words (the real manage-agents module, esbuild + a fake DOM) and the zh / ja words
//   §6 wiring census + RED controls
//   §7 the REAL producer (usage-pool-engine recordRateLimitEvent): F1a / F1b on the env road, the FILE road (our
//      materialized token file, a re-mint in place), F2 (a hot switch's in-flight reading) + its positive control
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gitEnvFrom } from './git-env.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const say = console.log.bind(console); // §7 silences the engine's console — the verdict lines still print
const ok = (c, name, detail) => { if (c) { pass++; say('  ✓ ' + name); } else { fail++; say('  ✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 600) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const Module = require('node:module');
/** a mutated copy of a real src module, compiled under its REAL filename (relative requires resolve as the original's) */
const compileAs = (rel, text) => { const fn = path.join(REPO, rel); const m = new Module(fn, null); m.filename = fn; m.paths = Module._nodeModulePaths(path.dirname(fn)); m._compile(text, fn); return m.exports; };

const M = require(path.join(REPO, 'src/oat-identity-model.js'));
const readingLag = require(path.join(REPO, 'src/reading-lag.js'));
const { LATE_MS } = require(path.join(REPO, 'src/record-lateness.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const OI = require(path.join(REPO, 'src/server/oat-identity.js'));
// THE K-RUN IS THE WITNESS RING'S K (verify r1 F2): the engine's own constant, read off its source
const K = Number((read('src/server/usage-pool-engine.js').match(/^const API_WITNESS_K = (\d+);/m) || [])[1]);

// weekly windows in SECONDS (the rate_limit_event / panel unit); distinct weekly PHASES — the only identity evidence
const nowS = Math.floor(Date.now() / 1000);
const OWN = nowS + 3 * 86400 + 2 * 3600, FOREIGN = OWN + 2 * 86400 + 5 * 3600, THIRD = OWN + 4 * 86400 + 11 * 3600, FIVE = nowS + 4 * 3600;
const win = (sevenDay, scoped = {}) => ({ sevenDay, fiveHour: null, scoped });
// token shapes are built at runtime (never a literal on disk)
const tok = (tag) => ['sk', '-ant-oat01-'].join('') + 'Q9fakeID' + tag + '_' + require('node:crypto').randomBytes(6).toString('hex') + 'a1B2c3D4e5F6g7H8'.repeat(3) + '-zz';
const ELIGIBLE = { ok: true, why: 'slot-verified' };

console.log('§1 the PURE verdict table');
const T0 = Date.now();
{
  ok(K === M.MISMATCH_RUN && K >= 2, `the K-run is the engine's API_WITNESS_K (${K}) — one reading never marks`, { K, run: M.MISMATCH_RUN });
  const since = T0 - 300e3, GEN = since;
  const armed = { state: 'pending', since, gen: GEN };
  const est = { ...win(OWN), at: since - 3600e3, source: 'on-demand' };
  const A_est = M.rowAnchorOf({ established: est, oatAnchor: null, since });
  const row = (anchor, others = [], extra = {}) => ({ check: armed, anchor, orgUuid: null, others, ...extra });
  const rd = (sevenDay, extra = {}) => ({ window: win(sevenDay), at: T0, viaToken: true, gen: GEN, eligible: ELIGIBLE, ...extra });
  const V = (r, x) => M.identityPostCheck(r, x, { now: T0, k: K });
  const other = { id: 'sub-other', window: win(FOREIGN) };
  const run = Array.from({ length: K - 1 }, () => ({ ...win(FOREIGN), at: T0 - 1000 }));
  const table = [
    ['the window agrees with the row\'s established window', V(row(A_est), rd(OWN)), 'confirmed'],
    ['the window differs from the row\'s: ONE reading is a suspect, never a mark', V(row(A_est, [other]), rd(FOREIGN)), 'suspect'],
    [`…consecutive reading #${K} in that phase is the mismatch (another row's matches: named)`, V(row(A_est, [other], { run }), rd(FOREIGN)), 'mismatch'],
    ['…a suspect run broken by another phase starts again', V(row(A_est, [], { run: [...run.slice(1), { ...win(THIRD) }] }), rd(FOREIGN)), 'suspect'],
    ['no anchor yet, no other row holds the window', V(row(null), rd(FOREIGN)), 'no-anchor'],
    ['no anchor of its own, ANOTHER row\'s window: a HINT (the owner is asked), never a mark', V(row(null, [other]), rd(FOREIGN)), 'hint'],
    ['…even with a full run behind it (the coincidence repeats on every reading)', V(row(null, [other], { run }), rd(FOREIGN)), 'hint'],
    [`a reading ${Math.round((LATE_MS + 1000) / 1000)} s late`, V(row(A_est), rd(FOREIGN, { at: T0 - LATE_MS - 1000 })), 'late'],
    [`…${Math.round((LATE_MS - 1000) / 1000)} s late still judges`, V(row(A_est), rd(OWN, { at: T0 - LATE_MS + 1000 })), 'confirmed'],
    ['produced before the token was saved — 60 s old, the save 30 s ago (F7 M2: the 2-minute rule alone would judge it)', V({ ...row(A_est), check: { state: 'pending', since: T0 - 30e3, gen: GEN } }, rd(OWN, { at: T0 - 60e3 })), 'late'],
    ['the slot was spending the row\'s own login', V(row(A_est), rd(FOREIGN, { viaToken: false })), 'not-the-token'],
    ['…viaToken unknown', V(row(A_est), rd(FOREIGN, { viaToken: undefined })), 'not-the-token'],
    ['a conversation on the PREVIOUS token of the row (F1)', V(row(A_est), rd(OWN, { gen: GEN - 86400e3 })), 'stale-token'],
    ['…its generation cannot be vouched for (a restored session, a file rewritten inside the turn)', V(row(A_est), rd(OWN, { gen: null })), 'stale-token'],
    ['…a check that names no generation judges nothing', V(row(A_est, [], { check: { state: 'pending', since } }), rd(OWN)), 'stale-token'],
    ['a re-point inside the horizon: not a witness reading (F2)', V(row(A_est, [other]), rd(FOREIGN, { eligible: { ok: false, why: 're-pointed X → Y 2s ago' } })), 'ineligible'],
    ['…eligibility unknown', V(row(A_est), rd(OWN, { eligible: undefined })), 'ineligible'],
    ['a five-hour window only (names a time, never an account)', V(row(A_est), { ...rd(null), window: { sevenDay: null, fiveHour: FIVE, scoped: {} } }), 'no-evidence'],
    ['no weekly bucket in common with the anchor', V(row({ window: win(null, { fable: OWN }), via: 'owner-confirmed', fp: 'x' }), rd(FOREIGN)), 'no-evidence'],
    ['the org differs (both state one): a suspect', V(row(A_est, [], { orgUuid: 'org-a' }), rd(OWN, { orgUuid: 'org-b' })), 'suspect'],
    ['…K readings of that org, no other account\'s identity holding the window: moved — asked, never a mark (fix r2 F-C)', V(row(A_est, [], { orgUuid: 'org-a', run: Array.from({ length: K - 1 }, () => ({ sevenDay: null, scoped: {}, orgUuid: 'org-b' })) }), { ...rd(null), window: null, orgUuid: 'ORG-B' }), 'moved'],
    ['the same org, no weekly window (org alone never confirms)', V(row(A_est, [], { orgUuid: 'org-a' }), { ...rd(null), window: null, orgUuid: 'ORG-A' }), 'no-evidence'],
    ['already judged (confirmed)', V({ ...row(A_est), check: { state: 'confirmed', since, gen: GEN } }, rd(FOREIGN)), 'idle'],
    ['no check armed', V({ check: null }, rd(FOREIGN)), 'idle'],
    [`K readings on ONE phase NO other account's identity holds (a renewal, a plan change, an account outside the roster) ⇒ moved: the owner is asked, never a mark (fix r2 F-C)`, V(row(A_est, [], { run }), rd(FOREIGN)), 'moved'],
    ['…the same run against THIS generation\'s own mint-probe anchor (`self`) ⇒ moved, never a mark', V(row({ window: win(OWN), via: 'self', fp: 'x' }, [], { run }), rd(FOREIGN)), 'moved'],
  ];
  console.log('    verdict table:');
  for (const [what, v, want] of table) console.log(`      ${(v.verdict === want ? '' : '!! ') + v.verdict.padEnd(14)} ${what}${v.via ? ' · via ' + v.via : ''}${v.on ? ' · on ' + v.on : ''}${v.run ? ' · run ' + v.run : ''}`);
  for (const [what, v, want] of table) ok(v.verdict === want, `${what} ⇒ ${want}`, v);
  ok(table.every(([, v]) => M.POST_CHECK_VERDICTS.includes(v.verdict)) && M.POST_CHECK_VERDICTS.length === 13 && ['stale-token', 'ineligible', 'hint', 'suspect', 'moved'].every((x) => table.some(([, v]) => v.verdict === x)), 'every verdict seen is one of the declared thirteen (stale-token, ineligible, hint, suspect and moved among them; `lost` — fix r3 — in §9)', M.POST_CHECK_VERDICTS);
  ok(table[24][1].via === 'established' && table[24][1].run === K && JSON.stringify(table[24][1].others) === '[]' && table[24][1].entry.sevenDay === FOREIGN, 'a `moved` names the run, what it was judged against and the window the readings agree on (the ask\'s window) — and no other account', table[24][1]);
  ok(JSON.stringify(table[2][1].others) === '["sub-other"]' && table[2][1].via === 'established' && table[2][1].run === K && table[5][1].via === 'another-row' && JSON.stringify(table[5][1].others) === '["sub-other"]', 'a mismatch names the rows whose window it carried, against what, after how many readings; a hint names the row', [table[2][1], table[5][1]]);
  ok(table[1][1].entry && table[1][1].entry.sevenDay === FOREIGN && table[1][1].run === 1 && table[3][1].run === 1, 'a suspect hands back its weekly window (the run\'s next entry) and counts from 1 after a break', table[1][1]);
  ok(table[20][1].on === 'org', 'an org mismatch says it was the org', table[20][1]);
  ok(!table.some(([, v]) => 'key' in v || 'target' in v), 'no verdict carries a key or a target — the check never re-files a reading');
  // F4: production's 15 established weekly resets sit on hour boundaries — 14 of 168 hour slots held. A no-anchor
  // token row's first reading in EVERY slot of the week: never a mark (a hint where a held slot coincides)
  const prod = [1792555140, 1792342740, 1790956800, 1792054740, 1792382340, 1792090800, 1791370800, 1792508400, 1791997140, 1792349940, 1789437540, 1792270800, 1790956800, 1792515540, 1792339200];
  const prodOthers = prod.map((r, i) => ({ id: 'p' + i, window: win(r) }));
  const WEEK = 604800, counts = { mismatch: 0, hint: 0, 'no-anchor': 0 };
  for (let h = 0; h < 168; h++) {
    const r = 1792000000 - (1792000000 % WEEK) + h * 3600 + 7 * 86400;
    for (let i = 0; i < K; i++) { const v = V({ check: armed, anchor: null, others: prodOthers, run: Array.from({ length: i }, () => win(r)) }, rd(r)); counts[v.verdict] = (counts[v.verdict] || 0) + 1; }
  }
  console.log(`    the 168-slot coincidence (production phases, ${K} readings per slot): ${JSON.stringify(counts)}`);
  ok(counts.mismatch === 0 && counts.hint > 0, 'F4: a new token row in each of the 168 weekly hour slots, K readings each ⇒ 0 marks (the coincidences are hints)', counts);
  // rowAnchorOf: the established window counts only when independent of the token; WEEKLY only; `self`
  const later = { ...win(FOREIGN), at: since + 5000 };
  ok(M.rowAnchorOf({ established: est, since })?.via === 'established', 'an established window stamped BEFORE the token is the row\'s identity');
  ok(M.rowAnchorOf({ established: { ...later, source: 'api' }, since }) === null, '…one stamped AFTER it from the slot\'s own API readings is not (three of the token\'s readings would confirm the token)');
  ok(M.rowAnchorOf({ established: { ...later, source: 'api' }, oatAnchor: { ...win(OWN), how: 'owner-confirmed' }, since })?.via === 'owner-confirmed', '…then the owner-confirmed token anchor stands in');
  ok(M.rowAnchorOf({ established: { ...later, source: 'on-demand', producer: 'login' }, since })?.via === 'established', '…a later panel stamp the row\'s own LOGIN produced (it names its producer) still counts');
  ok(M.rowAnchorOf({ established: { ...later, source: 'on-demand' }, since }) === null, '…a later stamp that names no producer (written before stamps named one) is not — it may be a token\'s');
  ok(M.rowAnchorOf({ since }) === null, 'nothing known ⇒ null');
  const e5 = M.rowAnchorOf({ established: { ...est, fiveHour: FIVE }, since });
  ok(e5.window.fiveHour === null && !/5h:\d/.test(e5.fp), 'F5: the row\'s identity is its WEEKLY half — the 5-hour reset is never part of it', e5);
  ok(M.rowAnchorOf({ oatAnchor: { ...win(OWN), how: 'owner-confirmed', at: since + 10, mint: 'om-1' }, since })?.via === 'self'
    && M.rowAnchorOf({ oatAnchor: { ...win(OWN), how: 'owner-confirmed', at: since - 10, mint: 'om-0' }, since }) === null
    && M.rowAnchorOf({ oatAnchor: { ...win(OWN), how: 'owner-confirmed', at: since + 10, mint: 'om-1', followed: 'renewal-panel' }, since })?.via === 'owner-confirmed'
    && M.rowAnchorOf({ oatAnchor: { ...win(OWN), how: 'owner-confirmed', at: since - 10 }, since })?.via === 'owner-confirmed',
  'F6 / fix r2 A3: an anchor THIS token\'s own mint probe wrote is `self` (its own window, never "agrees with the row"); a PREVIOUS token\'s mint probe is nothing (never promoted to row identity); one that followed the row, or one the owner answered, is owner-confirmed');
  // fix r2 F-A — IDENTITY IS PROVEN ONLY BY EVIDENCE NO GENERATION OF THIS ROW'S TOKEN PRODUCED
  const PREV = since - 86400e3; // the row's first token (a previous generation)
  ok(M.stampProducer({ ...est, producer: 'login' }) === 'login' && M.stampProducer({ ...est, producer: 'oat:123' }) === 'token' && M.stampProducer({ ...est, producer: 'mystery' }) === 'token' && M.stampProducer(est) === 'legacy' && M.stampProducer(null) === null,
    'fix r2 F-A stampProducer: login · token (oat:<gen>, or any producer we cannot vouch for) · legacy (no producer field)');
  ok(M.rowAnchorOf({ established: { ...est, producer: 'oat:' + PREV }, since, firstAt: PREV }) === null && M.rowAnchorOf({ established: { ...est, producer: 'oat:' + GEN }, since, firstAt: PREV }) === null,
    'fix r2 F-A: a stamp a token\'s readings wrote is NEVER the row\'s identity — the PREVIOUS generation\'s before the save, or this one\'s (the verifier\'s A1/A2/A4 root)');
  ok(M.rowAnchorOf({ established: { ...est, at: PREV - 60e3 }, since, firstAt: PREV })?.via === 'established' && M.rowAnchorOf({ established: { ...est, at: PREV + 60e3 }, since, firstAt: PREV }) === null && M.rowAnchorOf({ established: { ...est, at: PREV }, since, firstAt: PREV })?.via === 'established',
    'fix r2 F-A: a LEGACY stamp (no producer) is identity only when stamped at or before the row\'s FIRST token — one stamped between two tokens may be the first token\'s');
  ok(M.stampIsIdentity({ ...est, producer: 'login' }, PREV) && !M.stampIsIdentity({ ...est, producer: 'oat:1' }, null) && M.stampIsIdentity(est, null) && !M.stampIsIdentity({ ...win(null), at: 1 }, null) && !M.stampIsIdentity({ sevenDay: OWN, scoped: {} }, PREV),
    'stampIsIdentity: a login stamp always · a token\'s never · a legacy one on a row that never held a token · nothing without a weekly window · a legacy one with no instant on a row that held one, never');
  const carriedTok = { ...win(FOREIGN), at: since + 5000, source: 'api', producer: 'oat:' + GEN, login: M.identityCarry({ ...est, producer: 'login' }) };
  ok(carriedTok.login && carriedTok.login.sevenDay === OWN && carriedTok.login.producer === 'login' && M.rowAnchorOf({ established: carriedTok, since, firstAt: PREV })?.window.sevenDay === OWN,
    'fix r2 F-A / F-C: a stamp the token\'s readings wrote CARRIES the login identity it replaced — the row is still judged by it (the guard reads only the window)', carriedTok);
  const carried2 = M.identityCarry(carriedTok), carriedLegacy = M.identityCarry({ ...est, at: PREV - 1 });
  ok(carried2 && carried2.sevenDay === OWN && carried2.producer === 'login' && carriedLegacy && !carriedLegacy.producer && carriedLegacy.at === PREV - 1 && M.identityCarry({ ...win(FOREIGN), producer: 'oat:1' }) === null && M.identityCarry(null) === null,
    '…a token stamp over a token stamp carries the identity THAT one carried; a legacy stamp is carried as legacy (judged by its own instant); a token stamp that carried nothing passes nothing');
  ok(M.rowAnchorOf({ established: { ...win(FOREIGN), producer: 'oat:1', login: { ...win(OWN), at: PREV + 1 } }, since, firstAt: PREV }) === null, '…a carried LEGACY identity stamped after the first token is no identity either');
  const ansNew = { ...win(THIRD), how: 'owner-confirmed', at: since + 9000 }, ansOld = { ...win(THIRD), how: 'owner-confirmed', at: since - 9e6 };
  ok(M.identityOf({ established: { ...est, producer: 'login' }, oatAnchor: ansNew, firstAt: PREV })?.window.sevenDay === THIRD && M.identityOf({ established: { ...est, producer: 'login' }, oatAnchor: ansOld, firstAt: PREV })?.window.sevenDay === OWN
    && M.identityOf({ established: { ...est, producer: 'login' }, oatAnchor: { ...ansNew, mint: 'om-9' }, firstAt: PREV })?.window.sevenDay === OWN,
    'identityOf: the NEWER of the login identity and an owner\'s answer wins (an answer after a plan change outranks the older stamp); a mint probe\'s anchor never competes');
  ok(M.isIdentityAnchor({ ...win(OWN), how: 'owner-confirmed' }) && M.isIdentityAnchor({ ...win(OWN), mint: 'om', followed: 'renewal-panel' }) && !M.isIdentityAnchor({ ...win(OWN), mint: 'om' }) && !M.isIdentityAnchor({ sevenDay: null, scoped: {} }),
    'isIdentityAnchor: an owner\'s answer, or a mint anchor that followed a re-anchor proven without the token — never a bare mint probe\'s');
  const IW = M.identityWindows({ windows: { a: { ...est, producer: 'login' }, b: { ...win(FOREIGN), producer: 'oat:5' }, c: { ...win(THIRD), at: 10 } }, anchors: { d: { ...win(FOREIGN), how: 'owner-confirmed', at: 5 }, e: { ...win(OWN), how: 'owner-confirmed', mint: 'om-e' } }, firstAt: (id) => (id === 'c' ? 5 : null) });
  ok(JSON.stringify(Object.keys(IW).sort()) === '["a","d"]' && IW.a.sevenDay === OWN && IW.d.sevenDay === FOREIGN, 'identityWindows: every row\'s identity — a token-stamped row, a legacy stamp after the row\'s first token and a bare mint anchor name nobody', IW);
  // F5 anchorMoved: a panel re-stamp of the same week (a new 5-hour block, the -60 s spelling) is no move
  ok(!M.anchorMoved({ ...win(OWN), fiveHour: FIVE }, win(OWN)) && !M.anchorMoved(win(OWN - 60), win(OWN)) && !M.anchorMoved(win(OWN + WEEK), win(OWN)) && M.anchorMoved(win(THIRD), win(OWN)) && !M.anchorMoved(null, win(OWN)),
    'F5 anchorMoved: a new 5-hour block, the ±60 s spelling and the weekly roll are no move; another weekly phase is');
  // F8 + the roster state
  const RS = (c, now = T0) => M.identityRowState(c, now);
  ok(RS({ state: 'pending', since: T0 - 3600e3 }) === null && RS({ state: 'pending', since: T0 - M.UNVERIFIED_MS - 1 }) === 'unverified' && RS({ state: 'confirmed', since: 1 }) === 'confirmed'
    && RS({ state: 'mismatch', since: 1, ask: { kind: 'hint' } }) === 'mismatch' && RS({ state: 'pending', since: 1, ask: { kind: 'hint' } }) === 'hint' && RS({ state: 'confirmed', since: 1, ask: { kind: 'anchor' } }) === 'anchor' && RS(null) === null,
  'the roster state: young + armed says nothing · a day unjudged ⇒ unverified (F8) · an open ask ⇒ hint / anchor · mismatch first', M.UNVERIFIED_MS);
  ok(RS({ state: 'pending', since: T0 - 30 * 86400e3, armedAt: T0 - 60e3 }) === null && RS({ state: 'pending', since: T0 - 30 * 86400e3, armedAt: T0 - M.UNVERIFIED_MS - 1 }) === 'unverified',
    'fix r2 L3: a check RE-ARMED a minute ago (judged before, its anchor moved) is not "a day unjudged" — the day counts from the arm');
  // the owner's answer
  const AV = M.ownerAnswerVerdict;
  const hintCk = { state: 'pending', since, gen: GEN, ask: { kind: 'hint', others: ['sub-other'], win: win(FOREIGN) } };
  ok(AV(hintCk, 'mine').ok && AV(hintCk, 'mine').act === 'confirm' && AV(hintCk, 'mine').anchor.sevenDay === FOREIGN && AV(hintCk, 'mine').anchor.how === 'owner-confirmed'
    && AV(hintCk, 'not-mine').act === 'mark' && JSON.stringify(AV(hintCk, 'not-mine').others) === '["sub-other"]',
  'the owner\'s answer to an ask: mine ⇒ the window the readings stated becomes the owner-confirmed anchor · not mine ⇒ the mark, naming the row');
  ok(AV({ state: 'mismatch', since, win: win(FOREIGN) }, 'mine').code === 'nothing_to_confirm' && AV({ state: 'mismatch', since }, 'not-mine').code === 'already_marked' && AV({ state: 'pending', since }, 'mine').code === 'nothing_to_confirm'
    && AV({ state: 'pending', since }, 'not-mine').code === 'nothing_to_answer' && AV({ state: 'confirmed', since }, 'not-mine').code === 'nothing_to_answer' && AV({ state: 'confirmed', since, ask: { kind: 'anchor', win: win(THIRD) } }, 'not-mine').act === 'mark'
    && AV(null, 'mine').code === 'no_check' && AV(hintCk, 'yes').code === 'bad_answer',
  '…a MARK is undone by the owner\'s act on the token (re-mint / re-bind / remove), never one click; nothing to confirm without a stated window; NOT MINE answers an open ask only (fix r2 L2 — a stale dialog never marks a confirmed token); unknown answers refused');
  // (a) helpers
  const an = M.anchorFromProbe({ sevenDay: OWN, fiveHour: FIVE, scoped: { Fable: OWN } }, { orgUuid: 'ORG-X', at: T0, mint: 'om-1' });
  ok(an && an.sevenDay === OWN && an.scoped.fable === OWN && an.orgUuid === 'org-x' && an.how === 'owner-confirmed' && an.fp === readingLag.windowFingerprint({ sevenDay: OWN, fiveHour: null, scoped: { fable: OWN } }) && an.mint === 'om-1',
    'anchorFromProbe: the probe\'s weekly window (+ org), never its five-hour reset, proof owner-confirmed', an);
  ok(M.anchorFromProbe({ sevenDay: null, fiveHour: FIVE, scoped: {} }) === null && M.anchorFromProbe(win(OWN), { how: 'fingerprint-proven' }) === null && JSON.stringify(M.ANCHOR_HOWS) === '["owner-confirmed"]',
    '…no weekly window ⇒ no anchor; the one proof that writes one is the owner\'s pick');
  ok(M.anchorWriteVerdict({ probeWindow: win(OWN) }).verdict === 'write' && M.anchorWriteVerdict({ probeWindow: win(OWN), established: win(OWN) }).verdict === 'write'
    && M.anchorWriteVerdict({ probeWindow: win(OWN), oatAnchor: win(FOREIGN) }).verdict === 'keep' && M.anchorWriteVerdict({ probeWindow: win(OWN), established: win(FOREIGN) }).verdict === 'keep'
    && M.anchorWriteVerdict({ probeWindow: null }).verdict === 'none', 'anchorWriteVerdict: write (no anchor / agrees) · keep (an anchor disagrees — never overwritten) · none (no window)');
  ok(M.probeAgainstAnchor(win(FOREIGN), win(OWN)) === 'differ' && M.probeAgainstAnchor(win(OWN), win(OWN)) === 'agree' && M.probeAgainstAnchor(win(OWN), null) === 'unknown', 'probeAgainstAnchor: differ / agree / unknown');
  ok(JSON.stringify(M.CHECK_STATES) === '["pending","confirmed","mismatch"]' && JSON.stringify(M.ASK_KINDS) === '["hint","anchor"]' && M.hasWeekly(win(OWN)) && !M.hasWeekly({ sevenDay: null, fiveHour: FIVE, scoped: {} }) && !M.hasWeekly(null), 'the three check states (an ask rides a check, it is no state); hasWeekly = a weekly half or a scoped weekly bucket');
}

console.log('§2 the store: armed by every save with its generation, dropped with the token, persisted');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oatid-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
const dataDir = path.join(tmp, 'data');
const am = new AccountManager({ dataDir });
const R = am.createSubscription({ name: 'Work Max' }).id, S = am.createSubscription({ name: 'Second' }).id, F = am.createSubscription({ name: 'Fresh' }).id;
const G = am.createSubscription({ name: 'Ghost' }).id, H = am.createSubscription({ name: 'Held' }).id;
const TOK = { R: tok('R'), S: tok('S'), S2: tok('S2'), S3: tok('S3'), F: tok('F'), G: tok('G'), H: tok('H') };
{
  ok(am.oatCheckOf(R) === null && am.oatAnchorOf(R) === null && am.oatArmed() === false, 'a row without a token holds no check and no anchor; nothing is armed');
  const r = am.setOat(R, TOK.R);
  const c = am.oatCheckOf(R);
  ok(c && c.state === 'pending' && c.since === r.mintedAt && c.gen === r.mintedAt && am.oatArmed() === true, 'setOat ARMS the check: pending since the token\'s save, its GENERATION = the mint instant (F1)', c);
  let threw = 0;
  for (const bad of [{ state: 'nope', since: 1 }, { state: 'pending' }, null]) { try { am.setOatCheck(R, bad); } catch { threw++; } }
  try { am.setOatCheck(F, { state: 'pending', since: 1 }); } catch { threw++; }
  ok(threw === 4, 'setOatCheck refuses an unknown state, a missing save instant, nothing, and a row with no token');
  const kept = am.setOatCheck(R, { ...c, run: [{ ...win(FOREIGN), fiveHour: FIVE, at: 5, extra: 'x' }, 'junk', null], ask: { kind: 'hint', todoId: 't1', others: ['a', 7], win: { ...win(FOREIGN), fiveHour: FIVE } }, win: win(FOREIGN), anchorWin: { sevenDay: OWN, scoped: { Fable: OWN }, fiveHour: FIVE } });
  ok(kept.gen === c.gen && JSON.stringify(kept.run) === JSON.stringify([{ sevenDay: FOREIGN, scoped: {}, at: 5 }]) && kept.ask.kind === 'hint' && JSON.stringify(kept.ask.others) === '["a"]' && kept.ask.win.sevenDay === FOREIGN && !('fiveHour' in kept.ask.win) && kept.anchorWin.scoped.fable === OWN && !('fiveHour' in kept.anchorWin),
    'setOatCheck keeps the generation, the K-run (weekly windows only), ONE ask with the window it names, the anchor\'s weekly window — nothing else', kept);
  ok(!('ask' in am.setOatCheck(R, { ...c, ask: { kind: 'other' } })), '…an ask of an unknown kind is dropped');
  am.setOatCheck(R, c);
  threw = 0;
  for (const bad of [{ sevenDay: null, scoped: {}, how: 'owner-confirmed' }, { ...win(OWN), how: 'fingerprint-proven' }]) { try { am.setOatAnchor(R, bad); } catch { threw++; } }
  ok(threw === 2, 'setOatAnchor refuses an anchor with no weekly window and any proof but the owner\'s pick');
  am.setOatAnchor(R, { ...win(OWN), how: 'owner-confirmed', at: T0, followed: 'renewal-panel' });
  const am2 = new AccountManager({ dataDir });
  ok(am2.oatCheckOf(R)?.state === 'pending' && am2.oatCheckOf(R)?.gen === r.mintedAt && am2.oatAnchorOf(R)?.sevenDay === OWN && am2.oatAnchors()[R]?.how === 'owner-confirmed' && am2.oatAnchorOf(R)?.followed === 'renewal-panel', 'both facts are ON the account record (the generation and a followed anchor too): a restart reads them back');
  am.clearOat(R);
  ok(am.oatCheckOf(R) === null && am.oatAnchorOf(R) === null && !am.oatAnchors()[R], 'clearOat drops the check AND the anchor its pick confirmed');
  const raw = fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf8');
  ok(!raw.includes(TOK.R) && !raw.includes(TOK.R.slice(13, 40)), 'accounts.json never holds the token in the clear (the check / anchor carry windows and an instant only)');
  // parseAuth names the generation of OUR materialized token file (the file road's evidence — lane oat-identity-fix)
  const { oatFileBody } = require(path.join(REPO, 'src/login-expiry.js'));
  const dir = path.join(tmp, 'pa'); fs.mkdirSync(dir, { recursive: true });
  const body = oatFileBody(tok('PA'), { expiresAt: Date.now() + 86400e3, shape: { scopes: ['user:inference'], subscriptionType: 'max' }, mintedAt: 1790000000123, account: 'sub-x' });
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify(body));
  const pa = am._credsOf('claude').parseAuth(dir);
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'y', expiresAt: Date.now() + 3600e3, subscriptionType: 'max' } }));
  const pl = am._credsOf('claude').parseAuth(dir);
  ok(pa.oatFile === true && pa.oatFileGen === 1790000000123 && !('oatFileGen' in pl) && !pl.oatFile, 'parseAuth: our token file names its generation (the mark\'s mint instant); a login file names none', { pa: { oatFile: pa.oatFile, gen: pa.oatFileGen }, pl: { oatFile: pl.oatFile } });
}

console.log('§3 the ONE orchestrator over the real store + the real For-you store');
const todos = new UserTodoManager({ dataDir: path.join(tmp, 'todos') });
let wins = {}, groups = {};
const logs = [], js = [];
const mkOrch = (mod = OI) => mod.create({ accounts: am, todos: () => todos, windows: () => wins, groups: (id) => groups[id] || [id], k: () => K, now: () => Date.now(), log: (...a) => logs.push(a.join(' ')), journal: (j) => js.push(j) });
let orch = mkOrch();
ok(orch.attach() === true && am._oatCheckHook === orch.checkReplaced, 'attach() hands the store its hook (a save / removal / move that replaces a check reaches us)');
const openItems = () => todos._state.items.filter((i) => i.sessionKey === OI.INBOX_KEY && i.status === 'open');
/** a reading produced on row `id`'s CURRENT token, eligible — the shape the engine hands over */
const reading = (id, sevenDay, extra = {}) => ({ window: win(sevenDay), at: Date.now(), viaToken: true, gen: am.oatCheckOf(id)?.gen ?? null, eligible: ELIGIBLE, sid: 'conv-1', ...extra });
const markWith = (id, sevenDay) => { let v = null; for (let i = 0; i < K; i++) v = orch.onReading(id, reading(id, sevenDay)); return v; };
{
  // A — CONFIRMED: R's own window was established BEFORE the token
  const m = am.setOat(R, TOK.R).mintedAt;
  wins = { [R]: { ...win(OWN), at: m - 3600e3, source: 'on-demand' } };
  ok(orch.onReading(R, reading(R, OWN, { viaToken: false })).verdict === 'not-the-token' && am.oatCheckOf(R).state === 'pending', 'a reading of the row\'s own login never judges — the check stays armed');
  ok(orch.onReading(R, reading(R, OWN, { at: Date.now() - LATE_MS - 5000 })).verdict === 'late' && am.oatCheckOf(R).state === 'pending', 'a reading > 2 min late never judges — the check stays armed');
  ok(orch.onReading(R, reading(R, OWN, { eligible: { ok: false, why: 'inside a re-point lag shadow' } })).verdict === 'ineligible' && am.oatCheckOf(R).state === 'pending', 'a reading that is no witness (a lag shadow) never judges — the check stays armed (F2)');
  let asked = 0;
  orch.onReading(F, reading(F, OWN, { viaToken: () => { asked++; return true; }, gen: () => { asked++; return 1; } }));
  ok(asked === 0, 'a row with no armed check never asks whether the slot spends a token or which (the thunks read a credential file)');
  const v = orch.onReading(R, reading(R, OWN, { viaToken: () => true, gen: () => am.oatCheckOf(R).gen }));
  ok(v.verdict === 'confirmed' && am.oatCheckOf(R).state === 'confirmed' && am.oatCheckOf(R).via === 'established' && am.oatCheckOf(R).anchorWin?.sevenDay === OWN, 'the FIRST eligible reading produced on the token agrees ⇒ confirmed (the anchor\'s weekly window kept)', am.oatCheckOf(R));
  ok(orch.onReading(R, reading(R, OWN)).verdict === 'idle' && orch.onReading(R, reading(R, FOREIGN)).verdict === 'idle', '…every later reading is idle (judged once per saved token)');
  // F5: the ⟳ panel re-stamps the same weekly window with the next 5-hour block, in its -60 s spelling — no anchor change
  for (let i = 1; i <= 4; i++) { wins[R] = { ...win(OWN - (i % 2) * 60), fiveHour: FIVE + i * 5 * 3600, at: Date.now(), source: 'on-demand', producer: 'login' }; orch.onReading(R, reading(R, OWN)); } // the row's login ⟳ panel (it names its producer — fix r2)
  ok(js.filter((j) => j.outcome === 'post-check-confirmed' && j.accountId === R).length === 1 && logs.filter((l) => /Work Max: its long-lived token's first reading agrees/.test(l)).length === 1 && !logs.some((l) => /Work Max: the row's identity anchor moved/.test(l)),
    'F5: …journaled ONCE — four panel re-stamps of the same week (new 5-hour blocks, the ±60 s spelling) re-arm nothing');
  ok((am.list().accounts.find((a) => a.id === R) || {}).oatIdentity === 'confirmed' && openItems().length === 0, 'the roster row carries oatIdentity confirmed; nothing is filed for a confirm');
}
{
  // B — MISMATCH after K readings: Second's token answers with Work Max's window
  const m = am.setOat(S, TOK.S).mintedAt;
  wins[S] = { ...win(THIRD), at: m - 7200e3, source: 'on-demand' };
  const linkCalls = [];
  const realFns = {};
  for (const k of ['setPoolTarget', 'repointPoolSymlink', 'ensureSessionPoolLink', 'dropSessionPoolLink', 'clearOat', 'setOat', 'moveOat']) { realFns[k] = am[k]; am[k] = function (...a) { linkCalls.push(k); return realFns[k].apply(this, a); }; }
  const firsts = [];
  for (let i = 0; i < K - 1; i++) firsts.push(orch.onReading(S, reading(S, OWN)).verdict);
  const midRow = am.list().accounts.find((a) => a.id === S) || {};
  ok(firsts.every((x) => x === 'suspect') && am.oatCheckOf(S).state === 'pending' && am.oatCheckOf(S).run.length === K - 1 && openItems().length === 0 && !midRow.oatIdentity,
    `F2: the first ${K - 1} disagreeing readings are SUSPECTS — remembered on the check, nothing marked, nothing filed, the roster silent`, { firsts, check: am.oatCheckOf(S) });
  const v = orch.onReading(S, reading(S, OWN));
  for (const k of Object.keys(realFns)) am[k] = realFns[k];
  const c = am.oatCheckOf(S);
  ok(v.verdict === 'mismatch' && v.run === K && c.state === 'mismatch' && JSON.stringify(c.others) === JSON.stringify([R]) && c.via === 'established' && !c.run, `…agreeing reading #${K} ⇒ mismatch, naming Work Max (the run cleared)`, c);
  ok(am.getOat(S) === TOK.S && linkCalls.length === 0, '…the token is KEPT, and nothing moved a link, re-pointed a pool or touched a token', linkCalls);
  const row = am.list().accounts.find((a) => a.id === S) || {};
  ok(row.oatIdentity === 'mismatch' && row.oatIdentityOther === 'Work Max' && JSON.stringify(row.oatIdentityOtherIds) === JSON.stringify([R]), '…the roster row is marked identity-mismatch (names, and the ids the re-bind preselects)', row);
  const items = openItems();
  ok(items.length === 1 && items[0].origin === 'login' && /^Second's long-lived token belongs to another account \(its usage matches Work Max\) — re-mint it or re-bind it in Manage Agents$/.test(items[0].text) && items[0].id === c.todoId,
    '…ONE For-you notice, origin login, in the owner\'s words, its id on the check', items.map((i) => i.text));
  ok(items[0].i18n && items[0].i18n.text && items[0].i18n.text.params.account === 'Second' && items[0].i18n.text.params.other === 'Work Max', '…with its i18n key + params');
  ok(logs.some((l) => /Second: its long-lived token belongs to another account \(Work Max\).*the token is kept.*the pool places nothing new/.test(l)) && js.some((j) => j.outcome === 'post-check-mismatch' && j.accountId === S && j.run === K), '…said in the journal and the probe log');
  orch.onReading(S, reading(S, OWN)); orch.onReading(S, reading(S, FOREIGN));
  orch = mkOrch(); orch.attach();
  orch.onReading(S, reading(S, OWN));
  ok(openItems().length === 1, 'THE SINGLE-FILE RULE: more readings, and a restarted orchestrator over the same stores, file nothing more');
  // the pool is told: a member whose folder holds OUR token file is no NEW placement's; its login twin still is
  const realRead = am._readAuthFor.bind(am), realCaps = am.oatFileCaps.bind(am);
  am._readAuthFor = (be, id) => (id === S || id === R ? { loggedIn: true, oatFile: id === S } : realRead(be, id));
  am.oatFileCaps = () => ({ known: true, ok: true, cli: '2.1.296' });
  const P = am.createPool({ name: 'Pool', members: [R, S] }).id;
  const before = am.poolMembers(P).map((x) => x.id);
  ok(am._placeable('claude', S) === false && !before.includes(S) && before.includes(R) && am.isPoolMember(P, S) === false, 'the pool places nothing new on Second (its folder holds the token) — Work Max stays a candidate', before);
  am.setOatCheck(R, { ...am.oatCheckOf(R), state: 'mismatch' });
  ok(am._placeable('claude', R) === true, '…a member serving its OWN login keeps serving even when its token is another account\'s (the pool spends the login)');
  am.setOatCheck(R, { ...am.oatCheckOf(R), state: 'confirmed' });
  // all-mismatch pool: refused by name
  const cS = am.oatCheckOf(S); am.setOatCheck(S, { ...cS, state: 'pending' }); // (createPool wants a placeable member)
  const P2 = am.createPool({ name: 'Tokens', members: [S] }).id;
  am.setOatCheck(S, cS);
  const realRSC = am.readSubCreds.bind(am);
  am.readSubCreds = (id) => (id === S ? { ...realRSC(id), loggedIn: true, oatFile: true } : realRSC(id));
  let err = null; try { am.resolveForSpawn(P2); } catch (e) { err = e; }
  am.readSubCreds = realRSC;
  ok(err && err.code === 'oat-identity-mismatch' && /belongs to another account/.test(err.message) && /Second/.test(err.message), 'a pool whose every member\'s token is another account\'s refuses a NEW conversation by name (oat-identity-mismatch)', err && { code: err.code, m: err.message });
  globalThis.__PP = am.createPool({ name: 'Pool2', members: [R] }).id; // a pool row, for §3 C's "never onto a pool"
  am._readAuthFor = realRead; am.oatFileCaps = realCaps;
}
{
  // C — the owner's act resolves the notice
  const id1 = am.oatCheckOf(S).todoId;
  am.setOat(S, TOK.S2);
  ok(todos.get(id1).status === 'done' && am.oatCheckOf(S).state === 'pending' && am.oatCheckOf(S).gen > 0 && openItems().length === 0, 'RE-MINT: a new token saved ⇒ the notice is resolved and the new token (a new generation) is checked again', todos.get(id1));
  markWith(S, OWN);
  const id2 = am.oatCheckOf(S).todoId;
  ok(am.oatCheckOf(S).state === 'mismatch' && openItems().length === 1 && todos.get(id2).status === 'open', '…a new token that is ANOTHER account\'s too is said again (the store reopens an item with the same words: still ONE open)');
  am.clearOat(S);
  ok(todos.get(id2).status === 'done' && am.oatCheckOf(S) === null && openItems().length === 0, 'REMOVE: the token removed ⇒ the notice resolved, the check gone');
  am.setOat(S, TOK.S3); markWith(S, OWN);
  const id3 = am.oatCheckOf(S).todoId;
  todos.setStatus(id3, 'dismissed', 'user');
  am.setOat(S, TOK.S);
  ok(todos.get(id3).status === 'dismissed', 'an item the OWNER already handled is never re-resolved by our next act (a new token saved)', todos.get(id3));
  markWith(S, OWN);
  // RE-BIND: the token belongs to Work Max — move it there (Work Max holds its own live token first: refused)
  const mintedS = am.get(S).oatMintedAt, id4 = am.oatCheckOf(S).todoId;
  let e1 = null; try { orch.rebind(S, R); } catch (e) { e1 = e; }
  ok(e1 && e1.code === 'target_has_token' && am.getOat(S) === TOK.S, 'RE-BIND onto a row holding a live token of its own is refused (target_has_token), nothing moved');
  let refusals = 0;
  for (const to of [S, 'sub-nope']) { try { am.moveOat(S, to); } catch { refusals++; } }
  try { am.moveOat(F, R); } catch { refusals++; }
  try { am.moveOat(S, globalThis.__PP); } catch { refusals++; }
  ok(refusals === 4 && am.getOat(S) === TOK.S, '…onto itself, an unknown row, from a row with no token, onto a pool: refused');
  am.clearOat(R);
  const r = orch.rebind(S, R);
  ok(am.getOat(R) === TOK.S && !am.getOat(S) && am.get(R).oatMintedAt === mintedS && r.mintedAt === mintedS && am.oatCheckOf(R)?.gen === mintedS, 'RE-BIND: the token now sits on Work Max with its ORIGINAL mint time (its real year) and generation (the same token), and nowhere else');
  ok(am.oatCheckOf(R)?.state === 'pending' && am.oatCheckOf(S) === null && am.oatAnchorOf(S) === null && todos.get(id4).status === 'done', '…checked again on its new row; the old row\'s check, anchor and notice are gone / resolved');
  ok(orch.onReading(R, reading(R, OWN)).verdict === 'confirmed' && openItems().length === 0, '…and its first reading there confirms it');
  ok(js.some((j) => j.outcome === 'rebound' && j.accountId === R && j.from === S), '…journaled as the owner\'s re-bind');
}
{
  // D — after an anchor MOVE a confirmed token is checked again; a dependent change is not one
  const since = (am.oatCheckOf(R) || {}).since || Date.now();
  wins[R] = { ...win(FOREIGN), at: since + 60e3, source: 'api', producer: 'oat:' + am.oatCheckOf(R)?.gen };
  ok(orch.onReading(R, reading(R, FOREIGN)).verdict === 'idle' && am.oatCheckOf(R)?.state === 'confirmed', 'an anchor re-stamped from the slot\'s OWN token readings (producer oat:<gen>) is not an anchor change');
  wins[R] = { ...win(THIRD), at: since + 90e3, source: 'on-demand', producer: 'login' };
  const v = orch.onReading(R, reading(R, THIRD));
  ok(v.verdict === 'confirmed' && logs.some((l) => /Work Max: the row's identity anchor moved/.test(l)) && js.filter((j) => j.outcome === 'post-check-confirmed' && j.accountId === R).length === 3, 'an independent anchor MOVE (another weekly phase) re-arms a confirmed check: the next reading judges again', v);
  // a mismatch is never cleared by an anchor change (only the owner's act)
  am.setOat(H, TOK.H); wins[H] = { ...win(OWN), at: 1, source: 'on-demand' };
  markWith(H, THIRD); // a mark needs ANOTHER account's identity on the run's phase (fix r2 F-C): Work Max's login stamp holds THIRD
  wins[H] = { ...win(FOREIGN), at: Date.now() + 1, source: 'on-demand', producer: 'login' };
  ok(orch.onReading(H, reading(H, FOREIGN)).verdict === 'idle' && am.oatCheckOf(H).state === 'mismatch', '…a MISMATCH waits for the owner\'s act — an anchor change never clears it');
  am.setOat(F, TOK.F);
  ok(orch.onReading(F, reading(F, nowS + 6 * 86400 + 1234)).verdict === 'no-anchor' && am.oatCheckOf(F).state === 'pending', 'no anchor anywhere ⇒ no verdict, the check stays armed');
}
{
  // E — F4: no anchor of its own, ANOTHER row's window ⇒ a HINT: ONE ask, never a mark, never a placement stop
  am.setOat(G, TOK.G);
  const v1 = orch.onReading(G, reading(G, FOREIGN));
  const c = am.oatCheckOf(G);
  const hints = openItems().filter((i) => /looks like/.test(i.text));
  ok(v1.verdict === 'hint' && c.state === 'pending' && c.ask?.kind === 'hint' && JSON.stringify(c.ask.others) === JSON.stringify([H]) && c.ask.win?.sevenDay === FOREIGN && hints.length === 1 && hints[0].id === c.ask.todoId,
    'F4: a no-anchor token row whose reading carries Held\'s window ⇒ a HINT: ONE For-you ask, the check still pending (never a mark)', { v1, c });
  ok(/^Ghost's long-lived token looks like Held's — confirm it is Ghost's, or re-bind it in Manage Agents$/.test(hints[0].text) && hints[0].i18n?.text?.params?.other === 'Held', '…in the owner\'s words, naming the row (i18n key + params)', hints[0].text);
  for (let i = 0; i < K + 2; i++) orch.onReading(G, reading(G, FOREIGN));
  const row = am.list().accounts.find((a) => a.id === G) || {};
  ok(am.oatCheckOf(G).state === 'pending' && openItems().filter((i) => /looks like/.test(i.text)).length === 1 && row.oatIdentity === 'hint' && row.oatIdentityOther === 'Held' && JSON.stringify(row.oatIdentityOtherIds) === JSON.stringify([H]),
    `…${K + 2} more readings in that phase: still a hint (no K-run escalation — the coincidence repeats), still ONE ask; the roster says hint, naming Held`, row);
  const realRead = am._readAuthFor.bind(am), realCaps = am.oatFileCaps.bind(am);
  am._readAuthFor = (be, id) => (id === G ? { loggedIn: true, oatFile: true } : realRead(be, id)); am.oatFileCaps = () => ({ known: true, ok: true, cli: '2.1.296' });
  ok(am._placeable('claude', G) === true, '…and the pool keeps placing on it (a hint is no placement stop)');
  am._readAuthFor = realRead; am.oatFileCaps = realCaps;
  // the owner answers: mine ⇒ the window anchors the row, confirmed, the ask resolved
  const askId = am.oatCheckOf(G).ask.todoId;
  const a1 = orch.answer(G, 'mine');
  ok(a1.state === 'confirmed' && am.oatCheckOf(G).state === 'confirmed' && am.oatCheckOf(G).via === 'owner-answer' && am.oatAnchorOf(G)?.sevenDay === FOREIGN && am.oatAnchorOf(G)?.how === 'owner-confirmed' && todos.get(askId).status === 'done' && !am.oatCheckOf(G).ask,
    'the owner answers MINE ⇒ the window the readings stated is the row\'s owner-confirmed anchor, confirmed, the ask resolved', am.oatCheckOf(G));
  ok(js.some((j) => j.outcome === 'owner-answer' && j.answer === 'mine' && j.accountId === G), '…journaled as the owner\'s answer');
  // …or not mine ⇒ the mark (placement stop + ONE notice)
  const G2 = am.createSubscription({ name: 'Ghost Two' }).id; am.setOat(G2, tok('G2'));
  orch.onReading(G2, reading(G2, FOREIGN));
  const ask2 = am.oatCheckOf(G2).ask.todoId;
  let e = null; try { orch.answer(G2, 'maybe'); } catch (x) { e = x; }
  const a2 = orch.answer(G2, 'not-mine');
  const c2 = am.oatCheckOf(G2);
  ok(e && e.code === 'bad_answer' && a2.state === 'mismatch' && c2.state === 'mismatch' && c2.via === 'owner-answer' && c2.others.includes(H) && c2.others.includes(G) && todos.get(ask2).status === 'done' && todos.get(c2.todoId)?.status === 'open' && /^Ghost Two's long-lived token belongs to another account \(its usage matches [^)]*Held/.test(todos.get(c2.todoId).text),
    '…NOT MINE ⇒ the mark (its notice filed, naming the rows — Held, and Ghost whose anchor is now that window), the ask resolved; an unknown answer is refused', c2);
  let e2 = null; try { orch.answer(G2, 'mine'); } catch (x) { e2 = x; }
  ok(e2 && e2.code === 'nothing_to_confirm' && am.oatCheckOf(G2).state === 'mismatch', '…a MARK is never undone by one click (re-mint / re-bind / remove are its doors)');
}
{
  // F — F3: identity groups collapse; a non-account key is never "another account"
  const D = am.createSubscription({ name: 'Token Row' }).id, E = am.createSubscription({ name: 'Login Row' }).id, E2 = am.createSubscription({ name: 'Login Twin' }).id;
  am.setOat(D, tok('D'));
  const W_G = nowS + 2 * 86400 + 7 * 3600;
  wins = { ...wins, __global__: { ...win(W_G - 60), at: 1, source: 'on-demand' }, 'host-abc': { ...win(W_G), at: 1, source: 'on-demand' } };
  const v0 = orch.onReading(D, reading(D, W_G));
  ok(v0.verdict === 'no-anchor' && !openItems().some((i) => /Token Row/.test(i.text) || /__global__|host-abc/.test(i.text)), 'F3: the machine login (__global__) and a host key holding the same window are no account — no-anchor, nothing filed, no key in any words', v0);
  // the row's OWN identity group (an org-merged login spans several keys) is the row
  wins = { ...wins, [E]: { ...win(W_G), at: 1, source: 'on-demand' } };
  groups = { [D]: [D, E, '__global__'], [E]: [D, E, '__global__'], __global__: [D, E, '__global__'] };
  ok(orch.onReading(D, reading(D, W_G)).verdict === 'no-anchor', '…a row in the SAME identity group as the token\'s row is never "another account"');
  // two keys of ONE other group are ONE other, named by an account
  groups = { [E]: [E, E2, '__global__'], [E2]: [E, E2, '__global__'], __global__: [E, E2, '__global__'] };
  wins = { ...wins, [E2]: { ...win(W_G), at: 1, source: 'on-demand' } };
  const v2 = orch.onReading(D, reading(D, W_G));
  ok(v2.verdict === 'hint' && JSON.stringify(v2.others) === JSON.stringify([[E, E2].sort()[0]]) && !openItems().some((i) => /__global__|host-abc/.test(i.text)), '…two keys of ONE other identity group are ONE other (a hint naming one account) — never two accounts matching one window', v2);
  delete wins.__global__; delete wins['host-abc']; delete wins[E]; delete wins[E2]; groups = {};
}
{
  // G — F1 on the orchestrator: a reading of ANOTHER generation of the row's token never judges; journaled once per conversation
  const X = am.createSubscription({ name: 'Gen Row' }).id;
  const g1 = am.setOat(X, tok('X1')).mintedAt;
  wins[X] = { ...win(OWN), at: 1, source: 'on-demand' };
  await new Promise((r) => setTimeout(r, 3));
  am.setOat(X, tok('X2'));
  const before = js.filter((j) => j.outcome === 'post-check-stale-token').length;
  const vs = [1, 2, 3].map(() => orch.onReading(X, reading(X, FOREIGN, { gen: g1, sid: 'conv-old' })).verdict);
  orch.onReading(X, reading(X, FOREIGN, { gen: null, sid: 'conv-restored' }));
  ok(vs.every((x) => x === 'stale-token') && am.oatCheckOf(X).state === 'pending' && !am.oatCheckOf(X).run && js.filter((j) => j.outcome === 'post-check-stale-token').length === before + 2,
    'F1: a conversation still on the PREVIOUS token (and one whose generation is unknown) never judges — no suspect, no mark; journaled ONCE per conversation', vs);
  ok(orch.onReading(X, reading(X, OWN)).verdict === 'confirmed', '…a conversation on the token saved NOW judges it');
}
{
  // H — F6: the owner-confirmed anchor FOLLOWS the row's independent re-anchors; the token's own move is an ask; `self`
  const Y = am.createSubscription({ name: 'Anchored' }).id;
  const m = am.setOat(Y, tok('Y')).mintedAt;
  am.setOatAnchor(Y, { ...win(OWN), how: 'owner-confirmed', at: m + 1, mint: 'om-y' });
  const v = orch.onReading(Y, reading(Y, OWN));
  ok(v.verdict === 'confirmed' && v.via === 'self' && js.some((j) => j.outcome === 'post-check-confirmed' && j.accountId === Y && j.via === 'self') && logs.some((l) => /Anchored: its long-lived token's first reading agrees with the window its OWN mint probe stated \(self/.test(l)) && !logs.some((l) => /Anchored: .*agrees with the row/.test(l)),
    'F6: the first confirm against the anchor THIS token\'s own mint probe wrote is journaled `self` — never "agrees with the row"', v);
  const RENEW = OWN + 9 * 3600;
  ok(orch.onReanchor(Y, { window: win(OWN - 60), source: 'renewal-panel', independent: true }) === 'same', 'a re-anchor in the SAME weekly phase changes nothing');
  ok(orch.onReanchor(Y, { window: win(RENEW), source: 'renewal-panel', independent: true }) === 'followed' && am.oatAnchorOf(Y).sevenDay === RENEW && am.oatAnchorOf(Y).followed === 'renewal-panel' && am.oatAnchorOf(Y).how === 'owner-confirmed',
    'a renewal re-anchor proven WITHOUT the token ⇒ the owner-confirmed anchor FOLLOWS it (journaled anchor-followed)', am.oatAnchorOf(Y));
  const v2 = orch.onReading(Y, reading(Y, RENEW));
  ok(v2.verdict === 'confirmed' && v2.via === 'owner-confirmed' && am.oatCheckOf(Y).state === 'confirmed' && openItems().every((i) => !/Anchored/.test(i.text)),
    '…the confirmed check re-arms on the move and the token\'s renewed reading confirms against it — never a mismatch on a healthy row (the verifier\'s F6)', v2);
  const MOVED = RENEW + 5 * 3600;
  ok(orch.onReanchor(Y, { window: win(MOVED), source: 'window-moved', independent: false }) === 'asked' && am.oatAnchorOf(Y).sevenDay === RENEW && am.oatCheckOf(Y).ask?.kind === 'anchor' && am.oatCheckOf(Y).state === 'confirmed',
    'a move made of the token\'s OWN readings is never followed (the token would confirm itself): the anchor kept, ONE ask, nothing marked', am.oatCheckOf(Y));
  const items = openItems().filter((i) => /Anchored's usage window moved/.test(i.text));
  ok(items.length === 1 && orch.onReanchor(Y, { window: win(MOVED + 3600), source: 'window-moved', independent: false }) === 'kept' && openItems().filter((i) => /Anchored's usage window moved/.test(i.text)).length === 1 && (am.list().accounts.find((a) => a.id === Y) || {}).oatIdentity === 'anchor',
    '…ONE item (a second move asks nothing more); the roster says anchor', items.map((i) => i.text));
  orch.answer(Y, 'mine');
  ok(am.oatAnchorOf(Y).sevenDay === MOVED && am.oatCheckOf(Y).state === 'confirmed' && !am.oatCheckOf(Y).ask && todos.get(items[0].id).status === 'done', '…the owner answers mine ⇒ the moved window is the anchor, the ask resolved');
  ok(orch.onReanchor(F, { window: win(MOVED), source: 'window-moved', independent: true }) === 'none', 'a row with no owner-confirmed anchor has nothing to follow');
}
{
  // I — F8: a token no reading judged for a day says 「身份未验证」 on its row — the roster only, never a notice
  const U = am.createSubscription({ name: 'Never Judged' }).id;
  am.setOat(U, tok('U'));
  const c = am.oatCheckOf(U);
  const n0 = todos._state.items.length;
  ok(!(am.list().accounts.find((a) => a.id === U) || {}).oatIdentity, 'a young armed token says nothing on its row');
  am.setOatCheck(U, { ...c, since: Date.now() - M.UNVERIFIED_MS - 60e3 });
  ok((am.list().accounts.find((a) => a.id === U) || {}).oatIdentity === 'unverified' && todos._state.items.length === n0, 'F8: armed and unjudged for over a day ⇒ the row says unverified — nothing filed');
}

console.log('§4 (a) the anchor in the mint ladder (oat-mint over a fake PTY)');
const OM_SRC = read('src/server/oat-mint.js');
const OM = require(path.join(REPO, 'src/server/oat-mint.js'));
const fakePty = (tokenFor) => (file, args) => {
  const data = [], exits = [];
  let killed = false, buf = '';
  const emit = (t) => setTimeout(() => { if (!killed) for (const f of data) f(t); }, 2);
  const p = {
    onData: (f) => { data.push(f); }, onExit: (f) => { exits.push(f); },
    write: (d) => { buf += d; if (d === '\r') emit('\n\nYour OAuth token (valid for 1 year):\n\n' + tokenFor() + '\n\nStore this token securely. You won\'t be able to see it again.\n'); },
    kill: () => { killed = true; },
  };
  ok.__spawned = (ok.__spawned || 0) + 1;
  if (!(file && Array.isArray(args) && args[0] === 'setup-token')) throw new Error('unexpected spawn');
  emit('Browser didn\'t open? Use the url below to sign in:\n\nhttps://claude.ai/oauth/authorize?code=true&client_id=fake&state=s1\n\nPaste code here if prompted > ');
  return p;
};
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 5)); } return fn(); };
const panel = (sec) => (sec ? { sevenDay: { utilization: 0.4, resetsAt: sec }, fiveHour: { utilization: 0.1, resetsAt: FIVE } } : null);
const mintWins = {}; // §4's own anchors (§3's rows hold other phases)
async function mint(mod, accountId, { probeWin = null, token = tok('M'), windows: wfn = () => mintWins } = {}) {
  const jr = [];
  const m = mod.create({ accounts: am, claudeCmd: 'claude', tmpRoot: tmp, spawnPty: fakePty(() => token), probePanel: async () => panel(probeWin), windows: wfn, journal: (j) => jr.push(j), log: () => { } });
  const st = m.start({ accountId });
  const id = st.mint.id;
  await until(() => m.get(id)?.phase === 'waiting-code');
  m.sendCode(id, 'fakeAuthCode123#STATE');
  await until(() => ['saved', 'failed', 'confirm'].includes(m.get(id)?.phase));
  return { m, id, jr, token, st: m.get(id) };
}
// M1 (verify r1 F7): the guard's sidecars live beside the usage cache — the anchor rung must never write one
const cacheDir = path.join(dataDir, 'usage-cache');
fs.mkdirSync(cacheDir, { recursive: true });
const sidecars = () => fs.readdirSync(cacheDir).filter((f) => f.startsWith('.window-')).sort();
{
  // a fresh row: nothing proves the token; the probe states a window; the owner picks it
  const W1 = nowS + 1 * 86400 + 19 * 3600, W2 = W1 + 2 * 86400 + 3 * 3600; // phases no §3 anchor holds
  const fresh = am.createSubscription({ name: 'Anchor Row' }).id;
  const other = am.createSubscription({ name: 'Other Row' }).id;
  const sc0 = sidecars();
  let x = await mint(OM, fresh, { probeWin: W1 });
  ok(x.st.phase === 'confirm' && x.jr.some((j) => j.outcome === 'awaiting-owner' && /no anchor yet/.test(j.why)), 'a row with no anchor ⇒ the pick (the probe stated a window nobody holds)', x.st);
  const y = x.m.confirm(x.id, { save: true });
  const an = am.oatAnchorOf(fresh);
  ok(y.ok && am.getOat(fresh) === x.token && an && an.sevenDay === W1 && an.how === 'owner-confirmed' && an.mint === x.id, 'the owner\'s yes saves it AND makes the probe\'s window the row\'s anchor (owner-confirmed)', an);
  ok(JSON.stringify(sidecars()) === JSON.stringify(sc0), 'M1: …and NO `.window-` sidecar appears in the usage cache — the anchor lives on the account record, never where the reading guard files by', sidecars());
  ok(x.jr.some((j) => j.outcome === 'owner-confirmed') && x.jr.some((j) => j.outcome === 'anchor' && j.anchor === 'owner-confirmed' && j.fp === an.fp), '…journaled: owner-confirmed, then anchor: owner-confirmed with its fingerprint', x.jr);
  ok(am.oatCheckOf(fresh)?.state === 'pending', '…and the token\'s post-check is armed');
  ok(!JSON.stringify(x.m.get(x.id)).includes(String(W1)) && !('probe' in x.m.get(x.id)), 'the probe\'s window never leaves the hub in a mint answer (publicMint whitelists)');
  // fix r2 F-A: that anchor is the token's OWN probe (`self` for its generation) — a RE-MINT is never refused by it (the
  // notice's door: a wrong T1 picked onto the row would otherwise lock the owner's correct T2 out) nor proven by it
  x = await mint(OM, fresh, { probeWin: W2 });
  ok(x.st.phase === 'confirm' && am.oatAnchorOf(fresh).sevenDay === W1, 'fix r2 F-A: a RE-MINT whose probe disagrees with the PREVIOUS token\'s mint-probe anchor is never refused by it — that anchor was the previous token\'s own reading: the owner picks', x.st);
  const ya = x.m.confirm(x.id, { save: true });
  ok(ya.ok && am.getOat(fresh) === x.token && am.oatAnchorOf(fresh)?.sevenDay === W2 && am.oatAnchorOf(fresh)?.mint === x.id, '…on yes the save RETIRES the previous token\'s mint anchor and the new probe\'s window is this generation\'s (`self`) anchor', am.oatAnchorOf(fresh));
  x = await mint(OM, fresh, { probeWin: W2 });
  ok(x.st.phase === 'confirm' && !x.jr.some((j) => j.outcome === 'fingerprint-proven'), '…and a later probe AGREEING with a mint-probe anchor proves nothing (the owner picks): a token\'s own probe is never the row\'s identity', x.st);
  x.m.cancel(x.id);
  // the window the OWNER answered for the row IS its identity: it refuses a disagreeing probe, proves an agreeing one,
  // and is "every row's anchor" for another row's mint
  am.setOatAnchor(fresh, { ...win(W1), how: 'owner-confirmed', at: Date.now() });
  x = await mint(OM, fresh, { probeWin: W2 });
  ok(x.st.phase === 'failed' && x.st.reason === 'anchor_mismatch' && /Anchor Row/.test(x.st.error) && am.getOat(fresh) !== x.token && am.oatAnchorOf(fresh).sevenDay === W1,
    'a later mint whose probe disagrees with the window the OWNER answered for the row ⇒ failed anchor_mismatch: not saved, the anchor unchanged', x.st);
  ok(x.m.confirm(x.id, { save: true }).code === 'anchor_mismatch', '…a confirm after it is refused 409 anchor_mismatch');
  x = await mint(OM, fresh, { probeWin: W1 });
  ok(x.st.phase === 'saved' && x.jr.some((j) => j.outcome === 'fingerprint-proven') && am.oatAnchorOf(fresh)?.sevenDay === W1 && !am.oatAnchorOf(fresh)?.mint, 'a later probe that AGREES with it proves the token (fingerprint-proven, no pick); the owner\'s anchor survives the save', x.st);
  x = await mint(OM, other, { probeWin: W1 });
  ok(x.st.phase === 'failed' && x.st.reason === 'identity_mismatch' && x.st.other === 'Anchor Row' && !am.getOat(other), 'another row\'s mint whose probe states that window ⇒ refused, naming the anchored row', x.st);
  const W4 = W2 + 5 * 3600;
  const q = am.createSubscription({ name: 'Probe Only' }).id; am.setOat(q, tok('Q')); am.setOatAnchor(q, { ...win(W4), how: 'owner-confirmed', at: Date.now(), mint: 'om-q' });
  x = await mint(OM, other, { probeWin: W4 });
  ok(x.st.phase === 'confirm' && !am.getOat(other), 'fix r2 F-A: another row\'s MINT-PROBE anchor names nobody — a probe stating it goes to the owner\'s pick, never refused naming that row', x.st);
  x.m.cancel(x.id);
  // a row whose ESTABLISHED window disagrees: the pick saves it, the anchor is KEPT (the post-check will say it)
  const held = am.createSubscription({ name: 'Est Row' }).id;
  const W3 = W1 + 86400 + 3600;
  const wx = { [held]: { ...win(W3), at: 1, source: 'on-demand' } };
  x = await mint(OM, held, { probeWin: W2, windows: () => wx });
  const y2 = x.m.confirm(x.id, { save: true });
  ok(y2.ok && am.getOat(held) === x.token && am.oatAnchorOf(held) === null && x.jr.some((j) => j.outcome === 'anchor' && j.anchor === 'kept'), 'a pick under a row whose established window DISAGREES: saved, no anchor written (kept), journaled anchor: kept', x.jr);
  // a failed probe: the pick saves, nothing to anchor
  const nop = am.createSubscription({ name: 'No Probe' }).id;
  x = await mint(OM, nop, { probeWin: null });
  x.m.confirm(x.id, { save: true });
  ok(am.getOat(nop) === x.token && am.oatAnchorOf(nop) === null && !x.jr.some((j) => j.outcome === 'anchor'), 'the /usage read failed (the real oat\'s usual case) ⇒ saved on the pick, no anchor — the post-check judges against what the row knows');
  ok(JSON.stringify(sidecars()) === JSON.stringify(sc0), 'M1: every mint of this section left the usage cache\'s `.window-` sidecars exactly as they were', sidecars());
  // M1 RED control: the same ladder with a sidecar write planted beside setOatAnchor is caught by the behaviour leg
  const planted = OM_SRC.replace("      if (anchor) { try { accounts.setOatAnchor(to, anchor);", "      if (anchor) { try { require('fs').writeFileSync(require('path').join(accounts.dataDir, 'usage-cache', require('../reading-lag.js').windowSidecarName(to)), JSON.stringify({ ...anchor, at: Date.now(), source: 'on-demand' })); } catch { } try { accounts.setOatAnchor(to, anchor);");
  ok(planted !== OM_SRC, 'M1 RED control applies (a `.window-` write planted beside setOatAnchor)');
  const PM = compileAs('src/server/oat-mint.js', planted);
  const r1 = am.createSubscription({ name: 'Plant Row' }).id;
  x = await mint(PM, r1, { probeWin: W1 + 9 * 3600 + 600 }); x.m.confirm(x.id, { save: true });
  console.log(`    M1 RED control: sidecars after the planted pick: ${JSON.stringify(sidecars().filter((f) => !sc0.includes(f)))}`);
  ok(sidecars().length !== sc0.length, 'M1 RED control: the planted sidecar write is caught (a `.window-` file appeared)');
  for (const f of sidecars()) if (!sc0.includes(f)) fs.rmSync(path.join(cacheDir, f), { force: true });
  // RED control: the .270 ladder (no anchor rung) lets the disagreeing probe through to a pick that overwrites
  const base = OM_SRC.replace(/    if \(probeAgainstAnchor\(win, [^\n]*\n/, '').replace(/    \/\/ \(a\) THE ANCHOR: the probe's window becomes[\s\S]*?\n    }\n    return \{ ok: true, mint: publicMint\(m\) \};/, '    return { ok: true, mint: publicMint(m) };');
  ok(base !== OM_SRC && !/probeAgainstAnchor\(win/.test(base) && !/anchorWriteVerdict\(\{/.test(base), 'RED control applies (the ladder without the anchor rung)');
  const BM = compileAs('src/server/oat-mint.js', base);
  const r2 = am.createSubscription({ name: 'Base Row' }).id;
  x = await mint(BM, r2, { probeWin: W1 + 3 * 3600 + 86400 * 1 + 600 }); x.m.confirm(x.id, { save: true });
  const noAnchor = am.oatAnchorOf(r2) === null;
  x = await mint(BM, r2, { probeWin: W2 + 7 * 3600 });
  console.log(`    RED control (the base ladder): no anchor after the pick: ${noAnchor}; a later disagreeing probe ⇒ phase ${x.st.phase}`);
  ok(noAnchor && x.st.phase === 'confirm', 'RED control: without the anchor rung the pick leaves no anchor and a later disagreeing probe goes to a silent pick');
  x.m.cancel(x.id);
  // the census twin of M1: no file of the identity rungs names the guard's sidecar or its writer
  const rungs = ['src/server/oat-mint.js', 'src/server/oat-identity.js', 'src/oat-identity-model.js'];
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1'); // comments say the rule in words
  const hits = rungs.filter((f) => /windowSidecarName|apiWindowSidecarName|writeSidecar|['"`]\.window-/.test(code(read(f))));
  ok(hits.length === 0, 'M1 census: no identity-rung file names windowSidecarName / writeSidecar / a `.window-` literal', hits);
  ok(/windowSidecarName|writeSidecar|['"`]\.window-/.test(code(planted)), '…and the planted copy would be named by it');
}

console.log('§5 the roster words');
{
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const DOOR = 'This long-lived token belongs to another account — re-mint or re-bind it';
  const HINT = 'This long-lived token looks like {other}’s — confirm or re-bind it', UNV = 'Identity unverified';
  ok(zh[DOOR] === '这枚长期 token 属于另一个账号——重新铸造或改绑', 'zh says the brief\'s words: 这枚长期 token 属于另一个账号——重新铸造或改绑', zh[DOOR]);
  ok(zh[HINT] === '这枚 token 看起来属于 {other}——确认或改绑' && zh[UNV] === '身份未验证', 'zh says the fix brief\'s words: 这枚 token 看起来属于 <row>——确认或改绑 · 身份未验证', [zh[HINT], zh[UNV]]);
  const KS = [DOOR, HINT, UNV, 'Its usage matches {other}.', 'Re-bind to', 'Re-bind', 'Re-bind failed', 'Token moved to {name}', 'No other subscription row can take it — add the account it belongs to first, or re-mint it below.',
    'This token’s usage window differs from the one confirmed for {name} — not saved. Remove {name}’s token first to confirm another account.',
    'Its first usage reading carried another account’s weekly window, so it bills that account, not this one. Conversations already running on it continue; pools place nothing new on it. Fix it in ⋯ → Long-lived token.',
    'Its usage window moved away from the one this token was confirmed with — confirm or re-bind it',
    'This row has no usage window of its own, and the token’s first reading carried {other}’s weekly window. Two accounts can share a reset hour by chance, so nothing was marked and pools keep using it. Answer in ⋯ → Long-lived token.',
    'The account’s usage window moved by this token’s own readings, so the move cannot vouch for the token. Nothing was marked and pools keep using it. Answer in ⋯ → Long-lived token.',
    'No usage reading has checked this long-lived token against the account since it was saved over a day ago. Re-bind it, or re-mint it while signed in as this account, in ⋯ → Long-lived token.',
    'It is {name}’s', 'Not {name}’s', 'Confirmed: the token is {name}’s', 'Marked: the token is not {name}’s', 'Could not save the answer',
    "{account}'s long-lived token belongs to another account (its usage matches {other}) — re-mint it or re-bind it in Manage Agents", "{account}'s long-lived token belongs to another account — re-mint it or re-bind it in Manage Agents",
    "{account}'s long-lived token looks like {other}'s — confirm it is {account}'s, or re-bind it in Manage Agents",
    "{account}'s usage window moved away from the one its long-lived token was confirmed with — confirm the token is still {account}'s, or re-bind it in Manage Agents",
    // fix r3: the lost identity's ask + a conversation whose road is unknown
    'This conversation’s token road is unknown — it takes no part in the identity check',
    'A conversation restored after a restart from a record older than this version cannot say whether it runs on this long-lived token or on the sign-in, so its usage readings never judge the token. Its next start (a resume or a new conversation) records the road.',
    'Identity unverified — the usage window can no longer say whose this token is: confirm or re-bind it',
    'This row’s usage window was last written by a step that could not tell this account’s sign-in from its long-lived token, so nothing proves whose the token is. Nothing was marked and pools keep using it. Answer in ⋯ → Long-lived token.',
    "{account}'s long-lived token is unverified: its usage window can no longer say whose it is — confirm the token is {account}'s, or re-bind it in Manage Agents"];
  ok(zh['This conversation’s token road is unknown — it takes no part in the identity check'] === '这段对话的 token 来路未知，不参与身份判断' && /^身份未验证——/.test(zh['Identity unverified — the usage window can no longer say whose this token is: confirm or re-bind it']),
    'zh says fix r3\'s words: 这段对话的 token 来路未知，不参与身份判断 · 身份未验证——…确认或改绑');
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
  ok(KS.every((k) => zh[k] && ja[k] && ph(zh[k]) === ph(k) && ph(ja[k]) === ph(k)), 'every new word has zh + ja with its placeholders', KS.filter((k) => !(zh[k] && ja[k] && ph(zh[k]) === ph(k) && ph(ja[k]) === ph(k))));
  let MA = null, why = null;
  try {
    const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
    const stub = { name: 'stub', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
    const out = await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/manage-agents.js')], bundle: true, write: false, format: 'iife', globalName: 'MA', platform: 'browser', target: 'es2022', logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stub] });
    const vm = require('node:vm');
    const el = () => new Proxy(function () { }, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : el()), apply: () => el(), construct: () => el(), set: () => true });
    const g = { console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, URL, URLSearchParams, TextEncoder, TextDecoder, Intl, Date, Math, JSON, Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect, Error, TypeError, RangeError, Array, Object, String, Number, Boolean, RegExp, encodeURIComponent, decodeURIComponent, structuredClone, performance, fetch: async () => ({ ok: false, json: async () => ({}) }), localStorage: { getItem: () => null, setItem() { }, removeItem() { } }, navigator: { userAgent: 'node', language: 'en' }, location: { href: 'http://x/', search: '', hash: '' } };
    g.document = el(); g.window = g; g.self = g; g.globalThis = g; g.addEventListener = () => { }; g.removeEventListener = () => { }; g.dispatchEvent = () => true;
    vm.createContext(g);
    vm.runInContext(out.outputFiles[0].text, g, { timeout: 5000 });
    MA = g.MA;
  } catch (e) { why = String((e && e.message) || e).slice(0, 200); }
  if (!MA || typeof MA.oatTagHtml !== 'function') ok(false, 'the real manage-agents module renders under a fake DOM', why);
  else {
    const rowOf = (x) => ({ type: 'subscription', oat: true, oatDaysLeft: 300, ...x });
    const tag = MA.oatTagHtml(rowOf({ oatIdentity: 'mismatch', oatIdentityOther: 'Work <b>Max</b>' }));
    ok(tag.includes(DOOR) && /color:var\(--red/.test(tag) && /acct-oat-foreign/.test(tag) && /Work &lt;b&gt;Max&lt;\/b&gt;/.test(tag) && !/<b>Max/.test(tag), 'a foreign token\'s row says it in the owner\'s words with the door, red, the matched row named (escaped)', tag);
    ok(/⋯ → Long-lived token/.test(tag), '…its tooltip names where the door is (⋯ → Long-lived token)');
    const hint = MA.oatTagHtml(rowOf({ oatIdentity: 'hint', oatIdentityOther: 'Held <i>x</i>' }));
    ok(/acct-oat-ask/.test(hint) && /This long-lived token looks like Held &lt;i&gt;x&lt;\/i&gt;’s — confirm or re-bind it/.test(hint) && /color:var\(--warn-text\)/.test(hint) && !/--red/.test(hint) && /nothing was marked/.test(hint), 'F4: a hint\'s row says it in amber (no red — nothing is marked), naming the row (escaped), its tooltip says why', hint);
    const anc = MA.oatTagHtml(rowOf({ oatIdentity: 'anchor' }));
    ok(/acct-oat-ask/.test(anc) && /Its usage window moved away from the one this token was confirmed with/.test(anc), 'F6: an anchor ask\'s row says the window moved', anc);
    const unv = MA.oatTagHtml(rowOf({ oatIdentity: 'unverified' }));
    ok(/acct-oat-unverified/.test(unv) && /· Identity unverified/.test(unv) && /over a day/.test(unv), 'F8: an unjudged token\'s row says Identity unverified (身份未验证), its tooltip where the doors are', unv);
    ok(!MA.oatTagHtml(rowOf({})).includes('another account') && !MA.oatTagHtml(rowOf({ oatIdentity: 'confirmed' })).includes('another account') && !MA.oatTagHtml(rowOf({ oatIdentity: 'pending' })).includes('another account'), 'a healthy / confirmed / unjudged-and-young token row says nothing of it');
    ok(/long-lived token expired/.test(MA.oatTagHtml(rowOf({ oatDaysLeft: 0, oatIdentity: 'mismatch' }))), 'an EXPIRED token says expired first (it stops sessions)');
    ok(MA.oatTagHtml(rowOf({ oatIdentity: 'mismatch' }), { local: false }) === '' && MA.oatForeign(rowOf({ oatIdentity: 'mismatch' })) === true && MA.oatForeign(rowOf({ oat: false, oatIdentity: 'mismatch' })) === false
      && MA.oatIdentityAsk(rowOf({ oatIdentity: 'hint' })) && MA.oatIdentityAsk(rowOf({ oatIdentity: 'anchor' })) && !MA.oatIdentityAsk(rowOf({ oatIdentity: 'mismatch' })) && MA.oatUnverified(rowOf({ oatIdentity: 'unverified' })),
    'a host section stays quiet (the local roster says it); oatForeign = token + mismatch; oatIdentityAsk = hint / anchor; oatUnverified');
    // fix r3: the LOST identity's ask (「身份未验证」 + the answer door) and a conversation whose road is unknown
    const lostRow = MA.oatTagHtml(rowOf({ oatIdentity: 'lost' }));
    ok(/acct-oat-ask/.test(lostRow) && /Identity unverified — the usage window can no longer say whose this token is: confirm or re-bind it/.test(lostRow) && !/--red/.test(lostRow) && /could not tell this account’s sign-in from its long-lived token/.test(lostRow) && MA.oatIdentityAsk(rowOf({ oatIdentity: 'lost' })),
      'fix r3: a LOST identity\'s row says 「身份未验证」 with the ask — amber, the owner\'s answer door, never red (nothing is marked)', lostRow);
    const roadRow = MA.oatTagHtml(rowOf({ oatIdentity: 'unknown-road' }));
    ok(/acct-oat-unknown-road/.test(roadRow) && /This conversation’s token road is unknown — it takes no part in the identity check/.test(roadRow) && /records the road/.test(roadRow) && MA.oatUnknownRoad(rowOf({ oatIdentity: 'unknown-road' })) && !MA.oatIdentityAsk(rowOf({ oatIdentity: 'unknown-road' })),
      'fix r3 F-R1: a token read only by a conversation whose road is unknown says so on its row (its next start records the road) — no ask, no answer door', roadRow);
    const ex = MA.acctExtrasHtml({ login: '', oat: tag, oatWarn: true });
    ok(/^<span class="acct-key-extra"> <span class="acct-blocked-hint acct-oat-foreign"/.test(ex), 'it rides the row\'s HARD extras bucket (beside the login chip, never folded with the soft tags)', ex.slice(0, 120));
  }
  const ma = read('src/lib/manage-agents.js');
  ok(/oatWarn: !!oatTag && \(a\.oatDaysLeft <= 30 \|\| oatForeign\(a\) \|\| oatIdentityAsk\(a\)\)/.test(ma), 'WIRING: the roster render puts a foreign token AND an open ask in the hard bucket (unverified stays soft)');
  ok(/body\.querySelector\('#oat-rebind'\)/.test(ma) && /`\/api\/accounts\/\$\{enc\}\/oat\/rebind`, \{ method: 'POST'/.test(ma) && /id="oat-rebind-pick"/.test(ma) && /mint\.reason === 'anchor_mismatch'/.test(ma), 'WIRING: the token dialog\'s re-bind door posts /oat/rebind with the picked row; the mint\'s anchor_mismatch has its words');
  ok(/const rebindTo = \(oatForeign\(a\) \|\| oatIdentityAsk\(a\) \|\| oatUnverified\(a\)\) \?/.test(ma) && /id="oat-mine"/.test(ma) && /id="oat-not-mine"/.test(ma) && /`\/api\/accounts\/\$\{enc\}\/oat\/identity`, \{ method: 'POST'[^\n]*JSON\.stringify\(\{ answer \}\)/.test(ma),
    'WIRING: an ask / an unverified token gets the re-bind picker; an ask gets the owner\'s two answers (mine / not mine), posted to /oat/identity');
}

console.log('§6 wiring census + RED controls');
/** the engine's reading hook: handed the SLOT, its value unused, no producer key ever assigned from it */
const hookCensus = (src) => {
  const lines = src.split('\n');
  const calls = lines.map((l, i) => [l, i]).filter(([l]) => /oatIdentity\.onReading\(/.test(l) && !/^\s*(\/\/|\*)/.test(l));
  const rekey = lines.filter((l) => /\b(key|writeKey|slotKey|target)\s*=[^=>]/.test(l) && /oatIdentity/.test(l));
  const shapeOk = calls.length === 1 && /^\s*const postCheck = \(\) => \{ if \(win\) \{ try \{ oatIdentity\.onReading\(slotKey, \{ window: win, /.test(calls[0][0]) && /\} catch \{ \} \} \};\s*$/.test(calls[0][0]);
  const handsOver = calls.length === 1 && /viaToken: \(\) => road\(\)\.viaToken, gen: \(\) => road\(\)\.gen, eligible: witness, sid: session\._webuiId \|\| null \}/.test(calls[0][0]); // fix r3: ONE road answer (readingRoad) for the ring and the check
  const before = calls.length === 1 ? lines.slice(calls[0][1] + 1, calls[0][1] + 6).join('\n') : '';
  // fix r2 F-C: it runs AFTER the guard and the witness ring — at each of the three exits a reading with a window takes
  const runs = (src.match(/\bpostCheck\(\);/g) || []).length;
  const after = /\{ outcome: 'archived', producer: producer\(\) \}\);\n\s+postCheck\(\);\n\s+return;/.test(src) && /if \(r\.unknownType\) \{ global\.__vsEvent\?\.\('rate-limit-event-unknown-type', r\.unknownType\); postCheck\(\); return; \}/.test(src)
    && /noteApiDerivedWindow\(writeKey, witnessEv, session, \{ outcome: 'write', producer: producer\(\) \}\);\n\s+postCheck\(\);/.test(src);
  return { calls: calls.length, rekey: rekey.length, shapeOk, handsOver, guardNext: /if \(win\) \{\n\s+const target = guardReadingTarget\(key, win, /.test(before), runs, after };
};
{
  const eng = read('src/server/usage-pool-engine.js');
  const c = hookCensus(eng);
  ok(c.calls === 1 && c.shapeOk && c.handsOver && c.rekey === 0 && c.guardNext && c.runs === 3 && c.after, 'the engine hands the check ONE call: the slot + the window + whether / WHICH token + the witness eligibility; its answer unused; the guard and the write are unchanged — and it runs AFTER them and the witness ring, at each of the three exits (archived, unknown type, filed — fix r2 F-C)', c);
  const planted = eng.replace(/    const postCheck = \(\) => \{ if \(win\) \{ try \{ oatIdentity\.onReading\(/, "    key = (oatIdentity.onReading(slotKey, { window: win }).others || [])[0] || key;\n    const postCheck = () => { if (win) { try { oatIdentity.onReading(");
  const early = eng.replace(/(    const postCheck = [^\n]*\n)/, '$1    postCheck();\n');
  const ce = hookCensus(early);
  ok(early !== eng && ce.runs === 4, 'RED control (the check run BEFORE the guard again — the F-C order): a fourth call site is caught', { runs: ce.runs });
  const cp = hookCensus(planted);
  ok(planted !== eng && (cp.rekey > 0 || cp.calls !== 1), 'RED control (a reading re-attributed): a planted line filing the reading on the row the check named is caught', cp);
  ok(/const oatIdentity = require\('\.\/oat-identity\.js'\)\.create\(\{ accounts: \(\) => accounts, todos: \(\) => getUserTodos\(\), windows: \(\) => establishedWindows\(\),\n  groups: \(id\) => usageIdentityAccountIds\(id\), k: \(\) => API_WITNESS_K,/.test(eng) && /function tokenSpentBy\(session, key\) \{\n  if \(session && session\._accountId === key && session\._billingHow === 'oat'\) return true;\n  try \{ return !!accounts\.readSubCreds\(key\)\?\.oatFile; \}/.test(eng),
    'the ONE orchestrator is built in the engine over the established windows, the For-you store, the identity GROUPS (F3) and the witness ring\'s K (F2); "spends the token" = an env-token spawn of that row or our token file in the member folder');
  ok(/if \(road === 'env'\) return session\._accountId === key && Number\(session\._oatGen\) > 0 \? Number\(session\._oatGen\) : null;\n  if \(road !== 'file'\) return null;\n  const seen = session\._oatFileGen, gen = oatFileGenOf\(key\);\n  return seen && seen\.key === key && gen != null && seen\.gen === gen \? gen : null;/.test(eng),
    'F1 tokenGenOf: the env road answers the generation stamped at spawn; the file road only when the file the last turn end saw is the file now; any other road vouches for nothing');
  ok(/  session\._turnReadingSlot = null;\n  try \{ noteOatFileGen\(session\); \} catch \{ \}/.test(eng) && /session\._oatFileGen = null; \/\/ lane oat-identity-fix: a backlog's turn end/.test(eng),
    'F1: a live turn end stamps the token file the next turn starts on; a backlog\'s turn end vouches for nothing');
  ok(/if \(moved\) \{ try \{ oatIdentity\.onReanchor\(key, \{ window: stamp, source: 'window-moved', independent: runProducer === 'login' \}\); \} catch \{ \} \}/.test(eng) && /oatIdentity\.onReanchor\(key, \{ window: stamp, source: 'renewal-panel', independent: producer === 'login' \}\)/.test(eng)
    && (eng.match(/noteApiDerivedWindow\((slotKey|writeKey), witnessEv, session, \{ outcome: '\w+', producer: producer\(\) \}\)/g) || []).length === 3,
  'F6 / fix r2 F-A: both re-anchor doors (the K-run\'s "window moved", the renewal panel) tell the check whether the move was the row\'s LOGIN; every witness candidate names who produced it (login · oat:<gen>)');
  const ur = read('src/usage-routes.js');
  ok(/windowStamp\.writeWindowStamp\(USAGE_CACHE_DIR, key, stamp, runProducer\);/.test(eng) && /if \(!windowStamp\.writeWindowStamp\(USAGE_CACHE_DIR, key, stamp, producer\)\) return false;/.test(eng)
    && (ur.match(/windowStamp\.writeWindowStamp\(USAGE_CACHE_DIR, key, [^\n]*, producer\);/g) || []).length === 2 && !/producer: runProducer \}|verifiedBy: 'renewal-panel', n: 1, sessionId: null, \.\.\.\(producer|provisional: true, \.\.\.\(producer|'api-phase', \.\.\.\(producer/.test(eng + ur),
  'fix r2 F-A / r3: EVERY live `.window-` writer hands the ONE writer its producer — the witness ring (the writer carries the login identity), the renewal panel, the verified and the isolated ⟳ panel; no stamp spells its own producer (the census of WHO writes is §9a, derived from the source)');
  const wc = read('src/ws-create.js');
  ok(/_oatRoad: oatEnvRoad \? 'env' : \(spawnAccount && !data\.hostId \? 'file' : null\),/.test(wc) && /_oatGen: oatEnvRoad && Number\(spawnAccount\.oatGen\) > 0 \? Number\(spawnAccount\.oatGen\) : null,/.test(wc)
    && /const oatEnvRoad = !!spawnAccount && !spawnAccount\._hostSubReady && \(data\.hostId \? spawnAccount\.secret\?\.var === 'CLAUDE_CODE_OAUTH_TOKEN' : !!spawnAccount\.localEnv\?\.CLAUDE_CODE_OAUTH_TOKEN\);/.test(wc),
  'F1: ws-create stamps WHICH token the process carries: the env road\'s generation for life, a local creds dir = the file road, a remote creds dir = none');
  const acc = read('src/accounts.js');
  ok((acc.match(/oatGen: a\.oatMintedAt \|\| null/g) || []).length === 3 && /a\.oatCheck = \{ state: 'pending', since: a\.oatMintedAt, gen: a\.oatMintedAt \};/.test(acc) && /b\.oatCheck = \{ state: 'pending', since: Date\.now\(\), gen: b\.oatMintedAt \};/.test(acc),
    'F1: every spawn that carries the token names its generation; a save arms the check with it; a re-bind keeps it (the same token)');
  const sv = read('server.js'), ar = read('src/server/account-usage-routes.js');
  ok(/repairIdentityAnchors, oatAnswer, oatIdentityAttach, oatRebind, \/\/ B-855a/.test(sv) && /engine: \{ oatAnswer, oatIdentityAttach, oatRebind, clearSealedOrders, /.test(sv) && /const oatIdentityAttach = \(\) => oatIdentity\.attach\(\);/.test(eng) && /const oatRebind = \(fromId, toId\) => oatIdentity\.rebind\(fromId, toId\);/.test(eng) && /const oatAnswer = \(id, ans\) => oatIdentity\.answer\(id, ans\);/.test(eng),
    'server.js hands the orchestrator\'s three doors (attach, re-bind, the owner\'s answer) to the account routes as engine functions (no new line)');
  ok(/if \(typeof engine\.oatIdentityAttach === 'function'\) engine\.oatIdentityAttach\(\);/.test(ar) && /engine\.oatRebind\(req\.params\.id, to\)/.test(ar), 'the account routes wire the store hook once the store exists, and re-bind through the orchestrator');
  const rb = ar.slice(ar.indexOf("app.post('/api/accounts/:id/oat/rebind'"), ar.indexOf("app.post('/api/accounts/:id/oat/rebind'") + 900);
  ok(/^app\.post\('\/api\/accounts\/:id\/oat\/rebind', async \(req, res\) => \{\n  if \(isAgentBearer\(req\)\) return res\.status\(403\)/.test(rb) && /sweepHostTokenCopies\(req\.params\.id\);/.test(rb), 'the re-bind route refuses an agent\'s token first and sweeps the moved token\'s host copies', rb.slice(0, 200));
  const ia = ar.slice(ar.indexOf("app.post('/api/accounts/:id/oat/identity'"), ar.indexOf("app.post('/api/accounts/:id/oat/identity'") + 700);
  ok(/^app\.post\('\/api\/accounts\/:id\/oat\/identity', \(req, res\) => \{\n  if \(isAgentBearer\(req\)\) return res\.status\(403\)/.test(ia) && /engine\.oatAnswer\(req\.params\.id, answer\)/.test(ia), 'the owner\'s-answer route refuses an agent\'s token FIRST (human only) and answers through the orchestrator', ia.slice(0, 200));
  ok(/if \(!info\.oatFile\) return true;\n    \/\/ the post-check found this token[^\n]*\n    \/\/[^\n]*\n    if \(this\.oatCheckOf\(id\)\?\.state === 'mismatch'\) return false;/.test(acc), 'the placement gate is the F5 door (_placeable), AFTER the login-file test: only where the pool would spend the token — a hint never reaches it');
  ok(/moveOat\(fromId, toId\) \{[\s\S]{0,1600}b\.oatEnc = a\.oatEnc;/.test(acc) && !/moveOat\(fromId, toId\) \{[\s\S]{0,1600}this\._dec\(/.test(acc.slice(acc.indexOf('moveOat(fromId, toId) {'), acc.indexOf('moveOat(fromId, toId) {') + 1700)), 're-bind moves the SEALED blob — the token is never decrypted to move it');
  // mutant orchestrators, over a fresh store: the mismatch must be SAID and the token KEPT
  const ORCH_SRC = read('src/server/oat-identity.js');
  const judge = async (mod) => {
    const d = fs.mkdtempSync(path.join(tmp, 'mut-'));
    const a2 = new AccountManager({ dataDir: path.join(d, 'data') });
    const t2 = new UserTodoManager({ dataDir: path.join(d, 'todos') });
    const x = a2.createSubscription({ name: 'X' }).id, y = a2.createSubscription({ name: 'Y' }).id;
    const t = tok('X');
    a2.setOat(x, t);
    const w2 = { [x]: { ...win(THIRD), at: 1, source: 'on-demand' }, [y]: { ...win(OWN), at: 1, source: 'on-demand' } };
    const o = mod.create({ accounts: a2, todos: () => t2, windows: () => w2, k: K, log: () => { }, journal: () => { } });
    const seen = [];
    for (let i = 0; i < K; i++) { try { seen.push(o.onReading(x, { window: win(OWN), at: Date.now(), viaToken: true, gen: a2.oatCheckOf(x)?.gen, eligible: ELIGIBLE }).verdict); } catch { seen.push('threw'); } }
    const row = a2.list().accounts.find((r) => r.id === x) || {};
    return { said: t2._state.items.filter((i) => i.status === 'open').length === 1 && row.oatIdentity === 'mismatch', kept: a2.getOat(x) === t, firstMarked: seen[0] === 'mismatch', seen };
  };
  const base = await judge(OI);
  ok(base.said && base.kept && !base.firstMarked, 'the shipped orchestrator: the mismatch is said (For you + the row) and the token kept — only after K readings', base);
  const unsaid = ORCH_SRC.replace('      const todoId = fileNotice(key, v);\n', '      const todoId = null;\n').replace("A().setOatCheck(key, { state: 'mismatch',", "A().setOatCheck(key, { state: 'pending',");
  const dropped = ORCH_SRC.replace('      const todoId = fileNotice(key, v);\n', '      const todoId = fileNotice(key, v);\n      A().clearOat(key);\n');
  const oneShot = ORCH_SRC.replace("{ now: now(), k: K() }", '{ now: now(), k: 1 }');
  ok(unsaid !== ORCH_SRC && dropped !== ORCH_SRC && oneShot !== ORCH_SRC, 'RED controls apply');
  const mu = await judge(compileAs('src/server/oat-identity.js', unsaid));
  const md = await judge(compileAs('src/server/oat-identity.js', dropped));
  const m1 = await judge(compileAs('src/server/oat-identity.js', oneShot));
  console.log(`    RED controls: a mismatch that goes unsaid ⇒ said ${mu.said}; a token dropped on mismatch ⇒ kept ${md.kept}; a one-reading mark (no K-run) ⇒ first reading marked ${m1.firstMarked}`);
  ok(!mu.said, 'RED control: a mismatch that goes unsaid (no notice, no mark) is caught', mu);
  ok(!md.kept, 'RED control: a token dropped on mismatch is caught', md);
  ok(m1.firstMarked, 'RED control: an orchestrator that marks on ONE reading (no K-run, F2) is caught', m1);
}

console.log('§7 the REAL producer (usage-pool-engine recordRateLimitEvent) — F1 / F2 end to end');
{
  const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
  const HR = 3600;
  const slot = (d, h) => (Math.floor(nowS / HR) + d * 24 + h) * HR; // weekly resets sit on hour boundaries (production 15/15)
  const W_A = slot(3, 5), W_B = slot(4, 9), W_C = slot(5, 1), W_X = slot(1, 3);
  const ev = (resetsAt, u) => ({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: u, resets_at: resetsAt, resetsAt } });
  const quiet = () => { const o = console.log, w = console.warn; const lines = []; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push('W ' + a.join(' ')); return () => { console.log = o; console.warn = w; return lines; }; };
  function world() {
    const root = fs.mkdtempSync(path.join(tmp, 'eng-'));
    const dd = path.join(root, 'data');
    const a = new AccountManager({ dataDir: dd });
    const cd = path.join(dd, 'usage-cache'); fs.mkdirSync(cd, { recursive: true });
    const td = new UserTodoManager({ dataDir: path.join(root, 'todos'), expirySweepMs: 0 });
    const sessions = new Map();
    const writeCache = (id, r) => fs.writeFileSync(path.join(cd, id + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60000, source: 'cli-usage', sevenDay: { utilization: 0.1, resetsAt: r } }));
    const stamp = (id, w) => fs.writeFileSync(path.join(cd, readingLag.windowSidecarName(id)), JSON.stringify({ at: Date.now() - 3600e3, source: 'on-demand', fiveHour: null, scoped: {}, ...w }));
    const login = (id) => fs.writeFileSync(path.join(a.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } }), { mode: 0o600 });
    const mkEngine = () => engMod.create({
      app: { get() { }, post() { }, put() { }, delete() { }, patch() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cd, activeSessions: sessions,
      wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => a, getHosts: () => null,
      getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null, getUserTodos: () => td,
    });
    let n = 0;
    // a conversation as ws-create spawns it: the env road carries its token's generation for life (resolveForSpawn's oatGen)
    const envSess = (id) => { const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-e-' + (++n), claudeSessionId: 'cid-e-' + n, _accountId: id, _billingHow: 'oat', _oatRoad: 'env', _oatGen: a.get(id).oatMintedAt, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: 'e' + n }; sessions.set(s._webuiId, s); return s; };
    const poolSess = (P) => { const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-p-' + (++n), claudeSessionId: 'cid-p-' + n, _accountId: P, _billingHow: 'local-env', _oatRoad: 'file', _oatGen: null, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: 'p' + n }; sessions.set(s._webuiId, s); return s; };
    const st = (id) => a.oatCheckOf(id)?.state || null;
    const open = () => td._state.items.filter((i) => i.sessionKey === OI.INBOX_KEY && i.status === 'open');
    // a conversation as boot-restore rebuilds it (no _oatRoad / _oatGen / _billingHow); a conversation on the row's LOGIN
    const restoredSess = (id) => { const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-r-' + (++n), claudeSessionId: 'cid-r-' + n, _accountId: id, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: 'r' + n }; sessions.set(s._webuiId, s); return s; };
    const loginSess = (id) => { const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'sess-l-' + (++n), claudeSessionId: 'cid-l-' + n, _accountId: id, _billingHow: 'local-env', _oatRoad: 'file', _oatGen: null, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), pty: { write() { } }, name: 'l' + n }; sessions.set(s._webuiId, s); return s; };
    const sidecar = (id, which = 'window') => { try { return JSON.parse(fs.readFileSync(path.join(cd, which === 'window' ? readingLag.windowSidecarName(id) : readingLag.apiWindowSidecarName(id)), 'utf8')); } catch { return null; } };
    return { a, td, cd, writeCache, stamp, login, mkEngine, envSess, poolSess, restoredSess, loginSess, sidecar, st, open };
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  {
    // F1a: a re-mint after a mark is never re-marked by the conversation still running on the FOREIGN token
    const w = world(), am3 = w.a, done = quiet();
    const A = am3.createSubscription({ name: 'Work' }).id, B = am3.createSubscription({ name: 'Other' }).id;
    w.writeCache(A, W_A); w.stamp(A, { sevenDay: W_A }); w.writeCache(B, W_B); w.stamp(B, { sevenDay: W_B });
    am3.setOat(A, tok('T1')); // T1 is really Other's
    const eng = w.mkEngine(); eng.oatIdentityAttach();
    const s1 = w.envSess(A);
    for (let i = 0; i < K; i++) { eng.recordRateLimitEvent(s1, ev(W_B, 0.2 + i / 100)); eng.noteTurnEnd(s1); }
    const first = w.st(A), open1 = w.open().length;
    await sleep(3);
    am3.setOat(A, tok('T2')); // the door the notice names: re-mint while signed in as Work
    for (let i = 0; i < K + 1; i++) { eng.recordRateLimitEvent(s1, ev(W_B, 0.3 + i / 100)); eng.noteTurnEnd(s1); } // s1 still runs on T1
    const afterStale = w.st(A), openStale = w.open().length;
    const s2 = w.envSess(A); // spawned on T2
    const vs = []; const hook = eng.oatIdentity.onReading; eng.oatIdentity.onReading = (k, r) => { const x = hook(k, r); vs.push(x.verdict); return x; };
    eng.recordRateLimitEvent(s2, ev(W_A, 0.05)); eng.noteTurnEnd(s2);
    const own1 = { v: vs[vs.length - 1], st: w.st(A) };
    // T1's K foreign readings re-anchored Work's window onto Other's phase (the witness ring's own K-run — the slot law,
    // unchanged); that stamp names its producer (T1's oat:<gen>) and CARRIES the login identity it replaced (fix r2), so
    // T2's first reading is judged against Work's own window — never against the previous token's
    const sc = JSON.parse(fs.readFileSync(path.join(w.cd, readingLag.windowSidecarName(A)), 'utf8'));
    const realNow = Date.now; Date.now = () => realNow() + 6000; // past the established-window memo (5 s)
    try { w.stamp(A, { sevenDay: W_A, at: Date.now(), source: 'on-demand', producer: 'login' }); eng.recordRateLimitEvent(s2, ev(W_A, 0.06)); } finally { Date.now = realNow; }
    const lines = done();
    ok(sc.sevenDay === W_B && /^oat:\d+$/.test(sc.producer) && sc.login && sc.login.sevenDay === W_A, 'fix r2 F-A: the foreign token\'s K-run re-stamped the guard\'s window with ITS producer (oat:<gen>) and carried Work\'s identity', { sevenDay: sc.sevenDay === W_B, producer: sc.producer, login: sc.login });
    ok(first === 'mismatch' && open1 === 1, `F1a setup: T1 (Other's) on Work is marked after ${K} eligible readings, ONE notice`, { first, open1 });
    ok(afterStale === 'pending' && openStale === 0 && lines.some((l) => /Work: a reading from a conversation not on the token saved now/.test(l)), 'F1a: after the re-mint, the conversation STILL on T1 never re-marks T2 (stale-token, journaled once; the notice stays resolved)', { afterStale, openStale });
    ok(own1.v === 'confirmed' && own1.st === 'confirmed', 'F1a (tightened, fix r2): …a conversation spawned on T2 is judged against the row\'s LOGIN identity (carried through T1\'s re-stamp) — confirmed on its FIRST reading, never a suspect', own1);
    ok(w.st(A) === 'confirmed' && w.open().length === 0, 'F1a: …a later ⟳ panel stamp of the same window changes nothing (judged once; nothing filed)', w.st(A));
  }
  {
    // F1b: a WRONG renewal is never confirmed by the conversation still running on the RIGHT old token
    const w = world(), am3 = w.a, done = quiet();
    const C = am3.createSubscription({ name: 'Third' }).id, B = am3.createSubscription({ name: 'Other' }).id;
    w.writeCache(C, W_C); w.stamp(C, { sevenDay: W_C }); w.writeCache(B, W_B); w.stamp(B, { sevenDay: W_B });
    am3.setOat(C, tok('T3'));
    const eng = w.mkEngine(); eng.oatIdentityAttach();
    const s3 = w.envSess(C);
    eng.recordRateLimitEvent(s3, ev(W_C, 0.3)); eng.noteTurnEnd(s3);
    const first = w.st(C);
    await sleep(3);
    am3.setOat(C, tok('T4')); // signed in as Other by mistake: T4 is Other's
    for (let i = 0; i < K; i++) { eng.recordRateLimitEvent(s3, ev(W_C, 0.31 + i / 100)); eng.noteTurnEnd(s3); }
    const afterStale = w.st(C);
    const s4 = w.envSess(C);
    const seen = [];
    for (let i = 0; i < K; i++) { eng.recordRateLimitEvent(s4, ev(W_B, 0.6 + i / 100)); seen.push(w.st(C)); eng.noteTurnEnd(s4); }
    done();
    ok(first === 'confirmed' && afterStale === 'pending', 'F1b: the old RIGHT token\'s conversation never confirms the wrong renewal (stale-token)', { first, afterStale });
    ok(seen.slice(0, K - 1).every((x) => x === 'pending') && seen[K - 1] === 'mismatch' && w.open().length === 1, `F1b: …the renewal's own conversation marks it after ${K} turns (one reading per turn reaches the slot — the guard re-files the rest of a foreign turn)`, seen);
  }
  {
    // THE FILE ROAD: a pooled conversation on a member whose folder holds OUR materialized token file (real file, real mark)
    const w = world(), am3 = w.a, done = quiet();
    const X = am3.createSubscription({ name: 'Login Member' }).id; w.login(X);
    const Y = am3.createSubscription({ name: 'Token Member' }).id;
    w.writeCache(X, W_X); w.stamp(X, { sevenDay: W_X }); w.writeCache(Y, W_A); w.stamp(Y, { sevenDay: W_A });
    am3.oatFileCaps = () => ({ known: true, ok: true, cli: '2.1.296' });
    am3.get(Y).oatShape = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' }; // the shape a login of Y left (the file needs it)
    am3.setOat(Y, tok('Y1')); await am3.oatFileSettled(Y);
    const pa1 = am3.readSubCreds(Y);
    ok(pa1.oatFile === true && pa1.oatFileGen === am3.get(Y).oatMintedAt, 'FILE road setup: Y\'s folder holds OUR token file; parseAuth names its generation (the mark)', { oatFile: pa1.oatFile, gen: pa1.oatFileGen });
    const P = am3.createPool({ name: 'Pool', members: [X, Y] }).id;
    am3.setPoolTarget(P, Y); am3.updatePool(P, { hot: true }); am3.get(P).auto = false; am3._save();
    const eng = w.mkEngine(); eng.oatIdentityAttach();
    const s = w.poolSess(P); am3.ensureSessionPoolLink(P, s._webuiId, Y, { why: 'spawn' });
    const v = [];
    const hook = eng.oatIdentity.onReading; eng.oatIdentity.onReading = (k, r) => { const x = hook(k, r); v.push(x.verdict); return x; };
    eng.recordRateLimitEvent(s, ev(W_A, 0.1)); // its first turn: no turn end has seen which file it read
    const t1 = { v: v.slice(), st: w.st(Y) };
    eng.noteTurnEnd(s);
    eng.recordRateLimitEvent(s, ev(W_A, 0.11));
    const t2 = { v: v.slice(), st: w.st(Y) };
    ok(t1.v[0] === 'stale-token' && t1.st === 'pending', 'FILE road: the first turn (no turn end has seen the file it read) vouches for nothing', t1);
    ok(t2.v[1] === 'confirmed' && t2.st === 'confirmed', '…the next turn reads the file the turn end saw ⇒ its reading judges (confirmed)', t2);
    await sleep(3);
    am3.setOat(Y, tok('Y2')); await am3.oatFileSettled(Y); // a re-mint IN PLACE — mid-turn for s
    const gen2 = am3.get(Y).oatMintedAt;
    eng.recordRateLimitEvent(s, ev(W_B, 0.12)); // the in-flight turn still runs on the file it started with
    const t3 = { v: v[v.length - 1], st: w.st(Y), fileGen: am3.readSubCreds(Y).oatFileGen === gen2 };
    eng.noteTurnEnd(s);
    eng.recordRateLimitEvent(s, ev(W_A, 0.13));
    const t4 = { v: v[v.length - 1], st: w.st(Y) };
    done();
    ok(t3.fileGen && t3.v === 'stale-token' && t3.st === 'pending', 'FILE road: a token file rewritten INSIDE the turn ⇒ that turn\'s readings say nothing about the new token (its foreign-looking reading never suspects it)', t3);
    ok(t4.v === 'confirmed' && t4.st === 'confirmed', '…the turn after (the CLI re-reads its credential) judges the new token', t4);
  }
  for (const withAnchor of [false, true]) {
    // F2: a hot switch onto a FRESHLY minted member — the in-flight reading of the member it left never judges the new token
    const w = world(), am3 = w.a, done = quiet();
    const X = am3.createSubscription({ name: 'Member X' }).id; w.login(X);
    const Y = am3.createSubscription({ name: 'Member Y' }).id; // no login: the pool spends its token FILE; no established window yet
    w.writeCache(X, W_X); w.stamp(X, { sevenDay: W_X }); w.writeCache(Y, W_A);
    am3.oatFileCaps = () => ({ known: true, ok: true, cli: '2.1.296' });
    am3.get(Y).oatShape = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
    am3.setOat(Y, tok('TY')); await am3.oatFileSettled(Y);
    if (withAnchor) am3.setOatAnchor(Y, { sevenDay: W_A, scoped: {}, how: 'owner-confirmed', at: Date.now() });
    const P = am3.createPool({ name: 'Pool', members: [X, Y] }).id;
    am3.setPoolTarget(P, X); am3.updatePool(P, { hot: true }); am3.get(P).auto = false; am3._save();
    const eng = w.mkEngine(); eng.oatIdentityAttach();
    const s = w.poolSess(P); am3.ensureSessionPoolLink(P, s._webuiId, X, { why: 'spawn' });
    eng.recordRateLimitEvent(s, ev(W_X, 0.4)); eng.noteTurnEnd(s);
    await sleep(3);
    am3.ensureSessionPoolLink(P, s._webuiId, Y, { why: 'per-session-switch' });
    s._oatFileGen = { key: Y, gen: am3.get(Y).oatMintedAt, at: Date.now() }; // the generation passes (as if a turn end had seen Y's file) — the witness rule alone must hold
    const v = []; const hook = eng.oatIdentity.onReading; eng.oatIdentity.onReading = (k, r) => { const x = hook(k, r); v.push({ k: k === Y ? 'Y' : k === X ? 'X' : k, v: x.verdict, el: r.eligible && r.eligible.why }); return x; };
    for (let i = 0; i < K; i++) eng.recordRateLimitEvent(s, ev(W_X, 0.41 + i / 100)); // responses to requests made with X's credentials, arriving after the re-point
    const y = w.st(Y), run = (am3.oatCheckOf(Y)?.run || []).length;
    ok(y === 'pending' && run === 0 && v[0] && v[0].k === 'Y' && v[0].v === 'ineligible' && /re-pointed/.test(v[0].el) && am3._placeable('claude', Y) !== false && w.open().length === 0,
      `F2${withAnchor ? 'b' : 'a'}: the hot switch's in-flight reading of X lands on Y's slot and is INELIGIBLE (a re-point inside the horizon) — no suspect, no mark, Y stays placeable (${withAnchor ? 'Y holds an owner-confirmed anchor' : 'Y has no anchor yet'})`, { y, run, v: v.slice(0, 2) });
    // positive control: past the shadow horizon the SAME readings are witnesses — the eligibility rule is what held them
    const realNow = Date.now; Date.now = () => realNow() + readingLag.SHADOW_MS + 60e3;
    try {
      const out = [];
      for (let i = 0; i < K; i++) { eng.noteTurnEnd(s); s._oatFileGen = { key: Y, gen: am3.get(Y).oatMintedAt, at: Date.now() }; delete s._turnReadingSlot; eng.recordRateLimitEvent(s, ev(withAnchor ? W_X : W_A, 0.5 + i / 100)); out.push(w.st(Y)); }
      const judged = v.slice(-K).map((x) => x.v);
      ok(withAnchor ? out[K - 1] === 'mismatch' && out.slice(0, K - 1).every((x) => x === 'pending') && JSON.stringify(judged) === JSON.stringify([...Array(K - 1).fill('suspect'), 'mismatch']) : out.every((x) => x === 'pending') && judged.every((x) => x === 'no-anchor'),
        withAnchor ? `F2b positive control: past the horizon, ${K} eligible turns carrying X's window DO mark Y (suspect, suspect, mismatch — the gate is the witness rule, not a blind spot)` : 'F2a positive control: past the horizon Y\'s own readings ARE judged (no anchor, nobody\'s window ⇒ no-anchor, armed)', { out, judged });
    } finally { Date.now = realNow; }
    done();
  }
  console.log('§8 fix r2 — verify r2\'s attacks on the REAL producer: identity only from evidence no generation of the token produced (F-A), the check AFTER the ring (F-C), the lows');
  const tap = (eng) => { const v = []; const o = eng.oatIdentity.onReading; eng.oatIdentity.onReading = (k, r) => { const x = o(k, r); v.push({ k, v: x.verdict }); return x; }; return v; };
  const turns = (eng, s, wv, n, u0 = 0.2) => { for (let i = 0; i < n; i++) { eng.recordRateLimitEvent(s, ev(wv, u0 + i / 1000)); eng.noteTurnEnd(s); } };
  const W_A2 = slot(6, 14), W_L = slot(2, 20);
  {
    // A1 — the notice's own door: a foreign T1 marked on Work, the owner re-mints Work's OWN T2
    const w = world(), am3 = w.a, done = quiet();
    const A = am3.createSubscription({ name: 'Work' }).id, B = am3.createSubscription({ name: 'Other' }).id;
    w.writeCache(A, W_A); w.stamp(A, { sevenDay: W_A }); w.writeCache(B, W_B); w.stamp(B, { sevenDay: W_B });
    am3.setOat(A, tok('A1T1'));
    const eng = w.mkEngine(); eng.oatIdentityAttach(); const v = tap(eng);
    turns(eng, w.envSess(A), W_B, K);
    const t1 = w.st(A), sc = w.sidecar(A);
    await sleep(3); am3.setOat(A, tok('A1T2'));
    const s2 = w.envSess(A), seen = [];
    for (let i = 0; i < K; i++) { eng.recordRateLimitEvent(s2, ev(W_A, 0.05 + i / 1000)); seen.push(w.st(A)); eng.noteTurnEnd(s2); }
    done();
    const t2v = v.slice(-K).map((x) => x.v);
    ok(t1 === 'mismatch' && /^oat:\d+$/.test(sc.producer) && sc.login?.sevenDay === W_A && t2v[0] === 'confirmed' && t2v.slice(1).every((x) => x === 'idle') && !seen.includes('mismatch') && w.st(A) === 'confirmed' && w.open().length === 0,
      'A1 (verify r2 F-A): a foreign T1 marked; the owner re-mints Work\'s OWN T2 (the notice\'s door) ⇒ its FIRST reading confirms against Work\'s login identity (carried through T1\'s re-stamp) — never a suspect, never a mark', { t1, producer: sc.producer, seen, t2v });
  }
  for (const door of ['rebind', 'remint']) {
    // A2 — a token-only row: a foreign T1 hinted (and stamped the row's window); re-bound or re-minted over, then Work's own T2
    const w = world(), am3 = w.a, done = quiet();
    const A = am3.createSubscription({ name: 'Work' }).id, B = am3.createSubscription({ name: 'Other' }).id;
    w.writeCache(A, W_A); w.writeCache(B, W_B); w.stamp(B, { sevenDay: W_B });
    am3.setOat(A, tok('A2T1'));
    const eng = w.mkEngine(); eng.oatIdentityAttach(); const v = tap(eng);
    turns(eng, w.envSess(A), W_B, K + 1);
    const t1 = { ask: am3.oatCheckOf(A)?.ask?.kind, producer: w.sidecar(A)?.producer };
    await sleep(3); if (door === 'rebind') eng.oatRebind(A, B); await sleep(3);
    am3.setOat(A, tok('A2T2'));
    const s2 = w.envSess(A), seen = [];
    for (let i = 0; i < K; i++) { eng.recordRateLimitEvent(s2, ev(W_A, 0.05 + i / 1000)); seen.push(w.st(A)); eng.noteTurnEnd(s2); }
    done();
    const t2v = v.slice(-K).map((x) => x.v);
    ok(t1.ask === 'hint' && /^oat:\d+$/.test(t1.producer) && t2v.every((x) => x === 'no-anchor') && seen.every((x) => x === 'pending'),
      `A2-${door} (verify r2 F-A; the tightened F1a): T1 (Other's) hinted and stamped the token-only row's window as ITS OWN (producer oat:<gen>); the owner ${door === 'rebind' ? 're-binds T1 to Other' : 're-mints over it'} and saves Work's T2 ⇒ T2 finds NO identity: no-anchor ×${K} — never a suspect, never a mark`, { t1, t2v, seen });
  }
  {
    // A3 — the previous token's mint-probe anchor is retired by the re-mint (never promoted to row identity)
    const w = world(), am3 = w.a, done = quiet();
    const A = am3.createSubscription({ name: 'Work' }).id; w.writeCache(A, W_A);
    am3.setOat(A, tok('A3T1'));
    am3.setOatAnchor(A, { sevenDay: W_B, scoped: {}, how: 'owner-confirmed', at: Date.now(), mint: 'om-a3' }); // T1's own probe stated W_B; the owner picked Work
    const eng = w.mkEngine(); eng.oatIdentityAttach(); const v = tap(eng);
    turns(eng, w.envSess(A), W_B, 1);
    const t1 = { st: w.st(A), via: am3.oatCheckOf(A).via };
    await sleep(3); am3.setOat(A, tok('A3T2'));
    const retired = am3.oatAnchorOf(A);
    turns(eng, w.envSess(A), W_A, K, 0.05);
    done();
    ok(t1.st === 'confirmed' && t1.via === 'self' && retired === null && v.slice(-K).every((x) => x.v === 'no-anchor') && w.st(A) === 'pending',
      'A3 (verify r2 F-A): T1\'s mint-probe anchor confirmed T1 only as `self`; the re-mint RETIRES it (never promoted to owner-confirmed row identity) ⇒ T2 finds no identity: no-anchor, never a mark', { t1, retired, v: v.slice(-K).map((x) => x.v) });
  }
  {
    // A4 — the same root on a POOL member (the file road): the pool keeps placing on the re-minted member
    const w = world(), am3 = w.a, done = quiet();
    const X = am3.createSubscription({ name: 'Login Member' }).id; w.login(X);
    const Y = am3.createSubscription({ name: 'Token Member' }).id, B = am3.createSubscription({ name: 'Other' }).id;
    w.writeCache(X, W_X); w.stamp(X, { sevenDay: W_X }); w.writeCache(Y, W_A); w.writeCache(B, W_B); w.stamp(B, { sevenDay: W_B });
    am3.oatFileCaps = () => ({ known: true, ok: true, cli: '2.1.296' });
    am3.get(Y).oatShape = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
    am3.setOat(Y, tok('A4Y1')); await am3.oatFileSettled(Y); // Y1 is Other's
    const P = am3.createPool({ name: 'Pool', members: [X, Y] }).id;
    am3.setPoolTarget(P, Y); am3.updatePool(P, { hot: true }); am3.get(P).auto = false; am3._save();
    const eng = w.mkEngine(); eng.oatIdentityAttach(); const v = tap(eng);
    const s = w.poolSess(P); am3.ensureSessionPoolLink(P, s._webuiId, Y, { why: 'spawn' });
    eng.noteTurnEnd(s); turns(eng, s, W_B, K + 1);
    const y1 = { ask: am3.oatCheckOf(Y)?.ask?.kind, producer: w.sidecar(Y)?.producer };
    await sleep(3); am3.setOat(Y, tok('A4Y2')); await am3.oatFileSettled(Y);
    eng.noteTurnEnd(s); turns(eng, s, W_A, K, 0.05);
    done();
    ok(y1.ask === 'hint' && /^oat:\d+$/.test(y1.producer) && v.slice(-K).every((x) => x.v === 'no-anchor') && w.st(Y) === 'pending' && am3._placeable('claude', Y) !== false,
      'A4 (verify r2 F-A, the FILE road): a pool member\'s foreign Y1 hinted; the owner re-mints Y\'s own Y2 ⇒ its pooled turns find no identity (no-anchor) — never a mark, the pool keeps placing there', { y1, v: v.slice(-K).map((x) => x.v), placeable: am3._placeable('claude', Y) });
  }
  {
    // C1 — a plan change of the row's OWN account, first seen through its token while the check is PENDING
    const w = world(), am3 = w.a, done = quiet();
    const A = am3.createSubscription({ name: 'Work' }).id;
    w.writeCache(A, W_A); w.stamp(A, { sevenDay: W_A });
    am3.setOat(A, tok('C1'));
    const eng = w.mkEngine(); eng.oatIdentityAttach(); const v = tap(eng);
    const s = w.envSess(A), seen = [];
    for (let i = 0; i < K + 2; i++) { eng.recordRateLimitEvent(s, ev(W_A2, 0.4 + i / 1000)); seen.push(w.st(A)); eng.noteTurnEnd(s); }
    const c = am3.oatCheckOf(A), items = w.open();
    done();
    ok(JSON.stringify(v.slice(0, K).map((x) => x.v)) === JSON.stringify([...Array(K - 1).fill('suspect'), 'moved']) && seen.every((x) => x === 'pending') && c.ask?.kind === 'anchor' && c.ask.win?.sevenDay === W_A2
      && items.length === 1 && items[0].id === c.ask.todoId && /keep agreeing on a weekly window that is not this row/.test(items[0].detail),
    `C1 (verify r2 F-C): the row's OWN account changes plan while the check is PENDING — ${K - 1} suspects, then reading #${K} (the ring re-anchored the guard's window first; the check runs after it) is MOVED: ONE anchor ask, never a mark, the pool keeps using it`, { v: v.map((x) => x.v), seen, ask: c.ask, n: items.length });
    const r = eng.oatAnswer(A, 'mine');
    ok(r.state === 'confirmed' && am3.oatAnchorOf(A)?.sevenDay === W_A2 && w.open().length === 0, '…the owner answers mine ⇒ the new window is the row\'s (owner-confirmed, newer than the login stamp), the ask resolved', am3.oatCheckOf(A));
    const q = quiet(); turns(eng, s, W_A2, 1, 0.6); q();
    ok(w.st(A) === 'confirmed' && v[v.length - 1].v === 'idle', '…and the token\'s next reading stays confirmed (no re-arm loop against the older login stamp)', v.slice(-1));
  }
  {
    // C1's positive control — the mark still lands when ANOTHER account's identity holds the phase (the carry at work)
    const w = world(), am3 = w.a, done = quiet();
    const A = am3.createSubscription({ name: 'Work' }).id, O = am3.createSubscription({ name: 'Other' }).id;
    w.writeCache(A, W_A); w.stamp(A, { sevenDay: W_A }); w.writeCache(O, W_A2); w.stamp(O, { sevenDay: W_A2, producer: 'login' });
    am3.setOat(A, tok('C1P'));
    const eng = w.mkEngine(); eng.oatIdentityAttach(); tap(eng);
    const s = w.envSess(A), seen = [];
    for (let i = 0; i < K; i++) { eng.recordRateLimitEvent(s, ev(W_A2, 0.4 + i / 1000)); seen.push(w.st(A)); eng.noteTurnEnd(s); }
    const c = am3.oatCheckOf(A), sc = w.sidecar(A);
    done();
    ok(seen[K - 1] === 'mismatch' && seen.slice(0, K - 1).every((x) => x === 'pending') && JSON.stringify(c.others) === JSON.stringify([O]) && sc.sevenDay === W_A2 && /^oat:\d+$/.test(sc.producer) && sc.login?.sevenDay === W_A && w.open().length === 1,
      `C1 positive control: the same readings on a phase ANOTHER account's login identity holds ⇒ the mark at reading #${K} — the ring re-stamped the guard's window at that very reading and the check, after it, judged by the login identity the re-stamp carried`, { seen, others: c.others, producer: sc.producer, carried: sc.login && sc.login.sevenDay === W_A });
  }
  {
    // R7 — ANOTHER row is named by its identity only: a window that row's TOKEN stamped names nobody
    const w = world(), am3 = w.a, done = quiet();
    const X = am3.createSubscription({ name: 'Token Stamped' }).id, Y = am3.createSubscription({ name: 'Judged' }).id;
    w.writeCache(X, W_X); w.writeCache(Y, W_A); w.stamp(Y, { sevenDay: W_A });
    am3.setOat(X, tok('R7X'));
    const eng = w.mkEngine(); eng.oatIdentityAttach();
    turns(eng, w.envSess(X), W_X, K); // X's own token's readings stamp X's window — X proves nothing by them
    const scX = w.sidecar(X);
    await sleep(3); am3.setOat(Y, tok('R7Y'));
    const v = tap(eng);
    const realNow = Date.now; Date.now = () => realNow() + 6000; // past the established-window memo
    try { turns(eng, w.envSess(Y), W_X, K, 0.3); } finally { Date.now = realNow; }
    const c = am3.oatCheckOf(Y);
    done();
    ok(/^oat:\d+$/.test(scX.producer) && c.state === 'pending' && c.ask?.kind === 'anchor' && !c.others && JSON.stringify(v.map((x) => x.v)) === JSON.stringify([...Array(K - 1).fill('suspect'), 'moved']),
      'fix r2 F-A: a window ANOTHER row\'s token stamped is not that row\'s identity — K readings carrying it are `moved` (ONE ask), never a mark naming that row', { producerX: scX.producer, v: v.map((x) => x.v), state: c.state, ask: c.ask && c.ask.kind, others: c.others });
  }
  {
    // V11 — an open anchor ask is resolved when K readings then MARK the token (one item at a time)
    const w = world(), am3 = w.a, done = quiet();
    const A = am3.createSubscription({ name: 'Work' }).id, O = am3.createSubscription({ name: 'Other' }).id;
    w.writeCache(A, W_A); w.stamp(A, { sevenDay: W_A }); w.writeCache(O, W_B); w.stamp(O, { sevenDay: W_B, producer: 'login' });
    am3.setOat(A, tok('V11'));
    const eng = w.mkEngine(); eng.oatIdentityAttach();
    const s = w.envSess(A); turns(eng, s, W_A2, K);
    const askId = am3.oatCheckOf(A)?.ask?.todoId;
    const realNow = Date.now; Date.now = () => realNow() + 6000; // Other's login ⟳ panel now proves W_A2 is ITS window
    try { w.stamp(O, { sevenDay: W_A2, at: Date.now(), producer: 'login' }); turns(eng, s, W_A2, 1, 0.7); } finally { Date.now = realNow; }
    const c = am3.oatCheckOf(A), open = w.open();
    done();
    ok(askId && c.state === 'mismatch' && JSON.stringify(c.others) === JSON.stringify([O]) && w.td.get(askId)?.status === 'done' && open.length === 1 && open[0].id === c.todoId,
      'V11: an open anchor ask is RESOLVED when the token is then marked (K readings on a phase another account\'s identity holds) — one item, the mark\'s notice', { askId, state: c.state, askStatus: w.td.get(askId)?.status, open: open.length });
  }
  {
    // L1 (G1) + L2 (G2) on the real engine; V5 (one hint filing per row)
    const w = world(), am3 = w.a, done = quiet();
    const L = am3.createSubscription({ name: 'Login Row' }).id; w.writeCache(L, W_L); w.stamp(L, { sevenDay: W_L });
    const ids = [];
    for (let i = 0; i < 22; i++) { const id = am3.createSubscription({ name: 'Tok ' + String(i).padStart(2, '0') }).id; ids.push(id); w.writeCache(id, W_L); am3.setOat(id, tok('G' + i)); }
    const eng = w.mkEngine(); eng.oatIdentityAttach();
    for (const id of ids) turns(eng, w.envSess(id), W_L, K + 1);
    const asks = ids.map((id) => am3.oatCheckOf(id)?.ask || null), lines = done();
    ok(asks.every((x) => x && x.kind === 'hint' && x.todoId) && w.open().length === 22 && !lines.some((l) => /could not file/.test(l)),
      'fix r2 L1: 22 token rows asked at once — every ask the roster shows is in For you (the producer bounds its own items, one per row; the store\'s per-key cap of 20 is for an agent looping on add)', { open: w.open().length, noItem: asks.filter((x) => x && !x.todoId).length });
    ok(lines.filter((l) => /Tok 00: its long-lived token's reading carries/.test(l)).length === 1, `V5: ONE hint filing per row — ${K + 1} readings carrying the same window file (and say) it once`, lines.filter((l) => /Tok 00:/.test(l)));
    const st = read('src/agent-routes/status.js');
    ok(/userTodos\.add\(key, \{ text: add\.text,/.test(st) && !/openCap/.test(st), '…and the agent\'s own filing route never passes a cap of its own');
    eng.oatAnswer(ids[0], 'mine');
    let e = null; try { eng.oatAnswer(ids[0], 'not-mine'); } catch (x) { e = x; }
    ok(e && e.code === 'nothing_to_answer' && w.st(ids[0]) === 'confirmed', 'fix r2 L2: NOT MINE with no open ask (a stale dialog after a confirm) is refused by name — the confirmed token is never marked', e && e.code);
  }
  {
    // V8 — a restored conversation on a DIRECT row never rides the file road (env token or file? unknown ⇒ judges nothing)
    const w = world(), am3 = w.a, done = quiet();
    const Y = am3.createSubscription({ name: 'Direct Token' }).id; w.writeCache(Y, W_A); w.stamp(Y, { sevenDay: W_A });
    am3.oatFileCaps = () => ({ known: true, ok: true, cli: '2.1.296' });
    am3.get(Y).oatShape = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
    am3.setOat(Y, tok('V8')); await am3.oatFileSettled(Y);
    const eng = w.mkEngine(); eng.oatIdentityAttach(); const v = tap(eng);
    const r = w.restoredSess(Y); eng.noteTurnEnd(r); turns(eng, r, W_A, 2);
    done();
    ok(am3.readSubCreds(Y).oatFile === true && v.length === 2 && v.every((x) => x.v === 'stale-token') && w.st(Y) === 'pending' && !r._oatFileGen,
      'V8: a restored conversation on a DIRECT row whose folder holds our token file judges nothing, even after a turn end — the file road is a pool\'s (by the row\'s type), never assumed where the env token may ride', v.map((x) => x.v));
  }
  {
    // V12 + the first-token instant — the store side of F-A
    const am4 = world().a;
    const A = am4.createSubscription({ name: 'From' }).id, B = am4.createSubscription({ name: 'To' }).id, C = am4.createSubscription({ name: 'To Answered' }).id;
    ok(am4.oatFirstAtOf(A) === null, 'a row that never held a long-lived token has no first-token instant (its legacy stamps are its identity)');
    const m1 = am4.setOat(A, tok('V12A')).mintedAt;
    am4.setOat(B, tok('V12B')); am4.setOatAnchor(B, { ...win(W_B), how: 'owner-confirmed', at: Date.now(), mint: 'om-b' }); am4.get(B).oatMintedAt = Date.now() - 400 * 86400e3; // B's own token expired; its mint-probe anchor left
    am4.setOat(C, tok('V12C')); am4.setOatAnchor(C, { ...win(W_C), how: 'owner-confirmed', at: Date.now() }); am4.get(C).oatMintedAt = Date.now() - 400 * 86400e3; // C: the owner ANSWERED its window
    const fB = am4.oatFirstAtOf(B);
    am4.moveOat(A, B); await sleep(3); am4.setOat(A, tok('V12A2')); am4.moveOat(A, C);
    ok(am4.oatAnchorOf(B) === null && am4.oatAnchorOf(C)?.sevenDay === W_C && am4.oatFirstAtOf(B) === fB,
      'V12 (fix r2): a RE-BIND retires the target\'s previous token\'s mint-probe anchor (never the moved token\'s identity) and keeps the window the owner ANSWERED for the target; its first-token instant stays', { B: am4.oatAnchorOf(B), C: am4.oatAnchorOf(C) });
    await sleep(3); am4.setOat(A, tok('V12A3')); am4.clearOat(A); await sleep(3); am4.setOat(A, tok('V12A4'));
    ok(am4.oatFirstAtOf(A) === m1, 'the first-token instant is set ONCE — a re-mint, a re-bind away, a removal and a new token keep it', { first: am4.oatFirstAtOf(A), m1 });
    const P = am4.createSubscription({ name: 'Pre-field' }).id; am4.get(P).oatEnc = am4.get(A).oatEnc; am4.get(P).oatMintedAt = 1790000000000; // a token saved before the field existed
    ok(am4.oatFirstAtOf(P) === 1790000000000, '…a row whose token predates the field answers that token\'s mint instant');
    am4.setOat(P, tok('V12P'));
    ok(am4.get(P).oatFirstAt === 1790000000000, '…and its first save afterwards keeps it (a legacy stamp between the two tokens may be the first token\'s)');
  }
  {
    // the producer on the ring + the LOGIN proving a window a token's readings stamped
    const w = world(), am3 = w.a, done = quiet();
    const A = am3.createSubscription({ name: 'Dual' }).id; w.login(A); w.writeCache(A, W_A); // no window yet
    am3.setOat(A, tok('UP'));
    const eng = w.mkEngine(); eng.oatIdentityAttach(); const v = tap(eng);
    turns(eng, w.envSess(A), W_A, K); // the token's own readings stamp the row's window first
    const sc1 = w.sidecar(A), v1 = v.map((x) => x.v);
    const realNow = Date.now;
    Date.now = () => realNow() + 6000; try { turns(eng, w.loginSess(A), W_A, K, 0.5); } finally { Date.now = realNow; } // the row's LOGIN conversations
    const sc2 = w.sidecar(A), ring = (w.sidecar(A, 'apiwin') || {}).ring || [];
    Date.now = () => realNow() + 12000; try { turns(eng, w.envSess(A), W_A, 1, 0.8); } finally { Date.now = realNow; }
    done();
    ok(/^oat:\d+$/.test(sc1.producer) && v1.every((x) => x === 'no-anchor') && sc2.producer === 'login' && sc2.sevenDay === W_A && ring.some((e) => e.producer === 'login') && ring.some((e) => /^oat:\d+$/.test(e.producer || '')) && w.st(A) === 'confirmed',
      'fix r2 F-A: the token\'s own K readings stamp the row\'s window as THEIRS (no identity: no-anchor); the row\'s LOGIN proving the same window re-stamps it as the login\'s; the token\'s next reading confirms — every ring candidate names its producer', { p1: sc1.producer, v1, p2: sc2.producer, ring: ring.map((e) => e.producer) });
  }
  {
    // L3 (J) — a check judged long ago that RE-ARMS is not 「身份未验证」 the instant it re-arms
    const w = world(), am3 = w.a, done = quiet();
    const A = am3.createSubscription({ name: 'Old Token' }).id; w.writeCache(A, W_A); w.stamp(A, { sevenDay: W_A });
    const realNow = Date.now; let off = 0; Date.now = () => realNow() + off;
    try {
      am3.setOat(A, tok('J'));
      const eng = w.mkEngine(); eng.oatIdentityAttach();
      eng.recordRateLimitEvent(w.envSess(A), ev(W_A, 0.1));
      const c1 = w.st(A);
      off = 30 * 86400e3;
      w.stamp(A, { sevenDay: W_A2, at: Date.now(), producer: 'login' }); // 30 days on, the row's login ⟳ panel: a renewal
      const eng2 = w.mkEngine(); eng2.oatIdentityAttach();
      const r5 = nowS + 30 * 86400 + 7200;
      eng2.recordRateLimitEvent(w.envSess(A), { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.1, resets_at: r5, resetsAt: r5 } }); // re-arms; a 5-hour reading judges nothing
      const ck = am3.oatCheckOf(A), row = (am3.list().accounts.find((x) => x.id === A) || {}).oatIdentity || null;
      done();
      ok(c1 === 'confirmed' && ck.state === 'pending' && ck.armedAt >= Date.now() - 5000 && row === null,
        'fix r2 L3: a check judged 30 days ago RE-ARMS on an independent move (the login\'s renewal) — not 「身份未验证」 the instant it re-arms: the day counts from the re-arm', { c1, state: ck.state, armedAgoMs: Date.now() - ck.armedAt, row });
    } finally { Date.now = realNow; try { done(); } catch { } }
  }
  // ═══ §9 lane oat-identity-fix-r3 (verify r3 F-R1 / F-R2 — two writers THE RULE never named; the second refutation of
  // one class): THE ONE `.window-` WRITER (producer mandatory, the carry inside, a census DERIVED FROM THE SOURCE — on acorn since lane oat-census-acorn) · A READING'S ROAD
  // IS A FACT OF THE SESSION (persisted, restored, never guessed) · the production shape (a stamp that cannot say who
  // produced it ⇒ the ONE anchor ask, never a mark) · the LOW roads (merge, import, the memo) ═══
  console.log('§9 fix r3: the ONE `.window-` writer + its parser-derived census · the road, a persisted fact · the repair carries · the LOW roads');
  // every §9 leg runs inside guard9: on a tree without fix r3 (f98c55db6) a missing door is ONE red leg, never a crashed suite
  const guard9 = async (fn) => { try { await fn(); } catch (e) { ok(false, '§9 — a leg THREW (a tree without what fix r3 builds?)', String((e && e.message) || e).slice(0, 300)); } };
  const WS = (() => { try { return require(path.join(REPO, 'src/window-stamp.js')); } catch { return null; } })();
  // ── §9a THE WRITER CENSUS, ON THE PARSER (lane oat-census-acorn, verify r4 F-V1). Fix r3's census was a regex over
  // text: its comment stripper blanked REAL code wherever a `/*` sat inside a string or a `//` comment (`data/*.json`,
  // 'image/*' — 39 files, server.js / boot-restore / usage-routes among them), and its two patterns missed nine of the
  // ten writer shapes verify r4 planted (X1–X9 below). Now acorn parses every file in scope — by `git ls-files`: src/**,
  // server.js, the CLIs the engine ships and runs (data/bin — the statusline among them) and the tooling in scripts/ (not
  // its suites / measure- / dbg- probes: they build fixtures on scratch dirs) — and a ROW is what the parser says it is:
  // a `windowSidecarName` name (a call, an alias, an import, a computed key that folds to it); a string / template /
  // regexp holding `.window-`; a construction that only folds to it (`'.win' + 'dow-'`, a join, a concat). path.join /
  // fs.* / _writeAtomic / rename* over a row (or a variable a row feeds, or a name a row's pattern filters) are the row's
  // SHAPE. Rows group by their enclosing named function: the ONE writer and the ONE reader are window-stamp.js's, and
  // every other group is RED by name (file › function — shapes) unless NOT_A_WRITER declares it with a why, its exact
  // rows and whether it may write (a dead or a changed declaration is RED too; a file the parser cannot read is RED). A
  // literal that IS a DOM query's selector (`el.querySelector('.window-controls')`) belongs to the DOM, never to a path:
  // counted, not a row. ──
  const acorn = require('acorn');
  const SUFFIX = '.window-', HOLE = '\u0000', STAMP_NAME = 'windowSidecarName', NAME_IN = /(^|[^\w$])windowSidecarName(?![\w$])/;
  const DOM_QUERY = new Set(['querySelector', 'querySelectorAll', 'closest', 'matches']);
  const FS_READ = /^(read|stat|lstat|exists|access|realpath|readdir|readlink|watch|createReadStream|opendir)/;
  const WRITE_CALL = /^(_?write|append|rename|copy|cp|symlink|link|truncate|unlink|rm|mkdir|utimes|chmod|chown|createWriteStream|open)|Atomic$/;
  const inStampScope = (f) => /^src\/.+\.(c?js|mjs)$/.test(f) || f === 'server.js' || /^data\/bin\/[^/]+$/.test(f) || (/^scripts\/[^/]+\.(c?js|mjs)$/.test(f) && !/^scripts\/(test|measure|dbg)-/.test(f));
  const stampFiles = () => execFileSync('git', ['-C', REPO, 'ls-files', '-z', '--', 'src', 'server.js', 'data/bin', 'scripts'], { encoding: 'utf8', env: gitEnvFrom(process.env), maxBuffer: 1 << 26 })
    .split('\0').filter((f) => inStampScope(f) && fs.existsSync(path.join(REPO, f))).sort().map((f) => [f, read(f)]);
  /** `<file> › <function>` → [why, its rows exactly, may it write?] — the only groups besides the ONE writer and reader */
  const NOT_A_WRITER = {
    'src/reading-lag.js › windowSidecarName': ['THE PURE NAME — suites and probes spell fixtures with it; reading-lag imports nothing', ['literal ".window-"', 'name'], false],
    'src/reading-lag.js › (top level)': ['the PURE name\'s export', ['name'], false],
    'src/window-stamp.js › (top level)': ['the owner module imports the PURE name', ['name'], false],
    'data/bin/vibespace-usage › windowSidecarName': ['the SHIPPED statusline\'s byte-identical mirror of the PURE name — it ships alone to hosts and cannot require src/ (test-readings-attribution §13 pins the mirror)', ['literal ".window-"', 'name'], false],
    'data/bin/vibespace-usage › ownWindowOf': ['the statusline\'s guard READS the stamp (its own establishedWindows) — reads only', ['name'], false],
    'data/bin/vibespace-usage › noteWindowRefusal': ['the guard\'s refusal LOG `.window-refused.ndjson` — another file beside the stamps, never a `.window-<key>` stamp', ['literal ".window-refused.ndjson"'], true],
  };
  const STAMP_WRITER = 'src/window-stamp.js › writeWindowStamp', STAMP_READER = 'src/window-stamp.js › readWindowStamp';
  const stampMemo = new Map();
  /** ONE file → its rows (roots), their derived shapes, its DOM selectors, its writeWindowStamp calls — the tree's own text memoized */
  const stampFile = (f, text) => {
    const m = stampMemo.get(f); if (m && m.text === text) return m.out;
    let ast = null, err = null;
    for (const sourceType of ['script', 'module']) { try { ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); break; } catch (e) { err = e; } }
    const out = { roots: [], derived: [], dom: 0, writes: [], err: ast ? null : String((err && err.message) || err) };
    if (ast) {
      const starts = [0]; for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
      const lineAt = (pos) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; } return lo + 1; };
      const seen = new Set(), calls = [], binds = [], idents = [], folds = [], consts = new Map();
      /** a constant string expression, its unknown parts HOLEs (a `const` bound to one constant string reads as it); null = not a string expression */
      const fold = (n) => {
        if (!n) return null;
        if (n.type === 'Identifier') { const v = consts.get(n.name); return typeof v === 'string' ? v : null; }
        if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
        if (n.type === 'TemplateLiteral') return n.quasis.map((q, i) => (q.value.cooked || '') + (i < n.expressions.length ? (fold(n.expressions[i]) ?? HOLE) : '')).join('');
        if (n.type === 'BinaryExpression' && n.operator === '+') { const a = fold(n.left), b = fold(n.right); return a === null && b === null ? null : (a ?? HOLE) + (b ?? HOLE); }
        if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed) {
          if (n.callee.property.name === 'join' && n.callee.object.type === 'ArrayExpression') { const sep = n.arguments.length ? fold(n.arguments[0]) : ','; return n.callee.object.elements.map((e) => fold(e) ?? HOLE).join(sep ?? HOLE); }
          if (n.callee.property.name === 'concat') { const a = fold(n.callee.object); if (a !== null) return a + n.arguments.map((e) => fold(e) ?? HOLE).join(''); }
        }
        return null;
      };
      const snip = (s) => JSON.stringify(s.slice(Math.max(0, s.indexOf(SUFFIX)), Math.max(0, s.indexOf(SUFFIX)) + 24).split(HOLE).join('…'));
      const root = (node, fn, kind, label) => { const id = node.start + ':' + node.end; if (seen.has(id)) return; seen.add(id); out.roots.push({ fn, kind, label, at: node.start, end: node.end, line: lineAt(node.start) }); };
      const bare = (c) => (c.type === 'ChainExpression' ? c.expression : c);
      const calleeName = (c) => { c = bare(c); return c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') ? c.property.name : null; };
      const calleeObj = (c) => { c = bare(c); return c.type === 'MemberExpression' ? c.object : null; };
      const isDomSelector = (node, parent) => !!parent && parent.type === 'CallExpression' && parent.arguments[0] === node && (() => { const c = bare(parent.callee); return c.type === 'MemberExpression' && !c.computed && DOM_QUERY.has(c.property.name); })();
      const fnName = (node, parent) => {
        if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') && node.id) return node.id.name;
        if (!parent) return null;
        if (parent.type === 'VariableDeclarator' && parent.init === node && parent.id.type === 'Identifier') return parent.id.name;
        if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && parent.value === node && !parent.computed && parent.key) return parent.key.name || String(parent.key.value);
        if (parent.type === 'AssignmentExpression' && parent.right === node) { const l = parent.left; if (l.type === 'Identifier') return l.name; if (l.type === 'MemberExpression' && !l.computed) return l.property.name; }
        return null;
      };
      const walk = (node, parent, fn) => {
        let here = fn;
        if (/Function/.test(node.type)) { const nm = fnName(node, parent); if (nm) here = nm; }
        if (node.type === 'Identifier') { idents.push({ fn: here, name: node.name, at: node.start }); if (node.name === STAMP_NAME) root(node, here, 'name', 'name'); }
        if (node.type === 'Literal' && typeof node.value === 'string') {
          if (node.value.includes(SUFFIX)) { if (isDomSelector(node, parent)) out.dom++; else root(node, here, 'literal', 'literal ' + snip(node.value)); }
          else if (NAME_IN.test(node.value)) root(node, here, 'name', 'name ' + JSON.stringify(node.value.slice(0, 40)));
        }
        if (node.type === 'Literal' && node.regex && node.regex.pattern.replace(/\\\./g, '.').includes(SUFFIX)) root(node, here, 'regexp', 'regexp /' + node.regex.pattern.slice(0, 30) + '/');
        if (node.type === 'TemplateLiteral') {
          const q = node.quasis.find((x) => (x.value.cooked || '').includes(SUFFIX));
          if (q) { if (!node.expressions.length && isDomSelector(node, parent)) out.dom++; else root(node, here, 'literal', 'literal ' + snip(q.value.cooked)); }
        }
        if (node.type === 'CallExpression') {
          calls.push({ fn: here, name: calleeName(node.callee), obj: calleeObj(node.callee), args: node.arguments, line: lineAt(node.start) });
          if (calleeName(node.callee) === 'writeWindowStamp') { const o = calleeObj(node.callee); out.writes.push({ fn: here, line: lineAt(node.start), via: o && o.type === 'Identifier' ? o.name : null, args: node.arguments.slice(0, 2).map((a) => (a.type === 'Identifier' ? a.name : '?')) }); }
        }
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) { binds.push({ fn: here, name: node.id.name, from: node.init }); if (parent && parent.kind === 'const') consts.set(node.id.name, consts.has(node.id.name) ? null : node.init); }
        if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') binds.push({ fn: here, name: node.left.name, from: node.right });
        if ((node.type === 'ForOfStatement' || node.type === 'ForInStatement') && node.left.type === 'VariableDeclaration' && node.left.declarations[0].id.type === 'Identifier') binds.push({ fn: here, name: node.left.declarations[0].id.name, from: node.right });
        for (const key in node) {
          if (key === 'type' || key === 'start' || key === 'end') continue;
          const v = node[key];
          if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x, node, here); } else if (v && typeof v.type === 'string') walk(v, node, here);
        }
        // after the children (post-order): a construction whose parts may only together say the suffix or the name — judged after the walk, once every `const` is known
        if ((node.type === 'BinaryExpression' && node.operator === '+') || node.type === 'TemplateLiteral' || (node.type === 'CallExpression' && /^(join|concat)$/.test(calleeName(node.callee) || ''))) folds.push({ node, fn: here });
      };
      walk(ast, null, null);
      // a `const` bound once to a constant string (two bindings of one name = unknown); chains resolve in two passes
      for (let pass = 0; pass < 2; pass++) for (const [k, v] of consts) if (v && typeof v === 'object') { const s = fold(v); if (s !== null && !s.includes(HOLE)) consts.set(k, s); }
      for (const [k, v] of consts) if (typeof v !== 'string') consts.delete(k);
      for (const { node, fn } of folds) {
        const s = fold(node);
        if (s !== null && (s.includes(SUFFIX) || NAME_IN.test(s.split(HOLE).join(' '))) && !out.roots.some((r) => r.at >= node.start && r.end <= node.end)) root(node, fn, s.includes(SUFFIX) ? 'folded' : 'name', 'folded ' + snip(s));
      }
      // the SHAPE of each group: what a row (or a binding it feeds, or a name its pattern filters) reaches
      const inside = (at, n) => at >= n.start && at < n.end;
      for (const fn of new Set(out.roots.map((r) => r.fn))) {
        const rs = out.roots.filter((r) => r.fn === fn), tainted = new Set();
        const touches = (n) => rs.some((r) => inside(r.at, n)) || idents.some((i) => i.fn === fn && tainted.has(i.name) && inside(i.at, n));
        for (const c of calls) if (c.fn === fn && c.obj && (c.name === 'test' || c.name === 'exec') && rs.some((r) => inside(r.at, c.obj))) for (const a of c.args) if (a.type === 'Identifier') tainted.add(a.name);
        for (const c of calls) if (c.fn === fn && c.obj && c.obj.type === 'Identifier' && ['startsWith', 'endsWith', 'includes', 'match'].includes(c.name) && c.args.some((a) => rs.some((r) => inside(r.at, a)))) tainted.add(c.obj.name);
        for (let pass = 0; pass < 4; pass++) for (const b of binds) if (b.fn === fn && !tainted.has(b.name) && touches(b.from)) tainted.add(b.name);
        for (const c of calls) {
          if (c.fn !== fn || !c.name || !c.args.some((a) => touches(a))) continue;
          const on = c.obj ? (c.obj.type === 'Identifier' ? c.obj.name : (c.obj.type === 'MemberExpression' && !c.obj.computed) ? c.obj.property.name : null) : null;
          if ((c.name === 'join' || c.name === 'resolve') && on === 'path') out.derived.push({ fn, shape: 'join', line: c.line });
          else if (on && /^(fs|fsp|promises|fsPromises)$/.test(on) && FS_READ.test(c.name)) out.derived.push({ fn, shape: 'read:' + c.name, line: c.line });
          else if (WRITE_CALL.test(c.name)) out.derived.push({ fn, shape: 'write:' + c.name, line: c.line });
        }
      }
    }
    if (!m) stampMemo.set(f, { text, out }); // the tree's own text stays; a plant's copy is judged, never kept
    return out;
  };
  const shapesOf = (g) => [...new Set([...g.roots.map((r) => r.kind), ...g.derived.map((d) => d.shape)])].join('+');
  const stampCensus = (files, declared = NOT_A_WRITER) => {
    const rows = [], red = [], groups = new Map(); let dom = 0;
    for (const [f, text] of files) {
      const c = stampFile(f, text);
      if (c.err) { red.push(`${f} › (unparsed) — the parser cannot read it: ${c.err.slice(0, 80)}`); continue; }
      dom += c.dom;
      for (const r of c.roots) { rows.push({ f, ...r }); const k = `${f} › ${r.fn || '(top level)'}`; if (!groups.has(k)) groups.set(k, { roots: [], derived: [] }); groups.get(k).roots.push(r); }
      for (const d of c.derived) groups.get(`${f} › ${d.fn || '(top level)'}`).derived.push(d);
    }
    const writes = (g) => g.derived.some((d) => d.shape.startsWith('write:'));
    for (const [k, g] of groups) {
      const where = `${k} (line ${g.roots[0].line}) — ${shapesOf(g)}`;
      if (k === STAMP_WRITER) { if (!writes(g)) red.push(`${where}: THE ONE WRITER writes nothing`); continue; }
      if (k === STAMP_READER) { if (writes(g)) red.push(`${where}: THE ONE READER writes`); continue; }
      const d = declared[k];
      if (!d) { red.push(where); continue; }
      const got = g.roots.map((r) => r.label).sort();
      if (JSON.stringify(got) !== JSON.stringify([...d[1]].sort())) red.push(`${where}: declared ${JSON.stringify(d[1])}, found ${JSON.stringify(got)}`);
      else if (!d[2] && writes(g)) red.push(`${where}: declared read-only, writes`);
    }
    for (const k of Object.keys(declared)) if (!groups.has(k)) red.push(`declared ${k} names no row (a dead row)`);
    for (const k of [STAMP_WRITER, STAMP_READER]) if (!groups.has(k)) red.push(`${k} is gone`);
    return { rows, red, groups, dom, writer: groups.has(STAMP_WRITER) ? 1 : 0, reader: groups.has(STAMP_READER) ? 1 : 0 };
  };
  /** fix r3's comment stripper, kept ONLY to prove the blind-spot control below sits where it blanked real code */
  const regexStripR3 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  await guard9(async () => {
    const t0 = Date.now();
    const files = stampFiles();
    const c = stampCensus(files);
    const n = (re) => files.filter(([f]) => re.test(f)).length;
    console.log(`    the .window- census (acorn): ${c.rows.length} rows in ${c.groups.size} functions over ${files.length} files (src ${n(/^src\//)} · server.js · data/bin ${n(/^data\/bin\//)} · scripts ${n(/^scripts\//)}) — ${c.writer} writer, ${c.reader} reader, ${Object.keys(NOT_A_WRITER).length} declared not-a-writer, ${c.dom} DOM selectors (not rows), ${c.red.length} red · ${Date.now() - t0} ms`);
    for (const [k, g] of c.groups) console.log(`      ${k} — ${shapesOf(g)} (line ${g.roots.map((r) => r.line).join(', ')})`);
    ok(!c.red.length && c.writer === 1 && c.reader === 1 && files.some(([f]) => f === 'server.js') && n(/^data\/bin\//) > 0 && n(/^scripts\//) > 0,
      'verify r4 F-V1 the ONE writer, on the parser: every `.window-` / `windowSidecarName` row in src/, server.js, data/bin and scripts/ is window-stamp.js\'s ONE writer or ONE reader, or a NOT_A_WRITER row exactly as declared (the PURE name and its export, the import, the shipped statusline\'s mirror + its read + its refusal log)', { red: c.red });
    // RED CONTROLS — each plant is exactly ONE red, by name: fix r3's five, verify r4's X0–X9 (X1–X9 were invisible to the
    // regex census), the other writer shapes, the blind spot, the census's own mechanics
    const plantIn = (fs0, rel, from, to) => fs0.map(([f, t]) => (f === rel ? [f, (() => { if (!t.includes(from) || t.split(from).length !== 2) throw new Error('plant anchor missing or not unique in ' + rel); return t.replace(from, () => to); })()] : [f, t]));
    const before = (rel, anchor, text) => (fs0) => plantIn(fs0, rel, anchor, text + '\n' + anchor);
    const added = (rel, text) => (fs0) => [...fs0, [rel, text]].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const RAW = (dirExpr, nameExpr) => `function restampRaw(key, w) { try { fs.writeFileSync(path.join(${dirExpr}, ${nameExpr}), JSON.stringify({ ...w, at: Date.now(), source: 'on-demand' })); } catch { } }`;
    const RR = 'const MIN_OWN_READINGS = 5;';
    const BLIND = "'use strict';\nconst fs = require('fs'), path = require('path');\nconst GLOB = 'data/*.json'; // every cache file\nfunction restampBlind(dir, key) { fs.writeFileSync(path.join(dir, '.window-' + key), '{}'); }\n/** a doc comment closes the fake span here */\nmodule.exports = { GLOB, restampBlind };\n";
    const plants = [
      ['r3: a second writer in the standing repair (its own atomic write — the F-R2 shape)', 'src/reading-repair.js › repairSidecarsByApiPhase', (f) => plantIn(f, 'src/reading-repair.js', '    const sc = windowStamp.readWindowStamp(cacheDir, key);', "    const sc = windowStamp.readWindowStamp(cacheDir, key);\n    _writeAtomic(path.join(cacheDir, require('./reading-lag.js').windowSidecarName(key)), JSON.stringify({ sevenDay: 1 }));")],
      ['r3: a literal `.window-` path built by hand', 'src/usage-routes.js › refreshViaCliPanel', (f) => plantIn(f, 'src/usage-routes.js', "      const windowStamp = require('./window-stamp.js');", "      const windowStamp = require('./window-stamp.js'); const hand = path.join(USAGE_CACHE_DIR, '.window-' + key); void hand;")],
      ['r3: a template literal `.window-${key}`', 'src/server/usage-pool-engine.js › establishedWindows', (f) => plantIn(f, 'src/server/usage-pool-engine.js', 'function establishedWindows() {', 'function establishedWindows() {\n  void `.window-${0}`;')],
      ['r3: an aliased name (no call)', 'src/weekly-lanes-unfold.js › establishedWeekly', (f) => plantIn(f, 'src/weekly-lanes-unfold.js', 'function establishedWeekly(cacheDir, key) {', 'function establishedWeekly(cacheDir, key) {\n  const nm = readingLag.windowSidecarName; void nm;')],
      ['r3: a third function inside the owner module (a second writer next to the ONE)', 'src/window-stamp.js › stampRaw', (f) => plantIn(f, 'src/window-stamp.js', 'module.exports = {', "function stampRaw(d, k, s) { return require('./usage-cache-write.js').writeSidecar(d, windowSidecarName(k), s); }\nmodule.exports = {")],
      ['X0 a producer-less writer, the suite\'s own control shape (outside every blind span)', 'src/reading-repair.js › restampRaw', before('src/reading-repair.js', RR, RAW('cacheDir', "'.window-' + key"))],
      ['X1 the same writer inside a span fix r3\'s stripper blanked (usage-routes.js — one of the ONE writer\'s callers)', 'src/usage-routes.js › restampRaw', before('src/usage-routes.js', "const quotaModel = require('./quota-model.js');", RAW('USAGE_CACHE_DIR', "'.window-' + key"))],
      ['X2 the same writer inside a span fix r3\'s stripper blanked (server.js)', 'server.js › restampRaw', before('server.js', '  let cols = minCols, rows = minRows, override = false;', RAW("path.join(__dirname, 'data', 'usage-cache')", "'.window-' + key"))],
      ['X3 the same writer inside a span fix r3\'s stripper blanked (boot-restore.js)', 'src/server/boot-restore.js › restampRaw', before('src/server/boot-restore.js', '  const remoteSockAlive = new Set();', RAW("path.join(DATA_DIR, 'usage-cache')", "'.window-' + key"))],
      ['X4 a literal holding the key\'s own prefix (`\'.window-sub-\' + hex`)', 'src/reading-repair.js › restampRaw', before('src/reading-repair.js', RR, RAW('cacheDir', "'.window-sub-' + String(key).slice(4)"))],
      ['X5 util.format(\'.window-%s\', key)', 'src/reading-repair.js › restampRaw', before('src/reading-repair.js', RR, RAW('cacheDir', "require('util').format('.window-%s', key)"))],
      ['X6 a join over the key ([\'.window\', key].join(\'-\'))', 'src/reading-repair.js › restampRaw', before('src/reading-repair.js', RR, RAW('cacheDir', "['.window', key].join('-')"))],
      ['X7 the PURE name by a computed key (readingLag[\'window\' + \'SidecarName\'])', 'src/weekly-lanes-unfold.js › restampRaw', before('src/weekly-lanes-unfold.js', 'function establishedWeekly(cacheDir, key) {', RAW('cacheDir', "readingLag['window' + 'SidecarName'](key)"))],
      ['X8 no name built: readdir + a /^\\.window-/ rewrite in place', 'src/reading-repair.js › restampAll', before('src/reading-repair.js', RR, "function restampAll(cacheDir, w) { for (const f of fs.readdirSync(cacheDir)) if (/^\\.window-/.test(f)) { try { fs.writeFileSync(path.join(cacheDir, f), JSON.stringify({ ...w, at: Date.now(), source: 'on-demand' })); } catch { } } }")],
      ['X9 the literal after a string holding `//` on the same line', 'src/reading-repair.js › restampRaw', before('src/reading-repair.js', RR, "function restampRaw(key, w) { const sep = 'a//b'; try { fs.writeFileSync(path.join(cacheDir(sep), '.window-' + key), JSON.stringify({ ...w, at: Date.now(), source: 'on-demand' })); } catch { } }")],
      ['a constant split across a `const` binding (const DOT_WINDOW = \'.window\'; DOT_WINDOW + \'-\' + key)', 'src/reading-repair.js › restampRaw', before('src/reading-repair.js', RR, "const DOT_WINDOW = '.window';\n" + RAW('cacheDir', "DOT_WINDOW + '-' + key"))],
      ['a rename onto the name through an aliased import', 'src/reading-repair.js › swapIn', before('src/reading-repair.js', RR, "function swapIn(dir, key, tmp) { const { windowSidecarName: nameOf } = require('./reading-lag.js'); fs.renameSync(tmp, path.join(dir, nameOf(key))); }")],
      ['an _writeAtomic whose name ANOTHER module builds (the red names the builder)', 'src/quota-model.js › stampFileOf', (f) => before('src/reading-repair.js', RR, "function restampVia(cacheDir, key, w) { _writeAtomic(path.join(cacheDir, require('./quota-model.js').stampFileOf(key)), JSON.stringify(w)); }")(plantIn(f, 'src/quota-model.js', 'module.exports = {', "function stampFileOf(key) { return '.win' + 'dow-' + String(key); }\nmodule.exports = {"))],
      ['a writer in scripts/ (a new tool)', 'scripts/restamp-windows.mjs › restampAll', added('scripts/restamp-windows.mjs', "import fs from 'node:fs'; import path from 'node:path';\nexport function restampAll(dir, keys) { for (const k of keys) fs.writeFileSync(path.join(dir, `.window-${k}`), '{}'); }\n")],
      ['a writer in the shipped statusline (data/bin) through its mirror of the name', 'data/bin/vibespace-usage › restampOwn', before('data/bin/vibespace-usage', 'function ownWindowOf(key) {', 'function restampOwn(key, w) { fs.writeFileSync(path.join(CACHE_DIR, windowSidecarName(key)), JSON.stringify(w)); }')],
      ['the BLIND SPOT: a file whose only `.window-` sits after a `data/*.json` string', 'src/blind-spot-plant.js › restampBlind', added('src/blind-spot-plant.js', BLIND)],
      ['the ONE reader writes', 'src/window-stamp.js › readWindowStamp', (f) => plantIn(f, 'src/window-stamp.js', 'function readWindowStamp(cacheDir, key) {\n', 'function readWindowStamp(cacheDir, key) {\n  fs.utimesSync(path.join(cacheDir, windowSidecarName(key)), new Date(), new Date());\n')],
      ['a declared read-only row writes through its own path variable (no new row)', 'data/bin/vibespace-usage › ownWindowOf', (f) => plantIn(f, 'data/bin/vibespace-usage', "    const w = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, windowSidecarName(key)), 'utf-8'));", "    const p = path.join(CACHE_DIR, windowSidecarName(key)); const w = JSON.parse(fs.readFileSync(p, 'utf-8')); fs.writeFileSync(p, JSON.stringify(w));")],
      ['a declared row gains a row (the refusal log\'s function writes a stamp)', 'data/bin/vibespace-usage › noteWindowRefusal', (f) => plantIn(f, 'data/bin/vibespace-usage', "    const f = path.join(CACHE_DIR, '.window-refused.ndjson');", "    const f = path.join(CACHE_DIR, '.window-refused.ndjson'); fs.writeFileSync(path.join(CACHE_DIR, '.window-' + key), '{}');")],
      ['a DOM selector taken out of the DOM call is a row again', 'src/lib/terminal.js › _addSettingsButton', (f) => plantIn(f, 'src/lib/terminal.js', ".querySelector('.window-controls')", ".querySelector(['.window-controls'][0])")],
      ['a file the parser cannot read', 'src/blind-spot-plant.js › (unparsed)', added('src/blind-spot-plant.js', "function restamp(dir, key) { fs.writeFileSync(path.join(dir, '.window-' + key), '{}');\n")],
    ];
    for (const [what, want, mk] of plants) {
      let red; try { red = stampCensus(mk(files)).red; } catch (e) { red = ['PLANT FAILED: ' + e.message]; }
      ok(red.length === 1 && red[0].startsWith(want + ' '), `RED control (§9a on acorn): ${what} ⇒ ONE red, ${want}`, red);
    }
    ok(!/\.window-/.test(regexStripR3(BLIND)) && /\.window-/.test(BLIND), 'the blind-spot control is real: fix r3\'s stripper blanks its only `.window-` (the `/*` inside \'data/*.json\' opens a block comment that runs to the doc comment\'s `*/`) — the parser does not');
    const dead = stampCensus(files, { ...NOT_A_WRITER, 'src/usage-routes.js › goneStamp': ['a row that no longer exists', ['name'], false] }).red;
    ok(dead.length === 1 && /goneStamp names no row \(a dead row\)/.test(dead[0]), 'RED control (§9a on acorn): a NOT_A_WRITER row that names no row is RED (a dead row)', dead);
    // the ONE writer's callers, on the same parse: the standing repair has no row of its own and writes only through it
    const calls = files.flatMap(([f, t]) => stampFile(f, t).writes.map((w) => ({ f, ...w }))).filter((w) => w.f !== 'src/window-stamp.js');
    const rr = calls.filter((w) => w.f === 'src/reading-repair.js');
    ok(rr.length === 4 && rr.every((w) => w.via === 'windowStamp' && w.args[0] === 'cacheDir' && /^(key|acct)$/.test(w.args[1])) && ![...c.groups.keys()].some((k) => k.startsWith('src/reading-repair.js ›')),
      'fix r3 F-R2: reading-repair writes `.window-` ONLY through the ONE writer — the one-shot seed (null), the standing repair\'s stamp / re-stamp (null) and its confirm (repair:<the stamp\'s producer>)', rr);
    ok(JSON.stringify([...new Set(calls.map((w) => w.f))].sort()) === JSON.stringify(['src/reading-repair.js', 'src/server/usage-pool-engine.js', 'src/usage-routes.js']) && calls.length === 8,
      `the ONE writer's callers, derived: the engine (the ring, the renewal panel), the ⟳ panel (verified, isolated), the repair (seed, stamp, re-stamp, confirm) — ${calls.length} calls`, calls.map((w) => `${w.f}:${w.line} ${w.fn}`));
  });
  // ── §9b THE ONE WRITER'S LAW (behaviour): the producer is mandatory, a stamp's own fields never trusted, the carry inside ──
  await guard9(async () => {
    if (!WS) throw new Error('src/window-stamp.js (the ONE writer) does not exist');
    const d = fs.mkdtempSync(path.join(tmp, 'ws-')), k = 'sub-ws0001';
    const file = path.join(d, readingLag.windowSidecarName(k));
    const thrown = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
    ok(/names its producer/.test(thrown(() => WS.writeWindowStamp(d, k, { ...win(OWN), at: 1 })) || '') && !fs.existsSync(file), 'the ONE writer THROWS without a producer (undefined) — nothing is written');
    const bad = ['', 'LOGIN', 'Login', 'oat:', 'oat:abc', 'oat:1:2', 'repair:', 'repair:repair:login', 'repair:none', 'token', 42, {}, false];
    ok(bad.every((p) => thrown(() => WS.writeWindowStamp(d, k, win(OWN), p))) && !fs.existsSync(file), `…and on a malformed producer (${bad.length} spellings) — nothing is written`);
    ok(['login', 'oat:1790000000000', 'oat:?', 'repair:login', 'repair:oat:7', 'repair:legacy', 'repair:unknown', 'repair:repair', null].every((p) => WS.isWindowProducer(p)), 'the producers it takes: login · oat:<gen> · repair:<source> · null (nobody can tell)');
    WS.writeWindowStamp(d, k, { ...win(OWN), at: 100, producer: 'oat:9', login: { sevenDay: FOREIGN } }, 'login');
    const s1 = WS.readWindowStamp(d, k);
    ok(s1.producer === 'login' && !('login' in s1) && s1.sevenDay === OWN, 'a login stamp names `login` and carries nothing — the stamp\'s own producer / login fields are never trusted', s1);
    WS.writeWindowStamp(d, k, { ...win(FOREIGN), at: 200 }, null);
    const s2 = WS.readWindowStamp(d, k);
    ok(Object.prototype.hasOwnProperty.call(s2, 'producer') && s2.producer === null && s2.login && s2.login.sevenDay === OWN && s2.login.producer === 'login' && s2.login.at === 100,
      'a stamp nobody can tell names `producer: null` (never a missing field) and CARRIES the login identity it replaced, its own instant kept', s2);
    WS.writeWindowStamp(d, k, { ...win(THIRD), at: 300 }, 'oat:5');
    const s3 = WS.readWindowStamp(d, k);
    ok(s3.producer === 'oat:5' && s3.login && s3.login.sevenDay === OWN && s3.login.at === 100, '…a token stamp over it carries the SAME identity on (never the null stamp\'s window)', s3);
    WS.writeWindowStamp(d, k, { ...win(THIRD), at: 400 }, 'repair:oat:5');
    ok(WS.readWindowStamp(d, k).login?.sevenDay === OWN, '…and so does the repair\'s');
    fs.writeFileSync(file, '[1,2]'); ok(WS.readWindowStamp(d, k) === null && WS.readWindowStamp(d, 'sub-absent') === null, 'the ONE reader: an array / an absent file ⇒ null');
  });
  // ── §9c THE PURE CLASSES (oat-identity-model): unknown / repair stamps judged like legacy ones; the lost identity ──
  await guard9(async () => {
    const FA = 5000;
    const at = (t, extra = {}) => ({ ...win(OWN), at: t, ...extra });
    const cls = [[{ producer: null }, 'unknown'], [{ producer: 'repair:login' }, 'repair'], [{ producer: 'oat:1' }, 'token'], [{ producer: 'login' }, 'login'], [{}, 'legacy'], [{ producer: '' }, 'legacy'], [{ producer: 7 }, 'legacy']];
    ok(cls.every(([s, c]) => M.stampProducer(at(1, s)) === c), 'stampProducer: null ⇒ unknown · repair:* ⇒ repair · oat:* ⇒ token · login · no field / no string ⇒ legacy', cls.map(([s]) => M.stampProducer(at(1, s))));
    ok(M.stampIsIdentity(at(FA - 1, { producer: null }), FA) && M.stampIsIdentity(at(FA, { producer: 'repair:legacy' }), FA) && M.stampIsIdentity(at(FA + 9, { producer: null }), null)
      && !M.stampIsIdentity(at(FA + 1, { producer: null }), FA) && !M.stampIsIdentity(at(FA + 1, { producer: 'repair:login' }), FA),
    'an unknown / repair stamp is identity only when written at or before the row\'s first token (no generation of it existed), never after — like a legacy one');
    const carriedLogin = { ...win(THIRD), at: 10, producer: 'login' };
    ok(M.identityOf({ established: at(FA + 50, { producer: 'repair:login', login: carriedLogin }), firstAt: FA })?.window.sevenDay === THIRD && M.identityOf({ established: at(FA + 50, { producer: 'repair:login', login: carriedLogin }), firstAt: FA }).at === 10,
      'a repair stamp after the first token is no identity by itself — the login identity it CARRIED is, at its own instant (the repair never re-dates evidence)');
    ok(M.identityCarry(at(FA + 1, { producer: null, login: carriedLogin }))?.sevenDay === THIRD && M.identityCarry(at(FA + 1, { producer: null }))?.sevenDay === OWN && !('producer' in M.identityCarry(at(FA + 1, { producer: null }))),
      'identityCarry: an unknown stamp passes on what it carried, else its own window undated by producer (judged by its instant later)');
    const lost = (st, anchor = null) => M.identityLost({ established: st, oatAnchor: anchor, firstAt: FA });
    ok(lost(at(FA + 1)) && lost(at(FA + 1, { producer: null })) && lost(at(FA + 1, { producer: 'repair:legacy' })) && lost(at(FA + 1, { producer: 'oat:1', login: at(FA + 1) })),
      'identityLost: a legacy / unknown / repair stamp after the first token (or a token stamp CARRYING such a one) — the identity was lost, not never made');
    ok(!lost(at(FA + 1, { producer: 'oat:1' })) && !lost(at(FA + 1, { producer: 'login' })) && !lost(at(FA - 1)) && !lost(at(FA + 1), { ...win(OWN), at: FA + 2, how: 'owner-confirmed' }) && !lost(null),
      '…never for a fresh token-only row (only its token ever stamped it), a login stamp, a stamp before the first token, an owner\'s answer, or no stamp');
    ok(M.rowLostOf({ established: at(FA + 1), since: FA }) && !M.rowLostOf({ established: at(FA + 1), since: FA + 5 }) && !M.rowLostOf({ established: at(FA + 1), oatAnchor: { ...win(OWN), at: FA + 2, mint: 'p', how: 'owner-confirmed' }, since: FA }),
      'rowLostOf: the same first-token instant as rowAnchorOf (unknown ⇒ the save); a self mint anchor of THIS generation is an anchor, not a loss');
    const since = T0 - 300e3, armed = { state: 'pending', since, gen: since };
    const rd = (extra = {}) => ({ window: win(FOREIGN), at: T0, viaToken: true, gen: since, eligible: ELIGIBLE, ...extra });
    const V = (row, r) => M.identityPostCheck({ check: armed, anchor: null, orgUuid: null, others: [], ...row }, r, { now: T0, k: K });
    const vu = V({}, rd({ viaToken: null }));
    ok(vu.verdict === 'stale-token' && vu.road === 'unknown', 'fix r3 F-R1: a reading whose ROAD is unknown (viaToken null) judges nothing — stale-token, road unknown — before any other rung', vu);
    ok(V({ lost: true }, rd()).verdict === 'lost' && V({ lost: true, others: [{ id: 'sub-o', window: win(FOREIGN) }] }, rd()).verdict === 'hint' && V({}, rd()).verdict === 'no-anchor',
      'a lost row\'s eligible token reading is `lost` (the ONE anchor ask); another row\'s window still makes it a hint; a row with nothing to lose stays no-anchor');
    ok(M.POST_CHECK_VERDICTS.includes('lost') && !M.POST_CHECK_VERDICTS.includes('unknown-road'), 'the verdict list: + lost (the unknown road is a stale-token, never a verdict of its own)');
    const rs = (c) => M.identityRowState({ state: 'pending', since: T0 - 2 * 86400e3, ...c }, T0);
    ok(rs({ ask: { kind: 'anchor', lost: true, win: win(FOREIGN) } }) === 'lost' && rs({ ask: { kind: 'anchor', win: win(FOREIGN) } }) === 'anchor' && rs({ unknownRoad: { at: T0 - 5 } }) === 'unknown-road' && rs({}) === 'unverified'
      && rs({ unknownRoad: { at: T0 - 5 }, ask: { kind: 'hint', others: ['x'], win: win(FOREIGN) } }) === 'hint',
    'the roster: a lost anchor ask says `lost` (「身份未验证」 + the answer), an unknown road says so over 「身份未验证」, an open ask outranks both');
  });
  // ── §9d THE ROAD IS A FACT OF THE SESSION: written to the meta at spawn, restored by sessionFromMeta (all three boot paths),
  // one schema row each — and the engine reads ONE answer for the ring and the check ──
  await guard9(async () => {
    const wc = read('src/ws-create.js'), br = read('src/server/boot-restore.js');
    const schema = require(path.join(REPO, 'src/session-schema.js')).SESSION_FIELDS;
    ok(/billingHow: session\._billingHow \|\| undefined, oatRoad: session\._oatRoad \|\| undefined, oatGen: session\._oatGen \|\| undefined,/.test(wc),
      'fix r3 F-R1: ws-create writes HOW it billed, the token\'s ROAD and its GENERATION into the session meta at spawn');
    ok(schema._billingHow?.persisted === 'session-meta billingHow' && schema._oatRoad?.persisted === 'session-meta oatRoad' && schema._oatGen?.persisted === 'session-meta oatGen'
      && (br.match(/= sessionFromMeta\(meta, \{/g) || []).length === 3, '…the ONE schema says each is persisted, and every boot-restore path rebuilds its session through sessionFromMeta');
    const body = br.slice(br.indexOf('function sessionFromMeta(meta, transportFacts) {'), br.indexOf('\n}\n', br.indexOf('function sessionFromMeta(meta, transportFacts) {')) + 3);
    const sessionFromMeta = new Function('os', 'poolPinFromMeta', body + '\nreturn sessionFromMeta;')(os, () => null);
    const nw = sessionFromMeta({ accountId: 'sub-a', billingHow: 'oat', oatRoad: 'env', oatGen: 1790000000123 }, {});
    const old = sessionFromMeta({ accountId: 'sub-a' }, {});
    const junk = sessionFromMeta({ accountId: 'sub-a', billingHow: 7, oatRoad: 'tunnel', oatGen: 'x' }, {});
    ok(nw._billingHow === 'oat' && nw._oatRoad === 'env' && nw._oatGen === 1790000000123 && old._billingHow === null && old._oatRoad === null && old._oatGen === null && junk._billingHow === null && junk._oatRoad === null && junk._oatGen === null,
      'sessionFromMeta (the REAL function, compiled off boot-restore): a stamped meta restores the road whole; a meta older than the stamp (or a malformed one) restores NONE — never a guess', { nw: [nw._billingHow, nw._oatRoad, nw._oatGen], old: [old._billingHow, old._oatRoad], junk: [junk._billingHow, junk._oatRoad, junk._oatGen] });
    const eng = read('src/server/usage-pool-engine.js');
    ok(/const road = \(\) => roadOf \|\| \(roadOf = \(\(\) => \{ try \{ return readingRoad\(session, slotKey\); \} catch \{ return \{ producer: null, viaToken: null, gen: null \}; \} \}\)\(\)\);\n\s+const producer = \(\) => road\(\)\.producer;/.test(eng)
      && /viaToken: \(\) => road\(\)\.viaToken, gen: \(\) => road\(\)\.gen, eligible: witness/.test(eng),
    'fix r3 F-R1: ONE road answer per reading — the witness ring\'s producer and the check\'s token + generation are the same readingRoad (the two halves can no longer disagree)');
  });
  // ── §9e THE REAL PRODUCER — verify r3's S1 legs (p4.cjs, copied as suite legs): a conversation restored after a restart ──
  const tapV = (e) => { const v = []; const o = e.oatIdentity.onReading; e.oatIdentity.onReading = (k, r) => { const x = o(k, r); v.push(x.verdict); return x; }; return v; };
  const identityIn = (w, eng, id) => { const i = M.identityOf({ established: eng.establishedWindows()[id] || w.sidecar(id), oatAnchor: w.a.oatAnchorOf(id), firstAt: w.a.oatFirstAtOf(id) }); return i ? i.window.sevenDay : null; };
  const ringOf = (w, id) => ((w.sidecar(id, 'apiwin') || {}).ring || []).map((e) => (e.producer === undefined ? '(none)' : e.producer));
  const rosterOf = (w, id) => (w.a.list().accounts.find((r) => r.id === id) || {}).oatIdentity || null;
  const roadIn = (e, s, k) => (typeof e.readingRoad === 'function' ? e.readingRoad(s, k) : { producer: '(no readingRoad)', viaToken: '(no readingRoad)' }); // a tree without fix r3 still shows the behaviour
  const deadLogin = (w, id) => fs.writeFileSync(path.join(w.a.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() - 36e5, refreshTokenExpiresAt: Date.now() - 86400e3, subscriptionType: 'max' } }), { mode: 0o600 });
  for (const variant of ['bare', 'dead-login', 'our-file']) await guard9(async () => {
    const w = world(), am9 = w.a, done = quiet();
    try {
      const A = am9.createSubscription({ name: 'Work' }).id, B = am9.createSubscription({ name: 'Other' }).id;
      w.writeCache(A, W_A); w.stamp(A, { sevenDay: W_A, producer: 'login' }); w.writeCache(B, W_B); w.stamp(B, { sevenDay: W_B, producer: 'login' });
      if (variant === 'dead-login') deadLogin(w, A);
      if (variant === 'our-file') { am9.oatFileCaps = () => ({ known: true, ok: true, cli: '2.1.296' }); am9.get(A).oatShape = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' }; }
      am9.setOat(A, tok('S1')); // T1 is really Other's (W_B)
      if (variant === 'our-file') await am9.oatFileSettled(A);
      await sleep(3);
      const eng = w.mkEngine(); eng.oatIdentityAttach();
      const v = tapV(eng);
      const r = w.restoredSess(A); // the server restarted after the save; T1's conversation survived on a meta older than the road stamp
      turns(eng, r, W_B, K);
      const restored = { verdicts: v.slice(), ring: ringOf(w, A), road: roadIn(eng, r, A), sc: w.sidecar(A), identity: identityIn(w, eng, A), roster: rosterOf(w, A) };
      const s2 = w.envSess(A); // a NEW conversation spawned on T1 (its road stamped)
      const realNow = Date.now; Date.now = () => realNow() + 6000;
      try { eng.recordRateLimitEvent(s2, ev(W_B, 0.5)); eng.noteTurnEnd(s2); } finally { Date.now = realNow; }
      const after = { verdict: v[v.length - 1], state: w.st(A), roster: rosterOf(w, A) };
      done();
      if (variant === 'our-file') {
        ok(!restored.ring.includes('login') && restored.road.producer === null && restored.verdicts.every((x) => x === 'stale-token') && restored.identity === W_A && after.state !== 'confirmed',
          'S1-our-file: the same restored conversation on a row whose folder holds OUR token file — its road is unknown too (the env token it spawned with, or the file now? which generation?): no witness\'s producer, judged nothing, never the login\'s; the identity stays W_A', { restored, after });
      } else {
        ok(!restored.ring.includes('login') && restored.road.producer === null && restored.road.viaToken === null && restored.verdicts.every((x) => x === 'stale-token') && restored.identity === W_A && (!restored.sc || restored.sc.producer !== 'login'),
          `S1-${variant} (verify r3 F-R1, RED on f98c55db6): a conversation RESTORED from a meta older than the road stamp on ${variant === 'bare' ? 'a token-only row' : 'a row whose folder holds a DEAD login'} — its K readings are never the LOGIN's: no witness's producer, judged nothing (stale-token, road unknown), the row's identity stays W_A`, restored);
        ok(restored.roster === 'unknown-road', `S1-${variant}: the row says 「这段对话的 token 来路未知，不参与身份判断」 (unknown-road) while only that conversation has read the token`, restored.roster);
        ok(after.verdict === 'suspect' && after.state === 'pending' && after.roster === null, `S1-${variant}: the next properly stamped conversation on T1 is judged against W_A — a SUSPECT (never confirmed by the token's own phase), and the unknown-road line goes`, after);
      }
    } finally { try { done(); } catch { } }
  });
  await guard9(async () => {
    // S1d (verify r3, RED on f98c55db6): a pending moved ask (the token's readings alone moved the row's window), a restart,
    // K restored turns on the token's phase — never `proven` as the login, the ask never answered by the token itself
    const w = world(), am9 = w.a, done = quiet();
    const realNow = Date.now;
    try {
      const A = am9.createSubscription({ name: 'Work' }).id;
      const W_A2 = slot(6, 14);
      w.writeCache(A, W_A); w.stamp(A, { sevenDay: W_A, producer: 'login' });
      am9.setOat(A, tok('S1d')); await sleep(3);
      const eng = w.mkEngine(); eng.oatIdentityAttach();
      turns(eng, w.envSess(A), W_A2, K);
      const c1 = { ask: am9.oatCheckOf(A)?.ask?.kind || null, sc: w.sidecar(A) };
      const eng2 = w.mkEngine(); eng2.oatIdentityAttach(); const v2 = tapV(eng2);
      Date.now = () => realNow() + 6000;
      turns(eng2, w.restoredSess(A), W_A2, K);
      const restored = { sc: w.sidecar(A), verdicts: v2.slice() };
      Date.now = () => realNow() + 12000;
      eng2.recordRateLimitEvent(w.envSess(A), ev(W_A2, 0.6));
      const after = { verdict: v2[v2.length - 1], state: w.st(A), ask: am9.oatCheckOf(A)?.ask?.kind || null, open: w.open().length };
      Date.now = realNow; done();
      ok(c1.ask === 'anchor' && /^oat:/.test(c1.sc.producer) && restored.sc.producer !== 'login' && restored.verdicts.every((x) => x === 'stale-token') && after.verdict !== 'confirmed' && after.ask === 'anchor' && after.open === 1,
        'S1d: a restored conversation\'s readings never re-stamp the token\'s window as the LOGIN\'s (`proven`) — the pending anchor ask stays open, the token never confirms against its own phase', { c1: { ask: c1.ask, producer: c1.sc.producer }, restored: { producer: restored.sc.producer, verdicts: restored.verdicts }, after });
    } finally { Date.now = realNow; try { done(); } catch { } }
  });
  await guard9(async () => {
    // the road PERSISTED: the same restored conversation on a FOREIGN token, but its meta carried the road (sessionFromMeta
    // restores billingHow / oatRoad / oatGen) — its readings are the token's, judged, and never the row's identity
    const w = world(), am9 = w.a, done = quiet();
    try {
      const A = am9.createSubscription({ name: 'Work' }).id, B = am9.createSubscription({ name: 'Other' }).id;
      w.writeCache(A, W_A); w.stamp(A, { sevenDay: W_A, producer: 'login' }); w.writeCache(B, W_B); w.stamp(B, { sevenDay: W_B, producer: 'login' });
      am9.setOat(A, tok('S1p')); await sleep(3);
      const eng = w.mkEngine(); eng.oatIdentityAttach(); const v = tapV(eng);
      const r = w.restoredSess(A); Object.assign(r, { _billingHow: 'oat', _oatRoad: 'env', _oatGen: am9.get(A).oatMintedAt }); // what sessionFromMeta restores off a stamped meta
      turns(eng, r, W_B, K);
      const out = { verdicts: v.slice(), ring: ringOf(w, A), sc: w.sidecar(A), identity: identityIn(w, eng, A), state: w.st(A) };
      done();
      ok(out.ring.every((p) => /^oat:\d+$/.test(p)) && /^oat:\d+$/.test(out.sc.producer) && out.sc.login?.sevenDay === W_A && out.identity === W_A && out.verdicts.join() === ['suspect', 'suspect', 'mismatch'].slice(-K).join() && out.state === 'mismatch',
        'the road PERSISTED: a restored env-road conversation on a FOREIGN token — its readings are the token\'s (oat:<gen>), the K-run\'s stamp carries Work\'s identity, the token is marked (Other holds W_B) — never confirmed as the row\'s', out);
    } finally { try { done(); } catch { } }
  });
  await guard9(async () => {
    // the road answer itself: unknown ⇒ null (only on a row that holds / held a token), a recorded remote / global billing ⇒
    // the login, a pool ⇒ the file road, a row that never held a token ⇒ its login without a file read
    const w = world(), am9 = w.a, done = quiet();
    try {
      const A = am9.createSubscription({ name: 'Tok' }).id, L = am9.createSubscription({ name: 'Plain' }).id;
      am9.setOat(A, tok('RD'));
      const eng = w.mkEngine();
      const rd = (s, k) => { const r = eng.readingRoad(s, k); return `${r.producer}|${r.viaToken}`; };
      const base = { backend: 'claude', _accountId: A };
      const got = { unknown: rd(base, A), hostHeld: rd({ ...base, _billingHow: 'host-held' }, A), ship: rd({ ...base, _billingHow: 'ship' }, A), env: rd({ ...base, _billingHow: 'oat', _oatRoad: 'env', _oatGen: am9.get(A).oatMintedAt }, A), plain: rd({ backend: 'claude', _accountId: L }, L), cleared: null };
      am9.clearOat(A);
      got.cleared = rd(base, A); // held a token once (its first-token instant kept): a restored process may still carry it
      done();
      ok(got.unknown === 'null|null' && got.hostHeld === 'login|false' && got.ship === 'login|false' && /^oat:\d+\|true$/.test(got.env) && got.plain === 'login|false' && got.cleared === 'null|null',
        'readingRoad: no road recorded on a token row ⇒ unknown (null); a recorded remote login (host-held / ship) ⇒ login; the env road ⇒ oat:<gen>; a row that never held a token ⇒ login; a row whose token was removed ⇒ still unknown for a road-less conversation', got);
    } finally { try { done(); } catch { } }
  });
  // ── §9f THE STANDING REPAIR CARRIES (verify r3 S2a, RED on f98c55db6) + the production shape (7/16 repair-seeded stamps) ──
  const seedAnchors = (w, id, wv, n = 5) => { const dir = path.join(path.dirname(w.cd), 'usage-anchors'); fs.mkdirSync(dir, { recursive: true }); const lines = []; for (let i = 0; i <= n; i++) lines.push(JSON.stringify({ accountId: id, source: 'rate-limit-event', fetchedAt: Date.now() - (n - i) * 60e3, buckets: { sevenDay: { u: 0.1 + i / 100, resetsAt: wv } } })); fs.appendFileSync(path.join(dir, `anchors-${id}.ndjson`), lines.join('\n') + '\n'); };
  await guard9(async () => {
    const w = world(), am9 = w.a, done = quiet();
    const realNow = Date.now;
    try {
      const A = am9.createSubscription({ name: 'Work' }).id, B = am9.createSubscription({ name: 'Other' }).id, C = am9.createSubscription({ name: 'Moved' }).id;
      const W_C2 = slot(2, 20);
      w.writeCache(A, W_A); w.stamp(A, { sevenDay: W_A, producer: 'login', verifiedAt: Date.now() - 3600e3, verifiedBy: 'api-phase' });
      w.writeCache(B, W_B); w.stamp(B, { sevenDay: W_B, producer: 'login', verifiedAt: Date.now() - 3600e3, verifiedBy: 'api-phase' });
      w.writeCache(C, W_C); w.stamp(C, { sevenDay: W_C, producer: 'login', verifiedAt: Date.now() - 3600e3, verifiedBy: 'api-phase' });
      am9.setOat(A, tok('S2')); await sleep(3); // Work's OWN token
      const eng = w.mkEngine(); eng.oatIdentityAttach(); const v = tapV(eng);
      turns(eng, w.envSess(A), W_A, 1);
      const confirmed = w.st(A);
      seedAnchors(w, A, W_A); seedAnchors(w, B, W_B); seedAnchors(w, C, W_C2); // C's API evidence moved (a renewal the panel never saw)
      const rep = eng.repairIdentityAnchors('hourly');
      const scA = w.sidecar(A), scB = w.sidecar(B), scC = w.sidecar(C);
      const rowOf = (k) => rep.identities.find((x) => x.key === k)?.sidecar;
      ok(rowOf(A) === 'confirmed' && scA.producer === 'repair:login' && scA.login?.sevenDay === W_A && scA.login.producer === 'login' && scA.seededBy === 'identity-repair:hourly',
        'S2a: the hourly repair\'s confirm names its producer (repair:<the stamp it agreed with> = repair:login) and CARRIES the login identity — never a producer-less stamp', { row: rowOf(A), scA });
      ok(rowOf(C) === 'restamped' && Object.prototype.hasOwnProperty.call(scC, 'producer') && scC.producer === null && scC.sevenDay === W_C2 && scC.login?.sevenDay === W_C,
        'S2a: a re-stamp from evidence that names no producer is `producer: null` (nobody can tell) — and carries the identity it replaced', { row: rowOf(C), scC });
      Date.now = () => realNow() + 6000;
      const ids = { A: identityIn(w, eng, A), B: identityIn(w, eng, B), C: identityIn(w, eng, C) };
      Date.now = realNow;
      ok(ids.A === W_A && ids.B === W_B && ids.C === W_C2, 'S2a: a repair never DEMOTES: Work keeps its login identity (carried), Other keeps its own; a row that never held a token takes the repair\'s phase (no token existed to produce its evidence)', ids);
      await sleep(3);
      am9.setOat(A, tok('S2b')); // the owner re-mints Work's own token
      Date.now = () => realNow() + 7000;
      turns(eng, w.envSess(A), W_A, 1);
      const remint = { v: v[v.length - 1], st: w.st(A) };
      Date.now = realNow;
      await sleep(3);
      am9.setOat(A, tok('S2c')); // …and a FOREIGN token (Other's) on Work
      Date.now = () => realNow() + 14000;
      turns(eng, w.envSess(A), W_B, K);
      const foreign = { v: v.slice(-K), st: w.st(A), open: w.open().length };
      Date.now = realNow; done();
      ok(confirmed === 'confirmed' && remint.v === 'confirmed' && remint.st === 'confirmed', 'S2a: after the repair a re-minted OWN token still confirms on its first reading', { confirmed, remint });
      ok(foreign.v.join() === ['suspect', 'suspect', 'mismatch'].slice(-K).join() && foreign.st === 'mismatch' && foreign.open === 1, 'S2a: …and a FOREIGN token is still marked after K readings (Other\'s identity survived the repair too), ONE notice', foreign);
    } finally { Date.now = realNow; try { done(); } catch { } }
  });
  await guard9(async () => {
    // THE PRODUCTION SHAPE (verify r3: 7 of 16 sidecars `seededBy: identity-repair:*`, no producer): such a stamp written AFTER
    // the row's first token says nothing about who produced it ⇒ the identity was LOST: the ONE anchor ask (「身份未验证」),
    // never a mark, never silence; the owner's `mine` confirms; written BEFORE the first token it is still identity
    const w = world(), am9 = w.a, done = quiet();
    const realNow = Date.now;
    try {
      const A = am9.createSubscription({ name: 'Prod' }).id, P = am9.createSubscription({ name: 'Early' }).id;
      w.writeCache(A, W_A); w.writeCache(P, W_C);
      am9.setOat(A, tok('PS')); await sleep(3);
      const repairSeeded = (wv, at) => ({ sevenDay: wv, fiveHour: null, scoped: {}, at, source: 'api', verifiedAt: at, verifiedBy: 'rate-limit-events', scopedRule: 'same-phase-as-7d', n: 6, of: 6, seededBy: 'identity-repair:hourly' });
      fs.writeFileSync(path.join(w.cd, readingLag.windowSidecarName(A)), JSON.stringify(repairSeeded(W_A, Date.now())));
      fs.writeFileSync(path.join(w.cd, readingLag.windowSidecarName(P)), JSON.stringify(repairSeeded(W_C, Date.now() - 86400e3)));
      await sleep(3);
      am9.setOat(P, tok('PE'));
      const eng = w.mkEngine(); eng.oatIdentityAttach(); const v = tapV(eng);
      const s = w.envSess(A);
      turns(eng, s, W_A, K + 2);
      const asked = { v: v.slice(), st: w.st(A), ask: am9.oatCheckOf(A)?.ask || null, open: w.open().length, roster: rosterOf(w, A), text: (w.open()[0] || {}).text || '' };
      turns(eng, w.envSess(P), W_C, 1);
      const early = { v: v[v.length - 1], st: w.st(P) };
      eng.oatAnswer(A, 'mine');
      Date.now = () => realNow() + 6000;
      turns(eng, s, W_A, 1);
      const answered = { st: w.st(A), open: w.open().length, roster: rosterOf(w, A) };
      Date.now = realNow; done();
      ok(asked.v[0] === 'lost' && asked.v.every((x) => x === 'lost') && asked.st === 'pending' && asked.ask?.kind === 'anchor' && asked.ask.lost === true && asked.open === 1 && asked.roster === 'lost' && /is unverified: its usage window can no longer say whose it is/.test(asked.text),
        'the production shape: a producer-less repair-seeded stamp written AFTER the row\'s first token ⇒ `lost` ⇒ ONE anchor ask (「身份未验证」 on the row, ONE For-you item over K+2 readings), never a mark, the pool keeps placing', { v: asked.v, st: asked.st, ask: asked.ask, open: asked.open, roster: asked.roster });
      ok(answered.st === 'confirmed' && answered.open === 0 && answered.roster === 'confirmed', '…the owner\'s `mine` answers it: the window becomes the row\'s owner-confirmed anchor, the item resolved', answered);
      ok(early.v === 'confirmed' && early.st === 'confirmed', '…and the same stamp written BEFORE the row\'s first token is still its identity (no generation of the token existed) — confirmed', early);
    } finally { Date.now = realNow; try { done(); } catch { } }
  });
  // ── §9g THE LOW ROADS (verify r3 L-R1 / L-R2 / L-R3) ──
  await guard9(async () => {
    const w = world(), am9 = w.a, done = quiet();
    try {
      const L = am9.createSubscription({ name: 'Login Row' }).id; w.writeCache(L, W_C); w.stamp(L, { sevenDay: W_C, producer: 'login' });
      const A = am9.createSubscription({ name: 'Dup' }).id, A2 = am9.createSubscription({ name: 'Main' }).id;
      w.writeCache(A, W_A); am9.setEmail(A, 'same@example.com'); am9.setEmail(A2, 'same@example.com');
      am9.setOat(A, tok('MG')); await sleep(3);
      const eng = w.mkEngine(); eng.oatIdentityAttach();
      turns(eng, w.envSess(A), W_C, 1); // a hint ask + its For-you item on Dup
      const before = { ask: am9.oatCheckOf(A)?.ask?.kind || null, open: w.open().length };
      am9.mergeSubscription(A, A2);
      const after = { token: !!am9.get(A2)?.oatEnc, check: am9.oatCheckOf(A2), firstAt: am9.oatFirstAtOf(A2), open: w.open().length };
      done();
      ok(before.ask === 'hint' && before.open === 1 && after.token && after.check?.state === 'pending' && after.check.gen === am9.get(A2).oatMintedAt && after.firstAt > 0 && after.open === 0,
        'L-R1: a token folded into a duplicate row (mergeSubscription) is ARMED on the survivor with its generation, and the folded row\'s open ask is resolved (no orphan)', { before, after });
    } finally { try { done(); } catch { } }
  });
  await guard9(async () => {
    const w1 = world(), w2 = world(), done = quiet();
    const realNow = Date.now;
    try {
      const A = w1.a.createSubscription({ name: 'Exported' }).id; w1.a.setOat(A, tok('IM'));
      w2.a.importBundle(w1.a.exportBundle());
      const ck = w2.a.oatCheckOf(A);
      Date.now = () => realNow() + 25 * 3600e3; const roster = rosterOf(w2, A); Date.now = realNow;
      done();
      ok(ck && ck.state === 'pending' && ck.gen === w2.a.get(A).oatMintedAt && w2.a.oatFirstAtOf(A) > 0 && roster === 'unverified',
        'L-R2: a token that arrives by importBundle is ARMED like a saved one (its generation, this instance\'s first-token instant) and says 「身份未验证」 after a day', { ck, roster });
    } finally { Date.now = realNow; try { done(); } catch { } }
  });
  await guard9(async () => {
    // L-R3 (verify r3 S5b): a login stamp written while the engine's established-window memo is warm, then a token K-run in
    // ONE turn — the ONE writer reads the stamp on DISK for the carry (never the memo), so the identity survives
    const w = world(), am9 = w.a, done = quiet();
    try {
      const A = am9.createSubscription({ name: 'Work' }).id; w.writeCache(A, W_A);
      am9.setOat(A, tok('MM')); await sleep(3);
      const eng = w.mkEngine(); eng.oatIdentityAttach();
      const s = w.envSess(A);
      eng.recordRateLimitEvent(s, ev(W_A, 0.1)); eng.noteTurnEnd(s); // warms the memo: no stamp yet
      w.stamp(A, { sevenDay: W_A, producer: 'login', at: Date.now() - 1000 }); // the login's ⟳ panel, inside the memo window
      const W_A2 = slot(6, 14);
      for (let i = 0; i < K; i++) eng.recordRateLimitEvent(s, ev(W_A2, 0.2 + i / 1000));
      const sc = w.sidecar(A);
      const idn = M.identityOf({ established: sc, oatAnchor: am9.oatAnchorOf(A), firstAt: am9.oatFirstAtOf(A) });
      done();
      ok(sc && sc.login?.sevenDay === W_A && idn && idn.window.sevenDay === W_A, 'L-R3: a token K-run inside the established-window memo still CARRIES the login stamp written there (the writer reads the disk) — the identity survives', { sc, idn: idn && idn.window.sevenDay });
    } finally { try { done(); } catch { } }
  });
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

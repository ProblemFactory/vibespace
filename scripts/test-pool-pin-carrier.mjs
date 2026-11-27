#!/usr/bin/env node
// test-pool-pin-carrier — FAST (PURE + text pins). B-2083's carrier follow (lane lg-rewind, 主开发 r5180 / r5363 / r5367): the page takes
// the LIVE pin fact into its resume carrier (src/lib/pool-pin-carrier.js carrierPatches, called once by the sidebar's 'active-sessions'
// handler through sidebar-state _followPins), so a pin made elsewhere (an automation key, another page) rides a person's resume after
// the end. ① the table: adopt · equal ⇒ nothing · cleared on the same pool · another pool's carrier kept · a carrier with no pool
// cleared · rows it never follows (remote, not pooled, no key) · ② THE EDGE (another page's act, an older list repeating an old fact
// writes nothing) + RED (no edge) · ③ THE GUARD (r5367: a list older than this page's own pin or clear never undoes it): this page's
// press is a FENCE until a list carries it, each way + RED (fences ignored), a refused press lifts it, a later act is followed after
// the lift · ④ the wiring pins (the one call, the one batch, the press's fence before its request and lifted on its refusal).
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
import { carrierPatches, carriesPress, pinSigOf, followsPin } from '../src/lib/pool-pin-carrier.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const J = (x) => JSON.stringify(x);
const ROW = (key, pin, o = {}) => ({ sessionKey: key, accountId: 'pool-a', host: null, auth: { source: 'pooled' }, poolPin: pin, ...o });
const PIN = (memberId, at) => ({ memberId, name: memberId + ' name', at });
const CAR = (memberId, at, poolId = 'pool-a') => ({ poolPin: { memberId, at, ...(poolId ? { poolId } : {}) } });
const run = (Mod, rows, { cfg = {}, seen = {}, fences = {} } = {}) => Mod.carrierPatches(rows, { configOf: (k) => cfg[k] || null, seen: new Map(Object.entries(seen)), fences: new Map(Object.entries(fences)) });
const SRC = fs.readFileSync(path.join(ROOT, 'src/lib/pool-pin-carrier.js'), 'utf8');
const M = mutantCopies('pool-pin-carrier', ROOT);
const copy = async (from, to, tag) => import(pathToFileURL(M.write('src/lib/pool-pin-carrier.js', anchored(SRC, from, to, tag), tag)).href);
const REAL = { carrierPatches };

console.log('① the table');
{
  const a = run(REAL, [ROW('claude:c1', PIN('sub-x', 100))]);
  ok(J(a.patches) === J([['claude:c1', { poolPin: { memberId: 'sub-x', at: 100, poolId: 'pool-a' } }]]) && a.seen.get('claude:c1') === 'sub-x#100' && !a.lifted.length,
    'a live pooled row\'s pin becomes the carrier {memberId, at, poolId: the row\'s pool} (the row\'s name is not carried)', a);
  ok(!run(REAL, [ROW('claude:c1', PIN('sub-x', 100))], { cfg: { 'claude:c1': CAR('sub-x', 100) } }).patches.length, 'an EQUAL carrier writes nothing (several pages converge on one value)');
  ok(J(run(REAL, [ROW('claude:c1', PIN('sub-y', 130))], { cfg: { 'claude:c1': CAR('sub-x', 100) }, seen: { 'claude:c1': 'sub-x#100' } }).patches) === J([['claude:c1', { poolPin: { memberId: 'sub-y', at: 130, poolId: 'pool-a' } }]]),
    'a new pin on the live row replaces the carrier\'s');
  ok(J(run(REAL, [ROW('claude:c1', null)], { cfg: { 'claude:c1': CAR('sub-x', 100) }, seen: { 'claude:c1': 'sub-x#100' } }).patches) === J([['claude:c1', { poolPin: null }]]),
    'a live row with NO pin clears a carrier pin made on THAT pool (a key\'s or another page\'s «automatic»)');
  ok(!run(REAL, [ROW('claude:c1', null)], { cfg: { 'claude:c1': CAR('sub-x', 100, 'pool-b') }, seen: { 'claude:c1': 'sub-x#100' } }).patches.length,
    'a carrier pin made on ANOTHER pool stays (a pin applies only to the pool it was made on)');
  ok(J(run(REAL, [ROW('claude:c1', null)], { cfg: { 'claude:c1': CAR('sub-x', 100, null) }, seen: { 'claude:c1': 'sub-x#100' } }).patches) === J([['claude:c1', { poolPin: null }]]),
    'a carrier pin that names no pool (an older page\'s) is cleared by its live row');
  const never = run(REAL, [ROW('claude:r1', PIN('sub-x', 1), { host: 'h-1' }), ROW('claude:s1', PIN('sub-x', 1), { auth: { source: 'subscription' } }), ROW('', PIN('sub-x', 1)), ROW('claude:n1', PIN('sub-x', 1), { accountId: null })]);
  ok(!never.patches.length && never.seen.size === 0 && ['claude:r1', 'claude:s1', '', 'claude:n1'].every((k) => !never.seen.has(k)) && followsPin(ROW('claude:c1', null)) && !followsPin(null),
    'never followed: a remote row, a row that bills no pool, a row with no conversation key, a row with no account (a stopped conversation has no live row at all)', never);
  ok(pinSigOf(null) === '-' && pinSigOf({ memberId: '' }) === '-' && pinSigOf(PIN('sub-x', 5)) === 'sub-x#5' && carriesPress(null, null) && carriesPress('sub-x', PIN('sub-x', 9)) && !carriesPress('sub-x', PIN('sub-y', 9)) && !carriesPress(null, PIN('sub-x', 9)) && !carriesPress('sub-x', null),
    'the signature and «carries the press» (a pin of the member pressed · no pin for «Back to automatic»)');
}

console.log('② THE EDGE — an older list repeating an old fact writes nothing');
{
  // another page pinned sub-x (its carrier reached this page by user-state); this page's last list showed no pin and the next list is an
  // older one that still shows none: no edge ⇒ the carrier stands
  const r = run(REAL, [ROW('claude:c1', null)], { cfg: { 'claude:c1': CAR('sub-x', 100) }, seen: { 'claude:c1': '-' } });
  ok(!r.patches.length && r.seen.get('claude:c1') === '-', 'ANOTHER PAGE\'s pin (its carrier synced here) is not undone by a list repeating «no pin» — no edge, no write', r);
  const first = run(REAL, [ROW('claude:c1', null)], { cfg: { 'claude:c1': CAR('sub-x', 100) } });
  ok(J(first.patches) === J([['claude:c1', { poolPin: null }]]), 'the FIRST list after a load is an edge (the hub\'s current state): a pin cleared while the page was closed leaves the carrier', first);
  const X = await copy('    if (seen.has(key) && seen.get(key) === sig) continue;', '', 'no-edge');
  const rx = run(X, [ROW('claude:c1', null)], { cfg: { 'claude:c1': CAR('sub-x', 100) }, seen: { 'claude:c1': '-' } });
  ok(J(rx.patches) === J([['claude:c1', { poolPin: null }]]), 'RED CONTROL (no edge — a copy): the older list clears the other page\'s pin — the leg above tells the two apart', rx);
}

console.log('③ THE GUARD (r5367) — this page\'s own press is a fence until a list carries it');
{
  const NOFENCE = await copy('    if (fences.has(key)) {', '    if (false) {', 'no-fence');
  // THE PIN WAY: the page saw sub-y; a key cleared it on the hub and this page pressed sub-x before that list arrived; the press wrote
  // its carrier. The list of the key's clear (older than the press) arrives now — an edge — and must not clear the press's carrier.
  const pinWay = { cfg: { 'claude:c1': CAR('sub-x', 140) }, seen: { 'claude:c1': 'sub-y#50' }, fences: { 'claude:c1': 'sub-x' } };
  const older = run(REAL, [ROW('claude:c1', null)], pinWay);
  ok(!older.patches.length && !older.lifted.length, 'PIN: a list older than this page\'s pin (it shows no pin) writes nothing and the fence stands', older);
  const carrying = run(REAL, [ROW('claude:c1', PIN('sub-x', 140))], { ...pinWay, seen: { 'claude:c1': '-' } });
  ok(!carrying.patches.length && J(carrying.lifted) === '["claude:c1"]', 'PIN: the list that carries the press (its member) lifts the fence, writing nothing (the press wrote the carrier)', carrying);
  const xPin = run(NOFENCE, [ROW('claude:c1', null)], pinWay);
  ok(J(xPin.patches) === J([['claude:c1', { poolPin: null }]]), 'RED CONTROL (fences ignored — a copy): the older list CLEARS the pin this page just made', xPin);
  // THE CLEAR WAY: the page saw sub-x and pressed «Back to automatic»; a key had pinned sub-z on the hub just before the clear arrived.
  // That list (older than the clear) arrives now and must not write sub-z back into the carrier the press emptied.
  const clearWay = { cfg: {}, seen: { 'claude:c1': 'sub-x#100' }, fences: { 'claude:c1': null } };
  const olderPin = run(REAL, [ROW('claude:c1', PIN('sub-z', 120))], clearWay);
  ok(!olderPin.patches.length && !olderPin.lifted.length, 'CLEAR: a list older than this page\'s «Back to automatic» (it shows a pin) writes nothing back and the fence stands', olderPin);
  const carriedClear = run(REAL, [ROW('claude:c1', null)], { ...clearWay, seen: { 'claude:c1': 'sub-z#120' } });
  ok(!carriedClear.patches.length && J(carriedClear.lifted) === '["claude:c1"]', 'CLEAR: the list that carries no pin lifts the fence', carriedClear);
  const xClear = run(NOFENCE, [ROW('claude:c1', PIN('sub-z', 120))], clearWay);
  ok(J(xClear.patches) === J([['claude:c1', { poolPin: { memberId: 'sub-z', at: 120, poolId: 'pool-a' } }]]), 'RED CONTROL (fences ignored — a copy): the older list writes a pin back after «Back to automatic»', xClear);
  // after the lift, a later act is followed again (seen = the carrying list's)
  const later = run(REAL, [ROW('claude:c1', PIN('sub-q', 200))], { cfg: { 'claude:c1': CAR('sub-x', 140) }, seen: { 'claude:c1': carrying.seen.get('claude:c1') } });
  ok(J(later.patches) === J([['claude:c1', { poolPin: { memberId: 'sub-q', at: 200, poolId: 'pool-a' } }]]), 'after the lift, a later act (a key\'s pin) is followed', later);
  // a fence on one conversation fences no other
  const two = run(REAL, [ROW('claude:c1', null), ROW('claude:c2', PIN('sub-x', 7))], pinWay);
  ok(J(two.patches) === J([['claude:c2', { poolPin: { memberId: 'sub-x', at: 7, poolId: 'pool-a' } }]]), 'a fence holds only its own conversation', two);
}

console.log('④ the wiring (text pins)');
{
  const SB = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar.js'), 'utf8');
  const ST = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar-state.js'), 'utf8');
  const SL = fs.readFileSync(path.join(ROOT, 'src/lib/session-lifecycle.js'), 'utf8');
  const handler = SB.split('\n').find((l) => l.includes("if (msg.type === 'active-sessions') { this._webuiSessions = msg.sessions;")) || '';
  ok(handler.includes('try { this._followPins(msg.sessions); } catch { }') && SB.split('_followPins(').length === 2, 'the sidebar\'s \'active-sessions\' handler makes the ONE call (_followPins, once a list)');
  const fp = ST.slice(ST.indexOf('proto._followPins = function(rows) {'), ST.indexOf('proto.pinFence = function(key, want) {'));
  ok(fp.length > 100 && fp.split('carrierPatches(').length === 2 && fp.split('this.setSessionConfigs(').length === 2 && /if \(r\.patches\.length\) this\.setSessionConfigs\(r\.patches\);/.test(fp) && /for \(const k of r\.lifted\) fences\.delete\(k\);/.test(fp),
    '_followPins: ONE rule call, ONE batch write (one user-state push) and only when there is something to write; the lifted fences dropped');
  ok(/if \(config\?\.poolPin && typeof config\.poolPin === 'object' && typeof config\.poolPin\.memberId === 'string' && config\.poolPin\.memberId\)/.test(ST), 'the carrier\'s writer keeps a pin only when it has a member: a {poolPin: null} patch removes it');
  const pinTo = SL.slice(SL.indexOf('const pinTo = async (memberId, name) => {'), SL.indexOf('items.push({', SL.indexOf('const pinTo = async (memberId, name) => {')));
  const iFence = pinTo.indexOf('this.sidebar?.pinFence?.(cfgKey, memberId || null);'), iFetch = pinTo.indexOf('await fetchJson(`/api/accounts/'), iLift = pinTo.indexOf('if (!r || r.error) { this.sidebar?.pinFence?.(cfgKey, undefined);');
  ok(iFence > 0 && iFetch > iFence && iLift > iFetch && pinTo.indexOf('if (!isLive) {') < iFence, 'the press: its fence is set BEFORE its request (a live conversation only) and lifted when it is refused (nothing changed)', { iFence, iFetch, iLift });
}

report();

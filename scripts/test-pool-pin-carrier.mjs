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
  const X = await copy('} else if (seen.has(key) && seen.get(key) === sig) continue;', '}', 'no-edge');
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
  const iFence = pinTo.indexOf('const mark = this.sidebar?.pinFence?.(cfgKey, memberId || null);'), iFetch = pinTo.indexOf('await fetchJson(`/api/accounts/'), iLift = pinTo.indexOf('if (!r || r.error) { this.sidebar?.pinFenceLift?.(cfgKey, mark);');
  const iWrite = pinTo.indexOf("if (typeof this.sidebar?.pinFenceStands !== 'function' || this.sidebar.pinFenceStands(cfgKey, mark)) saveCfg(r.pinned ?");
  ok(iFence > 0 && iFetch > iFence && iLift > iFetch && iWrite > iLift && pinTo.indexOf('if (!isLive) {') < iFence && pinTo.split('saveCfg(r.pinned').length === 2,
    'the press (pinTo): its fence, with its own mark, set BEFORE its request (a live conversation only); a refused or failed reply lifts ITS OWN fence; the reply writes the carrier ONLY while its fence stands — the harness of ⑤ is this text, step for step', { iFence, iFetch, iLift, iWrite });
  ok(/const saveCfg = \(pin\) => \{ const next = \{ \.\.\.\(this\.sidebar\?\.getSessionConfig\?\.\(cfgKey\) \|\| \{\}\) \};/.test(pinTo), 'the reply\'s write reads the config as it stands WHEN it writes (the reply comes later than the press)');
}

console.log('⑤ THE LATEST CHOICE IS THE ONE A RESUME CARRIES (r5500) — the real sidebar-state over the real rule, every order of list and reply');
{
  const RULE = path.join(ROOT, 'src/lib/pool-pin-carrier.js');
  const STATE = fs.readFileSync(path.join(ROOT, 'src/lib/sidebar-state.js'), 'utf8');
  // the store DOM-free (as test-session-schema's scratch copy): every import stubbed but the rule, which is the real one or a RED copy
  const pageSrc = (rulePath, text = STATE) => [
    ["import { getSessionKey, backendFeatureCaps } from './agent-meta.js';", 'const getSessionKey = (s) => (s && s.sessionKey) || null, backendFeatureCaps = () => ({});'],
    ["import { showToast, showInputDialog } from './utils.js';", 'const showToast = () => {}, showInputDialog = async () => null;'],
    ["import { t as tr } from './i18n.js';", 'const tr = (x) => x;'],
    [/^import \{ reportOwnerPage \} from '\.\/owner-facts\.js';.*$/m, 'const reportOwnerPage = () => null;'],
    [/^import \{ sessionRowOf, placeOf, settingsPolicy \} from '\.\.\/attention-model\.js';.*$/m, 'const sessionRowOf = () => null, placeOf = () => 0, settingsPolicy = () => null;'],
    [/^import \{[^}]*\} from '\.\.\/user-state-ops\.js';.*$/m, 'const diffOps = () => [], viewOf = (v) => v, createSync = () => ({}), createTabStore = () => ({});'],
    [/^import \{ carrierPatches \} from '\.\/pool-pin-carrier\.js';.*$/m, `import { carrierPatches } from ${JSON.stringify(pathToFileURL(rulePath).href)};`],
  ].reduce((s, [from, to], i) => anchored(s, from, to, 'the page copy ' + i), text);
  let pages = 0;
  const loadPage = async (rulePath = RULE, text = STATE) => {
    const { installSidebarState } = await import(pathToFileURL(M.write('src/lib/sidebar-state.js', pageSrc(rulePath, text), 'page-' + (++pages), { esm: true })).href);
    class Sb { constructor() { this._sessionConfigs = {}; this._sessionModes = {}; } }
    installSidebarState(Sb);
    Sb.prototype._pushUserState = async function () { };
    return new Sb();
  };
  const KEY = 'claude:c1';
  const held = (pg) => { const c = pg.getSessionConfig(KEY); return c && c.poolPin ? c.poolPin.memberId : null; };
  const list = (pg, pin) => pg._followPins([ROW(KEY, pin)]);
  // pinTo's live road, step for step (④ pins its text): press = the fence before the request; a failed or refused reply lifts its
  // OWN fence; the reply writes only while its fence stands. `unconditional` = the release's write (it always wrote).
  const press = (pg, want) => ({ want, mark: pg.pinFence(KEY, want) });
  const reply = (pg, p, { ok: good = true, at = 0, unconditional = false } = {}) => {
    if (!good) { pg.pinFenceLift(KEY, p.mark); return 'lifted'; }
    if (!unconditional && !pg.pinFenceStands(KEY, p.mark)) return 'skipped';
    const next = { ...(pg.getSessionConfig(KEY) || {}) };
    if (p.want) next.poolPin = { memberId: p.want, at, poolId: 'pool-a' }; else delete next.poolPin;
    pg.setSessionConfig(KEY, next);
    return 'written';
  };
  const NOFENCE = M.write('src/lib/pool-pin-carrier.js', anchored(SRC, '    if (fences.has(key)) {', '    if (false) {', 'no-fence'), 'page-no-fence');
  const LIFTONLY = M.write('src/lib/pool-pin-carrier.js', anchored(SRC, '      lifted.push(key);   // r5500:', '      lifted.push(key); continue;   // 40f58aff2\'s lift (it wrote nothing) — r5500:', 'lift-only'), 'page-lift-only');
  // THE FENCE's THREE MEANINGS (its own API): a member, «Back to automatic» (null), and nothing for a want that is neither
  {
    const pg = await loadPage();
    const mx = pg.pinFence(KEY, 'sub-x'), mu = pg.pinFence('claude:c9', undefined), mn = pg.pinFence('claude:c8', null);
    ok(typeof mx === 'number' && mu === null && !pg._pinFences.has('claude:c9') && pg._pinFences.get('claude:c8').want === null && pg._pinFences.get(KEY).want === 'sub-x' && pg.pinFenceStands(KEY, mx) && !pg.pinFenceStands(KEY, mx + 1) && !pg.pinFenceStands(KEY, null),
      'pinFence: a member fences that member, null fences «Back to automatic», undefined fences NOTHING (a refused press never becomes a fence for automatic); each fence has its own mark');
    const my = pg.pinFence(KEY, 'sub-y');
    ok(!pg.pinFenceStands(KEY, mx) && pg.pinFenceStands(KEY, my), 'the next press REPLACES the fence: the earlier press\'s mark no longer stands');
  }
  // ① THE REPLY FIRST: it writes (its fence stands); an older list then undoes nothing; the carrying list lifts; a later act is followed
  {
    // the page saw sub-z; another actor's clear of it reached the hub before this press: that list (an edge, older than the press) comes after the reply
    const run = async (rule) => { const pg = await loadPage(rule); list(pg, PIN('sub-z', 90)); const p = press(pg, 'sub-x'); const w = reply(pg, p, { at: 140 }); list(pg, null); const afterOld = held(pg); list(pg, PIN('sub-x', 140)); const lifted = !pg._pinFences.has(KEY); list(pg, null); return { w, afterOld, lifted, later: held(pg) }; };
    const r = await run(RULE), x = await run(NOFENCE);
    ok(r.w === 'written' && r.afterOld === 'sub-x' && r.lifted && r.later === null, 'ORDER 1 — THE REPLY FIRST: written (its fence stands); an older list leaves it; the carrying list lifts the fence; a later clear elsewhere is followed', r);
    ok(x.afterOld === null, 'RED (computed — a page whose rule ignores the fence): the older list clears the pin the reply just wrote', x);
  }
  // ② THE LIST FIRST: the lift writes the carried fact; the reply that comes after writes nothing
  {
    const run = async (rule) => { const pg = await loadPage(rule); list(pg, null); const p = press(pg, 'sub-x'); list(pg, PIN('sub-x', 140)); const atLift = held(pg); const w = reply(pg, p, { at: 140 }); return { atLift, w, end: held(pg) }; };
    const r = await run(RULE), x = await run(LIFTONLY);
    ok(r.atLift === 'sub-x' && r.w === 'skipped' && r.end === 'sub-x', 'ORDER 2 — THE LIST FIRST: the follow writes the carried fact AT THE LIFT; the later reply writes nothing (its fence is gone)', r);
    ok(x.atLift === null && x.end === null, 'RED (computed — 40f58aff2\'s lift, which wrote nothing, beside the fenced reply): the carrier is never written', x);
  }
  // ③ TWO PRESSES WHOSE REPLIES CROSS: a credits member, then «Back to automatic»; the hub applies both in order; the older reply comes LAST
  {
    const run = async (unconditional) => { const pg = await loadPage(); list(pg, null); const p1 = press(pg, 'sub-credits'), p2 = press(pg, null); const w2 = reply(pg, p2, { unconditional }); list(pg, PIN('sub-credits', 150)); list(pg, null); const w1 = reply(pg, p1, { at: 150, unconditional }); return { w2, w1, end: held(pg) }; };
    const r = await run(false), x = await run(true);
    ok(r.w2 === 'written' && r.w1 === 'skipped' && r.end === null, 'ORDER 3 — TWO PRESSES CROSS: «Back to automatic» (the latest) is what the carrier holds; the superseded press\'s late reply writes nothing', r);
    ok(x.w1 === 'written' && x.end === 'sub-credits', 'RED (computed — the release\'s unconditional write): the superseded reply leaves the member billing credits in the carrier while the live row is on automatic — the next resume would bill it', x);
  }
  // ④ ANOTHER PAGE's CLEAR AFTER THE LIFT: followed; the press's late reply never writes its member back
  {
    const run = async (unconditional) => { const pg = await loadPage(); list(pg, null); const p = press(pg, 'sub-x'); list(pg, PIN('sub-x', 140)); list(pg, null); const w = reply(pg, p, { at: 140, unconditional }); return { w, end: held(pg) }; };
    const r = await run(false), x = await run(true);
    ok(r.w === 'skipped' && r.end === null, 'ORDER 4 — ANOTHER PAGE\'s CLEAR AFTER THE LIFT: adopted from the list; the late reply writes nothing', r);
    ok(x.w === 'written' && x.end === 'sub-x', 'RED (computed — the release\'s unconditional write): the late reply writes the cleared member back', x);
  }
  // ⑤ THE REPLY NEVER COMES: a failed request lifts its OWN fence (never a later press's); an open request is lifted by the list that
  // carries it — the carrier is right without any reply
  {
    const pg = await loadPage(); list(pg, null); const p = press(pg, 'sub-x'); const w = reply(pg, p, { ok: false }); list(pg, PIN('sub-q', 200));
    ok(w === 'lifted' && !pg._pinFences.has(KEY) && held(pg) === 'sub-q', 'ORDER 5a — THE REQUEST FAILS (fetchJson answers null): its own fence lifts and the follow goes on (a later pin is followed)', { w, held: held(pg) });
    const STATEX = anchored(STATE, '    if (f && mark != null && f.mark === mark) this._pinFences.delete(key);', '    if (f) this._pinFences.delete(key);', 'lift-by-key');
    const run = async (text) => { const pg2 = await loadPage(RULE, text); list(pg2, PIN('sub-z', 90)); const p1 = press(pg2, 'sub-x'), p2 = press(pg2, 'sub-y'); reply(pg2, p1, { ok: false }); list(pg2, null); const w2 = reply(pg2, p2, { at: 160 }); return { stands: pg2.pinFenceStands(KEY, p2.mark), w2, end: held(pg2) }; };
    const r = await run(STATE), x = await run(STATEX);
    ok(r.w2 === 'written' && r.end === 'sub-y', 'ORDER 5b — AN OLDER PRESS FAILS AFTER A NEWER ONE: the newer fence stands, an older list undoes nothing, and the newer reply writes the latest choice', r);
    ok(x.w2 === 'skipped' && x.end === null, 'RED (computed — a lift by the conversation alone, as 40f58aff2 lifted): the older failure lifts the newer fence, the older list clears the carrier and the latest choice is LOST', x);
    const run3 = async (rule) => { const pg3 = await loadPage(rule); list(pg3, null); press(pg3, 'sub-x'); list(pg3, PIN('sub-x', 140)); return { lifted: !pg3._pinFences.has(KEY), end: held(pg3) }; };
    const r3 = await run3(RULE), x3 = await run3(LIFTONLY);
    ok(r3.lifted && r3.end === 'sub-x', 'ORDER 5c — THE REPLY NEVER COMES, the hub applied it: the list that carries the press lifts the fence and writes it — no reply needed, no timer', r3);
    ok(x3.end === null, 'RED (computed — 40f58aff2\'s lift): without the reply the carrier never holds the press', x3);
  }
}

report();

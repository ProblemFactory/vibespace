#!/usr/bin/env node
// B-87fd item (1), THE EXHAUSTIVE LEG (主开发 r4780 / r4903): the paying tier proved over a SPACE OF STATES, not scene by scene. The rule
// page (int359/sched-1117/msgs/bl-accounts-B-87fd-1-rules-page.md) states five rules and the invariants; this suite builds EVERY pool of
// its space and checks every invariant through the REAL exported functions (decidePoolSwitch, rankPoolMembers, soonestUsableMember):
// the current member and up to three others, each in one of 17 states (ordinary / usage credits / paying × can serve and settles /
// under the settle bar / soft / under the reserve floor (it settles) / past its quota, plus a lapsed sign-in and an ordinary member whose
// Fable cap is spent), the others as multisets,
// in TWO ARRANGEMENTS (r4903 M1: list places and deadlines in tier order, and running AGAINST it with the current member never the
// soonest); the pool hot and cold; the setting pool.avoidOverageMembers on and off; the engine's own reserve floor (15 %); each pool
// decided out of a turn, in one (a warm and a cold cache) and as EVERY KIND OF START through the chooser's own entry (r4986). On every pool where a member
// pays: I1-I5, I7-I10. On every pool where none does (and for the walks of a pool where only the current member pays): I6, the release's
// own module, byte for byte. Every account is made up; nothing is spawned, nothing read from a real folder; pure calls only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';   // FIRST of the lib imports (B-ba47): the suite runs on a temp home of its own
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ck = (n, c) => { if (typeof c !== 'boolean') throw new TypeError(`ck() was handed a ${typeof c} as its condition: ${n}`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const P = require(path.join(REPO, 'src/account-pool-auto.js'));
const { projectCacheForFamily } = require(path.join(REPO, 'src/model-family.js'));
const M = mutantCopies('pool-tier-invariants', REPO);
const t0 = Date.now();

/** THE RELEASE's OWN MODULE (test-pool-auto's preFixCopy, mirror-197): `git show <ref>:<file>` where the ref is in this clone; a
 *  SHALLOW clone answers 'shallow' and the caller SKIPS I6 with evidence; an absent ref on a FULL clone is a failure by name. */
async function preFixCopy(ref, rel, tag) {
  const { execFileSync } = await import('node:child_process');
  const { gitEnvFrom } = await import('./git-env.mjs');
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', cwd: REPO, env: gitEnvFrom(process.env), stdio: ['ignore', 'pipe', 'ignore'] });
  let has = false; try { git(['cat-file', '-e', `${ref}^{commit}`]); has = true; } catch { has = false; }
  if (has) { try { return { mod: M.load(rel, git(['show', `${ref}:${rel}`]), tag), why: null }; } catch (e) { return { mod: null, why: `git show ${ref}:${rel} failed: ${String(e && e.message).slice(0, 120)}` }; } }
  let shallow = false; try { shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true'; } catch { shallow = false; }
  return { mod: null, why: shallow ? 'shallow' : `the ref ${ref} is not in this clone, which is NOT shallow` };
}

// ── THE STATES (the rule page's RULE 1): what a member's reading and sign-in say ──
const NOW = 1800000000, D = 86400;
const FLOOR = 15;   // the engine's default pool.reserveFloorPct, handed to every decision
const STATES = [];
for (const kind of ['o', 'c', 'p']) for (const q of ['live', 'low', 'soft', 'floor', 'spent']) STATES.push({ kind, q });
STATES.push({ kind: 'o', q: 'lapsed' });
STATES.push({ kind: 'o', q: 'fable' });   // r4986: its Fable cap spent, 5h and 7d fine — it can serve a NAMED opus start, never a guessed one
// 5h / 7d utilization: live settles (5h 100 %, 7d 60 %); low can serve under the settle bar (5h 11 %: over its hot line, under hot +
// gain); soft sits under its hot line, over its hard one (5h 8 %); floor is under the reserve floor and still settles (7d 12 %, the
// floor 15, the settle bar 8); spent is under its hard bar (7d 1 %); lapsed reads live, signed out
const U = { live: [0, 0.4], low: [0.89, 0.4], soft: [0.92, 0.4], floor: [0, 0.88], spent: [0, 0.99], lapsed: [0, 0.4], fable: [0, 0.4, 0.99] };
const hasQuota = (s) => s.q !== 'spent' && s.q !== 'lapsed';                // RULE 1: CAN SERVE NOW (under the conversation's own family: opus)
const hasQuotaAll = (s) => hasQuota(s) && s.q !== 'fable';                  // …on EVERY bucket a guessed family could mean (r4986: fail closed)
const takesTurn = (s) => s.q !== 'lapsed' && (hasQuota(s) || s.kind !== 'o');  // a credits or paying member past its quota still takes one, billed
const settles = (s) => s.q === 'live' || s.q === 'floor' || s.q === 'fable';
const place = (s) => (s.q === 'lapsed' ? 6 : hasQuota(s) ? { o: 0, c: 1, p: 2 }[s.kind] : { c: 3, p: 4, o: 5 }[s.kind]);   // RULE 3's one order
const fmt = (s) => `${{ o: 'ordinary', c: 'credits', p: 'paying' }[s.kind]}-${s.q}`;
const LIVE_LOGIN = { state: 'ok', msLeft: 40 * 86400e3 };
const LAPSED_LOGIN = { state: 'ok', msLeft: 40 * 86400e3, serve: { state: 'lapsed', since: (NOW - 3600) * 1000 } };
const BLOCKED = ['stuck', 'no-members', 'no-settleable', 'all-lapsed', 'all-logins-expired', 'all-rejected'];
const CACHE = new Map();   // (state, its reset in days, the view) → the reading, built once: the bare one and the one projected for opus
const rawOf = (s, days) => { const [u5, u7, uf] = U[s.q]; return { fiveHour: { utilization: u5, resetsAt: NOW + 1800 }, sevenDay: { utilization: u7, resetsAt: NOW + days * D }, scopedWeekly: uf == null ? [] : [{ name: 'Fable', utilization: uf, resetsAt: NOW + days * D }] }; };
const cacheOf = (s, days, bare = false) => { const k = `${s.kind}${s.q}${days}${bare ? 'b' : 'p'}`; if (!CACHE.has(k)) CACHE.set(k, bare ? rawOf(s, days) : projectCacheForFamily(rawOf(s, days), 'opus')); return CACHE.get(k); };

// TWO ARRANGEMENTS (r4903 M1). In tier order: the others listed ordinary, credits, paying, a member's weekly reset sooner the earlier it
// is listed, the current member the soonest. AGAINST it: the others listed paying, credits, ordinary, the first listed the soonest, the
// current member the latest — so a walk that loses its tier sort, falling back on the deadline or the list order, names a paying member
function poolOf(cur, others, hot, setting, against) {
  const listed = against ? [...others].reverse() : others;
  const all = [cur, ...listed];
  const ids = all.map((_, i) => 'm' + i);
  const st = new Map(ids.map((id, i) => [id, all[i]]));
  const days = (i) => (against ? (i === 0 ? 5 : i) : 1 + i);
  const caches = new Map(ids.map((id, i) => [id, cacheOf(all[i], days(i))])), bare = new Map(ids.map((id, i) => [id, cacheOf(all[i], days(i), true)]));
  const credits = ids.filter((id) => st.get(id).kind === 'c'), paying = ids.filter((id) => st.get(id).kind === 'p');
  return {
    st, members: ids.map((id) => ({ id, name: id })), others: ids.slice(1).map((id) => ({ id, name: id })), hot,
    readCache: (id) => caches.get(id) ?? null, baseReadCache: (id) => bare.get(id) ?? null, readLogin: (id) => (st.get(id) && st.get(id).q === 'lapsed' ? LAPSED_LOGIN : LIVE_LOGIN),
    creditsIds: credits.length ? credits : null, payingIds: paying.length ? paying : null, overageIds: setting && paying.length ? paying : null,
    paying: paying.length > 0,
  };
}
const decide = (mod, pool, cur, extra = {}) => mod.decidePoolSwitch({ currentId: cur, members: pool.members, readCache: pool.readCache, nowSec: NOW, proactive: pool.hot, hot: pool.hot, readLogin: pool.readLogin, reserveFloorPct: FLOOR, creditsIds: pool.creditsIds, payingIds: pool.payingIds, overageIds: pool.overageIds, explain: true, ...extra });
// THE STARTS (主开发 r4986: A RESUME IS A START): the chooser's own entry, decideStart, for each kind of start the callers hand it —
// src/ws-create.js: a model sent (the family named), a resume's hint (the instance default stands in: a GUESS), no family at all. The
// chooser's call is pinned below against this one (the two cannot part again)
const START_KINDS = [['a model sent', { family: 'opus', hinted: false }], ['a hint only', { family: 'opus', hinted: true }], ['no family', { family: null, hinted: false }]];
const startArgs = (pool, k) => ({ ...k, defaultStale: false, baseReadCache: pool.baseReadCache, currentId: 'm0', members: pool.members, readCache: k.family ? pool.readCache : pool.baseReadCache, nowSec: NOW, hot: true, readLogin: pool.readLogin, reserveFloorPct: FLOOR, creditsIds: pool.creditsIds, payingIds: pool.payingIds, overageIds: pool.overageIds, explain: true });
// the RELEASE's own chooser for a start (eb7608d5's usage-pool-engine): no family ⇒ the default; else the decision with placing = a named family
const releaseStart = (mod, pool, k) => { const { family, hinted, defaultStale, baseReadCache, ...args } = startArgs(pool, k); return !family ? null : mod.decidePoolSwitch({ ...args, placing: !hinted }); };
const guessOf = (k) => !k.family || k.hinted;
// the chooser's entry: decideStart; a tree without it (before r4986) is asked as ITS chooser asked — the release's call (so a red tree
// shows what its starts did, counted by kind), and its absence is a red of its own below
const startOf = (mod, pool, k) => (typeof mod.decideStart === 'function' ? mod.decideStart(startArgs(pool, k)) : releaseStart(mod, pool, k));
const rankOf = (mod, pool, ov = pool.overageIds) => mod.rankPoolMembers({ members: pool.others, readCache: pool.readCache, nowSec: NOW, readLogin: pool.readLogin, creditsIds: pool.creditsIds, payingIds: pool.payingIds, overageIds: ov });
const fallbackOf = (mod, pool, ov = pool.overageIds) => { const x = mod.soonestUsableMember({ members: pool.others, readCache: pool.readCache, nowSec: NOW, readLogin: pool.readLogin, creditsIds: pool.creditsIds, payingIds: pool.payingIds, overageIds: ov }); return x && typeof x === 'object' ? x.id : x; };
// THE WALK's OWN STATE (主开发 r5239 (3), B-d74f): the fallback is asked when the default is LEFT (removed, or lapsed); the device list
// when the member a conversation runs on can no longer serve (a failed sign-in, a wall). The DECISION asked there: the current member
// no longer a member (the fallback's), its sign-in dead (the list's)
const DEAD_LOGIN = { state: 'logged-out', msLeft: -1 };
const leftDecision = (mod, pool) => decide(mod, pool, 'm0', { members: pool.others, membership: pool.others.map((m) => m.id) });   // the default LEFT: no longer a member, no longer a candidate (the engine's healthyPoolMembers)
const deadDecision = (mod, pool) => decide(mod, pool, 'm0', { readLogin: (id) => (id === 'm0' ? DEAD_LOGIN : pool.readLogin(id)) });
const bills = (s) => s.kind === 'p' || (s.kind === 'c' && !hasQuota(s));   // a paying member, or a credits member past its quota
const IN_TURN = [{ warm: true, inTurn: true, agoSec: 10, ttlSec: 300 }, { warm: false, inTurn: true, agoSec: 400, ttlSec: 300 }];

// every multiset of up to three others
const multisets = [[]];
for (let a = 0; a < STATES.length; a++) { multisets.push([a]); for (let b = a; b < STATES.length; b++) { multisets.push([a, b]); for (let c = b; c < STATES.length; c++) multisets.push([a, b, c]); } }

const pre = await preFixCopy('eb7608d5', 'src/account-pool-auto.js', 'release');
const rel = pre.mod;
if (!rel && pre.why === 'shallow') console.log('  ⊘ SKIP I6 against eb7608d5 — the ref is not in this SHALLOW clone (the mirror\'s depth-1 checkout)');
else ck(`the release copy (eb7608d5) loaded for I6${pre.why ? ` — ${pre.why}` : ''}`, !!rel && typeof rel.decidePoolSwitch === 'function');

// B-6a92's HELD mark on a PAYING current member (the engine's { held: 'same-instant' }: its reading reads NONE; it pays by its raw
// reading's own fact): every kind of start is judged as on the member read — the placing law binds it (r4986). Asked from the first
// paying state only: the mark hides which one it is
const HELD_MARK = { held: 'same-instant' };
const P_HELD_FROM = STATES.find((s) => s.kind === 'p');
const heldStarts = (mod, pool, others) => {
  const h = (f) => (id) => (id === 'm0' ? HELD_MARK : f(id));
  const hp = { ...pool, readCache: h(pool.readCache), baseReadCache: h(pool.baseReadCache) };
  const out = [];
  for (const [n, k] of START_KINDS) {
    const dp = startOf(mod, hp, k), canServe = guessOf(k) ? hasQuotaAll : hasQuota;
    const T = pool.st.get((dp && dp.to) || 'm0');
    if (T.kind === 'p' && others.some((s) => s.kind !== 'p' && canServe(s))) out.push(['I5', n, `a start (${n}) on a paying member whose reading is held is placed on ${fmt(T)} (${dp && dp.to ? 'moved' : `kept: ${dp ? dp.reason : 'the default'}`}) while an ordinary or credits member can serve now`]);
    if (guessOf(k) && dp && dp.to && !hasQuotaAll(T) && others.some(hasQuotaAll)) out.push(['I2', n, `a start (${n}) off a held paying member is placed on ${fmt(T)}, which cannot serve every bucket the guess could mean`]);
  }
  return out;
};
// READING A (主开发 r5252): the one order with no exception — this tree's fallback with the kept shape taken out, in a copy: the walk
// counts where it parks elsewhere (the kept kind) and re-finds the money pin's states under it
let READ_A = null; const A_SPEND = [];
{ const src = fs.readFileSync(path.join(REPO, 'src/account-pool-auto.js'), 'utf8');
  try { READ_A = M.load('src/account-pool-auto.js', anchored(src, '  const keyOf = keepPark ? (r) => r.tier : tiers.orderOf(rows);', '  const keyOf = tiers.orderOf(rows);', 'reading A: no kept park'), 'reading-a'); } catch { READ_A = null; } }   // stale-pins: kept (reading A's text IS 1a163d9b9's fallback key, the one order with no exception)
const INV = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10', 'I11'];
// each failure is filed under its invariant AND its KIND (a short name of the road that broke it), with the first scenes of each kind
const bad = Object.fromEntries(INV.map((k) => [k, { n: 0, shapes: new Set(), kinds: new Map() }]));
const miss = (k, scene, kind, what) => {
  const b = bad[k]; b.n++;
  const shape = `${scene.cur} | ${scene.others}`; b.shapes.add(shape);
  if (!b.kinds.has(kind)) b.kinds.set(kind, { n: 0, shapes: new Set(), ex: [] });
  const g = b.kinds.get(kind); g.n++;
  if (!g.shapes.has(shape)) { g.shapes.add(shape); if (g.ex.length < 2) g.ex.push(`${shape} | ${scene.hot} | setting ${scene.setting} | ${scene.arr} — ${what}`); }
};
// THE WALKS' OWN CHECKS (the device list's head, the fallback's pick) on one pool — shared with the walks' REDs below
// THE KEPT SHAPE (主开发 r5252, reading B): nobody pays among the candidates and none can serve now — the fallback keeps the release's
// park (a walled ordinary member before a credits member billing past its quota), so its own I1 / I2 checks are named apart there
const keptShape = (others) => !others.some((s) => s.kind === 'p') && !others.some((s) => s.q !== 'lapsed' && hasQuota(s));
let keptApart = 0;
function walkChecks(mod, pool, others, scene, report) {
  const S = (id) => pool.st.get(id);
  const anyQuota = others.some(hasQuota), anyTurn = others.some(takesTurn), kept = keptShape(others);
  const rk = rankOf(mod, pool), r0 = rk.length ? rk[0].id : null, fb = fallbackOf(mod, pool);
  if (r0) {
    if (anyQuota && !hasQuota(S(r0))) report('I2', scene, 'device list head cannot serve, one that can there', `the device list's head is ${fmt(S(r0))} while a member that can serve exists`);
    if (!takesTurn(S(r0))) report('I2', scene, 'device list head takes no turn', `the device list's head ${fmt(S(r0))} takes no turn`);
    if (S(r0).kind === 'p' && others.some((s) => s.kind !== 'p' && hasQuota(s))) report('I5', scene, 'device list', 'the device list puts a paying member first while an earlier tier can serve');
  }
  if (fb && kept) keptApart++;
  if (fb && !kept) {
    if (anyTurn && !takesTurn(S(fb))) report('I2', scene, 'fallback onto a member taking no turn', `the fallback parks on ${fmt(S(fb))}, which takes no turn, while a member takes one`);
    if (anyQuota && !hasQuota(S(fb))) report('I2', scene, 'fallback onto a member that cannot serve, one that can there', `the fallback parks on ${fmt(S(fb))} while a member that can serve exists`);
    if (S(fb).kind === 'p' && others.some((s) => s.kind !== 'p' && hasQuota(s))) report('I5', scene, 'fallback', 'the fallback parks on a paying member while an earlier tier can serve');
  }
  return { r0, fb };
}
// I6 RESTATED (主开发 r5239 (3), row B-d74f): where nobody pays among a walk's candidates the two walks (the device list, the fallback)
// take rule 3's ONE order too, and their answers differ from the release's ONLY where the release named a member that cannot serve now
// while one that can, or one that takes a turn, was there: each difference is filed under its KIND, counted and PINNED; any other
// difference is an I6 failure. Every other answer (the decision, in a turn and out, each start) equals the release byte for byte.
// THE MONEY PIN: where the new answer names a member that BILLS, the release's own DECISION asked in that walk's own state lands in
// that same place of the order (the walks come to agree with where the decision already moves a conversation); a state where it does
// not is a NEW SPEND — the owner's to decide: the leg names it with its pool written out, and the unit STOPS on it
const DIFF = new Map(), NEW_SPEND = [];
const KINDS = { list: 'the device list: a credits member past its quota no longer stands before one that can serve', fbLive: 'the fallback: a credits member that can serve before an ordinary member that cannot', fbBill: 'the fallback: a credits member billing past its quota before a walled ordinary member (who takes no turn)', kept: 'the one shape (主开发 r5252, reading B): no candidate can serve now — the fallback keeps the release\'s park, where reading A would park on a credits member past its quota' };
const noteDiff = (k, scene) => { if (!DIFF.has(k)) DIFF.set(k, { n: 0, shapes: new Set(), ex: [] }); const g = DIFF.get(k); g.n++; const sh = `${scene.cur} | ${scene.others}`; if (!g.shapes.has(sh)) { g.shapes.add(sh); if (g.ex.length < 2) g.ex.push(`${sh} | ${scene.hot} | setting ${scene.setting} | ${scene.arr}`); } };
const writeOut = (pool, scene) => `${scene.arr}, ${scene.hot}, setting ${scene.setting}: ` + [...pool.st].map(([id, s]) => `${id} ${fmt(s)}`).join(', ');
const moneyPin = (pool, scene, who, to, dr, into = NEW_SPEND) => { const S = (id) => pool.st.get(id); if (!(dr && dr.to && place(S(dr.to)) === place(S(to)))) { into.push(`${who} names ${fmt(S(to))} (${to}); the release's own decision in its state ${dr && dr.to ? `lands on ${fmt(S(dr.to))} (${dr.to})` : `moves nobody (${dr ? dr.reason : '-'})`} — the pool: ${writeOut(pool, scene)}`); return true; } return false; };
function walkDiff(pool, scene, same) {
  if (!rel) return;
  const S = (id) => pool.st.get(id), ids = (l) => l.map((r) => r.id), cr = (l) => l.filter((r) => S(r.id).kind === 'c');
  const mine = rankOf(P, pool), theirs = rankOf(rel, pool);
  if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
    const expect = [...theirs.filter((r) => S(r.id).kind !== 'c'), ...cr(theirs).filter((r) => hasQuota(S(r.id))), ...cr(theirs).filter((r) => !hasQuota(S(r.id)))];
    const released = cr(theirs).some((r, i, a) => !hasQuota(S(r.id)) && a.slice(i + 1).some((x) => hasQuota(S(x.id))));
    if (released && JSON.stringify(ids(mine)) === JSON.stringify(ids(expect))) { noteDiff('list', scene); if (mine.length && bills(S(mine[0].id))) moneyPin(pool, scene, 'the device list', mine[0].id, deadDecision(rel, pool)); }
    else same('device list (nobody among the others paying)', mine, theirs);
  }
  const fm = fallbackOf(P, pool), ft = fallbackOf(rel, pool);
  if (fm !== ft) {
    const A = fm && S(fm), B = ft && S(ft);
    const kind = A && B && B.kind === 'o' && !hasQuota(B) && B.q !== 'lapsed' && A.kind === 'c' ? (hasQuota(A) ? 'fbLive' : 'fbBill') : null;
    if (kind) { noteDiff(kind, scene); if (bills(A)) moneyPin(pool, scene, 'the fallback', fm, leftDecision(rel, pool)); }
    else same('fallback (nobody among the others paying)', fm, ft);
  }
  // r5252: READING A (the one order with no exception, a copy) parks elsewhere only in the one shape — there this tree keeps the release's
  // park; the money pin's 80 states are re-found under A, and in each the clock is stepped past the walled member's weekly reset
  if (READ_A) { const fa = fallbackOf(READ_A, pool);
    if (fa !== fm) { noteDiff('kept', scene); if (fm !== ft) same('fallback in the kept shape (r5252: the release\'s park, byte for byte)', fm, ft);
      if (fa && bills(S(fa)) && moneyPin(pool, scene, 'reading A\'s fallback', fa, leftDecision(rel, pool), A_SPEND)) resetFacts(pool, scene, ft, fa); } }
}
// THE CLOCK PAST THE WALL (主开发 r5252 (i)–(iii)), measured in the 80 states: just past the walled ordinary member's weekly reset, where
// (i) the release starts a new conversation (its default is that member), (ii) reading A's tree starts one (its default is the credits
// member billing past its quota), and (iii) what reading A's own default pass decides there — the decision the engine asks for the pool's
// default (src/server/usage-pool-engine.js maybePoolAutoSwitchForPool → decideDefault, on a pool whose automatic switching is on)
const RESET = { i: new Map(), ii: new Map(), iii: new Map() };
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
function resetFacts(pool, scene, park, aPark) {
  const S = (id) => pool.st.get(id), t1 = Number(pool.readCache(park).sevenDay.resetsAt) + 120;
  const resetBy = (id) => { const c = pool.readCache(id); return !!(c && c.sevenDay && Number(c.sevenDay.resetsAt) + 60 <= t1); };
  const desc = (id) => `${S(id).kind === 'o' ? 'the ordinary member' : S(id).kind === 'c' ? 'the credits member' : 'the paying member'}${id === park ? ' the release parked on' : id === aPark ? ' reading A parked on' : ''} (${fmt(S(id))}${resetBy(id) ? ', its week reset by then' : ''})`;
  const left = { members: pool.others, membership: pool.others.map((m) => m.id), nowSec: t1 };
  const startAt = (mod, cur, k) => { const { family, hinted, defaultStale, baseReadCache, ...rest } = { ...startArgs(pool, k), ...left, currentId: cur };
    const d = typeof mod.decideStart === 'function' ? mod.decideStart({ family, hinted, defaultStale, baseReadCache, ...rest }) : (!family ? null : mod.decidePoolSwitch({ ...rest, placing: !hinted }));
    return (d && d.to) || cur; };
  for (const [n, k] of START_KINDS) { bump(RESET.i, `${n}: ${desc(startAt(rel, park, k))}`); bump(RESET.ii, `${n}: ${desc(startAt(READ_A, aPark, k))}`); }
  const dd = decide(READ_A, pool, aPark, { ...left, proactive: pool.hot, hot: pool.hot });
  bump(RESET.iii, dd && dd.to ? `moves the default to ${desc(dd.to)} (${dd.reason})` : `keeps the default on ${desc(aPark)} (${dd ? dd.reason : '-'})`);
}
// PLACE 3 (r5239 (2): OUT of this unit, named apart, never counted as cured): the soft band moves a conversation in the middle of a turn
// on a cold cache, off a member that can still serve, where nobody pays — the letter of I7 the release breaks; counted here, judged not
let place3 = 0; const place3Ex = [];
// I1, I2 and I7 on the pools where NOBODY pays (r5165 / r5239): the decision's landing, the walks' own checks, the one place
function plainChecks(pool, cur, others, scene) {
  const S = (id) => pool.st.get(id), d = decide(P, pool, 'm0'), anyQuota = others.some(hasQuota);
  if (d.to) {
    const T = S(d.to);
    if (!takesTurn(T)) miss('I2', scene, 'decision onto a member taking no turn', `the decision lands on ${fmt(T)}, which takes no turn`);
    if (anyQuota && !hasQuota(T)) miss('I2', scene, 'decision onto a member that cannot serve, one that can there', `the decision moves onto ${fmt(T)} while a member that can serve exists`);
    if (hasQuota(cur) && !settles(T)) miss('I2', scene, 'voluntary move under the settle bar', `a VOLUNTARY move (the current can serve) lands on ${fmt(T)}, under the settle bar`);
    if (!hasQuota(cur) && cur.kind !== 'o' && cur.q !== 'lapsed' && !hasQuota(T)) miss('I2', scene, 'billed onto billed', `a member billing past its quota hops onto ${fmt(T)}, billed onto billed`);
  }
  const { r0, fb } = walkChecks(P, pool, others, scene, miss);
  if (d.to && (cur.q === 'lapsed' || (cur.kind === 'o' && !hasQuota(cur)))) {
    const pd = place(S(d.to)), pr = r0 ? place(S(r0)) : null, pf = fb && !keptShape(others) ? place(S(fb)) : (fb ? pd : null);   // r5252: the kept shape's fallback, named apart
    if (pr !== pd || pf !== pd) miss('I1', scene, `places, nobody paying: decision ${pd}, list ${pr}, fallback ${pf}`, `the decision lands on ${fmt(S(d.to))}, the list's head is ${r0 ? fmt(S(r0)) : 'nobody'}, the fallback ${fb ? fmt(S(fb)) : 'nobody'}`);
  }
  for (const w of IN_TURN) { const dw = decide(P, pool, 'm0', { warm: w }); if (dw.to && hasQuota(cur)) { place3++; if (place3Ex.length < 3) place3Ex.push(`${scene.cur} | ${scene.others} | ${scene.hot} | ${w.warm ? 'warm' : 'cold'} cache → ${fmt(S(dw.to))} (${dw.reason}/${dw.band || '-'})`); } }
}
let pools = 0, payingPools = 0, plainPools = 0;
for (const against of [false, true]) for (const cur of STATES) for (const ms of multisets) for (const hot of [false, true]) for (const setting of [false, true]) {
  const others = ms.map((i) => STATES[i]);
  const pool = poolOf(cur, others, hot, setting, against);
  const scene = { cur: fmt(cur), others: others.map(fmt).join(', ') || '(none)', hot: hot ? 'hot' : 'cold', setting: setting ? 'on' : 'off', arr: against ? 'against the tiers' : 'in tier order' };
  const same = (n, a, b) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); if (ja !== jb) miss('I6', scene, n, `${n}: ${ja.slice(0, 160)} ≠ the release's ${jb.slice(0, 160)}`); };
  if (!pool.paying) {
    if (setting) continue;   // with nobody paying the setting hands nothing: one pass is the space
    pools++; plainPools++;
    if (!rel) continue;
    // I6: with no member paying, every answer equals the release's module, byte for byte
    same('decision', decide(P, pool, 'm0'), decide(rel, pool, 'm0'));
    for (const w of IN_TURN) same('decision in a turn', decide(P, pool, 'm0', { warm: w }), decide(rel, pool, 'm0', { warm: w }));
    if (hot) for (const [n, k] of START_KINDS) same(`a start (${n})`, startOf(P, pool, k) ?? null, releaseStart(rel, pool, k));
    walkDiff(pool, scene, same);   // r5239: the two walks — the difference set, each difference of its kind
    plainChecks(pool, cur, others, scene);
    continue;
  }
  pools++; payingPools++;
  const S = (id) => pool.st.get(id);
  const all = [cur, ...others];
  const anyQuota = others.some(hasQuota);
  const payingServes = all.some((s) => s.kind === 'p' && takesTurn(s));
  const d = decide(P, pool, 'm0');
  // I8: the same readings give the same answer — on EVERY pool (r4903)
  if (JSON.stringify(decide(P, pool, 'm0')) !== JSON.stringify(d)) miss('I8', scene, 'two calls', 'two calls disagree');
  const blockedCheck = (x, who) => { if (x && BLOCKED.includes(x.reason) && payingServes) miss('I4', scene, `${who} «${x.reason}»`, `${who} is «${x.reason}» while a paying member can take a turn`); };
  blockedCheck(d, 'the decision');
  const landing = (x, who, canServe = hasQuota) => {   // I2 / I5 / I10 on a decision that lands (a start judged on ITS view: a guess fail closed)
    const T = S(x.to);
    if (!takesTurn(T)) miss('I2', scene, `${who} onto a member taking no turn`, `${who} lands on ${fmt(T)}, which takes no turn`);
    if (T.kind === 'p' && others.some((s) => s.kind !== 'p' && canServe(s))) miss('I5', scene, who, `${who} lands on a paying member while an earlier tier can serve`);
    if (T.kind === 'p' && !(x.toPaying && x.toPaying.id === x.to)) miss('I10', scene, who, `${who} lands on a paying member without marking it (toPaying) — the engine\'s «an alternative?» cannot tell`);
  };
  if (d.to) {
    const T = S(d.to);
    landing(d, 'the decision');
    if (anyQuota && !hasQuota(T)) miss('I2', scene, 'decision onto a member that cannot serve, one that can there', `the decision moves onto ${fmt(T)} while a member that can serve exists`);
    if (hasQuota(cur) && !settles(T)) miss('I2', scene, 'voluntary move under the settle bar', `a VOLUNTARY move (the current can serve) lands on ${fmt(T)}, under the settle bar`);
    if (!hasQuota(cur) && cur.kind !== 'o' && cur.q !== 'lapsed' && !hasQuota(T)) miss('I2', scene, 'billed onto billed', `a member billing past its quota hops onto ${fmt(T)}, billed onto billed`);
    // I3: no ping-pong
    const d2 = decide(P, pool, d.to);
    blockedCheck(d2, 'the second tick');
    if (d2.to === 'm0') miss('I3', scene, 'moves back', `ping-pong: ${fmt(cur)} → ${fmt(T)} → back (${d.reason}/${d.band || '-'}, then ${d2.reason}/${d2.band || '-'})`);
    else if (d2.to) { const d3 = decide(P, pool, d2.to); blockedCheck(d3, 'the third tick'); if (d3.to) miss('I3', scene, 'a third move', `a third tick moves again: ${fmt(cur)} → ${fmt(T)} → ${fmt(S(d2.to))} → ${fmt(S(d3.to))}`); }
  }
  // the walks. Each asks its OWN candidates (the others: the current member is the one being left or removed), so «a member pays» is
  // read there; with nobody paying among them the walk asks the release's own question — and I6 is ASSERTED for it (r4903)
  const walksPay = others.some((s) => s.kind === 'p');
  let r0 = null, fb = null;
  ({ r0, fb } = walkChecks(P, pool, others, scene, miss));   // r5239: rule 3's one order whoever pays — the walks' own checks on every pool
  if (!walksPay) walkDiff(pool, scene, same);   // nobody among the others paying: the difference set against the release (I6 restated)
  // I11 (r5239 (4)): the avoid-overage setting is read by the two walks as the decision reads it — its set changes neither walk's order
  if (setting && (JSON.stringify(rankOf(P, pool)) !== JSON.stringify(rankOf(P, pool, null)) || fallbackOf(P, pool) !== fallbackOf(P, pool, null))) miss('I11', scene, 'the setting moves a walk', 'with the setting on, the device list or the fallback differs from the setting off');
  // I1: a current member that cannot serve (walled, lapsed): the decision's landing, the list's head and the fallback stand in ONE place
  if (d.to && (cur.q === 'lapsed' || (cur.kind === 'o' && !hasQuota(cur)))) {
    const pd = place(S(d.to)), pr = r0 ? place(S(r0)) : null, pf = fb && !keptShape(others) ? place(S(fb)) : (fb ? pd : null);   // r5252: the kept shape's fallback, named apart
    if (pr !== pd || pf !== pd) miss('I1', scene, `places: decision ${pd}, list ${pr}, fallback ${pf}`, `the decision lands on ${fmt(S(d.to))}, the list's head is ${r0 ? fmt(S(r0)) : 'nobody'}, the fallback ${fb ? fmt(S(fb)) : 'nobody'}`);
  }
  // I7: in a turn (warm or cold cache) nothing moves off a paying member, or onto one, unless the current member cannot serve
  const inTurn = IN_TURN.map((w) => [w, decide(P, pool, 'm0', { warm: w })]);
  for (const [w, dw] of inTurn) {
    blockedCheck(dw, 'the decision in a turn');
    if (dw.to) landing(dw, 'the decision in a turn');
    if (dw.to && (cur.kind === 'p' || S(dw.to).kind === 'p') && hasQuota(cur)) miss('I7', scene, `${w.warm ? 'warm' : 'cold'} cache`, `in a turn (${w.warm ? 'warm' : 'cold'} cache) ${fmt(cur)} moves to ${fmt(S(dw.to))} (${dw.reason}/${dw.band || '-'})`);
  }
  // I9 (r4903): a paying member that still takes turns, beside a member that is not paying and clears the settle bar (under the reserve
  // floor too: quota in reserve is used before dollars), LEAVES it — out of a turn it moves onto that tier; in a turn it is owed to its stop
  if (cur.kind === 'p' && takesTurn(cur) && others.some((s) => s.kind !== 'p' && settles(s))) {
    if (!d.to || S(d.to).kind === 'p') miss('I9', scene, 'stays on the paying member', `out of a turn it ${d.to ? `moves onto ${fmt(S(d.to))}` : `stays (${d.reason})`} beside a member that settles`);
    if (hasQuota(cur)) for (const [w, dw] of inTurn) if (dw.to || dw.reason !== 'warm-soft-defer') miss('I9', scene, 'in a turn: not owed to its stop', `in a turn (${w.warm ? 'warm' : 'cold'} cache): ${dw.to ? `moves onto ${fmt(S(dw.to))}` : dw.reason}`);
  }
  // I5 on EVERY START (r4903 M2, r4986: A RESUME IS A START): a cold spawn has no turn to cut — it is never placed on a paying member while
  // an ordinary or a credits member can serve now, whichever band; a GUESSED family (a hint, or none) is judged FAIL CLOSED, every bucket
  if (hot) for (const [n, k] of START_KINDS) {
    const dp = startOf(P, pool, k);
    blockedCheck(dp, `the start (${n})`);
    const canServe = guessOf(k) ? hasQuotaAll : hasQuota;
    const placed = (dp && dp.to) || 'm0';
    if (dp && dp.to) landing(dp, `the start (${n})`, canServe);
    if (S(placed).kind === 'p' && others.some((s) => s.kind !== 'p' && canServe(s))) miss('I5', scene, `start: ${n}`, `a start (${n}) is placed on ${fmt(S(placed))} (${dp && dp.to ? 'moved' : `kept: ${dp ? dp.reason : 'the default'}`}) while an ordinary or credits member can serve now`);
    // the fail-closed judgement and «a start lands where a turn can be taken» are the placing law's, which binds a PAYING default; a default
    // that does not pay keeps the release's start (no family ⇒ the default; a lapsed one never reaches the entry: the chooser parks it first)
    if (cur.kind === 'p' && guessOf(k) && dp && dp.to && !hasQuotaAll(S(dp.to)) && others.some(hasQuotaAll)) miss('I2', scene, `start on a guess (${n}) onto a member that cannot serve every bucket`, `a start (${n}) is placed on ${fmt(S(dp.to))}, which cannot serve every bucket the guess could mean`);
    if (cur.kind === 'p' && all.some(takesTurn) && !takesTurn(S(placed))) miss('I2', scene, `start (${n}) on a member taking no turn`, `a start (${n}) is placed on ${fmt(S(placed))}, which takes no turn`);
  }
  if (hot && cur === P_HELD_FROM) for (const [k, n, why] of heldStarts(P, pool, others)) miss(k, scene, `start on a held paying member: ${n}`, why);
}
const ms = Date.now() - t0;
console.log('  · rule 3\'s places: 0 ordinary that can serve, 1 credits that can, 2 paying that can, 3 credits past their quota, 4 paying past their quota, 5 a walled ordinary member, 6 a lapsed one');
console.log(`  · the space: ${pools} pools (${payingPools} with a member paying, ${plainPools} with none), ${STATES.length} states, ${multisets.length} sets of others, two arrangements — ${ms} ms`);
// counted apart from the loop: a pool with a member paying is built hot and cold × the setting on and off, one with none hot and cold, each in both arrangements
let wantPaying = 0, wantPlain = 0;
for (const c of STATES) for (const m of multisets) { if (c.kind === 'p' || m.some((i) => STATES[i].kind === 'p')) wantPaying += 8; else wantPlain += 4; }
ck(`the space was built whole: ${payingPools} pools with a member paying, ${plainPools} with none (counted apart: ${wantPaying} and ${wantPlain})`, payingPools === wantPaying && plainPools === wantPlain && wantPaying > 0 && wantPlain > 0);
const WHAT = { I1: 'the walks stand in the same place of the one order', I2: 'nothing lands on a member that cannot serve while one can; a voluntary move only past the settle bar; never billed onto billed', I3: 'no ping-pong', I4: 'never blocked while a paying member can take a turn', I5: 'a paying member only when no earlier tier can serve — EVERY START included (a model sent, a hint, no family; a guess judged fail closed)', I6: 'with nobody paying (and for the walks where only the current member pays), byte for byte the release', I7: 'in a turn nothing moves off or onto a paying member while the current can serve', I8: 'the same readings give the same answer, on every pool', I9: 'a paying member beside a member that settles (under the reserve floor too) leaves it: out of a turn it moves, in one it is owed', I10: 'a landing on a paying member is marked (toPaying), whatever the setting' , I11: 'the avoid-overage setting is read by the two walks as the decision reads it: its set changes neither walk\'s order' };
for (const k of INV) {
  const b = bad[k];
  ck(`${k} — ${WHAT[k]}: ${b.n} failing decisions in ${b.shapes.size} shapes`, b.n === 0);
  for (const [kind, g] of b.kinds) { console.log(`      [${kind}] ${g.n} in ${g.shapes.size} shapes`); for (const e of g.ex) console.log('        ' + e); }
}
// I6 RESTATED (r5239 (3)): the difference set against the release, counted by kind and PINNED (a count that moves is red — a new kind
// of difference, or one more of a kind, is a change of the release's answers to read again)
const DIFF_PIN = { list: 2024, fbLive: 2288, fbBill: 0, kept: 352 };   // measured at the cure (r5239 / r5252): RUN 606a0f752-20261126203032-box for list and fbLive, the kept shape = that run's fbBill
const diffCount = (k) => (DIFF.get(k) || { n: 0 }).n;
console.log('  · I6 restated, the difference set against the release (eb7608d5): ' + Object.keys(KINDS).map((k) => `${k} ${diffCount(k)}`).join(' · '));
for (const [k, g] of DIFF) { console.log(`      [${KINDS[k]}] ${g.n} in ${g.shapes.size} shapes`); for (const e of g.ex) console.log('        ' + e); }
ck(`I6 restated: the two walks differ from the release only by the named kinds, each count pinned (${Object.keys(KINDS).map((k) => `${k} ${diffCount(k)}`).join(', ')})`, !!DIFF_PIN && Object.keys(KINDS).every((k) => diffCount(k) === DIFF_PIN[k]) && [...DIFF.keys()].every((k) => k in KINDS));
// THE MONEY PIN (r5239 (3)): no state where a walk names a billing member while the release's own decision in that walk's state keeps
// every conversation off one — a NEW SPEND, the owner's to decide: the unit STOPS on it (each one written out below)
ck(`I6 restated — THE MONEY PIN: no new spend (${NEW_SPEND.length} states where a walk names a billing member the release's own decision there does not)`, NEW_SPEND.length === 0);
for (const s of NEW_SPEND.slice(0, 12)) console.log('    NEW SPEND: ' + s);
// r5252: under READING A the money pin names its 80 states (pinned: the page msgs/bl-accounts-B-d74f-money-pin-stop.md), all inside the
// kept shape — where this tree keeps the release's park
const A_SPEND_PIN = 80;
ck(`r5252 reading A (a copy without the kept park) is read, and its money pin names ${A_SPEND.length} states, the page's ${A_SPEND_PIN}, all in the kept shape`, !!READ_A && A_SPEND.length === A_SPEND_PIN);
console.log(`  · r5252, the kept shape: ${keptApart} fallback answers where nobody pays and no candidate can serve — the release's park, the walks' fallback checks named apart there`);
console.log("  · r5252, the clock just past the walled ordinary member's weekly reset, in those states:");
for (const [k, label] of [['i', '(i) the RELEASE starts a new conversation on'], ['ii', "(ii) reading A's tree starts it on"], ['iii', "(iii) reading A's own default pass (maybePoolAutoSwitchForPool → decideDefault)"]]) console.log(`    ${label}: ` + [...RESET[k]].map(([w, n]) => `${w} ×${n}`).join(' · '));
// PLACE 3 (r5239 (2)): OUT of this unit — counted, never judged; the line names it apart
console.log(`  · place 3, out of this unit (r5239): ${place3} decisions in a turn move a conversation off a member that can serve, where nobody pays (the soft band on a cold cache); first: ${place3Ex.join(' ;; ') || 'none'}`);

// THE WALKS' REDs (r4903 M1): with its tier sort taken out — the device list's last tier back on the release's own sort, the fallback
// without its tier key — the walks' own checks go red over the arrangement against the tiers (a cold pool, the setting off)
const walksOnly = (mod) => {
  let n = 0;
  for (const cur of STATES) for (const m of multisets) {
    const others = m.map((i) => STATES[i]);
    if (!others.some((s) => s.kind === 'p')) continue;
    const pool = poolOf(cur, others, false, false, true);
    walkChecks(mod, pool, others, { cur: '', others: '', hot: '', setting: '', arr: '' }, () => { n++; });
  }
  return n;
};
{ const src = fs.readFileSync(path.join(REPO, 'src/account-pool-auto.js'), 'utf8');
  const noRankSort = M.load('src/account-pool-auto.js', anchored(src, '  last.sort((x, y) => (keyOf(lastTier.get(x)) - keyOf(lastTier.get(y))) || order(x, y));', '  last.sort(order);', 'the device list without its tier sort'), 'walks-red-rank');
  const noFallbackSort = M.load('src/account-pool-auto.js', anchored(src, ' || (keyOf(x) - keyOf(y)) || ', ' || ', 'the fallback without its tier key'), 'walks-red-fallback');
  const nP = walksOnly(P), nR = walksOnly(noRankSort), nF = walksOnly(noFallbackSort);
  ck(`the walks' checks over the arrangement against the tiers: green at this tree (${nP})`, nP === 0);
  ck(`RED: the device list's last tier back on the release's own sort turns them red (${nR} failing checks)`, nR > 0);
  ck(`RED: the fallback without its tier key turns them red (${nF} failing checks)`, nF > 0); }
// THE HELD START's RED (r4986): with the no-data hold standing on a START too (the clause `!(starting && curPayingTakes)` taken out, in
// a copy), a start with no family or a hint only stays on a held paying member — the checks above go red over the same pools
const heldOnly = (mod) => {
  let n = 0;
  for (const against of [false, true]) for (const ms of multisets) for (const setting of [false, true]) {
    const others = ms.map((i) => STATES[i]);
    n += heldStarts(mod, poolOf(P_HELD_FROM, others, true, setting, against), others).length;
  }
  return n;
};
{ const src = fs.readFileSync(path.join(REPO, 'src/account-pool-auto.js'), 'utf8');
  const holds = M.load('src/account-pool-auto.js', anchored(src, ' && !curHeldWalled && !(starting && curPayingTakes);', ' && !curHeldWalled;', 'the no-data hold on a start too'), 'held-start-red');   // stale-pins: kept (the RED's text IS 85bc67492's no-data hold)
  const nP = heldOnly(P), nH = heldOnly(holds);
  ck(`the starts on a held paying member: green at this tree (${nP} failing checks)`, nP === 0);
  ck(`RED: the no-data hold standing on a start too turns them red (${nH} failing checks)`, nH > 0); }
// THE ONE ORDER's RED (r5239, B-d74f): with the release's shortcut put back (with nobody paying the key is the tier), the walks' own
// checks on the pools where nobody pays go red; its witness: the copy's order key keeps a walled ordinary member at the tier's own key
const plainWalks = (mod) => {
  let n = 0;
  for (const against of [false, true]) for (const cur of STATES) for (const m of multisets) {
    const others = m.map((i) => STATES[i]), all = [cur, ...others];
    if (all.some((s) => s.kind === 'p')) continue;
    walkChecks(mod, poolOf(cur, others, false, false, against), others, { cur: '', others: '', hot: '', setting: '', arr: '' }, () => { n++; });
  }
  return n;
};
{ const src = fs.readFileSync(path.join(REPO, 'src/account-pool-auto.js'), 'utf8');
  let short = null;
  try { short = M.load('src/account-pool-auto.js', anchored(src, '  const orderOf = (rows) => (r) => (r.live ? r.tier : r.tier === TIER_QUOTA ? TIER_PAYING + 3 : r.tier + 2);', "  const orderOf = (rows) => { if (!(rows || []).some((r) => r.tier === TIER_PAYING)) return (r) => r.tier; return (r) => (r.live ? r.tier : r.tier === TIER_QUOTA ? TIER_PAYING + 3 : r.tier + 2); };", 'the nobody-pays shortcut'), 'one-order-red'); } catch (e) { ck('RED CONTROL built (the nobody-pays shortcut, from this tree\'s order line)', false); }   // stale-pins: kept (the RED's text IS a92ccc273's order key)
  const walled = { tier: 0, live: false }, key = (mod) => mod.poolTiers({}).orderOf([walled])(walled);
  const nP = plainWalks(P);
  ck(`the walks' checks on the pools where nobody pays: green at this tree (${nP} failing checks)`, nP === 0);
  if (short) { const nS = plainWalks(short);
    ck(`RED CONTROL in force: the copy's order keeps a walled ordinary member at the tier's own key where nobody pays (${key(short)}; this tree ${key(P)})`, key(short) === 0 && key(P) > 0);
    ck(`RED: the release's shortcut put back turns them red (${nS} failing checks)`, nS > 0); } }
// THE PIN (r4986; r5067: the pin road too): the engine's chooser asks decideStart exactly as this leg does — the start's family, its hint, the default's staleness,
// the bare reading, hot: true, no `placing` of its own, and no decision of its own beside it
{ const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const i = eng.indexOf('\nfunction poolChooserForModel('), j = eng.indexOf('\nfunction ', i + 10), body = i < 0 ? '' : eng.slice(i, j < 0 ? undefined : j);
  const call = (body.match(/const chooseNow = \(\) => decideStart\(\{[^\n]*\}\);/) || [''])[0];
  ck('THE PIN: the chooser\'s decision is decideStart\'s, called as this leg calls it (family, hint, stale default, bare reading, hot: true, no placing of its own), and the pin road asks it too (r5067): no decidePoolSwitch or decidePinnedPlacement of the chooser\'s own', typeof P.decideStart === 'function' && /decideStart\(\{ family: fam, hinted, defaultStale: staleDefault, baseReadCache: base, currentId: cur,/.test(call) && /hot: true/.test(call) && !/placing:/.test(call) && !/decidePoolSwitch\(/.test(body) && !/decidePinnedPlacement\(/.test(body) && /decideStart\(\{ family: fam, hinted, baseReadCache: base, pin, currentId: cur,/.test(body)); }
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: rel ? 6 : 5, label: 'tier-invariants: ' })) ck(r.name, r.pass);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

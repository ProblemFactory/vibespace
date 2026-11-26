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
const rankOf = (mod, pool) => mod.rankPoolMembers({ members: pool.others, readCache: pool.readCache, nowSec: NOW, readLogin: pool.readLogin, creditsIds: pool.creditsIds, payingIds: pool.payingIds });
const fallbackOf = (mod, pool) => { const x = mod.soonestUsableMember({ members: pool.others, readCache: pool.readCache, nowSec: NOW, readLogin: pool.readLogin, creditsIds: pool.creditsIds, payingIds: pool.payingIds }); return x && typeof x === 'object' ? x.id : x; };
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
const INV = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10'];
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
function walkChecks(mod, pool, others, scene, report) {
  const S = (id) => pool.st.get(id);
  const anyQuota = others.some(hasQuota), anyTurn = others.some(takesTurn);
  const rk = rankOf(mod, pool), r0 = rk.length ? rk[0].id : null, fb = fallbackOf(mod, pool);
  if (r0) {
    if (anyQuota && !hasQuota(S(r0))) report('I2', scene, 'device list head cannot serve, one that can there', `the device list's head is ${fmt(S(r0))} while a member that can serve exists`);
    if (!takesTurn(S(r0))) report('I2', scene, 'device list head takes no turn', `the device list's head ${fmt(S(r0))} takes no turn`);
    if (S(r0).kind === 'p' && others.some((s) => s.kind !== 'p' && hasQuota(s))) report('I5', scene, 'device list', 'the device list puts a paying member first while an earlier tier can serve');
  }
  if (fb) {
    if (anyTurn && !takesTurn(S(fb))) report('I2', scene, 'fallback onto a member taking no turn', `the fallback parks on ${fmt(S(fb))}, which takes no turn, while a member takes one`);
    if (anyQuota && !hasQuota(S(fb))) report('I2', scene, 'fallback onto a member that cannot serve, one that can there', `the fallback parks on ${fmt(S(fb))} while a member that can serve exists`);
    if (S(fb).kind === 'p' && others.some((s) => s.kind !== 'p' && hasQuota(s))) report('I5', scene, 'fallback', 'the fallback parks on a paying member while an earlier tier can serve');
  }
  return { r0, fb };
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
    same('device list', rankOf(P, pool), rankOf(rel, pool));
    same('fallback', fallbackOf(P, pool), fallbackOf(rel, pool));
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
  if (walksPay) ({ r0, fb } = walkChecks(P, pool, others, scene, miss));
  else if (rel) { same('device list, only the current member paying', rankOf(P, pool), rankOf(rel, pool)); same('fallback, only the current member paying', fallbackOf(P, pool), fallbackOf(rel, pool)); }
  // I1: a current member that cannot serve (walled, lapsed): the decision's landing, the list's head and the fallback stand in ONE place
  if (d.to && walksPay && (cur.q === 'lapsed' || (cur.kind === 'o' && !hasQuota(cur)))) {
    const pd = place(S(d.to)), pr = r0 ? place(S(r0)) : null, pf = fb ? place(S(fb)) : null;
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
const WHAT = { I1: 'the walks stand in the same place of the one order', I2: 'nothing lands on a member that cannot serve while one can; a voluntary move only past the settle bar; never billed onto billed', I3: 'no ping-pong', I4: 'never blocked while a paying member can take a turn', I5: 'a paying member only when no earlier tier can serve — EVERY START included (a model sent, a hint, no family; a guess judged fail closed)', I6: 'with nobody paying (and for the walks where only the current member pays), byte for byte the release', I7: 'in a turn nothing moves off or onto a paying member while the current can serve', I8: 'the same readings give the same answer, on every pool', I9: 'a paying member beside a member that settles (under the reserve floor too) leaves it: out of a turn it moves, in one it is owed', I10: 'a landing on a paying member is marked (toPaying), whatever the setting' };
for (const k of INV) {
  const b = bad[k];
  ck(`${k} — ${WHAT[k]}: ${b.n} failing decisions in ${b.shapes.size} shapes`, b.n === 0);
  for (const [kind, g] of b.kinds) { console.log(`      [${kind}] ${g.n} in ${g.shapes.size} shapes`); for (const e of g.ex) console.log('        ' + e); }
}

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
// THE PIN (r4986): the engine's chooser asks decideStart exactly as this leg does — the start's family, its hint, the default's staleness,
// the bare reading, hot: true, no `placing` of its own, and no decision of its own beside it
{ const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const i = eng.indexOf('\nfunction poolChooserForModel('), j = eng.indexOf('\nfunction ', i + 10), body = i < 0 ? '' : eng.slice(i, j < 0 ? undefined : j);
  const call = (body.match(/const chooseNow = \(\) => decideStart\(\{[^\n]*\}\);/) || [''])[0];
  ck('THE PIN: the chooser\'s decision is decideStart\'s, called as this leg calls it (family, hint, stale default, bare reading, hot: true, no placing of its own), no decidePoolSwitch beside it', typeof P.decideStart === 'function' && /decideStart\(\{ family: fam, hinted, defaultStale: staleDefault, baseReadCache: base, currentId: cur,/.test(call) && /hot: true/.test(call) && !/placing:/.test(call) && !/decidePoolSwitch\(/.test(body)); }
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: rel ? 4 : 3, label: 'tier-invariants: ' })) ck(r.name, r.pass);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

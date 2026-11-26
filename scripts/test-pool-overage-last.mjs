#!/usr/bin/env node
// B-87fd item (1) (THE OWNER's WORD, 2026-11-25 «改成永远排最后», 主开发 r4668): a member BILLING PAID OVERAGE is never preferred over
// a member with quota left. PAYING IS ITS OWN LAST TIER (主开发 r4711): the PURE decision (src/account-pool-auto.js decidePoolSwitch,
// rankPoolMembers, soonestUsableMember) asks it only when the quota members, the scraps and the credits members cannot serve (a tier
// whose every row is spent is passed over), the credits list the release's; the engine (src/server/usage-pool-engine.js
// overageInUseIds) hands the in-use set ALWAYS, read from the RAW reading only. The legs: the release probe's five as a table; the
// line's (a) the only servable member pays — it still serves; (b) a conversation already on a paying member — moved by the soft band,
// owed to its stop, kept with nowhere to go, moved to a credits member's PREPAID quota at its stop (the ruling); r4714's leg (b) and
// its twin; the hop guard; THE NO-OVERAGE IDENTITY TABLE against the release's own module; REDs that are the earlier rankings; the
// engine's reader pinned to the raw reading, its notices naming the bar. Every account is made up; nothing is spawned or read.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';   // FIRST of the lib imports (B-ba47): the suite runs on a temp home of its own
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ck = (n, c) => { if (typeof c !== 'boolean') throw new TypeError(`ck() was handed a ${typeof c} as its condition (arguments swapped, or not a verdict): ${n}`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const P = require(path.join(REPO, 'src/account-pool-auto.js'));
const { projectCacheForFamily } = require(path.join(REPO, 'src/model-family.js'));
const NOW = 1800000000, H = 3600, D = 86400;   // unix seconds
const acct = (u7, resetIn, { u5 = 0, r5 = NOW + 1800, uf = null } = {}) => ({ fiveHour: { utilization: u5, resetsAt: r5 }, sevenDay: { utilization: u7, resetsAt: NOW + resetIn }, scopedWeekly: uf == null ? [] : [{ name: 'Fable', utilization: uf, resetsAt: NOW + resetIn }] });
/** THE RELEASE's OWN MODULE for the identity table (test-pool-auto's preFixCopy, mirror-197): `git show <ref>:<file>` where the ref is in
 *  this clone; a SHALLOW clone (the Actions mirror, depth 1) answers why = 'shallow' and the caller SKIPS with evidence; an absent ref on a
 *  FULL clone is a failure by name. Git runs under the sanitized env with the checkout as cwd. */
async function preFixCopy(M, ref, rel, tag) {
  const { execFileSync } = await import('node:child_process');
  const { gitEnvFrom } = await import('./git-env.mjs');
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', cwd: REPO, env: gitEnvFrom(process.env), stdio: ['ignore', 'pipe', 'ignore'] });
  let has = false; try { git(['cat-file', '-e', `${ref}^{commit}`]); has = true; } catch { has = false; }
  if (has) { try { return { mod: M.load(rel, git(['show', `${ref}:${rel}`]), tag), why: null }; } catch (e) { return { mod: null, why: `git show ${ref}:${rel} failed: ${String(e && e.message).slice(0, 120)}` }; } }
  let shallow = false; try { shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true'; } catch { shallow = false; }
  return { mod: null, why: shallow ? 'shallow' : `the ref ${ref} is not in this clone, which is NOT shallow` };
}
const skipPreFix = (label, ref) => console.log(`  ⊘ SKIP ${label}the byte-identity table against ${ref} — the ref is not in this SHALLOW clone (the mirror's depth-1 checkout); the ref-free half carries the leg`);
const M = mutantCopies('pool-overage-last', REPO);
// ── B-87fd (1) (THE OWNER's WORD, 主开发 r4668 «改成永远排最后»): a member BILLING PAID OVERAGE is never preferred over a member
//    with quota left — its OWN last tier, after the credits members (r4711); the engine hands the in-use set ALWAYS
//    (read from the raw reading only); the setting pool.avoidOverageMembers (default unchanged) decides only whether a verdict NAMES
//    the bar. Every account here is made up. ──
{
  const src = fs.readFileSync(path.join(REPO, 'src/account-pool-auto.js'), 'utf8');
  // TODAY's RANKING (the RED): the in-use set read as nothing — the release's ranking for every pool where the setting is off
  const today = M.load('src/account-pool-auto.js', anchored(src, '  const paying = new Set([...(payingIds || []), ...(overageIds || [])]);', '  const paying = new Set([...(overageIds || [])]);', 'today\'s ranking: the in-use set read as nothing'), 'today');
  const fm = (u7, resetIn, { u5 = 0 } = {}) => ({ fiveHour: { utilization: u5, resetsAt: NOW + 1800 }, sevenDay: { utilization: u7, resetsAt: NOW + resetIn }, scopedWeekly: [] });
  const view = (caches) => (id) => projectCacheForFamily(caches[id] ?? null, 'opus');
  const mem = [{ id: 'a', name: 'Default' }, { id: 'r', name: 'Quota left' }, { id: 'o', name: 'Paying overage' }];
  const dec = (mod, caches, opts = {}) => mod.decidePoolSwitch({ currentId: 'a', members: mem, readCache: view(caches), nowSec: NOW, explain: true, hot: true, ...opts });
  const dead = fm(0.99, 3 * D);   // the default cannot serve: its 7d under the hard bar
  const PAY = { payingIds: new Set(['o']) };   // the engine's in-use set, handed ALWAYS
  // THE PROBE's FIVE, as a table (the scratch probe on the release, RUN 61bf201c5-20261125223100-box, read them TODAY)
  const T = [];
  { const c = { a: dead, r: fm(0.6, 3 * D), o: fm(0.3, 3 * D) };
    T.push(['P1 the paying member has MORE left on the same deadline — a switch, the setting OFF', dec(P, c, PAY).to, 'r'],
      ['P1 …a NEW conversation whose default cannot serve (placing), the setting OFF', dec(P, c, { ...PAY, placing: true }).to, 'r'],
      ['P1 …the setting ON', dec(P, c, { ...PAY, overageIds: ['o'] }).to, 'r']); }
  { const c1 = { a: dead, r: fm(0.6, 1 * D), o: fm(0.3, 5 * D) }, c2 = { a: dead, r: fm(0.6, 5 * D), o: fm(0.3, 1 * D) };
    T.push(['P2 the quota member resets first', dec(P, c1, PAY).to, 'r'], ['P2 the PAYING member resets first — the quota member still', dec(P, c2, PAY).to, 'r']); }
  { const c = { a: fm(0.4, 3 * D), r: fm(0.6, 3 * D), o: fm(0.1, 3 * D) }; const d = dec(P, c, { ...PAY, placing: true, hot: false });
    T.push(['P3 a healthy default keeps a new conversation (no move)', d.to || 'a', 'a']); }
  { const c = { a: dead, r: fm(0.99, 3 * D), o: fm(0.3, 3 * D) }; const off = dec(P, c, PAY), on = dec(P, c, { ...PAY, overageIds: ['o'] });
    T.push(['P4 / line (a): the paying member is the ONLY one that can serve — it still serves (the setting off)', off.to, 'o'],
      ['P4 …and the verdict names where it went (to / toName)', off.toName, 'Paying overage'],
      ['P4 …the setting ON serves there too', on.to, 'o'],
      ['P4 …and NAMES the bar (toOverage)', !!(on.toOverage && on.toOverage.id === 'o'), true],
      ['P4 …the setting OFF names no bar, as the release (no toOverage, no toCredits)', !off.toOverage && !off.toCredits, true]); }
  { const c = { a: dead, r: fm(0.6, 3 * D), o: fm(0.3, 3 * D) };
    T.push(['P5 a usage-credits member ranks below every member with quota left, as before', dec(P, c, { creditsIds: ['o'] }).to, 'r']); }
  for (const [n, got, want] of T) ck(`overage-last: ${n} → ${JSON.stringify(got)}`, got === want);
  ck('overage-last RED (today\'s ranking): P1 — a switch with the setting off goes to the PAYING member', dec(today, { a: dead, r: fm(0.6, 3 * D), o: fm(0.3, 3 * D) }, PAY).to === 'o');
  ck('overage-last RED (today\'s ranking): P2 — the paying member resetting first is drained first', dec(today, { a: dead, r: fm(0.6, 5 * D), o: fm(0.3, 1 * D) }, PAY).to === 'o');
  // LINE (b): a conversation ALREADY running on a paying member, at its next decision
  { const memB = [{ id: 'o', name: 'Paying overage' }, { id: 'r', name: 'Quota left' }];
    const decB = (mod, caches, opts = {}) => mod.decidePoolSwitch({ currentId: 'o', members: memB, readCache: view(caches), nowSec: NOW, explain: true, hot: true, ...opts });
    const c = { o: fm(0.3, 3 * D), r: fm(0.4, 3 * D) };
    const mv = decB(P, c, PAY);
    ck('overage-last (b): on a paying member with a quota member that can settle, its next decision MOVES it there (reason overage, the soft band — the release\'s own soft-move rules)', mv.to === 'r' && mv.reason === 'overage' && mv.band === 'soft');
    const warm = decB(P, c, { ...PAY, warm: { warm: true, inTurn: true, agoSec: 10, ttlSec: 300 } });
    ck('overage-last (b): …mid-turn with a warm cache it is NOT cut — the move is owed to its first stop (warm-soft-defer, the release\'s own hold)', !warm.to && warm.reason === 'warm-soft-defer' && warm.paying === true && warm.wouldTo === 'r');
    const cold = decB(P, c, { ...PAY, warm: { warm: false, inTurn: false, agoSec: 900, ttlSec: 300 } });
    ck('overage-last (b): …a cold conversation not in a turn moves at once, as the soft band does', cold.to === 'r' && cold.reason === 'overage');
    const stay = decB(P, { o: fm(0.3, 3 * D), r: fm(0.99, 3 * D) }, PAY);
    ck('overage-last (b): …with no quota member able to settle it STAYS — the release\'s own answer (healthy), never «no member can settle»', !stay.to && stay.reason === 'healthy');
    const todayB = decB(today, c, PAY);
    ck('overage-last (b) RED (today\'s ranking): the conversation on the paying member stays put', !todayB.to); }
  // THE NO-OVERAGE IDENTITY TABLE: many made-up pools with NO member in overage — every placement and every switch, byte for byte the
  // release's (eb7608d54, this commit's parent: the historical rung where the ref is here, mirror-197) — and the rank / fallback walks too
  const pre = await preFixCopy(M, 'eb7608d5', 'src/account-pool-auto.js', 'release');
  const rel = pre.mod;
  if (!rel && pre.why === 'shallow') skipPreFix('overage-last: ', 'eb7608d5');
  else ck(`overage-last: the release copy (eb7608d5) loaded for the identity table${pre.why ? ` — ${pre.why}` : ''}`, !!rel && typeof rel.decidePoolSwitch === 'function');
  { const ref = rel || today;   // ref-free half (a shallow clone): today's ranking
    let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ids = ['a', 'b', 'c', 'd', 'e'];
    let same = 0, n = 0, diff = null;
    for (let i = 0; i < 400; i++) {
      const caches = {}; for (const id of ids) caches[id] = rnd() < 0.1 ? null : acct(Math.round(rnd() * 100) / 100, Math.round(rnd() * 6 * D) + H, { u5: Math.round(rnd() * 100) / 100, uf: rnd() < 0.5 ? Math.round(rnd() * 100) / 100 : null });
      const memI = ids.filter(() => rnd() < 0.85).map((id) => ({ id, name: id.toUpperCase() }));
      const cur = ids[Math.floor(rnd() * ids.length)];
      const proactive = rnd() < 0.5;
      const w = rnd() < 0.3 ? { warm: rnd() < 0.5, agoSec: 10, ttlSec: 300, inTurn: rnd() < 0.5 } : null;
      const base = { currentId: cur, members: memI, readCache: (id) => caches[id] ?? null, nowSec: NOW, proactive, hot: proactive, placing: rnd() < 0.3, exclude: rnd() < 0.2 ? ['b'] : null, creditsIds: rnd() < 0.2 ? ['e'] : null, warm: w, explain: true };
      for (const pay of [null, new Set(), []]) {   // nobody pays: the engine's null, an empty set, an empty list
        n++;
        const want = JSON.stringify(ref.decidePoolSwitch(base)), got = JSON.stringify(P.decidePoolSwitch({ ...base, payingIds: pay }));
        if (got === want) same++; else if (!diff) diff = { i, pay: pay === null ? 'null' : 'empty', want, got };
      }
      const rk = { members: memI, readCache: (id) => caches[id] ?? null, nowSec: NOW, creditsIds: base.creditsIds };
      n++; if (JSON.stringify(ref.rankPoolMembers(rk)) === JSON.stringify(P.rankPoolMembers({ ...rk, payingIds: null }))) same++; else if (!diff) diff = { i, rank: true };
      n++; if (JSON.stringify(ref.soonestUsableMember(rk)) === JSON.stringify(P.soonestUsableMember({ ...rk, payingIds: null }))) same++; else if (!diff) diff = { i, soonest: true };
    }
    ck(`overage-last: THE NO-OVERAGE IDENTITY — ${n} seeded placements, switches, ranks and fallbacks with NO member in overage are byte-identical to ${rel ? 'the release (eb7608d5)' : 'today\'s ranking (ref-free)'}`, same === n);
    if (same !== n) console.log('    first difference: ' + JSON.stringify(diff).slice(0, 600)); }
  // THE ENGINE's READER, pinned to the RAW reading (P7: a stated overage, never an estimate), and handed beside EVERY credits set
  { const ENG = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
    const body = (t) => { const m = /function overageInUseIds\(members\) \{([\s\S]*?)\n\}/.exec(t); return m ? m[1] : ''; };
    const pin = (t) => /overageState\(readRawUsageCache\(m\.id\)\)\.inUse === 'yes'/.test(body(t)) && !/poolReadCache|readCacheFor|estimat/.test(body(t)) && (t.match(/creditsIds: creditsMemberIds\((\w+)\)(?!, payingIds: overageInUseIds\(\1\))/g) || []).length === 0 && /serverSetting\('pool\.avoidOverageMembers'\) !== true\) return null;\n    return overageInUseIds\(members\);/.test(t);
    ck('overage-last: the engine\'s in-use reader reads the RAW reading only, the setting gates only the bar\'s naming, and every credits set handed to a decision has the paying set beside it', pin(ENG));
    ck('overage-last RED: a reader on the pool\'s estimated view turns the pin red', !pin(anchored(ENG, "if (overageState(readRawUsageCache(m.id)).inUse === 'yes') out.add(m.id);\n    return out.size ? out : null;\n  } catch { return null; }\n}\n/** THE BAR", "if (overageState(poolReadCache(m.id)).inUse === 'yes') out.add(m.id);\n    return out.size ? out : null;\n  } catch { return null; }\n}\n/** THE BAR", 'a reader on the estimated view')));
    ck('overage-last RED: one decision handed no paying set turns the pin red', !pin(anchored(ENG, 'creditsIds: creditsMemberIds(alive), payingIds: overageInUseIds(alive)', 'creditsIds: creditsMemberIds(alive)', 'a decision handed no paying set')));
    // r4711 (c) / r4714 2.: the setting's words promise the bar is NAMED — BOTH notice builders (a conversation's move, the pool
    // default's switch) say «— the last resort: X is billing paid overage» on a landing in the paying tier (English in this commit)
    const clause = (t) => (t.match(/: (?:ds|d)\.toOverage\b[^\n]*\n\s*\? ` — the last resort: \$\{(?:toName|d\.toName)\} is billing paid overage`/g) || []).length;
    ck('r4714 the notices: both builders name a landing on a paying member — «the last resort: X is billing paid overage»', clause(ENG) === 2);
    ck('r4714 the notices RED: a builder without the clause turns the pin red', clause(anchored(ENG, '          : ds.toOverage', '          : false && ds.toOverage', 'the per-conversation clause')) === 1); }
// ── 主开发 r4696, the round's three MUSTS on 8ab62425d, each with its RED (that tip's own line) ──
{
  const src = fs.readFileSync(path.join(REPO, 'src/account-pool-auto.js'), 'utf8');
  const BLOCKED = ['stuck', 'no-members', 'no-settleable', 'all-lapsed', 'all-logins-expired', 'all-rejected'];
  const PAY = { payingIds: new Set(['o']) };
  const fmM = (u7, resetIn) => ({ fiveHour: { utilization: 0, resetsAt: NOW + 1800 }, sevenDay: { utilization: u7, resetsAt: NOW + resetIn }, scopedWeekly: [] });
  const viewM = (caches) => (id) => projectCacheForFamily(caches[id] ?? null, 'opus');
  // M1: a member billing paid overage that is the ONLY servable one keeps its conversation QUIETLY — the release's own verdict, never a blocked one
  const scenes = [
    ['every other member hard-dead', [{ id: 'o', name: 'Paying' }, { id: 'r', name: 'Spent' }], { o: fmM(0.3, 3 * D), r: fmM(0.99, 3 * D) }, {}],
    ['the other near the end of its login', [{ id: 'o', name: 'Paying' }, { id: 'r', name: 'Expiring' }], { o: fmM(0.3, 3 * D), r: fmM(0.4, 3 * D) }, { readLogin: (id) => (id === 'r' ? { state: 'expiring', msLeft: 10 * 60e3 } : { state: 'live', usable: true, expiresInSec: 40 * 86400 }) }],
    ['the other just refused this conversation', [{ id: 'o', name: 'Paying' }, { id: 'r', name: 'Refused' }], { o: fmM(0.3, 3 * D), r: fmM(0.4, 3 * D) }, { exclude: ['r'] }],
    ['the paying member alone in its pool', [{ id: 'o', name: 'Paying' }], { o: fmM(0.3, 3 * D) }, {}],
    // the ruling (r4711): a scrap ALONE keeps it — under the reserve floor (40 % weekly under a 50 % floor)
    ['the other a scrap under the reserve floor only', [{ id: 'o', name: 'Paying' }, { id: 'r', name: 'Floored' }], { o: fmM(0.3, 3 * D), r: fmM(0.6, 3 * D) }, { reserveFloorPct: 50 }],
    // …and a usage-credits member whose PREPAID quota is spent (billed onto billed is a move for nothing)
    ['the other a usage-credits member whose prepaid quota is spent', [{ id: 'o', name: 'Paying' }, { id: 'c', name: 'Credits' }], { o: fmM(0.3, 3 * D), c: fmM(0.99, 3 * D) }, { creditsIds: ['c'] }],
  ];
  const shapes = [['a conversation (an ordinary decision)', { proactive: false, hot: false }], ['the pool default (a proactive scan)', { proactive: true, hot: true }], ['a new conversation (placing)', { placing: true, hot: true }]];
  const m1 = (mod) => { const out = []; for (const [sn, members, caches, extra] of scenes) for (const [hn, shape] of shapes) { const d = mod.decidePoolSwitch({ currentId: 'o', members, readCache: viewM(caches), nowSec: NOW, explain: true, ...PAY, ...shape, ...extra }); out.push({ sn, hn, to: d.to || null, reason: d.reason }); } return out; };
  const got = m1(P);
  const bad = got.filter((r) => r.to || BLOCKED.includes(r.reason));
  ck(`r4696 M1: a paying member that is the only servable one keeps its conversation quietly — ${got.length} decisions (${scenes.length} pools × ${shapes.length} shapes) all stay, none blocked (${[...new Set(got.map((r) => r.reason))].join(', ')})`, bad.length === 0);
  if (bad.length) console.log('    ' + JSON.stringify(bad.slice(0, 3)));
  ck('r4696 M1: …an ordinary decision answers the release\'s «healthy», a proactive scan its «no-better»', got.filter((r) => r.hn.startsWith('a conversation')).every((r) => r.reason === 'healthy') && got.filter((r) => r.hn.startsWith('the pool default')).every((r) => r.reason === 'no-better'));
  const tipM1 = M.load('src/account-pool-auto.js', anchored(anchored(src,
    "    if (curPayingOnly && !proactive && !prioRank && !placing) return none('healthy', { fromRemaining: cur.known ? cur.remaining : null });\n", '', 'M1 red: the healthy answer'),
    "    if (curPayingOnly) return none('no-better', ", "    if (false) return none('no-better', ", 'M1 red: the no-better answer'), 'm1-red');
  ck('r4696 M1 RED (8ab62425d): with the empty-pool answer missing, a paying member with nowhere to settle gets the pool\'s BLOCKED verdict', m1(tipM1).some((r) => BLOCKED.includes(r.reason)));
  // M2: on a pool that is NOT hot, a conversation IN A TURN with a COLD cache is never moved off a paying member mid-turn — owed at its stop
  const memB = [{ id: 'o', name: 'Paying' }, { id: 'r', name: 'Quota left' }];
  const cB = { o: fmM(0.3, 3 * D), r: fmM(0.4, 3 * D) };
  const m2 = (mod, warm) => mod.decidePoolSwitch({ currentId: 'o', members: memB, readCache: viewM(cB), nowSec: NOW, explain: true, hot: false, ...PAY, warm });
  const held = m2(P, { warm: false, inTurn: true, agoSec: 400, ttlSec: 300 });
  ck('r4696 M2: not hot, in a turn, the cache COLD (a permission card, a long tool): NO move — owed to its stop (warm-soft-defer with paying)', !held.to && held.reason === 'warm-soft-defer' && held.paying === true && held.wouldTo === 'r');
  const stopped = m2(P, { warm: false, inTurn: false, agoSec: 400, ttlSec: 300 });
  ck('r4696 M2: …at its stop (not in a turn) it moves to the quota member', stopped.to === 'r' && stopped.reason === 'overage');
  const tipM2 = M.load('src/account-pool-auto.js', anchored(src, '    if (warm && warm.inTurn && (warm.warm || curPayingOnly)) {', '    if (warm && warm.warm && warm.inTurn) {', 'M2 red: held on a warm cache only'), 'm2-red');   // stale-pins: kept (the RED's text IS 8ab62425d's line)
  ck('r4696 M2 RED (8ab62425d): held on a WARM cache only, a cold cache mid-turn is moved — the restart cuts it mid-turn', m2(tipM2, { warm: false, inTurn: true, agoSec: 400, ttlSec: 300 }).to === 'r');
  // THE RULING (主开发 r4711) — M1's row for this pool is now «moves, at its stop»: a conversation on a paying member whose only other
  // member is a usage-credits member holding PREPAID quota moves onto it by the release's soft-band rules (in a turn: owed to its stop)
  { const memC = [{ id: 'o', name: 'Paying' }, { id: 'c', name: 'Credits' }];
    const cC = { o: fmM(0.3, 3 * D), c: fmM(0.4, 3 * D) };
    const mC = (mod, shape, warm) => mod.decidePoolSwitch({ currentId: 'o', members: memC, readCache: viewM(cC), nowSec: NOW, explain: true, ...PAY, creditsIds: ['c'], ...shape, warm });
    const IN = { warm: false, inTurn: true, agoSec: 400, ttlSec: 300 }, STOP = { warm: false, inTurn: false, agoSec: 400, ttlSec: 300 };
    const rows = shapes.map(([hn, shape]) => [hn, mC(P, shape, IN), mC(P, shape, STOP)]);
    ck(`r4711 THE RULING: on a paying member, a usage-credits member holding prepaid quota — in a turn every shape (${shapes.length}) OWES the move to its stop (warm-soft-defer with paying, toward it)`, rows.every(([, h]) => !h.to && h.reason === 'warm-soft-defer' && h.paying === true && h.wouldTo === 'c'));
    ck('r4711 THE RULING: …at its stop every shape MOVES onto it — reason overage, the soft band, the credits landing named (toCredits, not spent)', rows.every(([, , st]) => st.to === 'c' && st.reason === 'overage' && st.band === 'soft' && !!(st.toCredits && st.toCredits.id === 'c' && st.toCredits.dead === false)));
    const withQuota = P.decidePoolSwitch({ currentId: 'o', members: [...memC, { id: 'r', name: 'Quota left' }], readCache: viewM({ ...cC, r: fmM(0.4, 3 * D) }), nowSec: NOW, explain: true, ...PAY, creditsIds: ['c'], hot: false });
    ck('r4711 THE RULING: …a quota member able to settle is still asked first (the tiers in order)', withQuota.to === 'r' && withQuota.reason === 'overage');
    const redC = M.load('src/account-pool-auto.js', anchored(src, '  const prepaid = curPayingOnly ? (creditsRanked.find((r) => !r.dead) || null) : null;', '  const prepaid = null;', 'the ruling red: no move to prepaid quota'), 'ruling-red');
    ck('r4711 THE RULING RED (4f3305b49 kept it): without the move it stays on the paying member at its stop', !mC(redC, shapes[0][1], STOP).to); }
  // THE HOP GUARD (r4714 3.): a LIVE paying member whose only other paying member is live too STAYS — no hop between two paying
  // members for a better deadline — unless the current one can no longer serve (its own reading under the hard bar)
  { const memH = [{ id: 'o', name: 'Paying' }, { id: 'p', name: 'Paying sooner' }];
    const PAY2 = { payingIds: new Set(['o', 'p']) };
    const hd = (caches, shape) => P.decidePoolSwitch({ currentId: 'o', members: memH, readCache: viewM(caches), nowSec: NOW, explain: true, ...PAY2, ...shape });
    const st = shapes.map(([, shape]) => hd({ o: fmM(0.3, 5 * D), p: fmM(0.1, 1 * D) }, shape));   // the other resets sooner and holds more
    ck(`r4714 HOP GUARD: a live paying member whose only other paying member is live (sooner, fuller) STAYS — ${st.length} shapes, none blocked (${[...new Set(st.map((d) => d.reason))].join(', ')})`, st.every((d) => !d.to && !BLOCKED.includes(d.reason)));
    ck('r4714 HOP GUARD: …unless it can no longer serve (under its hard bar): it moves onto the live paying member', hd({ o: fmM(0.99, 5 * D), p: fmM(0.1, 1 * D) }, shapes[0][1]).to === 'p');
    ck('r4714 HOP GUARD: …and never from a spent paying member onto another spent one', !hd({ o: fmM(0.99, 5 * D), p: fmM(0.99, 1 * D) }, shapes[0][1]).to); }
  // r4714's LEG (b): a HARD-DEAD paying current, a DEAD credits member with the EARLIER deadline, a LIVE paying member — the spent
  // credits tier is passed over and the paying tier asked; its TWIN: the credits member alive takes it
  { const memL = [{ id: 'o', name: 'Paying spent' }, { id: 'c', name: 'Credits spent' }, { id: 'p', name: 'Paying live' }];
    const PAYL = { payingIds: new Set(['o', 'p']) };
    const cL = { o: fmM(0.99, 3 * D), c: fmM(0.99, 1 * D), p: fmM(0.3, 5 * D) };
    const dl = (mod, caches, extra = {}) => mod.decidePoolSwitch({ currentId: 'o', members: memL, readCache: viewM(caches), nowSec: NOW, explain: true, hot: true, creditsIds: ['c'], ...PAYL, ...extra });
    const off = dl(P, cL), on = dl(P, cL, { overageIds: ['o', 'p'] });
    ck(`r4714 (b): the spent credits tier is passed over — it lands on the LIVE PAYING member, never blocked (→ ${off.to}, ${off.reason})`, off.to === 'p' && !BLOCKED.includes(off.reason));
    ck('r4714 (b): …with the setting ON the verdict NAMES the bar (toOverage) and no credits landing', on.to === 'p' && !!(on.toOverage && on.toOverage.id === 'p') && !on.toCredits);
    const twin = dl(P, { ...cL, c: fmM(0.4, 1 * D) });
    ck('r4714 (b) TWIN: the same pool with the credits member ALIVE moves onto the credits member (toCredits)', twin.to === 'c' && !!(twin.toCredits && twin.toCredits.id === 'c'));
    const tipB = M.load('src/account-pool-auto.js', anchored(anchored(anchored(src,
      '      payingRanked.push({', '      creditsRanked.push({', '(b) red: the fold'),
      '  creditsRanked.sort((x, y) => ((x.dead ? 1 : 0) - (y.dead ? 1 : 0)) || order(x, y));', '  creditsRanked.sort((x, y) => (((x.dead || x.paying) ? 1 : 0) - ((y.dead || y.paying) ? 1 : 0)) || order(x, y));', '(b) red: the sort'),   // stale-pins: kept (the RED's text IS 4f3305b49's line)
      '!(curCredits && creditsRanked[0].dead);', '!((curCredits || curPaying) && creditsRanked[0].dead);', '(b) red: the guard'), 'b-red');   // stale-pins: kept (the RED's text IS 4f3305b49's line)
    const rb = dl(tipB, cL);
    ck(`r4714 (b) RED (4f3305b49: the fold, its sort, its guard): the conversation is BLOCKED on that pool (→ ${rb.to}, ${rb.reason})`, !rb.to && BLOCKED.includes(rb.reason)); }
  // M3 (now by the tiers, r4711): a credits member with prepaid quota before a paying member in each of the three walks
  { const mem3 = [{ id: 'a', name: 'Dead' }, { id: 'o', name: 'Paying' }, { id: 'c', name: 'Credits' }];
    const c3 = { a: fmM(0.99, 3 * D), o: fmM(0.3, 1 * D), c: fmM(0.4, 5 * D) };   // the paying member resets SOONER and holds more: today it wins both keys
    const d3 = (mod) => mod.decidePoolSwitch({ currentId: 'a', members: mem3, readCache: viewM(c3), nowSec: NOW, explain: true, hot: true, creditsIds: ['c'], ...PAY });
    const r3 = (mod) => mod.rankPoolMembers({ members: mem3.slice(1), readCache: viewM(c3), nowSec: NOW, creditsIds: ['c'], ...PAY }).map((r) => r.id).join();
    const s3 = (mod) => mod.soonestUsableMember({ members: mem3.slice(1), readCache: viewM(c3), nowSec: NOW, creditsIds: ['c'], ...PAY });
    const sOf = (x) => (x && typeof x === 'object' ? x.id : x);
    ck('r4696 M3 decidePoolSwitch: the last resort is the CREDITS member with prepaid quota, not the paying one', d3(P).to === 'c');
    ck('r4696 M3 rankPoolMembers (the device reflex walk): the credits member before the paying one', r3(P) === 'c,o');
    ck('r4696 M3 soonestUsableMember (a removed or lapsed default\'s fallback): the credits member before the paying one', sOf(s3(P)) === 'c');
    const red3a = M.load('src/account-pool-auto.js', anchored(src, '      payingRanked.push({', '      creditsRanked.push({', 'M3 red: the decision fold'), 'm3-red-a');
    const red3b = M.load('src/account-pool-auto.js', anchored(src, 'payLast.push({ ...row, paying: true })', 'last.push({ ...row, paying: true })', 'M3 red: the rank fold'), 'm3-red-b');   // stale-pins: kept (the RED's text IS 4f3305b49's line)
    const red3c = M.load('src/account-pool-auto.js', anchored(src, 'tier: isCredits ? 1 : (paying && paying.has(m.id)) ? 2 : 0,', 'tier: isCredits || (paying && paying.has(m.id)) ? 1 : 0,', 'M3 red: the fallback fold'), 'm3-red-c');
    ck('r4696 M3 RED (the paying rows folded into the credits tier) decidePoolSwitch: the paying member wins the last resort', d3(red3a).to === 'o');
    ck('r4696 M3 RED (the fold) rankPoolMembers: the paying member walks first', r3(red3b) === 'o,c');
    ck('r4696 M3 RED (the fold) soonestUsableMember: the paying member is the fallback', sOf(s3(red3c)) === 'o'); }
}
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: rel ? 9 : 8, label: 'overage-last: ' })) ck(r.name, r.pass);   // the release copy counts only where it was made
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// B-d74f (主开发 r5331): THE WALKS' AND THE HOLD's PINS over EVERY kind of member in EVERY state, «the space first, then the code».
// src/account-pool-auto.js names a member in three places a person meets: the pool DEFAULT's fallback (soonestUsableMember, the engine's
// fallbackDefaultTarget form), the DEVICE LIST's head (rankPoolMembers, the engine's sealed orders and its auth-failure walk) and the
// REMOVED decision (decidePoolSwitch with the current member no longer listed: its move, or its hold's parking member). Every pool of
// this space asks each of them of this tree, of the UNIT's BASE (a92ccc273) and of the release (eb7608d5, 2.369.419), read by git show.
// Three pins hold over the WHOLE space, each an exact count of 0 against the base (主开发 r5342: B-d74f's own roads):
//   THE MONEY PIN     no road names a member that bills (a credits member past its quota, a paying member that takes a turn) or whose
//                     bill cannot be known (a credits or paying member whose reading is held or started again), where the base names
//                     one that bills nothing;
//   THE PROVIDER PIN  no road names a member of ANOTHER provider where the base names one of the conversation's own;
//   THE NOBODY PIN    no road names nobody where the base names somebody.
// Against the release the count is printed beside and PINNED BY KIND: row B-87fd item (1)'s taken paying tier, by name.
// THE SPACE: the current member (the one removed: ordinary, credits or paying; can serve or spent) and up to three others of the same
// provider, or up to two and one of ANOTHER provider (under the pool's «allow» and «never»); each other member ordinary, credits or
// paying, in one of ten states: can serve, spent, its sign-in near its end, its sign-in dead (not lapsed), held on another account's
// instant, held unread, the stub (its file started again, not enumerated), a spent reading over the stub, no reading, and excluded (it
// just refused this conversation). A paying member makes the pool's paying set; with none the set is null (nobody pays). Every account
// is made up; nothing is spawned or read from a real folder; pure calls only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';   // FIRST of the lib imports (B-ba47): the suite runs on a temp home of its own
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
// r5535, A LEG NEVER RESTS ON A COMMIT THE CLONE MAY NOT HOLD: a leg that needs a reference this clone does not hold (the hosted runner's
// depth-1 checkout) is a NAMED, COUNTED skip — said where it is skipped and in the closing line — never a leg that reads empty and judges 0
let skipped = 0; const skip = (n, why) => { skipped += n; console.log(`  · SKIP ${n}: ${why} — COUNTED, not passed`); };
const ck = (n, c) => { if (typeof c !== 'boolean') throw new TypeError(`ck() was handed a ${typeof c} as its condition: ${n}`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const SRC = 'src/account-pool-auto.js';
const P = require(path.join(REPO, SRC));
const M = mutantCopies('pool-walk-pins', REPO);
void anchored;
const T0 = performance.now();

/** THE RELEASE's OWN MODULE (test-pool-auto's preFixCopy): `git show <ref>:<file>` where the ref is in this clone; a SHALLOW clone
 *  answers 'shallow' and the caller SKIPS with evidence; an absent ref on a FULL clone is a failure by name. */
async function preFixCopy(ref, rel, tag) {
  const { execFileSync } = await import('node:child_process');
  const { gitEnvFrom } = await import('./git-env.mjs');
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', cwd: REPO, env: gitEnvFrom(process.env), stdio: ['ignore', 'pipe', 'ignore'] });
  let has = false; try { git(['cat-file', '-e', `${ref}^{commit}`]); has = true; } catch { has = false; }
  if (has) { try { return { mod: M.load(rel, git(['show', `${ref}:${rel}`]), tag), why: null }; } catch (e) { return { mod: null, why: `git show ${ref}:${rel} failed: ${String(e && e.message).slice(0, 120)}` }; } }
  let shallow = false; try { shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true'; } catch { shallow = false; }
  return { mod: null, why: shallow ? 'shallow' : `the ref ${ref} is not in this clone, which is NOT shallow` };
}

// ── THE STATES ──
const NOW = 1800000000, D = 86400, FLOOR = 15;
const STUB = { startedAgain: { at: (NOW - 600) * 1000, setAside: 'm.json.unreadable', enumerated: false, overage: false, spendControl: false, resetCredits: false } };
const raw = (spent, days) => ({ fiveHour: { utilization: 0, resetsAt: NOW + 1800 }, sevenDay: { utilization: spent ? 0.99 : 0.4, resetsAt: NOW + days * D }, scopedWeekly: [] });
const readingOf = (q, days) => (q === 'noread' ? null : q === 'heldsi' ? { held: 'same-instant' } : q === 'heldun' ? { held: 'unread' } : q === 'stub' ? STUB
  : q === 'restart' ? { ...raw(true, days), startedAgain: STUB.startedAgain } : raw(q === 'spent', days));
const LIVE_LOGIN = { state: 'ok', msLeft: 40 * 86400e3 };
const NEAR_LOGIN = { state: 'expiring', msLeft: 10 * 60e3 };   // inside the near window: never a voluntary target, a scrap at most
const DEAD_LOGIN = { state: 'logged-out', msLeft: -1 };        // cannot serve, not lapsed
const PV_OWN = { id: 'pv-anthropic-subscription', kind: 'anthropic-subscription', label: 'Anthropic subscription' };
const PV_OTHER = { id: 'pv-other', kind: 'openai-chat', label: 'Other', models: [{ id: 'other-reasoner' }], aliases: { opus: 'other-reasoner' } };
const QS = ['live', 'spent', 'near', 'dead', 'heldsi', 'heldun', 'stub', 'restart', 'noread', 'excluded'];
const KINDS = ['o', 'c', 'p'];
const OWN = KINDS.flatMap((k) => QS.map((q) => ({ g: 'own', k, q }))), OTHER = KINDS.flatMap((k) => QS.map((q) => ({ g: 'other', k, q })));
const CUR = KINDS.flatMap((k) => ['live', 'spent'].map((q) => ({ g: 'own', k, q })));
const fmt = (s) => (s ? `${s.g === 'other' ? 'other-provider ' : ''}${{ o: 'ordinary', c: 'credits', p: 'paying' }[s.k]}-${s.q}` : 'nobody');
// WHAT A NAMED MEMBER COSTS — THE SUITE's OWN MODEL, an independent oracle (the product exports no billing predicate): checked below,
// state by state, against the cure's own cost field (soonestUsableMember's row `costs`, read from a copy that hands its rows back).
// An ordinary member bills nothing; a credits member bills past its quota; a paying member bills every turn it
// takes; a sign-in that cannot serve takes no turn; a credits or paying member whose reading is held or started again (the decision's own
// held predicates) cannot be known; no reading is what the decision takes it for (a credits member not past its quota: its dead test
// needs a reading; a paying member still bills each turn)
const costOf = (s) => {
  if (!s) return 'nobody';
  if (s.k === 'o' || s.q === 'dead') return 'free';
  if (['heldsi', 'heldun', 'stub', 'restart'].includes(s.q)) return 'unknown';
  if (s.k === 'c') return s.q === 'spent' ? 'bills' : 'free';
  return 'bills';
};
const costly = (s) => ['bills', 'unknown'].includes(costOf(s));

function poolOf(cur, others, xMode) {
  const all = [cur, ...others], ids = all.map((_, i) => 'm' + i);
  const st = new Map(ids.map((id, i) => [id, all[i]]));
  const reads = new Map(ids.map((id, i) => [id, readingOf(all[i].q, 1 + i)]));
  const login = (id) => { const q = st.get(id).q; return q === 'near' ? NEAR_LOGIN : q === 'dead' ? DEAD_LOGIN : LIVE_LOGIN; };
  const credits = ids.filter((id) => st.get(id).k === 'c'), paying = ids.filter((id) => st.get(id).k === 'p'), exclude = ids.filter((id) => st.get(id).q === 'excluded');
  return { st, ids, others: ids.slice(1).map((id) => ({ id, name: id })), readCache: (id) => reads.get(id) ?? null, readLogin: login,
    creditsIds: credits.length ? credits : null, payingIds: paying.length ? paying : null, exclude: exclude.length ? exclude : null,
    providerOf: (id) => (st.get(id).g === 'other' ? PV_OTHER : PV_OWN), crossProvider: xMode };
}
// the three roads, asked as the engine asks them
const removedOf = (mod, sp) => mod.decidePoolSwitch({ currentId: 'm0', members: sp.others, membership: sp.others.map((m) => m.id), readCache: sp.readCache, nowSec: NOW, hot: true, proactive: true, readLogin: sp.readLogin, reserveFloorPct: FLOOR, creditsIds: sp.creditsIds, payingIds: sp.payingIds, exclude: sp.exclude, providerOf: sp.providerOf, conversationModel: 'opus', crossProvider: sp.crossProvider, explain: true });
const landing = (d) => (d ? d.to || (d.reason === 'removed-hold' ? d.holdTo || null : null) : null);
const fallbackOf = (mod, sp) => { const x = mod.soonestUsableMember({ members: sp.others, readCache: sp.readCache, nowSec: NOW, readLogin: sp.readLogin, creditsIds: sp.creditsIds, payingIds: sp.payingIds, providerOf: sp.providerOf, fromProvider: PV_OWN }); return x && typeof x === 'object' ? x.id : x || null; };
const listHead = (mod, sp) => { const l = mod.rankPoolMembers({ members: sp.others, readCache: sp.readCache, nowSec: NOW, readLogin: sp.readLogin, creditsIds: sp.creditsIds, payingIds: sp.payingIds, providerOf: sp.providerOf, fromProvider: PV_OWN }); return (l && l[0] && l[0].id) || null; };
// the decision's own refusals as THIS leg models them — compared below with the decision's own fields (the round's should)
const heldQ = (q) => ['heldsi', 'heldun', 'stub', 'restart'].includes(q);
const modelBlocked = (sp) => sp.others.filter((m) => { const s = sp.st.get(m.id); return !heldQ(s.q) && s.q !== 'excluded' && (s.q === 'dead' || (s.g === 'other' && s.q === 'near')); }).map((m) => m.id).sort();
const modelExcluded = (sp) => sp.others.filter((m) => { const s = sp.st.get(m.id); return s.q === 'excluded'; }).length;
// …and the WHOLE set the hold hands the walk (r5441): held, excluded, sign-in blocked, and the guard's spent credits / paying rows beside a billing current
const modelRefused = (sp) => { const billing = sp.st.get('m0').k !== 'o';
  return sp.others.filter((m) => { const s = sp.st.get(m.id); return heldQ(s.q) || s.q === 'excluded' || s.q === 'dead' || (s.g === 'other' && s.q === 'near') || (billing && s.g === 'own' && s.k !== 'o' && s.q === 'spent'); }).map((m) => m.id).sort(); };
const HOLDS_PIN = 82892;   // the holds the space reaches (measured at r5331's cure, both zones alike)

function* scenes() {
  const sets = [];
  for (let a = 0; a < OWN.length; a++) { sets.push([OWN[a]]); for (let b = a; b < OWN.length; b++) { sets.push([OWN[a], OWN[b]]); for (let c = b; c < OWN.length; c++) sets.push([OWN[a], OWN[b], OWN[c]]); } }
  const small = [[]]; for (let a = 0; a < OWN.length; a++) { small.push([OWN[a]]); for (let b = a; b < OWN.length; b++) small.push([OWN[a], OWN[b]]); }
  const dead = (o) => o.some((s) => s.q === 'dead');
  for (const s of [[], ...sets]) yield { others: s, modes: ['allow'], dead: dead(s), cross: false };   // one provider: «allow» and «never» answer alike (asked once)
  for (const s of small) for (const x of OTHER) yield { others: [...s, x], modes: ['allow', 'never'], dead: dead([...s, x]), cross: true };
}

// THE TWO REFERENCES: the release (eb7608d5, 2.369.419) and the unit's own base (a92ccc273 — B-87fd item (1)'s paying tier in it).
// The pins are EXACT against the base: B-d74f's own roads. Against the release they are printed beside, road by road: what is there and
// not against the base is B-87fd item (1)'s taken paying tier (its device list's last tier, its removed decision's last-resort paying move)
// (the pins and the REDs are a COUNTED skip on a SHALLOW clone — the hosted runner's depth-1 checkout — said where skipped and in the
// closing line (r5535); the green that counts is a full-clone run, the test machine's kit)
// (主开发 r5527: a suite reads only commits its tree's own history holds — each reference below is the TRAIN's pick that holds the very
// bytes of src/account-pool-auto.js the round read, blob for blob: a92ccc273 = a217f54fb, f1043de8e = 6614bfd9f, 3a6814e85 = 979ae3d05,
// fd4356ca6 = 8f33fcabd; every pin below was measured on these bytes)
const pre = await preFixCopy('eb7608d5', SRC, 'release'), preB = await preFixCopy('a217f54fb', SRC, 'unit-base'), preF = await preFixCopy('6614bfd9f', SRC, 'pre-cure');
const rel = pre.mod, base = preB.mod, F = preF.mod;
const preL = await preFixCopy('979ae3d05', SRC, 'lined'), LINED = preL.mod;   // r5441: the form the round took — what this follow changes, pinned by kind
const CHG = new Map(); const chg = (road, sp, a, b) => { if (a === b) return; const A = a ? sp.st.get(a) : null, B = b ? sp.st.get(b) : null; const k = `${road} · ${fmt(A)} where the lined form named ${fmt(B)}`; CHG.set(k, (CHG.get(k) || 0) + 1); };
if ((!base && preB.why === 'shallow') || (!rel && pre.why === 'shallow')) skip(14, 'the pins against the unit\'s base and the release, the follow\'s and the cure\'s REDs, and the cost oracle beside them — the references (eb7608d5 and the train\'s picks) are not in this clone (a depth-1 checkout)');
else if (!base || !rel || !F) ck(`the three references loaded (eb7608d5, a92ccc273, f1043de8e)${[pre, preB, preF].map((x) => x.why).filter(Boolean).map((w) => ` — ${w}`).join('')}`, false);
else {
  { const ROWS = M.load(SRC, anchored(fs.readFileSync(path.join(REPO, SRC), 'utf8'), '  if (rows.length && rows[0].signDead) {\n', '  if (arguments[0] && arguments[0].__rows) return rows;\n  if (rows.length && rows[0].signDead) {\n', 'the cost field\'s copy'), 'rows');
    let asked = 0, apart = [], noRow = 0;
    for (const s of OWN) { const sp = poolOf(CUR[0], [s], 'never'); const rows = ROWS.soonestUsableMember({ members: sp.others, readCache: sp.readCache, nowSec: NOW, readLogin: sp.readLogin, creditsIds: sp.creditsIds, payingIds: sp.payingIds, __rows: true });
      if (!rows.length) { noRow++; continue; } asked++; if (rows[0].costs !== costly(s)) apart.push(fmt(s)); }
    ck(`the money pin's «bills» is the suite's OWN model, an independent oracle: it meets the cure's own cost field on every state a walk keeps (${asked} states; ${noRow} held states the walk drops; ${apart.length} apart)`, asked > 0 && apart.length === 0);
    for (const a of apart) console.log('    apart: ' + a); }
  ck('the three references loaded: the release (eb7608d5, 2.369.419), the unit\'s base (a92ccc273) and the commit this cure cures (f1043de8e)', [rel, base, F].every((m) => typeof m.decidePoolSwitch === 'function' && typeof m.soonestUsableMember === 'function'));
  const mk = () => ({ money: new Map(), provider: new Map(), nobody: new Map() });
  const REL_KIND = new Map();   // the release side, by road · how the tip names · what it names (B-87fd item (1)'s roads, pinned below)
  const PIN = mk(), PINR = mk();   // against the base (exact), against the release (printed)
  const total = (pin, X = PIN) => [...X[pin].values()].reduce((a, g) => a + g.n, 0);
  let PX = PIN;
  const note = (pin, road, cat, sh) => { const k = `${road} · ${cat}`; const m = PX[pin]; if (!m.has(k)) m.set(k, { n: 0, ex: [] }); const g = m.get(k); g.n++; if (g.ex.length < 3) g.ex.push(sh); };
  const judge = (road, sp, tipId, refId, sh) => {
    const A = tipId ? sp.st.get(tipId) : null, B = refId ? sp.st.get(refId) : null;
    if (costly(A) && (!B || costOf(B) === 'free')) note('money', road, `${costOf(A)}: ${fmt(A)} where it named ${fmt(B)}`, sh);
    if (A && A.g === 'other' && B && B.g === 'own') note('provider', road, `${fmt(A)} where it named ${fmt(B)}`, sh);
    if (!A && B) note('nobody', road, `nobody where it named ${fmt(B)}`, sh);
  };
  // the release side, by kind: an answer that is red against the release (any of the three pins) counted once, by road · how · what
  const relRed = (sp, aId, relId) => { const A = aId ? sp.st.get(aId) : null, B = relId ? sp.st.get(relId) : null; return (costly(A) && (!B || costOf(B) === 'free')) || (!!A && A.g === 'other' && !!B && B.g === 'own') || (!A && !!B); };
  const relKey = (map, road, sp, aId, relId, how) => { if (!relRed(sp, aId, relId)) return; const A = aId ? sp.st.get(aId) : null, B = relId ? sp.st.get(relId) : null; const k = `${road} · ${how} ${fmt(A)} where the release named ${B ? (B.k === 'o' ? 'an ordinary member' : fmt(B)) : 'nobody'}`; map.set(k, (map.get(k) || 0) + 1); };
  const REL_KIND_B = new Map();   // (the round's should) the SAME tally for the BASE against the release: «all of them are the base's», measured
  let tipOnly = 0; const tipOnlyEx = [];
  const both = (road, sp, tipId, baseId, relId, sh, how = 'names', howB = how) => { PX = PIN; judge(road, sp, tipId, baseId, sh); PX = PINR; judge(road, sp, tipId, relId, sh); PX = PIN; relKey(REL_KIND, road, sp, tipId, relId, how); relKey(REL_KIND_B, road, sp, baseId, relId, howB);
    if (relRed(sp, tipId, relId) && !relRed(sp, baseId, relId)) { tipOnly++; if (tipOnlyEx.length < 3) tipOnlyEx.push(`${road}: ${sh}`); } };
  // THE REDs on f1043de8e's own code (the commit the round read), each with its witness
  let rA = 0, rAw = 0, rB = 0, rBw = 0;
  const ownRefused = (sp) => { const cur = sp.st.get('m0'), billing = cur.k !== 'o';   // the leg's model: held, excluded, sign-in blocked, the guard's spent tier rows
    return sp.others.filter((m) => sp.st.get(m.id).g === 'own').every((m) => { const s = sp.st.get(m.id); return heldQ(s.q) || s.q === 'excluded' || s.q === 'dead' || (billing && s.k !== 'o' && ['spent', 'restart'].includes(s.q)); }); };
  let pools = 0, walks = 0, holds = 0, wit = 0, witBad = 0, lawS = 0, rS = 0, rSw = 0; const witEx = [];
  for (const sc of scenes()) {
    let walked = false;
    for (const xMode of sc.modes) for (const cur of CUR) {
      const sp = poolOf(cur, sc.others, xMode); pools++;
      const sh = `${fmt(cur)} removed | ${sc.others.map(fmt).join(', ') || '(none)'} | ${xMode}`;
      if (!walked) {   // the fallback and the device list hold no current member and read no «allow»: once a set
        walked = true; walks++;
        const shw = sh.replace(/^[^|]*\| /, ''), fm = fallbackOf(P, sp), fb = fallbackOf(base, sp);
        const fl = LINED ? fallbackOf(LINED, sp) : null; if (LINED) chg('the default\'s fallback', sp, fm, fl);
        // the leg's own model: a member of the conversation's provider that bills nothing and can serve now (live, near its sign-in's end, excluded —
        // the fallback reads no exclusion —, no reading) or will heal by itself (a walled ordinary member); never one that cannot sign in or be read
        const freeHere = sp.others.some((m) => { const s = sp.st.get(m.id); return s.g === 'own' && costOf(s) === 'free' && ['live', 'near', 'excluded', 'noread', 'spent'].includes(s.q); });
        if (fm && sp.readLogin(fm) === DEAD_LOGIN && freeHere) lawS++;
        if (fl && sp.readLogin(fl) === DEAD_LOGIN && freeHere) { rS++; if (sp.st.get(fl).q === 'dead') rSw++; }
        both('the default\'s fallback', sp, fm, fb, fallbackOf(rel, sp), shw);
        both('the device list\'s head', sp, listHead(P, sp), listHead(base, sp), listHead(rel, sp), shw);
        const f6 = fallbackOf(F, sp), A6 = f6 && sp.st.get(f6), B6 = fb && sp.st.get(fb);
        // MUST B's shape: the base parked on a member that bills nothing and cannot be read or cannot sign in; f1043de8e parks on a bill.
        // Witness (law 1): the same pool with THAT member read sound and signed in — f1043de8e then parks on it (its demotion did it)
        if (costly(A6) && B6 && costOf(B6) === 'free' && (sp.readCache(fb) === STUB || sp.readLogin(fb) === DEAD_LOGIN)) { rB++;
          const k = Number(fb.slice(1)) - 1, sound = sc.others.map((s, i) => (i === k ? { ...s, q: 'live' } : s));
          if (fallbackOf(F, poolOf(cur, sound, xMode)) === fb) rBw++; }
      }
      const dm = removedOf(P, sp), db = removedOf(base, sp);
      if (LINED && sc.dead && dm && dm.reason === 'removed-hold') chg('the removed decision', sp, landing(dm), landing(removedOf(LINED, sp)));   // the follow's branch needs a member that cannot sign in (its head)   // the follow moves only a walk's head: asked where this tree holds
      both('the removed decision', sp, landing(dm), landing(db), landing(removedOf(rel, sp)), sh, dm && dm.to ? 'moves onto' : 'parks on', db && db.to ? 'moves onto' : 'parks on');
      if (sc.cross && xMode === 'allow' && db && db.reason === 'removed-hold') {   // f1043de8e moved the hold alone (the round's M4): asked where the base held beside another provider allowed — MUST A's own shape
        const d6 = removedOf(F, sp), a6 = landing(d6), b6 = landing(db);
        if (a6 && sp.st.get(a6).g === 'other' && b6 && sp.st.get(b6).g === 'own') { rA++; if (ownRefused(sp) && d6.reason === 'removed-hold') rAw++; }
      }
      if (dm && dm.reason === 'removed-hold') {
        holds++;
        // THE LEG's MODEL against the decision's own fields (the round's should): the sign-in blocks it names, the exclusions it counted
        const got = (dm.loginBlocked || []).map((x) => x.id).sort(), want = modelBlocked(sp);
        wit++; if (JSON.stringify(got) !== JSON.stringify(want) || (dm.excluded || 0) !== modelExcluded(sp) || JSON.stringify(dm.refusedIds || []) !== JSON.stringify(modelRefused(sp))) { witBad++; if (witEx.length < 3) witEx.push(`${sh}: loginBlocked ${got.join(',') || '-'} / model ${want.join(',') || '-'}; excluded ${dm.excluded || 0} / model ${modelExcluded(sp)}; refused ${(dm.refusedIds || []).join(',') || '-'} / model ${modelRefused(sp).join(',') || '-'}`); }
      }
    }
  }
  const byRoad = (X) => { const o = {}; for (const pin of ['money', 'provider', 'nobody']) for (const [k, g] of X[pin]) { const kk = `${k.split(' · ')[0]} · ${pin}`; o[kk] = (o[kk] || 0) + g.n; } return Object.entries(o).map(([k, n]) => `${k} ${n}`).join('; ') || 'none'; };
  // r5441 (THE FOLLOW): a member that cannot sign in is never where a default is parked while a member of its group that bills nothing can
  // serve or will heal by itself (a walled ordinary member). What it changes against the form the round took (3a6814e85), pinned by kind;
  // beside members that bill only it stays where the base parked, so the money pin holds by construction. The literal form (the member
  // that cannot sign in after a member that bills too) was measured first: 759 new bills against the base (run 5c95b37ca-20261127172541-box)
  const CHG_PIN = { 'the default\'s fallback · ordinary-spent where the lined form named ordinary-dead': 53, 'the default\'s fallback · ordinary-spent where the lined form named paying-dead': 50, 'the default\'s fallback · ordinary-spent where the lined form named credits-dead': 8 };
  const chgApart = [...new Set([...Object.keys(CHG_PIN), ...CHG.keys()])].filter((k) => (CHG_PIN[k] || 0) !== (CHG.get(k) || 0));
  if (LINED) { console.log(`  · the follow (r5441) against the form the round took (3a6814e85): ${[...CHG.values()].reduce((s, n) => s + n, 0)} answers`); for (const [k, n] of [...CHG].sort((x, y) => y[1] - x[1])) console.log(`      ${n} × ${k}`); }
  ck(`r5441 the follow: what it changes against the form the round took, pinned by kind — every one off a member that cannot sign in onto a walled ordinary member, the removed decision's holds untouched (${[...CHG.values()].reduce((s, n) => s + n, 0)}; ${chgApart.length} apart)`, !!LINED && chgApart.length === 0);
  for (const k of chgApart) console.log(`    apart: ${k} — pinned ${CHG_PIN[k] || 0}, measured ${CHG.get(k) || 0}`);
  ck(`r5441 RED (3a6814e85): its fallback parks the default on a member that cannot sign in where a member that bills nothing serves or heals (${rS}; witness: that member's sign-in is the dead one, ${rSw})`, rS > 0 && rSw === rS);
  ck(`r5441 THE LAW over the space: the fallback never names a member that cannot sign in while a member of its group that bills nothing can serve or will heal (${lawS})`, lawS === 0);
  console.log(`  · the space: ${pools} pools (${walks} sets of others asked of the two walks; the removed decision held ${holds} of them) in ${Math.round(performance.now() - T0)} ms`);
  for (const pin of ['money', 'provider', 'nobody']) for (const [k, g] of [...PIN[pin]].sort((x, y) => y[1].n - x[1].n).slice(0, 12)) { console.log(`      [${pin}] ${g.n} × ${k}`); for (const e of g.ex) console.log('          ' + e); }
  ck(`THE MONEY PIN, exact against the unit's base: no road names a member that bills, or whose bill cannot be known, where the base names one that bills nothing (${total('money')})`, total('money') === 0);
  ck(`THE PROVIDER PIN, exact against the unit's base: no road names a member of another provider where the base names one of the conversation's own (${total('provider')})`, total('provider') === 0);
  ck(`THE NOBODY PIN, exact against the unit's base: no road names nobody where the base names somebody (${total('nobody')})`, total('nobody') === 0);
  console.log(`  · against the RELEASE (eb7608d5, 2.369.419), said beside: money ${total('money', PINR)} · provider ${total('provider', PINR)} · nobody ${total('nobody', PINR)} — by road: ${byRoad(PINR)}`);
  for (const pin of ['money', 'provider', 'nobody']) for (const [k, g] of [...PINR[pin]].sort((x, y) => y[1].n - x[1].n).slice(0, 6)) console.log(`      [release ${pin}] ${g.n} × ${k} — e.g. ${g.ex[0]}`);
  // THE RELEASE SIDE, PINNED BY KIND (主开发 r5342): row B-87fd item (1)'s taken tier at work — the owner's word for it: a member that
  // bills is ranked last, and so is still the last resort when nothing else can serve. Not open, not hidden: each kind an exact count,
  // so a later change that makes that last resort wider or narrower is red by name. Measured at B-d74f's cure, both zones alike (run
  // 573add919-20261127005314-both). Three roads: (a) the device list's head on a paying member past its quota where the release named
  // nobody; (b) the removed decision MOVING onto a paying member past its quota as the last resort; (c) rule 3's order (a member billing
  // past its quota, or whose bill cannot be known, before a walled ordinary member; credits before paying) in the hold's park and the
  // default's fallback, where the release keyed the credits flag
  const REL_PIN = {
    'the device list\'s head · names paying-spent where the release named nobody': 861,
    'the removed decision · moves onto paying-spent where the release named an ordinary member': 1604,
    'the removed decision · moves onto paying-spent where the release named paying-dead': 288,
    'the removed decision · moves onto paying-spent where the release named other-provider credits-live': 84,
    'the removed decision · moves onto paying-spent where the release named other-provider credits-noread': 84,
    'the removed decision · parks on credits-stub where the release named paying-dead': 418,
    'the removed decision · parks on paying-restart where the release named an ordinary member': 378,
    'the removed decision · parks on paying-spent where the release named an ordinary member': 128,
    'the removed decision · parks on credits-stub where the release named an ordinary member': 44,
    'the removed decision · parks on credits-restart where the release named an ordinary member': 44,
    'the removed decision · parks on credits-spent where the release named an ordinary member': 16,
    'the default\'s fallback · names paying-spent where the release named an ordinary member': 81,
    'the default\'s fallback · names paying-restart where the release named an ordinary member': 79,
    'the default\'s fallback · names credits-spent where the release named an ordinary member': 4,
    'the default\'s fallback · names credits-stub where the release named an ordinary member': 4,
    'the default\'s fallback · names credits-restart where the release named an ordinary member': 4,
  };
  const relApart = [...new Set([...Object.keys(REL_PIN), ...REL_KIND.keys()])].filter((k) => (REL_PIN[k] || 0) !== (REL_KIND.get(k) || 0));
  const road = (re) => [...REL_KIND].filter(([k]) => re.test(k)).reduce((s, [, n]) => s + n, 0);
  console.log(`  · the release side by road: (a) the device list's head ${road(/^the device list/)} · (b) the removed decision's last-resort paying move ${road(/^the removed decision · moves onto paying-spent/)} · (c) rule 3's order in the hold's park ${road(/^the removed decision · parks on/)} and in the fallback ${road(/^the default/)}`);
  for (const [k, n] of [...REL_KIND].sort((x, y) => y[1] - x[1])) console.log(`      ${n} × ${k}`);
  ck(`the release side, pinned by kind (B-87fd item (1)'s taken tier, r5342): every kind's count exact (${REL_KIND.size} kinds, ${[...REL_KIND.values()].reduce((s, n) => s + n, 0)} answers; ${relApart.length} apart)`, relApart.length === 0);
  for (const k of relApart) console.log(`    apart: ${k} — pinned ${REL_PIN[k] || 0}, measured ${REL_KIND.get(k) || 0}`);
  // (the round's should) the release side is the BASE's, MEASURED, pool by pool: wherever this tree's answer is red against the release,
  // the base's answer there is red against it too. The base's own tally is printed beside: it is LARGER — this unit parks on a member
  // that bills nothing where the base parked on one that bills (the refused shelf, r5331), never the other way
  ck(`the release side is the BASE's, measured pool by pool: wherever this tree's answer is red against the release (eb7608d5, 2.369.419), the base's is too (${tipOnly} where it is not)`, tipOnly === 0);
  for (const e of tipOnlyEx) console.log('    this tree alone: ' + e);
  const baseApart = [...new Set([...REL_KIND.keys(), ...REL_KIND_B.keys()])].filter((k) => (REL_KIND.get(k) || 0) !== (REL_KIND_B.get(k) || 0));
  const BASE_PIN = { kinds: 17, answers: 4795, more: 7 };   // the base's own release side, measured at the follow (r5441): 17 kinds, 4795 answers, 7 kinds larger than this tree's
  console.log(`  · the BASE's own release side: ${REL_KIND_B.size} kinds, ${[...REL_KIND_B.values()].reduce((s, n) => s + n, 0)} answers; ${baseApart.length} kinds differ from this tree's, this tree's fewer in every one:`);
  for (const k of baseApart) console.log(`      ${k} — this tree ${REL_KIND.get(k) || 0}, the base ${REL_KIND_B.get(k) || 0}`);
  ck(`the base's own release side, pinned (${REL_KIND_B.size} kinds, ${[...REL_KIND_B.values()].reduce((s, n) => s + n, 0)} answers; ${baseApart.length} kinds where this tree has fewer, none where it has more)`, REL_KIND_B.size === BASE_PIN.kinds && [...REL_KIND_B.values()].reduce((s, n) => s + n, 0) === BASE_PIN.answers && baseApart.length === BASE_PIN.more && baseApart.every((k) => (REL_KIND.get(k) || 0) < (REL_KIND_B.get(k) || 0)));
  ck(`the leg's model of the decision's refusals meets the decision's own fields on every hold — the sign-in blocks it names, the exclusions it counts and the WHOLE set it hands the walk (held, excluded, blocked, the guard's) — and the holds are the pinned count (${wit} holds, pinned ${HOLDS_PIN}; ${witBad} apart)`, wit === HOLDS_PIN && witBad === 0);
  for (const e of witEx) console.log('    apart: ' + e);
  ck(`MUST A RED (f1043de8e): its hold leaves the conversation's provider where the base parked on its own (${rA}; witness: every own-provider candidate is one the decision refused, ${rAw})`, rA > 0 && rAw === rA);
  ck(`MUST B RED (f1043de8e): its fallback parks the default on a member that bills, or whose bill cannot be known, where the base parked on one that bills nothing (${rB} where the base's member cannot be read or cannot sign in; witness: that member read sound and signed in, f1043de8e parks on it, ${rBw})`, rB > 0 && rBw === rB);
}
// ── r5279's SHAPES SPACE (its pinned kinds and its three REDs on fd4356ca6), the space the pins above grew out of ──
const LAPSED_LOGIN = { state: 'ok', msLeft: 40 * 86400e3, serve: { state: 'lapsed', since: (NOW - 3600) * 1000 } };
const rawOf = (s, days) => raw(s.q === 'spent', days);   // the tier-invariants' reading for 'live' / 'spent' / 'lapsed' (5h 0 %, 7d 40 % or 99 %)
// ── THE SHAPES SPACE (主开发 r5279: «a walk never goes where the decision refuses, and never where it cannot know») ─────────────────
// (Moved here from test-pool-tier-invariants at r5331's cure: that suite's main space gives every member a full reading and never asks
// the removed-member hold.) Here, for a credits member and an ordinary
// one: no reading; a held reading of each kind (another account's instant, unread); a file started again (the stub, and a spent reading
// over it — neither enumerated); a sign-in that cannot serve and has not lapsed; beside them a member this conversation just refused
// (excluded), and another provider allowed with a live member, or one near its sign-in's end, in the other group. Asked, this tree
// against the release (eb7608d5, 2.369.419): the default's fallback (the engine's fallbackDefaultTarget form: no other provider, no
// exclusion), the removed-member hold (decidePoolSwitch, the current member no longer listed — the walk's FOURTH caller), the device list.
// The removed-member hold is handed what its decision refused (r5279 MUST 2) and parks there only when the decision refused EVERY
// listed candidate (the release's own park: the kept park among refused, counted); dropping them was measured first and left the
// conversation on its removed member, billing beside a credits member past its quota — so the money pin counts a hold that names
// nobody on a billing member too. Every difference from the release is a named kind with its pinned count (I6 over the shapes)
const SH_NEW = ['noread', 'heldsi', 'heldun', 'stub', 'restart', 'dead'];
const SH_STATES = [{ kind: 'o', q: 'live' }, { kind: 'o', q: 'spent' }, { kind: 'c', q: 'live' }, { kind: 'c', q: 'spent' }, { kind: 'o', q: 'lapsed' }, ...['o', 'c'].flatMap((kind) => SH_NEW.map((q) => ({ kind, q })))];
const SH_CUR = [{ kind: 'o', q: 'live' }, { kind: 'o', q: 'spent' }, { kind: 'c', q: 'live' }, { kind: 'c', q: 'spent' }];
const shRead = (s, days) => (s.q === 'noread' ? null : s.q === 'heldsi' ? { held: 'same-instant' } : s.q === 'heldun' ? { held: 'unread' } : s.q === 'stub' ? STUB
  : s.q === 'restart' ? { ...rawOf({ kind: s.kind, q: 'spent' }, days), startedAgain: STUB.startedAgain } : s.q === 'dead' ? rawOf({ kind: s.kind, q: 'live' }, days) : rawOf(s, days));
const shFmt = (s) => `${{ o: 'ordinary', c: 'credits' }[s.kind]}-${s.q}`;
function shapePool(cur, others, { exclude = null, other = null } = {}) {
  const all = [cur, ...others], ids = all.map((_, i) => 'm' + i).concat(other ? ['mx'] : []);
  const st = new Map(ids.map((id, i) => [id, i < all.length ? all[i] : { kind: 'o', q: other === 'near' ? 'near' : 'live', other: true }]));
  const reads = new Map(ids.map((id, i) => [id, i < all.length ? shRead(all[i], 1 + i) : rawOf({ kind: 'o', q: 'live' }, 2)]));
  const login = (id) => { const s = st.get(id); return s.q === 'near' ? NEAR_LOGIN : s.q === 'lapsed' ? LAPSED_LOGIN : s.q === 'dead' ? DEAD_LOGIN : LIVE_LOGIN; };
  const credits = ids.filter((id) => st.get(id).kind === 'c');
  return { st, ids, others: ids.slice(1).map((id) => ({ id, name: id })), readCache: (id) => reads.get(id) ?? null, readLogin: login, creditsIds: credits.length ? credits : null,
    providerOf: other ? (id) => (id === 'mx' ? PV_OTHER : PV_OWN) : null, crossProvider: other ? 'allow' : 'never', exclude };
}
const shFallback = (mod, sp) => { const x = mod.soonestUsableMember({ members: sp.others.filter((m) => m.id !== 'mx'), readCache: sp.readCache, nowSec: NOW, readLogin: sp.readLogin, creditsIds: sp.creditsIds, payingIds: null }); return x && typeof x === 'object' ? x.id : x; };
const shHold = (mod, sp) => mod.decidePoolSwitch({ currentId: 'm0', members: sp.others, membership: sp.others.map((m) => m.id), readCache: sp.readCache, nowSec: NOW, hot: true, proactive: true, readLogin: sp.readLogin, reserveFloorPct: FLOOR, creditsIds: sp.creditsIds, payingIds: null, exclude: sp.exclude, providerOf: sp.providerOf, fromProvider: sp.providerOf ? PV_OWN : null, conversationModel: 'opus', crossProvider: sp.crossProvider, explain: true });
const shList = (mod, sp) => mod.rankPoolMembers({ members: sp.others.filter((m) => m.id !== 'mx'), readCache: sp.readCache, nowSec: NOW, readLogin: sp.readLogin, creditsIds: sp.creditsIds, payingIds: null }).map((r) => r.id);
// what THIS decision refuses (never a target), and what bills past its quota or cannot be known (the money law's two halves)
const refusedBy = (sp) => new Set(sp.others.filter((m) => { const s = sp.st.get(m.id); return (sp.exclude || []).includes(m.id) || ['heldsi', 'heldun', 'stub', 'restart', 'dead', 'lapsed'].includes(s.q) || (s.other && s.q === 'near') || (sp.st.get('m0').kind === 'c' && s.kind === 'c' && s.q === 'spent'); }).map((m) => m.id));   // the last: rule 4's guard (never billed onto billed) beside a credits current
const moneyOf = (s) => !!s && s.kind === 'c' && ['spent', 'restart', 'stub', 'heldsi', 'heldun'].includes(s.q);
const servesShape = (s) => !!s && (s.q === 'live' || s.q === 'noread');   // no reading: a candidate to the decision and both walks alike (the round's reader, M8)
const SH_DIFF = new Map(), SH_LAW = [], SH_SPEND = [], SH_SPEND_BY = new Map(), SH_NULL_BY = new Map();
const shTally = (m, k) => m.set(k, (m.get(k) || 0) + 1);
const shWhy = (sp, sc, id) => { if (!id) return 'nobody'; const s = sp.st.get(id); return (sc.exclude || []).includes(id) ? `excluded ${shFmt(s)}` : s.other ? `other-provider ${s.q}` : shFmt(s); };
const SH_KINDS = { fbLive: 'the fallback: a credits member that can serve before an ordinary member that cannot', fbHeals: 'the fallback (r5441): a walled ordinary member, which heals by itself, before one that cannot sign in', holdOrder: 'the removed-member hold: the one order (a credits member that can serve before a walled ordinary member)', holdRefused: 'the removed-member hold: off a member this decision refused (excluded, a sign-in that cannot serve, a reading it holds)', listOrder: 'the device list: a credits member past its quota no longer before one that can serve' };
const shNote = (k, sh) => { if (!SH_DIFF.has(k)) SH_DIFF.set(k, { n: 0, ex: [] }); const g = SH_DIFF.get(k); g.n++; if (g.ex.length < 2) g.ex.push(sh); };
let shPools = 0, shI6 = 0, shKept = 0, shLiveHold = 0, shLive = 0; const shI6Ex = [], SH_REL = [];
const shScenes = function* () {
  const sets = [[]]; for (let a = 0; a < SH_STATES.length; a++) { sets.push([a]); for (let b = a; b < SH_STATES.length; b++) { sets.push([a, b]); for (let c = b; c < SH_STATES.length; c++) sets.push([a, b, c]); } }
  for (const cur of SH_CUR) for (const m of sets) { const others = m.map((i) => SH_STATES[i]);
    // another provider's LIVE member beside up to two others (with it the removed decision moves the conversation there: no walk is
    // asked — counted below, so three others skip it); excluding one of two equal states is the other's mirror, asked once
    for (const other of others.length < 3 ? [null, 'live', 'near'] : [null, 'near']) for (let x = -1; x < others.length; x++) { if (x > 0 && others[x] === others[x - 1]) continue; yield { cur, others, other, exclude: x < 0 ? null : ['m' + (x + 1)] }; } }
};
const SH_T0 = performance.now();
if (rel) for (const sc of shScenes()) {
  const sp = shapePool(sc.cur, sc.others, sc), S = (id) => sp.st.get(id); shPools++;
  const sh = `${shFmt(sc.cur)} removed | ${sc.others.map(shFmt).join(', ') || '(none)'}${sc.other ? ` | another provider allowed, its member ${sc.other}` : ''}${sc.exclude ? ` | ${sc.exclude[0]} excluded` : ''}`;
  const refused = refusedBy(sp);
  const unexplained = (what) => { shI6++; if (shI6Ex.length < 4) shI6Ex.push(`${what} — ${sh}`); };
  // the fallback (once a pool: the exclusion and the other provider are not its inputs)
  if (!sc.exclude && !sc.other) {
    const fm = shFallback(P, sp), ft = shFallback(rel, sp);
    if (fm && (refused.has(fm) || moneyOf(S(fm))) && fm !== ft) SH_LAW.push(`the fallback parks on ${shFmt(S(fm))} (${fm}) where the release parked on ${ft ? shFmt(S(ft)) : 'nobody'} — ${sh}`);
    if (fm !== ft) { const A = fm && S(fm), B = ft && S(ft); if (A && B && B.kind === 'o' && (B.q === 'spent' || B.q === 'dead' || refused.has(ft)) && A.kind === 'c' && servesShape(A)) shNote('fbLive', sh); else if (A && B && A.kind === 'o' && A.q === 'spent' && B.q === 'dead') shNote('fbHeals', sh); else unexplained(`the fallback names ${fm}, the release ${ft}`); }
    const lm = shList(P, sp), lt = shList(rel, sp);
    if (JSON.stringify(lm) !== JSON.stringify(lt)) { const cr = (l) => l.filter((id) => S(id).kind === 'c'); const ok = cr(lt).some((id, i, a) => !servesShape(S(id)) && a.slice(i + 1).some((y) => servesShape(S(y)))); if (ok) shNote('listOrder', sh); else unexplained(`the device list ${lm.join(',')} against the release's ${lt.join(',')}`); }
  }
  // the removed-member hold, this tree against the release, the decision whole (I6 with membership passed)
  const dm = shHold(P, sp), dt = shHold(rel, sp); SH_REL.push(dt);
  if (sc.other === 'live') { shLive++; if (dm.reason === 'removed-hold' || dt.reason === 'removed-hold') shLiveHold++; }
  const free = sp.others.some((m) => !refused.has(m.id));   // a listed member this decision did not refuse
  if (dm.reason === 'removed-hold' && dm.holdTo && refused.has(dm.holdTo)) {
    if (free || dm.holdTo !== dt.holdTo) SH_LAW.push(`the hold parks on ${shFmt(S(dm.holdTo))} (${dm.holdTo}), which this decision refused${free ? ' while a member it did not refuse is listed' : ', not the release\'s park'} — ${sh}`);
    else shKept++;   // every candidate refused: the release's own park stands (the conversation never keeps running on the removed member)
  }
  if (dm.reason === 'removed-hold' && !dm.holdTo && dt.holdTo && moneyOf(sc.cur)) SH_SPEND.push(`the hold names nobody: the conversation stays on its removed ${shFmt(sc.cur)} member, billing, where the release parked it on ${shFmt(S(dt.holdTo))} — ${sh}`);
  if (JSON.stringify({ ...dm, refusedIds: undefined }) !== JSON.stringify(dt)) {   // r5441: the hold names the set it handed the walk (the release names none)
    const same = { ...dm, holdTo: dt.holdTo, refusedIds: dt.refusedIds };   // r5441: the hold names the set it handed the walk (the release names none)
    if (dm.reason === 'removed-hold' && dt.reason === 'removed-hold' && JSON.stringify(same) === JSON.stringify(dt)) {
      const A = dm.holdTo && S(dm.holdTo), B = dt.holdTo && S(dt.holdTo);
      if (dt.holdTo && refused.has(dt.holdTo)) shNote('holdRefused', sh);
      else if (A && B && A.kind === 'c' && servesShape(A) && B.kind === 'o' && B.q === 'spent') shNote('holdOrder', sh);
      else unexplained(`the hold names ${dm.holdTo}, the release ${dt.holdTo}`);
      if (A && moneyOf(A) && dm.holdTo !== dt.holdTo) { SH_SPEND.push(`the hold parks on ${shFmt(A)} (${dm.holdTo}) where the release parked on ${B ? shFmt(B) : 'nobody'} — ${sh}`); shTally(SH_SPEND_BY, `current ${shFmt(sc.cur)} · tip ${shFmt(A)} · release ${shWhy(sp, sc, dt.holdTo)}${refused.has(dt.holdTo) ? ' (refused)' : ''}`); }
      if (!dm.holdTo && dt.holdTo) shTally(SH_NULL_BY, `current ${shFmt(sc.cur)} · release ${shWhy(sp, sc, dt.holdTo)}${refused.has(dt.holdTo) ? ' (refused)' : ''}`);
    } else unexplained(`the decision ${dm.reason}/${dm.holdTo || '-'} against the release's ${dt.reason}/${dt.holdTo || '-'}`);
  }
}
const SH_PIN = { fbLive: 448, fbHeals: 52, holdOrder: 0, holdRefused: 940, listOrder: 72, kept: 14124 };   // measured at the cure (r5279), both zones alike, run cda91e34f-20261126220945-both
console.log(`  · the shapes space asked in ${Math.round(performance.now() - SH_T0)} ms`);   // { fbLive, holdOrder, holdRefused, listOrder } — measured at the cure, written here
const shCount = (k) => (SH_DIFF.get(k) || { n: 0 }).n;
if (!rel) skip(5, 'the shapes space against the release (its law, its money pin over the hold, another provider\'s live member, the kept park, I6 by kind) — the release eb7608d5 is not in this clone (a depth-1 checkout)');
else {
console.log(`  · the shapes space (r5279): ${shPools} pools — the difference set against the release (eb7608d5): ` + Object.keys(SH_KINDS).map((k) => `${k} ${shCount(k)}`).join(' · '));
for (const [k, g] of SH_DIFF) { console.log(`      [${SH_KINDS[k]}] ${g.n}`); for (const e of g.ex) console.log('        ' + e); }
ck(`r5279 THE ONE LAW over the shapes: no walk goes where the decision refuses or cannot know (${SH_LAW.length})`, SH_LAW.length === 0);
for (const s of SH_LAW.slice(0, 6)) console.log('    LAW: ' + s);
ck(`r5279 the money pin over the removed-member hold: no new spend (${SH_SPEND.length})`, SH_SPEND.length === 0);
for (const s of SH_SPEND.slice(0, 6)) console.log('    NEW SPEND: ' + s);
for (const [nm, m] of [['the new spends', SH_SPEND_BY], ['the hold names nobody where the release parked', SH_NULL_BY]]) if (m.size) { console.log(`    ${nm}, by the current member and the release's park:`); for (const [k, n] of [...m].sort((x, y) => y[1] - x[1]).slice(0, 12)) console.log(`      ${n} × ${k}`); }
ck(`r5279 another provider's live member: the removed decision moves the conversation there, so the hold is never asked beside it (${shLive} pools, ${shLiveHold} reached the hold)`, shLive > 0 && shLiveHold === 0);
ck(`r5279 the kept park among refused: where the decision refused EVERY listed candidate, the hold keeps the release's own park — never the removed member, never a new bill (${shKept} pools)`, !!SH_PIN && shKept === SH_PIN.kept);
ck(`r5279 I6 over the shapes, the removed decision asked with membership: every difference from the release is a named kind, each count pinned (${Object.keys(SH_KINDS).map((k) => `${k} ${shCount(k)}`).join(', ')}; ${shI6} unexplained)`, shI6 === 0 && !!SH_PIN && Object.keys(SH_KINDS).every((k) => shCount(k) === SH_PIN[k]));
for (const s of shI6Ex) console.log('    I6: ' + s);
}
// THE THREE MUSTS' REDs on fd4356ca6's own code (the commit the round read), each with its witness
{ const pre6 = await preFixCopy('8f33fcabd', 'src/account-pool-auto.js', 'shapes-musts');   // fd4356ca6's bytes, the train's pick (r5527); the copy's tag is a word, never a sha
  const F6 = pre6.mod;
  if (!F6 && pre6.why === 'shallow') skip(3, 'the three musts\' REDs on fd4356ca6\'s code — its bytes (the train\'s pick 8f33fcabd) are not in this clone (a depth-1 checkout)');
  else if (!F6 || !rel) ck(`the copy of fd4356ca6 loaded for the three REDs${pre6.why ? ` — ${pre6.why}` : ''}`, false);
  else {
    let m1 = 0, m1w = 0, m2 = 0, m2w = 0, m3 = 0, m3w = 0; const M2X = [];
    let si = 0; const T1 = performance.now();
    for (const sc of shScenes()) {
      const sp = shapePool(sc.cur, sc.others, sc), S = (id) => sp.st.get(id), refused = refusedBy(sp), free = sp.others.some((m) => !refused.has(m.id));
      if (!sc.exclude && !sc.other) { const f6 = shFallback(F6, sp), ft = shFallback(rel, sp); if (f6 && f6 !== ft && S(f6).kind === 'c' && (S(f6).q === 'stub' || S(f6).q === 'restart')) { m1++; if (S(f6).q === 'stub' ? sp.readCache(f6) === STUB : !!sp.readCache(f6).startedAgain) m1w++; } }
      const dt = SH_REL[si++], d6 = dt.reason === 'removed-hold' ? shHold(F6, sp) : dt;   // fd4356ca6 moved the hold's target alone (the round's M4)
      if (d6.reason === 'removed-hold' && d6.holdTo) { const h = S(d6.holdTo), ex = (sc.exclude || []).includes(d6.holdTo);
        const kind = ex && ['live', 'spent', 'noread'].includes(h.q) ? 'excluded' : !ex && h.q === 'dead' ? 'blocked' : null;
        if (kind && free) { m2++; if (kind === 'excluded' ? (d6.excluded || 0) > 0 : (d6.loginBlocked || []).some((x) => x.id === d6.holdTo)) m2w++; else if (M2X.length < 4) M2X.push(`${kind} ${shFmt(h)} ${d6.holdTo} · loginBlocked ${JSON.stringify(d6.loginBlocked || null)} · excluded ${d6.excluded} · ${sc.others.map(shFmt).join(',')}`); } }
      if (sc.other === 'near' && !sc.exclude && d6.reason === 'removed-hold' && d6.holdTo && S(d6.holdTo).kind === 'c' && S(d6.holdTo).q === 'spent' && dt.holdTo && S(dt.holdTo).kind === 'o' && S(dt.holdTo).q === 'spent') { m3++; if (sp.providerOf('mx') === PV_OTHER && (d6.loginBlocked || []).some((x) => x.id === 'mx')) m3w++; }
    }
    console.log(`  · the three REDs asked in ${Math.round(performance.now() - T1)} ms`);
    ck(`MUST 1 RED (fd4356ca6): its fallback parks the default on a credits member whose file started again, where the release did not (${m1}; witness: the reading is the started-again one, ${m1w})`, m1 > 0 && m1w === m1);
    for (const x of M2X) console.log('    MUST 2 witness miss: ' + x);
    ck(`MUST 2 RED (fd4356ca6): its removed-member hold parks on a member the decision refused — excluded, or its sign-in cannot serve — while one it did not refuse is listed (${m2}; witness: the decision names it refused, ${m2w})`, m2 > 0 && m2w === m2);
    ck(`MUST 3 RED (fd4356ca6): with another provider allowed and its member near its sign-in's end, its hold parks on a credits member past its quota where the release parked on a walled ordinary member (${m3}; witness: the decision refused the other provider's member by its sign-in, ${m3w})`, m3 > 0 && m3w === m3);
  }
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: rel && base && F ? 6 : 0, label: 'walk-pins: ' })) ck(r.name, r.pass);

console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${pass}${skipped ? `; ${skipped} SKIPPED — the references are not in this clone` : ''})`);
process.exit(fail ? 1 : 0);

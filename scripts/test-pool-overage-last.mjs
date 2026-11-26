#!/usr/bin/env node
// B-87fd item (1) (THE OWNER's WORD, 2026-11-25 «改成永远排最后», 主开发 r4668): a member BILLING PAID OVERAGE is never preferred over
// a member with quota left. PAYING IS ITS OWN LAST TIER (主开发 r4711): the PURE decision (src/account-pool-auto.js decidePoolSwitch,
// rankPoolMembers, soonestUsableMember) asks it only when the quota members, the scraps and the credits members cannot serve (a tier
// whose every row is spent is passed over), the credits list the release's; the engine (src/server/usage-pool-engine.js
// overageInUseIds) hands the in-use set ALWAYS, read from the RAW reading only. The legs: the release probe's five as a table; the
// line's (a) the only servable member pays — it still serves; (b) a conversation already on a paying member — moved by the soft band,
// owed to its stop, kept with nowhere to go, moved to a credits member's PREPAID quota at its stop (the ruling); r4714's leg (b) and
// its twin; the hop guard; THE NO-OVERAGE IDENTITY TABLE against the release's own module; REDs that are the earlier rankings; the
// engine's reader pinned to the raw reading, its notices naming the bar. B-9369 (主开发 r5165): both switch notices in the page's language —
// the builders' every clause a key with a zh and a ja row, the English the release's sentence. Every account is made up; nothing is spawned or read.
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
    let same = 0, n = 0, diff = null, oneOrder = 0;   // oneOrder: the fallback's rule 3 order where nobody pays (B-d74f, 主开发 r5239)
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
      // the fallback: the release's pick, or (B-d74f, r5239: rule 3's ONE order where nobody pays) the credits member where the release
      // parked on an ordinary member that cannot serve now — the one kind the two may differ by, counted
      n++; { const a = ref.soonestUsableMember(rk), b = P.soonestUsableMember({ ...rk, payingIds: null });
        if (JSON.stringify(a) === JSON.stringify(b)) same++;
        else if (rel && b === 'e' && rk.creditsIds && a && a !== 'e' && P.quotaVerdict(caches[a] ?? null, NOW, { tier: 'hard' }).usable === false && P.quotaVerdict(caches.e ?? null, NOW, { tier: 'hard' }).usable !== false) { same++; oneOrder++; }   // the round's should: 'e' can serve
        else if (!diff) diff = { i, soonest: true, release: a, now: b }; }
    }
    ck(`overage-last: THE NO-OVERAGE IDENTITY — ${n} seeded placements, switches, ranks and fallbacks with NO member in overage are byte-identical to ${rel ? 'the release (eb7608d5)' : 'today\'s ranking (ref-free)'}, but for the fallback's one order (B-d74f: ${oneOrder} seeds where the release parked on an ordinary member that cannot serve now, the one order on the credits member)`, same === n);
    if (same !== n) console.log('    first difference: ' + JSON.stringify(diff).slice(0, 600));
    const ONE_ORDER_PIN = 0;   // the round's should: the one order's count pinned — these seeds never meet it (measured at the cure, run 948f5f438-20261126215628-box); the tier-invariants spaces carry it
    if (rel) ck(`overage-last: the one order's count over the seeds is the pinned one (${oneOrder})`, oneOrder === ONE_ORDER_PIN); }
  // THE ENGINE's READER, pinned to the RAW reading (P7: a stated overage, never an estimate), and handed beside EVERY credits set
  { const ENG = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
    const body = (t) => { const m = /function overageInUseIds\(members\) \{([\s\S]*?)\n\}/.exec(t); return m ? m[1] : ''; };
    // the walks' ONE read (the rounds' shoulds): one raw reading per member gives the credits fact, the paying fact, and the setting's set from the latter
    const walkOneRead = (t) => { const m = /\nfunction walkTierSets\(members\) \{([\s\S]*?)\n\}/.exec(t), b = m ? m[1] : ''; return (b.match(/readRawUsageCache\(/g) || []).length === 1 && /const o = overageState\(readRawUsageCache\(m\.id\)\); if \(o\.mode === 'allowed'\) c\.add\(m\.id\); if \(o\.inUse === 'yes'\) p\.add\(m\.id\);/.test(b) && /overageIds: overageMemberIds\(members, payingIds\)/.test(b) && !/creditsMemberIds\(|overageInUseIds\(|poolReadCache|estimat/.test(b); };
    const pin = (t) => /overageState\(readRawUsageCache\(m\.id\)\)\.inUse === 'yes'/.test(body(t)) && !/poolReadCache|readCacheFor|estimat/.test(body(t)) && (t.match(/creditsIds: creditsMemberIds\((\w+)\)(?!, payingIds: overageInUseIds\(\1\))/g) || []).length === 0 && /serverSetting\('pool\.avoidOverageMembers'\) !== true\) return null;\n    return paying !== undefined \? paying : overageInUseIds\(members\);/.test(t)
      && walkOneRead(t) && (t.match(/\.\.\.walkTierSets\(/g) || []).length === 3;
    ck('overage-last: the engine\'s in-use reader reads the RAW reading only, the setting gates only the bar\'s naming, every credits set handed to a decision has the paying set beside it, and the three walks take their three sets from ONE raw read of each member (walkTierSets: the credits fact, the paying fact and the setting\'s set from it, the rounds\' shoulds)', pin(ENG));
    ck('overage-last RED: a reader on the pool\'s estimated view turns the pin red', !pin(anchored(ENG, "if (overageState(readRawUsageCache(m.id)).inUse === 'yes') out.add(m.id);\n    return out.size ? out : null;\n  } catch { return null; }\n}\n/** THE BAR", "if (overageState(poolReadCache(m.id)).inUse === 'yes') out.add(m.id);\n    return out.size ? out : null;\n  } catch { return null; }\n}\n/** THE BAR", 'a reader on the estimated view')));
    ck('overage-last RED: one decision handed no paying set turns the pin red', !pin(anchored(ENG, 'creditsIds: creditsMemberIds(pm), payingIds: overageInUseIds(pm) })', 'creditsIds: creditsMemberIds(pm) })', 'a decision handed no paying set')));
    ck('overage-last RED: a walk whose setting\'s set is read a second time turns the pin red', !pin(anchored(ENG, 'overageIds: overageMemberIds(members, payingIds) };', 'overageIds: overageMemberIds(members) };', 'the walks\' one read')));
    ck('overage-last RED: a walk whose one read drops the credits fact turns the pin red', !pin(anchored(ENG, "if (o.mode === 'allowed') c.add(m.id); ", '', 'the walks\' credits fact')));
    ck('overage-last RED: a walk that reads the pool\'s estimated view turns the pin red', !pin(anchored(ENG, 'const o = overageState(readRawUsageCache(m.id));', 'const o = overageState(poolReadCache(m.id));', 'the walks\' raw read')));
    // r4711 (c) / r4714 2. / r4744, and B-9369 (主开发 r5165): BOTH switch notices (a conversation's move, the pool default's switch) are
    // the builders' words (switchNoticeWords): their English text AND the i18n the client words in the page's language — no clause is
    // written beside them (the last resort, «is billing paid overage, and … has quota left»: the builders' variants below)
    const wired = (t) => /const mw = sessionMoveWords\(\{[^\n]*\}\); serverNotice\(`pool-sess-\$\{sid\}-\$\{now\}`, mw\.text, \{ i18n: mw\.i18n \}\);/.test(t)
      && /const dw = poolSwitchWords\(\{/.test(t) && t.includes('serverNotice(`pool-auto-${poolId}-${now}`, dw.text, { i18n: dw.i18n });')
      && !/ — the last resort: \$\{/.test(t) && !/ is billing paid overage, and \$\{/.test(t);   // stale-pins: kept (deliberate absence: c4988dd6f's clauses, never beside a builder)
    ck('B-9369 the notices: both switch notices are the builders\' words — the English text and the i18n — and no clause is written beside them', wired(ENG));
    ck('B-9369 the notices RED: an English template beside the builder (c4988dd6f\'s form of the conversation\'s move) turns the pin red', !wired(anchored(ENG, 'serverNotice(`pool-sess-${sid}-${now}`, mw.text, { i18n: mw.i18n });', 'serverNotice(`pool-sess-${sid}-${now}`, `Pool "${a.name}": conversation moved to ${toName}${ds.toOverage ? ` — the last resort: ${toName} is billing paid overage` : \'\'}`);', 'an English template beside the builder')));
  }
  // B-9369 (主开发 r5165): EVERY CLAUSE IN THE PAGE's LANGUAGE — the builders driven through every variant: the English text exactly the
  // sentence the release says, each key (the sentence's and each slot's) a row in BOTH dictionaries with the same {params}, the plain
  // params only names and numbers, and the sentence worded as the client words it (src/lib/app.js: a param that is words first, one
  // level) leaves no slot and no English clause. Every key of the table is met by a variant.
  { const ENG_REL = 'src/server/usage-pool-engine.js', ENG = fs.readFileSync(path.join(REPO, ENG_REL), 'utf8');
    const { dictEntries } = await import('./i18n-extract.mjs');
    const dictOf = (f) => new Map(dictEntries(fs.readFileSync(path.join(REPO, 'src/lib', f), 'utf8')).map((e) => [e.key, e.value]));
    const DICT = { zh: dictOf('i18n-zh.js'), ja: dictOf('i18n-ja.js') };
    const fill = (s, ps) => s.replace(/\{(\w+)\}/g, (m, k) => (ps && ps[k] !== undefined ? String(ps[k]) : m));
    const said = (lang, i18n) => { const t = (k, ps) => fill(DICT[lang].get(k) || k, ps); const ps = Object.fromEntries(Object.entries(i18n.params || {}).map(([k, v]) => [k, v && typeof v === 'object' && typeof v.key === 'string' ? t(v.key, v.params || undefined) : v])); return t(i18n.key, ps); };
    const clausesOf = (i18n) => [{ key: i18n.key, params: i18n.params }, ...Object.values(i18n.params || {}).filter((v) => v && typeof v === 'object')];
    const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const PLAIN = new Set(['pool', 'title', 'target', 'from', 'rank', 'pct', 'fam', 'min', 'label', 'line', 'inMin', 'rate', 'n']);
    // B-9369's round (wf_246aa015-cf4, a small): the list widened to overage, pay-per-use, expires, Manage Agents and priority; «(usage
    // credits)» stays in the zh and ja rows on purpose (the term the panels show), so the word «credits» is not on it
    const ENGLISH = /\b(moved to|switched to|billing|resort|restarting|re-login|answered|quota|projected|remaining|login|subscription|removed|draining|conversations? start|overage|pay-per-use|expires|Manage Agents|priority)\b/;
    const variants = (W) => {
      const base = { pool: 'Pool A', title: 'conv', target: 'Member B' }, EARLY = { label: '5h', line: 10, inMin: 4, rate: 0.5 };
      const move = (o) => W.sessionMove({ ...base, hot: true, ...o }), sw = (o) => W.poolSwitch({ pool: 'Pool A', target: 'Member B', from: 'Member A', hot: true, ...o });
      const M0 = 'Pool "Pool A": conversation "conv" moved to Member B', HW = ' — Member H answered it with a limit while its own numbers are unknown';
      const NEAR = (ms) => ({ last: { toLoginNear: { msLeft: ms } } }), RL = '; re-login it in Manage Agents now';
      return [
        ['the move, alone', move({}), M0],
        ['the move: priority, paying, restart', move({ from: 'Member P', priorityRank: 2, overage: true, fam: 'opus', fromRemaining: 40, hot: false }), M0 + ' (priority #2) — Member P is billing paid overage, and Member B has quota left — restarting it'],
        ['the move: held on an instant, the family', move({ from: 'Member H', heldWhy: "held on another account's weekly instant", fam: 'opus' }), M0 + HW + " (held on another account's weekly instant) (its opus quota)"],
        ['the move: held unread, was at', move({ from: 'Member H', heldWhy: 'its usage reading could not be read', fam: 'opus', fromRemaining: 37.4 }), M0 + HW + ' (its usage reading could not be read) (its opus quota was at 37%)'],
        ['the move: held restarted, will be, early', move({ from: 'Member H', heldWhy: 'no whole usage reading has come since its reading file started again', fam: 'opus', fromRemaining: 8, early: EARLY, leadMin: 5 }), M0 + HW + ' (no whole usage reading has come since its reading file started again) (its opus quota will be at 8% within 5 min) — moved early, projected: 5h reaches its 10% line in ~4 min at 0.5%/min'],
        ['the move: a scrap dying now', move(NEAR(0)), M0 + " — but Member B's own login expires imminently" + RL],
        ['the move: a scrap in seconds', move(NEAR(30e3)), M0 + " — but Member B's own login expires in 30 s" + RL],
        ['the move: a scrap in minutes', move(NEAR(42 * 60e3)), M0 + " — but Member B's own login expires in 42 min" + RL],
        ['the move: a scrap in hours', move(NEAR(17 * 3600e3)), M0 + " — but Member B's own login expires in 17 h" + RL],
        ['the move: a scrap in days', move(NEAR(5 * 86400e3)), M0 + " — but Member B's own login expires in 5 days" + RL],
        ['the move: the last resort, credits', move({ last: { toCredits: true } }), M0 + ' — the last resort: Member B bills pay-per-use past its quota (usage credits)'],
        ['the move: the last resort, paying', move({ last: { toOverage: true } }), M0 + ' — the last resort: Member B is billing paid overage'],
        ['the switch: soonest reset', sw({ reason: 'edf' }), 'Pool "Pool A" switched to Member B — draining the member whose weekly quota resets soonest (use-it-or-lose-it)'],
        ['the switch: priority return, restart', sw({ reason: 'priority-return', priorityRank: 1, hot: false }), 'Pool "Pool A" is back on Member B (priority #1) — new conversations start there (restarting its conversations)'],
        ['the switch: removed, the last resort paying', sw({ reason: 'not-a-member', last: { toOverage: true } }), 'Pool "Pool A" switched to Member B — Member A was removed from the pool — the last resort: Member B is billing paid overage'],
        ['the switch: paying, restart', sw({ reason: 'overage', hot: false }), 'Pool "Pool A" switched to Member B — Member A is billing paid overage, and Member B has quota left (restarting its conversations)'],
        ['the switch: lapsed', sw({ reason: 'subscription-lapsed' }), "Pool \"Pool A\" switched to Member B — Member A's subscription is inactive; it rejoins by itself once it answers again"],
        ['the switch: signed out', sw({ reason: 'login-expired', wall: 'login is signed out' }), "Pool \"Pool A\" switched to Member B — Member A's login is signed out; re-login it in Manage Agents"],
        ['the switch: expired, the last resort credits', sw({ reason: 'login-expired', wall: 'login session expired', last: { toCredits: true } }), "Pool \"Pool A\" switched to Member B — Member A's login session expired; re-login it in Manage Agents — the last resort: Member B bills pay-per-use past its quota (usage credits)"],
        ['the switch: unusable', sw({ reason: 'login-expired', wall: 'login session is unusable' }), "Pool \"Pool A\" switched to Member B — Member A's login session is unusable; re-login it in Manage Agents"],
        ['the switch: automatic, priority, restart', sw({ reason: 'exhausted', priorityRank: 3, pct: 12, hot: false }), 'Pool "Pool A" auto-switched to Member B (priority #3) (previous account down to 12% remaining) — restarting its conversations'],
        ['the switch: automatic, early', sw({ reason: 'exhausted', pct: 8, early: EARLY, leadMin: 5 }), 'Pool "Pool A" auto-switched to Member B (previous account will be down to 8% within 5 min — moved early, projected: 5h reaches its 10% line in ~4 min at 0.5%/min)'],
      ];
    };
    const judge = (W) => {
      const bad = [], met = new Set();
      for (const [n, w, en] of variants(W)) {
        if (w.text !== en) bad.push(`${n}: the English «${w.text}» ≠ «${en}»`);
        for (const c of clausesOf(w.i18n)) {
          met.add(c.key);
          for (const lang of ['zh', 'ja']) { const v = DICT[lang].get(c.key); if (v === undefined) bad.push(`${n}: no ${lang} row for «${c.key}»`); else if (ph(v) !== ph(c.key)) bad.push(`${n}: the ${lang} row of «${c.key}» says {${ph(v)}}, the key {${ph(c.key)}}`); }
          for (const [k, v] of Object.entries(c.params || {})) if (!(v && typeof v === 'object') && v !== '' && !PLAIN.has(k)) bad.push(`${n}: «${k}» is a plain string param (${String(v).slice(0, 60)}) — words, never a name`);
        }
        for (const lang of ['zh', 'ja']) { const s = said(lang, w.i18n); if (/\{\w+\}/.test(s) || s === w.text || ENGLISH.test(s)) bad.push(`${n}: worded in ${lang} «${s}» keeps a slot or English`); }
      }
      return { bad, met };
    };
    const E = require(path.join(REPO, ENG_REL)), here = judge(E.switchNoticeWords);
    ck(`B-9369 every clause in the page's language: ${variants(E.switchNoticeWords).length} variants — the English exactly the release's sentence, each key a row in zh and ja with its {params}, worded with no slot and no English left`, here.bad.length === 0);
    for (const b of here.bad.slice(0, 8)) console.log('    ' + b);
    const all = Object.values(E.switchNoticeWords.KEYS), unmet = all.filter((k) => !here.met.has(k));
    ck(`B-9369 every key of the table is met by a variant (${all.length} keys)`, all.length >= 30 && unmet.length === 0);
    if (unmet.length) console.log('    unmet: ' + unmet.join(' | '));
    // RED (a plant on the paying last resort: an English sentence as its own key, never a dictionary row) — its witness: the copy's
    // clause is the plant's, not the table's
    const english = M.load(ENG_REL, anchored(ENG, '  if (toOverage) return { key: SWITCH_KEYS.lastOverage, params: { target } };', "  if (toOverage) return { key: ' — the last resort: ' + target + ' is billing paid overage', params: {} };", 'an English last resort'), 'switch-english');
    const ew = english.switchNoticeWords.sessionMove({ pool: 'Pool A', title: 'conv', target: 'Member B', hot: true, last: { toOverage: true } });
    ck('B-9369 RED CONTROL in force: the copy\'s last resort is the plant\'s sentence, not the table\'s key', ew.i18n.params.last && ew.i18n.params.last.key !== E.switchNoticeWords.KEYS.lastOverage);
    ck('B-9369 RED: a last resort written as an English sentence turns the judge red', judge(english.switchNoticeWords).bad.some((b) => /no zh row/.test(b)));
    // RED (r4714's: a builder without the paying last resort) — its witness: the copy says nothing past the move
    const none = M.load(ENG_REL, anchored(ENG, '  if (toOverage) return { key: SWITCH_KEYS.lastOverage, params: { target } };\n', '', 'no paying last resort'), 'switch-no-clause');
    const nw = none.switchNoticeWords.sessionMove({ pool: 'Pool A', title: 'conv', target: 'Member B', hot: true, last: { toOverage: true } });
    ck('B-9369 RED CONTROL in force: the copy names no last resort on a paying landing', nw.i18n.params.last === '');
    ck('r4714 the notices RED: a builder without the paying last resort turns the judge red', judge(none.switchNoticeWords).bad.some((b) => /the last resort, paying/.test(b)));
  }
  { const ENG = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
    // THE POOL DEFAULT never cuts a follower mid-turn (r4696 M2): on a pool that cannot hot-switch, an 'overage' move waits for every
    // follower to stop, as the priority return does — the default's decision reads no inTurn of its own, so this wait IS its hold
    const waits = (t) => t.includes("if ((d.reason === 'priority-return' || d.reason === 'overage') && !hot) {") && t.includes("if (busy && d.reason === 'overage') { noteWarmHold(poolId, busy, { ...d, reason: 'warm-soft-defer', paying: true,") && t.includes("poolId + ':default:overage'");
    ck('r4744 the pool default: an overage move on a pool that cannot hot-switch waits for every follower to stop (its own warm-hold key)', waits(ENG));
    ck('r4744 the pool default RED: without the overage clause the default restarts a follower mid-turn — the pin is red', !waits(anchored(ENG, "if ((d.reason === 'priority-return' || d.reason === 'overage') && !hot) {", "if ((d.reason === 'priority-return') && !hot) {", 'the default\'s follower wait'))); }
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
    "    if (curPayingTakes && !proactive && !prioRank && !placing) return none('healthy', { fromRemaining: cur.known ? cur.remaining : null });\n", '', 'M1 red: the healthy answer'),
    "    if (curPayingTakes) return none('no-better', ", "    if (false) return none('no-better', ", 'M1 red: the no-better answer'), 'm1-red');
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
    // a RUNNING conversation owes the move to its stop; a NEW one has no turn to cut and is placed at once (主开发 r4903 M2)
    const running = rows.filter(([hn]) => !hn.startsWith('a new conversation')), placingRow = rows.find(([hn]) => hn.startsWith('a new conversation'));
    ck(`r4711 THE RULING: on a paying member, a usage-credits member holding prepaid quota — in a turn each running shape (${running.length}) OWES the move to its stop (warm-soft-defer with paying, toward it); a new conversation is placed on it at once (r4903)`, running.every(([, h]) => !h.to && h.reason === 'warm-soft-defer' && h.paying === true && h.wouldTo === 'c') && !!placingRow && placingRow[1].to === 'c');
    ck('r4711 THE RULING: …at its stop every shape MOVES onto it — reason overage, the soft band; it lands on quota the member still holds, so no «last resort, pay-per-use» (no toCredits)', rows.every(([, , st]) => st.to === 'c' && st.reason === 'overage' && st.band === 'soft' && !st.toCredits));
    const withQuota = P.decidePoolSwitch({ currentId: 'o', members: [...memC, { id: 'r', name: 'Quota left' }], readCache: viewM({ ...cC, r: fmM(0.4, 3 * D) }), nowSec: NOW, explain: true, ...PAY, creditsIds: ['c'], hot: false });
    ck('r4711 THE RULING: …a quota member able to settle is still asked first (the tiers in order)', withQuota.to === 'r' && withQuota.reason === 'overage');
    const redC = M.load('src/account-pool-auto.js', anchored(src, '  const prepaid = curPayingOnly ? (creditsRanked.find((r) => creditsSettle.has(r.id)) || null) : null;', '  const prepaid = null;', 'the ruling red: no move to prepaid quota'), 'ruling-red');
    ck('r4711 THE RULING RED (4f3305b49 kept it): without the move it stays on the paying member at its stop', !mC(redC, shapes[0][1], STOP).to);
    const redH = M.load('src/account-pool-auto.js', anchored(src, '  const toPrepaid = (r) => ((warm && warm.inTurn)', '  const toPrepaid = (r) => ((false)', 'the ruling red: no hold in a turn'), 'ruling-hold-red');
    ck('r4744 THE RULING RED (its hold): a move that never waits for the stop cuts the conversation mid-turn', mC(redH, shapes[0][1], IN).to === 'c');
    // r4903 (主开发's ruling, the owner's word): QUOTA HELD IN RESERVE IS USED BEFORE DOLLARS — beside a member under the reserve floor
    // that clears the settle bar (40 % weekly under a 50 % floor), the conversation LEAVES the paying member: at its stop, owed in a turn
    { const memF = [{ id: 'o', name: 'Paying' }, { id: 'r', name: 'Floored' }], cF = { o: fmM(0.3, 3 * D), r: fmM(0.6, 3 * D) };
      const fl = (mod, warm) => mod.decidePoolSwitch({ currentId: 'o', members: memF, readCache: viewM(cF), nowSec: NOW, explain: true, ...PAY, reserveFloorPct: 50, hot: false, warm });
      const atStop = fl(P, STOP), inTurn = fl(P, IN);
      ck(`r4903 THE FLOOR: beside a member under the reserve floor that settles, it leaves the paying member at its stop (→ ${atStop.to}, ${atStop.reason}) and owes it in a turn (${inTurn.reason})`, atStop.to === 'r' && atStop.reason === 'overage' && !inTurn.to && inTurn.reason === 'warm-soft-defer');
      const floorHolds = M.load('src/account-pool-auto.js', anchored(src, '    if (floor > 0 && wk != null && wk < floor && !curPayingTakes) { reserveBlocked.push(', '    if (floor > 0 && wk != null && wk < floor) { reserveBlocked.push(', 'the floor holding the member back'), 'floor-red');   // stale-pins: kept (the RED's text IS 0a6053698's line)
      ck('r4903 THE FLOOR RED (0a6053698): with the floor holding the member back, the conversation stays on the paying member and bills', !fl(floorHolds, STOP).to); }
    // r4903 M2 (主开发's ruling): A NEW CONVERSATION HAS NOTHING TO LOSE — placed off a paying default onto an ordinary member that can
    // serve now under the settle bar (5h 11 %), and onto a credits member that holds quota when no ordinary member can
    { const fm5 = (u5, u7) => ({ fiveHour: { utilization: u5, resetsAt: NOW + 1800 }, sevenDay: { utilization: u7, resetsAt: NOW + 3 * D }, scopedWeekly: [] });
      const pl = (mod, members, caches, extra = {}) => mod.decidePoolSwitch({ currentId: 'o', members, readCache: viewM(caches), nowSec: NOW, explain: true, ...PAY, placing: true, hot: true, ...extra });
      const toLow = pl(P, [{ id: 'o', name: 'Paying' }, { id: 'q', name: 'Quota, low 5h' }], { o: fmM(0.3, 3 * D), q: fm5(0.89, 0.4) });
      const toCred = pl(P, [{ id: 'o', name: 'Paying' }, { id: 'c', name: 'Credits, low 5h' }], { o: fmM(0.3, 3 * D), c: fm5(0.89, 0.4) }, { creditsIds: ['c'] });
      ck(`r4903 M2 PLACING: a new conversation is placed off a paying default onto an ordinary member that can serve under the settle bar (→ ${toLow.to}) and onto a credits member that holds quota (→ ${toCred.to})`, toLow.to === 'q' && toCred.to === 'c');
      const keepsDefault = M.load('src/account-pool-auto.js', anchored(src, '  if ((placing || starting) && curPayingTakes && !hardDead) {', '  if (false) {', 'the placing kept on the paying default'), 'placing-red');
      const r = pl(keepsDefault, [{ id: 'o', name: 'Paying' }, { id: 'q', name: 'Quota, low 5h' }], { o: fmM(0.3, 3 * D), q: fm5(0.89, 0.4) });
      ck(`r4903 M2 PLACING RED (0a6053698): the new conversation is kept on the paying default (${r.reason}) and bills`, !r.to); }
    // r4903 M3: a landing on a paying member is MARKED whatever the setting (toPaying), and the engine's «is there an alternative to a
    // prepaid reset credit?» refuses it as it refuses a credits landing
    { const memW = [{ id: 'a', name: 'Walled' }, { id: 'p', name: 'Paying spent' }], cW = { a: fmM(0.99, 3 * D), p: fmM(0.99, 2 * D) };
      const dW = P.decidePoolSwitch({ currentId: 'a', members: memW, readCache: viewM(cW), nowSec: NOW, explain: true, payingIds: new Set(['p']), hot: false });
      ck(`r4903 M3: off a walled member onto a paying one past its quota the landing is marked (toPaying), the setting off (→ ${dW.to})`, dW.to === 'p' && !!(dW.toPaying && dW.toPaying.id === 'p') && !dW.toOverage);
      const ENG = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
      const ALT = '    return !!(d && d.to && !d.toCredits && !d.toPaying);';
      const alt = (t) => t.split(ALT).length === 2 && /function poolAlternativeFor\(session, now = Date\.now\(\)\) \{[\s\S]{0,4000}?return !!\(d && d\.to && !d\.toCredits && !d\.toPaying\);/.test(t);
      ck('r4903 M3: poolAlternativeFor refuses a paying landing as an alternative to a prepaid reset credit, as it refuses a credits one', alt(ENG));
      ck('r4903 M3 RED: the release\'s line (credits refused, paying taken) turns the pin red', !alt(anchored(ENG, ALT, '    return !!(d && d.to && !d.toCredits);', 'the release\'s alternative'))); }   // stale-pins: kept (the RED's text IS 0a6053698's line)
    // THE BAR (主开发 r4744): the move is VOLUNTARY, so its target clears the release's SETTLE bar in either tier — a credits member
    // that holds quota but cannot settle (5h 8 %: over its hard bar, under hot + gain) keeps the conversation where it is, and so does
    // a quota member in the same state (5h 11 %, 7d 60 %)
    const fm5 = (u5, u7) => ({ fiveHour: { utilization: u5, resetsAt: NOW + 1800 }, sevenDay: { utilization: u7, resetsAt: NOW + 3 * D }, scopedWeekly: [] });
    const nearC = mC(P, shapes[0][1], STOP);
    const lowC = P.decidePoolSwitch({ currentId: 'o', members: memC, readCache: viewM({ o: fmM(0.3, 3 * D), c: fm5(0.92, 0.4) }), nowSec: NOW, explain: true, ...PAY, creditsIds: ['c'], hot: false, warm: STOP });
    const lowQ = P.decidePoolSwitch({ currentId: 'o', members: [{ id: 'o', name: 'Paying' }, { id: 'q', name: 'Quota, low 5h' }], readCache: viewM({ o: fmM(0.3, 3 * D), q: fm5(0.89, 0.4) }), nowSec: NOW, explain: true, ...PAY, hot: false, warm: STOP });
    ck(`r4744 THE BAR: beside a credits member that cannot SETTLE (5h 8 %) it stays (→ ${lowC.to}, ${lowC.reason}); beside one that can it moves (→ ${nearC.to})`, !lowC.to && !BLOCKED.includes(lowC.reason) && nearC.to === 'c');
    ck(`r4744 THE BAR: …and beside a quota member that cannot settle (5h 11 %) it stays too (→ ${lowQ.to}, ${lowQ.reason})`, !lowQ.to && !BLOCKED.includes(lowQ.reason));
    const redBar = M.load('src/account-pool-auto.js', anchored(src, 'creditsRanked.find((r) => creditsSettle.has(r.id))', 'creditsRanked.find((r) => !r.dead)', 'the bar red: «not dead»'), 'bar-red');   // stale-pins: kept (the RED's text IS ebffe6f36's bar)
    ck('r4744 THE BAR RED (ebffe6f36: «not dead»): it moves onto the credits member that cannot settle', P.decidePoolSwitch.call(null, { currentId: 'o', members: memC, readCache: viewM({ o: fmM(0.3, 3 * D), c: fm5(0.92, 0.4) }), nowSec: NOW, explain: true, ...PAY, creditsIds: ['c'], hot: false, warm: STOP }).to !== 'c' && redBar.decidePoolSwitch({ currentId: 'o', members: memC, readCache: viewM({ o: fmM(0.3, 3 * D), c: fm5(0.92, 0.4) }), nowSec: NOW, explain: true, ...PAY, creditsIds: ['c'], hot: false, warm: STOP }).to === 'c'); }
  // r4744 M2: «PAYING» IN WHATEVER BAND — a paying member whose reading sits in its SOFT band (hot pool, 5h 8 %: under its hot bar,
  // over its hard one) takes the paying paths: beside another live paying member it stays (never the pool's blocked verdict); beside a
  // credits member that can settle it moves at its stop
  { const fm5 = (u5, u7) => ({ fiveHour: { utilization: u5, resetsAt: NOW + 1800 }, sevenDay: { utilization: u7, resetsAt: NOW + 3 * D }, scopedWeekly: [] });
    const PQ = { payingIds: new Set(['o', 'q']) };
    const hotShapes = [['a conversation on a hot pool', { proactive: true, hot: true }], ['an ordinary decision on a hot pool', { proactive: false, hot: true }]];
    const soft = (mod, members, caches, extra) => hotShapes.map(([, sh]) => mod.decidePoolSwitch({ currentId: 'o', members, readCache: viewM(caches), nowSec: NOW, explain: true, ...sh, ...extra }));
    const memQ = [{ id: 'o', name: 'Paying, soft' }, { id: 'q', name: 'Paying' }], cQ = { o: fm5(0.92, 0.3), q: fm5(0.1, 0.4) };
    const memS = [{ id: 'o', name: 'Paying, soft' }, { id: 'c', name: 'Credits' }], cS = { o: fm5(0.92, 0.3), c: fm5(0.1, 0.4) };
    const aQ = soft(P, memQ, cQ, PQ), aS = soft(P, memS, cS, { ...PAY, creditsIds: ['c'], warm: { warm: false, inTurn: false, agoSec: 400, ttlSec: 300 } });
    ck(`r4744 M2: a paying member in its soft band beside another live paying member is never blocked — it stays (${aQ.map((d) => d.reason).join(', ')})`, aQ.every((d) => !d.to && !BLOCKED.includes(d.reason)));
    ck(`r4744 M2: …beside a credits member that can settle it moves there at its stop (${aS.map((d) => `${d.to}/${d.reason}`).join(', ')})`, aS.every((d) => d.to === 'c' && d.reason === 'overage'));
    const tipSoft = M.load('src/account-pool-auto.js', anchored(anchored(anchored(src,
      '  const curPayingOnly = curPaying && !(notMember || curLoginDead || curHeldWalled || (cur.known && curBr.some(dead)));', '  const curPayingOnly = curPaying && !(notMember || curLoginDead || curHeldWalled || (cur.known && curBr.some(soft)));', 'M2 red: paying only outside the soft band'),   // stale-pins: kept (the RED's text IS ebffe6f36's line)
      '  const curPayingTakes = curPaying && !(notMember || curLoginDead || curHeldWalled);', '  const curPayingTakes = curPaying && !(notMember || curLoginDead || curHeldWalled || (cur.known && curBr.some(soft)));', 'M2 red: …in the stays too'),
      '    if (!hardDead && payingRanked.length) return none(', '    if (false) return none(', 'M2 red: no quiet stay beside paying members'), 'm2b-red');
    const rQ = soft(tipSoft, memQ, cQ, PQ), rS = soft(tipSoft, memS, cS, { ...PAY, creditsIds: ['c'], warm: { warm: false, inTurn: false, agoSec: 400, ttlSec: 300 } });
    ck(`r4744 M2 RED (ebffe6f36's guard): the pool is BLOCKED while two members serve (${rQ.map((d) => d.reason).join(', ')}), and the prepaid move never happens (${rS.map((d) => d.reason).join(', ')})`, rQ.some((d) => BLOCKED.includes(d.reason)) && rS.every((d) => d.to !== 'c')); }
  // THE HOP GUARD (r4714 3.): a LIVE paying member whose only other paying member is live too STAYS — no hop between two paying
  // members for a better deadline — unless the current one can no longer serve (its own reading under the hard bar)
  { const memH = [{ id: 'o', name: 'Paying' }, { id: 'p', name: 'Paying sooner' }];
    const PAY2 = { payingIds: new Set(['o', 'p']) };
    const hd = (caches, shape) => P.decidePoolSwitch({ currentId: 'o', members: memH, readCache: viewM(caches), nowSec: NOW, explain: true, ...PAY2, ...shape });
    const st = shapes.map(([, shape]) => hd({ o: fmM(0.3, 5 * D), p: fmM(0.1, 1 * D) }, shape));   // the other resets sooner and holds more
    ck(`r4714 HOP GUARD: a live paying member whose only other paying member is live (sooner, fuller) STAYS — ${st.length} shapes, none blocked (${[...new Set(st.map((d) => d.reason))].join(', ')})`, st.every((d) => !d.to && !BLOCKED.includes(d.reason)));
    ck('r4714 HOP GUARD: …unless it can no longer serve (under its hard bar): it moves onto the live paying member', hd({ o: fmM(0.99, 5 * D), p: fmM(0.1, 1 * D) }, shapes[0][1]).to === 'p');
    ck('r4714 HOP GUARD: …and never from a spent paying member onto another spent one', !hd({ o: fmM(0.99, 5 * D), p: fmM(0.99, 1 * D) }, shapes[0][1]).to);
    const noGuard = M.load('src/account-pool-auto.js', anchored(src, '  const payingOk = payingRanked.length > 0 && !(curBilling && payingRanked[0].dead);', '  const payingOk = payingRanked.length > 0;', 'hop guard red'), 'hop-red');
    ck('r4714 HOP GUARD RED: without the guard a spent paying member hops onto another spent one', noGuard.decidePoolSwitch({ currentId: 'o', members: memH, readCache: viewM({ o: fmM(0.99, 5 * D), p: fmM(0.99, 1 * D) }), nowSec: NOW, explain: true, ...PAY2, ...shapes[0][1] }).to === 'p'); }
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
    const tipB = M.load('src/account-pool-auto.js', anchored(anchored(src,
      '      payingRanked.push({', '      creditsRanked.push({', '(b) red: the fold'),
      '  creditsRanked.sort((x, y) => ((x.dead ? 1 : 0) - (y.dead ? 1 : 0)) || order(x, y));', '  creditsRanked.sort((x, y) => (((x.dead || x.paying) ? 1 : 0) - ((y.dead || y.paying) ? 1 : 0)) || order(x, y));', '(b) red: the sort'), 'b-red');   // stale-pins: kept (the RED's text IS 4f3305b49's line)
    const rb = dl(tipB, cL);
    ck(`r4714 (b) RED (4f3305b49: the fold and its sort): the conversation never reaches the live paying member (→ ${rb.to}, ${rb.reason})`, rb.to !== 'p'); }
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
    const red3b = M.load('src/account-pool-auto.js', anchored(src, 'lastTier.set(x, { tier, live: servesNow(br) });', 'lastTier.set(x, { tier: TIER_CREDITS, live: servesNow(br) });', 'M3 red: the rank fold'), 'm3-red-b');
    const red3c = M.load('src/account-pool-auto.js', anchored(src, '    const tier = tiers.tierOf(m.id), signDead', '    const tier = Math.min(tiers.tierOf(m.id), TIER_CREDITS), signDead', 'M3 red: the fallback fold'), 'm3-red-c');
    ck('r4696 M3 RED (the paying rows folded into the credits tier) decidePoolSwitch: the paying member wins the last resort', d3(red3a).to === 'o');
    ck('r4696 M3 RED (the fold) rankPoolMembers: the paying member walks first', r3(red3b) === 'o,c');
    ck('r4696 M3 RED (the fold) soonestUsableMember: the paying member is the fallback', sOf(s3(red3c)) === 'o'); }
}
  // r4744 M1: THE WALKS AGREE. Seeded pools of last-resort members only (usage-credits and paying members, each live or spent, a few
  // unread), the default hard-dead: the decision's landing, the rank list's head (the evict path, the device's sealed orders) and the
  // default's fallback stand in the SAME tier, in every pool. The tip's own rule in either walk (the tiers by a fixed order, a spent
  // tier never passed over) is its RED. And by the source: each walk takes its tier from poolTiers, and no walk keeps a rule of its own.
  { const srcA = fs.readFileSync(path.join(REPO, 'src/account-pool-auto.js'), 'utf8');
    // its own readings (this block stands outside the r4696 block's helpers)
    const fmM = (u7, resetIn) => ({ fiveHour: { utilization: 0, resetsAt: NOW + 1800 }, sevenDay: { utilization: u7, resetsAt: NOW + resetIn }, scopedWeekly: [] });
    const viewM = (caches) => (id) => projectCacheForFamily(caches[id] ?? null, 'opus');
    const T = (credits, paying) => (id) => (credits.includes(id) ? 1 : paying.includes(id) ? 2 : 0);
    let seed = 29; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const walks = (mod, n = 300) => {
      let agree = 0, told = 0, first = null;
      for (let i = 0; i < n; i++) {
        const ids = ['c1', 'c2', 'p1', 'p2'].filter(() => rnd() < 0.8);
        const credits = ids.filter((x) => x[0] === 'c'), paying = ids.filter((x) => x[0] === 'p');
        const caches = { a: fmM(0.99, 3 * D) };
        for (const id of ids) caches[id] = rnd() < 0.1 ? null : fmM(rnd() < 0.5 ? 0.99 : Math.round(rnd() * 80) / 100, Math.round(rnd() * 5 * D) + H);
        const others = ids.map((id) => ({ id, name: id }));
        const rc = viewM(caches);
        const d = mod.decidePoolSwitch({ currentId: 'a', members: [{ id: 'a', name: 'A' }, ...others], readCache: rc, nowSec: NOW, explain: true, hot: true, creditsIds: credits, payingIds: paying });
        if (!d.to) continue;
        told++;
        const tier = T(credits, paying);
        const rk = mod.rankPoolMembers({ members: others, readCache: rc, nowSec: NOW, creditsIds: credits, payingIds: paying });
        const fb = mod.soonestUsableMember({ members: others, readCache: rc, nowSec: NOW, creditsIds: credits, payingIds: paying });
        const fbId = fb && typeof fb === 'object' ? fb.id : fb;
        if (rk.length && tier(rk[0].id) === tier(d.to) && tier(fbId) === tier(d.to)) agree++;
        else if (!first) first = { caches: Object.fromEntries(ids.map((id) => [id, caches[id] && caches[id].sevenDay.utilization])), decision: d.to, rank: rk.map((r) => r.id), fallback: fbId };
      }
      return { agree, told, first };
    };
    const w = walks(P);
    ck(`r4744 M1 THE WALKS AGREE: in ${w.told} seeded pools whose default moved, the decision's landing, the rank list's head and the default's fallback stand in the same tier (${w.agree})`, w.told > 100 && w.agree === w.told);
    if (w.agree !== w.told) console.log('    first disagreement: ' + JSON.stringify(w.first));
    seed = 29;
    const ownRank = M.load('src/account-pool-auto.js', anchored(srcA, '  last.sort((x, y) => (keyOf(lastTier.get(x)) - keyOf(lastTier.get(y))) || order(x, y));', '  last.sort((x, y) => (lastTier.get(x).tier - lastTier.get(y).tier) || order(x, y));', 'M1 red: the rank list by its own rule'), 'walks-red-rank');
    const wr = walks(ownRank);
    seed = 29;
    const ownFallback = M.load('src/account-pool-auto.js', anchored(srcA, ' || (keyOf(x) - keyOf(y)) || ', ' || (x.tier - y.tier) || ', 'M1 red: the fallback by its own rule'), 'walks-red-fallback');   // stale-pins: kept (the RED's text IS ebffe6f36's sort)
    const wf = walks(ownFallback);
    ck(`r4744 M1 RED (ebffe6f36's rule in the rank list): the walks disagree (${wr.told - wr.agree} of ${wr.told})`, wr.agree < wr.told);
    ck(`r4744 M1 RED (ebffe6f36's rule in the fallback): the walks disagree (${wf.told - wf.agree} of ${wf.told})`, wf.agree < wf.told);
    // BY THE SOURCE: the tier is read in ONE place (poolTiers' tierOf), each walk takes it and its order from there
    const bodyOf = (name) => { const i = srcA.indexOf(`\nfunction ${name}(`); const j = srcA.indexOf('\nfunction ', i + 10); return i < 0 ? '' : srcA.slice(i, j < 0 ? undefined : j); };
    const oneRule = (t) => (t.match(/\b(?:credits|paying)\.has\(/g) || []).length === 2 && /const tierOf = \(id\) => /.test(bodyOf('poolTiers')) && ['decidePoolSwitch', 'rankPoolMembers', 'soonestUsableMember'].every((f) => { const b = bodyOf(f); return /poolTiers\(\{/.test(b) && /\.orderOf\(/.test(b) && !/\b(?:credits|paying)\.has\(/.test(b) && !/\(x\.(?:tier|credits|paying)\b(?!\))/.test(b); });
    ck('r4744 M1 BY THE SOURCE: the tier is read in poolTiers alone (two reads of the sets, both in its tierOf), and each of the three walks takes the tiers and their order from it, sorting by no tier rule of its own', oneRule(srcA));
    ck('r4744 M1 BY THE SOURCE RED: a walk that reads the credits set itself turns it red', !oneRule(anchored(srcA, '    const tier = tiers.tierOf(m.id);\n    if (tier !== TIER_QUOTA) {', '    const tier = tiers.credits && tiers.credits.has(m.id) ? TIER_CREDITS : tiers.tierOf(m.id);\n    if (tier !== TIER_QUOTA) {', 'a walk with its own read'))); }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: rel ? 19 : 18, label: 'overage-last: ' })) ck(r.name, r.pass);   // the release copy counts only where it was made
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

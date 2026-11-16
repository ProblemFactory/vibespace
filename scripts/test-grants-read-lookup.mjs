#!/usr/bin/env node
// test-grants-read-lookup — A CHANNEL GRANT READ IS A LOOKUP (lane grants-read-is-a-lookup, 主开发 2026-11-16 18:33Z). The
// owner's hub held its main loop ~420 s a day in ONE chain: the agent prompt hook's reach count (src/agent-routes.js
// channelsTaughtFor → channels-access reachCountFor) walked every channel conversation, each a grant read that re-normalised
// every grant it judged (channel-acl principalApplies → GM.admits → normRow / normEntry / cleanName / factsOf) and asked the
// grants store's forDir (path.resolve) five times. COUNTS, never a clock, at the owner's real size — 主开发's counts, every
// id and title invented: 197 110 channel conversations on 8 accounts, 10 reach rows (8 account grains, 2 conversation
// grains, no except, ≤ 3 «to»), 10 rules in 5 filters, 41 sessions, 3 groups:
//   ① reads per walk, normalisations, store lookups — the hook's reach count and an agent's list (d7f42cc21: 197 110 reads,
//     2.49 M normalisations, 1.01 M store lookups a walk)
//   ② L3 (docs/kb-design-lessons.md §19, 250 ms a loop turn): an async walk gives the loop back every WALK_STEP conversations
//     scanned (a count of yields); a list sorts what it lists, never every candidate (the largest sort a list makes)
//   ③ PARITY — the old way kept HERE as the oracle (d7f42cc21's principalApplies / effective / grantsOfConversation): every
//     row shape (a group, a named conversation, everyone, a left-out member or group, a requestable row, an approved
//     request, a rule's row, no row) × every asker: the judge, and what the engine answers (reachCountFor, reachFor per
//     conversation, list --all's rows and their order)
//   ④ THE ONE WRITER: a row's change is read by the very next read — the same asker object across the change
// A COUNTING COPY of src/grant-model.js is compiled into the require cache in the real one's place before anything loads it
// (its source, one counter per function head — no file is written); the store's lookups are counted on grants-store forDir.
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('grants-read-lookup');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); if (d !== undefined) console.log(`    ${typeof d === 'string' ? d : JSON.stringify(d).slice(0, 600)}`); } };

// ── the counting copy, in the real model's place ──
const C = globalThis.__gmCount = { normRow: 0, normEntry: 0, normExcept: 0, cleanName: 0, factsOf: 0, forDir: 0, reads: 0, accountReads: 0 };
{
  const GMP = path.join(REPO, 'src/grant-model.js');
  let src = fs.readFileSync(GMP, 'utf8');
  const inj = (re, add) => { const n0 = src.length; src = src.replace(re, add); if (src.length === n0) throw new Error('the counting copy did not take: ' + re); };
  inj(/function normRow\(r\) \{/, 'function normRow(r) { __gmCount.normRow++;');
  inj(/function normEntry\(([^)]*)\) \{/, (m) => m + ' __gmCount.normEntry++;');
  inj(/function normExcept\(e\) \{/, 'function normExcept(e) { __gmCount.normExcept++;');
  inj(/const cleanName = \(s\) => \(/, 'const cleanName = (s) => (__gmCount.cleanName++, 0) || (');
  inj(/function factsOf\(f = \{\}\) \{/, 'function factsOf(f = {}) { __gmCount.factsOf++;');
  const m = new Module(GMP, null); m.filename = GMP; m.paths = Module._nodeModulePaths(path.dirname(GMP));
  m._compile(src, GMP); m.loaded = true; require.cache[GMP] = m;
}
const GM = require(path.join(REPO, 'src/grant-model.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
{ const f0 = GS.forDir; GS.forDir = (...a) => { C.forDir++; return f0(...a); }; }
const CGM = require(path.join(REPO, 'src/server/channels-grants.js'));
{ const c0 = CGM.create; CGM.create = (...x) => { const o = c0(...x); const f = o.conversationGrants, g = o.accountGrants; o.conversationGrants = (...y) => { C.reads++; return f.apply(o, y); }; o.accountGrants = (...y) => { C.accountReads++; return g.apply(o, y); }; return o; }; }
const ACL = require(path.join(REPO, 'src/channel-acl.js'));
const FLT = require(path.join(REPO, 'src/channel-filter.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const snap = () => ({ ...C });
const delta = (a) => Object.fromEntries(Object.keys(C).map((k) => [k, C[k] - a[k]]));
const normsOf = (d) => d.normRow + d.normEntry + d.normExcept + d.cleanName;
const T = Date.parse('2026-11-16T12:00:00Z');
const quiet = { info() { }, warn() { }, error() { }, log() { }, debug() { } };

/** ONE world: the real channels engine over FAKE accounts (no vendor), the real grants store on a scratch dir. `accounts` =
 *  per account its conversations `[{id, title, kind}]` (or a count); `rows` = grants store rows; `rules` = `{id, acct, title}`. */
async function world(name, { accounts, rows = [], rules = [], sessions = [] }) {
  const dataDir = path.join(ROOT, name);
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = () => ({ unref() { }, ref() { }, [Symbol.toPrimitive]: () => 0 });
  let eng;
  try { eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => { }, now: () => T, log: quiet, censusTimer: () => ({ cancel() { } }), liveSessions: () => sessions }); }
  finally { globalThis.setInterval = realSetInterval; }
  const ix = eng.store.index;
  let recs = eng.adapterRecords().adapters.filter((r) => r.enabled !== false && r.kind !== 'agents');
  await eng.store.adapters.update(() => {
    const live = eng.store.adapters.live().adapters, base = live.find((r) => r.kind === 'fake-poll');
    for (let i = recs.length; i < accounts.length; i++) live.push({ ...JSON.parse(JSON.stringify(base)), id: `fake-poll-${i}`, label: `scratch ${i}` });
  });
  recs = eng.adapterRecords().adapters.filter((r) => r.enabled !== false && r.kind !== 'agents').slice(0, accounts.length);
  await ix.update((x) => {
    accounts.forEach((spec, ai) => {
      const list = Array.isArray(spec) ? spec : Array.from({ length: spec }, (_, i) => ({ id: `c${String(i).padStart(6, '0')}`, title: `[ops-${i % 97}] thread ${i}`, kind: i % 3 ? 'group' : 'dm' }));
      list.forEach((c, i) => Object.assign(ix.entry(recs[ai].id, c.id), { title: c.title, kind: c.kind, lastAt: c.lastAt != null ? c.lastAt : T - i * 1000, unread: 0, listedAt: T - i * 1000, convCaps: { at: T, read: 'yes', sendAs: [], why: null } }));
    });
    const pa = x.patternAssignments || (x.patternAssignments = {});
    for (const r of rules) pa[r.id] = { id: r.id, adapterId: recs[r.acct].id, pattern: { match: 'any', rules: [{ kind: 'title', value: r.title }] } };
  });
  const G = GS.forDir(dataDir);
  for (const r of rows) { const w = G.set(r.door || 'channel-reach', typeof r.resource === 'function' ? r.resource(recs) : r.resource, r.lists, 'user'); if (!w || w.ok === false) throw new Error(`seed refused (${name}): ` + JSON.stringify(w).slice(0, 200)); }
  return { eng, ix, recs, G, dataDir, CG: CGM.create({ dataDir }) };
}
const agent = (id, groups = []) => ({ kind: 'agent', id, name: null, groups, msgLevelFor: () => 'none' });

// ═══ ① COUNTS AT THE OWNER'S SIZE ═══════════════════════════════════════════
console.log('— ① the prompt hook\'s reach count and an agent\'s list at the owner\'s size: grant reads per walk, normalisations, store lookups');
const SIZES = [173306, 20674, 1887, 747, 234, 146, 116, 0];
const SESSIONS = Array.from({ length: 41 }, (_, i) => ({ cid: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`, groups: [`T-grp${i % 3}`] }));
const W1 = await world('real', {
  accounts: SIZES, sessions: SESSIONS,
  rules: Array.from({ length: 10 }, (_, r) => ({ id: `pat${r}`, acct: r % 8, title: `ops-${r}` })),
  rows: [
    ...SIZES.map((_, ai) => ({ resource: (recs) => `account:${recs[ai].id}`, lists: { to: [{ kind: 'group', id: `T-grp${ai % 3}`, name: `Team ${ai}` }, ...(ai % 2 ? [{ kind: 'conversation', key: SESSIONS[ai].cid, name: `agent ${ai}` }] : [])] } })),
    { resource: (recs) => `conversation:${recs[0].id}/c000007`, lists: { to: [{ kind: 'conversation', key: SESSIONS[5].cid, name: 'agent five' }, { kind: 'group', id: 'T-grp1', name: 'Team one' }] } },
    { resource: (recs) => `conversation:${recs[0].id}/c000014`, lists: { to: [{ kind: 'conversation', key: SESSIONS[6].cid, name: 'agent six' }] } },
  ],
});
const N = SIZES.reduce((x, y) => x + y, 0);
const OWN = 2;   // conversations a reach row of their own names
{
  let a = snap(); const ans = W1.eng.reachCountFor(agent('dddddddd-0000-4000-8000-000000000099', ['T-none'])); const d = delta(a);
  ok(ans === 'request' && d.reads <= OWN, `① the hook's reach count, an agent that reads nothing: ${d.reads} grant reads of ${N} conversations (≤ ${OWN}: the conversations a row of their own names; d7f42cc21 read every one) — answer «${ans}»`, d);
  ok(d.forDir <= 1, `① …and ${d.forDir} store lookup(s) in that walk (the door keeps the store it resolved; d7f42cc21: 5.1 per read — path.resolve each)`, d);
  a = snap(); const ans2 = W1.eng.reachCountFor(agent('dddddddd-0000-4000-8000-000000000098', ['T-none'])); const d2 = delta(a);
  ok(ans2 === ans && normsOf(d2) === 0 && d2.factsOf <= 1 && d2.reads <= OWN, `① the same walk again, nothing changed: ${normsOf(d2)} normalisations (normRow ${d2.normRow} · normEntry ${d2.normEntry} · cleanName ${d2.cleanName}), ${d2.factsOf} facts normalised (one asker) — a read is a lookup (d7f42cc21: 12.7 a read)`, d2);
  a = snap(); const l1 = W1.eng.listFor(agent('dddddddd-0000-4000-8000-000000000097', ['T-none'])); const d3 = delta(a);
  ok(l1 && l1.ok && l1.conversations.length === 0 && d3.reads <= OWN && normsOf(d3) === 0 && d3.forDir <= 1, `① an agent's list, an agent that reads nothing: ${d3.reads} grant reads, ${normsOf(d3)} normalisations, ${d3.forDir} store lookups over ${N} conversations`, d3);
  const big = agent('dddddddd-0000-4000-8000-000000000096', ['T-grp0']);
  const LIST_MAX = 200;
  a = snap(); const l2 = W1.eng.listFor(big); const d4 = delta(a);
  ok(l2 && l2.ok && l2.conversations.length === LIST_MAX && l2.more > 0 && d4.reads <= 2 * LIST_MAX + OWN, `① an agent's list, granted the largest account (${SIZES[0]} conversations): ${l2 && l2.conversations.length} listed, ${l2 && l2.more} more — ${d4.reads} grant reads (≤ the listed rows' own reads: 2 × ${LIST_MAX} + ${OWN}; d7f42cc21 read every conversation)`, d4);
  // ② a list sorts what it lists, never every candidate
  const sort0 = Array.prototype.sort; let largest = 0;
  Array.prototype.sort = function (...x) { if (this.length > largest) largest = this.length; return sort0.apply(this, x); };
  let l3; a = snap(); try { l3 = W1.eng.listFor(big); } finally { Array.prototype.sort = sort0; } const d5 = delta(a);
  ok(normsOf(d5) === 0 && d5.factsOf <= 2, `① that list again, nothing changed: ${normsOf(d5)} normalisations over its ${LIST_MAX} listed rows (their own access rows are judged by lookups too — channel-filter rowNames)`, d5);
  ok(largest <= 2 * LIST_MAX && JSON.stringify(l3.conversations.map((c) => c.key)) === JSON.stringify(l2.conversations.map((c) => c.key)), `② L3: that list's largest sort is ${largest} rows (≤ 2 × ${LIST_MAX}: the newest of each kind selected — d7f42cc21 sorted all ${SIZES[0]} candidates), the same rows in the same order`, { largest });
  // ② an async walk gives the loop back every WALK_STEP conversations scanned (the store's own search is answered empty
  // here — its existence pass is another chain; this counts the walk's yields)
  const ss0 = W1.eng.store.search; W1.eng.store.search = async () => ({ results: [], coverage: { scanned: 0 }, truncated: false });
  const si0 = globalThis.setImmediate; let yields = 0;
  globalThis.setImmediate = (...x) => { yields++; return si0(...x); };
  let sv; try { sv = await W1.eng.searchFor(agent('dddddddd-0000-4000-8000-000000000095', ['T-none']), 'thread', { limit: 50, adapterId: W1.recs[0].id }); } finally { globalThis.setImmediate = si0; W1.eng.store.search = ss0; }
  const scanned = N;   // one account's pass reads the whole index (by key: no per-account table)
  ok(sv && sv.ok && yields >= Math.floor(scanned / 50000), `② L3: an agent's search gave the loop back ${yields} times over ${scanned} conversations scanned (one per 50 000 — d7f42cc21: none, one turn of seconds)`, { yields, scanned });
}

// ═══ ③ PARITY: the old way, kept here as the oracle ═════════════════════════
console.log('— ③ parity: the judge and the engine answer as d7f42cc21 did, for every row shape × every asker (the old way kept in this suite)');
// d7f42cc21 src/channel-acl.js principalApplies / effective — a one-entry row per grant per check, asked of GM.admits raw
function oldApplies(ctx, grant) {
  const p = grant && grant.principal;
  if (!p || !ctx || ctx.kind !== 'agent' || !ctx.id) return false;
  const e = GM.fromChannelPrincipal(p);
  if (!e) return false;
  return GM.admits([{ door: 'channel-reach', resource: '-', to: [e], except: Array.isArray(grant.except) ? grant.except : [] }], { conversationKey: String(ctx.id), groupIds: Array.isArray(ctx.groups) ? ctx.groups : [] }).ok;
}
const NORM_LEVEL = (v) => (ACL.RANK[v] !== undefined ? v : 'hidden');   // d7f42cc21 channel-acl normLevel
function oldEffective(ctx, target, grants) {
  let level = 'hidden', via = 'default', winner = null;
  for (const g of Array.isArray(grants) ? grants : []) {
    if (!g || !oldApplies(ctx, g) || !ACL.scopeApplies(g.scope, target)) continue;
    const lv = NORM_LEVEL(g.level);
    if (winner === null || ACL.RANK[lv] > ACL.RANK[level]) { level = ACL.widen(level, lv); via = g.principal.kind === 'agent' ? 'agent' : g.principal.kind === 'everyone' ? 'everyone' : 'group'; winner = g; }
  }
  return { level, via, grantId: winner ? ACL.grantId(winner) : null };
}
// d7f42cc21 src/server/channels-access.js grantsOfConversation / reachFor (channel-acl accounts) — every conversation read
const convFacts = (en) => ({ title: (en && en.title) || '', participants: (en && en.participants) || '', kind: (en && en.kind) || '', authors: (en && Array.isArray(en.authors)) ? en.authors : [] });
function oldReach(Wx, ctx, en) {
  const pats = Object.values(Wx.ix.table('patternAssignments') || {}).filter((p) => p && p.adapterId === en.adapterId);
  const derived = [];
  for (const pa of pats) if (pa && pa.pattern && FLT.matchConversation(pa.pattern, convFacts(en)).hit) derived.push(...Wx.CG.ruleGrants(pa.id, en.key));
  const target = { key: en.key, adapterId: en.adapterId };
  return oldEffective(ctx, target, ACL.grantsForConversation(target, { entries: Wx.CG.conversationGrants(en.key), accountGrants: Wx.CG.accountGrants(en.adapterId), patternGrants: derived }));
}
function oldCount(Wx, ctx) {   // d7f42cc21 reachCountFor
  let request = false;
  const live = Wx.ix.live(), recs = new Map(Wx.recs.map((r) => [r.id, r]));
  for (const k in live) {
    const en = live[k], rec = en && recs.get(en.adapterId);
    if (!rec) continue;
    const lv = oldReach(Wx, ctx, en).level;
    if (ACL.canSee(lv)) return 'read';
    if (!request && (ACL.canRequest(lv) || ACL.directoryListable(ACL.directoryOf(rec), en.kind))) request = true;
  }
  return request ? 'request' : null;
}
function oldList(Wx, ctx) {    // d7f42cc21 listFor({all:true})'s rows: (key, level, directory), newest first, ties in walk order
  const cand = [];
  for (const en of Object.values(Wx.ix.live())) {
    const rec = Wx.recs.find((r) => r.id === en.adapterId);
    if (!rec) continue;
    const lv = oldReach(Wx, ctx, en).level;
    if (lv === 'hidden' && !ACL.directoryListable(ACL.directoryOf(rec), en.kind)) continue;
    cand.push({ en, lv });
  }
  cand.sort((a, b) => (b.en.lastAt || 0) - (a.en.lastAt || 0));
  return cand.map(({ en, lv }) => `${en.adapterId}/${en.id}:${lv === 'hidden' ? 'requestable(directory)' : lv}`);
}
const P = (n) => ({ id: `c-${n}`, title: n, kind: n.startsWith('dm') ? 'dm' : 'group' });
const W3 = await world('parity', {
  accounts: [
    [P('alpha-1'), P('alpha-2'), P('beta-1'), P('dm-1'), P('plain-1'), P('plain-2'), { ...P('tie-a'), lastAt: T - 5000 }, { ...P('tie-b'), lastAt: T - 5000 }],
    [P('alpha-3'), P('gamma-1'), P('dm-2'), P('plain-3'), P('own-row'), P('requested')],
    [P('plain-4'), P('dm-3'), P('beta-2')],
  ],
  rules: [{ id: 'r-alpha', acct: 0, title: 'alpha' }, { id: 'r-beta', acct: 2, title: 'beta' }, { id: 'r-gamma', acct: 1, title: 'gamma' }],
  rows: [
    // account 0: a group + a named conversation, the group's member «g1-out» left out
    { resource: (r) => `account:${r[0].id}`, lists: { to: [{ kind: 'group', id: 'G1', name: 'Group one' }, { kind: 'conversation', key: 'ask-named', name: 'named' }], except: [{ kind: 'conversation', key: 'g1-out', name: 'left out' }] } },
    // account 1: everyone, group G2 left out
    { resource: (r) => `account:${r[1].id}`, lists: { to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'G2', name: 'Group two' }] } },
    // account 1's conversations: an own access row, the owner's requestable row, an approved request
    { resource: (r) => `conversation:${r[1].id}/c-own-row`, lists: { to: [{ kind: 'conversation', key: 'ask-own', name: 'own' }, { kind: 'group', id: 'G2', name: 'Group two' }] } },
    { resource: (r) => `conversation:${r[1].id}/c-own-row#user`, lists: { to: [{ kind: 'group', id: 'G3', name: 'Group three', level: 'requestable' }] } },
    { resource: (r) => `conversation:${r[1].id}/c-requested#request`, lists: { to: [{ kind: 'conversation', key: 'ask-req', name: 'asked' }] } },
    // rules: alpha (account 0) → G4; beta (account 2) → a named conversation, with G5's member left out of nothing (no except)
    { resource: 'rule:r-alpha', lists: { to: [{ kind: 'group', id: 'G4', name: 'Group four' }], except: [{ kind: 'conversation', key: 'g4-out', name: 'g4 out' }] } },
    { resource: 'rule:r-beta', lists: { to: [{ kind: 'conversation', key: 'ask-beta', name: 'beta' }] } },
  ],
});
const ASKERS = [agent('ask-named'), agent('g1-in', ['G1']), agent('g1-out', ['G1']), agent('g2-in', ['G2']), agent('nobody'), agent('ask-own'), agent('g3-in', ['G3']), agent('ask-req'),
  agent('g4-in', ['G4']), agent('g4-out', ['G4']), agent('ask-beta'), agent('many', ['G1', 'G2', 'G3', 'G4']), agent('g1g2', ['G1', 'G2'])];
{
  // the JUDGE: every grant the door hands out × every asker — cold, then warm (prepared), and after a fresh asker object
  const grants = [];
  for (const rec of W3.recs) { grants.push(...W3.CG.accountGrants(rec.id)); for (const en of Object.values(W3.ix.live()).filter((e) => e.adapterId === rec.id)) { grants.push(...W3.CG.conversationGrants(en.key)); for (const pid of ['r-alpha', 'r-beta', 'r-gamma']) grants.push(...W3.CG.ruleGrants(pid, en.key)); } }
  const bad = [];
  for (const g of grants) for (const c of ASKERS) for (const round of [0, 1]) { const ctx = round ? { ...c } : c; const o = oldApplies(ctx, g), n = ACL.principalApplies(ctx, g); if (o !== n) bad.push(`${c.id}/${g.origin}/${g.principal.kind}:${g.principal.id} old ${o} new ${n}`); }
  ok(grants.length >= 12 && !bad.length, `③ the judge: ${grants.length} grants × ${ASKERS.length} askers × cold + warm — principalApplies answers as d7f42cc21's did in every case`, bad.slice(0, 6));
  // the ENGINE: per conversation (reachFor — its whole answer), the hook's count, the list --all rows and order
  const live = Object.values(W3.ix.live()).filter((e) => W3.recs.some((r) => r.id === e.adapterId));
  const badS = [], badC = [], badL = [];
  for (const c of ASKERS) {
    for (const en of live) { const rec = W3.recs.find((r) => r.id === en.adapterId); const o = JSON.stringify(oldReach(W3, c, en)), n = JSON.stringify(W3.eng.reachFor(c, rec, en)); if (o !== n) badS.push(`${c.id}@${en.key}: old ${o} new ${n}`); }
    const oc = oldCount(W3, c), nc = W3.eng.reachCountFor(c); if (oc !== nc) badC.push(`${c.id}: old ${oc} new ${nc}`);
    const ol = oldList(W3, c), nl = (W3.eng.listFor(c, { all: true }).conversations || []).map((x) => `${x.adapterId}/${x.id}:${x.directory ? 'requestable(directory)' : x.level}`);
    if (JSON.stringify(ol) !== JSON.stringify(nl)) badL.push(`${c.id}: old ${ol.length} ${ol.slice(0, 3)} new ${nl.length} ${nl.slice(0, 3)}`);
  }
  ok(live.length === 17 && !badS.length, `③ every conversation × every asker (${live.length} × ${ASKERS.length}): its reach — level, via and the deciding grant — as d7f42cc21 answered (own rows, account rows with a member or a group left out, everyone, rules with and without a row, no row)`, badS.slice(0, 6));
  ok(!badC.length, `③ the hook's reach count per asker: «read» / «request» / none as d7f42cc21 answered (${ASKERS.map((c) => W3.eng.reachCountFor(c) || '-').join(' ')})`, badC);
  ok(!badL.length, '③ list --all per asker: the same rows, levels and order as d7f42cc21 (newest first, a tie in walk order)', badL.slice(0, 4));
}

// ═══ ④ THE ONE WRITER: a row's change is read by the next read ═════════════════
console.log('— ④ the one writer: every change of a row is read by the very next read (the same asker object across the change)');
{
  // its own world: no row at all to begin with (the parity world's «everyone» row would read for any asker)
  const W4 = await world('writer', { accounts: [[P('w-1'), P('w-2'), P('dm-w'), P('beta-w')]], rules: [{ id: 'r-beta-w', acct: 0, title: 'beta' }] });
  const cw = agent('ask-w', ['GW']);
  const acct = W4.recs[0].id;
  const sees = (cid) => ACL.canSee(W4.eng.reachFor(cw, W4.recs[0], W4.ix.live()[`${acct}/${cid}`]).level);
  const r0 = W4.eng.reachCountFor(cw), s0 = sees('c-w-1');
  W4.G.set('channel-reach', `account:${acct}`, { to: [{ kind: 'group', id: 'GW', name: 'Group W' }] }, 'user');
  const r1 = W4.eng.reachCountFor(cw), s1 = sees('c-w-1');
  W4.G.remove('channel-reach', `account:${acct}`, 'user');
  const r2 = W4.eng.reachCountFor(cw), s2 = sees('c-w-1');
  ok(r0 !== 'read' && !s0 && r1 === 'read' && s1 && r2 === r0 && !s2, `④ an account row granted to the asker's group: read at the very next ask, and gone at the next ask after its removal (${r0} → ${r1} → ${r2})`, { r0, s0, r1, s1, r2, s2 });
  W4.G.set('channel-reach', `conversation:${acct}/c-dm-w`, { to: [{ kind: 'conversation', key: 'ask-w', name: 'w' }] }, 'user');
  const o1 = sees('c-dm-w'), o2 = sees('c-w-1'), rc = W4.eng.reachCountFor(cw);
  W4.G.set('channel-reach', 'rule:r-beta-w', { to: [{ kind: 'group', id: 'GW', name: 'Group W' }] }, 'user');
  const b1 = sees('c-beta-w'), b2 = sees('c-w-2');
  W4.G.set('channel-reach', `conversation:${acct}/c-dm-w`, { to: [] }, 'user');
  const o3 = sees('c-dm-w');
  ok(o1 && !o2 && rc === 'read' && b1 && !b2 && !o3, '④ a conversation row of its own, then a rule\'s row, then that conversation row emptied: the conversation it names and the one the rule matches read at once — no other — and the emptied row reads nothing at once', { o1, o2, rc, b1, b2, o3 });
  const askers4 = [cw, agent('other', ['GX']), agent('nobody-4')];
  const all = askers4.every((c) => Object.values(W4.ix.live()).every((en) => JSON.stringify(oldReach(W4, c, en)) === JSON.stringify(W4.eng.reachFor(c, W4.recs[0], en))));
  const counts = askers4.map((c) => [oldCount(W4, c), W4.eng.reachCountFor(c)]);
  ok(all && counts.every(([o, n]) => o === n) && counts.some(([o]) => o !== 'read'), `④ after the writes, every asker × every conversation answers as the old way reads the same rows, and the hook's count per asker too (${counts.map(([, n]) => n || '-').join(' ')})`, counts);
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? ' passed, ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// test-grants-read-lookup — A CHANNEL GRANT READ IS A LOOKUP (lane grants-read-is-a-lookup, 主开发 2026-11-16 18:33Z; the cure
// round 19:57Z). The owner's hub held its main loop ~420 s a day in ONE chain: the agent prompt hook's reach count
// (src/agent-routes.js channelsTaughtFor → channels-access reachCountFor) walked every channel conversation, each a grant read
// that re-normalised every grant it judged and asked the grants store's forDir (path.resolve) five times. A grant is the
// owner's boundary: the verdict is the same, and no change of a row is honoured later than before.
//   ① COUNTS, never a clock, at the owner's order of sizes — every id and title invented: about two hundred thousand channel
//     conversations on a handful of accounts, about ten reach rows (account grains and two conversation grains, no except),
//     ten rules, a few dozen sessions (70efb5e10: one read a conversation, millions of normalisations and store lookups a walk) — a COUNTING COPY of src/grant-model.js is
//     compiled into the require cache in the real one's place (its source, one counter per function head; no file written)
//   ② L3 (docs/kb-design-lessons.md §19): an async walk gives the loop back every 50 000 conversations scanned (a count); a
//     list sorts what it lists, never every candidate
//   ③ PARITY with THE OLD CODE ITSELF: the six files this unit changes, FROZEN from 70efb5e10 under
//     scripts/fixtures/grants-read-lookup/base/, loaded in a module graph of their own (the old engine whole) over a copy of
//     each world's data dir — the judge, every conversation's reach, the hook's count and list --all, on a store WITH rule
//     rows and on the owner's path (no rule row; «read», «request» and none; a list cut above 200 inside ties)
//   ④ THE ONE WRITER: a row's change is read by the very next read; after the writes, the old engine's answers
//   ⑤ A WALK KEEPS NOTHING ACROSS A CHANGE OF THE ROWS: a row granted inside a search's await and one revoked inside its
//     give-back — the search's store calls equal the old engine's
// The mutants of this unit were run BY HAND from the lane (grants-read-is-a-lookup/scripts/mut.sh, logs/mut*.txt), not here.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Module, { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('grants-read-lookup');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); if (d !== undefined) console.log(`    ${typeof d === 'string' ? d : JSON.stringify(d).slice(0, 600)}`); } };

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
 *  per account its conversations `[{id, title, kind, lastAt?}]` (or a count); `rows` = grants store rows; `rules` = `{id, acct,
 *  title}`; `interleave` = the index holds the accounts' conversations in turn; `directories` = an account's directory switches. */
async function world(name, { accounts, rows = [], rules = [], sessions = [], interleave = false, directories = {} }) {
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
  if (Object.keys(directories).length) await eng.store.adapters.update(() => { for (const [ai, dir] of Object.entries(directories)) eng.store.adapters.live().adapters.find((r) => r.id === recs[ai].id).agentDirectory = dir; });
  const lists = accounts.map((spec) => (Array.isArray(spec) ? spec : Array.from({ length: spec }, (_, i) => ({ id: `c${String(i).padStart(6, '0')}`, title: `[ops-${i % 97}] thread ${i}`, kind: i % 3 ? 'group' : 'dm' }))));
  await ix.update((x) => {
    const put = (ai, c, i) => Object.assign(ix.entry(recs[ai].id, c.id), { title: c.title, kind: c.kind, lastAt: c.lastAt != null ? c.lastAt : T - i * 1000, unread: 0, listedAt: T - i * 1000, convCaps: { at: T, read: 'yes', sendAs: [], why: null } });
    if (interleave) { const most = Math.max(...lists.map((l) => l.length)); for (let i = 0; i < most; i++) lists.forEach((l, ai) => { if (i < l.length) put(ai, l[i], i); }); }
    else lists.forEach((l, ai) => l.forEach((c, i) => put(ai, c, i)));
    const pa = x.patternAssignments || (x.patternAssignments = {});
    for (const r of rules) pa[r.id] = { id: r.id, adapterId: recs[r.acct].id, pattern: { match: 'any', rules: [{ kind: 'title', value: r.title }] } };
  });
  const G = GS.forDir(dataDir);
  for (const r of rows) { const w = G.set(r.door || 'channel-reach', typeof r.resource === 'function' ? r.resource(recs) : r.resource, r.lists, 'user'); if (!w || w.ok === false) throw new Error(`seed refused (${name}): ` + JSON.stringify(w).slice(0, 200)); }
  return { eng, ix, recs, G, dataDir, sessions, store: eng.store, CG: CGM.create({ dataDir }) };
}
const agent = (id, groups = []) => ({ kind: 'agent', id, name: null, groups, msgLevelFor: () => 'none' });

// ═══ ① COUNTS AT THE OWNER'S SIZE ═══════════════════════════════════════════
console.log('— ① the prompt hook\'s reach count and an agent\'s list at the owner\'s size: grant reads per walk, normalisations, store lookups');
const SIZES = [170000, 20000, 2000, 750, 250, 150, 100, 0];   // the owner's order of sizes (B-360d r1379: no count of the owner's in the tree)
const SESSIONS = Array.from({ length: 40 }, (_, i) => ({ cid: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`, groups: [`T-grp${i % 3}`] }));
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
  ok(ans === 'request' && d.reads <= OWN, `① the hook's reach count, an agent that reads nothing: ${d.reads} grant reads of ${N} conversations (≤ ${OWN}: the conversations a row of their own names; 70efb5e10 read every one) — answer «${ans}»`, d);
  ok(d.forDir <= 1, `① …and ${d.forDir} store lookup(s) in that walk (the door keeps the store it resolved; 70efb5e10: 5.1 per read — path.resolve each)`, d);
  a = snap(); const ans2 = W1.eng.reachCountFor(agent('dddddddd-0000-4000-8000-000000000098', ['T-none'])); const d2 = delta(a);
  ok(ans2 === ans && normsOf(d2) === 0 && d2.factsOf <= 1 && d2.reads <= OWN, `① the same walk again, nothing changed: ${normsOf(d2)} normalisations (normRow ${d2.normRow} · normEntry ${d2.normEntry} · cleanName ${d2.cleanName}), ${d2.factsOf} facts normalised (one asker) — a read is a lookup (70efb5e10: 12.7 a read)`, d2);
  a = snap(); const l1 = W1.eng.listFor(agent('dddddddd-0000-4000-8000-000000000097', ['T-none'])); const d3 = delta(a);
  ok(gateOf(l1) && gateOf(l1.ok) && l1.conversations.length === 0 && d3.reads <= OWN && normsOf(d3) === 0 && d3.forDir <= 1, `① an agent's list, an agent that reads nothing: ${d3.reads} grant reads, ${normsOf(d3)} normalisations, ${d3.forDir} store lookups over ${N} conversations`, d3);
  const big = agent('dddddddd-0000-4000-8000-000000000096', ['T-grp0']);
  const LIST_MAX = 200;
  a = snap(); const l2 = W1.eng.listFor(big); const d4 = delta(a);
  ok(gateOf(l2) && gateOf(l2.ok) && l2.conversations.length === LIST_MAX && l2.more > 0 && d4.reads <= 2 * LIST_MAX + OWN, `① an agent's list, granted the largest account (${SIZES[0]} conversations): ${l2 && l2.conversations.length} listed, ${l2 && l2.more} more — ${d4.reads} grant reads (≤ the listed rows' own reads: 2 × ${LIST_MAX} + ${OWN}; 70efb5e10 read every conversation)`, d4);
  // ② a list sorts what it lists, never every candidate
  const sort0 = Array.prototype.sort; let largest = 0;
  Array.prototype.sort = function (...x) { if (this.length > largest) largest = this.length; return sort0.apply(this, x); };
  let l3; a = snap(); try { l3 = W1.eng.listFor(big); } finally { Array.prototype.sort = sort0; } const d5 = delta(a);
  ok(normsOf(d5) === 0 && d5.factsOf <= 2, `① that list again, nothing changed: ${normsOf(d5)} normalisations over its ${LIST_MAX} listed rows (their own access rows are judged by lookups too — channel-filter rowNames)`, d5);
  ok(largest <= 2 * LIST_MAX && JSON.stringify(l3.conversations.map((c) => c.key)) === JSON.stringify(l2.conversations.map((c) => c.key)), `② L3: that list's largest sort is ${largest} rows (≤ 2 × ${LIST_MAX}: the newest of each kind selected — 70efb5e10 sorted all ${SIZES[0]} candidates), the same rows in the same order`, { largest });
  // ② an async walk gives the loop back every WALK_STEP conversations scanned (the store's own search is answered empty
  // here — its existence pass is another chain; this counts the walk's yields)
  const ss0 = W1.eng.store.search; W1.eng.store.search = async () => ({ results: [], coverage: { scanned: 0 }, truncated: false });
  const si0 = globalThis.setImmediate; let yields = 0;
  globalThis.setImmediate = (...x) => { yields++; return si0(...x); };
  let sv; try { sv = await W1.eng.searchFor(agent('dddddddd-0000-4000-8000-000000000095', ['T-none']), 'thread', { limit: 50, adapterId: W1.recs[0].id }); } finally { globalThis.setImmediate = si0; W1.eng.store.search = ss0; }
  const scanned = N;   // one account's pass reads the whole index (by key: no per-account table)
  ok(gateOf(sv) && gateOf(sv.ok) && yields >= Math.floor(scanned / 50000), `② L3: an agent's search gave the loop back ${yields} times over ${scanned} conversations scanned (one per 50 000 — 70efb5e10: none, one turn of seconds)`, { yields, scanned });
}

// ═══ THE ORACLE: 70efb5e10's code itself ════════════════════════════════════
// The six files this unit changes, FROZEN as they were at the release 2.369.405 (70efb5e10) under
// scripts/fixtures/grants-read-lookup/base/<path>.frozen — never read through git at run time (the hosted mirror is a shallow
// clone; verbatim but for three words inside comments, made neutral for the repo's pronoun gate) — and loaded in a MODULE GRAPH OF THEIR OWN: every project module the old engine reaches is compiled afresh for it,
// those six from the frozen copies, the rest from the tree as it stands. The oracle answers only through that graph — the old
// channel-acl's judge, the old engine's reachFor / reachCountFor / listFor / searchFor over a COPY of a world's data dir.
const FIX = path.join(REPO, 'scripts/fixtures/grants-read-lookup/base');
const SIX = ['src/grant-model.js', 'src/channel-acl.js', 'src/channel-filter.js', 'src/server/grants-store.js', 'src/server/channels-grants.js', 'src/server/channels-access.js'];
function oracleGraph() {
  const FROZEN = new Map(SIX.map((rel) => [path.join(REPO, rel), path.join(FIX, rel + '.frozen')]));
  for (const f of FROZEN.values()) if (!fs.existsSync(f)) throw new Error('the frozen base copy is missing: ' + f);
  const cache = new Map();
  const fileOf = (base, spec) => { const p = path.resolve(base, spec); for (const c of [p, p + '.js', p + '.json', path.join(p, 'index.js')]) { try { if (fs.statSync(c).isFile()) return c; } catch { } } return null; };
  const load = (abs) => {
    const hit = cache.get(abs); if (hit) return hit.exports;
    const m = { exports: {}, filename: abs, id: abs, loaded: false, children: [], paths: Module._nodeModulePaths(path.dirname(abs)) };
    cache.set(abs, m);
    if (abs.endsWith('.json')) { m.exports = JSON.parse(fs.readFileSync(abs, 'utf8')); return m.exports; }
    const real = createRequire(abs);
    const ours = (r) => r && r.startsWith(REPO + path.sep) && !r.includes(`${path.sep}node_modules${path.sep}`);
    const req = (spec) => { if (/^\.\.?\//.test(spec) || spec.startsWith('/')) { const r = fileOf(path.dirname(abs), spec); if (ours(r)) return load(r); } return real(spec); };
    req.resolve = (spec) => ((/^\.\.?\//.test(spec) || spec.startsWith('/')) ? fileOf(path.dirname(abs), spec) || real.resolve(spec) : real.resolve(spec));
    req.cache = {};
    let code = fs.readFileSync(FROZEN.get(abs) || abs, 'utf8');
    if (code.startsWith('#!')) code = '//' + code;
    vm.runInThisContext(Module.wrap(code), { filename: abs }).call(m.exports, m.exports, req, m, abs, path.dirname(abs));
    m.loaded = true;
    return m.exports;
  };
  return { load: (rel) => load(path.join(REPO, rel)), size: () => cache.size, frozen: (abs) => FROZEN.has(abs) && cache.has(abs) };
}
const ORACLE = oracleGraph();
const OACL = ORACLE.load('src/channel-acl.js');
const OENG = ORACLE.load('src/server/channels-engine.js');
const OGS = ORACLE.load('src/server/grants-store.js');
ok(gateOf(SIX.every((rel) => ORACLE.frozen(path.join(REPO, rel)))) && OACL !== ACL && OENG !== ENG && ORACLE.size() > 20, `the oracle: the old engine's graph (${ORACLE.size()} modules) holds all six frozen files of 70efb5e10 and shares no module with the tree's`);
let oseq = 0;
/** The old engine over a COPY of a world's data dir as it stands now (the index flushed first). */
function oracleOf(Wx) {
  Wx.ix.flush();
  const dir = path.join(ROOT, `${path.basename(Wx.dataDir)}-oracle-${++oseq}`);
  fs.cpSync(Wx.dataDir, dir, { recursive: true });
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = () => ({ unref() { }, ref() { }, [Symbol.toPrimitive]: () => 0 });
  let eng;
  try { eng = OENG.create({ dataDir: dir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => { }, now: () => T, log: quiet, censusTimer: () => ({ cancel() { } }), liveSessions: () => Wx.sessions }); }
  finally { globalThis.setInterval = realSetInterval; }
  const recs = eng.adapterRecords().adapters.filter((r) => r.enabled !== false && r.kind !== 'agents');
  return { eng, ix: eng.store.index, recs: Wx.recs.map((r) => recs.find((o) => o.id === r.id)), G: OGS.forDir(dir), dataDir: dir, store: eng.store };
}
/** Every conversation × every asker (its whole reach answer), the hook's count per asker, list --all per asker: tip vs oracle. */
function compareWorld(Wx, Ox, askers) {
  const live = Object.values(Wx.ix.live()).filter((e) => Wx.recs.some((r) => r.id === e.adapterId));
  const badR = [], badC = [], badL = [], counts = [];
  for (const mk of askers) {
    for (const en of live) {
      const o = JSON.stringify(Ox.eng.reachFor(mk(), Ox.recs.find((r) => r.id === en.adapterId), Ox.ix.live()[en.key]));
      const n = JSON.stringify(Wx.eng.reachFor(mk(), Wx.recs.find((r) => r.id === en.adapterId), en));
      if (o !== n) badR.push(`${mk().id}@${en.key}: old ${o} new ${n}`);
    }
    const oc = Ox.eng.reachCountFor(mk()), nc = Wx.eng.reachCountFor(mk()); counts.push(nc); if (oc !== nc) badC.push(`${mk().id}: old ${oc} new ${nc}`);
    const ol = JSON.stringify(Ox.eng.listFor(mk(), { all: true })), nl = JSON.stringify(Wx.eng.listFor(mk(), { all: true }));
    if (ol !== nl) badL.push(`${mk().id}: old ${ol.slice(0, 160)} … new ${nl.slice(0, 160)}`);
  }
  return { live: live.length, badR, badC, badL, counts };
}

// ═══ ③ PARITY — the old code itself as the oracle ═══════════════════════════
console.log('— ③ parity: the judge and the engine answer as 70efb5e10\'s own code answers (its frozen copy, its own module graph), for every row shape × every asker');
const P = (n, o = {}) => ({ id: `c-${n}`, title: n, kind: n.startsWith('dm') ? 'dm' : 'group', ...o });
{
  // (a) a store WITH rule rows (every walk takes the full read)
  const W3 = await world('parity-rules', {
    accounts: [
      [P('alpha-1'), P('alpha-2'), P('beta-1'), P('dm-1'), P('plain-1'), P('plain-2'), P('tie-a', { lastAt: T - 5000 }), P('tie-b', { lastAt: T - 5000 })],
      [P('alpha-3'), P('gamma-1'), P('dm-2'), P('plain-3'), P('own-row'), P('requested')],
      [P('plain-4'), P('dm-3'), P('beta-2')],
    ],
    rules: [{ id: 'r-alpha', acct: 0, title: 'alpha' }, { id: 'r-beta', acct: 2, title: 'beta' }, { id: 'r-gamma', acct: 1, title: 'gamma' }],
    rows: [
      { resource: (r) => `account:${r[0].id}`, lists: { to: [{ kind: 'group', id: 'G1', name: 'Group one' }, { kind: 'conversation', key: 'ask-named', name: 'named' }], except: [{ kind: 'conversation', key: 'g1-out', name: 'left out' }] } },
      { resource: (r) => `account:${r[1].id}`, lists: { to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'G2', name: 'Group two' }] } },
      { resource: (r) => `conversation:${r[1].id}/c-own-row`, lists: { to: [{ kind: 'conversation', key: 'ask-own', name: 'own' }, { kind: 'group', id: 'G2', name: 'Group two' }] } },
      { resource: (r) => `conversation:${r[1].id}/c-own-row#user`, lists: { to: [{ kind: 'group', id: 'G3', name: 'Group three', level: 'requestable' }] } },
      { resource: (r) => `conversation:${r[1].id}/c-requested#request`, lists: { to: [{ kind: 'conversation', key: 'ask-req', name: 'asked' }] } },
      { resource: 'rule:r-alpha', lists: { to: [{ kind: 'group', id: 'G4', name: 'Group four' }], except: [{ kind: 'conversation', key: 'g4-out', name: 'g4 out' }] } },
      { resource: 'rule:r-beta', lists: { to: [{ kind: 'conversation', key: 'ask-beta', name: 'beta' }] } },
    ],
  });
  const ASK3 = [['ask-named'], ['g1-in', ['G1']], ['g1-out', ['G1']], ['g2-in', ['G2']], ['nobody'], ['ask-own'], ['g3-in', ['G3']], ['ask-req'], ['g4-in', ['G4']], ['g4-out', ['G4']], ['ask-beta'], ['many', ['G1', 'G2', 'G3', 'G4']], ['g1g2', ['G1', 'G2']]].map(([id, g]) => () => agent(id, g || []));
  // the JUDGE: every grant the door hands out × every asker — the old channel-acl (frozen) against the tree's, cold and warm
  const grants = [];
  for (const rec of W3.recs) { grants.push(...W3.CG.accountGrants(rec.id)); for (const en of Object.values(W3.ix.live()).filter((e) => e.adapterId === rec.id)) { grants.push(...W3.CG.conversationGrants(en.key)); for (const pid of ['r-alpha', 'r-beta', 'r-gamma']) grants.push(...W3.CG.ruleGrants(pid, en.key)); } }
  const bad = [];
  for (const g of grants) for (const mk of ASK3) { const c = mk(); for (const ctx of [c, c, mk()]) { const o = OACL.principalApplies(ctx, g), n = ACL.principalApplies(ctx, g); if (o !== n) bad.push(`${ctx.id}/${g.origin}/${g.principal.kind}:${g.principal.id} old ${o} new ${n}`); } }
  ok(grants.length >= 12 && !bad.length, `③ the judge: ${grants.length} grants × ${ASK3.length} askers × (cold, warm, a fresh asker) — principalApplies answers as 70efb5e10's channel-acl does in every case`, bad.slice(0, 6));
  const O3 = oracleOf(W3), c3 = compareWorld(W3, O3, ASK3);
  ok(c3.live === 17 && !c3.badR.length && !c3.badC.length && !c3.badL.length, `③ a store WITH rule rows (every walk takes the full read): ${c3.live} conversations × ${ASK3.length} askers — every reach answer, the hook's count and list --all as 70efb5e10's engine answers`, [...c3.badR, ...c3.badC, ...c3.badL].slice(0, 6));
}
{
  // (b) THE OWNER'S PATH (主开发's G2): NO rule row — an account row with a group AND an except (a group left out, a conversation
  // left out), a conversation's own row, a requestable row, an approved request; askers inside, left out, nobody, directory-only;
  // a list cut ABOVE its 200 with ties AT the cut (readable and directory-listed)
  const tieAt = (i, lo, hi, base) => (i >= lo && i <= hi ? T - lo * 1000 : T - i * 1000 - base);
  const A = Array.from({ length: 260 }, (_, i) => ({ id: `a${String(i).padStart(4, '0')}`, title: `alpha ${i}`, kind: 'group', lastAt: tieAt(i, 185, 215, 0) }));
  const B = Array.from({ length: 280 }, (_, i) => ({ id: `b${String(i).padStart(4, '0')}`, title: `bravo ${i}`, kind: i % 7 === 0 ? 'dm' : 'group', lastAt: tieAt(i, 222, 251, 7) }));   // the tie spans the directory-listed rows 190–215 (a dm every 7th is never listed)
  const Cc = Array.from({ length: 12 }, (_, i) => ({ id: `c${String(i).padStart(4, '0')}`, title: `charlie ${i}`, kind: 'group' }));
  const W5 = await world('parity-owner', {
    accounts: [A, B, Cc], directories: { 0: { groups: false, singles: false }, 1: { groups: true, singles: false }, 2: { groups: false, singles: false } },
    rows: [
      { resource: (r) => `account:${r[0].id}`, lists: { to: [{ kind: 'group', id: 'GA', name: 'Group A' }, { kind: 'conversation', key: 'named-a', name: 'named' }], except: [{ kind: 'group', id: 'GX', name: 'Group X' }, { kind: 'conversation', key: 'out-a', name: 'left out' }] } },
      { resource: (r) => `account:${r[2].id}`, lists: { to: [{ kind: 'group', id: 'GC', name: 'Group C' }] } },
      { resource: (r) => `conversation:${r[1].id}/b0007`, lists: { to: [{ kind: 'conversation', key: 'own-b', name: 'own' }] } },
      { resource: (r) => `conversation:${r[1].id}/b0011#user`, lists: { to: [{ kind: 'group', id: 'GR', name: 'Group R', level: 'requestable' }] } },
      { resource: (r) => `conversation:${r[2].id}/c0003#request`, lists: { to: [{ kind: 'conversation', key: 'req-c', name: 'asked' }] } },
    ],
  });
  const ASK5 = [['in-ga', ['GA']], ['ga-gx', ['GA', 'GX']], ['out-a', ['GA']], ['named-a'], ['own-b'], ['gr', ['GR']], ['req-c'], ['nobody'], ['gc', ['GC']], ['many', ['GA', 'GC', 'GR']]].map(([id, g]) => () => agent(id, g || []));
  ok(W5.eng.reachCountFor !== undefined && !W5.CG.resourcesOf('channel-reach', 'rule:').length, '③ the owner\'s path: this store holds NO rule row (the account answer and the walk\'s fast branch are what is compared)');
  const O5 = oracleOf(W5), c5 = compareWorld(W5, O5, ASK5);
  const inGa = W5.eng.listFor(agent('in-ga', ['GA']), { all: true }), nob = W5.eng.listFor(agent('nobody'), { all: true });
  const cut = (l) => (l.conversations || []).filter((x) => !x.directory).length;
  ok(c5.live === 552 && !c5.badR.length, `③ the owner's path: ${c5.live} conversations × ${ASK5.length} askers — every reach answer (level, via, the deciding grant) as 70efb5e10's engine answers`, c5.badR.slice(0, 6));
  ok(!c5.badC.length && gateOf(c5.counts.includes('read')) && verdictOf(c5.counts.includes('request')), `③ the owner's path: the hook's count per asker as 70efb5e10's (${c5.counts.map((x) => x || '-').join(' ')})`, c5.badC);
  ok(!c5.badL.length && cut(inGa) === 200 && inGa.more === 60 && nob.moreRequestable > 0, `③ the owner's path: list --all per asker as 70efb5e10's — the readable cut at 200 of 260 inside a tie of 31 (more ${inGa.more}), the directory cut (more requestable ${nob.moreRequestable}) inside a tie of 30`, c5.badL.slice(0, 3));
  // (c) a store where an asker reaches NOTHING the directory lists either: the hook's count answers none
  const W5b = await world('parity-none', { accounts: [Array.from({ length: 10 }, (_, i) => ({ id: `z${i}`, title: `zulu ${i}`, kind: 'group' }))], directories: { 0: { groups: false, singles: false } },
    rows: [{ resource: (r) => `account:${r[0].id}`, lists: { to: [{ kind: 'group', id: 'GZ', name: 'Group Z' }] } }, { resource: (r) => `conversation:${r[0].id}/z3#user`, lists: { to: [{ kind: 'group', id: 'GQ', name: 'Group Q', level: 'requestable' }] } }] });
  const ASK5b = [['z-in', ['GZ']], ['nobody-z'], ['q', ['GQ']]].map(([id, g]) => () => agent(id, g || []));
  const O5b = oracleOf(W5b), c5b = compareWorld(W5b, O5b, ASK5b);
  ok(!c5b.badR.length && !c5b.badC.length && !c5b.badL.length && JSON.stringify(c5b.counts) === JSON.stringify(['read', null, 'request']), `③ the hook's count «read», none and «request» (${c5b.counts.map((x) => x || 'none').join(' / ')}), each as 70efb5e10's engine answers`, [...c5b.badR, ...c5b.badC, ...c5b.badL].slice(0, 4));
}

// ═══ ④ THE ONE WRITER: a row's change is read by the next read ═════════════════
console.log('— ④ the one writer: every change of a row is read by the very next read (the same asker object across the change)');
{
  const W4 = await world('writer', { accounts: [[P('w-1'), P('w-2'), P('dm-w'), P('beta-w')]], rules: [{ id: 'r-beta-w', acct: 0, title: 'beta' }] });
  const cw = agent('ask-w', ['GW']);
  const acct = W4.recs[0].id;
  const sees = (cid) => ACL.canSee(W4.eng.reachFor(cw, W4.recs[0], W4.ix.live()[`${acct}/${cid}`]).level);
  const r0 = W4.eng.reachCountFor(cw), s0 = sees('c-w-1');
  W4.G.set('channel-reach', `account:${acct}`, { to: [{ kind: 'group', id: 'GW', name: 'Group W' }] }, 'user');
  const r1 = W4.eng.reachCountFor(cw), s1 = sees('c-w-1');
  W4.G.remove('channel-reach', `account:${acct}`, 'user');
  const r2 = W4.eng.reachCountFor(cw), s2 = sees('c-w-1');
  ok(r0 !== 'read' && !s0 && r1 === 'read' && gateOf(s1) && r2 === r0 && !s2, `④ an account row granted to the asker's group: read at the very next ask, and gone at the next ask after its removal (${r0} → ${r1} → ${r2})`, { r0, s0, r1, s1, r2, s2 });
  W4.G.set('channel-reach', `conversation:${acct}/c-dm-w`, { to: [{ kind: 'conversation', key: 'ask-w', name: 'w' }] }, 'user');
  const o1 = sees('c-dm-w'), o2 = sees('c-w-1'), rc = W4.eng.reachCountFor(cw);
  W4.G.set('channel-reach', 'rule:r-beta-w', { to: [{ kind: 'group', id: 'GW', name: 'Group W' }] }, 'user');
  const b1 = sees('c-beta-w'), b2 = sees('c-w-2');
  W4.G.set('channel-reach', `conversation:${acct}/c-dm-w`, { to: [] }, 'user');
  const o3 = sees('c-dm-w');
  ok(gateOf(o1) && !o2 && rc === 'read' && gateOf(b1) && !b2 && !o3, '④ a conversation row of its own, then a rule\'s row, then that conversation row emptied: the conversation it names and the one the rule matches read at once — no other — and the emptied row reads nothing at once', { o1, o2, rc, b1, b2, o3 });
  const O4 = oracleOf(W4), c4 = compareWorld(W4, O4, [() => agent('ask-w', ['GW']), () => agent('other', ['GX']), () => agent('nobody-4')]);
  ok(!c4.badR.length && !c4.badC.length && !c4.badL.length, `④ after the writes, every asker × every conversation, the hook's count and list --all as 70efb5e10's engine answers over the same rows (${c4.counts.map((x) => x || '-').join(' ')})`, [...c4.badR, ...c4.badC, ...c4.badL].slice(0, 4));
}

// ═══ ⑤ A WALK KEEPS NOTHING ACROSS A CHANGE OF THE ROWS (主开发's G1) ═══════════
console.log('— ⑤ a search that awaits: a row granted INSIDE one of its awaits and a row revoked INSIDE one of its give-backs — the rest of that call answers as the rows stand (as 70efb5e10 does)');
{
  // A and B interleaved, C beside them; the asker reads B through B's account row and nothing in A or C; A's directory lists its
  // groups (the asker «knows» A: its existence search awaits). B-dfa4 cut 1: a walk reads and counts its OWN account's rows —
  // before, it gave the loop back every WALK_STEP rows of the whole map (A and B 26 000 each: B's pass at the map's 50 000th
  // row); now at B's own WALK_STEP-th row, so B holds more than WALK_STEP rows and A few (about the same map, 53 010 rows)
  const WALK = Number((/const WALK_STEP = (\d+);/.exec(fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf8')) || [])[1]);
  const nA = 2000, nB = WALK + 1000;
  const W6 = await world('walk-change', { interleave: true, accounts: [nA, nB, Array.from({ length: 10 }, (_, i) => ({ id: `k${String(i).padStart(4, '0')}`, title: `kilo ${i}`, kind: 'group' }))],
    rows: [{ resource: (r) => `account:${r[1].id}`, lists: { to: [{ kind: 'group', id: 'GB', name: 'Group B' }] } }] });
  const run = async (E) => {
    const [a, b, c] = E.recs.map((r) => r.id), calls = [];
    let phase = 'A', granted = false, revoked = false;
    const s0 = E.store.search;
    E.store.search = async (acct, q, o = {}) => {
      calls.push(`${acct}|${o.limit}|${(o.convIds || []).length}|${(o.convIds || []).slice().sort().join(',').length}|${(o.convIds || []).includes('k0004')}`);
      if (acct === a && !granted) { granted = true; phase = 'B'; E.G.set('channel-reach', `conversation:${c}/k0004`, { to: [{ kind: 'conversation', key: 'walker', name: 'w' }] }, 'user'); }
      return { results: [], coverage: { scanned: 0 }, truncated: false };
    };
    const si0 = globalThis.setImmediate;
    globalThis.setImmediate = (fn, ...x) => si0(() => { if (phase === 'B' && !revoked) { revoked = true; E.G.remove('channel-reach', `account:${b}`, 'user'); } fn(...x); });
    let r; try { r = await E.eng.searchFor(agent('walker', ['GB']), 'thread', { limit: 50 }); } finally { globalThis.setImmediate = si0; E.store.search = s0; }
    return { calls, granted, revoked, ok: r && r.ok };
  };
  // the rows before the call, as the old engine reads them (a copy now) — and after it (a copy then)
  const O6 = oracleOf(W6);
  const [ia, ib, ic] = W6.recs.map((r) => r.id);
  const order = Object.values(W6.ix.live());
  const bBefore = Math.min(order.filter((en) => en.adapterId === ib).length, WALK - 1);   // judged before B's first give-back (B's own rows 1 … WALK − 1)
  const before = ACL.canSee(O6.eng.reachFor(agent('walker', ['GB']), O6.recs[1], O6.ix.live()[order.find((en) => en.adapterId === ib).key]).level);
  const n = await run(W6), o = await run(O6);
  if (O6.G.rowsFor('channel-reach', `account:${ib}`).length) O6.G.remove('channel-reach', `account:${ib}`, 'user');   // the rows after: B's row revoked there too
  const callsOf = (x, acct) => x.calls.filter((c) => c.startsWith(`${acct}|`));
  const bVis = (x) => Number((callsOf(x, ib).find((c) => c.startsWith(`${ib}|200|`)) || '||0').split('|')[2]);
  const walker = () => agent('walker', ['GB']);
  const firstB = order.find((en) => en.adapterId === ib), lastB = [...order].reverse().find((en) => en.adapterId === ib);
  // (a) the grant written inside A's await: an await the old engine has too — every call for C is the old engine's
  ok(gateOf(n.granted) && gateOf(o.granted) && JSON.stringify(callsOf(n, ic)) === JSON.stringify(callsOf(o, ic)) && verdictOf(callsOf(o, ic).some((c) => c.startsWith(`${ic}|200|`) && c.endsWith('|true'))),
    '⑤ a row granted INSIDE A\'s await of the search: C\'s conversation it names is searched as readable in that same call — C\'s store calls are 70efb5e10\'s', { tip: callsOf(n, ic), base: callsOf(o, ic) });
  // (b) the row revoked inside B's first give-back (a give-back 70efb5e10's search does not have): the rest of B answers as the
  // rows stand — the old engine over the rows before reads B readable, over the rows after hidden; the call searched as readable
  // exactly B's conversations walked before the revoke
  const after = ACL.canSee(O6.eng.reachFor(walker(), O6.recs[1], O6.ix.live()[lastB.key]).level);
  ok(gateOf(n.revoked) && gateOf(before) && !after && bVis(n) === bBefore && bBefore > 0 && bBefore < nB && WALK > 0, `⑤ a row revoked INSIDE B's first give-back: ${bVis(n)} of B's ${nB} conversations searched as readable — exactly the ${bBefore} walked before it (70efb5e10's code over the rows before: readable; over the rows after: hidden)`, { bVisible: bVis(n), bBefore, before, after, tip: callsOf(n, ib) });
}

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? ' passed, ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';

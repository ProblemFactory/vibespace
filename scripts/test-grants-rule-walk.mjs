#!/usr/bin/env node
// test-grants-rule-walk — ONE RULE WHOSE ACCESS IS A REACH ROW (B-360d, 主开发 r1190 / r1223 / r1379). Once one rule's access
// was a reach row, the release sent EVERY conversation of EVERY account down the full grant read: three resource keys built and
// probed twice, and the index's rules re-read and filtered, per conversation — more than half a second a walk at the owner's
// order of sizes. The ONE walk reader (src/server/channels-access.js reachWalkOf) now reads the rules whose id holds a row once an
// account, for one synchronous run. COUNTS, never a clock; and THE DIFFERENTIAL: every conversation's answer is reachFor's own
// (the release's per-conversation judge, unchanged — the release's walk asked it for every conversation once a rule held a row).
//  ① the owner's order of sizes (about two hundred thousand conversations on a handful of accounts — every id and title
//     invented) WITH one rule's reach row: ONE walk serves both — the rules the walk reader reads (once an account, and twice for
//     each conversation it hands to reachFor; the release: once a conversation) and every conversation's answer against
//     reachFor's, for the asker the rule reaches through its Task Group LINEAGE
//  ② every shape, a small world: a rule with a row and one without on one account, a second account's rule, a rule with NO
//     pattern whose id holds a row, a rule row that is ONLY an except, a rule row whose rule is gone, a conversation's own rows,
//     an account row — five askers, every conversation
//  ③ a rule REPLACED between two runs of one walk reader is read by its next run (the kept list lives for ONE synchronous run)
//  ④ RED CONTROLS (copies of channels-access through scratch.mjs anchored, each a CA.create swap): the release's reader (the
//     rules read once a conversation), a reader that never asks the rules (the differential sees it), one that keeps the rules
//     for the whole walk (the replaced rule missed)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('grants-rule-walk');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const { ok, report } = checker();

// the conversations the walk reader hands to reachFor (each a grant read of its own rows) — counted only inside a walk call
let inWalk = false, judged = 0;
const CGM = require(path.join(REPO, 'src/server/channels-grants.js'));
{ const c0 = CGM.create; CGM.create = (...x) => { const o = c0(...x); const f = o.conversationGrants; o.conversationGrants = (...y) => { if (inWalk) judged++; return f.apply(o, y); }; return o; }; }
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const ACL = require(path.join(REPO, 'src/channel-acl.js'));
const CA = require(path.join(REPO, 'src/server/channels-access.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CA_SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf8');
const T = Date.parse('2026-11-21T12:00:00Z');
const quiet = { info() { }, warn() { }, error() { }, log() { }, debug() { } };

/** ONE world: the real channels engine over FAKE accounts (no vendor), the real grants store on a scratch dir. `accounts` = per
 *  account its count of conversations; `rows` = grants store rows; `rules` = `{id, acct, title | null}` (null: a rule with no
 *  pattern); `interleave` = the index holds the accounts' conversations in turn. */
async function world(name, { accounts, rows = [], rules = [], interleave = false }) {
  const dataDir = path.join(ROOT, name);
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = () => ({ unref() { }, ref() { }, [Symbol.toPrimitive]: () => 0 });
  let eng;
  try { eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => { }, now: () => T, log: quiet, censusTimer: () => ({ cancel() { } }), liveSessions: () => [] }); }
  finally { globalThis.setInterval = realSetInterval; }
  const ix = eng.store.index;
  let recs = eng.adapterRecords().adapters.filter((r) => r.enabled !== false && r.kind !== 'agents');
  await eng.store.adapters.update(() => {
    const live = eng.store.adapters.live().adapters, base = live.find((r) => r.kind === 'fake-poll');
    for (let i = recs.length; i < accounts.length; i++) live.push({ ...JSON.parse(JSON.stringify(base)), id: `fake-poll-${i}`, label: `scratch ${i}` });
  });
  recs = eng.adapterRecords().adapters.filter((r) => r.enabled !== false && r.kind !== 'agents').slice(0, accounts.length);
  await ix.update((x) => {
    const put = (ai, i) => Object.assign(ix.entry(recs[ai].id, `c${String(i).padStart(6, '0')}`), { title: `[ops-${i % 97}] thread ${i}`, kind: i % 3 ? 'group' : 'dm', lastAt: T - i * 1000, unread: 0, listedAt: T - i * 1000, convCaps: { at: T, read: 'yes', sendAs: [], why: null } });
    if (interleave) { const most = Math.max(...accounts); for (let i = 0; i < most; i++) accounts.forEach((n, ai) => { if (i < n) put(ai, i); }); }
    else accounts.forEach((n, ai) => { for (let i = 0; i < n; i++) put(ai, i); });
    const pa = x.patternAssignments || (x.patternAssignments = {});
    for (const r of rules) pa[r.id] = r.title === null ? { id: r.id, adapterId: recs[r.acct].id } : { id: r.id, adapterId: recs[r.acct].id, pattern: { match: 'any', rules: [{ kind: 'title', value: r.title }] } };
  });
  const G = GS.forDir(dataDir);
  for (const r of rows) { const w = G.set('channel-reach', typeof r.resource === 'function' ? r.resource(recs) : r.resource, r.lists, 'user'); if (!w || w.ok === false) throw new Error(`seed refused (${name}): ` + JSON.stringify(w).slice(0, 200)); }
  return { eng, ix, recs, G };
}
const agent = (id, groups = [], inheritedGroups = []) => ({ kind: 'agent', id, name: null, groups, inheritedGroups, msgLevelFor: () => 'none' });
const byIdOf = (E) => new Map(E.eng.adapterRecords().adapters.map((r) => [r.id, r]));
const same = (a, b) => (a ? a.level : null) === (b ? b.level : null) && (a ? a.via : null) === (b ? b.via : null) && ((a && a.grantId) ?? null) === ((b && b.grantId) ?? null);
const shown = (v) => (v ? `${v.level}/${v.via}` : 'null');
/** ONE WALK through the walk reader, every conversation also asked of reachFor: → { rows, differ, firstDiffer, visible, reads,
 *  judged } — `reads` = the index's rules read INSIDE the walk reader's calls, `judged` = the conversations it handed to reachFor */
function walkAndCompare(E, ctx) {
  const byId = byIdOf(E), walk = E.eng.reachWalkOf(ctx), ix = E.eng.store.index, t0 = ix.table;
  let rows = 0, differ = 0, visible = 0, reads = 0, firstDiffer = null;
  judged = 0;
  ix.table = function (name, ...a) { if (inWalk && name === 'patternAssignments') reads++; return t0.call(this, name, ...a); };
  try {
    for (const en of Object.values(E.ix.live())) {
      const rec = byId.get(en.adapterId);
      if (!rec || rec.enabled === false) continue;
      rows++;
      inWalk = true;
      let a;
      try { a = walk(rec, en); } finally { inWalk = false; }
      const b = E.eng.reachFor(ctx, rec, en);
      if (!same(a, b)) { differ++; if (!firstDiffer) firstDiffer = { key: en.key, walk: shown(a), reachFor: shown(b) }; }
      if (ACL.canSee(b.level)) visible++;
    }
  } finally { ix.table = t0; inWalk = false; }
  return { rows, differ, firstDiffer, visible, reads, judged };
}

// ═══ ① THE OWNER'S ORDER OF SIZES, ONE RULE'S REACH ROW ═══════════════════════════════════════════════════════════════
console.log('— ① one rule whose access is a reach row, at the owner\'s order of sizes: ONE walk — the rules read, every answer reachFor\'s');
const SIZES = [170000, 20000, 2000, 750, 250, 150, 100];
const N = SIZES.reduce((x, y) => x + y, 0);
const W1 = await world('owner-order', {
  accounts: SIZES,
  rules: Array.from({ length: 10 }, (_, r) => ({ id: `pat${r}`, acct: r % SIZES.length, title: `ops-${r}` })),
  rows: [
    ...SIZES.map((_, ai) => ({ resource: (recs) => `account:${recs[ai].id}`, lists: { to: [{ kind: 'group', id: `T-grp${ai % 3}`, name: `Team ${ai}` }] } })),
    { resource: (recs) => `conversation:${recs[0].id}/c000007`, lists: { to: [{ kind: 'group', id: 'T-grp1', name: 'Team one' }] } },
    { resource: (recs) => `conversation:${recs[0].id}/c000014`, lists: { to: [{ kind: 'conversation', key: 'own-asker', name: 'own' }] } },
    { resource: 'rule:pat0', lists: { to: [{ kind: 'group', id: 'T-rule', name: 'Rule team' }] } },
  ],
});
{
  const r = walkAndCompare(W1, agent('dddddddd-0000-4000-8000-000000000088', ['T-kid'], ['T-rule']));
  ok(r.rows === N && r.differ === 0 && r.visible > 0, `① THE DIFFERENTIAL, an agent the rule reaches through its LINEAGE: ${r.rows} conversations, ${r.differ} answer otherwise than reachFor (${r.visible} visible)`, r);
  ok(r.judged > 0 && r.reads <= SIZES.length + 2 * r.judged && r.reads < N / 20, `① …and in that ONE walk the walk reader read the rules ${r.reads} times (≤ ${SIZES.length} accounts + 2 for each of the ${r.judged} conversations it handed to reachFor) — the release read them once a conversation`, r);
  let ans; const t0 = W1.eng.store.index.table; let hookReads = 0;
  W1.eng.store.index.table = function (name, ...a) { if (name === 'patternAssignments') hookReads++; return t0.call(this, name, ...a); };
  try { ans = W1.eng.reachCountFor(agent('dddddddd-0000-4000-8000-000000000089', ['T-none'])); } finally { W1.eng.store.index.table = t0; }
  ok(ans !== 'read' && hookReads < N / 20, `① the prompt hook's own walk (reachCountFor), an agent no row names: the rules read ${hookReads} times over ${N} conversations — answer «${ans}»`, { ans, hookReads });
}

// ═══ ② EVERY SHAPE ═════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n— ② every shape, a small world: five askers, every conversation reachFor\'s answer');
const N2 = 2200;
const shapes = (name) => world(name, {
  accounts: [1200, 800, 200], interleave: true,
  rules: [
    { id: 'pr0', acct: 0, title: 'ops-0' },   // a row
    { id: 'pr1', acct: 0, title: 'ops-1' },   // no row
    { id: 'pr3', acct: 1, title: 'ops-3' },   // a second account's rule with a row
    { id: 'pr5', acct: 1, title: null },      // NO pattern, its id holds a row
    { id: 'pr2', acct: 2, title: 'ops-2' },   // its row is ONLY an except
  ],
  rows: [
    { resource: 'rule:pr0', lists: { to: [{ kind: 'group', id: 'T-rule', name: 'Rule team' }] } },
    { resource: 'rule:pr3', lists: { to: [{ kind: 'group', id: 'T-rule3', name: 'Rule three' }, { kind: 'conversation', key: 'own-asker', name: 'own' }] } },
    { resource: 'rule:pr5', lists: { to: [{ kind: 'group', id: 'T-rule', name: 'Rule team' }] } },
    { resource: 'rule:pr2', lists: { to: [], except: [{ kind: 'conversation', key: 'own-asker' }] } },
    { resource: 'rule:gone9', lists: { to: [{ kind: 'group', id: 'T-rule', name: 'Rule team' }] } },
    { resource: (r) => `account:${r[1].id}`, lists: { to: [{ kind: 'group', id: 'T-acct1', name: 'Account one' }] } },
    { resource: (r) => `account:${r[2].id}`, lists: { to: [{ kind: 'group', id: 'T-rule', name: 'Rule team' }] } },
    { resource: (r) => `conversation:${r[0].id}/c000005`, lists: { to: [{ kind: 'group', id: 'T-own', name: 'Own row' }] } },
    { resource: (r) => `conversation:${r[2].id}/c000011`, lists: { to: [{ kind: 'conversation', key: 'own-asker', name: 'own' }] } },
  ],
});
const askers = [
  ['an agent no row names', agent('dddddddd-0000-4000-8000-000000000079', ['T-none'])],
  ['the rule\'s group', agent('dddddddd-0000-4000-8000-000000000078', ['T-rule'])],
  ['the rule\'s group through its LINEAGE', agent('dddddddd-0000-4000-8000-000000000077', ['T-kid'], ['T-rule', 'T-rule3'])],
  ['an account row\'s group', agent('dddddddd-0000-4000-8000-000000000076', ['T-acct1'])],
  ['a conversation the rows name, left out by the except-only row', agent('own-asker', ['T-own'])],
];
const W2 = await shapes('shapes');
{
  const rows = W2.G.rowsOfDoor('channel-reach').map((r) => r.resource);
  ok(rows.includes('rule:pr2') && rows.includes('rule:pr5') && !W2.ix.table('patternAssignments').pr5.pattern, `② the world holds a rule row that is only an except (pr2) and a rule with no pattern whose id holds a row (pr5) — ${rows.length} reach rows`, rows);
}
for (const [who, ctx] of askers) {
  const r = walkAndCompare(W2, ctx);
  ok(r.rows === N2 && r.differ === 0, `② every shape, ${who}: ${r.rows} conversations, ${r.differ} answer otherwise than reachFor (${r.visible} visible)`, r);
}

// ═══ ③ ONE SYNCHRONOUS RUN ═════════════════════════════════════════════════════════════════════════════════════════════
// the walk reader judges a conversation of account 0 that rule pr0 does not reach; pr0 is REPLACED by a new record that reaches
// it (a record changed in place is read through any kept record, so the leg replaces it); after a give-back the SAME reader
// judges it by the rule as it is — what reachFor answers
console.log('\n— ③ a rule replaced between two runs of one walk reader is read by its next run');
const perRun = async (E) => {
  const ctx = askers[1][1], byId = byIdOf(E), walk = E.eng.reachWalkOf(ctx), rec = byId.get(E.recs[0].id);
  const en = Object.values(E.ix.live()).find((x) => x.adapterId === E.recs[0].id && /\[ops-4\]/.test(x.title));
  const before = walk(rec, en);
  await E.ix.update((ix) => { ix.patternAssignments.pr0 = { ...ix.patternAssignments.pr0, pattern: { match: 'any', rules: [{ kind: 'title', value: 'ops-4' }] } }; });
  await new Promise((r) => setImmediate(r));
  const after = walk(rec, en), want = E.eng.reachFor(ctx, rec, en);
  return { key: en ? en.key : null, before: shown(before), after: shown(after), want: shown(want), same: !!same(after, want), seen: !!ACL.canSee(want.level) };
};
const e3 = await perRun(await shapes('one-run'));
ok(e3.key !== null && e3.same && e3.seen && e3.before !== e3.after, `③ «${e3.key}» judged ${e3.before} before the rule was replaced, ${e3.after} after — reachFor's ${e3.want}`, e3);

// ═══ ④ RED CONTROLS — each proves its plant first ══════════════════════════════════════════════════════════════════════
console.log('\n— ④ red controls');
const M4 = mutantCopies('grants-rule-walk', REPO);
const CURE_TEST = '      if (m || own.has(en.key)) return reachFor(ctx, rec, en);\n      if (ruleIds.size) {\n';
const withAccess = async (src, tag, fn) => {
  const Mut = M4.load('src/server/channels-access.js', src, tag);
  const c0 = CA.create; CA.create = Mut.create;
  try { return await fn(); } finally { CA.create = c0; }
};
{
  const R1 = await withAccess(anchored(CA_SRC, CURE_TEST, '      if (m || ruleIds.size > 0 || own.has(en.key)) return reachFor(ctx, rec, en);\n      if (ruleIds.size) {\n', 'the release walk reader (every conversation the row way)'), 'release-walk', () => shapes('red-release'));
  const red = walkAndCompare(R1, askers[0][1]), tip = walkAndCompare(W2, askers[0][1]);
  ok(red.differ === 0 && red.reads >= N2 && tip.reads <= 3 + 2 * tip.judged && tip.reads * 4 < red.reads, `④ RED CONTROL the release's walk reader planted back: the rules read ${red.reads} times for ${N2} conversations (the cure: ${tip.reads} — ≤ 3 accounts + 2 for each of the ${tip.judged} it handed to reachFor) — the same answers`, { red: red.reads, tip: tip.reads, judged: tip.judged });
}
{
  const R2 = await withAccess(anchored(CA_SRC, CURE_TEST, '      if (m || own.has(en.key)) return reachFor(ctx, rec, en);\n      if (false) {\n', 'a walk reader that never asks the rules'), 'never-asks-the-rules', () => shapes('red-blind'));
  const rd = walkAndCompare(R2, askers[1][1]);
  ok(rd.differ > 0 && rd.rows === N2, `④ RED CONTROL a walk reader that never asks the rules: ${rd.differ} of ${rd.rows} conversations answer otherwise than reachFor — the differential sees it`, rd);
}
{
  const R3 = await withAccess(anchored(CA_SRC, '      if (!ruled) { const mine = ruled = new Map(); queueMicrotask(() => { if (ruled === mine) ruled = null; }); }\n', '      if (!ruled) { ruled = new Map(); }\n', 'a walk reader that keeps the rules for the whole walk'), 'rules-kept-a-walk', () => shapes('red-kept'));
  const e = await perRun(R3);
  ok(e.key !== null && !e.same, `④ RED CONTROL a reader that keeps the rules for the whole walk: «${e.key}» judged ${e.after} after the rule was replaced, not reachFor's ${e.want}`, e);
}
report();

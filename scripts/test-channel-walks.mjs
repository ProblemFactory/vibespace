#!/usr/bin/env node
// test-channel-walks — B-360d item 4 (lane bl-loop-a, 主开发 r4317 / r4325): THE CHANNEL WALKS BY ACCOUNT. The agents' reach count
// (the prompt hook), list and search walked EVERY conversation of the channels index per ask (68–155 ms a call at about 200 000
// conversations); each now judges every ACCOUNT once and per conversation only its exceptions (a row of its own, the msg-acl
// account, a row whose key and account disagree, an account a rule-with-a-row of which can apply to the asker), and KEEPS
// NOTHING ACROSS ASKS. FAST, in-process: the real channels engine over FAKE accounts (no vendor), the real grants store on a
// scratch dir; the 50 ms law at the owner's size is scripts/test-channel-walks-hold.mjs (heavy).
//   ① LAW (b) — WHO MAY SEE WHAT DOES NOT CHANGE: every road (the count, the list, the list with the directory, two searches with
//      hits and hidden hits, one account's search, the dead sign-ins) for every asker of the stand-in list — account / rule /
//      conversation rows with «all but» exceptions, a group and a lineage, rows a row of their own names, an approved request,
//      All agents but a group, a rule whose row applies to nobody here, the msg-acl account, a row whose key and account
//      disagree, an account whose directory is off, an asker no row names, one whose groups cannot be read, the person — equals,
//      answer for answer, THE RELEASE's walk: src/server/channels-access.js with the by-account roads cut out (each road then
//      runs the release's own lines, which stand in the file as its fallback), created over the SAME engine context: the same
//      store, rows, records and grants, at the same instant.
//   ② LAW (c) — A WRITE IS READ AT THE VERY NEXT ASK: a leg per write family (a grant given, a grant taken, an «all but» added, a
//      member leaving, a parent changed, a birth, a removal, a fact a rule matches, a rule's body, an account disabled, a request
//      approved, the directory switched, a msg-acl answer, an «all but» on a rule, the All-agents row taken): the write, then the
//      next ask — its effect is there, and every answer still equals the release's.
//   ③ THE MAP VOID (a placed `walk`: 50 rows built at once, one row a slice): the first road after a whole-map touch starts the
//      per-account map's SLICED build and answers by the release's walk; during the build every road answers as the release; a
//      search WAITS for it; the build runs to its last slice (no road finishes it in its own turn). CONTROL: the release's
//      search during the build finishes it in its turn (the slices stop short).
//   ④ LAW (d) — nothing synchronous against the disk in a road: the fs module's synchronous calls counted over every road and
//      asker — as many as the release's own.
//   ⑤ THE HOOK keeps no memo (src/agent-routes.js channelsTaughtFor): asked at every prompt.
//   REDS: a copy without the rule check, one that skips the own-row exceptions, one without the tie order, one that keeps the
//   count across asks, the store handing a PARTIAL map, a planted synchronous read, the hook's memo planted back.
// Run: node scripts/test-channel-walks.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { anchored, scratch } from './scratch.mjs';   // FIRST after node's own (§113)
import { checker } from './lib/check.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const ROOT = scratch('channel-walks');
const T = Date.parse('2026-11-25T12:00:00Z');
const quiet = { info() { }, warn() { }, error() { }, log() { }, debug() { } };
const J = (x) => JSON.stringify(x === undefined ? null : x);

// THE ENGINE CONTEXT: the access family is created over ONE object of the engine's; the release's family (and each red copy) is
// created over that same object here — every reader reads the same store, rows, records and grants
const CA = require(path.join(REPO, 'src/server/channels-access.js'));
let lastCtx = null;
{ const c0 = CA.create; CA.create = (c) => { lastCtx = c; return c0(c); }; }
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const ASRC = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf8');
const MB = mutantCopies('channel-walks', REPO);
// THE RELEASE's WALK: the four by-account entries cut (the release's lines below each stand as its fallback) and the release's step
let RSRC = ASRC;
RSRC = anchored(RSRC, "    const byAccount = ctx && ctx.kind === 'agent' ? reachCountByAccount(ctx, recs) : undefined;   // B-360d item 4\n", "    const byAccount = undefined;   // THE RELEASE's walk\n", 'release: the count');
RSRC = anchored(RSRC, "    let sel = ctx && ctx.kind === 'agent' ? newestSelector(LIST_FOR_MAX, placeBefore) : null;\n", "    let sel = null;   // THE RELEASE's walk\n", 'release: the list');
RSRC = anchored(RSRC, "    const view = ctx && ctx.kind === 'agent' ? accountViewOf(ctx) : null;\n    let ownByAcct = null;\n", "    const view = null;   // THE RELEASE's walk\n    let ownByAcct = null;\n", 'release: the search');
RSRC = anchored(RSRC, "      const kept = store.index.keysKept(rec.id);\n      const rows = kept ? (function* () { for (const k of kept.keys.keys()) yield live[k]; for (const k of kept.odd.keys()) yield live[k]; })() : Object.values(live);\n", "      const rows = store.index.rowsOf(rec.id);   // THE RELEASE's road\n", 'release: the dead sign-ins');
RSRC = anchored(RSRC, '  const WALK_STEP = 10000;\n', '  const WALK_STEP = 50000;\n', 'release: the step');
RSRC = anchored(RSRC, "        const gone = new Set();\n        for (const x0 of r.results) { const cid = x0.convId; if (visible.has(cid) && !gone.has(cid) && !stillSees(ctx, rec.id, cid)) gone.add(cid); }\n        for (const cid of gone) visible.delete(cid);\n", "        for (const cid of [...visible.keys()]) if (!stillSees(ctx, rec.id, cid)) visible.delete(cid);\n", 'release: the identity check after the await');
const REL = MB.load('src/server/channels-access.js', RSRC, 'release');
ok(typeof REL.create === 'function', 'setup: the release\'s walk loads from a copy (four by-account entries cut, its step back at 50 000, its identity check over every visible conversation)');

const SIZES = [230, 60, 40, 24, 16];   // five fake accounts (230 > the list's 200: the cap is met), + the built-in Agents account
const AGENTS_N = 8;
const rowOf = (a, i) => ({ id: `c${String(i).padStart(6, '0')}`, title: `[ops-${i % 7}] thread ${i} of ${a}`, kind: i % 3 ? 'group' : 'dm', lastAt: i % 11 === 10 ? 0 : T - (i % 23) * 1000 });
/** ONE world of the stand-in list (each seed named in the header); `walk` = the store's placed slicing */
async function world(name, { walk = null } = {}) {
  const dataDir = path.join(ROOT, name);
  fs.mkdirSync(dataDir, { recursive: true });
  const si = globalThis.setInterval;
  globalThis.setInterval = () => ({ unref() { }, ref() { }, [Symbol.toPrimitive]: () => 0 });
  let eng;
  try { eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => { }, now: () => T, log: quiet, censusTimer: () => ({ cancel() { } }), liveSessions: () => [], ...(walk ? { walk } : {}) }); }
  finally { globalThis.setInterval = si; }
  const ectx = lastCtx;
  const ix = eng.store.index;
  await eng.store.adapters.update(() => {
    const live = eng.store.adapters.live().adapters, base = live.find((r) => r.kind === 'fake-poll');
    for (let i = live.filter((r) => r.kind === 'fake-poll').length; i < SIZES.length; i++) live.push({ ...JSON.parse(JSON.stringify(base)), id: `fake-poll-${i}`, label: `scratch ${i}` });
  });
  const recs = eng.adapterRecords().adapters.filter((r) => r.kind === 'fake-poll' && r.enabled !== false).slice(0, SIZES.length);
  const agentsRec = eng.adapterRecords().adapters.find((r) => r.kind === 'agents') || null;
  const A = recs.map((r) => r.id);
  // THE INDEX's ORDER interleaves the accounts (row i of each in turn) — a tie of `lastAt` across accounts then has an order of
  // its own that the walk by account must keep
  await ix.update((x) => {
    const most = Math.max(...SIZES, AGENTS_N);
    for (let i = 0; i < most; i++) {
      recs.forEach((rec, a) => { if (i < SIZES[a]) { const c = rowOf(a, i); Object.assign(ix.entry(rec.id, c.id), { title: c.title, kind: c.kind, lastAt: c.lastAt, unread: 0, listedAt: T - i * 1000, convCaps: { at: T, read: 'yes', sendAs: [], why: null } }); } });
      if (agentsRec && i < AGENTS_N) Object.assign(ix.entry(agentsRec.id, `s${i}`), { title: `agent thread ${i}`, kind: 'dm', lastAt: T - i * 500, unread: 0, listedAt: T });
    }
    const pa = x.patternAssignments || (x.patternAssignments = {});
    pa.patR = { id: 'patR', adapterId: A[2], pattern: { match: 'any', rules: [{ kind: 'title', value: 'ops-3' }] } };   // its row: Team r
    pa.patQ = { id: 'patQ', adapterId: A[0], pattern: { match: 'any', rules: [{ kind: 'title', value: 'ops-5' }] } };   // its row applies to nobody here
    pa.patZ = { id: 'patZ', adapterId: A[1], pattern: { match: 'any', rules: [{ kind: 'title', value: 'ops-6' }] } };   // no row
  });
  // a row whose key and account disagree (only a damaged act line makes one): key A1/c000005, account A2
  await ix.update(() => { const en = ix.entry(A[1], 'c000005', { create: false }); en.adapterId = A[2]; });
  // account 3's directory off (a hidden account the search can know nothing of); account 1's sign-in dead
  await eng.store.adapters.update(() => {
    const live = eng.store.adapters.live().adapters;
    live.find((r) => r.id === A[3]).agentDirectory = { groups: false, singles: false };
    live.find((r) => r.id === A[1]).signinDead = { cause: 'expired', at: T };
  });
  // messages (the searches' hits and hidden hits): «invoice» in conversations each asker sees, may request, or may not see
  const said = [[0, 1], [0, 2], [0, 9], [0, 15], [1, 1], [1, 4], [2, 1], [2, 2], [2, 3], [2, 10], [3, 3], [3, 4], [4, 2], [4, 5]];
  let m = 0;
  for (const [a, i] of said) { const c = rowOf(a, i).id; eng.store.appendRecords(A[a], c, [{ id: `m${m}`, vendorId: `m${m}`, convId: c, at: T - 60e3 - m * 1000, text: `invoice ${m} for ${a}`, author: { id: 'p1', name: 'Pat' } }]); m++; }
  if (agentsRec) for (const s of ['s1', 's2']) { eng.store.appendRecords(agentsRec.id, s, [{ id: `m${m}`, vendorId: `m${m}`, convId: s, at: T - 60e3 - m * 1000, text: `invoice ${m} in an agent thread`, author: { id: 'p2', name: 'Kim' } }]); m++; }
  const G = GS.forDir(dataDir);
  const set = (res, lists) => { const w = G.set('channel-reach', res, lists, 'user'); if (!w || w.ok === false) throw new Error(`seed refused (${res}): ${J(w).slice(0, 200)}`); };
  set(`account:${A[0]}`, { to: [{ kind: 'group', id: 'T-a', name: 'Team a' }], except: [{ kind: 'conversation', key: 'agent-x', name: 'x' }] });
  set(`account:${A[1]}`, { to: [{ kind: 'group', id: 'T-root', name: 'Root' }] });
  set(`account:${A[2]}#user`, { to: [{ kind: 'group', id: 'T-b', name: 'Team b', level: 'requestable' }] });
  set(`conversation:${A[2]}/c000002#user`, { to: [{ kind: 'group', id: 'T-b', name: 'Team b', level: 'visible' }] });
  set(`conversation:${A[3]}/c000003`, { to: [{ kind: 'conversation', key: 'agent-own', name: 'own' }] });
  set(`conversation:${A[0]}/c000009#user`, { to: [{ kind: 'group', id: 'T-b', name: 'Team b', level: 'visible' }] });
  set(`conversation:${A[4]}/c000002#request`, { to: [{ kind: 'conversation', key: 'agent-req', name: 'req' }] });
  set('rule:patR', { to: [{ kind: 'group', id: 'T-r', name: 'Rule team' }] });
  set('rule:patQ', { to: [{ kind: 'group', id: 'T-nobody', name: 'Nobody' }] });
  set(`account:${A[4]}`, { to: [{ kind: 'everyone', id: '*' }], except: [{ kind: 'group', id: 'T-x', name: 'Team x' }] });
  await ix.durable();
  return { eng, ectx, ix, recs, A, agentsRec, G, set, dataDir };
}

// THE ASKERS (each built afresh at every ask, as the hub builds its principal per request); S = what a write leg changes
const S = { memberGroups: ['T-a'], leafParents: ['T-root'], msgRead: new Set() };
const agent = (id, groups, extra = {}) => () => ({ kind: 'agent', id, name: null, groups: [...groups], inheritedGroups: [], msgLevelFor: () => 'none', ...extra });
const ASKERS = {
  blind: agent('agent-blind', ['T-none']),
  member: () => agent('agent-member', S.memberGroups)(),
  excepted: agent('agent-x', ['T-a']),
  lineage: () => agent('agent-leaf', ['T-leaf'], { inheritedGroups: [...S.leafParents] })(),
  teamB: agent('agent-b', ['T-b']),
  own: agent('agent-own', []),
  req: agent('agent-req', ['T-none']),
  rule: agent('agent-r', ['T-r']),
  allBut: agent('agent-xx', ['T-x']),
  msg: () => agent('agent-m', [], { msgLevelFor: (id) => (S.msgRead.has(String(id)) ? 'visible' : 'none') })(),
  unreadable: agent('agent-u', [], { groupsUnreadable: true }),
  wide: agent('agent-w', ['T-a', 'T-b', 'T-r'], { inheritedGroups: ['T-root'] }),
  person: () => ({ kind: 'user' }),
};
const roadsOf = (A) => ({
  count: (R, c) => R.reachCountFor(c),
  list: (R, c) => R.listFor(c),
  listAll: (R, c) => R.listFor(c, { all: true }),
  search: (R, c) => R.searchFor(c, 'thread', { limit: 50 }),
  hits: (R, c) => R.searchFor(c, 'invoice', { limit: 50 }),
  one: (R, c) => R.searchFor(c, 'invoice', { limit: 5, adapterId: A[2] }),
  signin: (R, c) => R.signinExpiredFor(c),
});
async function answersOf(R, W, { askers = ASKERS, only = null } = {}) {
  const out = {}, roads = roadsOf(W.A);
  for (const [n, mk] of Object.entries(askers)) {
    const a = out[n] = {};
    for (const [k, f] of Object.entries(roads)) {
      if (only && !only.includes(k)) continue;
      try { a[k] = await f(R, mk()); } catch (e) { a[k] = { threw: String((e && e.message) || e).slice(0, 160) }; }
    }
  }
  return out;
}
const diffOf = (m, r) => { const d = []; for (const n of Object.keys(m)) for (const k of Object.keys(m[n])) if (J(m[n][k]) !== J(r[n] && r[n][k])) d.push(`${n}·${k}: mine ${J(m[n][k]).slice(0, 140)} | release ${J(r[n] && r[n][k]).slice(0, 140)}`); return d; };
const nOf = (a, n, k = 'list') => (a[n] && a[n][k] && Array.isArray(a[n][k].conversations) ? a[n][k].conversations.length : -1);
const allOf = (a, n, k = 'listAll') => nOf(a, n, k) + ((a[n] && a[n][k] && (a[n][k].more || 0) + (a[n][k].moreRequestable || 0)) || 0);   // listed + counted
const compares = (a) => Object.values(a).reduce((s, x) => s + Object.keys(x).length, 0);

// ═══ ① LAW (b): every road, every asker — the walk by account == the release's walk ═══════════════════════════════════════
console.log('① law (b): who may see what does not change — every road of every asker equals the release\'s walk (its text in a copy, over the same engine)');
const W = await world('main');
const RELW = REL.create(W.ectx);
ok(!!W.agentsRec, 'setup: the built-in Agents account is there (its reach is msg-acl\'s)');
const base = await answersOf(W.eng, W), baseRel = await answersOf(RELW, W);
const d0 = diffOf(base, baseRel);
ok(d0.length === 0, `① ${compares(base)} answers (${Object.keys(ASKERS).length} askers × 7 roads), each the release's to the byte`, d0.slice(0, 6));
{
  const counts = new Set(Object.values(base).map((a) => J(a.count)));
  ok(counts.has('"read"') && counts.has('"request"'), `① …and the answers are not one answer: the counts read ${[...counts].join(' / ')}`);
  ok(Object.values(base).some((a) => a.list && a.list.more > 0), '① …a list meets its cap of 200 (the newest kept, the rest counted)', Object.fromEntries(Object.entries(base).map(([n, a]) => [n, a.list && a.list.more])));
  ok(Object.values(base).some((a) => a.hits && a.hits.hiddenMatch === true) && Object.values(base).some((a) => a.hits && a.hits.ok && a.hits.results.length > 0), '① …a search answers hits, and another a hidden hit (existence only)');
  ok(Object.values(base).some((a) => Array.isArray(a.signin) && a.signin.length > 0), '① …the dead sign-in is named to an asker that reads its account');
  ok(nOf(base, 'rule') > 0 && nOf(base, 'rule') !== nOf(base, 'blind') && nOf(base, 'excepted') < nOf(base, 'member') && nOf(base, 'lineage') > nOf(base, 'blind'), `① …the rule row, the «all but», the lineage each change what is listed (rule ${nOf(base, 'rule')}, blind ${nOf(base, 'blind')}, excepted ${nOf(base, 'excepted')}, member ${nOf(base, 'member')}, lineage ${nOf(base, 'lineage')})`);
  // the tie order is met: two rows of different accounts with the same lastAt side by side in one list
  const L = base.wide.list.conversations || [];
  let ties = 0; for (let i = 1; i < L.length; i++) if (L[i].lastAt === L[i - 1].lastAt && L[i].adapterId !== L[i - 1].adapterId) ties++;
  ok(ties > 0, `① …the wide asker's list holds ${ties} ties of lastAt between two accounts' rows (the order the release's walk gave them is kept)`);
}

// ═══ ② LAW (c): one leg per write family — the write, then the very next ask ════════════════════════════════════════════════
console.log('② law (c): a write is read at the very next ask — a leg per write family; every answer still the release\'s');
const STEPS = [
  ['a grant given (an account row naming a group)', () => W.set(`account:${W.A[3]}`, { to: [{ kind: 'group', id: 'T-x', name: 'Team x' }] }),
    (b, a) => b.allBut.count !== 'read' && a.allBut.count === 'read' && nOf(a, 'allBut') > nOf(b, 'allBut')],
  ['a grant TAKEN AWAY (that row removed)', () => W.G.remove('channel-reach', `account:${W.A[3]}`, 'user'),
    (b, a) => b.allBut.count === 'read' && a.allBut.count !== 'read' && nOf(a, 'allBut') < nOf(b, 'allBut')],
  ['an «all but» added (the member left out of its group\'s row)', () => W.set(`account:${W.A[0]}`, { to: [{ kind: 'group', id: 'T-a', name: 'Team a' }], except: [{ kind: 'conversation', key: 'agent-x', name: 'x' }, { kind: 'conversation', key: 'agent-member', name: 'm' }] }),
    (b, a) => nOf(a, 'member') < nOf(b, 'member')],
  ['…and lifted (by name: the store refuses an exception dropped silently)', () => W.set(`account:${W.A[0]}`, { to: [{ kind: 'group', id: 'T-a', name: 'Team a' }], except: [{ kind: 'conversation', key: 'agent-x', name: 'x' }], removeExcept: [{ kind: 'conversation', key: 'agent-member', name: 'm' }] }),
    (b, a) => nOf(a, 'member') > nOf(b, 'member')],
  ['a member leaving its group', () => { S.memberGroups = []; }, (b, a) => nOf(a, 'member') < nOf(b, 'member')],
  ['…and joining again', () => { S.memberGroups = ['T-a']; }, (b, a) => nOf(a, 'member') > nOf(b, 'member')],
  ['a parent changed (the lineage no longer under the named root)', () => { S.leafParents = ['T-other']; },
    (b, a) => nOf(a, 'lineage') < nOf(b, 'lineage') && J(b.lineage.signin) !== J(a.lineage.signin)],
  ['…and back', () => { S.leafParents = ['T-root']; }, (b, a) => nOf(a, 'lineage') > nOf(b, 'lineage')],
  ['a conversation\'s arrival (the newest row of the root\'s account)', () => W.ix.update(() => { Object.assign(W.ix.entry(W.A[1], 'cnew'), { title: '[ops-1] thread new', kind: 'group', lastAt: T + 5000, unread: 0, listedAt: T }); }),
    (b, a) => nOf(a, 'lineage') === nOf(b, 'lineage') + 1 && a.lineage.list.conversations[0].lastAt === T + 5000],
  ['its removal (a whole-map touch: the per-account map is void, then read again)', () => W.ix.update((x) => { delete x.conversations[`${W.A[1]}/cnew`]; }),
    (b, a) => nOf(a, 'lineage') === nOf(b, 'lineage') - 1],
  // r4526 (1): every write that can change one of the two facts the list keeps beside a key's place (its lastAt, whether it is a
  // single chat) — the roads that write them (channels-engine's listing, feed, landing, ingest, push and thread roads; the webhook's
  // participants) all write through entry() inside an update, as these steps do
  ['a message arriving moves an existing row\'s last time (the newest now)', () => W.ix.update(() => { W.ix.entry(W.A[1], 'c000030', { create: false }).lastAt = T + 9000; }),
    (b, a) => nOf(a, 'lineage') === nOf(b, 'lineage') && a.lineage.list.conversations[0].lastAt === T + 9000 && b.lineage.list.conversations[0].lastAt !== T + 9000],
  ['a row\'s kind changing (a single chat a listing pass now names a group: the directory lists it)', () => W.ix.update(() => { W.ix.entry(W.A[0], 'c000003', { create: false }).kind = 'group'; }),
    (b, a) => allOf(a, 'blind') === allOf(b, 'blind') + 1],
  ['a row removed…', () => W.ix.update((x) => { delete x.conversations[`${W.A[2]}/c000007`]; }), (b, a) => nOf(a, 'teamB') === nOf(b, 'teamB') - 1],
  ['…and born again (a later update: its place after every key there is)', () => W.ix.update(() => { Object.assign(W.ix.entry(W.A[2], 'c000007'), { title: '[ops-0] thread 7 of 2', kind: 'group', lastAt: T - 7000, unread: 0, listedAt: T }); }),
    (b, a) => nOf(a, 'teamB') === nOf(b, 'teamB') + 1],
  ['a fact a rule matches (a title renamed into the rule)', () => W.ix.update(() => { W.ix.entry(W.A[2], 'c000001', { create: false }).title = '[ops-3] renamed'; }),
    (b, a) => nOf(a, 'rule') === nOf(b, 'rule') + 1],
  ['a rule\'s body changed', () => W.ix.update((x) => { x.patternAssignments.patR.pattern = { match: 'any', rules: [{ kind: 'title', value: 'ops-4' }] }; }),
    (b, a) => J(a.rule.list) !== J(b.rule.list)],
  ['an account disabled', () => W.eng.store.adapters.update(() => { W.eng.store.adapters.live().adapters.find((r) => r.id === W.A[4]).enabled = false; }),
    (b, a) => nOf(a, 'blind') < nOf(b, 'blind')],
  ['…and enabled again', () => W.eng.store.adapters.update(() => { W.eng.store.adapters.live().adapters.find((r) => r.id === W.A[4]).enabled = true; }),
    (b, a) => nOf(a, 'blind') > nOf(b, 'blind')],
  ['a request approved (its #request row)', () => W.set(`conversation:${W.A[1]}/c000004#request`, { to: [{ kind: 'conversation', key: 'agent-req', name: 'req' }] }),
    (b, a) => nOf(a, 'req') === nOf(b, 'req') + 1],
  ['the directory switched on (an account the search knew nothing of)', () => (W.eng.setAgentDirectory || W.ectx.setAgentDirectory)(W.A[3], { groups: true, singles: false }),
    (b, a) => allOf(a, 'blind') > allOf(b, 'blind')],
  ['a msg-acl answer (an agent thread now visible to the asker)', () => { S.msgRead.add('s1'); }, (b, a) => nOf(a, 'msg') === nOf(b, 'msg') + 1],
  ['an «all but» on a RULE\'s row', () => W.set('rule:patR', { to: [{ kind: 'group', id: 'T-r', name: 'Rule team' }], except: [{ kind: 'conversation', key: 'agent-r', name: 'r' }] }),
    (b, a) => nOf(a, 'rule') < nOf(b, 'rule')],
  ['the All-agents row taken away', () => W.G.remove('channel-reach', `account:${W.A[4]}`, 'user'), (b, a) => nOf(a, 'blind') < nOf(b, 'blind')],
];
let before = base;
for (const [name, write, effect] of STEPS) {
  await write();
  await W.ix.durable();
  const after = await answersOf(W.eng, W), rel = await answersOf(RELW, W);
  const d = diffOf(after, rel);
  ok(effect(before, after) === true && d.length === 0, `② ${name}: its effect at the next ask, and every answer the release's (${compares(after)} compared)`, d.length ? d.slice(0, 4) : 'the effect is not there');
  before = after;
}

// ═══ REDS over the same world: each a copy of the product's file with ONE named cut, created over the same engine ═══════
console.log('REDS: each cut shows in the differential (the legs above are not vacuous)');
const redOf = (anchor, to, tag) => MB.load('src/server/channels-access.js', anchored(ASRC, anchor, to, `red: ${tag}`), tag).create(W.ectx);
{
  const now0 = await answersOf(W.eng, W), rel0 = await answersOf(RELW, W);
  ok(diffOf(now0, rel0).length === 0, 'REDS setup: at this state the walk by account is the release\'s');
  // the rule set back as the base had it (a rule whose row can apply to an asker): Team r reads ops-3 rows of account 2
  W.set('rule:patR', { to: [{ kind: 'group', id: 'T-r', name: 'Rule team' }], removeExcept: [{ kind: 'conversation', key: 'agent-r', name: 'r' }] });
  await W.ix.update((x) => { x.patternAssignments.patR.pattern = { match: 'any', rules: [{ kind: 'title', value: 'ops-3' }] }; });
  const R1 = redOf("            if (CG.ruleGrants(pa.id, '').some((g) => ACL.principalApplies(ctx, g))) { applies = true; break; }\n", '            /* RED: the rule check cut */\n', 'no-rule-check');
  const r1 = diffOf(await answersOf(R1, W, { only: ['count', 'list', 'hits'] }), await answersOf(RELW, W, { only: ['count', 'list', 'hits'] }));
  ok(r1.some((x) => x.startsWith('rule·')), 'RED: a copy that never asks whether a rule\'s row applies to the asker answers the rule\'s member otherwise (the account\'s answer for a row the rule opens)', r1.slice(0, 3));
  const R2 = redOf("          const reach = v === null || (ownN && own.has(key)) ? reachOf(rec, en) : v;\n", '          const reach = v === null ? reachOf(rec, en) : v;   // RED: a row of its own given the account\'s answer\n', 'no-own-rows');
  const r2 = diffOf(await answersOf(R2, W, { only: ['list'] }), await answersOf(RELW, W, { only: ['list'] }));
  ok(r2.some((x) => x.startsWith('teamB·') || x.startsWith('wide·')), 'RED: a copy that gives a conversation with a row of its own its account\'s answer lists it otherwise (team b\'s visible row in a requestable account)', r2.slice(0, 3));
  const R3 = redOf('    let sel = ctx && ctx.kind === \'agent\' ? newestSelector(LIST_FOR_MAX, placeBefore) : null;\n', '    let sel = ctx && ctx.kind === \'agent\' ? newestSelector(LIST_FOR_MAX) : null;   // RED: the tie order cut\n', 'no-tie-order');
  const r3 = diffOf(await answersOf(R3, W, { only: ['list'] }), await answersOf(RELW, W, { only: ['list'] }));
  ok(r3.some((x) => x.startsWith('wide·')), 'RED: a copy that breaks a tie of lastAt by the order rows are offered (account by account) lists the wide asker\'s rows in another order', r3.slice(0, 2));
  const R4 = redOf('    if (byAccount !== undefined) return byAccount;\n', '    if (byAccount !== undefined) { const m = globalThis.__walksKept || (globalThis.__walksKept = new Map()); if (m.has(String(ctx.id))) return m.get(String(ctx.id)); m.set(String(ctx.id), byAccount); return byAccount; }   // RED: kept across asks\n', 'kept-across-asks');
  const k0 = R4.reachCountFor(ASKERS.allBut());
  W.set(`account:${W.A[3]}`, { to: [{ kind: 'group', id: 'T-x', name: 'Team x' }] });
  const k1 = R4.reachCountFor(ASKERS.allBut()), k1rel = RELW.reachCountFor(ASKERS.allBut()), k1mine = W.eng.reachCountFor(ASKERS.allBut());
  W.G.remove('channel-reach', `account:${W.A[3]}`, 'user');
  ok(k0 !== 'read' && k1rel === 'read' && k1mine === 'read' && k1 === k0, `RED: a copy that keeps the count across asks answers «${k1}» after the grant was given (the release and the walk by account: «${k1rel}» / «${k1mine}»)`);
  delete globalThis.__walksKept;
}

// ═══ ④ LAW (d): nothing synchronous against the disk in a road ═════════════════════════════════════════════════════════════
console.log('④ law (d): the roads make no synchronous call of the fs module');
{
  // every synchronous call of the fs module whose stack passes through the access family (the file or a copy of it) — a timer of
  // the engine's own writing meanwhile is not the road's
  const SYNC = Object.keys(fs).filter((k) => k.endsWith('Sync') && typeof fs[k] === 'function');
  const counted = async (fn) => {
    const orig = {}, seen = []; let n = 0;
    const lim = Error.stackTraceLimit;
    for (const k of SYNC) { orig[k] = fs[k]; fs[k] = function (...a) { Error.stackTraceLimit = 60; const st = String(new Error().stack); Error.stackTraceLimit = lim; if (/channels-access/.test(st)) { n++; if (seen.length < 4) seen.push(`${k} ${String(a[0]).slice(-48)}`); } return orig[k].apply(this, a); }; }
    try { await fn(); } finally { for (const k of SYNC) fs[k] = orig[k]; }
    return { n, seen };
  };
  await W.ix.durable();
  const mine = await counted(() => answersOf(W.eng, W)), rel = await counted(() => answersOf(RELW, W));
  ok(mine.n === 0, `④ every road of every asker: ${mine.n} synchronous fs calls from the access family (the release's walk: ${rel.n})`, { mine: mine.seen, release: rel.seen });
  const R6 = redOf('    if (!recs.size) return null;\n    const byAccount', "    if (!recs.size) return null;\n    require('fs').statSync(__filename);   // RED: a planted synchronous read\n    const byAccount", 'sync-read');
  const planted = await counted(() => answersOf(R6, W, { only: ['count'] }));
  const plain = await counted(() => answersOf(RELW, W, { only: ['count'] }));
  ok(planted.n > plain.n, `RED: a copy with one synchronous read planted in the count is seen (${planted.n} calls against ${plain.n})`);
}

// ═══ ⑥ THE LIST READS FROM THE INDEX ONLY THE ROWS IT CAN LIST (主开发 r4520 / r4526: the box's 55 ms list roads) ═══════════════
console.log('⑥ the list reads from the index only the rows it can list (2 000 rows of one account, the newest first: 200 listed)');
{
  const dataDir = path.join(ROOT, 'reads'); fs.mkdirSync(dataDir, { recursive: true });
  const si = globalThis.setInterval;
  globalThis.setInterval = () => ({ unref() { }, ref() { }, [Symbol.toPrimitive]: () => 0 });
  let eng;
  try { eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => { }, now: () => T, log: quiet, censusTimer: () => ({ cancel() { } }), liveSessions: () => [] }); }
  finally { globalThis.setInterval = si; }
  const ix = eng.store.index, rec = eng.adapterRecords().adapters.find((r) => r.kind === 'fake-poll');
  const N = 2000;
  await ix.update(() => { for (let i = 0; i < N; i++) Object.assign(ix.entry(rec.id, `r${String(i).padStart(5, '0')}`), { title: `[ops-${i % 7}] thread ${i}`, kind: i % 3 ? 'group' : 'dm', lastAt: T - i * 1000, unread: 0, listedAt: T }); });
  const w = GS.forDir(dataDir).set('channel-reach', `account:${rec.id}`, { to: [{ kind: 'group', id: 'T-big', name: 'Big' }] }, 'user');
  await ix.durable();
  const asker = agent('agent-big', ['T-big']);
  const readsBy = (fn) => {
    const orig = ix.live, seen = new Set(), wrapped = new WeakMap();
    ix.live = () => { const m = orig(); if (!wrapped.has(m)) wrapped.set(m, new Proxy(m, { get(t, k, r) { if (typeof k === 'string' && k.includes('/')) seen.add(k); return Reflect.get(t, k, r); } })); return wrapped.get(m); };
    let out; try { out = fn(); } finally { ix.live = orig; }
    return { out, n: seen.size };
  };
  eng.listFor(asker());   // the map kept (a small index: built at its first read)
  const r = readsBy(() => eng.listFor(asker()));
  ok(!!(w && w.ok !== false) && r.out.conversations.length === 200 && r.out.more === N - 200 && r.n <= 200, `⑥ the list of 200 over ${N} rows read ${r.n} rows from the index (≤ the 200 it lists: a row the selector would leave out is dropped from the facts kept beside its key, never read)`, { listed: r.out.conversations.length, more: r.out.more, read: r.n });
}

// ═══ ③ THE MAP VOID: built in slices, never whole in a road's turn ═════════════════════════════════════════════════════════
console.log('③ the per-account map void: its sliced build starts at the first road, the roads answer as the release meanwhile, a search waits');
{
  let seam = null, slices = 0;
  const W2 = await world('void', { walk: { syncRows: 50, sliceMs: 0, onSlice: async (i, what) => { if (what !== 'account-keys') return; slices++; if (seam) { const f = seam; seam = null; await f(i); } } } });
  const REL2 = REL.create(W2.ectx);
  const voidIt = async (k) => { await W2.ix.update((x) => { delete x.conversations[`${W2.A[0]}/c${String(k).padStart(6, '0')}`]; }); await W2.ix.durable(); };
  await voidIt(229);
  const st0 = W2.ix.keysStats();
  const c0 = W2.eng.reachCountFor(ASKERS.wide()), c0rel = REL2.reachCountFor(ASKERS.wide());
  const st1 = W2.ix.keysStats();
  ok(!st0.kept && !st0.warming && st1.warming && !st1.kept && st1.builds === st0.builds + 1 && J(c0) === J(c0rel), `③ the first count after a whole-map touch starts the SLICED build (kept ${st1.kept}, building ${st1.warming}) and answers «${c0}» by the release's walk («${c0rel}»)`, { st0, st1 });
  const rows = Object.keys(W2.ix.live()).length;
  slices = 0;
  let during = null, searches = null;
  seam = async () => {
    const sync = ['count', 'list', 'listAll'];
    const m = await answersOf(W2.eng, W2, { only: sync }), r = await answersOf(REL2, W2, { only: sync });
    during = { d: diffOf(m, r), n: compares(m), building: W2.ix.keysStats().warming };
    searches = Promise.all([W2.eng.searchFor(ASKERS.wide(), 'invoice', { limit: 50 }), W2.eng.searchFor(ASKERS.blind(), 'invoice', { limit: 50 })]).then((x) => ({ x, keptAtAnswer: W2.ix.keysStats().kept }));
  };
  await W2.ix.keysReady();
  const st2 = W2.ix.keysStats();
  ok(!!during && during.building && during.d.length === 0, `③ during the build every count and list (${during && during.n}) is the release's`, during && during.d.slice(0, 3));
  ok(st2.kept && !st2.warming && slices === rows - 1, `③ the build ran to its last slice (${slices} seams of ${rows} rows, one a slice): no road finished it in its own turn`);
  const s = await searches;
  const sRel = [await REL2.searchFor(ASKERS.wide(), 'invoice', { limit: 50 }), await REL2.searchFor(ASKERS.blind(), 'invoice', { limit: 50 })];
  ok(s.keptAtAnswer && J(s.x) === J(sRel), `③ the two searches asked during the build WAITED for it (answered with the map kept) and answer as the release (${s.x[0].results.length} hits · hidden ${s.x[1].hiddenMatch})`);
  const after = await answersOf(W2.eng, W2), afterRel = await answersOf(REL2, W2);
  ok(diffOf(after, afterRel).length === 0, `③ after its landing every road reads the kept map and answers as the release (${compares(after)})`, diffOf(after, afterRel).slice(0, 3));
  // CONTROL: the release's search during the build reads rowsOf, which finishes the build in that turn (the slices stop short)
  await voidIt(228);
  W2.eng.reachCountFor(ASKERS.wide());
  slices = 0;
  let relDuring = null;
  seam = async () => { const p = REL2.searchFor(ASKERS.blind(), 'invoice', { limit: 50 }); relDuring = W2.ix.keysStats(); await p; };
  await W2.ix.keysReady();
  await new Promise((r) => setImmediate(r));
  ok(!!relDuring && relDuring.kept && slices < Object.keys(W2.ix.live()).length - 1, `CONTROL: the release's search during the build finished it in its own turn (kept at once; ${slices} seams, the slices stopped short)`, relDuring);
  // RED: the store handing a PARTIAL map (half of each account's keys) — the walk by account answers otherwise
  const kk = W2.ix.keysKept;
  W2.ix.keysKept = (id) => { const k = kk(id); return k && { keys: new Set([...k.keys].filter((_, i) => i % 2 === 0)), odd: k.odd }; };
  let rp;
  try { rp = diffOf(await answersOf(W2.eng, W2, { only: ['count', 'list'] }), await answersOf(REL2, W2, { only: ['count', 'list'] })); } finally { W2.ix.keysKept = kk; }
  ok(rp.length > 0, `RED: a partial map handed to the roads shows in the differential (${rp.length} answers differ) — the roads never read one: while the map builds they walk the release's way`, rp.slice(0, 2));
}

// ═══ ⑤ THE HOOK: asked at every prompt, nothing kept ══════════════════════════════════════════════════════════════════════
console.log('⑤ the prompt hook keeps no memo: channelsTaughtFor asks the count at every call');
{
  const ART = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const keepsNothing = (t) => {
    const i = t.indexOf('const channelsTaughtFor = ');
    const body = i < 0 ? '' : t.slice(i, t.indexOf('\n};', i));
    return !!body && /eng\.reachCountFor\(/.test(body) && !/Memo|_TTL_|\.set\(s\b|\.get\(s\)/.test(body) && !/channelsReachMemo|CHANNELS_REACH_TTL_MS/.test(t);
  };
  ok(keepsNothing(ART), '⑤ src/agent-routes.js: channelsTaughtFor reads reachCountFor at every call — no per-session memo, no time to live');
  const planted = anchored(ART, '  const t = Date.now();\n  let v = false, x = [];\n', '  const t = Date.now();\n  const m = channelsReachMemo.get(s);\n  if (!fresh && m && t - m.at < CHANNELS_REACH_TTL_MS) return m;\n  let v = false, x = [];\n', 'the hook memo planted back');
  ok(!keepsNothing(planted), 'CONTROL: the release\'s 60 s memo planted back in the text is seen');
}

for (const r of copiesCensus(MB.files, MB.dir, REPO, { minCopies: 6, label: 'B-360d walks ' })) ok(r.pass, r.name, r.pass ? undefined : r.detail);
report();

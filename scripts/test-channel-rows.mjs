#!/usr/bin/env node
// THE FIRST READ AND THE KEYED ROW STORE (design 008, B-3cf8, gate row `test-channel-rows`). userW's first Channels
// open stalled: GET /api/channels answered every conversation (≈ 50 000 rows, 77.5 MB, 1.49 s to first byte). The
// first read now carries the attention rows + each account's newest + the counts, every other row arrives by key
// from GET /api/channels/rows, and the panel draws from a PURE keyed store (src/lib/channel-rows.js).
//   ① THE PROPERTY — over a generated index holding every tag kind at every window edge (inside, exactly on the
//      exclusive edge, past it), `candidateOf` ⊇ `statusTag(rowView) ≠ null`, row for row (a miss would hide a row
//      that matters from the first screen). CONTROL: a candidate test without the held-wake clause loses a row — red.
//   ② the first read's attention list = `focusRows` over the whole list, key for key; the heads are each account's
//      newest listed rows; the counts = the whole list's numbers (unlisted rows excluded, the built-in watcher out of All).
//   ③ THE STORE's tables: first → pages → partial broadcasts in every case of the never-loaded rule → a page asked
//      before a broadcast → a non-partial broadcast (stale lists) → an account removed → an account with no row yet.
//   ④ SOURCE CENSUS: no client file reads a digest's `conversations` as "every conversation" — the keyed store is the
//      one reader (its two doors); the sliver readers ask their scope. CONTROL: a planted full-list reader is named.
// In-process, the clock injected; per-pid scratch dirs (scripts/scratch.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const FO = require(path.join(REPO, 'src/channel-focus.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const V = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-groups-view.js')).href);
const RS = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-rows.js')).href);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const ROOT = scratch('chan-rows');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() {}, warn() {}, error() {} };
const T = Date.UTC(2026, 9, 3, 6, 0, 0);
const H = 3600e3, DAY = 24 * H, WEEK = 7 * DAY;
let clock = T;

// ═══ ① + ② over a real engine ═══════════════════════════════════════════════
console.log('① the property: candidateOf ⊇ statusTag(rowView) ≠ null, row for row');
const eng = ENG.create({ dataDir: path.join(ROOT, 'eng'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: () => clock, log: quiet });
const ix = eng.store.index;
const A = 'fake-poll', B = 'fake-push';   // B's whole account is handed to an agent (its rows wear a tag only when a wake acted — D4)
const AG = { kind: 'agent', id: 'cid-ops', name: 'Ops desk' };
const edges = (win) => [['in', win - 1], ['edge', win], ['out', win + 1]];   // the window's edge is EXCLUSIVE
const rows = [];   // [adapter, id, facts, expect-a-tag?]
let n = 0;
const add = (adapter, what, facts, tagged) => rows.push([adapter, `r${String(n++).padStart(3, '0')}-${what}`, facts, tagged]);
for (const [e, d] of edges(DAY)) {
  add(A, `read-${e}`, { agentReads: [{ id: 'cid-r', name: 'Reader', at: T - d, upTo: T - d }] }, e === 'in');
  add(A, `self-${e}`, { selfAt: T - d }, e === 'in');
  add(A, `own-sent-${e}`, { _sent: T - d }, e === 'in');
  add(A, `direct-${e}`, { kind: 'dm', unread: 2, lastAt: T - d }, e === 'in');
  add(B, `woken-${e}`, { stats: { wakes: [{ at: T - d, ok: true, lane: 'live', n: 1 }] } }, e === 'in');
}
for (const [e, d] of edges(WEEK)) {
  add(A, `held-wake-${e}`, { stats: { wakes: [{ at: T - d, ok: false, lane: 'none', n: 1 }] } }, e === 'in');
  add(A, `refusal-${e}`, { stats: { lastRefusal: { at: T - d, why: 'cap' } } }, e === 'in');
  add(B, `held-scope-${e}`, { stats: { wakes: [{ at: T - d, ok: false, lane: 'none', n: 1 }] } }, e === 'in');
}
add(A, 'pending', { pending: [{ at: T - H, for: null }] }, true);
add(A, 'pending-elided', { pendingElided: 3 }, true);
add(A, 'awaiting', { _proposal: 'awaiting-approval' }, true);
add(A, 'unknown', { _proposal: 'unknown' }, true);
add(A, 'conv-grain', { access: [{ principal: AG, authority: 'draft' }], watchers: [{ principal: AG, notify: 'each', mode: 'all' }] }, true);
add(A, 'conv-legacy', { assignment: { principal: AG, authority: 'draft', notify: 'each', mode: 'all' } }, true);
add(A, 'nothing', {}, false);
add(A, 'unread-group', { kind: 'group', unread: 5, lastAt: T - H }, false);
add(B, 'scope-only', {}, false);
add(A, 'unlisted-awaiting', { _proposal: 'awaiting-approval', unlistedAt: T - DAY }, false);
// filler: quiet rows beneath (the heads must not be them all)
for (let i = 0; i < 70; i++) add(i % 2 ? A : B, `quiet-${i}`, { lastAt: T - 30 * DAY - i * 1000 }, false);
await ix.update((x) => {
  x.accountAssignments = { ...(x.accountAssignments || {}), [B]: { access: [{ principal: AG, authority: 'draft' }], watchers: [{ principal: AG, notify: 'each', mode: 'all' }] } };
  for (const [a, id, f] of rows) {
    const en = ix.entry(a, id);
    const { _sent, _proposal, ...facts } = f;
    Object.assign(en, { title: `Room ${id}`, kind: 'group', lastAt: T - 40 * DAY + n, unread: 0, lastText: `last line of ${id}` }, facts);
  }
});
await eng.store.outbox.update((ob) => {
  ob.proposals = ob.proposals || {};
  for (const [a, id, f] of rows) {
    if (f._proposal) ob.proposals[`p-${id}`] = { id: `p-${id}`, key: `${a}/${id}`, adapterId: a, convId: id, state: f._proposal, text: 'draft', draftedBy: { kind: 'agent', id: 'cid-a9' }, at: T - H, updatedAt: T - H };
    if (f._sent) ob.proposals[`p-${id}`] = { id: `p-${id}`, key: `${a}/${id}`, adapterId: a, convId: id, state: 'sent', text: 'mine', draftedBy: { kind: 'user', id: 'owner' }, result: { at: f._sent }, at: f._sent, updatedAt: f._sent };
  }
});
const liveIx = ix.live();
const whole = eng.digest({ keys: Object.keys(liveIx) });
const byKey = new Map(whole.conversations.map((c) => [c.key, c]));
const obOf = (key) => {   // the viewCtx's outbox count for one key (the same three facts)
  const c = { awaiting: 0, unknown: 0, ownSentAt: 0 };
  for (const p of Object.values(eng.store.outbox.live().proposals || {})) {
    if (!p || p.key !== key) continue;
    if (p.state === 'awaiting-approval') c.awaiting++;
    if (p.state === 'unknown') c.unknown++;
    if (p.state === 'sent' && p.draftedBy && p.draftedBy.kind === 'user') c.ownSentAt = Math.max(c.ownSentAt, Number((p.result && p.result.at) || p.updatedAt || p.at) || 0);
  }
  return c;
};
const property = (cand) => {
  const misses = [], tags = {};
  for (const [a, id] of rows) {
    const key = `${a}/${id}`, v = byKey.get(key), tag = FO.statusTag(v, clock);
    tags[id] = tag ? tag.code : null;
    if (tag && !cand(liveIx[key], obOf(key), clock)) misses.push(id);
  }
  return { misses, tags };
};
const P = property(FO.candidateOf);
const wrong = rows.filter(([a, id, f, want]) => !f.unlistedAt && !!P.tags[id] !== want).map(([, id]) => `${id}=${P.tags[id]}`);
ok(wrong.length === 0, `FIXTURE: ${rows.length} rows — every tag kind at every window edge wears its tag exactly inside the window (the D4 scope rows only once a wake acted)`, wrong);
const kinds = new Set(Object.values(P.tags).filter(Boolean));
ok(['awaiting', 'unknown', 'assigned', 'read', 'held', 'direct', 'replied'].every((k) => kinds.has(k)), `FIXTURE: the generated index holds every tag kind (${[...kinds].join(', ')})`);
ok(P.misses.length === 0, `THE PROPERTY: candidateOf names every row statusTag tags (${Object.values(P.tags).filter(Boolean).length} tagged, ${rows.filter(([a, id]) => FO.candidateOf(liveIx[`${a}/${id}`], obOf(`${a}/${id}`), clock)).length} candidates of ${rows.length})`, P.misses);
{
  const MUT = mutantCopies('chan-rows', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/channel-focus.js'), 'utf8');
  const clause = "    if (!delivered && lane === 'none' && within(lw.at, now, HELD_WINDOW_MS)) return true;\n";
  ok(src.split(clause).length === 2, 'CONTROL: the held-wake clause is spelled once');
  const M = MUT.load('src/channel-focus.js', src.replace(clause, ''), 'no-held-wake');
  const C = property(M.candidateOf);
  ok(C.misses.length > 0 && C.misses.every((id) => /held-(wake|scope)-in/.test(id)), `CONTROL: a candidate test without the held-wake clause loses the rows only a held wake tags — red (${C.misses.join(', ')})`);
}

console.log('② the first read: the attention list, the heads, the counts');
{
  const first = eng.digest();
  const glr = V.groupListRows({ groups: [], conversations: whole.conversations, adapters: whole.adapters });
  const focus = V.focusRows(glr.rows, clock).map((r) => r.key).sort();
  const att = first.conversations.filter((c) => !c.unlisted && FO.statusTag(c, clock)).map((c) => c.key).sort();
  ok(first.scope === 'first' && JSON.stringify(att) === JSON.stringify(focus) && first.attention.total === focus.length && first.attention.cut === 0, `the first read's attention list = focusRows over the whole list, key for key (${focus.length} rows)`, { att: att.length, focus: focus.length });
  const newest = (a) => whole.conversations.filter((c) => c.adapterId === a && !c.unlisted).sort(FO.pageOrder).slice(0, FO.HEAD_ROWS).map((c) => c.key);
  ok([A, B].every((a) => JSON.stringify(first.heads[a]) === JSON.stringify(newest(a))), `each account's head = its newest ${FO.HEAD_ROWS} listed rows, newest first`);
  const inFirst = new Set(first.conversations.map((c) => c.key));
  ok(Object.values(first.heads).flat().every((k) => inFirst.has(k)) && first.conversations.length === new Set([...att, ...Object.values(first.heads).flat()]).size, `every head row and attention row rides the first read ONCE (${first.conversations.length} rows of ${whole.conversations.length})`);
  const listed = (a) => whole.conversations.filter((c) => c.adapterId === a && !c.unlisted).length;
  ok(first.counts.byAdapter[A] === listed(A) && first.counts.byAdapter[B] === listed(B) && first.counts.all === glr.rows.length, `the counts are the whole list's: All ${first.counts.all} = the first screen's rows of the whole list, ${A} ${first.counts.byAdapter[A]}, ${B} ${first.counts.byAdapter[B]} (unlisted excluded)`, first.counts);
  const stats0 = eng.digestStats().rowViews;
  eng.digest();
  const viewed = eng.digestStats().rowViews - stats0;
  ok(viewed <= FO.ATTENTION_MAX + FO.HEAD_ROWS * 3 && viewed < whole.conversations.length, `a first read builds ${viewed} rowViews (candidates + heads) for ${whole.conversations.length} rows`);
  ok(JSON.stringify(Object.keys(eng.digest({ scope: 'totals' })).sort()) === JSON.stringify(['at', 'awaitingTotal', 'scope', 'unreadTotal']) && !('conversations' in eng.digest({ scope: 'accounts' })), 'the slivers: ?scope=totals is the two numbers, ?scope=accounts carries no row');
  // the focus view of rows(): the attention rows past a cut, paged in the same order
  const fp = eng.rows({ view: 'focus', limit: 5 });
  ok(fp.ok && fp.total === focus.length && fp.rows.every((r) => FO.statusTag(r, clock)) && JSON.stringify(fp.rows.map((r) => r.key)) === JSON.stringify(first.conversations.filter((c) => !c.unlisted && FO.statusTag(c, clock)).sort(FO.pageOrder).slice(0, 5).map((c) => c.key)), `rows({view:'focus'}) pages the attention list in the first read's order (${fp.total})`);
}
try { eng.stop && eng.stop(); } catch {}

// ═══ ③ the store ═══════════════════════════════════════════════════════════
console.log('③ the keyed store: first → pages → broadcasts → stale → an account gone');
{
  const NOW = T;
  const ad = (id, extra = {}) => ({ id, label: id.toUpperCase(), kind: 'fake', ...extra });
  const row = (a, id, lastAt, extra = {}) => ({ key: `${a}/${id}`, id, adapterId: a, adapterLabel: a.toUpperCase(), title: `T ${id}`, kind: 'group', lastAt, lastText: `about ${id}`, unread: 0, unlisted: false, outbox: { awaiting: 0, unknown: 0 }, touch: null, assignment: null, watchers: [], ...extra });
  const tagged = { outbox: { awaiting: 1, unknown: 0 } };
  const adapters = [ad('x'), ad('y'), ad('agents', { builtin: true })];
  const s = RS.createRowStore();
  const att = row('x', 'att', NOW - 50 * DAY, tagged);
  const hx = Array.from({ length: 3 }, (_, i) => row('x', `h${i}`, NOW - i * H));
  const hy = [row('y', 'h0', NOW - 30 * 60e3)];
  const first = { scope: 'first', partial: false, adapters, counts: { all: 10, byAdapter: { x: 8, y: 2, agents: 0 } }, attention: { total: 1, cut: 0 }, unreadTotal: 0, awaitingTotal: 1,
    conversations: [att, ...hx, ...hy], heads: { x: hx.map((r) => r.key), y: hy.map((r) => r.key), agents: [] } };
  const stale0 = RS.applyFirst(s, first, NOW);
  const keys = (name) => RS.listRows(s, name).map((r) => r.id).join(',');
  ok(stale0.length === 0 && keys('account:x') === 'h0,h1,h2' && keys('account:y') === 'h0' && RS.focusRowsOf(s, NOW).map((r) => r.id).join() === 'att', 'applyFirst: the heads become the account lists, the attention row is held (focus), nothing stale on a first read');
  ok(s.lists.get('account:x').next && s.lists.get('account:x').next.key === 'x/h2' && s.lists.get('account:y').next !== null && s.lists.get('account:agents').next === null, 'an account with more rows than its head has a cursor after the head; an empty one has none');
  const q1 = RS.pageQueryOf(s, 'account:x');
  ok(q1.adapter === 'x' && q1.beforeKey === 'x/h2' && q1.limit === '200' && q1.view === 'all', `an account's "Show more" asks 200 after its head (${JSON.stringify(q1)})`);
  // All: a first page of 2, then the next
  RS.applyPage(s, 'all', { rows: [hy[0], hx[0]].sort(FO.pageOrder), next: FO.pageCursor(hx[0]), total: 10 });
  ok(keys('all') === 'h0,h0' && RS.pageQueryOf(s, 'all').beforeKey === 'x/h0' && RS.pageQueryOf(s, 'all').limit === '60', 'applyPage: All holds its first page; its "Show more" asks 60 after the last row');
  RS.applyPage(s, 'all', { rows: [hx[0], hx[1]], next: FO.pageCursor(hx[1]), total: 10 });
  ok(keys('all') === 'h0,h0,h1', 'a row read twice (it moved between two reads) is held once');
  const b = (convs, extra = {}) => RS.applyBroadcast(s, { partial: true, adapters, counts: { all: 10, byAdapter: { x: 8, y: 2 } }, conversations: convs, ...extra }, NOW);
  // (a) a never-loaded row gains a tag → it joins the attention list
  b([row('x', 'deep', NOW - 40 * DAY, tagged)]);
  ok(s.byKey.has('x/deep') && RS.focusRowsOf(s, NOW).some((r) => r.id === 'deep') && !keys('all').includes('deep'), '(a) a row the client never loaded gains a tag → it is taken (attention), and not into All (it sorts past All\'s cursor)');
  // (b) …and loses it → it leaves
  b([row('x', 'deep', NOW - 40 * DAY)]);
  ok(!s.byKey.has('x/deep') && !RS.focusRowsOf(s, NOW).some((r) => r.id === 'deep'), '(b) a held row that lost its tag and belongs to no loaded range leaves');
  // (c) a new message in a never-loaded chat → the top of All and of its (loaded) account
  b([row('x', 'news', NOW + 60e3)]);
  ok(keys('all').startsWith('news,') && keys('account:x').startsWith('news,') && s.byKey.has('x/news'), '(c) a new message in a never-loaded chat → at the top of All and of its account');
  // (d) a never-loaded quiet row past every cursor → dropped (paging brings it; the counts already hold it)
  b([row('x', 'old', NOW - 90 * DAY)]);
  ok(!s.byKey.has('x/old') && !keys('all').includes('old'), '(d) a never-loaded untagged row past the loaded range is dropped');
  // (e) a held row moves up: kept, re-ordered
  b([row('x', 'h1', NOW + 120e3)]);
  ok(keys('all').startsWith('h1,news,') && keys('account:x').startsWith('h1,news,'), '(e) a held row that moved to the top is re-ordered in place');
  // (f) unlisted → leaves the lists; a built-in watcher's row never enters All
  b([row('x', 'h0', NOW - 1, { unlisted: true }), row('agents', 'sess', NOW + 1e6)]);
  ok(!keys('all').split(',').includes('h0') || keys('all') === 'h1,news,h0', 'fixture guard');
  ok(!RS.listRows(s, 'all').some((r) => r.key === 'x/h0') && !RS.listRows(s, 'account:x').some((r) => r.key === 'x/h0') && !keys('all').includes('sess') && keys('account:agents') === 'sess', '(f) an unlisted row leaves All and its account; the built-in watcher\'s row joins its own (complete) list, never All');
  // (g) a complete list takes any row that belongs
  ok(s.lists.get('account:agents').next === null, '(g) the watcher\'s list is complete — a new row joins it wherever it sorts');
  // (h) a page asked before a broadcast keeps the broadcast's copy
  const gen = s.gen;
  b([row('y', 'h0', NOW + 5e6, { lastText: 'fresh' })]);
  RS.applyPage(s, 'account:y', { rows: [row('y', 'h0', NOW - 30 * 60e3, { lastText: 'stale' }), row('y', 'p1', NOW - 2 * DAY)], next: null, total: 2 }, { gen });
  ok(s.byKey.get('y/h0').lastText === 'fresh' && keys('account:y') === 'h0,p1', '(h) a page read while a broadcast landed keeps the broadcast\'s row (and still lists it)');
  // the search list: the server's answer; a never-loaded match joins it, a row that stops matching leaves
  RS.applyPage(s, 'search', { rows: [row('x', 'q1', NOW - 3 * DAY, { title: 'Quarterly plan' })], next: null, total: 1 }, { q: 'quarterly' });
  b([row('x', 'q2', NOW - 4 * DAY, { title: 'quarterly numbers' }), row('x', 'q1', NOW - 3 * DAY, { title: 'Renamed' })]);
  ok(keys('search') === 'q2' && s.lists.get('search').q === 'quarterly', 'the search list follows its words: a new match joins (the list is whole), a renamed row leaves');
  // (i) a NON-partial broadcast = the first read's shape: heads replaced, every other loaded list stale
  RS.applyPage(s, 'account:x', { rows: [row('x', 'p9', NOW - 3 * DAY)], next: { lastAt: NOW - 3 * DAY, key: 'x/p9' }, total: 8 });
  const r2 = RS.applyBroadcast(s, { ...first, conversations: [att, ...hx, ...hy], attention: { total: 1, cut: 0 } }, NOW);
  ok(r2.refetch.includes('all') && r2.refetch.includes('search') && r2.refetch.includes('account:x') && ['h0', 'h1', 'h2', 'p9'].every((k) => keys('account:x').split(',').includes(k)) && s.lists.get('all').stale && s.lists.get('account:x').had > 3, `(i) a non-partial broadcast gives every account its head — a paged one KEEPS its range (owner 2026-10-03) — and marks the paged lists stale (${r2.refetch.join(', ')}) — the panel re-reads the one on screen`, keys('account:x') + ' · stale ' + JSON.stringify(r2.refetch));
  const rq = RS.pageQueryOf(s, 'all', { more: false });
  ok(!rq.beforeKey && Number(rq.limit) >= 60 && Number(rq.limit) <= 200, `a stale list re-reads what it had from the top, ≤ 200 rows (${JSON.stringify(rq)})`);
  // (j) an account removed → its rows and its list leave
  RS.applyBroadcast(s, { partial: true, adapters: [ad('x'), ad('agents', { builtin: true })], counts: { all: 8, byAdapter: { x: 8 } }, conversations: [] }, NOW);
  ok(![...s.byKey.values()].some((r) => r.adapterId === 'y') && !s.lists.has('account:y'), '(j) an account that is gone takes its rows and its list with it');
  ok(s.lists.get('all').total === 8 && s.lists.get('account:x').total === 8, 'the lists\' totals follow the broadcast\'s kept counts');
  // (k) an account with NO row at the first read (its first pass still running): its list exists, whole — the
  //     broadcast's first rows join it (the e2e boot order: the panel opens before the passes)
  const s2 = RS.createRowStore();
  RS.applyFirst(s2, { partial: false, adapters: [ad('x')], counts: { all: 0, byAdapter: { x: 0 } }, attention: { total: 0, cut: 0 }, conversations: [], heads: {} }, NOW);
  RS.applyBroadcast(s2, { partial: true, adapters: [ad('x')], counts: { all: 2, byAdapter: { x: 2 } }, conversations: [row('x', 'n1', NOW), row('x', 'n2', NOW - 1)] }, NOW);
  ok(s2.lists.get('account:x') && RS.listRows(s2, 'account:x').map((r) => r.id).join() === 'n1,n2', '(k) an account with no row at the first read keeps a whole (empty) list — its first rows join it from the broadcast');
}

console.log('④ source census: the full-list readers');
{
  const LIB = path.join(REPO, 'src/lib');
  // every `.conversations` a client file reads, judged: the store's two doors read a digest's rows; the rest read COUNTS
  const JUDGED = [
    ['src/lib/channel-rows.js', 'for (const r of d.conversations || []) { if (!r || !r.key) continue; store.byKey.set', 'the store: applyFirst (the first read\'s rows, by key)'],
    ['src/lib/channel-rows.js', '  for (const r of d.conversations || []) {\n', 'the store: applyBroadcast (a partial broadcast\'s changed rows, by key)'],
    ['src/lib/channels-panel.js', "t('{n} conversations', { n: sc.conversations })", 'a COUNT — the scheduler census (kept facts)'],
    ['src/lib/channel-filter-editor.js', "t('over {n} conversations', { n: e.conversations })", 'a COUNT — a rule\'s estimate'],
  ];
  const census = (files) => {
    const hits = [];
    for (const [rel, src] of files) src.split('\n').forEach((line, i) => { if (/\.conversations\b/.test(line) && !/^\s*(\/\/|\*)/.test(line)) hits.push({ rel, line: i + 1, text: line.trim().slice(0, 160), raw: line + '\n' }); });
    return { hits, unjudged: hits.filter((h) => !JUDGED.some(([f, phrase]) => f === h.rel && h.raw.includes(phrase))) };
  };
  const files = fs.readdirSync(LIB).filter((f) => f.endsWith('.js')).map((f) => [`src/lib/${f}`, fs.readFileSync(path.join(LIB, f), 'utf8')]);
  const c = census(files);
  ok(c.hits.length === JUDGED.length && c.unjudged.length === 0, `every client read of a digest's \`conversations\` is judged (${c.hits.length}: the store's two doors + two counts) — no surface treats the first read as every conversation`, c.unjudged);
  const fetched = files.filter(([, src]) => /fetchJson\('\/api\/channels'\)/.test(src)).map(([rel]) => rel);
  ok(fetched.join() === 'src/lib/channels-panel.js', `GET /api/channels (the first read) is fetched by the panel alone; the rail asks ?scope=totals, the window ?scope=accounts, a chat card rows?conv= (${fetched.join(', ')})`);
  const planted = census([...files, ['src/lib/chat-renderers.js', "    const hit = (d.conversations || []).find((c) => c.id === ref.convId);\n"]]);
  ok(planted.unjudged.length === 1 && planted.unjudged[0].rel === 'src/lib/chat-renderers.js', 'CONTROL: a planted full-list reader (the chat card\'s pre-008 lookup) is named by the census — red', planted.unjudged);
}

// ═══ verify r1 (lane channels-first-read) ═════════════════════════════════════
{
  console.log('verify r1 — G: a row that LOST its tag leaves the first screen · C: the cut keeps the urgent · S: search drops hidden characters');
  clock = T;
  const ve = ENG.create({ dataDir: path.join(ROOT, 'vr1'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: () => clock, log: quiet });
  const vx = ve.store.index;
  const fresh = () => JSON.parse(JSON.stringify(ve.digest()));
  const tagIt = async (on) => {
    await ve.store.outbox.update((ob) => { ob.proposals = { ...(ob.proposals || {}), 'p-v': { id: 'p-v', key: `${A}/v-await`, adapterId: A, convId: 'v-await', state: on ? 'awaiting-approval' : 'sent', text: 'd', draftedBy: { kind: 'agent', id: 'x' }, at: T - H, updatedAt: T - H } }; });
    await vx.update(() => {
      const g = vx.entry(A, 'v-grain'); g.access = on ? [{ principal: AG, authority: 'draft' }] : []; g.watchers = on ? [{ principal: AG, notify: 'each', mode: 'all' }] : [];
      vx.entry(A, 'v-held').stats = { wakes: [{ at: T - DAY, ok: !on, lane: on ? 'none' : 'live', n: 1 }] };
    });
  };
  await vx.update(() => {
    for (let i = 0; i < 40; i++) for (const a of [A, B]) Object.assign(vx.entry(a, `vq${i}`), { title: `Quiet ${i}`, kind: 'group', lastAt: T - H - i * 1000, unread: 0 });   // the heads: never the rows below
    Object.assign(vx.entry(A, 'v-await'), { title: 'Await', kind: 'group', lastAt: T - 400 * DAY, unread: 0 });
    Object.assign(vx.entry(A, 'v-held'), { title: 'Held', kind: 'group', lastAt: T - 401 * DAY, unread: 0 });
    Object.assign(vx.entry(A, 'v-grain'), { title: 'Handed', kind: 'group', lastAt: T - 402 * DAY, unread: 0 });
    Object.assign(vx.entry(A, 'v-part'), { title: null, kind: 'group', lastAt: T - 500 * DAY, participants: 'Bo\u{200b}b Lee', lastText: 'x' });
    Object.assign(vx.entry(A, 'v-dm'), { title: null, kind: 'dm', lastAt: T - 501 * DAY, authors: [{ id: 'u1', name: 'Dan\u{ad}iel Ng' }], lastText: 'y' });
  });
  await tagIt(true);
  const urgent = ['v-await', 'v-held', 'v-grain'].map((id) => `${A}/${id}`);
  const d1 = fresh();
  const st = RS.createRowStore(), st2 = RS.createRowStore();
  RS.applyFirst(st, d1, clock); RS.applyFirst(st2, d1, clock);
  const foc1 = RS.focusRowsOf(st, clock).map((r) => r.key);
  ok(urgent.every((k) => foc1.includes(k)) && foc1.length === 3, 'G (precondition): the three tagged rows — none of them a head — are the first screen', foc1);
  await tagIt(false);   // while this client is away: the draft is sent, the hand-over revoked, the held wake delivered
  const d2 = fresh();
  ok(d2.attention.total === 0, 'G: the server tags none of them now');
  RS.applyFirst(st, d2, clock);                               // a reconnect
  RS.applyBroadcast(st2, { ...d2, partial: false }, clock);   // a non-partial broadcast
  for (const [how, s2] of [['a reconnect', st], ['a non-partial broadcast', st2]]) {
    const ghosts = RS.focusRowsOf(s2, clock).map((r) => r.key).filter((k) => urgent.includes(k));
    ok(!ghosts.length, `G: after ${how} no row that lost its tag stays on the first screen (stale copies: ${ghosts.length})`, ghosts);
  }
  // C: 320 newer rows wear "replied" — past ATTENTION_MAX the cut must not drop the old urgent ones
  await tagIt(true);
  await vx.update(() => { for (let i = 0; i < 320; i++) Object.assign(vx.entry(i % 2 ? A : B, `rep${i}`), { title: `Replied ${i}`, kind: 'group', lastAt: T - 2 * H - i * 1000, unread: 0, selfAt: T - H }); });
  const d3 = fresh();
  const st3 = RS.createRowStore(); RS.applyFirst(st3, d3, clock);
  const foc3 = RS.focusRowsOf(st3, clock).map((r) => r.key);
  ok(urgent.every((k) => foc3.includes(k)), 'C: 320 newer "replied" rows never push an old awaiting / held / handed-over row off the first screen (the cut keeps TAG_ORDER first)', foc3.length);
  ok(foc3.length + d3.attention.cut === d3.attention.total && d3.attention.total === 323, `C: drawn + cut = total (${foc3.length} + ${d3.attention.cut} = ${d3.attention.total})`);
  for (const [q, key] of [['bob', `${A}/v-part`], ['daniel', `${A}/v-dm`]]) {
    const got = ve.rows({ q }).rows.map((v) => v.key);
    ok(got.includes(key), `S: q=${q} finds the row whose shown name is clean of a hidden character the raw name holds`, got);
  }
}

console.log(`\ntest-channel-rows: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

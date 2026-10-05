#!/usr/bin/env node
// A LINKED ACCOUNT IS AN AGGREGATED IM (owner ruling 2026-09-26; design
// docs/design-communication-panel.zh.md §5 invariant 6 as rewritten, §6.2,
// §6.5, §7.3, §8; gate row `test-channels-aggregate`, heavy since B-f4cb — 54 s).
//
// The REAL engine over the REAL store and the REAL registry, with a scripted
// adapter module that talks to nothing and COUNTS every call — the owner's
// scale (873 conversations on one account, a second account of the same
// kind beside it), an injected clock moved by hand:
//
//   ① every conversation is DISCOVERED (the cursor walked to the end — the
//      old 5-page bound hid everything past 500) and INGESTED, no track step;
//      a first ingest takes ONE page and marks the pre-link backlog read
//   ② the scheduler is PER CONVERSATION: hot 30 s / warm 5 min / cold 15 min
//      — the history calls of a timer pass ARE the arithmetic
//   ③ the budget is the account's, in the VENDOR's unit (a metered adapter
//      charges what it sends); an exhausted window stops the pass, the rest
//      waits, the account row says so with its numbers
//   ④ the owner's override (30 s … 15 min, paused) wins, persists, restarts
//   ⑤ a live push lane that carries content drops polling to the cold
//      safety net; a pushed record for a never-discovered conversation is
//      INGESTED (no `untracked` drop); a kick naming a conversation makes it
//      due; a parked Lark lane without its SDK says the remedy
//   ⑥ the agent's refresh: reach first, the floor, the budget — refusals
//      named with their numbers
//   ⑥f (r5) THE CONCURRENCY TABLE: callers × keys × account state ⇒ exactly
//      the vendor calls, every answer honest, the share charged the fetch
//      count, every refusal by name — the request set drained by ONE judge
//   ⑥g (r5 verify) the set under attack: a request storm cannot starve the
//      timer, a long timer pass cannot starve a request, the cap, stop, remove
//   ⑦ history on open + scroll-up: the window's watch refreshes a stale
//      conversation; older pages are PREPENDED in order and never wake anybody
//   ⑧ attachments through the ROUTE (a real express server on a free port):
//      nosniff + sandbox CSP, `attachment` unless a raster image asked
//      inline, svg never inline, 0600 files, LRU eviction at the budget
//   ⑨ the three assignment grains reach EXACTLY their sets; a new matching
//      conversation inherits within one pass; wakes count against ONE ledger
//      per assignment; an inherited digest is ONE block per window
//   ⑩ a restart keeps all of it; the migration turns tracked into hot
//   ③d (lane R5, the owner: "gmail一直被限速 你可能要控制下gmail默认的读取速度") a
//      vendor RATE refusal is a SHORT wait said by the vendor's name — 5 s
//      doubling to 60 s, or the vendor's own Retry-After — never the failure
//      ladder, never a 15-minute park, filed in "For you" only when it
//      persists; an auth refusal still climbs 30 s → 15 min and speaks at 3
//   ③e the PER-SECOND pace in the real engine (drain rule 18): 873 first
//      reads at 40 units each under the Gmail defaults — ≤ 80 units in any
//      second, ≤ 2440 in any minute, the first-read line mid-way; the pace
//      off (the control) is the burst the vendor refused; a real-time watchdog
//      turns a driver that spins on `wait` into a red, never a hang
//   ③f (lane R5 verify) a request filed DURING a pace wait is judged at sight:
//      the sleeping pass is woken, a refusal never waits out the ≤ 1 s sleep;
//      the no-wake engine (the R5 build) is the control
//   ③h (B-df40 part 3) the vendor rows DECLARED once (src/channel-settings.js): every
//      real adapter's budget / pace key has its derived schema row and back; today's
//      numbers (V1); a stored out-of-range value clamped + said once through the
//      derived bound (V2; an engine copy without the derivation is the control); the
//      engine's budgetDecl / paceDecl read the default the schema shows (V4)
//   ⑪ negative controls (patched copies outside the tree): the old discovery
//      bound hides conversation 501+; a scheduler that polls everything each
//      pass breaks the arithmetic
//
// Zero vendor calls; per-pid scratch dirs (scripts/scratch.mjs).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const CS0 = require(path.join(REPO, 'src/channel-settings.js'));
/** B-df40 part 3: a scripted module that reads a budget key of ITS OWN (changed live mid-leg) declares it in a
 *  suite-only table for its kind — registration refuses an undeclared key; the registry's `channelSettings` seam
 *  (never passed in production: test-channel-adapter-contract ⑦). The engine bounds it with its sanity range
 *  (1..1e6), exactly as before. */
const ownKey = (kind, key, dflt) => ({ channelSettings: { ...CS0.CHANNEL_SETTINGS, [kind]: { vendor: kind, vendorName: kind, rows: [{ key, role: 'budget', type: 'number', default: dflt, min: 1, max: 1e6, label: kind, description: kind }] } } });
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const caps = require(path.join(REPO, 'src/channel-caps.js'));
const { makeRecord, makeConversation } = require(path.join(REPO, 'src/channel-record.js'));
const routes = require(path.join(REPO, 'src/routes/channels.js'));
// r9: THE DRAIN IS PURE (src/channel-drain.js) — the engine only drives it. A control that reconstructs an
// old SCHEDULING shape patches the MODEL (and, for a delivery / seam shape, the engine's driver); both copies
// live in the suite's scratch dir (scripts/mutant-copy.mjs), the engine copy requiring the model copy by
// absolute path — a CLOSED WORLD — so every control still runs the real driver, store and scripted adapter
// over the one patched rule.
const DRAIN_SRC = fs.readFileSync(path.join(REPO, 'src/channel-drain.js'), 'utf-8');
const ENGINE_SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
const DRAIN_REQUIRE = "const Drain = require('../channel-drain.js');";
function closedWorld(M, tag, { drain = [], engine = [] } = {}) {
  let d = DRAIN_SRC, e = ENGINE_SRC;
  const missing = [];
  for (const [a, b] of drain) { if (!d.includes(a)) missing.push('drain: ' + a.slice(0, 70)); d = d.replace(a, b); }
  for (const [a, b] of engine) { if (!e.includes(a)) missing.push('engine: ' + a.slice(0, 70)); e = e.replace(a, b); }
  const changed = d !== DRAIN_SRC || e !== ENGINE_SRC;
  if (!e.includes(DRAIN_REQUIRE)) missing.push('engine: the drain require');
  const dPath = M.write('src/channel-drain.js', d, null, { esm: false, name: `drain-${tag}-${process.pid}` });
  e = e.replace(DRAIN_REQUIRE, `const Drain = require(${JSON.stringify(dPath)});`);
  return { mod: M.load('src/server/channels-engine.js', e, tag), setup: changed && missing.length === 0, missing: missing.join('; ') };
}
// the drain's rule lines the controls patch (each spelled ONCE in src/channel-drain.js)
const DRAIN_LINES = {
  round: '    waiters: ids(pick.reqs),   // THE ROUND',
  backoffGate: "    else return { refuse: true, code: 'backoff', rule: 'backoff' };   // THE BACK-OFF GATE",
  backoffAtFetch: "  if (p.backoff && !pick.reqs.some((r) => r.origin === 'owner')) return { ...base, type: 'refuse', key: pick.key, code: 'backoff', rule: 'backoff', waiters: ids(pick.reqs) };",
  slot: 'function slotOf(r) { return r.key; }',
  pressFree: '  const pressFree = p.backoff && p.pressKey === null && s.backoff.pressEpoch !== s.backoff.epoch;',
  pressOne: '    const v = verdict(s, g, pressFree && granted === null);',
  cap: "  const cap = origin === 'agent' ? REFRESH_QUEUE_CAP - REFRESH_OWNER_RESERVE : REFRESH_QUEUE_CAP;",
  cut: '  if (!(s.budget.remainingUnits > 0)) {\n    if (seen.length)',
  interleave: "  if (p.last === 'request' && !pick.due) { const t = queue.find((it) => it.due); if (t) pick = t; }   // THE INTERLEAVE",
  rank: 'const byRank = (a, b) => (Number(b.human) - Number(a.human)) || (a.minSeq - b.minSeq);',
  seen: '  const seen = s.requests;   // every waiter present',
};

const ROOT = scratch('chan-agg');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() {}, warn() {}, error() {} };

// ── THE SCRIPTED WORLD ─────────────────────────────────────────────────────
// One world per test engine: conversations with a deterministic record set,
// the clock that stamps them, and a CALL LEDGER keyed by method + convId.
const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
function makeWorld(t0, { n = 873, hot = 50, warm = 200, perConv = 3, deep = [] } = {}) {
  const convs = new Map();
  const add = (id, { title, lastAgo, count = perConv, kind = 'group', participants = 'Ada, Brook', authors = null, attach = false } = {}) => {
    const recs = [];
    for (let i = 0; i < count; i++) {
      const at = t0 - lastAgo - (count - 1 - i) * 60e3;
      const who = authors ? authors[i % authors.length] : { id: `u-${i % 3}`, name: ['Ada', 'Brook', 'Cass'][i % 3] };
      recs.push({ vendorId: `${id}-m${i}`, at, author: who, text: `message ${i} in ${title || id}`, attachments: attach && i === count - 1 ? [{ id: `${id}-img`, name: 'photo.png', mime: 'image/png' }, { id: `${id}-doc`, name: 'notes.txt', mime: 'text/plain' }, { id: `${id}-svg`, name: 'vector.svg', mime: 'image/svg+xml' }] : [] });
    }
    convs.set(id, { id, title: title || id, kind, participants, recs });
  };
  for (let i = 0; i < n; i++) {
    const tier = i < hot ? 'hot' : i < hot + warm ? 'warm' : 'cold';
    const lastAgo = tier === 'hot' ? 10 * MIN : tier === 'warm' ? 3 * HOUR : 3 * DAY;
    add(`c${String(i).padStart(4, '0')}`, { title: i % 50 === 7 ? `GPU on-call ${i}` : `Room ${i}`, lastAgo, count: deep.includes(i) ? 120 : 3, kind: i % 9 === 0 ? 'dm' : 'group', authors: i % 50 === 7 ? [{ id: 'ada@corp.example', name: 'Ada' }] : null, attach: i === 1 });
  }
  const calls = { history: new Map(), older: 0, list: 0, attach: 0, units: 0 };
  const hit = (m, id) => { const c = calls[m]; c.set(id, (c.get(id) || 0) + 1); };
  // ⑥f: every history call's real start / end (the honesty judge), an optional
  // hold before one (`beforeHistory(id)`) and a delay every call answers after
  return { convs, calls, add, hit, t0, log: [], beforeHistory: null, delayMs: 0 };
}
/** A scripted adapter MODULE. `worlds` = one world, or `{<adapterId>: world}`
 *  so two ACCOUNTS of the same kind read two different mailboxes. */
/** lane lark-search-poll: the CHANGE FEED a scripted module may declare (scope null — the held-scope gate is test-channels-engine's) */
const FEED_DECL = Object.freeze({ via: 'search', scope: null, option: null, pageSize: 30, pagesPerPass: 5, perMin: 10, maxWindowSec: 3600, catchUp: Object.freeze({ chatType: 'p2p', pagesMax: 20 }), describes: false, timeUnit: 'ms' });
/** A message the scripted SEARCH hides (the `dropRate` share, by a stable hash of its id — never random). */
const hiddenBySearch = (vid, rate) => { if (!(rate > 0)) return false; let h = 0x811c9dc5; for (let i = 0; i < vid.length; i++) { h ^= vid.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return (h % 10000) / 10000 < rate; };
function worldModule(kind, worlds, { receive = 'poll', unitsPerHistory = 1, budgetDefault = 100000, budgetSettingKey = null, live = null, pace = null, vendorName = null, feed = false } = {}) {
  const worldOf = (id) => (worlds && worlds.convs ? worlds : (worlds[id] || Object.values(worlds)[0]));
  const c = {
    ...fake.fakePoll.caps,
    receive,
    pushTransport: receive === 'push' ? 'ws-long-conn' : null,
    pushAckBudgetMs: receive === 'push' ? 3000 : null,
    pollInterval: { hot: 30, cold: 300, floor: 10 },
    attachments: 'fetch', olderHistory: 'page',
    budget: { unit: unitsPerHistory > 1 ? 'quota-unit' : 'request', default: budgetDefault, settingKey: budgetSettingKey, metered: true },
    // lane R5: a scripted module may declare the per-second pace (drain rule 18) and the vendor's name
    ...(pace ? { pace } : {}), ...(vendorName ? { vendorName } : {}),
    ...(feed ? { changeFeed: FEED_DECL } : {}),
  };
  return {
    kind, caps: c,
    create(record, deps) {
      const adapterId = record.id;
      const world = worldOf(adapterId);
      const meter = deps.meter || (() => {});
      const pace = deps.pace || (async () => {});   // lane R5: awaited before every call (a no-op unless caps.pace is declared)
      // lane R5: a scripted refusal — `failNext` its code; a rate refusal may carry the vendor's Retry-After (`failRetryAfter`)
      const refusal = (code) => new CH.ChannelError(code, code === 'rate-limited' ? "HTTP 403 Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'" : code === 'auth-expired' ? 'HTTP 401 invalid_grant' : 'HTTP 503 Service Unavailable', { retryable: code !== 'auth-expired', detail: code === 'rate-limited' ? { retryAfterSec: Number.isFinite(world.failRetryAfter) ? world.failRetryAfter : null } : null });
      const rec = (id, m) => makeRecord({ adapterId, convId: id, vendorId: m.vendorId, at: m.at, author: { ...m.author, isSelf: false, isBot: false }, text: m.text, mentions: [], attachments: m.attachments || [], replyTo: null, threadKey: id, raw: {} });
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations({ cursor = null, limit = 100 } = {}) {
          await pace(1); meter(1); world.calls.list++;
          if (world.sends) world.sends.push({ at: world.paceNow ? world.paceNow() : 0, units: 1 });
          if (world.failNext) { const code = world.failNext; if (!world.failSticky) world.failNext = null; throw refusal(code); }
          const all = [...world.convs.values()];
          const from = cursor ? Number(cursor) : 0;
          const page = all.slice(from, from + limit);
          const next = from + limit < all.length ? String(from + limit) : null;
          // `noListingLastAt` (lane lark-search-poll ⑪ d): a listing that names no last-message instant — Lark's chat list does not
          return { conversations: page.map((x) => makeConversation({ id: x.id, vendorId: x.id, title: x.title, kind: x.kind, participants: x.participants, lastAt: !world.noListingLastAt && x.recs.length ? x.recs[x.recs.length - 1].at : null })), cursor: next, complete: !next };
        },
        async convCaps() { meter(1); return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
        async history(id, { anchor = null, limit = 50, initialMax = null } = {}) {
          await pace(unitsPerHistory); meter(unitsPerHistory); world.hit('history', id);
          if (world.sends) world.sends.push({ at: world.paceNow ? world.paceNow() : 0, units: unitsPerHistory });
          if (world.onHistory) world.onHistory(id);
          const startedAt = Date.now();
          if (world.beforeHistory) await world.beforeHistory(id);
          if (world.delayMs) await sleep(world.delayMs);
          if (world.failNext) { const code = world.failNext; if (!world.failSticky) world.failNext = null; world.log.push({ id, startedAt, endedAt: Date.now(), failed: code }); throw refusal(code); }
          world.log.push({ id, startedAt, endedAt: Date.now() });
          const x = world.convs.get(id);
          if (!x) return { records: [], anchor, reachedAnchor: true, complete: true };
          let idx = 0;
          if (anchor) { const at = x.recs.findIndex((m) => m.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; }
          else if (Number(initialMax) > 0) idx = Math.max(0, x.recs.length - Number(initialMax));
          const pending = x.recs.slice(idx);
          const page = pending.slice(0, limit);
          const drained = page.length === pending.length;
          return { records: page.map((m) => rec(id, m)), anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: drained, complete: drained };
        },
        async older(id, { before = null, limit = 50 } = {}) {
          meter(1); world.calls.older++;
          const x = world.convs.get(id);
          const all = x ? x.recs : [];
          const olderOnes = before ? all.filter((m) => m.at < before.at || (m.at === before.at && m.vendorId < before.vendorId)) : all;
          const page = olderOnes.slice(-limit);
          return { records: page.map((m) => rec(id, m)), exhausted: page.length === olderOnes.length };
        },
        async fetchAttachment(id, { messageId, attachmentId } = {}) {
          meter(1); world.calls.attach++;
          const x = world.convs.get(id);
          const m = x && x.recs.find((r) => r.vendorId === messageId);
          const a = m && m.attachments.find((q) => q.id === attachmentId);
          if (!a) throw new CH.ChannelError('not-found', 'no such attachment');
          if (a.mime === 'image/png') return { data: world.bigAttachments ? Buffer.alloc(world.bigAttachments, 7) : fake.fixturePng(a.id), mime: 'image/png', name: a.name };
          if (a.mime === 'image/svg+xml') return { data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), mime: 'image/svg+xml', name: a.name };
          return { data: Buffer.from(`notes of ${messageId}\n`), mime: 'text/plain', name: a.name };
        },
        live: receive === 'push' ? live : undefined,
        // lane lark-search-poll: THE SCRIPTED SEARCH over the world's own records — a message is searchable `lagMs` after
        // its instant, `dropRate` of them never (a stable hash), newest first, 30 a page, an offset token
        changes: feed ? async ({ from, to, pageToken = null, chatType = null, pageSize = 30 } = {}) => {
          meter(1); world.calls.changes = (world.calls.changes || 0) + 1; (world.calls.feedAt = world.calls.feedAt || []).push(world.clock ? world.clock() : 0);
          const f = world.feed || {};
          const nowT = world.clock ? world.clock() : Date.now();
          const hits = [];
          for (const x of world.convs.values()) {
            if (chatType === 'p2p' && x.kind !== 'dm') continue;
            for (const m of x.recs) {
              if (m.at < from || m.at > to || nowT < m.at + (Number(f.lagMs) || 0) || hiddenBySearch(m.vendorId, Number(f.dropRate) || 0)) continue;
              hits.push({ convId: x.id, vendorId: m.vendorId, at: m.at, updatedAt: null, threadKey: null, isP2p: x.kind === 'dm', fromId: m.author.id });
            }
          }
          hits.sort((a, b) => b.at - a.at || (a.vendorId < b.vendorId ? 1 : -1));
          const off = pageToken ? Number(pageToken) : 0;
          const pg = hits.slice(off, off + pageSize);
          const next = off + pageSize < hits.length ? String(off + pageSize) : null;
          return { hits: pg, more: !!next, pageToken: next, total: hits.length };
        } : undefined,
      };
    },
  };
}
function mkEngine(name, { kinds, settings = {}, now, deliver = null, sessions = [], dataDir = null, env = {}, log = quiet, extra = {}, mod = ENG, registryOpts } = {}) {
  const registry = CH.createChannelRegistry(registryOpts);
  for (const m of kinds) registry.register(m);
  const events = [];
  const dir = dataDir || path.join(ROOT, name);
  const eng = mod.create({ dataDir: dir, registry, env, now, broadcast: (m) => events.push(m), serverSetting: (k) => settings[k], liveSessions: () => sessions, deliver, log, ...extra });
  return { eng, events, dataDir: dir };
}
function seedAccounts(dataDir, records) {
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: records.map(([id, kind]) => ({ id, kind, label: id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: true, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null })) }));
}
const historyCalls = (w) => [...w.calls.history.values()].reduce((a, b) => a + b, 0);
/** Drive forced passes until every conversation is anchored (the budget of
 *  a scripted module is generous, so one or two passes do it). */
async function ingestAll(eng, A, max = 5) { for (let i = 0; i < max; i++) { await eng.pass(A, { force: true }); if (Object.values(eng.store.index.live()).filter((e) => e.adapterId === A).every((e) => e.anchor)) return true; } return false; }

// ═══ ① + ② + ③ at the owner's scale ═══════════════════════════════════════
console.log('① every conversation discovered and ingested, no track step');
let clock = Date.UTC(2026, 8, 26, 12, 0, 0);
const now = () => clock;
const W = makeWorld(clock, { n: 873, deep: [5, 6] });
const W2 = makeWorld(clock, { n: 12, hot: 2, warm: 3 });
// TWO ACCOUNTS OF THE SAME KIND, two mailboxes: the adapter id IS the account id
const kindMany = worldModule('many', { many: W, 'many:0000abcd': W2 });
const dirMain = path.join(ROOT, 'main');
seedAccounts(dirMain, [['many', 'many'], ['many:0000abcd', 'many']]);
const delivered = [];
const deliver = { async deliverToConversation(cid, text, opts) { delivered.push({ cid, text, opts }); return { ok: true, lane: 'message' }; }, stashFor() {} };
const SESS = [{ cid: 'agent-A', name: 'Alpha', groups: [] }, { cid: 'agent-B', name: 'Beta', groups: [] }, { cid: 'agent-C', name: 'Gamma', groups: [] }];
const SET = {};
let { eng, events } = mkEngine('main', { kinds: [kindMany], settings: SET, now, deliver, sessions: SESS, dataDir: dirMain });
{
  const t0 = Date.now();
  ok(await ingestAll(eng, 'many'), 'forced passes anchor EVERY conversation of the account');
  const mine = Object.values(eng.store.index.live()).filter((e) => e.adapterId === 'many');
  ok(mine.length === 873, `all 873 conversations are DISCOVERED (the cursor walked past 500 — ${W.calls.list} list pages)`, String(mine.length));
  ok(W.calls.list >= 9, 'discovery paged through the whole cursor (9 pages of ≤100)', String(W.calls.list));
  ok(mine.every((e) => !('tracked' in e)), 'no conversation carries a `tracked` flag — nothing is gated on one');
  ok(mine.every((e) => e.anchor && eng.store.readTail('many', e.id, { limit: 5 }).length > 0), 'every conversation has records in its log (ingest-all)');
  const deep = eng.store.readTail('many', 'c0005', { limit: 500 });
  ok(deep.length === 50, 'a FIRST ingest takes one page (50 of 120) — older history comes on demand', String(deep.length));
  const rec0 = eng.adapterRecords().adapters.find((r) => r.id === 'many');
  ok(Number(rec0.linkedAt) === clock, 'the account is stamped `linkedAt` at its first discovery (unread counts start there)');
  ok(mine.every((e) => (e.unread || 0) === 0), 'the pre-link BACKLOG counts as read (no 40 000-unread first screen)', JSON.stringify(mine.filter((e) => e.unread).slice(0, 3).map((e) => [e.id, e.unread])));
  ok(delivered.length === 0, 'a first ingest wakes nobody (backlog is not news)');
  const other = Object.values(eng.store.index.live()).filter((e) => e.adapterId === 'many:0000abcd');
  ok(other.length === 0, 'the SECOND account is untouched until its own pass (accounts never mix)');
  await ingestAll(eng, 'many:0000abcd');
  ok(Object.values(eng.store.index.live()).filter((e) => e.adapterId === 'many:0000abcd').length === 12, '…and its own pass discovers its own 12');
  console.log(`    (873-conversation first ingest: ${Date.now() - t0} ms)`);
  // the digest is SLIM: a whole-account broadcast stays small per row
  const d = eng.digest();
  const per = Buffer.byteLength(JSON.stringify(d.conversations)) / d.conversations.length;
  ok(per < 800, `a digest row is slim (${Math.round(per)} bytes per conversation; the old row was ~1.2 KB)`);
  ok(d.conversations.every((c) => !('tracked' in c) && !('reach' in c) && c.freshness && c.cadence), 'a row carries freshness + cadence and NO tracked flag / reach rows');
  const lastEv = events[events.length - 1];
  ok(lastEv && lastEv.type === 'channels-updated', 'passes broadcast channels-updated');
}

console.log('② the scheduler is per conversation: the arithmetic IS the call count');
{
  const hot = 50, warm = 200, cold = 623;
  const tier = (id) => { const i = Number(id.slice(1)); return i < hot ? 'hot' : i < hot + warm ? 'warm' : 'cold'; };
  ok(eng.cadenceOf('many', 'c0001').tier === 'hot' && eng.cadenceOf('many', 'c0001').seconds === 30, 'a conversation with a message 10 min ago is HOT (30 s)');
  ok(eng.cadenceOf('many', 'c0100').tier === 'warm' && eng.cadenceOf('many', 'c0100').seconds === 300, 'a message 3 h ago is WARM (5 min)');
  ok(eng.cadenceOf('many', 'c0500').tier === 'cold' && eng.cadenceOf('many', 'c0500').seconds === 900, 'a message 3 days ago is COLD (15 min — the owner\'s maximum)');
  const snapCalls = () => new Map(W.calls.history);
  let before = snapCalls();
  const diff = (b) => { const m = new Map(); for (const [k, v] of W.calls.history) { const d0 = v - (b.get(k) || 0); if (d0) m.set(k, d0); } return m; };
  clock += 31e3;
  await eng.pass('many');
  let d1 = diff(before);
  ok(d1.size === hot && [...d1.keys()].every((k) => tier(k) === 'hot'), `at +31 s a timer pass polls EXACTLY the ${hot} hot conversations (${d1.size})`, JSON.stringify([...d1.keys()].slice(0, 5)));
  before = snapCalls();
  clock += 270e3;   // +301 s since the first ingest
  await eng.pass('many');
  d1 = diff(before);
  ok(d1.size === hot + warm && [...d1.keys()].every((k) => tier(k) !== 'cold'), `at +301 s: hot + warm (${hot + warm}), no cold one (${d1.size})`);
  before = snapCalls();
  clock += 600e3;   // +901 s
  await eng.pass('many');
  d1 = diff(before);
  ok(d1.size === hot + warm + cold, `at +901 s every conversation is due once (${d1.size}/873) — nothing waits past 15 min`);
  before = snapCalls();
  clock += 5e3;
  await eng.pass('many');
  ok(diff(before).size === 0, 'a pass with nothing due polls nothing (zero vendor calls)');
  // the steady-state arithmetic per minute (the design's table) — requests/min for this mix
  const perMin = hot * 2 + warm * 0.2 + cold / 15;
  ok(Math.round(perMin) === 182, `the declared arithmetic: ${hot} hot ×2 + ${warm} warm ×0.2 + ${cold} cold ÷15 ≈ ${perMin.toFixed(1)} requests/min`);
}

console.log('③ the budget is the account\'s, in the vendor\'s unit; exhaustion is SAID');
{
  const Wb = makeWorld(clock, { n: 40, hot: 40, warm: 0 });
  const kb = worldModule('budgeted', Wb, { unitsPerHistory: 5, budgetDefault: 100 });
  const dirB = path.join(ROOT, 'budget');
  seedAccounts(dirB, [['budgeted', 'budgeted']]);
  const { eng: eb } = mkEngine('budget', { kinds: [kb], now, dataDir: dirB });
  await eb.pass('budgeted', { force: true });
  const first = historyCalls(Wb);
  // 100 units a minute, 1 unit per list page, 5 per history call: a call may START while the
  // window is under its limit, so one list page + 20 history calls (101 units) and then it stops
  ok(first === 20, `a METERED adapter spends its own units: 100 units a minute at 5 per history call (after a 1-unit list page) = 20 conversations (${first})`);
  const b = eb.budgetOf('budgeted');
  ok(b.exhausted && b.limit === 100 && b.unit === 'quota-unit' && b.waiting > 0 && b.resetInSeconds > 0, 'the account row says the budget is spent, its unit, how many wait and when it resets', JSON.stringify(b));
  const sentence = caps.budgetText(b);
  ok(/100 quota units\/min/.test(sentence) && /conversations waiting/.test(sentence), 'the card\'s sentence names the number', sentence);
  const stalled = await eb.pass('budgeted', { force: true });
  ok(stalled.ok === false && stalled.why === 'budget' && historyCalls(Wb) === first, 'inside the same minute nothing more is sent (a refusal, not a silent skip)');
  const polledFirst = new Set(Wb.calls.history.keys());
  clock += 61e3;
  await eb.pass('budgeted');
  const second = [...Wb.calls.history.keys()].filter((k) => !polledFirst.has(k));
  ok(historyCalls(Wb) === first + 20 && second.length === 20, 'the next minute\'s timer pass continues with the 20 that WAITED (most overdue first — nothing starves on insertion order)', JSON.stringify([historyCalls(Wb), second.length]));
  eb.stop();
}

// ONE FAILED PASS IS SAID FROM THE FIRST FAILURE (lane R2 verify, 2026-09-26):
// the account card read "Connected · polling · … · last sync 12 s ago" while
// the pass had just failed and nothing was being fetched — `last sync` came
// from a FAILED pass, the failure line waited for the third one, and the
// retry instant lived only in memory. (Lane R5: the leg's failure is a
// TRANSPORT one — the failure ladder; a vendor RATE refusal is its own short
// ladder, pinned in ③d.)
console.log('③b a failed pass is said at once: the retry instant, no "last sync" from a failure');
{
  const Wr = makeWorld(clock, { n: 3, hot: 3, warm: 0 });
  const kr = worldModule('ratey', Wr);
  const dirR = path.join(ROOT, 'ratey');
  seedAccounts(dirR, [['ratey', 'ratey']]);
  const { eng: er } = mkEngine('ratey', { kinds: [kr], now, dataDir: dirR });
  const recOf = () => er.adapterRecords().adapters.find((r) => r.id === 'ratey');
  Wr.failNext = 'transport';
  const p1 = await er.pass('ratey', { force: true });
  const v1 = er.adapterView(recOf());
  ok(p1.ok === false && p1.why === 'transport' && v1.consecutiveFailures === 1, 'FIXTURE: one scripted 503 fails the pass with transport', JSON.stringify(p1));
  ok(Number(v1.backoffUntil) === clock + ENG.BACKOFF_MS[1] && !v1.lastOkAt && v1.backoff && v1.backoff.kind === 'failure', 'after ONE failed pass the view carries the retry instant (backoffUntil), the back-off\'s kind (failure) and no last GOOD sync', JSON.stringify({ backoffUntil: v1.backoffUntil, backoff: v1.backoff, lastOkAt: v1.lastOkAt }));
  const ps1 = typeof caps.passStateText === 'function' ? caps.passStateText(v1, { now: clock }) : { note: '', lastOkAt: 'n/a' };
  ok(/transport failure/.test(ps1.note) && /retrying in 30 s/.test(ps1.note) && ps1.lastOkAt === null, 'the card\'s line builder says "transport failure — retrying in 30 s" from the FIRST failure, and there is no "last sync" to print', JSON.stringify(ps1));
  const panelSrc = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf-8');
  ok(/chanCaps\.passStateText\(a, /.test(panelSrc) && !/last sync \{ago\}', \{ ago: agoText\(a\.lastPass\.at\)/.test(panelSrc), 'the panel words its sync + retry through that builder (never "last sync" from lastPass.at, which a failure stamps)');
  const waited = await er.pass('ratey');
  ok(waited.ok === false && waited.why === 'backoff', 'FIXTURE: inside the back-off a timer pass waits');
  clock += 31e3;
  const p2 = await er.pass('ratey', { force: true });
  const v2 = er.adapterView(recOf());
  const ps2 = typeof caps.passStateText === 'function' ? caps.passStateText(v2, { now: clock }) : { note: 'n/a', lastOkAt: null };
  ok(p2.ok && Number(v2.lastOkAt) === clock && !v2.backoffUntil && !v2.backoff && ps2.note === '' && ps2.lastOkAt === clock, 'the next GOOD pass stamps lastOkAt, clears the retry instant and the note', JSON.stringify({ lastOkAt: v2.lastOkAt, backoffUntil: v2.backoffUntil, ps2 }));
  er.stop();
}

// A VENDOR RATE REFUSAL IS A SHORT WAIT, SAID BY THE VENDOR'S NAME (lane R5,
// 2026-09-26 — the owner: "gmail一直被限速 你可能要控制下gmail默认的读取速度").
// Production: three Gmail refusals of "Units per minute per user" climbed the
// failure ladder (30 s → 2 min → 5 min) to its 15-minute maximum while the
// per-minute budget was never exceeded — the vendor meters finer than a
// minute — and filed a "For you" item for what was a few seconds' wait.
console.log('③d a vendor RATE refusal is a short wait: 5 s doubling to 60 s (or its Retry-After), never the failure ladder, never a 15-minute park');
async function rateLadder(ENGmod, label) {
  const Wq = makeWorld(clock, { n: 3, hot: 3, warm: 0 });
  const kq = worldModule('rq', Wq, { vendorName: 'Google' });
  const dirQ = path.join(ROOT, `rate-${label}`);
  seedAccounts(dirQ, [['rq', 'rq']]);
  const todos = [];
  const userTodos = { add: (key, it) => { const x = { id: `ut-${todos.length + 1}`, status: 'open', sessionKey: key, ...it }; todos.push(x); return x; }, get: (id) => todos.find((x) => x.id === id) || null, setStatus: (id, st) => { const x = todos.find((y) => y.id === id); if (x) x.status = st; } };
  const { eng: eq } = mkEngine(`rate-${label}`, { kinds: [kq], now, dataDir: dirQ, mod: ENGmod, extra: { userTodos } });
  const recOf = () => eq.adapterRecords().adapters.find((r) => r.id === 'rq');
  const out = { strikes: [], todosAt: [], views: [] };
  await ingestAll(eq, 'rq');   // the three conversations exist (their pills are read below)
  clock += 1000;
  Wq.failNext = 'rate-limited'; Wq.failSticky = true; Wq.failRetryAfter = null;
  for (let i = 0; i < 11; i++) {
    const t0 = clock;
    const p = await eq.pass('rq', { force: true });
    const v = eq.adapterView(recOf());
    out.strikes.push({ why: p.why, waitSec: v.backoffUntil ? (v.backoffUntil - t0) / 1000 : null, failures: v.consecutiveFailures, kind: v.backoff && v.backoff.kind });
    out.todosAt.push(todos.length);
    if (i === 0) { out.first = v; out.firstNote = caps.passStateText(v, { now: clock }); out.freshness = eq.digest().conversations.filter((c) => c.adapterId === 'rq').map((c) => c.freshness && c.freshness.state); }
    clock = Math.max(clock, v.backoffUntil || clock) + 1;
  }
  // the vendor's own hint: Retry-After 7 ⇒ exactly 7 s
  Wq.failRetryAfter = 7;
  const tHint = clock;
  await eq.pass('rq', { force: true });
  out.hintWaitSec = (eq.adapterView(recOf()).backoffUntil - tHint) / 1000;
  // it recovers: a good pass clears the strikes, the note, and RETRACTS the item it filed
  Wq.failNext = null; Wq.failSticky = false; Wq.failRetryAfter = null;
  clock += 61e3;
  const good = await eq.pass('rq', { force: true });
  const vg = eq.adapterView(recOf());
  out.recovered = { ok: good.ok, backoff: vg.backoff, note: caps.passStateText(vg, { now: clock }).note, retracted: todos.length ? todos[0].status : null };
  // an AUTH refusal still climbs the failure ladder: 30 s → 2 min → 5 min, loud at the third
  Wq.failNext = 'auth-expired'; Wq.failSticky = true;
  out.auth = [];
  const todosBefore = todos.length;
  for (let i = 0; i < 4; i++) {
    const t0 = clock;
    const p = await eq.pass('rq', { force: true });
    const v = eq.adapterView(recOf());
    out.auth.push({ why: p.why, waitSec: v.backoffUntil ? (v.backoffUntil - t0) / 1000 : null, failures: v.consecutiveFailures, kind: v.backoff && v.backoff.kind });
    clock = Math.max(clock, v.backoffUntil || clock) + 1;
  }
  out.authTodos = todos.length - todosBefore;
  Wq.failNext = null; Wq.failSticky = false;
  eq.stop();
  return out;
}
{
  const r = await rateLadder(ENG, 'real');
  const waits = r.strikes.map((x) => x.waitSec);
  ok(r.strikes.every((x) => x.why === 'rate-limited' && x.kind === 'rate' && x.failures === 0), `eleven scripted "Units per minute per user" refusals in a row: every one a RATE back-off and consecutiveFailures stays 0 — the failure ladder never moves (${JSON.stringify(r.strikes.map((x) => x.failures))})`, JSON.stringify(r.strikes.slice(0, 3)));
  ok(JSON.stringify(waits) === JSON.stringify([5, 10, 20, 40, 60, 60, 60, 60, 60, 60, 60]), `the waits are 5 s doubling to 60 s and never past it (${JSON.stringify(waits)}) — the old ladder went 30 s → 2 min → 5 min → 15 min`, JSON.stringify(waits));
  ok(r.todosAt.slice(0, 9).every((n) => n === 0) && r.todosAt[9] === 1 && r.todosAt[10] === 1, `no "For you" item for a short wait: nothing through strike 9, ONE item at strike 10 (a refusal that persists ≈ 7 min despite the pace) — ${JSON.stringify(r.todosAt)}`);
  ok(r.firstNote.rate === true && r.firstNote.note === 'Google is limiting the rate · resuming in 5 s' && r.first.vendor === 'Google', `the card says it by the VENDOR's declared name from the FIRST strike: "${r.firstNote.note}"`, JSON.stringify(r.firstNote));
  const zh = await import(path.join(REPO, 'src/lib/i18n-zh.js'));
  const Z = zh.default || zh.zh || zh.ZH || Object.values(zh).find((x) => x && typeof x === 'object');
  const tz = (k, p) => { const v = (Z && Z[k]) || k; return p ? v.replace(/\{(\w+)\}/g, (m, q) => (q in p ? String(p[q]) : m)) : v; };
  const zNote = caps.passStateText(r.first, { now: r.first.backoffUntil - 5000, t: tz }).note;
  ok(zNote === 'Google 限速中 · 5 秒后继续', `…and in Chinese: "${zNote}"`);
  ok(r.freshness.length === 3 && r.freshness.every((f) => f !== 'paused'), `no conversation pill reads "paused" during a rate back-off (${JSON.stringify(r.freshness)}) — "refresh paused" is the owner's own override, never a vendor's wait`);
  ok(r.hintWaitSec === 7, `the vendor's own Retry-After (7 s) is the wait, exactly (${r.hintWaitSec} s)`);
  ok(r.recovered.ok && !r.recovered.backoff && r.recovered.note === '' && r.recovered.retracted === 'done', 'the first good pass clears the strikes and the note and RETRACTS the item it filed', JSON.stringify(r.recovered));
  const aw = r.auth.map((x) => x.waitSec);
  ok(JSON.stringify(aw) === JSON.stringify([30, 120, 300, 900]) && r.auth.map((x) => x.failures).join() === '1,2,3,4' && r.auth.every((x) => x.kind === 'failure') && r.authTodos === 1, `an AUTH refusal still climbs the failure ladder (${JSON.stringify(aw)} s, consecutiveFailures ${r.auth.map((x) => x.failures).join('→')}) and speaks once at the third (${r.authTodos} item)`, JSON.stringify(r.auth));
  // CONTROL: the pre-R5 failPass (a rate refusal on the failure ladder) — the owner's 15-minute park
  const Mr = mutantCopies('chan-agg-rate', REPO);
  const cwr = closedWorld(Mr, 'rate-on-ladder', { engine: [['        const rate = code === \'rate-limited\';', '        const rate = false;']] });
  ok(cwr.setup, 'CONTROL setup: the engine with a rate refusal on the failure ladder (before lane R5) is reconstructed', cwr.missing);
  const rc = await rateLadder(cwr.mod, 'ctl');
  const cw = rc.strikes.map((x) => x.waitSec);
  ok(cw[0] === 30 && cw[3] === 900 && rc.strikes[2].failures === 3 && rc.todosAt[2] === 1, `CONTROL: on the failure ladder the same refusals park the account ${JSON.stringify(cw.slice(0, 5))} s and file "For you" at the third — the legs above would go red`, JSON.stringify(cw));
  for (const r2 of copiesCensus(Mr.files, Mr.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}

// TWO LADDERS, ONE OPEN ITEM (lane R5 verify r2): the rate ladder (loud at 10)
// and the failure ladder (loud at 3) are independent, and `rec.failureItem`
// remembers ONE item — a transport failure after a rate item filed a second
// item and the first outlived the recovery (open forever, its own detail
// promising a retraction). The standing item is retracted as SUPERSEDED before
// the next is filed; the first good pass retracts that one.
console.log("③d′ two ladders, one open item: a failure on the other ladder supersedes the standing item, the good pass retracts the last");
async function twoLadders(ENGmod, label) {
  const Wt = makeWorld(clock, { n: 3, hot: 3, warm: 0 });
  const kt = worldModule('tl', Wt, { vendorName: 'Google' });
  const dirT = path.join(ROOT, `twoladders-${label}`);
  seedAccounts(dirT, [['tl', 'tl']]);
  const todos = [];
  const userTodos = { add: (key, it) => { const x = { id: `ut-${todos.length + 1}`, status: 'open', sessionKey: key, ...it }; todos.push(x); return x; }, get: (id) => todos.find((x) => x.id === id) || null, setStatus: (id, st) => { const x = todos.find((y) => y.id === id); if (x) x.status = st; } };
  const { eng: et } = mkEngine(`twoladders-${label}`, { kinds: [kt], now, dataDir: dirT, mod: ENGmod, extra: { userTodos } });
  const open = () => todos.filter((x) => x.status === 'open').map((x) => x.text);
  await ingestAll(et, 'tl');
  Wt.failNext = 'rate-limited'; Wt.failSticky = true;
  for (let i = 0; i < 10; i++) { clock += 61e3; await et.pass('tl', { force: true }); }
  const afterRate = open();
  Wt.failNext = 'transport';
  for (let i = 0; i < 3; i++) { clock += 16 * 60e3; await et.pass('tl', { force: true }); }
  const afterTransport = open();
  Wt.failNext = null; Wt.failSticky = false;
  clock += 16 * 60e3;
  const good = await et.pass('tl', { force: true });
  const afterGood = open();
  et.stop();
  return { afterRate, afterTransport, afterGood, filed: todos.length, good: good.ok };
}
{
  const r = await twoLadders(ENG, 'real');
  ok(r.afterRate.length === 1 && /rate-limited/.test(r.afterRate[0]), `10 rate strikes ⇒ one open item (${r.afterRate[0]})`);
  ok(r.afterTransport.length === 1 && /transport/.test(r.afterTransport[0]) && r.filed === 2, `3 transport failures behind it ⇒ still ONE open item, the transport one — the rate item was retracted as superseded (${r.afterTransport[0]})`, JSON.stringify(r));
  ok(r.good && r.afterGood.length === 0, 'the first good pass leaves no open item');
  const Mt = mutantCopies('chan-agg-twoladders', REPO);
  const cwt = closedWorld(Mt, 'no-supersede', { engine: [["    if (rec.failureItem) await retractFailure(rec, 'superseded');", '']] });
  ok(cwt.setup, 'CONTROL setup: speakFailure without the superseded retraction is reconstructed', cwt.missing);
  const c = await twoLadders(cwt.mod, 'ctl');
  ok(c.afterTransport.length === 2 && c.afterGood.length === 1 && /rate-limited/.test(c.afterGood[0]), `CONTROL: without it two items stay open and the rate one outlives the recovery (${c.afterGood.join(' | ')}) — the legs above would go red`, JSON.stringify(c));
  for (const r2 of copiesCensus(Mt.files, Mt.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}

// THE BUCKET UNDER CONCURRENT CALLERS OUTSIDE THE PASS (lane R5 verify r2):
// the adapter's `await pace(units)` was a check-then-charge across an await —
// N callers (a window's N attachment thumbnails, a page-back beside the pass)
// each read the bucket before any had metered, so 20 fetches of 20 units left
// in ONE instant (400 units in a second on the real Gmail adapter, the burst the
// vendor refuses), and a page-back starved behind the pass for the whole ingest.
// `paceWait` now judges one caller at a time in arrival order and RESERVES the
// units it lets through (`paceInflight`, released by the meter). Real timers.
console.log('③g the bucket under concurrent callers outside the pass: an attachment burst is paced, a page-back takes one slot');
function pacedOutsideModule(kind, world, { unitsPerAttach = 20, unitsPerOlder = 40 } = {}) {
  const c = { ...fake.fakePoll.caps, receive: 'poll', pushTransport: null, pushAckBudgetMs: null, pollInterval: { hot: 30, cold: 300, floor: 10 }, attachments: 'fetch', olderHistory: 'page', budget: { unit: 'quota-unit', default: 3000, settingKey: null, metered: true }, pace: { unitsPerSec: 40, settingKey: null, cost: { fetch: 40, discover: 1, scanHost: 1 } }, vendorName: 'Google' };
  return {
    kind, caps: c,
    create(record, deps) {
      const adapterId = record.id;
      const meter = deps.meter || (() => {});
      const pace = deps.pace || (async () => {});
      const rec = (id, m) => makeRecord({ adapterId, convId: id, vendorId: m.vendorId, at: m.at, author: { ...m.author, isSelf: false, isBot: false }, text: m.text, mentions: [], attachments: m.attachments || [], replyTo: null, threadKey: id, raw: {} });
      const send = async (kindOf, units) => { await pace(units); meter(units); world.sends.push({ at: performance.now(), units, kind: kindOf }); };
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations() { await send('list', 1); const all = [...world.convs.values()]; return { conversations: all.map((x) => makeConversation({ id: x.id, vendorId: x.id, title: x.title, kind: x.kind, participants: x.participants, lastAt: x.recs[x.recs.length - 1].at })), cursor: null, complete: true }; },
        async convCaps() { return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
        async history(id, { anchor = null, limit = 50, initialMax = null } = {}) {
          await send('history', 40); world.hit('history', id); if (world.onHistoryDone) world.onHistoryDone(id);
          if (world.delay && world.delay.history) await sleep(world.delay.history);   // verify r4: a slow vendor, for the in-flight legs
          const x = world.convs.get(id); let idx = 0;
          if (anchor) { const at = x.recs.findIndex((m) => m.vendorId === anchor); idx = at >= 0 ? at + 1 : 0; } else if (Number(initialMax) > 0) idx = Math.max(0, x.recs.length - Number(initialMax));
          const pending = x.recs.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page.map((m) => rec(id, m)), anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: drained, complete: drained };
        },
        async older(id, { before = null, limit = 50 } = {}) { await send('older', unitsPerOlder); const all = world.convs.get(id).recs; const olderOnes = before ? all.filter((m) => m.at < before.at) : all; const page = olderOnes.slice(-limit); return { records: page.map((m) => rec(id, m)), exhausted: page.length === olderOnes.length }; },
        async fetchAttachment(id, { messageId, attachmentId } = {}) { await send('attach', unitsPerAttach); if (world.delay && world.delay.attach) await sleep(world.delay.attach); return { data: Buffer.from(`bytes of ${attachmentId}\n`), mime: 'text/plain', name: String(attachmentId) }; },
      };
    },
  };
}
const maxUnitsIn = (L, T) => { let best = 0, sum = 0, i = 0; const S = [...L].sort((a, b) => a.at - b.at); for (let j = 0; j < S.length; j++) { sum += S[j].units; while (S[j].at - S[i].at > T) { sum -= S[i].units; i++; } best = Math.max(best, sum); } return best; };
async function outsideThePass(ENGmod, label) {
  // (i) 6 concurrent attachment fetches of 20 units at 40/s: two at once, then one every 0.5 s ⇒ ≥ 2 s, never above 80 in a second
  const Wo = makeWorld(Date.now(), { n: 1, hot: 0, warm: 0 });
  const conv = Wo.convs.get('c0000'); conv.recs[conv.recs.length - 1].attachments = Array.from({ length: 6 }, (_, k) => ({ id: `att${k}`, name: `f${k}.txt`, mime: 'text/plain' }));
  Wo.sends = [];
  const ko = pacedOutsideModule('po', Wo);
  const dirO = path.join(ROOT, `outside-${label}`);
  seedAccounts(dirO, [['po', 'po']]);
  const { eng: eo } = mkEngine(`outside-${label}`, { kinds: [ko], now: () => Date.now(), dataDir: dirO, mod: ENGmod });
  await eo.pass('po', { force: true });
  await sleep(1100);
  const t0 = performance.now(); const b0 = Wo.sends.length;
  const rs = await Promise.all(Array.from({ length: 6 }, (_, k) => eo.attachment('po', 'c0000', `att${k}`, { msg: conv.recs[conv.recs.length - 1].vendorId })));
  const burst = { ok: rs.every((x) => x.ok && x.cached === false), wall: performance.now() - t0, max1s: maxUnitsIn(Wo.sends.slice(b0), 1000), n: Wo.sends.length - b0 };
  eo.stop();
  // (ii) a page-back filed 300 ms after the 3rd read of a paced ingest takes the NEXT slot, the ingest keeps its cadence
  const Wp = makeWorld(Date.now(), { n: 6, hot: 0, warm: 0, deep: [2] });
  Wp.sends = [];
  const kp = pacedOutsideModule('pp', Wp);
  const dirP = path.join(ROOT, `pageback-${label}`);
  seedAccounts(dirP, [['pp', 'pp']]);
  const { eng: ep } = mkEngine(`pageback-${label}`, { kinds: [kp], now: () => Date.now(), dataDir: dirP, mod: ENGmod });
  let older = null, olderMs = 0;
  Wp.onHistoryDone = (id) => { if (id !== 'c0002' || older) return; older = new Promise((res) => setTimeout(async () => { const local = ep.store.readTail('pp', 'c0002', { limit: 200 }); const s = performance.now(); const r = await ep.loadOlder('pp', 'c0002', { before: local[0].at, beforeId: local[0].vendorId, limit: 50 }); olderMs = performance.now() - s; res(r); }, 300)); };
  const r = await ep.pass('pp', { force: true });
  const or = await older; ep.stop();
  const seq = Wp.sends.filter((s) => s.kind !== 'list').sort((a, b) => a.at - b.at);
  const g = []; for (let i = 1; i < seq.length; i++) g.push(seq[i].at - seq[i - 1].at);
  return { burst, pageBack: { ok: r.ok && or && or.ok && or.source === 'vendor' && or.fetched === 50, olderMs, pos: seq.findIndex((s) => s.kind === 'older'), n: seq.length, minGap: Math.min(...g), max1s: maxUnitsIn(Wp.sends, 1000) } };
}
{
  const r = await outsideThePass(ENG, 'real');
  ok(r.burst.ok && r.burst.n === 6 && r.burst.wall >= 1900 && r.burst.max1s <= 80, `6 concurrent attachment fetches of 20 units: all served by the vendor in ${(r.burst.wall / 1000).toFixed(1)} s (≥ 2 s at 40/s), ≤ ${r.burst.max1s} units in any second`, JSON.stringify(r.burst));
  ok(r.pageBack.ok && r.pageBack.pos >= 2 && r.pageBack.pos <= 4 && r.pageBack.olderMs < 2200 && r.pageBack.minGap >= 940 && r.pageBack.max1s <= 80, `a page-back filed mid-ingest takes the next slot (position ${r.pageBack.pos} of ${r.pageBack.n}, answered in ${r.pageBack.olderMs.toFixed(0)} ms) and the ingest keeps its cadence (min gap ${r.pageBack.minGap.toFixed(0)} ms, ≤ ${r.pageBack.max1s} units/s)`, JSON.stringify(r.pageBack));
  // verify r3 (iii): the bucket judged after the account sat IDLE (a window opened on an account read a while ago) —
  // the judged level is capped at burst BEFORE the reservation comes off, so 8 fetches of 20 units after 3 s idle still
  // leave two at once and one every 0.5 s (≥ 3 s, ≤ 80 in any second)
  {
    const Wi = makeWorld(Date.now(), { n: 1, hot: 0, warm: 0 });
    const ci = Wi.convs.get('c0000'); ci.recs[ci.recs.length - 1].attachments = Array.from({ length: 8 }, (_, k) => ({ id: `att${k}`, name: `f${k}.txt`, mime: 'text/plain' }));
    Wi.sends = [];
    const ki = pacedOutsideModule('pi', Wi);
    const dirI = path.join(ROOT, 'idle-burst'); seedAccounts(dirI, [['pi', 'pi']]);
    const { eng: ei } = mkEngine('idle-burst', { kinds: [ki], now: () => Date.now(), dataDir: dirI });
    await ei.pass('pi', { force: true });
    await sleep(3000);
    const bi = Wi.sends.length; const ti = performance.now();
    const ri = await Promise.all(Array.from({ length: 8 }, (_, k) => ei.attachment('pi', 'c0000', `att${k}`, { msg: ci.recs[ci.recs.length - 1].vendorId })));
    const wi = performance.now() - ti; const mi = maxUnitsIn(Wi.sends.slice(bi), 1000);
    ok(ri.every((x) => x.ok) && wi >= 2900 && mi <= 80, `8 concurrent 20-unit fetches after 3 s idle: ${(wi / 1000).toFixed(1)} s (≥ 3 s), ≤ ${mi} units in any second — an idle bucket is judged at burst, never as its projection`, JSON.stringify({ wi, mi }));
    ei.stop();
  }
  // verify r3 (iv): a remove() under a FULL queue — the callers queued behind the removed account are ABORTED by name,
  // never let through (returning "nothing to pace against" let 17 × 20 units leave within 1 ms of the remove)
  async function removeUnderQueue(ENGmod, label) {
    const Wr = makeWorld(Date.now(), { n: 1, hot: 0, warm: 0 });
    const cr = Wr.convs.get('c0000'); cr.recs[cr.recs.length - 1].attachments = Array.from({ length: 12 }, (_, k) => ({ id: `att${k}`, name: `f${k}.txt`, mime: 'text/plain' }));
    Wr.sends = [];
    const kr = pacedOutsideModule('pr', Wr);
    const dirR = path.join(ROOT, `remove-${label}`); seedAccounts(dirR, [['pr', 'pr']]);
    const { eng: er } = mkEngine(`remove-${label}`, { kinds: [kr], now: () => Date.now(), dataDir: dirR, mod: ENGmod });
    await er.pass('pr', { force: true });
    await sleep(1100);
    const br = Wr.sends.length;
    const ps = Array.from({ length: 12 }, (_, k) => er.attachment('pr', 'c0000', `att${k}`, { msg: cr.recs[cr.recs.length - 1].vendorId }));
    await sleep(150);   // two left at once, the third sleeps, nine queue
    const tr = performance.now();
    await er.remove('pr');
    const rs = await Promise.race([Promise.all(ps), sleep(9000).then(() => null)]);
    const after = Wr.sends.slice(br).filter((s) => s.at >= tr);
    const out = { hung: rs === null, sentBefore: Wr.sends.length - br - after.length, after: after.length, unitsAfter: after.reduce((a, s) => a + s.units, 0), within50ms: after.filter((s) => s.at - tr <= 50).length, aborted: rs ? rs.filter((x) => !x.ok && x.code === 'transport' && /account changed/.test(x.error)).length : 0, okAfter: rs ? rs.filter((x) => x.ok).length : 0 };
    try { er.stop(); } catch {}
    return out;
  }
  {
    const r3 = await removeUnderQueue(ENG, 'real');
    ok(!r3.hung && r3.after === 0 && r3.aborted === 12 - r3.sentBefore && r3.okAfter === r3.sentBefore, `remove() under a full queue: ${r3.sentBefore} had left, 0 vendor calls after the removal, the ${r3.aborted} queued callers aborted by name ("the account changed")`, JSON.stringify(r3));
    const Mr = mutantCopies('chan-agg-remove', REPO);
    const cwr = closedWorld(Mr, 'pre-r3-pace', { engine: [
      ['    if (!e0) throw gone();', '    if (!e0) return;'],
      ['        if (e !== e0) throw gone();   // THE ENTRY THIS CALL QUEUED AGAINST IS GONE OR REPLACED\n        const d = e.record ? paceDecl(e.record) : null;', '        const d = e && e.record ? paceDecl(e.record) : null;'],
    ] });
    ok(cwr.setup, 'CONTROL setup: the r2 build\'s paceWait (a gone entry = "nothing to pace against" = return) is reconstructed', cwr.missing);
    const c3 = await removeUnderQueue(cwr.mod, 'ctl');
    ok(c3.after >= 8 && c3.within50ms >= 8 && c3.unitsAfter >= 160, `CONTROL: ${c3.after} calls = ${c3.unitsAfter} units leave within 50 ms of the remove (${c3.within50ms}) — the leg above would go red`, JSON.stringify(c3));
    for (const r2 of copiesCensus(Mr.files, Mr.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
  }
  // CONTROL: the R5 build's paceWait — no arrival order, no reservation (the two are one fix: with the FIFO alone the
  // race is only MASKED by microtask ordering, with the reservation alone the fairness hangs on timer granularity)
  const Mo = mutantCopies('chan-agg-outside', REPO);
  const cwo = closedWorld(Mo, 'pre-fix-pace', { engine: [
    ['        if (!(ms > 0)) { e.paceInflight = (Number(e.paceInflight) || 0) + need; e.paceInflightAt = t; return; }   // THE RESERVATION — the same synchronous step as the judgement', '        if (!(ms > 0)) return;'],
    ['    await prev;\n    try {', '    try {'],
  ] });
  ok(cwo.setup, 'CONTROL setup: the R5 build\'s paceWait (no arrival order, no reservation) is reconstructed', cwo.missing);
  const c = await outsideThePass(cwo.mod, 'ctl');
  ok(c.burst.max1s >= 120 && c.burst.wall < 1000, `CONTROL: the 6 fetches leave in ${c.burst.wall.toFixed(0)} ms — ${c.burst.max1s} units in one second — the burst leg above would go red`, JSON.stringify(c.burst));
  // the pre-fix page-back loses a round only when its own timer fires a hair EARLY (Node arms a timer at the loop
  // iteration's cached clock) and re-sleeps 1 ms while the pass's fetch passes — timer-phase dependent (5.7 s of an
  // 8-row ingest in verify r2's attack log, a clean slot in other runs), so it is PRINTED here, not asserted; the
  // FIFO is what makes the fixed leg's position exact, and the burst control above is this mutant's red
  console.log(`    (pre-fix page-back: position ${c.pageBack.pos} of ${c.pageBack.n}, ${c.pageBack.olderMs.toFixed(0)} ms — timer-phase dependent, see the comment)`);
  for (const r2 of copiesCensus(Mo.files, Mo.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}

// ── lane R5 verify r4: THE EXIT CENSUS + the lifecycle ends that let queued calls through + the in-flight write ──
console.log('③g (v) THE EXIT CENSUS: live.delete has ONE site (dropLive) and every lifecycle verb takes it; (vi) disable / disconnect under a full queue; (vii) a fetch that outlived its entry writes nothing; (viii) an exit never refills the bucket');
/** Every lifecycle end of an account's right to call the vendor takes the ONE exit (`dropLive`): a grep over the
 *  engine's CODE (comments stripped). `live.delete(` / `live.set(` have one site each; every listed verb's body
 *  (its indent-2 block) carries its `dropLive(` (stop: the flag + the wake); every `dropLive(` CALL lies inside a
 *  listed verb; every vendor-then-write path (ingest / discover / loadOlder / attachment) carries `outlived(rec, e)`. */
function exitCensus(src) {
  const lines = src.split('\n'); const code = (l) => l.replace(/\/\/.*$/, ''); const isComment = (l) => /^\s*(\*|\/\/|\/\*)/.test(l);
  const problems = [];
  const count = (re) => lines.filter((l) => !isComment(l) && re.test(code(l))).length;
  if (count(/\blive\.delete\(/) !== 1) problems.push(`live.delete( has ${count(/\blive\.delete\(/)} sites (must be 1, inside dropLive)`);
  if (count(/\blive\.set\(/) !== 1) problems.push(`live.set( has ${count(/\blive\.set\(/)} sites (must be 1, inside adapterFor)`);
  const block = (name) => { const i = lines.findIndex((l) => new RegExp(`^  (async )?function ${name}\\(`).test(l)); if (i < 0) return null; let j = i + 1; while (j < lines.length && !/^  }/.test(lines[j])) j++; return { from: i, to: j, text: lines.slice(i, j + 1).filter((l) => !isComment(l)).map(code).join('\n') }; };
  const EXITS = { dropLive: /\blive\.delete\(id\)/, removeRecord: /dropLive\(rec\.id, 'removed'\)/, setEnabled: /if \(!enabled\) dropLive\(rec\.id, 'disabled'\)/, disconnect: /dropLive\(rec\.id, 'disconnected'\)/, setOptions: /if \(rebuild\) dropLive\(rec\.id, 'options changed'\)/, applyRebind: /dropLive\(rec\.id, 'client switched'\)/, inlineLegacyClient: /dropLive\(rec\.id, 'client moved onto the account'\)/, connect: /dropLive\(rec\.id, 'connect refused'\)/, stop: /stopped = true[\s\S]*wakeSleepers\(e\)/ };
  const blocks = {};
  for (const [fn, re] of Object.entries(EXITS)) { const b = block(fn); blocks[fn] = b; if (!b) problems.push(`no function ${fn}()`); else if (!re.test(b.text)) problems.push(`${fn}() does not take the exit (${re.source.slice(0, 48)})`); }
  lines.forEach((l, i) => { if (isComment(l) || !/\bdropLive\(/.test(code(l)) || /function dropLive\(/.test(l)) return; if (!Object.values(blocks).some((b) => b && i >= b.from && i <= b.to)) problems.push(`line ${i + 1}: a dropLive( call outside every listed verb (a new lifecycle end must be listed)`); });
  for (const fn of ['ingest', 'discover', 'loadOlder', 'attachment']) { const b = block(fn); if (!b || !/outlived\(rec, e\)/.test(b.text)) problems.push(`${fn}() has no outlived(rec, e) guard after its vendor call`); }
  if (!/const outlived = \(rec, e\) => stopped \|\| live\.get\(rec\.id\) !== e;/.test(src)) problems.push('outlived is not the one rule (stopped || the entry changed)');
  if (!/live\.get\(rec\.id\) \|\| paceCarry\.get\(rec\.id\)/.test(src)) problems.push('the meter dep does not charge the ghost of a dropped entry');
  return problems;
}
{
  const c0 = exitCensus(ENGINE_SRC);
  ok(c0.length === 0, 'THE EXIT CENSUS on the shipped engine: one live.delete (dropLive), one live.set (adapterFor), removeRecord / setEnabled / disconnect / setOptions / applyRebind / inlineLegacyClient / connect / stop take it, every dropLive call inside a listed verb, the four vendor-then-write paths guarded', c0.join(' ; '));
  // the census must SEE each miss (text-level copies; the two verbs below are also driven for real)
  const noDisable = ENGINE_SRC.replace("    if (!enabled) dropLive(rec.id, 'disabled');", "    if (!enabled) { const e = live.get(rec.id); if (e) disarmPush(e, 'adapter disabled'); }");
  ok(noDisable !== ENGINE_SRC && exitCensus(noDisable).some((x) => /setEnabled\(\) does not take the exit/.test(x)), 'CONTROL (text): the r3 setEnabled (disarm only) is RED by name');
  const selfDelete = ENGINE_SRC.replace("    dropLive(rec.id, 'removed');\n    paceCarry.delete(rec.id);", "    { const e = live.get(rec.id); if (e) { disarmPush(e, 'removed'); live.delete(rec.id); } }");
  const cs = exitCensus(selfDelete);
  ok(selfDelete !== ENGINE_SRC && cs.some((x) => /live\.delete\( has 2 sites/.test(x)) && cs.some((x) => /removeRecord\(\) does not take the exit/.test(x)), 'CONTROL (text): a removeRecord that deletes the entry itself is RED twice (a second live.delete site, the verb without its exit)');
  const noGuard = ENGINE_SRC.replace("      if (outlived(rec, e)) return { appended, duplicates, anchorMoved: false, complete: false, why: 'account-changed' };\n", '');
  ok(noGuard !== ENGINE_SRC && exitCensus(noGuard).some((x) => /ingest\(\) has no outlived/.test(x)), 'CONTROL (text): an ingest that writes whatever came back is RED');
  const strayDrop = ENGINE_SRC.replace("  async function setLabel(adapterId, label) {\n", "  async function setLabel(adapterId, label) {\n    dropLive(adapterId, 'renamed');\n");
  ok(strayDrop !== ENGINE_SRC && exitCensus(strayDrop).some((x) => /dropLive\( call outside every listed verb/.test(x)), 'CONTROL (text): a new verb that drops without being listed is RED (the list is the census)');
  ok(!exitCensus(ENGINE_SRC + "\n// live.delete(id) live.set(x) dropLive(rec.id, 'in a comment')\n").length, 'a comment spelling live.delete / live.set / dropLive is not counted (a census that counts its documentation is silenced by rewording it)');
  // the pending-flow adapter (beginPending) is constructed WITHOUT pace/meter — its only calls may be the consent's
  const pend = ENGINE_SRC.split('\n').filter((l) => /\bp\.adapter\.\w+/.test(l.replace(/\/\/.*$/, '')));
  ok(pend.length >= 2 && pend.every((l) => /p\.adapter\.auth\./.test(l)), `the transient consent adapter (no pace, no meter) is only ever asked for auth.begin / auth.finish (${pend.length} uses), never a read`, pend.join(' | '));
}
// (vi) THE TWO LIFECYCLE ENDS r3 RECORDED: disable / disconnect under a full queue ⇒ 0 vendor calls after, every queued caller
//      aborted by name, a fresh call after a disable refused `disabled`; the pass in flight ends at its next step
async function underQueue(ENGmod, label, event, { n = 12, atMs = 150, delay = null } = {}) {
  const W = makeWorld(Date.now(), { n: 1, hot: 0, warm: 0 });
  const conv = W.convs.get('c0000'); conv.recs[conv.recs.length - 1].attachments = Array.from({ length: n }, (_, k) => ({ id: `att${k}`, name: `f${k}.txt`, mime: 'text/plain' }));
  W.sends = []; if (delay) W.delay = delay;
  const K = pacedOutsideModule('pq', W);
  const dir = path.join(ROOT, `uq-${label}`); seedAccounts(dir, [['pq', 'pq']]);
  const { eng } = mkEngine(`uq-${label}`, { kinds: [K], now: () => Date.now(), dataDir: dir, mod: ENGmod });
  await eng.pass('pq', { force: true });
  await sleep(1100);
  const b = W.sends.length; const msg = conv.recs[conv.recs.length - 1].vendorId;
  const ps = Array.from({ length: n }, (_, k) => eng.attachment('pq', 'c0000', `att${k}`, { msg }));
  await sleep(atMs);
  const tr = performance.now();
  await event(eng);
  const rs = await Promise.race([Promise.all(ps), sleep(9000).then(() => null)]);
  const after = W.sends.slice(b).filter((s) => s.at >= tr);
  const out = { hung: rs === null, sentBefore: W.sends.length - b - after.length, after: after.length, unitsAfter: after.reduce((a, s) => a + s.units, 0), aborted: rs ? rs.filter((x) => !x.ok && x.code === 'transport' && /account changed/.test(x.error)).length : 0, okBefore: rs ? rs.filter((x) => x.ok).length : 0 };
  const b2 = W.sends.length;
  const fresh = await eng.attachment('pq', 'c0000', `att${n - 1}`, { msg });   // a never-fetched part (the two that left are cached, and a cache hit is local)
  out.fresh = { code: fresh.ok ? (fresh.cached ? 'ok-cached' : 'ok-vendor') : fresh.code, sends: W.sends.length - b2 };
  out.budget = eng.budgetOf('pq');
  return { out, eng, W };
}
{
  const d = await underQueue(ENG, 'disable', (e) => e.setEnabled('pq', false));
  ok(!d.out.hung && d.out.after === 0 && d.out.aborted === 12 - d.out.sentBefore && d.out.fresh.code === 'disabled' && d.out.fresh.sends === 0, `setEnabled(false) under a full queue: ${d.out.sentBefore} had left, 0 vendor calls after, the ${d.out.aborted} queued callers aborted by name, a fresh fetch refused '${d.out.fresh.code}' with no call (r3 recorded 18 × 20 units finishing, paced, after the owner disabled the account)`, JSON.stringify(d.out));
  await d.eng.setEnabled('pq', true);
  const again = await d.eng.pass('pq', { force: true });
  ok(again.ok === true, 'setEnabled(true) after it: the next pass runs again (the exit is not a removal)', JSON.stringify(again));
  d.eng.stop();
  const x = await underQueue(ENG, 'disconnect', (e) => e.disconnect('pq'));
  ok(!x.out.hung && x.out.after === 0 && x.out.aborted === 12 - x.out.sentBefore, `disconnect() under a full queue: ${x.out.sentBefore} had left, 0 vendor calls after, the ${x.out.aborted} queued callers aborted by name (r3 recorded them finishing with the Bearer captured before the wait)`, JSON.stringify(x.out));
  ok(x.out.budget && x.out.budget.spent >= 40 * x.out.sentBefore, `the minute's spend survives the disconnect (${x.out.budget && x.out.budget.spent} units on the rebuilt entry — an exit never refills)`, JSON.stringify(x.out.budget));
  x.eng.stop();
  // CONTROL (driven): the r3 setEnabled (disarm only) lets the queue finish, paced — calls AFTER the disable
  const Mx = mutantCopies('chan-agg-exit', REPO);
  const cwx = closedWorld(Mx, 'pre-r4-disable', { engine: [["    if (!enabled) dropLive(rec.id, 'disabled');", "    if (!enabled) { const e = live.get(rec.id); if (e) disarmPush(e, 'adapter disabled'); }"]] });
  ok(cwx.setup, 'CONTROL setup: the r3 build\'s setEnabled (disarm only, no exit) is reconstructed', cwx.missing);
  const c = await underQueue(cwx.mod, 'disable-ctl', (e) => e.setEnabled('pq', false), { n: 6 });
  ok(c.out.after >= 3 && c.out.aborted === 0, `CONTROL: ${c.out.after} calls = ${c.out.unitsAfter} units leave AFTER the disable, none aborted — the leg above would go red`, JSON.stringify(c.out));
  c.eng.stop();
  for (const r2 of copiesCensus(Mx.files, Mx.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}
// (vii) A FETCH THAT OUTLIVED ITS ENTRY WRITES NOTHING: remove() while a pass's history() is in flight ⇒ no index row, no
//       log file of the removed account; remove() while an attachment fetch is in flight ⇒ no cache file
{
  const Wr = makeWorld(Date.now(), { n: 3, hot: 0, warm: 0 }); Wr.sends = []; Wr.delay = { history: 600 };
  const kr = pacedOutsideModule('pv', Wr);
  const dirV = path.join(ROOT, 'outlive-pass'); seedAccounts(dirV, [['pv', 'pv']]);
  const { eng: ev } = mkEngine('outlive-pass', { kinds: [kr], now: () => Date.now(), dataDir: dirV });
  const pp = ev.pass('pv', { force: true });
  await sleep(300);   // discovery done, the first history() in flight (600 ms)
  await ev.remove('pv');
  const r = await pp;
  await sleep(900);
  const rows = Object.keys(ev.store.index.snapshot().conversations).filter((k) => k.startsWith('pv/'));
  const files = fs.existsSync(path.join(dirV, 'channels', 'msgs')) ? fs.readdirSync(path.join(dirV, 'channels', 'msgs')).filter((f) => f.startsWith('pv')) : [];
  ok(r.ok === false && r.why === 'account-changed' && rows.length === 0 && files.length === 0 && !ev.adapterRecords().adapters.some((a) => a.id === 'pv'), `remove() under an in-flight pass fetch: the pass ends '${r.why}', ${rows.length} index rows and ${files.length} log files of the removed account (r3: the page landed after the remove and resurrected pv/c0000 + its log)`, JSON.stringify({ r, rows, files }));
  ev.stop();
  const Wa = makeWorld(Date.now(), { n: 1, hot: 0, warm: 0 }); const ca = Wa.convs.get('c0000'); ca.recs[ca.recs.length - 1].attachments = [{ id: 'att0', name: 'f0.txt', mime: 'text/plain' }];
  Wa.sends = []; Wa.delay = { attach: 600 };
  const ka = pacedOutsideModule('pw', Wa);
  const dirA = path.join(ROOT, 'outlive-att'); seedAccounts(dirA, [['pw', 'pw']]);
  const { eng: ea } = mkEngine('outlive-att', { kinds: [ka], now: () => Date.now(), dataDir: dirA });
  await ea.pass('pw', { force: true }); await sleep(1100);
  const pa = ea.attachment('pw', 'c0000', 'att0', { msg: ca.recs[ca.recs.length - 1].vendorId });
  await sleep(200);
  await ea.remove('pw');
  const ra = await pa;
  const attDir = path.join(dirA, 'channels', 'attachments');
  const cached = fs.existsSync(attDir) ? fs.readdirSync(attDir, { recursive: true }).map(String).filter((f) => /^pw/.test(f)) : [];
  ok(ra.ok === false && ra.code === 'account-changed' && cached.length === 0, `remove() under an in-flight attachment fetch: answered '${ra.code}', ${cached.length} cache files under the removed account (r3: five)`, JSON.stringify({ ra, cached }));
  ea.stop();
  // CONTROL (driven): the r3 ingest writes the page that came back after the remove
  const Mw = mutantCopies('chan-agg-outlive', REPO);
  const cww = closedWorld(Mw, 'pre-r4-write', { engine: [["      if (outlived(rec, e)) return { appended, duplicates, anchorMoved: false, complete: false, why: 'account-changed' };\n", '']] });
  ok(cww.setup, 'CONTROL setup: the r3 build\'s ingest (no outlived guard) is reconstructed', cww.missing);
  const Wc = makeWorld(Date.now(), { n: 3, hot: 0, warm: 0 }); Wc.sends = []; Wc.delay = { history: 600 };
  const kc = pacedOutsideModule('px', Wc);
  const dirC = path.join(ROOT, 'outlive-ctl'); seedAccounts(dirC, [['px', 'px']]);
  const { eng: ec } = mkEngine('outlive-ctl', { kinds: [kc], now: () => Date.now(), dataDir: dirC, mod: cww.mod });
  const pc = ec.pass('px', { force: true }); await sleep(300); await ec.remove('px'); await pc; await sleep(900);
  const rowsC = Object.keys(ec.store.index.snapshot().conversations).filter((k) => k.startsWith('px/'));
  ok(rowsC.length >= 1, `CONTROL: ${rowsC.length} index row(s) of the removed account resurrected by the in-flight page — the leg above would go red`, JSON.stringify(rowsC));
  ec.stop();
  for (const r2 of copiesCensus(Mw.files, Mw.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}
// (viii) AN EXIT NEVER REFILLS THE BUCKET: a burst that empties it, then disable + enable ⇒ the next two fetches WAIT;
//        the control (no carry) has a full bucket after the toggle and they leave at once
async function toggleBurst(ENGmod, label) {
  const W = makeWorld(Date.now(), { n: 1, hot: 0, warm: 0 }); const cv = W.convs.get('c0000'); cv.recs[cv.recs.length - 1].attachments = Array.from({ length: 4 }, (_, k) => ({ id: `att${k}`, name: `f${k}.txt`, mime: 'text/plain' }));
  W.sends = [];
  const K = pacedOutsideModule('pt', W);
  const dir = path.join(ROOT, `toggle-${label}`); seedAccounts(dir, [['pt', 'pt']]);
  const { eng } = mkEngine(`toggle-${label}`, { kinds: [K], now: () => Date.now(), dataDir: dir, mod: ENGmod });
  await eng.pass('pt', { force: true }); await sleep(1100);
  const msg = cv.recs[cv.recs.length - 1].vendorId;
  await Promise.all([eng.attachment('pt', 'c0000', 'att0', { msg }), eng.attachment('pt', 'c0000', 'att1', { msg })]);   // 40 units: the bucket is empty now
  await eng.setEnabled('pt', false); await eng.setEnabled('pt', true);
  const spentAfterToggle = eng.budgetOf('pt').spent;   // verify r5: read through the ghost before any call rebuilds the entry
  const t0 = performance.now();
  await Promise.all([eng.attachment('pt', 'c0000', 'att2', { msg }), eng.attachment('pt', 'c0000', 'att3', { msg })]);
  const wall = performance.now() - t0;
  const spent = eng.budgetOf('pt').spent;
  eng.stop();
  return { wall, spent, spentAfterToggle, max1s: maxUnitsIn(W.sends, 1000) };
}
{
  const r = await toggleBurst(ENG, 'real');
  ok(r.wall >= 400 && r.max1s <= 80 && r.spent >= 121, `disable + enable after an emptying burst: the next two fetches wait ${r.wall.toFixed(0)} ms (≥ 400: the bucket came back with the rebuilt entry), ≤ ${r.max1s} units in any second, the minute's spend kept (${r.spent})`, JSON.stringify(r));
  ok(r.spentAfterToggle >= 41, `verify r5: the budget read right after the toggle (before any call rebuilt the entry) is the ghost's ${r.spentAfterToggle}, not zero`);
  const Mt = mutantCopies('chan-agg-carry', REPO);
  const cwt = closedWorld(Mt, 'no-carry', { engine: [['      if (ghost) { e.win = ghost.win; e.exhaustedAt = ghost.exhaustedAt; e.paceTok = ghost.paceTok; e.paceRecent = ghost.paceRecent; e.paceLeakWarnAt = ghost.paceLeakWarnAt; paceCarry.delete(rec.id); }', '      if (ghost) paceCarry.delete(rec.id);']] });
  ok(cwt.setup, 'CONTROL setup: an exit that forgets the buckets is reconstructed', cwt.missing);
  const c = await toggleBurst(cwt.mod, 'ctl');
  ok(c.wall < 300, `CONTROL: after the toggle the two fetches leave in ${c.wall.toFixed(0)} ms (a full bucket per toggle — a fresh 80-unit burst on every disable/enable, ${c.max1s} units in one second) — the leg above would go red`, JSON.stringify(c));
  for (const r2 of copiesCensus(Mt.files, Mt.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}

// THE PER-SECOND PACE IN THE REAL ENGINE (lane R5, drain rule 18): the
// owner's first ingest — 873 conversations at 40 units a thread read — under
// the Gmail defaults (40 units/s, 3000/min), on a pace clock the injected
// sleep advances together with the logical one (as real time moves both).
console.log('③e the per-second pace in the real engine: 873 first reads at 40 units — ≤ 80 in any second, ≤ 2440 in any minute, the first-read line mid-way');
async function pacedIngest(label, { pace = true } = {}) {
  // (B-df40 part 3: a scripted module reads NO setting — registration refuses a key no vendor table declares; the
  // keys these modules named were never set, so the 3000 / 40 defaults are what the engine read before too)
  const Wp = makeWorld(clock, { n: 873, hot: 0, warm: 0 });
  let pt = 0;
  Wp.sends = []; Wp.paceNow = () => pt;
  const kp = worldModule('pc', Wp, { unitsPerHistory: 40, budgetDefault: 3000, budgetSettingKey: null, pace: pace ? { unitsPerSec: 40, settingKey: null, cost: { fetch: 40, discover: 1, scanHost: 1 } } : null, vendorName: 'Google' });
  const dirP = path.join(ROOT, `paced-${label}`);
  seedAccounts(dirP, [['pc', 'pc']]);
  const sleeps = [];
  const { eng: ep, events: evs } = mkEngine(`paced-${label}`, { kinds: [kp], now, dataDir: dirP, extra: { paceClock: () => pt, sleep: (ms) => new Promise((res) => { sleeps.push(ms); pt += ms; clock += ms; setImmediate(res); }) } });   // a sleep moves BOTH clocks, as real time does
  let mid = null;
  Wp.onHistory = () => { if (!mid && historyCalls(Wp) === 101) { const v = ep.adapterView(ep.adapterRecords().adapters.find((a) => a.id === 'pc')); mid = { firstIngest: v.scheduler.firstIngest, text: caps.firstReadText(v.scheduler), pace: v.pace, budgetPerSec: v.budget.perSec }; } };
  const ev0 = evs.length;
  // lane R5 verify: a REAL-TIME watchdog — a driver that ignores the drain's `wait` (re-asks without sleeping) never moves
  // the injected pace clock and would HANG this pass (a suite timeout, not a red assertion); 120 s of wall time is the bound
  let watchdog = null;
  const first = await Promise.race([ep.pass('pc', { force: true }), new Promise((res) => { watchdog = setTimeout(() => res({ ok: false, why: 'WATCHDOG: the paced pass did not finish in 120 s of real time — a driver that spins on `wait`' }), 120e3); })]);
  if (watchdog) clearTimeout(watchdog);
  const upd = evs.slice(ev0).filter((m) => m.type === 'channels-updated');
  const progress = upd.map((m) => { const a = (m.digest.adapters || []).find((x) => x.id === 'pc'); return a && a.scheduler && a.scheduler.firstIngest ? a.scheduler.firstIngest.done : null; }).filter((x) => x !== null);
  const L = Wp.sends;
  const maxIn = (T) => { let best = 0, sum = 0, i = 0; for (let j = 0; j < L.length; j++) { sum += L[j].units; while (L[j].at - L[i].at > T) { sum -= L[i].units; i++; } best = Math.max(best, sum); } return best; };
  const walked = Object.values(ep.store.index.live()).filter((en) => en.adapterId === 'pc' && en.walkedAt).length;
  const after = ep.adapterView(ep.adapterRecords().adapters.find((a) => a.id === 'pc'));
  ep.stop();
  return { first, reads: historyCalls(Wp), walked, max1s: maxIn(1000), max60s: maxIn(60e3), wallSec: L.length ? (L[L.length - 1].at - L[0].at) / 1000 : 0, maxSleep: sleeps.length ? Math.max(...sleeps) : 0, sleeps: sleeps.length, mid, doneFirstIngest: after.scheduler.firstIngest, broadcasts: upd.length, progress };
}
{
  const r = await pacedIngest('on');
  ok(r.first.ok && r.reads === 873 && r.walked === 873 && r.doneFirstIngest === null, `ONE forced pass reads all 873 conversations once (${r.reads} reads, ${r.walked} walked) — never cut by the minute's budget`, JSON.stringify({ first: r.first.ok, why: r.first.why, reads: r.reads }));
  ok(r.max1s <= 80 && r.max60s <= 2440, `no second of the pace clock holds more than 80 units (${r.max1s}) and no minute more than 2440 (${r.max60s}) — Google's cap is 6000/min per user`);
  ok(r.wallSec >= 870 && r.wallSec <= 875 && r.maxSleep <= 1000, `one thread read a second: the first read takes ${r.wallSec.toFixed(0)} s of pace clock, in sleeps of ≤ 1 s (${r.sleeps} sleeps, the longest ${r.maxSleep} ms)`);
  const m = r.mid || {};
  ok(m.firstIngest && m.firstIngest.done === 100 && m.firstIngest.total === 873 && Math.abs(m.firstIngest.etaSec - 773) <= 1 && m.text === 'reading for the first time · 100/873 conversations · about 13 min left', `mid-way the account row says how far and how long: "${m.text}"`, JSON.stringify(m.firstIngest));
  ok(m.pace && m.pace.unitsPerSec === 40 && m.pace.spentLastSec <= 80 && m.budgetPerSec === 40, 'the account row carries the pace (40 units/s, the last second\'s spend) and the budget carries the per-second figure its sentence names', JSON.stringify({ pace: m.pace, budgetPerSec: m.budgetPerSec }));
  const rising = r.progress.every((x, i) => i === 0 || x >= r.progress[i - 1]);
  ok(r.broadcasts >= 150 && r.broadcasts <= Math.ceil(r.wallSec / 5) + 3 && r.progress.length >= 150 && rising && r.progress[r.progress.length - 1] >= 860, `a long paced pass says its progress at most every 5 s (${r.broadcasts} broadcasts over ${r.wallSec.toFixed(0)} s — never one per fetch), each carrying the first-read count, rising (${r.progress.slice(0, 3).join(', ')} … ${r.progress.slice(-2).join(', ')})`, JSON.stringify({ n: r.broadcasts, head: r.progress.slice(0, 5) }));
  const b = caps.budgetText({ exhausted: true, unit: 'quota-unit', limit: 3000, perSec: 40, waiting: 12, resetInSeconds: 30 });
  ok(b === 'Vendor budget reached — 3000 quota units/min (at most 40/s) for this account; 12 conversations waiting, next refresh in 30 s', `the budget sentence names units/min AND units/s: "${b}"`);
  // CONTROL: the same pass with no pace declared is the burst the vendor refused
  const c = await pacedIngest('off', { pace: false });
  ok(c.max1s >= 2000 && c.reads < 873, `CONTROL: with no pace the minute's 3000 units leave inside ONE second of the same clock (${c.max1s} units, ${c.reads} reads before the cut) — the shape Google refused; the legs above would go red`);
}

// A REQUEST FILED DURING A PACE WAIT IS JUDGED AT SIGHT (lane R5 verify): the
// pass slept ≤ 1 s on the drain's `wait` and nothing woke it, so an agent's
// refresh inside the floor — a refusal the model answers at the next STEP —
// waited out the sleep (~0.9 s measured) and the owner's press was taken only
// then. `pokeDrain` now wakes the sleeping pass; the wait resumes for what is
// left. Real timers on purpose: the wake is a timer's cancellation.
console.log('③f a request filed during a pace wait is judged at sight: the sleeping pass wakes, a refusal never waits out the sleep');
async function judgedAtSight(ENGmod, label) {
  const Wj = makeWorld(Date.now(), { n: 4, hot: 0, warm: 0 });
  Wj.delayMs = 20;
  const kj = worldModule('js', Wj, { unitsPerHistory: 40, budgetDefault: 3000, budgetSettingKey: null, pace: { unitsPerSec: 40, settingKey: null, cost: { fetch: 40, discover: 1, scanHost: 1 } }, vendorName: 'Google' });
  const dirJ = path.join(ROOT, `sight-${label}`);
  seedAccounts(dirJ, [['js', 'js']]);
  const { eng: ej } = mkEngine(`sight-${label}`, { kinds: [kj], settings: { 'channels.agentRefreshFloorSec': 60 }, now: () => Date.now(), dataDir: dirJ, mod: ENGmod });
  let firstRead = null;
  Wj.onHistory = (id) => { if (!firstRead) firstRead = id; };
  const p = ej.pass('js', { force: true });
  for (let i = 0; i < 200 && historyCalls(Wj) < 1; i++) await sleep(10);   // the first read went; the drain now sleeps ~1 s for the next
  await sleep(60);
  const t0 = performance.now();
  const r = await ej.refresh('js', firstRead, { origin: 'agent' });   // inside the floor ⇒ a refusal, judged at the next step
  const ms = performance.now() - t0;
  await p; ej.stop();
  return { code: r.code, ms, reads: historyCalls(Wj) };
}
{
  const r = await judgedAtSight(ENG, 'real');
  ok(r.code === 'refresh-floor' && r.ms < 250, `an agent refresh of the row just read, filed ~60 ms into the ~1 s pace wait, is refused AT SIGHT (${r.ms.toFixed(0)} ms, ${r.code}) — the sleeping pass was woken`, JSON.stringify(r));
  ok(r.reads === 4, `…and the pass still reads every row exactly once (${r.reads})`);
  const Ms = mutantCopies('chan-agg-sight', REPO);
  const cws = closedWorld(Ms, 'no-wake', { engine: [['    if (e.passing) { e.drainAfter = true; wakeSleepers(e); return; }', '    if (e.passing) { e.drainAfter = true; return; }']] });
  ok(cws.setup, 'CONTROL setup: pokeDrain without the wake (the R5 build) is reconstructed', cws.missing);
  const c = await judgedAtSight(cws.mod, 'ctl');
  ok(c.code === 'refresh-floor' && c.ms >= 400, `CONTROL: without the wake the same refusal waits out the sleep (${c.ms.toFixed(0)} ms) — the leg above would go red`, JSON.stringify(c));
  for (const r2 of copiesCensus(Ms.files, Ms.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}

// A SETTING OUT OF ITS RANGE IS NEVER CLAMPED SILENTLY (lane R2 verify): the
// Settings window stored 1800 while the engine ran 900 and nothing said so.
// The input clamps to the schema and says it; the engine reads the SAME
// bounds (one table, pinned against the schema) and logs a clamp once.
console.log('③c channel settings: the input clamps to the schema and says so; the engine\'s bounds ARE the schema\'s');
{
  const schemaMod = await import(path.join(REPO, 'src/lib/settings-schema.js'));
  const S = schemaMod.SETTINGS_SCHEMA;
  const cl = typeof schemaMod.clampToSchema === 'function' ? schemaMod.clampToSchema(S['channels.pollColdSec'], 1800) : null;
  ok(cl && cl.value === 900 && cl.bound === 'max', 'clampToSchema(pollColdSec, 1800) ⇒ 900 at the maximum', JSON.stringify(cl));
  const lo = typeof schemaMod.clampToSchema === 'function' ? schemaMod.clampToSchema(S['channels.pollHotSec'], 5) : null;
  ok(lo && lo.value === 10 && lo.bound === 'min' && schemaMod.clampToSchema(S['channels.pollHotSec'], 45).bound === null, '…5 s for the busy tier ⇒ 10 at the minimum; an in-range value passes untouched', JSON.stringify(lo));
  const ui = fs.readFileSync(path.join(REPO, 'src/lib/settings-ui.js'), 'utf-8');
  const numBranch = ui.slice(ui.indexOf("if (schema.type === 'number') {"), ui.indexOf("if (schema.type === 'enum') {"));
  ok(/clampToSchema\(schema, num\)/.test(numBranch) && /showToast\(/.test(numBranch) && /input\.value = /.test(numBranch), 'the Settings number input clamps through clampToSchema, writes the clamped value back into the field and TOASTS it');
  const B = ENG.SETTING_BOUNDS || {};
  const rows = Object.entries(S).filter(([k, v]) => /^channels\./.test(k) && v.type === 'number' && k !== 'channels.pushCoalesceSeconds');
  const drift = rows.filter(([k, v]) => !B[k] || B[k].min !== v.min || B[k].max !== v.max || B[k].dflt !== v.default).map(([k, v]) => `${k}: schema ${v.default}/${v.min}/${v.max} engine ${JSON.stringify(B[k] || null)}`);
  ok(rows.length >= 11 && drift.length === 0, `every channels.* number setting (${rows.length}) is read by the engine with the schema's own default and bounds`, drift.join('; '));
  const logged = [];
  const cap = { log: (m) => logged.push(String(m)), warn: (m) => logged.push(String(m)), error() {} };
  const Wk = makeWorld(clock, { n: 4, hot: 0, warm: 0 });
  const dirK = path.join(ROOT, 'clamp');
  seedAccounts(dirK, [['clampy', 'clampy']]);
  const SK = { 'channels.pollColdSec': 1800 };
  const { eng: ek } = mkEngine('clamp', { kinds: [worldModule('clampy', Wk)], settings: SK, now, dataDir: dirK, log: cap });
  await ek.pass('clampy', { force: true });
  const c1 = ek.cadenceOf('clampy', 'c0000');
  ek.cadenceOf('clampy', 'c0001');
  const lines = logged.filter((m) => /channels\.pollColdSec/.test(m));
  ok(c1.seconds === 900 && lines.length === 1 && /1800/.test(lines[0]) && /900/.test(lines[0]) && /maximum/.test(lines[0]), 'the engine runs 900 for a stored 1800 and SAYS it once (the key, the stored value, the maximum it used)', JSON.stringify({ c1, lines }));
  ek.stop();
}

// ═══ ③h the vendor rows DECLARED once (B-df40 part 3) ═══════════════════════
// The design desk's settings-cleanup §2 P3 (verifier controls V1 / V2 / V4): the four per-vendor rows are declared
// ONCE in src/channel-settings.js — the schema row, the engine's bound + default and the adapter's caps all derive
// from it. The REAL lark / gmail modules (the engine registers them itself), seeded accounts, no vendor call.
console.log('③h the vendor rows declared once: schema row ⇄ adapter caps ⇄ engine bounds, one set of numbers (V1 V2 V4)');
{
  const CS = require(path.join(REPO, 'src/channel-settings.js'));
  const S = (await import(path.join(REPO, 'src/lib/settings-schema.js'))).SETTINGS_SCHEMA;
  const B = ENG.SETTING_BOUNDS;
  const readBy = new Map();
  for (const m of ENG.REAL_ADAPTERS) for (const role of ['budget', 'pace']) { const k = m.caps[role] && m.caps[role].settingKey; if (k) readBy.set(k, m.kind); }
  const derived = Object.entries(S).filter(([, r]) => r.channel).map(([k, r]) => [k, r.channel]);
  const noRow = [...readBy].filter(([k, kind]) => !S[k] || S[k].channel !== kind);
  const unread = derived.filter(([k, v]) => readBy.get(k) !== v);
  // slack-core (2.369.204): three REAL adapters (Lark, Gmail, Slack) × budget + pace = 6 rows (test-architecture 44e counts the same 6)
  ok(readBy.size === 6 && derived.length === 6 && !noRow.length && !unread.length, `every REAL adapter's budget / pace key (${[...readBy.keys()].join(', ')}) has its derived schema row (channel = the adapter's kind) — and every derived row is read by a REAL adapter`, JSON.stringify({ noRow, unread }));
  // V1 — the numbers at base 798d938a: SETTING_BOUNDS min / max literal, `dflt: null` = the adapter's caps default
  const BEFORE = { 'channels.budgetLarkPerMin': [60, 5, 1000, 5], 'channels.budgetGmailPerMin': [3000, 100, 6000, 100], 'channels.gmailUnitsPerSec': [40, 5, 100, 5], 'channels.larkRequestsPerSec': [5, 1, 50, 1] };
  const diff = Object.entries(BEFORE).flatMap(([k, [d, mn, mx, st]]) => [
    ...(!B[k] || B[k].dflt !== d || B[k].min !== mn || B[k].max !== mx ? [`${k} engine ${JSON.stringify(B[k] || null)}`] : []),
    ...(!S[k] || S[k].default !== d || S[k].min !== mn || S[k].max !== mx || S[k].step !== st ? [`${k} schema ${S[k] ? [S[k].default, S[k].min, S[k].max, S[k].step].join('/') : 'none'}`] : []),
  ]);
  ok(!diff.length, 'V1: the derived defaults are today\'s 60 / 3000 / 5 / 40 and the bounds today\'s (5–1000 · 100–6000 · 5–100 · 1–50) — in the engine\'s SETTING_BOUNDS and in the schema rows, the step too', diff.join('; '));
  ok(Object.values(B).every((b) => typeof b.dflt === 'number'), 'no SETTING_BOUNDS entry says `dflt: null` any more — every default is the number the schema row shows');
  const run = (ENGmod, label, settings) => {
    const logged = [];
    const dirV = path.join(ROOT, `declared-${label}`);
    seedAccounts(dirV, [['lk', 'lark'], ['gm', 'gmail']]);
    const { eng: ev } = mkEngine(`declared-${label}`, { kinds: [], settings, now, dataDir: dirV, log: { log: (m) => logged.push(String(m)), warn: (m) => logged.push(String(m)), error() {} }, mod: ENGmod });
    const recs = ev.adapterRecords().adapters;
    const view = (id) => ev.adapterView(recs.find((a) => a.id === id));
    const out = { lk: view('lk'), gm: view('gm') };
    view('lk'); view('gm');   // read again: a clamp is said ONCE per key / value
    ev.stop();
    return { ...out, said: logged.filter((m) => /\[channels\] setting /.test(m)) };
  };
  const d = run(ENG, 'defaults', {});
  const nums = (r) => ({ lark: [r.lk.budget.limit, r.lk.pace.perSec], gmail: [r.gm.budget.limit, r.gm.pace.perSec] });
  ok(d.lk.budget.limit === S['channels.budgetLarkPerMin'].default && d.lk.pace.perSec === S['channels.larkRequestsPerSec'].default && d.gm.budget.limit === S['channels.budgetGmailPerMin'].default && d.gm.pace.perSec === S['channels.gmailUnitsPerSec'].default && d.lk.budget.settingKey === 'channels.budgetLarkPerMin' && d.gm.pace.settingKey === 'channels.gmailUnitsPerSec' && !d.said.length,
    `V4: nothing stored ⇒ the engine's budgetDecl / paceDecl (the account card's budget.limit / pace.perSec) read the default the schema row shows — Lark ${d.lk.budget.limit}/min ${d.lk.pace.perSec}/s, Gmail ${d.gm.budget.limit}/min ${d.gm.pace.perSec}/s (one number, two readers)`, JSON.stringify(nums(d)));
  const OUT = { 'channels.budgetLarkPerMin': 5000, 'channels.gmailUnitsPerSec': 1, 'channels.budgetGmailPerMin': 50, 'channels.larkRequestsPerSec': 80 };
  const SAID = ['channels.budgetLarkPerMin = 5000 is above its maximum 1000 — using 1000', 'channels.gmailUnitsPerSec = 1 is below its minimum 5 — using 5', 'channels.budgetGmailPerMin = 50 is below its minimum 100 — using 100', 'channels.larkRequestsPerSec = 80 is above its maximum 50 — using 50'];
  const clamped = (r) => r.lk.budget.limit === 1000 && r.gm.pace.perSec === 5 && r.gm.budget.limit === 100 && r.lk.pace.perSec === 50 && r.said.length === 4 && SAID.every((w) => r.said.some((m) => m.includes(w) && m.includes('(change it in Settings → Channels)')));
  const c = run(ENG, 'clamped', OUT);
  ok(clamped(c), 'V2: a stored out-of-range vendor value is still CLAMPED through the derived bound and SAID once per key / value (the lane R2 sentence) — Lark 5000/min runs 1000, 80/s runs 50; Gmail 50/min runs 100, 1/s runs 5; the second read says nothing', JSON.stringify({ ...nums(c), said: c.said }));
  const DERIVE = 'const SETTING_BOUNDS = Object.freeze({ ...ENGINE_BOUNDS, ...ChannelSettings.boundsOf(ChannelSettings.CHANNEL_SETTINGS) });';
  ok(ENGINE_SRC.includes(DERIVE), 'the patch site of the derived-bounds control is in channels-engine.js (a moved line would make the control vacuous)');
  const Md = mutantCopies('chan-agg-declared', REPO);
  const ENGnb = Md.load('src/server/channels-engine.js', ENGINE_SRC.replace(DERIVE, 'const SETTING_BOUNDS = Object.freeze({ ...ENGINE_BOUNDS });'), 'no-vendor-bounds');
  const cm = run(ENGnb, 'clamped-mut', OUT);
  ok(!clamped(cm) && cm.lk.budget.limit === 5000 && !cm.said.length, `NEGATIVE CONTROL — an engine copy whose SETTING_BOUNDS does not derive the vendor rows runs the stored 5000/min UNCLAMPED (${cm.lk.budget.limit}) and says nothing: the clamp rides on the derivation`, JSON.stringify({ ...nums(cm), said: cm.said }));
  for (const r of copiesCensus(Md.files, Md.dir, REPO, { minCopies: 1 })) ok(r.pass, r.name, r.detail);
}

// ═══ ④ the owner's override ═════════════════════════════════════════════════
console.log('④ the refresh override wins, is refused outside its set, persists');
{
  const r1 = await eng.setRefresh('many', 'c0500', 60);
  ok(r1.ok && r1.cadence.seconds === 60 && r1.cadence.source === 'override', 'a cold conversation set to 60 s reads 60 s (override)');
  const bad = await eng.setRefresh('many', 'c0500', 45);
  ok(!bad.ok && bad.code === 'bad-request' && /30, 60, 300, 900, paused/.test(bad.error), 'a period outside the choices is refused by name', JSON.stringify(bad));
  const r2 = await eng.setRefresh('many', 'c0001', 'paused');
  ok(r2.ok && r2.cadence.paused, 'a hot conversation can be PAUSED');
  const before = new Map(W.calls.history);
  clock += 61e3;
  await eng.pass('many');
  const got = [...W.calls.history].filter(([k, v]) => v !== (before.get(k) || 0)).map(([k]) => k);
  ok(got.includes('c0500') && !got.includes('c0001'), 'at +61 s the 60 s override is polled and the paused one is NOT (the other hot rows are)', JSON.stringify(got.slice(0, 8)));
  const row = eng.digest({ keys: ['many/c0001', 'many/c0500'] }).conversations;
  ok(row.find((c) => c.id === 'c0001').freshness.state === 'paused' && row.find((c) => c.id === 'c0500').freshness.seconds === 60, 'the rows\' chips say "paused" and "within 60s"');
  const evs = events.filter((m) => m.type === 'channels-updated' && m.partial && (m.changedKeys || []).includes('many/c0500'));
  ok(evs.length >= 1, 'the override broadcast names the conversation (a partial digest, not the whole account)');
}

// ═══ ⑤ push first ═════════════════════════════════════════════════════════
console.log('⑤ push first: the safety net, pushed records of unknown conversations, kicks, the parked-SDK remedy');
{
  const Wp = makeWorld(clock, { n: 6, hot: 3, warm: 1 });
  let onEvent = null, onState = null;
  const live = { start(h) { onEvent = h.onEvent; onState = h.onState; onState({ state: 'live', at: clock, heard: true }); return { stop() {} }; } };
  const kp = worldModule('pushy', Wp, { receive: 'push', live });
  const dirP = path.join(ROOT, 'push');
  seedAccounts(dirP, [['pushy', 'pushy']]);
  const { eng: ep } = mkEngine('push', { kinds: [kp], now, dataDir: dirP, deliver, sessions: SESS });
  await ep.pass('pushy', { force: true });
  await ep.syncPushLanes();
  await ep.setPush('pushy', { claimedExclusive: 'exclusive' });
  onState({ state: 'live', at: clock, heard: true });
  const cad = ep.cadenceOf('pushy', 'c0000');
  ok(cad.seconds === 900 && cad.source === 'push-safety', 'a live, content-carrying lane drops even a HOT conversation to the 15-min safety net', JSON.stringify(cad));
  const before = historyCalls(Wp);
  clock += 31e3; onState({ state: 'live', at: clock, heard: true });
  await ep.pass('pushy');
  ok(historyCalls(Wp) === before, 'at +31 s nothing is polled while push carries content');
  const r = await onEvent({ kind: 'record', eventId: 'e-1', convId: 'dm-new', record: makeRecord({ adapterId: 'pushy', convId: 'dm-new', vendorId: 'p1', at: clock, author: { id: 'u9', name: 'Stranger' }, text: 'hello from a chat nobody listed', mentions: [], attachments: [], raw: {} }) });
  ok(r && r.ok && r.persisted === true, 'a pushed record for a conversation discovery never listed is PERSISTED (no `untracked` drop)', JSON.stringify(r));
  ok(ep.store.readTail('pushy', 'dm-new', { limit: 5 }).length === 1 && ep.store.index.live()['pushy/dm-new'], '…its log and its row exist');
  // kick mode: shared ⇒ a kick naming a conversation makes exactly it due
  await ep.setPush('pushy', { claimedExclusive: 'shared' });
  onState({ state: 'live', at: clock, heard: true });
  const b2 = new Map(Wp.calls.history);
  await onEvent({ kind: 'record', eventId: 'e-2', convId: 'c0004', record: makeRecord({ adapterId: 'pushy', convId: 'c0004', vendorId: 'k1', at: clock, author: { id: 'u1', name: 'A' }, text: 'kick', mentions: [], attachments: [], raw: {} }) });
  for (let i = 0; i < 60 && (Wp.calls.history.get('c0004') || 0) === (b2.get('c0004') || 0); i++) await sleep(100);
  ok((Wp.calls.history.get('c0004') || 0) > (b2.get('c0004') || 0), 'in kick mode an event NAMING a cold conversation makes it due now (one kick pass)');
  ok(ep.store.readTail('pushy', 'c0004', { limit: 50 }).every((x) => x.vendorId !== 'k1'), '…and the kick carried no content (the poll carries it)');
  ep.stop();
  // the Lark lane with no SDK parks unavailable with its CODE, and the card says the remedy
  const { createLarkLive } = require(path.join(REPO, 'src/channels/live/lark.js'));
  const states = [];
  const lane = createLarkLive({ adapterId: 'lark', credential: () => ({ values: { appId: 'cli_x', appSecret: 's' } }), toRecord: async () => null, log: quiet, reconnectMinMs: 10, reconnectMaxMs: 20 });
  const h = lane.start({ onEvent: async () => ({ ok: true }), onState: (s) => states.push(s) });
  for (let i = 0; i < 30 && !states.some((s) => s.state === 'unavailable'); i++) await sleep(20);
  h.stop();
  const un = states.find((s) => s.state === 'unavailable');
  ok(un && un.code === 'sdk-not-installed', 'without @larksuiteoapi/node-sdk the Lark lane parks unavailable with code sdk-not-installed', JSON.stringify(un));
  // lane lark-search-poll: a live EXCLUSIVE push lane still wins over a carrying change feed (reconcile); in kick mode
  // the carrying feed is the lane (the relaxed net) — the precedence of design §2.8, on the real engine
  {
    const Wpf = makeWorld(clock, { n: 6, hot: 3, warm: 1 });
    let onState2 = null;
    const live2 = { start(h) { onState2 = h.onState; onState2({ state: 'live', at: clock, heard: true }); return { stop() {} }; } };
    const kpf = worldModule('pushfeed', Wpf, { receive: 'push', live: live2, feed: true });
    const dirPF = path.join(ROOT, 'push-feed');
    seedAccounts(dirPF, [['pushfeed', 'pushfeed']]);
    const { eng: epf } = mkEngine('push-feed', { kinds: [kpf], now, dataDir: dirPF });
    await epf.pass('pushfeed', { force: true });
    await epf.syncPushLanes();
    const rpf = epf.adapterRecords().adapters.find((x) => x.id === 'pushfeed');
    rpf.feed = { ...(rpf.feed || {}), mode: 'carrying', lastOkAt: clock, samples: rpf.feed ? rpf.feed.samples : [] };
    await epf.setPush('pushfeed', { claimedExclusive: 'exclusive' });
    onState2({ state: 'live', at: clock, heard: true });
    const cEx = epf.cadenceOf('pushfeed', 'c0000');
    await epf.setPush('pushfeed', { claimedExclusive: 'shared' });
    onState2({ state: 'live', at: clock, heard: true });
    rpf.feed.lastOkAt = clock;
    const cSh = epf.cadenceOf('pushfeed', 'c0000');
    ok(cEx.source === 'push-safety' && cEx.seconds === 900 && cSh.source === 'feed-safety' && cSh.seconds === 300, 'push EXCLUSIVE + a carrying feed ⇒ the push safety net (push wins); push in KICK mode + a carrying feed ⇒ the feed\'s relaxed net', JSON.stringify([cEx, cSh]));
    epf.stop();
  }
  // dc-channels-blocks (2.369.214): the remedy is the adapter's DECLARED unavailableWords — what the engine's pushView carries while parked
  const declared = require(path.join(REPO, 'src/channels/lark.js')).unavailableWords;
  const words = caps.pushLaneText({ enabled: true, state: 'unavailable', lastStateCode: un && un.code, lastStateWhy: un && un.why, unavailableWords: declared }, { via: 'poll' });
  ok(/npm install @larksuiteoapi\/node-sdk/.test(words) && /restart/.test(words) && /polled/.test(words), 'the card\'s sentence is the exact remedy + "polled meanwhile"', words);
}

// ═══ ⑥ the agent's refresh ════════════════════════════════════════════════
console.log('⑥ the agent refresh: reach first, the floor, the budget');
{
  const A = { kind: 'agent', id: 'agent-A', name: 'Alpha', groups: [] };
  const hidden = await eng.agentRefresh(A, 'many', 'c0002');
  ok(hidden.ok === false && hidden.code === 'not-found', 'before any assignment the agent cannot even refresh (uniform not-found)');
  await eng.setScopeAssignment('many', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, mode: 'all', notify: 'wake' });
  await eng.refresh('many', 'c0002');
  const floor = await eng.agentRefresh(A, 'many', 'c0002');
  ok(floor.ok === false && floor.code === 'refresh-floor' && /floor 20 s/.test(floor.error) && floor.retryAfterSec > 0, 'right after a fetch the floor refuses BY NAME with the wait', JSON.stringify(floor));
  W.convs.get('c0002').recs.push({ vendorId: 'c0002-new', at: clock + 1000, author: { id: 'u-0', name: 'Ada' }, text: 'fresh news', attachments: [] });
  clock += 21e3;
  const good = await eng.agentRefresh(A, 'many', 'c0002');
  ok(good.ok && good.appended === 1, 'past the floor the refresh fetches and says how many arrived', JSON.stringify(good));
  SET['channels.agentRefreshFloorSec'] = 60;
  clock += 21e3;
  const floor60 = await eng.agentRefresh(A, 'many', 'c0002');
  ok(floor60.ok === false && /floor 60 s/.test(floor60.error), 'the floor is a SETTING, read live', floor60.error);
  delete SET['channels.agentRefreshFloorSec'];
}

// CONCURRENT REFRESHES EACH GET THEIR OWN FETCH (lane R2 verify, major): a
// refresh that found another refresh's pass in flight took THAT pass's result
// (single flight), found no answer for its own conversation and said
// `ok, 0 new` without a single vendor call — `vibespace-channels refresh`
// printed "refreshed: 0 new" on stale data for 18 of 20.
console.log('⑥b twenty concurrent agent refreshes: every "ok" is a real fetch of ITS conversation');
{
  const A = { kind: 'agent', id: 'agent-A', name: 'Alpha', groups: [] };
  const ids = Array.from({ length: 20 }, (_, i) => `c0${610 + i}`);   // none matches the pattern of ⑨ (i % 50 === 7)
  for (const id of ids) W.convs.get(id).recs.push({ vendorId: `${id}-burst`, at: clock + 100, author: { id: 'u-2', name: 'Cass' }, text: `burst news in ${id}`, attachments: [] });
  clock += 1000;
  const before = new Map(W.calls.history);
  const answers = await Promise.all(ids.map((id) => eng.agentRefresh(A, 'many', id)));
  const called = (id) => (W.calls.history.get(id) || 0) - (before.get(id) || 0);
  const liars = ids.filter((id, i) => answers[i].ok && !answers[i].pending && (called(id) !== 1 || answers[i].appended !== 1));
  ok(answers.every((a) => a.ok && !a.pending) && liars.length === 0, `each of 20 concurrent refreshes fetched ITS conversation once and counted its one new message (liars: ${liars.length})`, JSON.stringify(liars.slice(0, 4).map((id) => ({ id, calls: called(id), answer: answers[ids.indexOf(id)] }))));
  ok(ids.every((id) => (eng.readFor(A, 'many', id).records || []).some((r) => r.vendorId === `${id}-burst`)), '…and a read right after shows every one of them');
  await eng.settleWakes();
  // CONTROL: the shipped refresh (take whatever the single-flight pass answered) lies again
  const burst = async (ENGmod, label) => {
    const Wf = makeWorld(clock, { n: 20, hot: 0, warm: 0 });
    const dirF = path.join(ROOT, `burst-${label}`);
    seedAccounts(dirF, [['burst', 'burst']]);
    const regF = CH.createChannelRegistry(); regF.register(worldModule('burst', Wf));
    const ef = ENGmod.create({ dataDir: dirF, registry: regF, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
    await ingestAll(ef, 'burst');
    await ef.setScopeAssignment('burst', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, mode: 'all', notify: 'digest', digestMinutes: 30 });
    const fids = [...Wf.convs.keys()];
    for (const id of fids) Wf.convs.get(id).recs.push({ vendorId: `${id}-burst`, at: clock + 100, author: { id: 'u-2', name: 'Cass' }, text: 'burst', attachments: [] });
    clock += 30e3;
    const b0 = new Map(Wf.calls.history);
    const ans = await Promise.all(fids.map((id) => ef.agentRefresh(A, 'burst', id)));
    const lied = fids.filter((id, i) => ans[i].ok && !ans[i].pending && ((Wf.calls.history.get(id) || 0) - (b0.get(id) || 0) !== 1 || ans[i].appended !== 1)).length;
    await ef.settleWakes(); ef.stop();
    return { lied, allOk: ans.every((a) => a.ok && !a.pending) };
  };
  const good = await burst(ENG, 'real');
  ok(good.lied === 0 && good.allOk, `FIXTURE: the same burst on a fresh engine answers every refresh truthfully (${good.lied} liars)`);
  // CONTROL (re-pointed at the drain, r5; at the PURE drain's round, r9): a fetch that answers EVERY waiter of the account — r2's class, an answer from a fetch that was not of YOUR key — lies again
  const M6 = mutantCopies('chan-agg-refresh', REPO);
  const cw6 = closedWorld(M6, 'foreign-pass', { drain: [[DRAIN_LINES.round, '    waiters: ids(s.requests),']] });
  ok(cw6.setup, 'CONTROL setup: a drain whose fetch answers every waiter of the account (r2\'s foreign-pass answer) is reconstructed', cw6.missing);
  const bad = await burst(cw6.mod, 'ctl');
  ok(bad.lied >= 10, `CONTROL: that drain says "ok" without a fetch of its own conversation for ${bad.lied} of 20 — the legs above would go red`);
  for (const r of copiesCensus(M6.files, M6.dir, REPO, { minCopies: 1 })) ok(r.pass, r.name, r.detail);
}

// AN AGENT CANNOT SPEND THE ACCOUNT'S MINUTE (lane R2 verify, low): the floor
// is per conversation, so a loop over cold rows took the whole per-minute
// budget and the owner's hot rows got half their polls, the card naming the
// budget but not who spent it. Agent refreshes are now a SHARE of the minute
// (`channels.agentBudgetSharePct`, 25 %), refused by name; the view says who
// spent what.
console.log('⑥c agent refreshes are a share of the vendor budget; the owner\'s hot rows keep their cadence');
{
  const X = { kind: 'agent', id: 'agent-X', name: 'Xi', groups: [] };
  const scenario = async (label, { agent, sharePct = null }) => {
    const Ws = makeWorld(clock, { n: 300, hot: 20, warm: 0 });
    const ks = worldModule('share', Ws, { budgetDefault: 60, budgetSettingKey: 'channels.budgetShareTestPerMin' });
    const dirS = path.join(ROOT, `share-${label}`);
    seedAccounts(dirS, [['share', 'share']]);
    const SS = { 'channels.budgetShareTestPerMin': 100000 };
    if (sharePct !== null) SS['channels.agentBudgetSharePct'] = sharePct;
    const { eng: es } = mkEngine(`share-${label}`, { kinds: [ks], settings: SS, now, dataDir: dirS, sessions: [{ cid: 'agent-X', name: 'Xi', groups: [] }], registryOpts: ownKey('share', 'budgetShareTestPerMin', 60) });
    await ingestAll(es, 'share');
    await es.setScopeAssignment('share', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-X', name: 'Xi' }, mode: 'all', notify: 'digest', digestMinutes: 30 });
    SS['channels.budgetShareTestPerMin'] = 60;
    clock += 61e3;
    await es.pass('share');                          // the minute opens with the hot rows' own poll
    const hot = Array.from({ length: 20 }, (_, i) => `c${String(i).padStart(4, '0')}`);
    const hotCalls = () => hot.reduce((n, id) => n + (Ws.calls.history.get(id) || 0), 0);
    const h0 = hotCalls();
    const refusals = [];
    let next = 20, budgetAt30 = null;
    for (let tick = 1; tick <= 12; tick++) {
      clock += 5e3;
      if (agent) for (let k = 0; k < 10; k++) { const r = await es.agentRefresh(X, 'share', `c${String(next++).padStart(4, '0')}`); if (!r.ok) refusals.push(r); }
      await es.pass('share');
      if (tick === 6) budgetAt30 = es.budgetOf('share');
    }
    await es.settleWakes();
    es.stop();
    return { hot: hotCalls() - h0, refusals, budgetAt30 };
  };
  const base = await scenario('base', { agent: false });
  const shared = await scenario('shared', { agent: true });
  ok(base.hot === 40, `FIXTURE: with no agent the 20 hot rows get 40 timer polls in the minute (${base.hot})`);
  ok(shared.hot >= 0.75 * base.hot, `with an agent looping refreshes over cold rows the hot rows still get ${shared.hot} of ${base.hot} polls (≥ 75 %)`);
  const named = shared.refusals.find((r) => r.code === 'vendor-budget' && r.share);
  ok(named && /agents' refreshes and fetches/.test(named.error) && /25 %/.test(named.error) && named.share.pct === 25 && named.share.limit === 15, 'the refusal names the AGENT share (25 % = 15 of 60 requests a minute) and the wait', JSON.stringify(named || shared.refusals[0]));
  ok(shared.budgetAt30 && shared.budgetAt30.spentBy && shared.budgetAt30.spentBy.agent === 15 && shared.budgetAt30.spentBy.timer >= 20, 'the budget view says who spent this minute (agent 15, the timer the rest)', JSON.stringify(shared.budgetAt30 && shared.budgetAt30.spentBy));
  // CONTROL (a runtime neuter): the share at 100 % is the pre-fix engine — the agent takes the minute
  const open = await scenario('open', { agent: true, sharePct: 100 });
  ok(open.hot < 0.75 * base.hot, `CONTROL: with the share at 100 % the same loop starves the hot rows (${open.hot} of ${base.hot}) — the leg above would go red`);
  const bt = open.budgetAt30 ? caps.budgetText(open.budgetAt30) : '';
  ok(/by agent refreshes/.test(bt), 'CONTROL: …and the spent-budget sentence names the agents as the spender', bt);
}

// A VENDOR BACK-OFF IS HONOURED BY EVERY REFRESH BUT THE OWNER'S OWN PRESS
// (lane R2 verify r3, major): `pass({only})` skips `nextAt` so an explicit
// Refresh runs — and the agent's verb and a window's open came through the
// same door. 40 agent refreshes across 40 conversations during a 30 s 429
// back-off made 15 vendor calls in a second (only the share bounded them),
// every one refused again, and `consecutiveFailures` climbed 1 → 16: the
// account's back-off went to its 15-minute maximum and the OWNER's whole
// account stopped polling because an agent pressed refresh.
console.log('⑥d a vendor back-off: agent refreshes and window opens make NO call and say the wait; the owner\'s own press still runs');
async function backoffBurst(ENGmod, label) {
  const Wb = makeWorld(clock, { n: 40, hot: 40, warm: 0 });
  const kb = worldModule('bo', Wb);
  const dirB = path.join(ROOT, `backoff-${label}`);
  seedAccounts(dirB, [['bo', 'bo']]);
  const regB = CH.createChannelRegistry(); regB.register(kb);
  const eb = ENGmod.create({ dataDir: dirB, registry: regB, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
  await ingestAll(eb, 'bo');
  const X = { kind: 'agent', id: 'agent-A', name: 'Alpha', groups: [] };
  await eb.setScopeAssignment('bo', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, mode: 'all', notify: 'digest', digestMinutes: 30 });
  clock += 30e3;
  Wb.failNext = 'transport'; Wb.failSticky = true;   // lane R5: the failure ladder (a RATE refusal is its own short ladder that never counts — ③d)
  const p1 = await eb.pass('bo', { force: true });
  const recOf = () => eb.adapterRecords().adapters.find((r) => r.id === 'bo');
  const v1 = eb.adapterView(recOf());
  const fixture = p1.ok === false && p1.why === 'transport' && v1.consecutiveFailures === 1 && Number(v1.backoffUntil) === clock + ENG.BACKOFF_MS[1];
  const before = historyCalls(Wb);
  const answers = [];
  for (let i = 0; i < 40; i++) answers.push(await eb.agentRefresh(X, 'bo', `c${String(i).padStart(4, '0')}`));
  const agentCalls = historyCalls(Wb) - before;
  const v2 = eb.adapterView(recOf());
  const w = await eb.watch('bo', 'c0001');
  const watchCalls = historyCalls(Wb) - before - agentCalls;
  await eb.settleWakes();
  const owner = await eb.refresh('bo', 'c0002');
  const ownerCalls = historyCalls(Wb) - before - agentCalls - watchCalls;
  const v3 = eb.adapterView(recOf());
  // the back-off lifts: the vendor answers again, the agent's verb works
  Wb.failNext = null; Wb.failSticky = false;
  clock += ENG.BACKOFF_MS[2] + 1000;
  Wb.convs.get('c0003').recs.push({ vendorId: 'c0003-after', at: clock, author: { id: 'u-0', name: 'Ada' }, text: 'after the back-off', attachments: [] });
  const after = await eb.agentRefresh(X, 'bo', 'c0003');
  eb.stop();
  return { fixture, answers, agentCalls, failuresAfterAgents: v2.consecutiveFailures, backoffAfterAgents: v2.backoffUntil, watch: w, watchCalls, owner, ownerCalls, failuresAfterOwner: v3.consecutiveFailures, backoffAfterOwner: v3.backoffUntil, after };
}
{
  const r = await backoffBurst(ENG, 'real');
  ok(r.fixture, 'FIXTURE: one scripted 503 fails the pass with transport, consecutiveFailures 1, backoffUntil = +30 s');
  const codes = r.answers.reduce((m, a) => { m[a.code || 'ok'] = (m[a.code || 'ok'] || 0) + 1; return m; }, {});
  ok(r.agentCalls === 0 && codes.backoff === 40, `40 agent refreshes over 40 conversations inside the back-off make ZERO vendor calls (${r.agentCalls}) — every one answers code backoff (${JSON.stringify(codes)})`);
  const a0 = r.answers[0];
  ok(a0.retryAfterSec > 0 && a0.retryAfterSec <= 30 && Number(a0.backoffUntil) === r.backoffAfterAgents && /transport/.test(a0.error) && /retried in \d+ s/.test(a0.error), 'the refusal names the vendor\'s code, the wait and the retry instant', JSON.stringify(a0));
  ok(r.failuresAfterAgents === 1, `…and consecutiveFailures stays 1 (${r.failuresAfterAgents}) — the back-off is not escalated by the agent`);
  ok(r.watch.ok && r.watch.fetched === false && r.watchCalls === 0, `a window opened during the back-off is hot but pokes nothing (fetched:false, ${r.watchCalls} calls)`, JSON.stringify(r.watch));
  ok(r.ownerCalls === 1 && r.owner.ok === false && r.owner.code === 'transport' && r.failuresAfterOwner === 2, `the owner's OWN Refresh press still runs (human-gated: ${r.ownerCalls} call), fails by name and counts as one more failure (${r.failuresAfterOwner})`, JSON.stringify(r.owner));
  // r4: the failed press answers the wait it just escalated into (Retry-After rides readerAnswer; the toast words it) — a bare "failed" invited the next press
  ok(r.owner.retryAfterSec > 0 && r.owner.retryAfterSec <= ENG.BACKOFF_MS[2] / 1000 && Number(r.owner.backoffUntil) === Number(r.backoffAfterOwner), `…and its answer carries the retry instant of the back-off it escalated into (retry in ${r.owner.retryAfterSec} s)`, JSON.stringify({ owner: r.owner, backoffAfterOwner: r.backoffAfterOwner }));
  const words = fs.readFileSync(path.join(REPO, 'src/lib/channel-words.js'), 'utf-8');
  ok(/case 'rate-limited': case 'transport': case 'backoff': \{/.test(words) && /retrying in \{s\} s/.test(words), 'the owner\'s toast words a refused fetch with its code and the wait (channel-words: rate-limited / transport / backoff), never the bare English sentence');
  ok(r.after.ok && r.after.appended === 1, 'once the back-off has passed the agent\'s refresh fetches again', JSON.stringify(r.after));
  // the two route maps, the CLI and the panel/window contracts around the new code
  const rsrc = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf-8');
  const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-channels'), 'utf-8');
  ok(/code === 'refresh-floor' \|\| code === 'backoff' \? 429/.test(rsrc) && /code === 'vendor-budget' \|\| code === 'backoff' \? 429/.test(asrc), 'both route maps answer `backoff` as 429 (+ Retry-After from retryAfterSec)');
  ok(/const REFRESH_REFUSED = \[[^\]]*'backoff'[^\]]*\]/.test(cli) && /REFRESH_REFUSED\.includes\(j\.code\)\) return \{ refused: true/.test(cli), 'the CLI treats `backoff` as a refusal (exit 4, "not refreshed: … (retry in N s)"), never an error — through the ONE refused set test-channels-agent-cli\'s census keeps equal to the route\'s (r7)');
  const panel = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf-8');
  const win = fs.readFileSync(path.join(REPO, 'src/lib/channel-window.js'), 'utf-8');
  ok(/app\.ws\.onStateChange\?\.\(onState\)/.test(panel) && /app\.ws\.offStateChange\?\.\(onState\)/.test(panel) && /app\.ws\.onStateChange\?\.\(onState\)/.test(win) && /app\.ws\.offStateChange\?\.\(onState\)/.test(win), 'the panel and the window re-read on every ws reconnect (a broadcast sent while the socket was down never arrives) and remove that listener by name on teardown');
  // CONTROL: the shipped refresh (no back-off gate on the agent's verb or the loop) hammers the vendor and escalates the back-off
  const M6d = mutantCopies('chan-agg-backoff', REPO);
  // (re-pointed at the drain, r5; r9: the PURE drain's two back-off lines — the judgement gate AND the fetch-time owner check, both stripped: a new guard layer is removed from the old control too)
  const cw6d = closedWorld(M6d, 'ungated', { drain: [[DRAIN_LINES.backoffGate, ''], [DRAIN_LINES.backoffAtFetch, '']] });
  ok(cw6d.setup, 'CONTROL setup: the drain without its back-off gate (r3\'s open door) is reconstructed', cw6d.missing);
  const rc = await backoffBurst(cw6d.mod, 'ctl');
  ok(rc.agentCalls >= 10 && rc.failuresAfterAgents >= 11 && rc.backoffAfterAgents - clock > 0, `CONTROL: without the gate the same 40 refreshes call the vendor ${rc.agentCalls} times and escalate consecutiveFailures to ${rc.failuresAfterAgents} — the legs above would go red`);
  for (const r2 of copiesCensus(M6d.files, M6d.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}

// A PASS THAT FETCHED THIS CONVERSATION WHILE WE WAITED ANSWERS (lane R2
// verify r4, major): the r2 loop ran every caller's OWN pass after the wait
// and the per-conversation floor is asked BEFORE the wait — so 20 concurrent
// agent refreshes of ONE conversation made 20 vendor calls (the floor's
// "never a poll loop" defeated by parallelism), 3 refreshes queued behind a
// timer pass that had just fetched their conversation made 3 more, and 5
// windows opened on one stale conversation made 5. A pass with a result for
// OUR key is a real fetch of this conversation, completed after the call
// began (r2's liar was a pass with NO entry for it) — it answers.
console.log('⑥e concurrent refreshes of ONE conversation share ONE fetch: agents, a queued timer pass, windows');
async function sameConvBurst(ENGmod, label) {
  const Ws = makeWorld(clock, { n: 40, hot: 40, warm: 0 });
  const ks = worldModule('one', Ws);
  const dirS = path.join(ROOT, `sameconv-${label}`);
  seedAccounts(dirS, [['one', 'one']]);
  const regS = CH.createChannelRegistry(); regS.register(ks);
  const es = ENGmod.create({ dataDir: dirS, registry: regS, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
  await ingestAll(es, 'one');
  const X = { kind: 'agent', id: 'agent-A', name: 'Alpha', groups: [] };
  await es.setScopeAssignment('one', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, mode: 'all', notify: 'digest', digestMinutes: 30 });
  clock += 31e3;
  // (a) 20 concurrent AGENT refreshes of the same conversation, one new message waiting
  Ws.convs.get('c0001').recs.push({ vendorId: 'c0001-burst', at: clock, author: { id: 'u-0', name: 'Ada' }, text: 'burst', attachments: [] });
  const a0 = Ws.calls.history.get('c0001') || 0;
  const agents = await Promise.all(Array.from({ length: 20 }, () => es.agentRefresh(X, 'one', 'c0001')));
  const agentCalls = (Ws.calls.history.get('c0001') || 0) - a0;
  const spentByAgent = es.budgetOf('one').spentBy.agent;
  // (b) 5 windows opened at once on a stale conversation
  const w0 = Ws.calls.history.get('c0002') || 0;
  const watches = await Promise.all(Array.from({ length: 5 }, () => es.watch('one', 'c0002')));
  await sleep(20); await es.settleWakes();
  const watchCalls = (Ws.calls.history.get('c0002') || 0) - w0;
  // (c) 3 agent refreshes queued (same tick) behind a timer pass that fetches their conversation itself
  clock += 31e3;
  const q0 = Ws.calls.history.get('c0006') || 0;
  const timerPass = es.pass('one');
  const queued = await Promise.all([es.agentRefresh(X, 'one', 'c0006'), es.agentRefresh(X, 'one', 'c0006'), es.agentRefresh(X, 'one', 'c0006')]);
  await timerPass; await es.settleWakes();
  const queuedCalls = (Ws.calls.history.get('c0006') || 0) - q0;
  es.stop();
  return { agents, agentCalls, spentByAgent, watches, watchCalls, queued, queuedCalls };
}
{
  const r = await sameConvBurst(ENG, 'real');
  ok(r.agentCalls === 1 && r.agents.every((a) => a.ok && !a.pending && a.appended === 1), `20 concurrent agent refreshes of ONE conversation = ONE vendor call (${r.agentCalls}), every answer ok with the one new message`, JSON.stringify({ calls: r.agentCalls, sample: r.agents.slice(0, 2) }));
  ok(r.spentByAgent === 1, `…and the agent share is charged exactly once (${r.spentByAgent})`);
  ok(r.watchCalls === 1 && r.watches.every((w) => w.ok && w.fetched), `5 windows opened at once on a stale conversation = ONE vendor call (${r.watchCalls})`, JSON.stringify(r.watches[0]));
  ok(r.queuedCalls === 1 && r.queued.every((a) => a.ok && !a.pending), `3 agent refreshes queued behind a timer pass that fetched their conversation add NO call (${r.queuedCalls} on the key in all)`, JSON.stringify(r.queued));
  // CONTROL: a copy without the r4 rule (every caller runs its own pass after the wait) calls 20× for one conversation
  const M6e = mutantCopies('chan-agg-sameconv', REPO);
  // (re-pointed at the drain, r5; r9: the PURE drain's slot — one item per WAITER, so no rider rule and no one-fetch-per-key — r4's pass per caller)
  const cw6e = closedWorld(M6e, 'own-pass', { drain: [[DRAIN_LINES.slot, 'function slotOf(r) { return r.id; }']] });
  ok(cw6e.setup, 'CONTROL setup: a drain with one item per WAITER — no rider rule, no one fetch per key (r4\'s pass per caller) — is reconstructed', cw6e.missing);
  const rc = await sameConvBurst(cw6e.mod, 'ctl');
  ok(rc.agentCalls >= 10 && rc.watchCalls >= 2 && rc.queuedCalls >= 2, `CONTROL: without the rule the same bursts call the vendor ${rc.agentCalls} / ${rc.watchCalls} / ${rc.queuedCalls} times — the legs above would go red`);
  for (const r2 of copiesCensus(M6e.files, M6e.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}

// THE CONCURRENCY TABLE (lane R2 verify r5 — the structural closure). Three
// rounds each found ONE money defect at the SAME seam: the caller's
// `refresh()` deciding a vendor call against the account's single-flight
// pass (r2: a foreign pass's answer; r3: the back-off door; r4: a pass per
// waiter). N callers decided concurrently. Now a refresh is a REQUEST into
// the account's set and the pass loop is the ONE judge: every gate once per
// key at drain time, one fetch per key per pass, every waiter answered by the
// drain that judged its key. The whole class is pinned as ONE table —
// callers × keys × state × origin — against a scripted adapter that answers
// after ≥ 20 ms (a real vendor never answers in the same tick), judged on
// the vendor's own call log: an `ok` is a fetch of ITS key that ENDED after
// the call began, `appended` is the news, the agent share is charged exactly
// the agent-caused fetches, every refusal names itself and its wait, and no
// waiter is left in the set. Cells share one clock: every engine is built
// and ingested first, the clock moves once, the cells run a few at a time.
console.log('⑥f THE CONCURRENCY TABLE (r5): callers × keys × state × origin ⇒ the vendor calls, honest answers, the share, the refusal by name');
const TABLE_STATES = ['idle', 'timer-fetching-key', 'timer-not-fetching-key', 'backoff', 'budget', 'share', 'floor'];
const X6F = { kind: 'agent', id: 'agent-A', name: 'Alpha', groups: [] };
/** Phase 1 (at the shared clock): the engine, its world, its ingest. */
async function prep6f(ENGmod, cell, label) {
  const n = 45;
  const Wf = makeWorld(clock, { n, hot: cell.state === 'timer-not-fetching-key' ? 1 : n, warm: 0 });   // every row hot (due at +31 s) — or ONLY c0000 (the rest cold, not due)
  const kf = worldModule('tab', Wf, { budgetDefault: 1000, budgetSettingKey: 'channels.budgetTabTestPerMin' });
  const dirF = path.join(ROOT, `tab-${label}`);
  seedAccounts(dirF, [['tab', 'tab']]);
  const SF = { 'channels.budgetTabTestPerMin': 100000 };
  const regF = CH.createChannelRegistry(ownKey('tab', 'budgetTabTestPerMin', 1000)); regF.register(kf);
  const ef = ENGmod.create({ dataDir: dirF, registry: regF, env: {}, now, broadcast: () => {}, serverSetting: (k) => SF[k], liveSessions: () => SESS, deliver: null, log: quiet });
  await ingestAll(ef, 'tab');
  await ef.setScopeAssignment('tab', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, mode: 'all', notify: 'digest', digestMinutes: 30 });
  return { cell, Wf, SF, ef };
}
/** Phase 2 (the clock moved +31 s: every hot row stale and past the agent
 *  floor; the timer's queue is c0000, c0001, … — equal due time, by key). */
async function run6f({ cell, Wf, SF, ef }) {
  const { N, distinct, state, origin } = cell;
  const recOf = () => ef.adapterRecords().adapters.find((r) => r.id === 'tab');
  // the keys under test start at c0000 when a held timer pass is INSIDE its fetch (the r4 boundary), else at c0001
  const first = state === 'timer-fetching-key' ? 0 : 1;
  const keys = Array.from({ length: distinct ? N : 1 }, (_, i) => `c${String(first + i).padStart(4, '0')}`);
  const news = () => { for (const id of keys) if (!Wf.convs.get(id).recs.some((r) => r.vendorId === `${id}-news`)) Wf.convs.get(id).recs.push({ vendorId: `${id}-news`, at: clock, author: { id: 'u-0', name: 'Ada' }, text: 'news', attachments: [] }); };
  if (state !== 'floor') news();
  // ── the STATE ──
  let release = null, timerPass = null;
  if (state === 'backoff') { Wf.failNext = 'transport'; Wf.failSticky = true; await ef.pass('tab', { force: true }); }   // lane R5: the failure ladder (a rate refusal never counts — ③d)
  if (state === 'budget') SF['channels.budgetTabTestPerMin'] = 1;   // the minute already spent more than that
  if (state === 'share') { SF['channels.budgetTabTestPerMin'] = 200; SF['channels.agentBudgetSharePct'] = 5; for (let i = 30; i < 40; i++) await ef.agentRefresh(X6F, 'tab', `c00${i}`); }   // 5 % (the setting's minimum) of 200 = 10 units: ten agent fetches spend it (the minute's 46 so far are the timer's)
  if (state === 'floor') { await ef.pass('tab', { force: true }); news(); }   // every key fetched THIS instant; the news lands after
  const before = new Map(Wf.calls.history);
  const agent0 = ef.budgetOf('tab').spentBy.agent;
  Wf.delayMs = 20;
  if (state === 'timer-fetching-key' || state === 'timer-not-fetching-key') {
    let started; const entered = new Promise((r) => { started = r; });
    const hold = new Promise((r) => { release = r; });
    let once = false;
    Wf.beforeHistory = async (id) => { if (id === 'c0000' && !once) { once = true; started(); await hold; } };
    timerPass = ef.pass('tab');
    await entered;   // the timer pass is INSIDE history(c0000)
  }
  // ── the CALLERS, one tick ──
  const reqs = [];
  // r6 verify: `answeredAt` — the instant the caller's promise SETTLED (the judge reads the answer's own timing, not only the vendor log)
  const call = (id) => { const startedAt = Date.now(); const q = { id, startedAt, answeredAt: 0 }; q.p = (origin === 'agent' ? ef.agentRefresh(X6F, 'tab', id) : ef.refresh('tab', id)).then((a) => { q.answeredAt = Date.now(); return a; }); reqs.push(q); };
  for (let i = 0; i < N; i++) call(keys[distinct ? i : 0]);
  if (release) release();
  const answers = await Promise.all(reqs.map((r) => r.p));
  if (timerPass) await timerPass;
  await ef.settleWakes();
  // a SECOND round of presses inside the same back-off window: none is honoured
  let second = null;
  if (state === 'backoff' && origin === 'refresh') { const b2 = historyCalls(Wf); const a2 = await Promise.all(keys.map((id) => ef.refresh('tab', id))); second = { calls: historyCalls(Wf) - b2, codes: a2.map((a) => a.code) }; }
  await sleep(30);   // r6: a fetch the pass still owes (> delayMs) lands in the log BEFORE the judge reads it — an answer that came early is then caught by its instant, not by a fetch the harness's stop cut short
  const failures = recOf().consecutiveFailures;
  const agentCharged = ef.budgetOf('tab').spentBy.agent - agent0;
  const queue = ef.refreshQueueOf('tab');
  ef.stop();
  Wf.beforeHistory = null;
  const calls = (id) => (Wf.calls.history.get(id) || 0) - (before.get(id) || 0);
  return { cell, keys, reqs, answers, calls, log: Wf.log, second, failures, queue, agentCharged };
}
/** What the table EXPECTS of one key's answers in a state — calls on the
 *  key, and the answer every caller of it hears. */
function expect6f({ state, origin, key }) {
  const agent = origin === 'agent';
  const ok1 = { calls: 1, ok: true, appended: 1 };
  switch (state) {
    case 'idle': return ok1;
    case 'timer-not-fetching-key': return ok1;
    case 'timer-fetching-key': return key === 'c0000' ? (agent ? { calls: 1, code: 'refresh-floor' } : { calls: 2, ok: true, appended: 0 }) : ok1;   // the r4 boundary: filed mid-fetch ⇒ judged by the NEXT drain (the floor; the owner's second fetch) — every other key rides the timer's fetch
    case 'backoff': return agent ? { calls: 0, code: 'backoff' } : { calls: 'one-key', code: 'backoff', pressed: 'transport' };
    case 'budget': return { calls: 0, code: 'vendor-budget' };
    case 'share': return agent ? { calls: 0, code: 'vendor-budget', share: true } : ok1;
    case 'floor': return agent ? { calls: 0, code: 'refresh-floor' } : ok1;
    default: throw new Error('no such state ' + state);
  }
}
/** The share is charged exactly the AGENT-caused fetches: a key the agent's
 *  request fetched (idle / not-fetching), never a rider, a refusal or the owner. */
function agentFetches6f({ state, origin, keys }) { return origin === 'agent' && (state === 'idle' || state === 'timer-not-fetching-key') ? keys.length : 0; }
function judge6f(r) {
  const cell = r.cell;
  const problems = [];
  const byKey = new Map(); for (const k of r.keys) byKey.set(k, []);
  r.reqs.forEach((q, i) => byKey.get(q.id).push({ ...q, a: r.answers[i] }));
  let oneKeyCalls = 0;
  for (const key of r.keys) {
    const ex = expect6f({ ...cell, key });
    const c = r.calls(key);
    if (ex.calls === 'one-key') { oneKeyCalls += c; if (c > 1) problems.push(`${key}: ${c} calls (the owner's press is honoured once)`); }
    else if (c !== ex.calls) problems.push(`${key}: ${c} calls, expected ${ex.calls}`);
    for (const q of byKey.get(key)) {
      const a = q.a || {};
      if (ex.calls === 'one-key') {
        if (c === 1) { if (a.ok || a.code !== ex.pressed || !(a.retryAfterSec > 0) || !a.backoffUntil) problems.push(`${key}: the honoured press hears ${JSON.stringify(a)}`); }
        else if (a.ok || a.code !== 'backoff' || !(a.retryAfterSec > 0)) problems.push(`${key}: a refused press hears ${JSON.stringify(a)}`);
        continue;
      }
      if (ex.ok) {
        if (!a.ok || a.pending) { problems.push(`${key}: expected ok, got ${JSON.stringify(a)}`); continue; }
        if ((a.appended || 0) !== ex.appended) problems.push(`${key}: appended ${a.appended}, expected ${ex.appended}`);
        // HONEST: a fetch of ITS key that ENDED after this call began AND before its answer landed (r6 verify: the vendor log alone let an `ok` resolved BEFORE its fetch ended pass — the fetch still happened, later)
        if (!r.log.some((l) => l.id === key && !l.failed && l.endedAt >= q.startedAt)) problems.push(`${key}: ok without a fetch of it that ended after the call began`);
        else if (!r.log.some((l) => l.id === key && !l.failed && l.endedAt >= q.startedAt && l.endedAt <= q.answeredAt)) problems.push(`${key}: ok delivered at +${q.answeredAt - q.startedAt} ms, before any fetch of it had ended`);
      } else {
        if (a.ok || a.code !== ex.code) problems.push(`${key}: expected ${ex.code}, got ${JSON.stringify(a)}`);
        else if (!(a.retryAfterSec > 0)) problems.push(`${key}: the ${ex.code} refusal carries no wait`);
        else if (ex.share && !(a.share && a.share.pct === 5 && a.share.limit === 10)) problems.push(`${key}: the share refusal does not name the share`);
        else if (ex.code === 'refresh-floor' && !/floor 20 s/.test(a.error)) problems.push(`${key}: the floor refusal does not name the floor`);
      }
    }
  }
  if (r.keys.length && expect6f({ ...cell, key: r.keys[0] }).calls === 'one-key' && oneKeyCalls !== 1) problems.push(`${oneKeyCalls} calls across ${r.keys.length} keys — the owner's press is honoured exactly once per window`);
  if (r.second && (r.second.calls !== 0 || !r.second.codes.every((c) => c === 'backoff'))) problems.push(`a second round of presses in the same window: ${r.second.calls} calls, codes ${JSON.stringify(r.second.codes)}`);
  if (cell.state === 'backoff' && r.failures !== (cell.origin === 'refresh' ? 2 : 1)) problems.push(`consecutiveFailures ${r.failures} (expected ${cell.origin === 'refresh' ? 2 : 1})`);
  const want = agentFetches6f({ ...cell, keys: r.keys });
  if (r.agentCharged !== want) problems.push(`the agent share was charged ${r.agentCharged}, expected ${want}`);
  if (r.queue.waiters !== 0) problems.push(`${r.queue.waiters} waiter(s) left in the set`);
  return problems;
}
/** The whole table on one engine module: prep every cell at the shared
 *  clock, move it once, run the cells a few at a time. */
async function table6f(ENGmod, tag, cells) {
  const preps = [];
  for (let i = 0; i < cells.length; i++) preps.push(await prep6f(ENGmod, cells[i], `${tag}-${i + 1}`));
  clock += 31e3;
  const out = new Array(preps.length);
  let next = 0;
  const lane = async () => { for (;;) { const i = next++; if (i >= preps.length) return; out[i] = await run6f(preps[i]); } };
  await Promise.all(Array.from({ length: 6 }, lane));
  return out;
}
{
  const cells = [];
  for (const state of TABLE_STATES) for (const origin of ['agent', 'refresh']) for (const N of [1, 5, 20]) for (const distinct of (N === 1 ? [false] : [false, true])) cells.push({ N, distinct, state, origin });
  const t6f = Date.now();
  const results = await table6f(ENG, 'real', cells);
  let red = 0;
  for (const r of results) {
    const problems = judge6f(r);
    if (problems.length) red++;
    const cell = r.cell;
    ok(problems.length === 0, `${cell.state} · ${cell.origin} · ${cell.N} caller(s) on ${cell.distinct ? cell.N + ' keys' : '1 key'}: ${cell.distinct ? 'per key ' : ''}${JSON.stringify(expect6f({ ...cell, key: r.keys[r.keys.length - 1] }))}${r.keys.length > 1 && cell.state === 'timer-fetching-key' ? ' (c0000 mid-fetch: the floor / a second fetch)' : ''}`, problems.slice(0, 3).join('; '));
  }
  ok(cells.length === 70 && red === 0, `the table holds: ${cells.length} cells (7 states × 2 origins × {1, 5×2, 20×2} callers), ${red} red, ${Date.now() - t6f} ms`);
  // CONTROL: the owner-once rule neutered (every press inside a window is honoured) — N presses on N keys in a back-off are N vendor calls
  const M6f = mutantCopies('chan-agg-table', REPO);
  // (r9: the owner-once rule is the PURE drain's press line — every owner group pressed, every window)
  const cwEvery = closedWorld(M6f, 'every-press', { drain: [[DRAIN_LINES.pressFree, '  const pressFree = p.backoff;'], [DRAIN_LINES.pressOne, '    const v = verdict(s, g, pressFree);']] });
  ok(cwEvery.setup, 'CONTROL setup: a drain honouring EVERY owner press inside a back-off window is reconstructed', cwEvery.missing);
  const ctl = await table6f(cwEvery.mod, 'ctl', [{ N: 5, distinct: true, state: 'backoff', origin: 'refresh' }]);
  const cp = judge6f(ctl[0]);
  const ctlCalls = ctl[0].keys.reduce((a, k) => a + ctl[0].calls(k), 0);
  ok(ctlCalls >= 2 && ctl[0].failures >= 3 && cp.length > 0, `CONTROL: without the once-per-window rule the same presses inside a 30 s back-off make ${ctlCalls} vendor calls (a second round is honoured again) and climb consecutiveFailures to ${ctl[0].failures} — the cell above would go red`);
  // CONTROL (r6 verify): the EARLY ANSWER — a drain that resolves a request `ok` at judgement, before the fetch it then makes — is caught by the answer's own instant; the vendor log alone (a fetch of its key ended after the call began) let it through
  // (r9: the ENGINE seam — the waiter's promise resolved `ok` at the step that ACCEPTS it, the request left in the drain so its fetch is still made after: r6's shape)
  const STEP_LINE = '          e.dq = Drain.apply(e.dq, act);   // the step is taken (an async action BEGINS)\n';
  const RESOLVE_LINE = '      w.resolve = (outcome) => {\n';
  const cwEarly = closedWorld(M6f, 'early-answer', { engine: [[RESOLVE_LINE, '      w.raw = resolve;\n' + RESOLVE_LINE], [STEP_LINE, STEP_LINE + '          for (const id of act.accept || []) { const w = e.waiters.get(id); if (w && w.raw) w.raw({ ok: true, appended: 1, polledAt: null }); }\n']] });
  ok(cwEarly.setup, 'CONTROL setup: a drain answering `ok` at judgement (the fetch still made after) is reconstructed', cwEarly.missing);
  const ctlE = await table6f(cwEarly.mod, 'ctl-early', [{ N: 1, distinct: false, state: 'idle', origin: 'refresh' }, { N: 5, distinct: true, state: 'floor', origin: 'refresh' }, { N: 1, distinct: false, state: 'timer-not-fetching-key', origin: 'agent' }]);
  const ctlEp = ctlE.map((r) => judge6f(r));
  const logOnly = ctlE.map((r) => ctlEp[ctlE.indexOf(r)].filter((p) => !/delivered at \+/.test(p)).length);
  ok(ctlEp.every((p) => p.some((x) => /delivered at \+\d+ ms, before any fetch/.test(x))) && logOnly.some((n) => n === 0), `CONTROL: the early answer is caught in ${ctlEp.length}/${ctlEp.length} cells by the answer's instant — and in ${logOnly.filter((n) => n === 0).length} of them by NOTHING ELSE (the vendor-log clause alone was green there)`, JSON.stringify(ctlEp.map((p) => p.slice(0, 2))));
  // CONTROL (B4, r7): the RIGHT fetch answered at its START — the waiter resolved with its key's fetch in flight, the fetch ending after — is a lie about time the clause catches (the vendor-log clause sees a fetch of its key that ended after the call began)
  // (r9: the ENGINE seam — the driver's delivery at the START of the right fetch)
  const INGEST_LINE = '        let got;\n        try { got = await ingest(e, rec, idOf(key), origin); }\n';
  const cwStart = closedWorld(M6f, 'at-start', { engine: [[INGEST_LINE, '        deliver(act.waiters, { ok: true, appended: 1, polledAt: lastPollOf(key) });\n' + INGEST_LINE]] });
  ok(cwStart.setup, 'CONTROL setup: a loop answering ok at the START of the right fetch is reconstructed', cwStart.missing);
  const ctlS = await table6f(cwStart.mod, 'ctl-start', [{ N: 1, distinct: false, state: 'idle', origin: 'refresh' }, { N: 5, distinct: true, state: 'timer-not-fetching-key', origin: 'agent' }, { N: 20, distinct: true, state: 'idle', origin: 'agent' }]);
  const ctlSp = ctlS.map((r) => judge6f(r));
  const onlyTime = ctlSp.filter((p) => p.length && p.every((x) => /delivered at \+\d+ ms, before any fetch/.test(x))).length;
  ok(ctlSp.every((p) => p.some((x) => /delivered at \+\d+ ms, before any fetch/.test(x))), `CONTROL: the ok at the right fetch's START is caught in ${ctlSp.length}/${ctlSp.length} cells by the answer's instant — in ${onlyTime} of them by NOTHING ELSE (the fetch of its key did end after the call began)`, JSON.stringify(ctlSp.map((p) => p.slice(0, 2))));
  for (const r2 of copiesCensus(M6f.files, M6f.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}

// THE SHAPE UNDER ATTACK (r5 verify — the closing round on the request set):
// (1) STARVATION OF THE TIMER by a storm of requests — a request pass keeps
//     `e.passing` set through every tick, so the due list never ran; now a
//     tick that finds the account busy while due hands the timer's turn to the
//     pass in flight (`e.timerDue`), and the storm's own passes do it;
// (2) THE REVERSE — a request filed behind a long timer pass waited for the
//     whole pass and, at 30 s, left as `pending` with no fetch ever made; now
//     the loop drains the set at EVERY fetch boundary (one fetch at most);
// (3) THE CAP — past 200 waiters an account refuses `refresh-queue-full`
//     by name, and the set is empty once the drain answered;
// (4) STOP with requests pending: every waiter hears `stopped`;
// (5) an account REMOVED while a request waits (behind a held fetch): the
//     waiter hears `account-changed`, the held fetch's own waiter still ok.
console.log('⑥g the request set under attack: a storm cannot starve the timer, a long pass cannot starve a request, the cap, stop, remove');
{
  const mk = async (label, { n = 45, hot = n } = {}) => {
    const Wg = makeWorld(clock, { n, hot, warm: 0 });
    const kg = worldModule('atk', Wg, { budgetDefault: 100000 });
    const dirG = path.join(ROOT, `atk-${label}`);
    seedAccounts(dirG, [['atk', 'atk']]);
    const regG = CH.createChannelRegistry(); regG.register(kg);
    const eg = ENG.create({ dataDir: dirG, registry: regG, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
    await ingestAll(eg, 'atk');
    return { Wg, eg };
  };
  // (1) the storm: owner refreshes re-filed the instant each answers, on ten rotating keys, for ~600 ms; the tick every 100 ms
  {
    const { Wg, eg } = await mk('storm');
    clock += 31e3;
    Wg.delayMs = 20;
    let stop = false, filed = 0;
    const storm = async (k) => { while (!stop) { await eg.refresh('atk', `c000${k}`); filed++; } };
    const lanes = Array.from({ length: 10 }, (_, k) => storm(k));
    const before = new Map(Wg.calls.history);
    let ticks = 0;
    const tick = setInterval(() => { eg.tick(); ticks++; }, 100);
    const dueRows = Array.from({ length: 35 }, (_, i) => `c00${10 + i}`);   // never in the storm's rotation: only the timer's work fetches them
    const fetchedByTimer = () => dueRows.filter((id) => (Wg.calls.history.get(id) || 0) > (before.get(id) || 0)).length;
    await sleep(2500);
    const during = fetchedByTimer();   // r7: read while the storm is still on — the interleave serves the due rows INSIDE the storm, not after it
    stop = true; clearInterval(tick);
    await Promise.all(lanes); await eg.idle('atk'); await eg.settleWakes();   // r7: an ok lands at its fetch, so the lanes are answered before the pass ends — wait for the account to go idle before counting
    const total = fetchedByTimer();
    const timerSpent = eg.budgetOf('atk').spentBy.timer;
    eg.stop();
    ok(filed >= 20 && ticks >= 4 && total === 35, `a storm of ${filed} refreshes kept the account busy through ${ticks} ticks, and the timer's ${total}/35 due rows were still fetched (charged to the timer: ${timerSpent})`, JSON.stringify({ filed, ticks, total }));
    ok(during === 35, `…and every one of them DURING the 2.5 s storm (${during}/35 — r7's interleave: one requested key, one due row; r6 served them only once the storm paused, the no-interleave copy below never)`, JSON.stringify({ during, filed }));
  }
  // (2) the reverse: a 45-row timer pass (20 ms each = 900 ms); a request for a NOT-due row filed once the pass is inside its first fetch
  {
    const { Wg, eg } = await mk('long', { n: 45, hot: 40 });   // c0040..c0044 cold: not due
    clock += 31e3;
    Wg.delayMs = 20;
    let started; const entered = new Promise((r) => { started = r; });
    let once = false;
    Wg.beforeHistory = async (id) => { if (id === 'c0000' && !once) { once = true; started(); } };
    const logAt = Wg.log.length;   // this pass's calls start here
    const timerPass = eg.pass('atk');
    await entered;
    Wg.convs.get('c0040').recs.push({ vendorId: 'c0040-news', at: clock, author: { id: 'u-0', name: 'Ada' }, text: 'news', attachments: [] });
    const late = eg.refresh('atk', 'c0039');   // a DUE row, last in the timer's queue: promoted to the next boundary, one fetch
    const r = await eg.refresh('atk', 'c0040');
    const rl = await late;
    await timerPass; await eg.settleWakes();
    const calls = Wg.log.slice(logAt).map((l) => l.id);
    const pos = calls.indexOf('c0040'), posLate = calls.indexOf('c0039');
    eg.stop();
    // the FETCH is at the next boundary (positions 1 and 2: right after the row the pass was inside); a REFUSAL lands when it is judged (r6, leg (7)) and an `ok` at ITS fetch (r7, leg (8)) — never at the pass's end
    ok(r.ok && !r.pending && r.appended === 1 && rl.ok && !rl.pending && pos >= 1 && pos <= 2 && posLate >= 1 && posLate <= 2 && calls.length === 41 && calls.filter((k) => k === 'c0039').length === 1, `requests filed behind a 40-row timer pass are fetched at the NEXT boundary — a not-due row at position ${pos}, the last DUE row promoted to position ${posLate} (one fetch, not two) of the pass's ${calls.length} calls — never after the whole pass`, JSON.stringify({ r, rl, pos, posLate, head: calls.slice(0, 4) }));
  }
  // (3) the cap
  {
    const { Wg, eg } = await mk('cap', { n: 5 });
    clock += 31e3;
    Wg.delayMs = 20;
    const a0 = Wg.calls.history.get('c0001') || 0;
    const answers = await Promise.all(Array.from({ length: 260 }, () => eg.refresh('atk', 'c0001')));
    const okN = answers.filter((a) => a.ok && !a.pending && a.appended === 0).length;
    const full = answers.filter((a) => a.code === 'refresh-queue-full');
    const q = eg.refreshQueueOf('atk');
    eg.stop();
    ok(okN === ENG.REFRESH_QUEUE_CAP && full.length === 60 && full.every((a) => a.retryAfterSec === 1 && a.queued === 200 && /already waiting/.test(a.error)) && (Wg.calls.history.get('c0001') || 0) - a0 === 1 && q.waiters === 0, `260 refreshes of one conversation at once: ${okN} accepted and answered by ONE fetch, ${full.length} refused refresh-queue-full by name with the wait; the set is empty after`, JSON.stringify({ okN, full: full.length, sample: full[0], calls: (Wg.calls.history.get('c0001') || 0) - a0, q }));
  }
  // (3b) THE OWNER'S RESERVE (r6 verify, major): one agent's storm fills the set only to CAP − RESERVE — the owner's press and a window's open filed on top are still accepted (and answered by the fetch), the agent past its cap is refused by name
  {
    const { Wg, eg } = await mk('reserve', { n: 10 });
    await eg.setScopeAssignment('atk', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, mode: 'all', notify: 'digest', digestMinutes: 30 });
    clock += 31e3;
    Wg.delayMs = 20;
    let release; const hold = new Promise((r) => { release = r; });
    let started; const entered = new Promise((r) => { started = r; }); let once = false;
    Wg.beforeHistory = async (id) => { if (id === 'c0001' && !once) { once = true; started(); await hold; } };
    const held = eg.refresh('atk', 'c0001');
    await entered;                                        // the set cannot drain: the pass is inside a fetch
    const agents = Array.from({ length: ENG.REFRESH_QUEUE_CAP }, (_, i) => eg.agentRefresh(X6F, 'atk', `c000${2 + (i % 5)}`));
    await sleep(5);
    const q1 = eg.refreshQueueOf('atk');
    const ownerP = eg.refresh('atk', 'c0008');           // the OWNER's press on top of the agent's storm
    const openP = eg.refresh('atk', 'c0009', { origin: 'open' });   // a window's open
    await sleep(5);
    const q2 = eg.refreshQueueOf('atk');
    release();
    const [h, owner, open, ...ra] = await Promise.all([held, ownerP, openP, ...agents]);
    eg.stop();
    const agentCap = ENG.REFRESH_QUEUE_CAP - ENG.REFRESH_OWNER_RESERVE;
    const refused = ra.filter((a) => a.code === 'refresh-queue-full');
    ok(q1.waiters === agentCap && q1.agents === agentCap && refused.length === ENG.REFRESH_OWNER_RESERVE && refused.every((a) => a.cap === agentCap && a.queued === agentCap && a.retryAfterSec === 1) && ra.filter((a) => a.ok && !a.pending).length === agentCap, `one agent's ${ENG.REFRESH_QUEUE_CAP} refreshes fill the set to ${q1.waiters} (its cap ${agentCap}): ${refused.length} refused refresh-queue-full naming the cap, ${ra.filter((a) => a.ok).length} answered`, JSON.stringify({ q1, refused: refused[0] }));
    ok(h.ok && owner.ok && !owner.pending && open.ok && !open.pending && q2.waiters === agentCap + 2, `the OWNER's press and a window's open filed on top of the full agent set are ACCEPTED (${q2.waiters} waiting) and answered by their fetch — never refused by an agent's storm`, JSON.stringify({ owner, open, q2 }));
  }
  // (4) stop with requests pending — every waiter hears `stopped`, typed, at once: the ones in the set, one filed after, AND the one a pass in flight holds (a hung adapter never answers it)
  {
    const { Wg, eg } = await mk('stop', { n: 5 });
    clock += 31e3;
    let started; const entered = new Promise((r) => { started = r; }); let once = false;
    Wg.beforeHistory = async (id) => { if (id === 'c0001' && !once) { once = true; started(); await new Promise(() => {}); } };   // never answers
    const held = eg.refresh('atk', 'c0001');
    await entered;
    const ps = [eg.refresh('atk', 'c0002'), eg.refresh('atk', 'c0003')];
    const t0 = Date.now();
    eg.stop();
    const late = await eg.refresh('atk', 'c0004');
    const rs = await Promise.all([held, ...ps]);
    ok(rs.every((r) => r.ok === false && r.code === 'stopped' && /restart/.test(r.error)) && late.code === 'stopped' && Date.now() - t0 < 1000, 'at stop() the waiter a HUNG fetch holds, the two in the set and one filed after all hear `stopped` at once (never a hung promise, never the 30 s bound)', JSON.stringify([...rs, late]));
  }
  // (5) an account removed while a request waits behind a held fetch
  {
    const { Wg, eg } = await mk('rm', { n: 5 });
    clock += 31e3;
    let release; const hold = new Promise((r) => { release = r; });
    let started; const entered = new Promise((r) => { started = r; });
    let once = false;
    Wg.beforeHistory = async (id) => { if (id === 'c0001' && !once) { once = true; started(); await hold; } };
    const first = eg.refresh('atk', 'c0001');
    await entered;                                        // the drain is inside history(c0001)
    const second = eg.refresh('atk', 'c0002');            // waits in the set (drainAfter)
    const removed = await eg.remove('atk');
    release();
    const [r1, r2] = await Promise.all([first, second]);
    const q = eg.refreshQueueOf('atk');
    eg.stop();
    // the held fetch's own waiter hears it too: its account is gone, an `ok` for a removed account would be a lie
    ok(removed.ok && r2.ok === false && r2.code === 'account-changed' && /removed/.test(r2.error) && r1.ok === false && r1.code === 'account-changed' && q.waiters === 0, 'an account removed while a request waited: the waiter in the set AND the one the held fetch holds hear `account-changed` (removed) by name, nothing is left', JSON.stringify({ removed, r1, r2, q }));
  }
  // (6) THE BUDGET CUT MID-PASS (r6 verify — ⑥f's `budget` state trips the TOP gate, so two of the loop's budget lines never ran under it): fifteen owner requests behind a held first fetch on a 10/min budget — nine fetched, the rest refused vendor-budget BY NAME by the cut sweep (never `0 new`); three more filed while the 10th fetch (the minute's last) is held — refused by the drain's own budget line, no call
  const budgetCut = async (ENGx, label) => {
    const Wb = makeWorld(clock, { n: 40, hot: 20, warm: 0 });
    const kb = worldModule('atk', Wb, { budgetDefault: 100000, budgetSettingKey: 'channels.budgetCutTestPerMin' });
    const dirB = path.join(ROOT, `atk-cut-${label}`);
    seedAccounts(dirB, [['atk', 'atk']]);
    const SB = { 'channels.budgetCutTestPerMin': 100000 };
    const regB = CH.createChannelRegistry(ownKey('atk', 'budgetCutTestPerMin', 100000)); regB.register(kb);
    const eb = ENGx.create({ dataDir: dirB, registry: regB, env: {}, now, broadcast: () => {}, serverSetting: (k) => SB[k], liveSessions: () => SESS, deliver: null, log: quiet });
    await ingestAll(eb, 'atk');
    const b0 = [...Wb.calls.history.values()].reduce((x, v) => x + v, 0);   // the ingest's own calls
    clock += 61e3;                                       // a new minute
    SB['channels.budgetCutTestPerMin'] = 10;
    Wb.delayMs = 5;
    let n = 0, rel1 = null, rel10 = null, st1 = null, st10 = null;
    const in1 = new Promise((r) => { st1 = r; }), in10 = new Promise((r) => { st10 = r; });
    const h1 = new Promise((r) => { rel1 = r; }), h10 = new Promise((r) => { rel10 = r; });
    Wb.beforeHistory = async () => { n++; if (n === 1) { st1(); await h1; } if (n === 10) { st10(); await h10; } };
    const keys = Array.from({ length: 15 }, (_, i) => `c00${20 + i}`);   // cold: not due, the requests are the pass's whole queue
    const first = eb.refresh('atk', keys[0]);
    await in1;
    const rest = keys.slice(1).map((k) => eb.refresh('atk', k));
    rel1();
    await in10;                                          // inside the 10th fetch: the minute is spent
    const late = ['c0035', 'c0036', 'c0037'].map((k) => eb.refresh('atk', k));
    rel10();
    const a = await Promise.all([first, ...rest]);
    const l = await Promise.all(late);
    await eb.settleWakes();
    const calls = [...Wb.calls.history.values()].reduce((x, v) => x + v, 0) - b0;   // this minute's calls
    const q = eb.refreshQueueOf('atk');
    eb.stop();
    return { a, l, calls, q };
  };
  {
    const { a, l, calls, q } = await budgetCut(ENG, 'real');
    const okN = a.filter((x) => x.ok && !x.pending).length, cut = a.filter((x) => x.code === 'vendor-budget');
    ok(calls === 10 && okN === 10 && cut.length === 5 && cut.every((x) => x.retryAfterSec > 0 && /is spent/.test(x.error)), `fifteen requests on a 10/min budget: exactly 10 calls, 10 ok, 5 refused vendor-budget by the cut sweep with the wait (${calls} calls, ${okN} ok, ${cut.length} refused)`, JSON.stringify({ calls, codes: a.map((x) => x.code || 'ok') }));
    ok(l.every((x) => x.code === 'vendor-budget' && x.retryAfterSec > 0) && q.waiters === 0, `three requests filed once the minute was spent, mid-pass: refused by the drain's own budget line, no call (${l.map((x) => x.code).join(', ')})`, JSON.stringify(l));
  }
  // (7) A REFUSAL IS HEARD WHEN IT IS JUDGED (r6 verify, major): behind a 45-row timer pass (60 ms a fetch ≈ 2.7 s) an agent's floor-refused request is answered at the FIRST boundary — within one fetch — never at the pass's end (where the agent's 15 s race had turned it into `pending`: "refresh started — still running" for a request that was refused and never fetched)
  const lateRefusal = async (ENGx, label) => {
    const Wl = makeWorld(clock, { n: 50, hot: 45, warm: 0 });
    const kl = worldModule('atk', Wl, { budgetDefault: 100000 });
    const dirL = path.join(ROOT, `atk-late-${label}`);
    seedAccounts(dirL, [['atk', 'atk']]);
    const SL = { 'channels.agentRefreshFloorSec': 900 };
    const regL = CH.createChannelRegistry(); regL.register(kl);
    const el = ENGx.create({ dataDir: dirL, registry: regL, env: {}, now, broadcast: () => {}, serverSetting: (k) => SL[k], liveSessions: () => SESS, deliver: null, log: quiet });
    await ingestAll(el, 'atk');
    await el.setScopeAssignment('atk', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, mode: 'all', notify: 'digest', digestMinutes: 30 });
    clock += 31e3;                                       // the 45 hot rows due; c0045.. polled 31 s ago, inside the 900 s floor
    Wl.delayMs = 60;
    let started; const entered = new Promise((r) => { started = r; }); let once = false;
    Wl.beforeHistory = async (id) => { if (id === 'c0000' && !once) { once = true; started(); } };
    const t0 = Date.now();
    const timerPass = el.pass('atk');
    await entered;
    const tA = Date.now();
    const a = await el.agentRefresh(X6F, 'atk', 'c0047');
    const heardMs = Date.now() - tA;
    await timerPass;
    const passMs = Date.now() - t0;
    el.stop();
    return { a, heardMs, passMs, calls47: Wl.calls.history.get('c0047') || 0 };
  };
  {
    const { a, heardMs, passMs, calls47 } = await lateRefusal(ENG, 'real');
    ok(a.code === 'refresh-floor' && !a.pending && heardMs < 1000 && passMs >= 2000 && calls47 === 1, `an agent's floor-refused request behind a ${passMs} ms timer pass is heard at the first boundary — refresh-floor after ${heardMs} ms, no call of its key (${calls47 - 1} extra)`, JSON.stringify({ a: { ok: a.ok, pending: a.pending, code: a.code }, heardMs, passMs }));
  }
  // (8) AN `ok` IS HEARD AT ITS FETCH (r7 verify — r6 held it for the pass's end on purpose, so a TRUE answer behind a long timer pass was heard as `pending` at 15 / 30 s): the owner's request for a NOT-due key filed inside the first fetch of a 45-row timer pass (40 ms a fetch ≈ 1.8 s) is fetched at the next boundary and answered THERE — within the in-flight fetch + its own — with its one new message, while the pass runs on for its due rows
  const lateOk = async (ENGx, label, events = null) => {
    const Wl = makeWorld(clock, { n: 50, hot: 45, warm: 0 });
    const kl = worldModule('atk', Wl, { budgetDefault: 100000 });
    const dirL = path.join(ROOT, `atk-lateok-${label}`);
    seedAccounts(dirL, [['atk', 'atk']]);
    const regL = CH.createChannelRegistry(); regL.register(kl);
    const el = ENGx.create({ dataDir: dirL, registry: regL, env: {}, now, broadcast: events ? (m) => events.push({ at: Date.now(), m }) : () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
    await ingestAll(el, 'atk');
    if (events) events.length = 0;                       // the ingest's own broadcasts are not this leg's
    clock += 31e3;                                       // the 45 hot rows due; c0045.. cold, not due
    Wl.delayMs = 40;
    let started; const entered = new Promise((r) => { started = r; }); let once = false;
    Wl.beforeHistory = async (id) => { if (id === 'c0000' && !once) { once = true; started(); } };
    Wl.convs.get('c0047').recs.push({ vendorId: 'c0047-news', at: clock, author: { id: 'u-0', name: 'Ada' }, text: 'news', attachments: [] });
    const logAt = Wl.log.length;   // this pass's calls start here (the ingest's are before)
    const t0 = Date.now();
    const timerPass = el.pass('atk');
    await entered;
    const tA = Date.now();
    const a = await el.refresh('atk', 'c0047');
    const tHeard = Date.now();
    const heardMs = tHeard - tA;
    const pos = Wl.log.slice(logAt).findIndex((l) => l.id === 'c0047');
    await timerPass;
    const tEnd = Date.now();
    const passMs = tEnd - t0;
    el.stop();
    const named = events ? events.find((x) => x.m && x.m.type === 'channels-updated' && (x.m.changedKeys || []).includes('atk/c0047')) : null;
    return { a, heardMs, passMs, pos, calls: Wl.log.length - logAt, bcastBeforeAnswerMs: named ? tHeard - named.at : null, bcastBeforeEndMs: named ? tEnd - named.at : null };
  };
  {
    const { a, heardMs, passMs, pos, calls } = await lateOk(ENG, 'real');
    ok(a.ok && !a.pending && a.appended === 1 && heardMs < 400 && passMs >= 1500 && pos >= 1 && pos <= 2, `the owner's request behind a ${passMs} ms timer pass is answered ok (1 new) at ITS fetch — heard after ${heardMs} ms (the in-flight fetch + its own; fetched at position ${pos} of ${calls}), never at the pass's end`, JSON.stringify({ a: { ok: a.ok, pending: a.pending, appended: a.appended }, heardMs, passMs, pos }));
  }
  // (8b) THE BROADCAST RIDES THE ANSWER (r8 verify, medium — fixed r9): the `ok` landed at its fetch while the digest broadcast naming the key waited for the pass's end, so the panel's Refresh toast said "1 new" and the window repainted a whole pass later. The driver now broadcasts a requested key with news AT its fetch, before the answer
  {
    const events = [];
    const r = await lateOk(ENG, 'bcast', events);
    ok(r.a.ok && r.a.appended === 1 && r.bcastBeforeAnswerMs !== null && r.bcastBeforeAnswerMs >= 0 && r.bcastBeforeEndMs >= 1000, `(8b) the broadcast naming the requested key goes out at its fetch — ${r.bcastBeforeAnswerMs} ms BEFORE the answer is heard and ${r.bcastBeforeEndMs} ms before the ${r.passMs} ms pass ends (the window repaints with the toast)`, JSON.stringify(r));
  }
  // (9) THE DUE LIST UNDER A REQUEST STREAM (r7 verify — the reason r6 held the ok): with an ok delivered at its fetch a lane that loops `await refresh()` re-files INSIDE the pass it rides; the timer's turn is now taken at every boundary and requests INTERLEAVE with due rows, so (a) a saturating 10-lane storm for 2.5 s serves every due row DURING the storm (leg (1) above reads it), and (b) a 25 ms trickle for 3 s — heavier than the vendor can carry beside the due list — still serves the due rows at their cadence (re-due half-way) with every request answered, none `pending`, its median wait a fetch or two (the tail waits, honestly: the stream is oversubscribed)
  const trickle = async (ENGx, label, { ms = 3000, every = 25, redueAt = 1500 } = {}) => {
    const Wt = makeWorld(clock, { n: 45, hot: 45, warm: 0 });
    const kt = worldModule('atk', Wt, { budgetDefault: 100000 });
    const dirT = path.join(ROOT, `atk-trickle-${label}`);
    seedAccounts(dirT, [['atk', 'atk']]);
    const regT = CH.createChannelRegistry(); regT.register(kt);
    const et = ENGx.create({ dataDir: dirT, registry: regT, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
    await ingestAll(et, 'atk');
    clock += 31e3; Wt.delayMs = 20;
    const due = Array.from({ length: 35 }, (_, i) => `c00${10 + i}`);
    const before = new Map(Wt.calls.history);
    const dueFetches = () => due.reduce((n, id) => n + (Wt.calls.history.get(id) || 0) - (before.get(id) || 0), 0);
    const ps = [], waits = []; let k = 0;
    const t0 = Date.now();
    const filer = setInterval(() => { const st = Date.now(); ps.push(et.refresh('atk', `c000${k++ % 10}`).then((x) => { waits.push(Date.now() - st); return x; })); }, every);
    const tk = setInterval(() => { et.tick(); }, 100);
    let redone = false; const rd = setInterval(() => { if (!redone && Date.now() - t0 >= redueAt) { redone = true; clock += 31e3; } }, 50);   // half-way: every due row is due AGAIN (a second epoch — 70 due fetches in all)
    await sleep(ms); clearInterval(filer); clearInterval(tk); clearInterval(rd);
    const during = dueFetches();
    const as = await Promise.all(ps); await et.idle('atk');
    waits.sort((x, y) => x - y);
    et.stop();
    return { filed: ps.length, during, pending: as.filter((x) => x.pending).length, notOk: as.filter((x) => !x.ok).length, p50: waits[Math.floor(waits.length * 0.5)], p95: waits[Math.floor(waits.length * 0.95)] };
  };
  {
    const r = await trickle(ENG, 'real');
    ok(r.filed >= 80 && r.during >= 55 && r.pending === 0 && r.notOk === 0 && r.p50 < 300, `a 25 ms owner trickle for 3 s (${r.filed} requests, more than the vendor carries beside the due list): the due rows still got ${r.during} of their 70 due fetches (two epochs of 35) DURING the stream, every request answered (0 pending, 0 refused), median wait ${r.p50} ms (p95 ${r.p95} ms — the oversubscribed stream's own backlog)`, JSON.stringify(r));
  }
  // (10) ONE PASS QUEUED PER ACCOUNT (r7 verify, B3 — medium): a timer / forced pass asked while another is in flight runs after it (r6); a SECOND such ask while one is already queued coalesced into nothing — each `.then(after)` ran its own pass, so three forced asks behind one held pass (three Re-authorize presses, three option saves) ran three full forced ingests (discovery + every row, three times; measured). Now one pass is queued, `force` sticky, every asker answered by it
  const queuedPasses = async (ENGx, label) => {
    const Wq = makeWorld(clock, { n: 20, hot: 20, warm: 0 });
    const kq = worldModule('atk', Wq, { budgetDefault: 100000 });
    const dirQ = path.join(ROOT, `atk-queued-${label}`);
    seedAccounts(dirQ, [['atk', 'atk']]);
    const regQ = CH.createChannelRegistry(); regQ.register(kq);
    const eq = ENGx.create({ dataDir: dirQ, registry: regQ, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
    await ingestAll(eq, 'atk');
    clock += 31e3; Wq.delayMs = 10;
    let release; const hold = new Promise((r) => { release = r; }); let started; const entered = new Promise((r) => { started = r; }); let once = false;
    Wq.beforeHistory = async (id) => { if (id === 'c0000' && !once) { once = true; started(); await hold; } };
    const list0 = Wq.calls.list, hist0 = historyCalls(Wq);
    const tp = eq.pass('atk'); await entered;                       // the timer pass is inside its first fetch
    const asks = [eq.pass('atk', { force: true }), eq.pass('atk'), eq.pass('atk', { force: true }), eq.pass('atk', { force: true })];
    await sleep(5);
    release();
    const rs = await Promise.all([tp, ...asks]);
    await eq.idle('atk');
    eq.stop();
    return { forced: Wq.calls.list - list0, fetches: historyCalls(Wq) - hist0, allOk: rs.every((r) => r.ok) };   // (`pass` is an async function: each ask gets its own wrapper of the ONE queued promise — identity is not the pin, the counts are)
  };
  {
    const r = await queuedPasses(ENG, 'real');
    ok(r.forced === 1 && r.fetches === 40 && r.allOk, `three forced asks and a timer ask behind one held pass run ONE forced pass after it (${r.forced} discovery, ${r.fetches} fetches = the held pass's 20 + one forced pass's 20), every asker answered ok by it`, JSON.stringify(r));
  }
  // (11) THE FRONT RUN — FIFO ACROSS BOUNDARIES, HUMANS FIRST, A RE-REQUEST RIDES (r8 verify, major): r7's drain spliced every boundary's new head at `at` (ahead of the requests drained at EARLIER boundaries) and promoted riders there too, its rider lookup skipped a key this pass had already fetched (`!done.has`), and r7's pass never ends under a stream (takeTimerTurn) — so the earliest waiter of every key was pushed back by each later boundary until the stream stopped (measured: a 5-key 25 ms trickle for 10 s ⇒ 85 of 398 waiters past 2 s, max 11.8 s, 395 vendor calls for 398 requests; the owner's ONE press under a 4-lane stream heard `pending` at 30 s; the owner's rider behind 180 agent riders fetched at position 181). Now the run of requested items at the front is FIFO across boundaries, a re-request of any key rides its pending item, and the run is ordered humans (the owner's press, a window's open) before agents
  const frontRun = async (ENGx, label, only = 'abc') => {
    const out = {};
    if (only.includes('a')) { // (a) one key, a new request every 15 ms for 1.5 s (faster than the 20 ms fetch) while the due list keeps the pass alive: every request heard within a round, the calls coalesced
      const Wa = makeWorld(clock, { n: 45, hot: 45, warm: 0 });
      const ka = worldModule('atk', Wa, { budgetDefault: 100000 });
      const dirA = path.join(ROOT, `atk-run-a-${label}`);
      seedAccounts(dirA, [['atk', 'atk']]);
      const regA = CH.createChannelRegistry(); regA.register(ka);
      const ea = ENGx.create({ dataDir: dirA, registry: regA, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
      await ingestAll(ea, 'atk');
      clock += 31e3; Wa.delayMs = 20;
      const x0 = Wa.calls.history.get('c0044') || 0;
      const ps = [];
      const filer = setInterval(() => { const st = Date.now(); ps.push(ea.refresh('atk', 'c0044').then((r) => ({ wait: Date.now() - st, ok: r.ok && !r.pending }))); }, 15);
      const tk = setInterval(() => ea.tick(), 100);
      const rd = setInterval(() => { clock += 31e3; }, 500);
      await sleep(1500); clearInterval(filer); clearInterval(tk); clearInterval(rd);
      const rs = await Promise.all(ps); await ea.idle('atk');
      ea.stop();
      out.a = { requests: ps.length, calls: (Wa.calls.history.get('c0044') || 0) - x0, maxWait: Math.max(...rs.map((r) => r.wait)), allOk: rs.every((r) => r.ok) };
    }
    if (only.includes('b')) { // (b) the owner's ONE press on its own key under a 4-lane owner-origin stream of other keys (four windows re-filing the instant each answers) for 1.5 s; the press is filed from the continuation of whichever lane receives the stream's 5th answer — just before that lane re-files — and awaited after the lanes stop (r9: a 200 ms timer landed in a due-row fetch half the time, and then ANY newest-first order serves the press at once — the LIFO control was a coin flip; the claim is unchanged)
      const Wb = makeWorld(clock, { n: 50, hot: 40, warm: 0 });   // c0040.. not due
      const kb = worldModule('atk', Wb, { budgetDefault: 100000 });
      const dirB = path.join(ROOT, `atk-run-b-${label}`);
      seedAccounts(dirB, [['atk', 'atk']]);
      const regB = CH.createChannelRegistry(); regB.register(kb);
      const ebb = ENGx.create({ dataDir: dirB, registry: regB, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
      await ingestAll(ebb, 'atk');
      clock += 31e3; Wb.delayMs = 20;
      let stop = false, filed = 0, press = null;
      const lane = async (ks) => {
        let i = 0;
        while (!stop) {
          await ebb.refresh('atk', ks[i++ % ks.length]); filed++;
          if (filed === 5 && !press) { const tP = Date.now(); press = ebb.refresh('atk', 'c0049').then((r) => ({ wait: Date.now() - tP, ok: r.ok && !r.pending })); }
        }
      };
      const lanes = [lane(['c0040', 'c0041']), lane(['c0042', 'c0043']), lane(['c0044', 'c0045']), lane(['c0046', 'c0047'])];
      const tk = setInterval(() => ebb.tick(), 100);
      const rd = setInterval(() => { clock += 31e3; }, 500);
      await sleep(1500); stop = true; clearInterval(tk); clearInterval(rd);
      await Promise.all(lanes); const pr = press ? await press : { wait: null, ok: false }; await ebb.idle('atk');
      ebb.stop();
      out.b = { filed, ...pr };
    }
    if (only.includes('c')) { // (c) the owner's press on a DUE row filed behind 40 agent requests on 40 other due rows (riders all) while the timer pass is inside its first fetch: the owner's rider is fetched FIRST
      const Wc = makeWorld(clock, { n: 60, hot: 60, warm: 0 });
      const kc = worldModule('atk', Wc, { budgetDefault: 100000 });
      const dirC = path.join(ROOT, `atk-run-c-${label}`);
      seedAccounts(dirC, [['atk', 'atk']]);
      const regC = CH.createChannelRegistry(); regC.register(kc);
      const ec = ENGx.create({ dataDir: dirC, registry: regC, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
      await ingestAll(ec, 'atk');
      await ec.setScopeAssignment('atk', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, mode: 'all', notify: 'digest', digestMinutes: 30 });
      clock += 31e3; Wc.delayMs = 20;
      let release; const hold = new Promise((r) => { release = r; }); let started; const entered = new Promise((r) => { started = r; }); let once = false;
      Wc.beforeHistory = async (id) => { if (id === 'c0000' && !once) { once = true; started(); await hold; } };
      const logAt = Wc.log.length;
      const tp = ec.pass('atk'); await entered;
      const agents = Array.from({ length: 40 }, (_, i) => ec.agentRefresh(X6F, 'atk', `c00${String(i + 1).padStart(2, '0')}`));
      await sleep(5);
      const tO = Date.now();
      const press = ec.refresh('atk', 'c0059').then((r) => ({ wait: Date.now() - tO, ok: r.ok && !r.pending }));
      release();
      const pr = await press; const ra = await Promise.all(agents); await tp;
      const calls = Wc.log.slice(logAt).map((l) => l.id);
      ec.stop();
      out.c = { ...pr, pos: calls.indexOf('c0059'), agentsOk: ra.every((r) => r.ok && !r.pending), calls: calls.length };
    }
    return out;
  };
  {
    const r = await frontRun(ENG, 'real');
    ok(r.a.allOk && r.a.requests >= 60 && r.a.maxWait < 500 && r.a.calls <= r.a.requests * 0.6, `(a) ${r.a.requests} requests on ONE key in 1.5 s, every one heard within a round (max ${r.a.maxWait} ms), ${r.a.calls} vendor calls (a re-request rides the pending item — coalesced)`, JSON.stringify(r.a));
    ok(r.b.ok && r.b.filed >= 20 && r.b.wait < 500, `(b) the owner's one press on its own key under a 4-lane stream of other keys (${r.b.filed} requests) is heard after ${r.b.wait} ms — within a round, never when the stream stops`, JSON.stringify(r.b));
    ok(r.c.ok && r.c.agentsOk && r.c.pos === 1 && r.c.calls === 60, `(c) the owner's press on a due row behind 40 agent riders is fetched at position ${r.c.pos} (humans first; every agent still answered ok, ${r.c.calls} calls = the pass's 60 rows once)`, JSON.stringify(r.c));
  }
  // CONTROLS for (3b) / (6) / (7) / (8) / (9) / (10): the cap without the reserve; the two budget lines answering `ok, 0 new`; the r5 drain that RECORDS a refusal for the pass's end; r6's answer that holds the ok for the pass's end; a loop fetching one over the budget; the loop without the interleave
  {
    const M6h = mutantCopies('chan-agg-r6', REPO);
    // r9: each control patches ONE line of the PURE drain (the rule it protects) or of the engine's driver (a delivery seam)
    const DELIVER_LINE = '      const deliver = (list, outcome) => { for (const id of list) { const w = e.waiters.get(id); if (w && w.outcome === undefined) { w.outcome = outcome; w.resolve(outcome); } } };';
    const CUT_WORDS = "      case 'cut': return budgetRefusal(rec, e);   // THE CUT: every accepted waiter, by name — never `0 new`";
    const BUDGET_WORDS = "      case 'budget': return budgetRefusal(rec, e);   // THE VENDOR BUDGET";
    const QUEUED_LINES = "      const q = Drain.queueAsk(e.after && e.after.ask, { force, origin });\n      if (q.joined) { e.after.ask = q.queued; return e.after.p; }\n      const queued = { ask: q.queued, p: null };\n      const after = () => { e.after = null; return stopped ? { ok: false, why: 'stopped' } : pass(adapterId, queued.ask); };\n      queued.p = e.passing.then(after, after);\n      e.after = queued;\n      return queued.p;\n";
    const W = {
      noReserve: closedWorld(M6h, 'no-reserve', { drain: [[DRAIN_LINES.cap, '  const cap = REFRESH_QUEUE_CAP;']] }),
      sweepOk: closedWorld(M6h, 'sweep-ok', { engine: [[CUT_WORDS, "      case 'cut': return { ok: true, appended: 0, polledAt: null };"]] }),
      drainOk: closedWorld(M6h, 'drain-ok', { engine: [[BUDGET_WORDS, "      case 'budget': return { ok: true, appended: 0, polledAt: null };"]] }),
      recordOnly: closedWorld(M6h, 'record-only', { engine: [[DELIVER_LINE, '      const deliver = (list, outcome) => { for (const id of list) { const w = e.waiters.get(id); if (w && w.outcome === undefined) { w.outcome = outcome; } } };']] }),
      okForEnd: closedWorld(M6h, 'ok-for-end', { engine: [[DELIVER_LINE, '      const deliver = (list, outcome) => { for (const id of list) { const w = e.waiters.get(id); if (w && w.outcome === undefined) { w.outcome = outcome; if (!outcome.ok) w.resolve(outcome); } } };']] }),   // r6's answer: a refusal at once, an ok at the pass's end
      oneOver: closedWorld(M6h, 'one-over', { drain: [[DRAIN_LINES.cut, '  if (!(s.budget.remainingUnits > -1)) {\n    if (seen.length)']] }),   // B4 (r7): a loop that fetches ONE over the budget before it cuts
      noInterleave: closedWorld(M6h, 'no-interleave', { drain: [[DRAIN_LINES.interleave, '']] }),
      perAsk: closedWorld(M6h, 'per-ask', { engine: [[QUEUED_LINES, "      const after = () => (stopped ? { ok: false, why: 'stopped' } : pass(adapterId, { force, origin }));\n      return e.passing.then(after, after);\n"]] }),
      // r8, split by the rule each shape broke (r7's drain spliced every boundary's head at `at` AND skipped a fetched key's rider AND filed riders behind the agents' — three rules, three copies):
      noRide: closedWorld(M6h, 'no-ride', { drain: [[DRAIN_LINES.slot, 'function slotOf(r) { return r.id; }']] }),
      lifo: closedWorld(M6h, 'lifo', { drain: [[DRAIN_LINES.rank, 'const byRank = (a, b) => (Number(b.human) - Number(a.human)) || (b.minSeq - a.minSeq);']] }),
      ownerLast: closedWorld(M6h, 'owner-last', { drain: [[DRAIN_LINES.rank, 'const byRank = (a, b) => (a.minSeq - b.minSeq);']] }),
    };
    const bad = Object.entries(W).filter(([, w]) => !w.setup);
    ok(bad.length === 0, 'CONTROL setup: the cap without the owner\'s reserve, the cut\'s and the judgement\'s budget words answering `ok`, the r5 record-for-the-end delivery, r6\'s ok-for-the-end delivery, a cut one over the budget, the drain without the interleave, r6\'s per-ask queue and r7\'s drain as three rule copies (no ride / LIFO / owner last) are reconstructed', bad.map(([k, w]) => `${k}: ${w.missing}`).join(' | '));
    // (3b) control: the owner's press is refused by the agent's storm
    {
      const ENGn = W.noReserve.mod;
      const Wn = makeWorld(clock, { n: 10, hot: 10, warm: 0 });
      const kn = worldModule('atk', Wn, { budgetDefault: 100000 });
      const dirN = path.join(ROOT, 'atk-ctl-reserve');
      seedAccounts(dirN, [['atk', 'atk']]);
      const regN = CH.createChannelRegistry(); regN.register(kn);
      const en = ENGn.create({ dataDir: dirN, registry: regN, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
      await ingestAll(en, 'atk');
      await en.setScopeAssignment('atk', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, mode: 'all', notify: 'digest', digestMinutes: 30 });
      clock += 31e3;
      let release; const hold = new Promise((r) => { release = r; });
      let started; const entered = new Promise((r) => { started = r; }); let once = false;
      Wn.beforeHistory = async (id) => { if (id === 'c0001' && !once) { once = true; started(); await hold; } };
      const held = en.refresh('atk', 'c0001');
      await entered;
      const agents = Array.from({ length: ENG.REFRESH_QUEUE_CAP }, (_, i) => en.agentRefresh(X6F, 'atk', `c000${2 + (i % 5)}`));
      await sleep(5);
      const owner = await en.refresh('atk', 'c0008');
      release();
      await Promise.all([held, ...agents]);
      en.stop();
      ok(owner.code === 'refresh-queue-full', `CONTROL: without the reserve the same agent storm refuses the OWNER's press (${owner.code}) — the leg above would go red`);
    }
    // (6) controls: each budget line answering `ok` is a lie the leg catches
    {
      const { a, l } = await budgetCut(W.sweepOk.mod, 'ctl-sweep');
      ok(a.filter((x) => x.code === 'vendor-budget').length === 0 && a.filter((x) => x.ok).length === 15, `CONTROL: with the cut sweep answering ok the five cut requests hear "0 new" for a fetch never made (${a.filter((x) => x.ok).length} ok) — the leg above would go red`);
      const r2 = await budgetCut(W.drainOk.mod, 'ctl-drain');
      ok(r2.l.every((x) => x.ok) && r2.calls === 10, `CONTROL: with the drain's budget line answering ok the three late requests hear "0 new" with no call (${r2.l.filter((x) => x.ok).length} ok, ${r2.calls} calls) — the leg above would go red`);
      const r3 = await budgetCut(W.oneOver.mod, 'ctl-over');
      ok(r3.calls > 10, `CONTROL (B4, r7): a loop that fetches one over the budget before cutting makes ${r3.calls} calls on the 10/min minute — the leg above's "exactly 10" would go red`);
    }
    // (7) control: the r5 drain records the refusal for the pass's end — heard only when the pass is over
    {
      const { a, heardMs, passMs } = await lateRefusal(W.recordOnly.mod, 'ctl');
      ok(a.code === 'refresh-floor' && heardMs >= 2000 && heardMs >= passMs - 200, `CONTROL: on the record-for-the-end drain the same refusal is heard only at the pass's end (${heardMs} ms of a ${passMs} ms pass) — the leg above would go red`, JSON.stringify({ a: a.code, heardMs, passMs }));
    }
    // (8) control: r6's answer (a refusal at once, the ok held for the pass's end) — the true answer is heard only when the pass is over
    {
      const { a, heardMs, passMs } = await lateOk(W.okForEnd.mod, 'ctl');
      ok(a.ok && a.appended === 1 && heardMs >= 1500 && heardMs >= passMs - 200, `CONTROL: on r6's ok-for-the-end answer the same true answer is heard only at the pass's end (${heardMs} ms of a ${passMs} ms pass) — the leg above would go red`, JSON.stringify({ a: a.code, heardMs, passMs }));
    }
    // (8b) control: the driver without the at-fetch broadcast — the key is named only by the pass's end broadcast
    {
      const EARLY = "          if (act.waiters.length) { notify([key], { full: false }); early.add(key); }   // the broadcast naming the key goes out BEFORE the answer: the window repaints with the toast, not a pass later\n";
      const cwLate = closedWorld(M6h, 'bcast-at-end', { engine: [[EARLY, '']] });
      ok(cwLate.setup, 'CONTROL setup: the driver without the at-fetch broadcast (r8\'s pass-end-only notify) is reconstructed', cwLate.missing);
      const events = [];
      const r = await lateOk(cwLate.mod, 'ctl-bcast', events);
      ok(r.bcastBeforeAnswerMs !== null && r.bcastBeforeAnswerMs < 0 && r.bcastBeforeEndMs < 200, `CONTROL: without it the broadcast naming the key lands ${-r.bcastBeforeAnswerMs} ms AFTER the answer, at the pass's end — leg (8b) would go red`, JSON.stringify(r));
    }
    // (9) control: the loop without the interleave — an ok at its fetch lets the storm's re-files sit at the head at every boundary, the due rows behind them for the storm's whole duration; the trickle serves them only in its gaps
    {
      const ENGi = W.noInterleave.mod;   // (the drain without the interleave: an ok at its fetch, the timer's turn at every step, requests always ahead)
      const Wi = makeWorld(clock, { n: 45, hot: 45, warm: 0 });
      const ki = worldModule('atk', Wi, { budgetDefault: 100000 });
      const dirI = path.join(ROOT, 'atk-ctl-interleave');
      seedAccounts(dirI, [['atk', 'atk']]);
      const regI = CH.createChannelRegistry(); regI.register(ki);
      const ei = ENGi.create({ dataDir: dirI, registry: regI, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
      await ingestAll(ei, 'atk');
      clock += 31e3; Wi.delayMs = 20;
      let stop = false, filed = 0;
      const lanes = Array.from({ length: 10 }, (_, k) => (async () => { while (!stop) { await ei.refresh('atk', `c000${k}`); filed++; } })());
      const dueRows = Array.from({ length: 35 }, (_, i) => `c00${10 + i}`);
      const before = new Map(Wi.calls.history);
      const tick = setInterval(() => { ei.tick(); }, 100);
      await sleep(2500);
      const during = dueRows.filter((id) => (Wi.calls.history.get(id) || 0) > (before.get(id) || 0)).length;
      stop = true; clearInterval(tick);
      await Promise.all(lanes); await ei.idle('atk');
      const total = dueRows.filter((id) => (Wi.calls.history.get(id) || 0) > (before.get(id) || 0)).length;
      ei.stop();
      ok(filed >= 20 && during <= 2 && total === 35, `CONTROL: without the interleave the same 2.5 s storm (${filed} refreshes) serves ${during}/35 due rows DURING it (all ${total} only once it stops) — leg (1)'s during count would go red`, JSON.stringify({ filed, during, total }));
      const rt = await trickle(ENGi, 'ctl');
      ok(rt.during <= 40 && rt.pending === 0, `CONTROL: without the interleave the same trickle serves the due rows only in its gaps — ${rt.during} of 70 due fetches (the leg above wants ≥ 55)`, JSON.stringify(rt));
    }
    // (10) control: r6's queued pass — every ask its own `.then(after)`, N asks = N passes
    {
      const rc = await queuedPasses(W.perAsk.mod, 'ctl');
      ok(rc.forced === 3 && rc.fetches >= 80, `CONTROL: on r6's per-ask queue the same four asks run ${rc.forced} forced passes and ${rc.fetches} fetches — the leg above would go red`, JSON.stringify(rc));
    }
    // (11) controls: r7's drain, one rule per copy — without the rider rule the one-key stream no longer coalesces (a), LIFO keeps the owner's one press behind a stream until it stops (b), without humans-first the owner's rider is fetched behind the agents' (c)
    {
      const ra = await frontRun(W.noRide.mod, 'ctl-ride', 'a');
      ok(ra.a.calls > ra.a.requests * 0.6, `CONTROL (no ride): the one-key stream makes ${ra.a.calls} calls for ${ra.a.requests} requests (max wait ${ra.a.maxWait} ms) — leg (a)'s coalescing would go red`, JSON.stringify(ra.a));
      const rb = await frontRun(W.lifo.mod, 'ctl-lifo', 'b');
      ok(rb.b.wait >= 1000, `CONTROL (LIFO): the owner's one press under the 4-lane stream is heard after ${rb.b.wait} ms — leg (b) would go red`, JSON.stringify(rb.b));
      const rcc = await frontRun(W.ownerLast.mod, 'ctl-owner-last', 'c');
      ok(rcc.c.pos >= 30, `CONTROL (owner last): the owner's rider is fetched at position ${rcc.c.pos} behind 40 agent riders — leg (c) would go red`, JSON.stringify(rcc.c));
    }
    for (const r2 of copiesCensus(M6h.files, M6h.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
  }
  // CONTROL: the Part-1 drain (drained ONCE before the loop; the tick skipping a busy account) — both starvations return
  {
    const M6g = mutantCopies('chan-agg-attack', REPO);
    // r9: the drain-once half is the PURE drain judging requests only at a pass's first step (`seen`); the tick's half is still the engine's TURN line
    const TURN = "      if (e.passing) { e.timerDue = true; continue; }   // r5 verify: busy while due — the pass in flight (or the next drain) does the timer's work, a request storm cannot starve the due list\n";
    const cwOnce = closedWorld(M6g, 'drain-once', { drain: [[DRAIN_LINES.seen, '  const seen = p.calls === 0 ? s.requests : s.requests.filter((r) => r.taken);   // every waiter present']], engine: [[TURN, '      if (e.passing) continue;\n']] });
    ok(cwOnce.setup, 'CONTROL setup: the drain-once loop with a tick that skips a busy account (the r5 Part-1 shape) is reconstructed', cwOnce.missing);
    const ENGc = cwOnce.mod;
    // (1) the storm on the control: the timer's due rows are never fetched
    {
      const Wc = makeWorld(clock, { n: 45, hot: 45, warm: 0 });
      const kc = worldModule('atk', Wc, { budgetDefault: 100000 });
      const dirC = path.join(ROOT, 'atk-ctl-storm');
      seedAccounts(dirC, [['atk', 'atk']]);
      const regC = CH.createChannelRegistry(); regC.register(kc);
      const ec = ENGc.create({ dataDir: dirC, registry: regC, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
      await ingestAll(ec, 'atk');
      clock += 31e3;
      Wc.delayMs = 20;
      let stop = false, filed = 0;
      const storm = async (k) => { while (!stop) { await ec.refresh('atk', `c000${k}`); filed++; } };
      const lanes = Array.from({ length: 10 }, (_, k) => storm(k));
      const before = new Map(Wc.calls.history);
      let ticks = 0;
      const tick = setInterval(() => { ec.tick(); ticks++; }, 100);
      await sleep(600);
      stop = true; clearInterval(tick);
      await Promise.all(lanes); await ec.settleWakes();
      const dueRows = Array.from({ length: 35 }, (_, i) => `c00${10 + i}`);
      const fetchedByTimer = dueRows.filter((id) => (Wc.calls.history.get(id) || 0) > (before.get(id) || 0)).length;
      ec.stop();
      ok(filed >= 20 && ticks >= 4 && fetchedByTimer === 0, `CONTROL: on the drain-once loop the same storm (${filed} refreshes, ${ticks} ticks) starves the timer — ${fetchedByTimer}/35 due rows fetched — the leg above would go red`);
    }
    // (2) the long pass on the control: the request is fetched after every due row
    {
      const Wc = makeWorld(clock, { n: 45, hot: 40, warm: 0 });
      const kc = worldModule('atk', Wc, { budgetDefault: 100000 });
      const dirC = path.join(ROOT, 'atk-ctl-long');
      seedAccounts(dirC, [['atk', 'atk']]);
      const regC = CH.createChannelRegistry(); regC.register(kc);
      const ec = ENGc.create({ dataDir: dirC, registry: regC, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => SESS, deliver: null, log: quiet });
      await ingestAll(ec, 'atk');
      clock += 31e3;
      Wc.delayMs = 20;
      let started; const entered = new Promise((r) => { started = r; }); let once = false;
      Wc.beforeHistory = async (id) => { if (id === 'c0000' && !once) { once = true; started(); } };
      const logAt = Wc.log.length;
      const timerPass = ec.pass('atk');
      await entered;
      const r = await ec.refresh('atk', 'c0040');
      await timerPass; await ec.settleWakes();
      const calls = Wc.log.slice(logAt).map((l) => l.id);
      const pos = calls.indexOf('c0040');
      ec.stop();
      ok(r.ok && pos === 40, `CONTROL: on the drain-once loop the request behind the 40-row pass is fetched only after every due row (position ${pos}) — the leg above would go red`, JSON.stringify({ r, pos }));
    }
    for (const r2 of copiesCensus(M6g.files, M6g.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
  }
}

// ═══ ⑦ history on open + scroll-up ═════════════════════════════════════════
console.log('⑦ history on demand');
{
  const wBefore = delivered.length;
  clock += 40e3;
  const w1 = await eng.watch('many', 'c0006');
  ok(w1.ok && w1.fetched, 'opening a window on a stale conversation fetches it at once');
  ok(eng.cadenceOf('many', 'c0006').tier === 'hot', 'an OPEN window makes its conversation hot (30 s)');
  let page = eng.store.readTail('many', 'c0006', { limit: 50 });
  let total = page.length, rounds = 0, last = null;
  // (verify r6: drain rule 19 — two vendor asks for one conversation are OLDER_FLOOR_MS apart; a person's next page is)
  while (rounds++ < 5) {
    const oldest = eng.store.readTail('many', 'c0006', { limit: 1000 })[0];
    clock += 2000;
    last = await eng.loadOlder('many', 'c0006', { before: oldest.at, beforeId: oldest.vendorId, limit: 50 });
    if (!last.ok || last.exhausted) break;
  }
  const all = eng.store.readTail('many', 'c0006', { limit: 1000 });
  ok(all.length === 120 && last && last.exhausted, `scrolling up fetches OLDER pages until the vendor has none (${all.length}/120, exhausted=${last && last.exhausted})`);
  const sorted = all.every((r, i) => i === 0 || (all[i - 1].at < r.at || (all[i - 1].at === r.at && all[i - 1].vendorId < r.vendorId)));
  const raw = fs.readFileSync(eng.store.logPath('many', 'c0006'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(sorted && raw.every((r, i) => i === 0 || raw[i - 1].at <= r.at), 'the backfill was PREPENDED in order (the log file itself is sorted)');
  ok(new Set(raw.map((r) => r.vendorId)).size === raw.length, '…with no duplicate');
  ok(delivered.length === wBefore, 'backfill never enters the wake funnel (the account is assigned, nobody was woken)');
  clock += 2000;
  const noOlder = await eng.loadOlder('many', 'c0003', { before: 1, beforeId: '0', limit: 50 });
  ok(noOlder.ok && noOlder.records.length === 0 && noOlder.exhausted, 'asking before the dawn of time answers exhausted, honestly');
  // verify r6 (rule 19 on the aggregated IM): the end is REMEMBERED — a second ask, inside or past the floor, costs no vendor call and no unit
  { const calls0 = W.calls.older; const spent0 = eng.digest().adapters.find((a) => a.id === 'many').budget.spent;
    const again = await eng.loadOlder('many', 'c0003', { before: 1, beforeId: '0', limit: 50 });
    clock += 5000;
    const again2 = await eng.loadOlder('many', 'c0003', { before: 1, beforeId: '0', limit: 50 });
    const spent1 = eng.digest().adapters.find((a) => a.id === 'many').budget.spent;
    ok(again.ok && again.exhausted && again.source === 'memory' && again2.source === 'memory' && W.calls.older === calls0 && spent1 === spent0, `the remembered end answers twice more with ZERO vendor calls (${W.calls.older - calls0}) and the minute's units untouched (${spent0} → ${spent1}) — rule 9 is judged after rule 19`, JSON.stringify([again.source, again2.source, W.calls.older - calls0, spent0, spent1])); }
}

// ═══ ⑧ attachments through the ROUTE ═══════════════════════════════════════
console.log('⑧ attachments: nosniff, sandbox, attachment unless a raster image inline, 0600, LRU');
{
  const express = require('express');
  const app = express();
  app.use(express.json());
  routes.setup({ getEngine: () => eng });
  app.use(routes.router);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const rec = eng.store.readTail('many', 'c0001', { limit: 50 }).find((r) => r.attachments && r.attachments.length);
  ok(rec && rec.attachments.length === 3, 'the fixture record carries three attachments');
  const get = (id, q = '') => fetch(`${base}/api/channels/many/c0001/attachment/${encodeURIComponent(id)}?msg=${encodeURIComponent(rec.vendorId)}${q}`);
  const img = await get('c0001-img', '&inline=1');
  const imgBytes = Buffer.from(await img.arrayBuffer());
  ok(img.status === 200 && img.headers.get('content-type') === 'image/png' && /^inline/.test(img.headers.get('content-disposition')) && imgBytes.slice(1, 4).toString() === 'PNG', 'a PNG asked inline is served inline as image/png (the thumbnail)');
  ok(img.headers.get('x-content-type-options') === 'nosniff' && /default-src 'none'; sandbox/.test(img.headers.get('content-security-policy') || ''), 'nosniff + a sandbox CSP on every attachment');
  const txt = await get('c0001-doc', '&inline=1');
  ok(txt.status === 200 && txt.headers.get('content-type') === 'application/octet-stream' && /^attachment/.test(txt.headers.get('content-disposition')) && /notes\.txt/.test(txt.headers.get('content-disposition')), 'a text file is ALWAYS a download (octet-stream, attachment) even when asked inline');
  const svg = await get('c0001-svg', '&inline=1');
  ok(svg.status === 200 && svg.headers.get('content-type') === 'application/octet-stream' && /^attachment/.test(svg.headers.get('content-disposition')), 'an SVG is never inline (it is script) — a download');
  const calls0 = W.calls.attach;
  await get('c0001-img', '&inline=1');
  ok(W.calls.attach === calls0, 'a second request is served from the cache (no vendor call)');
  const dir = path.join(dirMain, 'channels', 'attachments', 'many', 'c0001');
  const files = fs.readdirSync(dir);
  ok(files.length === 6 && files.every((f) => (fs.statSync(path.join(dir, f)).mode & 0o777) === 0o600), 'every cached file and its meta are mode 0600', files.map((f) => (fs.statSync(path.join(dir, f)).mode & 0o777).toString(8)).join());
  // CONCURRENT first fetches of ONE attachment (the blob is written async): each write has its own temp
  // file, every answer is whole, nothing half-written is left behind
  {
    const h = require('crypto').createHash('sha1').update(`${rec.vendorId}\nc0001-svg`).digest('hex');   // verify r1 (channel-attach-read): the cache slot names the message
    for (const f of [h, h + '.json']) fs.unlinkSync(path.join(dir, f));
    const rs = await Promise.all([1, 2, 3].map(() => get('c0001-svg').then(async (r) => ({ status: r.status, body: Buffer.from(await r.arrayBuffer()).toString('hex') }))));
    const left0 = fs.readdirSync(dir);
    ok(rs.every((r) => r.status === 200 && r.body === rs[0].body && r.body.length > 0) && !left0.some((f) => /\.tmp-/.test(f)) && left0.includes(h) && (fs.statSync(path.join(dir, h)).mode & 0o777) === 0o600,
      'three CONCURRENT first fetches of one attachment all answer the same whole bytes, and no temp file is left (0600 kept)', JSON.stringify({ statuses: rs.map((r) => r.status), left: left0.length }));
  }
  const forged = await fetch(`${base}/api/channels/many/c0001/attachment/img_not_ours?msg=${encodeURIComponent(rec.vendorId)}`);
  ok(forged.status === 404, 'an id no record of this conversation names is refused (not a proxy for arbitrary vendor keys)');
  // THE BUDGET: 64 MB (the setting's floor) with 25 MB images ⇒ the third evicts the least-recently-used
  SET['channels.attachmentBudgetMB'] = 64;
  W.bigAttachments = 25 * 1024 * 1024;
  for (const i of [10, 11, 12]) W.convs.get(`c00${i}`).recs.push({ vendorId: `c00${i}-big`, at: clock + i, author: { id: 'u-1', name: 'Brook' }, text: 'a big picture', attachments: [{ id: `big-${i}`, name: `big-${i}.png`, mime: 'image/png' }] });
  clock += 31e3;
  for (const i of [10, 11, 12]) await eng.refresh('many', `c00${i}`);
  const big = async (i) => { const res = await fetch(`${base}/api/channels/many/c00${i}/attachment/big-${i}?msg=c00${i}-big`); await res.arrayBuffer(); return res.status; };
  const s10 = await big(10); clock += 1000;
  const s11 = await big(11); clock += 1000;
  ok(s10 === 200 && s11 === 200, 'two 25 MB attachments fit under 64 MB');
  await get('c0001-img', '&inline=1'); clock += 1000;   // touch the small image
  const touchedBig11 = await big(11); clock += 1000;    // …and big-11 again: big-10 is now the least recently used
  ok(await big(12) === 200, 'the third 25 MB attachment is admitted…');
  const left = (i) => { const d0 = path.join(dirMain, 'channels', 'attachments', 'many', `c${String(i).padStart(4, '0')}`); return fs.existsSync(d0) ? fs.readdirSync(d0).length : 0; };
  ok(touchedBig11 === 200 && left(10) === 0 && left(11) === 2 && left(12) === 2 && left(1) >= 2, '…by EVICTING the least-recently-used one (big-10), never the touched ones', JSON.stringify([left(10), left(11), left(12)]));
  const usage = eng.store.attachmentUsage('many');
  ok(usage.bytes <= 64 * 1024 * 1024, `the account's cache is under its budget (${Math.round(usage.bytes / 1048576)} MB of 64)`);
  delete SET['channels.attachmentBudgetMB'];
  W.bigAttachments = 0;
  // the search route: async, over the account's logs
  const sr = await (await fetch(`${base}/api/channels/search?adapter=many&q=${encodeURIComponent('fresh news')}`)).json();
  ok(sr.ok && sr.results.length === 1 && sr.results[0].convId === 'c0002' && sr.results[0].title === 'Room 2', 'search finds a message across the account\'s logs, named by its conversation', JSON.stringify(sr.results && sr.results[0] && { convId: sr.results[0].convId, title: sr.results[0].title }));
  const sr2 = await (await fetch(`${base}/api/channels/search?adapter=many%3A0000abcd&q=${encodeURIComponent('fresh news')}`)).json();
  ok(sr2.ok && sr2.results.length === 0, '…and never in another account');
  // the reader routes
  const ov = await (await fetch(`${base}/api/channels/many/c0300/refresh`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ every: 300 }) })).json();
  ok(ov.ok && ov.refresh.every === 300, 'PUT …/refresh sets the override');
  const full = await (await fetch(`${base}/api/channels/many/c0300`)).json();
  ok(full.conversation && full.conversation.refresh.every === 300 && full.conversation.reach && full.conversation.inherits && full.conversation.inherits.account && full.conversation.attachments === 'fetch', 'GET one conversation = the FULL view (reach, inherited grains, capabilities)');
  server.close();
}

// ═══ ⑨ three grains ════════════════════════════════════════════════════════
console.log('⑨ assignment grains reach exactly their sets; ledgers per assignment; the scope digest');
{
  const A = { kind: 'agent', id: 'agent-A', groups: [] }, B = { kind: 'agent', id: 'agent-B', groups: [] }, C = { kind: 'agent', id: 'agent-C', groups: [] };
  const pat = await eng.setScopeAssignment('many', { kind: 'pattern' }, { principal: { kind: 'agent', id: 'agent-B', name: 'Beta' }, mode: 'all', notify: 'digest', digestMinutes: 30, pattern: { match: 'any', rules: [{ kind: 'title', value: 'gpu on-call' }] } });
  ok(pat.ok && pat.assignment.scope.kind === 'pattern' && pat.assignment.patternLabel, 'a PATTERN assignment (title contains "gpu on-call") is saved', JSON.stringify(pat.error || ''));
  const conv = await eng.setAssignment('many', 'c0001', { principal: { kind: 'agent', id: 'agent-C', name: 'Gamma' }, mode: 'all' });
  ok(conv.ok, 'a CONVERSATION assignment on c0001 is saved');
  const gpu = Object.values(eng.store.index.live()).filter((e) => e.adapterId === 'many' && /GPU on-call/.test(e.title)).map((e) => e.key).sort();
  const listA = eng.listFor(A).conversations.filter((c) => c.adapterId === 'many');
  const listB = eng.listFor(B).conversations.map((c) => c.key).sort();
  const listC = eng.listFor(C).conversations.map((c) => c.key);
  const moreA = eng.listFor(A).more;   // design 008 S6 (lane channels-followups): the agent's list is the newest 200 + a count of the rest
  ok(listA.length === 200 && moreA === 673, 'the ACCOUNT grant makes all 873 visible to Alpha (the newest 200 listed, the other 673 counted)', JSON.stringify({ listed: listA.length, more: moreA }));
  ok(eng.listFor(A).conversations.every((c) => c.adapterId === 'many'), '…and nothing of the other account of the same kind');
  ok(JSON.stringify(listB) === JSON.stringify(gpu) && gpu.length === 18, `the PATTERN reaches EXACTLY its ${gpu.length} matching conversations for Beta`, JSON.stringify(listB.slice(0, 3)));
  ok(listC.length === 1 && listC[0] === 'many/c0001', 'the CONVERSATION grant reaches exactly c0001 for Gamma');
  ok(eng.effectiveFor('many', 'c0001').source === 'conversation' && eng.effectiveFor('many', 'c0007').source === 'pattern' && eng.effectiveFor('many', 'c0100').source === 'account', 'effective: conversation > pattern > account');
  const byA = eng.listFor(A).conversations.find((c) => c.id === 'c0100');
  ok(byA.assigned === true && byA.assignedVia === 'account', 'Alpha\'s list says WHY a row is its (account)');
  // a NEW matching conversation inherits within one pass
  W.add('c9999', { title: 'GPU on-call — new', lastAgo: 0, count: 1 });
  clock += 1000;
  await eng.pass('many', { force: true });
  ok(eng.effectiveFor('many', 'c9999') && eng.effectiveFor('many', 'c9999').source === 'pattern' && eng.listFor(B).conversations.some((c) => c.id === 'c9999'), 'a conversation that appears later inherits the pattern in the SAME pass it is discovered');
  // WAKES COUNT AGAINST ONE LEDGER PER ASSIGNMENT (account, cap 3)
  const already = eng.adapterView(eng.adapterRecords().adapters.find((r) => r.id === 'many')).assignment.stats.wakes24h;
  await eng.setScopeAssignment('many', { kind: 'account' }, { principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, mode: 'all', notify: 'wake', dailyWakeCap: already + 3 });
  const d0 = delivered.length;
  const targets = ['c0100', 'c0101', 'c0102', 'c0103', 'c0104'];
  for (const id of targets) W.convs.get(id).recs.push({ vendorId: `${id}-news`, at: clock + 500, author: { id: 'u-1', name: 'Brook' }, text: `news in ${id}`, attachments: [] });
  clock += 1000;
  for (const id of targets) await eng.refresh('many', id);
  await eng.settleWakes();
  const woke = delivered.slice(d0).filter((d) => d.cid === 'agent-A');
  ok(woke.length === 3, `an account assignment with ${already} wakes already spent and a daily cap of ${already + 3} wakes 3 more times across 5 conversations (${woke.length}) — ONE ledger for the whole account, not one per conversation`);
  ok(woke.every((d) => /\(you are watching the whole account\)/.test(d.text) && d.opts.spendReason === 'channel-message'), 'each inherited wake says why it is here and rides the spend authorizer\'s reason');
  const acct = eng.adapterView(eng.adapterRecords().adapters.find((r) => r.id === 'many')).assignment;
  ok(acct && acct.stats.wakes24h === already + 3, 'the account assignment\'s own ledger holds them', JSON.stringify(acct && acct.stats));
  const heldRow = eng.conversationView('many', targets[4]);
  ok(heldRow.stats.pending >= 1 && new RegExp(`daily wake cap reached \\(${already + 3} of ${already + 3} in 24 h\\)`).test((heldRow.stats.lastRefusal || {}).why || ''), 'the capped hits are HELD on their conversation, with the named refusal', JSON.stringify(heldRow.stats.lastRefusal));
  // THE SCOPE DIGEST: the pattern (notify digest) delivers ONE block for all its conversations
  const d1 = delivered.length;
  for (const id of ['c0007', 'c0057', 'c0107']) W.convs.get(id).recs.push({ vendorId: `${id}-gpu`, at: clock + 700, author: { id: 'u-2', name: 'Cass' }, text: `GPU alert in ${id}`, attachments: [] });
  clock += 1000;
  for (const id of ['c0007', 'c0057', 'c0107']) await eng.refresh('many', id);
  await eng.settleWakes();
  ok(delivered.length === d1, 'a digest assignment does not wake per message');
  const fl = await eng.flushScope('many', 'pattern', pat.assignment.id);
  await eng.settleWakes();
  const dg = delivered.slice(d1);
  ok(fl.ok && dg.length === 1 && dg[0].cid === 'agent-B' && /### Channel digest — many · 3 conversations, 3 messages/.test(dg[0].text), 'the window delivers ONE block listing the 3 conversations', dg[0] && dg[0].text.split('\n')[0]);
  // R4: the account watcher (Alpha, capped out) still watches these three too — per principal, a rule's watcher never silences another's — so
  // Alpha's held hits stay; Beta's (the rule's digest) are exactly the ones cleared
  ok(['c0007', 'c0057', 'c0107'].every((id) => !(eng.store.index.live()[`many/${id}`].pending || []).some((p) => p.for === 'agent:agent-B')), '…and clears exactly THOSE pending hits (Beta\'s)');
  ok(['c0007', 'c0057', 'c0107'].every((id) => (eng.store.index.live()[`many/${id}`].pending || []).some((p) => p.for === 'agent:agent-A')), '…while Alpha\'s — held by ITS OWN cap — stay pending for Alpha (another principal\'s rule never masks its notification)');
  // un-assigning the account removes ONLY its grant: Alpha keeps nothing, Beta keeps its pattern set
  await eng.setScopeAssignment('many', { kind: 'account' }, null);
  ok(eng.listFor(A).conversations.length === 0 && eng.listFor(B).conversations.length === gpu.length + 1, 'un-assigning the account removes exactly its reach; the pattern\'s stands');
}

// AN INHERITED GRAIN'S DAILY CAP HOLDS UNDER A BURST (lane R2 verify,
// critical): the grain's ledger was read BEFORE the ladder's await and
// written AFTER it, and wakes were serialized per CONVERSATION only — so a
// pass that brought news to 100 conversations under one account (or pattern)
// assignment with a cap of 5 started 100 billed turns whenever the ladder
// took longer than a couple of milliseconds (the real one always does).
console.log('⑨b one pass, 100 fresh conversations, a slow ladder: an inherited grain wakes exactly its cap');
async function capRace(ENGmod, label, grain) {
  const Wc = makeWorld(clock, { n: 100, hot: 0, warm: 0 });
  const kc = worldModule('race', Wc);
  const dirC = path.join(ROOT, `race-${label}`);
  seedAccounts(dirC, [['race', 'race']]);
  const got = [];
  const slow = { async deliverToConversation(cid, text, opts) { await sleep(20); got.push({ cid, text, opts }); return { ok: true, lane: 'message' }; }, stashFor() {} };
  const registry = CH.createChannelRegistry(); registry.register(kc);
  const ec = ENGmod.create({ dataDir: dirC, registry, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => [{ cid: 'agent-X', name: 'Xi', groups: [] }], deliver: slow, log: quiet });
  await ingestAll(ec, 'race');
  const principal = { kind: 'agent', id: 'agent-X', name: 'Xi' };
  const saved = grain === 'account'
    ? await ec.setScopeAssignment('race', { kind: 'account' }, { principal, mode: 'all', notify: 'wake', dailyWakeCap: 5 })
    : await ec.setScopeAssignment('race', { kind: 'pattern' }, { principal, mode: 'all', notify: 'wake', dailyWakeCap: 5, pattern: { match: 'any', rules: [{ kind: 'title', value: 'room' }] } });
  const inScope = Object.values(ec.store.index.live()).filter((e) => e.adapterId === 'race' && ec.effectiveFor('race', e.id)).map((e) => e.id);
  for (const id of inScope) Wc.convs.get(id).recs.push({ vendorId: `${id}-news`, at: clock + 500, author: { id: 'u-1', name: 'Brook' }, text: `news in ${id}`, attachments: [] });
  clock += 1000;
  await ec.pass('race', { force: true });          // ONE pass brings news to every one of them
  await ec.settleWakes();
  const rec = ec.adapterRecords().adapters.find((r) => r.id === 'race');
  const view = ec.adapterView(rec);
  const a = grain === 'account' ? view.assignment : (view.patterns || [])[0];
  const held = inScope.filter((id) => { const v = ec.conversationView('race', id); return v && v.stats && v.stats.pending >= 1 && /daily wake cap reached \(5 of 5 in 24 h\)/.test((v.stats.lastRefusal || {}).why || ''); });
  ec.stop();
  return { ok: !!(saved && saved.ok), n: inScope.length, woke: got.length, wakes24h: a && a.stats ? a.stats.wakes24h : null, held: held.length };
}
{
  for (const grain of ['account', 'pattern']) {
    const r = await capRace(ENG, grain, grain);
    ok(r.ok && r.n >= 98, `FIXTURE: the ${grain} grain covers ${r.n} conversations, cap 5, a 20 ms ladder`);
    ok(r.woke === 5 && r.wakes24h === 5, `the ${grain} grain woke EXACTLY its cap (${r.woke} deliveries, ledger ${r.wakes24h}) — not one per conversation of the burst`);
    ok(r.held === r.n - 5, `…and the other ${r.n - 5} conversations are HELD with the named refusal "daily wake cap reached (5 of 5 in 24 h)" (${r.held})`);
  }
  // CONTROL: the pre-fix wake — a grain's wake NOT queued on its scope — breaks the cap
  const M9 = mutantCopies('chan-agg-race', REPO);
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  // R4 verify r4: the pre-fix shape is BOTH halves gone — the ONE door's scope leg dropped AND the row written after the
  // ladder (no reservation): with the row reserved before the bill, dropping the chain alone no longer overshoots here
  const unscoped = esrc.replace('        const r = await serialWake(`scope:${sk}`, () => (bounce < SCOPE_BOUNCE_MAX && scopeOf() !== sk ? SCOPE_MOVED : fn({ conv, scope: sk })));', '        const r = await fn({ conv, scope: sk });').replace('    const resId = await reserveWake(rec, convId, item, wk0);', "    const resId = 'late';");
  ok(unscoped !== esrc, 'CONTROL setup: the pre-fix (per-conversation only) wake is reconstructed from the shipped bytes');
  const E9 = M9.load('src/server/channels-engine.js', unscoped, 'unscoped');
  const rc = await capRace(E9, 'ctl', 'account');
  ok(rc.woke > 5, `CONTROL: without the scope queue the same burst wakes ${rc.woke} times past a cap of 5 — the legs above would go red`);
  for (const r of copiesCensus(M9.files, M9.dir, REPO, { minCopies: 1 })) ok(r.pass, r.name, r.detail);
}

// R4 (2026-09-27, access and notification are two operations): TWO WATCHERS
// of one account each hold their OWN cap under the same burst — the r2
// invariant "N fresh conversations in one pass never exceed the cap" per
// (principal, scope) — and a principal with ACCESS ONLY (the owner's group
// "工作") is never woken, never billed, never in a ledger, across the storm.
console.log('⑨c two watchers of one account, 100 fresh conversations, a slow ladder: each wakes exactly its own cap; access alone is never woken');
async function capRace2(ENGmod, label) {
  const Wc = makeWorld(clock, { n: 100, hot: 0, warm: 0 });
  const kc = worldModule('race2', Wc);
  const dirC = path.join(ROOT, `race2-${label}`);
  seedAccounts(dirC, [['race2', 'race2']]);
  const got = [];
  const slow = { async deliverToConversation(cid, text, opts) { await sleep(20); got.push({ cid, text, opts }); return { ok: true, lane: 'message' }; }, stashFor(cid) { got.push({ cid, stash: true }); } };
  const registry = CH.createChannelRegistry(); registry.register(kc);
  const sessions = [{ cid: 'agent-X', name: 'Xi', groups: [] }, { cid: 'agent-Y', name: 'Ypsilon', groups: [] }, { cid: 'agent-W', name: 'Worker', groups: ['tg-work'] }];
  const ec = ENGmod.create({ dataDir: dirC, registry, env: {}, now, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => sessions, deliver: slow, log: quiet });
  await ingestAll(ec, 'race2');
  const X = { kind: 'agent', id: 'agent-X', name: 'Xi' }, Y = { kind: 'agent', id: 'agent-Y', name: 'Ypsilon' }, WORK = { kind: 'group', id: 'tg-work', name: '工作' };
  const acc = await ec.setAccess('race2', { kind: 'account' }, [{ principal: X }, { principal: Y }, { principal: WORK }]);
  const wat = await ec.setWatchers('race2', { kind: 'account' }, [{ principal: X, mode: 'all', notify: 'wake', dailyWakeCap: 5 }, { principal: Y, mode: 'all', notify: 'wake', dailyWakeCap: 5 }]);
  const inScope = Object.values(ec.store.index.live()).filter((e) => e.adapterId === 'race2').map((e) => e.id);
  for (const id of inScope) Wc.convs.get(id).recs.push({ vendorId: `${id}-news`, at: clock + 500, author: { id: 'u-1', name: 'Brook' }, text: `news in ${id}`, attachments: [] });
  clock += 1000;
  await ec.pass('race2', { force: true });          // ONE pass brings news to every one of them
  await ec.settleWakes();
  // …and a 2.5 s storm of further passes: access alone must still never be woken
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < 2500) { const id = inScope[n++ % inScope.length]; Wc.convs.get(id).recs.push({ vendorId: `${id}-storm-${n}`, at: clock + 600 + n, author: { id: 'u-2', name: 'Cass' }, text: `storm ${n}`, attachments: [] }); clock += 50; await ec.refresh('race2', id); }
  await ec.settleWakes();
  const view = ec.adapterView(ec.adapterRecords().adapters.find((r) => r.id === 'race2'));
  const g = view.accountGrain || { watchers: [] };
  const byWatcher = (id) => (g.watchers.find((w) => w.principal.id === id) || { stats: {} }).stats.wakes24h;
  const out = { ok: !!(acc && acc.ok && wat && wat.ok), n: inScope.length, storm: n, x: got.filter((d) => d.cid === 'agent-X').length, y: got.filter((d) => d.cid === 'agent-Y').length, w: got.filter((d) => d.cid === 'agent-W').length, ledX: byWatcher('agent-X'), ledY: byWatcher('agent-Y'), workWatcher: g.watchers.some((w) => w.principal.id === 'tg-work'), pendingWork: Object.values(ec.store.index.live()).filter((e) => (e.pending || []).some((p) => p.for === 'group:tg-work')).length, listW: ec.listFor({ kind: 'agent', id: 'agent-W', groups: ['tg-work'] }).conversations.length };
  ec.stop();
  return out;
}
{
  const r = await capRace2(ENG, 'real');
  ok(r.ok && r.n >= 98, `FIXTURE: access for Xi, Ypsilon and group 工作; watchers Xi (cap 5) and Ypsilon (cap 5); ${r.n} conversations; a 20 ms ladder`);
  ok(r.x === 5 && r.y === 5 && r.ledX === 5 && r.ledY === 5, `each watcher woke EXACTLY its own cap — Xi ${r.x} (ledger ${r.ledX}), Ypsilon ${r.y} (ledger ${r.ledY}) — per (principal, scope), neither eating the other's`);
  ok(r.w === 0 && !r.workWatcher && r.pendingWork === 0, `group 工作 has ACCESS ONLY: across the burst and a 2.5 s storm of ${r.storm} further refreshes it was woken ${r.w} times, holds no watcher, no ledger, no pending hit`);
  ok(r.listW === r.n, `…and yet its member SEES every conversation of the account (${r.listW}) — access is reach, nothing else`);
  // CONTROL: the pre-fix wake — a watcher's wake NOT queued on its (scope, principal) chain — breaks both caps
  const M9c = mutantCopies('chan-agg-race2', REPO);
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  // R4 verify r4: the pre-fix shape is BOTH halves gone — the ONE door's scope leg dropped AND the row written after the
  // ladder (no reservation): with the row reserved before the bill, dropping the chain alone no longer overshoots here
  const unscoped = esrc.replace('        const r = await serialWake(`scope:${sk}`, () => (bounce < SCOPE_BOUNCE_MAX && scopeOf() !== sk ? SCOPE_MOVED : fn({ conv, scope: sk })));', '        const r = await fn({ conv, scope: sk });').replace('    const resId = await reserveWake(rec, convId, item, wk0);', "    const resId = 'late';");
  ok(unscoped !== esrc, 'CONTROL setup: the unscoped wake is reconstructed from the shipped bytes');
  const E9c = M9c.load('src/server/channels-engine.js', unscoped, 'unscoped2');
  const rc = await capRace2(E9c, 'ctl');
  ok(rc.x > 5 && rc.y > 5, `CONTROL: without the per-(scope, principal) queue the same burst wakes Xi ${rc.x} and Ypsilon ${rc.y} times past their caps of 5 — the leg above would go red`);
  for (const r2 of copiesCensus(M9c.files, M9c.dir, REPO, { minCopies: 1 })) ok(r2.pass, r2.name, r2.detail);
}

// R4 UI WIRING (source pins; the heavy test-channels-aggregate-ui drives the same in chrome):
// the two operations are two menu entries, access first, on the account and the row; the
// Notify picker is built from the grain's ACCESS list and nothing else; the empty picker
// points at Grant access…; a number past its bound is clamped VISIBLY; the retired
// single-assignment verb is gone from the code and the dictionaries; every string is
// textContent (the XSS judge over the editor, with a planted control).
console.log('⑨d R4 UI wiring: two operations, the picker = the access list, visible clamps, no innerHTML');
{
  const ED = fs.readFileSync(path.join(REPO, 'src/lib/channel-filter-editor.js'), 'utf-8');
  const PANEL = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf-8');
  const notifyBody = ED.slice(ED.indexOf('export async function showNotifyDialog('), ED.indexOf('export function showGrainMenu('));
  ok(/const principals = st\.access\.map\(/.test(notifyBody) && (notifyBody.match(/principals\s*=/g) || []).length === 1 && /watcherRow\(list, \{ w, f: filter, st, principals,/.test(notifyBody), 'the Notify picker is built from the grain\'s ACCESS list — one assignment, handed to every watcher row, nothing else');
  ok(/if \(!principals\.length\) \{[\s\S]*?Grant access first — use "Grant access…"[\s\S]*?showGrantAccessDialog\(app, target\)/.test(notifyBody), 'an EMPTY picker says "Grant access first" and its button opens Grant access… (access is the prerequisite)');
  const mutated = notifyBody.replace('const principals = st.access.map(', 'const principals = principalChoices(app, st.access).map(');
  ok(mutated !== notifyBody && !/const principals = st\.access\.map\(/.test(mutated), 'CONTROL: a picker built from every live principal is caught by the same pin');
  const acctOrder = [...PANEL.matchAll(/registerMenuItem\(\{ menu: M, group: '1_rows', order: (\d+), when: \(c\) => !A\(c\)\.builtin, label: \(\) => t\('([^']+)'\)/g)].map((m) => `${m[1]}:${m[2]}`);
  ok(acctOrder.join() === '10:Grant access…,11:Notify…,12:Conversations matching a rule…', 'the account ⋯: Grant access… (10), Notify… (11), then the rule grain (12)', acctOrder.join());
  ok(/label: \(\) => t\('Grant access…'\),\s*\n\s*run: \(c\) => showGrantAccessDialog\(c\.app, \{ kind: 'conversation', conv: c\.conv \}\)/.test(PANEL) && /label: \(\) => t\('Notify…'\),\s*\n\s*run: \(c\) => showNotifyDialog\(c\.app, \{ kind: 'conversation', conv: c\.conv \}\)/.test(PANEL), 'the conversation row menu offers the same two operations');
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const RETIRED = ['Hand to an agent…', 'Handed to an agent — edit…', 'Handed to {who}', 'Hand the whole account to an agent — {label}', 'Assign to an agent…', 'Unassign', 'by assignment'];
  const srcAll = ['src/lib/channels-panel.js', 'src/lib/channel-filter-editor.js', 'src/lib/channel-window.js', 'src/lib/channel-words.js', 'src/lib/channel-reach-editor.js'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf-8')).join('\n');
  const alive = RETIRED.filter((k) => srcAll.includes(`t('${k}')`) || k in zh || k in ja);
  ok(!alive.length, `the retired single-assignment verb and its words are gone from the code AND both dictionaries (${RETIRED.length} keys)`, alive.join(' | '));
  // channel-polish: the three plain questions — each clamp is said under ITS answer's field while that answer is chosen
  // (channel-render verify round 2 made the cap ITS OWN line under both answers — its note is drawn whatever the `how`;
  //  round 4 found this pin still spelling the pre-round-2 third-answer form: the heavy row was red on the lane)
  ok(/digestClamp\.textContent = howNow\(\) === 'digest' \? d\.note : ''/.test(ED) && /capClamp\.textContent = c\.note;/.test(ED) && /clampNoteText\(max, 'max'\)/.test(ED), 'a number past its bound is CLAMPED VISIBLY in the Notify dialog (the digest window and the daily cap each say "kept at the maximum, N" under their own field)');
  // block comments FIRST, then whole-line // comments (the other order drops a JSDoc's closing
  // `*/` line and lets the block pattern swallow the code up to the NEXT comment's end)
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const judge = (x) => [...strip(x).matchAll(/\.(innerHTML|outerHTML)\s*=\s*([^;\n]+)|insertAdjacentHTML\(([^;\n]+)/g)].map((m) => (m[2] || m[3] || '').trim()).filter((r) => !/^UI_ICONS\[|^''$|^""$/.test(r));
  ok(judge(ED).length === 0, 'XSS: the access / notify editor writes no innerHTML — every principal name, rule and estimate is textContent', JSON.stringify(judge(ED)));
  ok(judge(ED.replace("row.dataset.principal = r.key;", "row.innerHTML = r.key;")).length === 1, 'CONTROL: a planted `row.innerHTML = r.key` in the editor is flagged by the same judge');
}

// ═══ ⑩ restart + migration ═══════════════════════════════════════════════
console.log('⑩ a restart keeps everything; the migration turns tracked into hot');
{
  const snapshot = (e) => ({ override: e.store.index.live()['many/c0500'].refresh, patterns: Object.keys(e.store.index.table('patternAssignments') || {}).length, conv: (e.store.index.live()['many/c0001'].access || []).length + ':' + (e.store.index.live()['many/c0001'].watchers || []).length, anchors: Object.values(e.store.index.live()).filter((x) => x.anchor).length, linkedAt: e.adapterRecords().adapters.find((r) => r.id === 'many').linkedAt });
  const s1 = snapshot(eng);
  eng.stop();
  ({ eng, events } = mkEngine('main', { kinds: [kindMany], settings: SET, now, deliver, sessions: SESS, dataDir: dirMain }));
  const s2 = snapshot(eng);
  ok(JSON.stringify(s1) === JSON.stringify(s2), 'overrides, pattern assignments, conversation assignments, anchors and linkedAt survive a restart', JSON.stringify([s1, s2]));
  ok(eng.listFor({ kind: 'agent', id: 'agent-B', groups: [] }).conversations.length === 19, '…and the pattern reach answers the same after it');
  eng.stop();
  // the migration over a pre-2026-09-26 index
  const dirM = path.join(ROOT, 'migrate');
  seedAccounts(dirM, [['many', 'many']]);
  const ix = { v: 1, updatedAt: 0, conversations: {
    'many/t1': { key: 'many/t1', id: 't1', adapterId: 'many', title: 'tracked + anchored', tracked: true, anchor: 'x', readAt: 5, unread: 2, lane: {} },
    'many/t2': { key: 'many/t2', id: 't2', adapterId: 'many', title: 'untracked, never ingested', tracked: false, anchor: null, readAt: 0, unread: 0, lane: {} },
    'many/t3': { key: 'many/t3', id: 't3', adapterId: 'many', title: 'tracked, assigned', tracked: true, anchor: 'y', readAt: 9, assignment: { principal: { kind: 'agent', id: 'agent-A' }, mode: 'all', notify: 'wake', authority: 'draft', dailyWakeCap: 40 }, lane: {} },
  } };
  fs.writeFileSync(path.join(dirM, 'channels', 'index.json'), JSON.stringify(ix));
  const { eng: em } = mkEngine('migrate', { kinds: [kindMany], now, dataDir: dirM });
  const rep = em.migrateAggregated();
  await rep.write;
  const live = em.store.index.live();
  ok(rep.hot.sort().join() === 'many/t1,many/t3' && live['many/t1'].refresh.every === 30 && live['many/t1'].refresh.by === 'migration', 'tracked ⇒ hot: every tracked conversation gets refresh.every = 30 (by migration)', JSON.stringify(rep));
  ok(Object.values(live).every((e) => !('tracked' in e)), 'the `tracked` field is gone everywhere');
  ok(live['many/t2'].readAt === clock && live['many/t1'].readAt === 5, 'a never-ingested conversation\'s backlog is read (readAt stamped); an ingested one keeps its mark');
  ok(!!live['many/t3'].assignment && live['many/t3'].assignment.principal.id === 'agent-A', 'assignments are kept');
  ok(em.adapterRecords().adapters[0].linkedAt === clock, 'the account is stamped linkedAt');
  const again = em.migrateAggregated(); await again.write;
  ok(again.hot.length === 0 && again.readStamped === 0 && again.cleared === 0 && again.linked.length === 0, 'a second run changes nothing (idempotent)');
  const src = fs.readFileSync(path.join(REPO, 'src/server/migrations.js'), 'utf-8');
  ok(/id: '2026-09-channels-aggregated-im'/.test(src) && /migrateAggregated\(\)/.test(src), 'the migration is REGISTERED in src/server/migrations.js through the engine\'s serialized door');
  em.stop();
}

// ═══ ⑫ THE CHANGE FEED AT THE OWNER'S SCALE (lane lark-search-poll, B-5aab — design §6.2) ═══════
console.log('⑫ the change feed at the owner\'s scale: measuring = ② + the feed pages; carrying = the watched + owed rows, the 5-min net; a 5 % miss demotes it');
{
  const Wf = makeWorld(clock, { n: 873 });
  Wf.clock = () => clock;
  Wf.feed = { lagMs: 20e3, dropRate: 0 };
  const kf = worldModule('feedy', Wf, { feed: true });
  const dirF = path.join(ROOT, 'feed');
  seedAccounts(dirF, [['feedy', 'feedy']]);
  let { eng: ef } = mkEngine('feed', { kinds: [kf], now, dataDir: dirF });
  const diffOf = (b) => { const m = new Map(); for (const [k, v] of Wf.calls.history) { const d0 = v - (b.get(k) || 0); if (d0) m.set(k, d0); } return m; };
  const tierOf = (id) => { const i = Number(id.slice(1)); return i < 50 ? 'hot' : i < 250 ? 'warm' : 'cold'; };
  ok(await ingestAll(ef, 'feedy', 8), 'the owner\'s 873 conversations are discovered and read with the feed declared');
  for (let i = 0; i < 6; i++) { clock += 31e3; await ef.pass('feedy'); }   // the single-chat catch-up pages out (the world's 97 single chats, 3 days old — known, no births needed)
  const recF = () => ef.adapterRecords().adapters.find((r) => r.id === 'feedy');
  ok(recF().feed && recF().feed.catchUp && recF().feed.catchUp.done && recF().feed.mode === 'measuring', 'the first run\'s catch-up is done; the feed is MEASURING', JSON.stringify(recF().feed && { cu: recF().feed.catchUp, mode: recF().feed.mode }));
  // MEASURING: the call count is ②'s arithmetic + the feed's own pages — nothing relaxed
  {
    clock += 900e3; await ef.pass('feedy');   // every row polled once: a clean slate
    const b = new Map(Wf.calls.history); const c0 = Wf.calls.changes;
    const bud0 = ef.budgetOf('feedy');
    clock += 31e3; await ef.pass('feedy');
    const d = diffOf(b);
    const bud1 = ef.budgetOf('feedy');
    ok(d.size === 50 && [...d.keys()].every((k) => tierOf(k) === 'hot') && Wf.calls.changes - c0 === 1, `measuring at +31 s: EXACTLY the 50 hot rows (②) + ONE feed page (${d.size} + ${Wf.calls.changes - c0})`, JSON.stringify({ d: d.size, pages: Wf.calls.changes - c0 }));
    ok(bud1.spent - bud0.spent === 51 && bud1.spentBy.timer - bud0.spentBy.timer === 51 && bud1.spentBy.owner === bud0.spentBy.owner, 'the feed page is counted in the minute\'s budget and charged to the TIMER (50 fetches + 1 page)', JSON.stringify([bud0, bud1]));
  }
  // TRAFFIC: the owner's day on the hot rows — the feed finds every message (after its lag) ⇒ CARRYING, measured
  let mid = 0;
  const traffic = (n, lagAgo = 25e3) => { for (let i = 0; i < n; i++) { const x = Wf.convs.get(`c${String((mid * 7 + i) % 50).padStart(4, '0')}`); x.recs.push({ vendorId: `${x.id}-live${++mid}`, at: clock - lagAgo - i * 10, author: { id: 'u-1', name: 'Brook' }, text: `live ${mid}`, attachments: [] }); } };
  for (let round = 0; round < 14; round++) { clock += 31e3; if (round < 10) traffic(30); await ef.pass('feedy'); }
  const vf = ef.adapterView(recF()).feed;
  ok(vf.state === 'carrying' && vf.measured.total >= 200 && vf.measured.missed === 0, `the feed found every one of ${vf.measured.total} fetched messages ⇒ CARRYING (≥ 200 samples, ≤ 2 % missed)`, JSON.stringify(vf.measured));
  // CARRYING: at +31 s ONLY the watched + owed rows; the net at 5 min (owner decision 4); the cold ones at 15 min
  {
    clock += 900e3; await ef.pass('feedy');   // a clean slate again
    await ef.watch('feedy', 'c0003');
    const b = new Map(Wf.calls.history);
    clock += 31e3; await ef.watch('feedy', 'c0003'); await ef.pass('feedy');
    let d = diffOf(b);
    ok(d.size <= 1 && [...d.keys()].every((k) => k === 'c0003'), `carrying at +31 s: the 50 hot rows are NOT polled — only the open window (${[...d.keys()].join(',') || 'none'})`, JSON.stringify([...d.keys()]));
    const traffic2 = () => { const x = Wf.convs.get('c0120'); x.recs.push({ vendorId: `c0120-owed${++mid}`, at: clock - 25e3, author: { id: 'u-2', name: 'Cass' }, text: 'owed', attachments: [] }); };
    const b2 = new Map(Wf.calls.history);
    clock += 31e3; traffic2(); await ef.watch('feedy', 'c0003'); await ef.pass('feedy');
    d = diffOf(b2);
    ok(d.has('c0120') && [...d.keys()].every((k) => k === 'c0120' || k === 'c0003'), 'a WARM row the search named is fetched at once (its owed mark) — nothing else but the open window', JSON.stringify([...d.keys()]));
    const b3 = new Map(Wf.calls.history);
    clock += 240e3; await ef.pass('feedy');
    d = diffOf(b3);
    ok(d.size >= 245 && [...d.keys()].every((k) => tierOf(k) !== 'cold'), `the 5-minute net: ${d.size} hot + warm rows polled together, no cold one`, JSON.stringify(d.size));
    ok(ef.cadenceOf('feedy', 'c0500').seconds === 900 && ef.cadenceOf('feedy', 'c0001').seconds === 300 && ef.cadenceOf('feedy', 'c0001').source === 'feed-safety', 'carrying: a hot row relaxes to 300 s, a cold row stays at 900 (never polled MORE)');
    const perMin = 2 + 250 / 5 + 623 / 15;
    ok(Math.round(perMin) === 94, `the carrying arithmetic: 2 feed pages + 250 rows ÷ 5 min + 623 ÷ 15 min ≈ ${perMin.toFixed(1)} requests/min (② was ≈ 182) — plus the owed fetches real traffic causes`);
  }
  // A BURST: 600 new messages in one window ⇒ ≤ 10 feed pages in any 60 s, the window continues across passes, a
  // restart keeps the feed's window and every owed mark
  {
    clock += 60e3;
    const p0 = (Wf.calls.feedAt || []).length;
    for (let i = 0; i < 600; i++) { const x = Wf.convs.get(`c${String(300 + (i % 400)).padStart(4, '0')}`); x.recs.push({ vendorId: `${x.id}-burst${i}`, at: clock - 25e3 - (i % 5) * 1000, author: { id: 'u-3', name: 'Dee' }, text: `burst ${i}`, attachments: [] }); }
    clock += 1000;
    // the process "dies" at the first fetch after the feed's pages (the owed marks written, nothing fetched yet)
    const dying = ef;
    Wf.onHistory = () => { Wf.onHistory = null; dying.stop(); };
    await ef.pass('feedy');
    const win1 = recF().feed.window;
    const owed1 = Object.values(ef.store.index.live()).filter((e) => e.adapterId === 'feedy' && e.feedOwedAt).length;
    ok(win1 && (Wf.calls.feedAt || []).length - p0 === 5 && owed1 > 0, `one pass reads ${(Wf.calls.feedAt || []).length - p0} pages (the per-pass bound), leaves the window IN FLIGHT and ${owed1} owed marks — then the process dies at its first fetch`, JSON.stringify(win1));
    // restart mid-window: the window and the owed marks are on disk
    ({ eng: ef } = mkEngine('feed', { kinds: [kf], now, dataDir: dirF }));
    const win2 = recF().feed.window;
    const owed2 = Object.values(ef.store.index.live()).filter((e) => e.adapterId === 'feedy' && e.feedOwedAt).length;
    ok(win2 && win2.from === win1.from && win2.to === win1.to && owed2 === owed1, `a RESTART keeps the feed's window (${win2 && win2.from}…${win2 && win2.to}) and every owed mark (${owed2} of ${owed1})`);
    for (let i = 0; i < 6 && recF().feed.window; i++) { clock += 31e3; await ef.pass('feedy'); }
    const at = (Wf.calls.feedAt || []).slice(p0).sort((a, b) => a - b);
    let worst = 0; for (let i = 0, j = 0; j < at.length; j++) { while (at[j] - at[i] >= 60e3) i++; worst = Math.max(worst, j - i + 1); }
    const burstIn = [...Wf.convs.values()].filter((x) => x.recs.some((m) => /-burst/.test(m.vendorId)));
    const fetched = burstIn.filter((x) => ef.store.readTail('feedy', x.id, { limit: 100 }).some((r) => /-burst/.test(r.vendorId))).length;
    ok(!recF().feed.window && worst <= 10 && fetched === burstIn.length, `the burst: ${at.length} pages, never more than 10 in any 60 s (worst ${worst}); the window completed across passes (and a restart); every one of ${burstIn.length} conversations fetched`, JSON.stringify({ pages: at.length, worst, fetched }));
  }
  // A SEARCH THAT MISSES 5 % ⇒ DEMOTED, and ②'s arithmetic returns by itself
  {
    Wf.feed.dropRate = 0.05;
    for (let round = 0; round < 24; round++) { clock += 31e3; traffic(40); await ef.pass('feedy'); }
    const v2 = ef.adapterView(recF()).feed;
    ok(v2.state === 'demoted' && v2.measured.rate > 0.02 && recF().feed.lastFlip && recF().feed.lastFlip.to === 'demoted', `the search hid 5 % of new messages; the 5-minute net found them ⇒ DEMOTED (${v2.measured.missed} of ${v2.measured.total})`, JSON.stringify(v2.measured));
    ok(ef.cadenceOf('feedy', 'c0001').seconds === 30 && ef.cadenceOf('feedy', 'c0001').source === 'tier', 'demoted: a hot row is back at 30 s (② returns — the fallback needs no code of its own)');
  }
  ef.stop();
}

// ═══ ⑪ negative controls ═══════════════════════════════════════════════════
console.log('⑪ controls: the old discovery bound, a scheduler that polls everything');
{
  const M = mutantCopies('chan-agg', REPO);
  const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  // (a) the pre-fix discovery: every pass restarts the cursor, 5 pages at most
  const discOld = esrc.replace('const DISCOVERY_MAX_PAGES = 200;', 'const DISCOVERY_MAX_PAGES = 5;').replace('    if (!d.cursor) d.startedAt = now();', '    d.cursor = null; d.startedAt = now();');
  ok(discOld !== esrc && discOld.includes('DISCOVERY_MAX_PAGES = 5'), 'CONTROL setup: the pre-fix discovery is reconstructed from the shipped bytes');
  const E1 = M.load('src/server/channels-engine.js', discOld, 'disc5');
  const Wc = makeWorld(clock, { n: 873 });
  const dirC = path.join(ROOT, 'ctl-disc');
  seedAccounts(dirC, [['many', 'many']]);
  const regC = CH.createChannelRegistry(); regC.register(worldModule('many', Wc));
  const ec = E1.create({ dataDir: dirC, registry: regC, env: {}, now, broadcast: () => {}, log: quiet });
  for (let i = 0; i < 3; i++) await ec.pass('many', { force: true });
  const seen = Object.values(ec.store.index.live()).length;
  ok(seen === 500, `CONTROL: the old bound discovers only 500 of 873 however many passes run (${seen}) — the leg above would go red`);
  ec.stop();
  // (b) a scheduler that makes EVERY conversation due each pass
  const allDue = esrc.replace('      if (all || named) { out.push(', '      if (true) { out.push(');
  ok(allDue !== esrc, 'CONTROL setup: a poll-everything scheduler is reconstructed');
  const E2 = M.load('src/server/channels-engine.js', allDue, 'alldue');
  const Wd = makeWorld(clock, { n: 300, hot: 20, warm: 30 });
  const dirD = path.join(ROOT, 'ctl-due');
  seedAccounts(dirD, [['many', 'many']]);
  const regD = CH.createChannelRegistry(); regD.register(worldModule('many', Wd));
  const ed = E2.create({ dataDir: dirD, registry: regD, env: {}, now, broadcast: () => {}, log: quiet });
  await ed.pass('many', { force: true });
  const b0 = historyCalls(Wd);
  clock += 31e3;
  await ed.pass('many');
  const polled = historyCalls(Wd) - b0;
  ok(polled === 300, `CONTROL: a poll-everything scheduler sends ${polled} requests at +31 s where the real one sends 20 — the arithmetic leg would go red`);
  ed.stop();
  // lane lark-search-poll (c): a carrying feed that ignores `watched` — an OPEN window polled at the relaxed net
  {
    const CAPS_SRC = fs.readFileSync(path.join(REPO, 'src/channel-caps.js'), 'utf-8');
    const WLINE = "    if (watched) return { seconds: clamp(T.hotSec), tier, source: 'tier', paused: false };";
    ok(CAPS_SRC.split(WLINE).length === 2, 'CONTROL setup: the carrying feed\'s open-window line is spelled once');
    const capsCopy = M.write('src/channel-caps.js', CAPS_SRC.replace(WLINE, ''), null, { esm: false, name: `caps-nowatch-${process.pid}` });
    const E3 = M.load('src/server/channels-engine.js', esrc.replace("const caps = require('../channel-caps.js');", `const caps = require(${JSON.stringify(capsCopy)});`), 'feed-nowatch');
    const Wn = makeWorld(clock, { n: 4, hot: 4, warm: 0 });
    Wn.clock = () => clock;
    const dirN = path.join(ROOT, 'ctl-nowatch');
    seedAccounts(dirN, [['feedy', 'feedy']]);
    const regN = CH.createChannelRegistry(); regN.register(worldModule('feedy', Wn, { feed: true }));
    const en3 = E3.create({ dataDir: dirN, registry: regN, env: {}, now, broadcast: () => {}, log: quiet });
    await en3.pass('feedy', { force: true });
    const r3 = en3.adapterRecords().adapters[0];
    r3.feed = { ...(r3.feed || {}), mode: 'carrying', lastOkAt: clock };
    await en3.watch('feedy', 'c0001');
    const cw = en3.cadenceOf('feedy', 'c0001');
    ok(cw.seconds === 300, `CONTROL: a copy whose carrying feed ignores the open window polls it at the relaxed ${cw.seconds} s — the "open window keeps 30 s" legs (⑫, test-channel-caps, test-channels-engine) would go red`, JSON.stringify(cw));
    en3.stop();
  }
  // lane lark-search-poll (d): owed marks kept in MEMORY only (the pre-design shape: `e.dueNow`) — a restart between the
  // feed and the fetch loses the hit
  {
    const OWED = '          if (en) en.feedOwedAt = Math.max(Number(en.feedOwedAt) || 0, observed);';
    ok(esrc.split(OWED).length === 2, 'CONTROL setup: the durable owed write is spelled once');
    const runOwed = async (EM, tag) => {
      const Wo = makeWorld(clock, { n: 3, hot: 0, warm: 0 });
      Wo.clock = () => clock;
      Wo.noListingLastAt = true;   // like Lark's: the restart's discovery cannot make the row hot by itself
      const dirO = path.join(ROOT, `ctl-owed-${tag}`);
      seedAccounts(dirO, [['feedy', 'feedy']]);
      const mkO = () => { const reg = CH.createChannelRegistry(); reg.register(worldModule('feedy', Wo, { feed: true })); return EM.create({ dataDir: dirO, registry: reg, env: {}, now, broadcast: () => {}, log: quiet }); };
      let eo = mkO();
      await eo.pass('feedy', { force: true });
      clock += 31e3; await eo.pass('feedy');
      const x = Wo.convs.get('c0002');
      // inside the NEXT pass's window [cursor − 60 s, now + 31 s] but older than the window AFTER it (which starts 60 s
      // before that pass's end): once the cursor has moved past it, only a durable owed mark can still find it
      x.recs.push({ vendorId: 'c0002-hit', at: clock - 41e3, author: { id: 'u-1', name: 'A' }, text: 'the hit', attachments: [] });
      Wo.failNext = null;
      Wo.onHistory = () => { Wo.onHistory = null; Wo.failNext = 'transport'; };   // the fetch after the feed page dies (a crash stand-in)
      clock += 31e3; await eo.pass('feedy');
      eo.stop();
      Wo.failNext = null;
      clock += 31e3;
      eo = mkO();
      await eo.pass('feedy');
      const got = eo.store.readTail('feedy', 'c0002', { limit: 50 }).some((r) => r.vendorId === 'c0002-hit');
      eo.stop();
      return got;
    };
    const realOwed = await runOwed(ENG, 'real');
    const memOwed = await runOwed(M.load('src/server/channels-engine.js', esrc.replace(OWED, '          if (en) e.dueNow.add(en.key);'), 'owed-in-memory'), 'mem');
    ok(realOwed && !memOwed, `CONTROL: owed marks kept in memory only — the restart loses the hit (real ${realOwed}, in-memory copy ${memOwed}); the durable mark is what finds it`);
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(r.pass, r.name, r.detail);
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

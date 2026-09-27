#!/usr/bin/env node
// A PICTURE THE VENDOR SENT IS SHOWN AS A PICTURE (R3, 2026-09-26 — the owner
// on the aggregated-IM release: "lark图像不能预览吗？"; design
// docs/design-communication-panel.zh.md §23; gate row `test-channels-images`, fast).
//
//   ① THE RECORD: Lark's image message and every `img` / `media` inside a rich
//     text (wrapped in a locale key or not) become attachments with mime
//     `image/*` / `video/*`, a stable id and the placeholder token the text
//     carries for them; channel-record keeps `placeholder` only when declared
//     (the 4-field shape otherwise) and neuters / bounds it like every peer string
//   ② THE PURE DECISIONS (src/channel-attachments.js): the fetch verdict's
//     ORDER (cache first · a remembered refusal · ours only · fetchable ·
//     enabled · joined · the back-off · the budget · fetch), how long a
//     refusal is remembered, the thumbnail's next step (retry after the wait
//     twice, then the NAMED chip; a file that is there but no raster = the
//     download chip), the text line a drawn picture leaves
//   ③ THE ENGINE THROUGH THE ROUTE (a real express server on a free port, the
//     REAL store, a scripted adapter that COUNTS every call): cache-first with
//     the budget spent; five concurrent first requests = ONE vendor call and
//     ONE charge; a forbidden picture is REMEMBERED (no second call) until the
//     person's Retry; a rate limit is the ACCOUNT's (the next picture waits it
//     out with no call) and answers 429 + Retry-After; every refusal is
//     `no-store`; a picture older than the newest 5000 records is found by its
//     message; a disabled account fetches nothing; a cache HIT no longer
//     rewrites the LRU ledger (coalesced, flushed on close)
//   ④ NEGATIVE CONTROLS (scripts/mutant-copy.mjs — scratch copies, never src/):
//     an engine without the single-flight join, an engine that never
//     remembers a refusal, a store that writes the ledger on every hit, a
//     thumbnail verdict with no retry limit — each turns its own leg red
//
// Zero vendor calls; per-pid scratch dirs (scripts/scratch.mjs).
// Run: node scripts/test-channels-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const Att = require(path.join(REPO, 'src/channel-attachments.js'));
const lark = require(path.join(REPO, 'src/channels/lark.js'));
const REC = require(path.join(REPO, 'src/channel-record.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const express = require('express');
const ATT_SRC = fs.readFileSync(path.join(REPO, 'src/channel-attachments.js'), 'utf-8');
const ENGINE_SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
const STORE_SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf-8');

const ROOT = scratch('chan-images');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() {}, warn() {}, error() {} };
const MUT = mutantCopies('chan-images', REPO);

// ═══ ① the record ═════════════════════════════════════════════════════════
console.log('① the record: an image / a picture in a rich text is an attachment with its placeholder');
{
  const item = (msg_type, content) => ({ message_id: 'om_1', msg_type, create_time: '1700000000000', sender: { id: 'ou_a', sender_type: 'user' }, body: { content: JSON.stringify(content) } });
  const img = item('image', { image_key: 'img_v3_a' });
  ok(lark.textOf(img) === '[image]' && JSON.stringify(lark.attachmentsOf(img)) === JSON.stringify([{ id: 'img_v3_a', name: null, bytes: null, mime: 'image/*', placeholder: '[image]' }]), 'an image message: text "[image]", ONE attachment `image/*` keyed by its image_key, its placeholder the SAME token — and NO invented English name (the window words "image" per device; the cache keeps the resource\'s own file name)');
  const post = item('post', { title: 'deploy', content: [[{ tag: 'text', text: 'look ' }, { tag: 'img', image_key: 'img_v3_b' }], [{ tag: 'media', file_key: 'file_v3_c', file_name: 'demo.mp4' }]] });
  const pa = lark.attachmentsOf(post);
  ok(pa.length === 2 && pa[0].id === 'img_v3_b' && pa[0].mime === 'image/*' && pa[0].placeholder === '[image]' && pa[1].id === 'file_v3_c' && pa[1].mime === 'video/*' && pa[1].placeholder === '[video]', 'a rich text: its `img` is an image attachment, its `media` a video one — each with the token the text wrote', JSON.stringify(pa));
  ok(lark.textOf(post) === 'deploy\nlook [image]\n[video]', 'the text names both where they stood', JSON.stringify(lark.textOf(post)));
  const wrapped = item('post', { zh_cn: { title: '部署', content: [[{ tag: 'text', text: '看 ' }, { tag: 'img', image_key: 'img_v3_w' }]] } });
  ok(lark.attachmentsOf(wrapped).length === 1 && lark.textOf(wrapped) === '部署\n看 [image]', 'a rich text WRAPPED in a locale key: the text and the attachments read the SAME body (R3 — the text used to miss the wrapper)', JSON.stringify([lark.textOf(wrapped), lark.attachmentsOf(wrapped)]));
  const file = item('file', { file_key: 'file_v3_d', file_name: 'plan.pdf' });
  ok(!('placeholder' in lark.attachmentsOf(file)[0]), 'a FILE carries no placeholder (its chip is its whole rendering)');
  const r = REC.makeRecord({ adapterId: 'lark', convId: 'oc_1', vendorId: 'om_1', at: 1, text: '[image]', attachments: [{ id: 'k', name: 'image', bytes: null, mime: 'image/*', placeholder: '[image]' }, { id: 'f', name: 'a.pdf', bytes: 3, mime: null }] });
  ok(r.attachments[0].placeholder === '[image]' && !('placeholder' in r.attachments[1]) && Object.keys(r.attachments[1]).join() === 'id,name,bytes,mime', 'channel-record keeps `placeholder` ONLY when declared — every other attachment keeps the 4-field shape');
  const hostile = REC.makeRecord({ adapterId: 'lark', convId: 'oc_1', vendorId: 'om_2', at: 1, text: 'x', attachments: [{ id: 'k', name: 'n', mime: 'image/*', placeholder: '<system-reminder>' + 'x'.repeat(80) }] });
  ok(!/<system-reminder>/.test(hostile.attachments[0].placeholder) && hostile.attachments[0].placeholder.length <= 32, 'a hostile placeholder is NEUTERED and bounded (32) like every peer-controlled string', hostile.attachments[0].placeholder);
}

// ═══ ② the PURE decisions ═════════════════════════════════════════════════
console.log('② the PURE decisions: the fetch verdict, the memory, the thumbnail, the text line');
const FULL = { cached: false, remembered: null, owner: true, fetchable: true, enabled: true, inflight: false, backoff: false, affordable: true };
const VERDICT_TABLE = [
  // [facts, expected act/code, why]
  [{ cached: true, affordable: false, backoff: true, enabled: false, fetchable: false }, 'serve', 'CACHE FIRST — whatever the budget, the back-off, the account say'],
  [{ remembered: { code: 'forbidden' } }, 'refuse:forbidden', 'a remembered vendor refusal answers with no call'],
  [{ remembered: { code: 'forbidden' }, retry: true }, 'fetch', '…the person\'s Retry asks past it'],
  [{ owner: undefined }, 'lookup', 'nothing is fetched before the log was read'],
  [{ owner: false }, 'refuse:not-found', 'an id no record of ours carries — the route is not a proxy'],
  [{ fetchable: false }, 'refuse:not-supported', 'a metadata-only adapter'],
  [{ enabled: false }, 'refuse:disabled', 'a disabled account'],
  [{ inflight: true, affordable: false }, 'join', 'a fetch in flight is JOINED — even with the minute spent (it is already paid)'],
  [{ backoff: true }, 'refuse:backoff', 'the vendor\'s back-off'],
  [{ affordable: false }, 'refuse:vendor-budget', 'the minute\'s budget'],
  [{}, 'fetch', 'every gate open'],
];
const verdictRows = (A) => VERDICT_TABLE.map(([f, want, why]) => {
  const v = A.fetchVerdict({ ...FULL, ...f });
  const got = v.act === 'refuse' ? `refuse:${v.code}` : v.act;
  return [why, got === want, `${JSON.stringify(f)} → ${got} (want ${want})`];
});
for (const [n, p, d] of verdictRows(Att)) ok(p, 'verdict: ' + n, d);
const THUMB_TABLE = [
  [{ ok: false, code: 'vendor-budget', retryAfterSec: 23 }, 0, 'retry:23', 'a spent budget: the picture waits the minute out'],
  [{ ok: false, code: 'backoff', retryAfterSec: 400 }, 1, 'retry:60', 'a back-off: the wait is capped at a minute'],
  [{ ok: false, code: 'rate-limited' }, 2, 'chip:rate-limited', 'after TWO retries of its own a thumbnail stops and names the reason'],
  [{ ok: false, code: 'forbidden' }, 0, 'chip:forbidden', 'a refusal waiting cannot fix is the chip at once'],
  [{ ok: true, mime: 'application/octet-stream' }, 0, 'download:no-preview', 'a file that IS there but is no raster picture (HEIC …) is the download chip'],
  [null, 0, 'chip:unreachable', 'our server unreachable: said, never silent'],
];
const thumbRows = (A) => THUMB_TABLE.map(([answer, attempt, want, why]) => {
  const v = A.thumbVerdict(answer, attempt);
  const got = v.kind === 'retry' ? `retry:${v.afterSec}` : v.download ? `download:${v.code}` : `chip:${v.code}`;
  return [why, got === want, `${JSON.stringify(answer)} #${attempt} → ${got} (want ${want})`];
});
for (const [n, p, d] of thumbRows(Att)) ok(p, 'thumbnail: ' + n, d);
ok(Att.negativeTtlMs('forbidden') === Att.NEGATIVE_TTL.permanent && Att.negativeTtlMs('rate-limited', { retryAfterSec: 7 }) === 7000 && Att.negativeTtlMs('vendor-budget') === 0 && Att.negativeTtlMs('backoff') === 0, 'memory: a vendor\'s refusal is remembered (10 min for good, its own wait for a rate limit); the budget / back-off are never remembered (the gate answers them again for free)');
ok(Att.bodyShown('[image]', ['[image]']) === '' && Att.bodyShown('look [image]', ['[image]']) === 'look' && Att.bodyShown('[image]\n[image]', ['[image]']) === '[image]' && Att.bodyShown('[image]', []) === '[image]' && Att.bodyShown('a\n[video]\n\nb', ['[video]']) === 'a\n\nb', 'the text line: each DRAWN picture removes ONE occurrence of its token; an undrawn one keeps it; the line disappears when nothing is left');

// ═══ ③ the engine through the route ═══════════════════════════════════════
console.log('③ the engine through the route: cache first, one flight, remembered refusals, the account\'s rate limit');
let clock = Date.UTC(2026, 8, 26, 12, 0, 0);
const now = () => clock;
/** A scripted world: one conversation, pictures scripted per id, every call counted. */
function makeWorld() {
  const recs = [];
  const add = (vendorId, attachments, at = clock - 60e3 + recs.length) => recs.push({ vendorId, at, author: { id: 'u1', name: 'Ada', isSelf: false, isBot: false }, text: '[image]', attachments });
  const calls = { attach: [], history: 0 };
  return { recs, add, calls, script: {}, gate: null };
}
function worldModule(kind, W, { budgetDefault = 100 } = {}) {
  return {
    kind,
    caps: { ...fake.fakePoll.caps, receive: 'poll', attachments: 'fetch', olderHistory: 'page', budget: { unit: 'request', default: budgetDefault, settingKey: null, metered: true } },
    create(record, deps) {
      const meter = deps.meter || (() => {});
      const rec = (m) => REC.makeRecord({ adapterId: record.id, convId: 'room', vendorId: m.vendorId, at: m.at, author: m.author, text: m.text, attachments: m.attachments, threadKey: 'room', raw: {} });
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations() { meter(1); return { conversations: [REC.makeConversation({ id: 'room', title: 'Room', kind: 'group', lastAt: W.recs.length ? W.recs[W.recs.length - 1].at : null })], cursor: null, complete: true }; },
        async convCaps() { meter(1); return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
        async history(id, { anchor = null, limit = 50 } = {}) {
          meter(1); W.calls.history++;
          const idx = anchor ? W.recs.findIndex((m) => m.vendorId === anchor) + 1 : 0;
          const pending = W.recs.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page.map(rec), anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: drained, complete: drained };
        },
        async older() { meter(1); return { records: [], exhausted: true }; },
        async fetchAttachment(id, { messageId, attachmentId } = {}) {
          meter(1); W.calls.attach.push(attachmentId);
          if (W.gate) await W.gate;
          const s = W.script[attachmentId] || 'ok';
          if (s === 'forbidden') throw new CH.ChannelError('forbidden', `vendor refuses ${attachmentId}`);
          if (s === 'rate-limited') throw new CH.ChannelError('rate-limited', 'HTTP 429', { retryable: true, detail: { retryAfterSec: 9 } });
          return { data: fake.fixturePng(attachmentId), mime: 'image/png', name: 'image' };
        },
      };
    },
  };
}
function seed(dataDir, id, kind) {
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id, kind, label: id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: true, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null }] }));
}
async function rig(name, { engineMod = ENG, budgetDefault = 100 } = {}) {
  const W = makeWorld();
  for (let i = 0; i < 8; i++) W.add(`m${i}`, [{ id: `pic-${i}`, name: 'image', mime: 'image/*', placeholder: '[image]' }]);
  const registry = CH.createChannelRegistry();
  registry.register(worldModule('pics', W, { budgetDefault }));
  const dataDir = path.join(ROOT, name);
  seed(dataDir, 'pics', 'pics');
  const events = [];
  const eng = engineMod.create({ dataDir, registry, env: {}, now, broadcast: (m) => events.push(m), serverSetting: () => undefined, liveSessions: () => [], log: quiet });
  await eng.pass('pics', { force: true });
  const app = express();
  app.use(express.json());
  // the routes module holds ONE engine (`setup`): each rig loads its own copy of it, so rigs alive together never share one
  const routesPath = require.resolve(path.join(REPO, 'src/routes/channels.js'));
  delete require.cache[routesPath];
  const r = require(routesPath);
  delete require.cache[routesPath];
  r.setup({ getEngine: () => eng });
  app.use(r.router);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (id, q = '&inline=1') => { const res = await fetch(`${base}/api/channels/pics/room/attachment/${encodeURIComponent(id)}?msg=m${id.split('-')[1]}${q}`); const buf = Buffer.from(await res.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString('utf-8')); } catch {} return { status: res.status, headers: res.headers, buf, json }; };
  const spent = () => eng.budgetOf('pics').spent;
  return { W, eng, server, get, spent, dataDir, events };
}
{
  const R = await rig('main', { budgetDefault: 6 });
  ok(R.W.calls.history >= 1 && R.eng.store.readTail('pics', 'room', { limit: 50 }).length === 8, 'FIXTURE: one conversation of 8 pictures ingested (no picture fetched by the ingest)');
  // r-verify (2026-09-26): an ingest that queued `attachment()` per fresh picture for the NEXT tick passed a
  // synchronous count — the pin settles first (the control below is exactly that engine)
  await new Promise((r) => setTimeout(r, 80));
  ok(R.W.calls.attach.length === 0, 'ON DEMAND: the ingest fetched NO bytes — a picture is fetched when a window asks for it (settled)');
  // single flight: five concurrent first requests
  let open; R.W.gate = new Promise((r) => { open = r; });
  const before = R.spent();
  const five = Promise.all([1, 2, 3, 4, 5].map(() => R.get('pic-0')));
  await sleep(50); open(); R.W.gate = null;
  const got = await five;
  ok(got.every((x) => x.status === 200 && x.buf.equals(got[0].buf) && x.headers.get('content-type') === 'image/png') && R.W.calls.attach.filter((x) => x === 'pic-0').length === 1, `SINGLE FLIGHT: five concurrent first requests of one picture = ONE vendor call (${R.W.calls.attach.filter((x) => x === 'pic-0').length}), five whole answers`);
  ok(R.spent() - before === 1, `…and ONE charge to the account's minute (${R.spent() - before})`);
  // spend the minute: 6 requests/min, the ingest spent some
  let i = 1;
  while (R.spent() < 6 && i < 8) { await R.get(`pic-${i}`); i++; }
  const refused = await R.get(`pic-${i}`);
  ok(refused.status === 429 && refused.json && refused.json.code === 'vendor-budget' && Number(refused.headers.get('retry-after')) > 0 && refused.headers.get('cache-control') === 'no-store', 'BUDGET-CHARGED: past the minute a new picture is refused 429 vendor-budget with Retry-After — and `no-store`, so the thumbnail\'s retry asks again', JSON.stringify([refused.status, refused.json && refused.json.code, refused.headers.get('retry-after'), refused.headers.get('cache-control')]));
  const callsNow = R.W.calls.attach.length;
  const cached = await R.get('pic-0');
  ok(cached.status === 200 && R.W.calls.attach.length === callsNow, 'CACHE FIRST: a cached picture is served with the minute spent — no call');
  // the next minute: a forbidden picture is REMEMBERED
  clock += 61e3;
  R.W.script['pic-7'] = 'forbidden';
  const f1 = await R.get('pic-7');
  const c1 = R.W.calls.attach.filter((x) => x === 'pic-7').length;
  const f2 = await R.get('pic-7');
  const c2 = R.W.calls.attach.filter((x) => x === 'pic-7').length;
  ok(f1.status === 502 && f1.json.code === 'forbidden' && f2.json.code === 'forbidden' && f2.json.remembered === true && c1 === 1 && c2 === 1, `REMEMBERED: a picture the vendor refused is refused again from memory — ${c2} vendor call(s) for two asks`, JSON.stringify([f1.json, f2.json]));
  R.W.script['pic-7'] = 'ok';
  const f3 = await R.get('pic-7', '&inline=1&retry=1');
  ok(f3.status === 200 && R.W.calls.attach.filter((x) => x === 'pic-7').length === 2, 'the person\'s Retry (`retry=1`) asks past the memory — and the picture draws');
  // a rate limit is the ACCOUNT's
  clock += 61e3;
  const R2 = await rig('rl');
  R2.W.script['pic-1'] = 'rate-limited';
  const rl = await R2.get('pic-1');
  ok(rl.status === 429 && rl.json.code === 'rate-limited' && Number(rl.headers.get('retry-after')) === 9, 'a vendor rate limit on a picture is a 429 with the vendor\'s own wait', JSON.stringify([rl.status, rl.json, rl.headers.get('retry-after')]));
  const nb = R2.W.calls.attach.length;
  const other = await R2.get('pic-2');
  ok(other.status === 429 && other.json.code === 'backoff' && R2.W.calls.attach.length === nb, '…and it is the ACCOUNT\'s: the next picture waits it out with NO vendor call (`backoff`)', JSON.stringify(other.json));
  clock += 10e3;
  R2.W.script['pic-1'] = 'ok';
  ok((await R2.get('pic-2')).status === 200 && (await R2.get('pic-1')).status === 200, '…and once the wait is over both draw');
  // a disabled account fetches nothing
  await R2.eng.setEnabled('pics', false);
  const dis = await R2.get('pic-5');
  ok(dis.status === 409 && dis.json.code === 'disabled' && !R2.W.calls.attach.includes('pic-5'), 'a DISABLED account fetches nothing (409 disabled, no call)');
  await R2.eng.setEnabled('pics', true);
  // THE LRU LEDGER: a hit no longer rewrites it
  const lruPath = path.join(R.dataDir, 'channels', 'attachments', 'pics', 'lru.json');
  const ino0 = lruPath ? fs.statSync(lruPath).ino : null;
  for (let k = 0; k < 10; k++) await R.get('pic-0');
  const ino1 = lruPath ? fs.statSync(lruPath).ino : null;
  ok(lruPath && ino0 === ino1, 'COALESCED: ten cache hits in a row write the LRU ledger ZERO times (it was one sync atomic write per thumbnail)', String(lruPath));
  R.eng.store.lruFlush();
  const led = JSON.parse(fs.readFileSync(lruPath, 'utf-8'));
  ok(fs.statSync(lruPath).ino !== ino0 && Object.values(led.items).some((x) => x.usedAt === clock), '…and the recency the hits moved is on disk after the coalesced flush');
  // a picture older than the newest 5000 records
  const R3 = await rig('deep');
  // 5100 newer records written straight into the REAL store (fixture seeding — the log is what the route reads)
  const newer = [];
  for (let k = 0; k < 5100; k++) newer.push(REC.makeRecord({ adapterId: 'pics', convId: 'room', vendorId: `n${k}`, at: clock - 30e3 + k, author: { id: 'u1', name: 'Ada' }, text: `line ${k}`, threadKey: 'room', raw: {} }));
  R3.eng.store.appendRecords('pics', 'room', newer);
  const tail = R3.eng.store.readTail('pics', 'room', { limit: 5000 });
  ok(!tail.some((r) => r.vendorId === 'm0') && R3.eng.store.findRecord('pics', 'room', 'm0') && R3.eng.store.findRecord('pics', 'room', 'm0').attachments[0].id === 'pic-0', 'FIXTURE: the picture\'s message is older than the newest 5000 records, and findRecord names it');
  const deep = await R3.get('pic-0');
  ok(deep.status === 200, 'a picture older than the newest 5000 records is found by ITS MESSAGE (the route names it) and drawn', JSON.stringify([deep.status, deep.json]));
  for (const x of [R, R2, R3]) { x.server.close(); x.eng.stop(); }
}
/** The deep leg as a function of the engine module (the control runs it on a copy). */
async function deepLeg(engineMod, name) {
  const D = await rig(name, { engineMod });
  const newer = [];
  for (let k = 0; k < 5100; k++) newer.push(REC.makeRecord({ adapterId: 'pics', convId: 'room', vendorId: `n${k}`, at: clock - 30e3 + k, author: { id: 'u1', name: 'Ada' }, text: `line ${k}`, threadKey: 'room', raw: {} }));
  D.eng.store.appendRecords('pics', 'room', newer);
  const r = await D.get('pic-0');
  D.server.close(); D.eng.stop();
  return r.status;
}

// ═══ ④ negative controls ══════════════════════════════════════════════════
console.log('④ negative controls (patched copies in this run\'s scratch dir)');
{
  // (a) no single-flight join
  const JOIN = "      case 'join': return attInflight.get(k);";
  ok(ENGINE_SRC.includes(JOIN), 'CONTROL setup: the join is spelled once in the engine');
  // r-verify: the engine whose INGEST prefetches every fresh picture through its own attachment() on the next
  // tick — the settled ON-DEMAND pin reddens on it (it was green before the settle)
  const PREFETCH_ANCHOR = 'if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs);';
  ok(ENGINE_SRC.includes(PREFETCH_ANCHOR), 'CONTROL ingest-prefetch: the edit\'s anchor is in the engine');
  const prefetch = MUT.load('src/server/channels-engine.js', ENGINE_SRC.replace(PREFETCH_ANCHOR, PREFETCH_ANCHOR + ' for (const x of freshRecs) for (const at of x.attachments || []) setTimeout(() => attachment(rec.id, convId, at.id).catch(() => {}), 0);'), 'ingest-prefetch');
  const P = await rig('ctl-prefetch', { engineMod: prefetch });
  await new Promise((r) => setTimeout(r, 80));
  ok(P.W.calls.attach.length > 0, `CONTROL: an engine whose ingest prefetches every picture on the next tick fetched ${P.W.calls.attach.length} — the settled ON-DEMAND pin reddens on it`);
  P.server.close(); try { P.eng.stop(); } catch {}
  const noJoin = MUT.load('src/server/channels-engine.js', ENGINE_SRC.replace("inflight: attInflight.has(k),", 'inflight: false,'), 'no-join');
  const A = await rig('ctl-join', { engineMod: noJoin });
  let open; A.W.gate = new Promise((r) => { open = r; });
  const five = Promise.all([1, 2, 3, 4, 5].map(() => A.get('pic-0')));
  await sleep(50); open(); A.W.gate = null; await five;
  const n = A.W.calls.attach.filter((x) => x === 'pic-0').length;
  ok(n > 1, `CONTROL: an engine without the join fetches the same picture ${n} times — the single-flight leg reddens on it`);
  A.server.close(); A.eng.stop();
  // (b) no memory
  const noMemory = MUT.load('src/server/channels-engine.js', ENGINE_SRC.replace('const remembered = rememberedRefusal(k, t);', 'const remembered = null;'), 'no-memory');
  const B = await rig('ctl-memory', { engineMod: noMemory });
  B.W.script['pic-3'] = 'forbidden';
  await B.get('pic-3'); await B.get('pic-3');
  ok(B.W.calls.attach.filter((x) => x === 'pic-3').length === 2, 'CONTROL: an engine that never remembers asks the vendor again for a refused picture — the remembered leg reddens on it');
  B.server.close(); B.eng.stop();
  // (c) the ledger written on every hit (the pre-R3 store)
  const OLD_HIT = "    if (l.items[k]) { l.items[k].usedAt = now(); try { lruSave(adapterId); } catch (e) { warn('[channels] attachment LRU write failed:', (e && e.message) || e); } }";
  const NEW_HIT = '    if (l.items[k]) { l.items[k].usedAt = now(); lruTouch(adapterId); }';
  ok(STORE_SRC.includes(NEW_HIT), 'CONTROL setup: the coalesced hit is spelled once in the store');
  const oldStorePath = MUT.write('src/channel-store.js', STORE_SRC.replace(NEW_HIT, OLD_HIT), null, { esm: false, name: `store-oldhit-${process.pid}` });
  const engOld = MUT.load('src/server/channels-engine.js', ENGINE_SRC.replace("const { createChannelStore } = require('../channel-store.js');", `const { createChannelStore } = require(${JSON.stringify(oldStorePath)});`), 'old-hit');
  const C = await rig('ctl-lru', { engineMod: engOld });
  await C.get('pic-0');
  const dir = path.join(C.dataDir, 'channels', 'attachments', 'pics');
  const lp = path.join(dir, 'lru.json');
  const i0 = fs.statSync(lp).ino;
  let changes = 0;
  for (let k = 0; k < 5; k++) { await C.get('pic-0'); const ik = fs.statSync(lp).ino; if (ik !== i0) changes++; }
  ok(changes >= 1, `CONTROL: the pre-R3 store rewrites the ledger on the hits (${changes} of 5 changed its inode) — the coalesced leg reddens on it`);
  C.server.close(); C.eng.stop();
  // (d) a thumbnail verdict with no retry limit
  const LIMIT = 'if (TRANSIENT.includes(code) && attempt < AUTO_RETRIES) {';
  ok(ATT_SRC.includes(LIMIT), 'CONTROL setup: the retry limit is spelled once');
  const AttNoLimit = MUT.load('src/channel-attachments.js', ATT_SRC.replace(LIMIT, 'if (TRANSIENT.includes(code)) {'), 'no-limit');
  const bad = thumbRows(AttNoLimit).filter(([, p]) => !p).map(([nm]) => nm);
  ok(bad.length >= 1 && bad.some((x) => /TWO retries/.test(x)), `CONTROL: a thumbnail verdict with no limit retries for ever — its row reddens (${bad.join(' | ')})`);
  // (e) a verdict that fetches before asking the cache
  const AttNoCache = MUT.load('src/channel-attachments.js', ATT_SRC.replace("  if (f.cached) return { act: 'serve', from: 'cache' };\n", ''), 'no-cache');
  ok(verdictRows(AttNoCache).some(([, p]) => !p), 'CONTROL: a verdict that does not serve the cache first reddens the verdict table');
  // (f) an owner lookup that only reads the newest 5000 records (the pre-R3 engine)
  const FIND = '    if (msg) {\n      const byMsg = typeof store.findRecord === \'function\' ? store.findRecord(adapterId, convId, String(msg)) : null;';
  ok(ENGINE_SRC.includes(FIND), 'CONTROL setup: the by-message lookup is spelled once');
  const noFind = MUT.load('src/server/channels-engine.js', ENGINE_SRC.replace(FIND, '    if (false) {\n      const byMsg = null;'), 'no-find');
  const st = await deepLeg(noFind, 'ctl-deep');
  ok(st === 404, `CONTROL: an engine that only scans the newest 5000 records cannot find the picture (${st}) — the deep leg reddens on it`);
  ok((await deepLeg(ENG, 'deep-again')) === 200, '…while the product finds it (the same leg, the real engine)');
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 7 })) ok(x.pass, 'tree: ' + x.name + (x.pass ? '' : ' — ' + x.detail));
}

// ═══ ⑤ wiring pins ════════════════════════════════════════════════════════
console.log('⑤ wiring pins');
{
  const W = fs.readFileSync(path.join(REPO, 'src/lib/channel-window.js'), 'utf-8');
  const R = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf-8');
  ok(/const v = Att\.thumbVerdict\(answer, attempt\);/.test(W) && /Att\.bodyShown\(rec\.text \|\| '', drawn\)/.test(W), 'PIN: the window asks thumbVerdict for a picture that did not draw and bodyShown for the text line');
  ok(/img\.src = `\$\{url\}&inline=1/.test(W) && /img\.onclick = \(\) => showImageOverlay\(img\.src\);/.test(W) && !/innerHTML/.test(W.replace(/^\s*(\/\/|\*).*$/gm, '')), 'PIN: a thumbnail loads through OUR route as a property (img.src), opens THE shared overlay, and the window writes no innerHTML');
  ok(/attachmentReasonText\(code\)/.test(W) && /t\('Retry'\)/.test(W) && /track\('event', 'chan-attachment-failed'/.test(W), 'PIN: the refused chip names its reason, offers Retry, and the failure is reported (telemetry) — never a silent chip');
  ok(/retry: String\(req\.query\.retry \|\| ''\) === '1'/.test(R) && /res\.setHeader\('Cache-Control', 'no-store'\); return readerAnswer\(res, r\);/.test(R), 'PIN: the route passes the person\'s Retry and never lets a browser cache a refusal');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

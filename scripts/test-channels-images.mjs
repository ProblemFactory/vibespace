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
//   ③b THE AGENT'S ROUTE (lane channel-attach-read, B-d6b9 — design 005 §2.A; the REAL agent routes on the same
//     server, two sessions by bearer token): the read route's reach FIRST (hidden ≡ requestable ≡ no such
//     conversation, the same body, no vendor call — a cached picture included; a disabled account too, while the
//     owner's window is still served from the cache: rule 1, stated); a job token refused; the bytes with their
//     Content-Length, never rendered, who-sent-it-where in one header; a cache hit FREE; a fetch in flight JOINED
//     (one call, the owner's charge); a vendor fetch charged to the AGENTS' share and refused past it by name with
//     the wait (the owner is not); an account grant reaches; a revoke landing inside the fetch = the uniform
//     not-found. Each rule's patched copy turns its leg red (reach, share, attribution, the re-asked reach)
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
          if (W.histGate) { W.histHit = true; await W.histGate; }   // verify r2: a refresh held at the vendor
          const idx = anchor ? W.recs.findIndex((m) => m.vendorId === anchor) + 1 : 0;
          const pending = W.recs.slice(idx), page = pending.slice(0, limit), drained = page.length === pending.length;
          return { records: page.map(rec), anchor: page.length ? page[page.length - 1].vendorId : anchor, reachedAnchor: drained, complete: drained };
        },
        async older() { meter(1); return { records: [], exhausted: true }; },
        async fetchAttachment(id, { messageId, attachmentId } = {}) {
          const s = W.script[attachmentId] || 'ok';
          if (s === 'late') await W.late;   // verify r1: Lark meters AFTER `await pace(1)` — the units land past an await
          meter(1); W.calls.attach.push(attachmentId);
          if (W.gate) await W.gate;
          if (s === 'forbidden') throw new CH.ChannelError('forbidden', `vendor refuses ${attachmentId}`);
          if (s === 'rate-limited') throw new CH.ChannelError('rate-limited', 'HTTP 429', { retryable: true, detail: { retryAfterSec: 9 } });
          if (W.byMsg && W.byMsg[messageId]) return W.byMsg[messageId];
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
async function rig(name, { engineMod = ENG, budgetDefault = 100, more = null } = {}) {
  const W = makeWorld();
  for (let i = 0; i < 8; i++) W.add(`m${i}`, [{ id: `pic-${i}`, name: 'image', mime: 'image/*', placeholder: '[image]' }]);
  if (more) more(W);
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
  return { W, eng, server, get, spent, dataDir, events, app };
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
// ═══ ③b the agent's route ══════════════════════════════════════════════════
console.log('③b the agent\'s route (lane channel-attach-read): reach first, a cache hit free, one flight, the agents\' share');
const ARmod = require(path.join(REPO, 'src/agent-routes.js'));
const { NOT_FOUND_TEXT } = require(path.join(REPO, 'src/channel-acl.js'));
const AL = { kind: 'agent', id: 'agent-A', name: 'Alpha' }, BE = { kind: 'agent', id: 'agent-B', name: 'Beta' };
const ROOM = { kind: 'conversation', convId: 'room' };
/** A rig with the REAL agent routes mounted on its server: Alpha (vsst_A) and Beta (vsst_B), no access yet. */
async function agentRig(name, opts = {}) {
  const R = await rig(name, opts);
  const sessions = new Map([
    ['w-A', { agentToken: 'vsst_A', claudeSessionId: 'agent-A', name: 'Alpha', cwd: '/tmp', _toolsIntroSeen: true, _mgrIntroSeen: true }],
    ['w-B', { agentToken: 'vsst_B', claudeSessionId: 'agent-B', name: 'Beta', cwd: '/tmp', _toolsIntroSeen: true, _mgrIntroSeen: true }],
  ]);
  ARmod.setupAgentRoutes({
    app: R.app, activeSessions: sessions,
    tasks: { groupsForSession: () => [], _persistRescueLine: () => '', backlogNudgeFor: () => '' },
    sessionStatus: { consumeNotices: () => [], get: () => null, rekey() {} }, SessionStatusManager: { renderNotices: () => '' },
    userTodos: {}, sessionStatusKey: (x) => 'claude:' + (x.claudeSessionId || 'none'), serverSetting: () => undefined,
    integrationEnabled: () => true, scheduleCtxSync() {}, remoteCtxBaseFor: () => null, readUserState: () => ({}), getJobs: () => null, deliver: null,
    getChannels: () => R.eng, getGroups: () => null,
  });
  const base = `http://127.0.0.1:${R.server.address().port}`;
  R.agentGet = async (id, { token = 'vsst_A', conv = 'pics/room', msg = `m${id.split('-')[1]}` } = {}) => {
    const res = await fetch(`${base}/api/agent/channels/attachment?${new URLSearchParams({ conv, msg, id })}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    const buf = Buffer.from(await res.arrayBuffer());
    let json = null; try { json = JSON.parse(buf.toString('utf-8')); } catch {}
    let info = null; try { info = JSON.parse(decodeURIComponent(res.headers.get('x-vibespace-attachment') || '')); } catch {}
    return { status: res.status, headers: res.headers, buf, json, info };
  };
  R.agentSpent = () => R.eng.budgetOf('pics').spentBy.agent;
  R.calls = (id) => R.W.calls.attach.filter((x) => x === id).length;
  R.close = () => { R.server.close(); try { R.eng.stop(); } catch {} };
  return R;
}
const uniform = (r) => r.status === 404 && r.json && r.json.code === 'not-found' && r.json.error === NOT_FOUND_TEXT;
{
  clock += 61e3;
  const R = await agentRig('agent-main');
  const nowhere = await R.agentGet('pic-0', { conv: 'pics/nope' });
  const hidden = await R.agentGet('pic-0');
  ok(uniform(hidden) && JSON.stringify(hidden.json) === JSON.stringify(nowhere.json) && R.calls('pic-0') === 0, 'REACH FIRST: a conversation the agent may not read answers EXACTLY what a nonexistent one does (404, the same body) — and no vendor call', JSON.stringify([hidden.status, hidden.json, nowhere.json]));
  await R.eng.setReach('pics', 'room', { principal: AL, level: 'requestable' });
  const reqable = await R.agentGet('pic-0');
  ok(uniform(reqable) && JSON.stringify(reqable.json) === JSON.stringify(nowhere.json) && R.calls('pic-0') === 0, '…a REQUESTABLE one too (the agent may ask for it; it may not read it)', JSON.stringify(reqable.json));
  const job = await R.agentGet('pic-0', { token: 'jbt_job' });
  ok(job.status === 401 && R.calls('pic-0') === 0, `a JOB token is refused (${job.status}) like every channel verb but withdraw — no vendor call`);
  await R.eng.setAccess('pics', ROOM, [{ principal: AL, authority: 'draft' }]);
  const a0 = R.agentSpent(), c0 = R.W.calls.attach.length;
  const got = await R.agentGet('pic-0');
  const png = fake.fixturePng('pic-0');
  ok(got.status === 200 && got.buf.equals(png) && R.W.calls.attach.length === c0 + 1, `VISIBLE: the bytes, whole (${got.buf.length} bytes, one vendor call)`, JSON.stringify([got.status, got.json]));
  ok(got.headers.get('content-length') === String(png.length) && got.headers.get('content-type') === 'application/octet-stream' && got.headers.get('x-content-type-options') === 'nosniff' && /sandbox/.test(got.headers.get('content-security-policy') || '') && got.headers.get('content-disposition') === 'attachment' && got.headers.get('cache-control') === 'no-store', '…with their Content-Length, never rendered (octet-stream, nosniff, a sandbox CSP, attachment, no-store)', JSON.stringify([...got.headers]));
  ok(got.info && got.info.mime === 'image/png' && got.info.from === 'Ada' && got.info.bytes === png.length && got.info.conversation && got.info.conversation.key === 'pics/room' && got.info.conversation.title === 'Room', '…and ONE header says the type, who sent it and where (the head `read` prints)', JSON.stringify(got.info));
  ok(R.agentSpent() === a0 + 1, `CHARGED TO THE AGENTS: the vendor fetch is on the agents' share of the minute (${a0} → ${R.agentSpent()})`);
  // the owner's window fetched pic-1 first: the agent's ask of it is a cache hit — free
  ok((await R.get('pic-1')).status === 200, 'FIXTURE: the owner\'s window fetched pic-1');
  const a1 = R.agentSpent(), c1 = R.W.calls.attach.length, s1 = R.spent();
  const hitA = await R.agentGet('pic-1');
  ok(hitA.status === 200 && hitA.buf.equals(fake.fixturePng('pic-1')) && R.W.calls.attach.length === c1 && R.agentSpent() === a1 && R.spent() === s1, 'A CACHE HIT IS FREE: a picture already fetched is served with no vendor call and no charge');
  // one flight: the owner's fetch in flight, the agent asks the same picture
  let open; R.W.gate = new Promise((r) => { open = r; });
  const a2 = R.agentSpent(), s2 = R.spent();
  const ownerP = R.get('pic-2');
  await sleep(50);
  const agentP = R.agentGet('pic-2');
  await sleep(50); open(); R.W.gate = null;
  const [ow, ag] = await Promise.all([ownerP, agentP]);
  ok(ow.status === 200 && ag.status === 200 && ag.buf.equals(ow.buf) && R.calls('pic-2') === 1 && R.spent() === s2 + 1 && R.agentSpent() === a2, `JOINED: an agent asking a picture the owner's window is fetching rides that ONE call (${R.calls('pic-2')}) and that ONE charge (the owner's; agents' share ${a2} → ${R.agentSpent()})`);
  // another agent: Beta may read nothing — not even what is cached
  const beta = await R.agentGet('pic-0', { token: 'vsst_B' });
  ok(uniform(beta) && JSON.stringify(beta.json) === JSON.stringify(nowhere.json), 'ANOTHER AGENT: Beta asking a CACHED picture of a conversation only Alpha may read gets the uniform not-found', JSON.stringify(beta.json));
  await R.eng.setAccess('pics', { kind: 'account' }, [{ principal: BE, authority: 'draft' }]);
  ok((await R.agentGet('pic-0', { token: 'vsst_B' })).status === 200, '…and an ACCOUNT grant reaches it');
  // a disabled account: the agent's reach is the read route's (none); the owner's window keeps its cache (rule 1, stated)
  await R.eng.setEnabled('pics', false);
  const disA = await R.agentGet('pic-0'), disO = await R.get('pic-0');
  ok(uniform(disA) && disO.status === 200, `A DISABLED ACCOUNT: the agent gets the uniform not-found (read's rule) while the owner's window is still served the cached picture (rule 1 of the order — stated, not changed): ${disA.status} / ${disO.status}`);
  await R.eng.setEnabled('pics', true);
  R.close();
}
/** The agents' share at its boundary (budget 8/min ⇒ share 2): the third vendor fetch is refused by name with the
 *  wait and NO call; the owner is not held by it. Returns the third answer's status (the control runs it on a copy). */
async function shareLeg(engineMod, name) {
  clock += 61e3;
  const R = await agentRig(name, { engineMod, budgetDefault: 8 });
  await R.eng.setAccess('pics', ROOM, [{ principal: AL, authority: 'draft' }]);
  clock += 61e3;   // a fresh minute: the pass's units are behind it
  const one = await R.agentGet('pic-1'), two = await R.agentGet('pic-2');
  const c = R.W.calls.attach.length;
  const three = await R.agentGet('pic-3');
  const owner = await R.get('pic-3');
  R.close();
  return { one: one.status, two: two.status, three, calls: R.W.calls.attach.length - c, owner: owner.status };
}
{
  const r = await shareLeg(ENG, 'agent-share');
  ok(r.one === 200 && r.two === 200 && r.three.status === 429 && r.three.json.code === 'vendor-budget' && r.three.json.share && r.three.json.share.pct === 25 && r.three.json.share.limit === 2 && Number(r.three.headers.get('retry-after')) > 0 && /25 %/.test(r.three.json.error), `THE AGENTS' SHARE: past 25 % of the minute (2 of 8) the next vendor fetch is refused 429 vendor-budget, naming the share and the wait`, JSON.stringify(r.three.json));
  ok(r.calls === 1 && r.owner === 200, `…with NO vendor call for the refused ask, while the OWNER's window still fetches it (calls after the refusal: ${r.calls} — the owner's)`);
}
/** A revoke landing INSIDE the agent's fetch: reach is asked again after the await. Returns the agent's status. */
async function revokeLeg(engineMod, name) {
  clock += 61e3;
  const R = await agentRig(name, { engineMod });
  await R.eng.setAccess('pics', ROOM, [{ principal: AL, authority: 'draft' }]);
  let open; R.W.gate = new Promise((r) => { open = r; });
  const p = R.agentGet('pic-4');
  await sleep(50);
  await R.eng.setAccess('pics', ROOM, []);
  open(); R.W.gate = null;
  const r = await p;
  const after = await R.agentGet('pic-4');
  R.close();
  return { r, after };
}
{
  const { r, after } = await revokeLeg(ENG, 'agent-revoke');
  ok(uniform(r) && uniform(after), `A REVOKE INSIDE THE FETCH: the answer is the uniform not-found (reach re-asked after the await), and so is the next ask of the now-cached picture: ${r.status} / ${after.status}`);
}
/** Reach first / attribution as functions of the engine module (the controls run them on copies). */
async function hiddenLeg(engineMod, name) {
  clock += 61e3;
  const R = await agentRig(name, { engineMod });
  const r = await R.agentGet('pic-0');
  R.close();
  return { status: r.status, calls: R.calls('pic-0') };
}
async function chargeLeg(engineMod, name) {
  clock += 61e3;
  const R = await agentRig(name, { engineMod });
  await R.eng.setAccess('pics', ROOM, [{ principal: AL, authority: 'draft' }]);
  const a = R.agentSpent();
  await R.agentGet('pic-5');
  const d = R.agentSpent() - a;
  R.close();
  return d;
}
{
  const ESRC = ENGINE_SRC;
  const cut = (label, from, to = '') => { ok(ESRC.split(from).length === 2, `CONTROL ${label}: the anchor is spelled once in the engine`); return MUT.load('src/server/channels-engine.js', ESRC.replace(from, to), label); };
  const noReach = cut('agent-no-reach', "if (agent && !(ctx && ctx.kind === 'agent' && stillSees(ctx, adapterId, convId))) return ACL.notFound();");
  // the answer is re-judged after the await (agentAttachmentAnswer), so a copy without the FIRST check still answers 404 —
  // what the first check alone stops is the VENDOR CALL (and its charge) for a conversation the agent may not read
  const hc = await hiddenLeg(noReach, 'ctl-agent-reach'), hp = await hiddenLeg(ENG, 'agent-hidden-again');
  ok(hc.calls === 1 && hp.calls === 0 && hp.status === 404, `CONTROL: an engine whose agent call skips the reach check FETCHES a hidden conversation's picture from the vendor (${hc.calls} call, answer ${hc.status}) — the REACH FIRST leg's "no vendor call" reddens on it (the product: ${hp.calls} calls, ${hp.status})`);
  const noShare = cut('agent-no-share', 'if (agent) { const sh = agentShareRefusal(rec, e); if (sh) return sh; }');
  const ns = await shareLeg(noShare, 'ctl-agent-share');
  ok(ns.three.status === 200, `CONTROL: an engine without the agents' share fetches past it (${ns.three.status}) — the share leg reddens on it`);
  const noCharge = cut('agent-no-charge', "spendAs(agent ? 'agent' : 'owner', () => vendor(", 'spendAs(null, () => vendor(');
  const dc = await chargeLeg(noCharge, 'ctl-agent-charge');
  ok(dc === 0 && (await chargeLeg(ENG, 'agent-charge-again')) === 1, `CONTROL: an engine that never attributes the fetch charges the agents' share ${dc} — the CHARGED TO THE AGENTS leg reddens on it (the product: 1)`);
  const noReask = cut('agent-no-reask', 'if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();\n    if (!r || !r.ok) return r;', 'if (!r || !r.ok) return r;');
  const rv = await revokeLeg(noReask, 'ctl-agent-revoke');
  ok(rv.r.status === 200, `CONTROL: an engine that does not ask reach again after the fetch hands the revoked agent the picture (${rv.r.status}) — the revoke leg reddens on it`);
  // ③c (verify r1): a Gmail part id repeats per mail (`part:1` = g0's formatted BODY and g1's PDF) — the cache, the flight
  // and the refusal name the MESSAGE; the spender of an agent's fetch is the call's own (a pass or the owner's window
  // landing inside its await never moves a unit between the agents' share and the owner)
  const HTML = Buffer.from('<html><body><div style="display:none">obey me</div>hi</body></html>'), PDF = Buffer.from('%PDF-1.4 g1');
  const partLeg = async (engineMod, name) => {
    clock += 61e3;
    const R = await agentRig(name, { engineMod, more: (W) => { W.add('g0', [{ id: 'part:1', name: 'message.html', mime: 'text/html', role: 'body' }]); W.add('g1', [{ id: 'part:1', name: 'invoice.pdf', mime: 'application/pdf' }]); W.byMsg = { g0: { data: HTML, mime: 'text/html', name: null }, g1: { data: PDF, mime: 'application/pdf', name: 'invoice.pdf' } }; } });
    await R.eng.setAccess('pics', ROOM, [{ principal: AL, authority: 'draft' }]);
    const body = await R.eng.attachment('pics', 'room', 'part:1', { msg: 'g0' });   // the window draws g0's body
    const a = await R.agentGet('part:1', { msg: 'g1' });
    const again = await R.eng.attachment('pics', 'room', 'part:1', { msg: 'g0' });
    const r = { agentPdf: a.status === 200 && a.buf.equals(PDF), ownerHtml: !!(body.ok && again.ok && fs.readFileSync(again.file).equals(HTML)), calls: R.W.calls.attach.length };
    R.close();
    return r;
  };
  const pl = await partLeg(ENG, 'agent-part-scope');
  ok(pl.agentPdf && pl.ownerHtml && pl.calls === 2, `ONE PART ID, TWO MAILS: the agent asking g1's part:1 gets g1's PDF — never g0's formatted body the window cached under the same id — and the window still draws g0's body (vendor calls: ${pl.calls})`, JSON.stringify(pl));
  const plc = await partLeg(cut('agent-no-scope', 'const scope = msg ? String(msg) : null;', 'const scope = null;'), 'ctl-agent-part-scope');
  ok(!plc.agentPdf, `CONTROL: an engine whose cache key does not name the message hands the agent g0's HTML body for g1's part:1 — the leg reddens on it (${JSON.stringify(plc)})`);
  // ③c (verify r2): THE UPGRADE PATH — a file cached under the BARE id (written before the key named the message; the
  // route asked without `msg` still writes one) is the window's only while ONE message of the conversation carries that
  // id: a Gmail part id repeats per mail, so the bare file is whichever mail was drawn first — fetched again by its message
  const bareLeg = async (engineMod, name) => {
    clock += 61e3;
    const R = await agentRig(name, { engineMod, more: (W) => { W.add('g0', [{ id: 'part:1', name: 'message.html', mime: 'text/html', role: 'body' }]); W.add('g1', [{ id: 'part:1', name: 'invoice.pdf', mime: 'application/pdf' }]); W.byMsg = { g0: { data: HTML, mime: 'text/html', name: null }, g1: { data: PDF, mime: 'application/pdf', name: 'invoice.pdf' } }; } });
    const bare = await R.eng.attachment('pics', 'room', 'part:1');   // no message named: the bare id — g0's body, the first carrier
    await R.eng.attachment('pics', 'room', 'pic-3');
    const n = R.W.calls.attach.length;
    const pdf = await R.eng.attachment('pics', 'room', 'part:1', { msg: 'g1' });
    const one = await R.eng.attachment('pics', 'room', 'pic-3', { msg: 'm3' });
    const r = { bareHtml: !!(bare.ok && fs.readFileSync(bare.file).equals(HTML)), pdf: !!(pdf.ok && fs.readFileSync(pdf.file).equals(PDF)), oneCached: !!(one.ok && one.cached), calls: R.W.calls.attach.length - n };
    R.close();
    return r;
  };
  const bl = await bareLeg(ENG, 'owner-bare-id');
  ok(bl.bareHtml && bl.pdf && bl.oneCached && bl.calls === 1, `A BARE-ID FILE OF A REPEATED PART: the window opening g1's part:1 after g0's body was cached under the bare id gets g1's PDF (fetched: ${bl.calls}); a picture only m3 carries is still served from its bare-id file`, JSON.stringify(bl));
  const blc = await bareLeg(cut('owner-bare-any', 'return carriers.length === 1 && String(carriers[0].vendorId) === scope ? o : null;', 'return o;'), 'ctl-owner-bare-id');
  ok(!blc.pdf, `CONTROL: an engine that serves any bare-id file to the window hands it g0's formatted body as g1's PDF — the leg reddens on it (${JSON.stringify(blc)})`);
  const spenderLeg = async (engineMod, name) => {
    clock += 61e3;
    const R = await agentRig(name, { engineMod });
    await R.eng.setAccess('pics', ROOM, [{ principal: AL, authority: 'draft' }]);
    clock += 61e3;
    const by = () => R.eng.budgetOf('pics').spentBy;
    let open; R.W.gate = new Promise((res) => { open = res; });
    const a0 = by().agent, o0 = by().owner;
    const ap = R.agentGet('pic-6');
    await sleep(40);
    const op = R.get('pic-7');   // the owner's window opens a picture inside the agent's await
    await sleep(40); open(); R.W.gate = null;
    await Promise.all([ap, op]);
    const during = { agent: by().agent - a0, owner: by().owner - o0 };
    R.W.script['pic-5'] = 'late'; let go; R.W.late = new Promise((res) => { go = res; });
    const a1 = by().agent;
    const lp = R.agentGet('pic-5');
    await sleep(40);
    await R.eng.pass('pics', { force: true });   // a pass inside an agent fetch that meters after its await
    go();
    const late = await lp;
    const lateAgent = by().agent - a1;   // read before the clock moves the window on
    // verify r2: the owner's window opens a picture while the AGENT'S OWN REFRESH awaits the vendor (the pass's `e.chargeBy` is 'agent')
    clock += 61e3;
    let release; R.W.histGate = new Promise((res) => { release = res; });
    const rp = R.eng.agentRefresh(AL, 'pics', 'room');
    for (let i = 0; i < 100 && !R.W.histHit; i++) await sleep(20);
    const m0 = by();
    const ro = await R.get('pic-4');
    const inRefresh = { held: !!R.W.histHit, status: ro.status, agent: by().agent - m0.agent, owner: by().owner - m0.owner };
    release(); R.W.histGate = null;
    await rp;
    const r = { during, late: late.status, lateAgent, inRefresh };
    R.close();
    return r;
  };
  const sp = await spenderLeg(ENG, 'agent-spender');
  ok(sp.during.agent === 1 && sp.during.owner === 1 && sp.late === 200 && sp.lateAgent === 1 && sp.inRefresh.held && sp.inRefresh.status === 200 && sp.inRefresh.owner === 1 && sp.inRefresh.agent === 0, `THE SPENDER IS THE CALL'S (the owner's window inside an agent refresh's await: owner +${sp.inRefresh.owner}, agents +${sp.inRefresh.agent}): an owner fetch inside an agent fetch's await is the owner's (agents +${sp.during.agent}, owner +${sp.during.owner}); a pass inside an agent fetch that meters late leaves it on the agents' share (+${sp.lateAgent})`, JSON.stringify(sp));
  const spc = await spenderLeg(cut('agent-no-spender', "spendAs(agent ? 'agent' : 'owner', () => vendor(", 'spendAs(null, () => vendor('), 'ctl-agent-spender');
  const spo = await spenderLeg(cut('owner-no-spender', "spendAs(agent ? 'agent' : 'owner', () => vendor(", "spendAs(agent ? 'agent' : null, () => vendor("), 'ctl-owner-spender');
  ok(spo.inRefresh.held && spo.inRefresh.agent === 1 && spo.inRefresh.owner === 0, `CONTROL: an engine whose owner fetch does not name its spender puts the owner's picture on the agents' share inside an agent refresh — the leg reddens on it (${JSON.stringify(spo.inRefresh)})`);
  ok(spc.during.agent === 0 && spc.lateAgent === 0, `CONTROL: an engine that does not name the agent as the call's spender charges the agents' share nothing — the leg reddens on it (${JSON.stringify(spc)})`);
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
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 11 })) ok(x.pass, 'tree: ' + x.name + (x.pass ? '' : ' — ' + x.detail));
}

// ═══ ⑤ wiring pins ════════════════════════════════════════════════════════
console.log('⑤ wiring pins');
{
  const W = fs.readFileSync(path.join(REPO, 'src/lib/channel-window.js'), 'utf-8');
  const R = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf-8');
  // §25 (2026-09-27): the placeholder line no longer reaches the body at all — the record's TREE draws the
  // picture IN PLACE (an `img` block; the generic rung maps a declared placeholder to one), so `bodyShown`'s
  // text surgery is superseded in the window; its PURE table (②) stays as the rule for any text consumer
  ok(/const v = Att\.thumbVerdict\(answer, attempt\);/.test(W) && /placed\.add\(id\);\s*return attachmentNode\(rec, a, base\);/.test(W) && /const body = renderBlocks\(blocks, \{/.test(W), 'PIN: the window asks thumbVerdict for a picture that did not draw, and draws a placed picture IN the body through the one renderer (no "[image]" words)');
  ok(/img\.src = `\$\{url\}&inline=1/.test(W) && /img\.onclick = \(\) => showImageOverlay\(img\.src\);/.test(W) && !/innerHTML/.test(W.replace(/^\s*(\/\/|\*).*$/gm, '')), 'PIN: a thumbnail loads through OUR route as a property (img.src), opens THE shared overlay, and the window writes no innerHTML');
  ok(/attachmentReasonText\(code\)/.test(W) && /t\('Retry'\)/.test(W) && /track\('event', 'chan-attachment-failed'/.test(W), 'PIN: the refused chip names its reason, offers Retry, and the failure is reported (telemetry) — never a silent chip');
  ok(/retry: String\(req\.query\.retry \|\| ''\) === '1'/.test(R) && /res\.setHeader\('Cache-Control', 'no-store'\); return readerAnswer\(res, r\);/.test(R), 'PIN: the route passes the person\'s Retry and never lets a browser cache a refusal');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

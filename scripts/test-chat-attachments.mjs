// A PICTURE A MESSAGE SHOWED IS READ FROM THE RECORD IT CAME IN; A FILE A PERSON DROPPED LIVES WITH THE CONVERSATION
// (lane chat-attachments-persist, the cut — 主开发 2026-11-13 08:54Z: «the record is the store»). In-process, a scratch
// HOME (set before any src module loads: the harnesses' locate and the transcript worker read it), invented bytes:
//   ① THE PLACE at the record (the normalizers, PURE): Claude {tx, agent?, key = uuid, n in document order}; the LIVE
//      stream's record and its transcript line give the SAME place (law 7: scripts/fixtures/claude-cli/2.1.322-picture-
//      records.json, the real CLI against a loopback mock), a sub-agent's included; Codex {b: codex, tx, key = call_id, n}
//   ② THE READER (src/transcript-picture.js, SHARED): the base64 span of the n-th picture; gone / shortened / rescued /
//      no-bytes / compressed by name; the INDEX extended (never rebuilt) when the file only grew, rebuilt when it was
//      replaced or shrank, INDEX_MAX held (the least recently asked goes); a line longer than a read chunk; strings that
//      hold the marker or escaped quotes
//   ③ THE ROUTE (law 1) through the REAL transcript service and the REAL transcript worker: found only through the hub's
//      knowledge (the harness's locate; a sub-agent file AMONG the conversation's own); a bearer refused by name; the type
//      from an OWN entry of the closed table; nosniff, private + immutable, ETag / 304; 400 / 404 / 410 by name
//   ④ THE DEVICE (law 2): an agent whose hello-ack lacks `transcript-picture` is NEVER asked (409 old-agent); one that has
//      it answers through the same reader (its bytes served); the hub's half of the parity (test-transcript-parity runs
//      the real agent)
//   ⑤ THE INDEX'S COST (law 3): a cold pass, a warm read, an extension that reads only what was appended, the memory of
//      one index — measured and printed; the deadline answers `finding` + retryMs (the view says it and asks again)
//   ⑥ MANY AT ONCE (law 4): at most MAX_AT_ONCE readings run; a request whose page closed leaves the queue; the decode is
//      streamed block by block from the file's byte range
//   ⑦ FILES A PERSON DROPPED (law 5): the upload road (temporary cwd ⇒ <hub conversation id>/files/), never overwriting
//      (a name taken, two at once), stray temps removed at start (only old ones), the usage, the conversations that no
//      longer exist and the Remove door that acts only on what it named; the Antigravity wrapper's own write
//   ⑧ THE WORDS + THE DELETION LIST (law 6): what is covered, nothing about a bound; every name d41dc0496's store had is gone
//   ⑨ THE VIEW: the record URL (never a path), the error delegate's one swap and its words, the [Image source] note
//   ⑩ THE SYNC-FS GUARD + RED CONTROLS: a reader that re-reads from the start, a route with no limit — each red here
// Run: node scripts/test-chat-attachments.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = scratch('cap-home'); fs.mkdirSync(HOME, { recursive: true });
process.env.HOME = HOME; os.homedir = () => HOME;   // BEFORE any src module: the harnesses' locate, the codex sessions dir
const require = createRequire(import.meta.url);
const T0 = performance.now();
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : ''}`); } };
const leg = async (name, fn) => { let r; try { r = await fn(); } catch (e) { r = { ok: false, extra: 'threw: ' + String((e && e.stack) || e).slice(0, 500) }; } ok(r === true || !!(r && r.ok), name, r && r.extra); };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };
const PNG = (n = 0, pad = 0) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), crypto.createHash('sha256').update('pic-' + n).digest(), Buffer.alloc(pad, n & 255)]);   // invented bytes
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the fixture: one Claude conversation (main file + a sub-agent's), one Codex rollout ──
const TX = '5a5a5a5a-1111-4222-8333-944444444444', AG = 'a1b2c3d4e5f60718', CTX = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const U = (i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`;
const img = (p, mt = 'image/png') => ({ type: 'image', source: { type: 'base64', media_type: mt, data: p.toString('base64') } });
const userRec = (uuid, blocks, extra = {}) => JSON.stringify({ parentUuid: null, isSidechain: false, userType: 'external', cwd: '/w/proj', sessionId: TX, version: '2.1.322', type: 'user', message: { role: 'user', content: blocks }, uuid, timestamp: '2026-11-13T00:00:00.000Z', ...extra });
const tr = (tu, content) => ({ type: 'tool_result', tool_use_id: tu, content });
const PROJ = path.join(HOME, '.claude', 'projects', '-w-proj'); fs.mkdirSync(path.join(PROJ, TX, 'subagents'), { recursive: true });
const MAIN = path.join(PROJ, `${TX}.jsonl`);
const LINES = [
  JSON.stringify({ type: 'summary', summary: 'a text that says "type":"image" and \\"quotes\\"', leafUuid: U(99) }),
  userRec(U(1), [tr('tu1', [img(PNG(1))])]),
  userRec(U(2), [tr('tu2', [{ type: 'text', text: 'two "type":"image" pictures \\" next' }, img(PNG(2))]), tr('tu3', [img(PNG(3)), img(PNG(4), 'image/jpeg')])]),
  userRec(U(3), [{ type: 'text', text: '[rescued 2026-11-13: an oversized 2MB record was removed from this message — it broke resume and the history view]' }]),
  userRec(U(4), [tr('tu4', [img(PNG(5), 'constructor'), img(PNG(6), 'image/svg+xml'), img(PNG(7), '__proto__')])]),
  userRec(U(5), [tr('tu5', [{ type: 'image', source: { type: 'url', url: 'https://x.test/a.png' } }])]),
];
fs.writeFileSync(MAIN, LINES.join('\n') + '\n');
const SUB = path.join(PROJ, TX, 'subagents', `agent-${AG}.jsonl`);
fs.writeFileSync(SUB, userRec(U(6), [tr('tu6', [img(PNG(8))])], { isSidechain: true, agentId: AG }) + '\n');
const CODEX_DIR = path.join(HOME, '.codex', 'sessions', '2026', '11', '13'); fs.mkdirSync(CODEX_DIR, { recursive: true });
fs.writeFileSync(path.join(CODEX_DIR, `rollout-2026-11-13T00-00-00-${CTX}.jsonl`), [
  JSON.stringify({ timestamp: '2026-11-13T00:00:00Z', type: 'session_meta', payload: { id: CTX, cwd: '/w/proj' } }),
  JSON.stringify({ timestamp: '2026-11-13T00:00:01Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_pic1', output: [{ type: 'input_image', image_url: 'data:image/png;base64,' + PNG(9).toString('base64') }] } }),
].join('\n') + '\n');
const ZTX = '0198a1b2-c3d4-7e5f-8a9b-00000000dead';
fs.writeFileSync(path.join(CODEX_DIR, `rollout-2026-11-13T00-00-00-${ZTX}.jsonl.zst`), Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0]));

const TP = require(path.join(REPO, 'src/transcript-picture.js'));
const MMmod = require(path.join(REPO, 'src/message-manager.js'));
const { MessageManager } = MMmod;
const placesOf = (mm) => [...JSON.stringify([...mm.messageIndex.values()]).matchAll(/"place":(\{[^}]*\})/g)].map((m) => JSON.parse(m[1]));

console.log('① the place at the record');
{
  const mm = new MessageManager('cw-hub-1');
  mm.convertHistory([
    { type: 'assistant', uuid: 'a2', sessionId: TX, message: { role: 'assistant', id: 'm2', content: [{ type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: '/tmp/a.png' } }, { type: 'tool_use', id: 'tu3', name: 'Read', input: { file_path: '/tmp/b.png' } }] } },
    JSON.parse(LINES[2]),
  ]);
  const p = placesOf(mm);
  ok(p.length === 3 && p.every((x) => x.b === 'claude' && x.tx === TX && x.key === U(2)) && p.map((x) => x.n).join() === '0,1,2',
    'a record\'s pictures carry {b, tx, key = the record\'s uuid, n} — n in DOCUMENT order across its tool results (the order the reader counts)', p);
  const F = JSON.parse(read('scripts/fixtures/claude-cli/2.1.322-picture-records.json'));
  const live = F.live.map((r) => ({ uuid: r.uuid, tx: r.session_id, agent: r.agent_id || null }));
  const disk = F.disk.map((d) => ({ uuid: d.record.uuid, tx: d.record.sessionId, agent: d.record.agentId || null, sub: /\/subagents\/agent-[0-9a-f]+\.jsonl$/.test(d.file) }));
  ok(F.cli === '2.1.322' && live.length === 2 && live.every((l) => disk.some((d) => d.uuid === l.uuid && d.tx === l.tx && d.agent === l.agent)) && disk.some((d) => d.sub && d.agent && F.disk.find((x) => x.record.uuid === d.uuid).file.endsWith(`agent-${d.agent}.jsonl`)),
    'LAW 7 (measured on the real 2.1.322): the live stream\'s user record carries the SAME uuid and transcript id as its transcript line — a sub-agent\'s too (agent_id live = agentId on disk = its file\'s name): a live card has its place at once', { live, disk });
  const fromLive = MMmod.pictureBaseOf(F.live.find((r) => r.agent_id)), fromDisk = MMmod.pictureBaseOf(F.disk.find((d) => d.record.agentId).record);
  ok(JSON.stringify(fromLive) === JSON.stringify(fromDisk) && fromLive.agent && fromLive.key, 'the normalizer\'s place from the live record = from its transcript line (the same {tx, agent, key})', { fromLive, fromDisk });
  ok(MMmod.pictureBaseOf({ type: 'user', uuid: U(1) }) === null && MMmod.pictureBaseOf({ type: 'user', sessionId: TX }) === null && MMmod.pictureBaseOf({ type: 'user', uuid: U(1) }, TX)?.tx === TX && MMmod.pictureBaseOf({ sessionId: '../x', uuid: U(1) }) === null,
    'no transcript id or no uuid ⇒ no place (a reader that knows its transcript lends its id); an id that is not one ⇒ none');
  const CMM = require(path.join(REPO, 'src/codex-message-manager.js'));
  const Ctor = CMM.CodexMessageManager || CMM.default || CMM;
  const cm = new Ctor('cw-hub-c', { threadId: CTX });
  cm.convertHistory([
    { timestamp: 't', type: 'response_item', payload: { type: 'function_call', name: 'view_image', call_id: 'call_pic1', arguments: '{"path":"/tmp/c.png"}' } },
    { timestamp: 't', type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_pic1', output: [{ type: 'input_image', image_url: 'data:image/png;base64,' + PNG(9).toString('base64') }] } },
  ]);
  const cp = placesOf(cm);
  ok(cp.length === 1 && cp[0].b === 'codex' && cp[0].tx === CTX && cp[0].key === 'call_pic1' && cp[0].n === 0, 'a Codex view_image picture carries {b: codex, tx = the rollout, key = its call_id, n}', cp);
}

console.log('② the reader — from the record, by its place');
{
  const R = TP.create();
  const a = await R.find({ fp: MAIN, backend: 'claude', key: U(2), n: 2 });
  const buf = fs.readFileSync(MAIN);
  ok(a.ok && Buffer.from(buf.toString('latin1', a.start, a.end), 'base64').equals(PNG(4)) && a.mediaType === 'image/jpeg', 'the n-th picture\'s base64 span is found in the record (a text block holding the marker and escaped quotes is skipped as a string)', a);
  const gone = await Promise.all([R.find({ fp: MAIN, backend: 'claude', key: U(2), n: 3 }), R.find({ fp: MAIN, backend: 'claude', key: U(3), n: 0 }), R.find({ fp: MAIN, backend: 'claude', key: U(98), n: 0 }), R.find({ fp: MAIN, backend: 'claude', key: U(5), n: 0 }), R.find({ fp: path.join(CODEX_DIR, `rollout-2026-11-13T00-00-00-${ZTX}.jsonl.zst`), backend: 'codex', key: 'call_x', n: 0 })]);
  ok(gone.map((g) => g.gone).join() === 'shortened,rescued,missing,no-bytes,compressed', 'gone BY NAME: a record with fewer pictures, one the owner\'s rescue stubbed, one not in the file, a picture block without bytes, a compressed rollout', gone);
  const bad = await Promise.all([R.find({ fp: MAIN, backend: 'claude', key: '../x', n: 0 }), R.find({ fp: MAIN, backend: 'claude', key: U(1), n: -1 }), R.find({ fp: MAIN, backend: 'nope', key: U(1), n: 0 })]);
  ok(bad.every((g) => g.gone === 'missing'), 'a key that is not one, a bad ordinal, an unknown harness ⇒ nothing read');
  const d = scratch('cap-grow'); fs.mkdirSync(d, { recursive: true });
  const fp = path.join(d, 't.jsonl'); fs.writeFileSync(fp, LINES.slice(0, 3).join('\n') + '\n');
  const G = TP.create({ chunk: 4096 });
  await G.find({ fp, backend: 'claude', key: U(1), n: 0 });
  const s1 = G.held(), size1 = fs.statSync(fp).size;
  const more = userRec(U(7), [tr('tu7', [img(PNG(10, 9000))])]) + '\n';   // longer than one read chunk
  fs.appendFileSync(fp, more);
  const g7 = await G.find({ fp, backend: 'claude', key: U(7), n: 0 });
  const s2 = G.held();
  ok(g7.ok && s1.passes === 1 && s2.passes === 1 && s2.extended === 1 && s2.rebuilt === 0 && s2.bytesScanned - s1.bytesScanned === Buffer.byteLength(more) && Buffer.from(fs.readFileSync(fp).toString('latin1', g7.start, g7.end), 'base64').equals(PNG(10, 9000)),
    'LAW 3: a file that only GREW is indexed from where it stopped (only the appended bytes are read — a line longer than a read chunk included), never again from the start', { s1, s2, size1 });
  fs.writeFileSync(fp + '.new', LINES.slice(0, 2).join('\n') + '\n'); fs.renameSync(fp + '.new', fp);   // the rescue's swap: another inode
  const g1 = await G.find({ fp, backend: 'claude', key: U(1), n: 0 }), g2 = await G.find({ fp, backend: 'claude', key: U(2), n: 0 });
  ok(g1.ok && g2.gone === 'missing' && G.held().rebuilt === 1, 'a REPLACED file (another inode, the rescue\'s swap) is indexed again — its records as they are now', G.held());
  fs.truncateSync(fp, 10);
  const g3 = await G.find({ fp, backend: 'claude', key: U(1), n: 0 });
  ok(g3.gone === 'missing' && G.held().rebuilt === 2, 'a file that SHRANK is indexed again');
  const L = TP.create({ indexMax: 2 });
  const fps = [0, 1, 2].map((i) => { const f = path.join(d, `l${i}.jsonl`); fs.writeFileSync(f, LINES[1] + '\n'); return f; });
  for (const f of fps) await L.find({ fp: f, backend: 'claude', key: U(1), n: 0 });
  ok(L.held().files === 2 && TP.INDEX_MAX === 16, 'at most INDEX_MAX indexes are held (16; here 2) — the least recently asked goes', L.held());
}

console.log('③ the route — found only through what the hub knows');
const express = require('express');
const CA = require(path.join(REPO, 'src/server/chat-attachments.js'));
const { createTranscriptService } = require(path.join(REPO, 'src/transcript-service.js'));
const ROUTES = require(path.join(REPO, 'src/routes/chat-attachments.js'));
const devCalls = [];
const fakeHosts = {
  get: (h) => (h === 'mac-old' || h === 'mac-new' ? { id: h } : null),
  deviceBounded: async (h) => ({
    connect: async () => ({ info: { capabilities: h === 'mac-new' ? ['transcript-op', 'transcript-picture'] : ['transcript-op'] } }),
    transcriptOp: async (method, ref, params) => { devCalls.push({ h, method, ref, params }); return method === 'picture' ? { ok: true, mediaType: 'image/png', b64: PNG(11).toString('base64') } : null; },
  }),
};
const svc = createTranscriptService({ activeSessions: new Map(), createSessionMessages: null, hosts: fakeHosts });
const filesRoot = scratch('cap-files'); fs.mkdirSync(filesRoot, { recursive: true });
const known = new Set(['cw-known-1']);
const store = CA.create({ root: filesRoot, knownIds: async () => known, log: quiet });
const serve = async (opts) => { const app = express(); app.use(express.json()); const api = ROUTES.registerChatAttachmentRoutes(app, opts); const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.once('listening', r)); return { base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close(), api }; };
const S1 = await serve({ store, transcripts: svc, hostKnown: (h) => !!fakeHosts.get(h) });
const get = async (u, h = {}) => { const r = await fetch(S1.base + u, { headers: h }); const b = Buffer.from(await r.arrayBuffer()); let j = null; try { j = JSON.parse(b.toString()); } catch { } return { s: r.status, t: r.headers.get('content-type'), n: r.headers.get('x-content-type-options'), c: r.headers.get('cache-control'), e: r.headers.get('etag'), b, j }; };
{
  const a = await get(`/api/chat-picture/${TX}/${U(2)}/1`);
  ok(a.s === 200 && a.t === 'image/png' && a.n === 'nosniff' && /private/.test(a.c || '') && /immutable/.test(a.c || '') && /^"[0-9a-f]{27}"$/.test(a.e || '') && a.b.equals(PNG(3)),
    'a picture is read from its record through the hub\'s own locate (no path, no cwd from the page): its type, nosniff, private + immutable, an ETag', { s: a.s, t: a.t, c: a.c, e: a.e, j: a.j });
  const nm = await get(`/api/chat-picture/${TX}/${U(2)}/1`, { 'If-None-Match': a.e });
  ok(nm.s === 304 && nm.b.length === 0, 'the validator answers 304 (a record\'s bytes never change)');
  const sub = await get(`/api/chat-picture/${TX}/${U(6)}/0?agent=${AG}`), notAmong = await get(`/api/chat-picture/${TX}/${U(6)}/0?agent=ffffffffffffffff`), noAgent = await get(`/api/chat-picture/${TX}/${U(6)}/0`);
  ok(sub.s === 200 && sub.b.equals(PNG(8)) && notAmong.s === 404 && notAmong.j?.code === 'unknown' && noAgent.s === 410, 'a sub-agent\'s picture: its file only when it is AMONG the conversation\'s own sub-agent files — another id answers 404 unknown', [sub.s, notAmong.s, noAgent.s]);
  const cx = await get(`/api/chat-picture/${CTX}/call_pic1/0?b=codex`);
  ok(cx.s === 200 && cx.b.equals(PNG(9)), 'a Codex picture from its rollout (the codex harness\'s own locate, the output\'s call_id)', { s: cx.s, j: cx.j });
  const unk = await get(`/api/chat-picture/bbbbbbbb-0000-4000-8000-000000000000/${U(1)}/0`);
  const bad = await Promise.all([`/api/chat-picture/..%2F..%2Fetc/${U(1)}/0`, `/api/chat-picture/${TX}/a%2Fb/0`, `/api/chat-picture/${TX}/${U(1)}/x`, `/api/chat-picture/${TX}/${U(1)}/0?agent=..%2Fx`, `/api/chat-picture/${TX}/${U(1)}/0?b=agy`, `/api/chat-picture/${TX}/${U(1)}/0?host=mac-nowhere`, `/api/chat-picture/${TX}/${U(1)}/99999`].map((u) => get(u)));
  ok(unk.s === 404 && unk.j?.code === 'unknown' && bad.every((x) => x.s === 400 && x.j?.code === 'bad_place'), 'a conversation the hub does not know ⇒ 404 unknown; a path, a slash, a bad ordinal / agent / harness / host ⇒ 400 bad_place', [unk.s, bad.map((x) => x.s)]);
  const g = await Promise.all([get(`/api/chat-picture/${TX}/${U(2)}/3`), get(`/api/chat-picture/${TX}/${U(3)}/0`), get(`/api/chat-picture/${TX}/${U(97)}/0`), get(`/api/chat-picture/${ZTX}/call_x/0?b=codex`)]);
  ok(g.every((x) => x.s === 410 && x.j?.code === 'gone') && g.map((x) => x.j.why).join() === 'shortened,rescued,missing,compressed', 'a record gone / shortened / stubbed by the rescue / compressed ⇒ 410 `gone` with why (the view says it — never a broken picture)', g.map((x) => [x.s, x.j]));
  const types = await Promise.all([0, 1, 2].map((n) => get(`/api/chat-picture/${TX}/${U(4)}/${n}`)));
  ok(types.every((x) => x.s === 415 && x.j?.code === 'type'), 'the type only from an OWN entry of the closed table: «constructor», image/svg+xml, «__proto__» ⇒ 415, no bytes sent', types.map((x) => x.s));
  const bearer = await get(`/api/chat-picture/${TX}/${U(1)}/0`, { Authorization: 'Bearer ' + ['vsst', 'x'.repeat(20)].join('_') });
  ok(bearer.s === 403 && bearer.j?.code === 'bearer_refused' && /bearer token is refused/.test(bearer.j?.error || ''), 'a request carrying a bearer is refused BY NAME (the owner\'s cookie only)', bearer.j);
  const auth = read('src/auth.js');
  ok(!/chat-picture|chat-attachments/.test(auth), 'auth.js opens no door for /api/chat-picture or /api/chat-attachments — an agent or job bearer never reaches them');
}

console.log('④ the device — never asked without its capability');
{
  devCalls.length = 0;
  const old = await get(`/api/chat-picture/${TX}/${U(1)}/0?host=mac-old`);
  ok(old.s === 409 && old.j?.code === 'old-agent' && devCalls.length === 0, 'an agent whose hello-ack does not name `transcript-picture` is NEVER asked (an unknown op would hang) ⇒ 409 old-agent (the card keeps today\'s road and says why)', { s: old.s, devCalls });
  const nw = await get(`/api/chat-picture/${TX}/${U(1)}/0?host=mac-new`);
  ok(nw.s === 200 && nw.b.equals(PNG(11)) && devCalls.length === 1 && devCalls[0].method === 'picture' && devCalls[0].ref.sessionId === TX && devCalls[0].params.key === U(1) && devCalls[0].params.n === 0, 'an agent that names it answers through the same reader; its base64 is decoded block by block and served', devCalls);
  const ad = read('src/agentd/agentd.js');
  ok(/capabilities: \['probe', 'transcript-op', 'transcript-picture',/.test(ad) && /else if \(m === 'picture'\) result = await svc\.pictureHere\(ref,/.test(ad), 'the agent names `transcript-picture` in its hello-ack and answers `picture` with the SHARED reader (the agent bundle changes — the cut signs it)');
  const here = await svc.pictureHere({ backend: 'claude', sessionId: TX }, { key: U(2), n: 1 });
  ok(here.ok && Buffer.from(here.b64, 'base64').equals(PNG(3)) && here.mediaType === 'image/png', 'the device\'s answer (pictureHere) = the same bytes the hub serves for the same place (the parity suite proves it over a real agent)');
}

console.log('⑤ the index\'s cost — measured');
{
  const d = scratch('cap-cost'); fs.mkdirSync(d, { recursive: true });
  const fp = path.join(d, 'big.jsonl');
  const filler = JSON.stringify({ type: 'assistant', uuid: 'f', message: { role: 'assistant', content: [{ type: 'text', text: 'x'.repeat(4000) }] } }) + '\n';
  const fd = fs.openSync(fp, 'w'); const block = filler.repeat(64);   // ≈ 8 MB here; the 2 GB figures: the lane's measurement (report)
  for (let i = 0; i < 32; i++) { fs.writeSync(fd, block); if (i % 4 === 0) fs.writeSync(fd, userRec(U(1000 + i), [tr('tb' + i, [img(PNG(1000 + i, 200000))])]) + '\n'); }
  fs.closeSync(fd);
  const R = TP.create();
  let t = performance.now(); const c = await R.find({ fp, backend: 'claude', key: U(1028), n: 0 }); const cold = performance.now() - t;
  t = performance.now(); const w = await R.find({ fp, backend: 'claude', key: U(1004), n: 0 }); const warm = performance.now() - t;
  const h = R.held(), mb = fs.statSync(fp).size / 1048576;
  console.log(`    measured: a ${mb.toFixed(0)} MB transcript — cold ${cold.toFixed(0)} ms (one pass), warm ${warm.toFixed(1)} ms, its index ${h.bytes} bytes for ${h.keys} picture lines`);
  ok(c.ok && w.ok && warm < cold && h.keys === 8 && h.bytes < 4096, 'LAW 3 stated: one pass for the first picture, a warm read in milliseconds, the index ≈ 100 bytes a picture line (the 2 GB numbers: the lane report)', { cold, warm, h });
  const slow = await serve({ store, transcripts: { picture: () => sleep(150).then(() => ({ gone: 'missing' })) }, deadlineMs: 40 });
  const r = await fetch(`${slow.base}/api/chat-picture/${TX}/${U(1)}/0`), j = await r.json();
  slow.close();
  ok(r.status === 503 && j.code === 'finding' && j.retryMs === ROUTES.RETRY_MS && r.headers.get('retry-after') === '2', 'past the DEADLINE the route answers 503 `finding` + retryMs — the page is never held; the reading goes on', j);
  const cv = read('src/lib/chat-view.js');
  ok(/r\.status === 503 && tries < 8\) \{\s*say\(t\('Still finding this picture in the conversation…'\)\);\s*setTimeout\(/.test(cv), 'the view says it is still being found and asks again (a few times, then «could not be found in time»)');
}

console.log('⑥ many at once');
{
  let cur = 0, max = 0, calls = 0, open; const gate = new Promise((r) => { open = r; });
  const many = await serve({ store, transcripts: { picture: async () => { calls++; cur++; max = Math.max(max, cur); await gate; cur--; return { gone: 'missing' }; } }, deadlineMs: 20000 });
  const go = (i, signal) => fetch(`${many.base}/api/chat-picture/${TX}/${U(1)}/${i}`, { signal }).then((r) => r.status, () => 'aborted');
  const kept = [...Array(9)].map((_, i) => go(i));
  const ac = new AbortController(); const left = [...Array(6)].map((_, i) => go(20 + i, ac.signal));
  await sleep(60); ac.abort(); await sleep(60);
  const before = calls; open();
  const st = await Promise.all(kept), lt = await Promise.all(left);
  await sleep(10);
  const s = many.api.stats(); many.close();
  ok(max === ROUTES.MAX_AT_ONCE && before === ROUTES.MAX_AT_ONCE && st.every((x) => x === 410), `LAW 4: fifteen asks at once — at most ${ROUTES.MAX_AT_ONCE} readings run, the rest wait in order`, { max, before, st });
  ok(lt.every((x) => x === 'aborted') && calls === 9 && s.left === 6, 'a closed page\'s requests LEAVE the queue: none of the six is read', { calls, s });
  const dec = ROUTES.base64Decoder(), outs = []; dec.on('data', (b) => outs.push(b));
  const b64 = PNG(12, 777).toString('base64');
  for (const cut of [1, 5, 2, 7, 3, 11, 13, 999999]) dec.write(Buffer.from(b64.slice(0, cut))), dec.write(Buffer.from(''));
  const parts = []; let i = 0; for (const n of [1, 3, 5, 7, 2, 9, 4, 6]) { parts.push(b64.slice(i, i + n)); i += n; } parts.push(b64.slice(i));
  const dec2 = ROUTES.base64Decoder(), o2 = []; dec2.on('data', (b) => o2.push(b)); for (const p of parts) dec2.write(Buffer.from(p)); dec2.end(); await new Promise((r) => dec2.on('end', r));
  ok(Buffer.concat(o2).equals(PNG(12, 777)), 'the decode is block by block: any split of the base64 into reads gives the same bytes');
  const rt = read('src/routes/chat-attachments.js');
  ok(/fh\.createReadStream\(\{ start: p\.start, end: p\.end - 1 \}\)/.test(rt) && /rs\.pipe\(base64Decoder\(\)\)\.pipe\(res\)/.test(rt) && !/readFile/.test(rt.replace(/\/\*[\s\S]*?\*\//g, '')), 'the hub streams the picture\'s byte range of the file through the decoder — never the transcript line held twice');
}

console.log('⑦ files a person dropped');
{
  const app = express();
  const root = scratch('cap-attach-root'), notTmp = scratch('cap-work'), tmpCwd = scratch('cap-tmp-cwd');
  for (const x of [root, notTmp, tmpCwd]) fs.mkdirSync(x, { recursive: true });
  app.locals.chatAttachmentsRoot = root;
  app.locals.chatTempRoots = [path.resolve(tmpCwd)];
  app.use(require(path.join(REPO, 'src/routes/files.js')));
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const up = async (destDir, name, bytes, extra = {}) => { const fd = new FormData(); fd.append('files', new Blob([bytes]), name); fd.append('destDir', destDir); fd.append('fileNames', JSON.stringify([name])); fd.append('sessionId', 'cw-cap-up'); for (const [k, v] of Object.entries(extra)) fd.append(k, v); const r = await fetch(base + '/api/upload', { method: 'POST', body: fd }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const a = await up(tmpCwd, 'a.png', PNG(21));
  const keptAt = path.join(root, 'cw-cap-up', 'files', 'a.png');
  ok(a.s === 200 && a.j.keptWithConversation === true && a.j.files[0].path === keptAt && fs.readFileSync(keptAt).equals(PNG(21)) && !fs.existsSync(path.join(tmpCwd, 'a.png')) && (fs.statSync(keptAt).mode & 0o777) === 0o600,
    'chat.uploadDir unset + a TEMPORARY cwd ⇒ kept in data/chat-attachments/<the hub\'s conversation id>/files/ (0600), the answer says where', a.j);
  const b = await up(tmpCwd, 'a.png', PNG(22));
  ok(b.j.files && b.j.files[0].path === path.join(root, 'cw-cap-up', 'files', 'a (1).png') && fs.readFileSync(keptAt).equals(PNG(21)), 'a same-named file is NEVER overwritten: «a (1).png», the first one untouched', b.j);
  const c = await up(notTmp, 'w.png', PNG(23)), dd = await up(tmpCwd, 'chosen.png', PNG(24), { uploadDirSet: '1' });
  ok(!c.j.keptWithConversation && c.j.files[0].path === path.join(notTmp, 'w.png') && !dd.j.keptWithConversation && dd.j.files[0].path === path.join(tmpCwd, 'chosen.png'), 'a cwd that is not temporary, and a chosen chat.uploadDir, keep today\'s road');
  srv.close();
  const pd = scratch('cap-place'); fs.mkdirSync(pd, { recursive: true });
  const src = path.join(pd, 'src.bin'); fs.writeFileSync(src, PNG(25));
  fs.writeFileSync(path.join(pd, 'x.png'), 'held');
  const both = await Promise.all([CA.placeFile(src, pd, 'x.png'), CA.placeFile(src, pd, 'x.png'), CA.placeFile(src, pd, 'x.png')]);
  ok(new Set(both).size === 3 && !both.includes('x.png') && fs.readFileSync(path.join(pd, 'x.png'), 'utf8') === 'held' && both.every((n) => fs.readFileSync(path.join(pd, n)).equals(PNG(25))) && !fs.readdirSync(pd).some((n) => n.endsWith(CA.TMP_SUFFIX)),
    'placeFile: a temp file LINKED to a free name — three at once for a held name get three new names, the held file untouched, no temp left', both);
  let threw = null; try { await CA.placeFile(src, pd, '../out.png'); } catch (e) { threw = e.message; }
  ok(/Invalid file name/.test(threw || ''), 'a name that leaves its folder is refused');
  const sr = scratch('cap-sweep'); fs.mkdirSync(path.join(sr, 'cw-s1', 'files'), { recursive: true });
  const oldT = path.join(sr, 'cw-s1', 'files', `.a.png.1-ab${CA.TMP_SUFFIX}`), youngT = path.join(sr, 'cw-s1', 'files', `.b.png.1-cd${CA.TMP_SUFFIX}`);
  fs.writeFileSync(oldT, 'x'); fs.writeFileSync(youngT, 'y'); fs.writeFileSync(path.join(sr, 'cw-s1', 'files', 'kept.png'), PNG(26));
  const past = (Date.now() - 5 * 60000) / 1000; fs.utimesSync(oldT, past, past);
  const ss = CA.create({ root: sr, knownIds: async () => new Set(['cw-s1']), log: quiet });
  const swept = await ss.sweepTemps();
  ok(swept === 1 && !fs.existsSync(oldT) && fs.existsSync(youngT) && fs.existsSync(path.join(sr, 'cw-s1', 'files', 'kept.png')), 'AT START: a temp file a crash left (older than a minute) is removed; a write still running (younger) and every kept file stay', { swept });
  const u = await ss.usage();
  ok(u.files === 1 && u.bytes === PNG(26).length && u.conversations === 1, 'the usage counts what a person dropped (temps never counted)', u);
  fs.mkdirSync(path.join(sr, 'cw-gone-1', 'files'), { recursive: true }); fs.writeFileSync(path.join(sr, 'cw-gone-1', 'files', 'g.png'), PNG(27));
  const o = await ss.orphans();
  ok(o.conversations === 1 && o.files === 1 && o.bytes === PNG(27).length && o.ids.join() === 'cw-gone-1', 'a conversation the hub lists NOWHERE is named with its count and size; one it lists (live, kept, archived, on an offline machine) is not', o);
  const wrong = await ss.removeOrphans({ files: 2, bytes: o.bytes }), right = await ss.removeOrphans({ files: o.files, bytes: o.bytes });
  ok(wrong.changed === true && right.removed === 1 && !fs.existsSync(path.join(sr, 'cw-gone-1')) && fs.existsSync(path.join(sr, 'cw-s1', 'files', 'kept.png')), 'the Remove door acts ONLY on the count and size it named (anything else ⇒ «changed», nothing removed)', { wrong, right });
  const S2 = await serve({ store: CA.create({ root: sr, knownIds: async () => new Set(), log: quiet }), transcripts: svc });
  const oo = await (await fetch(`${S2.base}/api/chat-attachments/orphans`)).json();
  const rm409 = await fetch(`${S2.base}/api/chat-attachments/orphans/remove`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files: 9, bytes: 9 }) });
  S2.close();
  ok(oo.conversations === 1 && oo.files === 1 && !('ids' in oo) && rm409.status === 409, 'the routes: the orphans\' count and size (never their ids); a removal naming other numbers ⇒ 409 changed');
  const wiring = read('src/server/mounts-plugins-wiring.js');
  ok(/const ids = new Set\(activeSessions\.keys\(\)\);[\s\S]{0,200}session-meta[\s\S]{0,120}\/\^\(\.\+\)\\\.json\(\?:\\\.orphan\)\?\$\//.test(wiring) && /chatAttachments\.sweepTemps\(\)/.test(wiring), 'the hub\'s conversations = its live sessions + every session record it keeps (an .orphan one: a machine that is offline); the sweep runs at start');
  const agy = read('data/bin/agy-wrapper.js');
  ok(/Object\.prototype\.hasOwnProperty\.call\(PICTURE_EXT, mt\) \? PICTURE_EXT\[mt\] : null/.test(agy) && /fs\.linkSync\(tmp, fp\)/.test(agy) && /\.vs-tmp`/.test(agy), 'the Antigravity wrapper: an extension only from an OWN entry; a pasted picture written as a temp file linked to its name');
}

console.log('⑧ the words + the deletion list');
{
  const en = read('CHANGELOG.md'), head = en.slice(en.indexOf('## 2.369.401'), en.indexOf('## 2.369.398'));
  ok(/A picture Claude Code or Codex showed/.test(head) && /A file you dropped/.test(head) && !/MB|bound|limit|trim/i.test(head), 'the words say what is covered — «a picture Claude Code or Codex showed», «a file you dropped» — and nothing about a bound', head.slice(0, 400));
  const GONE = ['keepPicture', 'usePictureKeeper', 'PICTURE_KEEPER', 'keptPicturesMB', 'kept-pictures', 'kept.json', 'LEDGER_FILE', 'trimNow', 'wasTrimmed', 'whenKept', 'PENDING_MAX_CHARS', 'conversationBytes', 'CONVERSATION_MB_', 'chat-attachments-ledger', 'keptPictureUrl', 'data-kept-src', '_keptPictureGone', 'Pictures kept per conversation', 'Removed to stay within', '.trimmed.json'];
  const files = ['src/server/chat-attachments.js', 'src/routes/chat-attachments.js', 'src/message-manager.js', 'src/codex-message-manager.js', 'src/server/mounts-plugins-wiring.js', 'src/timed-sync.js', 'src/lib/chat-renderers.js', 'src/lib/chat-view.js', 'src/lib/settings-ui.js', 'src/lib/settings-schema.js', 'src/lib/i18n-zh.js', 'src/lib/i18n-ja.js', 'src/server/stdout/claude-stream-json.js', 'src/ws-handler.js', 'docs/settings.md', 'docs/kb-api.md', 'docs/kb-features.md', 'docs/kb-file-structure.md', 'CHANGELOG.md', 'CHANGELOG.zh.md', 'CHANGELOG.ja.md'];
  // in the docs and changelogs the ledger is named as it was spelled there («<conv>/kept.json»; another feature has a kept.json of its own)
  const gonesOf = (f) => (/^src\//.test(f) ? GONE : GONE.map((g) => (g === 'kept.json' ? '<conv>/kept.json' : g)));
  const left = files.flatMap((f) => { const t = read(f); return gonesOf(f).filter((g) => t.includes(g)).map((g) => `${f}: ${g}`); });
  ok(left.length === 0, 'THE DELETION LIST: none of d41dc0496\'s store names is left (the keeper, the ledger, the bound, the queue, the setting, their words)', left);
  ok(/fact: 'kept-files'/.test(read('src/lib/settings-schema.js')) && /const files = Number\(o\.files\), bytes = Number\(o\.bytes\);[^\n]*captured BEFORE the dialog/.test(read('src/lib/settings-ui.js')) && /message: t\('Remove \{n\} files \(\{size\}\) of conversations that no longer exist\? This cannot be undone\.', \{ n: files, size: mb\(bytes\) \}\)/.test(read('src/lib/settings-ui.js')),
    'Settings › Chat SAYS what is kept (count, size) beside where files go, and the Remove door names the count and the size before it acts');
  ok(['"Files you dropped into a temporary folder, kept with their conversations: {n} files, {size}": "', '"Still finding this picture in the conversation…": "', '"This picture was removed from the conversation\'s record when the record was rescued": "'].every((k) => read('src/lib/i18n-zh.js').includes(k) && read('src/lib/i18n-ja.js').includes(k)), 'the new words are in zh and ja');
}

console.log('⑨ the view — the real renderer');
{
  const bv = path.join(REPO, 'src/lib/build-version.js');
  if (!fs.existsSync(bv)) fs.writeFileSync(bv, "// GENERATED at build (gitignored) — stand-in written by test-chat-attachments\nexport const BUILD_VERSION = 'test';\n");
  class El { constructor(tag) { this.tagName = String(tag).toUpperCase(); this.className = ''; this.innerHTML = ''; this.title = ''; this.children = []; this.dataset = {}; this.style = {}; } appendChild(c) { this.children.push(c); return c; } append(...c) { this.children.push(...c); } setAttribute() {} addEventListener() {} querySelector() { return null; } querySelectorAll() { return []; } }
  const R = await import(pathToFileURL(path.join(REPO, 'src/lib/chat-renderers.js')).href);
  const hadDoc = 'document' in globalThis;
  if (!hadDoc) globalThis.document = { createElement: (t) => new El(t), createTextNode: (s) => ({ textContent: s }) };
  const pl = { b: 'claude', tx: TX, key: U(2), n: 1 };
  const url = R.placePictureUrl(pl), urlSub = R.placePictureUrl({ ...pl, agent: AG }, 'mac-new'), urlCx = R.placePictureUrl({ b: 'codex', tx: CTX, key: 'call_pic1', n: 0 });
  ok(url === `/api/chat-picture/${TX}/${U(2)}/1?b=claude` && urlSub === `/api/chat-picture/${TX}/${U(2)}/1?b=claude&agent=${AG}&host=mac-new` && urlCx === `/api/chat-picture/${CTX}/call_pic1/0?b=codex`, 'the record URL from a place (a sub-agent, a machine, Codex) — never a path', [url, urlSub, urlCx]);
  ok(['', R.placePictureUrl({ ...pl, tx: '../x' }), R.placePictureUrl({ ...pl, key: 'a/b' }), R.placePictureUrl({ ...pl, n: -1 }), R.placePictureUrl({ ...pl, b: 'Not An Id!' }), R.placePictureUrl(null)].every((u) => u === ''), 'a traversal, a slash, a bad ordinal, a harness that is not an id, nothing ⇒ no URL (a harness with no picture shape: the route\'s 400)');
  const h1 = R.imageMediaHtml({ path: '/tmp/shot-1.png', mediaType: 'image/png', bytes: 40, place: pl });
  ok(h1.includes(`data-record-src="${url}"`) && h1.includes('/api/file/raw?path=%2Ftmp%2Fshot-1.png'), 'a card with a path draws the file and carries the record\'s URL for when the path stops answering');
  const h2 = R.imageMediaHtml({ mediaType: 'image/png', bytes: 40, place: pl });
  ok(h2.includes(`src="${url}"`) && !h2.includes('data-record-src'), 'no path (an inline screenshot) ⇒ drawn from the record at once');
  const cv = read('src/lib/chat-view.js');
  ok(/if \(this\._recordPictureNext\(img\)\) return;/.test(cv) && /if \(src !== rec && !img\.dataset\.recordTried\) \{ img\.dataset\.recordTried = '1'; img\.src = rec; return true; \}/.test(cv), 'the error delegate swaps the record\'s copy in ONCE, through .src (never innerHTML), then reads the record\'s answer');
  ok(/r\.status === 410\) return say\(j\.why === 'rescued'/.test(cv) && /r\.status === 409\) return say\(t\('That machine\\'s agent is older/.test(cv) && /r\.status === 404\) return say\(t\('This conversation\\'s record is not on this machine'\)\)/.test(cv), 'the record\'s answer is said in words: gone (the rescue named), an older agent, not on this machine');
  const r = new R.ChatRenderers({ ws: null, sessionId: 'cw-1', app: null, messageList: { addEventListener() {} }, getSessionCtx: () => ({ cwd: '/w', host: null }) });
  const note = r._renderNotificationMsg('[Image source: /tmp/claude-1000/-p/conv/images/16.png]');
  ok(/kept in this conversation(&#39;|')s history/.test(note.innerHTML) && !note.innerHTML.includes('/tmp/'), 'the CLI\'s «[Image source: /tmp/…]» note says the picture is kept in the conversation\'s history');
  if (!hadDoc) delete globalThis.document;
}

console.log('⑩ the sync-fs guard + RED controls');
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const own = ['src/server/chat-attachments.js', 'src/routes/chat-attachments.js', 'src/transcript-picture.js'].map((f) => [f, strip(read(f))]);
  ok(own.every(([, s]) => !/\bfs\.\w+Sync\(/.test(s)), 'no synchronous file call in the store, the route or the reader', own.filter(([, s]) => /\bfs\.\w+Sync\(/.test(s)).map(([f]) => f));
  const ts = read('src/transcript-service.js');
  ok(/return picturePool\(\)\.call\('picture', q\);/.test(ts) && /poolSize: 1/.test(ts) && /case 'picture':/.test(read('src/transcript-worker.js')), 'on the hub every reading runs in ONE transcript worker of its own (one copy of each index)');
  // RED CONTROL 1: a reader that reads every file again from the start — the LAW 3 leg's count must see it
  const src = read('src/transcript-picture.js'), anchor = 'let pos = ix.to, lineAt = ix.to, skipping = false;';
  const mdir = scratch('cap-mutant'); fs.mkdirSync(mdir, { recursive: true });
  ok(src.includes(anchor), 'the mutant\'s anchor is in the reader (where a pass starts)');
  fs.writeFileSync(path.join(mdir, 'tp.js'), src.replace(anchor, 'let pos = 0, lineAt = 0, skipping = false;'));
  const M = require(path.join(mdir, 'tp.js')).create({ chunk: 4096 });
  const fp = path.join(mdir, 't.jsonl'); fs.writeFileSync(fp, LINES.slice(0, 2).join('\n') + '\n');
  await M.find({ fp, backend: 'claude', key: U(1), n: 0 }); const b1 = M.held().bytesScanned; const more = userRec(U(8), [tr('t8', [img(PNG(30))])]) + '\n'; fs.appendFileSync(fp, more); await M.find({ fp, backend: 'claude', key: U(8), n: 0 });
  ok(M.held().bytesScanned - b1 !== Buffer.byteLength(more), 'RED CONTROL: a reader that starts every pass from the beginning reads more than what was appended — what the LAW 3 leg catches');
  // RED CONTROL 2: a route with no limit — the LAW 4 leg's count must see it
  let cur = 0, max = 0, open; const gate = new Promise((r) => { open = r; });
  const nolimit = await serve({ store, transcripts: { picture: async () => { cur++; max = Math.max(max, cur); await gate; cur--; return { gone: 'missing' }; } }, maxAtOnce: 1000 });
  const all = [...Array(8)].map((_, i) => fetch(`${nolimit.base}/api/chat-picture/${TX}/${U(1)}/${i}`).then((x) => x.status));
  await sleep(60); open(); await Promise.all(all); nolimit.close();
  ok(max > ROUTES.MAX_AT_ONCE, 'RED CONTROL: a route with no limit runs every reading at once — what the LAW 4 leg catches', { max });
}
S1.close();
console.log(`\n${fail ? '✗' : '✓'} test-chat-attachments: ${pass} passed, ${fail} failed`);
if (fail) { console.log('FAIL'); process.exit(1); } else { console.log(`ALL PASS (${pass}) — ${Math.round(performance.now() - T0)} ms`); process.exit(0); }

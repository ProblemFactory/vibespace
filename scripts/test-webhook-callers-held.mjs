#!/usr/bin/env node
// test-webhook-callers-held — row B-f276's family, its third form (主开发 r3145, lane bl-ci), UNIT 1: THE WEBHOOK CALLERS' LIST.
// data/channels/webhook/callers.json (every path and caller: token hashes, sealed tokens, pairings) and pair-pending.json beside
// it (the pairing codes of the last ten minutes) under the store-read law through src/store-read-hold.js.
// FAST, in-process; MADE-UP paths, callers and codes in a scratch data folder of each part's own; nothing outside it.
// THE REFUSAL IS PLACED: fs.readFileSync / fs.promises.readFile answer EIO for that ONE path (never a mount, never a mode change).
//   ① THE STORE: a failed read is no «no paths» — every read throws the hold's refusal (503 webhook_callers_unread), every writer
//      (a new path, a registration, a rotation, a revocation, a delivery, a pairing, a take-back, a poll count) is refused BY NAME
//      and the file is byte for byte what it was; a START while held holds again; the read again LIFTS (the rows back, the next
//      registration keeps them); torn bytes are kept aside ONCE per content (0600), then the list starts empty and names the copy.
//   ② THE PENDING CODES: a failed read of pair-pending.json is no «no code pending» — the bind and a write are refused by name, the
//      file unchanged; the lift binds again and the code minted before is there.
//   ③ THE ROUTES (a real engine and the real routes on loopback): while held a registered caller's call and poll hear «try again
//      later» (503, Retry-After), never the 401 of an unknown caller, and nothing is charged or stored; every owner verb is refused
//      by name (the paths list, a new path, a registration, a pairing code, a join) with the file unchanged; the completion of a
//      pairing answers store-blocked (the code not spent); an owner's send says the hold, never «no longer a caller»; after the
//      lift the same call is taken in; a torn lift of this run answers its lost path «try again later». THE SECRET LENS: no token,
//      hash or sealed field in any answer, journal line or broadcast. The page says both held codes in place (their rows are the family's
//      ONE table's, r3168) and words the torn lift (zh, ja).
//   ④ RED CONTROLS: the store with its read guard cut answers «no paths» (①'s leg turns red); with its save guard and its read
//      guard cut, a new path writes over the file (the release's shape).
// At the release (the base of this row) the law's legs are RED: that is the harm, as the release has it.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 500) : '')); } };
const RAW = fs.readFileSync;   // the real read (a check of the bytes on disk never meets the placed refusal)
const onDisk = (f) => { try { return RAW.call(fs, f, 'utf8'); } catch { return null; } };
/** the PLACED refusal: EIO for that one path, on both read roads, until undone */
const refuse = (file) => {
  const rf = fs.readFileSync, rp = fs.promises.readFile, eio = () => Object.assign(new Error(`EIO: i/o error, read '${path.basename(file)}' (placed)`), { code: 'EIO', errno: -5 });
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === file) throw eio(); return rf.call(fs, p, ...a); };
  fs.promises.readFile = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === file) return Promise.reject(eio()); return rp.call(fs.promises, p, ...a); };
  return () => { fs.readFileSync = rf; fs.promises.readFile = rp; };
};
/** a src file's IN-MEMORY copy with its anchors replaced (never written to disk): its requires resolve from its own folder */
const mutant = (rel, edits) => {
  const file = path.join(REPO, rel); let src = RAW.call(fs, file, 'utf8');
  for (const [a, b] of edits) { if (!src.includes(a)) return null; src = src.split(a).join(b); }
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports;
};
const codeOf = (fn) => { try { fn(); return null; } catch (e) { return { code: e && e.code, status: e && e.status, message: String((e && e.message) || '') }; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(20); } return !!fn(); };
const WH = require('../src/channels/webhook.js');
const WP = require('../src/webhook-pair.js');
const PT = require('../src/pairing-token.js');
const HOLD = require('../src/store-read-hold.js');
const CODE = 'webhook_callers_unread', PCODE = 'webhook_pairing_unread';
// the journal of this run (the secret lens reads every line the product says)
const said = [];
for (const k of ['log', 'warn', 'error']) { const f = console[k].bind(console); console[k] = (...a) => { said.push(a.map(String).join(' ')); if (k === 'log') f(...a); }; }
// MADE-UP callers: a Bearer caller (a hash of a token minted here) and an HMAC one (a stand-in sealed field)
const TOKEN_A = PT.mintToken('webhook');
const SEALED = ['made-up', 'sealed', crypto.randomBytes(6).toString('hex')].join('-');
const plantDoc = () => ({ v: 1, paths: { ci: { title: 'CI', replyName: 'VibeSpace', createdAt: 1, callers: [
  { id: 'c-0000aaaa', name: 'made-up ci bot', kind: 'system', auth: 'bearer', tokenHash: PT.tokenHash(TOKEN_A), generation: 1, delivery: { mode: 'poll' }, registeredAt: 1, rotatedAt: null, revokedAt: null, lastCallAt: null },
  { id: 'c-0000bbbb', name: 'made-up deploy hook', kind: 'system', auth: 'hmac', tokenEnc: SEALED, generation: 1, delivery: { mode: 'none' }, registeredAt: 1, rotatedAt: null, revokedAt: null, lastCallAt: null },
] } } });
const box = { seal: (x) => 'sealed:' + Buffer.from(String(x)).toString('base64'), open: (v) => Buffer.from(String(v).slice(7), 'base64').toString() };
const dirOf = (tag) => { const d = path.join(scratch('wh-held'), tag); fs.mkdirSync(d, { recursive: true, mode: 0o700 }); return d; };
const plant = (dir, doc = plantDoc()) => { const f = path.join(dir, WH.CALLERS_FILE || 'callers.json'); fs.writeFileSync(f, JSON.stringify(doc, null, 2), { mode: 0o600 }); return f; };
const fresh = () => { delete require.cache[require.resolve('../src/channels/webhook.js')]; return require('../src/channels/webhook.js'); };
const tmpLeft = (dir) => fs.readdirSync(dir).filter((n) => n.includes('.tmp-'));
const stopAll = (...ss) => { for (const s of ss) { try { s && s.stopHold && s.stopHold(); } catch { } try { s && s.stop && s.stop(); } catch { } } };

console.log('① THE STORE: callers.json held on a failed read — nothing reads «no paths», nothing is written over it');
{
  const dir = dirOf('store'); const file = plant(dir); const before = onDisk(file);
  const undo = refuse(file);
  const S = fresh().callersStore(dir, { secrets: box });
  const r = codeOf(() => S.paths());
  ok(!!r && r.code === CODE && r.status === 503, 'a failed read is no «no paths»: a read throws the hold\'s refusal BY NAME (503 webhook_callers_unread)', r || { paths: S.paths() });
  const acts = [
    ['a new path', () => S.putPath('made-up-new', { title: 'new' })],
    ['a registration', () => S.register('ci', { name: 'third made-up caller', auth: 'bearer', delivery: { mode: 'none' } })],
    ['a rotation', () => S.rotate('ci', 'c-0000aaaa')],
    ['a revocation', () => S.revoke('ci', 'c-0000aaaa')],
    ['a delivery change', () => S.setDelivery('ci', 'c-0000aaaa', { mode: 'none' })],
    ['a pairing', () => S.pair('ci', { id: 'c-0000dddd', name: 'made-up peer', token: PT.mintToken('webhook'), outToken: PT.mintToken('webhook'), outCaller: 'c-0000eeee', replyUrl: 'https://peer.example.invalid/hook/ci' })],
    ['a take-back', () => S.unregister('ci', 'c-0000aaaa')],
    ['a poll count', () => S.notePollDropped('ci', 'c-0000aaaa', 3)],
  ];
  const got = acts.map(([what, fn]) => [what, codeOf(fn)]);
  ok(got.every(([, e]) => e && e.code === CODE && e.status === 503), 'every writer is refused BY NAME before its side effect (a new path, a registration, a rotation, a revocation, a delivery, a pairing, a take-back, a poll count)', got.map(([w, e]) => `${w}: ${e ? e.code : 'WROTE'}`));
  ok(onDisk(file) === before && tmpLeft(dir).length === 0, 'the file is byte for byte what it was, no temp file left — nothing was written over the unread list', { same: onDisk(file) === before, tmp: tmpLeft(dir) });
  const words = typeof S.heldWords === 'function' ? S.heldWords() : null;
  const lens = [TOKEN_A, PT.tokenHash(TOKEN_A), SEALED, dir, 'made-up ci bot'];
  ok(!!words && /webhook callers/.test(words) && /try again later/.test(words) && lens.every((x) => !words.includes(x)) && got.every(([, e]) => e && lens.every((x) => !e.message.includes(x))), 'the hold\'s words name the store plainly and what still holds — no token, hash, sealed field, caller name or folder path in them or in a refusal', words);
  // a START while held holds again (a fresh module = a restart over the same unread file)
  const S2 = fresh().callersStore(dir, { secrets: box });
  const r2 = codeOf(() => S2.callersRaw('ci'));
  ok(!!r2 && r2.code === CODE && onDisk(file) === before, 'a START while held holds again: the same refusal, nothing written', r2);
  stopAll(S2);
  // the read again LIFTS: the rows back, and the next registration keeps them
  undo();
  const lifted = await HOLD.readAgainOf('callers.json');
  let reg = null; try { reg = S.register('ci', { name: 'third made-up caller', auth: 'bearer', delivery: { mode: 'none' } }); } catch (e) { reg = { error: e.code || e.message }; }
  const after = JSON.parse(onDisk(file) || '{}');
  const ids = ((after.paths || {}).ci || {}).callers?.map((c) => c.id) || [];
  ok(lifted === true && ids.includes('c-0000aaaa') && ids.includes('c-0000bbbb') && ids.length === 3 && !!(reg && reg.token), 'the read again LIFTS with no restart: both made-up callers are back and the next registration keeps them (three rows on disk)', { lifted, ids, reg: reg && (reg.error || 'ok') });
  stopAll(S);
}
{
  // torn bytes: kept aside ONCE per content (0600), then the list starts empty and names the copy
  const dir = dirOf('torn'); const file = path.join(dir, 'callers.json'); const TORN = '{"v":1,"paths":{"ci":{"callers":[{"id":"c-0000aaaa","tokenHash":"' + 'h'.repeat(12);
  fs.writeFileSync(file, TORN, { mode: 0o600 });
  const S = fresh().callersStore(dir, { secrets: box });
  try { S.paths(); } catch { }
  await until(() => typeof S.torn === 'function' && !!S.torn());
  const copies = () => fs.readdirSync(dir).filter((n) => n.startsWith('callers.json.corrupt-'));
  const c1 = copies();
  const t1 = typeof S.torn === 'function' ? S.torn() : null;
  ok(c1.length === 1 && onDisk(path.join(dir, c1[0])) === TORN && (fs.statSync(path.join(dir, c1[0])).mode & 0o777) === 0o600 && !!t1 && t1.copy === c1[0], 'torn bytes are kept aside ONCE (the same bytes, 0600) and the lift names the copy by its base name', { copies: c1, torn: t1 });
  let paths = null; try { paths = S.paths(); } catch (e) { paths = e.code; }
  ok(Array.isArray(paths) && paths.length === 0 && typeof S.lostSlug === 'function' && S.lostSlug('ci') === true && S.lostSlug !== undefined, 'then the list starts empty — and a path it may have lost is known as such for this run (the door answers it «try again later»)', { paths });
  stopAll(S);
  fs.writeFileSync(file, TORN, { mode: 0o600 });   // the same torn bytes met again at the next start
  const S2 = fresh().callersStore(dir, { secrets: box });
  try { S2.paths(); } catch { }
  await until(() => typeof S2.torn === 'function' && !!S2.torn());
  ok(copies().length === 1 && !!(S2.torn && S2.torn()) && S2.torn().copy === c1[0], 'a second start over the same torn bytes finds their copy and makes none', copies());
  stopAll(S2);
}

console.log('② THE PENDING CODES: pair-pending.json held on a failed read');
{
  const dir = dirOf('pending'); const file = path.join(dir, WH.PENDING_FILE);
  const NOW = Date.now();
  const row = { slug: 'ci', callerId: 'c-0000cccc', tokenEnc: box.seal(PT.mintToken('webhook')), nonce: 'f'.repeat(32), name: 'made-up hub', repair: false, person: true, mintedAt: NOW, exp: NOW + WP.CODE_TTL_MS, spent: false, spentAt: null };
  fs.writeFileSync(file, JSON.stringify({ v: 1, rows: [row] }), { mode: 0o600 });
  const before = onDisk(file);
  const undo = refuse(file);
  const door = WH.pairPendingDoor(dir, { secrets: box });
  const pm = WP.createPending();
  const b = codeOf(() => pm.bind({ read: door.read, write: door.write }, NOW));
  const put = codeOf(() => pm.put({ slug: 'ci', callerId: 'c-0000ffff', token: PT.mintToken('webhook'), nonce: 'e'.repeat(32) }, NOW));
  const w = codeOf(() => door.write([{ slug: 'ci', callerId: 'c-0000ffff', token: PT.mintToken('webhook'), nonce: 'e'.repeat(32), exp: NOW + 1 }]));
  ok(!!b && b.code === PCODE && b.status === 503, 'a failed read is no «no code pending»: the bind is refused BY NAME (503 webhook_pairing_unread)', b);
  ok(!!w && w.code === PCODE && onDisk(file) === before && !put, 'a write is refused by name and the file is byte for byte what it was (the code minted before is not written over)', { write: w, same: onDisk(file) === before });
  undo();
  let rebound = false;
  if (door && typeof door === 'object') door.onLift = () => { pm.bind({ read: door.read, write: door.write }, Date.now()); rebound = true; };
  const lifted = await HOLD.readAgainOf(WH.PENDING_FILE);
  const got = pm.get('ci', 'c-0000cccc', Date.now());
  ok(lifted === true && rebound && !!got && got.nonce === row.nonce, 'the read again LIFTS: the door binds again and the code minted before is pending (its token opened)', { lifted, rebound, got: !!got });
  try { door.stop && door.stop(); } catch { }
}

console.log('③ THE ROUTES: a real engine and the real routes on loopback');
const ENG = require('../src/server/channels-engine.js');
const express = require('express');
const routePath = require.resolve('../src/routes/webhook.js');
const chanPath = require.resolve('../src/routes/channels.js');
async function instance(tag) {
  const dataDir = scratch('wh-held-' + tag);
  delete require.cache[routePath]; delete require.cache[chanPath];
  const R = require(routePath);
  const bc = [];
  const settings = { 'channels.pushCoalesceSeconds': 0, 'webhook.allowPrivateReplyUrl': true };
  const eng = ENG.create({ dataDir, env: {}, broadcast: (m) => bc.push(m), log: { log() {}, warn() {}, error() {} }, deliver: { async deliverToConversation() { return { ok: true, lane: 'message' }; }, stashFor() {} }, serverSetting: (k) => settings[k], liveSessions: () => [], httpInbound: true });
  const deps = { getEngine: () => eng, dataDir, serverSetting: (k) => settings[k], now: () => Date.now() };
  R.setup(deps);
  require(chanPath).setup({ getEngine: () => eng });
  const app = express(); app.use(R.router);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  app.locals.instancePublicUrl = `http://127.0.0.1:${port}`;
  const bodies = [];
  const call = (method, p, { headers = {}, body = null } = {}) => new Promise((resolve) => {
    const b = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(b !== null ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(b)) } : {}), ...headers } }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { bodies.push(t); let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, headers: res.headers, t, j }); }); });
    req.on('error', (e) => resolve({ status: 0, t: String(e.code), j: null }));
    if (b !== null) req.write(b); req.end();
  });
  const whDir = path.join(dataDir, 'channels', 'webhook');
  const halt = () => new Promise((r) => { try { eng.stop && eng.stop(); } catch { } srv.closeAllConnections && srv.closeAllConnections(); srv.close(() => r()); });
  // the store the engine and the routes share: the module copy loaded NOW (① loaded fresh copies of it)
  return { dataDir, whDir, eng, R, deps, call, bodies, bc, halt, store: () => require('../src/channels/webhook.js').callersStore(whDir) };
}
const A = await instance('a');
try {
  const mk = await A.call('POST', '/api/channels/webhook/paths', { body: { slug: 'ci', title: 'CI' } });
  const rg = await A.call('POST', '/api/channels/webhook/paths/ci/callers', { body: { name: 'made-up ci bot', auth: 'bearer', delivery: { mode: 'poll' } } });
  const tok = rg.j && rg.j.token, cid = rg.j && rg.j.caller && rg.j.caller.id;
  const hook = (text) => A.call('POST', '/hook/ci', { headers: { Authorization: `Bearer ${tok}` }, body: { text } });
  const first = await hook('made-up event one');
  const code1 = await A.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: { name: 'made-up hub' } });
  ok(mk.status === 200 && rg.status === 200 && !!tok && first.status === 200 && code1.status === 200 && !!(code1.j && code1.j.code), 'FIXTURE: a path, a Bearer caller and one call taken in; one pairing code pending', [mk.status, rg.status, first.status, code1.status]);
  const cfile = path.join(A.whDir, 'callers.json'), pfile = path.join(A.whDir, WH.PENDING_FILE);
  const cBefore = onDisk(cfile), pBefore = onDisk(pfile);
  // the next start meets an unreadable callers.json (its doc dropped; the routes' first look reads it again)
  const undoC = refuse(cfile);
  A.store().reset();
  const statsBefore = A.R.stats();
  const h1 = await hook('made-up event two');
  const statsAfter = A.R.stats();
  ok(h1.status === 503 && h1.j && h1.j.error === 'try-again-later' && h1.headers['retry-after'] === '60', 'a registered caller\'s call while held hears «try again later» (503, Retry-After 60) — never the 401 of an unknown caller', { status: h1.status, body: h1.j });
  ok(statsAfter.bodyReads === statsBefore.bodyReads && statsAfter.accepted === statsBefore.accepted && !A.R.ipGate.blocked('127.0.0.1', Date.now()), 'nothing is read, stored or charged for it (no body read, nothing accepted, the stranger gate not charged)', { before: statsBefore.bodyReads, after: statsAfter.bodyReads });
  const poll = await A.call('GET', '/api/channels/webhook/ci/replies', { headers: { Authorization: `Bearer ${tok}` } });
  ok(poll.status === 503 && poll.j && poll.j.error === 'try-again-later', 'its poll hears «try again later» too, never 401', { status: poll.status, body: poll.j });
  const list = await A.call('GET', '/api/channels/webhook/paths');
  const newPath = await A.call('POST', '/api/channels/webhook/paths', { body: { slug: 'made-up-new', title: 'new' } });
  const reg = await A.call('POST', '/api/channels/webhook/paths/ci/callers', { body: { name: 'second made-up caller', auth: 'bearer' } });
  const rot = await A.call('POST', `/api/channels/webhook/paths/ci/callers/${cid}/rotate`, { body: {} });
  const pc = await A.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: {} });
  const join = await A.call('POST', '/api/channels/webhook/join', { body: { code: 'made-up-not-a-code' } });
  const owners = [['the paths list', list], ['a new path', newPath], ['a registration', reg], ['a rotation', rot], ['a pairing code', pc], ['a join', join]];
  ok(owners.every(([, r]) => r.status === 503 && r.j && r.j.code === CODE && /webhook callers/.test(r.j.error)), 'every owner verb is refused BY NAME (503 webhook_callers_unread, the hold\'s words): the paths list, a new path, a registration, a rotation, a pairing code, a join', owners.map(([w, r]) => `${w}: ${r.status} ${r.j && r.j.code}`));
  ok(onDisk(cfile) === cBefore && onDisk(pfile) === pBefore && tmpLeft(A.whDir).length === 0, 'callers.json and pair-pending.json are byte for byte what they were', { callers: onDisk(cfile) === cBefore, pending: onDisk(pfile) === pBefore });
  const dc = WP.decodeCode(code1.j.code, Date.now());
  const comp = await A.call('POST', '/api/channels/webhook/ci/pair', { headers: { 'X-Webhook-Caller': dc.ok ? dc.caller : 'c-00000000' }, body: '{}' });
  ok(comp.status === 503 && comp.j && comp.j.code === 'store-blocked' && !!A.R.pending.get('ci', dc.caller, Date.now()) && !A.R.pending.get('ci', dc.caller, Date.now()).spent, 'the completion of a pairing answers store-blocked (the other side reads «try the same code again once it reads»): the code not spent', { status: comp.status, body: comp.j });
  let send = null; try { send = await A.eng.composeEach({ kind: 'user' }, 'webhook', 'ci', { direct: true, text: 'made-up reply', recipients: [cid] }); } catch (e) { send = { thrown: String(e && e.message) }; }
  const sendText = JSON.stringify(send);
  ok(/cannot read its webhook callers/.test(sendText) && !/no longer a caller|no caller|not-found/.test(sendText), 'an owner\'s send says the hold, never «no longer a caller» or «not found»', sendText.slice(0, 300));
  // THE LIFT: the read again answers — the same call is taken in, the list is whole
  undoC();
  const lifted = await HOLD.readAgainOf('callers.json');
  const h2 = await hook('made-up event three');
  const list2 = await A.call('GET', '/api/channels/webhook/paths');
  const ci = list2.j && (list2.j.paths || []).find((p) => p.slug === 'ci');
  ok(lifted === true && h2.status === 200 && !!ci && ci.callers.some((c) => c.id === cid), 'after the lift the same caller\'s call is taken in and the paths list is whole — with no restart', { lifted, hook: h2.status, list: list2.status });
  // THE PENDING CODES held at a start of the routes (a fresh bind over an unreadable pair-pending.json)
  const undoP = refuse(pfile);
  A.R.setup(A.deps);
  const pc2 = await A.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: {} });
  ok(pc2.status === 503 && pc2.j && pc2.j.code === PCODE && onDisk(pfile) === pBefore, 'with pair-pending.json held a new pairing code is refused BY NAME (503 webhook_pairing_unread), the file unchanged — the code minted before is not written over', { status: pc2.status, code: pc2.j && pc2.j.code, same: onDisk(pfile) === pBefore });
  undoP();
  const liftedP = await HOLD.readAgainOf(WH.PENDING_FILE);
  ok(liftedP === true && !!A.R.pending.get('ci', dc.caller, Date.now()), 'the lift binds the codes again: the one minted before is pending', { liftedP });
  // THE SECRET LENS over every answer, journal line and broadcast of this part
  const lens = [tok, PT.tokenHash(String(tok)), code1.j.code];
  const seen = [...A.bodies.filter((b) => !b.includes('"shownOnce":true')), ...said, ...A.bc.map((m) => JSON.stringify(m))];
  ok(!!tok && lens.every((x) => !seen.some((t) => t.includes(x))), 'THE SECRET LENS: no token, token hash or pairing code in any answer (but the two shown once), journal line or broadcast', seen.filter((t) => lens.some((x) => t.includes(x))).map((t) => t.slice(0, 80)));
} finally { await A.halt(); }
{
  // a torn lift of this run: the path it lost answers «try again later», never «unknown»; the paths list names the copy
  const B = await instance('b');
  try {
    await B.call('POST', '/api/channels/webhook/paths', { body: { slug: 'ci', title: 'CI' } });
    const rg = await B.call('POST', '/api/channels/webhook/paths/ci/callers', { body: { name: 'made-up ci bot', auth: 'bearer', delivery: { mode: 'none' } } });
    const tok = rg.j && rg.j.token;
    const cfile = path.join(B.whDir, 'callers.json');
    fs.writeFileSync(cfile, '{"v":1,"paths":{"ci":', { mode: 0o600 });
    B.store().reset();
    try { B.store().paths(); } catch { }
    await until(() => { const s = B.store(); return typeof s.torn === 'function' && !!s.torn(); });
    const h = await B.call('POST', '/hook/ci', { headers: { Authorization: `Bearer ${tok}` }, body: { text: 'made-up event' } });
    const l = await B.call('GET', '/api/channels/webhook/paths');
    ok(h.status === 503 && h.j && h.j.error === 'try-again-later', 'after a torn lift a caller of the path it lost hears «try again later» this run, never 401', { status: h.status, body: h.j });
    ok(l.status === 200 && l.j && l.j.torn && /^callers\.json\.corrupt-/.test(l.j.torn.copy), 'the paths list says the list was damaged and names its copy (the page words it in place)', l.j);
  } finally { await B.halt(); }
}
{
  // the page words both held codes and the torn lift, in zh and ja too (the rows move to the family's ONE table when it is in base)
  const page = onDisk(path.join(REPO, 'src/lib/webhook-view.js')) || '';
  const zh = onDisk(path.join(REPO, 'src/lib/i18n-zh.js')) || '', ja = onDisk(path.join(REPO, 'src/lib/i18n-ja.js')) || '';
  const keys = [...page.matchAll(/t\("(The webhook callers list was damaged[^"]*)"/g)].map((m) => m[1]);
  const held = /const HELD_CODES = new Set\(\['webhook_callers_unread', 'webhook_pairing_unread'\]\);/.test(page) && /export function heldWords\(r\) \{ return r && HELD_CODES\.has\(r\.code\) \? String\(r\.error \|\| r\.code\) : null; \}/.test(page);
  const notHere = ['VibeSpace cannot read its webhook callers', 'VibeSpace cannot read its pending pairing codes'].every((w) => !zh.includes(w) && !ja.includes(w));
  ok(held && notHere && /export function tornWords/.test(page) && keys.length === 1 && !/restore/i.test(keys[0]) && zh.includes(JSON.stringify(keys[0]) + ':') && ja.includes(JSON.stringify(keys[0]) + ':'), 'the page says both held codes IN PLACE (the hub\'s words until the family\'s ONE table holds their rows — r3168: never in this unit\'s dictionaries) and words the torn lift in zh and ja (never «restore that copy»)', { held, notHere, keys });
}

console.log('④ RED CONTROLS');
{
  const dir = dirOf('control'); const file = plant(dir); const before = onDisk(file);
  const undo = refuse(file);
  const cutRead = mutant('src/channels/webhook.js', [["    hold.refuse('reading the webhook callers');\n", '']]);
  let s1 = null; try { s1 = cutRead && cutRead.callersStore(dir, { secrets: box }); } catch { s1 = null; }
  let p1 = null; try { p1 = s1 ? s1.paths() : null; } catch (e) { p1 = e.code; }
  ok(Array.isArray(p1) && p1.length === 0, 'CONTROL: the store with its read guard cut answers «no paths» over the unread file — ①\'s first leg turns RED', p1);
  stopAll(s1);
  const cutBoth = mutant('src/channels/webhook.js', [["    hold.refuse('reading the webhook callers');\n", ''], ["if (!hold.writable('a webhook callers change')) throw hold.refusal('this change'); ", '']]);
  let s2 = null; try { s2 = cutBoth && cutBoth.callersStore(path.join(dir), { secrets: box }); } catch { s2 = null; }
  try { s2 && s2.putPath('made-up-new', { title: 'new' }); } catch { }
  const after = onDisk(file);
  ok(!!s2 && after !== before && JSON.parse(after).paths['made-up-new'] && !JSON.parse(after).paths.ci, 'CONTROL: with its read and save guards cut, a new path writes over the file — every made-up caller gone (the release\'s shape)', { after: after && after.slice(0, 120) });
  stopAll(s2);
  undo();
}
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);

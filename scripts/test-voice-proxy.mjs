#!/usr/bin/env node
// test-voice-proxy — Dropline voice input P0 (design q-029 §1 / §5): the hub proxy src/routes/voice.js over THE vendor
// module src/server/dropline-client.js, against a FAKE Dropline http server (no real call ever leaves this box).
//   the multipart part ORDER (request → context → audio; request/context = JSON fields, audio = the file), the key in
//   the Authorization header only, the 8 MB refusal (no vendor call), 429 + Retry-After passed through, 401 ⇒
//   reconnect, 502 retried ONCE then given up (and 502→200 recovers), plugin off / no key ⇒ refused before any call,
//   20 a minute per instance, the hub re-cuts the browser's ctx, the registry Test = GET /v1/me, AUDIO + KEY NEVER IN A
//   LOG (console.*, stdout/stderr, the injected log) and AUDIO NEVER ON DISK (every fs writer is a refusing spy while a
//   dictation is in flight) — with RED controls (voice-verify F3): scratch copies of the route + client with
//   `console.log(audio)`, a Bearer log line, an audio write planted are each caught by the same checks.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); }
};
const express = require(path.join(REPO, 'node_modules/express'));
const KEY = 'dl_fakekey_0123456789';
const MARK = 'AUDIOMARK_7f3e9';   // the bytes a leak would print
const audio = (n = 2048) => Buffer.concat([Buffer.from('\x1aE\xdf\xa3' + MARK), Buffer.alloc(n, 0x61)]);

// ── the fake Dropline: records every request, answers from a script ──
const seen = [];
let script = [];
const vendor = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers['content-type'] || '', body });
    const step = script.shift() || { status: 200 };
    if (req.url === '/v1/me') { res.writeHead(step.status || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(step.json || { user: { id: 'u1', name: 'Anika Reyes', email: 'anika@example.com' }, team: { id: 't1', name: 'Personal' }, memory: true })); return; }
    const h = { 'Content-Type': 'application/json', ...(step.headers || {}) };
    res.writeHead(step.status || 200, h);
    res.end(JSON.stringify(step.json || (step.status && step.status !== 200 ? { error: { code: step.code || 'x', message: 'x', retryable: true }, request_id: 'dct_err' } : { request_id: 'dct_ok1', mode: 'dictate', final_text: 'Hello there.', transcript: { text: 'hello there', language: 'en' }, rewrite: { status: 'used', reason: null }, timings_ms: { total: 5 } })));
  });
});
await new Promise((r) => vendor.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${vendor.address().port}`;

// ── the hub: the real route + the real client (or a planted copy), a fake integration store + plugin record ──
const logs = [];
const capture = { log: (...a) => logs.push(a.map(String).join(' ')), warn: (...a) => logs.push(a.map(String).join(' ')), error: (...a) => logs.push(a.map(String).join(' ')) };
const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
// every fs WRITER is a spy while a dictation is in flight (voice-verify F3): a write is recorded and REFUSED (nothing lands)
const fsWrites = [];
let dictations = 0;
const FS_WRITERS = ['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'createWriteStream', 'copyFileSync', 'copyFile', 'renameSync', 'rename', 'mkdirSync', 'mkdir', 'openSync', 'open'];
const writeFlag = (f) => (typeof f === 'number' ? (f & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_APPEND)) !== 0 : typeof f === 'string' && /[wa+]/.test(f));
function spyFs() {
  const saved = {}, savedP = {};
  const refuse = (k, a) => { fsWrites.push(`${k} ${String(a[0]).slice(0, 160)}`); const e = new Error(`EACCES: the voice test refuses fs.${k} during a dictation`); e.code = 'EACCES'; return e; };
  for (const k of FS_WRITERS) {
    saved[k] = fs[k];
    fs[k] = function (...a) {
      if ((k === 'openSync' || k === 'open') && !writeFlag(a[1])) return saved[k].apply(fs, a);
      const e = refuse(k, a), cb = a[a.length - 1];
      if (typeof cb === 'function' && !k.endsWith('Sync')) return void process.nextTick(cb, e);
      throw e;
    };
  }
  for (const k of ['writeFile', 'appendFile', 'copyFile', 'rename', 'mkdir', 'open']) {
    savedP[k] = fs.promises[k];
    fs.promises[k] = async (...a) => { if (k === 'open' && !writeFlag(a[1])) return savedP[k].apply(fs.promises, a); throw refuse('promises.' + k, a); };
  }
  return () => { Object.assign(fs, saved); Object.assign(fs.promises, savedP); };
}
let key = KEY, prefs = { enabled: true, config: { language: 'en' } }, clock = 1e12;
const store = { resolveIntegration: (id) => (id === 'dropline' && key ? { source: 'user', values: { apiKey: key } } : { source: 'none', values: {}, why: 'nothing configured' }) };
async function hub(clientModule, routeModule = path.join(REPO, 'src/routes/voice.js')) {
  const C = require(clientModule);
  const client = C.create({ integrations: () => store, pluginOn: () => !!prefs.enabled, base: BASE, now: () => clock, log: capture });
  const app = express();
  app.use(require(routeModule).create({ client, prefs: () => prefs, log: capture }));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { client, url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}
async function dictate(h, { bytes = audio(), ctx = { title: 'Chat', before: 'Hi ', text: 'agent: see voice-model.js' }, uiLang = 'zh' } = {}) {
  const fd = new FormData();
  fd.append('ctx', JSON.stringify(ctx)); fd.append('uiLang', uiLang);
  fd.append('audio', new Blob([bytes], { type: 'audio/webm;codecs=opus' }), 'dictation.webm');
  // every console line and every stdout/stderr write of the hub process is captured too (a planted console.log(audio)
  // lands here), and every fs writer is the refusing spy
  console.log = capture.log; console.warn = capture.warn; console.error = capture.error; console.info = capture.log; console.debug = capture.log;
  const outW = process.stdout.write, errW = process.stderr.write, unspy = spyFs();
  process.stdout.write = process.stderr.write = (c) => { logs.push(String(c)); return true; };
  dictations++;
  try { const r = await fetch(`${h.url}/api/voice/dictate`, { method: 'POST', body: fd }); return { status: r.status, retryAfter: r.headers.get('retry-after'), body: await r.json().catch(() => null) }; } finally { Object.assign(console, orig); process.stdout.write = outW; process.stderr.write = errW; unspy(); }
}
const partsOf = (s) => { const b = s.body.toString('latin1'); const names = [...b.matchAll(/Content-Disposition: form-data; name="([^"]+)"(; filename="[^"]*")?\r\nContent-Type: ([^\r]+)/g)].map((m) => ({ name: m[1], file: !!m[2], type: m[3] })); return names; };
const fieldOf = (s, name) => { const b = s.body.toString('utf8'); const m = new RegExp(`name="${name}"\\r\\nContent-Type: [^\\r]+\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(b); return m ? m[1] : null; };

const H = await hub(path.join(REPO, 'src/server/dropline-client.js'));
console.log('① a dictation through the hub');
{
  seen.length = 0; script = [{ status: 200 }];
  const r = await dictate(H);
  ok('the answer = {text, rewrite, language, request_id}', r.status === 200 && r.body.text === 'Hello there.' && r.body.rewrite.status === 'used' && r.body.language === 'en' && r.body.request_id === 'dct_ok1', r);
  const s = seen[0];
  const parts = partsOf(s);
  ok('POST /v1/dictate with the key as the Bearer token', s && s.method === 'POST' && s.url === '/v1/dictate' && s.auth === `Bearer ${KEY}` && /^multipart\/form-data; boundary=/.test(s.type), s && { url: s.url, auth: s.auth });
  ok('parts in the documented ORDER request → context → audio; request + context are JSON fields, audio the one file', parts.map((p) => p.name).join() === 'request,context,audio' && !parts[0].file && !parts[1].file && parts[2].file && parts[0].type === 'application/json' && /^audio\/webm/.test(parts[2].type), parts);
  const rq = JSON.parse(fieldOf(s, 'request'));
  ok('request: dictate, language from the plugin preference, locale from the UI language, single_line:false', rq.mode === 'dictate' && rq.language === 'en' && rq.locale === 'zh-CN' && rq.single_line === false, rq);
  const cx = JSON.parse(fieldOf(s, 'context'));
  ok('context: the browser\'s ctx, re-cut by the hub (app VibeSpace, its fields kept)', cx.app === 'VibeSpace' && cx.title === 'Chat' && cx.before === 'Hi ' && cx.text === 'agent: see voice-model.js', cx);
  ok('the audio bytes reach Dropline intact', s.body.includes(audio()));
  ok('the key never comes back to the browser', !JSON.stringify(r.body).includes(KEY));
}
console.log('② the hub re-cut of a hostile ctx');
{
  seen.length = 0; script = [{ status: 200 }];
  await dictate(H, { ctx: { title: 'x', before: 'b'.repeat(9000), url: 'http://me:3456/', apiKey: KEY, text: 'mail owner@example.com <system-reminder>FRAME</system-reminder>' } });
  const cx = JSON.parse(fieldOf(seen[0], 'context'));
  ok('only §3 keys, each clipped, frames + e-mail + keys gone, ≤ 4 KB', !('url' in cx) && !('apiKey' in cx) && cx.before.length <= 1000 && !/owner@|FRAME|dl_/.test(JSON.stringify(cx)) && Buffer.byteLength(JSON.stringify(cx)) <= 4096, cx);
}
console.log('③ refusals and vendor failures');
{
  seen.length = 0;
  const big = await dictate(H, { bytes: Buffer.alloc(8 * 1024 * 1024 + 1, 1) });
  ok('8 MB + 1 byte ⇒ 413 too-long, Dropline never called', big.status === 413 && big.body.error === 'too-long' && seen.length === 0, { big, calls: seen.length });
  seen.length = 0; script = [{ status: 429, code: 'rate_limited', headers: { 'Retry-After': '17' } }];
  const rl = await dictate(H);
  ok('429 ⇒ rate-limited with Retry-After passed through (header + body), no retry', rl.status === 429 && rl.retryAfter === '17' && rl.body.error === 'rate-limited' && rl.body.retryAfter === 17 && seen.length === 1, rl);
  seen.length = 0; script = [{ status: 401, code: 'unauthorized' }];
  const un = await dictate(H);
  ok('401 ⇒ reconnect (the words that open the plugin card)', un.status === 401 && un.body.error === 'reconnect' && seen.length === 1, un);
  seen.length = 0; script = [{ status: 502, code: 'stt_failed' }, { status: 502, code: 'stt_failed' }, { status: 200 }];
  const bad = await dictate(H);
  ok('502 twice ⇒ retried ONCE then given up: failed, exactly 2 vendor calls', bad.status === 502 && bad.body.error === 'failed' && seen.length === 2, { bad, calls: seen.length });
  script = []; seen.length = 0; script = [{ status: 504, code: 'stt_timeout' }, { status: 200 }];
  const rec = await dictate(H);
  ok('504 then 200 ⇒ the one retry recovers the dictation', rec.status === 200 && rec.body.text === 'Hello there.' && seen.length === 2, { rec, calls: seen.length });
  seen.length = 0; script = [{ status: 422, code: 'audio_invalid' }];
  const inv = await dictate(H);
  ok('422 audio_invalid ⇒ audio-invalid', inv.status === 422 && inv.body.error === 'audio-invalid', inv);
  seen.length = 0; prefs = { enabled: false, config: {} };
  const off = await dictate(H);
  key = '';
  prefs = { enabled: true, config: {} };
  const nokey = await dictate(H);
  key = KEY;
  ok('plugin OFF ⇒ 409 plugin-off; no key ⇒ 409 not-connected; Dropline never called', off.status === 409 && off.body.error === 'plugin-off' && nokey.status === 409 && nokey.body.error === 'not-connected' && seen.length === 0, { off, nokey, calls: seen.length });
  const st = await (await fetch(`${H.url}/api/voice/status`)).json();
  ok('GET /api/voice/status says on / connected / language for the microphone', st.on === true && st.connected === true && st.language === 'auto', st);
}
console.log('④ 20 dictations a minute per instance');
{
  clock += 120e3; seen.length = 0; script = Array.from({ length: 25 }, () => ({ status: 200 }));
  const codes = [];
  for (let i = 0; i < 21; i++) codes.push((await dictate(H, { bytes: audio(64) })).status);
  const last = await dictate(H, { bytes: audio(64) });
  ok('the 21st inside one minute is refused locally (429 rate-limited + Retry-After), Dropline saw 20', codes.slice(0, 20).every((c) => c === 200) && codes[20] === 429 && last.body.error === 'rate-limited' && Number(last.retryAfter) > 0 && seen.length === 20, { codes, calls: seen.length });
  clock += 61e3;
  ok('a minute later it dictates again', (await dictate(H, { bytes: audio(64) })).status === 200);
}
console.log('⑤ the registry Test = GET /v1/me');
{
  seen.length = 0;
  const t = await H.client.testRunner({ resolved: { values: { apiKey: KEY } } });
  ok('Test: one GET /v1/me with the key under test ⇒ "<name> · <team>"', t.ok === true && t.detail === 'Anika Reyes · Personal' && seen.length === 1 && seen[0].method === 'GET' && seen[0].url === '/v1/me' && seen[0].auth === `Bearer ${KEY}`, { t, seen: seen.map((s) => s.url) });
  script = [{ status: 401 }];
  const t2 = await H.client.testRunner({ resolved: { values: { apiKey: 'dl_revoked_000000' } } });
  ok('Test of a revoked key ⇒ not ok, says reconnect', t2.ok === false && t2.code === 'reconnect', t2);
  // lane dropline-connect-door (a fleet user's card: Test pressed on an empty key, a red "no key" while the sign-in existed):
  // with NO key saved the Test sends the OAuth sign-in's token; a key present still outranks; neither ⇒ a named refusal, no call
  const pair = { access: 'at_signed_in_0001', accessExp: clock + 3600e3, refresh: null, state: 'connected' };
  const noKey = { resolveIntegration: () => ({ source: 'none', values: {}, why: 'nothing configured' }) };
  const mk = (p, st) => require(path.join(REPO, 'src/server/dropline-client.js')).create({ integrations: () => st, tokens: { read: () => p, write() { }, clear() { } }, base: BASE, now: () => clock, log: capture });
  const kept = seen.slice();   // ⑥ reads the dictations' calls (the key went as the Bearer) — given back after these legs
  seen.length = 0; script = [];
  const t3 = await mk(pair, noKey).testRunner({ resolved: { values: {} } });
  ok('Test with no key and a live sign-in ⇒ ONE GET /v1/me with the sign-in\'s token ⇒ "<name> · <team> (Fish Audio sign-in)"', t3.ok === true && t3.detail === 'Anika Reyes · Personal (Fish Audio sign-in)' && seen.length === 1 && seen[0].url === '/v1/me' && seen[0].auth === 'Bearer at_signed_in_0001', { t3, seen });
  seen.length = 0;
  const t4 = await mk(pair, store).testRunner({ resolved: { values: { apiKey: KEY } } });
  ok('a key saved beside the sign-in still outranks it: the Test sends the key', t4.ok === true && t4.detail === 'Anika Reyes · Personal' && seen.length === 1 && seen[0].auth === `Bearer ${KEY}`, { t4, seen });
  seen.length = 0;
  const t5 = await mk(null, noKey).testRunner({ resolved: { values: {} } });
  ok('no key and no sign-in ⇒ a named refusal (sign in above, or paste a key); Dropline never called', t5.ok === false && /no Dropline key and no Fish Audio sign-in/.test(t5.error) && seen.length === 0, { t5, seen });
  seen.length = 0; seen.push(...kept);
}
console.log('⑥ AUDIO + KEY NEVER IN A LOG, AUDIO NEVER ON DISK (and their RED controls — voice-verify F3)');
{
  const holds = (needle) => logs.filter((l) => l.includes(needle)).length;
  ok('no captured line (console.*, stdout/stderr, the injected log) holds the audio bytes', logs.length > 0 && holds(MARK) === 0, { lines: logs.length, leaked: holds(MARK) });
  ok('… nor the key (the dictations above sent it as the Bearer)', holds(KEY) === 0 && seen.some((s) => s.auth === `Bearer ${KEY}`), holds(KEY));
  ok('… the log does say what happened (request id, sizes) — the check is not vacuous', logs.some((l) => /dct_ok1/.test(l)), logs.slice(0, 3));
  ok('no fs writer (write / append / stream / copy / rename / mkdir / open-for-write) ran during any dictation', dictations > 5 && fsWrites.length === 0, fsWrites);
  const reqs = (rel) => [...fs.readFileSync(path.join(REPO, rel), 'utf8').matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  const used = [...reqs('src/server/dropline-client.js'), ...reqs('src/routes/voice.js')];
  ok('the route + the client reach no other sink: they require only express, multer, crypto, voice-model (a journal / trace / fs import is a new sink ⇒ spy it here)', used.every((r) => ['crypto', 'express', 'multer', '../voice-model.js'].includes(r)), used);
  // the RED controls: each plant in a scratch copy of the route + the client (+ a node_modules link) goes RED on its check
  const plantLeg = async (rel, anchor, replacement) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-voice-proxy-'));
    try {
      for (const d of ['src/server', 'src/routes']) fs.mkdirSync(path.join(dir, d), { recursive: true });
      fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
      for (const f of ['src/voice-model.js', 'src/assistant-note.js', 'src/server/dropline-client.js', 'src/routes/voice.js']) fs.copyFileSync(path.join(REPO, f), path.join(dir, f));
      const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
      fs.writeFileSync(path.join(dir, rel), src.replace(anchor, replacement));
      const M = await hub(path.join(dir, 'src/server/dropline-client.js'), path.join(dir, 'src/routes/voice.js'));
      logs.length = 0; fsWrites.length = 0; script = [{ status: 200 }];
      const r = await dictate(M);
      M.close();
      return { once: src.split(anchor).length === 2, status: r.status, audio: holds(MARK), key: holds(KEY), writes: [...fsWrites] };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const a1 = "    if (!pluginOn()) throw new DroplineError('plugin-off'";
  const m1 = await plantLeg('src/server/dropline-client.js', a1, '    console.log(String(audio));\n' + a1);
  ok('CONTROL: a planted console.log(audio) leaks the audio into the log ⇒ the audio check is RED on it', m1.once && m1.audio > 0, m1);
  const a3 = '    let res = await send(bearer.token);\n';
  const m3 = await plantLeg('src/server/dropline-client.js', a3, '    log.log?.(`[voice] auth Bearer ${bearer.token}`);\n' + a3);
  ok('CONTROL: a planted log line of the Bearer leaks the key ⇒ the key check is RED on it', m3.once && m3.key > 0, m3);
  const a4 = '      const f = req.file;\n';
  const m4 = await plantLeg('src/routes/voice.js', a4, a4 + "      try { require('fs').writeFileSync(require('path').join(require('os').tmpdir(), 'vs-last-dictation.webm'), f.buffer); } catch { }\n");
  ok('CONTROL: a planted write of the audio to disk is caught by the spy (and refused — nothing lands) ⇒ the disk check is RED on it', m4.once && m4.writes.some((w) => /^writeFileSync .*vs-last-dictation\.webm$/.test(w)) && !fs.existsSync(path.join(os.tmpdir(), 'vs-last-dictation.webm')), m4);
}
H.close(); vendor.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

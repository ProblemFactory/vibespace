#!/usr/bin/env node
// test-channel-send-files — lane channel-send-files (.212): an agent's pictures and files on Lark and Slack.
//
// Over stub HTTP (no vendor is called), the request shapes judged by TABLES against the fixtures recorded from the
// vendors' doc pages (scripts/fixtures/lark/send-files.json, scripts/fixtures/slack/send-files.json):
//   ① the caps rows (both adapters take files, Gmail's bounds, the registry contract accepts them);
//   ② Lark: the text first, then per file ONE multipart upload with the ACCOUNT's user token and ONE message
//      `msg_type: image|file` carrying the key (never a URL as text); a reply answers the same message per part;
//   ③ Lark refusals: a scope refusal on a later upload ⇒ the send is partly sent and its part names the scope; a rate
//      refusal before anything landed ⇒ thrown to the ladder after ONE request (no storm);
//   ④ Slack: per file getUploadURLExternal → the bytes to files.slack.com (no token rides) → completeUploadExternal
//      (the text as the first file's initial_comment); no files:write ⇒ refused by name, nothing sent; an upload URL
//      off files.slack.com is never posted to; a later refusal is named in its part;
//   ⑤ the receipt says what landed and what did not (channel-policy receiptFor / renderReceiptBlock);
//   ⑥ the vendor-response census over lark.js (429 class) stays green;
//   ⑧ verify r1: a lost text answer reconciled names the files that never left (F1); Slack thread+chat + a file refused (F4);
//   ⑦ PATCHED-COPY CONTROLS: a copy sending the key / the upload URL as text, and a copy dropping a refusal, go red.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LF = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/lark/send-files.json'), 'utf8'));
const SF = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/slack/send-files.json'), 'utf8'));
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { fails++; console.log(`  ✗ ${m}`); } };

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
const PDF = Buffer.from('%PDF-1.4\n%fixture\n', 'latin1');
const files = () => [{ name: 'a.png', mime: 'image/png', kind: 'image', bytes: PNG.length, data: PNG }, { name: 'b.pdf', mime: 'application/pdf', kind: 'file', bytes: PDF.length, data: PDF }];
const CRED = { source: 'user', values: { appId: 'cli_fixture0001', appSecret: 'fixture-secret-0001' }, missing: [], why: null };
const T0 = 1727999000000;
const tokens = (token) => ({ read: () => ({ token, why: null }), write: async () => {}, clear: async () => {} });
const jsonRes = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

/** A stub fetch: every request recorded (url, method, headers, json / form fields / bytes), answered by `route`. */
function stub(route) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const c = { url: String(url), method: init.method || 'GET', headers: { ...(init.headers || {}) }, json: null, form: null, file: null, bytes: null };
    if (init.body instanceof FormData) {
      c.form = {};
      for (const [k, v] of init.body.entries()) { if (typeof v === 'string') c.form[k] = v; else c.file = { field: k, name: v.name, size: v.size }; }
    } else if (Buffer.isBuffer(init.body) || init.body instanceof Uint8Array) c.bytes = init.body.length;
    else if (typeof init.body === 'string') { try { c.json = JSON.parse(init.body); } catch { c.json = Object.fromEntries(new URLSearchParams(init.body)); } }
    calls.push(c);
    return route(c, calls.length);
  };
  return { calls, fetchFn };
}

function larkJudge(lark) {
  const out = [];
  const mk = (route) => { const s = stub(route); const a = lark.create({ id: 'l', options: {} }, { resolveIntegration: () => CRED, fetch: s.fetchFn, now: () => T0, tokens: tokens({ access_token: 'u-fixture-user-token', expiresAt: T0 + 3600e3, refresh_token: 'r', refreshExpiresAt: T0 + 30 * 86400e3, scopes: ['im:message', 'im:message.send_as_user', 'im:resource'], openId: 'ou_me', brand: 'feishu' }) }); return { a, ...s }; };
  const answer = (c) => (c.url.includes('/im/v1/images') ? jsonRes(200, LF.answers.image) : c.url.includes('/im/v1/files') ? jsonRes(200, LF.answers.file) : jsonRes(200, LF.answers.message));
  return (async () => {
    // ② the plan
    { const { a, calls } = mk(answer);
      const r = await a.send('oc_fixture', { text: 'here they are', idemKey: 'p-1', as: 'user', attachments: files() });
      const want = [
        ['POST', LF.message.path, (c) => c.json.msg_type === 'text' && JSON.parse(c.json.content).text === 'here they are' && c.json.uuid === 'p-1' && c.json.receive_id === 'oc_fixture'],
        ['POST', LF.image.path, (c) => c.form && c.form.image_type === LF.image.fields.image_type && c.file && c.file.field === LF.image.fileField && c.file.name === 'a.png' && c.file.size === PNG.length && !c.json],
        ['POST', LF.message.path, (c) => c.json.msg_type === 'image' && JSON.parse(c.json.content).image_key === LF.answers.image.data.image_key && Object.keys(JSON.parse(c.json.content)).join() === 'image_key' && c.json.uuid === 'p-1:a0'],
        ['POST', LF.file.path, (c) => c.form && c.form.file_type === 'pdf' && c.form.file_name === 'b.pdf' && c.file && c.file.field === LF.file.fileField && c.file.size === PDF.length],
        ['POST', LF.message.path, (c) => c.json.msg_type === 'file' && JSON.parse(c.json.content).file_key === LF.answers.file.data.file_key && c.json.uuid === 'p-1:a1'],
      ];
      const rows = want.map(([m, p, f], i) => { const c = calls[i]; return !!c && c.method === m && c.url.endsWith(p) && c.headers.Authorization === 'Bearer u-fixture-user-token' && f(c); });
      if (calls.length !== want.length || rows.includes(false)) out.push(`lark plan: ${calls.length} requests, rows ${rows.map((x) => (x ? '✓' : '✗')).join('')}`);
      if (!(r.ok && r.parts && r.parts.length === 3 && r.parts.every((x) => x.ok) && r.vendorMessageId)) out.push('lark plan: the answer is not three landed parts');
    }
    // ② a reply: every part answers the same message
    { const { a, calls } = mk(answer);
      const anchor = { vendorId: 'om_root', convId: 'oc_fixture', raw: { chat_id: 'oc_fixture' } };
      await a.send('oc_fixture', { text: '', replyTo: 'om_root', replyAnchor: anchor, idemKey: 'p-2', as: 'user', attachments: files().slice(0, 1) });
      const msgs = calls.filter((c) => c.json);
      if (!(calls.length === 2 && msgs.length === 1 && msgs[0].url.endsWith('/im/v1/messages/om_root/reply') && msgs[0].json.msg_type === 'image')) out.push('lark reply: the picture does not answer the message (or a text message went for an empty text)');
    }
    // ③ a scope refusal on the second upload — partly sent, the part names the scope, nothing after it
    { const { a, calls } = mk((c) => (c.url.includes('/im/v1/files') ? jsonRes(400, LF.answers.scopeRefusal) : answer(c)));
      const r = await a.send('oc_fixture', { text: 'two files', idemKey: 'p-3', as: 'user', attachments: files() });
      const no = r.parts && r.parts.find((x) => !x.ok);
      if (!(r.ok && calls.length === 4 && r.parts.length === 3 && r.parts[0].ok && r.parts[1].ok && no && no.name === 'b.pdf' && no.code === 'forbidden' && (no.requiredScopes || []).includes('im:resource'))) out.push(`lark refusal: not named in its part (${JSON.stringify(r.parts || null).slice(0, 200)}, ${calls.length} requests)`);
    }
    // ③ a rate refusal before anything landed — the ladder's, after ONE request
    { const { a, calls } = mk(() => jsonRes(429, { code: 99991400, msg: 'request trigger frequency limit' }, { 'x-ogw-ratelimit-reset': '3' }));
      let e = null;
      try { await a.send('oc_fixture', { text: '', idemKey: 'p-4', as: 'user', attachments: files() }); } catch (x) { e = x; }
      if (!(e && e.code === 'rate-limited' && calls.length === 1 && e.detail && Array.isArray(e.detail.parts) && e.detail.parts.length === 2)) out.push(`lark rate: ${e ? e.code : 'no throw'} after ${calls.length} requests`);
    }
    // a picture over 10 MB goes as a file (the image route's ceiling)
    { const p = lark.attachmentPlan({ name: 'big.png', mime: 'image/png', bytes: 11 * 1024 * 1024 }); if (!(p.route === '/im/v1/files' && p.fields.file_type === 'stream')) out.push('lark plan: an 11 MB picture is not sent as a file'); }
    return out;
  })();
}

// a Slack-shaped fixture token, split so push protection never reads it as a credential (it is not one)
const SLACK_SAMPLE_TOKEN = ['xox', 'p-fixture-0001'].join('');

function slackJudge(slack) {
  const out = [];
  const mk = (route, scopes = ['chat:write', 'files:write', 'channels:history']) => { const s = stub(route); const a = slack.create({ id: 's' }, { fetch: s.fetchFn, now: () => T0, tokens: tokens({ access_token: SLACK_SAMPLE_TOKEN, scopes, userId: 'T1/U1', label: 'Fixture · @me' }) }); return { a, ...s }; };
  const answer = (c) => (c.url.endsWith('files.getUploadURLExternal') ? jsonRes(200, SF.getUploadURLExternal.answer) : c.url.startsWith(SF.upload.origin) ? jsonRes(200, SF.upload.answer) : jsonRes(200, SF.completeUploadExternal.answer));
  return (async () => {
    { const { a, calls } = mk(answer);
      const r = await a.send('C0FIXTURE', { text: 'here they are', idemKey: 'p-1', as: 'user', attachments: files() });
      const chain = (i, first) => [
        (c) => c.url.endsWith('/api/files.getUploadURLExternal') && c.json.filename === files()[i].name && Number(c.json.length) === files()[i].data.length && c.headers.Authorization === 'Bearer ' + SLACK_SAMPLE_TOKEN,
        (c) => c.url === SF.getUploadURLExternal.answer.upload_url && c.method === 'POST' && c.bytes === files()[i].data.length && !c.headers.Authorization,
        (c) => c.url.endsWith('/api/files.completeUploadExternal') && c.json.channel_id === 'C0FIXTURE' && JSON.parse(c.json.files)[0].id === SF.getUploadURLExternal.answer.file_id && JSON.parse(c.json.files)[0].title === files()[i].name && (first ? c.json.initial_comment === 'here they are' : c.json.initial_comment === undefined),
      ];
      const want = [...chain(0, true), ...chain(1, false)];
      const rows = want.map((f, i) => !!calls[i] && f(calls[i]));
      if (calls.length !== 6 || rows.includes(false) || calls.some((c) => c.url.endsWith('chat.postMessage'))) out.push(`slack plan: ${calls.length} requests, rows ${rows.map((x) => (x ? '✓' : '✗')).join('')}`);
      if (!(r.ok && r.parts && r.parts.length === 2 && r.parts.every((x) => x.ok))) out.push('slack plan: the answer is not two landed parts');
    }
    { const { a, calls } = mk(answer, ['chat:write', 'channels:history']);
      let e = null;
      try { await a.send('C0FIXTURE', { text: 'x', idemKey: 'p-2', as: 'user', attachments: files() }); } catch (x) { e = x; }
      if (!(e && e.code === 'forbidden' && /files:write/.test(e.message) && calls.length === 0)) out.push('slack scope: a token without files:write is not refused by name before any request');
    }
    { const { a, calls } = mk((c) => (c.url.endsWith('files.getUploadURLExternal') ? jsonRes(200, { ...SF.getUploadURLExternal.answer, upload_url: 'https://evil.example/up' }) : answer(c)));
      let e = null;
      try { await a.send('C0FIXTURE', { text: '', idemKey: 'p-3', as: 'user', attachments: files() }); } catch (x) { e = x; }
      if (!(e && calls.length === 1)) out.push('slack origin: an upload URL off files.slack.com was posted to');
    }
    // verify r1 (F4): thread + channel with a file — Slack's file sharing cannot broadcast; refused by name, 0 requests
    { const { a, calls } = mk(answer);
      let e = null;
      try { await a.send('C0FIXTURE', { text: 'x', replyTo: '1700000000.000100', replyAnchor: { vendorId: '1700000000.000100', convId: 'C0FIXTURE', raw: { channel: 'C0FIXTURE' } }, placement: 'thread+chat', idemKey: 'p-5', as: 'user', attachments: files() }); } catch (x) { e = x; }
      if (!(e && e.code === 'send-not-available' && e.detail && e.detail.why === 'attachment-placement' && /also go to the channel/.test(e.message) && calls.length === 0)) out.push(`slack thread+chat: a file is not refused before any request (${e ? e.code : 'sent'}, ${calls.length} requests)`);
    }
    { let k = 0;
      const { a, calls } = mk((c) => (c.url.endsWith('files.getUploadURLExternal') && ++k === 2 ? jsonRes(200, SF.scopeRefusal) : answer(c)));
      const r = await a.send('C0FIXTURE', { text: 'x', idemKey: 'p-4', as: 'user', attachments: files() });
      const no = r.parts && r.parts[1];
      if (!(r.ok && calls.length === 4 && no && !no.ok && no.name === 'b.pdf' && /missing_scope/.test(no.why || '') && /files:write/.test(no.why || ''))) out.push(`slack refusal: not named in its part (${JSON.stringify(r.parts || null).slice(0, 200)})`);
    }
    return out;
  })();
}

/** A patched COPY (scripts/mutant-copy.mjs: outside the tree, requires re-bound to the real files), the judge run on it. */
const MC = mutantCopies('send-files', REPO);
// lane dc-channels-seams: the engine's patched copy is the engine + its three family files as ONE closed world
async function mutantEngine(from, to, judge, tag) {
  const s = engineSource(REPO);
  if (!s.includes(from)) return null;
  return judge(require(MC.write('src/server/channels-engine.js', s.replace(from, to), tag)));
}
async function mutant(file, from, to, judge, tag) {
  const s = fs.readFileSync(path.join(REPO, 'src', file), 'utf8');
  if (!s.includes(from)) return null;
  return judge(require(MC.write(`src/${file}`, s.replace(from, to), tag)));
}

console.log('① the caps rows');
const CH = require(path.join(REPO, 'src/channels/index.js'));
const lark = require(path.join(REPO, 'src/channels/lark.js'));
const slack = require(path.join(REPO, 'src/channels/slack.js'));
const gmail = require(path.join(REPO, 'src/channels/gmail.js'));
for (const [k, m] of [['lark', lark], ['slack', slack]]) {
  const row = m.caps.sendAttachments;
  ok(row && row.maxCount === gmail.caps.sendAttachments.maxCount && row.maxTotalBytes === gmail.caps.sendAttachments.maxTotalBytes && row.withText === true && m.caps.sendAttachmentsWhy === null, `${k}: takes files — at most ${row && row.maxCount}, ${row && row.maxTotalBytes / 1e6} MB together (Gmail's bounds), with text`);
  ok(CH.validateCaps(k, m.caps) === true, `${k}: the row validates under the registry contract`);
}
ok(lark.LARK_IMAGE_MAX === 10 * 1024 * 1024 && LF.image.maxBytes === lark.LARK_IMAGE_MAX && LF.file.maxBytes === lark.LARK_FILE_MAX, "lark: the picture (10 MB) and file (30 MB) ceilings are the doc's, both above the 25 MB row except a single picture (over 10 MB ⇒ sent as a file)");

console.log('② ③ Lark over stub HTTP');
const lr = await larkJudge(lark);
ok(lr.length === 0, `lark: the plan, the reply, the refusal named in its part, the rate refusal after one request${lr.length ? ` — ${lr.join('; ')}` : ''}`);
console.log('④ Slack over stub HTTP');
const sr = await slackJudge(slack);
ok(sr.length === 0, `slack: the three-request chain per file, files:write by name, files.slack.com only, a later refusal named${sr.length ? ` — ${sr.join('; ')}` : ''}`);

console.log('⑤ the receipt');
const P = require(path.join(REPO, 'src/channel-policy.js'));
const prop = { id: 'p-9', state: 'sent', convId: 'oc_fixture', adapterId: 'lark', reason: null, result: { vendorMessageId: 'om_1', at: T0, parts: [{ part: 'text', ok: true, vendorMessageId: 'om_1' }, { part: 'attachment', name: 'a.png', ok: true }, { part: 'attachment', name: 'b.pdf', ok: false, code: 'forbidden', why: 'lark upload file: Unauthorized (99991679)', requiredScopes: ['im:resource'] }] } };
const block = P.renderReceiptBlock(P.receiptFor(prop), { adapterLabel: 'Lark' });
ok(/landed: the text, "a\.png"/.test(block) && /NOT landed: "b\.pdf" \(forbidden: .*99991679.* needs im:resource\)/.test(block), 'a send in parts: the receipt names what landed and what did not (the vendor code, the scope)');
const failed = { id: 'p-10', state: 'failed', convId: 'C1', adapterId: 'slack', reason: 'rate-limited: slack files.getUploadURLExternal: Slack answered 429', failure: { code: 'rate-limited', detail: { parts: [{ part: 'attachment', name: 'a.png', ok: false, code: 'rate-limited' }, { part: 'attachment', name: 'b.pdf', ok: false, code: 'not-sent' }] } } };
const fb = P.renderReceiptBlock(P.receiptFor(failed), { adapterLabel: 'Slack' });
ok(/FAILED/.test(fb) && /NOT landed: "a\.png" \(rate-limited\); "b\.pdf" \(not sent after the refusal before it\)/.test(fb), 'a refused send: the receipt says no part landed, by name');

console.log('⑤b lane slack-file-send-key (B-2840): a Slack file send is keyed by its FILE ids; the self-authored share record names them');
{ // the documented completeUploadExternal answer names no share ts — the real adapter keys each part by its file id; the
  // real record of the owner's share carries that id as attachments[].id; the PURE re-key maps one onto the other
  let n = 0;
  const s = stub((c) => (c.url.endsWith('files.getUploadURLExternal') ? jsonRes(200, { ...SF.getUploadURLExternal.answer, file_id: `F07FIXTURE0${++n}` }) : c.url.startsWith(SF.upload.origin) ? jsonRes(200, SF.upload.answer) : jsonRes(200, SF.completeUploadExternal.answer)));
  const a = slack.create({ id: 's' }, { fetch: s.fetchFn, now: () => T0, tokens: tokens({ access_token: SLACK_SAMPLE_TOKEN, scopes: ['chat:write', 'files:write', 'channels:history'], userId: 'T1/U1', label: 'Fixture · @me' }) });
  const r = await a.send('C0FIXTURE', { text: 'here they are', idemKey: 'p-1', as: 'user', attachments: files() });
  const rec = (ts, user, fid, share) => slack.toRecord('s', 'C0FIXTURE', { type: 'message', ...(share ? { subtype: 'file_share' } : {}), ts, user, text: '', files: [{ id: fid, name: 'a.png', mimetype: 'image/png', size: 5 }] }, { selfId: 'U1' });
  const recs = [rec('1700000101.000101', 'U1', 'F07FIXTURE01', true), rec('1700000102.000102', 'U1', 'F07FIXTURE02', false), rec('1700000103.000103', 'U2', 'F07FIXTURE09', true)];
  const by = P.sharedFilesOf(recs);
  const k = P.rekeyByFiles(r, by);
  ok(!JSON.stringify(SF.completeUploadExternal.answer).includes('shares') && r.vendorMessageId === 'F07FIXTURE01' && r.parts.map((x) => x.vendorMessageId).join() === 'F07FIXTURE01,F07FIXTURE02', 'at the send: the result and each part are keyed by the FILE id (the fixture answer carries no shares/ts — no send-time key, no new vendor call)', JSON.stringify(r.parts));
  ok(recs[0].attachments[0].id === 'F07FIXTURE01' && recs[0].author.isSelf && recs[1].author.isSelf && !recs[2].author.isSelf && by.size === 2 && by.get('F07FIXTURE02') === '1700000102.000102', 'the share record (subtype file_share, or a plain message with files[]) keeps files[].id as attachments[].id; only SELF-authored shares are read', JSON.stringify([...by]));
  ok(k && k.vendorMessageId === '1700000101.000101' && k.parts[1].vendorMessageId === '1700000102.000102' && k.parts[1].fileId === 'F07FIXTURE02' && k.fileIds.join() === 'F07FIXTURE01,F07FIXTURE02' && P.sentIdsOf(k).join() === '1700000101.000101,1700000102.000102' && P.rekeyByFiles(k, by) === null && P.rekeyByFiles(r, new Map([['F07FIXTURE09', 'x']])) === null, 're-keyed: the result and every landed part name their share message (what a thread reply names), the file ids kept; a replay moves nothing; an unrelated file moves nothing', JSON.stringify(k));
}
console.log('⑥ the vendor-response census');
const VC = await import(path.join(REPO, 'scripts/vendor-response-census.mjs'));
const cen = VC.responseCensus(fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf8'), { direct: /\b(?:api|callJson|callForm|fetchFn)\s*\(/, raw: /\bfetchFn\s*\(/g, rateOkIds: new Set(lark.RATE_OK.map((r) => r.id)) });
ok(cen.problems.length === 0 && cen.touching.includes('sendWithFiles') && cen.touching.includes('upload'), `lark.js: the 429 class — the upload's raw send judged, the parts chain's catch a RATE_OK row (it stops, never retries)${cen.problems.length ? ` — ${JSON.stringify(cen.problems).slice(0, 300)}` : ''}`);

// ⑧ verify r1 (F1): a Lark send whose TEXT answer is lost (nothing landed ⇒ `unknown`), settled `sent` by the reconcile
// (the scan finds the text) — the files never left, and the proposal must say so by name (it said SENT "with 2 attachments")
async function reconcileJudge(ENGm) {
  const out = [];
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-send-files-rc-'));
  let clock = T0, n = 0;
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const c = { url: String(url), method: init.method || 'GET', form: init.body instanceof FormData }; calls.push(c);
    if (c.method === 'POST' && /\/im\/v1\/messages\?receive_id_type/.test(c.url) && ++n === 1) throw new TypeError('fetch failed: socket hang up');
    if (c.method === 'GET') return jsonRes(200, { code: 0, data: { items: [{ message_id: 'om_t', create_time: String(clock), sender: { id: 'ou_me', sender_type: 'user' }, msg_type: 'text', body: { content: JSON.stringify({ text: 'the report' }) } }], has_more: false } });
    return c.form ? jsonRes(200, LF.answers.image) : jsonRes(200, LF.answers.message);
  };
  const A = lark.create({ id: 'l', options: {} }, { resolveIntegration: () => CRED, fetch: fetchFn, now: () => clock, tokens: tokens({ access_token: 'u-fixture-user-token', expiresAt: T0 + 3600e3, refresh_token: 'r', refreshExpiresAt: T0 + 30 * 86400e3, scopes: ['im:message', 'im:message.send_as_user', 'im:resource'], openId: 'ou_me', brand: 'feishu' }) });
  const mod = { kind: 'lark-rc', caps: { ...fake.fakePoll.caps, idempotency: lark.caps.idempotency, sendAttachments: lark.caps.sendAttachments, sendAttachmentsWhy: null, budget: undefined, pace: undefined },
    create(record, deps) { return Object.assign(Object.create(fake.fakePoll.create(record, { ...deps })), { send: (c, o) => A.send(c, o), reconcile: (c, o) => A.reconcile(c, o) }); } };
  const registry = CH.createChannelRegistry(); registry.register(mod);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'la', kind: 'lark-rc', label: 'la', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: null }] }));
  try {
    const eng = ENGm.create({ dataDir, registry, env: {}, now: () => clock, broadcast: () => {}, serverSetting: (k) => ({ 'channels.guardAttachmentsReview': true })[k], liveSessions: () => [], log: { log() {}, warn() {}, error() {} } });
    await eng.pass('la', { force: true });
    const conv = Object.keys(eng.store.index.live()).find((k) => k.startsWith('la/')).slice(3);
    const pr = await eng.propose(null, 'la', conv, { text: 'the report', attachments: files().map((f) => ({ name: f.name, data: f.data.toString('base64') })) });
    if (!pr.ok) return [`propose: ${JSON.stringify(pr).slice(0, 160)}`];
    const id = pr.proposal.id;
    await eng.approve(id, { shown: P.shownDigest((eng.outboxView().proposals || []).find((p) => p.id === id)) });
    const q0 = eng.store.outbox.snapshot().proposals[id];
    if (q0.state !== 'unknown') out.push(`the lost text answer left the proposal ${q0.state}, not unknown`);
    clock += 60e3;
    await eng.reconcile(id);
    const q = eng.store.outbox.snapshot().proposals[id];
    const block = P.renderReceiptBlock(P.receiptFor(q), { adapterLabel: 'Lark' });
    if (calls.some((c) => c.form)) out.push('a file was uploaded by the reconcile');
    if (!(q.state === 'sent' && /^partly sent — landed: the text · NOT landed: "a\.png" \(not sent/.test(q.reason || '') && /parts: landed: the text · NOT landed: "a\.png".*"b\.pdf"/.test(block))) out.push(`the reconciled send claims the files (${q.state}; ${String(q.reason).slice(0, 80)}; ${(block.match(/parts:.*/) || ['no parts line'])[0].slice(0, 80)})`);
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
  return out;
}
console.log('⑧ a lost text answer, reconciled: the files that never left are named');
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const rcj = await reconcileJudge(ENG);
ok(rcj.length === 0, `lark: the text's answer lost ⇒ unknown ⇒ reconciled SENT names the two files NOT landed, nothing uploaded${rcj.length ? ` — ${rcj.join('; ')}` : ''}`);

// ⑨ lane owner-composer-attach: THE OWNER'S OWN SEND carries files (POST …/send = propose({kind:'user'}, …, {direct:true}))
// through the SAME store + adapter path as an agent's: out at once (no card, the attachment guard is for agents), the
// record keeps name/size/sha256, a refused upload is "partly sent" + ONE For-you item, a file changed on disk between the
// store and the send is refused by name (attachment-changed), nothing sent
async function ownerJudge(ENGm) {
  const out = [];
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-send-files-own-'));
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const c = { url: String(url), method: init.method || 'GET', form: init.body instanceof FormData }; calls.push(c);
    if (c.method === 'GET') return jsonRes(200, { code: 0, data: { items: [], has_more: false } });
    if (c.form && c.url.includes('/im/v1/files')) return jsonRes(400, LF.answers.scopeRefusal);
    return c.form ? jsonRes(200, LF.answers.image) : jsonRes(200, LF.answers.message);
  };
  const A = lark.create({ id: 'l', options: {} }, { resolveIntegration: () => CRED, fetch: fetchFn, now: () => T0, tokens: tokens({ access_token: 'u-fixture-user-token', expiresAt: T0 + 3600e3, refresh_token: 'r', refreshExpiresAt: T0 + 30 * 86400e3, scopes: ['im:message', 'im:message.send_as_user', 'im:resource'] }) });
  const mod = { kind: 'lark-own', caps: { ...fake.fakePoll.caps, idempotency: lark.caps.idempotency, sendAttachments: lark.caps.sendAttachments, sendAttachmentsWhy: null, budget: undefined, pace: undefined },
    create(record, deps) { return Object.assign(Object.create(fake.fakePoll.create(record, { ...deps })), { send: (c, o) => A.send(c, o) }); } };
  const registry = CH.createChannelRegistry(); registry.register(mod);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'la', kind: 'lark-own', label: 'la', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, options: {} }] }));
  const todos = [];
  try {
    const eng = ENGm.create({ dataDir, registry, env: {}, now: () => T0, broadcast: () => {}, serverSetting: (k) => ({ 'channels.guardAttachmentsReview': true })[k], liveSessions: () => [], userTodos: { add: (key, item) => { todos.push(item); return { id: `t${todos.length}` }; } }, log: { log() {}, warn() {}, error() {} } });
    await eng.pass('la', { force: true });
    const conv = Object.keys(eng.store.index.live()).find((k) => k.startsWith('la/')).slice(3);
    const att = () => files().map((f) => ({ name: f.name, data: f.data.toString('base64') }));
    const cv = eng.conversationView('la', conv);
    if (!(cv && cv.offers.sendAttachment && cv.offers.sendAttachment.offered === true)) out.push(`the conversation view does not offer the composer's files (${JSON.stringify(cv && cv.offers.sendAttachment)})`);
    const pr = await eng.propose({ kind: 'user' }, 'la', conv, { text: 'the report', attachments: att(), direct: true });
    const q = pr.ok ? eng.store.outbox.snapshot().proposals[pr.proposal.id] : null;
    if (!q) return [`owner send: ${JSON.stringify(pr).slice(0, 160)}`];
    if (q.state !== 'sent' || q.policy.mode !== 'direct' || q.draftedBy.kind !== 'user' || (q.history || []).some((h) => h.state === 'awaiting-approval')) out.push(`the owner's send with files was not out at once (${q.state}, ${q.policy && q.policy.mode})`);
    if (!(q.attachments.length === 2 && q.attachments[0].name === 'a.png' && q.attachments[0].sha256 === require('crypto').createHash('sha256').update(PNG).digest('hex') && q.attachments[1].kind === 'file')) out.push('the record does not keep the files (name, size, sha256)');
    if (calls.filter((c) => c.form).length !== 2) out.push(`the adapter's upload path was not taken (${calls.filter((c) => c.form).length} uploads)`);
    if (!/^partly sent — landed: the text, "a\.png" · NOT landed: "b\.pdf" \(forbidden/.test(q.reason || '')) out.push(`the refused upload is not "partly sent" by name (${String(q.reason).slice(0, 120)})`);
    if (!(todos.length === 1 && /WITHOUT the file b\.pdf/.test(todos[0].text) && todos[0].action && todos[0].action.key === `outbox:${q.id}`)) out.push(`the partial send did not file ONE For-you item (${todos.length})`);
    // a file rewritten between the store and the send: refused by name, nothing uploaded
    const up0 = calls.length;
    const upd = eng.store.outbox.update.bind(eng.store.outbox);
    let tampered = false;
    eng.store.outbox.update = async (fn) => { const r = await upd(fn); for (const p of Object.values(eng.store.outbox.snapshot().proposals)) if (!tampered && p.state === 'sending' && p.id !== q.id) { tampered = true; fs.writeFileSync(path.join(eng.store.dir, 'outbox-files', p.id, '0'), Buffer.concat([PNG, Buffer.from('x')])); } return r; };
    const pr2 = await eng.propose({ kind: 'user' }, 'la', conv, { text: 'again', attachments: att().slice(0, 1), direct: true });
    eng.store.outbox.update = upd;
    const q2 = pr2.ok ? eng.store.outbox.snapshot().proposals[pr2.proposal.id] : null;
    if (!(tampered && q2 && q2.state === 'failed' && /attachment-changed/.test(JSON.stringify(q2.failure || '')) && calls.slice(up0).every((c) => c.method === 'GET'))) out.push(`a changed file was sent or not refused by name (${q2 && q2.state}, tampered ${tampered})`);
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
  return out;
}
console.log('⑨ the owner\'s own send (POST …/send) carries files through the same path');
const own = await ownerJudge(ENG);
ok(own.length === 0, `the owner's send with 2 files: out at once as the owner, the record keeps name/size/sha256, a refused upload "partly sent" + ONE For-you item, a changed file refused attachment-changed${own.length ? ` — ${own.join('; ')}` : ''}`);

console.log('⑦ patched-copy controls');
const keep = setInterval(() => {}, 1000);   // a send-gap wait inside a copy is an unref'd timer
const ctl = [
  ['lark.js', 'msg_type: plan.msgType, content: JSON.stringify({ [plan.keyName]: up })', "msg_type: 'text', content: JSON.stringify({ text: up })", larkJudge, 'channels/lark.js', 'lark: the key sent as TEXT'],
  ['lark.js', 'parts.push(fail(e, label));', 'parts.push({ ...label, ok: true });', larkJudge, 'channels/lark.js', 'lark: a refusal DROPPED (reported landed)'],
  ['slack.js', "try { await api('files.completeUploadExternal', c, { convId }); }", "try { await api('chat.postMessage', { channel: convId, text: url }, { convId }); }", slackJudge, 'channels/slack.js', 'slack: the upload URL sent as TEXT'],
  ['slack.js', 'if (files.length && params.reply_broadcast) throw', 'if (false) throw', slackJudge, 'channels/slack.js', 'slack: thread+chat with a file NOT refused'],
  ['slack.js', 'parts.push(no, ...rest);', 'parts.push({ ...label, ok: true }, ...rest);', slackJudge, 'channels/slack.js', 'slack: a refusal DROPPED'],
];
{ const red = await mutantEngine('...(rp ? { parts: rp } : {}) }; q.reason = rp && rp.some((x) => !x.ok) ? `partly sent — ${P.partsWords(rp)}` : null;', '}; q.reason = null;', reconcileJudge, 'engine-reconcile-parts');
  ok(Array.isArray(red) && red.length > 0, `control — engine: the reconcile forgets the parts: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`); }
for (const [f, from, to, judge, mod, what] of ctl) {
  const red = await mutant(`channels/${f}`, from, to, judge, what.replace(/\W+/g, '-'));
  ok(Array.isArray(red) && red.length > 0, `control — ${what}: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`);
}

{ const red = await mutantEngine("const own = !!(input && input.direct === true) && (!ctx || ctx.kind === 'user');", 'const own = false;', ownerJudge, 'engine-owner-not-direct');
  ok(Array.isArray(red) && red.length > 0, `control — engine: the owner's send with files held as a proposal: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`); }
clearInterval(keep);
console.log(`\n${fails ? '✗' : '✓'} test-channel-send-files: ${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);

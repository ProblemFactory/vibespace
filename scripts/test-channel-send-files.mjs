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
//   ⑨b ⑨c lane composer-file-only-send: a file BY ITSELF — the vendor gets the file and no text message; propose mode
//      holds it, Approve sends it alone, Reject drops it (control: an empty text message posted beside it);
//   ⑦ PATCHED-COPY CONTROLS: a copy sending the key / the upload URL as text, and a copy dropping a refusal, go red;
//   ⑩ lane lark-send-hold (B-efa0): a Lark 429 on a send (text or upload) holds the ACCOUNT's next sends for the
//      vendor's reset — the adapter refuses them before any request (`held`), the engine keeps them `sending` with the
//      wait SAID ("Lark asked to slow down — sends at HH:MM:SS") and sends them at the reset; a restart re-arms the wait;
//      the base (a copy without the hold) sends the next proposal at once — RED controls;
//   ⑪ every Slack method slack.js names has its METHOD_TIERS row (a copy of the table without `files.upload` is red).
//   ⑫ lane channel-upload-retry (userW inc-mw35tppf-jrvo): a TRANSPORT failure of a file's bytes step is retried before
//      any refusal is said — 3 attempts, 1 s then 3 s ±20 %, Slack on a FRESH upload URL; a 429 / 4xx / the completing
//      call never (R⑧–R⑮ + the words in the agent's reason and receipt; four patched copies + the no-retry base RED).
//   ⑫b round 2 (the r1 acceptance): ONE plan (src/channel-upload-plan.js) — F1 a 5xx's Retry-After / reset is a floor for
//       the next wait and a named wait over 10 s ends the tries at once (retryAfterSec kept); F2 the Lark hold check after
//       the wait; F3 the send's budget (a retry's window = what is left; an agent's waiting command brings min(30 s, the
//       collect window) − 2 s, every other send 120 s) — each with a patched-copy control red by name.
//   ⑫c round 3 (the r2 acceptance): m1 every step of a retry inside the budget — each request reads its window right
//       before it leaves (Slack's URL ask min(20 s, what is left − the bytes' 5 s), Lark's upload after its token + pace),
//       none left ⇒ not sent; m2 the zero-window stop reached by a leg (a pace that eats the window) — controls red by name.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

// ⑨b ⑨c lane composer-file-only-send (B-dce6): A FILE BY ITSELF over the REAL Lark adapter on a stub vendor — the owner's
// direct send with no text uploads the file and posts ONE file message and NO text message (the vendor receives the file
// with an empty body); the owner's PROPOSE-mode reply holds its file in the proposal (no vendor call), Approve sends the
// file alone, Reject drops the file with the proposal (nothing uploaded, the stored copy gone)
async function aloneOwnerJudge(ENGm, larkMod = lark) {
  const out = [];
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const OF = require(path.join(REPO, 'src/channel-outbox-files.js'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-send-files-alone-'));
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    let body = null; try { body = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch { body = null; }
    const c = { url: String(url), method: init.method || 'GET', form: init.body instanceof FormData, msgType: body && body.msg_type ? String(body.msg_type) : null, content: body && body.content ? String(body.content) : null }; calls.push(c);
    if (c.method === 'GET') return jsonRes(200, { code: 0, data: { items: [], has_more: false } });
    if (c.form) return jsonRes(200, c.url.includes('/im/v1/images') ? LF.answers.image : LF.answers.file);
    return jsonRes(200, LF.answers.message);
  };
  const A = larkMod.create({ id: 'l', options: {} }, { resolveIntegration: () => CRED, fetch: fetchFn, now: () => T0, tokens: tokens({ access_token: 'u-fixture-user-token', expiresAt: T0 + 3600e3, refresh_token: 'r', refreshExpiresAt: T0 + 30 * 86400e3, scopes: ['im:message', 'im:message.send_as_user', 'im:resource'] }) });
  const mod = { kind: 'lark-alone', caps: { ...fake.fakePoll.caps, idempotency: lark.caps.idempotency, sendAttachments: lark.caps.sendAttachments, sendAttachmentsWhy: null, budget: undefined, pace: undefined },
    create(record, deps) { return Object.assign(Object.create(fake.fakePoll.create(record, { ...deps })), { send: (c, o) => A.send(c, o) }); } };
  const registry = CH.createChannelRegistry(); registry.register(mod);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'la', kind: 'lark-alone', label: 'la', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, options: {} }] }));
  const posts = (from) => calls.slice(from).filter((c) => c.method === 'POST' && !c.form);
  try {
    const eng = ENGm.create({ dataDir, registry, env: {}, now: () => T0, broadcast: () => {}, serverSetting: (k) => ({ 'channels.guardAttachmentsReview': true })[k], liveSessions: () => [], userTodos: { add: () => ({ id: 't' }) }, log: { log() {}, warn() {}, error() {} } });
    await eng.pass('la', { force: true });
    const conv = Object.keys(eng.store.index.live()).find((k) => k.startsWith('la/')).slice(3);
    const pdf = () => [{ name: 'b.pdf', data: PDF.toString('base64') }];
    // ⑨b the owner's direct send, no text
    const c0 = calls.length;
    const d = await eng.propose({ kind: 'user' }, 'la', conv, { direct: true, text: '', attachments: pdf() });
    const dq = d.ok ? eng.store.outbox.snapshot().proposals[d.proposal.id] : null;
    const dp = posts(c0);
    if (!(dq && dq.state === 'sent' && dq.text === '' && dq.reason === null)) out.push(`direct: the file alone was not sent whole (${dq ? `${dq.state}, ${dq.reason}` : JSON.stringify(d).slice(0, 140)})`);
    if (!(calls.slice(c0).filter((c) => c.form).length === 1 && dp.length === 1 && dp[0].msgType === 'file' && !dp.some((c) => c.msgType === 'text'))) out.push(`direct: the vendor did not get ONE file message and no text message (${JSON.stringify(dp.map((c) => c.msgType))})`);
    if (!(dq && dq.result && Array.isArray(dq.result.parts) && dq.result.parts.map((x) => `${x.part}:${x.name || ''}:${x.ok}`).join() === 'attachment:b.pdf:true')) out.push(`direct: the parts do not name the one file (${JSON.stringify(dq && dq.result && dq.result.parts)})`);
    // ⑨c PROPOSE mode: held with its file, nothing sent; Approve sends the file alone
    const c1 = calls.length;
    const pr = await eng.propose({ kind: 'user' }, 'la', conv, { text: '', attachments: [{ name: 'a.png', data: PNG.toString('base64') }] });
    const pq = pr.ok ? eng.store.outbox.snapshot().proposals[pr.proposal.id] : null;
    if (!(pq && pq.state === 'awaiting-approval' && pq.text === '' && pq.attachments.length === 1 && pq.attachments[0].kind === 'image' && OF.fileOf(eng.store.dir, pq.id, 0) && calls.slice(c1).every((c) => c.method === 'GET'))) out.push(`propose: the reply with its file is not held in the outbox untouched (${pq ? pq.state : JSON.stringify(pr).slice(0, 140)})`);
    if (pq) {
      const c2 = calls.length;
      await eng.approve(pq.id, { shown: P.shownDigest((eng.outboxView().proposals || []).find((p) => p.id === pq.id)) });
      const aq = eng.store.outbox.snapshot().proposals[pq.id];
      const ap = posts(c2);
      if (!(aq.state === 'sent' && calls.slice(c2).filter((c) => c.form && c.url.includes('/im/v1/images')).length === 1 && ap.length === 1 && ap[0].msgType === 'image' && !ap.some((c) => c.msgType === 'text'))) out.push(`propose: Approve did not send the picture alone (${aq.state}, ${JSON.stringify(ap.map((c) => c.msgType))})`);
    }
    // ⑨c Reject: the file goes with the proposal
    const c3 = calls.length;
    const rj = await eng.propose({ kind: 'user' }, 'la', conv, { text: '', attachments: pdf() });
    const rid = rj.ok ? rj.proposal.id : null;
    const kept = rid ? !!OF.fileOf(eng.store.dir, rid, 0) : false;
    if (rid) await eng.reject(rid, { reason: 'not this one' });
    const rq = rid ? eng.store.outbox.snapshot().proposals[rid] : null;
    if (!(kept && rq && rq.state === 'rejected' && !OF.fileOf(eng.store.dir, rid, 0) && calls.slice(c3).every((c) => c.method === 'GET'))) out.push(`reject: the file was not dropped with the proposal (${rq && rq.state}, kept before ${kept}, after ${rid ? !!OF.fileOf(eng.store.dir, rid, 0) : '?'})`);
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
  return out;
}
console.log('⑨b ⑨c a file by itself (lane composer-file-only-send): the vendor gets the file, no text message; propose mode holds it, Approve sends it alone, Reject drops it');
const alo = await aloneOwnerJudge(ENG);
ok(alo.length === 0, `Lark on a stub vendor: the owner's file alone ⇒ ONE upload + ONE msg_type file message, no text message, parts name only the file; a propose-mode reply with a picture held (nothing sent), Approve ⇒ one image message alone; Reject ⇒ the stored file removed, nothing uploaded${alo.length ? ` — ${alo.join('; ')}` : ''}`);
{ const LS = fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf8');
  const from = "const pieces = [...(hasText ? [{ part: 'text' }] : []), ...files.map(";
  const red = LS.includes(from) ? await aloneOwnerJudge(ENG, require(MC.write('src/channels/lark.js', LS.replace(from, "const pieces = [{ part: 'text' }, ...files.map("), 'lark-empty-text'))) : null;
  ok(Array.isArray(red) && red.length > 0, `control — lark posts an EMPTY text message beside the file: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`); }

// ⑩ lane lark-send-hold (B-efa0, channel-send-files verify r1 L2): A LARK 429 ON A SEND HOLDS THE ACCOUNT'S NEXT SENDS.
// The probe's shape (probe1 L2/L3): the text lands, the picture upload answers 429 reset 30 s ⇒ the chain stops; the
// next proposal 2 s later and one with a file 3 s later WAIT (0 requests, not failed, the card says so), and go out
// after the reset; a 429 on a text-only send does the same; a 429 naming no reset holds 30 s; a restart keeps the wait.
const ZH = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
const zhT = (k, v = {}) => String(ZH[k] || k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));
const hms = (ms) => { const d = new Date(ms); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':'); };
async function holdEngineJudge(ENGm, L, { shape = 'upload', reset = '30' } = {}) {
  const out = [];
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-send-files-hold-'));
  let clock = T0, k = 0;
  const calls = [];
  const rate = () => jsonRes(429, { code: 99991400, msg: 'request trigger frequency limit' }, reset ? { 'x-ogw-ratelimit-reset': reset } : {});
  let route = (c) => (shape === 'upload' ? (c.form ? rate() : jsonRes(200, LF.answers.message)) : (++k === 1 ? rate() : jsonRes(200, LF.answers.message)));
  const fetchFn = async (url, init = {}) => { const c = { url: String(url), method: init.method || 'GET', form: init.body instanceof FormData, json: typeof init.body === 'string' ? JSON.parse(init.body) : null }; calls.push(c); if (c.method === 'GET') return jsonRes(200, { code: 0, data: { items: [], has_more: false } }); return route(c); };
  const A = L.create({ id: 'l', options: {} }, { resolveIntegration: () => CRED, fetch: fetchFn, now: () => clock, log: { log() {}, warn() {}, error() {} }, tokens: tokens({ access_token: 'u-fixture-user-token', expiresAt: T0 + 3600e3, refresh_token: 'r', refreshExpiresAt: T0 + 30 * 86400e3, scopes: ['im:message', 'im:message.send_as_user', 'im:resource'], openId: 'ou_me', brand: 'feishu' }) });
  const mod = { kind: 'lark-hold', caps: { ...fake.fakePoll.caps, idempotency: L.caps.idempotency, sendAttachments: L.caps.sendAttachments, sendAttachmentsWhy: null, budget: undefined, pace: undefined },
    create(record, deps) { return Object.assign(Object.create(fake.fakePoll.create(record, { ...deps })), { send: (c, o) => A.send(c, o), reconcile: (c, o) => A.reconcile(c, o) }); } };
  const registry = CH.createChannelRegistry(); registry.register(mod);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'la', kind: 'lark-hold', label: 'la', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: null }] }));
  const mk = () => ENGm.create({ dataDir, registry, env: {}, now: () => clock, broadcast: () => {}, serverSetting: (x) => ({ 'channels.guardAttachmentsReview': true })[x], liveSessions: () => [], log: { log() {}, warn() {}, error() {} } });
  let eng = mk();
  try {
    await eng.pass('la', { force: true });
    const conv = Object.keys(eng.store.index.live()).find((x) => x.startsWith('la/')).slice(3);
    const snap = (id) => eng.store.outbox.snapshot().proposals[id];
    const view = (id) => (eng.outboxView().proposals || []).find((p) => p.id === id);
    const sendOne = async (text, fl) => { const pr = await eng.propose(null, 'la', conv, { text, attachments: fl.map((f) => ({ name: f.name, data: f.data.toString('base64') })) }); if (!pr.ok) throw new Error(`propose: ${JSON.stringify(pr).slice(0, 160)}`); const a = await eng.approve(pr.proposal.id, { shown: P.shownDigest(view(pr.proposal.id)) }); return { id: pr.proposal.id, a }; };
    const r1 = await sendOne(shape === 'upload' ? 'two files' : 'one', shape === 'upload' ? files() : []);
    const q1 = snap(r1.id), n1 = calls.length, t429 = clock;
    if (shape === 'upload' ? !(q1.state === 'sent' && n1 === 2 && /^partly sent — landed: the text · NOT landed: "a\.png" \(rate-limited/.test(q1.reason || '')) : !(q1.state === 'failed' && n1 === 1)) out.push(`the 429'd send itself: ${q1.state} after ${n1} requests (${String(q1.reason).slice(0, 80)})`);
    clock += 2e3;
    const r2 = await sendOne('next one', []);
    const q2 = snap(r2.id), n2 = calls.length - n1;
    const wantUntil = t429 + (reset ? Number(reset) : 30) * 1000;
    if (!(q2.state === 'sending' && q2.held && q2.held.until === wantUntil && n2 === 0)) out.push(`the next proposal 2 s later did not WAIT: ${q2.state}, ${n2} requests, held ${JSON.stringify(q2.held || null)} (want until ${wantUntil - t429} ms after the 429)`);
    if (!(r2.a.ok === true && r2.a.held === true && !r2.a.error)) out.push(`its approve answered ${JSON.stringify({ ok: r2.a.ok, held: r2.a.held, code: r2.a.code })} — a wait is no error`);
    const o2 = P.outcomeOf(view(r2.id) || q2);
    const zh = o2 ? P.outcomeText(o2, { t: zhT }) : '';
    if (zh !== `飞书 要求放慢，${hms(wantUntil)} 后发出`) out.push(`the card's line (zh): ${JSON.stringify(zh)}`);
    if (!/^held: Feishu asked to slow down \(rate-limited\) — nothing was sent yet; it goes out by itself after /.test(q2.reason || '')) out.push(`the agent's reason: ${JSON.stringify(q2.reason)}`);
    clock += 1e3;
    const b3 = calls.length; const r3 = await sendOne('with a file', files().slice(0, 1));
    const q3 = snap(r3.id);
    if (!(q3.state === 'sending' && q3.held && q3.held.until === wantUntil && calls.length === b3)) out.push(`the file proposal 3 s later did not wait: ${q3.state}, ${calls.length - b3} requests`);
    // inside the reset: a release sends nothing
    const b4 = calls.length;
    const early = await eng.releaseHeld('la');
    if (!(early === 0 && calls.length === b4 && snap(r2.id).state === 'sending')) out.push(`a release before the reset sent ${early} (${calls.length - b4} requests)`);
    // a restart while held: the wait is kept (never "unknown"), re-armed from the stamp
    eng.stop();
    eng = mk();
    const swept = await eng.sweepSending();
    if (!(swept === 0 && eng.store.outbox.snapshot().proposals[r2.id].state === 'sending' && eng.store.outbox.snapshot().proposals[r3.id].held)) out.push(`a restart called the held sends ${eng.store.outbox.snapshot().proposals[r2.id].state} (swept ${swept})`);
    // the reset passes: both go out, oldest first; the hold is forgotten
    route = (c) => (c.form ? jsonRes(200, c.url.includes('/im/v1/images') ? LF.answers.image : LF.answers.file) : jsonRes(200, LF.answers.message));
    clock = wantUntil + 300;
    const b5 = calls.length;
    const sent = await eng.releaseHeld('la');
    const q2b = eng.store.outbox.snapshot().proposals[r2.id], q3b = eng.store.outbox.snapshot().proposals[r3.id];
    const post = calls.slice(b5);
    if (!(sent === 2 && q2b.state === 'sent' && q3b.state === 'sent' && !q2b.held && !q3b.held && post.length === 4 && post[0].json && JSON.parse(post[0].json.content).text === 'next one')) out.push(`after the reset: released ${sent}, ${q2b.state}/${q3b.state}, ${post.length} requests (the text-only one first: ${post[0] && post[0].json ? post[0].json.content : '-'})`);
    const b6 = calls.length; const r6 = await sendOne('after', []);
    if (!(snap(r6.id).state === 'sent' && calls.length - b6 === 1)) out.push(`a send after the reset waited (${snap(r6.id).state})`);
  } catch (e) { out.push(`threw: ${(e && e.message) || e}`); }
  finally { try { eng.stop(); } catch { } fs.rmSync(dataDir, { recursive: true, force: true }); }
  return out;
}
/** The adapter alone: the 429's reset read (header / none ⇒ 30 s / a huge one capped), the hold refused with no request. */
async function holdAdapterJudge(L) {
  const out = [];
  let clock = T0;
  const mkA = (route) => { const s = stub(route); const a = L.create({ id: 'l', options: { brand: 'lark' } }, { resolveIntegration: () => CRED, fetch: s.fetchFn, now: () => clock, log: { log() {}, warn() {}, error() {} }, tokens: tokens({ access_token: 'u-fixture-user-token', expiresAt: T0 + 3600e3, refresh_token: 'r', refreshExpiresAt: T0 + 30 * 86400e3, scopes: ['im:message', 'im:message.send_as_user', 'im:resource'], openId: 'ou_me', brand: 'lark' }) }); return { a, ...s }; };
  for (const [hdr, want] of [['7', 7], [null, 30], ['999999999', 15 * 60]]) {
    clock = T0; let n = 0;
    const { a, calls } = mkA(() => (++n === 1 ? jsonRes(429, { code: 99991403, msg: 'request trigger frequency limit' }, hdr ? { 'x-ogw-ratelimit-reset': hdr } : {}) : jsonRes(200, LF.answers.message)));
    let e1 = null, e2 = null;
    try { await a.send('oc_fixture', { text: 'one', idemKey: 'h-1', as: 'user' }); } catch (x) { e1 = x; }
    clock += 1000;
    try { await a.send('oc_fixture', { text: 'two', idemKey: 'h-2', as: 'user' }); } catch (x) { e2 = x; }
    const d = (e2 && e2.detail) || {};
    if (!(e1 && e1.code === 'rate-limited' && e2 && e2.code === 'rate-limited' && d.held === true && d.why === 'vendor-hold' && d.heldUntil === T0 + want * 1000 && d.retryAfterSec === want - 1 && d.vendor === 'Lark' && calls.length === 1)) out.push(`reset ${hdr}: the next send ${e2 ? `${e2.code} ${JSON.stringify(d).slice(0, 140)}` : 'went'} after ${calls.length} requests (want held ${want} s, 1 request)`);
    clock = T0 + want * 1000;
    const r = await a.send('oc_fixture', { text: 'three', idemKey: 'h-3', as: 'user' }).catch((x) => x);
    if (!(r && r.ok && calls.length === 2)) out.push(`reset ${hdr}: at the reset the send did not go (${r && r.code}, ${calls.length} requests)`);
  }
  return out;
}
console.log('⑩ lane lark-send-hold (B-efa0): a Lark 429 on a send holds the account\'s next sends for the vendor\'s reset');
{
  const H = require(path.join(REPO, 'src/channels/vendor-hold.js'));
  const h = H.createHolds();
  const s7 = h.hold('send', 7, 1000), s0 = h.hold('x', 0, 1000), sBig = h.hold('y', 1e12, 1000);
  ok(s7 === 7 && s0 === 1 && sBig === H.HOLD_MAX_SEC && h.heldFor('send', 7999) === 1 && h.heldFor('send', 8000) === 0, 'vendor-hold: the reset read whole seconds, at least 1 s, at most the 15-min ceiling; free AT the reset');
  const h2 = H.createHolds(); h2.hold('send', 30, 10000); h2.hold('send', 5, 12000);
  ok(h2.untilOf('send', 12000) === 40000 && h2.release('send', 20000) === false && h2.heldFor('send', 20000) === 20 && h2.release('send', 40000) === true && h2.untilOf('send', 40000) === null, 'vendor-hold: the LATER reset wins; a success inside the reset frees nothing, one after it forgets the hold');
  const h3 = H.createHolds(); h3.hold('send', 30, 8 * 3600e3 + 1000); const back = h3.heldFor('send', 1000);
  ok(back === 30 && h3.heldFor('send', 31000) === 0, `vendor-hold: a clock stepped back 8 h keeps the hold's AGE (30 s from the correction, ${back} s)`);
}
const ha = await holdAdapterJudge(lark);
ok(ha.length === 0, `lark adapter: a 429 holds the account's sends for x-ogw-ratelimit-reset (7 s), none named ⇒ 30 s, a billion ⇒ 15 min; the held send is refused before any request (held, heldUntil, the vendor's name); at the reset it goes${ha.length ? ` — ${ha.join('; ')}` : ''}`);
const hu = await holdEngineJudge(ENG, lark, { shape: 'upload' });
ok(hu.length === 0, `engine: text landed + upload 429 reset 30 s ⇒ partly sent; the next proposal 2 s later and a file 3 s later WAIT (0 requests, "飞书 要求放慢，HH:MM:SS 后发出", approve ok+held); a restart keeps the wait; after the reset both go, oldest first${hu.length ? ` — ${hu.join('; ')}` : ''}`);
const ht = await holdEngineJudge(ENG, lark, { shape: 'text', reset: null });
ok(ht.length === 0, `engine: a 429 on a TEXT-ONLY send naming no reset ⇒ failed, and the account's next sends wait 30 s the same way${ht.length ? ` — ${ht.join('; ')}` : ''}`);

// ⑪ B-efa0 LOW: every Slack Web API method slack.js names has its METHOD_TIERS row — a call outside the table is refused
// by name at run time (unknown-method), so a missing row is a send that never goes; this census makes it red at once
console.log('⑪ the Slack method table covers every method slack.js names');
const SLACK_METHOD = /'((?:auth|users|conversations|chat|reactions|bots|team|emoji|files|search|pins|stars|usergroups|dnd|apps)\.[A-Za-z]+(?:\.[A-Za-z]+)*)'/g;
const slackMethodsMissing = (src, tiers) => [...new Set([...src.matchAll(SLACK_METHOD)].map((m) => m[1]).filter((m) => !/\.(?:com|net|org)$/.test(m)))].filter((m) => !Object.prototype.hasOwnProperty.call(tiers, m));
{
  const Limits = require(path.join(REPO, 'src/channels/slack-limits.js'));
  const ssrc = fs.readFileSync(path.join(REPO, 'src/channels/slack.js'), 'utf8');
  const named = new Set([...ssrc.matchAll(SLACK_METHOD)].map((m) => m[1]).filter((m) => !/\.(?:com|net|org)$/.test(m)));
  const miss = slackMethodsMissing(ssrc, Limits.METHOD_TIERS);
  ok(miss.length === 0 && named.has('files.upload') && named.has('files.getUploadURLExternal') && named.size >= 15, `slack.js names ${named.size} methods, every one a METHOD_TIERS row${miss.length ? ` — missing ${miss.join(', ')}` : ''}`);
  const lsrc = fs.readFileSync(path.join(REPO, 'src/channels/slack-limits.js'), 'utf8');
  const ROW = "  'files.upload': 4,\n";
  const L2 = lsrc.includes(ROW) ? require(MC.write('src/channels/slack-limits.js', lsrc.replace(ROW, ''), 'no-files-upload')) : null;
  const red = L2 ? slackMethodsMissing(ssrc, L2.METHOD_TIERS) : null;
  ok(Array.isArray(red) && red.join() === 'files.upload', `control — a copy of the table without 'files.upload': red (${red === null ? 'the patch site is gone' : red.join() || 'GREEN — the census missed it'})`);
}

// ⑫ lane channel-upload-retry (userW inc-mw35tppf-jrvo, 2026-11-05: three PDFs in one Slack reply; files.slack.com answered
// the SECOND file's bytes HTTP 504 and the send stopped "partly sent" — the third never left, no way to send the rest).
// A FAILED BYTES UPLOAD IS RETRIED BEFORE ANY REFUSAL IS SAID: the bytes step has no effect until the completing call, so
// its TRANSPORT failure (a 5xx, a network error, the timeout) is tried again — 3 attempts in all, 1 s then 3 s (±20 %),
// Slack on a FRESH upload URL each time, Lark the same request rebuilt; a 429, any other 4xx, the URL ask and the
// COMPLETING call never. Pins R⑧–R⑮ (the brief's ⑧–⑮ — this suite's own ⑧–⑪ came first). The clock is fake: the
// adapter's `sleep` advances it and records the wait; nothing really waits.
const UPLOAD_URL = (k) => `${SF.getUploadURLExternal.answer.upload_url}${k}`;
const files3 = () => [...files(), { name: 'c.pdf', mime: 'application/pdf', kind: 'file', bytes: PDF.length, data: PDF }];
const isUrl = (c) => c.url.endsWith('/api/files.getUploadURLExternal'), isPost = (c) => c.url.startsWith(SF.upload.origin), isDone = (c) => c.url.endsWith('/api/files.completeUploadExternal');
const okSlack = (c) => (isPost(c) ? jsonRes(200, SF.upload.answer) : jsonRes(200, SF.completeUploadExternal.answer));
const isUp = (c) => !!c.form, isMsg = (c) => c.method === 'POST' && !c.form;
const okLark = (c) => (c.url.includes('/im/v1/images') ? jsonRes(200, LF.answers.image) : c.url.includes('/im/v1/files') ? jsonRes(200, LF.answers.file) : jsonRes(200, LF.answers.message));
const GATEWAY = '<html><body><h1>504 Gateway Time-out</h1></body></html>';
/** The window each request carries (r2 F3): ⑫b wraps AbortSignal.timeout so a signal names its own milliseconds. */
const SIG_MS = new WeakMap();
/** r3: an answer that takes `ms` on the fake clock — past the request's own window it is aborted AT the window. */
const takes = (c, clock, ms) => {
  if (c.win !== null && c.win < ms) { clock.t += c.win; throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }
  clock.t += ms;
};
/** One adapter on a stub vendor + the fake clock: every request stamped with the clock (and its window), every wait
 *  recorded, the console lines kept. Slack's getUploadURLExternal answers a NEW url + file id per ask (UPLOAD_URL(k),
 *  F07RETRY0k). `route(c, clock)` may move the clock (an answer that takes 13 s); `onSleep` runs inside each wait. */
function retryRig(M, kind, route, { random = null, onSleep = null, pace = null, askMs = null, token = null } = {}) {
  const clock = { t: T0 }, sleeps = [], said = [], calls = [], units = [];
  let k = 0;
  const fetchFn = async (url, init = {}) => {
    const c = { url: String(url), at: clock.t, method: init.method || 'GET', form: null, json: null, win: init.signal ? SIG_MS.get(init.signal) || null : null };
    if (init.body instanceof FormData) { c.form = {}; for (const [x, v] of init.body.entries()) c.form[x] = typeof v === 'string' ? v : `blob:${v.size}`; }
    else if (typeof init.body === 'string') { try { c.json = JSON.parse(init.body); } catch { c.json = Object.fromEntries(new URLSearchParams(init.body)); } }
    calls.push(c);
    if (kind === 'slack' && isUrl(c)) { k++; if (askMs) takes(c, clock, askMs(k)); return jsonRes(200, { ...SF.getUploadURLExternal.answer, upload_url: UPLOAD_URL(k), file_id: `F07RETRY0${k}` }); }
    return route(c, clock);
  };
  const deps = { fetch: fetchFn, now: () => clock.t, sleep: async (ms) => { sleeps.push({ at: clock.t, ms }); clock.t += ms; if (onSleep) await onSleep(ms); }, log: { log() {}, warn: (m) => said.push(String(m)), error() {} }, meter: (u) => units.push({ at: clock.t, u }), ...(random ? { random } : {}), ...(pace ? { pace } : {}) };
  const a = kind === 'slack'
    ? M.create({ id: 's' }, { ...deps, tokens: tokens({ access_token: SLACK_SAMPLE_TOKEN, scopes: ['chat:write', 'files:write', 'channels:history'], userId: 'T1/U1', label: 'Fixture · @me' }) })
    : M.create({ id: 'l', options: {} }, { ...deps, resolveIntegration: () => CRED, tokens: tokens({ access_token: 'u-fixture-user-token', expiresAt: T0 + 3600e3, refresh_token: 'r', refreshExpiresAt: T0 + 30 * 86400e3, scopes: ['im:message', 'im:message.send_as_user', 'im:resource'], openId: 'ou_me', brand: 'feishu', ...(token || {}) }) });
  return { a, calls, sleeps, said, clock, units };
}
const sendR = async (a, convId, fl, text) => { try { return { r: await a.send(convId, { text, idemKey: 'p-r', as: 'user', attachments: fl }) }; } catch (e) { return { e }; } };
const chainOf = (cs) => cs.map((c) => (isUrl(c) ? 'U' : isPost(c) ? 'P' : isDone(c) ? 'C' : '?')).join('');
/** The backoff judge (R⑮): the gap from a failed attempt to the next one's FIRST request, per run. */
const gapsInside = (gaps, n) => gaps.length === n && gaps.every(([g1, g2]) => g1 >= 800 && g1 <= 1200 && g2 >= 2400 && g2 <= 3600);

/** Slack — returns {pin: [problems]} so a control can name the pin it reds. */
async function retrySlackJudge(M) {
  const out = {};
  const fail = (pin, m) => { (out[pin] = out[pin] || []).push(m); };
  // R⑧ 504 on the first bytes POST, 200 on the second
  { let posts = 0;
    const { a, calls, said, sleeps } = retryRig(M, 'slack', (c) => (isPost(c) && ++posts === 1 ? jsonRes(504, GATEWAY) : okSlack(c)));
    const { r, e } = await sendR(a, 'C0FIXTURE', files(), 'here they are');
    const f1 = calls.slice(0, 5);
    const done = f1[4] && f1[4].json && f1[4].json.files ? JSON.parse(f1[4].json.files)[0].id : null;
    if (e) fail('⑧', `threw ${e.code}: ${e.message}`);
    else {
      if (!(chainOf(f1) === 'UPUPC' && f1[1].url === UPLOAD_URL(1) && f1[3].url === UPLOAD_URL(2))) fail('⑧', `file 1's chain ${chainOf(f1)}, POSTs to …${f1.filter(isPost).map((c) => c.url.slice(-4)).join(', …')} (want getUploadURL ×2, two DIFFERENT urls, the second POST to the second)`);
      if (!(done === 'F07RETRY02' && f1[4].json.initial_comment === 'here they are' && calls.filter(isDone).length === 2 && calls.length === 8)) fail('⑧', `completeUploadExternal names ${done} (want the SECOND file id F07RETRY02 with the text), ${calls.length} requests`);
      if (!(r.ok && r.parts.length === 2 && r.parts[0].ok && r.parts[0].retried === 1 && r.parts[0].vendorMessageId === 'F07RETRY02' && r.parts[1].ok && !('retried' in r.parts[1]))) fail('⑧', `parts ${JSON.stringify(r.parts)}`);
      if (!said.some((m) => m.endsWith('slack files.upload: HTTP 504 — retried, landed on attempt 2'))) fail('⑧', `the console line: ${JSON.stringify(said)}`);
      if (sleeps.length !== 1) fail('⑧', `${sleeps.length} waits (want 1)`);
    }
  }
  // R⑨ 504 ×3 on the second file: it fails `transport` "after 3 attempts", 3 asks + 3 POSTs, no completing call, the rest not sent
  { const { a, calls } = retryRig(M, 'slack', (c) => (isPost(c) && c.url !== UPLOAD_URL(1) ? jsonRes(504, GATEWAY) : okSlack(c)));
    const { r, e } = await sendR(a, 'C0FIXTURE', files3(), 'three files');
    const rest = calls.slice(3);
    const no = (r && r.parts && r.parts[1]) || {};
    if (e) fail('⑨', `threw ${e.code}: ${e.message}`);
    else {
      if (!(chainOf(calls.slice(0, 3)) === 'UPC' && chainOf(rest) === 'UPUPUP')) fail('⑨', `the chain ${chainOf(calls)} (want UPC then UPUPUP — no completing call for the failed file, nothing for the third)`);
      if (!(r.ok && r.parts.length === 3 && r.parts[0].ok && !no.ok && no.code === 'transport' && no.why === 'slack files.upload: HTTP 504 (after 3 attempts)' && r.parts[2].code === 'not-sent' && r.parts[2].name === 'c.pdf')) fail('⑨', `parts ${JSON.stringify(r.parts)}`);
    }
  }
  { const { a, calls } = retryRig(M, 'slack', (c) => (isPost(c) ? jsonRes(504, GATEWAY) : okSlack(c)));
    const { e } = await sendR(a, 'C0FIXTURE', files().slice(0, 1), 'x');
    if (!(e && e.code === 'transport' && e.retryable === true && e.message === 'slack files.upload: HTTP 504 (after 3 attempts)' && e.detail && e.detail.attempts === 3 && e.detail.status === 504 && Array.isArray(e.detail.parts) && chainOf(calls) === 'UPUPUP')) fail('⑨', `nothing landed: ${e ? `${e.code} retryable=${e.retryable} "${e.message}"` : 'no throw'}, chain ${chainOf(calls)} (want the ladder's transport, retryable: true, after UPUPUP)`);
  }
  // R⑩ a 429 on the bytes POST: ONE POST, the vendor hold armed, no retry loop
  { const { a, calls, sleeps } = retryRig(M, 'slack', (c) => (isPost(c) ? jsonRes(429, 'ratelimited', { 'retry-after': '30' }) : okSlack(c)));
    const { e } = await sendR(a, 'C0FIXTURE', files(), 'x');
    const v = a.bucketView()['files.upload'] || {};
    if (!(e && e.code === 'rate-limited' && chainOf(calls) === 'UP' && sleeps.length === 0 && v.heldFor >= 29)) fail('⑩', `${e ? e.code : 'no throw'}, chain ${chainOf(calls)}, ${sleeps.length} waits, files.upload held ${v.heldFor} s (want rate-limited after ONE POST, held 30 s)`);
  }
  // R⑪ a 403 / 413 on the bytes POST: ONE POST, forbidden / too-large
  for (const [st, code] of [[403, 'forbidden'], [413, 'too-large']]) {
    const { a, calls, sleeps } = retryRig(M, 'slack', (c) => (isPost(c) ? jsonRes(st, 'refused') : okSlack(c)));
    const { e } = await sendR(a, 'C0FIXTURE', files(), 'x');
    if (!(e && e.code === code && chainOf(calls) === 'UP' && sleeps.length === 0)) fail('⑪', `HTTP ${st}: ${e ? e.code : 'no throw'}, chain ${chainOf(calls)}, ${sleeps.length} waits (want ${code} after ONE POST)`);
  }
  // R⑫ a network error, then 200 — landed, retried 1; a timeout and an abort each count as an attempt
  { let posts = 0;
    const { a, calls, said } = retryRig(M, 'slack', (c) => { if (isPost(c) && ++posts === 1) throw new TypeError('fetch failed'); return okSlack(c); });
    const { r, e } = await sendR(a, 'C0FIXTURE', files().slice(0, 1), 'x');
    if (!(r && r.ok && r.parts[0].retried === 1 && chainOf(calls) === 'UPUPC' && said.some((m) => m.endsWith('slack files.upload: fetch failed — retried, landed on attempt 2')))) fail('⑫', `network error then 200: ${e ? `threw ${e.code}` : JSON.stringify(r.parts)}, chain ${chainOf(calls)}`);
  }
  { let posts = 0;
    const { a, calls } = retryRig(M, 'slack', (c) => { if (isPost(c) && ++posts <= 2) throw (posts === 1 ? new DOMException('The operation was aborted due to timeout', 'TimeoutError') : new DOMException('This operation was aborted', 'AbortError')); return okSlack(c); });
    const { r, e } = await sendR(a, 'C0FIXTURE', files().slice(0, 1), 'x');
    if (!(r && r.ok && r.parts[0].retried === 2 && chainOf(calls) === 'UPUPUPC')) fail('⑫', `timeout, abort, then 200: ${e ? `threw ${e.code}` : JSON.stringify(r.parts)}, chain ${chainOf(calls)} (want landed on attempt 3)`);
  }
  // R⑬ CONTROL: a transport failure on the COMPLETING call — lost, never retried
  { const { a, calls, sleeps } = retryRig(M, 'slack', (c) => { if (isDone(c)) throw new TypeError('fetch failed: socket hang up'); return okSlack(c); });
    const { e } = await sendR(a, 'C0FIXTURE', files().slice(0, 1), 'x');
    const p0 = e && e.detail && Array.isArray(e.detail.parts) ? e.detail.parts[0] : null;
    if (!(e && e.code === 'transport' && e.retryable === false && e.detail.lost === true && p0 && p0.lost === true && chainOf(calls) === 'UPC' && sleeps.length === 0)) fail('⑬', `${e ? `${e.code} retryable=${e.retryable} lost=${e.detail && e.detail.lost}` : 'no throw'}, chain ${chainOf(calls)}, ${sleeps.length} waits (want lost, retryable: false, ONE completing call)`);
  }
  // R⑮ the backoff: 1 s then 3 s, each ±20 % — measured on the fake clock (12 runs of the real jitter + both extremes)
  { const gaps = [];
    for (const rnd of [...Array(12).fill(null), () => 0, () => 0.9999999]) {
      const { a, calls } = retryRig(M, 'slack', (c) => (isPost(c) ? jsonRes(504, GATEWAY) : okSlack(c)), { random: rnd });
      await sendR(a, 'C0FIXTURE', files().slice(0, 1), 'x');
      const U = calls.filter(isUrl), Ps = calls.filter(isPost);
      if (U.length === 3 && Ps.length === 3) gaps.push([U[1].at - Ps[0].at, U[2].at - Ps[1].at]);
    }
    const lo = gaps[12] || [], hi = gaps[13] || [];
    if (!(gapsInside(gaps, 14) && new Set(gaps.slice(0, 12).map((g) => g[0])).size > 1 && lo[0] === 800 && lo[1] === 2400 && hi[0] === 1200 && hi[1] === 3600)) fail('⑮', `slack gaps ${JSON.stringify(gaps)} (want 14 runs, [0.8–1.2 s, 2.4–3.6 s], jittered, extremes [800,2400] / [1200,3600])`);
  }
  return out;
}

/** Lark — R⑭ (⑧ ⑨ ⑩ ⑪ on /im/v1/files and /im/v1/images) + its R⑮. */
async function retryLarkJudge(M) {
  const out = {};
  const fail = (pin, m) => { (out[pin] = out[pin] || []).push(m); };
  for (const [route, fl, what] of [['/im/v1/images', files().slice(0, 1), 'image'], ['/im/v1/files', files().slice(1), 'file']]) {
    let ups = 0;
    const { a, calls, said, sleeps } = retryRig(M, 'lark', (c) => (isUp(c) && ++ups === 1 ? jsonRes(504, GATEWAY) : okLark(c)));
    const { r, e } = await sendR(a, 'oc_fixture', fl, 'with a file');
    const U = calls.filter(isUp);
    if (e) fail('⑭', `${route} 504 then 200: threw ${e.code}: ${e.message}`);
    else if (!(U.length === 2 && U.every((c) => c.url.endsWith(route) && c.form[what] === `blob:${fl[0].data.length}`) && calls.filter(isMsg).length === 2 && r.parts.length === 2 && r.parts[1].ok && r.parts[1].retried === 1 && said.some((m) => m.endsWith(`lark upload ${what}: HTTP 504 (504) — retried, landed on attempt 2`)) && sleeps.length === 1)) fail('⑭', `${route} 504 then 200: ${U.length} uploads, ${calls.filter(isMsg).length} messages, parts ${JSON.stringify(r.parts)}, said ${JSON.stringify(said)}`);
  }
  { const { a, calls } = retryRig(M, 'lark', (c) => (isUp(c) && c.url.includes('/im/v1/files') ? jsonRes(504, GATEWAY) : okLark(c)));
    const { r, e } = await sendR(a, 'oc_fixture', files3(), 'three files');
    const no = (r && r.parts && r.parts[2]) || {};
    if (e) fail('⑭', `/im/v1/files 504 ×3: threw ${e.code}`);
    else if (!(calls.filter((c) => isUp(c) && c.url.includes('/im/v1/files')).length === 3 && calls.filter(isMsg).length === 2 && r.parts.length === 4 && r.parts[1].ok && !no.ok && no.code === 'transport' && no.why === 'lark upload file: HTTP 504 (504) (after 3 attempts)' && r.parts[3].code === 'not-sent')) fail('⑭', `/im/v1/files 504 ×3: ${calls.filter(isUp).length} uploads, ${calls.filter(isMsg).length} messages, parts ${JSON.stringify(r.parts)}`);
  }
  { const { a, calls, sleeps } = retryRig(M, 'lark', (c) => (isUp(c) ? jsonRes(429, { code: 99991400, msg: 'request trigger frequency limit' }, { 'x-ogw-ratelimit-reset': '30' }) : okLark(c)));
    const { e } = await sendR(a, 'oc_fixture', files().slice(1), '');
    const n1 = calls.length;
    const { e: e2 } = await sendR(a, 'oc_fixture', files().slice(1), '');
    if (!(e && e.code === 'rate-limited' && n1 === 1 && sleeps.length === 0 && e2 && e2.detail && e2.detail.held === true && calls.length === n1)) fail('⑭', `429 on the upload: ${e ? e.code : 'no throw'} after ${n1} uploads, ${sleeps.length} waits, the next send ${e2 ? `${e2.code} held=${e2.detail && e2.detail.held}` : 'went'} (want ONE upload, the account's send hold armed)`);
  }
  for (const [st, body, code] of [[403, { code: 99991679, msg: 'Unauthorized' }, 'forbidden'], [400, { code: 234001, msg: 'Invalid request param' }, 'vendor-error']]) {
    const { a, calls, sleeps } = retryRig(M, 'lark', (c) => (isUp(c) ? jsonRes(st, body) : okLark(c)));
    const { e } = await sendR(a, 'oc_fixture', files().slice(1), '');
    if (!(e && e.code === code && calls.length === 1 && sleeps.length === 0)) fail('⑭', `HTTP ${st} on the upload: ${e ? e.code : 'no throw'} after ${calls.length} requests (want ${code} after ONE)`);
  }
  // R⑮ the Lark twin of the backoff (no request between the attempts but the upload itself)
  { const gaps = [];
    for (const rnd of [...Array(6).fill(null), () => 0, () => 0.9999999]) {
      const { a, calls } = retryRig(M, 'lark', (c) => (isUp(c) ? jsonRes(504, GATEWAY) : okLark(c)), { random: rnd });
      await sendR(a, 'oc_fixture', files().slice(1), '');
      const U = calls.filter(isUp);
      if (U.length === 3 && calls.length === 3) gaps.push([U[1].at - U[0].at, U[2].at - U[1].at]);
    }
    if (!(gapsInside(gaps, 8) && gaps[6][0] === 800 && gaps[7][1] === 3600)) fail('⑮', `lark gaps ${JSON.stringify(gaps)} (want 8 runs inside [0.8–1.2 s, 2.4–3.6 s])`);
  }
  return out;
}

/** The words reach the agent: a REAL engine sends through the Slack adapter (file 1 lands on attempt 2, file 2 fails all
 *  three, file 3 never leaves) — the proposal's `reason` and the receipt block say both; the card prints that reason
 *  (outcomeOf null for a sent proposal; the card itself: test-channel-outbox). */
async function retryEngineJudge(ENGm, S = slack) {
  const out = [];
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-send-files-retry-'));
  const { a: A, calls } = retryRig(S, 'slack', (c) => (isPost(c) && c.url !== UPLOAD_URL(2) ? jsonRes(504, GATEWAY) : okSlack(c)));
  const mod = { kind: 'slack-retry', caps: { ...fake.fakePoll.caps, idempotency: S.caps.idempotency, sendAttachments: S.caps.sendAttachments, sendAttachmentsWhy: null, budget: undefined, pace: undefined },
    create(record, deps) { return Object.assign(Object.create(fake.fakePoll.create(record, { ...deps })), { send: (c, o) => A.send(c, o) }); } };
  const registry = CH.createChannelRegistry(); registry.register(mod);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'sr', kind: 'slack-retry', label: 'sr', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: null }] }));
  try {
    const eng = ENGm.create({ dataDir, registry, env: {}, now: () => T0, broadcast: () => {}, serverSetting: (k) => ({ 'channels.guardAttachmentsReview': true })[k], liveSessions: () => [], userTodos: { add: () => ({ id: 't' }) }, log: { log() {}, warn() {}, error() {} } });
    await eng.pass('sr', { force: true });
    const conv = Object.keys(eng.store.index.live()).find((k) => k.startsWith('sr/')).slice(3);
    const pr = await eng.propose(null, 'sr', conv, { text: 'three PDFs', attachments: files3().map((f) => ({ name: f.name, data: f.data.toString('base64') })) });
    if (!pr.ok) return [`propose: ${JSON.stringify(pr).slice(0, 160)}`];
    await eng.approve(pr.proposal.id, { shown: P.shownDigest((eng.outboxView().proposals || []).find((p) => p.id === pr.proposal.id)) });
    const q = eng.store.outbox.snapshot().proposals[pr.proposal.id];
    const words = 'landed: "a.png" (retried, landed on attempt 2) · NOT landed: "b.pdf" (transport: slack files.upload: HTTP 504 (after 3 attempts)); "c.pdf" (not sent after the refusal before it)';
    const block = P.renderReceiptBlock(P.receiptFor(q), { adapterLabel: 'Slack' });
    if (chainOf(calls) !== 'UPUPCUPUPUP') out.push(`the vendor saw ${chainOf(calls)} (want UPUPC UPUPUP)`);
    if (!(q.state === 'sent' && q.reason === `partly sent — ${words}`)) out.push(`the agent's reason: ${q.state} ${JSON.stringify(q.reason)}`);
    if (!(q.result && q.result.parts && q.result.parts[0].retried === 1 && block.includes(`parts: ${words}`))) out.push(`the receipt: ${(block.match(/parts:.*/) || ['no parts line'])[0].slice(0, 240)}`);
    if (P.outcomeOf(q) !== null) out.push('the card would not print the reason (outcomeOf is not null for a sent proposal)');
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
  return out;
}

console.log('⑫ lane channel-upload-retry (userW inc-mw35tppf-jrvo): a failed bytes upload is retried before any refusal is said');
const PIN_WORDS = {
  '⑧': 'R⑧ slack: 504 on the first bytes POST, 200 on the second ⇒ landed; getUploadURL ×2 with two DIFFERENT urls (the second POST to the second), completeUploadExternal ×1 with the SECOND file id; parts[0].retried === 1; the console line «slack files.upload: HTTP 504 — retried, landed on attempt 2»',
  '⑨': 'R⑨ slack: 504 ×3 ⇒ the part fails transport «… HTTP 504 (after 3 attempts)», exactly 3 getUploadURL + 3 POSTs, ZERO completeUploadExternal, the chain stops (the rest not-sent, partly sent); nothing landed ⇒ thrown with retryable: true',
  '⑩': 'R⑩ slack: a 429 on the bytes POST ⇒ ONE POST, the files.upload vendor hold armed (Retry-After 30), no retry loop',
  '⑪': 'R⑪ slack: 403 / 413 on the bytes POST ⇒ ONE POST, forbidden / too-large, no wait',
  '⑫': 'R⑫ slack: a network error then 200 ⇒ landed, retried: 1 (the console line); a timeout then an abort then 200 ⇒ landed on attempt 3',
  '⑬': 'R⑬ CONTROL: a transport failure on completeUploadExternal ⇒ lost: true, retryable: false, ONE completing call — never retried',
};
const srj = await retrySlackJudge(slack);
for (const [pin, words] of Object.entries(PIN_WORDS)) ok(!srj[pin], `${words}${srj[pin] ? ` — ${srj[pin].join('; ')}` : ''}`);
const lrj = await retryLarkJudge(lark);
ok(!lrj['⑭'], `R⑭ lark twin: /im/v1/images and /im/v1/files 504 then 200 ⇒ two uploads to the same route (the form rebuilt), retried: 1, «lark upload image|file: HTTP 504 (504) — retried, landed on attempt 2»; 504 ×3 ⇒ 3 uploads, «(after 3 attempts)», no message for it, the rest not-sent; a 429 ⇒ ONE upload + the send hold; 403 / 400 ⇒ ONE upload${lrj['⑭'] ? ` — ${lrj['⑭'].join('; ')}` : ''}`);
ok(!srj['⑮'] && !lrj['⑮'], `R⑮ the backoff on the fake clock: the second attempt 0.8–1.2 s after the failure, the third 2.4–3.6 s (jittered; the extremes exactly 800 / 1200 and 2400 / 3600 ms) — Slack and Lark${srj['⑮'] || lrj['⑮'] ? ` — ${[...(srj['⑮'] || []), ...(lrj['⑮'] || [])].join('; ')}` : ''}`);
const rej = await retryEngineJudge(ENG);
ok(rej.length === 0, `the words reach the agent (real engine over the Slack adapter): reason «partly sent — landed: "a.png" (retried, landed on attempt 2) · NOT landed: "b.pdf" (transport: … HTTP 504 (after 3 attempts)); "c.pdf" (not sent …)», the receipt's parts line the same, result.parts keep retried${rej.length ? ` — ${rej.join('; ')}` : ''}`);
// ⑫ PATCHED-COPY CONTROLS (⑦'s shape): each copy red by the pin it breaks
{
  const keepR = setInterval(() => {}, 1000);
  const SS = fs.readFileSync(path.join(REPO, 'src/channels/slack.js'), 'utf8'), LS = fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf8');
  const copy = (src, file, from, to, tag) => (src.includes(from) ? require(MC.write(`src/channels/${file}`, src.replace(from, to), tag)) : null);
  const redBy = async (M, judge, pins) => { if (!M) return null; const r = await judge(M); return pins.filter((p) => r[p]); };
  const say = (red, pins) => (red === null ? 'the patch site is gone' : red.length === pins.length ? `red by ${red.join(' ')}` : `red by ${red.join(' ') || 'nothing'} — GREEN on ${pins.filter((p) => !red.includes(p)).join(' ')}`);
  const NO_RETRY = '        if (!next.go) throw stoppedUpload(e, n, next.stop);';
  const OLD_A = '    let lastErr = null;\n', ASK_LINE = "u = await api('files.getUploadURLExternal', { filename: f.name, length: f.data.length }, { convId, windowOf: () => windowOf(ASK_WINDOW) });";
  const rows = [
    ['a copy that retries the COMPLETING call', copy(SS, 'slack.js', "try { await api('files.completeUploadExternal', c, { convId }); }", "try { try { await api('files.completeUploadExternal', c, { convId }); } catch (e0) { if (!(e0 && e0.code === 'transport')) throw e0; await api('files.completeUploadExternal', c, { convId }); } }", 'retry-complete'), retrySlackJudge, ['⑬']],
    ['a copy that retries a 403', copy(SS, 'slack.js', "if (!(e instanceof ChannelError) || e.code !== 'transport') throw e;   // a 429, a 403", "if (!(e instanceof ChannelError) || (e.code !== 'transport' && e.code !== 'forbidden')) throw e;   // a 429, a 403", 'retry-403'), retrySlackJudge, ['⑪']],
    ['a copy that re-POSTs to the OLD upload URL', copy(SS.includes(OLD_A) ? SS.replace(OLD_A, '    let lastErr = null, u0 = null;\n') : '', 'slack.js', ASK_LINE, `u = u0 || (u0 = ${ASK_LINE.slice(4, -1)});`, 'old-url'), retrySlackJudge, ['⑧']],
    ['slack: a copy with NO retry (= the base)', copy(SS, 'slack.js', NO_RETRY, '        throw e;', 'slack-no-retry'), retrySlackJudge, ['⑧', '⑨', '⑫', '⑮']],
    ['lark: a copy with NO retry (= the base)', copy(LS, 'lark.js', NO_RETRY, '        throw e;', 'lark-no-retry'), retryLarkJudge, ['⑭', '⑮']],
  ];
  for (const [what, M, judge, pins] of rows) {
    const red = await redBy(M, judge, pins);
    ok(Array.isArray(red) && red.length === pins.length, `control — ${what}: ${say(red, pins)}`);
  }
  clearInterval(keepR);
}

// ⑫b lane channel-upload-retry ROUND 2 (the r1 acceptance's three findings) — ONE plan for both adapters
// (src/channel-upload-plan.js):
//   F1 THE VENDOR'S WAIT IS HONOURED: a 5xx carrying Retry-After / x-ogw-ratelimit-reset waits AT LEAST that long; a named
//      wait longer than a send holds (UPLOAD_WAIT_MAX_MS 10 s) ⇒ NO further attempt — thrown at once, retryable + retryAfterSec;
//   F2 THE HOLD CHECK AFTER THE WAIT: another send's 429 armed while a Lark upload waited ⇒ no upload leaves inside it;
//   F3 A RETRY NEVER COSTS THE CALLER MORE THAN ITS BUDGET: a retry only if its wait + UPLOAD_MIN_WINDOW_MS (5 s) fit, its
//      window = what is left (the first attempt keeps the base's 60 s); the hub hands an agent's waiting command
//      min(the CLI's 30 s, the collect window 20 s when it reads the receipt inline) − 2 s, every other send 120 s.
// The windows are read off the very AbortSignal each request carries (AbortSignal.timeout wrapped for this block only).
console.log("⑫b lane channel-upload-retry r2: the vendor's wait (F1), the hold after the wait (F2), the send's budget (F3)");
const PLAN_FILE = path.join(REPO, 'src/channel-upload-plan.js');
const Plan = fs.existsSync(PLAN_FILE) ? require(PLAN_FILE) : null;   // a tree without the plan (the base) is red by name, never a crash
const OUTBOX_MS = Plan ? Plan.OUTBOX_SEND_BUDGET_MS : 120000, CLI_MS = Plan ? Plan.CLI_WRITE_BUDGET_MS : 30000;
const sigTimeout = AbortSignal.timeout;
AbortSignal.timeout = (ms) => { const sg = sigTimeout.call(AbortSignal, ms); SIG_MS.set(sg, ms); return sg; };
const RA = (sec) => ({ 'retry-after': String(sec) });
const BUSY = { msg: 'service unavailable' };
const half = () => 0.5;
const SLOW = 13000;   // each 504 answered this long after its request left (the r1 acceptance's F3 scenario)
const AGENT_W = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: ['g1'], msgLevelFor: () => 'none' };
const sendB = async (a, convId, fl, text, budgetMs) => { try { return { r: await a.send(convId, { text, idemKey: 'p-b', as: 'user', attachments: fl, budgetMs }) }; } catch (e) { return { e }; } };
const at = (cs) => cs.map((c) => c.at - T0).join(' / ');

/** F1 — {pin: [problems]}, 'F1·slack' / 'F1·lark' (one copy of the plan reds both by name). */
async function vendorWaitJudge(S, L) {
  const out = {};
  const fail = (pin, m) => { (out[pin] = out[pin] || []).push(m); };
  // Lark: 503 + a named 30 s (Retry-After, and the vendor's own reset header) ⇒ ONE upload, said at once with the 30 s
  for (const h of [RA(30), { 'x-ogw-ratelimit-reset': '30' }]) {
    const { a, calls, sleeps, clock } = retryRig(L, 'lark', (c) => (isUp(c) ? jsonRes(503, BUSY, h) : okLark(c)), { random: half });
    const { e } = await sendR(a, 'oc_fixture', files().slice(1), '');
    clock.t += 31000; await new Promise((res) => setImmediate(res));   // past the vendor's window: nothing was left pending
    const U = calls.filter(isUp);
    if (!(e && e.code === 'transport' && e.retryable === true && e.detail && e.detail.retryAfterSec === 30 && e.detail.attempts === 1 && e.detail.stopped === 'budget' && e.message === 'lark upload file: service unavailable (503) (after 1 attempt (budget) — Retry-After 30 s)' && U.length === 1 && calls.length === 1 && sleeps.length === 0)) fail('F1·lark', `503 + ${Object.keys(h)[0]} 30: uploads at ${at(U)} ms, ${sleeps.length} waits, ${e ? `${e.code} retryable=${e.retryable} retryAfterSec=${e.detail && e.detail.retryAfterSec} "${e.message}"` : 'no throw'} (want ONE upload, thrown at once, retryAfterSec 30)`);
  }
  // Lark: 503 + Retry-After 2, then 200 ⇒ the second upload 2 s after the failure (the backoff alone: 1 s), landed
  { let ups = 0;
    const { a, calls } = retryRig(L, 'lark', (c) => (isUp(c) && ++ups === 1 ? jsonRes(503, BUSY, RA(2)) : okLark(c)), { random: half });
    const { r, e } = await sendR(a, 'oc_fixture', files().slice(1), '');
    const U = calls.filter(isUp);
    if (!(r && r.ok && r.parts[0].retried === 1 && U.length === 2 && U[1].at - U[0].at === 2000)) fail('F1·lark', `503 + Retry-After 2 then 200: ${e ? `threw ${e.code} "${e.message}"` : JSON.stringify(r.parts)}, uploads at ${at(U)} ms (want 0 / 2000 — the vendor's 2 s over the 1 s backoff)`);
  }
  // Slack: the same on files.slack.com — the hint rides the failure now; the next attempt's fresh URL ask 2 s later
  { let posts = 0;
    const { a, calls } = retryRig(S, 'slack', (c) => (isPost(c) && ++posts === 1 ? jsonRes(503, 'busy', RA(2)) : okSlack(c)), { random: half });
    const { r, e } = await sendR(a, 'C0FIXTURE', files().slice(0, 1), 'x');
    const U = calls.filter(isUrl), Ps = calls.filter(isPost);
    if (!(r && r.ok && r.parts[0].retried === 1 && chainOf(calls) === 'UPUPC' && U[1].at - Ps[0].at === 2000)) fail('F1·slack', `503 + Retry-After 2 then 200: ${e ? `threw ${e.code} "${e.message}"` : JSON.stringify(r.parts)}, chain ${chainOf(calls)}, the second ask ${U[1] && Ps[0] ? U[1].at - Ps[0].at : '—'} ms after the failure (want 2000)`);
  }
  { const { a, calls, sleeps } = retryRig(S, 'slack', (c) => (isPost(c) ? jsonRes(503, 'busy', RA(30)) : okSlack(c)), { random: half });
    const { e } = await sendR(a, 'C0FIXTURE', files().slice(0, 1), 'x');
    if (!(e && e.code === 'transport' && e.retryable === true && e.detail && e.detail.retryAfterSec === 30 && e.detail.attempts === 1 && e.message === 'slack files.upload: HTTP 503 (after 1 attempt (budget) — Retry-After 30 s)' && chainOf(calls) === 'UP' && sleeps.length === 0)) fail('F1·slack', `503 + Retry-After 30: chain ${chainOf(calls)}, ${sleeps.length} waits, ${e ? `${e.code} retryAfterSec=${e.detail && e.detail.retryAfterSec} "${e.message}"` : 'no throw'} (want ONE POST, thrown at once, retryAfterSec 30)`);
  }
  // no header ⇒ the backoff alone (R⑮'s 1 s / 3 s — at the jitter's middle exactly 1000 / 3000), both adapters
  { const { a, calls } = retryRig(S, 'slack', (c) => (isPost(c) ? jsonRes(503, 'busy') : okSlack(c)), { random: half });
    await sendR(a, 'C0FIXTURE', files().slice(0, 1), 'x');
    const U = calls.filter(isUrl), Ps = calls.filter(isPost);
    if (!(Ps.length === 3 && U[1].at - Ps[0].at === 1000 && U[2].at - Ps[1].at === 3000)) fail('F1·slack', `503 with no header: chain ${chainOf(calls)}, asks at ${at(U)} (want UPUPUP, 1000 / 3000 after each failure)`);
  }
  { const { a, calls } = retryRig(L, 'lark', (c) => (isUp(c) ? jsonRes(503, BUSY) : okLark(c)), { random: half });
    await sendR(a, 'oc_fixture', files().slice(1), '');
    const U = calls.filter(isUp);
    if (!(U.length === 3 && U[1].at - U[0].at === 1000 && U[2].at - U[1].at === 3000)) fail('F1·lark', `503 with no header: uploads at ${at(U)} (want 0 / 1000 / 4000)`);
  }
  return out;
}

/** F2 — send A's upload 504s; during A's wait send B (a text to another chat) is answered 429 + reset 30 (the account's
 *  hold armed) ⇒ A sends NO second upload: rate-limited, held: true. */
async function holdAfterWaitJudge(L) {
  const out = {};
  let ups = 0, b = null;
  const rig = retryRig(L, 'lark', (c) => {
    if (isUp(c)) return ++ups === 1 ? jsonRes(504, GATEWAY) : okLark(c);
    if (isMsg(c) && c.json && c.json.receive_id === 'oc_other') return jsonRes(429, { code: 99991400, msg: 'request trigger frequency limit' }, { 'x-ogw-ratelimit-reset': '30' });
    return okLark(c);
  }, { random: half, onSleep: async () => { if (!b) b = await sendR(rig.a, 'oc_other', [], 'meanwhile'); } });
  const A = await sendR(rig.a, 'oc_fixture', files().slice(1), '');
  const U = rig.calls.filter(isUp);
  if (!(U.length === 1 && b && b.e && b.e.code === 'rate-limited' && A.e && A.e.code === 'rate-limited' && A.e.detail && A.e.detail.held === true)) out.F2 = [`uploads that left: ${U.length} | send B: ${b ? (b.e ? b.e.code : 'sent') : 'never ran'} | send A: ${A.e ? `${A.e.code} held=${A.e.detail && A.e.detail.held}` : 'sent'} (want ONE upload, A rate-limited held: true)`];
  return out;
}

/** F3 through a REAL engine (its clock = the rig's): two files, a.png lands, b.pdf's every 504 answered 13 s after it
 *  left. `lane`: 'collect' (an agent's direct reply read inline), 'cli' (an agent's direct reply, no inline read),
 *  'approved' (the owner's Approve). → { q, r, took, posts } */
async function budgetLane(ENGm, S, lane) {
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-send-files-budget-'));
  let posts = 0;
  const rig = retryRig(S, 'slack', (c, k) => { if (isPost(c) && ++posts > 1) { k.t += SLOW; return jsonRes(504, GATEWAY); } return okSlack(c); }, { random: half });
  const mod = { kind: 'slack-budget', caps: { ...fake.fakePoll.caps, idempotency: S.caps.idempotency, sendAttachments: S.caps.sendAttachments, sendAttachmentsWhy: null, budget: undefined, pace: undefined },
    create(record, deps) { const base = fake.fakePoll.create(record, { ...deps }); return Object.assign(Object.create(base), { send: (c, o) => (o && Array.isArray(o.attachments) && o.attachments.length ? rig.a.send(c, o) : base.send(c, o)) }); } };
  const registry = CH.createChannelRegistry(); registry.register(mod);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'sb', kind: 'slack-budget', label: 'sb', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: null }] }));
  let eng = null;
  try {
    eng = ENGm.create({ dataDir, registry, env: {}, now: () => rig.clock.t, broadcast: () => {}, serverSetting: (k) => ({ 'channels.guardAttachmentsReview': lane === 'approved' })[k], liveSessions: () => [], userTodos: { add: () => ({ id: 't' }) }, log: { log() {}, warn() {}, error() {} } });
    await eng.pass('sb', { force: true });
    const conv = Object.keys(eng.store.index.live()).find((k) => k.startsWith('sb/')).slice(3);
    const att = files().map((f) => ({ name: f.name, data: f.data.toString('base64') }));
    let r, t0;
    if (lane === 'approved') {
      const pr = await eng.propose(null, 'sb', conv, { text: 'two files', attachments: att });
      if (!pr.ok) return { err: `propose: ${JSON.stringify(pr).slice(0, 160)}` };
      t0 = rig.clock.t;
      r = await eng.approve(pr.proposal.id, { shown: P.shownDigest((eng.outboxView().proposals || []).find((p) => p.id === pr.proposal.id)) });
      r = { ...r, proposal: pr.proposal };
    } else {
      await eng.setPolicy('sb', conv, 'direct');
      await eng.propose({ kind: 'user' }, 'sb', conv, { text: 'prime: learn the send caps' });
      await eng.setAssignment('sb', conv, { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, mode: 'all', authority: 'send' });
      t0 = rig.clock.t;
      r = await eng.propose(AGENT_W, 'sb', conv, { text: 'two files', attachments: att }, { collect: lane === 'collect' });
      if (!r.ok || !r.proposal) return { err: `propose: ${JSON.stringify(r).slice(0, 200)}` };
    }
    const q = eng.store.outbox.snapshot().proposals[r.proposal.id];
    return { q, r, took: rig.clock.t - t0, posts: rig.calls.filter(isPost) };
  } finally { try { if (eng && eng.stop) eng.stop(); } catch { /* stopped */ } fs.rmSync(dataDir, { recursive: true, force: true }); }
}

/** F3 — 'F3·adapter' (both adapters' arithmetic on a handed budget), 'F3·engine' (the budget each lane brings). */
async function budgetJudge(S, L, ENGm) {
  const out = {};
  const fail = (pin, m) => { (out[pin] = out[pin] || []).push(m); };
  const slowSlack = (c, k) => { if (isPost(c)) { k.t += SLOW; return jsonRes(504, GATEWAY); } return okSlack(c); };
  // a 30 s budget, each 504 answered 13 s after it left: attempt 2 fits (window 16 s), attempt 3 does not ⇒ said at 27 s
  { const { a, calls, clock } = retryRig(S, 'slack', slowSlack, { random: half });
    const { e } = await sendB(a, 'C0FIXTURE', files().slice(0, 1), 'x', 30000);
    const Ps = calls.filter(isPost);
    if (!(e && e.code === 'transport' && e.retryable === true && e.message === 'slack files.upload: HTTP 504 (after 2 attempts (budget))' && e.detail.stopped === 'budget' && e.detail.attempts === 2 && Ps.length === 2 && Ps[0].win === 60000 && Ps[1].win === 16000 && clock.t - T0 === 27000)) fail('F3·adapter', `slack, a 30 s budget: ${Ps.length} POSTs (windows ${Ps.map((c) => c.win).join(' / ')} ms), said at ${clock.t - T0} ms, ${e ? `"${e.message}"` : 'no throw'} (want 2 POSTs, windows 60000 / 16000, «(after 2 attempts (budget))» at 27000)`);
  }
  { const { a, calls, clock } = retryRig(L, 'lark', (c, k) => { if (isUp(c)) { k.t += SLOW; return jsonRes(504, GATEWAY); } return okLark(c); }, { random: half });
    const { e } = await sendB(a, 'oc_fixture', files().slice(1), '', 30000);
    const U = calls.filter(isUp);
    if (!(e && e.message === 'lark upload file: HTTP 504 (504) (after 2 attempts (budget))' && e.detail.stopped === 'budget' && U.length === 2 && U[0].win === 60000 && U[1].win === 16000 && clock.t - T0 === 27000)) fail('F3·adapter', `lark, a 30 s budget: ${U.length} uploads (windows ${U.map((c) => c.win).join(' / ')} ms), said at ${clock.t - T0} ms, ${e ? `"${e.message}"` : 'no throw'} (want 2, 60000 / 16000, at 27000)`);
  }
  // the outbox's own budget (120 s) ⇒ 3 attempts as R⑨, «(after 3 attempts)» at 43 s
  { const { a, calls, clock } = retryRig(S, 'slack', slowSlack, { random: half });
    const { e } = await sendB(a, 'C0FIXTURE', files().slice(0, 1), 'x', OUTBOX_MS);
    if (!(e && e.message === 'slack files.upload: HTTP 504 (after 3 attempts)' && e.detail.stopped === 'count' && calls.filter(isPost).length === 3 && clock.t - T0 === 43000)) fail('F3·adapter', `slack, the outbox's 120 s: ${calls.filter(isPost).length} POSTs, said at ${clock.t - T0} ms, ${e ? `"${e.message}"` : 'no throw'} (want 3, «(after 3 attempts)» at 43000)`);
  }
  // THE LANES (a real engine): an agent's direct reply read inline (collect: the 20 s window − 2 s) ⇒ ONE attempt, the
  // receipt inline at 13 s as the base answered; the CLI's own 30 s (− 2 s) ⇒ 2 attempts (window 14 s), answered at 27 s;
  // the owner's Approve (the outbox's 120 s) ⇒ 3 attempts, 43 s
  const reasonOf = (q) => String((q && q.reason) || '');
  { const v = await budgetLane(ENGm, S, 'collect');
    const ok1 = !v.err && v.q.state === 'sent' && reasonOf(v.q).endsWith('NOT landed: "b.pdf" (transport: slack files.upload: HTTP 504 (after 1 attempt (budget)))') && v.r.receiptPending === false && /after 1 attempt \(budget\)/.test(v.r.receiptText || '') && v.took === 13000 && v.posts.length === 2;
    if (!ok1) fail('F3·engine', `an agent's direct reply read inline: ${v.err || `${v.q.state} ${JSON.stringify(reasonOf(v.q))}, inline ${v.r.receiptPending === false ? 'yes' : 'no'}, answered at ${v.took} ms, ${v.posts.length} POSTs`} (want partly sent «(after 1 attempt (budget))», the receipt inline at 13000, 2 POSTs)`);
  }
  { const v = await budgetLane(ENGm, S, 'cli');
    const ok2 = !v.err && v.q.state === 'sent' && reasonOf(v.q).endsWith('(transport: slack files.upload: HTTP 504 (after 2 attempts (budget)))') && v.took === 27000 && v.took < CLI_MS && v.posts.length === 3 && v.posts[2].win === 14000;
    if (!ok2) fail('F3·engine', `an agent's direct reply, the CLI's 30 s: ${v.err || `${v.q.state} ${JSON.stringify(reasonOf(v.q))}, answered at ${v.took} ms, ${v.posts.length} POSTs (windows ${v.posts.map((c) => c.win).join(' / ')})`} (want «(after 2 attempts (budget))» at 27000 < 30000, the retry's window 14000)`);
  }
  { const v = await budgetLane(ENGm, S, 'approved');
    const ok3 = !v.err && v.q.state === 'sent' && reasonOf(v.q).endsWith('(transport: slack files.upload: HTTP 504 (after 3 attempts))') && v.took === 43000 && v.posts.length === 4;
    if (!ok3) fail('F3·engine', `the owner's Approve: ${v.err || `${v.q.state} ${JSON.stringify(reasonOf(v.q))}, answered at ${v.took} ms, ${v.posts.length} POSTs`} (want «(after 3 attempts)» at 43000, 4 POSTs)`);
  }
  return out;
}

if (!Plan) ok(false, 'plan — src/channel-upload-plan.js (THE plan both adapters ask) is missing');
else {
  const CC = require(path.join(REPO, 'src/cli-call.js'));
  const nt = (o) => JSON.stringify(Plan.nextTry({ random: half, ...o }));
  const planRows = [
    [Plan.CLI_WRITE_BUDGET_MS === CC.BUDGETS.write, `the command budget's CLI half = src/cli-call.js BUDGETS.write (${Plan.CLI_WRITE_BUDGET_MS} / ${CC.BUDGETS.write})`],
    [Plan.commandBudgetMs({ collectWindowMs: P.COLLECT_WINDOW_MS }) === 18000 && Plan.commandBudgetMs({}) === 28000 && Plan.commandBudgetMs({ collectWindowMs: 60000 }) === 28000, 'commandBudgetMs: read inline ⇒ min(30 s, the 20 s collect window) − 2 s = 18000; no inline read (or a longer window) ⇒ 28000'],
    [Plan.sendBudgetMs(null, T0) === 120000 && Plan.sendBudgetMs(T0 + 18000, T0 + 3000) === 15000 && Plan.sendBudgetMs(T0, T0 + 5) === 0, "sendBudgetMs: no command deadline ⇒ the outbox's 120000; else what is left (never negative)"],
    [Plan.windowMs(1, 0, 1) === 60000 && Plan.windowMs(2, 0, 4999) === 0 && Plan.windowMs(2, 0, 5000) === 5000 && Plan.windowMs(3, 0, Infinity) === 60000, "windowMs: the first attempt keeps the base's 60 s whatever is left; a retry gets min(60 s, what is left), 0 under 5 s"],
    [nt({ n: 1, retryAfterSec: 10 }) === '{"go":true,"waitMs":10000}' && nt({ n: 1, retryAfterSec: 11 }) === '{"go":false,"stop":"budget","waitMs":11000}' && nt({ n: 2, retryAfterSec: 1 }) === '{"go":true,"waitMs":3000}' && nt({ n: 3 }) === '{"go":false,"stop":"count"}', "nextTry: max(backoff, the vendor's wait); a named wait over 10 s is never sat through; the third failure stops by count"],
    [nt({ n: 1, now: 0, deadline: 6000 }) === '{"go":true,"waitMs":1000}' && nt({ n: 1, now: 0, deadline: 5999 }) === '{"go":false,"stop":"budget","waitMs":1000}', 'nextTry: the wait + 5 s must fit before the deadline'],
    [Plan.stopWords({ n: 3 }) === '(after 3 attempts)' && Plan.stopWords({ n: 1, stop: 'budget' }) === '(after 1 attempt (budget))' && Plan.stopWords({ n: 2, stop: 'budget', retryAfterSec: 30 }) === '(after 2 attempts (budget) — Retry-After 30 s)', 'stopWords: a count stop «(after 3 attempts)» reads differently from a budget stop «(after 1 attempt (budget))»; a vendor wait that did not fit names its seconds'],
  ];
  for (const [cond, words] of planRows) ok(cond, `plan — ${words}`);
}
const vwj = await vendorWaitJudge(slack, lark);
ok(!vwj['F1·lark'], `F1 lark: 503 + Retry-After 30 (or x-ogw-ratelimit-reset 30) ⇒ ONE upload, thrown at once «… (503) (after 1 attempt (budget) — Retry-After 30 s)», retryable, retryAfterSec 30, nothing left after the clock passes 30 s; Retry-After 2 ⇒ the second upload at +2000 (not the 1 s backoff), landed; no header ⇒ 1000 / 3000${vwj['F1·lark'] ? ` — ${vwj['F1·lark'].join('; ')}` : ''}`);
ok(!vwj['F1·slack'], `F1 slack: a files.slack.com 503 + Retry-After 2 ⇒ the fresh URL ask at +2000, landed; + Retry-After 30 ⇒ ONE POST, thrown at once with retryAfterSec 30 (the hint now rides the failure); no header ⇒ 1000 / 3000${vwj['F1·slack'] ? ` — ${vwj['F1·slack'].join('; ')}` : ''}`);
const haw = await holdAfterWaitJudge(lark);
ok(!haw.F2, `F2 lark: send A's upload 504s, send B's text gets 429 + reset 30 during A's wait ⇒ uploads that left: 1, send A rate-limited held: true (no request inside the hold another send armed)${haw.F2 ? ` — ${haw.F2.join('; ')}` : ''}`);
const bj = await budgetJudge(slack, lark, ENG);
ok(!bj['F3·adapter'], `F3 the adapters on a handed budget: 30 s with each 504 at 13 s ⇒ attempt 2 in a 16 s window, attempt 3 not made, «(after 2 attempts (budget))» at 27 s — Slack and Lark; the outbox's 120 s ⇒ 3 attempts «(after 3 attempts)» at 43 s${bj['F3·adapter'] ? ` — ${bj['F3·adapter'].join('; ')}` : ''}`);
ok(!bj['F3·engine'], `F3 the lanes through a real engine: an agent's direct reply read inline ⇒ ONE attempt, the partly-sent receipt inline at 13 s «(after 1 attempt (budget))» (as the base answered); the CLI's 30 s ⇒ «(after 2 attempts (budget))» at 27 s; the owner's Approve ⇒ «(after 3 attempts)» at 43 s${bj['F3·engine'] ? ` — ${bj['F3·engine'].join('; ')}` : ''}`);
// ⑫b PATCHED-COPY CONTROLS: a copy of the PLAN loaded by copies of BOTH adapters (one law, red on both by name); a copy of lark.js
{
  const keepR = setInterval(() => {}, 1000);
  const PS = Plan ? fs.readFileSync(PLAN_FILE, 'utf8') : '';
  const SS = fs.readFileSync(path.join(REPO, 'src/channels/slack.js'), 'utf8'), LS = fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf8');
  const PLAN_REQ = "require('../channel-upload-plan.js')";
  const onPlan = (from, to, tag) => {
    if (!PS.includes(from) || !SS.includes(PLAN_REQ) || !LS.includes(PLAN_REQ)) return null;
    const pp = MC.write('src/channel-upload-plan.js', PS.replace(from, to), tag);
    return { S: require(MC.write('src/channels/slack.js', SS.replace(PLAN_REQ, `require(${JSON.stringify(pp)})`), `${tag}-slack`)), L: require(MC.write('src/channels/lark.js', LS.replace(PLAN_REQ, `require(${JSON.stringify(pp)})`), `${tag}-lark`)) };
  };
  const say = (red, pins) => (red === null ? 'the patch site is gone' : red.length === pins.length ? `red by ${red.join(' ')}` : `red by ${red.join(' ') || 'nothing'} — GREEN on ${pins.filter((p) => !red.includes(p)).join(' ')}`);
  const f1 = onPlan('const named = Number(retryAfterSec) > 0 ? Math.ceil(Number(retryAfterSec) * 1000) : 0;', 'const named = 0;', 'r2-F1-ignore-header');
  const f3 = onPlan('return Number.isFinite(b) ? Number(now) + Math.max(0, b) : Infinity;', 'return Infinity;', 'r2-F3-no-budget');
  const HOLD = '        const hold = heldRefusal(); if (hold) throw hold;   // another send';
  const f2 = LS.includes(HOLD) ? require(MC.write('src/channels/lark.js', LS.replace(HOLD, '        /*r2-F2*/   // another send'), 'r2-F2-no-hold-check')) : null;
  const rows = [
    ["r2-F1-ignore-header (the base's loop: the vendor's wait never read)", f1 ? await vendorWaitJudge(f1.S, f1.L) : null, ['F1·slack', 'F1·lark']],
    ['r2-F2-no-hold-check (lark: no hold check after the wait)', f2 ? await holdAfterWaitJudge(f2) : null, ['F2']],
    ['r2-F3-no-budget (the plan never sees a deadline)', f3 ? await budgetJudge(f3.S, f3.L, ENG) : null, ['F3·adapter', 'F3·engine']],
  ];
  for (const [what, r, pins] of rows) {
    const red = r ? pins.filter((p) => r[p]) : null;
    ok(Array.isArray(red) && red.length === pins.length, `control — ${what}: ${say(red, pins)}${red && red.length ? ` (${red.map((p) => `${p}: ${r[p][0].slice(0, 150)}`).join(' | ')})` : ''}`);
  }
  clearInterval(keepR);
}
// ⑫c lane channel-upload-retry ROUND 3 (the r2 acceptance's two minors), on the same wrapped AbortSignal.timeout:
//   m1 THE BUDGET COVERS EVERYTHING A RETRY DOES: each request of a retry reads its window right BEFORE it leaves (after its
//      bucket, its pace, Lark's token) — Slack's URL ask min(its 20 s, what is left − the bytes' 5 s); none left ⇒ not sent
//      (no URL minted, no unit metered); a retry's ask that fails once none is left is the budget's stop, never its own words;
//   m2 THE ZERO-WINDOW STOP HAS A LEG: a pace that eats the window stops the retry before its request, «(after 1 attempt (budget))».
console.log('⑫c lane channel-upload-retry r3: every step of a retry inside the budget (m1), the zero-window stop reached (m2)');
const REFRESHED = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/lark/recorded.json'), 'utf8')).tokenRefreshed;
/** The acceptance's probe: the FIRST upload request answered 504 12 s after it left. `paceAt` = [the nth pace after that
 *  504, the ms it eats]; `extra(c, clock)` answers a request first (null = not its). */
function probeRig(M, kind, { askMs = null, paceAt = null, token = null, extra = null } = {}) {
  let failed = false, paces = 0, rig = null;
  const route = (c, k) => {
    const x = extra ? extra(c, k) : null;
    if (x) return x;
    if (!failed && (kind === 'slack' ? isPost(c) : isUp(c))) { failed = true; k.t += 12000; return jsonRes(504, GATEWAY); }
    return kind === 'slack' ? okSlack(c) : okLark(c);
  };
  const pace = paceAt ? async () => { if (failed && ++paces === paceAt[0]) rig.clock.t += paceAt[1]; } : null;
  rig = retryRig(M, kind, route, { random: half, pace, askMs, token });
  return rig;
}
const ONE_BUDGET = { slack: 'slack files.upload: HTTP 504 (after 1 attempt (budget))', lark: 'lark upload file: HTTP 504 (504) (after 1 attempt (budget))' };
const stoppedOne = (e, who) => !!(e && e.code === 'transport' && e.retryable === true && e.message === ONE_BUDGET[who] && e.detail && e.detail.attempts === 1 && e.detail.stopped === 'budget');
const saidE = (e) => (e ? `${e.code} "${e.message}"` : 'no throw (landed)');

/** m1 — 'm1·slack' / 'm1·lark': every step of a retry inside the send's budget. */
async function stepsJudge(S, L) {
  const out = {};
  const fail = (pin, m) => { (out[pin] = out[pin] || []).push(m); };
  // the acceptance's probe: an inline direct reply (18 s), the bytes 504 at 12 s, the retry's URL ask would take 19 s ⇒
  // after the 1 s wait 5 s are left = the bytes' own minimum: NO ask (no URL minted, no unit), said at 13 s, «UP»
  { const { a, calls, clock, units } = probeRig(S, 'slack', { askMs: (k) => (k === 2 ? 19000 : 0) });
    const { e } = await sendB(a, 'C0FIXTURE', files().slice(0, 1), 'x', 18000);
    const t = clock.t - T0;
    if (!(stoppedOne(e, 'slack') && chainOf(calls) === 'UP' && units.length === 2 && t === 13000)) fail('m1·slack', `18 s, 504 at 12 s, a 19 s URL ask: chain ${chainOf(calls)}, ${units.length} units, said at ${t} ms, ${saidE(e)} (want «UP» — no second ask —, 2 units, «(after 1 attempt (budget))» at 13000 ≤ 18000)`);
  }
  // the ask's own window: the CLI's 28 s, the same probe ⇒ the retry's ask leaves at 13 s in min(20 s, 15 − 5) = 10 s and
  // runs it out ⇒ the budget's stop at 23 s (never the ask's own timeout words)
  { const { a, calls, clock } = probeRig(S, 'slack', { askMs: (k) => (k === 2 ? 19000 : 0) });
    const { e } = await sendB(a, 'C0FIXTURE', files().slice(0, 1), 'x', 28000);
    const U = calls.filter(isUrl), t = clock.t - T0;
    if (!(stoppedOne(e, 'slack') && chainOf(calls) === 'UPU' && U[1].win === 10000 && t === 23000)) fail('m1·slack', `28 s, 504 at 12 s, a 19 s URL ask: chain ${chainOf(calls)}, the retry's ask in ${U[1] ? U[1].win : '—'} ms, said at ${t} ms, ${saidE(e)} (want «UPU», the ask's window 10000, «(after 1 attempt (budget))» at 23000 ≤ 28000)`);
  }
  // the Lark twin: the retry's token is refreshed (its answer 12 s) ⇒ the window read after it — 3 s left — NO second
  // upload, no unit for it, said at 25 s
  { const { a, calls, clock, units } = probeRig(L, 'lark', { token: { expiresAt: T0 + 15 * 60e3 + 5000 }, extra: (c, k) => (c.url.endsWith('/authen/v2/oauth/token') ? (k.t += 12000, jsonRes(200, REFRESHED)) : null) });
    const { e } = await sendB(a, 'oc_fixture', files().slice(1), '', 28000);
    const U = calls.filter(isUp), R = calls.filter((c) => c.url.endsWith('/authen/v2/oauth/token')), t = clock.t - T0;
    if (!(stoppedOne(e, 'lark') && U.length === 1 && R.length === 1 && units.length === 2 && t === 25000)) fail('m1·lark', `28 s, 504 at 12 s, the retry's token refreshed in 12 s: ${U.length} uploads, ${R.length} refreshes, ${units.length} units, said at ${t} ms, ${saidE(e)} (want ONE upload, the refresh, 2 units, «(after 1 attempt (budget))» at 25000)`);
  }
  return out;
}

/** m2 — 'm2·slack' / 'm2·lark': the zero-window stop is the one that stops (a pace eats the window; nothing in the
 *  chain after it, the words count the attempts MADE). */
async function zeroWindowJudge(S, L) {
  const out = {};
  const fail = (pin, m) => { (out[pin] = out[pin] || []).push(m); };
  // slack, the retry's URL ask: 28 s, 504 at 12 s, the wait to 13 s, its pace to 19 s ⇒ 4 s left under the bytes' 5 s
  { const { a, calls, clock, units } = probeRig(S, 'slack', { paceAt: [1, 6000] });
    const { e } = await sendB(a, 'C0FIXTURE', files().slice(0, 1), 'x', 28000);
    const t = clock.t - T0;
    if (!(stoppedOne(e, 'slack') && chainOf(calls) === 'UP' && units.length === 2 && t === 19000)) fail('m2·slack', `the retry's ask paced 6 s: chain ${chainOf(calls)}, ${units.length} units, said at ${t} ms, ${saidE(e)} (want «UP», 2 units, «(after 1 attempt (budget))» at 19000)`);
  }
  // slack, the retry's BYTES: the ask lands at 13 s, the bytes' pace to 24 s ⇒ 4 s left: no second POST
  { const { a, calls, clock, units } = probeRig(S, 'slack', { paceAt: [2, 11000] });
    const { e } = await sendB(a, 'C0FIXTURE', files().slice(0, 1), 'x', 28000);
    const t = clock.t - T0;
    if (!(stoppedOne(e, 'slack') && chainOf(calls) === 'UPU' && units.length === 3 && t === 24000)) fail('m2·slack', `the retry's bytes paced 11 s: chain ${chainOf(calls)}, ${units.length} units, said at ${t} ms, ${saidE(e)} (want «UPU», 3 units, «(after 1 attempt (budget))» at 24000)`);
  }
  // lark, the retry's upload: its pace to 24 s ⇒ 4 s left: no second upload
  { const { a, calls, clock, units } = probeRig(L, 'lark', { paceAt: [1, 11000] });
    const { e } = await sendB(a, 'oc_fixture', files().slice(1), '', 28000);
    const U = calls.filter(isUp), t = clock.t - T0;
    if (!(stoppedOne(e, 'lark') && U.length === 1 && calls.length === 1 && units.length === 1 && t === 24000)) fail('m2·lark', `the retry's upload paced 11 s: ${U.length} uploads, ${units.length} units, said at ${t} ms, ${saidE(e)} (want ONE upload, 1 unit, «(after 1 attempt (budget))» at 24000)`);
  }
  return out;
}

if (Plan) {
  const ASKW = { ownMs: 20000, leaveMs: 5000 };
  ok(Plan.windowMs(1, 0, 1, ASKW) === 20000 && Plan.windowMs(2, 0, 15000, ASKW) === 10000 && Plan.windowMs(2, 0, 10000, ASKW) === 5000 && Plan.windowMs(2, 0, 9999, ASKW) === 0 && Plan.windowMs(2, 0, 60000, ASKW) === 20000 && Plan.windowMs(2, 0, 1e6) === 60000,
    "plan — windowMs with a request's own window and what it leaves: Slack's URL ask on attempt 1 its own 20 s; on a retry min(20 s, what is left − the bytes' 5 s), 0 under 5 s");
}
const sj = await stepsJudge(slack, lark);
ok(!sj['m1·slack'], `m1 slack: the acceptance's probe (18 s, the bytes 504 at 12 s, a 19 s URL ask) ⇒ NO second ask, «(after 1 attempt (budget))» at 13 s, «UP»; with the CLI's 28 s the retry's ask leaves in 10 s and runs it out ⇒ the budget's stop at 23 s${sj['m1·slack'] ? ` — ${sj['m1·slack'].join('; ')}` : ''}`);
ok(!sj['m1·lark'], `m1 lark: the retry's token refreshed in 12 s (28 s, 504 at 12 s) ⇒ the window read AFTER it, 3 s left ⇒ no second upload, «(after 1 attempt (budget))» at 25 s${sj['m1·lark'] ? ` — ${sj['m1·lark'].join('; ')}` : ''}`);
const zw = await zeroWindowJudge(slack, lark);
ok(!zw['m2·slack'], `m2 slack: a pace that eats the window before the retry's URL ask (no ask) or its bytes (no second POST) ⇒ the zero-window stop, «(after 1 attempt (budget))», no unit metered for the request not sent${zw['m2·slack'] ? ` — ${zw['m2·slack'].join('; ')}` : ''}`);
ok(!zw['m2·lark'], `m2 lark: a pace that eats the window before the retry's upload ⇒ the zero-window stop, ONE upload, «(after 1 attempt (budget))»${zw['m2·lark'] ? ` — ${zw['m2·lark'].join('; ')}` : ''}`);
// ⑫c PATCHED-COPY CONTROLS: copies of BOTH adapters, red by name
{
  const keepR = setInterval(() => {}, 1000);
  const SS = fs.readFileSync(path.join(REPO, 'src/channels/slack.js'), 'utf8'), LS = fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf8');
  const both = (pS, pL, tag) => {
    const s2 = pS(SS), l2 = pL(LS);
    return s2 && l2 ? { S: require(MC.write('src/channels/slack.js', s2, `${tag}-slack`)), L: require(MC.write('src/channels/lark.js', l2, `${tag}-lark`)) } : null;
  };
  const sub = (from, to) => (src) => (src.includes(from) ? src.replace(from, to) : null);
  const ASK_ON = '{ convId, windowOf: () => windowOf(ASK_WINDOW) }';
  // lark's r2 order: the window read BEFORE the token + the pace
  const L_TOKEN = '      let at0 = await accessToken();\n      await pace(1);\n      if (bearerExpired()) at0 = await accessToken();\n';
  const lWin = (src) => { const m = /      const w = Plan\.windowMs\(n, now\(\), deadline\);[^\n]*\n      if \(!w\) throw stoppedUpload\(lastErr, n - 1, 'budget'\);[^\n]*\n/.exec(src); return m && src.includes(L_TOKEN + m[0]) ? src.replace(L_TOKEN + m[0], m[0] + L_TOKEN) : null; };
  const STOP = "if (!w) throw stoppedUpload(lastErr, n - 1, 'budget');";
  const ASK_CATCH = "catch (e) { if (n > 1 && e instanceof ChannelError && e.code === 'transport') windowOf(ASK_WINDOW); throw e; }";
  const say = (red, pins) => (red === null ? 'the patch site is gone' : red.length === pins.length ? `red by ${red.join(' ')}` : `red by ${red.join(' ') || 'nothing'} — GREEN on ${pins.filter((p) => !red.includes(p)).join(' ')}`);
  const m1 = both(sub(ASK_ON, '{ convId }'), lWin, 'r3-m1-ask-outside-budget');
  const m1w = both(sub(ASK_CATCH, 'catch (e) { throw e; }'), (src) => src, 'r3-m1-ask-own-words');
  const m2a = both(sub(STOP, ''), sub(STOP, ''), 'r3-m2-no-stop');
  const m2b = both(sub(STOP, STOP.replace('n - 1', 'n')), sub(STOP, STOP.replace('n - 1', 'n')), 'r3-m2-off-by-one');
  const rows = [
    ["r3-m1-ask-outside-budget (slack: the retry's URL ask in callSlack's own 20 s; lark: the window read before the token + the pace — r2's order)", m1 ? await stepsJudge(m1.S, m1.L) : null, ['m1·slack', 'm1·lark']],
    ["r3-m1-ask-own-words (slack: a retry's ask that ran the budget out said as its own timeout)", m1w ? await stepsJudge(m1w.S, m1w.L) : null, ['m1·slack']],
    ['r3-m2-no-stop (both: the zero-window stop deleted — the request leaves with no window)', m2a ? await zeroWindowJudge(m2a.S, m2a.L) : null, ['m2·slack', 'm2·lark']],
    ['r3-m2-off-by-one (both: the stop counts the attempt it did not make)', m2b ? await zeroWindowJudge(m2b.S, m2b.L) : null, ['m2·slack', 'm2·lark']],
  ];
  for (const [what, r, pins] of rows) {
    const red = r ? pins.filter((p) => r[p]) : null;
    ok(Array.isArray(red) && red.length === pins.length, `control — ${what}: ${say(red, pins)}${red && red.length ? ` (${red.map((p) => `${p}: ${r[p][0].slice(0, 150)}`).join(' | ')})` : ''}`);
  }
  clearInterval(keepR);
}
AbortSignal.timeout = sigTimeout;

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
// ⑩ controls: THE BASE (no account hold — a copy whose send never checks it) sends the next proposal at once; a copy
// whose upload 429 holds nothing, an engine that FAILS a held send, a boot sweep that calls a held send unknown
{ const red = await mutant('channels/lark.js', '    if (held) throw held;', '    if (false) throw held;', (L) => holdEngineJudge(ENG, L, { shape: 'text' }), 'lark-no-send-hold');
  ok(Array.isArray(red) && red.length > 0 && /did not WAIT: sent, 1 requests/.test(red.join()), `control — BASE (no account hold): the next proposal 2 s later is SENT at once: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`); }
{ const red = await mutant('channels/lark.js', '        noteSendHold(e);   // lane lark-send-hold: a part\'s 429', '        void e;   // a part\'s 429', (L) => holdEngineJudge(ENG, L, { shape: 'upload' }), 'lark-upload-no-hold');
  ok(Array.isArray(red) && red.length > 0, `control — lark: an upload's 429 holds nothing: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`); }
{ const red = await mutantEngine('    if (heldUntil) return holdSend(id, rec, r, heldUntil, t);', '', (E) => holdEngineJudge(E, lark, { shape: 'text' }), 'engine-held-fails');
  ok(Array.isArray(red) && red.length > 0 && /did not WAIT: failed/.test(red.join()), `control — engine: a held send is FAILED: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`); }
{ const red = await mutantEngine("    const stuck = proposalsFor().filter((p) => p.state === 'sending' && !p.held);", "    const stuck = proposalsFor().filter((p) => p.state === 'sending');", (E) => holdEngineJudge(E, lark, { shape: 'text' }), 'engine-boot-unknown');
  ok(Array.isArray(red) && red.length > 0 && /a restart called the held sends unknown/.test(red.join()), `control — engine: a restart calls a held send unknown: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`); }
clearInterval(keep);
console.log(`\n${fails ? '✗' : '✓'} test-channel-send-files: ${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);

#!/usr/bin/env node
// design 005 §2.B (B-fd1f) — AN AGENT'S PROPOSAL CARRIES FILES, BOUND TO THE APPROVAL. The CLI reads the files and sends
// their bytes IN the proposal; the server bounds them, names them, sniffs and hashes them, writes them under
// outbox-files/<proposal>/<n> only once every refusal is past; the card's digest covers name + size + sha256; the send
// re-hashes and hands the adapter THOSE bytes (a changed file = `attachment-changed`, nothing sent); an unsent end takes
// the files at once, a sent one 7 days later. Owner Q2 = NO: an agent's attachment follows channels.guardAttachmentsReview
// and the channel's policy (no always-approve override). Every new rule has a patched-copy control (⑦).
//   ① PURE: bounds, the name rule, sniffType, the mismatch chip, attachVerdict, the digest, decideOutbound (Q2), the receipt
//   ② engine: propose → approve → send through a scripted adapter that records the bytes it was handed
//   ③ retention: reject / expire / the 7-day sweep / an orphan / a stale stage / a pruned record
//   ④ the owner-only file route (nosniff, sandbox, inline only for the four sniffed rasters)
//   ⑤ the registry row; ⑥ Gmail multipart parsed back + the upload form; ⑦ the CLI; ⑧ censuses; ⑨ controls
//   ⑩ verify r1: the owner's edit (C1), the card re-hashes (C2), agent bearers 403 (C3), the held bound (C4), a lone surrogate (C10),
//     the CLI reads through one descriptor (D4), V10 pinned three ways — each with its patched-copy control
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const P = require(path.join(REPO, 'src/channel-policy.js'));
const OF = require(path.join(REPO, 'src/channel-outbox-files.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const GM = require(path.join(REPO, 'src/channels/gmail.js'));
const STORE = require(path.join(REPO, 'src/channel-store.js'));
const express = require('express');
const SRC = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
const ROOT = scratch('chan-attach-send');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const M = mutantCopies('chan-attach-send', REPO);
const quiet = { log() {}, warn() {}, error() {} };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const b64 = (b) => Buffer.from(b).toString('base64');
const PNG = fake.fixturePng('attach-1');
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('zip body')]);
const HTML = Buffer.from('  <!DOCTYPE html><script>alert(1)</script>');

// ═══ ① PURE ═══════════════════════════════════════════════════════════════
console.log('① PURE: bounds, names, types, the row, the digest, the decision, the receipt');
function pureLegs(Pm, tag = '') {
  const r = [];
  const vp = (attachments) => Pm.validateProposal({ text: 'hi', attachments });
  const v11 = vp(Array.from({ length: 11 }, (_, i) => ({ name: `f${i}.txt`, data: b64('x') })));
  r.push(['eleven files ⇒ attachment-count', !v11.ok && v11.why === 'attachment-count', JSON.stringify(v11)]);
  const big = 'A'.repeat(12e6);   // 9 MB each decoded
  const v26 = vp([{ name: 'a.bin', data: big }, { name: 'b.bin', data: big }, { name: 'c.bin', data: big }]);
  r.push(['27 MB together ⇒ attachment-too-large', !v26.ok && v26.why === 'attachment-too-large', JSON.stringify(v26).slice(0, 200)]);
  const v0 = vp([{ name: 'empty.txt', data: '' }]);
  r.push(['a 0-byte file ⇒ attachment-empty', !v0.ok && v0.why === 'attachment-empty', JSON.stringify(v0)]);
  const vOld = vp([{ name: 'a.pdf', bytes: 10 }]);
  r.push(['the old names-only shape {name, bytes} ⇒ attachment-data (no bytes, nothing to send)', !vOld.ok && vOld.why === 'attachment-data', JSON.stringify(vOld)]);
  const vBad = vp([{ name: 'a.pdf', data: 'not base64!' }]);
  r.push(['data that is not base64 ⇒ attachment-data', !vBad.ok && vBad.why === 'attachment-data', JSON.stringify(vBad)]);
  for (const [name, why] of [['../x', 'a path'], ['a/b.txt', 'a separator'], ['a\\b.txt', 'a backslash'], ['x\r\nBcc: e@x.com', 'CR/LF'], [`cod${String.fromCodePoint(0x202e)}fdp.exe`, 'an RTL override'], [`a${String.fromCodePoint(0x200b)}.png`, 'a zero-width space'], ['a\nb.png', 'a line feed'], ['a\tb.png', 'a tab'], ['x'.repeat(201), 'past 200 characters'], [' a.png', 'an edge space'], ['..', 'a parent']]) {
    const v = vp([{ name, data: b64('x') }]);
    r.push([`a name with ${why} ⇒ attachment-name, refused (never cleaned)`, !v.ok && v.why === 'attachment-name', JSON.stringify(v).slice(0, 200)]);
  }
  const good = vp([{ name: '报告 v2.pdf', data: b64(ZIP) }, { name: 'shot.png', data: b64(PNG) }]);
  r.push(['a CJK name with a space and two files ⇒ accepted, sizes counted from the base64', good.ok && good.proposal.attachments.length === 2 && good.proposal.attachments[1].bytes === PNG.length, JSON.stringify(good).slice(0, 200)]);
  const sn = (b) => { const t = Pm.sniffType(b); return `${t.kind}:${t.mime}`; };
  const SNIFF = [[PNG, 'image:image/png'], [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]), 'image:image/jpeg'], [Buffer.from('GIF89a...'), 'image:image/gif'], [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]), 'image:image/webp'],
    [Buffer.from('%PDF-1.7'), 'file:application/pdf'], [ZIP, 'file:application/zip'], [Buffer.from([0x1f, 0x8b, 8]), 'file:application/gzip'], [HTML, 'file:text/html'], [Buffer.from('<?xml version="1.0"?><svg xmlns="x"/>'), 'file:image/svg+xml'],
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<svg onload=x>')]), 'file:image/svg+xml'], [Buffer.from('plain words, 中文'), 'file:text/plain'], [Buffer.from([0, 1, 2, 3]), 'file:application/octet-stream']];
  const badSniff = SNIFF.filter(([b, want]) => sn(b) !== want).map(([b, want]) => `${want} got ${sn(b)}`);
  r.push(['sniffType: the four rasters are images; pdf / zip / gzip / html / svg (BOM too) / text / binary are files with their type', !badSniff.length, badSniff.join('; ')]);
  const mm = [Pm.nameTypeMismatch('report.pdf', 'application/zip'), Pm.nameTypeMismatch('x.docx', 'application/zip'), Pm.nameTypeMismatch('x.png', 'text/html'), Pm.nameTypeMismatch('x.csv', 'text/plain'), Pm.nameTypeMismatch('x.PNG', 'image/png')];
  r.push(['the chip: .pdf holding a ZIP and .png holding HTML say so; .docx (a zip), .csv, .PNG do not', !!mm[0] && mm[0].ext === 'pdf' && mm[1] === null && !!mm[2] && mm[3] === null && mm[4] === null, JSON.stringify(mm)]);
  const files = (n, bytes = 10, kind = 'image') => Array.from({ length: n }, (_, i) => ({ name: `f${i}`, bytes, kind }));
  const GROW = { maxCount: 10, maxTotalBytes: 25e6, withText: true };
  const SPLIT = { images: { maxCount: 4, maxBytes: 10e6, withText: true }, files: { maxCount: 1, maxBytes: 30e6, withText: false } };
  const av = [
    [Pm.attachVerdict(null, files(1), { channel: 'Lark', why: 'not measured' }), 'attachments-not-offered', /Lark does not take attachments from an agent \(not measured\)/],
    [Pm.attachVerdict(GROW, files(11)), 'attachment-count', null], [Pm.attachVerdict(GROW, files(2, 13e6)), 'attachment-too-large', null], [Pm.attachVerdict(GROW, files(10, 2e6)), null, null],
    [Pm.attachVerdict(SPLIT, [...files(1), ...files(1, 10, 'file')]), 'attachment-shape', null], [Pm.attachVerdict(SPLIT, files(1, 10, 'file'), { hasText: true }), 'attachment-shape', /its own message/],
    [Pm.attachVerdict(SPLIT, files(5)), 'attachment-count', null], [Pm.attachVerdict(SPLIT, files(2, 11e6)), 'attachment-too-large', null], [Pm.attachVerdict(SPLIT, files(3), { hasText: true }), null, null], [Pm.attachVerdict(null, [], {}), null, null],
  ];
  const badAv = av.filter(([v, want, rx]) => (want ? v.ok || v.why !== want || (rx && !rx.test(v.error)) : !v.ok)).map(([v, want]) => `${want} ← ${JSON.stringify(v)}`);
  r.push(['attachVerdict: null row by name with its reason; one row (count / total); two rows (shape / text / count / per-file size); none ⇒ ok', !badAv.length, badAv.join('; ')]);
  const base = { id: 'p-1-1', adapterId: 'a', convId: 'c', text: 'same words', state: 'awaiting-approval' };
  const A1 = [{ n: 0, name: 'shot.png', bytes: 3, sha256: 'a'.repeat(64), mime: 'image/png', kind: 'image' }];
  const A2 = [{ ...A1[0], sha256: 'b'.repeat(64) }];
  const dSame = Pm.shownDigest({ ...base, attachments: A1 }), dOther = Pm.shownDigest({ ...base, attachments: A2 }), dName = Pm.shownDigest({ ...base, attachments: [{ ...A1[0], name: 'shot2.png' }] }), dNone = Pm.shownDigest({ ...base, attachments: [] });
  r.push(['THE DIGEST covers each file: the same text with other bytes (sha256) or another name is another digest', dSame !== dOther && dSame !== dName && dSame !== dNone, JSON.stringify([dSame, dOther, dName])]);
  r.push(['…and a proposal without stored files keeps the digest it had (names-only records too)', Pm.shownDigest({ ...base, attachments: [{ name: 'old.pdf', bytes: 9 }] }) === dNone, '']);
  // Q2 (owner 2026-10-02 21:55 PDT: NO) — the EXISTING switch and the channel's policy decide; no override
  const q2 = [];
  for (const guard of [true, false]) for (const mode of ['direct', 'review']) for (const authority of ['send', 'draft']) {
    const d = Pm.decideOutbound({ channelPolicy: { mode }, guards: { attachmentsReview: guard, linksReview: true, offHours: { enabled: false } }, proposal: { text: 'x', attachments: A1, authority } });
    const want = guard || mode === 'review' || authority === 'draft' ? 'review' : 'direct';
    if (d.mode !== want || d.reasons.includes('attachments') !== guard) q2.push(`${guard}/${mode}/${authority} → ${d.mode} ${d.reasons}`);
  }
  r.push(['Q2: the guard ON ⇒ the reason `attachments` on every row; OFF + direct + send ⇒ direct (no always-approve override)', !q2.length, q2.join('; ')]);
  const rc = Pm.receiptFor({ ...base, state: 'sent', result: { vendorMessageId: 'v1', sentAs: 'user' }, attachments: [{ ...A1[0], bytes: 1258291 }, { n: 1, name: 'r.pdf', bytes: 348160, sha256: 'c'.repeat(64), mime: 'application/pdf', kind: 'file' }] });
  const blk = Pm.renderReceiptBlock(rc, { adapterLabel: 'Mail', title: 'T' });
  r.push(['THE RECEIPT lists each file: name, size, sha256', /with 2 attachments: shot\.png 1\.2 MB sha256 aaaaaaaaaaaa, r\.pdf 340 KB sha256 cccccccccccc/.test(blk), blk]);
  return r.map(([n, p, d]) => [tag + n, p, d]);
}
for (const [n, p, d] of pureLegs(P)) ok(p, n, d);

// ═══ ② the engine ═══════════════════════════════════════════════════════════
console.log('② the engine: propose → approve → send, the bytes the person saw');
let clock = Date.UTC(2026, 9, 3, 12, 0, 0);
const now = () => clock;
const settings = { 'channels.guardAttachmentsReview': true };
function sendWorld(kind, { row = { maxCount: 10, maxTotalBytes: 25e6, withText: true }, why } = {}) {
  const W = { sent: [], composed: [] };
  const mod = {
    kind,
    caps: { ...fake.fakePoll.caps, ...(row ? { sendAttachments: row } : {}), ...(why ? { sendAttachmentsWhy: why } : {}), budget: undefined, pace: undefined },
    create(record, deps) {
      const inner = fake.fakePoll.create(record, { ...deps });
      return Object.assign(Object.create(inner), {
        async send(convId, o) { W.sent.push({ convId, text: o.text, attachments: (o.attachments || []).map((a) => ({ ...a })) }); return { ok: true, vendorMessageId: `v-${W.sent.length}`, at: Date.now(), sentAs: 'user' }; },
        async compose(o) { W.composed.push({ ...o }); return { ok: true, vendorMessageId: `c-${W.composed.length}`, threadId: `t-${W.composed.length}`, at: Date.now(), sentAs: 'user' }; },
      });
    },
  };
  return { W, mod };
}
function seed(dataDir, adapters) {
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: adapters.map(([id, kind]) => ({ id, kind, label: id === 'acc' ? 'Team mail' : id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: null })) }));
}
async function rig(name, { engineMod = ENG, routesPath = path.join(REPO, 'src/routes/channels.js') } = {}) {
  const S = sendWorld('att-send');
  const N = sendWorld('att-none', { row: null, why: 'not measured on this vendor' });
  const registry = CH.createChannelRegistry();
  registry.register(S.mod);
  registry.register(N.mod);
  const dataDir = path.join(ROOT, name);
  seed(dataDir, [['acc', 'att-send'], ['none', 'att-none']]);
  const eng = engineMod.create({ dataDir, registry, env: {}, now, broadcast: () => {}, serverSetting: (k) => settings[k], liveSessions: () => [], log: quiet });
  await eng.pass('acc', { force: true });
  await eng.pass('none', { force: true });
  const conv = (id) => Object.values(eng.store.index.live()).find((e) => e.adapterId === id && e.convCaps !== undefined) || null;
  const pick = (id) => { const keys = Object.keys(eng.store.index.live()).filter((k) => k.startsWith(id + '/')); return keys.length ? keys[0].slice(id.length + 1) : null; };
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  const rp = require.resolve(routesPath);
  delete require.cache[rp];
  const routes = require(rp);
  delete require.cache[rp];
  routes.setup({ getEngine: () => eng });
  app.use(routes.router);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const filesDir = path.join(eng.store.dir, OF.DIR);
  const onDisk = () => { try { return fs.readdirSync(filesDir).sort(); } catch { return []; } };
  return { S, N, eng, server, base, conv, pick, filesDir, onDisk, dataDir };
}
const att = (name, buf) => ({ name, data: b64(buf) });
const view = (eng, id) => eng.outboxView ? (eng.outboxView().proposals || []).find((p) => p.id === id) : null;
async function engineLegs(R, tag = '') {
  const r = [];
  const C = R.pick('acc');
  const pr = await R.eng.propose(null, 'acc', C, { text: 'the report', attachments: [att('shot.png', PNG), att('report.pdf', ZIP)] });
  const p = pr.ok ? pr.proposal : null;
  r.push(['propose: awaiting the person, reason `attachments` (the guard is on)', !!p && p.state === 'awaiting-approval' && p.policy.reasons.includes('attachments'), JSON.stringify(pr).slice(0, 300)]);
  if (!p) return r;
  const st = p.attachments || [];
  r.push(['the record keeps name, size, sha256, the SNIFFED type — never the bytes', st.length === 2 && st[0].sha256 === sha(PNG) && st[0].kind === 'image' && st[1].mime === 'application/zip' && st[1].bytes === ZIP.length && !JSON.stringify(st).includes(b64(PNG).slice(0, 40)), JSON.stringify(st)]);
  const ob = fs.readFileSync(path.join(R.eng.store.dir, 'outbox.json'), 'utf-8');
  r.push(['outbox.json holds no file bytes', !ob.includes(b64(PNG).slice(0, 40)), '']);
  const f0 = path.join(R.filesDir, p.id, '0');
  const mode = fs.existsSync(f0) ? (fs.statSync(f0).mode & 0o777) : null;
  r.push([`the files: outbox-files/<id>/<n>, 0600, the exact bytes (mode ${mode && mode.toString(8)})`, mode === 0o600 && fs.readFileSync(f0).equals(PNG) && fs.readFileSync(path.join(R.filesDir, p.id, '1')).equals(ZIP), '']);
  const v0 = view(R.eng, p.id) || p;
  const stale = P.shownDigest({ ...v0, attachments: [{ ...st[0], sha256: 'f'.repeat(64) }, st[1]] });
  const ch = await R.eng.approve(p.id, { shown: stale });
  r.push(['V2: an Approve from a card that showed other bytes ⇒ changed-since-shown, nothing sent', !ch.ok && ch.code === 'changed-since-shown' && R.S.W.sent.length === 0, JSON.stringify(ch).slice(0, 200)]);
  const okA = await R.eng.approve(p.id, { shown: P.shownDigest(v0) });
  const sent = R.S.W.sent[0];
  r.push(['approve → send: the adapter is handed the files, each buffer hashing to the approved sha256', okA.ok && R.S.W.sent.length === 1 && !!sent && sent.attachments.length === 2 && sha(sent.attachments[0].data) === st[0].sha256 && sent.attachments[1].data.equals(ZIP) && sent.attachments[0].name === 'shot.png' && sent.attachments[0].mime === 'image/png', JSON.stringify(okA).slice(0, 200)]);
  // V1: the file rewritten between the card and the send
  const pr2 = await R.eng.propose(null, 'acc', C, { text: 'take two', attachments: [att('shot.png', PNG)] });
  const p2 = pr2.proposal;
  fs.writeFileSync(path.join(R.filesDir, p2.id, '0'), Buffer.concat([PNG, Buffer.from('tampered')]));
  const before = R.S.W.sent.length;
  await R.eng.approve(p2.id, { shown: P.shownDigest(view(R.eng, p2.id) || p2) });
  const q2 = R.eng.store.outbox.snapshot().proposals[p2.id];
  r.push(['V1: a file rewritten after the card ⇒ failed `attachment-changed`, ZERO adapter calls', q2.state === 'failed' && q2.failure && q2.failure.code === 'attachment-changed' && R.S.W.sent.length === before && /not the file that was approved/.test(q2.reason || ''), JSON.stringify([q2.state, q2.reason])]);
  // refusals write nothing
  const disk0 = R.onDisk().join();
  const r11 = await R.eng.propose(null, 'acc', C, { text: 'many', attachments: Array.from({ length: 11 }, (_, i) => att(`f${i}.txt`, Buffer.from('x'))) });
  const rNo = await R.eng.propose(null, 'none', R.pick('none'), { text: 'pic', attachments: [att('shot.png', PNG)] });
  const rName = await R.eng.propose(null, 'acc', C, { text: 'name', attachments: [att('../../etc/passwd', PNG)] });
  r.push(['V6/V7: 11 files, a channel without the row (by name, with its reason), a path for a name ⇒ bad-proposal by name, NOTHING on disk', !r11.ok && r11.why === 'attachment-count' && !rNo.ok && rNo.why === 'attachments-not-offered' && /none does not take attachments from an agent \(not measured on this vendor\)/.test(rNo.error) && !rName.ok && rName.why === 'attachment-name' && R.onDisk().join() === disk0, JSON.stringify([r11.why, rNo.error, rName.why, R.onDisk()])]);
  // Q2 through the engine: the guard OFF + a direct account policy + the user's send authority ⇒ sent at once, the bytes verified
  await R.eng.setAccountPolicy('acc', 'direct');
  settings['channels.guardAttachmentsReview'] = false;
  const n0 = R.S.W.sent.length;
  const dr = await R.eng.propose(null, 'acc', C, { text: 'direct one', attachments: [att('a.png', PNG)] });
  settings['channels.guardAttachmentsReview'] = true;
  const gr = await R.eng.propose(null, 'acc', C, { text: 'guarded one', attachments: [att('a.png', PNG)] });
  await R.eng.setAccountPolicy('acc', 'review');
  r.push(['Q2: guard off + direct + send ⇒ sent with its bytes; guard on ⇒ awaiting (attachments) — the existing switch decides', dr.ok && dr.proposal.state === 'sent' && R.S.W.sent.length === n0 + 1 && !!(R.S.W.sent[n0] && R.S.W.sent[n0].attachments[0] && R.S.W.sent[n0].attachments[0].data.equals(PNG)) && gr.ok && gr.proposal.state === 'awaiting-approval' && gr.proposal.policy.reasons.join() === 'attachments', JSON.stringify([dr.proposal && dr.proposal.state, gr.proposal && gr.proposal.policy])]);
  // compose carries them too
  const cp = await R.eng.compose(null, 'acc', { to: 'a@example.com', subject: 'Files', text: 'here', attachments: [att('r.pdf', ZIP)] });
  if (cp.ok) await R.eng.approve(cp.proposal.id, { shown: P.shownDigest(view(R.eng, cp.proposal.id) || cp.proposal) });
  const cpd = R.S.W.composed[R.S.W.composed.length - 1];
  r.push(['compose: a new message carries the files the same way (approved, re-hashed, handed over)', cp.ok && !!cpd && !!(cpd.attachments && cpd.attachments[0] && cpd.attachments[0].data.equals(ZIP)), JSON.stringify(cp).slice(0, 200)]);
  return { legs: r, ids: { sent: p.id, failed: p2.id, guarded: gr.proposal && gr.proposal.id } };
}
const R1 = await rig('main');
const E1 = await engineLegs(R1);
for (const [n, p, d] of E1.legs) ok(p, n, d);

// ═══ ③ retention ═══════════════════════════════════════════════════════════
console.log('③ retention: an unsent end at once, a sent one after 7 days, orphans, stages, a pruned record');
async function retentionLegs(R, ids) {
  const r = [];
  const C = R.pick('acc');
  const pj = await R.eng.propose(null, 'acc', C, { text: 'to reject', attachments: [att('x.png', PNG)] });
  await R.eng.reject(pj.proposal.id, {});
  const qj = R.eng.store.outbox.snapshot().proposals[pj.proposal.id];
  r.push(['reject ⇒ the folder is gone at once; the record keeps name / size / sha256 and says when', !fs.existsSync(path.join(R.filesDir, pj.proposal.id)) && !!qj.attachmentsGoneAt && qj.attachments[0].sha256 === sha(PNG), JSON.stringify(qj.attachments)]);
  clock += 25 * 3600e3;
  await R.eng.expireSweep();
  const qe = ids.guarded ? R.eng.store.outbox.snapshot().proposals[ids.guarded] : null;
  r.push(['expire (24 h unapproved) ⇒ its folder is gone', !!qe && qe.state === 'expired' && !fs.existsSync(path.join(R.filesDir, ids.guarded)), JSON.stringify(qe && qe.state)]);
  fs.mkdirSync(path.join(R.filesDir, 'p-orphan-1'), { recursive: true });
  const stale = path.join(R.filesDir, '.stage-old');
  fs.mkdirSync(stale, { recursive: true });
  const old = new Date(clock - 2 * 3600e3); fs.utimesSync(stale, old, old);
  const kept = await R.eng.filesSweep();
  r.push(['the sweep at +1 day: the SENT proposal keeps its files; an orphan folder and a stale stage are removed', fs.existsSync(path.join(R.filesDir, ids.sent)) && !fs.existsSync(path.join(R.filesDir, 'p-orphan-1')) && !fs.existsSync(stale) && !kept.includes(ids.sent), JSON.stringify([kept, R.onDisk()])]);
  clock += 7 * 24 * 3600e3;
  const gone = await R.eng.filesSweep();
  const qs = R.eng.store.outbox.snapshot().proposals[ids.sent];
  r.push(['the sweep past 7 days: the sent and the failed proposals\' files are removed, the records keep the facts', gone.includes(ids.sent) && gone.includes(ids.failed) && !fs.existsSync(path.join(R.filesDir, ids.sent)) && !!qs.attachmentsGoneAt && qs.attachments.length === 2, JSON.stringify(gone)]);
  return r;
}
for (const [n, p, d] of await retentionLegs(R1, E1.ids)) ok(p, n, d);
{
  const dir = path.join(ROOT, 'prune');
  const st = STORE.createChannelStore({ dir, now: () => clock, log: quiet });
  const ids = [];
  await st.outbox.update((ob) => { for (let i = 0; i < STORE.OUTBOX_KEEP + 1; i++) { const id = st.outbox.nextId(); ids.push(id); ob.proposals[id] = { id, state: 'withdrawn', at: i, updatedAt: i, attachments: [] }; } });
  ok(!st.outbox.snapshot().proposals[ids[0]], 'FIXTURE: one past OUTBOX_KEEP is pruned');
  const id = st.outbox.nextId();
  fs.mkdirSync(path.join(st.dir, 'outbox-files', ids[1]), { recursive: true });
  await st.outbox.update((ob) => { ob.proposals[id] = { id, state: 'proposed', at: clock, updatedAt: clock }; });
  ok(!fs.existsSync(path.join(st.dir, 'outbox-files', ids[1])), 'a PRUNED record takes its folder with it');
  st.close();
}

// ═══ ④ the owner-only file route ═══════════════════════════════════════════
console.log('④ the owner\'s file route');
async function routeLegs(R) {
  const r = [];
  const C = R.pick('acc');
  const pr = await R.eng.propose(null, 'acc', C, { text: 'look', attachments: [att('shot.png', PNG), att('pretty.png', HTML)] });
  const id = pr.proposal.id;
  const g = async (n, q = '?inline=1') => { const res = await fetch(`${R.base}/api/channels/outbox/${id}/attachment/${n}${q}`); return { status: res.status, h: res.headers, buf: Buffer.from(await res.arrayBuffer()) }; };
  const a = await g(0), b = await g(1), c = await g(7);
  r.push(['a sniffed PNG is served inline as image/png with nosniff + a sandbox CSP + no-store', a.status === 200 && a.h.get('content-type') === 'image/png' && /^inline/.test(a.h.get('content-disposition')) && a.h.get('x-content-type-options') === 'nosniff' && /sandbox/.test(a.h.get('content-security-policy')) && a.h.get('cache-control') === 'no-store' && a.buf.equals(PNG), JSON.stringify([a.status, a.h.get('content-type'), a.h.get('content-disposition')])]);
  r.push(['V4: an HTML page NAMED .png is never inline — octet-stream, a download', b.status === 200 && b.h.get('content-type') === 'application/octet-stream' && /^attachment/.test(b.h.get('content-disposition')), JSON.stringify([b.h.get('content-type'), b.h.get('content-disposition')])]);
  r.push(['an index the proposal does not have ⇒ 404', c.status === 404, String(c.status)]);
  return r;
}
for (const [n, p, d] of await routeLegs(R1)) ok(p, n, d);

// ═══ ⑤ the registry row ═══════════════════════════════════════════════════
console.log('⑤ the registry: the row validated at registration; an undeclared row refuses attachments by name');
function registryLegs(CHm) {
  const r = [];
  const base = fake.fakePoll.caps;
  const tryCaps = (c) => { try { CHm.createChannelRegistry().validateCaps('x', c); return null; } catch (e) { return e.message; } };
  r.push(['the Gmail row, the split row, null and absent are accepted', tryCaps({ ...base, sendAttachments: GM.caps.sendAttachments }) === null && tryCaps({ ...base, sendAttachments: { images: { maxCount: 9, maxBytes: 1e7, withText: true }, files: { maxCount: 1, maxBytes: 3e7, withText: false } } }) === null && tryCaps({ ...base, sendAttachments: null, sendAttachmentsWhy: 'why' }) === null, '']);
  const bads = [{ ...base, sendAttachments: { maxCount: 0, maxTotalBytes: 1, withText: true } }, { ...base, sendAttachments: { maxCount: 1, maxTotalBytes: 1 } }, { ...base, sendAs: [], sendAttachments: { maxCount: 1, maxTotalBytes: 1, withText: true } }, { ...base, sendAttachments: { images: { maxCount: 1 } } }, { ...base, sendAttachmentsWhy: '' }];
  const missed = bads.map((c, i) => [i, tryCaps(c)]).filter(([, e]) => !e);
  r.push(['a malformed row, a row on a read-only adapter, an empty reason are refused at registration', !missed.length, JSON.stringify(missed)]);
  return r;
}
for (const [n, p, d] of registryLegs(CH)) ok(p, n, d);
{
  const reg = CH.createChannelRegistry();
  const { mod } = sendWorld('bare', { row: null });
  reg.register(mod);
  const ad = reg.create('bare', { id: 'bare', kind: 'bare' }, { now });
  let e1 = null, e2 = null;
  try { await ad.send('c', { text: 'x', attachments: [{ name: 'a', data: PNG }] }); } catch (e) { e1 = e; }
  try { await ad.compose({ to: ['a@x.com'], text: 'x', attachments: [{ name: 'a', data: PNG }] }); } catch (e) { e2 = e; }
  ok(e1 && e1.code === 'not-supported' && e2 && e2.code === 'not-supported', 'an adapter without the row handed attachments: send and compose throw not-supported (the module never runs)', JSON.stringify([e1 && e1.message, e2 && e2.message]));
  ok(GM.caps.sendAttachments && GM.caps.sendAttachments.maxCount === 10 && require(path.join(REPO, 'src/channels/lark.js')).caps.sendAttachments === null && /not yet measured/.test(require(path.join(REPO, 'src/channels/lark.js')).caps.sendAttachmentsWhy) && !require(path.join(REPO, 'src/channels/agents.js')).caps.sendAttachments, 'the rows: Gmail 10 files / 25 MB with text; Lark null WITH its reason (LA1–LA4 unmeasured); the Agents adapter none');
}

// ═══ ⑥ Gmail ═══════════════════════════════════════════════════════════════
console.log('⑥ Gmail: one multipart/mixed message, parsed back');
function gmailLegs(build) {
  const r = [];
  const longName = '季度报告'.repeat(30) + '.pdf';
  const evil = 'x"; name=evil.exe\r\nBcc: spy@evil.example\r\n.png';
  const files = [{ name: 'shot.png', mime: 'image/png', sha256: sha(PNG), data: PNG }, { name: longName, mime: 'application/zip', sha256: sha(ZIP), data: ZIP }, { name: evil, mime: 'text/html\r\nX-Evil: 1', sha256: 'zz', data: HTML }];
  const mime = build({ from: 'me@x.com', to: 'you@x.com', subject: 'S', text: 'hello 世界', attachments: files });
  const lines = mime.split('\r\n');
  const ct = /^Content-Type: multipart\/mixed; boundary="([^"]+)"$/m.exec(mime);
  r.push(['multipart/mixed with a quoted boundary', !!ct, mime.slice(0, 300)]);
  if (!ct) return r;
  const bd = ct[1];
  const parts = mime.split(`\r\n--${bd}`).slice(1).filter((x) => !x.startsWith('--'));
  const parsed = parts.map((x) => { const [h, ...rest] = x.replace(/^\r\n/, '').split('\r\n\r\n'); return { h: h.replace(/\r\n /g, ' '), body: rest.join('\r\n\r\n') }; });
  r.push(['four parts: the text, then one per file', parsed.length === 4 && /text\/plain/.test(parsed[0].h) && Buffer.from(parsed[0].body, 'base64').toString('utf-8') === 'hello 世界', JSON.stringify(parsed.map((x) => x.h))]);
  const dec = (i) => Buffer.from(parsed[i].body.replace(/\r\n/g, ''), 'base64');
  r.push(['each file decodes to its exact bytes; base64 lines ≤ 76', dec(1).equals(PNG) && dec(2).equals(ZIP) && dec(3).equals(HTML) && parsed.slice(1).every((x) => x.body.split('\r\n').every((l) => l.length <= 76)), '']);
  const star = (h) => { const pieces = [...h.matchAll(/filename\*(\d+)?\*?=(?:UTF-8'')?([^;\s]+)/g)].map((m) => m[2]); return decodeURIComponent(pieces.join('')); };
  r.push(['RFC 2231: the long CJK name continues in pieces and reads back whole; the type is the sniffed one', star(parsed[2].h) === longName && /Content-Type: application\/zip; name=/.test(parsed[2].h) && /filename\*0\*=UTF-8''/.test(parsed[2].h), parsed[2].h.slice(0, 200)]);
  r.push(['V3: a name with CR/LF + "Bcc:" and a type with CR/LF are INERT — no Bcc / X-Evil header line, the type falls back to octet-stream', !lines.some((l) => /^(Bcc|X-Evil):/i.test(l)) && /Content-Type: application\/octet-stream; name="x_; name=evil.exe Bcc: spy@evil.example .png"/.test(parsed[3].h), parsed[3].h]);
  r.push(['no line passes RFC 5322\'s 998', lines.every((l) => l.length <= 998), String(Math.max(...lines.map((l) => l.length)))]);
  r.push(['without files the message is text/plain as before', /Content-Type: text\/plain; charset="UTF-8"/.test(build({ to: 'a@x.com', text: 'x' })) && !/multipart/.test(build({ to: 'a@x.com', text: 'x', attachments: [] })), '']);
  return r;
}
for (const [n, p, d] of gmailLegs(GM.buildMime)) ok(p, n, d);
{
  const small = GM.rawRequest('/drafts', 'abc', { draft: true, threadId: 't1' });
  const plain = GM.rawRequest('/messages/send', 'abc');
  const bigRaw = Buffer.alloc(GM.JSON_RAW_MAX).toString('base64url');
  const big = GM.rawRequest('/drafts', bigRaw, { draft: true, threadId: 't1' });
  const bigSend = GM.rawRequest('/messages/send', bigRaw);
  const body = big[1].raw ? big[1].raw.body.toString('latin1') : '';
  ok(small[0] === '/drafts' && small[1].json.message.raw === 'abc' && small[1].json.message.threadId === 't1' && plain[0] === '/messages/send' && plain[1].json.raw === 'abc' && !plain[1].json.message, 'a message under JSON_RAW_MAX keeps the JSON form: a draft {message: {threadId, raw}}, a send {raw} (as before)', JSON.stringify([small, plain]));
  ok(bigSend[0] === '/messages/send?uploadType=multipart' && bigSend[1].raw.body.toString('latin1').includes('\r\n\r\n{}\r\n'), 'a new message past it uploads with empty metadata');
  ok(big[0] === '/drafts?uploadType=multipart' && big[1].upload === true && /^multipart\/related; boundary=/.test(big[1].raw.type) && body.includes('{"message":{"threadId":"t1"}}') && body.includes('Content-Type: message/rfc822') && big[1].raw.body.length > Buffer.from(bigRaw, 'base64url').length, 'past it: the upload form — JSON metadata (the thread) + the message/rfc822 bytes, on the upload path');
  ok(GM.unitsFor('/drafts?uploadType=multipart', 'POST') === 10 && GM.unitsFor('/messages/send?uploadType=multipart', 'POST') === 100 && GM.UPLOAD_API.startsWith('https://gmail.googleapis.com/') && GM.EGRESS.includes('gmail.googleapis.com'), 'the upload form is metered like the JSON one and goes to a declared host');
}

// ═══ ⑦ the CLI ═════════════════════════════════════════════════════════════
console.log('⑦ the CLI: --attach reads here, checks first, sends the bytes');
async function cliLegs(cliPath) {
  const r = [];
  const seen = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { seen.push({ url: req.url, body: b ? JSON.parse(b) : null }); const body = seen[seen.length - 1].body || {}; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, proposal: { id: 'p-1-1', state: 'awaiting-approval', policy: { reasons: ['attachments'] }, attachments: (body.attachments || []).map((a, n) => ({ n, name: a.name, bytes: Buffer.from(a.data, 'base64').length, sha256: sha(Buffer.from(a.data, 'base64')), mime: 'image/png' })) } })); }); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const env = { PATH: process.env.PATH, HOME: ROOT, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vst_x' };
  const run = (args) => new Promise((resolve) => { const ch = spawn(process.execPath, [cliPath, ...args], { env }); let out = '', err = ''; ch.stdout.on('data', (d) => { out += d; }); ch.stderr.on('data', (d) => { err += d; }); ch.on('close', (code) => resolve({ code, out, err })); });
  const dir = path.join(ROOT, 'cli');
  fs.mkdirSync(path.join(dir, 'folder'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'shot.png'), PNG);
  fs.writeFileSync(path.join(dir, 'empty.txt'), '');
  const huge = path.join(dir, 'huge.bin');
  fs.writeFileSync(huge, ''); fs.truncateSync(huge, 26e6);   // sparse: 26 MB that cost nothing to "have"
  const d = await run(['reply', 'acc/c1', 'hi', '--attach', path.join(dir, 'folder')]);
  const e = await run(['reply', 'acc/c1', 'hi', '--attach', path.join(dir, 'empty.txt')]);
  const h = await run(['reply', 'acc/c1', 'hi', '--attach', huge]);
  const many = await run(['reply', 'acc/c1', 'hi', ...Array.from({ length: 11 }, () => ['--attach', path.join(dir, 'shot.png')]).flat()]);
  r.push(['a directory, an empty file, 26 MB together, 11 files ⇒ refused before any request (exit 1, said)', [d, e, h, many].every((x) => x.code === 1) && /is a directory/.test(d.err) && /has no bytes/.test(e.err) && /26\.0 MB together/.test(h.err) && /at most 10 attachments/.test(many.err) && seen.length === 0, JSON.stringify([d.err, e.err, h.err, many.err, seen.length])]);
  const g = await run(['reply', 'acc/c1', 'hi there', '--attach', path.join(dir, 'shot.png'), '--why', 'asked']);
  const sb = seen[0] && seen[0].body;
  r.push(['a file: the request carries {name: its basename, data: base64 of its bytes}; the answer\'s list is printed', g.code === 0 && sb && sb.text === 'hi there' && sb.attachments.length === 1 && sb.attachments[0].name === 'shot.png' && Buffer.from(sb.attachments[0].data, 'base64').equals(PNG) && /with 1 attachment: shot\.png \(image\/png, \d+ bytes, sha256 [0-9a-f]{12}\)/.test(g.out), JSON.stringify([g.code, g.out, g.err])]);
  const u = await run(['reply', 'acc/c1', '--attach']);
  r.push(['usage names --attach', u.code === 1 && /--attach <path>/.test(u.err), u.err]);
  srv.close();
  return r;
}
for (const [n, p, d] of await cliLegs(path.join(REPO, 'data/bin/vibespace-channels'))) ok(p, n, d);

// ═══ ⑧ censuses ════════════════════════════════════════════════════════════
console.log('⑧ censuses: no agent route serves an outbox file; the server opens no path an agent names');
{
  const AR = SRC('src/agent-routes.js');
  ok(!/outboxAttachment|outbox-files|outbox\/:id\/attachment/.test(AR), 'V8: src/agent-routes.js reaches no outbox file (only the owner route in src/routes/channels.js does)');
  const OFS = SRC('src/channel-outbox-files.js');
  const fsCalls = [...OFS.matchAll(/fs(?:\.promises)?\.(\w+)\(([^)]*)\)/g)].map((m) => [m[1], m[2]]);
  const named = fsCalls.filter(([, arg]) => /name/i.test(arg));
  ok(fsCalls.length >= 8 && !named.length, `V10: every fs call in src/channel-outbox-files.js takes a path built from the proposal id + index (${fsCalls.length} calls, none from a name)`, JSON.stringify(named));
  const ENGS = SRC('src/server/channels-engine.js');
  const near = ENGS.split('\n').filter((l) => /attachments/.test(l) && /fs\.(read|open|stat|createReadStream)/.test(l));
  ok(!near.length, 'V10: the engine opens no file on an attachment line (bytes come IN the proposal; files go through OF)', near.join('\n'));
}

// ═══ ⑨ patched-copy controls ═══════════════════════════════════════════════
console.log('⑨ controls: each rule removed in a copy turns its leg red');
const POL = SRC('src/channel-policy.js');
function polCopy(tag, from, to) { if (!POL.includes(from)) throw new Error(`control ${tag}: anchor missing`); return M.load('src/channel-policy.js', POL.replace(from, to), tag); }
const legRed = (rows, rx) => rows.filter(([n]) => rx.test(n)).some(([, p]) => !p);
ok(legRed(pureLegs(polCopy('no-count', 'if (v.length > ATTACH_MAX_COUNT)', 'if (false)'), 'C '), /eleven files/), 'control: without the count bound eleven files pass');
ok(legRed(pureLegs(polCopy('no-sep', "if (/[/\\\\]/.test(name) || name === '.' || name === '..')", 'if (false)'), 'C '), /a path ⇒/), 'control: without the separator rule `../x` is a name');
ok(legRed(pureLegs(polCopy('no-hidden', 'const hid = hiddenCharsOf(name, { joiners: true });', 'const hid = [];'), 'C '), /RTL override/), 'control: without the hidden-character rule an RTL override passes');
ok(legRed(pureLegs(polCopy('no-digest', '...(storedAttachments(q).length ? [storedAttachments(q).map', '...(false ? [storedAttachments(q).map'), 'C '), /THE DIGEST/), 'control: a digest without the files approves other bytes');
const ENGSRC = SRC('src/server/channels-engine.js');
function engCopy(tag, from, to) { if (!ENGSRC.includes(from)) throw new Error(`control ${tag}: anchor missing`); return M.load('src/server/channels-engine.js', ENGSRC.replace(from, to), tag); }
{
  const Rv = await rig('ctl-noverify', { engineMod: engCopy('no-verify', 'const fv = !targetWhy && stored.length ? await OF.verify(store.dir, p.id, stored) : null;', 'const fv = null;') });
  const legs = (await engineLegs(Rv, 'C ')).legs;
  ok(legRed(legs, /V1:/), 'control: an engine that does not re-hash at the send sends a rewritten file (V1 red)');
  Rv.server.close();
  const Rr = await rig('ctl-noremove', { engineMod: engCopy('no-remove', "if (verdict.ok && OF.UNSENT_ENDS.includes(to)) { try { OF.remove(store.dir, id); }", 'if (false) { try { OF.remove(store.dir, id); }') });
  const E = await engineLegs(Rr, 'C ');
  ok(legRed(await retentionLegs(Rr, E.ids), /reject ⇒/), 'control: an engine whose transitions keep the files leaves a rejected proposal\'s folder');
  Rr.server.close();
  const Rs = await rig('ctl-stage-refused', { engineMod: engCopy('stage-refused', "    if (!att.ok) return att.answer;\n", "    if (!att.ok) { OF.stage(store.dir, OF.prepare(v.proposal.attachments)); return att.answer; }\n") });
  const Es = (await engineLegs(Rs, 'C ')).legs;
  ok(legRed(Es, /NOTHING on disk/), 'control: an engine that writes the files of a REFUSED proposal is caught by the refusal leg (nothing on disk)');
  Rs.server.close();
}
{
  const RSRC = SRC('src/routes/channels.js');
  const from = "    const raster = INLINE_IMAGE.has(mime);\n    const inline = raster && String(req.query.inline || '') === '1';\n    const name = String(r.meta.name";
  if (!RSRC.includes(from)) throw new Error('route control anchor');
  const rp = M.write('src/routes/channels.js', RSRC.replace(from, "    const raster = true;\n    const inline = raster && String(req.query.inline || '') === '1';\n    const name = String(r.meta.name"), 'inline-all');
  const Rx = await rig('ctl-inline', { routesPath: rp });
  ok(legRed(await routeLegs(Rx), /V4:/), 'control: a route that trusts any type draws an HTML page named .png inline');
  Rx.server.close();
}
{
  const GSRC = SRC('src/channels/gmail.js');
  const from = ".replace(/\\p{Cc}+/gu, ' ')";
  if (!GSRC.includes(from)) throw new Error('gmail control anchor');
  const G2 = M.load('src/channels/gmail.js', GSRC.replace(from, '').replace("/^[a-z0-9][a-z0-9.+-]*\\/[a-z0-9][a-z0-9.+-]*$/.test(String(f.mime || ''))", 'true'), 'crlf');
  ok(legRed(gmailLegs(G2.buildMime), /V3:/), 'control: a MIME builder that keeps CR/LF in a name or a type lets a Bcc header through');
  const CSRC = SRC('src/channels/index.js');
  const cf = 'if (Array.isArray(o.attachments) && o.attachments.length && !caps.sendAttachments) throw';
  if (!CSRC.includes(cf)) throw new Error('registry control anchor');
  const CH2 = M.load('src/channels/index.js', CSRC.replace(cf, 'if (false) throw'), 'no-row-check');
  const reg = CH2.createChannelRegistry();
  reg.register(sendWorld('bare2', { row: null }).mod);
  let threw = false;
  try { await reg.create('bare2', { id: 'bare2', kind: 'bare2' }, { now }).send('c', { text: 'x', attachments: [{ name: 'a', data: PNG }] }); } catch { threw = true; }
  ok(!threw, 'control: a registry without the row check hands an undeclared adapter the files');
}
// ═══ ⑩ verify r1 ═══════════════════════════════════════════════════════════
console.log('⑩ verify r1: the owner\'s edit, the card\'s bytes, agent tokens, the held bound, broken names, the CLI\'s read, the V10 census');
const PNG2 = fake.fixturePng('innocent-2');
const LONE = `a${String.fromCharCode(0xd800)}.png`;
function r1PureLegs(Pm, tag = '') {
  const r = [];
  const v = Pm.validateProposal({ text: 'x', attachments: [{ name: LONE, data: b64('x') }] });
  r.push(['C10: a name with a lone surrogate ⇒ attachment-name (Gmail\'s RFC 2231 name and the download header cannot encode it)', !v.ok && v.why === 'attachment-name', JSON.stringify(v).slice(0, 160)]);
  const mine = (id, state, bytes, by = { kind: 'agent', id: 'a1' }, extra = {}) => ({ id, state, draftedBy: by, attachments: [{ n: 0, name: 'f', bytes, sha256: 'a'.repeat(64) }], ...extra });
  const ob = { p1: mine('p1', 'awaiting-approval', 60e6), p2: mine('p2', 'sent', 90e6), p3: mine('p3', 'awaiting-approval', 90e6, { kind: 'agent', id: 'a2' }), p4: mine('p4', 'rejected', 90e6), p5: mine('p5', 'unknown', 30e6, undefined, { attachmentsGoneAt: 1 }) };
  const H = (list, by = { kind: 'agent', id: 'a1' }) => (Pm.attachHeldVerdict ? Pm.attachHeldVerdict(ob, by, list) : { ok: true });
  const hOk = H([{ bytes: 40e6 }]), hNo = H([{ bytes: 41e6 }]), hOther = H([{ bytes: 10e6 }], { kind: 'agent', id: 'a2' }), hUser = H([{ bytes: 25e6 }], { kind: 'user', id: null });
  r.push(['C4: ONE drafter\'s undecided proposals hold at most 100 MB (60 + 40 ok, 60 + 41 ⇒ attachments-held); sent / rejected / files-gone ones and other drafters do not count', hOk.ok && !hNo.ok && hNo.why === 'attachments-held' && /withdraw/.test(hNo.error || '') && hOther.ok && hUser.ok, JSON.stringify([hOk, hNo.why, hOther, hUser])]);
  return r.map(([n, p, d]) => [tag + n, p, d]);
}
for (const [n, p, d] of r1PureLegs(P)) ok(p, n, d);
async function r1EngineLegs(R, tag = '', { held = true } = {}) {
  const r = [];
  const C = R.pick('acc');
  const AG = { kind: 'agent', id: 'r1-agent', name: 'Worker', groups: [], msgLevelFor: () => 'none' };
  await R.eng.setReach('acc', C, { principal: { kind: 'agent', id: 'r1-agent', name: 'Worker' }, level: 'visible' });
  const p = (await R.eng.propose(AG, 'acc', C, { text: 'see attached', attachments: [att('shot.png', PNG)] })).proposal;
  const n0 = R.S.W.sent.length;
  const a = await R.eng.approve(p.id, { text: 'see the attached picture', shown: P.shownDigest(view(R.eng, p.id) || p) });
  const s0 = R.S.W.sent[n0];
  r.push(['C1: the owner EDITS the text of a proposal carrying a file and approves ⇒ sent with the edited text and the approved bytes', a.ok && !!s0 && /attached picture/.test(s0.text) && sha(s0.attachments[0].data) === sha(PNG), JSON.stringify(a).slice(0, 200)]);
  const q = (await R.eng.propose(AG, 'acc', C, { text: 'chart', attachments: [att('chart.png', PNG)] })).proposal;
  const get = async (h = {}) => { const res = await fetch(`${R.base}/api/channels/outbox/${q.id}/attachment/0?inline=1`, { headers: h }); return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) }; };
  const g0 = await get();
  fs.writeFileSync(path.join(R.filesDir, q.id, '0'), PNG2);
  const g1 = await get();
  fs.writeFileSync(path.join(R.filesDir, q.id, '0'), PNG);
  const b1 = await get({ Authorization: 'Bearer vsst_x' }), b2 = await get({ Authorization: 'Bearer jbt_x' });
  r.push(['C2: the card\'s route serves the approved bytes; a file rewritten on disk ⇒ 409 attachment-changed, none of its bytes served', g0.status === 200 && g0.buf.equals(PNG) && g1.status === 409 && !g1.buf.equals(PNG2) && /attachment-changed/.test(g1.buf.toString()), JSON.stringify([g0.status, g1.status, g1.buf.length])]);
  r.push(['C3: an agent\'s (vsst_) or a job\'s (jbt_) bearer ⇒ 403 agent_forbidden (sign-in off has no cookie gate)', b1.status === 403 && b2.status === 403 && /agent_forbidden/.test(b1.buf.toString()), JSON.stringify([b1.status, b2.status])]);
  await R.eng.withdrawProposal({ proposalId: q.id, by: AG });
  if (!held) return r.map(([n, pp, d]) => [tag + n, pp, d]);   // the held bound's control is PURE (r1PureLegs)
  const big = Buffer.alloc(24e6, 7);
  const d0 = R.onDisk().length;
  const got = [];
  for (let i = 0; i < 5; i++) got.push(await R.eng.propose(AG, 'acc', C, { text: `big ${i}`, attachments: [att(`b${i}.bin`, big)] }));
  r.push(['C4: four 24 MB proposals wait; the fifth ⇒ attachments-held by name, nothing on disk for it', got.slice(0, 4).every((x) => x.ok) && !got[4].ok && got[4].why === 'attachments-held' && R.onDisk().length === d0 + 4, JSON.stringify(got.map((x) => x.ok || x.why))]);
  for (const x of got) if (x.ok) await R.eng.withdrawProposal({ proposalId: x.proposal.id, by: AG });
  const again = await R.eng.propose(AG, 'acc', C, { text: 'after withdraw', attachments: [att('b.bin', big)] });
  r.push(['C4: …a withdrawn proposal frees its room at once', again.ok, JSON.stringify(again).slice(0, 160)]);
  if (again.ok) await R.eng.withdrawProposal({ proposalId: again.proposal.id, by: AG });
  return r.map(([n, pp, d]) => [tag + n, pp, d]);
}
for (const [n, p, d] of await r1EngineLegs(R1)) ok(p, n, d);
// D4: the CLI reads what it looked at — a preload swaps the file for a FIFO right after the CLI's first look (stat or open)
async function r1CliLeg(cliPath, tag = '') {
  const dir = path.join(ROOT, `race-${tag ? 'c' : 'h'}`);
  fs.mkdirSync(dir, { recursive: true });
  const victim = path.join(dir, 'report.txt');
  fs.writeFileSync(victim, 'quarterly numbers\n');
  const pre = path.join(dir, 'race.cjs');
  fs.writeFileSync(pre, `const fs = require('fs'); const cp = require('child_process'); const T = ${JSON.stringify(victim)}; let done = false;
for (const k of ['statSync', 'lstatSync', 'openSync']) { const o = fs[k]; fs[k] = function (p, ...a) { const r = o.call(this, p, ...a); if (!done && String(p) === T) { done = true; fs.renameSync(T, T + '.moved'); cp.spawnSync('mkfifo', [T]); } return r; }; }
`);
  const res = await new Promise((resolve) => {
    const ch = spawn(process.execPath, ['-r', pre, cliPath, 'reply', 'acc/c1', 'hi', '--attach', victim], { env: { PATH: process.env.PATH, HOME: dir, VIBESPACE_API: 'http://127.0.0.1:9', VIBESPACE_SESSION_TOKEN: 'vsst_x' } });
    let err = '';
    const t = setTimeout(() => ch.kill('SIGKILL'), 2000);
    ch.stderr.on('data', (x) => { err += x; });
    ch.on('close', (code, sig) => { clearTimeout(t); resolve({ code, sig, err }); });
  });
  return [[`${tag}D4: a FIFO swapped in between the CLI's look and its read never hangs it (it reads the file it looked at)`, res.sig !== 'SIGKILL' && /server unreachable/.test(res.err), JSON.stringify(res).slice(0, 200)]];
}
for (const [n, p, d] of await r1CliLeg(path.join(REPO, 'data/bin/vibespace-channels'))) ok(p, n, d);
// V10, pinned three ways: the outbox-files module's every fs path, the agent's two doors, the engine's attachment functions
const fsFirstArgs = (src) => [...src.matchAll(/\bfs(?:\.promises)?\.(\w+)\(/g)].map((m) => { let i = m.index + m[0].length, d = 0, s = ''; for (; i < src.length; i++) { const ch = src[i]; if ((ch === ',' || ch === ')') && d === 0) break; if ('([{'.includes(ch)) d++; if (')]}'.includes(ch)) d--; s += ch; } return `${m[1]}(${s.trim()})`; });
const OF_PATHS = ['rmSync(dir)', 'mkdirSync(filesRoot(root))', "mkdtempSync(path.join(filesRoot(root), '.stage-'))", 'writeFileSync(path.join(dir, String(f.n)))', 'renameSync(dir)', 'statSync(f)', 'readFile(f)', 'existsSync(dir)', 'readdirSync(filesRoot(root))', 'statSync(full)'];
const ofOdd = (src) => fsFirstArgs(src).filter((x) => !OF_PATHS.includes(x));
const doorOf = (src, route) => { const a = src.indexOf(`app.post('${route}'`); if (a < 0) return null; const b = src.indexOf('\napp.', a + 10); return src.slice(a, b < 0 ? undefined : b); };
const doorsReading = (src) => ['/api/agent/channels/reply', '/api/agent/channels/compose'].filter((r) => { const d = doorOf(src, r); return d === null || /\bfs\.|readFile|createReadStream|openSync|require\('fs'\)/.test(d); });
const engReading = (src) => ['attachPrepare', 'outboxAttachment', 'filesSweep'].filter((n) => { const a = src.indexOf(`function ${n}(`); if (a < 0) return true; return /\bfs\.|readFile|createReadStream/.test(src.slice(a, src.indexOf('\n  }\n', a))); });
{
  const OFS = SRC('src/channel-outbox-files.js'), ARS = SRC('src/agent-routes.js'), ENS = SRC('src/server/channels-engine.js');
  ok(!ofOdd(OFS).length && fsFirstArgs(OFS).length >= 10, 'V10: every fs call in src/channel-outbox-files.js takes a PINNED path (the channels dir + the proposal id + the index) — a new one is red until reviewed', JSON.stringify(ofOdd(OFS)));
  ok(!doorsReading(ARS).length, 'V10: the agent\'s reply / compose doors read no file — the bytes come IN the body', JSON.stringify(doorsReading(ARS)));
  ok(!engReading(ENS).length, 'V10: the engine\'s attachPrepare / outboxAttachment / filesSweep touch the disk only through src/channel-outbox-files.js', JSON.stringify(engReading(ENS)));
  const anchor = (src, from, tag) => { if (!src.includes(from)) throw new Error(`r1 control ${tag}: anchor missing`); return src.replace(from, (m) => m); };
  anchor(OFS, "const data = Buffer.from(String(a.data), 'base64');", 'of');
  ok(ofOdd(OFS.replace("const data = Buffer.from(String(a.data), 'base64');", "const data = a.path ? fs.readFileSync(String(a.path)) : Buffer.from(String(a.data), 'base64');")).length === 1, 'control: an outbox-files module that reads a path the proposal names is red');
  const rd = "app.post('/api/agent/channels/reply', async (req, res) => {\n";
  anchor(ARS, rd, 'door');
  ok(doorsReading(ARS.replace(rd, `${rd}  const peek = require('fs').readFileSync(String((req.body || {}).path));\n`)).includes('/api/agent/channels/reply'), 'control: a reply door that opens a path from the body is red');
  const ap = '  function attachPrepare(rec, proposal, ctx = null) {\n';
  anchor(ENS, ap, 'eng');
  ok(engReading(ENS.replace(ap, `${ap}    const extra = fs.readFileSync(String(proposal.path));\n`)).includes('attachPrepare'), 'control: an attachPrepare that opens a named path is red');
}
// controls: each r1 rule removed in a copy turns its leg red
ok(legRed(r1PureLegs(polCopy('no-surrogate', "  if (/\\p{Cs}/u.test(name)) return no(", '  if (false) return no('), 'C '), /C10:/), 'control: without the surrogate rule a lone surrogate is a name');
ok(legRed(r1PureLegs(polCopy('no-held', '  if (held + adding <= ATTACH_HELD_MAX) return { ok: true, held };', '  return { ok: true, held };'), 'C '), /C4:/), 'control: without the held bound a drafter holds any amount');
{
  const R2 = await rig('ctl-r1-edit', { engineMod: engCopy('r1-edit', '      const v = P.validateProposal({ ...p0, text, attachments: undefined });', '      const v = P.validateProposal({ ...p0, text });') });
  ok(legRed(await r1EngineLegs(R2, 'C ', { held: false }), /C1:/), 'control: an approve that re-validates the STORED files refuses the owner\'s edit (C1 red)');
  R2.server.close();
  const R3 = await rig('ctl-r1-card', { engineMod: engCopy('r1-card', '    const v = await OF.verify(store.dir, p.id, [m]);\n', "    const v = { ok: true, files: [{ data: require('fs').readFileSync(file) }] };\n") });
  ok(legRed(await r1EngineLegs(R3, 'C ', { held: false }), /C2:/), 'control: a card route that serves the file without re-hashing it draws a rewritten file (C2 red)');
  R3.server.close();
  const RSRC2 = SRC('src/routes/channels.js');
  const bf = "    if (isAgentBearer(req)) return res.status(403).json({ error: 'the user\\'s view — not an agent route', code: 'agent_forbidden' });\n    forHost(req);\n    const r = await engine().outboxAttachment(";
  if (!RSRC2.includes(bf)) throw new Error('r1 bearer control anchor');
  const R4 = await rig('ctl-r1-bearer', { routesPath: M.write('src/routes/channels.js', RSRC2.replace(bf, '    forHost(req);\n    const r = await engine().outboxAttachment('), 'r1-bearer') });
  ok(legRed(await r1EngineLegs(R4, 'C ', { held: false }), /C3:/), 'control: a file route without the bearer refusal serves an agent token (C3 red)');
  R4.server.close();
  const CLISRC = SRC('data/bin/vibespace-channels');
  const cf = '    const data = Buffer.alloc(size);\n    let got = 0;\n    while (got < size) { const n = fs.readSync(fd, data, got, size - got, got); if (!n) break; got += n; }\n';
  if (!CLISRC.includes(cf)) throw new Error('r1 CLI control anchor');
  ok(legRed(await r1CliLeg(M.write('data/bin/vibespace-channels', CLISRC.replace(cf, '    const data = fs.readFileSync(p);\n    const got = data.length;\n'), 'r1-cli-path'), 'C '), /D4:/), 'control: a CLI that reads the PATH after looking hangs on a FIFO swapped in (D4 red)');
}
R1.server.close();
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);

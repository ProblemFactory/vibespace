#!/usr/bin/env node
// lane owner-composer-attach (owner 2026-10-09: "我能操作的那个聊天框不能上传文件"): THE OWNER'S COMPOSER CARRIES FILES.
//  ① PURE `composeFilesVerdict` (src/channel-policy.js) — every chip judged BEFORE the send over the adapter's
//     `sendAttachments` row + the account's `send-attachment` offer: a limit refused at its chip by name, a file the
//     account cannot carry `blocked` (never looks attached), only `ok` chips ride the send
//  ② the route: POST /api/channels/:adapterId/:convId/send passes the files to the engine's direct send; an agent's
//     bearer is refused 403 agent-forbidden (an agent drafts through /api/agent/channels/*)
//  ③ the window wires it: the paperclip / drop / paste, the chips, the files on the send, the receipt (source pins)
//  ④ patched-copy controls: a file past maxBytes accepted · a not-sendable file shown attached · the agent's bearer accepted
// The engine half (the store, the adapter path, partly sent + For-you, attachment-changed) is test-channel-send-files ⑨.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { fails++; console.log(`  ✗ ${m}`); } };
const MC = mutantCopies('compose-files', REPO);

const ROW = { maxCount: 10, maxTotalBytes: 25e6, withText: true };   // Gmail / Slack / Lark declare this one row
const GROUPS = { images: { maxCount: 1, maxBytes: 10e6, withText: false }, files: { maxCount: 2, maxBytes: 30e6, withText: true } };
const OFFERED = { offered: true, why: null };
const NOT_SENDABLE = { offered: false, why: 'attachments-not-sendable', requiredScopes: ['im:resource', 'im:resource:upload'] };
const f = (name, bytes, kind = 'file') => ({ name, bytes, kind });

function pureJudge(P) {
  const out = [];
  const st = (v) => v.chips.map((c) => c.state[0]).join('');
  const a = P.composeFilesVerdict(ROW, OFFERED, [f('a.png', 2e6, 'image'), f('b.pdf', 3e6)], { hasText: true });
  if (!(st(a) === 'oo' && a.send.join() === '0,1' && !a.blocked && !a.shape)) out.push(`two files within the row are not both sent (${st(a)})`);
  const big = P.composeFilesVerdict(ROW, OFFERED, [f('a.pdf', 20e6), f('huge.mov', 6e6), f('c.txt', 1e3)]);
  const bc = big.chips[1];
  if (!(st(big) === 'oro' && bc.why === 'attachment-too-large' && bc.limit === 25e6 && big.send.join() === '0,2')) out.push(`a file past the row's total is not refused at ITS chip by name (${st(big)} ${JSON.stringify(bc)})`);
  const many = P.composeFilesVerdict(ROW, OFFERED, Array.from({ length: 11 }, (_, i) => f(`f${i}.txt`, 10)));
  if (!(many.send.length === 10 && many.chips[10].state === 'refused' && many.chips[10].why === 'attachment-count' && many.chips[10].limit === 10)) out.push('the 11th file is not refused attachment-count');
  const g = P.composeFilesVerdict(GROUPS, OFFERED, [f('p.png', 11e6, 'image'), f('q.png', 1e6, 'image'), f('r.pdf', 1e6), f('s.png', 1e3, 'image')]);
  if (!(st(g) === 'rorr' && g.chips[0].why === 'attachment-too-large' && g.chips[0].limit === 10e6 && g.chips[2].why === 'attachment-shape' && g.chips[3].why === 'attachment-count')) out.push(`the per-kind rows are not judged per file (${st(g)} ${g.chips.map((c) => c.why).join()})`);
  const sh = P.composeFilesVerdict(GROUPS, OFFERED, [f('p.png', 1e3, 'image')], { hasText: true });
  if (!(sh.shape === true && P.composeFilesVerdict(GROUPS, OFFERED, [f('p.png', 1e3, 'image')], { hasText: false }).shape === false)) out.push('a picture that is its own message does not say so when text is typed');
  const bl = P.composeFilesVerdict(ROW, NOT_SENDABLE, [f('a.png', 10, 'image'), f('b.pdf', 10)]);
  if (!(st(bl) === 'bb' && bl.send.length === 0 && bl.blocked && bl.blocked.requiredScopes.join() === 'im:resource,im:resource:upload')) out.push(`a file this account cannot carry LOOKS attached (${st(bl)} send ${bl.send.join()})`);
  const no = P.composeFilesVerdict(null, { offered: false, why: 'attachments-not-offered' }, [f('a.pdf', 10)]);
  if (!(st(no) === 'r' && no.chips[0].why === 'attachments-not-offered' && no.send.length === 0)) out.push('an adapter without files does not refuse the chip');
  const odd = P.composeFilesVerdict(ROW, OFFERED, [f('', 10), f('a/b.pdf', 10), f('e.txt', 0), f('big.iso', 30e6, null), f('x.bin', 10, null)]);
  if (!(odd.chips.map((c) => c.why).join() === 'attachment-name,attachment-name,attachment-empty,attachment-too-large,attachment-data' && odd.send.length === 0)) out.push(`the odd files are not refused by name (${odd.chips.map((c) => c.why).join()})`);
  const engineAgrees = [a, big].every((v, i) => { const fl = i ? [f('a.pdf', 20e6), f('c.txt', 1e3)] : [f('a.png', 2e6, 'image'), f('b.pdf', 3e6)]; return P.attachVerdict(ROW, fl, { hasText: true }).ok; });
  if (!engineAgrees) out.push('what the chips send is refused by the engine\'s own attachVerdict');
  return out;
}

async function routeJudge(routesMod) {
  const out = [];
  const express = require(path.join(REPO, 'node_modules/express'));
  const asked = [];
  const engine = { propose: async (ctx, a, c, input) => { asked.push({ ctx, a, c, input }); return { ok: true, proposal: { id: 'p-x', state: 'sent' }, decision: { mode: 'direct' } }; } };
  routesMod.setup({ getEngine: () => engine });
  const app = express(); app.use(express.json({ limit: '50mb' })); app.use(routesMod.router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const call = (p, body, headers = {}) => new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: p, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => { let b = ''; res.on('data', (x) => { b += x; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode, body: j }); }); });
    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    req.end(JSON.stringify(body));
  });
  try {
    const files = [{ name: 'a.png', data: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64') }];
    const r = await call('/api/channels/lark-1/oc_1/send', { text: 'here', attachments: files, expectWakes: 0 });
    if (!(r.status === 200 && asked.length === 1 && asked[0].ctx.kind === 'user' && asked[0].input.direct === true && JSON.stringify(asked[0].input.attachments) === JSON.stringify(files))) out.push(`the owner's send does not hand its files to the engine's direct send (${r.status}, ${asked.length})`);
    for (const tok of ['vsst_fake-agent-token', 'jbt_fake-job-token']) {
      const ra = await call('/api/channels/lark-1/oc_1/send', { text: 'as the owner', attachments: files }, { Authorization: `Bearer ${tok}` });
      if (!(ra.status === 403 && ra.body && ra.body.code === 'agent-forbidden')) out.push(`an agent bearer (${tok.slice(0, 5)}) sends as the owner (${ra.status})`);
    }
    if (asked.length !== 1) out.push(`an agent's bearer reached the engine (${asked.length - 1} times)`);
  } finally { await new Promise((r) => server.close(r)); }
  return out;
}

console.log('① PURE composeFilesVerdict — every chip judged before the send');
const P = require(path.join(REPO, 'src/channel-policy.js'));
const pj = pureJudge(P);
ok(pj.length === 0, `the row's count / total / per-kind / shape limits refused at the chip by name; a not-sendable account's files blocked, none sent; what the chips send passes the engine's attachVerdict${pj.length ? ` — ${pj.join('; ')}` : ''}`);

console.log('② the route — the owner\'s files reach the direct send; an agent\'s bearer never does');
const rj = await routeJudge(require(path.join(REPO, 'src/routes/channels.js')));
ok(rj.length === 0, `POST …/send hands {text, attachments, direct} to the engine as the user; a vsst_ / jbt_ bearer is 403 agent-forbidden, the engine never asked${rj.length ? ` — ${rj.join('; ')}` : ''}`);

console.log('③ the window wires it (source)');
const W = fs.readFileSync(path.join(REPO, 'src/lib/channel-window.js'), 'utf8');
ok(/input\.type = 'file';\n  input\.multiple = true;/.test(W) && W.includes("icon('attachment', 14)") && W.includes("comp.addEventListener('drop'") && W.includes("ta.addEventListener('paste'"), 'the composer has a paperclip (the house attachment glyph) over a hidden multiple file input, a drop and a paste');
ok(W.includes('P.composeFilesVerdict(caps, offer,') && W.includes("...(files.length ? { attachments: files } : {})") && W.includes('sending: () => verdict.send.map('), 'the chips are judged by the PURE verdict and only its `send` list rides the POST');
ok(W.includes('img.src = p.url;') && !/chanwin-file[^\n]*innerHTML/.test(W), 'a picture chip draws its thumbnail through .src (never innerHTML)');
ok(W.includes("composeReceiptText(r2.proposal, files.length)") && W.includes("showToast(said, { type: partly ? 'warn' : 'success' })"), 'the receipt names what landed — the line above the box AND a toast');
const E = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
ok(E.includes("sendAttachment: filesOfferFor(rec, effectiveConvCaps(rec, en), t),") && E.includes('sendAttachments: c.sendAttachments || null,'), 'the conversation view carries the same files offer the send judges + the adapter\'s limits');

console.log('④ patched-copy controls');
const ctlPure = [
  ['if (total + bytes > cap) { refuse(\'attachment-too-large\', cap); continue; }', '', 'a file past the row\'s total ACCEPTED'],
  ["if (blocked) { chips.push({ n, state: 'blocked', why: 'attachments-not-sendable' }); continue; }", '', 'a file the account cannot carry shown ATTACHED'],
];
const PS = fs.readFileSync(path.join(REPO, 'src/channel-policy.js'), 'utf8');
for (const [from, to, what] of ctlPure) {
  const red = PS.includes(from) ? pureJudge(require(MC.write('src/channel-policy.js', PS.replace(from, to), what.replace(/\W+/g, '-').slice(0, 30)))) : null;
  ok(Array.isArray(red) && red.length > 0, `control — ${what}: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`);
}
{
  const RS = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf8');
  const from = '    if (refuseAgentBearer(req, res, OWN_SEND_IS_OWNERS)) return;';
  const red = RS.includes(from) ? await routeJudge(require(MC.write('src/routes/channels.js', RS.replace(from, ''), 'route-bearer'))) : null;
  ok(Array.isArray(red) && red.length > 0, `control — the agent's bearer ACCEPTED on the owner's send: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`);
}

console.log('⑤ the chip OPENS before the send — THE ONE attachment door, from the local File (lane compose-chip-open)');
// owner 2026-10-09 on .245 ("上传上去的文件不能查看预览"): a "baa-0.pdf 245 KB ×" chip had no way to be looked at
{
  const u = P.attachmentUrlFor;
  const pure = [
    [u('blob:http://h/9f', { inline: true }), 'blob:http://h/9f'], [u('/api/x/attachment/0', { inline: true }), '/api/x/attachment/0?inline=1'],
    [u('/a?b=1', { inline: true }), '/a?b=1&inline=1'], [u('/a', {}), '/a'], [u('BLOB:x', { inline: true }), 'BLOB:x'],
  ].filter(([got, want]) => got !== want);
  ok(pure.length === 0, `PURE attachmentUrlFor: a served picture asks ?inline=1 (& after a query); a blob: URL takes NO query${pure.length ? ` — ${JSON.stringify(pure)}` : ''}`);
}
// the census over createComposeFiles: every open goes through openComposePick (→ openAttachment); nothing else opens,
// navigates or writes markup; every way a pick leaves revokes its URL
const chipCensus = (src) => {
  const a = src.indexOf('function createComposeFiles('); const body = a < 0 ? '' : src.slice(a, src.indexOf('\n}\n', a));
  const bad = [];
  if (!body.includes('const open = () => openComposePick(app, p);')) bad.push('the chip does not open through openComposePick');
  if (!body.includes('img.onclick = open;')) bad.push('a picture thumb does not open');
  if (!body.includes('nm.onclick = open;') || !/nm\.onkeydown = \(e\) => \{ if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{ e\.preventDefault\(\); open\(\); \} \};/.test(body)) bad.push('the name does not open by click / Enter / Space');
  if (!body.includes("nm.dataset.open = openKind; nm.tabIndex = 0;") || !body.includes("const openKind = attachmentOpenKind(p.name, p.mime);")) bad.push('the name carries no data-open kind / focus');
  if (!body.includes("if (openKind === 'download') nm.title = t('Nothing to preview — it is sent as it is');")) bad.push('a download-kind name does not say why it is plain');
  for (const w of ['window.open(', 'location', '.href', 'showImageOverlay(', 'app.openFile(', 'openAttachment(', 'innerHTML', 'FileViewer']) if (body.includes(w)) bad.push(`a second open path: ${w}`);
  if (!body.includes("const x = btn('', () => { forget(p); picks.splice(picks.indexOf(p), 1); draw(); }, 'chanwin-file-x');")) bad.push('× does not revoke the chip\'s URL');
  if (!body.includes('destroy: () => { for (const p of picks) forget(p); for (const u of spent.splice(0)) URL.revokeObjectURL(u); },')) bad.push('destroy leaves URLs alive');
  if (!body.includes('file: f, mime: String(f.type || \'\') }') || !body.includes('if (!p.mime) p.mime = sniffed.mime;')) bad.push('the pick keeps no File / mime');
  if (!src.includes('    if (liveFiles) { liveFiles.destroy(); liveFiles = null; }\n') || !src.includes("winInfo._listenerCtl?.signal.addEventListener('abort', () => { if (liveFiles) liveFiles.destroy(); liveFiles = null; }, { once: true });") || !src.includes('      liveFiles = cf;\n')) bad.push('the composer is never destroyed at a rebuild / close');
  return bad;
};
const cc = chipCensus(W);
ok(cc.length === 0, `the chip's thumb + name open through THE ONE door (openComposePick → openAttachment), the name by click / Enter / Space with data-open; × / destroy revoke the URL; a rebuild and the window's close destroy the composer${cc.length ? ` — ${cc.join('; ')}` : ''}`);
const OB = fs.readFileSync(path.join(REPO, 'src/lib/channel-outbox.js'), 'utf8');
ok(OB.includes("export function openComposePick(app, p) {\n  if (!p.url && p.file) p.url = URL.createObjectURL(p.file);\n  return p.url ? openAttachment(app, { url: p.url, name: p.name, mime: p.mime }) : 'download';\n}"), 'openComposePick mints the blob URL from the File on demand and hands it to openAttachment (the behaviour is judged in test-channel-outbox)');
for (const [from, to, what] of [
  ['const open = () => openComposePick(app, p);', 'const open = () => window.open(p.url || URL.createObjectURL(p.file));', 'a chip that opens through its own window.open'],
  ["const x = btn('', () => { forget(p); picks.splice(", "const x = btn('', () => { picks.splice(", 'a × that keeps the URL alive'],
]) {
  const red = W.includes(from) ? chipCensus(W.replace(from, to)) : null;
  ok(Array.isArray(red) && red.length > 0, `control — ${what}: the census is red (${red === null ? 'the patch site is gone' : red.length ? red[0] : 'GREEN — the census missed it'})`);
}

console.log(`\n${fails ? '✗' : '✓'} test-channel-compose-files: ${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);

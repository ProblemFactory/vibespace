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
//  ⑥ lane composer-file-only-send (B-dce6): a file ALONE is a message where the row's `alone` cell says so — PURE (the
//     proposal's shape, attachVerdict per kind, the chips' needsText), the engine over an unknown kind WITH the cell and
//     the vendor id `lark` WITHOUT it, PROPOSE mode's files in the proposal store; ⑦ controls: an id gate, no row handed
//     in, fileAloneOf blind to the cell — each red
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

console.log('⑥ A FILE ALONE IS A MESSAGE — by the capability row\'s `alone` cell, never an adapter id (lane composer-file-only-send, B-dce6)');
// the owner 2026-10-14 (B-dce6, the deviation .245 left): a file picked with no words asked for a line. Now: PURE over the
// row's cell (the proposal's shape, the engine's per-kind verdict, the chips' `needsText`); the engine over TWO accounts
// chosen against an id gate — an unknown kind WITH the cell, the vendor id `lark` WITHOUT it; and PROPOSE mode's files
// ride the proposal (the store, re-hashed at the send) exactly as an agent's --attach does
const PDF = Buffer.from('%PDF-1.4\n%fixture\n', 'latin1');
const ALONE = { ...ROW, alone: true };
function alonePureJudge(Pm) {
  const out = [];
  const one = [{ name: 'b.pdf', data: PDF.toString('base64') }];
  const a = Pm.validateProposal({ text: '', attachments: one }, { sendAttachments: ALONE });
  if (!(a.ok && a.proposal.text === '' && a.proposal.attachments.length === 1)) out.push(`a file alone on a row that carries one is refused (${JSON.stringify(a).slice(0, 120)})`);
  const ws = Pm.validateProposal({ text: '  \n ', attachments: one }, { sendAttachments: ALONE });
  if (!(ws.ok && ws.proposal.text === '')) out.push('blank words beside a file are not stored as no text');
  for (const [what, row] of [['the cell absent', ROW], ['alone: false', { ...ROW, alone: false }], ['no row', null]]) {
    const v = Pm.validateProposal({ text: '', attachments: one }, { sendAttachments: row });
    if (!(v.ok === false && v.why === 'attachment-alone' && /by itself/.test(v.error))) out.push(`${what}: a file alone is not refused by name (${JSON.stringify(v).slice(0, 120)})`);
  }
  const bare = Pm.validateProposal({ text: '' }, { sendAttachments: ALONE });
  if (!(bare.ok === false && bare.error === 'text is required' && !bare.why)) out.push('no text and no file is not "text is required"');
  if (!(Pm.attachVerdict(ALONE, [f('b.pdf', 9)], { hasText: false }).ok && Pm.attachVerdict(ROW, [f('b.pdf', 9)], { hasText: false }).why === 'attachment-alone')) out.push('the engine\'s attachVerdict does not read the cell');
  const sp = { images: { ...GROUPS.images }, files: { ...GROUPS.files } };
  if (!(Pm.attachVerdict(sp, [f('p.png', 9, 'image')], { hasText: false }).ok && Pm.attachVerdict(sp, [f('r.pdf', 9)], { hasText: false }).why === 'attachment-alone')) out.push('a split row is not judged per kind (a withText:false picture group alone; the file group without the cell)');
  const c0 = Pm.composeFilesVerdict(ROW, OFFERED, [f('b.pdf', 9)]), c1 = Pm.composeFilesVerdict(ALONE, OFFERED, [f('b.pdf', 9)]), c2 = Pm.composeFilesVerdict(ROW, OFFERED, [f('b.pdf', 9)], { hasText: true });
  const c3 = Pm.composeFilesVerdict(ROW, NOT_SENDABLE, [f('b.pdf', 9)]);
  if (!(c0.needsText === true && c0.send.join() === '0' && c1.needsText === false && c2.needsText === false && c3.needsText === false)) out.push(`the chips' needsText does not follow the cell (${[c0, c1, c2, c3].map((v) => v.needsText).join()})`);
  return out;
}
const apj = alonePureJudge(P);
ok(apj.length === 0, `PURE: an empty text + files is a proposal where the row says \`alone\` (text stored ''), refused attachment-alone by name otherwise (cell absent / false / no row); attachVerdict per kind; the chips' needsText over the same cell${apj.length ? ` — ${apj.join('; ')}` : ''}`);

async function aloneEngineJudge(ENGm) {
  const out = [];
  const os = require('node:os');
  const CH = require(path.join(REPO, 'src/channels/index.js'));
  const fake = require(path.join(REPO, 'src/channels/fake.js'));
  const OF = require(path.join(REPO, 'src/channel-outbox-files.js'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-compose-alone-'));
  const sends = [];
  const mod = (kind, row) => ({ kind, caps: { ...fake.fakePoll.caps, sendAttachments: row, sendAttachmentsWhy: null, budget: undefined, pace: undefined },
    create(record, deps) { const a = fake.fakePoll.create(record, { ...deps }); return Object.assign(Object.create(a), { send: (c, o) => { sends.push({ kind, text: o.text, files: (o.attachments || []).map((x) => `${x.name}:${x.data.length}`) }); return a.send(c, o); } }); } });
  const registry = CH.createChannelRegistry();
  registry.register(mod('fx-alone', ALONE));   // an id no gate knows, WITH the cell
  registry.register(mod('lark', ROW));         // the vendor's own id, WITHOUT it
  const acct = (id, kind) => ({ id, kind, label: id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, options: {} });
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [acct('fa', 'fx-alone'), acct('lk', 'lark')] }));
  const T = 1727999000000;
  try {
    const eng = ENGm.create({ dataDir, registry, env: {}, now: () => T, broadcast: () => {}, serverSetting: (k) => ({ 'channels.guardAttachmentsReview': true })[k], liveSessions: () => [], userTodos: { add: () => ({ id: 't' }) }, log: { log() {}, warn() {}, error() {} } });
    await eng.pass('fa', { force: true }); await eng.pass('lk', { force: true });
    const convOf = (a) => { const k = Object.keys(eng.store.index.live()).find((x) => x.startsWith(`${a}/`) && x.endsWith('-ops')); return k ? k.slice(a.length + 1) : null; };
    const fa = convOf('fa'), lk = convOf('lk');
    if (!fa || !lk) return [`the two accounts list no room (${fa}, ${lk})`];
    const one = () => [{ name: 'b.pdf', data: PDF.toString('base64') }];
    const count = () => Object.keys(eng.store.outbox.snapshot().proposals).length;
    // the owner's direct send: a file by itself, where the row says alone
    const d = await eng.propose({ kind: 'user' }, 'fa', fa, { direct: true, text: '', attachments: one() });
    const dq = d.ok ? eng.store.outbox.snapshot().proposals[d.proposal.id] : null;
    if (!(dq && dq.state === 'sent' && dq.text === '' && dq.attachments.length === 1 && dq.attachments[0].name === 'b.pdf')) out.push(`fx-alone: the file alone was not sent (${JSON.stringify(d).slice(0, 140)})`);
    if (!(sends.length === 1 && sends[0].kind === 'fx-alone' && sends[0].text === '' && sends[0].files.join() === `b.pdf:${PDF.length}`)) out.push(`fx-alone: the adapter did not receive the file with an empty text (${JSON.stringify(sends)})`);
    // the vendor id without the cell: refused by name, nothing created, the adapter never asked
    const n0 = count(), s0 = sends.length;
    const r = await eng.propose({ kind: 'user' }, 'lk', lk, { direct: true, text: '', attachments: one() });
    if (!(r.ok === false && r.code === 'bad-proposal' && r.why === 'attachment-alone' && count() === n0 && sends.length === s0)) out.push(`lark without the cell: a file alone was not refused by name with nothing created (${JSON.stringify(r).slice(0, 140)})`);
    const w = await eng.propose({ kind: 'user' }, 'lk', lk, { direct: true, text: 'the report', attachments: one() });
    if (!(w.ok && eng.store.outbox.snapshot().proposals[w.proposal.id].state === 'sent' && sends.length === s0 + 1 && sends[s0].text === 'the report')) out.push('lark without the cell: a line WITH the file does not go');
    // PROPOSE mode (POST …/propose): the owner's files ride the proposal — stored, held by the guard, re-hashed at the send
    const pr = await eng.propose({ kind: 'user' }, 'fa', fa, { text: '', attachments: one() });
    const pq = pr.ok ? eng.store.outbox.snapshot().proposals[pr.proposal.id] : null;
    const file = pq ? OF.fileOf(eng.store.dir, pq.id, 0) : null;
    const sha = require('node:crypto').createHash('sha256').update(PDF).digest('hex');
    if (!(pq && pq.state === 'awaiting-approval' && pq.draftedBy.kind === 'user' && pq.attachments[0].sha256 === sha && file && fs.readFileSync(file).equals(PDF))) out.push(`propose mode: the file does not ride the proposal store (${JSON.stringify(pr).slice(0, 140)})`);
    if (pq) {
      const s1 = sends.length;
      const ap = await eng.approve(pq.id, { shown: P.shownDigest((eng.outboxView().proposals || []).find((p) => p.id === pq.id)) });
      const aq = eng.store.outbox.snapshot().proposals[pq.id];
      if (!(ap.ok !== false && aq.state === 'sent' && sends.length === s1 + 1 && sends[s1].text === '' && sends[s1].files.join() === `b.pdf:${PDF.length}`)) out.push(`propose mode: Approve did not send the file alone (${aq && aq.state}, ${JSON.stringify(sends.slice(s1))})`);
    }
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
  return out;
}
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const aej = await aloneEngineJudge(ENG);
ok(aej.length === 0, `the engine: fx-alone (the cell) sends a file alone, the adapter receiving it with an empty text; lark (no cell) refuses attachment-alone, nothing created, and sends a line WITH the file; propose mode stores the file (sha256 on disk, awaiting approval) and Approve sends it alone${aej.length ? ` — ${aej.join('; ')}` : ''}`);
// the window: files alone pass the Send where the verdict allows it; the clip mounts in PROPOSE mode too (source pins —
// the behaviour is the chrome leg's, test-channel-threads-ui (u))
ok(W.includes('const cf = ad0.sendAttachments && c.offers && c.offers.sendAttachment') && !W.includes('const cf = direct && ad0.sendAttachments') && W.includes("/${direct ? 'send' : 'propose'}`"), 'the clip mounts in direct AND propose mode, and the files ride the route the mode names');
ok(W.includes('if (!text && (!files.length || cf.needsText())) {') && W.includes("needsText: () => verdict.needsText,") && W.includes("alone.dataset.filesAlone = 'no';"), 'files alone pass the Send unless the verdict says needsText — then the box says so (data-files-alone), the Send stays live');

console.log('⑦ controls — the cell, not an id; the row reaches the proposal\'s shape');
{
  const { engineSource } = await import('./channels-engine-src.mjs');
  const ES = engineSource(REPO);
  const at = '    const v = P.validateProposal(input, { sendAttachments: (registry.capsOf(rec.kind) || {}).sendAttachments || null });';
  for (const [to, what] of [
    ["    const v = P.validateProposal(input, { sendAttachments: ['lark', 'gmail', 'slack'].includes(rec.kind) ? { alone: true } : null });", 'the engine gates a file alone on an ADAPTER ID'],
    ['    const v = P.validateProposal(input);', 'the engine never hands the row in (text required — the .245 shape)'],
  ]) {
    const red = ES.includes(at) ? await aloneEngineJudge(require(MC.write('src/server/channels-engine.js', ES.replace(at, to), what.replace(/\W+/g, '-').slice(0, 30)))) : null;
    ok(Array.isArray(red) && red.length > 0, `control — ${what}: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`);
  }
  const from = "  const one = (g) => !!(g && typeof g === 'object' && (g.alone === true || g.withText === false));";
  const red = PS.includes(from) ? alonePureJudge(require(MC.write('src/channel-policy.js', PS.replace(from, "  const one = (g) => !!(g && typeof g === 'object' && g.withText === false);"), 'pure-no-cell'))) : null;
  ok(Array.isArray(red) && red.length > 0, `control — fileAloneOf blind to the \`alone\` cell: red (${red === null ? 'the patch site is gone' : red.length ? red[0].slice(0, 120) : 'GREEN — the judge missed it'})`);
}

console.log(`\n${fails ? '✗' : '✓'} test-channel-compose-files: ${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);

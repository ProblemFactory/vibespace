#!/usr/bin/env node
// A FILE SAVED FROM A PREVIEW CARRIES ITS OWN NAME (lane raw-filename, userW
// 2026-09-28: "我从vibespace预览里下载文件，文件名都叫raw") — FAST, in-process.
//
// Every preview element streams through GET /api/file/raw?path=… and the route
// answered without a Content-Disposition, so the browser's own save controls
// ("Save image as…", the PDF viewer's download button, a video's download
// control, a drag to the desktop) named the file after the URL's last path
// segment: `raw`. Now the route names it `inline` in both RFC 6266 forms, on
// this machine AND on a remote one (RemoteFs.downloadTo). This suite:
//
//   ① the PURE helper (src/file-disposition.js): a table (ASCII, CJK, quotes,
//     backslash, semicolon, CR/LF, `'()*`, `%`, a lone surrogate, empty names)
//     and a SEEDED SWEEP of 3 000 names over every BMP range + astral + controls:
//     the value passes Node's own header validation (never ERR_INVALID_CHAR),
//     is printable ASCII, and express's own `content-disposition` parser (the
//     independent oracle) reads back exactly the name minus control characters
//   ② the LOCAL route over the real router (express, 127.0.0.1:0): an ASCII
//     name, a CJK name, a hostile name (quote, semicolon, CR, backslash,
//     apostrophe, parens, star, percent) and a PDF — both forms, the bytes, the
//     type; a Range request is still 206 and still named; a missing file answers
//     byte-for-byte what the pre-fix route answered (404, no name); r2: a dotfile
//     (`.hidden.png`) is served and named — send's legacy rule made it a 404
//   ③ the REMOTE route over the real RemoteFs with a FAKE host: the ssh branch
//     (`_spawn` runs the same `cat` locally) and the dial branch (a fake device
//     whose runStream runs it locally) — the same names. r2 (3): a missing file
//     or folder answers 404 with no name on BOTH transports and every route (raw,
//     download, download-zip) — over ssh it was an EMPTY 200 (the pipe ended the
//     response before cat's exit code arrived; a Download saved an empty file
//     under the name); a zero-byte file is still 200 and named; a spawn failure
//     (no ssh binary) is a 502 — it was an unhandled child 'error', i.e. the
//     hub's exit(1); a viewer that goes away ends the child (it blocked forever)
//   ④ the ATTACHMENT routes (/api/download, /api/download-zip) with an ASCII and
//     a CJK name, on this machine and on both remote transports: 200, the bytes
//     (a real zip), `attachment` + the name in filename*; local /api/download's
//     res.download header is exactly the pre-fix one. r2: the remote attachment
//     header put the RAW name in `filename="…"` — a CJK name made setHeader throw
//     inside the async route and the request was NEVER ANSWERED (userW's remote
//     Download of 截图.png); now contentDisposition (both forms, ASCII by
//     construction) + files.js's remoteStream belt (any synchronous throw from a
//     remote stream helper is a 502, never a hang)
//   ⑤ CONTROLS (scripts/mutant-copy.mjs): files.js without the local naming and
//     remote-fs.js without the inline naming — the legs above go RED on each;
//     remote-fs.js with the pre-r2 attachment spelling: over files.js WITHOUT the
//     belt the CJK Download / Download as Zip is never answered (the hang,
//     reproduced, ERR_INVALID_CHAR logged as an unhandled rejection), over the
//     real files.js it is answered 502 — still red: both halves are needed
//   ⑥ THE CENSUS: every byte-serving site (sendFile / pipe(res) / res.download /
//     downloadTo / downloadZipTo) under src/routes/**, src/server/**, src/*.js
//     and server.js is classified NAMED (the handler names the file — verified
//     in the source span) or DECLARED (with the reason a browser never saves it
//     under a meaningless name); an unclassified site or a dead row is red.
//     CONTROLS: the naming stripped ⇒ the raw row unverified; a planted nameless
//     route ⇒ an unclassified site.
//   ⑦ THE SPELLING CENSUS (r2): every Content-Disposition value the tree sets is
//     built by contentDisposition() (directly or through a variable it assigned)
//     or DECLARED with why it is printable ASCII by construction — a raw name in a
//     header is a thrown setHeader. CONTROL: the pre-r2 remote spelling planted ⇒ red.
//   ⑧ THE CLIENT HOST CENSUS (r2): every client URL to a byte route that
//     dispatches on ?host= (/api/file/raw, /api/download, /api/download-zip)
//     carries the file's machine (hq / _hp() / host) or is DECLARED local-only.
//     The code editor's ⇩ Download dropped it — a remote file's Download asked
//     THIS machine for a path of the same name. CONTROL: the pre-r2 line ⇒ red.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };

const express = require('express');
const oracle = require('content-disposition'); // express's own dependency — an independent parser
const CD = require(path.join(REPO, 'src/file-disposition.js'));
const { RemoteFs } = require(path.join(REPO, 'src/remote-fs.js'));
const filesRouter = require(path.join(REPO, 'src/routes/files.js'));
const M = mutantCopies('rawname', REPO);

const DIR = scratch('rawname');
fs.mkdirSync(DIR, { recursive: true });
process.on('exit', () => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { } });
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a0f30000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
// name on disk → { what the browser must save it as (filename*), the ASCII fallback (filename=) }
const FIXTURES = [
  { name: 'photo.png', bytes: PNG, type: 'image/png', star: 'photo.png', ascii: 'photo.png' },
  { name: '截图 2026-09-28.png', bytes: PNG, type: 'image/png', star: '截图 2026-09-28.png', ascii: '__ 2026-09-28.png' },
  { name: '季度报告 (终稿).pdf', bytes: PDF, type: 'application/pdf', star: '季度报告 (终稿).pdf', ascii: '____ (__).pdf' },
  // type: send's mime lookup (`^.*[./\\]`) cannot cross the CR, so this one is octet-stream — pre-existing, the pre-fix route agrees
  { name: 'a"b;c\rd e\\f\'(1)*100%.txt', bytes: Buffer.from('hostile name\n'), type: 'application/octet-stream', star: 'a"b;cd e\\f\'(1)*100%.txt', ascii: 'ab;cd ef\'(1)*100%.txt' },
];
for (const f of FIXTURES) fs.writeFileSync(path.join(DIR, f.name), f.bytes);
fs.writeFileSync(path.join(DIR, '.hidden.png'), PNG);
const EMPTY = path.join(DIR, '空 empty.txt'); fs.writeFileSync(EMPTY, '');
const BIG = path.join(DIR, 'big.bin'); fs.writeFileSync(BIG, ''); fs.truncateSync(BIG, 32 * 1024 * 1024); // sparse: > any pipe buffer
const ZIPDIR = path.join(DIR, '报告 2026');
fs.mkdirSync(ZIPDIR); fs.writeFileSync(path.join(ZIPDIR, '说明.txt'), 'zip me\n');
// a control that reproduces the pre-r2 hang leaves an UNHANDLED rejection, exactly as in production (server.js only logs it)
const rejections = [];
process.on('unhandledRejection', (e) => rejections.push((e && e.code) || String(e)));
const MISSING = path.join(DIR, 'gone.png');
const MISSING_DIR = path.join(DIR, 'gone-folder');
const HIDDEN = path.join(DIR, '.hidden.png');

// ── ① the PURE helper ────────────────────────────────────────────────────────
console.log('① file-disposition.js — the one spelling');
const validHeader = (v) => { try { http.validateHeaderValue('Content-Disposition', v); return true; } catch { return false; } };
const ATTR_EXT = /filename\*=UTF-8''([A-Za-z0-9!#$&+\-.^_`|~%]*)$/;
const FALLBACK = /; filename="([\x20\x21\x23-\x5b\x5d-\x7e]*)";/; // printable ASCII minus " and \
function formsOf(h) {
  const star = ATTR_EXT.exec(h || ''), fb = FALLBACK.exec(h || '');
  let decoded = null; try { decoded = star ? decodeURIComponent(star[1]) : null; } catch { decoded = null; }
  let parsed = null; try { parsed = oracle.parse(h); } catch { parsed = null; }
  return { star: decoded, ascii: fb ? fb[1] : null, parsed, type: (h || '').split(';')[0] };
}
{
  const T = [
    ['/home/u/pics/photo.png', 'photo.png'], ['/a/b/', 'b'], ['/', ''], ['', ''], ['~', '~'], ['~/x/截图.png', '截图.png'], ['rel.txt', 'rel.txt'], [null, ''],
  ];
  ok(T.every(([p, want]) => CD.fileNameOf(p) === want), 'fileNameOf: the last POSIX segment, trailing slashes ignored, "" for a root', T.map(([p]) => CD.fileNameOf(p)));
  ok(CD.contentDisposition('') === null && CD.contentDisposition('\r\n\t') === null && CD.contentDisposition(null) === null, 'no name to give ⇒ null (the caller sends no header, exactly as before)');
  const a = CD.contentDisposition('photo.png');
  ok(a === `inline; filename="photo.png"; filename*=UTF-8''photo.png`, 'an ASCII name: inline + both forms, spelled exactly', a);
  ok(CD.contentDisposition('x.pdf', 'attachment').startsWith('attachment; ') && CD.contentDisposition('x.pdf', 'bogus').startsWith('inline; '), 'type: attachment only when asked by name, else inline');
  const q = formsOf(CD.contentDisposition('it\'s (a)*.txt'));
  const qx = CD.extValue('it\'s (a)*.txt');
  ok(q.star === 'it\'s (a)*.txt' && ['%27', '%28', '%29', '%2A'].every((e) => qx.includes(e)) && !/['()*]/.test(qx), "`'()*` are percent-encoded in filename* (RFC 8187 attr-char) and decode back", qx);
  const lone = CD.contentDisposition('bad\uD800name.png');
  ok(lone && validHeader(lone) && formsOf(lone).star === 'bad�name.png', 'a lone surrogate becomes U+FFFD (encodeURIComponent would throw)', lone);
  for (const f of FIXTURES) {
    const h = CD.contentDisposition(f.name), g = formsOf(h);
    ok(validHeader(h) && g.type === 'inline' && g.star === f.star && g.ascii === f.ascii && g.parsed?.parameters?.filename === f.star,
      `${JSON.stringify(f.name)}: Node accepts the header; filename* = the name minus controls, filename="${f.ascii}"; the oracle parser reads the name`, { h, g });
  }
  // seeded sweep: every range a filename can hold
  let seed = 0x5eed1234;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const RANGES = [[0x00, 0x1f], [0x20, 0x7e], [0x7f, 0xff], [0x100, 0x2fff], [0x3000, 0x9fff], [0xac00, 0xd7a3], [0xd800, 0xdfff], [0xe000, 0xfffd], [0x1f300, 0x1faff]];
  let bad = null, n = 0;
  for (let i = 0; i < 3000; i++) {
    const len = 1 + Math.floor(rnd() * 24);
    let s = '';
    for (let k = 0; k < len; k++) { const [lo, hi] = RANGES[Math.floor(rnd() * RANGES.length)]; s += String.fromCodePoint(lo + Math.floor(rnd() * (hi - lo + 1))); }
    if (s.includes('/')) s = s.replace(/\//g, '-');
    const h = CD.contentDisposition(s);
    const clean = CD.cleanName(s);
    if (!clean) { if (h !== null) { bad = { s, h }; break; } continue; }
    n++;
    const g = formsOf(h);
    if (!validHeader(h) || !/^[\x20-\x7e]+$/.test(h) || g.star !== clean || g.parsed?.parameters?.filename !== clean || g.ascii === null || !g.ascii.length) { bad = { s: JSON.stringify(s), h, g }; break; }
  }
  ok(!bad && n > 2500, `seeded sweep: ${n} names over controls / Latin-1 / CJK / Hangul / lone surrogates / private use / emoji — every value printable ASCII, accepted by Node, both forms, the oracle reads back the name minus controls`, bad);
}

// ── a server over a router ────────────────────────────────────────────────────
async function serve(router, remoteFs) {
  const app = express();
  app.set('env', 'test'); // finalhandler: no stack traces on the console for the expected 404s
  app.locals.getRemoteFs = () => remoteFs;
  app.use(router);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(() => r()); }) };
}
async function get(base, route, p, { host, headers, timeoutMs = 10000 } = {}) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs); const t0 = Date.now();
  try {
    const r = await fetch(`${base}${route}?path=${encodeURIComponent(p)}${host ? '&host=' + encodeURIComponent(host) : ''}`, { headers, signal: ac.signal });
    const body = Buffer.from(await r.arrayBuffer());
    return { status: r.status, cd: r.headers.get('content-disposition'), type: r.headers.get('content-type'), range: r.headers.get('content-range'), body, ms: Date.now() - t0 };
  } catch (e) {
    if (e && e.name === 'AbortError') return { status: 'no answer', cd: null, type: null, range: null, body: Buffer.alloc(0), ms: Date.now() - t0 };
    throw e;
  } finally { clearTimeout(t); }
}
/** An attachment answer names `want` (filename* + the oracle) and carries `check(body)`. */
function attachOk(r, want, check) {
  const g = formsOf(r.cd);
  return r.status === 200 && g.type === 'attachment' && g.parsed?.parameters?.filename === want && validHeader(r.cd) && check(r.body);
}
/** The leg every transport must pass for one fixture; returns {pass, detail}. */
async function namedLeg(base, f, host) {
  const r = await get(base, '/api/file/raw', path.join(DIR, f.name), { host });
  const g = formsOf(r.cd);
  const pass = r.status === 200 && r.body.equals(f.bytes) && g.type === 'inline' && g.star === f.star && g.ascii === f.ascii && g.parsed?.parameters?.filename === f.star
    && (host || (r.type || '').startsWith(f.type));
  return { pass, detail: { status: r.status, cd: r.cd, type: r.type, bytes: r.body.length } };
}

// fake hosts for the REAL RemoteFs: ssh = `_spawn` runs the same command locally; dial = a device whose runStream does
const children = []; // every child the fake ssh host spawned (the abort leg watches them)
function sshFs(Cls, { bin = 'sh' } = {}) {
  const rf = new Cls({ get: (id) => ({ id, name: 'box', transport: 'ssh' }), dataPlaneOn: () => false, sshArgs: () => [] });
  // a lone `cat` is exec'd, so the child IS the streaming process — as `ssh` is in production
  rf.children = [];
  rf._spawn = (id, cmd) => { const c = spawn(bin, ['-c', cmd.startsWith('cat ') ? 'exec ' + cmd : cmd]); c.on('error', () => { }); children.push(c); rf.children.push(c); return c; };
  return rf;
}
function brokenSshFs(Cls) { // no ssh binary: the spawn itself fails (ENOENT) — the child emits 'error'
  const rf = new Cls({ get: (id) => ({ id, name: 'box', transport: 'ssh' }), dataPlaneOn: () => false, sshArgs: () => [] });
  rf._spawn = () => spawn('/nonexistent/vs-rawname-no-ssh', []);
  return rf;
}
function dialFs(Cls) {
  const dm = {
    runStream: (cmd, args, { onData }) => new Promise((resolve) => {
      const c = spawn(cmd, args);
      c.stdout.on('data', (b) => onData(b)); c.stderr.on('data', () => { });
      c.on('close', (code) => resolve({ code }));
    }),
  };
  return new Cls({ get: (id) => ({ id, name: 'dev', transport: 'dial' }), dataPlaneOn: () => true, deviceBounded: async () => dm });
}

// ── the controls (the pre-fix behaviour of exactly what this lane changed) ──
const FILES_SRC = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
const RFS_SRC = fs.readFileSync(path.join(REPO, 'src/remote-fs.js'), 'utf8');
const LOCAL_NAMING = "res.sendFile(filePath, { dotfiles: 'allow', ...(named ? { headers: { 'Content-Disposition': named } } : {}) });";
const REMOTE_NAMING = "const inlineName = attachment ? null : contentDisposition(fileNameOf(filePath), 'inline');";
ok(FILES_SRC.includes(LOCAL_NAMING) && RFS_SRC.includes(REMOTE_NAMING), 'the two naming lines the controls strip are present verbatim (else the controls would judge nothing)');
const filesCtl = M.load('src/routes/files.js', FILES_SRC.replace(LOCAL_NAMING, "res.sendFile(filePath, { dotfiles: 'allow' });"), 'nolocalname');
const filesCtlPath = M.files[M.files.length - 1]; // a 404's development-mode stack names the module file: compare as if it were the real one
const asReal = (buf) => buf.toString('utf8').split(filesCtlPath).join(path.join(REPO, 'src/routes/files.js'));
const { RemoteFs: RemoteFsCtl } = M.load('src/remote-fs.js', RFS_SRC.replace(REMOTE_NAMING, 'const inlineName = null;'), 'noremotename');
// r2 controls: the pre-r2 attachment spellings (the raw name in filename="…") and files.js without the remoteStream belt
const ATTACH_R2 = "const attachName = attachment ? contentDisposition(fileNameOf(filePath), 'attachment') : null;\n    if (attachName) res.setHeader('Content-Disposition', attachName);";
const ATTACH_PRE = "if (attachment) res.setHeader('Content-Disposition', `attachment; filename=\"${path.basename(filePath).replace(/\"/g, '')}\"`);";
const ZIP_R2 = "const zipName = contentDisposition((base || 'archive') + '.zip', 'attachment'); // both forms, ASCII (a CJK folder name threw here)\n    if (zipName) res.setHeader('Content-Disposition', zipName);";
const ZIP_PRE = "res.setHeader('Content-Disposition', `attachment; filename=\"${base.replace(/\"/g, '')}.zip\"`);";
const BELT = "  try { return fn(); }\n  catch (e) {\n    if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.status(502).json({ error: String((e && e.message) || e) }); }\n    else { try { res.end(); } catch { } }\n  }";
ok(RFS_SRC.includes(ATTACH_R2) && RFS_SRC.includes(ZIP_R2) && FILES_SRC.includes(BELT), 'the r2 lines the controls replace are present verbatim');
const { RemoteFs: RemoteFsPre } = M.load('src/remote-fs.js', RFS_SRC.replace(ATTACH_R2, ATTACH_PRE).replace(ZIP_R2, ZIP_PRE), 'preattach');
const filesNoBelt = M.load('src/routes/files.js', FILES_SRC.replace(BELT, '  return fn();'), 'nobelt');
// r2 (3) controls: the pre-r2 raw sendFile (send's legacy dotfile rule) and the pre-r2 ssh stream (pipe's default end, no 'error', no kill)
const filesNoDot = M.load('src/routes/files.js', FILES_SRC.replace(LOCAL_NAMING, "res.sendFile(filePath, named ? { headers: { 'Content-Disposition': named } } : {});"), 'nodotfiles');
const STREAM_R2 = "this._streamChild(this._spawn(id, `cat ${shq(filePath)}`), res, { beforeBody: nameIt });";
const STREAM_PRE = "const child = this._spawn(id, `cat ${shq(filePath)}`);\n    child.stdout.once('data', nameIt);\n    child.stdout.pipe(res);\n    child.stderr.on('data', () => {});\n    child.on('close', (code) => { if (code !== 0 && !res.headersSent) res.status(404).end(); });";
ok(RFS_SRC.includes(STREAM_R2), 'the r2 (3) stream line the control replaces is present verbatim');
const { RemoteFs: RemoteFsPreStream } = M.load('src/remote-fs.js', RFS_SRC.replace(STREAM_R2, STREAM_PRE), 'prestream');
// the pre-r2 stream has no child 'error' listener — in the server that is uncaughtException ⇒ exit(1); here it is caught and counted
const uncaught = [];
process.on('uncaughtException', (e) => uncaught.push((e && e.code) || String(e)));

const real = await serve(filesRouter, null);
const realSshFs = sshFs(RemoteFs);
const realSsh = await serve(filesRouter, realSshFs);
const realDial = await serve(filesRouter, dialFs(RemoteFs));
const ctlLocal = await serve(filesCtl, null);
const ctlSsh = await serve(filesRouter, sshFs(RemoteFsCtl));
const ctlDial = await serve(filesRouter, dialFs(RemoteFsCtl));
const preBeltSsh = await serve(filesRouter, sshFs(RemoteFsPre));   // the pre-r2 spelling, the r2 belt
const preHangSsh = await serve(filesNoBelt, sshFs(RemoteFsPre));   // the pre-r2 spelling, no belt = what userW had
const preHangDial = await serve(filesNoBelt, dialFs(RemoteFsPre));
const noDot = await serve(filesNoDot, null);
const preStreamFs = sshFs(RemoteFsPreStream);
const preStreamSsh = await serve(filesRouter, preStreamFs);
const brokenSsh = await serve(filesRouter, brokenSshFs(RemoteFs));
const brokenPre = await serve(filesRouter, brokenSshFs(RemoteFsPreStream));

try {
  // ── ② LOCAL ──
  console.log('② GET /api/file/raw — this machine');
  for (const f of FIXTURES) {
    const r = await namedLeg(real.base, f);
    ok(r.pass, `${JSON.stringify(f.name)}: 200, the bytes, ${f.type}, inline; filename="${f.ascii}"; filename*= the name`, r.detail);
  }
  {
    const f = FIXTURES[1];
    const r = await get(real.base, '/api/file/raw', path.join(DIR, f.name), { headers: { Range: 'bytes=0-7' } });
    ok(r.status === 206 && r.range === `bytes 0-7/${f.bytes.length}` && r.body.equals(f.bytes.subarray(0, 8)) && formsOf(r.cd).star === f.star,
      'a Range request is still 206 with its Content-Range and its 8 bytes — and still named (a <video> seeks this way)', { status: r.status, range: r.range, cd: r.cd });
    const head = await fetch(`${real.base}/api/file/raw?path=${encodeURIComponent(path.join(DIR, FIXTURES[0].name))}`, { method: 'HEAD' });
    ok(head.status === 200 && formsOf(head.headers.get('content-disposition')).star === 'photo.png', 'HEAD answers the same name');
  }
  {
    const a = await get(real.base, '/api/file/raw', MISSING), b = await get(ctlLocal.base, '/api/file/raw', MISSING);
    ok(a.status === 404 && a.cd === null && a.status === b.status && a.type === b.type && a.body.toString('utf8') === asReal(b.body),
      'a missing file: 404, no name — byte-for-byte what the pre-fix route answers', { real: [a.status, a.cd, a.type], pre: [b.status, b.cd, b.type] });
    const d = await get(real.base, '/api/file/raw', HIDDEN), e = await get(real.base, '/api/download', HIDDEN), n = await get(noDot.base, '/api/file/raw', HIDDEN);
    ok(d.status === 200 && d.body.equals(PNG) && formsOf(d.cd).star === '.hidden.png' && formsOf(d.cd).type === 'inline' && e.status === 200 && formsOf(e.cd).parsed?.parameters?.filename === '.hidden.png',
      'r2: a dotfile (.hidden.png) is previewed and downloaded under its name — send\'s legacy dotfile rule made both a 404', { raw: [d.status, d.cd], download: [e.status, e.cd] });
    ok(n.status === 404, 'control: the raw route without dotfiles:\'allow\' ⇒ the dotfile is a 404 again (RED)', [n.status]);
  }

  // ── ③ REMOTE ──
  for (const [label, srv, host] of [['ssh (the real RemoteFs, `_spawn` running the same `cat` here)', realSsh, 'box'], ['dial (the real RemoteFs, a fake device running `cat` here)', realDial, 'dev']]) {
    console.log(`③ GET /api/file/raw?host= — ${label}`);
    for (const f of FIXTURES) {
      const r = await namedLeg(srv.base, f, host);
      ok(r.pass, `${JSON.stringify(f.name)}: 200, the bytes, inline; filename="${f.ascii}"; filename*= the name`, r.detail);
    }
  }
  console.log('③b a missing file / folder, an empty file, a failed spawn, a viewer that leaves');
  for (const [label, srv, host] of [['ssh', realSsh, 'box'], ['dial', realDial, 'dev']]) {
    const r = await get(srv.base, '/api/file/raw', MISSING, { host }), d = await get(srv.base, '/api/download', MISSING, { host }), z = await get(srv.base, '/api/download-zip', MISSING_DIR, { host });
    ok([r, d, z].every((x) => x.status === 404 && x.cd === null && x.body.length === 0) && z.type === null,
      `${label}: a missing file answers 404 with no name on /api/file/raw AND /api/download, a missing folder 404 (no name, no zip type) on /api/download-zip`, { raw: [r.status, r.cd], download: [d.status, d.cd], zip: [z.status, z.cd, z.type] });
    const e = await get(srv.base, '/api/file/raw', EMPTY, { host }), f = await get(srv.base, '/api/download', EMPTY, { host });
    ok(e.status === 200 && e.body.length === 0 && formsOf(e.cd).star === '空 empty.txt' && f.status === 200 && formsOf(f.cd).type === 'attachment' && formsOf(f.cd).star === '空 empty.txt',
      `${label}: a ZERO-byte file is still 200 and named, inline and attachment (named at the successful empty end)`, { raw: [e.status, e.cd], download: [f.status, f.cd] });
  }
  {
    const pr = await get(preStreamSsh.base, '/api/file/raw', MISSING, { host: 'box' }), pd = await get(preStreamSsh.base, '/api/download', MISSING, { host: 'box' });
    ok(pr.status === 200 && pr.body.length === 0 && pd.status === 200 && formsOf(pd.cd).type === 'attachment',
      'control: the pre-r2 ssh stream ⇒ a missing file is an EMPTY 200 and a Download is an empty file under the name (RED)', { raw: [pr.status, pr.cd], download: [pd.status, pd.cd] });
    const u0 = uncaught.length;
    const b = await get(brokenSsh.base, '/api/file/raw', path.join(DIR, 'photo.png'), { host: 'box', timeoutMs: 3000 });
    ok(b.status === 502 && b.cd === null && uncaught.length === u0, 'no ssh binary: the spawn fails ⇒ 502, no name, and no uncaught error (the child\'s \'error\' is handled)', { status: b.status, uncaught: uncaught.slice(u0) });
    const bp = await get(brokenPre.base, '/api/file/raw', path.join(DIR, 'photo.png'), { host: 'box', timeoutMs: 1500 });
    await new Promise((r) => setTimeout(r, 50));
    ok(uncaught.slice(u0).includes('ENOENT'), `control: the pre-r2 ssh stream + no ssh binary ⇒ an UNCAUGHT 'error' (in the server: uncaughtException ⇒ process.exit(1)) — answered ${bp.status} (RED)`, { status: bp.status, uncaught: uncaught.slice(u0) });
  }
  {
    // a viewer that goes away (an aborted <video> seek): the child must end, not block on a full pipe forever
    const leave = async (srv, rf, waitMs) => {
      const n0 = rf.children.length;
      const ac = new AbortController();
      const r = await fetch(`${srv.base}/api/file/raw?path=${encodeURIComponent(BIG)}&host=box`, { signal: ac.signal });
      const reader = r.body.getReader(); await reader.read(); ac.abort();
      const c = rf.children[n0];
      if (!c) return { ended: false, why: 'no child' };
      const ended = c.exitCode !== null || c.signalCode !== null || await new Promise((res) => { const t = setTimeout(() => res(false), waitMs); c.once('exit', () => { clearTimeout(t); res(true); }); });
      return { ended, signal: c.signalCode };
    };
    const [a, b] = await Promise.all([leave(realSsh, realSshFs, 3000), leave(preStreamSsh, preStreamFs, 2000)]); // each watches its own RemoteFs's child
    ok(a.ended, `a viewer that leaves mid-stream (32 MB file, aborted after the first chunk) ⇒ the child is ended (${a.signal})`, a);
    ok(!b.ended, 'control: the pre-r2 ssh stream ⇒ the child is STILL blocked 2 s later (an unpiped stdout — one leaked process per aborted seek) (RED)', b);
  }

  // ── ④ the ATTACHMENT routes ──
  console.log('④ GET /api/download + /api/download-zip — ASCII and CJK names, every transport');
  const isZip = (want) => (b) => b.subarray(0, 2).toString() === 'PK' && b.includes(Buffer.from(want));
  {
    const f = FIXTURES[0];
    const a = await get(real.base, '/api/download', path.join(DIR, f.name)), b = await get(ctlLocal.base, '/api/download', path.join(DIR, f.name));
    ok(a.status === 200 && a.cd === b.cd && /^attachment; filename="photo\.png"$/.test(a.cd || ''), 'local /api/download: res.download\'s attachment header, exactly as before', { real: a.cd, pre: b.cd });
    for (const g of [FIXTURES[1], FIXTURES[3]]) {
      const r = await get(real.base, '/api/download', path.join(DIR, g.name));
      // express's res.download (untouched) percent-encodes a CR rather than dropping it, so its filename* is the on-disk name
      ok(attachOk(r, g.name, (x) => x.equals(g.bytes)), `local /api/download ${JSON.stringify(g.name)}: 200, attachment, the name (res.download)`, { status: r.status, cd: r.cd });
    }
    const z = await get(real.base, '/api/download-zip', ZIPDIR);
    ok(attachOk(z, '报告 2026.zip', isZip('报告 2026/说明.txt')), 'local /api/download-zip "报告 2026": 200, attachment, "报告 2026.zip", a real zip holding 报告 2026/说明.txt', { status: z.status, cd: z.cd, bytes: z.body.length });
  }
  for (const [label, srv, host] of [['ssh', realSsh, 'box'], ['dial', realDial, 'dev']]) {
    for (const g of FIXTURES) {
      const r = await get(srv.base, '/api/download', path.join(DIR, g.name), { host });
      const fb = formsOf(r.cd).ascii;
      ok(attachOk(r, g.star, (x) => x.equals(g.bytes)) && fb === g.ascii && r.ms < 5000, `remote (${label}) /api/download ${JSON.stringify(g.name)}: answered 200, attachment; filename="${g.ascii}"; filename*= the name, the bytes`, { status: r.status, cd: r.cd, ms: r.ms });
    }
    const z = await get(srv.base, '/api/download-zip', ZIPDIR, { host });
    ok(attachOk(z, '报告 2026.zip', isZip('报告 2026/说明.txt')) && formsOf(z.cd).ascii === '__ 2026.zip', `remote (${label}) /api/download-zip "报告 2026": answered 200, attachment; filename="__ 2026.zip"; filename*="报告 2026.zip", a real zip`, { status: z.status, cd: z.cd, bytes: z.body.length });
  }

  // ── ⑤ CONTROLS ──
  console.log('⑤ controls — the naming stripped ⇒ the legs go red');
  {
    const r = await namedLeg(ctlLocal.base, FIXTURES[0]);
    ok(!r.pass && r.detail.cd === null, 'control: files.js without the local naming ⇒ the local leg is RED (no Content-Disposition — the browser saves "raw")', r.detail);
    const r2 = await namedLeg(ctlLocal.base, FIXTURES[1]);
    ok(!r2.pass, 'control: …the CJK leg too', r2.detail);
    const s = await namedLeg(ctlSsh.base, FIXTURES[1], 'box'), t = await namedLeg(ctlDial.base, FIXTURES[1], 'dev');
    ok(!s.pass && !t.pass && s.detail.cd === null && t.detail.cd === null, 'control: remote-fs.js without the inline naming ⇒ the ssh AND dial legs are RED', { ssh: s.detail, dial: t.detail });
  }
  {
    const g = FIXTURES[1];
    const r0 = rejections.length;
    const [h1, h2, h3] = await Promise.all([ // concurrently: each waits out the same 2 s for an answer that never comes
      get(preHangSsh.base, '/api/download', path.join(DIR, g.name), { host: 'box', timeoutMs: 2000 }),
      get(preHangDial.base, '/api/download', path.join(DIR, g.name), { host: 'dev', timeoutMs: 2000 }),
      get(preHangSsh.base, '/api/download-zip', ZIPDIR, { host: 'box', timeoutMs: 2000 }),
    ]);
    await new Promise((r) => setTimeout(r, 50));
    const thrown = rejections.slice(r0);
    ok(h1.status === 'no answer' && h2.status === 'no answer' && h3.status === 'no answer' && thrown.filter((c) => c === 'ERR_INVALID_CHAR').length >= 3,
      'control: the pre-r2 attachment spelling over files.js WITHOUT the belt ⇒ the CJK remote Download (ssh + dial) and Download as Zip are NEVER ANSWERED, each an unhandled ERR_INVALID_CHAR — userW\'s hang, reproduced', { h1: h1.status, h2: h2.status, h3: h3.status, thrown });
    const b1 = await get(preBeltSsh.base, '/api/download', path.join(DIR, g.name), { host: 'box', timeoutMs: 2000 });
    const b2 = await get(preBeltSsh.base, '/api/download-zip', ZIPDIR, { host: 'box', timeoutMs: 2000 });
    ok(b1.status === 502 && b2.status === 502 && b1.cd === null && b1.ms < 1000 && !attachOk(b1, g.star, () => true),
      'control: …the same copy over the REAL files.js ⇒ answered at once (502, no name) by the remoteStream belt — and still red: the belt makes a throw an answer, the both-form spelling makes the download work', { b1: [b1.status, b1.cd, b1.ms], b2: [b2.status, b2.cd] });
    const a1 = await get(preHangSsh.base, '/api/download', path.join(DIR, FIXTURES[0].name), { host: 'box', timeoutMs: 2000 });
    ok(a1.status === 200 && a1.cd === 'attachment; filename="photo.png"', 'control sanity: the pre-r2 copy still downloads an ASCII name (only a name above U+00FF threw)', [a1.status, a1.cd]);
  }
} finally {
  for (const s of [real, realSsh, realDial, ctlLocal, ctlSsh, ctlDial, preBeltSsh, preHangSsh, preHangDial, noDot, preStreamSsh, brokenSsh, brokenPre]) await s.close();
  for (const c of children) { try { c.kill('SIGKILL'); } catch { } }
}

// ── ⑥ THE CENSUS ─────────────────────────────────────────────────────────────
console.log('⑥ the census — every byte-serving site is NAMED or DECLARED');
const SITE_RE = /\.sendFile\(|\.pipe\(\s*res\b|\bres\.download\(|\.downloadTo\(|\.downloadZipTo\(/;
// `beforeBody` = RemoteFs._streamChild's naming hook: its callers pass the name (their own handlers are rows too)
const NAMING_RE = /Content-Disposition|\bcontentDisposition\(|\bres\.download\(|\.downloadTo\(|\.downloadZipTo\(|\bbeforeBody\b/;
const HANDLER_RE = /\b(?:router|app)\.(?:get|post|put|patch|delete|all|use)\(|^\s{0,4}(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{\s*$|\bfunction\s+[A-Za-z_$][\w$]*\s*\(/;
// NAMED rows: the file is named by a Content-Disposition in the handler (checked in its source span).
// DECLARED rows: no header, and the reason a browser never saves it under a meaningless name.
const CENSUS = [
  { file: 'src/routes/files.js', has: "res.sendFile(filePath, { dotfiles: 'allow', ...(named", route: 'GET /api/file/raw (this machine)', verdict: 'named', how: 'inline, both forms (this lane); r2: dotfiles served' },
  { file: 'src/routes/files.js', has: 'R.fs.downloadTo(R.host, remotePath(req.query.path), res))', route: 'GET /api/file/raw?host= (remote)', verdict: 'named', how: 'RemoteFs.downloadTo — inline, both forms (this lane)' },
  { file: 'src/routes/files.js', has: 'R.fs.downloadTo(R.host, remotePath(req.query.path), res, { attachment: true })', route: 'GET /api/download?host=', verdict: 'named', how: 'RemoteFs.downloadTo — attachment, both forms (r2: was the raw name ⇒ a CJK name threw, never answered)' },
  { file: 'src/routes/files.js', has: "res.download(filePath, { dotfiles: 'allow' });", route: 'GET /api/download', verdict: 'named', how: 'res.download — attachment, both forms (express)' },
  { file: 'src/routes/files.js', has: 'R.fs.downloadZipTo(', route: 'GET /api/download-zip?host=', verdict: 'named', how: 'RemoteFs.downloadZipTo — attachment, both forms (r2: was the raw name ⇒ a CJK name threw, never answered)' },
  { file: 'src/routes/files.js', has: 'child.stdout.pipe(res);', route: 'GET /api/download-zip', verdict: 'named', how: "attachment; filename*=UTF-8''<dir>.zip" },
  { file: 'src/routes/files.js', has: "res.sendFile(filePath);\n", route: 'GET /api/file/serve/*', verdict: 'declared', why: 'path-addressed: the URL ENDS in the file\'s own name (the HTML preview\'s <base href> assets), so a save is named by it' },
  { file: 'src/remote-fs.js', has: 'child.stdout.pipe(res, { end: false });', route: 'RemoteFs._streamChild (the ssh downloads)', verdict: 'named', how: 'the caller\'s name: attachment set by downloadTo / downloadZipTo, inline through beforeBody; withdrawn on a 404 / 502' },
  { file: 'src/agent-routes.js', has: 'st.pipe(res);', route: 'GET /api/agent/channels/attachment', verdict: 'declared', why: 'an AGENT bearer only, never a browser: the CLI writes the bytes to the path it chose (`vibespace-channels attachment … --out`), so no save is named by a header — the bare `attachment` keeps a stray page from rendering it (lane channel-attach-read, classified at the 2.369.203 integration)' },
  { file: 'src/routes/channels.js', has: 'st.pipe(res);', route: 'GET /api/channels/…/attachment/:id', verdict: 'named', how: 'inline (raster) / attachment, both forms' },
  { file: 'src/routes/channels.js', has: 'rs.pipe(res);', route: 'GET /api/channels/avatar', verdict: 'declared', why: 'a person\'s profile picture an <img> draws in the Channels surfaces (lane channel-avatars: sandbox CSP, nosniff, ≤ 256 KiB) — never offered to the user as a file to save' },
  { file: 'src/server/published-pages.js', has: 'fs.createReadStream(fp).pipe(res);', route: 'GET /p/:id (a non-HTML snapshot)', verdict: 'named', how: 'inline / attachment; filename="…" ASCII only — a CJK name becomes underscores (finding, not changed here)' },
  { file: 'src/server/published-pages.js', has: 'return res.sendFile(fp);', route: 'GET /p/:id (the HTML page, shim failed)', verdict: 'declared', why: 'an HTML page — a browser saves a page by its title' },
  { file: 'src/routes/browser-trace.js', has: "it is still a secret (§6.4)\n  res.sendFile(path.resolve(fp));", route: 'GET /api/browser/actions/:id/frame/:which', verdict: 'declared', why: 'a trace frame is not a user file: the URL names it `before` / `after` (Chrome saves before.jpg) — naming frames per action is a follow-up' },
  { file: 'src/routes/browser-trace.js', has: "logged-in profile is a secret (§6.4)\n  res.sendFile(path.resolve(fp));", route: 'GET /api/browser/recordings/:profileId/:file', verdict: 'declared', why: 'path-addressed: the URL ends in the recording\'s own file name' },
  { file: 'src/routes/window-targets.js', has: 's.pipe(res);', route: 'GET /api/agent/window/screenshot', verdict: 'declared', why: 'agent-only (vsst_ token), read by the CLI — never a document a browser shows' },
  { file: 'src/server/plugin-loader.js', has: 'return fs.createReadStream(fp).pipe(res);', route: 'GET /plugins/:id/* (theme JSON, client module)', verdict: 'declared', why: 'plugin code/data a page loads, path-addressed by its own file name' },
  { file: 'src/server/plugin-loader.js', has: '      fs.createReadStream(fp).pipe(res);', route: 'GET /plugins/:id/* (iframe UI assets)', verdict: 'declared', why: 'plugin UI assets, path-addressed by their own file name' },
  { file: 'src/server/mounts-plugins-wiring.js', has: 'fs.createReadStream(dest).pipe(res);', route: 'GET /api/agentd/node/:version/:file', verdict: 'declared', why: 'a device installer\'s node tarball relay, fetched by curl; the URL ends in the tarball\'s own name' },
  { file: 'src/server/egress-proxy.js', has: 'ur.pipe(res);', route: 'the egress CONNECT/http proxy', verdict: 'declared', why: 'a proxy: the upstream\'s own response headers, never ours to name' },
  { file: 'src/server/path-mounts.js', has: 'ur.pipe(res);', route: 'path-mounted services (/svc/…)', verdict: 'declared', why: 'a proxy: the upstream\'s own response headers, never ours to name' },
  { file: 'src/webdav.js', has: 'return stream.pipe(res);', route: 'GET /dav/…', verdict: 'declared', why: 'WebDAV: clients name files from the PROPFIND href — the URL IS the path' },
  { file: 'server.js', has: "res.sendFile(path.join(__dirname, 'node_modules/@xterm/xterm/css/xterm.css'));", route: 'GET /xterm.css', verdict: 'declared', why: 'a static stylesheet named by its URL' },
];
function listSources() {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) walk(r); else if (e.name.endsWith('.js')) out[r] = fs.readFileSync(path.join(REPO, r), 'utf8'); } };
  walk('src/routes'); walk('src/server');
  for (const e of fs.readdirSync(path.join(REPO, 'src'))) if (e.endsWith('.js')) out['src/' + e] = fs.readFileSync(path.join(REPO, 'src', e), 'utf8');
  out['server.js'] = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  return out;
}
/** census(sources) → {sites, unclassified, ambiguous, dead, unverified} — PURE over a {file: text} map. */
function census(sources, rows = CENSUS) {
  const sites = [];
  for (const [file, text] of Object.entries(sources)) {
    const lines = text.split('\n');
    let off = 0;
    lines.forEach((line, i) => {
      const t = line.trim();
      if (SITE_RE.test(line) && !t.startsWith('//') && !t.startsWith('*') && !/^\s*(?:async\s+)?(?:downloadTo|downloadZipTo|_devStreamTo)\(/.test(line)) sites.push({ file, line: i + 1, at: off, text: t, lines });
      off += line.length + 1;
    });
  }
  const unclassified = [], ambiguous = [], unverified = [], used = new Set();
  for (const s of sites) {
    const src = sources[s.file];
    // a row claims a site when its `has` snippet starts ON the site's line
    const hits = rows.filter((r) => r.file === s.file && (() => { let k = -1; while ((k = src.indexOf(r.has, k + 1)) >= 0) { const ln = src.slice(0, k).split('\n').length; const endLn = ln + r.has.split('\n').length - 1; if (s.line >= ln && s.line <= endLn) return true; } return false; })());
    if (!hits.length) { unclassified.push(`${s.file}:${s.line} ${s.text}`); continue; }
    if (hits.length > 1) { ambiguous.push(`${s.file}:${s.line}`); continue; }
    const row = hits[0]; used.add(row);
    if (row.verdict === 'named') {
      let st = s.line - 1;
      while (st > 0 && !HANDLER_RE.test(s.lines[st])) st--;
      const span = s.lines.slice(st, s.line).join('\n');
      if (!NAMING_RE.test(span.replace(/^\s*\/\/.*$/gm, ''))) unverified.push(`${s.file}:${s.line} (${row.route}) — no Content-Disposition in its handler`);
    } else if (!row.why) unverified.push(`${row.route}: declared without a reason`);
  }
  const dead = rows.filter((r) => !used.has(r)).map((r) => `${r.file} :: ${r.route}`);
  return { sites, unclassified, ambiguous, dead, unverified };
}
{
  const S = listSources();
  const c = census(S);
  console.log(`    ${c.sites.length} sites / ${CENSUS.length} rows (${CENSUS.filter((r) => r.verdict === 'named').length} named, ${CENSUS.filter((r) => r.verdict === 'declared').length} declared)`);
  ok(c.sites.length >= CENSUS.length, `the grep found the sites (${c.sites.length}) — a census that judged nothing is not a census`);
  ok(!c.unclassified.length, 'every byte-serving site is in the table (NAMED or DECLARED with a reason) — a new one must say how a browser names what it saves', c.unclassified);
  ok(!c.ambiguous.length, 'no site is claimed by two rows', c.ambiguous);
  ok(!c.dead.length, 'no dead row (a row whose site is gone)', c.dead);
  ok(!c.unverified.length, 'every NAMED row sets a Content-Disposition inside its own handler (source span), every DECLARED row states why', c.unverified);
  // CONTROLS on the census itself
  const stripped = census({ ...S, 'src/routes/files.js': S['src/routes/files.js'].replace(LOCAL_NAMING, 'res.sendFile(filePath);').replace(/^\s*const named = contentDisposition.*$/m, '') });
  ok(stripped.unverified.some((u) => /\/api\/file\/raw \(this machine\)/.test(u)) || stripped.dead.some((d) => /\/api\/file\/raw \(this machine\)/.test(d)), 'control: files.js with the local naming stripped ⇒ the census is RED on /api/file/raw', stripped);
  const planted = census({ ...S, 'src/routes/files.js': S['src/routes/files.js'] + "\nrouter.get('/api/file/thumb', (req, res) => { res.sendFile(safePath(req.query.path)); });\n" });
  ok(planted.unclassified.some((u) => /res\.sendFile\(safePath/.test(u)), 'control: a planted nameless route ⇒ the census is RED (an unclassified site)', planted.unclassified);
  globalThis.__census = CENSUS;
}
// ── ⑦ THE SPELLING CENSUS ────────────────────────────────────────────────────
console.log('⑦ the spelling census — every Content-Disposition value is ASCII by construction');
// A header value carrying a raw file name throws in setHeader the moment the name has a character above
// U+00FF (or a CR/LF): the r2 hang. Every value is contentDisposition()'s — or DECLARED with the reason it
// cannot hold such a character.
const SPELLINGS = [
  { file: 'src/routes/channels.js', has: "filename=\"${ascii}\"; filename*=UTF-8''${encodeURIComponent(name)}", why: 'both forms spelled inline: `ascii` is the name with [\\r\\n"] and then every non-[\\x20-\\x7e] character replaced by _, and encodeURIComponent returns ASCII' },
  { file: 'src/agent-routes.js', has: "res.setHeader('Content-Disposition', 'attachment');", why: 'the bare word, no file name — ASCII by construction (the agent attachment route: the CLI names the file it writes)' },
  { file: 'src/routes/files.js', has: "attachment; filename*=UTF-8''${encodeURIComponent(base)}.zip", why: 'local /api/download-zip: filename* only, encodeURIComponent returns ASCII (the CJK leg in ④ downloads it)' },
  { file: 'src/server/published-pages.js', has: 'filename="${dispositionName(rec.name)}"', why: 'dispositionName replaces every run of [^\\w.\\-] (\\w is ASCII without the u flag) by _ — ASCII, though a CJK name degrades to underscores (a finding)' },
  { file: 'src/routes/persistence.js', has: 'attachment; filename="${name}"', why: 'the config export: name = vibespace-config-<ISO date>.json, ASCII by construction' },
];
function spelling(sources, decl = SPELLINGS) {
  const raw = [], used = new Set();
  let seen = 0;
  for (const [file, text] of Object.entries(sources)) {
    text.split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) return;
      const m = /['"]Content-Disposition['"]\s*[,:]\s*(.*)$/i.exec(line); // setHeader('…', X) · res.set('…', X) · { '…': X }
      if (!m) return;
      seen++;
      const val = m[1];
      if (/\bcontentDisposition\(/.test(val)) return;
      const id = /^([A-Za-z_$][\w$]*)\s*[)},]/.exec(val);
      if (id && new RegExp(`\\b${id[1]}\\s*=\\s*[^;\\n]*\\bcontentDisposition\\(`).test(text)) return;
      const d = decl.find((r) => r.file === file && line.includes(r.has));
      if (d) { used.add(d); return; }
      raw.push(`${file}:${i + 1} ${t}`);
    });
  }
  return { raw, seen, dead: decl.filter((d) => !used.has(d)).map((d) => d.file), unexplained: decl.filter((d) => !d.why).map((d) => d.file) };
}
{
  const S = listSources();
  const sp = spelling(S);
  console.log(`    ${sp.seen} Content-Disposition values / ${SPELLINGS.length} declared spellings`);
  ok(sp.seen >= 8, `the grep found the header sets (${sp.seen})`);
  ok(!sp.raw.length, 'every Content-Disposition value is contentDisposition()\'s (directly or through the variable it assigned) or a DECLARED ASCII-by-construction spelling', sp.raw);
  ok(!sp.dead.length && !sp.unexplained.length, 'no dead or unexplained declared spelling', sp);
  const planted = spelling({ ...S, 'src/remote-fs.js': S['src/remote-fs.js'].replace(ATTACH_R2, ATTACH_PRE) });
  ok(planted.raw.some((r) => r.startsWith('src/remote-fs.js') && /path\.basename\(filePath\)/.test(r)), 'control: the pre-r2 remote spelling (the raw name in filename="…") planted back ⇒ RED', planted.raw);
}

// ── ⑧ THE CLIENT HOST CENSUS ─────────────────────────────────────────────────
console.log('⑧ the client host census — every URL to a ?host=-dispatched byte route carries the machine');
const HOST_ROUTE_RE = /\/api\/(?:file\/raw|download|download-zip)\?path=/;
const CARRIES_HOST_RE = /\bhq\b|\b_hp\(\)|\bhost\b/;
const LOCAL_ONLY = [
  { file: 'src/lib/jobs-panel.js', has: "img.src = '/api/file/raw?path=' + encodeURIComponent(b.path)", why: 'a Background Work job runs on THIS machine (jobs.js spawns job-wrapper.js locally, never on a host) — its panel\'s picture is a local path' },
];
function clientSources() {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) walk(r); else if (e.name.endsWith('.js')) out[r] = fs.readFileSync(path.join(REPO, r), 'utf8'); } };
  walk('src/lib');
  return out;
}
function hostCensus(sources, decl = LOCAL_ONLY) {
  const missing = [], used = new Set();
  let seen = 0;
  for (const [file, text] of Object.entries(sources)) {
    text.split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || !HOST_ROUTE_RE.test(line)) return;
      seen++;
      if (CARRIES_HOST_RE.test(line.slice(line.search(HOST_ROUTE_RE)))) return;
      const d = decl.find((r) => r.file === file && line.includes(r.has));
      if (d) { used.add(d); return; }
      missing.push(`${file}:${i + 1} ${t.slice(0, 160)}`);
    });
  }
  return { seen, missing, dead: decl.filter((d) => !used.has(d)).map((d) => d.file) };
}
{
  const C = clientSources();
  const hc = hostCensus(C);
  console.log(`    ${hc.seen} client URL sites / ${LOCAL_ONLY.length} declared local-only`);
  ok(hc.seen >= 10, `the grep found the client URL sites (${hc.seen})`);
  ok(!hc.missing.length, 'every client URL to /api/file/raw, /api/download, /api/download-zip carries the file\'s machine (hq / _hp() / host) or is declared local-only', hc.missing);
  ok(!hc.dead.length, 'no dead local-only row', hc.dead);
  // lane viewer-download: the editor's Download goes through THE file-window helper (file-download.js) — its
  // target names the editor's machine, and the helper's URL is the census row that must carry it
  const ED = C['src/lib/code-editor.js'], DL = C['src/lib/file-download.js'];
  ok(/wireFileDownload\(winInfo, \{[^}]*\}, host: this\._host\b/.test(ED), 'the code editor\'s Download target carries this._host (the r2 rule, through the shared helper)');
  const DL_FIX = 'return `/api/download?path=${encodeURIComponent(path)}${hostParam(host)}`;';
  ok(DL.includes(DL_FIX), 'the shared helper\'s download URL carries the file\'s machine');
  const pre = hostCensus({ ...C, 'src/lib/file-download.js': DL.replace(DL_FIX, 'return `/api/download?path=${encodeURIComponent(path)}`;') });
  ok(pre.missing.some((m) => m.startsWith('src/lib/file-download.js')), 'control: the helper\'s URL without &host= ⇒ RED', pre.missing);
}

if (process.env.RAWNAME_PRINT_CENSUS) {
  console.log('\n| route | site | verdict | how named / why declared |\n|---|---|---|---|');
  for (const r of CENSUS) console.log(`| ${r.route} | ${r.file} | ${r.verdict} | ${r.how || r.why} |`);
}

for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(row.pass, row.name, row.detail);

console.log('⑨ lane artifacts-registries — the composer\'s upload (POST /api/upload naming its chat) reaches the artifacts registry');
{
  const REG = require(path.join(REPO, 'src/server/artifact-registry.js'));
  const N = require(path.join(REPO, 'src/normalizers.js'));
  const live = { backend: 'claude', cwd: DIR, host: '', _historyLoaded: true, _normalizer: N.createMessageManager('claude', 'u1') };
  REG.configure({ activeSessions: () => new Map([['u1', live]]), log: { log() {}, warn() {} } });
  const S = await serve(filesRouter, null);
  const up = async (name, sessionId) => {
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from('attached\n')]), name);
    fd.append('destDir', path.join(DIR, 'up'));
    fd.append('fileNames', JSON.stringify([name]));
    if (sessionId) fd.append('sessionId', sessionId);
    const r = await fetch(S.base + '/api/upload', { method: 'POST', body: fd });
    return r.json();
  };
  const j = await up('brief.pdf', 'u1');
  const k = ':' + path.join(DIR, 'up', 'brief.pdf');
  const row = live._artifacts && live._artifacts[k];
  ok(j.success && row && row.kind === 'upload' && row.by === 'user' && row.bytes === 9, 'an upload naming its chat ⇒ that conversation\'s `upload` row by: user (its size)', row);
  await up('loose.txt', '');
  ok(Object.keys(live._artifacts || {}).length === 1, 'a file-explorer upload (no chat named) feeds nothing');
  const cli = fs.readFileSync(path.join(REPO, 'src/lib/chat-input.js'), 'utf8'), ut = fs.readFileSync(path.join(REPO, 'src/lib/utils.js'), 'utf8');
  ok(cli.includes('sessionId: this._sessionId, // lane artifacts-registries') && ut.includes("if (sessionId) fd.append('sessionId', sessionId);"), 'the composer\'s upload names its chat (chat-input → uploadFilesBatched → the form\'s sessionId)');
  clearTimeout(live._artifactsTimer); await S.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

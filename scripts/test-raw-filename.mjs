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
import { pathToFileURL } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

const express = require('express');
const oracle = require('content-disposition'); // express's own dependency — an independent parser
const CD = require(path.join(REPO, 'src/file-disposition.js'));
const { RemoteFs } = require(path.join(REPO, 'src/remote-fs.js'));
const filesRouter = require(path.join(REPO, 'src/routes/files.js'));
const FILE_POOL = new (require(path.join(REPO, 'src/safe-fs.js')).SafeFs)({ poolSize: 1, name: 'test-raw-filename' });
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
  ok(verdictOf(T.every(([p, want]) => CD.fileNameOf(p) === want)), 'fileNameOf: the last POSIX segment, trailing slashes ignored, "" for a root', T.map(([p]) => CD.fileNameOf(p)));
  ok(CD.contentDisposition('') === null && CD.contentDisposition('\r\n\t') === null && CD.contentDisposition(null) === null, 'no name to give ⇒ null (the caller sends no header, exactly as before)');
  const a = CD.contentDisposition('photo.png');
  ok(a === `inline; filename="photo.png"; filename*=UTF-8''photo.png`, 'an ASCII name: inline + both forms, spelled exactly', a);
  ok(gateOf(CD.contentDisposition('x.pdf', 'attachment').startsWith('attachment; ')) && verdictOf(CD.contentDisposition('x.pdf', 'bogus').startsWith('inline; ')), 'type: attachment only when asked by name, else inline');
  const q = formsOf(CD.contentDisposition('it\'s (a)*.txt'));
  const qx = CD.extValue('it\'s (a)*.txt');
  ok(q.star === 'it\'s (a)*.txt' && gateOf(['%27', '%28', '%29', '%2A'].every((e) => qx.includes(e))) && !/['()*]/.test(qx), "`'()*` are percent-encoded in filename* (RFC 8187 attr-char) and decode back", qx);
  const lone = CD.contentDisposition('bad\uD800name.png');
  ok(gateOf(lone) && gateOf(validHeader(lone)) && formsOf(lone).star === 'bad�name.png', 'a lone surrogate becomes U+FFFD (encodeURIComponent would throw)', lone);
  for (const f of FIXTURES) {
    const h = CD.contentDisposition(f.name), g = formsOf(h);
    ok(gateOf(validHeader(h)) && g.type === 'inline' && g.star === f.star && g.ascii === f.ascii && g.parsed?.parameters?.filename === f.star,
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
async function serve(router, remoteFs, { json = false, locals = {} } = {}) {
  const app = express();
  Object.assign(app.locals, locals);   // r1066: a route's seam (the clipboard poll's shorter bound)
  if (json) app.use(express.json({ limit: '5mb' }));   // B-3767 ⑩: a JSON route (the real server parses bodies globally)
  app.set('env', 'test'); // finalhandler: no stack traces on the console for the expected 404s
  app.locals.getRemoteFs = () => remoteFs;
  // B-3b03 (lane hub-loop-stalls): the files router never runs an op in-main — a REAL one-worker pool, as server.js wires one
  app.locals.safeFs = FILE_POOL;
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
ok(gateOf(FILES_SRC.includes(LOCAL_NAMING)) && verdictOf(RFS_SRC.includes(REMOTE_NAMING)), 'the two naming lines the controls strip are present verbatim (else the controls would judge nothing)');
const filesCtl = M.load('src/routes/files.js', editAnchor(FILES_SRC, LOCAL_NAMING, "res.sendFile(filePath, { dotfiles: 'allow' });", "src/routes/files.js"), 'nolocalname');
const filesCtlPath = M.files[M.files.length - 1]; // a 404's development-mode stack names the module file: compare as if it were the real one
const asReal = (buf) => buf.toString('utf8').split(filesCtlPath).join(path.join(REPO, 'src/routes/files.js'));
const { RemoteFs: RemoteFsCtl } = M.load('src/remote-fs.js', editAnchor(RFS_SRC, REMOTE_NAMING, 'const inlineName = null;', "src/remote-fs.js"), 'noremotename');
// r2 controls: the pre-r2 attachment spellings (the raw name in filename="…") and files.js without the remoteStream belt
const ATTACH_R2 = "const attachName = attachment ? contentDisposition(fileNameOf(filePath), 'attachment') : null;\n    if (attachName) res.setHeader('Content-Disposition', attachName);";
const ATTACH_PRE = "if (attachment) res.setHeader('Content-Disposition', `attachment; filename=\"${path.basename(filePath).replace(/\"/g, '')}\"`);";
const ZIP_R2 = "const zipName = contentDisposition((base || 'archive') + '.zip', 'attachment'); // both forms, ASCII (a CJK folder name threw here)\n    if (zipName) res.setHeader('Content-Disposition', zipName);";
const ZIP_PRE = "res.setHeader('Content-Disposition', `attachment; filename=\"${base.replace(/\"/g, '')}.zip\"`);";
const BELT = "  try { return fn(); }\n  catch (e) {\n    if (!res.headersSent) { res.removeHeader('Content-Disposition'); res.status(502).json({ error: String((e && e.message) || e) }); }\n    else { try { res.end(); } catch { } }\n  }";
ok(gateOf(RFS_SRC.includes(ATTACH_R2)) && gateOf(RFS_SRC.includes(ZIP_R2)) && verdictOf(FILES_SRC.includes(BELT)), 'the r2 lines the controls replace are present verbatim');
const { RemoteFs: RemoteFsPre } = M.load('src/remote-fs.js', editAnchor(editAnchor(RFS_SRC, ATTACH_R2, ATTACH_PRE, "src/remote-fs.js"), ZIP_R2, ZIP_PRE, "src/remote-fs.js"), 'preattach');
const filesNoBelt = M.load('src/routes/files.js', editAnchor(FILES_SRC, BELT, '  return fn();', "src/routes/files.js"), 'nobelt');
// r2 (3) controls: the pre-r2 raw sendFile (send's legacy dotfile rule) and the pre-r2 ssh stream (pipe's default end, no 'error', no kill)
const filesNoDot = M.load('src/routes/files.js', editAnchor(FILES_SRC, LOCAL_NAMING, "res.sendFile(filePath, named ? { headers: { 'Content-Disposition': named } } : {});", "src/routes/files.js"), 'nodotfiles');
const STREAM_R2 = "this._streamChild(this._spawn(id, `cat ${shq(filePath)}`), res, { beforeBody: nameIt });";
const STREAM_PRE = "const child = this._spawn(id, `cat ${shq(filePath)}`);\n    child.stdout.once('data', nameIt);\n    child.stdout.pipe(res);\n    child.stderr.on('data', () => {});\n    child.on('close', (code) => { if (code !== 0 && !res.headersSent) res.status(404).end(); });";
ok(verdictOf(RFS_SRC.includes(STREAM_R2)), 'the r2 (3) stream line the control replaces is present verbatim');
const { RemoteFs: RemoteFsPreStream } = M.load('src/remote-fs.js', editAnchor(RFS_SRC, STREAM_R2, STREAM_PRE, "src/remote-fs.js"), 'prestream');
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
    ok(verdictOf(r.pass), `${JSON.stringify(f.name)}: 200, the bytes, ${f.type}, inline; filename="${f.ascii}"; filename*= the name`, r.detail);
  }
  {
    const f = FIXTURES[1];
    const r = await get(real.base, '/api/file/raw', path.join(DIR, f.name), { headers: { Range: 'bytes=0-7' } });
    ok(r.status === 206 && r.range === `bytes 0-7/${f.bytes.length}` && gateOf(r.body.equals(f.bytes.subarray(0, 8))) && formsOf(r.cd).star === f.star,
      'a Range request is still 206 with its Content-Range and its 8 bytes — and still named (a <video> seeks this way)', { status: r.status, range: r.range, cd: r.cd });
    const head = await fetch(`${real.base}/api/file/raw?path=${encodeURIComponent(path.join(DIR, FIXTURES[0].name))}`, { method: 'HEAD' });
    ok(head.status === 200 && formsOf(head.headers.get('content-disposition')).star === 'photo.png', 'HEAD answers the same name');
  }
  {
    const a = await get(real.base, '/api/file/raw', MISSING), b = await get(ctlLocal.base, '/api/file/raw', MISSING);
    ok(a.status === 404 && a.cd === null && a.status === b.status && a.type === b.type && a.body.toString('utf8') === asReal(b.body),
      'a missing file: 404, no name — byte-for-byte what the pre-fix route answers', { real: [a.status, a.cd, a.type], pre: [b.status, b.cd, b.type] });
    const d = await get(real.base, '/api/file/raw', HIDDEN), e = await get(real.base, '/api/download', HIDDEN), n = await get(noDot.base, '/api/file/raw', HIDDEN);
    ok(d.status === 200 && gateOf(d.body.equals(PNG)) && formsOf(d.cd).star === '.hidden.png' && formsOf(d.cd).type === 'inline' && e.status === 200 && formsOf(e.cd).parsed?.parameters?.filename === '.hidden.png',
      'r2: a dotfile (.hidden.png) is previewed and downloaded under its name — send\'s legacy dotfile rule made both a 404', { raw: [d.status, d.cd], download: [e.status, e.cd] });
    ok(n.status === 404, 'control: the raw route without dotfiles:\'allow\' ⇒ the dotfile is a 404 again (RED)', [n.status]);
  }

  // ── ③ REMOTE ──
  for (const [label, srv, host] of [['ssh (the real RemoteFs, `_spawn` running the same `cat` here)', realSsh, 'box'], ['dial (the real RemoteFs, a fake device running `cat` here)', realDial, 'dev']]) {
    console.log(`③ GET /api/file/raw?host= — ${label}`);
    for (const f of FIXTURES) {
      const r = await namedLeg(srv.base, f, host);
      ok(verdictOf(r.pass), `${JSON.stringify(f.name)}: 200, the bytes, inline; filename="${f.ascii}"; filename*= the name`, r.detail);
    }
  }
  console.log('③b a missing file / folder, an empty file, a failed spawn, a viewer that leaves');
  for (const [label, srv, host] of [['ssh', realSsh, 'box'], ['dial', realDial, 'dev']]) {
    const r = await get(srv.base, '/api/file/raw', MISSING, { host }), d = await get(srv.base, '/api/download', MISSING, { host }), z = await get(srv.base, '/api/download-zip', MISSING_DIR, { host });
    ok(gateOf([r, d, z].every((x) => x.status === 404 && x.cd === null && x.body.length === 0)) && z.type === null,
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
    ok(verdictOf(uncaught.slice(u0).includes('ENOENT')), `control: the pre-r2 ssh stream + no ssh binary ⇒ an UNCAUGHT 'error' (in the server: uncaughtException ⇒ process.exit(1)) — answered ${bp.status} (RED)`, { status: bp.status, uncaught: uncaught.slice(u0) });
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
    ok(verdictOf(a.ended), `a viewer that leaves mid-stream (32 MB file, aborted after the first chunk) ⇒ the child is ended (${a.signal})`, a);
    ok(!b.ended, 'control: the pre-r2 ssh stream ⇒ the child is STILL blocked 2 s later (an unpiped stdout — one leaked process per aborted seek) (RED)', b);
  }

  // ── ④ the ATTACHMENT routes ──
  console.log('④ GET /api/download + /api/download-zip — ASCII and CJK names, every transport');
  const isZip = (want) => (b) => b.subarray(0, 2).toString() === 'PK' && b.includes(Buffer.from(want));
  {
    const f = FIXTURES[0];
    const a = await get(real.base, '/api/download', path.join(DIR, f.name)), b = await get(ctlLocal.base, '/api/download', path.join(DIR, f.name));
    ok(a.status === 200 && a.cd === b.cd && verdictOf(/^attachment; filename="photo\.png"$/.test(a.cd || '')), 'local /api/download: res.download\'s attachment header, exactly as before', { real: a.cd, pre: b.cd });
    for (const g of [FIXTURES[1], FIXTURES[3]]) {
      const r = await get(real.base, '/api/download', path.join(DIR, g.name));
      // express's res.download (untouched) percent-encodes a CR rather than dropping it, so its filename* is the on-disk name
      ok(verdictOf(attachOk(r, g.name, (x) => x.equals(g.bytes))), `local /api/download ${JSON.stringify(g.name)}: 200, attachment, the name (res.download)`, { status: r.status, cd: r.cd });
    }
    const z = await get(real.base, '/api/download-zip', ZIPDIR);
    ok(verdictOf(attachOk(z, '报告 2026.zip', isZip('报告 2026/说明.txt'))), 'local /api/download-zip "报告 2026": 200, attachment, "报告 2026.zip", a real zip holding 报告 2026/说明.txt', { status: z.status, cd: z.cd, bytes: z.body.length });
  }
  for (const [label, srv, host] of [['ssh', realSsh, 'box'], ['dial', realDial, 'dev']]) {
    for (const g of FIXTURES) {
      const r = await get(srv.base, '/api/download', path.join(DIR, g.name), { host });
      const fb = formsOf(r.cd).ascii;
      // (lane wall-clock-ratchet-down: the old `r.ms < 5000` judged the machine — the 200 with every byte IS the answer;
      // a hang reads `no answer` at the helper's cut; the ms are information)
      ok(gateOf(attachOk(r, g.star, (x) => x.equals(g.bytes))) && fb === g.ascii, `remote (${label}) /api/download ${JSON.stringify(g.name)}: answered 200, attachment; filename="${g.ascii}"; filename*= the name, the bytes`, { status: r.status, cd: r.cd, ms: r.ms });
    }
    const z = await get(srv.base, '/api/download-zip', ZIPDIR, { host });
    ok(gateOf(attachOk(z, '报告 2026.zip', isZip('报告 2026/说明.txt'))) && formsOf(z.cd).ascii === '__ 2026.zip', `remote (${label}) /api/download-zip "报告 2026": answered 200, attachment; filename="__ 2026.zip"; filename*="报告 2026.zip", a real zip`, { status: z.status, cd: z.cd, bytes: z.body.length });
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
    // (lane wall-clock-ratchet-down: the old `b1.ms < 1000` judged the machine — a 502 is an ANSWER, where the copies
    // above read `no answer` at the same 2 s cut)
    ok(b1.status === 502 && b2.status === 502 && b1.cd === null && !attachOk(b1, g.star, () => true),
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
  { file: 'src/server/frame-host.js', has: 'res.sendFile(path.relative(f.dir, real), { root: f.dir', route: 'GET /frame-host/f/:tok/*', verdict: 'declared', why: 'path-addressed: the code editor HTML preview\'s folder (lane frame-host-preview) — the URL ENDS in the file\'s own name (a previewed page\'s own stylesheet / script / picture), so a save is named by it' },
  { file: 'src/routes/chat-attachments.js', has: 'rs.pipe(base64Decoder()).pipe(res);', route: 'GET /api/chat-picture/:tx/:key/:n', verdict: 'declared', why: 'a picture drawn by <img src> in the chat, read from the record it came in (lane chat-attachments-persist, the cut) — never a download; nosniff, a picture type from the closed table' },
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
  { file: 'src/server/loop-holds.js', has: 'st.pipe(res); });', route: 'GET /api/loop-holds/cpu-profiles/:name', verdict: 'named', how: 'attachment — contentDisposition(name): the name is one of ours (CC.FILE_RE, ASCII by construction)' },
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
  ok(verdictOf(stripped.unverified.some((u) => /\/api\/file\/raw \(this machine\)/.test(u))) || verdictOf(stripped.dead.some((d) => /\/api\/file\/raw \(this machine\)/.test(d))), 'control: files.js with the local naming stripped ⇒ the census is RED on /api/file/raw', stripped);
  const planted = census({ ...S, 'src/routes/files.js': S['src/routes/files.js'] + "\nrouter.get('/api/file/thumb', (req, res) => { res.sendFile(safePath(req.query.path)); });\n" });
  ok(verdictOf(planted.unclassified.some((u) => /res\.sendFile\(safePath/.test(u))), 'control: a planted nameless route ⇒ the census is RED (an unclassified site)', planted.unclassified);
  globalThis.__census = CENSUS;
}
// ⑥b (lane outbox-attachment-preview): the DRAFT's attachment route answers with `res.end(bytes)` — no stream site the
// census above sees — and the viewer now reads it by URL: its bytes are named by THE builder (inline for a picture's
// ?inline=1, attachment otherwise, both forms), typed by the STORED record (never the name), nosniff + a sandbox CSP.
{
  const src = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf8');
  const at = src.indexOf("router.get('/api/channels/outbox/:id/attachment/:n'");
  const span = at < 0 ? '' : src.slice(at, src.indexOf('\nrouter.', at + 10));
  ok(gateOf(span.includes("contentDisposition(name, inline ? 'inline' : 'attachment')")) && verdictOf(span.includes("const name = String(r.meta.name || 'attachment');")), '⑥b GET /api/channels/outbox/:id/attachment/:n names its bytes through contentDisposition (inline ?inline=1 picture / attachment, both forms)', span.slice(0, 120));
  ok(gateOf(span.includes("const mime = String(r.meta.mime || '').toLowerCase();")) && gateOf(span.includes("res.setHeader('X-Content-Type-Options', 'nosniff');")) && verdictOf(span.includes("res.setHeader('Content-Security-Policy', \"default-src 'none'; sandbox\");")), '⑥b … its type is the STORED record\'s (never sniffed from the name), nosniff, sandbox CSP — peer bytes never run in our origin');
  const h = CD.contentDisposition('季度 报告.md', 'attachment'), f = formsOf(h);
  ok(gateOf(h.startsWith('attachment; ')) && gateOf(f.ascii) && f.star === '季度 报告.md', '⑥b … a CJK attachment name reaches a save in both forms', h);
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
  ok(verdictOf(planted.raw.some((r) => r.startsWith('src/remote-fs.js') && /path\.basename\(filePath\)/.test(r))), 'control: the pre-r2 remote spelling (the raw name in filename="…") planted back ⇒ RED', planted.raw);
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
  ok(verdictOf(/wireFileDownload\(winInfo, \{[^}]*\}, host: this\._host\b/.test(ED)), 'the code editor\'s Download target carries this._host (the r2 rule, through the shared helper)');
  const DL_FIX = 'return `/api/download?path=${encodeURIComponent(path)}${hostParam(host)}`;';
  ok(verdictOf(DL.includes(DL_FIX)), 'the shared helper\'s download URL carries the file\'s machine');
  const pre = hostCensus({ ...C, 'src/lib/file-download.js': DL.replace(DL_FIX, 'return `/api/download?path=${encodeURIComponent(path)}`;') });
  ok(verdictOf(pre.missing.some((m) => m.startsWith('src/lib/file-download.js'))), 'control: the helper\'s URL without &host= ⇒ RED', pre.missing);
}

if (process.env.RAWNAME_PRINT_CENSUS) {
  console.log('\n| route | site | verdict | how named / why declared |\n|---|---|---|---|');
  for (const r of CENSUS) console.log(`| ${r.route} | ${r.file} | ${r.verdict} | ${r.how || r.why} |`);
}

for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(verdictOf(row.pass), row.name, row.detail);

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
    fd.append('uploadDirSet', '1');   // lane chat-attachments-persist: a chosen folder — a scratch dir under /tmp is otherwise kept with the conversation
    // B-3767: a bound of its own — an upload that never answers (multer could not write its temp folder, the second test
    // machine's 600 s hang) ends here, by name
    try { const r = await fetch(S.base + '/api/upload', { method: 'POST', body: fd, signal: AbortSignal.timeout(15000) }); return await r.json(); }
    catch (e) { return { success: false, noAnswer: `the upload did not answer in 15 s (${e.name}) — the route must answer every upload, a refusal by name` }; }
  };
  const j = await up('brief.pdf', 'u1');
  const k = ':' + path.join(DIR, 'up', 'brief.pdf');
  const row = live._artifacts && live._artifacts[k];
  ok(gateOf(j.success) && gateOf(row) && row.kind === 'upload' && row.by === 'user' && row.bytes === 9, 'an upload naming its chat ⇒ that conversation\'s `upload` row by: user (its size)', j.noAnswer || row);
  await up('loose.txt', '');
  ok(Object.keys(live._artifacts || {}).length === 1, 'a file-explorer upload (no chat named) feeds nothing');
  const cli = fs.readFileSync(path.join(REPO, 'src/lib/chat-input.js'), 'utf8'), ut = fs.readFileSync(path.join(REPO, 'src/lib/utils.js'), 'utf8');
  ok(gateOf(cli.includes('sessionId: this._sessionId, // lane artifacts-registries')) && verdictOf(ut.includes("if (sessionId) fd.append('sessionId', sessionId);")), 'the composer\'s upload names its chat (chat-input → uploadFilesBatched → the form\'s sessionId)');
  clearTimeout(live._artifactsTimer); await S.close();
}

console.log('⑩ B-3767 — the upload\'s temp folder is THIS hub\'s own (src/server/hub-tmp.js), and one it cannot use is said by name');
{
  const HT = require(path.join(REPO, 'src/server/hub-tmp.js'));
  const uid = process.getuid(), DATA = path.join(REPO, 'data');
  const T = path.join(DIR, 'tmp10'); fs.mkdirSync(T, { recursive: true });
  const prevTmp = process.env.TMPDIR; process.env.TMPDIR = T;   // os.tmpdir() reads it at each call: the hub's root lands in this scratch
  const S = await serve(filesRouter, null, { json: true });
  const post = async () => {
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from('ten\n')]), 'ten.txt'); fd.append('destDir', path.join(DIR, 'up10')); fd.append('fileNames', JSON.stringify(['ten.txt'])); fd.append('uploadDirSet', '1');
    try { const r = await fetch(S.base + '/api/upload', { method: 'POST', body: fd, signal: AbortSignal.timeout(15000) }); return { status: r.status, j: await r.json() }; } catch (e) { return { status: 'no answer', j: { error: e.name } }; }
  };
  try {
    const root = HT.hubTmpRoot({ dataDir: DATA, tmpRoot: T, uid });
    const a = await post();
    const mode = (() => { try { return fs.statSync(path.join(root, 'uploads')).mode & 0o777; } catch { return null; } })();
    ok(a.status === 200 && gateOf(a.j.success) && gateOf(fs.existsSync(path.join(DIR, 'up10', 'ten.txt'))) && mode === 0o700,
      `B-3767: an upload's temp lands in the hub's own folder ${path.basename(root)}/uploads (0700, keyed by user and data folder), never a machine-wide name: ${JSON.stringify({ status: a.status, mode: mode && mode.toString(8) })}`);
    fs.rmSync(path.join(root, 'uploads'), { recursive: true, force: true });
    fs.symlinkSync(path.join(DIR, 'elsewhere10'), path.join(root, 'uploads'));
    const b = await post();
    ok(b.status === 500 && b.j.code === 'hub_tmp_refused' && gateOf(b.j.error.includes(path.join(root, 'uploads'))) && gateOf(/SYMLINK/.test(b.j.error)) && verdictOf(/the way out: .*TMPDIR/.test(b.j.error)),
      `B-3767: a temp folder the hub cannot use (here a link) is the upload's answer BY NAME, with the path and the way out — never a hang: ${JSON.stringify(b)}`);
    const st = (o) => ({ isSymbolicLink: () => !!o.link, isDirectory: () => o.dir !== false, uid: o.uid ?? uid, mode: o.mode ?? 0o40700 });
    ok(gateOf(/owned by uid/.test(HT.ownVerdict(st({ uid: uid + 1 }), { uid }))) && !/socket/.test(HT.ownVerdict(st({ uid: uid + 1 }), { uid })) && gateOf(/group\/other/.test(HT.ownVerdict(st({ mode: 0o40777 }), { uid }))) && gateOf(/group\/other/.test(HT.ownVerdict(st({ mode: 0o40755 }), { uid }))) && gateOf(/not a directory/.test(HT.ownVerdict(st({ dir: false }), { uid }))) && HT.ownVerdict(st({}), { uid }) === null,
      "B-3767: the verdict (sock-path's own) refuses another user's folder, one open to others (0777 and 0755 alike), and a file; this user's private folder passes");
    // «open in editor»: the hub names its own temp file (POST /api/file/temp) — a plain name only; a folder it cannot use, by name
    const tmpFile = async (body) => { const r = await fetch(S.base + '/api/file/temp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }); return { status: r.status, j: await r.json() }; };
    const e1 = await tmpFile({ name: 'chat-block-1.txt', content: 'the block' });
    ok(e1.status === 200 && e1.j.path === path.join(root, 'editor', 'chat-block-1.txt') && fs.readFileSync(e1.j.path, 'utf8') === 'the block', `B-3767: POST /api/file/temp writes into the hub's own editor folder and answers the path: ${JSON.stringify(e1)}`);
    const e2 = await tmpFile({ name: '../escape.txt', content: 'x' });
    ok(e2.status === 400 && e2.j.code === 'bad_name' && !fs.existsSync(path.join(root, 'escape.txt')), `B-3767: …a name that is not a plain file name is refused (${e2.status} ${e2.j.code})`);
    fs.rmSync(path.join(root, 'editor'), { recursive: true, force: true }); fs.symlinkSync(path.join(DIR, 'elsewhere10e'), path.join(root, 'editor'));
    const e3 = await tmpFile({ name: 'chat-block-2.txt', content: 'x' });
    ok(e3.status === 500 && e3.j.code === 'hub_tmp_refused' && gateOf(e3.j.error.includes(path.join(root, 'editor'))) && verdictOf(/the way out: .*TMPDIR/.test(e3.j.error)), `B-3767: …and a folder it cannot use is its answer by name, with the path: ${JSON.stringify(e3)}`);
    const cr = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8');
    ok(gateOf(cr.includes("fetch('/api/file/temp'")) && !cr.includes("'/tmp/claude-webui") && verdictOf(cr.includes(".then((tmpPath) => {")), "B-3767: the client asks the hub for its temp file and opens the path the hub answered (it spells no /tmp folder)");   // stale-pins: kept — an absence check: the client spells no /tmp folder
    ok(HT.hubTmpRoot({ dataDir: '/a/data', tmpRoot: '/t', uid: 7 }) !== HT.hubTmpRoot({ dataDir: '/b/data', tmpRoot: '/t', uid: 7 }) && HT.hubTmpRoot({ dataDir: '/a/data', tmpRoot: '/t', uid: 7 }) !== HT.hubTmpRoot({ dataDir: '/a/data', tmpRoot: '/t', uid: 8 }),
      'B-3767: two hubs (two data folders) and two users never share a folder');
    // B-3767 unit 2 (主开发 11:40Z, B-4371): THE AGE SWEEP OF THE HUB'S OWN ROOT — in its purposes an old file goes and a fresh one
    // stays, a link is removed as a link (its target kept), a purpose folder that is not ours is skipped and said (nothing behind
    // it touched), and nothing outside the root is ever looked at. RED control: the sweep without the purpose judgment deletes
    // through a planted link.
    {
      const SR = path.join(DIR, 'sweep10'), dataX = '/srv/x/data', uidX = process.getuid();
      const rootX = HT.hubTmpRoot({ dataDir: dataX, tmpRoot: SR, uid: uidX });
      const OLD = (Date.now() - 48 * 3600 * 1000) / 1000;
      const mk = (f, body = 'x', old = true) => { fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 }); fs.writeFileSync(f, body); if (old) fs.utimesSync(f, OLD, OLD); return f; };
      fs.mkdirSync(rootX, { recursive: true, mode: 0o700 }); fs.chmodSync(rootX, 0o700);
      const oldUp = mk(path.join(rootX, 'uploads', 'old-upload.bin')), freshUp = mk(path.join(rootX, 'uploads', 'fresh.bin'), 'x', false);
      const target = mk(path.join(SR, 'outside', 'target.txt')), link = path.join(rootX, 'editor', 'old-link');
      fs.mkdirSync(path.dirname(link), { recursive: true, mode: 0o700 }); fs.symlinkSync(target, link); fs.lutimesSync(link, OLD, OLD);
      const victim = mk(path.join(SR, 'victim', 'old-in-victim.bin')); fs.symlinkSync(path.dirname(victim), path.join(rootX, 'paste'));
      const sharedOld = mk(path.join(SR, 'claude-paste-1.png'));   // in the shared temp folder, not in the root
      for (const d of [path.join(rootX, 'uploads'), path.join(rootX, 'editor')]) fs.chmodSync(d, 0o700);
      const r = await HT.sweepHubTmp({ dataDir: dataX, tmpRoot: SR, uid: uidX });
      const there = (f) => { try { fs.lstatSync(f); return true; } catch { return false; } };
      ok(!there(oldUp) && gateOf(there(freshUp)) && !there(link) && gateOf(there(target)) && gateOf(there(victim)) && gateOf(there(sharedOld)) && r.refused.length === 1 && gateOf(r.refused[0].includes(path.join(rootX, 'paste'))) && verdictOf(/SYMLINK/.test(r.refused[0])),
        `B-3767 unit 2: the age sweep of the hub's own root — the old upload and the old link go (the link's target stays), the fresh file stays, a planted purpose folder is refused by name and nothing behind it is touched, the shared temp folder is never looked at: ${JSON.stringify({ removed: r.removed.length, kept: r.kept, refused: r.refused })}`);
      const htSrc = fs.readFileSync(path.join(REPO, 'src/server/hub-tmp.js'), 'utf8'), JUDGE = '    if (!(await own(d))) continue;\n';
      const victim2 = mk(path.join(SR, 'victim', 'old-in-victim-2.bin'));
      const HT0 = M.load('src/server/hub-tmp.js', editAnchor(htSrc, JUDGE, '', "src/server/hub-tmp.js"), 'nojudge');
      await HT0.sweepHubTmp({ dataDir: dataX, tmpRoot: SR, uid: uidX });
      ok(gateOf(htSrc.includes(JUDGE)) && !there(victim2), `CONTROL B-3767 unit 2: without the purpose judgment the sweep deletes through the planted link (red): ${there(victim2) ? 'kept' : 'deleted'}`);
      const filesSrc = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
      ok(gateOf(/sweepOwnTmp\(\); upload\.array\('files'\)/.test(filesSrc)) && (filesSrc.match(/\n\s+sweepOwnTmp\(\);\n/g) || []).length === 2,
        'B-3767 unit 2: the roads that write into the root ask the sweep (upload, temp file, paste) — throttled, never awaited');
    }
    // B-5527 (主开发 r590 — one release after B-3767): THE PASTE SWEEP'S LEGACY LEG IS RETIRED. It deleted claude-paste-* files older
    // than a day BY NAME PREFIX over the SHARED temp folder, which reached a sibling scratch hub's files. A paste through the REAL route
    // (this machine) lands in the hub's own folder and leaves an old paste-named file in the shared temp folder alone; it reads that folder
    // not at all. Judged at the moment the route's own write resolves — where the retired leg began its read of the shared folder — then
    // the request is let go (the clipboard step's poll is not this leg's). RED: a copy with the legacy leg back deletes it.
    {
      const okP = (c, n, facts) => { ok(verdictOf(c), n, facts); if (c) console.log('      ' + JSON.stringify(facts)); };
      // K65 (主开发 r1058 — the integrator's watcher found a real xclip left by this leg on the hub box): A SUITE NEVER TOUCHES A
      // DISPLAY'S CLIPBOARD AND NEVER STARTS THE REAL CLIPBOARD PROGRAM. The route starts `cat <file> | xclip -selection clipboard
      // -t <type>` and polls `xclip … -o`, both with the hub's env (its PATH; DISPLAY = the probed one, else the inherited one,
      // else ':0'). So before any paste the leg plants a STAND-IN `xclip` FIRST on the suite's own search path — it records its
      // arguments, its standard input and the DISPLAY it was handed, answers a TARGETS read with the type it holds, and exits —
      // names a display that cannot exist (no socket) and no cookie, and judges the route by the record. A paste whose path does
      // not resolve `xclip` to the stand-in is REFUSED BY NAME before any request (never a fall-through to the real program)
      const CLIP = path.join(DIR, 'clip-standin'), CLIP_REC = path.join(CLIP, 'rec'), STANDIN = path.join(CLIP, 'xclip');
      fs.mkdirSync(CLIP_REC, { recursive: true });
      // displays that cannot exist (no socket): the suite's own, and one per r1090 leg the stand-in answers by (keyed by the DISPLAY
      // the route hands it — each such leg on its own server, its xEnv naming it)
      const [NO_DISPLAY, NEVER_D, NODISP_D, HELPER_D, NOPROG_D] = (() => { const out = []; for (let n = 60001; n < 61000 && out.length < 5; n++) if (!fs.existsSync(`/tmp/.X11-unix/X${n}`)) out.push(`:${n}`); while (out.length < 5) out.push(`:${65530 - out.length}`); return out; })();
      fs.writeFileSync(STANDIN, [
        '#!/bin/sh',
        "# test-raw-filename's stand-in for xclip (K65): it records what it was given and exits — it never opens a display",
        `REC='${CLIP_REC}'`,
        // r1066: a placed SLOW read marks its start and its end around the sleep; a NEVER read answers no picture
        // r1090: on NEVER_D a read answers no picture; on NODISP_D it says what the real program says when a display cannot be opened
        `case " $* " in *" -o "*) n=$$; if [ -f "$REC/slow" ]; then : > "$REC/o-start-$n"; sleep "$(cat "$REC/slow")"; : > "$REC/o-end-$n"; fi; [ "$DISPLAY" = "${NEVER_D}" ] && exit 0; [ "$DISPLAY" = "${NODISP_D}" ] && { echo "Error: Can't open display: $DISPLAY" >&2; exit 1; }; [ -f "$REC/type" ] && cat "$REC/type"; exit 0;; esac`,
        'n=$$',
        'printf \'%s\\n\' "$@" > "$REC/args-$n"',
        'printf \'%s\' "$DISPLAY" > "$REC/display-$n"',
        'cat > "$REC/stdin-$n"',
        'for a in "$@"; do case "$a" in image/*) printf \'TARGETS\\n%s\\n\' "$a" > "$REC/type";; esac; done',
        ': > "$REC/done-$n"',
        'exit 0', ''].join('\n'), { mode: 0o755 });
      const firstOnPath = (name, p) => { for (const d of String(p || '').split(':').filter(Boolean)) { const f = path.join(d, name); try { fs.accessSync(f, fs.constants.X_OK); return f; } catch { } } return null; };
      const clipGuard = (p, { none = false } = {}) => { const f = firstOnPath('xclip', p); return f === STANDIN || (none && f === null) ? { ok: true } : { ok: false, refused: `REFUSED: the xclip first on the suite's search path is ${f || 'none'}, not the suite's stand-in (${STANDIN}) — the paste leg never runs the real clipboard program` }; };
      const records = () => fs.readdirSync(CLIP_REC).filter((f) => f.startsWith('done-')).map((f) => f.slice(5));
      const recordOf = (n) => ({ args: fs.readFileSync(path.join(CLIP_REC, `args-${n}`), 'utf8').split('\n').filter(Boolean), display: fs.readFileSync(path.join(CLIP_REC, `display-${n}`), 'utf8'), stdin: fs.readFileSync(path.join(CLIP_REC, `stdin-${n}`)) });
      const envWas = { PATH: process.env.PATH, DISPLAY: process.env.DISPLAY, XAUTHORITY: process.env.XAUTHORITY };
      process.env.PATH = `${CLIP}:${envWas.PATH || '/usr/bin:/bin'}`; process.env.DISPLAY = NO_DISPLAY; process.env.XAUTHORITY = path.join(CLIP, 'no-such-cookie');
      const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
      const OLD2 = (Date.now() - 48 * 3600 * 1000) / 1000;
      const plant = (n) => { const f = path.join(T, n); fs.writeFileSync(f, 'a legacy paste of another hub'); fs.utimesSync(f, OLD2, OLD2); return f; };
      const pasteOnce = async (base) => {
        const g = clipGuard(process.env.PATH);
        if (!g.ok) return { refused: g.refused, file: null, reads: [] };   // K65: never a paste the real program could answer
        const before = new Set(records());
        const reads = [], P = fs.promises, origW = P.writeFile, origR = P.readdir;
        let wrote; const landed = new Promise((r) => { wrote = r; });
        P.readdir = function (d, ...a) { reads.push(path.resolve(String(d))); return origR.call(this, d, ...a); };
        P.writeFile = async function (f, ...a) { const r = await origW.call(this, f, ...a); if (/claude-paste-\d+\.png$/.test(String(f))) setImmediate(() => wrote(String(f))); return r; };
        const ac = new AbortController();
        const req = fetch(base + '/api/paste-image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dataUrl: PNG }), signal: ac.signal }).catch(() => null);
        let out;
        try { const f = await Promise.race([landed, new Promise((r) => setTimeout(() => r(null), 10000))]); out = { file: f, reads: [...reads] }; }
        finally { P.writeFile = origW; P.readdir = origR; ac.abort(); await req; }
        // K65: the route judged by what the STAND-IN recorded (its clipboard step runs on after the request is let go)
        const t0 = Date.now(); let fresh = [];
        while (!(fresh = records().filter((n) => !before.has(n))).length && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 20));
        out.clip = fresh.length ? recordOf(fresh[0]) : null; out.clipRuns = fresh.length;
        return out;
      };
      const there = (f) => { try { fs.lstatSync(f); return true; } catch { return false; } };
      const legacy = plant('claude-paste-1700000000000.png');
      const a1 = await pasteOnce(S.base);
      okP(!!a1.file && path.dirname(a1.file) === path.join(root, 'paste') && there(legacy) && !a1.reads.includes(path.resolve(T)),
        'B-5527: a paste through the REAL route lands in the hub\'s own paste folder and leaves an old paste-named file in the SHARED temp folder alone — it never reads that folder',
        { pasteLanded: a1.file && path.relative(T, a1.file), legacyKept: there(legacy), sharedFolderRead: a1.reads.includes(path.resolve(T)) });
      const PNG_BYTES = Buffer.from(PNG.split(',')[1], 'base64');
      ok(!!a1.clip && a1.clipRuns === 1 && JSON.stringify(a1.clip.args) === JSON.stringify(['-selection', 'clipboard', '-t', 'image/png']) && gateOf(a1.clip.stdin.equals(PNG_BYTES)) && a1.clip.display === NO_DISPLAY,
        `K65: the route's clipboard step reached the suite's STAND-IN, never the real xclip — «-selection clipboard -t image/png», the pasted image's bytes on its input, and the display the suite named (${NO_DISPLAY}: no such display) — and the stand-in exited`,
        a1.clip ? { args: a1.clip.args, bytes: a1.clip.stdin.length, display: a1.clip.display } : { clipRuns: a1.clipRuns });
      {
        const withoutStandIn = process.env.PATH.split(':').filter((d) => d !== CLIP).join(':');
        const g0 = clipGuard(withoutStandIn), envPath = process.env.PATH;
        process.env.PATH = withoutStandIn;
        let r0; try { r0 = await pasteOnce(S.base); } finally { process.env.PATH = envPath; }
        ok(!g0.ok && gateOf(/^REFUSED: the xclip first on the suite's search path is .*, not the suite's stand-in \(/.test(g0.refused)) && r0.refused === g0.refused && r0.file === null,
          'K65 CONTROL: with the stand-in taken off the search path the paste leg REFUSES BY NAME before any request — it never falls through to the real clipboard program', r0.refused || r0);
      }
      // r1066 (主开发 — the K65 find, now a unit; B-323e's family): THE CLIPBOARD'S POLL NEVER HOLDS THE HUB'S LOOP. The route asks
      // the clipboard through the hub's STARTER (a small process), awaited — never a synchronous child. A placed SLOW stand-in (its
      // TARGETS read sleeps SLOW_S, under the read's own 1 s bound): while that read is in flight the loop TURNS — evidence by ORDER
      // (a loop turn lands after the read's start and before its end), no clock bound. RED: a copy with today's synchronous call.
      // And what the person is told when the clipboard never takes the picture: said BY NAME (it was a silent `ready: false`)
      const SLOW_S = '0.6';
      const flag = (n, v) => { const f = path.join(CLIP_REC, n); if (v == null) fs.rmSync(f, { force: true }); else fs.writeFileSync(f, String(v)); };
      const marks = (pre) => fs.readdirSync(CLIP_REC).filter((f) => f.startsWith(pre)).map((f) => f.slice(pre.length));
      const pasteAnswer = async (base) => {
        const g = clipGuard(process.env.PATH, { none: true });
        if (!g.ok) return { refused: g.refused };
        try { const r = await fetch(base + '/api/paste-image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dataUrl: PNG }), signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return { error: 'no answer: ' + (e && e.name) }; }
      };
      const loopScene = async (base) => {
        flag('slow', SLOW_S);
        try {
          const before = new Set(marks('o-start-'));
          const answer = pasteAnswer(base);
          let started = null; const t0 = Date.now();
          while (!(started = marks('o-start-').find((n) => !before.has(n))) && Date.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 10));
          const turnedInFlight = started ? await new Promise((r) => setImmediate(() => r(!fs.existsSync(path.join(CLIP_REC, 'o-end-' + started))))) : false;
          return { started: !!started, turnedInFlight, answer: await answer };
        } finally { flag('slow', null); }
      };
      // r1090: THE STARTER, COUNTED — the real starter wrapped (src/server/child-starter.js's own seam): every read the route asks is
      // counted by the display it names (order evidence: «no second read»), and on HELPER_D the starter answers that it could not
      // ask at all (a placed helper fault) — never a real program on any of them
      const CS = require(path.join(REPO, 'src/server/child-starter.js'));
      const realStarter = CS.createChildStarter(), reads = [];
      CS.setChildStarter({ run: (cmd, args, o) => { const d = (o && o.env && o.env.DISPLAY) || ''; if (cmd === 'xclip') reads.push(d); if (d === HELPER_D) return Promise.resolve({ unknown: true, why: 'the suite\'s placed helper fault' }); return realStarter.run(cmd, args, o); }, stats: () => realStarter.stats(), closePipe: () => realStarter.closePipe() });
      const POLL_LOCALS = { clipboardPollMs: 400 };   // the route's own seam: the poll's bound in this suite (the product's is 5 s)
      const SC = await serve(filesRouter, null, { json: true, locals: POLL_LOCALS });
      try {
        const L1 = await loopScene(SC.base);
        ok(gateOf(L1.started) && L1.turnedInFlight === true && !!L1.answer && L1.answer.ready === true,
          'r1066: while the clipboard\'s read is in flight (a placed slow stand-in) the hub\'s loop TURNS — the read runs in the starter\'s small process, awaited; the paste then answers ready as before', L1);
        // the three named failures that wait the poll's bound — at once, each on its own server (its display keys the stand-in / the starter)
        const own = async (d) => { const X = await serve(filesRouter, null, { json: true, locals: { ...POLL_LOCALS, xEnv: { DISPLAY: d } } }); try { return await pasteAnswer(X.base); } finally { await X.close(); } };
        const [n1, nd, nh] = await Promise.all([own(NEVER_D), own(NODISP_D), own(HELPER_D)]);
        ok(!!n1 && n1.ready === false && n1.code === 'clipboard_not_taken' && n1.error === 'the clipboard did not take the picture in time' && typeof n1.path === 'string',
          'r1066: a picture the clipboard never takes is ANSWERED BY NAME within the poll\'s bound (code + words the terminal says) — it was a silent «ready: false»', n1);
        ok(!!nd && nd.ready === false && nd.code === 'clipboard_no_display' && nd.error === `the display ${NODISP_D} could not be opened for the clipboard`,
          'r1090: a display the clipboard program cannot open (the stand-in says what xclip says) is answered by THAT name, the display in its words', nd);
        ok(!!nh && nh.ready === false && nh.code === 'clipboard_no_helper' && verdictOf(/^could not ask the clipboard \(the helper process did not answer\) — paste again$/.test(nh.error || '')),
          'r1090: when the starter could not ask at all the person is told THAT — never «the clipboard did not take the picture»', nh);
        // the clipboard program missing: a search path holding bash and cat only — nothing named xclip anywhere, so no real program can answer
        const NOBIN = path.join(DIR, 'nobin'); fs.mkdirSync(NOBIN, { recursive: true });
        for (const b of ['bash', 'cat']) { const real = firstOnPath(b, envWas.PATH || '/usr/bin:/bin'); if (real && !fs.existsSync(path.join(NOBIN, b))) fs.symlinkSync(real, path.join(NOBIN, b)); }
        let reprobes = 0;
        const SN = await serve(filesRouter, null, { json: true, locals: { ...POLL_LOCALS, xEnv: { DISPLAY: NOPROG_D }, refreshXEnv: () => { reprobes++; } } });
        const pathNow = process.env.PATH; process.env.PATH = NOBIN;
        let n2; try { n2 = await pasteAnswer(SN.base); } finally { process.env.PATH = pathNow; await SN.close(); }
        const noProgReads = reads.filter((d) => d === NOPROG_D).length;
        ok(!!n2 && n2.ready === false && n2.code === 'clipboard_no_program' && gateOf(/^the clipboard program is not installed/.test(n2.error || '')) && noProgReads === 1 && reprobes === 0,
          'r1090: with no clipboard program on the machine the answer names THAT AT ONCE — the first read\'s answer: no second read is started, no re-probe (by order: one read counted, the re-probe never called)', { n2, reads: noProgReads, reprobes });
      } finally { await SC.close(); CS.setChildStarter(null); realStarter.closePipe(); }
      // r1090: THE TERMINAL WORDS EVERY CODE THE ROUTE ANSWERS — each code the route can answer has its branch and its sentence in the
      // three dictionaries (a dropped branch, or a code with no sentence, is red by name)
      {
        const FSRCC = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8'), TERM = fs.readFileSync(path.join(REPO, 'src/lib/terminal.js'), 'utf8');
        const ZHD = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, JAD = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
        const codes = [...new Set([...FSRCC.matchAll(/code: '(clipboard_[a-z_]+)'/g)].map((m) => m[1]))];
        const rows = codes.map((c) => { const m = new RegExp(`data\\.code === '${c}'\\) \\{[^\\n]*\\n\\s*showToast\\(t\\('([^']+)'\\)`).exec(TERM); return { c, key: m && m[1], zh: !!(m && ZHD[m[1]]), ja: !!(m && JAD[m[1]]) }; });
        ok(codes.length === 4 && verdictOf(rows.every((r) => r.key && r.zh && r.ja)), `r1090: the terminal words each of the route's ${codes.length} codes (${codes.join(', ')}) — a branch with its sentence, in zh and ja`, rows);
      }
      {
        const FSRC1 = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
        const RUN = "last = await starter.run('xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o'], { timeoutMs: 1000, capture: true, wholeEnv: true, env: clipEnv });";
        const SYNC = "last = (() => { try { return { code: 0, stdout: execFileSync('xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o'], { env: clipEnv, encoding: 'utf-8', timeout: 1000 }) }; } catch (e) { return { code: 1, stdout: '', error: e && e.code }; } })();   /* MUTANT: today's synchronous call */";
        const SR = await serve(M.load('src/routes/files.js', anchored(FSRC1, RUN, SYNC, 'r1066-sync-poll'), 'r1066-sync'), null, { json: true, locals: POLL_LOCALS });
        try {
          const L0 = await loopScene(SR.base);
          ok(gateOf(L0.started) && L0.turnedInFlight === false, 'CONTROL r1066 (an equivalent of the base\'s synchronous read — execFileSync with its arguments, env and 1 s bound — in a copy): NO loop turn lands while the read is in flight — the leg above would be red', L0);
        } finally { await SR.close(); }
      }
      const FSRC = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
      const LEG = "  if (!host || !rfsInst) return;\n";
      const OLDLEG = "  if (!host || !rfsInst) { const now0 = Date.now(); fs.promises.readdir(os.tmpdir()).then(async (names) => { for (const n of names) { if (!n.startsWith('claude-paste-')) continue; const p = path.join(os.tmpdir(), n); try { const st = await fs.promises.stat(p); if (now0 - st.mtimeMs > 24 * 3600 * 1000) await fs.promises.unlink(p); } catch {} } }).catch(() => {}); return; }\n";
      const CALL = "    await fs.promises.writeFile(tmpPath, buf);   // B-3767 follow-up: off the loop (a reader's should); swept by sweepOwnTmp above (B-5527)\n";
      const back = anchored(anchored(FSRC, LEG, OLDLEG, 'b5527-legacy-leg'), CALL, CALL + '    sweepPasteTemps();\n', 'b5527-legacy-call');   // stale-pins: kept (the control writes the retired call back)
      const SL = await serve(M.load('src/routes/files.js', back, 'b5527-legacy'), null, { json: true });
      try {
        const legacy2 = plant('claude-paste-1700000000001.png');
        const a2 = await pasteOnce(SL.base);
        const t0 = Date.now(); while (there(legacy2) && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 10));   // the legacy leg's delete is what happened
        okP(!!a2.file && !there(legacy2) && a2.reads.includes(path.resolve(T)),
          'RED CONTROL B-5527: with the legacy leg back (a copy of the route) the paste READS the shared temp folder and DELETES the old paste-named file there — the leg above would be red',
          { sharedFolderRead: a2.reads.includes(path.resolve(T)), legacyDeleted: !there(legacy2) });
      } finally {
        await SL.close();
        for (const [k, v] of Object.entries(envWas)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }   // K65: the suite's own env back
      }
    }
  } finally { if (prevTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prevTmp; await S.close(); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';

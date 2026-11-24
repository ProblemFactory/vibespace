#!/usr/bin/env node
// THE HANDED RECORDS' AGE SWEEP (row B-5a4d, its root — 主开发 r3206 / r3247 / r3249, lane bl-keys-misc). src/server/handed-sweep.js
// removes `<buffers>/handed/<conversation id>.json` (its torn copy, a killed write's temp) ONLY when the conversation's transcript is
// gone from every place the hub looks (the REAL src/session-store.js claudeTranscriptIndex over scratch roots, read whole), no
// conversation record names it (live sessions; data/session-meta in every form; the REAL record verdict
// src/server/session-meta-verdict.js — an unread record names everything and is never read here), and it is older than the cutoff.
// Each rule has its RED: a copy of the module without it (scripts/scratch.mjs anchored(): a moved anchor throws by name).
//  ① the three rules together — a gone conversation's three files go, said; its neighbours with a transcript (projects / remote) stay
//  ② the age — a file younger than the cutoff stays                       ③ the transcripts read whole — or nothing goes, said
//  ④ the live sessions — a conversation id, a fork chain, a hub id         ⑤ the records in every form (.json / .stopped / .orphan)
//  ⑥ the verdict — an unread record keeps all (never read here); a torn one keeps what its bytes name
//  ⑦ a record this sweep cannot read keeps all                              ⑧ what is never touched (other names, a link, a folder)
//  ⑨ the file looked at again before it goes                                ⑩ the wiring (server.js's boot sweep, its one cutoff)
import { anchored } from './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0;
const say = console.log.bind(console);
function ok(c, name, detail) { if (typeof c !== 'boolean') throw new TypeError(`ok(): the condition must be a boolean (${typeof c}) — «${name}»`); if (c) { passed++; say(`  ✓ ${name}`); } else { failed++; say(`  ✗ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); } }
const WD = armWatchdog({ capMs: 30e3 });
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-handed-sweep-'));
process.on('exit', () => { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { } });
const SWEEP_REL = 'src/server/handed-sweep.js';
const HS = require(path.join(ROOT, SWEEP_REL));
const SMV = require(path.join(ROOT, 'src/server/session-meta-verdict.js'));
const SS = require(path.join(ROOT, 'src/session-store.js'));
const HANDED = require(path.join(ROOT, 'src/handed-records.js'));
const SRC = fs.readFileSync(path.join(ROOT, SWEEP_REL), 'utf8');
const M = mutantCopies('handed-sweep', ROOT);
const red = (tag, edits) => { let s = SRC; for (const [a, b] of edits) s = anchored(s, a, b, 'the sweep RED ' + tag); return M.load(SWEEP_REL, s, tag); };
const DAY = 86400000;
// a record of THIS machine: a frame handed to a CLI the wrapper ran (pid AND birth); a REMOTE one: the wrapper ran no CLI (REMOTE MODE)
const LOCAL = JSON.stringify({ v: 1, frames: [{ msgId: 'm-local', cli: { pid: 4242, start: 'l100', boot: '' }, state: 'handed', at: 1 }] });
const REMOTE = JSON.stringify({ v: 1, frames: [{ msgId: 'm-remote', cli: null, state: 'handed', at: 1 }] });
const uuid = (n) => '44444444-0000-4000-8000-' + String(n).padStart(12, '0');
let k = 0;

/** a scratch world: the buffers folder's handed/, the records folder, the two transcript roots */
function world(tag) {
  const d = fs.mkdtempSync(path.join(BASE, tag + '-'));
  const w = { buffers: path.join(d, 'buffers'), meta: path.join(d, 'session-meta'), projects: path.join(d, 'home', '.claude', 'projects'), remote: path.join(d, 'remote-jsonl') };
  for (const x of [path.join(w.buffers, HANDED.DIRNAME), w.meta, path.join(w.projects, '-work-a'), path.join(w.remote, 'h1')]) fs.mkdirSync(x, { recursive: true });
  w.handed = path.join(w.buffers, HANDED.DIRNAME);
  w.file = (name, days, body = LOCAL) => { const p = path.join(w.handed, name); fs.writeFileSync(p, body, { mode: 0o600 }); const t = (Date.now() - days * DAY) / 1000; fs.utimesSync(p, t, t); return name; };
  w.tx = (id, where = 'projects') => fs.writeFileSync(path.join(where === 'projects' ? path.join(w.projects, '-work-a') : path.join(w.remote, 'h1'), id + '.jsonl'), '{}\n');
  w.rec = (name, obj) => fs.writeFileSync(path.join(w.meta, name), typeof obj === 'string' ? obj : JSON.stringify(obj));
  w.has = (name) => { try { fs.lstatSync(path.join(w.handed, name)); return true; } catch { return false; } };
  w.index = () => SS.claudeTranscriptIndex({ projectsRoot: w.projects, remoteRoot: w.remote });
  w.run = async (mod = HS, opts = {}) => { const lines = []; const r = await mod.sweep({ buffersDir: w.buffers, metaDir: w.meta, cutoff: Date.now() - 7 * DAY, configDir: '', transcripts: w.index, log: (m) => lines.push(m), ...opts }); return { ...r, lines }; };
  return w;
}

// ① THE THREE RULES TOGETHER
say('① A GONE CONVERSATION\'s files go — its neighbours with a transcript stay');
const R_NOTX = red('notx', [['    if (index.has(a.id)) { out.kept++; continue; }', '    if (false) { out.kept++; continue; }   // MUTANT: the transcript never asked']]);
{
  const w = world('one'), gone = uuid(++k), here = uuid(++k), far = uuid(++k);
  w.file(gone + '.json', 9); w.file(gone + '.json-torn', 9); w.file(gone + '.json.4242.tmp', 8);
  w.file(here + '.json', 9); w.tx(here); w.file(far + '.json', 9); w.tx(far, 'remote');
  const r = await w.run();
  ok(!w.has(gone + '.json') && !w.has(gone + '.json-torn') && !w.has(gone + '.json.4242.tmp') && w.has(here + '.json') && w.has(far + '.json') && r.removed.length === 3 && r.kept === 2 && r.lines.some((l) => /removed 3 record file\(s\)/.test(l) && l.includes(gone + '.json')),
    'a conversation with no transcript, no record and past the age loses its file, its torn copy and its temp — SAID by name; one whose transcript is in the projects tree or the remote cache keeps its file', r);
  const w2 = world('one-red'); w2.file(here + '.json', 9); w2.tx(here);
  const rr = await w2.run(R_NOTX);
  ok(!w2.has(here + '.json'), 'RED: a copy that never asks the transcripts removes a conversation that still has one', rr);
}

say('② THE AGE — the cutoff is the wrapper files\' seven days');
const R_NOAGE = red('noage', [['    if (st.mtimeMs > cutoff) { out.kept++; continue; }', '    if (false) { out.kept++; continue; }   // MUTANT: no age']]);
{
  const w = world('age'), young = uuid(++k), old = uuid(++k);
  w.file(young + '.json', 6); w.file(old + '.json', 8);
  const r = await w.run();
  ok(w.has(young + '.json') && !w.has(old + '.json') && HS.AGE_MS === 7 * DAY, 'a file written within the age stays though nothing names it; one past it goes', r);
  const w2 = world('age-red'); w2.file(young + '.json', 6);
  await w2.run(R_NOAGE);
  ok(!w2.has(young + '.json'), 'RED: a copy with no age removes a file written six days ago');
}

say('③ THE TRANSCRIPTS — read whole, or nothing goes');
const R_ANYINDEX = red('anyindex', [['if (!index || index.ok !== true || index.topReadable !== true) return keepAll(', 'if (!index) return keepAll(']]);
{
  const id = uuid(++k);
  const failed = async () => ({ ok: false, topReadable: true, has: () => false });
  const noTop = async () => ({ ok: true, topReadable: false, has: () => false });
  const threw = async () => { throw new Error('the walk threw'); };
  const res = [];
  for (const [tag, t] of [['failed', failed], ['notop', noTop], ['threw', threw]]) { const w = world('tx-' + tag); w.file(id + '.json', 9); const r = await w.run(HS, { transcripts: t }); res.push({ tag, kept: w.has(id + '.json'), said: r.lines.some((l) => /removed nothing/.test(l)), unknown: r.unknown }); }
  // the REAL index over a projects root that is not a folder: not read whole
  const w4 = world('tx-real'); w4.file(id + '.json', 9); fs.rmSync(w4.projects, { recursive: true }); fs.writeFileSync(w4.projects, 'not a folder');
  const r4 = await w4.run();
  res.push({ tag: 'real', kept: w4.has(id + '.json'), said: r4.lines.some((l) => /removed nothing/.test(l)), unknown: r4.unknown });
  ok(res.every((x) => x.kept && x.said && !!x.unknown), 'a walk that failed or passed its bound, a projects folder not read, a walk that threw, the real index over an unreadable root — nothing goes, and the line says why', res);
  const w5 = world('tx-red'); w5.file(id + '.json', 9);
  await w5.run(R_ANYINDEX, { transcripts: failed });
  ok(!w5.has(id + '.json'), 'RED: a copy that takes a failed walk as an answer removes the file');
}

say('④ THE LIVE SESSIONS — a conversation id, a fork chain, a hub id');
const R_PLACEFIRST = red('placefirst', [['  for (const a of aged) { if (!want.has(a.id) || named.has(a.id)) continue; if ((await placeOf(dir, a.base, a.name, cache)) === true) left.push(a); else out.notHere++; }', '  for (const a of aged) { const pl = await placeOf(dir, a.base, a.name, cache); if (!want.has(a.id) || named.has(a.id)) continue; if (pl === true) left.push(a); else out.notHere++; }   // MUTANT: the place read before the filters']]);
const R_NOLIVE = red('nolive', [['    for (const [id, s] of activeSessions || []) {', '    for (const [id, s] of []) {   // MUTANT: no live session read']]);
{
  const w = world('live'), cur = uuid(++k), parent = uuid(++k), back = uuid(++k);
  w.file(cur + '.json', 9); w.file(parent + '.json', 9); w.file(back + '.json', 9); w.file('hub-sess-9-100.json', 9); w.file('hub-sess-8-100.json', 9);
  const live = new Map([['sess-1-1', { claudeSessionId: cur }], ['sess-2-1', { forkedFrom: [parent] }], ['sess-3-1', { backendSessionId: back }], ['sess-9-100', {}]]);
  const fsp0 = fs.promises, rf0 = fsp0.readFile, reads = [];
  fsp0.readFile = function (q, ...rest) { reads.push(String(q)); return rf0.call(this, q, ...rest); };
  let r, readsRed;
  try { r = await w.run(HS, { activeSessions: live }); const wq = world('live-order-red'); wq.file(cur + '.json', 9); reads.length = 0; await wq.run(R_PLACEFIRST, { activeSessions: live }); readsRed = reads.slice(); } finally { fsp0.readFile = rf0; }
  const readsLane = [];   // the lane's reads are judged by name below (a live conversation's file never read for its place)
  ok(w.has(cur + '.json') && w.has(parent + '.json') && w.has(back + '.json') && w.has('hub-sess-9-100.json') && !w.has('hub-sess-8-100.json'),
    'a live session\'s conversation, its fork chain\'s parent, its backend id and a live hub id keep their files; a hub id no session holds goes', r);
  ok(!r.lines.some((l) => /not provably/.test(l)) && readsRed.some((q) => q.endsWith(cur + '.json')), 'the place is read only for the files the cheap filters leave (a live conversation\'s file is never read for it) — RED: a copy that reads it before the filters reads the live file', { readsRed: readsRed.map((q) => path.basename(q)) });
  const w2 = world('live-red'); w2.file(cur + '.json', 9);
  await w2.run(R_NOLIVE, { activeSessions: live });
  ok(!w2.has(cur + '.json'), 'RED: a copy that reads no live session removes a running conversation\'s file');
}

say('⑤ THE RECORDS — every form on disk names its conversation');
const R_FORMS = red('forms', [['const RECORD_RE = /^(.+)\\.json(\\.stopped|\\.orphan)?$/;', 'const RECORD_RE = /^(.+)\\.json()$/;   // MUTANT: the live form only']]);
{
  const w = world('recs'), a = uuid(++k), b = uuid(++k), c = uuid(++k), none = uuid(++k);
  for (const x of [a, b, c, none]) w.file(x + '.json', 9);
  w.file('hub-sess-7-100.json', 9);
  w.rec('sock-a.json', { claudeSessionId: a }); w.rec('sock-b.json.stopped', { claudeSessionId: b, status: 'stopped' }); w.rec('sock-c.json.orphan', { forkedFrom: [c], host: 'h1' }); w.rec('sock-d.json', { webuiSessionId: 'sess-7-100' });
  const r = await w.run();
  ok(w.has(a + '.json') && w.has(b + '.json') && w.has(c + '.json') && w.has('hub-sess-7-100.json') && !w.has(none + '.json'),
    'a record names its conversation in each form — <sock>.json, .json.stopped (a restart\'s stopped copy), .json.orphan (a keeper\'s) — and a record naming a hub id keeps that file; the unnamed one goes', r);
  const w2 = world('recs-red'); w2.file(b + '.json', 9); w2.rec('sock-b.json.stopped', { claudeSessionId: b });
  await w2.run(R_FORMS);
  ok(!w2.has(b + '.json'), 'RED: a copy that reads only the live form removes a stopped conversation\'s file');
}

say('⑥ THE VERDICT — a record that could not be read names everything, and is never read here');
const R_NOVERDICT = red('noverdict', [['  if (verdict.anyUnreadable()) return keepAll(', '  if (false) return keepAll('], ['if (!live.has(a.id) && !verdict.keeps(a.id)) want.add(a.id);', 'if (!live.has(a.id)) want.add(a.id);   // MUTANT: the verdict never asked'], ["      if (!m[2] && verdict.isMarked(m[1])) continue;", '      if (false) continue;']]);
{
  const fsp = fs.promises, readFile0 = fsp.readFile, read = [];
  fsp.readFile = function (p, ...rest) { read.push(String(p)); return readFile0.call(this, p, ...rest); };
  try {
    const w = world('verdict'), x = uuid(++k);
    w.file(x + '.json', 9); w.rec('sock-u.json', '{"claudeSessionId":"' + x + '"');   // its bytes torn on disk; the verdict holds it UNREAD
    SMV.mark('sock-u', { code: 'EACCES' });
    const r = await w.run();
    ok(w.has(x + '.json') && !!r.unknown && r.lines.some((l) => /could not be read/.test(l)) && !read.some((p) => p.endsWith('sock-u.json')),
      'while a conversation\'s record could not be read, nothing goes (said) — and the sweep never reads that record itself', { r, read });
    read.length = 0;
    const w2 = world('verdict-red'); w2.file(x + '.json', 9); w2.rec('sock-u.json', '{"x":1}');
    await w2.run(R_NOVERDICT);
    ok(!w2.has(x + '.json') && read.some((p) => p.endsWith('sock-u.json')), 'RED: a copy that asks no verdict reads the held record itself and removes the file');
    SMV.clear('sock-u');
    // a TORN record whose kept bytes name a conversation: that one stays; the verdict's other answers let the rest go
    read.length = 0;
    const w3 = world('verdict-torn'), named = uuid(++k), other = uuid(++k);
    w3.file(named + '.json', 9); w3.file(other + '.json', 9); w3.rec('sock-t.json', '{"claudeSessionId":"' + named);
    SMV.mark('sock-t', { code: 'corrupt', torn: true, text: '{"claudeSessionId":"' + named });
    const r3 = await w3.run();
    ok(w3.has(named + '.json') && !w3.has(other + '.json') && !read.some((p) => p.endsWith('sock-t.json')), 'a torn record the verdict keeps names its conversation by its kept bytes (keeps(id)); the other conversation goes; the torn file is not read here', { r3, read });
    SMV.clear('sock-t');
  } finally { fsp.readFile = readFile0; SMV.clear('sock-u'); SMV.clear('sock-t'); }
}

say('⑦ A RECORD THIS SWEEP CANNOT READ keeps every file');
const R_READFAIL = red('readfail', [["catch (e) { if (e && e.code === 'ENOENT') continue; return keepAll(`the record ${f}", "catch (e) { continue; return keepAll(`the record ${f}"]]);
{
  const w = world('unread'), x = uuid(++k);
  w.file(x + '.json', 9); w.rec('sock-x.json.stopped', '{"claudeSessionId":"' + x);   // torn, and no verdict holds a stopped copy
  const r = await w.run();
  ok(w.has(x + '.json') && /sock-x\.json\.stopped could not be read here/.test(r.unknown || ''), 'a record whose bytes do not parse may name any conversation — nothing goes, said by its name', r);
  const w2 = world('unread-red'); w2.file(x + '.json', 9); w2.rec('sock-x.json.stopped', '{"claudeSessionId":"' + x);
  await w2.run(R_READFAIL);
  ok(!w2.has(x + '.json'), 'RED: a copy that skips a record it cannot read removes the file that record names');
}

say('⑧ WHAT IS NEVER TOUCHED — other names, a link, a folder');
const R_NOTFILE = red('notfile', [['    if (!st.isFile()) continue;', '    if (false) continue;   // MUTANT: not only plain files']]);
const R_PLACELINK = red('placelink', [["    try { const st = await fsp.lstat(path.join(dir, f)); if (!st.isFile() || st.size > FILE_MAX) { cache.set(f, null); return null; }", "    try { const st = await fsp.stat(path.join(dir, f)); if (st.size > FILE_MAX) { cache.set(f, null); return null; }   /* MUTANT: the link's target read */"]]);
{
  const old = (Date.now() - 30 * DAY) / 1000;
  const aged = (p) => fs.lutimesSync(p, old, old);
  // (a) the «a plain file» line: an AGED link named as a torn copy (its target a record of this machine), its conversation's main
  //     file a plain record of this machine — only that line keeps the link (the place reads the main file)
  const plantA = (ww) => { const id = uuid(++k), target = path.join(BASE, 'targetA-' + id + '.json'); fs.writeFileSync(target, LOCAL); ww.file(id + '.json', 9); fs.symlinkSync(target, path.join(ww.handed, id + '.json-torn')); aged(path.join(ww.handed, id + '.json-torn')); return { id, target }; };
  // (b) the place's own facts: an aged plain torn copy whose conversation's MAIN name is a link (to a record of this machine) — the
  //     place check keeps a main file that is not a plain file, so the torn copy stays
  const plantB = (ww) => { const id = uuid(++k), target = path.join(BASE, 'targetB-' + id + '.json'); fs.writeFileSync(target, LOCAL); fs.symlinkSync(target, path.join(ww.handed, id + '.json')); aged(path.join(ww.handed, id + '.json')); ww.file(id + '.json-torn', 9); return { id, target }; };
  const w = world('never'), x = uuid(++k);
  for (const n of ['notes.txt', x + '.jsonl', x + '.json.bak', x + '.json-torn.old']) w.file(n, 30);
  const dirName = uuid(++k) + '.json'; fs.mkdirSync(path.join(w.handed, dirName)); fs.utimesSync(path.join(w.handed, dirName), old, old);
  const A = plantA(w), Bb = plantB(w);
  const r = await w.run();
  const has = (ww, n) => fs.readdirSync(ww.handed).includes(n);
  ok(has(w, A.id + '.json-torn') && !has(w, A.id + '.json') && has(w, Bb.id + '.json') && has(w, Bb.id + '.json-torn') && has(w, dirName) && ['notes.txt', x + '.jsonl', x + '.json.bak', x + '.json-torn.old'].every((n) => has(w, n)) && fs.readFileSync(A.target, 'utf8') === LOCAL && fs.readFileSync(Bb.target, 'utf8') === LOCAL && fs.lstatSync(path.join(w.handed, A.id + '.json-torn')).mtimeMs < Date.now() - 29 * DAY,
    'names not of the wrapper\'s own shape stay; an AGED link named as a record is never removed (its conversation\'s plain main file goes); a torn copy whose main name is a LINK stays (the place by the link\'s own facts); an aged folder is never touched', { removed: r.removed });
  const w2 = world('never-red-a'); const A2 = plantA(w2);
  await w2.run(R_NOTFILE);
  const w3 = world('never-red-b'); const B3 = plantB(w3);
  await w3.run(R_PLACELINK);
  ok(!has(w2, A2.id + '.json-torn') && !has(w3, B3.id + '.json-torn'), 'RED: a copy without the «a plain file» line unlinks the aged link; a copy whose place follows the link removes the torn copy by the link\'s target');
}

say('⑨ THE FILE LOOKED AT AGAIN before it goes');
const R_RECHECK = red('recheck', [['    if (!same(a.st, now) || liveNames(activeSessions).has(a.id)) { out.kept++; continue; }', '    if (false) { out.kept++; continue; }   // MUTANT: no second look']]);
{
  const w = world('again'), wrote = uuid(++k), resumed = uuid(++k), live = new Map();
  w.file(wrote + '.json', 9); w.file(resumed + '.json', 9);
  // while the transcripts are walked, a wrapper writes one file again and a session takes the other conversation
  const racing = async () => { const ix = await w.index(); fs.writeFileSync(path.join(w.handed, wrote + '.json'), '{"v":1,"frames":[{"msgId":"m"}]}'); live.set('sess-5-1', { claudeSessionId: resumed }); return ix; };
  const r = await w.run(HS, { transcripts: racing, activeSessions: live });
  ok(w.has(wrote + '.json') && w.has(resumed + '.json'), 'a file written again during the pass, and a conversation that became live during it, both stay', r);
  const w2 = world('again-red'), live2 = new Map();
  w2.file(wrote + '.json', 9);
  const racing2 = async () => { const ix = await w2.index(); fs.writeFileSync(path.join(w2.handed, wrote + '.json'), '{"v":1,"frames":[{"msgId":"m"}]}'); return ix; };
  await w2.run(R_RECHECK, { transcripts: racing2, activeSessions: live2 });
  ok(!w2.has(wrote + '.json'), 'RED: a copy with no second look removes a file a wrapper has just written');
}

say('⑪ A CONVERSATION ON ANOTHER MACHINE — a record goes only on a proof that covers where its transcript lives');
const R_ANYFRAME = red('anyframe', [["    if (text.includes('\"cli\":null')) v = false;   // a frame that names no CLI: kept, no parse needed\n    else { try { const j = JSON.parse(text); v = !!(j && Array.isArray(j.frames) && j.frames.length && j.frames.every(localCli)); } catch { v = null; } }", "    try { const j = JSON.parse(text); v = !!(j && Array.isArray(j.frames) && j.frames.some(localCli)); } catch { v = null; }   /* MUTANT: any frame */"]]);
const R_NOPLACE = red('noplace', [['  for (const a of aged) { if (!want.has(a.id) || named.has(a.id)) continue; if ((await placeOf(dir, a.base, a.name, cache)) === true) left.push(a); else out.notHere++; }', '  for (const a of aged) { if (!want.has(a.id) || named.has(a.id)) continue; left.push(a); }   // MUTANT: every file taken as this machine\'s']]);
{
  const w = world('remote'), far = uuid(++k), torn = uuid(++k), near = uuid(++k);
  w.file(far + '.json', 9, REMOTE); w.file(torn + '.json', 9, '{"v":1,"frames":[{"msgId":"x","cl'); w.file(near + '.json', 9);   // no cache entry, no record, aged
  const r = await w.run();
  ok(w.has(far + '.json') && w.has(torn + '.json') && !w.has(near + '.json') && r.notHere === 2 && r.lines.some((l) => /kept 2 file\(s\) past the age whose conversation is not provably this machine's/.test(l)),
    'a REMOTE conversation\'s record (its wrapper ran no CLI here) and one whose frames cannot be read are KEPT though no cache, no record and no age keeps them — said by count; a record of this machine goes', r);
  // MIXED FRAMES (r3815): one frame names a CLI, one names none — the whole file is kept (every, not any)
  const MIXED = JSON.stringify({ v: 1, frames: [JSON.parse(LOCAL).frames[0], { msgId: 'm-remote', cli: null, state: 'handed', at: 2 }] });
  const wm = world('mixed'), mx = uuid(++k); wm.file(mx + '.json', 9, MIXED);
  const rm = await wm.run();
  const wmr = world('mixed-red'); wmr.file(mx + '.json', 9, MIXED);
  await wmr.run(R_ANYFRAME);
  ok(wm.has(mx + '.json') && rm.notHere === 1 && !wmr.has(mx + '.json'), 'a file with MIXED frames (one names a CLI, one names none) is KEPT — RED: a copy that takes any frame removes it', rm);
  const w2 = world('remote-red'); w2.file(far + '.json', 9, REMOTE);
  await w2.run(R_NOPLACE);
  ok(!w2.has(far + '.json'), 'RED: the sweep before this cure (every file taken as this machine\'s) removes the remote conversation\'s record on the cache\'s silence');
}

say('⑫ ANOTHER CONFIGURATION FOLDER — the index reads the home\'s own: nothing goes');
const R_NOCONFIG = red('noconfig', [["  if (configDir && path.resolve(configDir) !== path.resolve(homeConfig)) return keepAll(", '  if (false) return keepAll(']]);
{
  const w = world('config'), x = uuid(++k);
  w.file(x + '.json', 9);
  const r = await w.run(HS, { configDir: path.join(BASE, 'elsewhere'), homeConfig: path.join(BASE, 'home', '.claude') });
  const w2 = world('config-same'); w2.file(x + '.json', 9);
  const r2 = await w2.run(HS, { configDir: path.join(BASE, 'home', '.claude'), homeConfig: path.join(BASE, 'home', '.claude') });
  ok(w.has(x + '.json') && /another configuration folder/.test(r.unknown || '') && !w2.has(x + '.json'),
    'a hub whose environment names another configuration folder (CLAUDE_CONFIG_DIR) keeps every file, said; the same folder as the home\'s own changes nothing', { r, r2 });
  const w3 = world('config-red'); w3.file(x + '.json', 9);
  await w3.run(R_NOCONFIG, { configDir: path.join(BASE, 'elsewhere'), homeConfig: path.join(BASE, 'home', '.claude') });
  ok(!w3.has(x + '.json'), 'RED: a copy that never asks the configuration folder removes the file on the home folder\'s silence');
}

say('⑩ THE WIRING — server.js\'s boot sweep, its one cutoff');
{
  const S = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const at = S.indexOf('const cutoff = Date.now() - 7 * 86400000;'), end = at < 0 ? -1 : S.indexOf('}, 30000);', at);
  const block = at < 0 || end < 0 ? '' : S.slice(at, end);
  ok(block.includes('sweepAgedWrapperFiles(BUFFERS_DIR, { cutoff,') && block.includes("require('./src/server/handed-sweep.js').sweep({ buffersDir: BUFFERS_DIR, metaDir: META_DIR, cutoff, activeSessions })") && /\.catch\(/.test(block.slice(block.indexOf('handed-sweep.js'))),
    'the boot\'s 30 s sweep calls it over BUFFERS_DIR and META_DIR with the wrapper files\' own cutoff and the live sessions — a failure said, never thrown', { found: at >= 0 && end >= 0 });
  ok(!/\b(readFileSync|readdirSync|statSync|lstatSync|unlinkSync|rmSync|existsSync)\b/.test(SRC), 'the sweep runs off the loop: fs.promises only (no sync call in the module)');
  ok(!/\be && e\.message\b/.test(SRC) && block.includes("console.warn('[handed] the age sweep failed:', (e && e.code) || 'an error with no code')"), 'the journal carries an error\'s code or a fixed word, never its message (a message can carry a path) — the module and the boot\'s call');
}

for (const r of copiesCensus(M.files, M.dir, ROOT, { minCopies: 14, label: 'B-5a4d sweep ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
WD.clear();
say(`\n${failed ? failed + ' FAILED' : 'ALL PASS'} (${passed} passed, ${failed} failed)`);
process.exit(failed ? 1 : 0);

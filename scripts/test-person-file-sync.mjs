#!/usr/bin/env node
// test-person-file-sync — B-ddf3 (lane bl-scratch, 2026-11-21): THE «PERSON» FAMILY OF ROW B-9275, cured one site at a time.
// THE LAW (B-9275): a file's new bytes are on disk before its name points at them; a failed sync is a failed write, said to
// the person. FAST, in-process: each cured site runs for real on a scratch HOME, with the file system's calls RECORDED (the
// real calls still run) — the order is read from what the site did, never from its text.
//   ⓪ a mail message's copy (src/gmail-sync.js _writeMessage, FIRST by the coordinator's r1347): its file NAME is the «seen»
//     mark, so an empty copy would stay empty for good — written, synced once at its end and renamed on the thread pool (no
//     sync write on the loop); a failed sync is said by name, nothing renamed, the message not marked seen.
//     RED: today's writer (written on the loop, renamed with nothing synced).
//   ① a conversation transcript rescued in place (src/transcript-service.js rescue): the backup and the rewritten transcript
//     are synced BEFORE the swap, through the thread pool (no fsyncSync on the loop); a failed sync throws by name, nothing
//     swapped, the transcript's bytes as they were, the temp gone, the backup kept.
//     RED: today's rescue (the sync taken out): the swap happens with nothing synced, and a failed sync is never seen.
//   ② a CLI's own settings file (src/harness-config.js commitWrite / commitCreate — B-ddf3 unit 2 line 2): the shipped helper's
//     writer (every machine's, the hub's own since line 1) syncs its temp before the rename or the link; a failed sync is an
//     «error» receipt said by name, the file as it was, no temp left. RED: today's writer (both syncs taken out).
// The census of the renames (test-temp-rename-census) reads the sites «synced» (OWED_MAX 150 → 148 by unit 1; 146 → 144 by this unit, on the train's count).
//   ③–⑧ B-ddf3 unit 3 (lane bl-vault, 主开发 r4361): a copy from another machine (src/routes/files.js crossHostTransfer), a copy or
//     move across devices (src/safe-fs-worker.js), a DAV upload (src/webdav.js PUT), a design file (src/design-fs.js writeUser), a
//     Task Group export (src/task-groups.js exportToFile) and a published page (src/server/published-pages.js publishContent): each
//     synced ONCE before its rename, off the hub's loop; a PLACED refusal of the sync is said by name, nothing renamed, no temp left;
//     RED: each with the sync taken out. The census reads them «synced» (OWED_MAX 141 → 134, browser-serve's planned copy «derived»).
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const MC = mutantCopies('person-file-sync', REPO);
const ROOT = scratch('person-file-sync');
fs.mkdirSync(ROOT, { recursive: true });
let seq = 0;   // each run's own folder

// THE RECORDER: the real fs calls run; each one this law is about is written down in order. `fail(kind, p)` plants a failure.
async function recorded(fn, fail = () => false) {
  const log = [], P = fs.promises, keep = { open: P.open, rename: P.rename, renameSync: fs.renameSync, fsyncSync: fs.fsyncSync, linkSync: fs.linkSync, openSync: fs.openSync, writeFileSync: fs.writeFileSync };
  const fdPath = new Map();
  const planted = (kind, p) => { if (fail(kind, p)) { log.push(`FAILED ${kind} ${path.basename(String(p))}`); throw Object.assign(new Error(`EIO: a planted failed ${kind}`), { code: 'EIO' }); } };
  P.open = async (p, ...a) => {
    const h = await keep.open.call(P, p, ...a), sync0 = h.sync.bind(h);
    h.sync = async () => { planted('sync', p); log.push(`sync ${path.basename(String(p))}`); return sync0(); };
    return h;
  };
  fs.openSync = (p, ...a) => { const fd = keep.openSync(p, ...a); fdPath.set(fd, p); return fd; };
  fs.fsyncSync = (fd) => { const p = fdPath.get(fd) || '?'; planted('fsyncSync', p); log.push(`fsyncSync ${path.basename(String(p))}`); return keep.fsyncSync(fd); };
  fs.renameSync = (a, b) => { log.push(`rename ${path.basename(String(a))}`); return keep.renameSync(a, b); };
  P.rename = async (a, b) => { log.push(`rename ${path.basename(String(a))}`); return keep.rename.call(P, a, b); };
  fs.writeFileSync = (p, ...a) => { log.push(`writeFileSync ${path.basename(String(p))}`); return keep.writeFileSync(p, ...a); };
  fs.linkSync = (a, b) => { log.push(`link ${path.basename(String(a))}`); return keep.linkSync(a, b); };
  try { const r = await fn(); return { log, r }; } catch (e) { return { log, err: e }; } finally { Object.assign(P, { open: keep.open, rename: keep.rename }); Object.assign(fs, { renameSync: keep.renameSync, fsyncSync: keep.fsyncSync, linkSync: keep.linkSync, openSync: keep.openSync, writeFileSync: keep.writeFileSync }); }
}
const before = (log, a, b) => log.indexOf(a) >= 0 && log.indexOf(b) >= 0 && log.indexOf(a) < log.indexOf(b);

// ── ⓪ a mail message's copy ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⓪ a mail message\'s copy (src/gmail-sync.js _writeMessage)');
const GM_REL = 'src/gmail-sync.js', GM = fs.readFileSync(path.join(REPO, GM_REL), 'utf8');
async function mailRun(mod, fail) {
  const dir = path.join(ROOT, `mail-${++seq}`), raw = Buffer.from('Subject: a planted message\r\n\r\n' + 'x'.repeat(64 * 1024)), seen = new Set();
  fs.mkdirSync(dir, { recursive: true });
  const { GmailSync } = require(mod), g = Object.create(GmailSync.prototype);
  g._api = async () => ({ raw: raw.toString('base64url'), internalDate: String(Date.UTC(2026, 10, 21, 9, 30)), labelIds: ['INBOX'] });
  const out = await recorded(() => g._writeMessage({ cfg: { dir, groupBy: '' }, count: 0 }, 'id1', seen), fail);
  const files = fs.readdirSync(dir), eml = files.find((f) => f.endsWith('_id1.eml'));
  return { ...out, seen: seen.has('id1'), files, bytes: eml ? fs.readFileSync(path.join(dir, eml)) : null, raw };
}
{
  const m = await mailRun(path.join(REPO, GM_REL));
  ok(!m.err && m.seen && !!m.bytes && m.bytes.equals(m.raw), 'the message lands whole under its name and is marked seen', m.err ? m.err.message : m.files.join(', '));
  ok(before(m.log, 'sync .tmp-id1', 'rename .tmp-id1') && !m.log.some((x) => /^(writeFileSync|fsyncSync) /.test(x)), 'its bytes are synced ONCE at their end, BEFORE the rename — on the thread pool, no sync write on the loop', m.log.join(' → '));
  const f = await mailRun(path.join(REPO, GM_REL), (k, p) => k === 'sync' && /\.tmp-id1$/.test(String(p)));
  ok(!!f.err && /gmail: message id1 could not be put on disk \(EIO\) — not saved/.test(f.err.message), 'a failed sync is a failed copy, said by name', f.err ? f.err.message : 'NO ERROR');
  ok(!f.seen && f.files.length === 0 && !f.log.some((x) => x.startsWith('rename')), '…nothing renamed, no temp left, the message NOT marked seen (the next pass fetches it again)', `${f.files.join(', ') || 'no file'} · ${f.log.join(' → ')}`);
  const todayGm = anchored(GM, /\n    \/\/ B-ddf3 \(THE LAW of B-9275[\s\S]*?await fs\.promises\.rename\(tmp, /, "\n    fs.writeFileSync(tmp, raw);\n    fs.renameSync(tmp, ", 'today: the message written on the loop, renamed with nothing synced');
  const t = await mailRun(MC.write(GM_REL, todayGm, 'today-mail'));
  ok(!t.err && t.seen && t.log.includes('writeFileSync .tmp-id1') && !t.log.some((x) => x.startsWith('sync')), 'RED (today\'s writer): written on the loop and renamed with nothing synced — the order leg above reads it', t.log.join(' → '));
}

// ── ① the transcript rescued in place ────────────────────────────────────────────────────────────────────────────────────────
console.log('① a conversation transcript rescued in place (src/transcript-service.js rescue)');
const TS_REL = 'src/transcript-service.js', TS = fs.readFileSync(path.join(REPO, TS_REL), 'utf8');
async function rescueRun(mod, fail) {
  const home = path.join(ROOT, `home-${++seq}`), cid = '11111111-2222-3333-4444-555555555555';
  const proj = path.join(home, '.claude', 'projects', '-tmp-x');
  fs.mkdirSync(proj, { recursive: true });
  const fp = path.join(proj, cid + '.jsonl');
  const rec = (u, p, text) => JSON.stringify({ type: 'user', uuid: u, parentUuid: p, sessionId: cid, message: { role: 'user', content: [{ type: 'text', text: text || 'ok' }] } });
  const bytes = [rec('u1', null), rec('u2', 'u1', 'M'.repeat(12 * 1024)), rec('u3', 'u2')].join('\n') + '\n';
  fs.writeFileSync(fp, bytes);
  const HOME0 = process.env.HOME;
  process.env.HOME = home;   // the transcript is found under $HOME/.claude/projects
  try {
    const svc = require(mod).createTranscriptService({ activeSessions: new Map(), createSessionMessages: () => null, hosts: null });
    const out = await recorded(() => svc.rescue({ sessionId: cid, cwd: '/tmp/x', backend: 'claude' }, { maxLineBytes: 4096 }), fail);
    const left = fs.readdirSync(proj);
    return { ...out, fp, bytes, now: fs.readFileSync(fp, 'utf8'), tmpLeft: left.includes(cid + '.jsonl.rescue-tmp'), backups: left.filter((f) => f.includes('.pre-rescue-')) };
  } finally { process.env.HOME = HOME0; }
}
{
  const live = await rescueRun(path.join(REPO, TS_REL));
  const L = live.log, backup = live.backups[0] || '?';
  ok(!live.err && !!live.r && live.r.replaced === 1, `the rescue stubs the oversized record (${live.err ? live.err.message : JSON.stringify({ replaced: live.r.replaced, lines: live.r.lines })})`);
  ok(before(L, `sync ${backup}`, `rename ${path.basename(live.fp)}.rescue-tmp`) && before(L, `sync ${path.basename(live.fp)}.rescue-tmp`, `rename ${path.basename(live.fp)}.rescue-tmp`),
    'the backup and the rewritten transcript are synced BEFORE the swap', L.join(' → '));
  console.log(`    the order: ${L.join(' → ')}`);
  ok(!L.some((x) => x.startsWith('fsyncSync')), 'the syncs run on the thread pool (a file handle\'s sync): no fsyncSync on the loop', L.join(' → '));
  for (const [what, failOn] of [['the rewritten transcript', (k, p) => k === 'sync' && /\.rescue-tmp$/.test(String(p))], ['its backup', (k, p) => k === 'sync' && /\.pre-rescue-/.test(String(p))]]) {
    const f = await rescueRun(path.join(REPO, TS_REL), failOn);
    ok(!!f.err && /could not be put on disk \(EIO\)/.test(f.err.message) && f.err.message.includes(what) && /nothing was replaced/.test(f.err.message),
      `a failed sync of ${what} is a failed rescue, said by name`, f.err ? f.err.message : 'NO ERROR');
    ok(f.now === f.bytes && !f.tmpLeft && f.backups.length === 1 && !f.log.some((x) => x.startsWith('rename')),
      `…and nothing is swapped: the transcript's bytes as they were, the temp gone, the backup kept (${f.backups.length})`, f.log.join(' → '));
  }
  // RED: today's rescue — the sync taken out (anchored: a moved line fails by name)
  const todayTs = anchored(TS, /\n    \/\/ B-ddf3 \(THE LAW of B-9275[\s\S]*?\n    }\n(?=    fs\.renameSync\(tmp, fp\);)/, '\n', 'today: the rescue swaps with nothing synced');
  const today = await rescueRun(MC.write(TS_REL, todayTs, 'today-rescue'));
  ok(!today.err && !today.log.some((x) => x.startsWith('sync')) && today.log.some((x) => x.startsWith('rename')), 'RED (today\'s rescue): the swap happens with nothing synced — the leg above reads it', today.log.join(' → '));
  const todayFail = await rescueRun(MC.write(TS_REL, todayTs, 'today-rescue-fail'), (k, p) => k === 'sync' && /\.rescue-tmp$/.test(String(p)));
  ok(!todayFail.err && todayFail.now !== todayFail.bytes, 'RED (today\'s rescue): a failing disk is never asked, the transcript is swapped anyway', todayFail.err ? todayFail.err.message : 'swapped');
}

// ── ② a CLI's own settings file ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('② a CLI\'s own settings file (src/harness-config.js commitWrite / commitCreate — the shipped helper\'s writer)');
const HC_REL = 'src/harness-config.js', HCT = fs.readFileSync(path.join(REPO, HC_REL), 'utf8');
const PLAN = { v: 1, files: [{ harness: 'claude', id: 'settings', rel: ['.claude', 'settings.json'], format: 'json', createIfMissing: 'dir-exists', set: [{ key: 'transcriptRetentionDays', path: ['cleanupPeriodDays'], value: 36500 }] }] };
async function cliRun(mod, { exists = true, fail, mode = null } = {}) {
  const home = path.join(ROOT, `home-${++seq}`), dir = path.join(home, '.claude'), file = path.join(dir, 'settings.json');
  fs.mkdirSync(dir, { recursive: true });
  const was = exists ? JSON.stringify({ model: 'opus', cleanupPeriodDays: 30 }, null, 2) + '\n' : null;
  if (was !== null) { fs.writeFileSync(file, was); if (mode != null) fs.chmodSync(file, mode); }
  const out = await recorded(() => require(mod).applyConfigPlan(PLAN, { home }), fail);
  const receipt = out.r && out.r.receipts && out.r.receipts[0];
  return { ...out, receipt, was, now: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, mode: fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : null, tmpLeft: fs.readdirSync(dir).some((f) => f.endsWith('.tmp')) };
}
{
  for (const [road, exists, last] of [['an existing file (commitWrite)', true, 'rename settings.json.tmp'], ['a created file (commitCreate)', false, 'link settings.json.tmp']]) {
    const live = await cliRun(path.join(REPO, HC_REL), { exists });
    ok(!live.err && live.receipt && live.receipt.state === 'applied' && JSON.parse(live.now).cleanupPeriodDays === 36500 && before(live.log, 'fsyncSync settings.json.tmp', last) && !live.tmpLeft,
      `${road}: the temp is synced BEFORE its name points at it, the key applied, no temp left`, live.log.join(' → '));
    const f = await cliRun(path.join(REPO, HC_REL), { exists, fail: (k, p) => k === 'fsyncSync' && /settings\.json\.tmp$/.test(String(p)) });
    ok(!f.err && f.receipt && f.receipt.state === 'error' && /settings\.json: the new settings could not be put on disk \(EIO\) — not written, the file is as it was/.test(f.receipt.reason || ''),
      `${road}: a failed sync is a failed write, said by name in the receipt the hub reads («could not be put on disk (EIO) — not written»)`, f.receipt);
    ok(f.now === f.was && !f.tmpLeft && !f.log.some((x) => x === last), `${road}: …and the file is as it was (${f.was === null ? 'still absent' : 'its bytes unchanged'}), no temp left, nothing renamed or linked`, f.log.join(' → '));
  }
  // the shipped helper embeds THIS text: every machine's helper writes the same way (test-claude-retention pins the embed too)
  ok(fs.readFileSync(path.join(REPO, 'data/bin/vibespace-hook-register.mjs'), 'utf8').includes(HCT), 'the shipped helper (data/bin/vibespace-hook-register.mjs) carries this writer byte for byte');
  // RED: today's writer — both syncs taken out (anchored: a moved line fails by name)
  const SYNC_LINE = "    try { fs.fsyncSync(fd); } catch (e) { throw syncRefused(tmp, file, e); }\n";
  const todayHc = anchored(anchored(HCT, '  ' + SYNC_LINE, '', 'today: commitCreate links with nothing synced'), SYNC_LINE, '', 'today: commitWrite renames with nothing synced');   // commitCreate's (deeper) line first: the shallower anchor is a substring of it
  for (const [road, exists, last] of [['commitWrite', true, 'rename settings.json.tmp'], ['commitCreate', false, 'link settings.json.tmp']]) {
    const t = await cliRun(MC.write(HC_REL, todayHc, `today-${road}`), { exists, fail: (k, p) => k === 'fsyncSync' && /settings\.json\.tmp$/.test(String(p)) });
    ok(t.receipt && t.receipt.state === 'applied' && !t.log.some((x) => x.startsWith('fsyncSync')) && t.log.includes(last),
      `RED (today's ${road}): the name points at a temp nothing synced, and a failing disk is never asked — the legs above read it`, t.log.join(' → '));
  }
  // r2814: A READ-ONLY SETTINGS FILE (no owner write bit: 0444, 0400) IS STILL REPLACED, as in the release (a rename needs the folder's
  // permission only): ONE descriptor writes the bytes, sets the mode and syncs them — never a second open the mode refuses
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;   // a mode does not stop root's open: the RED reads only unprivileged
  const SECOND_OPEN = anchored(HCT, /  const fd = fs\.openSync\(tmp, 'w', mode == null \? 0o666 : mode\);\n  try \{\n    fs\.writeFileSync\(fd, out\);\n    if \(mode != null\) fs\.fchmodSync\(fd, mode\);[^\n]*\n    try \{ fs\.fsyncSync\(fd\); \} catch \(e\) \{ throw syncRefused\(tmp, file, e\); \}\n  \} finally \{ fs\.closeSync\(fd\); \}\n/,
    "  fs.writeFileSync(tmp, out, mode == null ? undefined : { mode });\n  if (mode != null) fs.chmodSync(tmp, mode);\n  try { const fd = fs.openSync(tmp, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } } catch (e) { throw syncRefused(tmp, file, e); }\n", 'line 534: a second open of the temp to sync it');
  for (const ro of [0o444, 0o400]) {
    const r = await cliRun(path.join(REPO, HC_REL), { exists: true, mode: ro });
    ok(!!(!r.err && r.receipt && r.receipt.state === 'applied' && JSON.parse(r.now).cleanupPeriodDays === 36500 && r.mode === ro && before(r.log, 'fsyncSync settings.json.tmp', 'rename settings.json.tmp') && !r.tmpLeft),
      `a read-only settings file (0${ro.toString(8)}) is still replaced: the key applied, its mode kept (0${ro.toString(8)}), the sync recorded before the rename, no temp left`, { log: r.log.join(' → '), mode: r.mode && r.mode.toString(8), receipt: r.receipt });
    const rm = await cliRun(MC.write(HC_REL, SECOND_OPEN, `second-open-${ro.toString(8)}`), { exists: true, mode: ro });
    ok(isRoot || !!(rm.receipt && rm.receipt.state === 'error' && /could not be put on disk \(EACCES\)/.test(rm.receipt.reason || '') && rm.now === rm.was),
      isRoot ? `RED (line 534's second open, 0${ro.toString(8)}): not read as root — a mode does not stop root's open; it is read where the suite runs unprivileged (the test machine, the hosted runner)`
        : `RED (line 534's second open, 0${ro.toString(8)}): the write that worked in the release is REFUSED («could not be put on disk (EACCES)»), the file left as it was`, rm.receipt);
  }
}


// ── B-ddf3 unit 3 (lane bl-vault, 主开发 r4361): six more «person» sites, each run for real on a scratch folder, its fs calls
//    RECORDED; a PLACED refusal of its sync (said by name, nothing renamed, no temp left); a RED copy with the sync taken out ──
const { Readable } = await import('node:stream');
const without = (text, re, why) => anchored(text, re, '', why);   // a red copy: the unit's sync block taken out (the release's order)
const tmpLeft = (dir, re) => fs.readdirSync(dir).filter((n) => re.test(n));

// ③ a file copied from another machine into the person's folder (src/routes/files.js crossHostTransfer, the file case)
console.log('③ a copy from another machine (src/routes/files.js crossHostTransfer)');
const FILES_REL = 'src/routes/files.js', FILES = fs.readFileSync(path.join(REPO, FILES_REL), 'utf8');
const withCht = (text) => text + '\nmodule.exports.__crossHostTransfer = crossHostTransfer;   // the suite\'s own handle (this copy only)\n';
async function chtRun(modPath, fail) {
  const dir = path.join(ROOT, `cht-${++seq}`); fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from('a made-up file of the person\'s\n'.repeat(4096)), dest = path.join(dir, 'copied.txt');
  const stand = { info: async () => ({ isDirectory: false }), _run: async () => `${buf.length}\n`, _spawn: () => ({ stdout: Readable.from([buf]) }) };   // the other machine: a stand-in of the suite's own
  const cht = require(modPath).__crossHostTransfer;
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  const out = await recorded(() => cht({ body: { src: '/made-up/source.txt', dest, srcHost: 'h-made-up' }, app: { locals: { getRemoteFs: () => stand } } }, res, { move: false }), fail);
  return { ...out, res, dest, buf, dir, now: fs.existsSync(dest) ? fs.readFileSync(dest) : null };
}
{
  const FILES_LIVE = MC.write(FILES_REL, withCht(FILES), 'files-live');   // the module with the suite's own handle (one copy, reused)
  const live = await chtRun(FILES_LIVE);
  ok(!live.err && live.res.code === 200 && !!live.now && live.now.equals(live.buf), 'the copy lands whole under its name', live.err ? live.err.message : JSON.stringify(live.res.body));
  ok(before(live.log, 'sync copied.txt.vs-partial', 'rename copied.txt.vs-partial') && !live.log.some((x) => /^(writeFileSync|fsyncSync) /.test(x)), 'its partial is synced ONCE at its end, BEFORE the rename — on the thread pool, no sync write on the loop', live.log.join(' → '));
  const f = await chtRun(FILES_LIVE, (k, p) => k === 'sync' && /\.vs-partial$/.test(String(p)));
  ok(f.res.code === 400 && /copied\.txt could not be put on disk \(EIO\) — not saved/.test(String(f.res.body && f.res.body.error)), 'a PLACED refusal of its sync is a failed copy, said by name (the answer the page toasts)', JSON.stringify(f.res.body));
  ok(!f.now && tmpLeft(f.dir, /vs-partial/).length === 0 && !f.log.some((x) => x.startsWith('rename')), '…nothing renamed, no partial left', `${fs.readdirSync(f.dir).join(', ') || 'empty'} · ${f.log.join(' → ')}`);
  const today = without(FILES, /\n {8}\/\/ B-ddf3 \(lane bl-vault, r4361\): the copy's bytes[\s\S]*?nothing was replaced`\); \}/, 'today: the partial renamed with nothing synced');
  const t = await chtRun(MC.write(FILES_REL, withCht(today), 'files-today'), (k, p) => k === 'sync' && /\.vs-partial$/.test(String(p)));
  ok(t.res.code === 200 && !t.log.some((x) => x.startsWith('sync')) && t.log.some((x) => x.startsWith('rename')), 'RED (today\'s copy): renamed with nothing synced, and a failing disk is never asked', t.log.join(' → '));
}

// ④ a copy or move across devices (src/safe-fs-worker.js copy / move — the pool's worker, its ops run here in-process)
console.log('④ a copy or move across devices (src/safe-fs-worker.js copy, move)');
const SFW_REL = 'src/safe-fs-worker.js', SFW = fs.readFileSync(path.join(REPO, SFW_REL), 'utf8');
const withOps = (text) => text + '\nmodule.exports.__OPS = OPS;   // the suite\'s own handle (this copy only)\n';
async function sfwRun(modPath, op, fail, { exdev = false } = {}) {
  const dir = path.join(ROOT, `sfw-${++seq}`), src = path.join(dir, 'src-tree'), dest = path.join(dir, 'dest-tree');
  fs.mkdirSync(path.join(src, 'inner'), { recursive: true });
  fs.writeFileSync(path.join(src, 'a.txt'), 'made-up a'); fs.writeFileSync(path.join(src, 'inner', 'b.txt'), 'made-up b');
  const OPS = require(modPath).__OPS;
  const keepRename = fs.renameSync;
  if (exdev) fs.renameSync = function placedCrossDevice(a, b) { if (path.resolve(String(a)) === src) throw Object.assign(new Error('EXDEV: a placed cross-device rename'), { code: 'EXDEV' }); return keepRename.call(fs, a, b); };   // the cross-device road, placed
  try {
    const out = await recorded(() => OPS[op]({ src, dest, overwrite: false }), fail);
    return { ...out, dir, src, dest, srcLeft: fs.existsSync(src), files: fs.existsSync(dest) ? [fs.existsSync(path.join(dest, 'a.txt')), fs.existsSync(path.join(dest, 'inner', 'b.txt'))] : null };
  } finally { fs.renameSync = keepRename; }
}
const SFW_LIVE = MC.write(SFW_REL, withOps(SFW), 'sfw-live');   // the worker with the suite's own handle (one copy, reused)
for (const [op, exdev] of [['copy', false], ['move', true]]) {
  const live = await sfwRun(SFW_LIVE, op, undefined, { exdev });
  ok(!live.err && !!live.files && live.files.every(Boolean) && (op === 'copy' || !live.srcLeft), `${op}: the tree lands whole under its name${op === 'move' ? ' and its source goes' : ''}`, live.err ? live.err.message : JSON.stringify(live.files));
  ok(before(live.log, 'fsyncSync a.txt', 'rename dest-tree.vs-partial') && before(live.log, 'fsyncSync b.txt', 'rename dest-tree.vs-partial'), `${op}: EVERY file of its partial is synced at the end of the copy, BEFORE the rename (on the pool's thread)`, live.log.join(' → '));
  const f = await sfwRun(SFW_LIVE, op, (k, p) => k === 'fsyncSync' && /b\.txt$/.test(String(p)), { exdev });
  ok(!!f.err && /dest-tree could not be put on disk \(EIO\) — not saved/.test(f.err.message), `${op}: a PLACED refusal of a sync is a failed ${op}, said by name (the toast's words)`, f.err ? f.err.message : 'NO ERROR');
  ok(!f.files && tmpLeft(f.dir, /vs-partial/).length === 0 && f.srcLeft && !f.log.some((x) => x === 'rename dest-tree.vs-partial'), `${op}: …nothing renamed, no partial left, the source kept`, `${fs.readdirSync(f.dir).join(', ')} · ${f.log.join(' → ')}`);
}
{
  const today = without(SFW, /\n {4}\/\/ B-ddf3 \(lane bl-vault, r4361\): every file of the partial[\s\S]*?\n {4}\}(?=\n {4}fs\.renameSync\(part, dest\);)/, 'today: the staged copy renamed with nothing synced');
  ok(today !== SFW && (today.match(/fsyncSync/g) || []).length < (SFW.match(/fsyncSync/g) || []).length, 'RED setup: today\'s worker (both syncs taken out)', today === SFW ? 'nothing removed' : 'removed');
  const t = await sfwRun(MC.write(SFW_REL, withOps(today), 'sfw-today'), 'copy', (k, p) => k === 'fsyncSync');
  ok(!t.err && !t.log.some((x) => x.startsWith('fsyncSync')) && t.log.includes('rename dest-tree.vs-partial'), 'RED (today\'s copy): renamed with nothing synced, and a failing disk is never asked', t.log.join(' → '));
}

// ⑤ a DAV upload (src/webdav.js, the PUT)
console.log('⑤ a DAV upload (src/webdav.js PUT)');
const DAV_REL = 'src/webdav.js', DAV = fs.readFileSync(path.join(REPO, DAV_REL), 'utf8');
async function davRun(modPath, fail) {
  const dir = path.join(ROOT, `dav-${++seq}`); fs.mkdirSync(dir, { recursive: true });
  const { registerWebdav } = require(modPath);
  let handler = null;
  registerWebdav({ use: (p, fn) => { if (p === '/dav') handler = fn; } }, { tokens: { resolve: () => ({ mode: 'rw', root: dir }) } });   // a token store of the suite's own: one share, the scratch folder
  const buf = Buffer.from('a made-up upload\n'.repeat(2048));
  const req = Object.assign(Readable.from([buf]), { method: 'PUT', path: '/upload.txt', url: '/upload.txt', headers: {} });
  let done; const finished = new Promise((r) => { done = r; });
  const res = { code: 200, text: '', headers: {}, set(k, v) { this.headers[k] = v; return this; }, type() { return this; }, status(c) { this.code = c; return this; }, end() { done(); return this; }, send(t) { this.text = String(t); done(); return this; } };
  const out = await recorded(async () => { await handler(req, res); await Promise.race([finished, new Promise((r) => setTimeout(r, 5000))]); }, fail);
  const target = path.join(dir, 'upload.txt');
  return { ...out, res, dir, buf, now: fs.existsSync(target) ? fs.readFileSync(target) : null };
}
{
  const live = await davRun(path.join(REPO, DAV_REL));
  ok(live.res.code === 201 && !!live.now && live.now.equals(live.buf), 'the upload lands whole under its name (201)', `${live.res.code} ${live.res.text}`);
  ok(live.log.some((x) => /^sync upload\.txt\.vsdav-/.test(x)) && live.log.findIndex((x) => /^sync upload\.txt\.vsdav-/.test(x)) < live.log.findIndex((x) => /^rename upload\.txt\.vsdav-/.test(x)) && !live.log.some((x) => /^(writeFileSync|fsyncSync) /.test(x)), 'its temp is synced ONCE at its end, BEFORE the rename — on the thread pool', live.log.join(' → '));
  const f = await davRun(path.join(REPO, DAV_REL), (k, p) => k === 'sync' && /\.vsdav-/.test(String(p)));
  ok(f.res.code === 500 && /upload\.txt could not be put on disk \(EIO\) — not saved/.test(f.res.text), 'a PLACED refusal of its sync is a failed upload, said by name (a 500 whose body names it)', `${f.res.code} ${f.res.text}`);
  await new Promise((r) => setTimeout(r, 50));
  ok(!f.now && tmpLeft(f.dir, /vsdav-/).length === 0 && !f.log.some((x) => x.startsWith('rename')), '…nothing renamed, no temp left', `${fs.readdirSync(f.dir).join(', ') || 'empty'} · ${f.log.join(' → ')}`);
  const today = without(DAV, /\n {2}try \{ h = await fsp\.open\(tmp, 'r\+'\); await h\.sync\(\); \} catch \(se\) \{ fault = se; \}/, 'today: the upload renamed with nothing synced');
  const t = await davRun(MC.write(DAV_REL, today, 'dav-today'), (k, p) => k === 'sync');
  ok(t.res.code === 201 && !t.log.some((x) => x.startsWith('sync')), 'RED (today\'s upload): renamed with nothing synced, and a failing disk is never asked', `${t.res.code} · ${t.log.join(' → ')}`);
}

// ⑥ a design file of the person's (src/design-fs.js writeUser, through its action)
console.log('⑥ a design file (src/design-fs.js writeUser)');
const DFS_REL = 'src/design-fs.js', DFS = fs.readFileSync(path.join(REPO, DFS_REL), 'utf8');
async function dfsRun(modPath, fail) {
  const dir = path.join(ROOT, `design-${++seq}`); fs.mkdirSync(dir, { recursive: true });
  const text = JSON.stringify({ tweak: 'a made-up value' });
  const out = await recorded(() => require(modPath).run('write-user', { dir, text }), fail);
  const f = path.join(dir, 'user.json');
  return { ...out, dir, text, now: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null };
}
{
  const live = await dfsRun(path.join(REPO, DFS_REL));
  const iS = live.log.findIndex((x) => /^sync \.user\.json\..*\.tmp$/.test(x)), iR = live.log.findIndex((x) => /^rename \.user\.json\..*\.tmp$/.test(x));
  ok(!!live.r && live.r.ok === true && live.now === live.text && iS >= 0 && iS < iR, 'the design file lands whole, its handle synced BEFORE the rename (on the thread pool)', `${JSON.stringify(live.r)} · ${live.log.join(' → ')}`);
  const f = await dfsRun(path.join(REPO, DFS_REL), (k, p) => k === 'sync' && /\.user\.json\./.test(String(p)));
  ok(!!f.r && f.r.ok === false && f.r.code === 'write_failed' && /\(EIO\)/.test(String(f.r.why || f.r.error || '')) && f.now === null && tmpLeft(f.dir, /\.tmp$/).length === 0 && !f.log.some((x) => x.startsWith('rename')), 'a PLACED refusal of its sync is a failed write said by name (write_failed, the chip\'s words): nothing renamed, no temp left', `${JSON.stringify(f.r)} · ${f.log.join(' → ')}`);
  const today = without(DFS, /\n {4}await fh\.sync\(\);[^\n]*/, 'today: the handle closed and renamed with nothing synced');
  const t = await dfsRun(MC.write(DFS_REL, today, 'design-today'), (k, p) => k === 'sync');
  ok(!!t.r && t.r.ok === true && !t.log.some((x) => x.startsWith('sync')), 'RED (today\'s write): renamed with nothing synced, and a failing disk is never asked', t.log.join(' → '));
}

// ⑦ an export the person asked for (src/task-groups.js TaskGroupManager.exportToFile)
console.log('⑦ a Task Group export (src/task-groups.js exportToFile)');
const TG_REL = 'src/task-groups.js', TG = fs.readFileSync(path.join(REPO, TG_REL), 'utf8');
async function tgRun(modPath, fail) {
  const dir = path.join(ROOT, `export-${++seq}`); fs.mkdirSync(dir, { recursive: true });
  const { TaskGroupManager } = require(modPath);
  const m = new TaskGroupManager({ dataDir: path.join(dir, 'data'), onChange: () => { } });
  const t = m.create({ title: 'a made-up group', objective: 'made-up', folders: [dir] });
  const file = path.join(dir, 'out', 'group.md');
  const out = await recorded(() => m.exportToFile(t.id, file), fail);
  return { ...out, dir, file, now: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null };
}
{
  const live = await tgRun(path.join(REPO, TG_REL));
  ok(!live.err && live.r === live.file && !!live.now && /made-up group/.test(live.now), 'the export lands whole under its name', live.err ? live.err.message : String(live.r));
  ok(before(live.log, 'sync group.md.tmp', 'rename group.md.tmp') && !live.log.some((x) => /^(writeFileSync|fsyncSync|rename(Sync)?) group/.test(x) && /writeFileSync|fsyncSync/.test(x)), 'it is written, synced BEFORE the rename — through the thread pool, nothing synchronous on the loop', live.log.join(' → '));
  const f = await tgRun(path.join(REPO, TG_REL), (k, p) => k === 'sync' && /group\.md\.tmp$/.test(String(p)));
  ok(!!f.err && /group\.md could not be put on disk \(EIO\) — not exported/.test(f.err.message) && !f.now && tmpLeft(path.join(f.dir, 'out'), /\.tmp$/).length === 0 && !f.log.some((x) => x.startsWith('rename')), 'a PLACED refusal of its sync is a failed export said by name (the toast\'s words): nothing renamed, no temp left', f.err ? f.err.message : 'NO ERROR');
  const today = without(TG, / await h\.sync\(\);(?= \} catch \(e\) \{ fault = e; \}\n {4}if \(h\) \{ const c = await h\.close)/, 'today: the export renamed with nothing synced');
  const t = await tgRun(MC.write(TG_REL, today, 'export-today'), (k, p) => k === 'sync');
  ok(!t.err && !t.log.some((x) => x.startsWith('sync')), 'RED (today\'s export, the sync taken out): renamed with nothing synced, a failing disk never asked', t.log.join(' → '));
}

// ⑧ a page's published content (src/server/published-pages.js publishContent)
console.log('⑧ a published page (src/server/published-pages.js publishContent)');
const PP_REL = 'src/server/published-pages.js', PP = fs.readFileSync(path.join(REPO, PP_REL), 'utf8');
async function ppRun(modPath, fail) {
  const dir = path.join(ROOT, `pages-${++seq}`); fs.mkdirSync(dir, { recursive: true });
  const pages = require(modPath).create({ dataDir: dir });
  const out = await recorded(() => pages.publishContent({ html: '<!doctype html><title>a made-up page</title>', name: 'made-up', srcKey: 'local:/made-up/page.html', sessionId: 's-made-up' }), fail);
  return { ...out, dir, pages, list: pages.list({}) };
}
{
  const live = await ppRun(path.join(REPO, PP_REL));
  const iS = live.log.findIndex((x) => /^sync .*\.html\.tmp$/.test(x)), iR = live.log.findIndex((x) => /^rename .*\.html\.tmp$/.test(x));
  ok(!live.err && !!live.r && !!live.r.page && live.list.length === 1, 'the page is published and recorded', live.err ? live.err.message : JSON.stringify(live.r && (live.r.error || live.r.page && live.r.page.id)));
  ok(iS >= 0 && iS < iR && !live.log.some((x) => /^(writeFileSync|fsyncSync) .*\.html/.test(x)), 'its content is written, synced BEFORE the rename — through the thread pool (25 MB never on the loop)', live.log.join(' → '));
  const f = await ppRun(path.join(REPO, PP_REL), (k, p) => k === 'sync' && /\.html\.tmp$/.test(String(p)));
  ok(!!f.r && /the page could not be put on disk \(EIO\) — not published/.test(String(f.r.error)) && f.list.length === 0 && tmpLeft(path.join(f.dir, 'published-pages'), /\.tmp$/).length === 0 && !f.log.some((x) => x.startsWith('rename')), 'a PLACED refusal of its sync is a failed publish said by name: nothing renamed, nothing recorded, no temp left', `${JSON.stringify(f.r)} · ${f.log.join(' → ')}`);
  const today = without(PP, / await h\.sync\(\);(?= \} catch \(e\) \{ fault = e; \}\n {6}if \(h\) \{ const c = await h\.close)/, 'today: the page renamed with nothing synced');
  const t = await ppRun(MC.write(PP_REL, today, 'pages-today'), (k, p) => k === 'sync');
  ok(!!t.r && !!t.r.page && !t.log.some((x) => x.startsWith('sync')), 'RED (today\'s publish, the sync taken out): renamed with nothing synced, a failing disk never asked', t.log.join(' → '));
}
// browser-serve's planLaunch file is NOT a person's file (a planned copy, made again at every start): read «derived» by the census

report();

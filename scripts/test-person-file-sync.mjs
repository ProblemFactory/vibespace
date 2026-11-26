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
//     RED: each with the sync taken out. The census reads them «synced» (OWED_MAX 141 → 133, browser-serve's planned copy «derived»).
//   ⓓ and ③–⑧ the cure of line 1044 (主开发 r4634): ONE door, src/fd-close.js — line 1017's two names ONCE, byte for byte, and
//     syncUnsupportedLands beside them: a file system that does not do a sync (EINVAL, ENOTSUP, EOPNOTSUPP, ENOSYS) LANDS the file,
//     said ONCE a site; every other failure of the sync or of the CLOSE is a failed write. Each site also: a PLACED failure at the
//     close, a destination that already stands (byte for byte after each placed failure), and RED copies of the 31dca7dd2 form.
//     ⑦ two exports to one path at once (each its own temp); ⑧ the person's own Publish PLACED inside the content's write (one
//     source, one page), two re-publishes at once (one order), a page taken down mid-write (it stays down).
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

// THE RECORDER: the real fs calls run; each one this law is about is written down in order. `fail(kind, p)` PLACES an answer at a
// call: false = none; true = a failed call (EIO); a string = a failed call with THAT code (EINVAL: a file system that does not do a
// sync); a function = a placed HOLD (run and awaited inside the call, then the call goes on). Kinds: sync and close (a handle of
// fs.promises.open), fsyncSync and closeSync (a number fs.openSync gave), rename (fs.promises.rename: a HOLD only)
async function recorded(fn, fail = () => false) {
  const log = [], P = fs.promises, keep = { open: P.open, rename: P.rename, renameSync: fs.renameSync, fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, linkSync: fs.linkSync, openSync: fs.openSync, writeFileSync: fs.writeFileSync };
  const fdPath = new Map(), base = (p) => path.basename(String(p));
  const refused = (kind, p, f) => { const code = typeof f === 'string' ? f : 'EIO'; log.push(`FAILED ${kind} ${base(p)}`); return Object.assign(new Error(`${code}: a planted failed ${kind}`), { code }); };
  P.open = async (p, ...a) => {
    const h = await keep.open.call(P, p, ...a), sync0 = h.sync.bind(h), close0 = h.close.bind(h);
    h.sync = async () => { const f = fail('sync', p); if (typeof f === 'function') await f(); else if (f) throw refused('sync', p, f); log.push(`sync ${base(p)}`); return sync0(); };
    h.close = async () => { const f = fail('close', p); if (typeof f === 'function') await f(); else if (f) { await close0().catch(() => { }); throw refused('close', p, f); } log.push(`close ${base(p)}`); return close0(); };
    return h;
  };
  fs.openSync = (p, ...a) => { const fd = keep.openSync(p, ...a); fdPath.set(fd, p); return fd; };
  fs.fsyncSync = (fd) => { const p = fdPath.get(fd) || '?', f = fail('fsyncSync', p); if (f && typeof f !== 'function') throw refused('fsyncSync', p, f); log.push(`fsyncSync ${base(p)}`); return keep.fsyncSync(fd); };
  fs.closeSync = (fd) => { if (!fdPath.has(fd)) return keep.closeSync(fd); const p = fdPath.get(fd), f = fail('closeSync', p); fdPath.delete(fd); if (f && typeof f !== 'function') { keep.closeSync(fd); throw refused('closeSync', p, f); } return keep.closeSync(fd); };
  fs.renameSync = (a, b) => { log.push(`rename ${base(a)}`); return keep.renameSync(a, b); };
  P.rename = async (a, b) => { const f = fail('rename', a); if (typeof f === 'function') await f(); log.push(`rename ${base(a)}`); return keep.rename.call(P, a, b); };
  fs.writeFileSync = (p, ...a) => { log.push(`writeFileSync ${base(p)}`); return keep.writeFileSync(p, ...a); };
  fs.linkSync = (a, b) => { log.push(`link ${base(a)}`); return keep.linkSync(a, b); };
  try { const r = await fn(); return { log, r }; } catch (e) { return { log, err: e }; } finally { Object.assign(P, { open: keep.open, rename: keep.rename }); Object.assign(fs, { renameSync: keep.renameSync, fsyncSync: keep.fsyncSync, closeSync: keep.closeSync, linkSync: keep.linkSync, openSync: keep.openSync, writeFileSync: keep.writeFileSync }); }
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


// ── B-ddf3 unit 3 (lane bl-vault, 主开发 r4361; its cure, r4634): six more «person» sites, each run for real on a scratch folder, its fs
//    calls RECORDED. At each: the live road (synced before the rename); a PLACED failure at the sync and at the CLOSE (said by name,
//    nothing renamed, no temp left), on a new name and over a destination that already STANDS (byte for byte as it was after each); a
//    PLACED «no sync» answer (the file lands, said ONCE a site); RED copies: the sync taken out (today's order), and the door's reading
//    taken out (the 31dca7dd2 form: a folder whose file system does not do a sync refused the person's file) ──
const { Readable } = await import('node:stream');
const without = (text, re, why) => anchored(text, re, '', why);   // a red copy: a block taken out (anchored: a moved line fails by name)
const tmpLeft = (dir, re) => fs.readdirSync(dir).filter((n) => re.test(n));
const OLD = Buffer.from('the person\'s own bytes, standing there before\n'.repeat(64));
const said = [];   // the sites' own sink (the hub's journal: console.warn), read for «said once a site»
{ const warn0 = console.warn; console.warn = (...a) => { const s = a.map(String).join(' '); said.push(s); if (!/its file system does not do a sync/.test(s)) warn0.apply(console, a); }; }
const saidOf = (where) => said.filter((s) => s.includes(`${where}: its file system does not do a sync (`));
const SITE = {
  cht: { where: 'a copy between machines', tag: 'files', then: 'fault = se;' },
  sfw: { where: 'a copy across devices', tag: 'safe-fs', then: 'fault = se;' },
  dav: { where: 'a WebDAV upload', tag: 'webdav', then: 'fault = se;' },
  dfs: { where: 'a design file', tag: 'design', then: 'throw se;', own: "if (!(se && NO_SYNC.has(se.code))) throw se; if (!noSyncSaid) { noSyncSaid = true; try { console.warn(`[design] ${noSyncWords('a design file', se.code)}`); } catch { } } }", ownTo: 'throw se; }' },   // the DEVICE's own reading (r4675): never the hub's helper
  tg: { where: 'a Task Group export', tag: 'task-groups', then: 'fault = se;' },
  pp: { where: 'a published page', tag: 'pages', then: 'fault = se;' },
};
const doorCall = (s) => "if (!FC.syncUnsupportedLands(se, '" + s.where + "', (l) => console.warn(`[" + s.tag + "] ${l}`))) " + s.then;   // stale-pins: kept (the five HUB sites' door call; design-fs keeps its OWN reading since r4675 — its red is SITE.dfs.own)
const noDoor = (text, s) => s.own ? anchored(text, s.own, s.ownTo, `the 31dca7dd2 form at ${s.where}: no sync at all is a refused file`) : anchored(text, doorCall(s), s.then, `the 31dca7dd2 form at ${s.where}: no sync at all is a refused file`);
// «said once a site»: the FIRST no-sync answer at a site says its words once (the site's name and the code, no path); a later one, nothing
function saidOnce(s, code, before, what) {
  const now = saidOf(s.where);
  ok(now.length === 1 && before === 0 && now[0].includes(`${s.where}: its file system does not do a sync (${code}) — its new bytes took their name unsynced`) && !/\/(tmp|var|home)\//.test(now[0]),
    `${what}: said ONCE in the site's own sink — «${s.where}: its file system does not do a sync (${code}) …», no path`, now);
}

// ⓓ THE DOOR (src/fd-close.js): line 1017's two names ONCE, byte for byte, and this unit's one function beside them
console.log('ⓓ the door (src/fd-close.js): SYNC_UNSUPPORTED and its words as line 1017 writes them, once; syncUnsupportedLands');
{
  const FC_REL = 'src/fd-close.js', FCT = fs.readFileSync(path.join(REPO, FC_REL), 'utf8');
  // THE MEETING (主开发 r4635): line 1017 (lane bl-jobs, B-bcb8 unit B) adds these lines at this place; this unit adds the same lines.
  // The united file declares them ONCE, as line 1017 writes them — a second declaration, or one letter apart, is red here
  const L1017 = "/** THE codes of a sync the file system REFUSES TO DO AT ALL (r4474): EINVAL — the kernel's own answer for a file system with no fsync\n *  operation at all (Linux vfs_fsync_range), and fsync(2)'s for a file kind that cannot be synced; ENOTSUP / EOPNOTSUPP — a file\n *  system (some network and FUSE ones) answering that it does not support the operation (one number on Linux, two names elsewhere);\n *  ENOSYS — the call itself not implemented (Linux's FUSE layer turns a daemon's ENOSYS into success; another kernel may pass it on).\n *  EVERY OTHER CODE (EIO, ENOSPC, EDQUOT, EROFS, an unknown one) is where a WRITE error first shows on a network folder: the bytes may\n *  not be there — a FAILED WRITE */\nconst SYNC_UNSUPPORTED = new Set(['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS']);\n/** THE words of a sync the file system does not do (the one spelling) */\nfunction syncUnsupportedWords(where, code) { return `${where}: its file system does not do a sync (${code}) — its new bytes took their name unsynced`; }\n";
  const oneBlock = (text) => text.split(L1017).length === 2 && (text.match(/\bconst SYNC_UNSUPPORTED\b/g) || []).length === 1 && (text.match(/\bfunction syncUnsupportedWords\b/g) || []).length === 1;
  ok(oneBlock(FCT), 'the set and its words stand ONCE, byte for byte as line 1017 writes them (its comment, the four codes, the words)');
  const twice = FCT.replace(L1017, L1017 + '\n' + L1017), letter = FCT.replace("'ENOSYS']);", "'ENOSIS']);"), moved = FCT.replace(L1017, L1017.replace('took their name unsynced', 'took its name unsynced'));
  ok(!oneBlock(twice) && !oneBlock(letter) && !oneBlock(moved) && twice !== FCT && letter !== FCT && moved !== FCT, 'CONTROL: declared twice, one code a letter apart, or the words a word apart — each is red');
  ok(!/require\((?!['"]fs['"])[^)]*\)/.test(FCT.replace(/^\s*(\/\/|\*).*$/gm, '')), 'the door still requires node\'s fs only (the wrappers load it eagerly)');
  const FCM = require(path.join(REPO, FC_REL)), heard = [], hear = (l) => heard.push(l), e = (code) => Object.assign(new Error(`${code}: made up`), { code });
  ok([...FCM.SYNC_UNSUPPORTED].sort().join(',') === 'EINVAL,ENOSYS,ENOTSUP,EOPNOTSUPP', 'exactly four codes mean «this file system does not do a sync»', [...FCM.SYNC_UNSUPPORTED]);
  const lands = ['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'].map((c) => FCM.syncUnsupportedLands(e(c), 'a made-up site', hear));
  ok(lands.every((x) => x === true) && heard.length === 1 && heard[0] === FCM.syncUnsupportedWords('a made-up site', 'EINVAL'), 'each of the four LANDS (true); the words said ONCE a site, at its first', heard);
  const fails = ['EIO', 'ENOSPC', 'EDQUOT', 'EROFS', 'EMADEUP'].map((c) => FCM.syncUnsupportedLands(e(c), 'a second made-up site', hear)).concat([FCM.syncUnsupportedLands(new Error('no code'), 'a third', hear), FCM.syncUnsupportedLands(null, 'a fourth', hear)]);
  ok(fails.every((x) => x === false) && heard.length === 1, 'EIO, ENOSPC, EDQUOT, EROFS, an unknown code, no code: a FAILED WRITE (false), nothing said', fails);
  ok(FCM.syncUnsupportedLands(e('EINVAL'), 'a fifth', () => { throw new Error('a sink that throws'); }) === true, 'a sink that throws: the file still lands, nothing more');
  // THE DEVICE's OWN READING (主开发 r4675): src/design-fs.js rides the device bundle and never asks the hub's helper; its four codes and its
  // words are the helper's LETTER FOR LETTER (test-architecture §107: the bundle does not carry src/fd-close.js)
  const DFST = fs.readFileSync(path.join(REPO, 'src/design-fs.js'), 'utf8');
  const codesOf = (text, name) => ((text.match(new RegExp(`const ${name} = new Set\\((\\[[^\\]]*\\])\\);`)) || [])[1] || null);
  const wordsOf = (text, re) => ((text.match(re) || [])[1] || null);
  const FC_WORDS = /function syncUnsupportedWords\(where, code\) \{ return (`[^`]*`); \}/, DFS_WORDS = /const noSyncWords = \(where, code\) => (`[^`]*`);/;
  const samePin = (dfs) => !!codesOf(FCT, 'SYNC_UNSUPPORTED') && codesOf(dfs, 'NO_SYNC') === codesOf(FCT, 'SYNC_UNSUPPORTED') && !!wordsOf(FCT, FC_WORDS) && wordsOf(dfs, DFS_WORDS) === wordsOf(FCT, FC_WORDS);
  ok(samePin(DFST) && !/require\([^)]*fd-close/.test(DFST), 'the design file\'s OWN reading (a device input): the helper\'s four codes and its words, letter for letter — and it never asks src/fd-close.js', { codes: codesOf(DFST, 'NO_SYNC'), words: wordsOf(DFST, DFS_WORDS) });
  ok(!samePin(DFST.replace("'ENOSYS']);", "'ENOSIS']);")) && !samePin(DFST.replace('took their name unsynced`;', 'took its name unsynced`;')) && DFST.includes("'ENOSYS']);") && DFST.includes('took their name unsynced`;'), 'CONTROL: one code a letter apart, or the words a word apart — red');
  // ONE CADENCE (主开发 r4675): in the helper only syncUnsupportedLands reads the set or says the words — once a site for the life of a
  // process or of a worker thread; line 1017's rename door, once united here, says through it (its own say at every write is red)
  const cadenceOne = (text) => { const i = text.indexOf('function syncUnsupportedLands('), j = i < 0 ? -1 : text.indexOf('\n}\n', i); if (i < 0 || j < 0) return false; const rest = text.slice(0, i) + text.slice(j); return !/SYNC_UNSUPPORTED\.has\(/.test(rest) && (rest.match(/\bsyncUnsupportedWords\(/g) || []).length === 1; };
  const L1017_SYNC = "    if (sync) { try { fs.fsyncSync(fd); } catch (e) { if (!SYNC_UNSUPPORTED.has(e && e.code)) throw e; try { if (typeof say === 'function') say(syncUnsupportedWords(where, e.code)); } catch { /* a sink that throws says nothing more */ } } }   // r4563: `sync: false` — a caller's named choice (a buffer)";   // line 1017's own rename door's sync line, as it stands on its tip (d4e8e2535): its own say at every write
  ok(cadenceOne(FCT) && !cadenceOne(FCT + '\nfunction renameSyncedAsWritten(fd, where, say, sync) {\n' + L1017_SYNC + '\n}\n'), 'ONE cadence: only syncUnsupportedLands reads the set and says the words — CONTROL: line 1017\'s rename door as written on its tip (its own say at every write) is red');
  if (typeof FCM.renameSynced === 'function') {   // the united file (line 1017 and this line both in): its rename door says ONCE a site
    const heardR = [], dirR = path.join(ROOT, `united-${++seq}`); fs.mkdirSync(dirR, { recursive: true });
    const k0 = fs.fsyncSync; fs.fsyncSync = () => { throw Object.assign(new Error('EINVAL: a placed no-sync'), { code: 'EINVAL' }); };
    try { for (const n of ['a', 'b']) FCM.renameSynced(path.join(dirR, `${n}.tmp`), path.join(dirR, `${n}.json`), '{}', { where: 'a united made-up record', say: (l) => heardR.push(l) }); } finally { fs.fsyncSync = k0; }
    ok(heardR.length === 1 && fs.existsSync(path.join(dirR, 'a.json')) && fs.existsSync(path.join(dirR, 'b.json')), 'the united rename door: both records LAND on a folder with no sync, its words said ONCE a site', heardR);
  } else console.log('  · line 1017\'s rename door is not in this tree: the cadence census above judges it once both are in');
}

// ③ a file copied from another machine into the person's folder (src/routes/files.js crossHostTransfer, the file case)
console.log('③ a copy from another machine (src/routes/files.js crossHostTransfer)');
const FILES_REL = 'src/routes/files.js', FILES = fs.readFileSync(path.join(REPO, FILES_REL), 'utf8');
const withCht = (text) => text + '\nmodule.exports.__crossHostTransfer = crossHostTransfer;   // the suite\'s own handle (this copy only)\n';
async function chtRun(modPath, fail, { stand = null } = {}) {
  const dir = path.join(ROOT, `cht-${++seq}`); fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from('a made-up file of the person\'s\n'.repeat(4096)), dest = path.join(dir, 'copied.txt');
  if (stand) fs.writeFileSync(dest, stand);   // a destination that already stands (the copy with overwrite)
  const stand_ = { info: async () => ({ isDirectory: false }), _run: async () => `${buf.length}\n`, _spawn: () => ({ stdout: Readable.from([buf]) }) };   // the other machine: a stand-in of the suite's own
  const cht = require(modPath).__crossHostTransfer;
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  const out = await recorded(() => cht({ body: { src: '/made-up/source.txt', dest, srcHost: 'h-made-up', overwrite: !!stand }, app: { locals: { getRemoteFs: () => stand_ } } }, res, { move: false }), fail);
  return { ...out, res, dest, buf, dir, now: fs.existsSync(dest) ? fs.readFileSync(dest) : null };
}
{
  const S = SITE.cht, at = (kind, code = true) => (k, p) => k === kind && /\.vs-partial$/.test(String(p)) ? code : false;
  const FILES_LIVE = MC.write(FILES_REL, withCht(FILES), 'files-live');   // the module with the suite's own handle (one copy, reused)
  const live = await chtRun(FILES_LIVE);
  ok(!live.err && live.res.code === 200 && !!live.now && live.now.equals(live.buf), 'the copy lands whole under its name', live.err ? live.err.message : JSON.stringify(live.res.body));
  ok(before(live.log, 'sync copied.txt.vs-partial', 'rename copied.txt.vs-partial') && !live.log.some((x) => /^(writeFileSync|fsyncSync) /.test(x)), 'its partial is synced ONCE at its end, BEFORE the rename — through the thread pool (no writeFileSync / fsyncSync of it)', live.log.join(' → '));
  for (const kind of ['sync', 'close']) {
    const f = await chtRun(FILES_LIVE, at(kind));
    ok(f.res.code === 400 && /copied\.txt could not be put on disk \(EIO\) — not saved/.test(String(f.res.body && f.res.body.error)) && !f.now && tmpLeft(f.dir, /vs-partial/).length === 0 && !f.log.some((x) => x.startsWith('rename')),
      `a PLACED failure at the ${kind} is a failed copy, said by name (the answer the page toasts): nothing renamed, no partial left`, `${JSON.stringify(f.res.body)} · ${f.log.join(' → ')}`);
    const s = await chtRun(FILES_LIVE, at(kind), { stand: OLD });
    ok(s.res.code === 400 && !!s.now && s.now.equals(OLD) && tmpLeft(s.dir, /vs-partial/).length === 0, `…over a file that already STANDS (the copy with overwrite): after the placed failure at the ${kind} it is byte for byte as it was`, `${JSON.stringify(s.res.body)} · ${s.now ? s.now.length : 'gone'} bytes`);
  }
  const n0 = saidOf(S.where).length, ns = await chtRun(FILES_LIVE, at('sync', 'EINVAL'));
  ok(ns.res.code === 200 && !!ns.now && ns.now.equals(ns.buf) && ns.log.some((x) => x === 'rename copied.txt.vs-partial'), 'a file system that does NOT DO A SYNC (a placed EINVAL): the copy LANDS whole', `${ns.res.code} · ${ns.log.join(' → ')}`);
  saidOnce(S, 'EINVAL', n0, 'its no-sync answer');
  const ns2 = await chtRun(FILES_LIVE, at('sync', 'EINVAL'));
  ok(ns2.res.code === 200 && saidOf(S.where).length === 1, '…a second such copy lands too, and nothing more is said (once a site)', saidOf(S.where));
  const nd = await chtRun(MC.write(FILES_REL, withCht(noDoor(FILES, S)), 'files-nodoor'), at('sync', 'EINVAL'));
  ok(nd.res.code === 400 && !nd.now, 'RED (the 31dca7dd2 form, the door\'s reading taken out): a folder with no sync REFUSED the person\'s copy', JSON.stringify(nd.res.body));
  const today = without(FILES, /\n {8}\/\/ B-ddf3 \(lane bl-vault, r4361\): the copy's bytes[\s\S]*?nothing was replaced`\); \}/, 'today: the partial renamed with nothing synced');
  const t = await chtRun(MC.write(FILES_REL, withCht(today), 'files-today'), at('sync'));
  ok(t.res.code === 200 && !t.log.some((x) => x.startsWith('sync')) && t.log.some((x) => x.startsWith('rename')), 'RED (today\'s copy): renamed with nothing synced, and a failing disk is never asked', t.log.join(' → '));
}

// ④ a copy or move across devices (src/safe-fs-worker.js copy / move — the pool's worker, its ops run here in-process)
console.log('④ a copy or move across devices (src/safe-fs-worker.js copy, move)');
const SFW_REL = 'src/safe-fs-worker.js', SFW = fs.readFileSync(path.join(REPO, SFW_REL), 'utf8');
const withOps = (text) => text + '\nmodule.exports.__OPS = OPS;   // the suite\'s own handle (this copy only)\n';
async function sfwRun(modPath, op, fail, { exdev = false, stand = false } = {}) {
  const dir = path.join(ROOT, `sfw-${++seq}`), src = path.join(dir, 'src-tree'), dest = path.join(dir, 'dest-tree');
  fs.mkdirSync(path.join(src, 'inner'), { recursive: true });
  fs.writeFileSync(path.join(src, 'a.txt'), 'made-up a'); fs.writeFileSync(path.join(src, 'inner', 'b.txt'), 'made-up b');
  if (stand) { fs.mkdirSync(dest); fs.writeFileSync(path.join(dest, 'old.txt'), OLD); }   // a destination that already stands
  const OPS = require(modPath).__OPS;
  const keepRename = fs.renameSync;
  if (exdev) fs.renameSync = function placedCrossDevice(a, b) { if (path.resolve(String(a)) === src) throw Object.assign(new Error('EXDEV: a placed cross-device rename'), { code: 'EXDEV' }); return keepRename.call(fs, a, b); };   // the cross-device road, placed
  try {
    const out = await recorded(() => OPS[op]({ src, dest, overwrite: false }), fail);
    return { ...out, dir, src, dest, srcLeft: fs.existsSync(src), old: fs.existsSync(path.join(dest, 'old.txt')) ? fs.readFileSync(path.join(dest, 'old.txt')) : null, files: fs.existsSync(path.join(dest, 'a.txt')) || fs.existsSync(path.join(dest, 'inner')) ? [fs.existsSync(path.join(dest, 'a.txt')), fs.existsSync(path.join(dest, 'inner', 'b.txt'))] : null };
  } finally { fs.renameSync = keepRename; }
}
const SFW_LIVE = MC.write(SFW_REL, withOps(SFW), 'sfw-live');   // the worker with the suite's own handle (one copy, reused)
{
  const S = SITE.sfw;
  for (const [op, exdev] of [['copy', false], ['move', true]]) {
    const live = await sfwRun(SFW_LIVE, op, undefined, { exdev });
    ok(!live.err && !!live.files && live.files.every(Boolean) && (op === 'copy' || !live.srcLeft), `${op}: the tree lands whole under its name${op === 'move' ? ' and its source goes' : ''}`, live.err ? live.err.message : JSON.stringify(live.files));
    ok(before(live.log, 'fsyncSync a.txt', 'rename dest-tree.vs-partial') && before(live.log, 'fsyncSync b.txt', 'rename dest-tree.vs-partial'), `${op}: EVERY file of its partial is synced at the end of the copy, BEFORE the rename (on the pool's thread)`, live.log.join(' → '));
    for (const kind of ['fsyncSync', 'closeSync']) {
      const f = await sfwRun(SFW_LIVE, op, (k, p) => k === kind && /b\.txt$/.test(String(p)), { exdev });
      ok(!!f.err && /dest-tree could not be put on disk \(EIO\) — not saved/.test(f.err.message) && !f.files && tmpLeft(f.dir, /vs-partial/).length === 0 && f.srcLeft && !f.log.some((x) => x === 'rename dest-tree.vs-partial'),
        `${op}: a PLACED failure at the ${kind === 'fsyncSync' ? 'sync' : 'close'} is a failed ${op}, said by name (the toast's words): nothing renamed, no partial left, the SOURCE kept`, `${f.err ? f.err.message : 'NO ERROR'} · ${fs.readdirSync(f.dir).join(', ')}`);
    }
  }
  // the staged road never takes a name that stands: a copy onto a standing destination is refused before any byte (EEXIST); a move with
  // overwrite removes its destination before the copy, as the release did — said as left on row B-ddf3, never reached here
  const s = await sfwRun(SFW_LIVE, 'copy', (k) => k === 'fsyncSync', { stand: true });
  ok(!!s.err && s.err.code === 'EEXIST' && !!s.old && s.old.equals(OLD) && !s.files && tmpLeft(s.dir, /vs-partial/).length === 0, 'over a destination that already STANDS: the staged copy is refused (EEXIST) before any byte — the standing file byte for byte as it was', s.err ? s.err.code : 'NO ERROR');
  const n0 = saidOf(S.where).length, ns = await sfwRun(SFW_LIVE, 'copy', (k) => k === 'fsyncSync' ? 'EINVAL' : false);
  ok(!ns.err && !!ns.files && ns.files.every(Boolean) && ns.log.includes('rename dest-tree.vs-partial'), 'a file system that does NOT DO A SYNC (EINVAL at every file): the copy LANDS whole', ns.err ? ns.err.message : ns.log.join(' → '));
  saidOnce(S, 'EINVAL', n0, 'its no-sync answer (once for the whole tree; once a site in each pool WORKER: each has its own — here the worker\'s ops run in-process)');
  const nm = await sfwRun(SFW_LIVE, 'move', (k) => k === 'fsyncSync' ? 'ENOSYS' : false, { exdev: true });
  ok(!nm.err && !!nm.files && nm.files.every(Boolean) && !nm.srcLeft && saidOf(S.where).length === 1, '…a cross-device move on it (ENOSYS) lands, its source goes after the rename, and nothing more is said', nm.err ? nm.err.message : saidOf(S.where));
  const nd = await sfwRun(MC.write(SFW_REL, withOps(noDoor(SFW, S)), 'sfw-nodoor'), 'copy', (k) => k === 'fsyncSync' ? 'EINVAL' : false);
  ok(!!nd.err && !nd.files, 'RED (the 31dca7dd2 form, the door\'s reading taken out): a folder with no sync REFUSED the copy', nd.err ? nd.err.message : 'NO ERROR');
  const today = without(SFW, /\n {4}\/\/ B-ddf3 \(lane bl-vault, r4361\): every file of the partial[\s\S]*?\n {4}\}(?=\n {4}fs\.renameSync\(part, dest\);)/, 'today: the staged copy renamed with nothing synced');
  ok(today !== SFW && (today.match(/fsyncSync/g) || []).length < (SFW.match(/fsyncSync/g) || []).length, 'RED setup: today\'s worker (its sync walk taken out)', today === SFW ? 'nothing removed' : 'removed');
  const t = await sfwRun(MC.write(SFW_REL, withOps(today), 'sfw-today'), 'copy', (k) => k === 'fsyncSync');
  ok(!t.err && !t.log.some((x) => x.startsWith('fsyncSync')) && t.log.includes('rename dest-tree.vs-partial'), 'RED (today\'s copy): renamed with nothing synced, and a failing disk is never asked', t.log.join(' → '));
}

// ⑤ a DAV upload (src/webdav.js, the PUT)
console.log('⑤ a DAV upload (src/webdav.js PUT)');
const DAV_REL = 'src/webdav.js', DAV = fs.readFileSync(path.join(REPO, DAV_REL), 'utf8');
async function davRun(modPath, fail, { stand = null, onStream = null } = {}) {
  const dir = path.join(ROOT, `dav-${++seq}`); fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'upload.txt');
  if (stand) fs.writeFileSync(target, stand);   // a file that already stands under the name (the upload replaces it: 204)
  const { registerWebdav } = require(modPath);
  let handler = null;
  registerWebdav({ use: (p, fn) => { if (p === '/dav') handler = fn; } }, { tokens: { resolve: () => ({ mode: 'rw', root: dir }) } });   // a token store of the suite's own: one share, the scratch folder
  const buf = Buffer.from('a made-up upload\n'.repeat(2048));
  const req = Object.assign(Readable.from([buf]), { method: 'PUT', path: '/upload.txt', url: '/upload.txt', headers: {} });
  let done; const finished = new Promise((r) => { done = r; });
  const answers = [];
  const res = { code: 200, text: '', headers: {}, headersSent: false, set(k, v) { this.headers[k] = v; return this; }, type() { return this; }, status(c) { this.code = c; return this; },
    end() { answers.push(this.code); this.headersSent = true; done(); return this; }, send(t) { this.text = String(t); answers.push(this.code); this.headersSent = true; done(); return this; } };
  const keepCWS = fs.createWriteStream;
  let stream = null;
  fs.createWriteStream = (...a) => { const w = keepCWS(...a); stream = w; if (onStream) onStream(w); return w; };   // the suite's own hand on the upload's stream (its landing's end is waited for)
  let answered = false;
  try {
    const out = await recorded(async () => { await handler(req, res); answered = await Promise.race([finished.then(() => true), new Promise((r) => setTimeout(() => r(false), 5000))]); if (stream && stream.landing) await stream.landing; }, fail);   // the first answer, then the landing's OWN end (a second answer or a late rename is seen)
    if (!answered) ok(false, 'HARNESS: the upload was never answered within 5 s (the wait\'s own bound)');
    return { ...out, res, dir, buf, answers, now: fs.existsSync(target) ? fs.readFileSync(target) : null };
  } finally { fs.createWriteStream = keepCWS; }
}
{
  const S = SITE.dav, at = (kind, code = true) => (k, p) => k === kind && /\.vsdav-/.test(String(p)) ? code : false;
  const live = await davRun(path.join(REPO, DAV_REL));
  ok(live.res.code === 201 && !!live.now && live.now.equals(live.buf), 'the upload lands whole under its name (201)', `${live.res.code} ${live.res.text}`);
  ok(live.log.some((x) => /^sync upload\.txt\.vsdav-/.test(x)) && live.log.findIndex((x) => /^sync upload\.txt\.vsdav-/.test(x)) < live.log.findIndex((x) => /^rename upload\.txt\.vsdav-/.test(x)) && !live.log.some((x) => /^(writeFileSync|fsyncSync) /.test(x)), 'its temp is synced ONCE at its end, BEFORE the rename — through the thread pool', live.log.join(' → '));
  const over = await davRun(path.join(REPO, DAV_REL), undefined, { stand: OLD });
  ok(over.res.code === 204 && !!over.now && over.now.equals(over.buf), 'over a file that stands: replaced whole (204)', `${over.res.code}`);
  for (const kind of ['sync', 'close']) {
    const f = await davRun(path.join(REPO, DAV_REL), at(kind));
    ok(f.res.code === 500 && /upload\.txt could not be put on disk \(EIO\) — not saved/.test(f.res.text) && !f.now && tmpLeft(f.dir, /vsdav-/).length === 0 && !f.log.some((x) => x.startsWith('rename')) && f.answers.length === 1,
      `a PLACED failure at the ${kind} is a failed upload, said by name (a 500 whose body names it), answered once: nothing renamed, no temp left (removed BEFORE the answer — no wait)`, `${f.res.code} ${f.res.text} · ${fs.readdirSync(f.dir).join(', ') || 'empty'}`);
    const s = await davRun(path.join(REPO, DAV_REL), at(kind), { stand: OLD });
    ok(s.res.code === 500 && !!s.now && s.now.equals(OLD) && tmpLeft(s.dir, /vsdav-/).length === 0, `…over a file that already STANDS: after the placed failure at the ${kind} it is byte for byte as it was`, `${s.res.code} · ${s.now ? s.now.length : 'gone'} bytes`);
  }
  // ONE ANSWER (r4634 small c): the stream's own failure after its finish (its close: a network folder's deferred write error) answers 500
  // first — PLACED: the suite's hand on the stream emits it while the landing is held at its sync; the landing then answers nothing more
  // and renames nothing
  let wHand = null;
  const once = await davRun(path.join(REPO, DAV_REL), (k, p) => k === 'sync' && /\.vsdav-/.test(String(p)) ? async () => { wHand.emit('error', Object.assign(new Error('EIO: a placed late close of the upload\'s stream'), { code: 'EIO' })); } : false, { onStream: (w) => { wHand = w; } });
  ok(!!wHand && once.answers.length === 1 && once.answers[0] === 500 && !once.now && !once.log.some((x) => x.startsWith('rename')), 'the stream\'s own failure while the upload lands: ONE answer (500), nothing renamed after it, nothing in its place', `${JSON.stringify(once.answers)} · ${once.log.join(' → ')}`);
  const twiceText = anchored(anchored(DAV, "  if (!fault && streamFailed()) fault = streamFailed();   // the stream's own write or close failed meanwhile: a failed upload\n", '', 'the 31dca7dd2 form: the stream\'s failure not read'),
    'then(() => { if (!res.headersSent) res.status(existed ? 204 : 201).end(); }', 'then(() => { res.status(existed ? 204 : 201).end(); }', 'the 31dca7dd2 form: answered again');
  const twiceText2 = anchored(twiceText, 'async () => { await fsp.unlink(tmp).catch(() => {}); if (!res.headersSent) res.status(500).end(); });', 'async () => { await fsp.unlink(tmp).catch(() => {}); res.status(500).end(); });', 'the 31dca7dd2 form: its failed rename answered again');
  let wHand2 = null;
  const tw = await davRun(MC.write(DAV_REL, twiceText2, 'dav-twice'), (k, p) => k === 'sync' && /\.vsdav-/.test(String(p)) ? async () => { wHand2.emit('error', Object.assign(new Error('EIO: a placed late close'), { code: 'EIO' })); } : false, { onStream: (w) => { wHand2 = w; } });
  ok(tw.answers.length === 2 && tw.answers[0] === 500 && tw.log.some((x) => x.startsWith('rename')), 'RED (the 31dca7dd2 form): answered TWICE (the 500, then the landing\'s own answer) and a rename tried after its failure was said', `${JSON.stringify(tw.answers)} · ${tw.log.join(' → ')}`);
  const n0 = saidOf(S.where).length, ns = await davRun(path.join(REPO, DAV_REL), at('sync', 'EOPNOTSUPP'));
  ok(ns.res.code === 201 && !!ns.now && ns.now.equals(ns.buf), 'a file system that does NOT DO A SYNC (a placed EOPNOTSUPP): the upload LANDS whole (201)', `${ns.res.code} ${ns.res.text}`);
  saidOnce(S, 'EOPNOTSUPP', n0, 'its no-sync answer');
  const nd = await davRun(MC.write(DAV_REL, noDoor(DAV, S), 'dav-nodoor'), at('sync', 'EOPNOTSUPP'));
  ok(nd.res.code === 500 && !nd.now, 'RED (the 31dca7dd2 form, the door\'s reading taken out): a folder with no sync REFUSED the upload', `${nd.res.code}`);
  const today = without(DAV, / try \{ await h\.sync\(\); \} catch \(se\) \{ if \(!FC\.syncUnsupportedLands\(se, 'a WebDAV upload'[^\n]*?\) fault = se; \}/, 'today: the upload renamed with nothing synced');
  const t = await davRun(MC.write(DAV_REL, today, 'dav-today'), at('sync'));
  ok(t.res.code === 201 && !t.log.some((x) => x.startsWith('sync')), 'RED (today\'s upload): renamed with nothing synced, and a failing disk is never asked', `${t.res.code} · ${t.log.join(' → ')}`);
}

// ⑥ a design file of the person's (src/design-fs.js writeUser, through its action)
console.log('⑥ a design file (src/design-fs.js writeUser)');
const DFS_REL = 'src/design-fs.js', DFS = fs.readFileSync(path.join(REPO, DFS_REL), 'utf8');
async function dfsRun(modPath, fail, { stand = null } = {}) {
  const dir = path.join(ROOT, `design-${++seq}`); fs.mkdirSync(dir, { recursive: true });
  const text = JSON.stringify({ tweak: 'a made-up value' }), f = path.join(dir, 'user.json');
  if (stand) fs.writeFileSync(f, stand);   // the tweak values that already stand
  const out = await recorded(() => require(modPath).run('write-user', { dir, text }), fail);
  return { ...out, dir, text, now: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null };
}
{
  const S = SITE.dfs, at = (kind, code = true) => (k, p) => k === kind && /\.user\.json\./.test(String(p)) ? code : false;
  const live = await dfsRun(path.join(REPO, DFS_REL));
  const iS = live.log.findIndex((x) => /^sync \.user\.json\..*\.tmp$/.test(x)), iR = live.log.findIndex((x) => /^rename \.user\.json\..*\.tmp$/.test(x));
  ok(!!live.r && live.r.ok === true && live.now === live.text && iS >= 0 && iS < iR, 'the design file lands whole, its handle synced BEFORE the rename (on the thread pool)', `${JSON.stringify(live.r)} · ${live.log.join(' → ')}`);
  for (const kind of ['sync', 'close']) {
    const f = await dfsRun(path.join(REPO, DFS_REL), at(kind));
    ok(!!f.r && f.r.ok === false && f.r.code === 'write_failed' && /\(EIO\)/.test(String(f.r.why || f.r.error || '')) && f.now === null && tmpLeft(f.dir, /\.tmp$/).length === 0 && !f.log.some((x) => x.startsWith('rename')), `a PLACED failure at the ${kind} is a failed write said by name (write_failed, the chip's words): nothing renamed, no temp left`, `${JSON.stringify(f.r)} · ${f.log.join(' → ')}`);
    const s = await dfsRun(path.join(REPO, DFS_REL), at(kind), { stand: OLD.toString() });
    ok(!!s.r && s.r.ok === false && s.now === OLD.toString() && tmpLeft(s.dir, /\.tmp$/).length === 0, `…over the tweak values that already STAND: after the placed failure at the ${kind} they are byte for byte as they were`, JSON.stringify(s.r));
  }
  const n0 = saidOf(S.where).length, ns = await dfsRun(path.join(REPO, DFS_REL), at('sync', 'EINVAL'));
  ok(!!ns.r && ns.r.ok === true && ns.now === ns.text, 'a file system that does NOT DO A SYNC (a placed EINVAL): the design file LANDS', JSON.stringify(ns.r));
  saidOnce(S, 'EINVAL', n0, 'its no-sync answer');
  const nd = await dfsRun(MC.write(DFS_REL, noDoor(DFS, S), 'design-nodoor'), at('sync', 'EINVAL'));
  ok(!!nd.r && nd.r.ok === false && nd.now === null, 'RED (the 31dca7dd2 form, the door\'s reading taken out): a folder with no sync REFUSED the design file', JSON.stringify(nd.r));
  const today = without(DFS, /\n {4}try \{ await fh\.sync\(\); \}[^\n]*/, 'today: the handle closed and renamed with nothing synced');
  const t = await dfsRun(MC.write(DFS_REL, today, 'design-today'), at('sync'));
  ok(!!t.r && t.r.ok === true && !t.log.some((x) => x.startsWith('sync')), 'RED (today\'s write): renamed with nothing synced, and a failing disk is never asked', t.log.join(' → '));
}

// ⑦ an export the person asked for (src/task-groups.js TaskGroupManager.exportToFile)
console.log('⑦ a Task Group export (src/task-groups.js exportToFile)');
const TG_REL = 'src/task-groups.js', TG = fs.readFileSync(path.join(REPO, TG_REL), 'utf8');
const TG_TMP = /^group\.md\.\d+\.[0-9a-f]{12}\.tmp$/;   // its OWN temp a call (r4634 small a)
async function tgRun(modPath, fail, { stand = null, twice = false } = {}) {
  const dir = path.join(ROOT, `export-${++seq}`); fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  const { TaskGroupManager } = require(modPath);
  const m = new TaskGroupManager({ dataDir: path.join(dir, 'data'), onChange: () => { } });
  const t = m.create({ title: 'a made-up group', objective: 'made-up', folders: [dir] });
  const file = path.join(dir, 'out', 'group.md');
  if (stand) fs.writeFileSync(file, stand);   // an export that already stands at the path
  let second = null, started = false;
  // TWO EXPORTS TO ONE PATH AT ONCE (a double press): the first HELD at its sync while the second runs whole (PLACED, no clock)
  const f2 = twice ? (k, p) => k === 'sync' && !started ? async () => { started = true; second = await m.exportToFile(t.id, file).then((r) => ({ r }), (e) => ({ e })); } : false : fail;
  const out = await recorded(() => m.exportToFile(t.id, file), f2);
  return { ...out, dir, file, second, now: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, text: m.renderRepoFile(m.get(t.id)) };
}
{
  const S = SITE.tg, at = (kind, code = true) => (k, p) => k === kind && TG_TMP.test(path.basename(String(p))) ? code : false;
  const live = await tgRun(path.join(REPO, TG_REL));
  ok(!live.err && live.r === live.file && !!live.now && /made-up group/.test(live.now), 'the export lands whole under its name', live.err ? live.err.message : String(live.r));
  const iS = live.log.findIndex((x) => /^sync group\.md\.\d+\.[0-9a-f]+\.tmp$/.test(x)), iR = live.log.findIndex((x) => /^rename group\.md\.\d+\.[0-9a-f]+\.tmp$/.test(x));
  ok(iS >= 0 && iS < iR && !live.log.some((x) => /^(writeFileSync|fsyncSync) /.test(x)), 'it is written and synced BEFORE the rename — through the thread pool (no writeFileSync / fsyncSync: the loop\'s other sync calls are the censuses\' — test-sync-fs-census, test-store-write-census)', live.log.join(' → '));
  for (const kind of ['sync', 'close']) {
    const f = await tgRun(path.join(REPO, TG_REL), at(kind));
    ok(!!f.err && /group\.md could not be put on disk \(EIO\) — not exported/.test(f.err.message) && !f.now && tmpLeft(path.join(f.dir, 'out'), /\.tmp$/).length === 0 && !f.log.some((x) => x.startsWith('rename')), `a PLACED failure at the ${kind} is a failed export said by name (the toast's words): nothing renamed, no temp left`, f.err ? f.err.message : 'NO ERROR');
    const s = await tgRun(path.join(REPO, TG_REL), at(kind), { stand: OLD.toString() });
    ok(!!s.err && s.now === OLD.toString() && tmpLeft(path.join(s.dir, 'out'), /\.tmp$/).length === 0, `…over an export that already STANDS: after the placed failure at the ${kind} it is byte for byte as it was`, s.err ? s.err.message : 'NO ERROR');
  }
  const two = await tgRun(path.join(REPO, TG_REL), undefined, { twice: true });
  ok(!two.err && two.r === two.file && !!two.second && two.second.r === two.file && two.now === two.text && tmpLeft(path.join(two.dir, 'out'), /\.tmp$/).length === 0, 'TWO EXPORTS TO ONE PATH AT ONCE (the first held at its sync while the second runs whole): EACH answered rightly, the file one whole export, no temp left', `${two.err ? two.err.message : 'ok'} · ${two.second && (two.second.e ? two.second.e.message : 'ok')}`);
  const shared = anchored(anchored(TG, "    const tmp = `${absPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;", "    const tmp = absPath + '.tmp';", 'the 31dca7dd2 form: one temp for every export to a path'), "fs.promises.open(tmp, 'wx')", "fs.promises.open(tmp, 'w')", 'the 31dca7dd2 form: its open');   // stale-pins: kept (the release form WRITTEN BACK by this red copy — a replacement, never an anchor)
  const tw = await tgRun(MC.write(TG_REL, shared, 'export-shared'), undefined, { twice: true });
  ok(!!tw.err && /ENOENT/.test(tw.err.message), 'RED (the 31dca7dd2 form, one temp a path): the first export is answered WRONGLY (its rename finds no temp: ENOENT) for a file that was written', tw.err ? tw.err.message : 'NO ERROR');
  const n0 = saidOf(S.where).length, ns = await tgRun(path.join(REPO, TG_REL), at('sync', 'ENOTSUP'));
  ok(!ns.err && ns.now && /made-up group/.test(ns.now), 'a file system that does NOT DO A SYNC (a placed ENOTSUP): the export LANDS', ns.err ? ns.err.message : 'ok');
  saidOnce(S, 'ENOTSUP', n0, 'its no-sync answer');
  const ns2 = await tgRun(path.join(REPO, TG_REL), at('sync', 'EINVAL'));
  ok(!ns2.err && saidOf(S.where).length === 1, '…an EINVAL after it lands too, and nothing more is said (once a site)', saidOf(S.where));
  const nd = await tgRun(MC.write(TG_REL, noDoor(TG, S), 'export-nodoor'), at('sync', 'EINVAL'));
  ok(!!nd.err && !nd.now, 'RED (the 31dca7dd2 form, the door\'s reading taken out): a folder with no sync REFUSED the export', nd.err ? nd.err.message : 'NO ERROR');
  const today = without(TG, /\n {4}if \(h && !fault\) \{ try \{ await h\.sync\(\); \}[^\n]*/, 'today: the export renamed with nothing synced');
  const t = await tgRun(MC.write(TG_REL, today, 'export-today'), at('sync'));
  ok(!t.err && !t.log.some((x) => x.startsWith('sync')), 'RED (today\'s export, the sync taken out): renamed with nothing synced, a failing disk never asked', t.log.join(' → '));
}

// ⑧ a page's published content (src/server/published-pages.js publishContent)
console.log('⑧ a published page (src/server/published-pages.js publishContent)');
const PP_REL = 'src/server/published-pages.js', PP = fs.readFileSync(path.join(REPO, PP_REL), 'utf8');
const AGENT = '<!doctype html><title>a made-up page</title>', AGENT2 = '<!doctype html><title>a made-up page, again</title>';
const snaps = (dir) => { try { return fs.readdirSync(path.join(dir, 'published-pages')).filter((n) => /\.(html|bin)$/.test(n)); } catch { return []; } };
async function ppRun(modPath, fail, { first = false, html = AGENT, srcKey = 'local:/made-up/page.html', hand = null } = {}) {
  const dir = path.join(ROOT, `pages-${++seq}`); fs.mkdirSync(dir, { recursive: true });
  const pages = require(modPath).create({ dataDir: dir });
  const ctx = { dir, pages };
  if (first) ctx.firstAns = await pages.publishContent({ html: AGENT, name: 'made-up', srcKey, sessionId: 's-made-up' });   // the page as it stands
  const f = hand ? hand(ctx) : fail;
  const out = await recorded(() => pages.publishContent({ html, name: 'made-up', srcKey, sessionId: 's-made-up' }), f);
  if (ctx.later) ctx.laterAns = await ctx.later;
  return { ...out, ...ctx, list: pages.list({}) };
}
const pageText = (r) => { const p = r.list[0]; try { return fs.readFileSync(path.join(r.dir, 'published-pages', p.id + '.html'), 'utf8'); } catch { return null; } };
{
  const S = SITE.pp, at = (kind, code = true) => (k, p) => k === kind && /\.html\.tmp$/.test(String(p)) ? code : false;
  const live = await ppRun(path.join(REPO, PP_REL));
  const iS = live.log.findIndex((x) => /^sync .*\.html\.tmp$/.test(x)), iR = live.log.findIndex((x) => /^rename .*\.html\.tmp$/.test(x));
  ok(!live.err && !!live.r && !!live.r.page && live.list.length === 1, 'the page is published and recorded', live.err ? live.err.message : JSON.stringify(live.r && (live.r.error || live.r.page && live.r.page.id)));
  ok(iS >= 0 && iS < iR && !live.log.some((x) => /^(writeFileSync|fsyncSync) .*\.html/.test(x)), 'its content is written and synced BEFORE the rename — through the thread pool (no writeFileSync / fsyncSync of it: the loop\'s other sync calls are the censuses\')', live.log.join(' → '));
  for (const kind of ['sync', 'close']) {
    const f = await ppRun(path.join(REPO, PP_REL), at(kind));
    ok(!!f.r && /the page could not be put on disk \(EIO\) — not published/.test(String(f.r.error)) && f.list.length === 0 && tmpLeft(path.join(f.dir, 'published-pages'), /\.tmp$/).length === 0 && !f.log.some((x) => x.startsWith('rename')), `a PLACED failure at the ${kind} is a failed publish said by name: nothing renamed, nothing recorded, no temp left`, `${JSON.stringify(f.r)} · ${f.log.join(' → ')}`);
    const s = await ppRun(path.join(REPO, PP_REL), at(kind), { first: true, html: AGENT2 });
    ok(!!s.r && !!s.r.error && s.list.length === 1 && pageText(s) === AGENT && s.list[0].size === Buffer.byteLength(AGENT) && tmpLeft(path.join(s.dir, 'published-pages'), /\.tmp$/).length === 0, `…a RE-publish over the page that STANDS: after the placed failure at the ${kind} its content is byte for byte as it was, its row unchanged`, `${JSON.stringify(s.r)} · ${pageText(s)}`);
  }
  // r4634 MUST 1: ONE SOURCE, ONE PAGE, WHOEVER PUBLISHES — the person's own Publish (the synchronous road of the Pages page) PLACED inside
  // the content's write (at its sync, a hold): one row, the agent's answer naming THAT page, its content the agent's, no second file
  const personRun = async (modPath) => {
    const dir = path.join(ROOT, `pages-person-${++seq}`); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'report.html'); fs.writeFileSync(file, '<!doctype html><title>the person\'s own</title>');
    const pages = require(modPath).create({ dataDir: dir });
    let person = null;
    const out = await recorded(() => pages.publishContent({ html: AGENT, name: 'made-up', srcKey: 'local:' + file, sessionId: 's-made-up' }),
      (k, p) => k === 'sync' && /\.html\.tmp$/.test(String(p)) && !person ? async () => { person = pages.publish({ srcPath: file, name: 'the person\'s' }); } : false);
    const rows = pages.list({}).filter((p) => p.srcKey === 'local:' + file);
    return { ...out, dir, person, rows, files: snaps(dir), list: rows };
  };
  const one = await personRun(path.join(REPO, PP_REL));
  ok(!!one.person && !!one.person.page && !!one.r && !!one.r.page && one.rows.length === 1 && one.r.page.id === one.person.page.id && one.r.page.replaced === true && pageText(one) === AGENT && one.files.length === 1,
    'the person\'s Publish INSIDE the write window: ONE row of the source; the agent\'s publish ADOPTS it (its answer names that page, as a replace), its content the agent\'s, one file', `${one.rows.length} row(s) · ${one.files.join(', ')} · ${JSON.stringify(one.r && (one.r.page ? { id: one.r.page.id, replaced: one.r.page.replaced } : one.r.error))}`);
  const noRead = anchored(PP, / else \{\n {6}\/\/ r4634 MUST 1[\s\S]*?\n {6}\}\n {4}\}/, '', 'the 31dca7dd2 form: no second read of the list by the source');
  const two = await personRun(MC.write(PP_REL, noRead, 'pages-noread'));
  ok(two.rows.length === 2 && two.files.length === 2, 'RED (the 31dca7dd2 form, no read again by the source): TWO pages for one source, served from two files', `${two.rows.length} row(s) · ${two.files.join(', ')}`);
  // …and that row TAKEN DOWN during the adoption's own rename (r4675's should; a HOLD at the rename): said, no row, no file left
  const adoptDown = async (modPath) => {
    const dir = path.join(ROOT, `pages-adopt-${++seq}`); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'report.html'); fs.writeFileSync(file, '<!doctype html><title>the person\'s own</title>');
    const pages = require(modPath).create({ dataDir: dir });
    let person = null, removed = null;
    const out = await recorded(() => pages.publishContent({ html: AGENT, name: 'made-up', srcKey: 'local:' + file, sessionId: 's-made-up' }),
      (k, p) => k === 'sync' && /\.html\.tmp$/.test(String(p)) && !person ? async () => { person = pages.publish({ srcPath: file, name: 'the person\'s' }); }
        : k === 'rename' && person && person.page && !removed && /\.html$/.test(String(p)) && !String(p).includes(person.page.id) ? async () => { removed = pages.remove(person.page.id); } : false);
    return { ...out, dir, person, removed, list: pages.list({}), files: snaps(dir) };
  };
  const ad = await adoptDown(path.join(REPO, PP_REL));
  ok(!!ad.removed && !!ad.r && /taken down while it was being published — not published/.test(String(ad.r.error)) && ad.list.length === 0 && ad.files.length === 0, 'the adopted row TAKEN DOWN during the adoption\'s rename: said by name, no row, no file of it left', `${JSON.stringify(ad.r)} · ${ad.files.join(', ')}`);
  const noAdoptDown = anchored(PP, "        if (!store.pages.some((p) => p.id === appeared.id)) { await fs.promises.unlink(into).catch(() => { }); return { error: 'the page was taken down while it was being published — not published' }; }   // taken down during the rename (r4675's should)\n", '', 'no read after the adoption\'s rename');
  const ad2 = await adoptDown(MC.write(PP_REL, noAdoptDown, 'pages-noadoptdown'));
  ok(!!ad2.r && !!ad2.r.page && ad2.list.length === 0 && ad2.files.length === 1, 'RED (no read after the adoption\'s rename): answered WITH a page whose row is gone, its file left behind', `${JSON.stringify(ad2.r && (ad2.r.page ? 'a page' : ad2.r.error))} · ${ad2.files.join(', ')}`);
  // ONE ORDER A SOURCE: a second re-publish arriving while the first is held at its sync waits for it (the publishing map)
  // the hold starts the second; if it BEGAN AT ONCE (no order: its first act, the list's hold read, ran inside the call) the hold waits for it
  // to end, so its write meets the first's on the same temp (placed, no clock); in order it waits behind the first, never for it
  const queued = (ctx) => { let reads = 0; const hd = ctx.pages._hold, held0 = hd.held.bind(hd); hd.held = () => { reads++; return held0(); };
    return (k, p) => k === 'sync' && /\.html\.tmp$/.test(String(p)) && !ctx.later ? async () => { const r0 = reads; ctx.later = ctx.pages.publishContent({ html: AGENT, name: 'made-up', srcKey: 'local:/made-up/page.html' }); if (reads > r0) await ctx.later.catch(() => { }); } : false; };
  const q = await ppRun(path.join(REPO, PP_REL), undefined, { first: true, html: AGENT2, hand: queued });
  ok(!!q.r && !!q.r.page && !!q.laterAns && !!q.laterAns.page && q.list.length === 1 && pageText(q) === AGENT && tmpLeft(path.join(q.dir, 'published-pages'), /\.tmp$/).length === 0, 'TWO RE-PUBLISHES OF ONE PAGE AT ONCE: the second waits for the first, both answered, one row, the later content stands', `${JSON.stringify(q.r && (q.r.error || 'ok'))} · ${JSON.stringify(q.laterAns && (q.laterAns.error || 'ok'))}`);
  const noOrder = anchored(PP, 'const run = prev.then(() => publishContentNow(args), () => publishContentNow(args));', 'const run = publishContentNow(args);', 'no order a source');
  const q2 = await ppRun(MC.write(PP_REL, noOrder, 'pages-noorder'), undefined, { first: true, html: AGENT2, hand: queued });
  ok(!!q2.r && !!q2.r.error, 'RED (no order a source): the first re-publish is answered WRONGLY — the second took its temp', JSON.stringify(q2.r));
  // A PAGE TAKEN DOWN WHILE ITS RE-PUBLISH IS WRITTEN (placed at the sync): it stays down, said; its content just written removed
  const takeDown = (ctx) => (k, p) => k === 'sync' && /\.html\.tmp$/.test(String(p)) && !ctx.removed ? async () => { ctx.removed = ctx.pages.remove(ctx.firstAns.page.id); } : false;
  const d = await ppRun(path.join(REPO, PP_REL), undefined, { first: true, html: AGENT2, hand: takeDown });
  ok(!!d.r && /taken down while it was being published — not published/.test(String(d.r.error)) && d.list.length === 0 && snaps(d.dir).length === 0, 'a page TAKEN DOWN while its re-publish is written: it stays down, said by name, no file of it left', `${JSON.stringify(d.r)} · ${snaps(d.dir).join(', ')}`);
  const noDown = anchored(PP, "      if (!cur) { await fs.promises.unlink(fp).catch(() => { }); return { error: 'the page was taken down while it was being published — not published' }; }\n", '', 'no read of a take-down');
  const d2 = await ppRun(MC.write(PP_REL, noDown, 'pages-nodown'), undefined, { first: true, html: AGENT2, hand: takeDown });
  ok(d2.list.length === 1, 'RED (no read of the take-down): the page taken down is PUBLISHED BACK', `${d2.list.length} row(s)`);
  // a hold of the list begins only at the store's first read (src/store-read-hold.js start): it cannot begin during a write — the check
  // after the write stays as a guard, not driven here (said)
  const n0 = saidOf(S.where).length, ns = await ppRun(path.join(REPO, PP_REL), at('sync', 'EINVAL'));
  ok(!!ns.r && !!ns.r.page && ns.list.length === 1 && pageText(ns) === AGENT, 'a file system that does NOT DO A SYNC (a placed EINVAL): the page is PUBLISHED, its content whole', JSON.stringify(ns.r && (ns.r.error || 'ok')));
  saidOnce(S, 'EINVAL', n0, 'its no-sync answer');
  const nd = await ppRun(MC.write(PP_REL, noDoor(PP, S), 'pages-nodoor'), at('sync', 'EINVAL'));
  ok(!!nd.r && !!nd.r.error && nd.list.length === 0, 'RED (the 31dca7dd2 form, the door\'s reading taken out): a folder with no sync REFUSED the publish', JSON.stringify(nd.r));
  const today = without(PP, /\n {6}if \(h && !fault\) \{ try \{ await h\.sync\(\); \}[^\n]*/, 'today: the page renamed with nothing synced');
  const t = await ppRun(MC.write(PP_REL, today, 'pages-today'), at('sync'));
  ok(!!t.r && !!t.r.page && !t.log.some((x) => x.startsWith('sync')), 'RED (today\'s publish, the sync taken out): renamed with nothing synced, a failing disk never asked', t.log.join(' → '));
}
// browser-serve's planLaunch file is NOT a person's file (a planned copy, made again at every start): read «derived» by the census

report();

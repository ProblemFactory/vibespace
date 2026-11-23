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
async function cliRun(mod, { exists = true, fail } = {}) {
  const home = path.join(ROOT, `home-${++seq}`), dir = path.join(home, '.claude'), file = path.join(dir, 'settings.json');
  fs.mkdirSync(dir, { recursive: true });
  const was = exists ? JSON.stringify({ model: 'opus', cleanupPeriodDays: 30 }, null, 2) + '\n' : null;
  if (was !== null) fs.writeFileSync(file, was);
  const out = await recorded(() => require(mod).applyConfigPlan(PLAN, { home }), fail);
  const receipt = out.r && out.r.receipts && out.r.receipts[0];
  return { ...out, receipt, was, now: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, tmpLeft: fs.readdirSync(dir).some((f) => f.endsWith('.tmp')) };
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
  const SYNC_LINE = "  try { const fd = fs.openSync(tmp, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } } catch (e) { throw syncRefused(tmp, file, e); }\n";
  const todayHc = anchored(anchored(HCT, '  ' + SYNC_LINE, '', 'today: commitCreate links with nothing synced'), SYNC_LINE, '', 'today: commitWrite renames with nothing synced');   // commitCreate's (deeper) line first: the shallower anchor is a substring of it
  for (const [road, exists, last] of [['commitWrite', true, 'rename settings.json.tmp'], ['commitCreate', false, 'link settings.json.tmp']]) {
    const t = await cliRun(MC.write(HC_REL, todayHc, `today-${road}`), { exists, fail: (k, p) => k === 'fsyncSync' && /settings\.json\.tmp$/.test(String(p)) });
    ok(t.receipt && t.receipt.state === 'applied' && !t.log.some((x) => x.startsWith('fsyncSync')) && t.log.includes(last),
      `RED (today's ${road}): the name points at a temp nothing synced, and a failing disk is never asked — the legs above read it`, t.log.join(' → '));
  }
}

report();

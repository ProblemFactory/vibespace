#!/usr/bin/env node
// SESSION-META UNDER THE STORE-READ LAW (主开发 r3137 — the store census's FORM 3, rank 1): a conversation's record
// (data/session-meta/<sock>.json, a FAMILY of files) is never written over, nor removed, after a read that failed or bytes that do
// not parse. Stand-ins only: made-up conversations in a scratch data folder; every unreadable record is a PLACED refusal of its read
// call (fs.readFileSync / fs.promises.readFile answer EIO for that one path) or torn bytes written into it — never a mount, never a
// mode change.
//   ① THE VERDICT at the one read: «not there» (ENOENT) stays an empty record (a new conversation's first write); a failed read and
//     torn bytes are an UNREAD record (its mark carried by a spread)
//   ② NO WRITER SAVES OVER A RECORD IT COULD NOT READ: the stub writer's change and a person's act WAIT, and are saved merged over the
//     record the moment it reads (nothing lost, nothing written over) — RED: the release's stub
//   ③ NO REMOVER REMOVES BY IT: the one delete road keeps an unread record; the pool-link sweep removes nothing while any record is
//     unread; the dead socket's retire, the re-adopt and the two aged sweeps ask the same (by their code)
//   ④ TORN BYTES are kept aside once, and the record lifts empty with the waiting changes on it
//   ⑤ THE PERSON: the family's live list names each unread record (one notice reads it)
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = setInterval(() => { }, 1 << 30);
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vs-smheld-')));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
const META_DIR = path.join(TMP, 'session-meta'), BUFFERS_DIR = path.join(TMP, 'session-buffers');
fs.mkdirSync(META_DIR, { recursive: true }); fs.mkdirSync(BUFFERS_DIR, { recursive: true });

// ── THE PLACED REFUSALS: one record's read call answers EIO
const REFUSE = new Set();
const realReadSync = fs.readFileSync, realRead = fs.promises.readFile;
const placed = () => Object.assign(new Error('EIO: the suite\'s placed refusal'), { code: 'EIO' });
fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && REFUSE.has(path.resolve(p))) throw placed(); return realReadSync.call(fs, p, ...a); };
fs.promises.readFile = function (p, ...a) { if (typeof p === 'string' && REFUSE.has(path.resolve(p))) return Promise.reject(placed()); return realRead.call(fs.promises, p, ...a); };
const onDisk = (sock) => { try { return JSON.parse(realReadSync.call(fs, path.join(META_DIR, sock + '.json'), 'utf8')); } catch (e) { return e.code === 'ENOENT' ? 'gone' : 'torn'; } };

const SS = require(path.join(REPO, 'src/server/session-stdout.js')).create({ rootDir: TMP, BUFFERS_DIR, META_DIR, activeSessions: new Map(), engine: {}, getHosts: () => null });
const SW = require(path.join(REPO, 'src/store-writer.js')).storeWriter();
const land = (sock) => { try { SW.flushSync([path.join(META_DIR, sock + '.json')]); } catch { } };
const HOLD = require(path.join(REPO, 'src/store-read-hold.js'));
let SMV = null; try { SMV = require(path.join(REPO, 'src/server/session-meta-verdict.js')); } catch { SMV = null; }
const unread = (m) => !!(SMV && SMV.isUnread(m));
const RECORD = (n) => ({ webuiSessionId: 'sess-made-up-' + n, name: 'a made-up conversation ' + n, cwd: '/made/up/folder-' + n, accountId: 'acct-made-up', groups: ['g-made-up'], lockedModel: 'made-up-model', claudeSessionId: 'cid-made-up-' + n });
const born = (n) => { const sock = 'vs-smheld-sock-' + n; SS.writeSessionMeta(sock, RECORD(n)); land(sock); return sock; };
const readAgain = async (sock) => { if (typeof HOLD.readAgainOf === 'function') { for (let i = 0; i < 20; i++) { if (await HOLD.readAgainOf(sock + '.json')) return true; await sleep(20); } } return false; };

console.log('① THE VERDICT at the one read');
{
  const none = SS.readSessionMeta('vs-smheld-no-such-sock');
  const a = born(1), fa = path.join(META_DIR, a + '.json');
  REFUSE.add(fa);
  const m = SS.readSessionMeta(a);
  ok(!!(none && typeof none === 'object' && !Object.keys(none).length && !unread(none) && unread(m) && unread({ ...m, field: 1 })),
    `«not there» (ENOENT) is the empty record it always was (a new conversation's first write); a FAILED read is an UNREAD record, its mark carried by a spread — never the empty one (${SMV ? 'the verdict module is there' : 'NO verdict: the release answers {} for both'})`);
  REFUSE.delete(fa); await readAgain(a);
}

console.log('② NO WRITER SAVES OVER A RECORD IT COULD NOT READ — the change WAITS and is saved at the read');
{
  const b = born(2), fb = path.join(META_DIR, b + '.json');
  REFUSE.add(fb);
  SS.writeSessionMeta(b, { ...SS.readSessionMeta(b), seenMarks: ['made-up-mark'] });   // the stub writers' shape (30 sites)
  SS.writeSessionMeta(b, { ...SS.readSessionMeta(b), lockedModel: 'a-model-the-person-locked' });   // a person's act
  land(b);
  const during = onDisk(b);
  REFUSE.delete(fb);
  const lifted = await readAgain(b); land(b); await sleep(50); land(b);
  const after = onDisk(b);
  ok(!!(during && during.name === RECORD(2).name && during.cwd === RECORD(2).cwd && !during.seenMarks && lifted && after.name === RECORD(2).name && after.groups && after.seenMarks && after.seenMarks[0] === 'made-up-mark' && after.lockedModel === 'a-model-the-person-locked'),
    `while its read fails, a writer's change and a person's act write NOTHING over the record (on disk its name «${during && during.name}», its folder, no stub) — they WAIT, and the moment it reads they are saved MERGED over it (name, groups, the mark and the person's lock: ${JSON.stringify(after && { name: after.name, seenMarks: after.seenMarks, lockedModel: after.lockedModel })}) — RED: the release saved a one-field stub`, { during, after, lifted });
}

console.log('③ NO REMOVER REMOVES BY IT');
{
  const c = born(3), fc = path.join(META_DIR, c + '.json');
  REFUSE.add(fc);
  SS.readSessionMeta(c);
  SS.deleteSessionMeta(c);
  const kept = onDisk(c);
  ok(!!(kept && kept.name === RECORD(3).name), `the ONE delete road (every remover's: the dead socket's retire included) keeps a record whose read failed (${kept === 'gone' ? 'DELETED' : 'kept'}) — RED: the release deleted it`);
  // the pool-link sweep: a conversation's link while any record is unread
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const linkDir = path.join(TMP, 'pool-links', 'pool-made-up'); fs.mkdirSync(linkDir, { recursive: true });
  fs.writeFileSync(path.join(linkDir, 'sess-made-up-old-id'), 'made-up link');
  const fake = { dataDir: TMP, _state: { accounts: [] }, _clearUnplaced: () => false, _save: () => { } };
  const dropped = AccountManager.prototype.sweepSessionPoolLinks.call(fake, new Set());
  ok(!!(dropped === 0 && fs.existsSync(path.join(linkDir, 'sess-made-up-old-id'))), `the pool-link sweep removes NOTHING while a conversation's record is unread (its link kept: the record may name it — ${dropped} dropped) — RED: the release unlinked it`);
  REFUSE.delete(fc); await readAgain(c);
  // the removers that judge a record in their own code: they ask the same verdict
  const BR = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8'), SRV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const retire = (BR.match(/function retireDeadSocket\([\s\S]*?\n {2}\}\n/) || [''])[0];
  ok(!!(/isUnread\(dm\)/.test(retire) && /isUnread\(meta\)/.test(BR) && /activeSessions\.has\(m\[1\]\) \|\| [^\n]*anyUnread\(\)/.test(SRV) && /isActive: \(id\) => activeSessions\.has\(id\) \|\| [^\n]*anyUnread\(\)/.test(SRV)),
    'the dead socket\'s retire keeps an unread record, the re-adopt keeps an unread live conversation for its read (no new id), and the two aged sweeps (attach configs, wrapper files) keep everything while any record is unread — by their code');
}

console.log('④ TORN BYTES — kept aside once, the record lifts empty with the waiting changes on it');
{
  const d = 'vs-smheld-sock-torn', fd = path.join(META_DIR, d + '.json');
  const TORN = '{"webuiSessionId":"sess-made-up-torn","name":"a made-up';
  fs.writeFileSync(fd, TORN);
  const m = SS.readSessionMeta(d);
  SS.writeSessionMeta(d, { ...m, seenMarks: ['after-torn'] });
  land(d);
  await sleep(200);
  for (let i = 0; i < 20 && !fs.readdirSync(META_DIR).some((n) => n.startsWith(d + '.json.corrupt-')); i++) await sleep(25);
  land(d); await sleep(50); land(d);
  const copies = fs.readdirSync(META_DIR).filter((n) => n.startsWith(d + '.json.corrupt-'));
  const copyBytes = copies[0] ? realReadSync.call(fs, path.join(META_DIR, copies[0]), 'utf8') : null;
  const now = onDisk(d);
  ok(!!(unread(m) && copies.length === 1 && copyBytes === TORN && now && now.seenMarks && now.seenMarks[0] === 'after-torn'),
    `torn bytes: an UNREAD record (never «{}»), their copy kept aside ONCE byte for byte (${copies.join(', ') || 'none'}), then the record lifts EMPTY with the waiting change saved on it — RED: the release wrote the stub over them, no copy`, { copies, now });
}

console.log('⑤ THE PERSON — the family\'s live list names each unread record');
{
  const e = born(5), fe = path.join(META_DIR, e + '.json');
  REFUSE.add(fe); SS.readSessionMeta(e);
  const rows = typeof HOLD.holds === 'function' ? HOLD.holds() : [];
  const mine = rows.filter((r) => r && r.file === e + '.json' && r.held);
  ok(!!(mine.length === 1 && !JSON.stringify(rows).includes(TMP)), `the family's live list (the one notice reads it) names the unread record by its file's base name, no path (${mine.length} row)`);
  REFUSE.delete(fe); await readAgain(e);
}

clearInterval(KEEP);
report();

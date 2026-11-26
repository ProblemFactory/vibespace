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
import { anchored } from './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
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

const ACTIVE = new Map();   // the live conversations this suite stands in for (a name the notice may say)
const SS = require(path.join(REPO, 'src/server/session-stdout.js')).create({ rootDir: TMP, BUFFERS_DIR, META_DIR, activeSessions: ACTIVE, engine: {}, getHosts: () => null });
const SW = require(path.join(REPO, 'src/store-writer.js')).storeWriter();
const land = (sock) => { try { SW.flushSync([path.join(META_DIR, sock + '.json')]); } catch { } };
const HOLD = require(path.join(REPO, 'src/store-read-hold.js'));
let SMV = null; try { SMV = require(path.join(REPO, 'src/server/session-meta-verdict.js')); } catch { SMV = null; }
const unread = (m) => !!(SMV && SMV.isUnread(m));
// the copy is DONE when the record's own row says so (the production list the notice reads), never when its file first appears:
// the helper sets the fact once the copy's write has ended (a lane's read under load, 11-24: the file was there, the fact not yet)
const copyOf = (s) => ((SMV && typeof SMV.rows === 'function' ? SMV.rows() : []).find((r) => r.file === s + '.json') || {}).copy || null;
// r5145 (2.369.420's laws: a wait is on the FACT it judges, a generous bound, its expiry a NAMED harness line): the suite's one fact-wait
const waitFact = async (pred, what, ms = 15000, step = 25) => { const end = Date.now() + ms; let v = await pred(); while (!v && Date.now() < end) { await sleep(step); v = await pred(); } if (!v) console.log(`  · HARNESS: ${what} did not come within ${ms} ms`); return v; };
const copied = async (s) => { await waitFact(() => fs.readdirSync(META_DIR).some((n) => n.startsWith(s + '.json.corrupt-')) && copyOf(s), `${s}: its torn bytes copied`); return !!copyOf(s); };
const RECORD = (n) => ({ webuiSessionId: 'sess-made-up-' + n, name: 'a made-up conversation ' + n, cwd: '/made/up/folder-' + n, accountId: 'acct-made-up', groups: ['g-made-up'], lockedModel: 'made-up-model', claudeSessionId: 'cid-made-up-' + n });
const born = (n) => { const sock = 'vs-smheld-sock-' + n; SS.writeSessionMeta(sock, RECORD(n)); land(sock); return sock; };
const readAgain = async (sock) => (typeof HOLD.readAgainOf === 'function' ? !!(await waitFact(() => HOLD.readAgainOf(sock + '.json'), `${sock}: the held record read again`)) : false);

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
  ok(!!(/isUnread\(dm\)/.test(retire) && /isUnread\(meta\)/.test(BR) && /activeSessions\.has\(m\[1\]\) \|\| [^\n]*keeps\(m\[1\]\)/.test(SRV) && /isActive: \(id\) => activeSessions\.has\(id\) \|\| [^\n]*keeps\(id\)/.test(SRV)),
    'the dead socket\'s retire keeps an unread record, the re-adopt keeps an unread live conversation for its read (no new id), and the two aged sweeps (attach configs, wrapper files) keep everything while any record is unread — by their code');
}

console.log('④ TORN BYTES — kept aside once; the record STAYS UNREAD until a whole record restates it (r3141)');
{
  const d = 'vs-smheld-sock-torn', fd = path.join(META_DIR, d + '.json');
  const TORN = '{"webuiSessionId":"sess-made-up-torn","name":"a made-up';
  fs.writeFileSync(fd, TORN);
  const m = SS.readSessionMeta(d);
  SS.writeSessionMeta(d, { ...m, seenMarks: ['after-torn'] });   // a class A writer: it never restates a record
  land(d);
  await waitFact(() => fs.readdirSync(META_DIR).some((n) => n.startsWith(d + '.json.corrupt-')), `${d}: its corrupt copy made`);
  await sleep(50); land(d);
  const copies = fs.readdirSync(META_DIR).filter((n) => n.startsWith(d + '.json.corrupt-'));
  const copyBytes = copies[0] ? realReadSync.call(fs, path.join(META_DIR, copies[0]), 'utf8') : null;
  const kept = realReadSync.call(fs, fd, 'utf8'), stillUnread = unread(SS.readSessionMeta(d));
  // the pool-link sweep while only that torn record is unread: the link its bytes name is kept, another conversation's is swept
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const linkDir = path.join(TMP, 'pool-links', 'pool-made-up-2'); fs.mkdirSync(linkDir, { recursive: true });
  fs.writeFileSync(path.join(linkDir, 'sess-made-up-torn'), 'made-up link'); fs.writeFileSync(path.join(linkDir, 'sess-made-up-gone'), 'made-up link');
  const fake = { dataDir: TMP, _state: { accounts: [] }, _clearUnplaced: () => false, _save: () => { } };
  AccountManager.prototype.sweepSessionPoolLinks.call(fake, new Set());
  const tornLink = fs.existsSync(path.join(linkDir, 'sess-made-up-torn')), goneLink = fs.existsSync(path.join(linkDir, 'sess-made-up-gone'));
  ok(!!(unread(m) && copies.length === 1 && copyBytes === TORN && kept === TORN && stillUnread && tornLink && !goneLink),
    `torn bytes: an UNREAD record (never «{}»), their copy kept aside ONCE byte for byte (${copies.join(', ') || 'none'}); the record STAYS UNREAD (its bytes on disk as they were; a writer's change waits), and a sweep keeps what those bytes name (that link kept, another conversation's swept) — RED: the release wrote a stub over them, no copy`, { copies, kept: kept.slice(0, 40), tornLink, goneLink });
  // a WHOLE record from the live conversation restates it (the five writers that list every key the session holds)
  const FULL = { webuiSessionId: 'sess-made-up-torn', name: 'the live conversation', cwd: '/made/up/live' };
  SS.writeSessionMeta(d, { ...SS.readSessionMeta(d), ...FULL }, { durable: true, whole: true });
  land(d); await sleep(50); land(d);
  const now = onDisk(d);
  ok(!!(now && now.name === 'the live conversation' && now.seenMarks && now.seenMarks[0] === 'after-torn' && !unread(SS.readSessionMeta(d))),
    `a WHOLE record from the live conversation restates the torn one (name, folder, and the change that waited: ${JSON.stringify(now && { name: now.name, seenMarks: now.seenMarks })}); its torn bytes stay in their copy`);
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


console.log('⑥ r3199 THE MUST — a lift on the SYNCHRONOUS read hands on the waiting changes (the caller\'s own write keeps them)');
{
  const s = born(6), f = path.join(META_DIR, s + '.json');
  REFUSE.add(f);
  SS.writeSessionMeta(s, { ...SS.readSessionMeta(s), lockedModel: 'the-person-locked-it' });   // a person's act, waiting
  REFUSE.delete(f);
  SS.writeSessionMeta(s, { ...SS.readSessionMeta(s), costKept: { usd: 1 } });   // the cost keeper: read one (its read LIFTS), change a field, save
  land(s); await sleep(50); land(s);
  const d = onDisk(s);
  ok(!!(d && d.lockedModel === 'the-person-locked-it' && d.costKept && d.name === RECORD(6).name),
    `a record that reads again on a SYNCHRONOUS read hands its caller the record WITH the change that waited: the class-A write after it keeps the person's lock (${d && d.lockedModel}) — RED: the lift returned the disk's bytes and the caller's write erased the lock`, d);
}

console.log('⑦ r3199 — a writer that builds a FRESH object, and a whole write over a FAILED read: both wait');
{
  const s = born(7), f = path.join(META_DIR, s + '.json');
  REFUSE.add(f); SS.readSessionMeta(s);
  { const ff = SMV && SMV.factsOf(s); if (ff) ff.copy = 'as-if-a-copy-were-there'; }   // (r3245: a copy fact on a FAILED read — the whole write still waits: it is the TORN fact that lets a whole write restate)
  SS.writeSessionMeta(s, { name: 'a fresh object with no spread' });
  SS.writeSessionMeta(s, { ...SS.readSessionMeta(s), name: 'the live conversation', cwd: '/made/up/live' }, { durable: true, whole: true });
  land(s);
  const during = onDisk(s);
  REFUSE.delete(f); await readAgain(s); land(s); await sleep(50); land(s);
  const after = onDisk(s);
  ok(!!(during && during.name === RECORD(7).name && after && after.name === 'the live conversation' && after.accountId === RECORD(7).accountId),
    `a fresh-object writer and a WHOLE write over a record whose read FAILED (not torn) write nothing meanwhile (on disk «${during && during.name}»); at its read they land merged over the record (its account kept: ${after && after.accountId})`, { during, after });
}

console.log('⑧ r3199 — a person\'s delete of a conversation whose record is unread is done at its read');
{
  const s = born(8), f = path.join(META_DIR, s + '.json');
  REFUSE.add(f); SS.readSessionMeta(s);
  SS.deleteSessionMeta(s);
  const keptNow = onDisk(s);
  SS.writeSessionMeta(s, { ...SS.readSessionMeta(s), seenMarks: ['a-straggler'] });   // a straggler writer after the delete
  REFUSE.delete(f); await readAgain(s); land(s); await sleep(50); land(s);
  const after = onDisk(s);
  ok(!!(keptNow && keptNow.name === RECORD(8).name && after === 'gone'), `a person's delete over an unread record keeps it NOW (never removed on a failed read) and is DONE at its read — no straggler brings it back (${after})`);
}

console.log('⑨ r3199 / r3920 — a torn record the person removes is «not there» again, its copy placed LATE (the leg ends on the copy\'s fact); the notice names the conversation');
{
  // THE COPY PLACED LATE (r3920's find: three lanes saw this leg red under load): the helper's copy write LANDS and its answer is held —
  // the copy's file is there, its fact (the record's own row) not yet. The leg's wait ends on the FACT and its answer is judged; RED
  // control: the wait for the FILE alone (the form those runs had) reads the removed record inside that window — still unread
  const HELD = new Map(), realWrite = fs.promises.writeFile;
  fs.promises.writeFile = function (p, ...a) { const k = typeof p === 'string' ? p : ''; for (const [pre, g] of HELD) if (k.startsWith(pre)) return realWrite.call(fs.promises, p, ...a).then(() => g.p); return realWrite.call(fs.promises, p, ...a); };
  // r4150: the helper may put a written part in place by an exclusive hard LINK (copyFile only where links are refused): the copy's
  // answer is held on each of those roads too — the copy's file there, its fact not yet
  const realCopy = fs.promises.copyFile, realLink = fs.promises.link;
  const heldAt = (dst, real, args) => { const k = typeof dst === 'string' ? dst : ''; for (const [pre, g] of HELD) if (k.startsWith(pre)) return real.apply(fs.promises, args).then(() => g.p); return real.apply(fs.promises, args); };
  fs.promises.copyFile = function (src, dst, ...a) { return heldAt(dst, realCopy, [src, dst, ...a]); };
  fs.promises.link = function (src, dst, ...a) { return heldAt(dst, realLink, [src, dst, ...a]); };
  const hold = (sock) => { const g = {}; g.p = new Promise((res) => { g.go = res; }); HELD.set(path.join(META_DIR, sock + '.json.corrupt-'), g); return g; };
  const fileThere = (sock) => fs.readdirSync(META_DIR).some((n) => n.startsWith(sock + '.json.corrupt-'));
  const until = async (pred, what = '⑨: its placed fact') => waitFact(pred, what);
  const r = 'vs-smheld-sock-torn-2r', rf = path.join(META_DIR, r + '.json');
  fs.writeFileSync(rf, '{"name":"the torn conversation, the red control","cwd":"/made/up');
  const gR = hold(r); SS.readSessionMeta(r);
  const rFile = await until(() => fileThere(r)), rFact = copyOf(r);
  fs.unlinkSync(rf); const goneR = SS.readSessionMeta(r); gR.go();
  const s = 'vs-smheld-sock-torn-2', f = path.join(META_DIR, s + '.json');
  fs.writeFileSync(f, '{"name":"the torn conversation","cwd":"/made/up');
  const g9 = hold(s); SS.readSessionMeta(s);
  const placed = (await until(() => fileThere(s))) && !copyOf(s);   // the file there, its fact not yet: the window placed
  g9.go();
  const copiedOk = await copied(s);
  fs.promises.writeFile = realWrite; fs.promises.copyFile = realCopy; fs.promises.link = realLink;
  const rows = SMV && typeof SMV.rows === 'function' ? SMV.rows() : [];
  const named = rows.find((r) => r.file === s + '.json');
  fs.unlinkSync(f);
  const gone = SS.readSessionMeta(s);
  const live = born(9), lf = path.join(META_DIR, live + '.json');
  ACTIVE.set('sess-made-up-9', { sockName: live, name: 'a made-up live conversation' });
  REFUSE.add(lf); SS.readSessionMeta(live);
  const liveRow = (SMV && typeof SMV.rows === 'function' ? SMV.rows() : []).find((r) => r.file === live + '.json');
  REFUSE.delete(lf); await readAgain(live); ACTIVE.delete('sess-made-up-9');
  ok(!!(placed && copiedOk && named && named.name === 'the torn conversation' && !unread(gone) && gone && !Object.keys(gone).length && liveRow && liveRow.name === 'a made-up live conversation' && rFile && rFact === null && unread(goneR)),
    `the notice's rows name the conversation (from its torn bytes: «${named && named.name}»; from its live session: «${liveRow && liveRow.name}»), never a path; a torn record the person REMOVED after its copy is «not there» again (an empty record, not unread) — its copy PLACED LATE (the file there, its fact not: ${placed}) and the wait ended on the fact (${copiedOk}); RED control (the wait for the file): the removed record read in that window is still unread (${unread(goneR)})`, { placed, copiedOk, rFile, rFact, goneR: unread(goneR) });
}


console.log('⑩ r3245 — the copy FIRST: a whole write before the torn bytes are copied waits; after the copy it restates');
{
  const s = 'vs-smheld-sock-torn-3', f = path.join(META_DIR, s + '.json');
  const TORN3 = '{"name":"the third torn conversation","cwd":"/made/up';
  fs.writeFileSync(f, TORN3);
  SS.writeSessionMeta(s, { ...SS.readSessionMeta(s), name: 'the live conversation, too early', cwd: '/made/up/early' }, { durable: true, whole: true });   // the same turn as the read: no copy yet
  land(s);
  const early = realReadSync.call(fs, f, 'utf8');
  await copied(s);
  const copies = fs.readdirSync(META_DIR).filter((n) => n.startsWith(s + '.json.corrupt-'));
  ok(!!(early === TORN3 && copies.length === 1 && realReadSync.call(fs, path.join(META_DIR, copies[0]), 'utf8') === TORN3),
    `a whole write in the very turn of a torn read (before its copy) restates NOTHING — the torn bytes stay where they are until their copy is made (${copies.length} copy, byte for byte) — RED: the restatement wrote over the only copy`);
}

console.log('⑪ r3245 — the whole restatement carries the LIVE conversation\'s account, machine, group and pool');
{
  const s = 'vs-smheld-sock-torn-4', f = path.join(META_DIR, s + '.json');
  fs.writeFileSync(f, '{"name":"the fourth torn conversation","cwd":"/made/up');
  ACTIVE.set('sess-made-up-live-4', { sockName: s, name: 'the fourth live conversation', _accountId: 'acct-made-up-live', host: 'a-made-up-machine', _initialGroupId: 'g-made-up-live', _poolPin: { pool: 'pool-made-up', member: 'm-made-up' } });
  SS.readSessionMeta(s);
  await copied(s);
  SS.writeSessionMeta(s, { ...SS.readSessionMeta(s), name: 'the fourth live conversation', cwd: '/made/up/live-4', webuiSessionId: 'sess-made-up-live-4' }, { durable: true, whole: true });
  await waitFact(() => { land(s); return !!(onDisk(s) || {}).accountId; }, `${s}: the restated record's account on disk`);   // (r3749: a wait on the record, not a fixed sleep)
  const d = onDisk(s);
  ACTIVE.delete('sess-made-up-live-4');
  ok(!!(d && d.accountId === 'acct-made-up-live' && d.host === 'a-made-up-machine' && d.taskId === 'g-made-up-live' && d.poolPin && d.poolPin.pool === 'pool-made-up'),
    `a torn record restated whole by its live conversation carries what that conversation holds and the whole writer does not list: its account (${d && d.accountId}), its machine, its group, its pool — so it resumes on its own account — RED: the restatement held only the listed keys`, d);
}

console.log('⑫ r3245 (1) — a live conversation whose record is unread at a start is LISTED: by its socket\'s name, never attached, stopped by its Stop');
{
  const S = 'vs-smheld-sock-unread-live', f = path.join(META_DIR, S + '.json');
  fs.writeFileSync(f, JSON.stringify({ name: 'the unread live conversation', webuiSessionId: 'sess-made-up-unread', claudeSessionId: 'c-made-up-unread' }));
  REFUSE.add(f);
  const meta = SS.readSessionMeta(S);   // the real reader: an UNREAD record, marked
  const SRC = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  const BR = SRC('src/server/boot-restore.js'), WS = SRC('src/ws-handler.js'), SV = SRC('server.js'), CARD = SRC('src/lib/session-card.js');
  const braces = (text, head) => { const a = text.indexOf(head); if (a < 0) return ''; let d = 0; for (let i = text.indexOf('{', a + head.length - 1); i < text.length; i++) { if (text[i] === '{') d++; else if (text[i] === '}' && --d === 0) return text.slice(a, i + 1); } return ''; };
  const lineOf = (text, head) => { const a = text.indexOf(head); return a < 0 ? '' : text.slice(a, text.indexOf('\n', a)); };
  const sfm = braces(BR, 'function sessionFromMeta(meta, transportFacts) {');
  const BLOCK = braces(BR, "if (require('./session-meta-verdict.js').isUnread(meta)) {");
  // r4150: THE SLICE TAKES WHAT IT NEEDS — every name of boot-restore's OWN top-level requires that sessionFromMeta reads comes from the
  // same module (the release's restoredForkSource came after this leg was written: a fixed list of stand-ins went stale)
  const GIVEN = new Set(['require', 'activeSessions', 'os', 'poolPinFromMeta', 'restoreMarks', 'BUILD_VERSION', 'console', 'meta', 'SOCK']);
  const REQ = new Map();
  for (const m of BR.matchAll(/^const \{([^}]+)\} = require\('([^']+)'\)/gm)) for (const part of m[1].split(',')) { const [from, as] = part.split(':').map((x) => x.trim()); if (from && !GIVEN.has(as || from)) REQ.set(as || from, { mod: m[2], key: from }); }
  const NEEDED = [...REQ.keys()].filter((n) => new RegExp(`\\b${n}\\b`).test(sfm));
  const neededOf = () => NEEDED.map((n) => { const r = REQ.get(n); return require(path.join(REPO, 'src/server', r.mod))[r.key]; });
  const restore = (block) => {   // the restore's step for ONE live socket, its unread branch as shipped; a socket past it is ADOPTED
    const live = new Map();
    const req = (m) => (m === './session-meta-verdict.js' ? SMV : require(m));
    new Function('require', 'activeSessions', 'os', 'poolPinFromMeta', 'restoreMarks', 'BUILD_VERSION', 'console', 'meta', 'SOCK', ...NEEDED,
      `${sfm}\nfunction* each() { for (const sockFile of [SOCK]) { const socketPath = '/made/up/sockets/' + sockFile;\n${block}\nactiveSessions.set('sess-minted-' + sockFile, { adopted: true }); yield; } }\nfor (const _ of each()) { }`)(
      req, live, os, () => null, () => ({}), 'v-made-up', { log: () => { }, warn: () => { } }, meta, S, ...neededOf());
    return live;
  };
  const live = restore(BLOCK), L = live.get(S);
  const today = restore(BLOCK.replace('activeSessions.set(sockFile, listed);', ''));
  ok(!!(unread(meta) && L && L._metaUnread && L._metaUnread.sock === S && L._metaUnread.socketPath === '/made/up/sockets/' + S && L.name === S && L.mode === 'terminal' && L.pty === null && !('sockName' in L) && !L.socketPath && live.size === 1 && ![...live.keys()].some((k) => k.startsWith('sess-'))),
    `the restore LISTS a live socket whose record could not be read under its SOCKET's name (${[...live.keys()].join(', ')}), never under a minted id and never adopted; it carries no record name, so no writer reaches the record through it (a rename's whole write would restate the torn record from a stub) — RED (the skip it replaces): nothing listed (${today.size} entries), the conversation runs on unseen`,
    { keys: [...live.keys()], today: [...today.keys()] });
  ok(today.size === 0, 'RED control: without the listing the restore leaves the live conversation out of the list (it runs on, unseen)');
  // the list's row: the card's state words
  const rs = (SV.match(/remoteState: ([^\n]*?),\s+\/\/ r2/) || [])[1] || '';
  const stateOf = (expr, s) => { try { return new Function('s', `return ${expr};`)(s); } catch (e) { return 'threw: ' + e.message; } };
  const Ltoday = { ...L, _remoteState: null };   // the listing without its state (RED below)
  ok(!!(rs && stateOf(rs, L) === 'record-unread' && stateOf(rs, {}) === null && stateOf(rs, Ltoday) === null && /s\.remoteState === 'record-unread'/.test(CARD) && CARD.includes("tr('its record could not be read')")),
    `its row in the conversation list (the payload's own state expression) says its record could not be read (state ${stateOf(rs, L)}; the card's chip words and tip) and an ordinary conversation's row is unchanged — RED: without its state the row names nothing (${stateOf(rs, Ltoday)})`);
  const zh = SRC('src/lib/i18n-zh.js'), ja = SRC('src/lib/i18n-ja.js');
  const tip = (CARD.match(/rchip\.dataset\.tip = tr\('(This conversation keeps running, but its record[^']*)'\)/) || [])[1] || '';
  ok(!!(tip && ['its record could not be read', tip].every((k) => zh.includes(`"${k}": "`) && ja.includes(`"${k}": "`))), 'r3749: the chip\'s words and its tip speak of the record, each with its Chinese and Japanese row');
  // the attach: refused BY NAME, before the socket joins the conversation
  const refusal = lineOf(WS, 'if (session && session._metaUnread) {');
  const attachOf = (line) => { const sent = []; const r = new Function('session', 'ws', 'data', `do {\n${line}\nreturn 'attached'; } while (false); return 'refused';`)(L, { send: (m) => sent.push(JSON.parse(m)) }, { sessionId: S }); return { r, sent }; };
  const at = attachOf(refusal), atToday = attachOf('');
  const join = WS.indexOf('const session = activeSessions.get(data.sessionId);   // read AFTER the warm'), ri = WS.indexOf(refusal), next = WS.indexOf('if (session) {', join);
  ok(!!(refusal && at.r === 'refused' && at.sent.length === 1 && at.sent[0].type === 'error' && at.sent[0].code === 'session-meta-unread' && at.sent[0].sessionId === S && at.sent[0].message.includes(S) && join > 0 && ri > join && ri < next && attachOf(refusal).r === 'refused' && new Function('session', 'ws', 'data', `do {\n${refusal}\nreturn 'attached'; } while (false); return 'refused';`)({}, { send: () => { } }, {}) === 'attached'),
    `an attach of it is refused BY NAME (code ${at.sent[0] && at.sent[0].code}) before the socket joins the conversation (the line sits between the read of the live set and its attach); any other conversation attaches as before — RED: today it would attach (${atToday.r})`);
  // its Stop: the kill body (the release's, pinned by test-discovery-spawn) reaches its socket and its record
  const stop = lineOf(WS, 'if (session._metaUnread) { session.socketPath');
  const body = WS.indexOf('const endSessionBody = async'), si = WS.indexOf(stop), kill = WS.indexOf('// Kill the dtach session process (which kills claude as its child)');
  const STOPW = (WS.match(/const META_UNREAD_STOP = i18nKey\('([^']*)'\)/) || [])[1] || '', said = [];
  const sayLine = lineOf(WS, 'const sayUnreadStop = (s) => {');
  const sayUnreadStop = new Function('ctx', 'META_UNREAD_STOP', sayLine + '\nreturn sayUnreadStop;')({ serverNotice: (key, text, o) => said.push({ key, text, o }) }, STOPW);
  const Lc = { ...L }; new Function('session', 'sayUnreadStop', stop)(Lc, sayUnreadStop);
  const back = SS.deleteSessionMeta(Lc.sockName);
  const row = (SMV && typeof SMV.rows === 'function' ? SMV.rows() : []).find((r) => r.name === S || r.file === S + '.json' || String(r.file || '').endsWith(S + '.json'));
  ok(!!(stop && body > 0 && si > body && si < kill && WS.indexOf('session._exitAsked = { by: \'terminate\'', body) < si && Lc.socketPath === '/made/up/sockets/' + S && Lc.sockName === S && STOPW && said.length === 1 && said[0].o.i18n.key === STOPW && said[0].o.i18n.params.name === S && said[0].text.includes(S) && back === false && (onDisk(S) || {}).webuiSessionId === 'sess-made-up-unread' && row && row.removalOwed === true),
    `its Stop reaches its socket (the kill body's ${'`'}if (session.socketPath)${'`'} ends the process holding ${Lc.socketPath}) and its record: the removal is REMEMBERED for its read (${back}, removal owed ${row && row.removalOwed}), the record itself still there; r3749: its Stop TELLS the person a side on another machine may still run («${said[0] && said[0].text}») — RED: without the line the kill body has no socket to end and no record to name (${!!L.socketPath} / ${!!L.sockName})`,
    { row });
}

console.log('⑭ r3245 (2) / r3749 — a torn record the person removed is restated from what its LIVE conversation knows');
{
  const SSP = path.join(REPO, 'src/server/session-stdout.js'), SSsrc = fs.readFileSync(SSP, 'utf8'), M14 = mutantCopies('smheld14', REPO);
  const ROAD = 'return liftMeta(sockName, liveExtrasOf(sockName));';
  const scene = async (SSx, s) => {
    const f = path.join(META_DIR, s + '.json');
    fs.writeFileSync(f, '{"name":"a torn conversation with a live session","cwd":"/made/up');
    ACTIVE.set('sess-' + s, { sockName: s, name: 'the live one', _accountId: 'acct-' + s, host: 'machine-' + s, _initialGroupId: 'g-' + s });
    SSx.readSessionMeta(s); await copied(s);
    fs.unlinkSync(f);
    const gone = SSx.readSessionMeta(s); ACTIVE.delete('sess-' + s);
    return gone;
  };
  const mk14 = (mod) => mod.create({ rootDir: TMP, BUFFERS_DIR, META_DIR, activeSessions: ACTIVE, engine: {}, getHosts: () => null });
  const g = await scene(SS, 'vs-smheld-removed-live');
  const R = await scene(mk14(M14.load('src/server/session-stdout.js', anchored(SSsrc, ROAD, 'return liftMeta(sockName, {});', 'the removed road handed an empty record'), 'removed-empty')), 'vs-smheld-removed-live-red');
  ok(!!(g && !unread(g) && g.accountId === 'acct-vs-smheld-removed-live' && g.host === 'machine-vs-smheld-removed-live' && g.taskId === 'g-vs-smheld-removed-live' && R && !unread(R) && !R.accountId && !R.host),
    `a torn record the person REMOVED after its copy reads as what its live conversation knows — its account (${g && g.accountId}), machine, group — never an empty record a stub would spread; RED (the lift handed an empty record): none of them (${R && JSON.stringify(R)})`, { g, R });
}

console.log('⑮ r3245 (3) / r3749 — a torn record restated whole is marked ONCE: no second read, no second helper, no second «did not parse»');
{
  const SSP = path.join(REPO, 'src/server/session-stdout.js'), SSsrc = fs.readFileSync(SSP, 'utf8'), M15 = mutantCopies('smheld15', REPO);
  const ONE = '{ durable, sync, flagOnly, prev: {} });';
  const mk15 = (mod) => mod.create({ rootDir: TMP, BUFFERS_DIR, META_DIR, activeSessions: ACTIVE, engine: {}, getHosts: () => null });
  const LOGS = [], realW = console.warn, realL = console.log;
  console.warn = (...a) => { LOGS.push(a.join(' ')); }; console.log = (...a) => { LOGS.push(a.join(' ')); realL(...a); };
  const scene = async (SSx, s) => {
    fs.writeFileSync(path.join(META_DIR, s + '.json'), '{"name":"a torn conversation restated","cwd":"/made/up');
    SSx.readSessionMeta(s); await copied(s);
    const before = LOGS.filter((l) => l.includes(s) && /did not parse|could not be read/.test(l)).length;
    SSx.writeSessionMeta(s, { name: 'a torn conversation restated', cwd: '/made/up/15', webuiSessionId: 'sess-' + s }, { durable: true, whole: true });
    land(s);
    return { before, after: LOGS.filter((l) => l.includes(s) && /did not parse|could not be read/.test(l)).length, marked: SMV.isMarked(s), d: onDisk(s) };
  };
  const one = await scene(SS, 'vs-smheld-restated-once');
  const two = await scene(mk15(M15.load('src/server/session-stdout.js', anchored(SSsrc, ONE, '{ durable, sync, flagOnly });', 'the recursion without the read version'), 'second-mark')), 'vs-smheld-restated-twice');
  console.warn = realW; console.log = realL;
  ok(!!(one.before >= 1 && one.after === one.before && one.marked === false && one.d && one.d.cwd === '/made/up/15' && two && (two.marked === true || two.after > two.before)),
    `a whole restatement of a torn record (after its copy) passes the version it read: the still-torn file is read NO second time — no second mark (${one.marked}), no second line (${one.before} → ${one.after}); RED (its recursion without the read version): marked again (${two && two.marked}, lines ${two && two.before} → ${two && two.after})`, { one, two });
}

console.log('⑬ r3302 / r3749 — an owed patch is written AGAIN BY ITSELF, the stop writes what is owed, a write in flight never brings the old value back, and the person is TOLD');
{
  // (LAST in this suite: its stop is the store writer's own exit flush.) The chain's clock, scaled for a suite: the hub's bound is
  // 10 s and its own tries 2 / 5 / 15 / 30 / 60 s — here ONE bound and ONE try (the flight scene: its one try far off, its writes first)
  const CLOCK = { linkMs: 1000, againMs: [1000], tellAgainMs: 1000 }, CLOCK_FAR = { linkMs: 1000, againMs: [600000], tellAgainMs: 1000 };
  const STALL = new Map();   // file → off-loop reads HELD (a PLACED stall of the chain's read: it never answers)
  const before = fs.promises.readFile;
  fs.promises.readFile = function (p, ...a) { const k = typeof p === 'string' ? path.resolve(p) : null; const n = k ? STALL.get(k) || 0 : 0; if (n > 0) { STALL.set(k, n - 1); return new Promise(() => { }); } return before.call(fs.promises, p, ...a); };
  const SSP = path.join(REPO, 'src/server/session-stdout.js'), SSsrc = fs.readFileSync(SSP, 'utf8'), MUT = mutantCopies('smheld', REPO);
  const AGAIN = '    else { owedPatch.set(fp, full); oweAgain(sockName, fp, owner, Object.keys(patch || {}).length > 0); }';
  const PENDING = '  pendingMeta.set(fp, text); writingMeta.set(fp, text); writingOwed.set(fp, owed);';
  const TELL = '    tellOwed(sockName, fp);   // r3749 / r3920';
  const AGAIN_WORD = '  if (!atStop && !t0.timer) {   // r3920 (1)', STOP_WORD = 'tellOwed(sock, fp, { atStop: true }); return plain(); }   // r3920 (2)', MISSING = "if (tok && e && e.code === 'ENOENT') tok.never = true; ";
  const NOPAGE = new Map();   // sock → how many of its notices find NO page open (the stand-in answers 0 pages for them)
  const sockOfKey = (k) => String(k).replace(/^meta-owed:/, '').replace(/:\d+$/, '');
  const NOTICES = [], WARNS = [], realWarn = console.warn;
  console.warn = (...a) => { WARNS.push(a.join(' ')); };
  const mk = (mod, clock) => mod.create({ rootDir: TMP, BUFFERS_DIR, META_DIR, activeSessions: ACTIVE, engine: {}, getHosts: () => null, patchClock: clock, serverNotice: (key, text, o) => { const s = sockOfKey(key), left = NOPAGE.get(s) || 0; NOTICES.push({ key, text, o, warnsSeen: WARNS.length, pages: left > 0 ? 0 : 1 }); if (left > 0) { NOPAGE.set(s, left - 1); return 0; } return 1; } });
  const mut = (from, to, tag) => MUT.load('src/server/session-stdout.js', anchored(SSsrc, from, to, tag), tag);
  const cured = mk(require(SSP), CLOCK), curedFar = mk(require(SSP), CLOCK_FAR);
  const todayM = mut(AGAIN, '    else owedPatch.set(fp, full);   // TODAY: owed to the NEXT patch only', 'owed'), today = todayM && mk(todayM, CLOCK);
  const flightM = mut(PENDING, '  writingMeta.set(fp, t); writingOwed.set(fp, owed);   // e4bcad50b: the owed keys in the BYTES only', 'flight'), flight = flightM && mk(flightM, CLOCK_FAR);
  const silentM = mut(TELL, '    // (the tries end without a word)', 'silent'), silent = silentM && mk(silentM, CLOCK);
  const onceM = mut(AGAIN_WORD, '  if (false) {   // 93a03e36a: said once, a page or none', 'said-once'), once = mk(onceM, CLOCK);
  const quietStopM = mut(STOP_WORD, 'return plain(); }   // 93a03e36a: the stop says nothing', 'quiet-stop'), quietStop = mk(quietStopM, CLOCK_FAR);
  const missingM = mut(MISSING, '', 'missing-tried'), missingT = mk(missingM, CLOCK);
  NOPAGE.set('vs-owed-e', 1); NOPAGE.set('vs-owed-e-today', 1);   // no page open when their tries end (the person closed it)
  const NAME = (s) => 'the conversation the person calls ' + s;
  const press = (SSx, s, held) => {   // a stopped conversation; the person turns automatic continue OFF; its link's read is held
    fs.writeFileSync(path.join(META_DIR, s + '.json'), JSON.stringify({ name: 'a stopped conversation', webuiSessionId: 'sess-' + s, autoResume: true }));
    ACTIVE.set('sess-' + s, { sockName: s, name: NAME(s) });
    STALL.set(path.resolve(path.join(META_DIR, s + '.json')), held);
    return SSx.patchSessionMeta(s, { autoResume: false }, { owner: 'sess-' + s });
  };
  const autoOf = (s) => { const d = onDisk(s); return d && typeof d === 'object' ? d.autoResume : d; };
  // THE FLIGHT (r3749's must): while the write that carries the owed change is in flight, a whole writer spreads the record — placed IN
  // that window: the store writer's producer of this record, wrapped; right after it hands its bytes the next writer spreads (never load)
  const SWx = require(path.join(REPO, 'src/store-writer.js')).storeWriter(), realDirty = SWx.dirty, HOOK = new Map();
  SWx.dirty = function (file, o) {
    const h = HOOK.get(file);
    if (h && !h.fired && o && typeof o.produce === 'function') { const p0 = o.produce; o = { ...o, produce: (x) => { const b = p0(x); if (!h.fired && typeof b === 'string') { h.fired = true; h.during(); } return b; } }; }
    else if (h && h.fired && h.hold && !h.go) { h.hold.push([this, file, o]); return; }   // r5145: the PLACED flight — the write after the first HELD until let go
    return realDirty.call(this, file, o);
  };
  // r5145: the flight's second write is waited for ON ITS LANDING (a generous bound, a named expiry) — never a fixed 200 × 10 ms poll
  // (box row 029d04ded at load 40: «landed false» both ways, the write not yet on disk). `held`: the PLACED red — the second write HELD
  // (the store writer's dirty for it deferred) past the old poll: read as the leg stood it «never landed»; let go, the wait reads it
  const flightScene = async (SSx, s, { held = false } = {}) => {
    const first = await press(SSx, s, Infinity);   // dropped at its bound: owed; its own try far off
    const file = path.join(META_DIR, s + '.json'), landedNow = () => (onDisk(s) || {}).lastRequestAt === 2;
    HOOK.set(file, { fired: false, during: () => SSx.writeSessionMeta(s, { ...SSx.readSessionMeta(s), lastRequestAt: 2 }), hold: held ? [] : null, go: false });
    SSx.writeSessionMeta(s, { ...SSx.readSessionMeta(s), apiKeySource: 'a-whole-writer' });   // a whole writer of the boot backfill's shape
    let asStood = null, heldAtOld = null;
    if (held) {
      for (let i = 0; i < 200 && !landedNow(); i++) await sleep(10);   // the old poll, read as the leg stood (the hold in force)
      const h = HOOK.get(file); asStood = landedNow(); heldAtOld = h.hold.length;
      h.go = true; for (const [self, f, o] of h.hold.splice(0)) realDirty.call(self, f, o);   // let go
    }
    const landed = !!(await waitFact(landedNow, `⑬ ${s}: the flight's second write landed`, 30000, 10));
    return { first, fired: HOOK.get(file).fired, landed, asStood, heldAtOld };
  };
  const t0 = Date.now();
  // (a) the storage answers again after the held read; (b) it stays held off the loop, the hub's own synchronous read of the record
  // answers (its whole writers read it so); (b2) held, and no read answers since: the stop must not block on it; (c) the flight
  const [firsts, fl, flT, flH] = await Promise.all([
    Promise.all([press(cured, 'vs-owed-a', 1), press(cured, 'vs-owed-b', Infinity), press(cured, 'vs-owed-b2', Infinity), press(cured, 'vs-owed-e', Infinity), press(once, 'vs-owed-e-today', Infinity), press(curedFar, 'vs-owed-d', Infinity), press(quietStop, 'vs-owed-d-today', Infinity),
      ...['vs-owed-m', 'vs-owed-m-today'].map((s, i) => { ACTIVE.set('sess-' + s, { sockName: s, name: NAME(s) }); return (i ? missingT : cured).patchSessionMeta(s, { autoResume: false }, { owner: 'sess-' + s }); }), ...(today ? [press(today, 'vs-owed-a-today', 1), press(today, 'vs-owed-b-today', Infinity)] : []), ...(silent ? [press(silent, 'vs-owed-b-silent', Infinity)] : [])]),
    flightScene(curedFar, 'vs-owed-c'), flight ? flightScene(flight, 'vs-owed-c-today') : null, flightScene(curedFar, 'vs-owed-c-held', { held: true })]);
  // r5145: «none while a try was still owed» is read on the PRODUCT's ORDER, never at a moment: the tries' end says its journal line
  // first and then the word (src/server/session-stdout.js), so a notice of b's that came before that line came while a try was owed
  // (the old read — b's notices right after the scene's first await — moved with whatever that await held: the placed flight's 2 s)
  const triesEndAt = () => WARNS.findIndex((w) => /vs-owed-b: a change of its record \(autoResume\) could not be written in 1 tries of its own/.test(w));
  const whileTryingOf = () => { const i = triesEndAt(); return NOTICES.filter((n) => n.key.startsWith('meta-owed:vs-owed-b:') && (i < 0 || n.warnsSeen <= i)).length; };
  // until the cured (a) is on disk and the cured (b) has spent its tries: its bound, the try's wait, the try's bound
  const spent = CLOCK.linkMs + CLOCK.againMs[0] + CLOCK.linkMs;
  const toldTo = (s) => NOTICES.filter((n) => sockOfKey(n.key) === s);
  // until the cured (a) is on disk, the cured (b) has spent its tries and (e)'s word, said to no page at its tries' end, is said again
  // to a page (its word-again: one more tellAgainMs) — each by its own fact, the clock's sum only as the bound
  const bound = spent + CLOCK.tellAgainMs + 2 * CLOCK.linkMs;   // the OLD wait's bound: the sum of the product's own test clocks
  const facts = () => !!(autoOf('vs-owed-a') === false && toldTo('vs-owed-b').length && toldTo('vs-owed-e').some((n) => n.pages === 1) && toldTo('vs-owed-m-today').length && toldTo('vs-owed-e-today').length);
  // r5145: the wait is ON THESE FACTS (a generous bound, a named expiry) — never a bound made of the product's own test clocks, which a
  // loaded loop spends before those clocks' timers run (box row 029d04ded at load 40: nothing told yet). PLACED, RED AT WILL: the loop
  // STALLED (a synchronous stall of the leg's own) from inside the window past that old bound — WITNESS: it began before the bound with
  // the facts not in, and ended past it — read as the leg stood (its bound spent) nothing had landed or been told; the wait reads them
  const stall = { bound, from: Date.now() - t0, before: facts() };
  stall.placed = stall.from < bound && !stall.before;
  if (stall.placed) { const tk = new Int32Array(new SharedArrayBuffer(4)), end = t0 + bound + 300; while (Date.now() < end) Atomics.wait(tk, 0, 0, Math.max(1, end - Date.now())); }
  stall.to = Date.now() - t0; stall.asStood = facts();
  const factsIn = !!(await waitFact(facts, '⑬: the presses\' facts (a on disk OFF, b told, e told to a page, m-today and e-today told)', 30000, 50));
  const silentBeforeStop = NOTICES.filter((n) => n.key.startsWith('meta-owed:vs-owed-b-silent:'));
  const eBeforeStop = toldTo('vs-owed-e'), eTBeforeStop = toldTo('vs-owed-e-today');   // r3920 (1) is judged on the words BEFORE the stop (the stop's own word is (2)'s)
  const beforeStop = { a: autoOf('vs-owed-a'), aToday: autoOf('vs-owed-a-today'), b: autoOf('vs-owed-b'), bToday: autoOf('vs-owed-b-today'), at: Date.now() - t0 };
  cured.readSessionMeta('vs-owed-b'); if (today) today.readSessionMeta('vs-owed-b-today');   // (b) the hub's own synchronous read answers
  // THE STOP: the hub's exit flushes what cannot be re-derived first (rank 0)
  SWx.dirty = realDirty;
  SWx.exitFlush({ only: 'rank0' });   // (its keeper thread is not armed here: this is the flush alone)
  // THE NEW START: a fresh store over the same records
  const fresh = require(SSP).create({ rootDir: TMP, BUFFERS_DIR, META_DIR, activeSessions: new Map(), engine: {}, getHosts: () => null });
  const after = Object.fromEntries(['vs-owed-a', 'vs-owed-b', 'vs-owed-b2', 'vs-owed-c', 'vs-owed-a-today', 'vs-owed-b-today', 'vs-owed-c-today'].map((s) => [s, fresh.readSessionMeta(s).autoResume]));
  const atStop = { d: toldTo('vs-owed-d'), dToday: toldTo('vs-owed-d-today') };
  fs.promises.readFile = before; console.warn = realWarn;
  for (const s of ['a', 'b', 'b2', 'c', 'c-held', 'd', 'e', 'm', 'a-today', 'b-today', 'b-silent', 'c-today', 'd-today', 'e-today', 'm-today']) ACTIVE.delete('sess-vs-owed-' + s);
  if (stall.placed) ok(stall.to > bound && !stall.asStood && factsIn, `⑬ PLACED (r5145): the loop STALLED from ${stall.from} ms to ${stall.to} ms past the old bound (${bound} ms, the product's test clocks summed) — read as the leg stood nothing had landed or been told (${stall.asStood}): the old wait's red; the wait on the facts reads them (${factsIn})`, stall);
  else console.log(`  · SKIP ⑬ PLACED stall — the window had closed before it could be placed (from ${stall.from} ms of ${bound}; the facts already in: ${stall.before}): not a judgement`);
  if (flH && flH.heldAtOld >= 1) ok(!!(flH.asStood === false && flH.landed), `⑬ PLACED (r5145): the flight's second write HELD (${flH.heldAtOld} write deferred when the old poll ended) — read as the leg stood (200 × 10 ms) it «never landed» (${flH.asStood}): the old poll's red; let go, the wait on its landing reads it (${flH.landed})`, flH);
  else console.log(`  · SKIP ⑬ PLACED flight — its second write was never held (the hook did not see it): not a judgement`);
  ok(!!(firsts[0] === false && firsts[1] === false && beforeStop.a === false && after['vs-owed-a'] === false),
    `the person's press whose link the held read dropped (${firsts[0]}) is written AGAIN BY ITSELF, off the loop, with no later patch: on disk before any stop (${beforeStop.a} at ${beforeStop.at} ms) and the new start reads automatic continue OFF (${after['vs-owed-a']})`, { firsts, beforeStop, after });
  ok(!!(beforeStop.b === true && after['vs-owed-b'] === false),
    `storage that answers no read off the loop while the hub's own synchronous read of the record answers: the press stays owed through its own tries (${beforeStop.b} on disk) and THE STOP's flush writes it — the new start reads OFF (${after['vs-owed-b']})`, { beforeStop, after });
  const skipSaid = WARNS.filter((w) => /vs-owed-b2: the stop's flush does not read its record/.test(w)).length;
  ok(!!(after['vs-owed-b2'] === true && skipSaid === 1),
    `r3749: a record whose last read off the loop never answered (and none since) is NOT read by the stop's flush — a storage that may hang the exit holds nothing there; said once in the journal (${skipSaid}), and the person was told when the tries ended (below)`, { after, skipSaid });
  ok(!!(fl.first === false && fl.fired && fl.landed && after['vs-owed-c'] === false && flT && flT.fired && flT.landed && after['vs-owed-c-today'] === true),
    `r3749 THE MUST: a whole writer that spreads the record WHILE the write carrying the owed change is in flight spreads the person's value — both writes land and the new start reads OFF (${after['vs-owed-c']}); RED (e4bcad50b's form, the owed keys in the bytes only): the second write puts the old value back and the new start reads ON (${after['vs-owed-c-today']}) — a turn nobody typed`, { fl, flT, after });
  const told = NOTICES.filter((n) => n.key.startsWith('meta-owed:vs-owed-b:')), toldSilent = silentBeforeStop;   // (its tries' end; the stop's own word is r3920 (2)'s, judged below)
  const saidOnce = WARNS.filter((w) => /vs-owed-b: a change of its record \(autoResume\) could not be written in 1 tries of its own/.test(w)).length;
  const whileTrying = whileTryingOf();
  ok(!!(whileTrying === 0 && told.length === 1 && told[0].o && told[0].o.i18n && /^Automatic continue OFF for “\{name\}” is not saved on disk yet/.test(told[0].o.i18n.key) && told[0].o.i18n.params.name === NAME('vs-owed-b') && told[0].text.includes(NAME('vs-owed-b')) && saidOnce === 1 && silent && toldSilent.length === 0),
    `r3749: THE PERSON IS TOLD — when the tries end without a landing, ONE notice naming the conversation by what the person calls it («${told[0] && told[0].text}»), none while a try was still owed (${whileTrying}), the journal's line said once (${saidOnce}); RED (the tries' end without its word): no notice (${toldSilent.length})`, { told, whileTrying, saidOnce });
  const e = eBeforeStop, eT = eTBeforeStop;
  ok(!!(e.length === 2 && e[0].pages === 0 && e[1].pages === 1 && eT.length === 1 && eT[0].pages === 0),
    `r3920 (1) SAID MEANS A PAGE GOT IT: with no page open when the tries end the word is said again once one is (${e.map((n) => n.pages).join(' → ')} page(s)); RED (93a03e36a: the mark set before the count was known): said once to no page and never again (${eT.map((n) => n.pages).join(' → ')})`, { e, eT });
  ok(!!(atStop.d.length === 1 && /^Automatic continue OFF/.test(atStop.d[0].o.i18n.key) && atStop.d[0].o.i18n.params.name === NAME('vs-owed-d') && atStop.dToday.length === 0),
    `r3920 (2) A STOP INSIDE THE TRIES' WINDOW TELLS: the stop's flush leaves a stalled record's owed OFF unwritten and says the same notice to the pages connected, before the exit («${atStop.d[0] && atStop.d[0].text}»); RED (93a03e36a): a journal line only (${atStop.dToday.length} notices)`, atStop);
  const m = toldTo('vs-owed-m'), mT = toldTo('vs-owed-m-today'), mTries = WARNS.filter((w) => /vs-owed-m: a change of its record/.test(w)).length;
  ok(!!(m.length === 0 && mTries === 0 && mT.length === 1),
    `r3920: a record file that is MISSING gets no tries and no word «its storage did not answer» (${m.length} notices, ${mTries} tries' line) — RED (93a03e36a): tried, and the person told a false cause (${mT.length})`, { m, mT });

}

clearInterval(KEEP);
report();

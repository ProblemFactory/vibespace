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

const ACTIVE = new Map();   // the live conversations this suite stands in for (a name the notice may say)
const SS = require(path.join(REPO, 'src/server/session-stdout.js')).create({ rootDir: TMP, BUFFERS_DIR, META_DIR, activeSessions: ACTIVE, engine: {}, getHosts: () => null });
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
  for (let i = 0; i < 40 && !fs.readdirSync(META_DIR).some((n) => n.startsWith(d + '.json.corrupt-')); i++) await sleep(25);
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

console.log('⑨ r3199 — a torn record the person removes is «not there» again; the notice names the conversation');
{
  const s = 'vs-smheld-sock-torn-2', f = path.join(META_DIR, s + '.json');
  fs.writeFileSync(f, '{"name":"the torn conversation","cwd":"/made/up');
  SS.readSessionMeta(s);
  for (let i = 0; i < 40 && !fs.readdirSync(META_DIR).some((n) => n.startsWith(s + '.json.corrupt-')); i++) await sleep(25);
  const rows = SMV && typeof SMV.rows === 'function' ? SMV.rows() : [];
  const named = rows.find((r) => r.file === s + '.json');
  fs.unlinkSync(f);
  const gone = SS.readSessionMeta(s);
  const live = born(9), lf = path.join(META_DIR, live + '.json');
  ACTIVE.set('sess-made-up-9', { sockName: live, name: 'a made-up live conversation' });
  REFUSE.add(lf); SS.readSessionMeta(live);
  const liveRow = (SMV && typeof SMV.rows === 'function' ? SMV.rows() : []).find((r) => r.file === live + '.json');
  REFUSE.delete(lf); await readAgain(live); ACTIVE.delete('sess-made-up-9');
  ok(!!(named && named.name === 'the torn conversation' && !unread(gone) && gone && !Object.keys(gone).length && liveRow && liveRow.name === 'a made-up live conversation'),
    `the notice's rows name the conversation (from its torn bytes: «${named && named.name}»; from its live session: «${liveRow && liveRow.name}»), never a path; a torn record the person REMOVED after its copy is «not there» again (an empty record, not unread)`);
}


console.log('⑩ r3245 — the copy FIRST: a whole write before the torn bytes are copied waits; after the copy it restates');
{
  const s = 'vs-smheld-sock-torn-3', f = path.join(META_DIR, s + '.json');
  const TORN3 = '{"name":"the third torn conversation","cwd":"/made/up';
  fs.writeFileSync(f, TORN3);
  SS.writeSessionMeta(s, { ...SS.readSessionMeta(s), name: 'the live conversation, too early', cwd: '/made/up/early' }, { durable: true, whole: true });   // the same turn as the read: no copy yet
  land(s);
  const early = realReadSync.call(fs, f, 'utf8');
  for (let i = 0; i < 40 && !fs.readdirSync(META_DIR).some((n) => n.startsWith(s + '.json.corrupt-')); i++) await sleep(25);
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
  for (let i = 0; i < 40 && !fs.readdirSync(META_DIR).some((n) => n.startsWith(s + '.json.corrupt-')); i++) await sleep(25);
  await sleep(20);
  SS.writeSessionMeta(s, { ...SS.readSessionMeta(s), name: 'the fourth live conversation', cwd: '/made/up/live-4', webuiSessionId: 'sess-made-up-live-4' }, { durable: true, whole: true });
  land(s); await sleep(50); land(s);
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
  const restore = (block) => {   // the restore's step for ONE live socket, its unread branch as shipped; a socket past it is ADOPTED
    const live = new Map();
    const req = (m) => (m === './session-meta-verdict.js' ? SMV : require(m));
    new Function('require', 'activeSessions', 'os', 'poolPinFromMeta', 'restoreMarks', 'BUILD_VERSION', 'console', 'meta', 'SOCK',
      `${sfm}\nfunction* each() { for (const sockFile of [SOCK]) { const socketPath = '/made/up/sockets/' + sockFile;\n${block}\nactiveSessions.set('sess-minted-' + sockFile, { adopted: true }); yield; } }\nfor (const _ of each()) { }`)(
      req, live, os, () => null, () => ({}), 'v-made-up', { log: () => { }, warn: () => { } }, meta, S);
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
  ok(!!(rs && stateOf(rs, L) === 'record-unread' && stateOf(rs, {}) === null && stateOf(rs, Ltoday) === null && /s\.remoteState === 'record-unread'/.test(CARD) && CARD.includes("tr('Status unknown — it could not be read')")),
    `its row in the conversation list (the payload's own state expression) says its record could not be read (state ${stateOf(rs, L)}; the card's chip words and tip) and an ordinary conversation's row is unchanged — RED: without its state the row names nothing (${stateOf(rs, Ltoday)})`);
  const zh = SRC('src/lib/i18n-zh.js'), ja = SRC('src/lib/i18n-ja.js');
  ok(['Status unknown — it could not be read'].every((k) => zh.includes(`"${k}": "`) && ja.includes(`"${k}": "`)), 'the chip\'s words are a row the Chinese and Japanese tables already hold');
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
  const Lc = { ...L }; new Function('session', stop)(Lc);
  const back = SS.deleteSessionMeta(Lc.sockName);
  const row = (SMV && typeof SMV.rows === 'function' ? SMV.rows() : []).find((r) => r.name === S || r.file === S + '.json' || String(r.file || '').endsWith(S + '.json'));
  ok(!!(stop && body > 0 && si > body && si < kill && WS.indexOf('session._exitAsked = { by: \'terminate\'', body) < si && Lc.socketPath === '/made/up/sockets/' + S && Lc.sockName === S && back === false && (onDisk(S) || {}).webuiSessionId === 'sess-made-up-unread' && row && row.removalOwed === true),
    `its Stop reaches its socket (the kill body's ${'`'}if (session.socketPath)${'`'} ends the process holding ${Lc.socketPath}) and its record: the removal is REMEMBERED for its read (${back}, removal owed ${row && row.removalOwed}), the record itself still there — RED: without the line the kill body has no socket to end and no record to name (${!!L.socketPath} / ${!!L.sockName})`,
    { row });
}
clearInterval(KEEP);
report();

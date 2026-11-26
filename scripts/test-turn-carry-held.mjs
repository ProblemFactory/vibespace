#!/usr/bin/env node
// test-turn-carry-held — B-f276, slice «hub-own-ledgers» (lane bl-scratch, 主开发 r4724): data/turn-carry-outstanding.json (the
// conversations a restart interrupted mid-delivery: the «restart line» is said from it) UNDER THE STORE-READ LAW (src/store-read-hold.js),
// through the REAL src/turn-carry.js createOutstanding over a scratch data folder of this suite's own. Its writer is a stand-in that
// writes the produced bytes to disk AT ONCE, so a write over the file shows on disk the moment a writer is asked. The unreadable file
// is a PLACED refusal of the read call (fs.openSync answers EIO for that one path), never a mount or a mode; torn bytes are bytes
// written whole that do not parse. Every wait is on the fact the leg judges, bounded, and fails by a named line. No vendor call.
//   ① UNREADABLE: HELD — every writer asked (mark, clear, rekey, said), the file's bytes byte for byte; the named answer (held(),
//     the family's list, its words); the restart line is not said for what the file holds until it reads.
//                                                     RED: the save's guard dropped — the table written over the unread file
//   ② THE HEAL at the next good read: every file row comes back «from before» beside the row marked while held (a row whose line
//     was said meanwhile stays gone); all on disk.          RED: a lift that takes the file's rows for the table
//   ③ TORN: held while its bytes are kept aside (a copy beside it, byte for byte), then it starts empty; a mark then writes.
//                                                     RED: the release's start — torn bytes read as empty, no copy, written over
//   ④ PAST THE SIZE BOUND: not read, and never written over in this run (said by its size).
//                                                     RED: the release's size road — started empty, written over
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const TC = require(path.join(REPO, 'src/turn-carry.js'));
const HOLD = require(path.join(REPO, 'src/store-read-hold.js'));
const M = mutantCopies('turn-carry-held', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'src/turn-carry.js'), 'utf8');
const NAME = 'turn-carry-outstanding.json';
const EIO = () => Object.assign(new Error('EIO: i/o error, open (placed)'), { code: 'EIO' });
/** a PLACED refusal of the start's read: fs.openSync answers EIO for that one path, `n` times */
const placeOpen = (file, n = 1) => {
  const f = path.resolve(file), real = fs.openSync; const seen = { n: 0 };
  fs.openSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === f && seen.n < n) { seen.n++; throw EIO(); } return real.call(this, p, ...a); };
  return { seen, restore: () => { fs.openSync = real; } };
};
/** the writer stand-in: the produced bytes ON DISK at once (a write over the file is seen the moment a writer is asked) */
const diskWriter = (asked) => ({ pending: () => false, flushSync() { }, durable: () => Promise.resolve(true),
  dirty(file, o) { asked.push(file); const b = o.produce(); fs.writeFileSync(file, b); try { o.onWritten && o.onWritten(true); } catch { } } });
/** a wait ON THE FACT, bounded: its expiry FAILS by a named line (never a silent read of whatever is there) */
async function until(fact, what, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fact()) return true; await new Promise((r) => setTimeout(r, 10)); }
  ok(false, `HARNESS: «${what}» did not come within ${ms / 1000} s`);
  return false;
}
let dirN = 0;
const mk = () => { const d = path.join(scratch('turn-carry-held'), 'd' + (++dirN)); fs.mkdirSync(d, { recursive: true }); return d; };
const fileOf = (dir) => path.join(dir, NAME);
const T = 1_800_000_000_000;
const table = { 'conv-old': { at: T - 60_000, delivery: 'dl-1' }, 'conv-two': { at: T - 30_000, delivery: 'dl-2' }, 'conv-three': { at: T - 20_000, delivery: 'dl-4' } };
const life = (Mod, dir, logs, asked) => Mod.createOutstanding(dir, { log: (...a) => logs.push(a.join(' ')), now: () => T, writer: diskWriter(asked) });
/** every writer the table has, asked once each */
const askAll = (o) => { o.mark('conv-new', { at: T, delivery: 'dl-3' }); o.clear('conv-two'); o.rekey('conv-new', 'conv-new2'); o.said('conv-old'); o.clearIf('conv-old', T - 60_000); };

console.log('① UNREADABLE (a placed refusal of the read): HELD — every writer asked, the file byte for byte; its named answer');
async function unreadable(Mod) {
  const dir = mk(), logs = [], asked = [];
  fs.writeFileSync(fileOf(dir), JSON.stringify(table));
  const bytes = fs.readFileSync(fileOf(dir));
  const pr = placeOpen(fileOf(dir));
  let o = null; try { o = life(Mod, dir, logs, asked); } finally { pr.restore(); }
  const heldAtStart = o.held && o.held();
  const listed = HOLD.holds().find((h) => h.file === NAME && h.held === true && h.code === 'EIO') || null;
  askAll(o);
  return { dir, o, logs, asked, seen: pr.seen.n, heldAtStart, listed, same: fs.readFileSync(fileOf(dir)).equals(bytes), fromBefore: o.fromBefore('conv-old'), bytes };
}
const u = await unreadable(TC);
ok(u.seen === 1 && !!u.heldAtStart && u.heldAtStart.code === 'EIO' && !!u.listed && u.asked.length === 0 && u.same && u.fromBefore === false
    && u.logs.filter((l) => /turn-carry-outstanding\.json could not be read \(EIO\) — held: nothing is written over it/.test(l)).length === 1
    && u.logs.filter((l) => /a write of the outstanding deliveries to turn-carry-outstanding\.json was refused/.test(l)).length === 1,
  '① HELD: the start\'s read refused (EIO) — the family\'s list names it, every writer asked (mark, clear, rekey, said) wrote NOTHING, the file is byte for byte as it was; said once each', { held: u.heldAtStart, asked: u.asked.length, same: u.same, logs: u.logs });
ok(/could not be read \(EIO\)/.test(u.o.heldWords() || ''), `① its words name what waits («${u.o.heldWords()}»)`);

console.log('② THE HEAL at the next good read: the file\'s rows «from before» beside the row marked while held, both on disk');
{
  const lifted = await u.o.readAgain();
  await until(() => !u.o.held(), 'the table lifted at the read again');
  const disk = JSON.parse(fs.readFileSync(fileOf(u.dir), 'utf8'));
  ok(lifted === true && !u.o.held() && u.o.fromBefore('conv-three') === true && u.o.fromBefore('conv-two') === true && !!disk['conv-three'] && !!disk['conv-two'] && !!disk['conv-new2'] && !disk['conv-old'],
    '② LIFTED: every row the file holds comes back «from before» (its restart line is said at its next answer) — a conversation asked or cleared meanwhile too — beside the row this run marked while held; only a row whose line this run already said stays gone; the table is written whole', { disk: Object.keys(disk), fromBefore: [u.o.fromBefore('conv-two'), u.o.fromBefore('conv-three')] });
}
// RED: a lift that takes the file's rows for the table — the row this run marked while held is lost
{
  const LIFT_OVER = M.load('src/turn-carry.js', anchored(SRC, "    for (const [k, r] of Object.entries(fileRows)) { if (saidHeld.has(k)) continue; if (!(k in rows)) rows[k] = r; before.add(k); }", "    rows = { ...fileRows }; for (const k of Object.keys(fileRows)) before.add(k);", 'the lift\'s merge'), 'lift-over');
  const r = await unreadable(LIFT_OVER);
  await r.o.readAgain(); await until(() => !r.o.held(), 'the red copy lifted');
  const disk = JSON.parse(fs.readFileSync(fileOf(r.dir), 'utf8'));
  ok(!disk['conv-new2'] && !!disk['conv-three'], 'RED (a lift that takes the file\'s rows for the table): the delivery marked while held is lost — its conversation is never told after the next restart', { disk: Object.keys(disk) });
}
// RED: the save's guard dropped — the release's «started empty» written over the unread file at the first mark
const NO_GUARD = M.load('src/turn-carry.js', anchored(SRC, "    if (big != null || (hold && !hold.writable('a write of the outstanding deliveries'))) return true;", '', 'the save\'s guard'), 'no-guard');
{
  const r = await unreadable(NO_GUARD);
  ok(!r.same && r.asked.length > 0 && !JSON.parse(fs.readFileSync(fileOf(r.dir), 'utf8'))['conv-three'], 'RED (the save\'s guard dropped — the release\'s start): the table started empty is written over the unread file, the conversations it held lost', { asked: r.asked.length });
}

console.log('③ TORN: held while its bytes are kept aside, then it starts empty; a mark then writes');
async function torn(Mod) {
  const dir = mk(), logs = [], asked = [];
  const tornBytes = Buffer.from('{"conv-old": {"at": ' + (T - 60_000) + ', "deliv');
  fs.writeFileSync(fileOf(dir), tornBytes);
  const o = life(Mod, dir, logs, asked);
  o.mark('conv-early', { at: T, delivery: 'dl-9' });   // marked while its bytes are kept aside
  const writtenEarly = asked.length;
  const copyOf = () => fs.readdirSync(dir).find((n) => n.startsWith(NAME + '.corrupt-')) || null;
  return { dir, o, logs, asked, tornBytes, writtenEarly, copyOf };
}
{
  const t = await torn(TC);
  ok(t.writtenEarly === 0 && !!t.o.held(), '③ a torn table is HELD at its start: the mark made meanwhile writes nothing yet', { held: t.o.held(), asked: t.writtenEarly });
  await until(() => !t.o.held() && !!t.copyOf(), 'the torn table lifted with its copy beside it');
  const copy = t.copyOf(), disk = JSON.parse(fs.readFileSync(fileOf(t.dir), 'utf8'));
  ok(!!copy && fs.readFileSync(path.join(t.dir, copy)).equals(t.tornBytes) && !!disk['conv-early'] && !disk['conv-old']
      && t.logs.some((l) => new RegExp(`torn bytes, kept aside as ${copy.replace(/[.]/g, '\\.')} — it starts empty`).test(l)),
    '③ KEPT ASIDE: the torn bytes beside the store byte for byte (named in the journal), then the table starts empty and the mark made meanwhile is written', { copy, disk: Object.keys(disk) });
}
// RED: the release's start — torn bytes read as empty (no hold): no copy, and the first mark writes over them
const REL_TORN = M.load('src/turn-carry.js', anchored(SRC, "    else { const a = SR.storeAnswer(read, { valid: isTable }); if (hold.start(a) === 'data') loadRows(a.value); }", "    else { const a = SR.storeAnswer(read, { valid: isTable }); if (a.state === 'data') loadRows(a.value); }", 'the release\'s start'), 'release-start');
{
  const r = await torn(REL_TORN);
  ok(r.writtenEarly > 0 && !r.copyOf() && !fs.readFileSync(fileOf(r.dir)).equals(r.tornBytes), 'RED (the release\'s start: torn bytes read as empty): no copy beside the store, and the first mark writes over the torn bytes', { asked: r.writtenEarly, copy: r.copyOf() });
}

console.log('④ PAST THE SIZE BOUND: never read, and never written over in this run');
{
  const dir = mk(), logs = [], asked = [];
  const big = Buffer.alloc(TC.OUTSTANDING_MAX_BYTES + 16, 0x20);   // bytes past the bound (spaces: their content is not the point)
  fs.writeFileSync(fileOf(dir), big);
  const o = life(TC, dir, logs, asked);
  askAll(o);
  ok(asked.length === 0 && fs.readFileSync(fileOf(dir)).equals(big) && o.held()?.code === 'past its bound' && /past its \d+ B bound/.test(o.heldWords() || '')
      && logs.filter((l) => /beyond its \d+ B bound .* — not read, and nothing is written over it in this run/.test(l)).length === 1,
    '④ a file past the size bound: not read, every writer asked wrote nothing (the bytes as they were), said once by its size, its words name it', { asked: asked.length, held: o.held() });
  // RED: the release's start — a file past the bound «started empty», and the first mark writes the table over it
  const REL_BIG = M.load('src/turn-carry.js', anchored(SRC, "      if (size > OUTSTANDING_MAX_BYTES) big = size;", "      if (size > OUTSTANDING_MAX_BYTES) read = { error: Object.assign(new Error('started empty (the release)'), { code: 'ENOENT' }) };", 'the release\'s size road'), 'release-big');
  const dir2 = mk(), asked2 = [];
  fs.writeFileSync(fileOf(dir2), big);
  const o2 = life(REL_BIG, dir2, [], asked2); askAll(o2);
  ok(asked2.length > 0 && !fs.readFileSync(fileOf(dir2)).equals(big), 'RED (the release\'s size road: started empty): the first mark writes the table over the file past the bound', { asked: asked2.length });
}

report();

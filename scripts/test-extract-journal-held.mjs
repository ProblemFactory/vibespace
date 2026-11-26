#!/usr/bin/env node
// test-extract-journal-held — r3333 unit 2 (lane lg-group-parents, the store-read family): THE EXTRACTION JOURNAL IS HELD when it
// cannot be read — never «no extraction was cut short» (the release's read answered {} on any failure: a retry kept the truncated
// files as whole, and the next mark wrote over every other mark). Through the REAL files router (src/routes/files.js), its journal's
// file moved to a scratch folder by the router's one seam; the unreadable file is a PLACED refusal of the read call (never a mount,
// never a mode change):
//   ① HELD: a local extraction is refused by name (extract_journal_unread) before anything starts; a mark writes nothing over
//      the file; a read again off the loop lifts it with no restart — the marks are back and answer again
//   ② TORN BYTES: held while their copy is made, then kept aside ONCE and it starts empty — for the rest of this run only a new
//      or empty folder goes on (extract_journal_torn for a folder that holds something, or one whose listing failed)
//   ③ THE ROUTE asks the hold before any folder, mark or spawn (its order pinned) — and the page words both codes (zh / ja)
//   RED: the release's read and write planted back — the unreadable journal goes on, and the next mark writes over every other
//   ④ B-574d (lane nl-journals): THE MARK IS ON DISK BEFORE ITS NAME POINTS AT IT — the temp opened, SYNCED, closed, then renamed
//      (src/fd-close.js renameSynced); a sync that FAILS (a placed EIO) is a failed write: the mark answers false, the memory keeps
//      what the disk holds, the old bytes stand, no temp is left — and the route starts nothing (extract_journal_unwritten, zh / ja);
//      a file system that does no sync at all (a placed EINVAL) lands the mark, said once. RED: the release's unsynced write and its
//      swallowed failure planted back — no sync before the rename; a failed write goes on with a mark only the memory holds
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('extract-journal-held');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(path.join(ROOT, 'home'), { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
process.env.HOME = path.join(ROOT, 'home');
const { ok, report } = checker();
const quiet = async (fn) => { const o = [console.log, console.warn]; console.log = console.warn = () => { }; try { return await fn(); } finally { [console.log, console.warn] = o; } };
const SRH = require(path.join(REPO, 'src/store-read-hold.js'));
const files = require(path.join(REPO, 'src/routes/files.js'));
const J = files.__extractJournal;
const MARKED = JSON.stringify({ ['/a/one.zip\n/a/out']: 1795000000000, ['/a/two.tar\n/a/out2']: 1795000000001 });
const world = (name, text) => { const d = path.join(ROOT, name); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, 'extract-journal.json'); if (text !== null) fs.writeFileSync(f, text); return f; };
const refused = (file, fn) => { const real = fs.readFileSync; fs.readFileSync = function (p0, ...a) { if (String(p0) === file) throw Object.assign(new Error(`EIO: a placed refusal of the read, '${p0}'`), { code: 'EIO' }); return real.call(this, p0, ...a); }; try { return fn(); } finally { fs.readFileSync = real; } };
const turns = (ms = 30) => new Promise((r) => setTimeout(r, ms));

console.log('① the journal HELD');
{
  const f = world('held', MARKED);
  J.at(f);
  const r = await quiet(() => refused(f, () => J.refusal()));
  await quiet(() => J.mark('/a/three.zip', '/a/out3'));
  ok(!!(r && r.code === 'extract_journal_unread' && /could not be read, so it is not known whether an earlier extraction/.test(r.error) && fs.readFileSync(f, 'utf8') === MARKED),
    '① a journal there and UNREADABLE (EIO): a local extraction is refused by name before anything starts, and a mark writes NOTHING over the file', { r, bytes: fs.readFileSync(f, 'utf8') });
  const lifted = await quiet(() => SRH.readAgainOf('extract-journal.json'));
  ok(!!(lifted && J.refusal() === null && J.had('/a/one.zip', '/a/out') && J.had('/a/two.tar', '/a/out2')), '① …a read again off the loop LIFTS it (no restart): the marks are back and answer again — an interrupted extraction is known as cut short', { lifted });
}
console.log('② torn bytes');
{
  const torn = MARKED.slice(0, 20), f = world('torn', torn);
  J.at(f);
  const first = await quiet(() => J.refusal());
  await quiet(() => turns(60));
  const copies = fs.readdirSync(path.dirname(f)).filter((n) => n.startsWith('extract-journal.json.corrupt-'));
  const afterLift = J.refusal();
  const full = J.torn(['a.txt']), empty = J.torn([]), unread = J.torn(null);
  ok(!!(first && first.code === 'extract_journal_unread' && copies.length === 1 && fs.readFileSync(path.join(path.dirname(f), copies[0]), 'utf8') === torn && afterLift === null),
    '② TORN BYTES: held while their copy is made, kept aside ONCE (the same bytes), then it starts empty', { first, copies, afterLift });
  ok(!!(full && full.code === 'extract_journal_torn' && /extract it into a new or empty folder/.test(full.error) && empty === null && unread && unread.code === 'extract_journal_torn'),
    '② …for the rest of this run a folder that holds something (or one whose listing failed) is refused by name; a new or empty folder goes on — it cannot hold a cut-short file', { full, empty, unread });
}
console.log('③ the route and the page');
{
  const SRC = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
  const route = SRC.slice(SRC.indexOf("router.post('/api/archive/extract'"), SRC.indexOf("router.post('/api/archive/extract'") + 6000);
  const iHold = route.indexOf('const refused = extractJournalRefusal();'), iTorn = route.indexOf('const refused = extractTornRefusal(names);'), iMk = route.indexOf("await sfs(req).call('mkdir', { path: destDir })");
  ok(iHold > 0 && iTorn > iHold && iMk > iTorn, '③ THE ROUTE asks the hold, then the torn rule, BEFORE its folder is made — no folder, mark or spawn while refused', { iHold, iTorn, iMk });
  const OPS = fs.readFileSync(path.join(REPO, 'src/lib/file-explorer-ops.js'), 'utf8'), ZH = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), JA = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const W1 = 'the extraction journal could not be read, so it is not known whether an earlier extraction into this folder was cut short — try again when it reads (it is read again by itself)';
  const W2 = "the extraction journal's earlier record did not parse (it is kept aside), so it is not known whether an earlier extraction into this folder was cut short — extract it into a new or empty folder";
  ok(OPS.includes("d.code === 'extract_journal_unread'") && OPS.includes("d.code === 'extract_journal_torn'") && [W1, W2].every((w) => ZH.includes(JSON.stringify(w)) && JA.includes(JSON.stringify(w))), '③ the page words both codes in the reader\'s language (fsErrorText; zh / ja rows)');
}
console.log('④ the mark on disk (B-574d)');
// every call on the journal's temp, in order — the placed answer of its sync or its rename (an errno name), never a mount
const traced = (file, fn, { sync = null, rename = null } = {}) => {
  const o = { openSync: fs.openSync, fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, renameSync: fs.renameSync }, log = [], tmp = file + '.tmp';
  let tfd = null, value;
  fs.openSync = function (p0, ...a) { const fd = o.openSync.call(this, p0, ...a); if (String(p0) === tmp) { tfd = fd; log.push('open'); } return fd; };
  fs.fsyncSync = function (fd, ...a) { if (fd === tfd) { log.push('sync'); if (sync) throw Object.assign(new Error(`${sync}: a placed answer of the sync`), { code: sync }); } return o.fsyncSync.call(this, fd, ...a); };
  fs.closeSync = function (fd, ...a) { if (fd === tfd) log.push('close'); return o.closeSync.call(this, fd, ...a); };
  fs.renameSync = function (a0, b0, ...a) { if (String(a0) === tmp && String(b0) === file) { log.push('rename'); if (rename) throw Object.assign(new Error(`${rename}: a placed answer of the rename`), { code: rename }); } return o.renameSync.call(this, a0, b0, ...a); };
  try { value = fn(); } finally { Object.assign(fs, o); }
  return { log: log.join(' '), value };
};
const warned = (fn) => { const o = [console.log, console.warn], said = []; console.log = () => { }; console.warn = (...a) => said.push(a.join(' ')); try { return { value: fn(), said }; } finally { [console.log, console.warn] = o; } };
/** the leg's facts over one router (the real one, or the release planted back) */
const markFacts = (R, name, place) => {
  const f = world(name, MARKED);
  R.__extractJournal.at(f);
  const w = warned(() => traced(f, () => R.__extractJournal.mark('/a/new.zip', '/a/out9'), place));
  return { answer: w.value.value, calls: w.value.log, had: R.__extractJournal.had('/a/new.zip', '/a/out9'), disk: fs.readFileSync(f, 'utf8'), tmpLeft: fs.existsSync(f + '.tmp'), said: w.said };
};
{
  const okRun = markFacts(files, 'synced', {});
  ok(okRun.answer === true && okRun.calls === 'open sync close rename' && okRun.had && '/a/new.zip\n/a/out9' in JSON.parse(okRun.disk) && !okRun.tmpLeft,
    '④ a mark is written to its temp, SYNCED, closed, THEN renamed over the journal — on disk before the extraction it guards starts', okRun);
  const eio = markFacts(files, 'sync-eio', { sync: 'EIO' });
  ok(eio.answer === false && eio.disk === MARKED && !eio.had && !eio.tmpLeft && eio.said.some((l) => /the extraction journal could not be written \(EIO\)/.test(l)),
    '④ a sync that FAILS (a placed EIO) is a FAILED WRITE: the mark answers false, the old bytes stand, no temp is left, and the memory keeps what the disk holds (no mark)', eio);
  const ren = markFacts(files, 'rename-eio', { rename: 'EIO' });
  ok(ren.answer === false && ren.disk === MARKED && !ren.had && !ren.tmpLeft, '④ …a rename that fails is a failed write too (false; the memory keeps what the disk holds) — and no temp is left (r4828: the door keeps it on a failed rename, the journal removes it)', ren);
  const f = world('nosync', MARKED);
  J.at(f);
  const two = warned(() => [traced(f, () => J.mark('/a/n1.zip', '/a/o1'), { sync: 'EINVAL' }).value, traced(f, () => J.mark('/a/n2.zip', '/a/o2'), { sync: 'EINVAL' }).value]);
  const disk = JSON.parse(fs.readFileSync(f, 'utf8')), nos = two.said.filter((l) => /does not do a sync \(EINVAL\)/.test(l));
  ok(two.value.every((v) => v === true) && '/a/n1.zip\n/a/o1' in disk && '/a/n2.zip\n/a/o2' in disk && nos.length === 1 && !/\//.test(nos[0]),
    '④ a file system that does no sync at all (a placed EINVAL) LANDS the mark — said ONCE over two marks, no path in the words', { answers: two.value, said: two.said });
  const SRC = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
  const r0 = SRC.indexOf("router.post('/api/archive/extract'"), route = SRC.slice(r0, SRC.indexOf('// ── Copy/move progress ops', r0));   // the extract route whole
  const gates = route.split('if (!markExtractStart(fp, destDir))').length - 1, iA = route.indexOf('if (!markExtractStart(fp, destDir))'), iSpawn = route.indexOf("const child = spawn(type === 'zip' ? 'unzip' : 'tar', args);");
  const iB = route.lastIndexOf('if (!markExtractStart(fp, destDir))'), iExec = route.indexOf('execFile(cmd, args,');
  const PROG = "      if (!markExtractStart(fp, destDir)) { Object.assign(op, { status: 'error', error: EXTRACT_UNWRITTEN_WORDS, code: 'extract_journal_unwritten' }); setTimeout(() => extractOps.delete(opId), 5 * 60 * 1000).unref(); return; }\n";
  const PLAIN = "  if (!markExtractStart(fp, destDir)) return res.status(503).json({ error: EXTRACT_UNWRITTEN_WORDS, code: 'extract_journal_unwritten' });";
  ok(gates === 2 && iA > 0 && iSpawn > iA && iB > iA && iExec > iB && route.split("code: 'extract_journal_unwritten'").length - 1 === 2 && route.split(PROG).length === 2 && route.split(PLAIN).length === 2 && route.indexOf(PROG) === iA - 6 && route.indexOf(PLAIN) === iB - 2,
    '④ THE ROUTE: both roads (the progress op and the plain answer) ask the mark BEFORE their spawn, and a mark not written starts nothing, by name (extract_journal_unwritten)', { gates, iA, iSpawn, iB, iExec });
  const OPS = fs.readFileSync(path.join(REPO, 'src/lib/file-explorer-ops.js'), 'utf8'), ZH = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), JA = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const W3 = 'the extraction journal could not be written, so an extraction cut short here could not be repaired by a later one — nothing was extracted; try again when VibeSpace can write its data folder again';
  ok(OPS.includes("d.code === 'extract_journal_unwritten'") && OPS.includes(JSON.stringify(W3).slice(1, -1)) && ZH.includes(JSON.stringify(W3)) && JA.includes(JSON.stringify(W3)) && SRC.includes(`const EXTRACT_UNWRITTEN_WORDS = '${W3}';`),
    '④ the page words the refusal in the reader\'s language (fsErrorText; zh / ja rows), the same words the hub sends');
  const RT = mutantCopies('extract-journal-held', REPO).load('src/routes/files.js', anchored(SRC, "try { fs.unlinkSync(f + '.tmp'); } catch { /* the door removed it, or it was never made */ } ", '', 'the failed write without its temp removal'), 'rename-temp-kept');
  const rRen = markFacts(RT, 'red-rename-temp', { rename: 'EIO' });
  ok(rRen.answer === false && rRen.tmpLeft === true, 'RED ④ (r4828) the failed write without its temp removal: a RENAME that fails leaves the journal\'s temp behind (the door keeps it)', rRen);
  // a CLEAR that fails (a placed EIO): the run knows the extraction ended whole — no overwrite turned on in this run; the disk's mark
  // goes at the journal's next write
  const clearFacts = (R, name) => {
    const fc = world(name, MARKED); R.__extractJournal.at(fc);
    const cl = warned(() => traced(fc, () => R.__extractJournal.clear('/a/one.zip', '/a/out'), { sync: 'EIO' }));
    const had = R.__extractJournal.had('/a/one.zip', '/a/out'), diskKept = '/a/one.zip\n/a/out' in JSON.parse(fs.readFileSync(fc, 'utf8'));
    warned(() => R.__extractJournal.mark('/a/next.zip', '/a/outN'));
    const after = JSON.parse(fs.readFileSync(fc, 'utf8'));
    return { had, diskKept, goneAtNext: !('/a/one.zip\n/a/out' in after) && '/a/next.zip\n/a/outN' in after, said: cl.said };
  };
  const cf = clearFacts(files, 'clear-eio');
  ok(!cf.had && cf.diskKept && cf.goneAtNext && cf.said.some((l) => /an ended extraction's mark stays on disk until the journal's next write/.test(l)),
    '④ a CLEAR that fails (a placed EIO): the extraction ended whole and THIS run knows it (a later extraction into that folder is not turned into an overwrite, over the person\'s edits since); the mark left on disk goes at the journal\'s next write, said', cf);
  const RC = mutantCopies('extract-journal-held', REPO).load('src/routes/files.js', anchored(SRC, "    if (writeExtractJournal(j) === false) { extractJournal = j; console.warn('[extract] an ended extraction\\'s mark stays on disk until the journal\\'s next write'); }\n", '    writeExtractJournal(j);\n', 'the clear without its memory'), 'clear-kept');
  const rcf = clearFacts(RC, 'red-clear');
  ok(rcf.had === true, 'RED ④ the failed clear left to the memory as the disk holds it: THIS run turns the next extraction into that folder into an overwrite', rcf);
  // RED: the release's write (unsynced, its failure swallowed, the memory set first) and its mark that answers nothing
  let mut = anchored(SRC, "  try { FCJ.renameSynced(f + '.tmp', f, JSON.stringify(j), { where: '[extract] the extraction journal', say: (w) => { if (!journalNoSyncSaid) { journalNoSyncSaid = true; console.warn(w); } } }); }\n  catch (e) { try { fs.unlinkSync(f + '.tmp'); } catch { /* the door removed it, or it was never made */ } console.warn(`[extract] the extraction journal could not be written (${(e && e.code) || (e && e.message) || e})`); return false; }\n  extractJournal = j;\n  return true;\n",
    "  extractJournal = j;\n  try { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(j)); fs.renameSync(tmp, f); } catch {}\n", 'the release: an unsynced write, its failure swallowed');
  mut = anchored(mut, '  return writeExtractJournal(j) === true;', '  writeExtractJournal(j);', 'the release: a mark that answers nothing');   // stale-pins: kept (the release's mark line — this red control's own text)
  const Rel = mutantCopies('extract-journal-held', REPO).load('src/routes/files.js', mut, 'release-unsynced');
  const rOk = markFacts(Rel, 'red-order', {}), rFail = markFacts(Rel, 'red-fail', { rename: 'EIO' });
  ok(!/sync/.test(rOk.calls) && rOk.calls.includes('rename') && rFail.answer !== false && rFail.had && rFail.disk === MARKED,
    'RED ④ the release\'s write: NO sync before the rename, and a failed write goes on — the mark held by the memory only (the disk never had it)', { rOk, rFail });
}
console.log('RED');
{
  const SRC = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
  let mut = anchored(SRC, "  return journalHold.held() ? { error: EXTRACT_JOURNAL_WORDS, code: 'extract_journal_unread' } : null;", '  return null;', 'the release: no hold');
  mut = anchored(mut, 'function readExtractJournal() { journalLoad(); return extractJournal || {}; }', "function readExtractJournal() { try { return JSON.parse(fs.readFileSync(EXTRACT_JOURNAL_AT.file, 'utf-8')) || {}; } catch { return {}; } }", 'the release read');   // stale-pins: kept (the release's read — the red control's line)
  mut = anchored(mut, "  if (!journalHold || !journalHold.writable('a mark of the extraction journal')) return;\n", '', 'the release write');
  const Rel = mutantCopies('extract-journal-held', REPO).load('src/routes/files.js', mut, 'release-journal');
  const f = world('red', MARKED);
  Rel.__extractJournal.at(f);
  const r = await quiet(() => refused(f, () => Rel.__extractJournal.refusal()));
  const had = refused(f, () => Rel.__extractJournal.had('/a/one.zip', '/a/out'));
  refused(f, () => Rel.__extractJournal.mark('/a/three.zip', '/a/out3'));
  const after = JSON.parse(fs.readFileSync(f, 'utf8'));
  ok(r === null && had === false && !('/a/one.zip\n/a/out' in after) && Object.keys(after).length === 1, 'RED the release\'s read and write: an unreadable journal goes on («nothing cut short»: a retry keeps truncated files) and the next mark writes over every other mark', { r, had, after });
}
report();

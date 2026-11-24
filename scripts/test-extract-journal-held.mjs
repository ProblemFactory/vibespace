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

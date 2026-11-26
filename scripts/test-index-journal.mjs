#!/usr/bin/env node
// test-index-journal — row B-360d UNIT 1 (主开发's ruling wi1q6956v, r1298 / r1312 / r1322): EVERY change to the channels index
// rides its existing journal channels/index-acts.ndjson; index.json is written whole only at the journal's bound, at a change
// that reached the whole map, at a burst, or at a stop. In-process, a real createChannelStore over a temp folder with its own
// store writer (a small actsMaxBytes where a leg needs the bound); a «kill» is a COPY of the folder taken with the store open,
// then read by a second store / the release's frozen reader. Each law with its RED CONTROL (an anchored mutant copy):
//   ① LAWS 1+2 — ONE LOG, NO WHOLE WRITE FOR A CHANGE: 60 changed rows + 60 index.durable() write index.json 0 times; the
//      kill copy holds every change and a top-level table's. RED: the release's update end (every update owes the index).
//   ② LAW 3 — QUIET IS FREE: 2 000 touches that change nothing journal 0 bytes; and A ROW CHANGED BEFORE ITS TOUCH (a scan's
//      road: rows() then touch()) IS journaled and survives the kill. RED: the fingerprint compare removed.
//   ③ LAW 4 — A BURST IS ONE WHOLE WRITE: past BURST_ROWS touched rows (actsMaxBytes 64 KB ⇒ 128 rows) one whole write and
//      0 journal growth. RED: the burst bound removed.
//   ④ LAW 5 — a row removed, a whole write, the row born again: every kill copy is a lawful prefix.
//   ⑦ LAW 8 — ONE READER: no product file reads channels/index* by name outside the store. RED: the release's migrations read.
//   ⑥ LAW 11 — A PURGE LEAVES NO BYTE: an account's rows removed in one whole write, the journal's compaction awaited — none
//      of its keys in index.json or the journal. RED: the removal said done without the compaction.
//   ⑨ (IN THE HEAVY TWIN, §T) LAW 6 — THE TAIL IS A WHOLE LINE: the writer laws' failed-append scenes (ENOSPC, a short write, an fsync EIO, the
//      truncate-back failing) run with a PACED line — the next journal write is the compaction, nothing glued; a tail with
//      no newline at load — the same. RED: a failed append that owes no compaction.
//   ⑩ THE ENGINE (r1312): the static census — under the mail driver and the engine's passes no update scope reaches the
//      whole map (one that does is NAMED: its reason and its site); and law 4's refusal storm — 600 rows the fake vendor
//      refuses, each refusal a change of the row, ride the journal: index.json never written nor owed. RED: a refusal's
//      update scope that reads live() (named by the census; the storm owes the index).
//   ⑪ THE WARM-UP AT OPEN: changes between two of its slices (no print yet) are journaled and survive a kill; quiet after.
//   ⑫ THE HOLD (r1542, on the train): index.json damaged — nothing of the family is read or written: an update refused by
//      name, no journal line, fold() / journalDurable() refused, no warm-up, both files byte-identical. RED: the journal deaf.
//   ⑮ A ROW HAS LANDED (r1765, B-526c's set): when its journal line synced (a stall between the append and its sync) — never at
//      its making, never after a failed append (⑮ (2) / (2b): IN THE HEAVY TWIN, §T); held: never. REDs: landed at the making; only by a whole write; on any
//      answer; a journal deaf to the hold.
//   ⑬ THE FOLLOW (r1542 (2)): law 10's LATER road, law 4's byte bound alone, a row changed before its touch, ⑪'s guard at a
//      produce, a fn that throws, the purge's failure through the real remove() — each with its red control (⑬ (c)'s: IN THE HEAVY
//      TWIN, §T).
//   ⑭ THE STOP (r1542 (3)): paced lines owed at a SIGTERM are on disk after the hub's exit passes. RED: the rank-0 pass alone.
//   ⑯ (IN THE HEAVY TWIN, §T) THE INDEX APPEARS MID-LIFE (r1763 (3)): read missing, its journal replayed, then the index appears — the older life's
//      journal stays byte for byte. RED: the compaction's road deaf to the hold.
//   ⑰ THE LANDING'S ROADS (r1850): a birth after a produced whole write, a rebirth with its old line in flight, the boot, a burst's
//      whole road, the order across a fold and a compaction, the hold's own guard — with their red controls.
//   ⑤ LAW 7 — A ROLLBACK FINDS EVERYTHING: the RELEASE'S OWN replay (scripts/fixtures/release-index-replay.cjs, frozen) over
//      every kill copy equals the new store's map; after close(), index.json alone equals it.
//   ⑱ AN IN-ROW STAMP (主开发 r2081): a poll stamp written into the row past the door reaches the stamp journal at the
//      update's end — a kill before any fold keeps it; the update's heals are ONE append (r2287). REDs: no heal at the
//      update's end; the heals unbatched.
//   §T THE HEAVY TWIN (主开发 r3921): scripts/test-index-journal-failures.mjs holds the legs whose seconds are waits — this file
//      pins that it holds them and runs none of them.
// Run: node scripts/test-index-journal.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order (主开发 r1845): the first import after node's own
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const { releaseLoad } = require(path.join(REPO, 'scripts/fixtures/release-index-replay.cjs'));
const M = mutantCopies('index-journal', REPO);
const { ok, report } = checker();
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'index-journal-'));
let n = 0;
const tmp = (tag) => { const d = path.join(ROOT, `${tag}-${n++}`); fs.mkdirSync(d, { recursive: true }); return d; };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const statOf = (w, name) => (w.stats().find((s) => s.name === name) || { writes: 0, bytesWritten: 0 });
const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
const open = (mod, dir, opts = {}) => { const w = SW.create({ log: quiet }); const st = mod.createChannelStore({ dir, log: quiet, writer: w, ...opts }); return { w, st }; };
const shut = (o) => { try { o.st.close(); } catch { } try { o.w.stop(); } catch { } };
// THE KILL: the folder as it stands, copied with the store open, read by a second store (as the next boot reads it)
// (file by file: a file the writer renames or removes while the copy runs is left as a kill would leave it — gone; in NAME
// order — index-acts.ndjson before index.json — so the journal is always the older of the pair, a state a real kill can make:
// r1542 (5))
function kill(dir, tag) {
  const k = path.join(ROOT, `${tag}-kill-${n++}`);
  const copy = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) { const f = path.join(from, e.name), t = path.join(to, e.name); try { if (e.isDirectory()) copy(f, t); else fs.copyFileSync(f, t); } catch (err) { if (!err || err.code !== 'ENOENT') throw err; } } };
  copy(dir, k);
  return k;
}
const mapOf = (st) => JSON.parse(JSON.stringify(st.index.rows()));
const familyMap = (dir) => { const ix = CS.readIndexFamily(dir); return ix ? JSON.parse(JSON.stringify(ix.conversations)) : null; };
const releaseMap = (dir) => { const ix = releaseLoad(read(path.join(dir, 'index.json')), read(path.join(dir, 'index-acts.ndjson'))).ix; return JSON.parse(JSON.stringify(ix.conversations)); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const seed = async (st, rows = 200) => { await st.index.update(() => { for (let i = 0; i < rows; i++) Object.assign(st.index.entry('a', `c${i}`), { title: `t${i}`, unread: 0 }); }); st.index.flush(); };

// ═══ ① LAWS 1+2 ═══
console.log('① one log, no whole write for a change');
async function lawOne(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir);
  await seed(o.st);
  const w0 = statOf(o.w, 'channels-index.write').writes;
  for (let i = 0; i < 60; i++) { await o.st.index.update(() => { o.st.index.entry('a', `c${i}`).unread = i + 1; }); await o.st.index.durable(); }
  await o.st.index.update((ix) => { ix.patternAssignments = { p1: { principal: { kind: 'agent', id: 'x' } } }; });
  await o.st.index.durable();
  const wholeWrites = statOf(o.w, 'channels-index.write').writes - w0, indexOwed = o.st.index.journalStats().indexOwed;   // owed: the writer's pace would write it later
  const k = kill(dir, tag);
  const o2 = open(CS, k);
  const back = mapOf(o2.st), top = JSON.stringify(o2.st.index.snapshot().patternAssignments || null);
  shut(o2);
  shut(o);
  let all = true; for (let i = 0; i < 60; i++) if (!back[`a/c${i}`] || back[`a/c${i}`].unread !== i + 1) all = false;
  return { wholeWrites, indexOwed, all, top: top === JSON.stringify({ p1: { principal: { kind: 'agent', id: 'x' } } }) };
}
{
  const r = await lawOne(CS, 'one');
  ok(r.wholeWrites === 0 && !r.indexOwed && r.all && r.top, `① LAWS 1+2: 60 changed rows and 60 index.durable() wrote index.json ${r.wholeWrites} times and left it owed: ${r.indexOwed} — every change rode the journal; the kill copy holds all 60 (${r.all}) and the top-level table (${r.top})`, r);
  const EM = M.load('src/channel-store.js', anchored(SRC, '    }).then((r) => { if (whole) oweWhole(durable); return r; });', '    }).then((r) => { markDirty(durable && whole); return r; });', 'the release\'s update end: every update owes the index'), 'owe-every');   // stale-pins: kept (the release's own line, absent by design)
  const rc = await lawOne(EM, 'one-red');
  ok(rc.wholeWrites > 0 || rc.indexOwed, `① RED CONTROL: the release's update end (every update owes index.json) — ${rc.wholeWrites} whole writes, the index owed: ${rc.indexOwed} — the leg above would go red`, rc);
}

// ═══ ② LAW 3 ═══
console.log('② quiet is free — against the PERSISTED bytes, whatever the touch order');
async function lawThree(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir);
  await seed(o.st);
  await o.st.index.update(() => { o.st.index.entry('a', 'c3').title = 'once'; });   // a journaled change first (its fingerprint)
  await o.st.index.durable();
  const j0 = o.st.index.flushStats().journaled || 0, b0 = read(path.join(dir, 'index-acts.ndjson')).length;
  for (let i = 0; i < 2000; i++) await o.st.index.update(() => { o.st.index.entry('a', `c${i % 200}`); });   // touched, unchanged
  await o.st.index.durable();
  const quietJ = (o.st.index.flushStats().journaled || 0) - j0, quietB = read(path.join(dir, 'index-acts.ndjson')).length - b0;
  // THE HAZARD: a row changed through rows() and touched AFTER (a scan's road) — it must reach the journal
  await o.st.index.update(() => { const r = o.st.index.rows()['a/c7']; r.title = 'changed-before-its-touch'; o.st.index.touch('a/c7'); });
  await o.st.index.durable();
  const k = kill(dir, tag);
  const o2 = open(CS, k); const back = mapOf(o2.st); shut(o2); shut(o);
  return { quietJ, quietB, hazard: !!back['a/c7'] && back['a/c7'].title === 'changed-before-its-touch' };
}
{
  const r = await lawThree(CS, 'three');
  ok(r.quietJ === 0 && r.quietB === 0 && r.hazard, `② LAW 3: 2 000 touches that changed nothing journaled ${r.quietJ} rows, ${r.quietB} bytes; a row changed BEFORE its touch reached the journal and survived the kill (${r.hazard})`, r);
  const EM = M.load('src/channel-store.js', anchored(SRC, '      if (prev !== undefined && prev === f) continue;', '      if (false) continue;', 'the fingerprint compare removed'), 'no-fp');
  const rc = await lawThree(EM, 'three-red');
  ok(rc.quietJ > 0, `② RED CONTROL: the fingerprint compare removed — the quiet touches journaled ${rc.quietJ} rows — the leg above would go red`, rc);
}

// ═══ ③ LAW 4 ═══
console.log('③ a burst is one whole write');
async function lawFour(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir, { actsMaxBytes: 64 * 1024 });   // BURST_ROWS = 128
  await seed(o.st, 400);
  const w0 = statOf(o.w, 'channels-index.write').writes, j0 = o.st.index.flushStats().journaled || 0;
  await o.st.index.update(() => { for (let i = 0; i < 300; i++) o.st.index.entry('a', `c${i}`).unread = 9; }, { durable: true });
  const fs1 = o.st.index.flushStats();
  const r = { wholeWrites: statOf(o.w, 'channels-index.write').writes - w0, journaled: (fs1.journaled || 0) - j0, bursts: fs1.bursts || 0, full: fs1.full, lastFull: fs1.lastFull };
  shut(o);
  return r;
}
{
  const r = await lawFour(CS, 'four');
  ok(r.wholeWrites === 1 && r.journaled === 0 && r.bursts >= 1, `③ LAW 4: one update over 300 rows (past the burst's 128) — ${r.wholeWrites} whole write, ${r.journaled} rows journaled (flushStats: full ${r.full}, lastFull «${r.lastFull}», bursts ${r.bursts})`, r);
  const EM = M.load('src/channel-store.js', anchored(anchored(SRC,
    "    if (t.size > BURST_ROWS) { flushStats.bursts = (flushStats.bursts || 0) + 1; return 'whole'; }   // law 4: never even compared", '', 'the rows burst removed'),
    "      if (bytes > BURST_BYTES) { flushStats.bursts = (flushStats.bursts || 0) + 1; return 'whole'; }   // law 4: a burst is one whole write", '', 'the bytes burst removed'), 'no-burst');
  const rc = await lawFour(EM, 'four-red');
  ok(rc.journaled >= 300, `③ RED CONTROL: the burst bound removed — the 300 rows journaled (${rc.journaled}) — the leg above would go red`, rc);
}

// ═══ ④ LAW 5 + ⑤ LAW 7 ═══
console.log('④ a lawful prefix at every kill · ⑤ the release\'s own reader finds everything');
{
  const dir = tmp('five'), o = open(CS, dir);
  await seed(o.st, 50);
  const kills = [];
  // each step: a kill copy WHILE it is written (its update asked, its write in flight — the copy may hold either side of
  // it, a torn tail too), and one after it landed (the read of c6ec90b73: «a kill between every two steps»)
  const steps = [
    ['born v1', () => o.st.index.update(() => { o.st.index.entry('a', 'k').title = 'v1'; }).then(() => o.st.index.durable()), null, 'v1'],
    ['removed (a whole write)', () => o.st.index.update((ix) => { delete ix.conversations['a/k']; }, { durable: true }), 'v1', null],
    ['born again v2', () => o.st.index.update(() => { o.st.index.entry('a', 'k').title = 'v2'; }).then(() => o.st.index.durable()), null, 'v2'],
    ['a durable act', () => o.st.index.update(() => { o.st.index.entry('a', 'c4').unread = 4; }, { durable: true }), 'v2', 'v2'],
    ['a top change', () => o.st.index.update((ix) => { ix.policies = { a: { mode: 'x' } }; }).then(() => o.st.index.durable()), 'v2', 'v2'],
  ];
  for (const [what, run, prev, want] of steps) {
    const p = run();
    for (let i = 0; i < 3; i++) await new Promise((z) => setImmediate(z));
    kills.push([`${what} (while written)`, kill(dir, 'five'), [prev, want]]);
    await p;
    kills.push([what, kill(dir, 'five'), [want]]);
  }
  const live = mapOf(o.st);
  const verdicts = kills.map(([what, k, want]) => {
    const o2 = open(CS, k); const m = mapOf(o2.st); shut(o2);
    const fam = familyMap(k), rel = releaseMap(k);
    const kNow = m['a/k'] ? m['a/k'].title : null;
    return { what, prefix: want.includes(kNow), family: same(fam, m), release: same(rel, m) };
  });
  shut(o);
  const fin = JSON.parse(read(path.join(dir, 'index.json')));
  ok(verdicts.every((v) => v.prefix), `④ LAW 5: a row removed (a whole write between) and born again — every kill copy (${verdicts.length}: while each step is written and after it) is a lawful prefix (${verdicts.map((v) => `${v.what}: ${v.prefix}`).join(' · ')})`, verdicts);
  ok(verdicts.every((v) => v.family && v.release), `⑤ LAW 7: at all ${verdicts.length} kill points the RELEASE'S OWN replay (frozen) and readIndexFamily equal the new store's map`, verdicts);
  ok(same(fin.conversations, live), '⑤ LAW 7: after close() index.json ALONE equals the map (a clean stop folds the journal)');
}

// ═══ ⑥ LAW 11 ═══
console.log('⑥ a purge leaves no byte');
async function lawEleven(waitJournal, tag) {
  const dir = tmp(tag), o = open(CS, dir);
  await seed(o.st, 40);
  await o.st.index.update(() => { for (let i = 0; i < 10; i++) Object.assign(o.st.index.entry('slack', `s${i}`), { title: `the last message ${i}` }); });
  await o.st.index.durable();   // the account's rows journaled (their lines on disk)
  // the removal's own road (channels-auth removeRecord): one durable update that reaches the whole map
  await o.st.index.update((ix) => { for (const k of Object.keys(ix.conversations)) if (k.startsWith('slack/')) delete ix.conversations[k]; }, { durable: true });
  if (waitJournal) await o.st.index.journalDurable();   // purgeIfDeclared's wait (law 11)
  const left = ['index.json', 'index-acts.ndjson'].map((f) => (read(path.join(dir, f)).match(/"slack\//g) || []).length);
  shut(o);
  return left;
}
{
  const left = await lawEleven(true, 'eleven');
  ok(left[0] === 0 && left[1] === 0, `⑥ LAW 11: an account's rows removed in the removal's whole write, then the journal's compaction awaited — ${left[0]} of its keys left in index.json, ${left[1]} in the journal`, left);
  const red = await lawEleven(false, 'eleven-red');
  ok(red[1] > 0, `⑥ RED CONTROL: the removal said done without the compaction — the journal still holds ${red[1]} of its rows (with their last message) — the leg above would go red`, red);
  // the read of c6ec90b73 (its MUST): a kill between a fold's landing and its compaction leaves lines the index already
  // holds (the account's rows with their last message) — skipped at the next open, a compaction owed that nothing asks
  const heldLeft = async (mod, tag) => {
    const dir = tmp(tag), acts = path.join(dir, 'index-acts.ndjson');
    { const o = open(mod, dir); await seed(o.st, 40);
      await o.st.index.update(() => { for (let i = 0; i < 10; i++) Object.assign(o.st.index.entry('slack', `s${i}`), { title: `the last message ${i}` }); });
      await o.st.index.journalDurable();
      const saved = read(acts);
      await o.st.index.fold();   // index.json holds them now (its actsSeq past every line)
      shut(o);
      fs.writeFileSync(acts, saved); }   // THE KILL before the compaction landed: the journal still holds them
    const o = open(mod, dir);
    await o.st.index.update((ix) => { for (const k of Object.keys(ix.conversations)) if (k.startsWith('slack/')) delete ix.conversations[k]; }, { durable: true });
    await o.st.index.journalDurable();
    const left = ['index.json', 'index-acts.ndjson'].map((f) => (read(path.join(dir, f)).match(/"slack\//g) || []).length);
    shut(o);
    return left;
  };
  const hl = await heldLeft(CS, 'eleven-held');
  ok(hl[0] === 0 && hl[1] === 0, `⑥ LAW 11: a journal left holding lines the index already held (a kill between a fold and its compaction) — the purge leaves ${hl[0]} of its keys in index.json, ${hl[1]} in the journal`, hl);
  const HM = M.load('src/channel-store.js', anchored(anchored(SRC, "if (ixLoad.blocked) return Promise.reject(blockedError(ixLoad.blocked)); askActs(); return W().durable(actsFile); },", "if (ixLoad.blocked) return Promise.reject(blockedError(ixLoad.blocked)); return W().durable(actsFile); },", 'the journal\'s wait asks nothing'), 'if (actLines.length !== before || compactOwed) { compactOwed = true;', 'if (actLines.length !== before) { compactOwed = true;', 'a landing asks no compaction owed before it'), 'held-left');   // stale-pins: kept (the old landing's text, a red control's)
  const hr = await heldLeft(HM, 'eleven-held-red');
  ok(hr[1] > 0, `⑥ RED CONTROL: the compaction owed at open never asked (the journal's wait asks nothing; a landing asks only for the lines it took) — the journal still holds ${hr[1]} of its rows — the leg above would go red`, hr);
  const auth = fs.readFileSync(path.join(REPO, 'src/server/channels-auth.js'), 'utf8');
  ok(/const r = await store\.purgeAccount\(rec\.id\);[^\n]*\n[\s\S]{0,400}await store\.index\.journalDurable\(\)/.test(auth), '⑥ LAW 11: the purge road (purgeIfDeclared) awaits the journal\'s compaction before the removal says done');
}

// ═══ ⑦ LAW 8 ═══
console.log('⑦ one reader of the family\'s files');
{
  const walk = (d) => { const out = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules') continue; const f = path.join(d, e.name); if (e.isDirectory()) out.push(...walk(f)); else if (e.name.endsWith('.js')) out.push(f); } return out; };
  const files = [...walk(path.join(REPO, 'src')), path.join(REPO, 'server.js')].filter((f) => fs.existsSync(f));
  // a read call whose argument names index.json / index-acts* by its own name (conversation-index.json is not the family)
  const RE = /(?:readFileSync|readFile|createReadStream|openSync|readStore)\s*\([^;\n]{0,200}?(?<![\w-])index(?:\.json|-acts)/;   // 'index.json', 'channels/index.json', index-acts* — never conversation-index.json
  const hits = files.filter((f) => !f.endsWith(path.join('src', 'channel-store.js'))).filter((f) => RE.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(REPO, f));
  ok(hits.length === 0, `⑦ LAW 8: no product file reads channels/index* by its name outside the store (${files.length} files read) — the readers go through readIndexFamily (the family, never index.json alone)`, hits);
  ok(RE.test("let doc; try { doc = JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', 'index.json'), 'utf-8')); } catch { return; }") && !RE.test("fs.readFileSync(path.join(dataDir, 'conversation-index.json'), 'utf-8')"),   // stale-pins: kept (the release's own read, a red control's text)
    '⑦ RED CONTROL: the release\'s own read in src/server/migrations.js (index.json alone) is caught by the census; conversation-index.json is not');
}

// ═══ ⑧ THE READ'S CURES (the fresh read of 6229c0976: four musts) ═══
console.log('⑧ the first change after open, a change after close, lines while an append is in flight');
{
  // M4: the FIRST update after open changes only a top-level table — journaled (the persisted top is set at open)
  const dir = tmp('m4');
  { const o = open(CS, dir); await seed(o.st, 20); shut(o); }
  const o = open(CS, dir);
  await o.st.index.update((ix) => { ix.policies = { a: { mode: 'first-after-open' } }; });
  await o.st.index.durable();
  const k = kill(dir, 'm4'); const o2 = open(CS, k); const pol = JSON.stringify((o2.st.index.snapshot().policies || {}).a || null); shut(o2);
  ok(pol === JSON.stringify({ mode: 'first-after-open' }), `⑧ M4: the FIRST update after open, a top-level table only, reached the journal and survived the kill (${pol})`);
  // M1: fifty changes fired without waiting (lines arriving while an append is in flight) — the journal's own count equals the file
  const pend = [];
  for (let i = 0; i < 50; i++) { pend.push(o.st.index.update(() => { o.st.index.entry('a', `c${i % 20}`).unread = 100 + i; })); if (i % 5 === 4) { await pend[pend.length - 1]; o.st.index.durable(); } }   // an append asked every fifth line, the next lines made while it is in flight
  await Promise.all(pend);
  await o.st.index.durable();
  const js = o.st.index.journalStats(), onDisk = fs.statSync(path.join(dir, 'index-acts.ndjson')).size;
  ok(js.journalBytes === onDisk && js.owedBytes === 0, `⑧ M1: fifty lines while appends were in flight — the journal's count ${js.journalBytes} bytes = the file's ${onDisk} (the bound counts every append), ${js.owedBytes} owed`, js);
  // M3: a change AFTER close() is written (the release's road: markDirty → flush)
  try { o.st.close(); } catch { }   // the store closed — its writer still running (a hub's writer outlives one store)
  await o.st.index.update(() => { o.st.index.entry('a', 'c1').title = 'after-close'; }).catch(() => {});
  try { o.w.stop(); } catch { }
  const o3 = open(CS, dir); const t1 = (mapOf(o3.st)['a/c1'] || {}).title; shut(o3);
  ok(t1 === 'after-close', `⑧ M3: a change after close() is on disk (${t1})`);
}

// ⑨ moved VERBATIM to the heavy twin scripts/test-index-journal-failures.mjs (§T below); its stand-in thread stays here for ⑮
// and ⑰ (the twin holds its own copy, the same text):
// the writer laws' failed-append scenes (test-store-writer-laws ⑧, round 3's law 4) run with a PACED line: a stand-in thread
// runs the REAL writeJob and, on the FIRST append while a marker exists, hands it a file system that fails as asked —
// enospc (4 KB written, then ENOSPC) · short (4 KB, then a write of 0) · fsync (EIO at fsync); trunc 'eio' makes the
// truncate-back fail too (the fragment stays). Every job on the journal is noted (append / whole) in the folder's jobs.log.
const STANDJ = path.join(ROOT, 'standj.cjs');
fs.writeFileSync(STANDJ, `'use strict';
const { parentPort, workerData } = require('worker_threads'); const fs = require('fs'); const path = require('path');
const { writeJob } = require(${JSON.stringify(path.join(REPO, 'src/store-writer-worker.js'))});
const S = new Int32Array(workerData.sab);
parentPort.on('message', (m) => {
  if (!m || (m.ev !== 'write' && m.ev !== 'unlink')) return;
  Atomics.store(S, 0, m.id); const t0 = process.hrtime.bigint(); let err = null, own = null; const was = m.ev === 'write' && fs.existsSync(m.file);
  const dirOf = path.dirname(m.file), marker = path.join(dirOf, 'fault'), faulty = m.append && fs.existsSync(marker);
  let f = fs, cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(dirOf, 'fault.json'), 'utf8')); } catch { }
  if (m.ev === 'write' && /index-acts\\.ndjson$/.test(m.file)) fs.appendFileSync(path.join(dirOf, 'jobs.log'), (m.append ? 'append' : 'whole') + (faulty ? ' FAULT' : '') + '\\n');
  { const mk = m.ev !== 'write' ? null : /index-acts\\.ndjson$/.test(m.file) ? 'stall' : /index\\.json$/.test(m.file) ? 'stallix' : null;   // ⑮ ⑰: a journal (or index) write held between its start and its sync; a 'pass' file lets ONE through
    if (mk && fs.existsSync(path.join(dirOf, mk))) { const t0 = Date.now(), z = new Int32Array(new SharedArrayBuffer(4)); while (fs.existsSync(path.join(dirOf, mk)) && Date.now() - t0 < 10000) { const pf = path.join(dirOf, mk + '.pass'); if (fs.existsSync(pf)) { try { fs.unlinkSync(pf); } catch { } break; } Atomics.wait(z, 0, 0, 10); } } }   // ⑮: the journal's write held between its start and its sync
  if (faulty) { fs.unlinkSync(marker); let n = 0; const fault = cfg.fault;
    f = { ...fs,
      writeSync: (fd, b, o = 0, l) => { const len = l == null ? b.length - o : l; if (fault === 'fsync') return fs.writeSync(fd, b, o, len); if (n >= 4096) { if (fault === 'short') return 0; throw Object.assign(new Error('no space left'), { code: 'ENOSPC' }); } const k = fs.writeSync(fd, b, o, Math.min(len, 4096 - n)); n += k; return k; },
      fsyncSync: (fd) => { if (fault === 'fsync') throw Object.assign(new Error('i/o error'), { code: 'EIO' }); return fs.fsyncSync(fd); },
      ftruncateSync: (fd, len) => { if (cfg.trunc === 'eio') throw Object.assign(new Error('i/o error'), { code: 'EIO' }); return fs.ftruncateSync(fd, len); } }; }
  const blockIx = m.ev === 'write' && /index\\.json$/.test(m.file) && fs.existsSync(path.join(dirOf, 'blockix'));   // the index unwritable: the journal is the change's only record
  if (blockIx) err = { code: 'EIO', message: 'the index is unwritable in this scene' };
  else if (m.ev === 'unlink') { try { fs.unlinkSync(m.file); } catch { } } else { try { own = (writeJob(m, f) || {}).own || null; } catch (e) { err = { code: e.code || null, message: e.message }; try { if (m.tmp) fs.unlinkSync(m.tmp); } catch { } } }
  if (faulty && cfg.late) { const z = new Int32Array(new SharedArrayBuffer(4)), t1 = Date.now(), pf = path.join(dirOf, 'late.pass'); while (!fs.existsSync(pf) && Date.now() - t1 < 10000) Atomics.wait(z, 0, 0, 10); try { fs.unlinkSync(pf); } catch { } }   // ⑮ (2b) r3905: the failed append's ANSWER held (a loaded machine's late answer, placed) until the leg writes late.pass
  if (m.ev === 'write' && m.ownOnly && !own && !was) { try { const st = fs.statSync(m.file, { bigint: true }); own = { dev: st.dev, ino: st.ino }; } catch { } }   // as the real thread answers: a job's own result, else the numbers of a file THIS job made and then failed on (never an older job's: r2593 (1)); these stand-ins write no cell numbers, so the cells' road is proven only in test-store-writer-lanes ⑫ (p1)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  Atomics.store(S, 2, err ? 2 : 1); Atomics.store(S, 1, S[1] + 1); Atomics.store(S, 0, 0); Atomics.notify(S, 0);
  parentPort.postMessage({ ev: m.ev === 'unlink' ? 'unlinked' : 'written', id: m.id, ms, err, file: m.file, own });   // own: as the real thread's answer (B-f276 1c: the store's other lane knows the file it made)
});
`);

// ═══ ⑩ THE ENGINE: THE STATIC CENSUS UNDER MAIL + THE REFUSAL STORM ═══
console.log('⑩ the engine under mail and a refusal storm — no whole touch (each named), no whole write');
// r1312: «the static census of the update scopes that reach the whole map becomes the unit's leg (a whole touch under the
// mail driver, red by name)» and «the refusal storm of your stand-in is law 4's own leg». A real engine (the fake vendor)
// over two stand-in accounts of 600 rows each the vendor does not know. SAID: the fake vendor refuses nothing — it answers
// a room it does not know with an empty, complete page, and ingest writes the row (the storm the B-360d measure saw on
// `mail`, there misnamed a refusal storm); on `refuse` the fake's history() is wrapped to REFUSE every room (forbidden),
// so each due row's poll is a refusal the engine writes on the row (noteConvRefusal) — the true refusal storm. Each round
// moves the clock 20 minutes, writes one new message as ingest writes it on a row (the measures' mail driver: unread,
// lastAt, the authors), and runs the engine's tick and both accounts' passes. A whole touch is NAMED where it is made
// (the store's onWholeTouch tap: its reason and the first two frames outside the store).
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const ENGSRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
const TE = Date.UTC(2026, 10, 21, 12, 0, 0), HOUR_E = 3600e3, AE = 'mail', AR = 'refuse';
const FAKE = require(path.join(REPO, 'src/channels/fake.js')), { ChannelError } = require(path.join(REPO, 'src/channels/index.js'));
const fakeCreate = FAKE.fakePoll.create;   // the registry calls the module's create() when it builds an account's adapter
const refusing = (on) => { FAKE.fakePoll.create = !on ? fakeCreate : (record, deps) => {
  const impl = fakeCreate(record, deps);
  if (!record || record.id !== AR) return impl;
  const refuse = async (convId) => { throw new ChannelError('forbidden', `fake: the vendor refuses ${convId}`, { retryable: false }); };
  return new Proxy(impl, { get: (t, k) => (k === 'history' ? refuse : t[k]) });   // the adapter as it is, but every room refused
}; };
const mkEng = (EM, dataDir, clock) => EM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: () => clock.t, log: quiet, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }], censusTimer: () => ({ cancel() {} }), walk: { syncRows: 1e9 } });
const TPL_E = path.join(ROOT, 'tpl-e');
{
  fs.mkdirSync(path.join(TPL_E, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(TPL_E, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [AE, AR].map((id) => ({ id, kind: 'fake-poll', label: id, enabled: true, options: {}, state: {}, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, discovery: { cursor: null, at: TE, complete: true, completeAt: TE } })) }));
  const e0 = mkEng(ENG, TPL_E, { t: TE }), ix = e0.store.index;
  await ix.update(() => { for (const a of [AE, AR]) for (let i = 0; i < 600; i++) Object.assign(ix.entry(a, `s-${i}`), { title: `Thread ${i}`, kind: 'dm', lastAt: TE - 30 * HOUR_E, unread: 0, readAt: TE - 86400e3, listedAt: TE, lane: { via: 'poll', lastPollAt: TE - 40 * HOUR_E, firstSeenByPoll: 1, firstSeenTotal: 1 } }); });
  ix.flush();
  try { await e0.store.close?.(); } catch { }
  try { e0.stop(); } catch { }
}
const siteOf = (stack) => String(stack).split('\n').slice(1).map((x) => x.trim()).filter((x) => !/channel-store\.js|node:|test-index-journal/.test(x)).slice(0, 2).map((x) => { const m = /([\w.-]+\.c?js):(\d+):\d+\)?$/.exec(x); const fn = /^at ([\w.$<>]+) \(/.exec(x); return m ? `${fn ? fn[1] + ' ' : ''}${m[1]}:${m[2]}` : x.replace(/^at /, ''); }).join(' ← ');
async function engineLeg(EM, tag, rounds = 3) {
  const D = path.join(ROOT, `e-${tag}`); fs.cpSync(TPL_E, D, { recursive: true });
  refusing(true);
  try {
  const clock = { t: TE }, e = mkEng(EM, D, clock), ix = e.store.index;
  const named = [];
  if (ix.flushStats().lastFull !== 'boot') named.push(`${ix.flushStats().lastFull} @ the engine's create (before the tap)`);   // a whole touch during create
  ix.onWholeTouch((why) => named.push(`${why} @ ${siteOf(new Error().stack) || '?'}`));
  const f0 = ix.flushStats(), j0 = f0.journaled || 0;
  for (let i = 0; i < rounds; i++) {
    clock.t = TE + (i + 1) * 20 * 60e3;
    await ix.update(() => { const en = ix.entry(AE, `s-${i * 7}`, { create: false }); en.unread = (en.unread || 0) + 1; en.lastAt = clock.t; en.authors = [{ id: `p${i}`, name: `Person ${i}`, isSelf: false }, ...(en.authors || []).slice(0, 4)]; });   // the mail driver
    e.tick();
    for (let k = 0; k < 20; k++) await new Promise((z) => setImmediate(z));
    await e.idle(AE); await e.idle(AR);
  }
  await ix.journalDurable();
  const f1 = ix.flushStats(), js = ix.journalStats();
  const rows = ix.rows(), refused = Object.keys(rows).filter((k) => k.startsWith(`${AR}/`) && rows[k].lane && rows[k].lane.lastError && rows[k].lane.lastError.code === 'forbidden' && rows[k].lane.lastError.at > TE).length;
  const walked = Object.keys(rows).filter((k) => k.startsWith(`${AE}/`) && rows[k].walkedAt > TE).length;   // the empty pages' storm (ingest)
  const sample = Object.keys(rows).find((k) => k.startsWith(`${AR}/`) && rows[k].lane && rows[k].lane.lastError);
  const back = sample ? ((familyMap(kill(D + '/channels', `e-${tag}`)) || {})[sample] || {}).lane : null;   // the kill: the last refusal read back
  const r = { named, wholeWrites: f1.writes - f0.writes, indexOwed: js.indexOwed, journaled: (f1.journaled || 0) - j0, journalBytes: js.journalBytes, refused, walked, lastRefusalKept: !!(sample && back && back.lastError && back.lastError.at === rows[sample].lane.lastError.at) };
  try { e.stop(); } catch { }
  try { await e.store.close?.(); } catch { }
  return r;
  } finally { refusing(false); }   // the fake put back whatever the leg does
}
{
  const r = await engineLeg(ENG, 'census');
  console.log(`   ⑩ the storm: ${r.refused} rows refused (${AR}), ${r.walked} rows walked from an empty page (${AE}), ${r.journaled} rows journaled (${r.journalBytes} bytes), index.json written ${r.wholeWrites} times, owed ${r.indexOwed}; whole touches: ${r.named.length ? r.named.join(' | ') : 'none'}`);
  ok(r.named.length === 0, `⑩ THE STATIC CENSUS: under the mail driver and the engine's passes, no update scope reached the whole map${r.named.length ? ' — BY NAME: ' + r.named.join(' | ') : ''}`, r.named);
  ok(r.refused >= 300 && r.journaled >= r.refused + r.walked && r.wholeWrites <= Math.floor(r.journalBytes / (8 * 1024 * 1024)) && !r.indexOwed && r.lastRefusalKept,
    `⑩ LAW 4 — THE REFUSAL STORM: ${r.refused} rows refused and ${r.walked} walked from an empty page (each a change of the row) rode the journal (${r.journaled} rows journaled, ${r.journalBytes} bytes, under its 8 MB bound) — index.json written ${r.wholeWrites} times and not owed (${r.indexOwed}); the kill copy holds the last refusal (${r.lastRefusalKept})`, r);
  const from = '      en.lane = { ...(en.lane || {}), lastError: { code, at: now(), why: String((err && err.message) || err).slice(0, 200) } };   // the refusal is a real change of the row…';
  const line = ENGSRC.slice(0, ENGSRC.indexOf(from)).split('\n').length;
  const EM = M.load('src/server/channels-engine.js', anchored(ENGSRC, from, 'void store.index.live(); ' + from.trimStart(), 'a refusal\'s update scope reads live()'), 'refusal-reads-live');
  const red = await engineLeg(EM, 'census-red', 1);
  ok(red.named.some((x) => x.startsWith('update read live() @ ') && /channels-engine/.test(x) && x.includes(`:${line}`)) && (red.wholeWrites > 0 || red.indexOwed),
    `⑩ RED CONTROL: a refusal's update scope that reads live() — the census names it (${red.named.length} whole touches, the first: ${red.named[0] || 'none'}) and the storm owes index.json (written ${red.wholeWrites}, owed ${red.indexOwed}) — both legs above would go red`, { first: red.named.slice(0, 2), line, wholeWrites: red.wholeWrites, indexOwed: red.indexOwed });
}

// ═══ ⑪ THE SLICED WARM-UP AT OPEN ═══
console.log('⑪ changes during the warm-up at open (no print yet) — journaled; quiet after it');
async function warmLeg(mod, tag) {
  const dir = tmp(tag);
  { const o = open(CS, dir); await seed(o.st, 600); shut(o); }
  let w = null, st = null, placed = false, during = null;
  const rows = 600;
  const mid = async () => {   // between two slices of the open's warm-up: a durable change, a paced change, a quiet touch
    await st.index.update(() => { st.index.entry('a', 'c1').title = 'during-durable'; }, { durable: true });
    await st.index.update(() => { st.index.entry('a', `c${rows - 1}`).title = 'during-paced'; });
    st.index.touch('a/c2');
    during = st.index.flushStats().layoutSliced;
  };
  w = SW.create({ log: quiet });
  // onSlice(i): i = the chunks laid out so far (256 rows each) — the changes go in after the first
  st = mod.createChannelStore({ dir, log: quiet, writer: w, walk: { syncRows: 100, sliceMs: 0, onSlice: async (i, what) => { if (what === 'layout' && !placed && i >= 1) { placed = true; await mid(); } } } });
  for (let k = 0; k < 200 && !(st.index.flushStats().layoutSliced >= 1); k++) await new Promise((z) => setTimeout(z, 5));
  await st.index.durable();
  const k1 = kill(dir, `${tag}-a`), m1 = familyMap(k1) || {};
  const j0 = st.index.flushStats().journaled || 0;
  await st.index.update(() => { for (let i = 0; i < 50; i++) st.index.touch(`a/c${i}`); });   // after the landing: quiet
  await st.index.durable();
  const quietRows = (st.index.flushStats().journaled || 0) - j0;
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return { placed, landedBefore: during, durable: (m1['a/c1'] || {}).title, paced: (m1[`a/c${rows - 1}`] || {}).title, quietRows };
}
{
  const r = await warmLeg(CS, 'warm');
  ok(r.placed && r.landedBefore === 0 && r.durable === 'during-durable' && r.paced === 'during-paced' && r.quietRows === 0, `⑪ THE WARM-UP AT OPEN (sliced, no print yet): a durable and a paced change made between two of its slices are in the kill copy (${r.durable} · ${r.paced}); after it landed, 50 quiet touches journaled ${r.quietRows} rows`, r);
}

// ═══ ⑫ THE HOLD (B-360d unit 1 moved onto the train × B-f276 1b — 主开发 r1542's law) ═══
console.log('⑫ while the index is held, nothing of its family is read or written');
// index.json DAMAGED (its bytes are not the store): the store holds the family. The law: no journal line, no fold, no
// compaction, no warm-up; an act is refused by name (the train's road); both files are byte-identical after the stop.
async function heldLeg(mod, tag) {
  const dir = tmp(tag), ixf = path.join(dir, 'index.json'), af = path.join(dir, 'index-acts.ndjson');
  fs.writeFileSync(ixf, '{"v":1,"conversations":{"a/c0":{"title":"t0"'); fs.writeFileSync(af, JSON.stringify({ seq: 1, rows: { 'a/c1': { title: 'from the journal' } } }) + '\n');
  const ix0 = fs.readFileSync(ixf), af0 = fs.readFileSync(af);
  const o = open(mod, dir);
  const held = !!o.st.index.blocked();
  const refused = await o.st.index.update(() => { o.st.index.entry('a', 'c2').title = 'during the hold'; }).then(() => 'applied', (e) => e && e.code);
  // 主开发 r2455 (1): THE OUTSIDE ROAD's own guards — a change outside an update and a whole touch outside one ask the writer
  // NOTHING while the index is held (the refusal said once): the writer's asks for the family counted across them
  const asks = [], d0 = o.w.dirty; o.w.dirty = function (file, opts) { asks.push(path.basename(file)); return d0.call(this, file, opts); };
  try { o.st.index.entry('a', 'c3').title = 'outside an update'; } catch { }   // a change outside an update: the index's own write refuses it
  try { o.st.index.touch('a/no-such-row'); } catch { }   // a whole touch outside an update (a touch of a row not in the map)
  await Promise.resolve(); await new Promise((z) => setImmediate(z));
  o.w.dirty = d0;
  const outsideAsks = asks.filter((f) => f === 'index.json' || f === 'index-acts.ndjson').length;
  const js = o.st.index.journalStats();
  const fold = await o.st.index.fold().then(() => 'landed', (e) => e && e.code), jd = await o.st.index.journalDurable().then(() => 'landed', (e) => e && e.code);
  const chunks = o.st.index.flushStats().chunks;
  try { o.st.index.flush(); } catch { }
  shut(o);
  return { held, refused, lines: js.lines, actSeq: js.actSeq, fold, jd, chunks, outsideAsks, ixSame: fs.readFileSync(ixf).equals(ix0), afSame: fs.readFileSync(af).equals(af0) };
}
{
  const r = await heldLeg(CS, 'held');
  ok(r.held && r.refused === 'store-blocked' && r.lines === 0 && r.fold === 'store-blocked' && r.jd === 'store-blocked' && r.chunks === 0 && r.outsideAsks === 0 && r.ixSame && r.afSame,
    `⑫ THE HOLD: index.json damaged — the family held (${r.held}); an update refused by name (${r.refused}); a change outside an update made no journal line (${r.lines} lines); fold() ${r.fold}, journalDurable() ${r.jd}; no warm-up (${r.chunks} chunks laid out); after the stop index.json and the journal are byte-identical (${r.ixSame} · ${r.afSame})`, r);
  const HM2 = M.load('src/channel-store.js', anchored(anchored(SRC, "    if (ixLoad.blocked) return 'whole';\n    if (t.all || ixLoad.missing) return 'whole';", "    if (t.all || ixLoad.missing) return 'whole';", 'the journal deaf to the hold'), "if (closed || !o.size) return; if (ixLoad.blocked) { sayHeldOnce(); return; }", "if (closed || !o.size) return;", 'the outside road deaf to the hold'), 'held-lines');
  // 主开发 r2455 (1): a red of their OWN for the outside road's two guards — each cut ALONE (actOf's guard kept): the writer asked
  ok(r.outsideAsks === 0, `⑫ while held, a change outside an update and a whole touch outside one asked the writer ${r.outsideAsks} time(s) for the family`, r);
  const OG = M.load('src/channel-store.js', anchored(SRC, 'if (closed || !o.size) return; if (ixLoad.blocked) { sayHeldOnce(); return; } ', 'if (closed || !o.size) return; ', 'the outside road deaf to the hold'), 'held-outside');
  const rog = await heldLeg(OG, 'held-outside-red');
  ok(rog.outsideAsks >= 1, `⑫ RED CONTROL: the outside road's own guard alone removed — the writer asked ${rog.outsideAsks} time(s) for the held family — the leg above would go red`, rog);
  const TG = M.load('src/channel-store.js', anchored(SRC, 'if (!closed && !ixLoad.blocked) oweWhole(); } }', 'if (!closed) oweWhole(); } }', 'a whole touch outside an update deaf to the hold'), 'held-touchall');
  const rtg = await heldLeg(TG, 'held-touchall-red');
  ok(rtg.outsideAsks >= 1, `⑫ RED CONTROL: the whole touch's hold guard alone removed (touchAll) — the writer asked ${rtg.outsideAsks} time(s) for the held family — the leg above would go red`, rtg);
  // r1763 (3): a red for each guard that can bite on this road — fold() and journalDurable() refused by name
  const FG = M.load('src/channel-store.js', anchored(SRC, 'if (ixLoad.blocked) return Promise.reject(blockedError(ixLoad.blocked)); markDirty(true); return W().durable(indexFile); }', 'markDirty(true); return W().durable(indexFile); }', 'fold deaf to the hold'), 'held-fold');
  const rfg = await heldLeg(FG, 'held-fold-red');
  ok(rfg.fold !== 'store-blocked', `⑫ RED CONTROL: fold() deaf to the hold — it answered «${rfg.fold}», not refused — the leg above would go red`, rfg);
  const JG = M.load('src/channel-store.js', anchored(SRC, 'if (ixLoad.blocked) return Promise.reject(blockedError(ixLoad.blocked)); askActs(); return W().durable(actsFile); },', 'askActs(); return W().durable(actsFile); },', 'journalDurable deaf to the hold'), 'held-jd');
  const rjg = await heldLeg(JG, 'held-jd-red');
  ok(rjg.jd !== 'store-blocked', `⑫ RED CONTROL: journalDurable() deaf to the hold — it answered «${rjg.jd}», not refused — the leg above would go red`, rjg);
  const red = await heldLeg(HM2, 'held-red');
  ok(red.lines > 0, `⑫ RED CONTROL: a journal deaf to the hold — the change outside an update made ${red.lines} journal line(s) beside the held index — the leg above would go red`, red);
}

// ═══ ⑮ A ROW HAS LANDED (主开发 r1765: B-526c's set × the journal) ═══
console.log('⑮ a born row lands exactly when its own change is on disk by the road that carries it');
// B-526c (lg-group-parents, on the train): the rows BORN since the index file last landed; a person's act on one is said applied
// only once it landed. With the journal, a born row's road is its LINE: landed when an append or a compaction holding that line
// is on disk (or a whole write that carried it landed) — never while the line is in memory or its append failed; while HELD,
// nothing is said landed. The stand-in thread holds the journal's write while a `stall` marker stands.
async function landLeg(mod, tag) {
  const dir = tmp(tag), w = SW.create({ log: quiet, workerPath: STANDJ });
  const st = mod.createChannelStore({ dir, log: quiet, writer: w });
  await seed(st, 20);
  fs.writeFileSync(path.join(dir, 'stall'), '1');
  await st.index.update(() => { st.index.entry('a', 'born-1').title = 'born'; });   // a row BORN: its journal line made
  const p = st.index.journalDurable();
  await new Promise((z) => setTimeout(z, 150));   // its append in flight, held before its sync
  const during = st.index.landed('a/born-1');
  fs.unlinkSync(path.join(dir, 'stall'));
  await p;
  const after = st.index.landed('a/born-1');
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return { during, after };
}
async function heldLandLeg(mod, tag, waitMs = 200) {
  const dir = tmp(tag), ixf = path.join(dir, 'index.json');
  fs.writeFileSync(ixf, '{"v":1,"conversations":{"a/c0"');   // damaged: the family held
  const o = open(mod, dir);
  try { o.st.index.entry('a', 'h-1').title = 'outside an update, while held'; } catch { }
  await new Promise((z) => setImmediate(z));
  await o.st.index.journalDurable().catch(() => false);
  const af = path.join(dir, 'index-acts.ndjson'), t0 = Date.now();
  while (Date.now() - t0 < waitMs && !fs.existsSync(af)) await new Promise((z) => setTimeout(z, 20));   // a deaf journal's paced append (its 500 ms pace)
  await new Promise((z) => setTimeout(z, 30));
  const landed = o.st.index.landed('a/h-1'), afBytes = read(path.join(dir, 'index-acts.ndjson')).length;
  shut(o);
  return { landed, afBytes };
}
{
  const r = await landLeg(CS, 'land');
  ok(r.during === false && r.after === true, `⑮ (1) a born row while its journal line's write is held before its sync: landed ${r.during}; after the sync: landed ${r.after}`, r);
  const MK = M.load('src/channel-store.js', anchored(SRC, "    for (const [k, f] of fps) if (f !== null && isUnlanded(k) && !bornSeq.has(k)) bornSeq.set(k, seq);", "    for (const [k, f] of fps) if (f !== null) unlanded.delete(k);", 'landed at the line\'s making'), 'land-at-making');
  const rk = await landLeg(MK, 'land-red1');
  ok(rk.during === true, `⑮ (1) RED CONTROL: a row said landed at its line's MAKING — landed while the line was not on disk (${rk.during}) — the leg above would go red`, rk);
  const MW = M.load('src/channel-store.js', anchored(SRC, "    for (const [k, sq] of bornSeq) if (sq <= w.upTo) { unlanded.delete(k); bornSeq.delete(k); }", "    void 0;", 'landed only by a whole write'), 'land-only-whole');
  const rw = await landLeg(MW, 'land-red2');
  ok(rw.after === false, `⑮ (1) RED CONTROL: a row that lands only by a whole write (B-526c's set put beside the journal by text alone) — still unlanded after its line synced (${rw.after}) — the leg above would go red`, rw);
  const h = await heldLandLeg(CS, 'land-held');
  ok(h.landed === false && h.afBytes === 0, `⑮ (3) the family HELD: a row born outside an update is never said landed (${h.landed}); no journal byte written (${h.afBytes})`, h);
  const MH = M.load('src/channel-store.js', anchored(anchored(anchored(anchored(SRC, "    if (ixLoad.blocked) return 'whole';\n    if (t.all || ixLoad.missing) return 'whole';", "    if (t.all || ixLoad.missing) return 'whole';", 'actOf deaf'), "    if (ixLoad.blocked) { sayHeldOnce(); return (LATER); }", "    void 0;", 'produceActs deaf'), "      landed: (key) => !ixLoad.blocked && hasOwn(ix.conversations, key) && !isUnlanded(key),", "      landed: (key) => hasOwn(ix.conversations, key) && !isUnlanded(key),", 'landed deaf'), "if (closed || !o.size) return; if (ixLoad.blocked) { sayHeldOnce(); return; }", "if (closed || !o.size) return;", 'the outside road deaf'), 'land-held-deaf');   // stale-pins: kept (the train's own landed() before the hold, a red control's text)
  const rh = await heldLandLeg(MH, 'land-held-red', 2500);
  ok(rh.landed === true || rh.afBytes > 0, `⑮ (3) RED CONTROL: a journal deaf to the hold — a line written beside the held index (${rh.afBytes} bytes) and the row said landed (${rh.landed}) — the leg above would go red`, rh);
}
// ═══ ⑬ THE FOLLOW (主开发 r1542 (2)): the roads the round found without a red control ═══
console.log('⑬ the LATER road, the byte bound alone, a row changed before its touch, the guard at a produce, a thrown fn, the purge\'s failure');
// (a) LAW 10's LATER ROAD: 24 durable acts fired at once, ~4 KB each, under a 64 KB bound — their lines pass the bound before the
// journal's first write; each act must be answered only when its row is ON DISK (the fold carries the lines). RED: a capped job.
async function laterLeg(mod, tag) {
  const dir = tmp(tag), said = [], w = SW.create({ log: quiet });
  const st = mod.createChannelStore({ dir, log: { ...quiet, warn: (l) => said.push(String(l)) }, writer: w, actsMaxBytes: 64 * 1024 });
  await seed(st, 40);
  const big = 'x'.repeat(4000), seen = [];
  const ps = [];
  for (let i = 0; i < 24; i++) ps.push(st.index.update(() => { st.index.entry('a', `c${i}`).note = big + i; }, { durable: true }).then(() => { const m = familyMap(kill(dir, `${tag}-at`)) || {}; seen.push(!!(m[`a/c${i}`] && m[`a/c${i}`].note === big + i)); }, (e) => { seen.push((e && e.code) || 'threw'); }));
  await Promise.all(ps);
  const writes = st.index.flushStats().writes, owedSaid = said.filter((l) => /kept in memory, not on disk yet/.test(l)).length;
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return { onDisk: seen.filter((x) => x === true).length, answers: seen.length, writes, owedSaid, other: seen.filter((x) => x !== true).slice(0, 3) };
}
// (b) LAW 4's BYTE BOUND ALONE: 100 rows (under the 128 the 64 KB bound allows) whose lines pass 64 KB — one whole write owed,
// nothing journaled. RED: only the byte bound removed.
async function byteLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir, { actsMaxBytes: 64 * 1024 });
  await seed(o.st, 200);
  const f0 = o.st.index.flushStats(), j0 = f0.journaled || 0, b0 = f0.bursts || 0;
  await o.st.index.update(() => { for (let i = 0; i < 100; i++) o.st.index.entry('a', `c${i}`).note = 'y'.repeat(1000) + i; });
  const f1 = o.st.index.flushStats(), js = o.st.index.journalStats();
  shut(o);
  return { journaled: (f1.journaled || 0) - j0, bursts: (f1.bursts || 0) - b0, wholeOwed: js.wholeOwed > 0 };
}
// (d) ⑪'s GUARD AT A PRODUCE: an update whose fn awaits a whole write (a produce re-lays the row it changed) while index.json
// cannot be written — the row must still reach the journal. RED: serializeChunk without the guard (its print taken at the produce).
async function guardLeg(mod, tag) {
  const dir = tmp(tag), w = SW.create({ log: quiet, workerPath: STANDJ });
  const st = mod.createChannelStore({ dir, log: quiet, writer: w });
  await seed(st, 40);
  fs.writeFileSync(path.join(dir, 'blockix'), '1');   // from here index.json is unwritable
  await st.index.update(async () => { st.index.entry('a', 'c5').title = 'changed-in-flight'; await st.index.fold().catch(() => false); });
  await st.index.journalDurable().catch(() => false);
  const k = kill(dir, tag); try { fs.rmSync(path.join(k, 'blockix'), { force: true }); } catch { }
  const m = familyMap(k) || {};
  try { st.close(); } catch { } try { w.stop(); } catch { }
  return { kept: !!(m['a/c5'] && m['a/c5'].title === 'changed-in-flight') };
}
// (e) A FN THAT THROWS after changing a row: what it changed is journaled. RED: afterThrow without its compare.
async function throwLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir);
  await seed(o.st, 40);
  await o.st.index.update(() => { o.st.index.entry('a', 'c7').title = 'before-the-throw'; throw new Error('the fn threw'); }).catch(() => { });
  await o.st.index.journalDurable();
  const m = familyMap(kill(dir, tag)) || {};
  shut(o);
  return { kept: !!(m['a/c7'] && m['a/c7'].title === 'before-the-throw') };
}
// (f) THE PURGE'S FAILURE THROUGH THE REAL ROAD: an account that forgets its data (fake-poll given purge-on-remove), removed by
// the engine's own remove() → removeRecord → purgeIfDeclared, whose journal the storage does not rewrite now (the store's
// journalDurable answers false). The PERSON's reply says it (r1542 (1)), the log says it, the audit row is 'purge-owed'.
// CONTROL: the same road with the compaction landed — a plain reply, the audit 'purge'.
async function purgeLeg(fails, tag) {
  const D = path.join(ROOT, `p-${tag}`); fs.cpSync(TPL_E, D, { recursive: true });
  const caps = FAKE.fakePoll.caps, had = caps.retention, said = [], audits = [];
  caps.retention = 'purge-on-remove';
  try {
    const clock = { t: TE };
    const e = ENG.create({ dataDir: D, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: () => clock.t, log: { ...quiet, warn: (...a) => said.push(a.join(' ')) }, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }], censusTimer: () => ({ cancel() {} }), walk: { syncRows: 1e9 } });
    const a0 = e.store.audit; e.store.audit = (rec) => { audits.push(rec); return a0 ? a0.call(e.store, rec) : undefined; };
    e.store.index.journalDurable = () => Promise.resolve(!fails);   // the storage's answer to the compaction
    let reply = null; try { reply = await e.remove(AE); } catch (err) { reply = { threw: (err && err.message) || String(err) }; }
    try { e.stop(); } catch { } try { await e.store.close?.(); } catch { }
    return { reply, owed: audits.some((x) => x && x.op === 'purge-owed'), clean: audits.some((x) => x && x.op === 'purge'), said: said.some((l) => /could not be rewritten now/.test(l)) };
  } finally { if (had === undefined) delete caps.retention; else caps.retention = had; }
}
{
  const r = await laterLeg(CS, 'later');
  ok(r.answers === 24 && r.onDisk === 24 && r.owedSaid === 1, `⑬ (a) LAW 10's LATER ROAD: 24 durable acts past the 64 KB bound at once — ${r.onDisk} of ${r.answers} answered with their row on disk (the fold carried them: ${r.writes} whole writes); «kept in memory» said ${r.owedSaid} time(s)`, r);
  const CAP = M.load('src/channel-store.js', anchored(SRC, 'if (all > ACTS_MAX_BYTES) { askFold(); return (LATER); } }', 'if (all > ACTS_MAX_BYTES && !compactOwed) { let b = 0; const cut = []; for (const x of actLines) { if (x.seq <= appendedSeq) continue; if (b + lb(x) > ACTS_MAX_BYTES) break; b += lb(x); cut.push(x); } if (cut.length) { actsWriting = { compact: false, upTo: cut[cut.length - 1].seq }; return { append: cut.map((x) => x.text).join(\'\') }; } } }', 'a capped journal job'), 'later-capped');
  const rc = await laterLeg(CAP, 'later-red');
  ok(rc.onDisk < rc.answers, `⑬ (a) RED CONTROL: a CAPPED journal job (the first read's must) — ${rc.answers - rc.onDisk} of ${rc.answers} durable acts answered before their row was on disk — the leg above would go red`, rc);
  const b = await byteLeg(CS, 'bytes');
  ok(b.journaled === 0 && b.bursts === 1 && b.wholeOwed, `⑬ (b) LAW 4's BYTE BOUND ALONE: 100 rows (under the row bound) whose lines pass 64 KB — ${b.journaled} journaled, ${b.bursts} burst, the whole write owed (${b.wholeOwed})`, b);
  const BM = M.load('src/channel-store.js', anchored(SRC, "      if (bytes > BURST_BYTES) { flushStats.bursts = (flushStats.bursts || 0) + 1; return 'whole'; }", "      void 0;", 'the byte bound removed'), 'bytes-gone');
  const br = await byteLeg(BM, 'bytes-red');
  ok(br.journaled === 100, `⑬ (b) RED CONTROL: only the byte bound removed — the 100 rows journaled (${br.journaled}) — the leg above would go red`, br);
  const g = await guardLeg(CS, 'guard');
  ok(g.kept, `⑬ (d) ⑪'s GUARD: a produce inside an update's await re-laid the row it changed while index.json could not be written — the row reached the journal (${g.kept})`, g);
  const GM = M.load('src/channel-store.js', anchored(SRC, 'if (curTouch && curTouch.has(k)) rowFp.delete(k); else rowFp.set(k, fpOf(line)); }', 'rowFp.set(k, fpOf(line)); }', 'the guard removed'), 'guard-gone');
  const gr = await guardLeg(GM, 'guard-red');
  ok(!gr.kept, `⑬ (d) RED CONTROL: serializeChunk without the guard — its print taken at the produce, the change read as quiet and lost (${gr.kept}) — the leg above would go red`, gr);
  const t = await throwLeg(CS, 'throw');
  ok(t.kept, `⑬ (e) A FN THAT THREW after changing a row: the row reached the journal (${t.kept})`, t);
  const XM = M.load('src/channel-store.js', anchored(SRC, "      const afterThrow = () => { done(); if (!closed) { const k = actOf(t, false); if (k === 'whole') oweWhole(); } };", "      const afterThrow = () => { done(); };", 'afterThrow without its compare'), 'throw-bare');
  const tx = await throwLeg(XM, 'throw-red');
  ok(!tx.kept, `⑬ (e) RED CONTROL: afterThrow without its compare — the row is lost (${tx.kept}) — the leg above would go red`, tx);
  const pf = await purgeLeg(true, 'purge-fails');
  ok(pf.reply && pf.reply.removed === true && pf.reply.journalOwed === true && /not erased from disk yet/.test(pf.reply.note || '') && pf.owed && !pf.clean && pf.said, `⑬ (f) THE PURGE'S FAILURE through the real remove(): the person's reply says it (journalOwed ${pf.reply && pf.reply.journalOwed}: «${pf.reply && pf.reply.note}»), the audit row is 'purge-owed' (${pf.owed}), the log says it (${pf.said})`, pf);
  const pc = await purgeLeg(false, 'purge-lands');
  ok(pc.reply && pc.reply.removed === true && !pc.reply.journalOwed && pc.clean && !pc.owed, `⑬ (f) CONTROL: the same road with the compaction landed — a plain reply (journalOwed ${pc.reply && pc.reply.journalOwed}), the audit row 'purge' (${pc.clean})`, pc);
}

// ═══ ⑭ THE STOP (主开发 r1542 (3)): paced lines owed at a SIGTERM are on disk after it ═══
console.log('⑭ a SIGTERM with paced journal lines owed — the exit\'s passes write them');
// A child process of this suite opens a store on the process's own writer, makes ten PACED changes (their lines owed: the
// pace's 500 ms not run) and sends ITSELF SIGTERM in the same turn (no timing between two processes). The child's handler runs the hub's shutdown
// order (server.js: beginExit, the rank-0 pass, … , the last pass over every store, exit). RED: an exit after the rank-0
// pass alone (paced lines are rank 1).
const STOPJ = path.join(ROOT, 'stopj.cjs');
fs.writeFileSync(STOPJ, `'use strict';
const CS = require(${JSON.stringify(path.join(REPO, 'src/channel-store.js'))}), SW = require(${JSON.stringify(path.join(REPO, 'src/store-writer.js'))});
const [dir, mode] = process.argv.slice(2), quiet = { log() {}, info() {}, warn() {}, error() {} };
const st = CS.createChannelStore({ dir, log: quiet });
process.on('SIGTERM', () => { const SW0 = SW.storeWriter(); SW0.beginExit(); SW0.exitFlush({ only: 'rank0' }); const tDebt = Date.now(); if (mode !== 'rank0-only') SW0.exitFlush({ debtMs: Date.now() - tDebt }); process.exit(0); });
(async () => {
  await st.index.update(() => { for (let i = 0; i < 40; i++) Object.assign(st.index.entry('a', 'c' + i), { title: 't' + i }); }); st.index.flush();
  for (let i = 0; i < 10; i++) await st.index.update(() => { st.index.entry('a', 'c' + i).note = 'paced-' + i; });
  process.stdout.write('READY\\n');
  process.kill(process.pid, 'SIGTERM');   // in the same turn as the changes: their lines are owed (the pace's 500 ms never ran)
  setInterval(() => {}, 1000);
})();
`);
async function stopLeg(mode, tag) {
  const dir = tmp(tag);
  const { spawn } = await import('node:child_process');
  const ch = spawn(process.execPath, [STOPJ, dir, mode], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  ch.stderr.on('data', (d) => { err += d; });
  const deadline = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 20000);   // a child that hangs never hangs the suite
  ch.stdout.on('data', (d) => { out += d; });
  const code = await new Promise((res) => { if (ch.exitCode !== null) res(ch.exitCode); else ch.on('exit', (c) => res(c)); });
  clearTimeout(deadline);
  const m = familyMap(dir) || {};
  let kept = 0; for (let i = 0; i < 10; i++) if (m[`a/c${i}`] && m[`a/c${i}`].note === `paced-${i}`) kept++;
  return { ready: /READY/.test(out), code, kept, err: err.slice(0, 300) };
}
{
  const r = await stopLeg('hub', 'stop');
  ok(r.ready && r.code === 0 && r.kept === 10, `⑭ THE STOP: a SIGTERM with ten PACED journal lines owed — after the hub's exit passes ${r.kept} of 10 changes are on disk (exit ${r.code})`, r);
  const red = await stopLeg('rank0-only', 'stop-red');
  ok(red.ready && red.kept < 10, `⑭ RED CONTROL: an exit after the rank-0 pass alone — ${red.kept} of 10 paced changes on disk (paced lines are rank 1) — the leg above would go red`, red);
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const i0 = srv.indexOf("SW0.beginExit(); SW0.exitFlush({ only: 'rank0' });"), i1 = srv.indexOf("storeWriter().exitFlush({ debtMs: Date.now() - tDebt }); } catch {} process.exit(", i0);
  ok(i0 > 0 && i1 > i0, '⑭ the hub\'s shutdown (server.js) runs that order: beginExit and the rank-0 pass, then the last pass over every store before its exit — this leg proves the WRITER\'s two passes (a copy of them in a child), not the hub\'s whole order: server.js runs its other stops between them (channelsWiring.shutdown() closes this store there), which this child does not (主开发 r2455 (3))');
}

// ═══ ⑰ THE LANDING'S ROADS (主开发 r1850) ═══
console.log('⑰ the landing: a birth after a produced whole write, a rebirth with its old line in flight, the boot, the whole road, the order, the hold');
const pause = (ms) => new Promise((z) => setTimeout(z, ms));
const waitFor = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await pause(10); } return false; };
const standSt = (mod, dir, opts = {}) => { const w = SW.create({ log: quiet, workerPath: STANDJ }); return { w, st: mod.createChannelStore({ dir, log: quiet, writer: w, ...opts }) }; };
const stopSt = (o) => { try { o.st.close(); } catch { } try { o.w.stop(); } catch { } };
// (1) a row purged AFTER a whole write was produced and born again BEFORE it lands: that landing carries the OLD row
async function producedLeg(mod, tag) {
  const dir = tmp(tag), o = standSt(mod, dir);
  await seed(o.st, 20);
  fs.writeFileSync(path.join(dir, 'stallix'), '1'); fs.writeFileSync(path.join(dir, 'stall'), '1');
  await o.st.index.update(() => { o.st.index.entry('a', 'x').title = 'v1'; });   // born: its line made
  const f = o.st.index.fold();   // a whole write PRODUCED now (it carries v1), held in flight
  await waitFor(() => !o.st.index.isDirty(), 2000);
  await o.st.index.update((ix) => { delete ix.conversations['a/x']; });   // purged
  await o.st.index.update(() => { o.st.index.entry('a', 'x').title = 'v2'; });   // born AGAIN
  fs.unlinkSync(path.join(dir, 'stallix'));
  await f.catch(() => false);   // the produced write (v1) landed
  const afterOld = o.st.index.landed('a/x');
  fs.unlinkSync(path.join(dir, 'stall'));
  // the reborn row's old place was laid out by that produce, so its birth is a whole touch (entry(): «a row re-born before its old
  // place was rewritten») — its road is the NEXT whole write, which lands it
  await o.st.index.fold().catch(() => false);
  const afterNew = o.st.index.landed('a/x');
  stopSt(o);
  return { afterOld, afterNew };
}
// (2a) purged and born again while its OLD line's append is in flight: unlanded until the NEW line is on disk
async function rebornLeg(mod, tag) {
  const dir = tmp(tag), o = standSt(mod, dir);
  await seed(o.st, 20);
  fs.writeFileSync(path.join(dir, 'stall'), '1');
  await o.st.index.update(() => { o.st.index.entry('a', 'y').title = 'v1'; });   // born: line L1
  const jd = o.st.index.journalDurable();   // L1's append in flight, held
  await pause(100);
  await o.st.index.update((ix) => { delete ix.conversations['a/y']; });   // purged
  await o.st.index.update(() => { o.st.index.entry('a', 'y').title = 'v2'; });   // born again: line L2
  fs.writeFileSync(path.join(dir, 'stall.pass'), '1');   // ONE held write passes: L1's
  await jd.catch(() => false);
  const afterOld = o.st.index.landed('a/y');
  fs.unlinkSync(path.join(dir, 'stall'));
  await o.st.index.journalDurable().catch(() => false);
  await waitFor(() => o.st.index.landed('a/y'), 1500);
  const afterNew = o.st.index.landed('a/y');
  stopSt(o);
  return { afterOld, afterNew };
}
// (2b) the boot: a row only in the journal, replayed at a new open, is said landed
async function bootLeg(tag) {
  const dir = tmp(tag), o = open(CS, dir);
  await seed(o.st, 20);
  await o.st.index.update(() => { o.st.index.entry('a', 'z').title = 'only in the journal'; });
  await o.st.index.journalDurable();
  const k = kill(dir, tag); shut(o);
  const inIndex = !!(JSON.parse(read(path.join(k, 'index.json'))).conversations || {})['a/z'];
  const o2 = open(CS, k); const landed = o2.st.index.landed('a/z'); shut(o2);
  return { inIndex, landed };
}
// (2c) born rows carried by a WHOLE write (a burst past the row bound): landed only through the whole road
async function wholeRoadLeg(tag) {
  const dir = tmp(tag), o = standSt(CS, dir, { actsMaxBytes: 64 * 1024 });
  await seed(o.st, 20);
  fs.writeFileSync(path.join(dir, 'stallix'), '1');
  await o.st.index.update(() => { for (let i = 0; i < 200; i++) o.st.index.entry('a', `b${i}`).title = 'burst ' + i; });   // 200 born: a burst
  const f = o.st.index.fold();
  await pause(100);
  const during = o.st.index.landed('a/b7'), lines = o.st.index.journalStats().lines;
  fs.unlinkSync(path.join(dir, 'stallix'));
  await f.catch(() => false);
  const after = o.st.index.landed('a/b7');
  stopSt(o);
  return { during, after, lines };
}
// (2d) the order numbers across a fold and a compaction: every line past the index's actsSeq, strictly rising, the next after them
async function orderLeg(tag) {
  const dir = tmp(tag), o = open(CS, dir);
  await seed(o.st, 20);
  for (let i = 0; i < 5; i++) await o.st.index.update(() => { o.st.index.entry('a', `c${i}`).unread = i + 1; });
  await o.st.index.fold(); await o.st.index.journalDurable();   // the fold, then the compaction
  for (let i = 0; i < 3; i++) await o.st.index.update(() => { o.st.index.entry('a', `c${i}`).unread = 100 + i; });
  await o.st.index.journalDurable();
  const held = Number(JSON.parse(read(path.join(dir, 'index.json'))).actsSeq) || 0;
  const seqs = read(path.join(dir, 'index-acts.ndjson')).split('\n').filter(Boolean).map((l) => JSON.parse(l).seq);
  const k = kill(dir, tag); shut(o);
  const o2 = open(CS, k);
  await o2.st.index.update(() => { o2.st.index.entry('a', 'c9').unread = 9; }); await o2.st.index.journalDurable();
  const after = read(path.join(k, 'index-acts.ndjson')).split('\n').filter(Boolean).map((l) => JSON.parse(l).seq);
  shut(o2);
  return { held, seqs, next: after[after.length - 1], rising: seqs.every((x, i) => x > held && (i === 0 || x > seqs[i - 1])) };
}
// (3) the HOLD's own guard: a held family holding a row NOT in the unlanded set (replayed before the index appeared)
async function heldAccessorLeg(mod, tag) {
  const dir = tmp(tag), af = path.join(dir, 'index-acts.ndjson'), ixf = path.join(dir, 'index.json');
  fs.writeFileSync(af, JSON.stringify({ seq: 1, rows: { 'a/old-1': { title: 'older life' } } }) + '\n');
  const o = open(mod, dir);
  const before = o.st.index.landed('a/old-1');   // replayed at the load: on disk, said landed
  fs.writeFileSync(ixf, JSON.stringify({ v: 1, conversations: { 'a/late': { title: 'the late mount' } } }));   // the index APPEARS
  await o.st.index.update(() => { o.st.index.entry('a', 'n-1').title = 'new'; }, { durable: true }).catch(() => false);
  const held = !!o.st.index.blocked(), during = o.st.index.landed('a/old-1');
  shut(o);
  return { before, held, during };
}
{
  const p1 = await producedLeg(CS, 'produced');
  ok(p1.afterOld === false && p1.afterNew === true, `⑰ (1) a row purged after a whole write was produced and born again before it landed: that landing (the OLD row) leaves it unlanded (${p1.afterOld}); its new line on disk lands it (${p1.afterNew})`, p1);
  const PM = M.load('src/channel-store.js', anchored(SRC, 'unlanded.set(key, ++bornGen); bornSeq.delete(key);', 'unlanded.set(key, unlanded.has(key) ? unlanded.get(key) : ++bornGen); bornSeq.delete(key);', 'the produced set kept at a birth (B-360d found holder 1: a birth that keeps its old generation)'), 'produced-kept');
  const p1r = await producedLeg(PM, 'produced-red');
  ok(p1r.afterOld === true, `⑰ (1) RED CONTROL: the produced set kept at a birth — the old row's landing said the new one landed (${p1r.afterOld}) — the leg above would go red`, p1r);
  const r2 = await rebornLeg(CS, 'reborn');
  ok(r2.afterOld === false && r2.afterNew === true, `⑰ (2) purged and born again with its old line in flight: the old line's sync leaves it unlanded (${r2.afterOld}); the NEW line's lands it (${r2.afterNew})`, r2);
  const RM = M.load('src/channel-store.js', anchored(SRC, 'unlanded.set(key, ++bornGen); bornSeq.delete(key);', 'unlanded.set(key, ++bornGen);', 'the map\'s reset removed'), 'reborn-kept');
  const r2r = await rebornLeg(RM, 'reborn-red');
  ok(r2r.afterOld === true, `⑰ (2) RED CONTROL: the map's reset removed — the OLD line's sync said the reborn row landed (${r2r.afterOld}) — the leg above would go red`, r2r);
  const b = await bootLeg('boot');
  ok(!b.inIndex && b.landed === true, `⑰ (2) THE BOOT: a row only in the journal (not in index.json: ${!b.inIndex}), replayed at a new open, is said landed (${b.landed})`, b);
  const wr = await wholeRoadLeg('whole-road');
  ok(wr.during === false && wr.after === true && wr.lines === 0, `⑰ (2) born rows carried by a WHOLE write (a burst: ${wr.lines} journal lines): unlanded while it is in flight (${wr.during}), landed when it lands (${wr.after})`, wr);
  const od = await orderLeg('order');
  ok(od.rising && od.seqs.length === 3 && od.next === od.seqs[od.seqs.length - 1] + 1, `⑰ (2) THE ORDER across a fold and a compaction: the journal's lines ${JSON.stringify(od.seqs)} all past the index's actsSeq ${od.held}, strictly rising; after a reopen the next is ${od.next}`, od);
  const h = await heldAccessorLeg(CS, 'held-accessor');
  ok(h.before === true && h.held && h.during === false, `⑰ (3) THE HOLD's own guard: a row replayed before the index appeared (landed: ${h.before}) is not said landed once the family is held (${h.during})`, h);
  const HA = M.load('src/channel-store.js', anchored(SRC, '      landed: (key) => !ixLoad.blocked && hasOwn(ix.conversations, key) && !isUnlanded(key),', '      landed: (key) => hasOwn(ix.conversations, key) && !isUnlanded(key),', 'the accessor deaf to the hold'), 'held-accessor-deaf');   // stale-pins: kept (the train's own landed() before the hold, a red control's text)
  const hr = await heldAccessorLeg(HA, 'held-accessor-red');
  ok(hr.during === true, `⑰ (3) RED CONTROL: the accessor deaf to the hold — the replayed row said landed while the family is held (${hr.during}) — the leg above would go red`, hr);
}

// ═══ ⑱ A STAMP WRITTEN INTO A ROW IS HEALED AT THE UPDATE'S END (主开发 r2081) ═══
console.log('⑱ a poll stamp written into the row past the door reaches the stamp journal at the update\'s end');
// INDEX_KEYS omits a row's poll stamps from its printed line, so an update that writes a stamp INTO the row (a write past the
// door: the engine stamps through store.stamps.set) reads as quiet and the row is not serialized until a fold — the update's end
// heals it into the side map and its journal (poll-stamps.log), as the chunk's serializer does. A kill before the fold keeps it.
async function inRowStampLeg(mod, tag) {
  const dir = tmp(tag), o = open(mod, dir), T = Date.UTC(2026, 10, 21, 12, 0, 0);
  await seed(o.st, 20);
  await o.st.index.update(() => { const en = o.st.index.entry('a', 'c3'); en.lane = { ...(en.lane || {}), via: 'poll', lastPollAt: T + 7e3 }; });   // the stamp INTO the row
  const k = kill(dir, tag); shut(o);
  const o2 = open(CS, k); const lp = Number((o2.st.stamps.lane(o2.st.index.peek('a/c3')) || {}).lastPollAt) || 0; shut(o2);
  return { kept: lp === T + 7e3, lp };
}
{
  const r = await inRowStampLeg(CS, 'inrow');
  ok(r.kept, `⑱ a stamp written into a row past the door, then a kill before any fold: the stamp is read back after the restart (${r.lp})`, r);
  const HM = M.load('src/channel-store.js', anchored(SRC, '      if (has) healRow(k, conv[k]);\n', '', 'no heal at the update\'s end'), 'no-heal-end');
  const rr = await inRowStampLeg(HM, 'inrow-red');
  ok(!rr.kept, `⑱ RED CONTROL: the update's end without its heal (line 267 as it stood) — the stamp lost at the kill (${rr.lp}, «never polled») — the leg above would go red`, rr);
  // 主开发 r2287 (2): the update's heals are ONE append to poll-stamps.log, as the load's — five rows stamped past the door in
  // one update: one write of five lines (a burst of such rows was one synchronous append a row, up to the burst's bound in a tick)
  const batchLeg = async (mod, tag) => {
    const dir = tmp(tag), o = open(mod, dir), T = Date.UTC(2026, 10, 21, 12, 0, 0), ids = ['c1', 'c4', 'c7', 'c9', 'c12'];
    await seed(o.st, 20);
    const writes = [], w0 = fs.writeSync;
    fs.writeSync = function (fd, b, ...a) { const x = Buffer.isBuffer(b) ? b.toString('utf8') : String(b); if (/^\n?\["a\//.test(x)) writes.push((x.match(/\["a\//g) || []).length); return w0.call(this, fd, b, ...a); };
    try { await o.st.index.update(() => { for (const id of ids) { const en = o.st.index.entry('a', id); en.lane = { ...(en.lane || {}), via: 'poll', lastPollAt: T + 9e3 }; } }); } finally { fs.writeSync = w0; }
    const taken = ids.every((id) => Number((o.st.stamps.lane(o.st.index.peek('a/' + id)) || {}).lastPollAt) === T + 9e3);
    shut(o);
    return { appends: writes.length, lines: writes.reduce((n, x) => n + x, 0), taken };
  };
  const b1 = await batchLeg(CS, 'inrow-batch');
  ok(b1.appends === 1 && b1.lines === 5 && b1.taken, `⑱ five rows stamped past the door in ONE update: ${b1.appends} append(s) to poll-stamps.log carrying ${b1.lines} line(s); every stamp taken into the side map (${b1.taken})`, b1);
  const BM = M.load('src/channel-store.js', anchored(SRC, '    const healBatch = healing === null; if (healBatch) healing = [];\n', '    const healBatch = false;\n', 'the update\'s heals one append a row'), 'heal-unbatched');
  const b2 = await batchLeg(BM, 'inrow-batch-red');
  ok(b2.appends === 5 && b2.taken, `⑱ RED CONTROL: the update's heals unbatched — ${b2.appends} appends for the same five rows — the leg above would go red`, b2);
}

// ═══ ⑬ (g) THE PANEL'S WARNING (主开发 r2455 (4)): a removal whose journal is owed is SAID to the person — the dialog's branch ═══
console.log('⑬ (g) the account dialog says a removal whose journal is owed (its branch, before the plain «Removed»)');
{
  const DLG = fs.readFileSync(path.join(REPO, 'src/lib/channel-account-dialogs.js'), 'utf8');
  const KEY = 'Removed "{name}" — some of its saved data is not erased from disk yet; it is erased when the disk takes the next write';
  const BR = `  if (r && r.journalOwed) { showToast(tr('${KEY}', { name }), { type: 'warn', duration: 9000 }); return true; }\n`;
  const PLAIN = `  showToast(tr('Removed "{name}"', { name }));\n`;
  const tables = ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf8'));
  const pin = (src) => src.split(BR).length === 2 && src.indexOf(BR) < src.indexOf(PLAIN) && tables.every((t) => t.includes(JSON.stringify(KEY) + ':'));
  ok(pin(DLG), '⑬ (g) the dialog answers journalOwed with its own warning (a warn toast, 9 s) BEFORE the plain «Removed», and its words are in the zh and ja tables');
  ok(!pin(anchored(DLG, BR, '', 'the dialog without its warning')), '⑬ (g) RED CONTROL: the dialog without its journalOwed branch — the pin above would go red');
}

// ═══ ⑲ THE GRANTS MIGRATION's REFUSAL (主开发 r2455 (2)): the file's NAME and the error's CODE — never an fs error's message,
// which carries the data folder's absolute path ═══
console.log('⑲ the grants migration refusing an unreadable index family: its name and its code, no path');
{
  const GMSRC = fs.readFileSync(path.join(REPO, 'src/server/grants-migration.js'), 'utf8');
  const refusal = (mod, tag) => {
    const dir = tmp(tag); fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'channels', 'index.json'), JSON.stringify({ v: 1, conversations: {} }));
    fs.symlinkSync('index-acts.ndjson', path.join(dir, 'channels', 'index-acts.ndjson'));   // a link to itself: ELOOP at its read (an fs error whose message names the path)
    try { mod.plan({ dataDir: dir }); return { msg: null, dir }; } catch (e) { return { msg: String((e && e.message) || e), dir }; }
  };
  const g = refusal(require(path.join(REPO, 'src/server/grants-migration.js')), 'grants-refusal');
  ok(!!g.msg && /data\/channels\/index-acts\.ndjson is unreadable \(ELOOP\)/.test(g.msg) && !g.msg.includes(g.dir), `⑲ an unreadable journal refuses the grants migration by the file's name and the error's code, with no path of the data folder («${(g.msg || '').slice(0, 140)}»)`, g);
  const GR = M.load('src/server/grants-migration.js', anchored(GMSRC, "data/channels/${(e && e.file) || 'index.json'} is unreadable (${(e && e.code) || 'not a whole JSON document'})", "data/channels/${(e && e.file) || 'index.json'} is unreadable (${e.message})", 'the release\'s refusal (the message)'), 'grants-message');   // stale-pins: kept (the red puts the release's refusal back)
  const gr = refusal(GR, 'grants-refusal-red');
  ok(!!gr.msg && gr.msg.includes(gr.dir), '⑲ RED CONTROL: the release\'s refusal (the error\'s message) puts the data folder\'s absolute path into the run\'s words — the leg above would go red', gr);
}

// ── §T THE HEAVY TWIN HOLDS THE MOVED LEGS (主开发 r3921, row B-7e49's form: a leg cannot fall between the two files) ──
// ⑨, ⑮ (2) / (2b) with their three red controls, ⑯ with its red control and ⑬ (c)'s red control moved VERBATIM to the heavy twin
// scripts/test-index-journal-failures.mjs: their seconds are the writer's 1 s failure backoff (⑨, ⑮ (2) / (2b)), fixed waits past
// the journal's 500 ms pace (⑯) and a mutant that prints a row at each of 2000 touches (⑬ (c)). This file runs none of them.
console.log('§T the heavy twin holds ⑨, ⑮ (2) / (2b), ⑯ and ⑬ (c)\'s red control — this file runs none of them');
{
  const twinRel = 'scripts/test-index-journal-failures.mjs';
  const twin = fs.existsSync(path.join(REPO, twinRel)) ? fs.readFileSync(path.join(REPO, twinRel), 'utf8') : '';
  const here = fs.readFileSync(new URL(import.meta.url), 'utf8');
  const MOVED = ['async function lawSix(mod, fault, trunc, tag) {', 'async function lawSixTail(tag) {', "const red = await lawSix(EM, 'enospc', 'eio', 'six-red');",
    'async function failLandLeg(mod, tag, place = {}) {', "await failLandLeg(CS, 'land-fail-late-red', { late: true, fixedWait: true })", "const rf = await failLandLeg(MF, 'land-fail-red');",
    'async function appearLeg(mod, tag) {', "const rd = await appearLeg(DM, 'appear-red');", "const tr3 = await lawThree(TM, 'three-red');"];
  const holds = (t) => MOVED.every((h) => t.includes(h));
  const runsNone = (t) => MOVED.every((h) => t.split(h).length === 2);   // each moved text stands here ONCE: in this list
  ok(holds(twin) && runsNone(here), `§T the heavy twin holds ⑨, ⑮ (2) / (2b), ⑯ and ⑬ (c)'s red control (${MOVED.length} of their texts) — and this file runs none of them`);
  ok(/\{ name: 'test-index-journal-failures', tier: 'heavy',/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8')), '§T the twin is a HEAVY row of the tier');
  ok(!holds(twin.replace(MOVED[7], '')), 'RED CONTROL — a twin that lost ⑯\'s red control no longer holds the moved legs: §T goes red');
  ok(!runsNone(here + '\n' + twin.slice(Math.max(0, twin.indexOf(MOVED[0])))), 'RED CONTROL — this file with the twin\'s ⑨ planted back runs the moved legs again: §T goes red');
}

fs.rmSync(ROOT, { recursive: true, force: true });
report();

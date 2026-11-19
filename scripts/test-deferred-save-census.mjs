#!/usr/bin/env node
// test-deferred-save-census — lane lg-store-writes, B-0248 (主开发 03:00Z: THE CLASS BECOMES A CENSUS, A RED TEST, NOT A HUNT).
// For every store this chain DEFERS (src/store-writer.js writes it later: jobs.json + job-notifications.json, task-groups.json,
// browser-profiles.json — the usage readings went back to their synchronous road, 主开发 2026-11-19 08:56Z), EVERY CALL SITE of its save — found mechanically
// (scripts/deferred-save-census.mjs) — carries ONE verdict of a closed set (scripts/fixtures/deferred-save-verdicts.json):
//   waits — the reply to the person / agent waits for the landing (persisted, onDisk, whenLanded, a removal's landing)
//   rides — what cannot be undone after this save runs in a step riding the landing (store-writer afterLanding / ride)
//   none  — nothing that cannot be undone follows in this run or its reply (why, in six words at most)
//   sync  — this site's save stays synchronous for the release (a bounded landing before what follows)
//   sync-last — «sync, nothing follows» (主开发 09:18Z): a synchronous save that is the last thing its act does (the release's own)
// ① a call site with NO row is RED by name; ② a row whose function no longer calls a save is RED (the list only tells the truth);
// ③ the verdict is of the closed set, `none` says why in ≤ 6 words; ④ the verdict is CHECKED against the code (rides: a ride call
// in the function or at its `at`; sync: a synchronous landing; waits: the waiting door named by `at`); ⑤ RED controls, each
// planted through scratch.mjs anchored(): a new save site, a row taken out, a rides row whose ride call is gone.
// THE CENSUS LEARNS (主开发 2026-11-19 08:56Z, after the hunt over the census found nine): (a) a save call is never its own
// landing — the sync pattern holds no save call (`saveNow`, `_saveNotifs`); (b) a sync or waits row NAMES ITS FAILURE BRANCH
// (`branch`: the text where the landing's answer is tested — in the function, or `file:text` — and `stops`: what it withholds),
// and the suite checks the branch is there, tests a landing's answer and stops what follows (throws, returns, keeps it owed, or
// says not on disk); (c) a rides row says why its loss at a crash is harmless (`crash`) and that no reader of the same run
// depends on what it defers (`readers`); (d) machinery behind a save (a re-merge that reads the file and replays calls) is not a
// call site — the census cannot see it; a unit that brings one names it as a site of its own (kb); (e) a why is the row's OWN
// law — it never borrows another suite's (no suite named in it).
// Run: node scripts/test-deferred-save-census.mjs
import fs from 'node:fs';
import path from 'node:path';
import { deferredSaveSites, siteOfFile, rowKeyOf, judgeRows } from './deferred-save-census.mjs';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();

const ROWS = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/deferred-save-verdicts.json'), 'utf8'));
const judge = (sites, rows) => judgeRows(REPO, sites, rows);

console.log('① ② ③ ④ every call site of a deferred store\'s save carries ONE verdict, checked against the code');
const sites = deferredSaveSites(REPO);
const j = judge(sites, ROWS);
const byStore = {}; for (const s of sites) byStore[s.store] = (byStore[s.store] || 0) + 1;
ok(sites.length > 200 && Object.keys(byStore).length === 3, `the mechanical list: ${sites.length} call sites over the three deferred stores ${JSON.stringify(byStore)}`, byStore);
ok(!j.missing.length, `① every call site has a row (${ROWS.length} rows) — a site with no row is RED by name`, j.missing.slice(0, 20));
ok(!j.dead.length, '② every row names a function that still calls a save — the list only tells the truth', j.dead.slice(0, 20));
ok(!j.bad.length, '③ every verdict is of the closed set (waits / rides / none / sync); «none» says why in six words at most', j.bad.slice(0, 20));
ok(!j.wrong.length, '④ every verdict holds in the code: rides ⇒ a ride call; sync ⇒ a synchronous landing; waits ⇒ its waiting door is in the tree', j.wrong.slice(0, 20));
const tally = {}; for (const r of ROWS) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
console.log('    verdicts: ' + JSON.stringify(tally));

console.log('⑤ RED controls (each plant through anchored())');
{
  // (a) a NEW save site — a copy of src/jobs.js with one more method that saves: its row is missing, by name
  const rel = 'src/jobs.js', src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const A = '  _saveNotifs() {';
  const planted = anchored(src, A, '  zzPlantedSave() { this._save(); }   // CONTROL: a new save site\n' + A, 'a new save site');
  const s2 = sites.filter((s) => s.file !== rel).concat(siteOfFile(REPO, rel, { src: planted }));
  const j2 = judge(s2, ROWS);
  ok(j2.missing.some((k) => /JobManager\.zzPlantedSave · _save\(\)$/.test(k)), 'CONTROL (a new save site in a copy of src/jobs.js): RED by name — its row is missing', j2.missing);
  // (b) a row taken out: its sites are unclaimed
  const gone = ROWS.find((r) => r.verdict === 'rides');
  const j3 = judge(sites, ROWS.filter((r) => r !== gone));
  ok(!!(gone && j3.missing.includes(gone.key)), 'CONTROL (a row taken out of the table): its call site is RED by name', gone && gone.key);
  // (c) a «rides» row whose ride call is gone (a copy of the file with the ride taken out of that function)
  const rideRow = ROWS.find((r) => r.verdict === 'rides' && r.key.startsWith('jobs · src/jobs.js · JobManager.answerPanel'));
  const jsrc = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8');
  const RA = "    this._ride(this.file, 'the panel\\'s answer', () => {";
  const unridden = anchored(jsrc, RA, "    ((f, w, step) => step())(this.file, 'the panel\\'s answer', () => {   // CONTROL: the step at the act", 'the panel\'s answer rides the landing');
  const s4 = sites.filter((s) => s.file !== 'src/jobs.js').concat(siteOfFile(REPO, 'src/jobs.js', { src: unridden }));
  const j4 = judge(s4, ROWS);
  ok(!!(rideRow && j4.wrong.some((w) => w.startsWith(rideRow.key))), 'CONTROL (a «rides» row whose function lost its ride call): ④ is RED by name', j4.wrong.slice(0, 3));
  // (d) THE CENSUS LEARNS (b): a «sync» row whose failure branch is gone — a copy of the keeper whose start lands its record
  // and IGNORES the answer — is RED by name (a landing whose answer nobody reads holds nothing)
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const KB = "      if (!commitSync()) throw failed('launch_not_on_disk', LAUNCH_NOT_ON_DISK);";
  const ignored = anchored(ksrc, KB, "      commitSync();   // CONTROL: the landing's answer ignored", 'the start\'s failure branch');
  const s5 = sites.filter((s) => s.file !== 'src/server/browser-keeper.js').concat(siteOfFile(REPO, 'src/server/browser-keeper.js', { src: ignored }));
  const j5 = judge(s5, ROWS);
  ok(j5.wrong.some((w) => w.startsWith('browser-keeper · src/server/browser-keeper.js · create > start · commitSync()') && /\(b\)/.test(w)), 'CONTROL (b) (a «sync» row whose failure branch is gone — the landing\'s answer ignored): RED by name', j5.wrong.slice(0, 3));
  // (e) THE CENSUS LEARNS (c) and (e): a «rides» row without its crash / readers reasons, and a why that borrows a suite's law
  const r6 = ROWS.map((r) => (r === rideRow ? { ...r, crash: '', readers: '' } : r.verdict === 'none' && r === ROWS.find((x) => x.verdict === 'none') ? { ...r, why: 'as test-something says' } : r));
  const j6 = judge(sites, r6);
  ok(j6.bad.some((b) => b.startsWith(rideRow.key) && /\(c\)/.test(b)), 'CONTROL (c) (a «rides» row that does not say why its loss at a crash is harmless): RED by name', j6.bad.slice(0, 3));
  ok(j6.bad.some((b) => /borrows a suite's law/.test(b)), 'CONTROL (e) (a why that names a suite): RED by name', j6.bad.slice(0, 3));
}

report();

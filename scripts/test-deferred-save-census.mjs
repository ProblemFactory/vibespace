#!/usr/bin/env node
// test-deferred-save-census — lane lg-store-writes, B-0248 (主开发 03:00Z: THE CLASS BECOMES A CENSUS, A RED TEST, NOT A HUNT).
// For every store this chain DEFERS (src/store-writer.js writes it later: jobs.json + job-notifications.json, task-groups.json,
// browser-profiles.json, the usage readings and their sidecars), EVERY CALL SITE of its save — found mechanically
// (scripts/deferred-save-census.mjs) — carries ONE verdict of a closed set (scripts/fixtures/deferred-save-verdicts.json):
//   waits — the reply to the person / agent waits for the landing (persisted, onDisk, whenLanded, a removal's landing)
//   rides — what cannot be undone after this save runs in a step riding the landing (store-writer afterLanding / ride)
//   none  — nothing that cannot be undone follows in this run or its reply (why, in six words at most)
//   sync  — this site's save stays synchronous for the release (a bounded landing before what follows)
// ① a call site with NO row is RED by name; ② a row whose function no longer calls a save is RED (the list only tells the truth);
// ③ the verdict is of the closed set, `none` says why in ≤ 6 words; ④ the verdict is CHECKED against the code (rides: a ride call
// in the function or at its `at`; sync: a synchronous landing; waits: the waiting door named by `at`); ⑤ RED controls, each
// planted through scratch.mjs anchored(): a new save site, a row taken out, a rides row whose ride call is gone.
// Run: node scripts/test-deferred-save-census.mjs
import fs from 'node:fs';
import path from 'node:path';
import { deferredSaveSites, siteOfFile, rowKeyOf } from './deferred-save-census.mjs';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();

const VERDICTS = new Set(['waits', 'rides', 'none', 'sync']);
const RIDE_RE = /\b(?:_ride|rideLanding|ride|afterLanding|afterNotifsLanded|afterLanded)\(/;
const SYNC_RE = /\b(?:landNow|_onDisk|_landNow|flushSync|saveNow|_saveNotifs|commitSync)\(/;
const ROWS = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/deferred-save-verdicts.json'), 'utf8'));

/** the census's judgement of a site list against the rows → {missing, dead, bad, wrong} (each a list of keys / reasons) */
function judge(sites, rows) {
  const byKey = new Map();
  for (const s of sites) { const k = rowKeyOf(s); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(s); }
  const rowOf = new Map(rows.map((r) => [r.key, r]));
  const missing = [...byKey.keys()].filter((k) => !rowOf.has(k));
  const dead = rows.filter((r) => !byKey.has(r.key)).map((r) => r.key);
  const bad = [], wrong = [];
  for (const r of rows) {
    if (!VERDICTS.has(r.verdict)) { bad.push(`${r.key}: «${r.verdict}» is not a verdict (waits / rides / none / sync)`); continue; }
    const why = String(r.why || '').trim();
    if (!why) bad.push(`${r.key}: no why`);
    if (r.verdict === 'none' && why.split(/\s+/).length > 6) bad.push(`${r.key}: «none» says why in six words at most («${why}»)`);
    const s = byKey.get(r.key); if (!s) continue;
    const text = s.map((x) => x.fnText).join('\n');
    const atOk = () => { const [f, ...rest] = String(r.at || '').split(':'); const needle = rest.join(':'); try { return !!f && !!needle && fs.readFileSync(path.join(REPO, f), 'utf8').includes(needle); } catch { return false; } };
    if (r.verdict === 'rides' && !(RIDE_RE.test(text) || (r.at && atOk()))) wrong.push(`${r.key}: «rides» but its function has no ride call${r.at ? ` and «${r.at}» is not in the tree` : ''}`);
    if (r.verdict === 'sync' && !(SYNC_RE.test(text) || (r.at && atOk()))) wrong.push(`${r.key}: «sync» but its function has no synchronous landing${r.at ? ` and «${r.at}» is not in the tree` : ''}`);
    if (r.verdict === 'waits' && !(r.at && atOk())) wrong.push(`${r.key}: «waits» names no door that waits («at»: file:fixed text${r.at ? ` — «${r.at}» is not in the tree` : ''})`);
  }
  return { missing, dead, bad, wrong };
}

console.log('① ② ③ ④ every call site of a deferred store\'s save carries ONE verdict, checked against the code');
const sites = deferredSaveSites(REPO);
const j = judge(sites, ROWS);
const byStore = {}; for (const s of sites) byStore[s.store] = (byStore[s.store] || 0) + 1;
ok(sites.length > 200 && Object.keys(byStore).length === 4, `the mechanical list: ${sites.length} call sites over the four deferred stores ${JSON.stringify(byStore)}`, byStore);
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
  const rideRow = ROWS.find((r) => r.verdict === 'rides' && r.key.startsWith('task-groups · src/task-groups.js · TaskGroupManager.remove'));
  const tsrc = fs.readFileSync(path.join(REPO, 'src/task-groups.js'), 'utf8');
  const RA = "    require('./store-writer.js').ride(this._writer(), this._file, () => {";
  const unridden = anchored(tsrc, RA, "    ((w, f, step) => step())(this._writer(), this._file, () => {   // CONTROL: the step at the act", 'the group removal rides the landing');
  const s4 = sites.filter((s) => s.file !== 'src/task-groups.js').concat(siteOfFile(REPO, 'src/task-groups.js', { src: unridden }));
  const j4 = judge(s4, ROWS);
  ok(!!(rideRow && j4.wrong.some((w) => w.startsWith(rideRow.key))), 'CONTROL (a «rides» row whose function lost its ride call): ④ is RED by name', j4.wrong.slice(0, 3));
}

report();

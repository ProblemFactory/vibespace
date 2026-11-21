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
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
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

console.log('⑥ THE THREE RULES OF THE LAST HUNT (主开发 2026-11-19 19:44Z) — each a standing guard, each with its RED control');
{
  /** a method's text: from `  name(` to the next method head at the same indent (a class body) */
  const methodText = (src, name) => { const a = src.indexOf(`\n  ${name}(`); if (a < 0) return ''; const rest = src.slice(a + 1); const m = /\n  (?:async )?[A-Za-z_$][\w$]*\([^\n]*\) \{[^\n]*\n/.exec(rest.slice(5)); return m ? rest.slice(0, m.index + 5) : rest; };
  /** an object-literal verb's text: from `'name':` to the next verb key at the same indent */
  const verbText = (src, name) => { const a = src.indexOf(`'${name}':`); if (a < 0) return ''; const rest = src.slice(a); const m = /\n    '[a-z.]+':/.exec(rest.slice(5)); return m ? rest.slice(0, m.index + 5) : rest; };
  const JOBS = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8');
  // R1 — A NOTICE STASHED ANYWHERE MARKS ITS STORE URGENT AT THE STASH (findings 1, 2): ONE place, no caller remembers to. Every
  // function that puts notices into pendingNotifs either IS the stash (it marks), lands them itself, or is the load of the file
  const STASH_EXEMPT = { _notifsFrom: 'the load of the file itself (the boot, a held file read again): nothing new to write' };
  const rule1 = (src) => {
    const bad = [];
    const st = methodText(src, '_stashNotif'), ur = methodText(src, '_notifsUrgent');
    if (!/this\._notifsUrgent\(\);/.test(st)) bad.push('_stashNotif does not mark the notifications store urgent (this._notifsUrgent())');
    if (!/dirty\(this\.notifsFile, \{[^}]*rank: 0, urgent: true/.test(ur)) bad.push('_notifsUrgent does not hand job-notifications.json to the writer at rank 0, urgent');
    for (const m of src.matchAll(/\n  (?:async )?([A-Za-z_$][\w$]*)\([^\n]*\) \{[^\n]*\n/g)) {
      const name = m[1], t = methodText(src, name);
      if (!/this\.pendingNotifs\.set\(/.test(t) || name === '_stashNotif' || STASH_EXEMPT[name]) continue;
      if (!/this\._notifsUrgent\(\)|this\._saveNotifs\(\)|this\._stashNotif\(/.test(t)) bad.push(`${name} puts notices into pendingNotifs with no urgent mark, no landing of its own and no stash`);
    }
    return bad;
  };
  const r1 = rule1(JOBS);
  ok(!r1.length, 'R1 a notice stashed anywhere marks its store urgent AT THE STASH — _stashNotif marks (rank 0, urgent); every other filler of pendingNotifs lands, stashes, or is the load', r1);
  const r1x = rule1(anchored(JOBS, '    this._notifsUrgent();   // THE STASH MARKS ITS STORE URGENT', '    // CONTROL: no urgent mark   // THE STASH MARKS ITS STORE URGENT', 'the stash marks its store'));
  ok(r1x.some((x) => /_stashNotif does not mark/.test(x)), 'CONTROL R1 (a stash without its urgent mark): RED by name', r1x);
  // R2 — A FILE ANOTHER PROCESS READS IS WRITTEN FIRST AND AT ONCE, THE RECORD AFTER (findings 7, 8; the release is the oracle): the
  // job wrapper tails answers.jsonl — every append to it comes before its function's record (this._save) and outside every riding step
  const OTHERS_READ = [{ file: 'answers.jsonl', reader: 'the job wrapper (data/bin/job-wrapper.js tails it)' }];
  const rule2 = (src) => {
    const bad = [];
    for (const { file } of OTHERS_READ) {
      for (const m of src.matchAll(/\n  (?:async )?([A-Za-z_$][\w$]*)\([^\n]*\) \{[^\n]*\n/g)) {
        const name = m[1], t = methodText(src, name);
        const w = t.indexOf(`'${file}'`); if (w < 0) continue;
        const sv = t.indexOf('this._save('), rd = t.indexOf('this._ride(');
        if (sv >= 0 && w > sv) bad.push(`${name}: ${file} is written AFTER the record's save`);
        if (rd >= 0 && w > rd) bad.push(`${name}: ${file} is written inside (or after) a step riding the landing`);
      }
    }
    return bad;
  };
  const r2 = rule2(JOBS);
  ok(!r2.length && /'answers\.jsonl'/.test(methodText(JOBS, 'answerPanel')) && /'answers\.jsonl'/.test(methodText(JOBS, 'withdrawAsk')), 'R2 a file another process reads (answers.jsonl, the wrapper\'s) is written FIRST and at once — before the record and outside every riding step (answerPanel, withdrawAsk)', r2);
  const AP = "    if (ctl) { try { fs.appendFileSync(path.join(ctl, 'answers.jsonl'), JSON.stringify(rec) + '\\n'); } catch { } } // mirror to the wrapper's answers tail file\n";
  const RIDE_AP = "    this._ride(this.file, 'the panel\\'s answer', () => {\n";
  const r2x = rule2(anchored(anchored(JOBS, AP, '', 'the answer written first'), RIDE_AP, RIDE_AP + AP.replace('    if', '      if'), 'the answer\'s riding step'));
  ok(r2x.some((x) => /^answerPanel: answers\.jsonl is written (AFTER|inside)/.test(x)), 'CONTROL R2 (the answer written inside the riding step — the chain\'s order): RED by name', r2x);
  // R3 — A REPLY AFTER ITS LANDING (finding 4): an automation verb that writes a Task Group membership answers once task-groups.json
  // holds it (bindLanded) or says notOnDisk — conversations.open with a group and conversations.bind
  const OPS = fs.readFileSync(path.join(REPO, 'src/server/conversation-ops.js'), 'utf8');
  const rule3 = (src) => ['conversations.open', 'conversations.bind'].filter((v) => { const t = verbText(src, v); return !(/await O\(\)\.bindLanded\(\)/.test(t) && /notOnDisk: true/.test(t)); });
  const r3 = rule3(OPS);
  ok(!r3.length, 'R3 a reply after its landing — conversations.open (with a group) and conversations.bind answer once the bind is on disk, or say notOnDisk', r3);
  const OPEN_L = "      const saved = spec.taskId && typeof O().bindLanded === 'function' ? await O().bindLanded() : true;\n";
  const r3x = rule3(anchored(OPS, OPEN_L, "      const saved = true;   // CONTROL: the reply before the landing\n", 'the open waits for its bind'));
  ok(r3x.includes('conversations.open'), 'CONTROL R3 (an open answered before its bind lands): RED by name', r3x);
}

report();

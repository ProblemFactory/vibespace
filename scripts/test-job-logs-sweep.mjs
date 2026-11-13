#!/usr/bin/env node
// test-job-logs-sweep — lane job-logs-sweep (2026-11-12; split in round 3 §9): THE PURE half, fast — the verdict over a run
// directory (src/job-logs-sweep.js runVerdict) as a table + its mutant copies, the keep set's shapes, the words, and the STATIC
// census of src/jobs.js / the child / the wiring / the routes / the CLI / the panel / the setting. Every leg that forks the
// remover's child, runs the real job wrapper or kills a hub is scripts/test-job-logs-sweep-heavy.mjs (heavy).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let LS = null; try { LS = require(path.join(ROOT, 'src/job-logs-sweep.js')); } catch { /* the release: no remover — its legs are red by name */ }
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-jls-pure-'));
const lap = (name) => console.log(name);
try {
  // ── §A THE PURE VERDICT (src/job-logs-sweep.js runVerdict) ────────────────────────────────────────────────────────────
  lap('§A the verdict');
  ok(!!LS && typeof LS.runVerdict === 'function', 'src/job-logs-sweep.js: THE verdict over a run directory exists');
  const ROWS = [
    [{ listed: true, startMs: 1, newestMs: 1, alive: false }, 'listed', 'a run a record lists stays, however old'],
    [{ held: true, startMs: 1, newestMs: 1, alive: false }, 'held', 'a run the hub holds work for (a scope reap) stays'],
    [{ skeleton: true, startMs: 1, newestMs: 1, alive: false }, 'skeleton', 'a skeleton record\'s dir stays (its runs [] were never its runs)'],
    [{ startMs: 200, newestMs: 1, alive: false }, 'young', 'a run that STARTED after the cutoff is young by its name'],
    [{ startMs: 1, newestMs: 150, alive: false }, 'young', 'a run that started long ago but wrote within the retention is young (its NEWEST file is its age)'],
    [{ startMs: 1, newestMs: 1, alive: true }, 'alive', 'a run whose wrapper lives stays'],
    [{ startMs: 1, newestMs: 1, alive: null }, 'unproven', 'a stamp that cannot be judged keeps its run'],
    [{ startMs: 1, newestMs: 1, alive: false }, 'remove', 'unlisted, past the retention by its newest file, its wrapper gone ⇒ removed'],
  ];
  const table = (V) => ROWS.map(([r, want]) => V({ cutoff: 100, ...r }) === want);
  if (LS) ROWS.forEach(([, want, name], i) => ok(table(LS.runVerdict)[i], `verdict: ${name} (${want})`));
  if (LS) {
    let thunks = 0; LS.runVerdict({ cutoff: 100, startMs: 200, newestMs: () => { thunks++; return 1; }, alive: () => { thunks++; return false; } });
    LS.runVerdict({ cutoff: 100, listed: true, startMs: 1, newestMs: () => { thunks++; return 1; }, alive: () => { thunks++; return false; } });
    ok(thunks === 0, 'the verdict reads no disk and no /proc for a run its name or its record already decides');
    // MUTANT COPIES: the module text patched, compiled at a scratch path, the same table RED
    const src = fs.readFileSync(path.join(ROOT, 'src/job-logs-sweep.js'), 'utf8');
    const mutant = (label, from, to) => {
      ok(src.includes(from), `mutant «${label}»: its anchor is in the module`);
      const f = path.join(tmp, `mut-${label.replace(/\W+/g, '-')}.cjs`); fs.writeFileSync(f, src.replace(from, to).replace(/require\('\.\//g, `require('${ROOT}/src/`));
      const V = require(f).runVerdict; ok(table(V).some((x) => !x), `CONTROL: the verdict with «${label}» fails the table`);
    };
    mutant('alive ignored', "if (alive === true) return 'alive';", '');
    mutant('age by the start', "if (!(Number(newest) < r.cutoff)) return 'young';", '');
    mutant('listed ignored', "if (r.listed) return 'listed';", '');
    mutant('unproven removed', "if (alive !== false) return 'unproven';", '');
  }

  // ── THE KEEP SET's SHAPES (round 3 §3, the pure half): a record whose `runs` is not a list keeps every dir of its job, said ───
  lap('§K the keep set');
  if (LS) {
    const k = LS.keepSetOf({ jobs: [{ id: 'jb-a1', runs: [{ startedAt: 5 }, null, 7] }, { id: 'jb-a2', runs: { x: 1 } }, { id: 'jb-a3', runs: 9 }, { id: 'jb-a4', runs: 'x' }, { id: 'jb-a5' }], archive: [{ id: 'jb-a6', runs: [{ startedAt: 1 }] }], held: ['jb-a1/9', 3] });
    ok(k.listed.join() === 'jb-a1/5,jb-a6/1' && k.skeleton.join() === 'jb-a2,jb-a3,jb-a4' && k.unreadable.join() === 'jb-a2,jb-a3,jb-a4' && k.named.length === 6 && k.held.join() === 'jb-a1/9', 'keepSetOf: listed runs only from lists of objects; `runs` an object / a number / a string ⇒ the job kept whole and named unreadable; a non-string held key dropped');
    let threw = null; try { LS.keepSetOf({ jobs: 'nope', archive: { a: 1 }, held: null }); } catch (e) { threw = e; }
    ok(!threw, 'keepSetOf never throws on a shape it cannot read');
    const st = LS.words.start({ counted: 600, max: 500, gapMs: 30000 }), dn = LS.words.done({ removed: 540, entries: 2160, jobDirs: 3, kept: 60, passes: 2, startedAt: 'not a time' });
    ok(/^\[jobs\] job-logs catch-up: 600 run dir\(s\) that started more than 14 days ago and no record lists/.test(st) && /540 run dir\(s\) removed \(2,160 entries\) and 3 job dir\(s\) no record names; 60 kept/.test(dn) && /since an earlier boot$/.test(dn), 'the words: the start counts by name, the done line names the same run dirs (removed + kept) and tolerates an odd start instant');
  } else ok(false, 'the keep set and the words (no remover on this tree)');
  // ── THE STATIC CENSUS OF jobs.js ───────────────────────────────────────────────────────────────────────────────────────
  lap('§S static');
  const JS = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8');
  ok(!/\bfs\.(rmSync|rmdirSync|unlinkSync|promises\.rm)\([^)]*logsDir/.test(JS) && !/rmSync\(/.test(JS), 'jobs.js removes nothing under job-logs itself (no rmSync left): every removal is the remover\'s');
  const wholeSites = (JS.replace(/async _logsPass\([\s\S]*?\n  \}\n/, '').replace(/async _logsOwedWhilePaused\([\s\S]*?\n  \}\n/, '').match(/this\._logsWhole\(/g) || []).length;   // the re-sends of what is owed (the pass's, the pause's) are not verdicts
  ok(wholeSites === 4, 'the whole-dir verdicts reach the remover at exactly four sites (the gc\'s two legs, the archive cap, the ✕, the boot collapse)', wholeSites);
  const WW = fs.readFileSync(path.join(ROOT, 'src/server/jobs-wiring.js'), 'utf8'), AR = fs.readFileSync(path.join(ROOT, 'src/agent-routes.js'), 'utf8'), CLI = fs.readFileSync(path.join(ROOT, 'data/bin/vibespace-job'), 'utf8'), PANEL = fs.readFileSync(path.join(ROOT, 'src/lib/jobs-panel.js'), 'utf8');
  const ROUTE = '.then((v) => res.json({ success: true, ...r, ...(v.gone ? {} : v.kept && v.kept !== \'pending\' ? { logsKept: v.kept } : { logsPending: true }) }))';
  ok(WW.includes('jm.logsGone(rec.id)' + ROUTE) && AR.includes('a.jm.logsGone(arc.id)' + ROUTE), 'both ✕ routes (the owner\'s and the agent\'s) answer after logsGone: gone, or what stays and why (`logsKept`), or `logsPending`');
  ok(/if \(rmAns && rmAns\.logsPending\) \{[^\n]*\n\s*console\.log\('removed — its log files are still being deleted in the background'\);/.test(CLI) && /rmAns\.logsKept === 'running'\) \{[^\n]*\n\s*console\.log\('removed — one of its runs is still running; its log files are deleted 14 days after it ends'\);/.test(CLI) && /logsKept === 'unjudgeable'\) showToast/.test(PANEL) && /act === 'rm' && r\?\.logsPending\) showToast\(t\('Removed\. Its log files are still being deleted in the background\.'\)\)/.test(PANEL), 'what the person reads past the bound: the panel\'s toast «Removed. Its log files are still being deleted in the background.», the CLI\'s «removed — its log files are still being deleted in the background»');
  ok(!/_loadArchive\(/.test((JS.match(/async _logsPass\([\s\S]*?\n  \}\n/) || [''])[0]) && /async _logsPass\(/.test(JS), 'the pass never calls _loadArchive (its synchronous read): the archive from memory, or the worker reads it');
  const WK = (() => { try { return fs.readFileSync(path.join(ROOT, 'src/job-logs-sweep-worker.js'), 'utf8'); } catch { return ''; } })();
  ok(/if \(typeof process\.send !== 'function'\) throw/.test(WK) && /lstatSync/.test(WK) && !/statSync\(/.test(WK.replace(/lstatSync/g, '')), 'the remover\'s child throws without its IPC channel (never in the hub\'s process) and calls no stat that follows a link (that a link is never FOLLOWED is §G\'s legs, driven)');


  // the static census, stronger (round 2 §4f)
  {
    // f. §S, stronger: every removal call of jobs.js is a listed site; no alias of a removing fs call; the record never written by hand
    const JS4 = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    const REMOVALS_OK = ['fs.renameSync(file', 'fs.renameSync(tmp', 'fs.unlinkSync(path.join(dir', 'fs.unlinkSync(specPath', 'fs.unlinkSync(this.lockFile'];
    const removals = [...JS4.matchAll(/fs\.(?:unlink|rm|rmdir|rename)Sync\(\s*[^,)]*|fs\.promises\.(?:rm|unlink|rmdir|rename)\(\s*[^,)]*/g)].map((m) => m[0]);
    const strangers = removals.filter((r) => !REMOVALS_OK.includes(r));
    ok(removals.length === 6 && !strangers.length, `jobs.js's removal calls are exactly the listed six (the set-aside rename of a store, the atomic writes' renames, the spill files, a failed spawn's own spec, the lock) — none under job-logs by another helper${strangers.length ? ': ' + strangers.join(' | ') : ''}`);
    ok(!/=\s*fs\.(?:unlink|rm|rmdir|rename|write\w*|append\w*)Sync\b(?!\s*\()/.test(JS4) && !/\{[^}]*\b(?:unlinkSync|rmSync|rmdirSync|renameSync)\b[^}]*\}\s*=\s*(?:require\(['"](?:node:)?fs['"]\)|fs)\b/.test(JS4), 'no alias of a removing or writing fs call in jobs.js');
    const saveBody = (JS4.match(/  _logsSave\(\) \{[\s\S]*?\n  \}\n/) || [''])[0];
    ok(saveBody && !/\bfs\.|writeJsonAtomic/.test(saveBody) && !/(?:writeJsonAtomic|writeFileSync|appendFileSync|renameSync|copyFileSync)\([^)]*logsSweepFile/.test(JS4), 'the catch-up record is written by the store writer alone: _logsSave holds no fs call, and no write anywhere names its file');
  }
  // the pause: one schema row and its reader
  {
    const SCH = fs.readFileSync(path.join(ROOT, 'src/lib/settings-schema.js'), 'utf8'), WIR = fs.readFileSync(path.join(ROOT, 'src/server/jobs-wiring.js'), 'utf8');
    ok(/'jobs\.logsSweep': \{\n\s*type: 'boolean', default: true,/.test(SCH) && /logsSweepOn: \(\) => \{ try \{ return serverSetting\('jobs\.logsSweep'\) !== false; \}/.test(WIR), 'the pause is ONE schema row (boolean, default on) and its reader in jobs-wiring');
    ok(!/4 \* cfg\.timeoutMs/.test(fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8')), 'the counting pass has the normal timeout (past B it reads directories only)');
  }
  // round 4
  {
    const JS5 = fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    const held = (JS5.match(/  _logsHeldFile\(file, e, what, exists\) \{[\s\S]*?\n  \}\n/) || [''])[0];
    ok(held && !/readdirSync|writeFileSync|existsSync|statSync/.test(held) && /this\._logsNoteOwed\[what\] = /.test(held), 'round 4 §3: a failed load\'s branch on the MAIN THREAD lists nothing, writes no note and checks no existence a second time — the hold is set there, the note is the child\'s');
    const pass = (JS5.match(/  async _logsPass\(at, why\) \{[\s\S]*?\n  \}\n/) || [''])[0];
    const iHold = pass.indexOf('return this._logsHeldUnnoted(cfg)'), iOwed = pass.indexOf('await this._logsWhole([...this._logsOwed])'), iWalk = pass.indexOf('this._logsRemover().sweep(');
    ok(iHold > 0 && iOwed > iHold && iWalk > iHold, 'round 4 §1: the pass answers HELD for a note not on disk BEFORE the owed re-send and before the walk');
    if (LS) {
      const fw = (op, requeued) => LS.words.failed({ op, error: 'no answer in 2 s', requeued });
      ok(/queued again$/.test(fw('whole', true)) && !/queued again/.test(fw('sweep', false)) && /not repeated before the pass's rest/.test(fw('sweep', false)) && !/queued again/.test(fw('state', false)) && !/queued again/.test(fw('whole', false)), 'round 4 §3: «queued again» only for a whole-dir batch that IS queued again; a cut sweep waits for its pass\'s rest');
      ok(!!LS.NOTE_NAME && typeof LS.whenOf === 'function' && LS.NOTE_NAME.test('jobs.json.corrupt-unread') && LS.NOTE_NAME.test('jobs-archive.json.corrupt-unread') && !LS.NOTE_NAME.test('jobs.json.corrupt-unread-1700000000000') && !LS.NOTE_NAME.test('../jobs.json.corrupt-unread') && /^\d{4}-\d\d-\d\d \d\d:\d\d UTC$/.test(LS.whenOf(1794500000000)), 'round 4 §2: ONE note name per store (`<store>.corrupt-unread`, no moment in it, no path), and the failure\'s moment in words that need no translation');
    }
  }
  // .399 K7 + K10 (the .398 merged-tip read): the words that lift a hold say what the lift lets the clean-up remove; the notices put
  // no English fragment inside zh / ja text (the moment an INSTANT, every cause WORDS with dictionary rows)
  {
    const M = require(path.join(ROOT, 'src/job-model.js'));
    const zhT = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-zh.js'), 'utf8'), jaT = fs.readFileSync(path.join(ROOT, 'src/lib/i18n-ja.js'), 'utf8');
    const rowOf = (txt, k) => { const m = txt.match(new RegExp('^  ' + JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': (".*"),$', 'm')); return m ? JSON.parse(m[1]) : null; };
    const lift = ['store-corrupt', 'records-held', 'records-unread', 'set-aside-other'].map((k) => [k, M.forYouCopy(null, k, { file: 'jobs.json.corrupt-1', store: 'jobs.json', note: 'jobs.json.corrupt-unread', error: 'EIO', when: 1794500000000 })]);
    ok(lift.every(([, c]) => c.words && /removed 14 days after their newest file/.test(c.words.key)), 'K7: every item that tells a person to move a held file says what moving it lets the clean-up remove (14 days after the newest file)', lift.filter(([, c]) => !/removed 14 days/.test(c.words.key)).map(([k]) => k));
    const ru = M.forYouCopy(null, 'records-unread', { store: 'jobs.json', note: 'n', error: 'ETIMEDOUT', when: 1794500000000 }).words.params;
    const ru0 = M.forYouCopy(null, 'records-unread', { store: 'jobs.json', note: 'n', error: 'see the note', when: null }).words.params;
    const odd = M.forYouCopy(null, 'records-unread-unnoted', { store: 'jobs.json', error: 'EWHATEVER', when: 5 }).words.params;
    const sr = M.forYouCopy(null, 'sweep-record-unread', { file: 'jobs-logs-sweep.json', error: 'did not parse; set-aside refused: EACCES' }).words.params;
    ok(ru.when.at === 1794500000000 && ru.error.key === 'the storage did not answer in time (ETIMEDOUT)' && ru0.when.key === M.RECORDS_WHEN_UNKNOWN && ru0.error.key === 'the reason is in the note' && odd.error.key === M.RECORDS_ERROR_OTHER && odd.error.params.code === 'EWHATEVER' && sr.error.key === 'its contents are not valid JSON', 'K10: the failure\'s moment is an INSTANT ({at} — the reader\'s clock and zone), an unknown moment and every cause are WORDS — never a string the server wrote in English');
    const keys = [...Object.values(M.RECORDS_ERROR_WORDS || {}), ...(M.RECORDS_ERROR_OTHER ? [M.RECORDS_ERROR_OTHER, M.RECORDS_WHEN_UNKNOWN] : ['(the release has no word table)']), ...['records-unread', 'records-unread-unnoted', 'sweep-record-unread', 'store-corrupt', 'records-held', 'set-aside-other'].map((k) => M.FOR_YOU_WORDS[k])];
    const missing = keys.filter((k) => !rowOf(zhT, k) || !rowOf(jaT, k));
    ok(!missing.length, `K10: every key those notices say (${keys.length}) has its zh and its ja row`, missing);
    const say = (txt, w) => String(rowOf(txt, w.key) || w.key).replace(/\{(\w+)\}/g, (m, k) => { const v = w.params && w.params[k]; return v === undefined ? m : v && typeof v === 'object' ? (typeof v.key === 'string' ? say(txt, v) : '11-12 14:03') : String(v); });
    const zh = ['records-unread', 'records-unread-unnoted'].flatMap((k) => [say(zhT, M.forYouCopy(null, k, { store: 'jobs.json', note: 'jobs.json.corrupt-unread', error: 'EIO', when: 1794500000000 }).words), say(zhT, M.forYouCopy(null, k, { store: 'jobs.json', note: 'jobs.json.corrupt-unread', error: 'see the note', when: null }).words)]);
    ok(zh.every((x) => !/\b(?:earlier|UTC|unknown|error|note|could|read|the)\b/i.test(x)), 'K10: said in zh, those notices hold no English word — only the file names and the code in its words\' parentheses', zh.filter((x) => /\b(?:earlier|UTC|unknown|error|note|could|read|the)\b/i.test(x)));
    const { fillWords } = require(path.join(ROOT, 'src/user-todos.js'));
    ok(typeof fillWords === 'function' && fillWords({ key: 'read ({when}: {error})', params: { when: { at: Date.UTC(2026, 10, 12, 14, 3) }, error: { key: 'an error ({code})', params: { code: 'EX' } } } }) === 'read (2026-11-12 14:03 UTC: an error (EX))', 'K10: the store\'s English text says an INSTANT as a UTC stamp (it said «undefined») and fills a WORDS param\'s own params');
  }
} catch (e) {
  fail++; console.error('  ✗ the suite threw — ' + (e && e.stack || e));
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
}
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// test-stop-scan — row B-d8f4 unit 4b (lane bl-jobs; B-7ca1's round wx6uigysg, should (8)): the job wrapper's ESCAPEE SCAN
// (data/bin/job-wrapper.js escapedOf — what left the job's group and still carries its mark) has three laws no leg drove:
//   THE CUT: the scan is bounded (250 ms) — a cut scan says so, and what it did not read is neither stopped nor counted;
//   NEWEST FIRST: it reads the newest pid first, so an escapee (started after the wrapper) is found inside the bound on a busy machine;
//   THE D-STATE SKIP: a process in uninterruptible sleep is skipped — its environ read would take its memory map's lock and hold the stop.
// PURE: the function's OWN TEXT (keptAncestors … escapedOf, cut from the wrapper) run in-process on a PLACED /proc — its fs, its stat read,
// its clock handed in (a clock that moves 1 ms a stat read makes the 250 ms bound land at a counted read). Each law with its RED: the same
// text patched (an anchored copy), the same placed /proc.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchored } from './scratch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1200) : '')); } };
const okP = (c, n, facts) => { ok(c, n, facts); if (c) console.log('    ' + JSON.stringify(facts)); };
const WRAP = fs.readFileSync(path.join(ROOT, 'data/bin/job-wrapper.js'), 'utf8');
/** the scan's own text: from keptAncestors to the drain that calls it — RED by name if the wrapper's shape moved */
const scanOf = (src) => {
  const a = src.indexOf('function keptAncestors() {'), b = src.indexOf('async function drainGroup() {');
  if (a < 0 || b < a || !src.slice(a, b).includes('function escapedOf()')) throw new Error('ANCHOR GONE: the wrapper\'s scan (keptAncestors … escapedOf … drainGroup) — move this suite with it');
  return src.slice(a, b);
};
/** B-d8f4 (主开发 r2215): the scan reads the shipped twin's ONE rule, envOf (the engine's membersOf reads the same text) — taken from the
 *  same source as the scan and run over the same placed fs; RED by name if the twin moved */
const envOfText = (src) => { const a = src.indexOf('function envOf(root, pid, rest) {'), b = a < 0 ? -1 : src.indexOf('\n// ── SHIPPED TWIN (B-c134) END ──', a); if (a < 0 || b < a) throw new Error('ANCHOR GONE: the twin\'s envOf (B-d8f4, r2215) — move this suite with it'); return src.slice(a, b); };
const build = (src) => new Function('fs', 'statOf', 'MARK', 'MARK_RUN', 'stamp', 'process', 'keptTest', 'keptOutHere', 'Date', envOfText(src) + '\n' + scanOf(src) + '\nreturn escapedOf;');
const WPID = 4000, START = 1000, MARK = 'VIBESPACE_JOB_MARK=jb-5ca0001', MARK_RUN = 'VIBESPACE_JOB_RUN=7';
/** a /proc/<pid>/stat as the wrapper splits it after «) »: [state, ppid, pgrp, …, starttime at 19] */
const statRow = (state, pgrp, start) => { const a = Array(22).fill('0'); a[0] = state; a[1] = '1'; a[2] = String(pgrp); a[19] = String(start); return a; };
/** run the scan (its text `src`) over a placed /proc: rows = [{pid, state, pgrp, start, environ}] (environ 'BLOCK' = a read that would hang) */
const scan = (src, rows, { msPerStat = 1 } = {}) => {
  const placed = new Map(rows.map((r) => [r.pid, r])), clock = { t: 1e6 }, reads = [], blocked = [], stats = [];
  const fsStub = {
    readdirSync: (p) => { if (p !== '/proc') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return [...placed.keys()].map(String).concat(['self', 'stat']); },
    readFileSync: (f) => {
      const m = /^\/proc\/(\d+)\/environ$/.exec(String(f)); if (!m) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      const r = placed.get(Number(m[1])); reads.push(Number(m[1]));
      if (!r) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      if (r.environ === 'BLOCK') { blocked.push(r.pid); throw new Error('this read would wait on the process\'s memory map'); }
      return r.environ;
    },
  };
  const statOf = (pid) => { clock.t += msPerStat; stats.push(Number(pid)); const r = placed.get(Number(pid)); return r ? statRow(r.state, r.pgrp, r.start) : null; };
  const out = build(src)(fsStub, statOf, MARK, MARK_RUN, { starttime: START }, { pid: WPID }, () => null, () => [], { now: () => clock.t })();
  return { out: out.map(([pid, start, run]) => ({ pid, start, run })), cut: !!out.cut, none: out.none || null, reads, blocked, stats: stats.length };
};
const env = (marked, run = false) => ['PATH=/usr/bin', ...(marked ? [MARK] : []), ...(run ? [MARK_RUN] : [])].join('\0');
/** a busy machine: n processes started after the wrapper, outside its group, none of them the job's */
const busy = (n, from = 100000) => Array.from({ length: n }, (_, i) => ({ pid: from + i, state: 'S', pgrp: from + i, start: START + 10 + i, environ: env(false) }));

try {
  console.log('§1 the scan finds what left the group and carries the mark (its control)');
  {
    const rows = [
      { pid: 5001, state: 'S', pgrp: 5001, start: START + 5, environ: env(true, true) },     // an escapee of THIS run
      { pid: 5002, state: 'S', pgrp: WPID, start: START + 5, environ: env(true, true) },     // still in the wrapper's group: not an escapee
      { pid: 5003, state: 'S', pgrp: 5003, start: START - 5, environ: env(true, true) },     // started BEFORE the wrapper: never its
      { pid: 5004, state: 'Z', pgrp: 5004, start: START + 5, environ: env(true, true) },     // a zombie
      { pid: 5005, state: 'S', pgrp: 5005, start: START + 5, environ: env(false) },          // no mark
      { pid: WPID, state: 'S', pgrp: WPID, start: START, environ: env(true, true) },         // the wrapper itself
    ];
    const s = scan(WRAP, rows);
    okP(s.out.length === 1 && s.out[0].pid === 5001 && s.out[0].run === true && !s.cut, 'the escapee of this run is found — never one in the group, one started before the wrapper, a zombie, an unmarked one or the wrapper itself', s.out);
  }

  console.log('§2 THE CUT: bounded at 250 ms — a cut scan says so, and what it did not read is neither stopped nor counted');
  {
    const rows = [...busy(1000), { pid: 90000, state: 'S', pgrp: 90000, start: START + 5, environ: env(true) }];   // the job's escapee at the LOWEST pid: read last
    const s = scan(WRAP, rows);
    okP(s.cut && s.stats > 200 && s.stats < 300 && !s.out.some((r) => r.pid === 90000), `a scan past its bound stops and says it was cut (${s.stats} of 1001 read at 1 ms a stat read) — the escapee it never reached is not in its answer (neither stopped nor counted)`, { cut: s.cut, read: s.stats });
    const red = scan(anchored(WRAP, '    if (Date.now() - t0 > 250) { out.cut = true; break; }', '', 'red-no-bound'), rows);
    okP(!red.cut && red.stats === 1001, 'RED: no bound — the scan reads every process (1001) whatever it costs the stop, and says nothing', { cut: red.cut, read: red.stats });
  }

  console.log('§3 NEWEST FIRST: an escapee started after the wrapper is found inside the bound on a busy machine');
  {
    const rows = [...busy(1000), { pid: 120000, state: 'S', pgrp: 120000, start: START + 5, environ: env(true) }];   // the escapee at the HIGHEST pid: the newest
    const s = scan(WRAP, rows);
    okP(s.cut && s.out.some((r) => r.pid === 120000), `the newest pid is read first: on a busy machine (1001 processes, the scan cut at ${s.stats}) the escapee — newest of all — is found`, { cut: s.cut, read: s.stats, found: s.out.map((r) => r.pid) });
    const red = scan(anchored(WRAP, '.sort((a, b) => Number(b) - Number(a))', '.sort((a, b) => Number(a) - Number(b))', 'red-oldest-first'), rows);
    okP(red.cut && !red.out.some((r) => r.pid === 120000), 'RED: oldest first — the same scan spends its bound on old processes and never reaches the escapee', { cut: red.cut, read: red.stats, found: red.out.map((r) => r.pid) });
  }

  console.log('§4 THE D-STATE SKIP: a process in uninterruptible sleep is never read (its environ would hold the stop)');
  {
    const rows = [{ pid: 6001, state: 'D', pgrp: 6001, start: START + 5, environ: 'BLOCK' }, { pid: 6002, state: 'S', pgrp: 6002, start: START + 5, environ: env(true) }];
    const s = scan(WRAP, rows);
    okP(s.blocked.length === 0 && !s.reads.includes(6001) && s.out.some((r) => r.pid === 6002), 'a D-state process is skipped before its environ is read (no wait on its memory map) — the scan goes on to the next and finds it', { blocked: s.blocked, read: s.reads, found: s.out.map((r) => r.pid) });
    const red = scan(anchored(WRAP, "  if (rest[0] === 'D') return endingOf(root, pid, rest) || { unread: 'D' };\n", '', 'red-reads-d'), rows);   // r2215: the D skip's home is the twin's envOf now
    okP(red.blocked.includes(6001), 'RED: no D skip — the scan reads the D-state process\'s environ (in life: the stop waits on its memory map)', { blocked: red.blocked });
  }
} catch (e) {
  fail++; console.error('  ✗ the suite threw: ' + ((e && e.stack) || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

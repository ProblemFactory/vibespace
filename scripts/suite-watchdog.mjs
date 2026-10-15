// THE SUITE'S OWN CLOCK (lane suite-watchdog-census, 2026-10-15). The two-clock rule: a suite that holds its own
// deadline fires it BEFORE the gate's (the gate's budget − a margin), and when it fires it NAMES the leg it was in.
// rel281's mirror: test-voice-teach-chrome's own `setTimeout(() => { console.log('✗ TIMEOUT (300 s)'); end(1); }, 300e3)`
// fired twice with no leg and nothing else — the row's gate budget was 900 s, so the gate's hang report (.281) never
// ran: the suite had already exited. Its stdout stopped in ⑤ after the preview's ✓ (a CDP screenshot never answered).
// The gate exports the row's budget (VIBESPACE_SUITE_BUDGET_MS — ci.mjs budgetFor) and, where it arms a hang report,
// the file to write it to (VIBESPACE_SUITE_HANG_REPORT); run by hand the budget is 300 s. armWatchdog:
//   · fires at min(capMs, budget − margin) — margin 30 s (a tenth of a budget under 300 s); capMs = a suite's own
//     tighter ceiling, so a hang still fails in minutes when the row's budget is 15
//   · names the section from the suite's OWN headers (the last ① … / ⓐ … / §N line it printed, or wd.section(name)),
//     the last line it printed, and what it waits on (`pending` — e.g. the CDP calls nobody answered)
//   · prints the gate's digest (hang-report.mjs hangDigest) over process.report.getReport() — in-process, no signal,
//     env left out — writes that report where the gate would have (the ✗ row names it), then exits 1 through the
//     suite's own `exit` (its browser / servers / children go with it)
// A main thread that is busy or blocked never runs this timer: the gate's clock (askThenKill — /proc first, then
// SIGUSR2) stays the backstop for exactly that. test-ci-gate §12: the census (a timer that ends a suite with a
// failure IS this one) + a planted hang through the real runner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hangDigest, procSnapshot, withoutEnv } from './hang-report.mjs';

export const SUITE_BUDGET_ENV = 'VIBESPACE_SUITE_BUDGET_MS';
export const SUITE_HANG_ENV = 'VIBESPACE_SUITE_HANG_REPORT';
export const DEFAULT_BUDGET_MS = 300000; // ci.mjs budgetFor's fast row: what a suite run by hand assumes
export const MARGIN_MS = 30000;
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** PURE: the margin before a budget — 30 s; a tenth of a budget under 300 s. */
export const marginFor = (budgetMs) => Math.min(MARGIN_MS, Math.round(Number(budgetMs) / 10));

/** PURE: when the suite's own clock fires → { ms, budgetMs, fromGate, capped }. */
export function watchdogDeadline({ env = process.env, capMs = 0 } = {}) {
  const g = Number(env && env[SUITE_BUDGET_ENV]);
  const budgetMs = g > 0 ? g : DEFAULT_BUDGET_MS, lastSafe = budgetMs - marginFor(budgetMs);
  const capped = Number(capMs) > 0 && Number(capMs) < lastSafe;
  return { ms: capped ? Number(capMs) : lastSafe, budgetMs, fromGate: g > 0, capped };
}

// a section header the suites already print: ① … ㊿, ⓐ … / Ⓐ …, ❶ …, §N, — §N
const HEADER = /^\s*(?:[①-⑳㉑-㉟㊱-㊿Ⓐ-ⓩ❶-❿]|(?:—\s*)?§\s*\d)/u;
/** PURE: is this output line one of the suite's section headers? */
export const isSectionHeader = (line) => HEADER.test(String(line || ''));

const cut = (s, n = 160) => { const t = String(s || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const secs = (ms) => `${(Number(ms) / 1000).toFixed(1)} s`;

/** PURE: the lines the watchdog says first (before the digest). */
export function watchdogLines({ elapsedMs, deadline, section = '', sectionMs = null, lastLine = '', pending = [] }) {
  const why = deadline.capped ? `the suite's own ceiling; the gate's budget ${secs(deadline.budgetMs)}`
    : `the ${deadline.fromGate ? "gate's" : 'default'} budget ${secs(deadline.budgetMs)} − ${secs(marginFor(deadline.budgetMs))}`;
  const out = [`✗ WATCHDOG at ${secs(elapsedMs)} (${why}) — in ${section ? cut(section) : '(no section header yet)'}${section && sectionMs != null ? `, ${secs(sectionMs)} into it` : ''}`];
  if (lastLine) out.push(`  [watchdog] its last line: ${cut(lastLine)}`);
  const p = [].concat(pending || []).filter(Boolean);
  if (p.length) out.push(`  [watchdog] waiting on: ${cut(p.slice(0, 4).join(' · ') + (p.length > 4 ? ` · +${p.length - 4}` : ''), 300)}`);
  return out;
}

/**
 * Arm the suite's clock (once, at the top of a suite). opts: { capMs, pending: () => [what the suite waits on],
 * exit: (code) => … (the suite's own end — default process.exit) } + seams (env, now, uptimeMs, report, snapshot, fd).
 * Returns { deadline, section(name), clear(), fire() }. The clock counts from the PROCESS start — the gate's counts from
 * its spawn, so the imports before this call are inside the margin, not added to it. The timer is unref'd.
 */
export function armWatchdog({ capMs = 0, pending = null, exit = null, env = process.env, now = Date.now, uptimeMs = () => process.uptime() * 1000, fd = 1, stdout = process.stdout,
  report = () => process.report.getReport(), snapshot = () => procSnapshot(process.pid), root = REPO } = {}) {
  const up = uptimeMs(), t0 = now() - up, deadline = watchdogDeadline({ env, capMs });
  const st = { section: '', at: null, last: '', partial: '', fired: false };
  const note = (line) => { if (!line.trim()) return; if (isSectionHeader(line)) { st.section = line.trim(); st.at = now(); st.last = ''; } else st.last = line; };
  const write = stdout.write;
  stdout.write = function (chunk, ...rest) {   // the suite's own output names the leg: its headers + its last line
    try { const lines = (st.partial + (typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))).split('\n'); st.partial = lines.pop().slice(-4096); lines.forEach(note); } catch { }
    return write.call(this, chunk, ...rest);
  };
  const say = (lines) => { const s = lines.join('\n') + '\n'; try { fs.writeSync(fd, s); } catch { try { write.call(stdout, s); } catch { } } };
  const fire = () => {
    if (st.fired) return;
    st.fired = true;
    let pend = [];
    try { pend = pending ? [].concat(pending() || []) : []; } catch (e) { pend = [`(pending() threw: ${e && e.message})`]; }
    // FIRST, synchronously: a report that never comes back (a worker stuck in a syscall) cannot take the leg with it
    say(['', ...watchdogLines({ elapsedMs: now() - t0, deadline, section: st.section, sectionMs: st.at != null ? now() - st.at : null, lastLine: st.partial.trim() || st.last, pending: pend })]);
    setTimeout(() => process.exit(1), 5000).unref(); // an `exit` that does not exit
    // the report from the NEXT phase: inside this timer's own callback libuv's timer handle is stopped, and a report
    // taken here would say no timer holds the loop
    setImmediate(digest);
  };
  const digest = () => {
    try {
      try { process.report.excludeEnv = true; process.report.excludeNetwork = true; } catch { }
      const r = JSON.parse(withoutEnv(JSON.stringify(report())));
      if (r.header) delete r.header.networkInterfaces;
      if (Array.isArray(r.libuv)) r.libuv = r.libuv.filter((h) => !(h && h.type === 'idle')); // the one Node starts for this setImmediate
      r.javascriptStack = { message: '' }; // the main thread's stack here is the watchdog's own: the loop was idle enough to run it
      const snap = snapshot(), file = env && env[SUITE_HANG_ENV];
      const lines = hangDigest(r, { root, snapshot: snap ? { threads: [], children: snap.children } : null, at: 'the watchdog' });
      if (file) {
        try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(r, null, 2) + '\n'); lines.push(`  [watchdog] report: ${file}`); } catch (e) { lines.push(`  [watchdog] report not written: ${e.code || e.message}`); }
      }
      say(lines);
    } catch (e) { say([`  [watchdog] no report: ${(e && e.message) || e}`]); }
    (exit || ((c) => process.exit(c)))(1);
  };
  const timer = setTimeout(fire, Math.max(0, deadline.ms - up));
  timer.unref();
  return {
    deadline,
    section(name) { st.section = String(name || ''); st.at = now(); st.last = ''; },
    clear() { clearTimeout(timer); if (stdout.write !== write) stdout.write = write; },
    fire,
  };
}

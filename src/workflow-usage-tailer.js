'use strict';
/**
 * Workflow agent transcript tailer — the file-level "wrapper" for in-process
 * workflow agents (2.266.0), extracted + race-fixed in 2.270.0.
 *
 * WHY THIS EXISTS: a dynamic workflow's agents make their API calls IN-PROCESS
 * inside the CLI — there is no child process to wrap, so the usual stdout
 * usage stream carries nothing for them. Their spend lands only in
 * `<run dir>/agent-*.jsonl`. Tailing those files is what makes a burst
 * visible to the dead-reckoning estimator within seconds instead of whenever
 * the 3-minute ledger scan next runs.
 *
 * THE RACE THAT KILLED IT (2.270.0, telemetry-proven): the launch ack that
 * carries `Run ID: wf_…` reaches the parent transcript BEFORE the harness
 * creates the run directory — measured 17ms apart on a real run (ack
 * 08:23:06.358Z, dir birth 08:23:06.375). The old one-shot `existsSync(dir)`
 * precondition therefore lost EVERY time: zero `wf-usage-tailer-armed` events
 * across a month of workflows, while sibling telemetry names recorded fine.
 * Consequence: during a big fan-out the estimate only moved on the ledger
 * scan, so the pool's auto-switch decided on minutes-old data (observed: 30%
 * shown vs 65% real). Anything that waits for a path the harness creates
 * asynchronously must RETRY, never probe once.
 *
 * The module is deliberately dependency-free (fs + path only) so the tailing
 * machinery is testable without booting a server; billing/cost lives in the
 * caller's onRecord.
 */
const fs = require('fs');
const path = require('path');

const MAX_READ = 8 * 1024 * 1024;

/**
 * @param {object} o
 * @param {string} o.dir                run directory (may not exist yet)
 * @param {(rec:object)=>void} o.onRecord  called per assistant record carrying usage
 * @param {()=>boolean} [o.isAlive]     false ⇒ tear down (session gone)
 * @param {(n:number)=>void} [o.onDrain] called with how many records a drain noted
 * @returns {{stop:()=>void, armed:()=>boolean, drain:()=>number}}
 */
function createWorkflowTailer({
  dir, onRecord, isAlive = () => true, onDrain = () => {},
  waitMs = 2000, maxWaitMs = 180000, pollMs = 5000, idleMs = 30 * 60000, debounceMs = 800,
} = {}) {
  const st = { offsets: new Map(), lastGrowth: Date.now(), watcher: null, poll: null, debounce: null, wait: null, draining: false, armed: false, stopped: false };

  const stop = () => {
    st.stopped = true;
    try { st.watcher?.close(); } catch { }
    clearInterval(st.poll); clearTimeout(st.debounce); clearTimeout(st.wait);
    st.watcher = st.poll = st.debounce = st.wait = null;
  };

  const drain = () => {
    if (st.draining || st.stopped) return 0;
    st.draining = true;
    let noted = 0;
    try {
      for (const fn of fs.readdirSync(dir)) {
        if (!fn.startsWith('agent-') || !fn.endsWith('.jsonl')) continue;
        const fp = path.join(dir, fn);
        let size; try { size = fs.statSync(fp).size; } catch { continue; }
        const off = st.offsets.get(fn) || 0;
        if (size <= off) continue;
        st.lastGrowth = Date.now();
        let fd;
        try {
          fd = fs.openSync(fp, 'r');
          const buf = Buffer.alloc(Math.min(size - off, MAX_READ));
          const n = fs.readSync(fd, buf, 0, buf.length, off);
          const chunk = buf.slice(0, n);
          const lastNl = chunk.lastIndexOf(10);
          if (lastNl < 0) continue; // no complete line yet — re-read next pass
          st.offsets.set(fn, off + lastNl + 1);
          for (const line of chunk.slice(0, lastNl).toString('utf-8').split('\n')) {
            if (line.indexOf('"usage"') < 0) continue;
            let r; try { r = JSON.parse(line); } catch { continue; }
            if (r.type !== 'assistant' || !r.message?.usage) continue;
            try { onRecord(r); noted++; } catch { }
          }
        } catch { /* file vanished / unreadable — next pass */ }
        finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { } } }
      }
    } catch { /* dir vanished */ }
    st.draining = false;
    if (noted) { try { onDrain(noted); } catch { } }
    return noted;
  };

  const arm = () => {
    if (st.stopped) return;
    st.armed = true;
    try {
      st.watcher = fs.watch(dir, { persistent: false }, () => {
        if (st.debounce || st.stopped) return;
        st.debounce = setTimeout(() => { st.debounce = null; drain(); }, debounceMs);
      });
    } catch { /* watch unsupported — the poll below is the belt */ }
    st.poll = setInterval(() => {
      if (st.stopped) return;
      if (!isAlive() || Date.now() - st.lastGrowth > idleMs) { stop(); return; }
      drain();
    }, pollMs);
    drain(); // a late arm still counts everything already written (offset 0)
  };

  // RETRY until the run dir appears (see the race note above). Give up after
  // maxWaitMs so a bogus/aborted run can't leak a timer.
  const t0 = Date.now();
  const waitForDir = () => {
    if (st.stopped) return;
    if (!isAlive()) { stop(); return; }
    if (fs.existsSync(dir)) { arm(); return; }
    if (Date.now() - t0 > maxWaitMs) { stop(); return; }
    st.wait = setTimeout(waitForDir, waitMs);
    if (st.wait.unref) st.wait.unref();
  };
  waitForDir();

  return { stop, armed: () => st.armed, drain, _state: st };
}

module.exports = { createWorkflowTailer };

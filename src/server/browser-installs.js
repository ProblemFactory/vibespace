'use strict';
/**
 * THE BROWSER KEEPER'S ONE INSTALL SLOT (rv-browser F7, lane dc-browser-installs — moved verbatim out of
 * src/server/browser-keeper.js, where it was shared by three kind strings in 12 branches).
 *
 * One install runs at a time on this machine, whatever it installs. The slot holds its state (`installState`), its log,
 * THE marker file of a running step (a server restart RE-ATTACHES to it — never a second install), the wall clock every
 * step ends at, the progress read off the log and the refusal while another install runs. It never knows WHAT it
 * installs: each installable is a ROW declared by its own file and registered by ONE line in INSTALLERS below —
 *   id              the `kind` on installState and on the marker (a marker naming no registered row is dropped)
 *   words(state)    the running install as the "one at a time" refusal names it
 *   logName         the running install as the re-attach log line names it
 *   markSteps       every runStep() of it rides THE marker (the step's pid + starttime)
 *   group           a stalled re-attached step is ended as a process group (a detached npm)
 *   inProcess       its marker may carry no pid (an in-process step died with the server — judged at once)
 *   beforeReattach  restores the row's own state from the marker; afterRestart(m, {stalled, letGo}) judges what the
 *                   step the server lost left on disk; shutdown() ends an in-process step with its keeper
 * The installers' laws stay in their files: never two installs (refuseWhileRunning / the verdicts' `running`), verified
 * by --version / the measured SHA-256 / the md5 + zip shape, the pin followed at runtime, user-only routes.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const F = require('../browser-facts.js');

// THE INSTALLERS — one line per installable kind (each file declares its row + its steps, its verify and its words)
const INSTALLERS = [
  require('./browser-cli-install.js'),
  require('./browser-cloak-install.js'),
  require('./browser-builds-keeper.js'),
];

function createSlot({ dataDir, installDir, installTimeoutMs = null, log = console, now = Date.now, writeJsonAtomic }) {
  const rows = new Map(); // row id → the row its installer registered
  const INSTALL_TIMEOUT_MS = Number.isFinite(installTimeoutMs) && installTimeoutMs > 0 ? installTimeoutMs : 15 * 60 * 1000;
  /** verify r1 (F8): THE slot's bound — every step of either install ends at INSTALL_TIMEOUT_MS: the browser CLI's detached
   *  npm (it had no wall clock: a stalled registry held the ONE slot, CloakBrowser's install too, for as long as npm lived)
   *  and a step RE-ATTACHED after a restart (the marker's `stepAt`; the re-attach waited on the pid for ever). In-process the
   *  npm is identified by its unreaped child handle; a re-attached step is stopped (`endStalledStep`) only when it is provably
   *  the one the marker names (pid + starttime) — one that cannot be proven is let go: the slot released and said, never a
   *  kill of a stranger. */
  const stalledWords = (what) => `${what} ran past ${Math.round(INSTALL_TIMEOUT_MS / 60000) || 1} minutes and was stopped — see ${installState.log}; install again`;
  function endStalledStep({ pid, starttime = null, group = false } = {}) {
    if (!Number.isInteger(pid) || pid <= 1 || starttime == null || !F.sameProcess(pid, starttime)) return false;
    if (group) { try { process.kill(-pid, 'SIGTERM'); return true; } catch { /* not a group leader — the pid below */ } }
    try { process.kill(pid, 'SIGTERM'); return true; } catch { return false; }
  }
  const installState = { running: false, startedAt: null, finishedAt: null, exitCode: null, spec: null, pid: null, log: path.join(installDir, 'install.log'), error: null, step: null, refused: [] };
  const installMarker = () => path.join(dataDir, 'browser-tools', 'install-running.json');
  /** THE marker of a running install (both kinds): the step's pid + starttime, so a restart re-attaches (verify r1 F3). */
  function markInstall(m) { try { fs.mkdirSync(path.dirname(installMarker()), { recursive: true, mode: 0o700 }); writeJsonAtomic(installMarker(), m); } catch (e) { log.warn?.(`[browser] the install marker was not written (${e && e.message}) — a restart now would not re-attach`); } }
  /** ONE step of the install as a child, its output appended to the log; resolves `{ok, code, sig, error}`. The pid is
   *  on installState SYNCHRONOUSLY (the Promise executor runs now), so the caller answers it. */
  function runStep(step, cmd, argv, childEnv, mark = null) {
    return new Promise((resolve) => {
      let fd = null;
      try { fd = fs.openSync(installState.log, 'a', 0o600); fs.writeSync(fd, `\n[${new Date(now()).toISOString()}] ${step}: ${path.basename(cmd)} ${argv.map((a) => path.basename(String(a))).join(' ')}\n`); }
      catch (e) { resolve({ ok: false, error: `the install log could not be opened: ${e.message}` }); return; }
      let child;
      try { child = spawn(cmd, argv, { cwd: installDir, env: childEnv, stdio: ['ignore', fd, fd] }); } catch (e) { try { fs.closeSync(fd); } catch {} resolve({ ok: false, error: `${path.basename(cmd)} could not be started: ${e.message}` }); return; }
      try { fs.closeSync(fd); } catch {}
      Object.assign(installState, { step, pid: child.pid || null });
      // verify r1 (F3): a row's running step rides THE marker when the row says `markSteps` (CloakBrowser's) (the CLI install's) — a server restart
      // mid-install re-attaches to it (the slot stays busy, never a second npm / download into the same folder)
      if ((rows.get(installState.kind) || {}).markSteps) markInstall({ kind: installState.kind, spec: installState.spec, step, pid: child.pid || null, starttime: child.pid ? F.procStart(child.pid) : null, startedAt: installState.startedAt, stepAt: now(), prefix: installDir });
      // lane chrome-builds-download: a Chrome build's `unzip` rides THE marker too (its version + files ride `mark`) — a restart re-attaches to it
      if (mark) markInstall({ ...mark, kind: installState.kind, spec: installState.spec, step, pid: child.pid || null, starttime: child.pid ? F.procStart(child.pid) : null, startedAt: installState.startedAt, stepAt: now() });
      const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, INSTALL_TIMEOUT_MS);
      if (typeof timer.unref === 'function') timer.unref();
      child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
      child.on('exit', (code, sig) => { clearTimeout(timer); resolve({ ok: code === 0, code, sig, error: code === 0 ? null : `exited ${code ?? sig}` }); });
    });
  }
  /** lane browser-propose: the running install's step + the last percent its log shows (the download's own progress
   *  output, whatever the step prints) — `{running, step, percent, failed, error}`; a log that cannot be read ⇒ percent null. */
  function installProgress() {
    let percent = null;
    try {
      const st = fs.statSync(installState.log);
      const fd = fs.openSync(installState.log, 'r');
      try {
        const n = Math.min(st.size, 8192);
        const buf = Buffer.alloc(n);
        fs.readSync(fd, buf, 0, n, Math.max(0, st.size - n));
        const all = [...buf.toString('utf8').matchAll(/(\d{1,3}(?:\.\d+)?)\s?%/g)];
        const last = all.length ? Number(all[all.length - 1][1]) : NaN;
        if (Number.isFinite(last) && last >= 0 && last <= 100) percent = last;
      } finally { fs.closeSync(fd); }
    } catch { percent = null; }
    const failed = !installState.running && (installState.error != null || (installState.exitCode != null && installState.exitCode !== 0));
    let logBytes = null; try { logBytes = fs.statSync(installState.log).size; } catch { logBytes = null; } // verify r1 V3: bytes of output = signs of life
    return { running: !!installState.running, step: installState.step || null, percent, logBytes, failed, error: installState.error || null, startedAt: installState.startedAt || null, finishedAt: installState.finishedAt || null };
  }
  /** lane dc-browser-installs: the slot's answers about WHICH row runs — a row asks about itself by its own id */
  const mine = (id) => installState.kind === id;
  const otherOf = (id) => (installState.running && installState.kind !== id ? installState.kind : null);
  const busyWords = () => { const row = rows.get(installState.kind); return row ? row.words(installState) : String(installState.kind); };
  /** A server restart mid-install RE-ATTACHES (the marker names the running step's pid — the CLI install's npm, or any step
   *  of the CloakBrowser install, verify r1 F3): still running ⇒ the slot stays busy until it exits; gone ⇒ its result is
   *  judged now. Never a second install. */
  function reattachInstall() {
    let m = null; try { m = JSON.parse(fs.readFileSync(installMarker(), 'utf8')); } catch { return null; }
    // lane chrome-builds-download: a marker of an IN-PROCESS step (`inProcess` row) carries no pid (it died with the server) — judged now
    const row = m ? rows.get(m.kind) : null; // lane dc-browser-installs: the marker's kind is a registered row's id, else dropped
    if (!row || (!Number.isInteger(m.pid) && !row.inProcess)) { try { fs.rmSync(installMarker(), { force: true }); } catch { /* none */ } return null; }
    if (row.beforeReattach) row.beforeReattach(m);
    Object.assign(installState, { running: true, kind: m.kind, spec: m.spec || null, startedAt: m.startedAt || now(), finishedAt: null, exitCode: null, pid: m.pid, error: null, step: m.step || 'package', refused: [] });
    const alive = () => Number.isInteger(m.pid) && F.pidAlive(m.pid) && (m.starttime == null || F.sameProcess(m.pid, m.starttime));
    // verify r1 (F8): the re-attached step keeps its wall clock — from the marker's `stepAt` (its step's start), so a step
    // that stalls before or across a restart ends at the same deadline it had; a step that cannot be proven ours is let go
    const deadlineAt = (Number(m.stepAt) || Number(m.startedAt) || now()) + INSTALL_TIMEOUT_MS;
    let stalled = false, letGo = false;
    const done = () => row.afterRestart(m, { stalled, letGo });
    if (!alive()) { log.log?.(`[browser] a ${row.logName} install (${m.spec}) ended while VibeSpace was down — checking its result`); done(); return 'ended'; }
    log.log?.(`[browser] re-attached to the running ${row.logName} install ${m.spec} (${m.step || 'package'} pid ${m.pid}) — no second install starts`);
    const timer = setInterval(() => {
      if (!alive()) { clearInterval(timer); done(); return; }
      if (stalled || now() < deadlineAt) return;
      stalled = endStalledStep({ pid: m.pid, starttime: m.starttime, group: !!row.group });
      log.warn?.(`[browser] the re-attached ${m.kind} install ${m.spec} (pid ${m.pid}) ran past its deadline — ${stalled ? 'stopped' : 'not provably ours: the slot is released'}`);
      if (!stalled) { letGo = true; clearInterval(timer); done(); }
    }, 1000);
    if (typeof timer.unref === 'function') timer.unref();
    return 'running';
  }
  /** the keeper's shutdown: an in-process step ends with its keeper (the marker stays: the next keeper judges it) */
  function shutdown() { const row = installState.running ? rows.get(installState.kind) : null; if (row && typeof row.shutdown === 'function') row.shutdown(); }
  const register = (row) => { if (!row || typeof row.id !== 'string' || rows.has(row.id)) throw new Error(`install row ${row && row.id}: no id, or registered twice`); rows.set(row.id, row); };
  return { register, rows, INSTALL_TIMEOUT_MS, stalledWords, endStalledStep, installState, installMarker, markInstall, runStep, installProgress, mine, otherOf, busyWords, reattachInstall, shutdown };
}

/** The keeper's ONE call: the slot, every installer created against it (its row registered), their routes' api merged. */
function create(ctx, installers = INSTALLERS) {
  const slot = createSlot(ctx);
  const api = { installProgress: slot.installProgress };
  for (const I of installers) { const m = I.create(ctx, slot); slot.register(m.row); Object.assign(api, m.api); }
  return { slot, api, reattach: slot.reattachInstall, shutdown: slot.shutdown };
}

module.exports = { create, createSlot, INSTALLERS };

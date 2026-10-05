'use strict';
/**
 * THE BROWSER CLI INSTALL — a row of the keeper's ONE install slot (src/server/browser-installs.js), moved verbatim out
 * of src/server/browser-keeper.js (rv-browser F7, lane dc-browser-installs): `npm install --prefix
 * <data>/browser-tools/agent-browser-<v> --no-save --ignore-scripts agent-browser@<v>` (the registry only), the npm child
 * DETACHED and named in THE marker, verified by the folder's own program saying its version (`--version`), then its
 * witness written and the pin re-read. Which CLI VibeSpace drives (`browser.cli`: path | pinned | x.y.z — cliPin, the
 * versions running browsers keep) stays the keeper's; this file answers the panel's row (cliFacts) and the install.
 */
const B = require('../browser-profiles.js');
const F = require('../browser-facts.js');
const SW = require('../browser-switch.js');
const VERBS = require('../browser-verbs.js');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function create(ctx, slot) {
  const { bf, bfPath, cliFolderOf, cliPin, env, installedCliOf, log, namedError, notify, now, runningClis, usableExe, whichOnPath, writeJsonAtomic } = ctx;
  const { INSTALL_TIMEOUT_MS, installMarker, installState, mine: isMine, markInstall, otherOf, stalledWords } = slot;
  const cliPrefix = (...a) => ctx.cliPrefix(...a); // declared later in the keeper (read at call time)
  const cliWitnessOf = (...a) => ctx.cliWitnessOf(...a); // declared later in the keeper (read at call time)
  const isMusl = (...a) => ctx.isMusl(...a); // declared later in the keeper (read at call time)
  /** What the panel's Browser CLI row and `vibespace-browser providers` say: the measured version, the choice, the pinned
   *  install, the one on PATH, the one in use (its drift from the table), the install slot. Two version probes (cached). */
  async function cliFacts() {
    const pin = cliPin();
    const [inUseV, pathV] = await Promise.all([bf.probeVersion(), bfPath.probeVersion()]);
    const inUsePath = typeof bf.binPath === 'function' ? bf.binPath() : null;
    const cliRun = isMine(ROW.id);
    return {
      table: VERBS.TABLE_VERSION, record: VERBS.CLI_PIN_RECORD, choice: { mode: pin.mode, version: pin.version, invalid: pin.invalid },
      pinned: pin.mode === 'path' ? null : { version: pin.version, installed: pin.installed, path: pin.path, why: pin.why },
      onPath: { version: pathV, path: typeof bfPath.binPath === 'function' ? bfPath.binPath() : null },
      inUse: { version: inUseV, path: inUsePath, pinned: !!(pin.path && inUsePath === pin.path) },
      drift: inUseV ? VERBS.versionDrift(inUseV) : null,
      install: { running: !!(installState.running && cliRun), other: otherOf(ROW.id), failed: cliRun && !installState.running && (installState.error != null || (installState.exitCode != null && installState.exitCode !== 0)), error: cliRun ? installState.error : null, spec: cliRun ? installState.spec : null },
      npm: whichOnPath('npm') !== null,
      installedTable: installedCliOf(VERBS.TABLE_VERSION).ok, // the measured version is here (a PATH choice's one act is then "Use it", no second download)
      running: runningClis(inUseV), // verify r2 (H1): the running browsers still on another version (they switch when they stop)
    };
  }
  /** verify r2 (H1): the RUNNING browsers of this machine by the CLI they keep — `previous` = on a version other than the one
   *  a launch runs now (they switch when they stop), `gone` = on a version no longer installed here (refused by name until
   *  restarted), `versions` = those versions. A browser healed in its own daemon keeps that daemon's version; a new launch
   *  (a restart, a daemon that died) runs the current one. */
  /** INSTALL a browser CLI version (the user's act — the route is cookie-only). One npm child, detached, its pid in the marker. */
  function installCli({ version = VERBS.TABLE_VERSION } = {}) {
    const v0 = VERBS.cliInstallVerdict({ version: String(version || ''), running: installState.running, installed: installedCliOf(String(version || '')), npm: whichOnPath('npm') !== null });
    if (!v0.ok) throw namedError(v0.code, v0.error, v0.path ? { path: v0.path } : {});
    const npm = whichOnPath('npm');
    const prefix = cliPrefix(v0.version);
    fs.mkdirSync(prefix, { recursive: true, mode: 0o700 });
    try { fs.rmSync(cliWitnessOf(prefix), { force: true }); } catch { /* none */ } // verify r1 (F2): the folder is about to be rewritten — nothing resolves it until it is verified again
    ctx.cliGen++; ctx.cliMemo = null;
    const e0 = {}; for (const [k2, v2] of Object.entries(env() || {})) if (v2 != null) e0[k2] = String(v2);
    if (!e0.PATH) e0.PATH = process.env.PATH || '';
    let fd;
    try { fd = fs.openSync(installState.log, 'a', 0o600); fs.writeSync(fd, `\n[${new Date(now()).toISOString()}] browser CLI: npm install ${v0.spec} (--ignore-scripts) into ${prefix}\n`); }
    catch (e) { throw namedError('install_unavailable', `the install log could not be opened: ${e.message}`); }
    const argv = [...SW.installArgv({ spec: v0.spec, prefix }), '--ignore-scripts']; // the registry only: no package script runs
    let child;
    try { child = spawn(npm, argv, { cwd: prefix, env: e0, stdio: ['ignore', fd, fd], detached: true }); } catch (e) { try { fs.closeSync(fd); } catch { /* none */ } throw namedError('install_unavailable', `npm could not be started: ${e.message}`); }
    try { fs.closeSync(fd); } catch { /* none */ }
    try { child.unref(); } catch { /* none */ }
    Object.assign(installState, { running: true, kind: ROW.id, startedAt: now(), finishedAt: null, exitCode: null, spec: v0.spec, pid: child.pid || null, error: null, step: 'package', refused: [] });
    const st0 = child.pid ? F.procStart(child.pid) : null;
    markInstall({ kind: ROW.id, spec: v0.spec, version: v0.version, pid: child.pid || null, starttime: st0, startedAt: installState.startedAt, stepAt: now(), prefix });
    // verify r1 (F8): the npm child's wall clock (cloak's steps always had one) — past it, the npm group is stopped and said
    let stalled = false;
    // (in-process the identity is the HANDLE: node has not reaped a child whose exit it has not reported, so its pid is still
    // that npm — no starttime needed, which a machine without /proc could not read)
    const deadline = setTimeout(() => {
      if (child.exitCode != null || child.signalCode != null) return;
      try { process.kill(-child.pid, 'SIGTERM'); stalled = true; } catch { try { stalled = child.kill('SIGTERM'); } catch { stalled = false; } }
      if (stalled) log.warn?.(`[browser] browser CLI install ${v0.spec}: npm ran past ${INSTALL_TIMEOUT_MS} ms — stopped`);
    }, INSTALL_TIMEOUT_MS);
    if (typeof deadline.unref === 'function') deadline.unref();
    child.on('error', (e) => { clearTimeout(deadline); finishCli(v0.version, `npm could not run: ${e && e.message}`); });
    child.on('exit', (code, sig) => { clearTimeout(deadline); finishCli(v0.version, code === 0 && !stalled ? null : stalled ? stalledWords('npm') : `npm exited ${code ?? sig} — see ${installState.log}`); });
    log.log?.(`[browser] installing ${v0.spec} into ${prefix} (a user act; the registry only, --ignore-scripts; log ${installState.log})`);
    notify();
    return { ok: true, started: true, spec: v0.spec, version: v0.version, prefix, log: installState.log, pid: child.pid || null, record: v0.record };
  }
  /** The install's END (its exit here, or — after a restart — the re-attached pid gone): verified off the folder (its own
   *  package.json names the version, its program runs and SAYS the version), the marker removed, the pin re-read. */
  let cliFinishing = false;
  async function finishCli(version, err) {
    if (cliFinishing || !(installState.running && isMine(ROW.id))) return;
    cliFinishing = true;
    let e = err;
    try {
      // the registry's tarball ships every native binary 0644 (measured on 0.38.1: only bin/agent-browser.js is 0755) and
      // the package's own scripts never ran (--ignore-scripts) — make THIS machine's binary executable, exactly what the
      // package's launcher / postinstall does on its first run, so a command runs it directly
      if (!e) {
        try {
          const native = VERBS.cliNativeName({ platform: process.platform, arch: process.arch, musl: isMusl() });
          const nat = native ? path.join(cliPrefix(version), 'node_modules', VERBS.CLI_PACKAGE, 'bin', native) : null;
          if (nat && fs.statSync(nat).isFile() && !usableExe(nat)) fs.chmodSync(nat, 0o755);
        } catch { /* absent ⇒ the declared launcher answers */ }
      }
      if (!e) {
        const i = cliFolderOf(version); // the folder's own program — its witness is written below, once it said the version
        if (!i.ok) e = `${VERBS.CLI_PACKAGE} ${version} is not usable after the install (${i.why})`;
        else {
          installState.step = 'verify';
          const out = await new Promise((resolve) => { try { require('child_process').execFile(i.path, ['--version'], { timeout: 15000, encoding: 'utf8', env: F.sanitizeProbeEnv({ ...(env() || {}), PATH: (env() || {}).PATH || process.env.PATH || '' }) }, (er, so, se) => resolve(String(so || '') + String(se || ''))); } catch (x) { resolve(''); } });
          const got = B.parseVersion(out);
          if (!got || got.join('.') !== String(version)) e = `the installed program says ${got ? got.join('.') : 'nothing'}, not ${version}`;
          else writeJsonAtomic(cliWitnessOf(i.prefix), { version: String(version), path: i.path, at: now(), says: got.join('.') }); // verify r1 (F2): THE witness — only now is the folder an install
        }
      }
    } catch (x) { e = String(x && x.message || x); }
    if (e) { try { fs.rmSync(cliWitnessOf(cliPrefix(version)), { force: true }); } catch { /* none */ } } // a failed install's folder is never resolved
    try { fs.rmSync(installMarker(), { force: true }); } catch { /* none */ }
    Object.assign(installState, { running: false, finishedAt: now(), exitCode: e ? 1 : 0, error: e ? `${installState.step || 'package'}: ${e}` : null, step: e ? installState.step : 'done', pid: null });
    ctx.cliGen++; ctx.cliMemo = null; try { cliPin(); } catch { /* said */ }
    cliFinishing = false;
    log[e ? 'warn' : 'log']?.(`[browser] browser CLI install ${VERBS.CLI_PACKAGE}@${version} ${e ? 'failed — ' + e : 'finished'}`);
    notify();
  }
  const ROW = { id: 'cli', words: () => 'the browser CLI', logName: 'browser CLI', group: true, afterRestart: (m, { stalled = false, letGo = false } = {}) => finishCli(String(m.version), stalled ? stalledWords('npm') : letGo ? `the install from before the restart (pid ${m.pid}) ran past its deadline and could not be proven to be it — VibeSpace stopped waiting; install again` : null) };
  return { row: ROW, api: { cliFacts, installCli } };
}

module.exports = { create };

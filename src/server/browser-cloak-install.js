'use strict';
/**
 * THE CLOAKBROWSER INSTALL — a row of the keeper's ONE install slot (src/server/browser-installs.js), moved verbatim out
 * of src/server/browser-keeper.js (rv-browser F7, lane dc-browser-installs). Its package, its pinned Chromium, its install
 * env and the §7.2.1 proof it is gated on are the backend's own (src/browser-backends/cloak.js, via browser-switch).
 *
 * The verdict is PURE (src/browser-switch.js installVerdict) over the §7.2.1
 * proof record, the executable rung and the single flight; this half only
 * ACTS on an ok verdict: ONE `npm install --prefix <data>/browser-tools
 * cloakbrowser@<the measured version>` with its output in a log file, its
 * exit reported through the profiles broadcast, and the resulting executable
 * found by rung 3 above. Nothing is downloaded on a refusal (the design's
 * "never fetch the 200 MB when the user did not ask"), and the version is
 * the one the measurement describes — an unpinned download would silently
 * invalidate the record the install is gated on.
 */
const B = require('../browser-profiles.js');
const EgressProxy = require('./egress-proxy');
const SW = require('../browser-switch.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function create(ctx, slot) {
  const { cloakExecutable, egressResolve, env, hereTag, installDir, log, namedError, notify, now, proofOf, usableExe, whichOnPath, writeJsonAtomic } = ctx;
  const { installMarker, installState, otherOf, runStep, stalledWords } = slot;
  const cloakCacheDir = path.join(installDir, 'cloak-cache'); // CLOAKBROWSER_CACHE_DIR — VibeSpace's own, never ~/.cloakbrowser
  const stampFile = path.join(installDir, 'cloak-installed.json');
  /** The installed package's own CLI (its package.json `bin`, never a guessed name) — the tool the binary step runs. */
  function installedCli() {
    const pkgDir = path.join(installDir, 'node_modules', SW.CLOAK_PACKAGE);
    let pkg = null;
    try { pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')); } catch { return null; }
    const rel = SW.binFromPackageJson(pkg);
    return rel ? { path: path.join(pkgDir, rel), version: pkg.version || null } : null;
  }
  /** WHERE the measured Chromium is unpacked (the wrapper's own layout, mirrored in browser-switch). */
  function installedCloakBin() { const pr = proofOf(); return SW.cloakBinaryPath({ cacheDir: cloakCacheDir, chromium: pr && pr.chromium, platform: (pr && pr.platform) || hereTag() }); }
  /** The install's own proof it finished: the stamp names the record's Chromium + SHA-256 (a stale stamp = not installed). */
  function installedStamp() {
    let st = null;
    try { st = JSON.parse(fs.readFileSync(stampFile, 'utf8')); } catch { return { ok: false, why: 'no install stamp' }; }
    const pr = proofOf() || {};
    if (!st || st.chromium !== pr.chromium) return { ok: false, why: `the stamp names Chromium ${st && st.chromium}, the record ${pr.chromium}` };
    if (pr.binary && pr.binary.sha256 && st.sha256 !== pr.binary.sha256) return { ok: false, why: 'the stamp\'s SHA-256 is not the measured one' };
    return { ok: true, stamp: st };
  }
  function installVerdict({ host = null } = {}) {
    const proof = proofOf();
    const v = SW.installVerdict({ proof, proofOk: B.proofVerdict(proof), exe: host ? null : cloakExecutable(), host, running: installState.running, platform: host ? null : hereTag() });
    // the rebuilt dialog: ONE shape for GET /api/browser/install, the switcher view and the Manage Agents row — `npm`
    // (the same probe installCloak makes) and `state.failed` (a finished run with an error / a non-zero exit)
    // lane browser-admin 2b: the slot is ONE (cloak's and the browser CLI's): the verdict refuses while either runs, and the
    // cloak row's own state says "installing" only for a cloak install (`otherInstall` names the other row's id)
    const other = otherOf(ROW.id); // lane dc-browser-installs: ANY other row's running install (it was the CLI's alone)
    return { ...SW.installFacts({ verdict: v, npm: whichOnPath('npm') !== null, state: { ...installState, running: installState.running && !other, refused: [...installState.refused] } }), prefix: installDir, ...(other ? { otherInstall: other } : {}) };
  }
  const sha256Of = (f) => new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex'))); });
  /**
   * THE INSTALL (a user act, after the §7.2.1 measurement), THREE steps, each named when it fails:
   *   1 package  `npm install --prefix <data>/browser-tools --no-save cloakbrowser@<the record's version>` (skipped when
   *              that version is already there) — the registry, not the vendor (the record's `npm` phase);
   *   2 binary   the package's own `cloakbrowser install` with CLOAKBROWSER_CACHE_DIR=<data>/browser-tools/cloak-cache,
   *              CLOAKBROWSER_VERSION=<the record's Chromium>, auto-update off, every other CLOAKBROWSER_* dropped — and
   *              its fetches through an egress proxy admitting EXACTLY the record's download hosts (anything else it
   *              tries is refused and named in the state);
   *   3 verify   the unpacked browser's SHA-256 must be the one the record names; only then the stamp is written and
   *              cloakExecutable() answers it.
   */
  async function installCloak() {
    const v = installVerdict();
    if (!v.ok) throw namedError(v.code, v.error, { proof: v.proof || null, path: v.path || null });
    const npm = whichOnPath('npm');
    if (!npm) throw namedError('install_unavailable', `npm is not on PATH — install ${v.spec} by hand and point browser.cloak.executablePath at its browser (the chrome file)`);
    fs.mkdirSync(installDir, { recursive: true, mode: 0o700 });
    const e0 = {}; for (const [k2, v2] of Object.entries(env() || {})) if (v2 != null) e0[k2] = String(v2);
    if (!e0.PATH) e0.PATH = process.env.PATH || '';
    const pr = proofOf();
    Object.assign(installState, { running: true, kind: ROW.id, startedAt: now(), finishedAt: null, exitCode: null, spec: v.spec, pid: null, error: null, step: null, refused: [] });
    const cli0 = installedCli();
    const first = cli0 && cli0.version === v.version ? null : runStep('package', npm, SW.installArgv({ spec: v.spec, prefix: installDir }), e0);
    const pid0 = installState.pid;
    log.log?.(`[browser] installing ${v.spec} + Chromium ${v.chromium || '?'} into ${installDir} (a user act, after the §7.2.1 measurement dated ${pr && pr.date}; log ${installState.log})`);
    const finish = (step, err) => {
      try { fs.rmSync(installMarker(), { force: true }); } catch { /* none */ } // verify r1 (F3): the marker names a running step only
      Object.assign(installState, { running: false, finishedAt: now(), exitCode: err ? 1 : 0, error: err ? `${step}: ${err}` : null, step: err ? step : 'done', pid: null });
      log[err ? 'warn' : 'log']?.(`[browser] install ${v.spec} ${err ? `failed at ${step} — ${err}` : `finished: ${installedCloakBin()}`}`);
      notify();
    };
    (async () => {
      try {
        if (first) { const r1 = await first; if (!r1.ok) return finish('package', `npm ${r1.error || 'failed'} — see ${installState.log}`); }
        const cli = installedCli();
        if (!cli || cli.version !== v.version) return finish('package', `the package is not ${v.spec} after npm (found ${cli ? cli.version : 'nothing'})`);
        const px = EgressProxy.create({ allowlist: () => B.cloakInstallAllowlist(proofOf()), log, ...(egressResolve ? { resolve: egressResolve } : {}) });
        try { await px.listen(); } catch (e) { return finish('binary', `the install egress proxy could not listen (${e && e.message}) — nothing was downloaded`); }
        // lane browser-propose verify r1 V3: the vendor's CLI returns a cached build AS IS when its `chrome` exists and is
        // executable (0.5.10 ensureBinary, a pinned version) and unpacks IN PLACE (extractArchive — not atomic). So a build
        // THIS install unpacked and then rejected (a SHA that is not the measured one) or cut (a full disk, a failed step)
        // would be returned as is by every later run: "Approve again" failing for ever, or a half build stamped as installed.
        // THIS install's own unpack is therefore removed when it fails, and an unpack a dead process left (the server
        // restarted mid-install) is found by its marker and removed at the next run. A build that was in the cache BEFORE
        // this install (seeded by the measure script / linked by a suite / an image) is never touched — its failure names it.
        const vdir = path.dirname(installedCloakBin() || path.join(cloakCacheDir, 'x'));
        const unpackMark = path.join(installDir, 'cloak-unpacking.json');
        try { const m0 = JSON.parse(fs.readFileSync(unpackMark, 'utf8')); if (m0 && m0.dir === vdir && !installedStamp().ok) { fs.rmSync(vdir, { recursive: true, force: true }); log.warn?.(`[browser] install: removed ${vdir} — an unpack a previous install started never finished (${m0.at ? new Date(m0.at).toISOString() : 'unknown time'})`); } } catch { /* no marker */ }
        try { fs.unlinkSync(unpackMark); } catch { /* none */ }
        const had = !!(installedCloakBin() && usableExe(installedCloakBin())); // a build already in the cache is not fetched again
        const dropOwnUnpack = () => { if (had) return; try { fs.rmSync(vdir, { recursive: true, force: true }); } catch { /* gone */ } try { fs.unlinkSync(unpackMark); } catch { /* none */ } };
        if (!had) { try { writeJsonAtomic(unpackMark, { dir: vdir, at: now() }); } catch { /* the in-run cleanup still runs */ } }
        let r2, admitted = 0;
        try { r2 = await runStep('binary', process.execPath, SW.binaryInstallArgv({ cli: cli.path }), SW.cloakInstallEnv(e0, { cacheDir: cloakCacheDir, chromium: v.chromium, proxyUrl: px.url() })); }
        finally { installState.refused = px.recent().map((x) => ({ host: x.host, why: x.why })); admitted = px.stats.allowed; await px.close().catch(() => {}); }
        if (!r2.ok) { dropOwnUnpack(); return finish('binary', `cloakbrowser install ${r2.error || 'failed'}${installState.refused.length ? ' (refused by the egress proxy: ' + installState.refused.map((x) => x.host).join(', ') + ')' : ''}${had ? '' : ' — its partial unpack was removed, so the next try downloads it again'} — see ${installState.log}`); }
        // THE EVIDENCE that the boundary held: a download that produced the browser must have gone THROUGH the proxy
        // (Node's fetch honours HTTPS_PROXY only under NODE_USE_ENV_PROXY — measured on Node 24; a Node that ignores it
        // would have fetched directly, around the allowlist) — a browser that appeared with nothing admitted is not used
        if (!had && admitted === 0) { dropOwnUnpack(); return finish('binary', `the browser was downloaded without passing the egress proxy (it admitted nothing — this Node ${process.version} may not honour NODE_USE_ENV_PROXY) — it is not used, and it was removed`); }
        installState.step = 'verify';
        const bin = installedCloakBin();
        if (!bin || !usableExe(bin)) { dropOwnUnpack(); return finish('verify', `no browser at ${bin} after the download`); }
        const want = pr && pr.binary && pr.binary.sha256;
        const got = await sha256Of(bin);
        if (want && got !== want) {
          dropOwnUnpack();
          return finish('verify', had
            ? `the browser already in the cache at ${path.dirname(bin)} (not downloaded by this install) has SHA-256 ${got}, not the measured ${want} — it is not used; remove that directory, then install again`
            : `the downloaded browser's SHA-256 ${got} is not the measured ${want} — it is not used, and it was removed (the next try downloads it again)`);
        }
        writeJsonAtomic(stampFile, { chromium: pr.chromium, version: v.version, sha256: got, path: path.relative(installDir, bin), at: now() });
        try { fs.unlinkSync(unpackMark); } catch { /* none */ }
        finish('verify', null);
      } catch (e) { finish(installState.step || 'package', e && e.message ? e.message : String(e)); }
    })();
    notify();
    return { ok: true, started: true, spec: v.spec, version: v.version, chromium: v.chromium || null, prefix: installDir, log: installState.log, pid: pid0 };
  }
  /** verify r1 (F3): a CLOAKBROWSER install that was running when VibeSpace went down — its step's process is gone now;
   *  the previous server's verify (the egress proxy's evidence, the SHA check, the stamp) never ran, so what is on disk is
   *  judged NOW: a stamp already written ⇒ it had finished; a browser whose SHA-256 is the measured one ⇒ stamped (the
   *  download had completed); anything else ⇒ failed BY NAME — install again (a finished download is reused, never
   *  fetched twice; a partial unpack is removed by the next run's own marker). */
  async function finishCloakAfterRestart(m, { stalled = false, letGo = false } = {}) {
    let e = null;
    try {
      const st = installedStamp();
      if (!st.ok) {
        const bin = installedCloakBin();
        const pr = proofOf(); const want = pr && pr.binary && pr.binary.sha256;
        if (bin && usableExe(bin) && want) {
          const got = await sha256Of(bin);
          if (got === want) writeJsonAtomic(stampFile, { chromium: pr.chromium, version: String(m.spec || '').split('@')[1] || null, sha256: got, path: path.relative(installDir, bin), at: now() });
          else e = `VibeSpace restarted during the install (step ${m.step || '?'}); the browser on disk has SHA-256 ${got}, not the measured ${want} — it is not used; remove ${path.dirname(bin)} and install again`;
        } else e = stalled ? `VibeSpace restarted during the install, and its ${stalledWords(`${m.step || 'package'} step`)}` : letGo ? `VibeSpace restarted during the install; its ${m.step || 'package'} step (pid ${m.pid}) ran past its deadline and could not be proven to be it — VibeSpace stopped waiting; install again` : `VibeSpace restarted during the install (step ${m.step || '?'}) — it was not verified; install again (a finished download is reused, not fetched twice)`;
      }
    } catch (x) { e = `VibeSpace restarted during the install — ${x && x.message ? x.message : String(x)}; install again`; }
    try { fs.rmSync(installMarker(), { force: true }); } catch { /* none */ }
    Object.assign(installState, { running: false, finishedAt: now(), exitCode: e ? 1 : 0, error: e ? `${m.step || 'package'}: ${e}` : null, step: e ? (m.step || 'package') : 'done', pid: null });
    log[e ? 'warn' : 'log']?.(`[browser] CloakBrowser install ${m.spec} after a restart: ${e || 'verified from what it left — installed'}`);
    notify();
  }
  const ROW = { id: 'cloak', words: () => 'CloakBrowser', logName: 'CloakBrowser', markSteps: true, afterRestart: finishCloakAfterRestart };
  return { row: ROW, api: { installVerdict, installCloak, installedCloakBin, installedStamp, cloakCacheDir } };
}

module.exports = { create };

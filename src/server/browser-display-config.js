'use strict';
/**
 * ORCH (fs) — THE KEEPER'S HALF of lane headless-fallback (2026-09-28; the rule is PURE src/browser-display.js, the
 * probe SHARED src/browser-facts.js `probeDisplay`). Two jobs, both small, kept out of browser-keeper.js so the two
 * other lanes editing that file see call sites, not a block:
 *
 *   factFor({baseFile | cfg, headedEnv, prev, mode})  — at a LAUNCH: probe THIS machine's display now, plan the launch the
 *        config it would run with wants, and return the FACT the keeper records on the browser record (`rec.display`;
 *        persisted with the registry, broadcast with the digest, handed to the agent with its browser).
 *   fileFor(baseFile, fact)                     — at EVERY call of that browser (the launch, the keeper's own
 *        cdp-url / info / close, the live view's stream calls, the agent's commands through /resolve): the config file
 *        it names. The fact says nothing changes ⇒ the base file itself; it says the launch fell back ⇒ the base file's
 *        content with the plan applied, written ONCE beside the keeper's files under data/browser-env/display/ and
 *        re-written only when its content changes. Measured on 0.38.1: a call whose view (headed, args) differs from
 *        the launch RELAUNCHES the browser — so every call of the record re-derives the SAME file from the SAME fact
 *        until the next launch probes again. The user's own config file is never written.
 *   engineFileFor(file, view)                   — lane engine-plugin: a conversation's browser launched on a browser ENGINE
 *        names, at every call, the file it names anyway + the engine's program (`executablePath` — lane engine-args-string
 *        r2: the keeper's WRAPPER, which carries the engine's switches whole) and, in `args`, the keeper's part of the
 *        switches (every name the engine gives removed; the driver's ONE comma-separated line) — the same derived-file
 *        rule (written once, re-written only when its content changes), so the agent's own commands carry the launch's
 *        view and never relaunch it on Chrome (the measured relaunch rule).
 *   engineWrapperFor(name, spec) / dropEngineWrapper(name) — lane engine-args-string r2: THE ENGINE'S WRAPPER of one
 *        profile (`engine-<id>.sh` here, 0700, atomic, re-written when its text changes, removed with the profile).
 *   tailnetFileFor(file, stamp)                 — lane tailnet-names: a browser LAUNCHED with the tailnet PAC (`rec.tailnet.arg`,
 *        comma-free) names, at every call, the file it names anyway + that one switch last on the driver's line — the same
 *        derived-file rule, so no call's view differs from the launch (a differing view relaunches Chrome).
 *
 * Never throws: a base file that cannot be read, or a dir that cannot be written, leaves the call on its base file
 * (said once in the journal — the launch then fails as it did before this lane, never worse).
 * One exception, FAIL-CLOSED (lane engine-spi-egress r2): engineFileFor of a WRAPPED view whose program is not the keeper's
 * wrapper throws (code egress_proxy_missing) — a browser that must stay inside its egress proxy is never named without it.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const D = require('../browser-display.js');
const V = require('../browser-verbs.js'); // lane engine-args-string: THE one writer of the driver's `args` + the keeper | engine split
const ENG = require('../browser-engines.js'); // lane engine-args-string r2: the engine's wrapper text (PURE)

function create({ dir, writeJson, log = console, env = () => ({}), probe = null, now = Date.now, noDesktopWindow = undefined, vncDisplay = null } = {}) { // noDesktopWindow: H5's switch for a gate (undefined = the module's default, OFF in 2.369.200)
  if (!dir) throw new Error('browser-display-config: dir is required');
  const memo = new Map();
  const said = new Set();
  const say = (key, line) => { if (said.has(key)) return; said.add(key); try { log.warn?.(`[browser] ${line}`); } catch { /* none */ } };
  const readCfg = (file) => { try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
  const probeNow = async () => {
    try {
      if (typeof probe === 'function') return await probe();
      return await require('../browser-facts.js').probeDisplay({ env: env() || {}, vncDisplay }); // B-d635: the server's own VNC desktop (null in a test: hermetic)
    } catch (e) {
      const v = D.displayVerdict({ env: {}, runtimeDir: null, entries: [] });
      v.why = [`the display probe failed: ${e && e.message}`];
      return v;
    }
  };
  /** THE LAUNCH'S FACT (async: the probe stats + connects). `cfg` wins over `baseFile`; neither ⇒ `{}` (headless by default).
   *  `preference` (lane hooks-create H5) = `browser.headed` as the keeper reads it (true | false | null = unset), handed
   *  by every keeper launch: an UNSET preference is resolved HERE against the display just probed (PURE resolveHeaded —
   *  no desktop + Xvfb + auto ⇒ a window ⇒ the hidden-window rung), and the fact says so (`wanted.byDefault`) so every
   *  later call of the record names the same planned file. Omitted (an older caller) ⇒ today's meaning. */
  async function factFor({ baseFile = null, cfg = null, headedEnv = null, prev = null, mode = 'auto', preference } = {}) {
    const base = (cfg && typeof cfg === 'object') ? cfg : (baseFile ? readCfg(baseFile) : null) || {};
    const display = await probeNow();
    let env = headedEnv, byDefault = false;
    if (preference !== undefined && (headedEnv === null || headedEnv === undefined)) {
      const r = D.resolveHeaded({ setting: preference, display, mode, ...(noDesktopWindow === undefined ? {} : { noDesktopWindow }) });
      if (r.why === 'no-desktop') { env = true; byDefault = true; }
    }
    const wanted = D.wantedOf(base, { headedEnv: env });
    const plan = D.launchPlan({ wanted, display, mode }); // `mode` = browser.noDisplayMode (auto: the hidden window where Xvfb is here)
    return D.displayFact({ display, plan, wanted, prev, at: now(), mode, byDefault });
  }
  /** The file a call of a browser whose record carries `fact` names (sync — every runtime call goes through it). */
  function fileFor(baseFile, fact, { headedEnv = null } = {}) {
    if (!baseFile || !D.planApplies(fact)) return baseFile;
    const base = readCfg(baseFile);
    if (!base) { say(`read:${baseFile}`, `the display plan could not read ${baseFile} — its calls keep that file (a launch told headless by its env still starts)`); return baseFile; }
    const plan = D.planForFact(base, fact, { headedEnv });
    if (!plan.changed) return baseFile;
    const cfg = D.applyPlan(base, plan);
    const tag = crypto.createHash('sha1').update(String(baseFile)).digest('hex').slice(0, 10);
    const file = path.join(dir, `${path.basename(baseFile).replace(/\.json$/, '')}-${tag}.json`);
    return derived(file, cfg, baseFile, 'the display plan\'s config');
  }
  /** THE DERIVED FILE's rule (the display plan's and — lane engine-plugin — the engine view's): written once, re-written only
   *  when its content changes; the memo names the file only while it is still ours (a regular file of this uid with exactly
   *  this content — lstat: a symlink swapped in is not followed) — the keeper's machine-file rule (takeover r4). A file that
   *  cannot be written leaves the call on `fallback` (said once). */
  function derived(file, cfg0, fallback, what) {
    // lane engine-args-string: `args` leaves through THE one writer — a list is joined into the driver's ONE line (a list in the
    // file is refused whole by the driver: «invalid type: sequence, expected a string»); a switch that line cannot carry is said
    const a = V.driverArgsText(cfg0.args);
    if (!a.ok) { say(`args:${file}`, `${what} could not be written at ${file}: ${a.error} — the browser's calls keep ${fallback}`); return fallback; }
    const cfg = a.args === cfg0.args ? cfg0 : { ...cfg0, args: a.args };
    const text = JSON.stringify(cfg, null, 2);
    const own = () => { try { const st = fs.lstatSync(file); return st.isFile() && !st.isSymbolicLink() && (typeof process.getuid !== 'function' || st.uid === process.getuid()) && fs.readFileSync(file, 'utf8') === text; } catch { return false; } };
    if (memo.get(file) === text && own()) return file;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeJson(file, cfg);
      const back = readCfg(file);
      if (!back) throw new Error('read-back was not an object');
      memo.set(file, text);
      return file;
    } catch (e) {
      say(`write:${file}`, `${what} could not be written at ${file} (${e && e.message}) — the browser's calls keep ${fallback}`);
      return fallback;
    }
  }
  /** lane engine-plugin: the file a call of a browser launched on an ENGINE names — `baseFile`'s content + the engine's
   *  `{executablePath, args}` (sync, like fileFor). No view ⇒ the base file itself. */
  function engineFileFor(baseFile, view) {
    if (!baseFile || !view || typeof view.executablePath !== 'string' || !view.executablePath.startsWith('/')) return baseFile;
    const base = readCfg(baseFile);
    if (!base) { say(`eread:${baseFile}`, `the engine view could not read ${baseFile} — its calls keep that file`); return baseFile; }
    const extra = Array.isArray(view.args) ? view.args.map(String) : [];
    // lane engine-args-string r2 — THE WRAPPER ROAD: `view.executablePath` is the keeper's wrapper (engineWrapperFor), which
    // carries the engine's switches (`view.args`) whole; the driver's `args` keep only the keeper's part of the split (every name
    // the engine gives leaves it — browser-verbs splitLaunchArgs), written by derived() as the driver's one comma-free line
    // lane engine-spi-egress r2: a WRAPPED view (`view.wrapped`: its proxy switches ride the keeper's wrapper, last) — FAIL-CLOSED: its
    // program must be this keeper's wrapper (else the proxy would be silently dropped: refused, the call never runs); the base
    // file's proxy switches are dropped (Chromium ranks a pac url / no-proxy above --proxy-server) and the list is always written
    const wrapped = view.wrapped === true;
    if (wrapped && !(path.dirname(view.executablePath) === dir && /^engine-[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.sh$/.test(path.basename(view.executablePath)))) throw Object.assign(new Error(`the browser's egress proxy rides its engine wrapper, and ${view.executablePath} is not the keeper's — the call was refused, never run outside its proxy`), { code: 'egress_proxy_missing' });
    // lane engine-spi-egress L1b r6: the person's own list keeps switches only on a wrapped launch — what it drops is said once
    const w = wrapped ? ENG.wrappedOwnArgs(V.driverArgsList(base.args)) : null;
    if (w && w.dropped.length) say(`own-nonswitch:${baseFile}:${w.dropped.join('\u0000')}`, `${baseFile} names ${w.dropped.slice(0, 3).map((a) => `«${String(a).slice(0, 40)}»`).join(', ')} — not a switch, so it is left out of the wrapped engine view (a bare -- would put VibeSpace's proxy switches after the end of the browser's switches)`);
    const kept = w ? w.args : base.args;
    const cfg = { ...base, executablePath: view.executablePath, ...(extra.length || wrapped ? { args: V.splitLaunchArgs(kept, extra).keeper } : {}) };
    const tag = crypto.createHash('sha1').update(String(baseFile) + '\u0000' + view.executablePath + '\u0000' + extra.join('\u0000') + (wrapped ? '\u0000wrapped' : '')).digest('hex').slice(0, 10);
    const file = path.join(dir, `${path.basename(baseFile).replace(/\.json$/, '')}-engine-${tag}.json`);
    return derived(file, cfg, baseFile, 'the engine view\'s config');
  }
  /** lane tailnet-names: the file a call of a browser launched with the tailnet PAC names — `baseFile`'s content, its own PAC
   *  switch (if any) left out, + `stamp.arg` last (sync, like fileFor). No switch on the stamp ⇒ the base file itself. */
  function tailnetFileFor(baseFile, stamp) {
    const arg = stamp && typeof stamp.arg === 'string' ? stamp.arg : '';
    if (!baseFile || !/^--proxy-pac-url=http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9._/-]*$/.test(arg)) return baseFile;
    const base = readCfg(baseFile);
    if (!base) { say(`tread:${baseFile}`, `the tailnet road could not read ${baseFile} — its calls keep that file (tailnet names are not reached through it)`); return baseFile; }
    const cfg = { ...base, args: [...V.driverArgsList(base.args).filter((a) => !/^--?proxy-pac-url(?:=|$)/.test(a)), arg] };
    const tag = crypto.createHash('sha1').update(String(baseFile) + '\u0000' + arg).digest('hex').slice(0, 10);
    const file = path.join(dir, `${path.basename(baseFile).replace(/\.json$/, '')}-tailnet-${tag}.json`);
    return derived(file, cfg, baseFile, 'the tailnet road\'s config');
  }
  /** lane engine-args-string r2: THE ENGINE'S WRAPPER of one profile — `<dir>/engine-<name>.sh` (`name` = the profile id: one
   *  per profile, which runs one engine at a time), its text src/browser-engines.js engineWrapperText. Written 0700 through a
   *  temporary file renamed over it (atomic), RE-WRITTEN at a launch only when its text changes (the derived rule: a regular
   *  file of this uid, mode 0700, exactly this text — lstat, a planted link is replaced, never followed). Never under /tmp
   *  (the keeper's own browser-env dir). → `{ok:true, file}` | `{ok:false, code, error}` (never throws). */
  const wrapperFile = (name) => path.join(dir, `engine-${name}.sh`);
  function engineWrapperFor(name, spec) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(String(name || ''))) return { ok: false, code: 'browser_engine_wrapper', error: `the engine's launch wrapper cannot be written: ${JSON.stringify(String(name).slice(0, 40))} is not a file name` };
    const w = ENG.engineWrapperText(spec);
    if (!w.ok) return w;
    const file = wrapperFile(name);
    const own = () => { try { const st = fs.lstatSync(file); return st.isFile() && !st.isSymbolicLink() && (st.mode & 0o777) === 0o700 && (typeof process.getuid !== 'function' || st.uid === process.getuid()) && fs.readFileSync(file, 'utf8') === w.text; } catch { return false; } };
    if (memo.get(file) === w.text && own()) return { ok: true, file };
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(tmp, w.text, { mode: 0o700 });
      fs.chmodSync(tmp, 0o700);
      fs.renameSync(tmp, file);
      memo.set(file, w.text);
      return { ok: true, file };
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* none */ }
      return { ok: false, code: 'browser_engine_wrapper', error: `the engine's launch wrapper could not be written at ${file} (${e && e.message})` };
    }
  }
  /** …removed with its profile (the keeper's removeProfile). */
  function dropEngineWrapper(name) { if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(String(name || ''))) return; const f = wrapperFile(name); memo.delete(f); try { fs.rmSync(f, { force: true }); } catch { /* best effort */ } }
  return { factFor, fileFor, engineFileFor, tailnetFileFor, engineWrapperFor, dropEngineWrapper, probe: probeNow, dir };
}

module.exports = { create };

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
 *
 * Never throws: a base file that cannot be read, or a dir that cannot be written, leaves the call on its base file
 * (said once in the journal — the launch then fails as it did before this lane, never worse).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const D = require('../browser-display.js');

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
    const text = JSON.stringify(cfg, null, 2);
    // the memo names the file only while it is still ours (a regular file of this uid with exactly this content —
    // lstat: a symlink swapped in is not followed) — the keeper's machine-file rule (takeover r4)
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
      say(`write:${file}`, `the display plan's config could not be written at ${file} (${e && e.message}) — the browser's calls keep ${baseFile}`);
      return baseFile;
    }
  }
  return { factFor, fileFor, probe: probeNow, dir };
}

module.exports = { create };

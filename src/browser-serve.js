'use strict';
/**
 * THE `browser-serve` OP TABLE + RUNNER — SHARED (node builtins + the PURE
 * model + browser-facts; the daemon bundles it). docs/design-agent-browser-v2
 * §3.6 row 3 / §7.3 / D5 (b): a profile browser on a PAIRED machine is
 * started, asked and stopped WHERE IT RUNS, by the very code the hub runs for
 * its own machine — `hostId` is a parameter of whoever picks the transport
 * (src/server/browser-access.js), and this file is what runs at the far end
 * of every rung: in-process for device #0, inside the agentd for a paired
 * device.
 *
 * THE MACHINE OWNS ITS DIRECTORY. The hub names a PROFILE ID; the machine
 * composes `~/.agent-browser/vs-bp-<id>` itself (0700, the CLI's own root so
 * `agent-browser profiles` lists it there too) and answers the path it used.
 * A hub can therefore never point a device at an arbitrary directory, and the
 * profile record on the hub carries `dir: null` for a remote profile — the
 * design's "a registry, not a copy" rule read across machines.
 *
 * THE CDP URL A MACHINE ANSWERS IS ITS OWN LOOPBACK (§6.1). It never listens
 * on a LAN: the hub reaches it through the daemon's mux (`tcpForward` of the
 * port this op reports), and rewrites host:port to its local forward.
 *
 * Every op answers a plain-JSON object with `ok` and, on failure, `code` +
 * `error` — never a throw across the wire (the daemon relays the object).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('./browser-profiles.js');
const F = require('./browser-facts.js');
const BB = require('./browser-builds.js'); // lane browser-admin 2a: this machine's Chrome builds + the ONE verdict
const { REAL_BINARY } = require('./browser-verbs.js'); // lane remote-profile-start: the CLI's name, spelled once (the steps are the USER's)

/** The closed op set — a caller cannot invent one (unknown ops on an old
 *  daemon hang; unknown ops here are refused by name). */
const BROWSER_SERVE_OPS = Object.freeze(['version', 'status', 'start', 'stop', 'cdp-url', 'builds', 'remove']); // lane browser-admin 2a: + builds (capability `browser-builds` — an older daemon is never asked); lane remote-profile-start: + remove (capability `browser-remove`)

/** ONE facts instance per PROCESS (the daemon keeps it in a module-level
 *  variable, never on a connection — a dial-out device reconnects on every
 *  link blip). `env` is the SANITISED base env (the hub hands agentEnv(); the
 *  daemon its own process.env, which never carried the hub's secrets). */
function install({ env = process.env, homeDir = os.homedir(), log = null, cmd = 'agent-browser', execFileImpl = undefined, displayProbe = null, platform = process.platform, fsx = null } = {}) {
  const facts = F.createBrowserFacts({ env, cmd, ...(execFileImpl ? { execFileImpl } : {}) });
  const runtime = F.createBrowserRuntime({ env, cmd, log, ...(execFileImpl ? { execFileImpl } : {}) });
  // lane headless-fallback: the display probe runs HERE, where the browser runs (injectable for the gate)
  // lane remote-profile-start: the machine's platform + env + file reads (injectable: the gate's fake win32 / darwin machines)
  return { facts, runtime, homeDir: String(homeDir), cmd, displayProbe: typeof displayProbe === 'function' ? displayProbe : () => F.probeDisplay({ env }), platform: String(platform), env, fsx: fsx || FSX };
}

/**
 * LANE HEADLESS-FALLBACK (2026-09-28) — the machine's half of "headed is a preference, the display is a fact". The
 * CLI here reads this machine's own ~/.agent-browser/config.json (nothing names another), so a launch whose window
 * this machine cannot draw (no desktop session / a pinned ozone platform it does not have) runs with the PLANNED
 * copy of that file (PURE browser-display.js), written at `planFileOf` and named on the launch AND on every later
 * op of the profile (a call whose view differs relaunches the browser — measured on 0.38.1); a launch that changes
 * nothing removes it, so its existence IS the view. The user's file is never written.
 */
const planFileOf = (bs, ns) => path.join(bs.homeDir, '.vibespace', 'browser-serve', ns + '.json');
function planEnvOf(bs, ns) {
  const f = planFileOf(bs, ns);
  try { return fs.statSync(f).isFile() ? { AGENT_BROWSER_CONFIG: f } : null; } catch { return null; }
}
async function planLaunch(bs, ns, headed, mode = 'auto') {
  const D = require('./browser-display.js');
  let user = {};
  try { const v = JSON.parse(fs.readFileSync(path.join(bs.homeDir, '.agent-browser', 'config.json'), 'utf8')); if (v && typeof v === 'object' && !Array.isArray(v)) user = v; } catch { /* the CLI's own default */ }
  let display;
  try { display = await bs.displayProbe(); } catch (e) { display = D.displayVerdict({ env: {}, runtimeDir: null, entries: [] }); display.why = [`the display probe failed: ${e && e.message}`]; }
  // lane hooks-create H5: the hub sends the window preference AS STORED; an unset one is resolved against THIS machine's
  // display (no desktop + Xvfb + auto ⇒ the hidden-window rung) — the hub's own display never decides a paired machine's
  // (2.369.200: the rule's switch D.NO_DESKTOP_WINDOW_DEFAULT is OFF — an unset preference inherits, as in .199)
  const r = D.resolveHeaded({ setting: headed, display, mode });
  const byDefault = r.why === 'no-desktop';
  const wanted = D.wantedOf(user, { headedEnv: byDefault ? true : headed });
  const plan = D.launchPlan({ wanted, display, mode }); // `mode` = the hub's browser.noDisplayMode (an older hub sends none ⇒ auto)
  const fact = D.displayFact({ display, plan, wanted, at: Date.now(), mode, byDefault });
  const f = planFileOf(bs, ns);
  if (!plan.changed) { try { fs.unlinkSync(f); } catch { /* none */ } return { fact, env: { ...fact.env }, headed }; }
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(D.applyPlan(user, plan), null, 2), { mode: 0o600 });
    fs.renameSync(tmp, f);
  } catch (e) { fact.why = [...(fact.why || []), `the planned config could not be written (${e && e.message})`]; return { fact, env: { ...fact.env }, headed: plan.headed }; }
  // the planned file carries `headed` itself — the launch names no HEADED of its own, so its view equals every later op's
  // (a hidden-window launch also clears a named display in its own env — fact.env — so the CLI starts its Xvfb)
  return { fact, env: { ...fact.env, AGENT_BROWSER_CONFIG: f }, headed: null };
}

/**
 * LANE BROWSER-ADMIN 2a — THE CHOSEN BUILD rides EVERY op of the profile's session (a call whose launch view differs
 * relaunches Chrome — measured on 0.38.1, the rule the hub's keeper keeps with `rec.launchEnv`): the start writes the
 * executable it was asked to run beside the planned config (`<ns>.build.json`, 0600) and every later op of that
 * namespace names it; a start with the default build removes it, so its existence IS the view. The machine resolves a
 * build BY VERSION in its OWN list (the hub never points a machine at a path it did not name itself — a `path` choice
 * is the user's own, judged here as a file).
 */
const buildFileOf = (bs, ns) => path.join(bs.homeDir, '.vibespace', 'browser-serve', ns + '.build.json');
function buildEnvOf(bs, ns) {
  try { const v = JSON.parse(fs.readFileSync(buildFileOf(bs, ns), 'utf8')); return v && typeof v.executablePath === 'string' && v.executablePath.startsWith('/') ? { AGENT_BROWSER_EXECUTABLE_PATH: v.executablePath } : null; } catch { return null; }
}
const viewEnvOf = (bs, ns) => { const a = planEnvOf(bs, ns), b = buildEnvOf(bs, ns); return a || b ? { ...(a || {}), ...(b || {}) } : null; };
function writeBuildView(bs, ns, executablePath) {
  const f = buildFileOf(bs, ns);
  if (!executablePath) { try { fs.unlinkSync(f); } catch { /* none */ } return; }
  fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
  const tmp = f + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ executablePath }), { mode: 0o600 });
  fs.renameSync(tmp, f);
}

/** The profile's namespace + the directory THIS machine owns for it. */
function placeOf(bs, profileId) {
  const id = String(profileId || '');
  if (!B.isProfileId(id)) return { ok: false, code: 'bad-request', error: `browser-serve needs a profile id (bp-<8 hex>), got ${JSON.stringify(profileId)}` };
  return { ok: true, id, ns: B.sessionNameFor(id), dir: path.join(bs.homeDir, '.agent-browser', B.profileDirName(id)) };
}

/**
 * LANE REMOTE-PROFILE-START (design 014 lane 3b, part 1) — CAN A BROWSER RUN ON THIS MACHINE? Read HERE with file checks
 * only (never a launch, never a download): the agent-browser CLI (posix: the very resolver the runtime runs; win32: PATH ×
 * PATHEXT + npm's global bin — the exec bit means nothing there) and a Chrome it would find (its own downloads under
 * ~/.agent-browser/browsers, the system installs agent-browser 0.38.1 looks for — read from its binaries' strings — and
 * the Playwright / Puppeteer caches it also reads). `step` = the ONE thing to run on this machine, for ITS platform
 * (`browser_cli_missing` | `browser_missing`), or null. Never an installer: the user runs the step (the brief's rule).
 * A handle without the facts (an older fake) is never claimed missing.
 */
const FSX = Object.freeze({
  exists: (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } },
  list: (d) => { try { return fs.readdirSync(d); } catch { return null; } },
});
const envOf = (env, name) => { if (!env) return ''; if (env[name] != null) return String(env[name]); const k = Object.keys(env).find((x) => x.toLowerCase() === name.toLowerCase()); return k ? String(env[k]) : ''; }; // win32 names are case-blind (`Path`)
// the USER's one command per platform (shown on cookie routes only — an agent's answer carries the sentence, never the
// command: installing a program on the owner's machine is the user's act; §52b keeps the CLI's name out of literals)
const STEP_COMMANDS = Object.freeze({
  browser_cli_missing: Object.freeze({ win32: `npm install -g ${REAL_BINARY}; ${REAL_BINARY} install`, other: `npm install -g ${REAL_BINARY} && ${REAL_BINARY} install` }),
  browser_missing: Object.freeze({ win32: `${REAL_BINARY} install`, other: `${REAL_BINARY} install` }),
});
/** → {code, command, shell} — `shell` names where it is typed ('powershell' on Windows, 'sh' elsewhere). */
function stepFor(code, platform) { const c = STEP_COMMANDS[code]; if (!c) return null; const win = platform === 'win32'; return { code, command: win ? c.win32 : c.other, shell: win ? 'powershell' : 'sh' }; }
function cliFact(bs) {
  const plat = bs.platform || process.platform, fx = bs.fsx || FSX, env = bs.env || {};
  if (plat !== 'win32') {
    if (!bs.facts || typeof bs.facts.binPath !== 'function') return { found: true, path: null, known: false };
    const p = bs.facts.binPath();
    return { found: !!p, path: p || null, known: true };
  }
  const W = path.win32;
  const exts = (envOf(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';').map((x) => x.trim()).filter(Boolean);
  const dirs = envOf(env, 'PATH').split(';').map((x) => x.trim()).filter(Boolean);
  const appData = envOf(env, 'APPDATA'); if (appData) dirs.push(W.join(appData, 'npm')); // npm's global bin, even when the agent's PATH lacks it
  for (const d of dirs) for (const x of exts) { const f = W.join(d, REAL_BINARY + x); if (fx.exists(f)) return { found: true, path: f, known: true }; }
  return { found: false, path: null, known: true };
}
function browserFact(bs) {
  const plat = bs.platform || process.platform, fx = bs.fsx || FSX, env = bs.env || {}, home = bs.homeDir;
  const P = plat === 'win32' ? path.win32 : path.posix;
  const downloads = path.join(home, '.agent-browser', 'browsers'); // the machine's own path module (placeOf's)
  if ((fx.list(downloads) || []).some((n) => BB.BUILD_DIR_RE.test(n))) return { found: true, kind: 'downloaded', path: downloads };
  const cands = [];
  const lad = envOf(env, 'LOCALAPPDATA');
  if (plat === 'win32') {
    for (const base of [envOf(env, 'ProgramFiles') || 'C:\\Program Files', envOf(env, 'ProgramFiles(x86)') || 'C:\\Program Files (x86)', lad].filter(Boolean)) cands.push(P.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), P.join(base, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
  } else if (plat === 'darwin') {
    for (const app of ['Google Chrome', 'Google Chrome Canary', 'Chromium', 'Brave Browser']) cands.push(`/Applications/${app}.app/Contents/MacOS/${app}`);
  } else {
    for (const d of envOf(env, 'PATH').split(':').filter(Boolean)) for (const n of ['google-chrome', 'google-chrome-stable', 'google-chrome-unstable', 'chromium', 'chromium-browser', 'brave-browser', 'brave-browser-stable']) cands.push(P.join(d, n));
  }
  for (const c of cands) if (fx.exists(c)) return { found: true, kind: 'system', path: c };
  const pw = envOf(env, 'PLAYWRIGHT_BROWSERS_PATH') || (plat === 'win32' ? (lad ? P.join(lad, 'ms-playwright') : '') : plat === 'darwin' ? P.join(home, 'Library', 'Caches', 'ms-playwright') : P.join(home, '.cache', 'ms-playwright'));
  if (pw && (fx.list(pw) || []).some((n) => /^chromium/.test(n))) return { found: true, kind: 'playwright', path: pw };
  const pp = envOf(env, 'PUPPETEER_CACHE_DIR') ? P.join(envOf(env, 'PUPPETEER_CACHE_DIR'), 'chrome') : P.join(home, '.cache', 'puppeteer', 'chrome');
  if ((fx.list(pp) || []).length) return { found: true, kind: 'puppeteer', path: pp };
  return { found: false, kind: null, path: null };
}
/** → {platform, cli, browser, step} (the `builds` op's `ready`; the New profile dialog's machine row reads it). */
function machineReady(bs) {
  const plat = bs.platform || process.platform;
  const cli = cliFact(bs), browser = browserFact(bs);
  return { platform: plat, cli: { found: cli.found, path: cli.path }, browser, step: !cli.found ? stepFor('browser_cli_missing', plat) : !browser.found ? stepFor('browser_missing', plat) : null };
}

const STOP_GRACE_MS = 8000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run ONE op. `bs` is install()'s handle. Shapes:
 *   version                 → {ok, version|null, floor}
 *   status  {profileId}     → {ok, active, pid, starttime, socketDir, version, dir}
 *   start   {profileId, idleMs?, headed?, noDisplayMode?} → {ok, pid, starttime, socketDir, cdpUrl, cdpPort, dir, active, display}
 *   stop    {profileId}     → {ok, closed, left|null}
 *   cdp-url {profileId}     → {ok, url, port}
 *   builds                  → {ok, listing, ready}   (lane browser-admin 2a: this machine's Chrome builds — browser-builds.js;
 *                             lane remote-profile-start: `ready` = machineReady, can a browser run here at all)
 *   remove  {profileId}     → {ok, removed, dir, views}   (lane remote-profile-start: the profile's OWN folder, composed here)
 *   start   {…, browser?}  — the chosen build ({kind:'build', version} | {kind:'path', path}), judged on this machine
 */
async function runBrowserServeOp(bs, action, params = {}) {
  const op = String(action || '');
  if (!BROWSER_SERVE_OPS.includes(op)) return { ok: false, code: 'bad-request', error: `unknown browser-serve op ${JSON.stringify(op)} — one of ${BROWSER_SERVE_OPS.join(', ')}` };
  const p = params && typeof params === 'object' ? params : {};
  if (op === 'version') {
    const v = await bs.facts.probeVersion();
    return { ok: true, version: v, floor: B.floorVerdict(v, B.FLOOR_VERSION), cmd: bs.cmd };
  }
  // lane browser-admin 2a: THIS machine's Chrome builds (never a profile's — the list is the machine's)
  if (op === 'builds') return { ok: true, listing: BB.buildsView(BB.listBuilds({ homeDir: bs.homeDir })), ready: machineReady(bs) };
  const place = placeOf(bs, p.profileId);
  if (!place.ok) return place;
  const { ns, dir } = place;
  if (op === 'status') {
    const info = await bs.runtime.info(ns, { dir });
    const starttime = info.pid ? F.procStart(info.pid) : null;
    return { ok: true, active: !!info.active, pid: info.pid, starttime, socketDir: info.socketDir, version: info.version, dir, exists: dirExists(dir) };
  }
  if (op === 'start') {
    // lane remote-profile-start: no CLI here ⇒ refused BY NAME with the one step, before anything is created on this machine
    { const cli = cliFact(bs); if (!cli.found) { const step = stepFor('browser_cli_missing', bs.platform || process.platform); return { ok: false, code: 'browser_cli_missing', error: 'no browser can start on this machine: the browser tool VibeSpace runs is not installed here — the user installs it once on this machine (the Agent browser panel names the one command)', step }; } }
    try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch (e) { return { ok: false, code: 'dir_unwritable', error: `cannot create the profile directory ${dir}: ${e.message}` }; }
    const headed = p.headed === true || p.headed === 'yes' ? true : (p.headed === false || p.headed === 'no' ? false : null);
    // lane headless-fallback: this machine's display, now — the launch runs with the plan and answers the fact
    const plan = await planLaunch(bs, ns, headed, p.noDisplayMode === 'headless' ? 'headless' : 'auto');
    // lane browser-admin 2a: the chosen build, judged HERE (this machine's list / file) — gone ⇒ refused by name, never
    // a silent fall back; the hub already decided it is the user's choice
    let buildEnv = {};
    const choice = BB.normalizeBrowserChoice(p.browser);
    if (p.browser != null && !choice) return { ok: false, code: 'browser_choice_invalid', error: 'the start named a browser build that is not one' };
    if (choice && choice.kind !== 'default') {
      const bv = BB.browserChoiceVerdict({ choice, by: 'user', builds: choice.kind === 'build' ? BB.listBuilds({ homeDir: bs.homeDir }) : null, pathFact: choice.kind === 'path' ? BB.fileFact(choice.path) : null, machine: os.hostname() });
      if (!bv.ok) return { ok: false, code: bv.code === 'browser_build_not_executable' ? 'browser_build_missing' : bv.code, error: bv.error, display: plan.fact };
      buildEnv = { AGENT_BROWSER_EXECUTABLE_PATH: bv.executablePath };
    }
    try { writeBuildView(bs, ns, buildEnv.AGENT_BROWSER_EXECUTABLE_PATH || null); } catch (e) { return { ok: false, code: 'launch_failed', error: `the launch view could not be written (${e && e.message})`, display: plan.fact }; }
    const r = await bs.runtime.launch(ns, { dir, idleMs: Number(p.idleMs) || 0, headed: plan.headed, extraEnv: { ...plan.env, ...buildEnv } });
    // lane remote-profile-start: the CLI's OWN verdict that it found no Chrome (never guessed from a list) ⇒ by name, with the step
    if (!r.ok && /No Chrome binary found/i.test([r.stderr, r.error, r.stdout].filter(Boolean).join('\n'))) { const step = stepFor('browser_missing', bs.platform || process.platform); return { ok: false, code: 'browser_missing', error: 'no browser can start on this machine: there is no Chrome here for it to run — the user installs one once on this machine (the Agent browser panel names the one command)', step, display: plan.fact }; }
    if (!r.ok) return { ok: false, code: 'launch_failed', error: `the browser did not start: ${(r.stderr || r.error || r.stdout || '').trim().slice(0, 300)}`, display: plan.fact };
    const info = await bs.runtime.info(ns, { dir });
    if (!info.active) return { ok: false, code: 'launch_failed', error: 'the daemon did not report itself active after open', display: plan.fact };
    // …and this op's own cdp-url asks under the LAUNCH's view (the planned file, its idle, its HEADED) — a differing view
    // relaunches the browser on 0.38.1 (measured by the keeper's lane H; this op asked with none before)
    const view = { ...(viewEnvOf(bs, ns) || {}), AGENT_BROWSER_IDLE_TIMEOUT_MS: String(Math.max(0, Number(p.idleMs) || 0)), ...(plan.headed === true ? { AGENT_BROWSER_HEADED: '1' } : plan.headed === false ? { AGENT_BROWSER_HEADED: '0' } : {}) };
    const cdp = await bs.runtime.cdpUrl(ns, { dir, extraEnv: view });
    const cdpUrl = cdp.ok ? cdp.url : null;
    return { ok: true, active: true, pid: info.pid, starttime: info.pid ? F.procStart(info.pid) : null, socketDir: info.socketDir, version: info.version, cdpUrl, cdpPort: cdpUrl ? B.cdpPortOf(cdpUrl) : null, dir, display: plan.fact };
  }
  if (op === 'cdp-url') {
    const cdp = await bs.runtime.cdpUrl(ns, { dir, extraEnv: viewEnvOf(bs, ns) });
    if (!cdp.ok) return { ok: false, code: 'no_cdp', error: `no CDP url for ${ns}: ${(cdp.raw && (cdp.raw.stderr || cdp.raw.error)) || 'the browser is not running'}` };
    return { ok: true, url: cdp.url, port: B.cdpPortOf(cdp.url) };
  }
  // lane remote-profile-start: REMOVE — the profile's OWN folder (placeOf composed it from the id; the hub never names a
  // path) and its two launch views; a running browser is refused (its folder is in use), a link / file there is LEFT and
  // said; a link is never followed (lstat) — nothing outside ~/.agent-browser/vs-bp-<id> is touched
  if (op === 'remove') {
    const st = await bs.runtime.info(ns, { dir });
    if (st && st.active) return { ok: false, code: 'running', error: `its browser is running here (${ns}) — stop it first; its folder ${dir} was left`, dir };
    let lst = null; try { lst = fs.lstatSync(dir); } catch { lst = null; }
    if (lst && !lst.isDirectory()) return { ok: false, code: 'not_a_folder', error: `${dir} is ${lst.isSymbolicLink() ? 'a link' : 'not a folder'} — left as it is`, dir };
    if (lst) { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 }); } catch (e) { return { ok: false, code: 'remove_failed', error: `could not delete ${dir}: ${e && e.message}`, dir }; } }
    let views = 0; for (const f of [planFileOf(bs, ns), buildFileOf(bs, ns)]) { try { fs.unlinkSync(f); views++; } catch { /* none */ } }
    return { ok: true, removed: !!lst, dir, views };
  }
  // stop: the CLI's own `close --all` first (it owns the daemon and chromium);
  // a pid that survives the grace is reported, never signalled by THIS op —
  // the hub's keeper decides what to do with a machine's stray process.
  const before = await bs.runtime.info(ns, { dir });
  const r = await bs.runtime.closeAll(ns, { dir, extraEnv: viewEnvOf(bs, ns) });
  let left = null;
  if (before.pid) {
    const until = Date.now() + STOP_GRACE_MS;
    while (Date.now() < until && F.pidAlive(before.pid)) await sleep(100);
    if (F.pidAlive(before.pid)) left = `daemon pid ${before.pid} is still alive after close --all`;
  }
  return { ok: !!r.ok || !before.active, closed: before.active ? 1 : 0, left, ...(r.ok ? {} : { code: 'stop_failed', error: (r.stderr || r.error || '').trim().slice(0, 300) || 'close --all failed' }) };
}
function dirExists(d) { try { return fs.statSync(d).isDirectory(); } catch { return false; } }

module.exports = { BROWSER_SERVE_OPS, install, runBrowserServeOp, placeOf, STOP_GRACE_MS, planFileOf, buildFileOf, machineReady, stepFor, STEP_COMMANDS };

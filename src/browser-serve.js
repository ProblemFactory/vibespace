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

/** The closed op set — a caller cannot invent one (unknown ops on an old
 *  daemon hang; unknown ops here are refused by name). */
const BROWSER_SERVE_OPS = Object.freeze(['version', 'status', 'start', 'stop', 'cdp-url']);

/** ONE facts instance per PROCESS (the daemon keeps it in a module-level
 *  variable, never on a connection — a dial-out device reconnects on every
 *  link blip). `env` is the SANITISED base env (the hub hands agentEnv(); the
 *  daemon its own process.env, which never carried the hub's secrets). */
function install({ env = process.env, homeDir = os.homedir(), log = null, cmd = 'agent-browser', execFileImpl = undefined, displayProbe = null } = {}) {
  const facts = F.createBrowserFacts({ env, cmd, ...(execFileImpl ? { execFileImpl } : {}) });
  const runtime = F.createBrowserRuntime({ env, cmd, log, ...(execFileImpl ? { execFileImpl } : {}) });
  // lane headless-fallback: the display probe runs HERE, where the browser runs (injectable for the gate)
  return { facts, runtime, homeDir: String(homeDir), cmd, displayProbe: typeof displayProbe === 'function' ? displayProbe : () => F.probeDisplay({ env }) };
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
  const wanted = D.wantedOf(user, { headedEnv: headed });
  let display;
  try { display = await bs.displayProbe(); } catch (e) { display = D.displayVerdict({ env: {}, runtimeDir: null, entries: [] }); display.why = [`the display probe failed: ${e && e.message}`]; }
  const plan = D.launchPlan({ wanted, display, mode }); // `mode` = the hub's browser.noDisplayMode (an older hub sends none ⇒ auto)
  const fact = D.displayFact({ display, plan, wanted, at: Date.now(), mode });
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

/** The profile's namespace + the directory THIS machine owns for it. */
function placeOf(bs, profileId) {
  const id = String(profileId || '');
  if (!B.isProfileId(id)) return { ok: false, code: 'bad-request', error: `browser-serve needs a profile id (bp-<8 hex>), got ${JSON.stringify(profileId)}` };
  return { ok: true, id, ns: B.sessionNameFor(id), dir: path.join(bs.homeDir, '.agent-browser', B.profileDirName(id)) };
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
 */
async function runBrowserServeOp(bs, action, params = {}) {
  const op = String(action || '');
  if (!BROWSER_SERVE_OPS.includes(op)) return { ok: false, code: 'bad-request', error: `unknown browser-serve op ${JSON.stringify(op)} — one of ${BROWSER_SERVE_OPS.join(', ')}` };
  const p = params && typeof params === 'object' ? params : {};
  if (op === 'version') {
    const v = await bs.facts.probeVersion();
    return { ok: true, version: v, floor: B.floorVerdict(v, B.FLOOR_VERSION), cmd: bs.cmd };
  }
  const place = placeOf(bs, p.profileId);
  if (!place.ok) return place;
  const { ns, dir } = place;
  if (op === 'status') {
    const info = await bs.runtime.info(ns, { dir });
    const starttime = info.pid ? F.procStart(info.pid) : null;
    return { ok: true, active: !!info.active, pid: info.pid, starttime, socketDir: info.socketDir, version: info.version, dir, exists: dirExists(dir) };
  }
  if (op === 'start') {
    try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch (e) { return { ok: false, code: 'dir_unwritable', error: `cannot create the profile directory ${dir}: ${e.message}` }; }
    const headed = p.headed === true || p.headed === 'yes' ? true : (p.headed === false || p.headed === 'no' ? false : null);
    // lane headless-fallback: this machine's display, now — the launch runs with the plan and answers the fact
    const plan = await planLaunch(bs, ns, headed, p.noDisplayMode === 'headless' ? 'headless' : 'auto');
    const r = await bs.runtime.launch(ns, { dir, idleMs: Number(p.idleMs) || 0, headed: plan.headed, extraEnv: plan.env });
    if (!r.ok) return { ok: false, code: 'launch_failed', error: `the browser did not start: ${(r.stderr || r.error || r.stdout || '').trim().slice(0, 300)}`, display: plan.fact };
    const info = await bs.runtime.info(ns, { dir });
    if (!info.active) return { ok: false, code: 'launch_failed', error: 'the daemon did not report itself active after open', display: plan.fact };
    // …and this op's own cdp-url asks under the LAUNCH's view (the planned file, its idle, its HEADED) — a differing view
    // relaunches the browser on 0.38.1 (measured by the keeper's lane H; this op asked with none before)
    const view = { ...(planEnvOf(bs, ns) || {}), AGENT_BROWSER_IDLE_TIMEOUT_MS: String(Math.max(0, Number(p.idleMs) || 0)), ...(plan.headed === true ? { AGENT_BROWSER_HEADED: '1' } : plan.headed === false ? { AGENT_BROWSER_HEADED: '0' } : {}) };
    const cdp = await bs.runtime.cdpUrl(ns, { dir, extraEnv: view });
    const cdpUrl = cdp.ok ? cdp.url : null;
    return { ok: true, active: true, pid: info.pid, starttime: info.pid ? F.procStart(info.pid) : null, socketDir: info.socketDir, version: info.version, cdpUrl, cdpPort: cdpUrl ? B.cdpPortOf(cdpUrl) : null, dir, display: plan.fact };
  }
  if (op === 'cdp-url') {
    const cdp = await bs.runtime.cdpUrl(ns, { dir, extraEnv: planEnvOf(bs, ns) });
    if (!cdp.ok) return { ok: false, code: 'no_cdp', error: `no CDP url for ${ns}: ${(cdp.raw && (cdp.raw.stderr || cdp.raw.error)) || 'the browser is not running'}` };
    return { ok: true, url: cdp.url, port: B.cdpPortOf(cdp.url) };
  }
  // stop: the CLI's own `close --all` first (it owns the daemon and chromium);
  // a pid that survives the grace is reported, never signalled by THIS op —
  // the hub's keeper decides what to do with a machine's stray process.
  const before = await bs.runtime.info(ns, { dir });
  const r = await bs.runtime.closeAll(ns, { dir, extraEnv: planEnvOf(bs, ns) });
  let left = null;
  if (before.pid) {
    const until = Date.now() + STOP_GRACE_MS;
    while (Date.now() < until && F.pidAlive(before.pid)) await sleep(100);
    if (F.pidAlive(before.pid)) left = `daemon pid ${before.pid} is still alive after close --all`;
  }
  return { ok: !!r.ok || !before.active, closed: before.active ? 1 : 0, left, ...(r.ok ? {} : { code: 'stop_failed', error: (r.stderr || r.error || '').trim().slice(0, 300) || 'close --all failed' }) };
}
function dirExists(d) { try { return fs.statSync(d).isDirectory(); } catch { return false; } }

module.exports = { BROWSER_SERVE_OPS, install, runBrowserServeOp, placeOf, STOP_GRACE_MS, planFileOf };

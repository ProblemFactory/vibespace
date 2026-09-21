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
function install({ env = process.env, homeDir = os.homedir(), log = null, cmd = 'agent-browser', execFileImpl = undefined } = {}) {
  const facts = F.createBrowserFacts({ env, cmd, ...(execFileImpl ? { execFileImpl } : {}) });
  const runtime = F.createBrowserRuntime({ env, cmd, log, ...(execFileImpl ? { execFileImpl } : {}) });
  return { facts, runtime, homeDir: String(homeDir), cmd };
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
 *   start   {profileId, idleMs?, headed?} → {ok, pid, starttime, socketDir, cdpUrl, cdpPort, dir, active}
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
    const r = await bs.runtime.launch(ns, { dir, idleMs: Number(p.idleMs) || 0, headed });
    if (!r.ok) return { ok: false, code: 'launch_failed', error: `agent-browser open failed: ${(r.stderr || r.error || r.stdout || '').trim().slice(0, 300)}` };
    const info = await bs.runtime.info(ns, { dir });
    if (!info.active) return { ok: false, code: 'launch_failed', error: 'the daemon did not report itself active after open' };
    const cdp = await bs.runtime.cdpUrl(ns, { dir });
    const cdpUrl = cdp.ok ? cdp.url : null;
    return { ok: true, active: true, pid: info.pid, starttime: info.pid ? F.procStart(info.pid) : null, socketDir: info.socketDir, version: info.version, cdpUrl, cdpPort: cdpUrl ? B.cdpPortOf(cdpUrl) : null, dir };
  }
  if (op === 'cdp-url') {
    const cdp = await bs.runtime.cdpUrl(ns, { dir });
    if (!cdp.ok) return { ok: false, code: 'no_cdp', error: `no CDP url for ${ns}: ${(cdp.raw && (cdp.raw.stderr || cdp.raw.error)) || 'the browser is not running'}` };
    return { ok: true, url: cdp.url, port: B.cdpPortOf(cdp.url) };
  }
  // stop: the CLI's own `close --all` first (it owns the daemon and chromium);
  // a pid that survives the grace is reported, never signalled by THIS op —
  // the hub's keeper decides what to do with a machine's stray process.
  const before = await bs.runtime.info(ns, { dir });
  const r = await bs.runtime.closeAll(ns, { dir });
  let left = null;
  if (before.pid) {
    const until = Date.now() + STOP_GRACE_MS;
    while (Date.now() < until && F.pidAlive(before.pid)) await sleep(100);
    if (F.pidAlive(before.pid)) left = `daemon pid ${before.pid} is still alive after close --all`;
  }
  return { ok: !!r.ok || !before.active, closed: before.active ? 1 : 0, left, ...(r.ok ? {} : { code: 'stop_failed', error: (r.stderr || r.error || '').trim().slice(0, 300) || 'close --all failed' }) };
}
function dirExists(d) { try { return fs.statSync(d).isDirectory(); } catch { return false; } }

module.exports = { BROWSER_SERVE_OPS, install, runBrowserServeOp, placeOf, STOP_GRACE_MS };

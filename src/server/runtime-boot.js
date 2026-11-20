'use strict';
// THE SERVER'S OWN RUNTIME AT BOOT (lane runtime-floor, 2026-10-22). server.js's first line is boot() below: it may
// replace the process with the instance's own node (src/node-runtime.js reexecOnOwnRuntime — `switched`); then:
//   · line()        the boot's verdict line: `[runtime] node vX below the floor vY — the next update provisions it` /
//                   at or above the floor / switched from the base node / a major the table names no floor for;
//   · afterListen() the boot's runtime check (an install not under NO_AUTO_UPDATE — the boot pull itself is gone since lane
//                   hub-sync-holds rank 12a: an update's one road is scripts/update.sh): below the floor ⇒
//                   `node scripts/runtime-check.mjs --provision` as a CHILD after the port is open (never the boot's
//                   loop); its lines join this server's log, and the next restart runs on what it provisioned;
//   · answer()      GET /api/runtime — what the Diagnostics window says: the node running, the base it switched from,
//                   the instance's own runtime, the verdict against THE floor table (src/runtime-floor.js), the
//                   advisory, the last boot check's outcome.
const path = require('path');
const { spawn } = require('child_process');
const RF = require('../runtime-floor');
const NR = require('../node-runtime');
const SR = require('../server-root.js');

// B-9dd0: the temp roots the boot's runtime check judges (the update check's own list, src/server/ops-routes.js)
const TMP_ROOTS = () => [require('os').tmpdir(), '/tmp', '/var/tmp'];
/** B-9dd0 (主开发 r321): is the boot's runtime check ARMED for this root? It asks nodejs.org, so never under a suite
 *  (VS_NO_REAL_CLI=1 — the test machines, a suite's scratch hub), never with NO_AUTO_UPDATE, never for a root under a temp
 *  folder (the lanes' /var/tmp worktrees too) — judged by src/server-root.js tmpRootUnder over the REAL paths, the update
 *  check's own verdict. The switches are read at the call (before any await). → Promise<{armed, why}> */
function runtimeCheckArmed({ rootDir, env = process.env, tmpRoots = TMP_ROOTS(), realpath = (p) => require('fs').promises.realpath(p).catch(() => p) } = {}) {
  if (env.NO_AUTO_UPDATE) return Promise.resolve({ armed: false, why: 'NO_AUTO_UPDATE' });
  if (env.VS_NO_REAL_CLI === '1') return Promise.resolve({ armed: false, why: 'VS_NO_REAL_CLI=1' });
  // only ABSOLUTE temp spellings are resolved: a relative one («.», TMPDIR=.) would resolve to the hub's own folder (主开发 r528)
  const abs = tmpRoots.filter((t) => typeof t === 'string' && path.isAbsolute(t));
  return Promise.all([realpath(rootDir), ...abs.map((t) => realpath(t))]).then(([realRoot, ...realTmps]) => {
    const t = SR.tmpRootUnder({ root: path.resolve(rootDir), realRoot, tmpRoots: abs, realTmps });
    return t ? { armed: false, why: `the root lies under the temp folder ${t}` } : { armed: true, why: null };
  });
}

function create({ rootDir, switched = { state: 'none' }, version = process.version, execPath = process.execPath, log = (l) => console.log(l), spawnFn = spawn } = {}) {
  const root = path.join(rootDir, 'data');
  const base = switched && switched.state === 'already' ? switched.from : null;   // the node this start began on
  let check = null;   // {state: 'running' | 'done', at, ok?, code?, version?}
  const verdictNow = () => RF.verdict(version);
  function line() {
    const v = verdictNow();
    const from = base ? ` (switched from ${base}: the instance's own runtime, ${path.join(root, 'runtime', 'current')})` : '';
    if (v.state === 'below-floor') return `[runtime] node ${v.version} below the floor ${v.floor} (${v.advisory}) — the next update provisions it${from}`;
    if (v.state === 'ok') return `[runtime] node ${v.version} — at or above the floor ${v.floor}${from}`;
    if (v.state === 'unknown-major') return `[runtime] node ${v.version} — the floor table (src/runtime-floor.js) names no line for v${v.major}${from}`;
    return `[runtime] node ${version} — not a version the floor table reads`;
  }
  /** The boot's runtime check: provision below the floor, in a child, once per start (the boot pull it once shared a timer with is gone). */
  function afterListen({ autoUpdate = false } = {}) {
    const v = verdictNow();
    if (!autoUpdate || v.state !== 'below-floor' || check) return null;
    check = { state: 'running', at: Date.now(), wanted: v.wanted };
    const env = { PATH: process.env.PATH || '', HOME: process.env.HOME || '', LANG: process.env.LANG || 'C.UTF-8', ...(process.env.VIBESPACE_NODE_MIRROR ? { VIBESPACE_NODE_MIRROR: process.env.VIBESPACE_NODE_MIRROR } : {}) };
    let child;
    try { child = spawnFn(execPath, [path.join(rootDir, 'scripts', 'runtime-check.mjs'), '--provision', '--json', '--root', root], { cwd: rootDir, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { check = { state: 'done', at: Date.now(), ok: false, code: 'spawn', error: String(e && e.message) }; log(`[runtime] the boot check could not start: ${check.error}`); return check; }
    let out = '', failed = false;
    // ckpt61 cure 2: the error listener at once — this child starts on a timer after listen; a start that fails (a full file table,
    // EAGAIN, a missing node) queues an 'error' that, unheard, ended the hub at every restart. Said in the check's own words; the
    // 'close' that follows it (node's maybeClose) changes nothing
    child.on('error', (e) => { failed = true; check = { state: 'done', at: Date.now(), wanted: v.wanted, ok: false, code: 'spawn', error: String((e && e.code) || e) }; log(`[runtime] the boot check could not start: ${check.error}`); });
    if (child.stdout) child.stdout.on('data', (d) => { if (out.length < 65536) out += d; });
    if (child.stderr) child.stderr.on('data', (d) => { if (out.length < 65536) out += d; });
    child.on('close', (code) => {
      if (failed) return;
      let r = null;
      for (const l of out.split('\n').reverse()) { try { r = JSON.parse(l); break; } catch { } }
      const p = r && r.provisioned;
      check = { state: 'done', at: Date.now(), wanted: v.wanted, ok: !!(p && p.ok), code: p ? (p.ok ? 'provisioned' : p.code) : `exit-${code}`, version: p && p.version, error: p && !p.ok ? String(p.error || '').slice(0, 300) : null };
      log(check.ok ? `[runtime] the boot check provisioned ${check.version} — the next restart runs on it` : `[runtime] the boot check did not provision ${v.wanted} (${check.code}${check.error ? ': ' + check.error : ''}) — this server keeps ${v.version}`);
    });
    return check;
  }
  function answer() {
    const v = verdictNow(), own = NR.currentOf(root);
    return {
      node: v.version || version, execPath, base, own: own ? { version: own.version, node: own.node } : null,
      verdict: v, advisory: RF.advisoryOf(v.advisory), running: own ? path.resolve(execPath) === path.resolve(own.node) : false,
      check, table: Object.fromEntries(Object.entries(RF.NODE_FLOORS).map(([k, r]) => [k, r.floor])),
    };
  }
  return { line, afterListen, answer };
}

let booted = null;
/** server.js's ONE line, its first: the switch (src/node-runtime.js reexecOnOwnRuntime — on success it never returns),
 *  the mark dropped before any child sees it, the verdict line once the boot's narrative is captured (setImmediate:
 *  after the opslog tee), and the boot's runtime check 20 s in (an unref'd timer; never in a throwaway / suite root or
 *  with NO_AUTO_UPDATE; the boot pull that once shared this rule is gone — lane hub-sync-holds rank 12a). GET /api/runtime (src/server/ops-routes.js) answers `answer()`. */
function boot({ rootDir, env = process.env, log = (l) => console.log(l) } = {}) {
  if (booted) return booted;
  const switched = NR.reexecOnOwnRuntime({ root: path.join(rootDir, 'data'), env, log });
  delete env.VIBESPACE_RUNTIME_REEXEC;
  booted = create({ rootDir, switched, log });
  setImmediate(() => log(booted.line()));
  // B-9dd0: a suite's hub (VS_NO_REAL_CLI=1) or a root under any temp folder never runs the runtime check — it would ask
  // nodejs.org (runtimeCheckArmed: the update check's own verdict); the timer is set only when armed
  const b = booted;
  runtimeCheckArmed({ rootDir, env }).then((v) => { if (!v.armed) { log(`[runtime] the boot's runtime check is off: ${v.why}`); return; } const t = setTimeout(() => b.afterListen({ autoUpdate: true }), 20000); if (t.unref) t.unref(); }, () => { });
  return booted;
}
const answer = () => (booted ? booted.answer() : create({ rootDir: path.resolve(__dirname, '..', '..') }).answer());

module.exports = { create, boot, answer, runtimeCheckArmed, TMP_ROOTS };

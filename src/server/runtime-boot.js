'use strict';
// THE SERVER'S OWN RUNTIME AT BOOT (lane runtime-floor, 2026-10-22). server.js's first line is boot() below: it may
// replace the process with the instance's own node (src/node-runtime.js reexecOnOwnRuntime — `switched`); then:
//   · line()        the boot's verdict line: `[runtime] node vX below the floor vY — the next update provisions it` /
//                   at or above the floor / switched from the base node / a major the table names no floor for;
//   · afterListen() the owner's auto-update road (the boot pull ran) runs the update's check too: below the floor ⇒
//                   `node scripts/runtime-check.mjs --provision` as a CHILD after the port is open (never the boot's
//                   loop); its lines join this server's log, and the next restart runs on what it provisioned;
//   · answer()      GET /api/runtime — what the Diagnostics window says: the node running, the base it switched from,
//                   the instance's own runtime, the verdict against THE floor table (src/runtime-floor.js), the
//                   advisory, the last boot check's outcome.
const path = require('path');
const { spawn } = require('child_process');
const RF = require('../runtime-floor');
const NR = require('../node-runtime');

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
  /** The boot pull's check: provision below the floor, in a child, once per start. */
  function afterListen({ autoUpdate = false } = {}) {
    const v = verdictNow();
    if (!autoUpdate || v.state !== 'below-floor' || check) return null;
    check = { state: 'running', at: Date.now(), wanted: v.wanted };
    const env = { PATH: process.env.PATH || '', HOME: process.env.HOME || '', LANG: process.env.LANG || 'C.UTF-8', ...(process.env.VIBESPACE_NODE_MIRROR ? { VIBESPACE_NODE_MIRROR: process.env.VIBESPACE_NODE_MIRROR } : {}) };
    let child;
    try { child = spawnFn(execPath, [path.join(rootDir, 'scripts', 'runtime-check.mjs'), '--provision', '--json', '--root', root], { cwd: rootDir, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { check = { state: 'done', at: Date.now(), ok: false, code: 'spawn', error: String(e && e.message) }; log(`[runtime] the boot check could not start: ${check.error}`); return check; }
    let out = '';
    child.stdout.on('data', (d) => { if (out.length < 65536) out += d; });
    child.stderr.on('data', (d) => { if (out.length < 65536) out += d; });
    child.on('close', (code) => {
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
 *  after the opslog tee), and the boot pull's check 20 s in (an unref'd timer; never in a throwaway / suite root or
 *  with NO_AUTO_UPDATE — the same rule as the pull). GET /api/runtime (src/server/ops-routes.js) answers `answer()`. */
function boot({ rootDir, env = process.env, log = (l) => console.log(l) } = {}) {
  if (booted) return booted;
  const switched = NR.reexecOnOwnRuntime({ root: path.join(rootDir, 'data'), env, log });
  delete env.VIBESPACE_RUNTIME_REEXEC;
  booted = create({ rootDir, switched, log });
  setImmediate(() => log(booted.line()));
  const os = require('os');
  const throwaway = [os.tmpdir(), '/tmp'].some((t) => (path.resolve(rootDir) + path.sep).startsWith(path.resolve(t) + path.sep));
  if (!env.NO_AUTO_UPDATE && !throwaway) { const t = setTimeout(() => booted.afterListen({ autoUpdate: true }), 20000); if (t.unref) t.unref(); }
  return booted;
}
const answer = () => (booted ? booted.answer() : create({ rootDir: path.resolve(__dirname, '..', '..') }).answer());

module.exports = { create, boot, answer };

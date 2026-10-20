'use strict';
// THE ON-DEMAND CLI USAGE READING (lane antigravity-card-fixes, the owner 2026-10-20: the Antigravity card showed «no
// usage anywhere»). A harness whose quota object declares `onDemand` — a usage command its CLI answers WITHOUT a turn
// (antigravity: `agy -p /usage --output-format json`, src/harnesses/antigravity-usage.js) — is read HERE, for ONE named
// account, when a PERSON presses Re-check in Manage agents. Never a timer (§ban-safety: the one owner-approved usage
// timer is Claude's auto-cli; this reading is on demand only), never an agent (a vsst_/jbt_ bearer is refused), at most
// once a minute per account, never under `accounts.onDemandQuotaRefresh = off`.
//   · the CLI = the path the read-time check answers NOW (src/server/cli-cmd.js `check`, forced: a person asked);
//   · the env = the account's own spawn env (accounts.resolveForSpawn: its HOME root, the session bus disabled) over
//     the agents' env (ws-handler agentEnv — every harness's credential names dropped), so the CLI reads THAT
//     account's login and nothing ambient; stdin a closed pipe, 30 s, stdout capped;
//   · the answer is JUDGED by the descriptor (`onDemand.judge`): 'reading' ⇒ written through THE ONE write path
//     (src/usage-cache-write.js writeReading, key = the account id, source = `onDemand.source`); 'turn-started' ⇒ STOP:
//     nothing written, a loud log line and the refusal said (the vendor's "no turn" claim refuted — the door stays
//     shut until a person looks); anything else ⇒ said, nothing written.
// Answers { ok, status, … } — the route maps it to HTTP. Spawns nothing at require time; no backend-id branch.
const path = require('path');
const { spawn } = require('child_process');

const PACE_MS = 60000;
const TIMEOUT_MS = 30000;
const STDOUT_CAP = 262144;

/** Run `cmd argv` once with `env`/`cwd`; resolves { code, stdout, stderr, error }. stdin is a closed pipe. */
function runOnce(spawnImpl, cmd, argv, { env, cwd, timeoutMs = TIMEOUT_MS }) {
  return new Promise((resolve) => {
    let child;
    try { child = spawnImpl(cmd, argv, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { resolve({ code: null, stdout: '', stderr: '', error: e }); return; }
    let stdout = '', stderr = '', error = null, done = false;
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { } }, timeoutMs);
    try { child.stdin.end(); } catch { }
    child.stdout.on('data', (d) => { if (stdout.length < STDOUT_CAP) stdout += d; });
    child.stderr.on('data', (d) => { if (stderr.length < 65536) stderr += d; });
    child.on('error', (e) => { error = e; });
    child.on('close', (code, sig) => { if (done) return; done = true; clearTimeout(timer); resolve({ code: sig ? `signal ${sig}` : code, stdout, stderr, error }); });
  });
}

/** @param {object} o
 *  @param {object} o.accounts            the accounts store (get, resolveForSpawn)
 *  @param {(id:string)=>object} o.harnessOf  the harness registry's get
 *  @param {object} o.cliCmds             the CLI registry (check)
 *  @param {string} o.cacheDir            data/usage-cache
 *  @param {object} [o.usageWrite]        src/usage-cache-write.js
 *  @param {()=>object} [o.agentEnv]      the agents' env
 *  @param {(k:string)=>any} [o.setting]  a server setting
 *  @param {Function} [o.spawnImpl] @param {()=>number} [o.now] @param {(l:string)=>void} [o.log] */
function createCliUsageDoor({ accounts, harnessOf, cliCmds, cacheDir, usageWrite = require('../usage-cache-write.js'), agentEnv = () => ({ ...process.env }),
  setting = () => null, spawnImpl = spawn, now = Date.now, log = (l) => console.log(l), paceMs = PACE_MS, timeoutMs = TIMEOUT_MS } = {}) {
  const lastAt = new Map();   // account id → when a person last read it (the once-a-minute pace)
  const inflight = new Map(); // account id → the read in flight (two presses share it)
  async function readOnce(id, a, be, od) {
    const cmd = await cliCmds.check(be, { force: true });
    if (!cmd) return { ok: false, status: 409, code: 'not-installed', error: `${harnessOf(be)?.label || be} is not installed on this machine` };
    let spawnEnv = null;
    try { spawnEnv = accounts.resolveForSpawn(id, be); } catch (e) { return { ok: false, status: 409, code: 'login-needed', loginNeeded: true, error: e.message }; }
    if (!spawnEnv || !spawnEnv.localEnv) return { ok: false, status: 409, code: 'no-account-env', error: 'this account has no spawn environment of its own' };
    const creds = harnessOf(be)?.creds || {};
    const env = { ...agentEnv(), ...spawnEnv.localEnv };
    for (const k of creds.keyEnvVars || []) delete env[k]; // an ambient key would answer for ANOTHER login
    const at = now();
    const r = await runOnce(spawnImpl, cmd, od.argv, { env, cwd: od.cwdOf(spawnEnv.localEnv), timeoutMs });
    if (r.error) return { ok: false, status: 502, code: 'spawn-failed', error: `could not run ${path.basename(cmd)}: ${r.error.message}` };
    const j = od.judge({ code: r.code, stdout: r.stdout, stderr: r.stderr, measuredAt: at });
    if (j.verdict === 'turn-started') {
      log(`[cli-usage] ${be} ${id}: STOP — ${j.why} (nothing written)`);
      return { ok: false, status: 502, code: 'turn-started', error: j.why };
    }
    if (j.verdict === 'auth-required') return { ok: false, status: 409, code: 'login-needed', loginNeeded: true, error: j.why };
    if (j.verdict !== 'reading') return { ok: false, status: 502, code: j.verdict, error: j.why };
    const set = { ...j.reading, identity: id };
    // the file names its harness (`backend`): its projected buckets must never be lifted as claude's (usage-cache-write)
    const w = usageWrite.writeReading({ cacheDir, key: id, set, extras: { backend: be }, source: od.source, backend: be });
    if (!w || !w.ok) return { ok: false, status: 500, code: 'write-refused', error: (w && (w.why || (w.errors || []).join('; '))) || 'the write path refused the reading' };
    return { ok: true, status: 200, key: id, shape: j.shape, fetchedAt: set.fetchedAt, limits: set.limits.length };
  }
  return {
    PACE_MS: paceMs,
    /** ONE reading of account `id`, on a person's press (`person` false ⇒ refused). */
    async read(id, { person = false } = {}) {
      if (!person) return { ok: false, status: 403, code: 'agent_forbidden', error: 'human-triggered only' };
      const a = accounts.get(id);
      if (!a) return { ok: false, status: 404, code: 'unknown-account', error: 'unknown account' };
      const be = a.backend || 'claude';
      const od = harnessOf(be)?.quota?.onDemand;
      if (!od || typeof od.judge !== 'function' || !Array.isArray(od.argv)) return { ok: false, status: 400, code: 'no-reading', error: `${harnessOf(be)?.label || be} declares no on-demand usage reading` };
      let mode = 'manual'; try { mode = setting('accounts.onDemandQuotaRefresh') || 'manual'; } catch { }
      if (mode === 'off') return { ok: false, status: 403, code: 'refresh-off', error: 'on-demand usage refresh is turned off in Settings' };
      if (inflight.has(id)) return inflight.get(id);
      const since = now() - (lastAt.get(id) || -Infinity);
      if (since < paceMs) return { ok: false, status: 429, code: 'throttled', throttled: true, retryInMs: paceMs - since, error: 'read less than a minute ago' };
      lastAt.set(id, now());
      const p = readOnce(id, a, be, od).finally(() => inflight.delete(id));
      inflight.set(id, p);
      return p;
    },
  };
}

module.exports = { createCliUsageDoor, PACE_MS, TIMEOUT_MS };

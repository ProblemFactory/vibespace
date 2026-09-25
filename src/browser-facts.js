'use strict';
/**
 * WHAT agent-browser IS ON THIS MACHINE — SHARED (node builtins + the PURE
 * model, nothing else; the daemon may bundle it). docs/design-agent-browser-v2
 * §3.6's "这台机器上存在/正在跑哪些浏览器、版本下限探测" row.
 *
 * P0 needs exactly one fact — the installed VERSION, for D1's floor check — and
 * this module answers it for a machine handle rather than for "here": `hostId`
 * is a parameter of whoever chooses the transport, and the only thing this file
 * knows is how to ask a binary its version and how to cache the answer. P1's
 * keeper adds "which browsers are running" beside it, which is why this is its
 * own module now rather than three lines inside the ORCH resolver.
 *
 * A PROBE THAT COSTS A FORK MAY NOT RUN PER ACTION. `child_process.spawn`
 * blocks the calling thread in proportion to the PARENT's RSS (measured on this
 * box: 1.8 ms at 45 MB, 72.5 ms at 1.5 GB, and both production servers sit at
 * 1.5–2 GB), and the sessions-discovery incident is what a per-item fork on a
 * hot path costs. So the version is probed at most once per TTL and the answer
 * — including the negative one — is remembered. `null` means "we asked and
 * there is no binary"; it is a FACT, not an error, and it is cached like one.
 */
const { execFile } = require('child_process');
const path = require('path');
const B = require('./browser-profiles.js');
const VERBS = require('./browser-verbs.js');

/**
 * THE REAL BINARY, NEVER THE SHIM (design-browser-takeover §3.4 / §4). Agent
 * sessions get a `agent-browser` SHIM first on their PATH; a server started
 * from inside such a session (a scratch server, a remote daemon) inherits that
 * PATH, and a bare `execFile('agent-browser')` would ask the shim its version
 * (exit 2 ⇒ "unknown") or launch nothing. So the bare name is resolved through
 * the ONE resolver the CLI uses — skipping this checkout's data/bin,
 * ~/.vibespace/bin and any file carrying the shim's marker — and an explicit
 * path is used as given. A caller that INJECTS its own executor
 * (`execFileImpl`, the fast gate's fakes) owns name lookup: the name passes
 * through untouched, exactly as before. Remembered for the version TTL (a
 * few stat calls per 10 minutes, never per action); `null` = absent.
 */
const SHIM_DIRS = () => [path.join(__dirname, '..', 'data', 'bin'), path.join(require('os').homedir(), '.vibespace', 'bin')];
function isShimFile(p) {
  try { const fd = fs.openSync(p, 'r'); try { const b = Buffer.alloc(512); const n = fs.readSync(fd, b, 0, 512, 0); return b.slice(0, n).toString('utf8').includes(VERBS.SHIM_MARKER); } finally { fs.closeSync(fd); } } catch { return false; }
}
function isExecFile(p) { try { const st = fs.statSync(p); return st.isFile() && (st.mode & 0o111) !== 0; } catch { return false; } }
function binaryResolver(cmd, env, { ttlMs = VERSION_TTL_MS, now = () => Date.now() } = {}) {
  if (cmd !== VERBS.REAL_BINARY) return () => cmd; // an explicit path / a fake — as given
  let memo = null;
  return () => {
    const PATH = String((env && env.PATH) || '');
    const t = now();
    if (memo && memo.PATH === PATH && t - memo.at < ttlMs) return memo.bin;
    const r = VERBS.resolveRealBinary({ PATH, shimDirs: SHIM_DIRS(), exists: isExecFile, isShim: isShimFile });
    memo = { PATH, at: t, bin: r.ok ? r.path : null };
    return memo.bin;
  };
}

/** 10 minutes. Long enough that no burst of session creates pays for a second
 *  fork; short enough that `npm i -g agent-browser@latest` is picked up within
 *  a coffee break rather than at the next server restart. */
const VERSION_TTL_MS = 10 * 60 * 1000;

/**
 * THE PROBE ASKS THE BINARY, NOT THE OPERATOR'S SHELL (r2). `execFile` inherits
 * `process.env`, and an ambient `AGENT_BROWSER_CONFIG` pointing anywhere the
 * file is missing makes the CLI print `⚠ config file not found` and EXIT 1 —
 * measured, so `--version` "fails" on a machine whose version reads perfectly
 * (0.32.0 in 0.103 s the moment the variable is unset) and the honest degrade
 * notice says "Could not read the installed agent-browser version". Every
 * `AGENT_BROWSER_*` is stripped, not just that one: this is a question about
 * WHICH BINARY IS INSTALLED, and no variable in that family can make the answer
 * more true. `src/ws-handler.js`'s `agentEnv()` already drops exactly these
 * names on the SPAWN path and names this operator shape in its own comment —
 * the probe is one layer away and owed the same rule.
 */
function sanitizeProbeEnv(src) {
  const env = { ...src };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_BROWSER_')) delete env[k];
  return env;
}

function createBrowserFacts({ cmd = 'agent-browser', execFileImpl = execFile, now = () => Date.now(), ttlMs = VERSION_TTL_MS, env = process.env } = {}) {
  let cached = null;          // { version: string|null, at: number, raw: string }
  let inFlight = null;
  const probeEnv = sanitizeProbeEnv(env);
  const binOf = execFileImpl === execFile ? binaryResolver(cmd, env, { ttlMs, now }) : () => cmd;

  /** The installed version, or null when the binary is absent/unrunnable.
   *  NEVER throws: a probe that throws on a machine without the tool would turn
   *  "this user does not browse" into a spawn failure. */
  function probeVersion() {
    const t = now();
    if (cached && t - cached.at < ttlMs) return Promise.resolve(cached.version);
    if (inFlight) return inFlight;
    inFlight = new Promise((resolve) => {
      let done = false;
      const finish = (version, raw) => {
        if (done) return; done = true;
        cached = { version, at: now(), raw: String(raw || '').slice(0, 200) };
        inFlight = null;
        resolve(version);
      };
      const bin = binOf();
      // absent (or only the shim on PATH) = "there is no binary", the cached FACT
      if (!bin) return finish(null, 'binary_absent: no browser CLI on PATH beside the shim');
      try {
        execFileImpl(bin, ['--version'], { timeout: 8000, encoding: 'utf8', env: probeEnv }, (err, stdout, stderr) => {
          // ENOENT = not installed. Any other failure is "we asked and could not
          // tell", which floorVerdict spells 'unknown' — deliberately NOT the
          // same answer as 'absent', because one of them deserves a sentence.
          if (err && (err.code === 'ENOENT' || err.code === 127)) return finish(null, err.message);
          const txt = String(stdout || '') + String(stderr || '');
          const v = B.parseVersion(txt);
          // `''` = it ran and would not say. Deliberately NOT `null`, which
          // means "there is no binary" — see floorVerdict.
          finish(v ? v.join('.') : '', txt);
        });
      } catch (e) { finish(null, e && e.message); }
    });
    return inFlight;
  }

  /** The PURE verdict over the probed version (D1's three-plus-one outcomes). */
  async function floor(floorVersion = B.FLOOR_VERSION) {
    const v = await probeVersion();
    return B.floorVerdict(v, floorVersion);
  }

  /** The last answer without paying for a probe — for a render or a log line
   *  that must not fork. `undefined` = never probed. */
  function lastVersion() { return cached ? cached.version : undefined; }
  function lastRaw() { return cached ? cached.raw : ''; }
  function _reset() { cached = null; inFlight = null; }

  return { probeVersion, floor, lastVersion, lastRaw, _reset, VERSION_TTL_MS: ttlMs };
}

// ═══ P1 — WHICH BROWSERS ARE RUNNING, AND THE CLI THAT DRIVES ONE (§3.5) ═══
// The keeper (ORCH) decides; these are the machine facts it decides over:
// the identity of a recorded daemon pid, its resource sample, and the four
// `agent-browser` calls a profile browser's lifecycle needs. Every call takes
// the profile's NAMESPACE explicitly and a sanitised environment — never the
// server's own AGENT_BROWSER_* (the probe's rule, one layer down).
const fs = require('fs');
const cliIdentity = require('./cli-identity.js');

/** kill -0: "something runs under that number" — an existence probe only.
 *  A ZOMBIE answers kill -0 but runs nothing: for a keeper deciding "did the
 *  daemon exit" it is gone (procfs only — with no /proc the signal's answer
 *  stands, the kernel's own semantics). */
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); } catch (e) { return !!(e && e.code === 'EPERM'); }
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z';
  } catch { return true; }
}
/** /proc/<pid>/stat field 22 (starttime, clock ticks since boot) — the half
 *  of a process identity a recycled pid cannot forge. null = no /proc or the
 *  process is gone; a null is NEVER "the same process". */
function procStart(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const v = Number(f[19]);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}
function sameProcess(pid, starttime) {
  if (starttime == null) return false;
  const now = procStart(pid);
  return now != null && Number(now) === Number(starttime);
}
/** The daemon AND what it spawned (chromium is the daemon's child, its
 *  renderers the grandchildren): one sample over the tree, bounded depth —
 *  `{ cpuTicks, memBytes, memMetric, rssBytes, pids: [every pid walked] }` or
 *  null. ASYNC (2026-09-25): the tree is walked with cli-identity's /proc
 *  reads (cheap, sync), then every member is sampled through the ONE /proc
 *  reader (cli-identity.procSampleAsync — this file's own `readProcUsage`
 *  copy is gone) and summed by the ONE set rule (cli-identity.setSample):
 *  memory = ΣPss, never ΣVmRSS — a chromium tree shares its binary, its
 *  libraries and the zygote's copy-on-write heap across every renderer, so
 *  its RSS sum counted each shared page once per process (measured: one
 *  large chrome process Rss 240 MB vs Pss 73 MB). cpuTicks stays OWN work
 *  only (the rule this walk always had). */
async function treeUsage(pid, { depth = 3, readChildren = cliIdentity.readChildPids, procRoot } = {}) {
  const seen = new Set();
  const walk = (p, d) => {
    if (!Number.isInteger(p) || p <= 0 || seen.has(p) || seen.size > 512) return;
    seen.add(p);
    if (d <= 0) return;
    let kids = []; try { kids = readChildren(p) || []; } catch { kids = []; }
    for (const k of kids) walk(Number(k), d - 1);
  };
  walk(pid, depth);
  const samples = [];
  for (const p of seen) samples.push(await cliIdentity.procSampleAsync(p, procRoot ? { procRoot } : {}));
  const s = cliIdentity.setSample(samples, { reaped: false });
  return s ? { ...s, pids: [...seen] } : null;
}

/**
 * THE FOUR CALLS a profile browser's lifecycle needs, each an `execFile` of
 * the CLI under ONE namespace with ONE sanitised environment:
 *   info(ns)               `session info --json`  — launch-free (measured)
 *   launch(ns, {dir, …})   `open about:blank`     — starts the daemon + chromium
 *   cdpUrl(ns)             `get cdp-url`          — the endpoint the wrapper uses
 *   closeAll(ns)           `close --all`          — the CLI's own stop
 * `execFileImpl` is injectable; the fast gate drives a FAKE binary on PATH.
 */
function createBrowserRuntime({ cmd = 'agent-browser', execFileImpl = execFile, env = process.env, log = null } = {}) {
  const base = sanitizeProbeEnv(env);
  const binOf = execFileImpl === execFile ? binaryResolver(cmd, env) : () => cmd;
  const run = (args, extra, { timeout = 15000 } = {}) => new Promise((resolve) => {
    const e = { ...base, ...extra, AGENT_BROWSER_JSON: '1' };
    const bin = binOf();
    if (!bin) { resolve({ ok: false, code: 'ENOENT', stdout: '', stderr: '', json: null, error: 'binary_absent: the browser CLI is not installed on this machine (only the VibeSpace shim is on PATH, or nothing)' }); return; }
    try {
      execFileImpl(bin, args, { timeout, encoding: 'utf8', env: e, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        let json = null;
        try { json = JSON.parse(String(stdout || '').trim().split('\n').filter(Boolean).pop() || ''); } catch { json = null; }
        resolve({ ok: !err, code: err ? (err.code || err.status || 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), json, error: err ? String(err.message || err) : null });
      });
    } catch (e2) { resolve({ ok: false, code: 'spawn', stdout: '', stderr: '', json: null, error: String(e2 && e2.message) }); }
  });
  const nsEnv = (ns, dir, session = null) => ({ AGENT_BROWSER_SESSION: session || ns, AGENT_BROWSER_NAMESPACE: ns, ...(dir ? { AGENT_BROWSER_PROFILE: dir } : {}) });
  // P2 (§4.2): the stream server is SESSION-scoped — a lease's tab context is
  // `vs-<browserKey>` inside the profile's namespace, so the port is asked for
  // under that session name; an EPHEMERAL browser (P0, no namespace of ours)
  // is asked with the very pairs its session was spawned with (`extraEnv`).
  // Measured 0.32.0: `stream status --json` LAUNCHES the session browser when
  // none is up and answers `{data:{enabled, connected, port, screencasting}}`;
  // `stream enable` on an enabled session exits 1 with "already enabled"
  // (scripts/fixtures/browser-stream/session-0.32.0.json).
  const streamEnvOf = (ns, { dir = null, session = null, extraEnv = null } = {}) => (ns ? { ...nsEnv(ns, dir, session), ...(extraEnv || {}) } : { ...(extraEnv || {}) });
  return {
    async streamStatus(ns, opts = {}) { return run(['stream', 'status', '--json'], streamEnvOf(ns, opts), { timeout: opts.timeout || 60000 }); },
    async streamEnable(ns, opts = {}) { return run(['stream', 'enable', '--json'], streamEnvOf(ns, opts), { timeout: opts.timeout || 60000 }); },
    /** takeover C3: with `ns` null and `extraEnv` = a MANAGED EPHEMERAL
     *  browser's spawn pairs, the question is asked under exactly those (the
     *  socket dir / config the session's own commands see) — never a guess. */
    async info(ns, { dir = null, extraEnv = null } = {}) {
      const r = await run(['session', 'info', '--json'], streamEnvOf(ns, { dir, extraEnv }));
      const d = r.json && r.json.data && typeof r.json.data === 'object' ? r.json.data : null;
      return { ok: r.ok && !!d, active: !!(d && d.active), pid: d && Number.isInteger(d.pid) ? d.pid : null, socketDir: d && d.socketDir ? String(d.socketDir) : null, version: d && d.version ? String(d.version) : null, raw: r };
    },
    /** P4 second half (§7.5): `extraEnv` = the VENDOR'S OWN key names for a
     *  key-bearing provider — they exist in THIS child's environment and in no
     *  other (never argv, never a log line); `argvPrefix` = the provider's
     *  launch flags before `open` (`-p <name>` / `--executable-path` +
     *  `--args --fingerprint=<seed>`, src/browser-switch.js launchArgsFor). */
    async launch(ns, { dir, idleMs = 0, headed = null, url = 'about:blank', timeout = 60000, extraEnv = null, argvPrefix = null } = {}) {
      const extra = { ...(ns ? nsEnv(ns, dir) : {}), ...(extraEnv || {}), AGENT_BROWSER_IDLE_TIMEOUT_MS: String(Math.max(0, Number(idleMs) || 0)) };
      if (headed === true) extra.AGENT_BROWSER_HEADED = '1';
      if (headed === false) extra.AGENT_BROWSER_HEADED = '0';
      return run([...(Array.isArray(argvPrefix) ? argvPrefix.map(String) : []), 'open', url], extra, { timeout });
    },
    async cdpUrl(ns, { dir = null, extraEnv = null } = {}) {
      const r = await run(['get', 'cdp-url'], { ...nsEnv(ns, dir), ...(extraEnv || {}) });
      const d = r.json && r.json.data;
      const url = typeof d === 'string' ? d : (d && typeof d === 'object' ? (d.url || d.cdpUrl || d.value || null) : null) || (r.ok ? r.stdout.trim().split('\n').pop() : null);
      return { ok: r.ok && !!url && /^(ws|http)s?:\/\//.test(String(url)), url: url ? String(url) : null, raw: r };
    },
    async closeAll(ns, { dir = null, timeout = 20000, extraEnv = null } = {}) { return run(['close', '--all'], streamEnvOf(ns, { dir, extraEnv }), { timeout }); },
    /** P3 (§4.3): ONE upstream command under a lease's session (`confirm <id>` /
     *  `deny <id>`) — the profile's namespace + the lease's own session name,
     *  or the ephemeral browser's spawn pairs (`extraEnv`, no namespace of ours). */
    async exec(ns, argv, { dir = null, session = null, extraEnv = null, timeout = 15000 } = {}) { return run(Array.isArray(argv) ? argv : [String(argv)], streamEnvOf(ns, { dir, session, extraEnv }), { timeout }); },
    /** The stream port for ONE session inside a namespace (or, with `ns` null
     *  and `extraEnv`, for an ephemeral browser): status → enable if disabled
     *  → status again. Never throws: `{ok, port, error}`. */
    async streamPort(ns, opts = {}) {
      const S = require('./browser-stream.js');
      const first = S.parseStreamStatus((await this.streamStatus(ns, opts)).json);
      let plan = S.streamPlan(first);
      if (plan.step === 'enable') {
        const en = S.parseStreamStatus((await this.streamEnable(ns, opts)).json);
        if (!en.ok) return { ok: false, port: null, error: en.error || 'stream enable failed' };
        plan = S.streamPlan(S.parseStreamStatus((await this.streamStatus(ns, opts)).json));
      }
      if (plan.step !== 'ready') return { ok: false, port: null, error: plan.why || 'no stream port' };
      return { ok: true, port: plan.port, error: null };
    },
    cmd,
  };
}

module.exports = { createBrowserFacts, binaryResolver, sanitizeProbeEnv, VERSION_TTL_MS, createBrowserRuntime, pidAlive, procStart, sameProcess, treeUsage };

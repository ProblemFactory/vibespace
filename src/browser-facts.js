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

// ═══ LANE H VERIFY r2 (M1): THE BROWSER A DAEMON LAUNCHED, AND WHO HOLDS A PROFILE'S LOCK ═══
// MEASURED on the real 0.38.1: the daemon's Chrome is its DIRECT child (its argv carries `--user-data-dir=<dir>`, no
// `--type=`; its /proc cmdline is title-rewritten — ONE space-joined string); `<dir>/SingletonLock` is a symlink
// `<hostname>-<pid>`; `kill -9` of the daemon leaves that Chrome ALIVE (reparented to the subreaper) holding the lock +
// DevToolsActivePort, and a relaunch on the directory dies "Chrome exited early (exit code: 21)". VERIFY r3 (measured
// on the real 0.38.1, five shapes): the Chrome's environ carries NO AGENT_BROWSER_* (the binary scrubs it — the
// `namespace`/`session` read below is informational, never a witness), and when that Chrome dies the daemon LIVES and
// its next verb relaunches Chrome IN PLACE (a new pid, lock and DevToolsActivePort; without a profile a new temp dir).
// These are the facts the keeper decides over (the verdict is PURE: browser-profiles.profileLockVerdict); /proc only —
// with no /proc every answer is null / empty and nothing is ever proven.
/** /proc/<pid>/cmdline AS WRITTEN (trailing NULs dropped), or null. VERIFY r3 (MINOR 2): the NULs are KEPT — they are
 *  the argv boundaries, and turning them into spaces first made a directory with a space in it two words (M1 went
 *  inert under such a path); a title-rewritten Chrome has none (ONE space-joined string). browser-profiles'
 *  userDataDirsOf reads both forms; `argv0Of` is the first word of either. */
function procCmdline(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try { return fs.readFileSync(`/proc/${pid}/cmdline`).toString('utf8').replace(/\0+$/, ''); } catch { return null; }
}
/** argv[0] of a /proc cmdline (NUL-separated: the first element; a title-rewritten one: its first word). */
function argv0Of(cmdline) { const c = String(cmdline || ''); return c.includes('\0') ? c.split('\0')[0] : (c.split(' ')[0] || ''); }
/** VERIFY r3 (LOW 3): does THIS machine read process starttimes at all (a /proc)? — our own is the probe. On such a
 *  machine every launch records its daemon's starttime; a null there means the daemon was already gone. */
function startsReadable() { return procStart(process.pid) != null; }
/** The named environment values of a process (same uid only), or null when /proc/<pid>/environ is unreadable. */
function procEnvOf(pid, names = []) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const out = {};
    for (const kv of fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')) { const i = kv.indexOf('='); if (i > 0 && names.includes(kv.slice(0, i))) out[kv.slice(0, i)] = kv.slice(i + 1); }
    return out;
  } catch { return null; }
}
function procPpid(pid) {
  try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const v = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); return Number.isInteger(v) ? v : null; } catch { return null; }
}
/** An agent-browser DAEMON: the binary on its argv[0], or the AGENT_BROWSER_DAEMON=1 the binary starts it with. */
function isBrowserDaemon(pid) {
  if (!pidAlive(pid)) return false;
  const e = procEnvOf(pid, ['AGENT_BROWSER_DAEMON']);
  if (e && e.AGENT_BROWSER_DAEMON === '1') return true;
  const c = procCmdline(pid);
  return !!c && /agent-browser/.test(argv0Of(c));
}
/** `<dir>/SingletonLock` → `{host, pid}` (Chrome's `<hostname>-<pid>` symlink) or null. */
function readSingletonLock(dir) {
  if (!dir) return null;
  try { const t = fs.readlinkSync(path.join(String(dir), 'SingletonLock')); const m = /^(.*)-(\d+)$/.exec(t); return m ? { host: m[1], pid: Number(m[2]) } : null; } catch { return null; }
}
/** `<dir>/DevToolsActivePort`'s port, or null (a Chrome up on that directory writes it). */
function readDevToolsPort(dir) {
  if (!dir) return null;
  try { const v = Number(fs.readFileSync(path.join(String(dir), 'DevToolsActivePort'), 'utf8').split('\n')[0]); return Number.isInteger(v) && v > 0 ? v : null; } catch { return null; }
}
/** VERIFY r5 (MAJOR 1 iii): the directory's launch STAMP — the mtimes of `<dir>/DevToolsActivePort` and of the
 *  `<dir>/SingletonLock` symlink itself (lstat), null when absent. A Chrome that came up on the directory rewrites both
 *  (measured on the real Chrome: they survive its exit, SIGTERM or SIGKILL), so a stamp that moved during a launch is the
 *  evidence a browser ran there — a launch that never wrote one (no browser this machine can identify) is never judged. */
function dirLaunchStamp(dir) {
  const m = (f, link) => { try { return (link ? fs.lstatSync(f) : fs.statSync(f)).mtimeMs; } catch { return null; } };
  if (!dir) return { devtools: null, lock: null };
  return { devtools: m(path.join(String(dir), 'DevToolsActivePort'), false), lock: m(path.join(String(dir), 'SingletonLock'), true) };
}
/** Did a browser come up on the directory between two stamps? (either file written anew) */
function launchStampMoved(before, after) {
  const b = before || {}, a = after || {};
  return (a.devtools != null && a.devtools !== b.devtools) || (a.lock != null && a.lock !== b.lock);
}
/** VERIFY r4 (LOW 4): the parent, grandparent, … of a pid (up to `n`), stopping at init — a browser the daemon launched
 *  through a wrapper that does not `exec` is the daemon's GRANDCHILD. */
function ancestorsOf(pid, n = 2) {
  const out = [];
  let cur = pid;
  for (let i = 0; i < n; i++) { const pp = procPpid(cur); if (!Number.isInteger(pp) || pp <= 1) break; out.push(pp); cur = pp; }
  return out;
}
/** The facts of a profile directory's lock holder — the input of browser-profiles.profileLockVerdict. `parentIsDaemon`
 *  (r4 LOW 4): a live browser daemon is its parent OR grandparent (`daemonPid` names it); `ancestors` = [ppid, gppid]. */
function lockHolderFacts(dir) {
  const lock = readSingletonLock(dir);
  if (!lock) return { lock: null, holder: null, devtoolsPort: readDevToolsPort(dir) };
  const pid = lock.pid;
  if (!pidAlive(pid)) return { lock, holder: { pid, alive: false }, devtoolsPort: readDevToolsPort(dir) };
  const cmdline = procCmdline(pid);
  const env = procEnvOf(pid, ['AGENT_BROWSER_NAMESPACE', 'AGENT_BROWSER_SESSION']) || {};
  const ancestors = ancestorsOf(pid, 2);
  const ppid = procPpid(pid);
  const daemonPid = ancestors.find((a) => isBrowserDaemon(a)) || null;
  return { lock, devtoolsPort: readDevToolsPort(dir), holder: { pid, alive: true, starttime: procStart(pid), cmdline, dirs: B.userDataDirsOf(cmdline, [dir]), marks: B.keeperMarksOf(cmdline), namespace: env.AGENT_BROWSER_NAMESPACE || null, session: env.AGENT_BROWSER_SESSION || null, parentPid: ppid, ancestors, daemonPid, parentIsDaemon: !!daemonPid } };
}
/** The BROWSER a daemon launched: its descendant (≤ depth) whose command line carries a `--user-data-dir` (`dir`
 *  given ⇒ that one) and no `--type=` (a renderer / zygote) → `{pid, starttime, dir}` or null. The identity the keeper
 *  records at launch, so a dead daemon's browser is ended as the process it was — pid AND starttime, never a name. */
function browserOfDaemon(daemonPid, { dir = null, depth = 2, readChildren = cliIdentity.readChildPids } = {}) {
  if (!Number.isInteger(daemonPid) || daemonPid <= 0) return null;
  const seen = new Set([daemonPid]);
  let frontier = [daemonPid];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next = [];
    for (const p of frontier) {
      let kids = []; try { kids = readChildren(p) || []; } catch { kids = []; }
      for (const k of kids) {
        const c = Number(k);
        if (!Number.isInteger(c) || c <= 0 || seen.has(c)) continue;
        seen.add(c); next.push(c);
        const cmd = procCmdline(c);
        if (!cmd || /(?:^|[\s\0])--type=/.test(cmd)) continue;
        const dirs = B.userDataDirsOf(cmd, dir ? [dir] : []);
        const pick = dir ? dirs.find((x) => B.sameDir(x, dir)) : dirs[0];
        if (!pick) continue;
        // VERIFY r4 (LOW 4): the shallowest argv match may be a WRAPPER that does not exec (its argv carries the Chrome's
        // flags): the directory's LOCK names the browser itself — preferred when it is a descendant of this daemon too
        const l = readSingletonLock(pick);
        if (l && l.pid !== c && l.host === require('os').hostname() && pidAlive(l.pid) && ancestorsOf(l.pid, depth + 1).includes(daemonPid)) {
          const lc = procCmdline(l.pid);
          if (lc && !/(?:^|[\s\0])--type=/.test(lc) && B.userDataDirsOf(lc, [pick]).some((x) => B.sameDir(x, pick))) return { pid: l.pid, starttime: procStart(l.pid), dir: pick };
        }
        return { pid: c, starttime: procStart(c), dir: pick };
      }
    }
    frontier = next;
  }
  return null;
}

/** VERIFY r4 (LOW 3): every BROWSER process on this machine carrying the keeper's launch mark `--vibespace-keeper=<value>`
 *  (exact — see browser-profiles.keeperMarksOf) — `{pid, starttime, cmdline, dirs, ancestors, daemonPid}` each, a
 *  renderer / zygote (`--type=`) never. ASYNC (the /proc walk is ~2k small reads on a busy box; never on the event loop's
 *  critical path — only when an ephemeral's daemon is found gone). Empty with no /proc. */
async function markedBrowsers(value, { procRoot = '/proc', batch = 64 } = {}) {
  const want = String(value || '');
  if (!want) return [];
  let names = [];
  try { names = (await fs.promises.readdir(procRoot)).filter((x) => /^\d+$/.test(x)); } catch { return []; }
  const hits = [];
  for (let i = 0; i < names.length; i += batch) {
    await Promise.all(names.slice(i, i + batch).map(async (n) => {
      const pid = Number(n);
      if (pid === process.pid) return;
      let raw; try { raw = (await fs.promises.readFile(`${procRoot}/${n}/cmdline`)).toString('utf8').replace(/\0+$/, ''); } catch { return; }
      if (!raw.includes(want) || /(?:^|[\s\0])--type=/.test(raw) || !B.keeperMarksOf(raw).includes(want)) return;
      hits.push(pid);
    }));
  }
  return hits.filter((pid) => pidAlive(pid)).map((pid) => {
    const cmdline = procCmdline(pid);
    const ancestors = ancestorsOf(pid, 2);
    return { pid, starttime: procStart(pid), cmdline, dirs: B.userDataDirsOf(cmdline, []), ancestors, daemonPid: ancestors.find((a) => isBrowserDaemon(a)) || null };
  });
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

module.exports = { createBrowserFacts, binaryResolver, sanitizeProbeEnv, VERSION_TTL_MS, createBrowserRuntime, pidAlive, procStart, sameProcess, treeUsage,
  // lane H verify r2 (M1): the browser a daemon launched, and who holds a profile directory's lock
  procCmdline, procEnvOf, procPpid, isBrowserDaemon, readSingletonLock, readDevToolsPort, lockHolderFacts, browserOfDaemon,
  // lane H verify r3: argv[0] of either cmdline form; does this machine read starttimes (LOW 3)
  argv0Of, startsReadable,
  // lane H verify r4: a process's ancestors (a wrapper between daemon and Chrome), every browser carrying a launch mark
  ancestorsOf, markedBrowsers,
  // lane H verify r5: the directory's launch stamp (did a browser come up on it during a launch)
  dirLaunchStamp, launchStampMoved };

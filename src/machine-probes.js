'use strict';
/**
 * Machine fact probes — ONE node implementation for every machine
 * (R1 of docs/design-three-tier.md, the `probe.*` op family).
 *
 * These facts (which CLIs are installed, how the machine is logged in, what
 * credential directories it holds) existed as THREE divergent implementations:
 * the local /api/backend-status route (node, richest), hosts.backendStatus
 * (an ssh shell script with its own grep ladder), and hosts.accountsStatus
 * (a second ssh script). The ladders drifted — the 2.186.7/2.188.0
 * same-dialog contradictions and the apiKeyHelper blind spot were both
 * probe-twin bugs. This module runs ON the machine being described: bundled
 * into the device daemon as `probe-cli` / `probe-creds` ops, and called
 * in-process by the server for its own machine (shared implementation, no
 * socket transit — CS amendment #2).
 *
 * Deliberately bundle-safe: fs/os/path/child_process only. NOTHING here may
 * originate a vendor API call (§ban-safety whitelist — probes read FILES).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const crypto = require('crypto'); // lane cli-self-measure: the CLI binary's sha256 (cliBinary)
const { cliVersionOf } = require('./cli-caps.js'); // PURE: the one version spelling the long-lived-token gate reads

// windowsHide (lane win-run-hide-console): `claude --version` on a Windows device is a console program the console-less
// daemon starts — without it, a console window per probe
const exec = (cmd, args, timeout = 5000) => new Promise((resolve) => {
  try { execFile(cmd, args, { encoding: 'utf-8', timeout, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout || ''))); }
  catch { resolve(null); }
});

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }
function statMtime(p) { try { return Math.floor(fs.statSync(p).mtimeMs / 1000); } catch { return null; } }

function which(cmd) {
  if (cmd && cmd.startsWith('/')) return fs.existsSync(cmd) ? cmd : null;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, cmd);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { }
  }
  return null;
}

/** Install-layer classification (the container-rebuild rollback class): a CLI
 *  outside $HOME lives in the ephemeral image layer — updates silently revert
 *  on rebuild; under $HOME (the PVC in fleet pods) survives and wins PATH. */
function classifyInstall(cmdPath) {
  if (!cmdPath || !cmdPath.startsWith('/')) return null;
  let real = cmdPath;
  try { real = fs.realpathSync(cmdPath); } catch { }
  return { binPath: real, userLocal: real.startsWith(os.homedir() + path.sep) };
}

/** The claude login ladder — ONE home for the semantics that drifted between
 *  the local route and the ssh script. keyHelper is an INDEPENDENT flag (the
 *  CLI's precedence puts a configured helper ABOVE OAuth — reporting it only
 *  as an elif rung hid the actual billing path). */
function claudeLoginFacts() {
  const home = os.homedir();
  const r = { loggedIn: false, loginMethod: null, machineLoginState: null, keyHelper: false };
  try { if (readJson(path.join(home, '.claude', 'settings.json'))?.apiKeyHelper) r.keyHelper = true; } catch { }
  if (process.platform === 'darwin') {
    // keychain probe is an exec, but a bounded read-only one
    return exec('security', ['find-generic-password', '-s', 'Claude Code-credentials'], 3000).then((out) => {
      if (out !== null) { r.loggedIn = true; r.loginMethod = 'keychain'; }
      return finishLoginLadder(r);
    });
  }
  const creds = readJson(path.join(home, '.claude', '.credentials.json'));
  if (creds?.claudeAiOauth?.accessToken || creds?.accessToken) { r.loggedIn = true; r.loginMethod = 'oauth'; }
  // token-LESS claudeAiOauth = a login that existed and expired/was cleared;
  // no creds at all = never set up. The two must not read the same.
  else if (creds?.claudeAiOauth) r.machineLoginState = 'expired';
  return Promise.resolve(finishLoginLadder(r));
}

function finishLoginLadder(r) {
  const home = os.homedir();
  if (!r.loggedIn) {
    if (readJson(path.join(home, '.claude.json'))?.primaryApiKey) { r.loggedIn = true; r.loginMethod = 'console-key'; }
  }
  if (!r.loggedIn && r.keyHelper) { r.loggedIn = true; r.loginMethod = 'key-helper'; }
  return r;
}

/**
 * CLI installation + login facts for THIS machine.
 * @param {object} [o] {claudeCmd, codexCmd} resolved command overrides (the
 *   server passes its boot-resolved absolute paths; the daemon resolves PATH).
 */
async function cliFacts({ claudeCmd = 'claude', codexCmd = 'codex' } = {}) {
  const out = { platform: process.platform, claude: {}, codex: {} };
  for (const [key, cmd] of [['claude', claudeCmd], ['codex', codexCmd]]) {
    const p = which(cmd);
    const b = out[key];
    b.cmdPath = p;
    b.install = classifyInstall(p);
    if (!p) { b.installed = false; b.version = null; continue; }
    const v = await exec(p, ['--version']);
    b.installed = v !== null;
    b.version = v ? v.trim().split('\n')[0] : null;
  }
  const login = await claudeLoginFacts();
  Object.assign(out.claude, login);
  if (out.claude.machineLoginState === null) delete out.claude.machineLoginState;
  out.codex.loggedIn = fs.existsSync(path.join(os.homedir(), '.codex', 'auth.json'));
  return out;
}

/**
 * Credential/identity facts for THIS machine — the accountsStatus shape
 * (kept field-compatible so every consumer works unchanged).
 * READ-ONLY over files; never refreshes a token; never calls a vendor API.
 */
async function credsFacts() {
  const home = os.homedir();
  const creds = readJson(path.join(home, '.claude', '.credentials.json'));
  const cfg = readJson(path.join(home, '.claude.json'));
  const settings = readJson(path.join(home, '.claude', 'settings.json'));
  const cxAuth = readJson(path.join(home, '.codex', 'auth.json'));

  let codexEmail = null, codexPlan = null;
  const idTok = cxAuth?.tokens?.id_token || cxAuth?.id_token;
  if (typeof idTok === 'string' && idTok.split('.').length >= 2) {
    try {
      const payload = JSON.parse(Buffer.from(idTok.split('.')[1], 'base64url').toString('utf-8'));
      codexEmail = payload.email || null;
      codexPlan = payload['https://api.openai.com/auth']?.chatgpt_plan_type || null;
    } catch { }
  }

  // held per-account subscription dirs (~/.vibespace/subs/<id>) — the
  // host-held login model; identity email per dir is the auto-merge anchor
  const hostSubs = [];
  const hostSubLoginStatus = {};
  const hostSubEmails = {};
  const subsRoot = path.join(home, '.vibespace', 'subs');
  let dirs = [];
  try { dirs = fs.readdirSync(subsRoot); } catch { }
  for (const d of dirs) {
    const dp = path.join(subsRoot, d);
    const c = readJson(path.join(dp, '.credentials.json'));
    if (c?.claudeAiOauth?.accessToken || c?.accessToken) hostSubs.push(d);
    const st = readJson(path.join(dp, '.vibespace-login-status.json'));
    if (st?.state && /^(running|success|error)$/.test(st.state) && typeof st.attempt === 'string' && st.attempt.length >= 8 && st.attempt.length <= 80) {
      hostSubLoginStatus[d] = { state: st.state, attempt: st.attempt };
    }
    const idc = readJson(path.join(dp, '.claude.json'));
    const em = idc?.oauthAccount?.emailAddress || idc?.emailAddress;
    if (em) hostSubEmails[d] = em;
  }

  let subLoggedIn = !!(creds?.claudeAiOauth?.accessToken || creds?.accessToken);
  if (!subLoggedIn && process.platform === 'darwin') {
    subLoggedIn = (await exec('security', ['find-generic-password', '-s', 'Claude Code-credentials'], 3000)) !== null;
  }
  const key = typeof cfg?.primaryApiKey === 'string' && cfg.primaryApiKey.startsWith('sk-ant-') ? cfg.primaryApiKey : null;
  return {
    platform: process.platform === 'darwin' ? 'darwin' : process.platform,
    subscription: { loggedIn: subLoggedIn, email: cfg?.oauthAccount?.emailAddress || null },
    cliKey: key ? { present: true, tail: key.slice(-8) } : { present: false },
    keyHelper: !!settings?.apiKeyHelper,
    codex: { email: codexEmail, plan: codexPlan },
    credsMtime: statMtime(path.join(home, '.claude', '.credentials.json')),
    codexAuthMtime: statMtime(path.join(home, '.codex', 'auth.json')),
    hostSubs, hostSubLoginStatus, hostSubEmails,
  };
}

/** ONE CLI's `--version` answer — cliFacts' own read (which + exec): the FIRST
 *  line that parses as a version (a warning printed before the number is
 *  skipped — pool-oat-materialize verify r1 F9), 'unparsed' when it answered
 *  and no line does, null when it did not answer. The hub's long-lived-token
 *  gate asks it for the claude it spawns (src/server/oat-file-sync.js). */
async function cliVersion(cmd) {
  const p = which(cmd);
  if (!p) return null;
  const v = await exec(p, ['--version']);
  if (!v || !v.trim()) return null;
  return v.split('\n').map((l) => l.trim()).find((l) => cliVersionOf(l)) || 'unparsed';
}

/** THE BYTES THAT RUN (lane cli-self-measure, law 1): the realpath of `cmd` (what a session spawns) + its sha256 — the hub's
 *  own measurement is keyed by version + this hash. Streamed in 1 MiB chunks (342 MB = 340 ms wall, the loop's worst gap 1 ms
 *  — measured 2026-11-09) and memoized by the file's stat identity (dev:ino:size:mtime:CHANGE time — an in-place rewrite that restores the mtime still moves the ctime, which no ordinary process can set back), so a tick re-hashes only a CHANGED
 *  file. → {path, cmd, sha256, size, identity} — sha256 null when the hash read failed — or null (not found / no stat). */
const _binMemo = { identity: null, out: null };
async function cliBinary(cmd) {
  const id = await cliBinaryIdentity(cmd);
  if (!id) return null;
  if (_binMemo.identity === id.identity && _binMemo.out) return { ..._binMemo.out };
  const sha256 = await new Promise((resolve) => {
    const h = crypto.createHash('sha256');
    try { fs.createReadStream(id.path, { highWaterMark: 1 << 20 }).on('data', (b) => h.update(b)).on('error', () => resolve(null)).on('end', () => resolve(h.digest('hex'))); } catch { resolve(null); }
  });
  if (!sha256) return { path: id.path, cmd: id.cmd, sha256: null, size: id.size, identity: id.identity }; // law B: the file is known, its bytes are not
  const out = { path: id.path, cmd: id.cmd, sha256, size: id.size, identity: id.identity };
  _binMemo.identity = id.identity; _binMemo.out = out;
  return { ...out };
}
/** …the cheap half (no hash): {path, cmd, size, identity} — the hub's 60 s check that the file the sessions spawn is the same */
async function cliBinaryIdentity(cmd) {
  const p = which(cmd);
  if (!p) return null;
  try { const real = await fs.promises.realpath(p); const st = await fs.promises.stat(real); return { path: real, cmd: p, size: st.size, identity: `${st.dev}:${st.ino}:${st.size}:${Math.round(st.mtimeMs)}:${Math.round(st.ctimeMs)}` }; } catch { return null; }
}

module.exports = { cliFacts, credsFacts, classifyInstall, which, cliVersion, cliBinary, cliBinaryIdentity };

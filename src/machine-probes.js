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
 * Deliberately bundle-safe: node builtins and the PURE cli-caps / helper-fact only. NOTHING here may
 * originate a vendor API call (§ban-safety whitelist — probes read FILES).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const crypto = require('crypto'); // lane cli-self-measure: the CLI binary's sha256 (cliBinary)
const { cliVersionOf } = require('./cli-caps.js'); // PURE: the one version spelling the long-lived-token gate reads
const { helperFactOfText, SETTINGS_READ_MAX, combinedFact, startFilesOf, nodeAt } = require('./helper-fact.js'); // PURE: a settings file's key-helper fact — the hub's own rule (B-bc9f)

// windowsHide (lane win-run-hide-console): `claude --version` on a Windows device is a console program the console-less
// daemon starts — without it, a console window per probe
const exec = (cmd, args, timeout = 5000) => new Promise((resolve) => {
  try { const c = execFile(cmd, args, { encoding: 'utf-8', timeout, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout || ''))); try { if (c.stdin) { c.stdin.on('error', () => { }); c.stdin.end(); } } catch { } }   // stdin closed (listened: a child gone first is no EPIPE): nothing a probe runs waits on it (B-77ed: a login profile reading stdin)
  catch { resolve(null); }
});

/** NO REAL AGENT CLI UNDER THE FLAG (B-ec25, lane bl-tests-e): VS_NO_REAL_CLI=1 (every lane env, acceptance run, the test
 *  machine) means a probe here never STARTS an agent CLI the process found by itself (a PATH lookup, the resolver's
 *  /usr/local/bin, /usr/bin) — a scratch hub booted with no stand-in ran the real binaries' --help / --version / sandbox
 *  probes. Only THE stand-in the env NAMES runs: `<ID>_CMD` (CLAUDE_CMD, CODEX_CMD), set, not the bare default name, and
 *  the command the probe would start resolves to that same file (a named stand-in never unlocks another binary).
 *  The flag alone decides (never the hub's temp root: the Actions heavy jobs run the installed claude on purpose).
 *  → null (the probe may run) or the words that say why it did not; src/server/cli-env.js's boot probes ask it too. */
function realCliRefusal(id, { env = process.env, cmd } = {}) {
  if (!env || env.VS_NO_REAL_CLI !== '1') return null;
  const name = `${String(id).toUpperCase().replace(/-/g, '_')}_CMD`;
  const standIn = env[name];
  if (!standIn || standIn === String(id)) return `not run: VS_NO_REAL_CLI=1 and no ${name} names a stand-in`;
  const fileOf = (c) => { const s = c ? String(c) : ''; const p = s ? which(s.includes('/') && !path.isAbsolute(s) ? path.resolve(s) : s) : null; return p ? ((classifyInstall(p) || {}).binPath || p) : null; };   // the realpath through classifyInstall's own read (no new fs site)
  const run = fileOf(cmd);
  return run && run === fileOf(standIn) ? null : `not run: VS_NO_REAL_CLI=1 and ${cmd || '(no command)'} is not the ${name} stand-in`;
}
const _saidNotRun = new Set();
/** the one journal line per probe that was not run (said once per process: a 15-min tick never floods the journal) */
function sayNotRun(probe, why) { if (_saidNotRun.has(probe)) return; _saidNotRun.add(probe); console.log(`[cli-probe] ${probe} ${why}`); }

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }
/** the claude descriptor's creds.keyHelper (src/harnesses/claude.js — a leg holds the two equal) */
const HELPER_ROW = { setting: 'apiKeyHelper', file: 'settings.json' };
/** ~/.claude/settings.json, bounded as this machine's start bounds its read (src/ws-create.js readOneFact): a regular file of at
 *  most SETTINGS_READ_MAX bytes — else it cannot be read (it is stat'd first: a FIFO or a folder is never opened); no such file =
 *  missing. (A start's other files — CLAUDE_CONFIG_DIR's, the project's two, the person's own — are startHelperFact's, B-77ed) */
function settingsRead(file) {
  try {
    const st = fs.statSync(file);
    return st.isFile() && st.size <= SETTINGS_READ_MAX ? { text: fs.readFileSync(file, 'utf-8') } : { text: null };
  } catch (e) { return e && e.code === 'ENOENT' ? { missing: true } : { text: null }; }
}
const helperFact = () => helperFactOfText(settingsRead(path.join(os.homedir(), '.claude', HELPER_ROW.file)), HELPER_ROW);
/** B-77ed: a START's settings file, read OFF the agent's loop (the hub hands the paths: a conversation's folder may sit on a slow
 *  mount) — opened non-blocking (a FIFO holds nothing), a regular file of at most SETTINGS_READ_MAX bytes, ENOENT = missing */
async function settingsReadOff(file) {
  let fh = null;
  try {
    fh = await fs.promises.open(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0));
    const st = await fh.stat();
    return st.isFile() && st.size <= SETTINGS_READ_MAX ? { text: await fh.readFile('utf8') } : { text: null };
  } catch (e) { return e && e.code === 'ENOENT' ? { missing: true } : { text: null }; } finally { try { if (fh) await fh.close(); } catch { } }
}
const START_FACT_MS = 5000;   // the whole start answer: past it, «cannot be read» (billing wins) — the hub's own bound is 8 s
let loginDirMemo = null;      // the login shell's CLAUDE_CONFIG_DIR (the CLI on this machine starts under `sh -lc`), asked at most once a minute
let loginDirAsk = null, loginDirGen = 0;   // ONE login shell in flight: starts that find it asking join it (as the file reads do)
// B-77ed's remainder (主开发 2026-11-20): a Windows machine starts a conversation under `sh -lc` exactly when the hub's door lets the
// spawn through — when the list its agent's LAST HELLO said holds `sh` (src/agentd/agentd.js posixShells: a shell that answered a
// POSIX line within 3 s). The agent hands that list here; none handed (the hub's own process) or no `sh` = '' (today's answer).
// Its read (round wdg6h2r4m, should 1): «last said» is ONE value for the agent, while the door decides each link by its own hello —
// a later hello whose sh probe timed out drops `sh` while an earlier link still passes `sh -lc` starts. So a list that HAD `sh` and
// lost it reads «cannot be read» (null), never the empty word (a helper in the login shell's folder would be missed as «none»)
let shellsSaid = () => null, shSaidOnce = false;
function useShellsSaid(fn) { shellsSaid = typeof fn === 'function' ? fn : () => null; shSaidOnce = false; }
const startsUnderSh = () => { try { const l = shellsSaid(); const yes = Array.isArray(l) && l.includes('sh'); if (yes) shSaidOnce = true; return yes; } catch { return false; } };
// …and there the value is read the way the CLI will read it: by a NATIVE child of that same login shell — the agent's own node,
// handed as $0 (never typed into the command text; its path with forward slashes, a word the shell runs as a path), its program
// handed as $1, printing the one value between the markers and nothing else of that environment. Right by construction,
// whatever the shell does to a path on its way to a native program (no table of ours about how it spells a drive, a home or a
// mount). NOT MEASURED: no Windows machine runs in our gates (see the kb).
const WIN_CCD_READ = '"$0" -e "$1"';
const WIN_CCD_JS = "process.stdout.write('\\n__VS_CCD__' + (process.env.CLAUDE_CONFIG_DIR || '') + '\\n')";
async function loginConfigDir() {
  if (process.platform === 'win32' && !startsUnderSh()) return shSaidOnce ? null : '';   // a list that HAD sh and lost it: cannot be read
  if (loginDirMemo && Date.now() - loginDirMemo.at < 60000) return loginDirMemo.dir;
  if (loginDirAsk) return loginDirAsk;
  const gen = loginDirGen;
  const ask = (async () => {
    const out = await exec('sh', process.platform === 'win32' ? ['-lc', WIN_CCD_READ, process.execPath.replace(/\\/g, '/'), WIN_CCD_JS] : ['-lc', 'printf "\\n__VS_CCD__%s\\n" "$CLAUDE_CONFIG_DIR"'], 3000);   // POSIX machines: today's read, unchanged
    const i = out == null ? -1 : out.lastIndexOf('\n__VS_CCD__');
    const dir = i < 0 ? null : out.slice(i + 11).split('\n')[0].trim();
    if (gen === loginDirGen) loginDirMemo = { at: Date.now(), dir };   // an unanswered login shell (null ⇒ cannot be read) is remembered too: no 3 s a start; an answer asked before a forget writes nothing
    return dir;
  })().finally(() => { if (loginDirAsk === ask) loginDirAsk = null; });
  loginDirAsk = ask;
  return ask;
}
/** ONE READ IN FLIGHT PER FILE across starts (as the hub's readOneFactOnce): a start that finds a read of the same file pending
 *  joins it — a hung open on a stuck mount holds ONE libuv thread, never one more per start */
const startReads = new Map();
const readOffOnce = (file, readOff = settingsReadOff) => {
  const had = startReads.get(file);
  if (had) return had;
  const p = readOff(file).finally(() => startReads.delete(file));
  startReads.set(file, p);
  return p;
};
/** B-77ed: a START's fact on this machine — the files the hub's own start reads, by the one rule, over the UNION of the config
 *  dirs the CLI may use (~/.claude, this process's CLAUDE_CONFIG_DIR, the login shell's — a non-absolute one cannot be placed),
 *  the start's project files and the person's own (the hub hands the cwd — a relative one is the home's, as a remote `cd`
 *  places it — and the file); a file that cannot be placed or read counts «cannot be read» while the others are still read
 *  (a helper named anywhere wins) → 'named' | 'none' | 'unread'. Off the loop, bounded by START_FACT_MS; only the verdict
 *  word leaves this machine. (`o` = a suite's seams: the reader, the bound) */
async function startHelperFact({ cwd = null, ownFile = null } = {}, o = {}) {
  const readOff = o.readOff || settingsReadOff, bound = Number(o.boundMs) > 0 ? Number(o.boundMs) : START_FACT_MS;
  const work = (async () => {
    const placed = startFilesOf({ cwd, ownFile }, nodeAt(path, os.homedir())), unplaced = placed.unplaced;   // ONE placement for every road (src/helper-fact.js)
    const login = await loginConfigDir();
    const dirs = [path.join(os.homedir(), '.claude')], dirsUnread = login === null;
    let badDir = false;
    for (const d of [String(process.env.CLAUDE_CONFIG_DIR || '').trim(), login || '']) { if (!d) continue; if (path.isAbsolute(d)) dirs.push(path.normalize(d)); else badDir = true; }
    const files = [...new Set(dirs)].map((d) => path.join(d, HELPER_ROW.file)).concat(placed.files);
    const facts = await Promise.all(files.map(async (p) => helperFactOfText(await readOffOnce(p, readOff), HELPER_ROW)));
    if (unplaced || dirsUnread || badDir) facts.push(null);   // what could not be placed or asked: cannot be read
    const f = combinedFact(facts);
    return f === true ? 'named' : f === null ? 'unread' : 'none';
  })();
  let timer = null;
  const late = new Promise((r) => { timer = setTimeout(() => r('unread'), bound); if (timer.unref) timer.unref(); });
  try { return await Promise.race([work.catch(() => 'unread'), late]); } finally { clearTimeout(timer); }
}
/** B-e7c0 ON A PAIRED MACHINE (ruled 2026-11-21 00:26Z, r723) — THE DEVICE'S OWN MERGE (op `settings-merge`): {sid, cwd, ownFile, layer}
 *  → { ok: true, path, dropped } | { ok: false, reason }. THIS machine decides what it reads and where it writes: the person's own
 *  file is found by the one placement the start's probe uses here (startFilesOf over this machine's home; a «~/» name: the literal
 *  under the cwd, as the hub's own rule) — a path the hub states is never opened as given; it is read bounded (settingsReadOff:
 *  non-blocking, a regular file ≤ SETTINGS_READ_MAX); the file it writes is named from the sid it checks itself (MERGE_SID_RE)
 *  under `dir` (the agent's state/settings), 0600, exclusive create; the layer a plain object ≤ LAYER_MAX, refused by name
 *  otherwise; the merge is src/settings-merge.js deviceMergeOf (the one rule both sides run). Bounded whole (`boundMs`). */
async function settingsMergeOp(msg, { dir, write = null, readOff = settingsReadOff, boundMs = 3000 } = {}) {   // `write(file, text)`: the agent's own 0600 exclusive writer (this module writes nothing itself)
  const BILLPICK = require('./settings-merge.js');   // the one merge (PURE) — billing-pick's words stay off the device bundle
  const sid = msg && typeof msg.sid === 'string' && BILLPICK.MERGE_SID_RE.test(msg.sid) ? msg.sid : null;
  if (!sid) return { ok: false, reason: 'bad-sid' };
  const lr = BILLPICK.layerRefusal(msg.layer);
  if (lr) return { ok: false, reason: lr };
  if (typeof dir !== 'string' || !path.isAbsolute(dir) || typeof write !== 'function') return { ok: false, reason: 'no-state-dir' };
  const work = (async () => {
    const at = nodeAt(path, os.homedir());
    const all = startFilesOf({ cwd: msg.cwd, ownFile: msg.ownFile }, at), bare = startFilesOf({ cwd: msg.cwd }, at);
    const own = all.files.filter((f) => !bare.files.includes(f));
    if (!own.length) return { ok: false, reason: 'own-file-unplaced' };
    const r = await readOff(own[own.length - 1]);   // the literal file the CLI opens (the last placed: under the cwd for a «~/» name)
    if (!r || typeof r.text !== 'string') return { ok: false, reason: r && r.missing ? 'own-file-missing' : 'own-file-unread' };
    const m = BILLPICK.deviceMergeOf({ ownText: r.text, layer: msg.layer, row: HELPER_ROW });
    if (!m.ok) return m;
    const file = path.join(dir, `${sid}.settings`);
    await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.promises.unlink(file).catch(() => { });
    await write(file, m.json);
    return { ok: true, path: file, dropped: m.dropped.slice(0, 64) };
  })();
  let timer = null;
  const late = new Promise((res) => { timer = setTimeout(() => res({ ok: false, reason: 'late' }), boundMs); if (timer.unref) timer.unref(); });
  try { return await Promise.race([work.catch((e) => ({ ok: false, reason: 'write-failed', code: (e && e.code) || null })), late]); } finally { clearTimeout(timer); }
}
/** …and its files' life: a merged file whose conversation ENDED by this machine's own record (`ended(sid)`: a pipe session or a
 *  keeper that says it exited) or older than SETTINGS_KEEP_MS goes — run with the agent's hourly sweep of its other state */
const SETTINGS_KEEP_MS = 7 * 86400000;
async function sweepMergedSettings(dir, { ended = () => false, now = Date.now() } = {}) {   // off the loop (the sync-fs census)
  let names = [], gone = 0;
  try { names = await fs.promises.readdir(dir); } catch { return 0; }
  for (const fn of names) {
    const m = /^([A-Za-z0-9_-]{1,64})\.settings$/.exec(fn);
    if (!m) continue;
    const f = path.join(dir, fn);
    let mt = 0;
    try { mt = (await fs.promises.stat(f)).mtimeMs; } catch { continue; }
    let over = false;
    try { over = !!(await ended(m[1])); } catch { over = false; }
    if (over || now - mt > SETTINGS_KEEP_MS) { try { await fs.promises.unlink(f); gone++; } catch { } }
  }
  return gone;
}
/** (a suite's seam: forget the login shell's answer) */
const forgetLoginDir = () => { loginDirMemo = null; loginDirAsk = null; loginDirGen++; };
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
 *  as an elif rung hid the actual billing path). keyHelperUnread (B-bc9f): the
 *  settings file cannot be read (not JSON, not an object, not a regular file,
 *  a failed read) — the third state; the hub's start lets billing win there. */
function claudeLoginFacts() {
  const home = os.homedir();
  const r = { loggedIn: false, loginMethod: null, machineLoginState: null, keyHelper: false };
  const helper = helperFact();
  if (helper === true) r.keyHelper = true; else if (helper === null) r.keyHelperUnread = true;
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
async function cliFacts({ claudeCmd = 'claude', codexCmd = 'codex', helper = null, level = false, version = null } = {}) {
  const out = { platform: process.platform, claude: {}, codex: {} };
  const startP = helper && typeof helper === 'object' ? startHelperFact(helper) : null;   // B-77ed: begun at once, beside the --version runs (the hub's bound is 8 s)
  for (const [key, cmd] of [['claude', claudeCmd], ['codex', codexCmd]]) {
    const p = which(cmd);
    const b = out[key];
    b.cmdPath = p;
    b.install = classifyInstall(p);
    if (!p) { b.installed = false; b.version = null; continue; }
    const notRun = realCliRefusal(key, { cmd: p });   // B-ec25: found, never started — the version unknown, said by name
    if (notRun) { b.installed = true; b.version = null; b.notRun = notRun; sayNotRun(`${key} --version`, notRun); continue; }
    const v = await exec(p, ['--version']);
    b.installed = v !== null;
    b.version = v ? v.trim().split('\n')[0] : null;
  }
  const login = await claudeLoginFacts();
  Object.assign(out.claude, login);
  if (out.claude.machineLoginState === null) delete out.claude.machineLoginState;
  if (startP) out.claude.startHelper = await startP;   // B-77ed: asked for a start (its cwd and own file)
  if (level === true) out.claude.level = await cliLevel(claudeCmd, { version: typeof version === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,6}$/.test(version) ? version : null });   // B-24e2: the CONVERSATION's build (asked only above the hub's span)
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
    keyHelper: helperFact() === true,   // the page's warning reads the helper the start's rule reads (B-bc9f)
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
async function cliVersion(cmd, { id = 'claude' } = {}) {
  const p = which(cmd);
  if (!p) return null;
  const notRun = realCliRefusal(id, { cmd: p });   // B-ec25: the oat tick's read — «no answer», the last known version stands
  if (notRun) { sayNotRun(`${id} --version`, notRun); return null; }
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
/** B-24e2 — DOES A CLAUDE CODE BUILD ON THIS MACHINE DECLARE THE BACKGROUND SIGNAL (a fact about a machine is read where it lives).
 *  THE BUILD A CONVERSATION RUNS is read from THAT conversation's own program file (round wwf11hqbh, the must: a long-idle
 *  conversation runs the build it STARTED on, while the program on the PATH may have updated itself since): `version` = the build
 *  the hub asks for. levelFileFor finds, in order: ① a RUNNING process started from that build's file — read through the process
 *  itself (/proc/<pid>/exe opens the file it was started from, even after the file on disk was replaced); ② that build's own file
 *  by its version where the installer keeps it (the PATH program's own `versions` folder); ③ the PATH's program — whose read
 *  DECIDES whether it is that build (its identity checked). No version asked = the PATH's program.
 *  ONE scan per file identity, kept in memory; at most ONE scan at a time; the ask never waits (the hub's probe-cli bound is 9 s):
 *  → {state: 'read', declared, whole, version, size, maxStepMs, ms, via} | {state: 'reading'} | {state: 'cut', at, retryAt} — A CUT
 *  READ IS REMEMBERED (主开发 2026-11-20 12:22Z): not read again before retryAt (an hour) unless the file's identity changes |
 *  {state: 'gone', version, read?} — the asked build's own file is no longer here (or the file read names another build) |
 *  {state: 'none'} (no program). Reading a file starts nothing. */
const LEVEL_RETRY_MS = 3600e3, LEVEL_MEMO_MAX = 8;
const _levelMemo = new Map();   // file identity → answer
let _levelScan = null;          // the one scan in flight
async function levelFileFor(cmd, version, { procRoot = '/proc', platform = process.platform } = {}) {
  const p = which(cmd);
  let real = null; if (p) { try { real = await fs.promises.realpath(p); } catch { real = null; } }
  const vdir = real && path.basename(path.dirname(real)) === 'versions' ? path.dirname(real) : null;
  if (version && platform === 'linux') {   // ① a process started from that build (the file may since have been replaced)
    let pids = []; try { pids = await fs.promises.readdir(procRoot); } catch { pids = []; }
    for (const pid of pids) {
      if (!/^\d+$/.test(pid)) continue;
      let t = null; try { t = await fs.promises.readlink(path.join(procRoot, pid, 'exe')); } catch { continue; }
      const file = t.replace(/ \(deleted\)$/, '');
      // (wiqep65pr (4)) the installer's layout: <its versions folder>/<version> — the PATH program's own folder, else a folder named «versions»
      if (path.basename(file) === version && (vdir ? path.dirname(file) === vdir : path.basename(path.dirname(file)) === 'versions')) return { path: path.join(procRoot, pid, 'exe'), via: 'process' };
    }
  }
  if (version && vdir) { const f = path.join(vdir, version); try { if ((await fs.promises.stat(f)).isFile()) return { path: f, via: 'versions' }; } catch { } }   // ② its own file
  return real ? { path: real, via: 'path' } : null;   // ③ the PATH's program (its read decides whether it is that build)
}
const levelAnswer = (m, version, via) => {
  if (m.state !== 'read') return { ...m, ...(version ? { version } : {}) };
  if (version && !m.version) return { state: 'gone', version, read: null, unnamed: true, via, why: 'the file read names no build' };   // (wiqep65pr (2))
  if (version && m.version !== version) return { state: 'gone', version, read: m.version, via, why: `this machine's program is ${m.version} now; ${version}'s own file is no longer on it` };
  return { ...m, via };
};
async function cliLevel(cmd, { version = null, scan = (p) => require('./cli-level-scan.js').scanLevel(p), now = () => Date.now(), procRoot = '/proc', platform = process.platform } = {}) {   // the scan required here: a suite loads a COPY of this file
  const c = await levelFileFor(cmd, version, { procRoot, platform });
  if (!c) return { state: 'none' };
  let st = null; try { st = await fs.promises.stat(c.path); } catch { st = null; }
  if (!st || !st.isFile()) return version ? { state: 'gone', version, why: `${version}'s own file is no longer on this machine` } : { state: 'none' };
  const identity = `${st.dev}:${st.ino}:${st.size}:${Math.round(st.mtimeMs)}`;
  const m = _levelMemo.get(identity);
  if (m && !(m.state === 'cut' && now() >= m.retryAt)) return levelAnswer(m, version, c.via);
  if (_levelScan) return { state: 'reading', ...(version ? { version } : {}) };
  _levelMemo.set(identity, { state: 'reading' });
  _levelScan = Promise.resolve().then(() => scan(c.path)).then((r) => {
    const t = now();
    // (wiqep65pr (3)) filed under the identity of the file the SCAN opened (one handle): a link that changed in between never files
    // another file's verdict under this one
    const key = r && typeof r.identity === 'string' ? r.identity : identity;
    if (key !== identity) _levelMemo.delete(identity);
    _levelMemo.set(key, r && !r.error && r.whole === true ? { state: 'read', declared: r.declared === true, whole: true, version: r.version || null, size: r.size, maxStepMs: r.maxStepMs, ms: r.ms }
      : { state: 'cut', at: t, retryAt: t + LEVEL_RETRY_MS, why: (r && r.error) || 'not read whole' });
    while (_levelMemo.size > LEVEL_MEMO_MAX) _levelMemo.delete(_levelMemo.keys().next().value);
  }, (e) => { const t = now(); _levelMemo.set(identity, { state: 'cut', at: t, retryAt: t + LEVEL_RETRY_MS, why: (e && e.code) || 'read-failed' }); })
    .finally(() => { _levelScan = null; });
  return { state: 'reading', ...(version ? { version } : {}) };
}
/** tests only: forget the scans (a «restart» of the device agent) / the scan in flight, to await */
function _levelReset() { _levelMemo.clear(); _levelScan = null; }
function _levelInFlight() { return _levelScan; }
/** …the cheap half (no hash): {path, cmd, size, identity} — the hub's 60 s check that the file the sessions spawn is the same */
async function cliBinaryIdentity(cmd) {
  const p = which(cmd);
  if (!p) return null;
  try { const real = await fs.promises.realpath(p); const st = await fs.promises.stat(real); return { path: real, cmd: p, size: st.size, identity: `${st.dev}:${st.ino}:${st.size}:${Math.round(st.mtimeMs)}:${Math.round(st.ctimeMs)}` }; } catch { return null; }
}

module.exports = { settingsMergeOp, sweepMergedSettings, SETTINGS_KEEP_MS, cliFacts, credsFacts, classifyInstall, which, cliVersion, cliBinary, cliBinaryIdentity, cliLevel, _levelReset, _levelInFlight, realCliRefusal, sayNotRun, startHelperFact, forgetLoginDir, useShellsSaid };

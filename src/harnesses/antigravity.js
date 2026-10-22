'use strict';
// Antigravity CLI (Google, `agy`) — lane antigravity-harness (the owner 2026-10-20: 「如果有 antigravity cli 就别搞 gemini
// cli 了」; design q-053 §6 P0d re-cut). MEASURED on agy 1.4.3 (scripts/fixtures/antigravity-cli-1.4.3.json — the real
// binary run offline with no sign-in, its own changelog, and the headless docs for the stream shapes):
//   · chat = ONE `agy --input-format stream-json --output-format stream-json` per conversation under
//     data/bin/agy-wrapper.js, which journals 'acp-events' records — the normalizer, the stdout consumer, the queue
//     strip and the artifacts reader are the ACP ones (caps.streamProtocol names the JOURNAL, not the agent);
//   · terminal = agy's TUI with the same flags (src/adapters/agy.js agyFlags);
//   · resume = `--conversation <conversation_id>` (the wrapper adopts the id agy names); a model / effort / mode
//     switch or Stop restarts agy on the same conversation (the stream has no cancel and no switch verb);
//   · a slash command is refused by the wrapper (agy would end the stream, exit 2) — ONLY agy's own, the closed measured
//     list AGY_SLASH_COMMANDS (./antigravity-slash.js); a line that starts with a path is text; an unauthenticated agy prints its
//     OAuth URL and waits 60 s for a pasted code ON STDIN — the wrapper kills it and says auth-required.
// Commit 1: the MACHINE's own Antigravity login. Commit 2 (creds below): named Google accounts, each its own HOME ROOT.
// Commit 3 shipped the `-p /usage` judge; lane antigravity-card-fixes the READING (AGY_QUOTA below), no pool.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BACKEND_CAPS } = require('../backend-caps');
const { AgyAdapter, AGY_EFFORTS } = require('../adapters/agy');
const { AcpMessageManager, AcpSessionMessages } = require('../acp-message-manager');
const { NULL_QUOTA } = require('./null-quota');
const AGY_USAGE = require('./antigravity-usage');
const { AGY_SLASH_COMMANDS } = require('./antigravity-slash');
const { HARNESS_SETTINGS } = require('../harness-settings');
const AS = require('../agy-store');
const ACP_ARTIFACTS = require('./artifacts-of.js').acp;
const AGY_BACKFILL = require('../agy-backfill'); // a sub that ALREADY RAN under an older wrapper: its card from the store

/** The model slugs the headless docs list (`agy models` needs a sign-in — measured), provenance 'docs'; the
 *  dropdown keeps a Custom… row, and agy refuses an unknown slug by name (headless never falls back). */
const AGY_MODELS = Object.freeze([
  'gemini-4-argon-high', 'gemini-4-argon-medium', 'gemini-3.8-flash-high', 'gemini-3.8-flash-medium',
  'gemini-3.7-flash-high', 'gemini-3.7-flash-medium', 'gemini-3.6-flash-high', 'gemini-3.6-flash-medium', 'gemini-3.1-pro-high',
].map((id) => Object.freeze({ id, label: id })));
const models = () => [{ id: '', label: 'Default' }, ...AGY_MODELS];

// ── NAMED ACCOUNTS = A HOME ROOT EACH (commit 2; 主开发's ruling 2026-10-20 11:29Z) ──
// MEASURED on agy 1.4.3 offline (bwrap --unshare-net, strace, no sign-in): agy keeps EVERYTHING under $HOME and
// ignores XDG_CONFIG_HOME; with no keyring it keeps the login in ONE file, `~/.gemini/antigravity-cli/
// antigravity-oauth-token` (read at every start, in every bus mode, after the keyring when one answers). The keyring
// is the OS one — SHARED by every HOME — and agy reaches it whenever a session bus is findable: the address in
// DBUS_SESSION_BUS_ADDRESS is dialed; with none, the hard-coded /run/user/<uid>/bus (present on a desktop) is
// probed; a `bus` under XDG_RUNTIME_DIR even makes it AUTOLAUNCH dbus-launch. `DBUS_SESSION_BUS_ADDRESS=disabled:`
// dials nothing and reads the file. So an account's spawn is HOME=<its root> + the bus disabled: the login is that
// root's file, never the person's keyring. The file is a SECRET AT REST we never read (only stat'ed for "signed
// in"), in a 0700 root (src/vault.js SECRETS_AT_REST names it).
const TOKEN_REL = path.join('.gemini', 'antigravity-cli', 'antigravity-oauth-token');
const ACCOUNT_MARK = '.vibespace-agy-account';   // the root is ours: the wrapper writes permission rules only under one
const LOGIN_CWD = '.vibespace-login';            // the login TUI's empty working dir (it trusts / indexes its cwd)
// THE ROOT IS A FARM of the person's HOME: every entry is a symlink to the real one, so the agent's own commands (git,
// ssh, npm, gh's files …) see the person's dotfiles — except agy's own state, which is per account: .gemini's
// antigravity* dirs and .config/antigravity (plugin secrets). Inside antigravity-cli the person's customizations are
// linked (hooks, skills, plugins, workflows); settings.json is the ACCOUNT'S OWN file (seeded once from the machine's)
// — a rule "Allow and retry" adds lands there, never in the person's global file.
const OWN_TOP = ['.gemini', '.config', ACCOUNT_MARK, LOGIN_CWD];
const OWN_GEMINI = ['antigravity-cli', 'antigravity', 'antigravity-ide'];
const OWN_CONFIG = ['antigravity'];
const SHARED_CLI = ['hooks.json', 'skills', 'plugins', 'workflows'];
const machineHome = () => os.homedir();

/** Mirror `real`'s entries into `dir` as symlinks, `own` excepted. Idempotent (a spawn refreshes it): a link whose
 *  target left is removed, a new entry is linked; a REAL file or dir in `dir` is never touched. */
function linkFarm(dir, real, own) {
  let names = [];
  try { names = fs.readdirSync(real); } catch { names = []; }
  const want = new Set(names.filter((n) => !own.includes(n)));
  let have = [];
  try { have = fs.readdirSync(dir); } catch { have = []; }
  for (const n of have) {
    if (own.includes(n) || want.has(n)) continue;
    try { if (fs.lstatSync(path.join(dir, n)).isSymbolicLink()) fs.unlinkSync(path.join(dir, n)); } catch { }
  }
  for (const n of want) {
    const p = path.join(dir, n);
    let st = null; try { st = fs.lstatSync(p); } catch { st = null; }
    if (st && !st.isSymbolicLink()) continue;
    if (st) { try { if (fs.readlinkSync(p) === path.join(real, n)) continue; fs.unlinkSync(p); } catch { continue; } }
    try { fs.symlinkSync(path.join(real, n), p); } catch { }
  }
}
const mkdir700 = (d) => { try { fs.mkdirSync(d, { recursive: true, mode: 0o700 }); fs.chmodSync(d, 0o700); } catch { } };
/** Build (or refresh) an account's HOME root `dir` from the machine's HOME `real`. */
function seedHomeRoot(dir, real = machineHome()) {
  mkdir700(dir);
  try { if (!fs.existsSync(path.join(dir, ACCOUNT_MARK))) fs.writeFileSync(path.join(dir, ACCOUNT_MARK), 'An Antigravity account home kept by VibeSpace.\n', { mode: 0o600 }); } catch { }
  mkdir700(path.join(dir, LOGIN_CWD));
  linkFarm(dir, real, OWN_TOP);
  mkdir700(path.join(dir, '.gemini'));
  mkdir700(path.join(dir, '.config'));
  linkFarm(path.join(dir, '.gemini'), path.join(real, '.gemini'), OWN_GEMINI);
  linkFarm(path.join(dir, '.config'), path.join(real, '.config'), OWN_CONFIG);
  const cli = path.join(dir, '.gemini', 'antigravity-cli'), realCli = path.join(real, '.gemini', 'antigravity-cli');
  mkdir700(cli);
  for (const n of SHARED_CLI) {
    const p = path.join(cli, n), t = path.join(realCli, n);
    let st = null; try { st = fs.lstatSync(p); } catch { st = null; }
    if (st && !st.isSymbolicLink()) continue;
    if (!fs.existsSync(t)) { if (st) { try { fs.unlinkSync(p); } catch { } } continue; }
    if (!st) { try { fs.symlinkSync(t, p); } catch { } }
  }
  const sp = path.join(cli, 'settings.json');
  if (!fs.existsSync(sp)) {
    let seed = '{}\n';
    try { const raw = fs.readFileSync(path.join(realCli, 'settings.json'), 'utf8'); JSON.parse(raw); seed = raw; } catch { }
    try { fs.writeFileSync(sp, seed, { mode: 0o600 }); } catch { }
  }
}
/** Signed in? A STAT of the login file — never a read (it is the account's secret). */
function parseAgyAuthDir(dir) {
  let st = null; try { st = fs.statSync(path.join(dir, TOKEN_REL)); } catch { st = null; }
  return st && st.isFile() && st.size > 0 ? { loggedIn: true, authMode: 'google-login', email: null, subscriptionType: null } : { loggedIn: false };
}
const shq = (v) => "'" + String(v).replace(/'/g, "'\\''") + "'";
/** The spawn env of an account: its root as HOME and the bus disabled (the login is the root's file). */
const spawnEnvOf = (dir) => ({ HOME: dir, DBUS_SESSION_BUS_ADDRESS: 'disabled:' });

/** THE QUOTA CONTRACT (lane antigravity-card-fixes): NULL_QUOTA's honest nothing — no stream signal (so auto-resume
 *  stays derived OFF), NO probe rung (`'cli-usage'` would arm claude's auto-cli TIMER, src/server/auto-cli-loop.js,
 *  and spawn `claude -p /usage` on these accounts) — plus `onDemand`: the usage command agy answers without a turn,
 *  read for ONE named account on a person's Re-check by src/server/cli-usage-door.js, in the account's own HOME root
 *  (cwd = its empty login dir), judged + parsed by antigravity-usage.js. No pool: agy keeps a conversation in its
 *  HOME root's own store, so a conversation cannot move to another account. */
const AGY_QUOTA = Object.freeze({
  ...NULL_QUOTA,
  onDemand: Object.freeze({ argv: AGY_USAGE.USAGE_ARGV, source: AGY_USAGE.USAGE_SOURCE, judge: AGY_USAGE.judgeUsageAnswer, cwdOf: (env) => path.join(env.HOME, LOGIN_CWD) }),
});

/** BILLING IDENTITY of a live agy session: a named Google account (its own HOME root) or the machine's own login. */
function agyBillingIdentity(s, { accounts, withHost }) {
  if (s._accountId) {
    const a = accounts.get(s._accountId);
    return withHost({ source: 'login-account', label: 'Google account', name: a?.name || 'Google' });
  }
  return withHost({ source: 'login-cli', label: 'Google login' });
}

// ── SUBAGENTS (lane agy-subagent-cards, 2026-10-21) ──
/** THE HELPER DOOR: a FINISHED subagent card (the wrapper's `subagent` record — its status no longer running) names the
 *  sub's own transcript in the store it was read from (the record's account HOME root — data/agy-subs/<id> or this
 *  machine's login); its write_file / edit_file calls become THIS conversation's Artifacts rows `via` the sub. A running
 *  card, any other record, an id that is not a conversation id ⇒ [] with no disk read (src/agy-store.js builds the path —
 *  never the login file). */
function agyHelperTranscripts(record, ctx = {}) {
  const r = record || {};
  if (r.type !== 'acp' || r.kind !== 'subagent' || !r.status || r.status === 'running') return [];
  const rel = AS.storePaths(r.subId)?.transcriptFull;
  if (!rel || !AS.storeReadable(rel)) return [];
  const home = typeof ctx.home === 'string' && ctx.home ? ctx.home
    : (typeof r.home === 'string' && path.isAbsolute(r.home) && path.normalize(r.home) === r.home ? r.home : machineHome());
  return [{ file: path.join(home, '.gemini', 'antigravity-cli', ...rel.split('/')), via: { kind: 'subagent', name: String(r.role || r.typeName || 'subagent').slice(0, 120) } }];
}
/** The artifacts reader: the journal's ACP records (the ACP reader) and, through the helper door, a SUB's transcript
 *  lines — a write call names its path (agy-store artifactRecordsOf; MEASURED: write_file {Path, Content, Overwrite}). */
function agyArtifactsOf(rec) {
  if (rec && (rec.type === 'acp' || rec.method)) return ACP_ARTIFACTS(rec);
  return AS.artifactRecordsOf(rec).flatMap((x) => ACP_ARTIFACTS(x));
}

const creds = {
  subsDirName: 'agy-subs',                   // data/agy-subs/<id> = the account's HOME root (0700)
  idPrefix: 'agy',                           // agy-<12 hex> (accounts.createHomeSubscription)
  files: [],                                 // NOTHING is exported, imported or shipped: the login is a secret we never read
  authFile: TOKEN_REL,
  bumpFile: null,
  hostFactsKey: 'antigravity',
  longLivedToken: false,
  supportsApiKeys: false,                    // Google logins only
  localOnly: true,                           // a named account runs on THIS machine (its login never leaves it)
  remoteSymlinks: {},
  ensureTargets: [],
  probe: null,
  sharedHome() { return machineHome(); },
  seedDir(dir) { seedHomeRoot(dir); },
  /** The spawn env (accounts._resolveHomeSpawn): refreshes the root's farm, then HOME + the bus disabled. NOT an
   *  `*EnvVar` field: those names are stripped from every agent and job (src/harness-env.js) — HOME never is. */
  spawnEnv(dir) { seedHomeRoot(dir); return spawnEnvOf(dir); },
  /** The login terminal («Add Google account (Antigravity)»): agy's OWN sign-in in its TUI — it prints a link and
   *  reads the code pasted back (the hub never sees a token), on the account's root, in an empty working dir. */
  loginCommand(dir) {
    const env = spawnEnvOf(dir);
    return `cd ${shq(path.join(dir, LOGIN_CWD))} && HOME=${shq(env.HOME)} DBUS_SESSION_BUS_ADDRESS=${env.DBUS_SESSION_BUS_ADDRESS} ${shq(process.env.ANTIGRAVITY_CMD || 'agy')}`;
  },
  ledgerType: 'antigravity-subscription',
  // the names agy reads as a login (its binary + docs): an ambient copy would bill a session for a login it did not
  // pick — stripped from agents and jobs (src/harness-env.js); there is no homeEnvVar (HOME is everyone's)
  keyEnvVars: ['GEMINI_API_KEY', 'AGY_ADC_AUTH', 'GOOGLE_GEMINI_BASE_URL'],
  loginLabel: 'Google',
  defaultIdField: 'defaultAntigravityAccountId',
  spawnForm: 'isolated-home',                // accounts.resolveForSpawn: spawnEnv(the account's root)
  keychainSensitive: false,
  parseAuth: parseAgyAuthDir,
  parseAuthFile: (file) => parseAgyAuthDir(path.resolve(path.dirname(file), '..', '..')),
  /** The machine's own login for the Agents panel (GET /api/backend-status) — a stat, never a spawn, never a read.
   *  No file may still mean signed in: with a session bus agy keeps the machine login in the OS keyring (unknown). */
  machineStatus({ cmd } = {}) {
    const installed = typeof cmd === 'string' && cmd.startsWith('/');
    const info = parseAgyAuthDir(machineHome());
    return { installed, cmdPath: installed ? cmd : null, version: null, loggedIn: info.loggedIn ? true : null, email: null, loginMethod: info.loggedIn ? 'google-login' : null };
  },
};

module.exports = {
  id: 'antigravity',
  label: 'Antigravity CLI',
  kind: 'chat',
  caps: BACKEND_CAPS.antigravity,
  Adapter: AgyAdapter,
  // cli-env resolves the executable at boot (exe.command, ANTIGRAVITY_CMD overrides; the bare name when nothing is
  // found) and hands the shared wrapper paths; a status read re-checks it (src/server/cli-cmd.js `check` — an agy
  // installed after boot is seen without a restart, lane antigravity-card-fixes); the chat wrapper is agy's own
  adapterConfig: (cfg) => ({
    harnessId: 'antigravity',
    label: 'Antigravity CLI',
    commandName: 'agy',
    command: (cfg.acpCommands && cfg.acpCommands.antigravity) || null,
    env: {},
    chatWrapper: path.join(path.dirname(cfg.acpWrapper || path.join(__dirname, '..', '..', 'data', 'bin', 'acp-wrapper.js')), 'agy-wrapper.js'),
    ptyWrapper: cfg.ptyWrapper,
  }),
  exe: { command: 'agy' },     // the agent executable cli-env resolves (the `acp` row's twin for a non-ACP agent)
  wrapper: 'data/bin/agy-wrapper.js',
  Normalizer: AcpMessageManager,
  store: {
    // agy keeps conversations in its own sqlite (~/.gemini/antigravity-cli/conversation_summaries.db) — no per-
    // conversation file to locate; the wrapper journal is the history (the ACP rule) — read with the cards of subs that
    // already ran under a wrapper older than the cards (src/agy-backfill.js, the cards' addendum)
    locate: () => null,
    SessionMessages: AGY_BACKFILL.AgySessionMessages,
    // the turn end of a conversation an OLD wrapper still serves (dtach kept its code across the update): the cards of
    // its card-less invoke_subagent rows, read from the store — records acp-events routes as if journaled
    afterTurn: (session) => AGY_BACKFILL.afterTurn(session),
  },
  quota: AGY_QUOTA,            // the `-p /usage` reading on a person's Re-check (answered without a turn — agy's own changelog)
  // AUTO-RESUME'S RESUME VERB: a continue is a user line on the wrapper's stdin (the 'prompt' form, as ACP) — the
  // verb exists; AGY_QUOTA classifies no limit (NULL_QUOTA's signal), so nothing can arm it (derived: never offered)
  resume: { form: 'prompt', deliver: (session, text, deps) => !!deps.sendChatInput(session, text) },
  // the billing row: a Google login per account (its HOME root), no API keys / long-lived token; the usage of a named
  // account rides /api/usage's homeAccounts map (the Re-check reading), not a billing-row store. effortLevels = agy's own
  // --effort list (the adapter's AGY_EFFORTS, the one place) and NO effortExtras: the menu offers exactly these (lane
  // effort-menu-per-harness — it used to offer claude's ultracode); effortReport null = no turn reports its effort.
  ui: { billing: { globalLogin: 'Google login', cliLogin: 'Google login', pickLogin: 'Google login (Antigravity CLI)', pickLoginHost: 'Google login (on the host)', planSuffix: '', switchLogin: 'Google login', accountLogin: 'Google', defaultIdField: 'defaultAntigravityAccountId', apiKeys: false, longLivedToken: false, hostLogin: false, machineUsage: false, usage: null, globalUsageKey: null, estimates: false }, effortReport: null, effortLevels: AGY_EFFORTS, modelLock: true, legacyIds: false, resumeResend: false, subagents: 'cards' },
  creds,
  billingIdentity: agyBillingIdentity,
  settingsPrefix: 'antigravity',
  settings: HARNESS_SETTINGS.antigravity,
  configFiles: {},
  models,
  artifactTools: require('./artifacts-of.js').ARTIFACT_TOOLS.acp,
  // the journal's tool records carry agy's tool_info (no `diff` content — measured: write_file's stream parameters are
  // {Path} alone), so the parent's own writes produce nothing here; a SUB's writes arrive through the helper door below
  artifactsOf: agyArtifactsOf,
  // lane agy-subagent-cards: ui.subagents 'cards' — each invoke_subagent row is a card (the wrapper reads the store) that
  // opens the sub's own timeline as the virtual session sub-<id>; a finished sub's writes reach the Artifacts chip
  helperTranscriptsOf: agyHelperTranscripts,
  inject: { kind: 'acp', hookFile: null, hookEvents: [], sessionStartHonoured: false },
  brand: '/brand/antigravity.svg',
};
module.exports.AGY_MODELS = AGY_MODELS;
module.exports.AGY_QUOTA = AGY_QUOTA;
module.exports.AGY_SLASH_COMMANDS = AGY_SLASH_COMMANDS;   // the commands agy answers itself — the wrapper keeps exactly these out of its stream
module.exports.TOKEN_REL = TOKEN_REL;
module.exports.ACCOUNT_MARK = ACCOUNT_MARK;
module.exports.seedHomeRoot = seedHomeRoot;
module.exports.parseAgyAuthDir = parseAgyAuthDir;

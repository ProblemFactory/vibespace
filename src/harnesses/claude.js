'use strict';
// Claude Code harness descriptor (S1). Declarations only reference the
// existing implementations — behaviour lives where it always did.
const { BACKEND_CAPS } = require('../backend-caps');
const { ClaudeCodeAdapter } = require('../adapters/claude-code');
const { MessageManager } = require('../message-manager');
const store = require('../session-store');
const { sweepSharedLegs, fdScanShellFns, cliIdentityShellFns } = require('../writer-sweep');
// WRITER SWEEP holder legs (store.writerSweep; the generic runner is
// writer-sweep.js sweepWriters): an fd on `<rid>.jsonl` (/proc scan, lsof on
// macOS/BSD ssh hosts) + the CLI's own ~/.claude/sessions lock files; the
// protect list is unused — a claude writer of THIS id is never a live peer.
function claudeWriterSweep(rid, shq) {
  return `RID=${shq(rid)}
# writer sweep (VS_WRITER_SWEEP), portable: /proc fd scan on Linux; lsof on
# macOS/BSD ssh hosts (no /proc there — the old script silently swept NOTHING,
# audit 2.192.0). Holding the transcript open is the EVIDENCE; vs_is_cli decides
# whether the holder is the CLI (a writer) or a reader that must survive.
${fdScanShellFns()}
${cliIdentityShellFns()}
vs_claude_kill() {
  vs_is_cli "$1" claude || return 0
  kill -TERM "$1" 2>/dev/null && echo "SWEPT:$1"
}
if [ -d /proc/1 ] || [ -d /proc/self ]; then
  for pid in $(vs_fd_pids "/$RID.jsonl"); do vs_claude_kill "$pid"; done
elif command -v lsof >/dev/null 2>&1; then
  J=$(find "$HOME/.claude/projects" -maxdepth 2 -name "$RID.jsonl" 2>/dev/null | head -1)
  if [ -n "$J" ]; then
    for pid in $(lsof -t -- "$J" 2>/dev/null); do vs_claude_kill "$pid"; done
  fi
fi
# The CLI's own lock file names the pid; the executable test is what keeps a
# STALE file whose pid has been reused from killing an unrelated process.
find "$HOME/.claude/sessions" -maxdepth 1 -name '*.json' 2>/dev/null | while read -r f; do
  pid=$(basename "$f" .json)
  grep -q "\\"sessionId\\":\\"$RID\\"" "$f" 2>/dev/null || continue
  kill -0 "$pid" 2>/dev/null || continue
  vs_claude_kill "$pid"
done
${sweepSharedLegs()}`;
}
const { loginState } = require('../login-expiry'); // PURE: refreshTokenExpiresAt -> ok/expiring/expired/logged-out/unknown
const { HARNESS_SETTINGS } = require('../harness-settings'); // PURE: THE declared settings table (design-harness-settings §2)
const { cliConfigFile } = require('../harness-config');       // SHARED: the descriptor-side file object over the table's `files` entry
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Read-only parse of a claude subscription account dir (NEVER writes or
 *  refreshes — rotation would break the account, issue #20): loggedIn +
 *  identity + the access token IF currently valid (for the usage poll). */
function parseClaudeAuth(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, '.credentials.json'), 'utf-8'));
    const o = raw?.claudeAiOauth;
    if (!o?.accessToken) return { loggedIn: false };
    const valid = !o.expiresAt || Date.now() < o.expiresAt - 60000;
    // Identity (email/org) is NOT in .credentials.json — it's in the dir's
    // .claude.json (written because LOGIN also set CLAUDE_CONFIG_DIR=dir).
    let email = o.email || o.emailAddress || null, org = null;
    if (!email) {
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.claude.json'), 'utf-8'));
        email = cfg?.oauthAccount?.emailAddress || null;
        org = cfg?.oauthAccount?.organizationName || null;
      } catch { }
    }
    return { loggedIn: true, subscriptionType: o.subscriptionType || null, email, org, accessToken: valid ? o.accessToken : null, expiresAt: o.expiresAt || null };
  } catch { return { loggedIn: false }; }
}

/** LOGIN LIFETIME of an account dir (2026-09-07). The SAME file parseAuth
 *  already reads, asked a different question: not "is there a token" but "when
 *  does this LOGIN SESSION end". Read-only, never refreshes. A dir with no
 *  readable credentials answers 'unknown' — NO CLAIM, which every consumer
 *  treats as "do not block". Only harnesses whose credential format carries a
 *  login deadline declare this; the others simply do not, and accounts.js
 *  answers 'unknown' for them rather than inventing a verdict. */
// THE ONE CLI config file VibeSpace may write for claude (design-harness-settings
// §2): ~/.claude/settings.json — the hook entries AND the managed keys
// (cleanupPeriodDays) live in it, so `inject.hookFile` and `configFiles.settings`
// are the SAME object (test-harness-contract pins the identity; the path is
// spelled once, in the PURE table's `files.settings.rel`). CREATED BY US WHEN
// ~/.claude EXISTS ('dir-exists', lane hooks-create 2026-10-01): the CLI does
// NOT write settings.json on its first run — only when somebody changes a
// setting — so a fleet user who only chats never had one, VibeSpace's hooks
// were never registered and her agents never learned the tools. ~/.claude
// existing proves the CLI has run here; the directory itself is never created.
const SETTINGS_FILE = cliConfigFile(HARNESS_SETTINGS.claude.files.settings, { createIfMissing: 'dir-exists' });

function claudeLoginState(dir, now = Date.now()) {
  const fp = path.join(dir, '.credentials.json');
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return loginState(null, now); }
  // `writtenAt` = the file's last write. It is the ONLY on-disk clock that
  // says anything about when this login session STARTED, but it is NOT the
  // login time: every access-token refresh rewrites this file while
  // refreshTokenExpiresAt stays put, so on an actively-used account it walks
  // forward and "deadline − writtenAt" shrinks towards zero. Nothing may treat
  // it as the session length on its own — the watch only uses it at a moment
  // it WITNESSED the deadline change (login-expiry-watch.measureLoginSpan).
  let writtenAt = null;
  try { writtenAt = fs.statSync(fp).mtimeMs; } catch { }
  return { ...loginState(raw, now), writtenAt };
}

/** THE GLOBAL-LOGIN GUESS at spawn (moved from ws-create's `_authAtSpawn`):
 *  a spawn with no account follows the CLI's GLOBAL login — record what that
 *  was RIGHT NOW so the badge can warn about API billing; the stream's init
 *  record (apiKeySource) later confirms or overrides it. */
function claudeAuthAtSpawn({ hostId, accounts }) {
  if (hostId) return 'remote-global';
  return accounts?.subscriptionStatus?.().loggedIn ? 'subscription'
    : (accounts?.cliPrimaryKey?.().present ? 'console' : 'unknown');
}

/** The usage statusline rides the CLI's `--settings` JSON (merged into one the
 *  spawn already carries — the existing arg is rewritten IN PLACE, as before). */
function withStatusline(args, command) {
  let settingsObj = {};
  const si = args.indexOf('--settings');
  if (si >= 0 && args[si + 1]) { try { settingsObj = JSON.parse(args[si + 1]) || {}; } catch {} }
  settingsObj.statusLine = { type: 'command', command, padding: 0 };
  const sjson = JSON.stringify(settingsObj);
  if (si >= 0) { args[si + 1] = sjson; return args; }
  return [...args, '--settings', sjson];
}

/** BILLING IDENTITY of a live session (moved from server.js sessionAuth): a
 *  named account / pool, else the stream's apiKeySource, else the spawn-time
 *  guess. `withHost` / `poolAuth` are server.js's generic helpers (host-name
 *  qualification, the ONE pooled shape). */
function claudeBillingIdentity(s, { accounts, withHost, poolAuth }) {
  if (s._accountId) {
    const a = accounts.get(s._accountId);
    if (a && a.type === 'pooled') return poolAuth(a);
    // A named SUBSCRIPTION account bills the subscription (not API) — show its
    // name, no amber key warning.
    if (a && (a.type || 'api') === 'subscription') return withHost({ source: 'subscription', name: a.name });
    return withHost({ source: 'api-key', name: a?.name || 'API key', tail: a?.tail || null });
  }
  const src = s._apiKeySource;
  if (src === 'none') return withHost({ source: 'subscription' });
  if (src === '/login managed key') return withHost({ source: 'api-console' });
  if (src === 'ANTHROPIC_API_KEY') return withHost({ source: 'api-key', name: 'env key' });
  if (typeof src === 'string' && src) return withHost({ source: 'api-other', detail: src });
  const at = s._authAtSpawn;
  if (at === 'subscription') return withHost({ source: 'subscription', guessed: true });
  if (at === 'console') return withHost({ source: 'api-console', guessed: true });
  if (at === 'env-key') return withHost({ source: 'api-key', guessed: true });
  // remote session with no explicit account: billed by the HOST's own CLI
  // login — a real subscription-or-key on that machine, never "unknown"
  // (2.188.0: remote TERMINAL sessions showed "KEY?" forever — apiKeySource
  // is chat-stream-only and the /proc backfill probes the LOCAL ssh wrapper).
  if (at === 'remote-global') return withHost({ source: 'subscription', guessed: true });
  return withHost({ source: 'unknown' });
}

module.exports = {
  id: 'claude',
  label: 'Claude Code',
  kind: 'chat',                 // chat + terminal
  caps: BACKEND_CAPS.claude,
  Adapter: ClaudeCodeAdapter,
  adapterConfig: (cfg) => ({ claudeCmd: cfg.claudeCmd, chatWrapper: cfg.chatWrapper, ptyWrapper: cfg.ptyWrapper, buffersDir: cfg.buffersDir }),
  wrapper: 'data/bin/chat-wrapper.js',
  Normalizer: MessageManager,
  // STORE (S3): everything "where do this harness's conversations live and
  // how are they read" — routes/sessions and transcript-service call these,
  // never a backend ternary. discover = the lock-first sweep (RUNNING
  // detection: locks + tmux + webui pids; moved verbatim into session-store).
  store: {
    discover: store.discoverClaudeSessions,        // async ({activeSessions, webuiPids, devSnap}) → session entries
    locate: (id, cwd) => store.findSessionJsonlPath(id, cwd), // (sessionId, cwd) → path|null
    // RESUME CONTINUITY (B-6b6d, round 2): claude declares NEITHER
    // `lastTurnModel` NOR `lastTurnEffort`, and the ABSENCE is the whole
    // declaration (src/resume-continuity.js: a knob with no source sends
    // NOTHING on a resume, never the instance default). Both knobs are absent
    // for the SAME reason — nothing claude writes records them in a form a
    // spawn can command:
    //   · EFFORT: nothing anywhere records the effort a turn ran at.
    //   · MODEL: every assistant record names the model that SERVED it, but
    //     never its context-window variant — measured over 2650 local
    //     transcripts, ZERO `message.model` values carry a `[…]` suffix while
    //     the CLI's own model_refusal_fallback records prove conversations on
    //     `claude-fable-5[1m]`. Commanding the served id would turn a 1M
    //     conversation into a 200k one on every resume. The reader round 1
    //     shipped for this is gone; the long-form reasoning (and the classifier
    //     -reroute measurement that also broke it) is in session-store.js.
    // So a claude resume commands neither knob and the CLI's own session
    // record — variant-exact — decides. Adding a hook back here is all it takes
    // if a future CLI records the commanded value.
    warmTranscript: store.warmSessionJsonlAsync,   // worker-side parse cache
    createReader: (session, sessionId, opts) => new store.SessionMessages(session, sessionId, opts || {}), // SessionMessages-shaped reader
    homeRename: require('./claude-home'),           // ~/.claude/projects re-encoding after a home rename (server.js / boot-restore call it)
    writerSweep: claudeWriterSweep,                  // (rid, shq) → POSIX sweep script (writer-sweep.js runs it)
    // the incident SCENE (src/incident.js, dc-twins M4 — local and remote read the same row): the process word, the
    // lock files the CLI deletes on exit, the state dirs worth a listing [label, $HOME-relative dir, max], the CLI
    scene: { process: 'claude', locks: '.claude/sessions', listings: [['project dirs', '.claude/projects', 30]], version: 'claude' },
    // remote transcript location (hosts.fetchTranscript): where find(1) looks + the cache name
    remoteFind: (id) => ({ root: '"$HOME"/.claude/projects', findExpr: `-maxdepth 2 -name ${JSON.stringify(id + '.jsonl')}`, cacheRel: id + '.jsonl', maxBytes: 64 * 1024 * 1024 }),
  },
  quota: require('./claude-quota.js'),   // QuotaSignalSource (S4): normalize/signalFromStream/probe/classifyAuthFailure
  // CREDENTIAL mechanics (S2): where a named account lives, which env var
  // relocates the CLI's secret store, how to read its auth (read-only), what
  // the login is called, which store field holds the default account.
  creds: {
    subsDirName: 'subs',                       // data/subs/<id>
    files: ['.credentials.json', '.claude.json'], // what an account dir ships/backs up (export, remote tar)
    bumpFile: '.credentials.json',             // creds-mtime bump on pool symlink swap (the CLI's cred-cache invalidation)
    hostFactsKey: 'subscription',              // hosts.js backend-status facts bucket carrying this harness's login email
    longLivedToken: true,                      // `claude setup-token` oat accounts exist (accounts._oatMeta)
    supportsApiKeys: true,                     // account records may be API keys (type 'api'); subscription otherwise
    remoteSymlinks: {}, ensureTargets: [],     // nothing shared on the host — securestorage relocates the secret store only
    probe: { file: '.credentials.json', marker: 'accessToken' }, // remote poison-heal marker (a wiped {} file must not win newest-wins)
    // Pre-seed an isolated login dir's .claude.json with the onboarding-complete
    // flags so `claude auth login` under CLAUDE_CONFIG_DIR=dir skips first-run
    // onboarding; the identity lands IN the dir — the global ~/.claude.json is
    // never clobbered.
    seedDir(dir) {
      const seed = { hasCompletedOnboarding: true, hasTrustDialogAccepted: true, theme: 'dark' };
      try { const g = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8')); if (g.theme) seed.theme = g.theme; } catch { }
      try { fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify(seed), { mode: 0o600 }); } catch { }
    },
    authFile: '.credentials.json',
    // OPTIONAL (2026-09-07): the login-session deadline this credential format
    // carries. Declared only where the format has one — an absent key is the
    // honest "this harness makes no claim".
    loginState: claudeLoginState,
    spawnEnvVar: 'CLAUDE_SECURESTORAGE_CONFIG_DIR',
    loginLabel: 'Claude',
    defaultIdField: 'defaultAccountId',
    spawnForm: 'securestorage',                // accounts.resolveForSpawn: subscription (pool link / oat) or API key; spawnEnvVar relocates the secret store
    legacyGlobalKey: '__global__',             // the pre-registry harness: its machine login's usage key; its records may omit `backend`
    keychainSensitive: true,                   // darwin keychain service name hashes the env string ⇒ pools need Linux
    parseAuth: parseClaudeAuth,
  },
  // AUTO-RESUME'S RESUME VERB (owner ruling 2026-09-08: auto-resume is generic,
  // "形式可以不一样 — 有些是发消息, 有些是 start turn 之类的固有指令"). This is
  // ONE of the two harness-specific halves; the other is quota.signalFromStream
  // above. Everything else — the timer, the loop breaker, the notices, restart
  // survival — is src/server/auto-resume.js and is harness-neutral.
  //   FORM 'message': claude's continue is an ordinary USER MESSAGE. The wrapper
  //   takes the adapter's stream-json chat-input frame on stdin and the CLI runs
  //   it as if it had been typed — which is exactly what the CLI's own TUI
  //   auto-continue does, so the conversation sees nothing new.
  // `deps.sendChatInput` is the ORCH channel (server.js's sendToSession) — the
  // descriptor names the verb, the orchestrator owns the socket, so this file
  // stays SHARED and the daemon can still bundle it.
  resume: {
    form: 'message',
    deliver: (session, text, deps) => !!deps.sendChatInput(session, text),
  },
  // SPAWN FACTS (lane dc-ws-create): what src/ws-create.js used to ask as
  // `backend === 'claude'` — rows/hooks of the spawn contract (./index.js SPAWN_ROWS).
  spawn: {
    conversationIdField: 'claudeSessionId', // the resume guard + the session's stamp read it beside backendSessionId
    // a host-less resume of a conversation NOT here is looked for in the remote caches (2.297.0)
    isLocalConversation: (id) => {
      const projectsDir = path.join(os.homedir(), '.claude', 'projects');
      try { return fs.readdirSync(projectsDir).some((d) => fs.existsSync(path.join(projectsDir, d, id + '.jsonl'))); } catch { return false; }
    },
    hostHeldLogin: true,          // a remote sub- account the host alone holds is rescued through evaluateOnHost (B-f531)
    authAtSpawn: claudeAuthAtSpawn,
    resumeMayFork: true,          // resuming a locked conversation mints a new id the parser adopts (2.219.0)
    statusline: withStatusline,   // only the claude CLI understands --settings (a shell/codex spawn exits on it)
    localPipe: true,              // R6: agentd.localPipeSessions may route a local chat spawn through the device-#0 pipe
    otelExport: true,             // local spawns export api_request telemetry to the loopback OTLP receiver (B-345b)
  },
  billingIdentity: claudeBillingIdentity,
  // THE DECLARED UI ROW (lane dc-client-billing, 2026-10-04): billing words, the accounts-store default field,
  // the usage bucket, effort/lock facts and the legacy id forms — the chrome reads THESE, never an id. The
  // client META mirrors it key for key (test-harness-contract deep-compares). effortExtras (lane effort-ultracode): the effort
  // rows that are NOT --effort values — appended AFTER the CLI's parsed levels, never replaced by them; a row
  // whose requiresLevel the probe did not parse is absent by name (ultracode spawns as --effort xhigh).
  ui: { billing: { globalLogin: 'Subscription', cliLogin: 'CLI login', pickLogin: 'Subscription (Pro/Max login)', pickLoginHost: '', planSuffix: ' (Pro/Max)', switchLogin: 'Subscription (Pro/Max)', defaultIdField: 'defaultAccountId', apiKeys: true, longLivedToken: true, hostLogin: true, machineUsage: true, usage: 'accounts', globalUsageKey: '__global__', estimates: true }, effortReport: 'commanded', effortLevels: null, effortExtras: [{ value: 'ultracode', label: 'Ultracode', hint: 'xhigh effort + standing dynamic-workflow orchestration', requiresLevel: 'xhigh' }], modelLock: true, legacyIds: true, resumeResend: true },
  expirySweep: require('./claude-oat-expiry.js').checkOatExpiry, // the long-lived setup-token expiry notices (B-211a; server.js's sweep timer asks every descriptor)
  settingsPrefix: 'claude',
  // THE SETTINGS TABLE (design-harness-settings §2): joined by OBJECT IDENTITY
  // like `caps` above — the schema derives the Claude section from it, the
  // server reads every row through harnessSetting(), and every cli-config row
  // names one of `configFiles` below.
  settings: HARNESS_SETTINGS.claude,
  configFiles: { settings: SETTINGS_FILE },
  artifactTools: require('./artifacts-of.js').ARTIFACT_TOOLS.claude, // lane artifacts-prompt-hint: the tools the intro names (artifactsIntroLine)
  artifactsOf: require('./artifacts-of.js').claude, // lane artifacts-model: Write / Edit / MultiEdit / NotebookEdit → the deliverable rows (src/artifacts.js)
  helperTranscriptsOf: require('./helper-transcripts.js').claude, // lane artifacts-handover: a Task / workflow agent's own transcript at its end → the parent's rows (via: subagent)
  // CONTEXT INJECTION strategy (S6): the CLI's own hooks carry task context
  // (SessionStart), per-prompt notices (UserPromptSubmit) and the stop-time
  // bookkeeping nudge (Stop); SessionStart output is honoured, so the
  // seen-gates in agent-routes advance on delivery.
  inject: {
    kind: 'hooks',
    hookFile: SETTINGS_FILE,               // the SAME object as configFiles.settings — one spelling of the path
    hookEvents: ['SessionStart', 'UserPromptSubmit', 'Stop'],
    sessionStartHonoured: true,
  },
};

'use strict';
// Codex harness descriptor (S1).
const { BACKEND_CAPS } = require('../backend-caps');
const { CodexAdapter } = require('../adapters/codex');
const { findCodexSessionJsonlPath } = require('../adapters/codex');
const { CodexMessageManager } = require('../codex-message-manager');
const codexStore = require('../codex-session-store');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Decode a JWT payload without verifying (identity display only — never trust
// for auth). Returns {} on any malformation.
function jwtPayload(tok) {
  try { const seg = String(tok).split('.')[1]; return JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')) || {}; } catch { return {}; }
}
/** Read-only parse of a codex auth.json (never refreshes): loggedIn + auth
 *  mode + identity (email/plan) from the id_token claims. `subscriptionType`
 *  mirrors `plan` so every harness reports the same shape. */
function parseCodexAuthFile(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const mode = raw.auth_mode || (raw.tokens ? 'chatgpt' : (raw.OPENAI_API_KEY ? 'apikey' : null));
    const hasTok = !!(raw.tokens?.access_token || raw.tokens?.id_token || raw.OPENAI_API_KEY);
    if (!hasTok) return { loggedIn: false };
    let email = null, plan = null;
    if (raw.tokens?.id_token) {
      const c = jwtPayload(raw.tokens.id_token);
      email = c.email || null;
      const auth = c['https://api.openai.com/auth'] || {};
      plan = auth.chatgpt_plan_type || auth.plan_type || null;
    }
    return { loggedIn: true, authMode: mode, email, plan, subscriptionType: plan };
  } catch { return { loggedIn: false }; }
}
const parseCodexAuth = (dir) => parseCodexAuthFile(path.join(dir, 'auth.json'));

module.exports = {
  id: 'codex',
  label: 'Codex',
  kind: 'chat',
  caps: BACKEND_CAPS.codex,
  Adapter: CodexAdapter,
  adapterConfig: (cfg) => ({ codexCmd: cfg.codexCmd, codexSandboxSupported: cfg.codexSandboxSupported, chatWrapper: cfg.codexChatWrapper, ptyWrapper: cfg.ptyWrapper }),
  wrapper: 'data/bin/codex-chat-wrapper.js',
  Normalizer: CodexMessageManager,
  store: {
    locateTranscript: findCodexSessionJsonlPath,   // (threadId) → rollout path|null
    listThreads: codexStore.listCodexThreads,
    transcriptDirs: ['~/.codex/sessions'],
    conversationIdField: 'backendSessionId',
  },
  quota: require('./codex-quota.js'),    // QuotaSignalSource (S4)
  // CREDENTIAL mechanics (S2): one isolated CODEX_HOME per named account
  // (auth.json isolated; sessions/ + config.toml symlink the shared ~/.codex).
  creds: {
    subsDirName: 'codex-subs',                 // data/codex-subs/<id>
    authFile: 'auth.json',
    spawnEnvVar: 'CODEX_HOME',
    loginLabel: 'ChatGPT',
    defaultIdField: 'defaultCodexAccountId',
    keychainSensitive: false,                  // plain file ⇒ pools work wherever directory symlinks do
    parseAuth: parseCodexAuth,
    parseAuthFile: parseCodexAuthFile,
  },
  settingsPrefix: 'codex',
  // CONTEXT INJECTION strategy (S6): hooks are registered (the app-server
  // RUNS them) but their SessionStart output is IGNORED, so the WRAPPER
  // delivers teaching through thread/inject_items (prompt-context route) and
  // the stop-time nudge rides turn/completed — no Stop hook. Seen-gates in
  // agent-routes must NOT advance on SessionStart for this harness.
  inject: {
    kind: 'wrapper',
    hookFile: { file: () => path.join(os.homedir(), '.codex', 'hooks.json'), createIfMissing: true },
    hookEvents: ['SessionStart', 'UserPromptSubmit'],
    sessionStartHonoured: false,
  },
};

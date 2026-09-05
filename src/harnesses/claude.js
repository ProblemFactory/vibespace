'use strict';
// Claude Code harness descriptor (S1). Declarations only reference the
// existing implementations — behaviour lives where it always did.
const { BACKEND_CAPS } = require('../backend-caps');
const { ClaudeCodeAdapter } = require('../adapters/claude-code');
const { MessageManager } = require('../message-manager');
const store = require('../session-store');
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

module.exports = {
  id: 'claude',
  label: 'Claude Code',
  kind: 'chat',                 // chat + terminal
  caps: BACKEND_CAPS.claude,
  Adapter: ClaudeCodeAdapter,
  adapterConfig: (cfg) => ({ claudeCmd: cfg.claudeCmd, chatWrapper: cfg.chatWrapper, ptyWrapper: cfg.ptyWrapper, buffersDir: cfg.buffersDir }),
  wrapper: 'data/bin/chat-wrapper.js',
  Normalizer: MessageManager,
  store: {
    locateTranscript: store.findSessionJsonlPath,   // (sessionId, cwd) → path|null
    warmTranscript: store.warmSessionJsonlAsync,   // worker-side parse cache
    transcriptDirs: ['~/.claude/projects'],
    conversationIdField: 'claudeSessionId',
  },
  quota: require('./claude-quota.js'),   // QuotaSignalSource (S4): normalize/signalFromStream/probe/classifyAuthFailure
  // CREDENTIAL mechanics (S2): where a named account lives, which env var
  // relocates the CLI's secret store, how to read its auth (read-only), what
  // the login is called, which store field holds the default account.
  creds: {
    subsDirName: 'subs',                       // data/subs/<id>
    authFile: '.credentials.json',
    spawnEnvVar: 'CLAUDE_SECURESTORAGE_CONFIG_DIR',
    loginLabel: 'Claude',
    defaultIdField: 'defaultAccountId',
    keychainSensitive: true,                   // darwin keychain service name hashes the env string ⇒ pools need Linux
    parseAuth: parseClaudeAuth,
  },
  settingsPrefix: 'claude',
  // CONTEXT INJECTION strategy (S6): the CLI's own hooks carry task context
  // (SessionStart), per-prompt notices (UserPromptSubmit) and the stop-time
  // bookkeeping nudge (Stop); SessionStart output is honoured, so the
  // seen-gates in agent-routes advance on delivery.
  inject: {
    kind: 'hooks',
    hookFile: { file: () => path.join(os.homedir(), '.claude', 'settings.json'), createIfMissing: false },
    hookEvents: ['SessionStart', 'UserPromptSubmit', 'Stop'],
    sessionStartHonoured: true,
  },
};

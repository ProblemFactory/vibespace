'use strict';
// Codex harness descriptor (S1).
const { BACKEND_CAPS } = require('../backend-caps');
const { CodexAdapter } = require('../adapters/codex');
const { findCodexSessionJsonlPath } = require('../adapters/codex');
const { CodexMessageManager } = require('../codex-message-manager');
const codexStore = require('../codex-session-store');
const os = require('os');
const path = require('path');

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

'use strict';
// Codex harness descriptor (S1).
const { BACKEND_CAPS } = require('../backend-caps');
const { CodexAdapter } = require('../adapters/codex');
const { findCodexSessionJsonlPath } = require('../adapters/codex');
const { CodexMessageManager } = require('../codex-message-manager');
const codexStore = require('../codex-session-store');

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
  settingsPrefix: 'codex',
  inject: 'wrapper',            // the wrapper injects teaching via thread/inject_items (app-server ignores hook additionalContext)
};

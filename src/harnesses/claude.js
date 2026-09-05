'use strict';
// Claude Code harness descriptor (S1). Declarations only reference the
// existing implementations — behaviour lives where it always did.
const { BACKEND_CAPS } = require('../backend-caps');
const { ClaudeCodeAdapter } = require('../adapters/claude-code');
const { MessageManager } = require('../message-manager');
const store = require('../session-store');

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
  settingsPrefix: 'claude',
  inject: 'hooks',              // context teaching rides the CLI's own hooks (vibespace-hook.mjs)
};

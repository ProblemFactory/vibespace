'use strict';
// CLAUDE CHAT TRANSPORT ARGS — the stream-json flags a chat-mode claude needs,
// spelled ONCE (dc-harness-store, 2.369.213). PURE, no requires: the local
// data/bin/chat-wrapper.js appends them to its argv, and the remote spawn
// (ws-create's ssh/dial leg, which runs claude without that wrapper) reads
// them through the adapter's chatTransportArgs() — never a backend check.
// Each entry = [flag, ...value]; appended only when the flag is absent.
const CHAT_TRANSPORT_ARGS = Object.freeze([
  ['--output-format', 'stream-json'],
  ['--input-format', 'stream-json'],
  ['--verbose'],
  ['--permission-prompt-tool', 'stdio'],
]);
module.exports = { CHAT_TRANSPORT_ARGS };

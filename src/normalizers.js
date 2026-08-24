const { MessageManager } = require('./message-manager');
const { CodexMessageManager } = require('./codex-message-manager');

// REGISTRY, not a ternary (P4, design-backend-parity.md §4): the old
// `backend === 'codex' ? Codex : Claude` shape silently handed every FUTURE
// backend the claude normalizer — the gemini-as-claude fallthrough class. An
// unregistered backend fails LOUDLY at session start, where the gap is
// obvious, instead of mis-parsing an entire conversation.
const NORMALIZERS = {
  claude: MessageManager,
  shell: MessageManager, // shell sessions have no chat mode; the claude shape is inert for them
  codex: CodexMessageManager,
};

function createMessageManager(backend, sessionId) {
  const Ctor = NORMALIZERS[backend || 'claude'];
  if (!Ctor) throw new Error(`no message normalizer registered for backend "${backend}" — add it to src/normalizers.js NORMALIZERS`);
  return new Ctor(sessionId);
}

module.exports = { createMessageManager, NORMALIZERS };

/**
 * BackendAdapter — abstract interface for AI coding agent backends.
 *
 * Each adapter translates between its native protocol and the WebUI's
 * normalized message system. The WebUI doesn't know (or care) whether
 * it's talking to Claude Code, Codex, Gemini CLI, or anything else.
 *
 * Adapters are responsible for:
 * - Session lifecycle (create, attach, resume, kill)
 * - Message transport (send input, receive output)
 * - Permission handling
 * - Session persistence (dtach, tmux, etc.)
 */

class BackendAdapter {
  /** Human-readable backend name */
  get name() { return 'base'; }
}

/**
 * Protocol formatting methods — called by ws-handler to build
 * backend-specific JSON payloads. Eliminates if/else branching.
 */
BackendAdapter.prototype.formatChatInput = function(text, msgId) { throw new Error('not implemented'); };
BackendAdapter.prototype.formatInterrupt = function(session) { throw new Error('not implemented'); };
BackendAdapter.prototype.formatPermissionResponse = function(data) { throw new Error('not implemented'); };
BackendAdapter.prototype.formatSetPermissionMode = function(mode) { throw new Error('not implemented'); };
/** Extra actions after sending interrupt (e.g. delayed SIGINT fallback) */
BackendAdapter.prototype.postInterrupt = function(session, sessionId) {};

module.exports = { BackendAdapter };

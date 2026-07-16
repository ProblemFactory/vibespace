/**
 * ClaudeCodeAdapter — BackendAdapter implementation for Claude Code CLI.
 *
 * Manages sessions via dtach for persistence. Chat mode uses chat-wrapper.js
 * (stream-json), terminal mode uses pty-wrapper.js (raw PTY).
 *
 * This adapter encapsulates all Claude-Code-specific knowledge:
 * - CLI flags (--output-format, --input-format, --verbose, --permission-prompt-tool)
 * - JSONL file locations (~/.claude/projects/<projDir>/<sessionId>.jsonl)
 * - Lock file format for session discovery
 * - control_request/control_response protocol for permissions
 * - stream-json message format
 */

const { BackendAdapter } = require('./base');
const path = require('path');
const fs = require('fs');
const os = require('os');

class ClaudeCodeAdapter extends BackendAdapter {
  /**
   * @param {object} config - { claudeCmd, nodeCmd, dtachCmd, envCmd, editorCmd,
   *                            ptyWrapper, chatWrapper, buffersDir, port }
   */
  constructor(config) {
    super();
    this.config = config;
  }


  /**
   * Create a Claude Code session.
   * Spawns dtach with the appropriate wrapper (chat or terminal).
   *
   * Note: actual PTY spawning is handled by the server's existing code.
   * This adapter provides the command line arguments and session config.
   */
  buildSessionArgs(options) {
    const { cwd, model, permissionMode, resumeId, sessionName, effort, extraArgs = [], mode = 'chat', tuiRenderer } = options;
    const args = [];

    if (resumeId) {
      args.push('--resume', resumeId);
    }
    if (sessionName && this.config.supportsName) args.push('--name', sessionName);
    if (model) args.push('--model', model);
    if (permissionMode) args.push('--permission-mode', permissionMode);
    // "ultracode" is NOT an effortLevel value — it's a separate boolean
    // settings key = xhigh effort + standing dynamic-workflow orchestration
    // (from disassembly: --effort ultracode parses to plain xhigh WITHOUT the
    // mode). Enable the mode at spawn via --settings (a documented setter for
    // the ultracode key); otherwise pass --effort verbatim.
    if (effort === 'ultracode') {
      args.push('--effort', 'xhigh', '--settings', JSON.stringify({ ultracode: true }));
    } else if (effort) {
      args.push('--effort', effort);
    }
    if (extraArgs.length) args.push(...extraArgs);

    // TUI renderer for terminal-mode sessions (CLI ≥2.1.x): "fullscreen" is the
    // flicker-free alternate-screen renderer with virtualized scrollback (same
    // as /tui fullscreen), "classic" forces the main-screen renderer. Unset =
    // whatever preference the CLI has saved. Chat mode has no TUI — skip.
    const env = {};
    if (mode !== 'chat') {
      if (tuiRenderer === 'fullscreen') env.CLAUDE_CODE_NO_FLICKER = '1';
      else if (tuiRenderer === 'classic') env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN = '1';
    }

    return {
      cmd: this.config.claudeCmd,
      args,
      env,
      wrapper: mode === 'chat' ? this.config.chatWrapper : this.config.ptyWrapper,
      cwd: cwd || os.homedir(),
      mode,
    };
  }

  // ── Protocol formatting (called by ws-handler) ──

  formatChatInput(text, msgId) {
    let stdinPayload, userMsg;
    let parsed = null;
    try { parsed = JSON.parse(text); if (!(parsed.type === 'user' && parsed.message)) parsed = null; } catch {}
    if (parsed) {
      stdinPayload = text;
      userMsg = { ...parsed, msgId, timestamp: new Date().toISOString() };
    } else {
      stdinPayload = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
      userMsg = { type: 'user', message: { role: 'user', content: text }, msgId, timestamp: new Date().toISOString() };
    }
    userMsg._fromWebui = true;
    return { stdinPayload, userMsg };
  }

  formatInterrupt() {
    return JSON.stringify(ClaudeCodeAdapter.buildInterruptRequest());
  }

  postInterrupt(session, sessionId) {
    // Delayed SIGINT fallback: if Claude is still streaming 2s after the
    // control_request, send SIGINT as last resort. In recent Claude Code
    // versions SIGINT exits the whole process (killing the session), so we
    // avoid it unless the protocol-level interrupt actually failed.
    // Historical context: bugs #17466, #3455 — may be fixed now.
    if (!session._childPid) return;
    if (session._interruptTimer) clearTimeout(session._interruptTimer);
    session._interruptTimer = setTimeout(() => {
      session._interruptTimer = null;
      // Check if the control_request interrupt worked by reading wrapper meta
      try {
        const metaPath = path.join(this.config.buffersDir, sessionId + '.json');
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (!meta.streaming) return; // Interrupt worked — no need for SIGINT
      } catch {}
      // Still streaming after 2s → force SIGINT
      try { process.kill(session._childPid, 'SIGINT'); } catch {}
    }, 2000);
  }

  formatPermissionResponse(data) {
    return JSON.stringify(ClaudeCodeAdapter.buildPermissionResponse(data.requestId, data.approved, data.toolInput, data.permissionUpdates));
  }

  formatSetPermissionMode(mode) {
    return JSON.stringify(ClaudeCodeAdapter.buildSetPermissionMode(mode));
  }

  // ── Static helpers (kept for backward compat) ──

  static buildPermissionResponse(requestId, approved, toolInput, permissionUpdates) {
    const allowResponse = { behavior: 'allow', updatedInput: toolInput || {} };
    if (permissionUpdates?.length) allowResponse.permission_updates = permissionUpdates;
    return {
      type: 'control_response',
      response: approved
        ? { subtype: 'success', request_id: requestId, response: allowResponse }
        : { subtype: 'success', request_id: requestId, response: { behavior: 'deny', message: 'User denied this action' } },
    };
  }

  static buildInterruptRequest() {
    return {
      type: 'control_request',
      request_id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      request: { subtype: 'interrupt' },
    };
  }

  static buildSetPermissionMode(mode) {
    return {
      type: 'control_request',
      request_id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      request: { subtype: 'set_permission_mode', mode },
    };
  }

  // Mid-session model switch (stream-json control protocol, CLI >=2.1.x).
  // The CLI echoes "<local-command-stdout>Set model to X (resolved-full-id)"
  // as a user record — that echo is the authoritative confirmation (the
  // control_response says success even for bogus model names).
  formatSetModel(model) {
    return JSON.stringify(ClaudeCodeAdapter.buildSetModel(model));
  }

  static buildSetModel(model) {
    return {
      type: 'control_request',
      request_id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      request: { subtype: 'set_model', model },
    };
  }

  // Mid-session effort switch. There is NO set_effort subtype and /effort is
  // blocked in stream-json — but apply_flag_settings is the CLI's OWN mechanism
  // (its /effort command sends exactly this). Verified by disassembly: the CLI
  // sends BOTH keys together — `{ effortLevel, ultracode }`. "ultracode" is a
  // SEPARATE boolean (xhigh effort + standing dynamic-workflow orchestration),
  // NOT an effortLevel value, so picking it maps to effortLevel:'xhigh' +
  // ultracode:true; any real level sets ultracode:false (turning the mode off);
  // reset (empty) → effortLevel:null + ultracode:false. Response is
  // success-blind and nothing echoes back — the commanded value is all we have
  // to display. (ultracode is gated CLI-side on an xhigh-capable model +
  // dynamic workflows enabled — a no-op otherwise.)
  formatSetEffort(effort) {
    const ultracode = effort === 'ultracode';
    const settings = ultracode
      ? { effortLevel: 'xhigh', ultracode: true }
      : { effortLevel: effort || null, ultracode: false };
    return JSON.stringify({
      type: 'control_request',
      request_id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      request: { subtype: 'apply_flag_settings', settings },
    });
  }
}

module.exports = { ClaudeCodeAdapter };

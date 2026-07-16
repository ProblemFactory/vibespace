/**
 * ShellAdapter — plain shell terminals (no AI backend).
 *
 * Gives the workspace standalone terminal windows: same dtach persistence,
 * buffers, multi-client sync and taskbar/window management as agent sessions,
 * but running the user's login shell. Terminal mode only — there is no chat
 * protocol, no transcript, no resume (a dead shell is just gone).
 *
 * Also the pragmatic path for in-product CLI login flows (`claude` → /login)
 * for users who don't live in a terminal.
 */

const os = require('os');
const { BackendAdapter } = require('./base');

class ShellAdapter extends BackendAdapter {
  constructor(config = {}) {
    super();
    this.config = config;
  }


  buildSessionArgs(options = {}) {
    const { cwd, extraArgs = [], initialCommand } = options;
    const shell = process.env.SHELL || '/bin/bash';
    const env = {
      // zsh prints an inverse-video "%" (PROMPT_EOL_MARK) before the first
      // prompt because the cursor position is unknown at startup. The mark
      // self-erases only when the emitted width matches the display width —
      // but our PTY starts at a placeholder size and the buffer replays into
      // whatever size the client fits later, so the mark strands as a black
      // "%" box at the top-left of every new shell. Suppress the mark (the
      // partial-line PRESERVATION behavior itself stays intact).
      PROMPT_EOL_MARK: '',
    };
    // ONLY for automated shells (we auto-type a command): oh-my-zsh's "would
    // you like to update? [Y/n]" prompt at .zshrc load eats the FIRST char of
    // the typed command ("claude update" → "laude update", invalid). Disable
    // it here — but NOT for a plain interactive Terminal the user opens by
    // hand, where that prompt is a legitimate thing they may want to answer.
    if (initialCommand) {
      env.DISABLE_AUTO_UPDATE = 'true';
      env.DISABLE_UPDATE_PROMPT = 'true';
    }
    // Optional command typed for the user after the shell starts (e.g. the
    // "Log in to Claude" helper) — consumed by the client, carried in spec.
    return {
      cmd: shell,
      args: ['-l', ...extraArgs],
      env,
      wrapper: this.config.ptyWrapper,
      cwd: cwd || os.homedir(),
      mode: 'terminal',
      initialCommand: initialCommand || null,
    };
  }
}

module.exports = { ShellAdapter };

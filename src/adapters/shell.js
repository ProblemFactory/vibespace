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

  get name() { return 'shell'; }

  buildSessionArgs(options = {}) {
    const { cwd, extraArgs = [], initialCommand } = options;
    const shell = process.env.SHELL || '/bin/bash';
    const env = {};
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

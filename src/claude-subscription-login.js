'use strict';

// Build the command typed into VibeSpace's interactive helper terminal. Values
// here are paths only (never credentials), but still need real shell quoting:
// the command is interpreted by the user's login shell.
function shellQuote(value) {
  const text = String(value);
  // initialCommand is typed into a live terminal, so shell quotes alone cannot
  // make terminal control bytes safe (a newline would submit half a command).
  if (/[\x00-\x1f\x7f]/.test(text)) throw new Error('control character in shell command path');
  return `'${text.replace(/'/g, `'"'"'`)}'`;
}

// `attempt` (optional, row B-87fd identity unit 3's cure): the press's own attempt id — the helper writes it beside its running /
// success states, so the relogin's resolve judges only the sign-in THIS press started
function buildClaudeSubscriptionLoginCommand({ nodeCmd, helperPath, claudeCmd, configDir, attempt = null }) {
  const values = [nodeCmd, helperPath, configDir, claudeCmd];
  if (values.some((v) => typeof v !== 'string' || !v)) {
    throw new Error('missing Claude subscription login command path');
  }
  return [
    nodeCmd,
    helperPath,
    '--config-dir',
    configDir,
    '--claude',
    claudeCmd,
    ...(typeof attempt === 'string' && /^[a-zA-Z0-9._-]{8,80}$/.test(attempt) ? ['--attempt', attempt] : []),
  ].map(shellQuote).join(' ');
}

module.exports = { buildClaudeSubscriptionLoginCommand, shellQuote };

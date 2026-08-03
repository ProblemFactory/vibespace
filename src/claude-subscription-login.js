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

function buildClaudeSubscriptionLoginCommand({ nodeCmd, helperPath, claudeCmd, configDir }) {
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
  ].map(shellQuote).join(' ');
}

module.exports = { buildClaudeSubscriptionLoginCommand, shellQuote };

'use strict';
// OpenCode (anomalyco) — the FIRST ACP harness (S8, owner decision 2026-09-05:
// OpenCode over Gemini CLI). `opencode acp` speaks ACP v1 (verified 1.18.29:
// loadSession + sessionCapabilities {close, fork, list, resume}, prompt
// image/embeddedContext, config options model + mode(build|plan),
// available_commands_update with the user's skills/commands). Models come from
// the agent's own provider config (models.dev catalog; `opencode auth login`)
// — VibeSpace holds no OpenCode credential.
const { acpHarness } = require('./acp');
const os = require('os');
const path = require('path');

module.exports = acpHarness({
  id: 'opencode',
  label: 'OpenCode',
  command: 'opencode',
  args: ['acp'],
  store: {
    // opencode keeps sessions in its own sqlite (~/.local/share/opencode/opencode.db);
    // there is no per-conversation file to locate — the ACP session/load replay is the history.
    transcriptDirs: [path.join(os.homedir(), '.local', 'share', 'opencode')],
    locate: () => null,
  },
  brand: '/brand/opencode.svg',
  terminal: { args: [], resumeFlag: '--session', modelFlag: '--model' },
});

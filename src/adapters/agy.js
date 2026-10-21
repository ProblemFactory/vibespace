/**
 * AgyAdapter — the Antigravity CLI (`agy`, lane antigravity-harness). agy is NOT ACP: chat runs ONE
 * `agy --input-format stream-json --output-format stream-json …` process per conversation under
 * data/bin/agy-wrapper.js, which journals the SAME 'acp-events' records as acp-wrapper.js — so every stdin frame
 * below is the ACP adapter's (chat-input / interrupt / set-model / set-effort / set-mode / queue-op / queue-resync /
 * read-permission-rules) and only the SPAWN differs. Terminal mode is agy's own TUI with the same flags.
 * Our permission modes onto agy's: '' = agy's own setting (request-review), accept-edits / auto / plan = `--mode`,
 * bypassPermissions = `--dangerously-skip-permissions` (measured: agy 1.4.3 --help). Effort: low|medium|high|xhigh|max.
 * Program-use billing law: agy runs its OWN login — nothing here carries a vendor secret in argv or env.
 */
const os = require('os');
const { AcpAdapter } = require('./acp');

const AGY_MODES = Object.freeze(['accept-edits', 'auto', 'plan', 'bypassPermissions']);
// THE ONE LIST of agy's reasoning efforts (agy --help: `--effort … (low|medium|high|xhigh|max)`). The descriptor declares
// it as ui.effortLevels (src/harnesses/antigravity.js), so /api/session-options answers it for antigravity and the menu
// offers exactly these (lane effort-menu-per-harness).
const AGY_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

/** An effort agy cannot take, REFUSED BY NAME (lane effort-menu-per-harness): the menu offered claude's ultracode to
 *  antigravity and the pick was dropped without a word. '' / null = agy's own default. Returns the Error or null. */
function agyEffortRefusal(effort) {
  const v = effort == null ? '' : String(effort);
  if (!v || AGY_EFFORTS.includes(v)) return null;
  return Object.assign(new Error(`Antigravity has no reasoning effort "${v}" — agy --effort takes ${AGY_EFFORTS.join(', ')}. Pick one of those, or Default.`),
    { code: 'effort_not_supported', effort: v, levels: [...AGY_EFFORTS] });
}

/** The TUI's flags for one spawn — the chat wrapper builds the same set (data/bin/agy-wrapper.js childArgs). */
function agyFlags({ model, effort, permissionMode, resumeId } = {}) {
  const a = [];
  if (model) a.push('--model', model);
  const refused = agyEffortRefusal(effort);
  if (refused) throw refused;
  if (effort) a.push('--effort', effort);
  if (permissionMode === 'bypassPermissions') a.push('--dangerously-skip-permissions');
  else if (AGY_MODES.includes(permissionMode)) a.push('--mode', permissionMode);
  if (resumeId) a.push('--conversation', resumeId);
  return a;
}

class AgyAdapter extends AcpAdapter {
  /** ws-create asks before it spawns: a refused effort answers the create by name (code effort_not_supported). */
  effortRefusal(effort) { return agyEffortRefusal(effort); }
  /** The mid-session pick: refused by name before a byte reaches the wrapper (ws-handler answers the client). */
  formatSetEffort(effort) {
    const refused = agyEffortRefusal(effort);
    if (refused) throw refused;
    return super.formatSetEffort(effort);
  }
  buildSessionArgs(options = {}) {
    const { cwd, model, effort, permissionMode, resumeId, extraArgs = [], mode = 'chat', sessionName = '', initialPrompt = '' } = options;
    const refused = agyEffortRefusal(effort);
    if (refused) throw refused;
    const command = this.config.command || this.config.commandName || 'agy';
    const env = { ...(this.config.env || {}) };
    if (mode === 'chat') {
      return {
        cmd: command,
        args: [...extraArgs],
        wrapper: this.config.chatWrapper,
        cwd: cwd || os.homedir(),
        mode,
        env: {
          ...env,
          AGY_WEBUI_BACKEND: this.config.harnessId || 'antigravity',
          AGY_WEBUI_CWD: cwd || os.homedir(),
          AGY_WEBUI_MODEL: model || '',
          AGY_WEBUI_EFFORT: effort || '',
          AGY_WEBUI_MODE: AGY_MODES.includes(permissionMode) ? permissionMode : '',
          AGY_WEBUI_RESUME_ID: resumeId || '',
          AGY_WEBUI_SESSION_NAME: sessionName || '',
        },
      };
    }
    const args = [...agyFlags({ model, effort, permissionMode, resumeId }), ...extraArgs];
    if (initialPrompt) args.push('--prompt-interactive', initialPrompt);
    return { cmd: command, args, wrapper: this.config.ptyWrapper, cwd: cwd || os.homedir(), mode, env };
  }
}

module.exports = { AgyAdapter, agyFlags, agyEffortRefusal, AGY_MODES, AGY_EFFORTS };

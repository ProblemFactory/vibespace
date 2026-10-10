'use strict';
/**
 * BYPASS ANSWERS THE CLI'S OWN ASKS (lane bypass-no-prompts, owner 2026-10-10: "我都开了 bypassPermissions 了
 * 就是不要看到这个"). Measured on the real CLI 2.1.288 (scratch HOME, --permission-mode bypassPermissions): the
 * Bash tool's own safety check still asks — `decision_reason_type: "safetyCheck"`, `classifier_approvable: false`,
 * `suppress_always_allow_rule: true`, no suggestions, "This shell -c script runs rm and could not be checked" —
 * for a -c script its parser cannot read that runs rm (a function definition, an ANSI-C $'…\n…' string; a plain
 * `bash -c "…; rm -f x"` or `env bash -c` is read and never asks). A PreToolUse hook answering
 * `permissionDecision: "allow"` does NOT stop it: the hook ran for every call and the ask came anyway. So the
 * answer is given HERE, at the protocol door, before the normalizer sees the record — no card forms, no
 * parked-turn / For-you machinery runs (main-ask files nothing: the ask never reached a card).
 *
 * The rule: a `can_use_tool` that reaches a CHAT session whose mode IS `bypassPermissions` — read per ask from
 * `session._permissionMode` (the CLI's own init / set_permission_mode facts), never cached here, so a switch away
 * from bypass mid-turn turns this off at the next ask — is answered ALLOW at once with the EXACT input the CLI
 * asked about (what you approve is what runs). A helper's ask (agent_id) and the WebFetch provenance re-ask are
 * permission asks too. AskUserQuestion is a QUESTION for the person, never a permission — never answered here.
 * The switch: `permissions.bypassAnswersAsks` (default ON — bypass means bypass); OFF = the card, as before.
 *
 * Every auto-allow is written down three ways: the quiet line in the chat (a `system`/`vs_auto_allow` record
 * appended to the session buffer after the allow — the normalizer draws it live and on every rebuild, and takes the
 * replayed ask off its card), the server console ring the incident bundle carries (`[bypass] auto-allow {…}`,
 * secrets redacted), and the per-session count Session Properties shows (`session._autoAllowed`, this run).
 * If the answer cannot be written (no live process) the door steps aside and the card forms — never silent.
 */
const { redactSecrets } = require('../secret-shapes');

const SETTING = 'permissions.bypassAnswersAsks';
const HEAD_MAX = 120;
const INPUT_MAX = 4000;
const NOT_PERMISSIONS = new Set(['AskUserQuestion']);

/** The card's words in one line: the command / path / url / pattern the ask is about, else the input itself. */
function headOf(tool, input) {
  const i = input && typeof input === 'object' ? input : {};
  const pick = [i.command, i.file_path, i.notebook_path, i.url, i.query, i.pattern, i.path].find((v) => typeof v === 'string' && v.trim());
  let s;
  try { s = pick != null ? pick : JSON.stringify(i); } catch { s = ''; }
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, HEAD_MAX);
}

/** PURE: does this record get answered here? → the facts the answer and its notes need, else null. */
function judge(session, msg, { enabled = true } = {}) {
  if (!msg || msg.type !== 'control_request' || !msg.request || msg.request.subtype !== 'can_use_tool') return null;
  if (!enabled || !session || session.mode !== 'chat') return null;
  if (session._permissionMode !== 'bypassPermissions') return null;
  const r = msg.request;
  if (NOT_PERMISSIONS.has(r.tool_name) || msg.request_id == null) return null;
  const input = r.input && typeof r.input === 'object' ? r.input : {};
  return {
    requestId: msg.request_id, toolUseId: r.tool_use_id || null, agentId: r.agent_id || null,
    tool: String(r.tool_name || '?').slice(0, 80), reasonType: r.decision_reason_type || null,
    reason: typeof r.decision_reason === 'string' ? r.decision_reason.slice(0, 300) : null,
    head: headOf(r.tool_name, input), input,
  };
}

function settingOf(key) {
  try { const p = require('../routes/persistence').router; return p.readSettings ? p.readSettings()[key] : undefined; } catch { return undefined; }
}

/** The claude adapter's own frame (the stream this door sits in is claude's) — its formatPermissionResponse, never a second builder. */
const CLAUDE_FRAMES = { get: () => require('../adapters/claude-code').ClaudeCodeAdapter.prototype };

/** The door: answered here ⇒ true (the caller skips the record); false ⇒ the record goes on to the card. */
function door(session, id, msg, { feedLive, serverSetting = settingOf, adapterRegistry = CLAUDE_FRAMES, log = console } = {}) {
  if (!msg || msg.type !== 'control_request') return false;
  const v = judge(session, msg, { enabled: serverSetting(SETTING) !== false });
  if (!v) return false;
  // THE one answer path (permission-answer.js), reached through helper-asks like every other answer
  const r = require('./helper-asks').answerUnasked(session, { requestId: v.requestId, approved: true, toolInput: v.input }, { adapterRegistry, feedLive });
  if (!r.ok) { try { log.warn(`[bypass] auto-allow could not answer ${v.tool} (${r.why}) — the card asks instead`); } catch { } return false; }
  session._autoAllowed = (session._autoAllowed || 0) + 1;
  let input = '';
  try { input = JSON.stringify(v.input).slice(0, INPUT_MAX); } catch { }
  const mark = { type: 'system', subtype: 'vs_auto_allow', request_id: v.requestId, tool_use_id: v.toolUseId, agent_id: v.agentId,
    tool: v.tool, reason_type: v.reasonType, reason: v.reason, head: v.head, input, at: Date.now() };
  session.buffer = (session.buffer + JSON.stringify(mark) + '\n').slice(-500000);
  try { if (typeof feedLive === 'function') feedLive(session, mark); } catch (e) { try { log.warn(`[bypass] the auto-allow line was not drawn: ${e.message}`); } catch { } }
  try { log.log(`[bypass] auto-allow ${JSON.stringify({ op: 'auto-allow', session: id, tool: v.tool, reasonType: v.reasonType, head: redactSecrets(v.head).text, helper: !!v.agentId })}`); } catch { }
  try { global.__vsEvent?.('bypass-auto-allow', String(v.reasonType || 'none').slice(0, 40)); } catch { }
  return true;
}

module.exports = { SETTING, HEAD_MAX, judge, door, headOf };

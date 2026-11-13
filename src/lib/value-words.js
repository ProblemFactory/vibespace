// THE ONE DOOR FROM A STORED VALUE TO A WORD (lane ui-language pick 2, the UI walk's L1 list — the owner 2026-11-13:
// «走查一下所有界面找到可优化的布局，提示文本等»). A protocol / stored value (a message's role, a stop reason, an effort
// level, a job's state, a vault act …) stays EXACTLY what it is on the wire and in storage; the page words it HERE, at
// display, in the reader's language (docs/kb-design-lessons.md §16 — «never a protocol value translated in storage»).
// A value this table does not know is shown as itself — a newer CLI's value is never hidden, never mis-worded.
//
// PURE: `t` is injected (the i18nKey literals below are what scripts/i18n-extract.mjs reads; ② of test-ui-language holds
// their zh + ja rows). Where a set already had its table, the door READS that table — it never keeps a twin:
//   job-state → src/job-model.js STATE_WORDS · perm-mode → ./permission-mode-labels.js.
// test-ui-language ⑥ holds every set whose values the tree lists (session-status STATES / URGENCIES, backend-caps
// response styles, job-model GLYPH, themes BUILTIN_THEMES …) fully worded, and reds a code-named field drawn raw.
import { STATE_WORDS as JOB_STATE_WORDS } from '../job-model.js';
import { permissionModeShort } from './permission-mode-labels.js';

const i18nKey = (s) => s;

export const VALUE_SETS = Object.freeze({
  // a message's author (the Messages API's roles + the normalizer's tool rows)
  'msg-role': Object.freeze({ user: i18nKey('You'), assistant: i18nKey('msg-role::Assistant'), system: i18nKey('System'), tool: i18nKey('msg-role::Tool') }),
  // why a model turn ended (the Messages API's stop_reason)
  'stop-reason': Object.freeze({
    end_turn: i18nKey('Finished normally'), tool_use: i18nKey('Paused to use a tool'), max_tokens: i18nKey('Reached the output limit'),
    stop_sequence: i18nKey('Reached a stop sequence'), refusal: i18nKey('Declined'), pause_turn: i18nKey('Paused mid-turn'),
    model_context_window_exceeded: i18nKey('Context window full'),
  }),
  // the usage's service tier
  'service-tier': Object.freeze({ standard: i18nKey('service-tier::Standard'), priority: i18nKey('Priority tier'), batch: i18nKey('service-tier::Batch'), flex: i18nKey('service-tier::Flex') }),
  // a reasoning-effort level (claude --effort, codex reasoning effort, the ultra / ultracode extras)
  effort: Object.freeze({
    minimal: i18nKey('Minimal'), low: i18nKey('Low'), medium: i18nKey('Medium'), high: i18nKey('High'), xhigh: i18nKey('XHigh'),
    max: i18nKey('Max'), ultra: i18nKey('Ultra'), ultracode: i18nKey('Ultracode'), none: i18nKey('None'),
  }),
  // a response style's NAME (claude outputStyle; the hint stays agent-meta's responseStyleHints)
  // claude outputStyle names + codex personalities (src/backend-caps.js responseStyle.values)
  'response-style': Object.freeze({ Concise: i18nKey('Concise'), Explanatory: i18nKey('Explanatory'), Learning: i18nKey('Learning'), Proactive: i18nKey('Proactive'), none: i18nKey('None'), friendly: i18nKey('Friendly'), pragmatic: i18nKey('Pragmatic') }),
  // an MCP server's status in the init frame, and a plugin / MCP config error's type (open sets on the wire)
  'mcp-state': Object.freeze({ connected: i18nKey('connected'), failed: i18nKey('connection failed'), 'needs-auth': i18nKey('needs sign-in'), pending: i18nKey('starting'), disabled: i18nKey('turned off') }),
  'load-error': Object.freeze({ 'load-error': i18nKey('failed to load'), 'parse-error': i18nKey('could not be read'), 'not-found': i18nKey('not found') }),
  // a conversation's board status (src/session-status.js STATES / URGENCIES)
  'session-state': Object.freeze({ working: i18nKey('working'), 'needs-input': i18nKey('needs input'), blocked: i18nKey('blocked'), review: i18nKey('review'), done: i18nKey('done') }),
  urgency: Object.freeze({ low: i18nKey('low'), normal: i18nKey('normal'), high: i18nKey('high'), urgent: i18nKey('urgent') }),
  // a Background Work job: who may see / control it, how a run ended, what started it (src/jobs.js)
  'job-access': Object.freeze({ session: i18nKey('this conversation only'), group: i18nKey('its task group'), all: i18nKey('every conversation') }),
  'job-cause': Object.freeze({
    ok: i18nKey('finished'), 'ok(until-output)': i18nKey('finished (its output appeared)'), interrupted: i18nKey('stopped'), timeout: i18nKey('timed out'),
    error: i18nKey('failed'), 'oom-bound': i18nKey('ended at its memory limit'), oom: i18nKey('out of memory'),
    update_window: i18nKey('ended by a VibeSpace update'), 'wrapper-mismatch': i18nKey('ended: its runner changed'),
  }),
  'job-trigger': Object.freeze({
    manual: i18nKey('started by hand'), boot: i18nKey('started at boot'), schedule: i18nKey('on its schedule'), 'restart-policy': i18nKey('restarted by its policy'),
    'update-rerun': i18nKey('rerun after an update'), 'vault-approved': i18nKey('after you approved its secret'), 'vault-unlocked': i18nKey('after the vault was unlocked'),
  }),
  // an owner's act on an automation key (src/server/automation-engine.js) — the audit's verb column
  'vault-act': Object.freeze({
    'key.mint': i18nKey('created this key'), 'key.revoke': i18nKey('revoked this key'), 'key.grant': i18nKey('granted this key'),
    'key.ungrant': i18nKey('took this key back'), 'key.scopes': i18nKey('changed what it may do'), 'key.limits': i18nKey('changed its limits'),
    'key.reach': i18nKey('changed who may use it'), 'key.except': i18nKey('changed its exceptions'), 'key.prune': i18nKey('pruned its grants'),
  }),
  // the codes VibeSpace's own hints ask an agent to use when a site blocks a browser (src/browser-switch.js)
  'browser-claim': Object.freeze({ 'sign-in-refused': i18nKey('it refused to sign in in this browser') }),
  // a channel account's push declaration (src/channel-caps.js PUSH_CLAIMS) — the option says what it does, never the raw value
  'push-claim': Object.freeze({
    unknown: i18nKey('Not declared (default) — a push only starts a check'), shared: i18nKey('Shared — other clients use this app: a push only starts a check'),
    exclusive: i18nKey('Only this VibeSpace — a push carries the messages; a check every 15 min reconciles'),
  }),
  // a built-in theme's name (src/lib/themes.js BUILTIN_THEMES); a custom theme keeps its own name
  theme: Object.freeze({ dark: i18nKey('theme::Dark'), light: i18nKey('theme::Light'), dracula: i18nKey('Dracula'), nord: i18nKey('Nord'), solarized: i18nKey('Solarized'), monokai: i18nKey('Monokai') }),
  // the note a model alias carries in the server's list («fable (latest, 200k)» — src/server/cli-env.js CLAUDE_MODEL_ALIASES)
  'model-note': Object.freeze({ latest: i18nKey('latest'), 'latest, 200k': i18nKey('latest, 200k context'), 'latest, 1M context': i18nKey('latest, 1M context') }),
});

/** The words of `value` in set `set` — the reader's language through `t`, else the value itself (never hidden). */
/** A table's key through the page's `t`. A one-word key that another surface may spell with another meaning carries its set
 *  as a CONTEXT (`theme::Light`, `msg-role::Assistant` — the closure round's collision finding); with no row for it (English,
 *  a stub translator) the word is the key without its context. */
function wordOf(k, t) {
  const w = t(k);
  const i = typeof k === 'string' ? k.indexOf('::') : -1;
  return w === k && i > 0 ? k.slice(i + 2) : w;
}
export function valueWord(set, value, t, { backend = null } = {}) {
  const v = value == null ? '' : String(value);
  if (set === 'job-state') return Object.prototype.hasOwnProperty.call(JOB_STATE_WORDS, v) ? t(JOB_STATE_WORDS[v]) : v;
  if (set === 'perm-mode') return permissionModeShort(backend, v, t) || v;
  if (set === 'browser-claim' && /^http-\d{3}$/.test(v)) return t('it answered HTTP {code}', { code: v.slice(5) });
  const table = VALUE_SETS[set];
  return table && Object.prototype.hasOwnProperty.call(table, v) ? wordOf(table[v], t) : v;
}

/** True when the set holds a word for `value` (a caller that adds the raw value as a hint only when it was worded). */
export function hasWord(set, value) {
  const v = value == null ? '' : String(value);
  if (set === 'job-state') return Object.prototype.hasOwnProperty.call(JOB_STATE_WORDS, v);
  const table = VALUE_SETS[set];
  return !!table && Object.prototype.hasOwnProperty.call(table, v);
}

/** A model row's words: the default row (id '') is the page's own «Default» — never the server's English label; a
 *  «name (note)» label keeps its name (a model id / brand) and words its note. */
export function modelLabelWords(m, t) {
  if (!m) return '';
  if (m.id === '' || m.id == null) return t('Default');
  const label = String(m.label || m.id);
  const x = /^(.*\S) \(([^()]+)\)$/.exec(label);
  return x && hasWord('model-note', x[2]) ? `${x[1]} (${valueWord('model-note', x[2], t)})` : label;
}

/** A served model list as a settings select's options: every row through modelLabelWords — the default row (id '') is the
 *  page's «Default», never the server's English label (the reader's round: the ⚙ default-model select read «Default»). */
export function modelOptions(models, t) {
  return (Array.isArray(models) ? models : []).filter(Boolean).map((m) => ({ value: m.id, label: modelLabelWords(m, t) || m.id }));
}

/** The push declaration's options, in the order a person reads them: [[value, words]…] (both the account dialog and the
 *  channel options read THIS — they kept two copies of the English before). */
export function pushClaimOptions(t) { return ['unknown', 'shared', 'exclusive'].map((v) => [v, valueWord('push-claim', v, t)]); }

/** A theme key → its name: a built-in's words, a custom theme's own name (`custom-<name>`), else the name the theme came
 *  with (`label` — a plugin theme's own, ThemeManager.getPluginThemes), else the key. Never the key capitalised. */
export function themeWord(key, t, label = null) {
  const k = String(key || '');
  if (k.startsWith('custom-')) return k.slice(7);
  return hasWord('theme', k) ? valueWord('theme', k, t) : (label ? String(label) : k);
}

/** A STORED default name, worded at display (never in storage — kb §16): a desktop minted as «Desktop 3», the default
 *  launch variant registered as «Open». Any other name is the person's own and is shown as written. */
export function storedNameWords(kind, name, t) {
  const n = String(name == null ? '' : name);
  if (kind === 'desktop') { const m = /^Desktop (\d+)$/.exec(n); return m ? t('Desktop {n}', { n: Number(m[1]) }) : n; }
  if (kind === 'variant') return n === 'Open' ? t('Open') : n;
  return n;
}

'use strict';
/**
 * A MAIN CONVERSATION'S OWN ASK — the PURE half (lane parked-ask-inbox,
 * 2.369.232; the ORCH half is src/server/main-asks.js, the twin of the helper's
 * src/helper-ask.js + src/server/helper-asks.js).
 *
 * A turn parked on the user's answer — a permission card (claude can_use_tool,
 * a codex / ACP approval), a question (AskUserQuestion, a codex / ACP
 * user-input or form elicitation), the plan approval (ExitPlanMode) — showed
 * the pulsing chip in its chat, the needs-input card and the window blink, and
 * NOTHING in the For-you tray: a fleet user's conversation sat 22 h on a Bash
 * ask on a desktop he was not looking at. An ask nobody answered in
 * MAIN_ASK_INBOX_MS (the helper's 60 s — one constant) is now ONE For-you item
 * (origin `agent`, action `main-ask` naming the request), resolved by its answer.
 *
 * THE ASK CENSUS: every `permission.kind` a normalizer writes (src/*message-manager.js)
 * maps to a row here (RECORD_KINDS), and every tool the product draws as its
 * own ask (PLAN_TOOLS) — scripts/test-parked-ask-inbox.mjs greps the producers;
 * a kind without a row is RED. At runtime an unknown kind still files (the
 * `tool` row) — never silence.
 */
const H = require('./helper-ask.js');

/** After this long unanswered a main ask is filed in For you — THE helper's constant (one clock). */
const MAIN_ASK_INBOX_MS = H.HELPER_ASK_INBOX_MS;
/** The For-you action type (user-todos ACTION_IDENTITY: one item per request). */
const MAIN_ASK_ACTION = 'main-ask';
/** `i18nKey` = the extractor's marker for a declared human-visible string. */
const i18nKey = (s) => s;

/** THE TABLE: one row per kind of ask, its words in the three languages (the
 *  client words the item through t(); i18n-zh.js / i18n-ja.js hold the same
 *  zh / ja — the suite proves it). `{name}` = the conversation, `{tool}` the
 *  tool, `{line}` the ask's one line. */
const MAIN_ASK_KINDS = Object.freeze({
  command: Object.freeze({ en: i18nKey('{name} is waiting for you: permission to run `{line}`'), zh: '{name} 在等你：运行 `{line}` 的许可', ja: '{name} があなたを待っています：`{line}` の実行許可' }),
  tool: Object.freeze({ en: i18nKey('{name} is waiting for you: permission to use {tool} ({line})'), zh: '{name} 在等你：使用 {tool} 的许可（{line}）', ja: '{name} があなたを待っています：{tool} の使用許可（{line}）' }),
  'tool-bare': Object.freeze({ en: i18nKey('{name} is waiting for you: permission to use {tool}'), zh: '{name} 在等你：使用 {tool} 的许可', ja: '{name} があなたを待っています：{tool} の使用許可' }),
  question: Object.freeze({ en: i18nKey('{name} is waiting for you: a question: {line}'), zh: '{name} 在等你：一个问题：{line}', ja: '{name} があなたを待っています：質問：{line}' }),
  plan: Object.freeze({ en: i18nKey('{name} is waiting for you: the plan awaits your approval'), zh: '{name} 在等你：计划等你批准', ja: '{name} があなたを待っています：プランの承認待ち' }),
});
/** Every `permission.kind` a normalizer writes → its row family ('' = no kind: a claude tool permission). */
const RECORD_KINDS = Object.freeze({ '': 'permission', approval: 'permission', user_input: 'question' });
/** The tools whose permission ask IS the plan approval. */
const PLAN_TOOLS = Object.freeze(['ExitPlanMode']);
/** The detail's way out (English: the store's words; the card in the chat is the answer surface). */
const WAY_OUT = 'The conversation is paused until you answer. Open the conversation and answer on its card (the “waiting for you” chip at the bottom of the chat jumps to it), or Stop it.';

const LINE_MAX = 80;
function oneLine(s) {
  const lines = String(s || '').split('\n');
  let first = H.revealHidden(lines[0].trim());
  if (first.length > LINE_MAX) first = first.slice(0, LINE_MAX - 1) + '…';
  return lines.length > 1 && first ? first + ' …' : first;
}
const firstQuestion = (p) => {
  const q = Array.isArray(p && p.questions) ? p.questions[0] : null;
  return (q && (q.question || q.header || q.prompt || q.label)) || (p && p.input && (p.input.message || p.input.question)) || '';
};

/** Which row an ask is: `{row, family}` — family = RECORD_KINDS[kind] (null for a kind outside the census). */
function mainAskKindOf(perm) {
  const p = perm || {};
  const family = Object.prototype.hasOwnProperty.call(RECORD_KINDS, String(p.kind || '')) ? RECORD_KINDS[String(p.kind || '')] : null;
  if (PLAN_TOOLS.includes(p.toolName)) return { row: 'plan', family: family || 'permission' };
  if (family === 'question') return { row: 'question', family };
  const s = H.askSubject({ input: p.input || {} });
  if (s && s.kind === 'command') return { row: 'command', family: family || 'permission' };
  return { row: s ? 'tool' : 'tool-bare', family };
}

/** A pending main ask (helper-ask.js pendingAsksOf row) + its card's `permission` → the normalized ask, or null. */
function mainAskOf(perm, pending = {}) {
  const p = perm || {};
  const requestId = p.requestId != null ? String(p.requestId) : (pending.requestId != null ? String(pending.requestId) : '');
  if (!requestId || p.resolved || p.stale) return null;
  const { row } = mainAskKindOf(p);
  const tool = String(p.toolName || pending.toolName || 'a tool');
  const subject = H.askSubject({ input: p.input || {} });
  const line = row === 'question' ? oneLine(firstQuestion(p)) : row === 'plan' ? '' : oneLine(subject ? subject.text : '');
  return { requestId, row: row === 'question' && !line ? 'tool-bare' : row, tool, line, subject: subject ? H.revealHidden(subject.text) : '', at: Number(pending.at) || 0 };
}

const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : ''));

/** THE FOR-YOU ITEM: `text` English (the store's key), `i18n.text` the row's key + params, the detail = the whole
 *  request (cut + said so past 6000) + the way out, `action` names the request (one item per ask). */
function inboxItemFor(ask, { name = '', sessionId = null } = {}) {
  const a = ask || {};
  const row = MAIN_ASK_KINDS[a.row] ? a.row : 'tool-bare';
  const params = { name: String(name || '').trim() || 'A conversation', tool: a.tool || 'a tool', line: a.line || '' };
  const whole = String(a.subject || '');
  const cut = whole.length > 6000 ? `${whole.slice(0, 6000)}\n[… cut here — ${whole.length - 6000} more characters; the card in the conversation shows the whole request]` : whole;
  const detail = (cut && row !== 'question' ? `${params.tool}: ${cut}\n\n` : '') + WAY_OUT;
  return {
    text: fill(MAIN_ASK_KINDS[row].en, params), detail,
    i18n: { text: { key: MAIN_ASK_KINDS[row].en, params } },
    action: { type: MAIN_ASK_ACTION, requestId: String(a.requestId || ''), ...(sessionId ? { sessionId: String(sessionId) } : {}) },
  };
}

/** When the tray is told about an ask first seen at `at`. */
function inboxDueAt(at) { return (Number(at) || 0) + MAIN_ASK_INBOX_MS; }

/** THE ASK'S FIRST-SEEN INSTANT (the clock lives in the record, not the timer): the persisted instant
 *  (session-meta `mainAskedAt`, a restart) wins; else an ask found by the FIRST look of this process (a rebuilt
 *  card) keeps its card's time; else (seen live) now. Never in the future. */
function firstSeenAt(saved, cardAt, now, firstLook) {
  const s = Number(saved);
  if (Number.isFinite(s) && s > 0) return Math.min(s, now);
  const c = Number(cardAt);
  if (firstLook && Number.isFinite(c) && c > 0) return Math.min(c, now);
  return now;
}

module.exports = { MAIN_ASK_INBOX_MS, MAIN_ASK_ACTION, MAIN_ASK_KINDS, RECORD_KINDS, PLAN_TOOLS, WAY_OUT, mainAskKindOf, mainAskOf, inboxItemFor, inboxDueAt, firstSeenAt };

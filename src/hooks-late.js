'use strict';
// PURE (imports nothing; CJS) — THE WORDS AND RULES OF A LATE HOOK REGISTRATION
// (lane hooks-create, 2026-10-01). A fleet user who only chats never had
// ~/.claude/settings.json (the CLI writes it only when somebody changes a
// setting), so VibeSpace's hooks were never registered; since then the file is
// CREATED when ~/.claude exists (src/harness-config.js, the 'dir-exists' rule).
// A conversation already running keeps the hook configuration it started with,
// so the registration that created the file reaches it only through
//   ① ONE free next-turn note per session (session-status notice kind
//     'hooks-late' — never a billed turn: it rides the next prompt the
//     session's own hooks deliver), and
//   ② ONE For-you line for the owner naming how many conversations predate it.
// The note names the PROCESS it was queued for (`webuiId`): a Terminate +
// Resume is a new webui id with the hooks in place, so the note is STALE there
// and dropped unread (`hooksLateStale`) — it never tells a resumed session to
// resume. Agent-facing words are English (§16); the For-you line carries
// `{key, params}` the client words with its own t().
const i18nKey = (s) => s;

const NOTICE_KIND = 'hooks-late';
const HOOKS_LATE_TEXT = "VibeSpace's hooks were registered after this conversation started — Terminate and Resume it to get the tools context";
const INBOX_KEY = 'agent-hooks';
const INBOX_SOURCE = i18nKey('VibeSpace integration');

/** The note queued for one running session (the queue validates `kind`). */
function hooksLateNotice({ webuiId, rel, at }) {
  return { kind: NOTICE_KIND, webuiId: String(webuiId || ''), file: String(rel || ''), at: Number(at) || Date.now() };
}
/** session-status's renderer for the kind: the ONE sentence, as a system reminder. */
function renderHooksLateNotice() {
  return '<system-reminder>\n' + HOOKS_LATE_TEXT + '\n</system-reminder>';
}
/** Is a queued note stale for the process now asking (`webuiId`)? Only a
 *  'hooks-late' note queued for ANOTHER webui id is — that process (a resume,
 *  a fork, a restart of the conversation) started with the hooks in place. */
function hooksLateStale(n, webuiId) {
  return !!n && n.kind === NOTICE_KIND && String(n.webuiId || '') !== String(webuiId || '');
}
/** Does a running session read this harness's hook file? A chat session whose
 *  harness injects through its WRAPPER (`inject.kind: 'wrapper'`) never did —
 *  the same rule agent-routes' hookOutputHonoured applies. */
function readsHookFile(session, harness) {
  if (!harness || !harness.inject || !harness.inject.hookFile) return false;
  return !(session && session.mode === 'chat' && harness.inject.kind === 'wrapper');
}
/** The ONE For-you line: how many conversations predate the registration, by
 *  name in the detail (≤ 20 listed, the rest counted). */
function forYouItem({ count, label, rel, names = [] }) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const file = '~/' + String(rel || '');
  const shown = (Array.isArray(names) ? names : []).slice(0, 20).map((x) => String(x || '').slice(0, 120)).filter(Boolean);
  const more = Math.max(0, n - shown.length);
  const head = n === 1
    ? { text: `1 running ${label} conversation started before VibeSpace registered its hooks — Terminate and Resume it to give its agent the VibeSpace tools`,
        key: i18nKey('1 running {label} conversation started before VibeSpace registered its hooks — Terminate and Resume it to give its agent the VibeSpace tools') }
    : { text: `${n} running ${label} conversations started before VibeSpace registered its hooks — Terminate and Resume them to give their agents the VibeSpace tools`,
        key: i18nKey('{n} running {label} conversations started before VibeSpace registered its hooks — Terminate and Resume them to give their agents the VibeSpace tools') };
  const line1 = `VibeSpace created ${file} (the CLI had never written one) and registered its hooks.`;
  const line2 = 'A running conversation keeps the hooks it started with, so its agent has no VibeSpace tools context, task context or bookkeeping until it is restarted.';
  const detail = [line1, line2, '', ...shown.map((x) => '- ' + x), ...(more ? [`- … and ${more} more`] : [])].join('\n');
  return {
    text: head.text,
    detail,
    i18n: {
      text: { key: head.key, params: { n, label } },
      detail: [
        { key: i18nKey('VibeSpace created {file} (the CLI had never written one) and registered its hooks.'), params: { file } },
        { key: i18nKey('A running conversation keeps the hooks it started with, so its agent has no VibeSpace tools context, task context or bookkeeping until it is restarted.') },
        ...shown.slice(0, 9).map((x) => ({ key: '- {name}', params: { name: x } })),
        ...(shown.length > 9 || more ? [{ key: i18nKey('- … and {n} more'), params: { n: n - Math.min(shown.length, 9) } }] : []),
      ],
      source: { key: INBOX_SOURCE },
    },
  };
}

module.exports = { NOTICE_KIND, HOOKS_LATE_TEXT, INBOX_KEY, hooksLateNotice, renderHooksLateNotice, hooksLateStale, readsHookFile, forYouItem };

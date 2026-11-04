// TEXT ADDRESSED TO THE ASSISTANT — the TEXT rule — and THE PERSON'S ROW (PURE:
// imports only PURE src/notification-senders.js + src/inbox-reply-text.js; CJS so the
// server's turn-map builders require it and esbuild bundles it into the client). Lane S3 (naive-user study 2) made the Stop hook's bookkeeping nudge
// and VibeSpace's own injection blocks NOTES in the chat (src/lib/chat-run-summary.js
// assistantNoteOf, the renderer's one grey row). B-40f8 (lane chat-residuals):
// the minimap's drag label and the outline popover still listed the nudge turn
// as "Stop hook feedback: VibeSpace bookkeeping before you stop…" — five
// builders (the claude / codex / ACP turnMap of the attach slab, the
// huge-session JSONL scan in src/adapters/codex.js, chat-view's live append)
// each cut the raw text their own way (60 chars at a word, 60 flat, 10 flat).
// The SERVER builders may not import the client's module (test-architecture:
// SHARED never reaches CLIENT), so the rule lives here and both sides read it.
//
//   noteKindOfText(raw)  → 'status' | 'tools' | 'context' | 'reminder' | 'instructions' | 'note' | null
//   userNoteOf(m)        → {what, text} | null for a normalized USER record
//                          (never one the user typed, a peer card, VibeSpace's
//                          auto-resume card or an image attachment)
//   personRow(m)         → {person, why} — did the PERSON type this normalized
//                          user record? (lane minimap-person-rows, below)
//   turnPreviewOf(m)     → {preview, isCompact?, note?, other?} | null — THE
//                          preview of a user turn: a note carries `note: what`
//                          and no text (the client says its sentence in the
//                          device's language), a compact summary is
//                          COMPACT_PREVIEW, a For-you answer previews its answer,
//                          a slash command the person ran previews as `/name args`,
//                          any other text is whitespace-folded and cut at a word
//                          boundary near 60 characters; `other: why` = nobody
//                          typed it (personRow) — the minimap's list folds it.

// Recognised from the TEXT, never from a flag a transport may drop: the nudge
// carries its own marker phrase (both the pre-S3 wording and the S3 wording
// open with it — src/agent-routes.js stopNudgeReason), and every injection
// block opens with its `<vibespace-…>` tag.
const NOTE_MARKER = 'VibeSpace bookkeeping before you stop';
// Which injection block names which note, most specific first: a delivery
// that carries a Task Group's context AND the reminder is "its task context".
const NOTE_TAGS = Object.freeze([
  ['vibespace-task-context', 'context'],
  ['vibespace-task-update', 'context'],
  ['vibespace-group-manager', 'context'],
  ['vibespace-session-tools', 'tools'],
  ['vibespace-reminder', 'reminder'],
  ['vibespace-user-instructions', 'instructions'],
]);
const textOf = (m) => (Array.isArray(m?.content) ? m.content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('') : '');
function noteKindOfText(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^Stop hook feedback:/.test(s)) return s.includes(NOTE_MARKER) ? 'status' : null; // another hook's Stop feedback (a /goal check) keeps its own card
  // a delivery made of VibeSpace blocks: it OPENS with one (a hook payload may
  // put the user's own <system-reminder> notices after it, never before —
  // agent-routes composes preamble → blocks → notices)
  if (!/^<vibespace-[\w-]+[\s>]/.test(s)) return null;
  if (s.includes(NOTE_MARKER)) return 'status'; // codex: the wrapper's turn-end nudge, a <vibespace-reminder> turn
  for (const [tag, what] of NOTE_TAGS) if (s.includes('<' + tag)) return what;
  return 'note';
}
function userNoteOf(m) {
  if (!m || m.typed || m.originKind === 'peer-message' || m.originKind === 'auto-resume' || m.imageAttachment) return null;
  const text = textOf(m);
  const what = noteKindOfText(text);
  return what ? { what, text: text.trim() } : null;
}

const { isVibespaceNotice } = require('./notification-senders.js'); // PURE: a peer-path record VibeSpace itself speaks in (S3 verify F3: by its PATH)
const { parseReply } = require('./inbox-reply-text.js'); // PURE: THE For-you reply parser (design-user-inbox-reply D1.8)

const COMPACT_PREVIEW = 'Context compacted';
const COMPACT_HEAD = 'This session is being continued from a previous conversation';
// THE compaction-summary rule: the chat draws such a user record as a system card (chat-renderers re-exports it) and
// the voice context's never-list drops it (voice-model, voice-verify F1) — one definition, never a copy
const isCompactSummaryText = (text) => String(text || '').trimStart().startsWith(COMPACT_HEAD);

// THE PERSON'S ROW (lane minimap-person-rows; the owner 2026-11-04, over the chat minimap's «筛选 12190 条消息…» list:
// the person's own messages were buried under VibeSpace's notes, other sessions' deliveries, background-task wakes and
// compaction summaries — every user-ROLE record was listed as if the person had said it). ONE answer to «did the person
// type this normalized user record?»: the minimap's message list folds the rows nobody typed (turnPreviewOf stamps
// `other: why` on their turns — every turn builder already asks it) and the chat's renderer picks its system card by the
// same verdict (chat-renderers renderUserMsg). Asked in the renderer's order, provenance before text (the normalizers'
// law: the origin stamp wins, a TYPED record is never demoted by its words):
//   attachment    CLI-injected page images (imageAttachment)
//   note          a VibeSpace note to the assistant (userNoteOf — the Stop nudge, every NOTE_TAGS block)
//   auto-resume   VibeSpace's continue after a usage limit
//   notice        a peer-path record VibeSpace speaks in (Background Work, a channel wake, the browser handback —
//                 notification-senders isVibespaceNotice, judged by the record's PATH)
//   peer          another session's message or a group report (originKind 'peer-message' = the CLI's origin.kind 'peer')
//   notification  a background-task wake (originKind 'task-notification'); for a record nobody marked typed: a CLI
//                 synthetic record, or one opening with a CLI / harness tag or a Stop hook's words
//   command       THE PERSON'S — a slash command they ran (the TUI's own row; drawn as the command bubble)
//   compact       the CLI's compaction summary (isCompactSummaryText)
//   tray-answer   THE PERSON'S — their answer from the For you tray (`[For you reply #ut-…]`, inbox-reply-text parseReply)
//   typed         THE PERSON'S — everything else
const PERSON_WHYS = Object.freeze(['typed', 'tray-answer', 'command']);
const OTHER_WHYS = Object.freeze(['attachment', 'note', 'auto-resume', 'notice', 'peer', 'notification', 'compact']);
const CLI_TAG_RE = /^<(command-name|local-command|task-notification|system-reminder|vibespace-task-context|vibespace-reminder)/; // the renderer's notification shapes (moved here from renderUserMsg)
const STOP_HOOK_RE = /^(?:A session-scoped Stop hook is now active|Stop hook feedback:)/;
const COMMAND_NAME_RE = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/;
const COMMAND_ARGS_RE = /<command-args>([\s\S]*?)<\/command-args>/;
function personRow(m) {
  const r = m && typeof m === 'object' ? m : {};
  const other = (why) => ({ person: false, why });
  if (r.imageAttachment) return other('attachment');
  if (userNoteOf(r)) return other('note');
  if (r.originKind === 'auto-resume') return other('auto-resume');
  const text = textOf(r);
  if (r.originKind === 'peer-message') return other(isVibespaceNotice(r.peerFrom, text, r.peerVia) ? 'notice' : 'peer');
  if (r.originKind === 'task-notification') return other('notification');
  const s = text.trim();
  if (!r.typed) {
    if (r.originKind === 'local-command' || /^<command-name\b/.test(s)) return { person: true, why: 'command' };
    if (r.synthetic || CLI_TAG_RE.test(s) || STOP_HOOK_RE.test(s)) return other('notification');
  }
  if (isCompactSummaryText(s)) return other('compact');
  if (parseReply(text)) return { person: true, why: 'tray-answer' };
  return { person: true, why: 'typed' };
}

function turnPreviewOf(m, max = 60) {
  const raw = textOf(m).trim();
  if (!raw) return null;
  const who = personRow(m);
  const other = who.person ? {} : { other: who.why }; // the minimap's list folds it (lane minimap-person-rows)
  const note = userNoteOf(m);
  if (note) return { preview: '', note: note.what, ...other };
  if (isCompactSummaryText(raw)) return { preview: COMPACT_PREVIEW, isCompact: true, ...other };
  const cmd = who.why === 'command' ? COMMAND_NAME_RE.exec(raw) : null;
  const said = who.why === 'tray-answer' ? String(parseReply(textOf(m)).reply || '').trim() // the answer, never the tray's marker + quote
    : cmd ? ('/' + cmd[1] + ' ' + ((COMMAND_ARGS_RE.exec(raw) || [])[1] || '')).trim() // the command as the person typed it, never its tags
    : '';
  const s = (said || raw).replace(/\s+/g, ' ');
  if (s.length <= max) return { preview: s, ...other };
  const cut = s.lastIndexOf(' ', max);
  return { preview: (cut > max / 2 ? s.slice(0, cut) : s.slice(0, max)) + '…', ...other };
}

module.exports = { NOTE_MARKER, NOTE_TAGS, COMPACT_PREVIEW, PERSON_WHYS, OTHER_WHYS, noteKindOfText, userNoteOf, personRow, turnPreviewOf, isCompactSummaryText };

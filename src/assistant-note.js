// TEXT ADDRESSED TO THE ASSISTANT — the TEXT rule (PURE: imports nothing; CJS so
// the server's turn-map builders require it and esbuild bundles it into the
// client). Lane S3 (naive-user study 2) made the Stop hook's bookkeeping nudge
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
//   turnPreviewOf(m)     → {preview, isCompact?, note?} | null — THE preview of a
//                          user turn: a note carries `note: what` and no text
//                          (the client says its sentence in the device's
//                          language), a compact summary is COMPACT_PREVIEW, any
//                          other text is whitespace-folded and cut at a word
//                          boundary near 60 characters.

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

const COMPACT_PREVIEW = 'Context compacted';
const COMPACT_HEAD = 'This session is being continued from a previous conversation';
function turnPreviewOf(m, max = 60) {
  const raw = textOf(m).trim();
  if (!raw) return null;
  const note = userNoteOf(m);
  if (note) return { preview: '', note: note.what };
  if (raw.startsWith(COMPACT_HEAD)) return { preview: COMPACT_PREVIEW, isCompact: true };
  const s = raw.replace(/\s+/g, ' ');
  if (s.length <= max) return { preview: s };
  const cut = s.lastIndexOf(' ', max);
  return { preview: (cut > max / 2 ? s.slice(0, cut) : s.slice(0, max)) + '…' };
}

module.exports = { NOTE_MARKER, NOTE_TAGS, COMPACT_PREVIEW, noteKindOfText, userNoteOf, turnPreviewOf };

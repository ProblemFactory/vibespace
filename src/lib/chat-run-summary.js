// Run-fold classification + summary composition — PURE (no DOM, no imports).
// ChatView._updateRuns feeds it per-card raw messages and renders the label;
// scripts/test-fold-ux.mjs pins it in node. Extracted 2.369.37 after the
// owner caught "9 条 Bash · 1 次 MCP" over a run whose only non-Bash card was a
// ToolSearch — the classifier had lumped tool-schema lookups into 'mcp' and
// the summary then CLAIMED an MCP call that never happened. Labels must be
// honest per kind; which kinds FOLD stays a separate question (see
// foldToggleFor).

// Every kind the classifier can return. The summary ORDER below must list
// each one — an unlisted kind used to count `undefined++` = NaN and vanish
// from the label (2.369.34); countKinds() now zero-fills from this list and
// the test asserts SUMMARY_ORDER covers it.
export const RUN_KINDS = ['note', 'thinking', 'bash', 'read', 'search', 'image', 'write', 'memory', 'mcp', 'lookup', 'agent', 'report', 'skill', 'unknown'];

// Counts the CALLER supplies that are not card kinds — they are never
// produced by messageKind() and never zero-filled, so an unset one simply
// renders nothing (no `undefined++`, so no NaN). They still get their line
// from the ONE SUMMARY_ORDER below so ordering never forks.
//   subAgentIn = inbound codex collab rows in the run (B-7473): "5 agent ops"
//   said nothing about a sub-agent having reported back.
export const SUMMARY_EXTRAS = ['subAgentIn'];

// Label order (kind → i18n key). 'skill' has no count line by design (a
// "Launching skill" card is pure harness noise) — it still folds.
// 'report' = a codex sub-agent's written answer (B-7473): it is CONTENT, so
// the kind ships UNCHECKED in chat.collapseKinds; the line only appears for a
// user who ticked it.
const SUMMARY_ORDER = [
  // FIRST (lane S3, naive-user study 2): a VibeSpace note to the assistant opens
  // the run it heads (the Stop nudge, then the vibespace-status call it asked
  // for). A run holding exactly one note says that note's own sentence
  // (runSummaryParts, `notes`); several say this count line.
  ['note', '{n} VibeSpace notes to the assistant'],
  ['thinking', '{n} thinking'],
  ['bash', '{n} Bash'],
  ['read', '{n} file reads'],
  ['search', '{n} web searches'],
  ['image', '{n} image reads'],
  ['write', '{n} writes'],
  ['memory', '{n} memory'],
  ['mcp', '{n} MCP'],
  ['lookup', '{n} tool lookups'],
  ['subAgentIn', '{n} sub-agent messages'],
  ['agent', '{n} agent ops'],
  ['report', '{n} sub-agent reports'],
  ['skill', null],
  ['unknown', '{n} unknown events / new fields'], // 2.369.120: the fall-back card (a record VibeSpace does not know) + the §3 schema-drift card (a known record that grew); ships UNCHECKED — visible until the user folds it
];

// MCP tool ids (mcp__<server>__<tool>) split into their parts — the raw
// triple-underscore identifier as a card header was the reported eyesore.
export function mcpParts(name) {
  const m = /^mcp__(.+?)__(.+)$/.exec(String(name || ''));
  return m ? { server: m[1], tool: m[2] } : null;
}

/**
 * Semantic kind of one card. `toolCard` = the element is a tool-result card
 * (role assistant + tool_use block); non-tool cards can only be 'thinking'.
 * SEMANTIC HINT FIRST (Track B, design-backend-parity.md §5): the normalizer
 * stamps `collapseKind` — codex cards (exec, Agent Wait, send_message…) never
 * matched the claude tool-name map and so NOTHING codex folded (owner
 * report). The name map stays as the fallback for claude + pre-hint records.
 * @param {object} m raw normalized message
 * @param {{toolCard:boolean, isMemoryPath:(fp:string)=>boolean}} opts
 * @returns {string|null} a RUN_KINDS member, or null (= NOT foldable AND
 *   breaks the surrounding run — every new tool name needs a kind)
 */
export function messageKind(m, { toolCard, isMemoryPath = () => false }) {
  if (toolCard) {
    const b0 = m?.content?.[0];
    const fp = b0?.input?.file_path || '';
    const ck = m?.collapseKind;
    if (ck) {
      if ((ck === 'read' || ck === 'write') && isMemoryPath(fp)) return 'memory';
      return ck;
    }
    const tn = m?.content?.[0]?.toolName;
    if (tn === 'Bash') return 'bash';
    // Skill launches (2.227.9, user report "技能卡片无法参与折叠") — a
    // "Launching skill: x" card is pure harness noise, same class as a Bash
    // line; it fell through to null and so BROKE the surrounding run.
    if (tn === 'Skill') return 'skill';
    if (tn === 'Agent' || tn === 'Task') return 'agent'; // claude sub-agent cards join the collab kind
    // web research is its OWN kind (2.369.33, owner report: 42 WebSearch cards
    // in one session, none folded — and each null BROKE the surrounding run)
    if (tn === 'WebSearch' || tn === 'WebFetch') return 'search';
    // EVIDENCE, NEVER THE EXTENSION (image-card review round 2, 2026-09-06): a Read is an image view
    // only when its RESULT carried lifted image blocks. claude hands back
    // numbered TEXT for the text-source image formats — measured, 12/12 real
    // `Read *.svg` tool_results in the fleet corpus are plain strings starting
    // "1\t<svg …" — so an extension rule counted those as "image reads" in the
    // summary AND (since the image kind is exempt from folding) let a plain
    // text card escape its run. codex/ACP never reach this line: their
    // normalizers stamp `collapseKind` above.
    if (tn === 'Read' && b0?.images?.length > 0) return 'image'; // image views fold as their own kind (2.369.34)
    if (tn === 'Grep' || tn === 'Glob' || tn === 'LS') return 'read';   // file-system searches = reads
    // Tool-schema lookups are NOT MCP calls (owner, 2.369.37): they fold with
    // their neighbours under the MCP toggle (foldToggleFor) but count as
    // their own line — "1 tool lookups", never "1 MCP".
    if (tn === 'ToolSearch') return 'lookup';
    if (mcpParts(tn)) return 'mcp'; // any MCP server's tool (2.215.3)
    if (tn === 'Read' || tn === 'Write' || tn === 'Edit' || tn === 'Patch') {
      // agent-memory file ops are their OWN kind (2.213.1, user ask:
      // each is a distinct user concern) — housekeeping vs project work
      if (isMemoryPath(fp)) return 'memory';
      return tn === 'Read' ? 'read' : 'write';
    }
    return null;
  }
  if (m?.role === 'assistant' && Array.isArray(m.content) && m.content.length
      && m.content.every((b) => b.type === 'thinking')) return 'thinking';
  if (assistantNoteOf(m)) return 'note'; // lane S3: text VibeSpace addressed to the ASSISTANT — its own fold kind, default on
  if (m?.noticeKind === 'unknown-record' || m?.noticeKind === 'unknown-fields') return 'unknown'; // 2.369.120: the fall-back card has its own toggle; the §3 drift card shares it
  return null;
}

// ── TEXT ADDRESSED TO THE ASSISTANT (lane S3, naive-user study 2 — "聊天里到处是
// 给助手看的内部文字"): the Stop hook's bookkeeping nudge, the codex twin of it
// (a `<vibespace-reminder>` turn the wrapper starts), and every hook card whose
// payload is one of VibeSpace's own injection blocks (the session-start tools
// intro, a Task Group's context, the per-turn reminder, the user's agent
// instructions). Every one was rendered as a card the user read as part of the
// conversation — the bookkeeping nudge expanded to a paragraph of CLI syntax.
// They are NOTES: one grey line saying what VibeSpace told the assistant, the
// text behind the expander, their own fold kind ('note', default on), and a
// switch that hides them entirely (chat.showAssistantNotes).
//
// Recognised from the TEXT, never from a flag a transport may drop: the nudge
// carries its own marker phrase (both the pre-S3 wording and the S3 wording
// open with it — src/agent-routes.js stopNudgeReason), and every injection
// block opens with its `<vibespace-…>` tag. A message the USER typed
// (`typed`, the CLI's promptSource) is never a note, whatever it says.
export const NOTE_MARKER = 'VibeSpace bookkeeping before you stop';
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
/** The one sentence each note kind shows (an i18n KEY — the caller runs t()). */
export const NOTE_SENTENCES = Object.freeze({
  status: 'VibeSpace reminded the assistant to update its status',
  tools: 'VibeSpace told the assistant about its tools',
  context: 'VibeSpace gave the assistant its task context',
  reminder: 'VibeSpace reminded the assistant of its tools',
  instructions: 'VibeSpace passed your agent instructions to the assistant',
  note: 'VibeSpace passed a note to the assistant',
});
export function noteSentence(what) { return NOTE_SENTENCES[what] || NOTE_SENTENCES.note; }
const textOf = (m) => (Array.isArray(m?.content) ? m.content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('') : '');
function noteOfText(raw) {
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
/**
 * Is this normalized message a VibeSpace note to the assistant? →
 * `{ what, text }` (what ∈ NOTE_SENTENCES keys, text = the raw payload for the
 * expander) or null. User records: not typed, not a peer / auto-resume card.
 * System records: a hook card (`hookData`) whose output is a VibeSpace block.
 */
export function assistantNoteOf(m) {
  if (!m || typeof m !== 'object') return null;
  if (m.role === 'user') {
    if (m.typed || m.originKind === 'peer-message' || m.originKind === 'auto-resume' || m.imageAttachment) return null;
    const text = textOf(m);
    const what = noteOfText(text);
    return what ? { what, text: text.trim() } : null;
  }
  if (m.role === 'system') {
    const h = m.content?.[0]?.hookData;
    if (!h || typeof h.output !== 'string') return null;
    const what = noteOfText(h.output);
    return what ? { what, text: h.output.trim() } : null;
  }
  return null;
}

// ── HARNESS BOOKKEEPING IN A TOOL RESULT (lane S3): the CLI answers some agent
// operations with text written for the MODEL — a background Agent's launch ack
// ("Async agent launched successfully. (This tool result is internal metadata —
// never quote or paste any part of it …)"), a TaskStop's raw JSON
// ({"message":"Successfully stopped task: <id> (<what>)","task_id":…}). The
// card's one visible line was that text. `toolResultSentence` turns it into a
// plain sentence; the raw record stays behind the card's expander. → `{key,
// params}` (an i18n key for t()) or `{text}` (already plain) or null (the
// tool's own first line is fine as it is).
const INTERNAL_RE = /\(This tool result is internal metadata[^)]*\)|\bnever quote or paste\b/i;
const clip = (v, n = 100) => { const s = String(v == null ? '' : v).split('\n')[0].trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
function jsonObjectOf(s) {
  if (!/^\{/.test(s)) return null;
  try { const j = JSON.parse(s); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch { return null; }
}
export function toolResultSentence(block) {
  const tn = block?.toolName;
  const out = String(block?.output == null ? '' : block.output).trim();
  const inp = block?.input && typeof block.input === 'object' ? block.input : {};
  if ((tn === 'Agent' || tn === 'Task') && /^Async agent launched/i.test(out)) {
    return { key: 'Helper started: {what}', params: { what: clip(inp.description, 120) || clip(inp.subagent_type) || 'a helper' } };
  }
  if (tn === 'TaskStop' || tn === 'KillShell') {
    const j = jsonObjectOf(out);
    const msg = String((j && j.message) || (j ? '' : out));
    const m = /^Successfully (?:stopped task|killed shell):?\s*(\S+)\s*(?:\(([\s\S]*)\))?\s*$/.exec(msg.trim());
    const what = clip((m && m[2]) || (j && (j.description || j.command)) || (m && m[1]) || (j && (j.task_id || j.shell_id)) || '');
    if (m || (j && (j.task_id || j.shell_id))) return { key: 'Stopped: {what}', params: { what: what || 'a background task' } };
  }
  if (tn === 'TaskOutput') {
    const st = /<status>\s*([\w-]+)\s*<\/status>/.exec(out)?.[1];
    if (st) return { key: 'Background task: {status}', params: { status: st } };
  }
  // any OTHER result that declares itself internal: never show the declaration
  if (INTERNAL_RE.test(out)) {
    const clean = out.replace(/\(This tool result is internal metadata[^)]*\)/gi, '').split('\n')
      .map((l) => l.trim()).filter((l) => l && !INTERNAL_RE.test(l) && !/\(internal\)\s*$/.test(l))[0] || '';
    return clean ? { text: clip(clean, 120) } : { key: 'Done', params: {} };
  }
  return null;
}

/**
 * Which chat.collapseKinds toggle governs a kind. 'lookup' rides the 'mcp'
 * toggle: no new checkbox (users who customised their list keep folding
 * exactly what they fold today), only the LABEL changed.
 */
export function foldToggleFor(kind) {
  return kind === 'lookup' ? 'mcp' : kind;
}

/** Zero-filled per-kind counter over a list of kinds (null/undefined skipped). */
export function countKinds(kinds) {
  const byKind = {};
  for (const k of RUN_KINDS) byKind[k] = 0;
  for (const k of kinds) if (k) byKind[k] = (byKind[k] || 0) + 1;
  return byKind;
}

/**
 * The per-kind count parts of a fold summary, e.g. ["9 Bash", "1 tool lookups"].
 * Only non-zero kinds render. A single-server MCP run names the server —
 * "8 MCP (chrome-devtools)"; the suffix covers ONLY real mcp__server__tool
 * calls (lookups never contribute a server).
 * @param {Record<string,number>} byKind
 * @param {Iterable<string>} mcpServers distinct servers among the run's mcp cards
 * @param {(key:string, params?:object)=>string} t i18n
 */
export function runSummaryParts(byKind, mcpServers, t, notes = []) {
  const parts = [];
  const servers = [...(mcpServers || [])];
  for (const [kind, key] of SUMMARY_ORDER) {
    if (!key || !byKind?.[kind]) continue;
    // ONE note says what it was ("VibeSpace reminded the assistant to update
    // its status"); the count line is for a run carrying several
    if (kind === 'note' && byKind.note === 1 && notes.length === 1) { parts.push(t(noteSentence(notes[0]))); continue; }
    let s = t(key, { n: byKind[kind] });
    if (kind === 'mcp' && servers.length === 1) s += ` (${servers[0]})`;
    parts.push(s);
  }
  return parts;
}

/**
 * Full header label: kind parts · sub-agent traffic · touched files · errors · running.
 * `collabPart` is a PRE-COMPOSED segment (src/collab-row.js `collabRunPart` —
 * "3 sub-agents · 47 messages · last 4s ago"): its WORDS belong to the collab
 * module, its POSITION belongs to this one composer, so the header, the
 * floating run bar and the run footer can never read different orders. This
 * module stays import-free by taking the string, not the module.
 * @param {{byKind:object, mcpServers?:Iterable<string>, files?:string[], nErr?:number, running?:boolean, collabPart?:string, notes?:string[]}} run
 *   notes = the `what` of every note member (assistantNoteOf), in render order
 *   files = display names in render order (writes already prefixed '✎ '), deduped by the caller
 */
export function runSummaryLabel({ byKind, mcpServers, files = [], nErr = 0, running = false, collabPart = '', notes = [] }, t) {
  const kindParts = runSummaryParts(byKind, mcpServers, t, notes);
  if (collabPart) kindParts.push(collabPart);
  let label = kindParts.join(' · ');
  // touched files (user ask: don't lose the paths), capped at 4 + "+N"
  if (files.length) {
    const shown = files.slice(0, 4);
    label += ' — ' + shown.join(', ') + (files.length > 4 ? `, +${files.length - 4}` : '');
  }
  // failed members surface as a count (an error must not vanish into a
  // silent fold — grep-exit-1 class errors are common and folding them is
  // fine, but the header says they exist)
  if (nErr) label += ` · ${nErr} ✗`;
  // live state on the fold: a running member shows through the header
  if (running) label += ' · ' + t('running…');
  return label;
}

/** WHEN THE FOLD PASS RUNS (inc-mudv05ja-n5rv): the runs MutationObserver hands
 *  a batch of childList records here and gets back 'raf' (fold before the next
 *  paint — a card never shows at its unfolded size) or 'debounce' (the 180 ms
 *  pass for bulk work: pagination, jumps, a page-up trim). A live window meets
 *  THREE record shapes, and before this only the first counted:
 *    tail append   — added > 0, removed 0, nothing after it (a live create);
 *    1:1 replace   — one node out, one node in at the same place (`replaceWith`:
 *                    a tool completion, a re-rendered card) — a swap is not a
 *                    bulk insert, and waiting 180 ms painted the replacement
 *                    unfolded (the owner's +940 px jump at the debounce mark);
 *    head removal  — removed > 0, added 0, nothing before it (the live-append
 *                    trim at the window cap drops the list's FIRST children).
 *  Any other shape (an insert in the middle, a prepend, a multi-node replace)
 *  is bulk ⇒ 'debounce'. A batch made ONLY of head removals is a trim with
 *  nothing new to fold ⇒ 'debounce' as before. Takes MutationRecords or plain
 *  objects of the same shape (addedNodes/removedNodes with `length`,
 *  previousSibling/nextSibling). PURE. */
export function foldPassMode(records) {
  if (!records || !records.length) return 'debounce';
  let live = false;
  for (const r of records) {
    if (!r || r.type !== 'childList') return 'debounce';
    const a = r.addedNodes?.length || 0, d = r.removedNodes?.length || 0;
    if (a > 0 && d === 0 && r.nextSibling == null) { live = true; continue; }        // tail append
    if (a === 1 && d === 1) { live = true; continue; }                               // 1:1 replace
    if (a === 0 && d > 0 && r.previousSibling == null) continue;                     // head removal (trim)
    return 'debounce';
  }
  return live ? 'raf' : 'debounce';
}

export { SUMMARY_ORDER };

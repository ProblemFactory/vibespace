/**
 * MessageManager — converts raw Claude stream-json messages into normalized messages.
 *
 * Each NormalizedMessage has a stable CONTENT-DERIVED ID (see _nextId), a role, status, and content blocks.
 * Tool calls and their results are merged into single messages server-side.
 * Streaming text is modeled as repeated edits to the same message.
 *
 * Two modes:
 *   1. Historical: bulk-convert JSONL array → NormalizedMessage[]
 *   2. Real-time: process one message at a time, emitting create/edit ops
 *
 * Backend-agnostic: other adapters (Codex, Gemini, etc.) can produce the same
 * NormalizedMessage format via their own normalizer.
 */

const { rewoundByRecord, applyRewound, rewoundOp } = require('./rewind-ops.js');
const { workflowNameFromAck, shortWorkflowName } = require('./workflow-name.js');
const { VIBESPACE_NOTICE_HEAD } = require('./notification-senders.js'); // PURE: the head our notifications open with (S3 verify F3: a peer record's PATH, peerOriginOf)
const { offerOf, offerResolution } = require('./reset-credit.js'); // PURE: the reset-credit offer a peer card may carry (design-reset-credits §5) + its resolution (lane reset-path R3)
const { refOf: channelRefOf } = require('./channel-ref.js'); // PURE (B-c127): a channel notice's conversation — `peerChannel`
const { groupOf: groupCardOf, readReport, cardOfReport } = require('./group-card.js'); // PURE (lane group-report-card): a group message's card facts — `peerGroup`
const { MessageWindow } = require('./message-window.js'); // the ordered card list + its window arithmetic (dc-twins M10)
const { staleFromDenyMessage } = require('./browser-stale.js'); // PURE (lane J r2): a deny naming browser_paused = the takeover's stale answer
const { unknownFields: shapeUnknownFields, carrierOf: shapeCarrierOf, unknownFieldsSample } = require('./record-shape.js'); // §3 schema drift (2026-09-21)
const { helperAskOf, askRecordOf, askState, pendingAsksOf, asksSignature, askTransition, isWaiting, ASK_INITIAL, ASK_RECORD_EVENTS, RESULT_EVENT_OF, isUnknownOutcome } = require('./helper-ask.js'); // PURE (lane S1): a helper's permission ask — the parent's card, its view, the waiting chip
const { permissionOutcome, outcomeHead } = require('./permission-outcome.js'); // PURE (lane S1 verify r5): the CENSUS of the CLI's own permission-outcome sentences — the ONE reader of a tool_result's word
const { safetyStopOf } = require('./safety-stop.js'); // PURE (lane classifier-stop-card): the CENSUS of the CLI's own safety-stop sentences — the stop card's one reader

// System subtypes _processSystem actually renders/consumes — anything else
// trips the unhandled-subtype breadcrumb (2.227.5). Keep in sync when adding
// a branch; task_* are handled under the tool_use_id path.
const HANDLED_SYSTEM_SUBTYPES = new Set([
  'init', 'hook_response', 'stop_hook_summary', 'model_refusal_fallback',
  'model_refusal_no_fallback',
  'task_started', 'task_progress', 'task_notification',
  // api_retry is DELIBERATELY card-less: the server feeds it into the
  // streaming label ("API retrying (3/10, HTTP 500)…") — one card per retry
  // attempt would spam the transcript. Listed here so the unknown-subtype
  // breadcrumb stops firing for it.
  'api_retry',
  // session_state_changed is DELIBERATELY card-less too: it is the CLI's own
  // authoritative turn state (idle|running|requires_action, env-gated at spawn
  // — see src/adapters/claude-code.js) and the SERVER consumer drives
  // _isStreaming + the status bar's third state from it. A card per state flip
  // would be several per turn. Listed so the unknown-subtype breadcrumb stops
  // firing for a record we handle (the 2.289.0 rate_limit_event lesson: the
  // set lagging the handler made the breadcrumb lie).
  'session_state_changed',
  // status is card-less for the same reason and is the CLI's REAL compaction
  // channel on our stdout (§2.11): {status:'compacting'} … {status:null,
  // compact_result} — verified in a production buffer's 2.9-minute AUTO
  // compaction, where `compact_progress` never appeared. The server consumer
  // (src/server/stdout/claude-stream-json.js) turns it into the spinner label,
  // _streamingKind and the Compact-now card's stage; a card per status flip
  // would be two per compaction. The same subtype also carries the CLI's
  // permission-mode echo ({status:null, permissionMode}) — also card-less, and
  // the consumer deliberately ignores that one.
  'status',
  // Fire-and-forget full command-list push (2.1.257). Card-less by design:
  // it re-points the composer's completion list, it is not an event.
  'commands_changed',
  // design-unknown-records (2026-09-21), the census's top-5 routed:
  'notification',            // the REPL's own user-facing queue → a priority-coloured notice card (keyed dedupe per turn); immediate/high also toast via the server consumer
  'local_command',           // history-only: the TUI user's slash command → the existing <command-name> bubble
  'away_summary',            // history-only: "what happened while you were away" → the dim Recap card (markdown)
  'turn_duration',           // history + stream: merged into the turn's last message meta (popup row "Turn: 3m18s · 66 messages")
  'background_tasks_changed', // a LEVEL signal (the full live set): reconciles the task cards + the status-bar chip meta op
  'task_updated',            // {task_id, patch:{status}} → applied to the task card (closes a failed task without waiting for task_notification)
  'code_change_published',   // ONE small "PR #608 pushed" card (escaped link) — the same fact as the transcript's pr-link row
  'instruction_size_warning', // 2.1.288 (lane cli-2-1-288-records): CLAUDE.md + rules + imports over the model's limit → the dim harness notice "the CLI warns the instructions are large: N characters (limit M)" — never red
  'informational',           // the CLI's text banner → a dim card, its words verbatim at `level`; the SAFETY STOP line (src/safety-stop.js) + its model-only nudge → ONE worded stop card (lane classifier-stop-card — was the red Unknown-event card)
]);

// ── THE claude INIT FRAME (2.1.257 `system`/`init`) ─────────────────────────
// Every field below is VERBATIM from the binary's own zod schema (dumped, per
// the facts law — `strings` over the 2.1.257 binary, the `xie` schema object),
// every one is optional TO US — a consumer that finds nothing must fall back to
// what it does today — but NOT optional in the schema: only agents / betas /
// terminal_slash_commands / plugin_errors / plugin_warnings / mcp_server_errors
// / memory_paths carry `.optional()` (measured over 2.1.238/.239/.257), so the
// presence of any other key says nothing about which CLI wrote it. We used to keep
// three of them (model / permissionMode / slash_commands) and drop the rest,
// so a FAILED MCP server — a real, present condition in this instance's own
// sessions — was invisible: its tools simply did not exist.
//   mcp_servers        [{name, status}]            status is an OPEN string set
//                                                  ('connected' | 'failed' |
//                                                  'needs-auth' observed here);
//                                                  anything not 'connected' is
//                                                  reported, never enumerated.
//   plugin_errors      [{plugin, type, message}]   demoted plugins (absent when
//                                                  none — and ALSO absent on
//                                                  frame-persisting lanes, so
//                                                  an absent key never means
//                                                  "clean load", which is why
//                                                  nothing here ever renders a
//                                                  green "all fine" claim)
//   mcp_server_errors  [{name, type, message}]     --mcp-config entries skipped
//   plugin_warnings    [{plugin, type, message}]   advisory
//   memory_paths       {auto?, team?}              "Lets SDK renderers classify
//                                                  Read/Write/Edit tool calls
//                                                  on these paths as memory
//                                                  operations without
//                                                  re-implementing CLI path
//                                                  detection" (upstream's own
//                                                  words for why it exists)
//   terminal_slash_commands  string[]              "Subset of slash_commands
//                                                  whose UX is bound to the
//                                                  local terminal… Phone/remote
//                                                  UIs should hide these"
const strList = (v, cap) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, cap) : null);
const objList = (v, keys, cap) => (Array.isArray(v)
  ? v.filter((x) => x && typeof x === 'object').slice(0, cap).map((x) => Object.fromEntries(keys.map((k) => [k, x[k] == null ? '' : String(x[k]).slice(0, 400)])))
  : null);

/** The facts of a claude init frame, in CLIENT spelling. Null-valued keys are
 *  dropped so "the CLI said nothing" and "the CLI said empty" stay different
 *  answers (a producer that says nothing must never look like a session with
 *  zero skills — codex/ACP build initData with no frame at all). */
function initFrameFacts(raw) {
  const out = {};
  const put = (k, v) => { if (v != null) out[k] = v; };
  put('tools', strList(raw.tools, 200));
  put('agents', strList(raw.agents, 100));
  put('skills', strList(raw.skills, 200));
  put('betas', strList(raw.betas, 40));
  put('slashCommands', strList(raw.slash_commands, 200));
  put('terminalSlashCommands', strList(raw.terminal_slash_commands, 100));
  put('mcpServers', objList(raw.mcp_servers, ['name', 'status'], 60));
  put('mcpServerErrors', objList(raw.mcp_server_errors, ['name', 'type', 'message'], 40));
  put('plugins', objList(raw.plugins, ['name', 'path', 'source', 'version'], 60));
  put('pluginErrors', objList(raw.plugin_errors, ['plugin', 'type', 'message'], 40));
  put('pluginWarnings', objList(raw.plugin_warnings, ['plugin', 'type', 'message'], 40));
  if (raw.output_style != null) out.outputStyle = String(raw.output_style).slice(0, 80);
  if (raw.claude_code_version != null) out.version = String(raw.claude_code_version).slice(0, 40);
  if (raw.memory_paths && typeof raw.memory_paths === 'object') {
    const mp = {};
    for (const k of ['auto', 'team']) if (raw.memory_paths[k]) mp[k] = String(raw.memory_paths[k]).slice(0, 400);
    if (Object.keys(mp).length) out.memoryPaths = mp;
  }
  return out;
}

/** Names out of a `commands_changed` payload. The rows are RICH objects
 *  ({name, description, argumentHint, aliases?} — the same schema `/help`
 *  reads), never bare strings like init's `slash_commands`; a producer that
 *  ever sends strings is still read correctly. Returns null when the record
 *  carries no array at all (⇒ do nothing; an empty array is a real answer). */
function commandNames(commands) {
  if (!Array.isArray(commands)) return null;
  return commands.map((c) => String((c && typeof c === 'object' ? c.name : c) || '')).filter(Boolean).slice(0, 200);
}


// Cross-session peer display name (2.361.6, owner report: the card showed the
// raw uds socket path). Precedence: origin.name (the CLI includes the sender's
// session name since 2.1.23x) → the wrapper tag's from-name attribute (older
// records) → a non-socket origin.from → null (renderer shows a generic label;
// a unix socket path is never a user-facing identity).
// A hook's stdout is usually its PROTOCOL JSON ({"continue":true,…} or
// {"hookSpecificOutput":{"additionalContext":"…"}}): the human-relevant part is
// the additionalContext (or a block decision/reason); '' when it says nothing.
// ONE unwrap for the transcript's hook attachments and the live stream's
// hook_response (B-40f8 ②).
function hookPayloadText(raw) {
  let meaningful = String(raw || '').trim();
  try {
    const j = JSON.parse(meaningful);
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const extra = j.hookSpecificOutput?.additionalContext;
      meaningful = typeof extra === 'string' ? extra.trim() : '';
      if (!meaningful && (j.decision || j.reason)) meaningful = [j.decision, j.reason].filter(Boolean).join(': ');
    }
  } catch { /* not JSON — keep the raw text */ }
  return meaningful;
}

function peerDisplayName(origin, text) {
  return peerOriginOf(origin, text).name;
}
// Our Background Work frame counts as OURS only at the START of the delivered
// text — after the CLI's own "Another Claude session sent a message:" wrap and
// (since lane S3) our notice head. Anywhere else it is somebody QUOTING it (a
// group wake carrying a member's words), which must never name the record.
const escRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOTICE_AT_START_RE = new RegExp('^\\s*(?:Another Claude session sent a message:\\s*)?' + escRe(VIBESPACE_NOTICE_HEAD));
const BW_AT_START_RE = new RegExp('^\\s*(?:Another Claude session sent a message:\\s*)?(?:' + escRe(VIBESPACE_NOTICE_HEAD) + '\\s*)?\\[VibeSpace Background Work\\] \\w+ "([^"]+)"');
/**
 * WHO sent a transcript peer record and WHICH PATH its words took (S3 verify
 * F3 — the head and a name are words a sender can type; the rung that names a
 * record is not). → {name, via}:
 *   origin.name / a cross-session `from-name` / the vibespace-msg frame / a
 *   non-socket origin.from — a name the SENDER chose ⇒ via 'peer' (never a
 *   notice, whatever it is called or says);
 *   our Background Work frame at the start ⇒ via 'notification';
 *   nothing names it ⇒ {name:null, via:null} (the renderer then reads the head
 *   as the witness of a name-less server post).
 * peerDisplayName is its `.name` (every existing caller unchanged).
 */
function peerOriginOf(origin, text) {
  if (origin && origin.name && String(origin.name).trim()) return { name: String(origin.name).trim(), via: 'peer' };
  const s = String(text || '');
  const m = /<cross-session-message[^>]*\bfrom-name="([^"]+)"/.exec(s);
  if (m) return { name: m[1], via: 'peer' };
  // SERVER-posted deliveries (vibespace-msg / Background Work) reach the CLI
  // as an unregistered poster: origin has NO name and from:"unknown" — but the
  // framed text itself names the sender. Parse it so rebuilds match the card
  // the delivery site rendered live (2.363.0).
  const vm = /Message from session "([^"]+)" \(via vibespace-msg/.exec(s);
  if (vm) return { name: vm[1], via: 'peer' };
  const bw = BW_AT_START_RE.exec(s);
  if (bw) return { name: 'Background Work · ' + bw[1], via: 'notification' };
  const f = origin && origin.from;
  if (f && f !== 'unknown' && !String(f).startsWith('uds:')) return { name: String(f), via: 'peer' };
  // A GROUP REPORT the server posted (lane peer-card-sender, B-9fd6): a wake's record is name-less too, and the
  // framed report it holds names its senders and its group — read back (PURE group-card readReport) only when it
  // OPENS the delivery (our own notice head never does); the call site draws the card (`applyPeerOrigin`, via 'peer').
  const report = NOTICE_AT_START_RE.test(s) ? null : readReport(s);
  return report ? { name: null, via: null, report } : { name: null, via: null };
}
/** The words the CLI RECORDED for a peer card whose text was re-drawn from them (a framed group report) — what the
 *  rebuild's card matching reads (normalizers `recordedTextOf`); a symbol, so it never rides a message to a client. */
const PEER_RECORDED = Symbol('peerRecorded');
/** A transcript peer record's provenance onto its card (the three claude sites): the name and the PATH, and — for a
 *  server-posted group report (B-9fd6) — the group card it was live: "<sender(s)> → <group>", the words without the
 *  frame (the message that woke it; every message, each sender named, when the report carried several). */
function applyPeerOrigin(msg, po, recorded) {
  msg.peerFrom = po.name;
  if (po.via) msg.peerVia = po.via; // S3 verify F3: the rung that named it, never the words
  const card = po.report ? cardOfReport(po.report, msg.ts) : null;
  if (!card) return msg;
  msg.peerGroup = card.group;
  msg.peerVia = 'peer';
  msg.peerFrom = card.group.self ? null : card.fromName;
  msg.content = [{ type: 'text', text: card.text }];
  Object.defineProperty(msg, PEER_RECORDED, { value: String(recorded || ''), enumerable: false, configurable: true, writable: true });
  return msg;
}

// Result-error classes the UI ACTS on (2.365.0). 'prompt-too-long' = the
// conversation no longer fits the model's context window: every following
// send fails identically until the conversation is compacted, so the renderer
// turns it into a guidance card with a Compact-now action instead of a bare
// "Error: Prompt is too long" line (the userN incident: bare line, then a
// minute-long /compact that got Stop-clicked into "Compaction canceled.").
// Phrases = the CLI's own prompt_too_long detector family (2.1.238).
const PROMPT_TOO_LONG_RE = /prompt is too long|input is too long for requested model|exceeds? (the )?(model'?s )?context (window|limit)|context window (is )?(full|exceeded)/i;
function classifyResultError(text) {
  return PROMPT_TOO_LONG_RE.test(String(text || '')) ? 'prompt-too-long' : null;
}

/** tool_result content → { text, images }. Text/other blocks keep the exact
 *  previous shape (string passthrough; arrays JSON-stringified so the
 *  renderer's `[{` Agent-result parse still works); image blocks are LIFTED
 *  OUT as {mediaType, bytes} and replaced by a one-line marker. */
function splitToolResultContent(content) {
  if (typeof content === 'string') return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: JSON.stringify(content || ''), images: [] };
  const images = [];
  const rest = [];
  for (const b of content) {
    if (b && typeof b === 'object' && b.type === 'image') {
      const data = b.source?.data || '';
      const bytes = Math.round(data.length * 3 / 4);
      images.push({ mediaType: b.source?.media_type || 'image/png', bytes });
      rest.push({ type: 'text', text: `[image ${b.source?.media_type || 'image/png'} · ${Math.max(1, Math.round(bytes / 1024))} KB]` });
    } else rest.push(b);
  }
  if (!images.length) return { text: JSON.stringify(content), images: [] };
  return { text: JSON.stringify(rest), images };
}

/** The TEXT of a tool_result's content (B-63f1). The CLI writes a plain string OR
 *  a list of blocks — every background Agent's launch ack since 2.1.81 is a
 *  one-text-block list — and `splitToolResultContent` keeps a list as its JSON
 *  for the card, which no text reader matches: a HISTORY rebuild (no stream
 *  task_started) never learned which helper an Agent card launched. */
function toolResultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
}

/** A `<synthetic>`-model record, or one whose usage counts nothing, describes
 *  no API request — the CLI's own limit/credit rejection has that shape. */
function syntheticUsage(raw) {
  const m = raw?.message; if (!m) return true;
  if (m.model === '<synthetic>') return true;
  const u = m.usage || {};
  return !((u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0));
}

// The declared TERMINAL values of task_notification.status (the binary's enum,
// mirrored by record-shape's enums.status): the outcome record names one of
// these; anything else closes as completed (the pre-2026-09-21 rule). Defined
// BELOW the three list constants: test-stdout-registry pins those by slicing
// the source up to the first `])`.
const TERMINAL_TASK_STATUS = new Set(['completed', 'failed', 'stopped', 'killed']);

class MessageManager extends MessageWindow {
  // Injected by the server once the settings SyncStore exists (the normalizer
  // can't reach server state directly). null in tests → defaults apply.
  static getSetting = null;

  constructor(sessionId) {
    super(sessionId);
    this.pendingToolCalls = new Map();   // toolUseId → { msgId, block }
    // Task lifecycle needs its OWN index (2.368.15, owner: "基本每个对话都有
    // 已结束的后台任务显示为正在进行"): pendingToolCalls is the permission/
    // result matcher and the tool_result DELETES its entry — a background
    // task's result arrives in seconds ("Command running in background…"),
    // its completion notification arrives minutes later, so every closer
    // that looked tasks up via pendingToolCalls found nothing and the card
    // stayed 'running' forever. These maps live for the conversation.
    this.taskMsgByToolUse = new Map();   // toolUseId → msgId (tasks only)
    this.taskMsgByTaskId = new Map();    // task_id  → msgId
    this._peerMsgIds = new Set(); // cross-session msg_ids already rendered (dedup across the three peer sites)
    // A HELPER's own view (`sub-<tool_use_id>` / `sub-agent-<id>`, lane S1): its
    // asks attach to its own tool cards; the PARENT's normalizer instead hangs a
    // helper's ask on the helper's Agent card (the helper's tool is never here).
    this._subView = /^sub-/.test(String(sessionId || ''));
  }

  _notePeerMsgId(id) {
    if (!id) return;
    this._peerMsgIds.add(id);
    if (this._peerMsgIds.size > 500) { const first = this._peerMsgIds.values().next().value; this._peerMsgIds.delete(first); }
  }

  // Does any recent user message already carry this text? (fallback dedup for
  // peer records without msg_id — the JSONL user record wraps the body in the
  // harness envelope, so containment, not equality)
  _recentUserTextIncludes(body) {
    for (let i = this.messages.length - 1, seen = 0; i >= 0 && seen < 12; i--, seen++) {
      const m = this.messages[i];
      if (m.role === 'user' && (m.content || []).map((b) => b.text || '').join('').includes(body)) return true;
    }
    return false;
  }

  // SERVER-SIDE peer card (2.363.0, owner report "session里也没有消息卡片"):
  // deliveries POSTED BY THIS SERVER (Background Work notify, vibespace-msg —
  // the conversation-deliver ladder) reach the CLI as an UNREGISTERED poster,
  // so the CLI records origin {kind:'peer', from:'unknown'} with NO
  // name/msg_id/body and the stdout result.origin is body-less — result-mining
  // has nothing to mine and the live window stays blank. The server IS the
  // poster: the delivery site knows the sender and text exactly and renders
  // the card here the moment the post succeeds. In-memory only by design — a
  // rebuild renders the CLI's own JSONL user record instead (no dup: that
  // record never crosses stdout, and its body-less result.origin is skipped).
  // No containment dedup: the delivery site posts once per fire (same-body
  // repeats are legitimate — the 2.362.2 review lesson).
  injectPeerCard({ fromName, text, msgId = null, resetCredit = null, kind = null, group = null, exitRun = null, channel = null, belongsTo = null }) {
    const body = String(text || '').trim();
    if (!body) return null;
    // lane exit-calls-in-history: a "Machines · <machine>" card of a call this conversation's OWN Bash card is still running
    // (`vibespace-exit run …` / pull / push) is not a second card — it UPGRADES that Bash card in place (`exitCard`: the
    // card's words + its output block, until the call's own result lands; the renderer draws the call as the machine
    // card, live and in history alike — src/exit-call.js). No such pending call (a terminal session, a script, a helper's
    // call) ⇒ the card as before. `belongsTo(command)` = the producer's matcher (server.js: exit-call cardMatcher) — this
    // file names no exit module (it is bundled into the device agent, test-architecture §52b)
    const host = !msgId && kind === 'notification' && typeof belongsTo === 'function' ? this._exitCallHost(fromName, belongsTo) : null;
    if (host) {
      host.exitCard = { from: String(fromName).trim(), text: body, ...(exitRun && typeof exitRun === 'object' ? { exitRun } : {}) };
      this._emit({ op: 'edit', id: host.id, fields: { exitCard: host.exitCard } });
      return host;
    }
    // A harness-delivered message carries the CLI's msg_id (the turn-start
    // lookup, inc-mu6bfv1t-4drq): note it so the result-rung mining and a
    // device-fed JSONL copy of the same record dedup against THIS card, and
    // never render twice when the feed already did.
    if (msgId && this._peerMsgIds.has(msgId)) return null;
    this._notePeerMsgId(msgId);
    this._currentRk = null; // outside any record context — take the s-fallback id, never the last record's key
    this._currentTs = Date.now();
    this.turnIndex++;
    const msg = this._create({ role: 'user', status: 'complete', content: [{ type: 'text', text: body }], turnIndex: this.turnIndex });
    msg.originKind = 'peer-message';
    msg.peerFrom = fromName && String(fromName).trim() ? String(fromName).trim() : null; // a name is its words, never surrounding whitespace (lane S3)
    if (kind === 'notification' || kind === 'peer') msg.peerVia = kind; // the PATH the card's words took (S3 verify F3) — the delivery site's own kind, never read off the words
    // a STORED RESET CREDIT the card offers (design-reset-credits §5): the wall
    // card / the auto-resume arm card — two numbers-and-a-mode, never markup
    const rc = offerOf(resetCredit);
    if (rc) { msg.resetCredit = rc; if (!rc.resolved) { const l = this._rcOffers || (this._rcOffers = []); l.push(msg); if (l.length > 64) l.shift(); } } // R3: the open offers a later fact may answer
    // lane-exit-run-output E3: a command's exit line + output heads (exit-reach cardOutput, bounded by the producer) ride
    // the "Machines · <machine>" card so the renderer draws the first lines + "Show output" — never a second card
    if (exitRun && typeof exitRun === 'object') msg.exitRun = exitRun;
    // a CHANNEL notice (B-c127): the conversation it is about — its name, the card's one-click link (src/channel-ref.js)
    const cr = channelRefOf(channel);
    if (cr) msg.peerChannel = cr;
    // a GROUP message (lane group-report-card): a wake's card names the sender → the group — a peer's words, always
    const gc = groupCardOf(group);
    if (gc) { msg.peerGroup = gc; msg.peerVia = 'peer'; msg.peerFrom = gc.self ? null : (gc.from || msg.peerFrom); }
    this._emit({ op: 'create', message: msg });
    return msg;
  }

  /** lane exit-calls-in-history: the ONE pending Bash call (newest 64 messages) the Machines card belongs to (`belongsTo`
   *  = PURE src/exit-call.js cardMatcher: its verb, machine and command agree), or null — two candidates ⇒ null (never guess). */
  _exitCallHost(fromName, belongsTo) {
    if (!String(fromName || '').trim().startsWith('Machines · ')) return null;
    const hits = [];
    for (let i = this.messages.length - 1, seen = 0; i >= 0 && seen < 64; i--, seen++) {
      const m = this.messages[i], b0 = m && m.role === 'tool' && m.status === 'pending' && Array.isArray(m.content) ? m.content[0] : null;
      if (!b0 || b0.type !== 'tool_call' || b0.toolName !== 'Bash' || m.exitCard || typeof b0.input?.command !== 'string') continue;
      if (belongsTo(b0.input.command)) hits.push(m);
    }
    return hits.length === 1 ? hits[0] : null;
  }

  /** THE CARD THE CREDIT OUTLIVED (lane reset-path R3): a later fact about account `keys` — a credit used
   *  (`{kind:'used', at, untilSec}`) or a reading (`{kind:'reading', at, usable}`) — resolves every OPEN offer
   *  card on that account drawn before it: the resolution goes ON THE MESSAGE (a slab / page-in re-render
   *  carries it) and ONE `edit` op per card carries only its resetCredit (the client patches it in place).
   *  The PURE rule is src/reset-credit.js offerResolution. → how many cards it resolved */
  resolveResetCreditOffers(keys, ev) {
    const open = this._rcOffers;
    if (!open || !open.length) return 0;
    const ks = new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean).map(String));
    let n = 0;
    for (let i = open.length - 1; i >= 0; i--) {
      const m = open[i];
      const rc = m && m.resetCredit;
      if (!rc || rc.resolved) { open.splice(i, 1); continue; }
      if (!ks.has(String(rc.accountKey || ''))) continue;
      const res = offerResolution(rc, m.ts, ev);
      if (!res) continue;
      m.resetCredit = { ...rc, resolved: res };
      open.splice(i, 1);
      this._emit({ op: 'edit', id: m.id, fields: { resetCredit: m.resetCredit } });
      n++;
    }
    return n;
  }

  // R0 (docs/design-three-tier.md): ids derive from CONTENT, not a
  // per-instance counter. A parser rebuild (server restart today; routine
  // daemon self-upgrade once parsing moves device-side) must reproduce the
  // SAME ids, and a device-parsed history must join a server-parsed live
  // stream by id. Key preference: message.id (stable across the stdout and
  // JSONL copies of one API message — the 2.74.0 dedup lesson) > record uuid
  // (unique per JSONL record; the stdout placeholder uuid is excluded) >
  // record-content hash. One record can mint several messages (thinking /
  // text / tool_use blocks); a per-key counter suffixes the 2nd+ — block
  // order is the API's content order on BOTH transports, so the suffix is
  // transport-stable. Tool messages don't come through here at all: they key
  // on their globally-unique toolCallId.
  static recordKey(raw) {
    const mid = raw?.message?.id;
    if (mid && mid !== '<synthetic>') return 'm:' + mid;
    const u = raw?.uuid;
    if (u && !/-0{11,}1?$/.test(u)) return 'u:' + u; // stdout placeholder …-000000000001 excluded
    return MessageWindow.hashKey(JSON.stringify(raw ?? null)); // FNV-1a over the record's own serialization — deterministic for identical bytes (buffer replay)
  }

  _emit(op) {
    super._emit(op);
    // THE PENDING-ASKS LEVEL (lane S1): an edit that can open or settle an ask
    // (a permission, a helper's ask, the helper's own lifecycle — a stopped
    // helper's ask is no longer waiting) re-derives the list the waiting chip
    // and the For-you inbox read; ONE meta op per change, never per record.
    if (op && op.op === 'edit' && op.fields && (op.fields.permission || op.fields.helperAsks || op.fields.taskInfo)) this._syncPendingAsks();
  }

  /** EVERY ask the user can answer here, oldest first (src/helper-ask.js
   *  pendingAsksOf over the cards that ever carried one — `msgIndex` = the
   *  index the chat window pages by). */
  pendingAsks() {
    const ids = this._askIds;
    if (!ids || !ids.size) return [];
    const cards = [];
    for (const id of ids) { const m = this.messageIndex.get(id); if (m) cards.push(m); }
    return pendingAsksOf(cards, { indexOf: (m) => this.messages.indexOf(m) });
  }

  /** How many times the pending set changed (the server's inbox observer compares it). */
  get pendingAsksVersion() { return this._asksVer || 0; }

  _syncPendingAsks() {
    const list = this.pendingAsks();
    const sig = asksSignature(list);
    if (sig === this._asksSig) return;
    this._asksSig = sig;
    this._asksVer = (this._asksVer || 0) + 1;
    const op = { op: 'meta', subtype: 'pending-asks', data: { asks: list } };
    for (const fn of this.listeners) fn(op);
  }

  /** A REBUILD ends here (normalizers.rebuildHistory, lane S1 verify r4): the rebuilt list's
   *  signature becomes the one the clients hold (the attach payload carries `pendingAsks`),
   *  so the first live edit after a restart announces only a CHANGE — before, the first
   *  lifecycle edit re-stated an unchanged (often empty) set as a fresh pending-asks op. */
  sealPendingAsks() {
    this._asksSig = asksSignature(this.pendingAsks());
    // verify r5: the unknown-sentence heads a rebuild stashed — raised only where a card still reads unknown
    const st = this._outcomeDriftStash; this._outcomeDriftStash = null;
    if (st) for (const head of st) if (this._unknownOutcomeStillHeld(head)) this._raiseOutcomeDrift(head, false);
  }

  /** The persisted first-seen instants of the session's waiting helper asks
   *  (session-meta `helperAskedAt`, verify r3) — a rebuilt ask is stamped with
   *  its REAL arrival so the 60 s For-you clock does not restart with the server. */
  setHelperAskedAt(map) { this._askedAt = map && typeof map === 'object' ? map : null; }

  /** A helper's ask by request id → {ask, card} (the server routes the answer
   *  and the helper's own view by it). */
  helperAskById(requestId) {
    if (requestId == null || !this._askIds) return null;
    const rid = String(requestId);
    for (const id of this._askIds) {
      const m = this.messageIndex.get(id);
      const a = m && Array.isArray(m.helperAsks) ? m.helperAsks.find((x) => x.requestId === rid) : null;
      if (a) return { ask: a, card: m };
    }
    return null;
  }

  /** The parent's Agent call a helper runs under (its card's toolCallId), or null. */
  helperCallOf(agentId) {
    const card = agentId != null ? this._taskMsgFor(null, agentId) : null;
    return card ? (card.toolCallId || null) : null;
  }

  /** The unanswered asks of ONE helper (by the parent's Agent call), as the raw
   *  records its own view is fed when it is created after them. */
  helperAskRecordsFor(parentToolUseId) {
    const out = [];
    if (!parentToolUseId || !this._askIds) return out;
    for (const id of this._askIds) {
      const m = this.messageIndex.get(id);
      if (!m || m.toolCallId !== parentToolUseId || !Array.isArray(m.helperAsks)) continue;
      for (const a of m.helperAsks) if (isWaiting(askState(a, m))) { const r = askRecordOf(a); if (r) out.push(r); } // never an ask whose helper is over (a button nobody can answer)
    }
    return out;
  }

  /** A helper's ask reached the PARENT's normalizer: hang it on the helper's
   *  Agent card, or hold it until that card learns the helper's id (a rebuild
   *  replays the task records AFTER the transcript, so a foreground helper's
   *  card has no id yet when its ask is converted). */
  _noteHelperAsk(ask, emit) {
    const entry = { ...ask, resolved: null, at: emit ? Date.now() : ((this._askedAt && Number(this._askedAt[ask.requestId])) || this._replayAt || 0) }; // a rebuild keeps the ask's REAL arrival (session-meta helperAskedAt, verify r3) — the 60 s inbox clock does not restart
    // the card by the Agent call the record itself names (a future CLI's
    // parent_tool_use_id — verify r2, M2), else by the helper's id through task_started
    const card = this._taskMsgFor(ask.parentToolUseId || null, ask.agentId || null);
    if (card) { this._attachHelperAsk(card, entry, emit); return; }
    const key = ask.agentId || `ptu:${ask.parentToolUseId}`;
    const orph = this._helperOrphans || (this._helperOrphans = new Map());
    const list = orph.get(key) || [];
    if (!list.some((a) => a.requestId === entry.requestId)) list.push(entry);
    orph.set(key, list.slice(-20));
    if (orph.size > 50) orph.delete(orph.keys().next().value);
  }

  _attachHelperAsk(card, entry, emit) {
    const prev = Array.isArray(card.helperAsks) ? card.helperAsks : [];
    if (prev.some((a) => a.requestId === entry.requestId)) return; // a replayed ask is the same ask
    card.helperAsks = [...prev, entry].slice(-20);
    (this._askIds || (this._askIds = new Set())).add(card.id);
    if (emit) this._emit({ op: 'edit', id: card.id, fields: { helperAsks: card.helperAsks } });
  }

  /** The card that just learned a helper's id adopts the asks held for it. */
  _adoptHelperOrphans(agentId, emit) {
    const list = agentId != null && this._helperOrphans ? this._helperOrphans.get(String(agentId)) : null;
    if (!list) return;
    const card = this._taskMsgFor(null, agentId);
    if (!card) return;
    this._helperOrphans.delete(String(agentId));
    for (const entry of list) this._attachHelperAsk(card, entry, emit);
  }

  /** A RECORD moved an ask — the ONE writer of `resolved`, and it writes only what
   *  THE TABLE says (src/helper-ask.js askTransition, verify r3): `event` is one of
   *  ASK_RECORD_EVENTS (a control_response allow/deny, the CLI's withdrawal, the
   *  helper's tool_result for the asked call). The rules live in the table, not
   *  here — a withdrawal overrides our own answer (2.1.281 removes a request's
   *  abort listener the moment it settles, so a control_cancel_request after our
   *  answer PROVES the answer was dropped — verify r2 C1), a record is more precise
   *  than a derived end, nothing else overwrites a settled ask. */
  _settleHelperAsk(requestId, event, emit) {
    if (requestId == null || !ASK_RECORD_EVENTS.includes(event)) return false;
    const rid = String(requestId);
    const hit = this.helperAskById(rid);
    if (hit) {
      const cur = askState(hit.ask, hit.card);
      const next = askTransition(cur, event);
      if (next.state === cur) return true;
      hit.ask.resolved = next.state;
      hit.card.helperAsks = [...hit.card.helperAsks]; // a new array: the client's Object.assign sees the change
      if (emit) this._emit({ op: 'edit', id: hit.card.id, fields: { helperAsks: hit.card.helperAsks } });
      return true;
    }
    if (this._helperOrphans) for (const list of this._helperOrphans.values()) { const a = list.find((x) => x.requestId === rid); if (a) { const cur = a.resolved || ASK_INITIAL; const next = askTransition(cur, event); if (next.state !== cur) a.resolved = next.state; return true; } }
    return false;
  }

  /** The helper's tool_result for an ASKED call reached this (parent) normalizer:
   *  the request is settled — by the CLI's OWN decision when no record of ours
   *  exists (a deadline or a decision of the CLI's own — the brief's "expired"),
   *  or ours when the buffer lost it — and the result says
   *  which way (the same rule a main card uses, _resolutionFromResult). Live from
   *  the stdout consumer's sidechain sites, at a rebuild from session-store's
   *  helperResults (the rebuild's record list skips every sidechain record). */
  noteHelperResult(toolUseId, outputText, isError, emit, bind = null) {
    if (!toolUseId) return false;
    const tid = String(toolUseId);
    // verify r5: the helper's WebFetch PROVENANCE re-ask carries a fresh tool_use_id (see _provenanceReaskCard) — its
    // result lands on the call's own id; `bind = {parentToolUseId, url}` (the call's card in the helper's view) names
    // the asks that result settles too: the same helper's WebFetch asks for the same url
    const byUrl = bind && typeof bind.url === 'string' && bind.parentToolUseId ? bind : null;
    const hits = (a, card) => a.toolUseId === tid || (!!byUrl && a.toolName === 'WebFetch' && a.input && a.input.url === byUrl.url && !!card && card.toolCallId === byUrl.parentToolUseId);
    const outcome = this._resolutionFromResult(outputText, isError);
    const ev = RESULT_EVENT_OF[outcome]; // verify r5: the census's word → the table's result event (allowed / denied / cancelled / unknown)
    const head = outcome === 'unknown' ? outcomeHead(outputText) : null;
    const stamp = (a) => { if (head && isUnknownOutcome(a.resolved)) a.unknownHead = head; };
    let done = false;
    if (this._askIds) for (const id of this._askIds) { const m = this.messageIndex.get(id); for (const a of (m && Array.isArray(m.helperAsks) ? m.helperAsks : [])) if (hits(a, m)) { done = this._settleHelperAsk(a.requestId, ev, emit) || done; stamp(a); } }
    if (this._helperOrphans) for (const list of this._helperOrphans.values()) for (const a of list) if (a.toolUseId === tid) { done = this._settleHelperAsk(a.requestId, ev, emit) || done; stamp(a); }
    if (done && head) this._noteOutcomeDrift(outputText, emit);
    return done;
  }

  /** An ask whose tool card is not here YET (a helper's own view fed from its
   *  file watcher lags the stdout ask; a rotated buffer anchors a request before
   *  its tool_use) waits for the tool_use that names it. Bounded. */
  _stashAsk(toolUseId, raw) {
    const st = this._askStash || (this._askStash = new Map());
    st.set(toolUseId, raw);
    if (st.size > 50) st.delete(st.keys().next().value);
  }

  /**
   * Bulk convert historical messages. Returns NormalizedMessage[].
   * Does NOT emit ops — caller uses the returned array directly.
   */
  convertHistory(claudeMessages) {
    for (const msg of claudeMessages) {
      // Per-record isolation: a single malformed/crashing record must skip,
      // not amputate everything after it (a ReferenceError here once truncated
      // every rebuilt session view at the first hook record — fleet-wide).
      try { this._processMessage(msg, false); }
      catch (e) { console.error('[normalizer] record skipped during history rebuild:', e.message); }
    }
    // Finalize any trailing streaming text
    this._finalizeStreaming(false);
    return this.messages;
  }

  /**
   * Process a single live message. Emits create/edit ops via listeners.
   */
  /** Feed a record WITHOUT emitting ops — the rebuild's tail for the task
   *  records the server persisted (2.369.140): task_started / task_progress /
   *  task_notification are live-only (the transcript never carries them, the
   *  stdout ring drops them within minutes), so without this a restart emptied
   *  every Workflow card's tree until the CLI's next throttled emission. */
  // `at` (lane Q verify, 2026-09-26) = WHEN the server saw the record live (the
  // stdout consumer's `cur.at`): a replayed task_started / task_progress stamps
  // `taskInfo.aliveAt` with it, never with the replay's own clock — a record two
  // days old replayed after a restart is two days old, and /api/workflow counts
  // a tree as proof of life only while its newest record is fresh
  // (src/workflow-disk.js treeAlive). Unknown `at` ⇒ no stamp (no evidence).
  replay(raw, { at = null } = {}) {
    if (!raw || typeof raw !== 'object') return;
    this._replayAt = Number.isFinite(at) && at > 0 ? at : 0;
    try { this._processMessage(raw, false); } finally { this._replayAt = null; }
  }

  /** The instant a task record says its task is alive: now on the live stream
   *  (`emit`), the record's own arrival on a replay, and UNKNOWN (0 ⇒ no stamp)
   *  in a history conversion — the rebuild converts the wrapper's surviving
   *  stdout ring too, whose task records carry no arrival time and may be days
   *  old (an idle session's ring is never overwritten). */
  _taskRecordAt(emit) { return this._replayAt != null ? this._replayAt : (emit ? Date.now() : 0); }

  /** ONE record into cards (MessageWindow's processLive / convertHistoryAsync). */
  _feedRecord(claudeMsg, emit) { this._processMessage(claudeMsg, emit); }

  _extractText(msg) {
    return msg.content.map(b => {
      if (b.type === 'text' || b.type === 'thinking' || b.type === 'system_info') return b.text || b.thinking || '';
      if (b.type === 'tool_result') return `${b.toolName}: ${b.output || ''}`;
      if (b.type === 'tool_call') return `${b.toolName}: ${JSON.stringify(b.input).substring(0, 200)}`;
      return '';
    }).join(' ');
  }

  // Card tail after taskInfo (MessageWindow._create): per-record metadata
  // (model/usage/requestId) for the message-info popup, then noticeKind = the
  // CLIENT's localized renderer key (never threaded before 2.227.4: every
  // notice fell back to its raw English text). CARD_UUID: the JSONL record
  // uuid rides after srcLine — fork-from-here (--resume-session-at) needs it.
  static CARD_FIELDS = ['meta', 'noticeKind'];
  static CARD_UUID = true;

  /** Harness tasks (TaskCreate/TaskUpdate) → TodoWrite-shaped todos meta */
  _emitHarnessTodos(emit) {
    if (!emit || !this._harnessTasks?.size) return;
    // Harness tasks accumulate over the whole session (unlike TodoWrite,
    // which replaces its working set) — show the current working set only:
    // everything unfinished + the 5 most recent completions.
    const all = [...this._harnessTasks.values()].filter(t => t.status !== 'deleted');
    const openTasks = all.filter(t => t.status !== 'completed');
    const doneTail = all.filter(t => t.status === 'completed')
      .sort((a, b) => Number(a.id) - Number(b.id)).slice(-5);
    const todos = [...doneTail, ...openTasks]
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map(t => ({ content: t.content, status: t.status, activeForm: t.activeForm }));
    this._emit({ op: 'meta', subtype: 'todos', data: todos });
  }

  _finalizeStreaming(emit) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.status === 'streaming') {
        m.status = 'complete';
        if (emit) this._emit({ op: 'edit', id: m.id, fields: { status: 'complete' } });
      }
      // Don't break early — stale streaming messages can exist anywhere
      // after pty re-attach incidents. Scan all recent messages.
      // Stop at user messages (streaming never crosses turn boundaries).
      if (m.role === 'user') break;
    }
  }

  // UNKNOWN EVENT = THE FALL-BACK CARD (2.369.119/.120, owner: "你对于未知的 event 似乎是直接
  // 过滤掉…提醒我 harness 可能加了新功能" → "未知事件就正常放在对话流里, 作为兜底"): a
  // top-level type or a system subtype this normalizer does not handle — and
  // that is not DECLARED ignored below — used to vanish with a once-per-process
  // telemetry breadcrumb nobody reads in the chat (rate_limit_event /
  // tool_progress / model_refusal_fallback were each an invisible gap for
  // weeks). Now EVERY such record is an "Unknown event" card in the flow,
  // history and live alike (a rebuild renders the same cards — it is the
  // catch-all renderer, not an alert), carrying the WHOLE record to expand.
  // The chat's run-fold owns its noise (kind 'unknown', off by default).
  _noteUnknownRecord(kind, name, raw, emit) {
    if (!name) return;
    this._unknownCarded = raw; // the whole record is on its card — never ALSO judged for field drift
    const msg = this._create({
      role: 'system', status: 'complete', noticeKind: 'unknown-record',
      content: [{ type: 'unknown_record', kind, name: String(name).slice(0, 80), harness: this.harnessLabel || 'Claude Code', record: unknownRecordJson(raw) }],
    });
    if (emit) this._emit({ op: 'create', msg });
  }

  _processMessage(raw, emit) {
    // Extract timestamp from raw message for _create
    this._currentTs = raw.timestamp ? new Date(raw.timestamp).getTime() : Date.now();
    this._currentLine = Number.isFinite(raw.__line) ? raw.__line : null; // source file line (gap loads only)
    this._currentUuid = raw.uuid || null; // JSONL record uuid — needed for fork-from-here (--resume-session-at)
    this._currentRk = MessageManager.recordKey(raw);
    this._routeMessage(raw, emit);
    // AFTER routing (design-unknown-records §3): a KNOWN record carrying fields
    // it does not declare is recorded and flagged — the handler already ran.
    this._noteShapeDrift(raw, emit);
  }

  // SCHEMA DRIFT ON A KNOWN RECORD (owner ruling (b), 2026-09-21): the fall-back
  // card catches an unknown TYPE; this catches a known type that GREW. ONE card
  // per shape per session — a second occurrence with new fields MERGES into that
  // card (an edit op), never a new card; a repeat with nothing new is silent.
  // Telemetry `harness-shape-drift` once per process per shape, the CLI version
  // in the detail so Diagnostics can say which build started it. The sample
  // rides through the redactor (values under token/secret/key/… keys masked).
  _noteShapeDrift(raw, emit) {
    if (this._unknownCarded === raw) { this._unknownCarded = null; return; } // the fall-back card owns it
    let drift = null;
    try { drift = shapeUnknownFields('claude', shapeCarrierOf('claude', raw), raw); } catch { return; }
    if (!drift) return;
    this._noteDrift(drift, raw, emit);
  }
  /** ONE drift card per shape per session, merged on new evidence (the record-shape path; verify r5 also
   *  feeds it a permission-outcome sentence outside the census). */
  _noteDrift(drift, raw, emit) {
    const cards = this._shapeDrift || (this._shapeDrift = new Map());
    const entry = cards.get(drift.shape);
    const newFields = drift.fields.filter((f) => !entry || !entry.fields.has(f));
    const newEnums = drift.enumDrift.filter((e) => !entry || !entry.enums.has(e.field + '=' + e.value));
    if (entry && !newFields.length && !newEnums.length) return;
    const seen = this.constructor._seenShapeDrift;
    if (seen && !seen.has(drift.shape)) {
      seen.add(drift.shape);
      const ver = this._harnessVersion?.() || null;
      try { global.__vsEvent?.('harness-shape-drift', `${drift.shape} +{${drift.fields.join(',')}}${drift.enumDrift.length ? ' enum:' + drift.enumDrift.map((e) => e.field + '=' + e.value).join(',') : ''}${ver ? ' · cli ' + ver : ''}`.slice(0, 300)); } catch {}
    }
    if (!entry) {
      const msg = this._create({
        role: 'system', status: 'complete', noticeKind: 'unknown-fields',
        content: [{ type: 'unknown_fields', harness: 'Claude Code', shape: drift.shape.replace(/^[a-z]+:[a-z]+:/, ''), fields: [...newFields], enumDrift: [...newEnums], sample: unknownFieldsSample(raw) }],
      });
      cards.set(drift.shape, { msgId: msg.id, fields: new Set(newFields), enums: new Set(newEnums.map((e) => e.field + '=' + e.value)) });
      if (emit) this._emit({ op: 'create', message: msg });
      return;
    }
    const msg = this.messageIndex.get(entry.msgId);
    if (!msg) return;
    const b = msg.content[0];
    for (const f of newFields) { entry.fields.add(f); b.fields.push(f); }
    for (const e of newEnums) { entry.enums.add(e.field + '=' + e.value); b.enumDrift.push(e); }
    b.sample = unknownFieldsSample(raw); // the latest occurrence is the freshest evidence
    if (emit) this._emit({ op: 'edit', id: msg.id, fields: { content: msg.content } });
  }

  /** The harness build that wrote this stream, for the drift breadcrumb (claude: the init frame's version). */
  _harnessVersion() { return this._initFrame?.version || null; }

  _routeMessage(raw, emit) {
    switch (raw.type) {
      case 'system': return this._processSystem(raw, emit);
      case 'user': return this._processUser(raw, emit);
      case 'assistant': return this._processAssistant(raw, emit);
      case 'result': return this._processResult(raw, emit);
      case 'attachment': return this._processAttachment(raw, emit);
      case 'queue-operation':
        if (typeof raw.content === 'string' && raw.content.includes('<task-notification>')) this._closeTaskFromNotification(raw.content, emit);
        return;
      case 'control_request': return this._processControlRequest(raw, emit);
      case 'control_response': return this._processControlResponse(raw, emit);
      case 'control_cancel_request': return this._processControlCancel(raw, emit);
      // A previously-yielded message was RETRACTED upstream (§2.10). We render
      // AND persist the stream, so without this the orphan lived forever.
      case 'tombstone': return this._processTombstone(raw, emit);
      // the transcript's persisted PR pointer {prNumber, prUrl, prRepository} =
      // the same fact as system/code_change_published (design-unknown-records)
      case 'pr-link': return this._processCodeChange({ provider: null, url: raw.prUrl, repo: raw.prRepository, identifier: raw.prNumber != null ? String(raw.prNumber) : null, action: null }, emit);
      default:
        if (!KNOWN_IGNORED_RECORD_TYPES.has(raw.type)) this._noteUnknownRecord('type', raw.type, raw, emit);
        return;
    }
  }

  /** claude `tombstone` → the ONE 'rewound' meta op (src/rewind-ops.js).
   *  The record's `message` is the CLI's internal Message; we resolve it by the
   *  identities our own ids are minted from (record uuid, API message.id).
   *  A tombstone for a message we never rendered emits NOTHING — a no-op op
   *  would tell the view to strike a message it does not have.
   *
   *  UNVERIFIED ON OUR WIRE (round 4, honest status): no VibeSpace-spawned CLI
   *  has been observed emitting one — 0 in 24 production buffers, 0 in the wire
   *  probe, and 0 files under ~/.claude/projects/ contain the type, so a
   *  transcript rebuild cannot produce it either. It is not DISPROVEN like
   *  set_in_progress_tool_use_ids and compact_progress (those go to host
   *  callbacks; this one is `yield`ed on the query stream) — it just needs a
   *  server REFUSAL-FALLBACK, which is not deterministically triggerable and
   *  which we will not provoke. In practice today the retraction lane of §2.10
   *  is CODEX-ONLY (`thread_rolled_back`, verified in real rollouts); this stays
   *  as working code for the day a refusal fallback happens in front of a user. */
  _processTombstone(raw, emit) {
    const tomb = raw && raw.message;
    if (!tomb || typeof tomb !== 'object') return;
    const uuid = tomb.uuid || null;
    const messageId = tomb.message?.id || tomb.id || null;
    const ids = applyRewound(this.messages, rewoundByRecord(this.messages, { uuid, messageId }), 'superseded');
    if (!ids.length) return;
    if (emit) this._emit(rewoundOp({ harness: 'claude', toMessageId: ids[0], ids, kind: 'superseded', ts: this._currentTs }));
  }

  _processSystem(raw, emit) {
    // (see the unhandled-subtype breadcrumb at the tail of this method)
    if (raw.subtype === 'init') {
      const frame = initFrameFacts(raw);
      // ONE CARD PER *DISTINCT* FRAME (round 2). A conversation carries one
      // init record per spawn — every resume, every server restart, every
      // wrapper respawn — and they are overwhelmingly identical. Measured on
      // this instance's own data/session-buffers (a ROTATING window, so the
      // numbers are snapshots): 2026-09-07 05:34 = 62 init records in 13
      // conversations, 62 of them carrying a health issue, 33 byte-identical
      // ones in ONE conversation; a re-measure at 05:40, after the ring
      // buffers had rotated, = 30 records / 14 distinct frames / 30 with
      // issues / 6 max. Both agree on the shape: 2×–33× redundancy at a 100%
      // warned rate. Restating the same session-start facts — and the same
      // "4 not working" strip — 33 times tells the reader nothing the first
      // one did not. So an init whose frame equals the PREVIOUS init's is marked
      // `frameRepeat` and the renderer draws nothing for it; every side
      // effect (model, permission mode, command list, memory dirs) still
      // applies, because those are per-spawn facts even when they repeat.
      // A frame that CHANGED always draws: a server that went connected →
      // failed, a skill discovered mid-session, a CLI upgrade, another model
      // are exactly what the card exists to show.
      // The fingerprint is taken HERE, before `commands_changed` patches
      // `_initFrame.slashCommands` in place, so the comparison is always
      // init-vs-init and never init-vs-patched-init.
      const framePrint = JSON.stringify(frame);
      const frameRepeat = this._lastInitPrint !== undefined && framePrint === this._lastInitPrint;
      this._lastInitPrint = framePrint;
      this._initFrame = frame;
      const msg = this._create({
        role: 'system', status: 'complete',
        content: [{
          type: 'system_info', text: `Model: ${raw.model || 'unknown'}`,
          initData: {
            model: raw.model, permissionMode: raw.permissionMode, slashCommands: raw.slash_commands,
            // The WIDENED frame (§2.6): the same record already carried these
            // and we dropped every one of them. Field names are verbatim from
            // the 2.1.257 zod schema (`system`/`init` variant) — dumped, not
            // guessed. NOTE (round 2, corrected): in the CLI's own schema
            // `tools` / `mcp_servers` / `skills` / `plugins` / `output_style`
            // / `claude_code_version` are REQUIRED, so the presence of a
            // widened key is NOT evidence that a particular CLI is new — see
            // buildInitCard, which must never be described as gating on it.
            // The keys that really are `.optional()` (agents, betas,
            // terminal_slash_commands, plugin_errors, plugin_warnings,
            // mcp_server_errors, memory_paths) stay ABSENT when unsent.
            frame, frameRepeat,
          },
        }],
      });
      this._initMsgId = msg.id;
      if (emit) this._emit({ op: 'create', message: msg });
      // The FIRST authority on the completion list, and the one that also says
      // which of those commands are terminal-bound. Sent as the same meta op a
      // mid-session `commands_changed` push uses, so the client has ONE code
      // path for "here is the command list now" (the ACP twin joins it too).
      if (emit) this._emitSlashCommands(raw.slash_commands, frame.terminalSlashCommands);
    }

    // MID-SESSION COMMAND-LIST PUSH (2.1.257 `system`/`commands_changed`,
    // describe: "Fire-and-forget push of the full slash-command list after a
    // mid-session change (e.g. skills discovered dynamically as the agent
    // works in a subdirectory). Clients should REPLACE their cached command
    // list with this payload"). Shape differs from init's `slash_commands`
    // (string[]): `commands` is the RICH row {name, description,
    // argumentHint, aliases?} — so the names are read out, never assumed.
    // REPLACE is the whole contract: a command that disappeared upstream must
    // disappear here, which an append would never do.
    if (raw.subtype === 'commands_changed') {
      const names = commandNames(raw.commands);
      if (names) {
        // The terminal subset is NOT re-sent by this push, so the init frame's
        // stays authoritative — intersected with the new list so a command
        // that vanished upstream does not linger as a "terminal" name.
        const terminal = (this._initFrame?.terminalSlashCommands || []).filter((c) => names.includes(c));
        if (this._initFrame) this._initFrame.slashCommands = names;
        // Patch the init card in place (the codex/ACP pattern) so a client
        // that rebuilds history from the buffer sees the CURRENT list…
        const init = this._initMsgId ? this.messageIndex.get(this._initMsgId) : null;
        const d = init?.content?.[0]?.initData;
        if (d) {
          d.slashCommands = names;
          if (d.frame) d.frame.slashCommands = names;
          if (emit) this._emit({ op: 'edit', id: init.id, fields: { content: init.content } });
        }
        // …and tell live clients through the ONE meta op (an `edit` on a
        // complete system card does not re-run the renderer's side effects —
        // the composer would never hear about it).
        if (emit) this._emitSlashCommands(names, terminal);
      }
    }

    if (raw.subtype === 'hook_response') {
      const name = raw.hook_name || raw.hook_event || 'hook';
      if (this._lastHookCard && this._lastHookCard.name === name && Math.abs(this._currentTs - this._lastHookCard.ts) < 5000) return;
      const ok = raw.outcome === 'success' || raw.exit_code === 0;
      const icon = ok ? '✓' : '✗';
      // B-40f8 ②: the stream's `output` is the hook's PROTOCOL JSON — unwrapped by the
      // same rule as the transcript's attachment, or a VibeSpace SessionStart block
      // read as a plain hook row (raw JSON behind it) until a rebuild
      const rawOut = typeof raw.output === 'string' ? raw.output : '';
      const output = hookPayloadText(rawOut) || (ok ? '' : rawOut);
      const msg = this._create({
        role: 'system', status: ok ? 'complete' : 'error',
        content: [{ type: 'system_info', text: `${icon} Hook: ${name}`, hookData: { name, event: raw.hook_event, outcome: raw.outcome, exitCode: raw.exit_code, output } }],
      });
      // raw.output, NOT bare `output` — the 2.80.0 typo threw ReferenceError on
      // EVERY hook_response during convertHistory, amputating rebuilt history at
      // the first buffer hook record (live path swallowed it per-line; the
      // "restart 之后消息都没了" incident).
      this._lastHookCard = { name, ts: this._currentTs, msgId: msg.id, outHead: output ? output.slice(0, 200) : null };
      if (emit) this._emit({ op: 'create', message: msg });
    }

    // REFUSAL-triggered model fallback (2.227.4, real report "聊到一半变成
    // opus-4.8 但看不到 fallback 事件"): a NEWER CLI path than the 2.29.1
    // `fallback` CONTENT BLOCK — when the safety classifier flags a message,
    // the CLI RETRIES it on another model and records ONLY this system line
    // (verified: the 00:29 switch had the system record and NO content
    // block). Unhandled subtypes fall through _processSystem silently, so the
    // model badge flipped with nothing in the transcript to explain it.
    if (raw.subtype === 'model_refusal_fallback') {
      // KEY-CASING TRAP (2.227.6, real "? → ?" report): the SAME record is
      // snake_case on stdout (`original_model`) and camelCase in the JSONL
      // (`originalModel`) — reading only the JSONL shape rendered every LIVE
      // notice with '?' models while history rebuilds looked fine. Accept
      // both on every field of any record read from BOTH transports.
      const from = raw.originalModel || raw.original_model || '?';
      const to = raw.fallbackModel || raw.fallback_model || '?';
      const msg = this._create({
        role: 'system',
        content: [{
          type: 'text',
          // English text is the fallback; the client localizes on noticeKind.
          text: `⚠ Safety-classifier fallback: ${from} → ${to} (the model's safeguards flagged this message, so the harness retried it on another model)`,
          fallbackFrom: from, fallbackTo: to,
          refusalCategory: raw.apiRefusalCategory || raw.api_refusal_category || null,
          // stdout also carries the policy explanation (JSONL doesn't) — it is
          // the most actionable line for the user, so prefer it.
          cliText: [raw.api_refusal_explanation || raw.apiRefusalExplanation || '', typeof raw.content === 'string' ? raw.content : '']
            .filter(Boolean).join('\n\n').slice(0, 900) || null,
        }],
        noticeKind: 'model-refusal-fallback',
      });
      if (emit) this._emit({ op: 'create', message: msg });
    }

    // With fallback disabled (switchModelsOnFlag=false / the env kill), a
    // safety-classifier refusal no longer reroutes — the CLI emits this and
    // the turn DEAD-ENDS. Unrendered it is a silent failure (the turn just
    // stops with nothing shown), which is the exact class the disable option
    // exists to avoid. Both key casings (stdout snake / JSONL camel).
    if (raw.subtype === 'model_refusal_no_fallback') {
      const model = raw.originalModel || raw.original_model || '?';
      const msg = this._create({
        role: 'system',
        content: [{
          type: 'text',
          text: `⚠ Safety-classifier stop: ${model} flagged this message and model fallback is disabled — the turn stopped instead of switching models. Rephrase and resend to continue.`,
          fallbackFrom: model,
          refusalCategory: raw.apiRefusalCategory || raw.api_refusal_category || null,
          cliText: [raw.api_refusal_explanation || raw.apiRefusalExplanation || '', typeof raw.content === 'string' ? raw.content : '']
            .filter(Boolean).join('\n\n').slice(0, 900) || null,
        }],
        noticeKind: 'model-refusal-no-fallback',
      });
      if (emit) this._emit({ op: 'create', message: msg });
    }

    if (raw.subtype === 'stop_hook_summary') {
      const count = raw.hookCount || 0;
      const infos = raw.hookInfos || [];
      const failed = infos.filter(h => h.exitCode !== 0 && h.exitCode != null);
      // Inline: SHORT names only. hookInfos often has no name field, just the
      // raw command — which can be a whole embedded shell script (claude-mem's
      // is ~1KB; dumping it inline made the card an unreadable wall — user
      // report). Derive a short name (first script filename in the command);
      // the full commands live in the expandable hookData body instead.
      const shortName = (h) => {
        const n = h.name || h.hookName;
        if (n) return String(n).slice(0, 40);
        const cmd = String(h.command || '');
        const m = cmd.match(/([\w.-]+\.(?:mjs|cjs|js|sh|py|ts))\b/);
        return (m ? m[1] : (cmd.trim().split(/\s+/)[0] || 'hook')).slice(0, 40);
      };
      const names = [...new Set(infos.map(shortName).filter(Boolean))];
      const nameStr = names.length ? ` (${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''})` : '';
      const text = (failed.length ? `${count} hooks ran, ${failed.length} failed` : `${count} hooks ran`) + nameStr;
      const detail = infos.map((h) => `- ${shortName(h)}${h.exitCode != null ? ` (exit ${h.exitCode})` : ''}${h.command ? `\n  ${String(h.command)}` : ''}`).join('\n');
      const msg = this._create({
        role: 'system', status: failed.length ? 'error' : 'complete',
        content: [{ type: 'system_info', text, ...(detail ? { hookData: { name: `${count} hooks`, event: 'Stop', outcome: failed.length ? 'partial' : 'success', exitCode: null, output: detail } } : {}) }],
      });
      if (emit) this._emit({ op: 'create', message: msg });
    }

    // ── design-unknown-records (2026-09-21): the census's routed subtypes ──
    // THE REPL'S OWN NOTIFICATION QUEUE (`system`/`notification`, binary: "Loop-
    // side text notification. Mirrors the interactive REPL notification queue
    // (key/priority/timeout)"): 43 red cards in one day's live buffers were the
    // CLI telling the user something (stop-hook-error, fast-mode-overage-
    // rejected, model-deny). A dim, priority-coloured notice card, keyed
    // dedupe per `key` within a turn (the queue re-asserts). immediate/high
    // ALSO reach the user as a toast — the SERVER consumer does that
    // (session-brain noteHarnessNotification), one implementation for both feeds.
    if (raw.subtype === 'notification' && typeof raw.text === 'string' && raw.text.trim()) {
      const key = typeof raw.key === 'string' && raw.key ? raw.key.slice(0, 80) : null;
      const seen = this._notifKeys || (this._notifKeys = new Map());
      if (key && seen.get(key) === this.turnIndex) return;
      if (key) seen.set(key, this.turnIndex);
      const priority = ['low', 'medium', 'high', 'immediate'].includes(raw.priority) ? raw.priority : 'medium';
      const msg = this._create({
        role: 'system', status: 'complete', noticeKind: 'harness-notification',
        content: [{ type: 'harness_notification', key, text: raw.text.slice(0, 2000), priority, color: typeof raw.color === 'string' ? raw.color.slice(0, 24) : null }],
      });
      if (emit) this._emit({ op: 'create', message: msg });
      return;
    }
    // THE CLI'S TEXT BANNER (`system`/`informational`, lane classifier-stop-card;
    // binary: "Generic text banner emitted by the loop — non-error status lines,
    // hook feedback …, slash-command output. Hosts render `content` as plaintext
    // at the given level"): a dim card, the CLI's words VERBATIM (escaped on the
    // client — CLI text is not an i18n key), `level` kept for its colour. It was
    // the red Unknown-event card. The SAFETY STOP line is read from the census
    // and becomes the worded stop card (_safetyStopCard). Both carriers: the
    // stream's snake_case and the transcript row carry the same two fields.
    // BYPASS ANSWERED THE CLI'S OWN ASK (lane bypass-no-prompts): VibeSpace's own record, never the CLI's
    if (raw.subtype === 'vs_auto_allow') { this._autoAllowLine(raw, emit); return; }
    // INSTRUCTIONS TOO LARGE (`system`/`instruction_size_warning`, 2.1.288 — lane cli-2-1-288-records): the CLI
    // measured CLAUDE.md + rules + imports over the model's limit. The same dim harness notice, in OUR words
    // (`say` → the client's i18n line; `text` = the English fallback). Numbers only — no file path rides the record.
    if (raw.subtype === 'instruction_size_warning') {
      const n = (a, b) => (Number.isFinite(a) ? a : (Number.isFinite(b) ? b : null));
      const chars = n(raw.total_chars, raw.totalChars), limit = n(raw.total_limit_chars, raw.totalLimitChars);
      if (chars == null) return;
      const files = n(raw.file_count, raw.fileCount);
      const text = `The CLI warns the instructions are large: ${chars} characters (limit ${limit ?? '?'})`;
      const msg = this._create({ role: 'system', status: 'complete', noticeKind: 'harness-informational', content: [{ type: 'harness_informational', text, level: 'notice', say: 'instruction-size', params: { chars, limit, files } }] });
      if (emit) this._emit({ op: 'create', message: msg });
      return;
    }
    if (raw.subtype === 'informational' && typeof raw.content === 'string' && raw.content.trim()) {
      const text = raw.content.slice(0, 4000);
      const stop = safetyStopOf(text);
      if (stop && stop.kind === 'notice') { this._safetyStopCard({ notice: text, model: stop.model, noticeRow: stop.row.id }, emit); return; }
      const level = ['info', 'notice', 'suggestion', 'warning'].includes(raw.level) ? raw.level : 'notice';
      const msg = this._create({ role: 'system', status: 'complete', noticeKind: 'harness-informational', content: [{ type: 'harness_informational', text, level }] });
      if (emit) this._emit({ op: 'create', message: msg });
      return;
    }
    // THE TUI USER'S SLASH COMMAND (`system`/`local_command`, history-only; not
    // in the SDK union — the REPL's own persisted row `<command-name>/x</command-
    // name>…`): rendered through the existing command bubble (renderUserMsg's
    // notification path strips the tags). Not a model turn: turnIndex untouched.
    if (raw.subtype === 'local_command' && typeof raw.content === 'string' && raw.content.trim()) {
      const msg = this._create({ role: 'user', status: 'complete', content: [{ type: 'text', text: raw.content.slice(0, 4000) }], turnIndex: this.turnIndex });
      msg.synthetic = true; // never a "You" bubble — the classifier's forced-notification flag
      msg.originKind = 'local-command';
      if (emit) this._emit({ op: 'create', message: msg });
      return;
    }
    // "WHAT HAPPENED WHILE YOU WERE AWAY" (`system`/`away_summary`, history-only):
    // model text → the dim Recap card, markdown through DOMPurify on the client.
    if (raw.subtype === 'away_summary' && typeof raw.content === 'string' && raw.content.trim()) {
      const msg = this._create({ role: 'system', status: 'complete', noticeKind: 'away-summary', content: [{ type: 'text', text: raw.content.slice(0, 8000) }] });
      if (emit) this._emit({ op: 'create', message: msg });
      return;
    }
    // TURN DURATION (`system`/`turn_duration`): the REPL's "Done in Ns" line.
    // Card-less — it rides the turn's last message as meta (the message-meta
    // popup's "Turn:" row). Both carriers: stream snake_case, transcript camel.
    // A success `result` creates no message of its own, so "the preceding
    // result message" is the last message of the turn just ended.
    if (raw.subtype === 'turn_duration') {
      const n = (a, b) => (Number.isFinite(a) ? a : (Number.isFinite(b) ? b : null));
      const turn = {
        durationMs: n(raw.duration_ms, raw.durationMs), messageCount: n(raw.message_count, raw.messageCount),
        budgetTokens: n(raw.budget_tokens, raw.budgetTokens), budgetLimit: n(raw.budget_limit, raw.budgetLimit), budgetNudges: n(raw.budget_nudges, raw.budgetNudges),
        pendingAgents: n(raw.pending_background_agent_count, raw.pendingBackgroundAgentCount), pendingWorkflows: n(raw.pending_workflow_count, raw.pendingWorkflowCount),
      };
      if (turn.durationMs == null && turn.messageCount == null) return;
      for (let i = this.messages.length - 1; i >= 0; i--) {
        const m = this.messages[i];
        if (m.role === 'user' && !m.synthetic) break; // the turn began here: nothing of ours precedes it
        if (m.role === 'assistant' || m.role === 'tool' || (m.role === 'system' && m.status !== 'complete')) {
          m.meta = { ...(m.meta || {}), turn };
          if (emit) this._emit({ op: 'edit', id: m.id, fields: { meta: m.meta } });
          break;
        }
      }
      return;
    }
    // THE FULL LIVE SET OF BACKGROUND TASKS (`system`/`background_tasks_changed`,
    // binary: "The full set of live background tasks, emitted whenever
    // membership changes"). A LEVEL signal over BACKGROUND tasks only: a
    // BACKGROUNDED task card still running whose id is NOT in the set is
    // finished even if its notification was lost (the 2.368.15 forever-running
    // class), and the status bar gets the count. Two rules the r3 verifier
    // reproduced on the production buffers (2026-09-21): ① task_started fires for
    // FOREGROUND calls too (86 of 107 were local_bash is_backgrounded:false) and
    // the set never names them — closing those read a running Bash card as
    // done; ② the CLI drops membership ~2 records BEFORE the outcome record
    // (task_updated{failed} / task_notification), so this close is a SOFT one —
    // `finished` with `closedBy:'level'` (outcome not reported) — that the real
    // outcome may still overwrite; a hard `completed` here pre-empted every
    // observed task_updated{failed}.
    if (raw.subtype === 'background_tasks_changed' && Array.isArray(raw.tasks)) {
      const set = raw.tasks.filter((t) => t && typeof t === 'object' && t.task_id != null)
        .map((t) => ({ id: String(t.task_id).slice(0, 64), type: normalizeTaskType(typeof t.task_type === 'string' ? t.task_type.slice(0, 32) : null), description: typeof t.description === 'string' ? t.description.slice(0, 200) : '' , ...(() => { const m = this._taskMsgFor(null, t.task_id); const ti = m && m.taskInfo; return ti && ti.runId ? { runId: String(ti.runId), summary: ti.summary || null } : {}; })() }))
        .slice(0, 100);
      // each entry also carries the wf_ run id the CARD learned from the launch ack (2.369.147:
      // the status bar hands a Workflow to the ⛭ chip — the EXISTING workflow display — not to
      // the generic background-task rows; owner: "没办法和已有的工作流展示方案接起来吗")
      this._bgTasks = set;
      // THE SET NAMES A CARD, NOT A KEY (lane Q verify, 2026-09-26): a Workflow
      // card holds TWO keys in taskMsgByTaskId — the CLI's short task id (from
      // task_started) and the wf_ run id its launch ack registered (2.369.122) —
      // and the set names only the short one. Judged per KEY, the run-id key was
      // "not named" and closed the very card the short key had just kept open:
      // every level set soft-closed a running Workflow (the 2.369.147 已完成
      // symptom) and /api/workflow stopped counting its tree. A card is named
      // when ANY of its keys is.
      const named = new Set();
      for (const t of set) { const msgId = this.taskMsgByTaskId.get(t.id); if (msgId) named.add(msgId); }
      for (const msgId of new Set(this.taskMsgByTaskId.values())) {
        const m = this.messageIndex.get(msgId);
        if (!m?.taskInfo) continue;
        if (named.has(msgId)) {
          // THE SET NAMES IT AGAIN ⇒ THE SOFT CLOSE WAS A TRANSIENT DROP (2.369.147,
          // owner: a running Workflow card said 已完成 while the same run sat in the
          // popup as an unclickable "reported by the harness" row): the CLI omits a
          // member for a record or two around its own phase changes; a level close
          // is a GUESS, and the set is stronger evidence than the guess — reopen.
          if (m.taskInfo.status === 'finished' && m.taskInfo.closedBy === 'level') {
            m.taskInfo.status = 'running'; delete m.taskInfo.closedBy;
            if (emit) this._emit({ op: 'edit', id: m.id, fields: { taskInfo: m.taskInfo } });
          }
        } else if (m.taskInfo.status === 'running' && m.taskInfo.backgrounded === true) {
          m.taskInfo.status = 'finished';
          m.taskInfo.closedBy = 'level';
          if (emit) this._emit({ op: 'edit', id: m.id, fields: { taskInfo: m.taskInfo } });
        }
      }
      if (emit) this._emit({ op: 'meta', subtype: 'background-tasks', data: { tasks: set } });
      return;
    }
    // A TASK PATCH (`system`/`task_updated` {task_id, patch:{status, end_time}}):
    // closes a failed/stopped task the moment the CLI says so, without waiting
    // for a task_notification that may never come. It OVERRIDES a level close
    // (`closedBy:'level'` is a guess; this is the harness's own verdict).
    if (raw.subtype === 'task_updated' && raw.task_id != null && raw.patch && typeof raw.patch === 'object') {
      const st = typeof raw.patch.status === 'string' ? raw.patch.status.slice(0, 24) : null;
      const m = this._taskMsgFor(null, raw.task_id);
      if (m?.taskInfo && st && st !== 'running' && st !== 'pending' && (m.taskInfo.status === 'running' || m.taskInfo.closedBy === 'level')) {
        m.taskInfo.status = st;
        m.taskInfo.closedBy = 'task_updated';
        if (emit) this._emit({ op: 'edit', id: m.id, fields: { taskInfo: m.taskInfo } });
      }
      return;
    }
    // A CODE CHANGE WENT OUT FOR REVIEW (`system`/`code_change_published`,
    // binary: "URL unverified — do not route authenticated calls to it").
    if (raw.subtype === 'code_change_published') { this._processCodeChange(raw, emit); return; }

    // BREADCRUMB for CLI evolution (2.227.5, the model_refusal_fallback
    // lesson): an unhandled system subtype is DROPPED here — that is how a
    // new upstream record type becomes an invisible product gap (39 silent
    // model switches before a user noticed). Name-only telemetry, deduped per
    // process, so the NEXT new subtype shows up in Diagnostics instead of
    // waiting for a report. Add the handler, then it stops firing.
    if (raw.subtype && !HANDLED_SYSTEM_SUBTYPES.has(raw.subtype) && !raw.tool_use_id) {
      if (!MessageManager._seenUnknownSubtypes.has(raw.subtype)) {
        MessageManager._seenUnknownSubtypes.add(raw.subtype);
        try { global.__vsEvent?.('cli-unknown-system-subtype', String(raw.subtype).slice(0, 60)); } catch {}
      }
      if (!KNOWN_IGNORED_SYSTEM_SUBTYPES.has(raw.subtype)) this._noteUnknownRecord('system', raw.subtype, raw, emit); // 2.369.119: a card, not a breadcrumb
    }

    // Task lifecycle → edit existing tool message. Resolution goes through
    // the task index FIRST — pendingToolCalls only helps for task_started
    // (the tool_result hasn't arrived yet then) and is EMPTY by the time a
    // completion lands (see the constructor note).
    if (raw.tool_use_id) {
      const existing = this._taskMsgFor(raw.tool_use_id, raw.task_id);
      if (!existing) return;

      if (raw.subtype === 'task_started') {
        // `backgrounded` = the CLI's own is_backgrounded flag (a FOREGROUND call —
        // is_backgrounded:false, e.g. a plain Bash — gets task_started too but is
        // never a member of background_tasks_changed, so only a backgrounded
        // task may be closed by that level set; the launch-ack synthesis below
        // sets it as well, because the ack text itself says "in background")
        // MERGE, never replace (2.369.147 r3, owner: the View Workflow window said "valid runId
        // required"): on a rebuild the launch ACK (transcript) lands BEFORE the replayed
        // task_started (session-meta taskRecords), and this line used to overwrite the ack's
        // synthesis — the wf_ run id, the summary line, the type — with the CLI's short id,
        // so a Workflow card lost its run id and its name. Keep the prior fields; a prior id
        // that IS a run id moves to runId; the ack's type wins (2.369.139).
        const prior = existing.taskInfo && typeof existing.taskInfo === 'object' ? existing.taskInfo : null;
        const next = { ...(prior || {}), id: raw.task_id, type: (prior && prior.type) || normalizeTaskType(raw.task_type), description: raw.description || (prior && prior.description) || '', status: 'running', backgrounded: raw.is_backgrounded === true || !!(prior && prior.backgrounded === true) };
        if (prior && prior.id != null && /^wf_/.test(String(prior.id)) && String(prior.id) !== String(raw.task_id) && !next.runId) next.runId = String(prior.id);
        delete next.closedBy;
        // the task's own record says it is alive — WHEN (lane Q verify, 2026-09-26)
        { const at = this._taskRecordAt(emit); if (at) next.aliveAt = at; }
        existing.taskInfo = next;
        this.taskMsgByToolUse.set(raw.tool_use_id, existing.id);
        if (raw.task_id != null) { this.taskMsgByTaskId.set(String(raw.task_id), existing.id); this._adoptHelperOrphans(String(raw.task_id), emit); } // lane S1: a helper's ask held for this id lands on its card
        if (emit) this._emit({ op: 'edit', id: existing.id, fields: { taskInfo: existing.taskInfo } });
      } else if (raw.subtype === 'task_progress') {
        if (existing.taskInfo) {
          // progress IS liveness: a card the level set closed softly is running (2.369.147)
          if (existing.taskInfo.status === 'finished' && existing.taskInfo.closedBy === 'level') { existing.taskInfo.status = 'running'; delete existing.taskInfo.closedBy; }
          // …and WHEN it was alive (lane Q verify, 2026-09-26): /api/workflow counts
          // the tree as proof of life only while this is fresh (src/workflow-disk.js
          // treeAlive) — a replayed record keeps its own arrival time, so a run that
          // stalled days ago is not "running" again after every restart
          { const at = this._taskRecordAt(emit); if (at) existing.taskInfo.aliveAt = at; }
          if (raw.description) existing.taskInfo.description = raw.description;
          if (raw.last_tool_name) existing.taskInfo.lastTool = raw.last_tool_name;
          // `summary` = the run's meta.description (a Workflow) — the NAME the
          // chips show when the launch ack carried none (2.369.136).
          if (typeof raw.summary === 'string' && raw.summary.trim() && !existing.taskInfo.summary) existing.taskInfo.summary = raw.summary.trim().slice(0, 160);
          // LIVE DETAIL (2.369.118): the record also carries `usage` and — for a
          // Workflow — the `workflow_progress` tree (phases + agents with label /
          // state / lastToolName). The tree is INTERMITTENT (heartbeats omit it),
          // so it is latest-value FIELD-WISE: a payload without it keeps the tree
          // already held. Live stream only — the transcript never carries
          // task_progress, so the chips are a live-session affordance and the
          // post-hoc View Workflow window stays the history surface.
          if (raw.usage && typeof raw.usage === 'object') existing.taskInfo.usage = { totalTokens: raw.usage.total_tokens ?? null, toolUses: raw.usage.tool_uses ?? null, durationMs: raw.usage.duration_ms ?? null };
          const wf = normalizeWorkflowProgress(raw.workflow_progress);
          if (wf) existing.taskInfo.workflow = wf;
          if (emit) this._emit({ op: 'edit', id: existing.id, fields: { taskInfo: existing.taskInfo } });
        }
      } else if (raw.subtype === 'task_notification') {
        if (existing.taskInfo) {
          // the record's own status when it is a declared terminal value (failed /
          // stopped / killed); anything else closes as completed, as before. This
          // is the real outcome — it overwrites a level-set guess (`finished`).
          const st = typeof raw.status === 'string' && TERMINAL_TASK_STATUS.has(raw.status) ? raw.status : 'completed';
          existing.taskInfo.status = st;
          existing.taskInfo.closedBy = 'notification';
          if (emit) this._emit({ op: 'edit', id: existing.id, fields: { taskInfo: existing.taskInfo } });
        }
      }
    }
  }

  /** THE SAFETY STOP CARD (lane classifier-stop-card): ONE card per stop,
   *  whichever of the CLI's two records lands first — the notice (names the
   *  model) or the nudge (the model-only text). The other half MERGES into the
   *  open card of the same turn (an edit op); a half the open card already
   *  holds is the next stop, a card of its own. */
  _safetyStopCard(half, emit) {
    const open = this._openSafetyStop && this._openSafetyStop.turn === this.turnIndex ? this.messageIndex.get(this._openSafetyStop.id) : null;
    const b = open && open.content && open.content[0];
    if (b && (half.notice ? !b.notice : !b.nudge)) {
      Object.assign(b, half);
      this._openSafetyStop = null;
      if (emit) this._emit({ op: 'edit', id: open.id, fields: { content: open.content } });
      return;
    }
    const msg = this._create({ role: 'system', status: 'complete', noticeKind: 'safety-stop', content: [{ type: 'safety_stop', notice: null, model: null, noticeRow: null, nudge: null, nudgeRow: null, ...half }] });
    this._openSafetyStop = { id: msg.id, turn: this.turnIndex };
    if (emit) this._emit({ op: 'create', message: msg });
  }

  /** ONE small card per published change ("PR #608 pushed"), the link ESCAPED
   *  by the renderer and never auto-opened. Unified across both carriers: the
   *  live `code_change_published` record and the transcript's `pr-link` row
   *  name the same fact, so the SAME url in one session is ONE card — a later
   *  record with a new action (merged / closed) edits it in place. The server
   *  consumer owns the session meta (`prLinks[]` → the card chip). */
  _processCodeChange(raw, emit) {
    const url = typeof raw.url === 'string' && /^https?:\/\//i.test(raw.url) ? raw.url.slice(0, 500) : null;
    const identifier = raw.identifier != null && String(raw.identifier).trim() ? String(raw.identifier).slice(0, 40) : null;
    if (!url && !identifier) return;
    const block = {
      type: 'code_change', provider: typeof raw.provider === 'string' ? raw.provider.slice(0, 32) : null, url, repo: typeof raw.repo === 'string' ? raw.repo.slice(0, 200) : null,
      identifier, action: typeof raw.action === 'string' ? raw.action.slice(0, 32) : null, branch: typeof raw.branch === 'string' ? raw.branch.slice(0, 200) : null,
    };
    // dedupe key: the url, else repo#identifier (provider#identifier as a last resort); a row with
    // neither url nor repo is never deduped — '#42' from two unknown repos is two facts, not one
    const key = url || (block.repo || block.provider ? (block.repo || block.provider) + '#' + identifier : null);
    const cards = this._codeChangeCards || (this._codeChangeCards = new Map());
    const prev = key ? cards.get(key) : null;
    if (prev) {
      const m = this.messageIndex.get(prev);
      if (m) {
        const b = m.content[0];
        let changed = false;
        for (const k of ['action', 'branch', 'provider', 'repo', 'identifier', 'url']) if (block[k] && block[k] !== b[k]) { b[k] = block[k]; changed = true; }
        if (changed && emit) this._emit({ op: 'edit', id: m.id, fields: { content: m.content } });
      }
      return;
    }
    const msg = this._create({ role: 'system', status: 'complete', noticeKind: 'code-change-published', content: [block] });
    if (key) cards.set(key, msg.id);
    if (emit) this._emit({ op: 'create', message: msg });
  }

  /** The harness's LAST published set of live background tasks (the level signal) — what the
   *  attach payload hands a window that opens mid-run. null = never published. */
  backgroundTasks() { return Array.isArray(this._bgTasks) ? this._bgTasks : null; }

  /** THE command-list op — one shape for the init frame and for every
   *  mid-session push, mirrored by the ACP normalizer's
   *  `available_commands_update` so the client has ONE path (the design's
   *  "no local/remote twin"). `terminal` is the terminal-BOUND subset the
   *  composer must hide; an empty array means "the CLI named none", which is
   *  as true an answer as a populated one. */
  _emitSlashCommands(commands, terminal) {
    const names = strList(commands, 200);
    if (!names) return;
    this._emit({ op: 'meta', subtype: 'slash-commands', data: { commands: names, terminal: strList(terminal, 100) || [] } });
  }

  /** Close the task a <task-notification> payload names (status + summary).
   *  ONE closer for every transport the notification rides: the idle-wake
   *  user record, the mid-turn queued_command attachment, and the
   *  queue-operation records (2.368.31, owner "又开始出现大量已经完成的任务
   *  显示成在进行了": a BUSY agent's completions are persisted ONLY as
   *  queue-operation + attachment records — never as the idle user record
   *  the 2.233.0 closer read, so most tasks never closed after a rebuild). */
  _closeTaskFromNotification(contentStr, emit) {
    const tuMatch = contentStr.match(/<tool-use-id>([\s\S]*?)<\/tool-use-id>/);
    const tidMatch = contentStr.match(/<task-id>([\s\S]*?)<\/task-id>/);
    const stMatch = contentStr.match(/<status>([\s\S]*?)<\/status>/);
    // Lookup via the task index — NOT pendingToolCalls, whose entry the
    // background task's own tool_result deleted minutes before this
    // notification arrived (2.368.15: the reason every conversation
    // accumulated forever-'running' cards despite the 2.233.0 closer).
    const taskMsg = this._taskMsgFor(tuMatch ? tuMatch[1].trim() : null, tidMatch ? tidMatch[1].trim() : null);
    // a level-set close (`finished`, closedBy 'level') is a guess the real outcome overwrites
    if (taskMsg?.taskInfo && (taskMsg.taskInfo.status === 'running' || taskMsg.taskInfo.closedBy === 'level')) {
      const st = (stMatch ? stMatch[1].trim() : 'completed').toLowerCase();
      taskMsg.taskInfo.status = st === 'completed' ? 'completed' : (st || 'completed');
      taskMsg.taskInfo.closedBy = 'notification';
      const smMatch = contentStr.match(/<summary>([\s\S]*?)<\/summary>/);
      if (smMatch) taskMsg.taskInfo.summary = smMatch[1].trim().slice(0, 200);
      if (emit) this._emit({ op: 'edit', id: taskMsg.id, fields: { taskInfo: taskMsg.taskInfo } });
    }
  }

  /** Find the tool message a task-lifecycle signal refers to: task index →
   *  pendingToolCalls (pre-result window) → task-id fallback. */
  /** The live taskInfo of a background task/workflow by its task id (a Workflow's runId) —
   *  what /api/workflow merges over the disk skeleton so the View Workflow window says
   *  what the chat card says (2.369.119). null when this normalizer holds no such task. */
  taskInfoById(taskId) {
    const msgId = taskId != null && this.taskMsgByTaskId.get(String(taskId));
    const m = msgId ? this.messageIndex.get(msgId) : null;
    return m && m.taskInfo ? m.taskInfo : null;
  }

  _taskMsgFor(toolUseId, taskId) {
    const viaTask = toolUseId && this.taskMsgByToolUse.get(toolUseId);
    if (viaTask) return this.messageIndex.get(viaTask) || null;
    const pending = toolUseId && this.pendingToolCalls.get(toolUseId);
    if (pending) return this.messageIndex.get(pending.msgId) || null;
    const viaId = taskId != null && this.taskMsgByTaskId.get(String(taskId));
    if (viaId) return this.messageIndex.get(viaId) || null;
    // THE CARD BY ITS OWN ID (lane S1): a tool card's id is minted from its call id
    // (`<session>:t:<tool_use_id>`), so a task record naming the call finds the card
    // even when no index holds it — the restart's task REPLAY after a background
    // helper's launch ack completed the call (the ack's text blocks are an array in
    // real records, so the ack synthesis never indexed an Agent card; measured on
    // 2.1.281 and in this instance's own transcripts) found nothing, and the card
    // never learned its helper — nor its helper's pending ask.
    const byId = toolUseId ? this.messageIndex.get(`${this.sessionId}:t:${toolUseId}`) : null;
    return byId && byId.role === 'tool' ? byId : null;
  }

  _processAttachment(raw, emit) {
    const a = raw.attachment;
    if (!a) return;
    // Mid-turn user messages ("sent while you were working") are recorded in
    // the JSONL ONLY as queued_command attachments — never as user records.
    // Dropping them (pre-2.88.0) ERASED the user's own words from any history
    // rebuilt from the JSONL (restart re-normalization, resume under another
    // account, view-only) — a real 211-records-in-one-session data-visibility
    // loss. Render as a normal user message; dedup against the live-send echo
    // (same text sent via chat-input lands in the buffer too).
    if (a.type === 'queued_command') {
      // prompt is an ARRAY of blocks for the user's own mid-turn messages,
      // but a plain STRING for mid-turn PEER deliveries (2.351.2 forensics:
      // a queued cross-session message is JSONL-only — attachment/
      // queued_command with origin:{kind:'peer'} and a string prompt; the
      // array-only filter made every one of them invisible)
      const blocks = typeof a.prompt === 'string'
        ? (a.prompt.trim() ? [{ type: 'text', text: a.prompt }] : [])
        : (Array.isArray(a.prompt) ? a.prompt : [])
          .filter((b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim())
          .map((b) => ({ type: 'text', text: b.text }));
      const text = blocks.map((b) => b.text).join('');
      if (!text.trim()) return;
      // Mid-turn task completion (2.368.31): the notification rides THIS
      // attachment when the agent was busy — close the task and render the
      // notification card (provenance law: never a "You" bubble of XML).
      if (/^\s*<task-notification>/.test(text)) {
        this._closeTaskFromNotification(text, emit);
        this.turnIndex++;
        const nmsg = this._create({ role: 'user', status: 'complete', content: blocks, turnIndex: this.turnIndex });
        nmsg.originKind = 'task-notification';
        if (emit) this._emit({ op: 'create', message: nmsg });
        return;
      }
      for (let i = this.messages.length - 1, seen = 0; i >= 0 && seen < 12; i--, seen++) {
        const m = this.messages[i];
        if (m.role === 'user' && (m[PEER_RECORDED] || (m.content || []).map((b) => b.text || '').join('')) === text) return;
      }
      if (a.origin?.kind === 'peer' && a.origin.msg_id && this._peerMsgIds.has(a.origin.msg_id)) return; // already rendered (msg_id is authoritative)
      this.turnIndex++;
      const msg = this._create({ role: 'user', status: 'complete', content: blocks, turnIndex: this.turnIndex });
      if (a.origin?.kind === 'peer') {
        // same provenance law as the idle-wake user record — render the
        // peer card, never a "You" bubble of someone else's words
        msg.originKind = 'peer-message';
        applyPeerOrigin(msg, peerOriginOf(a.origin, text), text);
        this._notePeerMsgId(a.origin.msg_id);
      } else {
        msg.typed = true; // the user's own words — never a notification card
      }
      if (emit) this._emit({ op: 'create', message: msg });
      return;
    }
    if (a.type === 'goal_status') {
      this._goalState = { condition: a.condition || '', met: !!a.met, sentinel: !!a.sentinel };
      if (emit) this._emit({ op: 'meta', subtype: 'goal_status', data: this._goalState });
      return;
    }
    // The CANONICAL carrier of injected context is its OWN attachment type —
    // {type:'hook_additional_context', content:[strings]} (no hookName). This
    // was the missing piece behind "hook注入的context看不到" (user report).
    if (a.type === 'hook_additional_context') {
      const text = (Array.isArray(a.content) ? a.content : [a.content]).filter((x) => typeof x === 'string').join('\n').trim();
      if (!text) return;
      const prior = this._lastHookCard;
      if (prior && prior.outHead && text.slice(0, 200) === prior.outHead && Math.abs(this._currentTs - prior.ts) < 5000) return; // same payload already shown via the hook's stdout card
      const tag = (text.match(/^<([\w-]+)/) || [])[1] || null;
      const msg = this._create({
        role: 'system', status: 'complete',
        content: [{ type: 'system_info', text: `✓ Hook context${tag ? `: ${tag}` : ''}`, hookData: { name: tag || 'injected context', event: null, outcome: 'context', exitCode: null, output: text } }],
      });
      this._lastHookCard = { name: tag || 'injected context', ts: this._currentTs, msgId: msg.id, outHead: text.slice(0, 200) };
      if (emit) this._emit({ op: 'create', message: msg });
      return;
    }
    // Hook attachments (JSONL-only) carry the FULL per-hook record — name,
    // event, stdout (incl. any injected additionalContext). Without this,
    // history replay showed only the bare "N hooks ran" summary (user report).
    if (a.type === 'hook_success' || a.type === 'hook_failure' || a.type === 'hook_error' || a.type === 'hook_system_message') {
      const isSys = a.type === 'hook_system_message';
      const name = a.hookName || a.hookEvent || 'hook';
      const ok = a.type === 'hook_success' || isSys;
      // stderr counts only for FAILED hooks — successful plugins routinely spew
      // warnings there (Node ExperimentalWarning etc.), which is noise. content
      // can be a LIST of strings (harness content blocks) — flatten it.
      const contentStr = Array.isArray(a.content) ? a.content.filter((x) => typeof x === 'string').join('\n') : a.content;
      const raw = [contentStr, a.stdout, ...(ok ? [] : [a.stderr])].filter((x) => typeof x === 'string' && x.trim()).join('\n');
      // Unwrap the machine ack: hook stdout is usually a protocol JSON like
      // {"continue":true,"suppressOutput":true} — the only human-relevant part
      // is hookSpecificOutput.additionalContext (or a block decision/reason).
      const output = hookPayloadText(raw) || (ok ? '' : raw); // full output — never truncated (expandable card + scroll cap handle size)
      // Live/replay double-render dedup — the two copies are ASYMMETRIC: the
      // stdout hook_response usually has NO output while the JSONL attachment
      // carries the FULL injected context. Skipping the newcomer blindly hid
      // every injected context (user report) — UPGRADE the existing card when
      // the newcomer knows more.
      const prior = this._lastHookCard;
      const sameContent = prior && prior.outHead && output && output.slice(0, 200) === prior.outHead;
      if (prior && (prior.name === name || sameContent) && Math.abs(this._currentTs - prior.ts) < 5000) {
        if (output && prior.msgId != null) {
          const ex = this.messageIndex.get(prior.msgId);
          const exOut = ex?.content?.[0]?.hookData?.output || '';
          if (ex && output.length > exOut.length) {
            ex.content[0].hookData.output = output;
            if (emit) this._emit({ op: 'edit', id: ex.id, fields: { content: ex.content } });
          }
        }
        return;
      }
      // Empty SUCCESSFUL hooks are pure noise (PostToolUse etc. fire per tool
      // call with no output — user report: chat flooded with blank hook cards).
      // Failures always show. Overridable via chat.hideEmptyHooks (2.80.0).
      const hideEmpty = !MessageManager.getSetting || MessageManager.getSetting('chat.hideEmptyHooks') !== false;
      if (ok && !output && hideEmpty) return;
      const msg = this._create({
        role: 'system', status: ok ? 'complete' : 'error',
        content: [{ type: 'system_info', text: `${ok ? '✓' : '✗'} Hook: ${isSys ? (name !== 'hook' ? name + ' ' : '') + 'message' : name}`, hookData: { name, event: a.hookEvent || null, outcome: a.type, exitCode: a.exitCode ?? null, output } }],
      });
      this._lastHookCard = { name, ts: this._currentTs, msgId: msg.id };
      if (emit) this._emit({ op: 'create', message: msg });
    }
  }

  // goalState / queueState / queuePublished / queueVerbsPublished =
  // MessageWindow's: claude publishes NO queue (the CLI queues stdin itself;
  // backend-caps inputModes {queue:true, queueVerbs:[]}), so they answer [] /
  // false / null — null = "named no verb list", not "serves none".

  _processUser(raw, emit) {
    this._finalizeStreaming(emit);
    const content = raw.message?.content;
    if (!content) return;
    const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content) }];

    // Check for tool results
    const toolResults = blocks.filter(b => b.type === 'tool_result');
    const textBlocks = blocks.filter(b => b.type !== 'tool_result');

    // Merge tool results into pending tool messages
    for (const tr of toolResults) {
      const toolUseId = tr.tool_use_id;
      const pending = this.pendingToolCalls.get(toolUseId);
      if (!pending) continue;
      const existing = this.messageIndex.get(pending.msgId);
      if (!existing) continue;

      // BINARY NEVER ENTERS A CARD (2.369.35, owner: two windows frozen): a Read
      // of a PNG returns the image as a base64 block; stringifying it put a
      // ~600KB blob into `output` TEXT — 78 such cards = a 12MB attach payload and
      // the renderer (escHtml/linkify over base64) froze the whole page. Images
      // leave as {mediaType, bytes} metadata; the renderer shows the FILE (the
      // Read path is on disk) instead of the bytes.
      const split = splitToolResultContent(tr.content);
      const resultText = split.text;
      const ackText = toolResultText(tr.content); // B-63f1: the launch ack is a TEXT-BLOCK LIST in every real record — its words, never the card's JSON
      existing.status = tr.is_error ? 'error' : 'complete';
      existing.toolStatus = tr.is_error ? 'error' : 'ok';
      // A tool_result implies the pending permission was answered. The
      // control_response only exists in server memory (it goes to claude's
      // STDIN — the wrapper's .buf tees stdout only), so a restart-rebuilt
      // history is request-without-response and the card would render
      // awaiting-approval forever (real report: an answered AskUserQuestion
      // questionnaire stuck interactive). Mirror of the completed-before-
      // request auto-resolve in _processControlRequest. Emit `permission`
      // ONLY when newly resolved HERE — unconditionally re-emitting a
      // long-resolved permission made the live completion edit re-append the
      // "✓ Allowed" chip renderToolMsg deliberately omits AND clobbered the
      // client's selectedAnswers (review-confirmed).
      let permResolved = false;
      if (existing.permission && !existing.permission.resolved) {
        existing.permission.resolved = this._resolutionFromResult(resultText, tr.is_error);
        if (existing.permission.resolved === 'unknown') { existing.permission.unknownHead = outcomeHead(resultText); this._noteOutcomeDrift(resultText, emit); } // verify r5
        permResolved = true;
      }
      if (this._autoAllowLines) this._autoAllowRefused(toolUseId, resultText, tr.is_error, emit); // lane bypass-no-prompts
      // Replace tool_call content with tool_result (keeps input + adds output)
      existing.content = [{
        type: 'tool_result', toolCallId: toolUseId, toolName: pending.block.name,
        input: pending.block.input, output: resultText, status: tr.is_error ? 'error' : 'ok',
        ...(split.images.length ? { images: split.images } : {}),
      }];
      if (emit) this._emit({ op: 'edit', id: existing.id, fields: { status: existing.status, toolStatus: existing.toolStatus, content: existing.content, ...(permResolved ? { permission: existing.permission } : {}) } });
      // LAUNCH-ACK taskInfo synthesis (2.368.30): works on HISTORY too (the
      // stream-only task_started never persists), so resumed sessions get
      // running/completed background cards again; a live task_started that
      // follows overwrites the same shape harmlessly.
      if (!existing.taskInfo && !tr.is_error) {
        const syn = parseBackgroundLaunch(pending.block.name, pending.block.input, ackText);
        if (syn) {
          // SUPERSEDE (the wf_768b7abd residual): a Workflow resumed via
          // resumeFromRunId re-launches under the SAME run id — the resume's
          // completion notification closes the resume card only, so the
          // original launch stayed 'running' forever. A re-launch of the same
          // task id supersedes the earlier card.
          const prevId = syn.id && this.taskMsgByTaskId.get(String(syn.id));
          if (prevId && prevId !== existing.id) {
            const prev = this.messageIndex.get(prevId);
            if (prev?.taskInfo?.status === 'running') {
              prev.taskInfo.status = 'completed';
              if (emit) this._emit({ op: 'edit', id: prev.id, fields: { taskInfo: prev.taskInfo } });
            }
          }
          existing.taskInfo = { ...syn, status: 'running', backgrounded: true }; // the ack text says "in background" — a member of the level set
          this.taskMsgByToolUse.set(toolUseId, existing.id);
          if (syn.id) { this.taskMsgByTaskId.set(String(syn.id), existing.id); this._adoptHelperOrphans(String(syn.id), emit); }
          if (emit) this._emit({ op: 'edit', id: existing.id, fields: { taskInfo: existing.taskInfo } });
        }
      } else if (existing.taskInfo && !tr.is_error) {
        // LIVE ORDER (2.369.122, owner: "这个还是没同步啊"): on the live stream the
        // system/task_started (SHORT task_id, e.g. 'wu93ghxi2') lands BEFORE the
        // tool_result that carries the ack ("Run ID: wf_…"), so the synthesis above
        // was skipped and the wf_ run id was never registered — /api/workflow's
        // taskInfoById(runId) found nothing and the View Workflow window stayed
        // on the disk skeleton. Register the ack's id too, and remember it on the
        // card as runId (the short id stays `id` — the CLI's own key).
        const syn = parseBackgroundLaunch(pending.block.name, pending.block.input, ackText);
        if (syn && existing.taskInfo.backgrounded !== true) { existing.taskInfo.backgrounded = true; if (emit) this._emit({ op: 'edit', id: existing.id, fields: { taskInfo: existing.taskInfo } }); }
        // the ack's own TYPE wins over whatever task_started spelled (2.369.139)
        if (syn && syn.type && existing.taskInfo.type !== syn.type) { existing.taskInfo.type = syn.type; if (emit) this._emit({ op: 'edit', id: existing.id, fields: { taskInfo: existing.taskInfo } }); } // the ack says background even when task_started lacked the flag (older CLI)
        if (syn && syn.id && String(syn.id) !== String(existing.taskInfo.id)) {
          this.taskMsgByTaskId.set(String(syn.id), existing.id); this._adoptHelperOrphans(String(syn.id), emit);
          if (!existing.taskInfo.runId) {
            existing.taskInfo.runId = syn.id;
            if (emit) this._emit({ op: 'edit', id: existing.id, fields: { taskInfo: existing.taskInfo } });
          }
        }
      }
      // harness TaskCreate: "Task #N created successfully" carries the id
      const subj = this._pendingTaskCreates?.get(toolUseId);
      if (subj && !tr.is_error) {
        const m = resultText.match(/#(\d+)/);
        if (m) {
          (this._harnessTasks = this._harnessTasks || new Map())
            .set(m[1], { id: m[1], content: `#${m[1]} ${subj}`, status: 'pending', activeForm: subj });
          this._emitHarnessTodos(emit);
        }
        this._pendingTaskCreates.delete(toolUseId);
      }
      this.pendingToolCalls.delete(toolUseId);
    }

    // Real user message (has text content, not just tool results)
    if (textBlocks.length > 0 || toolResults.length === 0) {
      // Skip if this is a pure tool-result message (no user text)
      const hasText = textBlocks.some(b => (b.type === 'text' && b.text?.trim()) || b.type === 'image');
      if (!hasText && toolResults.length > 0) return;

      const normalizedContent = textBlocks.map(b => {
        if (b.type === 'text') return { type: 'text', text: b.text || '' };
        if (b.type === 'image') return { type: 'image', mediaType: b.source?.media_type || 'image/png', data: b.source?.data || '' };
        return null;
      }).filter(Boolean);

      if (normalizedContent.length === 0) return;
      // CLI-injected page images (Read on a PDF): the CLI ships the extracted
      // pages as image-only user records — LIVE as one isSynthetic record PER
      // PAGE, in the JSONL as one isMeta record with N image blocks. They are
      // model context, not the user speaking: unflagged, the live burst
      // rendered one bare "notification" stub per page (real report: a
      // 10-page Read → 10 empty cards) and the history rebuild a giant "You"
      // bubble. Coalesce consecutive page events into ONE imageAttachment
      // message (no turnIndex bump — not a conversation turn) so both paths
      // converge on a single compact card.
      const isPageImages = !raw.promptSource && !raw._fromWebui && (raw.isSynthetic || raw.isMeta)
        && normalizedContent.every(b => b.type === 'image');
      if (isPageImages) {
        const last = this.messages[this.messages.length - 1];
        if (last && last.imageAttachment) {
          last.content = last.content.concat(normalizedContent);
          if (emit) this._emit({ op: 'edit', id: last.id, fields: { content: last.content, status: 'complete' } });
          return;
        }
        const att = this._create({ role: 'user', status: 'complete', content: normalizedContent, turnIndex: this.turnIndex });
        att.imageAttachment = true;
        att.synthetic = true;
        if (emit) this._emit({ op: 'create', message: att });
        return;
      }

      // THE SAFETY STOP'S NUDGE (lane classifier-stop-card): the CLI's note to the
      // MODEL after a classifier stop (isMeta + turnCompanion in the transcript,
      // isSynthetic on the stream) rendered as a "You" bubble in history and a
      // bare notification live, and counted as a turn. Read from the census TEXT
      // (a transport may drop the flags; the flags only widen who is asked): it
      // joins the stop card's expander — no bubble, no turn. A sentence the user
      // TYPED (promptSource / ours, no meta stamp) or a delivery stays itself.
      if (!raw.origin && (raw.isMeta === true || raw.isSynthetic === true || raw.turnCompanion === true || !(raw.promptSource || raw._fromWebui))
          && normalizedContent.every((b) => b.type === 'text')) {
        const nudge = safetyStopOf(normalizedContent.map((b) => b.text).join(''));
        if (nudge && nudge.kind === 'nudge') { this._safetyStopCard({ nudge: normalizedContent.map((b) => b.text).join('').trim().slice(0, 4000), nudgeRow: nudge.row.id }, emit); return; }
      }

      // A peer record whose msg_id is already on screen (the turn-start card,
      // inc-mu6bfv1t-4drq; or the device stream filling a gap the parse already
      // rendered) is the SAME message — never a second card.
      if (raw.origin?.kind === 'peer' && raw.origin.msg_id && this._peerMsgIds.has(raw.origin.msg_id)) return;
      this.turnIndex++;
      // Use original msgId if present (for dedup with client-side local preview)
      const msg = this._create({ role: 'user', status: 'complete', content: normalizedContent, turnIndex: this.turnIndex });
      // Provenance for the notification classifier: promptSource = the CLI's
      // marker on HUMAN-submitted prompts (JSONL 'sdk'; our own live sends
      // stamp it too), isSynthetic = CLI-synthesized records (hook feedback on
      // the live stream). A user who literally types "Stop hook feedback: …"
      // must NOT get their message demoted to a dim notification card.
      // EXCEPT (2.229.2, real report "看不到后台任务唤醒"): the CLI stamps
      // promptSource:"sdk" on SYSTEM-GENERATED deliveries too — a background
      // task completing wakes the agent with a `<task-notification>` user
      // record whose authoritative marker is top-level origin.kind. typed
      // made it render as the USER'S OWN words (a "You" bubble of sanitized
      // XML ≈ invisible), so the wakeup had no trace in the chat. origin
      // wins over promptSource; the text-shape check covers transports that
      // drop the origin field.
      const contentStr = typeof raw.message?.content === 'string' ? raw.message.content : '';
      const isTaskNotif = raw.origin?.kind === 'task-notification' || /^\s*<task-notification>/.test(contentStr);
      if (isTaskNotif) {
        msg.originKind = 'task-notification';
        // CLOSE THE TASK LIFECYCLE (2.233.0, real report "popup 20条无完成
        // 状态"): in the current harness a background task's COMPLETION
        // signal is THIS user record — the system/task_notification subtype
        // that used to remove tasks from the status-bar tracker never
        // arrives for them, so tasks only accumulated. The wakeup names its
        // <tool-use-id> and <status>; route them into the same taskInfo
        // edit the old path used.
        this._closeTaskFromNotification(contentStr, emit);
      }
      else if (raw.origin?.kind === 'peer') {
        // Cross-session PEER message (2.349.0, owner report "announce了但对话
        // 框里什么都看不到"): a Background-Work notify / another session's
        // SendMessage wakes this conversation as a user record with
        // origin.kind='peer' (+ isMeta), which fell into the invisible-meta
        // path — the turn appeared to start from nothing. Same provenance law
        // as task-notification: origin.kind wins, render a distinct card.
        msg.originKind = 'peer-message';
        const said = (raw.message && (typeof raw.message.content === 'string' ? raw.message.content : (raw.message.content || []).map((b) => b.text || '').join('\n'))) || '';
        applyPeerOrigin(msg, peerOriginOf(raw.origin, said), said);
        this._notePeerMsgId(raw.origin.msg_id);
      }
      else if (raw.originKind === 'auto-resume') { msg.originKind = 'auto-resume'; msg.typed = false; if (typeof raw.originNote === 'string' && raw.originNote) msg.originNote = raw.originNote; } // VibeSpace's own continue prompt (auto-resume) — labelled, never a "you typed this" bubble (2.369.32)
      else if (raw.promptSource || raw._fromWebui) msg.typed = true;
      if (raw.isSynthetic) msg.synthetic = true;
      if (emit) this._emit({ op: 'create', message: msg });
    }
  }

  _processAssistant(raw, emit) {
    const content = raw.message?.content;
    if (!Array.isArray(content) || !content.length) return;

    // Per-turn serving model — lets the UI detect silent auto-fallback
    // (harness swapped models mid-session; e.g. fable-5 → opus under load).
    const servedModel = raw.message?.model;
    // Per-message metadata for the left-strip right-click popup: which model
    // actually served this record, its token usage, and the request identity.
    const recMeta = {
      model: (servedModel && servedModel !== '<synthetic>') ? servedModel : null,
      usage: raw.message?.usage || null,
      requestId: raw.requestId || null,
      msgId: raw.message?.id || null,
      stopReason: raw.message?.stop_reason || null,
    };
    if (servedModel && servedModel !== '<synthetic>' && emit && servedModel !== this._lastServedModel) {
      this._lastServedModel = servedModel;
      this._emit({ op: 'meta', subtype: 'served-model', data: { model: servedModel } });
    }

    for (const block of content) {
      // Explicit fallback marker the CLI writes when it auto-switches models:
      // { type:'fallback', from:{model}, to:{model} } — surface it as a notice.
      if (block.type === 'fallback' && (block.from?.model || block.to?.model)) {
        const from = block.from?.model || '?', to = block.to?.model || '?';
        // Text kept as an English fallback; the CLIENT localizes it at render
        // time (renderSystemMsg, keyed on noticeKind) since language is a
        // per-device choice the server can't know. from/to ride the block.
        const msg = this._create({ role: 'system', content: [{ type: 'text', text: `⚠ Model auto-fallback: ${from} → ${to} (the harness switched models, e.g. capacity/overload; /model or the badge menu sets it back)`, fallbackFrom: from, fallbackTo: to }], noticeKind: 'model-fallback' });
        if (emit) this._emit({ op: 'create', message: msg });
        continue;
      }
      if (block.type === 'thinking') {
        // Claude's thinking blocks carry the text in `thinking`, not `text`
        const msg = this._create({ role: 'assistant', content: [{ type: 'thinking', text: block.thinking || block.text || '' }], meta: recMeta });
        if (emit) this._emit({ op: 'create', message: msg });

      } else if (block.type === 'text') {
        // Streaming detection: if last message is streaming assistant text, edit it
        const last = this.messages[this.messages.length - 1];
        if (last && last.role === 'assistant' && last.status === 'streaming' && last.content[0]?.type === 'text') {
          last.content = [{ type: 'text', text: block.text || '' }];
          last.meta = recMeta; // later records of the same message carry the final usage
          if (emit) this._emit({ op: 'edit', id: last.id, fields: { content: last.content, meta: recMeta } });
        } else {
          this._finalizeStreaming(emit);
          const msg = this._create({ role: 'assistant', status: 'streaming', content: [{ type: 'text', text: block.text || '' }], meta: recMeta });
          if (emit) this._emit({ op: 'create', message: msg });
        }

      } else if (block.type === 'tool_use') {
        this._finalizeStreaming(emit);
        // TodoWrite → emit meta op so frontend can update display
        if (block.name === 'TodoWrite' && block.input?.todos && emit) {
          this._emit({ op: 'meta', subtype: 'todos', data: block.input.todos });
        }
        // Harness Task tools (TaskCreate/TaskUpdate) → same TODO display.
        // TaskCreate's id only appears in the RESULT text, so creation is
        // finalized in the tool_result merge below.
        if (block.name === 'TaskCreate' && block.input?.subject) {
          (this._pendingTaskCreates = this._pendingTaskCreates || new Map())
            .set(block.id, String(block.input.subject));
        } else if (block.name === 'TaskUpdate' && block.input?.taskId != null) {
          const t = this._harnessTasks?.get(String(block.input.taskId));
          if (t && block.input.status) {
            t.status = block.input.status;
            this._emitHarnessTodos(emit);
          }
        }
        // Tool ids key on the globally-unique toolCallId: the SAME tool_use
        // replayed from any transport (stdout buffer, JSONL rebuild, a
        // device-parsed history) lands on the SAME id — duplicates become
        // no-ops instead of double cards (R0 join guarantee).
        const msgId = `${this.sessionId}:t:${block.id}`;
        if (this.messageIndex.has(msgId)) {
          // already minted (replay overlap) — refresh the pending mapping so
          // a later tool_result still resolves it, and never re-create.
          if (!this.pendingToolCalls.has(block.id)) this.pendingToolCalls.set(block.id, { msgId, block });
          continue;
        }
        const msg = {
          id: msgId, role: 'tool', status: 'pending',
          content: [{ type: 'tool_call', toolCallId: block.id, toolName: block.name, input: block.input }],
          // _currentTs first (the assistant record's own timestamp): this
          // hand-rolled path bypassed _create's ts ladder and stamped every
          // rebuild-rendered tool card with the REBUILD time, not the tool
          // call time (caught by the R3 transcript parity suite — two parses
          // of one file disagreed on ts; live records without timestamps
          // still fall back to arrival time exactly as before).
          ts: this._currentTs || Date.now(), turnIndex: this.turnIndex,
          toolCallId: block.id, toolName: block.name, toolStatus: null,
          permission: null, usage: null, taskInfo: null, meta: recMeta,
        };
        this.messages.push(msg);
        this.messageIndex.set(msgId, msg);
        this.pendingToolCalls.set(block.id, { msgId, block });
        if (emit) this._emit({ op: 'create', message: msg });
        // an ask that arrived before this card (held by _stashAsk) lands on it now
        const held = this._askStash && this._askStash.get(block.id);
        if (held) { this._askStash.delete(block.id); this._processControlRequest(held, emit); }
      }
    }

    // Track usage metadata — but a SYNTHETIC record is not a measurement
    // (2.369.97, owner: "等待续跑的时候状态栏很多东西会消失"): the CLI answers
    // a usage-limit rejection with an assistant record whose model is
    // `<synthetic>` and whose usage is all zeros (no API request happened),
    // and publishing those zeros blanked the context% and cache chips for the
    // whole wait. Only a record that spent tokens moves the gauge.
    if (raw.message?.usage && emit && !syntheticUsage(raw)) {
      this._emit({ op: 'meta', subtype: 'usage', data: raw.message.usage });
    }
  }

  _processResult(raw, emit) {
    this._finalizeStreaming(emit);
    // Flush any pending tool calls that never got results (interrupted)
    // But preserve tool calls with unresolved permissions — they're still waiting for user input
    const toRemove = [];
    for (const [toolUseId, pending] of this.pendingToolCalls) {
      const existing = this.messageIndex.get(pending.msgId);
      if (existing && existing.status === 'pending') {
        if (existing.permission && !existing.permission.resolved) {
          // Still waiting for permission — keep in pendingToolCalls for tool_result matching
          continue;
        }
        existing.status = 'error';
        existing.toolStatus = 'error';
        if (emit) this._emit({ op: 'edit', id: existing.id, fields: { status: 'error', toolStatus: 'error' } });
      }
      toRemove.push(toolUseId);
    }
    for (const id of toRemove) this.pendingToolCalls.delete(id);

    // Peer message whose ONLY stdout trace is this result record (inc-mt27t0bg,
    // userW: an inbox delivery — harness SendMessage / vibespace-msg / job
    // notify — opens the turn as command_lifecycle + the turn's records; the
    // user record with the sender's words is written to the JSONL only, so a
    // LIVE-attached window showed the agent replying to nothing). The terminal
    // result carries the full envelope in origin — synthesize the peer card
    // from it. Feeds that DID see the user/attachment record (JSONL rebuilds,
    // the device stream) marked origin.msg_id, so this rung dedups; the card
    // lands at turn end live (late but visible), in true order on any rebuild.
    // msg_id is the AUTHORITATIVE per-message identity when present — the
    // containment scan is ONLY for msg_id-less legacy records (review-caught:
    // AND-ing it unconditionally suppressed every repeat fire of a same-body
    // recurring notify, and any short body contained in recent typed text).
    const po = raw.origin;
    if (po && po.kind === 'peer' && typeof po.body === 'string' && po.body.trim()
      && (po.msg_id ? !this._peerMsgIds.has(po.msg_id) : !this._recentUserTextIncludes(po.body))) {
      this._notePeerMsgId(po.msg_id);
      const pm = this._create({ role: 'user', status: 'complete', content: [{ type: 'text', text: po.body }], turnIndex: this.turnIndex });
      pm.originKind = 'peer-message';
      const pv = peerOriginOf(po, po.body);
      pm.peerFrom = pv.name;
      if (pv.via) pm.peerVia = pv.via; // S3 verify F3: the rung that named it, never the words
      if (emit) this._emit({ op: 'create', message: pm });
    }
    this.turnIndex++;

    if (raw.is_error || (raw.subtype && raw.subtype !== 'success')) {
      const label = raw.subtype === 'error_during_execution' ? 'Interrupted'
        : raw.subtype === 'error_max_turns' ? 'Max turns reached'
        : raw.subtype === 'error_max_budget_usd' ? 'Budget exceeded'
        : 'Error';
      const text = raw.result ? `${label}: ${raw.result}` : label;
      const msg = this._create({
        role: 'system', status: raw.subtype === 'error_during_execution' ? 'interrupted' : 'error',
        content: [{ type: 'system_info', text }],
      });
      const errorKind = classifyResultError(raw.result);
      if (errorKind) msg.errorKind = errorKind;
      if (emit) this._emit({ op: 'create', message: msg });
    }

    if (emit) {
      this._emit({ op: 'meta', subtype: 'turn_complete', data: { cost: raw.total_cost_usd || 0, modelUsage: raw.modelUsage || null } });
    }
  }

  // THE ONE READER of a permission's outcome from the tool_result that answered it (a main card's
  // autoResolved / the merge site, and the helper table's result-* rows). lane S1 verify r5: it
  // classifies ONLY by the CENSUS of the CLI's own sentences (src/permission-outcome.js, read in the
  // 2.1.281 binary): a non-error ⇒ the tool RAN ⇒ allowed (every refusal the binary writes is
  // is_error); the user's words ⇒ denied; the CLI's own interrupt / turn-ended / parked-expired
  // markers ⇒ cancelled; any OTHER error ⇒ unknown — a user-APPROVED tool that then fails (nonzero
  // exit, bad edit — hundreds per real transcript) is is_error too, and so would be a sentence a newer
  // build invented; this reader cannot tell them apart, so it says so. Before r5 it said "not the
  // rejection words ⇒ allowed": a fail-OPEN classifier over the vendor's sentences — r4 caught the
  // WebFetch deadline, r5 the SUBAGENT's own denial sentence ("Permission for this tool use was
  // denied…", every helper's), the interrupt marker and the parked approval that expired — all
  // read "✓ Allowed". A word here is never compared to a literal outside the census.
  _resolutionFromResult(outputText, isError) {
    return permissionOutcome(outputText, isError).outcome;
  }

  /** An error sentence outside the census settled a card as `unknown` (verify r5): named ONCE per
   *  session per sentence by the schema-drift card (the record-shape path — "the harness wrote a
   *  word this build does not declare"). Live (`emit`) it is raised at once — a live result
   *  follows our own record, so an unknown reading here is final; in a REBUILD (emit false) the
   *  request may replay AFTER its result and our control_response record after both (the buffer's
   *  end-appended control records), so the head is STASHED and raised by sealPendingAsks() only
   *  when a card or a helper's ask still reads unknown with it — a tool's own failure after an
   *  allow never raises a card. */
  _noteOutcomeDrift(text, emit) {
    const head = outcomeHead(text);
    if (!head) return;
    if (!emit) { (this._outcomeDriftStash || (this._outcomeDriftStash = new Set())).add(head); return; }
    this._raiseOutcomeDrift(head, true);
  }
  _raiseOutcomeDrift(head, emit) {
    this._noteDrift({ shape: 'claude:stream:tool_result/permission_outcome', fields: [], enumDrift: [{ field: 'is_error sentence', value: head }] }, { type: 'tool_result', is_error: true, content: head }, emit);
  }
  /** Do any of this normalizer's cards still read `unknown` with this sentence head? */
  _unknownOutcomeStillHeld(head) {
    if (this._askIds) for (const id of this._askIds) {
      const m = this.messageIndex.get(id);
      if (!m) continue;
      if (m.permission && isUnknownOutcome(m.permission.resolved) && m.permission.unknownHead === head) return true;
      for (const a of (Array.isArray(m.helperAsks) ? m.helperAsks : [])) if (isUnknownOutcome(a.resolved) && a.unknownHead === head) return true;
    }
    if (this._helperOrphans) for (const list of this._helperOrphans.values()) for (const a of list) if (isUnknownOutcome(a.resolved) && a.unknownHead === head) return true;
    return false;
  }

  _processControlRequest(raw, emit) {
    if (raw.request?.subtype !== 'can_use_tool') return;
    const toolUseId = raw.request.tool_use_id;
    // A HELPER's ask (lane S1, B-6e95 — measured on 2.1.281: `agent_id` names the
    // helper, `tool_use_id` the HELPER's own call, which lives in the helper's
    // view and never in the parent's cards). In the PARENT's normalizer it hangs
    // on the helper's Agent card; before this lane it fell through the lookup
    // below and was dropped — every screen silent while the chip said "waiting".
    const helper = this._subView ? null : helperAskOf(raw);
    if (helper) { this._noteHelperAsk(helper, emit); return; }

    // Find the tool message — may be in pendingToolCalls (live) or already flushed (history replay)
    let existing = null;
    const pending = this.pendingToolCalls.get(toolUseId);
    if (pending) {
      existing = this.messageIndex.get(pending.msgId);
    } else {
      // Search backwards for the tool message by toolCallId (flushed by prior result during history replay)
      for (let i = this.messages.length - 1; i >= 0; i--) {
        if (this.messages[i].toolCallId === toolUseId) { existing = this.messages[i]; break; }
      }
    }
    // lane S1 verify r5 (read in the 2.1.281 binary): the WebFetch PROVENANCE re-ask — a URL outside the
    // user's messages fails the tool's provenance check AFTER its permission was granted, and the tool asks
    // AGAIN with `g.ask({url, prompt}, {toolUseId: randomUUID(), forceDecision})` — so its tool_use_id names
    // NO call and the request was stashed forever (no card, no chip, the CLI denying it itself after 300 s).
    // The re-ask is that CALL's: it binds to the pending WebFetch call for the same url.
    if (!existing) existing = this._provenanceReaskCard(raw.request);
    if (!existing) { if (toolUseId) this._stashAsk(toolUseId, raw); return; }

    // A REAL tool_result (content already merged) means the permission
    // question was settled — never flip such a card back to pending. Only an
    // interrupt-FLUSHED tool (content still tool_call, errored by
    // _processResult) is "incorrectly flushed" and restorable. Without this
    // the [tool_use, tool_result, control_request] replay order (end-appended
    // buffer records after an anchorless merge) resurrected denied/errored
    // cards as awaiting-approval — the exact bug the merge auto-resolve fixes
    // for the other order (review-confirmed).
    const rblock = existing.content?.[0];
    const hasRealResult = rblock?.type === 'tool_result';
    if (existing.status === 'error' && !hasRealResult) {
      existing.status = 'pending';
      existing.toolStatus = null;
      if (emit) this._emit({ op: 'edit', id: existing.id, fields: { status: 'pending', toolStatus: null } });
    }

    // If the tool already ran, the permission was implicitly settled
    const autoResolved = hasRealResult
      ? this._resolutionFromResult(rblock.output, rblock.status === 'error')
      : (existing.status === 'complete' ? 'allowed' : null);

    const isAskUser = raw.request.tool_name === 'AskUserQuestion';
    existing.permission = {
      requestId: raw.request_id,
      toolName: raw.request.tool_name,
      input: raw.request.input || {},
      suggestions: raw.request.permission_suggestions || [],
      resolved: autoResolved,
      ...(autoResolved === 'unknown' && { unknownHead: outcomeHead(rblock.output) }), // verify r5
      ...(isAskUser && { kind: 'user_input', questions: raw.request.input?.questions || [] }),
    };
    if (autoResolved === 'unknown') this._noteOutcomeDrift(rblock.output, emit);
    (this._askIds || (this._askIds = new Set())).add(existing.id); // the pending-asks level reads only the cards that ever asked
    if (emit) this._emit({ op: 'edit', id: existing.id, fields: { permission: existing.permission } });
  }

  /** BYPASS ANSWERED THE CLI'S OWN ASK (lane bypass-no-prompts): the `system`/`vs_auto_allow` record
   *  src/server/bypass-auto-allow.js appends after the allow it wrote → the quiet line (the dim harness notice,
   *  `say` = our words; never a message). Live, the ask never reached this normalizer; on a rebuild the replayed
   *  ask comes off its card, so a reload shows what the live chat showed. */
  _autoAllowLine(raw, emit) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.permission && m.permission.requestId === raw.request_id) {
        m.permission = null;
        if (this._askIds) this._askIds.delete(m.id);
        if (emit) this._emit({ op: 'edit', id: m.id, fields: { permission: null } });
        break;
      }
    }
    const tool = String(raw.tool || '?').slice(0, 80), head = String(raw.head || '').slice(0, 120);
    const params = { tool, head, reasonType: raw.reason_type || null, reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 300) : null, helper: !!raw.agent_id };
    const msg = this._create({ role: 'system', status: 'complete', noticeKind: 'harness-informational', content: [{ type: 'harness_informational', text: `Auto-allowed (bypass): ${tool}${head ? ' — ' + head : ''}`, level: 'notice', say: 'bypass-auto-allow', params }] });
    if (raw.tool_use_id) (this._autoAllowLines || (this._autoAllowLines = new Map())).set(raw.tool_use_id, msg.id);
    if (emit) this._emit({ op: 'create', message: msg });
  }

  /** No silent failure: an auto-allowed call whose result reads as a DENIAL (the CLI refused our allow) turns its quiet line into a warning that says so. */
  _autoAllowRefused(toolUseId, resultText, isError, emit) {
    const id = this._autoAllowLines && this._autoAllowLines.get(toolUseId);
    if (!id) return;
    this._autoAllowLines.delete(toolUseId);
    if (this._resolutionFromResult(resultText, isError) !== 'denied') return;
    const m = this.messageIndex.get(id), b = m && m.content && m.content[0];
    if (!b || b.say !== 'bypass-auto-allow') return;
    b.level = 'warning';
    b.params = { ...b.params, refused: String(resultText || '').replace(/\s+/g, ' ').slice(0, 160) };
    if (emit) this._emit({ op: 'edit', id, fields: { content: m.content } });
  }

  /** The pending WebFetch call a provenance re-ask (a fresh tool_use_id, the same url) belongs to — the newest. */
  _provenanceReaskCard(request) {
    if (!request || request.tool_name !== 'WebFetch' || !request.input || typeof request.input.url !== 'string') return null;
    let hit = null;
    for (const p of this.pendingToolCalls.values()) if (p && p.block && p.block.name === 'WebFetch' && p.block.input && p.block.input.url === request.input.url) hit = p;
    return hit ? this.messageIndex.get(hit.msgId) || null : null;
  }

  _processControlResponse(raw, emit) {
    // control_response is the user's approval/denial sent to claude stdin
    // Match by request_id to resolve the pending permission
    const requestId = raw.response?.request_id;
    if (!requestId) return;
    const approved = raw.response?.response?.behavior === 'allow';
    // lane J r2: a deny that names browser_paused is the takeover's STALE answer — the
    // card says why (and keeps saying it after a restart: this record is replayed from the buffer)
    const staleBy = approved ? null : staleFromDenyMessage(raw.response?.response?.message);
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.permission?.requestId === requestId) {
        m.permission.resolved = approved ? 'allowed' : 'denied';
        if (staleBy) m.permission.staleBy = staleBy;
        if (emit) this._emit({ op: 'edit', id: m.id, fields: { permission: m.permission } });
        break;
      }
    }
    // …or a HELPER's ask on its Agent card (lane S1), and an ask still held for a card that never came
    this._settleHelperAsk(requestId, approved ? 'record-allow' : 'record-deny', emit); // the table's record rows
    this._dropStashedAsk(requestId);
  }

  _dropStashedAsk(requestId) {
    if (!this._askStash || requestId == null) return;
    for (const [k, r] of this._askStash) if (r && r.request_id === requestId) { this._askStash.delete(k); break; }
  }

  _processControlCancel(raw, emit) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.permission?.requestId === raw.request_id) {
        m.permission.resolved = 'denied';
        if (emit) this._emit({ op: 'edit', id: m.id, fields: { permission: m.permission } });
        break;
      }
    }
    // the CLI WITHDREW a helper's ask (measured: `stop_task` on a helper whose ask
    // was pending ⇒ control_cancel_request) — its card says the helper was stopped
    this._settleHelperAsk(raw.request_id, 'withdraw', emit); // the table's withdraw row (overrides our own answer)
    this._dropStashedAsk(raw.request_id);
  }
}

MessageManager._seenUnknownSubtypes = new Set();
MessageManager._seenShapeDrift = new Set(); // telemetry `harness-shape-drift` once per process per shape (§3)
/** Background-launch ACK → task identity, PURE (2.368.30, owner: "很多
 *  subagent任务你没识别出来"). task_started/task_progress/task_notification
 *  are LIVE-STREAM-ONLY subtypes — a 602MB field transcript carries ZERO —
 *  so anything derived from them dies on the first resume. The launch ack
 *  itself names the task; both the normalizer and session-store's taskState
 *  scan derive from IT (one parser, no twin). */
/** The CLI's task_type vocabulary (`local_workflow`, `local_bash`, `local_agent` on
 *  2.1.274's system/task_started + background_tasks_changed) → the ONE type our
 *  cards and chips gate on (2.369.139, inc-muc1hfeg-0qn2 "有个workflow卡片没有展示细节":
 *  task_started lands BEFORE the launch ack, stamped `local_workflow`, and the
 *  chat view's live re-render gate compared it with 'workflow' — every live
 *  task_progress was dropped until a reload rebuilt the card from the server's
 *  normalizer). Unknown values keep their spelling minus a `local_` prefix. */
const TASK_TYPE_MAP = Object.freeze({ local_workflow: 'workflow', workflow: 'workflow', local_bash: 'command', bash: 'command', command: 'command', local_agent: 'agent', agent: 'agent' });
function normalizeTaskType(t) {
  const s = typeof t === 'string' ? t.trim() : '';
  if (!s) return null;
  return TASK_TYPE_MAP[s] || s.replace(/^local_/, '');
}
function parseBackgroundLaunch(toolName, input, resultText) {
  const txt = String(resultText || '');
  if (toolName === 'Agent' && /^Async agent launched/.test(txt)) {
    return { id: txt.match(/agentId:\s*([a-z0-9]+)/)?.[1] || null, type: 'agent', description: String(input?.description || '').slice(0, 120) };
  }
  if (toolName === 'Workflow') {
    const rid = txt.match(/Run ID:\s*(wf_[\w-]+)/)?.[1];
    if (!rid) return null;
    // 2.369.136 (owner: "这个workflow没有展示正确的名称"): a run launched through
    // `scriptPath` has no `input.name` and the ack is "Workflow launched in
    // background… Summary: <meta.description>" — the name is the Summary line,
    // then the inline script's `meta.name`, then the script file's basename.
    const nm = workflowNameFromAck(input, txt) || 'workflow';
    // the chip needs a SHORT name (owner: "这个任务名称是不是太长了"): the ack's
    // Summary line is the run's whole description — keep it whole as `summary`
    // and derive the label: the leading id-like token before ':' / ' — ' when
    // it reads like a name (≤ 40 chars, no spaces), else the first clause cut
    // at a word boundary near 48 chars.
    return { id: rid, type: 'workflow', description: shortWorkflowName(nm), summary: String(nm).slice(0, 300) };
  }
  const bg = txt.match(/^Command running in background with ID:\s*([\w-]+)/);
  if (bg) return { id: bg[1], type: 'command', description: String(input?.description || input?.command || '').slice(0, 120) };
  return null;
}

// peerDisplayName is shared with the codex normalizer (design-harness-plugins
// §1 P1): the server frames it parses are backend-neutral text, and a codex
// rollout copy of a peer message carries ONLY that text.
/** PURE: the CLI's `workflow_progress` list (task_progress records of a Workflow run —
 *  `{type:'workflow_phase', index, title}` and `{type:'workflow_agent', index, label,
 *  phaseIndex, phaseTitle, agentId, model, state, lastToolName, lastToolSummary,
 *  attempt, startedAt, promptPreview}`) → `{phases:[{index,title}], agents:[…]}` with
 *  every string bounded (agent-authored text) and the prompt preview dropped (the
 *  card never shows it). null when the payload carries no tree (heartbeat) — the
 *  caller keeps what it already has. */
function normalizeWorkflowProgress(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const s = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);
  const i = (v) => (Number.isFinite(v) ? v : null);
  const phases = [], agents = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'workflow_phase') phases.push({ index: i(e.index), title: s(e.title, 80) });
    else if (e.type === 'workflow_agent') {
      if (agents.length >= 200) continue;
      agents.push({ index: i(e.index), label: s(e.label, 80), phaseIndex: i(e.phaseIndex), phaseTitle: s(e.phaseTitle, 80), agentId: s(e.agentId, 32), model: s(e.model, 40), state: s(e.state, 24), lastToolName: s(e.lastToolName, 40), lastToolSummary: s(e.lastToolSummary, 120), attempt: i(e.attempt), startedAt: i(e.startedAt) });
    }
  }
  if (!phases.length && !agents.length) return null;
  phases.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return { phases, agents };
}

/** The WHOLE unknown record, pretty-printed, for the card's expander (owner: "展开可以看到这个 event 的所有信息"); bounded at 64 KB so a pathological record cannot balloon the chat. */
function unknownRecordJson(raw) {
  try {
    const s = JSON.stringify(raw, null, 2);
    if (typeof s !== 'string') return '';
    return s.length > 65536 ? s.slice(0, 65536) + '\n… (truncated at 64 KB)' : s;
  } catch { return ''; }
}

// Top-level record types the normalizer DELIBERATELY ignores (2.369.119): the
// SERVER consumer owns the live ones (src/server/stdout/claude-stream-json.js
// handles them before/beside feedLive), the transcript bookkeeping ones carry
// no conversation (2026-09-20 census of 30 transcripts + every live buffer).
// Anything NOT here and not in _processMessage's switch is an unknown-record
// card — adding a type here is a DECISION that it deserves no card.
const KNOWN_IGNORED_RECORD_TYPES = new Set([
  // live stream, consumed by the server consumer
  'tool_progress', 'set_in_progress_tool_use_ids', 'rate_limit_event', 'compact_progress', 'command_lifecycle', 'stream_event', 'keep_alive',
  '_stdin_ack', '_remote_state',
  // transcript bookkeeping (JSONL-only rows the CLI writes beside the conversation)
  'last-prompt', 'custom-title', 'agent-name', 'permission-mode', 'mode', 'atis-latch', // (pr-link is ROUTED since 2026-09-21 — the same fact as system/code_change_published)
  'file-history-snapshot', 'file-history-delta', 'cost-state', 'summary', 'progress',
  // the /design canvas session's own bookkeeping (corpus-verified 2026-09-22 by a read-only grep:
  // ONE 2.1.238 transcript, 60 rows — artifact-autoreact-ledger 52 / frame-link 5 /
  // artifact-comment-monitor 3). Each names artifacts or a canvas frame by id + url and carries no
  // conversation text; the design itself reaches the user through the published page, never a card.
  'artifact-autoreact-ledger', 'frame-link', 'artifact-comment-monitor',
]);
// System subtypes that trip the breadcrumb but are NOT worth a card: seen in the
// 2026-09-20 census and judged bookkeeping. (thinking_tokens = a per-turn count
// the CLI pushes ~30× a turn; the others are lists the CLI keeps for its own
// panels.) A subtype the census has never seen stays a card.
const KNOWN_IGNORED_SYSTEM_SUBTYPES = new Set([
  'thinking_tokens', 'hook_started', 'compact_boundary', 'success',
  // design-unknown-records (2026-09-21) — decisions, each with its reason:
  'api_error',              // history-only twin of the live api_retry (which already drives the "API retrying (n/10)" spinner label); 529/429/503 retries deserve no card. The transcript rows are NOT consumed for side effects (a days-old 401 must not evict today's pool member; the live api_retry twin fires on the first request of any resume) — session-brain's noteApiErrorAuth is a FORWARD-COMPAT consumer for the stream twin the binary declares and no census has observed
  'microcompact_boundary',  // legacy 2.1.2xx micro-compaction marker (not in the 2.1.274 SDK union); the REPL renders nothing for it
  'vcs_state_changed',      // card-less BY DESIGN: the server consumer owns it (session-vcs broadcast → the session card's git chip, the explorer refresh, the Session Properties timeline); a card per push/commit would be noise in the flow
  // 2026-09-22 (CLI 2.1.280 pass), each corpus-verified by a read-only grep before it was declared:
  'scheduled_task_fire',    // a /loop (cron) timer firing — "resuming /loop wakeup (<time>)"; the harness's own bookkeeping: the turn it opens renders as itself, the fire line adds nothing (transcript 2.1.118, 1 row; in the 2.1.280 SDK union). Was wrongly listed as declared-upstream-unseen, so a /loop history rendered a red Unknown-event card
  'bridge_status',          // the TUI's "/remote-control is active" banner (transcript 2.1.81, 11 rows; NOT in the SDK union — record-shape CORPUS_ONLY_SUBTYPES); VibeSpace never runs the remote-control bridge
  // 2026-10-05 (CLI 2.1.288, lane session-title-record): the CLI names the session itself — card-less BY DESIGN (the quiet
  // choice: the name IS the surface — the sidebar row, the window title and the taskbar follow it; a "named …" note in the
  // flow would repeat it). The server consumer owns it: session-brain noteSessionTitle → `cliTitle` (src/session-name.js)
  'session_title_changed',
  // 2026-10-07 (CLI 2.1.288, lane cli-2-1-288-records — each read off the 2.1.288 zod union, scripts/fixtures/claude-cli/2.1.288.json):
  'session_metadata',       // the cloud session's metadata push — today only `artifacts` (frame links {url,title,kind:'frame'}); no model / cwd / version in it, so nothing for the status bar: card-less
  'ui_toast',               // the plugin UI host: a PLUGIN's $.ui.toast line {plugin,text,timeout_ms} — the ONE call site; no severity field, the CLI's own errors never ride it (they are notification / informational). Card-less: the chat is not the CLI's TUI
  'ui_status',              // the plugin UI host: a plugin's pinned status line (null clears) — card-less
  'ui_log',                 // the plugin UI host: a plugin's log line — card-less
  'ui_invalidate',          // the plugin UI host: re-render request for mounted plugin panes — card-less
  'ui_scroll',              // the plugin UI host: scroll a plugin pane — card-less
  'ui_focus',               // the plugin UI host: move the focus ring in a plugin pane — card-less
  'ui_panes',               // the plugin UI host's pane list (spelled in 2.1.288, NOT in its union — record-shape CORPUS_ONLY_SUBTYPES). All ui_* fire only when a client attached a UI surface channel (2.1.288 zi()); VibeSpace attaches none
]);

module.exports = { splitToolResultContent, toolResultText, MessageManager, classifyResultError, parseBackgroundLaunch, normalizeTaskType, TASK_TYPE_MAP, peerDisplayName, peerOriginOf, PEER_RECORDED, initFrameFacts, commandNames, normalizeWorkflowProgress, HANDLED_SYSTEM_SUBTYPES, KNOWN_IGNORED_RECORD_TYPES, KNOWN_IGNORED_SYSTEM_SUBTYPES, unknownRecordJson };

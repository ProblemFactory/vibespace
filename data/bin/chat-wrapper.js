#!/usr/bin/env node
// Chat wrapper — runs inside dtach, spawns claude with --output-format stream-json.
// Reads structured JSON lines from stdout, writes to buffer file.
// Survives server restarts (dtach keeps this process alive).
// Usage: node chat-wrapper.js <buffer-file> <meta-file> <command> [args...]
//
// The buffer file contains JSON lines — each line is a complete JSON object
// from claude's stream-json output. Server reads this on attach to recover
// message history. New lines are also teed to stdout (dtach PTY) so the
// server can read them in real-time via the attached PTY.
//
// REMOTE MODE (2.124.0, env VIBESPACE_REMOTE_SID set by the server for remote
// chat sessions): the child is `ssh … vibespace-remote-keeper run <sid>
// __VS_OFFSET__ -- claude …` — claude itself runs DETACHED on the host under
// the keeper (buffer file + unix-socket stdin), so an ssh drop kills only the
// pipe. This wrapper then RECONNECTS with backoff, substituting the byte
// offset it has consumed into __VS_OFFSET__ — the keeper replays exactly the
// missed bytes. Input typed while disconnected is queued and flushed after
// reconnect. The session truly ends only when the keeper's
// {"type":"_remote_exit","code":N} sentinel arrives (claude exited remotely).
//
// THE PROMPT QUEUE IS OURS (2.369.354, lane claude-wrapper-queue — the owner,
// 2026-10-25: «可以 按照你推荐来»). A user frame that arrives while a turn runs is
// HELD here (promptQueue — never written to the CLI's stdin), published as
// `queue_changed` (the strip: remove / reorder / edit), and forwarded ONE per
// turn end, in order. Stop drops what is held: per-item `queue_op_result
// {reason:'stopped'}` → ONE `queue_dropped` (the person's words go back into
// the composer, src/queue-putback.js) → the emptied `queue_changed` → THEN the
// interrupt reaches the CLI. Why: measured on 2.1.308 with a local mock API,
// the CLI RUNS a frame it queued itself right after `control_request
// interrupt` (+27 ms) — a queue the harness owns cannot be stopped by
// VibeSpace, so VibeSpace holds what it must be able to drop (the 2026-09-07
// law «Stop means stop»). The CLI's own queued-message bookkeeping is never
// used for a VibeSpace-driven session.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const logFile = path.join(path.dirname(process.argv[2] || '/tmp/chat-wrapper'), 'chat-wrapper.log');
// Rotate at 5MB (shared by all sessions' wrappers, grew without bound)
function log(msg) {
  try {
    try { if (fs.statSync(logFile).size > 5242880) fs.renameSync(logFile, logFile + '.old'); } catch {}
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

const bufferFile = process.argv[2];
const metaFile = process.argv[3];
const cmd = process.argv[4];
const args = process.argv.slice(5);

const REMOTE_SID = process.env.VIBESPACE_REMOTE_SID || '';
// The DIAL/agentd-attach bridge honors the SAME contract as the keeper (raw
// bytes + __VS_OFFSET__ + _remote_exit sentinel), but its sessions don't
// always carry VIBESPACE_REMOTE_SID. A LITERAL __VS_OFFSET__ reaching the
// attach child is ALWAYS a bug (offset=NaN → zero data relayed → blank chat,
// real owner report). Enable the offset machinery whenever the placeholder
// is present, not only for REMOTE_SID.
const OFFSET_MODE = !!REMOTE_SID || process.argv.slice(5).some(a => a.includes('__VS_OFFSET__'));
let remoteOffset = 0;        // bytes of the REMOTE buffer consumed (byte-exact)
let lastChildError = null;   // last stderr line / spawn error of the transport child (UI tooltip)
let remoteExited = null;     // set when the keeper's _remote_exit sentinel arrives
let remoteExitSignal = null; // the sentinel's `signal` (B-3052 r2): the CLI's signal death ON THE HOST
let reconnectAttempts = 0;
let reconnectTimer = null;
const inputQueue = [];       // stdin lines that arrived while the pipe was down

log(`Starting: cmd=${cmd} args=${JSON.stringify(args.slice(0, 5))}... cwd=${process.cwd()}${REMOTE_SID ? ` remoteSid=${REMOTE_SID}` : ''}`);

if (!bufferFile || !cmd) {
  log('Missing arguments');
  process.exit(1);
}

// Ensure stream-json flags are in args — the claude harness's ONE spelling
// (src/harnesses/claude-transport.js; the remote spawn reads the same list via
// the adapter's chatTransportArgs())
for (const fl of require(path.join(__dirname, '..', '..', 'src', 'harnesses', 'claude-transport.js')).CHAT_TRANSPORT_ARGS) {
  if (!args.includes(fl[0])) args.push(...fl);
}

// Write initial metadata
try { fs.mkdirSync(path.dirname(metaFile), { recursive: true }); } catch {}
// caps: protocol features THIS wrapper process understands — the server must
// gate new stdin protocols on them (2.361.1, the c1206711 lost-image incident:
// a 2.360.0 server sent _frame_file pointers to a pre-2.360.0 wrapper, which
// forwarded them verbatim to claude = message silently dropped). Wrappers are
// LONG-LIVED: sessions spawned before an update run old code forever.
// inputQueue / queueVerbs / queueResync (2.369.354): THIS process owns the
// mid-turn queue (see the head of this file) — it publishes `queue_changed`,
// serves `queue-op` (three splices on a local array: remove / reorder / edit;
// NOT steer — the CLI takes no input into a running turn, a frame sent there
// is queued by the CLI itself, which is exactly the queue this file replaced)
// and `queue-resync` (state the queue again, out loud — a rebuilt server's
// `queue: []` is a guess). The server gates every queue frame on THIS advert
// (wrapperCaps), never on the harness row alone: a claude session spawned
// before 2.369.354 runs an older wrapper that would forward a `queue-op` line
// to the CLI verbatim.
const CLAUDE_QUEUE_VERBS = ['remove', 'reorder', 'edit'];
// receipts (lane human-cli r2): this wrapper acks a frame BY ITS ID, writes that ack into the buffer when the frame asks
// (`webui_receipt` — the person's CLI never stays attached; it reads the buffer) and refuses a TORN line with `_stdin_nack`
const meta = { pid: process.pid, startedAt: Date.now(), mode: 'chat', tasks: {}, todos: [], caps: { frameFile: true, inputQueue: true, queueVerbs: CLAUDE_QUEUE_VERBS, queueResync: true, receipts: true }, queue: [] };
let metaTimer = null;

function persistMeta() {
  metaTimer = null;
  try { fs.writeFileSync(metaFile, JSON.stringify(meta)); } catch {}
}

function scheduleMeta() {
  if (!metaTimer) metaTimer = setTimeout(persistMeta, 500);
}

try { fs.writeFileSync(metaFile, JSON.stringify(meta)); } catch (e) { log(`meta write failed: ${e.message}`); }

// Ensure buffer directory exists and start with empty buffer
try { fs.mkdirSync(path.dirname(bufferFile), { recursive: true }); } catch {}

// Buffer: stores complete JSON lines for history recovery
let buffer = '';
const MAX_BUFFER = 500000; // 500KB — JSON lines are larger than raw PTY
let writeTimer = null;
let lineBufB = Buffer.alloc(0); // accumulator for partial lines (Buffer — byte-exact offsets)

function persistBuffer() {
  writeTimer = null;
  try { fs.writeFileSync(bufferFile, buffer); } catch {}
}

function schedulePersist() {
  if (!writeTimer) writeTimer = setTimeout(persistBuffer, 2000);
}
/** A receipt is waited for (the person's CLI reads the buffer file): the pending persist runs now, not in 2 s. */
function persistSoon() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(persistBuffer, 50);
}

let child = null;
let childDead = true;
let childExit = null;        // {code, signal} of the LAST child exit (the wrapper-signal record says what it knew)

function sendChild(line) { // line WITHOUT trailing \n
  if (child && !childDead && child.stdin && child.stdin.writable) {
    try { child.stdin.write(line + '\n'); return; } catch {}
  }
  if (OFFSET_MODE) { // queue while the pipe is down — flushed after reconnect
    inputQueue.push(line);
    if (inputQueue.length > 200) inputQueue.shift();
    log(`queued input while disconnected (${inputQueue.length} pending)`);
  } else {
    log('dropped input: child stdin not writable');
  }
}

// ── THE PROMPT QUEUE (2.369.354 — the head of this file says why) ──
// A record THIS wrapper says: a top-level JSON line into the history buffer AND
// onto stdout, exactly like a CLI line (the server's claude consumer passes it
// to the normalizer; the put-back door reads `queue_dropped` at its gate).
function record(type, fields = {}) {
  const line = JSON.stringify({ type, ...fields });
  buffer += line + '\n';
  schedulePersist();
  try { process.stdout.write(line + '\n'); } catch {}
}

// THE TURN GATE — the predicate that decides held vs forwarded (every number measured on 2.1.308, a local mock):
//   · OPENED by the wrapper itself the moment it writes a user frame to the CLI — a second frame one millisecond later
//     is held: there is no echo to race (in stream-json the CLI never echoes a prompt on stdout);
//   · OPENED by the CLI's own turn start — a top-level `system/init` said while the CLI's last state word is 'running'
//     or 'requires_action' (every turn has an init — a typed prompt, a local slash command, and the turn the CLI starts
//     by itself for a background task's notification, which has ONLY an init: the session never went idle). A STATE word
//     alone opens nothing: after the turn's result a BACKGROUND helper's permission ask says 'requires_action' (and its
//     work 'running') — no turn is running then, and the CLI takes a new prompt. An init said while idle or before any
//     state (the real CLI says nothing before its first input, fresh or resumed — measured; a stand-in may) opens
//     nothing either: a gate it opened would never close;
//   · CLOSED by the turn's top-level `result`, or 'idle'. NOT by 'idle' alone: while a BACKGROUND AGENT works the
//     session stays 'running' past the turn's result (idle comes only when that agent ends, 12 s later in the probe)
//     and the CLI takes a new prompt at once (+114 ms) — holding until idle would keep the person waiting behind
//     background work. Every user frame ends in `result` (then `idle` when nothing runs in the background);
//   · an 'idle' that arrives AFTER we wrote a frame and BEFORE that frame's turn started belongs to the turn before it
//     (`awaitingStart`): the drain writes the next frame on a result, and that turn's idle follows 1–2 ms later. A
//     `result` always ends the turn in flight (it comes before its idle, and the drain fires on it).
// A frame whose `message.content` is neither a string nor an array never opens it: the CLI ignores that frame without
// a word (no running, no result), and a gate it opened would never close.
let turnBusy = false;
let awaitingStart = false;
let cliState = null;     // the CLI's last session_state_changed word ('running' | 'requires_action' | 'idle'), null = none yet
const opensTurn = (o) => !!(o && o.type === 'user' && o.message && (typeof o.message.content === 'string' || Array.isArray(o.message.content)));
const promptQueue = [];  // [{id, ts, line (the WHOLE stdin frame — images included), msgId, origin, text, preview, attachments, buffered}]
let queueSeq = 0;
let dropSeq = 0;         // the put-back record's id: `${pid}-${n}` — the server's idempotency key
const QUEUE_EDIT_MAX_CHARS = 20000;   // = codex/acp: a longer text offers no edit control (the server refuses a longer edit)

const frameBlocks = (o) => {
  const c = o && o.message ? o.message.content : null;
  return typeof c === 'string' ? [{ type: 'text', text: c }] : (Array.isArray(c) ? c : []);
};
/** The FULL text of a held frame (its text blocks) — what the edit control opens and what Stop puts back. */
const frameText = (o) => frameBlocks(o).filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
function framePreview(o) {
  const parts = [];
  for (const b of frameBlocks(o)) {
    if (b && b.type === 'text' && b.text) parts.push(String(b.text));
    else if (b && typeof b.type === 'string') parts.push(`[${b.type}]`);
  }
  const t = parts.join(' ').replace(/\s+/g, ' ').trim();
  return t.length > 120 ? t.slice(0, 119) + '…' : t;
}
/** Attachments are NAMED on a put-back (descriptors), never restored — the draft is a string. */
const frameAttachments = (o) => frameBlocks(o).filter((b) => b && typeof b.type === 'string' && b.type !== 'text')
  .map((b) => ({ type: b.type, mime: (b.source && typeof b.source.media_type === 'string' && b.source.media_type) || null, name: (typeof b.title === 'string' && b.title) || null }));

/** STOP PUTS THE DROPPED QUEUE BACK (lane stop-refills-composer, owner 2026-10-24) — the `queue_dropped` record's payload.
 *  The BYTE-IDENTICAL inline twin of src/queue-putback.js droppedRecordFor (a wrapper cannot require src/):
 *  test-queue-putback pins this text to that one and drives both on one fixture. */
function droppedRecordFor(rows, { dropId, turnId } = {}) {
  const ITEM_MAX = 20000, TOTAL_MAX = 100000;
  const items = []; let total = 0, omitted = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue;
    const full = typeof r.text === 'string' ? r.text : '';
    let text = full.length > ITEM_MAX ? full.slice(0, ITEM_MAX) : full;
    if (text.length < full.length && /[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
    if (total + text.length > TOTAL_MAX) { omitted++; continue; }
    total += text.length;
    const attachments = (Array.isArray(r.attachments) ? r.attachments : []).filter((a) => a && typeof a.type === 'string' && a.type).slice(0, 32)
      .map((a) => ({ type: a.type.slice(0, 32), mime: typeof a.mime === 'string' && a.mime ? a.mime.slice(0, 100) : null, name: typeof a.name === 'string' && a.name ? a.name.slice(0, 200) : null }));
    items.push({ id: String(r.id || ''), msgId: String(r.msgId || ''), ts: Number.isFinite(r.ts) ? r.ts : null, text, cut: text.length < full.length, attachments, ...(r.started === true ? { started: true } : {}) });
  }
  return { dropId: String(dropId || ''), by: 'stop', turnId: typeof turnId === 'string' && turnId ? turnId : null, items, omitted };
}

/** THE WHOLE QUEUE, on every change (the strip and the bubble chips read it — the acp/agy/codex wire). `kind` 'system'
 *  = a frame VibeSpace typed (auto-resume's continue, a dispatch's /compact — `webui_origin` on the frame): never
 *  editable, never put back. claude has no turn id on its stream: `turn_id` is null. */
function publishQueue() {
  const items = promptQueue.map((q) => ({
    id: q.id,
    msgId: q.msgId,
    preview: q.preview,
    ...(!q.origin && q.text && q.text.length <= QUEUE_EDIT_MAX_CHARS ? { text: q.text } : {}),
    ts: q.ts,
    kind: q.origin ? 'system' : 'user',
    from: null,
  }));
  meta.queue = items;
  scheduleMeta();
  // `verbs` rides every publication — the in-band twin of the sidecar advert.
  record('queue_changed', { items, turn_id: null, verbs: CLAUDE_QUEUE_VERBS });
}

/** A frame goes to the CLI: the gate opens (when the frame can open a turn) and a frame-file body joins the history
 *  buffer here — at the moment it really reaches the CLI, so a frame Stop dropped never reads as a sent one. */
function forwardUser(line, o, buffered) {
  if (opensTurn(o)) { turnBusy = true; awaitingStart = true; }
  sendChild(line);
  if (buffered) { buffer += line + '\n'; schedulePersist(); }
}

/** A user frame from the server: forwarded when no turn runs, else HELD (published + `queued_input` for its bubble). */
function submitUser(line, o, { buffered = false } = {}) {
  if (!turnBusy || !opensTurn(o)) { forwardUser(line, o, buffered); return; }
  const msgId = typeof o.webui_msg_id === 'string' ? o.webui_msg_id : '';
  const origin = typeof o.webui_origin === 'string' && o.webui_origin ? o.webui_origin : null;
  promptQueue.push({ id: `q${++queueSeq}-${process.pid}`, ts: Date.now(), line, msgId, origin, text: frameText(o), preview: framePreview(o), attachments: frameAttachments(o), buffered });
  publishQueue();
  record('queued_input', { msg_id: msgId, turn_id: null });
  log(`held a mid-turn frame (${promptQueue.length} held${origin ? ', ' + origin : ''})`);
}

/** The turn ended: ONE held frame goes, the next waits for the end of the turn it starts (order = the strip's order). */
function drainPromptQueue() {
  if (turnBusy || !promptQueue.length) return;
  const next = promptQueue.shift();
  publishQueue();
  let o = null; try { o = JSON.parse(next.line); } catch {}
  forwardUser(next.line, o, next.buffered);
  log(`drained a held frame at the turn end (${promptQueue.length} still held)`);
}

/** STOP MEANS STOP (the 2026-09-07 law) AND PUTS IT BACK (2026-10-24): every held frame is dropped — its own
 *  `queue_op_result {reason:'stopped'}` FIRST (the normalizer clears a chip that left the queue without a result as
 *  "it ran"), then ONE `queue_dropped` of the person's rows (none ⇒ no record), then the emptied `queue_changed` —
 *  all BEFORE the interrupt reaches the CLI, so nothing held can run after it. */
function dropHeldForStop() {
  if (!promptQueue.length) return;
  const dropped = promptQueue.splice(0, promptQueue.length);
  for (const q of dropped) record('queue_op_result', { op: 'remove', id: q.id, ok: true, msg_id: q.msgId, reason: 'stopped' });
  const putBack = dropped.filter((q) => !q.origin);
  if (putBack.length) record('queue_dropped', droppedRecordFor(putBack.map((q) => ({ id: q.id, msgId: q.msgId, ts: q.ts, text: q.text, attachments: q.attachments })), { dropId: `${process.pid}-${++dropSeq}`, turnId: null }));
  publishQueue();
  log(`interrupt: dropped ${dropped.length} held frame(s) (put back=${putBack.length})`);
}

/** queue-op stdin verb — remove / reorder / edit (CLAUDE_QUEUE_VERBS): splices on the local array. The adapter and the
 *  ws layer refuse steer / run-now / run-all before a frame is built; the arm below REPORTS one that reaches us anyway
 *  (never a silent drop). `afterId` null = the front of the queue (the codex vocabulary verbatim). */
function handleQueueOp(msg) {
  const op = String(msg?.op || '');
  const id = String(msg?.id || '');
  if (!CLAUDE_QUEUE_VERBS.includes(op)) {
    record('queue_op_result', {
      op, id, ok: false,
      reason: /^steer/.test(op) ? 'not-steerable' : /^run-/.test(op) ? 'not-startable' : 'unknown-op',
      detail: /^steer/.test(op) ? 'Claude Code takes no input into a running turn — the message runs when this turn ends'
        : /^run-/.test(op) ? 'a held message starts as soon as the current turn ends' : `this agent has no queue action "${op}"`,
    });
    return;
  }
  const idx = promptQueue.findIndex((q) => q.id === id);
  if (idx < 0) { record('queue_op_result', { op, id, ok: false, reason: 'gone', detail: 'it is no longer queued' }); publishQueue(); return; }
  if (op === 'reorder') {
    const afterId = msg?.afterId === null || msg?.afterId === undefined ? null : String(msg.afterId);
    const [moved] = promptQueue.splice(idx, 1);
    if (afterId === null) promptQueue.unshift(moved);
    else {
      const at = promptQueue.findIndex((q) => q.id === afterId);
      if (at < 0) {
        promptQueue.splice(idx, 0, moved);
        record('queue_op_result', { op, id, ok: false, reason: 'anchor-gone', detail: 'the message it was dropped after is no longer queued', msg_id: moved.msgId });
        publishQueue();
        return;
      }
      promptQueue.splice(at + 1, 0, moved);
    }
    record('queue_op_result', { op, id, ok: true, msg_id: moved.msgId });
    publishQueue();
    return;
  }
  if (op === 'edit') {
    const entry = promptQueue[idx];
    if (entry.origin) { record('queue_op_result', { op, id, ok: false, reason: 'not-editable', detail: 'it is a VibeSpace bookkeeping message, not yours to rewrite', msg_id: entry.msgId }); return; }
    const text = typeof msg?.text === 'string' ? msg.text : '';
    if (!text.trim()) { record('queue_op_result', { op, id, ok: false, reason: 'empty-text', detail: 'an edited message needs some text — remove it instead', msg_id: entry.msgId }); return; }
    let o = null; try { o = JSON.parse(entry.line); } catch {}
    if (!opensTurn(o)) { record('queue_op_result', { op, id, ok: false, reason: 'not-editable', detail: 'the held frame could not be read back', msg_id: entry.msgId }); return; }
    // BY EXCLUSION (the codex / acp rule): the first text block takes the new words, every other block (an image, a
    // document) stays where it is — a whitelist would delete a content type this file does not know yet.
    if (typeof o.message.content === 'string') o.message.content = text;
    else {
      const out = []; let replaced = false;
      for (const b of o.message.content) {
        if (b && b.type === 'text') { if (!replaced) { replaced = true; out.push({ ...b, text }); } continue; }
        out.push(b);
      }
      if (!replaced) out.push({ type: 'text', text });
      o.message.content = out;
    }
    entry.line = JSON.stringify(o);
    entry.text = frameText(o); entry.preview = framePreview(o);
    record('queue_op_result', { op, id, ok: true, msg_id: entry.msgId });
    publishQueue();
    return;
  }
  const [dropped] = promptQueue.splice(idx, 1);
  record('queue_op_result', { op, id, ok: true, msg_id: dropped.msgId });
  publishQueue();
}

function processLine(line) {
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    log(`Non-JSON line: ${line.substring(0, 100)}`);
    return;
  }

  // Keeper sentinel: claude exited ON THE HOST — the session is really over.
  // Not teed/buffered (it's transport metadata, not conversation content).
  if (msg.type === '_remote_exit') {
    remoteExited = msg.code ?? 0;
    // B-3052 r2: the keeper/daemon waiter now ADDS the signal node gave it
    // (`code` stays `code ?? 0` for every older reader). A sentinel without it
    // (an older writer on the host) records null — never invented.
    remoteExitSignal = (typeof msg.signal === 'string' && msg.signal) || null;
    log(`remote session exited on host with code ${remoteExited} signal ${remoteExitSignal}`);
    return;
  }

  // Track tasks: system.task_started / task_progress / task_notification
  if (msg.type === 'system' && msg.tool_use_id) {
    if (msg.subtype === 'task_started') {
      meta.tasks[msg.tool_use_id] = {
        id: msg.task_id, type: msg.task_type === 'local_agent' ? 'agent' : 'command',
        description: msg.description || '', status: 'running', startedAt: Date.now(),
      };
      scheduleMeta();
    } else if (msg.subtype === 'task_progress') {
      const t = meta.tasks[msg.tool_use_id];
      if (t) {
        if (msg.description) t.description = msg.description;
        if (msg.last_tool_name) t.lastTool = msg.last_tool_name;
        scheduleMeta();
      }
    } else if (msg.subtype === 'task_notification') {
      // Remove completed tasks entirely — don't accumulate in meta
      delete meta.tasks[msg.tool_use_id];
      scheduleMeta();
    }
  }

  // THE TURN GATE (the prompt queue above): a turn starts at the CLI's init / running, ends at its result / idle — never
  // a helper's record (parent_tool_use_id), and never an idle that belongs to the turn before a frame we just wrote
  let turnEnded = false;
  if (!msg.parent_tool_use_id && !msg.isSidechain) {
    if (msg.type === 'system' && msg.subtype === 'session_state_changed' && typeof msg.state === 'string') cliState = msg.state;
    const busyWord = cliState === 'running' || cliState === 'requires_action';
    const starts = msg.type === 'system' && msg.subtype === 'init' && busyWord;
    const idle = msg.type === 'system' && msg.subtype === 'session_state_changed' && msg.state === 'idle';
    if (starts) { turnBusy = true; awaitingStart = false; }
    else if (msg.type === 'result' || (idle && !awaitingStart)) { turnBusy = false; awaitingStart = false; turnEnded = true; }
  }

  // Track streaming state. Local-command echoes ("<local-command-stdout>...")
  // are user records with no turn behind them — not a streaming start.
  if (msg.type === 'user') {
    const uText = typeof msg.message?.content === 'string'
      ? msg.message.content
      : (Array.isArray(msg.message?.content) ? msg.message.content.map(b => b.text || '').join('') : '');
    if (!/^<local-command-/.test(uText.trim())) { meta.streaming = true; scheduleMeta(); }
  }
  if (msg.type === 'result' || (msg.type === 'system' && msg.subtype === 'compact_boundary')) {
    meta.streaming = false;
    for (const [id, t] of Object.entries(meta.tasks)) {
      if (t.type === 'command') delete meta.tasks[id];
    }
    scheduleMeta();

    // Goals are handled NATIVELY by the CLI since /goal gained
    // supportsNonInteractive (2.1.1xx): the Stop hook drives continuation
    // and met-detection. The old wrapper-side auto-continue simulation
    // (and its iteration cap) is gone — see the set-goal stdin handler.
  }

  // Track goal state from CLI /goal (goal_status attachment). As of 2.1.170
  // these are JSONL-only (not emitted on stream-json stdout) — the server
  // tails the JSONL instead — but keep this in case the CLI starts emitting.
  if (msg.type === 'attachment' && msg.attachment?.type === 'goal_status') {
    const a = msg.attachment;
    if (a.met) { meta.goal = null; meta.goalStatus = 'complete'; }
    else if (a.condition) { meta.goal = a.condition; meta.goalStatus = 'active'; }
    if (a.durationMs) meta.goalElapsed = a.durationMs;
    if (a.tokens) meta.goalTokensUsed = a.tokens;
    scheduleMeta();
  }

  // Track todos: TodoWrite tool_use in assistant messages
  if (msg.type === 'assistant' && msg.message?.content) {
    const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
    for (const b of blocks) {
      if (b.type === 'tool_use' && b.name === 'TodoWrite' && b.input?.todos) {
        meta.todos = b.input.todos;
        scheduleMeta();
      }
    }
  }

  // Append to buffer and tee to stdout
  buffer += line + '\n';
  try { process.stdout.write(line + '\n'); } catch {}
  // …and only THEN the next held frame: the turn end is on the wire before the queue that follows it
  if (turnEnded) drainPromptQueue();
}

function startChild() {
  reconnectTimer = null;
  // Remote reconnect: substitute the consumed-bytes offset so the keeper
  // replays exactly what we missed (__VS_OFFSET__ rides inside the ssh
  // inner-command string).
  const spawnArgs = OFFSET_MODE ? args.map(a => a.split('__VS_OFFSET__').join(String(remoteOffset))) : args;
  try {
    child = spawn(cmd, spawnArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    log(`Failed to spawn: ${err.message}\ncmd=${cmd}\nargs=${JSON.stringify(spawnArgs)}`);
    if (OFFSET_MODE) { scheduleReconnect(); return; }
    process.exit(1);
  }
  childDead = false;
  log(`Spawned child PID=${child.pid}${REMOTE_SID ? ` offset=${remoteOffset} attempt=${reconnectAttempts}` : ''}`);
  meta.childPid = child.pid;
  // its BIRTH beside the pid, same write (B-5ee1): the server's interrupt signals meta.childPid only while this names it;
  // a birth is a record, never a reason for the wrapper to die at spawn — a failed read leaves a birth-less (legacy) record
  try { const PI = require(path.join(__dirname, '..', '..', 'src', 'proc-identity.js')); meta.childStart = child.pid ? PI.startToken(child.pid) : ''; meta.childBoot = PI.bootToken(); } catch { meta.childStart = ''; meta.childBoot = ''; }
  scheduleMeta();

  // Child stdout → parse JSON lines → buffer + tee to our stdout (dtach PTY).
  // Buffer-based splitting: offsets must be BYTE-exact across reconnects, and
  // a chunk boundary may split a multibyte char — only complete lines decode.
  child.stdout.on('data', (chunk) => {
    if (OFFSET_MODE) {
      remoteOffset += chunk.length;
      if (meta.remote?.state !== 'connected') {
        reconnectAttempts = 0;
        meta.remote = { state: 'connected', at: Date.now() };
        scheduleMeta();
        // tell the server (→ status-bar chip clears); rides the same PTY line
        // channel as claude output, filtered out before the normalizer
        try { process.stdout.write(JSON.stringify({ type: '_remote_state', state: 'connected' }) + '\n'); } catch {}
      }
    }
    lineBufB = lineBufB.length ? Buffer.concat([lineBufB, chunk]) : chunk;
    let idx;
    while ((idx = lineBufB.indexOf(10)) !== -1) {
      const line = lineBufB.subarray(0, idx).toString('utf8').trim();
      lineBufB = lineBufB.subarray(idx + 1);
      processLine(line);
    }
    // Trim buffer if too large (keep last MAX_BUFFER chars, aligned to line boundary)
    if (buffer.length > MAX_BUFFER) {
      const trimStart = buffer.indexOf('\n', buffer.length - MAX_BUFFER);
      if (trimStart > 0) buffer = buffer.substring(trimStart + 1);
    }
    schedulePersist();
  });

  // Child stderr → log + kept as the LAST ERROR the UI can show. "host
  // reconnecting (9)…" with no reason is undiagnosable (real userL report:
  // the actual cause — connect timeout to a changed address — was only
  // visible by rerunning the ssh by hand); the last stderr line rides
  // meta.remote.lastError → _remote_state → the status-bar chip tooltip.
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    const t = chunk.trim();
    if (t) lastChildError = t.split('\n').pop().slice(0, 200);
    log(`[stderr] ${t}`);
  });

  // (code, signal): node passes BOTH — a CLI killed by a signal is `code null`
  // and only the second argument says which signal (B-3052: the 2026-09-24
  // three-session death left "code null" and nothing else).
  child.on('exit', (exitCode, signal) => {
    childDead = true;
    childExit = { code: exitCode ?? null, signal: signal || null };
    log(`Child exited with code ${exitCode} signal ${signal || null}`);
    if (!lastChildError && exitCode) lastChildError = `transport exited with code ${exitCode}`;
    // Remote + the session did NOT end on the host + we weren't told to die:
    // this was a transport (ssh) death — reconnect, never finalize.
    if (OFFSET_MODE && remoteExited === null && !shuttingDown) {
      meta.remote = { state: 'reconnecting', attempts: reconnectAttempts + 1, at: Date.now(), lastError: lastChildError || null };
      meta.streaming = meta.streaming || false; // keep whatever the stream last said
      scheduleMeta();
      scheduleReconnect();
      return;
    }
    // On the sentinel path the CLI's code AND signal come from the host; the
    // transport's own (code, signal) describe only the ssh/attach process.
    finalize(remoteExited !== null ? remoteExited : exitCode, remoteExited !== null ? remoteExitSignal : signal);
  });

  child.on('error', (err) => {
    childDead = true;
    lastChildError = String(err.message || err).slice(0, 200);
    log(`Child error: ${err.message}`);
    if (OFFSET_MODE && remoteExited === null && !shuttingDown) { scheduleReconnect(); return; }
    process.exit(1);
  });

  // Flush anything typed while we were disconnected
  if (inputQueue.length) {
    log(`flushing ${inputQueue.length} queued input line(s)`);
    const q = inputQueue.splice(0, inputQueue.length);
    for (const l of q) sendChild(l);
  }
}

function scheduleReconnect() {
  if (reconnectTimer || shuttingDown) return;
  reconnectAttempts++;
  const delay = [1000, 2000, 5000, 10000, 30000][Math.min(4, reconnectAttempts - 1)];
  log(`reconnect #${reconnectAttempts} in ${delay}ms (offset=${remoteOffset})`);
  try { process.stdout.write(JSON.stringify({ type: '_remote_state', state: 'reconnecting', attempts: reconnectAttempts, lastError: lastChildError || null }) + '\n'); } catch {}
  reconnectTimer = setTimeout(startChild, delay);
}

let shuttingDown = false;
function finalize(exitCode, signal) {
  shuttingDown = true;
  // Flush any remaining partial line
  const rest = lineBufB.toString('utf8').trim();
  if (rest) {
    try {
      JSON.parse(rest);
      buffer += rest + '\n';
      try { process.stdout.write(rest + '\n'); } catch {}
    } catch {}
  }
  if (writeTimer) { clearTimeout(writeTimer); }
  persistBuffer();
  meta.streaming = false;
  // Mark all running tasks as unknown (process died — can't know real state)
  for (const t of Object.values(meta.tasks)) {
    if (t.status === 'running') t.status = 'unknown';
  }
  if (metaTimer) clearTimeout(metaTimer);
  // Post-mortem breadcrumb (2.207.0): keep the FINAL meta (with the child's
  // exit code) instead of unlinking — the server reads it at teardown for
  // the lifecycle log/telemetry, then unlinks it itself. A crash-looping
  // claude previously left zero process-level evidence.
  meta.childExitCode = exitCode ?? null;
  meta.childExitSignal = signal || null;   // B-3052: which signal ended the child (null = it exited by itself)
  persistMeta();
  process.exit(exitCode ?? 0);
}

// WRAPPER SIGNAL RECORD (B-3052). A wrapper killed by SIGTERM/SIGHUP/SIGINT
// used to die with the default action: no log line, no childExitCode in the
// meta — and the server's teardown then printed an "exited" line with no code
// at all (the 2026-09-24 incident: three sessions in 40 ms, actor unknown).
// The handler is a RECORD, not a rescue: everything below is SYNCHRONOUS
// (appendFileSync/openSync/writeSync — no awaits, no timers, no stream
// writes), the child is handed nothing (no forwarding, no new kill — what it
// receives is what the default action handed it), and the wrapper still dies
// — with 128+signo, the status a shell reports for a signal death, so nothing
// that reads the exit status changes. SIGKILL is uncatchable: that case stays
// "unfinalized" on the server line.
//
// THE RECORD NEVER CREATES A FILE (B-3052 r2). The server's kill path
// SIGTERMs the dtach master and unlinks <id>.json + <id>.buf in the SAME
// tick; the master's death hangs up the pty and THIS handler runs a few ms
// later (SIGHUP). A writeFileSync here re-created both files as orphans, one
// pair per Terminate. So: the meta is written only into a file that still
// exists ('r+', never 'w'), and a pending buffer write goes into an existing
// .buf, or creates one only while the meta still exists (a wrapper signalled
// within 2 s of its first output keeps its tail).
// r4: a META is overwritten in ONE write at offset 0, padded with spaces to the
// old length (JSON.parse ignores trailing whitespace) and never truncated — a
// reader never sees the empty or half-written file an ftruncate-then-write
// left readable between two syscalls (measured torn on the FUSE workspace).
// A buffer (`pad` off) may legitimately shrink and keeps the truncating form.
function overwriteIfPresent(file, data, { pad = false } = {}) {
  let fd;
  try { fd = fs.openSync(file, 'r+'); } catch { return false; }
  try {
    let b = Buffer.from(data);
    if (pad) {
      const old = fs.fstatSync(fd).size;
      if (b.length < old) b = Buffer.concat([b, Buffer.alloc(old - b.length, 0x20)]);
    } else fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, b, 0, b.length, 0);
  } finally { try { fs.closeSync(fd); } catch {} }
  return true;
}
const WRAPPER_SIGNO = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
function onWrapperSignal(sig) {
  try {
    if (metaTimer) { clearTimeout(metaTimer); metaTimer = null; }
    // THE RECORD FIRST (r4): the meta is written before the buffer flush and
    // before the log line — the server's teardown is racing this handler (the
    // dtach master's death EOFs its attach client and SIGHUPs us at once), and
    // on the FUSE workspace a log append alone is ~3.5 ms, an 800 KB buffer
    // flush up to ~200 ms. The record lands first, everything else after.
    meta.wrapperSignal = sig;
    meta.wrapperSignalAt = Date.now();
    if (childDead && childExit) {
      if (meta.childExitCode === undefined) meta.childExitCode = childExit.code;
      if (meta.childExitSignal === undefined) meta.childExitSignal = childExit.signal;
    }
    const recorded = overwriteIfPresent(metaFile, JSON.stringify(meta), { pad: true });
    if (writeTimer) {
      clearTimeout(writeTimer); writeTimer = null;
      if (!overwriteIfPresent(bufferFile, buffer) && fs.existsSync(metaFile)) persistBuffer();
    }
    log(`wrapper received ${sig} (child pid ${child ? child.pid : null}, childDead=${childDead})`);
    if (!recorded) log(`wrapper record skipped: ${path.basename(metaFile)} is gone (the server tore the session down first)`);
  } catch {}
  process.exit(128 + WRAPPER_SIGNO[sig]);
}
for (const sig of Object.keys(WRAPPER_SIGNO)) process.on(sig, () => onWrapperSignal(sig));

// stdin (from dtach PTY) → child stdin
// Server writes lines via dtach PTY. Each line is either:
// - A raw JSON object (already formatted as stream-json input) → pass through
// - Plain text → wrap as {"type":"user","content":"..."}
// THE ONE PARSE (lane human-cli r2 — two writers on one socket, the hub's bridge and the person's CLI, interleave their
// frames at dtach's 8-byte packets: measured 11 of 12 trials, and the plain-text branch below sent the shreds to Claude
// as a billed turn nobody typed). A line that LOOKS LIKE a frame or a piece of one — it starts with `{`, ends with `}`,
// or holds a `"key":` — and does not parse is NEVER a user message: refused with `_stdin_nack` (+ a warning the chat
// shows: both senders are told) — the codex and ACP wrappers' rule since 2.360.0. Only a line with no JSON in it is
// still taken as typed text.
const looksLikeFrame = (line) => line[0] === '{' || line.endsWith('}') || /"[\w-]+"\s*:/.test(line);
/** The ack: the pipe is alive (the server's broken-pty detector) AND, for a frame, WHICH frame — `msg_id` = its
 *  webui_msg_id / request_id. A frame that asked for a receipt gets the same record in the buffer. */
function ackLine(id, receipt) {
  const line = JSON.stringify({ type: '_stdin_ack', timestamp: Date.now(), ...(id ? { msg_id: String(id) } : {}) });
  if (receipt) { buffer += line + '\n'; persistSoon(); }
  try { process.stdout.write(line + '\n'); } catch {}
}
function nackTorn(line) {
  log(`stdin line unparseable (${line.length} bytes, starts ${JSON.stringify(line.slice(0, 48).replace(/\s+/g, ' '))}) — refused, NOT sent to claude`);
  record('_stdin_nack', { timestamp: Date.now(), reason: 'torn', bytes: line.length });
  record('system', { subtype: 'informational', level: 'warning', content: `A message did not reach Claude: its line arrived corrupted (${line.length} bytes, unparseable — two senders at once, or a dropped byte). Please send it again.` });
  persistSoon();
}
let stdinLineBuf = '';
try {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data) => {
    stdinLineBuf += data;
    let nlIdx;
    while ((nlIdx = stdinLineBuf.indexOf('\n')) !== -1) {
      let line = stdinLineBuf.substring(0, nlIdx).replace(/\r/g, '').trim();
      stdinLineBuf = stdinLineBuf.substring(nlIdx + 1);
      if (!line) continue;
      let parsed = null;
      try { parsed = JSON.parse(line); } catch { parsed = null; }
      if (!parsed || typeof parsed !== 'object') {
        if (looksLikeFrame(line)) { nackTorn(line); continue; }
        ackLine(null, false);
        // Plain text — wrap as stream-json user message
        const wrapped = { type: 'user', message: { role: 'user', content: [{ type: 'text', text: line }] } };
        submitUser(JSON.stringify(wrapped), wrapped);
        continue;
      }
      // Immediately ack on stdout so the server knows stdin is alive — before claude processes the message, so it works
      // even when the model takes 30+ seconds to respond. A receipt's key is the CLI's ask, never Claude's: stripped.
      const receipt = parsed.webui_receipt === true;
      if (receipt) { delete parsed.webui_receipt; line = JSON.stringify(parsed); }
      ackLine(parsed.webui_msg_id || parsed.request_id || null, receipt);
      try {
        // Permission answers (control_response) exist ONLY on this stdin path —
        // the buffer file tees child STDOUT, so without recording them here a
        // server restart rebuilds history as request-without-answer and an
        // APPROVED still-running tool resurrects its Allow/Deny overlay on
        // every attach until the tool_result lands. Append to the buffer so
        // restart-rebuilt history keeps the resolution.
        if (parsed.type === 'control_response') {
          buffer += line + '\n';
          schedulePersist();
        }
        // Large-frame FILE BYPASS (2.360.0, the 79928a2b 38MB poisoning): a
        // multi-MB single line does NOT survive the pty/dtach stdin channel
        // (mid-line bytes AND the newline get dropped, shredded frames then
        // glue together and get wrapped as text into the transcript). Big
        // frames ride the filesystem; stdin carries only this pointer line.
        if (parsed.type === '_frame_file' && typeof parsed.path === 'string') {
          try {
            const body = fs.readFileSync(parsed.path, 'utf8').trim();
            const frame = JSON.parse(body); // must be ONE valid frame — never forward shreds
            // the WHOLE frame (its images) is what a mid-turn hold keeps; recorded into the buffer when it reaches the CLI
            submitUser(body, frame, { buffered: true });
          } catch (e) { log('frame-file failed (' + e.message + ') — dropped, NOT wrapped as text'); }
          try { fs.unlinkSync(parsed.path); } catch {}
          continue;
        }
        // THE QUEUE'S OWN VERBS (2.369.354) — never forwarded to the CLI
        if (parsed.type === 'queue-op') { handleQueueOp(parsed); continue; }
        if (parsed.type === 'queue-resync') { publishQueue(); continue; }
        // Stop: what is held is dropped (and put back) BEFORE the interrupt reaches the CLI — then the interrupt goes
        // through as it always did (the server's 2 s SIGINT fallback is unchanged)
        if (parsed.type === 'control_request' && parsed.request && parsed.request.subtype === 'interrupt') dropHeldForStop();
        // Handle goal commands from WebUI
        if (parsed.type === 'set-goal') {
          // Forward to the CLI's NATIVE /goal (dispatched as a command in
          // stream-json since supportsNonInteractive). Setting a goal starts a
          // model turn immediately; the Stop hook then drives continuation and
          // met-detection (goal_status attachments land in the JSONL — the
          // server tails it after each result to sync state).
          meta.goal = parsed.goal || null;
          meta.goalStatus = meta.goal ? 'active' : null;
          meta.goalSetAt = meta.goal ? Date.now() : null;
          scheduleMeta();
          const cmdText = meta.goal ? `/goal ${meta.goal}` : '/goal clear';
          // straight to the CLI, as before (a goal set MID-TURN still rides the CLI's own queue) — and it opens the gate
          const goalFrame = { type: 'user', message: { role: 'user', content: [{ type: 'text', text: cmdText }] } };
          forwardUser(JSON.stringify(goalFrame), goalFrame, false);
          log(`Goal ${meta.goal ? 'set (native): ' + meta.goal.substring(0, 80) : 'cleared (native)'}`);
          continue;
        }
        // A user frame: forwarded, or HELD while a turn runs (the prompt queue). Anything else passes through as-is.
        if (parsed.type === 'user') { submitUser(line, parsed); continue; }
        sendChild(line);
      } catch (e) {
        log(`stdin frame not handled (${e && e.message}) — a parsed frame is never re-sent as text`);
      }
    }
  });
} catch (err) {
  log(`stdin setup failed: ${err.message}`);
}

startChild();
publishQueue();   // the BASELINE (an empty queue, said once at boot — the acp wrapper's rule)

process.on('uncaughtException', (err) => { log(`Uncaught: ${err.message}\n${err.stack}`); });

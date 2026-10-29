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
// law «Stop means stop»).
//
// …AND THE PERSON MAY HAND A MESSAGE TO THE RUNNING TURN (2.369.361, lane
// claude-steer-inject — the owner, 2026-10-27, ruling «A»: «Enter 立即送入，
// Alt+Enter 排队»). MEASURED on 2.1.308 (the R0 recording, a local mock API;
// re-measured row by row on 2.1.312 on 2026-10-27 — every row the same):
// a user frame written to the CLI's stdin while a turn runs a tool is taken
// INTO THAT TURN with the next tool result — the CLI appends «The user sent a
// new message while you were working: <text>» to the tool_result the model
// reads (two frames = two reminders, an image rides as its own block) and says
// NOTHING on stdout about it; a frame that arrives when the turn has no tool
// result left runs as a turn of its own right after the result. So a frame the
// server stamps `webui_steer` (plain Enter on a Claude conversation — the
// CLI's own default) is HANDED OVER at once: written to the CLI, never held,
// never editable again, and witnessed — `input_handover {state}`: 'handed'
// (written), 'landed' (a tool result after the write, then the model spoke —
// it rode that request), 'own-turn' (the turn ended first: the CLI runs it as
// a turn of its own, the gate waits for that turn before the next held frame);
// what Stop meant for each is Stop's own record (below). An unstamped frame (Alt+Enter, every frame VibeSpace types,
// a slash command — the CLI never takes a command into a turn) is HELD exactly
// as above; `steer` / `steer-all` hand a held row over later (the ⚡).
// STOP WITH A HANDED FRAME THE CLI HAS NOT TAKEN IN: measured, the CLI RUNS it
// as a new turn +11 ms after the interrupt — and its uuid controls
// (`cancel_queued`, `cancel_async_message`) do not act outside -p. This
// wrapper answers that follow-up turn's `init` with a SECOND interrupt on the
// line (6/6 measured: no request reaches the model; the frame stays in the
// conversation as «[Request interrupted by user]» and the model reads it with
// the next message) — it stays with the turn, nothing runs after Stop, and the
// put-back record names it (`keptIds`) so the toast says so.
//
// THE DOOR NEEDS PROOF, STOP IS A WINDOW, ONE RECORD SAYS EACH FRAME'S FATE
// (acceptance r2). The hand-over trusts the CLI's STATE WORDS
// (`session_state_changed`, 2.1.257+ with CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS):
// only they tell "the turn ended and the CLI now runs what it holds" from "it
// went idle". A CLI that never says one (an older build on a host, the switch
// unset) left this process waiting for a turn it never saw — every later held
// frame stuck for the life of the wrapper. So the door is ADVERTISED ('steer' /
// 'steer-all' in the sidecar caps and every queue_changed) only from the FIRST
// state word this process reads, and a stamped frame that arrives before it is
// held like any other (the real CLI says 'running' before its first init, so a
// session proves itself the moment its first turn starts). Stop opens a WINDOW
// that lasts until the CLI settles (its 'idle' after the interrupted result; the
// result itself on a CLI without state words): a frame that arrives inside it is
// HELD as a plain queued send and runs when the window closes, in order — never
// handed to a turn being stopped (measured: a frame 15–22 ms after Stop became a
// SECOND follow-up turn, answered) — and EVERY turn the CLI starts inside it for
// frames it held at Stop is interrupted on its init line IN THE SAME TICK (the
// CLI's request leaves ~12 ms after that line, a second interrupt is acked in
// 8–14 ms: 25 ms late was answered; on 2.1.312 the request leaves 12–17 ms
// after the init, the second interrupt ends it in 10–19 ms and no guarded
// follow-up sent one). The window CLOSES ON THE CLI'S WORDS (acceptance r4):
// the CLI runs its UserPromptSubmit hook between the interrupted result and
// the follow-up's init — the product's own hook waits on the hub up to 3 s, so
// r2's 2 s clock answered a turn after Stop — and it says the hook's phase
// (the adapter's CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS): no clock
// counts while a hook runs, and a clock is only the BACKSTOP for «neither
// word comes» — 30 s where the CLI owes a turn, 2 s where it owes nothing —
// with one log line saying which. Never an interrupt inside the hook: that
// drops the frame the CLI held from the conversation (measured). Stop's ONE
// `queue_dropped` says what happened to EACH frame: `items` (held here — back in
// the box), `keptIds` (handed — a frame riding a tool result the model has
// not answered yet too, r4 — still held by the CLI: they stay in the
// conversation as «[Request interrupted by user]»), `landedIds` (the model had
// read them already); a frame whose OWN turn Stop ended is a stopped turn, in
// none of them.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const { randomUUID } = require('crypto');

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
// serves `queue-op` (splices on a local array: remove / reorder / edit, and
// since 2.369.361 steer / steer-all = hand a held row to the running turn) and
// `queue-resync` (state the queue again, out loud — a rebuilt server's
// `queue: []` is a guess). 'steer' in the list IS the hand-over door's advert
// (lane claude-steer-inject): a process that names it also honours a frame's
// `webui_steer` stamp; a .354 process names no steer and holds every frame, so
// the composer draws «Enter queues» alone there. The server gates every queue frame on THIS advert
// (wrapperCaps), never on the harness row alone: a claude session spawned
// before 2.369.354 runs an older wrapper that would forward a `queue-op` line
// to the CLI verbatim. The advert starts as the .354 three and gains the steer
// pair at the CLI's first state word (proveState — the head of this file says
// why): until then this process holds every frame, exactly like a .354 one.
const CLAUDE_QUEUE_VERBS = ['remove', 'steer', 'steer-all', 'reorder', 'edit'];
const CLAUDE_HOLD_VERBS = ['remove', 'reorder', 'edit'];
const meta = { pid: process.pid, startedAt: Date.now(), mode: 'chat', tasks: {}, todos: [], caps: { frameFile: true, inputQueue: true, queueVerbs: CLAUDE_HOLD_VERBS, queueResync: true }, queue: [] };
let metaTimer = null;

// replaced, never rewritten in place (ci358-reds item 7): a hub read between writeFileSync's truncate and its bytes saw an
// EMPTY sidecar (wrapperCaps 'no-sidecar') — the temp file is renamed over it, a reader sees the old record or the new
function persistMeta() {
  metaTimer = null;
  const tmp = `${metaFile}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(meta)); fs.renameSync(tmp, metaFile); return null; } catch (e) { try { fs.unlinkSync(tmp); } catch {} return e; }
}

function scheduleMeta() {
  if (!metaTimer) metaTimer = setTimeout(persistMeta, 500);
}

{ const e = persistMeta(); if (e) log(`meta write failed: ${e.message}`); } // the boot write is replaced too (ci358-reds round 2)

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
/** The ring (keep the last MAX_BUFFER chars, aligned to a line). THE KEPT FILE OUTLIVES THE FRAME IT SERVES (acceptance r6:
 *  a 522 KB output burst trimmed a HELD frame's copy line and its picture 6 s after they were written — a restart in the gap
 *  drew nothing): the copy line of a frame the CLI has not yet witnessed is PINNED (written again at the head), and the ring
 *  deletes no kept file — a file goes when its frame's witness record landed or the frame was dropped (settleCopy). */
function trimBuffer() {
  if (buffer.length <= MAX_BUFFER) return;
  const trimStart = buffer.indexOf('\n', buffer.length - MAX_BUFFER);
  if (trimStart <= 0) return;
  const gone = buffer.slice(0, trimStart + 1);
  buffer = buffer.substring(trimStart + 1);
  if (!gone.includes('"webui_copy"')) return;
  for (const l of KC.pinnedLines(gone, buffer, [...copies.values()].filter((c) => !c.settled).map((c) => c.line))) buffer += l + '\n';
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

// THE TURN GATE — the predicate that decides held vs forwarded (every number measured on 2.1.308, a local mock; the rows
// re-measured on 2.1.312, 2026-10-27, unchanged):
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
// THE HAND-OVER (2.369.361 — the head of this file says why): frames given to the CLI while a turn runs
const handed = [];          // [{id, msgId, ts, phase: 'handed' | 'riding'}] — written, not yet witnessed taken in
let landedThisTurn = [];    // msgIds witnessed INTO the turn now running (the model read them): Stop's record names them
let cliOwesTurn = false;    // the turn ended before the CLI took handed frames in: it runs them as a turn of its own next
let stateProven = false;    // this CLI has said a state word: the door is advertised and a stamp is honoured (r2)
let stopping = null;        // THE STOP WINDOW: {held, follows} from the person's Stop until the CLI settles (r2)
let boundTimer = null;      // the BACKSTOP on cliOwesTurn / stopping (r4): armed at the CLI's last word, never while a turn or a prompt hook runs
// THE WINDOW CLOSES ON THE CLI'S WORDS (acceptance r4) — the follow-up's prompt hook / init (interrupted) or idle (settled);
// a clock is only the backstop for «neither ever comes», and which one depends on what the CLI owes:
const SETTLE_BOUND_MS = 2000;     // owes NOTHING (a Stop with no frame held by the CLI): no follow-up, so no prompt hook can run —
                                  // no idle in 2 s means a background task keeps the session 'running'
const OWED_BACKSTOP_MS = 30000;   // owes a TURN (a frame the CLI holds: its own turn, a Stop's follow-up): the CLI runs the
                                  // UserPromptSubmit hook BEFORE that turn's init — the product's hook (data/bin/vibespace-hook.mjs)
                                  // aborts its fetch at 3 s and the CLI kills it at its registered `timeout: 10` s — so 30 s is
                                  // above every hook budget the product installs, and it is PAUSED while the CLI says a prompt hook runs
const promptHooks = new Set();    // the UserPromptSubmit hooks the CLI said started and has not said ended (hook_id)
// EVERY WINDOW HAS A NAMED END (acceptance r5): the pause a prompt hook buys is bounded too — a hook_started with no
// hook_response (a lost line, the two out of order) pinned the window for ever (a frame stayed held 48 s, a second Stop did
// not free it). The CLI itself answers every hook it starts — `success`, or `cancelled` at the hook's own timeout — so the
// bound is that timeout plus a margin. THE BOUND IS KEYED ON WHICH HOOK RUNS, NEVER ON HOW MANY (acceptance r6: r5 gave a
// LONE hook the product's 15 s, so a user's own 60 s hook with the product's absent closed the window at +45 s and the
// frame the CLI held at Stop was answered): MEASURED, `hook_started` names no command — {hook_id, hook_name:
// 'UserPromptSubmit', hook_event} on 2.1.312 (2.1.308 says nothing) — so the wrapper reads the hooks the CLI LOADS
// (promptHookCensus: the user / project / local / managed settings): when every UserPromptSubmit hook there is the
// product's (data/bin/vibespace-hook.mjs, registered with `timeout: 10`), a hook that starts is the product's ⇒ 10 s + 5 s;
// any other hook ⇒ ITS timeout (the CLI's 600 s default when it names none) + 5 s, alone or beside the product's; a file
// that cannot be read, or an enabled plugin (its hooks are its own), cannot be attributed ⇒ the user bound (fail closed).
// A bound that fires says «the prompt hook never answered» and the window falls to its backstop.
const PROMPT_HOOK_MARGIN_MS = 5000;
const PRODUCT_PROMPT_HOOK_MS = 10000 + PROMPT_HOOK_MARGIN_MS;
const OWN_PROMPT_HOOK_MS = 600000 + PROMPT_HOOK_MARGIN_MS;
function promptHookCensus() {
  const user = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const files = [path.join(user, 'settings.json'), path.join(process.cwd(), '.claude', 'settings.json'), path.join(process.cwd(), '.claude', 'settings.local.json'), '/etc/claude-code/managed-settings.json'];
  let product = 0, unknown = '';
  const other = [];
  for (const f of files) {
    let j = null;
    try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e && e.code !== 'ENOENT') unknown = unknown || `${f} unreadable`; continue; }
    if (j && j.enabledPlugins && typeof j.enabledPlugins === 'object' && Object.values(j.enabledPlugins).some(Boolean)) unknown = unknown || `a plugin is enabled in ${f}`;
    const groups = j && j.hooks && Array.isArray(j.hooks.UserPromptSubmit) ? j.hooks.UserPromptSubmit : [];
    for (const g of groups) for (const h of (g && Array.isArray(g.hooks) ? g.hooks : [])) {
      if (h && typeof h.command === 'string' && /vibespace-hook\.mjs/.test(h.command)) product++;
      else other.push(h && Number(h.timeout) > 0 ? Number(h.timeout) * 1000 : 600000);
    }
  }
  // a hook started and the settings name none: it is not attributable (a plugin's, a file the wrapper does not read) — fail closed
  if (!product && !other.length && !unknown) unknown = 'no UserPromptSubmit hook in the settings the wrapper reads';
  return { product, other, unknown };
}
function promptHookBound() {
  const c = promptHookCensus();
  if (!c.unknown && !c.other.length && c.product) return { ms: PRODUCT_PROMPT_HOOK_MS, why: "the product's hook — every UserPromptSubmit hook the CLI loads is data/bin/vibespace-hook.mjs: its registered 10 s timeout + 5 s" };
  const ms = Math.max(c.unknown ? 600000 : 0, ...c.other) + PROMPT_HOOK_MARGIN_MS;
  return { ms, why: c.unknown ? `a hook the wrapper cannot attribute (${c.unknown}): the CLI's 600 s default + 5 s` : `a hook that is not the product's: its timeout ${(ms - PROMPT_HOOK_MARGIN_MS) / 1000} s + 5 s` };
}
let hookTimer = null;             // the bound on the prompt-hook pause (armed while promptHooks is non-empty)
let hookBoundMs = 0;
const answeredHooks = new Set();  // hook_ids whose hook_response came BEFORE their hook_started (never a pin)
let boundUntil = null;            // when the armed backstop fires (epoch ms) — what a held frame's chip counts down to
let settleSaid = '';              // the last `queue_settle` the wrapper said (said on a change only)
const copies = new Map();         // msgId → {line, ts, cliUuid}: the history-buffer copy of a mid-turn frame (an edit rewrites it)
let handSeq = 0;
const startingCopies = [];        // msgIds of copied frames written to start a turn of their own: their init is the witness
const queueVerbs = () => (stateProven ? CLAUDE_QUEUE_VERBS : CLAUDE_HOLD_VERBS);

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
/** A slash command never joins a running turn (the CLI runs a command between turns) — it is held, stamped or not. */
const isCommandFrame = (o) => /^\s*\//.test(frameText(o));
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
    // a row VibeSpace typed, or a command, never joins a running turn — the strip draws no ⚡ on it (steerHeld says why)
    ...(q.origin || /^\s*\//.test(q.text || '') ? { steerable: false } : {}),
  }));
  meta.queue = items;
  scheduleMeta();
  // `verbs` rides every publication — the in-band twin of the sidecar advert.
  record('queue_changed', { items, turn_id: null, verbs: queueVerbs() });
}

/** THE PROOF (acceptance r2): the CLI's first state word — from here on the hand-over door is advertised (the sidecar
 *  NOW, not in 500 ms: the server gates a ⚡ on it) and a `webui_steer` stamp is honoured. Never revoked. */
function proveState() {
  stateProven = true;
  meta.caps.queueVerbs = CLAUDE_QUEUE_VERBS;
  if (metaTimer) { clearTimeout(metaTimer); metaTimer = null; }
  persistMeta();
  publishQueue();
  log('the CLI says its turn state — the hand-over door is advertised');
}

/** A frame goes to the CLI: the gate opens (when the frame can open a turn) and a frame-file body joins the history
 *  buffer here — at the moment it really reaches the CLI, so a frame Stop dropped never reads as a sent one. */
function forwardUser(line, o, buffered) {
  if (opensTurn(o)) { turnBusy = true; awaitingStart = true; }
  const mid = o && typeof o.webui_msg_id === 'string' ? o.webui_msg_id : '';
  if (mid && copies.has(mid)) { noteWritten(mid); startingCopies.push(mid); } // its own turn's user record is its witness (the init)
  sendChild(line);
  if (buffered) { buffer += line + '\n'; schedulePersist(); }
}

/** A MID-TURN FRAME THE PERSON SENT IS A RECORD OF THE CONVERSATION (acceptance r2). The CLI says nothing of it on stdout
 *  and its transcript keeps it only as an attachment (taken in) or not at all (held here, or still waiting in the CLI),
 *  so after a server restart its bubble — and the chip the records below stamp on it — was gone. ONE copy goes into the
 *  HISTORY BUFFER only (never stdout: the live view drew the bubble at send), shaped as the server's own record of a
 *  sent message (`_fromWebui` + `msgId`) and marked `webui_copy`: src/server/session-store.js keeps it through a restart,
 *  src/message-manager.js draws it once (the same msgId is the same bubble; the CLI's own later record claims it).
 *  It replaces a frame-file body's raw line (returns true): one record per frame.
 *  THE COPY IS A REFERENCE (acceptance r5, r6): its pictures — and a text block over 8 KB — are KEPT FILES beside this
 *  buffer (`<id>.img/<sha>.<ext>`; the frame file itself is unlinked once read), named by sha and extension ONLY
 *  (`source: {type:'kept', sha, ext, media_type, bytes}` — the folder is the session's own, never in the record:
 *  src/kept-copies.js, the ONE place that names, writes and reads them): never inline bytes, never a words-only cut; the
 *  line is ~233 B + ~135 B per picture. The restore reads the files back off the loop (boot-restore → kept-copies preload);
 *  a file that is gone draws a placeholder that SAYS so; one that could not be written is `unkept`. A file goes when the
 *  CLI witnessed its frame or the frame was dropped (settleCopy), the session's kept bytes are capped (the oldest go), and
 *  the session's sweeps take the folder. */
const KC = require(path.join(__dirname, '..', '..', 'src', 'kept-copies.js')); // the ONE place that names / writes / reads kept files
const KEPT_DIR = KC.keptDirOfBuffer(bufferFile);
/** THE HAND-OVER ORDER (acceptance r6): a copy says WHEN its frame reached the CLI — `handNo` 0 while it is held, the n-th
 *  frame written to the CLI once it is (handOver / a drain / a ⚡) — so a batch the CLI ran as one turn is claimed in that
 *  order, and a still-held copy never claims a record (the normalizer, src/message-manager.js). */
let handOrder = 0;
function copyLineOf(o, msgId, ts, cliUuid, handNo = 0) {
  const content = frameBlocks(o).map((b) => KC.keepBlock(b, KEPT_DIR, log));
  return JSON.stringify({ type: 'user', message: { role: 'user', content }, msgId, cliUuid, handNo, _fromWebui: true, webui_copy: true, timestamp: ts });
}
function recordPersonFrame(o, msgId, cliUuid) {
  const ts = new Date().toISOString();
  const line = copyLineOf(o, msgId, ts, cliUuid);
  buffer += line + '\n';
  copies.set(msgId, { line, ts, cliUuid, handNo: 0, settled: false });
  // only a SETTLED copy leaves the map (a pending one is pinned in the ring and its files are kept)
  if (copies.size > 64) for (const [k, c] of copies) { if (copies.size <= 64) break; if (c.settled) copies.delete(k); }
  const evicted = KC.capDir(KEPT_DIR);
  if (evicted.length) log(`the kept pictures passed ${KC.CAP_BYTES / 1048576} MB — the oldest ${evicted.length} file(s) evicted (their copies draw «no longer kept»)`);
  schedulePersist();
  return true;
}
/** Replace a copy's line in the buffer (an edit, a hand-over number). */
function replaceCopyLine(msgId, next) {
  const c = copies.get(msgId);
  if (!c || c.line === next) return;
  const at = buffer.lastIndexOf(c.line + '\n');
  if (at >= 0) { buffer = buffer.slice(0, at) + next + '\n' + buffer.slice(at + c.line.length + 1); schedulePersist(); }
  else { buffer += next + '\n'; schedulePersist(); }
  c.line = next;
}
/** The frame of `msgId` was just written to the CLI: its copy gets the next hand-over number. */
function noteWritten(msgId) {
  const c = msgId && copies.get(msgId);
  if (!c || c.handNo) return;
  c.handNo = ++handOrder;
  let rec = null; try { rec = JSON.parse(c.line); } catch { return; }
  rec.handNo = c.handNo;
  replaceCopyLine(msgId, JSON.stringify(rec));
}
/** The CLI WITNESSED the frame (its own record of it landed: taken in, its own turn, a follow-up) or it was DROPPED (put
 *  back, removed): its kept files go — a restart then draws the picture from the CLI's own record (claimedContent fills a
 *  gone picture), or the placeholder for a dropped one. A file another pending copy still names stays. */
function settleCopy(msgId) {
  const c = msgId && copies.get(msgId);
  if (!c || c.settled) return;
  c.settled = true;
  KC.dropFiles(KEPT_DIR, KC.namesToDrop(c.line, [...copies.values()].filter((x) => !x.settled).map((x) => x.line)));
}
const settleCopies = (ids) => { for (const id of ids || []) settleCopy(id); };
/** THE WITNESS (acceptance r4): the uuid a person's mid-turn frame carries to the CLI — the CLI keeps it as the uuid of its
 *  own user record of those words (a turn they ran as, a held frame drained, a kept frame's interrupted follow-up) and as
 *  the `source_uuid` of the `queued_command` attachment a frame taken in at a tool result becomes (measured on 2.1.312).
 *  The copy names it (`cliUuid`), so the normalizer claims the copy by THAT record, at any distance — never by its words.
 *  A frame that already carries a uuid keeps it; the stamp is spliced in front of the first key (never re-serialized). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function stampFrame(line, o) {
  if (o && typeof o.uuid === 'string' && UUID_RE.test(o.uuid)) return { line, uuid: o.uuid };
  const uuid = randomUUID();
  if (o) o.uuid = uuid;
  const t = String(line).trimStart();
  // a frame that opens a turn has a `message` key, so the object is never empty: the stamp is its new first key
  return { line: t.startsWith('{') ? `{"uuid":${JSON.stringify(uuid)},${t.slice(1)}` : line, uuid };
}
/** An EDITED held frame: its copy says the latest words (one record of the message, never the original beside it). */
function rewriteCopy(msgId, o) {
  const c = copies.get(msgId);
  if (!c) return;
  replaceCopyLine(msgId, copyLineOf(o, msgId, c.ts, c.cliUuid, c.handNo));
}

/** A frame goes to the CLI WHILE A TURN RUNS: never held, never editable again — witnessed into the turn (processLine). */
function handOver(line, { buffered = false, msgId = '', id = null, via = 'enter' } = {}) {
  noteWritten(msgId);
  sendChild(line);
  if (buffered) { buffer += line + '\n'; schedulePersist(); }
  handed.push({ id: id || `h${++handSeq}-${process.pid}`, msgId, ts: Date.now(), phase: 'handed' });
  record('input_handover', { state: 'handed', msg_ids: msgId ? [msgId] : [], via });
  log(`handed a frame to the running turn (${via}, ${handed.length} not yet taken in)`);
}
/** Resolve every handed frame at once (taken in / its own turn / kept by Stop) — one record for the lot. */
function settleHanded(state) {
  if (!handed.length) return [];
  const ids = handed.splice(0, handed.length).map((h) => h.msgId).filter(Boolean);
  record('input_handover', { state, msg_ids: ids });
  settleCopies(ids); // taken in with the last request, or its own turn's record: the CLI holds the frame now
  return ids;
}

/** The BACKSTOP on every "until the CLI says so" flag (acceptance r2, re-derived r4): the window closes on the CLI's
 *  WORDS — never on a clock the product's own prompt hook can outrun (r2's 2 s, started at the interrupted result, ran
 *  out inside a 2.5–3 s hook: the follow-up went uninterrupted and was answered after Stop; an owed turn's hook let a held
 *  frame drain into the turn the CLI was starting). So: no clock while a turn runs or a prompt hook runs; where the CLI
 *  owes a turn, OWED_BACKSTOP_MS (above every hook budget the product installs); where it owes nothing, SETTLE_BOUND_MS
 *  (no prompt hook can run). ONE log line says which, and why. */
const cliOwes = () => cliOwesTurn || !!(stopping && stopping.held > 0);
function armBound() {
  clearTimeout(boundTimer); boundTimer = null; boundUntil = null;
  if (turnBusy || promptHooks.size || !(cliOwesTurn || stopping)) { saySettle(); return; }
  const ms = cliOwes() ? OWED_BACKSTOP_MS : SETTLE_BOUND_MS;
  boundTimer = setTimeout(onBound, ms);
  if (ms === OWED_BACKSTOP_MS) boundUntil = Date.now() + ms;
  saySettle();
}
function onBound() {
  boundTimer = null; boundUntil = null;
  if (turnBusy || promptHooks.size) return;
  const owed = cliOwes(), ms = owed ? OWED_BACKSTOP_MS : SETTLE_BOUND_MS;
  const what = [];
  if (cliOwesTurn) { cliOwesTurn = false; what.push(`the turn owed for ${settleHanded('own-turn').length} handed frame(s)`); }
  if (stopping) { what.push(`the Stop window (${stopping.held} frame(s) the CLI held, ${stopping.follows} follow-up turn(s) interrupted)`); landRiding('the window closed with no follow-up'); settleCopies(stopping.kept); deliverHeldInterrupt('the window closed on its backstop'); stopping = null; }
  if (what.length) log(owed
    ? `backstop: no prompt hook, no follow-up turn and no idle ${ms} ms after the CLI's last word (above the product's prompt-hook budget: 3 s fetch, 10 s CLI timeout) — disarmed ${what.join(' + ')}`
    : `bound: the CLI owes nothing and said no idle ${ms} ms after its last result (a background task keeps it running) — closed ${what.join(' + ')}`);
  // THE BACKSTOP SPEAKS (acceptance r5, the deadline-card law): the frames held behind the window were drawn «held — the turn
  // is settling» with the seconds left; now the record says the turn never answered and they go
  if (owed && promptQueue.length) { record('queue_settle', { state: 'backstop', ms, msg_ids: promptQueue.map((q) => q.msgId).filter(Boolean) }); settleSaid = 'settled'; }
  drainPromptQueue();
  saySettle();
}
/** What the person's held frames say while a window the CLI OWES a turn is open (acceptance r5): `queue_settle` settling
 *  (with `until` = the backstop's deadline, null while a prompt hook pauses it), settled when the window closes. Said on a
 *  change only; nothing when no frame is held (no chip to say it on). */
function saySettle() {
  const open = !!(stopping || cliOwesTurn) && cliOwes() && promptQueue.length > 0;
  const until = open ? boundUntil : null;
  const key = open ? 'settling:' + until : 'settled';
  if (key === settleSaid || (!settleSaid && key === 'settled')) return;
  settleSaid = key;
  record('queue_settle', open ? { state: 'settling', until, ms: OWED_BACKSTOP_MS, why: stopping ? 'stop' : 'handover', ...(until === null && promptHooks.size ? { hook: true } : {}) } : { state: 'settled' });
}
/** The prompt-hook pause's own bound (acceptance r5, keyed on which hook runs since r6) — armed when the first hook starts,
 *  widened if a later census says longer; never narrowed while one runs. */
function armHookBound() {
  if (!promptHooks.size) { clearTimeout(hookTimer); hookTimer = null; hookBoundMs = 0; return; }
  const b = promptHookBound();
  if (hookTimer && b.ms <= hookBoundMs) return;
  clearTimeout(hookTimer);
  hookBoundMs = b.ms;
  hookTimer = setTimeout(() => {
    hookTimer = null;
    if (!promptHooks.size) return;
    const n = promptHooks.size; hookBoundMs = 0;
    promptHooks.clear();
    log(`the prompt hook never answered: ${n} UserPromptSubmit hook(s) said started and no hook_response in ${b.ms / 1000} s (${b.why}) — the window falls to its backstop`);
    armBound();
  }, b.ms);
}
function clearPromptHooks() { promptHooks.clear(); armHookBound(); }
/** A SECOND STOP INSIDE THE WINDOW IS HELD (acceptance r5): written raw while the follow-up's prompt hook runs it makes the
 *  CLI cancel the hook AND drop the frame it held (measured, both trees) — while the record says «kept». The CLI's turn is
 *  already stopped (its interrupted result came); what is left is the follow-up the window interrupts on its init anyway.
 *  So the person's interrupt is kept here and delivered as THE ONE interrupt on that init — or, when the window closes with
 *  no follow-up, to the settled CLI (which answers it; nothing runs). */
function holdSecondStop(line) {
  // the window is open and the CLI's turn already ended (its interrupted result came): what is left is the follow-up
  if (!stopping || turnBusy) return false;
  const prior = stopping.heldInterrupt;
  dropHeldForStop();
  stopping.heldInterrupt = line;
  // EVERY REQUEST GETS ITS RESPONSE (r6): a Stop folded into the newer one is answered here — the CLI answers the one delivered
  if (prior) { let rid = null; try { rid = JSON.parse(prior).request_id; } catch { } if (rid) record('control_response', { response: { subtype: 'success', request_id: rid }, webui_note: 'folded into the one interrupt on the follow-up init' }); }
  log(`a second Stop inside the window: held (${promptHooks.size ? "the follow-up's prompt hook runs — written now it would drop the kept frame" : 'delivered on the follow-up init or when the window closes'})`);
  return true;
}
function deliverHeldInterrupt(why) {
  if (!stopping || !stopping.heldInterrupt) return false;
  const line = stopping.heldInterrupt; stopping.heldInterrupt = null;
  sendChild(line);
  log(`the second Stop held in the window delivered (${why})`);
  return true;
}
/** A frame that RODE the tool result at Stop counted as held (the CLI may still hold it — r4); a window that closes with
 *  no follow-up turn proves the turn's last request took it: it is the turn's, as read — and the record says so. */
function landRiding(why) {
  if (!stopping || !stopping.riding || !stopping.riding.length || stopping.follows) return;
  record('input_handover', { state: 'landed', msg_ids: stopping.riding });
  settleCopies(stopping.riding);
  log(`the frame(s) that rode the last tool result went with the turn's last request — landed (${why})`);
  stopping.riding = [];
}

/** A user frame from the server: forwarded when no turn runs; while one runs, HANDED OVER when the person's door says so
 *  (`webui_steer` — plain Enter on a Claude conversation) AND this CLI has proven its state words AND no Stop is
 *  settling, else HELD (published + `queued_input` for its bubble) — a stamp is a request, never a bypass of the gate. */
function submitUser(line, o, { buffered = false } = {}) {
  if (!(turnBusy || cliOwesTurn || stopping) || !opensTurn(o)) { forwardUser(line, o, buffered); return; }
  const msgId = typeof o.webui_msg_id === 'string' ? o.webui_msg_id : '';
  const origin = typeof o.webui_origin === 'string' && o.webui_origin ? o.webui_origin : null;
  // the person's words are a record of the conversation the moment they reach us — before any chip names them (a slash
  // command is not: the CLI records the command it runs in a shape of its own)
  if (!origin && msgId && !isCommandFrame(o)) {
    const st = stampFrame(line, o);
    line = st.line;
    if (recordPersonFrame(o, msgId, st.uuid)) buffered = false;
  }
  if (o.webui_steer === true && !origin && !isCommandFrame(o) && stateProven && !stopping) { handOver(line, { buffered, msgId, via: 'enter' }); return; }
  promptQueue.push({ id: `q${++queueSeq}-${process.pid}`, ts: Date.now(), line, msgId, origin, text: frameText(o), preview: framePreview(o), attachments: frameAttachments(o), buffered });
  publishQueue();
  record('queued_input', { msg_id: msgId, turn_id: null });
  if (settleSaid.startsWith('settling')) settleSaid = ''; // a new chip: the settle state is said again for it
  saySettle();
  log(`held a mid-turn frame (${promptQueue.length} held${origin ? ', ' + origin : ''})`);
}

/** The turn ended: ONE held frame goes, the next waits for the end of the turn it starts (order = the strip's order). */
function drainPromptQueue() {
  if (turnBusy || cliOwesTurn || stopping || !promptQueue.length) return;
  const next = promptQueue.shift();
  publishQueue();
  let o = null; try { o = JSON.parse(next.line); } catch {}
  forwardUser(next.line, o, next.buffered);
  log(`drained a held frame at the turn end (${promptQueue.length} still held)`);
}

/** STOP MEANS STOP (the 2026-09-07 law) AND PUTS IT BACK (2026-10-24): every held frame is dropped — its own
 *  `queue_op_result {reason:'stopped'}` FIRST (the normalizer clears a chip that left the queue without a result as
 *  "it ran"), then ONE `queue_dropped` that says what happened to EACH frame of this turn (none ⇒ no record), then the
 *  emptied `queue_changed` — all BEFORE the interrupt reaches the CLI, so nothing held can run after it. And the STOP
 *  WINDOW opens (acceptance r2): until the CLI settles, every frame is held and every turn it starts for a frame it
 *  still holds is interrupted on its init (processLine). */
function dropHeldForStop() {
  // EACH handed frame's fate, as the wrapper witnessed it: one the model already read (`riding` — the tool result took it
  // in — or landed) stays in the conversation as read; one the CLI still holds would RUN after the interrupt (measured),
  // so it is KEPT — the turn the CLI starts for it is interrupted on its init. Neither is put back: they are the turn's.
  // A frame that RODE a tool result (`riding`: written before that tool_result line, the model has not spoken since) is
  // NOT landed yet (acceptance r4): written just before the line, it may have missed that request — the CLI then still
  // holds it and runs it after the interrupt. Only the model's next record proves it was read, so at Stop it counts as
  // HELD (the follow-up is interrupted); a window that closes with no follow-up settles it as landed afterwards
  // (landRiding). The window is the model's time to its first record after the tool result, plus the pipe's latency —
  // longer on an ssh keeper session.
  const keptIds = handed.map((h) => h.msgId).filter(Boolean);
  const riding = handed.filter((h) => h.phase === 'riding').map((h) => h.msgId).filter(Boolean);
  const landedIds = landedThisTurn.slice();
  const held = handed.length + (stopping ? stopping.held : 0);
  const live = turnBusy || cliOwesTurn || !!stopping;
  handed.length = 0; landedThisTurn = []; cliOwesTurn = false;
  if (live) { stopping = { held, follows: stopping ? stopping.follows : 0, riding: (stopping ? stopping.riding || [] : []).concat(riding), heldInterrupt: stopping ? stopping.heldInterrupt || null : null, kept: (stopping ? stopping.kept || [] : []).concat(keptIds.filter((x) => !riding.includes(x))) }; armBound(); }
  const dropped = promptQueue.splice(0, promptQueue.length);
  settleCopies(dropped.map((q) => q.msgId)); // put back (or VibeSpace's own): never run — its kept files go
  for (const q of dropped) record('queue_op_result', { op: 'remove', id: q.id, ok: true, msg_id: q.msgId, reason: 'stopped' });
  const putBack = dropped.filter((q) => !q.origin);
  if (putBack.length || keptIds.length || landedIds.length) {
    record('queue_dropped', {
      ...droppedRecordFor(putBack.map((q) => ({ id: q.id, msgId: q.msgId, ts: q.ts, text: q.text, attachments: q.attachments })), { dropId: `${process.pid}-${++dropSeq}`, turnId: null }),
      ...(keptIds.length ? { kept: keptIds.length, keptIds } : {}),
      ...(landedIds.length ? { landed: landedIds.length, landedIds } : {}),
    });
  }
  if (dropped.length) publishQueue();
  log(`interrupt: dropped ${dropped.length} held frame(s) (put back=${putBack.length}); handed: ${keptIds.length} kept (${riding.length} of them riding a tool result), ${landedIds.length} landed${live ? ' — the Stop window is open' : ''}`);
  saySettle();
}
/** The Stop window closes: the CLI settled (its idle — or its result, where it says no state word). */
function settleStop(why) {
  if (!stopping) return;
  landRiding(why);
  settleCopies(stopping.kept); // the follow-up's interrupted record holds the kept frames
  deliverHeldInterrupt(`the window settled: ${why}`);
  log(`stop settled (${why}): ${stopping.held} frame(s) the CLI held at Stop, ${stopping.follows} follow-up turn(s) interrupted`);
  stopping = null;
  armBound();
}

/** Why a held row may NOT be handed over (null = it may): a command only runs between turns; a row VibeSpace typed is
 *  never the person's to push into the turn; a Stop that has not settled takes nothing in; a CLI that never said a
 *  state word cannot be trusted to run what it was handed (acceptance r2). */
const NOT_STEERABLE = {
  command: 'a command runs between turns — it runs when this turn ends',
  origin: "VibeSpace's own message runs between turns — it runs when this turn ends",
  stopping: 'the turn is being stopped — it runs as soon as the stop settles',
  unproven: 'this agent has not shown it can take a message into a running turn — it runs when this turn ends',
};
function notSteerable(entry, o) {
  if (entry.origin) return 'origin';
  if (!opensTurn(o) || isCommandFrame(o)) return 'command';
  if (stopping) return 'stopping';
  if (!stateProven) return 'unproven';
  return null;
}

/** Hand ONE held row over (the ⚡ / «inject all»): while a turn runs it joins that turn like an Enter frame; with no turn
 *  running it is a plain send (it starts the turn — never lost). notSteerable() refuses the rest, each saying why. */
function steerHeld(entry, op) {
  let o = null; try { o = JSON.parse(entry.line); } catch {}
  const why = notSteerable(entry, o);
  if (why) {
    record('queue_op_result', { op, id: entry.id, ok: false, reason: 'not-steerable', why, detail: NOT_STEERABLE[why], msg_id: entry.msgId });
    return false;
  }
  promptQueue.splice(promptQueue.indexOf(entry), 1);
  record('queue_op_result', { op, id: entry.id, ok: true, msg_id: entry.msgId });
  if (turnBusy || cliOwesTurn) handOver(entry.line, { buffered: entry.buffered, msgId: entry.msgId, id: entry.id, via: 'steer' });
  else forwardUser(entry.line, o, entry.buffered);
  return true;
}

/** queue-op stdin verb — remove / reorder / edit / steer / steer-all (CLAUDE_QUEUE_VERBS): splices on the local array.
 *  The adapter and the ws layer refuse run-now / run-all before a frame is built; the arm below REPORTS one that reaches
 *  us anyway (never a silent drop). `afterId` null = the front of the queue (the codex vocabulary verbatim). */
function handleQueueOp(msg) {
  const op = String(msg?.op || '');
  const id = String(msg?.id || '');
  if (!CLAUDE_QUEUE_VERBS.includes(op)) {
    record('queue_op_result', {
      op, id, ok: false,
      reason: /^run-/.test(op) ? 'not-startable' : 'unknown-op',
      detail: /^run-/.test(op) ? 'a held message starts as soon as the current turn ends' : `this agent has no queue action "${op}"`,
    });
    return;
  }
  if (op === 'steer-all') {
    // in queue order, each its own frame (images ride with their own words); a command stays held and says why
    for (const entry of promptQueue.slice()) steerHeld(entry, op);
    publishQueue();
    return;
  }
  const idx = promptQueue.findIndex((q) => q.id === id);
  if (idx < 0) { record('queue_op_result', { op, id, ok: false, reason: 'gone', detail: 'it is no longer queued' }); publishQueue(); return; }
  if (op === 'steer') { if (steerHeld(promptQueue[idx], op)) publishQueue(); return; }
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
    rewriteCopy(entry.msgId, o);
    record('queue_op_result', { op, id, ok: true, msg_id: entry.msgId });
    publishQueue();
    return;
  }
  const [dropped] = promptQueue.splice(idx, 1);
  record('queue_op_result', { op, id, ok: true, msg_id: dropped.msgId });
  settleCopy(dropped.msgId); // removed: it never runs — its kept files go
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

  // THE PROMPT HOOK'S PHASE (acceptance r4): the adapter spawns the CLI with CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS,
  // so it says when a UserPromptSubmit hook starts and ends — the ONE word before a turn's init that says "a turn is
  // starting" (2.1.312: after an interrupted result the follow-up's hook starts ~10 ms later; the product's own hook then
  // waits on the hub for up to 3 s before the init). These lines are the wrapper's instrumentation, never the chat's: not
  // teed, not buffered. While one runs NO backstop counts — the window stays open until the init it precedes (interrupted
  // there) or the idle. The follow-up is NOT interrupted here: measured on 2.1.312, an interrupt during the hook makes the
  // CLI cancel it AND DROP the frame it held from the conversation (no user record, the next request lacks it) — the kept
  // frame «stays with the turn» only when the init is what is interrupted.
  if (msg.type === 'system' && msg.hook_event === 'UserPromptSubmit' && !msg.parent_tool_use_id
      && (msg.subtype === 'hook_started' || msg.subtype === 'hook_progress' || msg.subtype === 'hook_response')) {
    const hid = String(msg.hook_id || '');
    if (msg.subtype === 'hook_started') {
      if (answeredHooks.delete(hid)) return; // its response already came (out of order): it runs no more
      promptHooks.add(hid);
      clearTimeout(boundTimer); boundTimer = null; boundUntil = null;
      armHookBound();
      saySettle();
      if (stopping && stopping.held > 0 && !turnBusy) log(`the CLI is running a follow-up turn's prompt hook for what it held at Stop — the window waits for its init`);
    } else if (msg.subtype === 'hook_response') {
      if (!promptHooks.delete(hid)) { answeredHooks.add(hid); if (answeredHooks.size > 16) answeredHooks.delete(answeredHooks.values().next().value); }
      armHookBound();
      armBound();
    }
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
    if (msg.type === 'system' && msg.subtype === 'session_state_changed' && typeof msg.state === 'string') {
      cliState = msg.state;
      if (!stateProven) proveState();
    }
    const busyWord = cliState === 'running' || cliState === 'requires_action';
    const starts = msg.type === 'system' && msg.subtype === 'init' && busyWord;
    const idle = msg.type === 'system' && msg.subtype === 'session_state_changed' && msg.state === 'idle';
    // THE WITNESS (2.369.361): a handed frame rides the request the CLI builds after a tool result (not one Stop
    // rejected), and the model speaking after it is that request answered
    if (handed.length) {
      if (msg.type === 'user' && !stopping && Array.isArray(msg.message?.content) && msg.message.content.some((b) => b && b.type === 'tool_result')) {
        for (const h of handed) if (h.phase === 'handed') h.phase = 'riding';
      } else if (msg.type === 'assistant' && handed.some((h) => h.phase === 'riding')) {
        const landed = handed.filter((h) => h.phase === 'riding');
        for (const h of landed) handed.splice(handed.indexOf(h), 1);
        const ids = landed.map((h) => h.msgId).filter(Boolean);
        landedThisTurn.push(...ids);
        record('input_handover', { state: 'landed', msg_ids: ids });
        settleCopies(ids);
      }
    }
    if (starts) {
      turnBusy = true; awaitingStart = false;
      clearTimeout(boundTimer); boundTimer = null; boundUntil = null;
      clearPromptHooks(); // the turn started: no prompt hook of its own still runs (a lost hook_response never pins the clock)
      settleCopies(startingCopies.splice(0, startingCopies.length)); // a drained frame's own turn wrote its user record
      if (stopping && stopping.held > 0) {
        // A TURN THE CLI STARTS INSIDE THE STOP WINDOW for frames it held at Stop — EVERY one (it may split them into
        // several): a second interrupt on THIS line, IN THIS TICK. Its request leaves ~12 ms after this init (measured);
        // a timer or an await here lets it through (a 25 ms-late copy was answered — scripts/test-claude-steer-chrome §0).
        // A second Stop the person sent inside the window IS that interrupt (its request id, answered by the CLI).
        if (!deliverHeldInterrupt('on the follow-up init')) sendChild(JSON.stringify({ type: 'control_request', request_id: `vs-stop-follow-${process.pid}-${++handSeq}`, request: { subtype: 'interrupt' } }));
        stopping.follows++;
        log(`interrupt: the CLI started follow-up turn ${stopping.follows} for what it held at Stop — interrupted on its init`);
      } else if (cliOwesTurn) {
        // the CLI's own turn for what it was still holding: theirs now — a Stop in it stops a TURN, it keeps no message
        cliOwesTurn = false;
        settleHanded('own-turn');
        // the deadline-card law (r6): the window that held frames behind it ENDED at this init — say so, no countdown
        if (promptQueue.length) { record('queue_settle', { state: 'running', why: 'handover' }); settleSaid = 'running'; }
      }
    } else if (msg.type === 'result' || (idle && !awaitingStart)) {
      turnBusy = false; awaitingStart = false; turnEnded = true;
      if (msg.type === 'result') {
        // a frame that rode this turn's last request is in the conversation as read, whatever the model said after
        const rode = handed.filter((h) => h.phase === 'riding');
        if (rode.length) { for (const h of rode) handed.splice(handed.indexOf(h), 1); record('input_handover', { state: 'landed', msg_ids: rode.map((h) => h.msgId).filter(Boolean) }); settleCopies(rode.map((h) => h.msgId)); }
        // the turn ended before the CLI took these in: it runs them as a turn of its own next (measured), and no held
        // frame may cut in before that turn
        if (handed.length && !stopping) cliOwesTurn = true;
        landedThisTurn = [];
        // a CLI that says no state word settles a Stop at its result (the base's inference — it was handed nothing)
        if (stopping && !stateProven) settleStop('result');
      } else if (cliOwesTurn) {
        // …unless the CLI went idle instead: it holds nothing — they went into the conversation with the last request
        cliOwesTurn = false;
        settleHanded('landed');
      }
      if (idle) settleStop('idle');
      armBound();
    }
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
  // …and only THEN the next held frame: the turn end is on the wire before the queue that follows it (not while the CLI
  // still owes a turn for frames handed to the one that just ended — drainPromptQueue waits for that turn)
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
  clearPromptHooks();
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
    trimBuffer();
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
let stdinLineBuf = '';
try {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data) => {
    stdinLineBuf += data;
    let nlIdx;
    while ((nlIdx = stdinLineBuf.indexOf('\n')) !== -1) {
      const line = stdinLineBuf.substring(0, nlIdx).replace(/\r/g, '').trim();
      stdinLineBuf = stdinLineBuf.substring(nlIdx + 1);
      if (!line) continue;
      // Immediately ack on stdout so the server knows stdin is alive.
      // This fires before claude processes the message, so it works
      // even when the model takes 30+ seconds to respond.
      try { process.stdout.write(JSON.stringify({ type: '_stdin_ack', timestamp: Date.now() }) + '\n'); } catch {}
      try {
        const parsed = JSON.parse(line);
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
        // through as it always did (the server's 2 s SIGINT fallback is unchanged); a handed frame stays with the turn
        if (parsed.type === 'control_request' && parsed.request && parsed.request.subtype === 'interrupt' && holdSecondStop(line)) continue;
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
      } catch {
        // Plain text — wrap as stream-json user message
        const wrapped = { type: 'user', message: { role: 'user', content: [{ type: 'text', text: line }] } };
        submitUser(JSON.stringify(wrapped), wrapped);
      }
    }
  });
} catch (err) {
  log(`stdin setup failed: ${err.message}`);
}

startChild();
publishQueue();   // the BASELINE (an empty queue, said once at boot — the acp wrapper's rule)

process.on('uncaughtException', (err) => { log(`Uncaught: ${err.message}\n${err.stack}`); });

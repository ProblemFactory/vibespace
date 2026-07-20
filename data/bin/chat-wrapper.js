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
// real xingweil report). Enable the offset machinery whenever the placeholder
// is present, not only for REMOTE_SID.
const OFFSET_MODE = !!REMOTE_SID || process.argv.slice(5).some(a => a.includes('__VS_OFFSET__'));
let remoteOffset = 0;        // bytes of the REMOTE buffer consumed (byte-exact)
let remoteExited = null;     // set when the keeper's _remote_exit sentinel arrives
let reconnectAttempts = 0;
let reconnectTimer = null;
const inputQueue = [];       // stdin lines that arrived while the pipe was down

log(`Starting: cmd=${cmd} args=${JSON.stringify(args.slice(0, 5))}... cwd=${process.cwd()}${REMOTE_SID ? ` remoteSid=${REMOTE_SID}` : ''}`);

if (!bufferFile || !cmd) {
  log('Missing arguments');
  process.exit(1);
}

// Ensure stream-json flags are in args
if (!args.includes('--output-format')) {
  args.push('--output-format', 'stream-json');
}
if (!args.includes('--input-format')) {
  args.push('--input-format', 'stream-json');
}
if (!args.includes('--verbose')) {
  args.push('--verbose');
}
if (!args.includes('--permission-prompt-tool')) {
  args.push('--permission-prompt-tool', 'stdio');
}

// Write initial metadata
try { fs.mkdirSync(path.dirname(metaFile), { recursive: true }); } catch {}
const meta = { pid: process.pid, startedAt: Date.now(), mode: 'chat', tasks: {}, todos: [] };
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

let child = null;
let childDead = true;

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
    log(`remote session exited on host with code ${remoteExited}`);
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

  // Child stderr → log (not shown to user, but useful for debugging)
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    log(`[stderr] ${chunk.trim()}`);
  });

  child.on('exit', (exitCode) => {
    childDead = true;
    log(`Child exited with code ${exitCode}`);
    // Remote + the session did NOT end on the host + we weren't told to die:
    // this was a transport (ssh) death — reconnect, never finalize.
    if (OFFSET_MODE && remoteExited === null && !shuttingDown) {
      meta.remote = { state: 'reconnecting', attempts: reconnectAttempts + 1, at: Date.now() };
      meta.streaming = meta.streaming || false; // keep whatever the stream last said
      scheduleMeta();
      scheduleReconnect();
      return;
    }
    finalize(remoteExited !== null ? remoteExited : exitCode);
  });

  child.on('error', (err) => {
    childDead = true;
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
  try { process.stdout.write(JSON.stringify({ type: '_remote_state', state: 'reconnecting', attempts: reconnectAttempts }) + '\n'); } catch {}
  reconnectTimer = setTimeout(startChild, delay);
}

let shuttingDown = false;
function finalize(exitCode) {
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
  persistMeta();
  process.exit(exitCode ?? 0);
}

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
          sendChild(JSON.stringify({
            type: 'user',
            message: { role: 'user', content: [{ type: 'text', text: cmdText }] },
          }));
          log(`Goal ${meta.goal ? 'set (native): ' + meta.goal.substring(0, 80) : 'cleared (native)'}`);
          continue;
        }
        // Pass through as-is to claude
        void parsed;
        sendChild(line);
      } catch {
        // Plain text — wrap as stream-json user message
        sendChild(JSON.stringify({
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: line }] }
        }));
      }
    }
  });
} catch (err) {
  log(`stdin setup failed: ${err.message}`);
}

startChild();

process.on('uncaughtException', (err) => { log(`Uncaught: ${err.message}\n${err.stack}`); });

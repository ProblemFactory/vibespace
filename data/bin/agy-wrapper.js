#!/usr/bin/env node
// ANTIGRAVITY CLI CHAT WRAPPER (lane antigravity-harness, design q-053 re-cut for `agy`; the owner 2026-10-20 「如果有
// antigravity cli 就别搞 gemini cli 了」). It runs inside dtach exactly like acp-wrapper.js and speaks the SAME journal
// ('acp-events' records, shapes documented at the top of data/bin/acp-wrapper.js) — so the normalizer
// (src/acp-message-manager.js), the stdout consumer (src/server/stdout/acp-events.js), the queue strip and the
// artifacts reader are the proven ACP ones. What differs is the AGENT side: agy is NOT ACP. It is ONE
//   agy --input-format stream-json --output-format stream-json [--model M] [--effort E] [--mode X |
//       --dangerously-skip-permissions] [--conversation <id>]
// process per conversation (measured on agy 1.4.3 --help + the headless docs, scripts/fixtures/antigravity-cli-1.4.3.json):
//   in : one line per user turn {"event":"user","message":{"content":"…"}} — TEXT ONLY (another block type ⇒ ERROR,
//        exit 1); a turn's `result` must arrive before the next line; closing stdin ends the session (exit 0).
//   out: {"event":"init","conversation_id","init":{cwd,tools,permission_mode,model?,agent?}} once;
//        {"event":"step_update","step_update":{conversation_id,step_index,state ACTIVE|DONE,step_type user_input|
//        agent_response|tool|checkpoint,text_delta?,tool_name?,tool_info?{name,parameters,output,error{type,message}},
//        subagent_info?,usage?,duration_seconds?}}; {"event":"result","result":{conversation_id,status SUCCESS|ERROR|
//        CANCELED|INTERRUPTED|INVALID|WAITING|RUNNING,response,error?,num_turns,usage{…}}} per turn.
//   A SLASH COMMAND agy answers itself (/model, /usage …) or a control_request in the stream ends the session (exit 2)
//   ⇒ a chat-input whose first word is one of agy's OWN commands (the closed, measured list in
//   src/harnesses/antigravity-slash.js) is REFUSED HERE and never reaches agy; any other line — one that starts with a
//   path (the composer's upload puts the file's path first) or another "/…" — is text and is sent. There is no cancel
//   and no model switch in the stream ⇒ Stop, set-model / set-effort / set-mode RESTART the process on the same
//   conversation (--conversation).
//   stderr carries diagnostics: an unauthenticated agy prints its OAuth URL and then WAITS 60 s reading a pasted code on
//   ITS STDIN (measured) — our next user line would be read as that code — so the URL line kills the child at once and
//   is said as the auth-required refusal; a tool that needed approval is SOFT-DENIED (the run continues) and its stderr
//   notice becomes the permission card 「agy skipped <tool>」 whose "Allow and retry" restarts agy on the same
//   conversation with --dangerously-skip-permissions for ONE turn and asks it to retry (a run has no per-tool grant;
//   the card says so); an `AGY_ERROR: {...}` line becomes an error notice.
//   argv: <bufferFile> <sidecarMetaFile> <agyCommand> [extra agy args…] — <agyCommand> is ONE executable, agy itself by its
//         absolute path (src/spawn/line.js builds this line; the session's names ride the env, never these words);
//         anything else is refused BY NAME before a spawn (commandRefusal below)
//   env:  AGY_WEBUI_CWD, AGY_WEBUI_MODEL, AGY_WEBUI_EFFORT, AGY_WEBUI_MODE ('' | accept-edits | auto | plan |
//         bypassPermissions), AGY_WEBUI_RESUME_ID (a conversation id), AGY_WEBUI_SESSION_NAME, AGY_WEBUI_BACKEND
//         ('antigravity'), VIBESPACE_API / VIBESPACE_SESSION_TOKEN (the task-context prefix + the stop-time nudge).
// Program-use billing law: agy runs its OWN login; this wrapper never holds a vendor secret, never calls a vendor API.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
// agy's own slash commands: the ONE closed list, PURE (no require), read beside src/ as chat-wrapper.js reads claude-transport.js
const { agySlashCommand } = require(path.join(__dirname, '..', '..', 'src', 'harnesses', 'antigravity-slash.js'));

const bufferFile = process.argv[2];
const metaFile = process.argv[3];
const cmd = process.argv[4];
const extraArgs = process.argv.slice(5); // the settings row's extra args (appended to every agy start)
const logFile = path.join(path.dirname(bufferFile || '/tmp/agy-wrapper'), 'agy-wrapper.log');
const HARNESS = process.env.AGY_WEBUI_BACKEND || 'antigravity';
const baseCwd = process.env.AGY_WEBUI_CWD || process.cwd();
const resumeId = process.env.AGY_WEBUI_RESUME_ID || '';
const sessionName = process.env.AGY_WEBUI_SESSION_NAME || '';
const MAX_BUFFER = 800000;
// our permission modes onto agy's: '' = agy's own setting (request-review), the three --mode values, and bypass
const MODES = Object.freeze(['', 'accept-edits', 'auto', 'plan', 'bypassPermissions']);
const EFFORTS = Object.freeze(['', 'low', 'medium', 'high', 'xhigh', 'max']);
// lane agy-harness-fixes (bug 4): + 'steer' — agy takes no input mid-turn, so a steer stops the running turn (a restart on
// the same conversation; what it did stays) and runs the steered message first. 'steer-all' stays refused.
const QUEUE_VERBS = ['remove', 'steer', 'reorder', 'edit'];
// THE AUTH GATE: an unauthenticated agy prints its OAuth URL at once and then reads a pasted code on its STDIN, so a
// user line written before that URL shows would be swallowed as the code. The first line waits until agy has said
// anything on stdout (init) or AUTH_GRACE_MS passed with no sign-in request on stderr.
const AUTH_GRACE_MS = Number(process.env.AGY_WEBUI_AUTH_GRACE_MS || 2000);

function log(msg) {
  try {
    try { if (fs.statSync(logFile).size > 5242880) fs.renameSync(logFile, logFile + '.old'); } catch { }
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] [${HARNESS}] ${msg}\n`);
  } catch { }
}
const now = () => new Date().toISOString();
const safeJsonParse = (t, f = null) => { try { return JSON.parse(t); } catch { return f; } };
const asArray = (v) => (Array.isArray(v) ? v : []);
const clip = (v, n = 4000) => { const s = typeof v === 'string' ? v : JSON.stringify(v ?? null); return s && s.length > n ? s.slice(0, n) + '…' : s; };
if (!bufferFile || !metaFile || !cmd) { log('Missing required arguments (bufferFile, metaFile, agy command)'); process.exit(1); }
// THE EXECUTABLE (lane antigravity-spawn-argv, 2026-10-21): this wrapper puts agy's flags FIRST, so argv[4] must BE agy.
// The owner's 2.369.334 hub handed `/usr/bin/env K=V … agy` here. `env --input-format …` exited 125 with its usage, and
// the session said only «exit code 125 — see agy-wrapper.log». A command that is not an absolute executable, or is a
// launcher, is now refused by name: the sentence is the session's error line, and nothing is spawned.
function commandRefusal(c) {
  const unresolved = `agy-wrapper: the command is not an executable: ${c} — the hub's Antigravity path is unresolved; reinstall agy or set ANTIGRAVITY_CMD`;
  if (!path.isAbsolute(c)) return unresolved;
  if (path.basename(c) === 'env') return `agy-wrapper: the command is ${c}, a launcher, not agy — the hub put an env prefix where the executable goes (agy's flags would land in front of it); update VibeSpace`;
  try { if (!fs.statSync(c).isFile()) return unresolved; fs.accessSync(c, fs.constants.X_OK); } catch { return unresolved; }
  return null;
}

const state = {
  model: process.env.AGY_WEBUI_MODEL || '',
  effort: EFFORTS.includes(process.env.AGY_WEBUI_EFFORT || '') ? (process.env.AGY_WEBUI_EFFORT || '') : '',
  mode: MODES.includes(process.env.AGY_WEBUI_MODE || '') ? (process.env.AGY_WEBUI_MODE || '') : '',
};
const meta = {
  pid: process.pid, startedAt: Date.now(), mode: 'chat', backend: HARNESS, cwd: baseCwd,
  sessionId: resumeId || null, sessionName: sessionName || null, streaming: false, activePromptId: null,
  model: state.model, agentMode: state.mode, effort: state.effort, configOptions: [], modes: null, availableCommands: [], todos: [], usage: null, pendingRequests: {},
  acp: { agentInfo: { name: 'agy', title: 'Antigravity CLI', version: null }, capabilities: { loadSession: true }, protocolVersion: null, authMethods: [] },
  // the same advert as acp-wrapper (frameFile, the wrapper-owned queue + its verbs, the read-only rules verb,
  // queue-resync) — every verb below is served by THIS file. peerMessage (lane agy-peer-wake): the 'peer-message' frame
  // is served below (idle ⇒ a turn, busy ⇒ queued after it) and answered honestly on `peer_result`, so the delivery
  // ladder's live rung may write it (backend-caps peerDelivery 'rpc-queue'). notificationSteer:false — 'steer' here is
  // a STOP + a new billed turn, never codex's free fold into the running turn: said explicitly, so the verb list above
  // can never make a mid-turn notification look free (src/server/wrapper-files.js wrapperCaps: explicit beats derived).
  caps: { frameFile: true, peerMessage: true, notificationSteer: false, inputQueue: true, queueVerbs: QUEUE_VERBS, permissionRules: true, queueResync: true },
  queue: [],
};

let buffer = '', writeTimer = null, metaTimer = null;
function persistBuffer() { writeTimer = null; try { fs.mkdirSync(path.dirname(bufferFile), { recursive: true }); fs.writeFileSync(bufferFile, buffer); } catch { } }
function persistMeta() { metaTimer = null; try { fs.mkdirSync(path.dirname(metaFile), { recursive: true }); fs.writeFileSync(metaFile, JSON.stringify(meta)); } catch { } }
function schedulePersist() { if (!writeTimer) writeTimer = setTimeout(persistBuffer, 1000); }
function scheduleMeta() { if (!metaTimer) metaTimer = setTimeout(persistMeta, 200); }
function writeRecord(rec) {
  const line = JSON.stringify(rec);
  buffer += line + '\n';
  if (buffer.length > MAX_BUFFER) { const i = buffer.indexOf('\n', buffer.length - MAX_BUFFER); if (i > 0) buffer = buffer.slice(i + 1); }
  try { process.stdout.write(line + '\n'); } catch { }
  schedulePersist();
}
function record(kind, fields = {}) { writeRecord({ ts: now(), type: 'acp', kind, ...fields }); }
function notice(level, text, noticeKind = null) { record('notice', { level, text, noticeKind }); log(`${level}: ${text}`); }

const modeValues = () => ['accept-edits', 'auto', 'plan', 'bypassPermissions'];
function configSnapshot() {
  return { configOptions: [], modes: { availableModes: modeValues().map((id) => ({ id, name: id })), currentModeId: state.mode || null }, models: [], modeValues: modeValues(), model: state.model, mode: state.mode, effort: state.effort };
}

// ── the agy child ──
let child = null, shuttingDown = false, restarting = false, sessionRecorded = false, authFailed = false, childSpokeAt = 0, childStartedAt = 0;
/** Resolves when a user line may be written to agy (see AUTH_GATE): agy spoke, or the grace passed with no sign-in request. */
function authGate() {
  return new Promise((resolve) => {
    const tick = () => {
      if (authFailed || !child) return resolve(false);
      if (childSpokeAt || Date.now() - childStartedAt >= AUTH_GRACE_MS) return resolve(true);
      setTimeout(tick, 50);
    };
    tick();
  });
}
let markReady = null, markReadyFailed = null, markReadyDone = false;
const readyPromise = new Promise((res, rej) => { markReady = res; markReadyFailed = rej; });
readyPromise.catch(() => { });

function childArgs() {
  // --print-timeout 0 = "wait until the turn completes" (the 1.4.3 binary's default; its docs page still says 5 m) —
  // pinned, so a default that flips back can never cut a long turn short (our own turn bounds are the ceiling)
  const a = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--print-timeout', '0'];
  if (state.model) a.push('--model', state.model);
  if (state.effort) a.push('--effort', state.effort);
  if (state.mode === 'bypassPermissions' || retryBypass) a.push('--dangerously-skip-permissions');
  else if (state.mode) a.push('--mode', state.mode);
  if (meta.sessionId) a.push('--conversation', meta.sessionId);
  return a.concat(extraArgs);
}

function startChild() {
  const args = childArgs();
  childRetryBypass = retryBypass && state.mode !== 'bypassPermissions';
  try { child = spawn(cmd, args, { cwd: baseCwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (err) { notice('error', `Could not start Antigravity (${cmd}): ${err.message}`, 'spawn-failed'); finalizeExit(1); return; }
  const mine = child;
  meta.childPid = child.pid; scheduleMeta();
  log(`spawned ${cmd} ${args.join(' ')} pid=${child.pid}`);
  childSpokeAt = 0; childStartedAt = Date.now();
  let outBuf = Buffer.alloc(0), errBuf = '';
  child.stdout.on('data', (chunk) => {
    outBuf = outBuf.length ? Buffer.concat([outBuf, chunk]) : chunk;
    let i;
    while ((i = outBuf.indexOf(10)) !== -1) { const line = outBuf.subarray(0, i).toString('utf8').trim(); outBuf = outBuf.subarray(i + 1); if (line) { if (!childSpokeAt) childSpokeAt = Date.now(); handleEvent(line); } }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    errBuf += chunk;
    let i;
    while ((i = errBuf.indexOf('\n')) !== -1) { const line = errBuf.slice(0, i).replace(/\r/g, ''); errBuf = errBuf.slice(i + 1); if (line.trim()) handleStderr(line); }
  });
  child.on('error', (err) => { notice('error', `Antigravity process error: ${err.message}`, 'child-error'); });
  setImmediate(drainPromptQueue); // what queued behind a restart runs on the new process
  if ([...subs.values()].some((x) => !x.done)) armSubTail(); // a sub still working when agy restarted
  child.on('exit', (code, signal) => {
    if (mine !== child) return; // an old child after a restart
    child = null;
    if (restarting) return;   // the restart path starts the next one
    subsAtExit();
    const cur = activePrompt;
    if (cur) endPrompt(cur, 'error', { message: `Antigravity exited (${signal || code})` }, cur.opts || {});
    if (cur && !cur.dispatched) peerBack(cur, `Antigravity exited (${signal || code}) before it was delivered`); // its handler never answers now
    if (!shuttingDown && !authFailed) {
      if (code === 2) notice('error', 'Antigravity ended this session (exit 2): its stream refused a message it does not take in a running session (a slash command or a control message). Resume the conversation to continue.', 'agent-exited');
      else if (!markReadyDone || code) notice('error', `Antigravity exited (${signal ? 'signal ' + signal : 'exit code ' + code}) — see agy-wrapper.log. Resume the conversation to continue.`, 'agent-exited');
    }
    finalizeExit(authFailed ? 1 : (code ?? 0));
  });
}

/** Restart agy on the same conversation with the current flags (a model / effort / mode switch, or Stop). */
function restartChild(why) {
  if (restarting) return;   // the restart in flight reads the flags when it starts the next process
  if (!child) { startChild(); return; }
  restarting = true;
  const old = child;
  old.once('exit', () => { restarting = false; if (!shuttingDown) startChild(); });
  try { old.stdin.end(); } catch { }
  setTimeout(() => { try { old.kill('SIGTERM'); } catch { } }, 300).unref();
  setTimeout(() => { try { old.kill('SIGKILL'); } catch { } }, 5000).unref();
  log(`restart (${why}) on conversation ${meta.sessionId || '(new)'}`);
}

// ── SUBAGENT CARDS (lane agy-subagent-cards, 2026-10-21 — the owner: «使用子代理的时候怎么没有子代理卡片查看细节») ──
// agy's invoke_subagent runs ASYNC (MEASURED on the owner's store, 2026-10-21): the tool's own output is only «Created
// the following subagent: {conversationId …}»; the sub works in its OWN conversation (its own db + brain dir under THIS
// HOME root), answers its parent with send_message minutes later, and its state stays SUBAGENT_STATE_ALIVE after it.
// The stream says only tool_info + one subagent_info — so THIS process, on the machine that holds the store, reads it
// (src/agy-store.js parses; every read goes through src/agy-store-fs.js — agy-store's verdict, then no link past the
// store root — so it can never open the login file, nor anything a link planted in the store points at):
//   · the invoke_subagent row becomes THE CARD — a `subagent` record {toolCallId, subId, role, typeName, task, state,
//     spawnStep, status, startedAt, endedAt, elapsedMs, result, steps, files}, re-sent whenever it changes;
//   · the sub's own steps ride `sub` records {subId, toolCallId, rec: <an ACP record>} — its virtual session
//     sub-<subId>, drawn by the ACP normalizer (src/server/stdout/acp-events.js routes them);
//   · THE TAIL runs every 2 s ONLY while a spawn looks for its sub (≤ 60 s) or a sub works — never otherwise; a sub
//     whose last step is a final planner response (it answered), or that left ALIVE, ends its card. A parent
//     send_message to a known sub wakes it again.
// The link from the row to the sub: the stream's own output / subagent_info when they name it, else the store — the
// parent's TASK in the sub's messages names the parent's spawning step (unique per sub; spawnStepIndex is not).
// An agy whose store shows no subagent (an older build, another HOME) ⇒ no card and no error: the row stays a row.
const AS = require(path.join(__dirname, '..', '..', 'src', 'agy-store.js'));
const SUB_TAIL_MS = Math.max(200, Number(process.env.AGY_WEBUI_SUB_TAIL_MS) || 2000);
const SPAWN_LOOK_MS = Math.max(1000, Number(process.env.AGY_WEBUI_SUB_LOOK_MS) || 60000);
const SUB_MAX = 4000;          // a timeline text's clip in the journal (the full text stays in the store)
const subs = new Map();        // subId → {toolCallId, row, task, answer, startedAt, offset, lastIdx, st, steps, last, files, done, card}
const spawns = new Map();      // the invoke_subagent row's toolCallId → {step, at, subId}
let subTimer = null;
/** THE ONE GATE every store read passes (the token law): src/agy-store-fs.js — agy-store's verdict on the RELATIVE path,
 *  then no link anywhere past the store root and O_NOFOLLOW (the hub's reader of a sub that already ran opens files
 *  through the same gate). The store = this agy's HOME (the account's root). */
let storeGate = null;
const store = () => storeGate || (storeGate = require(path.join(__dirname, '..', '..', 'src', 'agy-store-fs.js')).storeReader(process.env.HOME || require('os').homedir(), { log }));
const storeRead = (rel) => store().read(rel);
const storeRows = (rel, of) => store().rows(rel, of);
/** The complete lines appended to a store file since `offset` (≤ 512 KB a tick): {lines, next} | null (no such file). */
const storeLines = (rel, offset) => store().lines(rel, offset);
let sqliteMod;
/** The db's step rows after `afterIdx` (read-only, at the path the gate answers) — the timeline when this agy writes no
 *  transcript. */
function storeDbRows(rel, afterIdx) {
  const abs = store().path(rel, 'db');
  if (!abs) return [];
  if (sqliteMod === undefined) {
    const emit = process.emitWarning; // node:sqlite announces itself as experimental once — noise in this log
    process.emitWarning = function (w, ...rest) { if (/SQLite is an experimental feature/.test(String((w && w.message) || w))) return; return emit.call(this, w, ...rest); };
    try { sqliteMod = require('node:sqlite'); } catch { sqliteMod = null; } finally { process.emitWarning = emit; }
  }
  if (!sqliteMod) return [];
  let db = null;
  try { db = new sqliteMod.DatabaseSync(abs, { readOnly: true }); return db.prepare('SELECT idx, step_type, status, metadata, render_info, step_payload FROM steps WHERE idx > ? ORDER BY idx LIMIT 200').all(afterIdx); }
  catch (e) { log(`store db unreadable (${rel}): ${e.message}`); return []; }
  finally { try { db?.close(); } catch { } }
}
function emitCard(sub, now = Date.now()) {
  const card = AS.cardOf({ toolCallId: sub.toolCallId, row: sub.row, task: sub.task, answer: sub.answer, lastStep: sub.last, startedAt: sub.startedAt, steps: sub.steps, files: sub.files, now, ended: sub.ended });
  const key = JSON.stringify({ ...card, steps: null, elapsedMs: null, endedAt: null }); // a step alone never re-sends the card (its task / answer are the journal's largest texts)
  if (key === sub.cardKey) return card;
  sub.cardKey = key; sub.card = card;
  record('subagent', { ...card, home: process.env.HOME || null }); // home = the store's account root (the hub's helper door reads the sub's transcript there)
  return card;
}
function addStep(sub, step) {
  if (!step || step.idx <= sub.lastIdx) return;
  sub.lastIdx = step.idx; sub.steps++; sub.last = step;
  for (const p of AS.writesOf(step)) if (!sub.files.includes(p)) sub.files.push(p);
  const parentName = sub.task && /^Message from (.{1,60})$/.exec(sub.task.title || '') ? /^Message from (.{1,60})$/.exec(sub.task.title)[1] : null;
  for (const rec of AS.stepRecords(step, sub.st, { subId: sub.row.id, parentId: meta.sessionId, parentName, max: SUB_MAX })) record('sub', { subId: sub.row.id, toolCallId: sub.toolCallId, rec });
}
function adoptSub(toolCallId, subId) {
  const parent = meta.sessionId;
  if (!AS.isId(parent) || !AS.isId(subId) || subs.has(subId)) return false;
  const row = AS.subagentRowOf(safeJsonParse(storeRead(`${AS.storePaths(parent).subagents}/${subId}.json`)));
  if (!row) return false;   // not (yet) this conversation's subagent — looked for again next tick
  const sp = spawns.get(toolCallId);
  const task = AS.taskOf(storeRows(AS.storePaths(subId).messages, AS.messageRowOf), { parentId: parent, subId });
  if (sp) sp.subId = subId;
  const sub = { toolCallId, row, task, answer: null, startedAt: (task && task.at) || (sp && sp.at) || Date.now(), offset: 0, lastIdx: -1, st: { pending: [] }, steps: 0, last: null, files: [], done: false, ended: false, cardKey: null, card: null };
  subs.set(subId, sub);
  log(`subagent ${subId} ← ${toolCallId} (${row.typeName || '?'})`);
  emitCard(sub);
  return true;
}
/** Each unlinked spawn looks for its sub in the store: the sub whose TASK names this row's step. */
function linkSpawns() {
  const parent = meta.sessionId;
  const open = [...spawns.entries()].filter(([, s]) => !s.subId && Date.now() - s.at < SPAWN_LOOK_MS);
  if (!open.length || !AS.isId(parent)) return;
  // lane agy-card-details gap 4: link by the SUB's ID — the spawn's own step output names it («Created the following
  // subagent: {id}», AS.subIdForStep over the parent transcript). The stream sends NO tool_call_update for an
  // invoke_subagent row (measured on the owner's journal), so this, not the step number, is the sure link, and the
  // stream-vs-transcript index drift cannot break it; the step-match below stays as the fallback.
  for (const [key, s] of open) { if (s.subId) continue; const id = AS.subIdForStep(store(), parent, s.step); if (id && !subs.has(id)) adoptSub(key, id); }
  for (const row of storeRows(AS.storePaths(parent).subagents, AS.subagentRowOf)) {
    if (subs.has(row.id)) continue;
    const task = AS.taskOf(storeRows(AS.storePaths(row.id).messages, AS.messageRowOf), { parentId: parent, subId: row.id });
    const hit = task && open.find(([, s]) => !s.subId && s.step === task.step);
    if (hit) adoptSub(hit[0], row.id);
  }
}
function tailSub(sub) {
  const p = AS.storePaths(sub.row.id);
  const t = storeLines(p.transcript, sub.offset);
  if (t) { sub.offset = t.next; for (const line of t.lines) addStep(sub, AS.transcriptStepOf(line)); }
  else for (const r of storeDbRows(p.db, sub.lastIdx)) addStep(sub, AS.dbStepOf(r));
  const row = AS.subagentRowOf(safeJsonParse(storeRead(`${AS.storePaths(meta.sessionId).subagents}/${sub.row.id}.json`)));
  if (row) sub.row = row;
  const over = !sub.row.alive || AS.subPhaseOf(sub.last) === 'idle';
  if (over) {
    const answers = AS.answersOf(storeRows(AS.storePaths(meta.sessionId).messages, AS.messageRowOf), { parentId: meta.sessionId, subId: sub.row.id });
    if (answers.length) sub.answer = answers[answers.length - 1];
    if (!sub.row.alive && /KILL|CANCEL|STOP|ABORT|FAIL|ERROR/i.test(String(sub.row.state || ''))) for (const rec of AS.closePendingRecords(sub.st)) record('sub', { subId: sub.row.id, toolCallId: sub.toolCallId, rec }); // lane agy-card-details gap 5: an ended sub never leaves a tool card «运行中»
    sub.done = true;
  }
  emitCard(sub);
}
function subTick() {
  try {
    linkSpawns();
    for (const sub of subs.values()) if (!sub.done) tailSub(sub);
  } catch (e) { log(`subagent tail: ${e.message}`); }
  const looking = [...spawns.values()].some((s) => !s.subId && Date.now() - s.at < SPAWN_LOOK_MS);
  if (!looking && ![...subs.values()].some((s) => !s.done)) stopSubTail();
}
function armSubTail() {
  if (subTimer || !child) return;
  subTimer = setInterval(subTick, SUB_TAIL_MS);
  log(`subagent tail on (every ${SUB_TAIL_MS} ms)`);
  setImmediate(subTick);
}
function stopSubTail() { if (subTimer) { clearInterval(subTimer); subTimer = null; log('subagent tail off'); } }
/** agy ended (not a restart): one last read; a sub still working is said as stopped with its conversation's process. */
function subsAtExit() {
  stopSubTail();
  if (!subs.size) return;
  try { for (const sub of subs.values()) if (!sub.done) tailSub(sub); } catch { }
  for (const sub of subs.values()) if (!sub.done) { for (const rec of AS.closePendingRecords(sub.st)) record('sub', { subId: sub.row.id, toolCallId: sub.toolCallId, rec }); sub.done = true; sub.ended = true; sub.row = { ...sub.row, alive: false, state: 'SUBAGENT_STATE_STOPPED_WITH_PARENT' }; emitCard(sub); }
}
/** The stream's invoke_subagent row: remember it, link it now when the stream names the sub, else let the tail look. */
function noteSpawn(key, step, ti) {
  if (!spawns.has(key)) spawns.set(key, { step: Number(step), at: Date.now(), subId: null });
  const named = AS.createdSubagentOf(typeof ti?.output === 'string' ? ti.output : '');
  if (named) adoptSub(key, named);
  armSubTail();
}
/** A parent send_message to a sub it started wakes that sub's card and tail again. */
function noteSendTo(recipient) {
  const sub = subs.get(String(recipient || ''));
  if (!sub || !sub.done || sub.ended) return;
  sub.done = false; sub.answer = null; sub.last = null;
  emitCard(sub);
  armSubTail();
}

// ── agy → journal ──
const toolSeen = new Map(); // step key → recorded tool_call
const kindOfTool = AS.kindOfTool; // THE ONE tool → ACP kind mapping (src/agy-store.js): a sub's timeline draws the same kinds
function adoptConversation(id, how) {
  if (!id || typeof id !== 'string') return;
  if (meta.sessionId === id && sessionRecorded) return;
  meta.sessionId = id; sessionRecorded = true; scheduleMeta();
  record('session', { sessionId: id, cwd: baseCwd, how, sessionName: sessionName || null, agentInfo: meta.acp.agentInfo, capabilities: meta.acp.capabilities, protocolVersion: null, authMethods: [], ...configSnapshot() });
}
function handleEvent(line) {
  const ev = safeJsonParse(line);
  if (!ev || typeof ev !== 'object' || typeof ev.event !== 'string') { log(`agy stdout non-event: ${clip(line, 200)}`); return; }
  if (ev.event === 'init') {
    const init = ev.init || {};
    if (init.permission_mode) meta.agy = { ...(meta.agy || {}), permissionMode: String(init.permission_mode) };
    if (Array.isArray(init.tools)) meta.agy = { ...(meta.agy || {}), tools: init.tools.map(String).slice(0, 200) };
    if (typeof init.model === 'string' && init.model) meta.agy = { ...(meta.agy || {}), model: init.model.slice(0, 200) }; // the slug agy NAMES (lane agy-status-bar-facts)
    adoptConversation(ev.conversation_id, resumeId && ev.conversation_id === resumeId ? 'load' : (resumeId ? 'new' : 'new'));
    return;
  }
  if (ev.event === 'step_update') {
    const s = ev.step_update || {};
    if (s.conversation_id && !sessionRecorded) adoptConversation(s.conversation_id, resumeId ? 'load' : 'new');
    const sid = meta.sessionId;
    const key = `${s.conversation_id || sid}:${s.step_index}`;
    if (s.step_type === 'agent_response') {
      if (typeof s.text_delta === 'string' && s.text_delta) record('update', { sessionId: sid, update: { sessionUpdate: 'agent_message_chunk', messageId: key, content: { type: 'text', text: s.text_delta } } });
    } else if (s.step_type === 'tool') {
      const ti = s.tool_info || {};
      const name = s.tool_name || ti.name || 'tool';
      if (!toolSeen.has(key)) {
        toolSeen.set(key, true);
        record('update', { sessionId: sid, update: { sessionUpdate: 'tool_call', toolCallId: key, title: name, kind: kindOfTool(name), status: 'in_progress', rawInput: ti.parameters != null ? AS.normalizeAgyToolArgs(ti.parameters) : null } }); // lane agy-card-details: ONE card shape (the same normalizer the store uses)
      }
      if (name === 'invoke_subagent') noteSpawn(key, s.step_index, ti);   // THE CARD (above): the row looks for its sub
      else if (name === 'send_message' && ti.parameters && typeof ti.parameters === 'object') noteSendTo(ti.parameters.Recipient);
      if (s.state === 'DONE') {
        const err = ti.error && (ti.error.message || ti.error.type) ? `${ti.error.type ? ti.error.type + ': ' : ''}${ti.error.message || ''}` : '';
        const out = err || (typeof ti.output === 'string' ? ti.output : (ti.output != null ? JSON.stringify(ti.output) : ''));
        record('update', { sessionId: sid, update: { sessionUpdate: 'tool_call_update', toolCallId: key, status: err ? 'failed' : 'completed', ...(out ? { content: [{ type: 'content', content: { type: 'text', text: clip(out, 20000) } }] } : {}) } });
      }
    } else if (Array.isArray(s.subagent_info?.subagents) || Array.isArray(s.subagent_info)) {
      const started = asArray(s.subagent_info?.subagents || s.subagent_info);
      if (s.state === 'DONE' || !toolSeen.has(key)) {
        toolSeen.set(key, true);
        // the line stays only where no invoke_subagent row will carry the card (its role rides the card)
        if (!spawns.has(key)) notice('info', `Antigravity started ${started.length} subagent${started.length === 1 ? '' : 's'}: ${started.map((x) => `${x.type_name || 'agent'}${x.role ? ' (' + x.role + ')' : ''}`).join(', ').slice(0, 400)}`, 'subagents');
      }
      // the row's own end: the stream's DONE for an invoke_subagent step rides THIS update, never a tool step (measured:
      // the owner's journal had no tool_call_update for either row — they spun for ever); the card says the rest
      if (s.state === 'DONE' && spawns.has(key) && !spawns.get(key).closed) { spawns.get(key).closed = true; record('update', { sessionId: sid, update: { sessionUpdate: 'tool_call_update', toolCallId: key, status: 'completed' } }); }
      for (const subId of AS.subagentInfoIds(s.subagent_info)) { const k = spawns.has(key) ? key : [...spawns.keys()].reverse().find((x) => !spawns.get(x).subId); if (k) adoptSub(k, subId); }
      if (spawns.size) armSubTail();
    }
    if (s.usage && typeof s.usage === 'object') { meta.usage = { ...s.usage, at: Date.now() }; scheduleMeta(); }
    return;
  }
  if (ev.event === 'result') {
    const r = ev.result || {};
    if (r.conversation_id && !sessionRecorded) adoptConversation(r.conversation_id, resumeId ? 'load' : 'new');
    if (r.usage && typeof r.usage === 'object') { meta.usage = { ...r.usage, at: Date.now() }; scheduleMeta(); noteTurnUsage(r); }
    if (!activePrompt) { if (r.status && r.status !== 'SUCCESS') notice('error', `Antigravity: ${r.error || r.status}`, 'agent-error'); return; }
    const st = String(r.status || 'SUCCESS');
    const stop = st === 'SUCCESS' ? 'end_turn' : (st === 'CANCELED' || st === 'INTERRUPTED') ? 'cancelled' : 'error';
    endPrompt(activePrompt, stop, stop === 'error' ? { message: String(r.error || st), status: st } : null, activePrompt.opts || {});
    return;
  }
  log(`agy event ignored: ${clip(ev.event, 60)}`);
}

// ── THE TURN'S USAGE → ONE `usage` RECORD (lane agy-status-bar-facts, 2026-10-21) ──
// The owner: «agy 的 chatview 缺少很多信息啊 什么 context 啊，cache rate … 下面都没有了». agy's `result.usage` is the
// conversation's RUNNING total (measured — src/agy-turn-usage.js says how); the status bar needs the turn's own spend and
// the LIVE CONTEXT, which only agy's own transcript holds per model call. So at each result: the tail of THIS
// conversation's transcript (read-only, ≤ 4 MiB, through the gate below) + the total → one journal record
//   {type:'acp', kind:'usage', sessionId, total, turn, last, model, modelFrom, durationSeconds}
// that the ACP normalizer turns into the usage meta (src/acp-message-manager.js _processUsage). The sidecar keeps its copy
// (meta.usage) as before. No transcript (another agy, a link, a missing file) ⇒ `last` null: the bar keeps what it had
// and never draws a context from a sum.
let TU = null;
try { TU = require(path.join(__dirname, '..', '..', 'src', 'agy-turn-usage.js')); } catch { TU = null; }
const CONV_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSCRIPT_TAIL = 4 * 1024 * 1024;
let lastTotal = null, usageChain = Promise.resolve();
/** THE GATE: the tail of <HOME>/.gemini/antigravity-cli/brain/<conversation>/.system_generated/logs/transcript.jsonl —
 *  a uuid conversation id only, the file's realpath INSIDE the store root (no link out), opened O_NOFOLLOW, a regular
 *  file. Nothing else in agy's store is ever opened here (its login file least of all). null = not readable. */
async function transcriptTail(conv) {
  if (!process.env.HOME || !CONV_ID_RE.test(String(conv || ''))) return null;
  const store = path.join(process.env.HOME, '.gemini', 'antigravity-cli');
  const fp = path.join(store, 'brain', String(conv), '.system_generated', 'logs', 'transcript.jsonl');
  let fh = null;
  try {
    const [rs, rf] = await Promise.all([fs.promises.realpath(store), fs.promises.realpath(fp)]);
    if (!rf.startsWith(rs + path.sep)) return null;
    fh = await fs.promises.open(fp, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const st = await fh.stat();
    if (!st.isFile()) return null;
    const len = Math.min(st.size, TRANSCRIPT_TAIL);
    const b = Buffer.alloc(len);
    await fh.read(b, 0, len, st.size - len);
    return b.toString('utf8');
  } catch { return null; } finally { try { await fh?.close(); } catch { } }
}
/** One finished turn's `usage` record (serialized: two quick results never interleave their reads). */
function noteTurnUsage(r) {
  if (!TU) return;
  usageChain = usageChain.then(async () => {
    const text = await transcriptTail(r.conversation_id || meta.sessionId);
    const named = meta.agy && meta.agy.model;
    const u = TU.turnUsage({ usage: r.usage, prev: lastTotal, transcript: text == null ? null : TU.transcriptTurn(text), model: named || state.model || null, modelFrom: named ? 'agy' : 'asked', durationSeconds: r.duration_seconds });
    if (!u) return;
    lastTotal = u.total;
    record('usage', { sessionId: meta.sessionId, ...u });
  }).catch((e) => log(`usage record failed: ${e.message}`));
}

// the measured stderr lines (agy 1.4.3, an unauthenticated run) + the docs' soft-deny / AGY_ERROR shapes
const AUTH_URL_RE = /^\s*https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?/;
const AUTH_HEAD_RE = /Authentication required|paste the authorization code|You are not logged into Antigravity|Please sign in/i;
const SOFT_DENY_RE = /permissions\.allow|dangerously-skip-permissions|soft-denied|requires approval|needs approval|not allowed without approval/i;
let authUrl = null;
function handleStderr(line) {
  log(`[stderr] ${clip(line, 2000)}`);
  if (AUTH_URL_RE.test(line)) authUrl = line.trim();
  if (AUTH_URL_RE.test(line) || AUTH_HEAD_RE.test(line)) {
    if (authFailed) return;
    authFailed = true;
    // agy now WAITS 60 s reading a pasted code on its stdin — never feed it our next turn; end it now, say why
    notice('error', accountRoot
      ? 'This Google account (Antigravity) is not signed in — it asked for a Google sign-in, which a chat cannot answer. Sign it in: Agents → Antigravity CLI → the account\'s ⋯ → Sign in again; then resume this conversation.'
      : 'Antigravity is not signed in for this login — it asked for a Google sign-in, which a chat cannot answer. Sign in once in a terminal (an Antigravity terminal session, or `agy` in any terminal on this machine), then resume this conversation.', 'auth-required');
    // which measured shape: a pipe start refuses at once; a character-device start prints the link and waits for a code.
    // The link itself (client id, PKCE challenge, state) is never journaled.
    record('auth_required', { how: (authUrl || /visit the URL|authorization code/i.test(line)) ? 'link-wait' : 'refusal' });
    try { child?.kill('SIGTERM'); } catch { }
    return;
  }
  const m = /^AGY_ERROR:\s*(\{.*\})\s*$/.exec(line.trim());
  if (m) { const j = safeJsonParse(m[1], {}); notice('error', `Antigravity: ${j.short_error || j.message || m[1].slice(0, 300)}`, 'agy-error'); return; }
  if (SOFT_DENY_RE.test(line)) { softDenyCard(line); }
}

// ── SOFT-DENY → the permission card 「agy skipped <tool>」 ──
// agy's stream never asks: a tool that needs approval is SKIPPED, the run carries on, and a stderr notice names it and
// how to allow it. The card is the harness-neutral permission card (no new client, no fake protocol — it says agy
// already skipped). Its doors:
//   · "Allow <rule> and retry" — only on a NAMED ACCOUNT (its HOME root carries VibeSpace's mark) when the notice names
//     a rule `action(target)`: the rule is added to THAT account's own settings.json permissions.allow (never the
//     person's global file, never through a link), agy restarts on the same conversation and the turn is re-sent;
//   · "Allow once and retry" — agy restarts with --dangerously-skip-permissions for ONE turn (a run has no per-tool
//     grant; the card says so) and is asked to retry; the turn after is back on the conversation's own mode;
//   · "Keep skipped" changes nothing.
const ACCOUNT_MARK = '.vibespace-agy-account';
const homeDir = process.env.HOME || '';
const accountRoot = (() => { try { return homeDir && fs.lstatSync(path.join(homeDir, ACCOUNT_MARK)).isFile() ? homeDir : null; } catch { return null; } })();
let denySeq = 0, retryBypass = false, childRetryBypass = false;
const pendingDenies = new Map();
function toolOfDeny(line) {
  const m = /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/.exec(line) || /\b(?:tool|command)\s+[“"'`]?([\w.:-]+)/i.exec(line);
  return m ? m[1] : null;
}
/** The rule the notice names, quoted: `"command(rm)"`, `'write_file(src/)'` … (the docs' action(target) syntax). */
function ruleOfDeny(line) {
  const m = /[“"'`]([a-z][a-z_]*\([^()“”"'`\n]{1,200}\))[”"'`]/.exec(line);
  return m ? m[1] : null;
}
/** Where a rule may be written: the account root's OWN settings.json — every step a real dir / file, never a link. */
function ruleFile() {
  if (!accountRoot) return { ok: false, why: "this conversation runs on the machine's own Antigravity login, whose settings are your own file — VibeSpace never writes it" };
  const dirs = [path.join(accountRoot, '.gemini'), path.join(accountRoot, '.gemini', 'antigravity-cli')];
  for (const d of dirs) { try { if (!fs.lstatSync(d).isDirectory()) return { ok: false, why: `${d} is not the account's own directory` }; } catch { return { ok: false, why: `${d} is missing` }; } }
  const fp = path.join(dirs[1], 'settings.json');
  let st = null; try { st = fs.lstatSync(fp); } catch { st = null; }
  if (st && !st.isFile()) return { ok: false, why: "this account's settings.json is a link, not its own file — VibeSpace writes rules only into the account's own" };
  return { ok: true, fp };
}
function addAllowRule(rule) {
  const f = ruleFile();
  if (!f.ok) return f;
  let j = {};
  try { const raw = fs.readFileSync(f.fp, 'utf8'); j = raw.trim() ? JSON.parse(raw) : {}; }
  catch (e) { if (e.code !== 'ENOENT') return { ok: false, why: `this account's settings.json could not be read as JSON (${e.message})` }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, why: "this account's settings.json is not a JSON object" };
  const perms = j.permissions && typeof j.permissions === 'object' && !Array.isArray(j.permissions) ? j.permissions : (j.permissions = {});
  const allow = Array.isArray(perms.allow) ? perms.allow : (perms.allow = []);
  if (!allow.includes(rule)) allow.push(rule);
  const tmp = `${f.fp}.vs-${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(j, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, f.fp); }
  catch (e) { try { fs.unlinkSync(tmp); } catch { } return { ok: false, why: `writing it failed (${e.message})` }; }
  return { ok: true, fp: f.fp };
}
function softDenyCard(line) {
  const tool = toolOfDeny(line) || 'a tool';
  const rule = ruleOfDeny(line);
  const canRule = !!rule && ruleFile().ok;
  const requestId = `agy-deny-${++denySeq}-${process.pid}`;
  const toolCall = {
    toolCallId: requestId, title: `agy skipped ${tool}: it needs approval`, kind: kindOfTool(tool), status: 'pending',
    rawInput: {
      tool, notice: line.trim().slice(0, 600),
      ...(canRule ? { allowRule: `adds ${rule} to this Google account's own Antigravity settings (permissions.allow), restarts Antigravity on this conversation and sends the turn again` } : {}),
      allowOnce: 'restarts Antigravity on this conversation with EVERY tool approved for one turn (its runs have no per-tool grant) and asks it to retry; the turn after is back on this conversation\'s mode',
    },
  };
  const options = [
    ...(canRule ? [{ optionId: 'rule', name: `Allow ${rule} and retry`, kind: 'allow_always' }] : []),
    { optionId: 'retry', name: 'Allow once and retry', kind: 'allow_once' },
    { optionId: 'skip', name: 'Keep skipped', kind: 'reject_once' },
  ];
  pendingDenies.set(requestId, { tool, rule: canRule ? rule : null });
  meta.pendingRequests = { ...(meta.pendingRequests || {}), [requestId]: { id: requestId, method: 'soft-deny', toolCallId: requestId, options } };
  record('permission_request', { requestId, sessionId: meta.sessionId, toolCall, options });
  scheduleMeta();
}
function resolveSoftDeny(msg) {
  const key = String(msg.requestId ?? '');
  const d = pendingDenies.get(key);
  if (!d) { notice('error', `permission-response for an unknown/expired request (${msg.requestId}) — ignored (Antigravity never asks in its stream; only a skipped-tool card takes an answer, while this process lives).`, 'stale'); return; }
  pendingDenies.delete(key);
  if (meta.pendingRequests) delete meta.pendingRequests[key];
  const pick = msg.abort ? 'skip' : msg.optionId === 'rule' && d.rule ? 'rule' : msg.optionId === 'retry' || (!msg.optionId && msg.approved) ? 'retry' : 'skip';
  record('permission_resolved', { requestId: key, outcome: 'selected', optionId: pick, optionKind: pick === 'rule' ? 'allow_always' : pick === 'retry' ? 'allow_once' : 'reject_once' });
  scheduleMeta();
  if (pick === 'skip') return;
  if (pick === 'rule') {
    const w = addAllowRule(d.rule);
    if (!w.ok) { notice('error', `${d.rule} was NOT added: ${w.why}. Nothing was retried — send the turn again, or switch this conversation to “Never ask”.`, 'soft-deny-rule-failed'); return; }
    notice('info', `Allowed ${d.rule} for this Google account (its own Antigravity settings) — Antigravity restarts on this conversation and retries ${d.tool}${activePrompt ? ' (after the running turn)' : ''}.`, 'soft-deny-rule');
    // agy reads its settings when it starts: the retry runs on a restarted process (queued behind the restart)
    if (activePrompt) pendingRestart = pendingRestart || `rule ${d.rule}`; else restartChild(`rule ${d.rule}`);
    runPrompt(`The user allowed ${d.tool} (the rule ${d.rule} is now in your settings), which you skipped because it needed approval — retry the step that needed it.`, { silentQueue: true }).catch((e) => log('retry failed: ' + e.message));
    return;
  }
  notice('info', `Allowed once — Antigravity restarts on this conversation with every tool approved for one turn and retries ${d.tool}${activePrompt ? ' (after the running turn)' : ''}.`, 'soft-deny-retry');
  runPrompt(`The user allowed ${d.tool}, which you skipped because it needed approval — retry the step that needed it.`, { retry: true, silentQueue: true }).catch((e) => log('retry failed: ' + e.message));
}

// ── turns ──
let promptSeq = 0, activePrompt = null, nudgeTurnActive = false, stopEpoch = 0, stopCheckAbort = null, queueSeq = 0;
const promptQueue = [];
async function fetchContextPrefix() {
  const api = process.env.VIBESPACE_API, token = process.env.VIBESPACE_SESSION_TOKEN;
  if (!api || !token) return '';
  try {
    const res = await fetch(api + '/api/agent/prompt-context', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return '';
    const d = await res.json();
    return d && typeof d.context === 'string' ? d.context : '';
  } catch (e) { log(`prompt-context skipped: ${e.message}`); return ''; }
}
async function maybeStopNudge() {
  const api = process.env.VIBESPACE_API, token = process.env.VIBESPACE_SESSION_TOKEN;
  if (!api || !token || !meta.sessionId) return;
  const epoch = stopEpoch, ac = new AbortController();
  stopCheckAbort = ac;
  const to = setTimeout(() => { try { ac.abort(new Error('stop-check timed out after 2500ms')); } catch { } }, 2500);
  try {
    const res = await fetch(api + '/api/agent/stop-check', { headers: { Authorization: 'Bearer ' + token }, signal: ac.signal });
    if (!res.ok) return;
    const d = await res.json();
    if (!d || !d.block || !d.reason || epoch !== stopEpoch) return;
    nudgeTurnActive = true;
    await runPrompt('<vibespace-reminder>' + d.reason + '</vibespace-reminder>', { nudge: true, silentQueue: true });
  } catch (e) { nudgeTurnActive = false; log('stop nudge skipped: ' + (e && e.message ? e.message : e)); }
  finally { clearTimeout(to); if (stopCheckAbort === ac) stopCheckAbort = null; }
}
const preview = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 120 ? s.slice(0, 119) + '…' : s; };
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
    items.push({ id: String(r.id || ''), msgId: String(r.msgId || ''), ts: Number.isFinite(r.ts) ? r.ts : null, text, cut: text.length < full.length, attachments });
  }
  return { dropId: String(dropId || ''), by: 'stop', turnId: typeof turnId === 'string' && turnId ? turnId : null, items, omitted };
}
let dropSeq = 0;                  // the put-back record's id: `${pid}-${n}` — the server's idempotency key

function publishQueue() {
  const items = promptQueue.map((q) => ({ id: q.id, msgId: q.opts?.msgId || '', preview: preview(q.text), ...(!q.opts?.peer && !q.opts?.nudge && !q.opts?.retry && q.text && q.text.length <= 20000 ? { text: q.text } : {}), ts: q.ts || null, kind: q.opts?.peer ? 'peer' : (q.opts?.nudge || q.opts?.retry) ? 'system' : 'user', from: q.opts?.peerFrom || null }));
  meta.queue = items; scheduleMeta();
  record('queue_changed', { items, turn_id: meta.activePromptId || null, verbs: QUEUE_VERBS });
}
function drainPromptQueue() {
  if (activePrompt || !promptQueue.length || restarting || !child) return;
  const next = promptQueue.shift();
  publishQueue();
  runPrompt(next.text, next.opts).then((ran) => { if (!ran.mode) peerBack(next, ran.reason); }).catch((e) => { log('queued prompt failed: ' + e.message); peerBack(next, e.message); });
}
/** A PEER message this wrapper took and will NOT deliver goes back to the delivery ladder with its words (lane
 *  agy-peer-wake: never a silent drop) — `peer_result {ok:false, text}` and NO mode: it is about an EARLIER frame, which
 *  the hub's settle must not mistake for an answer about the frame it wrote last (conversation-deliver
 *  settleRpcDelivery); acp-events re-stashes the words for the conversation's next turn. A person's / nudge entry: no-op. */
function peerBack(q, reason) {
  if (q && q.opts?.peer && q.opts.peerText) record('peer_result', { ok: false, reason: String(reason || 'not delivered'), text: q.opts.peerText, fromName: q.opts.peerFrom || null, peerKind: q.opts.peerKind || null });
}
/** THE STEER's stop (lane agy-harness-fixes, bug 4): ends the RUNNING turn and KEEPS the queue (the steered message at
 *  its head) — agy's stream has no cancel, so a dispatched turn's process is restarted on the same conversation (what
 *  the turn did stays) and the new process drains the queue first (startChild); a turn not yet dispatched is dropped by
 *  runPrompt itself and the queue drains after it. The restart starts BEFORE the turn ends: `restarting` holds
 *  endPrompt's own drain, so nothing queued is written to the old process. → true when a dispatched turn was stopped
 *  (the caller says so); an idle wrapper just drains. (Stop is another verb: it clears the queue — the owner's law.) */
function stopRunningTurn(why) {
  const mine = activePrompt;
  if (!mine) { drainPromptQueue(); return false; }
  mine.cancelled = true;
  if (!mine.dispatched) return false;
  restartChild(why);
  endPrompt(mine, 'cancelled', null, mine.opts || {});
  return true;
}
function endPrompt(mine, stopReason, error, opts) {
  record('prompt_end', { promptId: mine.id, stopReason, error: error || null });
  if (activePrompt === mine) activePrompt = null;
  meta.streaming = false; meta.activePromptId = null; scheduleMeta();
  if (opts.retry && retryBypass) { retryBypass = false; if (!pendingRestart) pendingRestart = 'retry done: back to the mode'; }
  if (nudgeTurnActive && opts.nudge) nudgeTurnActive = false;
  else if (stopReason === 'end_turn' && !opts.nudge && !nudgeTurnActive) maybeStopNudge().catch(() => { });
  if (pendingRestart && !activePrompt) { const why = pendingRestart; pendingRestart = null; restartChild(why); return; }
  drainPromptQueue();
}
/** → what became of the text: {mode:'queued'} (it runs after the running turn / once a restart is up), {mode:'turn'}
 *  (written to agy — the turn is open), or {mode:null, reason} (it never reached agy: Stop before it was written, not
 *  signed in, not running). The peer frame answers from this (lane agy-peer-wake); a person's line ignores it. */
async function runPrompt(text, opts = {}) {
  if (activePrompt || restarting || !child) {
    promptQueue.push({ id: `q${++queueSeq}-${process.pid}`, ts: Date.now(), text, opts });
    publishQueue();
    if (!opts.silentQueue) record('queued_input', { msg_id: opts.msgId || '', turn_id: meta.activePromptId || null });
    if (!child && !restarting && !shuttingDown) startChild();
    return { mode: 'queued' };
  }
  // THE ONE-TURN BYPASS INVARIANT: only the retry turn ever runs on a process started with the retry's bypass, and
  // the retry never runs without it — checked at dispatch, so a reorder / remove / Stop cannot leak it to a user turn
  const wantBypass = !!opts.retry && state.mode !== 'bypassPermissions';
  if (wantBypass !== childRetryBypass) {
    retryBypass = wantBypass;
    promptQueue.unshift({ id: `q${++queueSeq}-${process.pid}`, ts: Date.now(), text, opts });
    publishQueue();
    restartChild(wantBypass ? 'allow and retry' : 'the retry\'s bypass ends');
    return { mode: 'queued' };
  }
  const promptId = `p${++promptSeq}-${process.pid}`;
  const mine = { id: promptId, cancelled: false, dispatched: false, opts, text }; // text: Stop puts an UNDISPATCHED prompt back into the composer (lane stop-refills-composer)
  activePrompt = mine;
  meta.streaming = true; meta.activePromptId = promptId; scheduleMeta();
  let body = text;
  if (!opts.nudge && !opts.peer) { const ctx = await fetchContextPrefix(); if (ctx) body = '<vibespace-context>\n' + ctx + '\n</vibespace-context>\n' + body; }
  const stopped = { mode: null, reason: 'stopped before it reached Antigravity' };
  if (mine.cancelled) { endPrompt(mine, 'cancelled', null, opts); return stopped; }
  if (!(await authGate()) || mine.cancelled) {
    const why = authFailed ? 'Antigravity is not signed in' : 'Antigravity is not running';
    endPrompt(mine, mine.cancelled ? 'cancelled' : 'error', mine.cancelled ? null : { message: why }, opts);
    return mine.cancelled ? stopped : { mode: null, reason: why };
  }
  if (!child?.stdin?.writable) { endPrompt(mine, 'error', { message: 'Antigravity is not running' }, opts); return { mode: null, reason: 'Antigravity is not running' }; }
  record('prompt_start', { promptId, blocks: 1 });
  mine.dispatched = true;
  child.stdin.write(JSON.stringify({ event: 'user', message: { content: body } }) + '\n');
  return { mode: 'turn' };
}

// ── stdin verbs (the AcpAdapter's frames) ──
let pendingRestart = null;
// THE COMPOSER'S PICTURES (lane agy-harness-fixes, bug 3 — the owner could not send a pasted image.png): agy's stream
// takes text only, but agy reads a picture from disk (read_file — the composer's upload road, test-agy-attach-chrome).
// Each base64 image block is written ONCE (named by its content hash) under <cwd>/.vibespace-uploads/ (0700, a `*`
// .gitignore so a repo never sees it) and its absolute path goes FIRST in the text — exactly as the upload puts a file's
// path — so a picture alone is a message too. Only a picture that could not be written is said as not sent. The
// picture's bytes never reach the journal, the log or argv.
const UPLOAD_DIR = '.vibespace-uploads';
const PICTURE_MAX = 20 * 1024 * 1024;
const PICTURE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/tiff': 'tiff' };
const quotePath = (p) => (/[\s'"$`\\()]/.test(p) ? `'${p.replace(/'/g, "'\\''")}'` : p); // the composer's _insertUploadedPaths quoting
function savePicture(b) {
  const src = b && b.source;
  if (!src || (src.type && src.type !== 'base64') || typeof src.data !== 'string') throw new Error('not a base64 picture');
  const mt = String(src.media_type || '').toLowerCase(), ext = PICTURE_EXT[mt];
  if (!ext) throw new Error(`a ${mt || 'typeless'} picture`);
  const bytes = Buffer.from(src.data, 'base64');
  if (!bytes.length) throw new Error('an empty picture');
  if (bytes.length > PICTURE_MAX) throw new Error(`a picture over ${PICTURE_MAX / 1048576} MB`);
  const dir = path.join(baseCwd, UPLOAD_DIR);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.writeFileSync(path.join(dir, '.gitignore'), '*\n', { flag: 'wx' }); } catch { }
  const fp = path.join(dir, `pasted-${require('crypto').createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${ext}`);
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, bytes, { mode: 0o600 });
  return fp;
}
/** A chat-input → {text, images, failed}: `text` = the pictures' paths first, then the typed text (the last text block,
 *  as before); `failed` = why each picture that could not be written was not. */
function normalizeChatInput(raw) {
  let text = typeof raw === 'string' ? raw : '';
  let images = 0;
  const paths = [], failed = [];
  const parsed = safeJsonParse(text);
  if (parsed?.type === 'user' && parsed.message) {
    text = '';
    for (const b of asArray(parsed.message.content)) {
      if (b.type === 'text' && b.text) text = b.text;
      if (b.type === 'image') { images++; try { const fp = quotePath(savePicture(b)); if (!paths.includes(fp)) paths.push(fp); } catch (e) { failed.push(e && e.message ? e.message : String(e)); } }
    }
  }
  if (paths.length) text = paths.join(' ') + (text ? ' ' + text : '');
  return { text, images, failed };
}
function loadFrameFile(msg) {
  const fp = typeof msg.path === 'string' ? msg.path : '';
  let body = null, err = null;
  try { body = fs.readFileSync(fp, 'utf8').trim(); } catch (e) { err = 'read failed: ' + e.message; }
  try { if (fp) fs.unlinkSync(fp); } catch { }
  let payload = null;
  if (!err) { payload = safeJsonParse(body); if (!payload || typeof payload !== 'object') err = 'not ONE valid JSON frame'; else if (payload.type === '_frame_file') err = 'nested _frame_file pointer refused'; }
  if (err) { notice('error', `Your message did not reach Antigravity: its frame file could not be delivered (${err}) — please send it again.`, 'lost-input'); return null; }
  return payload;
}
/** THE SLASH REFUSAL: agy answers its own slash commands (/model, /usage, /credits …) outside the stream and ENDS the
 *  session (exit 2) when one arrives on stdin — so it never leaves this wrapper. ONLY a command on agy's closed list is
 *  one (lane agy-slash-guard-paths: the guard read the first CHARACTER, so `/home/…/x.zip 这里是…` — every message with an
 *  attachment — was refused as «/home»); a path or any other "/…" is text and goes to agy unchanged. */
function slashRefused(text) {
  const word = agySlashCommand(text);
  if (!word) return false;
  notice('error', `${word} was not sent: Antigravity answers its slash commands itself and would end this conversation if one arrived in its stream. Use the model / effort / mode menus here, or run ${word} in an Antigravity terminal session.`, 'slash-refused');
  return true;
}
function applySetting(key, value, label) {
  const v = String(value == null ? '' : value);
  const allowed = key === 'mode' ? MODES : key === 'effort' ? EFFORTS : null;
  if (allowed && !allowed.includes(v)) { notice('error', `Antigravity has no ${label} "${v}" (${allowed.filter(Boolean).join(', ')}) — not applied.`, 'unsupported'); return; }
  if (state[key] === v) return;
  state[key] = v;
  meta.model = state.model; meta.agentMode = state.mode; meta.effort = state.effort; scheduleMeta();
  record('config', { ...configSnapshot(), source: 'set_' + key });
  const words = `${label} → ${v || 'Antigravity default'} — Antigravity restarts its process on the same conversation to apply it`;
  if (activePrompt) { pendingRestart = `${key} ${v}`; notice('info', words + ' (after the running turn).', 'command_applied'); }
  else { notice('info', words + '.', 'command_applied'); restartChild(`${key} ${v}`); }
}
async function handleInput(msg) {
  if (!msg || typeof msg !== 'object') return;
  await readyPromise;
  switch (msg.type) {
    case 'chat-input': {
      const n = normalizeChatInput(msg.text || '');
      if (n.failed.length) { notice('error', `${n.failed.length} attached picture${n.failed.length === 1 ? ' was' : 's were'} not sent to Antigravity (${n.failed[0]}); any other part of the message was sent.`, 'unsupported'); log(`pictures not written: ${n.failed.join('; ')}`); }
      if (!n.text) return;
      record('user', { msgId: msg.msgId || '', content: [{ type: 'text', text: n.text }], peer: null });
      if (slashRefused(n.text)) return;
      await runPrompt(n.text, { msgId: msg.msgId || '' });
      return;
    }
    case 'interrupt': {
      stopEpoch++;
      if (stopCheckAbort) { try { stopCheckAbort.abort(new Error('interrupted by Stop')); } catch { } }
      const dropped = promptQueue.splice(0, promptQueue.length);
      for (const q of dropped) record('queue_op_result', { op: 'remove', id: q.id, ok: true, msg_id: q.opts?.msgId || '', reason: 'stopped' });
      // STOP PUTS THE DROPPED QUEUE BACK (owner 2026-10-24, lane stop-refills-composer — acp-wrapper's twin): ONE record of
      // the person's rows between the results and the emptied republish; an UNDISPATCHED active prompt (Stop inside the
      // context-prefix / sign-in await) is the oldest row; peer / nudge / retry rows go back through their own ladder.
      const theirs = (q) => !q.opts?.peer && !q.opts?.nudge && !q.opts?.retry && !q.opts?.silentQueue;
      const putBack = [...(activePrompt && !activePrompt.dispatched && typeof activePrompt.text === 'string' && theirs(activePrompt) ? [activePrompt] : []), ...dropped.filter(theirs)];
      if (putBack.length) record('queue_dropped', droppedRecordFor(putBack.map((q) => ({ id: q.id, msgId: q.opts?.msgId || '', ts: q.ts || null, text: q.text, attachments: [] })), { dropId: `${process.pid}-${++dropSeq}`, turnId: meta.activePromptId || null }));
      if (dropped.length) publishQueue();
      for (const q of dropped) { peerBack(q, 'dropped by Stop before it was delivered'); if (q.opts?.nudge) nudgeTurnActive = false; }
      // a retry dropped before it ran must not leave its one-turn bypass on the process the next turn uses
      if (retryBypass && !activePrompt?.opts?.retry) { retryBypass = false; restartChild('stop: the dropped retry\'s bypass ends'); }
      // STOP CLEARS THE QUEUE (the owner's law, 2026-09-07 — codex-chat-wrapper / acp-wrapper) and PUTS IT BACK (2026-10-24,
      // the queue_dropped record above): the client's ONE toast says how many came back into the composer, so the count
      // agy-harness-fixes (bug 4) added to the Stop line — «send again what should still run» — is retired (no longer true)
      if (activePrompt) {
        const cur = activePrompt;
        cur.cancelled = true;
        if (cur.dispatched) {
          // no cancel in agy's stream: the process is restarted on the same conversation (what it already did is kept)
          endPrompt(cur, 'cancelled', null, cur.opts || {});
          notice('info', 'Stopped — Antigravity has no cancel in its stream, so its process was restarted on the same conversation; what the turn already did stays.', 'stop-restart');
          restartChild('stop');
          return;
        }
      }
      return;
    }
    case 'read-permission-rules':
      record('permission_rules', { ok: false, requestId: typeof msg.requestId === 'string' ? msg.requestId : '', reason: 'unsupported-by-protocol', detail: "Antigravity's stream has no config-read method — its rules live in ~/.gemini/antigravity-cli/settings.json (permissions.allow).", mode: state.mode || null, modes: modeValues() });
      return;
    case 'queue-op': return handleQueueOp(msg);
    case 'queue-resync': publishQueue(); return;
    case 'permission-response': resolveSoftDeny(msg); return;
    case 'set-model': applySetting('model', msg.model, 'Model'); return;
    case 'set-effort': applySetting('effort', msg.effort, 'Effort'); return;
    case 'set-mode':
    case 'set-permission-mode': applySetting('mode', msg.mode === 'default' ? '' : msg.mode, 'Mode'); return;
    case 'peer-message': {
      // THE LIVE LANE (lane agy-peer-wake — backend-caps peerDelivery 'rpc-queue'): another session's message, or a
      // VibeSpace notification, written by the delivery ladder. Idle ⇒ it opens a turn at once (the wake: a billed turn);
      // busy, or while agy restarts ⇒ it waits in THIS queue and runs after (a turn of its own). The answer is what
      // really happened, in write order: ok:true + mode 'turn' | 'queued' (a notification that waits also says
      // steer:'unsupported' — agy takes nothing into a running turn, its steer verb is a stop + a new turn), or ok:false
      // + mode 'undelivered' + its words when it never reached agy (Stop first, not signed in, not running) — the hub
      // re-stashes them. A frame with no text is nothing (no record, no turn).
      const text = String(msg.text || '');
      if (!text.trim()) return;
      const fromName = msg.fromName ? String(msg.fromName) : null;
      const peerKind = msg.kind === 'notification' ? 'notification' : 'peer';
      try {
        record('user', { msgId: '', content: [{ type: 'text', text }], peer: { name: fromName, body: typeof msg.cardText === 'string' && msg.cardText.trim() ? msg.cardText : null, kind: peerKind } });
        const ran = await runPrompt(`Message from ${fromName || 'another session'}:\n${text}`, { peer: true, silentQueue: true, peerText: text, peerFrom: fromName, peerKind });
        if (ran.mode) record('peer_result', { ok: true, mode: ran.mode, ...(peerKind === 'notification' && ran.mode === 'queued' ? { steer: 'unsupported' } : {}) });
        else record('peer_result', { ok: false, mode: 'undelivered', reason: ran.reason, text, fromName, peerKind });
      } catch (e) { record('peer_result', { ok: false, mode: 'undelivered', reason: e.message, text, fromName, peerKind }); }
      return;
    }
    default:
      notice('error', `Unknown stdin verb "${msg.type}" — ignored (the Antigravity wrapper serves chat-input/interrupt/queue-op/queue-resync/permission-response/set-model/set-effort/set-mode/set-permission-mode/peer-message/read-permission-rules/_frame_file).`, 'unknown-verb');
  }
}
function handleQueueOp(msg) {
  const op = String(msg?.op || ''), id = String(msg?.id || '');
  if (!QUEUE_VERBS.includes(op)) { record('queue_op_result', { op, id, ok: false, reason: /^steer/.test(op) ? 'not-steerable' : /^run-/.test(op) ? 'not-startable' : 'unknown-op', detail: /^steer/.test(op) ? 'Antigravity steers one message at a time — steer the one to run next' : `this agent has no queue action "${op}"` }); return; }
  const idx = promptQueue.findIndex((q) => q.id === id);
  if (idx < 0) { record('queue_op_result', { op, id, ok: false, reason: 'gone', detail: 'it is no longer queued' }); publishQueue(); return; }
  if (op === 'steer') {
    // THE STEER (lane agy-harness-fixes, bug 4): to the HEAD of the queue, then the running turn stops (agy takes no input
    // mid-turn — the restart keeps the conversation and what the turn did) and the new process runs it first
    const [moved] = promptQueue.splice(idx, 1);
    promptQueue.unshift(moved);
    record('queue_op_result', { op, id, ok: true, msg_id: moved.opts?.msgId || '' }); publishQueue();
    if (stopRunningTurn('steer')) notice('info', 'Steered — Antigravity takes no new message mid-turn, so the running turn was stopped (what it already did stays) and your message runs now on the same conversation.', 'steer-restart');
    return;
  }
  if (op === 'reorder') {
    const afterId = msg?.afterId == null ? null : String(msg.afterId);
    const [moved] = promptQueue.splice(idx, 1);
    if (afterId === null) promptQueue.unshift(moved);
    else { const at = promptQueue.findIndex((q) => q.id === afterId); if (at < 0) { promptQueue.splice(idx, 0, moved); record('queue_op_result', { op, id, ok: false, reason: 'anchor-gone', detail: 'the message it was dropped after is no longer queued', msg_id: moved.opts?.msgId || '' }); publishQueue(); return; } promptQueue.splice(at + 1, 0, moved); }
    record('queue_op_result', { op, id, ok: true, msg_id: moved.opts?.msgId || '' }); publishQueue(); return;
  }
  if (op === 'edit') {
    const entry = promptQueue[idx];
    if (entry.opts?.peer || entry.opts?.nudge) { record('queue_op_result', { op, id, ok: false, reason: 'not-editable', detail: entry.opts?.peer ? 'it was sent by another agent — you can remove it, but not rewrite it' : 'it is a VibeSpace bookkeeping message, not yours to rewrite', msg_id: entry.opts?.msgId || '' }); return; }
    const text = typeof msg?.text === 'string' ? msg.text : '';
    if (!text.trim()) { record('queue_op_result', { op, id, ok: false, reason: 'empty-text', detail: 'an edited message needs some text — remove it instead', msg_id: entry.opts?.msgId || '' }); return; }
    entry.text = text;
    record('queue_op_result', { op, id, ok: true, msg_id: entry.opts?.msgId || '' }); publishQueue(); return;
  }
  const [dropped] = promptQueue.splice(idx, 1);
  peerBack(dropped, 'removed from the queue before it was delivered');
  if (dropped.opts?.nudge) nudgeTurnActive = false;
  record('queue_op_result', { op, id, ok: true, msg_id: dropped.opts?.msgId || '' }); publishQueue();
}

function finalizeExit(code) {
  shuttingDown = true;
  for (const q of promptQueue.splice(0, promptQueue.length)) peerBack(q, 'Antigravity ended before it was delivered'); // the queue dies with this process: its peers' words go back
  meta.streaming = false; meta.activePromptId = null;
  if (writeTimer) clearTimeout(writeTimer);
  if (metaTimer) clearTimeout(metaTimer);
  persistBuffer(); persistMeta();
  log(`session ended code=${code}`);
  process.exit(code ?? 0);
}
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { shuttingDown = true; try { child?.stdin.end(); } catch { } setTimeout(() => { try { child?.kill('SIGTERM'); } catch { } finalizeExit(0); }, 500).unref(); });

function boot() {
  persistMeta();
  const refused = commandRefusal(cmd);
  if (refused) { notice('error', refused, 'spawn-failed'); finalizeExit(1); return; }
  // THE VERSION LAW: agy updates itself in the background, so every spawn records the version it ran (the record-shape
  // fixture is pinned per version — a drift flood means it updated). `--version` makes no network call (measured).
  execFile(cmd, ['--version'], { timeout: 5000 }, (err, stdout) => {
    const m = err ? null : /^\s*([\w.+-]{1,40})\s*$/.exec(String(stdout || ''));
    const v = m ? m[1] : null;
    meta.acp.agentInfo = { ...meta.acp.agentInfo, version: v }; scheduleMeta();
    record('agent_version', { version: v, ...(err ? { error: String(err.message || err).slice(0, 200) } : {}) });
  });
  startChild();
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  let stdinBuf = '';
  process.stdin.on('data', (chunk) => {
    stdinBuf += chunk;
    let idx;
    while ((idx = stdinBuf.indexOf('\n')) !== -1) {
      const line = stdinBuf.slice(0, idx).replace(/\r/g, '').trim();
      stdinBuf = stdinBuf.slice(idx + 1);
      if (!line) continue;
      try { process.stdout.write(JSON.stringify({ type: '_stdin_ack', timestamp: Date.now() }) + '\n'); } catch { }
      let msg = safeJsonParse(line);
      if (!msg || typeof msg !== 'object') { notice('error', `Your message did not reach Antigravity: the input line was corrupted in transit (${line.length} bytes, unparseable) — please send it again.`, 'lost-input'); continue; }
      if (msg.type === '_frame_file') { msg = loadFrameFile(msg); if (!msg) continue; }
      handleInput(msg).catch((err) => { notice('error', err.message, 'handler-error'); });
    }
  });
  // a RESUMED conversation is known before agy says anything; a new one is adopted from agy's first event
  if (resumeId) adoptConversation(resumeId, 'load');
  else record('config', { ...configSnapshot(), source: 'spawn' });
  markReadyDone = true;
  markReady?.();
}
boot();

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
//   ⇒ a chat-input starting with "/" is REFUSED HERE and never reaches agy. There is no cancel and no model switch in
//   the stream ⇒ Stop, set-model / set-effort / set-mode RESTART the process on the same conversation (--conversation).
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
const QUEUE_VERBS = ['remove', 'reorder', 'edit'];
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
  // the same advert as acp-wrapper (frameFile, the wrapper-owned queue + its three verbs, the read-only rules verb,
  // queue-resync) — every verb below is served by THIS file
  caps: { frameFile: true, peerMessage: false, inputQueue: true, queueVerbs: QUEUE_VERBS, permissionRules: true, queueResync: true },
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
  child.on('exit', (code, signal) => {
    if (mine !== child) return; // an old child after a restart
    child = null;
    if (restarting) return;   // the restart path starts the next one
    if (activePrompt) endPrompt(activePrompt, 'error', { message: `Antigravity exited (${signal || code})` }, activePrompt.opts || {});
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

// ── agy → journal ──
const toolSeen = new Map(); // step key → recorded tool_call
function kindOfTool(name) {
  const n = String(name || '').toLowerCase();
  if (/command|shell|terminal/.test(n)) return 'execute';
  if (/write|edit|replace|create|patch/.test(n)) return 'edit';
  if (/view|read|list|grep|find|search|glob/.test(n)) return /search|grep|find|glob/.test(n) ? 'search' : 'read';
  if (/fetch|browser|url|web/.test(n)) return 'fetch';
  return 'other';
}
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
        record('update', { sessionId: sid, update: { sessionUpdate: 'tool_call', toolCallId: key, title: name, kind: kindOfTool(name), status: 'in_progress', rawInput: ti.parameters ?? null } });
      }
      if (s.state === 'DONE') {
        const err = ti.error && (ti.error.message || ti.error.type) ? `${ti.error.type ? ti.error.type + ': ' : ''}${ti.error.message || ''}` : '';
        const out = err || (typeof ti.output === 'string' ? ti.output : (ti.output != null ? JSON.stringify(ti.output) : ''));
        record('update', { sessionId: sid, update: { sessionUpdate: 'tool_call_update', toolCallId: key, status: err ? 'failed' : 'completed', ...(out ? { content: [{ type: 'content', content: { type: 'text', text: clip(out, 20000) } }] } : {}) } });
      }
    } else if (Array.isArray(s.subagent_info?.subagents) || Array.isArray(s.subagent_info)) {
      const subs = asArray(s.subagent_info?.subagents || s.subagent_info);
      if (s.state === 'DONE' || !toolSeen.has(key)) {
        toolSeen.set(key, true);
        notice('info', `Antigravity started ${subs.length} subagent${subs.length === 1 ? '' : 's'}: ${subs.map((x) => `${x.type_name || 'agent'}${x.role ? ' (' + x.role + ')' : ''}`).join(', ').slice(0, 400)}`, 'subagents');
      }
    }
    if (s.usage && typeof s.usage === 'object') { meta.usage = { ...s.usage, at: Date.now() }; scheduleMeta(); }
    return;
  }
  if (ev.event === 'result') {
    const r = ev.result || {};
    if (r.conversation_id && !sessionRecorded) adoptConversation(r.conversation_id, resumeId ? 'load' : 'new');
    if (r.usage && typeof r.usage === 'object') { meta.usage = { ...r.usage, at: Date.now() }; scheduleMeta(); }
    if (!activePrompt) { if (r.status && r.status !== 'SUCCESS') notice('error', `Antigravity: ${r.error || r.status}`, 'agent-error'); return; }
    const st = String(r.status || 'SUCCESS');
    const stop = st === 'SUCCESS' ? 'end_turn' : (st === 'CANCELED' || st === 'INTERRUPTED') ? 'cancelled' : 'error';
    endPrompt(activePrompt, stop, stop === 'error' ? { message: String(r.error || st), status: st } : null, activePrompt.opts || {});
    return;
  }
  log(`agy event ignored: ${clip(ev.event, 60)}`);
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
function publishQueue() {
  const items = promptQueue.map((q) => ({ id: q.id, msgId: q.opts?.msgId || '', preview: preview(q.text), ...(!q.opts?.peer && !q.opts?.nudge && !q.opts?.retry && q.text && q.text.length <= 20000 ? { text: q.text } : {}), ts: q.ts || null, kind: q.opts?.peer ? 'peer' : (q.opts?.nudge || q.opts?.retry) ? 'system' : 'user', from: q.opts?.peerFrom || null }));
  meta.queue = items; scheduleMeta();
  record('queue_changed', { items, turn_id: meta.activePromptId || null, verbs: QUEUE_VERBS });
}
function drainPromptQueue() {
  if (activePrompt || !promptQueue.length || restarting || !child) return;
  const next = promptQueue.shift();
  publishQueue();
  runPrompt(next.text, next.opts).catch((e) => log('queued prompt failed: ' + e.message));
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
async function runPrompt(text, opts = {}) {
  if (activePrompt || restarting || !child) {
    promptQueue.push({ id: `q${++queueSeq}-${process.pid}`, ts: Date.now(), text, opts });
    publishQueue();
    if (!opts.silentQueue) record('queued_input', { msg_id: opts.msgId || '', turn_id: meta.activePromptId || null });
    if (!child && !restarting && !shuttingDown) startChild();
    return;
  }
  // THE ONE-TURN BYPASS INVARIANT: only the retry turn ever runs on a process started with the retry's bypass, and
  // the retry never runs without it — checked at dispatch, so a reorder / remove / Stop cannot leak it to a user turn
  const wantBypass = !!opts.retry && state.mode !== 'bypassPermissions';
  if (wantBypass !== childRetryBypass) {
    retryBypass = wantBypass;
    promptQueue.unshift({ id: `q${++queueSeq}-${process.pid}`, ts: Date.now(), text, opts });
    publishQueue();
    restartChild(wantBypass ? 'allow and retry' : 'the retry\'s bypass ends');
    return;
  }
  const promptId = `p${++promptSeq}-${process.pid}`;
  const mine = { id: promptId, cancelled: false, dispatched: false, opts };
  activePrompt = mine;
  meta.streaming = true; meta.activePromptId = promptId; scheduleMeta();
  let body = text;
  if (!opts.nudge && !opts.peer) { const ctx = await fetchContextPrefix(); if (ctx) body = '<vibespace-context>\n' + ctx + '\n</vibespace-context>\n' + body; }
  if (mine.cancelled) { endPrompt(mine, 'cancelled', null, opts); return; }
  if (!(await authGate()) || mine.cancelled) { endPrompt(mine, mine.cancelled ? 'cancelled' : 'error', mine.cancelled ? null : { message: authFailed ? 'Antigravity is not signed in' : 'Antigravity is not running' }, opts); return; }
  if (!child?.stdin?.writable) { endPrompt(mine, 'error', { message: 'Antigravity is not running' }, opts); return; }
  record('prompt_start', { promptId, blocks: 1 });
  mine.dispatched = true;
  child.stdin.write(JSON.stringify({ event: 'user', message: { content: body } }) + '\n');
}

// ── stdin verbs (the AcpAdapter's frames) ──
let pendingRestart = null;
function normalizeChatInput(raw) {
  let text = typeof raw === 'string' ? raw : '';
  let images = 0;
  const parsed = safeJsonParse(text);
  if (parsed?.type === 'user' && parsed.message) {
    text = '';
    for (const b of asArray(parsed.message.content)) { if (b.type === 'text' && b.text) text = b.text; if (b.type === 'image') images++; }
  }
  return { text, images };
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
 *  session (exit 2) when one arrives on stdin — so it never leaves this wrapper. */
function slashRefused(text) {
  const t = String(text || '').trimStart();
  if (!/^\/[A-Za-z]/.test(t)) return false;
  const word = (t.match(/^\/[\w:-]+/) || ['/'])[0];
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
      if (n.images) notice('error', `Antigravity's stream takes text only — ${n.images} attached image${n.images === 1 ? ' was' : 's were'} not sent (any text in the message was).`, 'unsupported');
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
      if (dropped.length) publishQueue();
      for (const q of dropped) { if (q.opts?.peer && q.opts.peerText) record('peer_result', { ok: false, reason: 'dropped by Stop before it was delivered', text: q.opts.peerText, fromName: q.opts.peerFrom || null, peerKind: q.opts.peerKind || null }); if (q.opts?.nudge) nudgeTurnActive = false; }
      // a retry dropped before it ran must not leave its one-turn bypass on the process the next turn uses
      if (retryBypass && !activePrompt?.opts?.retry) { retryBypass = false; restartChild('stop: the dropped retry\'s bypass ends'); }
      if (activePrompt) {
        const mine = activePrompt;
        mine.cancelled = true;
        if (mine.dispatched) {
          // no cancel in agy's stream: the process is restarted on the same conversation (what it already did is kept)
          endPrompt(mine, 'cancelled', null, mine.opts || {});
          notice('info', 'Stopped — Antigravity has no cancel in its stream, so its process was restarted on the same conversation; what the turn already did stays.', 'stop-restart');
          restartChild('stop');
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
      const text = String(msg.text || '');
      if (!text.trim()) return;
      const fromName = msg.fromName ? String(msg.fromName) : null;
      const peerKind = msg.kind === 'notification' ? 'notification' : 'peer';
      try {
        record('user', { msgId: '', content: [{ type: 'text', text }], peer: { name: fromName, body: typeof msg.cardText === 'string' && msg.cardText.trim() ? msg.cardText : null, kind: peerKind } });
        const queued = !!activePrompt;
        await runPrompt(`Message from ${fromName || 'another session'}:\n${text}`, { peer: true, silentQueue: true, peerText: text, peerFrom: fromName, peerKind });
        record('peer_result', { ok: true, mode: queued ? 'queued' : 'turn', ...(peerKind === 'notification' && queued ? { steer: 'unsupported' } : {}) });
      } catch (e) { record('peer_result', { ok: false, reason: e.message, text, fromName, peerKind }); }
      return;
    }
    default:
      notice('error', `Unknown stdin verb "${msg.type}" — ignored (the Antigravity wrapper serves chat-input/interrupt/queue-op/queue-resync/permission-response/set-model/set-effort/set-mode/set-permission-mode/peer-message/read-permission-rules/_frame_file).`, 'unknown-verb');
  }
}
function handleQueueOp(msg) {
  const op = String(msg?.op || ''), id = String(msg?.id || '');
  if (!QUEUE_VERBS.includes(op)) { record('queue_op_result', { op, id, ok: false, reason: /^steer/.test(op) ? 'not-steerable' : /^run-/.test(op) ? 'not-startable' : 'unknown-op', detail: /^steer/.test(op) ? 'Antigravity cannot take input into a running turn — the message runs after it' : `this agent has no queue action "${op}"` }); return; }
  const idx = promptQueue.findIndex((q) => q.id === id);
  if (idx < 0) { record('queue_op_result', { op, id, ok: false, reason: 'gone', detail: 'it is no longer queued' }); publishQueue(); return; }
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
  if (dropped.opts?.peer && dropped.opts.peerText) record('peer_result', { ok: false, reason: 'removed from the queue before it was delivered', text: dropped.opts.peerText, fromName: dropped.opts.peerFrom || null, peerKind: dropped.opts.peerKind || null });
  if (dropped.opts?.nudge) nudgeTurnActive = false;
  record('queue_op_result', { op, id, ok: true, msg_id: dropped.opts?.msgId || '' }); publishQueue();
}

function finalizeExit(code) {
  shuttingDown = true;
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

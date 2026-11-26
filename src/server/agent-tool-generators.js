'use strict';
// AGENT-TOOL GENERATORS + hook registration (extracted VERBATIM from
// server.js in the physical-decomposition campaign, 2.324.0 — same code, a
// file boundary instead of a closure). Every behavioral comment travels with
// its code; see CLAUDE.md data/bin entries for the incident history (the
// generator-template backslash P0, the EDITOR_DIR anchor rule, the temp-server
// hook guard). ORCH tier.
const fs = require('fs');
const DOOR = require('../mount-door'); // B-afc4: the blocked-path door — asked BEFORE a user-path read
const path = require('path');
const os = require('os');
const SR = require('../store-read.js');   // B-f276 (s1126): the opt-out mark's ENOENT is «missing», any other failure is unread
const { execFileSync } = require('child_process');

function create({ rootDir, port, onHookFileCreated = null, applyThisMachine = null, homeRead = null }) { // onHookFileCreated({harness, file, rel, at}) — the registration that CREATED a hook file (lane hooks-create: src/server/late-hooks.js tells the sessions that predate it)
  const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
  const USAGE_CACHE_DIR = path.join(rootDir, 'data', 'usage-cache');
// The harness registry + the settings/plan modules are needed by createHookHelper()
// (called at load, below) — declared FIRST so the helper generator is never in a TDZ.
const { list: listHarnesses } = require('../harnesses');
const { buildConfigPlan } = require('../harness-settings');                // PURE: the plan builder (the helper's embedded hooks-only DEFAULT_PLAN)
const { configPlanSpecs } = require('./harness-config-sync');              // ORCH: descriptor facts → plan specs (ONE spelling, shared with cliConfigPlan)
const { findOurHookIn, stableNodePath, keepsHookCommand, HOOK_MARKER } = require('../harness-config'); // SHARED: the CAS writer + the hook-entry mutators the remote helper embeds
// ── Create editor helper script ──
// Communicates via HTTP (not terminal output) so Claude Code treats it as a GUI editor
// and does NOT clear the screen. The server broadcasts via WebSocket to the client.
// Claude Code checks if EDITOR is in a hardcoded set of GUI editor names:
// ["code","cursor","windsurf","codium"] — if it is, it does NOT clear the screen.
// So we create a fake "code" wrapper script and set EDITOR to its path.
// This tricks Claude Code into treating our editor as a GUI editor.
// The tools dir (agent CLIs, PATH-prepended into sessions) and the editor
// helper are SEPARATE dirs since B-b87b: the fake `code` on the session PATH
// shadowed a real VS Code `code` binary for every local shell/claude/codex
// terminal (a `code file.txt` hung forever waiting for the Ctrl+G signal).
// EDITOR= stays the absolute path, so Ctrl+G is unaffected; only PATH
// resolution loses the fake. (Remote already ships it to ~/.vibespace/editor.)
const AGENT_BIN_DIR = path.join(rootDir, 'data', 'bin');
const EDITOR_DIR = path.join(AGENT_BIN_DIR, 'editor');
const EDITOR_CMD = path.join(EDITOR_DIR, 'code'); // named "code" to match GUI editor check

function createEditorHelper() {
  ensureDir(EDITOR_DIR);
  // The script: "code -w <file>" is how Claude Code invokes it.
  // -w (--wait) flag is passed by Claude Code for known GUI editors.
  // We accept all flags, extract the filename, notify server via HTTP, and wait.
  const script = `#!/bin/bash
# WebUI editor disguised as "code" so Claude Code treats it as GUI (no screen clear).
# Parse args: skip flags, last arg is the file
FILE="\${@: -1}"
# B-3767: a fresh random name (a pid comes back, and an old signal left under it made Ctrl+G return at once)
SIGNAL="\$(mktemp -u "\${TMPDIR:-/tmp}/claude-webui-edit-signal-XXXXXXXXXX")" || SIGNAL="\${TMPDIR:-/tmp}/claude-webui-edit-signal-\$\$-\$RANDOM\$RANDOM"   # never empty: an empty name would wait for ever
PORT="\${CLAUDE_WEBUI_PORT:-${port}}"
SESS="\${CLAUDE_WEBUI_SESSION_ID}"
curl -sf -X POST "http://localhost:\${PORT}/api/editor/open" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer \${VIBESPACE_SESSION_TOKEN}" \\
  -d "{\\"file\\":\\"\$FILE\\",\\"signal\\":\\"\$SIGNAL\\",\\"sessionId\\":\\"\$SESS\\"}" >/dev/null 2>&1 &
while [ ! -f "\$SIGNAL" ]; do sleep 0.2; done
rm -f "\$SIGNAL"
`;
  fs.writeFileSync(EDITOR_CMD, script, { mode: 0o755 });
  // pre-B-b87b installs left the fake at data/bin/code — still on the session
  // PATH; remove it or the shadow survives the move
  try { fs.unlinkSync(path.join(AGENT_BIN_DIR, 'code')); } catch {}
}
createEditorHelper();

// vibespace-status — the agent-facing status tool (session-status feature).
// Spawned sessions get data/bin on PATH + VIBESPACE_API/VIBESPACE_SESSION_TOKEN
// in env, so an agent can run e.g. `vibespace-status blocked --urgency high
// --reason "waiting for DB credentials"` from its ordinary shell tool.
const STATUS_CMD = path.join(AGENT_BIN_DIR, 'vibespace-status');
function createStatusHelper() {
  ensureDir(AGENT_BIN_DIR);
  const script = `#!/usr/bin/env node
// vibespace-status — report THIS session's own state to the VibeSpace board.
// (For the whole task's status, use vibespace-task status instead.) Run with
// NO arguments to print usage AND the current state. The user sees this on your
// session card and may adjust it; if they do, you'll be told on their next turn.
// lane cli-call-timeouts: THE ONE CALL to the hub (src/cli-call.js in a checkout; its boot-time copy cli-call.js beside
// this file) — bounded (a write 30 s), ONE line naming the wait on expiry (exit 124); --timeout <s> overrides
const CC = (() => {
  const beside = require('node:path').join(__dirname, 'cli-call.js');   // (by its full path: this text is a template the static resolve walk reads)
  try { return require('node:fs').existsSync(require('node:path').join(__dirname, '..', '..', 'server.js')) ? require('../../src/cli-call.js') : require(beside); } catch { }
  try { return require(beside); } catch { return null; }
})();
if (!CC) { console.error("vibespace-status: refused — this CLI's call helper (cli-call.js) is missing beside it, so it could not bound its wait; nothing was sent — ask the user to reinstall the agent tools (Manage agents → the machine → Install)"); process.exit(2); }
CC.cliStart({ tool: 'vibespace-status', flags: ['--timeout', '--call-timeout'] });
const api = process.env.VIBESPACE_API;
const token = process.env.VIBESPACE_SESSION_TOKEN;
if (!api || !token) { console.error('vibespace-status: not running inside a VibeSpace session (missing env)'); process.exit(2); }
const args = process.argv.slice(2);
if (args[0] === 'set') args.shift(); // tolerated alias: "vibespace-status set working" — agents guess it
const cmd = args[0];
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const STATES = ['working', 'needs-input', 'blocked', 'review', 'done'];
const USAGE = [
  'usage — report THIS Task\\'s (this session\\'s) own state; done = this work is finished:',
  '  vibespace-status <working|needs-input|blocked|review|done> ["why"] [--urgency low|normal|high|urgent] [--reason "one-line why"] [--detail "full context"]',
  '  vibespace-status clear      remove the indicator',
  '  vibespace-status show       print the current indicator',
  '',
  'The user reads this on the board — keep it honest and current. blocked/needs-input/review REQUIRE',
  '--reason (one line) + --detail (full context). Set them the MOMENT you are stuck or waiting;',
  'done when finished.',
  'If you are waiting on the user, ALSO ask in chat + file it with vibespace-ask (both).',
].join('\\n');
async function post(body) {
  const res = await CC.call(api + '/api/agent/session-status', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('vibespace-status:', data.error || res.status); process.exit(1); }
  return data;
}
function printStatus(data) {
  const s = data.status;
  console.log(s ? \`state=\${s.state || 'unset'} urgency=\${s.urgency || 'unset'}\${s.reason ? ' reason=' + JSON.stringify(s.reason) : ''} (set by \${s.setBy})\` : 'no status set');
  if (s && s.detail) console.log('  detail: ' + s.detail);
}
async function main() {
  if (cmd === '--help' || cmd === '-h') { console.log(USAGE); return; }
  if (!cmd) { console.log(USAGE); console.log(''); try { printStatus(await post({ show: true })); } catch {} return; }
  if (cmd === 'show') { printStatus(await post({ show: true })); return; }
  if (cmd === 'clear') { await post({ clear: true }); console.log('status cleared'); return; }
  if (!STATES.includes(cmd)) {
    console.error('vibespace-status: unknown state "' + cmd + '"\\n  valid states: ' + STATES.join('/') + '\\n' + USAGE);
    process.exit(1);
  }
  // A bare quoted string after the state is a reason too — agents pass it
  // positionally at least as often as via --reason; dropping it silently
  // meant boards showed states with no explanation.
  const posReason = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
  const reasonVal = opt('reason') ?? posReason;
  const detailVal = opt('detail');
  if (['blocked', 'needs-input', 'review'].includes(cmd) && (!(reasonVal || '').trim() || !(detailVal || '').trim())) {
    // A same-state record that already carries BOTH may be tweaked
    // (e.g. bumping --urgency) without re-sending them — check before failing.
    let existing = null;
    try { existing = (await post({ show: true })).status; } catch {}
    if (!(existing && existing.state === cmd && (existing.reason || '').trim() && (existing.detail || '').trim())) {
      console.error('vibespace-status: "' + cmd + '" needs BOTH --reason (one line) AND --detail (full context).');
      console.error('  e.g. vibespace-status ' + cmd + ' --reason "waiting for the S3 credentials" --detail "Deploy needs the bucket keys; checked .env and the mounts config, not there. Recommend pasting them in chat." --urgency high');
      console.error('  (then say it in your chat reply and mirror it with: vibespace-ask "...")');
      process.exit(1);
    }
  }
  await post({ state: cmd, urgency: opt('urgency'), reason: reasonVal, detail: detailVal });
  console.log('status set: ' + cmd + (opt('urgency') ? ' / ' + opt('urgency') : ''));
  if (cmd === 'blocked' || cmd === 'needs-input' || cmd === 'review') {
    console.log('REMINDER: you are waiting on the user — write what you need (with your recommendation) in your CHAT REPLY now, and mirror it with: vibespace-ask "..."');
  }
}
main().catch((e) => { console.error('vibespace-status:', e.message); process.exit(1); });
`;
  fs.writeFileSync(STATUS_CMD, script, { mode: 0o755 });
}
createStatusHelper();

// vibespace-usage — PASSIVE subscription-usage capture (statusLine hook). It's a
// STATIC tracked file (data/bin/vibespace-usage), not generated — just make sure
// it's present + executable and the cache dir exists. See §ban-safety: this
// replaces all background /api/oauth/usage polling with a zero-API-call source.
const USAGE_STATUSLINE_CMD = path.join(AGENT_BIN_DIR, 'vibespace-usage');
try { ensureDir(USAGE_CACHE_DIR); } catch {}
try { if (fs.existsSync(USAGE_STATUSLINE_CMD)) fs.chmodSync(USAGE_STATUSLINE_CMD, 0o755); } catch {}
// The user's OWN statusLine command (from ~/.claude/settings.json), so injected
// VibeSpace terminal sessions render it transparently (pass-through) instead of
// replacing it. Read fresh each spawn — cheap, and the user may change it.
// r2345 (b): read OFF THE LOOP through the runner's guard, within 2 s — it was a synchronous read of the person's home at every
// local terminal start; a home that does not answer (or an earlier read still out) passes no statusline through for that start
// (the usage one still runs), said once per cause; a missing or unparsable file is no statusline, as before
// r2513 (2)/(3) + r2592 (1): SAID WHERE THE PERSON LOOKS, AND ONLY WHEN SOMEONE SAW IT — `unread(why, seq)` (the start's notice) answers
// how many pages it reached (serverNotice's count); the told-mark latches only above 0, so a start with no page open (a resume, a task,
// an API start) tells no one and latches nothing: the next stalled start tries again. A silent home (its read past the bound, or
// refused while one is out) is ONE cause while it lasts; any answer of the home (a value, or a missing file) ends it and moves `seq`,
// so the next stall's notice has a fresh name (serverNotice says one name once a boot). The journal says each silent spell once.
const STATUSLINE_READ_MS = 2000;
let _statuslineTold = false, _statuslineWarned = false, _statuslineSeq = 0;
const statuslineAnswered = () => { if (_statuslineTold || _statuslineWarned) _statuslineSeq++; _statuslineTold = false; _statuslineWarned = false; };
async function userStatuslineCmd({ unread = null } = {}) {
  const read = () => fs.promises.readFile(path.join(os.homedir(), '.claude', 'settings.json'), 'utf-8');
  const r = typeof homeRead === 'function' ? await homeRead(read, STATUSLINE_READ_MS, { cls: 'statusline' }) : await read().then((value) => ({ value }), (error) => ({ error }));   // r2592 (2): one read out for every start that asks
  if (!('value' in r)) {
    if (r.held || r.timedOut) {
      if (!_statuslineWarned) { _statuslineWarned = true; console.warn(`[statusline] ~/.claude/settings.json was not read (${r.why}) — this start passes no statusline of the person's through; read again at the next start`); }
      if (!_statuslineTold && typeof unread === 'function') { let n = 0; try { n = Number(unread(String(r.why || 'no answer'), _statuslineSeq)) || 0; } catch { n = 0; } if (n > 0) _statuslineTold = true; }
    } else statuslineAnswered();   // the home answered (no file, or not readable as such): no statusline, as before
    return '';
  }
  statuslineAnswered();
  try {
    const s = JSON.parse(r.value);
    const sl = s && s.statusLine;
    if (sl && sl.type === 'command' && typeof sl.command === 'string' && sl.command.trim()) return sl.command;
  } catch {}
  return '';
}

// vibespace-hook — dual-harness SessionStart hook (task context injection, P2).
// Registered in ~/.claude/settings.json AND ~/.codex/hooks.json (same schema,
// proven by the org's claude-task-tracker plugin). GATED on env: sessions not
// spawned by VibeSpace with a task have no VIBESPACE_TASK_ID → instant no-op,
// so global registration never affects other sessions. Output contract copied
// from the live-verified plugin: top-level {additionalContext} JSON on stdout.
const HOOK_CMD = path.join(AGENT_BIN_DIR, 'vibespace-hook.mjs');
function createHookHelper() {
  ensureDir(AGENT_BIN_DIR);
  const script = `#!/usr/bin/env node
// vibespace-hook — delivers VibeSpace task context through the harness's OWN
// native hooks (never by rewriting the user's message):
//   SessionStart     → the task's context (goal, plan, files, rules)
//   UserPromptSubmit → any pending status-override notice for this session
// No-op unless the session was spawned by VibeSpace (VIBESPACE_* env present).
// THE TURN CARRIED IT — THEN THE HUB MARKS IT (lane report-mark-on-ack, 2026-11-09): the hub moves the marks of an answer
// (a group message «read by», a Task Group delta seen, a notice consumed) only when this hook says it handed the answer to
// the CLI — its stdout written, then the answer's delivery id POSTed back (measured on claude 2.1.321: the CLI attaches
// what the hook printed before exit 0; an answer later than the 3 s fetch abort, or a Stop that SIGTERMs this hook, prints
// nothing and confirms nothing — the hub composes it again next turn). When it prints nothing it says WHY on stderr: the
// CLI keeps a hook's stderr out of the model's context (measured) and hands it to the chat wrapper's log.
let buf = '';
let ran = false;
async function run(input) {
  if (ran) return;
  ran = true;
  try {
    const event = input.hook_event_name;
    const api = process.env.VIBESPACE_API;
    const token = process.env.VIBESPACE_SESSION_TOKEN;
    if (!api || !token) return process.exit(0);
    let path;
    if (event === 'SessionStart') {
      // Which Task Group(s) this session belongs to is resolved SERVER-SIDE from
      // the token (live-derived — explicit tag / auto-include folder / spawned-
      // into group), so the hook passes no id. With groups it returns their
      // shared context; with none, the baseline VibeSpace tools intro (so every
      // session still learns to report its status).
      path = '/api/agent/task-context';
    } else if (event === 'UserPromptSubmit') {
      path = '/api/agent/prompt-context';
    } else if (event === 'Stop') {
      // Bookkeeping nudge with teeth: the SERVER decides (status freshness +
      // 30min cooldown) whether the agent must update its board before this
      // stop sticks. stop_hook_active = we already nudged — never loop.
      if (input.stop_hook_active) return process.exit(0);
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 2500);
      const r = await fetch(api + '/api/agent/stop-check', { headers: { Authorization: 'Bearer ' + token }, signal: c2.signal });
      clearTimeout(t2);
      if (r.ok) {
        const d = await r.json();
        if (d && d.block && d.reason) process.stdout.write(JSON.stringify({ decision: 'block', reason: d.reason }));
      }
      return process.exit(0);
    } else {
      return process.exit(0);
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    // The hook NAMES its event (channel-jump verify r7): a harness that runs this hook and drops its answer (the codex
    // app-server) gets an empty one and nothing is drained or consumed for it — the wrapper's own call is its delivery.
    // It says it will CONFIRM (lane report-mark-on-ack) and when it asked (the hub's journal names an answer it was too late for).
    let res;
    try { res = await fetch(api + path, { headers: { Authorization: 'Bearer ' + token, 'X-VibeSpace-Hook-Event': event, 'X-VibeSpace-Confirm': '1', 'X-VibeSpace-Hook-Sent': String(Date.now()) }, signal: ctl.signal }); }
    catch (e) { say(ctl.signal.aborted ? 'the hub did not answer within 3 s' : 'the hub is unreachable (' + ((e && e.cause && e.cause.code) || (e && e.message) || e) + ')'); return process.exit(0); }
    clearTimeout(timer);
    if (!res.ok) say('the hub answered HTTP ' + res.status);
    if (res.ok) {
      const data = await res.json();
      if (data && data.context) {
        // BOTH harnesses read the NESTED hookSpecificOutput.additionalContext
        // (verified against the Claude 2.1.201 binary — it suggests "Did you
        // mean hookSpecificOutput" — and the Codex *HookSpecificOutputWire
        // JSON schema). Emit ONLY that: Codex's output schema is strict
        // (additionalProperties:false), so an extra top-level additionalContext
        // key makes Codex reject the whole object and inject nothing.
        // a stdout the CLI closed is an answer, never a crash (acceptance r1, law C): the write's error is said below
        process.stdout.on('error', () => { });
        const wrote = await new Promise((resolve) => process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: event, additionalContext: data.context },
        }), (e) => resolve(e ? (e.code || 'error') : true)));
        if (wrote !== true) say('its answer could not be written to the CLI (' + wrote + ')');
        else if (typeof data.delivery === 'string') await carried(api, token, data.delivery);
      }
    }
  } catch (e) { say('the hook failed (' + ((e && e.message) || e) + ')'); }
  process.exit(0);
}
/** why this turn has no hub context — stderr only (never the model's context), one line */
function say(why) { try { console.error('vibespace-hook: no hub context this turn — ' + String(why).slice(0, 200)); } catch { } }
/** the answer is written to the CLI: hand its delivery id back. The request is WRITTEN (flushed to the socket)
 *  before this exits — the hub reads a complete request even after the hook is gone; the turn never waits on its answer. */
async function carried(api, token, delivery) {
  try {
    const u = new URL(api + '/api/agent/prompt-context/carried');
    const mod = await import(u.protocol === 'https:' ? 'node:https' : 'node:http');
    const body = JSON.stringify({ delivery });
    await new Promise((resolve) => {
      const done = setTimeout(resolve, 1000);
      const rq = mod.request(u, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (r) => { r.resume(); r.on('end', () => { clearTimeout(done); resolve(); }); });
      rq.on('error', () => { clearTimeout(done); resolve(); });
      rq.on('finish', () => { clearTimeout(done); setTimeout(resolve, 20); });
      rq.end(body);
    });
  } catch { }
}
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (c) => { buf += c; try { run(JSON.parse(buf)); } catch { } });
process.stdin.on('end', () => { try { run(JSON.parse(buf)); } catch { } if (!ran) process.exit(0); });
setTimeout(() => { say('the hook stopped at its 8 s limit (the CLI did not take its answer)'); process.exit(0); }, 8000); // never hang a session start — and say so (lane report-mark-on-ack r3)
`;
  fs.writeFileSync(HOOK_CMD, script, { mode: 0o755 });

  // Remote-side registration + CLI-CONFIG helper (P3; design-harness-settings
  // §6 since 2.369.123): distributed to remote hosts alongside the hook so a
  // REMOTE session's own Claude/Codex fires the hook natively (our LOCAL
  // registration can't reach the remote box) AND so the managed CLI-config
  // keys (claude cleanupPeriodDays, codex [history] persistence, …) reach that
  // machine. It is driven by ONE plan — VIBESPACE_CLI_CONFIG = base64 JSON from
  // harness-config-sync.cliConfigPlan() (the SAME env at all three sites:
  // hosts.installAgentTools, the ssh per-spawn prelude, the dial run-cmd) —
  // and it applies it with the SHARED applier src/harness-config.js, whose
  // FILE TEXT is embedded below verbatim (never Function.toString: a closure
  // reference would become a free identifier = the 2.340.2/2.341.1 lost-binding
  // class). The helper is ESM (`import … from`) while the applier is CJS, so
  // `require` is minted with createRequire and the applier is evaluated inside
  // a function body with its own `module`/`exports`. Self-locating hook cmd
  // (`node <its own dir>/vibespace-hook.mjs`).
  //   (default)     apply the plan: our hook entries + managed keys; prints
  //                 one CFG| receipt line per managed key, and one for our hook
  //                 entries per file whose plan touches them (r2844)
  //   --status      READ-ONLY: prints the receipts (hosts.agentToolsStatus —
  //                 grep-gated on this very env name so an older helper, which
  //                 would treat --status as an ordinary REGISTRATION RUN, is
  //                 never asked)
  //   --uninstall   strips ONLY our hook entries; NEVER a managed key (the
  //                 retention a user asked for is not "our entry")
  // Without the env (an older server, or --uninstall) the embedded DEFAULT_PLAN
  // — hooks only, no managed keys — applies, so hook registration keeps working
  // exactly as before.
  const applierText = fs.readFileSync(path.join(__dirname, '..', 'harness-config.js'), 'utf8'); // module-relative: the generator's own tree, whatever rootDir a test hands it
  const defaultPlan = buildConfigPlan(configPlanSpecs(listHarnesses(), { hooksOnly: true }));
  const reg = '#!/usr/bin/env node\n'
    + '// GENERATED by src/server/agent-tool-generators.js (VibeSpace) — do not edit; re-shipped on every install/spawn.\n'
    + "import { createRequire } from 'module';\n"
    + "import { join, dirname } from 'path';\n"
    + "import { homedir } from 'os';\n"
    + "import { fileURLToPath } from 'url';\n"
    + 'const require = createRequire(import.meta.url);\n'
    + '// ---- src/harness-config.js (SHARED applier), embedded from the module FILE TEXT ----\n'
    + 'const __applier = (() => { const module = { exports: {} }; const exports = module.exports;\n'
    + applierText + '\n'
    + 'return module.exports; })();\n'
    + '// ---- end of src/harness-config.js ----\n'
    + 'const DEFAULT_PLAN = ' + JSON.stringify(defaultPlan) + ';\n'
    + "const UNINSTALL = process.argv.includes('--uninstall');\n"
    + "const STATUS = process.argv.includes('--status');\n"
    + 'const plan = __applier.decodePlan(process.env.VIBESPACE_CLI_CONFIG) || DEFAULT_PLAN;\n'
    // ABSOLUTE interpreter (2.244.2, userN's Novita: hook error '/bin/sh: 1:
    // node: not found'): hooks run as claude children via /bin/sh with claude's
    // PATH — hosts with nvm-style node installs (and claude as a native binary)
    // have NO node on that PATH. The register itself runs under node, so its own
    // process.execPath is an interpreter that provably exists on this machine.
    // B-b83c (r320): a versioned runtime folder's node is persisted through its `current` link (it survives a runtime switch)
    + "const hookCmd = JSON.stringify(__applier.stableNodePath(process.execPath)) + ' ' + join(dirname(fileURLToPath(import.meta.url)), 'vibespace-hook.mjs');\n"
    + 'const home = homedir();\n'
    + 'try {\n'
    + "  const receipts = STATUS ? __applier.readConfigPlan(plan, { home }) : __applier.applyConfigPlan(plan, { home, hookCmd, uninstall: UNINSTALL }).receipts;\n"
    + "  process.stdout.write(__applier.formatReceiptLines(receipts) + '\\n');\n"
    + "} catch (e) { process.stdout.write('CFG|*|*|error|' + encodeURIComponent(JSON.stringify(String((e && e.message) || e))) + '\\n'); }\n";
  fs.writeFileSync(path.join(AGENT_BIN_DIR, 'vibespace-hook-register.mjs'), reg, { mode: 0o755 });
}
createHookHelper();

// THE BROWSER CLI'S VERB TABLE, beside the CLI (design-browser-takeover §3.1):
// data/bin/vibespace-browser is a STATIC single file that ships to hosts with
// no checkout, so the ONE router it runs (src/browser-verbs.js, PURE) rides
// with it as data/bin/vibespace-browser-verbs.js — COPIED here at every boot
// (gitignored, like vibespace-status: a generated file that is tracked
// dirties the tree), and in AGENT_TOOLS so every ship path carries it. In a
// checkout the CLI reads src/ itself; the copy is the remote's.
function createBrowserVerbsCopy() {
  try {
    const src = fs.readFileSync(path.join(rootDir, 'src', 'browser-verbs.js'));
    const dst = path.join(AGENT_BIN_DIR, 'vibespace-browser-verbs.js');
    let cur = null; try { cur = fs.readFileSync(dst); } catch { cur = null; }
    if (!cur || !cur.equals(src)) { ensureDir(AGENT_BIN_DIR); fs.writeFileSync(dst + '.tmp', src, { mode: 0o644 }); fs.renameSync(dst + '.tmp', dst); }
  } catch (e) { console.warn('[tools] browser verb table not copied beside vibespace-browser: ' + e.message); }
}
createBrowserVerbsCopy();
// lane browser-stuck (2026-09-28): the page-dialog words the CLI prints (PURE src/browser-stuck.js) ride beside it the
// same way — `vibespace-browser-stuck.js`, copied at every boot, gitignored, in AGENT_TOOLS; the CLI loads it OPTIONALLY
// (an older copy without it passes the browser CLI's own dialog lines through unchanged)
function createBrowserStuckCopy() {
  try {
    const src = fs.readFileSync(path.join(rootDir, 'src', 'browser-stuck.js'));
    const dst = path.join(AGENT_BIN_DIR, 'vibespace-browser-stuck.js');
    let cur = null; try { cur = fs.readFileSync(dst); } catch { cur = null; }
    if (!cur || !cur.equals(src)) { ensureDir(AGENT_BIN_DIR); fs.writeFileSync(dst + '.tmp', src, { mode: 0o644 }); fs.renameSync(dst + '.tmp', dst); }
  } catch (e) { console.warn('[tools] browser dialog words not copied beside vibespace-browser: ' + e.message); }
}
createBrowserStuckCopy();
// lane browser-passkey (2026-10-05): the passkey words + loop verdict (PURE src/browser-passkey.js) ride beside it the same
// way — `vibespace-browser-passkey.js`, copied at every boot, gitignored, in AGENT_TOOLS; loaded OPTIONALLY by the CLI
function createBrowserPasskeyCopy() {
  try {
    const src = fs.readFileSync(path.join(rootDir, 'src', 'browser-passkey.js'));
    const dst = path.join(AGENT_BIN_DIR, 'vibespace-browser-passkey.js');
    let cur = null; try { cur = fs.readFileSync(dst); } catch { cur = null; }
    if (!cur || !cur.equals(src)) { ensureDir(AGENT_BIN_DIR); fs.writeFileSync(dst + '.tmp', src, { mode: 0o644 }); fs.renameSync(dst + '.tmp', dst); }
  } catch (e) { console.warn('[tools] browser passkey words not copied beside vibespace-browser: ' + e.message); }
}
createBrowserPasskeyCopy();
// lane digit-zero (2026-11-17): the read-back of a fill (PURE src/browser-read-back.js — its own file so the device bundle never
// carries it) rides beside it the same way — `vibespace-browser-read-back.js`, copied at every boot, gitignored, in AGENT_TOOLS;
// loaded OPTIONALLY by the CLI. Copied OFF the loop (no sync write — the store-write and sync-fs censuses): a fill before it lands
// answers as the driver does
function createBrowserReadBackCopy() {
  const dst = path.join(AGENT_BIN_DIR, 'vibespace-browser-read-back.js'), tmp = dst + '.tmp';
  fs.promises.mkdir(AGENT_BIN_DIR, { recursive: true })
    .then(() => fs.promises.copyFile(path.join(rootDir, 'src', 'browser-read-back.js'), tmp))
    .then(() => fs.promises.rename(tmp, dst))
    .catch((e) => console.warn('[tools] browser read-back not copied beside vibespace-browser: ' + (e && e.message)));
}
createBrowserReadBackCopy();
// lane cli-one-text-arg (the owner 2026-10-14): ONE TEXT PER FREE-TEXT COMMAND — the rule vibespace-msg / -channels / -ask /
// -task share (PURE src/agent-cli-text.js: the stray-word refusal, the --text-file / --text - doors, the `sent: N` echo)
// rides beside them the same way — `agent-cli-text.js` (its own name: the CLIs require it by that literal name), copied at
// every boot, gitignored, in AGENT_TOOLS. A free-text
// verb REFUSES without it (it could not tell a stray word), so every ship path must carry it.
function createCliTextCopy() {
  try {
    const src = fs.readFileSync(path.join(rootDir, 'src', 'agent-cli-text.js'));
    const dst = path.join(AGENT_BIN_DIR, 'agent-cli-text.js');
    let cur = null; try { cur = fs.readFileSync(dst); } catch { cur = null; }
    if (!cur || !cur.equals(src)) { ensureDir(AGENT_BIN_DIR); fs.writeFileSync(dst + '.tmp', src, { mode: 0o644 }); fs.renameSync(dst + '.tmp', dst); }
  } catch (e) { console.warn('[tools] the agent CLIs\' text rule not copied beside them: ' + e.message); }
}
createCliTextCopy();
// lane cli-call-timeouts: THE ONE CALL every agent CLI makes to the hub (PURE timing + the one transport, src/cli-call.js)
// rides beside them the same way — `cli-call.js`, copied at every boot, gitignored, in AGENT_TOOLS. A CLI REFUSES without it
// (it could not bound its wait), so every ship path must carry it.
function createCliCallCopy() {
  try {
    const src = fs.readFileSync(path.join(rootDir, 'src', 'cli-call.js'));
    const dst = path.join(AGENT_BIN_DIR, 'cli-call.js');
    let cur = null; try { cur = fs.readFileSync(dst); } catch { cur = null; }
    if (!cur || !cur.equals(src)) { ensureDir(AGENT_BIN_DIR); fs.writeFileSync(dst + '.tmp', src, { mode: 0o644 }); fs.renameSync(dst + '.tmp', dst); }
  } catch (e) { console.warn('[tools] the agent CLIs\' call helper not copied beside them: ' + e.message); }
}
createCliCallCopy();
// lane lg-store-writes (B-15ac, 主开发 r755): the ONE close of a written file (src/fd-close.js) rides beside the CLIs the same way —
// `fd-close.js`, copied at every boot, gitignored, in AGENT_TOOLS; the channels CLI loads it (else says the same words inline)
function createFdCloseCopy() {   // (off the loop, as the read-back's copy: no synchronous write at the boot)
  const dst = path.join(AGENT_BIN_DIR, 'fd-close.js'), tmp = dst + '.tmp';
  fs.promises.mkdir(AGENT_BIN_DIR, { recursive: true })
    .then(() => fs.promises.copyFile(path.join(rootDir, 'src', 'fd-close.js'), tmp))
    .then(() => fs.promises.rename(tmp, dst))
    .catch((e) => console.warn('[tools] the agent CLIs\' close helper not copied beside them: ' + (e && e.message)));
}
createFdCloseCopy();
// lane human-cli: THE PERSON'S CLI (data/bin/vibespace — a human at a terminal, no hub needed) requires its PURE half
// (src/local-index.js: the index place, the judge, the table, the dtach packet, the chat frames) by the literal name
// `vibespace-local-index.js` beside it — copied at every boot, gitignored, in AGENT_TOOLS (a paired device or an ssh host
// answers «no VibeSpace hub has run here» with it). The hub ALSO installs both onto the machine's own disk
// (src/server/local-index.js installPersonCli): a CLI under data/ hangs with data/.
function createLocalIndexCopy() {
  try {
    const src = fs.readFileSync(path.join(rootDir, 'src', 'local-index.js'));
    const dst = path.join(AGENT_BIN_DIR, 'vibespace-local-index.js');
    let cur = null; try { cur = fs.readFileSync(dst); } catch { cur = null; }
    if (!cur || !cur.equals(src)) { ensureDir(AGENT_BIN_DIR); fs.writeFileSync(dst + '.tmp', src, { mode: 0o644 }); fs.renameSync(dst + '.tmp', dst); }
  } catch (e) { console.warn('[tools] the person\'s CLI index rules not copied beside it: ' + e.message); }
}
createLocalIndexCopy();

// Idempotent, NON-DESTRUCTIVE hook registration for both harnesses: only our
// own entry (matched by 'vibespace-hook.mjs') is ever added or updated; every
// other key/entry (e.g. the task-tracker plugin's hooks) is left untouched.
// Runs at every startup AND on demand from the Manage Agents dialog, which
// shows per-harness status so non-engineers can see + repair the integration.
// Per-harness hook file + events come from the HARNESS REGISTRY (S6,
// src/harnesses/<id>.js inject.hookFile / inject.hookEvents): SessionStart
// delivers task context, UserPromptSubmit pending status notices, Stop (claude
// only — codex's app-server has no blockable Stop hook; its nudge rides the
// wrapper's turn/completed) the bookkeeping nudge. A harness without a hook
// file (shell, ACP agents) is simply absent here.
const HOOK_FILES = Object.fromEntries(listHarnesses().filter((h) => h.inject && h.inject.hookFile).map((h) => [h.id, h.inject.hookFile]));
const HOOK_EVENTS_FOR = (harness) => { const h = listHarnesses().find((x) => x.id === harness); return h?.inject?.hookEvents ? [...h.inject.hookEvents] : []; };
// Persisted opt-out: when the user clicks Remove in Manage Agents, we drop this
// marker so startup does NOT silently re-register the hooks they removed.
const HOOK_OPTOUT_FILE = path.join(rootDir, 'data', '.agent-hooks-optout');
// B-f276 (lane login-request-card, s1126 — THE STORE-READ LAW on the opt-out mark): the release asked `fs.existsSync`, which answers
// false on ANY failure. A start whose read of the mark failed WROTE BACK the hooks a person had removed (the next good start stripped
// them: they ran in between), every run of this machine's config wrote our hook rows (server.js hooksWanted), the status said «not
// opted out», and an Install whose removal of the mark failed installed — then the next start stripped it. Now the mark answers
// 'opted-out' (there), 'not' (ENOENT: store-read's «missing», the only «no») or { unread: code } — nothing is written for an unread
// mark, it is said once per code, and the next read decides (the heal). No call is added on the loop: optOutMarkNow is the stat in
// place of the existsSync the start (it decides at its call: r1518) and server.js's two synchronous callers made; the status reads
// it off the loop (optOutMark).
const optOutSaid = new Set();
const optOutAnswer = (error) => { const a = SR.storeAnswer({ error }); if (a.state === 'missing') return 'not'; if (!optOutSaid.has(a.code)) { optOutSaid.add(a.code); console.warn(`[hooks] the opt-out mark (data/.agent-hooks-optout) could not be read (${a.code}) — no hook entry is written or removed for it until it reads`); } return { unread: a.code }; };
/** the opt-out mark, read OFF the loop → 'opted-out' | 'not' | { unread: code } */
const optOutMark = () => fs.promises.access(HOOK_OPTOUT_FILE).then(() => 'opted-out', optOutAnswer);
/** the same answer for a caller that is synchronous already (the start, decided at its call; server.js: hooksWanted, the health probe) */
const optOutMarkNow = () => { try { fs.statSync(HOOK_OPTOUT_FILE); return 'opted-out'; } catch (error) { return optOutAnswer(error); } };
// The CAS writer (read → mutate → compare-and-swap → tmp+rename), the
// hook-entry finder and the two mutators live in src/harness-config.js since
// 2.369.123 — ONE implementation for this machine AND the remote helper (which
// embeds that file's text). Hand-edited shapes never throw: skip non-conforming
// entries so agentHooksStatus/ensure/remove degrade gracefully instead of 500ing.
const _findOurHookIn = findOurHookIn;
// TRANSCRIPT RETENTION (2.369.118) is no longer a special case here: it is the
// claude table's cli-config row `transcriptRetentionDays` (src/harness-settings.js),
// written by src/server/harness-config-sync.js through the same CAS writer.
// r2345 (B-ddf3, THE ROW's OWN HARM): the hook files' facts are read OFF THE LOOP (fs.promises) and THROUGH THE RUNNER's GUARD —
// bounded, counted while out, refused at once while an earlier read of the home is out. They were read synchronously on the
// hub's loop by the six-hourly hook health check (a road that repeats by itself) and the hooks routes: a hung home froze the hub
const STATUS_READ_MS = 10000;   // a person's page and the six-hourly check wait this long at most
async function hookFileFacts() {
  const out = {};
  for (const [key, def] of Object.entries(HOOK_FILES)) {
    const file = def.file();
    let text = null, code = null;
    try { text = await fs.promises.readFile(file, 'utf-8'); } catch (e) { code = (e && e.code) || 'EIO'; }
    // r2844: a LINK TO NOWHERE is there and unreadable (the helper refuses it by name, never «created» over it) — not a missing file
    if (code === 'ENOENT') { try { if ((await fs.promises.lstat(file)).isSymbolicLink()) code = 'EDANGLING'; } catch { } }
    let dirExists = true; try { await fs.promises.stat(path.dirname(file)); } catch { dirExists = false; }
    out[key] = { file, text, fileExists: text !== null || (code !== 'ENOENT' && code !== 'ENOTDIR'), dirExists };
  }
  return out;
}
let _statusUnreadSaid = null;   // the last «not read» said (once per cause, not once per page)
async function agentHooksStatus() {
  // the spelling the SHIPPED HELPER writes on this machine (B-ddf3 unit 2 line 1, r1407 (e)): the stable node path (B-b83c)
  const hookCmd = `${JSON.stringify(stableNodePath(process.execPath))} ${HOOK_CMD}`; // absolute interpreter (2.244.2 — see the register template note)
  const sameRunner = (c) => c === hookCmd || keepsHookCommand(c, hookCmd);
  const mark = await optOutMark();   // B-f276 (s1126): UNREAD answers as the start acts on it — nothing will be created — and says why
  const out = { hookPath: HOOK_CMD, optedOut: mark !== 'not', ...(mark && mark.unread ? { optOutUnread: mark.unread } : {}), refused: ownerWriteRefusal(), registeredAfterError: _registeredAfterError }; // verify r2 ①: the chip says "registered at HH:MM after an earlier read error"
  const r = typeof homeRead === 'function' ? await homeRead(hookFileFacts, STATUS_READ_MS, { cls: 'hook-status' }) : await hookFileFacts().then((value) => ({ value }), (error) => ({ error }));   // r2592 (2): one read out for every page and check that asks
  if (!r.value) {
    const why = `the hook files were not read (${r.why || (r.error && r.error.message) || r.error || 'no answer'})`;
    const cause = r.held || r.timedOut ? 'silent' : why;   // r2513 (3): a home that does not answer is ONE cause, timed out or refused
    if (_statusUnreadSaid !== cause) { _statusUnreadSaid = cause; console.warn(`[hooks] ${why} — the status says «not read»; nothing is judged broken or repaired on it`); }
  } else _statusUnreadSaid = null;
  for (const [key, def] of Object.entries(HOOK_FILES)) {
    const f = r.value && r.value[key];
    // NOT READ: no fact is claimed — fileExists / dirExists / installed null (the six-hourly check skips an entry whose file is not
    // known to exist: nothing is judged broken, nothing repaired, on not knowing); the page says why
    if (!f) { out[key] = { file: def.file(), unread: String(r.why || (r.error && r.error.message) || r.error || 'no answer'), fileExists: null, dirExists: null, creatable: false, parseError: false, installed: null, stale: false }; continue; }
    let root = null, parseError = false;
    if (f.text !== null) { try { root = JSON.parse(f.text); } catch { parseError = true; } } else parseError = f.fileExists;   // there but unreadable, or not JSON
    let found = [];
    const evs = HOOK_EVENTS_FOR(key);
    try { found = evs.map(ev => root ? _findOurHookIn(root.hooks?.[ev]) : null); } catch { found = evs.map(() => null); }
    out[key] = {
      file: f.file,
      fileExists: f.fileExists,
      dirExists: f.dirExists,                                                    // the CLI has run here (its config directory exists)
      creatable: !f.fileExists && f.dirExists && def.createIfMissing === 'dir-exists', // missing, and the next registration creates it (lane hooks-create)
      parseError,
      installed: found.every(h => h && sameRunner(h.command)),   // r1407 (d): a spelling the applier KEEPS reads installed — the six-hourly check starts no run for it
      stale: found.some(h => h && !sameRunner(h.command)) || (found.some(Boolean) && !found.every(Boolean)),
    };
  }
  return out;
}
// A THROWAWAY server must never touch the machine's GLOBAL CLI hook
// registration (real incident 2026-07-21: a rail-smoke WORKTREE server under
// /tmp booted with the real HOME and rewrote ~/.claude/settings.json's hook
// command to its /tmp path; after worktree cleanup every Stop/UserPromptSubmit
// hook errored MODULE_NOT_FOUND for two days — and the CLI snapshots hook
// config per session, so healing the file doesn't reach already-running
// sessions). The /tmp-only rule missed the SECOND strike (2026-10-01, lane
// hook-root-guard / B-c77a): a verify round's worktree under /var/tmp
// registered into the owner's ~/.claude/settings.json and ~/.codex/hooks.json.
// THE ROOT VERDICT (src/server-root.js, PURE) now decides for every writer of
// the owner's CLI config — hooks (register AND strip), the cli-config sync, the
// remote helper runs: a git WORKTREE, a TMP root, VIBESPACE_SKIP_AGENT_HOOKS=1
// are refused; VIBESPACE_FORCE_AGENT_HOOKS=1 lifts a refusal ONLY under a
// scratch HOME. The facts are read here with fs (the `.git` file's gitdir:
// line + that dir's `commondir`), never a git child at boot — ONCE when the read
// succeeds; a read ERROR (never ENOENT — the docker image has no git) is the
// `error` fact, the verdict `unknown` (refused), and the facts are read AGAIN
// at the next writer (verify r1 F1: an unreadable .git and a worktree whose
// checkout was removed both shipped as `checkout` — every writer wrote).
const serverRoot = require('../server-root');
// B-1425 (主开发 r640 / r647): THE ROOT FACTS ARE READ OFF THE HUB'S LOOP. On production the checkout sits on a network mount, and
// the release read it with statSync / readFileSync / realpathSync on the loop — once a minute at most, but at EVERY call while the
// last read erred, and the realpaths at every call — from every remote conversation start, the hooks routes and the timers: a
// stat there that did not answer held every conversation of the hub. Now:
//  · LAW 1 — ONE READ IN FLIGHT AT MOST, EVER: a file call that hangs holds one of the runtime's few file threads for as long as it
//    hangs; a second read beside it would take another, and then every file call of the hub waits. The next read starts only after
//    the last one CAME BACK (an answer or an error) — never on a timer, never beside it.
//  · ITS DEADLINE (ROOT_READ_MS) only decides what a WAITING caller is told; the read itself is never abandoned or started again.
//  · LAW 2 — A CALLER THAT CAN WAIT, WAITS: rootFactsNow() awaits the facts, bounded by the deadline counted from the read's own
//    start. Past it, the caller gets the last read's facts when one exists (its verdict stands), else a NAMED fact (`late`: the
//    verdict `unknown`, «… did not answer in 2 s»), which the callers' refusal road already handles.
//  · rootVerdict() (the callers that cannot wait) reads the CACHE only, and starts a refresh when it is stale: never a file call.
const ROOT_READ_MS_DEFAULT = 2000;
let ROOT_READ_MS = ROOT_READ_MS_DEFAULT;
let _rootFsp = fs.promises;   // the reader's file calls (a suite's stand-in through _setRootFs)
const _rootReads = { started: 0, ended: 0 };   // how many reads were started / came back (the single-flight leg reads them)
let _rootRead = null, _rootReadAt = 0;
// r993: who hears a read LAND (the person's CLI index re-places itself when the owner verdict changed — src/server/local-index.js)
const _landedListeners = new Set();
const onRootLanded = (fn) => { if (typeof fn === 'function') _landedListeners.add(fn); return () => _landedListeners.delete(fn); };
// r872 (the gate's box zone): the read in flight was told LATE to a waiting caller — the cache then answers late too. A flag, never the
// clock again: the deadline timer and Date.now() can differ by a millisecond, and «not judged yet» must never follow a late answer
let _rootReadLate = false;
const tmpSpellings = () => require('./throwaway-root.js').tmpRootsOf({ home: os.homedir(), realpath: (p) => p });   // THE one list of temp roots (B-ba47 shape H r1278: absolute, never the disk's root, never the variable's folder that holds the home), as spelled — their real paths are read with the facts, off the loop (B-1425)
const realOr = async (p) => { try { return await _rootFsp.realpath(p); } catch { return p; } };
async function readRootFacts(root) {
  if (DOOR.blocked(path.resolve(root))) return { root: path.resolve(root), gitDir: null, gitCommonDir: null, error: DOOR.sentenceFor(path.resolve(root)) };   // B-afc4
  const facts = { root: await realOr(path.resolve(root)), gitDir: null, gitCommonDir: null };
  const dotGit = path.join(facts.root, '.git');
  const errOf = (e) => (e && e.code) || (e && e.message) || String(e);
  let st = null;
  try { st = await _rootFsp.stat(dotGit); } catch (e) { if (e && e.code === 'ENOENT') return facts; facts.error = `${dotGit} cannot be read (${errOf(e)})`; return facts; }
  if (st.isDirectory()) { facts.gitDir = facts.gitCommonDir = await realOr(dotGit); return facts; }
  let gd = null;
  try { gd = serverRoot.parseGitFile(await _rootFsp.readFile(dotGit, 'utf-8')); } catch (e) { facts.error = `${dotGit} cannot be read (${errOf(e)})`; return facts; }
  if (!gd) { facts.error = `${dotGit} is a file without a gitdir: line`; return facts; }
  facts.gitDir = await realOr(path.resolve(facts.root, gd));
  // the gitdir itself: GONE ⇒ a worktree whose checkout was removed — git's own layout (<common>/worktrees/<name>) still
  // names the checkout, so it stays a worktree (never "no git"); any other failure is the error fact
  try { await _rootFsp.stat(facts.gitDir); } catch (e) {
    const m = /^(.+)\/worktrees\/[^/]+$/.exec(facts.gitDir);
    if (e && e.code === 'ENOENT' && m) { facts.gitCommonDir = m[1]; facts.dangling = true; return facts; }
    facts.error = `the gitdir ${facts.gitDir} named by ${dotGit} cannot be read (${errOf(e)})`; return facts;
  }
  let common = facts.gitDir;
  try { common = await realOr(path.resolve(facts.gitDir, (await _rootFsp.readFile(path.join(facts.gitDir, 'commondir'), 'utf-8')).trim())); }
  catch (e) { if (!(e && e.code === 'ENOENT')) { facts.error = `${path.join(facts.gitDir, 'commondir')} cannot be read (${errOf(e)})`; return facts; } } // no commondir = a submodule / --separate-git-dir: the gitdir IS the common dir
  facts.gitCommonDir = common;
  return facts;
}
// the judgment's own real paths (the temp roots, the home), read in the same flight, one call at a time
async function readRootFactsAll(root) {
  const facts = await readRootFacts(root);
  const tmp = []; for (const t of tmpSpellings()) tmp.push(await realOr(t));
  facts.tmpRoots = tmp; facts.home = await realOr(os.homedir());
  return facts;
}
let _rootFacts = null, _rootFactsAt = 0;
let _lastRootError = null;          // verify r2 ①: the last `unknown` {at, error} — what a later registration happened AFTER
let _registeredAfterError = null;   // verify r2 ①: {at, error, since} once the hooks registered after an earlier unknown (said once; the chip says it)
/** LAW 1: the ONE read — started only when none is out; it stays out until it comes back, whatever any deadline said. */
function startRootRead() {
  if (_rootRead) return _rootRead;
  _rootReads.started++; _rootReadAt = Date.now(); _rootReadLate = false;
  _rootRead = readRootFactsAll(rootDir)
    .catch((e) => ({ root: path.resolve(rootDir), gitDir: null, gitCommonDir: null, error: `the server root could not be read (${(e && e.code) || (e && e.message) || e})` }))
    .then((f) => { _rootFacts = f; _rootFactsAt = Date.now(); _rootReads.ended++; _rootRead = null; _rootReadLate = false; for (const fn of [..._landedListeners]) { try { fn(f); } catch (e) { console.warn('[root] a landed-read listener failed:', e && e.message); } } return f; });
  return _rootRead;
}
const rootStale = (t = Date.now()) => !_rootFacts || !!_rootFacts.error || t - _rootFactsAt > serverRoot.ROOT_FACTS_TTL_MS;   // an erroring read is never kept (verify r1 F1)
// a read still out past its deadline with nothing read before it: the NAMED fact (never a hold)
const lateFacts = () => ({ root: path.resolve(rootDir), gitDir: null, gitCommonDir: null, late: true, error: `the checkout's .git did not answer in ${ROOT_READ_MS / 1000} s (a slow or hung mount) — read again once that read comes back` });
// what is known NOW, with no file call: the last read; else the read out past its deadline (late); else not read yet (pending)
const knownFacts = () => _rootFacts || (_rootRead && (_rootReadLate || Date.now() - _rootReadAt >= ROOT_READ_MS) ? lateFacts()
  : { root: path.resolve(rootDir), gitDir: null, gitCommonDir: null, pending: true, error: 'the server root is being read (off the loop) — not judged yet' });
/** LAW 2: the facts for a caller that CAN wait — fresh ones, or what is known once the read is out past its deadline. */
async function rootFactsNow() {
  if (!rootStale()) return _rootFacts;
  const p = startRootRead();
  const left = _rootReadAt + ROOT_READ_MS - Date.now();
  if (left > 0) {
    let timer = null;
    const f = await Promise.race([p, new Promise((r) => { timer = setTimeout(() => r(null), left); if (timer.unref) timer.unref(); })]);
    clearTimeout(timer);
    if (f) return f;
  }
  if (_rootRead) _rootReadLate = true;   // told late: the cache says late from now on (never «not judged yet» after a late answer)
  return _rootFacts || lateFacts();
}
function rootVerdict() {
  const t = Date.now();
  // an erroring read is never cached (verify r1 F1); a good one is kept ROOT_FACTS_TTL_MS (verify r2 ③: a `.git` converted in
  // place — a checkout turned into a worktree while the server runs — is seen within a minute, not at the next restart).
  // B-1425: the refresh runs OFF the loop (law 1: never beside one still out); this call answers what is known — no file call
  if (rootStale(t)) startRootRead();
  const f = knownFacts();
  const v = serverRoot.rootVerdict({
    ...f,
    tmpRoots: f.tmpRoots || tmpSpellings(),
    envOverride: process.env[serverRoot.OVERRIDE_ENV] === '1',
    force: process.env[serverRoot.FORCE_ENV] === '1',
    home: f.home || os.homedir(),
  });
  if (!v.ok && v.kind === 'unknown' && !f.pending) _lastRootError = { at: t, error: f.error || v.why };   // «not read yet» is no read error
  if (f.pending) v.pending = true;   // r827: the refusal says it is «not judged yet» (the journal's once-a-boot line is never spent on it)
  return v;
}
/** B-1425 suite seams: the reader's file calls, its deadline, and what it started / finished. */
const _setRootFs = (fsp) => { _rootFsp = fsp || fs.promises; };
const _setRootReadMs = (ms) => { ROOT_READ_MS = Number(ms) > 0 ? Number(ms) : ROOT_READ_MS_DEFAULT; };
const rootReadStats = () => ({ started: _rootReads.started, ended: _rootReads.ended, inFlight: !!_rootRead, cached: !!_rootFacts });
/** verify r2 ①: what happened around an unjudgeable root — the last `unknown` and the registration that followed it. */
function rootRecovery() { return { lastError: _lastRootError, registeredAfterError: _registeredAfterError }; }
/** null = this server may write the owner's CLI config; else the refusal the
 *  status surfaces carry ({kind, why, checkout?, line}). */
function ownerWriteRefusal() {
  const v = rootVerdict();
  if (v.ok) return null;
  return { kind: v.kind, why: v.why, ...(v.checkout ? { checkout: v.checkout } : {}), ...(v.pending ? { pending: true } : {}), line: serverRoot.refusalLine(v) };
}
// EVERY owner-config writer asks this first. ONE journal line per boot (the
// first refused writer says it; the status surfaces carry it after that).
let _refusalSaid = null;   // r827: the refusal last said (kind + why) — a pending one never; a NEW refusal (the read landed: a worktree) is said once
function refuseOwnerWrite() {
  const r = ownerWriteRefusal();
  const k = r && !r.pending ? `${r.kind}|${r.why}` : null;
  if (k && _refusalSaid !== k) { _refusalSaid = k; console.log(r.line); }
  return r;
}
function hookRegistrationSafe() { return rootVerdict().ok; }
// auto=true (startup): respect the opt-out marker. auto=false (explicit Install
// from the UI): always register + clear the marker.
// B-225b (round wyzvr7567's MUST 2 — the strict side of a WRITE TO A PERSON'S OWN FILE): while the SETTINGS are held the
// integration switch reads no value of the person's, so neither registering nor stripping the hooks writes the person's CLI
// configs; at the lift the registration is replayed by the person's own switch (the switch's own change strips, as before)
function settingsHeldNow() { try { const R = require('../routes/persistence.js').router; return R && typeof R.settingsHeld === 'function' ? R.settingsHeld() : null; } catch { return null; } }
let _replayAtLift = false;
function replayAtLift() {
  if (_replayAtLift) return;
  try {
    const R = require('../routes/persistence.js').router;
    if (!R || typeof R.onSettingsLift !== 'function') return;
    _replayAtLift = true;
    R.onSettingsLift(() => { if (!_replayAtLift) return; _replayAtLift = false; try { if ((R.readSettings() || {})['agents.vibespaceIntegration'] !== false) ensureAgentHooks({ auto: true }); } catch (e) { console.log('Hook registration after the settings lift skipped:', e.message); } });
  } catch { _replayAtLift = false; }
}
function ensureAgentHooks({ auto = false } = {}) {
  // B-ddf3 unit 2 line 1 (the coordinator's r1407): THIS MACHINE'S hook entries are written by the SHIPPED HELPER through the
  // starter (harness-config-sync applyThisMachine — ONE run writes our hooks AND the managed keys), never by this process.
  // The refusals stand BEFORE any run; the answer is a PROMISE of { <harness>: { ok, created?, error? } } at the landing.
  const refused = refuseOwnerWrite();
  if (refused) return Promise.resolve({ skipped: true, refused });
  const held = settingsHeldNow();
  if (held) { replayAtLift(); return Promise.resolve({ skipped: true, settingsHeld: { kind: held.kind, code: held.code || null } }); }   // B-225b: no write while the settings are held
  // B-f276 (s1126): THE START DECIDES AT ITS CALL (r1518: its registration is queued at the call, so a removal asked after it runs after
  // it) — by optOutMarkNow, the stat in place of the release's existsSync; an UNREAD mark registers and removes NOTHING, by name
  if (auto) { const mark = optOutMarkNow(); return mark === 'not' ? registerHooks() : mark === 'opted-out' ? optedOutLook() : Promise.resolve(optOutMarkUnread(mark.unread)); }
  // B-f276 (s1126): the Install press removes the mark FIRST — a removal that FAILED (not «there was none») installs nothing, by name:
  // the mark left behind would have the next start strip what the person just asked for
  if (!auto) { try { fs.rmSync(HOOK_OPTOUT_FILE, { force: true }); } catch (e) { return Promise.resolve(optOutMarkStuck(e)); } }
  return registerHooks();
  function optedOutLook() { return (typeof homeRead === 'function' ? homeRead(ourRowsOnDisk, undefined, { cls: 'opted-out-look' }) : ourRowsOnDisk().then((value) => ({ value }))).then((r) => (r.value ? (r.value.some((x) => x.ours) ? stripAgentHookEntries({ ifOptedOut: true }).then((removed) => ({ optedOut: true, removed })) : { optedOut: true }) : optedOutUnread(r))); }   // r1675: opted out AND our rows still there (a removal the hub's stop lost) ⇒ ONE removal queued; r2224 (1): that look is a read under the home OUTSIDE a job — through the runner's guard (bounded, counted, refused while an earlier read is out), an unanswered look queues no removal and says why
  function registerHooks() {
  { const r = refuseOwnerWrite(); if (r) return Promise.resolve({ skipped: true, refused: r }); }   // B-f276 (s1126): the root verdict asked at the write itself (test-server-root ④: a writer's guard sits within 12 lines above it)
  if (typeof applyThisMachine !== 'function') return Promise.resolve(Object.fromEntries(Object.keys(HOOK_FILES).map((k) => [k, { ok: false, error: 'no helper road on this server: nothing written' }])));
  const fsp = fs.promises, hookCmd = `${JSON.stringify(stableNodePath(process.execPath))} ${HOOK_CMD}`;
  // our entries' commands BEFORE the run, read at its own start (r1407 (e): a rewrite journalled by name); r1518: QUEUED AT THE CALL
  const ourCmds = async (key, file) => { try { const root = JSON.parse(await fsp.readFile(file, 'utf8')); return Object.fromEntries(HOOK_EVENTS_FOR(key).map((ev) => { const h = _findOurHookIn(root && root.hooks && root.hooks[ev]); return [ev, h ? h.command : null]; })); } catch { return null; } };
  const readBefore = () => Promise.all(Object.entries(HOOK_FILES).map(([key, def]) => ourCmds(key, def.file()).then((c) => [key, c]))).then(Object.fromEntries);
  return applyThisMachine({ reason: auto ? 'hooks' : 'hooks (asked)', hooks: true, before: readBefore, after: verifyFiles }).then((landing) => {
    // r1813 (the true words): the check's own failure when it ran; else the RUN's own reason (it broke before the check)
    const a = landing && landing.after;
    return a && !a.error ? a : Object.fromEntries(Object.keys(HOOK_FILES).map((k) => [k, { ok: false, error: (a && a.error) || (landing && landing.why) || 'no landing' }]));
  });
  // each CLI's hooks part is judged by its receipt (r2844), and each hook file is still VERIFIED off the loop (fs.promises) by the
  // run's own `after` — INSIDE its job, before the next queued request starts (r1675: a check after the queue moved on read the NEXT
  // run's files)
  async function verifyFiles(landing) {
    const before = (landing && landing.before) || {};
    const results = {};
    for (const [key, def] of Object.entries(HOOK_FILES)) {
      const rel = def.rel.join('/'), file = def.file(), dir = path.dirname(file);
      if (!landing || !landing.ok) {
        // r2844: each CLI is told ITS OWN part — a CLI whose hooks receipt landed (or found no folder) is checked on its file below; one whose part was
        // refused hears its own reason (said once); a run that broke before any receipt tells every CLI the run's reason (r1813)
        const rs = (landing && landing.receipts) || [], mine = ((landing && landing.parts) || []).filter((p) => p.harness === key && p.key === 'hooks');   // the hooks part's own: refused / failed / not known (a row's refusal is the settings answer's)
        const mineAnswered = !mine.length && rs.some((x) => x.harness === key && x.key === 'hooks' && (x.state === 'applied' || x.state === 'unchanged' || x.state === 'missing'));   // missing = no folder here: no failure (r1518), checked below
        if (!mineAnswered) { results[key] = { ok: false, error: mine.length ? mine.map((p) => p.why).join('; ') : ((landing && landing.why) || 'no landing') }; continue; }   // the runner journalled this landing once («not applied on this machine»)
      }
      let dirThere = true; try { await fsp.stat(dir); } catch { dirThere = false; }
      if (!dirThere) { const why = `~/${path.dirname(rel)} not found — the CLI has not run on this machine; nothing is created`; console.log(`Hook registration (${key}) skipped:`, why); results[key] = { ok: false, error: why, missing: 'no-dir' }; continue; }
      let root = null; try { root = JSON.parse(await fsp.readFile(file, 'utf8')); } catch (e) { const why = e && e.code === 'ENOENT' ? `~/${rel} does not exist and was not created` : `~/${rel} cannot be read as JSON`; console.log(`Hook registration (${key}) skipped:`, why); results[key] = { ok: false, error: why }; continue; }
      const now = Object.fromEntries(HOOK_EVENTS_FOR(key).map((ev) => { const h = _findOurHookIn(root && root.hooks && root.hooks[ev]); return [ev, h ? h.command : null]; }));
      // ours = the stable command, or a stored spelling the run left as it was (the same applier KEPT it: keepsHookCommand — the same node)
      const was = before[key], ours = Object.keys(now).every((ev) => now[ev] === hookCmd || (!!now[ev] && !!was && was[ev] === now[ev]));
      if (!ours) { const why = `our hook entries are not in ~/${rel} after the helper ran`; console.log(`Hook registration (${key}) skipped:`, why); results[key] = { ok: false, error: why }; continue; }
      const moved = was ? Object.keys(now).filter((ev) => was[ev] && was[ev] !== now[ev]) : [];
      if (moved.length) console.log(`Hook command rewritten in ~/${rel} (${moved.join(', ')}): ${was[moved[0]]} → ${now[moved[0]]} — the stable spelling, once; only those entries' "command" changed, nothing else in the file`);
      if ((landing.created || []).some((c) => c.rel === rel)) {
        // THE FILE THE CLI NEVER WROTE (lane hooks-create): created because its directory proves the CLI has run ('dir-exists');
        // a session already running snapshotted its hooks without ours — the caller tells them
        console.log(`created ~/${rel} (the CLI had never written one) and registered VibeSpace hooks`);
        results[key] = { ok: true, created: true };
        if (typeof onHookFileCreated === 'function') {
          try { onHookFileCreated({ harness: key, file, rel, at: Date.now() }); } catch (e) { console.warn(`[hooks] ${key}: the sessions that predate ~/${rel} were not told — ${e && e.message}`); }
        }
      } else results[key] = { ok: true };
    }
    // r3064 (7): a managed ROW of the same run that did not land rides its CLI's answer (`rows`): the Install press says it by name
    for (const key of Object.keys(results)) { const rows = ((landing && landing.parts) || []).filter((p) => p.harness === key && p.key !== 'hooks').map((p) => p.why); if (rows.length && results[key]) results[key].rows = rows; }
    // verify r2 ①: registered AFTER an earlier unknown verdict (a read error at boot) — remembered once, said once by server.js
    if (_lastRootError && !_registeredAfterError && Object.values(results).some((x) => x && x.ok)) _registeredAfterError = { at: Date.now(), error: _lastRootError.error, since: _lastRootError.at };
    return results;
  }
  }   // registerHooks (B-f276 s1126: the release's body, unchanged, under one name the two roads call)
}
// B-f276 (s1126): the mark UNREAD at a start — registered NOTHING and removed nothing (either could undo the person's own choice). Its
// shape is the one its readers already say by name: `optedOut` + `error` (the Apply press, hooks-late — never «applied» over it),
// `error` beside `skipped` (the switch's answer, landing-answer notLanded), `optOutUnread` (the hook-root watch reads again, its backoff)
function optOutMarkUnread(code) {
  const why = `the opt-out mark could not be read (${code}) — the hooks were neither registered nor removed; VibeSpace reads it again`;
  return { skipped: true, optedOut: true, optOutUnread: code, error: why };
}
// B-f276 (s1126): the Install press could not remove the mark — nothing installed, each CLI's answer says why
function optOutMarkStuck(e) {
  const why = `the opt-out mark could not be removed (${(e && e.code) || (e && e.message) || e}) — nothing was installed: the next start would have removed it again. Try again`;
  console.warn(`[hooks] ${why}`);
  return Object.fromEntries(Object.keys(HOOK_FILES).map((k) => [k, { ok: false, error: why }]));
}
// r2224 (1): the opted-out start's look at our rows did not answer (or was refused by the guard): no removal is queued, said by name
function optedOutUnread(r) {
  const why = `our hook entries on disk were not read (${r.why || (r.error && r.error.message) || r.error || 'no answer'}) — no removal asked; asked again at the next start`;
  console.warn(`[hooks] opted out: ${why}`);
  return { optedOut: true, error: why };
}
// which hook files still hold one of OUR entries, read off the loop; a file that cannot be read or parsed is said by name
async function ourRowsOnDisk() {
  const out = [];
  for (const [, def] of Object.entries(HOOK_FILES)) {
    const rel = def.rel.join('/');
    let text = null;
    try { text = await fs.promises.readFile(def.file(), 'utf8'); } catch (e) { if (!e || e.code !== 'ENOENT') out.push({ rel, why: `~/${rel} could not be read (${(e && e.code) || e})` }); continue; }
    let root = null; try { root = JSON.parse(text); } catch { out.push({ rel, why: `~/${rel} is not valid JSON — not touched` }); continue; }
    const ours = Object.values((root && root.hooks) || {}).some((gs) => Array.isArray(gs) && gs.some((g) => g && Array.isArray(g.hooks) && g.hooks.some((h) => h && typeof h.command === 'string' && h.command.includes(HOOK_MARKER))));
    if (ours) out.push({ rel, why: `our hook entries are still in ~/${rel}`, ours: true });
  }
  return out;
}
// Strip ONLY our entries from both CLI configs — no opt-out marker. Used by
// the Integration master switch (agents.vibespaceIntegration OFF), which is a
// SETTING-driven state: boot re-checks the setting, so no marker is needed
// (and writing one would make a later re-enable silently not re-register).
// `ifOptedOut` (r1813): a START's removal of rows the opt-out mark disowns — the mark is read again INSIDE its job (`when`), so an
// Install pressed meanwhile (it removes the mark) is never stripped after its «ok»
function stripAgentHookEntries({ ifOptedOut = false } = {}) {
  // r1813 (the true words): a refusal is ANSWERED as one (by name), never as a removal that happened
  { const r = refuseOwnerWrite(); if (r) return Promise.resolve({ ok: false, skipped: true, refused: r, receipts: [], created: [], why: r.line || r.why || 'refused on this server — nothing removed' }); } // a worktree / temp server: never edit the owner's CLI configs
  { const held = settingsHeldNow(); if (held) return Promise.resolve({ ok: false, skipped: true, settingsHeld: { kind: held.kind, code: held.code || null }, receipts: [], created: [], why: 'the settings could not be read — the hooks were not removed; nothing was written' }); }   // r2109: ONE shape for a held refusal on both roads (the registration's: skipped + settingsHeld {kind, code})   // B-225b: the settings HELD — the switch's value is unknown, the person's CLI configs are not written
  if (typeof applyThisMachine !== 'function') return Promise.resolve({ ok: false, receipts: [], created: [], why: 'no helper road on this server — nothing removed' });
  // the helper's --uninstall run strips ONLY our entries (never a managed key) — through the starter, like every write here. Its
  // hooks receipt is judged by the runner (r2844: a refused one is not landed, by name; none at all reads «not known»), and the
  // OUTCOME of a landed run is still read on the files, off the loop, before «removed» is said (r1518): a file that cannot be read
  // or parsed, or that still holds one of our entries, is a removal that did not land
  const stillOptedOut = async () => { try { await fs.promises.access(HOOK_OPTOUT_FILE); return true; } catch (e) { if (e && e.code === 'ENOENT') return false; throw e; } };   // r1876: an UNREADABLE mark is a failed read (its reason said), never «no longer asked»
  return applyThisMachine({ reason: ifOptedOut ? 'hooks removed (a start: still opted out)' : 'hooks removed', strip: true, when: ifOptedOut ? stillOptedOut : null, after: (landing) => (landing && landing.ok && !landing.skipped ? ourRowsOnDisk() : []) }).then((landing) => {
    // r1675: the check ran INSIDE the removal's job (before the next queued request could put rows back)
    const a = landing && landing.after, left = Array.isArray(a) ? a.map((x) => x.why) : a && a.error ? [a.error] : [];
    if (landing && landing.ok && left.length) landing = { ...landing, ok: false, why: left.join('; ') };
    if (landing && landing.skipped) console.log(`Hook removal at the start ${landing.skipped}`);
    else if (landing && landing.ok) console.log('Removed VibeSpace hooks from this machine\'s CLI configs'); else console.warn(`[hooks] the removal did not land: ${landing && landing.why}`);
    return landing;
  });
}
function removeAgentHooks() {
  // Durable: record the opt-out so startup won't re-register (finding #3). B-f276 (s1126): a mark that could not be WRITTEN removes
  // nothing, by name (the Remove route says it) — the next start, finding no mark, would put the hooks back
  try { fs.writeFileSync(HOOK_OPTOUT_FILE, new Date().toISOString() + '\n'); } catch (e) { const why = `the opt-out mark could not be written (${(e && e.code) || (e && e.message) || e}) — the hooks were not removed: the next start would have put them back. Try again`; console.warn(`[hooks] ${why}`); return Promise.resolve({ ok: false, receipts: [], created: [], why }); }
  return stripAgentHookEntries();
}
  return {
    AGENT_BIN_DIR, EDITOR_DIR, EDITOR_CMD, STATUS_CMD, USAGE_STATUSLINE_CMD, HOOK_CMD,
    createEditorHelper, createStatusHelper, createHookHelper, userStatuslineCmd,
    ensureAgentHooks, stripAgentHookEntries, removeAgentHooks, hookRegistrationSafe,
    rootVerdict, ownerWriteRefusal, refuseOwnerWrite, readRootFacts, rootRecovery, rootFactsNow, onRootLanded, rootReadStats, _setRootFs, _setRootReadMs, // B-1425: the facts a caller awaits; the single-flight's counts and the suite seams // verify r1: the facts reader, for the gate's real-filesystem shapes; r2: the recovery fact
    agentHooksStatus,
    HOOK_OPTOUT_FILE: typeof HOOK_OPTOUT_FILE !== 'undefined' ? HOOK_OPTOUT_FILE : undefined, optOutMark, optOutMarkNow,   // B-f276 (s1126)
  };
}
// Known CLI death signatures → { reason, detail } (2.226.0, probe batch).
// Patterns are the CLIs' OWN canned strings; keep them TIGHT — the buffer
// tail can contain tool output, and a loose pattern would mislabel normal
// exits. cli_missing additionally requires the shell's 126/127 exit code
// (a bare "No such file or directory" also appears in ordinary tool output).
function classifyCliDeath(tail, code) {
  if (!tail) return null;
  const line = (re) => { const m = tail.match(re); return m ? String(m[0]).replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 200) : null; };
  let d;
  if ((d = line(/(?:Not logged in|Please run \/login|OAuth token revoked)[^\n]*/))) return { reason: 'not_logged_in', detail: d };
  if ((d = line(/No conversation found with session ID[^\n]*/))) return { reason: 'no_conversation', detail: d };
  if ((d = line(/error: unknown (?:option|command)[^\n]*/))) return { reason: 'cli_arg_error', detail: d };
  if ((d = line(/(?:Invalid API key|invalid x-api-key|authentication_error)[^\n]*/i))) return { reason: 'auth_error', detail: d };
  if ((d = line(/Credit balance is too low[^\n]*/i))) return { reason: 'billing_error', detail: d };
  if ((code === 127 || code === 126) && (d = line(/[^\n]*(?:command not found|No such file or directory)[^\n]*/))) return { reason: 'cli_missing', detail: d };
  return null;
}

module.exports = { create, classifyCliDeath }; // classifyCliDeath also consumed by session-stdout (was a free identifier there — 2.343.2 audit)

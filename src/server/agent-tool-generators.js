'use strict';
// AGENT-TOOL GENERATORS + hook registration (extracted VERBATIM from
// server.js in the physical-decomposition campaign, 2.324.0 — same code, a
// file boundary instead of a closure). Every behavioral comment travels with
// its code; see CLAUDE.md data/bin entries for the incident history (the
// generator-template backslash P0, the EDITOR_DIR anchor rule, the temp-server
// hook guard). ORCH tier.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function create({ rootDir, port }) {
  const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
  const USAGE_CACHE_DIR = path.join(rootDir, 'data', 'usage-cache');
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
SIGNAL="/tmp/claude-webui-edit-signal-\$\$"
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
  const res = await fetch(api + '/api/agent/session-status', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
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
function userStatuslineCmd() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf-8'));
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
    const res = await fetch(api + path, { headers: { Authorization: 'Bearer ' + token }, signal: ctl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && data.context) {
        // BOTH harnesses read the NESTED hookSpecificOutput.additionalContext
        // (verified against the Claude 2.1.201 binary — it suggests "Did you
        // mean hookSpecificOutput" — and the Codex *HookSpecificOutputWire
        // JSON schema). Emit ONLY that: Codex's output schema is strict
        // (additionalProperties:false), so an extra top-level additionalContext
        // key makes Codex reject the whole object and inject nothing.
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: event, additionalContext: data.context },
        }));
      }
    }
  } catch { }
  process.exit(0);
}
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (c) => { buf += c; try { run(JSON.parse(buf)); } catch { } });
process.stdin.on('end', () => { try { run(JSON.parse(buf)); } catch { } if (!ran) process.exit(0); });
setTimeout(() => process.exit(0), 8000); // never hang a session start
`;
  fs.writeFileSync(HOOK_CMD, script, { mode: 0o755 });

  // Remote-side registration script (P3): distributed to remote hosts alongside
  // the hook so a REMOTE session's own Claude/Codex fires the hook natively
  // (our LOCAL registration can't reach the remote box). Self-locating: it
  // registers `node <its own dir>/vibespace-hook.mjs`. Same non-destructive
  // logic as ensureAgentHooks; best-effort (a failure just means no injection).
  // `--uninstall` (2.129.0, Manage Agents remote Remove) strips ONLY our entry
  // from the remote configs — mirror of the local removeAgentHooks.
  const reg = `#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
const UNINSTALL = process.argv.includes('--uninstall');
// ABSOLUTE interpreter (2.244.2, userN's Novita: hook error '/bin/sh: 1:
// node: not found'): hooks run as claude children via /bin/sh with claude's
// PATH — hosts with nvm-style node installs (and claude as a native binary)
// have NO node on that PATH. The register itself runs under node, so its own
// process.execPath is an interpreter that provably exists on this machine.
const hookCmd = JSON.stringify(process.execPath) + ' ' + join(dirname(fileURLToPath(import.meta.url)), 'vibespace-hook.mjs');
const files = [
  { f: join(homedir(), '.claude', 'settings.json'), create: false, EVENTS: ['SessionStart', 'UserPromptSubmit', 'Stop'] },
  { f: join(homedir(), '.codex', 'hooks.json'), create: true, EVENTS: ['SessionStart', 'UserPromptSubmit'] },
];
const findOur = (list) => { for (const g of (Array.isArray(list) ? list : [])) { const h = (g.hooks || []).find(h => typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs')); if (h) return h; } return null; };
for (const { f, create, EVENTS } of files) {
  try {
    let root = null; try { root = JSON.parse(readFileSync(f, 'utf-8')); } catch { root = null; }
    if (!root) { if (existsSync(f)) continue; if (UNINSTALL || !create) continue; root = {}; }
    if (!root.hooks || typeof root.hooks !== 'object') { if (UNINSTALL) continue; root.hooks = {}; }
    let changed = false;
    if (UNINSTALL) {
      for (const ev of Object.keys(root.hooks)) {
        if (!Array.isArray(root.hooks[ev])) continue;
        for (const g of root.hooks[ev]) {
          if (!g || !Array.isArray(g.hooks)) continue;
          const before = g.hooks.length;
          g.hooks = g.hooks.filter(h => !(h && typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs')));
          if (g.hooks.length !== before) changed = true;
        }
        root.hooks[ev] = root.hooks[ev].filter(g => g && Array.isArray(g.hooks) && g.hooks.length);
      }
    } else {
      for (const ev of EVENTS) {
        if (!Array.isArray(root.hooks[ev])) root.hooks[ev] = [];
        const ours = findOur(root.hooks[ev]);
        if (ours) { if (ours.command !== hookCmd) { ours.command = hookCmd; changed = true; } }
        else { root.hooks[ev].push({ hooks: [{ type: 'command', command: hookCmd, timeout: 10 }] }); changed = true; }
      }
    }
    if (changed) { const tmp = f + '.tmp'; writeFileSync(tmp, JSON.stringify(root, null, 2) + '\\n'); renameSync(tmp, f); }
  } catch { }
}
`;
  fs.writeFileSync(path.join(AGENT_BIN_DIR, 'vibespace-hook-register.mjs'), reg, { mode: 0o755 });
}
createHookHelper();

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
const { list: listHarnesses } = require('../harnesses');
const HOOK_FILES = Object.fromEntries(listHarnesses().filter((h) => h.inject && h.inject.hookFile).map((h) => [h.id, h.inject.hookFile]));
const HOOK_EVENTS_FOR = (harness) => { const h = listHarnesses().find((x) => x.id === harness); return h?.inject?.hookEvents ? [...h.inject.hookEvents] : []; };
// Every event any harness registers — the removal path strips our entry from all of them.
const ALL_HOOK_EVENTS = [...new Set(listHarnesses().flatMap((h) => h.inject?.hookEvents || []))];
// Persisted opt-out: when the user clicks Remove in Manage Agents, we drop this
// marker so startup does NOT silently re-register the hooks they removed.
const HOOK_OPTOUT_FILE = path.join(rootDir, 'data', '.agent-hooks-optout');
// DEFENSIVE: a user can hand-edit settings.json into any shape (a null group, a
// string `hooks`, …). Never throw walking it — skip non-conforming entries so
// agentHooksStatus/ensure/remove degrade gracefully instead of 500ing the UI.
function _findOurHookIn(list) {
  for (const group of Array.isArray(list) ? list : []) {
    if (!group || !Array.isArray(group.hooks)) continue;
    const h = group.hooks.find(h => h && typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs'));
    if (h) return h;
  }
  return null;
}
// Read → mutate → write with a compare-and-swap re-read right before the atomic
// rename: shrinks the lost-update window (a concurrent CLI write to the same
// settings file between our read and write) to the two-syscall rename gap. The
// mutate is idempotent, so re-applying it to fresher on-disk content is safe.
function _patchHookFile(file, createIfMissing, mutate) {
  const parse = () => { try { return { text: fs.readFileSync(file, 'utf-8') }; } catch { return { text: null }; } };
  for (let attempt = 0; attempt < 4; attempt++) {
    const { text } = parse();
    let root = null;
    if (text != null) { try { root = JSON.parse(text); } catch { throw new Error(`${file} exists but is not valid JSON — not touching it`); } }
    if (!root) {
      if (text != null) throw new Error(`${file} exists but is not valid JSON — not touching it`);
      if (!createIfMissing) throw new Error(`${file} not found (start the CLI once to create it)`);
      // createIfMissing only creates the FILE — never the CLI's config DIR.
      // A missing ~/.codex means codex isn't installed; manufacturing the dir
      // (with our umask, holding only our hook) would be VibeSpace writing
      // config for a CLI that was never present — the tmp-write below ENOENTs
      // and registration reports "skipped", which is the correct outcome.
      if (!fs.existsSync(path.dirname(file))) throw new Error(`${path.dirname(file)} not found (install the CLI first)`);
      root = {};
    }
    if (!root.hooks || typeof root.hooks !== 'object') root.hooks = {};
    const changed = mutate(root);
    if (!changed) return false;
    const out = JSON.stringify(root, null, 2) + '\n';
    // CAS: only commit if the file hasn't changed under us since we read it.
    const cur = parse();
    if (cur.text !== text) continue; // someone wrote it — re-read + re-apply
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, out);
    fs.renameSync(tmp, file);
    return true;
  }
  throw new Error(`${file} kept changing under concurrent writes — gave up`);
}
function agentHooksStatus() {
  const hookCmd = `${JSON.stringify(process.execPath)} ${HOOK_CMD}`; // absolute interpreter (2.244.2 — see the register template note)
  const out = { hookPath: HOOK_CMD, optedOut: fs.existsSync(HOOK_OPTOUT_FILE) };
  for (const [key, def] of Object.entries(HOOK_FILES)) {
    const file = def.file();
    let root = null, parseError = false;
    try { root = JSON.parse(fs.readFileSync(file, 'utf-8')); }
    catch { parseError = fs.existsSync(file); }
    let found = [];
    const evs = HOOK_EVENTS_FOR(key);
    try { found = evs.map(ev => root ? _findOurHookIn(root.hooks?.[ev]) : null); } catch { found = evs.map(() => null); }
    out[key] = {
      file,
      fileExists: fs.existsSync(file),
      parseError,
      installed: found.every(h => h && h.command === hookCmd),
      stale: found.some(h => h && h.command !== hookCmd) || (found.some(Boolean) && !found.every(Boolean)),
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
// sessions). Rule: a server whose own code lives under the OS temp dir skips
// ALL global hook writes (register AND strip). Escape hatches:
// VIBESPACE_SKIP_AGENT_HOOKS=1 forces skip anywhere (test harness belt),
// VIBESPACE_FORCE_AGENT_HOOKS=1 overrides the tmp guard.
function hookRegistrationSafe() {
  if (process.env.VIBESPACE_FORCE_AGENT_HOOKS === '1') return true;
  if (process.env.VIBESPACE_SKIP_AGENT_HOOKS === '1') return false;
  const here = path.resolve(rootDir) + path.sep;
  const tmp = path.resolve(os.tmpdir()) + path.sep;
  return !here.startsWith(tmp) && !here.startsWith('/tmp/');
}
// auto=true (startup): respect the opt-out marker. auto=false (explicit Install
// from the UI): always register + clear the marker.
function ensureAgentHooks({ auto = false } = {}) {
  const hookCmd = `${JSON.stringify(process.execPath)} ${HOOK_CMD}`; // absolute interpreter (2.244.2 — see the register template note)
  if (!hookRegistrationSafe()) { console.log('Agent-hook registration skipped (throwaway/temp server root)'); return { skipped: true }; }
  if (auto && fs.existsSync(HOOK_OPTOUT_FILE)) return { optedOut: true };
  if (!auto) { try { fs.rmSync(HOOK_OPTOUT_FILE, { force: true }); } catch {} }
  const results = {};
  for (const [key, def] of Object.entries(HOOK_FILES)) {
    try {
      _patchHookFile(def.file(), def.createIfMissing, (root) => {
        let changed = false;
        for (const ev of HOOK_EVENTS_FOR(key)) {
          if (!Array.isArray(root.hooks[ev])) root.hooks[ev] = [];
          const ours = _findOurHookIn(root.hooks[ev]);
          if (ours) { if (ours.command !== hookCmd) { ours.command = hookCmd; changed = true; } }
          else { root.hooks[ev].push({ hooks: [{ type: 'command', command: hookCmd, timeout: 10 }] }); changed = true; }
        }
        return changed;
      }) && console.log(`Registered VibeSpace hooks in ${def.file()}`);
      results[key] = { ok: true };
    } catch (e) {
      console.log(`Hook registration (${key}) skipped:`, e.message);
      results[key] = { ok: false, error: e.message };
    }
  }
  return results;
}
// Strip ONLY our entries from both CLI configs — no opt-out marker. Used by
// the Integration master switch (agents.vibespaceIntegration OFF), which is a
// SETTING-driven state: boot re-checks the setting, so no marker is needed
// (and writing one would make a later re-enable silently not re-register).
function stripAgentHookEntries() {
  if (!hookRegistrationSafe()) return; // temp/worktree server: never edit global CLI configs
  for (const def of Object.values(HOOK_FILES)) {
    try {
      _patchHookFile(def.file(), false, (root) => {
        let changed = false;
        for (const ev of ALL_HOOK_EVENTS) {
          if (!Array.isArray(root.hooks[ev])) continue;
          for (const group of root.hooks[ev]) {
            if (!group || !Array.isArray(group.hooks)) continue;
            const before = group.hooks.length;
            group.hooks = group.hooks.filter(h => !(h && typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs')));
            if (group.hooks.length !== before) changed = true;
          }
          root.hooks[ev] = root.hooks[ev].filter(g => g && Array.isArray(g.hooks) && g.hooks.length);
        }
        return changed;
      }) && console.log(`Removed VibeSpace hooks from ${def.file()}`);
    } catch { }
  }
}
function removeAgentHooks() {
  // Durable: record the opt-out so startup won't re-register (finding #3).
  try { fs.writeFileSync(HOOK_OPTOUT_FILE, new Date().toISOString() + '\n'); } catch {}
  stripAgentHookEntries();
}
  return {
    AGENT_BIN_DIR, EDITOR_DIR, EDITOR_CMD, STATUS_CMD, USAGE_STATUSLINE_CMD, HOOK_CMD,
    createEditorHelper, createStatusHelper, createHookHelper, userStatuslineCmd,
    ensureAgentHooks, stripAgentHookEntries, removeAgentHooks, hookRegistrationSafe,
    agentHooksStatus,
    HOOK_OPTOUT_FILE: typeof HOOK_OPTOUT_FILE !== 'undefined' ? HOOK_OPTOUT_FILE : undefined,
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

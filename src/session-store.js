/**
 * Session store — JSONL parsing, caching, SessionMessages class,
 * session discovery helpers (path recovery, tmux, PID checks).
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { readJsonlBounded } = require('./adapters/codex');

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');

// ── Helpers ──

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function cwdToProjectDir(cwd) {
  return cwd.replace(/[/._]/g, '-');
}

function recoverCwdFromProjDir(projDir) {
  const parts = projDir.replace(/^-/, '').split('-');
  let current = '/';
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '') continue;
    let found = false;
    for (let j = parts.length; j > i; j--) {
      const segment = parts.slice(i, j).join('-');
      if (fs.existsSync(path.join(current, segment))) {
        current = path.join(current, segment); i = j - 1; found = true; break;
      }
      if (fs.existsSync(path.join(current, '.' + segment))) {
        current = path.join(current, '.' + segment); i = j - 1; found = true; break;
      }
      const underscored = parts.slice(i, j).join('_');
      if (underscored !== segment && fs.existsSync(path.join(current, underscored))) {
        current = path.join(current, underscored); i = j - 1; found = true; break;
      }
    }
    if (!found) {
      current = path.join(current, parts.slice(i).join('-'));
      break;
    }
  }
  return current;
}

function getTmuxPaneMap() {
  const map = new Map();
  try {
    const out = execFileSync('tmux', ['list-panes', '-a', '-F', '#{pane_pid}||#{session_name}:#{window_index}.#{pane_index}'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    for (const line of out.split('\n')) {
      const [pid, target] = line.split('||');
      if (pid && target) map.set(parseInt(pid), target);
    }
  } catch {}
  return map;
}

function findTmuxTarget(pid, paneMap) {
  if (paneMap.has(pid)) return paneMap.get(pid);
  try {
    const ppid = parseInt(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf-8', timeout: 2000 }).trim());
    if (paneMap.has(ppid)) return paneMap.get(ppid);
  } catch {}
  return null;
}

function isProcessClaude(pid) {
  try {
    const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf-8', timeout: 2000 }).trim();
    return cmd === 'claude' || cmd.includes('claude');
  } catch { return false; }
}

// ── JSONL helpers ──

function isSubagentMessage(msg) { return !!(msg.parent_tool_use_id || msg.isSidechain); }

function isDisplayMessage(msg) {
  return msg.type === 'user' || msg.type === 'assistant' || msg.type === 'result' || (msg.type === 'system' && msg.subtype === 'init');
}

function findSessionJsonlPath(claudeSessionId, cwd) {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const projDir = cwdToProjectDir(cwd || '');
  const candidates = [];
  if (cwd) candidates.push(path.join(projectsDir, projDir, claudeSessionId + '.jsonl'));
  try {
    for (const dir of fs.readdirSync(projectsDir)) {
      const fp = path.join(projectsDir, dir, claudeSessionId + '.jsonl');
      if (!candidates.includes(fp)) candidates.push(fp);
    }
  } catch {}
  // Remote-host transcripts fetched over ssh (hosts.fetchSessionJsonl) land in
  // data/remote-jsonl/<hostId>/<id>.jsonl — session ids are UUIDs, so scanning
  // the cache here makes every history consumer remote-capable for free.
  try {
    const cacheRoot = path.join(__dirname, '..', 'data', 'remote-jsonl');
    for (const hostDir of fs.readdirSync(cacheRoot)) {
      candidates.push(path.join(cacheRoot, hostDir, claudeSessionId + '.jsonl'));
    }
  } catch {}
  for (const fp of candidates) {
    try { if (fs.existsSync(fp)) return fp; } catch {}
  }
  return null;
}

// JSONL parse cache — stores ALL non-subagent messages (unfiltered).
// LRU-bounded: it retains the FULL parsed history of each session, so an
// uncapped map slowly pins every session ever viewed in memory.
const _jsonlCache = new Map();
const JSONL_CACHE_MAX = 30;

function parseSessionJsonl(claudeSessionId, cwd) {
  const fp = findSessionJsonlPath(claudeSessionId, cwd);
  if (!fp) return [];
  try {
    const stat = fs.statSync(fp);
    const cached = _jsonlCache.get(claudeSessionId);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      // refresh LRU position
      _jsonlCache.delete(claudeSessionId);
      _jsonlCache.set(claudeSessionId, cached);
      return cached.messages;
    }

    // Bounded read: a full readFileSync('utf-8') THROWS past Node's ~512MB
    // string limit (and blocks the event loop for hundreds of MB below it).
    // Tail-only: the client seek-loads the earlier history as a continuous
    // virtual scroll, so no seam marker is stitched in.
    const _t0 = Date.now();
    const content = readJsonlBounded(fp, { tailOnly: true });
    const messages = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (!isSubagentMessage(msg)) messages.push(msg);
      } catch {}
    }
    // Slow-parse observation (>200ms — a big tail re-read). global hook keeps
    // this module decoupled from the telemetry instance living in server.js.
    const _dt = Date.now() - _t0;
    if (_dt > 200) global.__vsMetric?.('srv-jsonl-parse-ms', _dt);
    _jsonlCache.delete(claudeSessionId);
    _jsonlCache.set(claudeSessionId, { mtimeMs: stat.mtimeMs, size: stat.size, messages });
    while (_jsonlCache.size > JSONL_CACHE_MAX) {
      _jsonlCache.delete(_jsonlCache.keys().next().value);
    }
    return messages;
  } catch { return []; }
}

// Session metadata cache (cwd + first user message)
const _sessionMetaCache = new Map();

function extractSessionMeta(filePath) {
  try {
    const mtimeMs = fs.statSync(filePath).mtimeMs;
    const cached = _sessionMetaCache.get(filePath);
    if (cached && cached.mtimeMs === mtimeMs) return cached.meta;
  } catch {}

  let cwd = '', name = '';
  try {
    // Stream in 64KB chunks with a leftover-line buffer until both cwd + name
    // are found (cap at 2MB). A fixed 32KB read truncated the meta whenever an
    // early line carried a large attachment (>32KB) — the line JSON.parse threw
    // and `cwd` stayed empty, so the session became silently un-resumable
    // (wrong/empty cwd → resume no-ops). (issue #18)
    const fd = fs.openSync(filePath, 'r');
    try {
      const CHUNK = 65536;
      const MAX_BYTES = 2 * 1024 * 1024;
      const chunk = Buffer.alloc(CHUNK);
      let leftover = '', pos = 0;
      while (pos < MAX_BYTES) {
        const bytesRead = fs.readSync(fd, chunk, 0, CHUNK, pos);
        if (bytesRead <= 0) break;
        pos += bytesRead;
        const lines = (leftover + chunk.toString('utf-8', 0, bytesRead)).split('\n');
        leftover = lines.pop() || ''; // last (possibly partial) line carries over
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            if (!cwd && d.cwd) cwd = d.cwd;
            if (d.type === 'user' && !name) {
              const msg = d.message;
              if (msg?.content) {
                const content = Array.isArray(msg.content)
                  ? (msg.content.find(c => c.type === 'text')?.text || '')
                  : String(msg.content);
                name = content.split('\n')[0].substring(0, 80);
              }
            }
          } catch {}
        }
        if (cwd && name) break;
      }
    } finally { fs.closeSync(fd); }
  } catch {}

  const meta = { cwd, name };
  try {
    _sessionMetaCache.set(filePath, { mtimeMs: fs.statSync(filePath).mtimeMs, meta });
    if (_sessionMetaCache.size > 8192) _sessionMetaCache.delete(_sessionMetaCache.keys().next().value);
  } catch {}
  return meta;
}

function getSubagentMetas(claudeSessionId, cwd) {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const projDir = cwdToProjectDir(cwd || '');
  const candidates = [];
  if (cwd) candidates.push(path.join(projectsDir, projDir, claudeSessionId, 'subagents'));
  try {
    for (const dir of fs.readdirSync(projectsDir)) {
      const fp = path.join(projectsDir, dir, claudeSessionId, 'subagents');
      if (!candidates.includes(fp)) candidates.push(fp);
    }
  } catch {}
  for (const subDir of candidates) {
    try {
      if (!fs.existsSync(subDir)) continue;
      const metas = [];
      for (const f of fs.readdirSync(subDir)) {
        if (!f.endsWith('.meta.json')) continue;
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(subDir, f), 'utf-8'));
          const agentId = f.replace('agent-', '').replace('.meta.json', '');
          metas.push({ agentId, description: meta.description || '', agentType: meta.agentType || '' });
        } catch {}
      }
      return metas;
    } catch {}
  }
  return [];
}

function getHistorySessionId(session) {
  return session?.backendSessionId || session?.claudeSessionId || null;
}

// ── SessionMessages class ──

class SessionMessages {
  constructor(session, sessionId, { buffersDir, permissionModes } = {}) {
    this._session = session;
    this._sessionId = sessionId;
    this._buffersDir = buffersDir;
    this._permissionModes = permissionModes || [];
    this._all = null;
    this._display = null;
    this._pendingPerms = null;
    this._wrapperMeta = undefined;
    this._taskState = undefined;
  }

  _ensureParsed() {
    if (this._all) return;
    const session = this._session;
    const historySessionId = getHistorySessionId(session);
    const jsonl = historySessionId ? parseSessionJsonl(historySessionId, session.cwd) : [];
    const uuids = new Set();
    const msgIds = new Set();
    for (const m of jsonl) {
      if (m.uuid) uuids.add(m.uuid);
      // Streaming stdout events can carry a PLACEHOLDER uuid (…-000000000001)
      // while the JSONL record for the SAME message has the real one — uuid
      // dedup misses those and the stale buffer copy would render pinned after
      // the entire history. message.id (msg_…) is stable across both copies.
      const mid = m.message?.id;
      if (mid) msgIds.add(mid);
    }

    this._pendingPerms = {};
    // Surviving buffer records are INTERLEAVED at their true chronological
    // position (right after the JSONL record their buffer-neighborhood dedups
    // against) instead of all appended at the end. Stream-json stdout-only
    // records (result/init/control_*) never dedup — appended at the end, an
    // EARLIER turn's `result` replayed AFTER a still-running tool_use and the
    // normalizer flushed the live pending tool card to ✗ Interrupted on every
    // server restart (real user report); end-append also scrambled turn
    // boundaries in the replay. The buffer is chronological, so the index of
    // the last JSONL-matched record is a correct position anchor.
    const jsonlPos = new Map(); // 'u:<uuid>' | 'm:<message.id>' → jsonl index
    jsonl.forEach((m, i) => {
      if (m.uuid) jsonlPos.set('u:' + m.uuid, i);
      const mid = m.message?.id;
      if (mid && !jsonlPos.has('m:' + mid)) jsonlPos.set('m:' + mid, i);
    });
    const parsed = [];
    for (const line of (session.buffer || '').split('\n')) {
      const trimmed = line.replace(/\r/g, '').trim();
      if (!trimmed) continue;
      try { parsed.push(JSON.parse(trimmed)); } catch {}
    }
    // A ROTATED buffer can start with unmatched stdout-only records from mid-
    // history; anchor those just before the first matched record (not at the
    // very start) — much closer to their true position.
    let firstHit = -1;
    for (const msg of parsed) {
      const hitU = msg.uuid != null ? jsonlPos.get('u:' + msg.uuid) : undefined;
      const hit = hitU !== undefined ? hitU : (msg.message?.id ? jsonlPos.get('m:' + msg.message.id) : undefined);
      if (hit !== undefined) { firstHit = hit; break; }
    }
    let anchor = firstHit >= 0 ? firstHit - 1 : jsonl.length - 1;
    const inserts = new Map(); // jsonl index (-1 = before all) → [records]
    let anyInsert = false;
    for (const msg of parsed) {
      if (msg.type === 'control_request' && msg.request?.tool_use_id) { this._pendingPerms[msg.request.tool_use_id] = msg; }
      const hitU = msg.uuid != null ? jsonlPos.get('u:' + msg.uuid) : undefined;
      const hit = hitU !== undefined ? hitU : (msg.message?.id ? jsonlPos.get('m:' + msg.message.id) : undefined);
      if (hit !== undefined) { if (hit > anchor) anchor = hit; continue; } // in JSONL — advances the position cursor
      const isControl = msg.type === 'control_request' || msg.type === 'control_response' || msg.type === 'control_cancel_request';
      if (!isControl) {
        if (isSubagentMessage(msg)) continue;
        if (msg._fromWebui && msg.timestamp) {
          if (jsonl.some(m => m.type === 'user' && m.timestamp >= msg.timestamp)) continue;
        }
      }
      const list = inserts.get(anchor) || inserts.set(anchor, []).get(anchor);
      list.push(msg);
      anyInsert = true;
    }
    if (!anyInsert) this._all = jsonl;
    else {
      const all = [...(inserts.get(-1) || [])];
      for (let i = 0; i < jsonl.length; i++) {
        all.push(jsonl[i]);
        const ins = inserts.get(i);
        if (ins) all.push(...ins);
      }
      this._all = all;
    }
    this._display = this._all.filter(isDisplayMessage);
  }

  get total() { this._ensureParsed(); return this._display.length; }
  get pendingPermissions() { this._ensureParsed(); return this._pendingPerms; }

  get isStreaming() {
    const wMeta = this.wrapperMeta();
    if (wMeta?.streaming != null) return wMeta.streaming;
    return false;
  }

  tail(n = 50) { this._ensureParsed(); return this._display.slice(-n); }
  slice(offset, limit) { this._ensureParsed(); return this._display.slice(offset, offset + limit); }
  all() { this._ensureParsed(); return this._display; }
  raw() { this._ensureParsed(); return this._all; }

  search(query) {
    this._ensureParsed();
    const q = query.toLowerCase();
    const matches = [];
    for (let i = 0; i < this._display.length; i++) {
      const m = this._display[i];
      const c = m.message?.content;
      let text = '';
      if (typeof c === 'string') text = c;
      else if (Array.isArray(c)) text = c.map(b => b.text || '').join(' ');
      if (text.toLowerCase().includes(q)) matches.push({ index: i, type: m.type, preview: text.substring(0, 120) });
    }
    return matches;
  }

  chatStatus() {
    this._ensureParsed();
    const msgs = this._all;
    let lastUsage = null, model = null, contextWindow = 0, totalCost = 0, slashCommands = null, permissionMode = null;
    let assistantModel = null;
    // Scan depth: the tail of _all can be dominated by hundreds of surviving
    // buffer records (stdout-only system/hook events that never dedup against
    // the JSONL) — a 200-record window missed every assistant usage record and
    // the status bar lost its context% on refresh. 2000 covers the spam.
    for (let i = msgs.length - 1; i >= Math.max(0, msgs.length - 2000); i--) {
      const m = msgs[i];
      if (!lastUsage && m.type === 'assistant' && m.message?.usage) lastUsage = m.message.usage;
      // result/init records are stream-json stdout-only — they NEVER appear in
      // the JSONL, so for stopped/resumed sessions (no buffer) the assistant
      // record's message.model is the only model source available
      if (!assistantModel && m.type === 'assistant' && m.message?.model && !String(m.message.model).startsWith('<')) assistantModel = m.message.model;
      if (!model && m.type === 'result' && m.modelUsage) { model = Object.keys(m.modelUsage)[0]; contextWindow = Object.values(m.modelUsage)[0]?.contextWindow || 0; }
      if (lastUsage && model && assistantModel) break;
    }
    if (!model) model = assistantModel;
    for (let i = 0; i < Math.min(msgs.length, 5); i++) {
      const m = msgs[i];
      if (m.type === 'system' && m.subtype === 'init') {
        if (m.slash_commands) slashCommands = m.slash_commands;
        if (!model && m.model) model = m.model;
        if (m.permissionMode) permissionMode = m.permissionMode;
        break;
      }
    }
    // contextWindow comes from result.modelUsage (stdout-only). When restoring
    // from JSONL the only sound DEDUCTION is: observed usage beyond the 200k
    // window proves the 1M beta. Anything else stays 0 = unknown — the UI shows
    // "?" rather than a guessed default (a wrong 200k on a 1M session made the
    // context % lie by 5x).
    if (!contextWindow && lastUsage) {
      const used = (lastUsage.input_tokens || 0) + (lastUsage.cache_read_input_tokens || 0) + (lastUsage.cache_creation_input_tokens || 0);
      if (used > 190000) contextWindow = 1000000;
    }
    for (const m of msgs) { if (m.type === 'result' && m.total_cost_usd) totalCost += m.total_cost_usd; }
    if (!lastUsage && !model) return null;
    return {
      model, lastUsage, contextWindow, total_cost_usd: totalCost, slashCommands, permissionMode,
      permissionModes: this._permissionModes,
      subagentMetas: getSubagentMetas(getHistorySessionId(this._session), this._session.cwd),
    };
  }

  activePendingPermissions() {
    this._ensureParsed();
    const resolved = new Set();
    for (const m of this._all.slice(-100)) {
      if (m.type !== 'user') continue;
      const c = m.message?.content;
      if (!Array.isArray(c)) continue;
      for (const b of c) { if (b.type === 'tool_result' && b.tool_use_id) resolved.add(b.tool_use_id); }
    }
    const result = {};
    for (const [id, cr] of Object.entries(this._pendingPerms)) {
      if (!resolved.has(id)) result[id] = cr;
    }
    return result;
  }

  wrapperMeta() {
    if (this._wrapperMeta === undefined) {
      if (this._sessionId && this._buffersDir) {
        try { this._wrapperMeta = JSON.parse(fs.readFileSync(path.join(this._buffersDir, this._sessionId + '.json'), 'utf-8')); }
        catch { this._wrapperMeta = null; }
      } else {
        this._wrapperMeta = null;
      }
    }
    return this._wrapperMeta;
  }

  taskState() {
    if (this._taskState !== undefined) return this._taskState;
    const wMeta = this.wrapperMeta();
    if (wMeta?.tasks || wMeta?.todos) {
      const base = { tasks: wMeta.tasks || {}, todos: wMeta.todos || [] };
      // An EMPTY todos array in wrapper meta must not short-circuit the scan —
      // the newer TaskCreate/TaskUpdate family only exists in the transcript.
      if (base.todos.length) { this._taskState = base; return base; }
      const scanned = this._scanTaskState();
      this._taskState = { tasks: Object.keys(base.tasks).length ? base.tasks : scanned.tasks, todos: scanned.todos };
      return this._taskState;
    }
    this._taskState = this._scanTaskState();
    return this._taskState;
  }

  _scanTaskState() {
    this._ensureParsed();
    const tasks = {};
    const todos = [];
    // Newer task-tool family (TaskCreate/TaskUpdate, CLI ≥2.1.2xx): CRUD by id
    // — replay into a list. The created id only appears in the RESULT text
    // ("Task #N created successfully: …").
    const pendingCreates = new Map(); // tool_use_id → input
    const taskList = new Map(); // taskId → {content, activeForm, status}
    for (const msg of this._all) {
      if (msg.type === 'system' && msg.tool_use_id) {
        if (msg.subtype === 'task_started') {
          tasks[msg.tool_use_id] = { id: msg.task_id, type: msg.task_type === 'local_agent' ? 'agent' : 'command', description: msg.description || '', status: 'running' };
        } else if (msg.subtype === 'task_progress' && tasks[msg.tool_use_id]) {
          if (msg.description) tasks[msg.tool_use_id].description = msg.description;
          if (msg.last_tool_name) tasks[msg.tool_use_id].lastTool = msg.last_tool_name;
        } else if (msg.subtype === 'task_notification' && tasks[msg.tool_use_id]) {
          tasks[msg.tool_use_id].status = 'completed';
        }
      }
      if (msg.type === 'assistant' && msg.message?.content) {
        const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
        for (const b of blocks) {
          if (b.type !== 'tool_use') continue;
          if (b.name === 'TodoWrite' && b.input?.todos) {
            todos.length = 0;
            todos.push(...b.input.todos);
          } else if (b.name === 'TaskCreate') {
            pendingCreates.set(b.id, b.input || {});
          } else if (b.name === 'TaskUpdate' && b.input?.taskId) {
            const key = String(b.input.taskId);
            if (b.input.status === 'deleted') taskList.delete(key);
            else {
              const cur = taskList.get(key) || { content: '', status: 'pending' };
              if (b.input.subject) cur.content = b.input.subject;
              if (b.input.activeForm) cur.activeForm = b.input.activeForm;
              if (b.input.status) cur.status = b.input.status;
              taskList.set(key, cur);
            }
          }
        }
      }
      if (msg.type === 'user' && Array.isArray(msg.message?.content) && pendingCreates.size) {
        for (const b of msg.message.content) {
          if (b?.type !== 'tool_result' || !pendingCreates.has(b.tool_use_id)) continue;
          const inp = pendingCreates.get(b.tool_use_id);
          pendingCreates.delete(b.tool_use_id);
          const txt = typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map((c) => c?.text || '').join(' ') : '');
          const m = /Task #(\d+) created/.exec(txt);
          if (m) taskList.set(m[1], { content: inp.subject || '', activeForm: inp.activeForm, status: 'pending' });
        }
      }
    }
    // Prefer the newer task-tool list when TodoWrite wasn't used.
    if (!todos.length && taskList.size) {
      todos.push(...[...taskList.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, v]) => v));
    }
    return { tasks, todos };
  }
}

module.exports = {
  SESSIONS_DIR,
  isPidAlive,
  cwdToProjectDir,
  recoverCwdFromProjDir,
  getTmuxPaneMap,
  findTmuxTarget,
  isProcessClaude,
  isSubagentMessage,
  isDisplayMessage,
  findSessionJsonlPath,
  parseSessionJsonl,
  extractSessionMeta,
  getSubagentMetas,
  getHistorySessionId,
  SessionMessages,
};

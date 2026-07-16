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

// ── Lock → JSONL claiming (discovery) ──
// "Newest JSONL in the lock's project dir" misattributes files when SEVERAL
// sessions run in parallel in ONE cwd — mtime order among concurrent writers is
// arbitrary (real incident: 4 parallel external sessions read as 5 running;
// killing one flagged the WRONG session id stopped, and resuming that id
// collided with a still-running process). The lock file carries the CURRENT
// sessionId and every JSONL RECORD carries a sessionId field; after --resume
// the FILENAME keeps the original id but recent records carry the current one.
// So: claim by exact id first, tail-scan second, mtime-recency last.

// Last `bytes` of a JSONL as the sessionIds seen in it, in occurrence order
// (last element = the file's current writer). null = unreadable.
function readJsonlTailIds(fp, bytes = 65536) {
  let fd = null;
  try {
    fd = fs.openSync(fp, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(bytes, size);
    if (!len) return [];
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    let text = buf.toString('utf-8');
    if (len < size) { // line-align: drop the partial first line
      const nl = text.indexOf('\n');
      if (nl >= 0) text = text.slice(nl + 1);
    }
    const ids = [];
    const re = /"sessionId":"([\w-]+)"/g;
    let m;
    while ((m = re.exec(text))) ids.push(m[1]);
    return ids;
  } catch { return null; } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
  }
}

/**
 * Match alive locks to JSONL files within ONE project dir. Pure — testable
 * without live processes; shared by local (/api/sessions) and remote
 * (hosts.discoverSessions) discovery.
 *
 * @param locks  [{ sessionId: string|null, exactOnly: bool, ...caller fields }]
 *               exactOnly (webui-tracked ids) never fall through to tail/mtime.
 * @param jsonls [{ id: filename-id, mtime, ...caller fields }] any order
 * @param tailIdsFor (jsonl) => [sessionIds in tail, occurrence order] | null
 * @returns Map<jsonlId, lock> — each JSONL claimed by at most one lock.
 *
 * Passes:
 *  1. exact — the lock's current sessionId IS a JSONL filename (non-resumed).
 *  2. tail  — a resumed session writes records carrying its CURRENT id into the
 *             ORIGINAL-named file; prefer the file whose LAST tail id is the
 *             lock's (its current writer) over a mere mention.
 *  3. mtime — locks with no id evidence (brand-new session that hasn't flushed
 *             a record yet, unreadable tail, old lock without sessionId) take
 *             the newest unclaimed JSONL among files with NO tail evidence
 *             (empty file / unreadable / no tail data). Files whose tail names
 *             some OTHER (dead) session are NEVER fallback-claimed — they are a
 *             stopped session's transcript, and stealing one is the bug above
 *             (the unmatched lock is instead listed by its own sessionId).
 * Tail reads only happen when the dir is ambiguous — single-lock-single-jsonl
 * short-circuits without touching the file (the overwhelmingly common case).
 */
function claimJsonls(locks, jsonls, tailIdsFor) {
  const claims = new Map(); // jsonl id -> lock
  const sorted = [...jsonls].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  const byId = new Map(sorted.map(j => [j.id, j]));
  const claimedIds = new Set();
  const unmatched = [];

  // Pass 1 — exact filename match.
  for (const lock of locks) {
    const want = lock.sessionId;
    if (want && byId.has(want) && !claimedIds.has(want)) {
      claims.set(want, lock);
      claimedIds.add(want);
    } else if (!lock.exactOnly) {
      unmatched.push(lock);
    }
  }
  if (!unmatched.length) return claims;

  const unclaimed = () => sorted.filter(j => !claimedIds.has(j.id));

  // Short-circuit — unambiguous dir: one lock, one JSONL, no tail read.
  if (locks.length === 1 && jsonls.length === 1) {
    const j = unclaimed()[0];
    if (j) claims.set(j.id, unmatched[0]);
    return claims;
  }

  // Pass 2 — tail match (bounded: newest candidates only).
  const TAIL_CANDIDATES_MAX = 30;
  const tails = new Map(); // jsonl id -> [ids] | null
  for (const j of unclaimed().slice(0, TAIL_CANDIDATES_MAX)) {
    let ids = null;
    try { ids = tailIdsFor ? tailIdsFor(j) : null; } catch {}
    tails.set(j.id, Array.isArray(ids) ? ids : null);
  }
  const stillUnmatched = [];
  for (const lock of unmatched) {
    if (!lock.sessionId) { stillUnmatched.push(lock); continue; }
    let best = null, bestScore = 0;
    for (const j of unclaimed()) {
      const ids = tails.get(j.id);
      if (!ids || !ids.length) continue;
      const at = ids.lastIndexOf(lock.sessionId);
      if (at < 0) continue;
      const score = at === ids.length - 1 ? 2 : 1; // current writer beats mention
      if (score > bestScore) { best = j; bestScore = score; }
    }
    if (best) { claims.set(best.id, lock); claimedIds.add(best.id); }
    else stillUnmatched.push(lock);
  }

  // Pass 3 — mtime fallback over NO-EVIDENCE files only. A file whose tail
  // names some other (dead) session is a stopped session's transcript — never
  // hand it to an unrelated lock; the caller lists leftover locks by their own
  // sessionId instead.
  if (stillUnmatched.length) {
    const order = unclaimed().filter(j => !(tails.get(j.id) || []).length); // mtime-desc
    for (const lock of stillUnmatched) {
      const j = order.shift();
      if (!j) break;
      claims.set(j.id, lock);
      claimedIds.add(j.id);
    }
  }
  return claims;
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
                const cand = content.split('\n')[0].substring(0, 80).trim();
                // skip synthetic first turns — an injected <vibespace-task-context>/
                // <system-reminder> or a slash-command echo isn't the session's name;
                // keep scanning for the first REAL user message (matches remote).
                if (cand && !cand.startsWith('<') && !cand.startsWith('/')) name = cand;
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

// ── Full-file task-tool event scan (2.180.1, real report: a long-completed
// task showed as in_progress in Steps forever) ──
// Two cooperating failure modes: (a) the tail-only display window can MISS a
// task's completing TaskUpdate entirely; (b) COMPACTION re-appends the
// retained records (with their ORIGINAL timestamps and uuids) after the whole
// history — so a task's create/in_progress get replayed while its completed
// update (summarized away) does not, and even a full FILE-ORDER apply ends on
// the stale replay. Fix: stream the WHOLE file once (substring pre-filter,
// byte-safe line splitting, incremental byte cursor so a live session only
// scans appended bytes) with uuid dedup (kills replay copies), and let the
// caller apply events in TIMESTAMP order.
const _taskEventCache = new Map(); // fp → {offset, carry, seq, pending, events, uuids}
function scanTaskEventsFull(fp) {
  let st;
  try { st = fs.statSync(fp); } catch { return null; }
  let c = _taskEventCache.get(fp);
  if (!c || st.size < c.offset) c = { offset: 0, carry: Buffer.alloc(0), seq: 0, pending: new Map(), events: [], uuids: new Set() };
  _taskEventCache.set(fp, c);
  if (st.size === c.offset) return c.events;
  let fd;
  try { fd = fs.openSync(fp, 'r'); } catch { return c.events; }
  try {
    const CH = 16 * 1024 * 1024;
    const buf = Buffer.allocUnsafe(CH);
    while (c.offset < st.size) {
      const n = fs.readSync(fd, buf, 0, Math.min(CH, st.size - c.offset), c.offset);
      if (n <= 0) break;
      c.offset += n;
      // byte-safe line assembly: never toString across an arbitrary slab edge
      // (a split multi-byte char corrupts the boundary line — the CJK/byte-
      // offset lesson from usage-history)
      const data = c.carry.length ? Buffer.concat([c.carry, buf.subarray(0, n)]) : Buffer.from(buf.subarray(0, n));
      const cut = data.lastIndexOf(0x0a);
      if (cut === -1) { c.carry = Buffer.from(data); continue; }
      c.carry = Buffer.from(data.subarray(cut + 1));
      for (const line of data.toString('utf-8', 0, cut).split('\n')) {
        if (!line.includes('"TaskCreate"') && !line.includes('"TaskUpdate"') && !line.includes('"TodoWrite"') && !line.includes('Task #')) continue;
        let rec; try { rec = JSON.parse(line); } catch { continue; }
        if (rec.uuid) {
          if (c.uuids.has(rec.uuid)) continue; // compaction replay copy
          c.uuids.add(rec.uuid);
        }
        const content = rec.message?.content;
        if (!Array.isArray(content)) continue;
        const ts = Date.parse(rec.timestamp || '') || 0;
        for (const b of content) {
          if (!b || typeof b !== 'object') continue;
          if (rec.type === 'assistant' && b.type === 'tool_use') {
            if (b.name === 'TodoWrite' && b.input?.todos) c.events.push({ kind: 'todos', todos: b.input.todos, ts, seq: c.seq++ });
            else if (b.name === 'TaskCreate') c.pending.set(b.id, b.input || {});
            else if (b.name === 'TaskUpdate' && b.input?.taskId) c.events.push({ kind: 'update', input: b.input, ts, seq: c.seq++ });
          } else if (rec.type === 'user' && b.type === 'tool_result' && c.pending.has(b.tool_use_id)) {
            const inp = c.pending.get(b.tool_use_id);
            c.pending.delete(b.tool_use_id);
            const txt = typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map((x) => x?.text || '').join(' ') : '');
            const m = /Task #(\d+) created/.exec(txt);
            if (m) c.events.push({ kind: 'create', id: m[1], subject: inp.subject || '', activeForm: inp.activeForm, ts, seq: c.seq++ });
          }
        }
      }
    }
  } finally { try { fs.closeSync(fd); } catch { } }
  return c.events;
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
    // Scan ALL records for tool_results, not a tail window — a session that
    // kept running after answering pushes the tool_result out of any fixed
    // window and the stale control_request re-injects an awaiting-approval
    // overlay on every attach (real report: an answered AskUserQuestion
    // questionnaire resurrected after each server restart). Same class as
    // the chatStatus 200→2000 scan-depth bug.
    for (const m of this._all) {
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
    // Prefer the FULL-FILE event scan applied in TIMESTAMP order — the tail
    // window misses old completions, and compaction replays stale records
    // AFTER them (see scanTaskEventsFull). Falls back to the in-window walk
    // when the transcript path can't be resolved.
    let fullApplied = false;
    try {
      const hid = getHistorySessionId(this._session);
      const fp = hid ? findSessionJsonlPath(hid, this._session?.cwd) : null;
      const events = fp ? scanTaskEventsFull(fp) : null;
      if (events) {
        fullApplied = true;
        let lastTodoTs = -1, lastTaskTs = -1;
        for (const ev of [...events].sort((a, b) => (a.ts - b.ts) || (a.seq - b.seq))) {
          if (ev.kind === 'todos') { todos.length = 0; todos.push(...ev.todos); lastTodoTs = ev.ts; }
          else if (ev.kind === 'create') { if (!taskList.has(ev.id)) taskList.set(ev.id, { content: ev.subject, activeForm: ev.activeForm, status: 'pending' }); lastTaskTs = ev.ts; }
          else if (ev.kind === 'update') {
            lastTaskTs = ev.ts;
            const key = String(ev.input.taskId);
            if (ev.input.status === 'deleted') taskList.delete(key);
            else {
              const cur = taskList.get(key) || { content: '', status: 'pending' };
              if (ev.input.subject) cur.content = ev.input.subject;
              if (ev.input.activeForm) cur.activeForm = ev.input.activeForm;
              if (ev.input.status) cur.status = ev.input.status;
              taskList.set(key, cur);
            }
          }
        }
        // The LATEST-used family wins. The old tail-window scan expressed this
        // as "TodoWrite present in the window"; over the FULL history that
        // reads as "TodoWrite EVER used" and an ancient TodoWrite snapshot
        // shadowed the current task list (caught on the first real transcript).
        if (taskList.size && lastTaskTs >= lastTodoTs) todos.length = 0;
      }
    } catch { /* fall through to the in-window walk */ }
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
      if (!fullApplied && msg.type === 'assistant' && msg.message?.content) {
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
      if (!fullApplied && msg.type === 'user' && Array.isArray(msg.message?.content) && pendingCreates.size) {
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
  readJsonlTailIds,
  claimJsonls,
  findSessionJsonlPath,
  parseSessionJsonl,
  extractSessionMeta,
  getSubagentMetas,
  getHistorySessionId,
  SessionMessages,
};

/**
 * CodexAdapter — BackendAdapter implementation for Codex CLI.
 *
 * Terminal mode uses interactive `codex` under PTY/dtach.
 * Chat mode uses the dedicated app-server wrapper under dtach.
 */

const { BackendAdapter } = require('./base');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

function pushCodexConfigOverride(args, key, value) {
  if (!Array.isArray(args) || !key || value === undefined || value === null || value === '') return;
  args.push('-c', `${key}=${JSON.stringify(String(value))}`);
}

function resolveCodexPermissionMode(mode = 'default', { sandboxSupported = true } = {}) {
  if (!sandboxSupported && mode !== 'yolo') {
    return {
      permissionMode: mode === 'read-only' ? 'default' : mode,
      requestedPermissionMode: mode,
      approvalPolicy: mode === 'safe-yolo' ? 'on-failure' : 'on-request',
      sandbox: 'danger-full-access',
      sandboxPolicy: { type: 'dangerFullAccess' },
      degraded: true,
      degradedReason: 'codex-linux-sandbox executable not found',
    };
  }

  switch (mode) {
    case 'read-only':
      return {
        permissionMode: 'read-only',
        approvalPolicy: 'never',
        sandbox: 'read-only',
        sandboxPolicy: { type: 'readOnly' },
      };
    case 'safe-yolo':
      return {
        permissionMode: 'safe-yolo',
        approvalPolicy: 'on-failure',
        sandbox: 'workspace-write',
        sandboxPolicy: { type: 'workspaceWrite' },
      };
    case 'yolo':
      return {
        permissionMode: 'yolo',
        approvalPolicy: 'never',
        sandbox: 'danger-full-access',
        sandboxPolicy: { type: 'dangerFullAccess' },
      };
    default:
      return {
        permissionMode: 'default',
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
        sandboxPolicy: { type: 'workspaceWrite' },
      };
  }
}

function _walkJsonlFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const fp = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fp);
      } else if (entry.isFile() && fp.endsWith('.jsonl')) {
        files.push(fp);
      }
    }
  }
  return files;
}

function findCodexSessionJsonlPath(threadId) {
  if (!threadId) return null;
  for (const fp of _walkJsonlFiles(CODEX_SESSIONS_DIR)) {
    if (fp.endsWith(`${threadId}.jsonl`)) return fp;
  }
  // Remote-cache scan (B-10ed, mirrors session-store's claude cache scan):
  // hosts.fetchCodexJsonl pulls a host's rollout into
  // data/remote-jsonl/<hostId>/codex/<threadId>.jsonl — finding it here makes
  // every codex history consumer remote-capable for free.
  try {
    const base = path.join(__dirname, '..', '..', 'data', 'remote-jsonl');
    for (const hostDir of fs.readdirSync(base)) {
      const p = path.join(base, hostDir, 'codex', `${threadId}.jsonl`);
      if (fs.existsSync(p)) return p;
    }
  } catch { }
  return null;
}

// Bounded JSONL read: head (session_meta, early turn_context) + tail (recent
// conversation), line-aligned. Two reasons full reads are wrong for huge
// rollouts: (1) Node cannot create a string > ~512MB — readFileSync('utf-8')
// THROWS on a 541MB file and the swallowed error left attach with an empty
// history (blank chat window); (2) even below the limit, parsing hundreds of
// MB of JSON synchronously blocks the event loop for the whole server.
const JSONL_HEAD_BYTES = 2 * 1024 * 1024;
const JSONL_TAIL_BYTES = 32 * 1024 * 1024;
function readJsonlBounded(fp, opts = {}) {
  const stat = fs.statSync(fp);
  if (stat.size <= JSONL_HEAD_BYTES + JSONL_TAIL_BYTES) return fs.readFileSync(fp, 'utf-8');
  const fd = fs.openSync(fp, 'r');
  try {
    const tailBuf = Buffer.alloc(JSONL_TAIL_BYTES);
    const tn = fs.readSync(fd, tailBuf, 0, JSONL_TAIL_BYTES, stat.size - JSONL_TAIL_BYTES);
    let tail = tailBuf.toString('utf-8', 0, tn);
    tail = tail.slice(tail.indexOf('\n') + 1); // drop the cut-off first line
    // Tail-only display window. The elided head+middle is NOT stitched in with a
    // seam marker anymore — the client seek-loads the whole file backward from
    // this tail as a continuous virtual scroll (no visible truncation notice).
    if (opts.tailOnly) {
      console.warn(`[jsonl] large session file ${path.basename(fp)} (${Math.round(stat.size / 1048576)}MB): tail-only display (last ${JSONL_TAIL_BYTES / 1048576}MB), earlier history seek-loaded on scroll`);
      return tail;
    }
    // Legacy head+tail path (no callers pass tailOnly=false today, but keep the
    // head stitch for safety — WITHOUT the old seam-marker injection).
    const headBuf = Buffer.alloc(JSONL_HEAD_BYTES);
    const hn = fs.readSync(fd, headBuf, 0, JSONL_HEAD_BYTES, 0);
    let head = headBuf.toString('utf-8', 0, hn);
    head = head.slice(0, head.lastIndexOf('\n') + 1);
    return head + tail;
  } finally { fs.closeSync(fd); }
}


// ── Byte-offset line index for seek-based lazy loading of huge JSONL files ──
// A full readFileSync is impossible (>512MB string) and a full normalize is
// expensive, but the MIDDLE of a big rollout is still seek-readable: build a
// line→byte-offset table ONCE (streaming, Buffer scan — never holds the whole
// file as a string), cache it by mtime+size, then read any line range by
// pread without touching the rest. This is how the WebUI lets you scroll into
// the elided middle that head+tail loading skips.
const _lineIndexCache = new Map(); // fp -> { mtimeMs, size, offsets, totalLines }
const LINE_INDEX_CHUNK = 16 * 1024 * 1024;

function getJsonlLineIndex(fp) {
  const stat = fs.statSync(fp);
  const hit = _lineIndexCache.get(fp);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit;
  const fd = fs.openSync(fp, 'r');
  try {
    let offsets;      // byte offset where each line STARTS; offsets[i] = start of line i
    let scanFrom;
    // Incremental fast path: JSONL is append-only, so when the file has only
    // GROWN and its previous end was a clean line boundary, reuse the cached
    // offset table and scan JUST the appended tail — instead of re-streaming the
    // whole (100s-of-MB, actively-growing) file on every seek. This is what makes
    // jumps stay instant while a live session keeps writing.
    let canExtend = false;
    if (hit && stat.size > hit.size && stat.mtimeMs >= hit.mtimeMs && hit.size > 0) {
      const b = Buffer.alloc(1);
      fs.readSync(fd, b, 0, 1, hit.size - 1);
      canExtend = b[0] === 0x0a;   // old size ended exactly after a newline
    }
    if (canExtend) {
      offsets = hit.offsets.slice(); // copy so a held-elsewhere old entry isn't mutated
      offsets.push(hit.size);        // start of the first appended line (was popped before)
      scanFrom = hit.size;
    } else {
      offsets = [0];
      scanFrom = 0;
    }
    const buf = Buffer.alloc(LINE_INDEX_CHUNK);
    let pos = scanFrom;
    while (pos < stat.size) {
      const n = fs.readSync(fd, buf, 0, LINE_INDEX_CHUNK, pos);
      if (n <= 0) break;
      for (let i = 0; i < n; i++) {
        if (buf[i] === 0x0a) offsets.push(pos + i + 1); // start of next line
      }
      pos += n;
    }
    // offsets now has one trailing entry == file end if the file ends with \n;
    // totalLines = number of line starts that actually begin a line (< size)
    while (offsets.length > 1 && offsets[offsets.length - 1] >= stat.size) offsets.pop();
    const entry = { mtimeMs: stat.mtimeMs, size: stat.size, offsets, totalLines: offsets.length };
    _lineIndexCache.set(fp, entry);
    if (_lineIndexCache.size > 32) _lineIndexCache.delete(_lineIndexCache.keys().next().value);
    return entry;
  } finally { fs.closeSync(fd); }
}

// Which line indices does the head+tail window cover? Lines [0, headEndLine)
// are in the head, [tailStartLine, totalLines) in the tail; the gap in between
// is what lazy loading fetches. Returns null when the file isn't elided.
function jsonlGapInfo(fp) {
  const stat = fs.statSync(fp);
  if (stat.size <= JSONL_HEAD_BYTES + JSONL_TAIL_BYTES) return null;
  const { offsets, totalLines } = getJsonlLineIndex(fp);
  const tailStartByte = stat.size - JSONL_TAIL_BYTES;
  // first line whose start is within the head budget is excluded once offset > head
  let headEndLine = 0;
  while (headEndLine < totalLines && offsets[headEndLine] < JSONL_HEAD_BYTES) headEndLine++;
  let tailStartLine = headEndLine;
  while (tailStartLine < totalLines && offsets[tailStartLine] < tailStartByte) tailStartLine++;
  return { headEndLine, tailStartLine, totalLines, gapRecords: Math.max(0, tailStartLine - headEndLine) };
}

// Full-file user-turn scan for a whole-conversation minimap. Streams the file
// in chunks (no big string), pre-filters to lines containing a user-role marker
// (~2k of 300k lines), JSON-parses only those. Returns turns in TIME coordinates
// (the universal minimap axis) plus each turn's file line (for seek-jumping).
const _turnScanCache = new Map(); // fp -> { mtimeMs, size, turns }
function scanJsonlUserTurns(fp, backend) {
  const stat = fs.statSync(fp);
  const hit = _turnScanCache.get(fp);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.turns;
  const fd = fs.openSync(fp, 'r');
  const turns = [];
  const needle = '"role":"user"';
  const handleLine = (raw, line) => {
    if (!raw || raw.indexOf(needle) === -1) return;
    let rec; try { rec = JSON.parse(raw); } catch { return; }
    const turn = backend === 'codex' ? _codexUserTurn(rec, line) : _claudeUserTurn(rec, line);
    if (turn) turns.push(turn);
  };
  try {
    const buf = Buffer.alloc(LINE_INDEX_CHUNK);
    let pos = 0, line = 0, carry = '';
    while (pos < stat.size) {
      const n = fs.readSync(fd, buf, 0, LINE_INDEX_CHUNK, pos);
      if (n <= 0) break;
      const text = carry + buf.toString('utf-8', 0, n);
      const parts = text.split('\n');
      carry = parts.pop();
      for (const raw of parts) handleLine(raw.trim(), line++);
      pos += n;
    }
    handleLine(carry.trim(), line);
  } finally { fs.closeSync(fd); }
  _turnScanCache.set(fp, { mtimeMs: stat.mtimeMs, size: stat.size, turns });
  if (_turnScanCache.size > 32) _turnScanCache.delete(_turnScanCache.keys().next().value);
  return turns;
}

function _previewOf(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  if (t.startsWith('This session is being continued from a previous conversation')) return null; // compact
  return t.length > 60 ? t.slice(0, 60) + '…' : t;
}

function _claudeUserTurn(rec, line) {
  if (rec.type !== 'user' || rec.message?.role !== 'user') return null;
  const content = rec.message.content;
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    if (content.some((b) => b.type === 'tool_result')) return null; // tool result, not a real user turn
    text = content.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
  }
  if (!text.trim()) return null;
  const ts = rec.timestamp ? Date.parse(rec.timestamp) || 0 : 0;
  const preview = _previewOf(text);
  return { line, ts, preview: preview ?? 'Context compacted', isCompact: preview === null };
}

function _codexUserTurn(rec, line) {
  if (rec.type !== 'response_item' || rec.payload?.type !== 'message' || rec.payload?.role !== 'user') return null;
  const content = rec.payload.content;
  const text = Array.isArray(content)
    ? content.filter((b) => b.type === 'input_text' || b.type === 'text').map((b) => b.text || '').join('')
    : String(content || '');
  if (!text.trim()) return null;
  const ts = rec.timestamp ? Date.parse(rec.timestamp) || 0 : 0;
  const preview = _previewOf(text);
  return { line, ts, preview: preview ?? 'Context compacted', isCompact: preview === null };
}

// ── Full-file streaming search ──
// Search the ENTIRE JSONL (including the elided middle of huge files) without
// ever holding it in memory. Chunked Buffer scan with a cheap raw-substring
// pre-filter, then JSON.parse only the candidate lines and match against the
// record's extracted text. Coordinates are {line, ts} — the same axes the
// full-extent minimap uses — so the client can seek-jump to any match.
// Caveat: the raw pre-filter can miss text whose JSON encoding differs from
// the query (embedded quotes/newlines); plain words and CJK are stored
// literally in these files, so real-world queries are unaffected.
function _searchableTextOf(rec, backend) {
  const parts = [];
  const push = (v) => { if (typeof v === 'string' && v) parts.push(v); };
  if (backend === 'codex') {
    const p = rec.payload || {};
    if (Array.isArray(p.content)) for (const b of p.content) push(b?.text);
    push(typeof p.content === 'string' ? p.content : '');
    push(p.arguments); push(p.output); push(p.text);
    if (Array.isArray(p.summary)) for (const b of p.summary) push(b?.text);
  } else {
    const m = rec.message || {};
    if (typeof m.content === 'string') push(m.content);
    else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (!b) continue;
        push(b.text); push(b.thinking);
        if (b.type === 'tool_use' && b.input !== undefined) { try { push(JSON.stringify(b.input)); } catch {} }
        if (b.type === 'tool_result') {
          if (typeof b.content === 'string') push(b.content);
          else if (Array.isArray(b.content)) for (const c of b.content) push(c?.text);
        }
      }
    }
  }
  return parts.join(' ');
}

// Build a match object for one raw JSONL line, or null if it doesn't match.
function _matchJsonlLine(raw, line, backend, q) {
  if (!raw || raw.toLowerCase().indexOf(q) === -1) return null; // cheap pre-filter
  let rec; try { rec = JSON.parse(raw); } catch { return null; }
  const text = _searchableTextOf(rec, backend);
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return null;
  const ts = rec.timestamp ? Date.parse(rec.timestamp) || 0 : 0;
  const role = backend === 'codex'
    ? (rec.payload?.role || rec.payload?.type || rec.type || '')
    : (rec.message?.role || rec.type || '');
  const from = Math.max(0, idx - 30);
  const preview = (from > 0 ? '…' : '') + text.slice(from, idx + q.length + 50).replace(/\s+/g, ' ') + (idx + q.length + 50 < text.length ? '…' : '');
  return { line, ts, role, preview };
}

function searchJsonlFull(fp, backend, query, maxResults = 500) {
  const q = String(query || '').toLowerCase();
  if (!q) return { matches: [], truncated: false };
  const stat = fs.statSync(fp);
  const fd = fs.openSync(fp, 'r');
  const matches = [];
  let truncated = false;
  try {
    const buf = Buffer.alloc(LINE_INDEX_CHUNK);
    let pos = 0, line = 0, carry = '';
    while (pos < stat.size && matches.length < maxResults) {
      const n = fs.readSync(fd, buf, 0, LINE_INDEX_CHUNK, pos);
      if (n <= 0) break;
      const text = carry + buf.toString('utf-8', 0, n);
      const parts = text.split('\n');
      carry = parts.pop();
      for (const raw of parts) {
        if (matches.length >= maxResults) { truncated = true; break; }
        const m = _matchJsonlLine(raw.trim(), line++, backend, q);
        if (m) matches.push(m);
      }
      pos += n;
    }
    if (matches.length >= maxResults && pos < stat.size) truncated = true;
    else if (matches.length < maxResults) { const m = _matchJsonlLine(carry.trim(), line, backend, q); if (m) matches.push(m); }
  } finally { fs.closeSync(fd); }
  return { matches, truncated };
}

// Streaming full-file search: reads the file ASYNChronously (yields to the event
// loop between chunks, so the response flushes progressively and other requests
// aren't blocked) and calls onMatch(match) as each hit is found — so the client
// can show a live "found N, still searching…" count (less-style). Returns the
// final { total, truncated } once the whole file has been scanned (or aborted).
async function searchJsonlFullStream(fp, backend, query, onMatch, opts = {}) {
  const maxResults = opts.maxResults || 500;
  const signal = opts.signal;
  const q = String(query || '').toLowerCase();
  if (!q) return { total: 0, truncated: false };
  const stat = fs.statSync(fp);
  const fh = await fs.promises.open(fp, 'r');
  let total = 0, truncated = false;
  try {
    const buf = Buffer.alloc(LINE_INDEX_CHUNK);
    let pos = 0, line = 0, carry = '';
    while (pos < stat.size && total < maxResults) {
      if (signal?.aborted) break;
      const { bytesRead } = await fh.read(buf, 0, LINE_INDEX_CHUNK, pos);
      if (bytesRead <= 0) break;
      const chunk = carry + buf.toString('utf-8', 0, bytesRead);
      const parts = chunk.split('\n');
      carry = parts.pop();
      for (const raw of parts) {
        if (total >= maxResults) { truncated = true; break; }
        const m = _matchJsonlLine(raw.trim(), line++, backend, q);
        if (m) { total++; onMatch(m); }
      }
      pos += bytesRead;
    }
    if (total >= maxResults && pos < stat.size) truncated = true;
    else if (total < maxResults && !signal?.aborted) { const m = _matchJsonlLine(carry.trim(), line, backend, q); if (m) { total++; onMatch(m); } }
  } finally { await fh.close(); }
  return { total, truncated };
}

// Read raw records for line range [startLine, endLine) by seeking to the
// indexed byte offsets — no full-file read, no string-limit risk.
function readJsonlLineRange(fp, startLine, endLine) {
  const { offsets, totalLines, size } = getJsonlLineIndex(fp);
  const s = Math.max(0, Math.min(startLine, totalLines));
  const e = Math.max(s, Math.min(endLine, totalLines));
  if (e <= s) return [];
  const startByte = offsets[s];
  const endByte = e < totalLines ? offsets[e] : size;
  const len = endByte - startByte;
  if (len <= 0) return [];
  const fd = fs.openSync(fp, 'r');
  try {
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, startByte);
    const text = buf.toString('utf-8', 0, n);
    const records = [];
    let li = s;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      const curLine = li++;
      if (!trimmed) continue;
      try { const rec = JSON.parse(trimmed); rec.__line = curLine; records.push(rec); } catch {}
    }
    return records;
  } finally { fs.closeSync(fd); }
}


function parseCodexSessionJsonl(threadId) {
  const fp = findCodexSessionJsonlPath(threadId);
  if (!fp) return [];
  const messages = [];
  try {
    // Tail-only: earlier history is seek-loaded on scroll (no seam marker).
    const content = readJsonlBounded(fp, { tailOnly: true });
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { messages.push(JSON.parse(trimmed)); } catch {}
    }
  } catch {}
  return messages;
}

function formatCodexRoleLabel(role) {
  const value = String(role || '').trim();
  if (!value) return '';
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function normalizeCodexSource(source) {
  if (typeof source === 'string') {
    return {
      raw: source,
      sourceKind: source,
      agentKind: 'primary',
      agentRole: '',
      agentNickname: '',
      parentThreadId: null,
    };
  }

  const subAgent = source?.subAgent || source?.subagent || source?.sub_agent || null;
  const spawn = subAgent?.thread_spawn || subAgent?.threadSpawn || source?.thread_spawn || null;
  if (spawn) {
    return {
      raw: source,
      sourceKind: 'subagent',
      agentKind: 'subagent',
      agentRole: spawn.agent_role || '',
      agentNickname: spawn.agent_nickname || '',
      parentThreadId: spawn.parent_thread_id || null,
    };
  }

  if (subAgent === 'review') {
    return {
      raw: source,
      sourceKind: 'review',
      agentKind: 'review',
      agentRole: source?.agentRole || source?.agent_role || '',
      agentNickname: source?.agentNickname || source?.agent_nickname || '',
      parentThreadId: source?.parentThreadId || source?.parent_thread_id || null,
    };
  }

  const review = source?.review || source?.review_mode || null;
  if (review) {
    return {
      raw: source,
      sourceKind: 'review',
      agentKind: 'review',
      agentRole: review.agent_role || '',
      agentNickname: review.agent_nickname || '',
      parentThreadId: review.parent_thread_id || null,
    };
  }

  return {
    raw: source || null,
    sourceKind: source ? 'structured' : null,
    agentKind: 'primary',
    agentRole: source?.agentRole || source?.agent_role || '',
    agentNickname: source?.agentNickname || source?.agent_nickname || '',
    parentThreadId: source?.parentThreadId || source?.parent_thread_id || null,
  };
}

function deriveCodexSessionName(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  const lowerValue = value.toLowerCase();
  const injectedBlockMarkers = [
    '# agents.md instructions for ',
    '<instructions>',
    '<environment_context>',
    '<permissions instructions>',
    '<apps_instructions>',
    '<skills_instructions>',
    '<plugins_instructions>',
    '### available skills',
    '### available plugins',
  ];
  if (injectedBlockMarkers.some((marker) => lowerValue.includes(marker))) return '';
  const instructionMarkers = new Set([
    '<INSTRUCTIONS>',
    '</INSTRUCTIONS>',
    '<environment_context>',
    '</environment_context>',
    '<permissions instructions>',
    '</permissions instructions>',
    '<apps_instructions>',
    '</apps_instructions>',
    '<skills_instructions>',
    '</skills_instructions>',
    '<collaboration_mode>',
    '</collaboration_mode>',
  ]);
  const ignoreLine = (line) => (
    !line
    || line.startsWith('# AGENTS.md instructions')
    || line.startsWith('<system>')
    || instructionMarkers.has(line)
    || /^<(environment_context|permissions instructions|apps_instructions|skills_instructions|plugins_instructions|collaboration_mode)/.test(line)
    || /^<\/(environment_context|permissions instructions|apps_instructions|skills_instructions|plugins_instructions|collaboration_mode)/.test(line)
    || /^## (JavaScript REPL|Skills|Plugins)\b/.test(line)
    || /^<\/?[A-Z_]+>$/.test(line)
  );
  const firstLine = value
    .split('\n')
    .map((line) => line.trim())
    .find((line) => !ignoreLine(line)) || '';
  return firstLine.slice(0, 120);
}

function deriveCodexReviewName(target, hint) {
  const type = String(target?.type || '').trim();
  if (!type) return 'Review';

  if (type === 'uncommittedChanges' || type === 'workingTree') {
    return 'Review: Working Tree';
  }
  if (type === 'baseBranch') {
    const branch = String(target.branch || target.baseBranch || target.base_branch || '').trim();
    return branch ? `Review: ${branch}`.slice(0, 120) : 'Review: Base Branch';
  }
  if (type === 'commit') {
    const sha = String(target.sha || target.commit || target.commitSha || '').trim();
    return sha ? `Review: ${sha.slice(0, 12)}` : 'Review: Commit';
  }
  if (type === 'custom') {
    const custom = deriveCodexSessionName(hint || target.instructions || '');
    return custom ? `Review: ${custom}`.slice(0, 120) : 'Review: Custom';
  }

  const fallback = deriveCodexSessionName(hint || target.instructions || '');
  return fallback ? `Review: ${fallback}`.slice(0, 120) : 'Review';
}

function deriveCodexAgentName(agentKind, agentRole, agentNickname) {
  const roleLabel = formatCodexRoleLabel(agentRole);
  const nick = String(agentNickname || '').trim();

  if (agentKind === 'review') return 'Review';
  if (agentKind === 'subagent') {
    if (nick && roleLabel) return `${nick} (${roleLabel})`.slice(0, 120);
    if (nick) return nick.slice(0, 120);
    if (roleLabel) return `Subagent: ${roleLabel}`.slice(0, 120);
    return 'Subagent';
  }

  if (nick && roleLabel) return `${nick} (${roleLabel})`.slice(0, 120);
  if (nick) return nick.slice(0, 120);
  if (roleLabel) return roleLabel.slice(0, 120);
  return '';
}

// mtime-keyed cache: listCodexThreads runs extractCodexThreadMeta on EVERY
// thread JSONL per /api/sessions poll (and per user-state normalization) —
// uncached this re-read+re-parsed the entire ~/.codex/sessions tree each time.
// Mirrors the Claude side's _sessionMetaCache.
const _threadMetaCache = new Map(); // filePath -> { mtimeMs, meta }
const THREAD_META_HEAD_BYTES = 262144; // session_meta + first user msg live at the head

function extractCodexThreadMeta(filePath) {
  let cachedStat = null;
  try {
    cachedStat = fs.statSync(filePath);
    const hit = _threadMetaCache.get(filePath);
    if (hit && hit.mtimeMs === cachedStat.mtimeMs) return hit.meta;
  } catch {}
  let threadId = '';
  let cwd = '';
  let name = '';
  let updatedAt = 0;
  let source = null;
  let sourceMeta = normalizeCodexSource(null);
  let forkedFromId = null;
  let forkedFromChain = null;
  let sessionAgentRole = '';
  let sessionAgentNickname = '';
  let reviewDetected = false;
  let reviewTarget = null;
  let reviewHint = '';
  let firstUserName = '';
  let scannedRecords = 0;
  let extractFailed = false;
  try {
    const stat = cachedStat || fs.statSync(filePath);
    updatedAt = stat.mtimeMs || 0;
    // Head read only — all meta-bearing records are at the start; reading
    // multi-MB session files whole just to break at record 200 wasted IO
    let head;
    if (stat.size > THREAD_META_HEAD_BYTES) {
      const fd = fs.openSync(filePath, 'r');
      try {
        const buf = Buffer.alloc(THREAD_META_HEAD_BYTES);
        const n = fs.readSync(fd, buf, 0, THREAD_META_HEAD_BYTES, 0);
        head = buf.toString('utf-8', 0, n);
        head = head.slice(0, head.lastIndexOf('\n') + 1); // drop the cut-off last line
      } finally { fs.closeSync(fd); }
    } else {
      head = fs.readFileSync(filePath, 'utf-8');
    }
    for (const line of head.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      scannedRecords++;
      let msg = null;
      try { msg = JSON.parse(trimmed); } catch { continue; }

      if (msg.type === 'session_meta') {
        if (!threadId) threadId = msg.payload?.id || '';
        cwd = msg.payload?.cwd || cwd;
        const explicitName = deriveCodexSessionName(
          msg.payload?.session_name
          || msg.payload?.sessionName
          || msg.payload?.name
          || msg.payload?.threadName
          || '',
        );
        if (explicitName) name = explicitName;
        forkedFromId = msg.payload?.forked_from_id || forkedFromId;
        if (Array.isArray(msg.payload?.forked_from)) forkedFromChain = msg.payload.forked_from;
        if (!source) {
          source = msg.payload?.source || null;
          sourceMeta = normalizeCodexSource(source);
        }
        sessionAgentRole = msg.payload?.agent_role || msg.payload?.agentRole || sessionAgentRole;
        sessionAgentNickname = msg.payload?.agent_nickname || msg.payload?.agentNickname || sessionAgentNickname;
        continue;
      }

      if (msg.type === 'event_msg') {
        const eventType = msg.payload?.type || '';
        if (eventType === 'entered_review_mode') {
          reviewDetected = true;
          reviewTarget = msg.payload?.target || reviewTarget;
          reviewHint = msg.payload?.user_facing_hint || reviewHint;
        }
        if (eventType === 'review_started' && !reviewTarget) {
          reviewTarget = msg.payload?.target || reviewTarget;
        }
      }

      if (msg.type === 'response_item' && msg.payload?.type === 'enteredReviewMode') {
        reviewDetected = true;
        reviewTarget = msg.payload?.target || reviewTarget;
        reviewHint = msg.payload?.userFacingHint || msg.payload?.user_facing_hint || reviewHint;
      }

      if (!firstUserName && msg.type === 'response_item' && msg.payload?.type === 'message' && msg.payload?.role === 'user') {
        const content = msg.payload?.content || [];
        const firstText = content
          .filter((item) => item.type === 'input_text')
          .map((item) => item.text || '')
          .find((text) => deriveCodexSessionName(text)) || '';
        const nextName = deriveCodexSessionName(firstText);
        if (nextName) firstUserName = nextName;
      }

      if (scannedRecords >= 200 && threadId && cwd && (firstUserName || reviewDetected || sourceMeta.agentKind !== 'primary')) {
        break;
      }
    }
  } catch { extractFailed = true; }

  if (!sourceMeta.agentRole && sessionAgentRole) sourceMeta.agentRole = sessionAgentRole;
  if (!sourceMeta.agentNickname && sessionAgentNickname) sourceMeta.agentNickname = sessionAgentNickname;
  if (!sourceMeta.parentThreadId && forkedFromId && sourceMeta.agentKind !== 'primary') {
    sourceMeta.parentThreadId = forkedFromId;
  }

  if (reviewDetected || sourceMeta.agentKind === 'review') {
    sourceMeta = {
      ...sourceMeta,
      sourceKind: 'review',
      agentKind: 'review',
      parentThreadId: sourceMeta.parentThreadId || forkedFromId || null,
    };
    name = deriveCodexReviewName(reviewTarget, reviewHint || firstUserName);
  } else if (sourceMeta.agentKind === 'subagent') {
    name = deriveCodexAgentName(sourceMeta.agentKind, sourceMeta.agentRole, sourceMeta.agentNickname) || firstUserName;
  } else if (!name) {
    name = firstUserName || deriveCodexAgentName(sourceMeta.agentKind, sourceMeta.agentRole, sourceMeta.agentNickname);
  }

  const meta = {
    threadId,
    cwd,
    name,
    updatedAt,
    source,
    sourceKind: sourceMeta.sourceKind,
    agentKind: sourceMeta.agentKind,
    agentRole: sourceMeta.agentRole,
    agentNickname: sourceMeta.agentNickname,
    parentThreadId: sourceMeta.parentThreadId,
    forkedFrom: forkedFromChain || [],
  };
  // NEVER cache a failed extraction: a transient IO error (EMFILE under fd
  // pressure, mid-write race) would otherwise be cached keyed by the file's
  // current mtime — and if the session never writes again (terminated), the
  // empty threadId is cached FOREVER and the thread silently vanishes from
  // discovery until a server restart.
  if (cachedStat && !extractFailed) {
    _threadMetaCache.set(filePath, { mtimeMs: cachedStat.mtimeMs, meta });
    // Bounded: evict oldest entries past 2000 files
    if (_threadMetaCache.size > 2000) {
      const firstKey = _threadMetaCache.keys().next().value;
      _threadMetaCache.delete(firstKey);
    }
  }
  return meta;
}

class CodexAdapter extends BackendAdapter {
  constructor(config = {}) {
    super();
    this.config = config;
  }


  /**
   * Build session args for Codex terminal/chat modes.
   */
  buildSessionArgs(options) {
    const { cwd, model, effort, permissionMode, resumeId, fork = false, extraArgs = [], mode = 'terminal', initialPrompt = '' } = options;
    const resolvedPermission = resolveCodexPermissionMode(permissionMode, {
      sandboxSupported: this.config.codexSandboxSupported !== false,
    });

    if (mode === 'chat') {
      return {
        cmd: this.config.codexCmd || 'codex',
        args: ['app-server', ...extraArgs],
        wrapper: this.config.chatWrapper,
        cwd: cwd || os.homedir(),
        mode,
        env: {
          CODEX_WEBUI_MODEL: model || '',
          CODEX_WEBUI_EFFORT: effort || '',
          CODEX_WEBUI_RESUME_ID: resumeId || '',
          CODEX_WEBUI_FORK: fork ? '1' : '',
          CODEX_WEBUI_PERMISSION_MODE: resolvedPermission.permissionMode,
          CODEX_WEBUI_REQUESTED_PERMISSION_MODE: resolvedPermission.requestedPermissionMode || '',
          CODEX_WEBUI_PERMISSION_FALLBACK: resolvedPermission.degradedReason || '',
          CODEX_WEBUI_APPROVAL_POLICY: resolvedPermission.approvalPolicy,
          CODEX_WEBUI_SANDBOX: resolvedPermission.sandbox,
          CODEX_WEBUI_CWD: cwd || os.homedir(),
          CODEX_WEBUI_SESSION_NAME: options.sessionName || '',
        },
        permission: resolvedPermission,
      };
    }

    const commonArgs = [];
    if (model) commonArgs.push('--model', model);
    pushCodexConfigOverride(commonArgs, 'model_reasoning_effort', effort);
    if (resolvedPermission.approvalPolicy) commonArgs.push('--ask-for-approval', resolvedPermission.approvalPolicy);
    if (resolvedPermission.sandbox) commonArgs.push('--sandbox', resolvedPermission.sandbox);
    if (extraArgs.length) commonArgs.push(...extraArgs);

    const args = resumeId
      ? ['resume', ...commonArgs, resumeId]
      : [...commonArgs];

    if (initialPrompt) args.push(initialPrompt);

    return {
      cmd: this.config.codexCmd || 'codex',
      args,
      wrapper: this.config.ptyWrapper,
      cwd: cwd || os.homedir(),
      mode,
      permission: resolvedPermission,
    };
  }

  // ── Protocol formatting (called by ws-handler) ──

  formatChatInput(text, msgId) {
    const stdinPayload = JSON.stringify({ type: 'chat-input', text, msgId });
    const userMsg = CodexAdapter._buildUserPreview(text, msgId);
    return { stdinPayload, userMsg };
  }

  formatInterrupt() {
    return JSON.stringify({ type: 'interrupt' });
  }

  postInterrupt() {} // no SIGINT fallback needed

  formatPermissionResponse(data) {
    // requestUserInput answers arrive from the unified AskUserQuestion UI as
    // toolInput.answers (same shape as Claude); the wrapper expects them in
    // responseData.{decision,answers} — translate here so running wrappers
    // (which persist inside dtach across server restarts) need no change.
    let responseData = data.responseData || null;
    if (!responseData && data.toolInput?.answers) {
      responseData = {
        decision: data.approved ? 'accept' : (data.abort ? 'cancel' : 'decline'),
        answers: data.toolInput.answers,
      };
    }
    return JSON.stringify({
      type: 'permission-response',
      requestId: data.requestId,
      approved: !!data.approved,
      alwaysAllow: Array.isArray(data.permissionUpdates) && data.permissionUpdates.length > 0,
      abort: !!data.abort,
      responseData,
    });
  }

  formatSetPermissionMode(mode) {
    return JSON.stringify({ type: 'set-permission-mode', mode });
  }

  // Mid-session model switch: the wrapper stores it in meta.model, which is
  // passed on every turn/start — takes effect from the next turn.
  formatSetModel(model) {
    return JSON.stringify({ type: 'set-model', model });
  }

  // Mid-session effort switch: wrapper stores it and passes it on the next
  // turn/start (effort is a per-turn param, like model).
  formatSetEffort(effort) {
    return JSON.stringify({ type: 'set-effort', effort });
  }

  /** Build a preview user message for buffer before JSONL arrives */
  static _buildUserPreview(rawText, msgId) {
    let text = typeof rawText === 'string' ? rawText : '';
    const attachments = [];
    try {
      const parsed = JSON.parse(text);
      if (parsed?.type === 'user' && parsed.message) {
        text = '';
        for (const block of parsed.message.content || []) {
          if (block.type === 'text' && block.text) text = block.text;
          if (block.type === 'image' && block.source?.data) {
            attachments.push({ type: 'input_image', image_url: `data:${block.source.media_type || 'image/png'};base64,${block.source.data}` });
          }
        }
      }
    } catch {}
    const content = [
      ...attachments.map(a => ({ type: 'input_image', image_url: a.image_url })),
      ...(text ? [{ type: 'input_text', text }] : []),
    ];
    if (!content.length) return null;
    return { timestamp: new Date().toISOString(), type: 'response_item', _fromWebui: true, payload: { type: 'message', role: 'user', webui_msg_id: msgId || '', content } };
  }
}

module.exports = {
  CODEX_SESSIONS_DIR,
  CodexAdapter,
  findCodexSessionJsonlPath,
  normalizeCodexSource,
  parseCodexSessionJsonl,
  extractCodexThreadMeta,
  readJsonlBounded,
  jsonlGapInfo,
  readJsonlLineRange,
  scanJsonlUserTurns,
  searchJsonlFull,
  searchJsonlFullStream,
};

/**
 * Session API routes — discovery, active list, message history, subagent messages, kill.
 * Lock-first discovery algorithm + JSONL parsing for chat history.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');

const router = express.Router();

const {
  SESSIONS_DIR, isPidAlive, cwdToProjectDir, recoverCwdFromProjDir,
  getTmuxPaneMap, findTmuxTarget, isProcessClaude,
  extractSessionMeta, isSubagentMessage,
} = require('../session-store');
const { createMessageManager } = require('../normalizers');
const { listCodexThreads } = require('../codex-session-store');
const { findSessionJsonlPath } = require('../session-store');
const { findCodexSessionJsonlPath, jsonlGapInfo, readJsonlLineRange, scanJsonlUserTurns, searchJsonlFull } = require('../adapters/codex');

function getSessionKey(session = {}) {
  const backend = session.backend || 'claude';
  const backendSessionId = session.backendSessionId || session.sessionId || session.claudeSessionId || null;
  return backendSessionId ? `${backend}:${backendSessionId}` : '';
}

function withSessionKey(session = {}) {
  return {
    ...session,
    sessionKey: session.sessionKey || getSessionKey(session),
  };
}

/** Setup session routes. Requires ctx object with dependencies. */
function setup(ctx) {
  const { activeSessions, webuiPids, refreshWebuiPids, createSessionMessages, BUFFERS_DIR, PERMISSION_MODES, execFileSync } = ctx;

  // Get chat message history for a Claude session (JSONL + optional buffer)
  router.get('/api/session-messages', (req, res) => {
    const { backend, backendSessionId, claudeSessionId, cwd, offset, limit, search } = req.query;
    const resolvedBackend = backend || 'claude';
    const resolvedSessionId = backendSessionId || claudeSessionId;
    if (!resolvedSessionId) return res.status(400).json({ error: 'backendSessionId or claudeSessionId required' });

    // Use session's existing normalizer if available (cached); else build on-demand
    let session = null;
    for (const [, s] of activeSessions) {
      if (s.backend !== resolvedBackend) continue;
      if ((s.backendSessionId || s.claudeSessionId) === resolvedSessionId) { session = s; break; }
    }
    let mm;
    // Only trust the live normalizer once the WS attach path has loaded the
    // full JSONL into it (_historyLoaded). After a server restart, processLive
    // can populate it with partial buffer data first — serving that here
    // truncated history/search/turnmap to a handful of buffer messages.
    if (session?._normalizer && session._normalizer.total > 0 && session._historyLoaded) {
      mm = session._normalizer;
    } else {
      const sm = createSessionMessages(session || {
        backend: resolvedBackend,
        backendSessionId: resolvedSessionId,
        claudeSessionId: resolvedBackend === 'claude' ? resolvedSessionId : null,
        cwd: cwd || '',
        buffer: '',
      });
      mm = createMessageManager(resolvedBackend, 'api');
      mm.convertHistory(sm.raw());
    }

    if (req.query.turnmap) {
      res.json({ turns: mm.turnMap(), total: mm.total });
      return;
    }
    if (search) {
      res.json({ matches: mm.search(search), total: mm.total });
      return;
    }

    let payload;
    if (req.query.untilUuid) {
      // Fork-from-here: return the conversation truncated at the given message
      // (matches claude --resume-session-at), last 50 of that range for the
      // initial view; total=upto so scroll-up pagination still loads older.
      const idx = mm.messages.findIndex(m => m.uuid === req.query.untilUuid);
      const upto = idx >= 0 ? idx + 1 : mm.total;
      const start = Math.max(0, upto - 50);
      payload = { messages: mm.messages.slice(start, upto), total: upto };
    } else if (offset !== undefined || limit !== undefined) {
      const o = parseInt(offset) || 0;
      const l = parseInt(limit) || 50;
      payload = { messages: mm.slice(o, l), total: mm.total };
    } else {
      payload = { messages: mm.tail(50), total: mm.total };
    }
    if (req.query.withStatus) {
      const sm = createSessionMessages(session || {
        backend: resolvedBackend,
        backendSessionId: resolvedSessionId,
        claudeSessionId: resolvedBackend === 'claude' ? resolvedSessionId : null,
        cwd: cwd || '',
        buffer: '',
      });
      payload.chatStatus = sm.chatStatus();
      // Permission mode isn't recoverable from the JSONL — merge the mode the
      // live session was started with (covers freshly resumed sessions)
      if (session?._permissionMode && payload.chatStatus && !payload.chatStatus.permissionMode) {
        payload.chatStatus.permissionMode = session._permissionMode;
      }
      payload.taskState = sm.taskState?.() || null;
      payload.turnMap = mm.turnMap();
    }
    res.json(payload);
  });

  // ── Whole-file seek loading for huge JSONL files ──
  // Initial attach loads TAIL-only (see readJsonlBounded tailOnly). This endpoint
  // seek-reads any earlier line range by byte offset (via a cached line index)
  // and normalizes just that raw-record slab, so the client scrolls backward
  // through history too large to hold fully in memory, as one continuous virtual
  // list (no seam marker).
  //   ?...&info=1               -> { gap:{ tailStartLine, totalLines } } or { gap:null }
  //   ?...&endLine=N&count=C    -> { messages, fromLine, toLine } (records [max(0,N-C), N))
  //   ?...&startLine=N&count=C  -> { messages, fromLine, toLine } (records [N, N+C))
  // _tailIndexFor maps the loaded tail to normalized indices so a full-file
  // search hit in the tail jumps precisely via jumpToIndex; earlier-history hits
  // seek-load by file line. Cached by mtime+size (a 32MB normalize is expensive).
  const _boundedIdxCache = new Map();
  const _tailIndexFor = (fp, backend, gap) => {
    const stat = fs.statSync(fp);
    const hit = _boundedIdxCache.get(fp);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit;
    // The client's registered window is now tail-ONLY (readJsonlBounded tailOnly),
    // so normalizing readJsonlLineRange(tailStartLine, totalLines) here reproduces
    // the client's index space EXACTLY - no head/seam, no drift. Records carry
    // __line so each message gets srcLine for line->index.
    let tailRecs = readJsonlLineRange(fp, gap.tailStartLine, gap.totalLines);
    // Match parseSessionJsonl: subagent records are filtered before normalizing.
    tailRecs = tailRecs.filter((r) => !isSubagentMessage(r));
    const mm = createMessageManager(backend, 'tidx');
    mm.convertHistory(tailRecs);
    const lineIdx = [];
    for (let i = 0; i < mm.messages.length; i++) {
      const m = mm.messages[i];
      if (Number.isFinite(m.srcLine)) lineIdx.push({ line: m.srcLine, index: i });
    }
    const result = { mtimeMs: stat.mtimeMs, size: stat.size, lineIdx };
    _boundedIdxCache.set(fp, result);
    if (_boundedIdxCache.size > 8) _boundedIdxCache.delete(_boundedIdxCache.keys().next().value);
    return result;
  };
  // Nearest tail message index at or before `line` (or null when the line is
  // below the tail - i.e. seek-loadable earlier history).
  const _indexForLine = (bidx, line, gap) => {
    if (line < gap.tailStartLine) return null; // earlier history -> seek by line
    let lo = 0, hi = bidx.lineIdx.length - 1, best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bidx.lineIdx[mid].line <= line) { best = bidx.lineIdx[mid].index; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  };

  router.get('/api/session-history-gap', (req, res) => {
    const { backend, backendSessionId, claudeSessionId, cwd } = req.query;
    const resolvedBackend = backend || 'claude';
    const resolvedSessionId = backendSessionId || claudeSessionId;
    if (!resolvedSessionId) return res.status(400).json({ error: 'backendSessionId or claudeSessionId required' });

    const fp = resolvedBackend === 'codex'
      ? findCodexSessionJsonlPath(resolvedSessionId)
      : findSessionJsonlPath(resolvedSessionId, cwd || '');
    if (!fp || !fs.existsSync(fp)) return res.json({ gap: null });

    let gap;
    try { gap = jsonlGapInfo(fp); } catch { gap = null; }
    if (!gap) return res.json({ gap: null });

    if (req.query.info) {
      return res.json({ gap });
    }

    // Full-file streaming search: covers the whole file uniformly in {line, ts}
    // coordinates, so huge sessions search like small ones. Matches in the loaded
    // tail also get an exact normalized index (jumpToIndex, no drift); matches in
    // earlier history carry only {line} and are seek-loaded by file line.
    if (req.query.search) {
      let result = { matches: [], truncated: false };
      try { result = searchJsonlFull(fp, resolvedBackend, req.query.search); } catch {}
      try {
        const bidx = _tailIndexFor(fp, resolvedBackend, gap);
        for (const m of result.matches) {
          const i = _indexForLine(bidx, m.line, gap);
          if (i != null) m.index = i;
        }
      } catch {}
      return res.json({ ...result, ...gap });
    }

    // Whole-conversation minimap: full-file user-turn scan in TIME coordinates
    // (markers) + each turn's file line (for seek-jumping into the gap).
    if (req.query.fullturnmap) {
      let turns = [];
      try { turns = scanJsonlUserTurns(fp, resolvedBackend); } catch { turns = []; }
      const firstTs = turns.length ? turns[0].ts : 0;
      const lastTs = turns.length ? turns[turns.length - 1].ts : 0;
      return res.json({ fullTurns: turns, firstTs, lastTs, ...gap });
    }

    const count = Math.min(parseInt(req.query.count) || 2000, 8000);
    const endLine = parseInt(req.query.endLine);
    const startLine = parseInt(req.query.startLine);
    let fromLine, toLine;
    // whole=1: seek anywhere in [0, totalLines) — used for jump/teleport, which
    // reads by ABSOLUTE file line (immune to the tail sliding on a live session).
    // Default clamps to [0, tailStartLine): the tail is the registered window, so
    // continuous scroll-up only loads earlier history and never re-reads the tail.
    const ceil = req.query.whole ? gap.totalLines : gap.tailStartLine;
    if (Number.isFinite(startLine)) {
      // Forward read (jump): records [startLine, startLine+count).
      fromLine = Math.max(0, Math.min(startLine, ceil));
      toLine = Math.min(ceil, fromLine + count);
    } else if (Number.isFinite(endLine)) {
      // Backward read (scroll-up auto-load): records [endLine-count, endLine).
      toLine = Math.min(endLine, ceil);
      fromLine = Math.max(0, toLine - count);
    } else {
      return res.status(400).json({ error: 'endLine or startLine required' });
    }
    if (fromLine >= toLine) return res.json({ messages: [], fromLine: 0, toLine: 0, tailStartLine: gap.tailStartLine });

    let records = [];
    try { records = readJsonlLineRange(fp, fromLine, toLine); } catch { records = []; }
    // Match the display path: drop subagent records before normalizing.
    records = records.filter((r) => !isSubagentMessage(r));
    // Normalize the slab in isolation. Tool calls whose result is outside this
    // window render as orphans (acceptable for read-only history browsing).
    const mm = createMessageManager(resolvedBackend, 'gap');
    mm.convertHistory(records);
    res.json({ messages: mm.tail(mm.total), fromLine, toLine, tailStartLine: gap.tailStartLine, totalLines: gap.totalLines });
  });

  // Subagent messages for a given session + agentId
  router.get('/api/subagent-messages', (req, res) => {
    const { claudeSessionId, cwd, agentId } = req.query;
    if (!claudeSessionId || !agentId) return res.status(400).json({ error: 'claudeSessionId and agentId required' });
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const projDir = cwdToProjectDir(cwd || '');
    // Try exact project dir, then scan all
    const candidates = [];
    if (cwd) candidates.push(path.join(projectsDir, projDir, claudeSessionId, 'subagents', `agent-${agentId}.jsonl`));
    try {
      for (const dir of fs.readdirSync(projectsDir)) {
        const fp = path.join(projectsDir, dir, claudeSessionId, 'subagents', `agent-${agentId}.jsonl`);
        if (!candidates.includes(fp)) candidates.push(fp);
      }
    } catch {}
    for (const filePath of candidates) {
      try {
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf-8');
        const rawMsgs = [];
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try { const msg = JSON.parse(trimmed); rawMsgs.push(msg); } catch {}
        }
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(filePath.replace('.jsonl', '.meta.json'), 'utf-8')); } catch {}
        const mm = createMessageManager('claude', `sub-agent-${agentId}`);
        mm.convertHistory(rawMsgs);
        return res.json({ messages: mm.messages, total: mm.total, meta });
      } catch {}
    }
    res.json({ messages: [], total: 0, meta: {} });
  });

  router.post('/api/kill-pid', (req, res) => {
    const { pid } = req.body;
    if (!pid || typeof pid !== 'number') return res.status(400).json({ error: 'pid required' });
    try {
      if (!isProcessClaude(pid)) return res.status(400).json({ error: 'PID is not a claude process' });
      process.kill(pid, 'SIGTERM');
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Short response cache: discovery spawns sync subprocesses (pgrep/tmux) and
  // scans lock files + project dirs — with several clients polling, each poll
  // paid the full cost. 2s TTL collapses concurrent polls into one scan.
  let _sessionsCache = null;
  let _sessionsCacheAt = 0;

  router.get('/api/sessions', (req, res) => {
    try {
      if (_sessionsCache && Date.now() - _sessionsCacheAt < 2000) return res.json(_sessionsCache);
      const projectsDir = path.join(os.homedir(), '.claude', 'projects');

      // Step 0: Use cached webuiPids (updated on session create/kill/restore)

      // Step 1: Scan lock files + tmux panes -> build map of RUNNING sessions
      // Build webuiPid -> claudeSessionId map for precise JSONL matching
      const webuiPidToSessionId = new Map();
      for (const [id, s] of activeSessions) {
        if (s.claudeSessionId) {
          // Map childPid + its direct children (claude forks from node-pty spawn)
          if (s._childPid) {
            webuiPidToSessionId.set(s._childPid, s.claudeSessionId);
            try {
              const ch = execFileSync('pgrep', ['-P', String(s._childPid)], { encoding: 'utf-8', timeout: 2000 }).trim();
              for (const line of ch.split('\n')) { const p = parseInt(line.trim()); if (p) webuiPidToSessionId.set(p, s.claudeSessionId); }
            } catch {}
          }
        }
      }

      const paneMap = getTmuxPaneMap();
      const runningByProjDir = new Map(); // projDirName -> [{lock, tmuxTarget, assigned, claudeSessionId}]
      if (fs.existsSync(SESSIONS_DIR)) {
        for (const f of fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'))) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'));
            if (!isPidAlive(data.pid)) continue;
            if (!isProcessClaude(data.pid)) continue;
            const projDirName = cwdToProjectDir(data.cwd);
            const tmuxTarget = findTmuxTarget(data.pid, paneMap);
            const claudeSessionId = webuiPidToSessionId.get(data.pid) || null;
            if (!runningByProjDir.has(projDirName)) runningByProjDir.set(projDirName, []);
            runningByProjDir.get(projDirName).push({ lock: data, tmuxTarget, assigned: false, claudeSessionId });
          } catch {}
        }
      }

      // Step 2: Scan JSONL files, match with running locks
      const sessions = [];
      const sessionMap = new Map(); // sessionId → index in sessions[] (dedup: running wins over stopped)
      if (fs.existsSync(projectsDir)) {
        for (const projDir of fs.readdirSync(projectsDir)) {
          const projPath = path.join(projectsDir, projDir);
          try { if (!fs.statSync(projPath).isDirectory()) continue; } catch { continue; }

          // Pre-fetch stats for sorting + mtime lookup
          const jsonls = fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
          const statMap = new Map();
          for (const f of jsonls) {
            try { statMap.set(f, fs.statSync(path.join(projPath, f)).mtimeMs); } catch { statMap.set(f, 0); }
          }
          // Sort by mtime desc so most recent JSONL gets the running lock
          jsonls.sort((a, b) => (statMap.get(b) || 0) - (statMap.get(a) || 0));

          // Check if there are running locks for this project dir
          const runningEntries = runningByProjDir.get(projDir) || [];

          for (const f of jsonls) {
            const sessionId = f.replace('.jsonl', '');
            const filePath = path.join(projPath, f);
            const mtime = statMap.get(f) || 0;

            const meta = extractSessionMeta(filePath);
            const firstRunning = runningEntries.find(e => !e.assigned);
            const cwd = (firstRunning?.lock.cwd) || meta.cwd || recoverCwdFromProjDir(projDir);

            // Match running lock to JSONL:
            // 1. If a lock has claudeSessionId (WebUI), only match to that exact JSONL
            // 2. Otherwise (tmux/external), match to most recent unassigned JSONL (sorted by mtime desc)
            let status = 'stopped', pid = null, tmuxTarget = null;
            const exactMatch = runningEntries.find(e => !e.assigned && e.claudeSessionId === sessionId);
            const fallbackMatch = runningEntries.find(e => !e.assigned && !e.claudeSessionId);
            const match = exactMatch || fallbackMatch;
            // Also check if any active webui session claims this claudeSessionId (covers race during resume)
            let isWebuiSession = false;
            if (match) isWebuiSession = webuiPids.has(match.lock.pid);
            if (!isWebuiSession) {
              for (const [, s] of activeSessions) {
                if (s.claudeSessionId === sessionId) { isWebuiSession = true; break; }
              }
            }
            if (match) {
              status = isWebuiSession ? 'live'
                : match.tmuxTarget ? 'tmux' : 'external';
              pid = match.lock.pid;
              tmuxTarget = match.tmuxTarget || null;
              match.assigned = true;
            }

            const entry = withSessionKey({
              backend: 'claude',
              backendSessionId: sessionId,
              claudeSessionId: sessionId,
              sessionId,
              cwd,
              pid,
              startedAt: mtime,
              status,
              name: meta.name || '',
              tmuxTarget,
            });

            // Deduplicate: same JSONL can appear in multiple project dirs
            if (sessionMap.has(sessionId)) {
              const existing = sessions[sessionMap.get(sessionId)];
              // Running status wins over stopped
              if (existing.status === 'stopped' && status !== 'stopped') {
                sessions[sessionMap.get(sessionId)] = entry;
              }
            } else {
              sessionMap.set(sessionId, sessions.length);
              sessions.push(entry);
            }
          }
        }
      }

      // Step 3: Running locks that didn't match any project dir (brand new, no JSONL yet)
      for (const [, entries] of runningByProjDir) {
        for (const entry of entries) {
          if (!entry.assigned && !sessionMap.has(entry.lock.sessionId)) {
            sessionMap.set(entry.lock.sessionId, sessions.length);
            sessions.push(withSessionKey({
              backend: 'claude',
              backendSessionId: entry.lock.sessionId,
              claudeSessionId: entry.lock.sessionId,
              sessionId: entry.lock.sessionId, cwd: entry.lock.cwd, pid: entry.lock.pid,
              startedAt: entry.lock.startedAt || Date.now(),
              status: (webuiPids.has(entry.lock.pid) || [...activeSessions.values()].some(s => s.claudeSessionId === entry.lock.sessionId)) ? 'live'
                : entry.tmuxTarget ? 'tmux' : 'external', name: '',
              tmuxTarget: entry.tmuxTarget || null,
            }));
          }
        }
      }

      const codexSessions = listCodexThreads({ activeSessions });
      const seenSessionKeys = new Set(sessions.map((s) => `${s.backend || 'claude'}:${s.backendSessionId || s.sessionId}`));
      for (const entry of codexSessions) {
        const key = `${entry.backend}:${entry.backendSessionId || entry.sessionId}`;
        if (seenSessionKeys.has(key)) continue;
        seenSessionKeys.add(key);
        sessions.push(withSessionKey(entry));
      }

      sessions.sort((a, b) => b.startedAt - a.startedAt);
      _sessionsCache = { sessions };
      _sessionsCacheAt = Date.now();
      res.json(_sessionsCache);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/api/active', (req, res) => {
    const sessions = [];
    for (const [id, s] of activeSessions) {
      sessions.push({
        id,
        name: s.name,
        cwd: s.cwd,
        createdAt: s.createdAt,
        backend: s.backend,
        backendSessionId: s.backendSessionId || s.claudeSessionId || null,
        sessionKey: getSessionKey(s),
        claudeSessionId: s.claudeSessionId || null,
        sourceKind: s.sourceKind || null,
        agentKind: s.agentKind || 'primary',
        agentRole: s.agentRole || '',
        agentNickname: s.agentNickname || '',
        parentThreadId: s.parentThreadId || null,
        mode: s.mode || 'terminal',
      });
    }
    res.json({ sessions });
  });
}

module.exports = { router, setup };

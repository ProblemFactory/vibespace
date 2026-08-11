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
  getTmuxPaneMapAsync, findTmuxTargetAsync, isProcessClaudeAsync, isLockClaude, execFileP,
  extractSessionMeta, isSubagentMessage,
  readJsonlTailIds, claimJsonls,
} = require('../session-store');
const { createMessageManager } = require('../normalizers');
const { listCodexThreads } = require('../codex-session-store');
const { findSessionJsonlPath } = require('../session-store');
const { findCodexSessionJsonlPath, jsonlGapInfo, jsonlGapInfoAsync, readJsonlLineRange, readJsonlLineRangeAsync, scanJsonlUserTurns, scanJsonlUserTurnsAsync, searchJsonlFull, searchJsonlFullStream } = require('../adapters/codex');

function getSessionKey(session = {}) {
  const backend = session.backend || 'claude';
  const backendSessionId = session.backendSessionId || session.sessionId || session.claudeSessionId || null;
  return backendSessionId ? `${backend}:${backendSessionId}` : '';
}

// Symlink-resolved cwd (cached): a session opened under a symlinked path (e.g.
// claude-code-webui → vibespace) must still match a Task-Group folder set on the
// real path. Only stored when it actually differs from cwd.
const _realCwdCache = new Map();
function realCwdOf(cwd) {
  if (!cwd) return null;
  if (_realCwdCache.has(cwd)) return _realCwdCache.get(cwd);
  let rp = null;
  try { const r = fs.realpathSync(cwd); if (r && r !== cwd) rp = r; } catch { /* gone/unreadable */ }
  _realCwdCache.set(cwd, rp);
  if (_realCwdCache.size > 4096) _realCwdCache.delete(_realCwdCache.keys().next().value);
  return rp;
}
function withSessionKey(session = {}) {
  const rc = realCwdOf(session.cwd);
  return {
    ...session,
    sessionKey: session.sessionKey || getSessionKey(session),
    ...(rc ? { realCwd: rc } : {}),
  };
}

/** Setup session routes. Requires ctx object with dependencies. */
function setup(ctx) {
  const { activeSessions, webuiPids, refreshWebuiPids, createSessionMessages, BUFFERS_DIR, PERMISSION_MODES, execFileSync, hosts, serverSetting } = ctx;
  // R3 (three-tier): the transcript read composite lives in ONE service —
  // this interface is the future `transcript.*` device op schema.
  const { createTranscriptService } = require('../transcript-service');
  const transcripts = createTranscriptService({ activeSessions, createSessionMessages, hosts });

  // Get chat message history for a Claude session (JSONL + optional buffer)
  router.get('/api/session-messages', async (req, res) => {
    const { backend, backendSessionId, claudeSessionId, cwd, offset, limit, search } = req.query;
    const resolvedSessionId = backendSessionId || claudeSessionId;
    if (!resolvedSessionId) return res.status(400).json({ error: 'backendSessionId or claudeSessionId required' });
    const ref = { backend: backend || 'claude', sessionId: resolvedSessionId, cwd, host: req.query.host };
    if (req.query.turnmap) return res.json(await transcripts.turnmap(ref));
    if (search) return res.json(await transcripts.searchIndexed(ref, search));
    const payload = await transcripts.page(ref, { offset, limit, untilUuid: req.query.untilUuid });
    if (req.query.withStatus) {
      const st = await transcripts.status(ref);
      payload.chatStatus = st.chatStatus;
      payload.taskState = st.taskState;
      payload.turnMap = (await transcripts.turnmap(ref)).turns;
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
  //   ?...&search=q[&stream=1]  -> full-file matches (streamed NDJSON if stream=1)
  //   ?...&fullturnmap=1        -> every user turn in TIME coordinates for the minimap

  router.get('/api/session-history-gap', async (req, res) => {
    const { backend, backendSessionId, claudeSessionId, cwd } = req.query;
    const resolvedSessionId = backendSessionId || claudeSessionId;
    if (!resolvedSessionId) return res.status(400).json({ error: 'backendSessionId or claudeSessionId required' });
    const ref = { backend: backend || 'claude', sessionId: resolvedSessionId, cwd, host: req.query.host };
    const { gap, fp, hostFetchError } = await transcripts.gapInfo(ref);
    // Carry a remote failure to the client: "no transcript" and "the machine
    // holding it was unreachable" produce the same empty view otherwise.
    if (!fp) return res.json({ gap: null, ...(hostFetchError ? { error: hostFetchError } : {}) });
    if (!gap) return res.json({ gap: null });
    if (req.query.info) return res.json({ gap });

    if (req.query.search) {
      if (req.query.stream) {
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        });
        res.write(JSON.stringify({ ...gap }) + '\n');
        const ac = new AbortController();
        req.on('close', () => ac.abort());
        try {
          const { total, truncated } = await transcripts.searchFullStream(ref, fp, req.query.search,
            (m) => { res.write(JSON.stringify(m) + '\n'); }, { signal: ac.signal });
          if (!ac.signal.aborted) res.write(JSON.stringify({ done: true, total, truncated }) + '\n');
        } catch {
          if (!ac.signal.aborted) res.write(JSON.stringify({ done: true, total: 0, truncated: false, error: true }) + '\n');
        }
        return res.end();
      }
      let result = { matches: [], truncated: false };
      try { result = transcripts.searchFull(ref, fp, req.query.search); } catch {}
      return res.json({ ...result, ...gap });
    }

    if (req.query.fullturnmap) {
      let turns = [];
      try { turns = await transcripts.fullTurnmap(ref, fp); } catch { turns = []; }
      const firstTs = turns.length ? turns[0].ts : 0;
      const lastTs = turns.length ? turns[turns.length - 1].ts : 0;
      return res.json({ fullTurns: turns, firstTs, lastTs, ...gap });
    }

    const count = Math.min(parseInt(req.query.count) || 2000, 8000);
    const endLine = parseInt(req.query.endLine);
    const startLine = parseInt(req.query.startLine);
    let fromLine, toLine;
    // whole=1: seek anywhere (jump/teleport reads by ABSOLUTE file line);
    // default clamps to [0, tailStartLine) so scroll-up never re-reads the tail.
    const ceil = req.query.whole ? gap.totalLines : gap.tailStartLine;
    if (Number.isFinite(startLine)) {
      fromLine = Math.max(0, Math.min(startLine, ceil));
      toLine = Math.min(ceil, fromLine + count);
    } else if (Number.isFinite(endLine)) {
      toLine = Math.min(endLine, ceil);
      fromLine = Math.max(0, toLine - count);
    } else {
      return res.status(400).json({ error: 'endLine or startLine required' });
    }
    if (fromLine >= toLine) return res.json({ messages: [], fromLine: 0, toLine: 0, tailStartLine: gap.tailStartLine });
    const messages = await transcripts.gapSlab(ref, fp, fromLine, toLine);
    res.json({ messages, fromLine, toLine, tailStartLine: gap.tailStartLine, totalLines: gap.totalLines });
  });

  // Subagent messages for a given session + agentId
  router.get('/api/subagent-messages', (req, res) => {
    const { claudeSessionId, cwd, agentId } = req.query;
    if (!claudeSessionId || !agentId) return res.status(400).json({ error: 'claudeSessionId and agentId required' });
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const projDir = cwdToProjectDir(cwd || '');
    // Try exact project dir, then scan all. Workflow agents live one level
    // deeper (subagents/workflows/wf_*/agent-<id>.jsonl) — include those too so
    // a workflow phase's agent opens in the SAME viewer with zero client change.
    const subDirs = [];
    if (cwd) subDirs.push(path.join(projectsDir, projDir, claudeSessionId, 'subagents'));
    try {
      for (const dir of fs.readdirSync(projectsDir)) {
        const sd = path.join(projectsDir, dir, claudeSessionId, 'subagents');
        if (!subDirs.includes(sd)) subDirs.push(sd);
      }
    } catch {}
    const candidates = [];
    for (const sd of subDirs) {
      candidates.push(path.join(sd, `agent-${agentId}.jsonl`));
      let wfRuns = []; try { wfRuns = fs.readdirSync(path.join(sd, 'workflows')); } catch {}
      for (const wf of wfRuns) candidates.push(path.join(sd, 'workflows', wf, `agent-${agentId}.jsonl`));
    }
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

  // ── Dynamic-workflow (ultracode) POST-HOC detail ────────────────────────
  // A workflow run writes ONE terminal-state snapshot at
  //   <projectDir>/<claudeSessionId>/workflows/wf_<runId>.json
  // (NOT written live — verified empirically; live progress is TUI-only). It
  // carries the phase/agent tree + per-agent state/model + token totals. Each
  // agent's transcript is a normal subagent JSONL under
  //   <claudeSessionId>/subagents/workflows/wf_<runId>/agent-<id>.jsonl
  // reachable through the existing subagent viewer (candidate lists extended
  // below + in ws-handler). runId is globally unique, so a cross-session scan
  // is a safe last resort when cwd/claudeSessionId don't pin it down.
  function findWorkflowSnapshot(runId, claudeSessionId, cwd) {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const tryPath = (p) => { try { return fs.existsSync(p) ? p : null; } catch { return null; } };
    // 1) targeted: exact project dir for the cwd
    if (claudeSessionId && cwd) {
      const hit = tryPath(path.join(projectsDir, cwdToProjectDir(cwd), claudeSessionId, 'workflows', `${runId}.json`));
      if (hit) return hit;
    }
    // 2) session id known, unknown/mismatched cwd: scan project dirs
    if (claudeSessionId) {
      try {
        for (const dir of fs.readdirSync(projectsDir)) {
          const hit = tryPath(path.join(projectsDir, dir, claudeSessionId, 'workflows', `${runId}.json`));
          if (hit) return hit;
        }
      } catch {}
    }
    // 3) last resort: runId is unique — walk every session dir
    try {
      for (const dir of fs.readdirSync(projectsDir)) {
        const base = path.join(projectsDir, dir);
        let sids = []; try { sids = fs.readdirSync(base); } catch {}
        for (const sid of sids) {
          const hit = tryPath(path.join(base, sid, 'workflows', `${runId}.json`));
          if (hit) return hit;
        }
      }
    } catch {}
    return null;
  }

  function normalizeWorkflowSnapshot(o, runId) {
    const wp = Array.isArray(o.workflowProgress) ? o.workflowProgress : [];
    const phaseMap = new Map(); // phaseIndex -> phase
    const ordered = [];
    const ensurePhase = (idx, title) => {
      let p = phaseMap.get(idx);
      if (!p) { p = { index: idx, title: title || `Phase ${idx}`, agents: [] }; phaseMap.set(idx, p); ordered.push(p); }
      else if (title && !p._titled) { p.title = title; p._titled = true; }
      return p;
    };
    for (const e of wp) if (e && e.type === 'workflow_phase') ensurePhase(e.index, e.title)._titled = true;
    const noPhase = { index: 0, title: 'Agents', agents: [] };
    for (const e of wp) {
      if (!e || e.type !== 'workflow_agent') continue;
      const pi = e.phaseIndex != null ? e.phaseIndex : 0;
      const p = pi === 0 && !phaseMap.has(0) ? noPhase : ensurePhase(pi, e.phaseTitle);
      p.agents.push({
        index: e.index || 0, label: e.label || '', model: e.model || '',
        state: e.state || 'queued', agentId: e.agentId || '',
        phaseTitle: e.phaseTitle || p.title,
      });
    }
    const phases = ordered.filter(p => p.agents.length || true);
    if (noPhase.agents.length) phases.push(noPhase);
    phases.sort((a, b) => a.index - b.index);
    for (const p of phases) { p.agents.sort((a, b) => (a.index || 0) - (b.index || 0)); delete p._titled; }
    let result = o.result;
    if (result != null && typeof result !== 'string') { try { result = JSON.stringify(result, null, 2); } catch { result = String(result); } }
    return {
      runId: o.runId || runId,
      workflowName: o.workflowName || o.summary || 'Workflow',
      summary: o.summary || '',
      status: o.status || (o.error ? 'failed' : 'completed'),
      durationMs: o.durationMs || 0,
      totalTokens: o.totalTokens || 0,
      totalToolCalls: o.totalToolCalls || 0,
      agentCount: o.agentCount || 0,
      error: o.error ? String(o.error).slice(0, 4000) : null,
      result: typeof result === 'string' ? result.slice(0, 20000) : null,
      timestamp: o.timestamp || null,
      phases,
    };
  }

  // The rich snapshot is written only at the END. While a run is in progress
  // the live signals are the per-run dir's journal.jsonl (one {started}/{result}
  // per agent, appended live) + the agent-<id>.jsonl transcripts (streamed).
  // We build a LIVE skeleton from those so the viewer works mid-run — with the
  // caveat that phase names / labels / token totals only exist in the snapshot,
  // so a running view shows agent count + per-agent state + live transcripts only.
  function findWorkflowRunDir(runId, claudeSessionId, cwd) {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const sub = (base) => path.join(base, 'subagents', 'workflows', runId);
    const tryDir = (p) => { try { return fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : null; } catch { return null; } };
    if (claudeSessionId && cwd) { const h = tryDir(sub(path.join(projectsDir, cwdToProjectDir(cwd), claudeSessionId))); if (h) return h; }
    if (claudeSessionId) { try { for (const dir of fs.readdirSync(projectsDir)) { const h = tryDir(sub(path.join(projectsDir, dir, claudeSessionId))); if (h) return h; } } catch {} }
    try {
      for (const dir of fs.readdirSync(projectsDir)) {
        const base = path.join(projectsDir, dir);
        let sids = []; try { sids = fs.readdirSync(base); } catch {}
        for (const sid of sids) { const h = tryDir(sub(path.join(base, sid))); if (h) return h; }
      }
    } catch {}
    return null;
  }

  // Journal retry chains (2.181.1, real confusion report): the harness
  // re-spawns an agent whose API stream aborted — SAME journal `key`, NEW
  // agentId. Every non-newest attempt of a key without its own result is a
  // DEAD superseded attempt (its transcript dead-ends in "[Request
  // interrupted by user]") — label it instead of showing a bare interrupt.
  function journalAttemptsFromText(text) {
    const started = new Set(), done = new Set();
    const keyOf = new Map(), lastAttempt = new Map();
    for (const line of String(text || '').split('\n')) {
      const t = line.trim(); if (!t) continue;
      let o; try { o = JSON.parse(t); } catch { continue; }
      if (!o.agentId) continue;
      if (o.type === 'started') {
        started.add(o.agentId);
        if (o.key) { keyOf.set(o.agentId, o.key); lastAttempt.set(o.key, o.agentId); }
      } else if (o.type === 'result') done.add(o.agentId);
    }
    const superseded = new Set();
    for (const [id, k] of keyOf) { if (!done.has(id) && lastAttempt.get(k) !== id) superseded.add(id); }
    return { started, done, superseded };
  }
  function journalAttempts(runDir) {
    let text = '';
    try { text = fs.readFileSync(path.join(runDir, 'journal.jsonl'), 'utf-8'); } catch {}
    return journalAttemptsFromText(text);
  }

  // Pure core shared by the local reader and the remote (?host=) branch
  // (2.191.0): the live skeleton built from a journal-attempts object, the
  // run dir's file inventory, and the persisted script filename.
  function liveWorkflowFromParts({ runId, attempts, agentFiles = [], scriptName = '' }) {
    const { started, done, superseded } = attempts;
    // A transcript file can exist before its journal 'started' line lands.
    for (const f of agentFiles) { const m = String(f).match(/^agent-([0-9a-f]+)\.jsonl$/); if (m) started.add(m[1]); }
    const name = scriptName && scriptName.endsWith(`-${runId}.js`) ? scriptName.slice(0, -(`-${runId}.js`.length)) : 'Workflow';
    const agents = [...started].map((id) => ({ index: 0, label: '', model: '', state: done.has(id) ? 'done' : (superseded.has(id) ? 'superseded' : 'progress'), agentId: id }));
    agents.sort((a, b) => a.agentId.localeCompare(b.agentId));
    return {
      runId, workflowName: name, summary: '', status: 'running', live: true,
      agentCount: started.size, doneCount: done.size,
      durationMs: 0, totalTokens: 0, totalToolCalls: 0,
      error: null, result: null, timestamp: null,
      phases: [{ index: 0, title: 'Agents (live — phase names, labels & tokens appear when the run finishes)', agents }],
    };
  }
  function readLiveWorkflow(runDir, runId) {
    const attempts = journalAttempts(runDir);
    let agentFiles = []; try { agentFiles = fs.readdirSync(runDir); } catch {}
    // Best-effort workflow name from the persisted script filename (<name>-<runId>.js).
    let scriptName = '';
    try {
      const scriptsDir = path.join(path.resolve(runDir, '..', '..', '..'), 'workflows', 'scripts');
      for (const f of fs.readdirSync(scriptsDir)) { if (f.endsWith(`-${runId}.js`)) { scriptName = f; break; } }
    } catch {}
    return liveWorkflowFromParts({ runId, attempts, agentFiles, scriptName });
  }

  router.get('/api/workflow', async (req, res) => {
    const { claudeSessionId, cwd, runId, host } = req.query;
    if (!runId || !/^wf_[\w-]{1,64}$/.test(runId)) return res.status(400).json({ error: 'valid runId required' });
    // REMOTE session's workflow (2.191.0, real report "workflow not found"):
    // the snapshot + run dir live on the HOST — one read-only compound probe
    // (hosts.fetchWorkflowState, 2s TTL) feeds the same decision tree as the
    // local path below via the shared pure cores.
    if (host) {
      try {
        const st = await hosts.fetchWorkflowState(String(host), runId, String(claudeSessionId || ''), String(cwd || ''));
        if (!st.snapText && !st.hasRunDir) return res.status(404).json({ error: 'workflow not found (no run directory or snapshot for this id)' });
        const attempts = journalAttemptsFromText(st.journalText);
        const liveParts = { runId, attempts, agentFiles: st.agentFiles, scriptName: st.scriptName };
        if (st.snapText) {
          const liveS = Math.max(st.journalMtime || 0, st.agentMtime || 0);
          if (st.snapMtime && liveS > st.snapMtime + 15) return res.json({ ...liveWorkflowFromParts(liveParts), resumed: true });
          try {
            const out = normalizeWorkflowSnapshot(JSON.parse(st.snapText), runId);
            for (const ph of out.phases || []) for (const ag of ph.agents || []) {
              if (attempts.superseded.has(ag.agentId) && ag.state !== 'done') ag.state = 'superseded';
            }
            return res.json(out);
          } catch (err) { return res.status(500).json({ error: 'failed to parse workflow snapshot: ' + err.message }); }
        }
        return res.json(liveWorkflowFromParts(liveParts));
      } catch (err) { return res.status(502).json({ error: 'remote workflow fetch failed: ' + err.message }); }
    }
    // Terminal snapshot wins (it's complete). Prefer it even if the run dir
    // also still exists (snapshot is written at completion, dir lingers) —
    // EXCEPT when the run was RESUMED: resumeFromRunId REUSES the runId
    // (verified from real transcripts), so a killed run's terminal snapshot
    // lingers while the resumed run appends to the same journal — the viewer
    // showed the frozen 'killed' state for the whole resumed execution (real
    // report). Journal/agent activity meaningfully AFTER the snapshot ⇒ the
    // run is going again ⇒ serve the live skeleton until the new terminal
    // snapshot overwrites it. Margin: completed runs write the snapshot ≤0.1s
    // after the last journal line; a resume trails it by minutes.
    const fp = findWorkflowSnapshot(runId, claudeSessionId || '', cwd || '');
    const runDir = findWorkflowRunDir(runId, claudeSessionId || '', cwd || '');
    if (fp) {
      try {
        if (runDir) {
          const snapMs = fs.statSync(fp).mtimeMs;
          let liveMs = 0;
          try { liveMs = fs.statSync(path.join(runDir, 'journal.jsonl')).mtimeMs; } catch {}
          try {
            for (const f of fs.readdirSync(runDir)) {
              if (/^agent-[\w-]+\.jsonl$/.test(f)) liveMs = Math.max(liveMs, fs.statSync(path.join(runDir, f)).mtimeMs);
            }
          } catch {}
          if (liveMs > snapMs + 15000) return res.json({ ...readLiveWorkflow(runDir, runId), resumed: true });
        }
      } catch {}
      try {
        const out = normalizeWorkflowSnapshot(JSON.parse(fs.readFileSync(fp, 'utf-8')), runId);
        // Retry attempts stay tagged in the FINISHED view too (the run dir
        // lingers next to the snapshot; harmless if it's already gone)
        try {
          if (runDir) {
            const { superseded } = journalAttempts(runDir);
            for (const ph of out.phases || []) for (const ag of ph.agents || []) {
              if (superseded.has(ag.agentId) && ag.state !== 'done') ag.state = 'superseded';
            }
          }
        } catch {}
        return res.json(out);
      }
      catch (err) { return res.status(500).json({ error: 'failed to parse workflow snapshot: ' + err.message }); }
    }
    // No snapshot yet — surface a LIVE view if the run is still going.
    if (runDir) return res.json(readLiveWorkflow(runDir, runId));
    return res.status(404).json({ error: 'workflow not found (no run directory or snapshot for this id)' });
  });

  router.post('/api/kill-pid', async (req, res) => {
    const { pid, host } = req.body;
    if (!pid || typeof pid !== 'number') return res.status(400).json({ error: 'pid required' });
    try {
      if (host) {
        // remote EXTERNAL/tmux session: the pid lives ON the host — validate
        // and kill THERE. The local-only path failed silently forever, and a
        // colliding LOCAL pid could even pass the claude check and kill the
        // wrong process (real report: terminate一直不成功).
        await hosts.killRemotePid(String(host), pid);
        return res.json({ success: true });
      }
      if (!isProcessClaude(pid)) return res.status(400).json({ error: 'PID is not a claude process' });
      process.kill(pid, 'SIGTERM');
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Short response cache: discovery spawns subprocesses (pgrep/tmux) and
  // scans lock files + project dirs — with several clients polling, each poll
  // paid the full cost. 2s TTL collapses concurrent polls into one scan.
  let _sessionsCache = null;
  let _sessionsCacheAt = 0;
  let _sweepInFlight = null; // concurrent polls share ONE async sweep (2.242.0)
  const _childPidCache = new Map(); // childPid -> {pids, at} — see pgrep note below

  // The sweep body — ASYNC since 2.242.0. It ran execFileSync end-to-end and a
  // live V8 profile on the busiest fleet pod (22 live sessions, heavy claude
  // turns) caught ONE sweep blocking the event loop for 5.1s (sequential
  // pgrep×22 + tmux + per-lock ps×2; each sync fork 100-300ms under load,
  // pgrep's 2s timeout bounding the worst sweeps at tens of seconds). With the
  // sidebar polling at 5s this froze the WHOLE instance every few seconds for
  // as long as a client was connected — the "everything is slow while I work,
  // fine when I come back later" class. Subprocess calls are now async and
  // PARALLEL (wall = slowest single command, loop never blocks).
  const _runSessionsSweep = async () => {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');

    // B-47e2 (R5's local leg, FLAG-GATED default OFF: agentd.localDiscovery):
    // the FS-scan FACTS (lock files, project-dir listing, tail ids) come from
    // device #0's discovery snapshot — computed in a daemon CHILD process, so
    // a slow/NFS home can never stall this 5s-polled hot path. Everything
    // LOCAL about the sweep stays local: webui-pid mapping, tmux enrichment,
    // claimJsonls, assembly. Snapshot failure ⇒ the local scan below, i.e.
    // exactly the pre-flag behaviour. Latency is metered (local-disc-snap-ms)
    // — the design's own gate for defaulting this on.
    let devSnap = null;
    if (serverSetting?.('agentd.localDiscovery') === true && hosts?.device) {
      try {
        const t0 = Date.now();
        const dm = await hosts.device(null);
        const r = await dm.discoverySnapshot();
        if (r && Array.isArray(r.jsonls) && Array.isArray(r.locks)) {
          devSnap = r;
          global.__vsMetric?.('local-disc-snap-ms', Date.now() - t0);
        }
      } catch (e) { global.__vsEvent?.('local-disc-snap-failed', String(e.message).slice(0, 80)); }
    }
    // snapshot jsonls grouped by projDir for the walk below
    const snapByDir = devSnap ? (() => {
      const m = new Map();
      for (const j of devSnap.jsonls) { if (!m.has(j.projDir)) m.set(j.projDir, new Map()); m.get(j.projDir).set(j.file, j); }
      return m;
    })() : null;

    // Step 0: Use cached webuiPids (updated on session create/kill/restore)

    // Step 1: Scan lock files + tmux panes -> build map of RUNNING sessions
    // Build webuiPid -> claudeSessionId map for precise JSONL matching
    const webuiPidToSessionId = new Map();
    const needPgrep = []; // [{childPid, claudeSessionId}] — cache misses
    for (const [id, s] of activeSessions) {
      if (s.claudeSessionId && s._childPid) {
        // Map childPid + its direct children (claude forks from node-pty spawn)
        webuiPidToSessionId.set(s._childPid, s.claudeSessionId);
        // the wrapper's child pids rarely change, cache them 15s (audit round-2)
        const hit = _childPidCache.get(s._childPid);
        if (hit && Date.now() - hit.at < 15000) {
          for (const p of hit.pids) webuiPidToSessionId.set(p, s.claudeSessionId);
        } else needPgrep.push({ childPid: s._childPid, claudeSessionId: s.claudeSessionId });
      }
    }
    await Promise.all(needPgrep.map(async ({ childPid, claudeSessionId }) => {
      const out = await execFileP('pgrep', ['-P', String(childPid)], { timeout: 2000 });
      const pids = [];
      for (const line of String(out || '').trim().split('\n')) { const p = parseInt(line.trim()); if (p) pids.push(p); }
      _childPidCache.set(childPid, { pids, at: Date.now() });
      if (_childPidCache.size > 512) _childPidCache.delete(_childPidCache.keys().next().value);
      for (const p of pids) webuiPidToSessionId.set(p, claudeSessionId);
    }));

    const paneMap = await getTmuxPaneMapAsync();
    const runningByProjDir = new Map(); // projDirName -> [{lock, tmuxTarget, assigned, claudeSessionId}]
    if (devSnap || fs.existsSync(SESSIONS_DIR)) {
      let lockDatas = [];
      if (devSnap) {
        // device facts: liveness + pidLooksClaude already applied device-side
        lockDatas = devSnap.locks;
      } else for (const f of fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'))) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'));
          if (!isPidAlive(data.pid)) continue;
          lockDatas.push(data);
        } catch {}
      }
      // probe in PARALLEL, assemble in ORIGINAL order (claimJsonls' mtime
      // fallback + the firstRunning cwd pick depend on stable entry order)
      const probed = await Promise.all(lockDatas.map(async (data) => {
        try {
          if (!devSnap && !(await isLockClaude(data))) return null; // B-2104: procStart file-read, ps only as fallback (device facts arrive pre-verified)
          return { data, tmuxTarget: await findTmuxTargetAsync(data.pid, paneMap) };
        } catch { return null; }
      }));
      for (const hit of probed) {
        if (!hit) continue;
        const projDirName = cwdToProjectDir(hit.data.cwd);
        const claudeSessionId = webuiPidToSessionId.get(hit.data.pid) || null;
        if (!runningByProjDir.has(projDirName)) runningByProjDir.set(projDirName, []);
        runningByProjDir.get(projDirName).push({ lock: hit.data, tmuxTarget: hit.tmuxTarget, assigned: false, claudeSessionId });
      }
    }

      // Step 2: Scan JSONL files, match with running locks
      const sessions = [];
      const sessionMap = new Map(); // sessionId → index in sessions[] (dedup: running wins over stopped)
      if (snapByDir || fs.existsSync(projectsDir)) {
        for (const projDir of (snapByDir ? [...snapByDir.keys()] : fs.readdirSync(projectsDir))) {
          const projPath = path.join(projectsDir, projDir);
          const snapFiles = snapByDir?.get(projDir) || null;
          if (!snapFiles) { try { if (!fs.statSync(projPath).isDirectory()) continue; } catch { continue; } }

          // Pre-fetch stats for sorting + mtime lookup (device facts carry them)
          const jsonls = snapFiles ? [...snapFiles.keys()]
            : fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
          const statMap = new Map();
          for (const f of jsonls) {
            if (snapFiles) { statMap.set(f, snapFiles.get(f)?.mtimeMs || 0); continue; }
            try { statMap.set(f, fs.statSync(path.join(projPath, f)).mtimeMs); } catch { statMap.set(f, 0); }
          }
          // Sort by mtime desc (display recency; claiming no longer relies on it alone)
          jsonls.sort((a, b) => (statMap.get(b) || 0) - (statMap.get(a) || 0));

          // Check if there are running locks for this project dir
          const runningEntries = runningByProjDir.get(projDir) || [];

          // Match running locks to JSONLs (claimJsonls in session-store):
          // 1. exact — webui-tracked claudeSessionId, or the lock file's own
          //    sessionId equals a JSONL filename (non-resumed sessions)
          // 2. tail — resumed sessions write their CURRENT id into the
          //    ORIGINAL-named file; scan the last 64KB for the lock's id
          // 3. mtime fallback — brand-new session with nothing flushed yet.
          // With N parallel sessions in ONE cwd, the old "newest unclaimed
          // JSONL takes the next lock" attributed files arbitrarily (kill one
          // → the WRONG id showed stopped → resume collided with a live one).
          const claims = runningEntries.length ? claimJsonls(
            runningEntries.map(e => ({ sessionId: e.claudeSessionId || e.lock.sessionId || null, exactOnly: !!e.claudeSessionId, entry: e })),
            jsonls.map(f => ({ id: f.replace(/\.jsonl$/, ''), mtime: statMap.get(f) || 0 })),
            (j) => {
              // device facts carry tail ids for the newest 60 files; older
              // files with a running lock (rare) fall back to a local read —
              // extractTailIds' null-on-unreadable contract is preserved
              const sf = snapFiles?.get(j.id + '.jsonl');
              return sf && 'tailIds' in sf ? sf.tailIds : readJsonlTailIds(path.join(projPath, j.id + '.jsonl'));
            },
          ) : new Map();

          for (const f of jsonls) {
            const sessionId = f.replace('.jsonl', '');
            const filePath = path.join(projPath, f);
            const mtime = statMap.get(f) || 0;

            const meta = extractSessionMeta(filePath);
            const firstRunning = runningEntries.find(e => !e.assigned);
            const cwd = (firstRunning?.lock.cwd) || meta.cwd || recoverCwdFromProjDir(projDir);

            let status = 'stopped', pid = null, tmuxTarget = null;
            const match = claims.get(sessionId)?.entry || null;
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
      return _sessionsCache;
  };

  router.get('/api/sessions', async (req, res) => {
    try {
      // 4500ms: clients poll at 5s — a 2s TTL guaranteed every poll missed
      // the cache and ran the full sweep (audit round-2, high)
      if (_sessionsCache && Date.now() - _sessionsCacheAt < 4500) return res.json(_sessionsCache);
      // coalesce: N clients missing the cache together share ONE sweep — the
      // sync handler serialized them for free; the async one must do it itself
      if (!_sweepInFlight) {
        _sweepInFlight = _runSessionsSweep().finally(() => { _sweepInFlight = null; });
      }
      res.json(await _sweepInFlight);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Full TODO list (the agent's own TodoWrite / codex plan) for the expanded
  // card — reads taskState() from the transcript, so it works for stopped and
  // restored sessions too (the live pill rides active-sessions instead).
  router.get('/api/session-todos', async (req, res) => {
    try {
      const { backend, backendSessionId, claudeSessionId, cwd, host } = req.query;
      const b = backend || 'claude';
      const rid = backendSessionId || claudeSessionId;
      if (!rid) return res.json({ todos: [] });
      // Remote session: pull the transcript into the data/remote-jsonl cache
      // first (same pattern as /api/session-messages) — without it the Steps
      // list only worked if a chat attach had already warmed the cache.
      const st = await transcripts.taskState({ backend: b, sessionId: rid, cwd, host: b === 'claude' ? host : null });
      res.json({ todos: st.todos || [] });
    } catch (e) { res.json({ todos: [] }); }
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
        accountId: s._accountId || null,
        accountName: s._accountId ? (ctx.accounts?.get(s._accountId)?.name || 'API key') : null,
        accountTail: s._accountId ? (ctx.accounts?.get(s._accountId)?.tail || null) : null,
        todo: s._todos || null,
        auth: ctx.sessionAuth ? ctx.sessionAuth(s) : null,
        mode: s.mode || 'terminal',
        host: s.host || null,
        hostName: s.hostName || null,
      });
    }
    res.json({ sessions });
  });
}

module.exports = { router, setup };

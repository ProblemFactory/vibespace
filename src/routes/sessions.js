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
  cwdToProjectDir, execFileP, isSubagentMessage,
} = require('../session-store');
// THE agent-CLI identity, one rule for every machine (B-3185) — /api/kill-pid's
// LOCAL branch asks it exactly like the remote branch's shell twin does.
const { isCliProcess } = require('../cli-identity');
const { createMessageManager } = require('../normalizers');
const { mergeLiveWorkflow } = require('../workflow-live'); // 2.369.119: the card's stream tree laid over the disk skeleton
const { parseRunDir, journalAttemptsFromText, treeAlive } = require('../workflow-disk'); // 2026-09-26: the run dir's labels/phases/liveness — THE disk view (PURE)
// S3: discovery iterates the harness registry — each descriptor's
// store.discover lists its own sessions (claude lock-first sweep in
// session-store, codex worker-side rollout walk); no backend ternary here.
const { list: listHarnesses } = require('../harnesses');
const { findSessionJsonlPath } = require('../session-store');
const { collectCodexThreadMetasAsync } = require('../codex-session-store');
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
    try {
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
    } catch (e) {
      // S9: a serve-backed reader (opencode stopped conversation) REFUSES loudly
      // when its store is unreachable/missing — an async handler without a
      // catch turned that into a HUNG request (no reply at all; the HTTP probe
      // caught it). The error must reach the client: 404 for a conversation
      // the store does not know, 502 for an unreachable store.
      res.status(e?.status === 404 ? 404 : 502).json({ error: e?.message || String(e), code: e?.code || 'transcript-error' });
    }
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

  // The SUB-AGENT ROSTER of a conversation (B-7473) — the click-through
  // FALLBACK for a codex collab row whose child thread id is not in the
  // transcript. 0.153.4 puts `agent_thread_id` on every SubAgentActivity item,
  // so the common path never gets here; older rollouts (and a spawn row seen
  // before the first activity item) do.
  //
  // Source of truth: each child's OWN session_meta `source.subagent.
  // thread_spawn` — the parent's rollout never lists its children. A REMOTE
  // session's children live on the other machine: say so (a silent [] would
  // read as "this sub-agent never existed").
  //
  // The walk runs OFF the event loop (B-7473 integration 2026-09-06): `collectCodexThreadMetasAsync`
  // is the transcript-worker twin the 5s poll already uses. A user-action
  // consumer is not an excuse — the sync walk measured 193 ms on a modest tree
  // (never block the event loop: no sync fs against a home that may be NFS).
  // The 10s per-root cache stays: the walk is not free even in the worker.
  const _subagentCache = new Map(); // rootThreadId → { at, list }
  router.get('/api/subagents', async (req, res) => {
    const backend = String(req.query.backend || 'claude');
    const threadId = String(req.query.threadId || '');
    if (backend !== 'codex') return res.json({ subagents: [], reason: 'unsupported-backend' });
    if (!threadId) return res.status(400).json({ error: 'threadId required' });
    if (req.query.host) return res.json({ subagents: [], reason: 'remote-machine' });
    const hit = _subagentCache.get(threadId);
    if (hit && Date.now() - hit.at < 10000) return res.json({ subagents: hit.list, cached: true });
    let list = [];
    try {
      const { metas } = await collectCodexThreadMetasAsync();
      list = metas
        .filter((m) => m.agentKind === 'subagent' && m.parentThreadId === threadId)
        .map((m) => ({
          agentPath: m.agentPath || '',
          nickname: m.agentNickname || '',
          threadId: m.threadId,
          depth: m.depth ?? null,
          startedAt: m.startedAt || m.updatedAt || 0,
        }))
        .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    } catch (e) {
      return res.status(500).json({ error: `sub-agent scan failed: ${e.message}` });
    }
    _subagentCache.set(threadId, { at: Date.now(), list });
    if (_subagentCache.size > 64) _subagentCache.delete(_subagentCache.keys().next().value);
    res.json({ subagents: list });
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
  // (or after it stopped without one) the run dir is the truth: journal.jsonl
  // (started {key, agentId, label, phase} / result / failed, appended live),
  // agent-<id>.meta.json (description = label, workflowPhase, model) and the
  // agent-<id>.jsonl transcripts. src/workflow-disk.js parseRunDir turns them
  // into the view — labels + phases since CLI 2.1.267 (older runs: states only),
  // and a LIVENESS verdict from the files' mtimes (no write for 10 min, no live
  // tree, no snapshot ⇒ `stalled`, never `running`). Token totals exist only in
  // the snapshot (or the live tree while this server holds it).
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

  // Journal retry chains (2.181.1): the text parser lives in src/workflow-disk.js
  // (ONE implementation — the disk view and the snapshot's superseded tagging
  // below read the same arithmetic).
  function journalAttempts(runDir) {
    let text = '';
    try { text = fs.readFileSync(path.join(runDir, 'journal.jsonl'), 'utf-8'); } catch {}
    return journalAttemptsFromText(text);
  }

  // ONE live view for the card AND the window (2.369.119, owner: "怎么这个内外实现还不一样？"):
  // the normalizer of the session that launched the run holds the harness's own
  // task_progress tree (phases/labels/states/last tool) on taskInfo.workflow —
  // lay it over the disk view by agentId (src/workflow-live.js). Local and
  // remote sessions alike: the stream is parsed HERE, so the tree lives here.
  function liveTreeFor(runId) {
    try {
      for (const [, s] of activeSessions) {
        const n = s && s._normalizer;
        const ti = n && typeof n.taskInfoById === 'function' ? n.taskInfoById(runId) : null;
        if (ti && ti.workflow) return ti;
      }
    } catch { /* a normalizer mid-teardown */ }
    return null;
  }
  // THE disk view of every live return (2026-09-26): parseRunDir over the run
  // dir's parts, the stream tree laid over it when this server holds one. A
  // tree counts as proof of life only while the stream has not closed the task
  // itself (a level-set close is a guess, not a close) AND its newest record is
  // fresh (treeAlive, lane Q verify: a tree replayed after a restart is as old
  // as its records). `now` judges the FILES (the host's clock for a remote run;
  // 0 = no clock ⇒ liveness unknown); the tree's freshness is judged by THIS
  // server's clock, the one that stamped it.
  function liveView(parts, { runId, snapshotPresent = false, now = Date.now() }) {
    const ti = liveTreeFor(runId);
    const treeLive = treeAlive(ti, Date.now());
    const view = parseRunDir({
      runId, snapshotPresent, now, liveTree: treeLive,
      journalLines: String(parts.journalText || '').split('\n'),
      metas: parts.metas || {}, agentFiles: parts.agentFiles || [], scriptName: parts.scriptName || '',
      newestMtime: parts.newestMtime || 0,
    });
    return ti ? mergeLiveWorkflow(view, ti.workflow, ti.usage || null) : view;
  }
  // The local run dir's parts, read OFF the event loop (a 2.5 s poll per open
  // window): the journal, every file's mtime (the newest = the run's last sign
  // of life), each agent's meta.json (cached by path + mtime — written once at
  // spawn) and the persisted script's name.
  const _wfMetaCache = new Map();
  async function readRunDirParts(runDir, runId) {
    const fsp = fs.promises;
    let names = []; try { names = await fsp.readdir(runDir); } catch {}
    let journalText = ''; try { journalText = await fsp.readFile(path.join(runDir, 'journal.jsonl'), 'utf-8'); } catch {}
    let newestMtime = 0;
    const metas = {};
    await Promise.all(names.map(async (n) => {
      const fp = path.join(runDir, n);
      let st; try { st = await fsp.stat(fp); } catch { return; }
      if (!st.isFile()) return;
      if (st.mtimeMs > newestMtime) newestMtime = st.mtimeMs;
      const m = n.match(/^agent-([0-9a-f]+)\.meta\.json$/);
      if (!m) return;
      const hit = _wfMetaCache.get(fp);
      if (hit && hit.mtimeMs === st.mtimeMs) { metas[m[1]] = hit.meta; return; }
      try {
        const meta = JSON.parse(await fsp.readFile(fp, 'utf-8'));
        metas[m[1]] = meta;
        _wfMetaCache.set(fp, { mtimeMs: st.mtimeMs, meta });
        if (_wfMetaCache.size > 4000) _wfMetaCache.delete(_wfMetaCache.keys().next().value);
      } catch { /* half-written — the next poll reads it */ }
    }));
    // Best-effort workflow name from the persisted script filename (<name>-<runId>.js).
    let scriptName = '';
    try {
      const scriptsDir = path.join(path.resolve(runDir, '..', '..', '..'), 'workflows', 'scripts');
      for (const f of await fsp.readdir(scriptsDir)) { if (f.endsWith(`-${runId}.js`)) { scriptName = f; break; } }
    } catch {}
    return { journalText, metas, agentFiles: names, scriptName, newestMtime };
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
        // the host's own clock judges the host's mtimes (no skew between machines);
        // no NOW line ⇒ no clock ⇒ liveness `unknown` (running), never the hub's
        // clock against the host's mtimes (lane Q verify)
        const now = st.now ? st.now * 1000 : 0;
        // the newest mtime of EVERY file of the run (NMT — meta.json too, the local
        // read's rule), never only the journal + transcripts (lane Q verify)
        const liveParts = { journalText: st.journalText, metas: st.metas || {}, agentFiles: st.agentFiles, scriptName: st.scriptName, newestMtime: Math.max(st.journalMtime || 0, st.agentMtime || 0, st.newestMtime || 0) * 1000 };
        if (st.snapText) {
          const liveS = Math.max(st.journalMtime || 0, st.agentMtime || 0);
          if (st.snapMtime && liveS > st.snapMtime + 15) return res.json(liveView(liveParts, { runId, snapshotPresent: true, now }));
          try {
            const out = normalizeWorkflowSnapshot(JSON.parse(st.snapText), runId);
            for (const ph of out.phases || []) for (const ag of ph.agents || []) {
              if (attempts.superseded.has(ag.agentId) && ag.state !== 'done') ag.state = 'superseded';
            }
            return res.json(out);
          } catch (err) { return res.status(500).json({ error: 'failed to parse workflow snapshot: ' + err.message }); }
        }
        return res.json(liveView(liveParts, { runId, now }));
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
          if (liveMs > snapMs + 15000) return res.json(liveView(await readRunDirParts(runDir, runId), { runId, snapshotPresent: true }));
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
    // No snapshot — the run dir's view: running while it writes (or this server
    // holds its live tree), `stalled` once nothing has been written for 10 min.
    if (runDir) return res.json(liveView(await readRunDirParts(runDir, runId), { runId }));
    return res.status(404).json({ error: 'workflow not found (no run directory or snapshot for this id)' });
  });

  // RESCUE a poisoned transcript (2.360.0): monster records stubbed in place,
  // full backup, atomic swap — see transcripts.rescue for the contract.
  router.post('/api/session-rescue', async (req, res) => {
    try {
      const { sessionId, cwd, backend } = req.body || {};
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
      res.json(await transcripts.rescue({ sessionId: String(sessionId), cwd: String(cwd || ''), backend: backend || 'claude' }));
    } catch (e) { res.status(400).json({ error: e.message }); }
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
      // THE SAME QUESTION AS THE REMOTE BRANCH ABOVE, SO THE SAME RULE (B-3185
      // r4). `hostId` is a parameter, never a branch — but this route WAS a
      // branch: remote asked a whole-argv substring, local asked
      // `ps -o comm=` + `.includes('claude')`. Both are retired here. comm is
      // not the executable test it looks like: it is 15 bytes of a name the
      // process may set itself (measured — node renames its own main thread to
      // `MainThread`, so an npm-installed `node …/claude-code/cli.js` reported
      // NOT-claude and Terminate answered "PID is not a claude process" for a
      // real live CLI), and as a SUBSTRING it also accepts anything that calls
      // itself `claude-…`. isCliProcess is the sweep's own rule; codex is
      // accepted because the remote branch always did and the sidebar lists
      // both backends' external sessions.
      if (!isCliProcess(pid, 'claude') && !isCliProcess(pid, 'codex')) {
        return res.status(400).json({ error: 'PID is not a claude/codex process' });
      }
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
    // S3 (docs/design-harness-plugins.md §2.4): every chat harness discovers
    // its OWN sessions through its descriptor's `store.discover` — claude =
    // session-store.discoverClaudeSessions (the former inline Steps 1-3,
    // moved VERBATIM: webui-pid map, lock-first claims, tmux enrichment),
    // codex = listCodexThreadsAsync (the rollout walk + /proc scan in the
    // transcript worker — this 5s hot path no longer touches the tree on the
    // loop). The route only MERGES: the first harness to name a session key
    // wins (claude before codex, exactly the old order). A harness without a
    // store (shell) has nothing to discover. Unknown backends cannot appear:
    // only registered descriptors are iterated.
    const sessions = [];
    const seenSessionKeys = new Set();
    for (const h of listHarnesses()) {
      if (!h.store || typeof h.store.discover !== 'function') continue;
      const entries = await h.store.discover({ activeSessions, webuiPids, devSnap });
      for (const entry of entries) {
        const key = `${entry.backend || h.id}:${entry.backendSessionId || entry.sessionId}`;
        if (seenSessionKeys.has(key)) continue;
        seenSessionKeys.add(key);
        sessions.push(withSessionKey(entry));
      }
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

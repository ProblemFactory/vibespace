/**
 * Session API routes — discovery, active list, message history, subagent messages, kill.
 * Lock-first discovery algorithm + JSONL parsing for chat history.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const DOOR = require('../mount-door'); // B-afc4: the blocked-path door — asked BEFORE a user-path read
const SP = require('../storage-path.js'); // lane hub-fuse-sync-guard: is this path on a storage mount (the witness's roots)
const os = require('os');

const router = express.Router();

/** B-323e (r1381 (2) + (5)): THE HUB'S pane-map reader, handed to src/session-store.js (a device bundle input — it carries none of
 *  the starter's words). tmux is found by the KEPT lookup (src/plugins/which-kept.js, itself through the starter: never a stat walk
 *  of PATH on the loop) and its pane list asked of the starter. → the list's text ('' = no tmux, or no tmux server), or undefined:
 *  NO REPLY (the lookup or the list did not answer — never kept as a reply). `starter` / `lookup` are getters (a suite hands its own).
 *  r2030 (3a): a host with NO `which` program (the lookup's own ENOENT: `noLookup`) finds tmux the release's way — session-store's
 *  own look along PATH (`releaseLook`: B-1425's guarded walk) — never «no tmux» for that reason. r2030 (3b): a lookup with no reply
 *  serves its LAST GOOD path (known false, a path kept): the pane list is still asked with it. */
function tmuxReaderVia(starter = () => require('../server/child-starter').childStarter(), lookup = (n) => require('../plugins/which-kept.js').whichFreshAnswer(n), releaseLook = () => require('../session-store').tmuxPathAsync()) {   // r2262 MUST 2: releaseLook walks PATH off the loop
  return async (args) => {
    const found = await lookup('tmux');
    let bin = found && found.path;
    if (found && found.noLookup) { bin = await releaseLook(); if (bin === undefined) return undefined; }   // r2262: the walk got no answer = no reply
    else if (!found || (!found.known && !bin)) return undefined;
    if (!bin) return '';
    const r = await starter().run(bin, args, { timeoutMs: 3000, capture: true, maxBuffer: 1024 * 1024, envAdd: { PATH: process.env.PATH || '', ...(process.env.TMUX_TMPDIR ? { TMUX_TMPDIR: process.env.TMUX_TMPDIR } : {}) } });
    if (!r || r.unknown || r.timedOut || r.overflow) return undefined;
    if (r.started === false) return r.error === 'ENOENT' ? '' : undefined;
    return r.code === 0 ? String(r.stdout || '') : '';   // tmux answered: no server is no pane
  };
}
require('../session-store').useTmuxReader(tmuxReaderVia());

const {
  cwdToProjectDir, execFileP, isSubagentMessage,
} = require('../session-store');
// THE agent-CLI identity, one rule for every machine (B-3185) — /api/kill-pid's
// LOCAL branch asks it exactly like the remote branch's shell twin does.
const { isCliProcess, readChildPids } = require('../cli-identity');   // readChildPids: a sign-in terminal's own processes (lane door-day-one-landing)
const { createMessageManager } = require('../normalizers');
const { mergeLiveWorkflow } = require('../workflow-live'); // 2.369.119: the card's stream tree laid over the disk skeleton
const { parseRunDir, journalAttemptsFromText, journalFold, journalAttemptsOf, treeAlive } = require('../workflow-disk'); // 2026-09-26: the run dir's labels/phases/liveness — THE disk view (PURE)
// S3: discovery iterates the harness registry — each descriptor's
// store.discover lists its own sessions (claude lock-first sweep in
// session-store, codex worker-side rollout walk); no backend ternary here.
const { list: listHarnesses } = require('../harnesses');
const { findSessionJsonlPath } = require('../session-store');
const { collectCodexThreadMetasAsync } = require('../codex-session-store');
const { findCodexSessionJsonlPath, jsonlGapInfo, jsonlGapInfoAsync, readJsonlLineRange, readJsonlLineRangeAsync, scanJsonlUserTurns, scanJsonlUserTurnsAsync, searchJsonlFull, searchJsonlFullStream, readerRefusedAnswer } = require('../adapters/codex');

// B-360d / B-891e: the row key, the realpath'd cwd, the keyed row and the kept metas' read-back live in
// src/sessions-assemble.js — ONE copy for this thread and the sweep's worker
const { getSessionKey, mergeKeptStopped, withSessionKey } = require('../sessions-assemble.js');   // B-df5f cure's guard rides the builder there

/** Setup session routes. Requires ctx object with dependencies. */
function setup(ctx) {
  const { activeSessions, webuiPids, refreshWebuiPids, createSessionMessages, BUFFERS_DIR, PERMISSION_MODES, hosts, serverSetting } = ctx;
  if (typeof ctx.stoppedSessions === 'function') _stoppedOf = ctx.stoppedSessions;   // B-a5a4 (3): the seam's kept rows
  // R3 (three-tier): the transcript read composite lives in ONE service —
  // this interface is the future `transcript.*` device op schema.
  const { createTranscriptService } = require('../transcript-service');
  const transcripts = createTranscriptService({ activeSessions, createSessionMessages, hosts });

  // Get chat message history for a Claude session (JSONL + optional buffer)
  router.get('/api/session-messages', async (req, res) => {
    const { backend, backendSessionId, claudeSessionId, cwd, offset, limit, search } = req.query;
    const resolvedSessionId = backendSessionId || claudeSessionId;
    if (!resolvedSessionId) return res.status(400).json({ error: 'backendSessionId or claudeSessionId required' });
    const ref = { backend: backend || 'claude', sessionId: resolvedSessionId, cwd, gone: () => !!(req.socket && req.socket.destroyed), host: req.query.host, memo: {} };   // one request, one read of its history (lane resume-all-paced L3); B-cd4b r1093: a page that hung up got no reply — the mark stays
    try {
      if (req.query.person === '1') return res.json(transcripts.personAsk(ref));   // B-cd4b r1035: a person's own act on a conversation whose history still waits (never a read)
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
    const ref = { backend: backend || 'claude', sessionId: resolvedSessionId, cwd, host: req.query.host, memo: {} };   // one request, one read of its history (lane resume-all-paced L3)
    const { gap, fp, hostFetchError, refused } = await transcripts.gapInfo(ref);
    // Carry a remote failure to the client: "no transcript" and "the machine
    // holding it was unreachable" produce the same empty view otherwise.
    if (!fp) return res.json({ gap: null, ...(hostFetchError ? { error: hostFetchError } : {}) });
    // row B-422c (主开发 r1006): the transcript reader REFUSED (a pool failure) — said by name, never «no gap» (the page: a toast)
    const readerRefused = (e) => { const a = readerRefusedAnswer(e); return res.status(a.status).set('Retry-After', a.retryAfter).json(a.body); };   // r1243 / r1461: which door refused, when again (the pure answer below)
    if (refused) return readerRefused(refused);
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
      try { result = await transcripts.searchFull(ref, fp, req.query.search); } catch {}   // ALSO CURED (B-cd4b r1093): an async search spread as a Promise replied no match at all
      return res.json({ ...result, ...gap });
    }

    if (req.query.fullturnmap) {
      let turns = [];
      try { turns = await transcripts.fullTurnmap(ref, fp); } catch (e) { if (e && e.code === 'transcript_reader_restarting') return readerRefused(e); turns = []; }
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
    let messages;
    try { messages = await transcripts.gapSlab(ref, fp, fromLine, toLine); } catch (e) { if (e && e.code === 'transcript_reader_restarting') return readerRefused(e); throw e; }
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
      const facts = await collectCodexThreadMetasAsync();
      if (!facts) return res.json({ subagents: [], reason: 'transcript_reader_restarting', readerGone: !!require('../adapters/codex').poolGone(), error: 'the transcript reader is restarting — try again in a moment' });   // row B-422c: no listing kept yet — said, never walked on the loop
      const { metas } = facts;
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

  // Subagent messages for a given session + agentId — lane lg-recovery (主开发 r2350 / r2374): the SAME helper as the viewer's attach
  // (src/server/subagent-transcript.js: the place kept, the exact folder first, the other folders walked asynchronously; the transcript
  // pool's paged parse, the file whole), the history converted in paced slices (convertHistoryAsync) — the release listed the projects
  // root and every folder's workflows, read the whole file and converted every record at once HERE, on the hub's loop (1.4 s at 20 MB).
  // The candidate order is the release's: the cwd's folder first when given (its workflows next), then every project folder. A pool
  // that refuses answers 503 BY NAME (`refused`) — never a read on the loop.
  router.get('/api/subagent-messages', async (req, res) => {
    const { claudeSessionId, cwd, agentId } = req.query;
    if (!claudeSessionId || !agentId) return res.status(400).json({ error: 'claudeSessionId and agentId required' });
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    try {
      const got = await require('../server/subagent-transcript').agentTranscript({ claudeSessionId: String(claudeSessionId), agentId: String(agentId), exactDir: cwd ? path.join(projectsDir, cwdToProjectDir(String(cwd))) : null, root: projectsDir });
      if (got.refused) return res.status(503).json({ error: `this agent's transcript could not be read here: ${got.refused}`, refused: got.refused, messages: [], total: 0, meta: {} });
      if (!got.fp) return res.json({ messages: [], total: 0, meta: {} });
      const mm = createMessageManager('claude', `sub-agent-${agentId}`);
      await mm.convertHistoryAsync(got.records);
      return res.json({ messages: mm.messages, total: mm.total, meta: got.meta || {} });
    } catch (e) {
      return res.status(500).json({ error: `this agent's transcript read failed: ${(e && e.message) || e}` });
    }
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
  // B-360d part 2 (lane chrome-157, 2026-11-21): a running workflow has no snapshot yet, and its card / window poll it every
  // 2.5 s; the snapshot finder's last resort walked EVERY session entry under ~/.claude/projects at each poll (on a stand-in home
  // of about 2 500 session entries: 17.6 ms of the hub's loop a poll). THE LAWS (rounds wvinqg1j4 / w5hvsu2v5, 主开发 r1811 /
  // r2339): A POLL NEVER LOSES A RUN THE RELEASE FOUND, and A POLL ASKS ONLY KNOWN PATHS — the cwd's own folder, the place kept for
  // THIS asker and run, the snapshot beside a found run dir: a bounded handful of stats. Anything that LISTS the projects folder is
  // THE HUB's LOOK (below): asynchronous, shared by every run waiting for it, started at most once a WF_LOOK_EVERY_MS for the hub;
  // until it answers, the poll says what it knows (a run whose place is not known yet is «locating»; «nowhere» after the look).
  const _wfWhere = new Map();   // `${kind}:${asker}:${runId}` → the place found, kept for that asker and run
  const WF_WHERE_MAX = 256;
  const keepWhere = (key, p) => { _wfWhere.delete(key); _wfWhere.set(key, p); if (_wfWhere.size > WF_WHERE_MAX) _wfWhere.delete(_wfWhere.keys().next().value); return p; };
  const keptWhere = (key) => { if (!_wfWhere.has(key)) return null; const p = _wfWhere.get(key); _wfWhere.delete(key); _wfWhere.set(key, p); return p; };   // a USE keeps it: the least recent use leaves first
  // THE HUB's LOOK: ONE asynchronous pass over the projects folder for every run a poll could not place (its run dir or its
  // snapshot), the runs wanted together riding one look (debounced), never more than one start a WF_LOOK_EVERY_MS. It lists the
  // root, each project folder, and each conversation's `subagents/workflows` and `workflows` — off the main loop, WF_LOOK_LANES at
  // a time — and answers per run with every place it found; a poll takes the ASKER's own conversation first (a run id under two
  // conversations is answered from the asker's own, as the release's order did), else the first.
  const WF_LOOK_EVERY_MS = 60 * 1000, WF_LOOK_LANES = 8, WF_WANT_TTL_MS = 5 * 60 * 1000;
  const _wfWant = new Map();    // runId → { polled, dirAt, snapAt } — what a poll could not place, and since when
  const _wfFound = new Map();   // runId → { dirs: [{ sid, path }], snaps: [{ sid, path }], at } — the last look's answer
  let _wfLook = null, _wfLookStart = 0, _wfLookTimer = null;
  function runWorkflowLook() {
    for (const [id, w] of _wfWant) if (Date.now() - w.polled > WF_WANT_TTL_MS) { _wfWant.delete(id); _wfFound.delete(id); }   // nobody polls it now
    if (!_wfWant.size) return;
    const startedAt = Date.now(); _wfLookStart = startedAt;
    const want = new Map([..._wfWant].map(([id, w]) => [id, { dir: !!w.dirAt, snap: !!w.snapAt }]));
    _wfLook = (async () => {
      const fsp = fs.promises, root = path.join(os.homedir(), '.claude', 'projects'), found = new Map();
      const note = (id, kind, sid, p) => { let f = found.get(id); if (!f) { f = { dirs: [], snaps: [] }; found.set(id, f); } f[kind].push({ sid, path: p }); };
      const needDir = [...want.values()].some((w) => w.dir), needSnap = [...want.values()].some((w) => w.snap);
      let projects = []; try { projects = await fsp.readdir(root); } catch { }
      const convs = [];
      for (const dir of projects) { let names = []; try { names = await fsp.readdir(path.join(root, dir)); } catch { } for (const sid of names) if (!sid.endsWith('.jsonl')) convs.push([dir, sid]); }
      let next = 0;
      const lane = async () => {
        while (next < convs.length) {
          const [dir, sid] = convs[next++], base = path.join(root, dir, sid);
          if (needDir) { let names = []; try { names = await fsp.readdir(path.join(base, 'subagents', 'workflows')); } catch { } for (const n of names) if (want.get(n)?.dir) note(n, 'dirs', sid, path.join(base, 'subagents', 'workflows', n)); }
          if (needSnap) { let names = []; try { names = await fsp.readdir(path.join(base, 'workflows')); } catch { } for (const n of names) { const id = n.endsWith('.json') ? n.slice(0, -5) : ''; if (want.get(id)?.snap) note(id, 'snaps', sid, path.join(base, 'workflows', n)); } }
        }
      };
      await Promise.all(Array.from({ length: WF_LOOK_LANES }, lane));
      for (const id of want.keys()) if (_wfWant.has(id)) _wfFound.set(id, { ...(found.get(id) || { dirs: [], snaps: [] }), at: startedAt });
    })().catch(() => { }).finally(() => { _wfLook = null; if ([..._wfWant.values()].some((w) => (w.dirAt || 0) > startedAt || (w.snapAt || 0) > startedAt)) scheduleWorkflowLook(); });
  }
  function scheduleWorkflowLook() {
    if (_wfLook || _wfLookTimer) return;
    const wait = Math.max(50, _wfLookStart ? _wfLookStart + WF_LOOK_EVERY_MS - Date.now() : 50);   // the runs wanted together ride ONE look
    _wfLookTimer = setTimeout(() => { _wfLookTimer = null; runWorkflowLook(); }, wait);
    if (_wfLookTimer.unref) _wfLookTimer.unref();
  }
  function wantWorkflow(runId, kind) {
    const now = Date.now();
    let w = _wfWant.get(runId); if (!w) { w = { polled: now, dirAt: 0, snapAt: 0 }; _wfWant.set(runId, w); }
    w.polled = now;
    if (kind === 'dirs' && !w.dirAt) w.dirAt = now;
    if (kind === 'snaps' && !w.snapAt) w.snapAt = now;
    scheduleWorkflowLook();
  }
  // what the hub's look answered for this run and asker (the asker's own conversation first); `answered` false while no look
  // that began after the run was wanted has ended
  function lookedPlace(runId, asker, kind) {
    const f = _wfFound.get(runId), w = _wfWant.get(runId), since = w ? (kind === 'dirs' ? w.dirAt : w.snapAt) : 0;
    if (!f || !since || f.at < since) return { answered: false, path: null };
    const list = f[kind] || [], own = list.find((x) => x.sid === asker) || list[0] || null;
    return { answered: true, path: own ? own.path : null };
  }
  function findWorkflowSnapshot(runId, claudeSessionId, cwd, runDir = null) {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const tryPath = (p) => { try { return fs.existsSync(p) ? p : null; } catch { return null; } };
    // 1) targeted: exact project dir for the cwd
    if (claudeSessionId && cwd) {
      const hit = tryPath(path.join(projectsDir, cwdToProjectDir(cwd), claudeSessionId, 'workflows', `${runId}.json`));
      if (hit) return hit;
    }
    // THE RUN IS FOUND: its snapshot, when written, is the one beside its run dir
    if (runDir) { const beside = tryPath(path.join(path.resolve(runDir, '..', '..', '..'), 'workflows', `${runId}.json`)); if (beside) return beside; }
    // the place kept for THIS asker and run, then the hub's look (the asker's own first) — never a listing on this road
    const key = 'snap:' + (claudeSessionId || '') + ':' + runId;
    { const kept = keptWhere(key); if (kept) { if (tryPath(kept)) return kept; _wfWhere.delete(key); } }
    const look = lookedPlace(runId, claudeSessionId || '', 'snaps');
    if (look.path && tryPath(look.path)) return keepWhere(key, look.path);
    wantWorkflow(runId, 'snaps');   // not placed: the hub's look names it (asynchronous, shared, at most once a minute)
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
    // the place kept for THIS asker and run (a fork's view of its parent's run), then the hub's look — never a listing here
    const key = 'dir:' + (claudeSessionId || '') + ':' + runId;
    { const kept = keptWhere(key); if (kept) { if (tryDir(kept)) return kept; _wfWhere.delete(key); } }
    const look = lookedPlace(runId, claudeSessionId || '', 'dirs');
    if (look.path && tryDir(look.path)) return keepWhere(key, look.path);
    wantWorkflow(runId, 'dirs');
    return null;
  }

  // Journal retry chains (2.181.1): the arithmetic lives in src/workflow-disk.js (ONE implementation); a local run's journal is
  // read through journalOf below — the disk view and the snapshot's superseded tagging read the same kept fold (B-360d part 2)

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
      ...(parts.attempts ? { attempts: parts.attempts } : { journalLines: String(parts.journalText || '') }),   // local: the kept fold; remote: the host's text
      metas: parts.metas || {}, agentFiles: parts.agentFiles || [], scriptName: parts.scriptName || '',
      newestMtime: parts.newestMtime || 0,
    });
    const out = ti ? mergeLiveWorkflow(view, ti.workflow, ti.usage || null) : view;
    if (parts.attempts && parts.attempts.tailUnread) out.journalTailUnread = true;   // SAID: a line past the bound has not ended yet
    return out;
  }
  // The local run dir's parts, read OFF the event loop (a 2.5 s poll per open
  // window): the journal, every file's mtime (the newest = the run's last sign
  // of life), each agent's meta.json (cached by path + mtime — written once at
  // spawn) and the persisted script's name.
  const _wfMetaCache = new Map();
  async function readRunDirParts(runDir, runId) {
    const fsp = fs.promises;
    let names = []; try { names = await fsp.readdir(runDir); } catch {}
    const attempts = await journalOf(runDir);   // B-360d part 2: the journal folded as it grows, never parsed whole a poll
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
    return { attempts, metas, agentFiles: names, scriptName, newestMtime };
  }
  // THE JOURNAL, FOLDED AS IT GROWS (B-360d part 2, lane chrome-157): a live run's journal is append-only and its result lines
  // carry each agent's whole result. Every poll read and parsed it WHOLE — at 300 agents × 32 KB results (a 9.4 MB journal,
  // the test machine) the loop held 75 ms a poll, three pollers every 2.5 s. Kept per run dir: the bytes read so far, the last
  // JOURNAL_EDGE of them and their fold; a poll reads only the bytes appended since and folds their complete lines, a slice at a
  // time (≤ JOURNAL_SLICE, the loop given back between); a line longer than a slice waits as pieces (joined once, at its end).
  // A journal that shrank, was replaced (another inode) or was REWRITTEN IN PLACE (the bytes just before where the fold goes on
  // are not the ones it read there — checked whenever the file moved) is read again from its start; the pollers of one run
  // share one read. A last line with no newline yet is folded once it is whole JSON (the old whole-text parse read it too).
  const _wfJournals = new Map();
  // A line that never ends is kept up to JOURNAL_TAIL_MAX bytes; past it its bytes are dropped (only its first JOURNAL_HEAD_KEEP
  // kept), the poll's answer says the journal's tail cannot be read yet, and the line, once it ends, is folded from its head alone
  // (its type and agent: a result never parsed whole) — round w5daqaxxs
  const JOURNAL_SLICE = 512 * 1024, JOURNAL_EDGE = 64, JOURNAL_TAIL_MAX = 1024 * 1024, JOURNAL_HEAD_KEEP = 4096;   // the kept tails' worst sum: 64 runs × (1 MiB + one 512 KiB slice) ≈ 96 MiB (round w5hvsu2v5)
  const freshJournal = () => ({ ino: null, mtimeMs: 0, offset: 0, edge: Buffer.alloc(0), tail: [], tailLen: 0, skipHead: null, fold: journalFold(null, '') });
  function journalOf(runDir) {
    let e = _wfJournals.get(runDir);
    if (e && e.inflight) return e.inflight;
    if (!e) e = { ...freshJournal(), inflight: null };
    _wfJournals.delete(runDir); _wfJournals.set(runDir, e);   // the newest last; the oldest goes past 64 runs
    if (_wfJournals.size > 64) _wfJournals.delete(_wfJournals.keys().next().value);
    const fp = path.join(runDir, 'journal.jsonl');
    e.inflight = (async () => {
      let st = null; try { st = await fs.promises.stat(fp); } catch { st = null; }
      if (!st) { Object.assign(e, freshJournal()); return journalAttemptsOf(e.fold); }
      if (st.ino !== e.ino || st.size < e.offset) Object.assign(e, freshJournal(), { ino: st.ino });
      const moved = st.size > e.offset || st.mtimeMs !== e.mtimeMs;
      if (moved) {
        let fh = null;
        try {
          fh = await fs.promises.open(fp, 'r');
          if (e.offset > 0) {   // REWRITTEN IN PLACE? the bytes before the fold's offset must be the ones it read there
            const b = Buffer.alloc(e.edge.length);
            const { bytesRead } = await fh.read(b, 0, b.length, e.offset - e.edge.length);
            if (bytesRead !== b.length || !b.equals(e.edge)) Object.assign(e, freshJournal(), { ino: st.ino });
          }
          while (e.offset < st.size) {
            const want = Math.min(JOURNAL_SLICE, st.size - e.offset);
            const buf = Buffer.alloc(want);
            const { bytesRead } = await fh.read(buf, 0, want, e.offset);
            if (!bytesRead) break;
            const piece = buf.subarray(0, bytesRead);
            e.offset += bytesRead;
            e.edge = Buffer.from(piece.length >= JOURNAL_EDGE ? piece.subarray(piece.length - JOURNAL_EDGE) : Buffer.concat([e.edge, piece]).subarray(-JOURNAL_EDGE));
            const nl = piece.lastIndexOf(0x0a);   // the pieces waiting hold no newline: a line's end is in this piece or not read yet
            if (nl < 0) {
              if (e.skipHead) continue;   // a line past the bound: its bytes are not kept
              e.tail.push(piece); e.tailLen += piece.length;
              if (e.tailLen > JOURNAL_TAIL_MAX) { e.skipHead = Buffer.from(Buffer.concat(e.tail).subarray(0, JOURNAL_HEAD_KEEP)); e.tail = []; e.tailLen = 0; }
              continue;
            }
            // a newline byte never sits inside a UTF-8 sequence: the cut is a line's end, the text decodes whole
            let text;
            if (e.skipHead) {   // the line past the bound ends here: folded from its head alone, the lines after it read whole
              const head = e.skipHead.toString('utf8'); e.skipHead = null;
              // the head's FIRST matches name the line: the CLI writes `type`, `key` and `agentId` before the payload (a result's text)
              const ty = /"type"\s*:\s*"(\w+)"/.exec(head), ag = /"agentId"\s*:\s*"([0-9a-f]+)"/.exec(head), ky = /"key"\s*:\s*"([^"\\]{1,200})"/.exec(head);
              if (ty && ag) journalFold(e.fold, JSON.stringify({ type: ty[1], agentId: ag[1], ...(ky ? { key: ky[1] } : {}) }));
              text = piece.subarray(piece.indexOf(0x0a) + 1, nl + 1).toString('utf8');
            } else text = Buffer.concat([...e.tail, piece.subarray(0, nl + 1)]).toString('utf8');
            e.tail = nl + 1 < piece.length ? [piece.subarray(nl + 1)] : []; e.tailLen = e.tail.length ? e.tail[0].length : 0;
            journalFold(e.fold, text);
            if (e.offset < st.size) await new Promise((r) => setImmediate(r));   // the loop given back between slices
          }
        } catch { /* a read that failed keeps what it folded; the next poll goes on from there */ } finally { if (fh) await fh.close().catch((err) => console.warn('[workflow] the journal\'s close failed:', err && err.message)); }
        e.mtimeMs = st.mtimeMs;
      }
      if (moved && e.tail.length && !e.skipHead) { const t = Buffer.concat(e.tail).toString('utf8').trim(); let whole = false; if (t.endsWith('}')) { try { JSON.parse(t); whole = true; } catch { } } if (whole) { journalFold(e.fold, t); e.tail = []; } }
      return e.skipHead ? { ...journalAttemptsOf(e.fold), tailUnread: true } : journalAttemptsOf(e.fold);
    })().finally(() => { e.inflight = null; });
    return e.inflight;
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
    const runDir = findWorkflowRunDir(runId, claudeSessionId || '', cwd || '');
    const fp = findWorkflowSnapshot(runId, claudeSessionId || '', cwd || '', runDir);   // B-360d part 2: a run found is not walked for
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
            const { superseded } = await journalOf(runDir);   // B-360d part 2: the kept fold, never the whole journal read on the loop
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
    // NOT PLACED YET (B-360d part 2, r2339): the hub's look has not answered for this run — it is asynchronous and starts at most
    // once a minute — so the poll says what it knows: «locating», a running view with no agents (the window keeps polling a
    // running run); a look that answered «nowhere» for both is the release's 404
    if (!lookedPlace(runId, claudeSessionId || '', 'dirs').answered || !lookedPlace(runId, claudeSessionId || '', 'snaps').answered) {
      return res.json({ ...liveView({ attempts: journalAttemptsOf(journalFold(null, '')), metas: {}, agentFiles: [], scriptName: '', newestMtime: 0 }, { runId }), locating: true });
    }
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
        await hosts.killRemotePid(String(host), pid, { by: require('../device-audit.js').byOfReq(req) });
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
      try { require('../server/unexpected-exit').markAskedByPid(pid, 'user-kill'); } catch { } // B-f698 verify r1: a user kill is never "unexpected"
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
  // the sweep's -cure (B): rebuilds that failed IN A ROW while a list is served — from SWEEP_STALE_SAY_AFTER on, every answer
  // says so (listStale) and the page draws one line with its door; the first good sweep clears it
  let _sweepFails = 0, _sweepFailWhy = '', _sessionsBuiltAt = 0, _sweepStartedAt = 0, _sweepFailDeadline = false;
  _sweepFailsOf = () => ({ fails: _sweepFails, why: _sweepFailWhy, builtAt: _sessionsBuiltAt, triedAt: _sweepTriedAt });   // triedAt: the last ATTEMPT (a failure moves it too — with no list yet as well)

  // The sweep body — ASYNC since 2.242.0. It ran execFileSync end-to-end and a
  // live V8 profile on the busiest fleet pod (22 live sessions, heavy claude
  // turns) caught ONE sweep blocking the event loop for 5.1s (sequential
  // pgrep×22 + tmux + per-lock ps×2; each sync fork 100-300ms under load,
  // pgrep's 2s timeout bounding the worst sweeps at tens of seconds). With the
  // sidebar polling at 5s this froze the WHOLE instance every few seconds for
  // as long as a client was connected — the "everything is slow while I work,
  // fine when I come back later" class. Subprocess calls are now async and
  // PARALLEL (wall = slowest single command, loop never blocks).
  // the sweep's -cure r2 (its read's M2): ANY failure of a rebuild while a list is in hand — the pool call, another harness's
  // discover, the kept metas — is counted and the last list stands; with none yet it throws (a 500, as before)
  // the chain's -cure (主开发 12:08Z, (2)): a list that stopped refreshing is SAID IN SECONDS — a sweep that ran past its deadline
  // is said at once (not at the second), and a sweep still in flight past SWEEP_LATE_SAY_MS says it while it runs
  const _runSessionsSweep = async () => {
    _sweepStartedAt = Date.now();
    try { const r = await _sweepOnce(); _sweepFailDeadline = false; return r; }
    catch (e) {
      if (!_sessionsCache) throw e;
      _sweepFails++; _sweepFailWhy = String((e && (e.code || e.message)) || 'error').slice(0, 120); _sweepFailDeadline = !!(e && e.deadline);
      sweepRoadSaid('stale', _sessionsCache.count, e); _sessionsCacheAt = Date.now(); return _sessionsCache;
    } finally { _sweepStartedAt = 0; _sweepTriedAt = Date.now(); }
  };
  const _sweepOnce = async () => {
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
    // lane door-day-one-landing: the processes under a SIGN-IN terminal (its shell, the claude it runs, one level more) —
    // the claude a login started in $HOME showed as an ACTIVE session named after the account (its folder); never a row
    const signInPids = new Set();
    for (const [id, s] of activeSessions) {
      if (!s || s._purpose !== 'sign-in') continue;
      let root = s._childPid || null;
      if (!root) { try { root = JSON.parse(fs.readFileSync(path.join(BUFFERS_DIR, id + '.json'), 'utf-8')).childPid || null; } catch { root = null; } }
      if (!root) continue;
      signInPids.add(root);
      for (const k of readChildPids(root)) { signInPids.add(k); for (const g of readChildPids(k)) signInPids.add(g); }
    }
    // B-891e (the sweep held the loop 1.35 s per poll at 12 543 transcripts): every harness but claude discovers HERE, as
    // before; claude's walk, the merge (the registry's order — the first to name a key wins), the kept metas, the sort and
    // the answer's bytes run in the «sessions-sweep» worker (src/sessions-sweep.js), which gets only what this thread
    // alone knows. NO ROW OF CLAUDE'S IS BUILT ON THIS THREAD while a worker answers — with no worker and no list yet, the old road ONCE (sweepInThread, said).
    const order = [], others = {}, bound = [];
    let offLoop = null;   // the ONE harness whose discover the worker runs (its descriptor's store.discoverInSweep — claude's)
    for (const h of listHarnesses()) {
      if (!h.store || typeof h.store.discover !== 'function') continue;
      order.push(h.id);
      if (h.store.accountBound === true) bound.push(h.id);
      if (h.store.discoverInSweep === true && !offLoop) offLoop = h.id;
      else others[h.id] = await h.store.discover({ activeSessions, webuiPids, devSnap });
    }
    let kept = [];
    try { kept = typeof ctx.stoppedSessions === 'function' ? await ctx.stoppedSessions() : []; } catch (e) { console.warn('[sessions] the kept stopped metas:', e.message); }
    const active = [];
    for (const [id, s] of activeSessions) if (s && s.claudeSessionId) active.push([id, { claudeSessionId: s.claudeSessionId, _childPid: s._childPid || null }]);
    // THE BOUND ON WHAT CROSSES THE THREAD (the readers' small (a)): in — the rows of the other harnesses and the kept metas,
    // at most SWEEP_ROWS_IN_MAX (past it the sweep is refused here, said: the last list stands); out — the answer's bytes, at
    // most SWEEP_ANSWER_MAX_BYTES (the worker refuses past it, said); the held rows are a subset of the rows
    const rowsIn = kept.length + Object.values(others).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    if (rowsIn > SWEEP_ROWS_IN_MAX) throw Object.assign(new Error(`the sweep's input is ${rowsIn} rows (the bound is ${SWEEP_ROWS_IN_MAX})`), { code: 'sweep-input-too-big' });
    // the manager design's piece 7: an ENDED row with words waiting carries `waiting` {n, code, until} — read here for the few
    // conversations a store names (as fresh as the sweep), merged into the stopped rows by the sweep's assembler
    let waiting = null;
    try { waiting = typeof ctx.waitingAll === 'function' ? ctx.waitingAll() : null; } catch (e) { console.warn('[sessions] the waiting notices:', e.message); }
    const payload = {
      active, webuiPids: [...(webuiPids || [])], devSnap, order, offLoop, others, signInPids: [...signInPids], kept, waiting, bound, maxBytes: _sweepTest.answerMaxBytes || SWEEP_ANSWER_MAX_BYTES,
      facts: { roots: SP.snapshot(), blocked: DOOR.snapshot(), tmux: [...(await require('../session-store').getTmuxPaneMapAsync())] },   // B-323e: the pane map asked HERE (the main thread, through the starter) — the worker never starts tmux
    };
    let out;
    // a FIRST sweep (no list yet) waits for the serial lane's turn briefly — a worker not running yet means the old road once
    try { out = await sweepPool().call('sessionsSweep', payload, { timeoutMs: _sweepTest.timeoutMs || SWEEP_TIMEOUT_MS, waitMs: _sessionsCache ? SWEEP_QUEUE_MS : (_sweepTest.firstQueueMs || FIRST_QUEUE_MS) }); }
    catch (e) {
      // the worker down (its respawn backing off), wedged past its deadline, throwing, or its pool closed: THE LAST ANSWER
      // STANDS (the outer catch counts it, said) — never a walk on the loop while there is one. With none yet (a first
      // sweep), the old road ONCE, on this thread, said — ONLY when no worker exists at all (主开发 12:08Z, (1)): SafeFs's wait
      // ended with nothing that ran it (noWorker); B-3b03: no pool has an inline door any more, so its belt's `sweep-pool-down` went with it. A sweep that RAN — past its
      // deadline (the storage that held the worker), throwing, refused for its size — is said (a 500 with its words), and
      // that storage is never walked again on the loop
      if (_sessionsCache) throw e;
      if (!(e && e.noWorker)) throw e;
      out = await require('../sessions-sweep.js').sweepInThread(payload);
    }
    const buf = Buffer.isBuffer(out.buf) ? out.buf : Buffer.from(out.buf.buffer, out.buf.byteOffset, out.buf.byteLength);
    sweepRoadSaid(out.onLoop ? 'loop' : 'worker', out.count);
    _sweepStats = { ms: out.ms, rows: out.count, at: Date.now(), road: out.onLoop ? 'loop' : 'worker' };
    try { global.__vsMetric?.('sessions-sweep-ms', out.ms); } catch { }
    _sessionsCache = { buf, etag: out.etag, count: out.count };
    _sessionsCacheAt = _sessionsBuiltAt = Date.now();
    _sweepFails = 0; _sweepFailWhy = '';
    _heldRows = out.held; // heldAccountOf's rows (ws-create's resume seam; heldAccountOfNow's fallback when the kept copies cannot be read in time): the stopped rows that name an account or an account-bound harness
    // B-a5a4 follow-up r2/r3 met (the seam merges the kept copies NOW into the last sweep's stopped rows AS DISCOVERED): the sweep
    // hands the HELD keys' rows as discovered (out.heldDisc) — every other key's discovered row names no account (a merge only
    // fills one) and a kept copy is a stopped row, so merging the copies into it or into nothing answers alike; no round trip
    _sweptStopped = Array.isArray(out.heldDisc) ? out.heldDisc : null;
    return _sessionsCache;
  };

  // the boot phase's `sessions-index` step (src/server/boot-phase.js): the FIRST sweep runs at boot, not on the first
  // page's request — a page that reloads into a fresh server finds it cached (or joins it in flight)
  const discoveryPaused = () => { try { return !!(ctx.paused && ctx.paused('discovery')); } catch { return false; } };
  _keptRead = () => ({ rows: _sessionsCache ? _sessionsCache.sessions : null, paused: discoveryPaused() });
  _pausedOf = discoveryPaused;
  _warmSweep = () => {
    if (!_sweepInFlight) _sweepInFlight = _runSessionsSweep().finally(() => { _sweepInFlight = null; });
    return _sweepInFlight;
  };
  router.get('/api/sessions', async (req, res) => {
    try {
      // 4500ms: clients poll at 5s — a 2s TTL guaranteed every poll missed
      // the cache and ran the full sweep (audit round-2, high)
      // lane fuse-canary-notice (B-b327): while the server's own mount is wedged the sweep's schedule waits — the last
      // answer stands (never an empty list); with no answer yet it runs
      // lane cache-warmth-tiles: each answer carries the live conversations' prompt-cache facts, built per answer
      // (the sweep's 4.5 s cache never ages them) and only while the person's switch is on — off costs nothing
      // B-360d rank 9: the sweep's answer is SERIALISED ONCE (sendSessions) — every page polling it shares the bytes
      // the sweep's -cure (B): a list served while its rebuilds keep failing SAYS SO (listStale: since when, how many in a row,
      // why) from the second failure on — the page draws one line with its Retry door
      const answer = (body) => {
        const warm = serverSetting?.('desktop.cacheWarmth') === true ? warmthDiff(activeSessions, ctx.cacheFactsOf) : null;
        const runFor = _sweepInFlight && _sweepStartedAt ? Date.now() - _sweepStartedAt : 0, late = runFor > (_sweepTest.lateSayMs || SWEEP_LATE_SAY_MS);   // the delta read (S1/S2): no «3 × the last sweep's cost» term — uncapped, it hid a hang behind one slow good sweep; a long healthy sweep's line says it is still being rebuilt
        const why = discoveryPaused() ? `discovery is paused (a storage mount is not answering)${_sweepFailWhy ? ' — ' + _sweepFailWhy : ''}` : late && !_sweepFails ? `a rebuild has run ${Math.round(runFor / 1000)} s` : _sweepFailWhy;
        const said = _sweepFails >= SWEEP_STALE_SAY_AFTER || (_sweepFails >= 1 && _sweepFailDeadline) || late;   // (2): a deadline at once; a long sweep while it runs
        const stale = said && _sessionsBuiltAt ? { listStale: { since: _sessionsBuiltAt, ageMs: Math.max(0, Date.now() - _sessionsBuiltAt), fails: _sweepFails, why, ...(late ? { running: Math.round(runFor / 1000) } : {}), ...(discoveryPaused() ? { paused: true } : {}) } } : null;   // ageMs: the hub's own reading (a device's clock may be off)
        return sendSessions(res, body, warm || stale ? { ...(warm || {}), ...(stale || {}) } : null);
      };
      // the page's Retry (?rebuild=1): past the 4.5 s cache, now — and it WAITS for that sweep (its answer is the fresh list or
      // the failure counted); a discovery pause still holds it (a wedged mount is never walked for a Retry)
      const rebuild = req.query && req.query.rebuild === '1';
      if (_sessionsCache && (discoveryPaused() || (!rebuild && Date.now() - _sessionsCacheAt < (_sweepTest.cacheTtlMs ?? 4500)))) return answer(_sessionsCache);
      // coalesce: N clients missing the cache together share ONE sweep — the
      // sync handler serialized them for free; the async one must do it itself
      if (!_sweepInFlight) {
        _sweepInFlight = _runSessionsSweep().finally(() => { _sweepInFlight = null; });
      }
      // the sweep's -cure (C): WITH A LIST IN HAND a poll waits at most POLL_WAIT_MS for the fresh one, then gets the list it
      // has — never a long sweep's whole wait (a cold walk, a wedged worker: up to SWEEP_TIMEOUT_MS)
      if (_sessionsCache && !rebuild) {
        let t = null;
        await Promise.race([_sweepInFlight.catch(() => null), new Promise((r) => { t = setTimeout(r, _sweepTest.pollWaitMs || POLL_WAIT_MS); })]);
        clearTimeout(t);
        return answer(_sessionsCache);
      }
      answer(await _sweepInFlight);
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
      // the machine for EVERY harness (hostId is a parameter, never a branch); the service decides what it is asked for: a harness
      // whose task state reads its transcript (the descriptor's taskStateFromTranscript — claude) is asked of that machine, another's
      // state (codex: the wrapper's side file) is read here, as the release did — never a local thread start (B-952b: codex's empty steps)
      const st = await transcripts.taskState({ backend: b, sessionId: rid, cwd, host: host || null, webuiId: typeof req.query.webuiId === 'string' ? req.query.webuiId : null, gone: () => !!(req.socket && req.socket.destroyed) });   // B-952b smalls: the window's own conversation (B-cd4b r1093: a hung-up asker keeps the mark)
      res.json({ todos: st.todos || [], ...(st.hostFetchError ? { hostFetchError: String(st.hostFetchError) } : {}), ...(st.hostOffline ? { hostOffline: true } : {}) });   // B-5cf8: an unreachable machine is said, never «no steps»
    } catch (e) { res.json({ todos: [], error: (e && e.message) || String(e) }); }
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
        accountName: s._accountId ? (ctx.accounts?.nameShownOf?.(s._accountId) || ctx.accounts?.providerRecordOf?.(s._accountId)?.label || 'API key') : null,   // a third-party provider's conversation: its record's name (lane lg-providers U2 cure — as its badge)
        accountTail: null,   // B-ba7d: NO key tail (GET /api/active is read by any credential) — the page lays the person's read on by accountId
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

/** THE SESSION LIST'S WARMTH DIFF (lane cache-warmth-tiles, 2026-11-02): each live conversation's prompt-cache
 *  facts — usage-pool-engine `cacheFactsOf`, the SAME producer the pool's warm-cache hold judges — keyed by its webui
 *  id, beside the hub's own clock: a client places the instants on THIS clock, never on its own alone (the deadline
 *  cards' rule). A conversation whose TTL or last request is unknown is left out (no colour, never a guess); a fact that
 *  throws too. Each entry: {lastRequestAt, cacheTtlSec, lost, inFlight, turnStartedAt} (round 3).
 *  THE PROVENANCE (lane cache-warmth-compact, amendment 1): + `ttlSource` ('record' — the TTL the last response wrote;
 *  'inferred' — the billing state's fallback) and, when a record stated them, `cacheObserved` (read / created / cold) and
 *  its `cacheReadTokens` / `cacheCreatedTokens` — the hover says what the band projects from. AN UNKNOWN THAT HAS A REASON
 *  IS SENT, never drawn: `unknown: 'compacted'` (a compaction ended, no request since), `'no-request'` (a streamed chat
 *  conversation this hub started that named none yet) or `'unseen'` (restored / resumed with no stamp — r2) with no instant, so the client's tier is still 'unknown' (no band, ring, count or
 *  row) and only the hover says why. Every other unknown (no TTL — codex, a terminal view's guess) is left out as before. */
function warmthDiff(activeSessions, factsOf, now = Date.now()) {
  const warmth = {};
  if (typeof factsOf === 'function') {
    for (const [id, s] of activeSessions || []) {
      if (!s || s.isTmuxView) continue;
      let f = null; try { f = factsOf(s, now); } catch { f = null; }
      if (!f) continue;
      // a request in flight writes the cache from the instant it went out (the bounded turn law, round 3), stamp or none;
      // `lost` is decided hub-side (the member that served the last request ≠ the link's) — never a member id to a client
      const flying = !!(f.inFlight && f.turnStartedAt);
      const said = { ...(f.ttlSource ? { ttlSource: f.ttlSource } : {}), ...(f.cacheObserved ? { cacheObserved: f.cacheObserved, cacheReadTokens: Number(f.cacheReadTokens) || 0, cacheCreatedTokens: Number(f.cacheCreatedTokens) || 0 } : {}) };
      if (f.cacheTtlSec && (f.lastRequestAt || flying)) warmth[id] = { lastRequestAt: f.lastRequestAt || null, cacheTtlSec: f.cacheTtlSec, lost: f.lost === true, inFlight: flying, turnStartedAt: flying ? f.turnStartedAt : null, ...said };
      else if (f.unknownWhy === 'compacted' || f.unknownWhy === 'no-request' || f.unknownWhy === 'unseen') warmth[id] = { lastRequestAt: null, cacheTtlSec: f.cacheTtlSec || null, lost: false, inFlight: false, turnStartedAt: null, unknown: f.unknownWhy, ...(f.ttlSource ? { ttlSource: f.ttlSource } : {}) };
    }
  }
  return { warmth, serverNow: now };
}

/** B-360d rank 9 — THE SESSION LIST IS SERIALISED ONCE PER SWEEP. Measured on a scratch hub with 12 543 transcripts: the
 *  answer is 5.75 MB, and every page's poll re-serialised it (stringify, encode, the ETag's hash) — ten views opening at
 *  once were ONE 268 ms hold of the loop over a cached sweep. The sweep's worker makes the bytes and their weak ETag once
 *  (src/sessions-assemble.js answerBytes); every answer of that sweep sends them. The cache-warmth switch's per-answer
 *  diff (`warmth`, `serverNow`) is joined in after the sweep's keys — the same keys, in the same order, as
 *  `{ ...body, ...diff }` — and its answer carries no shared ETag.
 *  cache = { buf, etag } */
function sendSessions(res, cache, extra = null) {
  res.type('application/json');
  if (!extra) { res.set('ETag', cache.etag); return res.send(cache.buf); }
  res.set('ETag', `${cache.etag.slice(0, -1)}-w${(++_warmthTag).toString(36)}"`);   // its own tag: Express never hashes the 5.75 MB on the loop
  const x = Buffer.from(JSON.stringify(extra));
  return res.send(cache.buf.length > 2 ? Buffer.concat([cache.buf.subarray(0, cache.buf.length - 1), Buffer.from(','), x.subarray(1)]) : x);
}
/** THE SWEEP'S POOL (B-891e): src/sessions-sweep-worker.js on a pool of one — a sweep never waits behind a transcript
 *  read, nor holds one, and the device daemon's bundle never carries it; a deadline + respawn. */
const SWEEP_TIMEOUT_MS = 5 * 60e3;   // a cold walk of 12 543 transcripts on a slow home is CPU and reads, not a wedged mount
// the sweep's -cure: the pool is a SERIAL lane (src/safe-fs.js — a call waits for its turn in main on its own clock and runs on
// another), so a lookup that waited too long ENDS ITSELF and never terminates the worker under a sweep
const SWEEP_QUEUE_MS = 30e3;         // a sweep's wait for its turn (behind a lookup; the worker's respawn)
const FIRST_QUEUE_MS = 3e3;          // …a FIRST sweep's (no list yet): a worker that is not there by then ⇒ the old road once
const LOOKUP_MS = 20e3;              // a lookup's own run, and its wait behind a sweep — then it ends (null), the sweep goes on
// (C) a poll WITH A LIST IN HAND waits this long for the fresh one: a warm sweep at the owner's shape (12 543 transcripts) took
// 1.35–1.39 s (the claim's measure) — 2 s lets it through with margin and stays well under the pages' 5 s poll, so a poll
// never laps the next one
const POLL_WAIT_MS = 2000;
const SWEEP_STALE_SAY_AFTER = 2;     // (B) failed rebuilds in a row before every answer says the list is out of date
const SWEEP_LATE_SAY_MS = 15000;     // the chain's -cure (2): a sweep in flight this long is said while it runs (a deadline: at once)
const SWEEP_ANSWER_MAX_BYTES = 64 * 1024 * 1024;   // the chain's -cure (a): the answer's bytes the worker hands back, at most (about 140 000 rows)
const SWEEP_ROWS_IN_MAX = 200000;    // …and the rows handed in (the other harnesses' + the kept metas), at most
const _sweepTest = {};               // the suite's seam: a stand-in worker script (a wedged / throwing / slow one), the sweep's deadline, a lookup's clock, a poll's wait, the cache's 4.5 s
let _sweepPool = null, _sweepRoad = 'worker', _sweepStats = null, _warmthTag = 0, _sweepFailsOf = null;
let _sweepTriedAt = 0;   // the -cure's read (S7): the end of the LAST sweep ATTEMPT, good or failed, list or none — what a lookup's sweep is spaced by
/** THE FALLBACK IS SAID (主开发 00:18Z): no worker and no list yet ⇒ the route runs the sweep ONCE on the main loop (sweepInThread) — the old road
 *  (about a second a poll at the owner's 12 543 transcripts). Said ONCE per outage where the owner looks (the journal,
 *  the telemetry event Diagnostics counts; a hold it makes is named by its own frames in the [loop-hold] line), and its
 *  end said once too — never a silent return to the loop. */
function sweepRoadSaid(road, rows, err = null) {
  if (road === _sweepRoad) return;
  const was = _sweepRoad; _sweepRoad = road;
  if (road === 'loop') {
    console.warn(`[sessions] the sessions sweep's worker is not running and no list was kept — the session list (${rows} rows) was built ON THE MAIN LOOP (the old road: it holds the loop)`);
    try { global.__vsEvent?.('sessions-sweep-on-loop', String(rows)); } catch { }
  } else if (road === 'stale') {
    console.warn(`[sessions] the sessions sweep failed (${String((err && (err.code || err.message)) || 'unknown').slice(0, 120)}) — the last list (${rows} rows) is served until a sweep answers again; nothing is walked on the main loop`);
    try { global.__vsEvent?.('sessions-sweep-stale', String((err && err.code) || 'error').slice(0, 40)); } catch { }
  } else console.log(`[sessions] the sessions sweep runs off the main loop again (after ${was === 'stale' ? 'serving the last list' : 'the old road'})`);
}
function sweepPool() {
  if (_sweepPool) return _sweepPool;
  const { SafeFs } = require('../safe-fs');
  // the serial lane never runs a job inline (a job with no live worker waits for one, then fails at its own wait); B-3b03: no
  // pool runs an op inline at all, so the belt that refused a sweep here (`sweep-pool-down`) is gone with the inline road
  _sweepPool = new SafeFs({ workerPath: path.join(__dirname, '..', 'sessions-sweep-worker.js'), name: 'sessions-sweep', poolSize: 1, timeouts: { default: SWEEP_TIMEOUT_MS },
    serial: { busy: { message: 'the session list is being rebuilt — try again in a moment', code: 'sweep_busy' } }, ...(_sweepTest.workerFile ? { workerPath: _sweepTest.workerFile } : {}) });
  return _sweepPool;
}

let _warmSweep = null;
let _keptRead = null;   // unit what-it-may-use (cure r1, SHOULD a): the rows the last sweep KEPT, and whether discovery is paused — read, never a new sweep
let _pausedOf = null;   // the route's discoveryPaused (a wedged mount: no sweep starts)
let _heldRows = null;
let _sweptStopped = null;   // B-a5a4 follow-up r2: the last sweep's stopped rows AS DISCOVERED (heldAccountOfNow merges the kept copies into them)
/** B-a5a4 follow-up r3: the sweep's merge AND what it hands the seam — the stopped rows AS DISCOVERED (copies), then the kept
 *  copies merged into `rows` in place (the page's rows). One function, so the order is a fact a leg drives. */
// (B-891e: the sweep's rows are built in its worker — sessions-assemble keeps them as discovered before the same merge and the
// worker hands the held keys' ones back (out.heldDisc); this is the same order on this thread, the one the seam's legs drive)
function sweepMerge(rows, kept) {
  const discovered = rows.filter((r) => r && r.status === 'stopped').map((r) => ({ ...r }));
  mergeKeptStopped(rows, kept);
  _heldRows = rows; _sweptStopped = discovered;
  return rows;
}
let _stoppedOf = null;   // B-a5a4: boot-restore's stoppedSessions (set at setup)
const { NO_TRANSCRIPT_HERE } = require('../inbox-reopen.js');   // B-a5a4 (6): ONE sentence (it was spelled twice)
// B-a5a4 (1): a RESUME whose billing account was deleted degrades to the default login (ws-create) — never for a harness that
// keeps a conversation in its account's OWN store (`store.accountBound`): the default's store does not hold it
const ACCT_GONE_BOUND = 'the account this conversation lived in was deleted — its conversation stays in that account\'s own store, so it cannot be resumed on another login';
/** B-891e: THE ROWS FOR A READER ON THE LOOP, asked where they were built (the sweep's worker keeps the last sweep's rows):
 *  `sessionRow(key)` → one row | null (a For-you reply's reopen); `sessionRows(fields)` → the rows cut to `fields` (the
 *  search backfill — the one reader that wants them all, and asks rarely). A worker that holds no sweep yet (a respawn)
 *  is answered after one. */
async function askRows(op, payload) {
  if (!_warmSweep) return null;
  try {
    const lk = _sweepTest.lookupMs || LOOKUP_MS;
    let r = await sweepPool().call(op, payload, { timeoutMs: lk, waitMs: lk });   // ends ITSELF: never the sweep's worker
    if (r && r.none) {   // a worker that holds no sweep yet (a respawn): ONE sweep, waited for at most LOOKUP_MS (r3, S5) — never while
      if (_pausedOf && _pausedOf()) return null;   // discovery is paused (a wedged mount is never walked for a lookup)
      if (Date.now() - _sweepTriedAt < (_sweepTest.cacheTtlMs ?? 4500)) return null;   // the -cure's read (S7): spaced by the last ATTEMPT — a hub whose sweeps keep failing is not swept again at each reopen (locate() answers)
      let t = null;
      await Promise.race([Promise.resolve(_warmSweep()).catch(() => null), new Promise((done) => { t = setTimeout(done, lk); })]);
      if (t) clearTimeout(t);
      r = await sweepPool().call(op, payload, { timeoutMs: lk, waitMs: lk });
    }
    return r && !r.none ? r : null;
  } catch { return null; }
}
async function sessionRow(sessionKey) {
  let r = await askRows('sessionsLookup', { sessionKey });
  // the chain's -cure (b): a key the last sweep did not see may be NEWER than that sweep (a hub no page polls): ONE fresh sweep —
  // bounded by LOOKUP_MS, never while discovery is paused, never when the last sweep is younger than the cache — then ask again
  // its read (S5): spaced by the last ATTEMPT, not the last good sweep — sweeps that keep failing are not re-run at each reopen
  const fo = _sweepFailsOf ? _sweepFailsOf() : null, lastAt = fo ? Math.max(fo.builtAt || 0, fo.triedAt || 0) : 0, lk = _sweepTest.lookupMs || LOOKUP_MS;
  if (r && !r.row && _warmSweep && !(_pausedOf && _pausedOf()) && Date.now() - lastAt > (_sweepTest.cacheTtlMs ?? 4500)) {
    let t = null;
    await Promise.race([Promise.resolve(_warmSweep()).catch(() => null), new Promise((done) => { t = setTimeout(done, lk); })]);
    if (t) clearTimeout(t);
    r = await askRows('sessionsLookup', { sessionKey });
  }
  return (r && r.row) || null;
}
async function sessionRows(fields = []) { const r = await askRows('sessionsRows', { fields }); return (r && r.rows) || []; }
/** THE ACCOUNT A RESUME THAT STATES NONE GOES TO (lane dead-socket-keeps-chat-meta r2 — src/ws-create.js's ONE seam, so
 *  every door: the page's Resume, the For-you reply reopen, an automation's open) → {accountId} | {refuse} | null, over the
 *  last sweep's rows: the conversation's STOPPED row names its account (a kept meta's; the account root whose index lists
 *  it) ⇒ that account, never the harness default by accident; a harness that keeps a conversation in its account's own
 *  store (`store.accountBound` — antigravity) whose row names none ⇒ refused by name (the default's store does not hold
 *  it); no stopped row (a live one, a sweep not run yet) ⇒ null — nothing said, as before. */
const accountBoundOf = (backend) => { try { return require('../harnesses').get(backend || 'claude')?.store?.accountBound === true; } catch { return false; } };
function heldAccountOf(backend, id, rows = _heldRows) {
  const k = `${backend || 'claude'}:${id}`;
  const r = (rows || []).find((x) => x && x.status === 'stopped' && !x.forkPending && `${x.backend || 'claude'}:${x.backendSessionId || x.sessionId}` === k);
  if (!r) return null;
  if (typeof r.accountId === 'string' && r.accountId) return { accountId: r.accountId };
  // B-a5a4 (4): a kept meta of an account-bound harness that named no account carries 'subscription' on its row (the machine's
  // own login — boot-restore stoppedSessions, as agy-discover's rows say it), so this seam AND the page's verdict read one account
  return accountBoundOf(backend) ? { refuse: NO_TRANSCRIPT_HERE } : null;
}
/** B-a5a4 (3): the seam's question before the first /api/sessions sweep (an automation's create at boot): the kept copies
 *  themselves (boot-restore stoppedSessions) — never «no row» because no page asked yet. */
async function heldAccountOfNow(backend, id, { rows, merged, stopped = _stoppedOf, boundMs = 2000 } = {}) {
  // r1 (the lane's read): ALWAYS the kept copies as they stand now, over the last sweep's rows — a hub no page asks keeps its
  // boot sweep's rows for hours (a copy the re-probe kept later, a conversation stopped since, unseen); bounded, never a hang
  const swept = rows === undefined ? _sweptStopped : rows;
  // r3 (a delta read): a read-back that hangs past its bound falls back to the sweep's MERGED rows (its copies as of the sweep) —
  // never the discovered rows alone (a claude row's account lives only in its copy)
  const fallback = merged !== undefined ? merged : rows === undefined ? _heldRows : rows;
  let kept = [], late = false;
  if (typeof stopped === 'function') {
    let timer = null;
    const LATE = Symbol('late');
    try { kept = await Promise.race([Promise.resolve().then(() => stopped()), new Promise((r) => { timer = setTimeout(() => r(LATE), boundMs); timer.unref?.(); })]); } catch { kept = []; } finally { clearTimeout(timer); }
    if (kept === LATE) { late = true; kept = []; }
  }
  if (late) return heldAccountOf(backend, id, fallback);
  // B-a5a4 follow-up (主开发's reading of b4e2af305): ONE PRECEDENCE FOR ONE QUESTION — the page's own merge rule
  // (mergeKeptStopped: a stopped row's own account stays, the kept copy fills what it lacks) over a COPY of the sweep's
  // STOPPED rows; a stale snapshot's live row is no fact about now (a live conversation is the keeper check's, above the seam)
  const stoppedRows = (swept || []).filter((r) => r && r.status === 'stopped').map((r) => ({ ...r }));
  // B-891e (the sweep hands the held keys' rows): only the ASKED key's copies are merged — the answer is the same (a copy fills
  // its own key's row alone) and a resume builds no row (a realpath each) for every other kept copy
  if (Array.isArray(kept)) { const ask = `${backend || 'claude'}:${id}`; kept = kept.filter((k) => k && `${k.backend || 'claude'}:${k.backendSessionId || k.sessionId}` === ask); }
  return heldAccountOf(backend, id, mergeKeptStopped(stoppedRows, Array.isArray(kept) ? kept : []));
}
// B-a5a4 r1 (1): an account-bound harness's conversation lives in ONE account's store — an account the door STATES that is not
// the one its row names is refused by name (the Resume bar's switch door offered every other account: agy started on a store
// that does not hold the conversation)
// B-a5a4 follow-up: the refusal NAMES the account that holds it ({name} — its row's name; the machine's own login in the
// harness's billing word) — a stale on-resume account was refused on every press with nothing to pick by
const BOUND_ELSEWHERE = 'this conversation lives in the store of the account «{name}» — it can be resumed only on that account';
const heldNameOf = (backend, accountId, accounts) => {
  if (accountId === 'subscription') { try { return require('../harnesses').get(backend)?.ui?.billing?.globalLogin || accountId; } catch { return accountId; } }
  let a = null; try { a = accounts && typeof accounts.get === 'function' ? accounts.get(accountId) : null; } catch { a = null; }
  return (a && a.name) || accountId;
};
const fillWords = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
async function boundElsewhereOf(backend, id, accountId, opts = {}) {
  if (!accountBoundOf(backend) || !accountId) return null;
  const held = await heldAccountOfNow(backend, id, opts);
  if (!(held && held.accountId && held.accountId !== accountId)) return null;
  // r2: the account that holds it was DELETED — the deleted-account sentence, never «resume it on» an account that is gone
  if (held.accountId !== 'subscription' && opts.accounts && typeof opts.accounts.get === 'function') {
    let a = null, threw = false; try { a = opts.accounts.get(held.accountId); } catch { threw = true; }   // r3: a get that throws says nothing (never «deleted»)
    if (!threw && !a) return { refuse: ACCT_GONE_BOUND, code: 'resume-account-gone', accountId: held.accountId, message: ACCT_GONE_BOUND };
  }
  const params = { name: heldNameOf(backend, held.accountId, opts.accounts) };
  // cure 2: the machine's login is named in the billing WORD — the page says that word in the reader's language too (`words`)
  return { refuse: BOUND_ELSEWHERE, params, accountId: held.accountId, message: fillWords(BOUND_ELSEWHERE, params), ...(held.accountId === 'subscription' ? { words: ['name'] } : {}) };
}
/** B-a5a4 (1): a resume whose stored account is gone → {refuse} for an account-bound harness, else null (degrade, said). */
const acctGoneOf = (backend) => (accountBoundOf(backend) ? { refuse: ACCT_GONE_BOUND } : null);

module.exports = { tmuxReaderVia, SWEEP_LATE_SAY_MS, SWEEP_ANSWER_MAX_BYTES, SWEEP_ROWS_IN_MAX, router, setup, mergeKeptStopped, sweepMerge, withSessionKey, heldAccountOf, heldAccountOfNow, acctGoneOf, boundElsewhereOf, ACCT_GONE_BOUND, BOUND_ELSEWHERE, warmthDiff, sendSessions, sweepPool, sessionRow, sessionRows, sweepStats: () => _sweepStats, sweepFails: () => (_sweepFailsOf ? _sweepFailsOf() : null), POLL_WAIT_MS, SWEEP_STALE_SAY_AFTER, _sweepTestSeam: (o) => { Object.assign(_sweepTest, o || {}); if (_sweepPool) { try { _sweepPool.close(); } catch { } _sweepPool = null; } }, closeSweepPool: () => { if (_sweepPool) { try { _sweepPool.close(); } catch { } _sweepPool = null; } }, _noteSweptRows: (rows) => { _heldRows = rows; _sweptStopped = rows; }, keptSessions: () => (_keptRead ? _keptRead() : { rows: null, paused: false }), warmSessions: () => (_warmSweep ? _warmSweep() : Promise.resolve()) };

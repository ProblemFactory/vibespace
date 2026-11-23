'use strict';
/**
 * TranscriptService — ONE interface over the transcript parse stack
 * (R3 step 1 of docs/design-three-tier.md, pure refactor, server-hosted).
 *
 * Reading a conversation used to be a composite copy-pasted per endpoint:
 * refresh the remote cache (?host=) → warm the parse worker → prefer the live
 * session's normalizer (only once _historyLoaded) else rebuild from the
 * merged JSONL+buffer → answer page/turnmap/search/status/taskState; plus the
 * huge-file seek family (gapInfo/slab/full search/full turnmap) with its own
 * copy of the host-refresh dance. Three copies of the normalizer dance and
 * two of the host refresh lived in routes/sessions.js alone.
 *
 * THIS INTERFACE IS THE FUTURE DEVICE OP SCHEMA (`transcript.*`): when the
 * daemon hosts the same service next to the bytes, each method below becomes
 * an op and the orchestrator keeps calling the same shapes — locally
 * in-process (device #0, CS amendment #2), remotely over the mux. Keep
 * methods transport-neutral: refs in, plain serializable results out.
 *
 * ref = { backend, sessionId, cwd?, host? }
 */
const fs = require('fs');
const {
  findSessionJsonlPath, isSubagentMessage, warmSessionJsonlAsync,
} = require('./session-store');
const { createMessageManager } = require('./normalizers');
const {
  findCodexSessionJsonlPath, jsonlGapInfoAsync, readJsonlLineRangeAsync,
  scanJsonlUserTurnsAsync, searchJsonlFull, searchJsonlFullStream,
} = require('./adapters/codex');
const { get: harnessOf } = require('./harnesses'); // S3: store.locate per harness

const DEVICE_HANDLE = '\u0000device:'; // opaque to the route; never a real path
// B-9a2e (round w5vyt4hhv's second small): THE HUB'S OWN READ FOR A PAIRED MACHINE runs under the device road's gate — an async scope
// the PURE sent-provenance module reads through its installed getter (setGate): the record answers only the ids the device road
// would have been handed (src/sent-provenance.js passes). Installed once; a read for this hub's own conversation has no scope.
const _readGate = new (require('async_hooks').AsyncLocalStorage)();
require('./sent-provenance.js').setGate(() => _readGate.getStore());
/** THE GATE, ONE helper: `fn` (a conversion of a paired machine's transcript done on the hub) runs under the device road's gate when
 *  `host` is set — the service's own fallback reads and the view-only attach (src/ws-handler.js) alike. → fn's value */
function gatedRead({ host = null, conv = null, from = null } = {}, fn) {
  if (!host || typeof conv !== 'string' || !conv) return fn();
  return _readGate.run({ conv, host, ids: require('./sent-provenance.js').idsFor(conv, Array.isArray(from) ? from : []) }, fn);
}
// lane chat-attachments-persist (the cut): pictures are read in ONE transcript worker of their own (its indexes are kept
// and extended there — one copy, never one per pool thread); inline (the pool down) the op answers «unavailable»
let _picturePool = null;
const path = require('path');
const PICTURE_WORKER = path.join(__dirname, 'transcript-worker.js');   // a checkout constant (the device bundle has no such file)
function picturePool() {
  if (_picturePool) return _picturePool;
  // B-3b03: a bundle that ships no worker script (the device agent's single file) runs the op in place, as the release's inline
  // runner did there (`picture` on a main thread answers «unavailable» — the device answers its pictures through pictureHere); the
  // hub's checkout always has the script, so the hub never runs it in-main (its pool refuses: the route's 503 «finding»)
  if (!fs.existsSync(PICTURE_WORKER)) return (_picturePool = { inPlace: true, call: async (op, q) => (await require('./transcript-worker').runOp(op, q)).result });
  const { SafeFs } = require('./hub-pool').hubPool(PICTURE_WORKER);   // r2660 (B): the pool by a path the device build never follows
  _picturePool = new SafeFs({ workerPath: PICTURE_WORKER, name: 'transcript-picture', poolSize: 1, timeouts: { default: 120000 } });
  return _picturePool;
}
const isDeviceHandle = (fp) => typeof fp === 'string' && fp.startsWith(DEVICE_HANDLE);

const BULK = require('./bulk-read');   // B-cd4b r1062: the bulk mark's ONE place
function createTranscriptService({ activeSessions, createSessionMessages, hosts }) {
  // ── R3 SWITCHOVER (2.292.0): remote reads are served BY THE MACHINE THAT
  // HOLDS THE BYTES (the daemon's `transcript-op`, dark since 2.285.0 with a
  // byte-identical parity suite). The wire now carries parsed KBs instead of
  // multi-MB raw transcripts, which retires the whole partial-transfer
  // integrity class (2.187.0/2.188.1) for reads.
  // FALLBACK LADDER, per the design (never per-host, always per-op): device
  // op → the legacy fetch-to-data/remote-jsonl cache + local parse → honest
  // error. Capability-gated, so an un-upgraded daemon degrades silently.
  // LIVE SESSIONS DELIBERATELY SKIP THE DEVICE: the server owns the stdout
  // buffer overlay (the 2.74.0 position-preserving merge) and the live
  // normalizer, which the daemon-side service has no knowledge of — asking
  // the device there would drop the not-yet-flushed tail.
  let _devWarnedAt = 0;
  // B-9a2e part 1: the ops whose answer draws the person's own rows carry the rows VibeSpace noted for every id the read may consult
  // that the hub can name ({id: rows}, the PURE sent-provenance module's ONE helper sentFor — {} included, so the device never reads
  // an earlier op's rows) to an agent that names 'sent-rows'; an older agent is never sent a field it does not know
  const SENT_OPS = new Set(['page', 'turnmap', 'searchIndexed', 'gapSlab', 'fullTurnmap']);
  // …and when the agent's answer names ids its read consulted with nothing handed (`unhanded` — that op's own: a fork the hub never
  // saw made) that the hub holds rows for and may hand (SP.mayHandMore: linked to this conversation, or never noted for a
  // conversation of another machine), ONE more ask hands them (first: never cut by the cap) and they are remembered for that
  // conversation's next reads (per machine: 4 ids, 256 conversations); a failed second ask leaves the first answer
  const sentMore = new Map();
  async function tryDevice(r, method, params) {
    if (!r.host || !hosts?.deviceBounded) return undefined;
    if (liveWithHistory(r)) return undefined; // server-owned overlay wins
    try {
      const dm = await hosts.deviceBounded(r.host, 6000);
      if (!dm?.transcriptOp) return undefined;
      const caps = (await dm.connect?.())?.info?.capabilities;
      if (!caps?.includes?.('transcript-op')) return undefined;
      const dref = { backend: r.backend, sessionId: r.sessionId, cwd: r.cwd };
      if (!SENT_OPS.has(method) || !caps.includes('sent-rows')) return await dm.transcriptOp(method, dref, params || {});
      const SPh = require('./sent-provenance.js'), key = `${r.host}\n${r.sessionId}`;
      const from = [...(sentMore.get(key) || []).filter((id) => SPh.mayHandMore(id, r.sessionId, r.host)), ...(liveSession(r)?.forkedFrom || [])];   // a remembered id passes the gate again at every read
      const sent = SPh.sentFor(r.sessionId, from), info = {};
      const answer = await dm.transcriptOp(method, dref, { ...(params || {}), sent }, info);
      const more = (info.unhanded || []).filter((id) => !Object.prototype.hasOwnProperty.call(sent, id) && (SPh.rowsOf(id) || []).length > 0 && SPh.mayHandMore(id, r.sessionId, r.host)).slice(0, 4);
      if (!more.length) return answer;
      const kept = (sentMore.get(key) || []).filter((id) => !more.includes(id));
      sentMore.delete(key); sentMore.set(key, [...more, ...kept].slice(0, 4));   // the next read hands them in its first ask
      while (sentMore.size > 256) sentMore.delete(sentMore.keys().next().value);
      try { return await dm.transcriptOp(method, dref, { ...(params || {}), sent: SPh.sentFor(r.sessionId, [...more, ...from]) }); }   // the named ids first: never cut by the cap
      catch { return answer; }   // the first answer stands (today's for those ids)
    } catch (e) {
      // Degradation must be VISIBLE (the swallowed-degrade lesson): one log
      // per minute, then the legacy path runs — never a silent hang.
      if (Date.now() - _devWarnedAt > 60000) {
        _devWarnedAt = Date.now();
        console.warn(`[transcript] device read failed for ${r.host} (${method}) — falling back to the transcript cache:`, e.message);
      }
      return undefined;
    }
  }
  // Per-(host,session) throttle for the gap family: slabs hit this endpoint
  // once per scroll step, and old lines never change on an append-only file.
  const hostRefreshAt = new Map();
  const HOST_REFRESH_MS = 10000;

  const norm = (ref) => ({
    backend: ref.backend || 'claude',
    sessionId: ref.sessionId,
    cwd: ref.cwd || '',
    host: ref.host || null,
    memo: ref.memo && typeof ref.memo === 'object' ? ref.memo : null,   // ONE REQUEST, ONE READ (lane resume-all-paced L3 cure)
    webuiId: typeof ref.webuiId === 'string' && ref.webuiId ? ref.webuiId : null,   // B-952b smalls: the window's OWN conversation (a fork's)
    gone: typeof ref.gone === 'function' ? ref.gone : null,   // B-cd4b r1093: the asker hung up — a door that replies to nobody consumes no mark
  });
  // B-952b: a LIVE conversation's reader gets the session's own id (its key in activeSessions — the webui id the hub spawned its
  // wrapper with): the wrapper's side file is BUFFERS_DIR/<that id>.json (codex: its plan — the Properties «Agent steps» — its
  // running tasks, model and usage; claude: its streaming flag, its start, and its task state FIRST when the wrapper holds todos), as
  // ws-handler's attach builds it — Properties and the chat answer alike. With no id the side file
  // was never read on these roads: a codex conversation's steps answered [] everywhere. A stopped one has no side file here (a
  // kill removes it), so it gets none, as before.
  const liveIdOf = (session) => { if (!session) return undefined; for (const [id, s] of activeSessions) if (s === session) return id; return undefined; };
  // the request's reader of this conversation (its memo's, else a fresh one)
  const readerFor = (r, session) => {
    if (r.memo && r.memo.sm) return r.memo.sm;
    const sm = createSessionMessages(sessionShape(r, session), liveIdOf(session));
    if (r.memo) r.memo.sm = sm;
    return sm;
  };

  // B-952b smalls (主开发 03:40Z): the conversation the request NAMES first (`webuiId` — Properties sends it), then the first match ON
  // THE MACHINE the request names. While a fork shares its parent's thread id the one Properties window of that conversation key shows
  // the row the sidebar lists first (the newer one); the other routes name no webui id and take the first match
  /** Run `fn` (a conversion) under the device road's gate when `r` is a paired machine's conversation read HERE (the fallback). */
  const gateRun = (r, fn) => gatedRead({ host: r.host, conv: r.sessionId, from: liveSession(r)?.forkedFrom }, fn);
  const liveSession = (r) => {
    const sameConv = (s) => !!s && (s.backend || 'claude') === r.backend && (s.backendSessionId || s.claudeSessionId) === r.sessionId;
    if (r.webuiId) { const own = activeSessions.get(r.webuiId); if (sameConv(own)) return own; }
    for (const [, s] of activeSessions) {
      if (!sameConv(s) || (s.host || null) !== (r.host || null)) continue;
      return s;
    }
    return null;
  };
  // B-952b smalls: a reader's side file read OFF the loop before an answer reads it (every reader that keeps one has the loader:
  // claude's, codex's and the ACP reader — antigravity, opencode)
  const sideFileOf = async (sm) => { if (sm && typeof sm.loadWrapperMeta === 'function') { try { await sm.loadWrapperMeta(); } catch { } } return sm; };

  /** A live session whose normalizer already holds the FULL history — the
   *  only case where the server's in-memory view beats re-reading the file
   *  (and the only case that carries the un-flushed stdout tail). */
  const liveWithHistory = (r) => {
    const s2 = liveSession(r);
    return !!(s2?._normalizer && s2._normalizer.total > 0 && s2._historyLoaded);
  };

  /** ?host= transcript cache refresh. throttled=true is the gap-family mode.
   *  Returns an error MESSAGE (never throws): "no transcript" and "the
   *  machine holding it was unreachable" must stay distinguishable. */
  async function refreshRemote(r, { throttled = false } = {}) {
    if (!r.host || !hosts) return null;
    if (throttled) {
      const key = `${r.host}:${r.sessionId}`;
      if (Date.now() - (hostRefreshAt.get(key) || 0) <= HOST_REFRESH_MS) return null;
      hostRefreshAt.set(key, Date.now());
      if (hostRefreshAt.size > 512) hostRefreshAt.delete(hostRefreshAt.keys().next().value);
    }
    try {
      await hosts.fetchTranscript(r.host, r.backend || 'claude', r.sessionId); // descriptor store.remoteFind picks the find(1) expression + cache name (S3)
      return null;
    } catch (e) { return e.message; }
  }

  function sessionShape(r, session) {
    return session || {
      backend: r.backend,
      backendSessionId: r.sessionId,
      claudeSessionId: r.backend === 'claude' ? r.sessionId : null,
      cwd: r.cwd,
      buffer: '',
    };
  }

  /** The normalizer dance, ONE home: prefer the live session's normalizer —
   *  but only once the WS attach loaded full history into it (_historyLoaded;
   *  after a restart processLive fills it with partial buffer data first, and
   *  serving that truncated history/search/turnmap to a handful of buffer
   *  messages) — else rebuild from the merged JSONL+buffer view. */
  /** The task-state and status roads warm ONLY what they read (the agy chain's cure): the harness's own TASK-STATE warm
   *  (store.warmTaskState — claude's task-tool scan; only claude declares it), never its transcript warm — codex's walks the
   *  whole sessions store with a synchronous listing to find a rollout and may start a codex app-server for a thread this
   *  machine does not hold, at every Properties refetch. A harness with none warms nothing. Never throws. */
  async function taskWarmOf(r) {
    try { const warm = harnessOf(r.backend || 'claude').store?.warmTaskState; if (warm) await warm(r.sessionId, r.cwd, { remote: !!r.host, bulk: bulkOf(r) }); } catch { }
  }
  /** B-cd4b unit 2's follow (主开发 r1035): WHO IS BULK IS DECIDED BY THE CONVERSATION, not by the road that asks — the first history
   *  read of a conversation a paced «Resume all» created (its live session's `_bulkRead`, set by ws-create) is bulk on EVERY road
   *  that warms: the socket's first attach (ws-handler), this service's view and task warm, and codex's raw read — until a door
   *  replied it (THE DOORS, at the end of this factory) or a person's own act (personAsk, below). r1093: ONE REQUEST, ONE FIRST READ —
   *  the verdict is the request's, taken at its first door (`memo.bulk`): the history route's withStatus composite (page, status,
   *  turnmap on one memo) reads in one line. */
  function bulkOf(r) { return r.memo && typeof r.memo.bulk === 'boolean' ? r.memo.bulk : BULK.isBulk(liveSession(r)); }   // through the one place (src/bulk-read.js)
  /** A PERSON'S OWN ACT on a conversation whose history still waits (the creating page's quiet window: its pointer press, or the
   *  app going to it — src/lib/session-lifecycle.js): the conversation's bulk mark is cleared, and its warm is asked as a person's —
   *  it joins the one in flight for the file and moves it into the person's line (src/session-store.js promoteWarm). Never waits,
   *  never reads: the creating page's own history request lands it. A codex raw read already waiting keeps its place (its line has
   *  no move); the mark's clear serves its next. */
  function personAsk(ref) {
    const r = norm(ref);
    const live = liveSession(r);
    BULK.personAct(live);
    try { const warm = harnessOf(r.backend || 'claude').store?.warmTranscript; if (warm) Promise.resolve(warm(r.sessionId, r.cwd, { remote: !!r.host, ...(live ? { session: live } : {}) })).catch(() => { }); } catch { }
    return { ok: true, live: !!live };
  }
  async function view(ref) {
    const r = norm(ref);
    await refreshRemote(r);
    // through the harness descriptor (S3): claude = worker parse-cache warm,
    // codex = the 0.153 thread/read fallback for a MISSING rollout (B-21e4
    // item 5, local only); a harness without the hook skips
    // (B-299b A1: + the live session, when there is one — antigravity reads its account's cards for it; claude / codex ignore it)
    const live = liveSession(r);
    try { const warm = harnessOf(r.backend || 'claude').store?.warmTranscript; if (warm) await warm(r.sessionId, r.cwd, { remote: !!r.host, ...(live ? { session: live } : {}), bulk: bulkOf(r) }); } catch { }   // r1035: the conversation's own mark
    const session = liveSession(r);
    // An attach rebuild in flight: join it instead of converting again
    // (review-caught: the HTTP side re-entered the exact sync stall the
    // ws attach path had just shed — a scroll-up during the rebuild window).
    if (session?._rebuildPromise) { try { await session._rebuildPromise; } catch { } }
    if (session?._normalizer && session._normalizer.total > 0 && session._historyLoaded) {
      return { mm: session._normalizer, session };
    }
    if (r.memo && r.memo.view) return r.memo.view;   // this request converted it already (one request, one read)
    const sm = readerFor(r, session);
    if (typeof sm.rawAsync === 'function') await sm.rawAsync({ bulk: bulkOf(r) }); // lane resume-all-paced (L2): a store that reads its records off the loop does so first (codex) — r1035: in the bulk line while the conversation is a bulk resume's
    if (typeof sm.prepare === 'function') await sm.prepare(); // S9: a serve-backed reader (opencode stopped conversation) loads here — LOUD on failure, a user opened it
    const mm = createMessageManager(r.backend, 'api', { threadId: r.sessionId }); // the rendered conversation's id (codex ledger key)
    await gateRun(r, () => mm.convertHistoryAsync(sm.raw()));   // a paired machine's transcript read here: the device road's gate
    // row B-422c: a history the transcript reader refused (its kept copy, or the live buffer alone) is SAID in every answer built on
    // it — `notLoaded`, the page's «not loaded yet» — never a short history passed off as the whole one
    const notLoaded = sm.notLoaded || null;
    const notLoadedInfo = notLoaded ? { storageHung: !!sm.notLoadedStorage, retryAt: sm.notLoadedRetryAt || null, readerGone: !!sm.notLoadedReaderGone, readerCause: sm.notLoadedReaderCause || null, notKnownYet: !!sm.notLoadedNotKnown } : null;   // r1243: which door, when again; B-a60e (r2439): «not known yet» one more cause
    if (r.memo) r.memo.view = { mm, session, notLoaded, notLoadedInfo };
    return { mm, session, notLoaded, notLoadedInfo };
  }
  const saidOf = (v) => (v && v.notLoaded ? { notLoaded: v.notLoaded, ...(v.notLoadedInfo ? { storageHung: v.notLoadedInfo.storageHung, readerGone: !!v.notLoadedInfo.readerGone, readerCause: v.notLoadedInfo.readerCause || null, ...(v.notLoadedInfo.notKnownYet ? { notKnownYet: true } : {}), retryAt: v.notLoadedInfo.retryAt, retryIn: Number(v.notLoadedInfo.retryAt) ? Math.max(0, v.notLoadedInfo.retryAt - Date.now()) : null } : {}) } : {});   // retryIn: the delay from the hub's now (a page's clock is not the hub's)

  async function page(ref, { offset, limit, untilUuid } = {}) {
    const r0 = norm(ref);
    const viaDev = await tryDevice(r0, 'page', { offset, limit, untilUuid });
    if (viaDev) return viaDev;
    const v = await view(ref), { mm } = v;
    if (untilUuid) {
      const idx = mm.messages.findIndex((m) => m.uuid === untilUuid);
      const upto = idx >= 0 ? idx + 1 : mm.total;
      const start = Math.max(0, upto - 50);
      return { messages: mm.messages.slice(start, upto), total: upto, ...saidOf(v) };
    }
    if (offset !== undefined || limit !== undefined) {
      return { messages: mm.slice(parseInt(offset) || 0, parseInt(limit) || 50), total: mm.total, ...saidOf(v) };
    }
    // THE DEFAULT PAGE = the attach slab's rule (src/text-window.js) — the HTTP
    // withStatus read AND the daemon's `transcript-op page` (agentd bundles this
    // service), byte-identical by test-transcript-parity. An OLD daemon answers
    // tail(50); the client renders any N (nothing assumes 50).
    return { messages: mm.tailWindow(), total: mm.total, ...saidOf(v) };
  }

  async function turnmap(ref) {
    const viaDev = await tryDevice(norm(ref), 'turnmap', {});
    if (viaDev) return viaDev;
    const v = await view(ref), { mm } = v;
    return { turns: mm.turnMap(), total: mm.total, ...saidOf(v) };
  }

  async function searchIndexed(ref, q) {
    const viaDev = await tryDevice(norm(ref), 'searchIndexed', { q });
    if (viaDev) return viaDev;
    const v = await view(ref), { mm } = v;
    return { matches: mm.search(q), total: mm.total, ...saidOf(v) };
  }

  /** chatStatus + taskState + turnMap composite (the withStatus attach shape).
   *  Permission mode isn't recoverable from the JSONL — the live session's
   *  spawn-time mode merges in when the transcript carries none. */
  async function status(ref) {
    const r = norm(ref);
    const session = liveSession(r);
    const viaDev = await tryDevice(r, 'status', {});
    if (viaDev) {
      // permissionMode is NOT in the transcript — it only exists in the live
      // session's spawn args, so the merge stays server-side either way
      if (session?._permissionMode && viaDev.chatStatus && !viaDev.chatStatus.permissionMode) viaDev.chatStatus.permissionMode = session._permissionMode;
      return viaDev;
    }
    await taskWarmOf(r); // B-299b A2: the task-tool scan (claude) is read off the loop before taskState answers
    const sm = await sideFileOf(readerFor(r, session));
    if (typeof sm.rawAsync === 'function') await sm.rawAsync({ bulk: bulkOf(r) }); // lane resume-all-paced (L2): a store that reads its records off the loop does so first (codex) — r1035: in the bulk line while the conversation is a bulk resume's
    if (typeof sm.prepare === 'function') await sm.prepare(); // S9: a serve-backed reader (opencode stopped conversation) loads here — LOUD on failure, a user opened it
    const chatStatus = sm.chatStatus();
    if (session?._permissionMode && chatStatus && !chatStatus.permissionMode) {
      chatStatus.permissionMode = session._permissionMode;
    }
    return { chatStatus, taskState: sm.taskState?.() || null };
  }

  async function taskState(ref) {
    const r = norm(ref);
    // the cure's read (S1): the machine is asked only for a harness whose task state READS ITS TRANSCRIPT (the descriptor's
    // taskStateFromTranscript — claude); another's state is the wrapper's side file, read here as the release did — never a
    // device op or a remote find + copy at each Properties refetch for an answer that cannot differ (the route hands every
    // harness its machine; the descriptor decides what it is asked for)
    let fromTranscript = false; try { fromTranscript = harnessOf(r.backend || 'claude').store?.taskStateFromTranscript === true; } catch { }   // the descriptor's OWN field (its TAKEN verdict: never the warm hook read as a second meaning)
    const viaDev = fromTranscript ? await tryDevice(r, 'taskState', {}) : undefined;
    if (viaDev) return viaDev;
    const hostFetchError = fromTranscript ? await refreshRemote(r) : null;   // B-5cf8: the machine that failed is SAID (with its reason), never read as «no steps»
    const lastCopy = !hostFetchError && fromTranscript && r.host && hosts?.linkState?.(r.host) === 'offline' ? 'the machine does not answer' : null;   // …and so is one whose LAST COPY hosts served (an ssh failure with a cache)
    await taskWarmOf(r); // B-299b A2: GET /api/session-todos (a Properties window re-asks at every broadcast) — the scan off the loop
    const live = liveSession(r);
    const sm = await sideFileOf(createSessionMessages(sessionShape(r, live), liveIdOf(live)));   // B-952b: the live session's id — its wrapper's side file holds codex's plan, read off the loop
    if (typeof sm.prepare === 'function') await sm.prepare(); // S9: a serve-backed reader (opencode stopped conversation) loads here — LOUD on failure, a user opened it
    const st = sm.taskState() || {};
    return hostFetchError || lastCopy ? { ...st, hostFetchError: hostFetchError || lastCopy, ...(lastCopy ? { hostOffline: true } : {}) } : st;   // hostOffline: the page words it in the reader's language
  }

  // S3: the harness descriptor's store.locate owns "where does this
  // conversation live" — no backend ternary here (unknown ids throw in get()).
  function localTranscriptPath(r) {
    const h = harnessOf(r.backend || 'claude');
    if (!h.store || typeof h.store.locate !== 'function') return null;
    return h.store.locate(r.sessionId, r.cwd) || null;
  }
  function filePath(ref) {
    const r = norm(ref);
    return localTranscriptPath(r);
  }
  /** B-a60e remainder: the same, AWAITED where the harness declares it (codex: the rollout index — never a walk on this thread) */
  async function localTranscriptPathAsync(r) {
    const h = harnessOf(r.backend || 'claude');
    if (h.store && typeof h.store.locateAsync === 'function') return (await h.store.locateAsync(r.sessionId, r.cwd)) || null;
    return localTranscriptPath(r);
  }

  /** Huge-file seek family — switched to the device AS ONE UNIT (2.293.0,
   *  once the daemon gained a searchFull op). This family speaks in FILE LINE
   *  NUMBERS: serving gapInfo/slabs from the device while search read a local
   *  cache copy would put line offsets on TWO sources of truth and teleport
   *  the reader to the wrong place. So gapInfo returns an opaque HANDLE
   *  instead of a bare path — `device:<host>` when the device serves, else
   *  the local file path — and every follow-up (slab / search / turnmap)
   *  honours it. The route treats the handle as opaque (it only checks
   *  truthiness and passes it back), so the whole family switches atomically
   *  or not at all. Streaming search over the device degrades to ONE batch
   *  (no streaming op yet): matches still arrive as NDJSON, just together. */
  async function gapInfo(ref) {
    const r = norm(ref);
    const viaDev = await tryDevice(r, 'gapInfo', {});
    if (viaDev && viaDev.hasFile) return { gap: viaDev.gap, fp: DEVICE_HANDLE + r.host, hostFetchError: null };
    if (viaDev && viaDev.hasFile === false) return { gap: null, fp: null, hostFetchError: null };
    const hostFetchError = await refreshRemote(r, { throttled: true });
    const fp = await localTranscriptPathAsync(r);
    if (!fp || !fs.existsSync(fp)) return { gap: null, fp: null, hostFetchError };
    let gap = null, refused = null;
    try { gap = await jsonlGapInfoAsync(fp); } catch (e) { if (e && e.code === 'transcript_reader_restarting') refused = e; }   // row B-422c: the reader's refusal carried to the route, never «no gap»
    return { gap, fp, hostFetchError, ...(refused ? { refused } : {}) };
  }

  /** Normalize one raw line-range slab (subagent records dropped to match the
   *  display path; orphan tool calls acceptable for read-only browsing). */
  async function gapSlab(ref, fp, fromLine, toLine) {
    if (isDeviceHandle(fp)) {
      const r0 = norm(ref);
      const viaDev = await tryDevice(r0, 'gapSlab', { fromLine, toLine });
      if (viaDev) return viaDev.messages || [];
      return []; // handle said device; a mid-family fallback would mix line spaces
    }
    let records = [];
    try { records = await readJsonlLineRangeAsync(fp, fromLine, toLine); } catch (e) { if (e && e.code === 'transcript_reader_restarting') throw e; }   // row B-422c: the refusal reaches the route
    records = records.filter((rec) => !isSubagentMessage(rec));
    const r = norm(ref);
    const mm = createMessageManager(r.backend, 'gap', { threadId: r.sessionId }); // a slab carries no session_meta — only the reader knows the file
    gateRun(r, () => mm.convertHistory(records));   // a paired machine's slab read here: the device road's gate
    return mm.tail(mm.total);
  }

  async function searchFull(ref, fp, q) {
    if (isDeviceHandle(fp)) return (await tryDevice(norm(ref), 'searchFull', { q })) || { matches: [], truncated: false };
    return searchJsonlFull(fp, norm(ref).backend, q);
  }
  /** Device mode has no streaming op yet: run the device's one-shot search and
   *  replay its matches through onMatch, so the NDJSON contract is unchanged
   *  (results arrive together instead of trickling — honest degradation, and
   *  the wire carries matches, not the whole transcript). */
  async function searchFullStream(ref, fp, q, onMatch, opts) {
    if (isDeviceHandle(fp)) {
      const res = (await tryDevice(norm(ref), 'searchFull', { q })) || { matches: [], truncated: false };
      for (const m of (res.matches || [])) { if (opts?.signal?.aborted) break; onMatch(m); }
      return { total: (res.matches || []).length, truncated: !!res.truncated };
    }
    return searchJsonlFullStream(fp, norm(ref).backend, q, onMatch, opts);
  }
  async function fullTurnmap(ref, fp) {
    if (isDeviceHandle(fp)) {
      const viaDev = await tryDevice(norm(ref), 'fullTurnmap', {});
      return viaDev?.turns || [];
    }
    return scanJsonlUserTurnsAsync(fp, norm(ref).backend, require('./sent-provenance.js').rowsOf(norm(ref).sessionId));   // B-9a2e: the conversation's own record, as data (the PURE source: the hub's store on the hub, none on a device)
  }

  /** RESCUE (2.360.0, owner request after the 79928a2b 38MB poisoning): a
   *  transcript carrying MONSTER records (oversized single lines — shredded
   *  image pastes) kills resume (context overflow) AND blanks the history
   *  view (the tail window lands mid-line). Salvage = every oversized
   *  record's message content replaced IN PLACE by a short stub — same
   *  uuid/parent, so the chain, order and record count are untouched.
   *  Byte-preserved backup first; only rewritten lines are re-validated
   *  (untouched lines pass through byte-identical); atomic swap. Streamed —
   *  never blocks the loop on a multi-hundred-MB file. LOCAL only; refuses
   *  while any process still writes the file (the two-writer law). */
  async function rescue(ref, { maxLineBytes = 1024 * 1024 } = {}) {
    const r = norm(ref);
    if (r.hostId || r.host) throw new Error('rescue is local-only for now — copy the transcript here or run it on that machine');
    const fp = await localTranscriptPathAsync(r);
    if (!fp || isDeviceHandle(fp) || !fs.existsSync(fp)) throw new Error('transcript not found on this machine');
    try {
      require('child_process').execFileSync('fuser', [fp], { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
      throw new Error('a process is still writing this transcript — terminate the session first, then rescue');
    } catch (e) { if (/still writing/.test(e.message)) throw e; /* fuser exits 1 when nobody holds it */ }
    const sizeBefore = fs.statSync(fp).size;
    const backup = fp + '.pre-rescue-' + Date.now();
    fs.copyFileSync(fp, backup);
    const tmp = fp + '.rescue-tmp';
    const readline = require('readline');
    const rl = readline.createInterface({ input: fs.createReadStream(fp), crlfDelay: Infinity });
    const out = fs.createWriteStream(tmp, { mode: 0o600 });
    let lines = 0, replaced = 0, skipped = 0;
    for await (const line of rl) {
      lines++;
      if (line.length <= maxLineBytes) { if (!out.write(line + '\n')) await new Promise((res) => out.once('drain', res)); continue; }
      let stubbed = null;
      try {
        const d = JSON.parse(line);
        if (d && d.message && d.message.content !== undefined) {
          d.message.content = [{ type: 'text', text: `[rescued ${new Date().toISOString().slice(0, 10)}: an oversized ${Math.round(line.length / 1048576)}MB record was removed from this message — it broke resume and the history view. Full original preserved next to the transcript as ${backup.split('/').pop()}]` }];
          stubbed = JSON.stringify(d);
          JSON.parse(stubbed); // the ONLY rewritten bytes — must be valid
        }
      } catch { /* unparseable monster — drop below */ }
      if (stubbed) { replaced++; if (!out.write(stubbed + '\n')) await new Promise((res) => out.once('drain', res)); }
      else { skipped++; } // oversized AND unparseable/shape-unknown: dropping is safer than keeping poison
    }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    if (!replaced && !skipped) { try { fs.unlinkSync(tmp); fs.unlinkSync(backup); } catch { } return { replaced: 0, skipped: 0, lines, sizeBefore, sizeAfter: sizeBefore, backup: null }; }
    // B-ddf3 (THE LAW of B-9275: a file's new bytes are on disk before its name points at them): the backup and the rewritten
    // transcript are synced before the swap, on the thread pool (never the loop), so a power loss cannot leave the person's
    // transcript, or its only copy, empty. A failed sync is a failed rescue, said by name: nothing is swapped.
    for (const p of [backup, tmp]) {
      let h = null, fault = null;
      try { h = await fs.promises.open(p, 'r+'); await h.sync(); } catch (e) { fault = e; }
      if (h) { try { await h.close(); } catch (e) { fault = fault || e; } }   // a failed close fails the rescue too, said below
      if (fault) {
        await fs.promises.unlink(tmp).catch(() => { });
        throw new Error(`rescue: ${p === tmp ? 'the rewritten transcript' : 'its backup'} could not be put on disk (${fault.code || fault.message}) — nothing was replaced, the transcript is as it was${p === tmp ? ' (its backup: ' + backup + ')' : ''}`);
      }
    }
    fs.renameSync(tmp, fp);
    try { fs.chmodSync(fp, 0o600); } catch { }
    return { replaced, skipped, lines, sizeBefore, sizeAfter: fs.statSync(fp).size, backup };
  }

  /** lane chat-attachments-persist (the cut): A PICTURE FROM THE RECORD IT CAME IN — `params` = {agent, key, n} (a place,
   *  src/transcript-picture.js). On this machine: the transcript worker finds the file through the harness's own locate and
   *  answers the picture's byte span {ok, mediaType, fp, start, end, dev, ino}; on a paired machine: its agent answers with
   *  the SAME reader {ok, mediaType, b64} — asked ONLY when its hello-ack names `transcript-picture` (an agent without it is
   *  never asked: an unknown op would hang), else {oldAgent: true}. {gone: why} | {unknown: true} | {unavailable: true}. */
  async function picture(ref, params = {}) {
    const r = norm(ref);
    const q = { backend: r.backend, tx: r.sessionId, cwd: r.cwd, agent: params.agent || null, key: params.key, n: params.n };
    if (r.host) {
      if (!hosts?.deviceBounded) return { unavailable: true };
      try {
        const dm = await hosts.deviceBounded(r.host, 6000);
        const caps = (await dm?.connect?.())?.info?.capabilities;
        if (!dm?.transcriptOp || !Array.isArray(caps) || !caps.includes('transcript-picture')) return { oldAgent: true };
        return await dm.transcriptOp('picture', { backend: r.backend, sessionId: r.sessionId, cwd: r.cwd }, { agent: q.agent, key: q.key, n: q.n });
      } catch (e) { return { unavailable: true, why: String((e && e.message) || e).slice(0, 120) }; }
    }
    return picturePool().call('picture', q);
  }
  /** THE DEVICE'S ANSWER (its agent's transcript-op `picture`): the same reader over this machine's own transcript, the
   *  picture's base64 text included (the hub decodes it). */
  async function pictureHere(ref, params = {}) {
    const r = norm(ref);
    const TP = require('./transcript-picture.js');
    const fp = await TP.placeFile({ backend: r.backend, tx: r.sessionId, cwd: r.cwd, agent: params.agent || null }, { locate: async (id, cwd) => localTranscriptPathAsync({ ...r, sessionId: id, cwd }) });
    if (!fp) return { unknown: true };
    const out = await TP.reader().find({ fp, backend: r.backend, key: params.key, n: Number(params.n), withText: true });
    return out.ok ? { ok: true, mediaType: out.mediaType, b64: out.b64 } : out;
  }

  // THE DOORS (B-cd4b, 主开发 r1093): THE MARK IS CONSUMED AT THE DOORS, NEVER INSIDE A ROAD. Every entry this service answers that
  // replies a conversation's history or its facts consumes its bulk mark WHEN IT REPLIES (src/bulk-read.js `replied`), whatever served
  // the reply — the local read, the hub's own copy (a live normalizer holding the whole history), the paired machine, a fallback — so
  // an early return, or an entry added later, cannot skip it: EVERY export is a door but the ones NOT_DOORS names, each with its
  // reason. A door whose reply FAILS (it throws: a refusal, the pager's bound) or whose asker is gone (`gone`) consumes nothing: the
  // retry is still the first read. The request's verdict is taken at its first door (bulkOf, above).
  const NOT_DOORS = {
    filePath: 'the file\'s place on this machine — it reads none of it',
    refreshRemote: 'pulls the paired machine\'s copy into the cache — it replies an error or nothing, never the history',
    rescue: 'a person\'s repair of the file (POST) — it replies what it rewrote; the page then reads the history through a door',
    picture: 'one picture\'s bytes out of a message the page already shows (its history replied first)',
    pictureHere: 'the picture read on this machine (the same)',
    personAsk: 'a person\'s own act (bulk-read personAct) — it reads nothing',
    bulkOf: 'the verdict\'s reader',
  };
  const door = (fn) => (ref, ...rest) => {
    const r = norm(ref || {});
    const live = () => (r.sessionId ? liveSession(r) : null);
    if (r.memo && typeof r.memo.bulk !== 'boolean') r.memo.bulk = BULK.isBulk(live());   // the request's verdict, before any road reads
    const said = (out) => !!(out && out.notLoaded) || !!(r.memo && r.memo.view && r.memo.view.notLoaded);   // «not loaded» — this answer's, or the same request's history (主开发 r2246: the status beside a page that said it)
    const reply = (out) => { if (!(r.gone && r.gone()) && !said(out)) BULK.replied(live()); return out; };   // THE consume — here and nowhere in a road (row B-422c at the move: a «not loaded» answer is a refusal said: it consumes nothing)
    const out = fn(ref, ...rest);
    return out && typeof out.then === 'function' ? out.then(reply) : reply(out);
  };
  const api = { view, page, turnmap, searchIndexed, status, taskState, filePath, gapInfo, gapSlab, searchFull, searchFullStream, fullTurnmap, refreshRemote, rescue, picture, pictureHere, personAsk, bulkOf };
  for (const k of Object.keys(api)) if (!Object.prototype.hasOwnProperty.call(NOT_DOORS, k)) api[k] = door(api[k]);
  return api;
}

module.exports = { createTranscriptService, gatedRead };

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

function createTranscriptService({ activeSessions, createSessionMessages, hosts }) {
  // Per-(host,session) throttle for the gap family: slabs hit this endpoint
  // once per scroll step, and old lines never change on an append-only file.
  const hostRefreshAt = new Map();
  const HOST_REFRESH_MS = 10000;

  const norm = (ref) => ({
    backend: ref.backend || 'claude',
    sessionId: ref.sessionId,
    cwd: ref.cwd || '',
    host: ref.host || null,
  });

  const liveSession = (r) => {
    for (const [, s] of activeSessions) {
      if ((s.backend || 'claude') !== r.backend) continue;
      if ((s.backendSessionId || s.claudeSessionId) === r.sessionId) return s;
    }
    return null;
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
      if (r.backend === 'codex') await hosts.fetchCodexJsonl(r.host, r.sessionId);
      else await hosts.fetchSessionJsonl(r.host, r.sessionId);
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
  async function view(ref) {
    const r = norm(ref);
    await refreshRemote(r);
    if (r.backend === 'claude') {
      try { await warmSessionJsonlAsync(r.sessionId, r.cwd); } catch { }
    }
    const session = liveSession(r);
    if (session?._normalizer && session._normalizer.total > 0 && session._historyLoaded) {
      return { mm: session._normalizer, session };
    }
    const sm = createSessionMessages(sessionShape(r, session));
    const mm = createMessageManager(r.backend, 'api');
    mm.convertHistory(sm.raw());
    return { mm, session };
  }

  async function page(ref, { offset, limit, untilUuid } = {}) {
    const { mm } = await view(ref);
    if (untilUuid) {
      const idx = mm.messages.findIndex((m) => m.uuid === untilUuid);
      const upto = idx >= 0 ? idx + 1 : mm.total;
      const start = Math.max(0, upto - 50);
      return { messages: mm.messages.slice(start, upto), total: upto };
    }
    if (offset !== undefined || limit !== undefined) {
      return { messages: mm.slice(parseInt(offset) || 0, parseInt(limit) || 50), total: mm.total };
    }
    return { messages: mm.tail(50), total: mm.total };
  }

  async function turnmap(ref) {
    const { mm } = await view(ref);
    return { turns: mm.turnMap(), total: mm.total };
  }

  async function searchIndexed(ref, q) {
    const { mm } = await view(ref);
    return { matches: mm.search(q), total: mm.total };
  }

  /** chatStatus + taskState + turnMap composite (the withStatus attach shape).
   *  Permission mode isn't recoverable from the JSONL — the live session's
   *  spawn-time mode merges in when the transcript carries none. */
  async function status(ref) {
    const r = norm(ref);
    const session = liveSession(r);
    const sm = createSessionMessages(sessionShape(r, session));
    const chatStatus = sm.chatStatus();
    if (session?._permissionMode && chatStatus && !chatStatus.permissionMode) {
      chatStatus.permissionMode = session._permissionMode;
    }
    return { chatStatus, taskState: sm.taskState?.() || null };
  }

  async function taskState(ref) {
    const r = norm(ref);
    await refreshRemote(r);
    const sm = createSessionMessages(sessionShape(r, liveSession(r)));
    return sm.taskState() || {};
  }

  function filePath(ref) {
    const r = norm(ref);
    return r.backend === 'codex'
      ? findCodexSessionJsonlPath(r.sessionId)
      : findSessionJsonlPath(r.sessionId, r.cwd);
  }

  /** Huge-file seek family. gapInfo → {gap, fp, hostFetchError}. */
  async function gapInfo(ref) {
    const r = norm(ref);
    const hostFetchError = await refreshRemote(r, { throttled: true });
    const fp = filePath(ref);
    if (!fp || !fs.existsSync(fp)) return { gap: null, fp: null, hostFetchError };
    let gap = null;
    try { gap = await jsonlGapInfoAsync(fp); } catch { }
    return { gap, fp, hostFetchError };
  }

  /** Normalize one raw line-range slab (subagent records dropped to match the
   *  display path; orphan tool calls acceptable for read-only browsing). */
  async function gapSlab(ref, fp, fromLine, toLine) {
    let records = [];
    try { records = await readJsonlLineRangeAsync(fp, fromLine, toLine); } catch { }
    records = records.filter((rec) => !isSubagentMessage(rec));
    const r = norm(ref);
    const mm = createMessageManager(r.backend, 'gap');
    mm.convertHistory(records);
    return mm.tail(mm.total);
  }

  function searchFull(ref, fp, q) { return searchJsonlFull(fp, norm(ref).backend, q); }
  function searchFullStream(ref, fp, q, onMatch, opts) { return searchJsonlFullStream(fp, norm(ref).backend, q, onMatch, opts); }
  function fullTurnmap(ref, fp) { return scanJsonlUserTurnsAsync(fp, norm(ref).backend); }

  return { view, page, turnmap, searchIndexed, status, taskState, filePath, gapInfo, gapSlab, searchFull, searchFullStream, fullTurnmap, refreshRemote };
}

module.exports = { createTranscriptService };

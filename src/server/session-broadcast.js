'use strict';
// THE SESSION BROADCAST CHOKE POINT (server.js broadcastToSession, moved here
// by perf lane chunk D so the suites drive the REAL function over fake ws
// clients). Every frame for a session's attached clients passes through
// `broadcastToSession(session, id, msg)`; since chunk D it also:
//
//  ① STAMPS `seq` on the session's OWN normalizer ops (`msg` frames whose
//    sessionId is the session's id — a subagent virtual session's frames ride
//    the parent's clients map but are not the parent's ops and stay unstamped)
//    from the session's ring (src/op-seq.js), serializing each frame ONCE — the
//    ring keeps that exact text, so a resume replays byte-identical frames;
//
//  ② CUTS a client whose send queue is past the limit — ONLY one that
//    advertised `caps:['op-seq']` on its attach AND has been answered by an
//    `attached` since (a client that cannot answer `lagged`, or has no view yet
//    to answer it, keeps today's unbounded delivery: never a silent drop). The
//    cut sends ONE `lagged {sessionId, normEpoch, seq}` (seq = the last frame
//    that client was handed), records telemetry `ws-lagged` with the queue
//    size, and skips that session's stamped frames for that client until it
//    re-attaches (its attach replaces the clients-map entry).
//
// `armResume(session, ws)` is called by the attach handler right after it
// wrote `attached` to the socket: from then on the entry is eligible for the
// cut and any earlier lagged mark is void (the attached payload — slab or
// replay — covers everything before it).

const { createOpRing, laggedVerdict, resumeVerdict, attachedWithReplay, OP_SEQ_CAP, LAGGED_LIMIT_BYTES } = require('../op-seq.js');

const WS_OPEN = 1;

/** The session's ring, created on its first stamped frame (every creation
 *  site — ws-create, boot-restore's two — gets one without a line each). */
function opRingOf(session) {
  if (!session._opRing) session._opRing = createOpRing();
  return session._opRing;
}

/** The capability list a client advertised on its attach — strings only, bounded. */
function clientCaps(data) {
  const c = data && data.caps;
  return Array.isArray(c) ? c.filter((x) => typeof x === 'string' && x.length <= 32).slice(0, 16) : null;
}

const hasOpSeqCap = (entry) => !!(entry && Array.isArray(entry.caps) && entry.caps.includes(OP_SEQ_CAP));

/** After `attached` went out on this socket: the entry may be cut from now on,
 *  and no earlier cut stands (the payload covers everything before it). */
function armResume(session, ws) {
  const entry = session && session.clients && session.clients.get(ws);
  if (!entry) return;
  entry.resumeArmed = true;
  entry.lagged = null;
}

/** The attach's rung for this session and this request (`data.sinceSeq`,
 *  `data.sinceEpoch`) — the ring is created here if the session has none yet,
 *  so a client that attached before the first op still resumes (sinceSeq 0). */
function resumeFor(session, data) {
  return resumeVerdict({ ring: opRingOf(session), normEpoch: session._normEpoch || 0, sinceSeq: data && data.sinceSeq, sinceEpoch: data && data.sinceEpoch });
}

/** The `attached` frame text: every live fact in `livePayload` + `opSeq` (the
 *  capability advert, both rungs), then EITHER the ring's frames verbatim with
 *  `slab:'held'` OR the slab `slabOf()` computes (called only on that rung —
 *  a held resume never builds the text window or the turn map). */
function attachedFrameText(livePayload, resume, slabOf) {
  if (resume && resume.held) return attachedWithReplay({ ...livePayload, opSeq: resume.opSeq, slab: 'held' }, resume.replay);
  return JSON.stringify({ ...livePayload, opSeq: resume ? resume.opSeq : 0, ...(slabOf ? slabOf() : {}) });
}

function createSessionBroadcast({ limitBytes = LAGGED_LIMIT_BYTES, event = (name, detail) => global.__vsEvent?.(name, detail), log = console } = {}) {
  function broadcastToSession(session, id, msg) {
    let seq = 0, json;
    if (msg && msg.type === 'msg' && msg.sessionId === id) {
      const r = opRingOf(session).push(msg);
      seq = r.seq; json = r.frame;
    } else {
      json = JSON.stringify(msg);
    }
    for (const [client, entry] of session.clients) {
      if (client.readyState !== WS_OPEN) continue;
      if (seq && entry && entry.lagged) continue; // cut: this client resumes by seq when it re-attaches
      if (seq && entry && entry.resumeArmed && hasOpSeqCap(entry)) {
        const v = laggedVerdict({ bufferedAmount: client.bufferedAmount, limitBytes });
        if (v.lagged) {
          entry.lagged = { normEpoch: session._normEpoch || 0, seq: seq - 1 };
          try { client.send(JSON.stringify({ type: 'lagged', sessionId: id, normEpoch: entry.lagged.normEpoch, seq: entry.lagged.seq })); } catch { }
          try { event('ws-lagged', `${v.bufferedAmount} bytes queued > ${v.limitBytes} sid=${String(id).slice(0, 24)} seq=${seq - 1}`); } catch { }
          try { log.warn?.(`[ws] ${id}: a client stopped draining (${v.bufferedAmount} bytes queued) — told it is lagged at seq ${seq - 1}; its frames resume on re-attach`); } catch { }
          continue;
        }
      }
      try { client.send(json); } catch { }
    }
  }
  return { broadcastToSession };
}

module.exports = { createSessionBroadcast, armResume, clientCaps, opRingOf, hasOpSeqCap, resumeFor, attachedFrameText, WS_OPEN };

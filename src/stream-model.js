'use strict';
/**
 * THE WEBRTC STREAM RUNG — PURE decisions (design q-041 r2 §2 传输 / 客户端 / 输入 + §3 P1/P1b, lane stream-p1a-transport;
 * owner 2026-10-16 「一起做」: the picture AND the input ride the same WebRTC session). Imports only the PURE ladder table;
 * the daemon (src/agentd/stream-host.js), the hub (src/server/desktop-webrtc.js) and the page (src/lib/stream-view.js) all
 * ask THIS file, so the three cannot disagree:
 *
 *   STREAM_CODEC / STREAM_LIMITS     the one codec offered (H.264 constrained baseline, packetization-mode 1, NACK + PLI +
 *                                    transport-cc) and every bound (sessions per agent, poll, orphan grace, restart budget …)
 *   streamRungVerdict(facts)         may THIS machine's desktop open as a stream, and from which source — judged against the
 *                                    `webrtc` row of DISPLAY_BACKENDS (its `needs` = the AGENT's capabilities) → { take, source,
 *                                    code, why }; every "no" is named and the window shows the VNC picture
 *   streamStep(st, event)            THE SIGNALING STATE MACHINE the page runs (idle → starting → offered → connecting → playing
 *                                    ⇄ restarting → fallback | stopped) → { state, restarts, action, code }
 *   fallbackVerdict(facts)           when a sick connection becomes a fallback to the VNC picture (after the restart budget)
 *   videoToSource(pt, box, video, origin)   a point on the <video> element → the source's pixel (letterbox aware) + origin
 *   INPUT_KINDS / inputEventOf(raw)  the data channel's event table, validated (what the daemon accepts; anything else is
 *                                    refused by name, never guessed) · wheelUnitsOf(deltaY, deltaMode)
 *   statsOf(prev, reports, now)      the stats strip's numbers from RTCPeerConnection.getStats(): RTT, jitter, fps, decode ms,
 *                                    kbps, lost, the path (direct | relay)
 *   relayFrame / relayUnframe        a datagram + its peer address over the device link's byte stream (the hub's UDP relay)
 *   relayCandidates(ips, port)       the hub relay's ICE candidate lines (typ relay — the lowest priority: a direct pair wins)
 */
const B = require('./desktop-backends.js');

const STREAM_CODEC = Object.freeze({
  mimeType: 'video/H264',
  clockRate: 90000,
  // constrained baseline 3.1: every browser's hardware (and software) decoder takes it; mode 1 = single NAL + FU-A
  fmtp: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
  rtcpFeedback: Object.freeze([Object.freeze({ type: 'nack' }), Object.freeze({ type: 'nack', parameter: 'pli' }), Object.freeze({ type: 'transport-cc' })]),
});
const STREAM_SOURCES = Object.freeze(['screen', 'fake']);
const STREAM_LIMITS = Object.freeze({
  maxKbpsDefault: 8000, maxKbpsMin: 300, maxKbpsMax: 50000,
  sessionsPerAgent: 2,        // a daemon serves at most two live streams (a desk window and a phone beside it)
  orphanMs: 20000,            // a session whose device link died waits this long for the hub's re-arm, then stops
  idleMs: 30000,              // the hub stops a session no page polled for this long (the page closed without a word)
  pollMaxMs: 25000,           // one long poll's longest wait
  statsMs: 1000,              // the daemon's stats push, and the page's getStats read
  connectMs: 15000,           // offer → connected, else the page falls back
  restartBudget: 2,           // ICE restarts the page asks for before it falls back to the VNC picture
  disconnectedGraceMs: 4000,  // `disconnected` this long counts as sick (a Wi-Fi blip recovers inside it)
  relayMaxDatagram: 1500, relayMaxPeers: 4, relayQueueBytes: 262144,
  inputMaxBytes: 70000, clipMaxChars: 65536, fakeMaxBytes: 8 * 1024 * 1024,
});
const RUNG_ID = 'webrtc';

/**
 * May this machine's desktop open as a WebRTC stream? `capabilities` = the agent's hello-ack list; `desktop` = it is a
 * Windows / macOS machine (the access layer's verdict); `fakeSource` = the instance names a fake source file (tests,
 * demos — its path, handed back as `sourceId`). The source: 'screen' when the agent captures its screen (the `stream-screen` capability — part B), else 'fake' when configured.
 * → { take, source, sourceId, code, why }
 */
function streamRungVerdict({ capabilities = [], desktop = false, fakeSource = null, table = B.DISPLAY_BACKENDS } = {}) {
  const row = B.backendById(RUNG_ID, table);
  const caps = Array.isArray(capabilities) ? capabilities : [];
  if (!row || row.wired === false) return { take: false, source: null, code: 'not_wired', why: 'the WebRTC stream rung is not wired on this instance' };
  if (!desktop) return { take: false, source: null, code: 'not_desktop_machine', why: 'a stream shows a Windows or macOS machine\'s desktop' };
  const met = row.needs.find((group) => group.every((c) => /^agent:/.test(c) && caps.includes(c.slice(6))));
  if (!met) return { take: false, source: null, code: 'agent_too_old', why: 'the machine\'s agent cannot stream yet — update it' };
  if (caps.includes('stream-screen')) return { take: true, source: 'screen', sourceId: null, code: null, why: null };
  if (fakeSource) return { take: true, source: 'fake', sourceId: String(fakeSource), code: null, why: null };
  return { take: false, source: null, code: 'no_screen_source', why: 'the machine\'s agent cannot capture its screen yet' };
}

// ── THE SIGNALING STATE MACHINE (the page's) ────────────────────────────────────────────────────────────────────────
const STREAM_STATES = Object.freeze(['idle', 'starting', 'offered', 'connecting', 'playing', 'restarting', 'fallback', 'stopped']);
const STREAM_EVENTS = Object.freeze(['start', 'refused', 'offer', 'answered', 'connected', 'frame', 'disconnected', 'failed', 'restart-offer', 'ended', 'timeout', 'close']);
const TERMINAL = new Set(['fallback', 'stopped']);
/** One step: `st` = { state, restarts }, `ev` = { type, code? } → { state, restarts, action, code }. Actions: 'start' (ask the
 *  hub for an offer), 'answer' (answer the offer in hand), 'wait', 'restart' (ask the hub for an ICE-restart offer),
 *  'fallback' (show the VNC picture, saying `code`), 'dispose', 'none'. An event a state does not take changes nothing. */
function streamStep(st, ev, { budget = STREAM_LIMITS.restartBudget } = {}) {
  const state = st && STREAM_STATES.includes(st.state) ? st.state : 'idle';
  const restarts = Math.max(0, Number(st && st.restarts) || 0);
  const type = ev && ev.type;
  const code = (ev && ev.code) || null;
  const to = (s, action, c = null, r = restarts) => ({ state: s, restarts: r, action, code: c });
  if (TERMINAL.has(state)) return to(state, 'none', null);
  if (type === 'close') return to('stopped', 'dispose');
  if (type === 'ended') return to('fallback', 'fallback', code || 'stream_ended');
  switch (state) {
    case 'idle': return type === 'start' ? to('starting', 'start') : to(state, 'none');
    case 'starting':
      if (type === 'offer') return to('offered', 'answer');
      if (type === 'refused') return to('fallback', 'fallback', code || 'refused');
      if (type === 'timeout') return to('fallback', 'fallback', 'start_timeout');
      return to(state, 'none');
    case 'offered':
      if (type === 'answered') return to('connecting', 'wait');
      if (type === 'failed' || type === 'timeout') return to('fallback', 'fallback', code || 'answer_failed');
      return to(state, 'none');
    case 'connecting':
    case 'restarting':
      // a FIRST connection plays at its first decoded frame; a restarted one plays again the moment ICE is back (the
      // <video> keeps its last frame and shows the next one — there is no "first" frame to wait for). Either resets the
      // count: the budget is CONSECUTIVE restarts, so a link that blips once an hour never exhausts it
      if (type === 'frame' || (type === 'connected' && state === 'restarting')) return to('playing', 'none', null, 0);
      if (type === 'connected') return to(state, 'none');
      if (type === 'restart-offer') return to('restarting', 'answer');
      if (type === 'answered') return to(state, 'wait');
      if (type === 'failed' || type === 'timeout' || type === 'disconnected') return restarts < budget ? to('restarting', 'restart', code || type, restarts + 1) : to('fallback', 'fallback', code || (type === 'timeout' ? 'connect_timeout' : 'ice_failed'));
      return to(state, 'none');
    case 'playing':
      if (type === 'failed' || type === 'disconnected') return restarts < budget ? to('restarting', 'restart', code || type, restarts + 1) : to('fallback', 'fallback', code || 'ice_failed');
      if (type === 'restart-offer') return to('restarting', 'answer');
      return to(state, 'none');
    default: return to(state, 'none');
  }
}

/** Is the connection SICK now? `pc` = the RTCPeerConnection's connectionState, `since` = when it entered it. `failed` is sick
 *  at once; `disconnected` after its grace (consent freshness can recover a blip). → { sick, event } */
function fallbackVerdict({ pc = 'new', since = 0, now = 0, graceMs = STREAM_LIMITS.disconnectedGraceMs } = {}) {
  if (pc === 'failed' || pc === 'closed') return { sick: true, event: 'failed' };
  if (pc === 'disconnected') return now - since >= graceMs ? { sick: true, event: 'disconnected' } : { sick: false, event: null };
  return { sick: false, event: null };
}

// ── COORDINATES ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** A point on the <video> element (client px) → the SOURCE's pixel. `box` = the element's rect {left, top, width,
 *  height}; `video` = the picture's intrinsic size {w, h} (object-fit: contain ⇒ letterboxed, centred); `origin` = where the
 *  source sits on the machine's desktop (a display's top-left; 0,0 for the whole screen). A point in the letterbox clamps
 *  to the picture's edge and says `inside: false`. → { x, y, inside } | null (nothing decoded yet) */
function videoToSource(pt, box, video, origin = { x: 0, y: 0 }) {
  if (!pt || !box || !video || !(video.w > 0) || !(video.h > 0) || !(box.width > 0) || !(box.height > 0)) return null;
  const s = Math.min(box.width / video.w, box.height / video.h);
  const dw = video.w * s, dh = video.h * s;
  const ox = box.left + (box.width - dw) / 2, oy = box.top + (box.height - dh) / 2;
  const fx = (pt.x - ox) / s, fy = (pt.y - oy) / s;
  const inside = fx >= 0 && fy >= 0 && fx < video.w && fy < video.h;
  const x = Math.min(video.w - 1, Math.max(0, Math.floor(fx))), y = Math.min(video.h - 1, Math.max(0, Math.floor(fy)));
  return { x: x + ((origin && origin.x) || 0), y: y + ((origin && origin.y) || 0), inside };
}

// ── THE INPUT CHANNEL (P1b): one JSON object per data-channel message ─────────────────────────────────────────────────
/** t → the fields it carries. Coordinates are SOURCE pixels plus the source's origin (the page did the mapping); the
 *  daemon's injector turns them into the desktop's absolute pointer. Keys are PHYSICAL (`c` = the DOM `code`, after the
 *  viewer → host primary-modifier move of src/lib/modifier-map.js); the daemon looks the scan code up. */
const INPUT_KINDS = Object.freeze({
  mv: Object.freeze({ fields: ['x', 'y'], what: 'pointer moved' }),
  md: Object.freeze({ fields: ['x', 'y', 'b'], what: 'pointer button down (b: 0 left, 1 middle, 2 right)' }),
  mu: Object.freeze({ fields: ['x', 'y', 'b'], what: 'pointer button up' }),
  wh: Object.freeze({ fields: ['x', 'y', 'dx', 'dy'], what: 'wheel (120 = one notch; dy > 0 = away from the person, up)' }),
  kd: Object.freeze({ fields: ['c'], what: 'key down (DOM code)' }),
  ku: Object.freeze({ fields: ['c'], what: 'key up' }),
  clip: Object.freeze({ fields: ['text'], what: 'this computer\'s clipboard text becomes the machine\'s' }),
  ack: Object.freeze({ fields: ['f'], what: 'a frame was shown (f = its RTP timestamp) — the latency read' }),
});
const COORD = 32767;
const CODE_RE = /^[A-Za-z][A-Za-z0-9]{0,23}$/;
const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);
/** A data-channel message (string or object) → the validated event `{ t, … }`, or `{ refused: code }`. Never throws. */
function inputEventOf(raw) {
  let o = raw;
  if (typeof raw === 'string') { if (raw.length > STREAM_LIMITS.inputMaxBytes) return { refused: 'too_big' }; try { o = JSON.parse(raw); } catch { return { refused: 'not_json' }; } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { refused: 'not_an_event' };
  const kind = INPUT_KINDS[o.t];
  if (!kind || !Object.prototype.hasOwnProperty.call(INPUT_KINDS, o.t)) return { refused: 'unknown_kind' };
  const ev = { t: o.t };
  for (const f of kind.fields) {
    if (f === 'c') { if (typeof o.c !== 'string' || !CODE_RE.test(o.c)) return { refused: 'bad_code' }; ev.c = o.c; continue; }
    if (f === 'text') { if (typeof o.text !== 'string' || o.text.length > STREAM_LIMITS.clipMaxChars) return { refused: 'bad_text' }; ev.text = o.text; continue; }
    if (f === 'b') { const b = int(o.b); if (b === null || b < 0 || b > 2) return { refused: 'bad_button' }; ev.b = b; continue; }
    if (f === 'f') { const v = int(o.f); if (v === null || v < 0 || v > 0xffffffff) return { refused: 'bad_frame' }; ev.f = v; continue; }
    const v = int(o[f]);
    if (v === null || v < -COORD || v > COORD) return { refused: 'bad_' + f };
    ev[f] = v;
  }
  return ev;
}
/** A DOM WheelEvent's deltaY → wheel units (120 = one notch, positive = away from the person, the desktop's convention).
 *  deltaMode 0 = pixels (≈ 100 per notch in Chrome), 1 = lines (3 per notch), 2 = pages. Clamped to ±10 notches. */
function wheelUnitsOf(delta, mode = 0) {
  const d = Number(delta) || 0;
  const notches = mode === 1 ? d / 3 : mode === 2 ? d * 3 : d / 100;
  return Math.max(-1200, Math.min(1200, Math.round(-notches * 120)));
}

// ── THE STATS STRIP (getStats → numbers) ───────────────────────────────────────────────────────────────────────────
/** `reports` = the RTCStatsReport's values (an array of stat objects); `prev` = the last answer (deltas need it). → { at,
 *  rttMs, jitterMs, fps, decodeMs, kbps, lost, width, height, path, frames, bytes, decodeS } — a number is null when the
 *  browser does not report it yet. `path` = 'relay' when the chosen pair's remote end is the hub's relay. */
function statsOf(prev, reports, now) {
  const list = Array.isArray(reports) ? reports : [];
  const byId = new Map(list.map((r) => [r.id, r]));
  const v = list.find((r) => r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) || null;
  const transport = list.find((r) => r.type === 'transport' && r.selectedCandidatePairId);
  const pair = (transport && byId.get(transport.selectedCandidatePairId)) || list.find((r) => r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') || null;
  const remote = pair ? byId.get(pair.remoteCandidateId) : null;
  const frames = v && Number.isFinite(v.framesDecoded) ? v.framesDecoded : null;
  const bytes = v && Number.isFinite(v.bytesReceived) ? v.bytesReceived : null;
  const decodeS = v && Number.isFinite(v.totalDecodeTime) ? v.totalDecodeTime : null;
  const dt = prev && Number.isFinite(prev.at) && now > prev.at ? (now - prev.at) / 1000 : null;
  const df = dt && frames != null && prev.frames != null ? frames - prev.frames : null;
  const fps = v && Number.isFinite(v.framesPerSecond) ? Math.round(v.framesPerSecond) : df != null && dt ? Math.round(df / dt) : null;
  const decodeMs = df > 0 && decodeS != null && prev.decodeS != null ? Math.round(((decodeS - prev.decodeS) / df) * 10000) / 10 : prev && prev.decodeMs != null ? prev.decodeMs : null;
  const kbps = dt && bytes != null && prev.bytes != null ? Math.round(((bytes - prev.bytes) * 8) / dt / 1000) : null;
  return {
    at: now, frames, bytes, decodeS, fps, decodeMs, kbps,
    rttMs: pair && Number.isFinite(pair.currentRoundTripTime) ? Math.round(pair.currentRoundTripTime * 1000) : null,
    jitterMs: v && Number.isFinite(v.jitter) ? Math.round(v.jitter * 1000) : null,
    lost: v && Number.isFinite(v.packetsLost) ? v.packetsLost : null,
    width: v && Number.isFinite(v.frameWidth) ? v.frameWidth : null,
    height: v && Number.isFinite(v.frameHeight) ? v.frameHeight : null,
    path: remote ? (remote.candidateType === 'relay' ? 'relay' : 'direct') : null,
  };
}

// ── THE HUB'S UDP RELAY over the device link (NAT: direct first, else the hub forwards) ─────────────────────────────────
/** One datagram + its peer (IPv4 a.b.c.d, port) → a frame for the byte stream: u16 length | 4 address bytes | u16 port |
 *  the payload. A datagram over the bound, or a non-IPv4 peer, is refused (null) — dropped, like UDP drops. */
function relayFrame(ip, port, payload) {
  const parts = String(ip || '').split('.').map(Number);
  const p = payload instanceof Uint8Array ? payload : null;
  if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x) || x < 0 || x > 255) || !Number.isInteger(port) || port <= 0 || port > 65535 || !p || p.length > STREAM_LIMITS.relayMaxDatagram) return null;
  const out = new Uint8Array(8 + p.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 6 + p.length);
  out.set(parts, 2);
  dv.setUint16(6, port);
  out.set(p, 8);
  return out;
}
/** The byte stream so far → { frames: [{ ip, port, payload }], rest } (rest = an unfinished frame's bytes). A frame whose
 *  length is out of bounds poisons the stream: `bad: true` (the caller closes the relay). */
function relayUnframe(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(0);
  const frames = [];
  let off = 0;
  while (b.length - off >= 2) {
    const len = (b[off] << 8) | b[off + 1];
    if (len < 6 || len > 6 + STREAM_LIMITS.relayMaxDatagram) return { frames, rest: b.subarray(off), bad: true };
    if (b.length - off < 2 + len) break;
    const ip = `${b[off + 2]}.${b[off + 3]}.${b[off + 4]}.${b[off + 5]}`;
    const port = (b[off + 6] << 8) | b[off + 7];
    frames.push({ ip, port, payload: b.subarray(off + 8, off + 2 + len) });
    off += 2 + len;
  }
  return { frames, rest: b.subarray(off), bad: false };
}
/** The hub relay's ICE candidates (one per hub IPv4), typ relay with the lowest type preference — a direct host pair
 *  that works always wins; the relay is what is left when none does. → candidate strings (no `a=` prefix). */
function relayCandidates(ips, port) {
  const out = [];
  (Array.isArray(ips) ? ips : []).forEach((ip, i) => {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip)) || !(port > 0 && port <= 65535)) return;
    const priority = (0 << 24) + ((65535 - i) << 8) + 255;
    out.push(`candidate:vsrelay${i} 1 udp ${priority} ${ip} ${port} typ relay raddr 0.0.0.0 rport 0 generation 0`);
  });
  return out;
}

module.exports = {
  STREAM_CODEC, STREAM_SOURCES, STREAM_LIMITS, RUNG_ID, streamRungVerdict, STREAM_STATES, STREAM_EVENTS, streamStep, fallbackVerdict,
  videoToSource, INPUT_KINDS, inputEventOf, wheelUnitsOf, statsOf, relayFrame, relayUnframe, relayCandidates,
};

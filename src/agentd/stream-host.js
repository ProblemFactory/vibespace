'use strict';
/**
 * THE STREAM HOST — the daemon's WebRTC sessions (DEVICE: inside agentd, on the paired machine; design q-041 r2 §2 传输 + §3
 * P1/P1b, lane stream-p1a-transport). A session is ONE werift RTCPeerConnection with ONE H.264 video track (the source's
 * access units, packetized here — src/stream-h264.js) and ONE ordered data channel `input` (the person's pointer, keys and
 * clipboard text into THE daemon's injector — src/input-inject.js — and frame acks). werift brings NACK retransmits (its
 * RTP cache), PLI (→ the source's next key frame) and the transport-cc feedback; THE ESTIMATE is made here (lane
 * stream-mac-rate — werift 0.25's own counts ~one packet a picture, ~300 kbps whatever is sent): each packet recorded under
 * the transport-cc number in its own header, each feedback read by src/stream-plan.js twccPackets → sendEstimator → the
 * source's setTargetKbps (its rate rule judges it — THE RATE), capped by `maxKbps`.
 *
 * THE OPS (agentd.js answers each by id, `op` on the reply — the three-touch rule):
 *   stream-offer  {sid, sourceKind, sourceId?, maxKbps?, relay?}  → { ok, sid, offer, source, relayPort } — the offer goes
 *                 out at once; its ICE candidates follow as `stream-ice` pushes ({candidate: null} = the last)
 *                 {sid, iceRestart: true}                         → a restart offer for the same session (new ICE credentials)
 *   stream-answer {sid, answer?, candidate?}                      → { ok } — the browser's SDP answer / a trickled candidate
 *   stream-stop   {sid, why?}                                     → { stopped } — `why` names the end (the page's × =
 *                 closed, 停止串流 = stopped, the picker's 停止, the viewer gone — lane stream-window-fixes); the source's stop
 *                 gets it (a window's logs it with its children's exits)
 *   stream-stats  {sid, watch?}                                   → the session's numbers now; `watch` = THIS link owns the
 *                 session's pushes from now on (the hub's re-arm after a reconnect)
 *   desktop-input {sid, events}                                   → { ok, n, refused: [{i, code}], display } — lane desktop-handover:
 *                 an agent the owner handed the machine's desktop to — ITS records (the data channel's own shapes, the
 *                 picture's pixels + the source's origin) into THIS session's sink: the same onInput as the `input`
 *                 channel (the window's live place, the Mac's target), in the AGENT's lane — the owner's lane goes first,
 *                 an owner record drops the agent's unsent ones (`{ partial, cancelled: 'owner_input', sent, of }`); at most
 *                 handoverEventsMax records an op (`too_many_events`) — fix r2
 *   desktop-grab  {sid}                                           → { ok, png64, w, h, display, origin, road } — ONE still of the
 *                 session's display (the source's still(): the screen source's one-frame capture; a Mac's is pending)
 *   pushes        stream-ice {sid, candidate} · stream-stats {sid, stats, state, ended?} once a second and at every change
 * A session's owner is the link that asked; when that link dies the session is an ORPHAN for STREAM_LIMITS.orphanMs (the
 * media path does not ride the link — a re-armed hub finds it playing) and then stops.
 *
 * THE HDR ROAD (lane stream-hdr-passthrough — q-041 r3 P4 road B): `stream-offer {hdr: true}` (the page's screen is HDR and its
 * browser decodes WebRTC AV1 in hardware — src/hdr-viewer.js) to a source that `offersAv1` (src/agentd/stream-screen.js: an HDR
 * display, an AV1 10-bit encoder) offers AV1 FIRST, then H.264 (src/stream-model.js streamCodecsOf); werift sends the codec the
 * browser's answer put first, and at `connected` — before the source starts — the source is told it (`useCodec`): AV1 ⇒ PQ 10-bit
 * temporal units (`{ tu, key, ts90k }`, packetized by src/stream-av1.js), anything else ⇒ its SDR plan. Not asked, or a source
 * that cannot: the offer is the H.264 one, unchanged.
 * THE SOURCE INTERFACE: `{ kind, origin: {x, y}, start(onAccessUnit, onEnd?), stop(), requestKeyframe(), setTargetKbps(kbps),
 * stats?() }` where `onAccessUnit({ nalus: Buffer[], key, ts90k })` is called once per encoded picture, in order
 * (src/stream-h264.js splits Annex-B) and `onEnd(code)` = the source died — the session ends by that name. Here: the FAKE
 * source — a pre-encoded Annex-B file looped at its frame rate (scripts/fixtures/stream/); 'screen' = the agent's `screen`
 * factory (lane stream-p1b-screen: src/agentd/stream-screen.js — the machine's own desktop, ffmpeg + the HDR mapping),
 * refused by name where none is given. stats() lands in the session's numbers as `screen` (+ its `encodeMs`). 'window' = ONE
 * window of the machine: the agent's `window` factory (lane stream-p2w-build: src/agentd/stream-window-source.js — ONE
 * application window of a Windows machine, Windows.Graphics.Capture), else the screen factory (lane stream-p3m-build: a
 * Mac's — src/agentd/stream-mac.js takes the window's id as `sourceId`; int304). A source with `inputTarget()` (the Mac's:
 * where the picture sits, its scale) hands it to the injector with every event — the page sends the picture's pixels, the
 * machine adds the live origin. A `relative` source (a Windows window) takes WINDOW pixels from the page: every pointer
 * event gets the window's LIVE place added here (src/stream-window.js windowInputOf — held inside the window), so a window
 * that moves while streamed still gets its clicks.
 *
 * ICE: werift is an ICE-LITE agent with host candidates only and NO STUN/TURN server (its default asks Google's public STUN
 * server — never here); the page is the controlling full agent.
 * THE RELAY (NAT: direct first, else the hub forwards — design §2): with `relay`, a loopback TCP listener takes the hub's
 * ONE forward (dm.tcpForward) carrying framed datagrams (src/stream-model.js relayFrame); each remote address gets a local
 * UDP shim socket that talks to werift's own host candidate, so werift sees the far end as a peer-reflexive 127.0.0.1 peer
 * and the browser sees the hub's UDP port (the `typ relay` candidate the hub adds). Bounded: relayMaxPeers shims, a
 * datagram ≤ relayMaxDatagram, a stalled forward drops (UDP semantics), never queues past relayQueueBytes.
 * THE UDP LEG (lane stream-relay-udp — a Windows firewall blocks every inbound UDP to the agent, so no direct pair forms, and
 * the device link carries only what the link carries: 5 fps measured): with `relayLeg` {port, key, hosts} the daemon opens
 * its OWN UDP socket and PINGs the hub relay's port (src/stream-model.js legControl — HMAC under the session's key, a rising
 * counter + a nonce) at each of the hub's addresses and the host it dials; the first authenticated PONG names the hub's
 * address and the leg is UP: the shims' datagrams go out as leg DATA, the hub's DATA come in to the same shims. Nothing on
 * the machine listens for anyone — the firewall lets in the answers to what the agent sent. A PING every legKeepaliveMs
 * keeps the NAT / firewall state (every legLiveMs while the picture rides it). HYSTERESIS (lane stream-leg-flap — the
 * owner's Mac, 2 × 4K over Tailscale, dropped to the device link at every late PONG and back 3 s later, three times in
 * 20 s, the picture black): a PING unanswered for legEchoMs is a MISS — the picture stays on the leg and the next PING goes
 * at once (a late PONG still counts); legMissMax misses IN A ROW = DOWN: the device link carries the datagrams again
 * (re-asked every legReprobeMs; a PONG brings the leg back); a socket error drops one datagram and is counted, never a
 * verdict. The ladder: direct
 * (ICE-lite host pairs) → the hub relay over this leg → the hub relay over the device link. Said on the record (stats
 * `relay.via` + `relay.leg`, the log) and on the strip.
 * THE FIREWALL FACT: once a session's offer is made, a datagram from a second socket of ours to each of our host addresses
 * (the ones werift offers) says whether a DIRECT inbound path is plausible (Windows' firewall filters that the way it filters a
 * browser's) — stats `directInbound` {verdict, addrs, reached, program}; the page builds the admin line from `program`.
 */
const fs = require('fs');
const net = require('net');
const dgram = require('dgram');
const crypto = require('crypto');
const SM = require('../stream-model.js');
const SP = require('../stream-plan.js'); // THE ESTIMATE (twccPackets, sendEstimator)
const SW = require('../stream-window.js');
const H = require('../stream-h264.js');
const AV1 = require('../stream-av1.js'); // lane stream-hdr-passthrough: the HDR road's RTP payloads

const L = SM.STREAM_LIMITS;
const TWCC_URI = 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01';
/** THE ESTIMATE on a werift sender (lane stream-mac-rate): every RTP packet recorded under the transport-cc number in ITS header
 *  (werift notes it after the await, under the transport's current number — the burst's last), every feedback read by
 *  SP.twccPackets (werift's `packetResults` drops vector chunks and misnumbers runs) → SP.sendEstimator → onKbps. Wired once
 *  the sender's DTLS transport and its negotiated extension exist (the session's `connected`) → the estimator, or null. */
function wireEstimate(sender, onKbps) {
  const bwe = sender && sender.senderBWE, dt = sender && sender.dtlsTransport;
  const ext = (sender && Array.isArray(sender.headerExtensions) ? sender.headerExtensions : []).find((e) => e && e.uri === TWCC_URI);
  if (!bwe || !dt || !ext || typeof dt.sendRtp !== 'function' || typeof bwe.receiveTWCC !== 'function') return null;
  const est = SP.sendEstimator(), send = dt.sendRtp.bind(dt), rx = bwe.receiveTWCC.bind(bwe);
  dt.sendRtp = async (payload, header) => {
    const x = header && Array.isArray(header.extensions) ? header.extensions.find((e) => e && e.id === ext.id) : null;
    const size = await send(payload, header);
    if (x && x.payload && x.payload.length >= 2) est.sent(x.payload.readUInt16BE(0), size, Date.now());
    return size;
  };
  bwe.receiveTWCC = (fb) => { try { rx(fb); } catch { /* werift's own (its congestion flag) */ } const k = est.feedback(SP.twccPackets(fb)); if (k != null) onKbps(k); };
  return est;
}
const SID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const named = (code, error) => ({ ok: false, code, error });

/** THE FAKE SOURCE: an Annex-B file of whole access units, looped at `fps`; a keyframe request jumps to the next key. */
function fakeSource(file, { fps = 30 } = {}) {
  const f = String(file || '');
  if (!/^(\/|[A-Za-z]:[\\/])/.test(f) || !/\.h264$/i.test(f)) return named('bad_source', 'the fake source is an absolute path to an .h264 (Annex-B) file');
  let buf;
  try { const st = fs.statSync(f); if (!st.isFile() || st.size > L.fakeMaxBytes) return named('bad_source', `the fake source must be a file of at most ${L.fakeMaxBytes} bytes`); buf = fs.readFileSync(f); } catch (e) { return named('bad_source', `the fake source cannot be read (${(e && e.code) || 'error'})`); }
  const aus = H.accessUnits(H.splitNalus(buf));
  const first = H.keyIndexAfter(aus, 0);
  if (!aus.length || first < 0) return named('bad_source', 'the fake source holds no key frame');
  let i = first, n = 0, timer = null, wantKey = false;
  const step = Math.round(90000 / fps);
  return {
    ok: true, kind: 'fake', origin: { x: 0, y: 0 }, fps, frames: aus.length, keys: aus.filter((a) => a.key).length,
    start(onAccessUnit) {
      if (timer) return;
      timer = setInterval(() => {
        if (wantKey) { wantKey = false; i = H.keyIndexAfter(aus, i); }
        const au = aus[i];
        onAccessUnit({ nalus: au.nalus, key: au.key, ts90k: (n * step) >>> 0, index: i });
        i = (i + 1) % aus.length; n++;
      }, 1000 / fps);
      timer.unref?.();
    },
    stop() { clearInterval(timer); timer = null; },
    still: () => Promise.resolve(fakeStill()), // lane desktop-handover: a fixed picture of the fixture's size (the suites' desktop-grab)
    requestKeyframe() { wantKey = true; },
    setTargetKbps() { /* pre-encoded: nothing to follow */ },
  };
}

/** The fake source's still (lane desktop-handover): the fixture's 1280×720, a horizontal ramp in red, a vertical one in green, the
 *  blue channel 0x5a — a suite reads any pixel back by arithmetic. */
const FAKE_STILL = Object.freeze({ w: 1280, h: 720 });
function fakeStill() {
  const { w, h } = FAKE_STILL;
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0, o = 0; y < h; y++) for (let x = 0; x < w; x++, o += 3) { rgb[o] = (x * 255 / (w - 1)) | 0; rgb[o + 1] = (y * 255 / (h - 1)) | 0; rgb[o + 2] = 0x5a; }
  const png = Buffer.from(SP.pngOf(rgb, w, h, (b) => require('zlib').deflateSync(b)));
  return { ok: true, png, w, h, display: 'fake', origin: { x: 0, y: 0 }, road: 'fake' };
}

/**
 * THE UDP LEG, the daemon's half (one per relayed session). `spec` = the hub's {port, key (base64, 32 bytes), hosts}; `extra`
 * = more hosts to try (the host this daemon dials); `onData(ip, port, payload)` = a browser's datagram the hub sent over the
 * leg (→ the shims); `onChange(leg)` = UP / DOWN (the stats push, the log). Injectable for the fast suite: `now`, `socket`
 * (a dgram-like {bind, send, on, close, address}), `timer: false` (the suite calls tick()); `missMax` = the misses in a row
 * that make it DOWN (the suites' RED control hands in 1 — the .330 rule). → the leg | null (a bad spec)
 */
function createLeg(spec, { extra = [], onData = () => { }, onChange = () => { }, log = () => { }, now = Date.now, socket = null, timer = true, random = crypto.randomBytes, missMax = L.legMissMax } = {}) {
  const key = spec && typeof spec.key === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(spec.key) ? Buffer.from(spec.key, 'base64') : null;
  const port = spec && Number.isInteger(spec.port) && spec.port > 0 && spec.port <= 65535 ? spec.port : 0;
  if (!key || key.length !== SM.LEG.keyBytes || !port) return null;
  const hostOk = (h) => typeof h === 'string' && h.length <= 253 && /^[A-Za-z0-9.-]+$/.test(h);
  const targets = [...new Set([...(Array.isArray(extra) ? extra : []), ...(Array.isArray(spec.hosts) ? spec.hosts : [])].filter(hostOk))].slice(0, L.legTargets);
  if (!targets.length) return null;
  const mac = (b) => crypto.createHmac('sha256', key).update(b).digest().subarray(0, SM.LEG.macBytes);
  const sock = socket || dgram.createSocket('udp4');
  const g = { state: 'probing', why: null, target: null, targets, port, counter: 0, pending: new Map(), lastPingAt: 0, heardAt: 0, sent: false,
    rttMs: null, pings: 0, pongs: 0, up: 0, down: 0, stray: 0, misses: 0, missed: 0, sendErrors: 0, since: now(), changes: [], closed: false, timer: null };
  const setState = (st, why = null) => {
    if (g.state === st) return;
    g.state = st; g.why = why; g.since = now();
    g.changes.push({ at: g.since, state: st, why }); if (g.changes.length > 8) g.changes.shift();
    log(st === 'up' ? `relay leg up: udp to ${g.target.ip}:${g.target.port} (rtt ${g.rttMs} ms)` : `relay leg ${st}${why ? ` (${why})` : ''} — the device link carries the stream`);
    try { onChange(g); } catch { /* the host's */ }
  };
  const ping = () => {
    if (g.closed) return;
    g.counter = (g.counter + 1) >>> 0;
    const nonce = random(SM.LEG.nonceBytes);
    const pkt = SM.legControl(SM.LEG.PING, { flags: g.state === 'up' ? SM.LEG.UP : 0, counter: g.counter, nonce, mac });
    g.pending.set(g.counter, { nonce: Buffer.from(nonce), at: now() });
    while (g.pending.size > 8) g.pending.delete(g.pending.keys().next().value);
    g.lastPingAt = now(); g.sent = false; g.pings++;
    for (const t of g.target ? [g.target] : g.targets.map((h) => ({ ip: h, port }))) { try { sock.send(Buffer.from(pkt), t.port, t.ip); } catch { /* the next one */ } }
  };
  sock.on('message', (msg, from) => {
    if (g.closed) return;
    const p = SM.legParse(msg, mac);
    if (!p) return;
    if (p.type === 'pong') {
      const want = g.pending.get(p.counter);
      if (!p.ok || !want || !Buffer.from(p.nonce).equals(want.nonce) || from.port !== port || (g.target && from.address !== g.target.ip)) { g.stray++; return; }
      for (const c of [...g.pending.keys()]) if (c <= p.counter) g.pending.delete(c);
      g.rttMs = Math.max(0, now() - want.at); g.pongs++; g.heardAt = now(); g.misses = 0; // an answer — a late one too — ends the run of misses
      if (!g.target) g.target = { ip: from.address, port };
      if (g.state !== 'up') { setState('up'); ping(); } // the hub hears at once that the picture now rides the leg
      return;
    }
    if (p.type === 'data') {
      if (!g.target || from.address !== g.target.ip || from.port !== port) { g.stray++; return; }
      g.heardAt = now(); g.down++;
      try { onData(p.ip, p.port, p.payload); } catch { /* the shim's */ }
    }
  });
  sock.on('error', () => { if (!g.closed) g.sendErrors++; }); // one datagram dropped (a Mac's ENOBUFS under a burst): counted — the echo judges the leg
  /** One datagram of werift's toward a browser → the hub over the leg. → false when the leg is not up (the link's turn). */
  g.send = (ip, p, payload) => {
    if (g.closed || g.state !== 'up' || !g.target) return false;
    const pkt = SM.legData(ip, p, payload);
    if (!pkt) return true; // over the bound: dropped, like UDP
    try { sock.send(Buffer.from(pkt.buffer, pkt.byteOffset, pkt.length), g.target.port, g.target.ip); g.up++; g.sent = true; } catch { return false; }
    return true;
  };
  g.tick = () => {
    if (g.closed) return;
    const t = now();
    let fresh = 0, missedNow = 0; // a PING past legEchoMs is a MISS once (it stays pending: its late PONG still counts)
    for (const v of g.pending.values()) { if (v.missed) continue; if (t - v.at >= L.legEchoMs) { v.missed = true; missedNow++; } else fresh++; }
    if (missedNow) {
      if (g.state === 'up') { g.misses += missedNow; g.missed += missedNow; if (g.misses >= missMax) { g.pending.clear(); setState('down', 'no_echo'); } }
      else { g.pending.clear(); if (g.state !== 'down') setState('down', 'no_echo'); } // never up: the device link carried it all along
    }
    const every = g.state === 'up' ? (g.sent ? L.legLiveMs : L.legKeepaliveMs) : g.state === 'probing' ? L.legProbeMs : L.legReprobeMs;
    if (g.state === 'up' ? !fresh && (missedNow > 0 || t - g.lastPingAt >= every) : t - g.lastPingAt >= every) ping(); // up: a miss is re-asked at once
  };
  g.facts = () => ({ state: g.state, why: g.why, target: g.target ? `${g.target.ip}:${g.target.port}` : null, rttMs: g.rttMs, pings: g.pings, pongs: g.pongs, up: g.up, down: g.down, stray: g.stray, misses: g.misses, missed: g.missed, sendErrors: g.sendErrors, since: g.since });
  g.close = () => { g.closed = true; clearInterval(g.timer); try { sock.close(); } catch { /* gone */ } };
  if (timer) { g.timer = setInterval(g.tick, 250); g.timer.unref?.(); }
  if (socket) ping(); else sock.bind(0, () => ping());
  return g;
}

/** THE FIREWALL SELF-PROBE: one token per address, sent from a second socket of ours to a socket of ours on each of `addrs` (the
 *  host addresses werift offers); what arrives within probeWaitMs was reachable. → src/stream-model.js directInboundOf(…) +
 *  { reachedAddrs, ms } */
function selfProbe(addrs, { now = Date.now, waitMs = L.probeWaitMs } = {}) {
  const list = [...new Set((Array.isArray(addrs) ? addrs : []).filter((a) => /^\d{1,3}(\.\d{1,3}){3}$/.test(a) && !a.startsWith('127.')))];
  const t0 = now();
  if (!list.length) return Promise.resolve({ ...SM.directInboundOf({ addrs: [] }), reachedAddrs: [], ms: 0 });
  return new Promise((resolve) => {
    const rx = dgram.createSocket('udp4'), tx = dgram.createSocket('udp4');
    const tokens = list.map(() => crypto.randomBytes(12)), reached = new Set();
    let done = false;
    const finish = () => { if (done) return; done = true; try { rx.close(); } catch { } try { tx.close(); } catch { } const r = list.filter((a, i) => reached.has(i)); resolve({ ...SM.directInboundOf({ addrs: list, reached: r }), reachedAddrs: r, ms: now() - t0 }); };
    rx.on('message', (m) => { const i = tokens.findIndex((tk) => tk.equals(m)); if (i >= 0) reached.add(i); if (reached.size === list.length) finish(); });
    rx.on('error', finish); tx.on('error', () => { });
    rx.bind(0, () => tx.bind(0, () => {
      const send = () => { if (!done) list.forEach((a, i) => { try { tx.send(tokens[i], rx.address().port, a); } catch { /* unreachable */ } }); };
      send(); setTimeout(send, Math.round(waitMs / 3)).unref?.();
      setTimeout(finish, waitMs).unref?.();
    }));
  });
}

/** A host made without a screen factory (the suites' bare hosts) refuses the screen by name. */
function screenSource() { return named('no_screen_source', 'this agent cannot capture its screen'); }

/** The sources by kind (src/stream-model.js STREAM_SOURCES names them); `screen` / `window` = the agent's factories (async) —
 *  a 'window' with no window factory rides the screen factory (a Mac's helper takes a window id too — int304). */
const SOURCES = Object.freeze({
  fake: (msg) => fakeSource(msg.sourceId),
  screen: (msg, o, f) => (f.screen ? f.screen(msg, o) : screenSource(msg)),
  window: (msg, o, f) => (f.window ? f.window(msg, o) : f.screen ? f.screen(msg, o) : named('no_window_source', 'this agent cannot stream one window')),
});

function createStreamHost({ injector = null, log = () => { }, now = Date.now, loadWerift = () => require('werift'), screen = null, window = null, legHosts = () => [], program = process.platform === 'win32' ? process.execPath : null, pasteBackMs = L.pasteBackMs } = {}) {
  const sessions = new Map();
  let probeMemo = null; // the self-probe's answer, kept probeMemoMs (a second session within it asks nothing)
  let displaysKnown = 0; // lane desktop-display-modes: how many displays the machine's screen source last named (THE CAP's input)
  let W = null;
  const werift = () => W || (W = loadWerift());
  const pushTo = (s, msg) => { if (!s.owner) return; try { s.owner.control(msg); } catch { /* the link died: the onDead path makes it an orphan */ } };

  function statsOf(s) {
    const t = now();
    const dt = Math.max(1, t - s.mark.at) / 1000;
    const st = {
      fps: Math.round((s.frames - s.mark.frames) / dt), kbps: Math.round(((s.bytes - s.mark.bytes) * 8) / dt / 1000),
      frames: s.frames, dropped: s.dropped, encodeMs: null, // the screen source's encoder reports it (below); a pre-encoded source spends none
      bweKbps: s.bweKbps, congested: s.congested, keyRequests: s.keyRequests, codec: s.codec, // lane stream-hdr-passthrough: what is sent (AV1 | H264)
      input: { n: s.inputN, refused: s.inputRefused, dropped: s.inputDropped }, ackMs: s.ackMs,
      source: s.source ? s.source.kind : null,
      relay: s.relay ? { peers: s.relay.shims.size, forwarded: s.relay.fwd, port: s.relay.port, via: s.leg && s.leg.state === 'up' ? 'udp' : 'link', leg: s.leg ? s.leg.facts() : null } : null,
      directInbound: s.directInbound,
    };
    if (s.source && typeof s.source.stats === 'function') { try { st.screen = s.source.stats(); st.encodeMs = st.screen.encodeMs; } catch { /* the source's */ } }
    s.mark = { at: t, frames: s.frames, bytes: s.bytes };
    return st;
  }
  const stateOf = (s) => (s.pc ? s.pc.connectionState : 'closed');
  function pushStats(s) { pushTo(s, { op: 'stream-stats', sid: s.sid, stats: statsOf(s), state: stateOf(s) }); }

  function stop(sid, why = 'stopped') {
    const s = sessions.get(sid);
    if (!s) return false;
    sessions.delete(sid);
    clearInterval(s.statsTimer); clearTimeout(s.orphanTimer); clearTimeout(s.failTimer);
    if (s.agentQ.length || s.agentHeld.size || s.inFlight === 'agent') { dropAgent(s, 'stream_ended'); pump(s); } // the agent's rest is not typed into a desktop nobody watches
    try { s.source && s.source.stop(why); } catch { /* gone */ }
    if (s.leg) s.leg.close();
    if (s.relay) s.relay.close();
    pushTo(s, { op: 'stream-stats', sid, stats: statsOf(s), state: 'closed', ended: why });
    try { s.pc && s.pc.close(); } catch { /* gone */ }
    log(`[stream] ${sid} ended (${why})`);
    return true;
  }

  // ── the input channel: TWO LANES into one injector (verify r1 (A) → lane desktop-handover-fix-r2) — the owner's (the data
  // channel) and the agent's (`desktop-input`); ONE record in flight at a time, the owner's first whenever both wait. An owner
  // record DROPS the agent's unsent ones (their op answers partial, cancelled owner_input) and what the agent's sent records hold
  // down (keys, a button) comes up before the owner's record lands — no stuck modifier. The owner's moves are coalesced while
  // the owner's lane is behind. Every path answers the event's own outcome ({ refused } | { dropped } | { ack } | { done: a
  // promise of the injector's answer, or { cancelled } }) — the `input` channel ignores it, the `desktop-input` op sums it
  function onInput(s, raw, lane = 'owner') {
    let ev = SM.inputEventOf(typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
    if (ev.refused) { s.inputRefused = { code: ev.refused, at: now() }; return { refused: ev.refused }; }
    if (s.source && s.source.relative && typeof s.source.bounds === 'function') ev = SW.windowInputOf(ev, s.source.bounds()); // window pixels → the desktop (the window's live place)
    if (lane === 'owner' && s.source && s.source.inputScale) ev = SP.scaledInputOf(ev, s.source.inputScale); // lane desktop-display-modes ②: the page's points on a smaller picture → the display's (an agent's come from the full-size still)
    if (ev.t === 'ack') { const sent = s.sentAt.get(ev.f); if (sent) { s.acks.push(now() - sent); if (s.acks.length > 30) s.acks.shift(); s.ackMs = [...s.acks].sort((a, b) => a - b)[s.acks.length >> 1]; } return { ack: true }; }
    if (!injector) { s.inputRefused = { code: 'input_unsupported', at: now() }; return { refused: 'input_unsupported' }; }
    if (lane === 'owner') {
      if (ev.t === 'mv' && s.ownerQ.length + (s.inFlight === 'owner' ? 1 : 0) > 8) { s.inputDropped++; return { dropped: true }; }
      if (s.agentQ.length || s.agentHeld.size || s.inFlight === 'agent') dropAgent(s, 'owner_input');
      if (ev.t === 'clip') clipKeep(); // the owner's own clipboard: no put-back over it
    }
    const target = s.source && typeof s.source.inputTarget === 'function' ? s.source.inputTarget() : undefined; // a Mac's picture → its global points
    const done = new Promise((resolve) => { (lane === 'owner' ? s.ownerQ : s.agentQ).push({ lane, ev, target, resolve }); });
    pump(s);
    return { done };
  }
  /** The agent's unsent records answer { cancelled: why }; its held keys / button come up at the pump's next turn. */
  function dropAgent(s, why) {
    for (const it of s.agentQ.splice(0)) it.resolve({ cancelled: why });
    s.releaseDue = true;
  }
  const injectOne = (x) => (x.target === undefined ? injector.inject([x.ev]) : injector.inject([x.ev], x.target));
  /** What the agent's injected records hold down: a key up / button up per press, in press order (released in reverse). */
  function holdStep(held, it) {
    const e = it.ev;
    if (e.t === 'kd') held.set('k' + e.c, { ev: { t: 'ku', c: e.c }, target: it.target });
    else if (e.t === 'ku') held.delete('k' + e.c);
    else if (e.t === 'md') held.set('b' + e.b, { ev: { t: 'mu', x: e.x, y: e.y, b: e.b }, target: it.target });
    else if (e.t === 'mu') held.delete('b' + e.b);
  }
  async function pump(s) {
    if (s.pumping) return;
    s.pumping = true;
    try {
      for (;;) {
        if (s.releaseDue) {
          s.releaseDue = false;
          const up = [...s.agentHeld.values()].reverse();
          s.agentHeld.clear();
          for (const x of up) { const r = await injectOne(x).catch(() => null); if (r && r.n) s.inputN += r.n; }
          continue;
        }
        const it = s.ownerQ.length ? s.ownerQ.shift() : s.agentQ.shift();
        if (!it) break;
        s.inFlight = it.lane;
        let r;
        try { r = await injectOne(it); } catch (e) { r = { ok: false, n: 0, refused: [{ code: 'inject_failed', error: String((e && e.message) || e) }] }; }
        s.inFlight = null;
        if (r && r.n) { s.inputN += r.n; if (it.lane === 'agent') holdStep(s.agentHeld, it); }
        if (r && r.refused && r.refused.length) { const was = s.inputRefused && s.inputRefused.code; s.inputRefused = { code: r.refused[0].code, at: now() }; if (was !== s.inputRefused.code) pushStats(s); }
        it.resolve(r);
      }
    } finally { s.pumping = false; }
  }
  // THE AGENT'S PASTE puts the machine's clipboard back (lane desktop-handover-fix-r2): the injector saves what it holds (on the
  // machine — it never crosses the link) before the agent's first `clip`, and puts it back pasteBackMs after the paste while the
  // clipboard still holds the agent's text (a copy made meanwhile wins); the owner's own clip cancels it. An injector without a
  // clipboard read (the Mac's helper, the Linux stub) has no `clip` — the agent's text stays there (the manual says so).
  let clipBack = null; // { timer, text } — host-wide: the injector (and the machine's clipboard) is one
  async function clipSave() {
    if (!injector || typeof injector.clip !== 'function') return false;
    if (clipBack) { clearTimeout(clipBack.timer); clipBack.timer = null; return true; } // an earlier paste's put-back waits: what it saved is still the owner's
    const a = await Promise.resolve(injector.clip('save')).catch(() => null);
    if (a !== 'ok') return false;
    clipBack = { timer: null, text: null };
    return true;
  }
  function clipLater(text) {
    if (!clipBack) return null;
    clipBack.text = text;
    clipBack.timer = setTimeout(() => { const b = clipBack; clipBack = null; if (b) Promise.resolve(injector.clip('restore', b.text)).catch(() => null); }, pasteBackMs);
    clipBack.timer.unref?.();
    return 'restoring';
  }
  function clipKeep() { if (clipBack) { clearTimeout(clipBack.timer); clipBack = null; } }
  /** THE AGENT'S RECORDS (lane desktop-handover — `desktop-input`): each through onInput above in the AGENT's lane — at most
   *  handoverEventsMax an op (the hub chunks a longer act); an `ack` is the page's own (refused). An owner record meanwhile
   *  drops the rest. → { ok, n, refused: [{ i, code }], display, clipboard? } (+ { partial, cancelled, sent, of } when cut) */
  async function input(msg) {
    const s = sessions.get(String(msg.sid || ''));
    if (!s) return named('not_found', 'that stream session ended');
    const list = Array.isArray(msg.events) ? msg.events : [];
    if (list.length > L.handoverEventsMax) return named('too_many_events', `at most ${L.handoverEventsMax} records an op (this one has ${list.length}) — the hub sends a longer act in chunks`);
    const paste = list.find((e) => e && typeof e === 'object' && e.t === 'clip' && typeof e.text === 'string');
    const saved = paste ? await clipSave() : false;
    const refused = [], waits = [];
    list.forEach((e, i) => {
      if (e && typeof e === 'object' && e.t === 'ack') { refused.push({ i, code: 'not_an_act' }); return; }
      const r = onInput(s, e, 'agent');
      if (r.refused) refused.push({ i, code: r.refused });
      else if (r.done) waits.push(r.done.then((a) => ({ i, a })));
    });
    let n = 0, cancelled = 0, why = null;
    for (const { i, a } of await Promise.all(waits)) {
      if (a && a.cancelled) { cancelled++; why = a.cancelled; continue; }
      if (a && a.n) n += a.n;
      if (a && a.refused && a.refused.length) refused.push({ i, code: a.refused[0].code });
    }
    const clipboard = saved ? clipLater(paste.text) : null;
    refused.sort((a, b) => a.i - b.i);
    const out = { ok: !refused.length && !cancelled, n, refused, display: srcDisplay(s), ...(clipboard ? { clipboard } : {}) };
    return cancelled ? { ...out, partial: true, cancelled: why, sent: list.length - cancelled, of: list.length } : out;
  }
  /** ONE STILL of the session's display (lane desktop-handover — `desktop-grab`): the source's still(). */
  async function still(msg) {
    const s = sessions.get(String(msg.sid || ''));
    if (!s) return named('not_found', 'that stream session ended');
    if (!s.source || typeof s.source.still !== 'function') return named('no_still', 'this stream\'s source takes no still picture');
    let r;
    try { r = await s.source.still(); } catch (e) { return named('still_failed', String((e && e.message) || e)); }
    if (!r || !r.ok) return r || named('still_failed', 'no picture');
    if (r.png.length > L.stillMaxBytes) return named('still_too_big', `the picture is ${r.png.length} bytes (at most ${L.stillMaxBytes} over the link)`);
    return { ok: true, png64: r.png.toString('base64'), w: r.w, h: r.h, display: r.display != null ? String(r.display) : srcDisplay(s), origin: r.origin || s.source.origin || { x: 0, y: 0 }, road: r.road || null };
  }
  const srcDisplay = (s) => (s.source && s.source.display != null ? String(s.source.display) : null);

  // ── the relay: the hub's ONE forward ⇄ a UDP shim per remote address ⇄ werift's own host candidate ──
  function openRelay(s) {
    return new Promise((resolve) => {
      const r = { port: 0, conn: null, shims: new Map(), fwd: 0, rest: new Uint8Array(0), target: null, server: null, closed: false };
      r.close = () => { r.closed = true; try { r.server.close(); } catch { } try { r.conn && r.conn.destroy(); } catch { } for (const sh of r.shims.values()) { try { sh.close(); } catch { } } r.shims.clear(); };
      const shimFor = (ip, port) => {
        const key = `${ip}:${port}`;
        let sh = r.shims.get(key);
        if (sh) return sh;
        if (r.shims.size >= L.relayMaxPeers) return null;
        sh = dgram.createSocket('udp4');
        sh.on('error', () => { r.shims.delete(key); try { sh.close(); } catch { } });
        sh.on('message', (msg, from) => {
          if (!r.target || from.port !== r.target.port) return; // werift's socket answers (a loopback shim hears only local senders; the source address may be 127.0.0.1)
          if (s.leg && s.leg.send(ip, port, msg)) { r.fwd++; return; } // the UDP leg is up: the hub hears it over plain UDP
          if (!r.conn) return;
          const fr = SM.relayFrame(ip, port, msg);
          if (fr && r.conn.writableLength < L.relayQueueBytes) { r.conn.write(fr); r.fwd++; }
        });
        sh.bind(0, '127.0.0.1');
        r.shims.set(key, sh);
        return sh;
      };
      /** A browser's datagram (over the link or the leg) → its shim → werift's own host candidate. */
      r.deliver = (ip, port, payload) => {
        if (!r.target) r.target = hostTarget(s);
        const sh = r.target ? shimFor(ip, port) : null;
        if (sh) { sh.send(Buffer.from(payload), r.target.port, r.target.ip); r.fwd++; }
      };
      r.server = net.createServer((c) => {
        if (r.conn || r.closed) { c.destroy(); return; } // ONE forward: the hub's
        r.conn = c; c.setNoDelay(true);
        c.on('error', () => { });
        c.on('close', () => { if (r.conn === c) r.conn = null; });
        c.on('data', (d) => {
          const all = new Uint8Array(r.rest.length + d.length); all.set(r.rest); all.set(d, r.rest.length);
          const u = SM.relayUnframe(all);
          if (u.bad) { c.destroy(); return; }
          r.rest = new Uint8Array(u.rest); // copy: the rest outlives this chunk
          for (const f of u.frames) r.deliver(f.ip, f.port, f.payload);
        });
      });
      r.server.on('error', () => resolve(null));
      r.server.listen(0, '127.0.0.1', () => { r.port = r.server.address().port; resolve(r); });
    });
  }
  /** The IPv4 host candidates werift offers (the self-probe's addresses). */
  function hostAddrs(s) {
    const sdp = (s.pc && s.pc.localDescription && s.pc.localDescription.sdp) || '';
    return [...sdp.matchAll(/a=candidate:\S+ 1 udp \d+ (\d+\.\d+\.\d+\.\d+) \d+ typ host/g)].map((m) => m[1]);
  }
  /** werift's own UDP host socket the shims talk to — over LOOPBACK, at its first IPv4 host candidate's port (lane
   *  desktop-display-modes, measured on the owner's Windows box): werift binds its host sockets to the wildcard address, so
   *  127.0.0.1:<port> reaches the same socket, and a loopback datagram is never filtered — while a datagram from the shim to the
   *  machine's own LAN address IS (Windows' firewall filters it like any inbound datagram to an agent with no rule: the
   *  self-probe's very rule) ⇒ before, no relayed check ever reached werift on a firewalled Windows machine. */
  function hostTarget(s) {
    const sdp = (s.pc && s.pc.localDescription && s.pc.localDescription.sdp) || '';
    const hosts = [...sdp.matchAll(/a=candidate:\S+ 1 udp \d+ (\d+\.\d+\.\d+\.\d+) (\d+) typ host/g)].map((m) => ({ ip: m[1], port: Number(m[2]) }));
    const h = hosts.find((x) => x.ip === '127.0.0.1') || hosts[0] || null;
    return h ? { ip: '127.0.0.1', port: h.port } : null;
  }

  async function offer(msg, owner) {
    const sid = String(msg.sid || '');
    if (!SID_RE.test(sid)) return named('bad_request', 'a stream session id is 1–64 letters, digits, - or _');
    const have = sessions.get(sid);
    if (msg.iceRestart) {
      if (!have) return named('not_found', 'that stream session ended');
      have.owner = owner;
      await have.pc.setLocalDescription(await have.pc.createOffer({ iceRestart: true }));
      return { ok: true, sid, offer: { type: 'offer', sdp: have.pc.localDescription.sdp }, restart: true };
    }
    if (have) return named('busy', 'that stream session already exists');
    // THE PER-MACHINE CAP (lane desktop-display-modes — src/stream-model.js streamCapOf): a stream per display + one; judged
    // against the displays this machine's screen source names (the new source's own, once made), never past sessionsCap
    const full = (n) => ({ ...named('too_many_streams', `this machine already streams ${sessions.size} pictures (at most ${SM.streamCapOf(n)} — a stream per display + one, for its ${Math.max(1, n)} display${n > 1 ? 's' : ''})`), live: sessions.size, cap: SM.streamCapOf(n), displays: Math.max(1, n) });
    if (sessions.size >= SM.streamCapOf(displaysKnown)) return full(displaysKnown);
    const kind = String(msg.sourceKind || '');
    if (!SM.STREAM_SOURCES.includes(kind)) return named('bad_source', `unknown source kind ${JSON.stringify(kind.slice(0, 20))}`);
    const maxKbps = Math.min(L.maxKbpsMax, Math.max(L.maxKbpsMin, Number(msg.maxKbps) || L.maxKbpsDefault));
    let source;
    try { source = await SOURCES[kind](msg, { maxKbps }, { screen, window }); } catch (e) { return named('capture_failed', `the ${kind} source could not start (${(e && e.message) || e})`); }
    if (!source.ok) return source;
    if (sessions.has(sid)) { try { source.stop(); } catch { } return named('busy', 'that stream session already exists'); } // asked twice while the facts were read
    if (Array.isArray(source.displays) && source.displays.length) displaysKnown = source.displays.length;
    if (sessions.size >= SM.streamCapOf(displaysKnown)) { try { source.stop(); } catch { } return full(displaysKnown); } // a start that raced another while the facts were read
    let w;
    try { w = werift(); } catch (e) { try { source.stop(); } catch { } return named('stream_unsupported', `this agent cannot stream here (${(e && e.message) || e}; Node ${process.version})`); }
    const hdr = msg.hdr === true && source.offersAv1 === true; // lane stream-hdr-passthrough: AV1 first, H.264 beside it
    const pc = new w.RTCPeerConnection({
      codecs: { video: SM.streamCodecsOf({ hdr }).map((C) => new w.RTCRtpCodecParameters({ mimeType: C.mimeType, clockRate: C.clockRate, rtcpFeedback: C.rtcpFeedback.map((f) => ({ ...f })), parameters: C.fmtp })) },
      headerExtensions: { video: [w.useTransportWideCC()] },
      // ICE-LITE, no ICE servers (measured, werift 0.25.0): its ICE agent asks stun.l.google.com:19302 for a server-reflexive
      // candidate whenever no STUN server is set — `iceServers: []` included (a hard-coded DEFAULT_STUN_SERVER) — and only
      // ice-lite (or relay-only) skips that gathering. Lite = host candidates only; the browser is the controlling full agent
      // and runs the checks — to a host candidate it can reach (LAN, a tailnet), or to the hub relay's. No public STUN/TURN.
      iceLite: true, iceServers: [], bundlePolicy: 'max-bundle', iceUseIpv6: false,
    });
    const s = { sid, owner, pc, source, maxKbps, codec: hdr ? null : 'H264', track: null, dc: null, relay: null, leg: null, directInbound: null, frames: 0, bytes: 0, dropped: 0, keyRequests: 0, bweKbps: null, congested: false, estimate: null,
      inputN: 0, inputRefused: null, inputDropped: 0, ownerQ: [], agentQ: [], agentHeld: new Map(), inFlight: null, pumping: false, releaseDue: false, acks: [], ackMs: null, sentAt: new Map(),
      mark: { at: now(), frames: 0, bytes: 0 }, sending: false, statsTimer: null, orphanTimer: null, failTimer: null, seq: Math.floor(Math.random() * 65536), early: [], replied: false, startedAt: now() };
    sessions.set(sid, s);
    try {
      s.track = new w.MediaStreamTrack({ kind: 'video' });
      const tr = pc.addTransceiver(s.track, { direction: 'sendonly' });
      tr.sender.onPictureLossIndication.subscribe(() => { s.keyRequests++; source.requestKeyframe(); });
      tr.sender.senderBWE.onCongestion.subscribe((c) => { s.congested = !!c; });
      s.dc = pc.createDataChannel('input', { ordered: true });
      s.dc.onMessage.subscribe((m) => onInput(s, m));
      const iceOut = (candidate) => { if (!s.replied) s.early.push(candidate); else pushTo(s, { op: 'stream-ice', sid, candidate }); };
      let iceEnded = false;
      const endIce = () => { if (!iceEnded) { iceEnded = true; iceOut(null); } }; // ONE end-of-candidates (werift says it twice: a null candidate and `complete`)
      pc.onIceCandidate.subscribe((c) => { if (!c) { endIce(); return; } iceOut(typeof c.toJSON === 'function' ? c.toJSON() : c); });
      pc.iceGatheringStateChange.subscribe((g) => { if (g === 'complete') endIce(); });
      pc.connectionStateChange.subscribe((st) => {
        if (st === 'connected' && !s.estimate) { s.estimate = wireEstimate(tr.sender, (k) => { s.bweKbps = k; try { source.setTargetKbps(Math.min(maxKbps, k)); } catch { } }); if (!s.estimate) log(`[stream] ${sid} no send-side estimate (werift's sender shape changed) — the rate holds`); }
        if (st === 'connected' && !s.codec) { // the HDR road: the codec werift negotiated (the browser's answer's first) picks the source's road
          const mime = tr.sender.codec && tr.sender.codec.mimeType;
          s.codec = typeof source.useCodec === 'function' ? source.useCodec(mime) : 'H264';
          log(`[stream] ${sid} the browser took ${mime || 'no codec'} — ${s.codec === 'AV1' ? 'HDR (AV1, PQ 10-bit)' : 'the SDR picture (H.264)'}`);
        }
        if (st === 'connected' && !s.sending) { s.sending = true; source.requestKeyframe(); source.start(sendAccessUnit, (why) => stop(sid, why || 'source_ended')); } // the picture starts at a KEY frame the moment the browser can take it; a source that dies ends the session by its name
        pushStats(s);
        clearTimeout(s.failTimer);
        if (st === 'failed') { s.failTimer = setTimeout(() => stop(sid, 'ice_failed'), L.orphanMs); s.failTimer.unref?.(); }
        if (st === 'closed' && sessions.get(sid) === s) stop(sid, 'closed');
      });
      if (msg.relay) s.relay = await openRelay(s);
      if (s.relay && msg.relayLeg) {
        let extra = []; try { extra = legHosts() || []; } catch { /* no dial host */ }
        s.leg = createLeg(msg.relayLeg, { extra, log: (line) => log(`[stream] ${sid} ${line}`), onData: (ip, port, payload) => s.relay && s.relay.deliver(ip, port, payload), onChange: () => pushStats(s) });
      }
      await pc.setLocalDescription(await pc.createOffer());
    } catch (e) {
      stop(sid, 'offer_failed');
      return named('offer_failed', `the stream could not start here (${(e && e.message) || e})`);
    }
    // the picture: one access unit → RTP packets with one timestamp; the source starts at the first `connected` (above) and
    // skips while ICE restarts
    function sendAccessUnit(au) {
      if (stateOf(s) !== 'connected') return;
      const pl = au.tu ? AV1.rtpPayloads(au.tu).payloads : H.rtpPayloads(au.nalus); // lane stream-hdr-passthrough: an AV1 temporal unit
      for (const p of pl) {
        try { s.track.writeRtp(new w.RtpPacket(new w.RtpHeader({ payloadType: 96, sequenceNumber: s.seq, timestamp: au.ts90k, marker: p.marker, ssrc: 1 }), Buffer.from(p.payload))); s.bytes += p.payload.length + 12; }
        catch { s.dropped++; }
        s.seq = (s.seq + 1) & 0xffff;
      }
      s.frames++;
      s.sentAt.set(au.ts90k, now()); if (s.sentAt.size > 120) s.sentAt.delete(s.sentAt.keys().next().value);
    }
    s.statsTimer = setInterval(() => pushStats(s), L.statsMs); s.statsTimer.unref?.();
    log(`[stream] ${sid} offered (${source.kind}${s.relay ? ', relay' : ''}${s.leg ? ` + udp leg to ${s.leg.targets.length} hub address${s.leg.targets.length === 1 ? '' : 'es'}` : ''})`);
    // THE FIREWALL FACT: our host addresses (the ones werift offers) probed from a second socket — after the reply, never before it
    const probe = probeMemo && now() - probeMemo.at < L.probeMemoMs ? Promise.resolve(probeMemo.result) : selfProbe(hostAddrs(s), { now }).then((r) => { probeMemo = { at: now(), result: r }; return r; });
    probe.then((r) => {
      if (sessions.get(sid) !== s) return;
      s.directInbound = { verdict: r.verdict, addrs: r.addrs, reached: r.reached, ms: r.ms, program };
      if (r.verdict === 'blocked') log(`[stream] ${sid} direct inbound UDP: blocked — none of ${r.addrs} host address${r.addrs === 1 ? '' : 'es'} reached from this machine itself (its firewall); the hub relay carries the stream`);
      pushStats(s);
    }, () => { });
    return { ok: true, sid, offer: { type: 'offer', sdp: pc.localDescription.sdp }, source: { kind: source.kind, origin: source.origin, fps: source.fps || null, encoder: source.encoder || null, mode: source.mode || null, ...(source.window ? { window: source.window } : {}), ...(source.displays ? { display: source.display, displays: source.displays } : {}), ...(source.scaled ? { scaled: source.scaled } : {}), ...(source.tcc ? { tcc: source.tcc } : {}), ...(source.hdr ? { hdr: source.hdr } : {}) }, relayPort: s.relay ? s.relay.port : null, codec: { mimeType: SM.STREAM_CODEC.mimeType, fmtp: SM.STREAM_CODEC.fmtp }, ...(hdr ? { codecs: SM.streamCodecsOf({ hdr }).map((C) => C.mimeType) } : {}), maxKbps };
  }
  /** After the offer's reply went out: the candidates gathered while it was made follow as pushes, in order. */
  function replied(sid) {
    const s = sessions.get(sid);
    if (!s || s.replied) return;
    s.replied = true;
    for (const c of s.early.splice(0)) pushTo(s, { op: 'stream-ice', sid, candidate: c });
  }
  async function answer(msg) {
    const s = sessions.get(String(msg.sid || ''));
    if (!s) return named('not_found', 'that stream session ended');
    try {
      if (msg.answer && typeof msg.answer.sdp === 'string') await s.pc.setRemoteDescription({ type: 'answer', sdp: msg.answer.sdp });
      // lane stream-hdr-passthrough (measured on the owner's box): a browser's mDNS host candidate (`<uuid>.local`) never helps this
      // ICE-LITE agent — werift resolves it by multicast with a 10 s timeout, and one that arrived BEFORE the answer is resolved inside
      // setRemoteDescription: the answer, and the page's start, waited 10 s (2 of 3 HDR switches) — it is not handed to werift
      if (msg.candidate && typeof msg.candidate.candidate === 'string' && msg.candidate.candidate && !SM.isMdnsCandidate(msg.candidate.candidate)) await s.pc.addIceCandidate(msg.candidate);
    } catch (e) { return named('answer_failed', `the browser's answer did not apply (${(e && e.message) || e})`); }
    return { ok: true };
  }
  function stats(msg, owner) {
    const s = sessions.get(String(msg.sid || ''));
    if (!s) return named('not_found', 'that stream session ended');
    if (msg.watch) { s.owner = owner; clearTimeout(s.orphanTimer); s.orphanTimer = null; }
    return { ok: true, sid: s.sid, state: stateOf(s), stats: statsOf(s), startedAt: s.startedAt };
  }
  /** A link died: its sessions become orphans (the media keeps flowing) until a re-arm or orphanMs. */
  function linkDead(owner) {
    for (const s of sessions.values()) {
      if (s.owner !== owner) continue;
      s.owner = null;
      clearTimeout(s.orphanTimer);
      s.orphanTimer = setTimeout(() => stop(s.sid, 'link_lost'), L.orphanMs); s.orphanTimer.unref?.();
    }
  }
  function stopAll(why = 'agent_stopped') { for (const sid of [...sessions.keys()]) stop(sid, why); }
  return { offer, replied, answer, stop, stats, input, still, linkDead, stopAll, sessions: () => [...sessions.keys()] };
}

module.exports = { createStreamHost, fakeSource, fakeStill, FAKE_STILL, createLeg, selfProbe };

'use strict';
/**
 * THE STREAM HOST — the daemon's WebRTC sessions (DEVICE: inside agentd, on the paired machine; design q-041 r2 §2 传输 + §3
 * P1/P1b, lane stream-p1a-transport). A session is ONE werift RTCPeerConnection with ONE H.264 video track (the source's
 * access units, packetized here — src/stream-h264.js) and ONE ordered data channel `input` (the person's pointer, keys and
 * clipboard text into THE daemon's injector — src/input-inject.js — and frame acks). werift brings NACK retransmits (its
 * RTP cache), PLI (→ the source's next key frame) and the transport-cc bandwidth estimate (reported; part B's encoder
 * follows it, capped by `maxKbps`).
 *
 * THE OPS (agentd.js answers each by id, `op` on the reply — the three-touch rule):
 *   stream-offer  {sid, sourceKind, sourceId?, maxKbps?, relay?}  → { ok, sid, offer, source, relayPort } — the offer goes
 *                 out at once; its ICE candidates follow as `stream-ice` pushes ({candidate: null} = the last)
 *                 {sid, iceRestart: true}                         → a restart offer for the same session (new ICE credentials)
 *   stream-answer {sid, answer?, candidate?}                      → { ok } — the browser's SDP answer / a trickled candidate
 *   stream-stop   {sid}                                           → { stopped }
 *   stream-stats  {sid, watch?}                                   → the session's numbers now; `watch` = THIS link owns the
 *                 session's pushes from now on (the hub's re-arm after a reconnect)
 *   pushes        stream-ice {sid, candidate} · stream-stats {sid, stats, state, ended?} once a second and at every change
 * A session's owner is the link that asked; when that link dies the session is an ORPHAN for STREAM_LIMITS.orphanMs (the
 * media path does not ride the link — a re-armed hub finds it playing) and then stops.
 *
 * THE SOURCE INTERFACE: `{ kind, origin: {x, y}, start(onAccessUnit, onEnd?), stop(), requestKeyframe(), setTargetKbps(kbps),
 * stats?() }` where `onAccessUnit({ nalus: Buffer[], key, ts90k })` is called once per encoded picture, in order
 * (src/stream-h264.js splits Annex-B) and `onEnd(code)` = the source died — the session ends by that name. Here: the FAKE
 * source — a pre-encoded Annex-B file looped at its frame rate (scripts/fixtures/stream/); 'screen' = the agent's `screen`
 * factory (lane stream-p1b-screen: src/agentd/stream-screen.js — the machine's own desktop, ffmpeg + the HDR mapping),
 * refused by name where none is given. stats() lands in the session's numbers as `screen` (+ its `encodeMs`).
 *
 * ICE: werift is an ICE-LITE agent with host candidates only and NO STUN/TURN server (its default asks Google's public STUN
 * server — never here); the page is the controlling full agent.
 * THE RELAY (NAT: direct first, else the hub forwards — design §2): with `relay`, a loopback TCP listener takes the hub's
 * ONE forward (dm.tcpForward) carrying framed datagrams (src/stream-model.js relayFrame); each remote address gets a local
 * UDP shim socket that talks to werift's own host candidate, so werift sees the far end as a peer-reflexive 127.0.0.1 peer
 * and the browser sees the hub's UDP port (the `typ relay` candidate the hub adds). Bounded: relayMaxPeers shims, a
 * datagram ≤ relayMaxDatagram, a stalled forward drops (UDP semantics), never queues past relayQueueBytes.
 */
const fs = require('fs');
const net = require('net');
const dgram = require('dgram');
const SM = require('../stream-model.js');
const H = require('../stream-h264.js');

const L = SM.STREAM_LIMITS;
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
    requestKeyframe() { wantKey = true; },
    setTargetKbps() { /* pre-encoded: nothing to follow */ },
  };
}

/** A host made without a screen factory (the suites' bare hosts) refuses the screen by name. */
function screenSource() { return named('no_screen_source', 'this agent cannot capture its screen'); }

/** The sources by kind (src/stream-model.js STREAM_SOURCES names them); `screen` = the agent's factory (async). */
const SOURCES = Object.freeze({ fake: (msg) => fakeSource(msg.sourceId), screen: (msg, o, screen) => (screen ? screen(msg, o) : screenSource(msg)) });

function createStreamHost({ injector = null, log = () => { }, now = Date.now, loadWerift = () => require('werift'), screen = null } = {}) {
  const sessions = new Map();
  let W = null;
  const werift = () => W || (W = loadWerift());
  const pushTo = (s, msg) => { if (!s.owner) return; try { s.owner.control(msg); } catch { /* the link died: the onDead path makes it an orphan */ } };

  function statsOf(s) {
    const t = now();
    const dt = Math.max(1, t - s.mark.at) / 1000;
    const st = {
      fps: Math.round((s.frames - s.mark.frames) / dt), kbps: Math.round(((s.bytes - s.mark.bytes) * 8) / dt / 1000),
      frames: s.frames, dropped: s.dropped, encodeMs: null, // the screen source's encoder reports it (below); a pre-encoded source spends none
      bweKbps: s.bweKbps, congested: s.congested, keyRequests: s.keyRequests,
      input: { n: s.inputN, refused: s.inputRefused, dropped: s.inputDropped }, ackMs: s.ackMs,
      source: s.source ? s.source.kind : null, relay: s.relay ? { peers: s.relay.shims.size, forwarded: s.relay.fwd, port: s.relay.port } : null,
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
    try { s.source && s.source.stop(); } catch { /* gone */ }
    if (s.relay) s.relay.close();
    pushTo(s, { op: 'stream-stats', sid, stats: statsOf(s), state: 'closed', ended: why });
    try { s.pc && s.pc.close(); } catch { /* gone */ }
    log(`[stream] ${sid} ended (${why})`);
    return true;
  }

  // ── the input channel: in order, one injector, moves coalesced while the injector is behind ──
  function onInput(s, raw) {
    const ev = SM.inputEventOf(typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
    if (ev.refused) { s.inputRefused = { code: ev.refused, at: now() }; return; }
    if (ev.t === 'ack') { const sent = s.sentAt.get(ev.f); if (sent) { s.acks.push(now() - sent); if (s.acks.length > 30) s.acks.shift(); s.ackMs = [...s.acks].sort((a, b) => a - b)[s.acks.length >> 1]; } return; }
    if (!injector) { s.inputRefused = { code: 'input_unsupported', at: now() }; return; }
    if (ev.t === 'mv' && s.inputPending > 8) { s.inputDropped++; return; }
    s.inputPending++;
    s.inputChain = s.inputChain.then(() => injector.inject([ev])).then((r) => {
      s.inputPending--;
      if (r && r.n) s.inputN += r.n;
      if (r && r.refused && r.refused.length) { const was = s.inputRefused && s.inputRefused.code; s.inputRefused = { code: r.refused[0].code, at: now() }; if (was !== s.inputRefused.code) pushStats(s); }
    }, () => { s.inputPending--; });
  }

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
          if (!r.conn || !r.target || from.port !== r.target.port) return; // werift's socket answers (a loopback shim hears only local senders; the source address may be 127.0.0.1)
          const fr = SM.relayFrame(ip, port, msg);
          if (fr && r.conn.writableLength < L.relayQueueBytes) { r.conn.write(fr); r.fwd++; }
        });
        sh.bind(0, '127.0.0.1');
        r.shims.set(key, sh);
        return sh;
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
          if (!r.target) r.target = hostTarget(s);
          for (const f of u.frames) { const sh = r.target ? shimFor(f.ip, f.port) : null; if (sh) { sh.send(Buffer.from(f.payload), r.target.port, r.target.ip); r.fwd++; } }
        });
      });
      r.server.on('error', () => resolve(null));
      r.server.listen(0, '127.0.0.1', () => { r.port = r.server.address().port; resolve(r); });
    });
  }
  /** werift's own UDP host candidate the shims talk to: loopback when it gathered one, else its first IPv4 host. */
  function hostTarget(s) {
    const sdp = (s.pc && s.pc.localDescription && s.pc.localDescription.sdp) || '';
    const hosts = [...sdp.matchAll(/a=candidate:\S+ 1 udp \d+ (\d+\.\d+\.\d+\.\d+) (\d+) typ host/g)].map((m) => ({ ip: m[1], port: Number(m[2]) }));
    return hosts.find((h) => h.ip === '127.0.0.1') || hosts[0] || null;
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
    if (sessions.size >= L.sessionsPerAgent) return named('too_many_streams', `this machine already streams ${sessions.size} pictures (at most ${L.sessionsPerAgent})`);
    const kind = String(msg.sourceKind || '');
    if (!SM.STREAM_SOURCES.includes(kind)) return named('bad_source', `unknown source kind ${JSON.stringify(kind.slice(0, 20))}`);
    const maxKbps = Math.min(L.maxKbpsMax, Math.max(L.maxKbpsMin, Number(msg.maxKbps) || L.maxKbpsDefault));
    let source;
    try { source = await SOURCES[kind](msg, { maxKbps }, screen); } catch (e) { return named('capture_failed', `the screen source could not start (${(e && e.message) || e})`); }
    if (!source.ok) return source;
    if (sessions.has(sid)) { try { source.stop(); } catch { } return named('busy', 'that stream session already exists'); } // asked twice while the facts were read
    let w;
    try { w = werift(); } catch (e) { try { source.stop(); } catch { } return named('stream_unsupported', `this agent cannot stream here (${(e && e.message) || e}; Node ${process.version})`); }
    const C = SM.STREAM_CODEC;
    const pc = new w.RTCPeerConnection({
      codecs: { video: [new w.RTCRtpCodecParameters({ mimeType: C.mimeType, clockRate: C.clockRate, rtcpFeedback: C.rtcpFeedback.map((f) => ({ ...f })), parameters: C.fmtp })] },
      headerExtensions: { video: [w.useTransportWideCC()] },
      // ICE-LITE, no ICE servers (measured, werift 0.25.0): its ICE agent asks stun.l.google.com:19302 for a server-reflexive
      // candidate whenever no STUN server is set — `iceServers: []` included (a hard-coded DEFAULT_STUN_SERVER) — and only
      // ice-lite (or relay-only) skips that gathering. Lite = host candidates only; the browser is the controlling full agent
      // and runs the checks — to a host candidate it can reach (LAN, a tailnet), or to the hub relay's. No public STUN/TURN.
      iceLite: true, iceServers: [], bundlePolicy: 'max-bundle', iceUseIpv6: false,
    });
    const s = { sid, owner, pc, source, maxKbps, track: null, dc: null, relay: null, frames: 0, bytes: 0, dropped: 0, keyRequests: 0, bweKbps: null, congested: false,
      inputN: 0, inputRefused: null, inputDropped: 0, inputPending: 0, inputChain: Promise.resolve(), acks: [], ackMs: null, sentAt: new Map(),
      mark: { at: now(), frames: 0, bytes: 0 }, sending: false, statsTimer: null, orphanTimer: null, failTimer: null, seq: Math.floor(Math.random() * 65536), early: [], replied: false, startedAt: now() };
    sessions.set(sid, s);
    try {
      s.track = new w.MediaStreamTrack({ kind: 'video' });
      const tr = pc.addTransceiver(s.track, { direction: 'sendonly' });
      tr.sender.onPictureLossIndication.subscribe(() => { s.keyRequests++; source.requestKeyframe(); });
      tr.sender.senderBWE.onAvailableBitrate.subscribe((bps) => { s.bweKbps = Math.round(bps / 1000); try { source.setTargetKbps(Math.min(maxKbps, s.bweKbps)); } catch { } });
      tr.sender.senderBWE.onCongestion.subscribe((c) => { s.congested = !!c; });
      s.dc = pc.createDataChannel('input', { ordered: true });
      s.dc.onMessage.subscribe((m) => onInput(s, m));
      const iceOut = (candidate) => { if (!s.replied) s.early.push(candidate); else pushTo(s, { op: 'stream-ice', sid, candidate }); };
      let iceEnded = false;
      const endIce = () => { if (!iceEnded) { iceEnded = true; iceOut(null); } }; // ONE end-of-candidates (werift says it twice: a null candidate and `complete`)
      pc.onIceCandidate.subscribe((c) => { if (!c) { endIce(); return; } iceOut(typeof c.toJSON === 'function' ? c.toJSON() : c); });
      pc.iceGatheringStateChange.subscribe((g) => { if (g === 'complete') endIce(); });
      pc.connectionStateChange.subscribe((st) => {
        if (st === 'connected' && !s.sending) { s.sending = true; source.requestKeyframe(); source.start(sendAccessUnit, (why) => stop(sid, why || 'source_ended')); } // the picture starts at a KEY frame the moment the browser can take it; a source that dies ends the session by its name
        pushStats(s);
        clearTimeout(s.failTimer);
        if (st === 'failed') { s.failTimer = setTimeout(() => stop(sid, 'ice_failed'), L.orphanMs); s.failTimer.unref?.(); }
        if (st === 'closed' && sessions.get(sid) === s) stop(sid, 'closed');
      });
      if (msg.relay) s.relay = await openRelay(s);
      await pc.setLocalDescription(await pc.createOffer());
    } catch (e) {
      stop(sid, 'offer_failed');
      return named('offer_failed', `the stream could not start here (${(e && e.message) || e})`);
    }
    // the picture: one access unit → RTP packets with one timestamp; the source starts at the first `connected` (above) and
    // skips while ICE restarts
    function sendAccessUnit(au) {
      if (stateOf(s) !== 'connected') return;
      const pl = H.rtpPayloads(au.nalus);
      for (const p of pl) {
        try { s.track.writeRtp(new w.RtpPacket(new w.RtpHeader({ payloadType: 96, sequenceNumber: s.seq, timestamp: au.ts90k, marker: p.marker, ssrc: 1 }), Buffer.from(p.payload))); s.bytes += p.payload.length + 12; }
        catch { s.dropped++; }
        s.seq = (s.seq + 1) & 0xffff;
      }
      s.frames++;
      s.sentAt.set(au.ts90k, now()); if (s.sentAt.size > 120) s.sentAt.delete(s.sentAt.keys().next().value);
    }
    s.statsTimer = setInterval(() => pushStats(s), L.statsMs); s.statsTimer.unref?.();
    log(`[stream] ${sid} offered (${source.kind}${s.relay ? ', relay' : ''})`);
    return { ok: true, sid, offer: { type: 'offer', sdp: pc.localDescription.sdp }, source: { kind: source.kind, origin: source.origin, fps: source.fps || null, encoder: source.encoder || null, mode: source.mode || null }, relayPort: s.relay ? s.relay.port : null, codec: { mimeType: SM.STREAM_CODEC.mimeType, fmtp: SM.STREAM_CODEC.fmtp }, maxKbps };
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
      if (msg.candidate && typeof msg.candidate.candidate === 'string' && msg.candidate.candidate) await s.pc.addIceCandidate(msg.candidate);
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
  return { offer, replied, answer, stop, stats, linkDead, stopAll, sessions: () => [...sessions.keys()] };
}

module.exports = { createStreamHost, fakeSource };

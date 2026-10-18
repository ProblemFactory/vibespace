'use strict';
/**
 * THE WEBRTC STREAM RUNG, the hub's half (ORCH; design q-041 r2 §2 传输 + 客户端, lane stream-p1a-transport). A machine
 * desktop window whose machine passes the rung (src/server/desktop-access.js streamRung — the agent's `stream-offer`
 * capability and a source) plays the machine's picture as WebRTC: the agent's werift offers, the PAGE's RTCPeerConnection
 * answers, and this module is only the SIGNALING relay between the page's requests and the agent's ops, plus the record:
 *   • start(hostId)          the rung's verdict; when taken, `stream-offer` on the agent → the offer (+ the relay's candidates)
 *                            and a session KEY the page names from now on — `{ take: false, code, why }` otherwise (the window
 *                            shows the VNC picture and says why)
 *   • poll(key, n, seq)      THE LONG POLL (src/server/machine-app.js's shape): the agent's trickled candidates the page has not
 *                            seen (from index n), the session's state and the agent's last numbers; it answers at once when
 *                            anything is newer than `seq`, else after ≤ STREAM_LIMITS.pollMaxMs
 *   • answer / candidate     the page's SDP answer and trickled candidates → `stream-answer`
 *   • restart(key)           an ICE-restart offer (the page's restart budget — src/stream-model.js streamStep)
 *   • stop(key)              `stream-stop`; a session no page polled for STREAM_LIMITS.idleMs is stopped (the page closed)
 *   • facts(hostId)          THE RECORD: per session { key, sid, codec, source, startedAt, state, stats, path, ended } — facts,
 *                            never a decision
 * THE RELAY (NAT — direct first, else the hub forwards): per session ONE UDP socket on this hub; each datagram is framed
 * (src/stream-model.js relayFrame) onto ONE `tcpForward` to the agent's relay port, where the stream host's shims hand it to
 * werift. Its candidates are `typ relay` (the lowest priority: ICE takes a direct pair whenever one works). Bounded: a stalled
 * forward DROPS datagrams for STALL_MS (UDP semantics) — it never queues. `direct: false` strips both sides' host candidates
 * (the suites' relay-only proof; a person never sets it).
 * THE UDP LEG (lane stream-relay-udp — the owner's Windows firewall blocks every inbound UDP to the agent, so no direct pair
 * forms, and the relay over the device link delivered 5 fps of a 30 fps picture): the relay's socket is bound BEFORE the
 * offer, and `stream-offer` carries `relayLeg` {port, key, hosts} — a per-session 32-byte key that travels only over the
 * device link. The daemon PINGs this port from its own socket (src/stream-model.js legControl: HMAC over a rising counter +
 * a nonce); an authenticated PING (legPingVerdict — a forged one or a replayed counter is dropped and counted) names the
 * daemon's (ip, port) and is answered by a PONG; DATA comes only from that address. The hub forwards on the path the daemon
 * LAST spoke on: its leg (DATA, or a PING flagged UP) ⇒ the browser's datagrams go to it as leg DATA; its device-link frames
 * (or a PING without UP — it hears no PONG) ⇒ the device link; a leg silent for legStaleMs ⇒ the device link. The ladder:
 * direct (host pairs, the highest priority) → this leg → the device link. `relay.via` + `relay.leg` on the record, a log
 * line at every change. `udpLeg: false` offers no leg (the suites' device-link control); `legMute()` true drops the leg's
 * PINGs unanswered (the suites' unreachable-hub proof) — a person never sets either.
 * People only: the routes refuse an agent token (`human_only`) before anything here runs.
 */
const crypto = require('crypto');
const dgram = require('dgram');
const os = require('os');
const SM = require('../stream-model.js');

const L = SM.STREAM_LIMITS;
const STALL_MS = 50;
const named = (code, message) => Object.assign(new Error(message), { code });

/** This hub's IPv4 addresses (every interface, loopback last) — where a browser can reach the relay's UDP port. */
function hubIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces() || {})) for (const a of list || []) if (a && (a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
  return [...new Set([...out, '127.0.0.1'])];
}
const isHostCandidate = (c) => / typ host( |$)/.test(String(c || ''));
/** An SDP without its host candidates (the relay-only switch). */
const stripHosts = (sdp) => String(sdp || '').split(/\r?\n/).filter((l) => !(l.startsWith('a=candidate:') && isHostCandidate(l))).join('\r\n');
/** An SDP with the relay's candidates added to its (one) media section. */
function withRelay(sdp, lines) {
  if (!lines.length) return sdp;
  const rows = String(sdp || '').split(/\r?\n/);
  const at = rows.findIndex((l) => l.startsWith('m='));
  if (at < 0) return sdp;
  let end = rows.findIndex((l, i) => i > at && l.startsWith('m='));
  if (end < 0) end = rows.length;
  while (end > at && rows[end - 1] === '') end--;
  rows.splice(end, 0, ...lines.map((c) => 'a=' + c));
  return rows.join('\r\n') + (rows[rows.length - 1] === '' ? '' : '\r\n');
}

function create({ access, log = console, now = Date.now, idleMs = L.idleMs, sweepMs = 5000, ips = hubIps, pollMaxMs = L.pollMaxMs, relay = true, direct = true, udpLeg = true, legMute = () => false } = {}) {
  const sessions = new Map(); // key → session
  const keyOf = () => 'st' + now().toString(36) + Math.random().toString(36).slice(2, 10);
  const wake = (s) => { s.seq++; for (const f of s.waiters.splice(0)) { try { f(); } catch { /* gone */ } } };
  const relayFacts = (s) => {
    const r = s.relay; if (!r) return null;
    const g = r.leg;
    return { port: r.port, up: r.up, down: r.down, dropped: r.dropped, via: legUsable(r) ? 'udp' : 'link',
      leg: g ? { addr: g.addr ? `${g.addr.ip}:${g.addr.port}` : null, pings: g.pings, forged: g.forged, replayed: g.replayed, stray: g.stray, up: g.up, down: g.down, heardMsAgo: g.heardAt ? now() - g.heardAt : null, changes: g.changes.slice() } : null };
  };
  const view = (s) => ({ key: s.key, sid: s.sid, hostId: s.hostId, codec: s.codec, source: s.source, startedAt: s.startedAt, state: s.state, stats: s.stats, path: s.path, ended: s.ended, relay: relayFacts(s) });

  function onPush(s, m) {
    if (m.op === 'stream-ice') {
      const c = m.candidate;
      if (c && s.direct === false && isHostCandidate(c.candidate)) return;
      s.cands.push(c || null);
      wake(s);
      return;
    }
    if (m.op === 'stream-stats') {
      if (m.stats) s.stats = m.stats;
      if (m.state) s.state = m.state;
      if (m.ended && !s.ended) { s.ended = m.ended; closeRelay(s); }
      wake(s);
    }
  }

  /** The relay's leg is the way to the daemon now: it last spoke there, and lately. */
  const legUsable = (r) => !!(r && r.leg && r.leg.addr && r.leg.via === 'udp' && now() - r.leg.heardAt < L.legStaleMs);
  function setVia(s, g, via, why) {
    if (g.via === via) return;
    g.via = via;
    g.changes.push({ at: now(), via, why }); if (g.changes.length > 8) g.changes.shift();
    log.log?.(`[stream] ${s.hostId}: session ${s.sid || '(being offered)'} relay via ${via === 'udp' ? `the daemon's udp leg ${g.addr.ip}:${g.addr.port}` : 'the device link'} (${why})`);
    wake(s);
  }
  /** A leg packet at the relay's port: the daemon's PING (→ PONG) or DATA (→ the browser that wrote first). */
  function onLeg(s, r, msg, rinfo) {
    const g = r.leg;
    if (!g) { r.dropped++; return; }
    const p = SM.legParse(msg, g.mac);
    if (p && p.type === 'ping') {
      const v = SM.legPingVerdict(g, p);
      if (!v.take) { g[v.code]++; r.dropped++; return; }
      if (legMute()) { r.dropped++; return; } // the suites' unreachable hub: the PING is never answered
      g.lastCounter = p.counter; g.pings++;
      g.addr = { ip: rinfo.address, port: rinfo.port }; g.heardAt = now();
      const pong = SM.legControl(SM.LEG.PONG, { counter: p.counter, nonce: p.nonce, mac: g.mac });
      try { r.sock.send(Buffer.from(pong), rinfo.port, rinfo.address); } catch { /* the next PING */ }
      if (p.flags & SM.LEG.UP) setVia(s, g, 'udp', 'leg up'); else if (g.via === 'udp') setVia(s, g, 'link', 'the daemon hears no answer on its leg');
      return;
    }
    if (p && p.type === 'data' && g.addr && rinfo.address === g.addr.ip && rinfo.port === g.addr.port) {
      g.heardAt = now(); setVia(s, g, 'udp', 'leg data');
      if (!r.peers.has(`${p.ip}:${p.port}`)) { r.dropped++; return; } // only to a peer that wrote first
      try { r.sock.send(Buffer.from(p.payload), p.port, p.ip); r.down++; g.down++; } catch { r.dropped++; }
      return;
    }
    if (p && p.type === 'data') g.stray++;
    r.dropped++;
  }
  /** The relay's ONE UDP socket, bound before the offer (its port and the leg's key ride `stream-offer`). */
  async function bindRelay(s) {
    const sock = dgram.createSocket('udp4');
    const r = { h: null, sock, peers: new Set(), stallUntil: 0, rest: new Uint8Array(0), up: 0, down: 0, dropped: 0, port: 0, leg: null };
    if (udpLeg) {
      const key = crypto.randomBytes(32); // SM.LEG.keyBytes — memory only (test-key-file-law RANDOM32); it reaches the daemon over the device link
      r.leg = { key, mac: (b) => crypto.createHmac('sha256', key).update(b).digest().subarray(0, SM.LEG.macBytes), addr: null, lastCounter: 0, heardAt: 0, via: 'link', pings: 0, forged: 0, replayed: 0, stray: 0, up: 0, down: 0, changes: [] };
    }
    sock.on('error', (e) => { log.warn?.(`[stream] relay ${s.key}: ${e && e.message}`); closeRelay(s); });
    sock.on('message', (msg, rinfo) => {
      if (SM.isLegPacket(msg)) { onLeg(s, r, msg, rinfo); return; }
      const peer = `${rinfo.address}:${rinfo.port}`;
      if (!r.peers.has(peer)) { if (r.peers.size >= L.relayMaxPeers) { r.dropped++; return; } r.peers.add(peer); }
      if (legUsable(r)) {
        const pkt = SM.legData(rinfo.address, rinfo.port, msg);
        if (!pkt) { r.dropped++; return; }
        try { sock.send(Buffer.from(pkt.buffer, pkt.byteOffset, pkt.length), r.leg.addr.port, r.leg.addr.ip); r.up++; r.leg.up++; } catch { r.dropped++; }
        return;
      }
      const h = r.h;
      if (!h || now() < r.stallUntil) { r.dropped++; return; }
      const fr = SM.relayFrame(rinfo.address, rinfo.port, msg);
      if (!fr) { r.dropped++; return; }
      let more = true;
      try { more = h.write(Buffer.from(fr.buffer, fr.byteOffset, fr.length)); } catch { closeRelay(s); return; }
      r.up++;
      if (more === false) r.stallUntil = now() + STALL_MS;
    });
    await new Promise((res, rej) => { sock.once('error', rej); sock.bind(0, () => { sock.removeListener('error', rej); res(); }); });
    r.port = sock.address().port;
    s.relay = r;
    return r;
  }
  /** The device link's half: ONE tcpForward to the agent's relay port, framed datagrams both ways. */
  async function attachLink(s, r, relayPort) {
    const h = await s.dm.tcpForward(relayPort);
    if (s.relay !== r) { try { h.close(); } catch { } return; }
    r.h = h;
    h.onData = (d) => {
      const all = new Uint8Array(r.rest.length + d.length); all.set(r.rest); all.set(d, r.rest.length);
      const u = SM.relayUnframe(all);
      if (u.bad) { closeRelay(s); return; }
      r.rest = new Uint8Array(u.rest);
      if (u.frames.length && r.leg && r.leg.via === 'udp') setVia(s, r.leg, 'link', 'the daemon spoke on the device link');
      for (const f of u.frames) { if (!r.peers.has(`${f.ip}:${f.port}`)) continue; r.sock.send(Buffer.from(f.payload), f.port, f.ip); r.down++; } // only to a peer that wrote first
    };
    h.onClose = () => { if (s.relay === r) { r.h = null; if (!r.leg) closeRelay(s); } };
  }
  function closeRelay(s) {
    const r = s.relay; if (!r) return;
    s.relay = null;
    try { r.sock.close(); } catch { /* gone */ }
    try { r.h && r.h.close(); } catch { /* gone */ }
  }

  /** The rung, then the offer. → { take: false, code, why } | { take: true, key, sid, offer, source, codec, seq } */
  async function start(hostId, { maxKbps = null } = {}) {
    if (!access || typeof access.streamRung !== 'function') throw named('host_unavailable', 'the desktop access layer is not wired on this instance');
    let v;
    try { v = await access.streamRung(hostId); } catch (e) { return { take: false, code: (e && e.code) || 'host_unavailable', why: String((e && e.message) || e) }; }
    if (!v.take) return { take: false, code: v.code, why: v.why };
    const key = keyOf();
    const s = { key, hostId, dm: v.dm, sid: null, source: null, codec: null, startedAt: now(), state: 'new', stats: null, path: null, ended: null, cands: [], seq: 0, waiters: [], lastPoll: now(), relay: null, direct, relayLines: [] };
    sessions.set(key, s);
    if (relay) { try { await bindRelay(s); } catch (e) { log.warn?.(`[stream] ${hostId}: the relay did not open (${e && e.message}) — direct only`); } }
    // the leg's spec rides the offer: the relay's port, the session's key (over the device link only) and this hub's addresses
    const relayLeg = s.relay && s.relay.leg ? { port: s.relay.port, key: s.relay.leg.key.toString('base64'), hosts: ips().filter((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip))).slice(0, L.legTargets) } : null;
    let r;
    try {
      r = await v.dm.streamOffer({ sourceKind: v.source, sourceId: v.sourceId, maxKbps, relay, ...(relayLeg ? { relayLeg } : {}) }, { onPush: (m) => onPush(s, m) });
    } catch (e) {
      closeRelay(s); sessions.delete(key);
      return { take: false, code: (e && e.code) === 'host_needs_daemon' ? 'agent_too_old' : 'offer_failed', why: String((e && e.message) || e) };
    }
    if (!r || !r.ok) { closeRelay(s); sessions.delete(key); return { take: false, code: (r && r.code) || 'offer_failed', why: (r && r.error) || 'the machine did not offer a stream' }; }
    s.sid = r.sid; s.source = r.source || null; s.codec = r.codec || null;
    if (s.relay && r.relayPort) {
      try { await attachLink(s, s.relay, r.relayPort); } catch (e) { log.warn?.(`[stream] ${hostId}: the relay's device-link half did not open (${e && e.message})${s.relay.leg ? ' — the udp leg only' : ' — direct only'}`); if (!s.relay.leg) closeRelay(s); }
    } else closeRelay(s); // an agent that offers no relay
    if (s.relay) s.relayLines = SM.relayCandidates(ips(), s.relay.port);
    const sdp = withRelay(direct === false ? stripHosts(r.offer.sdp) : r.offer.sdp, s.relayLines);
    log.log?.(`[stream] ${hostId}: session ${s.sid} offered (${v.source}${s.relay ? `, relay udp ${s.relay.port}${s.relay.leg ? ' + the daemon\'s udp leg asked' : ''}` : ''})`);
    return { take: true, key, sid: s.sid, offer: { type: 'offer', sdp }, source: s.source, codec: s.codec, seq: s.seq, platform: v.platform };
  }
  const sessionOf = (key) => { const s = sessions.get(String(key || '')); if (!s) throw named('not_found', 'that stream ended'); return s; };
  async function answer(key, sdp) {
    const s = sessionOf(key);
    if (typeof sdp !== 'string' || !sdp || sdp.length > 64 * 1024) throw named('bad-request', 'an SDP answer is a string of at most 64 KB');
    const r = await s.dm.streamAnswer(s.sid, { answer: { type: 'answer', sdp: s.direct === false ? stripHosts(sdp) : sdp } });
    if (!r || !r.ok) throw named((r && r.code) || 'answer_failed', (r && r.error) || 'the machine did not take the answer');
    return { ok: true };
  }
  async function candidate(key, cand) {
    const s = sessionOf(key);
    const c = cand && typeof cand === 'object' ? { candidate: String(cand.candidate || '').slice(0, 512), sdpMid: cand.sdpMid == null ? null : String(cand.sdpMid).slice(0, 32), sdpMLineIndex: Number.isInteger(cand.sdpMLineIndex) ? cand.sdpMLineIndex : null } : null;
    if (!c || !c.candidate) return { ok: true, skipped: 'end' };
    if (s.direct === false && isHostCandidate(c.candidate)) return { ok: true, skipped: 'host' };
    const r = await s.dm.streamAnswer(s.sid, { candidate: c });
    return { ok: !!(r && r.ok) };
  }
  async function restart(key) {
    const s = sessionOf(key);
    const r = await s.dm.streamOffer({ sid: s.sid, iceRestart: true }, { onPush: (m) => onPush(s, m) });
    if (!r || !r.ok) throw named((r && r.code) || 'restart_failed', (r && r.error) || 'the machine did not restart the stream');
    return { offer: { type: 'offer', sdp: withRelay(s.direct === false ? stripHosts(r.offer.sdp) : r.offer.sdp, s.relayLines) }, seq: s.seq };
  }
  async function poll(key, n = 0, seq = -1, waitMs = pollMaxMs) {
    const s = sessions.get(String(key || ''));
    if (!s) return { key, ended: 'not_found' };
    s.lastPoll = now();
    if (s.seq <= seq && !s.ended) {
      await new Promise((res) => { const t = setTimeout(res, Math.max(0, Math.min(pollMaxMs, waitMs))); s.waiters.push(() => { clearTimeout(t); res(); }); });
      s.lastPoll = now();
    }
    const from = Math.max(0, Math.min(s.cands.length, Number(n) || 0));
    return { key, seq: s.seq, n: s.cands.length, cands: s.cands.slice(from), state: s.state, stats: s.stats, ended: s.ended, relay: relayFacts(s) };
  }
  /** The page's own read of its path (getStats — direct | relay) is told here so the record says it. */
  function notePath(key, p) { const s = sessions.get(String(key || '')); if (s && (p === 'direct' || p === 'relay')) s.path = p; }
  async function stop(key, why = 'stopped') {
    const s = sessions.get(String(key || ''));
    if (!s) return { stopped: false };
    sessions.delete(s.key);
    s.ended = s.ended || why;
    closeRelay(s);
    wake(s);
    let stopped = false;
    try { stopped = !!(s.sid && (await s.dm.streamStop(s.sid)).stopped); } catch { stopped = false; }
    log.log?.(`[stream] ${s.hostId}: session ${s.sid} stopped (${why})`);
    return { stopped };
  }
  function facts(hostId) { return [...sessions.values()].filter((s) => !hostId || s.hostId === hostId).map(view); }
  const sweep = setInterval(() => { for (const s of [...sessions.values()]) if (now() - s.lastPoll > idleMs) stop(s.key, 'idle').catch(() => { }); }, sweepMs);
  sweep.unref?.();
  function shutdown() { clearInterval(sweep); for (const s of [...sessions.values()]) stop(s.key, 'shutdown').catch(() => { }); }
  return { start, answer, candidate, restart, poll, notePath, stop, facts, shutdown };
}

module.exports = { create, hubIps, stripHosts, withRelay };

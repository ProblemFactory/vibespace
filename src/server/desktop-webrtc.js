'use strict';
/**
 * THE WEBRTC STREAM RUNG, the hub's half (ORCH; design q-041 r2 §2 传输 + 客户端, lane stream-p1a-transport). A machine
 * desktop window whose machine passes the rung (src/server/desktop-access.js streamRung — the agent's `stream-offer`
 * capability and a source) plays the machine's picture as WebRTC: the agent's werift offers, the PAGE's RTCPeerConnection
 * answers, and this module is only the SIGNALING relay between the page's requests and the agent's ops, plus the record:
 *   • start(hostId, {source, fp16, hdr, mic}) the rung's verdict; when taken, `stream-offer` on the agent → the offer (+ the relay's candidates);
 *                            `mic` (lane stream-mic-road) = the page wants its microphone's audio m-line — asked of a `stream-mic` agent
 *                            only (src/agentd/client.js gates it), so an older agent streams without it and the answer's `mic` says which;
 *                            `audio` (lane speaker-passthrough-v1) = the page wants the machine's SOUND on that m-line — asked of a
 *                            `stream-audio` agent only; the answer's `audio` says whether the machine offered its track
 *                            and a session KEY the page names from now on — `{ take: false, code, why }` otherwise (`too_many_streams`
 *                            adds the machine's `live` / `cap` / `displays` — lane desktop-display-modes' per-machine cap; the window
 *                            shows the VNC picture and says why). `source` = the page's choice (src/stream-model.js
 *                            streamSourceOf: a display, or ONE window — lane stream-p3m-build on a Mac, stream-p2w-build on
 *                            Windows: int304's one door); none = the main display. `fp16` = a Windows window's FP16 road (off).
 *                            `hdr` (lane stream-hdr-passthrough) = the page's screen is HDR and its browser decodes WebRTC AV1 in
 *                            hardware, and the person turned 「HDR 直通」 on — asked of a SCREEN source only (the agent offers
 *                            AV1 first where its display and encoder can; the browser's answer decides)
 *                            THE MAC'S HELPER (lane stream-p3m-build): an offer refused `no_helper` (a Mac with no screen
 *                            helper and no compiler) is answered by pushing THIS hub's prebuilt (`helpersDir`: data/bin/helpers/
 *                            vibespace-screen + .version, put there by the release — scripts/build-mac-helper.sh) beside the
 *                            agent's helper over the device link (fs-write-stream, `vibespace-screen-<version>`) when its version
 *                            is the one the agent asks for, then the offer is asked once more. Lane apple-signing: the prebuilt must be
 *                            the one its `.identity.json` and the release manifest's `helper` row describe (else `helper_unsigned`,
 *                            nothing pushed); and an offer whose `helper.wantSigned` is true (an ad-hoc helper on a Mac whose agent pins
 *                            a Team ID) gets this hub's DEVELOPER ID prebuilt pushed ONCE per machine — the agent judges it and swaps
 *   • poll(key, n, seq)      THE LONG POLL (src/server/machine-app.js's shape): the agent's trickled candidates the page has not
 *                            seen (from index n), the session's state and the agent's last numbers; it answers at once when
 *                            anything is newer than `seq`, else after ≤ STREAM_LIMITS.pollMaxMs
 *   • answer / candidate     the page's SDP answer and trickled candidates → `stream-answer`
 *   • restart(key)           an ICE-restart offer (the page's restart budget — src/stream-model.js streamStep)
 *   • sound(key, on)         the strip's 「声音」 (lane speaker-passthrough-v1): `stream-audio` on the agent — THE capture of the machine's
 *                            sound for that session starts / ends there
 *   • stop(key, why)         `stream-stop` (its `why` reaches the machine's log); a session no page polled for STREAM_LIMITS.idleMs
 *                            is stopped (the page closed). THE VIEWER GONE (lane stream-window-fixes): the route says when a long
 *                            poll's connection closed before its answer (pollGone — the tab closed, the browser quit or crashed):
 *                            no new poll within STREAM_LIMITS.goneMs ⇒ stopped `viewer_gone`, so the machine ends the capture in
 *                            seconds, not at the idle sweep
 *   • stopWindow(host, id)   every session of that host streaming that window (the picker's 停止 — any browser's)
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
 * daemon's (ip, port) and is answered by a PONG; DATA comes only from that address. THE PATH ELECTION (lane stream-leg-flap —
 * src/stream-model.js legElect; the owner's Mac desktop went black 2026-10-20 when this hub followed the path the daemon LAST
 * spoke on and flipped leg ⇄ link three times in 20 s): ONE election per session, with hysteresis — the leg is taken ONCE,
 * when it comes up (a PING flagged UP, or its DATA) ⇒ the browser's datagrams go to it as leg DATA; it is left only when
 * MEASURED dead: no sign of life for legDeadMs while it carried the picture (legStaleMs idle) ⇒ the device link. The device
 * link speaking (`held`) and a PING not flagged UP (`quiet`) are counted, never obeyed. The ladder: direct (host pairs, the
 * highest priority) → this leg → the device link; the device link's frames always reach the browser, whichever way the
 * hub answers. `relay.via` + `relay.leg` on the record, a log line at every change. `udpLeg: false` offers no leg (the
 * suites' device-link control); `legMute()` true drops the leg's PINGs unanswered (the suites' unreachable-hub proof);
 * `elect` = the election (the suites' RED control hands in the .330 rule) — a person never sets any of them.
 * THE HAND-OVER (lane desktop-handover — src/server/desktop-handover-engine.js): `handover` = its hooks — ended(key, why) once
 * per session (the page's stop, the machine's `ended`), started(key, hostId, after) when a session's offer is made (`after` =
 * the page's previous key: a display switch carries the lease), factsOf(key) = the lease's facts every long poll answers
 * (the strip's words and the agent's pointer); device(key) hands the engine a live session's link + sid, nudge(key) answers
 * the page's waiting poll at once.
 * People only: the routes refuse an agent token (`human_only`) before anything here runs.
 */
const crypto = require('crypto');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

const HELPERS_DIR = path.join(__dirname, '..', '..', 'data', 'bin', 'helpers');
const MANIFEST_COPY = path.join(__dirname, '..', '..', 'data', 'bin', 'vibespace-agentd.manifest.json'); // the signed release's record beside the bundle (scripts/agentd-release.mjs) — there only when this build IS the release
const digestOf = (file) => new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); fs.createReadStream(file).on('error', reject).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))); });
/** Push this hub's prebuilt Mac screen helper to an agent that asked for `need` = { dir, version } (its no_helper refusal — or, with
 *  `signedOnly`, its offer's `helper.wantSigned`: lane apple-signing). The prebuilt must be the one its identity record
 *  (`.identity.json`, scripts/build-mac-helper.sh) and the release manifest's `helper` row describe — a hub never pushes bytes the
 *  release did not name; `signedOnly` pushes a Developer ID build only. → { ok, size, identity } | { ok: false, code: 'no_helper' | 'helper_unsigned', error } */
async function pushMacHelper(dm, need, helpersDir = HELPERS_DIR, { signedOnly = false, manifestFile = MANIFEST_COPY } = {}) {
  const bin = path.join(helpersDir, 'vibespace-screen');
  let have = null, st = null, ident = null, row = null;
  try { have = fs.readFileSync(bin + '.version', 'utf8').trim(); st = fs.statSync(bin); } catch { return { ok: false, code: 'no_helper', error: 'this hub has no prebuilt Mac screen helper (data/bin/helpers/vibespace-screen)' }; }
  try { ident = JSON.parse(fs.readFileSync(bin + '.identity.json', 'utf8')); } catch { ident = null; }
  try { const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); row = m && m.helper && typeof m.helper === 'object' ? m.helper : null; } catch { row = null; }
  if (!need || !/^[A-Za-z0-9._-]{1,40}$/.test(String(need.version || '')) || !/^\/[^\0]{1,400}$/.test(String(need.dir || ''))) return { ok: false, code: 'no_helper', error: 'the agent did not say where its helper goes' };
  if (have !== need.version) return { ok: false, code: 'no_helper', error: `this hub's prebuilt Mac screen helper is ${have}; the Mac's agent needs ${need.version}` };
  const kind = ident && typeof ident === 'object' && typeof ident.kind === 'string' ? ident.kind.slice(0, 20) : null;
  if (signedOnly && kind !== 'developer-id') return { ok: false, code: 'helper_unsigned', error: `this hub's prebuilt Mac screen helper is ${kind || 'of unrecorded identity'}, not a Developer ID build — the Mac keeps the helper it has` };
  let sha256 = null;
  try { sha256 = await digestOf(bin); } catch (e) { return { ok: false, code: 'no_helper', error: `this hub's prebuilt Mac screen helper could not be read (${(e && e.code) || e})` }; }
  if (ident && typeof ident.sha256 === 'string' && ident.sha256 !== sha256) return { ok: false, code: 'helper_unsigned', error: `this hub's prebuilt Mac screen helper is not the one its identity record describes (sha256 ${sha256.slice(0, 12)}… vs ${ident.sha256.slice(0, 12)}…) — nothing pushed` };
  if (row && row.version === have && typeof row.sha256 === 'string' && row.sha256 !== sha256) return { ok: false, code: 'helper_unsigned', error: `this hub's prebuilt Mac screen helper is not the release's (sha256 ${sha256.slice(0, 12)}… vs the manifest's ${row.sha256.slice(0, 12)}…) — nothing pushed` };
  if (!dm || typeof dm.fsWriteStream !== 'function') return { ok: false, code: 'no_helper', error: 'the Mac\'s agent cannot take a pushed file' };
  try { await dm.fsWriteStream(`${need.dir}/vibespace-screen-${need.version}`, { source: fs.createReadStream(bin), size: st.size, overwrite: true, by: 'system:desktop-webrtc' }); } catch (e) { return { ok: false, code: 'no_helper', error: `the prebuilt helper did not reach the Mac (${(e && e.message) || e})` }; }
  return { ok: true, size: st.size, identity: kind };
}

function create({ access, log = console, now = Date.now, idleMs = L.idleMs, goneMs = L.goneMs, sweepMs = 5000, ips = hubIps, pollMaxMs = L.pollMaxMs, relay = true, direct = true, udpLeg = true, legMute = () => false, elect = SM.legElect, helpersDir = HELPERS_DIR, handover = null } = {}) {
  const sessions = new Map(); // key → session
  const signedPushed = new Set(); // lane apple-signing: hosts this hub pushed its signed prebuilt to (once per hub life)
  const ended = (s, why) => { if (s.endNoted) return; s.endNoted = true; try { handover?.ended?.(s.key, why, s.hostId); } catch (e) { log.warn?.(`[stream] the hand-over did not hear ${s.key} end (${e && e.message})`); } };
  const keyOf = () => 'st' + now().toString(36) + Math.random().toString(36).slice(2, 10);
  const wake = (s) => { s.seq++; for (const f of s.waiters.splice(0)) { try { f(); } catch { /* gone */ } } };
  const relayFacts = (s) => {
    const r = s.relay; if (!r) return null;
    const g = r.leg;
    return { port: r.port, up: r.up, down: r.down, dropped: r.dropped, via: legUsable(s, r) ? 'udp' : 'link',
      leg: g ? { addr: g.addr ? `${g.addr.ip}:${g.addr.port}` : null, pings: g.pings, forged: g.forged, replayed: g.replayed, stray: g.stray, up: g.up, down: g.down, heardMsAgo: g.heardAt ? now() - g.heardAt : null, quiet: g.quiet, held: g.held, changes: g.changes.slice() } : null };
  };
  const view = (s) => ({ key: s.key, sid: s.sid, hostId: s.hostId, codec: s.codec, source: s.source, windowId: s.windowId, startedAt: s.startedAt, state: s.state, stats: s.stats, path: s.path, ended: s.ended, relay: relayFacts(s) });

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
      if (m.ended && !s.ended) { s.ended = m.ended; closeRelay(s); ended(s, m.ended); }
      wake(s);
    }
  }

  /** THE ELECTION's one door (src/stream-model.js legElect): every signal of either path goes through it; a change is
   *  recorded, logged and wakes the page's poll. */
  function vote(s, g, type) {
    const e = elect({ via: g.via, aliveAt: g.aliveAt, dataAt: g.dataAt }, { type, at: now() });
    g.aliveAt = e.aliveAt; g.dataAt = e.dataAt;
    if (!e.changed) return;
    g.via = e.via;
    g.changes.push({ at: now(), via: e.via, why: e.why }); if (g.changes.length > 8) g.changes.shift();
    log.log?.(`[stream] ${s.hostId}: session ${s.sid || '(being offered)'} relay via ${e.via === 'udp' ? `the daemon's udp leg ${g.addr.ip}:${g.addr.port}` : 'the device link'} (${e.why})`);
    wake(s);
  }
  /** The relay's leg is the way to the daemon now: the election took it and has not judged it dead. */
  const legUsable = (s, r) => { if (!(r && r.leg && r.leg.addr)) return false; if (r.leg.via === 'udp') vote(s, r.leg, 'judge'); return r.leg.via === 'udp'; };
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
      if (p.flags & SM.LEG.UP) vote(s, g, 'up'); else { g.quiet++; vote(s, g, 'quiet'); }
      return;
    }
    if (p && p.type === 'data' && g.addr && rinfo.address === g.addr.ip && rinfo.port === g.addr.port) {
      g.heardAt = now(); vote(s, g, 'data');
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
      r.leg = { key, mac: (b) => crypto.createHmac('sha256', key).update(b).digest().subarray(0, SM.LEG.macBytes), addr: null, lastCounter: 0, heardAt: 0, aliveAt: 0, dataAt: 0, via: 'link', pings: 0, forged: 0, replayed: 0, stray: 0, up: 0, down: 0, quiet: 0, held: 0, changes: [] };
    }
    sock.on('error', (e) => { log.warn?.(`[stream] relay ${s.key}: ${e && e.message}`); closeRelay(s); });
    sock.on('message', (msg, rinfo) => {
      if (SM.isLegPacket(msg)) { onLeg(s, r, msg, rinfo); return; }
      const peer = `${rinfo.address}:${rinfo.port}`;
      if (!r.peers.has(peer)) { if (r.peers.size >= L.relayMaxPeers) { r.dropped++; return; } r.peers.add(peer); }
      if (legUsable(s, r)) {
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
      if (u.frames.length && r.leg) { if (r.leg.via === 'udp') r.leg.held += u.frames.length; vote(s, r.leg, 'link'); } // counted, never obeyed (the election)
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
  async function start(hostId, { maxKbps = null, source = null, fp16 = false, hdr = false, after = null, mic = false, audio = false } = {}) {
    if (!access || typeof access.streamRung !== 'function') throw named('host_unavailable', 'the desktop access layer is not wired on this instance');
    const src = SM.streamSourceOf(source);
    if (source != null && !src) return { take: false, code: 'bad_source', why: 'the stream names a display or a window by its id' };
    let v;
    try { v = src ? await access.streamRung(hostId, { want: src.kind }) : await access.streamRung(hostId); } catch (e) { return { take: false, code: (e && e.code) || 'host_unavailable', why: String((e && e.message) || e) }; }
    if (!v.take) return { take: false, code: v.code, why: v.why };
    const key = keyOf();
    const s = { key, hostId, dm: v.dm, platform: v.platform || null, sid: null, source: null, windowId: src && src.kind === 'window' ? String(src.id) : null, codec: null, startedAt: now(), state: 'new', stats: null, path: null, ended: null, cands: [], seq: 0, waiters: [], lastPoll: now(), goneTimer: null, relay: null, direct, relayLines: [] };
    sessions.set(key, s);
    if (relay) { try { await bindRelay(s); } catch (e) { log.warn?.(`[stream] ${hostId}: the relay did not open (${e && e.message}) — direct only`); } }
    // the leg's spec rides the offer: the relay's port, the session's key (over the device link only) and this hub's addresses
    const relayLeg = s.relay && s.relay.leg ? { port: s.relay.port, key: s.relay.leg.key.toString('base64'), hosts: ips().filter((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip))).slice(0, L.legTargets) } : null;
    let r;
    const sourceId = v.sourceId != null ? v.sourceId : src ? src.id : null; // the verdict's own (a fake source's file), else the page's choice
    const offer = () => v.dm.streamOffer({ sourceKind: v.source, sourceId, maxKbps, relay, ...(src && src.share ? { share: src.share } : {}), ...(relayLeg ? { relayLeg } : {}), ...(v.source === 'window' && fp16 ? { fp16: true } : {}), ...(v.source === 'screen' && hdr === true ? { hdr: true } : {}), ...(mic === true ? { mic: true } : {}), ...(audio === true ? { audio: true } : {}) }, { onPush: (m) => onPush(s, m) }); // fp16: a Windows window's FP16 road (lane stream-p2w-build); hdr: lane stream-hdr-passthrough
    try {
      r = await offer();
      if (r && !r.ok && r.code === 'no_helper' && r.helper) { // a Mac without its screen helper: this hub's prebuilt, then once more
        const p = await pushMacHelper(v.dm, r.helper, helpersDir);
        log.log?.(`[stream] ${hostId}: the Mac has no screen helper ${r.helper.version} — ${p.ok ? `pushed this hub's prebuilt (${p.size} bytes)` : p.error}`);
        if (p.ok) r = await offer(); else r = { ...r, error: `${r.error} — ${p.error}` };
      }
      if (r && r.ok && r.helper && r.helper.wantSigned === true && !signedPushed.has(hostId)) { // lane apple-signing: the signed prebuilt wins over an ad-hoc build — pushed ONCE per machine; the agent judges it and swaps at its next check
        signedPushed.add(hostId);
        const p = await pushMacHelper(v.dm, r.helper, helpersDir, { signedOnly: true });
        log.log?.(`[stream] ${hostId}: the Mac's screen helper is ${r.helper.identity ? r.helper.identity.kind : 'unjudged'} — ${p.ok ? `pushed this hub's signed prebuilt (${p.size} bytes); the agent takes it at its next check (one last Screen Recording re-grant)` : p.error}`);
      }
    } catch (e) {
      closeRelay(s); sessions.delete(key);
      return { take: false, code: (e && e.code) === 'host_needs_daemon' ? 'agent_too_old' : 'offer_failed', why: String((e && e.message) || e) };
    }
    if (!r || !r.ok) { closeRelay(s); sessions.delete(key); return { take: false, code: (r && r.code) || 'offer_failed', why: (r && r.error) || 'the machine did not offer a stream', ...(r && Number.isInteger(r.cap) ? { live: r.live, cap: r.cap, displays: r.displays } : {}) }; } // lane desktop-display-modes: a full machine names its count
    s.sid = r.sid; s.source = r.source || null; s.codec = r.codec || null;
    if (s.relay && r.relayPort) {
      try { await attachLink(s, s.relay, r.relayPort); } catch (e) { log.warn?.(`[stream] ${hostId}: the relay's device-link half did not open (${e && e.message})${s.relay.leg ? ' — the udp leg only' : ' — direct only'}`); if (!s.relay.leg) closeRelay(s); }
    } else closeRelay(s); // an agent that offers no relay
    if (s.relay) s.relayLines = SM.relayCandidates(ips(), s.relay.port);
    const sdp = withRelay(direct === false ? stripHosts(r.offer.sdp) : r.offer.sdp, s.relayLines);
    try { handover?.started?.(key, hostId, after != null ? String(after) : null); } catch (e) { log.warn?.(`[stream] the hand-over did not hear ${key} start (${e && e.message})`); }
    log.log?.(`[stream] ${hostId}: session ${s.sid} offered (${v.source}${s.relay ? `, relay udp ${s.relay.port}${s.relay.leg ? ' + the daemon\'s udp leg asked' : ''}` : ''})`);
    return { take: true, key, sid: s.sid, offer: { type: 'offer', sdp }, source: s.source, codec: s.codec, seq: s.seq, platform: v.platform, mic: r.mic === true, audio: r.audio === true };
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
  /** lane speaker-passthrough-v1: the strip's 「声音」 → the agent's `stream-audio` (its capability is the client's gate). */
  async function sound(key, on) {
    const s = sessionOf(key);
    if (!s.sid) throw named('not_found', 'that stream has not started');
    const r = await s.dm.streamAudio(s.sid, { on: on === true });
    log.log?.(`[stream] ${s.hostId}: session ${s.sid} sound ${on === true ? 'on' : 'off'}${r && !r.ok ? ` — refused ${r.code}` : ''}`);
    return r;
  }
  async function poll(key, n = 0, seq = -1, waitMs = pollMaxMs) {
    const s = sessions.get(String(key || ''));
    if (!s) return { key, ended: 'not_found' };
    s.lastPoll = now(); clearTimeout(s.goneTimer); s.goneTimer = null; // a poll: the viewer is here
    if (s.seq <= seq && !s.ended) {
      await new Promise((res) => { const t = setTimeout(res, Math.max(0, Math.min(pollMaxMs, waitMs))); s.waiters.push(() => { clearTimeout(t); res(); }); });
      s.lastPoll = now();
    }
    const from = Math.max(0, Math.min(s.cands.length, Number(n) || 0));
    const ho = handover && typeof handover.factsOf === 'function' ? handover.factsOf(s.key, s.hostId) : null; // lane desktop-handover: the strip's lease words + the agent's pointer
    return { key, seq: s.seq, n: s.cands.length, cands: s.cands.slice(from), state: s.state, stats: s.stats, ended: s.ended, relay: relayFacts(s), ...(ho ? { handover: ho } : {}) };
  }
  /** The page's own read of its path (getStats — direct | relay) is told here so the record says it. */
  function notePath(key, p) { const s = sessions.get(String(key || '')); if (s && (p === 'direct' || p === 'relay')) s.path = p; }
  /** A long poll's connection closed before its answer: no new poll within goneMs ⇒ the viewer is gone, the stream stops. */
  function pollGone(key) {
    const s = sessions.get(String(key || ''));
    if (!s || s.ended) return;
    clearTimeout(s.goneTimer);
    s.goneTimer = setTimeout(() => { s.goneTimer = null; if (sessions.get(s.key) === s) stop(s.key, 'viewer_gone').catch(() => { }); }, goneMs);
    s.goneTimer.unref?.();
  }
  async function stop(key, why = 'stopped') {
    const s = sessions.get(String(key || ''));
    if (!s) return { stopped: false };
    sessions.delete(s.key);
    clearTimeout(s.goneTimer);
    s.ended = s.ended || why;
    closeRelay(s);
    wake(s);
    ended(s, why);
    let stopped = false;
    try { stopped = !!(s.sid && (await s.dm.streamStop(s.sid, { why })).stopped); } catch { stopped = false; }
    log.log?.(`[stream] ${s.hostId}: session ${s.sid} stopped (${why})`);
    return { stopped };
  }
  /** The picker's 停止: every session of `hostId` streaming the window `id` (whichever browser opened it). */
  async function stopWindow(hostId, id, why = 'stopped_in_list') {
    const keys = [...sessions.values()].filter((s) => s.hostId === hostId && s.windowId != null && s.windowId === String(id)).map((s) => s.key);
    const r = await Promise.all(keys.map((k) => stop(k, why)));
    return { ok: true, sessions: keys.length, stopped: r.filter((x) => x.stopped).length };
  }
  function facts(hostId) { return [...sessions.values()].filter((s) => !hostId || s.hostId === hostId).map(view); }
  /** lane desktop-handover: a LIVE session's way to its machine (the engine's ops ride its link and name its sid) | null */
  function device(key) { const s = sessions.get(String(key || '')); return s && !s.ended && s.sid ? { key: s.key, hostId: s.hostId, sid: s.sid, dm: s.dm, platform: s.platform, source: s.source, stats: s.stats, state: s.state } : null; }
  /** lane desktop-handover: the lease changed — the page's waiting long poll answers now (its strip redraws). */
  function nudge(key) { const s = sessions.get(String(key || '')); if (s) wake(s); }
  const sweep = setInterval(() => { for (const s of [...sessions.values()]) if (now() - s.lastPoll > idleMs) stop(s.key, 'idle').catch(() => { }); }, sweepMs);
  sweep.unref?.();
  function shutdown() { clearInterval(sweep); for (const s of [...sessions.values()]) stop(s.key, 'shutdown').catch(() => { }); }
  return { start, answer, candidate, restart, sound, poll, pollGone, notePath, stop, stopWindow, facts, device, nudge, shutdown };
}

module.exports = { create, hubIps, stripHosts, withRelay, pushMacHelper, HELPERS_DIR, MANIFEST_COPY };

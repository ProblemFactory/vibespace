'use strict';
/**
 * THE WEBRTC STREAM RUNG — PURE decisions (design q-041 r2 §2 传输 / 客户端 / 输入 + §3 P1/P1b, lane stream-p1a-transport;
 * owner 2026-10-16 「一起做」: the picture AND the input ride the same WebRTC session). Imports only the PURE ladder table
 * and the PURE window source's shape (src/stream-window.js — its capability word and platforms);
 * the daemon (src/agentd/stream-host.js), the hub (src/server/desktop-webrtc.js) and the page (src/lib/stream-view.js) all
 * ask THIS file, so the three cannot disagree:
 *
 *   STREAM_CODEC_AV1 / streamCodecsOf   lane stream-hdr-passthrough: the HDR road's AV1, offered first only when the page asks HDR
 *   STREAM_CODEC / STREAM_LIMITS     the one codec offered (H.264 constrained baseline, packetization-mode 1, NACK + PLI +
 *                                    transport-cc) and every bound (the sessions cap, poll, orphan grace, restart budget …)
 *   streamCapOf(displays)            THE PER-MACHINE CAP (lane desktop-display-modes): a picture per display (a window per
 *                                    display, or all of them in one window) + one more (a phone beside them), at most
 *                                    STREAM_LIMITS.sessionsCap — the daemon refuses past it (`too_many_streams`, the count named)
 *   streamRungVerdict(facts)         may THIS machine's desktop open as a stream, and from which source — judged against the
 *                                    `webrtc` row of DISPLAY_BACKENDS (its `needs` = the AGENT's capabilities) → { take, source,
 *                                    code, why }; every "no" is named and the window shows the VNC picture. A Mac (lane
 *                                    stream-p3m-build): its agent's `stream-mac` (the screen helper) — the whole display, or ONE
 *                                    window (`want: 'window'` + `stream-window`); an older Mac agent ⇒ agent_too_old. A Windows
 *                                    machine's ONE window (lane stream-p2w-build): the same `want: 'window'` + `stream-window`
 *   streamSourceOf(raw)              the page's choice of source (the stream/start body) → { kind: 'display' | 'window', id, share? } | null
 *                                    (share 2–4: ② — that many displays in one window; the HDR road maps a smaller picture)
 *   streamStep(st, event)            THE SIGNALING STATE MACHINE the page runs (idle → starting → offered → connecting → playing
 *                                    ⇄ restarting → fallback | stopped) → { state, restarts, action, code }
 *   fallbackVerdict(facts)           when a sick connection becomes a fallback to the VNC picture (after the restart budget)
 *   endingVerdict(facts)             NEVER SILENT (lane stream-fallback-never-silent): the window's answer to its stream's end —
 *                                    before any picture played, the VNC picture (the old rule); once one played, never by itself:
 *                                    the same source again, the main display (it was gone), then the person's choice
 *   videoToSource(pt, box, video, origin)   a point on the <video> element → the source's pixel (letterbox aware) + origin
 *   INPUT_KINDS / inputEventOf(raw)  the data channel's event table, validated (what the daemon accepts; anything else is
 *                                    refused by name, never guessed) · wheelUnitsOf(deltaY, deltaMode)
 *   statsOf(prev, reports, now)      the stats strip's numbers from RTCPeerConnection.getStats(): RTT, jitter, fps, decode ms,
 *                                    kbps, lost, the path (direct | relay); + received, dropped (frames), codec — the details'
 *                                    charts and table (lane stream-stats-popup, src/stream-series.js)
 *   streamNumbersOf(page, agent, via)   THE STATS ROW's facts (lane stream-window-fixes — ONE row for the whole screen's window
 *                                    and a window's stream, src/lib/stream-stats.js): the page's numbers + the relay path + the
 *                                    machine's encoder (its encode ms) and, for a window, its rate (kbps over its floor)
 *   relayFrame / relayUnframe        a datagram + its peer address over the device link's byte stream (the hub's UDP relay)
 *   relayCandidates(ips, port)       the hub relay's ICE candidate lines (typ relay — the lowest priority: a direct pair wins)
 *   LEG / legControl / legData / legParse / legPingVerdict   THE UDP LEG (lane stream-relay-udp): the daemon's OWN datagrams to
 *                                    the hub relay's port (TURN-shaped — a firewall that blocks every inbound UDP to the agent
 *                                    lets in the answers to what it sent): an authenticated PING / PONG (HMAC over a counter +
 *                                    a nonce, the mac handed in — this file imports no crypto) and DATA (the browser's address +
 *                                    its datagram); relayPathOf(page, relay) = direct | udp | link (the strip's words) ·
 *                                    legSeqFlags(seq) / legSeqOf(flags) — THE TAKE'S NUMBER in a WORD's / a PING's flags (r3)
 *   legElect(el, ev)                 THE PATH ELECTION (lane stream-leg-flap): ONE per relayed session, with hysteresis — the hub
 *                                    takes the leg once when it comes up and leaves it only when it is MEASURED dead (silent
 *                                    for its bound), never because the device link spoke too; lane stream-udp-leg-fallback: a
 *                                    leg that carried NOTHING for legFirstMs after the browser's first datagram is dead too (R1),
 *                                    a daemon that answers probes is taken only when the hub's PROBE made the round trip (R2),
 *                                    and legFlapMax falls within legFlapMs pin the session to the device link (R3)
 *   legVerdictOf(hub, daemon)        THE LEG'S VERDICT (lane stream-udp-leg-fallback R2): up | probing | dead + the reason both
 *                                    halves' counts name (no_socket, bind_failed, flapping, carried_nothing, probe_lost,
 *                                    unreachable, firewall?, silent) — the record's and the hub log's · legProbeBytes() — the
 *                                    probe's size: the LARGEST datagram the leg carries (src/stream-h264.js maxDatagram + the
 *                                    leg's DATA head), derived (r2)
 *   legFallStep(seen, relay, state) THE PAGE'S SHARE OF R1: a fall the hub records while the page still connects ⇒ an ICE
 *                                    restart now, never at the connect budget (a browser gave the dead pair up)
 *   streamRoadOf(page, relay)        THE ROAD (lane stream-udp-leg-fallback R4): which way the picture comes for the window's chip
 *                                    (direct | udp | link), the fallback's reason, and whether any road answered at all
 *   stallStep(w, facts)              THE STALL (lane stream-leg-flap): a playing picture that decodes nothing while the machine
 *                                    says it sends ⇒ the window says so and offers the stream again (never «0 fps» for ever)
 *   firewallRuleCommand(program)     the admin line that opens the DIRECT path on a Windows machine (copied by its owner, never
 *                                    run by VibeSpace) · directInboundOf(probe) — the daemon's self-probe → open | blocked | none

 *   liteSessionSdp(sdp)              lane werift-lite-multihomed: the agent's offer says `a=ice-lite` ONCE, at the session level —
 *                                    where a browser reads it (werift 0.25 writes it inside each media section only)
 */
const B = require('./desktop-backends.js');
const SW = require('./stream-window.js');
const H264 = require('./stream-h264.js'); // PURE: the packetizer's payload bound + werift's wire overhead (legProbeBytes)

const STREAM_CODEC = Object.freeze({
  mimeType: 'video/H264',
  clockRate: 90000,
  // constrained baseline 3.1: every browser's hardware (and software) decoder takes it; mode 1 = single NAL + FU-A
  fmtp: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
  rtcpFeedback: Object.freeze([Object.freeze({ type: 'nack' }), Object.freeze({ type: 'nack', parameter: 'pli' }), Object.freeze({ type: 'transport-cc' })]),
});
// lane stream-hdr-passthrough (q-041 r3 P4 road B): THE HDR ROAD's codec — AV1 (profile 0 carries 10-bit; the bitstream's sequence
// header says BT.2020 / PQ), offered FIRST beside STREAM_CODEC only when the page asked for HDR (its screen is HDR and its browser
// decodes WebRTC AV1 in hardware — src/hdr-viewer.js); the browser's answer decides (werift sends the answer's first codec), a
// browser that drops AV1 gets the H.264 picture. The P4 probe's fmtp (Chrome's own AV1 line); its RTP payloads: src/stream-av1.js
const STREAM_CODEC_AV1 = Object.freeze({
  mimeType: 'video/AV1',
  clockRate: 90000,
  fmtp: 'level-idx=5;profile=0;tier=0',
  rtcpFeedback: STREAM_CODEC.rtcpFeedback,
});
/** lane stream-hdr-passthrough: a browser's mDNS host candidate (`<uuid>.local` — Chrome's host address without a STUN server)?
 *  An ICE-LITE agent never needs one (it answers the browser's checks from wherever they come); werift resolves it by multicast
 *  with a 10 s timeout INSIDE the call that hands it over. */
const isMdnsCandidate = (line) => /^(?:a=)?candidate:\S+ \d+ \S+ \d+ \S+\.local \d+ typ /i.test(String(line || ''));
/** lane werift-lite-multihomed (measured: a viewer whose browser was allowed the microphone, on a computer with several network
 *  adapters, never saw a NEW stream play): werift 0.25 writes `a=ice-lite` inside each MEDIA section only, and RFC 8839 §5.3
 *  makes it a SESSION-level attribute — the browser reads it there only. Unaware the agent is lite, Chrome nominated pairs
 *  (USE-CANDIDATE) before it had checked them, as it does with a full agent; the lite agent took the first nomination for good
 *  — with every adapter offered, a pair whose answers come back from another address and never reach the browser — so its
 *  DTLS went where the browser never listened. The offer's SDP → the same SDP with ONE `a=ice-lite`, before its first m= line
 *  (the media sections' copies dropped); an SDP without the attribute (or without a media section) unchanged. */
function liteSessionSdp(sdp) {
  const text = String(sdp || '');
  const rows = text.split(/\r?\n/);
  const at = rows.findIndex((l) => l.startsWith('m='));
  if (at < 0 || !rows.some((l) => l === 'a=ice-lite')) return text;
  const head = rows.slice(0, at).filter((l) => l !== 'a=ice-lite'), media = rows.slice(at).filter((l) => l !== 'a=ice-lite');
  return [...head, 'a=ice-lite', ...media].join('\r\n');
}
/** The codecs a session offers, in order: H.264 alone (the SDR road — the offer unchanged), or AV1 then H.264 (`hdr`). */
const streamCodecsOf = ({ hdr = false } = {}) => (hdr ? [STREAM_CODEC_AV1, STREAM_CODEC] : [STREAM_CODEC]);
const STREAM_SOURCES = Object.freeze(['screen', 'fake', 'window']); // 'window' = ONE window of the machine (lane stream-p3m-build on a Mac; stream-p2w-build on Windows)
const MAC_CAPABILITY = 'stream-mac';       // the agent captures a Mac's screen through its helper (an older Mac agent already says stream-screen)
const WINDOW_CAPABILITY = SW.WINDOW_CAPABILITY; // 'stream-window': the agent captures ONE window — the one word of both platforms (src/stream-window.js; int304)
const STREAM_LIMITS = ((l) => Object.freeze({ ...l, legTrialMaxMs: l.legFirstMs + l.legEchoMs }))({ // legTrialMaxMs DERIVED — THE TRIAL'S BOUND below
  maxKbpsDefault: 8000, maxKbpsMin: 300, maxKbpsMax: 50000,
  sessionsCap: 4,             // a daemon serves at most a stream per display + one (a phone beside them), never more than this — streamCapOf
  orphanMs: 20000,            // a session whose device link died waits this long for the hub's re-arm, then stops
  idleMs: 30000,              // the hub stops a session no page polled for this long (the page closed without a word)
  goneMs: 3000,               // a page whose long poll closed unanswered (its tab closed, the browser quit) and that asked no new one within this ⇒ stopped (lane stream-window-fixes)
  pollMaxMs: 25000,           // one long poll's longest wait
  statsMs: 1000,              // the daemon's stats push, and the page's getStats read
  connectMs: 15000,           // offer → connected, else the page falls back
  restartBudget: 2,           // ICE restarts the page asks for before it falls back to the VNC picture
  disconnectedGraceMs: 4000,  // `disconnected` this long counts as sick (a Wi-Fi blip recovers inside it)
  relayMaxDatagram: 1500, relayMaxPeers: 4, relayQueueBytes: 262144,
  // THE UDP LEG (lane stream-relay-udp): a PING every legKeepaliveMs keeps the machine's NAT / firewall state; every
  // legLiveMs while the leg carries the picture; a PING unanswered for legEchoMs is a MISS (re-asked at once), legMissMax
  // misses IN A ROW = the leg is down (the device link carries it, re-asked every legReprobeMs; legProbeMs between the first
  // PINGs — a leg never up is down at its first miss: the link carried it all along). THE HUB'S ELECTION (lane
  // stream-leg-flap — legElect): the leg it took is left only after legDeadMs without a sign of life while it carried the
  // picture (= legMissMax × legLiveMs: three PING periods, the daemon's own verdict), legStaleMs when it carried none (an idle
  // leg PINGs every legKeepaliveMs: two of them + 5 s)
  legKeepaliveMs: 15000, legLiveMs: 2000, legEchoMs: 2000, legMissMax: 3, legProbeMs: 500, legReprobeMs: 5000, legDeadMs: 6000, legStaleMs: 35000, legTargets: 6,
  // THE FIRST DATA (lane stream-udp-leg-fallback R1 — 2026-10-26 the owner's Mac: «leg up» at the offer, then 45 s of a black
  // pane: the daemon's PINGs kept the idle bound fresh while the leg carried nothing): a leg the hub took that sent NOTHING back
  // legFirstMs after the browser's first datagram went out on it is dead, however many PINGs it answers ⇒ the device link
  // (inside the page's connectMs, so the page never asks a restart). THE PROBE (R2): the hub takes a daemon that answers probes
  // only when ITS PROBE came back — legProbeBytes() long, the largest datagram the leg carries (r2: derived from the packetizer's
  // bound, never a literal here); the daemon PINGs every legReadyMs while it waits for the hub's word; legProbeMax lost in a row =
  // dead, named. THE DAMPER (R3): legFlapMax falls within legFlapMs ⇒ the device link for the rest of the session (re-probes back
  // off legReprobeMs × 2^(falls − 1) until then). THE TRIAL'S BOUND (r2 — one lost trial-ending TAKE kept every datagram on both
  // roads for the session): a daemon on trial whose first DATA went out legTrialMaxMs ago (= legFirstMs + legEchoMs: past the
  // hub's own first-data deadline, so the hub has taken the leg or left it) without the hub's plain TAKE leaves the trial itself.
  // THE DAEMON'S CLOCK (r3): its leg ticks every legTickMs (the misses, the bound, the PING cadence) — the hub calls a trial «still
  // on trial» only past that bound + one tick + one round trip + one stats push (statsMs), what it cannot see of the daemon
  legFirstMs: 7000, legReadyMs: 1000, legProbeMax: 3, legFlapMax: 3, legFlapMs: 120000, legTickMs: 250,
  // THE STALL (lane stream-leg-flap — stallStep): a PLAYING picture that decoded no frame for stallMs while the machine says it
  // sent some = stalled ⇒ said and offered again. Longer than the leg's own way back (a dead leg: the daemon's three misses
  // ≤ legLiveMs + legMissMax × legEchoMs ≈ 8 s, then a key frame over the device link), so it never races the election
  stallMs: 12000,
  probeWaitMs: 300, probeMemoMs: 60000,
  inputMaxBytes: 70000, clipMaxChars: 65536, fakeMaxBytes: 8 * 1024 * 1024,
  // lane desktop-handover: one `desktop-input` op's records — the sibling input-events' 200 (fix r2: the hub chunks a longer act,
  // a 1500-character `type --keys` ≤ 6000 records, re-asking the lease between chunks) — and one `desktop-grab`'s PNG over the
  // device link (base64 rides one control frame — the link's frame bound is 64 MB); pasteBackMs = after the agent's paste, the
  // machine's own clipboard comes back (Windows — the app has read the paste by then)
  handoverEventsMax: 200, stillMaxBytes: 32 * 1024 * 1024, pasteBackMs: 2000,
});
/** THE PER-MACHINE CAP (lane desktop-display-modes): `displays` = how many the machine has (unknown ⇒ 1) → how many live streams
 *  its daemon serves: one per display (① a window per display, ② all in one window) + 1 (a phone beside them), ≤ sessionsCap. */
/** THE RATE WITH THE SOUND (lane speaker-passthrough-v1 — the probe's rule: the sound's ~80 kbps comes OFF the picture's target):
 *  the estimate (werift's transport-cc feedback, read by src/stream-plan.js — it counts the picture's packets only; the sound's
 *  carry no transport-cc number), capped by the page's maxKbps, less `audioKbps` while the sound is on — the sound never pushes
 *  the picture under STREAM_LIMITS.maxKbpsMin, and never RAISES it (an estimate already under the floor is told as it is —
 *  measured in test-desktop-webrtc-chrome ⑳: 222 kbps on loopback). → the kbps the source is told (its own rule holds its floor). */
function videoKbpsOf({ kbps, maxKbps = STREAM_LIMITS.maxKbpsDefault, audio = false, audioKbps = 80 } = {}) {
  const cap = Number.isFinite(Number(maxKbps)) && Number(maxKbps) > 0 ? Number(maxKbps) : STREAM_LIMITS.maxKbpsDefault;
  const base = kbps == null || !Number.isFinite(Number(kbps)) ? cap : Math.min(cap, Math.max(0, Number(kbps))); // no estimate yet ⇒ the cap
  return audio ? Math.min(base, Math.max(STREAM_LIMITS.maxKbpsMin, Math.round(base - Math.max(0, Number(audioKbps) || 0)))) : base; // the sound off: the estimate as before
}
function streamCapOf(displays) {
  const n = Number.isInteger(displays) && displays > 0 ? displays : 1;
  return Math.min(STREAM_LIMITS.sessionsCap, n + 1);
}

const RUNG_ID = 'webrtc';

/**
 * May this machine's desktop open as a WebRTC stream? `capabilities` = the agent's hello-ack list; `desktop` = it is a
 * Windows / macOS machine (the access layer's verdict); `platform` = the agent's; `fakeSource` = the instance names a fake
 * source file (tests, demos — its path, handed back as `sourceId`). The source: 'fake' when the instance names one (an
 * explicit override wins — lane stream-p1b-screen), else 'screen' when the agent captures its screen (the `stream-screen`
 * capability — a Windows agent), a Mac's when its agent has `stream-mac` (lane stream-p3m-build — an older Mac agent says
 * stream-screen but cannot: agent_too_old), else no_screen_source. `want: 'window'` = ONE window (int304: the Mac's `want`
 * and lane stream-p2w-build's window source — one branch, judged before an instance's fake screen): a platform with a
 * window source (src/stream-window.js WINDOW_PLATFORMS — Windows, a Mac) whose agent says `stream-window` (a Mac's also
 * `stream-mac`) → source 'window'; an older agent ⇒ agent_too_old; any other machine ⇒ no_window_source. Its sourceId comes
 * from the page (streamSourceOf), not here.
 * → { take, source, sourceId, code, why }
 */
function streamRungVerdict({ capabilities = [], desktop = false, platform = null, fakeSource = null, want = null, table = B.DISPLAY_BACKENDS } = {}) {
  const row = B.backendById(RUNG_ID, table);
  const caps = Array.isArray(capabilities) ? capabilities : [];
  if (!row || row.wired === false) return { take: false, source: null, code: 'not_wired', why: 'the WebRTC stream rung is not wired on this instance' };
  if (!desktop) return { take: false, source: null, code: 'not_desktop_machine', why: 'a stream shows a Windows or macOS machine\'s desktop' };
  const met = row.needs.find((group) => group.every((c) => /^agent:/.test(c) && caps.includes(c.slice(6))));
  if (!met) return { take: false, source: null, code: 'agent_too_old', why: 'the machine\'s agent cannot stream yet — update it' };
  if (want === 'window') { // ONE window (int304: both platforms' window sources — one branch; a window asked wins over the instance's fake screen)
    if (!SW.WINDOW_PLATFORMS.includes(platform)) return { take: false, source: null, code: 'no_window_source', why: 'the machine\'s agent cannot stream one window yet' };
    if (!caps.includes(WINDOW_CAPABILITY) || (platform === 'darwin' && !caps.includes(MAC_CAPABILITY))) return { take: false, source: null, code: 'agent_too_old', why: 'the machine\'s agent cannot stream one window yet — update it' };
    return { take: true, source: 'window', sourceId: null, code: null, why: null };
  }
  if (fakeSource) return { take: true, source: 'fake', sourceId: String(fakeSource), code: null, why: null };
  if (platform === 'darwin') {
    if (!caps.includes(MAC_CAPABILITY)) return { take: false, source: null, code: 'agent_too_old', why: 'the Mac\'s agent cannot stream its screen yet — update it' };
    return { take: true, source: 'screen', sourceId: null, code: null, why: null };
  }
  if (caps.includes('stream-screen') && platform === 'win32') return { take: true, source: 'screen', sourceId: null, code: null, why: null };
  return { take: false, source: null, code: 'no_screen_source', why: 'the machine\'s agent cannot capture its screen yet' };
}

/** The page's choice of source (the stream/start body) → { kind: 'display' | 'window', id } | null (= the main display). An id
 *  is a display's (a Mac's CGDirectDisplayID, Windows' \\.\DISPLAY2) or a window's (CGWindowID / HWND, decimal). */
function streamSourceOf(raw) {
  if (!raw || typeof raw !== 'object' || (raw.kind !== 'window' && raw.kind !== 'display')) return null;
  const id = Number.isInteger(raw.id) && raw.id >= 0 ? String(raw.id) : typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!/^[A-Za-z0-9\\.:_-]{1,40}$/.test(id)) return null;
  const share = raw.kind === 'display' && Number.isInteger(raw.share) && raw.share >= 2 && raw.share <= STREAM_LIMITS.sessionsCap ? raw.share : null; // lane desktop-display-modes ②: how many displays share the window
  return share ? { kind: raw.kind, id, share } : { kind: raw.kind, id };
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

/** NEVER SILENT (lane stream-fallback-never-silent — owner incident inc-mvf7z2a3-9sxi, 「把 mac 串流成功降级成了 vnc，which should not
 *  be possible」: a playing stream ended on a transient and the window started the VNC picture by itself — the .305 lesson,
 *  a silent fallback is a defect). The window's answer to its stream's ending, `played` = a picture played in this window:
 *  never played ⇒ 'fallback' (the rung's old rule: a refusal shows the VNC picture — a replayed window asks first); played ⇒ never
 *  the VNC picture by itself: 'retry' the same source once (NEVER_SILENT.retryMs on), then — the display gone (`gone`) and
 *  the stream named one (`named`) — 'main' (the machine's main display) once, then 'ask' (「串流中断：…」 with 「重试」 and
 *  「显示 VNC 画面」 — the VNC picture only on that press). An ending NEVER_SILENT.windowMs after the last retry starts the
 *  ladder again. `step` / `at` = the ladder so far (the verdict's own, carried by the window). → { act, step, at } */
const NEVER_SILENT = Object.freeze({ retryMs: 1000, windowMs: 60000 });
function endingVerdict({ played = false, step = 0, at = 0, now = 0, gone = false, named = false } = {}) {
  if (!played) return { act: 'fallback', step, at };
  if (!step || now - at >= NEVER_SILENT.windowMs) return { act: 'retry', step: 1, at: now };
  if (step === 1 && gone && named) return { act: 'main', step: 2, at };
  return { act: 'ask', step: 3, at };
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
  const codec = v && v.codecId ? byId.get(v.codecId) : null;
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
    // lane stream-stats-popup: the details' packet-loss chart (Δlost ÷ (Δlost + Δreceived) a second — src/stream-series.js), the
    // frames the browser dropped, and the codec the video is decoded with (its codec report's mime type without `video/`)
    received: v && Number.isFinite(v.packetsReceived) ? v.packetsReceived : null,
    dropped: v && Number.isFinite(v.framesDropped) ? v.framesDropped : null,
    codec: codec && typeof codec.mimeType === 'string' ? codec.mimeType.replace(/^video\//i, '').slice(0, 24) : null,
    width: v && Number.isFinite(v.frameWidth) ? v.frameWidth : null,
    height: v && Number.isFinite(v.frameHeight) ? v.frameHeight : null,
    path: remote ? (remote.candidateType === 'relay' ? 'relay' : 'direct') : null,
    // lane speaker-passthrough-v1: the machine's sound as this browser hears it — its packets, its level (0–1) and its rate
    audio: audioOf(list.find((r) => r.type === 'inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio')) || null, prev && prev.audio, dt),
  };
}
/** The sound's inbound-rtp → { packets, bytes, kbps, level, energy, concealed } | null (no sound track). */
function audioOf(a, prev, dt) {
  if (!a) return null;
  const n = (x) => (Number.isFinite(x) ? x : null);
  const bytes = n(a.bytesReceived);
  return { packets: n(a.packetsReceived), bytes, kbps: dt && bytes != null && prev && prev.bytes != null ? Math.round(((bytes - prev.bytes) * 8) / dt / 1000) : null,
    level: n(a.audioLevel), energy: n(a.totalAudioEnergy), concealed: n(a.concealedSamples), jitterMs: Number.isFinite(a.jitter) ? Math.round(a.jitter * 1000) : null };
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

// ── THE UDP LEG (lane stream-relay-udp): the daemon dials the hub relay's UDP port ITSELF — TURN-shaped ───────────────────
// A Windows firewall that blocks every inbound UDP to the agent (measured on the owner's machine: no direct ICE pair, the
// device-link relay delivered 5 fps) still lets in the answers to datagrams the agent sent. The hub hands the daemon its
// relay port, a per-session key (over the device link, never on UDP) and its addresses in `stream-offer`; the daemon PINGs;
// an authenticated PING teaches the hub the daemon's (ip, port) and is answered by a PONG; from then on the browser's
// datagrams and the agent's answers ride plain UDP as DATA. Every packet starts with the magic 'VSR1' — never a STUN (0–3),
// DTLS (20–63) or RTP / RTCP (128–191) first byte (RFC 7983), so ONE hub socket tells the daemon from the browsers.
// lane stream-udp-leg-fallback: THE PROBE (hub → daemon) and its ECHO (daemon → hub) — control packets padded to the largest
// datagram the leg carries (legProbeBytes), so «leg up» is a datagram of the size the leg must carry that made the round trip at
// the HUB's asking — and the hub's WORD (TAKE: the hub forwards on the leg, send yours there — with TRIAL: on the leg AND over the
// device link until the hub heard the leg carry, make before break / LEAVE: the hub left it, use the device link). A daemon that
// answers says so in its PING flags (ANSWERS); a hub that words says so in its PONG flags (WORDS) — an older daemon ignores
// both (its parser drops types 4–6), an older hub never sends them: each side keeps the .358 behaviour with an older peer.
// r2: A WORD IS A STATE, said until the other side shows it heard — the daemon's PING says its road (UP: up · UP + TRIAL: on
// trial · neither: the device link), and the hub says LEAVE again while it flags UP, TAKE again while it flags TRIAL.
// r3: THE TAKE'S NUMBER — a WORD carries the hub's take (1 … seqMax, the flags' bits seqShift and up), the daemon's PING echoes
// the last it heard (0: none) and its facts say it (`takeSeq`): the hub judges a trial only by facts of the take it is in. The
// low bits keep their meaning — an older peer reads only those.
const LEG = Object.freeze({ magic: Object.freeze([0x56, 0x53, 0x52, 0x31]), PING: 1, PONG: 2, DATA: 3, PROBE: 4, ECHO: 5, WORD: 6, UP: 1, ANSWERS: 2, WORDS: 2, TAKE: 1, LEAVE: 2, TRIAL: 4, seqShift: 3, seqMax: 31, headBytes: 18, macBytes: 16, nonceBytes: 8, keyBytes: 32, dataHead: 11 });
const isLegPacket = (b) => b instanceof Uint8Array && b.length >= 5 && b[0] === LEG.magic[0] && b[1] === LEG.magic[1] && b[2] === LEG.magic[2] && b[3] === LEG.magic[3];
/** A PING (daemon → hub) or a PONG (hub → daemon): 'VSR1' · type · flags (UP = the daemon sends its datagrams on the leg; r2: + TRIAL = on trial, the device link too) ·
 *  counter (u32, strictly rising per session — the hub's replay bound) · nonce (8 random bytes; the PONG echoes both) · mac
 *  = `mac(the first 18 bytes)` cut to 16 (HMAC-SHA256 under the session's key — handed in). → Uint8Array(34) | null
 *  lane stream-udp-leg-fallback: a WORD (hub → daemon, its own rising counter) is the same 34 bytes; a PROBE / ECHO is padded
 *  with zeros to `bytes` (34 … dataHead + relayMaxDatagram; the ECHO echoes the PROBE's counter, nonce and size). */
function legControl(type, { flags = 0, counter, nonce, mac, bytes = 0 } = {}) {
  const padded = type === LEG.PROBE || type === LEG.ECHO;
  if ((type !== LEG.PING && type !== LEG.PONG && type !== LEG.WORD && !padded) || !Number.isInteger(counter) || counter < 0 || counter > 0xffffffff || !(nonce instanceof Uint8Array) || nonce.length !== LEG.nonceBytes || typeof mac !== 'function') return null;
  const size = padded ? Math.max(LEG.headBytes + LEG.macBytes, Number(bytes) || 0) : LEG.headBytes + LEG.macBytes;
  if (!Number.isInteger(size) || size > LEG.dataHead + STREAM_LIMITS.relayMaxDatagram) return null;
  const out = new Uint8Array(size);
  out.set(LEG.magic, 0); out[4] = type; out[5] = flags & 0xff;
  new DataView(out.buffer).setUint32(6, counter >>> 0);
  out.set(nonce, 10);
  const m = mac(out.subarray(0, LEG.headBytes));
  if (!(m instanceof Uint8Array) || m.length < LEG.macBytes) return null;
  out.set(m.subarray(0, LEG.macBytes), LEG.headBytes);
  return out;
}
/** THE TAKE'S NUMBER (r3 — a re-take's trial was judged by the facts of the take before it): `seq` (0 … seqMax) → the flag bits
 *  that carry it, beside a WORD's TAKE / LEAVE / TRIAL or a PING's UP / ANSWERS / TRIAL; a packet's flags → the number. */
const legSeqFlags = (seq) => ((Number(seq) & LEG.seqMax) << LEG.seqShift) & 0xff;
const legSeqOf = (flags) => (Number(flags) >> LEG.seqShift) & LEG.seqMax;
/** THE PROBE'S SIZE (lane stream-udp-leg-fallback r2 — a 1200-byte probe passed a path that would drop every full picture
 *  packet, and the leg was taken): the LARGEST datagram the leg carries — the DATA head + the largest datagram werift sends for
 *  the packetizer's largest payload (src/stream-h264.js maxDatagram). Derived, never a second literal. → bytes */
const legProbeBytes = () => LEG.dataHead + H264.maxDatagram();
/** DATA: 'VSR1' · 3 · the browser's IPv4 (4) · its port (u16) · the datagram. No mac — like TURN's ChannelData the 5-tuple is
 *  the proof (the hub takes DATA only from the address an authenticated PING came from, the daemon only from the hub address
 *  that answered its PING), and the payload is DTLS / SRTP, sealed end to end. → Uint8Array | null (relayFrame's bounds) */
function legData(ip, port, payload) {
  const fr = relayFrame(ip, port, payload);
  if (!fr) return null;
  const out = new Uint8Array(LEG.dataHead + fr.length - 8);
  out.set(LEG.magic, 0); out[4] = LEG.DATA;
  out.set(fr.subarray(2), 5);
  return out;
}
const CONTROL_TYPES = Object.freeze({ [LEG.PING]: 'ping', [LEG.PONG]: 'pong', [LEG.PROBE]: 'probe', [LEG.ECHO]: 'echo', [LEG.WORD]: 'word' });
/** Constant time over the mac's bytes. */
function sameBytes(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
/** A leg packet → { type: 'ping' | 'pong' | 'probe' | 'echo' | 'word', flags, counter, nonce, bytes, ok } (ok = its mac holds
 *  under `mac`) | { type: 'data', ip, port, payload } | null (not a leg packet, or malformed). */
function legParse(b, mac) {
  if (!isLegPacket(b)) return null;
  const t = b[4];
  if (t === LEG.DATA) {
    if (b.length < LEG.dataHead + 1 || b.length > LEG.dataHead + STREAM_LIMITS.relayMaxDatagram) return null;
    return { type: 'data', ip: `${b[5]}.${b[6]}.${b[7]}.${b[8]}`, port: (b[9] << 8) | b[10], payload: b.subarray(LEG.dataHead) };
  }
  const name = CONTROL_TYPES[t];
  if (!name) return null;
  const padded = t === LEG.PROBE || t === LEG.ECHO;
  if (padded ? b.length < LEG.headBytes + LEG.macBytes || b.length > LEG.dataHead + STREAM_LIMITS.relayMaxDatagram : b.length !== LEG.headBytes + LEG.macBytes) return null;
  const want = typeof mac === 'function' ? mac(b.subarray(0, LEG.headBytes)) : null;
  return {
    type: name, flags: b[5], counter: new DataView(b.buffer, b.byteOffset, b.length).getUint32(6), nonce: b.subarray(10, 18), bytes: b.length,
    ok: want instanceof Uint8Array && want.length >= LEG.macBytes && sameBytes(want.subarray(0, LEG.macBytes), b.subarray(LEG.headBytes, LEG.headBytes + LEG.macBytes)),
  };
}
/** May the hub take this PING? `lastCounter` = the highest it took for the session. → { take, code: forged | replayed } */
function legPingVerdict({ lastCounter = 0 } = {}, p) {
  if (!p || p.type !== 'ping' || !p.ok) return { take: false, code: 'forged' };
  if (!(p.counter > lastCounter)) return { take: false, code: 'replayed' };
  return { take: true, code: null };
}
/** Which way the picture comes, for the strip: 'direct' (a host pair), 'udp' (the hub relay over the daemon's UDP leg), 'link'
 *  (the hub relay over the device link), 'relay' (the relay, the leg's state not heard yet) or null. `page` = statsOf's answer;
 *  `relay` = the hub's relay facts (the long poll's `relay`) or the agent's numbers' `relay`. */
function relayPathOf(page, relay) {
  if (!page || !page.path) return null;
  if (page.path !== 'relay') return 'direct';
  const via = relay && relay.via;
  return via === 'udp' || via === 'link' ? via : 'relay';
}

/** THE PATH ELECTION of a relayed session (lane stream-leg-flap — the owner's Mac desktop went black 2026-10-20: the hub
 *  followed whichever path the daemon LAST spoke on and flipped leg ⇄ link three times in 20 s, both displays at once).
 *  ONE election per session, with HYSTERESIS. `el` = the hub's record { via: 'link' | 'udp', aliveAt, dataAt }; `ev` = {
 *  type, at, why? }:
 *    'up' / 'data'  a sign of LIFE on the leg — a PING flagged UP (the daemon hears this hub's PONGs) or DATA from its
 *                   address: a hub on the device link takes the leg, ONCE, the moment it comes up (the better path)
 *    'link'         the daemon spoke on the device link — NEVER a reason to leave the leg: a second path speaking says
 *                   nothing about the first (a .330 daemon's queued frames, its one-lost-PONG detour)
 *    'quiet'        a PING not flagged UP (the daemon heard no PONG lately) — no sign of life, no change by itself: the
 *                   leg's silence decides
 *    'judge'        the browser's datagram asks for a path: the elected leg is DEAD after its silence bound — legDeadMs
 *                   when it carried the picture (DATA within a keepalive of its last sign), legStaleMs when idle
 *  lane stream-udp-leg-fallback (the owner's Mac 2026-10-26: «leg up» at the offer, the page black 45 s, no fallback):
 *    'echo'         THE PROBE made the round trip (R2 — the hub's own datagram of the largest packet's size, answered by the
 *                   daemon's leg): takes the leg like 'up'; a daemon that answers probes is taken ONLY so (`ev.why` = the words)
 *    'alive'        such a daemon's PING flagged UP: a sign of life on the elected leg, never a reason to take it (a claim)
 *    'ask'          a browser's datagram went out on the leg: the first one since the leg was taken, with no DATA back yet,
 *                   starts THE FIRST-DATA clock
 *    'judge'        … and THE FIRST DATA (R1): a taken leg that sent nothing back legFirstMs after that first datagram is dead
 *                   («the leg carried nothing for 7 s») however many PINGs it answers — exactly as a leg silent mid-stream
 *  Every fall is counted: legFlapMax within legFlapMs PIN the session to the device link (R3 — nothing takes the leg again).
 *  → { via, aliveAt, dataAt, takenAt, askAt, falls, pinned, changed, why, fell } (why = the log's words for a change; fell =
 *  null | 'nothing' | 'silent' — the cause of a fall) */
function legElect(el, ev, { deadMs = STREAM_LIMITS.legDeadMs, idleMs = STREAM_LIMITS.legStaleMs, keepaliveMs = STREAM_LIMITS.legKeepaliveMs, firstMs = STREAM_LIMITS.legFirstMs, flapMax = STREAM_LIMITS.legFlapMax, flapMs = STREAM_LIMITS.legFlapMs } = {}) {
  const via = el && el.via === 'udp' ? 'udp' : 'link';
  const aliveAt = Number(el && el.aliveAt) || 0, dataAt = Number(el && el.dataAt) || 0, takenAt = Number(el && el.takenAt) || 0, askAt = Number(el && el.askAt) || 0;
  const falls = Array.isArray(el && el.falls) ? el.falls.filter((t) => Number.isFinite(t)) : [];
  const pinned = (el && el.pinned) || null;
  const at = Number(ev && ev.at) || 0, type = ev && ev.type;
  const keep = { via, aliveAt, dataAt, takenAt, askAt, falls, pinned, changed: false, why: null, fell: null };
  if (type === 'up' || type === 'data' || type === 'echo') {
    if (via === 'udp') return { ...keep, aliveAt: at, dataAt: type === 'data' ? at : dataAt, askAt: type === 'data' ? 0 : askAt };
    if (pinned) return keep; // R3: the device link for the rest of the session
    return { ...keep, via: 'udp', aliveAt: at, dataAt: type === 'data' ? at : dataAt, takenAt: at, askAt: 0, changed: true, why: (ev && ev.why) || (type === 'data' ? 'leg data' : 'leg up') };
  }
  if (type === 'alive') return via === 'udp' ? { ...keep, aliveAt: at } : keep;
  if (type === 'ask') return via === 'udp' && !askAt && takenAt && dataAt < takenAt ? { ...keep, askAt: at } : keep;
  if (type === 'judge' && via === 'udp') {
    let fell = null, why = null;
    if (askAt && takenAt && dataAt < takenAt && at - askAt >= firstMs) { fell = 'nothing'; why = `the leg carried nothing for ${Math.round((at - askAt) / 1000)} s`; }
    else {
      const bound = dataAt && aliveAt - dataAt < keepaliveMs ? deadMs : idleMs;
      if (at - aliveAt >= bound) { fell = 'silent'; why = `the leg was silent ${Math.round((at - aliveAt) / 1000)} s`; }
    }
    if (fell) {
      const recent = [...falls.filter((t) => at - t < flapMs), at];
      const pin = recent.length >= flapMax ? { at, falls: recent.length, why: `it fell back ${recent.length} times within ${Math.round(flapMs / 60000)} min` } : null;
      return { ...keep, via: 'link', askAt: 0, falls: recent, pinned: pin, changed: true, why: pin ? `${why} — the device link for the rest of the session: ${pin.why}` : why, fell };
    }
  }
  return keep;
}

/** THE LEG'S VERDICT (lane stream-udp-leg-fallback R2 — «leg up» is a measured fact; a dead leg says WHY): both halves' counts →
 *  { state: 'up' | 'probing' | 'dead', code (the reason), words } — the session record's and the hub log's. `hub` = the relay's leg record
 *  { via, pings (authenticated PINGs heard), echoes, probeLost (lost in a row), fell (the last fall's cause), pinned }; `daemon` =
 *  the daemon's own leg facts (its stats push — undefined: not heard yet; null: it opened no leg) { state, bindError, pings, pongs,
 *  probes, lastSendError }. Read in this order:
 *    no_socket        the daemon's stats say it opened no leg (an agent without one, or a spec it refused)
 *    bind_failed      its socket did not bind (the errno)
 *    flapping         pinned (R3): it fell back legFlapMax times within legFlapMs
 *    carried_nothing  the last fall was THE FIRST DATA's (R1): the browser's datagrams went out on it, nothing came back
 *    probe_lost       legProbeMax probes in a row unanswered while its PINGs arrive — the leg drops packets of the probe's size
 *                     (`bytes`: the largest the leg carries) while 34-byte PINGs pass; the daemon's count says which way they died
 *    firewall?        the daemon gave up on its PINGs, and this hub heard and answered them: what comes IN to the machine is dropped
 *    unreachable      the daemon gave up on its PINGs, and none ever reached this hub
 *    silent           the last fall was the silence bound's */
function legVerdictOf(hub, daemon) {
  const h = hub || {}, d = daemon || {};
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const B = legProbeBytes(), C = LEG.headBytes + LEG.macBytes;
  if (h.via === 'udp') return { state: 'up', code: null, words: n(h.echoes) ? `the hub's ${B}-byte probe made the round trip` : 'the daemon says its leg is up' };
  if (daemon === null) return { state: 'dead', code: 'no_socket', words: 'the machine\'s agent opened no udp leg' };
  if (d.bindError) return { state: 'dead', code: 'bind_failed', words: `its udp socket did not bind (${String(d.bindError).slice(0, 40)})` };
  if (h.pinned) return { state: 'dead', code: 'flapping', words: `${String(h.pinned.why || 'it kept falling back')} — the device link for the rest of the session` };
  if (h.fell === 'nothing') return { state: 'dead', code: 'carried_nothing', words: `the browser's datagrams went out on it and nothing came back for ${STREAM_LIMITS.legFirstMs / 1000} s` };
  if (n(h.probeLost) >= STREAM_LIMITS.legProbeMax) return { state: 'dead', code: 'probe_lost', bytes: B, words: n(d.probes) ? `the leg drops ${B}-byte packets toward the hub; ${C}-byte pings pass (the machine answered the hub's probes, none of its answers arrived)` : `the leg drops ${B}-byte packets; ${C}-byte pings pass (${n(h.probeLost)} of the hub's probes in a row never reached the machine)` };
  if (d.state === 'down' && n(d.pings) && !n(d.pongs)) return n(h.pings)
    ? { state: 'dead', code: 'firewall?', words: `this hub answered ${n(h.pings)} of its PINGs and none reached the machine (its firewall drops what comes in?)` }
    : { state: 'dead', code: 'unreachable', words: `none of its ${n(d.pings)} PINGs reached this hub${d.lastSendError ? ` (its last send error: ${String(d.lastSendError).slice(0, 40)})` : ''}` };
  if (h.fell === 'silent') return { state: 'dead', code: 'silent', words: 'it went silent' };
  return { state: 'probing', code: null, words: null };
}

/** THE PAGE'S SHARE OF R1 (lane stream-udp-leg-fallback — measured end to end: a browser gives a pair that never answered up
 *  within seconds and then sends nothing, so the hub's fall at legFirstMs met no check until the page's own connect budget): the
 *  hub's record counts one more fall (`relay.leg.falls`) while the page is still CONNECTING ⇒ the page asks an ICE restart now —
 *  fresh checks meet the device link. `seen` = the falls the page already acted on. → { seen, restart } */
function legFallStep(seen, relay, state) {
  const had = Number(seen) || 0, falls = relay && relay.leg ? Number(relay.leg.falls) || 0 : 0;
  if (falls <= had) return { seen: had, restart: false };
  return { seen: falls, restart: state === 'connecting' && relay.via === 'link' };
}

/** THE ROAD (lane stream-udp-leg-fallback R4 — the window says which way the picture comes, and why when it fell back): `page` =
 *  statsOf's answer, `relay` = the hub's relay facts (the long poll's `relay`). → { road: 'direct' (a host pair) | 'udp' (the
 *  hub relay over the daemon's leg) | 'link' (over the device link) | null, code (the leg's verdict when the device link carries
 *  it because the leg is dead), pinned, via (the hub relay's road now, whatever the pair), answered (some road delivered the machine's
 *  datagrams: «reconnecting…» only without) }.
 *  A relayed road is named once the page's pair is the relay's, or before that once the leg fell back (its reason says why). */
function streamRoadOf(page, relay) {
  const direct = !!(page && page.path && page.path !== 'relay');
  const via = relay && (relay.via === 'udp' || relay.via === 'link') ? relay.via : null;
  const v = relay && relay.leg && relay.leg.verdict;
  const dead = !!(v && v.state === 'dead' && via === 'link');
  const road = direct ? 'direct' : page && page.path === 'relay' ? via : dead ? 'link' : null;
  return { road, code: road === 'link' && dead ? v.code || null : null, pinned: !!(relay && relay.leg && relay.leg.pinned), via, answered: direct || !!(relay && Number(relay.down) > 0) };
}

/** THE STALL (lane stream-leg-flap — the owner's black «串流 · 2 个显示器 · 0 fps»: a picture PLAYING whose frames stopped while
 *  ICE stayed connected — no rule ever acted). `w` = the watch so far { pf, af, at } (the page's decoded frames and the
 *  machine's sent frames when the page's last advanced); `facts` = { playing, visible, pageFrames, agentFrames, now }.
 *  STALLED = playing, visible, no frame decoded for stallMs AND the machine's sent count moved meanwhile (pictures were sent,
 *  none arrived) — a still screen that sends nothing never stalls (a Mac repeats its picture every 0.5 s anyway); a hidden
 *  page re-arms (a background tab is not judged). → { w, stalled, ms } */
function stallStep(w, { playing = false, visible = true, pageFrames = null, agentFrames = null, now = 0 } = {}, { stallMs = STREAM_LIMITS.stallMs } = {}) {
  const pf = Number.isFinite(pageFrames) ? pageFrames : null, af = Number.isFinite(agentFrames) ? agentFrames : null;
  if (!playing || !visible || pf == null || !w || pf > w.pf || (w.af == null && af != null)) return { w: playing && pf != null ? { pf, af, at: now } : null, stalled: false, ms: 0 };
  const ms = Math.max(0, now - w.at);
  return { w, stalled: ms >= stallMs && af != null && af > w.af, ms };
}

/** THE STATS ROW (lane stream-window-fixes): the facts both stream windows show — `page` = statsOf's answer, `agent` = the
 *  agent's numbers (its `screen` = the source's stats: encoder, encode ms; a window's kbps + floor), `via` = relayPathOf's.
 *  → null (no numbers yet) | { rtt, jitter, fps, decode, kbps, via, encoder, encodeMs, rate: { kbps, floor } | null } */
function streamNumbersOf(page, agent = null, via = null) {
  if (!page) return null;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const sc = agent && agent.screen;
  const rate = sc && n(sc.floor) != null && n(sc.kbps) != null ? { kbps: sc.kbps, floor: sc.floor } : null;
  return { rtt: n(page.rttMs), jitter: n(page.jitterMs), fps: n(page.fps), decode: n(page.decodeMs), kbps: n(page.kbps), via: via === 'udp' || via === 'link' || via === 'relay' ? via : null,
    encoder: sc && sc.encoder ? String(sc.encoder).slice(0, 40) : null, encodeMs: sc ? n(sc.encodeMs) : null, rate };
}

// ── THE FIREWALL FACT (lane stream-relay-udp) ───────────────────────────────────────────────────────────────────────────
/** The daemon's self-probe (a datagram from a second socket of its own to each of its host addresses; Windows' firewall
 *  filters that the way it filters a browser's) → { verdict: 'open' (one arrived) | 'blocked' (none did) | 'none' (no host
 *  address to try), addrs, reached } */
function directInboundOf({ addrs = [], reached = [] } = {}) {
  const a = Array.isArray(addrs) ? addrs.length : 0, r = Array.isArray(reached) ? reached.length : 0;
  return { verdict: !a ? 'none' : r ? 'open' : 'blocked', addrs: a, reached: r };
}
/** The admin line that opens the DIRECT path on a Windows machine whose firewall blocks inbound UDP to its agent (`program` =
 *  the agent's node.exe). The machine's OWNER copies it into an administrator prompt — VibeSpace never runs it (the agent runs
 *  unelevated). The page builds it HERE from the path alone: a path that is not a plain absolute Windows .exe path, or holds a
 *  character a shell could act on (a quote, $, %, `, ;, &, |, <, >, ^), gets no line at all (null). */
function firewallRuleCommand(program) {
  const p = String(program || '');
  if (p.length > 260 || !/^[A-Za-z]:\\[^\x00-\x1f"$%`;&|<>^]*\.exe$/i.test(p)) return null;
  return `netsh advfirewall firewall add rule name="VibeSpace agent" dir=in action=allow program="${p}" protocol=UDP`;
}

module.exports = {
  STREAM_CODEC, STREAM_CODEC_AV1, streamCodecsOf, isMdnsCandidate, liteSessionSdp, STREAM_SOURCES, MAC_CAPABILITY, WINDOW_CAPABILITY, STREAM_LIMITS, streamCapOf, videoKbpsOf, RUNG_ID, streamRungVerdict, streamSourceOf, STREAM_STATES, STREAM_EVENTS, streamStep, fallbackVerdict, NEVER_SILENT, endingVerdict,
  videoToSource, INPUT_KINDS, inputEventOf, wheelUnitsOf, statsOf, relayFrame, relayUnframe, relayCandidates,
  LEG, isLegPacket, legControl, legSeqFlags, legSeqOf, legProbeBytes, legData, legParse, legPingVerdict, relayPathOf, legElect, legVerdictOf, legFallStep, streamRoadOf, stallStep, streamNumbersOf, directInboundOf, firewallRuleCommand,
};

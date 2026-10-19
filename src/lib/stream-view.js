// lane stream-p1a-transport (design q-041 r2 §2 客户端 + 输入, §3 P1/P1b): a paired machine's desktop as a WebRTC STREAM — a
// <video autoplay playsinline muted> fed by an RTCPeerConnection whose offer comes from the machine's agent (werift, one
// H.264 track + one `input` data channel), relayed by the hub (src/server/desktop-webrtc.js; the routes are people only).
// It lives in the SAME window shell as the VNC picture (src/lib/machine-desktop.js) and hands back to it on failure:
//   • THE STATE MACHINE is src/stream-model.js streamStep — start → offer → answer → connecting → playing ⇄ restarting
//     (ICE restarts, up to the budget) → fallback (the VNC picture, with the reason) | stopped (the window closed)
//   • signaling: POST …/stream/start → the offer (with the hub relay's candidates), the page's answer and its trickled
//     candidates up; THE LONG POLL (…/stream/watch) brings the agent's candidates, its numbers and `ended` down
//   • the stats strip: getStats once a second (src/stream-model.js statsOf — RTT, jitter, fps, decode ms, kbps, the path)
//   • input (P1b): the pointer, the wheel and the keys go down the data channel (src/lib/stream-input.js — the primary
//     modifier moved by THE table; physical keys); Ctrl/⌘+V sends this computer's clipboard text first, then the V; a
//     shown frame is acknowledged (≤ 4 a second) so the agent can time the picture's way
//   • phone: pointer events cover touch (touch-action: none on the picture); a tap is a click where it lands
//   • ONE WINDOW (lane stream-p2w-build; lane stream-p3m-build on a Mac — int304's one door): `source: {kind: 'window', id}` =
//     the machine's window id — the agent streams that application window (src/agentd/stream-window-source.js on Windows,
//     src/agentd/stream-mac.js on a Mac); the picture's pixels are the WINDOW's (origin 0,0) and the agent adds its live place;
//     `onSource(source)` hands the shell the window's facts (title, size, dpi) from the offer
//   • THE HAND-OVER (lane desktop-handover — src/lib/machine-desktop-handover.js): `onOwnerInput(msg)` = the person's own key,
//     pointer or wheel went down the channel (the shell pauses an agent the desktop is handed to); `onHandover(facts)` = the
//     lease's facts each long poll answers; `after` = the previous stream's key (a display switch carries the lease); `key` =
//     this stream's session key (what a hand-over names)
import { fetchJson } from './utils.js';
import { STREAM_LIMITS, streamStep, fallbackVerdict, statsOf, relayPathOf, firewallRuleCommand } from '../stream-model.js';
import { viewerPlatform, keyMapFor, keyMessage, pointerMessage, wheelMessage } from './stream-input.js';

const post = (url, body) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = '/api/desktop/machine-desktop/stream';

/** `opts` = { hostId, hostPlatform?, source?, fp16?, onStatus(state, code), onStats(page, agent), onFallback(code, why, taken),
 *  onInput(refused), onSource(source) } → { connect(), dispose(why?), focus(), get state, stats(), agent(), source(), video } —
 *  dispose(why) names the end for the hub and the machine's log ('closed' = the window's ×; 'stopped' = the person's 停止串流 —
 *  lane stream-window-fixes) */
export function createStreamView(host, opts = {}) {
  const { hostId } = opts;
  const video = document.createElement('video');
  video.className = 'stream-video';
  video.autoplay = true; video.muted = true; video.playsInline = true;
  video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
  video.tabIndex = 0;
  host.append(video);
  let st = { state: 'idle', restarts: 0 };
  let pc = null, dc = null, key = null, n = 0, seq = -1, origin = { x: 0, y: 0 }, taken = false, why = null, disposed = false, closeWhy = 'closed';
  let polling = false, statsTimer = null, connectTimer = null, prev = null, page = null, agent = null, pathSent = null, pcSince = 0;
  let source = null; // the offer's source facts (a window's: {kind: 'window', window: {id, title, app, w, h, dpi, display}})
  let hubRelay = null; // lane stream-relay-udp: the hub relay's facts (the long poll's `relay` — which way it forwards: udp | link)
  let map = keyMapFor(viewerPlatform(), opts.hostPlatform || null);
  let refusedSeen = null, switchSaid = 0;

  const send = (msg) => {
    const open = !!(msg && dc && dc.readyState === 'open');
    if (open) { try { dc.send(JSON.stringify(msg)); } catch { /* closing */ } }
    if (msg && msg.t !== 'ack') { try { opts.onOwnerInput?.(msg); } catch { /* the shell's */ } } // lane desktop-handover: the person's own input pauses an agent
    // fix r2: a display switch's next stream is not up yet — a press, key, wheel or paste reaches nothing: SAID (「切换中」), never
    // queued (a click would land on the other display's pixels); a move alone says nothing
    if (msg && !open && msg.t !== 'ack' && msg.t !== 'mv' && opts.after && st.state !== 'playing' && Date.now() - switchSaid > 3000) { switchSaid = Date.now(); try { opts.onInput?.({ code: 'switching', at: switchSaid }); } catch { /* the shell's */ } }
  };
  function step(type, code = null) {
    if (disposed && type !== 'close') return;
    const r = streamStep(st, { type, code });
    st = { state: r.state, restarts: r.restarts };
    try { opts.onStatus?.(st.state, r.code); } catch { /* the shell's */ }
    if (r.action === 'start') start();
    else if (r.action === 'restart') restart();
    else if (r.action === 'fallback') fallback(r.code);
    else if (r.action === 'dispose') teardown(closeWhy);
  }
  function armConnectTimer() {
    clearTimeout(connectTimer);
    connectTimer = setTimeout(() => { if (st.state === 'connecting' || st.state === 'restarting' || st.state === 'offered') step('timeout'); }, STREAM_LIMITS.connectMs);
  }
  async function answerOffer(offer) {
    await pc.setRemoteDescription(offer);
    await pc.setLocalDescription(await pc.createAnswer());
    const a = await post(`${BASE}/answer`, { key, sdp: pc.localDescription.sdp });
    if (!a || a.error) throw Object.assign(new Error((a && a.error) || 'the answer did not reach the machine'), { code: (a && a.code) || 'answer_failed' });
  }
  async function start() {
    const r = await post(`${BASE}/start`, { host: hostId, ...(opts.source ? { source: opts.source, ...(opts.fp16 ? { fp16: true } : {}) } : {}), ...(opts.after ? { after: opts.after } : {}) }).catch(() => null); // opts.source: a display / ONE window (a Mac's or a Windows machine's — int304's one door)
    if (disposed) { if (r && r.key) post(`${BASE}/stop`, { key: r.key, why: closeWhy }); return; }
    if (!r || r.error || !r.take) { why = (r && (r.why || r.error)) || null; step('refused', (r && r.code) || 'start_failed'); return; }
    taken = true; key = r.key;
    origin = (r.source && r.source.origin) || { x: 0, y: 0 };
    source = r.source || null;
    try { opts.onSource?.(source); } catch { /* the shell's */ }
    if (r.platform) map = keyMapFor(viewerPlatform(), r.platform);
    try {
      pc = new RTCPeerConnection({ iceServers: [] }); // no STUN/TURN service: host candidates + the hub relay's (in the offer)
      pc.ontrack = (e) => { video.srcObject = (e.streams && e.streams[0]) || new MediaStream([e.track]); video.play?.().catch?.(() => { }); };
      pc.ondatachannel = (e) => { if (e.channel && e.channel.label === 'input') dc = e.channel; };
      pc.onicecandidate = (e) => { if (e.candidate && key) post(`${BASE}/candidate`, { key, candidate: e.candidate.toJSON() }); };
      pc.onconnectionstatechange = () => {
        pcSince = performance.now();
        const s = pc.connectionState;
        if (s === 'connected') step('connected');
        else if (s === 'failed') step('failed', 'ice_failed');
      };
      pollLoop();
      step('offer');
      await answerOffer(r.offer);
      step('answered');
      armConnectTimer();
    } catch (e) { why = String((e && e.message) || e); step('failed', (e && e.code) || 'answer_failed'); }
  }
  async function restart() {
    try {
      const r = await post(`${BASE}/restart`, { key });
      if (!r || r.error || !r.offer) throw Object.assign(new Error((r && r.error) || 'no restart offer'), { code: (r && r.code) || 'restart_failed' });
      step('restart-offer');
      await answerOffer(r.offer);
      step('answered');
      armConnectTimer();
    } catch (e) { why = String((e && e.message) || e); step('ended', (e && e.code) || 'restart_failed'); }
  }
  async function pollLoop() {
    if (polling) return;
    polling = true;
    while (!disposed && key) {
      const path = page && page.path && page.path !== pathSent ? page.path : null;
      const r = await fetchJson(`${BASE}/watch?key=${encodeURIComponent(key)}&n=${n}&seq=${seq}${path ? `&path=${path}` : ''}`).catch(() => null);
      if (disposed || !key) break;
      if (!r || r.error) { await sleep(1000); continue; }
      if (path) pathSent = path;
      for (const c of r.cands || []) if (c && pc) pc.addIceCandidate(c).catch(() => { /* a candidate of an older ICE generation */ });
      n = r.n || n; seq = r.seq;
      if (r.stats) { agent = r.stats; inputWords(); }
      if (r.relay !== undefined) hubRelay = r.relay;
      try { opts.onHandover?.(r.handover || null); } catch { /* the shell's */ } // lane desktop-handover: the lease's facts
      if (r.ended) { why = null; step('ended', r.ended === 'not_found' ? 'stream_ended' : r.ended); break; }
    }
    polling = false;
  }
  function inputWords() {
    const ref = agent && agent.input && agent.input.refused;
    if (!ref || (refusedSeen && refusedSeen.at === ref.at && refusedSeen.code === ref.code)) return;
    refusedSeen = ref;
    try { opts.onInput?.(ref); } catch { /* the shell's */ }
  }
  async function readStats() {
    if (!pc) return;
    let list = [];
    try { const rep = await pc.getStats(); rep.forEach((x) => list.push(x)); } catch { list = []; }
    page = statsOf(prev, list, performance.now());
    prev = page;
    try { opts.onStats?.(page, agent); } catch { /* the shell's */ }
    const v = fallbackVerdict({ pc: pc.connectionState, since: pcSince, now: performance.now() });
    if (v.sick && (st.state === 'playing' || st.state === 'connecting')) step(v.event, v.event === 'failed' ? 'ice_failed' : 'ice_disconnected');
  }
  // THE FIRST FRAME (and the acks): requestVideoFrameCallback where the browser has it, else the element's `playing`
  let lastAck = 0;
  const onFrame = (now, meta) => {
    if (disposed) return;
    if (st.state === 'connecting') step('frame');
    if (meta && typeof meta.rtpTimestamp === 'number' && now - lastAck > 250) { lastAck = now; send({ t: 'ack', f: meta.rtpTimestamp >>> 0 }); }
    video.requestVideoFrameCallback(onFrame);
  };
  if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(onFrame);
  else video.addEventListener('playing', () => { if (st.state === 'connecting') step('frame'); });

  // ── input: the pointer, the wheel, the keys, the clipboard ──
  const box = () => video.getBoundingClientRect();
  const size = () => (video.videoWidth ? { w: video.videoWidth, h: video.videoHeight } : null);
  let moveQueued = null;
  video.addEventListener('pointerdown', (e) => {
    video.focus({ preventScroll: true });
    try { video.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    send(pointerMessage('md', e, box(), size(), origin));
    e.preventDefault();
  });
  video.addEventListener('pointermove', (e) => {
    const msg = pointerMessage('mv', e, box(), size(), origin);
    if (!msg) return;
    if (!moveQueued) requestAnimationFrame(() => { send(moveQueued); moveQueued = null; });
    moveQueued = msg; // one move a frame: the newest
  });
  video.addEventListener('pointerup', (e) => { if (moveQueued) { send(moveQueued); moveQueued = null; } send(pointerMessage('mu', e, box(), size(), origin)); });
  video.addEventListener('wheel', (e) => { e.preventDefault(); send(wheelMessage(e, box(), size(), origin)); }, { passive: false });
  video.addEventListener('contextmenu', (e) => e.preventDefault());
  let pasteWait = null;
  video.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.code === 'KeyV' && (e.ctrlKey || e.metaKey) && !e.altKey) {
      // let the browser raise `paste` (a prevented keydown would not): its text goes first, then the V
      clearTimeout(pasteWait);
      pasteWait = setTimeout(() => { pasteWait = null; send(keyMessage(e, true, map)); send(keyMessage(e, false, map)); }, 300);
      return;
    }
    e.preventDefault();
    send(keyMessage(e, true, map));
  });
  video.addEventListener('keyup', (e) => {
    if (e.code === 'KeyV' && pasteWait) return;
    if (e.code === 'KeyV' && (e.ctrlKey || e.metaKey) && !e.altKey) return;
    e.preventDefault();
    send(keyMessage(e, false, map));
  });
  video.addEventListener('paste', (e) => {
    const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    e.preventDefault();
    if (!pasteWait) return;
    clearTimeout(pasteWait); pasteWait = null;
    if (text) send({ t: 'clip', text: text.slice(0, STREAM_LIMITS.clipMaxChars) });
    send({ t: 'kd', c: 'KeyV' }); send({ t: 'ku', c: 'KeyV' });
  });

  function teardown(reason) {
    clearInterval(statsTimer); statsTimer = null; clearTimeout(connectTimer); clearTimeout(pasteWait);
    const k = key; key = null;
    if (k) post(`${BASE}/stop`, { key: k, why: reason || 'closed' });
    try { dc && dc.close(); } catch { /* gone */ }
    try { pc && pc.close(); } catch { /* gone */ }
    pc = null; dc = null;
    try { video.srcObject = null; } catch { /* gone */ }
    video.remove();
  }
  function fallback(code) {
    const w = why;
    teardown(code);
    try { opts.onFallback?.(code, w, taken); } catch { /* the shell's */ }
  }
  return {
    video,
    get state() { return st.state; },
    get key() { return key; }, // lane desktop-handover: the session a hand-over names
    connect() { if (st.state === 'idle') { step('start'); statsTimer = setInterval(() => { readStats(); }, STREAM_LIMITS.statsMs); } },
    focus() { video.focus({ preventScroll: true }); },
    stats: () => page,
    agent: () => agent,
    source: () => source,
    // lane stream-relay-udp: which way the picture comes (direct | udp — the hub relay over the daemon's UDP leg | link — over
    // the device link | relay) and the machine's firewall fact ({command} = the owner's admin line, null where none is safe)
    path: () => relayPathOf(page, hubRelay || (agent && agent.relay)),
    firewall: () => (agent && agent.directInbound && agent.directInbound.verdict === 'blocked' ? { command: firewallRuleCommand(agent.directInbound.program) } : null),
    dispose(reason = 'closed') { disposed = true; closeWhy = String(reason || 'closed'); step('close'); teardown(closeWhy); },
  };
}

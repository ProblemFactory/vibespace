#!/usr/bin/env node
// THE LEG THAT CARRIES NOTHING — heavy (slow: minutes of injected time over REAL loopback UDP), in-process (lane
// stream-udp-leg-fallback — 2026-10-26, the owner opening their paired Mac's screen in the hub: «relay via the daemon's udp leg …
// (leg up)» at the offer, then the page black for its whole connect budget (3 × 15 s) and `stopped (connect_timeout)` — no
// fallback to the device link; the next sessions flapped leg ⇄ link every 7–10 s for minutes). The REAL hub module
// (src/server/desktop-webrtc.js) and the REAL daemon leg (src/agentd/stream-host.js createLeg) over REAL loopback UDP with a
// MIDDLEBOX between them that drops by rule, a stand-in device link, a stand-in browser socket; both clocks injected; the
// stand-in daemon answers every browser datagram the way the stream host does (on the leg while it is up, else over the device
// link) and pushes its leg facts once a second and at every change of its leg (stream-stats — r3: the stream host's own shape);
// either road may be given a one-way delay and the stats timer its own phase. The rules' PURE tables are test-desktop-webrtc §14e.
//   §1 R2 · THE INCIDENT'S SHAPE — only the 34-byte control datagrams cross (PING / PONG / WORD), everything bigger dies: the hub
//      never takes the leg (its probe never came back — ONE line, `probe_lost`), the browser's FIRST datagram is answered over the
//      device link — RED CONTROL: the .358 pair (its election, the daemon's claim) takes the leg at the first PONG and is still
//      on it 45 s later with not one answer
//   §2 R1 · A LEG THAT ANSWERS THE PROBE AND CARRIES NOTHING (DATA dies both ways): taken by the probe ON TRIAL — both sides keep
//      the device link until the leg carries (make before break), so every datagram is answered; back on the device link alone
//      legFirstMs after the browser's first datagram went out on it — «(the leg carried nothing for 7 s)», LEAVE; a re-take only
//      after the backoff; pinned at the legFlapMax-th fall — RED CONTROL: the .358 hub never leaves it (45 s, not one answer)
//   §3 THE GOOD LEG (control): taken by the probe's round trip — ONE line — its first DATA ends the trial, every later answer
//      rides the leg for 60 s
// The end-to-end half (a real dialled daemon, werift's ICE, the page's restart) is test-stream-op §11.
//   §4 R3 · THE FLAPPING LEG (delivered 10 s, dead 15 s — the incident's cycle — for 4 min): at most legFlapMax falls, then the
//      device link for the rest of the session in ONE line; no probe after the pin; the last minute answered in full — RED
//      CONTROL: the .358 pair flips every cycle to the end
//   §5 R2 · THE NAMED DEAD LEG, ONE line each, on the record: nothing toward the hub ⇒ `unreachable`; nothing toward the daemon
//      ⇒ `firewall?`; a socket that does not bind ⇒ `bind_failed`; a daemon without a leg ⇒ `no_socket`
//   §6 MIXED VERSIONS + A LOST WORD: a .358 daemon behind this hub in §2's shape — R1 falls back and the daemon is left
//      unanswered, so its own misses put its answers on the device link; this daemon behind a .358 hub — UP at the first PONG,
//      as before; a LEAVE that never arrives (the PONGs do) — r2: the daemon's own trial bound puts it on the device link
//      legTrialMaxMs after its first DATA, unmuted; a daemon WITHOUT that bound (f34c96b2's shape) still on the leg legDeadMs
//      after the hub left is left unanswered a while and its misses put it on the device link (the hub's backup)
//   §7 r2 · A WORD IS A STATE — THE TRIAL-ENDING TAKE LOST: dropped ONCE ⇒ the daemon's next PING still says TRIAL, the hub says
//      its TAKE again, the daemon is up within one keepalive and every later answer goes ONE way; dropped EVERY time ⇒ the
//      daemon's own bound ends its trial (trialEndedBy 'bound'), the hub says so in ONE line and counts the datagrams that came
//      both ways (`dup`) — RED CONTROL (both): f34c96b2 keeps the daemon on trial for the run, every answer doubled; a daemon
//      without the bound: the hub's ONE line «still on trial N s after this hub ended it»
//   §8 r2 · THE PROBE'S SIZE — a path that drops datagrams over 1210 bytes (the 34-byte control crosses, a full picture packet
//      does not): never taken — ONE line `probe_lost (N B)` names the size, every answer over the device link from the first
//      — RED CONTROL: f34c96b2's 1200-byte probe crosses, the leg is taken, the trial ends on the STUN-size first answer and
//      every full-size answer after it dies on the leg; a path that passes the largest packet (control): taken, carried
//   §9 r3 · THE TRIAL'S ONE LINE, PER TAKE — a bound-ended trial 120 ms each way, the daemon's stats timer at each of its four
//      phases: ONE line «ended its trial at its own bound» every time — RED CONTROL: 5d9d2be7 judged «stuck» at the daemon's bound
//      itself, one in four said «still on trial» and never the right line; the bound's news lost and the device link 2.5 s behind:
//      «still on trial», then ONE correction «…after all» — RED: 5d9d2be7 never corrects it; a bound-ended trial, the leg dead
//      12–20 s, a re-take whose trial ends by the WORD with the device link's push 750 ms behind: no line for the second take — RED
//      CONTROL: 5d9d2be7 read the first take's «bound» again and said it with the first take's totals; two bound-ended takes: each
//      line counts its own take (the session's beside) — RED: 5d9d2be7's second line is the session's
import path from 'node:path';
import dgram from 'node:dgram';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SM = require(path.join(REPO, 'src/stream-model.js'));
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
const SH = require(path.join(REPO, 'src/agentd/stream-host.js'));
const FIXTURE = path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264');
const L = SM.STREAM_LIMITS;
// THE LARGEST DATAGRAM THE LEG CARRIES, measured with werift itself (any tree — the RED runs too): the packetizer's largest payload
// in werift's RTP packet with its transport-cc extension, sealed under its preferred SRTP profile (AEAD AES-128-GCM)
const WIRE = (() => {
  const w = require(path.join(REPO, 'node_modules/werift')), H = require(path.join(REPO, 'src/stream-h264.js'));
  const hd = new w.RtpHeader({ payloadType: 96, sequenceNumber: 1, timestamp: 1, marker: true, ssrc: 1, extension: true, extensions: [{ id: 1, payload: w.serializeTransportWideCC(1) }] });
  const keys = { localMasterKey: Buffer.alloc(16, 1), localMasterSalt: Buffer.alloc(12, 2), remoteMasterKey: Buffer.alloc(16, 3), remoteMasterSalt: Buffer.alloc(12, 4) };
  return new w.SrtpSession({ keys, profile: w.ProtectionProfileAeadAes128Gcm }).encrypt(Buffer.alloc(H.MAX_PAYLOAD, 0x5a), hd).length;
})();
const PB = SM.LEG.dataHead + WIRE; // the leg DATA of it — the probe's size since r2

// THE .358 ELECTION (src/stream-model.js legElect at 2.369.358, copied — the RED controls hand it in with `legProbe: false`, and
// the .358 daemon is `answers: false`): the leg taken at its first sign of life (a PING flagged UP, its DATA), left only after its
// silence bound — legStaleMs while it carried nothing, and every PING flagged UP is a sign of life
const BASE_ELECT = (el, ev, { deadMs = L.legDeadMs, idleMs = L.legStaleMs, keepaliveMs = L.legKeepaliveMs } = {}) => {
  const via = el && el.via === 'udp' ? 'udp' : 'link';
  const aliveAt = Number(el && el.aliveAt) || 0, dataAt = Number(el && el.dataAt) || 0;
  const at = Number(ev && ev.at) || 0, type = ev && ev.type;
  const keep = { via, aliveAt, dataAt, changed: false, why: null };
  if (type === 'up' || type === 'data') return { via: 'udp', aliveAt: at, dataAt: type === 'data' ? at : dataAt, changed: via !== 'udp', why: via !== 'udp' ? (type === 'data' ? 'leg data' : 'leg up') : null };
  if (type === 'judge' && via === 'udp') {
    const bound = dataAt && aliveAt - dataAt < keepaliveMs ? deadMs : idleMs;
    if (at - aliveAt >= bound) return { ...keep, via: 'link', changed: true, why: `the leg was silent ${Math.round((at - aliveAt) / 1000)} s` };
  }
  return keep;
};
const BASE_HUB = { legProbe: false, elect: BASE_ELECT }, BASE_DAEMON = { answers: false };

// THE MIDDLEBOX'S RULES: (direction 'up' = daemon → hub | 'down', the datagram, ms since the session began) → it crosses?
const plainTake = (d, b) => d === 'down' && b[4] === SM.LEG.WORD && (b[5] & SM.LEG.TAKE) && !(b[5] & SM.LEG.TRIAL); // the hub's trial-ending word
const saysUp = (d, b) => d === 'up' && b[4] === SM.LEG.PING && (b[5] & SM.LEG.UP) && !(b[5] & SM.LEG.TRIAL); // the daemon's PING: up, not on trial
const P = {
  open: () => true,
  controlOnly: (d, b) => b.length <= SM.LEG.headBytes + SM.LEG.macBytes, // the incident's shape: «leg up», nothing carried
  dataDead: (d, b) => b[4] !== SM.LEG.DATA, // the probe and the control cross, nothing the leg carries does
  leaveDead: (d, b) => b[4] !== SM.LEG.DATA && !(b[4] === SM.LEG.WORD && (b[5] & SM.LEG.LEAVE)), // …and the hub's LEAVE never arrives
  flap: (d, b, t) => t % 25000 < 10000, // delivered 10 s, dead 15 s (the incident's leg up → silent → link → leg up cycle)
  upDead: (d) => d !== 'up',
  downDead: (d) => d !== 'down',
  // r2: the hub's trial-ending word (a plain TAKE) dropped the first time / every time; a path that drops datagrams over n bytes
  takeOnce: () => { let n = 0; return (d, b) => !(plainTake(d, b) && n++ === 0); },
  takeMuted: (d, b) => !plainTake(d, b),
  upTo: (n) => (d, b) => b.length <= n,
  // r3: …and every PING that says «up» (the bound's news never comes by the leg); the leg dead 12–20 s with the plain TAKEs lost
  // before it (or all along): a bound-ended trial, a fall, a re-take
  newsLost: (d, b) => !plainTake(d, b) && !saysUp(d, b),
  outage: (muted) => (d, b, t) => !(t >= 12000 && t < 20000) && !((muted || t < 12000) && plainTake(d, b)),
};

const EV = { n: 0 }; // every datagram the fixture sees (the middlebox, the browser, the device link)
/** In ONE process every hop is a datagram the next loop turn delivers: quiet for three turns = settled. */
async function settle() { let quiet = 0, last = -1; for (let k = 0; k < 3000 && quiet < 3; k++) { await new Promise((r) => setImmediate(r)); await sleep(1); if (EV.n === last) quiet++; else { quiet = 0; last = EV.n; } } }
const bound = (s) => new Promise((r) => s.bind(0, '127.0.0.1', r));
const pad = (head) => { const b = Buffer.alloc(120); head.forEach((v, j) => { b[j] = v; }); return b; }; // a STUN check's size

/** ONE relayed session through the middlebox for `secs` of injected time. → per step i (at (i + 1) × stepMs): got[i] = the path the
 *  daemon heard the browser's datagram on, sentOn[i] = the path its answer went, arrived[i] = the browser has it; the hub's
 *  [stream] lines with their time; the hub's record (the long poll's `relay`) at the end and at `snapAt` steps; the daemon's leg facts.
 *  r3: `delayMs` = the leg's one-way delay (the middlebox, both ways), `linkMs` = the device link's (its frames both ways and the
 *  daemon's stats push), `pushPhaseMs` = the daemon's stats timer that far into a step (0: at the step, after its tick) — each
 *  delayed datagram and phased push lands at its own injected time. */
async function run(name, { secs, stepMs = 250, policy = P.open, hub = {}, daemon = {}, leg = true, socket = null, snapAt = [], answerBytes = () => 120, boundless = false, delayMs = 0, linkMs = 0, pushPhaseMs = 0 } = {}) {
  let clock = 9e6, step = -1, g = null, onPushFn = null, linkH = null, offerP = null, nAns = 0, dueK = 0;
  const t0 = clock, lines = [], got = [], sentOn = [], arrived = [], snaps = {}, both = [], states = [], twice = [], due = [];
  const at = (when, go) => { due.push({ when, k: dueK++, go }); };
  const later = (ms, go) => { if (ms > 0) at(clock + ms, go); else go(); };
  const until = async (to) => { // every delayed datagram / phased push due by `to`, each at its own time (none by default)
    for (let e; (e = due.filter((x) => x.when <= to).sort((a, b) => a.when - b.when || a.k - b.k)[0]);) { due.splice(due.indexOf(e), 1); clock = Math.max(clock, e.when); e.go(); await settle(); }
    clock = to;
  };
  const daemonGot = (via, ip, port, payload) => {
    EV.n++;
    if (via === 'link' && g && g.linkIn) g.linkIn(); // the stream host's relay tells the leg it heard the hub over the device link (r2)
    if (payload[0] !== 0xee) return;
    const i = (payload[1] << 8) | payload[2];
    if (!got[i]) got[i] = via;
    const ans = Buffer.alloc(Math.max(120, answerBytes(nAns++))); ans[0] = 0xaa; ans[1] = payload[1]; ans[2] = payload[2]; // a STUN check's size, or a picture packet's
    const upBefore = g ? g.up : 0;
    if (g && g.send(ip, port, ans)) { sentOn[i] = 'leg'; return; }
    if (g && g.up > upBefore) both[i] = true; // on trial: on the leg AND over the device link
    sentOn[i] = 'link';
    const fr = Buffer.from(SM.relayFrame(ip, port, new Uint8Array(ans)));
    if (linkH && linkH.onData) later(linkMs, () => { EV.n++; linkH.onData(fr); });
  };
  const fa = { status: () => ({ connected: true, info: { platform: 'darwin', capabilities: ['display-facts', 'stream-offer', 'input-events'] } }), desktopServe: async () => ({}),
    streamOffer: async (p, o) => { offerP = p; onPushFn = o && o.onPush; return { ok: true, sid: 'sid-' + name, offer: { type: 'offer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }, source: { kind: 'fake', origin: { x: 0, y: 0 } }, relayPort: 4244, codec: { mimeType: 'video/H264' } }; },
    streamAnswer: async () => ({ ok: true }), streamStop: async () => ({ stopped: true }),
    tcpForward: async () => { linkH = { write(b) { EV.n++; const fs = SM.relayUnframe(new Uint8Array(b)).frames; later(linkMs, () => { EV.n++; for (const f of fs) daemonGot('link', f.ip, f.port, f.payload); }); return true; }, close() { } }; return linkH; } };
  const wr = DW.create({ access: ACC.create({ hosts: { get: (h) => ({ id: h, name: 'Mac' }), isLocal: () => false, deviceBounded: async () => fa, connectedDevice: () => fa }, install: false, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }), log: { log() { }, warn() { } } }),
    log: { log: (m) => { if (/ relay via | udp leg dead | the daemon (?:ended|is still) /.test(m)) lines.push({ step, t: clock - t0, m }); }, warn() { } }, ips: () => ['127.0.0.1'], pollMaxMs: 120000, idleMs: 1e12, now: () => clock, ...hub });
  const s = await wr.start('mac-' + name);
  for (let k = 0; k < 400 && !(linkH && linkH.onData); k++) await sleep(5);
  const spec = offerP.relayLeg;
  const A = dgram.createSocket('udp4'), B = dgram.createSocket('udp4'), br = dgram.createSocket('udp4');
  await Promise.all([bound(A), bound(B), bound(br)]);
  let daemonAddr = null;
  const mb = { up: 0, down: 0, diedUp: 0, diedDown: 0 };
  A.on('message', (b, from) => { EV.n++; daemonAddr = from; if (policy('up', b, clock - t0)) { mb.up++; later(delayMs, () => B.send(b, spec.port, '127.0.0.1')); } else mb.diedUp++; });
  B.on('message', (b) => { EV.n++; if (daemonAddr && policy('down', b, clock - t0)) { mb.down++; const to = daemonAddr; later(delayMs, () => A.send(b, to.port, to.address)); } else mb.diedDown++; });
  br.on('message', (b) => { EV.n++; if (b[0] === 0xaa) { const i = (b[1] << 8) | b[2]; if (!arrived[i]) arrived[i] = sentOn[i] || '?'; else twice[i] = true; } });
  if (leg) g = SH.createLeg({ ...spec, port: A.address().port, hosts: ['127.0.0.1'] }, { timer: false, now: () => clock, onData: (ip, port, payload) => daemonGot('leg', ip, port, payload), onChange: () => push(), ...(socket ? { socket } : {}), ...daemon }); // the stream host pushes at every leg change (r3)
  const push = () => { if (!onPushFn) return; const m = { op: 'stream-stats', stats: { relay: { via: g && g.state === 'up' ? 'udp' : 'link', leg: g ? g.facts() : null } } }; later(linkMs, () => { EV.n++; onPushFn(m); }); };
  await settle(); push(); await settle();
  if (pushPhaseMs) { const arm = (when) => at(when, () => { push(); arm(when + L.statsMs); }); arm(t0 + pushPhaseMs); } // the stats timer on its own phase
  const steps = Math.round((secs * 1000) / stepMs);
  for (let i = 0; i < steps; i++) {
    step = i; await until(clock + stepMs);
    br.send(pad([0xee, i >> 8, i & 255]), spec.port, '127.0.0.1'); EV.n++; // the browser writes (an ICE check, RTCP, input) every step
    if (g && boundless) g.trialSentAt = 0; // a daemon WITHOUT the trial's bound (f34c96b2's): its clock never starts
    if (g) g.tick();
    if (!pushPhaseMs && (clock - t0) % 1000 === 0) push(); // the daemon's stats push, once a second
    await settle();
    states[i] = g ? g.state : null;
    if (snapAt.includes(i)) snaps[i] = (await wr.poll(s.key, 0, -1, 0)).relay;
  }
  const facts = (await wr.poll(s.key, 0, -1, 0)).relay;
  const legF = g ? g.facts() : null, changes = g ? g.changes.slice() : [];
  await wr.stop(s.key); wr.shutdown(); if (g) g.close(); A.close(); B.close(); br.close();
  return { name, lines, got, sentOn, arrived, facts, legF, changes, steps, stepMs, mb, snaps, both, states, twice, T: (i) => (i + 1) * stepMs };
}
const vias = (r) => r.lines.filter((l) => / relay via /.test(l.m));
const trials = (r) => r.lines.filter((l) => / the daemon (?:ended|is still) /.test(l.m));
const deads = (r) => r.lines.filter((l) => / udp leg dead /.test(l.m));
const said = (r) => r.lines.map((l) => `${(l.t / 1000).toFixed(2)} s ${l.m.replace(/^\[stream\] \S+ session \S+ /, '')}`);
const answered = (r, a, b, via) => { for (let i = a; i <= b; i++) if (!r.arrived[i] || (via && r.arrived[i] !== via)) return false; return true; };
const count = (xs, a, b, v) => { let n = 0; for (let i = a; i <= b; i++) if (xs[i] === v) n++; return n; };
const stepAt = (r, ms) => Math.ceil(ms / r.stepMs) - 1; // the first step at or after `ms`

console.log('§1 R2 · THE INCIDENT\'S SHAPE: the 34-byte control datagrams cross, nothing bigger does');
{
  const A = await run('c-new', { secs: 20, policy: P.controlOnly });
  const B = await run('c-358', { secs: 45, policy: P.controlOnly, hub: BASE_HUB, daemon: BASE_DAEMON });
  ok(vias(B).length === 1 && / udp leg 127\.0\.0\.1:\d+ \(leg up\)$/.test(vias(B)[0].m) && vias(B)[0].t <= 250 && !B.arrived.some(Boolean) && B.facts.via === 'udp' && B.facts.leg.up >= B.steps,
    `RED CONTROL — the .358 pair: «(leg up)» at the first PONG (${vias(B)[0] && vias(B)[0].t} ms), every one of the browser's ${B.steps} datagrams in 45 s sent on the leg, ${B.arrived.filter(Boolean).length} answered — still on the leg at 45 s (the daemon's UP PINGs kept the idle bound fresh: the owner's 45 s black pane)`, { said: said(B), via: B.facts.via, leg: B.facts.leg && { up: B.facts.leg.up, pings: B.facts.leg.pings } });
  const d = deads(A)[0];
  ok(vias(A).length === 0 && A.arrived[0] === 'link' && answered(A, 0, A.steps - 1, 'link'),
    `the hub never takes it: the browser's FIRST datagram is answered over the device link, and all ${A.steps} in 20 s (no «relay via» line — the leg was never the road)`, { said: said(A), first: A.arrived.slice(0, 4) });
  ok(deads(A).length === 1 && d.t >= 5000 && d.t <= 8000 && new RegExp(`udp leg dead \\(probe_lost ${PB} B\\) — the leg drops ${PB}-byte packets; 34-byte pings pass \\(3 of the hub's probes in a row never reached the machine\\); the device link carries it$`).test(d.m)
    && A.facts.via === 'link' && A.facts.leg.verdict.state === 'dead' && A.facts.leg.verdict.code === 'probe_lost' && A.facts.leg.probes >= 3 && A.facts.leg.echoes === 0 && A.legF.state === 'ready' && A.legF.probes === 0 && A.legF.hubWords,
    `«leg up» is measured: ${A.facts.leg.probes} probes of ${PB} bytes (the largest datagram the leg carries), none came back — ONE line at ${d && d.t} ms names it (probe_lost), the record says dead · probe_lost; the daemon heard the hub (ready) and no probe`, { said: said(A), leg: A.facts.leg, daemon: A.legF });
}

console.log('§2 R1 · A LEG THAT ANSWERS THE PROBE AND CARRIES NOTHING');
{
  const A = await run('d-new', { secs: 90, policy: P.dataDead, snapAt: [40] });
  const B = await run('d-358', { secs: 45, policy: P.dataDead, hub: BASE_HUB, daemon: BASE_DAEMON });
  ok(vias(B).length === 1 && /\(leg up\)$/.test(vias(B)[0].m) && !B.arrived.some(Boolean) && B.facts.via === 'udp',
    `RED CONTROL — the .358 hub: taken at «(leg up)», never left — ${B.arrived.filter(Boolean).length} of ${B.steps} datagrams answered in 45 s`, { said: said(B) });
  const v = vias(A);
  const took = v[0], fell = v[1];
  ok(took && took.t === 0 && new RegExp(`udp leg 127\\.0\\.0\\.1:\\d+ \\(leg up — the hub's ${PB}-byte probe made the round trip in \\d+ ms\\)$`).test(took.m), 'taken by its PROBE\'s round trip, before the browser\'s first datagram — the line says so', said(A));
  const fs1 = fell ? fell.step : -1;
  ok(fell && fell.t === L.legFirstMs + A.stepMs && / relay via the device link \(the leg carried nothing for 7 s\)$/.test(fell.m) && count(A.got, 0, fs1 - 1, 'leg') === 0 && A.sentOn.slice(0, fs1).every((x) => x === 'link' || x === undefined),
    `R1: the first datagram went out on it at ${A.stepMs} ms, nothing came back — «relay via the device link (the leg carried nothing for 7 s)» at ${fell && fell.t} ms (legFirstMs after it, inside the page's ${L.connectMs / 1000} s connect budget)`, said(A));
  ok(fell && answered(A, 0, A.steps - 1, 'link') && A.legF.state === 'held', `MAKE BEFORE BREAK: every one of the ${A.steps} datagrams in 90 s answered over the device link — the leg was taken ON TRIAL (both roads until it carries) and carried nothing, the picture lost nothing; the daemon held after LEAVE`, { first: A.arrived.slice(0, 6), daemon: A.legF && A.legF.state });
  const takes = v.filter((l) => /udp leg/.test(l.m)), falls = v.filter((l) => /device link/.test(l.m));
  const gaps = falls.slice(0, -1).map((f, k) => takes[k + 1] ? takes[k + 1].t - f.t : null);
  ok(v.length === 6 && takes.length === 3 && falls.length === 3 && falls.every((l) => /carried nothing for 7 s/.test(l.m)) && gaps[0] >= L.legReprobeMs && gaps[1] >= 2 * L.legReprobeMs,
    `re-taken only by a probe after the backoff (${gaps.map((x) => x / 1000 + ' s').join(', ')} after a fall: legReprobeMs × 2^(falls − 1)); six lines in 90 s`, said(A));
  ok(/the device link for the rest of the session: it fell back 3 times within 2 min\)$/.test(falls[2] ? falls[2].m : '') && A.facts.leg.pinned && A.facts.leg.falls === 3 && A.facts.leg.verdict.code === 'flapping' && A.legF.state === 'held' && answered(A, falls[2].step + 1, A.steps - 1, 'link'),
    `R3: the third fall PINS it — ONE line says so, the record counts 3 falls (verdict flapping), the daemon held; every datagram after it answered over the device link to the end`, { last: said(A).slice(-1), leg: A.facts.leg && { falls: A.facts.leg.falls, pinned: A.facts.leg.pinned, verdict: A.facts.leg.verdict } });
  ok(A.snaps[40] && A.snaps[40].via === 'link' && A.snaps[40].leg.verdict.code === 'carried_nothing' && A.snaps[40].link === true,
    'between a fall and the next probe the record says why: dead · carried_nothing, the device link attached', A.snaps[40] && A.snaps[40].leg.verdict);
}

console.log('§3 THE GOOD LEG (control)');
{
  const A = await run('g-new', { secs: 60, policy: P.open });
  ok(vias(A).length === 1 && new RegExp(`\\(leg up — the hub's ${PB}-byte probe made the round trip in \\d+ ms\\)$`).test(vias(A)[0].m) && deads(A).length === 0 && A.arrived[0] && answered(A, 1, A.steps - 1, 'leg') && count(A.got, 1, A.steps - 1, 'leg') === A.steps - 1,
    `taken by the probe's round trip — ONE line in 60 s; the trial's first datagram is answered over the device link too, the leg's first DATA ends the trial, and the other ${A.steps - 1} ride the leg both ways`, { said: said(A), first: A.arrived.slice(0, 4) });
  ok(A.facts.via === 'udp' && A.facts.leg.verdict.state === 'up' && A.facts.leg.echoes === 1 && A.facts.leg.probes === 1 && A.facts.leg.falls === 0 && A.facts.leg.trial === false && A.legF.state === 'up' && A.legF.words === 2 && A.legF.probes === 1,
    'the record: via udp, up (the hub\'s probe made the round trip), one probe, one echo, no fall, the trial over; the daemon took TWO words (TAKE + TRIAL, then TAKE)', { leg: A.facts.leg, daemon: A.legF });
  ok(A.facts.leg.retakes === 0 && A.facts.leg.dup === 0 && A.facts.leg.peer === 'up' && A.legF.trialEndedBy === 'word' && trials(A).length === 0 && !A.both.some((x, i) => i > 0 && x) && !A.twice.some((x, i) => i > 0 && x),
    'r2 control: the trial-ending TAKE delivered the first time — never said again (retakes 0), nothing came both ways (dup 0), the daemon says up (its trial ended by the word), no trial line, every answer after the first went ONE way', { leg: A.facts.leg && { retakes: A.facts.leg.retakes, dup: A.facts.leg.dup, peer: A.facts.leg.peer }, ended: A.legF.trialEndedBy });
}

console.log('§4 R3 · THE FLAPPING LEG (delivered 10 s, dead 15 s, for 4 minutes)');
{
  const A = await run('f-new', { secs: 240, stepMs: 500, policy: P.flap, snapAt: [200, 479] });
  const B = await run('f-358', { secs: 240, stepMs: 500, policy: P.flap, hub: BASE_HUB, daemon: BASE_DAEMON });
  ok(vias(B).length >= 14 && vias(B).filter((l) => l.t >= 180000).length >= 2, `RED CONTROL — the .358 pair: ${vias(B).length} «relay via» lines in 4 min, ${vias(B).filter((l) => l.t >= 180000).length} in the last minute (a drumbeat to the end)`, said(B).slice(0, 6));
  const v = vias(A), last = v[v.length - 1];
  ok(v.length === 6 && v.filter((l) => /device link/.test(l.m)).length === 3 && /the device link for the rest of the session: it fell back 3 times within 2 min\)$/.test(last.m) && last.t < 120000 && A.lines.every((l) => l.t <= last.t),
    `at most legFlapMax (${L.legFlapMax}) falls: ${v.length} lines, the last at ${last && Math.round(last.t / 1000)} s pins the device link for the rest of the session — not one line after it`, said(A));
  ok(A.facts.leg.pinned && A.facts.leg.falls === 3 && A.facts.leg.verdict.code === 'flapping' && A.snaps[200].leg.probes === A.snaps[479].leg.probes && answered(A, stepAt(A, 180000), A.steps - 1, 'link'),
    `the record counts the falls (3, pinned); no probe after the pin (${A.snaps[200].leg.probes} at 100 s, ${A.snaps[479].leg.probes} at 240 s); the last minute answered in full over the device link`, { leg: A.facts.leg && { falls: A.facts.leg.falls, pinned: A.facts.leg.pinned, probes: A.facts.leg.probes } });
}

console.log('§5 R2 · THE NAMED DEAD LEG');
{
  const U = await run('u', { secs: 12, policy: P.upDead });
  ok(deads(U).length === 1 && /\(unreachable\) — none of its \d+ PINGs reached this hub; the device link carries it$/.test(deads(U)[0].m) && U.facts.leg.verdict.code === 'unreachable' && U.facts.leg.pings === 0 && answered(U, 0, U.steps - 1, 'link'),
    'nothing crosses toward the hub: ONE line — unreachable (none of its PINGs reached this hub) — every datagram over the device link', said(U));
  const F = await run('w', { secs: 12, policy: P.downDead });
  ok(deads(F).length === 1 && /\(firewall\?\) — this hub answered \d+ of its PINGs and none reached the machine \(its firewall drops what comes in\?\)/.test(deads(F)[0].m) && F.facts.leg.verdict.code === 'firewall?' && F.facts.leg.pings > 0 && F.legF.pongs === 0 && answered(F, 0, F.steps - 1, 'link'),
    `nothing crosses toward the daemon: ONE line — firewall? (this hub answered ${F.facts.leg.pings} PINGs, the daemon heard none)`, said(F));
  const handlers = {};
  const noBind = { on: (ev, fn) => { handlers[ev] = fn; }, bind: () => setImmediate(() => handlers.error && handlers.error(Object.assign(new Error('bind EACCES'), { code: 'EACCES' }))), send() { }, close() { }, address: () => ({ port: 0 }) };
  const X = await run('x', { secs: 4, socket: noBind });
  ok(deads(X).length === 1 && /\(bind_failed\) — its udp socket did not bind \(EACCES\)/.test(deads(X)[0].m) && X.legF.bindError === 'EACCES' && X.legF.state === 'down' && X.facts.leg.verdict.code === 'bind_failed' && answered(X, 0, X.steps - 1, 'link'),
    'a socket that does not bind: ONE line — bind_failed (EACCES), the daemon\'s own fact', said(X));
  const N = await run('n', { secs: 3, leg: false });
  ok(deads(N).length === 1 && /\(no_socket\) — the machine's agent opened no udp leg/.test(deads(N)[0].m) && N.facts.leg.verdict.code === 'no_socket' && answered(N, 0, N.steps - 1, 'link'), 'a daemon whose stats carry no leg: ONE line — no_socket', said(N));
}

console.log('§6 MIXED VERSIONS + A LOST WORD');
{
  const O = await run('o', { secs: 30, policy: P.dataDead, daemon: BASE_DAEMON });
  const v = vias(O), back = O.arrived.findIndex((x, i) => i > (v[1] ? v[1].step : 1e9) && x === 'link');
  ok(v.length === 2 && /\(leg up\)$/.test(v[0].m) && /\(the leg carried nothing for 7 s\)$/.test(v[1].m) && O.facts.leg.muted > 0 && O.legF.state === 'down' && O.legF.why === 'no_echo' && back > 0 && O.T(back) - v[1].t <= L.legLiveMs + L.legMissMax * L.legEchoMs + 1000 && answered(O, back, O.steps - 1, 'link'),
    `a .358 daemon (its claim taken): R1 falls back at ${v[1] && v[1].t} ms and the hub stops answering it — its own misses put its answers on the device link ${back > 0 ? O.T(back) - v[1].t : '?'} ms later, to the end; never taken again`, { said: said(O), muted: O.facts.leg.muted, daemon: O.legF && { state: O.legF.state, why: O.legF.why } });
  const Q = await run('q', { secs: 10, policy: P.open, hub: BASE_HUB });
  ok(vias(Q).length === 1 && /\(leg up\)$/.test(vias(Q)[0].m) && Q.legF.state === 'up' && !Q.legF.hubWords && answered(Q, 0, Q.steps - 1, 'leg'), 'this daemon behind a .358 hub (no WORDS in its PONG): UP at the first PONG, every answer on the leg — as before', { said: said(Q), daemon: Q.legF });
  const Wr = await run('lw', { secs: 12, policy: P.leaveDead });
  const f0 = vias(Wr).find((l) => /device link/.test(l.m)), held = Wr.changes.find((c) => c.state === 'held' && f0 && c.at - 9e6 > f0.t);
  const first0 = Wr.sentOn.findIndex((x, i) => x === 'leg' || Wr.both[i]);
  ok(f0 && /carried nothing for 7 s/.test(f0.m) && held && held.why === 'trial_bound' && held.at - 9e6 - Wr.T(first0) === L.legTrialMaxMs && Wr.facts.leg.muted === 0 && Wr.legF.trialEndedBy === 'bound' && answered(Wr, 0, Wr.steps - 1, 'link'),
    `r2 — a LEAVE that never arrives (the PONGs do): the daemon on trial kept the device link, and ITS OWN BOUND takes it off the leg (held · trial_bound) ${held ? held.at - 9e6 - f0.t : '?'} ms after the hub's fall — legTrialMaxMs after its first DATA, never left unanswered; every answer arrived over the device link`, { said: said(Wr), muted: Wr.facts.leg.muted, changes: Wr.changes });
  const W = await run('lwb', { secs: 40, policy: P.leaveDead, boundless: true });
  const f1 = vias(W).find((l) => /device link/.test(l.m)), wdown = W.changes.find((c) => c.state === 'down' && f1 && c.at - 9e6 > f1.t);
  const back2 = f1 ? W.arrived.findIndex((x, i) => i > f1.step && x === 'link') : -1;
  ok(f1 && /carried nothing for 7 s/.test(f1.m) && W.facts.leg.muted > 0 && wdown && wdown.why === 'no_echo' && back2 > 0 && W.T(back2) - f1.t <= L.legDeadMs + L.legLiveMs + L.legMissMax * L.legEchoMs + 1000,
    `…and a daemon WITHOUT that bound (f34c96b2's): the hub's backup — the next answer ${back2 > 0 ? W.T(back2) - f1.t : '?'} ms after the fall came over the device link; still flagging UP ${L.legDeadMs / 1000} s after the hub left ⇒ left unanswered a while, its misses take it off the leg (down · no_echo)`, { said: said(W), muted: W.facts.leg.muted, changes: W.changes });
}

console.log('§7 r2 · A WORD IS A STATE — THE TRIAL-ENDING TAKE LOST');
{
  const doubled = (r, a = 0) => r.both.filter((x, i) => x && i >= a).length;
  const upAt = (r) => { const c = r.changes.find((x) => x.state === 'up'); return c ? c.at - 9e6 : null; };
  const A = await run('t1', { secs: 30, policy: P.takeOnce() });
  const firstLeg = A.sentOn.findIndex((x, i) => x === 'leg' || A.both[i]), endMs = firstLeg >= 0 ? A.T(firstLeg) : null, u = upAt(A); // the daemon's first DATA on the leg: the hub's trial ends there
  ok(A.legF.state === 'up' && u !== null && endMs !== null && u - endMs <= L.legLiveMs + A.stepMs && doubled(A) <= Math.ceil((L.legLiveMs + A.stepMs) / A.stepMs) + 1 && A.legF.trialEndedBy === 'word' && !A.both.some((x, i) => x && A.T(i) > u) && A.facts.down <= A.steps + doubled(A) + 4,
    `RED CONTROL ① — the trial-ending TAKE dropped ONCE: the daemon's next PING still says TRIAL, the hub says its TAKE again and the daemon is up ${u !== null && endMs !== null ? u - endMs : '?'} ms after the trial ended (within one keepalive, ${L.legLiveMs} ms); ${doubled(A)} of ${A.steps} answers went both ways, none after; the hub forwarded ${A.facts.down} datagrams for ${A.steps} answers`,
    { daemon: A.legF && { state: A.legF.state, ended: A.legF.trialEndedBy }, changes: A.changes, doubled: doubled(A), down: A.facts.down, leg: A.facts.leg && { retakes: A.facts.leg.retakes, dup: A.facts.leg.dup, peer: A.facts.leg.peer } });
  ok(A.facts.leg.retakes >= 1 && A.facts.leg.peer === 'up' && A.facts.leg.dup <= doubled(A) && trials(A).length === 0 && answered(A, 0, A.steps - 1),
    `the record: the TAKE said again ${A.facts.leg.retakes} time(s), dup ${A.facts.leg.dup}, the daemon says up; no trial line (it never reached the bound); every answer arrived`, { leg: A.facts.leg, said: said(A) });
  const M = await run('tm', { secs: 30, policy: P.takeMuted });
  const um = upAt(M), firstM = M.sentOn.findIndex((x, i) => x === 'leg' || M.both[i]), bm = firstM >= 0 ? M.T(firstM) : null, tl = trials(M);
  ok(M.legF.state === 'up' && M.legF.trialEndedBy === 'bound' && um !== null && bm !== null && um - bm >= L.legTrialMaxMs - M.stepMs && um - bm <= L.legTrialMaxMs + 2 * M.stepMs && !M.both.some((x, i) => x && M.T(i) > um + M.stepMs),
    `RED CONTROL ② — EVERY trial-ending TAKE dropped (the hub said it ${M.facts.leg.retakes} more times): the daemon's own bound ends the trial ${um !== null && bm !== null ? um - bm : '?'} ms after its first DATA (legTrialMaxMs ${L.legTrialMaxMs} = legFirstMs + legEchoMs) — up, the hub's datagrams coming on the leg alone; ${doubled(M)} of ${M.steps} answers went both ways, none after`,
    { daemon: M.legF && { state: M.legF.state, ended: M.legF.trialEndedBy, why: M.legF.why }, changes: M.changes, doubled: doubled(M) });
  ok(tl.length === 1 && new RegExp(`the daemon ended its trial at its own bound — this hub said its TAKE again ${M.facts.leg.retakes} times, ${M.facts.leg.dup} datagrams came both ways$`).test(tl[0].m) && M.facts.leg.dup > 0 && M.facts.leg.dup <= doubled(M) && M.facts.leg.retakes >= 3 && M.facts.leg.peer === 'up' && answered(M, 0, M.steps - 1),
    `ONE hub line says it («${tl[0] ? tl[0].m.replace(/^\[stream\] \S+ session \S+ /, '') : '—'}»); the record counts dup ${M.facts.leg.dup} (the device link's copies a round trip after the trial ended), the daemon says up; every answer arrived`, { said: said(M), leg: M.facts.leg && { retakes: M.facts.leg.retakes, dup: M.facts.leg.dup, peer: M.facts.leg.peer } });
  const S = await run('ts', { secs: 20, policy: P.takeMuted, boundless: true }), ts = trials(S);
  const firstS = S.sentOn.findIndex((x, i) => x === 'leg' || S.both[i]), margin = L.legTrialMaxMs + (L.legTickMs || 250) + (S.facts.leg.rttMs || 0) + L.statsMs; // r3: the bound + one tick + one round trip + one stats push
  ok(ts.length === 1 && /the daemon is still on trial (\d+) s after this hub ended it — this hub said its TAKE again \d+ times, \d+ datagrams came both ways$/.test(ts[0].m) && firstS >= 0 && ts[0].t - S.T(firstS) >= margin && ts[0].t - S.T(firstS) <= margin + L.statsMs && S.legF.state === 'trial' && S.facts.leg.dup > 0,
    `a daemon WITHOUT the bound, every TAKE lost: ONE hub line «${ts[0] ? ts[0].m.replace(/^\[stream\] \S+ session \S+ /, '') : '—'}» ${ts[0] && firstS >= 0 ? ts[0].t - S.T(firstS) : '?'} ms after the trial ended — r3: past the daemon's bound + one tick + one round trip + one stats push (${margin} ms), never AT the bound; the record's dup ${S.facts.leg.dup} keeps counting`, { said: said(S) });
}

console.log(`§8 r2 · THE PROBE'S SIZE — a path that drops datagrams over 1210 bytes (the largest the leg carries: ${PB})`);
{
  const big = (k) => (k === 0 ? 120 : WIRE); // the first answer a STUN check's size, then full picture packets
  const A = await run('m-new', { secs: 20, policy: P.upTo(1210), answerBytes: big });
  const d = deads(A)[0], got8 = count(A.arrived.map((x) => (x ? 1 : 0)), 0, A.steps - 1, 1), viaLink = count(A.arrived, 0, A.steps - 1, 'link');
  ok(vias(A).length === 0 && deads(A).length === 1 && new RegExp(`udp leg dead \\(probe_lost ${PB} B\\) — the leg drops ${PB}-byte packets; 34-byte pings pass`).test(d.m) && A.facts.leg.verdict.code === 'probe_lost' && A.facts.leg.verdict.bytes === PB && A.facts.leg.echoes === 0 && A.arrived[0] === 'link' && answered(A, 0, A.steps - 1, 'link'),
    `RED CONTROL — the hub's probe is the largest leg DATA (${PB} bytes: ${WIRE} of werift's sealed RTP + ${SM.LEG.dataHead}) and dies at 1210 — ${vias(A).length ? `TAKEN at ${vias(A)[0].t} ms («${vias(A)[0].m.replace(/^.*\(leg up — /, '').replace(/\)$/, '')}»)` : 'never taken'}; ${deads(A).length ? `ONE line «${d.m.replace(/^.*udp leg dead /, '').slice(0, 60)}…»` : 'no dead-leg line'}; ${got8} of ${A.steps} answers arrived in 20 s, ${viaLink} over the device link`,
    { said: said(A), verdict: A.facts.leg && A.facts.leg.verdict, first: A.arrived.slice(0, 4), arrived: got8 });
  const C = await run('m-ok', { secs: 20, policy: P.upTo(PB), answerBytes: big });
  ok(vias(C).length === 1 && deads(C).length === 0 && C.facts.via === 'udp' && answered(C, 1, C.steps - 1, 'leg') && C.mb.diedUp === 0 && C.mb.diedDown === 0,
    `control: a path that passes ${PB}-byte datagrams — taken by the probe, every full-size answer rides the leg`, { said: said(C), mb: C.mb });
}

console.log('§9 r3 · THE TRIAL\'S ONE LINE, PER TAKE');
{
  const words = (r) => said(r).filter((x) => / the daemon (?:ended|is still) /.test(x));
  // THE MARGIN: the daemon's bound ends its trial (every plain TAKE lost), 120 ms each way on both roads, its 250 ms tick, its stats
  // timer at each of its four phases between two ticks (the real daemon's two timers keep their own) — one of them pushes just
  // before the bound's tick and lands past the daemon's bound at the hub
  const R = [];
  for (const ph of [125, 375, 625, 875]) R.push(await run('m' + ph, { secs: 12, policy: P.takeMuted, delayMs: 120, linkMs: 120, pushPhaseMs: ph }));
  const boundR = R.filter((r) => trials(r).length === 1 && / the daemon ended its trial at its own bound — /.test(trials(r)[0].m)), stuckR = R.filter((r) => trials(r).some((l) => /still on trial/.test(l.m)));
  ok(boundR.length === 4 && stuckR.length === 0 && R.every((r) => r.legF.trialEndedBy === 'bound'),
    `RED CONTROL — the daemon's bound ends its trial, 120 ms each way, its stats push at each of its four phases: ${boundR.length} of 4 say ONE line «ended its trial at its own bound», ${stuckR.length} «still on trial» (5d9d2be7 judged «stuck» AT the daemon's bound: the push built just before the bound's tick landed past it — the wrong line, and the right one never said)`,
    R.map((r) => ({ run: r.name, said: words(r), ended: r.legF.trialEndedBy })));
  // THE CORRECTION: the bound's news lost on the leg (every «up» PING dropped) and the device link 2.5 s behind — the hub calls it
  // «still on trial» past the margin, then the daemon's own fact arrives
  const C = await run('late', { secs: 20, policy: P.newsLost, linkMs: 2500 }), tc = trials(C);
  ok(tc.length === 2 && /the daemon is still on trial \d+ s after this hub ended it — /.test(tc[0].m) && / the daemon ended its trial at its own bound after all — this hub said its TAKE again \d+ times, \d+ datagrams came both ways$/.test(tc[1].m) && C.legF.trialEndedBy === 'bound',
    `RED — the bound's news lost on the leg, the device link 2.5 s behind: «still on trial» past the margin, then ONE correction when the daemon's fact arrives («${tc[1] ? tc[1].m.replace(/^\[stream\] \S+ session \S+ /, '') : '—'}») — 5d9d2be7 kept the wrong line`, { said: words(C), ended: C.legF.trialEndedBy });
  // PER TAKE: a bound-ended trial (plain TAKEs lost until 12 s), the leg dead 12–20 s (a fall, the daemon down), a re-take whose
  // trial ends by the WORD — the device link's push 750 ms behind the leg (a picture backlog ahead of it on the same stream)
  const T2 = await run('rw', { secs: 30, policy: P.outage(false), linkMs: 750 }), t2 = trials(T2), tk2 = vias(T2).filter((l) => /udp leg/.test(l.m));
  ok(tk2.length === 2 && t2.length === 1 && t2[0].t < tk2[1].t && / the daemon ended its trial at its own bound — /.test(t2[0].m) && T2.legF.trialEndedBy === 'word' && T2.legF.state === 'up',
    `RED CONTROL — a bound-ended trial, the leg dead 12–20 s, a re-take at ${tk2[1] ? (tk2[1].t / 1000).toFixed(2) : '?'} s whose trial ends by the WORD, the push 750 ms behind: ${t2.length} line(s) — the first take's, none for the second (5d9d2be7 read the first take's «bound» in the facts at the second take and said it again, with the first take's totals)`,
    { said: said(T2), daemon: T2.legF && { state: T2.legF.state, ended: T2.legF.trialEndedBy, takeSeq: T2.legF.takeSeq } });
  ok(T2.facts.leg.takeSeq === 2 && T2.facts.leg.peerSeq === 2 && T2.legF.takeSeq === 2,
    `the take's number: this hub's second take is ${T2.facts.leg.takeSeq}, the daemon's PING echoes ${T2.facts.leg.peerSeq} and its facts say ${T2.legF.takeSeq}`, { leg: T2.facts.leg && { takeSeq: T2.facts.leg.takeSeq, peerSeq: T2.facts.leg.peerSeq } });
  // …and every plain TAKE lost all along: both trials end at the daemon's bound — each line counts ITS take
  const T3 = await run('rb', { secs: 36, policy: P.outage(true), linkMs: 750 }), t3 = trials(T3), tk3 = vias(T3).filter((l) => /udp leg/.test(l.m));
  const num = (l) => { const m = l && l.m.match(/TAKE again (\d+) times, (\d+) datagrams came both ways(?: \(the session: (\d+) and (\d+)\))?$/); return m ? m.slice(1).map((x) => (x === undefined ? null : Number(x))) : null; };
  const [a, b] = [num(t3[0]), num(t3[1])];
  const at3 = t3.map((l) => `${(l.t / 1000).toFixed(2)} s`).join(' and '), took3 = tk3.map((l) => `${(l.t / 1000).toFixed(2)} s`).join(' and ');
  ok(tk3.length === 2 && t3.length === 2 && t3.every((l) => / the daemon ended its trial at its own bound — /.test(l.m)) && t3[0].t < tk3[1].t && t3[1].t - tk3[1].t >= L.legTrialMaxMs && a && b && a[2] === null && b[0] > 0 && a[0] + b[0] === T3.facts.leg.retakes && a[1] + b[1] === T3.facts.leg.dup && b[2] === T3.facts.leg.retakes && b[3] === T3.facts.leg.dup,
    `RED — two bound-ended takes (taken at ${took3}): a line at each take's own bound (${at3}), each counting ITS take (${a ? `${a[0]} and ${a[1]}` : '?'}, then ${b ? `${b[0]} and ${b[1]}` : '?'}), the session's beside the second (${T3.facts.leg.retakes} and ${T3.facts.leg.dup} on the record) — 5d9d2be7 said the second line at the re-take itself (the first take's «bound» in the facts) with the session's totals, and the second take's own ending never`, { said: words(T3), leg: T3.facts.leg && { retakes: T3.facts.leg.retakes, dup: T3.facts.leg.dup } });
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

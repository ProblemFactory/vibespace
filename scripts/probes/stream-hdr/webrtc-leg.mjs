#!/usr/bin/env node
// THE HDR PROBE'S WEBRTC LEG (lane stream-hdr-probe, leg 3/4): can OUR transport (werift, ICE-lite, as src/agentd/stream-host.js
// sets it up) carry a 10-bit PQ picture to the browser — and what does the browser do with it?
//   native     werift → RTP → Chrome's own WebRTC decoder → <video>: the presented frame read as a VideoFrame (format, colour
//              space, the 10-bit codes at the 1000-nit square) + getStats (decoderImplementation, framesDecoded)
//   transform  the same RTP, but an RTCRtpScriptTransform takes the ENCODED frames in a worker and decodes them with WebCodecs
//              (bypassing WebRTC's decoder and <video>): the first frame's format, colour space, codes
//   +cs        VP9 only: the color-space RTP header extension (primaries 9 / transfer 16 / matrix 9 / limited) on each frame's
//              last packet — VP9's bitstream has no transfer field, so this is the only in-band way to say PQ
//   dc         a werift data channel's throughput into Chrome (the "own data channel + WebCodecs" alternative)
// Clips: make-clips.mjs's clip-av1-rt.ivf / clip-vp9-rt.ivf (+ clip-av1-rt8.ivf, the 8-bit control). AV1 / VP9 RTP payloads
// are written HERE (werift 0.25.0's AV1 packetizer sends one OBU per packet with its size field — see av1Payloads; its VP9
// one sends no picture id).
//
//   node scripts/probes/stream-hdr/webrtc-leg.mjs --clips <dir> --out <webrtc.json> [--chrome <path>] [--only av1-native]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const w = require('werift');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const CLIPS = arg('--clips', ''), OUT = arg('--out', ''), ONLY = arg('--only', '');
const H264 = require(path.join(arg('--repo', path.resolve(HERE, '../../..')), 'src', 'stream-h264.js')); // the product's RFC 6184 packetizer
const CHROME = arg('--chrome', ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p)) || '');
if (!CLIPS || !OUT) { console.error('usage: webrtc-leg.mjs --clips <dir> --out <webrtc.json>'); process.exit(2); }
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
const COLOR_SPACE_URI = 'http://www.webrtc.org/experiments/rtp-hdrext/color-space';
const AT = { p1000: [1060, 230], p203: [640, 230], bg: [640, 495] }, LUMA = { p1000: 723, p203: 573, bg: 281 };

// ── IVF + the two RTP payload formats ───────────────────────────────────────────────────────────────────────────────
function ivf(file) {
  const b = fs.readFileSync(file), out = [];
  for (let o = b.readUInt16LE(6); o + 12 <= b.length;) { const n = b.readUInt32LE(o); out.push(b.subarray(o + 12, o + 12 + n)); o += 12 + n; }
  return out;
}
/** AV1 (RTP payload spec §4): OBUs without obu_size, temporal delimiters / tile lists / padding dropped, then the WHOLE
 *  temporal unit aggregated (W=0: every element length-prefixed) and fragmented across packets — Z/Y then bound exactly one
 *  frame. MEASURED: one OBU per packet (werift 0.25.0's Av1Packetizer; no Dependency Descriptor) makes Chrome cut each OBU
 *  into its own same-timestamp "frame" ("Failed to combine frames - invalid spatial index order") and decode nothing.
 *  N=1 on the first packet of a TU that carries a sequence header. */
const leb = (n) => { const o = []; do { let b = n & 127; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); return Buffer.from(o); };
function av1Payloads(tu, mtu = 1100) {
  const obus = [];
  for (let o = 0; o < tu.length;) {
    const h = tu[o], type = (h >> 3) & 15, hl = 1 + ((h >> 2) & 1);
    let size = tu.length - o - hl, sl = 0;
    if ((h >> 1) & 1) { size = 0; let s = 0, b; do { b = tu[o + hl + sl]; size += (b & 127) * 2 ** s; s += 7; sl++; } while (b & 128); }
    const head = Buffer.from(tu.subarray(o, o + hl)); head[0] &= ~2;
    if (type !== 2 && type !== 8 && type !== 15) obus.push({ type, b: Buffer.concat([head, tu.subarray(o + hl + sl, o + hl + sl + size)]) });
    o += hl + sl + size;
  }
  const key = obus.some((x) => x.type === 1), out = [];
  let cur = [], room = mtu - 1, Z = 0; // Z belongs to the PACKET: 1 ⇔ the previous packet ended inside an element
  const flush = (Y) => { out.push(Buffer.concat([Buffer.from([(Z << 7) | (Y << 6) | ((key && out.length === 0 ? 1 : 0) << 3)]), ...cur])); cur = []; room = mtu - 1; Z = Y; };
  for (const { b } of obus) {
    let rest = b;
    while (rest.length) {
      const take = Math.min(rest.length, room - leb(Math.min(rest.length, room)).length);
      if (take <= 0) { flush(0); continue; }
      cur.push(leb(take), rest.subarray(0, take)); room -= leb(take).length + take; rest = rest.subarray(take);
      if (rest.length) flush(1);
    }
  }
  if (cur.length) flush(0);
  return { key, payloads: out };
}
/** VP9 (RFC 9628 non-flexible mode): I=1 with a 15-bit picture id, P on inter frames, B / E on the first / last packet. */
function vp9Payloads(frame, pid, mtu = 1100) {
  const b0 = frame[0], profile = ((b0 >> 5) & 1) | (((b0 >> 4) & 1) << 1), s = profile === 3 ? 1 : 0;
  const key = ((b0 >> (3 - s)) & 1) === 0 && ((b0 >> (2 - s)) & 1) === 0, out = [];
  for (let off = 0; off < frame.length; off += mtu) {
    const c = frame.subarray(off, off + mtu), B = off === 0 ? 1 : 0, E = off + c.length >= frame.length ? 1 : 0;
    out.push(Buffer.concat([Buffer.from([0x80 | (key ? 0 : 0x40) | (B << 3) | (E << 2), 0x80 | ((pid >> 8) & 0x7f), pid & 0xff]), c]));
  }
  return { key, payloads: out };
}

// ── the receiver page (Chrome) ──────────────────────────────────────────────────────────────────────────────────────
const RX_WORKER = `
const PQ = { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', fullRange: false };
const AT = ${JSON.stringify(AT)};
onrtctransform = (ev) => {
  const { codec } = ev.transformer.options, reader = ev.transformer.readable.getReader();
  let dec = null, n = 0, keys = 0, decoded = 0, first = null, err = null;
  const report = () => postMessage({ frames: n, keys, decoded, first, error: err });
  (async () => {
    for (;;) {
      const { value: f, done } = await reader.read(); if (done) return;
      n++; if (f.type === 'key') keys++;
      if (!dec) {
        if (f.type !== 'key') continue;
        const cfg = codec === 'av1' ? { codec: 'av01.0.05M.10' } : { codec: 'vp09.02.31.10', colorSpace: PQ };
        const sup = await VideoDecoder.isConfigSupported(cfg); if (!sup.supported) { err = 'unsupported ' + cfg.codec; report(); return; }
        dec = new VideoDecoder({ output: async (fr) => {
          decoded++;
          if (!first) {
            first = { format: fr.format, coded: fr.codedWidth + 'x' + fr.codedHeight, cs: fr.colorSpace.toJSON(), byteLength: f.data.byteLength };
            if (/P10/.test(fr.format || '')) { const buf = new Uint8Array(fr.allocationSize()), lay = await fr.copyTo(buf), dv = new DataView(buf.buffer);
              first.yCodes = Object.fromEntries(Object.entries(AT).map(([k, [x, y]]) => [k, dv.getUint16(lay[0].offset + y * lay[0].stride + x * 2, true)])); }
            report();
          }
          fr.close();
        }, error: (e) => { err = e.message; report(); } });
        dec.configure(cfg);
      }
      const ts = f.getMetadata().rtpTimestamp ?? f.timestamp;
      dec.decode(new EncodedVideoChunk({ type: f.type === 'key' ? 'key' : 'delta', timestamp: Math.round(ts * 100 / 9), data: f.data }));
      if (n % 15 === 0) report();
    }
  })().catch((e) => { err = String(e.message || e); report(); });
};`;
const RX_PAGE = `<!doctype html><meta charset="utf-8"><body><script>
const AT = ${JSON.stringify(AT)};
const R = {}; let pc = null;
window.rx = {
  async answer(offer, mode, codec) {
    pc = new RTCPeerConnection({});
    pc.ontrack = (e) => {
      if (mode === 'transform') { const wk = new Worker('/rx-worker.js'); wk.onmessage = (m) => { R.transform = m.data; }; e.receiver.transform = new RTCRtpScriptTransform(wk, { codec }); }
      const v = document.createElement('video'); v.muted = true; v.autoplay = true; v.playsInline = true; v.style.cssText = 'width:320px;height:180px';
      document.body.append(v); v.srcObject = new MediaStream([e.track]); v.play().catch(() => {});
      const cb = async () => {
        R.presented = (R.presented || 0) + 1;
        if (R.presented === 15) {
          try {
            const fr = new VideoFrame(v, { timestamp: 0 });
            R.native = { format: fr.format, coded: fr.codedWidth + 'x' + fr.codedHeight, cs: fr.colorSpace.toJSON() };
            if (/P10/.test(fr.format || '')) { const buf = new Uint8Array(fr.allocationSize()), lay = await fr.copyTo(buf), dv = new DataView(buf.buffer);
              R.native.yCodes = Object.fromEntries(Object.entries(AT).map(([k, [x, y]]) => [k, dv.getUint16(lay[0].offset + y * lay[0].stride + x * 2, true)])); }
            else if (fr.format) { const buf = new Uint8Array(fr.allocationSize()), lay = await fr.copyTo(buf);
              R.native.y8 = Object.fromEntries(Object.entries(AT).map(([k, [x, y]]) => [k, buf[lay[0].offset + y * lay[0].stride + x]])); }
            fr.close();
            const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const ctx = c.getContext('2d', { colorSpace: 'srgb', colorType: 'float16' });
            ctx.drawImage(v, 0, 0, 1280, 720); R.native.float16Canvas = Object.fromEntries(['p1000', 'p203'].map((k) => [k, Array.from(ctx.getImageData(...AT[k], 1, 1, { pixelFormat: 'rgba-float32' }).data).slice(0, 3).map((x) => Math.round(x * 1000) / 1000)]));
          } catch (err) { R.native = { error: String(err.message || err) }; }
        }
        v.requestVideoFrameCallback(cb);
      };
      v.requestVideoFrameCallback(cb);
    };
    pc.ondatachannel = (e) => { const ch = e.channel; ch.binaryType = 'arraybuffer'; let bytes = 0, t0 = 0, n = 0; ch.onmessage = (m) => { const t = performance.now(); if (!t0) t0 = t; bytes += m.data.byteLength; n++; R.dc = { bytes, n, ms: Math.round(t - t0) }; }; };
    await pc.setRemoteDescription(offer);
    await pc.setLocalDescription(await pc.createAnswer());
    return pc.localDescription.toJSON();
  },
  async result() {
    const s = await pc.getStats(), st = {};
    s.forEach((r) => {
      if (r.type === 'inbound-rtp' && r.kind === 'video') st.inbound = { framesReceived: r.framesReceived, framesDecoded: r.framesDecoded, keyFramesDecoded: r.keyFramesDecoded, framesDropped: r.framesDropped, decoderImplementation: r.decoderImplementation, powerEfficientDecoder: r.powerEfficientDecoder, frameWidth: r.frameWidth, codecId: r.codecId, packetsLost: r.packetsLost, nackCount: r.nackCount, pliCount: r.pliCount };
      if (r.type === 'codec') st[r.id] = r.mimeType + ' ' + (r.sdpFmtpLine || '');
    });
    if (st.inbound) st.inbound.codec = st[st.inbound.codecId];
    return { ...R, connection: pc.connectionState, inbound: st.inbound || null };
  },
  close() { pc && pc.close(); },
};
</script>`;

const server = http.createServer((req, res) => {
  if (req.url === '/rx.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(RX_PAGE); return; }
  if (req.url === '/rx-worker.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(RX_WORKER); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

async function cdpOf(wsUrl) {
  const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('cdp socket')); });
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); const p = d.id && pend.get(d.id); if (p) { pend.delete(d.id); d.error ? p.j(new Error(d.error.message)) : p.r(d.result); } };
  return { send: (method, params = {}, sessionId) => new Promise((r, j) => { const i = ++id; pend.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); }), close: () => ws.close() };
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hdr-rtc-'));
const LOG = arg('--chrome-log', ''); // Chrome's own WebRTC / decoder log lines, for a refusal's reason
const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
  ...(LOG ? ['--enable-logging=stderr', '--v=0', '--vmodule=*video*=2,*rtp*=2,*av1*=3,*dav1d*=3,*decoder*=2,*webrtc*=1'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
if (LOG) { const f = fs.createWriteStream(LOG); chrome.stderr.on('data', (d) => f.write(d)); }
const end = async () => { chrome.kill('SIGKILL'); await new Promise((r) => (chrome.exitCode !== null ? r() : chrome.once('exit', r))); fs.rmSync(dir, { recursive: true, force: true }); server.close(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const wsUrl = await new Promise((r, j) => { let buf = ''; const t = setTimeout(() => j(new Error('no DevTools url')), 20000); chrome.stderr.on('data', (d) => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); r(m[1]); } }); });
  const cdp = await cdpOf(wsUrl);
  const version = (await cdp.send('Browser.getVersion')).product;
  const CASES = [
    { name: 'av1-native', codec: 'av1', mode: 'native' }, { name: 'av1-8bit-native (control)', codec: 'av1', mode: 'native', file: 'clip-av1-rt8.ivf' }, { name: 'av1-transform', codec: 'av1', mode: 'transform' },
    { name: 'h264-pq8-native', codec: 'h264', mode: 'native', file: 'clip-h264-pq8.h264' }, { name: 'vp9-native', codec: 'vp9', mode: 'native' }, { name: 'vp9-native+cs', codec: 'vp9', mode: 'native', cs: true },
    { name: 'vp9-transform', codec: 'vp9', mode: 'transform' }, { name: 'dc', mode: 'dc' },
  ].filter((c) => !ONLY || c.name === ONLY);
  const results = { chrome: version, werift: JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve('werift')).replace(/[\\/]lib[\\/].*$/, ''), 'package.json'), 'utf8')).version, cases: [] };
  for (const c of CASES) {
    const { targetId } = await cdp.send('Target.createTarget', { url: `http://127.0.0.1:${server.address().port}/rx.html` });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const ev = async (expression) => { const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || '')); return r.result.value; };
    for (let i = 0; i < 100 && !(await ev('typeof window.rx === "object"').catch(() => false)); i++) await sleep(100);
    const FB = [{ type: 'nack' }, { type: 'nack', parameter: 'pli' }];
    const codecs = [new w.RTCRtpCodecParameters({ mimeType: { av1: 'video/AV1', vp9: 'video/VP9', h264: 'video/H264' }[c.codec] || 'video/VP9', clockRate: 90000, rtcpFeedback: FB,
      parameters: { av1: 'level-idx=5;profile=0;tier=0', vp9: 'profile-id=2', h264: 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f' }[c.codec] || 'profile-id=2' })];
    const pc = new w.RTCPeerConnection({ codecs: { video: codecs }, headerExtensions: { video: c.cs ? [new w.RTCRtpHeaderExtensionParameters({ id: 9, uri: COLOR_SPACE_URI })] : [] }, iceLite: true, iceServers: [], bundlePolicy: 'max-bundle', iceUseIpv6: false });
    const row = { name: c.name };
    let stopSend = false, track = null, dc = null, pli = 0;
    if (c.mode === 'dc') dc = pc.createDataChannel('bulk', { ordered: true });
    else { track = new w.MediaStreamTrack({ kind: 'video' }); const tr = pc.addTransceiver(track, { direction: 'sendonly' }); tr.sender.onPictureLossIndication.subscribe(() => { pli++; }); }
    await pc.setLocalDescription(await pc.createOffer());
    for (let i = 0; i < 50 && pc.iceGatheringState !== 'complete'; i++) await sleep(100);
    const answer = await ev(`rx.answer(${JSON.stringify({ type: 'offer', sdp: pc.localDescription.sdp })}, ${JSON.stringify(c.mode)}, ${JSON.stringify(c.codec || '')})`);
    row.answerCodec = (answer.sdp.match(/a=rtpmap:\d+ (AV1|VP9|H264)\/90000/) || [])[1] || null;
    row.answerFmtp = (answer.sdp.match(/a=fmtp:\d+ ((?:profile|level)[^\r\n]*)/) || [])[1] || null;
    row.answerColorSpace = answer.sdp.includes(COLOR_SPACE_URI);
    await pc.setRemoteDescription(answer);
    for (let i = 0; i < 100 && pc.connectionState !== 'connected'; i++) await sleep(100);
    row.connected = pc.connectionState === 'connected';
    if (row.connected && c.mode === 'dc') {
      for (let i = 0; i < 50 && dc.readyState !== 'open'; i++) await sleep(100);
      const chunk = Buffer.alloc(16 * 1024, 7), t0 = Date.now(); let sent = 0;
      while (Date.now() - t0 < 3000) { if (dc.bufferedAmount < 4 * 1024 * 1024) { dc.send(chunk); sent += chunk.length; } else await sleep(1); if (sent % (64 * chunk.length) === 0) await new Promise((r) => setImmediate(r)); }
      for (let i = 0; i < 60; i++) { const r = await ev('rx.result()'); if (r.dc && r.dc.bytes >= sent) break; await sleep(100); }
      const r = await ev('rx.result()');
      row.dc = { sentBytes: sent, ...r.dc, mbps: r.dc ? Math.round((r.dc.bytes * 8) / (r.dc.ms || 1) / 1000) : null };
    } else if (row.connected) {
      const frames = c.codec === 'h264' ? H264.accessUnits(H264.splitNalus(fs.readFileSync(path.join(CLIPS, c.file)))) : ivf(path.join(CLIPS, c.file || (c.codec === 'av1' ? 'clip-av1-rt.ivf' : 'clip-vp9-rt.ivf')));
      let seq = Math.floor(Math.random() * 65536), ts = 0, n = 0, bytes = 0;
      const sendLoop = (async () => {
        const t0 = Date.now(); let lastPli = 0;
        while (!stopSend) {
          if (pli !== lastPli) { lastPli = pli; n = 0; } // a PLI ⇒ back to the key frame
          const f = frames[n % frames.length]; n++;
          const p = c.codec === 'av1' ? av1Payloads(f) : c.codec === 'h264' ? { key: f.key, payloads: H264.rtpPayloads(f.nalus).map((x) => Buffer.from(x.payload)) } : vp9Payloads(f, n & 0x7fff);
          p.payloads.forEach((pl, i) => {
            const last = i === p.payloads.length - 1;
            const ext = c.cs && last ? [{ id: 9, payload: Buffer.from([9, 16, 9, 0x10]) }] : [];
            track.writeRtp(new w.RtpPacket(new w.RtpHeader({ payloadType: 96, sequenceNumber: seq, timestamp: ts, marker: last, ssrc: 1, extension: ext.length > 0, extensions: ext }), pl));
            seq = (seq + 1) & 0xffff; bytes += pl.length;
          });
          ts = (ts + 3000) >>> 0;
          const due = t0 + n * 33.333; await sleep(Math.max(0, due - Date.now()));
        }
        return { frames: n, bytes };
      })();
      const tEnd = Date.now() + 6000; let r = null;
      while (Date.now() < tEnd) { r = await ev('rx.result()'); if ((c.mode === 'native' && r.native) || (c.mode === 'transform' && r.transform && r.transform.first)) break; await sleep(200); }
      await sleep(500); r = await ev('rx.result()');
      stopSend = true; row.sent = await sendLoop; row.pli = pli;
      Object.assign(row, { native: r.native || null, transform: r.transform || null, inbound: r.inbound, presented: r.presented || 0 });
    }
    await ev('rx.close()').catch(() => { }); await pc.close().catch?.(() => { });
    await cdp.send('Target.closeTarget', { targetId });
    results.cases.push(row);
    const brief = c.mode === 'dc' ? `dc ${row.dc && row.dc.mbps} Mb/s` : `answer=${row.answerCodec} ${row.answerFmtp || ''} cs=${row.answerColorSpace} decoded=${row.inbound && row.inbound.framesDecoded} impl=${row.inbound && row.inbound.decoderImplementation} native=${JSON.stringify(row.native)} transform=${JSON.stringify(row.transform && row.transform.first)}`;
    console.log(`${row.connected ? '✓' : '✗'} ${c.name}: ${brief}`);
  }
  cdp.close();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1) + '\n');
  console.log(`→ ${OUT}`);
} finally { await end(); }
process.exit(0);

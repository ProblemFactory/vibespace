'use strict';
/**
 * THE MACHINE'S SOUND ON A PAIRED WINDOWS MACHINE (SHARED — the device agent bundles it and runs it where the sound plays; lane
 * speaker-passthrough-v1, backlog B-aec9; the measured road: lane stream-audio-probe legs 1c + 1h). The decisions are PURE
 * src/sound-model.js; src/agentd/stream-host.js puts the packets on the stream's track. ONE module per road shape: the
 * microphone's (src/desktop-mic.js) RECEIVES and plays, this one CAPTURES and sends — they share the microphone's helper (its
 * `loopback` verb — tools/vibespace-mic/vibespace-mic.cs, built on the machine the same way) and its ffmpeg finder. A Mac's
 * sound is NOT here: it rides the screen helper's own SCStream (`capturesAudio` — src/agentd/stream-mac.js source.audio).
 *   ONE CAPTURE per stream session whose 「声音」 is on, made at the press, ended at the next press / the stream's end:
 *     the helper's `loopback` (WASAPI loopback of the default speaker + its silent keep-alive) → s16le PCM → behind a streaming
 *     WAV header into the agent's ffmpeg (soundEncoderArgs: `-max_size 1920`, libopus 64 kbps, 20 ms) → RTP to a UDP socket of
 *     ours on 127.0.0.1 (its RTCP to the same socket, dropped) → `onPacket({ payload, samples, fresh, at })`.
 *   THE SENDER IS PINNED: the first RTP datagram's port + SSRC are ffmpeg's; any other datagram is dropped and counted (`stray`).
 *   A helper that ends by itself (`device_lost` — the default speaker went away or changed) starts a FRESH run (a new helper +
 *   ffmpeg on the new default) at most twice a minute; else the capture ends by name and `onEnd(code)` says it.
 * Off = nothing runs: no loopback, no keep-alive, no Opus. VIBESPACE_MIC_HELPER names a fake helper (the suites') — its road
 * is this one (the Windows shape) on any machine.
 */
const SM = require('./sound-model.js');

const named = (code, error, extra) => ({ ok: false, code, error, ...(extra || {}) });
const RESTARTS_PER_MIN = 2;

/** `helper()` → the microphone helper ({ ok, exe } — src/desktop-mic.js); `ffmpegPath()` → the stream's ffmpeg or null; `fake` =
 *  that helper is the suites' (its road is this one wherever it runs). */
function createSound({ platform = process.platform, spawn, env, log = () => { }, now = Date.now, helper, ffmpegPath = async () => null, fake = false, dgram = require('dgram') } = {}) {
  /** Can THIS module capture the machine's sound (the Windows road)? A Mac's is its screen source's. */
  const can = () => fake || platform === 'win32';

  /** One session's capture. → { start() → Promise<{ ok, endpoint } | refusal>, stop(why), stats() } */
  function capture(sid, onPacket, { onEnd = () => { } } = {}) {
    const st = { state: 'off', road: 'loopback', endpoint: null, packets: 0, bytes: 0, runs: 0, restarts: 0, stray: 0, rtcp: 0, startedAt: null, ended: null, code: null, error: null, helper: null };
    let run = null, closed = false, mark = { at: now(), bytes: 0 };
    const restartsAt = [];
    const tail = [];
    function endRun(r) {
      if (!r || r.done) return;
      r.done = true;
      try { r.sock.close(); } catch { /* gone */ }
      for (const c of [r.helper, r.enc]) {
        if (!c) continue;
        try { c.stdin.end(); } catch { /* gone */ }
        const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } }, SM.SOUND_LIMITS.stopGraceMs); t.unref?.();
        c.once('exit', () => clearTimeout(t));
      }
    }
    /** A run: the helper + ffmpeg + the socket. → Promise<{ ok, endpoint } | refusal> once the helper said started (or failed). */
    async function begin() {
      const h = await helper();
      if (!h || !h.ok) return named((h && h.code) || 'helper_missing', (h && h.error) || 'the sound helper is not built on this machine');
      const ff = await ffmpegPath();
      if (!ff) return named('no_ffmpeg', 'this machine has no ffmpeg to encode its sound');
      if (closed) return named('stopped', 'the sound was turned off while it started');
      const sock = dgram.createSocket('udp4');
      const port = await new Promise((res) => { sock.once('error', () => res(0)); sock.bind(0, '127.0.0.1', () => res(sock.address().port)); });
      if (!port) { try { sock.close(); } catch { } return named('capture_failed', 'no loopback UDP port for the encoder'); }
      const r = { sock, helper: null, enc: null, done: false, src: null, ssrc: null, fresh: true };
      sock.on('error', () => { /* a datagram lost */ });
      sock.on('message', (m, from) => {
        if (r.done || closed) return;
        if (m.length >= 2 && m[1] >= 200 && m[1] <= 204) { st.rtcp++; return; } // ffmpeg's own RTCP (sent to this socket by `rtcpport`)
        const p = from.address === '127.0.0.1' ? SM.rtpOf(m) : null;
        if (!p) { st.stray++; return; }
        if (r.src == null) { r.src = from.port; r.ssrc = p.ssrc; } // THE SENDER IS PINNED: ffmpeg's first datagram
        else if (from.port !== r.src || p.ssrc !== r.ssrc) { st.stray++; return; }
        const payload = Buffer.from(p.payload);
        st.packets++; st.bytes += payload.length;
        if (st.state === 'starting') st.state = 'live';
        const fresh = r.fresh; r.fresh = false;
        try { onPacket({ payload, samples: SM.opusSamples(payload) || SM.SOUND.samples, fresh, at: now() }); } catch { /* the host's */ }
      });
      const args = SM.soundEncoderArgs(port);
      const enc = r.enc = spawn(ff, args, { env, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      enc.on('error', (e) => { st.code = 'encoder_failed'; st.error = String((e && e.message) || e).slice(0, 200); });
      enc.stdin.on('error', () => { });
      enc.stderr.on('data', (d) => { const l = String(d).trim().split(/\r?\n/).pop(); if (l) { tail.push(l.slice(0, 200)); if (tail.length > 3) tail.shift(); } });
      enc.stdin.write(Buffer.from(SM.soundWavHeader()));
      const hc = r.helper = spawn(h.exe, ['loopback'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      hc.stdin.on('error', () => { });
      hc.stdout.pipe(enc.stdin);
      run = r;
      return new Promise((resolve) => {
        let said = false, buf = '';
        const answer = (v) => { if (said) return; said = true; clearTimeout(timer); resolve(v); };
        const timer = setTimeout(() => answer(named('capture_failed', `the sound did not start within ${SM.SOUND_LIMITS.startMs / 1000} s${tail.length ? ` (${tail[tail.length - 1]})` : ''}`)), SM.SOUND_LIMITS.startMs);
        timer.unref?.();
        hc.on('error', (e) => { answer(named('helper_missing', `the sound helper did not run (${(e && (e.code || e.message)) || e})`)); });
        hc.stderr.on('data', (d) => {
          buf += String(d); const lines = buf.split(/\r?\n/); buf = lines.pop();
          for (const l of lines) {
            let o = null; try { o = JSON.parse(l); } catch { continue; }
            if (!o || !o.ev) continue;
            if (o.ev === 'started') { st.endpoint = String(o.endpoint || '').slice(0, 200); r.live = true; answer({ ok: true, endpoint: st.endpoint }); }
            else if (o.ev === 'stats') st.helper = { packets: Number(o.packets) || 0, silent: Number(o.silent) || 0, peakDb: Number.isFinite(Number(o.peakDb)) ? Number(o.peakDb) : null };
            else if (o.ev === 'error') { st.code = 'capture_failed'; st.error = String(o.error || '').slice(0, 200); answer(named('capture_failed', `the machine's sound could not be captured (${st.error})`)); }
            else if (o.ev === 'end') r.why = String(o.why || '').slice(0, 40);
          }
        });
        hc.once('exit', (code) => {
          answer(named('capture_failed', `the sound helper ended (${code})${st.error ? `: ${st.error}` : ''}`));
          if (!r.live || r.done || closed || run !== r) return; // before `started`: start() answers it
          endRun(r);
          const t = now();
          while (restartsAt.length && t - restartsAt[0] > 60000) restartsAt.shift();
          if (r.why === 'device_lost' && restartsAt.length < RESTARTS_PER_MIN) {
            restartsAt.push(t); st.restarts++; st.state = 'starting';
            log(`[sound] ${sid} the default speaker changed — a fresh capture (${st.restarts})`);
            begin().then((v) => { if (!v.ok && !closed) fail(v); }, (e) => { if (!closed) fail(named('capture_failed', String((e && e.message) || e))); });
            return;
          }
          fail(named('capture_ended', `the machine's sound capture ended (${r.why || `exit ${code}`})`));
        });
      });
    }
    function fail(v) {
      st.state = 'failed'; st.code = v.code; st.error = v.error; st.ended = { why: v.code, at: now() };
      log(`[sound] ${sid} ended: ${v.code}${v.error ? ` (${v.error})` : ''}`);
      try { onEnd(v.code, v.error); } catch { /* the host's */ }
    }
    async function start() {
      if (closed) return named('stopped', 'that capture was stopped');
      if (run && !run.done) return { ok: true, endpoint: st.endpoint, already: true };
      if (!can()) return named('sound_unsupported', `this machine's sound reaches the stream on Windows or macOS (this one runs ${platform})`);
      st.state = 'starting'; st.code = null; st.error = null; st.ended = null; st.runs++; st.startedAt = now();
      let v;
      try { v = await begin(); } catch (e) { v = named('capture_failed', String((e && e.message) || e)); }
      if (!v.ok) { const r = run; run = null; endRun(r); if (!closed) { st.state = 'failed'; st.code = v.code; st.error = v.error; } return v; }
      if (closed) return named('stopped', 'the sound was turned off while it started');
      if (st.state === 'starting') st.state = 'live';
      log(`[sound] ${sid} live: the loopback of «${st.endpoint || 'the default speaker'}» → Opus ${SM.SOUND.kbps} kbps`);
      return v;
    }
    function stop(why = 'off') {
      if (closed) return;
      closed = true;
      const r = run; run = null; endRun(r);
      if (st.state !== 'failed') st.state = 'off';
      st.ended = st.ended || { why: String(why).slice(0, 40), at: now() };
      log(`[sound] ${sid} off (${why})`);
    }
    function stats() {
      const t = now(), dt = Math.max(1, t - mark.at) / 1000;
      const kbps = Math.round(((st.bytes - mark.bytes) * 8) / dt / 1000);
      mark = { at: t, bytes: st.bytes };
      return { ...st, kbps, helper: st.helper && { ...st.helper }, ended: st.ended && { ...st.ended } };
    }
    return { start, stop, stats };
  }
  return { can, capture };
}

module.exports = { createSound };

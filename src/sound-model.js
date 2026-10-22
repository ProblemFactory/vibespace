'use strict';
/**
 * THE MACHINE'S SOUND TO THE VIEWER — the PURE tables (lane speaker-passthrough-v1, backlog B-aec9; every number is lane
 * stream-audio-probe's, measured on the owner's machines: its report «Speaker, V1 per platform», «Fallback road: no», «Design
 * input» 1, 2, 4). The strip's 「声音」 plays what the paired machine plays, beside its picture, in the SAME <video>:
 *   • THE ROAD: one werift audio track on the stream's audio m-line (the microphone's — lane stream-mic-road: sendrecv when both
 *     are on), in the picture's MediaStream (one msid — SOUND.streamId), Opus 48 kHz stereo, 64 kbps, 20 ms frames.
 *       Windows  WASAPI loopback on the default speaker + a SILENT render stream kept open on it while the sound is on (without
 *                it a quiet machine delivers nothing and the encoder starves) — the microphone helper's `loopback` verb
 *                (tools/vibespace-mic/vibespace-mic.cs) → s16le PCM behind a streaming WAV header (soundWavHeader) → the
 *                agent's ffmpeg (SOUND_ENCODER_ARGS: `-max_size 1920`, libopus) → RTP on a loopback UDP port → the track
 *       Mac      the screen helper's own SCStream gets `capturesAudio` (no new TCC class — it rides 「屏幕与系统录音」) and
 *                AudioToolbox encodes the Opus; the packets ride the helper's FLV beside the picture
 *   • THE TOGGLE (soundStep): OFF for a machine until the person turns it on; ON is remembered per machine in this browser
 *     (rememberSound — the HDR switch's shape); off = the machine captures nothing; on = ONE op starts the capture AND the page
 *     unmutes the <video> in the same click; a RESTORED window (a reload, a layout replay) never unmutes by itself — it says
 *     「点一下开声音」 until a press (soundStartOf).
 *   • THE CLOCK (soundRtpStep): one sequence and one 48 kHz timestamp per session across every on/off — a new run continues
 *     them, its timestamp advanced by the wall-clock gap, its first packet marked.
 * The decisions here; src/desktop-sound.js runs the Windows road, src/agentd/stream-mac.js the Mac's, src/agentd/stream-host.js
 * the track; src/lib/stream-mic-strip.js draws the toggle. Imports nothing.
 */

const SOUND_CAPABILITY = 'stream-audio'; // the hello-ack word: the agent offers the sound's track and answers `stream-audio`
const SOUND = Object.freeze({
  kbps: 64,          // libopus / AudioToolbox target
  wireKbps: 80,      // on the wire (64 k + RTP/UDP/IP + SRTP at 50 packets a second) — taken OFF the picture's rate (stream-model videoKbpsOf)
  frameMs: 20, clockRate: 48000, samples: 960, channels: 2,
  streamId: 'vibespace-desktop', // the picture's and the sound's msid: ONE MediaStream, so the page's <video> carries both
});
const SOUND_LIMITS = Object.freeze({
  startMs: 15000,    // the op waits at most this for the capture to say started (Windows: the helper + ffmpeg; Mac: SCK's reconfigure)
  stopGraceMs: 1000, // a child that has not ended this long after its stdin closed is killed
  queueMax: 25,      // packets held while the track is not yet connected (0.5 s) — older ones dropped
});

// ── THE ENCODER (Windows: the agent's ffmpeg) ─────────────────────────────────────────────────────────────────────────
/** The probe's measured encode (leg 1h — app write → Opus RTP 21–30 ms): PCM behind a STREAMING WAV header (the wav demuxer's own
 *  max_size makes 10 ms packets; the raw s16le demuxer reads ~85 ms a packet — the clumps of leg 1f), no probing, every packet
 *  flushed, libopus 64 kbps, 20 ms frames, RTP to `port` on 127.0.0.1. */
function soundEncoderArgs(port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) return null;
  return ['-hide_banner', '-loglevel', 'error', '-fflags', 'nobuffer', '-probesize', '32', '-analyzeduration', '0',
    '-f', 'wav', '-max_size', '1920', '-ignore_length', '1', '-i', 'pipe:0',
    '-c:a', 'libopus', '-b:a', `${SOUND.kbps}k`, '-application', 'lowdelay', '-frame_duration', String(SOUND.frameMs),
    '-flush_packets', '1', '-max_delay', '0', '-muxdelay', '0', '-muxpreload', '0', '-f', 'rtp', `rtp://127.0.0.1:${p}?rtcpport=${p}`]; // its RTCP to the SAME socket (dropped there) — never to port + 1, someone else's
}
/** A streaming WAV header: s16le stereo 48 kHz, its sizes "unknown" (0xFFFFFFFF — ffmpeg's -ignore_length 1). → 44 bytes */
function soundWavHeader() {
  const b = new Uint8Array(44), v = new DataView(b.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 0xFFFFFFFF, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, SOUND.channels, true); v.setUint32(24, SOUND.clockRate, true); v.setUint32(28, SOUND.clockRate * 2 * SOUND.channels, true);
  v.setUint16(32, 2 * SOUND.channels, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, 0xFFFFFFFF, true);
  return b;
}
/** One RTP datagram (ffmpeg's) → { seq, ts, pt, ssrc, payload (a view) } | null (not RTP version 2, or truncated). */
function rtpOf(buf) {
  const b = buf instanceof Uint8Array ? buf : null;
  if (!b || b.length < 12 || (b[0] >> 6) !== 2) return null;
  const cc = b[0] & 15, x = (b[0] >> 4) & 1, pad = (b[0] >> 5) & 1;
  let off = 12 + cc * 4;
  if (x) { if (b.length < off + 4) return null; off += 4 + ((b[off + 2] << 8) | b[off + 3]) * 4; }
  let end = b.length;
  if (pad) end -= b[b.length - 1];
  if (off > end) return null;
  return { seq: (b[2] << 8) | b[3], ts: ((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]) >>> 0, pt: b[1] & 127, ssrc: ((b[8] << 24) | (b[9] << 16) | (b[10] << 8) | b[11]) >>> 0, payload: b.subarray(off, end) };
}

/** The samples (at 48 kHz) one Opus packet holds — its TOC byte (RFC 6716 §3.1): the frame size of its config × its frame count.
 *  → 120 … 5760, or 0 for a packet that says nothing (empty / a bad count). */
function opusSamples(packet) {
  const b = packet instanceof Uint8Array ? packet : null;
  if (!b || !b.length) return 0;
  const cfg = b[0] >> 3, code = b[0] & 3;
  const frame = cfg < 12 ? [480, 960, 1920, 2880][cfg & 3] : cfg < 16 ? [480, 960][cfg & 1] : [120, 240, 480, 960][cfg & 3];
  const count = code === 0 ? 1 : code === 3 ? (b.length > 1 ? b[1] & 63 : 0) : 2;
  const n = frame * count;
  return n > 0 && n <= 5760 ? n : 0;
}

// ── THE CLOCK ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A session's sound clock: the first sequence number and timestamp (from `seed` — the host hands a random one). */
function soundRtpStart(seed = 0) { const n = Math.abs(Math.floor(Number(seed) || 0)); return { seq: n & 0xffff, ts: (n * 2654435761) >>> 0, at: null, samples: 0 }; }
/** One packet → its header fields. `fresh` = the first packet of a capture run (a press after off, a restarted helper): its
 *  timestamp advances by the wall-clock gap since the last packet (whole frames — the receiver's jitter buffer sees time pass),
 *  and it is MARKED; inside a run each packet follows the last by that one's samples. → { st, seq, ts, marker } */
function soundRtpStep(st, { samples = SOUND.samples, at = 0, fresh = false } = {}) {
  const s = st && Number.isInteger(st.seq) ? st : soundRtpStart(0);
  const n = Number.isInteger(samples) && samples > 0 && samples <= 5760 ? samples : SOUND.samples;
  let ts = s.ts;
  if (s.at != null) {
    ts = (ts + s.samples) >>> 0;
    if (fresh) { const gap = Math.max(0, Number(at) - s.at - SOUND.frameMs); ts = (ts + Math.round(gap * SOUND.clockRate / 1000 / SOUND.samples) * SOUND.samples) >>> 0; }
  }
  const seq = s.at == null ? s.seq : (s.seq + 1) & 0xffff;
  return { st: { seq, ts, at: Number(at) || 0, samples: n }, seq, ts, marker: !!fresh || s.at == null };
}

// ── THE TOGGLE ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SOUND_KEY = 'vibespace.streamSound';
const MEMORY_HOSTS = 32;
const memoryOf = (raw) => { let o = raw; if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } } return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; };
/** The stored memory (localStorage's string, or its object) → is the sound on for this machine (default false). */
function soundRemembered(raw, hostId) {
  const o = memoryOf(raw), k = String(hostId || '');
  return !!k && Object.prototype.hasOwnProperty.call(o, k) && o[k] === true;
}
/** The memory with this machine on (moved last) or off (forgotten — off is the default) → its JSON string (≤ 32 machines). */
function rememberSound(raw, hostId, on) {
  const o = memoryOf(raw), k = String(hostId || '').slice(0, 200);
  const keep = Object.entries(o).filter(([h, v]) => h !== k && v === true);
  if (k && on === true) keep.push([k, true]);
  return JSON.stringify(Object.fromEntries(keep.slice(-MEMORY_HOSTS)));
}
/** How a stream that carries the sound's track begins: `remembered` (this machine's sound was on), `restored` (the window came
 *  back by itself — a reload, a layout replay — and nobody pressed in it since), `activated` (the page has had a person's
 *  gesture: the browser lets it unmute). → 'on' | 'tap' (「点一下开声音」) | 'off' */
function soundStartOf({ remembered = false, restored = false, activated = false } = {}) {
  if (!remembered) return 'off';
  return restored || !activated ? 'tap' : 'on';
}
const SOUND_STATES = Object.freeze(['off', 'tap', 'starting', 'on', 'refused', 'unavailable']);
const SOUND_EVENTS = Object.freeze(['ready', 'press', 'started', 'failed', 'blocked', 'stream_end', 'close']);
/**
 * THE TOGGLE (a verdict table — the strip runs `action`; `remember` = what this machine's memory becomes, when it changes):
 *   any + ready {ok:false}                    → unavailable (no_mline: the agent offers no sound) · mute
 *   any + ready {ok, remembered, restored, activated} → soundStartOf: on ⇒ starting (start) · tap ⇒ tap · off ⇒ off
 *   off|tap|refused + press                   → starting (start: unmute in THIS click + the op) · remember on
 *   on|starting + press                       → off (stop: the op off + mute) · remember off
 *   unavailable + press                       → unavailable (no_mline) — nothing asked
 *   starting + started                        → on
 *   starting|on + failed {code}               → refused (mute — the machine said why)
 *   starting|on + blocked                     → tap (stop — the browser would not unmute: nobody would hear it)
 *   any + stream_end                          → unavailable (mute — the machine's capture ends with its session)
 *   any + close                               → off (stop) — the memory is untouched (the next window of the machine)
 * → { state, action: 'start' | 'stop' | 'mute' | null, code, remember: true | false | undefined }
 */
function soundStep(st, ev) {
  const s = st && SOUND_STATES.includes(st.state) ? st.state : 'off';
  const type = ev && ev.type;
  const live = s === 'on' || s === 'starting';
  if (type === 'ready') {
    if (!ev.ok) return { state: 'unavailable', action: live ? 'mute' : null, code: 'no_mline' };
    const v = soundStartOf(ev);
    return v === 'on' ? { state: 'starting', action: 'start', code: null } : { state: v, action: live ? 'stop' : null, code: null };
  }
  if (type === 'press') {
    if (s === 'unavailable') return { state: 'unavailable', action: null, code: 'no_mline' };
    if (live) return { state: 'off', action: 'stop', code: null, remember: false };
    return { state: 'starting', action: 'start', code: null, remember: true };
  }
  if (type === 'started') return s === 'starting' ? { state: 'on', action: null, code: null } : { state: s, action: null, code: st.code || null };
  if (type === 'failed') return live ? { state: 'refused', action: 'mute', code: (ev && ev.code) || 'start_failed' } : { state: s, action: null, code: st.code || null };
  if (type === 'blocked') return live ? { state: 'tap', action: 'stop', code: 'autoplay' } : { state: s, action: null, code: st.code || null };
  if (type === 'stream_end') return { state: 'unavailable', action: live ? 'mute' : null, code: 'no_stream' };
  if (type === 'close') return { state: 'off', action: live ? 'stop' : null, code: null };
  return { state: s, action: null, code: (st && st.code) || null };
}

// ── THE WORDS (English keys — the page translates; src/i18n-zh.js / -ja.js) ─────────────────────────────────────────────
/** The refusal words' key by the machine's code (the op's answer) or the page's own. */
function soundRefusalKey(code) {
  switch (code) {
    case 'no_mline': return 'This stream carries no sound — the agent on that machine is too old (reconnect it to upgrade)';
    case 'sound_unsupported': return 'This machine cannot send its sound (only a Windows or macOS machine can)';
    case 'helper_missing': return 'The sound helper did not build on that machine — see the Machines card';
    case 'no_ffmpeg': return 'That machine has no ffmpeg with an Opus encoder for its sound';
    case 'screen_permission': return 'The Mac needs “Screen & System Audio Recording” for vibespace-screen — the same switch as the picture';
    case 'helper_changed_regrant': return 'The Mac’s screen helper was updated — switch “Screen & System Audio Recording” on for it once more';
    case 'not_found': return 'That stream ended';
    case 'autoplay': return 'The browser kept the sound muted — press 「声音」 again';
    default: return 'The machine could not start its sound — press again';
  }
}
/** What the Machines card and the toggle's title say about consent, by the machine's platform. → [key, …] */
function soundConsentKeys(platform) {
  if (platform === 'darwin') return ['Sound uses the same “Screen & System Audio Recording” permission', 'After the screen helper updates, macOS asks you to switch it on once more'];
  if (platform === 'win32') return ['Sound: Windows asks for no permission'];
  return [];
}

module.exports = {
  SOUND_CAPABILITY, SOUND, SOUND_LIMITS, soundEncoderArgs, soundWavHeader, rtpOf, opusSamples, soundRtpStart, soundRtpStep,
  SOUND_KEY, soundRemembered, rememberSound, soundStartOf, SOUND_STATES, SOUND_EVENTS, soundStep, soundRefusalKey, soundConsentKeys,
};

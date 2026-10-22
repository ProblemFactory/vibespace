// lane speaker-passthrough-v1: THE FAKE OPUS ENCODER for the machine's sound (src/desktop-sound.js's ffmpeg — VIBESPACE_SOUND_FFMPEG,
// the daemon's seam, as VIBESPACE_MIC_HELPER is the helper's). A box with no ffmpeg (the Actions runner: measured — no ffmpeg on
// PATH) still drives the sound's road end to end: the fake takes the agent's encoder argv (`… -f rtp rtp://127.0.0.1:P?rtcpport=P`),
// reads the PCM the helper writes (its stdin — the streaming WAV), and from the first bytes sends THE TONE below as RTP to P, one
// packet every 20 ms (v2, PT 97, a rising sequence, 960 samples a packet, one SSRC), looped; it ends when its stdin does. Each run is
// recorded (encoder-<n>.json: its argv). It is no DECODER (the microphone's road): asked anything but `-f rtp` it exits 2.
//   TONE  scripts/fixtures/stream/tone-stereo-20ms.opus — an Ogg Opus file: 51 Opus packets (after OpusHead + OpusTags) of 1 s: 1 kHz on
//         the LEFT, 1.5 kHz on the RIGHT, −20 dBFS (lavfi's sine at 1/8, ×0.8; libopus 64k lowdelay 20 ms stereo, made once by this box's ffmpeg 8.0.1:
//         `ffmpeg -f lavfi -i sine=frequency=1000:sample_rate=48000:duration=1 -f lavfi -i sine=frequency=1500:sample_rate=48000:duration=1
//         -filter_complex "[0:a]volume=0.8[l];[1:a]volume=0.8[r];[l][r]amerge=inputs=2[a]" -map "[a]" -ac 2 -c:a libopus -b:a 64k
//         -frame_duration 20 -application lowdelay -map_metadata -1 -fflags +bitexact -flags:a +bitexact -f ogg`)
// Used by test-stream-sound-op and test-desktop-webrtc-chrome ⑳ when `hasOpusFfmpeg()` says no (or VS_SOUND_FAKE_FFMPEG=1 forces it).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const TONE = path.join(path.dirname(new URL(import.meta.url).pathname), 'tone-stereo-20ms.opus');
/** An Ogg file's packets, in order (the lacing joined; OpusHead + OpusTags dropped). */
export function oggOpusPackets(buf) {
  const out = []; let cur = [], i = 0;
  while (i + 27 <= buf.length && buf.toString('latin1', i, i + 4) === 'OggS') {
    const ns = buf[i + 26]; let p = i + 27 + ns;
    for (const l of buf.subarray(i + 27, i + 27 + ns)) { cur.push(buf.subarray(p, p + l)); p += l; if (l < 255) { out.push(Buffer.concat(cur)); cur = []; } }
    i = p;
  }
  return out.slice(2);
}
/** The tone's packets (Buffers, in order). */
export function tonePackets(file = TONE) { return oggOpusPackets(fs.readFileSync(file)); }
/** This box has an ffmpeg with libopus on PATH. */
export function hasOpusFfmpeg() {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 10000 });
  return !r.error && r.status === 0 && /\slibopus\s/.test(r.stdout || '');
}
const SCRIPT = (tone, dir) => `#!${process.execPath}
const fs = require('fs'), dgram = require('dgram'), path = require('path');
const a = process.argv.slice(2), url = a[a.length - 1] || '', m = /^rtp:\\/\\/127\\.0\\.0\\.1:(\\d+)/.exec(url);
if (!a.includes('rtp') || !m) { process.stderr.write('the fake encoder: only -f rtp\\n'); process.exit(2); }
const n = fs.readdirSync(${JSON.stringify(dir)}).filter((x) => /^encoder-\\d+\\.json$/.test(x)).length + 1;
fs.writeFileSync(path.join(${JSON.stringify(dir)}, 'encoder-' + n + '.json'), JSON.stringify({ n, argv: a, at: Date.now() }));
const b = fs.readFileSync(${JSON.stringify(tone)}), pk = []; { let cur = [], i = 0; while (i + 27 <= b.length && b.toString('latin1', i, i + 4) === 'OggS') { const ns = b[i + 26]; let p = i + 27 + ns; for (const l of b.subarray(i + 27, i + 27 + ns)) { cur.push(b.subarray(p, p + l)); p += l; if (l < 255) { pk.push(Buffer.concat(cur)); cur = []; } } i = p; } pk.splice(0, 2); } // the Ogg pages' packets, OpusHead + OpusTags dropped
const sock = dgram.createSocket('udp4'), port = Number(m[1]); let seq = 1, ts = 0, k = 0, timer = null;
const send = () => { const h = Buffer.alloc(12); h[0] = 0x80; h[1] = 97; h.writeUInt16BE(seq & 0xffff, 2); h.writeUInt32BE(ts >>> 0, 4); h.writeUInt32BE(0x5eed0001, 8); sock.send(Buffer.concat([h, pk[k % pk.length]]), port, '127.0.0.1'); seq++; ts += 960; k++; };
process.stdin.on('data', () => { if (!timer) { send(); timer = setInterval(send, 20); } });
process.stdin.on('end', () => { clearInterval(timer); try { sock.close(); } catch {} process.exit(0); });
`;
/** The fake in `dir` (created). → { exe, runs() } */
export function writeFakeEncoder(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, 'ffmpeg-fake-encoder.cjs');
  fs.writeFileSync(exe, SCRIPT(TONE, dir), { mode: 0o755 });
  const runs = () => fs.readdirSync(dir).filter((x) => /^encoder-\d+\.json$/.test(x)).map((x) => JSON.parse(fs.readFileSync(path.join(dir, x), 'utf8'))).sort((x, y) => x.n - y.n);
  return { exe, runs };
}

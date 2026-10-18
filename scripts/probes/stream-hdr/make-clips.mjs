#!/usr/bin/env node
// THE HDR PROBE'S CLIPS (lane stream-hdr-probe, design q-041 r3 §3 P4) — one synthetic 10-bit PQ picture, encoded three ways,
// for page.html's tiles (b) <video>, (c)/(d) WebCodecs, and the WebRTC leg.
//
// THE PICTURE (1280×720, 30 fps, 5 s, BT.2020 / SMPTE ST 2084, limited range, grey ⇒ Cb = Cr = 512): a 5-nit background,
// three 300 px squares at 100 / 203 (BT.2408 HDR reference white = what SDR white maps to) / 1000 nits, a 1000-nit marker
// sliding along a dark band (proof the clip plays), and a ramp 0 → 1000 nits (linear in PQ code) along the bottom. Written
// with geq as exact 10-bit luma codes: Y = 64 + 876·E, E = PQ inverse EOTF of nits/10000.
//
//   node scripts/probes/stream-hdr/make-clips.mjs --out <dir> [--ffmpeg <path>]
//     → <dir>/clip-hevc.mp4 (hvc1, Main10, HDR10 SEI)  clip-hevc.hevc (Annex-B, AUD per picture)
//       <dir>/clip-av1.mp4  clip-av1.ivf (SVT-AV1 10-bit, PQ in the sequence header)
//       <dir>/clip-vp9.webm clip-vp9.ivf (libvpx profile 2; VP9's bitstream has NO transfer field — the container / config says PQ)
//       <dir>/clip-av1-rt.ivf clip-vp9-rt.ivf clip-av1-rt8.ivf (low-delay twins + an 8-bit control for webrtc-leg.mjs)
//       <dir>/clip-h264-pq8.h264 (8-bit H.264 baseline, BT.2020 / PQ in the VUI — today's codec carrying PQ)
//       <dir>/clips.js (window.HDR_CLIPS = base64 of the six + the rt twins + the h264) and <dir>/hdr-probe.html (page.html with clips.js inlined —
//       ONE file the owner opens from disk) and <dir>/clips.json (what ffprobe reads back)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', '');
const FFMPEG = arg('--ffmpeg', 'ffmpeg');
const FFPROBE = arg('--ffprobe', FFMPEG.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1'));
if (!OUT) { console.error('usage: make-clips.mjs --out <dir>'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const HERE = path.dirname(fileURLToPath(import.meta.url));

// SMPTE ST 2084 (PQ) inverse EOTF: absolute nits → signal E in [0, 1].
const M1 = 2610 / 16384, M2 = (2523 / 4096) * 128, C1 = 3424 / 4096, C2 = (2413 / 4096) * 32, C3 = (2392 / 4096) * 32;
const pqOf = (nits) => { const y = Math.pow(Math.max(0, nits) / 10000, M1); return Math.pow((C1 + C2 * y) / (1 + C3 * y), M2); };
const lumaOf = (nits) => Math.round(64 + 876 * pqOf(nits));
const W = 1280, H = 720, FPS = 30, SECONDS = 5;
const L = { bg: lumaOf(5), p100: lumaOf(100), p203: lumaOf(203), p1000: lumaOf(1000) };
const E1000 = pqOf(1000);
// geq: the squares (y 80..380), the marker band (y 420..470, a 50 px square moving 240 px/s), the ramp (y 520..680).
const sq = (x0) => `between(X,${x0},${x0 + 299})*between(Y,80,379)`;
const lum = [
  `if(${sq(70)},${L.p100},`,
  `if(${sq(490)},${L.p203},`,
  `if(${sq(910)},${L.p1000},`,
  `if(between(Y,420,469)*between(X,mod(T*240,${W - 50}),mod(T*240,${W - 50})+49),${L.p1000},`,
  `if(between(Y,520,679),64+876*${E1000.toFixed(6)}*X/${W - 1},`,
  `${L.bg})))))`,
].join('');
const SRC = ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}:d=${SECONDS},format=yuv420p10le,geq=lum='${lum}':cb=512:cr=512,setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc:range=tv`];
const TAGS = ['-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc', '-color_range', 'tv'];
const MD = 'G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1)';
const X265 = `colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:range=limited:master-display=${MD}:max-cll=1000,400:hdr10=1:hdr10-opt=1:repeat-headers=1:aud=1:keyint=${FPS * SECONDS}:min-keyint=${FPS * SECONDS}:scenecut=0:bframes=0:log-level=error`;
const SVT = `enable-hdr=1:color-primaries=9:transfer-characteristics=16:matrix-coefficients=9:color-range=0:mastering-display=G(0.17,0.797)B(0.131,0.046)R(0.708,0.292)WP(0.3127,0.329)L(1000,0.0001):content-light=1000,400:keyint=${FPS * SECONDS}:scd=0`;

function ff(args, name) {
  const t0 = Date.now();
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(`✗ ${name}: ffmpeg ${r.status}\n${r.stderr}`); process.exit(1); }
  console.log(`  ${name}  ${fs.statSync(path.join(OUT, name)).size} B  ${Date.now() - t0} ms`);
}
const hevc = ['-c:v', 'libx265', '-pix_fmt', 'yuv420p10le', '-profile:v', 'main10', '-crf', '16', ...TAGS, '-x265-params', X265];
const av1 = ['-c:v', 'libsvtav1', '-pix_fmt', 'yuv420p10le', '-preset', '8', '-crf', '24', '-g', String(FPS * SECONDS), ...TAGS, '-svtav1-params', SVT];
const vp9 = ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p10le', '-profile:v', '2', '-crf', '20', '-b:v', '0', '-g', String(FPS * SECONDS), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', ...TAGS];
console.log(`luma codes: bg5=${L.bg} 100=${L.p100} 203=${L.p203} 1000=${L.p1000} (E1000=${E1000.toFixed(4)})`);
ff([...SRC, ...hevc, '-tag:v', 'hvc1', '-movflags', '+faststart', path.join(OUT, 'clip-hevc.mp4')], 'clip-hevc.mp4');
ff([...SRC, ...hevc, '-f', 'hevc', path.join(OUT, 'clip-hevc.hevc')], 'clip-hevc.hevc');
ff([...SRC, ...av1, '-movflags', '+faststart', path.join(OUT, 'clip-av1.mp4')], 'clip-av1.mp4');
ff(['-i', path.join(OUT, 'clip-av1.mp4'), '-c', 'copy', '-f', 'ivf', path.join(OUT, 'clip-av1.ivf')], 'clip-av1.ivf');
ff([...SRC, ...vp9, path.join(OUT, 'clip-vp9.webm')], 'clip-vp9.webm');
ff(['-i', path.join(OUT, 'clip-vp9.webm'), '-c', 'copy', '-f', 'ivf', path.join(OUT, 'clip-vp9.ivf')], 'clip-vp9.ivf');
// The WebRTC leg's (webrtc-leg.mjs) low-delay twins: no hidden / alt-ref frames, one shown picture per IVF frame.
ff([...SRC, ...av1.map((a) => (a === SVT ? `${SVT}:pred-struct=1` : a)), '-f', 'ivf', path.join(OUT, 'clip-av1-rt.ivf')], 'clip-av1-rt.ivf');
// 8-bit PQ in today's codec (H.264 constrained baseline, the SDP's 42e01f) — only the VUI says BT.2020 / PQ: does the
// browser's WebRTC <video> honour it? (the cheapest HDR there is: no transport change, a banding cost)
ff([...SRC, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-crf', '18', ...TAGS, '-x264-params', `colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:keyint=${FPS * SECONDS}:scenecut=0:bframes=0:aud=1`, '-f', 'h264', path.join(OUT, 'clip-h264-pq8.h264')], 'clip-h264-pq8.h264');
// …and the 8-bit control (same picture, codes ÷ 4): proves a refusal below is the bit depth, not the packetizer.
ff([...SRC, ...av1.map((a) => (a === SVT ? `${SVT}:pred-struct=1` : a === 'yuv420p10le' ? 'yuv420p' : a)), '-f', 'ivf', path.join(OUT, 'clip-av1-rt8.ivf')], 'clip-av1-rt8.ivf');
ff([...SRC, ...vp9.map((a) => (a === 'good' ? 'realtime' : a === '4' ? '8' : a)), '-lag-in-frames', '0', '-auto-alt-ref', '0', '-f', 'ivf', path.join(OUT, 'clip-vp9-rt.ivf')], 'clip-vp9-rt.ivf');

// What a decoder will be told: ffprobe's reading of each file (profile, bit depth, colour tags, HDR side data).
const facts = {};
for (const f of ['clip-hevc.mp4', 'clip-hevc.hevc', 'clip-av1.mp4', 'clip-av1.ivf', 'clip-vp9.webm', 'clip-vp9.ivf']) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=codec_name,profile,pix_fmt,width,height,color_range,color_space,color_transfer,color_primaries:stream_side_data',
    '-show_frames', '-read_intervals', '%+#1', '-of', 'json', path.join(OUT, f)], { encoding: 'utf8' });
  try { const j = JSON.parse(r.stdout); facts[f] = { ...(j.streams || [])[0], frameSideData: ((j.frames || [])[0] || {}).side_data_list || [] }; } catch { facts[f] = { error: r.stderr.trim() }; }
}
facts.luma = L; facts.picture = { w: W, h: H, fps: FPS, seconds: SECONDS };
fs.writeFileSync(path.join(OUT, 'clips.json'), JSON.stringify(facts, null, 2) + '\n');
for (const [f, s] of Object.entries(facts)) if (s && s.codec_name) console.log(`  ${f}: ${s.codec_name} ${s.profile} ${s.pix_fmt} ${s.color_primaries}/${s.color_transfer}/${s.color_space} side=${(s.frameSideData || []).map((d) => d.side_data_type).join('+') || '-'}`);

// The bundle: page.html with the clips inlined (base64) — opens from disk (file://), no server, no fetch.
const clips = {};
for (const f of ['clip-hevc.mp4', 'clip-hevc.hevc', 'clip-av1.mp4', 'clip-av1.ivf', 'clip-vp9.webm', 'clip-vp9.ivf', 'clip-av1-rt.ivf', 'clip-vp9-rt.ivf', 'clip-h264-pq8.h264']) clips[f] = fs.readFileSync(path.join(OUT, f)).toString('base64');
const js = `window.HDR_CLIPS = ${JSON.stringify(clips)};\n`;
fs.writeFileSync(path.join(OUT, 'clips.js'), js);
const page = fs.readFileSync(path.join(HERE, 'page.html'), 'utf8');
if (!page.includes('<!--HDR_CLIPS-->')) { console.error('✗ page.html has no <!--HDR_CLIPS--> marker'); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'hdr-probe.html'), page.replace('<!--HDR_CLIPS-->', `<script>${js}</script>`));
console.log(`  hdr-probe.html  ${fs.statSync(path.join(OUT, 'hdr-probe.html')).size} B (page + clips inlined)`);

#!/usr/bin/env node
// THE HDR PROBE'S TABLES (lane stream-hdr-probe): facts files → one markdown table per API, one column per browser.
// A facts file is facts-hub.mjs's output (an array of runs: every run with facts is a column, named `<label>:<run>`) or the
// page's Save facts file ({ answers, tiles, facts } — the owner's browser on an HDR screen; its answers + tile lines follow).
//
//   node scripts/probes/stream-hdr/summarize.mjs <label>=<facts.json> [<label>=<facts.json> …] > tables.md
import fs from 'node:fs';

const cols = [];
const owner = [];
for (const a of process.argv.slice(2)) {
  const i = a.indexOf('='); if (i < 1) { console.error(`not label=path: ${a}`); process.exit(2); }
  const label = a.slice(0, i), j = JSON.parse(fs.readFileSync(a.slice(i + 1), 'utf8'));
  if (Array.isArray(j)) { for (const r of j) if (r.facts) cols.push({ name: j.length > 1 ? `${label}:${r.name}` : label, f: r.facts, tiles: r.tiles || null }); }
  else if (j.facts) { cols.push({ name: label, f: j.facts }); owner.push({ label, ...j }); }
}
if (!cols.length) { console.error('no facts'); process.exit(2); }
const browser = (f) => { const ua = f.ua || '', m = /Edg\/(\d+)/.exec(ua) || /Chrome\/(\d+)/.exec(ua) || /Version\/([\d.]+).*Safari/.exec(ua); return `${/Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '?'} ${m ? m[1] : ''}`; }; // Edge's UA says Chrome/ too
const out = [];
const table = (title, rows, note) => {
  out.push(`### ${title}`, '', `| | ${cols.map((c) => `${c.name} (${browser(c.f)})`).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
  for (const [label, fn] of rows) out.push(`| ${label} | ${cols.map((c) => { try { const v = fn(c.f); return v == null ? '' : String(v); } catch { return '?'; } }).join(' | ')} |`);
  if (note) out.push('', note);
  out.push('');
};
const yn = (v) => (v === true ? 'yes' : v === false ? 'no' : v == null ? '—' : v);

table('matchMedia / screen', [
  ['(dynamic-range: high)', (f) => yn(f.media['(dynamic-range: high)'])], ['(video-dynamic-range: high)', (f) => yn(f.media['(video-dynamic-range: high)'])],
  ['(color-gamut: rec2020)', (f) => yn(f.media['(color-gamut: rec2020)'])], ['screen.colorDepth', (f) => f.screen.colorDepth],
]);
const vdRows = [];
for (const [codec, t] of [['hev1.2.4.L153.B0', 'pq'], ['hvc1.2.4.L153.B0', 'pq'], ['av01.0.08M.10', 'pq'], ['vp09.02.10.10', 'pq'], ['hev1.2.4.L153.B0', 'hlg'], ['av01.0.08M.10', 'hlg'], ['vp09.02.10.10', 'hlg'], ['avc1.42e01f', 'sdr']]) {
  vdRows.push([`${codec} ${t}`, (f) => { if (!Array.isArray(f.videoDecoder)) return f.videoDecoder; const ok = f.videoDecoder.filter((v) => v.codec === codec && v.transfer === t && v.supported).map((v) => v.hw.replace('prefer-', '').replace('no-preference', 'any')); return ok.length ? ok.join('+') : 'no'; }]);
}
table('VideoDecoder.isConfigSupported (3840×2160; which hardwareAcceleration values answer yes)', vdRows);
table('MediaSource.isTypeSupported (canPlayType)', (cols[0].f.mediaSource || []).map((m, i) => [m.type.replace('video/', '').replace(/"/g, ''), (f) => `${yn(f.mediaSource[i].mse)} (${f.mediaSource[i].canPlay || '—'})`]));
table('mediaCapabilities.decodingInfo, rec2020 4K60 20 Mb/s (supported / smooth / powerEfficient)', (cols[0].f.mediaCapabilities || []).filter((m) => m.transfer === 'pq').map((m) => [`${m.type} ${m.contentType.replace('video/', '').replace(/"/g, '')} pq`, (f) => { const x = f.mediaCapabilities.find((y) => y.type === m.type && y.contentType === m.contentType && y.transfer === 'pq'); return x.error ? x.error : `${yn(x.supported)} / ${yn(x.smooth)} / ${yn(x.powerEfficient)}`; }]));
const has = (f, side, re) => (f.webrtc[side] && Array.isArray(f.webrtc[side].codecs) ? f.webrtc[side].codecs.filter((c) => re.test(c)).map((c) => (c.match(/profile(?:-id)?=\d|profile-level-id=\w+/) || ['yes'])[0]).join(', ') || 'no' : '?');
table('WebRTC (RTCRtpReceiver / RTCRtpSender.getCapabilities)', [
  ['receive AV1', (f) => has(f, 'RTCRtpReceiver', /^video\/AV1/i)], ['receive VP9', (f) => has(f, 'RTCRtpReceiver', /^video\/VP9/i)], ['receive H.265', (f) => has(f, 'RTCRtpReceiver', /^video\/H265/i)],
  ['receive H.264', (f) => has(f, 'RTCRtpReceiver', /^video\/H264.*packetization-mode=1/i)], ['send AV1 / VP9 / H.265', (f) => `${has(f, 'RTCRtpSender', /^video\/AV1/i)} / ${has(f, 'RTCRtpSender', /^video\/VP9/i)} / ${has(f, 'RTCRtpSender', /^video\/H265/i)}`],
  ['color-space header extension', (f) => yn((f.webrtc.RTCRtpReceiver.headerExtensions || []).some((u) => /color-space/.test(u)))],
  ['RTCRtpScriptTransform (encoded frames)', (f) => yn(f.webrtc.encodedTransform)],
]);
table('2D canvas: asked → accepted?; a PQ VideoFrame drawn, read back at 1000 / 203 nits (green)', (cols[0].f.canvas.tries || []).map((t, i) => [t.asked.replace(/"/g, ''), (f) => { const x = f.canvas.tries[i]; if (x.error) return /not a valid enum/.test(x.error) ? 'REFUSED (enum)' : x.error.slice(0, 40); return `${JSON.parse(x.got).colorSpace}/${JSON.parse(x.got).colorType}: ${x.pq1000 && x.pq1000.px ? x.pq1000.px[1] : '?'} / ${x.pq203 && x.pq203.px ? x.pq203.px[1] : '?'}`; }]));
table('WebGPU', [
  ['adapter', (f) => (f.webgpu.adapter && typeof f.webgpu.adapter === 'object' ? `${f.webgpu.adapter.vendor} ${f.webgpu.adapter.architecture}` : yn(f.webgpu.adapter))],
  ['rgba16float + toneMapping extended (srgb)', (f) => { const x = f.webgpu['rgba16float+srgb']; return x ? (typeof x === 'object' ? `echoed ${x.toneMapping}` : x) : '—'; }],
]);
const dec = (kind, hw) => (f) => { const x = (f.decode || []).find((d) => d.kind === kind && d.hw === hw); if (!x) return '—'; if (x.supported === false) return 'no'; if (x.error) return x.error.slice(0, 40); return `${x.format || 'opaque'} ${x.cs ? x.cs.transfer : '?'}${x.yCodes ? ` codes ${x.yCodes.p1000}/${x.yCodes.p203}` : ''}`; };
table('WebCodecs decode of the clips: first frame format + transfer (+ the 10-bit codes at 1000 / 203 nits; expect 723 / 573)', [
  ['AV1 10-bit (any)', dec('av1', 'no-preference')], ['AV1 10-bit (software)', dec('av1', 'prefer-software')], ['VP9.2 (any)', dec('vp9', 'no-preference')], ['VP9.2 (software)', dec('vp9', 'prefer-software')], ['HEVC Main10 (any)', dec('hevc', 'no-preference')],
]);
table('<video> of the files → VideoFrame (format, transfer)', ['hevc', 'av1', 'vp9'].map((k) => [k, (f) => { const x = (f.video || []).find((v) => v.kind === k); if (!x) return '—'; if (!x.canPlay) return 'cannot play'; if (x.error) return x.error; return `${x.format || 'opaque'} ${x.cs ? x.cs.transfer : '?'}`; }]));
const tiled = cols.filter((c) => c.tiles);
if (tiled.length) {
  out.push('### Tile status lines (the page with its tiles, headless)', '');
  for (const c of tiled) { out.push(`**${c.name} (${browser(c.f)})**`, ''); for (const [step, st] of Object.entries(c.tiles)) for (const [k, v] of Object.entries(st || {})) if (v) out.push(`- ${step} ${k}: ${v}`); out.push(''); }
}
for (const o of owner) {
  out.push(`### The owner's eye — ${o.label} (${browser(o.facts)})`, '', `SDR white ${o.sdrWhiteNits} nits · (b) ${o.videoFile} · (c)/(d) ${o.decodeCodec} · (e) ${o.rtcCodec || '—'}`, '');
  for (const [t, a] of Object.entries(o.answers || {})) out.push(`- ${({ tB: '(b) <video> file', tC: '(c) 2D canvas', tD: '(d) WebGPU', tE: '(e) WebRTC <video>' })[t] || t}: **${a || 'no answer'}** — ${(o.tiles || {})[`s${t.slice(1)}`] || ''}`);
  out.push('');
}
process.stdout.write(out.join('\n') + '\n');

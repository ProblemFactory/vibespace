'use strict';
/**
 * THE SCREEN SOURCE'S PLAN — PURE (imports nothing; design q-041 r2 §2 采集/映射+编码 + §3 P1, lane stream-p1b-screen; the P0
 * calibration /var/tmp/vibespace-lanes/desktop-design/q034-probe/report.md §2). The daemon's screen source
 * (src/agentd/stream-screen.js) runs what THIS file decides, so the mapping the suites prove is the mapping that runs:
 *
 *   THE COLOUR MAPPING   DDA's FP16 frame is linear sRGB × (SDR white / 80 nits) — scRGB (measured: the owner's 200-nit white
 *                        reads 2.5). Exact SDR = ÷ (white / 80) → the sRGB OETF; a value above SDR white goes through
 *                        toneCurve. One FP16 channel is 16 bits, so the whole mapping is a 65 536-entry table per white
 *                        level (buildLut) — the frame loop (nv12FromHalf) is three lookups per pixel, never float maths, and
 *                        the table IS mapLinear, so the gate over mapLinear is the gate over the frames.
 *   toneCurve            8-bit SDR has no code above SDR white, so an exact SDR desktop and highlight detail exclude each
 *                        other: knee 1 (the default) = exact SDR, a highlight above white clips to white; knee < 1 = a
 *                        Reinhard-extended shoulder from the knee to `peak` (C1 at the knee) — highlights keep detail, the
 *                        SDR values above the knee give up their exactness. Parametric, never automatic.
 *   CALIBRATION          17 patch centres of the owner's real FP16 capture (cal2-half.raw, white 2500 = 200 nits): the
 *                        11 greys + R G B C M Y, their measured half-float bits → the sRGB the window drew. Exact.
 *   ENCODER_LADDER       h264_nvenc → h264_amf → h264_qsv → libx264, chosen from the installed ffmpeg's `-encoders`;
 *                        constrained baseline, no B-frames, CBR, a GOP of two seconds (pickEncoder)
 *   parseFfmpegFacts     `ffmpeg -version` / `-filters` / `-encoders` → { version, major, ddagrab, encoders } and
 *                        ffmpegVerdict (≥ 7 with ddagrab, else `no_ffmpeg` naming where it was looked for — ffmpegCandidates)
 *   STREAM_FACTS_PS      the machine's screen facts script (DisplayConfig: each display's HDR state + SDR white level; DXGI:
 *                        which adapter/output ddagrab must open; Screen: bounds) → parseStreamFacts
 *   planScreen           facts + the asked display → { mode: 'direct' (an SDR display: DDA's 8-bit picture is the screen
 *                        already) | 'mapped' (an HDR display: FP16 → the agent's mapping → NV12 → the encoder), the two
 *                        argvs, origin, encoder } or a refusal by name (no_ffmpeg, display_gone, display_other_gpu,
 *                        no_white_level, no_encoder)
 *   kbpsDecision         the bandwidth estimate → an encoder restart, with hysteresis (ffmpeg's CLI cannot change a
 *                        bitrate live): at most once per 5 s, only on a ≥ 25 % move
 *   flvReader            the encoder's output: FLV (length-framed — an Annex-B pipe only shows a picture's end when the NEXT
 *                        one starts, a frame of latency) → access units { nalus, key, tsMs }, SPS/PPS put in front of every
 *                        key frame (a browser that joins at a key frame needs them; FLV carries them once)
 *   THE MAC (lane stream-p3m-build) planScreen's darwin branch = planMacScreen: ONE helper (tools/vibespace-screen —
 *                        ScreenCaptureKit + VideoToolbox + CGEvent) at a FIXED path (macHelperPaths), spawned DISCLAIMED
 *                        (macHelperSpawn), built on the Mac (macBuildPlan) or pushed prebuilt; its facts (parseMacFacts);
 *                        the whole display or ONE window (windowSourceOf — the `source: 'window'` shape) on the size ladder
 *                        (MAC_LADDER: 1440p60 / 4K30 — measured); no mapping road (SCK hands sRGB exact); the input's
 *                        target from where the picture sits (macInputTarget → macPoint, global points)
 */

// ── THE COLOUR MAPPING ───────────────────────────────────────────────────────────────────────────────────────────────
/** IEEE half bits → number (Infinity for ±inf, NaN for NaN; sign kept). */
function halfToFloat(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0x1f) return m ? NaN : s * Infinity;
  return s * (e ? (1 + m / 1024) * 2 ** (e - 15) : m * 2 ** -24);
}
/** The sRGB OETF (IEC 61966-2-1): linear [0, 1] → encoded [0, 1]. */
const srgbOetf = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const TONE_DEFAULT = Object.freeze({ knee: 1, peak: 4 });
/** Linear relative to SDR white (1 = white) → [0, 1]. Below the knee: unchanged. Above: knee 1 ⇒ 1 (clip); knee < 1 ⇒
 *  knee + (1 − knee)·r(t), t = (x − knee)/(1 − knee), r(t) = t(1 + t/T²)/(1 + t), T = (peak − knee)/(1 − knee): r(0) = 0,
 *  r'(0) = 1 (no kink at the knee), r(T) = 1 (`peak` × SDR white lands on white). Negative / NaN (out-of-gamut scRGB) ⇒ 0. */
function toneCurve(x, { knee = TONE_DEFAULT.knee, peak = TONE_DEFAULT.peak } = {}) {
  if (!(x > 0)) return 0;
  if (x <= knee) return x;
  if (knee >= 1) return 1;
  const t = (x - knee) / (1 - knee), T = Math.max(1e-6, (Math.max(peak, 1) - knee) / (1 - knee));
  return Math.min(1, knee + (1 - knee) * (t * (1 + t / (T * T))) / (1 + t));
}
/** scRGB linear (1 = 80 nits) → encoded sRGB [0, 1]. `white` = DisplayConfig's SDRWhiteLevel (1000 = 80 nits; the owner's
 *  slider at 200 nits reads 2500). */
function mapLinear(v, { white = 1000, knee = TONE_DEFAULT.knee, peak = TONE_DEFAULT.peak } = {}) {
  return srgbOetf(toneCurve(v / (white / 1000), { knee, peak }));
}
/** One FP16 channel (its bits) → the 8-bit sRGB code. */
const srgb8OfHalf = (h, o) => Math.round(255 * mapLinear(halfToFloat(h), o));
/** THE TABLE: every FP16 bit pattern → its 8-bit sRGB code, for one white level and curve. */
function buildLut(o = {}) {
  const lut = new Uint8Array(65536);
  for (let h = 0; h < 65536; h++) lut[h] = srgb8OfHalf(h, o);
  return lut;
}

// ── RGB → NV12 (BT.709, limited range — what the encoder's VUI then says) ───────────────────────────────────────────
const KR = 0.2126, KB = 0.0722, KG = 1 - KR - KB;
const FIX = (v) => Math.round(v * 65536);
const YC = Object.freeze([FIX((219 / 255) * KR), FIX((219 / 255) * KG), FIX((219 / 255) * KB)]);
const UC = Object.freeze([FIX((-224 / 255) * KR / (2 * (1 - KB))), FIX((-224 / 255) * KG / (2 * (1 - KB))), FIX((224 / 255) * 0.5)]);
const VC = Object.freeze([FIX((224 / 255) * 0.5), FIX((-224 / 255) * KG / (2 * (1 - KR))), FIX((-224 / 255) * KB / (2 * (1 - KR)))]);
const Y_ADD = (16 << 16) + 32768, C_ADD = (128 << 18) + (1 << 17); // chroma sums 2×2 pixels: four times the weight ⇒ >> 18
/** THE FRAME LOOP: rgbaf16le (a Uint16Array of its bits, `w` pixels a row) → NV12 of the even part (`out` = ⌊w⌋₂·⌊h⌋₂·3/2
 *  bytes), the mapping as three table lookups per pixel, chroma from each 2×2 block's mean. → the bytes written */
function nv12FromHalf(src, w, h, lut, out) {
  const W = w & ~1, H = h & ~1, uv = W * H, [yr, yg, yb] = YC, [ur, ug, ub] = UC, [vr, vg, vb] = VC;
  for (let y = 0; y < H; y += 2) {
    let i0 = y * w * 4, i1 = i0 + w * 4, o0 = y * W, o1 = o0 + W, c = uv + (y >> 1) * W;
    for (let x = 0; x < W; x += 2) {
      const r0 = lut[src[i0]], g0 = lut[src[i0 + 1]], b0 = lut[src[i0 + 2]], r1 = lut[src[i0 + 4]], g1 = lut[src[i0 + 5]], b1 = lut[src[i0 + 6]];
      const r2 = lut[src[i1]], g2 = lut[src[i1 + 1]], b2 = lut[src[i1 + 2]], r3 = lut[src[i1 + 4]], g3 = lut[src[i1 + 5]], b3 = lut[src[i1 + 6]];
      out[o0] = (yr * r0 + yg * g0 + yb * b0 + Y_ADD) >> 16; out[o0 + 1] = (yr * r1 + yg * g1 + yb * b1 + Y_ADD) >> 16;
      out[o1] = (yr * r2 + yg * g2 + yb * b2 + Y_ADD) >> 16; out[o1 + 1] = (yr * r3 + yg * g3 + yb * b3 + Y_ADD) >> 16;
      const R = r0 + r1 + r2 + r3, G = g0 + g1 + g2 + g3, B = b0 + b1 + b2 + b3;
      out[c] = (ur * R + ug * G + ub * B + C_ADD) >> 18; out[c + 1] = (vr * R + vg * G + vb * B + C_ADD) >> 18;
      i0 += 8; i1 += 8; o0 += 2; o1 += 2; c += 2;
    }
  }
  return uv + uv / 2;
}
const nv12Bytes = (w, h) => (w & ~1) * (h & ~1) * 3 / 2;

/** The owner's real capture (2026-10-16, HDR on, SDR white 2500 = 200 nits): [label, the sRGB drawn, the FP16 bits read]. */
const CALIBRATION = Object.freeze({
  white: 2500,
  rows: Object.freeze([
    ['grey0', [0, 0, 0], [0, 0, 0]], ['grey10', [26, 26, 26], [9884, 9884, 9884]], ['grey20', [51, 51, 51], [11595, 11595, 11595]],
    ['grey30', [77, 77, 77], [12783, 12783, 12783]], ['grey40', [102, 102, 102], [13648, 13648, 13648]], ['grey50', [128, 128, 128], [14417, 14417, 14417]],
    ['grey60', [153, 153, 153], [14942, 14942, 14942]], ['grey70', [179, 179, 179], [15490, 15490, 15490]], ['grey80', [204, 204, 204], [15881, 15881, 15881]],
    ['grey90', [230, 230, 230], [16361, 16361, 16361]], ['grey100', [255, 255, 255], [16640, 16640, 16640]],
    ['R', [255, 0, 0], [16640, 0, 0]], ['G', [0, 255, 0], [0, 16640, 0]], ['B', [0, 0, 255], [0, 0, 16640]],
    ['C', [0, 255, 255], [0, 16640, 16640]], ['M', [255, 0, 255], [16640, 0, 16640]], ['Y', [255, 255, 0], [16640, 16640, 0]],
  ].map((r) => Object.freeze(r))),
});

// ── THE ENCODER LADDER ───────────────────────────────────────────────────────────────────────────────────────────────
/** In order of preference. `args` = the encoder's low-latency switches (the common ones — rate, GOP, profile — are added
 *  by encodeTail). Constrained baseline everywhere: the SDP offers 42e01f (src/stream-model.js STREAM_CODEC). */
const ENCODER_LADDER = Object.freeze([
  Object.freeze({ id: 'h264_nvenc', label: 'NVENC', hw: true, profile: 'baseline', args: Object.freeze(['-preset', 'p1', '-tune', 'ull', '-rc', 'cbr', '-zerolatency', '1', '-delay', '0', '-rc-lookahead', '0']) }),
  Object.freeze({ id: 'h264_amf', label: 'AMF', hw: true, profile: 'constrained_baseline', args: Object.freeze(['-usage', 'ultralowlatency', '-quality', 'speed', '-rc', 'cbr']) }),
  Object.freeze({ id: 'h264_qsv', label: 'Quick Sync', hw: true, profile: 'baseline', args: Object.freeze(['-preset', 'veryfast', '-look_ahead', '0', '-low_delay_brc', '1']) }),
  Object.freeze({ id: 'libx264', label: 'x264', hw: false, profile: 'baseline', args: Object.freeze(['-preset', 'ultrafast', '-tune', 'zerolatency']) }),
]);
/** The first ladder rung the installed ffmpeg has. → { ok, encoder, note: 'no_hw_encoder' | null } | { ok: false, code } */
function pickEncoder(encoders, ladder = ENCODER_LADDER) {
  const have = new Set(Array.isArray(encoders) ? encoders : []);
  const e = ladder.find((r) => have.has(r.id));
  if (!e) return { ok: false, code: 'no_encoder', error: 'the machine\'s ffmpeg has no H.264 encoder (NVENC, AMF, Quick Sync or x264)' };
  return { ok: true, encoder: e, note: e.hw ? null : 'no_hw_encoder' };
}

// ── FFMPEG ON THE MACHINE ────────────────────────────────────────────────────────────────────────────────────────────
const FFMPEG_MIN_MAJOR = 7;
/** Where the agent looks, in order: PATH, then %LOCALAPPDATA%\vibespace\ffmpeg\bin, then the P0 probe's folder (`delim` /
 *  `sep` = the running system's, from the caller's path module). */
function ffmpegCandidates({ platform = 'win32', env = {}, delim = platform === 'win32' ? ';' : ':', sep = platform === 'win32' ? '\\' : '/' } = {}) {
  const win = platform === 'win32', exe = win ? 'ffmpeg.exe' : 'ffmpeg';
  const out = [];
  for (const d of String(env.PATH || env.Path || '').split(delim)) if (d.trim()) out.push({ where: 'PATH', path: d.trim().replace(/[\\/]+$/, '') + sep + exe });
  if (win && env.LOCALAPPDATA) out.push({ where: '%LOCALAPPDATA%\\vibespace\\ffmpeg\\bin', path: [env.LOCALAPPDATA, 'vibespace', 'ffmpeg', 'bin', exe].join(sep) });
  if (win && env.USERPROFILE) out.push({ where: 'the probe folder', path: [env.USERPROFILE, 'vs-probe', 'ffmpeg', 'ffmpeg-master-latest-win64-gpl', 'bin', exe].join(sep) });
  return out;
}
const LOOKED = 'PATH, %LOCALAPPDATA%\\vibespace\\ffmpeg\\bin, %USERPROFILE%\\vs-probe\\ffmpeg';
/** `ffmpeg -version`, `-hide_banner -filters`, `-hide_banner -encoders` → the facts. A master build's version is
 *  `N-…` (no number): libavfilter ≥ 10 = FFmpeg ≥ 7. */
function parseFfmpegFacts(versionText, filtersText, encodersText) {
  const v = String(versionText || ''), first = (v.split(/\r?\n/)[0] || '').trim();
  const num = /^ffmpeg version n?(\d+)\.(\d+)/i.exec(first);
  const lavfi = /libavfilter\s+(\d+)\./.exec(v);
  const major = num ? Number(num[1]) : lavfi ? (Number(lavfi[1]) >= 11 ? 8 : Number(lavfi[1]) >= 10 ? 7 : Number(lavfi[1]) >= 9 ? 6 : 5) : null;
  const ddagrab = /^\s*\S+\s+ddagrab\s/m.test(String(filtersText || ''));
  const encoders = [];
  for (const line of String(encodersText || '').split(/\r?\n/)) { const m = /^\s*V[.A-Z]{5}\s+(\S+)/.exec(line); if (m) encoders.push(m[1]); }
  return { version: first.replace(/^ffmpeg version\s*/i, '').split(' ')[0] || null, major, ddagrab, encoders: encoders.filter((e) => ENCODER_LADDER.some((r) => r.id === e)) };
}
/** May this ffmpeg capture? → { ok } | { ok: false, code: 'no_ffmpeg', error } */
function ffmpegVerdict(ff) {
  const need = `this machine needs ffmpeg ${FFMPEG_MIN_MAJOR} or newer with ddagrab and NVENC (looked in ${LOOKED})`;
  if (!ff || !ff.path) return { ok: false, code: 'no_ffmpeg', error: need };
  if (!(ff.major >= FFMPEG_MIN_MAJOR)) return { ok: false, code: 'no_ffmpeg', error: `${need}; ${ff.path} is ${ff.version || 'an unknown version'}` };
  if (!ff.ddagrab) return { ok: false, code: 'no_ffmpeg', error: `${need}; ${ff.path} has no ddagrab` };
  return { ok: true };
}

// ── THE MACHINE'S SCREEN FACTS (Windows PowerShell 5.1) ──────────────────────────────────────────────────────────────
// DisplayConfig per active path (raw DISPLAYCONFIG_PATH_INFO offsets, 72 bytes: source LUID @0 id @8, target LUID @20 id @28):
// type 1 = the source's GDI name (\\.\DISPLAYn = Screen.DeviceName), type 9 = advanced colour (bit 1 enabled, bit 2 the SDR
// wide-colour mode, not HDR), type 11 = SDRWhiteLevel (1000 = 80 nits). DXGI (CreateDXGIFactory1 → EnumAdapters1 →
// EnumOutputs → GetDesc): which adapter + output index ddagrab must open for that GDI name — vtable slots only, the methods
// before the one called are placeholders. Any failure = that part empty (a display with no white level is refused by name
// when it is HDR; no DXGI map = only the primary, which DXGI enumerates first on adapter 0).
const STREAM_FACTS_PS = ["$ErrorActionPreference = 'Stop'",
  "Add-Type -TypeDefinition @'",
  'using System; using System.Text; using System.Runtime.InteropServices;',
  'public static class VsStreamDc {',
  '  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();',
  '  [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint f, out uint np, out uint nm);',
  '  [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint f, ref uint np, IntPtr p, ref uint nm, IntPtr m, IntPtr t);',
  '  [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(IntPtr q);',
  '  static void Head(IntPtr b, int type, int size, IntPtr p, int at) { Marshal.WriteInt32(b, 0, type); Marshal.WriteInt32(b, 4, size); Marshal.WriteInt64(b, 8, Marshal.ReadInt64(p, at)); Marshal.WriteInt32(b, 16, Marshal.ReadInt32(p, at + 8)); }',
  '  public static string Read() {',
  '    uint np, nm; var sb = new StringBuilder();',
  '    if (GetDisplayConfigBufferSizes(2, out np, out nm) != 0) return "";',
  '    IntPtr P = Marshal.AllocHGlobal((int)np * 72), M = Marshal.AllocHGlobal((int)nm * 64), B = Marshal.AllocHGlobal(96);',
  '    try {',
  '      if (QueryDisplayConfig(2, ref np, P, ref nm, M, IntPtr.Zero) != 0) return "";',
  '      for (int i = 0; i < (int)np; i++) {',
  '        IntPtr p = new IntPtr(P.ToInt64() + i * 72);',
  '        Head(B, 1, 84, p, 0); if (DisplayConfigGetDeviceInfo(B) != 0) continue;',
  '        string name = Marshal.PtrToStringUni(new IntPtr(B.ToInt64() + 20));',
  '        int ac = -1, white = -1;',
  '        Head(B, 9, 32, p, 20); if (DisplayConfigGetDeviceInfo(B) == 0) ac = Marshal.ReadInt32(B, 20);',
  '        Head(B, 11, 24, p, 20); if (DisplayConfigGetDeviceInfo(B) == 0) white = Marshal.ReadInt32(B, 20);',
  "        sb.Append(name).Append('=').Append(ac).Append(',').Append(white).Append(';');",
  '      }',
  '    } finally { Marshal.FreeHGlobal(P); Marshal.FreeHGlobal(M); Marshal.FreeHGlobal(B); }',
  '    return sb.ToString();',
  '  }',
  '}',
  '[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct VsOutDesc { [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName; public int L, T, R, B; public int Attached; public int Rotation; public IntPtr Monitor; }',
  '[ComImport, Guid("ae02eedb-c735-4690-8d52-5a8dc20213aa"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IVsOutput { void _0(); void _1(); void _2(); void _3(); [PreserveSig] int GetDesc(out VsOutDesc d); }',
  '[ComImport, Guid("2411e7e1-12ac-4ccf-bd14-9798e8534dc0"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IVsAdapter { void _0(); void _1(); void _2(); void _3(); [PreserveSig] int EnumOutputs(uint i, out IVsOutput o); }',
  '[ComImport, Guid("770aae78-f26f-4dba-a829-253c83d1b387"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IVsFactory { void _0(); void _1(); void _2(); void _3(); void _4(); void _5(); void _6(); void _7(); void _8(); [PreserveSig] int EnumAdapters1(uint i, out IVsAdapter a); }',
  'public static class VsDxgi {',
  '  [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IVsFactory f);',
  '  public static string Read() {',
  '    var sb = new StringBuilder(); var g = new Guid("770aae78-f26f-4dba-a829-253c83d1b387"); IVsFactory f;',
  '    if (CreateDXGIFactory1(ref g, out f) != 0) return "";',
  '    for (uint a = 0; a < 16; a++) { IVsAdapter ad; if (f.EnumAdapters1(a, out ad) != 0) break;',
  '      for (uint o = 0; o < 16; o++) { IVsOutput op; if (ad.EnumOutputs(o, out op) != 0) break; VsOutDesc d; if (op.GetDesc(out d) == 0) sb.Append(d.DeviceName).Append(\'=\').Append(a).Append(\',\').Append(o).Append(\';\'); } }',
  '    return sb.ToString();',
  '  }',
  '}',
  "'@",
  '$aware = 0; try { $aware = [int][VsStreamDc]::SetProcessDPIAware() } catch { }',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$dc = @{}; try { foreach ($kv in ([VsStreamDc]::Read()).Split(\';\')) { $p = $kv.Split(\'=\'); if ($p.Length -eq 2) { $dc[$p[0]] = $p[1] } } } catch { }',
  '$dx = @{}; try { foreach ($kv in ([VsDxgi]::Read()).Split(\';\')) { $p = $kv.Split(\'=\'); if ($p.Length -eq 2) { $dx[$p[0]] = $p[1] } } } catch { }',
  '$rows = @()',
  'foreach ($s in [System.Windows.Forms.Screen]::AllScreens) { $b = $s.Bounds; $c = \'\'; if ($dc.ContainsKey($s.DeviceName)) { $c = $dc[$s.DeviceName] }; $o = \'\'; if ($dx.ContainsKey($s.DeviceName)) { $o = $dx[$s.DeviceName] }; $rows += @{ id = $s.DeviceName; x = $b.X; y = $b.Y; w = $b.Width; h = $b.Height; primary = [int]$s.Primary; dc = $c; dxgi = $o } }',
  "[Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ t = 'stream-facts'; aware = $aware; dxgi = $dx.Count; rows = $rows } -Compress -Depth 4))"].join('\n');

/** The script's one line → { ok, displays: [{ id, x, y, w, h, primary, hdr, wideColor, white, adapter, output }], dxgi }.
 *  hdr: advanced colour on and not the SDR wide-colour mode (true | false | null unknown); white: SDRWhiteLevel | null. */
function parseStreamFacts(stdout) {
  let o = null;
  for (const line of String(stdout || '').split(/\r?\n/)) { const l = line.trim(); if (!l.startsWith('{')) continue; try { const v = JSON.parse(l); if (v && v.t === 'stream-facts') { o = v; break; } } catch { /* not ours */ } }
  const rows = o && Array.isArray(o.rows) ? o.rows : o && o.rows && typeof o.rows === 'object' ? [o.rows] : null; // PowerShell 5 writes a lone row as an object
  if (!rows || !rows.length) return { ok: false, code: 'bad_output', error: 'the machine did not print its screen facts' };
  const num = (v) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  const displays = [];
  for (const r of rows.slice(0, 16)) {
    const x = num(r && r.x), y = num(r && r.y), w = num(r && r.w), h = num(r && r.h);
    if (x == null || y == null || !(w > 0) || !(h > 0)) continue;
    const [ac, white] = String(r.dc || '').split(',').map(num);
    const [adapter, output] = String(r.dxgi || '').split(',').map(num);
    displays.push({ id: String(r.id || '').slice(0, 60) || `#${displays.length + 1}`, x, y, w, h, primary: !!Number(r.primary),
      hdr: ac == null || ac < 0 ? null : (ac & 2) !== 0 && (ac & 4) === 0, wideColor: ac != null && ac >= 0 && (ac & 4) !== 0,
      white: white > 0 ? white : null, adapter: adapter == null ? null : adapter, output: output == null ? null : output });
  }
  return displays.length ? { ok: true, displays, dxgi: num(o.dxgi) || 0 } : { ok: false, code: 'bad_output', error: 'the machine printed no usable screen' };
}

// ── THE PLAN ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const SCREEN_DEFAULTS = Object.freeze({ fps: 30, gopSeconds: 2, minKbps: 300 });
const QUIET = Object.freeze(['-hide_banner', '-loglevel', 'error', '-nostats']);
/** The rate, GOP, profile and VUI every rung takes, then the FLV pipe (flushed per picture). */
function encodeTail(enc, { kbps, fps, gop }) {
  const k = Math.round(kbps);
  return ['-c:v', enc.id, ...enc.args, '-profile:v', enc.profile, '-bf', '0', '-g', String(gop), '-b:v', `${k}k`, '-maxrate', `${k}k`, '-bufsize', `${Math.max(1, Math.round((k * 2) / fps))}k`,
    '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-colorspace', 'bt709', '-color_range', 'tv',
    '-fps_mode', 'passthrough', '-f', 'flv', '-flvflags', 'no_duration_filesize', '-flush_packets', '1', 'pipe:1'];
}
/** DDA, one output of adapter 0 (ddagrab opens the default adapter's outputs). */
const grab = (output, fps, bits16) => `ddagrab=output_idx=${output}${bits16 ? ':output_fmt=16bit' : ''}:framerate=${fps}`;
/** The capture ffmpeg of the MAPPED road: FP16 frames as their raw bits on stdout — NO `format=` conversion of a float
 *  format (swscale clamps them to [0, 1]: measured, ffmpeg 8.0.1) — hwdownload hands rgbaf16le, `format=` only pins it. */
function captureArgv(plan) { return [...QUIET, '-nostdin', '-f', 'lavfi', '-i', grab(plan.display.output, plan.fps, true), '-vf', 'hwdownload,format=rgbaf16le', '-f', 'rawvideo', '-pix_fmt', 'rgbaf16le', 'pipe:1']; }
/** The encoder ffmpeg of the MAPPED road: the agent's NV12 frames on stdin. */
function encodeArgv(plan, kbps = plan.kbps) {
  return [...QUIET, '-f', 'rawvideo', '-pix_fmt', 'nv12', '-video_size', `${plan.w}x${plan.h}`, '-framerate', String(plan.fps), '-i', 'pipe:0', ...encodeTail(plan.encoder, { kbps, fps: plan.fps, gop: plan.gop })];
}
/** The DIRECT road (an SDR display — DDA's 8-bit picture is exact): one ffmpeg, capture → NV12 (8-bit, BT.709) → the encoder. */
function directArgv(plan, kbps = plan.kbps) {
  return [...QUIET, '-nostdin', '-f', 'lavfi', '-i', grab(plan.display.output, plan.fps, false), '-vf', 'hwdownload,format=bgra,scale=out_color_matrix=bt709:out_range=tv,format=nv12', ...encodeTail(plan.encoder, { kbps, fps: plan.fps, gop: plan.gop })];
}
/**
 * The session's plan. `facts` = { platform, ffmpeg: {path, version, major, ddagrab, encoders}, displays } (the stream-facts
 * op's answer); `display` = a display id (`\\.\DISPLAY2`) or null = the primary. → { ok, mode, display, origin, w, h, fps,
 * kbps, gop, white, tone, encoder, note } | { ok: false, code, error }
 */
function planScreen(facts, opts = {}) {
  const f = facts || {};
  if (f.platform === 'darwin') return planMacScreen(f, opts); // lane stream-p3m-build: the Mac's helper road
  const { display = null, fps = SCREEN_DEFAULTS.fps, kbps = 8000, tone = TONE_DEFAULT } = opts || {};
  if (f.platform !== 'win32') return { ok: false, code: 'not_windows', error: `the screen source captures a Windows desktop (this machine runs ${f.platform || 'an unknown system'})` };
  if (f.displaysError) return { ok: false, code: 'facts_failed', error: `the machine's screen facts could not be read (${f.displaysError})` };
  const fv = ffmpegVerdict(f.ffmpeg);
  if (!fv.ok) return fv;
  const list = Array.isArray(f.displays) ? f.displays : [];
  const d = display ? list.find((x) => x.id === display) : list.find((x) => x.primary) || null;
  if (!d) return { ok: false, code: 'display_gone', error: display ? `the display ${display} is not connected to the machine any more` : 'the machine shows no primary display' };
  const mapped = d.adapter == null ? (d.primary ? { adapter: 0, output: 0 } : null) : { adapter: d.adapter, output: d.output };
  if (!mapped) return { ok: false, code: 'display_unmapped', error: `the machine did not say which graphics output shows ${d.id} — only the primary display can be captured` };
  if (mapped.adapter !== 0) return { ok: false, code: 'display_other_gpu', error: `${d.id} is on the machine's graphics adapter ${mapped.adapter}; the capture opens the first adapter's displays` };
  const hdr = d.hdr === true;
  if (hdr && !(d.white > 0)) return { ok: false, code: 'no_white_level', error: `${d.id} is in HDR and its SDR white level could not be read — the colours would be guessed` };
  const pe = pickEncoder(f.ffmpeg.encoders);
  if (!pe.ok) return pe;
  const rate = Math.max(SCREEN_DEFAULTS.minKbps, Math.round(Number(kbps) || 8000));
  const r = Math.max(1, Math.min(120, Math.round(Number(fps) || SCREEN_DEFAULTS.fps)));
  return { ok: true, mode: hdr ? 'mapped' : 'direct', display: { id: d.id, output: mapped.output }, origin: { x: d.x, y: d.y }, w: d.w & ~1, h: d.h & ~1, srcW: d.w, srcH: d.h,
    fps: r, kbps: rate, gop: r * SCREEN_DEFAULTS.gopSeconds, white: hdr ? d.white : null, tone: { knee: tone.knee, peak: tone.peak }, encoder: pe.encoder, note: pe.note, ffmpeg: f.ffmpeg.path };
}

// ── THE BITRATE ──────────────────────────────────────────────────────────────────────────────────────────────────────
const KBPS_RULE = Object.freeze({ minGapMs: 5000, band: 0.25, stepKbps: 100 });
/** werift's estimate → restart the encoder at a new rate? Never within minGapMs of the last change (or the start), only on
 *  a move of at least `band`, rounded to stepKbps, never under minKbps or over the session's cap. → { change, kbps } */
function kbpsDecision({ current, target, cap, lastAt, now }, rule = KBPS_RULE) {
  const t = Math.max(SCREEN_DEFAULTS.minKbps, Math.min(Number(cap) || Infinity, Math.round((Number(target) || 0) / rule.stepKbps) * rule.stepKbps));
  if (!(current > 0) || !(t > 0)) return { change: false, kbps: current };
  if (now - lastAt < rule.minGapMs) return { change: false, kbps: current };
  if (Math.abs(t - current) / current < rule.band) return { change: false, kbps: current };
  return { change: true, kbps: t };
}

// ── THE ENCODER'S OUTPUT: FLV → access units ─────────────────────────────────────────────────────────────────────────
/** An incremental FLV reader: push(bytes) → [{ type: 'au', nalus, key, tsMs } | { type: 'bad', error }]. AVC only; the
 *  sequence header's SPS/PPS go in front of every key access unit that lacks them. */
function flvReader() {
  let buf = new Uint8Array(0), head = false, lenSize = 4, sps = [], pps = [], dead = false;
  const u24 = (b, i) => (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
  function push(chunk) {
    if (dead) return [];
    const nb = new Uint8Array(buf.length + chunk.length); nb.set(buf); nb.set(chunk, buf.length); buf = nb;
    const out = [];
    let i = 0;
    if (!head) {
      if (buf.length < 13) return out;
      if (buf[0] !== 0x46 || buf[1] !== 0x4c || buf[2] !== 0x56) { dead = true; return [{ type: 'bad', error: 'the encoder did not write FLV' }]; }
      i = ((buf[5] << 24) | (buf[6] << 16) | (buf[7] << 8) | buf[8]) + 4; head = true;
    }
    while (buf.length - i >= 11) {
      const type = buf[i], size = u24(buf, i + 1), ts = (buf[i + 7] << 24 | u24(buf, i + 4)) >>> 0;
      if (buf.length - i < 11 + size + 4) break;
      const d = buf.subarray(i + 11, i + 11 + size);
      i += 11 + size + 4;
      if (type !== 9 || d.length < 5 || (d[0] & 0x0f) !== 7) continue; // video, AVC
      if (d[1] === 0) { // AVCDecoderConfigurationRecord
        let k = 10; lenSize = (d[9] & 3) + 1; sps = []; pps = []; // d[5..]: version, profile, compat, level, lengthSizeMinusOne
        for (let n = d[k++] & 0x1f; n > 0 && k + 2 <= d.length; n--) { const l = (d[k] << 8) | d[k + 1]; sps.push(d.slice(k + 2, k + 2 + l)); k += 2 + l; }
        for (let n = d[k++]; n > 0 && k + 2 <= d.length; n--) { const l = (d[k] << 8) | d[k + 1]; pps.push(d.slice(k + 2, k + 2 + l)); k += 2 + l; }
        continue;
      }
      if (d[1] !== 1) continue;
      const nalus = [];
      for (let k = 5; k + lenSize <= d.length;) {
        let l = 0; for (let b = 0; b < lenSize; b++) l = l * 256 + d[k + b];
        k += lenSize; if (l <= 0 || k + l > d.length) break;
        nalus.push(d.slice(k, k + l)); k += l;
      }
      if (!nalus.length) continue;
      const key = (d[0] >> 4) === 1 || nalus.some((x) => (x[0] & 0x1f) === 5);
      const hasPs = nalus.some((x) => (x[0] & 0x1f) === 7);
      out.push({ type: 'au', nalus: key && !hasPs ? [...sps, ...pps, ...nalus] : nalus, key, tsMs: ts });
    }
    buf = buf.slice(i);
    return out;
  }
  return { push };
}

// ── THE MAC (lane stream-p3m-build — design q-041 r3 §1/§3 P3m; every number: lane stream-p3m-probe's report) ──────────
// The picture comes from ONE helper, tools/vibespace-screen/vibespace-screen.swift: ScreenCaptureKit hands the SDR picture
// EXACT when asked for sRGB (no tone-map — the Mac has no mapping road), VideoToolbox forces a key on the SAME frame and
// follows a bitrate LIVE (no encoder restart), the pictures ride FLV on stdout (flvReader above — no new parser), and CGEvent
// posts the viewer's input. THE TCC LAW: macOS keys Screen Recording / Accessibility on the RESPONSIBLE process — a plain
// child of the agent is the agent's node BY PATH — so the helper is spawned DISCLAIMED (its own `--disclaim` re-spawn), lives
// at a FIXED path with its own version and is replaced only when the shipped version differs (an ad-hoc grant is keyed to
// path + cdhash: a new binary must be granted again — helper_changed_regrant). It never asks for a grant and never prompts
// (a background agent cannot: tccd "does not allow prompting"); a refusal names the Settings pane (MAC_SETTINGS).
const MAC_HELPER = Object.freeze({ name: 'vibespace-screen', dir: Object.freeze(['.vibespace', 'helpers']), target: 'macos15.0', archs: Object.freeze(['arm64', 'x86_64']) });
const MAC_SETTINGS = Object.freeze({
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
});
// the size ladder (measured on an M4 Pro, low-latency rate control, real frames): 4K60 is out of reach (37 fps real, serial
// 17–29 ms a frame); 1440p (SCK scales on the GPU) holds 57 fps at 11.9 ms, 4K at 30 fps 18.7 ms. A display or window that
// fits 2560×1600 streams native at 60; a larger one is scaled to 2560×1440 at 60, or (`quality: 'full'`) native at 30.
const MAC_LADDER = Object.freeze([
  Object.freeze({ id: '1440p60', maxW: 2560, maxH: 1600, fitW: 2560, fitH: 1440, fps: 60 }),
  Object.freeze({ id: '4k30', maxW: 3840, maxH: 2400, fitW: 3840, fitH: 2400, fps: 30 }),
]);
/** The helper's place on the Mac (home = the agent user's): the binary, its version file, its state, a pushed prebuilt. */
function macHelperPaths(home) {
  const dir = [String(home || '').replace(/\/+$/, ''), ...MAC_HELPER.dir].join('/'), bin = `${dir}/${MAC_HELPER.name}`;
  return { dir, bin, version: `${bin}.version`, state: `${bin}.state.json`, incoming: (v) => `${bin}-${v}` };
}
/** The ONE file swiftc compiles: the version line, then the source (the binary says its own version). */
const macHelperSourceFile = (version, source) => `let HELPER_VERSION = ${JSON.stringify(String(version))}\n${String(source)}`;
/** The on-box build (the Command Line Tools' swiftc): both slices at once, lipo, ONE ad-hoc signature. → { slices, after } */
function macBuildPlan({ swiftc, src, dir, out }) {
  const slice = (a) => `${dir}/vibespace-screen-${a}`;
  return {
    slices: MAC_HELPER.archs.map((a) => ({ file: swiftc, args: ['-O', '-target', `${a}-apple-${MAC_HELPER.target}`, '-o', slice(a), src] })),
    after: [{ file: '/usr/bin/lipo', args: ['-create', '-output', out, ...MAC_HELPER.archs.map(slice)] }, { file: '/usr/bin/codesign', args: ['-s', '-', '-f', out] }],
  };
}
/** How the agent spawns the helper: DISCLAIMED — Node's spawn cannot set the responsibility attribute, so the helper's first
 *  argument makes it re-spawn ITSELF with responsibility_spawnattrs_setdisclaim (the child is its own TCC client). */
function macHelperSpawn(bin, cmd, args = []) { return { file: bin, args: ['--disclaim', cmd, ...args.map(String)], disclaim: true }; }

const GRANT = (v) => (v === 'granted' || v === 'denied' ? v : 'unknown');
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** The helper's `facts` line → { ok, version, disclaimed, tcc: { screen, accessibility }, locked, front, os, arch, displays:
 *  [{ id, x, y, w, h (points), pw, ph (pixels), scale, main, hdr, asleep, name }], windows: [{ id, pid, app, bundle, title,
 *  x, y, w, h, onScreen, minimized (true | false | null — only Accessibility can tell) }] } | { ok: false, code, error } */
function parseMacFacts(stdout) {
  let o = null;
  for (const line of String(stdout || '').split(/\r?\n/)) { const l = line.trim(); if (!l.startsWith('{')) continue; try { const v = JSON.parse(l); if (v && v.t === 'facts') { o = v; break; } } catch { /* not ours */ } }
  if (!o) return { ok: false, code: 'bad_output', error: 'the screen helper did not print its facts' };
  const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : null);
  const displays = (Array.isArray(o.displays) ? o.displays : []).slice(0, 16).filter((d) => d && Number.isInteger(d.id) && fin(d.w) > 0 && fin(d.h) > 0).map((d) => ({
    id: String(d.id), x: fin(d.x) || 0, y: fin(d.y) || 0, w: d.w, h: d.h, pw: fin(d.pw) || d.w, ph: fin(d.ph) || d.h, scale: fin(d.scale) || 1,
    main: !!d.main, hdr: !!d.hdr, asleep: !!d.asleep, name: str(d.name, 80) }));
  const windows = (Array.isArray(o.windows) ? o.windows : []).slice(0, 200).filter((w) => w && Number.isInteger(w.id) && fin(w.w) > 0 && fin(w.h) > 0).map((w) => ({
    id: String(w.id), pid: Number.isInteger(w.pid) ? w.pid : 0, app: str(w.app, 80), bundle: str(w.bundle, 120), title: str(w.title), x: fin(w.x) || 0, y: fin(w.y) || 0, w: w.w, h: w.h,
    onScreen: !!w.onScreen, minimized: typeof w.minimized === 'boolean' ? w.minimized : null }));
  const t = o.tcc && typeof o.tcc === 'object' ? o.tcc : {};
  return { ok: true, version: str(o.version, 40), disclaimed: typeof o.disclaimed === 'boolean' ? o.disclaimed : null, tcc: { screen: GRANT(t.screen), accessibility: GRANT(t.accessibility) },
    locked: !!o.locked, front: Number.isInteger(o.front) ? o.front : null, os: str(o.os, 20), arch: str(o.arch, 10), displays, windows };
}
/** A window of the facts (+ the display it sits on) → THE single-window source shape, the one lane stream-p2w-build lands
 *  for Windows (src/stream-window.js there): bounds = the captured rect on the machine's desktop in PHYSICAL pixels (a Mac's
 *  points × its scale; the frame includes the 32 pt title bar), dpi 96 = 100 % (a 2× Mac = 192), id = the CGWindowID. */
function windowSourceOf(w, display = null) {
  if (!w) return null;
  const s = (display && display.scale) || 1, px = (v) => Math.round(v * s);
  return { kind: 'window', id: String(w.id), title: w.title == null ? null : String(w.title), app: w.app == null ? null : String(w.app),
    bounds: { x: px(w.x), y: px(w.y), w: px(w.w), h: px(w.h) }, display: display ? display.id : null, dpi: Math.round(96 * s), minimized: w.minimized === true };
}
/** Fit pixels into a box, aspect kept, even sizes. */
function fitEven(pw, ph, maxW, maxH) { const s = Math.min(1, maxW / pw, maxH / ph); return { w: Math.max(2, Math.round(pw * s) & ~1), h: Math.max(2, Math.round(ph * s) & ~1) }; }
/** The size + rate for a picture of pw × ph pixels (the ladder above). */
function macRungOf(pw, ph, { quality = null } = {}) {
  const [hd, full] = MAC_LADDER;
  if (pw <= hd.maxW && ph <= hd.maxH) return { rung: 'native60', ...fitEven(pw, ph, pw, ph), fps: hd.fps };
  if (quality === 'full') return { rung: full.id, ...fitEven(pw, ph, full.fitW, full.fitH), fps: full.fps };
  return { rung: hd.id, ...fitEven(pw, ph, hd.fitW, hd.fitH), fps: hd.fps };
}
const MAC_WHY = Object.freeze({
  no_helper: 'the Mac has no screen helper yet and cannot build one (no Command Line Tools: run `xcode-select --install` on the Mac, or let the hub push its prebuilt helper)',
  screen_permission: 'Screen Recording is off for vibespace-screen — on the Mac: System Settings → Privacy & Security → Screen & System Audio Recording → turn on vibespace-screen',
  helper_changed_regrant: 'the screen helper was updated, so macOS asks for its permission again — on the Mac: System Settings → Privacy & Security → Screen & System Audio Recording → turn vibespace-screen off and on',
  accessibility_permission: 'Accessibility is off for vibespace-screen (macOS drops its keys and clicks) — on the Mac: System Settings → Privacy & Security → Accessibility → turn on vibespace-screen',
});
/**
 * The Mac's plan (planScreen's darwin branch). `facts` = the agent's darwin stream-facts { platform: 'darwin', helper: {
 * state: 'ready' | …, code?, regrant, bin }, tcc, displays, windows }; `display` = a display id (null = the main one) or
 * `window` = a window id (the single-window source). → { ok, mode: 'videotoolbox', kind: 'display' | 'window', display,
 * window, origin, w, h, fps, kbps, rung, encoder, note, white: null, bin, args } | { ok: false, code, error, settings? }
 */
function planMacScreen(facts, { display = null, window = null, fps = null, kbps = 8000, quality = null } = {}) {
  const f = facts || {};
  const h = f.helper || {};
  if (h.state !== 'ready' || !h.bin) return { ok: false, code: h.code || 'no_helper', error: h.error || MAC_WHY.no_helper };
  const tcc = (f.tcc && f.tcc.screen) || 'unknown';
  if (tcc !== 'granted') return { ok: false, code: h.regrant ? 'helper_changed_regrant' : 'screen_permission', error: h.regrant ? MAC_WHY.helper_changed_regrant : MAC_WHY.screen_permission, settings: MAC_SETTINGS.screen };
  const ds = Array.isArray(f.displays) ? f.displays : [], ws = Array.isArray(f.windows) ? f.windows : [];
  let kind = 'display', d = null, w = null, pw, ph;
  if (window != null) {
    kind = 'window';
    w = ws.find((x) => x.id === String(window)) || null;
    if (!w) return { ok: false, code: 'window_gone', error: `the window ${window} is not on the Mac any more` };
    if (w.minimized === true) return { ok: false, code: 'window_minimized', error: 'the window is minimized — restore it to stream (a minimized window sends no picture)' };
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    d = ds.find((x) => cx >= x.x && cx < x.x + x.w && cy >= x.y && cy < x.y + x.h) || ds.find((x) => x.main) || ds[0] || null;
    const s = d ? d.scale : 2;
    pw = w.w * s; ph = w.h * s;
  } else {
    d = display != null ? ds.find((x) => x.id === String(display)) || null : ds.find((x) => x.main) || ds[0] || null;
    if (!d) return { ok: false, code: 'display_gone', error: display != null ? `the display ${display} is not connected to the Mac any more` : 'the Mac shows no display' };
    pw = d.pw; ph = d.ph;
  }
  const r = macRungOf(pw, ph, { quality });
  const rate = Math.max(SCREEN_DEFAULTS.minKbps, Math.round(Number(kbps) || 8000));
  const fr = fps != null ? Math.max(1, Math.min(r.fps, Math.round(Number(fps) || r.fps))) : r.fps;
  const args = ['capture', kind === 'window' ? '--window' : '--display', kind === 'window' ? w.id : d.id, '--fps', String(fr), '--size', `${r.w}x${r.h}`, '--kbps', String(rate)];
  return { ok: true, mode: 'videotoolbox', kind, display: d ? { id: d.id } : null, window: windowSourceOf(w, d), origin: { x: 0, y: 0 }, w: r.w, h: r.h, fps: fr, kbps: rate, rung: r.rung,
    encoder: { id: 'videotoolbox', label: 'VideoToolbox', hw: true }, note: null, white: null, bin: h.bin, args };
}
/** Where the picture sits on the Mac (the helper's `started` / `frame` line: its frame in global points, the picture's
 *  pixels, a window's app + id) → the input's target { pid (0 = the frontmost app — a display), wid (the window the keys
 *  must reach: an app's keys land in ITS key window — measured), ox, oy, sx, sy } (points per picture pixel). */
function macInputTarget(info) {
  const fr = info && info.frame, w = Number(info && info.w), h = Number(info && info.h);
  if (!fr || !(w > 0) || !(h > 0) || !(fr.w > 0) || !(fr.h > 0)) return null;
  const pid = Number.isInteger(info.pid) && info.pid > 0 ? info.pid : 0;
  return { pid, wid: pid && Number.isInteger(info.window) && info.window > 0 ? info.window : 0, ox: Number(fr.x) || 0, oy: Number(fr.y) || 0, sx: fr.w / w, sy: fr.h / h };
}
/** A picture pixel → the Mac's global point (2 decimals). No target = the pixel already is a point. */
function macPoint(target, x, y) {
  const r2 = (v) => Math.round(v * 100) / 100;
  if (!target) return { x: r2(x), y: r2(y) };
  return { x: r2(target.ox + x * target.sx), y: r2(target.oy + y * target.sy) };
}
/** VideoToolbox follows a bitrate LIVE (no restart, unlike ffmpeg's CLI): follow the estimate, at most once a second and only
 *  on a ≥ 10 % move, rounded to 100 kbps, never under the floor or over the session's cap. → { change, kbps } */
const MAC_KBPS_RULE = Object.freeze({ minGapMs: 1000, band: 0.1, stepKbps: 100 });
const macKbpsDecision = (o) => kbpsDecision(o, MAC_KBPS_RULE);

module.exports = {
  halfToFloat, srgbOetf, TONE_DEFAULT, toneCurve, mapLinear, srgb8OfHalf, buildLut, nv12FromHalf, nv12Bytes, CALIBRATION,
  ENCODER_LADDER, pickEncoder, FFMPEG_MIN_MAJOR, ffmpegCandidates, parseFfmpegFacts, ffmpegVerdict, STREAM_FACTS_PS, parseStreamFacts,
  SCREEN_DEFAULTS, planScreen, captureArgv, encodeArgv, directArgv, KBPS_RULE, kbpsDecision, flvReader,
  MAC_HELPER, MAC_SETTINGS, MAC_LADDER, MAC_WHY, macHelperPaths, macHelperSourceFile, macBuildPlan, macHelperSpawn, parseMacFacts, windowSourceOf,
  macRungOf, planMacScreen, macInputTarget, macPoint, MAC_KBPS_RULE, macKbpsDecision,
};

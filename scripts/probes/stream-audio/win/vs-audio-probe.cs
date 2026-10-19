// vs-audio-probe.cs — VibeSpace lane stream-audio-probe (probe only; nothing in src/ calls it).
//
// THE SPEAKER LEG of the machine stream on Windows: what the machine's speakers play should reach the person who watches the
// machine's stream. This helper measures what the in-box Core Audio API offers for that, with no third-party code:
//   * WASAPI LOOPBACK capture of the default render endpoint (the mix the speakers get): the format delivered, the engine
//     period, how late each packet arrives, what a silent system yields, the CPU it costs;
//   * its OWN short test tone (1 kHz, -20 dBFS, 200 ms) rendered through an ordinary shared-mode stream, so the loopback
//     delay is measured against a known onset — the endpoint, its volume and the default-device choice are never changed;
//   * a silent keep-alive render stream (zeros), the known fix for "loopback delivers nothing while nothing plays";
//   * the INTERCOM road (the viewer's voice played on the machine's speakers): s16le 48 kHz stereo PCM from stdin rendered
//     on the default endpoint, its onset timed from arrival to the mix.
// Captured audio is never written to disk: `loop` keeps numbers only, and hands PCM to stdout only with `--pcm-out -` (the
// encode leg pipes it straight into ffmpeg).
//
// Build (in-box .NET Framework 4.8 csc, C# 5):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /optimize /out:vs-audio-probe.exe vs-audio-probe.cs
// Modes:
//   facts                                                 the endpoints (render + capture) and the default render endpoint's facts
//   loop   --secs N [--keepalive 0|1] [--tone T,T…] [--pcm-out -] [--convert 0|1]
//   render --secs N [--loopback 0|1] [--prebuffer-ms M]   (stdin: s16le 48 kHz stereo)
// Output: one JSON summary on stdout (stderr carries one JSON line a second and the pcm format line).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace VsAudioProbe {

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCo { }

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
  [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
  [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
  [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
}
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection {
  [PreserveSig] int GetCount(out int count);
  [PreserveSig] int Item(int index, out IMMDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore props);
  [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetState(out int state);
}
[StructLayout(LayoutKind.Sequential)] struct PROPERTYKEY { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Sequential)] struct PROPVARIANT { public ushort vt; public ushort r1, r2, r3; public IntPtr p; public IntPtr p2; }
[ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore {
  [PreserveSig] int GetCount(out int count);
  [PreserveSig] int GetAt(int index, out PROPERTYKEY key);
  [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
  [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
  [PreserveSig] int Commit();
}
[ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioClient {
  [PreserveSig] int Initialize(int shareMode, int streamFlags, long hnsBufferDuration, long hnsPeriodicity, IntPtr pFormat, IntPtr sessionGuid);
  [PreserveSig] int GetBufferSize(out uint frames);
  [PreserveSig] int GetStreamLatency(out long hns);
  [PreserveSig] int GetCurrentPadding(out uint frames);
  [PreserveSig] int IsFormatSupported(int shareMode, IntPtr pFormat, out IntPtr closest);
  [PreserveSig] int GetMixFormat(out IntPtr format);
  [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
  [PreserveSig] int Start();
  [PreserveSig] int Stop();
  [PreserveSig] int Reset();
  [PreserveSig] int SetEventHandle(IntPtr handle);
  [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
}
[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioCaptureClient {
  [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
  [PreserveSig] int ReleaseBuffer(uint frames);
  [PreserveSig] int GetNextPacketSize(out uint frames);
}
[ComImport, Guid("F294ACFC-3146-4483-A7BF-ADDCA7C260E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioRenderClient {
  [PreserveSig] int GetBuffer(uint frames, out IntPtr data);
  [PreserveSig] int ReleaseBuffer(uint frames, uint flags);
}
[ComImport, Guid("CD63314F-3FBA-4a1b-812C-EF96358728E7"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioClock {
  [PreserveSig] int GetFrequency(out ulong frequency);
  [PreserveSig] int GetPosition(out ulong position, out ulong qpcPosition);
  [PreserveSig] int GetCharacteristics(out uint characteristics);
}

[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
  [PreserveSig] int GetAudioSessionControl(IntPtr sessionGuid, int flags, out IntPtr control);
  [PreserveSig] int GetSimpleAudioVolume(IntPtr sessionGuid, int flags, out IntPtr volume);
  [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
}
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
  [PreserveSig] int GetCount(out int count);
  [PreserveSig] int GetSession(int index, out IAudioSessionControl session);
}
[ComImport, Guid("F4B1A599-7266-4319-A8C1-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl {
  [PreserveSig] int GetState(out int state); // 0 inactive · 1 active · 2 expired
}

static class Native {
  [DllImport("kernel32.dll")] public static extern bool QueryPerformanceCounter(out long count);
  [DllImport("kernel32.dll")] public static extern bool QueryPerformanceFrequency(out long freq);
  [DllImport("kernel32.dll")] public static extern void GetSystemTimePreciseAsFileTime(out long fileTime);
  [DllImport("ole32.dll")] public static extern int PropVariantClear(ref PROPVARIANT pv);
  [DllImport("ole32.dll")] public static extern void CoTaskMemFree(IntPtr p);
}

/// One clock for every number: QPC in 100-ns units, mapped once to the precise wall clock (Unix ms) — the node legs on the
/// same box read Date.now() (GetSystemTimePreciseAsFileTime too), so a wall time here and there compare.
static class Clock {
  static long freq, q0; static double wall0;
  static Clock() {
    Native.QueryPerformanceFrequency(out freq);
    long ft; Native.QueryPerformanceCounter(out q0); Native.GetSystemTimePreciseAsFileTime(out ft);
    wall0 = (ft - 116444736000000000L) / 10000.0;
    q0 = ToHns(q0);
  }
  public static long ToHns(long c) { return (c / freq) * 10000000L + (c % freq) * 10000000L / freq; }
  public static long NowHns() { long c; Native.QueryPerformanceCounter(out c); return ToHns(c); }
  public static double WallOfHns(long hns) { return wall0 + (hns - q0) / 10000.0; }
  public static double NowWall() { return WallOfHns(NowHns()); }
}

class Fmt {
  public int tag, channels, rate, bits, block, validBits; public bool isFloat; public uint mask;
  public static Fmt Read(IntPtr p) {
    var f = new Fmt();
    f.tag = (ushort)Marshal.ReadInt16(p, 0); f.channels = (ushort)Marshal.ReadInt16(p, 2); f.rate = Marshal.ReadInt32(p, 4);
    f.block = (ushort)Marshal.ReadInt16(p, 12); f.bits = (ushort)Marshal.ReadInt16(p, 14); f.validBits = f.bits;
    f.isFloat = f.tag == 3;
    if (f.tag == 0xFFFE) {
      f.validBits = (ushort)Marshal.ReadInt16(p, 18); f.mask = (uint)Marshal.ReadInt32(p, 20);
      var g = new byte[16]; Marshal.Copy(new IntPtr(p.ToInt64() + 24), g, 0, 16);
      f.isFloat = new Guid(g) == new Guid("00000003-0000-0010-8000-00aa00389b71");
    }
    return f;
  }
  /// WAVE_FORMAT_IEEE_FLOAT, 48 kHz, stereo — what we ask for with AUTOCONVERTPCM (the engine converts from the mix format).
  public static IntPtr Float48Stereo() {
    IntPtr p = Marshal.AllocHGlobal(18);
    Marshal.WriteInt16(p, 0, 3); Marshal.WriteInt16(p, 2, 2); Marshal.WriteInt32(p, 4, 48000); Marshal.WriteInt32(p, 8, 48000 * 8);
    Marshal.WriteInt16(p, 12, 8); Marshal.WriteInt16(p, 14, 32); Marshal.WriteInt16(p, 16, 0);
    return p;
  }
  public string Json() {
    return "{\"tag\":" + tag + ",\"float\":" + (isFloat ? "true" : "false") + ",\"channels\":" + channels + ",\"rate\":" + rate + ",\"bits\":" + bits +
      ",\"validBits\":" + validBits + ",\"block\":" + block + ",\"mask\":" + mask + "}";
  }
  /// The packet's first two channels as floats in [-1, 1] (a float mix is copied in one go).
  float[] raw = new float[0];
  public void Stereo(IntPtr data, int n, float[] l, float[] r) {
    int c2 = Math.Min(1, channels - 1);
    if (isFloat && bits == 32) {
      if (raw.Length < n * channels) raw = new float[n * channels];
      Marshal.Copy(data, raw, 0, n * channels);
      for (int i = 0; i < n; i++) { l[i] = raw[i * channels]; r[i] = raw[i * channels + c2]; }
      return;
    }
    for (int i = 0; i < n; i++) { l[i] = Sample(data, i, 0); r[i] = Sample(data, i, c2); }
  }
  /// Sample `ch` of frame `i` as a float in [-1, 1].
  public float Sample(IntPtr data, int i, int ch) {
    int off = i * block + ch * (bits / 8);
    if (isFloat && bits == 32) { return BitConverter.ToSingle(BitConverter.GetBytes(Marshal.ReadInt32(data, off)), 0); }
    if (bits == 16) return Marshal.ReadInt16(data, off) / 32768f;
    if (bits == 32) return Marshal.ReadInt32(data, off) / 2147483648f;
    if (bits == 24) { int b0 = Marshal.ReadByte(data, off), b1 = Marshal.ReadByte(data, off + 1), b2 = (sbyte)Marshal.ReadByte(data, off + 2); return ((b2 << 16) | (b1 << 8) | b0) / 8388608f; }
    return 0;
  }
}

/// A 1 kHz detector over 2 ms blocks (Goertzel): robust against whatever else the machine plays.
class ToneDetector {
  readonly int n; readonly double coeff; int k; double s1, s2; long blockStartFrame; long lastOnset = long.MinValue / 2;
  readonly double[] hist = new double[50]; int hi; // the previous 100 ms of 1 kHz amplitude: the baseline whatever else plays
  public readonly List<long> onsets = new List<long>();
  public readonly List<double> series = new List<double>(); public long seriesFirstFrame = -1; public bool keepSeries;
  public double peakAmp;
  public ToneDetector(int rate) { n = Math.Max(16, (int)Math.Round(rate * 0.002)); coeff = 2 * Math.Cos(2 * Math.PI * 1000.0 / rate); }
  public void Push(float x, long frame) {
    if (k == 0) blockStartFrame = frame;
    double s0 = x + coeff * s1 - s2; s2 = s1; s1 = s0; k++;
    if (k < n) return;
    double power = s1 * s1 + s2 * s2 - coeff * s1 * s2; double amp = 2 * Math.Sqrt(Math.Max(0, power)) / n;
    if (amp > peakAmp) peakAmp = amp;
    if (keepSeries) { if (seriesFirstFrame < 0) seriesFirstFrame = blockStartFrame; series.Add(Math.Round(amp, 4)); }
    double baseline = 0; foreach (var h in hist) baseline = Math.Max(baseline, h);
    // an onset: well above everything in the previous 100 ms (3x), at least -34 dBFS, and 300 ms after the last one
    if (amp > 0.02 && amp > 3 * baseline && blockStartFrame - lastOnset > n * 150) { onsets.Add(blockStartFrame); lastOnset = blockStartFrame; }
    hist[hi] = amp; hi = (hi + 1) % hist.Length;
    k = 0; s1 = s2 = 0;
  }
}

class Stats {
  public readonly List<double> delays = new List<double>();
  public static string Pct(List<double> xs) {
    if (xs.Count == 0) return "null";
    var a = xs.ToArray(); Array.Sort(a);
    Func<double, double> q = (p) => a[Math.Min(a.Length - 1, (int)Math.Floor(p * a.Length))];
    return "{\"n\":" + a.Length + ",\"p50\":" + R(q(0.5)) + ",\"p95\":" + R(q(0.95)) + ",\"max\":" + R(a[a.Length - 1]) + ",\"min\":" + R(a[0]) + "}";
  }
  public static string R(double x) { return Math.Round(x, 2).ToString(CultureInfo.InvariantCulture); }
}

class Endpoint {
  public IMMDevice dev; public IAudioClient ac; public Fmt fmt; public bool converted; public long defPeriod, minPeriod, streamLatency; public uint bufferFrames;
  public string initError;
  static Guid IID_IAudioClient = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
  public static string DeviceMatch;   // --device <name part>: an ACTIVE render endpoint by its friendly name (else the default)
  public string name = "";
  /// The render endpoint: the default (eRender, eConsole) or the first active one whose friendly name holds DeviceMatch.
  public static IMMDevice Pick(out string name) {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
    var key = new PROPERTYKEY { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
    IMMDevice dev = null; name = "";
    if (string.IsNullOrEmpty(DeviceMatch)) { Check(en.GetDefaultAudioEndpoint(0, 0, out dev), "GetDefaultAudioEndpoint"); name = NameOf(dev, key); return dev; }
    IMMDeviceCollection col; Check(en.EnumAudioEndpoints(0, 1, out col), "EnumAudioEndpoints"); int n; col.GetCount(out n);
    for (int i = 0; i < n; i++) { IMMDevice d; col.Item(i, out d); string nm = NameOf(d, key); if (nm.IndexOf(DeviceMatch, StringComparison.OrdinalIgnoreCase) >= 0) { name = nm; return d; } }
    throw new Exception("no active render endpoint named like " + DeviceMatch);
  }
  public static string NameOf(IMMDevice d, PROPERTYKEY key) {
    string name = ""; IPropertyStore ps;
    if (d.OpenPropertyStore(0, out ps) == 0) { PROPVARIANT pv; if (ps.GetValue(ref key, out pv) == 0) { if (pv.vt == 31) name = Marshal.PtrToStringUni(pv.p); Native.PropVariantClear(ref pv); } }
    return name;
  }
  /// How many audio sessions on the endpoint are ACTIVE right now (other apps playing) — counts only, never names.
  public int ActiveSessions() {
    Guid g = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"); object o;
    if (dev.Activate(ref g, 23, IntPtr.Zero, out o) != 0) return -1;
    IAudioSessionEnumerator se; if (((IAudioSessionManager2)o).GetSessionEnumerator(out se) != 0) return -1;
    int n, active = 0; se.GetCount(out n);
    for (int i = 0; i < n; i++) { IAudioSessionControl c; int st; if (se.GetSession(i, out c) == 0 && c.GetState(out st) == 0 && st == 1) active++; }
    return active;
  }
  /// Opens an IAudioClient on the render endpoint — for loopback capture or our own render stream.
  public static Endpoint OpenDefaultRender(bool loopback, bool eventMode, bool convert, long bufferHns) {
    var e = new Endpoint();
    e.dev = Pick(out e.name);
    object o; Check(e.dev.Activate(ref IID_IAudioClient, 23, IntPtr.Zero, out o), "Activate"); e.ac = (IAudioClient)o;
    Check(e.ac.GetDevicePeriod(out e.defPeriod, out e.minPeriod), "GetDevicePeriod");
    IntPtr mix; Check(e.ac.GetMixFormat(out mix), "GetMixFormat");
    int flags = (loopback ? 0x00020000 : 0) | (eventMode ? 0x00040000 : 0);
    int hr = -1;
    if (convert) {
      IntPtr want = Fmt.Float48Stereo();
      hr = e.ac.Initialize(0, flags | unchecked((int)0x80000000) | 0x08000000, bufferHns, 0, want, IntPtr.Zero);
      if (hr == 0) { e.fmt = Fmt.Read(want); e.converted = true; } else e.initError = "autoconvert 0x" + hr.ToString("X8");
      Marshal.FreeHGlobal(want);
      if (hr != 0) { // a failed Initialize leaves the client unusable: a fresh one for the mix-format try
        Check(e.dev.Activate(ref IID_IAudioClient, 23, IntPtr.Zero, out o), "Activate#2"); e.ac = (IAudioClient)o;
      }
    }
    if (hr != 0) { Check(e.ac.Initialize(0, flags, bufferHns, 0, mix, IntPtr.Zero), "Initialize"); e.fmt = Fmt.Read(mix); }
    Native.CoTaskMemFree(mix);
    e.ac.GetBufferSize(out e.bufferFrames); e.ac.GetStreamLatency(out e.streamLatency);
    return e;
  }
  public T Service<T>(string iid) { Guid g = new Guid(iid); object o; Check(ac.GetService(ref g, out o), "GetService " + typeof(T).Name); return (T)o; }
  public static void Check(int hr, string what) { if (hr != 0) throw new Exception(what + " failed 0x" + hr.ToString("X8")); }
  public string Json() {
    return "{\"endpoint\":" + Program.Q(name) + ",\"format\":" + fmt.Json() + ",\"converted\":" + (converted ? "true" : "false") + (initError != null ? ",\"convertRefused\":\"" + initError + "\"" : "") +
      ",\"periodMs\":{\"default\":" + Stats.R(defPeriod / 10000.0) + ",\"min\":" + Stats.R(minPeriod / 10000.0) + "},\"bufferFrames\":" + bufferFrames +
      ",\"bufferMs\":" + Stats.R(bufferFrames * 1000.0 / fmt.rate) + ",\"streamLatencyMs\":" + Stats.R(streamLatency / 10000.0) + "}";
  }
}

/// Our own render stream on the default endpoint: zeros (the keep-alive), the test tones at given times, or PCM from a queue.
class Renderer {
  public Endpoint ep; IAudioRenderClient rc; IAudioClock clock; ulong clockFreq; Thread th; volatile bool run;
  public long framesWritten; public int underruns; double[] toneAt; int toneIdx; long toneFrame = -1; long toneLen;
  public readonly List<string> toneLog = new List<string>();
  public Func<float[], int, int> pull;  // fills interleaved stereo floats for `frames` frames, returns frames given (the intercom)
  public Func<long, double> playWallOf;  // render frame → when the engine plays it (IAudioClock)
  readonly double amp; long t0;
  public Renderer(double[] tones, double ampDb) { toneAt = tones ?? new double[0]; amp = Math.Pow(10, ampDb / 20.0); }
  AutoResetEvent ev;
  public void Start() {
    // event-driven shared render: the engine signals every period (10 ms here) and we top the buffer up — the canonical
    // low-latency shared path (a 5 ms Sleep poll is really 15.6 ms on Windows' default timer and underran 138 times in 4 s)
    ep = Endpoint.OpenDefaultRender(false, true, true, 0);
    ev = new AutoResetEvent(false); Endpoint.Check(ep.ac.SetEventHandle(ev.SafeWaitHandle.DangerousGetHandle()), "render SetEventHandle");
    rc = ep.Service<IAudioRenderClient>("F294ACFC-3146-4483-A7BF-ADDCA7C260E2");
    clock = ep.Service<IAudioClock>("CD63314F-3FBA-4a1b-812C-EF96358728E7"); clock.GetFrequency(out clockFreq);
    toneLen = ep.fmt.rate / 5; // 200 ms
    playWallOf = (frame) => {
      ulong pos, qpc; if (clock.GetPosition(out pos, out qpc) != 0) return double.NaN;
      double posFrames = pos * (double)ep.fmt.rate / clockFreq;
      return Clock.WallOfHns((long)qpc) + (frame - posFrames) * 1000.0 / ep.fmt.rate;
    };
    Fill(ep.bufferFrames);
    Endpoint.Check(ep.ac.Start(), "render Start"); t0 = Clock.NowHns(); run = true;
    th = new Thread(Loop); th.IsBackground = true; th.Start();
  }
  void Loop() {
    while (run) {
      if (!ev.WaitOne(200)) continue;
      uint pad; if (ep.ac.GetCurrentPadding(out pad) != 0) continue;
      if (pad == 0 && framesWritten > 0) underruns++;
      Fill(ep.bufferFrames - pad);
    }
  }
  float[] buf = new float[0];
  void Fill(uint frames) {
    if (frames == 0) return;
    IntPtr data; if (rc.GetBuffer(frames, out data) != 0) return;
    int ch = ep.fmt.channels; if (buf.Length < frames * 2) buf = new float[frames * 2];
    Array.Clear(buf, 0, (int)frames * 2);
    if (pull != null) pull(buf, (int)frames);
    double elapsed = (Clock.NowHns() - t0) / 1e7;
    for (int i = 0; i < frames; i++) {
      long f = framesWritten + i;
      if (toneFrame < 0 && toneIdx < toneAt.Length && t0 != 0 && elapsed >= toneAt[toneIdx]) {
        toneFrame = f; toneIdx++;
        uint pad; ep.ac.GetCurrentPadding(out pad);
        double now = Clock.NowWall();
        toneLog.Add("{\"frame\":" + f + ",\"writtenWall\":" + Stats.R(now) + ",\"paddingFrames\":" + pad + ",\"clockPlayWall\":" + Stats.R(playWallOf(f)) + "}");
      }
      if (toneFrame >= 0) {
        long k = f - toneFrame;
        if (k < toneLen) {
          double ramp = Math.Min(1.0, Math.Min(k, toneLen - k) / (ep.fmt.rate * 0.002));
          float v = (float)(amp * ramp * Math.Sin(2 * Math.PI * 1000.0 * k / ep.fmt.rate)); buf[i * 2] += v; buf[i * 2 + 1] += v;
        } else toneFrame = -1;
      }
    }
    for (int i = 0; i < frames; i++) for (int c = 0; c < ch; c++) {
      float v = c < 2 ? buf[i * 2 + c] : 0f;
      int off = i * ep.fmt.block + c * (ep.fmt.bits / 8);
      if (ep.fmt.isFloat) Marshal.WriteInt32(data, off, BitConverter.ToInt32(BitConverter.GetBytes(v), 0));
      else if (ep.fmt.bits == 16) Marshal.WriteInt16(data, off, (short)Math.Max(-32768, Math.Min(32767, v * 32767)));
    }
    rc.ReleaseBuffer(frames, 0); framesWritten += frames;
  }
  public void Stop() { run = false; if (th != null) th.Join(500); try { ep.ac.Stop(); } catch { } }
}

class Program {
  static Dictionary<string, string> opts = new Dictionary<string, string>();
  static string Opt(string k, string d) { string v; return opts.TryGetValue(k, out v) ? v : d; }

  static int Main(string[] args) {
    if (args.Length == 0) { Console.Error.WriteLine("usage: vs-audio-probe facts | loop --secs N [--keepalive 0|1] [--tone T,T] [--pcm-out -] | render --secs N [--loopback 0|1]"); return 2; }
    for (int i = 1; i + 1 < args.Length; i += 2) opts[args[i].TrimStart('-')] = args[i + 1];
    Endpoint.DeviceMatch = Opt("device", null);
    try {
      if (args[0] == "facts") return Facts();
      if (args[0] == "loop") return Loop(false);
      if (args[0] == "render") return Loop(true);
    } catch (Exception e) { Console.WriteLine("{\"ok\":false,\"error\":" + Q(e.Message) + "}"); return 1; }
    return 2;
  }
  public static string Q(string s) {
    var b = new StringBuilder("\"");
    foreach (char c in s ?? "") { if (c == '"' || c == '\\') b.Append('\\').Append(c); else if (c < 32) b.Append("\\u").Append(((int)c).ToString("x4")); else b.Append(c); }
    return b.Append('"').ToString();
  }

  static int Facts() {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
    var key = new PROPERTYKEY { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 }; // PKEY_Device_FriendlyName
    var sb = new StringBuilder("{\"ok\":true,\"os\":" + Q(Environment.OSVersion.VersionString) + ",\"endpoints\":[");
    bool first = true;
    for (int flow = 0; flow < 2; flow++) {
      IMMDeviceCollection col; if (en.EnumAudioEndpoints(flow, 0xF, out col) != 0) continue;
      int n; col.GetCount(out n);
      string defId = null; IMMDevice def; if (en.GetDefaultAudioEndpoint(flow, 0, out def) == 0) def.GetId(out defId);
      for (int i = 0; i < n; i++) {
        IMMDevice d; col.Item(i, out d); string id; d.GetId(out id); int state; d.GetState(out state);
        string name = ""; IPropertyStore ps;
        if (d.OpenPropertyStore(0, out ps) == 0) { PROPVARIANT pv; if (ps.GetValue(ref key, out pv) == 0) { if (pv.vt == 31) name = Marshal.PtrToStringUni(pv.p); Native.PropVariantClear(ref pv); } }
        sb.Append(first ? "" : ",").Append("{\"flow\":\"" + (flow == 0 ? "render" : "capture") + "\",\"name\":" + Q(name) + ",\"state\":" + state + ",\"default\":" + (id == defId ? "true" : "false") + "}");
        first = false;
      }
    }
    sb.Append("]");
    var lb = Endpoint.OpenDefaultRender(true, true, false, 1000000);
    sb.Append(",\"loopbackMix\":" + lb.Json());
    var lc = Endpoint.OpenDefaultRender(true, true, true, 1000000);
    sb.Append(",\"loopbackConverted\":" + lc.Json());
    Console.WriteLine(sb.Append("}").ToString());
    return 0;
  }

  /// loop: loopback capture N s (+ our tones / keep-alive / PCM to stdout). render: stdin PCM → the speakers (+ the loopback watch).
  static int Loop(bool intercom) {
    double secs = double.Parse(Opt("secs", "10"), CultureInfo.InvariantCulture);
    bool keepalive = Opt("keepalive", "0") == "1", pcmOut = Opt("pcm-out", "") == "-", convert = Opt("convert", "1") == "1";
    bool watch = !intercom || Opt("loopback", "1") == "1";
    var tones = new List<double>();
    foreach (var t in Opt("tone", "").Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)) tones.Add(double.Parse(t, CultureInfo.InvariantCulture));
    if (tones.Count > 3) throw new Exception("at most 3 test tones a run");
    int activeBefore = -1; string activeErr = null; // before OUR stream exists; on its own MTA thread, never fatal (a counted fact only)
    var tq = new Thread(() => { try { var pre = new Endpoint(); pre.dev = Endpoint.Pick(out pre.name); activeBefore = pre.ActiveSessions(); } catch (Exception e) { activeErr = e.Message; } });
    tq.SetApartmentState(ApartmentState.MTA); tq.Start(); tq.Join();
    var proc = Process.GetCurrentProcess(); TimeSpan cpu0 = proc.TotalProcessorTime; double wallStart = Clock.NowWall();

    // the intercom's input: stdin PCM (s16le 48 kHz stereo) → a queue, each chunk stamped on arrival; its tone onsets found on arrival
    var queue = new Queue<float>(); object qLock = new object(); var inDet = new ToneDetector(48000); long inFrames = 0; var inOnsetWall = new List<double>();
    bool started = false; int prebuffer = int.Parse(Opt("prebuffer-ms", "20")) * 48; long stdinBytes = 0;
    Thread reader = null;
    if (intercom) {
      reader = new Thread(() => {
        var s = Console.OpenStandardInput(); var b = new byte[3840]; int carry = 0; var cb = new byte[4];
        int n;
        while ((n = s.Read(b, 0, b.Length)) > 0) {
          double now = Clock.NowWall(); stdinBytes += n;
          lock (qLock) {
            for (int i = 0; i < n; i++) {
              cb[carry++] = b[i]; if (carry < 4) continue; carry = 0;
              float l = BitConverter.ToInt16(cb, 0) / 32768f, r = BitConverter.ToInt16(cb, 2) / 32768f;
              int before = inDet.onsets.Count; inDet.Push(l, inFrames++); if (inDet.onsets.Count > before) inOnsetWall.Add(now);
              queue.Enqueue(l); queue.Enqueue(r);
            }
          }
        }
      });
      reader.IsBackground = true; reader.Start();
    }

    Renderer ren = null;
    if (keepalive || tones.Count > 0 || intercom) {
      ren = new Renderer(tones.ToArray(), -20);
      if (intercom) ren.pull = (buf, want) => {
        int got = 0;
        lock (qLock) {
          if (!started && queue.Count >= prebuffer * 2) started = true;
          if (!started) return 0;
          while (got < want && queue.Count >= 2) { buf[got * 2] = queue.Dequeue(); buf[got * 2 + 1] = queue.Dequeue(); got++; }
        }
        return got;
      };
      ren.Start();
    }

    Endpoint lb = null; IAudioCaptureClient cc = null; AutoResetEvent ev = null; bool eventMode = true;
    var det = (ToneDetector)null; var st = new Stats(); long packets = 0, frames = 0, silent = 0, disc = 0, tserr = 0, emptyWaits = 0; double firstPacketWall = 0;
    var outStream = pcmOut ? Console.OpenStandardOutput() : null; byte[] ob = new byte[0];
    var perSecond = new StringBuilder(); long secPackets = 0, secFrames = 0, secSilent = 0; double secPeak = 0; double nextSec = 1;
    long t0 = Clock.NowHns();
    if (watch) {
      try { lb = Endpoint.OpenDefaultRender(true, true, convert, 1000000); }
      catch (Exception e) { eventMode = false; Console.Error.WriteLine("{\"eventModeRefused\":" + Q(e.Message) + "}"); lb = Endpoint.OpenDefaultRender(true, false, convert, 1000000); }
      cc = lb.Service<IAudioCaptureClient>("C8ADBD64-E71E-48a0-A4DE-185C395CD317");
      if (eventMode) { ev = new AutoResetEvent(false); Endpoint.Check(lb.ac.SetEventHandle(ev.SafeWaitHandle.DangerousGetHandle()), "SetEventHandle"); }
      det = new ToneDetector(lb.fmt.rate); det.keepSeries = Opt("series", "0") == "1";
      if (pcmOut) Console.Error.WriteLine("{\"pcm\":{\"rate\":" + lb.fmt.rate + ",\"channels\":2,\"fmt\":\"s16le\"},\"startWall\":" + Stats.R(Clock.NowWall()) + "}");
      Endpoint.Check(lb.ac.Start(), "loopback Start");
    }
    var onsetWall = new List<double>(); var seenWall = new List<double>(); float[] L = new float[0], Rr = new float[0];
    while ((Clock.NowHns() - t0) / 1e7 < secs) {
      if (!watch) { Thread.Sleep(50); continue; }
      bool signalled = eventMode ? ev.WaitOne(100) : true;
      if (!eventMode) Thread.Sleep(5);
      if (!signalled) emptyWaits++;
      for (;;) {
        uint next; if (cc.GetNextPacketSize(out next) != 0 || next == 0) break;
        IntPtr data; uint n, flags; ulong devPos, qpc;
        if (cc.GetBuffer(out data, out n, out flags, out devPos, out qpc) != 0) break;
        long nowHns = Clock.NowHns();
        if (packets == 0) firstPacketWall = Clock.WallOfHns(nowHns);
        packets++; secPackets++; frames += n; secFrames += n;
        if ((flags & 2) != 0) { silent++; secSilent++; }
        if ((flags & 1) != 0 && packets > 1) disc++;
        if ((flags & 4) != 0) tserr++;
        else st.delays.Add((nowHns - (long)qpc) / 10000.0 - n * 1000.0 / lb.fmt.rate); // the packet's LAST frame → our hands
        if (pcmOut && ob.Length < n * 4) ob = new byte[n * 4];
        if (L.Length < n) { L = new float[n]; Rr = new float[n]; }
        if ((flags & 2) != 0) { Array.Clear(L, 0, (int)n); Array.Clear(Rr, 0, (int)n); } else lb.fmt.Stereo(data, (int)n, L, Rr);
        for (int i = 0; i < n; i++) {
          float l = L[i], r = Rr[i];
          double a = Math.Abs(l); if (a > secPeak) secPeak = a;
          int before = det.onsets.Count; det.Push(l, (long)devPos + i);
          if (det.onsets.Count > before) { onsetWall.Add(Clock.WallOfHns((long)qpc) + (det.onsets[det.onsets.Count - 1] - (long)devPos) * 1000.0 / lb.fmt.rate); seenWall.Add(Clock.WallOfHns(nowHns)); }
          if (pcmOut) { short sl = (short)Math.Max(-32768, Math.Min(32767, l * 32767)), sr = (short)Math.Max(-32768, Math.Min(32767, r * 32767));
            ob[i * 4] = (byte)sl; ob[i * 4 + 1] = (byte)(sl >> 8); ob[i * 4 + 2] = (byte)sr; ob[i * 4 + 3] = (byte)(sr >> 8); }
        }
        cc.ReleaseBuffer(n);
        if (pcmOut) { outStream.Write(ob, 0, (int)n * 4); outStream.Flush(); }
      }
      double el = (Clock.NowHns() - t0) / 1e7;
      if (el >= nextSec) {
        string line = "{\"t\":" + Stats.R(nextSec) + ",\"packets\":" + secPackets + ",\"frames\":" + secFrames + ",\"silentPackets\":" + secSilent + ",\"peakDb\":" + Stats.R(secPeak > 0 ? 20 * Math.Log10(secPeak) : -999) + "}";
        Console.Error.WriteLine(line); perSecond.Append(perSecond.Length > 0 ? "," : "").Append(line);
        secPackets = secFrames = secSilent = 0; secPeak = 0; nextSec += 1;
      }
    }
    if (watch) lb.ac.Stop();
    if (ren != null) ren.Stop();
    double cpuMs = (proc.TotalProcessorTime - cpu0).TotalMilliseconds, wallMs = Clock.NowWall() - wallStart;
    var sb = new StringBuilder("{\"ok\":true,\"mode\":\"" + (intercom ? "render" : "loop") + "\",\"secs\":" + Stats.R(secs) + ",\"keepalive\":" + (keepalive ? "true" : "false"));
    if (watch) {
      sb.Append(",\"loopback\":" + lb.Json() + ",\"activeSessionsAtStart\":" + activeBefore + (activeErr != null ? ",\"activeSessionsError\":" + Q(activeErr.Length > 80 ? activeErr.Substring(0, 80) : activeErr) : "") + ",\"eventMode\":" + (eventMode ? "true" : "false") + ",\"emptyWaits\":" + emptyWaits);
      sb.Append(",\"packets\":" + packets + ",\"frames\":" + frames + ",\"framesMs\":" + Stats.R(frames * 1000.0 / lb.fmt.rate) + ",\"silentPackets\":" + silent + ",\"discontinuities\":" + disc + ",\"timestampErrors\":" + tserr);
      sb.Append(",\"firstPacketAfterMs\":" + (packets > 0 ? Stats.R(firstPacketWall - Clock.WallOfHns(t0)) : "null") + ",\"deliveryDelayMs\":" + Stats.Pct(st.delays));
      sb.Append(",\"framesPerPacket\":" + (packets > 0 ? Stats.R(frames / (double)packets) : "null") + ",\"toneOnsetsLoopbackWall\":[" + string.Join(",", onsetWall.ConvertAll(Stats.R).ToArray()) + "],\"toneOnsetsSeenWall\":[" + string.Join(",", seenWall.ConvertAll(Stats.R).ToArray()) + "]");
      sb.Append(",\"tonePeakAmp\":" + Stats.R(det.peakAmp) + ",\"perSecond\":[" + perSecond + "]");
      if (det.keepSeries) sb.Append(",\"series1k\":{\"firstFrame\":" + det.seriesFirstFrame + ",\"blockFrames\":" + (int)Math.Round(lb.fmt.rate * 0.002) + ",\"amp\":[" + string.Join(",", det.series.ConvertAll((x) => x.ToString(CultureInfo.InvariantCulture)).ToArray()) + "]}");
    }
    if (ren != null) sb.Append(",\"render\":" + ren.ep.Json() + ",\"renderUnderruns\":" + ren.underruns + ",\"tonesWritten\":[" + string.Join(",", ren.toneLog.ToArray()) + "]");
    if (intercom) sb.Append(",\"stdinBytes\":" + stdinBytes + ",\"toneOnsetsArrivalWall\":[" + string.Join(",", inOnsetWall.ConvertAll(Stats.R).ToArray()) + "]");
    sb.Append(",\"cpuMs\":" + Stats.R(cpuMs) + ",\"wallMs\":" + Stats.R(wallMs) + ",\"cpuPct\":" + Stats.R(100 * cpuMs / wallMs) + "}");
    (pcmOut ? Console.Error : Console.Out).WriteLine(sb.ToString()); // with PCM on stdout the summary is stderr's last line
    return 0;
  }
}
}

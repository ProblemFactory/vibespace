// vs-mic-probe.cs — VibeSpace lane stream-mic-wheel-probe (probe only; nothing in src/ calls it).
//
// THE VIRTUAL MICROPHONE through an existing driver (VB-CABLE): the agent plays the viewer's voice into the cable's RENDER
// side ("CABLE Input") and every application on the machine can pick the cable's CAPTURE side ("CABLE Output") as its
// microphone. This helper measures that road with the in-box Core Audio API (WASAPI over plain COM interop, no third-party
// code of ours):
//   * facts       every endpoint (render + capture, any state) with its id, the default endpoint for each flow x role, and the
//                 cable's formats — what a product reads to say "installed / needs reboot / absent" and what the defaults are;
//   * cable       renders into a render endpoint chosen by name (our own 1 kHz -20 dBFS 200 ms tones, or s16le 48 kHz stereo
//                 PCM from stdin = the intercom road's decoded voice) and CAPTURES a capture endpoint chosen by name with an
//                 ordinary shared-mode capture client (no loopback) — the in-cable latency, sample-accurate on one clock;
//   * setdefault  sets the default endpoint for a role (IPolicyConfig, the interface every audio switcher uses). The probe
//                 never runs it unasked: it exists so the report can print the exact "make CABLE Output the default" and
//                 "restore" commands.
// Guards (cable): refuses when the render endpoint is the default speaker for any role (the owner's own sound would flow into
// the cable and we would read it), or when another session is already playing into it. Captured audio is never written
// anywhere: only onset times, levels and counts leave this process.
//
// Build (in-box .NET Framework 4.8 csc, C# 5):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /optimize /out:vs-mic-probe.exe vs-mic-probe.cs
// Modes:
//   facts
//   cable --secs N --render <name part> [--capture <name part>|-] [--tone T,T…] [--stdin 1] [--prebuffer-ms M]
//   setdefault --id <endpoint id> --role all|console|multimedia|communications --yes 1
// Output: one JSON summary on stdout (stderr carries one JSON line a second).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace VsMicProbe {

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
  [PreserveSig] int GetSession(int index, out IntPtr session); // an IAudioSessionControl*: the RCW cast answers E_NOINTERFACE, so its vtable is called raw
}
[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SessionGetStateFn(IntPtr self, out int state); // IAudioSessionControl slot 3: 0 inactive · 1 active · 2 expired
[ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation {
  [PreserveSig] int GetPeakValue(out float peak);
}
// IPolicyConfig (Windows 7+, undocumented but stable; EarTrumpet / SoundSwitch use the same vtable). Only SetDefaultEndpoint is
// called; the slots before it are placeholders so the vtable lines up.
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class PolicyConfigClient { }
[ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig {
  [PreserveSig] int GetMixFormat(IntPtr a, IntPtr b);
  [PreserveSig] int GetDeviceFormat(IntPtr a, int b, IntPtr c);
  [PreserveSig] int ResetDeviceFormat(IntPtr a);
  [PreserveSig] int SetDeviceFormat(IntPtr a, IntPtr b, IntPtr c);
  [PreserveSig] int GetProcessingPeriod(IntPtr a, int b, IntPtr c, IntPtr d);
  [PreserveSig] int SetProcessingPeriod(IntPtr a, IntPtr b);
  [PreserveSig] int GetShareMode(IntPtr a, IntPtr b);
  [PreserveSig] int SetShareMode(IntPtr a, IntPtr b);
  [PreserveSig] int GetPropertyValue(IntPtr a, IntPtr b, IntPtr c);
  [PreserveSig] int SetPropertyValue(IntPtr a, IntPtr b, IntPtr c);
  [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);
  [PreserveSig] int SetEndpointVisibility(IntPtr a, int b);
}

static class Native {
  [DllImport("kernel32.dll")] public static extern bool QueryPerformanceCounter(out long count);
  [DllImport("kernel32.dll")] public static extern bool QueryPerformanceFrequency(out long freq);
  [DllImport("kernel32.dll")] public static extern void GetSystemTimePreciseAsFileTime(out long fileTime);
  [DllImport("ole32.dll")] public static extern int PropVariantClear(ref PROPVARIANT pv);
  [DllImport("ole32.dll")] public static extern void CoTaskMemFree(IntPtr p);
}

/// One clock for every number: QPC in 100-ns units mapped once to the precise wall clock (Unix ms) — Node's Date.now() and
/// performance.timeOrigin on the same box read the same precise system time, so the legs' stamps compare.
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
  /// WAVE_FORMAT_IEEE_FLOAT, 48 kHz, stereo — asked for with AUTOCONVERTPCM (the engine converts from the endpoint's mix).
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
  float[] raw = new float[0];
  /// The packet's first channel as floats in [-1, 1].
  public void Left(IntPtr data, int n, float[] l) {
    if (isFloat && bits == 32) {
      if (raw.Length < n * channels) raw = new float[n * channels];
      Marshal.Copy(data, raw, 0, n * channels);
      for (int i = 0; i < n; i++) l[i] = raw[i * channels];
      return;
    }
    for (int i = 0; i < n; i++) {
      int off = i * block;
      if (bits == 16) l[i] = Marshal.ReadInt16(data, off) / 32768f;
      else if (bits == 32) l[i] = Marshal.ReadInt32(data, off) / 2147483648f;
      else if (bits == 24) { int b0 = Marshal.ReadByte(data, off), b1 = Marshal.ReadByte(data, off + 1), b2 = (sbyte)Marshal.ReadByte(data, off + 2); l[i] = ((b2 << 16) | (b1 << 8) | b0) / 8388608f; }
      else l[i] = 0;
    }
  }
}

/// A 1 kHz detector over 2 ms blocks (Goertzel): an onset is > 0.02, > 3x the max of the previous 100 ms, 300 ms after the last.
class ToneDetector {
  readonly int n; readonly double coeff; int k; double s1, s2; long blockStartFrame; long lastOnset = long.MinValue / 2;
  readonly double[] hist = new double[50]; int hi;
  public readonly List<long> onsets = new List<long>();
  public double peakAmp;
  public ToneDetector(int rate) { n = Math.Max(16, (int)Math.Round(rate * 0.002)); coeff = 2 * Math.Cos(2 * Math.PI * 1000.0 / rate); }
  public void Push(float x, long frame) {
    if (k == 0) blockStartFrame = frame;
    double s0 = x + coeff * s1 - s2; s2 = s1; s1 = s0; k++;
    if (k < n) return;
    double power = s1 * s1 + s2 * s2 - coeff * s1 * s2; double amp = 2 * Math.Sqrt(Math.Max(0, power)) / n;
    if (amp > peakAmp) peakAmp = amp;
    double baseline = 0; foreach (var h in hist) baseline = Math.Max(baseline, h);
    if (amp > 0.02 && amp > 3 * baseline && blockStartFrame - lastOnset > n * 150) { onsets.Add(blockStartFrame); lastOnset = blockStartFrame; }
    hist[hi] = amp; hi = (hi + 1) % hist.Length;
    k = 0; s1 = s2 = 0;
  }
}

static class Stats {
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
  public string initError, name = "", id = "";
  static Guid IID_IAudioClient = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
  public static PROPERTYKEY NameKey = new PROPERTYKEY { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 }; // PKEY_Device_FriendlyName
  public static IMMDeviceEnumerator En() { return (IMMDeviceEnumerator)new MMDeviceEnumeratorCo(); }
  public static string NameOf(IMMDevice d) {
    string name = ""; IPropertyStore ps;
    if (d.OpenPropertyStore(0, out ps) == 0) { PROPVARIANT pv; if (ps.GetValue(ref NameKey, out pv) == 0) { if (pv.vt == 31) name = Marshal.PtrToStringUni(pv.p); Native.PropVariantClear(ref pv); } }
    return name;
  }
  public static string IdOf(IMMDevice d) { string id; return d.GetId(out id) == 0 ? id : ""; }
  /// The first ACTIVE endpoint of `flow` (0 render, 1 capture) whose friendly name holds `match`.
  public static IMMDevice Pick(int flow, string match, out string name) {
    IMMDeviceCollection col; Check(En().EnumAudioEndpoints(flow, 1, out col), "EnumAudioEndpoints"); int n; col.GetCount(out n);
    for (int i = 0; i < n; i++) { IMMDevice d; col.Item(i, out d); string nm = NameOf(d); if (nm.IndexOf(match, StringComparison.OrdinalIgnoreCase) >= 0) { name = nm; return d; } }
    throw new Exception("no active " + (flow == 0 ? "render" : "capture") + " endpoint named like " + match);
  }
  /// The default endpoint ids of `flow` for the three roles (console, multimedia, communications); "" where none.
  public static string[] DefaultIds(int flow) {
    var r = new string[3]; var en = En();
    for (int role = 0; role < 3; role++) { IMMDevice d; r[role] = en.GetDefaultAudioEndpoint(flow, role, out d) == 0 ? IdOf(d) : ""; }
    return r;
  }
  /// How many audio sessions on the endpoint are ACTIVE right now (other apps playing / recording) — a count only.
  public static int ActiveSessions(IMMDevice d) {
    Guid g = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"); object o;
    if (d.Activate(ref g, 23, IntPtr.Zero, out o) != 0) return -1;
    IAudioSessionEnumerator se; if (((IAudioSessionManager2)o).GetSessionEnumerator(out se) != 0) return -1;
    int n, active = 0; se.GetCount(out n);
    for (int i = 0; i < n; i++) {
      IntPtr c; if (se.GetSession(i, out c) != 0 || c == IntPtr.Zero) continue;
      IntPtr fn = Marshal.ReadIntPtr(Marshal.ReadIntPtr(c), 3 * IntPtr.Size);
      int st; if (((SessionGetStateFn)Marshal.GetDelegateForFunctionPointer(fn, typeof(SessionGetStateFn)))(c, out st) == 0 && st == 1) active++;
      Marshal.Release(c);
    }
    return active;
  }
  /// The endpoint's peak meter now (0..1): non-zero = something is playing into it (render) or arriving on it (capture).
  public static double Peak(IMMDevice d) {
    Guid g = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"); object o;
    if (d.Activate(ref g, 23, IntPtr.Zero, out o) != 0) return -1;
    float p; return ((IAudioMeterInformation)o).GetPeakValue(out p) == 0 ? p : -1;
  }
  /// An event-driven shared-mode IAudioClient on `d` (render or capture; never loopback), 48 kHz float stereo when the engine
  /// converts, else the endpoint's mix format.
  public static Endpoint Open(IMMDevice d, string name, long bufferHns) {
    var e = new Endpoint(); e.dev = d; e.name = name; e.id = IdOf(d);
    object o; Check(e.dev.Activate(ref IID_IAudioClient, 23, IntPtr.Zero, out o), "Activate"); e.ac = (IAudioClient)o;
    Check(e.ac.GetDevicePeriod(out e.defPeriod, out e.minPeriod), "GetDevicePeriod");
    IntPtr mix; Check(e.ac.GetMixFormat(out mix), "GetMixFormat");
    int flags = 0x00040000; // EVENTCALLBACK
    IntPtr want = Fmt.Float48Stereo();
    int hr = e.ac.Initialize(0, flags | unchecked((int)0x80000000) | 0x08000000, bufferHns, 0, want, IntPtr.Zero); // AUTOCONVERTPCM | SRC_DEFAULT_QUALITY
    if (hr == 0) { e.fmt = Fmt.Read(want); e.converted = true; }
    else {
      e.initError = "autoconvert 0x" + hr.ToString("X8");
      Check(e.dev.Activate(ref IID_IAudioClient, 23, IntPtr.Zero, out o), "Activate#2"); e.ac = (IAudioClient)o;
      Check(e.ac.Initialize(0, flags, bufferHns, 0, mix, IntPtr.Zero), "Initialize"); e.fmt = Fmt.Read(mix);
    }
    Marshal.FreeHGlobal(want); Native.CoTaskMemFree(mix);
    e.ac.GetBufferSize(out e.bufferFrames); e.ac.GetStreamLatency(out e.streamLatency);
    return e;
  }
  /// The endpoint's own mix format and periods without starting a stream (facts).
  public static string MixJson(IMMDevice d) {
    object o; if (d.Activate(ref IID_IAudioClient, 23, IntPtr.Zero, out o) != 0) return "null";
    var ac = (IAudioClient)o; IntPtr mix; long dp, mp;
    if (ac.GetMixFormat(out mix) != 0) return "null";
    ac.GetDevicePeriod(out dp, out mp); var f = Fmt.Read(mix); Native.CoTaskMemFree(mix);
    return "{\"mix\":" + f.Json() + ",\"periodMs\":{\"default\":" + Stats.R(dp / 10000.0) + ",\"min\":" + Stats.R(mp / 10000.0) + "}}";
  }
  public T Service<T>(string iid) { Guid g = new Guid(iid); object o; Check(ac.GetService(ref g, out o), "GetService " + typeof(T).Name); return (T)o; }
  public static void Check(int hr, string what) { if (hr != 0) throw new Exception(what + " failed 0x" + hr.ToString("X8")); }
  public string Json() {
    return "{\"endpoint\":" + Program.Q(name) + ",\"format\":" + fmt.Json() + ",\"converted\":" + (converted ? "true" : "false") + (initError != null ? ",\"convertRefused\":\"" + initError + "\"" : "") +
      ",\"periodMs\":{\"default\":" + Stats.R(defPeriod / 10000.0) + ",\"min\":" + Stats.R(minPeriod / 10000.0) + "},\"bufferFrames\":" + bufferFrames +
      ",\"bufferMs\":" + Stats.R(bufferFrames * 1000.0 / fmt.rate) + ",\"streamLatencyMs\":" + Stats.R(streamLatency / 10000.0) + "}";
  }
}

/// Our render stream into the cable: the test tones at given times, or PCM pulled from a queue (the intercom's decoded voice).
class Renderer {
  public Endpoint ep; IAudioRenderClient rc; IAudioClock clock; ulong clockFreq; Thread th; volatile bool run; AutoResetEvent ev;
  public long framesWritten; public int underruns; double[] toneAt; int toneIdx; long toneFrame = -1; long toneLen; long t0;
  public readonly List<string> toneLog = new List<string>();
  public Func<float[], int, int> pull;
  readonly double amp;
  public Renderer(double[] tones, double ampDb) { toneAt = tones ?? new double[0]; amp = Math.Pow(10, ampDb / 20.0); }
  public void Start(Endpoint e) {
    ep = e;
    ev = new AutoResetEvent(false); Endpoint.Check(ep.ac.SetEventHandle(ev.SafeWaitHandle.DangerousGetHandle()), "render SetEventHandle");
    rc = ep.Service<IAudioRenderClient>("F294ACFC-3146-4483-A7BF-ADDCA7C260E2");
    clock = ep.Service<IAudioClock>("CD63314F-3FBA-4a1b-812C-EF96358728E7"); clock.GetFrequency(out clockFreq);
    toneLen = ep.fmt.rate / 5; // 200 ms
    Fill(ep.bufferFrames);
    Endpoint.Check(ep.ac.Start(), "render Start"); t0 = Clock.NowHns(); run = true;
    th = new Thread(Loop); th.IsBackground = true; th.Start();
  }
  double PlayWallOf(long frame) {
    ulong pos, qpc; if (clock.GetPosition(out pos, out qpc) != 0) return double.NaN;
    return Clock.WallOfHns((long)qpc) + (frame - pos * (double)ep.fmt.rate / clockFreq) * 1000.0 / ep.fmt.rate;
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
    double elapsed = t0 == 0 ? 0 : (Clock.NowHns() - t0) / 1e7;
    for (int i = 0; i < frames; i++) {
      long f = framesWritten + i;
      if (toneFrame < 0 && toneIdx < toneAt.Length && t0 != 0 && elapsed >= toneAt[toneIdx]) {
        toneFrame = f; toneIdx++;
        uint pad; ep.ac.GetCurrentPadding(out pad);
        toneLog.Add("{\"frame\":" + f + ",\"writtenWall\":" + Stats.R(Clock.NowWall()) + ",\"paddingFrames\":" + pad + ",\"clockPlayWall\":" + Stats.R(PlayWallOf(f)) + "}");
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

  [MTAThread]
  static int Main(string[] args) {
    if (args.Length == 0) { Console.Error.WriteLine("usage: vs-mic-probe facts | cable --secs N --render <name> [--capture <name>|-] [--tone T,T] [--stdin 1] | setdefault --id <id> --role all|console|multimedia|communications --yes 1"); return 2; }
    for (int i = 1; i + 1 < args.Length; i += 2) opts[args[i].TrimStart('-')] = args[i + 1];
    try {
      if (args[0] == "facts") return Facts();
      if (args[0] == "cable") return Cable();
      if (args[0] == "setdefault") return SetDefault();
    } catch (Exception e) { Console.WriteLine("{\"ok\":false,\"error\":" + Q(e.Message) + "}"); return 1; }
    return 2;
  }
  public static string Q(string s) {
    var b = new StringBuilder("\"");
    foreach (char c in s ?? "") { if (c == '"' || c == '\\') b.Append('\\').Append(c); else if (c < 32 || c > 126) b.Append("\\u").Append(((int)c).ToString("x4")); else b.Append(c); }
    return b.Append('"').ToString();
  }
  static readonly string[] Roles = { "console", "multimedia", "communications" };

  static int Facts() {
    var en = Endpoint.En();
    var sb = new StringBuilder("{\"ok\":true,\"os\":" + Q(Environment.OSVersion.VersionString) + ",\"endpoints\":[");
    bool first = true;
    var defaults = new StringBuilder();
    for (int flow = 0; flow < 2; flow++) {
      string[] defs = Endpoint.DefaultIds(flow);
      IMMDeviceCollection col; if (en.EnumAudioEndpoints(flow, 0xF, out col) != 0) continue;
      int n; col.GetCount(out n);
      var nameOfId = new Dictionary<string, string>();
      for (int i = 0; i < n; i++) {
        IMMDevice d; col.Item(i, out d); string id = Endpoint.IdOf(d); int state; d.GetState(out state);
        string name = Endpoint.NameOf(d); nameOfId[id] = name;
        var roles = new List<string>(); for (int r = 0; r < 3; r++) if (defs[r] == id) roles.Add("\"" + Roles[r] + "\"");
        bool cable = name.IndexOf("CABLE", StringComparison.OrdinalIgnoreCase) >= 0;
        sb.Append(first ? "" : ",").Append("{\"flow\":\"" + (flow == 0 ? "render" : "capture") + "\",\"name\":" + Q(name) + ",\"state\":" + state + ",\"id\":" + Q(id) +
          ",\"defaultFor\":[" + string.Join(",", roles.ToArray()) + "]");
        if (cable && state == 1) sb.Append(",\"format\":" + Endpoint.MixJson(d) + ",\"activeSessions\":" + Endpoint.ActiveSessions(d) + ",\"peak\":" + Stats.R(Endpoint.Peak(d)));
        sb.Append("}");
        first = false;
      }
      defaults.Append(defaults.Length > 0 ? "," : "").Append("\"" + (flow == 0 ? "render" : "capture") + "\":{");
      for (int r = 0; r < 3; r++) { string nm; nameOfId.TryGetValue(defs[r], out nm); defaults.Append((r > 0 ? "," : "") + "\"" + Roles[r] + "\":{\"name\":" + Q(nm) + ",\"id\":" + Q(defs[r]) + "}"); }
      defaults.Append("}");
    }
    sb.Append("],\"defaults\":{").Append(defaults).Append("}}");
    Console.WriteLine(sb.ToString());
    return 0;
  }

  /// cable: our tones (or stdin PCM) into the render endpoint `--render`, read back from the capture endpoint `--capture`.
  static int Cable() {
    double secs = double.Parse(Opt("secs", "4"), CultureInfo.InvariantCulture);
    string renderName = Opt("render", null), captureName = Opt("capture", "-");
    bool fromStdin = Opt("stdin", "0") == "1";
    if (string.IsNullOrEmpty(renderName)) throw new Exception("--render <name part> is required");
    var tones = new List<double>();
    foreach (var t in Opt("tone", "").Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)) tones.Add(double.Parse(t, CultureInfo.InvariantCulture));
    if (tones.Count > 3) throw new Exception("at most 3 test tones a run");

    string rName; IMMDevice rDev = Endpoint.Pick(0, renderName, out rName);
    string rId = Endpoint.IdOf(rDev);
    // GUARD 1: the cable's input must not be a default speaker — the owner's own sound would flow into the cable and be read back
    string[] defs = Endpoint.DefaultIds(0);
    for (int r = 0; r < 3; r++) if (defs[r] == rId) throw new Exception("refused: " + rName + " is the default " + Roles[r] + " speaker: the machine's own sound flows into it");
    // GUARD 2: nobody else plays into it right now
    int othersPlaying = Endpoint.ActiveSessions(rDev); double peakBefore = Endpoint.Peak(rDev);
    if (othersPlaying > 0 || peakBefore > 0.001) throw new Exception("refused: something is playing into " + rName + " (" + othersPlaying + " active session(s), peak " + Stats.R(peakBefore) + ")");

    var proc = Process.GetCurrentProcess(); TimeSpan cpu0 = proc.TotalProcessorTime; double wallStart = Clock.NowWall();

    // the intercom's input: stdin PCM (s16le 48 kHz stereo) → a queue, each chunk stamped on arrival, tone onsets found on arrival
    var queue = new Queue<float>(); object qLock = new object(); var inDet = new ToneDetector(48000); long inFrames = 0; var inOnsetWall = new List<double>();
    bool started = false; int prebuffer = int.Parse(Opt("prebuffer-ms", "20")) * 48; long stdinBytes = 0;
    if (fromStdin) {
      var reader = new Thread(() => {
        var s = Console.OpenStandardInput(); var b = new byte[3840]; int carry = 0; var cb = new byte[4]; int n;
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

    // the capture side first, so the first tone is never missed
    Endpoint cap = null; IAudioCaptureClient cc = null; AutoResetEvent ev = null; ToneDetector det = null;
    if (captureName != "-") {
      string cName; IMMDevice cDev = Endpoint.Pick(1, captureName, out cName);
      cap = Endpoint.Open(cDev, cName, 200000);
      cc = cap.Service<IAudioCaptureClient>("C8ADBD64-E71E-48a0-A4DE-185C395CD317");
      ev = new AutoResetEvent(false); Endpoint.Check(cap.ac.SetEventHandle(ev.SafeWaitHandle.DangerousGetHandle()), "capture SetEventHandle");
      det = new ToneDetector(cap.fmt.rate);
      Endpoint.Check(cap.ac.Start(), "capture Start");
    }

    var ren = new Renderer(tones.ToArray(), -20);
    if (fromStdin) ren.pull = (buf, want) => {
      int got = 0;
      lock (qLock) {
        if (!started && queue.Count >= prebuffer * 2) started = true;
        if (!started) return 0;
        while (got < want && queue.Count >= 2) { buf[got * 2] = queue.Dequeue(); buf[got * 2 + 1] = queue.Dequeue(); got++; }
      }
      return got;
    };
    ren.Start(Endpoint.Open(rDev, rName, 0));

    long packets = 0, frames = 0, silent = 0, disc = 0, tserr = 0, emptyWaits = 0; double firstPacketWall = 0; var delays = new List<double>();
    var onsetWall = new List<double>(); var seenWall = new List<double>(); float[] L = new float[0];
    var perSecond = new StringBuilder(); long secPackets = 0; double secPeak = 0; double nextSec = 1;
    long t0 = Clock.NowHns();
    while ((Clock.NowHns() - t0) / 1e7 < secs) {
      if (cap == null) { Thread.Sleep(50); continue; }
      if (!ev.WaitOne(100)) emptyWaits++;
      for (;;) {
        uint next; if (cc.GetNextPacketSize(out next) != 0 || next == 0) break;
        IntPtr data; uint n, flags; ulong devPos, qpc;
        if (cc.GetBuffer(out data, out n, out flags, out devPos, out qpc) != 0) break;
        long nowHns = Clock.NowHns();
        if (packets == 0) firstPacketWall = Clock.WallOfHns(nowHns);
        packets++; secPackets++; frames += n;
        if ((flags & 2) != 0) silent++;
        if ((flags & 1) != 0 && packets > 1) disc++;
        if ((flags & 4) != 0) tserr++; else delays.Add((nowHns - (long)qpc) / 10000.0 - n * 1000.0 / cap.fmt.rate);
        if (L.Length < n) L = new float[n];
        if ((flags & 2) != 0) Array.Clear(L, 0, (int)n); else cap.fmt.Left(data, (int)n, L);
        for (int i = 0; i < n; i++) {
          double a = Math.Abs(L[i]); if (a > secPeak) secPeak = a;
          int before = det.onsets.Count; det.Push(L[i], (long)devPos + i);
          if (det.onsets.Count > before) { onsetWall.Add(Clock.WallOfHns((long)qpc) + (det.onsets[det.onsets.Count - 1] - (long)devPos) * 1000.0 / cap.fmt.rate); seenWall.Add(Clock.WallOfHns(nowHns)); }
        }
        cc.ReleaseBuffer(n);
      }
      double el = (Clock.NowHns() - t0) / 1e7;
      if (el >= nextSec) {
        string line = "{\"t\":" + Stats.R(nextSec) + ",\"packets\":" + secPackets + ",\"peakDb\":" + Stats.R(secPeak > 0 ? 20 * Math.Log10(secPeak) : -999) + "}";
        Console.Error.WriteLine(line); perSecond.Append(perSecond.Length > 0 ? "," : "").Append(line);
        secPackets = 0; secPeak = 0; nextSec += 1;
      }
    }
    if (cap != null) cap.ac.Stop();
    ren.Stop();
    double cpuMs = (proc.TotalProcessorTime - cpu0).TotalMilliseconds, wallMs = Clock.NowWall() - wallStart;
    var sb = new StringBuilder("{\"ok\":true,\"mode\":\"cable\",\"secs\":" + Stats.R(secs) + ",\"input\":\"" + (fromStdin ? "stdin-pcm" : "tones") + "\",\"render\":" + ren.ep.Json() +
      ",\"renderUnderruns\":" + ren.underruns + ",\"tonesWritten\":[" + string.Join(",", ren.toneLog.ToArray()) + "]");
    if (fromStdin) sb.Append(",\"stdinBytes\":" + stdinBytes + ",\"toneOnsetsArrivalWall\":[" + string.Join(",", inOnsetWall.ConvertAll(Stats.R).ToArray()) + "]");
    if (cap != null) {
      sb.Append(",\"capture\":" + cap.Json() + ",\"packets\":" + packets + ",\"frames\":" + frames + ",\"framesPerPacket\":" + (packets > 0 ? Stats.R(frames / (double)packets) : "null") +
        ",\"silentPackets\":" + silent + ",\"discontinuities\":" + disc + ",\"timestampErrors\":" + tserr + ",\"emptyWaits\":" + emptyWaits +
        ",\"firstPacketAfterMs\":" + (packets > 0 ? Stats.R(firstPacketWall - Clock.WallOfHns(t0)) : "null") + ",\"deliveryDelayMs\":" + Stats.Pct(delays) +
        ",\"toneOnsetsCaptureWall\":[" + string.Join(",", onsetWall.ConvertAll(Stats.R).ToArray()) + "],\"toneOnsetsSeenWall\":[" + string.Join(",", seenWall.ConvertAll(Stats.R).ToArray()) + "]" +
        ",\"tonePeakAmp\":" + Stats.R(det.peakAmp) + ",\"perSecond\":[" + perSecond + "]");
    }
    sb.Append(",\"cpuMs\":" + Stats.R(cpuMs) + ",\"wallMs\":" + Stats.R(wallMs) + ",\"cpuPct\":" + Stats.R(100 * cpuMs / wallMs) + "}");
    Console.WriteLine(sb.ToString());
    return 0;
  }

  /// setdefault: IPolicyConfig.SetDefaultEndpoint for one role or all three. Only with --yes 1 (the report prints the command).
  static int SetDefault() {
    string id = Opt("id", null), role = Opt("role", "all");
    if (string.IsNullOrEmpty(id)) throw new Exception("--id <endpoint id> is required (vs-mic-probe facts lists them)");
    if (Opt("yes", "0") != "1") throw new Exception("refused without --yes 1: this changes the machine's default audio device");
    IMMDevice d; Endpoint.Check(Endpoint.En().GetDevice(id, out d), "GetDevice");
    var pc = (IPolicyConfig)new PolicyConfigClient();
    var done = new List<string>();
    for (int r = 0; r < 3; r++) {
      if (role != "all" && role != Roles[r]) continue;
      Endpoint.Check(pc.SetDefaultEndpoint(id, r), "SetDefaultEndpoint " + Roles[r]); done.Add("\"" + Roles[r] + "\"");
    }
    Console.WriteLine("{\"ok\":true,\"endpoint\":" + Q(Endpoint.NameOf(d)) + ",\"roles\":[" + string.Join(",", done.ToArray()) + "]}");
    return 0;
  }
}
}

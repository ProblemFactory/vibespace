// vibespace-wgc — ONE application window of this Windows machine as raw frames (lane stream-p2w-build; design q-041 r3 §3
// P2w; the measured facts: lane stream-p2w-capture-probe's report). Windows.Graphics.Capture by HWND, C# 5 for the in-box
// csc of .NET Framework 4.8: the VibeSpace agent builds it ON THIS MACHINE (src/agentd/stream-window-source.js, the recipe
// in src/stream-plan.js wgcBuildPlan) into %LOCALAPPDATA%\vibespace\helpers\ — the source ships, never a binary. It sends
// no input, makes no display and never minimizes, hides, moves or raises a window. Commands:
//   facts [--hwnd H]   the visible top-level windows, one JSON line each (hwnd pid exe cls title display dpi (the display's) winDpi
//                      frame min cloaked tool owner elevated capturable), then {"ev":"facts"}; --hwnd = that one window (gone: {"ev":"gone"})
//   capture --hwnd H [--fmt bgra|f16] [--fps F] [--interval MS] [--cursor 1]
//                      frames on stdout F times a second, each = a 16-byte head ("VSWF", u32 w, u32 h, u16 flags (1 = a new
//                      picture since the last one, 0 = the last one again), u8 bytes per pixel, u8 0) + w × h tight rows
//                      (w, h even); the NEWEST picture wins (a slow reader drops pictures, never queues them); 64 KiB writes.
//                      --interval = MinUpdateInterval (Windows 11 24H2+). stderr: one JSON line per event — open, size (the
//                      frame pool was recreated: the next frames have the new size), window (min / frame / display / dpi /
//                      covered changed), stats (each second), gone, error, end (why + code: the capture session is
//                      disposed — the window released). Ends when stdin closes (0), the window is gone (3) or on an error (1)
// Every JSON line is ASCII: a character past 0x7E is written \uXXXX (lane stream-window-fixes — the console's OEM code page,
// 936 on a Chinese Windows, turned every CJK title into U+FFFD for the agent, which reads UTF-8); the lines go out through a
// UTF-8 writer without a BOM.
//   restore --hwnd H   ShowWindow(SW_SHOWNOACTIVATE): a minimized window comes back without taking the focus
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using System.Threading;
using Windows.Foundation;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
[ComImport, Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IGraphicsCaptureItemInterop { IntPtr CreateForWindow(IntPtr window, [In] ref Guid iid); IntPtr CreateForMonitor(IntPtr monitor, [In] ref Guid iid); }
[ComImport, Guid("A9B3D012-3DF2-4EE3-B8D1-8695F457D3C1"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDirect3DDxgiInterfaceAccess { IntPtr GetInterface([In] ref Guid iid); }

static class W {
  [StructLayout(LayoutKind.Sequential)] struct TexDesc { public uint W, H, Mips, Array, Format, SCount, SQuality, Usage, Bind, Cpu, Misc; } [StructLayout(LayoutKind.Sequential)] struct Mapped { public IntPtr Data; public uint RowPitch, DepthPitch; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; } [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct MONINFO { public int Size; public RECT Mon, Work; public uint Flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Device; }
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateTex2DFn(IntPtr self, ref TexDesc d, IntPtr init, out IntPtr tex); [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void GetDescFn(IntPtr self, out TexDesc d);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void CopyResFn(IntPtr self, IntPtr dst, IntPtr src);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int MapFn(IntPtr self, IntPtr res, uint sub, int type, uint flags, out Mapped m);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void UnmapFn(IntPtr self, IntPtr res, uint sub);
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("d3d11.dll")] static extern int D3D11CreateDevice(IntPtr adapter, int type, IntPtr sw, uint flags, IntPtr levels, uint n, uint sdk, out IntPtr dev, out int level, out IntPtr ctx);
  [DllImport("d3d11.dll")] static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgi, out IntPtr inspectable); [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l); [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f); [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MONINFO i);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd); [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr m, int type, out uint x, out uint y);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i); [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p); [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int size); [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid); [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr p, int flags, StringBuilder name, ref int size);
  [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr p, uint access, out IntPtr tok); [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr tok, int cls, out int v, int size, out int ret);
  static readonly Dictionary<string, string> A = new Dictionary<string, string>();
  static string Arg(string k, string d) { string v; return A.TryGetValue(k, out v) ? v : d; }
  static int ArgI(string k, int d) { int v; return int.TryParse(Arg(k, ""), NumberStyles.Integer, CultureInfo.InvariantCulture, out v) ? v : d; }
  static TextWriter Log;
  static readonly object LogLock = new object();
  static void Say(Js j) { lock (LogLock) { Log.WriteLine(j.ToString()); Log.Flush(); } }
  class Js {
    readonly StringBuilder b = new StringBuilder("{");
    Js K(string k) { if (b.Length > 1) b.Append(','); b.Append('"').Append(k).Append("\":"); return this; }
    public Js S(string k, string v) { K(k); if (v == null) b.Append("null"); else Q(b, v); return this; }
    public Js N(string k, double v) { K(k); if (double.IsNaN(v) || double.IsInfinity(v)) b.Append("null"); else b.Append(v.ToString("0.###", CultureInfo.InvariantCulture)); return this; }
    public Js B(string k, bool v) { K(k); b.Append(v ? "true" : "false"); return this; }
    public Js R(string k, string raw) { K(k); b.Append(raw); return this; }
    public override string ToString() { return b.ToString() + "}"; }
  }
  static void Q(StringBuilder b, string s) {
    b.Append('"');
    foreach (char c in s) { if (c == '"' || c == '\\') b.Append('\\').Append(c); else if (c < 0x20 || c > 0x7e) b.Append("\\u").Append(((int)c).ToString("x4")); else b.Append(c); }
    b.Append('"');
  }
  static string Rc(RECT r) { return "[" + r.L + "," + r.T + "," + r.R + "," + r.B + "]"; }
  static string Hx(Exception e) { return "0x" + e.HResult.ToString("X8") + " " + e.Message.Trim(); }
  static void Check(int hr, string what) { if (hr < 0) throw new Exception(what + " failed 0x" + hr.ToString("X8")); }
  static T Vt<T>(IntPtr obj, int slot) where T : class { return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), slot * IntPtr.Size), typeof(T)); }
  static double Median(List<double> a) { if (a.Count == 0) return double.NaN; var c = new List<double>(a); c.Sort(); return c[c.Count / 2]; }

  // ── the window's facts ──
  static IGraphicsCaptureItemInterop Interop;
  static GraphicsCaptureItem ItemFor(IntPtr hwnd) {
    if (Interop == null) Interop = (IGraphicsCaptureItemInterop)WindowsRuntimeMarshal.GetActivationFactory(typeof(GraphicsCaptureItem));
    Guid iid = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
    IntPtr p = Interop.CreateForWindow(hwnd, ref iid);
    try { return (GraphicsCaptureItem)Marshal.GetObjectForIUnknown(p); } finally { Marshal.Release(p); }
  }
  static void ProcFacts(uint pid, Js j) {
    IntPtr p = OpenProcess(0x1000, false, pid); if (p == IntPtr.Zero) { j.R("exe", "null").R("elevated", "null"); return; }
    try {
      var sb = new StringBuilder(520); int n = sb.Capacity; j.S("exe", QueryFullProcessImageName(p, 0, sb, ref n) ? sb.ToString() : null);
      IntPtr t; int v, r; if (OpenProcessToken(p, 8, out t)) { try { j.R("elevated", GetTokenInformation(t, 20, out v, 4, out r) ? (v != 0 ? "true" : "false") : "null"); } finally { CloseHandle(t); } } else j.R("elevated", "null");
    } finally { CloseHandle(p); }
  }
  static bool FrameOf(IntPtr h, out RECT fr) { return DwmGetWindowAttribute(h, 9, out fr, 16) == 0; }
  static string DisplayOf(IntPtr h) { var mi = new MONINFO(); mi.Size = Marshal.SizeOf(typeof(MONINFO)); return GetMonitorInfo(MonitorFromWindow(h, 2), ref mi) ? mi.Device : null; }
  /** The DISPLAY's scale (its effective DPI): a DPI-unaware window reads 96 from GetDpiForWindow while DWM draws it — and WGC
   *  captures it — at the display's scale (measured: 800×520 logical ⇒ a 1376×898 frame at 175 %). 0 = unknown. */
  static uint DpiOf(IntPtr h) { uint x, y; return GetDpiForMonitor(MonitorFromWindow(h, 2), 0, out x, out y) == 0 ? x : 0; }
  static string ClassOf(IntPtr h) { var cls = new StringBuilder(256); GetClassName(h, cls, 256); return cls.ToString(); }
  /** No sampled point of the window (its centre and four inner points) is its own on the screen: something covers it. */
  static bool Covered(IntPtr h, RECT f) {
    int w = f.R - f.L, hh = f.B - f.T; if (w <= 0 || hh <= 0) return true;
    int[] fx = { 2, 1, 3, 1, 3 }, fy = { 2, 1, 1, 3, 3 };
    for (int i = 0; i < 5; i++) { POINT p; p.X = f.L + w * fx[i] / 4; p.Y = f.T + hh * fy[i] / 4; IntPtr at = WindowFromPoint(p); if (at != IntPtr.Zero && GetAncestor(at, 2) == h) return false; }
    return true;
  }
  static Js Row(IntPtr h, bool tryItem) {
    uint pid; GetWindowThreadProcessId(h, out pid);
    RECT fr; bool hasFrame = FrameOf(h, out fr); int cloak; if (DwmGetWindowAttribute(h, 14, out cloak, 4) != 0) cloak = -1;
    int ex = GetWindowLong(h, -20); var t = new StringBuilder(512); GetWindowText(h, t, 512);
    var j = new Js().S("ev", "window").S("hwnd", h.ToString()).N("pid", pid).S("cls", ClassOf(h)).S("title", t.ToString());
    ProcFacts(pid, j);
    bool min = IsIconic(h), tool = (ex & 0x80) != 0; string owner = GetWindow(h, 4).ToString();
    j.B("visible", IsWindowVisible(h)).B("min", min).N("cloaked", cloak).B("tool", tool).S("owner", owner).R("frame", hasFrame ? Rc(fr) : "null").N("dpi", DpiOf(h)).N("winDpi", GetDpiForWindow(h)).S("display", DisplayOf(h));
    bool candidate = hasFrame && cloak == 0 && !tool && owner == "0" && (min || (fr.R - fr.L >= 64 && fr.B - fr.T >= 64));
    if (!tryItem || !candidate) return j.R("capturable", "null");
    try { var it = ItemFor(h); return j.B("capturable", it.Size.Width > 0 && it.Size.Height > 0); } catch (Exception e) { return j.B("capturable", false).S("refused", Hx(e)); }
  }
  static int Facts(IntPtr only) {
    var sw = Stopwatch.StartNew(); int n = 0;
    if (only != IntPtr.Zero) { if (!IsWindow(only)) { Say(new Js().S("ev", "gone").S("hwnd", only.ToString())); return 3; } Say(Row(only, true)); n = 1; }
    else EnumWindows(delegate (IntPtr h, IntPtr l) { if (IsWindowVisible(h)) { Say(Row(h, true)); n++; } return true; }, IntPtr.Zero);
    Say(new Js().S("ev", "facts").N("n", n).N("ms", sw.Elapsed.TotalMilliseconds));
    return 0;
  }

  // ── D3D11 + the WinRT device the frame pool needs; a frame → tight even rows ──
  static IntPtr Dev, Ctx, Staging; static TexDesc SDesc; static IDirect3DDevice WDev; static int Bpp = 4;
  static void InitD3D() {
    int lvl; Check(D3D11CreateDevice(IntPtr.Zero, 1, IntPtr.Zero, 0x20, IntPtr.Zero, 0, 7, out Dev, out lvl, out Ctx), "D3D11CreateDevice");
    Guid g = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c"); IntPtr dxgi; Check(Marshal.QueryInterface(Dev, ref g, out dxgi), "QueryInterface(IDXGIDevice)");
    IntPtr insp; Check(CreateDirect3D11DeviceFromDXGIDevice(dxgi, out insp), "CreateDirect3D11DeviceFromDXGIDevice");
    WDev = (IDirect3DDevice)Marshal.GetObjectForIUnknown(insp); Marshal.Release(insp); Marshal.Release(dxgi);
  }
  static double CopyInto(Direct3D11CaptureFrame fr, ref byte[] buf, int outW, int outH) {
    var t0 = Stopwatch.StartNew();
    var access = (IDirect3DDxgiInterfaceAccess)(object)fr.Surface;
    Guid g = new Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c");
    IntPtr tex = access.GetInterface(ref g);
    try {
      TexDesc d; Vt<GetDescFn>(tex, 10)(tex, out d);
      if (Staging == IntPtr.Zero || SDesc.W != d.W || SDesc.H != d.H || SDesc.Format != d.Format) {
        if (Staging != IntPtr.Zero) Marshal.Release(Staging);
        TexDesc s = d; s.Mips = 1; s.Array = 1; s.SCount = 1; s.SQuality = 0; s.Usage = 3; s.Bind = 0; s.Cpu = 0x20000; s.Misc = 0;
        Check(Vt<CreateTex2DFn>(Dev, 5)(Dev, ref s, IntPtr.Zero, out Staging), "CreateTexture2D(staging)"); SDesc = s;
      }
      Vt<CopyResFn>(Ctx, 47)(Ctx, Staging, tex);
      Mapped m; Check(Vt<MapFn>(Ctx, 14)(Ctx, Staging, 0, 1, 0, out m), "Map");
      int w = Math.Min((int)d.W, outW), h = Math.Min((int)d.H, outH), row = outW * Bpp;
      if (buf == null || buf.Length != row * outH) buf = new byte[row * outH];
      for (int y = 0; y < h; y++) Marshal.Copy(new IntPtr(m.Data.ToInt64() + (long)y * m.RowPitch), buf, y * row, w * Bpp);
      Vt<UnmapFn>(Ctx, 15)(Ctx, Staging, 0);
      return t0.Elapsed.TotalMilliseconds;
    } finally { Marshal.Release(tex); }
  }

  // ── capture: the frame pool fills `back`, the writer sends `front` at a fixed rate ──
  static GraphicsCaptureItem Item; static Direct3D11CaptureFramePool Pool; static GraphicsCaptureSession Sess; static DirectXPixelFormat Fmt;
  static int PoolW, PoolH, BackW, BackH; static byte[] Back; static bool Fresh; static long Arrived, Resized, Skipped;
  static readonly object FrameLock = new object(); static readonly List<double> Copies = new List<double>();
  static void OnFrame(Direct3D11CaptureFramePool pool, object o) {
    lock (FrameLock) {
      using (var fr = pool.TryGetNextFrame()) {
        if (fr == null) return;
        Arrived++;
        if (fr.ContentSize.Width != PoolW || fr.ContentSize.Height != PoolH) { // the window changed size: this frame is clipped in the old pool — the next one is whole
          Resized++; PoolW = fr.ContentSize.Width; PoolH = fr.ContentSize.Height; Skipped++;
          pool.Recreate(WDev, Fmt, 2, fr.ContentSize);
          Say(new Js().S("ev", "size").N("w", PoolW & ~1).N("h", PoolH & ~1).N("bpp", Bpp));
          return;
        }
        int w = PoolW & ~1, h = PoolH & ~1; if (w < 2 || h < 2) return;
        try { if (Copies.Count >= 120) Copies.RemoveAt(0); Copies.Add(CopyInto(fr, ref Back, w, h)); BackW = w; BackH = h; Fresh = true; } catch (Exception e) { Say(new Js().S("ev", "frame-error").S("error", Hx(e))); }
      }
    }
  }
  static volatile bool StdinClosed;
  static int Capture(IntPtr hwnd) {
    if (!IsWindow(hwnd)) { Say(new Js().S("ev", "gone").S("hwnd", hwnd.ToString())); return 3; }
    int fps = Math.Max(1, Math.Min(120, ArgI("--fps", 30))), chunk = 65536;
    Fmt = Arg("--fmt", "bgra") == "f16" ? DirectXPixelFormat.R16G16B16A16Float : DirectXPixelFormat.B8G8R8A8UIntNormalized;
    Bpp = Fmt == DirectXPixelFormat.R16G16B16A16Float ? 8 : 4;
    InitD3D(); Item = ItemFor(hwnd); PoolW = Item.Size.Width; PoolH = Item.Size.Height;
    Pool = Direct3D11CaptureFramePool.CreateFreeThreaded(WDev, Fmt, 2, Item.Size);
    Sess = Pool.CreateCaptureSession(Item);
    var open = new Js().S("ev", "open").S("hwnd", hwnd.ToString()).N("w", PoolW & ~1).N("h", PoolH & ~1).N("bpp", Bpp).N("fps", fps).S("cls", ClassOf(hwnd));
    try { Sess.IsCursorCaptureEnabled = Arg("--cursor", "0") == "1"; open.B("cursor", Sess.IsCursorCaptureEnabled); } catch (Exception e) { open.S("cursorErr", Hx(e)); }
#if BORDER
    open.S("borderless", Borderless());
    try { Sess.IsBorderRequired = false; open.B("border", Sess.IsBorderRequired); } catch (Exception e) { open.S("borderErr", Hx(e)); }
#endif
#if MINUPDATE
    if (ArgI("--interval", 0) > 0) { try { Sess.MinUpdateInterval = TimeSpan.FromMilliseconds(ArgI("--interval", 0)); open.N("intervalMs", Sess.MinUpdateInterval.TotalMilliseconds); } catch (Exception e) { open.S("intervalErr", Hx(e)); } }
#endif
    bool closed = false; Item.Closed += delegate { closed = true; };
    Pool.FrameArrived += OnFrame;
    Sess.StartCapture();
    Say(open);
    var reader = new Thread(delegate () { try { var s = Console.OpenStandardInput(); var b = new byte[256]; while (s.Read(b, 0, b.Length) > 0) { } } catch (Exception) { } StdinClosed = true; });
    reader.IsBackground = true; reader.Start();
    var stdout = Console.OpenStandardOutput(); var head = new byte[16]; head[0] = (byte)'V'; head[1] = (byte)'S'; head[2] = (byte)'W'; head[3] = (byte)'F';
    byte[] front = null; int frontW = 0, frontH = 0; long written = 0, repeats = 0, tick = 0, lastWatch = -1000, lastStats = 0, a0 = 0; string seen = null; int code = 0;
    var sw = Stopwatch.StartNew(); var writes = new List<double>();
    while (!StdinClosed) {
      long now = sw.ElapsedMilliseconds;
      if (now - lastWatch >= 100) { // the window's own state: gone, minimized, moved, covered
        lastWatch = now;
        if (closed || !IsWindow(hwnd)) { Say(new Js().S("ev", "gone").S("hwnd", hwnd.ToString())); code = 3; break; }
        RECT f; bool hasFrame = FrameOf(hwnd, out f); bool min = IsIconic(hwnd);
        string disp = DisplayOf(hwnd); uint dpi = DpiOf(hwnd); bool cov = !min && hasFrame && Covered(hwnd, f);
        string key = min + "|" + (hasFrame ? Rc(f) : "-") + "|" + disp + "|" + dpi + "|" + cov;
        if (key != seen) { seen = key; Say(new Js().S("ev", "window").B("min", min).R("frame", hasFrame ? Rc(f) : "null").S("display", disp).N("dpi", dpi).B("covered", cov)); }
      }
      if (now - lastStats >= 1000) { lastStats = now; long a; double c; lock (FrameLock) { a = Arrived; c = Median(Copies); } Say(new Js().S("ev", "stats").N("arrived", a - a0).N("written", written).N("repeats", repeats).N("resized", Resized).N("copyP50", c).N("writeP50", Median(writes))); a0 = a; written = 0; repeats = 0; writes.Clear(); }
      long due = tick * 1000 / fps; if (now < due) { Thread.Sleep((int)Math.Min(due - now, 5)); continue; }
      tick = now * fps / 1000 + 1;
      bool fresh;
      lock (FrameLock) {
        fresh = Fresh;
        if (fresh) { var t = front; front = Back; Back = t; frontW = BackW; frontH = BackH; Fresh = false; }
      }
      if (front == null || front.Length != frontW * frontH * Bpp) continue; // nothing yet (a minimized window sends nothing)
      if (!fresh) repeats++;
      PutU32(head, 4, (uint)frontW); PutU32(head, 8, (uint)frontH); head[12] = (byte)(fresh ? 1 : 0); head[13] = 0; head[14] = (byte)Bpp; head[15] = 0;
      var w0 = Stopwatch.StartNew();
      try { stdout.Write(head, 0, 16); for (int o = 0; o < front.Length; o += chunk) stdout.Write(front, o, Math.Min(chunk, front.Length - o)); stdout.Flush(); } catch (IOException) { break; } // the reader is gone
      writes.Add(w0.Elapsed.TotalMilliseconds); if (writes.Count > 240) writes.RemoveAt(0); written++;
    }
    try { Pool.FrameArrived -= OnFrame; Sess.Dispose(); Pool.Dispose(); } catch (Exception) { }
    Say(new Js().S("ev", "end").S("why", code == 3 ? "gone" : StdinClosed ? "stdin" : "reader").N("code", code)); // the window is released
    return code;
  }
  static void PutU32(byte[] b, int at, uint v) { b[at] = (byte)v; b[at + 1] = (byte)(v >> 8); b[at + 2] = (byte)(v >> 16); b[at + 3] = (byte)(v >> 24); }
#if BORDER
  static string Borderless() {
    try {
      var op = GraphicsCaptureAccess.RequestAccessAsync(GraphicsCaptureAccessKind.Borderless);
      var w = Stopwatch.StartNew();
      while (op.Status == AsyncStatus.Started && w.ElapsedMilliseconds < 5000) Thread.Sleep(10);
      return op.Status == AsyncStatus.Completed ? op.GetResults().ToString() : "status " + op.Status;
    } catch (Exception e) { return "error " + Hx(e); }
  }
#endif

  [MTAThread]
  static int Main(string[] argv) {
    for (int i = 1; i < argv.Length; i++) { if (argv[i].StartsWith("--")) { A[argv[i]] = i + 1 < argv.Length && !argv[i + 1].StartsWith("--") ? argv[i + 1] : "1"; } }
    string mode = argv.Length > 0 ? argv[0] : "";
    Log = new StreamWriter(mode == "capture" ? Console.OpenStandardError() : Console.OpenStandardOutput(), new UTF8Encoding(false)); // capture: stdout carries the frames
    SetProcessDpiAwarenessContext(new IntPtr(-4)); // per-monitor v2: every rectangle in physical pixels, like the frames
    long hv; IntPtr hwnd = new IntPtr(long.TryParse(Arg("--hwnd", "0"), NumberStyles.Integer, CultureInfo.InvariantCulture, out hv) ? hv : 0);
    try {
      if (mode == "facts") return Facts(hwnd);
      if (mode == "capture") return Capture(hwnd);
      if (mode == "restore") { if (!IsWindow(hwnd)) { Say(new Js().S("ev", "gone").S("hwnd", hwnd.ToString())); return 3; } ShowWindow(hwnd, 4); Thread.Sleep(300); Say(Row(hwnd, false).S("did", "restore")); return 0; }
      Console.Error.WriteLine("usage: vibespace-wgc facts [--hwnd H] | capture --hwnd H [--fmt bgra|f16] [--fps F] [--interval MS] [--cursor 1] | restore --hwnd H"); return 2;
    } catch (Exception e) { Say(new Js().S("ev", "error").S("mode", mode).S("error", Hx(e))); return 1; }
  }
}

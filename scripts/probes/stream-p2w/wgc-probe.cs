// wgc-probe — lane stream-p2w-capture-probe (design q-041 r3 §3 P2w-0, the capture half): Windows.Graphics.Capture facts for
// ONE window the lane opened itself. C# 5 for the in-box csc of .NET Framework 4.8 (build.ps1 holds the recipe). Every line
// printed is JSON. Nothing here injects input, makes a display or hides a window. Modes:
//   list  [--own pid,..] [--hwnds h,..] [--try 1]   top-level windows (hwnd pid process class rects display dpi state); titles
//         only for --own/--hwnds windows; --try = CreateForWindow (an item only: no session/frame/border) on those, the shell's
//         windows, the Desktop, a never-shown and a message-only window of this process
//   grab  --hwnd H --fmt f16|bgra [--frames N] [--wait MS] [--out PREFIX] [--border 0|1] [--cursor 0|1] [--min-ms M]
//         frames → PREFIX-<i>.raw (tight rows, no pitch) + one JSON line per frame
//   rate  --hwnd H --fmt f16|bgra --seconds S [--read 0|1] [--min-ms M]    frames/s, gaps, copy ms, this process's CPU
//   pipe  --hwnd H --fmt f16|bgra --fps F --seconds S [--chunk B=65536; 0 = one write]  the NEWEST frame at a FIXED rate on stdout (W×H×bpp per frame, the size
//         of the first frame — the shape ffmpeg #1 hands the agent's mapped road); facts on stderr
//   place --hwnd H --x X --y Y --w W --h H [--z top|bottom] | show --hwnd H --state min|restore (no activation; lane windows)
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

static class P {
  [StructLayout(LayoutKind.Sequential)] struct TexDesc { public uint W, H, Mips, Array, Format, SCount, SQuality, Usage, Bind, Cpu, Misc; } [StructLayout(LayoutKind.Sequential)] struct Mapped { public IntPtr Data; public uint RowPitch, DepthPitch; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct MONINFO { public int Size; public RECT Mon, Work; public uint Flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string Device; }
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateTex2DFn(IntPtr self, ref TexDesc d, IntPtr init, out IntPtr tex); [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void GetDescFn(IntPtr self, out TexDesc d);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void CopyResFn(IntPtr self, IntPtr dst, IntPtr src);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int MapFn(IntPtr self, IntPtr res, uint sub, int type, uint flags, out Mapped m);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void UnmapFn(IntPtr self, IntPtr res, uint sub);
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("d3d11.dll")] static extern int D3D11CreateDevice(IntPtr adapter, int type, IntPtr sw, uint flags, IntPtr levels, uint n, uint sdk, out IntPtr dev, out int level, out IntPtr ctx);
  [DllImport("d3d11.dll")] static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgi, out IntPtr inspectable); [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l); [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r); [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f); [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MONINFO i);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd); [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f); [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex, string cls, string name, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr p);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int size); [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid); [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr p, uint access, out IntPtr tok); [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr tok, int cls, out int v, int size, out int ret);
  static readonly Dictionary<string, string> A = new Dictionary<string, string>();
  static string Arg(string k, string d) { string v; return A.TryGetValue(k, out v) ? v : d; }
  static int ArgI(string k, int d) { return int.Parse(Arg(k, d.ToString(CultureInfo.InvariantCulture)), CultureInfo.InvariantCulture); }
  static TextWriter Log = Console.Out;
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
    foreach (char c in s) { if (c == '"' || c == '\\') b.Append('\\').Append(c); else if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4")); else b.Append(c); }
    b.Append('"');
  }
  static string Rc(RECT r) { return "[" + r.L + "," + r.T + "," + r.R + "," + r.B + "]"; }
  static string Hx(Exception e) { return "0x" + e.HResult.ToString("X8") + " " + e.GetType().Name + ": " + e.Message.Trim(); }
  static void Check(int hr, string what) { if (hr < 0) throw new Exception(what + " failed 0x" + hr.ToString("X8")); }
  static T Vt<T>(IntPtr obj, int slot) where T : class { return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), slot * IntPtr.Size), typeof(T)); }
  static double Sum(byte[] b) { double s = 0; for (int i = 0; i < b.Length; i += 4093) s += b[i]; return s; }
  static double CpuMs() { return Process.GetCurrentProcess().TotalProcessorTime.TotalMilliseconds; }
  static double Median(List<double> a) { if (a.Count == 0) return double.NaN; var c = new List<double>(a); c.Sort(); return c[c.Count / 2]; }
  static double Pct(List<double> a, double p) { if (a.Count == 0) return double.NaN; var c = new List<double>(a); c.Sort(); return c[Math.Min(c.Count - 1, (int)(c.Count * p))]; }
  // ── D3D11 + the WinRT device the frame pool needs ──
  static IntPtr Dev, Ctx, Staging; static TexDesc SDesc; static IDirect3DDevice WDev;
  static void InitD3D() {
    int lvl; Check(D3D11CreateDevice(IntPtr.Zero, 1, IntPtr.Zero, 0x20, IntPtr.Zero, 0, 7, out Dev, out lvl, out Ctx), "D3D11CreateDevice");
    Guid g = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c"); IntPtr dxgi; Check(Marshal.QueryInterface(Dev, ref g, out dxgi), "QueryInterface(IDXGIDevice)");
    IntPtr insp; Check(CreateDirect3D11DeviceFromDXGIDevice(dxgi, out insp), "CreateDirect3D11DeviceFromDXGIDevice");
    WDev = (IDirect3DDevice)Marshal.GetObjectForIUnknown(insp); Marshal.Release(insp); Marshal.Release(dxgi);
  }
  static GraphicsCaptureItem ItemFor(IntPtr hwnd) {
    var f = (IGraphicsCaptureItemInterop)WindowsRuntimeMarshal.GetActivationFactory(typeof(GraphicsCaptureItem));
    Guid iid = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
    IntPtr p = f.CreateForWindow(hwnd, ref iid);
    try { return (GraphicsCaptureItem)Marshal.GetObjectForIUnknown(p); } finally { Marshal.Release(p); }
  }
  // The frame's texture → a staging copy → tight rows (no pitch) into buf, clipped/padded to outW × outH.
  static int Bpp = 8;
  static double CopyInto(Direct3D11CaptureFrame fr, ref byte[] buf, int outW, int outH, out uint fmt) {
    var t0 = Stopwatch.StartNew();
    var access = (IDirect3DDxgiInterfaceAccess)(object)fr.Surface;
    Guid g = new Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c");
    IntPtr tex = access.GetInterface(ref g);
    try {
      TexDesc d; Vt<GetDescFn>(tex, 10)(tex, out d); fmt = d.Format;
      if (Staging == IntPtr.Zero || SDesc.W != d.W || SDesc.H != d.H || SDesc.Format != d.Format) {
        if (Staging != IntPtr.Zero) Marshal.Release(Staging);
        TexDesc s = d; s.Mips = 1; s.Array = 1; s.SCount = 1; s.SQuality = 0; s.Usage = 3; s.Bind = 0; s.Cpu = 0x20000; s.Misc = 0;
        Check(Vt<CreateTex2DFn>(Dev, 5)(Dev, ref s, IntPtr.Zero, out Staging), "CreateTexture2D(staging)"); SDesc = s;
      }
      Vt<CopyResFn>(Ctx, 47)(Ctx, Staging, tex);
      Mapped m; Check(Vt<MapFn>(Ctx, 14)(Ctx, Staging, 0, 1, 0, out m), "Map");
      int w = Math.Min(Math.Min(fr.ContentSize.Width, (int)d.W), outW), h = Math.Min(Math.Min(fr.ContentSize.Height, (int)d.H), outH);
      int row = outW * Bpp; if (buf == null || buf.Length != row * outH) buf = new byte[row * outH];
      for (int y = 0; y < h; y++) Marshal.Copy(new IntPtr(m.Data.ToInt64() + (long)y * m.RowPitch), buf, y * row, w * Bpp);
      Vt<UnmapFn>(Ctx, 15)(Ctx, Staging, 0);
      return t0.Elapsed.TotalMilliseconds;
    } finally { Marshal.Release(tex); }
  }

  // ── one capture session on one window ──
  static GraphicsCaptureItem Item; static Direct3D11CaptureFramePool Pool; static GraphicsCaptureSession Sess;
  static DirectXPixelFormat Fmt; static int PoolW, PoolH, Resized; static long Count; static TimeSpan PrevT;
  static readonly List<double> Gaps = new List<double>(), Copies = new List<double>();
  static readonly object FrameLock = new object();
  static Action<Direct3D11CaptureFrame> Each;
  static Js Open(IntPtr hwnd) {
    Fmt = Arg("--fmt", "f16") == "bgra" ? DirectXPixelFormat.B8G8R8A8UIntNormalized : DirectXPixelFormat.R16G16B16A16Float;
    Bpp = Fmt == DirectXPixelFormat.R16G16B16A16Float ? 8 : 4;
    InitD3D(); Item = ItemFor(hwnd); PoolW = Item.Size.Width; PoolH = Item.Size.Height;
    Pool = Direct3D11CaptureFramePool.CreateFreeThreaded(WDev, Fmt, 2, Item.Size);
    Sess = Pool.CreateCaptureSession(Item);
    var j = new Js().S("hwnd", hwnd.ToString()).S("item", Item.DisplayName).N("itemW", PoolW).N("itemH", PoolH).S("fmt", Fmt.ToString()).R("window", WinJs(hwnd));
    try { Sess.IsCursorCaptureEnabled = Arg("--cursor", "0") == "1"; j.B("cursor", Sess.IsCursorCaptureEnabled); } catch (Exception e) { j.S("cursorErr", Hx(e)); }
    if (Arg("--border", "1") == "0") {
      j.S("borderlessAccess", Borderless());
      try { Sess.IsBorderRequired = false; j.B("borderRequired", Sess.IsBorderRequired); } catch (Exception e) { j.S("borderErr", Hx(e)); }
    }
#if MINUPDATE
    if (A.ContainsKey("--min-ms")) { try { Sess.MinUpdateInterval = TimeSpan.FromMilliseconds(ArgI("--min-ms", 0)); j.N("minUpdateMs", Sess.MinUpdateInterval.TotalMilliseconds); } catch (Exception e) { j.S("minUpdateErr", Hx(e)); } }
#endif
    Item.Closed += delegate { Say(new Js().S("ev", "item-closed")); };
    Pool.FrameArrived += Arrived;
    Sess.StartCapture();
    return j;
  }
  static string Borderless() {
    try {
      var op = GraphicsCaptureAccess.RequestAccessAsync(GraphicsCaptureAccessKind.Borderless);
      var w = Stopwatch.StartNew();
      while (op.Status == AsyncStatus.Started && w.ElapsedMilliseconds < 5000) Thread.Sleep(10);
      return op.Status == AsyncStatus.Completed ? op.GetResults().ToString() : "status " + op.Status;
    } catch (Exception e) { return "error " + Hx(e); }
  }
  static void Arrived(Direct3D11CaptureFramePool pool, object o) {
    lock (FrameLock) {
      using (var fr = pool.TryGetNextFrame()) {
        if (fr == null) return;
        Count++;
        if (PrevT != TimeSpan.Zero && Gaps.Count < 100000) Gaps.Add((fr.SystemRelativeTime - PrevT).TotalMilliseconds);
        PrevT = fr.SystemRelativeTime;
        try { if (Each != null) Each(fr); } catch (Exception e) { Say(new Js().S("ev", "frame-error").S("error", Hx(e))); }
        if (fr.ContentSize.Width != PoolW || fr.ContentSize.Height != PoolH) {
          Resized++; PoolW = fr.ContentSize.Width; PoolH = fr.ContentSize.Height;
          pool.Recreate(WDev, Fmt, 2, fr.ContentSize);
        }
      }
    }
  }
  static void Close() { Each = null; try { Pool.FrameArrived -= Arrived; Sess.Dispose(); Pool.Dispose(); } catch (Exception e) { Say(new Js().S("ev", "close-error").S("error", Hx(e))); } }

  // ── window facts ──
  static readonly Dictionary<uint, string> Names = new Dictionary<uint, string>();
  static string ProcName(uint pid) { string n; if (Names.TryGetValue(pid, out n)) return n; try { n = Process.GetProcessById((int)pid).ProcessName; } catch (Exception) { n = null; } Names[pid] = n; return n; }
  static string Elevated(uint pid) {
    IntPtr p = OpenProcess(0x1000, false, pid); if (p == IntPtr.Zero) return "null";
    try { IntPtr t; if (!OpenProcessToken(p, 8, out t)) return "null"; try { int v, r; return GetTokenInformation(t, 20, out v, 4, out r) ? (v != 0 ? "true" : "false") : "null"; } finally { CloseHandle(t); } } finally { CloseHandle(p); }
  }
  static string WinJs(IntPtr h) { return WinFacts(h, true).ToString(); }
  static Js WinFacts(IntPtr h, bool title) {
    uint pid; GetWindowThreadProcessId(h, out pid);
    var cls = new StringBuilder(256); GetClassName(h, cls, 256);
    RECT r, fr, cr; GetWindowRect(h, out r); GetClientRect(h, out cr);
    bool hasFrame = DwmGetWindowAttribute(h, 9, out fr, 16) == 0; int cloak; if (DwmGetWindowAttribute(h, 14, out cloak, 4) != 0) cloak = -1;
    var mi = new MONINFO(); mi.Size = Marshal.SizeOf(typeof(MONINFO)); GetMonitorInfo(MonitorFromWindow(h, 2), ref mi);
    int ex = GetWindowLong(h, -20);
    var j = new Js().S("hwnd", h.ToString()).N("pid", pid).S("proc", ProcName(pid)).S("cls", cls.ToString());
    if (title) { var t = new StringBuilder(512); GetWindowText(h, t, 512); j.S("title", t.ToString()); } else j.N("titleLen", GetWindowTextLength(h));
    return j.B("visible", IsWindowVisible(h)).B("min", IsIconic(h)).N("cloaked", cloak).S("exStyle", "0x" + ex.ToString("X8"))
      .S("owner", GetWindow(h, 4).ToString()).R("rect", Rc(r)).R("frame", hasFrame ? Rc(fr) : "null").N("clientW", cr.R).N("clientH", cr.B)
      .N("dpi", GetDpiForWindow(h)).S("display", mi.Device).R("displayRect", Rc(mi.Mon)).R("elevated", Elevated(pid));
  }
  static void List() {
    var own = new HashSet<string>(Arg("--own", "").Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries));
    var hw = new HashSet<string>(Arg("--hwnds", "").Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries));
    var tries = new List<KeyValuePair<string, IntPtr>>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      bool mine = own.Contains(pid.ToString()) || hw.Contains(h.ToString());
      var cls = new StringBuilder(256); GetClassName(h, cls, 256); string c = cls.ToString();
      if (IsWindowVisible(h) || mine) Say(WinFacts(h, mine).S("ev", "window").B("lane", mine));
      if (mine) {
        tries.Add(new KeyValuePair<string, IntPtr>("lane " + c, h));
        IntPtr core = FindWindowEx(h, IntPtr.Zero, "Windows.UI.Core.CoreWindow", null);
        if (core != IntPtr.Zero) tries.Add(new KeyValuePair<string, IntPtr>("lane child CoreWindow (UWP)", core));
        IntPtr child = FindWindowEx(h, IntPtr.Zero, null, null);
        if (child != IntPtr.Zero && child != core) { var cc = new StringBuilder(256); GetClassName(child, cc, 256); tries.Add(new KeyValuePair<string, IntPtr>("lane first child " + cc, child)); }
      } else if (c == "Progman" || c == "Shell_TrayWnd") tries.Add(new KeyValuePair<string, IntPtr>("shell " + c, h));
      return true;
    }, IntPtr.Zero);
    if (Arg("--try", "0") != "1") return;
    tries.Add(new KeyValuePair<string, IntPtr>("GetDesktopWindow", GetDesktopWindow()));
    tries.Add(new KeyValuePair<string, IntPtr>("this process: never-shown STATIC", CreateWindowEx(0, "STATIC", "wgc-probe hidden", 0x00CF0000, 0, 0, 300, 200, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero)));
    tries.Add(new KeyValuePair<string, IntPtr>("this process: message-only STATIC", CreateWindowEx(0, "STATIC", "wgc-probe msg", 0, 0, 0, 0, 0, new IntPtr(-3), IntPtr.Zero, IntPtr.Zero, IntPtr.Zero)));
    tries.Add(new KeyValuePair<string, IntPtr>("bogus hwnd 0x1234", new IntPtr(0x1234)));
    foreach (var t in tries) {
      var j = new Js().S("ev", "try").S("what", t.Key).S("hwnd", t.Value.ToString());
      try { var it = ItemFor(t.Value); j.B("ok", true).S("item", it.DisplayName).N("w", it.Size.Width).N("h", it.Size.Height); } catch (Exception e) { j.B("ok", false).S("error", Hx(e)); }
      Say(j);
    }
  }

  [MTAThread]
  static int Main(string[] argv) {
    for (int i = 1; i < argv.Length; i++) { if (argv[i].StartsWith("--")) { A[argv[i]] = i + 1 < argv.Length && !argv[i + 1].StartsWith("--") ? argv[i + 1] : "1"; } }
    string mode = argv.Length > 0 ? argv[0] : "";
    if (mode == "pipe") Log = Console.Error;
    var dpi = SetProcessDpiAwarenessContext(new IntPtr(-4));
    IntPtr hwnd = new IntPtr(long.Parse(Arg("--hwnd", "0"), CultureInfo.InvariantCulture));
    try {
      if (mode == "list") { Say(new Js().S("ev", "list").B("perMonitorV2", dpi)); List(); return 0; }
      if (mode == "place") { string z = Arg("--z", "none"); bool ok = SetWindowPos(hwnd, new IntPtr(z == "bottom" ? 1 : 0), ArgI("--x", 0), ArgI("--y", 0), ArgI("--w", 800), ArgI("--h", 600), 0x10u | (z == "none" ? 4u : 0u)); Thread.Sleep(300); Say(WinFacts(hwnd, true).S("ev", "placed").B("ok", ok)); return ok ? 0 : 1; }
      if (mode == "show") { ShowWindow(hwnd, Arg("--state", "restore") == "min" ? 7 : 4); Thread.Sleep(500); Say(WinFacts(hwnd, true).S("ev", "shown")); return 0; }
      if (mode == "grab") return Grab(hwnd);
      if (mode == "rate") return Rate(hwnd);
      if (mode == "pipe") return Pipe(hwnd);
      Console.Error.WriteLine("usage: wgc-probe list|grab|rate|pipe|place|show [--hwnd H] … (see the header of wgc-probe.cs)"); return 2;
    } catch (Exception e) { Say(new Js().S("ev", "error").S("mode", mode).S("error", Hx(e))); return 1; }
  }

  static int Grab(IntPtr hwnd) {
    int n = ArgI("--frames", 1), wait = ArgI("--wait", 3000); string prefix = Arg("--out", null); int got = 0;
    var sw = Stopwatch.StartNew();
    Each = delegate (Direct3D11CaptureFrame fr) {
      if (got >= n) return;
      byte[] buf = null; uint fmt; int w = fr.ContentSize.Width, h = fr.ContentSize.Height;
      double ms = CopyInto(fr, ref buf, w, h, out fmt);
      string file = prefix == null ? null : prefix + "-" + got + ".raw"; if (file != null) File.WriteAllBytes(file, buf);
      Say(new Js().S("ev", "frame").N("i", got).N("atMs", sw.Elapsed.TotalMilliseconds).N("contentW", w).N("contentH", h).N("poolW", PoolW).N("poolH", PoolH)
        .N("texFormat", fmt).N("texW", SDesc.W).N("texH", SDesc.H).N("bpp", Bpp).N("copyMs", ms).N("sum", Sum(buf)).S("file", file).N("sysMs", fr.SystemRelativeTime.TotalMilliseconds));
      got++;
    };
    Say(Open(hwnd).S("ev", "open").N("openMs", sw.Elapsed.TotalMilliseconds));
    while (got < n && sw.ElapsedMilliseconds < wait) Thread.Sleep(5);
    Thread.Sleep(ArgI("--hold", 0));
    Close();
    Say(new Js().S("ev", "grab-done").N("frames", got).N("arrived", Count).N("resized", Resized).N("ms", sw.Elapsed.TotalMilliseconds).R("window", WinJs(hwnd)));
    return got > 0 ? 0 : 3;
  }

  static int Rate(IntPtr hwnd) {
    bool read = Arg("--read", "1") == "1"; byte[] buf = null; uint fmt = 0;
    Each = delegate (Direct3D11CaptureFrame fr) { if (read) Copies.Add(CopyInto(fr, ref buf, fr.ContentSize.Width, fr.ContentSize.Height, out fmt)); };
    var open = Open(hwnd);
    Thread.Sleep(1000); long c0; lock (FrameLock) { c0 = Count; Gaps.Clear(); Copies.Clear(); }
    double cpu0 = CpuMs(); var sw = Stopwatch.StartNew();
    Thread.Sleep(ArgI("--seconds", 10) * 1000);
    double wall = sw.Elapsed.TotalMilliseconds, cpu = CpuMs() - cpu0; long c1; lock (FrameLock) { c1 = Count; }
    Close();
    Say(open.S("ev", "rate").B("read", read).N("seconds", wall / 1000).N("frames", c1 - c0).N("fps", (c1 - c0) * 1000.0 / wall)
      .N("gapP50", Median(Gaps)).N("gapP95", Pct(Gaps, 0.95)).N("gapMax", Pct(Gaps, 1)).N("copyP50", Median(Copies)).N("copyP95", Pct(Copies, 0.95))
      .N("cpuOneCorePct", cpu * 100 / wall).N("cpuMachinePct", cpu * 100 / wall / Environment.ProcessorCount).N("cores", Environment.ProcessorCount).N("resized", Resized));
    return 0;
  }

  static int Pipe(IntPtr hwnd) {
    int fps = ArgI("--fps", 30), secs = ArgI("--seconds", 10); int outW = 0, outH = 0; byte[] back = null, front = null; bool fresh = false;
    long arrived = 0, written = 0, repeats = 0, dropped = 0; var writes = new List<double>(); var stdout = Console.OpenStandardOutput();
    Each = delegate (Direct3D11CaptureFrame fr) {
      uint fmt; if (outW == 0) { outW = fr.ContentSize.Width & ~1; outH = fr.ContentSize.Height & ~1; Say(new Js().S("ev", "pipe-size").N("w", outW).N("h", outH).N("bpp", Bpp).N("frameBytes", (double)outW * outH * Bpp)); }
      Copies.Add(CopyInto(fr, ref back, outW, outH, out fmt)); arrived++; if (fresh) dropped++; fresh = true;
    };
    Say(Open(hwnd).S("ev", "open"));
    var sw = Stopwatch.StartNew(); double cpu0 = CpuMs(); long tick = 0;
    while (sw.ElapsedMilliseconds < secs * 1000L) {
      long due = (long)(tick * 1000.0 / fps); long now = sw.ElapsedMilliseconds; if (now < due) { Thread.Sleep((int)Math.Min(due - now, 5)); continue; }
      tick = (long)(now * fps / 1000.0) + 1;
      lock (FrameLock) { if (!fresh && front == null) continue; if (fresh) { var t = front; front = back; back = t; fresh = false; } else repeats++; }
      var w0 = Stopwatch.StartNew(); try { int ch = ArgI("--chunk", 65536) > 0 ? ArgI("--chunk", 65536) : front.Length; for (int o = 0; o < front.Length; o += ch) stdout.Write(front, o, Math.Min(ch, front.Length - o)); stdout.Flush(); } catch (IOException) { break; }
      writes.Add(w0.Elapsed.TotalMilliseconds); written++;
    }
    double wall = sw.Elapsed.TotalMilliseconds, cpu = CpuMs() - cpu0;
    Close();
    Say(new Js().S("ev", "pipe-done").N("fps", fps).N("seconds", wall / 1000).N("arrived", arrived).N("written", written).N("writtenFps", written * 1000.0 / wall)
      .N("repeats", repeats).N("dropped", dropped).N("copyP50", Median(Copies)).N("writeP50", Median(writes)).N("writeP95", Pct(writes, 0.95))
      .N("cpuOneCorePct", cpu * 100 / wall).N("cpuMachinePct", cpu * 100 / wall / Environment.ProcessorCount).N("w", outW).N("h", outH));
    return 0;
  }
}

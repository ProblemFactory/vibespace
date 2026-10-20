# app-listen.ps1 - VibeSpace lane stream-mic-wheel-probe (probe only). "An application would hear it": a SEPARATE process
# that records the cable's capture side the way an ordinary desktop app does - through the legacy waveIn (MME) API, not
# WASAPI - and says when each 1 kHz test tone arrived. Nothing is written to disk; only onset times and a peak leave.
#   powershell -NoProfile -ExecutionPolicy Bypass -File app-listen.ps1 -Secs 5 -Match 'CABLE Output'
# Output: one JSON line on stdout. Times are Unix ms on the precise system clock (the same clock as vs-mic-probe / Node).
# Pure ASCII (Windows PowerShell 5.1 reads BOM-less scripts in the ANSI code page).
param([double]$Secs = 5, [string]$Match = 'CABLE Output')
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Globalization; using System.Runtime.InteropServices; using System.Threading;
public static class AppListen {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct WAVEINCAPS { public ushort wMid, wPid; public uint vDriverVersion; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szPname; public uint dwFormats; public ushort wChannels, wReserved1; }
  [StructLayout(LayoutKind.Sequential)] public struct WAVEFORMATEX { public ushort wFormatTag, nChannels; public uint nSamplesPerSec, nAvgBytesPerSec; public ushort nBlockAlign, wBitsPerSample, cbSize; }
  [StructLayout(LayoutKind.Sequential)] public struct WAVEHDR { public IntPtr lpData; public uint dwBufferLength, dwBytesRecorded; public IntPtr dwUser; public uint dwFlags, dwLoops; public IntPtr lpNext, reserved; }
  [DllImport("winmm.dll")] static extern uint waveInGetNumDevs();
  [DllImport("winmm.dll", CharSet = CharSet.Unicode)] static extern int waveInGetDevCaps(UIntPtr id, out WAVEINCAPS caps, int size);
  [DllImport("winmm.dll")] static extern int waveInOpen(out IntPtr h, uint id, ref WAVEFORMATEX fmt, IntPtr cb, IntPtr inst, uint flags);
  [DllImport("winmm.dll")] static extern int waveInPrepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInUnprepareHeader(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInAddBuffer(IntPtr h, IntPtr hdr, int size);
  [DllImport("winmm.dll")] static extern int waveInStart(IntPtr h);
  [DllImport("winmm.dll")] static extern int waveInReset(IntPtr h);
  [DllImport("winmm.dll")] static extern int waveInClose(IntPtr h);
  [DllImport("kernel32.dll")] static extern void GetSystemTimePreciseAsFileTime(out long ft);
  static double Now() { long ft; GetSystemTimePreciseAsFileTime(out ft); return (ft - 116444736000000000L) / 10000.0; }
  static string R(double x) { return Math.Round(x, 2).ToString(CultureInfo.InvariantCulture); }
  public static string Run(double secs, string match) {
    uint n = waveInGetNumDevs(); int dev = -1; string name = "";
    for (uint i = 0; i < n; i++) { WAVEINCAPS c; if (waveInGetDevCaps(new UIntPtr(i), out c, Marshal.SizeOf(typeof(WAVEINCAPS))) == 0 && c.szPname.IndexOf(match, StringComparison.OrdinalIgnoreCase) >= 0) { dev = (int)i; name = c.szPname; break; } }
    if (dev < 0) return "{\"ok\":false,\"error\":\"no waveIn device named like " + match + "\",\"devices\":" + n + "}";
    var fmt = new WAVEFORMATEX { wFormatTag = 1, nChannels = 1, nSamplesPerSec = 48000, nAvgBytesPerSec = 96000, nBlockAlign = 2, wBitsPerSample = 16, cbSize = 0 };
    var ev = new AutoResetEvent(false); IntPtr h;
    int hr = waveInOpen(out h, (uint)dev, ref fmt, ev.SafeWaitHandle.DangerousGetHandle(), IntPtr.Zero, 0x50000); // CALLBACK_EVENT
    if (hr != 0) return "{\"ok\":false,\"error\":\"waveInOpen " + hr + "\"}";
    const int NB = 10, FR = 480; int hsz = Marshal.SizeOf(typeof(WAVEHDR));
    var hdrs = new IntPtr[NB];
    for (int i = 0; i < NB; i++) {
      var w = new WAVEHDR { lpData = Marshal.AllocHGlobal(FR * 2), dwBufferLength = FR * 2 };
      hdrs[i] = Marshal.AllocHGlobal(hsz); Marshal.StructureToPtr(w, hdrs[i], false);
      waveInPrepareHeader(h, hdrs[i], hsz); waveInAddBuffer(h, hdrs[i], hsz);
    }
    // Goertzel 1 kHz over 2 ms blocks: an onset is > 0.02, > 3x the previous 100 ms, 300 ms after the last
    int bn = 96, k = 0, hi = 0; double coeff = 2 * Math.Cos(2 * Math.PI * 1000.0 / 48000), s1 = 0, s2 = 0, peak = 0; var hist = new double[50];
    long frame = 0, blockStart = 0, last = -100000; var onsets = new List<string>(); int bufs = 0; double t0 = Now(), firstBuf = 0;
    waveInStart(h); int next = 0;
    while (Now() - t0 < secs * 1000) {
      ev.WaitOne(50);
      for (;;) {
        var w = (WAVEHDR)Marshal.PtrToStructure(hdrs[next], typeof(WAVEHDR));
        if ((w.dwFlags & 1) == 0) break; // WHDR_DONE
        double at = Now(); if (bufs == 0) firstBuf = at - t0; bufs++;
        int got = (int)w.dwBytesRecorded / 2; var pcm = new short[got]; Marshal.Copy(w.lpData, pcm, 0, got);
        for (int i = 0; i < got; i++) {
          if (k == 0) blockStart = frame;
          double x = pcm[i] / 32768.0, s0 = x + coeff * s1 - s2; s2 = s1; s1 = s0; k++; frame++;
          if (k < bn) continue;
          double amp = 2 * Math.Sqrt(Math.Max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / bn; if (amp > peak) peak = amp;
          double b = 0; foreach (var v in hist) b = Math.Max(b, v);
          // the onset's wall time: this buffer completed at `at`, the onset sits (got - i) frames before its end
          if (amp > 0.02 && amp > 3 * b && blockStart - last > bn * 150) { last = blockStart; onsets.Add(R(at - (frame - blockStart) / 48.0)); }
          hist[hi] = amp; hi = (hi + 1) % hist.Length; k = 0; s1 = s2 = 0;
        }
        w.dwFlags &= ~1u; Marshal.StructureToPtr(w, hdrs[next], false); waveInAddBuffer(h, hdrs[next], hsz);
        next = (next + 1) % NB;
      }
    }
    waveInReset(h);
    for (int i = 0; i < NB; i++) waveInUnprepareHeader(h, hdrs[i], hsz);
    waveInClose(h);
    return "{\"ok\":true,\"api\":\"waveIn (MME)\",\"device\":\"" + name + "\",\"buffers\":" + bufs + ",\"bufferMs\":10,\"firstBufferMs\":" + R(firstBuf) + ",\"peak\":" + R(peak) + ",\"onsetsWall\":[" + string.Join(",", onsets.ToArray()) + "],\"startWall\":" + R(t0) + "}";
  }
}
'@
[AppListen]::Run($Secs, $Match)

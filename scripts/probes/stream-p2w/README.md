# stream-p2w — the Windows per-window capture probe (Windows.Graphics.Capture)

Lane stream-p2w-capture-probe (design q-041 r3 §3 P2w-0, the capture half). It measured the WGC single-window capture on the
owner's paired Windows 11 workstation (26300, RTX 5090, two 4K HDR displays at SDR white 200 nits, 120 Hz, DPI 168 = 175 %).
It used only windows the lane opened itself and closed at the end, with no input of any kind and no virtual display. The
findings are in docs/changelog-engineering.md (the 2.369.300 head, lane stream-p2w-capture-probe).

## Files

| file | what it is |
|---|---|
| `wgc-probe.cs` | THE helper, ≤ 300 lines of C# 5: `list` (EnumWindows facts + `CreateForWindow` tries), `grab` (N frames → raw), `rate` (fps, gaps, readback ms, CPU), `pipe` (the newest frame at a fixed rate on stdout, tight rows, 64 KiB writes), `place` / `show` (lane windows only, never activating). Its header lists every flag |
| `build.ps1` | the build recipe that worked (below), one JSON line |
| `lane.ps1` | the legs' steps: open / close the lane's own windows, `measure` (a `.cmd` + nvidia-smi + the children's CPU), `shot` / `border-shot` (one ddagrab frame of a lane window's area), `min-during` (minimize / restore / move during a session) |
| `pad.ps1` | the lane's own Notepad-class window (WinForms text box + a 50 ms tick label); `-Cover` = an opaque TopMost cover |
| `pipe-nvenc.cmd` · `pipe-node.cmd` · `spawn-node.cmd` · `reader.js` | leg 3: the helper into ffmpeg's h264_nvenc, and into the device agent's own node (a cmd pipe, or node spawning the writer = the agent's shape); reader.js counts whole frames like src/agentd/stream-screen.js's mapped road |
| `greys.mjs` | off-box: a pulled calibration frame → every patch through src/stream-plan.js (`srgb8OfHalf`) + the unmapped RED control + a PNG |
| `offbox-check.ps1` + `winrt-stubs.cs` | off-box: compile wgc-probe.cs as C# 5 with the Roslyn inside a portable pwsh 7, against stubs of the WinRT surface it touches (catches C# 6+ syntax and typos without a Windows box) |

## Build (measured on the box)

The in-box `csc.exe` of .NET Framework 4.8 (`%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`, C# 5) built it the first time, in 1.1 s, to a 26 KB exe. It references:

- **all 20 split `*.winmd` in `%WINDIR%\System32\WinMetadata`** (a client Windows has no union `Windows.winmd` there);
- **the three facades from the same Framework64 folder**: `System.Runtime.dll`, `System.Runtime.WindowsRuntime.dll`, `System.Runtime.InteropServices.WindowsRuntime.dll`.

The build passes `/define:MINUPDATE` (`GraphicsCaptureSession.MinUpdateInterval`, Windows 11 24H2+). On an older OS, build.ps1 retries without it. No dotnet SDK and no NuGet were needed.

## Running the legs (vibespace-exit; every run line ≤ 30 s)

```sh
L='powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\vs-probe\p2w\lane.ps1"'
vibespace-exit push <file> <machine> 'C:\Users\<user>\vs-probe\p2w\<file>' --overwrite   # every file above
vibespace-exit run <machine> -- 'powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\vs-probe\p2w\build.ps1"'
vibespace-exit run <machine> -- "$L -Step open-calib -Seconds 120"            # → the window's hwnd
vibespace-exit run <machine> -- 'cd /d "%USERPROFILE%\vs-probe\p2w" & wgc-probe.exe grab --hwnd <h> --fmt f16 --frames 1 --out cal-f16'
vibespace-exit pull <machine> 'C:\Users\<user>\vs-probe\calib.json' calib.json
node scripts/probes/stream-p2w/greys.mjs cal-f16-0.raw <w> <h> f16 calib.json --white 2500 --png cal.png
vibespace-exit run <machine> -- "$L -Step open-edge -Name light -Light -X 60 -Y 40 -W 2000 -H 1100"   # DIPs (×1.75 on the box)
vibespace-exit run <machine> -- "$L -Step measure -Cmd \"wgc-probe.exe rate --hwnd <h> --fmt f16 --seconds 10 --read 1\" -Seconds 12 -Tag r"
vibespace-exit run <machine> -- "$L -Step measure -Cmd \"spawn-node.cmd <W*H*8> --spawn wgc-probe.exe pipe --hwnd <h> --fmt f16 --fps 30 --seconds 10 --min-ms 33\" -Seconds 12 -Tag p"
vibespace-exit run <machine> -- "$L -Step close -Name all"
```

Traps measured here:

- **Notepad is not a lane window.** Windows 11 Notepad restores the owner's previous tabs when it starts. pad.ps1 stands in for it.
- **A process in the background cannot change another window's z-order.** HWND_TOP, HWND_BOTTOM and minimize + restore without activation were all ignored. Cover a window with the TopMost `-Cover`.
- **`Start-Process -WindowStyle Minimized` minimizes the child's first window too.** `show --state restore` brings it back.
- **PS 5.1 `Get-Content` objects serialize with their PSPath baggage.** Map them to strings first: `ForEach-Object { "$_" }`.
- **zsh does not split `$spec`.** Use `${=spec}`.

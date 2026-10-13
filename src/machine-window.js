'use strict';
/**
 * ONE APP OF A PAIRED WINDOWS / macOS MACHINE AS ITS OWN WINDOW (lane machine-app-crop, owner 2026-10-11 "都做吧" —
 * route ② of B-bb0b: the cheap general rung for both systems, one app at a time). The machine's VNC server still sends
 * its WHOLE screen; the device agent finds the app's top-level window (the `window-track` op), reports its rectangle and
 * keeps it on top (`window-pin`), and the page crops the picture to that rectangle (src/lib/machine-app.js).
 * PURE (asks only src/machine-desktop-model.js): the daemon bundles it and runs `runWindowTrack` / `pinWindow` WHERE the
 * windows are with ITS OWN spawn / execFile handed in; the hub reads the answers; the page crops by `cropLayout`.
 *
 *   win32   ONE bounded PowerShell (-EncodedCommand) with user32: EnumWindows + GetWindowThreadProcessId + IsWindowVisible
 *           + GetWindowRect, and DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS) for the real rectangle (no invisible
 *           resize border); DPI-aware, so both are the framebuffer's physical pixels; the process table (Win32_Process:
 *           parent + start time) only while finding
 *   darwin  ONE osascript JXA loop over CGWindowListCopyWindowInfo (kCGWindowOwnerPID, kCGWindowBounds — points, the
 *           main display's top-left origin; on-screen layer-0 windows while finding, the one window by id after) and
 *           NSRunningApplication's launchDate; macOS has no "topmost": the pin ACTIVATES the app instead
 * The script prints one dump per round (`screen`, `win` rows, `p` process rows, `end`); everything that DECIDES is here:
 * which window is the launched app's (`pickTrackedWindow`), its rectangle (`rectOf`), the answer (`windowAnswer`).
 */
const MD = require('./machine-desktop-model.js');

/** Finding the app's window waits at most this long (the run answered; the app may take a while to draw a window). */
const TRACK_WAIT_MS = 20000;
/** One look at the machine's windows this often while finding; a tracked window's rectangle is read this often. */
const TRACK_POLL_MS = 250;
const WATCH_POLL_MS = 100;
/** Two pushes of a moving window are at least this far apart (the last rectangle always arrives). */
const PUSH_MIN_MS = 100;
/** A window smaller than this (either side, framebuffer units) is a tool tip / a splash fragment, never "the app". */
const MIN_SIDE = 40;
const TITLE_MAX = 200;
/** The line the "show it as its own window" run prints on the machine: the launched process and the machine's clock. */
const LAUNCH_TAG = 'vibespace-launched';
const STATES = Object.freeze(['found', 'gone', 'none', 'error']);

const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : null);
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, TITLE_MAX);

/** The launch report of a tracked run (`<tag> <pid> <machine epoch ms>`) → { pid, at } | null. */
function parseLaunchReport(stdout) {
  const m = new RegExp(`^${LAUNCH_TAG} (\\d{1,10}) (\\d{10,16})\\s*$`, 'm').exec(String(stdout || ''));
  return m ? { pid: Number(m[1]), at: Number(m[2]) } : null;
}

/** A track request, judged (the hub sends it, the device judges it again). → { ok, pid, since, target, watch, waitMs } | { ok:false, code, error } */
function trackRequest(p) {
  const o = p && typeof p === 'object' ? p : {};
  const pid = o.pid == null ? null : int(o.pid);
  const since = o.since == null ? null : int(o.since);
  const target = o.target == null ? null : int(o.target);
  if ((o.pid != null && !(pid > 0)) || (o.since != null && !(since > 0)) || (o.target != null && !(target > 0))) return { ok: false, code: 'bad-request', error: 'pid, since and target are positive whole numbers' };
  if (!target && !pid && !since) return { ok: false, code: 'bad-request', error: 'name the launched process (pid / since) or the window (target)' };
  const waitMs = Math.max(1000, Math.min(TRACK_WAIT_MS, int(o.findMs) || TRACK_WAIT_MS)); // `findMs`: never `waitMs` (the hub's request timer reads that name)
  return { ok: true, pid, since, target, watch: !!o.watch, waitMs };
}

// ── THE SCRIPTS (numbers only reach them, each judged above) ────────────────────────────────────────────────────────
const WIN_TYPES = [
  "Add-Type -TypeDefinition @'",
  'using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;',
  'public static class VsWin {',
  '  public delegate bool EnumProc(IntPtr h, IntPtr l);',
  '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }',
  '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);',
  '  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);',
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);',
  '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
  '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
  '  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int n);',
  '  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);',
  '  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();',
  '  [DllImport("user32.dll")] public static extern uint GetDpiForSystem();',
  '  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);',
  '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);',
  '  public static List<IntPtr> Tops() { var l = new List<IntPtr>(); EnumWindows(delegate (IntPtr h, IntPtr p) { l.Add(h); return true; }, IntPtr.Zero); return l; }',
  '}',
  "'@",
];
/** THE WINDOWS LOOK (find: every visible unowned top-level window + the process table; watch: the one window). */
function winTrackScript({ target = 0, pollMs = TRACK_POLL_MS, deadlineMs = 0 } = {}) {
  return ["$ErrorActionPreference = 'Stop'", ...WIN_TYPES,
    '$aware = 0; try { $aware = [int][VsWin]::SetProcessDPIAware() } catch { }',
    '$o = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), (New-Object System.Text.UTF8Encoding $false))',
    'function J($h) { $o.WriteLine((ConvertTo-Json -InputObject $h -Compress)) }',
    `$target = [IntPtr][Int64]${int(target) || 0}`,
    '$t0 = [Environment]::TickCount',
    'while ($true) {',
    '  $dpi = 96; try { $dpi = [int][VsWin]::GetDpiForSystem() } catch { }',
    "  J @{ t = 'screen'; x = [VsWin]::GetSystemMetrics(76); y = [VsWin]::GetSystemMetrics(77); w = [VsWin]::GetSystemMetrics(78); h = [VsWin]::GetSystemMetrics(79); dpi = $dpi; aware = $aware }",
    '  if ($target -ne [IntPtr]::Zero) { $list = @($target) } else { $list = [VsWin]::Tops() }',
    '  foreach ($w in $list) {',
    "    if (-not [VsWin]::IsWindow($w)) { J @{ t = 'win'; hwnd = [Int64]$w; gone = 1 }; continue }",
    '    $vis = [VsWin]::IsWindowVisible($w)',
    '    if ($target -eq [IntPtr]::Zero -and ((-not $vis) -or ([VsWin]::GetWindow($w, 4) -ne [IntPtr]::Zero))) { continue }',
    '    $op = [uint32]0; [void][VsWin]::GetWindowThreadProcessId($w, [ref]$op)',
    '    $sb = New-Object System.Text.StringBuilder 512; [void][VsWin]::GetWindowText($w, $sb, 512)',
    '    $r = New-Object VsWin+RECT; [void][VsWin]::GetWindowRect($w, [ref]$r)',
    '    $f = New-Object VsWin+RECT; $fb = $null; try { if ([VsWin]::DwmGetWindowAttribute($w, 9, [ref]$f, 16) -eq 0) { $fb = @($f.L, $f.T, $f.R, $f.B) } } catch { }',
    "    J @{ t = 'win'; hwnd = [Int64]$w; pid = [Int64]$op; title = $sb.ToString(); vis = [int]$vis; min = [int][VsWin]::IsIconic($w); wr = @($r.L, $r.T, $r.R, $r.B); fb = $fb }",
    '  }',
    // the process table only while FINDING (the following look reads one window, nothing else)
    int(target) ? '' : "  foreach ($p in (Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, CreationDate)) { $ms = 0; if ($p.CreationDate) { $ms = ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() }; $o.WriteLine('p ' + $p.ProcessId + ' ' + $p.ParentProcessId + ' ' + $ms) }",
    "  $o.WriteLine('end ' + [DateTimeOffset]::Now.ToUnixTimeMilliseconds()); $o.Flush()",
    `  if (${int(deadlineMs) || 0} -gt 0 -and ([Environment]::TickCount - $t0) -gt ${int(deadlineMs) || 0}) { exit 0 }`,
    `  Start-Sleep -Milliseconds ${int(pollMs) || TRACK_POLL_MS}`,
    '}'].filter(Boolean).join('\n');
}
/** THE WINDOWS PIN: HWND_TOPMOST (-1) after a restore when minimized, HWND_NOTOPMOST (-2) to undo — never moved, never activated. */
function winPinScript(hwnd, on) {
  return ["$ErrorActionPreference = 'Stop'", ...WIN_TYPES,
    `$h = [IntPtr][Int64]${int(hwnd) || 0}`,
    "if (-not [VsWin]::IsWindow($h)) { [Console]::Out.WriteLine('gone'); exit 3 }",
    on ? 'if ([VsWin]::IsIconic($h)) { [void][VsWin]::ShowWindow($h, 9) }' : '',
    `if (-not [VsWin]::SetWindowPos($h, [IntPtr](${on ? -1 : -2}), 0, 0, 0, 0, 0x0013)) { [Console]::Error.WriteLine('SetWindowPos refused (error ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error() + ')'); exit 4 }`,
    "[Console]::Out.WriteLine('ok')"].filter(Boolean).join('\n');
}
/** THE MAC LOOK (osascript JXA; argv = target window id, poll ms, deadline ms). */
const MAC_TRACK_JXA = [
  "ObjC.import('Cocoa'); ObjC.import('CoreGraphics');",
  'function run(argv) {',
  '  const target = Number(argv[0]) || 0, poll = Number(argv[1]) || 250, deadline = Number(argv[2]) || 0, t0 = Date.now();',
  '  const out = $.NSFileHandle.fileHandleWithStandardOutput;',
  "  const say = (s) => out.writeData($(s + '\\n').dataUsingEncoding($.NSUTF8StringEncoding));",
  '  for (;;) {',
  '    const scr = $.NSScreen.mainScreen, fr = scr.frame;',
  "    say(JSON.stringify({ t: 'screen', x: 0, y: 0, w: fr.size.width, h: fr.size.height, scale: scr.backingScaleFactor }));",
  '    const opt = target ? $.kCGWindowListOptionIncludingWindow : ($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements);',
  '    const rows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(opt, target || $.kCGNullWindowID))) || [];',
  "    if (target && !rows.some((w) => w.kCGWindowNumber === target)) say(JSON.stringify({ t: 'win', id: target, gone: 1 }));",
  '    const pids = new Set();',
  '    for (const w of rows) {',
  '      if (!target && w.kCGWindowLayer !== 0) continue;',
  '      const b = w.kCGWindowBounds || {};',
  "      say(JSON.stringify({ t: 'win', id: w.kCGWindowNumber, pid: w.kCGWindowOwnerPID, title: w.kCGWindowName || '', owner: w.kCGWindowOwnerName || '', vis: w.kCGWindowIsOnscreen ? 1 : 0, b: [b.X, b.Y, b.Width, b.Height] }));",
  '      pids.add(w.kCGWindowOwnerPID);',
  '    }',
  "    if (!target) for (const p of pids) { const a = $.NSRunningApplication.runningApplicationWithProcessIdentifier(p); const d = a && !a.isNil() ? a.launchDate : null; say('p ' + p + ' 0 ' + (d && !d.isNil() ? Math.round(d.timeIntervalSince1970 * 1000) : 0)); }",
  "    say('end ' + Date.now());",
  '    if (deadline && Date.now() - t0 > deadline) return;',
  '    delay(poll / 1000);',
  '  }',
  '}'].join('\n');
/** THE MAC "PIN": activate the app (it comes to the front, unhidden) — macOS keeps no window above the others for us. */
const MAC_PIN_JXA = [
  "ObjC.import('Cocoa');",
  'function run(argv) {',
  '  const a = $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(argv[0]));',
  "  if (!a || a.isNil()) return 'gone';",
  '  a.unhide; a.activateWithOptions($.NSApplicationActivateIgnoringOtherApps);',
  "  return 'ok';",
  '}'].join('\n');
const OSA = '/usr/bin/osascript';

/** The look's argv for this platform. → { ok, argv } | { ok:false, code } */
function trackArgv(platform, { target = 0, pollMs = TRACK_POLL_MS, deadlineMs = 0 } = {}) {
  if (platform === 'win32') return { ok: true, argv: [...MD.PS_ARGV, MD.psEncoded(winTrackScript({ target, pollMs, deadlineMs }))] };
  if (platform === 'darwin') return { ok: true, argv: [OSA, '-l', 'JavaScript', '-e', MAC_TRACK_JXA, String(int(target) || 0), String(int(pollMs) || TRACK_POLL_MS), String(int(deadlineMs) || 0)] };
  return { ok: false, code: 'not_desktop_machine', error: `one app's own window is for Windows and macOS machines (this one runs ${platform || 'an unknown system'})` };
}
/** The pin's argv: Windows by the window, macOS by the app's process. → { ok, argv } | { ok:false, code } */
function pinArgv(platform, { hwnd = 0, pid = 0, on = true } = {}) {
  if (platform === 'win32') return int(hwnd) > 0 ? { ok: true, argv: [...MD.PS_ARGV, MD.psEncoded(winPinScript(hwnd, !!on))] } : { ok: false, code: 'bad-request', error: 'no window to pin' };
  if (platform === 'darwin') return !on ? { ok: true, argv: null } : int(pid) > 0 ? { ok: true, argv: [OSA, '-l', 'JavaScript', '-e', MAC_PIN_JXA, String(int(pid))] } : { ok: false, code: 'bad-request', error: 'no app to bring forward' };
  return { ok: false, code: 'not_desktop_machine', error: 'a pin is for Windows and macOS machines' };
}

// ── THE PARSE (PURE) ───────────────────────────────────────────────────────────────────────────────────────────────
/** An incremental reader of the look's output: feed(text) → the dumps completed by it (a malformed line is skipped). */
function dumpReader() {
  let buf = '', cur = null;
  const fresh = () => ({ screen: null, wins: [], procs: new Map(), at: null });
  return {
    feed(text) {
      buf += String(text || '');
      if (buf.length > 4 * 1024 * 1024) buf = buf.slice(-1024 * 1024); // a runaway line never grows without bound
      const done = [];
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
        if (!cur) cur = fresh();
        if (line.startsWith('{')) {
          let o = null; try { o = JSON.parse(line); } catch { continue; }
          if (o && o.t === 'screen') cur.screen = o; else if (o && o.t === 'win') cur.wins.push(o);
        } else if (line.startsWith('p ')) {
          const [, p, pp, ms] = line.split(' ');
          if (int(p) > 0) cur.procs.set(Number(p), { ppid: int(pp) || 0, start: int(ms) || 0 });
        } else if (line.startsWith('end')) {
          cur.at = int(line.slice(4)) || null; done.push(cur); cur = null;
        }
      }
      return done;
    },
  };
}
/** Parse whole text (fixtures) → dumps. */
function parseDumps(text) { return dumpReader().feed(String(text || '').endsWith('\n') ? text : text + '\n'); }

/** The screen in the units the rectangles use: Windows = physical pixels of the virtual screen (scale = dpi / 96; a look
 *  that is not DPI-aware read logical metrics, scaled up here); macOS = points of the main display (scale = its backing
 *  factor — the page maps points to the picture's pixels by the framebuffer's width). */
function screenOf(platform, s) {
  if (!s || typeof s !== 'object') return null;
  const w = Number(s.w), h = Number(s.h);
  if (!(w > 0 && h > 0)) return null;
  const scale = platform === 'win32' ? (Number(s.dpi) > 0 ? Number(s.dpi) / 96 : 1) : (Number(s.scale) > 0 ? Number(s.scale) : 1);
  const aware = platform === 'win32' ? s.aware !== 0 : true;
  const k = aware ? 1 : scale; // a look that could not become DPI-aware read LOGICAL metrics: physical = logical × the DPI scale
  return { x: (Number(s.x) || 0) * k, y: (Number(s.y) || 0) * k, w: w * k, h: h * k, scale, aware };
}
/** A window's rectangle relative to the screen's origin, in the screen's units (`null` when it has none).
 *  Windows: the DWM extended frame bounds (always physical pixels) else GetWindowRect — logical pixels when the look
 *  could not become DPI-aware, so scaled up by the DPI. macOS: kCGWindowBounds (points, main display origin). */
function rectOf(platform, row, screen) {
  if (!row || !screen) return null;
  let x, y, w, h;
  if (platform === 'win32') {
    const fb = Array.isArray(row.fb) && row.fb.length === 4 && row.fb.every(Number.isFinite) ? row.fb : null;
    const wr = Array.isArray(row.wr) && row.wr.length === 4 && row.wr.every(Number.isFinite) ? row.wr : null;
    const b = fb || wr; if (!b) return null;
    const k = !fb && !screen.aware ? screen.scale : 1;
    x = b[0] * k - screen.x; y = b[1] * k - screen.y; w = (b[2] - b[0]) * k; h = (b[3] - b[1]) * k;
  } else {
    const b = Array.isArray(row.b) && row.b.length === 4 && row.b.every(Number.isFinite) ? row.b : null; if (!b) return null;
    [x, y, w, h] = [b[0] - screen.x, b[1] - screen.y, b[2], b[3]];
  }
  if (!(w > 0 && h > 0)) return null;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
const idOf = (platform, row) => int(platform === 'win32' ? row && row.hwnd : row && row.id);
/** Is `pid` an ancestor of (or) `p` in the dump's process table (≤ 16 hops)? */
function descends(procs, p, pid) {
  let cur = p;
  for (let i = 0; i < 16 && cur > 0; i++) { if (cur === pid) return true; const r = procs.get(cur); cur = r ? r.ppid : 0; }
  return false;
}
/**
 * WHICH WINDOW IS THE LAUNCHED APP'S (PURE). Candidates: visible, not minimized-to-nothing, at least MIN_SIDE each way.
 * Ranked: (0) its process is the launched one or descends from it (Windows: `start "" blender` → cmd.exe → blender.exe);
 * (1) its process STARTED at / after the run (`since`, the machine's clock, 2 s slack — macOS `open -a` hands the launch
 * to launchd, so no lineage); (2) a window that was not there in the first look (`firstIds` — an app that was already
 * running opened a new window). Ties: the largest window (the main one), then a titled one. → row | null
 */
function pickTrackedWindow(platform, dump, { pid = null, since = null, firstIds = null } = {}) {
  if (!dump) return null;
  const screen = screenOf(platform, dump.screen);
  let best = null;
  for (const w of dump.wins) {
    if (w.gone || w.vis === 0) continue;
    const rect = rectOf(platform, w, screen);
    if (!rect || rect.w < MIN_SIDE || rect.h < MIN_SIDE) continue;
    const owner = int(w.pid) || 0;
    const proc = dump.procs.get(owner);
    const rank = pid && descends(dump.procs, owner, pid) ? 0 : since && proc && proc.start && proc.start >= since - 2000 ? 1 : firstIds && !firstIds.has(idOf(platform, w)) ? 2 : null;
    if (rank == null) continue;
    const area = rect.w * rect.h, titled = clean(w.title) ? 1 : 0;
    if (!best || rank < best.rank || (rank === best.rank && (area > best.area || (area === best.area && titled > best.titled)))) best = { row: w, rank, area, titled };
  }
  return best ? best.row : null;
}
/** THE ANSWER of one look at a window → { state, hwnd|windowId, pid, title, rect, screen: {w,h,scale}, minimized, by? } */
function windowAnswer(platform, dump, row, { state = null, by = null } = {}) {
  const screen = screenOf(platform, dump && dump.screen);
  const key = platform === 'win32' ? 'hwnd' : 'windowId';
  if (!row) return { state: state || 'none', screen: screen ? { w: screen.w, h: screen.h, scale: screen.scale } : null };
  const base = { [key]: idOf(platform, row), screen: screen ? { w: screen.w, h: screen.h, scale: screen.scale } : null };
  if (row.gone) return { state: 'gone', ...base };
  return { state: state || 'found', ...base, pid: int(row.pid), title: clean(row.title) || clean(row.owner), rect: rectOf(platform, row, screen), minimized: !!row.min || row.vis === 0, ...(by ? { by } : {}) };
}
/** The window an answer names (hwnd on Windows, window id on macOS). */
const targetOf = (a) => (a ? int(a.hwnd != null ? a.hwnd : a.windowId) : null);
/** Two answers a watcher need not both see (same state, rectangle, title, minimized). */
function sameAnswer(a, b) {
  if (!a || !b) return false;
  const r = (x) => (x ? `${x.x},${x.y},${x.w},${x.h}` : '');
  const s = (x) => (x ? `${x.w}x${x.h}@${x.scale}` : '');
  return a.state === b.state && r(a.rect) === r(b.rect) && s(a.screen) === s(b.screen) && (a.title || '') === (b.title || '') && !!a.minimized === !!b.minimized;
}

/** Does the line start a GUI app by name (macOS `open -a …`, Windows `start "" …`)? The run dialog then offers "Run as its own
 *  window…" as the default. */
function namesGuiApp(platform, line) {
  const s = String(line || '').trim();
  if (platform === 'darwin') return /^open\s+(-\w*a\w*\s+|-b\s+)/.test(s);
  if (platform === 'win32') return /^start\s+""\s+\S/i.test(s);
  return false;
}

// ── THE CROP (PURE; the page) ──────────────────────────────────────────────────────────────────────────────────────
/**
 * WHERE THE PICTURE GOES in a pane: the app's rectangle (screen units) → framebuffer pixels (`k` = framebuffer width /
 * screen width: a Retina Mac whose Screen Sharing sends pixels for a screen measured in points), clipped to the
 * framebuffer, fitted into the pane ("Fit to this window": the whole crop visible, centred). `box` = the visible crop in
 * the pane; `stage` = where the WHOLE framebuffer is laid out relative to the box (the VNC canvas is sized and shifted
 * so only the app shows). → { k, s, src, box, stage } | null (nothing of the window is on the shared screen)
 */
function cropLayout({ pane, fb, screen, rect } = {}) {
  if (!pane || !fb || !rect || !(pane.w > 0 && pane.h > 0 && fb.w > 0 && fb.h > 0)) return null;
  const k = screen && screen.w > 0 ? fb.w / screen.w : 1;
  const x0 = Math.max(0, rect.x * k), y0 = Math.max(0, rect.y * k);
  const x1 = Math.min(fb.w, (rect.x + rect.w) * k), y1 = Math.min(fb.h, (rect.y + rect.h) * k);
  if (!(x1 - x0 >= 1 && y1 - y0 >= 1)) return null;
  const src = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const s = Math.min(pane.w / src.w, pane.h / src.h);
  const box = { left: (pane.w - src.w * s) / 2, top: (pane.h - src.h * s) / 2, w: src.w * s, h: src.h * s };
  return { k, s, src, box, stage: { left: -src.x * s, top: -src.y * s, w: fb.w * s, h: fb.h * s } };
}
/** A pointer at pane (px, py) → the machine's framebuffer pixel, or null outside the crop (it is never sent). */
function paneToMachine(L, px, py) {
  if (!L) return null;
  const bx = px - L.box.left, by = py - L.box.top;
  if (!(bx >= 0 && by >= 0 && bx < L.box.w && by < L.box.h)) return null;
  return { x: Math.min(L.src.x + L.src.w - 1, Math.floor(L.src.x + bx / L.s)), y: Math.min(L.src.y + L.src.h - 1, Math.floor(L.src.y + by / L.s)) };
}
/** A drag that leaves the crop is held at its edge (a press began inside; the rest of the screen is never reached). */
function clampToBox(L, px, py) {
  if (!L) return null;
  const e = 0.001;
  return { x: Math.min(L.box.left + L.box.w - e, Math.max(L.box.left, px)), y: Math.min(L.box.top + L.box.h - e, Math.max(L.box.top, py)) };
}

// ── THE DEVICE SIDE (runs in the daemon; its spawn / execFile handed in) ─────────────────────────────────────────────
/**
 * FIND (and, `watch`, FOLLOW) the launched app's window. `onAnswer(answer, first)` gets the first answer (found / none /
 * error) and, while watching, every change ≥ PUSH_MIN_MS apart (the latest is never dropped); `gone` ends it. The look is
 * ONE child at a time: the finding look is bounded by `waitMs`; the following look reads the one window until stopped
 * (its parent's pipe closing ends it too). → { stop(), get target() }
 */
function runWindowTrack({ platform, params, spawn, env, onAnswer = () => { }, onEnd = () => { }, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const req = trackRequest(params);
  let child = null, stopped = false, first = true, last = null, lastAt = 0, pending = null, flushT = null, deadT = null, target = req.ok ? req.target : null;
  const end = () => { if (stopped) return; stopped = true; clearTimer(flushT); clearTimer(deadT); kill(); try { onEnd(); } catch { /* the caller's */ } };
  const kill = () => { const c = child; child = null; if (c) { try { c.kill(); } catch { /* gone */ } } };
  const emit = (a) => {
    if (stopped) return;
    if (first) { first = false; last = a; lastAt = now(); try { onAnswer(a, true); } catch { /* the caller's */ } if (!req.watch || a.state !== 'found') end(); return; }
    if (sameAnswer(a, last) && a.state !== 'gone') return;
    pending = a;
    const gap = now() - lastAt;
    const flush = () => { flushT = null; if (stopped || !pending) return; const p = pending; pending = null; last = p; lastAt = now(); try { onAnswer(p, false); } catch { /* the caller's */ } if (p.state === 'gone') end(); };
    if (a.state === 'gone' || gap >= PUSH_MIN_MS) { clearTimer(flushT); flush(); } else if (!flushT) flushT = setTimer(flush, PUSH_MIN_MS - gap);
  };
  if (!req.ok) { emit({ state: 'error', code: req.code, error: req.error }); return { stop: end, get target() { return null; }, get stopped() { return stopped; } }; }
  const look = (mode) => {
    const how = trackArgv(platform, mode === 'find' ? { pollMs: TRACK_POLL_MS, deadlineMs: req.waitMs } : { target, pollMs: WATCH_POLL_MS });
    if (!how.ok) { emit({ state: 'error', code: how.code, error: how.error }); return; }
    const reader = dumpReader();
    let err = '', firstIds = null;
    let c;
    try { c = spawn(how.argv[0], how.argv.slice(1), { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { emit({ state: 'error', code: 'spawn_failed', error: String((e && e.message) || e) }); return; }
    child = c;
    c.stdout.setEncoding?.('utf8'); c.stderr.setEncoding?.('utf8');
    c.stderr.on('data', (d) => { if (err.length < 4096) err += String(d); });
    c.stdout.on('data', (d) => {
      if (child !== c) return;
      for (const dump of reader.feed(d)) {
        if (mode === 'find') {
          if (!firstIds) firstIds = new Set(dump.wins.map((w) => idOf(platform, w)));
          const row = pickTrackedWindow(platform, dump, { pid: req.pid, since: req.since, firstIds });
          if (!row) continue;
          target = idOf(platform, row);
          const a = windowAnswer(platform, dump, row);
          kill(); clearTimer(deadT);
          emit(a);
          if (req.watch && !stopped) look('watch');
          return;
        }
        const row = dump.wins.find((w) => idOf(platform, w) === target) || { [platform === 'win32' ? 'hwnd' : 'id']: target, gone: 1 };
        emit(windowAnswer(platform, dump, row));
        if (stopped) return;
      }
    });
    c.on('error', (e) => { if (child === c) { child = null; emit({ state: 'error', code: 'spawn_failed', error: String((e && e.message) || e) }); end(); } });
    c.on('close', (code) => {
      if (child !== c) return;
      child = null;
      if (mode === 'find') emit(code === 0 ? { state: 'none' } : { state: 'error', code: 'look_failed', error: `the window look ended (exit ${code})${err ? ': ' + err.trim().split('\n')[0].slice(0, 200) : ''}` });
      else emit({ state: 'error', code: 'look_failed', error: `the window watch ended (exit ${code})` });
      end();
    });
  };
  if (target) look('watch');
  else { look('find'); deadT = setTimer(() => { if (!stopped && first) { kill(); emit({ state: 'none' }); } }, req.waitMs + 5000); }
  return { stop: end, get target() { return target; }, get stopped() { return stopped; } };
}
/** PIN / UNPIN one window (bounded 10 s). → { ok, pinned, state?, note? } | { ok:false, code, error } */
function pinWindow({ platform, hwnd, pid, on, execFile, env }) {
  const how = pinArgv(platform, { hwnd, pid, on });
  if (!how.ok) return Promise.resolve({ ok: false, code: how.code, error: how.error });
  if (!how.argv) return Promise.resolve({ ok: true, pinned: false, note: 'mac-no-topmost' });
  return new Promise((resolve) => {
    execFile(how.argv[0], how.argv.slice(1), { env, windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      const out = String(stdout || '').trim();
      if (out === 'gone' || (err && err.code === 3)) return resolve({ ok: true, pinned: false, state: 'gone' });
      if (err) return resolve({ ok: false, code: 'pin_failed', error: (String(stderr || '').trim().split('\n')[0] || err.message || 'the pin failed').slice(0, 200) });
      resolve({ ok: true, pinned: !!on && platform === 'win32', ...(platform === 'darwin' ? { note: 'mac-activated' } : {}) });
    });
  });
}

// ── lane desktop-v2-entry (design q-030 §3): THE MACHINE'S OWN SCREEN TABLE — the `display-facts` device op ─────────────
// The same two shells as the look above: a Mac's JXA over NSScreen.screens (frames in POINTS, the primary's bottom-left
// origin, y up; backingScaleFactor), Windows' PowerShell over Screen.AllScreens (Bounds in physical pixels once the
// process is DPI-aware; the primary at 0,0, a secondary left of it negative). One answer, bounded; the page maps it onto the
// framebuffer (src/desktop-screens.js screenMap — never a guess when the union is not the framebuffer).
const DISPLAYS_MS = 10000;
const MAC_DISPLAYS_JXA = [
  "ObjC.import('Cocoa');",
  'function run() {',
  '  const ss = $.NSScreen.screens, rows = [];',
  '  for (let i = 0; i < ss.count; i++) {',
  '    const s = ss.objectAtIndex(i), f = s.frame;',
  "    let name = ''; try { const n = s.localizedName; name = n && !n.isNil() ? ObjC.unwrap(n) : ''; } catch (e) { name = ''; }",
  "    let id = i + 1; try { const d = s.deviceDescription.objectForKey('NSScreenNumber'); if (d && !d.isNil()) id = d.intValue; } catch (e) { }",
  '    rows.push({ id, name, x: f.origin.x, y: f.origin.y, w: f.size.width, h: f.size.height, scale: s.backingScaleFactor, primary: i === 0 ? 1 : 0 });',
  '  }',
  "  return JSON.stringify({ t: 'displays', origin: 'bottom-left', rows });",
  '}'].join('\n');
// lane win-desktop-cursor-hdr (owner 2026-10-13 "HDR 特别白"): each screen's Windows HDR state — WMI has none, so the
// DisplayConfig API: QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS) → per active path the source's GDI name (DisplayConfigGetDeviceInfo
// type 1, \\.\DISPLAYn = Screen.DeviceName) and the target's advanced-colour info (type 9: bit 1 advancedColorEnabled, bit 2
// wideColorEnforced = the SDR wide-colour mode, not HDR). Raw offsets of DISPLAYCONFIG_PATH_INFO (72 bytes: source LUID @0, id @8;
// target LUID @20, id @28). Any failure = no row (hdr unknown — the bar says nothing).
const WIN_HDR_CS = [
  "Add-Type -TypeDefinition @'",
  'using System; using System.Text; using System.Runtime.InteropServices;',
  'public static class VsHdr {',
  '  [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint f, out uint np, out uint nm);',
  '  [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint f, ref uint np, IntPtr p, ref uint nm, IntPtr m, IntPtr t);',
  '  [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(IntPtr q);',
  '  public static string Read() {',
  '    uint np, nm; var sb = new StringBuilder();',
  '    if (GetDisplayConfigBufferSizes(2, out np, out nm) != 0) return "";',
  '    IntPtr P = Marshal.AllocHGlobal((int)np * 72), M = Marshal.AllocHGlobal((int)nm * 64), B = Marshal.AllocHGlobal(96);',
  '    try {',
  '      if (QueryDisplayConfig(2, ref np, P, ref nm, M, IntPtr.Zero) != 0) return "";',
  '      for (int i = 0; i < (int)np; i++) {',
  '        IntPtr p = new IntPtr(P.ToInt64() + i * 72);',
  '        Marshal.WriteInt32(B, 0, 1); Marshal.WriteInt32(B, 4, 84); Marshal.WriteInt64(B, 8, Marshal.ReadInt64(p, 0)); Marshal.WriteInt32(B, 16, Marshal.ReadInt32(p, 8));',
  '        if (DisplayConfigGetDeviceInfo(B) != 0) continue;',
  '        string name = Marshal.PtrToStringUni(new IntPtr(B.ToInt64() + 20));',
  '        Marshal.WriteInt32(B, 0, 9); Marshal.WriteInt32(B, 4, 32); Marshal.WriteInt64(B, 8, Marshal.ReadInt64(p, 20)); Marshal.WriteInt32(B, 16, Marshal.ReadInt32(p, 28));',
  '        if (DisplayConfigGetDeviceInfo(B) != 0) continue;',
  '        int v = Marshal.ReadInt32(B, 20);',
  "        sb.Append(name).Append('=').Append((v & 2) != 0 && (v & 4) == 0 ? 1 : 0).Append(';');",
  '      }',
  '    } finally { Marshal.FreeHGlobal(P); Marshal.FreeHGlobal(M); Marshal.FreeHGlobal(B); }',
  '    return sb.ToString();',
  '  }',
  '}',
  "'@"];
function winDisplaysScript() {
  return ["$ErrorActionPreference = 'Stop'", ...WIN_TYPES,
    '$aware = 0; try { $aware = [int][VsWin]::SetProcessDPIAware() } catch { }',
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dpi = 96; try { $dpi = [int][VsWin]::GetDpiForSystem() } catch { }',
    '$hdr = @{}',
    'try {', ...WIN_HDR_CS, "  foreach ($kv in ([VsHdr]::Read()).Split(';')) { $p = $kv.Split('='); if ($p.Length -eq 2) { $hdr[$p[0]] = [int]$p[1] } }", '} catch { }',
    '$rows = @()',
    'foreach ($s in [System.Windows.Forms.Screen]::AllScreens) { $b = $s.Bounds; $h = -1; if ($hdr.ContainsKey($s.DeviceName)) { $h = $hdr[$s.DeviceName] }; $rows += @{ id = $s.DeviceName; name = $s.DeviceName; x = $b.X; y = $b.Y; w = $b.Width; h = $b.Height; scale = [math]::Round($dpi / 96, 3); primary = [int]$s.Primary; hdr = $h } }',
    "[Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ t = 'displays'; origin = 'top-left'; aware = $aware; rows = $rows } -Compress -Depth 4))"].join('\n');
}
/** The op's argv for this platform. → { ok, argv } | { ok:false, code } */
function displaysArgv(platform) {
  if (platform === 'win32') return { ok: true, argv: [...MD.PS_ARGV, MD.psEncoded(winDisplaysScript())] };
  if (platform === 'darwin') return { ok: true, argv: [OSA, '-l', 'JavaScript', '-e', MAC_DISPLAYS_JXA] };
  return { ok: false, code: 'not_desktop_machine', error: `the display table is for Windows and macOS machines (this one runs ${platform || 'an unknown system'})` };
}
/** The script's one line → { ok, displays: [{id, name, x, y, w, h, scale, primary, hdr}] } in a TOP-LEFT origin (a Mac's y flipped
 *  against its primary screen), or { ok:false, code:'bad_output' }. PURE. */
function parseDisplayFacts(platform, stdout) {
  let o = null;
  for (const line of String(stdout || '').split(/\r?\n/)) { const l = line.trim(); if (!l.startsWith('{')) continue; try { const v = JSON.parse(l); if (v && v.t === 'displays') { o = v; break; } } catch { /* not ours */ } }
  const rows = o && Array.isArray(o.rows) ? o.rows : o && o.rows && typeof o.rows === 'object' ? [o.rows] : null; // PowerShell 5 writes a lone row as an object
  if (!rows || !rows.length) return { ok: false, code: 'bad_output', error: 'the machine did not print its screen table' };
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const flip = o.origin === 'bottom-left';
  const prim = rows.find((r) => r && Number(r.primary)) || rows[0];
  const H0 = num(prim && prim.h) || 0;
  const out = [];
  for (const r of rows.slice(0, 16)) {
    const x = num(r && r.x), y = num(r && r.y), w = num(r && r.w), h = num(r && r.h);
    if (x == null || y == null || !(w > 0) || !(h > 0)) continue;
    out.push({ id: clean(r.id).slice(0, 60) || String(out.length + 1), name: clean(String(r.name || '').replace(/^\\\\\.\\/, '')).slice(0, 80), x, y: flip ? H0 - (y + h) : y, w, h, scale: num(r.scale) > 0 ? num(r.scale) : 1, primary: !!Number(r.primary), hdr: r.hdr === 1 || r.hdr === true ? true : r.hdr === 0 || r.hdr === false ? false : null });
  }
  return out.length ? { ok: true, platform, displays: out } : { ok: false, code: 'bad_output', error: 'the machine printed no usable screen' };
}
/** RUN the op where the screens are (the daemon hands its execFile). → { ok, platform, displays } | { ok:false, code, error } */
function readDisplayFacts({ platform, execFile, env }) {
  const how = displaysArgv(platform);
  if (!how.ok) return Promise.resolve({ ok: false, code: how.code, error: how.error });
  return new Promise((resolve) => {
    execFile(how.argv[0], how.argv.slice(1), { env, windowsHide: true, timeout: DISPLAYS_MS, maxBuffer: 64 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      const r = parseDisplayFacts(platform, stdout);
      if (r.ok) return resolve(r);
      resolve({ ok: false, code: err ? 'displays_failed' : r.code, error: (String(stderr || '').trim().split('\n')[0] || (err && err.message) || r.error).slice(0, 200) });
    });
  });
}

module.exports = { namesGuiApp, TRACK_WAIT_MS, TRACK_POLL_MS, WATCH_POLL_MS, PUSH_MIN_MS, MIN_SIDE, LAUNCH_TAG, STATES, parseLaunchReport, trackRequest, winTrackScript, winPinScript, MAC_TRACK_JXA, MAC_PIN_JXA, trackArgv, pinArgv, dumpReader, parseDumps, screenOf, rectOf, pickTrackedWindow, windowAnswer, targetOf, sameAnswer, cropLayout, paneToMachine, clampToBox, runWindowTrack, pinWindow, DISPLAYS_MS, MAC_DISPLAYS_JXA, winDisplaysScript, displaysArgv, parseDisplayFacts, readDisplayFacts };

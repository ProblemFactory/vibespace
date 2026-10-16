'use strict';
/**
 * THE INPUT INJECTOR — SHARED (the daemon bundles it and runs it where the desktop is; design q-034 §3 P1 → q-041 r2 §2
 * 输入 / §3 P1b, lane stream-p1a-transport). ONE injector per daemon: the `input-events` device op and every WebRTC stream's
 * `input` data channel (src/agentd/stream-host.js) feed THIS instance — there is no second injector.
 *
 *   Windows   a RESIDENT PowerShell (`Add-Type` compiles user32 SendInput ONCE, then one stdin line per command, one answer
 *             line each — ≈ 1 ms an event, measured by q-034's design; the first line waits for the compile). Pointer =
 *             absolute over the VIRTUAL desktop (0–65535 normalized, every display); keys = SCAN codes (layout-independent:
 *             the viewer's physical key reaches the same physical key). UIPI, stated plainly: Windows does not let an
 *             unelevated program's input reach an ELEVATED window (an administrator program, the UAC prompt) and SendInput
 *             says nothing when it drops it — so before a button or a key the script asks whether the window in front is
 *             elevated and answers `uipi` instead of sending (the stats strip names it: "an administrator window has focus").
 *   Linux     a recording STUB (a paired Linux machine's apps open as their own windows — "Its desktop" is Windows / macOS):
 *             every command is appended to `stubFile` as a JSON line — the suites read what would have been sent
 *   macOS     refused by name (`input_unsupported`) — the Mac's injector arrives with the macOS stream (P3)
 *
 *   SCAN_CODES            DOM `code` → [set-1 scan code, extended] (a code the table lacks is refused `unmapped_key`)
 *   commandsOf(ev)        a validated stream-model input event → its command lines (`M x y` · `D b` · `U b` · `W dx dy` ·
 *                         `K scan ext up` · `C <base64 utf-16le>`) — PURE
 *   INPUT_PS              the resident script (its C# compiles once)
 *   createInjector(opts)  → { kind, inject(events) → { ok, n, refused: [{ i, t, code }] }, close() }
 */
const MD = require('./machine-desktop-model.js');

// DOM `code` → [PC/AT set-1 scan code, extended (E0)]. Physical keys only; Pause (an E1 sequence) is not here on purpose.
const k = (scan, ext = 0) => Object.freeze([scan, ext]);
const SCAN_CODES = Object.freeze({
  Escape: k(0x01), Digit1: k(0x02), Digit2: k(0x03), Digit3: k(0x04), Digit4: k(0x05), Digit5: k(0x06), Digit6: k(0x07), Digit7: k(0x08), Digit8: k(0x09), Digit9: k(0x0a), Digit0: k(0x0b),
  Minus: k(0x0c), Equal: k(0x0d), Backspace: k(0x0e), Tab: k(0x0f),
  KeyQ: k(0x10), KeyW: k(0x11), KeyE: k(0x12), KeyR: k(0x13), KeyT: k(0x14), KeyY: k(0x15), KeyU: k(0x16), KeyI: k(0x17), KeyO: k(0x18), KeyP: k(0x19),
  BracketLeft: k(0x1a), BracketRight: k(0x1b), Enter: k(0x1c), ControlLeft: k(0x1d),
  KeyA: k(0x1e), KeyS: k(0x1f), KeyD: k(0x20), KeyF: k(0x21), KeyG: k(0x22), KeyH: k(0x23), KeyJ: k(0x24), KeyK: k(0x25), KeyL: k(0x26),
  Semicolon: k(0x27), Quote: k(0x28), Backquote: k(0x29), ShiftLeft: k(0x2a), Backslash: k(0x2b),
  KeyZ: k(0x2c), KeyX: k(0x2d), KeyC: k(0x2e), KeyV: k(0x2f), KeyB: k(0x30), KeyN: k(0x31), KeyM: k(0x32),
  Comma: k(0x33), Period: k(0x34), Slash: k(0x35), ShiftRight: k(0x36), NumpadMultiply: k(0x37), AltLeft: k(0x38), Space: k(0x39), CapsLock: k(0x3a),
  F1: k(0x3b), F2: k(0x3c), F3: k(0x3d), F4: k(0x3e), F5: k(0x3f), F6: k(0x40), F7: k(0x41), F8: k(0x42), F9: k(0x43), F10: k(0x44),
  NumLock: k(0x45, 1), ScrollLock: k(0x46),
  Numpad7: k(0x47), Numpad8: k(0x48), Numpad9: k(0x49), NumpadSubtract: k(0x4a), Numpad4: k(0x4b), Numpad5: k(0x4c), Numpad6: k(0x4d), NumpadAdd: k(0x4e),
  Numpad1: k(0x4f), Numpad2: k(0x50), Numpad3: k(0x51), Numpad0: k(0x52), NumpadDecimal: k(0x53),
  IntlBackslash: k(0x56), F11: k(0x57), F12: k(0x58), IntlRo: k(0x73), IntlYen: k(0x7d), KanaMode: k(0x70), Convert: k(0x79), NonConvert: k(0x7b),
  F13: k(0x64), F14: k(0x65), F15: k(0x66), F16: k(0x67), F17: k(0x68), F18: k(0x69), F19: k(0x6a), F20: k(0x6b), F21: k(0x6c), F22: k(0x6d), F23: k(0x6e), F24: k(0x76),
  NumpadEnter: k(0x1c, 1), ControlRight: k(0x1d, 1), NumpadDivide: k(0x35, 1), PrintScreen: k(0x37, 1), AltRight: k(0x38, 1),
  Home: k(0x47, 1), ArrowUp: k(0x48, 1), PageUp: k(0x49, 1), ArrowLeft: k(0x4b, 1), ArrowRight: k(0x4d, 1), End: k(0x4f, 1), ArrowDown: k(0x50, 1), PageDown: k(0x51, 1),
  Insert: k(0x52, 1), Delete: k(0x53, 1), MetaLeft: k(0x5b, 1), MetaRight: k(0x5c, 1), ContextMenu: k(0x5d, 1),
});

/** A validated input event (src/stream-model.js inputEventOf) → { lines } | { refused: code }. An `ack` carries no input. */
function commandsOf(ev) {
  if (!ev || typeof ev.t !== 'string') return { refused: 'not_an_event' };
  const at = (e) => `M ${e.x} ${e.y}`;
  switch (ev.t) {
    case 'mv': return { lines: [at(ev)] };
    case 'md': return { lines: [at(ev), `D ${ev.b}`] };
    case 'mu': return { lines: [at(ev), `U ${ev.b}`] };
    case 'wh': return { lines: [at(ev), `W ${ev.dx} ${ev.dy}`] };
    case 'kd': case 'ku': {
      const s = Object.prototype.hasOwnProperty.call(SCAN_CODES, ev.c) ? SCAN_CODES[ev.c] : null;
      return s ? { lines: [`K ${s[0]} ${s[1]} ${ev.t === 'ku' ? 1 : 0}`] } : { refused: 'unmapped_key' };
    }
    case 'clip': return { lines: [`C ${Buffer.from(String(ev.text), 'utf16le').toString('base64')}`] };
    case 'ack': return { lines: [] };
    default: return { refused: 'unknown_kind' };
  }
}

// THE RESIDENT SCRIPT. One command per stdin line, one answer per line: `ok` | `uipi` | `err <what> <win32 error>`. The C#
// compiles once (~1 s); `ready` is the first line out.
const INPUT_PS = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -TypeDefinition @'",
  'using System;',
  'using System.Runtime.InteropServices;',
  'public static class VsInput {',
  '  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }',
  '  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }',
  '  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }',
  '  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }',
  '  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] a, int size);',
  '  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);',
  '  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();',
  '  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
  '  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);',
  '  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr p, uint access, out IntPtr t);',
  '  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr t, int cls, out int v, int len, out int ret);',
  '  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);',
  '  static string Send(INPUT[] a) { uint n = SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT))); return n == a.Length ? "ok" : "err sendinput " + Marshal.GetLastWin32Error(); }',
  '  static INPUT Mouse(int dx, int dy, uint data, uint flags) { INPUT i = new INPUT(); i.type = 0; i.u.mi.dx = dx; i.u.mi.dy = dy; i.u.mi.mouseData = data; i.u.mi.dwFlags = flags; return i; }',
  '  public static string Move(int x, int y) {',
  '    int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77), vw = Math.Max(2, GetSystemMetrics(78)), vh = Math.Max(2, GetSystemMetrics(79));',
  '    int nx = (int)(((long)(x - vx) * 65535) / (vw - 1)), ny = (int)(((long)(y - vy) * 65535) / (vh - 1));',
  '    return Send(new INPUT[] { Mouse(nx, ny, 0, 0x0001 | 0x8000 | 0x4000) });',
  '  }',
  '  public static string Button(int b, bool up) { uint f = b == 2 ? (up ? 0x0010u : 0x0008u) : b == 1 ? (up ? 0x0040u : 0x0020u) : (up ? 0x0004u : 0x0002u); return Send(new INPUT[] { Mouse(0, 0, 0, f) }); }',
  '  public static string Wheel(int dx, int dy) { if (dy != 0) { string r = Send(new INPUT[] { Mouse(0, 0, unchecked((uint)dy), 0x0800) }); if (r != "ok") return r; } return dx != 0 ? Send(new INPUT[] { Mouse(0, 0, unchecked((uint)dx), 0x1000) }) : "ok"; }',
  '  public static string Key(int scan, int ext, int up) { INPUT i = new INPUT(); i.type = 1; i.u.ki.wScan = (ushort)scan; i.u.ki.dwFlags = 0x0008u | (ext == 1 ? 0x0001u : 0u) | (up == 1 ? 0x0002u : 0u); return Send(new INPUT[] { i }); }',
  '  public static bool FrontElevated() {',
  '    uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); if (pid == 0) return false;',
  '    IntPtr p = OpenProcess(0x1000, false, pid); if (p == IntPtr.Zero) return Marshal.GetLastWin32Error() == 5;',
  '    IntPtr t; bool opened = OpenProcessToken(p, 0x0008, out t); int err = Marshal.GetLastWin32Error(); CloseHandle(p);',
  '    if (!opened) return err == 5;',
  '    int elevated = 0, ret; bool got = GetTokenInformation(t, 20, out elevated, 4, out ret); CloseHandle(t);',
  '    return got && elevated != 0;',
  '  }',
  '}',
  "'@",
  "[Console]::Out.WriteLine('ready')",
  'while ($true) {',
  '  $l = [Console]::In.ReadLine(); if ($l -eq $null) { break }',
  "  $a = $l.Split(' ')",
  '  try {',
  '    switch ($a[0]) {',
  "      'M' { $r = [VsInput]::Move([int]$a[1], [int]$a[2]) }",
  "      'D' { $r = if ([VsInput]::FrontElevated()) { 'uipi' } else { [VsInput]::Button([int]$a[1], $false) } }",
  "      'U' { $r = [VsInput]::Button([int]$a[1], $true) }",
  "      'W' { $r = [VsInput]::Wheel([int]$a[1], [int]$a[2]) }",
  "      'K' { $r = if ($a[3] -eq '0' -and [VsInput]::FrontElevated()) { 'uipi' } else { [VsInput]::Key([int]$a[1], [int]$a[2], [int]$a[3]) } }",
  "      'C' { Set-Clipboard -Value ([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($a[1]))); $r = 'ok' }",
  "      default { $r = 'err unknown 0' }",
  '    }',
  "  } catch { $r = 'err ps ' + (($_.Exception.Message -replace '\\s+', ' ').Substring(0, [Math]::Min(120, ($_.Exception.Message -replace '\\s+', ' ').Length))) }",
  '  [Console]::Out.WriteLine($r)',
  '}',
].join('\r\n');

const LINE_MS = 2000;           // one answer's longest wait (the first waits for the compile too: READY_MS)
const READY_MS = 20000;
const RESPAWNS_PER_MIN = 3;
const STUB_MAX_BYTES = 256 * 1024;

/** ONE injector. `spawn` / `env` = the daemon's; `stubFile` = where the Linux stub writes; `fs` = node:fs (the stub's). */
function createInjector({ platform = process.platform, spawn = null, env = process.env, stubFile = null, fs = null, log = () => { }, lineMs = LINE_MS, readyMs = READY_MS } = {}) {
  const kind = platform === 'win32' ? 'sendinput' : platform === 'linux' ? 'stub' : null;
  let child = null, ready = false, buf = '', closed = false;
  const queue = []; // { resolve, timer } in line order
  const spawns = [];
  const settleAll = (answer) => { for (const q of queue.splice(0)) { clearTimeout(q.timer); q.resolve(answer); } };
  function start() {
    const now = Date.now();
    while (spawns.length && now - spawns[0] > 60000) spawns.shift();
    if (spawns.length >= RESPAWNS_PER_MIN) return false;
    spawns.push(now);
    const argv = [...MD.PS_ARGV, MD.psEncoded(INPUT_PS)];
    try { child = spawn(argv[0], argv.slice(1), { env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) { log(`[input] the injector did not start: ${e && e.message}`); child = null; return false; }
    ready = false; buf = '';
    const me = child;
    me.on('error', () => { if (child === me) { child = null; settleAll('err spawn 0'); } });
    me.on('exit', () => { if (child === me) { child = null; settleAll('err exited 0'); } });
    me.stdin.on('error', () => { });
    me.stdout.setEncoding('utf8');
    me.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '').trim(); buf = buf.slice(i + 1);
        if (!ready) { if (line === 'ready') ready = true; continue; }
        const q = queue.shift(); if (q) { clearTimeout(q.timer); q.resolve(line); }
      }
    });
    return true;
  }
  function kill() { const c = child; child = null; ready = false; if (c) { try { c.kill(); } catch { /* gone */ } } }
  function sendLine(line) {
    return new Promise((resolve) => {
      if (closed) return resolve('err closed 0');
      if (!child && !start()) return resolve('err injector_down 0');
      const timer = setTimeout(() => { const i = queue.findIndex((q) => q.timer === timer); if (i >= 0) queue.splice(i, 1); resolve('err timeout 0'); kill(); }, ready ? lineMs : readyMs);
      queue.push({ resolve, timer });
      try { child.stdin.write(line + '\n'); } catch { /* the exit handler settles */ }
    });
  }
  function stubLine(line) {
    if (!stubFile || !fs) return 'ok';
    try {
      fs.appendFileSync(stubFile, JSON.stringify({ at: Date.now(), cmd: line }) + '\n');
      const st = fs.statSync(stubFile);
      if (st.size > STUB_MAX_BYTES) { const t = fs.readFileSync(stubFile, 'utf8'); fs.writeFileSync(stubFile, t.slice(t.length - (STUB_MAX_BYTES >> 1)).replace(/^[^\n]*\n/, '')); }
      return 'ok';
    } catch (e) { return `err stub ${(e && e.code) || 0}`; }
  }
  const codeOf = (answer) => (answer === 'ok' ? null : answer === 'uipi' ? 'uipi_blocked' : /^err (timeout|injector_down|exited|spawn|closed)\b/.test(answer) ? 'injector_' + answer.split(' ')[1].replace('injector_', '') : 'sendinput_failed');
  /** Inject validated events in order. → { ok, n (events fully sent), refused: [{ i, t, code, detail? }] } */
  async function inject(events) {
    const list = Array.isArray(events) ? events : [];
    const refused = [];
    let n = 0;
    if (!kind) return { ok: false, n: 0, refused: list.map((e, i) => ({ i, t: e && e.t, code: 'input_unsupported' })), code: 'input_unsupported', error: 'this machine has no input injector here yet (the Mac\'s arrives with its stream)' };
    for (let i = 0; i < list.length; i++) {
      const c = commandsOf(list[i]);
      if (c.refused) { refused.push({ i, t: list[i] && list[i].t, code: c.refused }); continue; }
      let bad = null;
      for (const line of c.lines) {
        const answer = kind === 'stub' ? stubLine(line) : await sendLine(line);
        const code = codeOf(answer);
        if (code) { bad = { i, t: list[i].t, code, detail: answer }; break; }
      }
      if (bad) refused.push(bad); else n++;
    }
    return { ok: refused.length === 0, n, refused };
  }
  function close() { closed = true; settleAll('err closed 0'); kill(); }
  return { kind, inject, close };
}

module.exports = { SCAN_CODES, commandsOf, INPUT_PS, createInjector };

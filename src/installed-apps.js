'use strict';
/**
 * A PAIRED WINDOWS / macOS MACHINE'S INSTALLED APPS, LISTED BY WITNESS (lane machine-desktop-apps, owner 2026-10-11:
 * "刚才我让 agent 装了 jasp 但是列表里没有" — the machine's desktop dialog offered presets, never what the machine has).
 * SHARED: the daemon bundles it and runs `listInstalled` WHERE the apps are (the `desktop-apps-list` device op); the
 * hub keeps the answer per machine (src/server/desktop-access.js installedApps, cached in data/desktop-apps-hosts.json).
 * Node builtins + the PURE src/machine-desktop-model.js only (every row's launch form is judged by THE run door).
 *
 *   win32   ONE bounded PowerShell script (WIN_LIST_SCRIPT, -EncodedCommand): the Start Menu shortcuts (all users +
 *           this user, `.lnk` resolved through WScript.Shell: target + arguments) and the registry's Uninstall keys
 *           (HKLM, HKLM WOW6432Node, HKCU: DisplayName, DisplayIcon, InstallLocation's top-level .exe names) — the OS's
 *           own records, one JSON object per line → parseWindowsListing (PURE)
 *   darwin  /Applications (+ /Applications/Utilities, + one level of plain folders) and ~/Applications: each `.app`
 *           bundle and its Info.plist (CFBundleExecutable, LSBackgroundOnly) → parseMacListing (PURE)
 * A row = { name, launch, source: 'start-menu' | 'uninstall' | 'applications', seenAt } where `launch` is the EXACT
 * line "Run on its desktop…" takes (desktopRunPlan accepts it): Windows `start "" "<exe>" [args]`, macOS
 * `open -a "<name>"`. Deduplicated by the program (exe + arguments; a bundle's path), sorted by name, at most
 * INSTALLED_MAX rows (`truncated` says so). A malformed line is skipped, never thrown on.
 */
const MD = require('./machine-desktop-model.js');

/** At most this many rows per machine (the dialog filters; a machine with more says `truncated`). */
const INSTALLED_MAX = 500;
/** The device's budget for one listing (the script / the walk is stopped there; the answer says `timedOut`). */
const LIST_BUDGET_MS = 20000;
/** The script's stdout bound (≈ 3000 records of ≤ 1 KB). */
const LIST_MAX_BYTES = 4 * 1024 * 1024;
/** A machine's list is re-asked at most this often when nobody asked for it (the dialog opening on an older list). */
const LIST_REFRESH_MS = 10 * 60 * 1000;
/** A device that dials in again within this of its last listing is not listed again (a flapping link). */
const HELLO_FLOOR_MS = 60 * 1000;
const NAME_MAX = 200;

/** Why a list is asked → is a listing due now? `entry` = the cached `{listedAt}` (null = never listed). PURE.
 *    recheck / install  always (the person pressed Check again / an install through our door just finished)
 *    hello              the daemon's hello, unless it listed within HELLO_FLOOR_MS
 *    open               the dialog opened: only when never listed or older than LIST_REFRESH_MS */
function listDue(entry, why, now) {
  const at = entry && Number.isFinite(entry.listedAt) ? entry.listedAt : null;
  if (why === 'recheck' || why === 'install') return true;
  if (at == null) return true;
  if (why === 'hello') return now - at >= HELLO_FLOOR_MS;
  return now - at >= LIST_REFRESH_MS;
}

// ── Windows ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The ONE script the device runs (PowerShell 5.1 and 7 alike): records only — every judgement is the PURE parser's. */
const WIN_LIST_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  '$sh = New-Object -ComObject WScript.Shell',
  "foreach ($root in @([Environment]::GetFolderPath('CommonStartMenu'), [Environment]::GetFolderPath('StartMenu'))) {",
  "  if (-not $root) { continue }; $d = Join-Path $root 'Programs'",
  '  Get-ChildItem -LiteralPath $d -Recurse -Filter *.lnk -File | Select-Object -First 1500 | ForEach-Object {',
  '    $l = $sh.CreateShortcut($_.FullName)',
  "    [Console]::Out.WriteLine((ConvertTo-Json -Compress ([ordered]@{ k = 'lnk'; n = $_.BaseName; p = $_.FullName; t = [string]$l.TargetPath; a = [string]$l.Arguments })))",
  '  }',
  '}',
  "foreach ($key in @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')) {",
  '  Get-ItemProperty -Path $key | Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName -and -not $_.ReleaseType } | Select-Object -First 1500 | ForEach-Object {',
  '    $loc = [string]$_.InstallLocation; $x = @()',
  '    if ($loc -and (Test-Path -LiteralPath $loc -PathType Container)) { $x = @(Get-ChildItem -LiteralPath $loc -Filter *.exe -File | Select-Object -First 20 | ForEach-Object { $_.Name }) }',
  "    [Console]::Out.WriteLine((ConvertTo-Json -Compress ([ordered]@{ k = 'uninst'; n = [string]$_.DisplayName; i = [string]$_.DisplayIcon; l = $loc; x = $x })))",
  '  }',
  '}',
].join('\n');
/** The argv the device runs (the run door's own PowerShell argv + the script, encoded: no quoting layer at all). */
const winListArgv = () => [...MD.PS_ARGV, MD.psEncoded(WIN_LIST_SCRIPT)];

/** Not an app a person opens: an uninstaller, a setup / updater, a crash reporter. */
const NOT_APP_EXE = /^(unins\d*|uninstall\w*|uninst|setup|update|updater|crashpad_handler|crashreporter|helper|elevate|maintenancetool)\.exe$/i;
const NOT_APP_NAME = /\b(uninstall|uninstaller|readme|release notes|license|documentation|help|website|on the web)\b|卸载|アンインストール/i;
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, NAME_MAX);
const baseOf = (p) => String(p).split(/[\\/]/).pop();
/** The Windows launch line: `start "" "<exe>"` (+ the shortcut's arguments, as Windows keeps them). */
function windowsLaunch(exe, args = '') {
  const a = String(args || '').trim();
  return `start "" "${exe}"${a ? ' ' + a : ''}`;
}
/** A DisplayIcon value (`"C:\x\app.exe",0`, `C:\x\app.exe`) → the exe path, or null. */
function exeOfIcon(icon) {
  const s = String(icon || '').trim().replace(/,\s*-?\d+$/, '').replace(/^"(.*)"$/, '$1').trim();
  return /^[A-Za-z]:\\.+\.exe$/i.test(s) ? s : null;
}
const normName = (s) => String(s).toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]+/g, '');
/** InstallLocation's top-level exes → the one that is the app: the only candidate, else the one the name names. */
function exeOfLocation(loc, names, displayName) {
  const dir = String(loc || '').trim().replace(/[\\/]+$/, '');
  if (!/^[A-Za-z]:\\/.test(dir)) return null;
  const cands = (Array.isArray(names) ? names : typeof names === 'string' ? [names] : []).map(String).filter((n) => /\.exe$/i.test(n) && !NOT_APP_EXE.test(n));
  let pick = cands.length === 1 ? cands[0] : null;
  if (!pick) { const want = normName(displayName); pick = cands.find((n) => { const b = normName(n); return b.length >= 3 && (want.startsWith(b) || b.startsWith(want)); }) || null; }
  return pick ? `${dir}\\${pick}` : null;
}
/** The script's stdout (one JSON object per line) → the rows (PURE). */
function parseWindowsListing(text, { now = Date.now() } = {}) {
  const lnks = [], unins = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    let o; try { o = JSON.parse(s); } catch { continue; }
    if (!o || typeof o !== 'object') continue;
    if (o.k === 'lnk') lnks.push(o); else if (o.k === 'uninst') unins.push(o);
  }
  const rows = [], seen = new Set(), exes = new Set();
  const add = (name, launch, source, key, exe) => {
    if (!name || seen.has(key) || !MD.desktopRunPlan('win32', launch).ok) return;
    seen.add(key); if (exe) exes.add(exe.toLowerCase());
    rows.push({ name, launch, source, seenAt: now });
  };
  for (const o of lnks) {
    const name = clean(o.n), target = clean(o.t), lnk = String(o.p || '').trim();
    if (!name || NOT_APP_NAME.test(name)) continue;
    if (target && /\.exe$/i.test(target)) {
      if (NOT_APP_EXE.test(baseOf(target)) || target.includes('"')) continue;
      const args = clean(o.a);
      add(name, windowsLaunch(target, args), 'start-menu', `${target.toLowerCase()}\u0000${args}`, target);
    } else if (!target && /\.lnk$/i.test(lnk) && !lnk.includes('"')) add(name, windowsLaunch(lnk), 'start-menu', lnk.toLowerCase(), null); // an installer-advertised shortcut: no target to read — the shortcut itself starts it
  }
  for (const o of unins) {
    const name = clean(o.n);
    if (!name || NOT_APP_NAME.test(name)) continue;
    let exe = exeOfIcon(o.i);
    if (exe && NOT_APP_EXE.test(baseOf(exe))) exe = null;
    if (!exe) exe = exeOfLocation(o.l, o.x, name);
    if (!exe || exe.includes('"') || exes.has(exe.toLowerCase())) continue; // the Start Menu already lists that program
    add(name, windowsLaunch(exe), 'uninstall', `${exe.toLowerCase()}\u0000`, exe);
  }
  return capRows(rows);
}

// ── macOS ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** An XML Info.plist's string / boolean value for a key (a binary plist answers null — the bundle's name still lists). */
function plistValue(text, key) {
  const s = String(text || '');
  if (!/<plist[\s>]/.test(s)) return null;
  const i = s.indexOf(`<key>${key}</key>`);
  if (i < 0) return null;
  const m = /^\s*<(string)>([^<]*)<\/string>|^\s*<(true|false)\s*\/>/.exec(s.slice(i + key.length + 11));
  if (!m) return null;
  return m[1] ? m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'") : m[3] === 'true';
}
/** A double-quoted sh word: `\`, `"`, `$` and the backquote escaped (the run door hands the line to `sh -lc`). */
const shQuote = (s) => `"${String(s).replace(/[\\"$`]/g, (c) => '\\' + c)}"`;
/** `[{ path: '/Applications/JASP.app', plist: '<xml…>' | null }]` → the rows (PURE). A name two bundles share opens by path. */
function parseMacListing(entries, { now = Date.now() } = {}) {
  const rows = [], seen = new Set(), names = new Set();
  for (const e of Array.isArray(entries) ? entries : []) {
    const p = e && typeof e.path === 'string' ? e.path.replace(/\/+$/, '') : '';
    if (!/^\/.+\.app$/i.test(p) || seen.has(p.toLowerCase())) continue;
    if (plistValue(e.plist, 'LSBackgroundOnly') === true) continue;
    const name = clean(p.split('/').pop().replace(/\.app$/i, '')); // a Mac name may hold a backslash: only '/' separates
    if (!name) continue;
    const launch = `open -a ${shQuote(names.has(name.toLowerCase()) ? p : name)}`;
    if (!MD.desktopRunPlan('darwin', launch).ok) continue;
    seen.add(p.toLowerCase()); names.add(name.toLowerCase());
    rows.push({ name, launch, source: 'applications', seenAt: now });
  }
  return capRows(rows);
}

/** Sorted by name, at most INSTALLED_MAX → { rows, total, truncated }. */
function capRows(rows) {
  const sorted = rows.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.launch.localeCompare(b.launch));
  return { rows: sorted.slice(0, INSTALLED_MAX), total: sorted.length, truncated: sorted.length > INSTALLED_MAX };
}

/** THE HUB JUDGES AGAIN: a device's rows are peer text — each keeps only a string name (cleaned, ≤ 200), a launch line
 *  the run door accepts for that platform, a known source; `seenAt` = the hub's listing time. → rows (≤ INSTALLED_MAX) */
const SOURCES = Object.freeze(['start-menu', 'uninstall', 'applications']);
function rowsFromDevice(platform, rows, now = Date.now()) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (out.length >= INSTALLED_MAX) break;
    if (!r || typeof r !== 'object' || typeof r.name !== 'string' || typeof r.launch !== 'string' || !SOURCES.includes(r.source)) continue;
    const name = clean(r.name);
    if (!name || !MD.desktopRunPlan(platform, r.launch).ok) continue;
    out.push({ name, launch: r.launch, source: r.source, seenAt: now });
  }
  return out;
}

// ── the device side (the `desktop-apps-list` op) ───────────────────────────────────────────────────────────────
/**
 * LIST THIS MACHINE (runs on the device; bounded by `budgetMs`). `execFile` / `env` = the daemon's own (its sanitised
 * spawn env); `fsp` = fs.promises. → { ok:true, platform, rows, total, truncated, listedAt, ms, timedOut? }
 *                                   | { ok:false, code: 'not_desktop_machine' | 'list_failed', error }
 */
async function listInstalled({ platform = process.platform, home = require('os').homedir(), budgetMs = LIST_BUDGET_MS, execFile = require('child_process').execFile, env = process.env, fsp = require('fs').promises, now = Date.now } = {}) {
  const t0 = now();
  const budget = Math.max(1000, Math.min(Number(budgetMs) || LIST_BUDGET_MS, LIST_BUDGET_MS));
  if (platform === 'win32') {
    const argv = winListArgv();
    const r = await new Promise((resolve) => {
      execFile(argv[0], argv.slice(1), { env, windowsHide: true, timeout: budget, maxBuffer: LIST_MAX_BYTES, encoding: 'utf8' }, (err, stdout) => resolve({ err, stdout: String(stdout || '') }));
    });
    const timedOut = !!(r.err && (r.err.killed || r.err.signal));
    if (r.err && !r.stdout.trim()) return { ok: false, code: 'list_failed', error: `the listing did not run (${String(r.err.message || r.err).split('\n')[0].slice(0, 200)})` };
    return { ok: true, platform, ...parseWindowsListing(r.stdout, { now: t0 }), listedAt: t0, ms: now() - t0, ...(timedOut ? { timedOut: true } : {}) };
  }
  if (platform === 'darwin') {
    const deadline = t0 + budget;
    const entries = [];
    let timedOut = false;
    const readPlist = async (p) => { try { const h = await fsp.open(`${p}/Contents/Info.plist`, 'r'); try { const b = Buffer.alloc(262144); const { bytesRead } = await h.read(b, 0, b.length, 0); return b.subarray(0, bytesRead).toString('utf8'); } finally { await h.close(); } } catch { return null; } };
    const walk = async (dir, depth) => {
      let names; try { names = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const d of names) {
        if (now() > deadline || entries.length >= INSTALLED_MAX * 2) { timedOut = now() > deadline; return; }
        if (!d.isDirectory() || d.name.startsWith('.')) continue;
        const p = `${dir}/${d.name}`;
        if (/\.app$/i.test(d.name)) entries.push({ path: p, plist: await readPlist(p) });
        else if (depth > 0) await walk(p, depth - 1); // Utilities, a vendor's folder (one level)
      }
    };
    await walk('/Applications', 1);
    if (home) await walk(`${home}/Applications`, 1);
    return { ok: true, platform, ...parseMacListing(entries, { now: t0 }), listedAt: t0, ms: now() - t0, ...(timedOut ? { timedOut: true } : {}) };
  }
  return { ok: false, code: 'not_desktop_machine', error: `listing installed apps is for Windows and macOS machines (this one runs ${platform || 'an unknown system'})` };
}

module.exports = { INSTALLED_MAX, LIST_BUDGET_MS, LIST_MAX_BYTES, LIST_REFRESH_MS, HELLO_FLOOR_MS, SOURCES, listDue, WIN_LIST_SCRIPT, winListArgv, windowsLaunch, exeOfIcon, exeOfLocation, parseWindowsListing, plistValue, shQuote, parseMacListing, rowsFromDevice, listInstalled };

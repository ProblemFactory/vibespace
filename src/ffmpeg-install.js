'use strict';
/**
 * 「取得 FFmpeg」 — THE FFMPEG ROW (lane machine-needs-at-pairing pick 2; the owner 2026-11-13: «需要 ffmpeg 之类的事情不能在安装的时候
 * 自动解决吗？»). A paired Windows machine's stream (the whole display, one window), its sound and the viewer's microphone need an
 * ffmpeg 7 or newer with ddagrab and a rung of the H.264 ladder (src/stream-plan.js ffmpegVerdict / pickEncoder). This row is what
 * fetches one: a PUBLISHED build, its address FIXED (never a moving «latest»), the archive's SHA-256 AND the unpacked ffmpeg.exe's
 * SHA-256 PINNED here — no publisher signs a Windows ffmpeg (measured: an empty certificate table in every build looked at), so
 * the two fingerprints are its whole pin. The MACHINE fetches it, from the publisher (the hub never carries the bytes), into the
 * user's own folder (%LOCALAPPDATA%\vibespace\ffmpeg\bin — no administrator rights, no prompt), and the plan writes a STAMP
 * beside it that the agent checks before it uses that copy (src/agentd/stream-screen.js). ffmpeg listens on nothing.
 * The rows, measured 2026-11-12 (FFmpeg 9.0.2 — every rung of the ladder, libx264 included, av1_nvenc, libopus, ddagrab — read
 * from each build's own published configure lists and the binary's embedded configure line, never by running it):
 *   1st  gyan.dev's release «essentials» build, its GitHub mirror (kept since 2020)       GPL-3.0
 *   2nd  BtbN FFmpeg-Builds' month-end autobuild of the 9.0 branch (its prune script removes it in 2028-10)   GPL-3.0
 * The 2nd is tried when the 1st's address answers nothing or its bytes differ. A release moves the rows; nothing moves them on a
 * clock. PURE: asks only src/machine-desktop-model.js (psEncoded, PS_ARGV). Registered in src/installs.js; the hub's install
 * door runs the plan on the machine through its agent (src/server/desktop-access.js — an unelevated run, `stream`).
 */
const { psEncoded, PS_ARGV } = require('./machine-desktop-model.js');

/** Where the fetched copy lives (the agent's lookup knows the folder: src/stream-plan.js ffmpegCandidates). */
const FFMPEG_FOLDER = '%LOCALAPPDATA%\\vibespace\\ffmpeg\\bin';
/** The stamp the plan writes beside the copy it fetched: `{ sha256, label, url }` — the agent checks that copy against it. */
const FFMPEG_STAMP = 'ffmpeg.exe.vibespace.json';
/** The marker a running fetch writes beside the folder (its PowerShell's pid): the agent's facts say `fetching` while that run lives —
 *  the hub keeps its install slot held after a timeout or a lost link until the machine says the run ended (the reader's item 6). */
const FFMPEG_FETCHING = 'ffmpeg.fetching';
const FFMPEG_BUILDS = Object.freeze([
  Object.freeze({
    id: 'gyan-9.0.2-essentials', label: 'FFmpeg 9.0.2', version: '9.0.2', publisher: 'gyan.dev',
    url: 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip',
    bytes: 114768076, sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',
    member: 'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe', memberBytes: 105423872,
    memberSha256: '3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec',
    licence: 'GPL-3.0', signer: null,
  }),
  Object.freeze({
    id: 'btbn-n9.0.2-39-20261031', label: 'FFmpeg 9.0.2', version: '9.0.2', publisher: 'BtbN FFmpeg-Builds',
    url: 'https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/autobuild-2026-10-31-12-59/ffmpeg-n9.0.2-39-g7adfbe40dc-win64-gpl-9.0.zip',
    bytes: 195110184, sha256: '693f3e224bc184b40524a62ca47526cfebaf2504414021b92fe75f677ad868b9',
    member: 'ffmpeg-n9.0.2-39-g7adfbe40dc-win64-gpl-9.0/bin/ffmpeg.exe', memberBytes: 165984256,
    memberSha256: 'c930b63cb1ee8b7e2eaf9c15161160edd5c9acad34f0303b5855c8eb142a7e8d',
    licence: 'GPL-3.0', signer: null,
  }),
]);
const FFMPEG = FFMPEG_BUILDS[0];
/** Every exe fingerprint a stamp may name (lower-case hex). */
const FFMPEG_EXE_PINS = Object.freeze(FFMPEG_BUILDS.map((b) => b.memberSha256));
/** The stamp's text → `{ sha256, label }` | null (a malformed stamp names nothing; the copy is then judged as unstamped). */
function stampOf(text) {
  try { const o = JSON.parse(String(text || '')); return o && /^[0-9a-f]{64}$/.test(String(o.sha256 || '')) ? { sha256: String(o.sha256), label: typeof o.label === 'string' ? o.label.slice(0, 80) : null } : null; } catch { return null; }
}
/** May the agent use a stamped copy whose bytes hash to `sha256`? (its stamp names that hash, and the hash is a pinned build's) */
const stampedCopyOk = (stamp, sha256) => !!stamp && stamp.sha256 === String(sha256 || '').toLowerCase() && FFMPEG_EXE_PINS.includes(stamp.sha256);
const MB = (n) => Math.round(n / 1e6);
/** Why a build was not fetched — the plan prints `VS-FFMPEG-ROW <code> <label>` per failed build (machine-needs pick 3c: the
 *  page says each code's sentence in the interface's language; the raw line stays in the fold). */
const FFMPEG_FAIL_CODES = Object.freeze(['no_folder', 'download_failed', 'archive_differs', 'member_missing', 'exe_differs', 'not_placed']);
const FFMPEG_ROW_PREFIX = 'VS-FFMPEG-ROW ';
/** The run's output → its failed builds `[{ code, label }]` (a code it does not know is kept as said; the page has a sentence for that too). */
function fetchRowsOf(text) {
  const out = [];
  for (const l of String(text || '').split(/\r?\n/)) { const m = /^VS-FFMPEG-ROW ([a-z_]{1,40}) (.{1,120})$/.exec(l.trim()); if (m) out.push({ code: m[1], label: m[2] }); }
  return out;
}

/**
 * THE PLAN (PURE; `f` = `{platform}` — the agent's hello, no facts op): an UNELEVATED PowerShell the machine's agent runs
 * (`stream: true` — the access layer streams its output; no prompt, no slot shell). For each row in turn: download into a fresh
 * folder beside the bin folder, check the archive's SHA-256, take the ONE named member out (never a path the archive names),
 * check ffmpeg.exe's SHA-256, put it in place (the previous copy back if that fails), write the stamp. A row that fails says why
 * and the next is tried; none ⇒ exit 1 with nothing changed.
 *   → { ok:true, what:'ffmpeg', label, source, packages, url, sha256, bytes, folder, licence, signer:null, commands, argv,
 *       stream:true, uac:false, canRun:true } | { ok:false, code: no_facts | not_windows, error }
 */
function ffmpegInstallPlan(f) {
  const platform = f && typeof f === 'object' ? f.platform : null;
  if (!platform) return { ok: false, code: 'no_facts', error: 'the machine did not say what it runs — reconnect it' };
  if (platform !== 'win32') return { ok: false, code: 'not_windows', error: 'ffmpeg is fetched for a Windows machine — a Mac encodes with its own screen helper' };
  const row = (b) => `  @{ label = '${b.label} (${b.publisher})'; url = '${b.url}'; sha = '${b.sha256.toUpperCase()}'; member = '${b.member}'; exe = '${b.memberSha256.toUpperCase()}'; mb = ${MB(b.bytes)} }`;
  const commands = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    "$bin = Join-Path $env:LOCALAPPDATA 'vibespace\\ffmpeg\\bin'; $home0 = Split-Path $bin",
    '$null = New-Item -ItemType Directory -Force -Path $bin',
    "$dest = Join-Path $bin 'ffmpeg.exe'; $prev = Join-Path $bin 'ffmpeg.exe.old'; $stamp = Join-Path $bin '" + FFMPEG_STAMP + "'",
    // the edges a killed run leaves (the reader's item 6): a stray .old with no ffmpeg.exe is PUT BACK (never deleted); a stray
    // download folder (up to ~360 MB) is removed; THIS run says it is running (the agent's facts read it: the hub holds its slot)
    'if (-not (Test-Path -LiteralPath $dest) -and (Test-Path -LiteralPath $prev)) { Move-Item -LiteralPath $prev -Destination $dest -Force; Write-Host \'Put back the ffmpeg.exe a stopped run had set aside\' }',
    "Get-ChildItem -LiteralPath $home0 -Directory -Filter '.dl-*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue",
    "$fetching = Join-Path $home0 '" + FFMPEG_FETCHING + "'; Set-Content -NoNewline -LiteralPath $fetching -Value $PID",
    '$builds = @(',
    FFMPEG_BUILDS.map(row).join(",\n"),
    ')',
    '$done = $null; $why = @(); $rows = @()',
    'try {',
    'foreach ($b in $builds) {',
    "  $dl = Join-Path $home0 ('.dl-' + [guid]::NewGuid().ToString('N'))",
    '  try {',
    // each step names the CODE a failure there is (FFMPEG_FAIL_CODES — the page says its sentence in the interface's language)
    "    $step = 'no_folder'",
    '    $null = New-Item -ItemType Directory -Force -Path $dl',
    "    $zip = Join-Path $dl 'ffmpeg.zip'; $part = Join-Path $dl 'ffmpeg.exe'",
    "    Write-Host ('Downloading ' + $b.label + ' (' + $b.mb + ' MB) from ' + $b.url)",
    "    $step = 'download_failed'",
    "    try { Invoke-WebRequest -UseBasicParsing -Uri $b.url -OutFile $zip } catch { throw ('the download failed (' + $_.Exception.Message + ')') }",
    "    $step = 'archive_differs'",
    "    if ((Get-FileHash -Algorithm SHA256 $zip).Hash -ne $b.sha) { throw 'the download is not the pinned file (its SHA-256 differs)' }",
    "    $step = 'member_missing'",
    '    $z = [IO.Compression.ZipFile]::OpenRead($zip)',
    "    try { $e = $z.GetEntry($b.member); if (-not $e) { throw ('the archive holds no ' + $b.member) }; [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $part, $true) } finally { $z.Dispose() }",
    "    $step = 'exe_differs'",
    "    if ((Get-FileHash -Algorithm SHA256 $part).Hash -ne $b.exe) { throw 'the unpacked ffmpeg.exe is not the pinned file (its SHA-256 differs)' }",
    // the stamp is written BESIDE first, then the exe replaced in ONE step (ReplaceFile keeps the old copy at .old until the new
    // one is in place — a kill never leaves no ffmpeg.exe), then the stamp renamed; the old copy goes only after that
    "    $step = 'not_placed'",
    "    Set-Content -NoNewline -LiteralPath ($stamp + '.new') -Value ('{\"sha256\":\"' + $b.exe.ToLower() + '\",\"label\":\"' + $b.label + '\"}')",
    '    if (Test-Path -LiteralPath $dest) { [IO.File]::Replace($part, $dest, $prev) } else { Move-Item -LiteralPath $part -Destination $dest }',
    '    $done = $b; Remove-Item -LiteralPath $stamp -Force -ErrorAction SilentlyContinue',
    "    try { Move-Item -LiteralPath ($stamp + '.new') -Destination $stamp -Force } catch { Write-Host ('ffmpeg.exe is in place, but its stamp was not written (' + $_.Exception.Message + ') - the agent judges it as a copy a person put there') }",
    '    Remove-Item -LiteralPath $prev -Force -ErrorAction SilentlyContinue',
    "    Write-Host ('Fetched ' + $b.label + ' - both SHA-256 fingerprints checked - into ' + $bin)",
    '    break',
    "  } catch { $why += ($b.label + ': ' + $_.Exception.Message); $rows += ('VS-FFMPEG-ROW ' + $step + ' ' + $b.label); Write-Host ('NOT FETCHED from ' + $b.url + ': ' + $_.Exception.Message) }",
    "  finally { Remove-Item -LiteralPath $dl -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath ($stamp + '.new') -Force -ErrorAction SilentlyContinue }",
    '}',
    '} finally { Remove-Item -LiteralPath $fetching -Force -ErrorAction SilentlyContinue }',
    // the LAST line names each build's own reason (the reader's item 4): «not the pinned file» is told apart from «no network»
    // each failed build's CODE, one line apiece, just before the last line (fetchRowsOf reads them; the last line stays the words)
    "if (-not $done) { $rows | ForEach-Object { Write-Host $_ } }",
    "if (-not $done) { Write-Host ('ffmpeg was not fetched - ' + ($why -join '; ') + ' - nothing was changed'); exit 1 }",
    "try { $v = & $dest -hide_banner -version 2>&1 | Select-Object -First 1; Write-Host $v } catch { Write-Host ('Windows did not start ffmpeg.exe: ' + $_.Exception.Message) }",
    'exit 0',
  ];
  return {
    ok: true, what: 'ffmpeg', label: `${FFMPEG.label} (${FFMPEG.publisher})`, source: FFMPEG.publisher, packages: [FFMPEG.label],
    url: FFMPEG.url, sha256: FFMPEG.sha256, bytes: FFMPEG.bytes, folder: FFMPEG_FOLDER, licence: FFMPEG.licence, signer: null,
    commands, argv: [...PS_ARGV, psEncoded(commands.join('\n'))], stream: true, uac: false, canRun: true, code: null, error: null,
  };
}

/** THE FFMPEG INSTALLABLE (src/installs.js registers it): planned from the agent's hello, people only (an agent's bearer is refused
 *  at the route), refused by name on this machine, done once the machine's stream facts name an ffmpeg that PASSES. */
const FFMPEG_INSTALL = Object.freeze({ id: 'ffmpeg', from: 'hello', humanOnly: true, local: Object.freeze({ code: 'not_windows', error: 'ffmpeg is fetched by a paired Windows machine' }), plan: ffmpegInstallPlan, done: 'ffmpeg' });

module.exports = { FFMPEG_FAIL_CODES, FFMPEG_ROW_PREFIX, fetchRowsOf, FFMPEG, FFMPEG_BUILDS, FFMPEG_FOLDER, FFMPEG_STAMP, FFMPEG_FETCHING, FFMPEG_EXE_PINS, stampOf, stampedCopyOk, ffmpegInstallPlan, FFMPEG_INSTALL };

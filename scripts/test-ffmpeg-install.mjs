#!/usr/bin/env node
// 「取得 FFmpeg」 + THE SETTINGS DOORS (lane machine-needs-at-pairing pick 2; 主开发's laws 2, 4, 5 and Q5) — fast, PURE + in-process:
//   ① THE ROW IS PINNED: every build a fixed address (a release asset by its tag — never a moving «latest»), the archive's AND
//      ffmpeg.exe's SHA-256 (64 hex), sizes, the one member, a licence, no signer (none exists) — CONTROL: a «latest» address fails
//   ② THE PLAN: Windows only (a Mac / Linux not_windows, no platform no_facts); what PowerShell runs IS the shown commands; the
//      order — download, the archive's hash, the ONE member out, ffmpeg.exe's hash, into place, the stamp; nothing elevated
//   ③ REGISTERED: src/installs.js names the row — people only, planned from the hello, done = the stream facts' verdict
//   ④ THE AGENT CHECKS A FETCHED COPY BEFORE IT RUNS IT (Q5): the daemon's own lookup (src/agentd/stream-screen.js facts) with the
//      machine's files stood in — a stamped copy whose bytes changed is NOT run and the refusal names it; an unstamped copy (a
//      person put it there) is judged as before; the stamp's verdict (PURE): only a pinned build's fingerprint passes
//   ⑤ THE HUB'S ROAD: an unelevated, streamed run (never the slot shell Windows lacks); done = ffmpegPasses on the facts read again
//   ⑥ THE SETTINGS DOORS: the panes by name (a Mac's Sharing + the Command Line Tools' installer; Windows' Remote Desktop + Sound);
//      a Windows machine's agent opens its ms-settings: page through a hidden PowerShell's Start-Process; an unknown page is refused by name
//   (the reader's list on 7774887da — int359 acc-399 mn2 — each item a leg, RED on 7774887da:)
//   ⑦ THE PINS: a digest of FFMPEG_BUILDS held here (M1–M4: a hash character, the member, the address)
//   ⑧ THE PLAN'S EDGES, read (no PowerShell on this box — the owner's acceptance is its first run): one placement that keeps the old
//      copy until the new is in (M8), a stray .old put back, a killed run's download folder swept (M9), a stamp failing after the
//      move said truly, the running marker, each row's own reason on the last line
//   ⑨ THE HUB: people only (M16), the shown digest (M10), the done line names the build fetched, both rows' reasons as the error,
//      the slot held after a timeout while the machine says its fetch runs, the route's pane table (M12), a hub refusal said as one
//   ⑩ THE ONE ACCESSOR on every road (screen, window, voice, sound) + the census of the agent's ffmpeg starts; an unreadable hash
//      not remembered
//   ⑪ WHAT A PERSON READS: the sheet before the press (ONE button), the done line, the microphone card per state (MUST 1), the
//      settings doors' reasons by code
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { factsLine } from './fixtures/stream/screen-fakes.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const done = () => { console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`); process.exit(fail ? 1 : 0); };
const has = (rel) => fs.existsSync(path.join(REPO, rel));
const SP = require(path.join(REPO, 'src/stream-plan.js'));

console.log('① THE ROW IS PINNED');
if (!has('src/ffmpeg-install.js')) { ok(false, 'the ffmpeg row exists (src/ffmpeg-install.js)'); done(); }
const FF = require(path.join(REPO, 'src/ffmpeg-install.js'));
const pinned = (b) => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\/[\w.-]+\/[\w.-]+\.zip$/.test(b.url) && !/latest/i.test(b.url) && /^[0-9a-f]{64}$/.test(b.sha256) && /^[0-9a-f]{64}$/.test(b.memberSha256) && b.bytes > 1e7 && b.memberBytes > 1e7 && /\/bin\/ffmpeg\.exe$/.test(b.member) && /^GPL|^LGPL/.test(b.licence) && b.signer === null;
ok(FF.FFMPEG_BUILDS.length === 2 && FF.FFMPEG_BUILDS.every(pinned) && FF.FFMPEG === FF.FFMPEG_BUILDS[0], `two builds, each a fixed release asset + two SHA-256 + sizes + its member + a licence, no signer (${FF.FFMPEG_BUILDS.map((b) => `${b.publisher} ${b.version}`).join(' · ')})`, FF.FFMPEG_BUILDS);
ok(!pinned({ ...FF.FFMPEG, url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' }), 'CONTROL: the moving «latest» address (the owner\'s own build came from it) fails the rule');
ok(JSON.stringify(FF.FFMPEG_EXE_PINS) === JSON.stringify(FF.FFMPEG_BUILDS.map((b) => b.memberSha256)), 'the exe fingerprints a stamp may name are exactly the builds\'');

console.log('② THE PLAN');
const p = FF.ffmpegInstallPlan({ platform: 'win32' });
const decoded = Buffer.from(p.argv[p.argv.length - 1], 'base64').toString('utf16le');
ok(p.ok && p.what === 'ffmpeg' && decoded === p.commands.join('\n') && p.argv[0] === 'powershell.exe' && p.argv.includes('-EncodedCommand'), 'what PowerShell runs IS the shown commands (one encoded script, no quoting layer)');
const at = (re) => p.commands.findIndex((l) => re.test(l));
const order = [new RegExp(`\\$stamp = Join-Path \\$bin '${FF.FFMPEG_STAMP.replace(/\./g, '\\.')}'`), /Invoke-WebRequest/, /Get-FileHash -Algorithm SHA256 \$zip/, /ExtractToFile\(\$e, \$part/, /Get-FileHash -Algorithm SHA256 \$part/, /Set-Content -NoNewline -LiteralPath \(\$stamp \+ '\.new'\)/, /\[IO\.File\]::Replace\(\$part, \$dest, \$prev\)/, /Move-Item -LiteralPath \(\$stamp \+ '\.new'\) -Destination \$stamp/].map(at);
ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), 'the order: download → the archive\'s SHA-256 → the ONE named member out → ffmpeg.exe\'s SHA-256 → the stamp written beside → into place in ONE step → the stamp in', order);
ok(!/RunAs|Start-Process|sudo/i.test(decoded) && p.stream === true && p.uac === false && p.canRun, 'nothing elevated: no RunAs, no Start-Process — an unelevated, streamed run into the person\'s own folder');
ok(FF.FFMPEG_BUILDS.every((b) => decoded.includes(b.sha256.toUpperCase()) && decoded.includes(b.memberSha256.toUpperCase()) && decoded.includes(b.url)), 'both builds ride the script — the 2nd is tried when the 1st fails');
ok(FF.ffmpegInstallPlan({ platform: 'darwin' }).code === 'not_windows' && FF.ffmpegInstallPlan({ platform: 'linux' }).code === 'not_windows' && FF.ffmpegInstallPlan(null).code === 'no_facts', 'a Mac / Linux ⇒ not_windows; no platform ⇒ no_facts');

console.log('③ REGISTERED');
const I = require(path.join(REPO, 'src/installs.js'));
const row = I.installRow('ffmpeg');
ok(row === FF.FFMPEG_INSTALL && row.from === 'hello' && row.humanOnly === true && row.done === 'ffmpeg' && row.local.code === 'not_windows', 'src/installs.js registers it: people only, planned from the hello, done = the stream facts\' verdict, refused by name on this machine');

console.log('④ THE AGENT CHECKS A FETCHED COPY BEFORE IT RUNS IT');
const pin = FF.FFMPEG.memberSha256;
ok(FF.stampedCopyOk({ sha256: pin }, pin.toUpperCase()) && !FF.stampedCopyOk({ sha256: pin }, 'a'.repeat(64)) && !FF.stampedCopyOk({ sha256: 'b'.repeat(64) }, 'b'.repeat(64)) && FF.stampOf('not json') === null, 'the stamp\'s verdict: its own fingerprint AND a pinned build\'s — a stamp naming anything else passes nothing');
{
  const { createScreen } = require(path.join(REPO, 'src/agentd/stream-screen.js'));
  const FOLDER = '/m/lad/vibespace/ffmpeg/bin', exe = `${FOLDER}/ffmpeg.exe`;
  const look = async ({ stamp }) => {
    const ran = [];
    const bytes = Buffer.from('a copy that changed since it was fetched');
    const files = new Map([[exe, bytes], ...(stamp ? [[`${FOLDER}/${FF.FFMPEG_STAMP}`, Buffer.from(JSON.stringify(stamp))]] : [])]);
    const fsFake = {
      statSync: (q) => { if (!files.has(q)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return { isFile: () => true, size: files.get(q).length, mtimeMs: 1 }; },
      readFileSync: (q) => { if (!files.has(q)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return files.get(q).toString('utf8'); },
      createReadStream: (q) => { const { Readable } = require('node:stream'); return Readable.from([files.get(q)]); },
    };
    const execFile = (file, args, opts, cb) => {
      if (file === 'powershell.exe') return cb(null, factsLine([{ id: 'D1', x: 0, y: 0, w: 1920, h: 1080, primary: true, hdr: null, white: null, adapter: null }]) + '\n', '');
      ran.push(file);
      cb(null, args.includes('-version') ? 'ffmpeg version 9.0.2-essentials_build-www.gyan.dev\n' : args.includes('-filters') ? ' ... ddagrab           |->V       Grab Windows Desktop images\n' : ' V....D h264_nvenc           NVIDIA NVENC H.264 encoder\n', '');
    };
    const S = createScreen({ platform: 'win32', execFile, spawn: () => { throw new Error('no spawn'); }, env: {}, lookupEnv: { PATH: '', LOCALAPPDATA: '/m/lad', USERPROFILE: '/m/home' }, fs: fsFake });
    const f = await S.facts({ force: true });
    return { ff: f.ffmpeg, verdict: SP.ffmpegVerdict(f.ffmpeg), ran, sha: crypto.createHash('sha256').update(bytes).digest('hex') };
  };
  const changed = await look({ stamp: { sha256: pin, label: 'FFmpeg 9.0.2 (gyan.dev)' } });
  ok(changed.ff && changed.ff.changed && changed.ran.length === 0 && changed.verdict.code === 'no_ffmpeg' && /not the copy VibeSpace fetched/.test(changed.verdict.error) && /fetch it again/.test(changed.verdict.error), 'a STAMPED copy whose bytes changed is never run — the refusal names it and says fetch it again', changed);
  const own = await look({ stamp: null });
  ok(own.ff && !own.ff.changed && own.ran.length === 3 && own.verdict.ok, 'an UNSTAMPED copy in that folder (a person put it there, as the old words told them) is judged as before — asked, and it passes', own);
}

console.log('⑤ THE HUB\'S ROAD');
const acc = fs.readFileSync(path.join(REPO, 'src/server/desktop-access.js'), 'utf8'), routes = fs.readFileSync(path.join(REPO, 'src/routes/desktop-apps.js'), 'utf8');
ok(/if \(plan && plan\.stream\) \{[^\n]*\n\s*try \{ return await runStreamInstall\(/.test(acc) && acc.indexOf('if (plan && plan.stream)') < acc.indexOf('if (plan && (plan.uac || plan.adminDialog))') && /async function runStreamInstall[\s\S]{0,1600}dm\.runStream\(plan\.argv\[0\][\s\S]{0,1600}streamFacts\(hostId, \{ force: true \}\)/.test(acc), 'installPackage runs a `stream` plan through the agent\'s runStream (never the slot shell), then reads the stream facts again');
ok(/const ffmpegDone = \(r\) =>[\s\S]{0,400}SPL\.ffmpegPasses\(ff\)/.test(routes) && /ffmpeg: \(\) => ffmpegDone/.test(routes) && /machine\.ffmpegPasses = SPL\.ffmpegPasses\(machine\.ffmpeg\)/.test(routes), 'done = ffmpegPasses on those facts (still_absent otherwise); the facts route tells the page whether a door is owed');

console.log('⑥ THE SETTINGS DOORS');
ok(['sharing', 'screen', 'accessibility', 'clt', 'remotedesktop', 'sound'].every((x) => SP.SETTINGS_PANES.includes(x)) && SP.WIN_SETTINGS.remotedesktop === 'ms-settings:remotedesktop' && SP.WIN_SETTINGS.sound === 'ms-settings:sound' && SP.MAC_DOORS.clt.join(' ') === '/usr/bin/xcode-select --install' && /^x-apple\.systempreferences:/.test(SP.MAC_SETTINGS.sharing || ''), 'the panes by name: a Mac\'s Sharing + the Command Line Tools\' own installer; Windows\' Remote Desktop + Sound');
{
  const { createScreen } = require(path.join(REPO, 'src/agentd/stream-screen.js'));
  const asked = [];
  let refuse = false;
  const S = createScreen({ platform: 'win32', execFile: (file, args, opts, cb) => { asked.push([file, ...args, opts && opts.windowsHide]); cb(refuse ? Object.assign(new Error('exit 1'), { code: 1 }) : null, '', refuse ? 'blocked' : ''); }, spawn: () => null, env: {}, lookupEnv: {}, fs: { statSync: () => { throw new Error('ENOENT'); } } });
  const r = typeof S.openSettings === 'function' ? await S.openSettings('sound') : null;
  const bad = typeof S.openSettings === 'function' ? await S.openSettings('regedit') : null;
  refuse = true; const no = typeof S.openSettings === 'function' ? await S.openSettings('remotedesktop') : null;
  ok(r && r.ok && JSON.stringify(asked[0]) === JSON.stringify(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', "Start-Process 'ms-settings:sound'", true]) && bad && bad.code === 'bad_pane' && asked.length === 2 && no && no.code === 'open_failed', 'a Windows machine\'s agent opens Sound by its ms-settings: name (a HIDDEN PowerShell — its console never shows); an unknown page is refused by name, nothing run; a refusal says so', { r, bad, no, asked });
}
const mac = fs.readFileSync(path.join(REPO, 'src/agentd/stream-mac.js'), 'utf8');
ok(/Object\.prototype\.hasOwnProperty\.call\(SP\.MAC_DOORS, pane\)[\s\S]{0,300}H\.run\(file, args, 10000\)/.test(mac), 'a Mac\'s agent runs a door that is a program (the Command Line Tools\' installer) from the PURE table, by name');

console.log('⑦ THE PINS — what the row says IS what was measured (the reader\'s item 5)');
// THE TABLE'S DIGEST: every address, size, SHA-256 and member of FFMPEG_BUILDS. A release moves the rows (measured as
// ffmpeg-builds was — the archive downloaded into its own empty folder, both hashes taken, the member listed); THIS digest moves
// in that same commit. Kills: one hex character of either SHA-256, another member path, another release address (M1–M4).
const FFMPEG_BUILDS_SHA256 = 'e87366c0f0f302d52feb3f9af3a5089497db2d8c8312d78013dc2d88ac1894ac';
const tableSha = crypto.createHash('sha256').update(JSON.stringify(FF.FFMPEG_BUILDS)).digest('hex');
ok(tableSha === FFMPEG_BUILDS_SHA256, 'FFMPEG_BUILDS is the measured table — an edit to a hash, a member, an address or a size is RED until this digest moves with its measurement', { tableSha });
{
  const M1 = JSON.stringify([{ ...FF.FFMPEG_BUILDS[0], sha256: '7' + FF.FFMPEG_BUILDS[0].sha256.slice(1) }, FF.FFMPEG_BUILDS[1]]);
  const M3 = JSON.stringify([{ ...FF.FFMPEG_BUILDS[0], member: 'ffmpeg-9.0.2-essentials_build/doc/bin/ffmpeg.exe' }, FF.FFMPEG_BUILDS[1]]);
  ok([M1, M3].every((x) => crypto.createHash('sha256').update(x).digest('hex') !== FFMPEG_BUILDS_SHA256), 'CONTROL: one archive-hash character (M1) / another member path (M3) gives another digest');
}

console.log('⑧ THE PLAN\'S EDGES (the reader\'s items 4 + 6; read, never run — no PowerShell on this box: the owner\'s acceptance is its first run)');
{
  const C = p.commands, ix = (re) => C.findIndex((l) => re.test(l));
  const iPutBack = ix(/^if \(-not \(Test-Path -LiteralPath \$dest\) -and \(Test-Path -LiteralPath \$prev\)\) \{ Move-Item -LiteralPath \$prev -Destination \$dest -Force;/);
  const iSweep = ix(/^Get-ChildItem -LiteralPath \$home0 -Directory -Filter '\.dl-\*' .*\| Remove-Item -Recurse -Force/);
  const MARK = String(FF.FFMPEG_FETCHING || 'ffmpeg.fetching'); // (a base without the marker reds by name here, never a throw)
  const iMark = ix(new RegExp(`^\\$fetching = Join-Path \\$home0 '${MARK.replace(/\./g, '\\.')}'; Set-Content -NoNewline -LiteralPath \\$fetching -Value \\$PID$`));
  const iLoop = ix(/^foreach \(\$b in \$builds\) \{$/), iDl = ix(/^ {2}\$dl = Join-Path \$home0 \('\.dl-' \+ \[guid\]::NewGuid\(\)/);
  const iSwap = ix(/^ {4}if \(Test-Path -LiteralPath \$dest\) \{ \[IO\.File\]::Replace\(\$part, \$dest, \$prev\) \} else \{ Move-Item -LiteralPath \$part -Destination \$dest \}$/);
  const iDone = ix(/^ {4}\$done = \$b; Remove-Item -LiteralPath \$stamp /);
  const iStampIn = ix(/^ {4}try \{ Move-Item -LiteralPath \(\$stamp \+ '\.new'\) -Destination \$stamp -Force \} catch \{ Write-Host \('ffmpeg\.exe is in place, but its stamp was not written \(/);
  const iOldGone = ix(/^ {4}Remove-Item -LiteralPath \$prev /);
  const iCatch = ix(/^ {2}\} catch \{ \$why \+= \(\$b\.label \+ ': ' \+ \$_\.Exception\.Message\);/);
  const iFinally = ix(/^ {2}finally \{ Remove-Item -LiteralPath \$dl -Recurse -Force -ErrorAction SilentlyContinue;/);
  const iOuter = ix(/^\} finally \{ Remove-Item -LiteralPath \$fetching -Force/);
  const iLast = ix(/^if \(-not \$done\) \{ Write-Host \('ffmpeg was not fetched - ' \+ \(\$why -join '; '\) \+ ' - nothing was changed'\); exit 1 \}$/);
  const touchesOld = (l) => /(Move-Item|Remove-Item) -LiteralPath \$(dest|prev)\b/.test(l);
  ok(iSwap > iLoop && C.slice(iLoop, iSwap).every((l) => !touchesOld(l)) && iOldGone > iStampIn, 'A KILL BETWEEN THE MOVES leaves an ffmpeg.exe: ONE placement (ReplaceFile keeps the old copy at .old in the same step the new one comes in); nothing moves or removes the old copy before it; .old goes only after the stamp is in (M8: «the rollback removed» has no line to take)', { iLoop, iSwap, iStampIn, iOldGone });
  ok(iPutBack >= 0 && iPutBack < iLoop && C.slice(0, iPutBack).every((l) => !touchesOld(l)) && C.filter((l) => /Remove-Item -LiteralPath \$prev\b/.test(l)).length === 1, 'A STRAY .old IS PUT BACK, never deleted: with no ffmpeg.exe, the copy a stopped run set aside goes back first; the one removal of .old follows THIS run\'s own placement', { iPutBack });
  ok(iSweep >= 0 && iSweep < iLoop && iDl > iLoop && iFinally > iCatch && iCatch > iSwap, 'A KILLED RUN\'S .dl-<guid> FOLDER IS REMOVED by the next run (the sweep before any download — the same .dl- prefix), and THIS run\'s in each row\'s finally (M9: «the temp folder never removed» is red)', { iSweep, iDl, iFinally });
  ok(iDone > iSwap && iDone < iStampIn && /the agent judges it as a copy a person put there/.test(C[iStampIn] || ''), 'A STAMP WRITE FAILING AFTER THE MOVE IS SAID TRULY: the run counts as done the moment ffmpeg.exe is in (the last line never says «nothing was changed» after it), and the stamp\'s own failure says ffmpeg.exe is in place and how the agent will judge it');
  ok(iMark > iSweep && iMark < iLoop && iOuter > iFinally && iLast > iOuter, 'THE RUN SAYS IT RUNS: its pid in ' + MARK + ' before the first download, removed in the outer finally (the hub holds its slot while it lives — ⑨)');
  ok(iCatch > 0 && iLast > 0 && ix(/^ {4}try \{ Invoke-WebRequest .* \} catch \{ throw \('the download failed \(' \+ \$_\.Exception\.Message \+ '\)'\) \}$/) > iLoop && ix(/throw 'the download is not the pinned file \(its SHA-256 differs\)'/) > iLoop && ix(/throw 'the unpacked ffmpeg\.exe is not the pinned file \(its SHA-256 differs\)'/) > iLoop, 'BOTH ROWS FAILED ⇒ THE LAST LINE NAMES EACH ROW\'S OWN REASON (the reader\'s item 4): «the download failed (…)» apart from «not the pinned file (its SHA-256 differs)», each with its build\'s label');
}

console.log('⑨ THE HUB\'S SLOT, ITS WORDS, THE ROUTE\'S DOORS (the reader\'s items 3, 4, 6, 7; M10, M12, M16)');
{
  const express = require(REPO + '/node_modules/express');
  const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
  const DA = require(path.join(REPO, 'src/server/desktop-access.js'));
  const passing = { path: 'C:\\Users\\u\\AppData\\Local\\vibespace\\ffmpeg\\bin\\ffmpeg.exe', where: '%LOCALAPPDATA%\\vibespace\\ffmpeg\\bin', version: '9.0.2', major: 9, ddagrab: true, encoders: ['h264_nvenc'] };
  const runs = [], opens = [];
  let runImpl = async () => ({ code: 0 }), facts = { ok: true, platform: 'win32', ffmpeg: passing }, openImpl = async (pane) => ({ ok: true, pane });
  const handle = {
    status: () => ({ connected: true, info: { platform: 'win32', capabilities: ['settings-open'] } }), desktopServe: () => { },
    runStream: async (cmd, args, o) => { runs.push([cmd, args]); return runImpl(o); },
    streamFacts: async () => facts,
    settingsOpen: async (pane) => { opens.push(pane); return openImpl(pane); },
  };
  const hosts = { deviceBounded: async (h) => (h === 'win-a' ? handle : null), get: (h) => (h === 'win-a' ? { id: h } : null), isLocal: (h) => h === 'local' };
  const access = DA.create({ hosts, log: { log() { }, warn() { } }, installMs: 600, pollMs: 25 });
  R.setup({ keeper: {}, access, vnc: {} });
  const app = express(); app.use(express.json()); app.use(R.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (u, body, h = {}) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) });
  const lines = async (res) => (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const shown = await (await fetch(`${base}/api/desktop/install-plan?host=win-a&what=ffmpeg`)).json();
    const n0 = runs.length;
    const agent = await post('/api/desktop/install', { host: 'win-a', what: 'ffmpeg', planDigest: shown.digest }, { Authorization: 'Bearer vsst_' + 'a'.repeat(40) });
    ok(agent.status === 403 && (await agent.json()).code === 'human_only' && runs.length === n0, 'POST install with an agent\'s bearer ⇒ 403 human_only, nothing ran (M16: the route\'s people-only line)');
    const stale = await lines(await post('/api/desktop/install', { host: 'win-a', what: 'ffmpeg', planDigest: 'f'.repeat(32) }));
    ok(stale.length === 1 && stale[0].code === 'plan_changed' && runs.length === n0, 'PLAN_CHANGED (M10): a press naming a digest that is not the plan\'s ⇒ plan_changed, nothing ran', stale);
    facts = { ok: true, platform: 'win32', ffmpeg: { ...passing, fetched: 'FFmpeg 9.0.2 (BtbN FFmpeg-Builds)' } };
    runImpl = async (o) => { o.onData(Buffer.from('NOT FETCHED from https://github.com/GyanD/…: the download failed (Unable to connect to the remote server)\nFetched FFmpeg 9.0.2 (BtbN FFmpeg-Builds) - both SHA-256 fingerprints checked\n')); return { code: 0 }; };
    const good = await lines(await post('/api/desktop/install', { host: 'win-a', what: 'ffmpeg', planDigest: shown.digest }));
    const end = good[good.length - 1];
    ok(runs.length === n0 + 1 && JSON.stringify(runs[n0]) === JSON.stringify([p.argv[0], p.argv.slice(1)]) && end.done && end.label === 'FFmpeg 9.0.2 (BtbN FFmpeg-Builds)', 'the shown digest runs EXACTLY the plan\'s argv; THE DONE LINE NAMES THE BUILD THAT WAS FETCHED (its stamp\'s label through the facts — after a fallback the 2nd row, never the 1st\'s)', end);
    const both = (a, b) => `NOT FETCHED from x: ${a}\nNOT FETCHED from y: ${b}\nffmpeg was not fetched - FFmpeg 9.0.2 (gyan.dev): ${a}; FFmpeg 9.0.2 (BtbN FFmpeg-Builds): ${b} - nothing was changed\n`;
    const failWith = async (text) => { runImpl = async (o) => { o.onData(Buffer.from(text)); return { code: 1 }; }; const l = await lines(await post('/api/desktop/install', { host: 'win-a', what: 'ffmpeg' })); return l[l.length - 1]; };
    const hashE = await failWith(both('the download is not the pinned file (its SHA-256 differs)', 'the download is not the pinned file (its SHA-256 differs)'));
    const netE = await failWith(both('the download failed (Unable to connect to the remote server)', 'the download failed (Unable to connect to the remote server)'));
    ok(hashE.code === 'install_failed' && /gyan\.dev\): the download is not the pinned file/.test(hashE.error) && /BtbN FFmpeg-Builds\): the download is not the pinned file/.test(hashE.error) && /Unable to connect/.test(netE.error) && !/log above/.test(hashE.error + netE.error), 'BOTH ROWS FAILED ⇒ the hub\'s error IS the run\'s last line: each row\'s own reason, «not the pinned file» apart from «no network» — never «the log above says why»', { hashE: hashE.error, netE: netE.error });
    // THE SLOT AFTER A TIMEOUT: the machine says a fetch still runs ⇒ held; it says none ⇒ free (the agent's run-stream child outlives a lost link)
    facts = { ok: true, platform: 'win32', ffmpeg: passing, fetching: true };
    runImpl = async () => ({ code: null, timedOut: true });
    const timed = await lines(await post('/api/desktop/install', { host: 'win-a', what: 'ffmpeg' }));
    const nT = runs.length;
    await sleep(80);
    const again = await post('/api/desktop/install', { host: 'win-a', what: 'ffmpeg' });
    const againJ = await again.json().catch(() => null);
    facts = { ok: true, platform: 'win32', ffmpeg: passing, fetching: false };
    runImpl = async () => ({ code: 0 });
    let freed = false; for (let i = 0; i < 40 && !freed; i++) { await sleep(25); freed = !access.installBusy('win-a'); }
    ok(timed[timed.length - 1].code === 'install_timeout' && again.status === 409 && againJ && againJ.code === 'busy' && runs.length === nT && freed, 'AFTER A TIMEOUT THE SLOT STAYS HELD while the machine says its fetch runs (a second press ⇒ 409 busy, no second PowerShell), and is free once the machine says none runs', { status: again.status, againJ, freed });
    // THE SETTINGS DOORS: the route lets only a named pane through (M12); the hub's own refusal is said as a refusal (item 7)
    const nO = opens.length;
    const bad1 = await post('/api/desktop/machine-desktop/settings-open', { host: 'win-a', pane: 'ms-settings:windowsupdate' });
    const bad2 = await post('/api/desktop/machine-desktop/settings-open', { host: 'win-a', pane: 'constructor' });
    ok(bad1.status === 400 && bad2.status === 400 && opens.length === nO, 'settings-open: an unlisted page (ms-settings:windowsupdate) or a prototype name ⇒ 400, the machine is never asked (M12)');
    openImpl = async () => { throw Object.assign(new Error('the user denied it: VibeSpace may not act on "win-a" — nothing was done'), { code: 'hub_act_denied', stage: 'gate' }); };
    const refused = await (await post('/api/desktop/machine-desktop/settings-open', { host: 'win-a', pane: 'sound' })).json();
    openImpl = async () => { throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED', stage: 'connect' }); };
    const gone = await post('/api/desktop/machine-desktop/settings-open', { host: 'win-a', pane: 'sound' });
    const goneJ = await gone.json();
    ok(refused.ok === false && refused.code === 'hub_act_denied' && /denied/.test(refused.error) && goneJ.code === 'host_unavailable', 'a refusal at the hub\'s send point comes back AS a refusal (its code and words) — only a machine that cannot be reached is host_unavailable', { refused, goneJ });
  } finally { srv.close(); }
}

console.log('⑩ ONLY THE PINNED BYTES ARE RUN, ON EVERY ROAD — the ONE accessor and the census of the agent\'s ffmpeg spawns (the reader\'s item 2)');
{
  ok(typeof SP.runnableFfmpeg === 'function', 'THE accessor exists: SP.runnableFfmpeg (the ffmpeg this agent may run)');
  const R = typeof SP.runnableFfmpeg === 'function' ? SP.runnableFfmpeg : () => 'absent';
  const good = { path: 'C:\\f\\ffmpeg.exe', version: '9.0.2', major: 9, ddagrab: true, encoders: ['h264_nvenc'] };
  const roads = ['screen', 'window', 'voice', 'sound'];
  ok(roads.every((r) => R({ ...good, changed: 'it is not the copy VibeSpace fetched' }, r) === null) && roads.every((r) => R(good, r) === good.path), 'a fetched copy whose bytes changed ⇒ null on EVERY road (screen, window, voice, sound); a copy that passes ⇒ its path');
  ok(R({ ...good, ddagrab: false }, 'screen') === null && R({ ...good, ddagrab: false }, 'window') === good.path && R({ ...good, encoders: [] }, 'window') === null && R({ ...good, encoders: [] }, 'voice') === good.path && R(good, 'nonsense') === null && R(null, 'voice') === null, 'each road its own verdict: the screen = ddagrab + a rung, one window = a rung, the voice / the sound = the program; an unknown road ⇒ null');
  const { createScreen } = require(path.join(REPO, 'src/agentd/stream-screen.js'));
  const FOLDER = '/m/lad/vibespace/ffmpeg/bin', exe = `${FOLDER}/ffmpeg.exe`;
  const agentWith = (stamp, { readFails = 0 } = {}) => {
    const files = new Map([[exe, Buffer.from('a copy whose bytes are not a pinned build')], ...(stamp ? [[`${FOLDER}/${FF.FFMPEG_STAMP}`, Buffer.from(JSON.stringify(stamp))]] : [])]);
    let reads = 0;
    const fsFake = {
      statSync: (q) => { if (!files.has(q)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return { isFile: () => true, size: files.get(q).length, mtimeMs: 1 }; },
      readFileSync: (q) => { if (!files.has(q)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return files.get(q).toString('utf8'); },
      createReadStream: (q) => { const { Readable } = require('node:stream'); reads++; if (reads <= readFails) { const r = new Readable({ read() { } }); setImmediate(() => r.destroy(Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }))); return r; } return Readable.from([files.get(q)]); },
    };
    const execFile = (file, args, opts, cb) => {
      if (file === 'powershell.exe') return cb(null, factsLine([{ id: 'D1', x: 0, y: 0, w: 1920, h: 1080, primary: true, hdr: null, white: null, adapter: null }]) + '\n', '');
      cb(null, args.includes('-version') ? 'ffmpeg version 9.0.2-essentials_build-www.gyan.dev\n' : args.includes('-filters') ? ' ... ddagrab           |->V       Grab Windows Desktop images\n' : ' V....D h264_nvenc           NVIDIA NVENC H.264 encoder\n', '');
    };
    const S = createScreen({ platform: 'win32', execFile, spawn: () => { throw new Error('no spawn'); }, env: {}, lookupEnv: { PATH: '', LOCALAPPDATA: '/m/lad', USERPROFILE: '/m/home' }, fs: fsFake });
    return { S, reads: () => reads };
  };
  const changed = agentWith({ sha256: FF.FFMPEG.memberSha256, label: 'FFmpeg 9.0.2 (gyan.dev)' });
  const own = agentWith(null);
  const has = typeof changed.S.runnable === 'function';
  const cr = has ? await Promise.all(roads.map((r) => changed.S.runnable({ road: r }))) : ['absent'];
  const or = has ? await Promise.all(roads.map((r) => own.S.runnable({ road: r }))) : ['absent'];
  ok(has && cr.every((x) => x === null) && or.every((x) => x === exe), 'the AGENT\'s accessor (createScreen().runnable): a changed stamped copy ⇒ nothing on every road; an unstamped copy that passes ⇒ its path', { cr, or });
  // an UNREADABLE hash refuses THIS time and is never remembered (reader 6): the next look reads the bytes again
  const busy = agentWith({ sha256: FF.FFMPEG.memberSha256, label: 'FFmpeg 9.0.2 (gyan.dev)' }, { readFails: 1 });
  const f1 = await busy.S.facts({ force: true }), f2 = await busy.S.facts({ force: true });
  ok(/could not be read/.test(String(f1.ffmpeg && f1.ffmpeg.changed)) && busy.reads() === 2 && /not the copy VibeSpace fetched/.test(String(f2.ffmpeg && f2.ffmpeg.changed)), 'A HASH THAT COULD NOT BE READ is not remembered as «changed» for ever: refused that once (and said so), the next look hashes the bytes again', { f1: f1.ffmpeg && f1.ffmpeg.changed, f2: f2.ffmpeg && f2.ffmpeg.changed, reads: busy.reads() });
  // THE VOICE'S OWN LOOKUP: on Windows it runs only what the accessor says — never a PATH scan of its own
  const DM = require(path.join(REPO, 'src/desktop-mic.js'));
  const onPath = { promises: { stat: async (f) => (/ffmpeg(\.exe)?$/.test(f) ? { isFile: () => true } : Promise.reject(new Error('ENOENT'))), readFile: async () => { throw new Error('ENOENT'); } } };
  const mk = (platform, ffmpeg) => DM.createMic({ platform, spawn: () => null, execFile: () => null, env: {}, lookupEnv: { PATH: platform === 'win32' ? 'C:\\tools' : '/usr/bin', LOCALAPPDATA: 'C:\\lad' }, fs: onPath, home: '/h', ffmpeg });
  const [wNo, wNone, lin] = [await mk('win32', async () => null).ffmpegPath(), await mk('win32', null).ffmpegPath(), await mk('linux', null).ffmpegPath()];
  ok(wNo === null && wNone === null && lin === '/usr/bin/ffmpeg', 'the voice on Windows: the accessor says none ⇒ none (no PATH scan around it), and with no accessor it looks nowhere of its own; off Windows (the suites\' road, where no fetched copy exists) its lookup stands', { wNo, wNone, lin });
  const agentd = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  ok(/createMic\(\{[^\n]*\n {2}ffmpeg: process\.platform === 'win32' \? \(\) => streamScreenOf\(\)\.runnable\(\{ road: 'voice' \}\) : null \}\)\);/.test(agentd) && /createSound\(\{[^\n]*ffmpegPath: \(\) => \(process\.platform === 'win32' \? streamScreenOf\(\)\.runnable\(\{ road: 'sound' \}\) :/.test(agentd), 'the agent wires the voice and the sound to THE accessor on Windows (the suites\' VIBESPACE_SOUND_FFMPEG stands in off Windows only)');
  // THE CENSUS: every call that starts a program in the files of the ffmpeg roads, classified — an ffmpeg start names where its
  // path comes from (the accessor); anything else names what it runs. A new spawn site in these files, or one whose first argument
  // names ffmpeg anywhere in the agent, is RED until it has its row.
  const FFMPEG_STARTS = [
    { file: 'src/agentd/stream-screen.js', call: 'spawn(plan.ffmpeg', n: 2, from: 'SP.planScreen → SP.runnableFfmpeg(screen) — the still and the encoder' },
    { file: 'src/agentd/stream-screen.js', call: 'run(c.path', n: 3, from: 'the verdict\'s own probe (-version / -filters / -encoders), AFTER the stamp check: a changed fetched copy returns before it' },
    { file: 'src/agentd/stream-window-source.js', call: 'spawn(plan.ffmpeg', n: 1, from: 'SP.planWindow → SP.runnableFfmpeg(window)' },
    { file: 'src/desktop-mic.js', call: 'spawn(ff', n: 1, from: 'ffmpegPath() → the agent\'s accessor (voice) on Windows' },
    { file: 'src/desktop-sound.js', call: 'spawn(ff', n: 1, from: 'ffmpegPath → the agent\'s accessor (sound) on Windows' },
  ];
  const NOT_FFMPEG = {
    'src/agentd/stream-screen.js': ['execFile(file', "run('powershell.exe'"],
    'src/agentd/stream-window-source.js': ['execFile(file', 'run(plan.csc', 'run(h.exe', 'spawn(plan.helper'],
    'src/desktop-mic.js': ['execFile(file', "run('/usr/bin/xcode-select'", 'run(plan.csc', 'run(s.file', 'run(h.exe', 'run(sp.file', 'spawn(sp.file'],
    'src/desktop-sound.js': ['spawn(h.exe'],
  };
  const SITE = /\b((?:spawn|execFile|spawnSync|execFileSync|run)\(\s*[^,()]+)/g;
  const sites = (rel) => [...fs.readFileSync(path.join(REPO, rel), 'utf8').matchAll(SITE)].map((m) => m[1].replace(/\(\s+/, '('));
  const wrong = [];
  for (const rel of Object.keys(NOT_FFMPEG)) {
    const got = sites(rel), rows = FFMPEG_STARTS.filter((r) => r.file === rel);
    for (const r of rows) { const n = got.filter((x) => x === r.call).length; if (n !== r.n) wrong.push(`${rel}: ${r.call} ×${n}, the census says ×${r.n}`); }
    for (const x of got) if (!rows.some((r) => r.call === x) && !NOT_FFMPEG[rel].includes(x)) wrong.push(`${rel}: an unclassified start «${x}»`);
  }
  const agentFiles = execFileSync('git', ['ls-files', 'src'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((f) => /^src\/(agentd\/)?[^/]+\.js$/.test(f)); // the agent's own tree + the shared src/*.js it requires
  for (const rel of agentFiles) for (const x of sites(rel)) if (/ffmpeg|\bff\b/i.test(x) && !FFMPEG_STARTS.some((r) => r.file === rel && r.call === x)) wrong.push(`${rel}: «${x}» starts an ffmpeg with no census row`);
  ok(wrong.length === 0, `THE CENSUS of the agent's ffmpeg starts: ${FFMPEG_STARTS.map((r) => `${r.file.replace(/^src\//, '')} ${r.call}…) ×${r.n}`).join(' · ')} — each from the accessor`, wrong);
  const planted = 'const x = 1;\n  const c = spawn(found.path, args);\n  spawn(plan.ffmpeg, a);\n';
  const pl = [...planted.matchAll(SITE)].map((m) => m[1]);
  ok(pl.includes('spawn(found.path') && pl.includes('spawn(plan.ffmpeg'), 'CONTROL: the census\'s net sees a planted start by its first argument');
}

console.log('⑪ WHAT A PERSON READS — the sheet BEFORE the press, the done line, the microphone card, the settings doors\' reasons (the reader\'s MUST 1 and items 3, 4, 7)');
{
  const esbuild = require(REPO + '/node_modules/esbuild');
  const STUBS = {
    './i18n.js': 'export const t = (s, p) => String(s).replace(/\\{(\\w+)\\}/g, (m, k) => (p && k in p ? String(p[k]) : m)); export const tc = (c, s, p) => t(s, p);',
    './utils.js': 'export const fetchJson = (u, o) => globalThis.__fetchJson(u, o); export const showToast = (m, o) => globalThis.__toasts.push([m, (o && o.type) || null]); export const createModalShell = (o) => globalThis.__shell(o); export const copyText = () => Promise.resolve();',
  };
  const bundle = async (entry) => {
    const out = await esbuild.build({ entryPoints: [path.join(REPO, entry)], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
      plugins: [{ name: 'stubs', setup(b) { b.onResolve({ filter: /^\.\/(i18n|utils)\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' })); } }] });
    const mod = { exports: {} }; new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require); return mod.exports;
  };
  class N {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parent = null; this.style = {}; this.dataset = {}; this.className = ''; this._text = ''; this.hidden = false; this.disabled = false; this.title = ''; this.type = '';
      this.classList = { toggle: (c, on) => { const s = new Set(this.className.split(/\s+/).filter(Boolean)); if (on === undefined ? !s.has(c) : on) s.add(c); else s.delete(c); this.className = [...s].join(' '); }, contains: (c) => this.className.split(/\s+/).includes(c), add: (c) => this.classList.toggle(c, true), remove: (c) => this.classList.toggle(c, false) }; }
    append(...xs) { for (const x of xs) { if (x == null) continue; const n = typeof x === 'string' ? Object.assign(new N('#text'), { _text: x }) : x; n.parent = this; this.children.push(n); } }
    appendChild(x) { this.append(x); return x; }
    replaceChildren(...xs) { this.children = []; this.append(...xs); }
    insertBefore(x) { this.append(x); }
    setAttribute() { }
    set textContent(v) { this.children = []; this._text = String(v); } get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    all(pred) { const out = []; const walk = (n) => { for (const c of n.children) { if (pred(c)) out.push(c); walk(c); } }; walk(this); return out; }
  }
  globalThis.document = { createElement: (tg) => new N(tg) };
  globalThis.__toasts = [];
  const sheets = [];
  globalThis.__shell = (o) => { const body = new N('div'); const sh = { opts: o, body, close() { } }; sheets.push(sh); return sh; };
  // ── 「取得 FFmpeg」: the press opens THE SHEET; nothing is asked of the hub or the machine until its ONE button
  const D = await bundle('src/lib/ffmpeg-door.js');
  const asked = [];
  globalThis.__fetchJson = async (u) => { asked.push(u); return { plan: { ok: true }, digest: 'd' }; };
  let ndjson = '';
  globalThis.fetch = async (u) => { asked.push(u); return { ok: true, body: new Response(ndjson).body }; };
  const said = [];
  const door = D.ffmpegDoor('win-a', { machine: 'WIN-DESK1', say: (x, bad) => said.push([x, !!bad]) });
  door.onclick();
  const sh = sheets[sheets.length - 1];
  const text = sh ? sh.body.textContent : '';
  const buttons = sh ? sh.body.all((n) => n.tagName === 'BUTTON') : [];
  const A = FF.FFMPEG_BUILDS[0], B2 = FF.FFMPEG_BUILDS[1], mb = (n) => `${Math.round(n / 1e6)} MB`;
  const facts = [['the build', A.label], ['its publisher', A.publisher], ['its size', mb(A.bytes)], ['WHERE: its release on GitHub', A.url.replace(/^https:\/\//, '')], ['the licence', A.licence], ['where it lands', FF.FFMPEG_FOLDER], ['no administrator right', 'No administrator rights are asked'], ['VibeSpace did not build it', 'VibeSpace did not build it'], ['two fingerprints', 'two fixed SHA-256 fingerprints'], ['the 2nd named build', B2.publisher], ['its size', mb(B2.bytes)], ['its address', B2.url.replace(/^https:\/\//, '')]];
  const missing = facts.filter(([, w]) => !text.includes(w)).map(([k]) => k);
  ok(sh && asked.length === 0 && missing.length === 0 && /WIN-DESK1/.test(sh.opts.title || ''), 'THE PRESS OPENS THE SHEET and nothing runs: it says the build, its publisher and size, WHERE (its release on GitHub), the licence, where it lands, that no administrator right is asked, that VibeSpace did not build it and two fingerprints are checked, and the second named build with its size and address', { asked, missing, text: text.slice(0, 900) });
  ok(buttons.length === 1 && buttons[0].className.includes('ffmpeg-get-go'), 'the sheet has ONE button', buttons.map((b) => b.textContent));
  ndjson = [JSON.stringify({ log: 'NOT FETCHED from …gyan…: the download failed (Unable to connect)' }), JSON.stringify({ done: true, what: 'ffmpeg', label: 'FFmpeg 9.0.2 (BtbN FFmpeg-Builds)' })].join('\n') + '\n';
  if (buttons[0]) await buttons[0].onclick();
  const lastOk = said.length ? said[said.length - 1][0] : '';
  const statusEl = sh ? sh.body.all((n) => n.className.includes('ffmpeg-get-status'))[0] : null;
  ok(asked.length === 2 && /install-plan\?host=win-a&what=ffmpeg/.test(asked[0]) && asked[1] === '/api/desktop/install' && /BtbN FFmpeg-Builds/.test(lastOk) && !/gyan/.test(lastOk) && !!statusEl && /^Fetched FFmpeg 9\.0\.2 \(BtbN FFmpeg-Builds\)/.test(statusEl.textContent), 'its ONE button runs the fetch; THE SUCCESS LINE NAMES THE BUILD THAT WAS FETCHED (after a fallback: BtbN, not gyan.dev) — on the line and in the sheet', { asked, lastOk });
  ndjson = JSON.stringify({ error: 'win-a: ffmpeg was not fetched - FFmpeg 9.0.2 (gyan.dev): the download is not the pinned file (its SHA-256 differs); FFmpeg 9.0.2 (BtbN FFmpeg-Builds): the download failed (Unable to connect to the remote server) - nothing was changed', code: 'install_failed' }) + '\n';
  said.length = 0;
  await D.getFfmpeg('win-a', (x, bad) => said.push([x, !!bad]));
  const lastBad = said.length ? said[said.length - 1] : ['', false];
  ok(lastBad[1] && /gyan\.dev\): the download is not the pinned file/.test(lastBad[0]) && /BtbN FFmpeg-Builds\): the download failed/.test(lastBad[0]), 'BOTH ROWS FAILED ⇒ the line a person is left with names each row\'s reason', lastBad);
  // ── THE MICROPHONE CARD: each state says ITSELF (MUST 1 — no state but an unknown one reads the red error)
  const M = await bundle('src/lib/stream-mic-strip.js');
  const STATES = { installed: { state: 'installed', mic: { name: 'CABLE Output' }, micIsDefault: true }, absent: { state: 'absent' }, reboot_owed: { state: 'reboot_owed', mic: { name: 'CABLE Output' } }, inactive: { state: 'inactive' } };
  const WANT = { installed: 'Virtual microphone: «CABLE Output» (the default microphone)', absent: 'No virtual microphone — your voice plays on its speakers', reboot_owed: 'Virtual microphone: «CABLE Output»', inactive: 'VB-CABLE is installed, but its devices are turned off' };
  const cards = {};
  for (const [k, st] of Object.entries(STATES)) {
    globalThis.__fetchJson = async () => ({ state: st, doors: {}, facts: {} });
    const card = M.createMicCard({ hostId: 'win-a', machine: 'WIN-DESK1', install: () => { } });
    await card.refresh();
    const line = card.el.all((n) => n.className.includes('machine-mic-state'))[0];
    cards[k] = { text: line ? line.textContent : '', bad: !!(line && line.classList.contains('is-bad')), sound: card.el.all((n) => n.dataset && n.dataset.pane === 'sound').length };
  }
  ok(Object.keys(STATES).every((k) => cards[k].text.startsWith(WANT[k]) && !cards[k].bad), 'THE MICROPHONE CARD per state — installed, absent, reboot_owed, inactive — each line says its own state, none in red «did not say where your voice would go»', cards);
  ok(cards.inactive.sound === 1 && ['installed', 'absent', 'reboot_owed'].every((k) => cards[k].sound === 0), 'the Sound page\'s door rides the inactive state only');
  // ── THE SETTINGS DOORS SAY WHY, by the answer's code (item 7)
  const S = await bundle('src/lib/machine-settings-door.js');
  const toastFor = async (answer) => { globalThis.__toasts.length = 0; globalThis.__fetchJson = async () => answer; await S.openMachineSettings('win-a', 'WIN-DESK1', 'sound'); return globalThis.__toasts[0] || ['', null]; };
  const [off, old, hub, no, none, yes] = [await toastFor({ error: 'win-a: connect ECONNREFUSED', code: 'host_unavailable' }), await toastFor({ ok: false, code: 'agent_too_old', error: 'its agent cannot open its Settings' }), await toastFor({ ok: false, code: 'hub_act_denied', error: 'the user denied it' }), await toastFor({ ok: false, code: 'open_failed', error: 'Windows did not open ms-settings:sound (blocked)' }), await toastFor(null), await toastFor({ ok: true, pane: 'sound' })];
  const byHand = 'On WIN-DESK1, open Settings › System › Sound';
  ok(/not connected/.test(off[0]) && /older than this hub/.test(old[0]) && /This hub refused it/.test(hub[0]) && /blocked/.test(no[0]) && /no answer from the server/.test(none[0]) && [off, old, hub, no, none].every((x) => x[1] === 'error' && x[0].endsWith(byHand)) && yes[1] === null, 'A SETTINGS DOOR THAT DID NOT OPEN SAYS WHY by the answer\'s code — not connected / an older agent / the hub refused / the machine\'s own failure / no answer — then where to go by hand', { off, old, hub, no, none });
}
done();

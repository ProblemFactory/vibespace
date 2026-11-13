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
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
const order = [/Invoke-WebRequest/, /Get-FileHash -Algorithm SHA256 \$zip/, /ExtractToFile\(\$e, \$part/, /Get-FileHash -Algorithm SHA256 \$part/, /Move-Item -LiteralPath \$part -Destination \$dest/, new RegExp(`Set-Content .*${FF.FFMPEG_STAMP.replace(/\./g, '\\.')}`)].map(at);
ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), 'the order: download → the archive\'s SHA-256 → the ONE named member out → ffmpeg.exe\'s SHA-256 → into place → the stamp', order);
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
ok(acc.indexOf('if (plan && plan.stream) return await runStreamInstall(') > 0 && acc.indexOf('if (plan && plan.stream)') < acc.indexOf('if (plan && (plan.uac || plan.adminDialog))') && /async function runStreamInstall[\s\S]{0,900}dm\.runStream\(plan\.argv\[0\][\s\S]{0,900}streamFacts\(hostId, \{ force: true \}\)/.test(acc), 'installPackage runs a `stream` plan through the agent\'s runStream (never the slot shell), then reads the stream facts again');
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
done();

#!/usr/bin/env node
// THE `vnc-native` RUNG's PURE PIECES (design 014 D1, lane desktop-vnc-native, 2026-10-03) — fast, no process, no
// network. A Windows / macOS paired machine's WHOLE DESKTOP is its own VNC server (macOS Screen Sharing, a TightVNC
// service); the hub probes it by reading the greeting, and starts commands on that desktop from the owner's box.
//   §1 rfbGreeting (src/desktop-display.js): 3.3 / 3.7 / 3.8 / Apple's 3.889 greetings; type lists with 1 (none), 2
//      (VNC), 30 (ARD), an unknown type, ARD before VNC (the server's order wins, as in noVNC); a refusal and its
//      reason; a greeting cut at EVERY byte is `truncated` (never a verdict); not-RFB bytes; an unsupported version;
//      the reply the probe sends back
//   §2 the tables pinned to the BUNDLED noVNC (node_modules/@novnc/novnc/core/rfb.js): its supported security types
//      and its version switch — a noVNC upgrade that changes either reds here
//   §3 desktopRunPlan (src/desktop-apps.js): the line runs WHOLE and is shown as itself — darwin: a positional $1,
//      never pasted into the script; win32: the decoded -EncodedCommand holds it as ONE PowerShell literal (`&&`,
//      quotes and the typographic single quotes inside); refusals by name: multi_line, hidden characters of every
//      class (named by code point), too_long, empty, not_desktop_machine
//   §4 the TightVNC plan: the closed flag table frozen (loopback only + loopback allowed, no HTTP port, no firewall
//      exception, 5900, VNC auth), the URL + SHA-256 pinned, no password in the plan, the UAC starter (no_admin exit)
//   §5 presets + the remembered lines; psEncoded = node's own UTF-16LE base64 (astral characters included)
//   CONTROLS — patched copies (scripts/mutant-copy.mjs), each rule removed ⇒ its leg red
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require(path.join(repo, 'src/desktop-display.js'));
const A = require(path.join(repo, 'src/desktop-apps.js'));
const MUT = mutantCopies('rfbg', repo);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : ''}`); } };
const B = (...parts) => Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))));
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; };
const ch = (cp) => String.fromCodePoint(cp);

console.log('§1 rfbGreeting');
const G = D.rfbGreeting;
{
  const g38 = G(B('RFB 003.008\n', [2, 1, 2]));
  ok(g38.ok && g38.server === '003.008' && g38.reply === 'RFB 003.008\n' && g38.type === 1 && g38.auth === 'none' && g38.types.join() === '1,2', '3.8, types [1, 2] ⇒ the first the viewer speaks (None), the reply 3.8', g38);
  const vnc = G(B('RFB 003.008\n', [1, 2]));
  ok(vnc.ok && vnc.type === 2 && vnc.auth === 'password', '3.8, [2] ⇒ the VNC password', vnc);
  const mac = G(B('RFB 003.889\n', [2, 30, 2]));
  ok(mac.ok && mac.server === '003.889' && mac.reply === 'RFB 003.008\n' && mac.type === 30 && mac.auth === 'ard', 'Apple 3.889, [30, 2] ⇒ ARD (the server\'s order wins), answered as 3.8', mac);
  const macOnly = G(B('RFB 003.889\n', [1, 30]));
  ok(macOnly.ok && macOnly.auth === 'ard', 'ARD only (a Mac with no VNC-password option) ⇒ ard', macOnly);
  const vncFirst = G(B('RFB 003.889\n', [2, 2, 30]));
  ok(vncFirst.ok && vncFirst.type === 2, '[2, 30] ⇒ VNC (the first supported in the server\'s order)', vncFirst);
  const unknownFirst = G(B('RFB 003.889\n', [3, 33, 36, 30]));
  ok(unknownFirst.ok && unknownFirst.type === 30, 'unknown types before ARD are skipped (33, 36 ⇒ 30)', unknownFirst);
  const onlyUnknown = G(B('RFB 003.889\n', [2, 33, 36]));
  ok(!onlyUnknown.ok && onlyUnknown.code === 'unsupported_auth' && onlyUnknown.types.join() === '33,36' && /33, 36/.test(onlyUnknown.why), 'only unknown types ⇒ unsupported_auth naming them', onlyUnknown);
  const g33 = G(B('RFB 003.003\n', u32(2)));
  ok(g33.ok && g33.reply === 'RFB 003.003\n' && g33.type === 2 && g33.types.join() === '2', '3.3: the server-chosen u32 type 2 ⇒ password, answered 3.3', g33);
  const g36 = G(B('RFB 003.006\n', u32(1)));
  ok(g36.ok && g36.reply === 'RFB 003.003\n' && g36.auth === 'none', 'UltraVNC 3.6 is spoken as 3.3', g36);
  const g37 = G(B('RFB 003.007\n', [1, 16]));
  ok(g37.ok && g37.reply === 'RFB 003.007\n' && g37.type === 16 && g37.auth === 'password', '3.7, [16] (Tight) ⇒ a password sign-in, answered 3.7', g37);
  const ref = G(B('RFB 003.008\n', [0], u32(25), 'Too many security failures'));
  ok(!ref.ok && ref.code === 'refused' && ref.reason === 'Too many security failure', 'count 0 ⇒ refused with its reason (exactly the declared length)', ref);
  const ref33 = G(B('RFB 003.003\n', u32(0), u32(4), 'nope'));
  ok(!ref33.ok && ref33.code === 'refused' && ref33.reason === 'nope', '3.3 type 0 ⇒ refused with its reason', ref33);
  const odd = G(B('RFB 003.008\n', [0], u32(3), [0x1b, 0x5b, 0x41]));
  ok(odd.code === 'refused' && odd.reason === '?[A', 'a reason\'s unprintable bytes are replaced (no control characters into words)', odd);
  ok(G(B('SSH-2.0-OpenSSH_9\r\n')).code === 'not_rfb' && G(B('HTTP/1.1 400')).code === 'not_rfb' && G(B('RFX')).code === 'not_rfb', 'an SSH / HTTP / other banner ⇒ not_rfb (as soon as the first bytes differ)');
  ok(G(B('RFB 003.00x\n')).code === 'not_rfb', 'a malformed version ⇒ not_rfb');
  const v9 = G(B('RFB 009.009\n', [1, 2]));
  ok(v9.code === 'unsupported_version' && v9.server === '009.009' && !v9.reply, 'an unknown version ⇒ unsupported_version, no reply', v9);
  // a greeting cut at EVERY byte: truncated (never a verdict), the reply known from byte 12 on
  const full = B('RFB 003.889\n', [3, 33, 30, 2]);
  const cuts = [];
  for (let n = 0; n < full.length; n++) { const g = G(full.subarray(0, n)); if (g.code !== 'truncated' || (n >= 12) !== !!g.reply) cuts.push([n, g]); }
  ok(cuts.length === 0 && G(full).ok, `every prefix of a ${full.length}-byte greeting is truncated (reply from byte 12), the whole one ok`, cuts);
  const refCut = B('RFB 003.008\n', [0], u32(10), 'abcdefghij');
  const refBad = [];
  for (let n = 13; n < refCut.length; n++) if (G(refCut.subarray(0, n)).code !== 'truncated') refBad.push(n);
  ok(refBad.length === 0 && G(refCut).code === 'refused', 'a refusal cut short is truncated too (its reason not yet whole)', refBad);
  ok(G(null).code === 'truncated' && G(Buffer.alloc(0)).code === 'truncated' && G([0x52, 0x46]).code === 'truncated', 'null / empty / an array never throws');
  ok(D.VNC_NATIVE.port === 5900 && D.VNC_NATIVE.port === A.MACHINE_DESKTOP_PORT && D.VNC_NATIVE.stream === 'rfb' && D.VNC_NATIVE.id === 'vnc-native', 'the rung: rfb on 5900, one port number (desktop-apps MACHINE_DESKTOP_PORT)');
}

console.log('§2 the tables match the BUNDLED noVNC');
{
  const rfbSrc = fs.readFileSync(path.join(repo, 'node_modules/@novnc/novnc/core/rfb.js'), 'utf8');
  const consts = Object.fromEntries([...rfbSrc.matchAll(/^const (securityType\w+)\s*=\s*(\d+);/gm)].map((m) => [m[1], Number(m[2])]));
  const body = /_isSupportedSecurityType\(type\) \{\s*const clientTypes = \[([^\]]*)\]/.exec(rfbSrc);
  const supported = body ? body[1].split(',').map((s) => s.trim()).filter(Boolean).map((n) => consts[n]) : [];
  ok(supported.length > 0 && supported.every((n) => Number.isInteger(n)) && JSON.stringify([...supported].sort((a, b) => a - b)) === JSON.stringify([...D.RFB_VIEWER_TYPES].sort((a, b) => a - b)), `RFB_VIEWER_TYPES = noVNC's clientTypes (${supported.join(', ')})`, { supported, ours: D.RFB_VIEWER_TYPES });
  const sw = /_negotiateProtocolVersion\(\)[\s\S]*?switch \(sversion\) \{([\s\S]*?)default:/.exec(rfbSrc);
  const map = {};
  if (sw) { let pending = []; for (const line of sw[1].split('\n')) { const c = /case "(\d{3}\.\d{3})"/.exec(line); if (c) pending.push(c[1]); const v = /this\._rfbVersion = (3\.\d)/.exec(line); if (v) { for (const p of pending) map[p] = v[1] === '3.3' ? '003.003' : v[1] === '3.7' ? '003.007' : '003.008'; pending = []; } if (/isRepeater = 1/.test(line)) pending = []; } }
  ok(Object.keys(map).length >= 7 && JSON.stringify(Object.entries(map).sort()) === JSON.stringify(Object.entries(D.RFB_VERSIONS).sort()), 'RFB_VERSIONS = noVNC\'s version switch (repeater excluded)', { novnc: map, ours: D.RFB_VERSIONS });
  ok(consts.securityTypeARD === 30 && D.rfbAuthOf(30) === 'ard' && D.rfbAuthOf(2) === 'password' && D.rfbAuthOf(1) === 'none' && D.rfbAuthOf(113) === 'user', 'ARD is 30 in noVNC; the auth words per type');
}

console.log('§3 desktopRunPlan: the line runs whole, shown as itself; refusals by name');
const decodePs = (argv) => Buffer.from(argv[argv.length - 1], 'base64').toString('utf16le');
{
  const line = 'blender -b "C:\\scenes\\a b.blend" -a && echo done';
  const mac = A.desktopRunPlan('darwin', line);
  ok(mac.ok && mac.shown === line && mac.argv[0] === '/bin/sh' && mac.argv[1] === '-c' && mac.argv[3] === 'vibespace-run' && mac.argv[4] === line && mac.argv.length === 5 && !mac.argv[2].includes('blender'), 'darwin: the line is the POSITIONAL $1 of a fixed script (never pasted into it), shown as itself', mac.argv);
  ok(/^nohup \/bin\/sh -lc "\$1" <\/dev\/null >\/dev\/null 2>&1 &$/.test(mac.argv[2]), 'darwin: a login shell runs $1 whole, detached (nohup, stdio to /dev/null, backgrounded)', mac.argv[2]);
  const win = A.desktopRunPlan('win32', line);
  const ps = decodePs(win.argv);
  ok(win.ok && win.shown === line && win.argv.slice(0, 6).join(' ') === 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand' && win.argv.length === 7, 'win32: powershell -EncodedCommand (no quoting layer on the way)', win.argv.slice(0, 6));
  ok(ps.includes(`-ArgumentList ('/d /s /c "' + '${line}' + '"')`) && /Start-Process -FilePath \$env:ComSpec/.test(ps), 'win32: the decoded script hands cmd.exe ONE literal — "/d /s /c" + the line, `&&` inside (one command)', ps);
  const q = A.desktopRunPlan('win32', `echo it's ${ch(0x2019)}x${ch(0x2018)}`);
  ok(decodePs(q.argv).includes(`'echo it''s ${ch(0x2019)}${ch(0x2019)}x${ch(0x2018)}${ch(0x2018)}'`), 'win32: \' and the typographic single quotes are doubled (PowerShell reads all of them as quotes)', decodePs(q.argv));
  for (const [what, l] of [['LF', 'a\nb'], ['CR', 'a\rb'], ['CRLF', 'a\r\nb']]) { const r = A.desktopRunPlan('darwin', l); ok(!r.ok && r.code === 'multi_line', `a ${what} ⇒ multi_line (one line only)`, r); }
  const hidden = [[0xe0041, 'TAG A (verify r1)'], [0x034f, 'CGJ (verify r1)'], [0x180b, 'Mongolian FVS1 (verify r1)'], [0x0600, 'Arabic number sign (verify r1)'], [0x00, 'NUL'], [0x1b, 'ESC'], [0x7f, 'DEL'], [0x85, 'NEL'], [0xad, 'soft hyphen'], [0x061c, 'ALM'], [0x200b, 'ZWSP'], [0x200d, 'ZWJ'], [0x200e, 'LRM'], [0x202e, 'RLO'], [0x2066, 'LRI'], [0x2069, 'PDI'], [0x2060, 'WJ'], [0xfeff, 'BOM'], [0x3164, 'Hangul filler'], [0x2028, 'LS']];
  const missed = [];
  for (const [cp, nm] of hidden) for (const p of ['darwin', 'win32']) { const r = A.desktopRunPlan(p, `echo a${ch(cp)}b`); const want = cp === 0x0a || cp === 0x0d ? 'multi_line' : 'hidden_chars'; if (r.ok || r.code !== want || !r.error.includes('U+' + cp.toString(16).toUpperCase().padStart(4, '0'))) missed.push([nm, p, r.code]); }
  ok(missed.length === 0, `every invisible class is refused by name with its code point (${hidden.length} characters × 2 platforms)`, missed);
  // verify r1: the set is src/hidden-chars.js's (one answer for every approval surface) — every code point it calls hidden is refused here
  { const HC = require(path.join(repo, 'src/hidden-chars.js')); const through = []; for (let cp = 0; cp <= 0xe007f; cp++) { if ((cp >= 0xd800 && cp <= 0xdfff) || (cp > 0xffff && cp < 0x1bc00) || cp === 0x0a || cp === 0x0d) continue; if (HC.isHidden(String.fromCodePoint(cp)) && A.desktopRunPlan('win32', `start "" blender${String.fromCodePoint(cp)}`).ok) through.push(cp.toString(16)); } ok(through.length === 0 && A.desktopRunPlan('darwin', 'echo a\tb').ok, 'every code point src/hidden-chars.js calls hidden is refused (the tag block, U+034F, …); a tab — whitespace a person sees — runs, as at the exit door', through.slice(0, 12)); }
  ok(A.desktopRunPlan('darwin', 'echo ok — “quoted” 日本語 é').ok, 'visible non-ASCII (dashes, curly double quotes, CJK, accents) runs');
  ok(A.desktopRunPlan('darwin', 'x'.repeat(A.RUN_LINE_MAX)).ok && A.desktopRunPlan('darwin', 'x'.repeat(A.RUN_LINE_MAX + 1)).code === 'too_long', `${A.RUN_LINE_MAX} characters run, one more is too_long`);
  ok(A.desktopRunPlan('darwin', '   ').code === 'empty' && A.desktopRunPlan('win32', undefined).code === 'empty', 'blank / absent ⇒ empty');
  ok(A.desktopRunPlan('linux', 'xterm').code === 'not_desktop_machine' && A.desktopRunPlan(null, 'x').code === 'not_desktop_machine', 'linux / unknown ⇒ not_desktop_machine (Linux machines keep per-app windows)');
}

console.log('§4 the TightVNC plan');
{
  const p = A.tightvncInstallPlan({ platform: 'win32' });
  const FLAGS = 'ADDLOCAL=Server SERVER_REGISTER_AS_SERVICE=1 SERVER_ADD_FIREWALL_EXCEPTION=0 SERVER_ALLOW_SAS=1 SET_ACCEPTHTTPCONNECTIONS=1 VALUE_OF_ACCEPTHTTPCONNECTIONS=0 SET_ALLOWLOOPBACK=1 VALUE_OF_ALLOWLOOPBACK=1 SET_LOOPBACKONLY=1 VALUE_OF_LOOPBACKONLY=1 SET_RFBPORT=1 VALUE_OF_RFBPORT=5900 SET_USEVNCAUTHENTICATION=1 VALUE_OF_USEVNCAUTHENTICATION=1 SET_PASSWORD=1';
  ok(p.ok && p.flags.join(' ') === FLAGS && Object.isFrozen(A.TIGHTVNC.flags), 'the msiexec flags are the FROZEN closed table (server only, as a service; no firewall exception; no HTTP port; loopback allowed AND loopback only; 5900; VNC auth)', p.flags);
  ok(A.TIGHTVNC.url === 'https://www.tightvnc.com/download/2.8.85/tightvnc-2.8.85-gpl-setup-64bit.msi' && A.TIGHTVNC.sha256 === 'd8fbed7b27ebab86df6f780f6e86f723668f3715cee521ccaa4568812aef5f3e', 'the MSI is pinned by URL + SHA-256 (measured 2026-10-03)');
  const script = p.commands.join('\n');
  ok(script.includes(`(Get-FileHash -Algorithm SHA256 $msi).Hash -ne '${A.TIGHTVNC.sha256.toUpperCase()}'`) && script.indexOf('Get-FileHash') < script.indexOf('msiexec'), 'the download\'s SHA-256 is checked BEFORE msiexec runs');
  ok(script.includes(`/qn /norestart ${FLAGS} VALUE_OF_PASSWORD="' + $p + '"`) && /Read-Host '[^']*' -AsSecureString/.test(script), 'msiexec gets exactly the table + the password the person typed THERE (Read-Host -AsSecureString)');
  const pw = [...script.matchAll(/VALUE_OF_PASSWORD=(.{0,8})/g)].map((m) => m[1]);
  ok(pw.length === 1 && pw[0].startsWith("\"' + $p") && !p.flags.some((f) => /VALUE_OF_PASSWORD/.test(f)) && !Object.keys(p).some((k) => /pass/i.test(k)), 'no password value anywhere in the plan — its one VALUE_OF_PASSWORD is the variable the person typed THERE', pw);
  ok(/Get-NetTCPConnection -LocalPort 5900 -State Listen/.test(script) && script.includes("$_ -ne '127.0.0.1' -and $_ -ne '::1'"), 'after the install the script checks 5900 listens on loopback addresses ONLY (else it fails by name)');
  // verify r1 F2: the checked MSI cannot be swapped by the signed-in user's processes (an admin-only directory, the hash again
  // right before msiexec); F3: a LAN listener found after the install is stopped + disabled, not only reported
  const msiAt = p.commands.find((l) => /\$msi = /.test(l));
  ok(!/\$env:TEMP/i.test(script) && /\$msi = Join-Path \$dir /.test(msiAt) && /SetAccessRuleProtection\(\$true, \$false\)/.test(script) && /'S-1-5-18', 'S-1-5-32-544'/.test(script) && /CreateDirectory\(\$dir, \$acl\)/.test(script) && script.indexOf('CreateDirectory') < script.indexOf('Invoke-WebRequest'), 'the MSI lands in a directory created with a PROTECTED ACL (SYSTEM + Administrators only) — never the user-writable %TEMP% (verify r1 F2)', msiAt);
  ok(script.lastIndexOf('Get-FileHash') > script.indexOf('Read-Host') && script.lastIndexOf('Get-FileHash') < script.indexOf('Start-Process msiexec'), 'the SHA-256 is checked AGAIN after the password prompt, right before msiexec (verify r1 F2)');
  ok(/Stop-Service tvnserver -Force[^\n]*Set-Service tvnserver -StartupType Disabled[^\n]*throw \('TightVNC listened on/.test(script), 'a TightVNC found listening beyond loopback is stopped and disabled BEFORE the failure is said (verify r1 F3)');
  ok(p.argv.join(' ').length < 32000, `the agent's argv stays under CreateProcess's 32767 characters (${p.argv.join(' ').length})`);
  const starter = decodePs(p.argv);
  ok(p.uac === true && p.canRun === true && /Start-Process powershell\.exe -Verb RunAs -Wait -PassThru/.test(starter) && starter.includes(`exit ${A.TIGHTVNC_NO_ADMIN_EXIT}`) && decodePs([/'-EncodedCommand','([^']+)'/.exec(starter)[1]]) === script, 'the agent\'s argv asks Windows for elevation (UAC) and runs EXACTLY the shown commands; no elevation ⇒ the no_admin exit');
  ok(A.tightvncInstallPlan({ platform: 'darwin' }).code === 'not_windows' && A.tightvncInstallPlan({ platform: 'linux' }).code === 'not_windows' && A.tightvncInstallPlan(null).code === 'no_facts', 'a Mac / Linux ⇒ not_windows; no platform ⇒ no_facts');
}

console.log('§5 presets, remembered lines, psEncoded');
{
  ok(A.desktopRunPresets('darwin')[0].cmd === 'open -a Blender' && A.desktopRunPresets('win32')[0].cmd === 'start "" blender' && A.desktopRunPresets('linux').length === 0, 'the Blender preset per platform');
  const rem = A.rememberRun(A.rememberRun(A.rememberRun(A.rememberRun([], 'a'), 'b'), 'c'), 'd');
  ok(JSON.stringify(rem) === '["d","c","b"]' && JSON.stringify(A.rememberRun(rem, 'b')) === '["b","d","c"]', 'remembered: newest first, at most 3, no duplicates');
  const offered = A.desktopRunPresets('darwin', ['x', `bad${ch(0x202e)}`, 'open -a Blender', 'y', 'z', 'w']);
  ok(JSON.stringify(offered.map((o) => o.cmd)) === JSON.stringify(['open -a Blender', 'x', 'y', 'z']), 'a remembered line is re-judged (a hidden-char line never offered), the preset not repeated, 3 at most', offered);
  const samples = ['', 'a', 'ab', 'abc', 'Start-Process "x"', `日本 ${ch(0x1f600)} é`, 'x'.repeat(301)];
  ok(samples.every((s) => A.psEncoded(s) === Buffer.from(s, 'utf16le').toString('base64')), 'psEncoded = node\'s UTF-16LE base64 (padding, astral, long)');
}

console.log('§6 CONTROLS — each rule removed from a patched copy ⇒ its leg red');
{
  const appsSrc = fs.readFileSync(path.join(repo, 'src/desktop-apps.js'), 'utf8');
  const dispSrc = fs.readFileSync(path.join(repo, 'src/desktop-display.js'), 'utf8');
  const cut = (src, from, to) => { if (!src.includes(from)) throw new Error('anchor moved: ' + from); return src.replace(from, to); };
  const noHidden = MUT.load('src/desktop-apps.js', cut(appsSrc, 'const hid = HC.hiddenCharsOf(line, { max: 1 });', 'const hid = [];'), 'nohid');
  ok(noHidden.desktopRunPlan('darwin', `a${ch(0x202e)}b`).ok === true, 'CONTROL: without the hidden-character rule an RLO line would run (§3\'s leg catches it)');
  const noMulti = MUT.load('src/desktop-apps.js', cut(appsSrc, "if (/[\\r\\n]/.test(line)) return { ok: false, code: 'multi_line'", "if (false) return { ok: false, code: 'multi_line'"), 'nomulti');
  ok(noMulti.desktopRunPlan('darwin', 'a\nb').code !== 'multi_line', 'CONTROL: without the one-line rule a line break is not named multi_line');
  const pasted = MUT.load('src/desktop-apps.js', cut(appsSrc, "argv: ['/bin/sh', '-c', 'nohup /bin/sh -lc \"$1\" </dev/null >/dev/null 2>&1 &', 'vibespace-run', line]", "argv: ['/bin/sh', '-c', `nohup /bin/sh -lc '${line}' </dev/null >/dev/null 2>&1 &`]"), 'pasted');
  const pm = pasted.desktopRunPlan('darwin', 'echo a');
  ok(!(pm.argv[4] === 'echo a' && !pm.argv[2].includes('echo')), 'CONTROL: a copy that pastes the line into the script fails §3\'s positional check');
  const lanOpen = MUT.load('src/desktop-apps.js', cut(appsSrc, "'SET_LOOPBACKONLY=1', 'VALUE_OF_LOOPBACKONLY=1', ", ''), 'lan');
  ok(lanOpen.tightvncInstallPlan({ platform: 'win32' }).flags.join(' ') !== A.tightvncInstallPlan({ platform: 'win32' }).flags.join(' ') && !lanOpen.TIGHTVNC.flags.includes('VALUE_OF_LOOPBACKONLY=1'), 'CONTROL: a table without LOOPBACKONLY (a LAN port) differs from the frozen one');
  const noTrunc = MUT.load('src/desktop-display.js', cut(dispSrc, '    if (rest.length < 1 + n) return truncated;\n', ''), 'notrunc');
  const short = noTrunc.rfbGreeting(B('RFB 003.889\n', [3, 33]));
  ok(short.code !== 'truncated', 'CONTROL: without the length guard a half-sent type list is judged early (§1\'s every-prefix leg catches it)', short);
  const ardLast = MUT.load('src/desktop-display.js', cut(dispSrc, 'const type = types.find((t) => RFB_VIEWER_TYPES.includes(t));', 'const type = [...types].reverse().find((t) => RFB_VIEWER_TYPES.includes(t));'), 'order');
  ok(ardLast.rfbGreeting(B('RFB 003.889\n', [2, 30, 2])).type !== 30, 'CONTROL: picking by our order instead of the server\'s changes the Mac\'s answer (§1 pins the server order)');
}

for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 6 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

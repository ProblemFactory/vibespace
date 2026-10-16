#!/usr/bin/env node
// THE REMOTEAPP RUNG's PURE PIECES (design q-024 r1 §1.1–§1.2, lane remoteapp-r1a, 2026-10-16) — fast, no process, no
// network. ONE app of a paired Windows machine = the hub's xfreerdp in RemoteApp (RAIL) mode on its own xpra display,
// connected to the machine's 127.0.0.1:3389 through the agent's loopback forward.
//   §1 the row (src/desktop-backends.js): `remoteapp` as committed — every cell the xpra rung's, `needs` = ALL of a group
//      (xpra + xfreerdp | xpra + xfreerdp3), a recipe + fit per group, the ONE new cell `remote: 'rdp-loopback'`; a remote
//      row is never a rung of the LOCAL ladder (resolveBackend, parseBackendPrefs, a registry row's backendPrefs)
//   §2 the argv table (src/remoteapp.js remoteappArgv): every field, the exact order, `/d:` ALWAYS (measured: without it
//      the one stdin line is read as the domain), `/from-stdin`, `/cert:deny,fingerprint:sha256:…`, `/gfx` vs `/gfx:AVC444`
//      by the client's build, `/kbd:unicode:on` the one optional extra; never a password; refusals by name
//   §3 FORBIDDEN_RDP_ARG_RE: each forbidden option refused BY NAME in every sigil form; FreeRDP's `-<name>` "disable" passes
//   §4 certFpVerdict rows · §5 rdpBuildVerdict over the MEASURED `/version` + `/buildconfig` (3.32.1; FreeRDP 2 refused)
//   §6 parseRailLine over lines the REAL client printed (cert refused, logon failure, nothing listening, the stdin domain
//      prompt eating the password, a stop, the Kerberos noise) + the RAIL exec rows; rdpEndVerdict's rank + the measured
//      exit codes
//   §7 the request verdict, the typed line → program, the setup words (their door: the machine's RemoteApp settings card), the platform
//   §8 relaunchBodyOf carries a RemoteApp record's request (the relaunch reconnects: a new forward, the setup read again)
//   §9 (lane remoteapp-r1b) THE FACTS: REMOTEAPP_FACTS_SCRIPT is read-only (no registry write, no service touched), its ONE
//      JSON line → parseRemoteappFacts (Home / Pro / Enterprise / Education / Server / unknown editions, Remote Desktop on or
//      off, listening or not, the allow list and the GPU policy present / absent / 0) → remoteappFactRows (FACT_KEYS, each
//      unmet fact's sentence code + the admin command its door is) → factsReady (the GPU policy optional)
//   §10 (r1b) THE FIRST CONNECTION: remoteappTrustArgv (`/from-stdin:force` — measured: `/auth-only` refuses plain
//      `/from-stdin` —, `/cert:tofu`, `/auth-only`, `/d:` always, never a password), trustVerdict over the lines the REAL
//      client printed: a successful tofu run ALSO prints "Host key verification failed." + CONNECT_CANCELLED — exit 0 decides;
//      a wrong password (134), nothing listening (141), the plain-stdin refusal (136), a timeout — nothing pinned, by name
//   §11 (r1b) scrubRdpLog: `password=` / `password:` / `pwd=` / `/p:` shapes erased to the END of their line (verify r1: a password
//       may hold a blank / quote / comma / semicolon), a named secret wherever it stands; other lines untouched
//   CONTROLS — patched copies (scripts/mutant-copy.mjs): `/p:` let through ⇒ §3 red; `/d:` dropped ⇒ §2 red; the ladder
//   without its remote filter ⇒ §1 red; the end rank reversed ⇒ §6 red; (r1b) a parser that takes a Home edition as one
//   that hosts Remote Desktop ⇒ §9 red (Home "ready"); a trust verdict that reads the lines before the exit code ⇒ §10 red
//   (the measured success reads as a changed certificate); the scrub's pattern emptied ⇒ §11 red
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { deadPort } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RA = require(path.join(repo, 'src/remoteapp.js'));
const M = require(path.join(repo, 'src/desktop-apps.js'));
const F = require(path.join(repo, 'src/desktop-fit.js'));
const MUT = mutantCopies('rapp', repo);
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// fixtures from SHAPES: a fingerprint of 32 runtime bytes, a host id, a user — never a real machine
const FP = Array.from({ length: 32 }, (_, i) => ((i * 37 + 11) % 256).toString(16).padStart(2, '0')).join(':');
const HOST = 'dev-' + 'w1n';
const cut = (src, from, to) => { if (src.split(from).length !== 2) throw new Error(`anchor not unique: ${from.slice(0, 60)}`); return src.replace(from, to); };

console.log('§1 the row — one more rung, never on the local ladder');
const row = M.backendById('remoteapp');
{
  ok(!!row && row.label === 'RemoteApp (RDP)' && row.stream === 'xpra' && row.wired === true && row.remote === 'rdp-loopback' && row.remote === RA.REMOTE_KIND, 'the row: id remoteapp, stream xpra (the picture IS the hub\'s xpra), wired, remote = rdp-loopback (src/remoteapp.js REMOTE_KIND)', row);
  ok(M.CAP_KEYS.every((k) => row[k] === M.backendById('xpra')[k]), 'every capability cell = the xpra rung\'s (scales, crispText, perWindow, seamless, satellites, geometry, ownsDisplay, hostedClient)');
  ok(same(row.needs, [['xpra', 'xfreerdp'], ['xpra', 'xfreerdp3']]) && same(row.recipes, { 'xpra+xfreerdp': 'xpra-seamless', 'xpra+xfreerdp3': 'xpra-seamless' }) && same(row.fit, { 'xpra+xfreerdp': 'client', 'xpra+xfreerdp3': 'client' }), 'needs = ALL of a group (xpra AND the client, either spelling); one recipe (xpra-seamless) and one fit (client) per group', { needs: row.needs, recipes: row.recipes, fit: row.fit });
  ok(Object.isFrozen(row) && Object.isFrozen(row.needs) && row.needs.every(Object.isFrozen) && Object.isFrozen(row.recipes) && Object.isFrozen(row.fit), 'the row and its tables are frozen');
  ok(same(RA.RDP_CLIENT_BINS, ['xfreerdp', 'xfreerdp3']) && row.needs.every((g) => g.length === 2 && g[0] === 'xpra' && RA.RDP_CLIENT_BINS.includes(g[1])), 'each group = xpra + one of RDP_CLIENT_BINS (the launch picks the binary by the group that matched)');
  ok(RA.rdpClientOf('xpra+xfreerdp') === 'xfreerdp' && RA.rdpClientOf('xpra+xfreerdp3') === 'xfreerdp3' && RA.rdpClientOf('xpra') === null && RA.rdpClientOf(null) === null, 'rdpClientOf names the client of a satisfied group, null otherwise');
  ok(M.needsVerdict(row, { xpra: '/x' }).ok === false && M.needsVerdict(row, { xfreerdp: '/y' }).ok === false && M.needsVerdict(row, { xpra: '/x', xfreerdp3: '/z' }).via === 'xpra+xfreerdp3', 'xpra alone or the client alone is NOT enough (the design\'s [[xpra],[xfreerdp]] read as OR would have passed both); both ⇒ via names the pair');
  ok(same(M.BACKEND_IDS, ['xpra', 'vnc-display', 'desktop-singleton', 'remoteapp']) && same(M.LADDER_IDS, ['xpra', 'vnc-display', 'desktop-singleton']), 'BACKEND_IDS has four rows; LADDER_IDS (what a local app may land on / a preference may name) has the three local ones');
  const every = { xpra: '/x', xfreerdp: '/y', xfreerdp3: '/z', Xvnc: '/v', Xvfb: '/f', x11vnc: '/v2', Xtigervnc: '/t' };
  const r = M.resolveBackend({ bins: every }, { backendPrefs: ['remoteapp'] });
  ok(r.backend === 'xpra' && r.ladder.length === 3 && !r.ladder.some((x) => x.backend === 'remoteapp'), 'resolveBackend never judges the remote row for a local app — not even when a preference names it (dropped) and every binary is present', r.ladder.map((x) => x.backend));
  ok(M.resolveBackend({ bins: { xfreerdp: '/y' } }).backend === null && M.resolveBackend({ bins: { xfreerdp: '/y' } }).ladder.length === 3, 'a hub with only the RDP client has NO local backend (the remote row is not a fallback)');
  ok(same(M.parseBackendPrefs('remoteapp, xpra'), ['xpra']) && same(M.parseBackendPrefs(['remoteapp']), []), 'parseBackendPrefs drops remoteapp (an instance preference cannot route local apps onto it)');
  const vr = M.validateAppRow({ id: 'x', label: 'x', exec: '/bin/true', backendPrefs: ['remoteapp'] });
  const vx = M.validateAppRow({ id: 'x', label: 'x', exec: '/bin/true', backendPrefs: ['xpra'] });
  ok(vr.ok === false && /backendPrefs may only name xpra\/vnc-display\/desktop-singleton$/.test(vr.error) && vx.ok !== false, 'a registry row naming remoteapp in backendPrefs is refused by name (the three ladder ids); xpra still passes', { vr, vx });
  const bsrc = fs.readFileSync(path.join(repo, 'src/desktop-backends.js'), 'utf8');
  const noFilter = MUT.load('src/desktop-backends.js', cut(bsrc, 'let order = ladderOf(table);', 'let order = table;'));
  ok(noFilter.resolveBackend({ bins: every }, { backendPrefs: ['remoteapp'] }, noFilter.DISPLAY_BACKENDS).backend === 'remoteapp', 'CONTROL: without the remote filter a preference lands a LOCAL app on the RemoteApp rung (§1 would be red)');
}

console.log('§2 the argv table');
const PORT = await deadPort(); // the forward's port: any free number (nothing connects in this suite)
const base = { port: PORT, user: 'someone', program: 'C:\\Windows\\System32\\notepad.exe', certFp: FP };
{
  const a = RA.remoteappArgv(base);
  ok(a.ok && same(a.argv, [`/v:127.0.0.1:${PORT}`, '/u:someone', '/d:', '/from-stdin', `/cert:deny,fingerprint:sha256:${FP}`, '/app:program:C:\\Windows\\System32\\notepad.exe,name:notepad', '/dynamic-resolution', '/gfx', '-clipboard', '-audio-mode:2', '/network:auto', '/log-level:WARN']), 'the base argv, word for word and in order (no domain ⇒ `/d:` empty; no H.264 ⇒ `/gfx`; the name defaults to the program\'s file name)', a);
  const full = RA.remoteappArgv({ ...base, domain: 'WORKGROUP', name: 'Notes', args: 'C:\\Users\\someone\\a.txt', kbdUnicode: true, h264: true });
  ok(full.ok && full.argv[2] === '/d:WORKGROUP' && full.argv[5] === '/app:program:C:\\Windows\\System32\\notepad.exe,name:Notes,cmd:C:\\Users\\someone\\a.txt' && full.argv[7] === '/gfx:AVC444' && full.argv[full.argv.length - 1] === '/kbd:unicode:on' && full.argv.length === 13, 'every field: /d:<domain>, name + cmd inside /app:, /gfx:AVC444 when the client decodes H.264, /kbd:unicode:on LAST and only when asked', full);
  ok(RA.remoteappArgv({ ...base, kbdUnicode: false }).argv.every((w) => !w.startsWith('/kbd')) && RA.remoteappArgv({ ...base, kbdUnicode: true }).argv.filter((w) => w.startsWith('/kbd')).length === 1, 'unicode keyboard off ⇒ no /kbd word; on ⇒ exactly one');
  ok(RA.remoteappArgv({ ...base, domain: '' }).argv.includes('/d:') && RA.remoteappArgv({ ...base, domain: 'CORP' }).argv.filter((w) => w.startsWith('/d:')).length === 1, '/d: is ALWAYS present — empty for a local account, the domain otherwise (measured: without it "Domain:" eats the password line)');
  ok(RA.remoteappArgv({ ...base, certFp: FP.toUpperCase() }).argv[4] === `/cert:deny,fingerprint:sha256:${FP}` && RA.remoteappArgv({ ...base, certFp: FP.replace(/:/g, '') }).argv[4] === `/cert:deny,fingerprint:sha256:${FP}`, 'the pin is normalised (upper case, bare hex) to FreeRDP\'s colon lower-case Thumbprint form, with `deny` (never a prompt)');
  const words = [a, full].flatMap((x) => x.argv);
  ok(words.includes('/from-stdin') && !words.some((w) => /^[/+-](p|pth|gp):/i.test(w)) && !words.some((w) => /^\+|^\/clipboard|^\/drive|^\/sound|^\/microphone/.test(w)), '/from-stdin present; no password option, nothing that opens the clipboard / a drive / audio');
  const refusals = [
    [{ ...base, port: 0 }, 'bad-request'], [{ ...base, port: 70000 }, 'bad-request'], [{ ...base, user: '' }, 'remoteapp_needs_setup'], [{ ...base, user: 'a\nb' }, 'bad-request'],
    [{ ...base, domain: 'X\u0000' }, 'bad-request'], [{ ...base, program: '' }, 'remoteapp_bad_program'], [{ ...base, program: 'notepad' }, 'remoteapp_bad_program'],
    [{ ...base, program: 'C:\\a.exe,file:x' }, 'bad-request'], [{ ...base, program: '"C:\\a.exe"' }, 'bad-request'], [{ ...base, name: 'a,icon:b' }, 'bad-request'],
    [{ ...base, args: 'x,workdir:y' }, 'bad-request'], [{ ...base, args: 'x\ry' }, 'bad-request'], [{ ...base, certFp: 'nope' }, 'rdp_cert_bad'], [{ ...base, certFp: '' }, 'rdp_cert_missing'],
    [{ ...base, kbdUnicode: 'yes' }, 'bad-request'],
  ];
  const got = refusals.map(([o, code]) => { const r = RA.remoteappArgv(o); return [code, r.ok ? 'ok' : r.code]; });
  ok(got.every(([want, g]) => want === g), `${refusals.length} refusals, each BY NAME (bad port, empty user, control characters, a program that is no path/alias/.exe, a comma that would add an /app: sub-option, a quote, a bad pin, a non-boolean unicode)`, got.filter(([w, g]) => w !== g));
  for (const p of ['||notepad', 'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe', '%SystemRoot%\\System32\\mspaint.exe', 'calc.exe']) ok(RA.remoteappArgv({ ...base, program: p }).ok, `program ${JSON.stringify(p)} is accepted (an alias, a path with spaces, an env-var path, a bare .exe)`);
  const rsrc = fs.readFileSync(path.join(repo, 'src/remoteapp.js'), 'utf8');
  const noD = MUT.load('src/remoteapp.js', cut(rsrc, "`/d:${d.value || ''}`, '/from-stdin'", "...(d.value ? [`/d:${d.value}`] : []), '/from-stdin'"));
  ok(!noD.remoteappArgv(base).argv.includes('/d:'), 'CONTROL: the design\'s optional [/d:] drops the word for a local account (§2\'s ALWAYS leg would be red — and the fake client then reads the password as the domain)');
}

console.log('§3 FORBIDDEN_RDP_ARG_RE — refused by name');
{
  const names = ['p', 'pth', 'drive', 'drives', 'home-drive', 'clipboard', 'multimon', 'smartcard', 'vc', 'dvc', 'sound', 'microphone', 'args-from', 'gateway', 'gp'];
  const rows = [];
  for (const n of names) for (const form of [`/${n}:x`, `+${n}`, `/${n}`, `-${n}:x`]) { const v = RA.rdpArgVerdict(['/v:127.0.0.1:1', form]); rows.push([form, v.ok ? 'ok' : v.name, v.ok ? '' : v.error]); }
  ok(rows.every(([form, name]) => name !== 'ok' && form.replace(/^[/+-]/, '').startsWith(name)), `${rows.length} forbidden words (${names.length} options × /x:v, +x, /x, -x:v) each refused naming its option`, rows.filter(([, n]) => n === 'ok'));
  ok(rows.every(([, , e]) => /^RemoteApp refuses the xfreerdp option [/+-][\w-]+:? — .{12,}/.test(e)), 'each refusal is a sentence that names the option and says why', rows.slice(0, 2));
  ok(RA.rdpArgVerdict(['/p:x']).error.includes('stdin') && RA.rdpArgVerdict(['/drive:home,/home/x']).error.includes('drive'), 'the /p: sentence says the password goes through stdin; /drive: says no drive is shared');
  ok(['-clipboard', '-drives', '-multimon', '-sound', '/v:127.0.0.1:9', '/network:auto'].every((w) => RA.rdpArgVerdict([w]).ok), 'FreeRDP\'s `-<name>` (disable) passes — the argv\'s own -clipboard; unrelated options pass');
  ok(RA.rdpArgVerdict(['/u:a\u2028b']).ok === false && RA.rdpArgVerdict('x').ok === false, 'a control character in any word / a non-list is refused');
  const rsrc = fs.readFileSync(path.join(repo, 'src/remoteapp.js'), 'utf8');
  const letP = MUT.load('src/remoteapp.js', cut(rsrc, '/^[/+-](p|pth|drive|', '/^[/+-](pth|drive|'));
  ok(letP.rdpArgVerdict(['/p:x']).ok === true, 'CONTROL: a FORBIDDEN_RDP_ARG_RE without `p` lets `/p:` through (§3 would be red)');
}

console.log('§4 certFpVerdict');
{
  ok(RA.certFpVerdict(FP).ok && RA.certFpVerdict(FP).fp === FP && RA.certFpVerdict(`sha256:${FP.toUpperCase()}`).fp === FP && RA.certFpVerdict(FP.replace(/:/g, '')).fp === FP, 'colon / upper-case / sha256: prefix / bare 64-hex all normalise to the colon lower-case form');
  const bad = [FP.slice(0, -3), `${FP}:00`, FP.replace(/:/g, '-'), 'zz' + FP.slice(2), FP.slice(0, 5) + FP.slice(6)].map((s) => RA.certFpVerdict(s).code);
  ok(bad.every((c) => c === 'rdp_cert_bad') && RA.certFpVerdict(undefined).code === 'rdp_cert_missing' && RA.certFpVerdict('  ').code === 'rdp_cert_missing', 'short, long, wrong separator, non-hex, a missing colon ⇒ rdp_cert_bad; nothing ⇒ rdp_cert_missing', bad);
  ok(!/[0-9a-f]{20}/.test(RA.certFpVerdict(FP.slice(0, -3)).error), 'a refusal does not echo the value back');
}

console.log('§5 rdpBuildVerdict — the hub\'s own client (measured strings)');
{
  const V = 'This is FreeRDP version 3.32.1 (3.32.1)';
  const B = '[/usr/bin/xfreerdp] Build configuration: BUILD_TESTING=ON BUILD_TESTING_NO_H264=OFF WITH_FFMPEG=OFF WITH_GFX_H264=OFF WITH_OPENH264=OFF WITH_VAAPI_H264_ENCODING=ON';
  ok(same(RA.rdpBuildVerdict({ version: V, buildconfig: B }), { ok: true, version: '3.32.1', major: 3, h264: false }), 'Ubuntu 26.04 freerdp-x11 (measured): FreeRDP 3.32.1, no H.264 (WITH_VAAPI_H264_ENCODING=ON is not a decoder)');
  ok(RA.rdpBuildVerdict({ version: V, buildconfig: B.replace('WITH_GFX_H264=OFF', 'WITH_GFX_H264=ON') }).h264 === true && RA.rdpBuildVerdict({ version: 'This is FreeRDP version [/usr/bin/xfreerdp3] 3.10.3 (3.10.3)', buildconfig: '' }).ok, 'WITH_GFX_H264=ON ⇒ h264; the bracketed-path version form reads too');
  ok(RA.rdpBuildVerdict({ version: 'This is FreeRDP version 2.11.7 (2.11.7)' }).code === 'rdp_client_too_old' && /FreeRDP 2\.11\.7/.test(RA.rdpBuildVerdict({ version: 'This is FreeRDP version 2.11.7 (2.11.7)' }).error), 'FreeRDP 2 is refused by name (its command line has no /app:program: nor /cert:fingerprint:)');
  ok(RA.rdpBuildVerdict({ version: '' }).code === 'rdp_client_unknown' && RA.rdpBuildVerdict().code === 'rdp_client_unknown', 'an unreadable version is refused by name, never guessed');
}

console.log('§6 parseRailLine / rdpEndVerdict over the REAL client\'s lines');
const LINES = {
  certWarn: "[21:47:38:360] [1843174:001c1fe8] [ERROR][com.freerdp.crypto] - [tls_print_new_certificate_warn]: Host key verification failed.",
  certAbort: "[21:47:38:360] [1843174:001c1fe8] [ERROR][com.freerdp.crypto] - [freerdp_tls_handshake]: certificate not trusted, aborting.",
  tls: "[21:47:38:360] [1843174:001c1fe8] [ERROR][com.freerdp.core] - [transport_default_connect_tls]: ERRCONNECT_TLS_CONNECT_FAILED [0x00020008]",
  logon: "[21:48:02:432] [1844665:001c25bb] [ERROR][com.freerdp.core] - [nla_recv_pdu]: ERRCONNECT_LOGON_FAILURE [0x00020014]",
  refusedTcp: "[21:42:13:551] [1832478:001bf61e] [WARN][com.freerdp.core] - [freerdp_tcp_connect_timeout]: connect to localhost:1 failed with error: Connection refused [111]",
  unreachable: "[21:46:23:181] [1840208:001c1452] [ERROR][com.freerdp.core] - [get_next_addrinfo]: ERRCONNECT_CONNECT_FAILED [0x00020006]",
  domainAte: "Domain:          [21:47:22:274] [1842248:001c1c4a] [ERROR][com.freerdp.core] - [nla_client_setup_identity]: ERRCONNECT_CONNECT_CANCELLED [0x0002000B]",
  stopSig: "[21:47:30:282] [1842261:001c1c55] [ERROR][com.freerdp.utils.signal] - [fsig_term_handler]: Caught signal 'Terminated' [15]",
  stopAbort: "[21:47:30:282] [1842261:001c1c55] [ERROR][com.freerdp.core] - [freerdp_abort_connect_context]: ERRCONNECT_CONNECT_CANCELLED [0x0002000B]",
  krb: "[21:47:22:297] [1842261:001c1c57] [ERROR][com.winpr.sspi.Kerberos] - [kerberos_AcquireCredentialsHandleA]: krb5_parse_name (Configuration file does not specify default realm [-1765328160])",
  badArgv: "[21:42:13:551] [1832478:001bf61e] [ERROR][com.freerdp.client.common.cmdline] - [parse_command_line]: Command line parsing failed at 'gfx' value 'AVC444' [-1000]",
  noise: "[21:46:23:114] [1840174:001c1430] [WARN][com.freerdp.client.x11] - [load_map_from_xkbfile]: ZEHA: keycode: 0x5d -> no RDP scancode found",
};
{
  const code = (k) => (RA.parseRailLine(LINES[k]) || {}).code || null;
  const want = { certWarn: 'rdp_cert_changed', certAbort: 'rdp_cert_changed', tls: 'rdp_tls_failed', logon: 'rdp_auth_failed', refusedTcp: null, unreachable: 'rdp_unreachable', domainAte: 'rdp_cancelled', stopSig: null, stopAbort: 'rdp_cancelled', krb: null, badArgv: 'rdp_bad_argv', noise: null };
  const got = Object.fromEntries(Object.keys(want).map((k) => [k, code(k)]));
  ok(same(got, want), 'each measured line → its code; the Kerberos "no default realm" ERROR every NLA connect prints and the keymap WARN are noise (null)', got);
  ok(code('logon') && RA.parseRailLine(LINES.logon).line === LINES.logon, 'a verdict keeps the line it read');
  const rail = (n) => RA.parseRailLine(`[ERROR][com.freerdp.client.x11] - [xf_rail_server_execute_result]: RAIL exec error: execResult=${n} NtError=0x0`).code;
  ok(rail('RAIL_EXEC_E_NOT_IN_ALLOWLIST') === 'rail_not_allowed' && rail('RAIL_EXEC_E_FILE_NOT_FOUND') === 'rail_no_program' && rail('RAIL_EXEC_E_SESSION_LOCKED') === 'rail_session_locked' && rail('RAIL_EXEC_E_DECODE_FAILED') === 'rail_refused', 'the RAIL exec rows (FreeRDP xf_rail.c wording — unconfirmed until the real-machine leg): allow list / no program / locked / any other');
  const cert = RA.rdpEndVerdict({ code: 143, lines: [LINES.krb, LINES.certWarn, LINES.certAbort, LINES.tls], machine: HOST });
  ok(cert && cert.code === 'rdp_cert_changed' && cert.words.startsWith(`${HOST}'s Remote Desktop certificate is not the one pinned`), 'a cert refusal outranks the TLS line it also prints; the words name the machine', cert);
  ok(RA.rdpEndVerdict({ code: 0, lines: [LINES.logon, LINES.stopAbort] }).code === 'rdp_auth_failed' && RA.rdpEndVerdict({ lines: [LINES.badArgv, LINES.tls] }).code === 'rdp_bad_argv', 'logon outranks the cancel that follows it; a refused command line outranks everything (nothing was sent)');
  ok(RA.rdpEndVerdict({ code: 134, lines: [] }).code === 'rdp_auth_failed' && RA.rdpEndVerdict({ code: 141, lines: [LINES.krb] }).code === 'rdp_unreachable' && RA.rdpEndVerdict({ code: 143 }).code === 'rdp_tls_failed' && RA.rdpEndVerdict({ code: 145 }).code === 'rdp_cancelled', 'no telling line ⇒ the MEASURED exit codes (134 logon, 141 connect failed, 143 TLS, 145 cancelled)');
  ok(RA.rdpEndVerdict({ code: 7, lines: [LINES.noise] }) === null && RA.rdpEndVerdict({ code: null, signal: 'SIGKILL', lines: [] }) === null, 'an exit nobody explains ⇒ null (the keeper\'s "application exited (code N)" stands); a signal is never read as an exit code');
  ok(RA.rdpEndVerdict({ lines: LINES.logon + '\n' + LINES.krb }).code === 'rdp_auth_failed', 'a log tail as one string reads line by line');
  ok(RA.parseRailLine('[ERROR][com.freerdp.core] - [transport_read_layer]: ERRCONNECT_CONNECT_TRANSPORT_FAILED [0x0002000D]').code === 'rdp_link_lost' && /dropped/.test(RA.rdpEndVerdict({ lines: ['x ERRCONNECT_CONNECT_TRANSPORT_FAILED y', LINES.stopAbort] }).words), 'a dropped connection is its own row (rdp_link_lost — "dropped", never "nothing answered"), outranking the cancel after it');
  const rsrc = fs.readFileSync(path.join(repo, 'src/remoteapp.js'), 'utf8');
  const lastWins = MUT.load('src/remoteapp.js', cut(rsrc, 'if (best === null || END_RANK.indexOf(c) < END_RANK.indexOf(best)) best = c;', 'best = c;'));
  ok(lastWins.rdpEndVerdict({ code: 143, lines: [LINES.certWarn, LINES.tls] }).code !== 'rdp_cert_changed', 'CONTROL: without the rank the LAST line wins — a cert refusal reads as a TLS failure (§6 would be red)');
}

console.log('§7 the request, the typed line, the setup words, the platform');
{
  const r = RA.remoteappRequestVerdict({ hostId: HOST, program: 'C:\\Windows\\System32\\notepad.exe' });
  ok(same(r, { ok: true, hostId: HOST, program: 'C:\\Windows\\System32\\notepad.exe', name: 'notepad', args: null, kbdUnicode: false }), 'a minimal request: the name defaults, no args, unicode off', r);
  const bad = [null, [], { program: 'calc.exe' }, { hostId: 'local', program: 'calc.exe' }, { hostId: 'a b', program: 'calc.exe' }, { hostId: HOST }, { hostId: HOST, program: 7 }].map((x) => RA.remoteappRequestVerdict(x).code);
  ok(same(bad, ['bad-request', 'bad-request', 'bad-request', 'bad-request', 'bad-request', 'remoteapp_bad_program', 'bad-request']), 'not an object / an array / no machine / THIS machine / a bad id / no program / a non-text program — each by name', bad);
  ok(same(RA.remoteappProgramOf('start "" "C:\\Program Files\\App\\app.exe" --open x'), { program: 'C:\\Program Files\\App\\app.exe', args: '--open x' }) && same(RA.remoteappProgramOf('"C:\\a b\\x.exe"'), { program: 'C:\\a b\\x.exe', args: null }) && same(RA.remoteappProgramOf('notepad.exe C:\\t.txt'), { program: 'notepad.exe', args: 'C:\\t.txt' }) && same(RA.remoteappProgramOf('  ||calc '), { program: '||calc', args: null }), 'the run box\'s line → program + args: `start "" "<path>" args`, a quoted path, a bare .exe + args, an alias');
  ok(RA.programLabel('||calc') === 'calc' && RA.programLabel('C:\\x\\Blender.EXE') === 'Blender' && RA.programLabel('') === 'RemoteApp', 'the default window name');
  ok(same(RA.setupMissing(null), ['user', 'password', 'certificate']) && same(RA.setupMissing({ user: 'u', password: () => 'x', certFp: FP }), []) && same(RA.setupMissing({ user: 'u', password: 'plain', certFp: FP }), ['password']) && same(RA.setupMissing({ user: ' ', password: () => 'x', certFp: 'no' }), ['user', 'certificate']), 'setupMissing: the password must be a GETTER (a plain string is not accepted), the user non-empty, the pin a sha256');
  const w = RA.needsSetupWords(['user', 'password', 'certificate'], 'Lab PC');
  ok(w === 'RemoteApp on Lab PC needs its Windows user name, its Windows password and its Remote Desktop certificate fingerprint — give them once on its RemoteApp settings card (the machine\'s dialog → RemoteApp settings…)', 'the needs-setup sentence names every missing part and its DOOR — the machine\'s RemoteApp settings card (lane remoteapp-r1b)', w);
  ok(RA.needsSetupWords(['certificate'], 'X') === 'RemoteApp on X needs its Remote Desktop certificate fingerprint — press First connection on its RemoteApp settings card (the machine\'s dialog → RemoteApp settings…)', 'only the certificate missing ⇒ the door is the First connection press');
  ok(RA.platformVerdict('win32') === null && RA.platformVerdict('darwin', 'Mac').code === 'remoteapp_not_windows' && /Mac runs darwin/.test(RA.platformVerdict('darwin', 'Mac').error) && RA.platformVerdict(null).code === 'remoteapp_not_windows', 'only a Windows machine; a Mac / an unknown system refused by name');
  ok(/apt install freerdp3-x11$/.test(RA.needsClientWords(['xpra+xfreerdp not on PATH'])) && RA.needsClientWords(['xpra+xfreerdp not on PATH']).includes('xpra+xfreerdp not on PATH'), 'a hub without the client: the needs verdict\'s words + the package to install');
}

console.log('§8 the relaunch reconnects (relaunchBodyOf)');
{
  const rec = { source: 'remoteapp', exec: '/usr/bin/xfreerdp', args: ['/v:127.0.0.1:1'], remoteapp: { hostId: HOST, program: 'calc.exe', name: 'calc', args: null, kbdUnicode: true } };
  const b = F.relaunchBodyOf(rec);
  ok(same(b, { remoteapp: rec.remoteapp }) && b.remoteapp !== rec.remoteapp, 'a RemoteApp record relaunches as its REQUEST (a copy) — never its recorded argv (the old forward\'s port)', b);
  ok(same(F.relaunchBodyOf({ source: 'adhoc', exec: '/bin/x', args: ['a'], cwd: null, label: 'x' }), { exec: '/bin/x', args: ['a'], cwd: null, label: 'x' }), 'any other record relaunches as before');
}

console.log('§9 the facts — the read-only script, its line, the card\'s rows (lane remoteapp-r1b)');
const factLine = (o) => `noise before\r\n${JSON.stringify({ t: 'remoteapp-facts', edition: 'Professional', product: 'Windows 10 Pro', build: '26100', deny: '0', listening: 1, allowList: '1', gpu: '1', ...o })}\r\n`;
{
  const S = RA.REMOTEAPP_FACTS_SCRIPT;
  ok(!/\b(?:Set|New|Remove|Rename|Clear)-Item(?:Property)?\b|\breg(?:\.exe)?\s+(?:add|delete)\b|\b(?:Start|Stop|Restart|Set)-Service\b|\bInvoke-Expression\b|\biex\b/i.test(S) && /Get-ItemProperty/.test(S) && /BeginConnect\('127\.0\.0\.1', 3389/.test(S), 'the facts script only READS: Get-ItemProperty + one loopback connect to 3389 — no registry write, no service touched, no Invoke-Expression');
  for (const k of ['EditionID', 'fDenyTSConnections', 'fDisabledAllowList', 'bEnumerateHWBeforeSW', 'TSAppAllowList']) ok(S.includes(k), `the script reads ${k}`);
  ok(/ConvertTo-Json -InputObject \$o -Compress/.test(S) && S.split('\n').filter((l) => /WriteLine/.test(l)).length === 1, 'it prints ONE compressed JSON line');
  const pro = RA.parseRemoteappFacts(factLine({}));
  ok(same(pro, { ok: true, edition: { id: 'Professional', product: 'Windows 10 Pro', build: '26100', kind: 'pro' }, rdpOn: true, listening: true, allowList: true, gpuPolicy: true }), 'a ready Pro machine parses to every fact met', pro);
  const kinds = ['Core', 'CoreSingleLanguage', 'CoreN', 'Professional', 'ProfessionalWorkstation', 'Enterprise', 'EnterpriseS', 'Education', 'ServerStandard', 'IoTEnterprise', 'Starter', '', null].map((e) => RA.editionKind(e));
  ok(same(kinds, ['home', 'home', 'home', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'unknown', 'unknown', 'unknown']), 'editions: Core* = Home (no Remote Desktop service); Pro / Workstation / Enterprise / LTSC / Education / Server / IoT Enterprise host it; anything else unknown', kinds);
  const absent = RA.parseRemoteappFacts(factLine({ deny: null, listening: 0, allowList: null, gpu: null }));
  ok(absent.rdpOn === null && absent.listening === false && absent.allowList === null && absent.gpuPolicy === null, 'absent values parse to null (never a guess), a failed loopback connect to false', absent);
  const zero = RA.parseRemoteappFacts(factLine({ deny: '1', allowList: '0', gpu: '0' }));
  ok(zero.rdpOn === false && zero.allowList === false && zero.gpuPolicy === false, 'fDenyTSConnections 1 = off; fDisabledAllowList 0 and the policy 0 = not set up', zero);
  ok(RA.parseRemoteappFacts('').code === 'bad_output' && RA.parseRemoteappFacts('{"t":"displays"}\n').code === 'bad_output' && RA.parseRemoteappFacts('{not json').code === 'bad_output', 'no line of ours ⇒ bad_output by name');
  const ctl = RA.parseRemoteappFacts(factLine({ product: 'Win\u0007dows\u2028 10 Pro', edition: 'P'.repeat(300) }));
  ok(ctl.edition.product === 'Windows 10 Pro' && ctl.edition.id.length === 80, 'a control character is stripped and a long value cut at 80 (the card shows them as text)', ctl.edition);
  // the card's rows
  const rows = RA.remoteappFactRows(pro);
  ok(same(rows.map((r) => r.key), [...RA.FACT_KEYS]) && same(RA.FACT_KEYS, ['edition', 'rdp', 'allowlist', 'gpu']) && rows.every((r) => r.met && r.code === null), 'remoteappFactRows: one row per FACT_KEYS entry, in order; all met ⇒ no sentence code', rows);
  ok(RA.factsReady(pro) === true && RA.factsReady(RA.parseRemoteappFacts(factLine({ gpu: null }))) === true, 'ready: every fact but the optional GPU policy');
  const table = [
    ['Home', { edition: 'Core' }, 'edition', 'edition_home'],
    ['unknown edition', { edition: 'Starter' }, 'edition', 'edition_unknown'],
    ['Remote Desktop off', { deny: '1', listening: 0 }, 'rdp', 'rdp_off'],
    ['Remote Desktop value absent', { deny: null, listening: 0 }, 'rdp', 'rdp_off'],
    ['on but not listening', { listening: 0 }, 'rdp', 'rdp_not_listening'],
    ['allow list 0', { allowList: '0' }, 'allowlist', 'allowlist_off'],
    ['allow list absent', { allowList: null }, 'allowlist', 'allowlist_off'],
  ];
  for (const [name, over, key, code] of table) {
    const f = RA.parseRemoteappFacts(factLine(over));
    const row = RA.remoteappFactRows(f).find((r) => r.key === key);
    ok(row && row.met === false && row.code === code && RA.factsReady(f) === false, `${name} ⇒ the ${key} row unmet with ${code}, not ready`, row);
  }
  const g = RA.remoteappFactRows(RA.parseRemoteappFacts(factLine({ gpu: null }))).find((r) => r.key === 'gpu');
  ok(g.met === false && g.optional === true && g.code === 'gpu_off' && g.command === RA.GPU_COMMAND, 'the GPU policy absent ⇒ its row unmet, OPTIONAL, its door the GPU admin command');
  const al = RA.remoteappFactRows(RA.parseRemoteappFacts(factLine({ allowList: '0' }))).find((r) => r.key === 'allowlist');
  ok(al.command === RA.ALLOWLIST_COMMAND, 'the allow list row\'s door is the allow-list admin command');
  for (const [name, cmd, val] of [['allow list', RA.ALLOWLIST_COMMAND, 'fDisabledAllowList'], ['GPU policy', RA.GPU_COMMAND, 'bEnumerateHWBeforeSW']]) {
    ok(cmd.includes(`-Name ${val} -PropertyType DWord -Value 1 -Force`) && /if \(-not \(Test-Path \$k\)\) \{ New-Item -Path \$k/.test(cmd) && !/^New-Item -Path \$k -Force/.test(cmd.split('; ')[0]) && !/[\r\n]/.test(cmd), `the ${name} command: ONE line, creates the key only when it is missing (an existing key is never re-created — New-Item -Force would empty it), sets ${val}=1`);
  }
  ok(RA.remoteappFactRows(null) === null && RA.remoteappFactRows({ ok: false }) === null && RA.factsReady(null) === false, 'no facts ⇒ no rows, not ready');
  ok(RA.FACTS_CAPABILITY === 'remoteapp-facts' && RA.CREDENTIAL_ROW === 'remoteapp', 'the op / capability name and the credential row id are spelled once here');
  // RED: a parser that takes Home as an edition that hosts Remote Desktop
  const rsrc = fs.readFileSync(path.join(repo, 'src/remoteapp.js'), 'utf8');
  const homeOk = MUT.load('src/remoteapp.js', cut(cut(rsrc, "  if (HOME_EDITION_RE.test(s)) return 'home';\n", ''), "return RDP_HOST_EDITION_RE.test(s) ? 'pro' : 'unknown';", "return 'pro';"), 'home-ready');
  const homeFacts = homeOk.parseRemoteappFacts(factLine({ edition: 'Core' }));
  ok(homeOk.factsReady(homeFacts) === true && RA.factsReady(RA.parseRemoteappFacts(factLine({ edition: 'Core' }))) === false, 'CONTROL: a parser that takes any edition as one hosting Remote Desktop calls a Windows Home machine READY — the Home row above would be red');
}

console.log('§10 the first connection — the argv and its verdict (measured)');
{
  const TP = await deadPort();
  const a = RA.remoteappTrustArgv({ port: TP, user: 'someone', domain: '' });
  ok(a.ok && same(a.argv, [`/v:127.0.0.1:${TP}`, '/u:someone', '/d:', '/from-stdin:force', '/cert:tofu', '/auth-only', '/log-level:WARN']), 'the first connection\'s argv: the forward, the user, /d: ALWAYS, /from-stdin:force (measured), /cert:tofu, /auth-only — no app, no password', a);
  ok(RA.remoteappTrustArgv({ port: TP, user: 'someone', domain: 'LAB' }).argv[2] === '/d:LAB', 'a domain account: /d:<domain>');
  const refusals = [RA.remoteappTrustArgv({ port: 0, user: 'u' }), RA.remoteappTrustArgv({ port: 1, user: '' }), RA.remoteappTrustArgv({ port: 1, user: 'u', domain: 'a,b' }), RA.remoteappTrustArgv({ port: 1, user: 'u"x' })].map((r) => r.code);
  ok(same(refusals, ['bad-request', 'remoteapp_needs_setup', 'bad-request', 'bad-request']), 'no port / no user / a comma in the domain / a quote in the user — refused by name', refusals);
  ok(!a.argv.some((x) => /^\/p:|password/i.test(x)) && RA.rdpArgVerdict(a.argv).ok, 'never a password; the forbidden-options verdict passes it');
  // THE REAL CLIENT'S LINES (xfreerdp 3.32.1 against the shadow server, /auth-only, 2026-10-16)
  const L = (fn, msg) => `[05:57:39:300] [1:1] [ERROR][com.freerdp.core] - [${fn}]: ${msg}`;
  const okLines = ["[WARN][com.freerdp.crypto] - [verify_cb]: Certificate verification failure 'self-signed certificate (18)' at stack position 0", L('tls_print_certificate_name_mismatch_error', 'A valid certificate for the wrong name should NOT be trusted!'), L('tls_print_new_certificate_warn', 'Host key verification failed.'), L('freerdp_connect_begin', 'Authentication only, exit status 1'), L('freerdp_abort_connect_context', 'ERRCONNECT_CONNECT_CANCELLED [0x0002000B]')];
  const good = RA.trustVerdict({ code: 0, lines: okLines, machine: 'Lab PC' });
  ok(good.ok === true, 'a SUCCESSFUL first connection (exit 0) is ok although its lines say "Host key verification failed." and CONNECT_CANCELLED (measured) — the exit code decides', good);
  const pwLines = [okLines[0], okLines[2], L('nla_recv_pdu', 'ERRCONNECT_LOGON_FAILURE [0x00020014]'), L('freerdp_connect_begin', 'Authentication only, exit status 0')];
  const bad = RA.trustVerdict({ code: 134, lines: pwLines, machine: 'Lab PC' });
  ok(!bad.ok && bad.code === 'rdp_auth_failed' && /refused the Windows sign-in/.test(bad.error) && /nothing was pinned/.test(bad.error), 'a wrong password (134) ⇒ rdp_auth_failed — not "certificate changed" (the tofu lines are noise here) — nothing pinned', bad);
  const none = RA.trustVerdict({ code: 141, lines: [L('get_next_addrinfo', 'ERRCONNECT_CONNECT_FAILED [0x00020006]'), L('freerdp_connect_begin', 'Authentication only, exit status 0')], machine: 'Lab PC' });
  ok(!none.ok && none.code === 'rdp_unreachable', 'nothing listening (141) ⇒ rdp_unreachable', none);
  const plain = RA.trustVerdict({ code: 136, lines: [L('freerdp_connect_begin', 'ERRCONNECT_PRE_CONNECT_FAILED [0x00020001]')], machine: 'Lab PC' });
  ok(!plain.ok && plain.code === 'rdp_client_refused' && RA.EXIT_CODES[136] === 'rdp_client_refused', '`/auth-only` + plain `/from-stdin` (136, PRE_CONNECT_FAILED, measured) ⇒ rdp_client_refused by name', plain);
  ok(RA.trustVerdict({ timedOut: true, code: null, signal: 'SIGKILL', machine: 'Lab PC' }).code === 'rdp_trust_timeout' && RA.trustVerdict({ code: 1, lines: [] }).code === 'rdp_trust_failed' && RA.trustVerdict({ code: 0, signal: 'SIGTERM' }).ok !== true, 'a timeout / an unexplained exit / a signal — refused by name, never ok');
  // RED: a verdict that reads the lines first
  const rsrc = fs.readFileSync(path.join(repo, 'src/remoteapp.js'), 'utf8');
  const linesFirst = MUT.load('src/remoteapp.js', cut(rsrc, "  if (code === 0 && !signal) return { ok: true };\n  const kept = (Array.isArray(lines) ? lines : String(lines || '').split('\\n')).filter((l) => !TOFU_NOISE_RE.test(String(l)));", "  const kept = Array.isArray(lines) ? lines : String(lines || '').split('\\n');\n  { const w = rdpEndVerdict({ code, signal, lines: kept, machine }); if (w && w.code !== 'rdp_cancelled') return refuse(w.code, w.words); }\n  if (code === 0 && !signal) return { ok: true };"), 'lines-first');
  const lf = linesFirst.trustVerdict({ code: 0, lines: okLines, machine: 'Lab PC' });
  ok(lf.ok !== true && lf.code === 'rdp_cert_changed', 'CONTROL: a verdict that reads the lines before the exit code calls the measured SUCCESS a changed certificate — the success leg above would be red', lf);
}

console.log('§11 scrubRdpLog — a password shape never reaches a record or a log at rest');
{
  const pw = ['Rw', 'x9k2', '-q#7'].join('');
  const rows = [
    [`[WARN] using password=${pw} for the sign-in`, '[WARN] using password=<scrubbed>'],
    [`Password: ${pw}`, 'Password: <scrubbed>'],
    [`args /v:x /p:${pw} /u:y`, 'args /v:x /p:<scrubbed>'],
    [`pwd = ${pw};next`, 'pwd = <scrubbed>'],
    [`"passwd":"${pw}"`, '"passwd":"<scrubbed>'],
    [`using password=${pw},with blank ;semi 'quote" }brace for the sign-in\nnext line stays`, 'using password=<scrubbed>\nnext line stays'], // verify r1: a separator inside the password does not end the scrub early
    ['[ERROR] ERRCONNECT_LOGON_FAILURE [0x00020014]', '[ERROR] ERRCONNECT_LOGON_FAILURE [0x00020014]'],
    ['the Windows password could not be read', 'the Windows password could not be read'],
  ];
  for (const [inp, out] of rows) ok(RA.scrubRdpLog(inp) === out, `scrub ${JSON.stringify(out.slice(0, 50))}`, RA.scrubRdpLog(inp));
  ok(RA.scrubRdpLog(`a ${pw} b`, [pw]) === 'a <scrubbed> b' && RA.scrubRdpLog(`a ${pw} b`) === `a ${pw} b` && RA.scrubRdpLog('abc', ['ab']) === 'abc', 'a NAMED secret (≥ 4 characters) is erased wherever it stands; without the name a bare word is left alone');
  ok(RA.scrubRdpLog(null) === '' && RA.scrubRdpLog(undefined) === '', 'nothing in, nothing out');
  const rsrc = fs.readFileSync(path.join(repo, 'src/remoteapp.js'), 'utf8');
  const noScrub = MUT.load('src/remoteapp.js', cut(rsrc, "let s = String(text == null ? '' : text).replace(PASSWORD_SHAPE_RE, (m, head) => `${head}<scrubbed>`);", "let s = String(text == null ? '' : text);"), 'no-scrub');
  ok(noScrub.scrubRdpLog(rows[0][0]).includes(pw), 'CONTROL: the pattern emptied ⇒ the password stays (§11\'s first row would be red)');
}

for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 7 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

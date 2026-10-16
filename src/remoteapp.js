'use strict';
/**
 * REMOTEAPP — ONE APP OF A PAIRED WINDOWS MACHINE AS A REAL X WINDOW (design q-024 r1 §1.1–§1.2, lane remoteapp-r1a). PURE:
 * imports nothing, touches no file system, spawns nothing (the client bundles it for the launcher's words). The hub runs
 * FreeRDP's X client in RemoteApp (RAIL) mode as an ordinary app on its OWN xpra display (src/desktop-backends.js row
 * `remoteapp`, cell `remote: 'rdp-loopback'`), connected to the machine's 127.0.0.1:3389 through the agent's loopback
 * forward (src/server/desktop-access.js — the VNC pipe). Each remote top-level is an X top-level there, so every desktop-app
 * mechanism (satellites, window targets, takeover) applies unchanged. This file holds the verdicts that launch rests on:
 *   remoteappRequestVerdict(req) — the launch request (machine, program, name, args, unicode keyboard), refused by name
 *   remoteappArgv(opts)          — THE argv; the password is never in it (`/from-stdin`); rdpArgVerdict runs on it before return
 *   rdpArgVerdict(argv)          — FORBIDDEN_RDP_ARG_RE: an option that puts a secret on the command line or opens a channel
 *                                  this rung keeps shut (drives, clipboard, audio, smartcard, extra channels) — refused BY NAME
 *   certFpVerdict(s)             — the pinned certificate's sha256 (colon hex, lowercase)
 *   rdpBuildVerdict(facts)       — the hub's own client: FreeRDP 3 (the argv is its syntax), and whether it decodes H.264
 *   parseRailLine / rdpEndVerdict — why a session ended, from the client's own log words and exit code
 *   setupMissing / needsSetupWords — what a machine still lacks before a launch (the settings card is R1b)
 *
 * MEASURED 2026-10-16 (xfreerdp 3.32.1 = Ubuntu 26.04 freerdp-x11, against a FreeRDP shadow server on a private Xvfb, loopback):
 *   • `/gfx:AVC444` and `/gfx:AVC420` are REFUSED at argv parse by a build without H.264 ("Command line parsing failed at
 *     'gfx' value 'AVC444' [-1000]"; `/buildconfig` says WITH_GFX_H264=OFF) — the design's argv never started there. The
 *     argv says `/gfx` (the pipeline, codec negotiated) unless the hub's client reports H.264.
 *   • `/from-stdin` with no `/d:` prompts "Domain:" FIRST and reads the password line as the domain (then EOF ⇒
 *     ERRCONNECT_CONNECT_CANCELLED, exit 145). `/d:` — empty for a local account — makes the one line the password.
 *   • a certificate stored by an earlier TOFU in the client's config dir (~/.config/freerdp/server/<host>_<port>.pem) WINS
 *     over `/cert:deny,fingerprint:sha256:<another>` (it connected). The launch gives the client a fresh XDG_CONFIG_HOME of
 *     its own; then a wrong pin refuses ("Host key verification failed", ERRCONNECT_TLS_CONNECT_FAILED, exit 143) and a
 *     matching pin writes nothing there. `deny` = never an interactive prompt (stdin carries the password).
 *   • a wrong password ⇒ ERRCONNECT_LOGON_FAILURE [0x00020014], exit 134; nothing listening ⇒ ERRCONNECT_CONNECT_FAILED, exit 141.
 *   • `-audio-mode:2`, `/dynamic-resolution`, `/network:auto`, `/kbd:unicode:on`, `-clipboard` parse; the password never
 *     appeared in the client's output (0 of 13 runs).
 */

const RDP_PORT = 3389;              // the machine's own Remote Desktop listener — reached on ITS loopback, never opened to the LAN
const REMOTE_KIND = 'rdp-loopback'; // the DISPLAY_BACKENDS cell `remote` this launch serves
const RDP_PLATFORM = 'win32';       // RemoteApp is a Windows server feature (Pro / Enterprise)
// FreeRDP 3's X client: Ubuntu 26.04's freerdp-x11 ships `xfreerdp` (measured); Debian's freerdp3-x11 names it `xfreerdp3`
const RDP_CLIENT_BINS = Object.freeze(['xfreerdp', 'xfreerdp3']);
const FIELD_MAX = 260;              // Windows MAX_PATH — a program path, an app name, a user
const ARGS_MAX = 1000;

const refuse = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
// a control character (a line break would end the stdin line or forge a log line) or a NUL anywhere is refused
const CONTROL_RE = /[\u0000-\u001f\u007f\u2028\u2029]/;

/** One text field of a request: a string, trimmed, ≤ max, no control character, no comma (`/app:` splits its sub-options
 *  on commas — a comma in a name would add an option of the caller's choosing). → { ok, value } | refusal */
function fieldVerdict(v, label, { required = false, max = FIELD_MAX, comma = false } = {}) {
  if (v === undefined || v === null || v === '') return required ? refuse('bad-request', `RemoteApp needs the ${label}`) : { ok: true, value: null };
  if (typeof v !== 'string') return refuse('bad-request', `the RemoteApp ${label} must be text`);
  const s = v.trim();
  if (!s) return required ? refuse('bad-request', `RemoteApp needs the ${label}`) : { ok: true, value: null };
  if (s.length > max) return refuse('bad-request', `the RemoteApp ${label} is too long (at most ${max} characters)`);
  if (CONTROL_RE.test(s)) return refuse('bad-request', `the RemoteApp ${label} holds a control character`);
  if (!comma && s.includes(',')) return refuse('bad-request', `the RemoteApp ${label} may not hold a comma (the client's /app: option splits on it)`);
  if (s.includes('"')) return refuse('bad-request', `the RemoteApp ${label} may not hold a double quote`);
  return { ok: true, value: s };
}

/** A program the machine can start as a RemoteApp: an absolute Windows path (C:\…\x.exe, %SystemRoot%\…), a published
 *  alias (||name) or a bare file name Windows finds on its path (notepad.exe). Anything else is refused by name. */
const PROGRAM_RE = /^(?:\|\|[\w .-]{1,64}|[A-Za-z]:\\[^<>|?*]+|%[A-Za-z_]+%\\[^<>|?*]+|[\w .-]+\.(?:exe|com|bat|cmd|msc|cpl))$/;

/** The launch request (`body.remoteapp`). → { ok, hostId, program, name, args, kbdUnicode } | refusal */
function remoteappRequestVerdict(req) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) return refuse('bad-request', 'remoteapp must be an object { hostId, program, name?, args?, kbdUnicode? }');
  const hostId = typeof req.hostId === 'string' ? req.hostId.trim() : '';
  if (!hostId || hostId === 'local' || !/^[\w.:-]{1,128}$/.test(hostId)) return refuse('bad-request', 'RemoteApp opens an app of a PAIRED Windows machine — name the machine by its host id');
  const p = fieldVerdict(req.program, 'program');
  if (!p.ok) return p;
  if (!p.value) return refuse('remoteapp_bad_program', 'RemoteApp needs the program to start — its path on the machine, e.g. C:\\Windows\\System32\\notepad.exe');
  if (!PROGRAM_RE.test(p.value)) return refuse('remoteapp_bad_program', `RemoteApp starts a program by its path on the machine (C:\\…\\app.exe), an alias (||name) or an .exe name — not ${JSON.stringify(p.value.slice(0, 80))}`);
  const n = fieldVerdict(req.name, 'name', { max: 120 });
  if (!n.ok) return n;
  const a = fieldVerdict(req.args, 'arguments', { max: ARGS_MAX });
  if (!a.ok) return a;
  if (req.kbdUnicode !== undefined && req.kbdUnicode !== null && typeof req.kbdUnicode !== 'boolean') return refuse('bad-request', 'kbdUnicode must be true or false');
  return { ok: true, hostId, program: p.value, name: n.value || programLabel(p.value), args: a.value, kbdUnicode: req.kbdUnicode === true };
}
/** The window's name when the request gives none: the program's file name without .exe (an alias without its bars). */
function programLabel(program) {
  const s = String(program || '');
  if (s.startsWith('||')) return s.slice(2) || 'RemoteApp';
  const base = s.split('\\').pop() || s;
  return base.replace(/\.(?:exe|com|bat|cmd|msc|cpl)$/i, '') || 'RemoteApp';
}
/** The launcher's typed line → the program (+ arguments) a RemoteApp starts: `start "" "C:\…\x.exe" args` (the run box's
 *  GUI form), `"C:\…\x.exe" args`, or the line itself. The request verdict judges what comes out. */
function remoteappProgramOf(line) {
  const s = String(line || '').trim();
  let m = /^start\s+(?:\/\w+\s+)*""\s+"([^"]+)"\s*(.*)$/i.exec(s) || /^"([^"]+)"\s*(.*)$/.exec(s);
  if (m) return { program: m[1].trim(), args: m[2].trim() || null };
  m = /^(\S+\.(?:exe|com|bat|cmd|msc|cpl))(?:\s+(.*))?$/i.exec(s);
  if (m) return { program: m[1], args: (m[2] || '').trim() || null };
  return { program: s, args: null };
}

/** The pinned certificate: sha256 as 32 hex pairs (FreeRDP's own Thumbprint form, colon-separated, lowercase); a bare
 *  64-hex string or `sha256:` prefix is normalised. → { ok, fp } | refusal */
function certFpVerdict(s) {
  const raw = typeof s === 'string' ? s.trim().replace(/^sha256:/i, '').toLowerCase() : '';
  if (!raw) return refuse('rdp_cert_missing', 'no certificate fingerprint is pinned for this machine yet');
  const bare = raw.replace(/:/g, '');
  if (!/^[0-9a-f]{64}$/.test(bare) || (raw.includes(':') && !/^[0-9a-f]{2}(?::[0-9a-f]{2}){31}$/.test(raw))) return refuse('rdp_cert_bad', 'the pinned certificate fingerprint is not a sha256 (32 bytes as hex pairs, aa:bb:…)');
  return { ok: true, fp: bare.match(/../g).join(':') };
}

// ── THE FORBIDDEN OPTIONS (design §1.6 fence 3: drives, clipboard, audio, smartcard, dynamic channels stay OFF; a row
// cannot turn one on) — refused BY NAME wherever they appear. `-<name>` with no value is FreeRDP's "disable" and passes
// (the argv's own `-clipboard`); every other sigil, and any value, is a refusal.
const FORBIDDEN_RDP_ARG_RE = /^[/+-](p|pth|drive|drives|home-drive|clipboard|multimon|smartcard|vc|dvc|sound|microphone|args-from|gateway|gp)(?=:|$)/i;
const FORBIDDEN_WHY = Object.freeze({
  p: 'a password never goes on the command line — the client reads it from stdin',
  pth: 'a password hash never goes on the command line',
  drive: 'no drive of this machine is shared with the remote one', drives: 'no drive of this machine is shared with the remote one', 'home-drive': 'no drive of this machine is shared with the remote one',
  clipboard: 'the clipboard stays off between the machines',
  multimon: 'one window per remote app, never a desktop spanning the screens',
  smartcard: 'no smartcard is passed through',
  vc: 'no extra virtual channel is opened', dvc: 'no extra dynamic channel is opened',
  sound: 'audio stays off', microphone: 'audio stays off',
  'args-from': 'the command line is VibeSpace\'s own (and stdin carries the password)',
  gateway: 'the connection goes only to the machine\'s own loopback, through its agent', gp: 'a password never goes on the command line',
});
/** → { ok:true } | { ok:false, code:'rdp_arg_forbidden', name, error } — the first forbidden element, by name. */
function rdpArgVerdict(argv) {
  if (!Array.isArray(argv)) return refuse('bad-request', 'the RemoteApp command line must be a list');
  for (const a of argv) {
    if (typeof a !== 'string' || CONTROL_RE.test(a)) return refuse('rdp_arg_forbidden', 'a RemoteApp command-line word holds a control character', { name: null });
    const m = FORBIDDEN_RDP_ARG_RE.exec(a);
    if (m && !(a[0] === '-' && !a.includes(':'))) {
      const name = m[1].toLowerCase();
      return refuse('rdp_arg_forbidden', `RemoteApp refuses the xfreerdp option ${a[0]}${name}${a.includes(':') ? ':' : ''} — ${FORBIDDEN_WHY[name]}`, { name });
    }
  }
  return { ok: true };
}

/**
 * THE ARGV (design §1.2, as measured above): the hub's loopback port of the forward, the user, `/d:` ALWAYS (empty for a
 * local account — without it the stdin line is read as the domain), `/from-stdin` (the ONE line the keeper writes, then
 * closes), the pinned certificate with `deny` (never a prompt), the app, the graphics pipeline, clipboard + audio off, the
 * network auto-detected, the client's log at WARN. `/kbd:unicode:on` is the ONE optional extra (non-ASCII typing — the
 * real-machine leg confirms it on RAIL). → { ok, argv } | refusal
 */
function remoteappArgv({ port, user, domain = '', program, name, args = null, certFp, kbdUnicode = false, h264 = false } = {}) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return refuse('bad-request', `the RemoteApp forward port ${JSON.stringify(port)} is not a port`);
  const u = fieldVerdict(user, 'user name', { comma: true });
  if (!u.ok) return u;
  if (!u.value) return refuse('remoteapp_needs_setup', 'RemoteApp needs the Windows user name of the machine');
  const d = fieldVerdict(domain, 'domain', { max: 120 });
  if (!d.ok) return d;
  const rq = remoteappRequestVerdict({ hostId: 'h', program, name, args, kbdUnicode });
  if (!rq.ok) return rq;
  const fv = certFpVerdict(certFp);
  if (!fv.ok) return fv;
  const app = [`program:${rq.program}`, `name:${rq.name}`, ...(rq.args ? [`cmd:${rq.args}`] : [])].join(',');
  const argv = [`/v:127.0.0.1:${p}`, `/u:${u.value}`, `/d:${d.value || ''}`, '/from-stdin', `/cert:deny,fingerprint:sha256:${fv.fp}`, `/app:${app}`,
    '/dynamic-resolution', h264 === true ? '/gfx:AVC444' : '/gfx', '-clipboard', '-audio-mode:2', '/network:auto', '/log-level:WARN', ...(rq.kbdUnicode ? ['/kbd:unicode:on'] : [])];
  const v = rdpArgVerdict(argv);
  if (!v.ok) return v;
  return { ok: true, argv };
}

/** The hub's own client, from `<bin> /version` and `<bin> /buildconfig`: FreeRDP 3 or refused by name (the argv is
 *  FreeRDP 3's syntax: FreeRDP 2 has no `/app:program:` nor `/cert:fingerprint:`), and whether it decodes H.264.
 *  → { ok, version, major, h264 } | refusal */
function rdpBuildVerdict({ version = '', buildconfig = '' } = {}) {
  const m = /FreeRDP version (?:\[[^\]]*\] )?(\d+)\.(\d+)\.(\d+)/.exec(String(version || ''));
  if (!m) return refuse('rdp_client_unknown', `could not read the FreeRDP version of this machine's RDP client (${JSON.stringify(String(version || '').split('\n')[0].slice(0, 80))})`);
  const v = `${m[1]}.${m[2]}.${m[3]}`;
  if (Number(m[1]) < 3) return refuse('rdp_client_too_old', `this machine's RDP client is FreeRDP ${v} — RemoteApp speaks FreeRDP 3's command line (apt install freerdp3-x11)`);
  return { ok: true, version: v, major: Number(m[1]), h264: /(?:^|\s)WITH_GFX_H264=ON(?=\s|$)/.test(String(buildconfig || '')) };
}
/** Which of RDP_CLIENT_BINS a satisfied needs-group (`via`, e.g. 'xpra+xfreerdp') names, or null. */
function rdpClientOf(via) { return String(via || '').split('+').find((n) => RDP_CLIENT_BINS.includes(n)) || null; }

// ── WHY A SESSION ENDED — the client's own words (FreeRDP's constant names; the cert / logon / connect rows MEASURED,
// the RAIL row from FreeRDP's xf_rail.c "RAIL exec error: execResult=…" — UNCONFIRMED until the real-machine leg) ──
const RAIL_EXEC = Object.freeze({ RAIL_EXEC_E_NOT_IN_ALLOWLIST: 'rail_not_allowed', RAIL_EXEC_E_FILE_NOT_FOUND: 'rail_no_program', RAIL_EXEC_E_SESSION_LOCKED: 'rail_session_locked' });
const RAIL_LINE_ROWS = Object.freeze([
  Object.freeze({ re: /Command line parsing failed at '([\w-]+)'/, code: () => 'rdp_bad_argv' }), // measured: `/gfx:AVC444` on a build without H.264
  Object.freeze({ re: /Host key verification failed|certificate not trusted, aborting/, code: () => 'rdp_cert_changed' }),
  Object.freeze({ re: /\bERRCONNECT_(LOGON_FAILURE|AUTHENTICATION_FAILED|WRONG_PASSWORD|ACCOUNT_LOCKED_OUT|ACCOUNT_DISABLED|ACCOUNT_RESTRICTION|ACCOUNT_EXPIRED|PASSWORD_EXPIRED|PASSWORD_CERTAINLY_EXPIRED|PASSWORD_MUST_CHANGE|LOGON_TYPE_NOT_GRANTED)\b/, code: () => 'rdp_auth_failed' }),
  Object.freeze({ re: /\b(RAIL_EXEC_E_[A-Z_]+)\b/, code: (m) => RAIL_EXEC[m[1]] || 'rail_refused' }),
  Object.freeze({ re: /\bERRCONNECT_TLS_CONNECT_FAILED\b/, code: () => 'rdp_tls_failed' }),
  Object.freeze({ re: /\bERRCONNECT_(CONNECT_FAILED|DNS_NAME_NOT_FOUND)\b/, code: () => 'rdp_unreachable' }),
  Object.freeze({ re: /\bERRCONNECT_CONNECT_TRANSPORT_FAILED\b/, code: () => 'rdp_link_lost' }), // a session whose connection dropped (FreeRDP's constant; the fake prints it — unmeasured on a real drop)
  Object.freeze({ re: /\bERRCONNECT_CONNECT_CANCELLED\b/, code: () => 'rdp_cancelled' }),
]);
// most decisive first: a cert refusal also prints the TLS failure, a stop prints CANCELLED after anything else
const END_RANK = Object.freeze(['rdp_bad_argv', 'rdp_cert_changed', 'rdp_auth_failed', 'rail_not_allowed', 'rail_no_program', 'rail_session_locked', 'rail_refused', 'rdp_tls_failed', 'rdp_unreachable', 'rdp_link_lost', 'rdp_cancelled']);
// MEASURED exit codes of xfreerdp 3.32.1 (its XF_EXIT_* table)
const EXIT_CODES = Object.freeze({ 134: 'rdp_auth_failed', 141: 'rdp_unreachable', 143: 'rdp_tls_failed', 145: 'rdp_cancelled' });
const END_WORDS = Object.freeze({
  rdp_bad_argv: () => 'this machine\'s RDP client refused its command line (an option its build does not have) — nothing was sent to the machine',
  rdp_cert_changed: (m) => `${m}'s Remote Desktop certificate is not the one pinned for it — the connection was refused (a reinstalled machine needs its new certificate trusted again)`,
  rdp_auth_failed: (m) => `${m} refused the Windows sign-in (a wrong user name or password, or an account that may not sign in remotely)`,
  rail_not_allowed: (m) => `${m} refused to start the app as a RemoteApp: it is not in its allow list (TSAppAllowList fDisabledAllowList is not 1)`,
  rail_no_program: (m) => `${m} found no program at that path`,
  rail_session_locked: (m) => `${m}'s remote session is locked`,
  rail_refused: (m) => `${m} refused to start the app as a RemoteApp`,
  rdp_tls_failed: (m) => `the Remote Desktop connection to ${m} failed while setting up its encryption`,
  rdp_unreachable: (m) => `nothing answered on ${m}'s Remote Desktop port (3389) — is Remote Desktop turned on there?`,
  rdp_link_lost: (m) => `the Remote Desktop connection to ${m} dropped (its agent's link or the machine went away)`,
  rdp_cancelled: (m) => `the RemoteApp connection to ${m} was closed`,
});
/** One line of the client's output → { code, line } for a line that says why the session ends, else null (noise such as
 *  the Kerberos "no default realm" lines every NLA connect prints at ERROR is null). */
function parseRailLine(line) {
  const s = String(line || '');
  for (const row of RAIL_LINE_ROWS) { const m = row.re.exec(s); if (m) return { code: row.code(m), line: s.slice(0, 300) }; }
  return null;
}
/** Why a RemoteApp session ended: the most decisive line verdict in its output, else its exit code's (measured table),
 *  else null (an exit nobody explained — the keeper's "application exited (code N)" stands). → { code, words } | null */
function rdpEndVerdict({ code = null, signal = null, lines = [], machine = 'the machine' } = {}) {
  const found = (Array.isArray(lines) ? lines : String(lines || '').split('\n')).map(parseRailLine).filter(Boolean).map((v) => v.code);
  let best = null;
  for (const c of found) if (best === null || END_RANK.indexOf(c) < END_RANK.indexOf(best)) best = c;
  if (!best && !signal && Number.isInteger(code)) best = EXIT_CODES[code] || null;
  return best ? { code: best, words: END_WORDS[best](machine) } : null;
}

/** RemoteApp is for a paired Windows machine. → null | refusal */
function platformVerdict(platform, machine = 'this machine') {
  return platform === RDP_PLATFORM ? null : refuse('remoteapp_not_windows', `${machine} runs ${platform || 'an unknown system'} — RemoteApp opens apps of a Windows machine (Pro or Enterprise)`);
}
/** What a machine's RemoteApp setup still lacks: `{ user, domain?, certFp, password: () => string }` (the password a
 *  GETTER, read only at the spawn). → [] when complete, else the missing parts by name ('user', 'password', 'certificate'). */
function setupMissing(s) {
  if (!s || typeof s !== 'object') return ['user', 'password', 'certificate'];
  const out = [];
  if (!(typeof s.user === 'string' && s.user.trim())) out.push('user');
  if (typeof s.password !== 'function') out.push('password');
  if (!certFpVerdict(s.certFp).ok) out.push('certificate');
  return out;
}
const MISSING_WORDS = Object.freeze({ user: 'its Windows user name', password: 'its Windows password', certificate: 'its Remote Desktop certificate fingerprint' });
/** The refusal sentence for an incomplete setup — honest that the card asking for it is the next version (R1b). */
function needsSetupWords(missing, machine = 'this machine') {
  const parts = (Array.isArray(missing) && missing.length ? missing : ['user', 'password', 'certificate']).map((k) => MISSING_WORDS[k] || k);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `RemoteApp on ${machine} needs ${list} — the RemoteApp settings card that asks for them comes in the next version; until then "Run as its own window" opens its apps as a cropped picture`;
}
/** The words for a hub without the client (the needs verdict's missing list) — the package to install named. */
function needsClientWords(missing) {
  return `RemoteApp needs xpra and FreeRDP 3's X client on this machine (${(missing || []).join('; ') || 'not on PATH'}) — apt install freerdp3-x11`;
}

module.exports = {
  RDP_PORT, REMOTE_KIND, RDP_PLATFORM, RDP_CLIENT_BINS, FORBIDDEN_RDP_ARG_RE, EXIT_CODES,
  remoteappRequestVerdict, remoteappProgramOf, programLabel, certFpVerdict, rdpArgVerdict, remoteappArgv, rdpBuildVerdict, rdpClientOf,
  parseRailLine, rdpEndVerdict, platformVerdict, setupMissing, needsSetupWords, needsClientWords,
};

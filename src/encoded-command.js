'use strict';
// PURE (imports only src/hidden-chars.js; CJS — exit-reach (the door, the card's words, the history rows, the ask), the
// chat card and the machine's Commands… list in the bundle all require it) — A POWERSHELL `-EncodedCommand` SHOWN AS THE
// SCRIPT IT RUNS (lane machine-card-fold, 2026-10-04; the owner's phone: every "Machines · WIN-DESK1" card spelled
// `powershell -NoProfile -NonInteractive -EncodedCommand WwBDAG8A…`, 700 characters nobody can read).
//
// `encodedCommandOf(cmd)` → null (the line is not one this module decodes — it is shown as itself, as before) |
// `{ok: true, exe, flag, script, head, hidden}` | `{ok: false, code, error}` (code: invalid_base64 | odd_length | too_big
// | bad_utf16). The line is recognised in ONE strict shape only, so the script shown IS what runs: the interpreter
// (`powershell`, `powershell.exe`, `pwsh`, `pwsh.exe` bare, or one of the places Windows installs them, quoted or not — verify
// r1 V1: the interpreter word is read by the SHELL first, so `C:\x&calc&\powershell.exe` ran calc under cmd.exe and
// `"$(…)/usr/bin/pwsh"` a substitution under sh, while the card said "PowerShell: <script>"; and a powershell.exe in any
// other folder is not provably PowerShell), then nothing but known switches (-NoProfile, -NonInteractive, -NoLogo, -NoExit,
// -Sta, -Mta and their abbreviations), known one-word options (-ExecutionPolicy / -ep, -WindowStyle / -w, -InputFormat,
// -OutputFormat) and EXACTLY ONE encoded-command flag (`-EncodedCommand` or any prefix of it from `-e`, or `-ec`) with its
// base64. A flag is spelled `-`; `--` only for pwsh (Windows PowerShell 5.1 documents `-` and `/`), `/` only for powershell
// (under pwsh on Linux/macOS a `/` word is a script path — the shebang rule). Anything else on the
// line — a `-Command`, a second flag, a shell operator (`&`, `|`, `;`, `>`…), a quote past the interpreter — is not
// decoded: the line is shown raw, exactly as before this module.
// The decode is BOUNDED (≤ ENCODED_MAX_BYTES of UTF-16LE, judged from the base64's length before a byte is decoded) and
// needs no Buffer (the bundle runs it). `script` keeps what runs; `shown` = its CRLF line ends as LF (a LONE CR stays,
// and is hidden: CSS draws it as a space where PowerShell ends a line). `hidden` = THE belt's verdict on `shown`
// (src/hidden-chars.js, strict — as for a plain command): direction controls and invisible characters, as U+XXXX codes.
const HC = require('./hidden-chars.js');

const ENCODED_MAX_BYTES = 64 * 1024;
const EXES = new Set(['powershell', 'powershell.exe', 'pwsh', 'pwsh.exe']);
// verify r1 V1: the only paths taken as the interpreter (lower case, `.exe` optional) — fixed words no shell expands; a
// POSIX path is not here (on Windows `/usr/bin/pwsh` is C:\usr\bin\pwsh.exe, a folder any user can make)
const WIN_PATHS = new Set(['c:\\windows\\system32\\windowspowershell\\v1.0\\powershell', 'c:\\windows\\syswow64\\windowspowershell\\v1.0\\powershell', 'c:\\program files\\powershell\\7\\pwsh']);
const exeOf = (word) => { const w = word.toLowerCase(); return EXES.has(w) || WIN_PATHS.has(w.replace(/\.exe$/, '')) ? w.split('\\').pop() : null; };
// switches: [full name, shortest accepted prefix]
const SWITCHES = [['noprofile', 3], ['noninteractive', 4], ['nologo', 3], ['noexit', 3], ['sta', 3], ['mta', 3]];
const OPTIONS = [['executionpolicy', 2], ['ep', 2], ['windowstyle', 1], ['inputformat', 3], ['outputformat', 1]];
const isPrefixOf = (name, full, min) => name.length >= min && full.startsWith(name);
const isEncodedFlag = (name) => name === 'ec' || name === 'e' || (name.length >= 2 && 'encodedcommand'.startsWith(name));
const REFUSED = Object.freeze({
  invalid_base64: 'the -EncodedCommand value is not base64 (A–Z a–z 0–9 + /, padded to a multiple of 4)',
  odd_length: 'the -EncodedCommand value decodes to an odd number of bytes — not UTF-16LE text',
  too_big: `the -EncodedCommand script is over ${ENCODED_MAX_BYTES / 1024} KiB decoded`,
  bad_utf16: 'the -EncodedCommand script holds a lone surrogate — not valid UTF-16 text',
});
const refuse = (code) => ({ ok: false, code, error: REFUSED[code] });

/** The line's tokens (spaces / tabs), the first one possibly a quoted path; null when the line is not plain words. */
function tokensOf(line) {
  let rest = line, first;
  if (rest.startsWith('"')) {
    const end = rest.indexOf('"', 1);
    if (end < 0) return null;
    first = rest.slice(1, end);
    rest = rest.slice(end + 1);
    if (rest && !/^[ \t]/.test(rest)) return null;
  } else {
    const m = /^[^ \t]+/.exec(rest);
    first = m ? m[0] : '';
    rest = rest.slice(first.length);
  }
  if (!first || /["]/.test(first)) return null;
  const others = rest.trim() ? rest.trim().split(/[ \t]+/) : [];
  // every other token is a flag, a one-word value or base64 — nothing a shell would read as an operator or a quote
  for (const tk of others) if (!/^[A-Za-z0-9+/=_.:-]+$/.test(tk)) return null;
  return [first, ...others];
}

/** Base64 (standard alphabet, padded) of UTF-16LE → the text, or a named refusal. Bounded before it decodes. */
function decodeUtf16Base64(b64) {
  const v = String(b64 == null ? '' : b64);
  if (!v || v.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(v)) return refuse('invalid_base64');
  const pad = v.endsWith('==') ? 2 : v.endsWith('=') ? 1 : 0;
  const nBytes = (v.length / 4) * 3 - pad;
  if (nBytes > ENCODED_MAX_BYTES) return refuse('too_big');
  if (nBytes % 2) return refuse('odd_length');
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new Uint8Array(nBytes);
  let o = 0;
  for (let i = 0; i < v.length; i += 4) {
    const a = A.indexOf(v[i]), b = A.indexOf(v[i + 1]);
    const c = v[i + 2] === '=' ? 0 : A.indexOf(v[i + 2]), d = v[i + 3] === '=' ? 0 : A.indexOf(v[i + 3]);
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < nBytes) bytes[o++] = (n >> 16) & 255;
    if (o < nBytes) bytes[o++] = (n >> 8) & 255;
    if (o < nBytes) bytes[o++] = n & 255;
  }
  let s = '';
  for (let i = 0; i < nBytes; i += 2) {
    const u = bytes[i] | (bytes[i + 1] << 8);
    if (u >= 0xd800 && u <= 0xdbff) { const nx = i + 3 < nBytes ? (bytes[i + 2] | (bytes[i + 3] << 8)) : -1; if (nx < 0xdc00 || nx > 0xdfff) return refuse('bad_utf16'); }
    else if (u >= 0xdc00 && u <= 0xdfff) { const pv = i >= 2 ? (bytes[i - 2] | (bytes[i - 1] << 8)) : -1; if (pv < 0xd800 || pv > 0xdbff) return refuse('bad_utf16'); }
    s += String.fromCharCode(u);
  }
  return { ok: true, text: s };
}

/** See the header. Bounded: a line longer than the base64 of ENCODED_MAX_BYTES plus 2 KiB of flags is not looked at whole. */
function encodedCommandOf(cmd) {
  const line = String(cmd == null ? '' : cmd).trim();
  if (!line || line.length > Math.ceil(ENCODED_MAX_BYTES / 3) * 4 + 4096) return line ? refuseIfEncoded(line) : null;
  const tk = tokensOf(line);
  if (!tk) return null;
  const exe = exeOf(tk[0]);
  if (!exe) return null;
  const pwsh = exe.startsWith('pwsh');
  let b64 = null, flag = null;
  for (let i = 1; i < tk.length; i++) {
    const m = /^(-|--|\/)([A-Za-z]+)$/.exec(tk[i]);
    if (!m || (m[1] === '--' && !pwsh) || (m[1] === '/' && pwsh)) return null;   // verify r1 V1: the prefix each interpreter reads as a flag
    const name = m[2].toLowerCase();
    if (isEncodedFlag(name)) {
      if (b64 !== null || i + 1 >= tk.length) return null;   // one encoded flag, with its value
      flag = tk[i]; b64 = tk[++i];
      continue;
    }
    if (SWITCHES.some(([full, min]) => isPrefixOf(name, full, min))) continue;
    if (OPTIONS.some(([full, min]) => isPrefixOf(name, full, min))) {
      if (i + 1 >= tk.length || !/^[A-Za-z]+$/.test(tk[i + 1])) return null;
      i++;
      continue;
    }
    return null;
  }
  if (b64 === null) return null;
  const d = decodeUtf16Base64(b64);
  if (!d.ok) return d;
  const script = d.text;
  const shown = script.replace(/\r\n/g, '\n');
  const hidden = HC.hiddenCharsOf(shown, { max: 64 });
  const firstLine = (shown.split('\n').find((l) => l.trim()) || '').trim();
  return { ok: true, exe: pwsh ? 'pwsh' : 'powershell', flag, script, shown, head: HC.revealHidden(firstLine), hidden };
}
/** An over-long line that still LOOKS like an encoded command is refused as too big (never decoded, never scanned whole). */
function refuseIfEncoded(line) {
  const start = line.slice(0, 400).toLowerCase();
  return /^"?[^ \t"]*?(?:powershell|pwsh)(?:\.exe)?"?[ \t]/.test(start) && /[ \t](?:--?|\/)e(?:c|n[a-z]*)?[ \t]/.test(start) ? refuse('too_big') : null;
}

/** The one-line head a person reads for a command: "PowerShell: <the script's first line>" for an encoded command (its
 *  hidden characters spelled ⟦U+XXXX⟧), else the command itself. */
function commandHeadOf(cmd) {
  const e = encodedCommandOf(cmd);
  return e && e.ok ? `PowerShell: ${e.head}` : String(cmd == null ? '' : cmd);
}

module.exports = { ENCODED_MAX_BYTES, REFUSED, encodedCommandOf, decodeUtf16Base64, commandHeadOf };

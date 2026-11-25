'use strict';
/**
 * THE VAULT'S FILE ENTRY — PURE (lane lg-vault-file, B-0830; design q-058, design-desk/vault-file-kind.zh.md, the owner's
 * decisions of 2026-11-03: a 1 MB cap · the owner's own namespace `keyfile:<10 hex>` · a stored text value is never upgraded
 * into a file · a passphrase-protected private key is stored AS IS, said, never refused). Imports only the key-format
 * classifier (PURE, src/ssh-key-format.js). No fs, no clock, no crypto: the engine hands bytes in and gets verdicts back.
 *
 *   · A FILE ENTRY = a vault entry whose box carries `file` ({ id, name, size, kind, encrypted } — never a digest of the bytes): its sealed VALUE is
 *     a random 32-byte FILE KEY, the bytes live in `data/vault-files/<id>.vfile` sealed under it (src/server/vault-files.js).
 *     The box's `file` is facts only — a name a person gave, a size, a kind read from the header, `encrypted` — never a byte.
 *   · `fileVerdict(bytes, filename)` judges a put: 8 bytes ≤ size ≤ FILE_MAX (a shorter file cannot be masked in a run's
 *     output — the run door's MIN_MASK_BYTES — and a file the vault is not a blob store for is refused by name), the name
 *     cleaned (no path, no control or direction character, ≤ NAME_MAX; a name that cleans to nothing is refused).
 *   · `kindOf(bytes)` — ONE field, ONE meaning, read from the HEADER only (never the extension, never a mime sniff):
 *     `ssh-key` (an OpenSSH or a classic RSA / DSA / EC private key) · `pem` (a certificate, a PKCS#8 key, any other PEM
 *     block) · `generic` (anything else). `encrypted` = a private key that needs its passphrase (src/ssh-key-format.js reads
 *     the openssh-key-v1 body: its armor is the same with or without one).
 *   · `maskSetOf(bytes)` / `runValuesOf(bytes)`: what a run's output is masked of (design §3) — a file ≤ 2 KB WHOLE (raw · base64
 *     · hex both cases — the scrubber's wrap view reads them folded), its base64 and hex in 64-character pieces, every DISTINCT
 *     line (trimmed) of 16 bytes or more (up to LINES_MAX lines and LINE_BYTES_MAX bytes of lines), and a short file's trimmed
 *     whole. `runValuesOf` hands them as plain VALUES of THE ONE SCRUBBER (src/vault-scrubber.js), spelled by its own forms in the
 *     run's scan worker — 主开发 r4378: the U1a cure's own index and stepper are gone (one scrubber cannot disagree with itself). THE BOUNDARY (said, not hidden): a shell that DECODES a field of a structured file and prints it
 *     (`jq -r .private_key`, a kubeconfig's base64 `client-key-data`) prints no line of the file — «a part of a value is not
 *     masked»; and ONE line's own encoding (a Basic header or a percent-encoding built from one line of a many-line file) is
 *     not masked either — the whole file's encodings and a short file's trimmed whole are.
 */
const KF = require('./ssh-key-format.js');

const FILE_MAX = 1024 * 1024;        // the owner's D1 (2026-11-03): a key, a certificate chain, a kubeconfig, a licence file are far under it
const FILE_MIN = 8;                  // = src/vault-run.js MIN_MASK_BYTES: a shorter value cannot be masked in a run's output
const NAME_MAX = 120;
const LINE_MIN = 16;                 // a line shorter than this is ordinary text (`}`, `apiVersion: v1`) — never masked on its own
const LINES_MAX = 4096;
const LINE_BYTES_MAX = 256 * 1024;   // the measured case (design §3: 4 096 lines × 64 B ⇒ 8.3 MB of forms, 365 ms to build)
const ID_RE = /^[0-9a-f]{10}$/;
const KEYFILE_RE = /^keyfile:([0-9a-f]{10})$/;   // the owner's own file entries (decision D4) — an agent's stay agent:<conv>/<name>
const KEYFILE_PREFIX = 'keyfile:';
const FILE_DIR = 'vault-files';
const FILE_SUFFIX = '.vfile';
const KINDS = Object.freeze(['ssh-key', 'pem', 'generic']);

// THE FILE FIGURE (主开发 r4378 (c)): what a RUN can carry of files, in all — the bytes of every file one run names. Measured at the
// run door's largest set (256 entries, ENTRY_MAX) by r1216's rule, the stand-in's own numbers stated in the line that set it: every
// piece of a file is a value of THE ONE SCRUBBER (runValuesOf), and past this the scan's figures no longer hold for an ordinary run.
// The vault KEEPS files up to FILE_MAX; a larger one is refused for a run BY NAME before it starts (file_too_large_for_a_run).
const RUN_FILE_BYTES_MAX = 24 * 1024;   // MEASURED (probe 2b, bc8042dae-20261125170211-box): at the largest set a 24 KiB file's longest ordinary turn is 0.734 of 2^24 (1.36×, over the 1.25× r1216's measure accepted); 32 KiB is 0.934 (1.07×)
const kb = (n) => `${Math.round(Number(n) / 1024)} KB`;
/** the refusal's words (主开发 r4378 (a)): it names the file, its line count and the figure, and says what still works, in one
 *  breath — the run's reply and the page's mark say the same */
const tooLargeForARunWords = (name, lines, size) => `the file «${cleanName(name) || 'file'}» (${Number.isInteger(lines) ? `${lines} lines, ` : ''}${kb(size)}) is too large for a run: a run carries files of up to ${kb(RUN_FILE_BYTES_MAX)} in all, so that every line of them can be kept out of its output. The file stays in the vault — the owner can still download it, and an agent can still ask the owner for it`;
const WORDS = Object.freeze({
  file_too_large_for_a_run: `the files this run names are too large for a run: a run carries files of up to ${kb(RUN_FILE_BYTES_MAX)} in all, so that every line of them can be kept out of its output. The files stay in the vault — the owner can still download them, and an agent can still ask the owner for one`,
  file_empty: 'the file is empty — nothing was stored',
  file_too_small: `a file under ${FILE_MIN} bytes cannot be masked in a run's output — store it as a text value (put --from-file)`,
  file_too_large: `the vault keeps files up to 1 MB (${FILE_MAX} bytes) — it is not a file store; nothing was stored`,
  file_name_bad: 'give the file a name (letters, digits, dots — no folder, no control character)',
  bytes_bad: 'the file did not arrive whole (its size or its digest differs from what was sent) — nothing was stored',
  file_needs_file: 'that entry is a FILE — a run gets it as a 0600 file only, never as --env, --stdin, inside a template or on the command line',
  not_a_file: 'that entry holds a text value, not a file — a text value is never turned into a file; put the file under a new name',
  is_a_file: 'that entry holds a file — put it again with --file <0600 file> (a file is never turned into a text value)',
  // the cure: a sealed file that cannot be opened is said by its own name at every door (a run's answer too — it was «entry_unknown»)
  file_missing: 'the sealed file is missing — restore data/vault-files from the same backup as data/vault.json',
  file_damaged: 'the sealed file is not the one the entry names — restore data/vault-files from the same backup as data/vault.json',
  file_unreadable: 'the sealed file could not be read — nothing was used',
  file_moved: 'the file was replaced or deleted while it was being read — nothing was used; run it again',
  file_not_stored: 'the file could not be sealed on the hub — put it again (`vibespace-vault list` shows whether its name holds a file)',   // round 3: a put that throws (was answered with a READ's words)
  encrypted_kept: 'stored as is: a private key protected by its passphrase — a command run with it needs that passphrase, and VibeSpace never types it',
  file_copy: 'the file you put is still on disk where it was — delete that copy yourself when you no longer need it (VibeSpace never deletes your files)',
});

const CTRL_RE = /[\x00-\x1f\x7f-\x9f\u{ad}\u{61c}\u{180e}\u{200b}-\u{200f}\u{2028}-\u{202e}\u{2060}-\u{206f}\u{feff}]/gu;
/** A file name as a person or an agent gave it → the name the run writes (no folder part, no control or direction
 *  character, ≤ NAME_MAX characters) | null. */
function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const base = raw.split(/[\\/]/).pop().replace(CTRL_RE, '').trim();
  const cut = [...base].slice(0, NAME_MAX).join('').trim();
  if (!cut || cut === '.' || cut === '..' || /^\.+$/.test(cut)) return null;
  return cut;
}

const asBuf = (b) => (Buffer.isBuffer(b) ? b : b instanceof Uint8Array ? Buffer.from(b.buffer, b.byteOffset, b.byteLength) : null);
/** The first PEM armor line of the file's head (leading blank space allowed) → its label | null. */
function pemLabelOf(buf) {
  const head = buf.subarray(0, 4096).toString('latin1').replace(/^\s+/, '');
  const m = /^-----BEGIN ([A-Z0-9 ]{1,60})-----/.exec(head);
  return m ? m[1] : null;
}
/** bytes → 'ssh-key' | 'pem' | 'generic' (the HEADER only). */
function kindOf(bytes) {
  const buf = asBuf(bytes);
  if (!buf || !buf.length) return 'generic';
  const label = pemLabelOf(buf);
  if (!label) return 'generic';
  if (label === 'OPENSSH PRIVATE KEY' || label === 'RSA PRIVATE KEY' || label === 'DSA PRIVATE KEY' || label === 'EC PRIVATE KEY') return 'ssh-key';
  return 'pem';
}
/** Is it a private key that needs its passphrase? (an OpenSSH key's body says it; PEM / PKCS#8 their headers) */
function encryptedOf(bytes) {
  const buf = asBuf(bytes);
  const label = buf ? pemLabelOf(buf) : null;
  if (!label || !/PRIVATE KEY$/.test(label)) return false;
  try { return !!KF.classifyPrivateKey(buf.subarray(0, 64 * 1024).toString('latin1')).encrypted; } catch { return false; }
}

/** A put's bytes + its name → { ok: true, name, size, kind, encrypted } | { ok: false, code, words }. (sha256 is the engine's — no crypto here.) */
function fileVerdict(bytes, filename) {
  const buf = asBuf(bytes);
  if (!buf || !buf.length) return refuse('file_empty');
  if (buf.length < FILE_MIN) return refuse('file_too_small');
  if (buf.length > FILE_MAX) return refuse('file_too_large');
  const name = cleanName(filename);
  if (!name) return refuse('file_name_bad');
  return { ok: true, name, size: buf.length, lines: linesOf(buf), kind: kindOf(buf), encrypted: encryptedOf(buf) };
}
/** a file's line count — its newlines, and one more for a last line with none (in memory, at the owner's put: a newline count) */
function linesOf(buf) { let n = 0; for (let i = buf.indexOf(10); i !== -1; i = buf.indexOf(10, i + 1)) n++; return buf.length && buf[buf.length - 1] !== 10 ? n + 1 : n; }
/** whether a file fits what a run can carry (主开发 r4378 (b): the page's row and the upload door say it at once) → { fits, size, lines, max } */
function runFitOf(f) {
  const size = Math.max(0, Math.floor(Number(f && f.size) || 0)), lines = f && Number.isInteger(f.lines) ? f.lines : null;
  return { fits: size <= RUN_FILE_BYTES_MAX, size, lines, max: RUN_FILE_BYTES_MAX };
}
function refuse(code) { return { ok: false, code, words: WORDS[code] || code }; }

/** Strict UTF-8 text of the bytes, or null (the derived-value pin reads a text file only). */
function textOf(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return null; }
}
const WHOLE_MAX = 2048;   // a file up to this size is masked WHOLE too (raw · base64 · hex); a bigger one by PIECES (the masker's window stays small)
const PIECE = 64;         // a piece: 64 characters of the file's base64 / hex (each base64 piece is 48 bytes at a 48-byte boundary — the whole file's base64 holds it at a 64-character boundary)
const LINE_MAX = 1024;    // a longer line (minified JSON, one long base64 line) is masked by its own 64-character pieces
const TRIM_MAX = 4096;    // the whole file trimmed (a one-line token file — `$(cat "$VAULT_FILE{K}")` drops its newline) gets every spelling the masker knows
const ARMOR_RE = /^-{3,}\s*(?:BEGIN|END)\s[A-Z0-9 ]{1,60}-{3,}$/;   // a PEM armor line is the format's, not the file's (it is in every certificate the run may print)
// round 7 of the U1a cure (its sixth read): a TAIL under LINE_MIN joins the piece before it (≤ PIECE + LINE_MIN − 1 = 79 characters,
// the masker's own index rule) — cut off, it was no form, and the last 1–15 characters of a long line or of a big file's base64 /
// hex went out in the clear
const pieceEnds = (s) => { const out = []; for (let k = 0; k < s.length;) { const e = s.length - (k + PIECE) < LINE_MIN ? s.length : k + PIECE; out.push([k, e]); k = e; } return out; };
const piecesOf = (s, form) => {
  const out = pieceEnds(s).map(([k, e]) => s.slice(k, e)).filter((t) => t.length >= LINE_MIN).map((t) => [form, t]);
  const last = out[out.length - 1], u = form === 'base64' && last && last[1].endsWith('=') ? last[1].replace(/=+$/, '') : '';   // round 7b (the seventh read): the joined last piece unpadded too — an unpadded printing (`base64 | tr -d =`) holds no padded one
  if (u.length >= LINE_MIN) out.push([form, u]);
  return out;
};
/** → THE RUN MASKER'S INPUT for ONE file (design §3; adversarial read r1):
 *  · `text` — the bytes as the run's output decoder reads them (lenient UTF-8: a Latin-1 or UTF-16 file decodes to what `cat`
 *    shows through the same StringDecoder, its stray bytes as U+FFFD — never «no text, no lines»);
 *  · `whole` [[form, text]] — a file ≤ WHOLE_MAX: its raw text, base64 (± padding), hex (both cases); the masker's wrap view reads
 *    them folded at 64 / 76 / 60 columns;
 *  · `pieces` [[form, text]] — every file: its base64 and hex cut in 64-character pieces at the encoding's own boundaries (a
 *    folded `base64` / `xxd -p` of the whole file holds every piece), and a line longer than LINE_MAX by its own pieces — the
 *    window never grows with the file (r1: a 1 MB whole form held the run's output and rescanned it at every chunk);
 *  · `lines` [text] — every DISTINCT line (trimmed) of 16 bytes or more, PEM armor lines aside, up to LINES_MAX lines and
 *    LINE_BYTES_MAX bytes (a line past the budget is skipped, never the ones after it);
 *  · `trimmed` — the whole text trimmed, when it is TRIM_MAX bytes or less and 8 or more (a short token file — every spelling).
 *  THE BOUNDARY (said, not hidden): a shell that decodes a field of a structured file and prints it prints no line of the file. */
function maskSetOf(bytes) {
  const buf = asBuf(bytes) || Buffer.alloc(0);
  const text = buf.toString('utf8');
  const b64 = buf.toString('base64'), hex = buf.toString('hex');
  const whole = [];
  if (buf.length <= WHOLE_MAX) {
    if (text.length) whole.push(['raw', text]);
    whole.push(['base64', b64], ['base64', b64.replace(/=+$/, '')], ['hex', hex], ['hex', hex.toUpperCase()]);
  }
  const pieces = [...piecesOf(b64, 'base64'), ...piecesOf(hex, 'hex'), ...piecesOf(hex.toUpperCase(), 'hex')];
  const lines = [];
  const seen = new Set();
  let bytesIn = 0;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    const n = Buffer.byteLength(l, 'utf8');
    if (n < LINE_MIN || seen.has(l) || ARMOR_RE.test(l)) continue;
    seen.add(l);
    if (n > LINE_MAX) { pieces.push(...piecesOf(l, 'raw')); continue; }
    if (lines.length >= LINES_MAX || bytesIn + n > LINE_BYTES_MAX) continue;
    lines.push(l); bytesIn += n;
  }
  const tr = text.trim(), trBytes = Buffer.byteLength(tr, 'utf8');
  const dedup = (list) => { const out = [], have = new Set(); for (const [form, t] of list) if (t && !have.has(t)) { have.add(t); out.push([form, t]); } return out; };
  return { whole: dedup(whole), pieces: dedup(pieces), lines, trimmed: trBytes >= 8 && trBytes <= TRIM_MAX && !lines.includes(tr) ? tr : null };
}
/** A FILE AS VALUES OF THE ONE SCRUBBER (主开发 r4378, the cure's new shape; r4413 (B): U1a's own spelling of a file) — every text
 *  of maskSetOf once, as values the run's scan worker hands to createRunMasker with the run's other values
 *  (src/server/vault-run-scrub-worker.js). A small file's WHOLE text (≤ 2 KiB) and its trimmed whole (≤ 4 KiB, a token file) are
 *  spelled every way by the scrubber's own forms; its encoded pieces (base64, hex) and its lines enter AS THEY ARE (`asIs`: their
 *  own text their only form) — they ARE the file's encodings and its text. THE ONLY ROAD that sets `asIs` (r4413 (1), a census in
 *  test-vault-run). WHAT IT DOES NOT CATCH (r4413 (3)): a line of the file printed in ANOTHER encoding (a line's base64, its JSON
 *  escape) is not masked; the lines as they are, the file's own base64 and hex, and a small file whole in every spelling, are.
 *  Never a masker of its own. Each value is ≥ MIN_MASK_BYTES (a piece ≥ LINE_MIN, the trimmed whole ≥ 8). → [{ value, asIs }]. */
function runValuesOf(bytes) {
  const s = maskSetOf(bytes), out = [], have = new Set();
  const add = (x, asIs) => { if (!x || have.has(x) || Buffer.byteLength(x, 'utf8') < FILE_MIN) return; have.add(x); out.push({ value: x, asIs }); };
  for (const [form, x] of s.whole) add(x, form !== 'raw');   // the whole's raw text spelled every way; its base64 / hex as they are
  if (s.trimmed) add(s.trimmed, false);
  for (const [, x] of s.pieces) add(x, true);
  for (const x of s.lines) add(x, true);
  return out;
}
/** The name a run writes a FILE under, after `f<slot>-` (adversarial read r1: an uploader's `id_rsa (1)` or `my key.pem` broke an
 *  unquoted `ssh -i $VAULT_FILE{K}`, a `$` or `;` became shell text, a long CJK name passed 255 bytes): the shell-safe characters
 *  of its name ([A-Za-z0-9._-], every other run of characters one `_`), at most 80 bytes, its extension kept. → a name | 'file'. */
function diskNameOf(name) {
  const s = String(name == null ? '' : name);
  const dot = s.lastIndexOf('.');
  const ext = dot > 0 && s.length - dot <= 13 ? s.slice(dot).replace(/[^A-Za-z0-9.]+/g, '') : '';
  const stem = (dot > 0 && ext ? s.slice(0, dot) : s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._-]+|_+$/g, '');
  return (stem && /[A-Za-z0-9]/.test(stem) ? stem : 'file').slice(0, 80 - ext.length) + ext;
}
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
/** A file's bytes as they ride a request body (base64, strict — never the lenient decoder's guess) → { ok, bytes } | a refusal.
 *  `size` (when the sender says it) must be the decoded length: a body cut on the way is `bytes_bad`, never a shorter file. */
function wireBytesOf(b64, { size = null } = {}) {
  if (typeof b64 !== 'string' || !b64) return refuse('file_empty');
  if (b64.length > Math.ceil(FILE_MAX / 3) * 4 + 4) return refuse('file_too_large');
  if (b64.length % 4 !== 0 || !B64_RE.test(b64)) return refuse('bytes_bad');
  const bytes = Buffer.from(b64, 'base64');
  if (size != null && Number(size) !== bytes.length) { bytes.fill(0); return refuse('bytes_bad'); }
  return { ok: true, bytes };
}
/** The box's `file` facts as the engine keeps them → a frozen copy with only the named fields | null. */
function factsOf(f) {
  if (!f || typeof f !== 'object' || !ID_RE.test(String(f.id))) return null;
  return Object.freeze({ id: String(f.id), name: cleanName(f.name) || 'file', size: Number(f.size) || 0,
    kind: KINDS.includes(f.kind) ? f.kind : 'generic', encrypted: f.encrypted === true, lines: Number.isInteger(f.lines) && f.lines >= 0 ? f.lines : null });
}
/** The facts a reader outside the vault may see (the Vault window's row, `list`): no id (a path piece), no digest. */
const publicFactsOf = (f) => (f && typeof f === 'object' ? { name: cleanName(f.name) || 'file', size: Math.max(0, Math.floor(Number(f.size) || 0)), kind: KINDS.includes(f.kind) ? f.kind : 'generic', encrypted: f.encrypted === true,
  lines: Number.isInteger(f.lines) && f.lines >= 0 ? f.lines : null, forRun: runFitOf(f) } : null);   // 主开发 r4378 (b): the row says at once whether a run can carry it

module.exports = { FILE_MAX, NAME_MAX, LINES_MAX, LINE_BYTES_MAX, ID_RE, KEYFILE_RE, KEYFILE_PREFIX, FILE_DIR, FILE_SUFFIX, KINDS, WORDS, runValuesOf, RUN_FILE_BYTES_MAX, runFitOf, tooLargeForARunWords,
  cleanName, kindOf, encryptedOf, fileVerdict, maskSetOf, wireBytesOf, factsOf, publicFactsOf, diskNameOf };   // only what another file reads (test-architecture §78: no dead export)

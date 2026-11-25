'use strict';
/**
 * THE SCRUBBER — the value-based masker of a stored secret in every spelling a real producer prints (lane lg-vault-file,
 * 主开发 r1919 «THE COST»: every run loaded the whole run module into its scrubber worker — src/vault-run.js and its tree,
 * about 490 KB of source — for this one part of it). Moved out of src/vault-run.js WHOLE: the same functions, the same
 * text, nothing copied. src/vault-run.js requires it and exports its names as before (its header says what the scrubber
 * is: the forms, the views, one window per run, the floor, the scan's budget); the run door's scrubber worker
 * (src/server/vault-run-scrub-worker.js) requires it alone.
 *
 * PURE, and it requires nothing at load. ONE late read: a secret named by a string reference (`{ref: 'vault://…'}`, never the
 * run door's road — it hands each value with its label) has its placeholder from the run module's one reference parser,
 * required then (`parseRef` below). MIN_MASK_BYTES, placeholderOf and bytesOf moved here with it (the run module reads them
 * from here); WORDS holds the one sentence its build throws (entry_too_short_to_mask), which the run module's table names.
 */
const MIN_MASK_BYTES = 8;                        // a shorter value cannot be scrubbed without scrubbing ordinary text
const placeholderOf = (ref) => `[vault:${ref && ref.label ? ref.label : String(ref || '')}]`;
const bytesOf = (s) => { let n = 0; for (const ch of String(s)) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
const WORDS = Object.freeze({ entry_too_short_to_mask: `that value is shorter than ${MIN_MASK_BYTES} bytes and cannot be scrubbed from the output — it is never referenced` });
const parseRef = (s) => require('./vault-run.js').parseRef(s);   // the one late read (above): a string reference's label

// ── THE SCRUBBER ──
function utf8(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0), k = bytes.length - i;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (k > 1 ? B64[(n >> 6) & 63] : '=') + (k > 2 ? B64[n & 63] : '=');
  }
  return s;
}
const urlSafe = (s) => s.replace(/\+/g, '-').replace(/\//g, '_');
function base64Forms(bytes) {
  const full = b64(bytes), out = [];
  for (const f of [full, full.replace(/=+$/, '')]) out.push(['base64', f], ['base64', urlSafe(f)]);
  for (let k = 0; k < 3; k++) {   // inside a longer base64 run the value starts at byte k of a group: its OWN characters only
    const run = b64([...new Array(k).fill(0), ...bytes, 0, 0]);
    const core = run.slice(Math.ceil((8 * k) / 6), Math.floor((8 * (k + bytes.length)) / 6));
    out.push(['base64', core], ['base64', urlSafe(core)]);
  }
  return out;
}
const hex2 = (b, up) => { const h = (b < 16 ? '0' : '') + b.toString(16); return up ? h.toUpperCase() : h; };
function percentForms(bytes) {
  const ch = (b) => (b < 128 ? String.fromCharCode(b) : '');
  const unreserved = (b) => b < 128 && /[A-Za-z0-9\-_.~]/.test(ch(b));
  const keeps = [(b) => unreserved(b) || (b < 128 && "!'()*".includes(ch(b))), unreserved, (b) => unreserved(b) || b === 47, (b) => b < 128 && /[A-Za-z0-9*\-_.]/.test(ch(b)), () => false];   // encodeURIComponent · RFC 3986 · a path (Python quote) · a WHATWG form · every byte
  const out = [];
  for (const up of [true, false]) for (const keep of keeps) {
    const s = bytes.map((b) => (keep(b) ? ch(b) : '%' + hex2(b, up))).join('');
    out.push(['percent', s], ['percent', s.replace(/%20/g, '+')]);
  }
  return out;
}
const JSON_SHORT = Object.freeze({ 8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r' });
function jsonForms(value) {
  const out = [];
  for (const slash of [false, true]) for (const uni of [null, 'lower', 'upper']) for (const html of [false, true]) {
    const u = (n) => { const h = n.toString(16).padStart(4, '0'); return '\\u' + (uni === 'upper' ? h.toUpperCase() : h); };
    let s = '';
    for (const c of String(value)) {
      const p = c.codePointAt(0);
      if (c === '"') s += '\\"';
      else if (c === '\\') s += '\\\\';
      else if (c === '/' && slash) s += '\\/';
      else if (p < 0x20) s += JSON_SHORT[p] || u(p);
      else if (html && (c === '<' || c === '>' || c === '&')) s += u(p);
      else if (uni && p >= 0x7f) s += p > 0xffff ? u(0xd800 + ((p - 0x10000) >> 10)) + u(0xdc00 + ((p - 0x10000) & 0x3ff)) : u(p);
      else s += c;
    }
    out.push(['json', s]);
  }
  return out;
}
const hexForms = (bytes) => { const lo = bytes.map((b) => hex2(b, false)).join(''); return [['hex', lo], ['hex', lo.toUpperCase()]]; };
/** UTF-8 bytes → text the way a stream decoder reads them (the door's StringDecoder; WHATWG: each maximal ill-formed run
 *  is one U+FFFD) — how a child's UTF-16 output reaches the scrubber. */
function decodeUtf8(bytes) {
  let s = '', i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) { s += String.fromCharCode(b); i++; continue; }
    const need = b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : 0;
    if (!need) { s += '�'; i++; continue; }
    let cp = b & (need === 1 ? 0x1f : need === 2 ? 0x0f : 0x07), lo = b === 0xe0 ? 0xa0 : b === 0xf0 ? 0x90 : 0x80, hi = b === 0xed ? 0x9f : b === 0xf4 ? 0x8f : 0xbf, j = i + 1;
    for (; j <= i + need; j++) { const c = bytes[j]; if (c === undefined || c < lo || c > hi) break; cp = (cp << 6) | (c & 0x3f); lo = 0x80; hi = 0xbf; }
    if (j <= i + need) { s += '�'; i = j; continue; }
    s += String.fromCodePoint(cp); i = j;
  }
  return s;
}
/** UTF-16 little- and big-endian, as the door's UTF-8 decoder reads those bytes (an ASCII value: its characters with a NUL after / before each). */
function utf16Forms(v) {
  const le = [], be = [];
  for (let i = 0; i < v.length; i++) { const u = v.charCodeAt(i); le.push(u & 255, u >> 8); be.push(u >> 8, u & 255); }
  return [['utf16', decodeUtf8(le)], ['utf16', decodeUtf8(be)]];
}
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** base32 (RFC 4648 §6), padded and not, upper- and lower-case. */
function base32Forms(bytes) {
  let s = '', acc = 0, bits = 0;
  for (const b of bytes) { acc = ((acc << 8) | b) & 0xffff; bits += 8; while (bits >= 5) { s += B32[(acc >> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) s += B32[(acc << (5 - bits)) & 31];
  const padded = s + '='.repeat((8 - (s.length % 8)) % 8);
  return [padded, s, padded.toLowerCase(), s.toLowerCase()].map((t) => ['base32', t]);
}
/**
 * THE FORMS — THE ONE LIST of what the scrubber knows (lane vault-scrub-forms, the desk's q-043 verify M1). A form is here
 * because a REAL tool prints it by itself; `producer` names one. `spelled` forms are texts formsOf builds from the value;
 * `read` forms are VIEWS (below): the output read with one family of escapes undone, every spelled form looked for in what
 * the view reads, the ORIGINAL span masked, its escapes included. What is NOT here, and why, is the header's ③.
 */
const FORM_ROWS = Object.freeze([
  ['raw', 'spelled', 'anything that prints what it was given: curl -v (> Authorization: Bearer …), an error echoing its input, an env dump'],
  ['base64', 'spelled', 'an HTTP Basic header (curl -v), a Kubernetes Secret (kubectl get secret -o yaml), a token inside a JSON body'],
  ['percent', 'spelled', 'a URL: its query, its userinfo (curl -v, git remote -v), a form body'],
  ['json', 'spelled', 'any JSON output: kubectl -o json, gh api, a JSON log line'],
  ['hex', 'spelled', 'a byte dump in a debug log; oathtool -v (Hex secret:)'],
  ['utf16', 'spelled', 'PowerShell 5\'s > and Out-File, reg export (UTF-16LE); Java\'s writeChars (UTF-16BE)'],
  ['base32', 'spelled', 'oathtool -v (Base32 secret:), an otpauth:// URI\'s secret='],
  ['qp', 'read', 'a mail body in quoted-printable (a fetched .eml, an IMAP FETCH): =XX for a byte, a soft line break =\\r\\n anywhere in the value'],
  ['escape', 'read', 'a language\'s repr of a value with a non-ASCII byte: Python b\'…\\xc3\\xbc…\' and \'…\\u00fc…\', Node util.inspect, Rust {:?} (\\u{…}), git and bash $\'…\' (octal)'],
  ['entity', 'read', 'an HTML page or an XML file showing the value: a template\'s escaping (&amp; &quot; &#x27; &#61;), a .NET or Maven config'],
  ['ansi', 'read', 'a terminal with colours: grep --color, git diff --color-words, a test runner\'s coloured diff — SGR escapes between the characters'],
  ['wrap', 'read', 'a wrapped line: a base64 mail body or openssl base64 output at 64 / 76 columns'],
].map(([form, how, producer]) => Object.freeze({ form, how, producer })));
const FORMS = Object.freeze(FORM_ROWS.map((r) => r.form));
/** A value → its SPELLED forms [{ form, text }] (distinct texts, the raw first). */
function formsOf(value) {
  const v = String(value == null ? '' : value), bytes = utf8(v);
  const all = [['raw', v],
    ...base64Forms(bytes),
    ...percentForms(bytes), ...jsonForms(v), ...hexForms(bytes), ...utf16Forms(v), ...base32Forms(bytes)];
  const seen = new Set(), out = [];
  for (const [form, text] of all) if (text && !seen.has(text)) { seen.add(text); out.push(Object.freeze({ form, text })); }
  return out;
}
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAMED_ENTITY = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' });
const SIMPLE_ESCAPE = Object.freeze({ '\\': '\\', '\'': '\'', '"': '"', n: '\n', t: '\t', r: '\r' });
const textOf = (cp) => (cp >= 0 && cp <= 0x10ffff ? { text: String.fromCodePoint(cp) } : null);
/**
 * THE VIEWS — the `read` forms. A view's TOKEN is a short run that starts with one of its `triggers` (never found inside a
 * token) and stands for zero or more characters: `read(token)` → { byte } (joined with its neighbours as UTF-8, a byte that
 * is not UTF-8 read as Latin-1) | { text } ('' = dropped: a soft break, a colour) | null (not a token after all: read as it
 * is). `max` = the longest token, so a stream holds back an unfinished one; `pairs` = the trigger also escapes itself (`\\`),
 * so a run of triggers is read in pairs from its start and a stream holds back from the run's last pair boundary.
 */
const VIEWS = Object.freeze([
  { form: 'qp', triggers: '=', max: 3, re: /=(?:\r?\n|[0-9A-Fa-f]{2})/g, read: (t) => (t[1] === '\r' || t[1] === '\n' ? { text: '' } : { byte: parseInt(t.slice(1), 16) }) },
  { form: 'escape', triggers: '\\', max: 10, pairs: true, re: /\\(?:x[0-9A-Fa-f]{2}|[0-3][0-7]{2}|u\{[0-9A-Fa-f]{1,6}\}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[\\'"ntr])/g,
    read: (t) => (t[1] === 'x' ? { byte: parseInt(t.slice(2), 16) } : t[1] >= '0' && t[1] <= '3' ? { byte: parseInt(t.slice(1), 8) }
      : t[1] === 'u' && t[2] === '{' ? textOf(parseInt(t.slice(3, -1), 16)) : t[1] === 'u' ? { text: String.fromCharCode(parseInt(t.slice(2), 16)) }
        : t[1] === 'U' ? textOf(parseInt(t.slice(2), 16)) : { text: SIMPLE_ESCAPE[t[1]] }) },
  { form: 'entity', triggers: '&', max: 10, re: /&(?:#[0-9]{1,7};|#[xX][0-9A-Fa-f]{1,6};|amp;|lt;|gt;|quot;|apos;)/g,
    read: (t) => (t[1] !== '#' ? { text: NAMED_ENTITY[t.slice(1, -1)] } : textOf(t[2] === 'x' || t[2] === 'X' ? parseInt(t.slice(3, -1), 16) : parseInt(t.slice(2, -1), 10))) },
  { form: 'ansi', triggers: '\x1b', max: 35, re: /\x1b(?:\[[0-9;:?]{0,32}[mK]|[()][0-9A-Za-z])/g, read: () => ({ text: '' }) },
  { form: 'wrap', triggers: '\r\n', max: 1, re: /[\r\n]/g, read: () => ({ text: '' }) },
].map((v) => Object.freeze(v)));
const UTF8_NEED = (b) => (b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : 0);
/**
 * What view `vw` reads in buf[0, end) → null when no token is there (it reads what the plain text says), else { sk, at, to,
 * spans, end }: sk[i] stands for buf[at[i], to[i]); `spans` = [start, end) of every run a token-made character covers (a
 * stream never cuts inside one); `end` moves back over a trailing UTF-8 character still missing a byte (not `final`).
 */
/** THE SETTLE'S UNFINISHED PIECES (round wtlm3ig4w's MUST ONE): each view's token cut short — a proper prefix of what its `re`
 *  decodes; a finished one (or text that can never become one) is no end for the settle (the cut's road does not read this) */
const UNFINISHED_PIECE = Object.freeze({
  qp: (s) => /^=(?:[0-9A-Fa-f]|\r)?$/.test(s),
  escape: (s) => /^\\(?:x[0-9A-Fa-f]?|[0-3][0-7]?|u\{[0-9A-Fa-f]{0,6}|u[0-9A-Fa-f]{0,3}|U[0-9A-Fa-f]{0,7})?$/.test(s),
  entity: (s) => /^&(?:#[0-9]{0,7}|#[xX][0-9A-Fa-f]{0,6}|a|am|amp|l|lt|g|gt|q|qu|quo|quot|ap|apo|apos)?$/.test(s),
  ansi: (s) => /^\x1b(?:\[[0-9;:?]{0,32}|[()])?$/.test(s),
  wrap: () => false,
});
function readView(vw, buf, end, final) {
  let sk = '', i = 0, any = false, m;
  const at = [], to = [], spans = [], bytes = [];
  const lit = (a, b) => { for (let k = a; k < b; k++) { sk += buf[k]; at.push(k); to.push(k + 1); } };
  const put = (text, a, b) => { for (let k = 0; k < text.length; k++) { sk += text[k]; at.push(a); to.push(b); } if (b - a > 1) spans.push(a, b); };
  const flush = () => {
    for (let k = 0; k < bytes.length;) {
      const [b, s] = bytes[k], need = UTF8_NEED(b);
      let cp = b & (need === 1 ? 0x1f : need === 2 ? 0x0f : 0x07), j = k + 1;
      for (; need && j <= k + need && j < bytes.length; j++) { const c = bytes[j][0]; if (c < 0x80 || c > 0xbf) break; cp = (cp << 6) | (c & 0x3f); }
      const whole = need && j === k + need + 1 && cp >= [0, 0x80, 0x800, 0x10000][need] && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
      if (whole) { put(String.fromCodePoint(cp), s, bytes[j - 1][2]); k = j; } else { put(String.fromCharCode(b), s, bytes[k][2]); k++; }
    }
    bytes.length = 0;
  };
  vw.re.lastIndex = 0;
  while ((m = vw.re.exec(buf)) !== null) {
    const s = m.index, e = s + m[0].length;
    if (e > end) break;
    const r = vw.read(m[0]);
    if (!r) continue;
    any = true;
    if (s > i) { flush(); lit(i, s); }
    if (r.byte != null) bytes.push([r.byte, s, e]);
    else if (r.text) { flush(); put(r.text, s, e); }
    else if (e - s > 1) spans.push(s, e);   // dropped (a soft break, a colour) — bytes on either side still join: =C3=\r\n=BC is one ü
    i = e;
  }
  if (!any) return null;
  if (!final && i === end && bytes.length) {   // a character still missing a byte at the end waits for the next chunk
    let k = bytes.length - 1;
    while (k > 0 && bytes[k][0] >= 0x80 && bytes[k][0] <= 0xbf) k--;
    if (UTF8_NEED(bytes[k][0]) > bytes.length - 1 - k) { end = bytes[k][1]; bytes.length = k; i = end; }
  }
  flush(); lit(i, end);
  return { sk, at, to, spans, end };
}
/**
 * A RUN's scrubber — ONE per run, fed by every stream of it (the desk's «one window per run»). `secrets` = [{ ref | label,
 * value }] — `ref` a parsed reference (its placeholder) or `label` the `<store>/<row>/<field>`. → { push(stream, chunk) →
 * { <stream>: text }, end() → { <stream>: text }, hits, bytes (UTF-8 bytes of the spans it replaced — the audit's count),
 * byForm, window }.
 * WHAT IT READS: each stream's own text, and — while more than one stream has text kept back — the run's text in ARRIVAL
 * order, so a value split between stdout and stderr is seen whole AND a value inside one stream is never lost to the other's
 * chunks between its characters. A find masks its span on every stream it covers (each gets the placeholder).
 * WHAT IT KEEPS BACK: per stream, the last `window` (longest spelled form − 1) characters as every view reads them, a token
 * not finished yet, and the run's last `window` characters in arrival order; a find is handed on whole or kept back whole
 * (on every stream it covers) — an occurrence that starts before the kept text is whole in the buffer, one that starts
 * inside it waits for the next chunk (or `end`). One stream: chunked or whole, the output is the same (test-vault-run-model).
 * Hand it text from a streaming decoder (StringDecoder / TextDecoder { stream: true }) — never bytes cut mid-character.
 * A value under MIN_MASK_BYTES throws `entry_too_short_to_mask` (runVerdict refused it already).
 */
/**
 * THE COMPILED FORMS (lane vault-masker-once — the owner's hub 2026-11-11: formsOf / percentForms / jsonForms / createRunMasker
 * held over half its main thread, because the output belt rebuilt every form of every secret for EVERY text it masked): every
 * spelling of every value (`formsOf`) → its placeholder, the ONE alternation over them (longest first) and the window — built
 * once from `secrets` and shared READ-ONLY by every masker made from it. A masker keeps its own stream state (`held`, the
 * counts): nothing carries from one text to the next. `secrets` as createRunMasker takes them; a value under MIN_MASK_BYTES
 * throws `entry_too_short_to_mask`. → a frozen { table, texts, re, W, size } (`size` = the distinct spelled forms).
 */
const COMPILED = Symbol('vault-run.compiledForms');
/** A 64-character window's hash (int32, mod 2^32): Σ c_i · HEAD_B^(63 − i) — rolled one character at a time by the cut's search */
const HEAD_B = 0x01000193, HEAD_P = (() => { let p = 1; for (let i = 0; i < 63; i++) p = Math.imul(p, HEAD_B); return p; })();
const headHash = (s, at) => { let h = 0; for (let i = 0; i < 64; i++) h = (Math.imul(h, HEAD_B) + s.charCodeAt(at + i)) | 0; return h; };
function compileForms(secrets) {
  const table = new Map();
  let vi = 0;   // r858: each value's own index (`v`) — two values may share a placeholder (a web login's passwords): the overlap rule tells them apart by it
  for (const s of Array.isArray(secrets) ? secrets : []) {
    const v = String(s && s.value != null ? s.value : '');
    if (bytesOf(v) < MIN_MASK_BYTES) { const e = new Error(WORDS.entry_too_short_to_mask); e.code = 'entry_too_short_to_mask'; throw e; }
    const ph = placeholderOf(s.ref && typeof s.ref === 'object' ? s.ref : s.label != null ? { label: s.label } : parseRef(String(s.ref)) || String(s.ref));
    vi++;
    for (const f of (s.asIs === true ? [{ form: 'raw', text: v }] : formsOf(v))) if (!table.has(f.text)) table.set(f.text, { ph, form: f.form, v: vi });   // 主开发 r4413 (B): a value that IS its own spelling — a FILE's encoded piece or line (src/vault-file.js runValuesOf, the ONLY road that sets `asIs`) — enters as it is; every other value is spelled every way
  }
  const texts = [...table.keys()].sort((a, b) => b.length - a.length);
  const re = texts.length ? new RegExp(texts.map(reEscape).join('|'), 'g') : null;
  const maxLen = texts.length ? texts[0].length : 1;
  const W = maxLen - 1;
  // THE REGEX HOLDS NO LONG LITERAL (the budget's second read, G1 — r1068): a long literal is compared as deep as the text follows
  // it, from whichever end the engine likes, and no count can see inside one exec. The run's scan asks a regex of HEADS — each
  // form's first SCRUB_HEAD characters — and a head that begins a longer form is VERIFIED by a counted compare: at a position the
  // longest form there is still the find (every key that matches there is a prefix of the longest key that does)
  const { keys, hre, longOf, shortIn } = headsOf(texts);   // ONE implementation (主开发 r1915 (a)): the browser dialogs' text scrubber builds its heads with the same function
  // THE CUT'S PREFIX SEARCH (主开发 r1216, the follow's item 1): the heads sorted by code unit (a suffix of a head's length or less is
  // a head's prefix where a binary search lands), and the LONG forms' heads by their rolling hash (a longer suffix starts with one;
  // the follow's read: a regex of every long head was work per alternative at every position, which no count saw)
  const sorted = [...keys].sort(), lhash = new Map();
  for (const k of longOf.keys()) { const h = headHash(k, 0); let l = lhash.get(h); if (!l) lhash.set(h, l = []); l.push(k); }
  return Object.freeze({ [COMPILED]: true, table, texts, re, W, size: texts.length, keys, hre, longOf, shortIn, sorted, lhash });
}
/** THE HEADS (the budget's second read, G1; ONE implementation since 主开发 r1915 (a) — the run's scan and the browser dialogs'
 *  text scrubber both call it): each spelled form's first SCRUB_HEAD characters, longest first. → { keys, hre (the regex of the
 *  heads), longOf (a 64-character head → the long forms it begins), shortIn (a head → the shorter form it is or begins with) } */
function headsOf(texts) {
  const HEAD = SCRUB_HEAD, longOf = new Map(), shortIn = new Map();
  for (const t of texts) if (t.length > HEAD) { const k = t.slice(0, HEAD); let l = longOf.get(k); if (!l) longOf.set(k, l = []); l.push(t); }
  const keys = [...new Set(texts.map((t) => (t.length > HEAD ? t.slice(0, HEAD) : t)))].sort((a, b) => b.length - a.length);
  const shorts = texts.filter((t) => t.length <= HEAD);
  for (const k of keys) { const s = shorts.find((t) => k.startsWith(t)); if (s) shortIn.set(k, s); }
  const hre = keys.length ? new RegExp(keys.map(reEscape).join('|'), 'g') : null;
  return { keys, hre, longOf, shortIn };
}
/** THE COUNTED VERIFY (ONE implementation, r1915 (a)): the head a regex of heads matched in `sk` at `m.index` → the longest spelled
 *  form there (a long one VERIFIED by a compare `spend` counts), or null (no form is there: ask at the next position) */
const resolveHead = (sk, m, longOf, shortIn, spend) => { const k = m[0], longs = longOf.get(k); if (longs) for (const t of longs) { spend(t.length); if (sk.startsWith(t, m.index)) return t; } return shortIn.has(k) ? shortIn.get(k) : null; };
/** Is `x` a compiled set (compileForms), not a secrets list? */
const isCompiledForms = (x) => !!(x && x[COMPILED] === true);
/** THE SCAN'S BUDGET (主开发 r1068 — the law: THE SCAN'S WORK A PUSH IS BOUNDED BY CONSTRUCTION, WHATEVER THE INPUT): every loop
 *  of a turn (a push, or the end) counts its steps — a character a read reads, a regex call, a group or a range the cuts visit;
 *  past SCRUB_STEPS_PUSH in one turn or SCRUB_STEPS_RUN in the run, the run FAILS CLOSED: a sticky mark, every stream's held text
 *  masked whole under the cut's placeholder, these words said once by name, and nothing handed on after. */
const SCRUB_STEPS_PUSH = 1 << 24, SCRUB_STEPS_RUN = 1 << 28, SCRUB_STEPS_A_CHAR = 256, SCRUB_HEAD = 64;   // THE FIGURES BY A MEASURED RULE (主开发 r1216): a turn's — the smallest power of two at least four times the longest turn of an ORDINARY run at the door's largest set (256 values, the runnable list's cap, each a realistic length; a 2 MiB log), never over 2^24: that turn read 8.59 M steps, so the rule gives 2^26 and the ceiling binds (the margin 1.95×, said). The run's: 16 × the turn's (the proportion), and SCRUB_STEPS_A_CHAR a character it read — 256, the TIGHTER of the follow's two (主开发 r1505: while the scan runs on the hub's loop the run's figure must not widen what the loop may be held for): 2^28 + 256 × the 2.03 M characters a 2 MiB run read = 0.79 G, 1.37× the costliest ordinary run at the largest set (575 M steps in 4 KiB reads; the rule's own four times would be 1 024); a job's log has no bound, so its masker's figure grows with what it read (the second read, G4). SCRUB_HEAD: the longest literal the regex holds
const TEXT_STEPS_BASE = 1 << 20, TEXT_STEPS_A_CHAR = 64;   // the text budget's figures (主开发 r1216 / r1915): a call of the browser dialogs' text scrubber is ONE counted turn, its figure LINEAR in the text (a screenshot's megabytes of base64 are ordinary): 2^20 + 64 a character — what fails closed is work that grows faster than the text
const SCRUB_OVER_WORDS = '\n[vault: this stretch of the output is withheld — scrubbing it passed its work bound (scrub_work_bound)]\n';   // 主开发 r1216: true for each road — the run door hands on nothing after these words (its run's output ends here; the child runs on, what it prints is counted as withheld), a job's log resumes at its next quiet (the wrapper starts a fresh masker there, kb-design-lessons)
/** THE CUTS SETTLED IN ONE SWEEP (主开发 r1068, the readers' cure: two fixpoints walked a chain of overlapping groups back one group
 *  a pass — groups² a turn). `lists` = each group's ranges [[stream, a, b], …]; `cut` (stream → offset) falls to the greatest cuts
 *  under it that split no group: a group not wholly before the cuts moves every cut it starts before back to its start. A cut only
 *  falls, so a group is moved at most once and looked at once a stream it covers (its ranges sorted by their end, one pointer a
 *  stream): about N log N. The answer is the fixpoint's — the greatest fixed point under the cuts, whatever the order of the moves
 *  (each move is forced at the cuts it is made at, and the cuts only fall). `spend(n)` counts the steps. */
/** THE COMPARES A CHARACTER CAN COST (the budget's read, F1): the regex compares an alternative at a position as deep as the text
 *  follows it, and only a text that REPEATS an alternative's repeating head can drive that thousands deep at every position (a value
 *  of 8 191 «A» and a «B», printed as a run of «A»). Once a compiled set: each alternative's longest head that repeats itself three
 *  times or more (a KMP prefix function), its period d and length h. A look then charges, beyond its characters, each run of the TEXT
 *  with period d whose pattern is that head's (a rotation): its length × min(h, its length) — what the regex can compare there. A
 *  head of period over 64 is charged flat (h / d a character: few, as such a head is long). Random values charge nothing more. */
const HEADS = new WeakMap();
function repeatingHeads(texts) {
  const byD = new Map();
  let flat = 0;
  for (const t of texts) {
    const n = Math.min(t.length, 1 << 16), pi = new Int32Array(n);
    let bh = 0, bd = 0;
    for (let i = 1, k = 0; i < n; i++) { while (k > 0 && t[i] !== t[k]) k = pi[k - 1]; if (t[i] === t[k]) k++; pi[i] = k; const h = i + 1, d = h - k; if (h >= 3 * d && h > bh) { bh = h; bd = d; } }
    if (!bh) continue;
    if (bd > 64) { flat += Math.ceil(bh / bd); continue; }
    let l = byD.get(bd); if (!l) byD.set(bd, l = []); l.push({ pp: t.slice(0, bd).repeat(2), h: bh });
  }
  return { byD: [...byD], flat };
}
/** → the compares a look over `sk` can cost the regex, at most (its characters, and the runs that repeat a repeating head) */
function deepCost(sk, heads) {
  let c = sk.length * (1 + heads.flat + heads.byD.length);
  for (const [d, hs] of heads.byD) {
    let s = -1;
    const close = (e) => { const r = e - s; if (r >= 2 * d) { const q = sk.slice(s, s + d); let h = 0; c += hs.length * (2 * d + 1); for (const x of hs) if (x.pp.includes(q)) h += x.h; if (h) c += r * Math.min(h, r); } };   // its own work counts too (the second read, G6)
    for (let i = d; i < sk.length; i++) { if (sk.charCodeAt(i) === sk.charCodeAt(i - d)) { if (s < 0) s = i - d; } else if (s >= 0) { close(i); s = -1; } }
    if (s >= 0) close(sk.length);
  }
  return c;
}
function settleCuts(lists, cut, spend = () => {}) {
  const by = new Map();
  let n = 0;
  for (const rs of lists) for (const r of rs) { let l = by.get(r[0]); if (!l) by.set(r[0], l = []); l.push([r[2], rs]); n++; }
  spend(n * (2 + Math.ceil(Math.log2(n + 2))));
  for (const l of by.values()) l.sort((x, y) => y[0] - x[0]);
  const at = new Map(), todo = [], moved = new Set();
  const reach = (k) => { const l = by.get(k); if (!l) return; let i = at.get(k) || 0; const c = cut.get(k); while (i < l.length && l[i][0] > c) todo.push(l[i++][1]); at.set(k, i); };   // every group whose range in k now ends past k's cut: it is not wholly before the cuts
  for (const k of by.keys()) reach(k);
  while (todo.length) {
    const rs = todo.pop();
    spend(rs.length);
    if (moved.has(rs)) continue;
    if (!rs.some(([k, a]) => a < cut.get(k))) continue;   // it starts at or past every cut it covers: it is kept back whole already (and stays so — the cuts only fall)
    moved.add(rs);
    for (const [k, a] of rs) if (a < cut.get(k)) { cut.set(k, a); reach(k); }
  }
  return cut;
}
function createRunMasker(secrets, streams = ['out', 'err'], opts = {}) {
  const C = isCompiledForms(secrets) ? secrets : compileForms(secrets);   // lane vault-masker-once: a compiled set is used as it is (shared, read-only)
  const { table, texts, re, W } = C;
  const names = [...streams];
  let held = [];   // [[stream, text]] in arrival order — what the run has not handed on yet
  const st = { hits: 0, bytes: 0, byForm: {}, scanned: 0 };   // scanned: the characters every scan read (the suites' cost count)
  Object.assign(st, { steps: 0, runSteps: 0, maxSteps: 0, over: false, withheld: 0, inTurn: false, fresh: 0, read: 0, cutSteps: 0 });   // THE SCAN'S BUDGET: this turn's steps, the run's, the longest turn, the sticky mark, what was withheld after it
  const limit = { push: (opts.steps && opts.steps.push) || SCRUB_STEPS_PUSH, run: (opts.steps && opts.steps.run) || SCRUB_STEPS_RUN, aChar: (opts.steps && opts.steps.aChar) || SCRUB_STEPS_A_CHAR };   // THE SCAN'S BUDGET: the figures (a suite may plant smaller ones)
  if (!HEADS.has(C)) HEADS.set(C, repeatingHeads(C.keys || texts));   // THE SCAN'S BUDGET: the heads the regex holds (≤ SCRUB_HEAD characters each)
  const hre = C.hre || re, longOf = C.longOf || new Map(), shortIn = C.shortIn || new Map(), sorted = C.sorted, lhash = C.lhash;   // THE SCAN'S BUDGET
  const resolve = (sk, m) => resolveHead(sk, m, longOf, shortIn, spend);   // THE SCAN'S BUDGET (one implementation, r1915 (a): resolveHead): a head → the longest form at that place, a long one VERIFIED by a counted compare (null: none is there)
  const heads = HEADS.get(C), charge = 1 + heads.flat + heads.byD.reduce((n, [, hs]) => n + hs.reduce((m, x) => m + x.h, 0), 0);   // THE SCAN'S BUDGET: the repeating heads (the read's F1); `charge` = the most a character can cost, for the suites' figures
  const OVER = Symbol('vault-run.scrub-over');   // THE SCAN'S BUDGET
  const spend = (n) => { st.steps += n; st.runSteps += n; if (st.steps > limit.push || st.runSteps > limit.run + limit.aChar * st.read) throw OVER; };   // THE SCAN'S BUDGET: every loop of a turn counts here — past a figure the turn stops where it is
  const none = () => { const o = {}; for (const k of names) o[k] = ''; return o; };   // THE SCAN'S BUDGET
  const overrun = () => { st.over = true; const out = none(), own = new Map(); for (const [k, x] of held) own.set(k, (own.get(k) || '') + x); for (const [k, x] of own) if (x) { out[k] += CUT_PH; st.hits++; st.bytes += bytesOf(x); } out[names.includes('err') ? 'err' : names[0]] += SCRUB_OVER_WORDS; held = []; return out; };   // THE SCAN'S BUDGET: FAILS CLOSED — everything held under the cut's placeholder, the words once, by name
  const turn = (fn) => { st.inTurn = true; st.steps = 0; const keep = [st.hits, st.bytes, { ...st.byForm }], heldAt = held; try { return fn(); } catch (e) { if (e !== OVER) throw e; [st.hits, st.bytes, st.byForm] = keep; held = heldAt; return overrun(); } finally { st.inTurn = false; if (st.steps > st.maxSteps) st.maxSteps = st.steps; } };   // THE SCAN'S BUDGET: one push, or the end, is ONE counted turn
  /** ONE text read plainly and through every view → { safe (what is decided), finds [{ s, e, ph, form }], spans [[s, e]] }.
   *  `at` (the arrival order's): each character's index in its own stream's held text — a find's PLACE, the same in every read. */
  function scan(buf, final, at) {
    const L = buf.length;
    st.scanned += L;
    spend(L);   // THE SCAN'S BUDGET: the plain read
    let safe = final ? L : L - W;
    const views = [];
    for (const vw of VIEWS) {
      let end = L;
      if (!final) for (let k = Math.max(0, L - vw.max + 1); k < L; k++) if (vw.triggers.includes(buf[k])) {
        if (vw.pairs) { let j = k; while (j > 0 && buf[j - 1] === buf[k]) j--; k = j + 2 * Math.floor((k - j) / 2); }   // the last pair boundary of the run (a run is read in pairs from its start)
        end = k; break;
      }
      spend(end);   // THE SCAN'S BUDGET: a view reads the text
      const r = readView(vw, buf, end, final);
      if (!final) { const len = r ? r.sk.length : end, ss = len - W; safe = Math.min(safe, ss <= 0 ? 0 : !r ? ss : ss < len ? r.at[ss] : r.end); }
      if (r) views.push([vw, r]);
    }
    safe = Math.max(0, safe);
    const finds = [], spans = [];
    const look = (sk, r, form) => {
      const re = hre;   // THE SCAN'S BUDGET: the regex of heads (≤ SCRUB_HEAD characters a literal: the second read's G1)
      re.lastIndex = 0;
      let m;
      spend(deepCost(sk, heads));   // THE SCAN'S BUDGET: the regex reads the text once — and as deep as a run of it repeats a repeating head (the read's F1)
      const vEnd = new Map();   // THE SCRUBBER'S OVERLAP (r858): each value's last find's end, in the read's own text
      let gStart = -1, gEnd = -1, gAt = -1;   // THE SCRUBBER'S OVERLAP: the current group of overlapping finds (its first start and its union's end in the read's own text, its last find's place)
      const G = 4 * (W + 1);   // THE SCRUBBER'S OVERLAP: the grid a long group breaks on
      while ((m = re.exec(sk)) !== null) {
        spend(1);   // THE SCAN'S BUDGET: a regex call (asked again inside a match, every position may be one)
        const s = r ? r.at[m.index] : m.index;
        if (s >= safe) break;
        { const full = resolve(sk, m); if (full === null) { re.lastIndex = m.index + 1; continue; } m[0] = full; }   // THE SCAN'S BUDGET: the head the regex matched → the longest form there (no form there: ask at the next position)
        const t = table.get(m[0]);
        const p = at ? at[s] : s;   // THE SCRUBBER'S OVERLAP: the find's place in its stream's held text — every read of one step (plain, each view, the arrival order) gives one occurrence the same place
        if (!final && m.index < gEnd && gEnd - gStart > 2 * (W + 1) && Math.floor(p / G) > Math.floor(gAt / G)) { finds.push({ s, e: r ? r.to[m.index + m[0].length - 1] : m.index + m[0].length, ph: t.ph, form: form || t.form }); vEnd.set(t.v, m.index + m[0].length); re.lastIndex = Math.max(gEnd, m.index + m[0].length); gStart = gEnd = gAt = -1; continue; }   // THE SCRUBBER'S OVERLAP: while text is held back (never in a final read, which holds nothing: read 5), a group past 2 × (W + 1) — only values that tile a repeating text make one — BREAKS at the first find past each multiple of 4 × (W + 1) of the place: that find is taken and jumped past, as the release jumped past every match. The place is the same in every read, so the reads past 2 × (W + 1) that see that occurrence break at it, and the finds step joins across them stop there too (read 4: a break at each read's own length was bridged by another read after a line end or a stderr line, and one that skipped its find left that find's tail in the clear). Lines shorter than 2 × (W + 1) still bridge (read 5; said in the engineering log)
        if ((vEnd.get(t.v) || -1) > m.index) { re.lastIndex = m.index + 1; continue; }   // THE SCRUBBER'S OVERLAP: the SAME value inside its own last find (`0000…`, a value overlapping itself) is no new find — so it tiles as the release did (one placeholder, one hit, a tile) — yet the next position is still asked for another value
        finds.push({ s, e: r ? r.to[m.index + m[0].length - 1] : m.index + m[0].length, ph: t.ph, form: form || t.form });
        vEnd.set(t.v, m.index + m[0].length); if (m.index >= gEnd) gStart = m.index; gEnd = Math.max(gEnd, m.index + m[0].length); gAt = p; re.lastIndex = m.index + 1;   // THE SCRUBBER'S OVERLAP (lane lg-vault-file, r858): asked again INSIDE the match — ANOTHER value that starts inside it is found (the masks' union is one placeholder); the leftmost match had jumped past it and left its tail in the clear
      }
    };
    look(buf, null, null);
    for (const [vw, r] of views) { look(r.sk, r, vw.form); for (let k = 0; k < r.spans.length; k += 2) spans.push([r.spans[k], r.spans[k + 1]]); }
    return { safe, finds, spans };
  }
  /** THE ARRIVAL ORDER of held entries (shared by `step` and the cut — lane lg-vault-file, r858): `all` = their texts joined;
   *  rangesOf(a, b) → each stream's [k, a, b] in that stream's own kept text. */
  function arrivalOf(list) {
    const all = list.map((x) => x[1]).join(''), streamAt = [], idxAt = [], seen = new Map();
    spend(2 * all.length);   // THE SCAN'S BUDGET: the arrival order joined and placed
    for (const [k, x] of list) for (let j = 0; j < x.length; j++) { const i = seen.get(k) || 0; streamAt.push(k); idxAt.push(i); seen.set(k, i + 1); }
    const rangesOf = (a, b) => { spend(b - a); const m = new Map(); for (let i = a; i < b; i++) { const k = streamAt[i], x = m.get(k); if (x) x[2] = idxAt[i] + 1; else m.set(k, [k, idxAt[i], idxAt[i] + 1]); } return [...m.values()]; };
    return { all, streamAt, idxAt, rangesOf };
  }
  function step(final) {
    if (!st.inTurn) return turn(() => step(final));   // THE SCAN'S BUDGET
    const out = {}; for (const k of names) out[k] = '';
    if (!held.length) return out;
    const own = new Map();   // stream → its kept-back text
    for (const [k, x] of held) own.set(k, (own.get(k) || '') + x);
    if (!re) { for (const [k, x] of own) out[k] += x; held = []; return out; }
    // GROUPS: a find (or one token / joined character a view read) → its range on each stream it covers, [a, b) in that
    // stream's own text — handed on whole, or kept back whole on every one of them
    const groups = [], cut = new Map();
    for (const [k, x] of own) {
      const sc = scan(x, final);
      cut.set(k, sc.safe);
      for (const f of sc.finds) groups.push({ r: [[k, f.s, f.e]], ph: f.ph, form: f.form });
      for (const [a, b] of sc.spans) groups.push({ r: [[k, a, b]], tok: true });
    }
    if (own.size > 1) {   // the run's text in arrival order: a value split between the pipes
      const { all, streamAt, idxAt, rangesOf } = arrivalOf(held);
      const sc = scan(all, final, idxAt);
      if (!final) { const n = new Map(); for (let i = 0; i < sc.safe; i++) n.set(streamAt[i], (n.get(streamAt[i]) || 0) + 1); for (const [k] of own) cut.set(k, Math.min(cut.get(k), n.get(k) || 0)); }
      for (const f of sc.finds) groups.push({ r: rangesOf(f.s, f.e), ph: f.ph, form: f.form });
      for (const [a, b] of sc.spans) groups.push({ r: rangesOf(a, b), tok: true });
    }
    if (!final) settleCuts(groups.map((g) => g.r), cut, spend);   // THE ONE SWEEP (主开发 r1068): never cut inside a group — one not wholly before the cuts is kept back whole; the cuts settled in one sweep (was a fixpoint that walked a chain of groups back one a pass)
    spend(groups.length * (names.length + 2));   // THE SCAN'S BUDGET: the masks, a stream at a time
    for (const [k, x] of own) {
      const c = cut.get(k);
      const masks = groups.filter((g) => !g.tok && g.r.every(([j, , b]) => b <= cut.get(j))).flatMap((g) => g.r.filter(([j]) => j === k).map(([, a, b]) => ({ a, b, ph: g.ph, form: g.form })));
      masks.sort((p, q) => p.a - q.a || q.b - p.b);
      spend(masks.length * (2 + Math.ceil(Math.log2(masks.length + 2))));   // THE SCAN'S BUDGET: this stream's masks, sorted and walked
      let i = 0, last = null;
      for (const m of masks) {
        if (last && m.a < last.b) { if (m.b > last.b) { st.bytes += bytesOf(x.slice(last.b, m.b)); last.b = m.b; i = m.b; } continue; }   // overlapping finds: one placeholder
        out[k] += x.slice(i, m.a) + m.ph;
        st.hits++; st.bytes += bytesOf(x.slice(m.a, m.b)); st.byForm[m.form] = (st.byForm[m.form] || 0) + 1;
        last = { b: m.b }; i = m.b;
      }
      out[k] += x.slice(i, c);
    }
    const used = new Map(), next = [];
    for (const [k, x] of held) {
      const u = used.get(k) || 0, keep = x.slice(Math.max(0, cut.get(k) - u));
      used.set(k, u + x.length);
      if (keep) { const p = next[next.length - 1]; if (p && p[0] === k) p[1] += keep; else next.push([k, keep]); }
    }
    held = next;
    return out;
  }
  // round 21/23 (fb-93219e801a, «never drop a byte»): on a CUT (the 2 MiB bound / a timeout / a lock / the caller gone) the held tail
  // was DROPPED for good — a value begun near the end might be only half there, and flushed raw its half would leak. Now the CERTAIN
  // prefix is flushed with step(true) (every COMPLETE value masked), and ONLY the trailing run that could be a HALF value is replaced
  // with ONE placeholder: cutTailStart finds the earliest offset a value could be beginning and running off the end — a raw form half
  // present (base64/hex/percent/json/utf16/the raw value itself), a VIEW-decoded value half present (a complete-token decode whose tail
  // is a value prefix), or a trailing INCOMPLETE view token (a `&`/`\`/`=`/ESC run that may not have closed). A tail that is none of
  // these is flushed CLEAN and counts NO hit (round 23: the old code replaced the WHOLE held window — up to W, unbounded over blank
  // lines / colour codes — and counted a scrubbed hit where no value was). A normal end has no partial, so `cut` leaves it alone.
  const CUT_PH = placeholderOf({ label: '\u2026' });   // the cut tail's placeholder «[vault:\u2026]» — the uncertain trailing window, not any one value
  function cutTailStart(buf, opt = null) {
    const unfinishedOnly = !!(opt && opt.unfinished);   // the SETTLE's road only (round wtlm3ig4w's MUST ONE): a view token counts as an end only while it is UNFINISHED — the cut's road unchanged
    const L = buf.length;
    if (!L) return L;
    const s0 = st.steps; spend(2 * L * (1 + VIEWS.length));   // THE SCAN'S BUDGET: the cut's reads — the text through every view, the broken characters' walk
    // THE CUT'S PREFIX SEARCH, COUNTED (主开发 r1216 — the follow's item 1: each candidate suffix was compared against every FULL form
    // while the count charged by the heads). The earliest offset q in the last W characters before n whose suffix up to n is a NON-EMPTY
    // proper prefix of some spelled form — the release's walk, the same answer, its work counted as it is done:
    //  - a suffix LONGER than a head (SCRUB_HEAD characters) can only begin a long form whose head starts at q: each 64-character
    //    window is looked up by its rolling hash among the long heads (a few steps a position, the head compared on a hit — no regex:
    //    an alternation of every long head is work per alternative at every position, which no count sees), and each form under a
    //    found head is VERIFIED by a compare counted character by character;
    //  - a suffix of a head's length or less begins a form iff it begins a HEAD: a binary search of the sorted heads (each of its
    //    compares charged by the suffix's length); a suffix that IS a long form's head begins that form.
    // Before a BROKEN character (`broken`), only a prefix whose next character is not ASCII counts — the character the cut broke was the
    // value's own (read 5: a one-character head, NUL or `%` or a hex digit, before a binary tail's U+FFFD counted a hit); the heads that
    // go on past a suffix sort by that character, so the search lands at s + U+0080. A suffix of only U+FFFD is never asked: a broken
    // character is no value's character (the run walked once — the second read, G3)
    const lowerBound = (s) => { let lo = 0, hi = sorted.length; spend((Math.ceil(Math.log2(hi + 1)) + 2) * (s.length + 2)); while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < s) lo = mid + 1; else hi = mid; } return lo; };
    const headPrefix = (s, broken) => {
      const j = lowerBound(s + (broken ? '\x80' : '\0'));
      spend(s.length + 1);
      if (j < sorted.length && sorted[j].startsWith(s)) return true;   // a head that goes on past s (when broken: on with a character ≥ U+0080)
      if (s.length < SCRUB_HEAD) return false;
      const longs = longOf.get(s);
      spend(SCRUB_HEAD + (longs ? longs.length : 0));
      return !!longs && (!broken || longs.some((t) => t.charCodeAt(SCRUB_HEAD) >= 0x80));   // s is a long form's whole head: the form goes on
    };
    const prefixStart = (str, n = str.length, broken = false) => {
      let f = n; while (f > 0 && str.charCodeAt(f - 1) === 0xFFFD) f--;
      const q0 = Math.max(0, n - W), qz = Math.min(n, f), qh = Math.min(qz, n - SCRUB_HEAD);   // [q0, qh): the suffixes longer than a head
      spend(n - f + 1);
      if (lhash.size && q0 < qh) {   // THE LONG ROAD: every 64-character window from q0 by its rolling hash — a few steps a position, and no regex
        let h = headHash(str, q0);
        spend(SCRUB_HEAD + 4 * (qh - q0));   // the first window's hash, then each position's roll and look-up
        for (let q = q0; q < qh; q++) {
          if (q > q0) h = (Math.imul((h - Math.imul(str.charCodeAt(q - 1), HEAD_P)) | 0, HEAD_B) + str.charCodeAt(q + SCRUB_HEAD - 1)) | 0;
          const ks = lhash.get(h);
          if (!ks) continue;
          const len = n - q;
          for (const k of ks) {
            spend(SCRUB_HEAD + 1);
            if (!str.startsWith(k, q)) continue;   // the head itself, compared (a hash is a hint)
            for (const t of longOf.get(k)) {
              spend(1);
              if (t.length <= len) continue;
              let j = SCRUB_HEAD;
              while (j < len && t.charCodeAt(j) === str.charCodeAt(q + j)) j++;
              spend(j - SCRUB_HEAD + 1);   // the verify, counted as it compares
              if (j === len && (!broken || t.charCodeAt(len) >= 0x80)) return q;
            }
          }
        }
      }
      for (let q = Math.max(q0, n - SCRUB_HEAD); q < qz; q++) { spend(n - q + 1); if (headPrefix(str.slice(q, n), broken)) return q; }
      return n;
    };
    // THE ENDS a half value may run off (r858, the scrubber's reads): the text's own end; the start of a trailing UNFINISHED view token
    // (its first trigger within the last vw.max − 1 characters — a colour code, a `=`, a `\x` cut short: its decode is unknown, so it is
    // uncertain from there); and the start of a trailing run of U+FFFD (the 2 MiB bound counts BYTES: a character cut there is decoded
    // as U+FFFD) — the text BEFORE such an end may end with a value's head, which the old reading (to the very end) never saw
    let start = L;
    const ends = new Set([L]);
    for (const vw of VIEWS) for (let q = Math.max(0, L - vw.max + 1); q < L; q++) if (vw.triggers.includes(buf[q])) { if (unfinishedOnly && !unfinishedPiece(vw.form, buf.slice(q))) continue; if (q < start) start = q; ends.add(q); break; }
    let fffd = -1;
    { let q = L; while (q > 0 && buf[q - 1] === '\uFFFD') q--; if (q < L) ends.add(q), fffd = q; }   // a character the cut broke — only an END (the third read: as the tail itself, every binary output cut at the bound counted a scrubbed hit where no value was)
    for (const e of ends) { const p = prefixStart(buf, e, e === fffd); if (p < e && p < start) start = p; }   // a raw / encoded form half present before an end (prefixStart answers the end itself for none: an end is no tail by itself — read 4)
    for (const vw of VIEWS) {   // each view read ONCE over the whole text (as the release did); each end mapped into its decode
      const r = readView(vw, buf, L, false);
      if (!r) continue;
      for (const e of ends) {
        let n = r.sk.length;
        if (e < L) { let lo = 0, hi = r.sk.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (r.at[mid] < e) lo = mid + 1; else hi = mid; } n = lo; }   // the decoded characters that start before e
        const ps = prefixStart(r.sk, n, e === fffd);
        if (ps < n) { const raw = r.at[ps]; if (raw != null && raw < start) start = raw; }   // a complete-token VIEW decode whose tail is a value prefix — mapped back to a raw offset
      }
    }
    st.cutSteps += st.steps - s0;   // the steps of the cut's own search, a run's sum (the suites': its count is judged against its compares)
    return start;
  }
  // THE CUT'S TWO FAULTS (lane lg-vault-file, r858 — every version back to round 21): (1) the uncertain tail could start INSIDE a
  // value printed just before the cut (its last characters read as a half value's start, or a colour code inside it as an unfinished
  // token): the certain prefix held only the value's head, which no form matches, and flushed it in the clear; (2) the cut rebuilt
  // the held text STREAM BY STREAM, so a value the program wrote half to stdout and half to stderr was never found and went out whole.
  // Now each stream's tail is decided against the finds of its own text AND of the arrival order: a find that reaches into a tail
  // pulls the tail of every stream it covers back to its start there (to a fixpoint), and the certain prefixes keep the arrival order.
  // A tail outside every find is unchanged; a run that is not cut never comes here.
  function endStep(cut) {
    if (st.over) return none();   // THE SCAN'S BUDGET: the end after the mark gives nothing — the run past its figure had said the words twice
    if (!st.inTurn) return turn(() => endStep(cut));   // THE SCAN'S BUDGET
    if (!cut || !re) return step(true);   // a COMPLETE stream (or no secrets): flush all, every complete match masked — no partial to fear
    const own = new Map(); for (const [k, x] of held) own.set(k, (own.get(k) || '') + x);
    const start = new Map(); for (const [k, x] of own) start.set(k, cutTailStart(x));
    const ar = own.size > 1 ? arrivalOf(held) : null;
    if (ar) {   // the ARRIVAL order's own uncertain tail: a value whose head went to one pipe and its middle to the other, cut before its end — every stream's text from there on is uncertain too
      const q = cutTailStart(ar.all);
      for (let i = q; i < ar.all.length; i++) { const k = ar.streamAt[i]; if (ar.idxAt[i] < start.get(k)) start.set(k, ar.idxAt[i]); }
    }
    // the complete finds of each stream's text and of the arrival order — the WHOLE held text (the scrubber's second read: a window
    // sized in raw characters missed a value a view spreads without bound — colour codes, soft breaks, line ends between its characters)
    const finds = [];
    for (const [k, x] of own) for (const f of scan(x, true).finds) finds.push([[k, f.s, f.e]]);
    if (ar) for (const f of scan(ar.all, true, ar.idxAt).finds) finds.push(ar.rangesOf(f.s, f.e));
    settleCuts(finds, start, spend);   // THE ONE SWEEP (主开发 r1068): a find that reaches into a tail pulls the tail of every stream it covers back to its start there — one sweep (was a fixpoint, a find a pass)
    // the CERTAIN prefixes, in arrival order — step(true) masks every complete value in them (one split between the pipes too)
    const used = new Map(), next = [];
    for (const [k, x] of held) {
      const u = used.get(k) || 0, keep = x.slice(0, Math.max(0, start.get(k) - u));
      used.set(k, u + x.length);
      if (keep) { const p = next[next.length - 1]; if (p && p[0] === k) p[1] += keep; else next.push([k, keep]); }
    }
    held = next;
    const out = step(true);
    for (const [k, x] of own) { const s = start.get(k); if (s < x.length) { out[k] = (out[k] || '') + CUT_PH; st.hits++; st.bytes += bytesOf(x.slice(s)); } }   // ONLY the uncertain trailing window becomes a placeholder (and counts one hit); a clean tail adds nothing
    return out;
  }
  /** A SETTLE TURN (stage L3, round wi8mtvm6c's MUST — 主开发 r2600; the job wrapper's quiet, never the run door's): what is CERTAIN
   *  is handed on now — every complete value masked, as an end would — and only the trailing run that could still be the start of a
   *  value (the cut's own uncertain tail: a proper prefix of some spelling, an unfinished view piece, a broken character) stays
   *  held, in arrival order. NEVER an end: the masker lives on, and a value whose first piece is kept is masked whole when the rest
   *  comes. A turn that leaves nothing held leaves the masker as a fresh one (the run's step figure begins again — r2600 (3)). */
  /** a trailing view piece that is still UNFINISHED — a proper prefix of a token its view decodes (the settle's road: a finished colour
   *  code, entity, escape or soft break is certain text; only one that more output could still complete is kept back) */
  function unfinishedPiece(form, rest) { const f = UNFINISHED_PIECE[form]; return typeof f === 'function' ? f(rest) : true; }
  function settleStep() {
    if (st.over) return none();   // THE SCAN'S BUDGET: after the mark nothing is handed on (its retirement is the wrapper's)
    if (!st.inTurn) return turn(() => settleStep());
    if (!re) { const out = step(true); st.fresh = 0; return out; }   // no secrets: nothing a value could begin — all is certain
    const own = new Map(); for (const [k, x] of held) own.set(k, (own.get(k) || '') + x);
    // AT A SETTLE A COMPLETED LINE IS CERTAIN (主开发 r2600's ruling on round wtlm3ig4w's MUST TWO): nothing up to the last line end is
    // kept back — only the UNFINISHED last line's own trailing run that could begin a value (the view that joins wrapped lines never
    // reaches across that end); its residual, said: a value WRAPPED across lines whose lines come with a quiet between them lands line
    // by line (one written in a burst is still masked whole)
    const lastLine = (x) => { const ln = x.lastIndexOf('\n') + 1; return ln + cutTailStart(x.slice(ln), { unfinished: true }); };
    const start = new Map(); for (const [k, x] of own) start.set(k, lastLine(x));
    const ar = own.size > 1 ? arrivalOf(held) : null;
    if (ar) { const q = lastLine(ar.all); for (let i = q; i < ar.all.length; i++) { const k = ar.streamAt[i]; if (ar.idxAt[i] < start.get(k)) start.set(k, ar.idxAt[i]); } }
    const finds = [];
    for (const [k, x] of own) for (const f of scan(x, true).finds) finds.push([[k, f.s, f.e]]);
    if (ar) for (const f of scan(ar.all, true, ar.idxAt).finds) finds.push(ar.rangesOf(f.s, f.e));
    settleCuts(finds, start, spend);   // a complete value reaching into a tail pulls that tail back to its start — never handed on in part
    const used = new Map(), certain = [], kept = [];
    const add = (list, k, x) => { if (!x) return; const p = list[list.length - 1]; if (p && p[0] === k) p[1] += x; else list.push([k, x]); };
    for (const [k, x] of held) {
      const u = used.get(k) || 0, cut = Math.max(0, Math.min(x.length, start.get(k) - u));
      used.set(k, u + x.length);
      add(certain, k, x.slice(0, cut)); add(kept, k, x.slice(cut));
    }
    held = certain;
    const out = step(true);   // the certain prefixes, every complete value in them masked (one split between the pipes too)
    held = kept;   // the uncertain tails stay held — the masker lives on
    st.fresh = 0;
    if (!kept.length) { st.runSteps = 0; st.read = 0; }   // nothing held: the same state as a fresh masker — its run figure begins again
    return out;
  }
  return {
    settle: () => settleStep(),   // the job wrapper's quiet (data/bin/job-wrapper.js) — the run door never calls it
    push(stream, chunk) {
      if (!names.includes(stream)) throw new TypeError(`no such stream: ${stream}`);
      const t = String(chunk == null ? '' : chunk);
      if (st.over) { st.withheld += t.length; return none(); }   // THE SCAN'S BUDGET: after the mark nothing is handed on (and nothing kept)
      if (t) { const last = held[held.length - 1]; if (last && last[0] === stream) last[1] += t; else held.push([stream, t]); }
      st.fresh += t.length; st.read += t.length;   // THE SCAN'S BUDGET
      if (st.fresh <= W) return none();   // THE SCAN'S BUDGET: a push no longer than the window waits for a window's worth (the read's F2: each turn rescans the window, ~3 × a long value's bytes — a log in short reads paid a window a line and met the run's figure on an ordinary run); the parts are joined at the end, the output is the same
      st.fresh = 0;   // THE SCAN'S BUDGET
      return step(false);
    },
    end: (cut = false) => endStep(cut),
    get steps() { return st.steps; }, get maxSteps() { return st.maxSteps; }, get runSteps() { return st.runSteps; }, get over() { return st.over; }, get withheld() { return st.withheld; }, get cutSteps() { return st.cutSteps; }, get charge() { return charge; },   // THE SCAN'S BUDGET: the counts, and the mark
    get hits() { return st.hits; }, get bytes() { return st.bytes; }, get byForm() { return { ...st.byForm }; }, get scanned() { return st.scanned; }, window: W, streams: names,
    /** r3732 (the job wrapper's own lines): the characters the run holds back now (0: nothing is held — a line of the wrapper's own may go out) */
    get holding() { let n = 0; for (const e of held) n += e[1].length; return n; },
  };
}
/** ONE stream's scrubber (a whole text, the belt's): the run masker with one stream. `secrets` = a secrets list or a compiled set
 *  (compileForms). → { push(chunk) → text, end() → text, hits, bytes, byForm, window }. */
function createMasker(secrets) {
  const m = createRunMasker(secrets, ['out']);
  return { push: (chunk) => m.push('out', chunk).out, end: (cut) => m.end(cut).out, get hits() { return m.hits; }, get bytes() { return m.bytes; }, get byForm() { return m.byForm; }, get over() { return m.over; }, window: m.window };   // over: the scan's budget's mark (r1068)
}
/** One whole text scrubbed (a card's command, a short output, the output belt's sink text) — `secrets` a list or a compiled set. */
function maskText(text, secrets) { const m = createMasker(secrets), t = String(text == null ? '' : text); let out = ''; for (let i = 0; i < t.length; i += 65536) out += m.push(t.slice(i, i + 65536)); return out + m.end(); }   // in 64 KiB pieces (the budget's read, F9: a whole text of megabytes in ONE turn met the turn's figure — the output belt's text became the withheld words)
const VIEW_TRIGGER_RE = /[=\\&\x1b\r\n]/;
/** Memoizable text scrubber built ONCE per secret-set change (lane vault-login-chrome r5 MAJOR A + r6 MINOR E' + r7 MAJOR 2:
 *  never rebuild formsOf + RegExp per string node on the event loop). `fn(text)` matches `maskText(text, secrets)` across all
 *  spelled + view forms (but for values that tile a repeating text: the run's scan, while it holds text back, breaks that one
 *  long group into several placeholders, where this gives one); `fn.spelled(text)` scrubs unparseable raw blobs by masking all forms inside JSON strings (`"…"`) and
 *  read views while skipping bare JSON number tokens outside quotes. */
function compileTextScrubber(secrets) {
  const table = new Map();
  let nv = 0;
  for (const s of Array.isArray(secrets) ? secrets : []) {
    const v = String(s && s.value != null ? s.value : '');
    if (bytesOf(v) < MIN_MASK_BYTES) continue;
    const ph = placeholderOf(s.ref && typeof s.ref === 'object' ? s.ref : s.label != null ? { label: s.label } : parseRef(String(s.ref)) || String(s.ref));
    const vi = ++nv;   // r858: this value's own index (two values may share a placeholder)
    for (const f of formsOf(v)) if (!table.has(f.text)) table.set(f.text, { ph, form: f.form, v: vi });
  }
  const texts = [...table.keys()].sort((a, b) => b.length - a.length);
  const maxFormLen = texts.length ? texts[0].length : 0;
  const re = texts.length ? new RegExp(texts.map(reEscape).join('|'), 'g') : null;   // the release's full-forms regex (主开发 r3342 (6)): this tree's two passes read H.hre, the heads, never it; it stays so scripts/vault-run-scrub-legs.mjs rebuilds the release's scrubber from this text (its copy drops the budget's lines, each pass's H.hre with them) — one regex a recompile, at a value's change
  const H = headsOf(texts), textHeads = repeatingHeads(H.keys), CUT = placeholderOf({ label: '\u2026' });   // THE TEXT BUDGET (主开发 r1216 / r1915): the textHeads (the run scan's own builder), their repeating textHeads, the cut's placeholder
  let overs = 0, spend = () => { };   // THE TEXT BUDGET: the call's one spend (a no-op between calls), and how many calls failed closed
  const OVER = Symbol('vault-run.text-over');   // THE TEXT BUDGET
  const counted = (raw, fn) => { const limit = TEXT_STEPS_BASE + TEXT_STEPS_A_CHAR * raw.length; let steps = 0; spend = (n) => { steps += n; if (steps > limit) throw OVER; }; try { return fn(); } catch (e) { if (e !== OVER) throw e; overs++; return CUT; } finally { spend = () => { }; } };   // THE TEXT BUDGET: ONE call is ONE counted turn, its figure LINEAR in the text — past it the whole string is the cut's placeholder, never raw
  const isNumChar = (c) => (c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46 || c === 101 || c === 69;
  const isWsChar = (c) => c === 32 || c === 9 || c === 10 || c === 13;
  const isBareJsonNumber = (raw, L, s, b) => {
    let ns = s, ne = b;
    while (ns > 0 && isNumChar(raw.charCodeAt(ns - 1))) ns--;
    while (ne < L && isNumChar(raw.charCodeAt(ne))) ne++;
    spend(2 * (ne - ns) + 2);   // THE TEXT BUDGET: the number's walk and its test
    if (!/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw.slice(ns, ne))) return false;
    let li = ns - 1;
    while (li >= 0 && isWsChar(raw.charCodeAt(li))) li--;
    spend(ns - li);   // THE TEXT BUDGET
    if (li >= 0) {
      const lc = raw.charCodeAt(li);
      if (lc !== 58 && lc !== 44 && lc !== 91 && lc !== 123) return false; // : , [ {
    }
    let ri = ne;
    while (ri < L && isWsChar(raw.charCodeAt(ri))) ri++;
    spend(ri - ne + 1);   // THE TEXT BUDGET
    if (ri < L) {
      const rc = raw.charCodeAt(ri);
      if (rc !== 44 && rc !== 93 && rc !== 125) return false; // , ] }
    }
    return true;
  };
  const scrubOnce = (raw) => {
    const re = H.hre;   // THE TEXT BUDGET: the regex of HEADS (no literal over SCRUB_HEAD characters)
    if (!re || typeof raw !== 'string' || !raw) return raw;
    re.lastIndex = 0;
    spend(2 * raw.length + deepCost(raw, textHeads));   // THE TEXT BUDGET: the plain test and the view triggers read the text
    const plainHit = re.test(raw);
    const hasView = VIEW_TRIGGER_RE.test(raw);
    if (!plainHit && !hasView) return raw;
    const L = raw.length, finds = [];
    const look = (sk, r) => {
      re.lastIndex = 0;
      spend(deepCost(sk, textHeads));   // THE TEXT BUDGET: the regex reads the text once, as deep as a run repeats a repeating head
      let m;
      const vEnd = new Map();   // the dialog scrubber's overlap (r858): each value's last find's end
      while ((m = re.exec(sk)) !== null) {
        const s = r ? r.at[m.index] : m.index;
        if (s >= L) break;
        spend(1); { const full = resolveHead(sk, m, H.longOf, H.shortIn, spend); if (full === null) { re.lastIndex = m.index + 1; continue; } m[0] = full; }   // THE TEXT BUDGET: the head → its longest form there, a long one verified by the counted compare (the run scan's own)
        const t = table.get(m[0]);
        if ((vEnd.get(t.v) || -1) > m.index) { re.lastIndex = m.index + 1; continue; }   // the dialog scrubber's overlap: the same value inside its own last find is no new find
        finds.push({ a: s, b: r ? r.to[m.index + m[0].length - 1] : m.index + m[0].length, ph: t.ph });
        vEnd.set(t.v, m.index + m[0].length); re.lastIndex = m.index + 1;   // the dialog scrubber's overlap (r858): asked again inside the match for another value, as the run's scan is
      }
    };
    if (plainHit) look(raw, null);
    if (hasView) {
      for (const vw of VIEWS) {
        spend(2 * L);   // THE TEXT BUDGET: a view reads the text
        const r = readView(vw, raw, L, true);
        if (r) look(r.sk, r);
      }
    }
    if (!finds.length) return raw;
    spend(finds.length * (2 + Math.ceil(Math.log2(finds.length + 2))) + L);   // THE TEXT BUDGET: the finds sorted, the text written out
    finds.sort((p, q) => p.a - q.a || p.b - q.b);
    let out = '', i = 0, lastEnd = -1;
    for (const m of finds) {
      if (lastEnd >= 0 && m.a < lastEnd) { if (m.b > lastEnd) { lastEnd = m.b; i = m.b; } continue; }
      out += raw.slice(i, m.a) + m.ph;
      lastEnd = m.b; i = m.b;
    }
    return out + raw.slice(i);
  };
  const scrub = (raw) => (typeof raw !== 'string' || !raw || !H.hre ? raw : counted(raw, () => scrubOnce(raw)));   // THE TEXT BUDGET
  const spelledOnce = (raw) => {
    const re = H.hre;   // THE TEXT BUDGET
    if (!re || typeof raw !== 'string' || !raw) return raw;
    let plainHit = false;
    re.lastIndex = 0;
    spend(2 * raw.length + deepCost(raw, textHeads));   // THE TEXT BUDGET
    plainHit = re.test(raw);
    const hasView = VIEW_TRIGGER_RE.test(raw);
    if (!plainHit && !hasView) return raw;
    const L = raw.length, cands = [];
    if (plainHit) {
      re.lastIndex = 0;
      let m;
      const vEnd = new Map();   // its spelled pass (r858): each value's last candidate's end
      spend(deepCost(raw, textHeads));   // THE TEXT BUDGET
      while ((m = re.exec(raw)) !== null) {
        if (m.index >= L) break;
        spend(1); { const full = resolveHead(raw, m, H.longOf, H.shortIn, spend); if (full === null) { re.lastIndex = m.index + 1; continue; } m[0] = full; }   // THE TEXT BUDGET
        const t = table.get(m[0]);
        if ((vEnd.get(t.v) || -1) > m.index) { re.lastIndex = m.index + 1; continue; }   // its spelled pass: the same value inside its own last candidate is none
        cands.push({ a: m.index, b: m.index + m[0].length, ph: t.ph, digits: /^\d+$/.test(m[0]) });
        vEnd.set(t.v, m.index + m[0].length); re.lastIndex = m.index + 1;   // its spelled pass (r858): asked again inside the match for another value
      }
    }
    if (hasView && maxFormLen > 0) {
      for (const vw of VIEWS) {
        vw.re.lastIndex = 0;
        spend(L);   // THE TEXT BUDGET: the view's tokens found over the text
        let tm, curS = -1, curE = -1;
        const wins = [];
        while ((tm = vw.re.exec(raw)) !== null) {
          spend(1);   // THE TEXT BUDGET
          const ws = Math.max(0, tm.index - maxFormLen);
          const we = Math.min(L, tm.index + tm[0].length + maxFormLen);
          if (curS < 0) { curS = ws; curE = we; }
          else if (ws <= curE) { if (we > curE) curE = we; }
          else { wins.push([curS, curE]); curS = ws; curE = we; }
        }
        if (curS >= 0) wins.push([curS, curE]);
        for (const [ws, we] of wins) {
          spend(3 * (we - ws));   // THE TEXT BUDGET: the window cut, read through the view
          const slice = raw.slice(ws, we);
          const r = readView(vw, slice, slice.length, true);
          if (!r) continue;
          re.lastIndex = 0;
          spend(deepCost(r.sk, textHeads));   // THE TEXT BUDGET
          let m;
          const vEnd = new Map();   // its spelled pass through a view (r858): each value's last candidate's end
          while ((m = re.exec(r.sk)) !== null) {
            const s = ws + r.at[m.index];
            if (s >= L) break;
            spend(1); { const full = resolveHead(r.sk, m, H.longOf, H.shortIn, spend); if (full === null) { re.lastIndex = m.index + 1; continue; } m[0] = full; }   // THE TEXT BUDGET
            const b = ws + r.to[m.index + m[0].length - 1];
            const t = table.get(m[0]);
            if ((vEnd.get(t.v) || -1) > m.index) { re.lastIndex = m.index + 1; continue; }   // its spelled pass through a view: the same value inside its own last candidate is none
            cands.push({ a: s, b, ph: t.ph, digits: /^\d+$/.test(raw.slice(s, b)) });
            vEnd.set(t.v, m.index + m[0].length); re.lastIndex = m.index + 1;   // its spelled pass through a view (r858): asked again inside the match for another value
          }
        }
      }
    }
    if (!cands.length) return raw;
    spend(cands.length * (2 + Math.ceil(Math.log2(cands.length + 2))) + 2 * L);   // THE TEXT BUDGET: the candidates sorted, the JSON-string walk (once over the text), the text written out
    cands.sort((p, q) => p.a - q.a || p.b - q.b);
    let qIdx = 0, inQuote = false, esc = false;
    const inJsonStrAt = (pos) => {
      while (qIdx < pos) {
        const ch = raw.charCodeAt(qIdx++);
        if (inQuote) {
          if (esc) esc = false;
          else if (ch === 92) esc = true;
          else if (ch === 34) inQuote = false;
          else if (ch === 10 || ch === 13) { inQuote = false; esc = false; }
        } else if (ch === 34) {
          inQuote = true;
          esc = false;
        }
      }
      return inQuote;
    };
    const finds = [];
    for (const c of cands) {
      if (c.digits) {
        const inside = inJsonStrAt(c.a);
        if (!inside && isBareJsonNumber(raw, L, c.a, c.b)) continue;
      }
      finds.push(c);
    }
    if (!finds.length) return raw;
    let out = '', i = 0, lastEnd = -1;
    for (const m of finds) {
      if (lastEnd >= 0 && m.a < lastEnd) { if (m.b > lastEnd) { lastEnd = m.b; i = m.b; } continue; }
      out += raw.slice(i, m.a) + m.ph;
      lastEnd = m.b; i = m.b;
    }
    return out + raw.slice(i);
  };
  scrub.spelled = (raw) => (typeof raw !== 'string' || !raw || !H.hre ? raw : counted(raw, () => spelledOnce(raw)));   // THE TEXT BUDGET
  Object.defineProperty(scrub, 'overs', { get: () => overs });   // THE TEXT BUDGET: how many calls failed closed (the dialogs log it once a profile)
  return scrub;
}

module.exports = {
  MIN_MASK_BYTES, placeholderOf, bytesOf, WORDS,
  FORMS, FORM_ROWS, VIEWS, formsOf, compileForms, isCompiledForms, createMasker, createRunMasker, maskText, compileTextScrubber,
  settleCuts, SCRUB_STEPS_PUSH, SCRUB_STEPS_RUN,   // 主开发 r1068: the cuts settled in one sweep (the suite's equivalence leg reads it against the fixpoint), the scan's two figures
  TEXT_STEPS_BASE, TEXT_STEPS_A_CHAR, headsOf, resolveHead,   // 主开发 r1915: the text budget's figures; the heads and the counted verify — ONE implementation for the run's scan and the dialogs' text scrubber
};

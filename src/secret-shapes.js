'use strict';
/**
 * PURE (imports only browser-trace's CREDENTIAL_WORDS; CJS so the hub, the bundle and a suite share one copy) —
 * SECRET SHAPES IN MACHINE OUTPUT (lane-exit-run-output verify r1 F1, 2026-10-01).
 *
 * A command's output heads are PERSISTED (data/exit-audit.jsonl), BROADCAST (every client socket), CARDED (the
 * conversation's "Machines · <machine>" card) and LISTED (the owner's command list, the agent's `vibespace-exit
 * runs`). `printenv`, `cat ~/.ssh/id_ed25519`, a kubeconfig, a `.netrc`, a bearer in a log line: the verifier ran
 * nine such shapes through the stored head and read nine back verbatim — the URL rule (browser-trace's
 * withoutUrlSecrets) and the peer-text belt (hidden characters, frames) redact none of them.
 *
 * `redactSecrets(text)` is THE ONE rule every stored / shown copy passes (exit-reach outputHeads, after the URL cut,
 * before the belt): the input bounded first (INPUT_MAX, never parsed whole past it), five linear passes, each
 * secret's VALUE replaced by `«redacted»` while its NAME stays (the reader still sees what the line was). The agent's
 * own API result keeps the whole stream — it ran the command; only what is stored and shown to others passes here.
 * Idempotent: a redacted text redacts to itself.
 *
 * THE TABLE (each row a pinned leg of test-exit-run §2b):
 *   R1 a PEM private-key block — a `-----BEGIN … PRIVATE KEY-----` line through its END line (unclosed ⇒ to the end
 *      of the text); a CERTIFICATE / PUBLIC KEY block is public and stays
 *   R2 a named value — `NAME=value`, `NAME: value`, `"name": "value"`, `--name=value` (quoted or bare, one per
 *      key): a name whose words (split on `_ - .` and camelCase) carry a secret word ⇒ its value is «redacted». A quoted value closes at
 *      its next quote that is neither behind an odd backslash run (r2 F5) nor doubled by its twin (r5 F1: YAML's `'it''s'`, SQL, PowerShell, CSV)
 *      The words = browser-trace's CREDENTIAL_WORDS (token, secret, password, key, auth, credential, session, sig…)
 *      minus `code` (an exit code / an error code is diagnosis, never a secret) plus passphrase / cookie / private /
 *      cred(s) / bearer. `SSH_AUTH_SOCK=…` or `XDG_SESSION_ID=…` are hidden too: a false hide on an env dump costs
 *      nothing, a miss is a key on disk
 *   R2b a value continued on the FOLLOWING lines (verify r2 F3) — a secret-named key with nothing after its `:` / `=`
 *      (`"password":` ⏎ `"hunter2"`, YAML's plain multi-line scalar), a YAML block scalar (`token: |`), PuTTY's
 *      `Private-Lines: N`: the deeper-indented lines after it (the N lines) are the value
 *   R3 an HTTP credential — `Bearer <token>` (6+ chars) / `Basic <base64>` (16+ chars: "Basic Latin" stays)
 *   R4 a known prefix — gh[pousr]_ / github_pat_ (GitHub), sk- (OpenAI / Anthropic), sk_live_ / sk_test_ / rk_live_ /
 *      rk_test_ (Stripe, verify r2 F4), xox[abprs]- (Slack), AKIA /
 *      ASIA (AWS), AIza (Google), glpat- (GitLab), npm_, hf_, vsst_ / vsmt_ / jbt_ (our own tokens), a JWT
 *      (`eyJ….eyJ….sig`, a scan in code since verify r4 F3): the prefix stays, the material goes
 *   R5 a secret word followed by its token with no separator — `password hunter2` (a .netrc), `token eyJ…`: the
 *      next token after password / passwd / passphrase, and a 24+ run of key material within 3 characters of any
 *      secret word
 *   R6 a `reg query` row (verify r2 F4) — `<name with a secret word>    REG_SZ    <value>`: the value column (runs before R5, verify r4 F7)
 * Every quantifier is bounded at the input bound and every run is consumed WHOLE (verify r2 F2: a cut inside a value kept
 * the value's tail past 4096 characters — a 6 KB bearer, an RSA-4096 `client-key-data`); no pass throws (a text that
 * cannot be judged is returned unchanged — never a stall, never a crash, and the caller's belt still runs).
 */
const { CREDENTIAL_WORDS } = require('./browser-trace.js');

const REDACTED = '«redacted»';
const INPUT_MAX = 64 * 1024;          // characters judged; the rest is dropped (the caller cut to 8 KiB before this)
const VALUE_MAX = 4096;               // (verify r2 F2) no longer a cut inside a value — kept exported: the LONGEST value a suite's clock leg builds

const SECRET_WORDS = new Set([...CREDENTIAL_WORDS, 'passphrase', 'cookie', 'private', 'cred', 'creds', 'bearer'].filter((w) => w !== 'code'));
/** Does a NAME carry a secret word? (`client-key-data`, `AWS_SECRET_ACCESS_KEY`, `apiKey`, `GITHUB_TOKEN`) */
function secretName(k) {
  return String(k || '').split(/[_\-.\s]+|(?<=[a-z0-9])(?=[A-Z])/).some((w) => w && SECRET_WORDS.has(w.toLowerCase()));
}

// R1: the PEM lines (BEGIN / END of a private key). verify r4 F2 (the regex census): `^\s*-----BEGIN [A-Z0-9 ]*PRIVATE KEY[A-Z0-9 ]*-----\s*$`
// put two runs of ONE class around a literal that class itself spells — on a line `-----BEGIN PRIVATE KEY PRIVATE KEY …` with no closing
// dashes the second run backtracked at every occurrence of the literal (380 ms at the 64 KiB bound, 3.6 ms per 4 KiB stored head). The label
// is judged in code: the dashes and the word by position, ONE run `[A-Z0-9 ]*` whole (a single anchored run never backtracks past its start),
// the literal by indexOf — the same lines admitted (blanks around, `-----BEGIN  PRIVATE KEY-----` with its inner blank, six closing dashes refused)
const PEM_LABEL = /^[A-Z0-9 ]*$/;
function pemLine(line, word) {
  const t = line.trim(), head = '-----' + word + ' ';
  if (t.length < head.length + 5 || !t.startsWith(head) || !t.endsWith('-----')) return false;
  const label = t.slice(head.length, -5);
  return label.indexOf('PRIVATE KEY') >= 0 && PEM_LABEL.test(label);
}
function redactPem(text) {
  if (text.indexOf('PRIVATE KEY') < 0) return { text, n: 0 };
  const lines = text.split('\n'); const out = []; let n = 0, inside = false;
  for (const l of lines) {
    if (!inside) { out.push(l); if (pemLine(l, 'BEGIN')) { inside = true; out.push(REDACTED); n++; } continue; }
    if (pemLine(l, 'END')) { inside = false; out.push(l); }
  }
  return { text: out.join('\n'), n };
}
// R2b (verify r2 F3): a value continued on the FOLLOWING lines — a secret-named key whose own line carries no value
// (`"password":` with its string on the next line, a YAML plain multi-line scalar `password:\n  hunter2`), a YAML block
// scalar (`token: |`, `>`, `|-`), and PuTTY's `Private-Lines: N` (the N lines after it ARE the key — `cat key.ppk` on a
// Windows box): the continuation = every following non-blank line indented deeper than the key's line (blank lines
// inside it kept), each → its indent + «redacted»; `Private-Lines: N` → the N lines become ONE «redacted». Runs BEFORE
// R2 (which then hides the count / the indicator too). One pass over the lines; a redacted continuation redacts to itself
// verify r3 F5: the value is `[^\n]*`, not `.*` — `.` stops at a `\r` (or U+2028), so `password:\r\n  hunter2` never matched the head
// (the CRLF continuation passed this rule; the product's fold hides CRLF, a direct caller's did not) and the failed `$` made the
// blank run before it backtrack quadratically (36 → 182 ms at 16 → 32 KiB); `.trim()` drops the `\r` from the judged value
const CONT_HEAD = /^([ \t]*)(?:-[ \t]+)?(-{0,2})(["']?)([A-Za-z_][A-Za-z0-9_.\-]{0,80})\3[ \t]*[:=][ \t]*([^\n]*)$/;
const BLOCK_VAL = /^[|>][+-]?\d*$/;
// verify r3 F7: a quoted value that does not CLOSE on its line (YAML's multi-line flow scalar — `password: "abc` ⏎ `  def"`) continues
// on the deeper lines: R2 hid `abc` to the line end and `  def"` stayed. Open = the opening quote with no CLOSING twin after it
// verify r5 F1: a quote DOUBLED by its twin is an escaped quote, not a close — YAML's single-quoted escape (`password: 'it''s'`), SQL's,
// PowerShell's `''` / `""`, CSV's `""`, and a shell's `'a''b'` is one word; the three scanners (the one-line close, openQuote, closesQuote)
// read backslashes only (r2 F5) and stored `'«redacted»''s-s3cret'`; a scan steps PAST both quotes of a pair (its twin is not the next candidate)
function nextClose(text, from, q, end) {
  let i = text.indexOf(q, from);
  while (i >= 0 && i < end) { if (escapedAt(text, i)) i = text.indexOf(q, i + 1); else if (i + 1 < end && text[i + 1] === q) i = text.indexOf(q, i + 2); else return i; }
  return -1;
}
function openQuote(v) { const q = v[0]; if (q !== '"' && q !== "'") return false; return nextClose(v, 1, q, v.length) < 0; }
// verify r4 F5 (Z4): an open quote's continuation is BOUNDED — it ends at the line that closes the quote (that line keeps its closing quote, so a
// second pass over an empty head `password: "` closes there too), else at the first blank line, else after CONT_QUOTED_MAX lines; before, one
// stray quote on a prompt line hid every deeper line to the next shallower one (a whole indented log, bounded only by the 64 KiB input).
// The UNQUOTED continuation (`password:` ⏎ a deeper map) is still every deeper line — in YAML that map IS the value (r3 X2, held)
const CONT_QUOTED_MAX = 200;
function closesQuote(l, q) { return nextClose(l, 0, q, l.length) >= 0; }   // verify r5 F1: a doubled `''` on a continuation line does not close it either
// verify r3 F6: an indent is compared in COLUMNS (a tab to the next multiple of 8) — by characters `    password:` ⏎ `\thunter2` read
// 1 < 4 and the tab-indented continuation under a space-indented key was kept; the slice still counts characters
const indentChars = (l) => /^[ \t]*/.exec(l)[0].length;
const indentCols = (l) => { let c = 0; const ws = /^[ \t]*/.exec(l)[0]; for (let i = 0; i < ws.length; i++) c = ws[i] === '\t' ? (c | 7) + 1 : c + 1; return c; };
// verify r3 F2: the pre-check's blank run is ONE quantifier — `[ \t]*(?:…)?[ \t]*` (two runs of one class around an optional
// group) backtracked quadratically on `a: ` + spaces + `x` (1.5 s at 32 KiB, 100 ms per 8 KiB head, twice per run)
// (verify r3 F7: a value that OPENS a quote may be a continuation head too — the gate admits any quoted value's line, the rule judges)
const CONT_ANY_RE = /[:=][ \t]*(?:[|>][+-]?\d*[ \t]*|["'][^\n]*)?(?:\r?\n|$)/;
function redactContinuations(text) {
  if (!CONT_ANY_RE.test(text) && !/private-lines/i.test(text)) return { text, n: 0 };
  const lines = text.split('\n'); let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = CONT_HEAD.exec(lines[i]); if (!m) continue;
    const name = m[4], val = m[5].trim();
    if (/^private-lines$/i.test(name)) {
      const cnt = parseInt(val, 10); if (!(cnt > 0)) continue;
      const end = Math.min(lines.length, i + 1 + Math.min(cnt, 100000));
      if (end > i + 1 && !(end === i + 2 && lines[i + 1].trim() === REDACTED)) { lines.splice(i + 1, end - (i + 1), REDACTED); n++; }
      continue;
    }
    if (!secretName(name) || (val !== '' && val !== REDACTED && !BLOCK_VAL.test(val) && !openQuote(val))) continue;
    const quoted = openQuote(val) ? val[0] : '';
    const indent = indentCols(lines[i]); let any = false, taken = 0;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]; if (!l.trim()) { if (quoted) break; continue; }   // verify r4 F5: a blank line ends an open-quoted continuation
      if (indentCols(l) <= indent) break;
      if (quoted && ++taken > CONT_QUOTED_MAX) break;                       // verify r4 F5: 200 lines at most
      const closes = quoted && closesQuote(l, quoted);
      const ind = indentChars(l), cr = l.endsWith('\r') ? '\r' : '';   // verify r3 F5: a CRLF line keeps its CR
      const want = l.slice(0, ind) + REDACTED + (closes ? quoted : '') + cr;
      if (l !== want) { lines[j] = want; any = true; }
      if (closes) break;                                                     // verify r4 F5: the quote's closing line ends it
    }
    if (any) n++;
  }
  return { text: lines.join('\n'), n };
}
// R2: `NAME = value` / `NAME: value` / `"name": "value"` / `--name=value` — the HEAD is matched, the value's extent is
// decided in code (a regex that consumed the value either stopped a bare value at a space — `Authorization: Bearer
// abc` kept `abc` — or swallowed the next key of `a=1 token=x`): a quoted value to its closing quote on the line, a
// bare value to the end of its line (`token=abc ms=5` hides `ms=5` too — a stored head hides more, never less)
const KV_HEAD = /(^|[\s,;{(\[:/])(-{0,2})(["']?)([A-Za-z_][A-Za-z0-9_.\-]{0,80})\3([ \t]*[:=][ \t]*)/gm;   // verify r2 F4: `:` and `/` open a name too (.npmrc's `//registry…/:_authToken=<uuid>`)
/** Is the character at `i` preceded by an ODD run of backslashes (escaped)? */
function escapedAt(text, i) { let k = 0; while (i - 1 - k >= 0 && text[i - 1 - k] === '\\') k++; return k % 2 === 1; }
function redactKv(text) {
  let n = 0, out = '', last = 0, m, lineEnd = -1;
  KV_HEAD.lastIndex = 0;
  while ((m = KV_HEAD.exec(text))) {
    const headEnd = KV_HEAD.lastIndex;
    if (!secretName(m[4])) continue;                       // the next key may start right after this head
    const q = text[headEnd] === '"' || text[headEnd] === "'" ? text[headEnd] : '';
    // verify r4 F4 (the census, in code): the line's end was searched from EVERY head — `token="a" token="b" …` on one line walked the
    // line once per head (quadratic by construction; the clock read ×8 only because a 64 KiB memchr lives in cache); found once per line
    if (headEnd > lineEnd) { const nl = text.indexOf('\n', headEnd); lineEnd = nl < 0 ? text.length : nl; }
    let valEnd = lineEnd;
    if (q) {   // verify r2 F5: a backslash-escaped quote inside the value does not close it (`"ab\"cd"` kept `cd"`); verify r5 F1: nor a doubled one (`'it''s'` kept `s'`)
      const close = nextClose(text, headEnd + 1, q, lineEnd);
      if (close >= 0) valEnd = close + 1;
    }
    // verify r2 F2: the WHOLE value, to its closing quote or its line end — a cut at VALUE_MAX replaced the first 4096
    // characters and KEPT the rest of the line: a 6 KB bearer JWT (an Azure token), a kubeconfig `client-key-data` of an
    // RSA-4096 key (4.3 KB of base64), a 10 KiB `TOKEN=` all stored their tails past the cut (and were not idempotent).
    // The extent is found by indexOf over a text already bounded at INPUT_MAX: linear, no regex walks the value
    const val = text.slice(headEnd, valEnd);
    // verify r4 F1: `val.replace(/\s+$/, '')` is the classic quadratic — a quantified run before an anchor that can fail
    // backtracks the whole run at EVERY start: `token=` + NBSP × n + `x` (a blank `[ \t]*` does not eat — NBSP, U+3000, U+2028)
    // took 4 s at the 64 KiB bound, 8 ms per 4 KiB stored head (0.8 s on the hub's loop per owner list GET, 3 s at the agent's
    // 200 rows). `trimEnd` removes exactly `\s`'s set (WhiteSpace + LineTerminator; every code point checked) in one backward scan
    const trimmed = val.trimEnd();
    const inner = q ? trimmed.slice(1, trimmed.length > 1 && trimmed.endsWith(q) ? -1 : undefined) : trimmed;
    if (!inner || inner === REDACTED) { KV_HEAD.lastIndex = headEnd; continue; }
    n++;
    out += text.slice(last, headEnd) + (q ? q + REDACTED + q : REDACTED) + val.slice(trimmed.length);
    last = valEnd; KV_HEAD.lastIndex = valEnd;
  }
  return { text: out + text.slice(last), n };
}
// R3: an HTTP credential
const HTTP_RE = /\b(bearer[ \t]+)[A-Za-z0-9_\-.=+/]{6,65536}|\b(basic[ \t]+)[A-Za-z0-9+/]{16,65536}={0,2}/gi;   // verify r2 F2: a run is consumed WHOLE (a 6 KB bearer kept its tail past 4096)
// R4: a known prefix (the prefix stays)
const PREFIX_RE = /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255}|sk-[A-Za-z0-9_\-]{16,255}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,255}|xox[abprs]-[A-Za-z0-9\-]{10,255}|(?:AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_\-]{35}|glpat-[A-Za-z0-9_\-]{20,255}|npm_[A-Za-z0-9]{36}|hf_[A-Za-z0-9]{20,255}|vs(?:st|mt)_[A-Za-z0-9_\-]{8,255}|jbt_[A-Za-z0-9_\-]{8,255})(?![A-Za-z0-9_\-])/g;
const PREFIX_HEAD = /^(github_pat_|gh[pousr]_|sk-|(?:sk|rk)_(?:live|test)_|xox[abprs]-|AKIA|ASIA|AIza|glpat-|npm_|hf_|vsst_|vsmt_|jbt_)/;
// verify r4 F3 (the regex census): the JWT was PREFIX_RE's one unbounded alternative, `\beyJ[A-Za-z0-9_\-]{8,}\.eyJ…\.…` — its run class holds
// `-`, a non-word character that re-opens `\b` INSIDE the run: `-eyJ-eyJ-eyJ…` is a start at every `eyJ` and every start walks the run to its
// end before the `.` fails (1.3 s at the 64 KiB bound, 27 ms per 8 KiB head at the write; `eyJeyJ…` read linear because it has no boundary).
// A scan in code now, before the prefixes: the three runs walked once each; every `eyJ` inside a failed start's first run ends at the same
// character and fails the same way, so the scan resumes at that run's end; a start that succeeds is the leftmost one, as the regex's
const isWordCode = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;   // [A-Za-z0-9_]: `\b`'s word
const isB64urlCode = (c) => isWordCode(c) || c === 45;                                                          // [A-Za-z0-9_-]
function b64urlEnd(text, i) { while (i < text.length && isB64urlCode(text.charCodeAt(i))) i++; return i; }
function redactJwt(text) {
  let out = '', last = 0, n = 0, i = text.indexOf('eyJ');
  while (i >= 0) {
    if (i > 0 && isWordCode(text.charCodeAt(i - 1))) { i = text.indexOf('eyJ', i + 1); continue; }   // no `\b` before it
    const e1 = b64urlEnd(text, i + 3);
    let e3 = -1;
    if (e1 - i - 3 >= 8 && text.charCodeAt(e1) === 46 && text.startsWith('eyJ', e1 + 1)) {
      const e2 = b64urlEnd(text, e1 + 4);
      if (e2 - e1 - 4 >= 8 && text.charCodeAt(e2) === 46) { const e = b64urlEnd(text, e2 + 1); if (e - e2 - 1 >= 8) e3 = e; }
    }
    if (e3 >= 0) { n++; out += text.slice(last, i) + 'eyJ' + REDACTED; last = e3; i = text.indexOf('eyJ', e3); }
    else i = text.indexOf('eyJ', e1);   // every eyJ inside this run fails the same way
  }
  return { text: out + text.slice(last), n };
}
// R5: a secret word followed by its token (no `:` / `=` — those are R2's)
// verify r4 F7: never a `REG_` type token — R5 ran before R6 and took the TYPE column of a two-blank `reg` row (`Password  REG_SZ  hunter2`)
// as the token after the word, so R6 never saw `REG_SZ` and the VALUE stayed; R6 runs first now and R5 leaves the type column
// verify r5 F2 (LOW): the guard refused EVERY `REG_` token (`password REG_hunter2` — a token that merely starts like a type kept) — it names the
// type column now: the SAME `REG_(?:…)` group R6's row regex spells (test-exit-run §2e reads both from the source; they cannot drift unseen)
const WORD_NEXT_RE = /\b(password|passwd|passphrase)([ \t]{1,3})(?!«)(?!REG_(?:SZ|EXPAND_SZ|BINARY|MULTI_SZ|DWORD|QWORD|LINK|NONE)\b)\S{1,65536}/gi;
// R6 (verify r2 F4): `reg query` on a Windows box — `    Password    REG_SZ    hunter2` (the value is the third column,
// four spaces apart; neither R2's `:` / `=` nor R5's 1–3 spaces see it). verify r3 F1: the name is ONE `\S+` token and its
// secret word is judged in code — the old `\S*(?:password|…)\S*` backtracked over every word position of a spaceless line
// (`keykeykey…`: 1.7 s at the 64 KiB bound, 12 ms per 4 KiB stored head ⇒ 0.6 s for the owner's 50-row list)
const REG_RE = /^([ \t]*)(\S+)([ \t]{2,}REG_(?:SZ|EXPAND_SZ|BINARY|MULTI_SZ|DWORD|QWORD|LINK|NONE)[ \t]{2,})(?!«redacted»)(\S.*)$/gm;
const REG_NAME_RE = /password|passwd|secret|token|key|cred|auth|cookie|session/i;
const WORD_RUN_RE = /\b(token|secret|apikey|api[_-]key|auth|key|credential|private[_-]key|cookie|session)([ \t]{1,3})[A-Za-z0-9+/=_\-]{24,65536}/gi;

/**
 * THE ONE RULE: `redactSecrets(text)` → `{text, redacted}` — `redacted` = how many shapes were replaced. Bounded,
 * linear, idempotent, never throws.
 */
// verify r3 F3: the belt's fold KEEPS the two joiners (U+200C / U+200D — an emoji sequence, a Persian or Indic word needs them),
// so `SEC\u200DRET=hunter2` reached every rule with its name split and the reader saw `SECRET=hunter2` (the joiner draws nothing
// between Latin letters). A joiner between two ASCII word characters joins nothing: folded out here, before the rules, on
// every copy the rule judges; one inside an emoji sequence or a non-ASCII word stays
const JOINER_IN_WORD_RE = /(?<=[A-Za-z0-9_.\-])[\u200C\u200D]+(?=[A-Za-z0-9_.\-])/g;
function redactSecrets(raw) {
  let text = String(raw == null ? '' : raw);
  if (text.length > INPUT_MAX) text = text.slice(0, INPUT_MAX);
  if (!text) return { text, redacted: 0 };
  if (text.includes('\u200C') || text.includes('\u200D')) text = text.replace(JOINER_IN_WORD_RE, '');
  let n = 0;
  try {
    const pem = redactPem(text); text = pem.text; n += pem.n;
    const cont = redactContinuations(text); text = cont.text; n += cont.n;   // verify r2 F3: before R2 (R2 then hides the head's own value)
    const kv = redactKv(text); text = kv.text; n += kv.n;
    text = text.replace(REG_RE, (m, ind, name, sep) => { if (!REG_NAME_RE.test(name)) return m; n++; return `${ind}${name}${sep}${REDACTED}`; });   // verify r4 F7: before R5
    text = text.replace(HTTP_RE, (m, bearer, basic) => { n++; return `${bearer || basic}${REDACTED}`; });
    const jwt = redactJwt(text); text = jwt.text; n += jwt.n;   // verify r4 F3: the JWT scan, before the bounded prefixes
    text = text.replace(PREFIX_RE, (m) => { n++; const h = PREFIX_HEAD.exec(m); return `${h ? h[1] : ''}${REDACTED}`; });
    text = text.replace(WORD_NEXT_RE, (m, w, sp) => { n++; return `${w}${sp}${REDACTED}`; });
    text = text.replace(WORD_RUN_RE, (m, w, sp) => { n++; return `${w}${sp}${REDACTED}`; });
  } catch { /* a text that cannot be judged is returned as far as it got — the caller's belt still runs */ }
  return { text, redacted: n };
}

module.exports = { REDACTED, INPUT_MAX, VALUE_MAX, SECRET_WORDS, secretName, redactSecrets };

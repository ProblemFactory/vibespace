'use strict';
/**
 * PURE (imports only src/credential-words.js — browser-trace's CREDENTIAL_WORDS; CJS so the hub, the bundle and a suite share one copy) —
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
 *      cred(s) / bearer — judged by THE NAME GRAMMAR (below): the credential word must be the name's HEAD or sit under a
 *      container head (`XDG_SESSION_ID=…` is hidden: a false hide on an env dump costs nothing, a miss is a key on disk);
 *      one that only modifies a DESCRIPTOR head names a fact about a credential and stays (`SSH_AUTH_SOCK`, `TOKEN_TTL`)
 *   R2b a value continued on the FOLLOWING lines (verify r2 F3) — a secret-named key with nothing after its `:` / `=`
 *      (`"password":` ⏎ `"hunter2"`, YAML's plain multi-line scalar), a YAML block scalar (`token: |`), PuTTY's
 *      `Private-Lines: N`: the deeper-indented lines after it (the N lines) are the value
 *   R3 an HTTP credential — `Bearer <token>` (6+ chars) / `Basic <base64>` (16+ chars: "Basic Latin" stays)
 *   R4 a known prefix — gh[pousr]_ / github_pat_ (GitHub), sk- (OpenAI / Anthropic), sk_live_ / sk_test_ / rk_live_ /
 *      rk_test_ (Stripe, verify r2 F4), xox[abprs]- (Slack), xoxe. / xoxe- (Slack's app configuration token and
 *      its refresh token, design 017 — Slack's family up to 512 characters, the whole length slack-manifest's
 *      tokenShapeOf accepts, so a long token is never left whole), AKIA /
 *      ASIA (AWS), AIza (Google), glpat- (GitLab), npm_, hf_, vsst_ / vsmt_ / vswh_ / vswp_ (a webhook pairing code — it carries a token) / jbt_ (our own tokens), a JWT
 *      (`eyJ….eyJ….sig`, a scan in code since verify r4 F3): the prefix stays, the material goes
 *   R5 a secret word followed by its token with no separator — `password hunter2` (a .netrc), `token eyJ…`: the
 *      next token after password / passwd / passphrase, and a 24+ run of key material within 3 characters of any
 *      secret word
 *   R6 a `reg query` row (verify r2 F4) — `<name with a secret word>    REG_SZ    <value>`: the value column (runs before R5, verify r4 F7)
 *   R7 a URL query value (inbox-verify F1, 2026-10-13) — `?token=…`, `&sig=…`, `;access_token=…`, `#key=…`: a parameter whose
 *      name HOLDS a secret (THE NAME GRAMMAR — gcloud's `token_usage=remote` is a usage, not a token) ⇒ its value to the next
 *      `& # ; ' " < >` or blank, a closing `) ] } . , : ! ?` / CJK closer that ENDS the run kept outside it (the link sits
 *      in `[label](…)`, in parentheses, at a sentence's end); the name stays (the judge, a reader, still sees what the link was)
 *   R8 key material with no name (`{ runs: true }`, the LLM plugin's judge input only — inbox-verify F1): a 32+ run of
 *      hex with a digit and a letter, or of base64 / base64url with an upper, a lower and a digit and no lowercase word of
 *      4+ between its `/ _ - + =` (a path, a slug, an identifier keeps its words). Opt-in: a command's stored head
 *      keeps its commit shas and hashes (diagnosis); a text bound for a vendor's model loses them (nothing to diagnose)
 * THE NAME GRAMMAR (lane mask-value-shape r2, the owner 2026-11-07 — «URL被替换和redact了»: R7 masked gcloud's PUBLIC
 *   `token_usage=remote` because its name holds «token», and the sign-in link on his For-you card opened nothing). The
 *   belt NEVER judges a value's shape in order to KEEP it (r1's value floor kept `API_KEY=changeme`, `REDIS_AUTH=foobared`,
 *   `?token=letmein` — a secret a person types under a machine name has any shape). It judges the NAME (`holderName`, R2
 *   and R7): a name HOLDS a secret when a credential word is its HEAD — its last piece (`access_token`, `api_key`,
 *   `REDIS_AUTH`, `client_secret`, `X-Amz-Signature`, a bare `token`) — or its head is a bare CONTAINER of one
 *   (CONTAINER_HEADS: `session_id`, `token_value`, `key_id`); a credential word that only MODIFIES a DESCRIPTOR head
 *   (DESCRIPTOR_HEADS, an explicit allowlist: usage / type / ttl / sock / policy / name / path / scope …) names a
 *   fact ABOUT a credential and is public (`token_usage`, `auth_type`, `TOKEN_TTL`, `SSH_AUTH_SOCK`,
 *   `secret_scanning`, `password_policy`). Every other head keeps the old verdict — hidden (`SECRET_KEY_BASE`,
 *   `token_blob`, `auth_payload`: fail closed). r4 (α): an ADDRESS head (url / uri / endpoint) is no descriptor — a
 *   credential-named address (`AUTH_URL`, `SECRET_WEBHOOK_URL`, `token_uri`) is masked whole as on the base (a capability
 *   URL, a connection string, an encoded nested holder all ride behind it). A PUBLIC query value is judged DECODED ONCE
 *   (hidesHolder): a nested holder or a userinfo inside it ⇒ the whole value masked (fail closed, nothing re-encoded). r5: a userinfo
 *   HOLDS only when it carries a PASSWORD (`user:pw@`, `:pw@`, an empty `key:@` — HTTP Basic's API-key form); a bare `user@` is an
 *   identity (`ssh://git@github.com`) and public; the decoded value is read WHOLE (a userinfo one redirect deeper, raw or encoded,
 *   masks it). ONE decode: a doubly-encoded value (`%253Ftoken%253D…`) is read as the text one decode leaves — no head opens in it.
 *   R2b (a multi-line block), R5 and R6 keep the plain word test.
 * Every quantifier is bounded at the input bound and every run is consumed WHOLE (verify r2 F2: a cut inside a value kept
 * the value's tail past 4096 characters — a 6 KB bearer, an RSA-4096 `client-key-data`); no pass throws (a text that
 * cannot be judged is returned unchanged — never a stall, never a crash, and the caller's belt still runs).
 */
const { CREDENTIAL_WORDS } = require('./credential-words.js'); // browser-trace's list, its own module (lane device-act-audit: the device bundle carries this file)

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
      if (end > i + 1 && !(end === i + 2 && lines[i + 1].trim() === REDACTED)) { lines[i] = lines[i].replace(/\d+(?=\s*$)/, REDACTED); lines.splice(i + 1, end - (i + 1), REDACTED); n++; }   // round 22: R2b redacts the COUNT here too — else the typed-value rule leaves `Private-Lines: 2` and a second pass re-reads the count and eats the MAC line (idempotency); a re-read sees «redacted» ⇒ parseInt NaN ⇒ skip
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
// bare value to the end of its line. Round 23 (MAJOR): the `,})]` cut applies ONLY inside a JSON document (a quoted key `"name":`) and the typed-value skip ONLY under a `:` key (JSON / YAML, where a parser TYPES the scalar) — NEVER on a dotenv / shell / `--flag=value` / bare `NAME=value` line, where every value is a STRING redacted WHOLE to the line end (`DB_PASSWORD=84726193` and `DB_PASSWORD=Xy)9#kq]Lm2v` hide whole; r21/r22 ran the cut and the number rule on every head and leaked the tail / the numeric password). A space is NOT a delimiter (`Bearer abc`, `token=a ms=5` keep reading); a stored head hides more, never less
const KV_HEAD = /(^|[\s,;{(\[:/])(-{0,2})(["']?)([A-Za-z_][A-Za-z0-9_.\-]{0,80})\3([ \t]*[:=][ \t]*)/gm;   // verify r2 F4: `:` and `/` open a name too (.npmrc's `//registry…/:_authToken=<uuid>`)
/** Is the character at `i` preceded by an ODD run of backslashes (escaped)? */
function escapedAt(text, i) { let k = 0; while (i - 1 - k >= 0 && text[i - 1 - k] === '\\') k++; return k % 2 === 1; }
function redactKv(text) {
  let n = 0, out = '', last = 0, m, lineEnd = -1;
  KV_HEAD.lastIndex = 0;
  while ((m = KV_HEAD.exec(text))) {
    const headEnd = KV_HEAD.lastIndex;
    if (!holderName(m[4])) continue;                       // the next key may start right after this head; lane mask-value-shape: THE NAME GRAMMAR
    const q = text[headEnd] === '"' || text[headEnd] === "'" ? text[headEnd] : '';
    const sepColon = m[5].indexOf(':') >= 0;                        // round 23: a `:` key (JSON / YAML / a header) vs an `=` assignment (dotenv / shell / `--flag=`)
    const jsonCtx = sepColon && (m[3] === '"' || m[3] === "'");     // a QUOTED key under a `:` is a JSON document — only there does `,})]` close a bare value
    // verify r4 F4 (the census, in code): the line's end was searched from EVERY head — `token="a" token="b" …` on one line walked the
    // line once per head (quadratic by construction; the clock read ×8 only because a 64 KiB memchr lives in cache); found once per line
    if (headEnd > lineEnd) { const nl = text.indexOf('\n', headEnd); lineEnd = nl < 0 ? text.length : nl; }
    let valEnd = lineEnd;
    if (q) {   // verify r2 F5: a backslash-escaped quote inside the value does not close it (`"ab\"cd"` kept `cd"`); verify r5 F1: nor a doubled one (`'it''s'` kept `s'`)
      const close = nextClose(text, headEnd + 1, q, lineEnd);
      if (close >= 0) valEnd = close + 1;
    } else if (jsonCtx) {   // round 23 (MAJOR): a bare value closes at the first `,` `}` `]` `)` ONLY inside a JSON document (a quoted `"name":`) so a one-line JSON is never swallowed; on a dotenv / shell / `--flag=` / bare line a bare value runs WHOLE to the line end (a `)` or `,` in a password is kept hidden)
      for (let p = headEnd; p < lineEnd; p++) { const c = text.charCodeAt(p); if (c === 44 || c === 125 || c === 93 || c === 41) { valEnd = p; break; } }
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
    // round 22/23: a bare scalar a JSON/YAML parser TYPES as a boolean / number / null is NOT a secret (a secret is never `false` or `5` or `null`) — it stays, but ONLY under a `:` key (JSON / YAML), where a parser types it; under `=` (dotenv / shell / `--flag=`) EVERY value is a string, so a numeric password `DB_PASSWORD=84726193` is redacted (round 23 MAJOR). Every other value stays redacted, fail-closed (a string the parser cannot type is a secret). Only the GENERIC name-based pass reaches here — the run's own output is value-based since r21.
    // round 25 (item 4, refuted-but-real): the typed skip fires ONLY inside a document the belt can PROVE — a JSON object (a QUOTED key, jsonCtx) or an INDENTED YAML mapping entry (the key is the first token on its line, with real leading whitespace) — NEVER a lone `NAME: value`, an HTTP header (`> X-Api-Key: 84726193`), a curl -v line or prose, where a numeric secret is redacted WHOLE (daade1a7 redacted them; r22's `:`-wide skip leaked them in clear)
    const nameStart = m.index + m[1].length + m[2].length + m[3].length;
    let bp = nameStart - 1; while (bp >= 0 && (text[bp] === ' ' || text[bp] === '\t')) bp--;   // walk BACK over the indentation only (bounded — the leading whitespace run, never the whole line: linear overall, verify-r3 perf)
    const indentedYaml = sepColon && !m[3] && bp < nameStart - 1 && (bp < 0 || text[bp] === '\n');   // the key is the first token on its line AND has real indentation ⇒ a provable YAML mapping entry (a top-level / mid-line / header key is not)
    const provableTyped = jsonCtx || indentedYaml;
    if (!q && provableTyped && /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/i.test(inner)) { KV_HEAD.lastIndex = valEnd; continue; }
    n++;
    out += text.slice(last, headEnd) + (q ? q + REDACTED + q : REDACTED) + val.slice(trimmed.length);
    last = valEnd; KV_HEAD.lastIndex = valEnd;
  }
  return { text: out + text.slice(last), n };
}
// R3: an HTTP credential
const HTTP_RE = /\b(bearer[ \t]+)[A-Za-z0-9_\-.=+/]{6,65536}|\b(basic[ \t]+)[A-Za-z0-9+/]{16,65536}={0,2}/gi;   // verify r2 F2: a run is consumed WHOLE (a 6 KB bearer kept its tail past 4096)
// R4: a known prefix (the prefix stays). EVERY FAMILY ITS OWN TAIL (lane job-notify-user r6 → r7, accept-r6 confirmed 0): the
// material's own class decides where a token ends — a run ends at the first character outside ITS class (gh[pousr]_ / sk_ rk_ / hf_
// letters and digits; github_pat_ holds `_`, never `-`; xox?- holds `-`, never `_`; xoxe its own set; sk- / glpat- / vs*_ / jbt_
// both), a FIXED-length family (AKIA / ASIA 16, npm_ 36, AIza 35) ends after its length. The ONE common tail before r6
// `(?![A-Za-z0-9_\-])` failed the whole alternative when a `-` / `_` the token's class never holds came next (a job named
// «<token> deploy» is stored `<token>-deploy`: r6 moved five families and AIza / github_pat_ / xox?- stayed raw before it). And a
// token STARTS after any character that is no letter or digit — `\b` kept `ci_<token>` whole (`_` is a word character)
const PREFIX_RE = /(?<![A-Za-z0-9])(?:(?:gh[pousr]_[A-Za-z0-9]{20,255}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,255}|hf_[A-Za-z0-9]{20,255})(?![A-Za-z0-9])|(?:AKIA|ASIA)[0-9A-Z]{16}|npm_[A-Za-z0-9]{36}|AIza[0-9A-Za-z_\-]{35}|github_pat_[A-Za-z0-9_]{20,255}(?![A-Za-z0-9_])|xox[abprs]-[A-Za-z0-9\-]{10,512}(?![A-Za-z0-9\-])|xoxe[.\-][A-Za-z0-9.+/=_\-]{10,512}(?![A-Za-z0-9.+/=_\-])|(?:sk-[A-Za-z0-9_\-]{16,255}|glpat-[A-Za-z0-9_\-]{20,255}|vs(?:st|mt|wh)_[A-Za-z0-9_\-]{8,255}|vswp_[A-Za-z0-9_\-]{8,2048}|jbt_[A-Za-z0-9_\-]{8,255})(?![A-Za-z0-9_\-]))/g;
const PREFIX_HEAD = /^(github_pat_|gh[pousr]_|sk-|(?:sk|rk)_(?:live|test)_|xoxe[.\-]|xox[abprs]-|AKIA|ASIA|AIza|glpat-|npm_|hf_|vsst_|vsmt_|vswh_|vswp_|jbt_)/;
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
// R7 (inbox-verify F1): `[?&;#]name=value` — KV_HEAD's openers stop at `?` / `&` (a URL keeps its path words), so a
// query value is judged by R7: the name by THE NAME GRAMMAR, a holder's value consumed whole (lane mask-value-shape r3:
// redactQuery — the head QUERY_HEAD_RE, the value a code scan, a public name's value walked on; beside the grammar below)
// R8 (opt-in, inbox-verify F1): a maximal run of the base64 / base64url / hex class, judged in code (one linear scan)
const RUN_RE = /[A-Za-z0-9+/=_\-]{32,65536}/g;
function keyMaterial(run) {
  const core = run.replace(/=+$/, '');
  if (core.length < 32) return false;
  if (/^[0-9a-fA-F]+$/.test(core)) return /[0-9]/.test(core) && /[a-fA-F]/.test(core);
  if (!/[A-Z]/.test(core) || !/[a-z]/.test(core) || !/[0-9]/.test(core)) return false;
  return !core.split(/[/_\-+=]+/).some((w) => /^[a-z]{4,}$/.test(w));
}
// THE NAME GRAMMAR (lane mask-value-shape r2 → r4 — the header). The head = the name's last piece (split as secretName splits)
const NAME_SPLIT_RE = /[_\-.\s]+|(?<=[a-z0-9])(?=[A-Z])/;
/** A head that is a bare CONTAINER of the credential before it — the name still HOLDS one (`session_id`, `token_value`). */
const CONTAINER_HEADS = new Set(['id', 'ids', 'value', 'val', 'string', 'str', 'data', 'hash', 'hex', 'b64', 'base64', 'header', 'field', 'param', 'params']);
/** A head that DESCRIBES a credential (a fact about it, never it) — the explicit allowlist; any other head fails closed. */
// r4 (α): url / uri / endpoint are NOT descriptors — a credential-named ADDRESS (`AUTH_URL`, `SECRET_WEBHOOK_URL`, `token_uri`) is the
// credential's carrier: a capability URL, a connection string or an encoded nested holder all hide behind it, so it keeps the base's verdict
const DESCRIPTOR_HEADS = new Set(['usage', 'type', 'ttl', 'sock', 'policy', 'scanning', 'through', 'name', 'path', 'file', 'dir', 'mode', 'method', 'kind', 'count', 'len', 'length', 'size', 'expires', 'expiry', 'expiration', 'scope', 'format', 'prefix', 'version', 'enabled', 'required', 'issuer', 'audience']);
// r5 (M2 + M3): a userinfo HOLDS a secret only when it carries a PASSWORD — `scheme://user:pw@`, `scheme://:pw@`, and an EMPTY one
// `scheme://key:@` (HTTP Basic's API-key form, curl's `-u key:` — the key is the user) — and it is looked for ANYWHERE in the decoded value
// (a redirect nests one: `?next=https://a/b?r=https://u:pw@h`); a bare `user@` (`ssh://git@github.com`, `https://alice@social.example`) is
// an identity and public. One forward read: each `://` found once, its authority walked to its first `/ ? # @` or blank (≤ 1 024 — r4's
// bound, scheme 32 + userinfo 512 + slack); an authority never runs past the next `://` (its `/` ends it), so no character is read twice
const SCHEME_CH = (c) => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46;
function passwordUserinfo(d) {
  for (let from = 0, i; (i = d.indexOf('://', from)) >= 0;) {
    from = i + 3;
    if (i === 0 || !SCHEME_CH(d.charCodeAt(i - 1))) continue;                      // no scheme before it
    let colon = false;
    for (let j = from, end = Math.min(d.length, from + 1024); j < end; j++) {
      const c = d.charCodeAt(j);
      if (c === 64) { if (colon) return true; break; }                            // `@`: a password before it ⇒ a credential
      if (c === 47 || c === 63 || c === 35 || isBlankCode(c)) break;               // `/ ? #` or a blank: the authority ended, no userinfo
      if (c === 58) colon = true;
    }
  }
  return false;
}
/** Percent-decoded ONCE, tolerant: a malformed escape keeps its bytes, an ASCII one still decodes (a nested `?token=` is never hidden
 *  behind one broken `%`). Linear. */
function decodeOnce(v) {
  if (v.indexOf('%') < 0) return v;
  try { return decodeURIComponent(v); } catch { return v.replace(/%([0-7][0-9A-Fa-f])/g, (m, h) => String.fromCharCode(parseInt(h, 16))); }
}
const NAME_WORDS = new Map();   // a name's words, memoised (a name is ≤ 80 characters; the memo is bounded at 512 names)
function nameWords(k) {
  const key = String(k || ''); let words = NAME_WORDS.get(key);
  if (words) return words;
  words = key.split(NAME_SPLIT_RE).filter(Boolean).map((w) => w.toLowerCase());
  if (key.length <= 80) { if (NAME_WORDS.size >= 512) NAME_WORDS.clear(); NAME_WORDS.set(key, words); }   // a head's name (KV_HEAD / QUERY_HEAD bound it at 80)
  return words;
}
/** Does a NAME hold a secret? A credential word as its HEAD, under a CONTAINER head, or under any head the descriptor allowlist
 *  does not name (fail closed: an address — url / uri / endpoint — too, r4 α); a DESCRIPTOR head is public. Never a value's shape. */
const NAME_VERDICT = new Map();   // r4: the verdict per name, memoised beside its words (a head storm asks one name thousands of times)
function holderName(k) {
  const key = String(k || ''), known = NAME_VERDICT.get(key);
  if (known !== undefined) return known;
  const v = holderVerdict(key);
  if (key.length <= 80) { if (NAME_VERDICT.size >= 512) NAME_VERDICT.clear(); NAME_VERDICT.set(key, v); }
  return v;
}
function holderVerdict(k) {
  const words = nameWords(k);
  if (!words.some((w) => SECRET_WORDS.has(w))) return false;
  const head = words[words.length - 1];
  if (SECRET_WORDS.has(head) || CONTAINER_HEADS.has(head)) return true;
  return !DESCRIPTOR_HEADS.has(head);                                              // a head the table does not name: fail closed
}
// R7 (inbox-verify F1; lane mask-value-shape r3 — ONE linear walk): the HEAD `[?&;#]name=` is found by a bounded regex (no value
// quantifier — r2's `[closers]+$` over a 64 KiB value backtracked: 1.9 s at 60 000 dots, verify r4 F1's shape); a HOLDER's value is
// read by a code scan to the next `& # ; ' " < >` or blank and masked, a PUBLIC name's value is walked ON (the scan resumes right after
// its `=`), so a holder nested in it (`?password_reset_url=https://app/reset?token=…`) is masked and the public name stays (r3 C)
const QUERY_HEAD_RE = /([?&;#])([A-Za-z0-9_.\-\[\]%]{1,80})=(?!«)(?=[^&#;\s"'<>])/g;
const isBlankCode = (c) => (c >= 9 && c <= 13) || c === 32 || c === 0xA0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200A) || c === 0x2028 || c === 0x2029 || c === 0x202F || c === 0x205F || c === 0x3000 || c === 0xFEFF;   // `\s`'s set
// r3 (G): what the PROSE opened before the head (in its blank-free run) — a closer that ends a holder's value goes outside the mask
// ONLY when it closes one of these (the `)` of `[label](` / `(`, the `」` of `「`), or as ONE sentence-final `.` / `,` before a blank or
// the text's end; nothing else of the value is shown, and a value of closers only is masked whole
const PAIR_OPEN = '([{「『（【〔〈《', PAIR_CLOSE = ')]}」』）】〕〉》';
const OPEN_AT = new Map([...PAIR_OPEN].map((ch, i) => [ch.charCodeAt(0), i])), CLOSE_AT = new Map([...PAIR_CLOSE].map((ch, i) => [ch.charCodeAt(0), i]));
const TAIL_CLOSERS = new Set([...PAIR_CLOSE, ...'.,:!?、。，！？’”'].map((ch) => ch.charCodeAt(0)));
function proseOpens() {   // incremental, monotonic: each character of the text is read once
  const open = new Array(PAIR_OPEN.length).fill(0); let at = 0;
  return (text, to) => {
    for (; at < to; at++) {
      const c = text.charCodeAt(at);
      if (isBlankCode(c)) { open.fill(0); continue; }
      const o = OPEN_AT.get(c); if (o !== undefined) { open[o]++; continue; }
      const k = CLOSE_AT.get(c); if (k !== undefined && open[k] > 0) open[k]--;
    }
    return open.slice();
  };
}
/** How many characters at the END of a holder's value [vs, ve) belong to the prose (kept outside the mask) — a backward walk, linear. */
function queryTail(text, vs, ve, opens) {
  let i = ve - 1, k = 0;
  while (i >= vs && TAIL_CLOSERS.has(text.charCodeAt(i))) i--;
  if (i < vs) return 0;                                                         // a value of closers only: masked whole
  let j = ve - 1;
  const last = text.charCodeAt(j);
  if ((last === 46 || last === 44) && (ve >= text.length || isBlankCode(text.charCodeAt(ve)))) { k++; j--; }   // ONE sentence-final `.` / `,`
  for (; j > i; j--) { const c = CLOSE_AT.get(text.charCodeAt(j)); if (c === undefined || opens[c] <= 0) break; opens[c]--; k++; }   // the prose's own wrapper
  return k;
}
const QUERY_VALUE_RE = /[^&#;\s"'<>]{1,65536}/y;   // ONE class run, nothing after it: native and linear (no backtracking)
/** r4: does a PUBLIC value hide a holder — a nested `?name=` / `&name=` whose name HOLDS, or a userinfo — once percent-decoded?
 *  r5: a userinfo WITH A PASSWORD, anywhere in the decoded value; a nested holder head anywhere in it (the whole value read). */
const NESTED_HEAD_RE = /[?&;#]([A-Za-z0-9_.\-\[\]%]{1,80})=(?!«)(?=[^&#;\s"'<>])/g;
const ENC_HEAD_RE = /%(?:3F|26|3B|23)/i;   // an encoded `? & ; #` — the only escapes that can open a nested head once decoded
const AT_RE = /@|%40/i;                    // r5: a userinfo needs an `@`, raw or encoded — no `@`, no userinfo (and no decode for it)
function hidesHolder(value) {
  const at = AT_RE.test(value), enc = ENC_HEAD_RE.test(value);
  if (!at && !enc) return false;
  const d = decodeOnce(value);                                                     // the value read and decoded ONCE
  if (at && passwordUserinfo(d)) return true;                                      // r5: a password-carrying userinfo anywhere in it, raw or encoded
  if (!enc) return false;                                                          // no encoded head: a nested one is raw — the walk's own
  NESTED_HEAD_RE.lastIndex = 0; let n;
  while ((n = NESTED_HEAD_RE.exec(d))) if (holderName(n[1])) return true;
  return false;
}
// r4 (M4): a nested head can HOLD only where a credential word stands (holderVerdict needs one among the name's pieces) — the walk
// into a public value skips a value with none; the next word's index is found once and reused while ahead (one forward scan)
const SECRET_WORD_RE = new RegExp([...SECRET_WORDS].sort((a, b) => b.length - a.length).join('|'), 'gi');
function redactQuery(text, onMask) {
  if (text.indexOf('=') < 0) return text;
  const at = proseOpens();
  let out = '', last = 0, m, judgedTo = 0, wordAt = -1;
  const wordFrom = (i) => {
    if (wordAt >= i) return wordAt;
    SECRET_WORD_RE.lastIndex = i; const w = SECRET_WORD_RE.exec(text);
    return (wordAt = w ? w.index : Infinity);
  };
  QUERY_HEAD_RE.lastIndex = 0;
  while ((m = QUERY_HEAD_RE.exec(text))) {
    const vs = QUERY_HEAD_RE.lastIndex;
    QUERY_VALUE_RE.lastIndex = vs;
    let hold = holderName(m[2]), ve = -1;
    if (!hold && vs >= judgedTo) {                                                  // r4: the OUTERMOST public value, judged decoded once
      const v0 = QUERY_VALUE_RE.exec(text); ve = vs + (v0 ? v0[0].length : 0); judgedTo = ve;
      hold = hidesHolder(text.slice(vs, ve));
      if (!hold && wordFrom(vs) >= ve) { QUERY_HEAD_RE.lastIndex = ve; continue; }   // no credential word inside: no nested holder
    }
    if (!hold) { QUERY_HEAD_RE.lastIndex = vs; continue; }                           // public: walk on — the next head may sit inside its value
    if (ve < 0) { const v = QUERY_VALUE_RE.exec(text); ve = vs + (v ? v[0].length : 0); }
    const keep = queryTail(text, vs, ve, at(text, m.index));
    out += text.slice(last, vs) + REDACTED; last = ve - keep; onMask();
    QUERY_HEAD_RE.lastIndex = ve;
  }
  return last ? out + text.slice(last) : text;
}
// A MASKED LINK (lane mask-value-shape law 2): an address that holds a mark a belt left INSIDE it — `«redacted»` (these
// rules) or `[vault:<entry>]` (the live-value masker, src/vault-run.js) — raw, or percent-encoded as an href carries it (marked
// encodes the brackets and leaves the colon raw: both colon forms). Bounded at the vault's own entry length (440, vault-inventory
// ENTRY_RE). Its target is mangled: every surface draws it as WORDS with a note (src/lib/foryou-links.js maskedLinkNote)
const MASK_IN_LINK_RE = /«redacted»|%C2%ABredacted%C2%BB|\[vault:([^\]\[\s]{1,440})(?:\]|$)|%5Bvault(?::|%3A)((?:(?!%5[BD])[^\s\]\[]){1,440})(?:%5D|$)/gi;   // r3: a mark the token's end cut open (an entry name holding `<`) is still a mark
/** → null (no mark in it) | { shape: boolean, vault: [entry…] } — what a belt masked inside this link or path. */
function maskedLink(url) {
  const u = String(url == null ? '' : url).slice(0, INPUT_MAX);
  if (u.indexOf('redacted') < 0 && !/vault/i.test(u)) return null;
  let shape = false; const vault = [];
  for (const m of u.matchAll(MASK_IN_LINK_RE)) {
    const e = m[1] || m[2];
    if (!e) { shape = true; continue; }
    let name = e; if (m[2]) { try { name = decodeURIComponent(e); } catch { /* the raw name */ } }
    if (!vault.includes(name)) vault.push(name);
  }
  return shape || vault.length ? { shape, vault } : null;
}
const JOINER_IN_WORD_RE = /(?<=[A-Za-z0-9_.\-])[\u200C\u200D]+(?=[A-Za-z0-9_.\-])/g;
function redactSecrets(raw, { runs = false } = {}) {
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
    text = redactQuery(text, () => { n++; });   // R7 — lane mask-value-shape r3: ONE linear walk (THE NAME GRAMMAR; a public name's value walked on)
    if (runs) text = text.replace(RUN_RE, (m) => { if (!keyMaterial(m)) return m; n++; return REDACTED; });
  } catch { /* a text that cannot be judged is returned as far as it got — the caller's belt still runs */ }
  return { text, redacted: n };
}

/** lane vault-entry-description: does `raw` hold a TOKEN's shape — a PEM private-key block (R1), a JWT, a vendor-prefixed token,
 *  a key-material run (R8) — the shapes a secret IS? The keyword rules (R2 / R5 / R6: «password <word>») are NOT asked: a vault
 *  entry's description says «the router admin password for 192.168.1.1» and is no secret. Bounded like redactSecrets. → boolean. */
function hasTokenShape(raw) {
  let text = String(raw == null ? '' : raw);
  if (text.length > INPUT_MAX) text = text.slice(0, INPUT_MAX);
  if (!text) return false;
  try {
    if (redactPem(text).n || redactJwt(text).n || text.search(PREFIX_RE) >= 0) return true;   // search ignores a global regex's lastIndex
    for (const m of text.matchAll(RUN_RE)) if (keyMaterial(m[0])) return true;
  } catch { return true; }   // a text that cannot be judged is no description (fail closed)
  return false;
}

module.exports = { REDACTED, INPUT_MAX, VALUE_MAX, SECRET_WORDS, CONTAINER_HEADS, DESCRIPTOR_HEADS, secretName, holderName, maskedLink, redactSecrets, hasTokenShape };

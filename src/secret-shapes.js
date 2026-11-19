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
 *      A MESSAGE (`{ message: true }`, lane bl-msg B-3e61 + its cure — seven sightings of a lane's brief losing its rest after
 *      «session:…», «data-key=…», a flag): the masked region is the line rule's own, and inside it the message mode keeps ONLY
 *      PLAIN WORDS (messageValue): a value it does not recognise (one opening on a mark, a stop, an open pair) is the line rule;
 *      a stored head (exit, a job log) keeps the line-end extent. A KNOWN FLAG whose value is from its program's closed public list (KNOWN_FLAG_VALUES: Chrome's
 *      `--password-store=basic`) is no credential anywhere. `{ said: [] }` collects what triggered each mask (the head as written:
 *      `session:`, `Bearer`, `ghp_…`) so a sender is told what was masked, never guesses a cut
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

// lane bl-msg B-3e61: a KNOWN FLAG of a known program whose value is from its CLOSED public list — never a credential (Chrome's
// keyring choice; the seventh sighting: two lines to the coordinator cut at it). The name and the value both exact (lower-cased)
const KNOWN_FLAG_VALUES = new Map([
  ['password-store', new Set(['basic', 'gnome', 'gnome-keyring', 'gnome-libsecret', 'kwallet', 'kwallet5', 'kwallet6', 'detect'])],
]);
const FLAG_VALUE_RE = /[A-Za-z0-9][A-Za-z0-9_\-]{0,40}/y;
const FLAG_VALUE_END = new Set([...',;)]}\'"`»」）'].map((ch) => ch.charCodeAt(0)));
const FLAG_VALUE_STOP = new Set([...'.:!?'].map((ch) => ch.charCodeAt(0)));   // r2 (the read's F12): a sentence stop ends the value only before a blank or the end — `basic.x` is no closed-list value
/** Is the value at `at` (after its head) a known flag's closed-list value? → the index just past it (and its closing quote) | -1 */
function knownFlagEnd(text, name, at, q) {
  const vals = KNOWN_FLAG_VALUES.get(String(name).toLowerCase());
  if (!vals) return -1;
  FLAG_VALUE_RE.lastIndex = q ? at + 1 : at;
  const v = FLAG_VALUE_RE.exec(text); if (!v || !vals.has(v[0].toLowerCase())) return -1;
  const end = FLAG_VALUE_RE.lastIndex, c = end < text.length ? text.charCodeAt(end) : -1;
  if (q) return c === q.charCodeAt(0) ? end + 1 : -1;
  const c2 = end + 1 < text.length ? text.charCodeAt(end + 1) : -1;
  return c < 0 || isBlankCode(c) || FLAG_VALUE_END.has(c) || (FLAG_VALUE_STOP.has(c) && (c2 < 0 || isBlankCode(c2))) ? end : -1;
}
// a MESSAGE's bare value ends at a blank or at one of these (a CJK sentence's own stops — a password holds none of them)
const MESSAGE_STOPS = new Set([...'、。，；：！？「」『』（）【】《》〈〉'].map((ch) => ch.charCodeAt(0)));
// a MESSAGE's value whose first token is an HTTP auth SCHEME is a header, never prose (`Authorization: Bearer <token>`, `Digest
// username=…, response=…`): it keeps the line-end extent — one token would mask the scheme word and leave the credential after it
const AUTH_SCHEMES = new Set(['bearer', 'basic', 'digest', 'token', 'negotiate', 'ntlm', 'dpop', 'hoba', 'mutual', 'vapid', 'gnap', 'privatetoken', 'scram-sha-1', 'scram-sha-256', 'aws4-hmac-sha256', 'apikey']);
// r2 (the read's F1 / F2): a HEADER is never prose — its value runs to the line end whatever its first word (`Authorization: Bot …`,
// `Cookie: theme=dark; PHPSESSID=…` — every scheme list is open-ended, a cookie list's later names hold no credential word)
const LINE_HEADS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie']);
// the cure of batch 6 (r2): a MESSAGE keeps only PLAIN words of a masked value's region. A plain chunk = letters of any script
// (inner ' ’ - allowed) with punctuation only at its edges, at most 14 ASCII letters; judged only up to 64 characters (a longer
// chunk is never plain), so no regex ever walks a long run. A member's @ is the caller's (`mentions`: names / ids its @-scan answers to)
const PLAIN_CORE_RE = /^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u;
const PUNCT_RE = /^\p{P}$/u, UPPER_RE = /^\p{Lu}$/u, LOWER_RE = /^\p{Ll}$/u;
// r4: the PROSE edge marks a plain word may carry (a `#`, an `@`, a `$` at an edge is no prose — a member's @ is the caller's)
const PROSE_EDGE = new Set([...'.,;:!?()[]{}"\'«»“”‘’—–-…'].map((ch) => ch.charCodeAt(0)));
function plainChunk(c) {
  if (!c || c.length > 64) return false;
  let a = 0, b = c.length;
  while (a < b && (PROSE_EDGE.has(c.charCodeAt(a)) || PUNCT_RE.test(c[a]) && c.charCodeAt(a) > 0x7f)) { /*msg-step*/ a++; }
  while (b > a && (PROSE_EDGE.has(c.charCodeAt(b - 1)) || PUNCT_RE.test(c[b - 1]) && c.charCodeAt(b - 1) > 0x7f)) { /*msg-step*/ b--; }
  if (a === b) return c.length <= 3;   // a dash, an ellipsis — never a run of marks
  const core = c.slice(a, b);
  if (!PLAIN_CORE_RE.test(core)) return false;
  let up = 0, low = 0, ascii = 0;
  for (const ch of core) { /*msg-step*/ const x = ch.charCodeAt(0); if (x < 0x80) { if (x >= 65 && x <= 90) { up++; ascii++; } else if (x >= 97 && x <= 122) { low++; ascii++; } } else if (UPPER_RE.test(ch)) up++; else if (LOWER_RE.test(ch)) low++; }   // r6: the case of EVERY script's letters
  if (ascii > 14) return false;   // at most 14 ASCII letters whatever else the chunk holds
  // r4 (the read's F2): a word's own case — lowercase, Capitalized, or an acronym of at most 3 — never a mixed run (`XkQpLmWr`), in any script
  const capFirst = UPPER_RE.test(String.fromCodePoint(core.codePointAt(0)));   // r7: an astral capital is one letter
  return up === 0 || (up === 1 && capFirst) || (low === 0 && up <= 3);   // r5: an acronym of at most 3 (a 4-letter group is a key's)
}
const MSG_PAIRS = new Map([['(', ')'], ['[', ']'], ['{', '}'], ['「', '」'], ['『', '』'], ['（', '）'], ['【', '】'], ['〔', '〕'], ['〈', '〉'], ['《', '》'], ['«', '»'], ['‘', '’'], ['“', '”']]);
// r5: a chunk that already holds the mask (a second pass over a message's own output): kept when every other piece of it is plain,
// a head's name with its `:` / `=`, or a short mark run — a second pass changes nothing (the group log belts twice)
const HEAD_PIECE_RE = /^([`"'*<({\[,;]{0,3})(-{0,2})([A-Za-z_][A-Za-z0-9_.\-]{0,80})[:=]$/;   // r7: KV_HEAD's own prefix (a wrapper, dashes) allowed
const OPENER_PIECE_RE = /^[`"'*<({\[,;:\/=]{1,3}$/;   // a head's own opener, a wrapper's closing twin
function maskedChunk(c) { if (c.length > 200 || c.indexOf(REDACTED) < 0) return false; return c.split(REDACTED).every((x) => { if (!x || plainChunk(x) || OPENER_PIECE_RE.test(x)) return true; const h = HEAD_PIECE_RE.exec(x); return !!h && holderName(h[3]); }); }   // r6/r7: a head piece only when it IS a secret-named head
// cure 2 (主开发 08:42Z, MUST 1): a first chunk that opens on a LETTER or a DIGIT of any script is a value this mode recognises — it
// ends at a blank or a CJK stop like any other («session: 已修好 @beta 请验收» masks «已修好» alone); a mark, a stop or an open pair still not
const OPENS_VALUE_RE = /^[\p{L}\p{N}]/u;
const isMention = (tok, mset) => { if (!mset || tok.length > 81 || tok.charCodeAt(0) !== 64) return false; let e = tok.length; while (e > 1 && '.,;:!?'.includes(tok[e - 1])) e--; const nm = tok.slice(1, e).toLowerCase(); return nm.length > 0 && mset.has(nm); };
const EDGE_TAIL_RE = /\p{P}+$/u;
// cure 2 (MUST 1): R5's token (`password <token>`) in a message, when it opens on a MEMBER's @ — the @ to a CJK stop or a mask, spared;
// a CJK stop right after it is kept and what it glues behind is masked (B-34c8), a mask there is itself (a second pass) → null: no member's @
const MENTION_LEAD_RE = /^@[^\s«、。，；：！？「」『』（）【】《》〈〉]{1,80}/;
function mentionLead(tok, mset) {
  const at = MENTION_LEAD_RE.exec(tok), rest = at ? tok.slice(at[0].length) : '';
  if (!at || !isMention(at[0], mset)) return null;
  // B-34c8 (3): a CJK stop right after the member's @ is a separator, kept («password @beta：x» keeps its 「：」); what follows it is masked
  const stop = rest && MESSAGE_STOPS.has(rest.charCodeAt(0)) ? rest[0] : '', more = rest.slice(stop.length);
  return at[0] + stop + (!more || more === REDACTED ? more : REDACTED);
}
// r4 (the read's F1): a HEAD inside the region — KV_HEAD's own shape at a place KV_HEAD can open — ends the region there, and the main
// scan judges that head with every rule (a quoted key, a blank before `=`, a header, a credential word, a quoted value)
const HEAD_AT = /(-{0,2})(["']?)([A-Za-z_][A-Za-z0-9_.\-]{0,80})\2[ \t]*[:=]/y;
const KV_OPEN = new Set([...' \t\n\r,;{([:/=`"\'*<'].map((ch) => ch.charCodeAt(0)));
function headAt(text, p, e) { HEAD_AT.lastIndex = p; const h = HEAD_AT.exec(text); return h && HEAD_AT.lastIndex <= e && holderName(h[3]) ? h : null; }
// r4 (F2): a GROUPED secret — an app password's four groups, a TOTP key's groups: a first chunk of 4–8 of one class, then chunks of its shape
const groupOf = (c) => (/^[a-z0-9]{4,8}$/.test(c) ? `l${c.length}` : /^[A-Z0-9]{4,8}$/.test(c) ? `u${c.length}` : null);
// cure 2 (the test machine's run of the cure at dcdd8d590): a LATER chunk is of the group without its trailing prose marks — the last
// group before a comma («zwhp orlo ufnb qmjf, auth: …») stayed in clear
// B-34c8 (1): stripped only when the chunk is NO plain word («5678,» of a split code) or the group already holds two chunks («qmjf,», an
// app password's last group) — a plain word with its comma right after ONE short value is prose («session: fixed1 failed, retry»)
const groupAt = (c, n = 2) => groupOf(c.length > 16 ? '' : c) || (n >= 2 || !plainChunk(c) ? groupOf(c.length > 16 ? '' : c.replace(/[.,;:!?)\]}"'»”’…—–-]+$/, '')) : null);
// B-34c8 (2): a value of letters of other scripts only («已修好») is a word, not a credential: ASCII glued behind it through a stop is
// a new word, judged as one (the glued rule stays for a value that holds ASCII — «Q9x…，hunter»)
const OTHER_SCRIPT_RE = /^[^\x00-\x7f]{1,64}$/;
/** The message mode's rewrite of a value region [s, e) → { out, end } (end = where a head inside the region begins, else e) — or null:
 *  the LINE RULE (the region masked whole). Chunks split at blanks and CJK stops (both kept). THE FIRST CHUNK: the mask itself, or a
 *  member's @ under a `:` head, is kept; a pair closed on its line has its inside masked (the pair kept); anything opening on a mark, a
 *  stop or an open pair is no value this mode recognises ⇒ null; a chunk opening on a letter or a digit of ANY script (cure 2) is
 *  masked — and after a scheme or credential word the next chunk too, after a grouped first chunk every chunk of its group. EVERY
 *  LATER CHUNK goes through ONE judgement, `keeps` (cure 2): a MEMBER's @ is kept first (never glued, never the word after a credential
 *  word); else it is masked by the next-chunk, glued (ASCII glued to the value through a stop or a pair, no blank between; never behind a value of other scripts only — B-34c8) and group
 *  rules (`groupAt`: the chunk, or without its trailing prose marks when it is no plain word or its group holds two — B-34c8), and kept only when plainChunk. THE PIECE BEFORE AN INNER HEAD goes
 *  through `keeps` too (its own opener stays). Masked chunks that only blanks part become ONE mask. */
function messageValue(text, s, e, { sepColon = false, mentions = null, twin = '', later = false } = {}) {
  let out = '', i = s, first = !later, takeNext = false, masking = false, glued = false, group = null, groupN = 0, prose = false, prevWord = '';
  // cure 2 (主开发 08:42Z): ONE judgement of a later chunk `c` (its word `w`) — MUST 1: a MEMBER's @ is never a value, not glued, not the
  // word after a credential word; then the next-chunk, glued and group rules and a plain word — MUST 2: THE PIECE BEFORE AN INNER HEAD
  // is judged by it too («auth: password hunter,token=x» masks «hunter»)
  const keeps = (c, w) => (w.charCodeAt(0) === 64 && isMention(w, mentions)) || (!takeNext && !(glued && /^[\x00-\x7f]*$/.test(w.length <= 64 ? w : 'xĀ') && !maskedChunk(w)) && !(group && groupAt(w, groupN) === group) && (plainChunk(c) || maskedChunk(w)));
  while (i < e) {
    /*msg-step*/
    let j = i;
    while (j < e && isBlankCode(text.charCodeAt(j))) { /*msg-step*/ j++; }
    const blank = text.slice(i, j);
    if (blank) glued = false;
    if (j >= e) { out += blank; break; }
    const pair = first && !text.startsWith(REDACTED, j) ? MSG_PAIRS.get(text[j]) : null;   // the mask itself opens on « too
    if (pair) {   // a value wrapped in a pair CLOSED on its line: its inside is the value (all of it masked), the pair kept; open ⇒ the line rule
      if (text.startsWith(REDACTED + pair, j + 1)) { out += blank + text.slice(j, j + 2 + REDACTED.length); i = j + 2 + REDACTED.length; first = false; glued = true; continue; }   // a masked pair: itself
      let ce = -1;
      for (let x = j + 1; x < e; x++) { /*msg-step*/ if (text[x] === pair) { ce = x; break; } }
      if (ce < 0) return null;
      out += blank + text[j] + REDACTED + pair; i = ce + 1; first = false; masking = false; glued = true; continue;
    }
    if (MESSAGE_STOPS.has(text.charCodeAt(j))) { if (first) return null; if (text[j] === '：' && prevWord && holderName(prevWord)) takeNext = true; out += blank + text[j]; masking = false; i = j + 1; continue; }   // a CJK stop is a separator, kept (r5: a full-width colon after a holder word is a head — its value is next)
    let k = j;
    while (k < e && !isBlankCode(text.charCodeAt(k)) && !MESSAGE_STOPS.has(text.charCodeAt(k))) { /*msg-step*/ k++; }
    if (!first && !later) {   // a head inside the region ends it: the main scan takes it from there
      for (let p = j; p < k; p++) { /*msg-step*/ const pc = p === j ? (blank ? 32 : -1) : text.charCodeAt(p - 1); if (KV_OPEN.has(pc) && headAt(text, p, e)) { if (p > j) { const pre = text.slice(j, p); let t = pre.length; while (t > 0 && pre.length - t < 3 && KV_OPEN.has(pre.charCodeAt(t - 1))) { /*msg-step*/ t--; } const w = pre.slice(0, t); out += blank + (OPENER_PIECE_RE.test(pre) || !w || keeps(pre, w) ? pre : REDACTED + pre.slice(t)); } else out += blank; return { out, end: p }; } }
    }
    let chunk = text.slice(j, k), tail = '';
    if (first && twin) { let t = chunk.length; while (t > 1 && chunk[t - 1] === twin) { /*msg-step*/ t--; } tail = chunk.slice(t); chunk = chunk.slice(0, t); }
    let keep = false;
    if (first) {
      if (chunk === REDACTED) keep = true;
      else if (sepColon && isMention(chunk, mentions)) keep = true;
      else if (!OPENS_VALUE_RE.test(chunk)) return null;   // THE LAW: an opener with no rule here ⇒ the line rule (cure 2: a letter or a digit of any script is one)
      const w = chunk.length <= 40 ? chunk.replace(EDGE_TAIL_RE, '').toLowerCase() : '';
      takeNext = !keep && (AUTH_SCHEMES.has(w) || SECRET_WORDS.has(w));
      group = keep ? null : groupOf(chunk); groupN = group ? 1 : 0;
      glued = !keep; prose = !keep && OTHER_SCRIPT_RE.test(chunk);
    } else {
      keep = keeps(chunk, chunk);
      if (takeNext && !group) { group = groupOf(chunk); groupN = 0; }   // r5: a group seeded by the value after a credential word too
      if (group && groupAt(chunk, groupN) === group) groupN++; else { group = null; groupN = 0; }
      // a head glued behind a CJK stop (no opener the main scan reads): its value is the next chunk
      takeNext = chunk.length <= 82 && (((chunk.endsWith(':') || chunk.endsWith('=')) && holderName(chunk.slice(0, -1).replace(/^[^A-Za-z_]+/, ''))) || ((chunk === ':' || chunk === '=') && !!prevWord && holderName(prevWord)));
      prevWord = chunk.length <= 82 ? chunk.replace(/^[^A-Za-z_]+|[^A-Za-z0-9_]+$/g, '') : '';   // r8 (the test machine's first corpus run): the last WORD seen, masked or kept — «…，password : x» masks x
    }
    first = false;
    if (keep) { out += blank + chunk + tail; masking = false; glued = false; }
    else if (masking && !tail) { glued = true; /* joins the running mask */ }
    else { out += blank + REDACTED + tail; masking = !tail; glued = !prose; }
    prose = false;
    i = k;
  }
  return { out, end: e };
}
const SAID_MAX = 9, SAID_LEN = 60;   // r2 (F9): one past what the answer shows — the ninth says «and more»
/** the `said` collector: each trigger once, at most SAID_MAX, each at most SAID_LEN characters; null when nobody asked */
function sayer(said) {
  if (!Array.isArray(said)) return null;
  return (w) => { const t = String(w == null ? '' : w).trim().slice(0, SAID_LEN); if (t && said.length < SAID_MAX && !said.includes(t)) said.push(t); };
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
function redactPem(text, say) {
  if (text.indexOf('PRIVATE KEY') < 0) return { text, n: 0 };
  const lines = text.split('\n'); const out = []; let n = 0, inside = false;
  for (const l of lines) {
    if (!inside) { out.push(l); if (pemLine(l, 'BEGIN')) { inside = true; out.push(REDACTED); n++; if (say) say('a PRIVATE KEY block'); } continue; }
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
function redactContinuations(text, say) {
  if (!CONT_ANY_RE.test(text) && !/private-lines/i.test(text)) return { text, n: 0 };
  const lines = text.split('\n'); let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = CONT_HEAD.exec(lines[i]); if (!m) continue;
    const name = m[4], val = m[5].trim();
    if (/^private-lines$/i.test(name)) {
      const cnt = parseInt(val, 10); if (!(cnt > 0)) continue;
      const end = Math.min(lines.length, i + 1 + Math.min(cnt, 100000));
      if (end > i + 1 && !(end === i + 2 && lines[i + 1].trim() === REDACTED)) { lines[i] = lines[i].replace(/\d+(?=\s*$)/, REDACTED); lines.splice(i + 1, end - (i + 1), REDACTED); n++; if (say) say(name + ':'); }   // round 22: R2b redacts the COUNT here too — else the typed-value rule leaves `Private-Lines: 2` and a second pass re-reads the count and eats the MAC line (idempotency); a re-read sees «redacted» ⇒ parseInt NaN ⇒ skip
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
    if (any) { n++; if (say) say(name + ':'); }
  }
  return { text: lines.join('\n'), n };
}
// R2: `NAME = value` / `NAME: value` / `"name": "value"` / `--name=value` — the HEAD is matched, the value's extent is
// decided in code (a regex that consumed the value either stopped a bare value at a space — `Authorization: Bearer
// abc` kept `abc` — or swallowed the next key of `a=1 token=x`): a quoted value to its closing quote on the line, a
// bare value to the end of its line. Round 23 (MAJOR): the `,})]` cut applies ONLY inside a JSON document (a quoted key `"name":`) and the typed-value skip ONLY under a `:` key (JSON / YAML, where a parser TYPES the scalar) — NEVER on a dotenv / shell / `--flag=value` / bare `NAME=value` line, where every value is a STRING redacted WHOLE to the line end (`DB_PASSWORD=84726193` and `DB_PASSWORD=Xy)9#kq]Lm2v` hide whole; r21/r22 ran the cut and the number rule on every head and leaked the tail / the numeric password). A space is NOT a delimiter (`Bearer abc`, `token=a ms=5` keep reading); a stored head hides more, never less
const KV_HEAD = /(^|[\s,;{(\[:/=`"'*<])(-{0,2})(["']?)([A-Za-z_][A-Za-z0-9_.\-]{0,80})\3([ \t]*[:=][ \t]*)/gm;   // lane bl-msg B-be02 r2: `=` and a prose wrapper (` " ' * <) open a name too — «`DB_PASSWORD=…`», «--set-env-vars=API_KEY=…»
const OPENER_TWIN = new Map([['`', '`'], ['"', '"'], ["'", "'"], ['*', '*'], ['<', '>']]);   // B-be02 r2: in a message the wrapper's closing twin stays the prose's   // verify r2 F4: `:` and `/` open a name too (.npmrc's `//registry…/:_authToken=<uuid>`)
/** Is the character at `i` preceded by an ODD run of backslashes (escaped)? */
function escapedAt(text, i) { let k = 0; while (i - 1 - k >= 0 && text[i - 1 - k] === '\\') k++; return k % 2 === 1; }
function redactKv(text, { message = false, say = null, mentions = null } = {}) {
  let n = 0, out = '', last = 0, m, lineEnd = -1;
  // the cure r5 (the read's F2): a bare value's region (what the line rule hides) is JUDGED to its end even when a head inside it ends
  // the region early and that head's own rule ends sooner (a closed quote, a JSON closer, a typed scalar, a flag): the text between is
  // filtered by the plain-words rule before it is copied (`filterTo` = the furthest region end so far)
  let filterTo = -1, filterHead = '';
  const emitGap = (to) => {
    if (!message || last >= filterTo || to <= last) return;
    const g = Math.min(to, filterTo), raw = text.slice(last, g), fv = messageValue(text, last, g, { later: true, mentions });
    if (fv && fv.out !== raw) { out += fv.out; n++; if (say && filterHead) say(filterHead); } else out += raw;   // cure 2: the gap's mask is named (the region's head)
    last = g;
  };
  KV_HEAD.lastIndex = 0;
  while ((m = KV_HEAD.exec(text))) {
    const headEnd = KV_HEAD.lastIndex;
    // lane bl-msg B-be02: a PUBLIC head gives back its trailing BLANKS — the NEXT name's opener — so «A prose line: API_KEY=…»
    // and «set it so: DB_PASSWORD=…» judge the second name (its opener was eaten as the first one's separator: 0 redactions on the
    // release). Never its `:`: a vault mark `[vault:apikey:k]` would open `apikey:` and lose its entry; every holder path sets lastIndex itself
    const bl = m[5].length - m[5].trimEnd().length;
    KV_HEAD.lastIndex = headEnd - (bl || (m[5].endsWith('=') ? 1 : 0));   // r2: a bare `=` is given back (an opener now) — never a `:`
    if (!holderName(m[4])) continue;                       // the next key may start right after this head; lane mask-value-shape: THE NAME GRAMMAR
    const q = text[headEnd] === '"' || text[headEnd] === "'" ? text[headEnd] : '';
    const flagEnd = knownFlagEnd(text, m[4], headEnd, q);           // lane bl-msg B-3e61: a known flag's closed-list value is public — walk on past it
    if (flagEnd >= 0) { if (message) { emitGap(m.index + m[1].length); out += text.slice(last, flagEnd); last = flagEnd; } KV_HEAD.lastIndex = flagEnd; continue; }   // r7: copied as it is (a known flag's value is no secret)
    const sepColon = m[5].indexOf(':') >= 0;                        // round 23: a `:` key (JSON / YAML / a header) vs an `=` assignment (dotenv / shell / `--flag=`)
    const jsonCtx = sepColon && (m[3] === '"' || m[3] === "'");     // a QUOTED key under a `:` is a JSON document — only there does `,})]` close a bare value
    // verify r4 F4 (the census, in code): the line's end was searched from EVERY head — `token="a" token="b" …` on one line walked the
    // line once per head (quadratic by construction; the clock read ×8 only because a 64 KiB memchr lives in cache); found once per line
    if (headEnd > lineEnd) { const nl = text.indexOf('\n', headEnd); lineEnd = nl < 0 ? text.length : nl; }
    let valEnd = lineEnd, closed = false;
    if (q) {   // verify r2 F5: a backslash-escaped quote inside the value does not close it (`"ab\"cd"` kept `cd"`); verify r5 F1: nor a doubled one (`'it''s'` kept `s'`)
      const close = nextClose(text, headEnd + 1, q, lineEnd);
      if (close >= 0) { valEnd = close + 1; closed = true; }
    } else if (jsonCtx) {   // round 23 (MAJOR): a bare value closes at the first `,` `}` `]` `)` ONLY inside a JSON document (a quoted `"name":`) so a one-line JSON is never swallowed; on a dotenv / shell / `--flag=` / bare line a bare value runs WHOLE to the line end (a `)` or `,` in a password is kept hidden)
      for (let p = headEnd; p < lineEnd; p++) { const c = text.charCodeAt(p); if (c === 44 || c === 125 || c === 93 || c === 41) { valEnd = p; break; } }
    }
    // lane bl-msg B-3e61 (seven sightings): in a MESSAGE a bare (or never-closed quoted) value is ONE token — past the blanks a head
    // left, to the next blank or CJK stop — and the rest of the line stays the reader's; a closer the prose opened before the head
    // (`[data-key=…]`, `(token=…)`) and ONE sentence-final `.` / `,` stay outside the mask (R7's queryTail). One forward scan
    // r2 (the adversarial read): a HEADER keeps the line end (LINE_HEADS, F1 / F2); a first token that opens a key block
    // (`-----BEGIN …` flattened onto one line, F3) keeps the line end; a first token that is a SCHEME or a CREDENTIAL word
    // (`auth: password hunter2`, `token: Bearer …`, F4) takes the NEXT token with it — the rule after it would have read it —
    // never the line end (`auth: token rotation is broken, …` keeps its rest, F6); a token that is a MENTION (`@beta`) is never
    // a value (F7: the @-scan reads the kept words)
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
    if (!inner || inner === REDACTED) { if (message) { emitGap(m.index + m[1].length); out += text.slice(last, valEnd); last = valEnd; } KV_HEAD.lastIndex = headEnd; continue; }   // r7: a head whose value is the mask already is copied as it is (a second pass)
    // round 22/23: a bare scalar a JSON/YAML parser TYPES as a boolean / number / null is NOT a secret (a secret is never `false` or `5` or `null`) — it stays, but ONLY under a `:` key (JSON / YAML), where a parser types it; under `=` (dotenv / shell / `--flag=`) EVERY value is a string, so a numeric password `DB_PASSWORD=84726193` is redacted (round 23 MAJOR). Every other value stays redacted, fail-closed (a string the parser cannot type is a secret). Only the GENERIC name-based pass reaches here — the run's own output is value-based since r21.
    // round 25 (item 4, refuted-but-real): the typed skip fires ONLY inside a document the belt can PROVE — a JSON object (a QUOTED key, jsonCtx) or an INDENTED YAML mapping entry (the key is the first token on its line, with real leading whitespace) — NEVER a lone `NAME: value`, an HTTP header (`> X-Api-Key: 84726193`), a curl -v line or prose, where a numeric secret is redacted WHOLE (daade1a7 redacted them; r22's `:`-wide skip leaked them in clear)
    const nameStart = m.index + m[1].length + m[2].length + m[3].length;
    let bp = nameStart - 1; while (bp >= 0 && (text[bp] === ' ' || text[bp] === '\t')) bp--;   // walk BACK over the indentation only (bounded — the leading whitespace run, never the whole line: linear overall, verify-r3 perf)
    const indentedYaml = sepColon && !m[3] && bp < nameStart - 1 && (bp < 0 || text[bp] === '\n');   // the key is the first token on its line AND has real indentation ⇒ a provable YAML mapping entry (a top-level / mid-line / header key is not)
    const provableTyped = jsonCtx || indentedYaml;
    if (!q && provableTyped && /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/i.test(inner)) { KV_HEAD.lastIndex = valEnd; continue; }
    // THE LAW (主开发, the cure of batch 6, r2): in a MESSAGE the value's region is the line rule's own (to the line end, or a JSON
    // closer); inside it the message mode KEEPS ONLY PLAIN WORDS — the first chunk is always masked (but the mask itself and a
    // member's @ under a `:` head), a scheme or credential first chunk masks the next one too, and every later chunk that is not a
    // plain word is masked. Chunks split at blanks and CJK stops (kept as they are). So it never keeps a secret-shaped token the line
    // rule hid, wherever it sits — after a stop, a bracket, a mention, a plain word. A quoted value, a header, a typed scalar: the line rule
    if (message && !q && !LINE_HEADS.has(String(m[4]).toLowerCase())) {
      const mv = messageValue(text, headEnd, valEnd, { sepColon, mentions, twin: OPENER_TWIN.get(m[1]) || '' });
      if (mv !== null) {   // null: no value this mode recognises — the line rule below; mv.end: a head inside the region begins there
        const resume = mv.end < valEnd ? mv.end - 1 : mv.end;   // a head inside the region: the scan resumes on its opener (KV_HEAD's own)
        emitGap(m.index + m[1].length);
        if (valEnd > filterTo) { filterTo = valEnd; filterHead = text.slice(nameStart - m[2].length - m[3].length, headEnd).trim(); }
        if (mv.out === text.slice(headEnd, mv.end)) { out += text.slice(last, mv.end); last = mv.end; KV_HEAD.lastIndex = resume; continue; }   // nothing to hide (a member's @, the mask itself) — copied as it is, so no later gap re-reads it (r6)
        n++;
        out += text.slice(last, headEnd) + mv.out;
        last = mv.end; KV_HEAD.lastIndex = resume;
        if (say) say(text.slice(nameStart - m[2].length - m[3].length, headEnd).trim());
        continue;
      }
    }
    emitGap(m.index + m[1].length);   // the cure r5: what a region before this head left is judged first (message mode only)
    n++;
    out += text.slice(last, headEnd) + (q ? q + REDACTED + q : REDACTED) + val.slice(trimmed.length);
    last = valEnd; KV_HEAD.lastIndex = valEnd;
    if (say) say(text.slice(nameStart - m[2].length - m[3].length, headEnd).trim());   // lane bl-msg B-3e61: the head as written
  }
  emitGap(text.length);
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
    out += text.slice(last, vs) + REDACTED; last = ve - keep; onMask(`${m[1]}${m[2]}=`);
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
function redactSecrets(raw, { runs = false, message = false, said = null, mentions = null } = {}) {
  let text = String(raw == null ? '' : raw);
  if (text.length > INPUT_MAX) text = text.slice(0, INPUT_MAX);
  if (!text) return { text, redacted: 0 };
  if (text.includes('\u200C') || text.includes('\u200D')) text = text.replace(JOINER_IN_WORD_RE, '');
  let n = 0;
  const say = sayer(said);   // lane bl-msg B-3e61: what triggered each mask, for the sender (only when a caller asks)
  try {
    const pem = redactPem(text, say); text = pem.text; n += pem.n;
    const cont = redactContinuations(text, say); text = cont.text; n += cont.n;   // verify r2 F3: before R2 (R2 then hides the head's own value)
    const mset = message && mentions ? new Set([...(mentions instanceof Set ? mentions : Array.isArray(mentions) ? mentions : [])].map((x) => String(x).toLowerCase()).filter(Boolean)) : null;   // the cure: a member's @ only
    const kv = redactKv(text, { message: !!message, say, mentions: mset && mset.size ? mset : null }); text = kv.text; n += kv.n;
    text = text.replace(REG_RE, (m, ind, name, sep) => { if (!REG_NAME_RE.test(name)) return m; n++; if (say) say(name); return `${ind}${name}${sep}${REDACTED}`; });   // verify r4 F7: before R5
    text = text.replace(HTTP_RE, (m, bearer, basic) => { n++; if (say) say(bearer || basic); return `${bearer || basic}${REDACTED}`; });
    const jwt = redactJwt(text); text = jwt.text; n += jwt.n; if (say && jwt.n) say('a JWT (eyJ…)');   // verify r4 F3: the JWT scan, before the bounded prefixes
    text = text.replace(PREFIX_RE, (m) => { n++; const h = PREFIX_HEAD.exec(m); if (say) say(`${h ? h[1] : ''}…`); return `${h ? h[1] : ''}${REDACTED}`; });
    text = text.replace(WORD_NEXT_RE, (m, w, sp) => { const tok = m.slice(w.length + sp.length), ml = mset && mentionLead(tok, mset); if (ml === tok) return m; n++; if (say) say(w); return `${w}${sp}${ml || REDACTED}`; });   // cure 2 (MUST 1): a MEMBER's @ is spared (the caller's set, a message only)
    text = text.replace(WORD_RUN_RE, (m, w, sp) => { n++; if (say) say(w); return `${w}${sp}${REDACTED}`; });
    text = redactQuery(text, (head) => { n++; if (say) say(head); });   // R7 — lane mask-value-shape r3: ONE linear walk (THE NAME GRAMMAR; a public name's value walked on)
    if (runs) text = text.replace(RUN_RE, (m) => { if (!keyMaterial(m)) return m; n++; if (say) say('a key-material run'); return REDACTED; });
  } catch { if (message) return redactSecrets(raw, { runs, said });   /* the cure r5: a message mode that fails is the line rule, never a partial text */ /* a text that cannot be judged is returned as far as it got — the caller's belt still runs */ }
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

module.exports = { REDACTED, INPUT_MAX, VALUE_MAX, SECRET_WORDS, CONTAINER_HEADS, DESCRIPTOR_HEADS, KNOWN_FLAG_VALUES, secretName, holderName, maskedLink, redactSecrets, hasTokenShape };

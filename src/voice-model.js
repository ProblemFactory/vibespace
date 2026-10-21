'use strict';
// PURE (imports only the PURE note module's compaction-summary rule; CJS so the bundle and the server share it) — Dropline voice input, P0 (design q-029,
// docs/design-dropline-voice: §3 the per-dictation context, §5 the words, D5 the gesture's numbers).
//   dictationContext(parts) → the `context` part of ONE dictation (≤ 4 KB, used for that dictation only). Owner
//     2026-10-12 override of §3 `text`: the LAST ≤ 6 user + agent TEXT messages in order (agent head-clipped to
//     400 chars, user whole up to 300), then the working directory's name, then ≤ 20 file names / identifiers seen
//     in those messages — one line each, the whole `text` ≤ 1 500 chars.
//   NEVER in a context: tool calls / tool results / thinking / system cards / hook frames (dictationMessagesOf keeps
//     TEXT blocks of user + assistant rows only, stripFrames drops <system-reminder>-style frames), compaction
//     summaries (the user record the chat draws as a system card — THE chat's own isCompactSummaryText), credentials and
//     env assignments, e-mail addresses (scrubSecrets), other conversations (only the messages handed in).
//   voiceWords(code) → the ONE sentence a failure (or the chip) says; English is the i18n key, zh/ja live in
//     src/lib/i18n-{zh,ja}.js. dictateRequestOf / DICTATE_PART_ORDER = the vendor's multipart contract.

const { isCompactSummaryText } = require('./assistant-note.js'); // PURE → PURE (voice-verify F1): the chat's own summary rule

const VOICE_LIMITS = Object.freeze({
  maxBytes: 8 * 1024 * 1024, maxSeconds: 180, autoStopSeconds: 170, perMinute: 20, bitsPerSecond: 32000,
  contextBytes: 4096, textChars: 1500, titleChars: 200, beforeChars: 1000, afterChars: 500, selectedChars: 2000,
  agentChars: 400, userChars: 300, messages: 6, idents: 20, chipMs: 5000, keepBlobMs: 60000,
});
const LANGUAGES = Object.freeze(['auto', 'zh', 'en']);
const DICTATE_PART_ORDER = Object.freeze(['request', 'context', 'audio']); // the documented order (§4.1)
const RECORDER_MIME = 'audio/webm;codecs=opus';

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const head = (s, n) => (s.length > n ? s.slice(0, n) : s);
const tail = (s, n) => (s.length > n ? s.slice(s.length - n) : s);

// <system-reminder>…</system-reminder>, <vibespace-task-context>…, <command-name>…, <local-command-stdout>… — any
// hyphenated tag pair a harness or a hook wraps around text it injected; an unclosed opener drops to the end.
const FRAME_RE = /<((?:[a-z]+-)+[a-z]+)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi;
function stripFrames(text) {
  let s = str(text), prev;
  do { prev = s; s = s.replace(FRAME_RE, ''); } while (s !== prev);
  return s.replace(/\n{3,}/g, '\n\n'); // never trimmed here: a trailing space before the cursor is context
}

const SECRET_RES = [                                                // order matters: whole assignments first
  /\b[A-Z][A-Z0-9_]{2,}=\S*/g,                                       // KEY=value env assignments
  /\b(?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*\S+/gi,   // key: value spellings
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,                             // auth headers
  /\b(?:dl|sk|pk|rk|ghp|gho|xox[abpr]|AKIA|AIza)[_-]?[A-Za-z0-9_-]{12,}/g, // vendor key shapes
  /\bgithub_pat_[A-Za-z0-9_]{20,}|\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g,     // a fine-grained GitHub token, a JWT (voice-verify F8)
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,                                   // e-mail addresses
];
function scrubSecrets(text) {
  let s = str(text);
  for (const re of SECRET_RES) s = s.replace(re, '');
  return s;
}

/** The conversation's normalized messages → [{role:'user'|'agent', text}] — TEXT blocks of user/assistant rows
 *  only (a tool call, a tool result, thinking, an image, a system card carries no text block of its own); a compaction
 *  summary is a user TEXT block the chat draws as a system card — dropped by the chat's own rule. */
function dictationMessagesOf(messages) {
  const out = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'agent')) continue;
    const blocks = Array.isArray(m.content) ? m.content : (typeof m.text === 'string' ? [{ type: 'text', text: m.text }] : []);
    const raw = blocks.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
    if (m.role === 'user' && isCompactSummaryText(raw)) continue;
    const text = stripFrames(raw).trim();
    if (text) out.push({ role: m.role === 'user' ? 'user' : 'agent', text });
  }
  return out;
}

const IDENT_RE = /\b(?:[\w.-]+\/)*[\w-]+\.(?:[a-z][a-z0-9]{0,4})\b|\b[a-z]+(?:[A-Z][a-z0-9]*)+\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b|\b[a-z0-9]+(?:_[a-z0-9]+)+\b/g;
/** ≤ `max` distinct file names / identifiers (camelCase, PascalCase, snake_case, name.ext) in order of first sight. */
function identifiersOf(texts, max = VOICE_LIMITS.idents) {
  const seen = new Set();
  for (const t of texts) {
    for (const m of str(t).match(IDENT_RE) || []) {
      const w = m.includes('/') ? m.slice(m.lastIndexOf('/') + 1) : m;
      if (w.length < 3 || /^\d/.test(w) || /^(?:e\.g|i\.e|etc)\b/i.test(w)) continue;
      seen.add(w);
      if (seen.size >= max) return [...seen];
    }
  }
  return [...seen];
}

const baseName = (cwd) => { const s = str(cwd).replace(/[\\/]+$/, ''); return s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1); };

/** `text` = the last ≤ 6 messages (one line each, newest kept first when the 1 500 budget binds), the cwd name,
 *  the identifiers line. */
function contextText({ messages = [], cwd = '' } = {}) {
  const L = VOICE_LIMITS;
  const msgs = dictationMessagesOf(messages).slice(-L.messages).map((m) => ({
    role: m.role,
    text: scrubSecrets(m.role === 'agent' ? head(m.text, L.agentChars) : head(m.text, L.userChars)).replace(/\s+/g, ' ').trim(),
  })).filter((m) => m.text);
  const dir = scrubSecrets(baseName(cwd));
  const ids = identifiersOf(msgs.map((m) => m.text)).join(' ');
  const tailLines = [dir, ids].filter(Boolean).map((l) => head(l, 400));
  let room = L.textChars - tailLines.reduce((n, l) => n + l.length + 1, 0);
  const lines = [];
  for (let i = msgs.length - 1; i >= 0 && room > 0; i--) {
    let line = `${msgs[i].role === 'user' ? 'user' : 'agent'}: ${msgs[i].text}`;
    if (line.length + 1 > room) line = head(line, room - 1);
    if (!line) break;
    lines.unshift(line);
    room -= line.length + 1;
  }
  return [...lines, ...tailLines].join('\n').slice(0, L.textChars);
}

/** the text before the cursor: its last 1 000 chars, cut forward to a sentence boundary when one is near. */
function beforeOf(text) {
  const s = str(text);
  if (s.length <= VOICE_LIMITS.beforeChars) return s;
  const t = tail(s, VOICE_LIMITS.beforeChars);
  const m = /[.!?。！？\n]\s*/.exec(t.slice(0, 200));
  return m ? t.slice(m.index + m[0].length) : t;
}

const utf8Bytes = (s) => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
const contextBytes = (ctx) => utf8Bytes(JSON.stringify(ctx));

/** THE per-dictation context (§3 + the owner's `text` override). PURE; the hub runs it again on what a browser sent. */
function dictationContext({ title, before, after, selected, messages, cwd, text } = {}) {
  const L = VOICE_LIMITS;
  const ctx = { app: 'VibeSpace' };
  const put = (k, v) => { const s = scrubSecrets(stripFrames(v)); if (s) ctx[k] = s; };
  put('title', head(str(title), L.titleChars));
  put('before', beforeOf(before));
  put('after', head(str(after), L.afterChars));
  put('selected', head(str(selected), L.selectedChars));
  const t = text != null && messages == null ? head(scrubSecrets(stripFrames(text)), L.textChars) : contextText({ messages, cwd });
  if (t) ctx.text = t;
  // the 4 KB whole: shrink the longest shrinkable field by a fifth until it fits (CJK = 3 bytes a char)
  for (let guard = 0; contextBytes(ctx) > L.contextBytes && guard < 200; guard++) {
    const k = ['text', 'before', 'selected', 'after', 'title'].filter((f) => ctx[f]).sort((a, b) => ctx[b].length - ctx[a].length)[0];
    if (!k) break;
    const keep = Math.floor(ctx[k].length * 0.8);
    ctx[k] = k === 'before' ? tail(ctx[k], keep) : head(ctx[k], keep);
    if (!ctx[k]) delete ctx[k];
  }
  return ctx;
}

/** The hub's re-cut of whatever a browser sent as `ctx` (a string or an object): only the §3 keys survive, each
 *  through the same clip rules; anything unparseable is no context at all. */
function contextFromClient(raw) {
  let o = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return { app: 'VibeSpace' }; } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { app: 'VibeSpace' };
  return dictationContext({ title: o.title, before: o.before, after: o.after, selected: o.selected, text: str(o.text) });
}

const localeOf = (uiLang) => ({ zh: 'zh-CN', ja: 'ja-JP' }[str(uiLang).slice(0, 2).toLowerCase()] || 'en-US');
const languageOf = (pref) => (LANGUAGES.includes(pref) ? pref : 'auto');
/** the `request` part (§4.1): P0 = dictate into the chat box — a multi-line field. */
const dictateRequestOf = ({ language, uiLang } = {}) => ({ mode: 'dictate', language: languageOf(language), locale: localeOf(uiLang), single_line: false });

/** the vendor's answer → what the hub hands the browser: {text, rewrite, language, request_id}. */
function dictateAnswerOf(body) {
  const b = body && typeof body === 'object' ? body : {};
  return {
    text: str(b.final_text),
    rewrite: { status: str(b.rewrite && b.rewrite.status) || null, reason: (b.rewrite && b.rewrite.reason) || null },
    language: (b.transcript && b.transcript.language) || null,
    request_id: str(b.request_id) || null,
  };
}

const RETRY_ONCE = Object.freeze([502, 503, 504]);
/** an HTTP status (+ the vendor's error code) → the words code the browser shows. */
function failureCodeOf(status, vendorCode) {
  if (status === 423) return 'vault-locked';   // the hub's own answer: the vault keeps the sign-in closed (never a vendor's)
  if (status === 401 || status === 403) return 'reconnect';
  if (status === 413) return 'too-long';
  if (status === 422 && vendorCode === 'audio_invalid') return 'audio-invalid';
  if (status === 429) return 'rate-limited';
  return 'failed';
}

// §5 — every sentence a press can end in. `action`: what the chip's button does (null = none).
const VOICE_WORDS = Object.freeze({
  insecure: { words: 'This page is not https, so the browser gives it no microphone — open it over https, or on this computer at {url}', action: 'copy-url' },
  denied: { words: 'The browser refused the microphone — allow it in the site permissions in the address bar', action: null },
  'no-mic': { words: 'No microphone was found on this device', action: null },
  'not-connected': { words: 'Connect your Dropline first', action: 'open-plugin' },
  'vault-locked': { words: 'The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)', action: 'unlock' },   // lane vault-e2e-password-fix-r2: the sealed sign-in
  'plugin-off': { words: 'Voice input is turned off — turn it on in Plugins', action: 'open-plugin' },
  reconnect: { words: 'Your Dropline sign-in has expired — connect it again', action: 'open-plugin' },
  'rate-limited': { words: 'Dropline is rate limiting — try again in {n} s', action: null },
  'too-long': { words: 'A recording can be at most 180 seconds and 8 MB', action: null },
  'auto-stopped': { words: 'Stopped at 170 seconds — a recording can be at most 180 seconds', action: null },
  'audio-invalid': { words: 'The recording could not be read — try again', action: null },
  failed: { words: 'Recognition failed this time — try again', action: null },
  offline: { words: 'It was not sent — the recording is kept, press again to resend', action: 'resend' },
  inserted: { words: 'Inserted', action: 'undo' },
  'raw-inserted': { words: 'Inserted as spoken (Dropline did not rewrite it)', action: 'undo' },
  listening: { words: 'Listening…', action: null },
  waiting: { words: 'Recognizing…', action: null },
});
const VOICE_CODES = Object.freeze(Object.keys(VOICE_WORDS));
function voiceWords(code, params = {}) {
  const row = VOICE_WORDS[code] || VOICE_WORDS.failed;
  return { code: VOICE_WORDS[code] ? code : 'failed', words: row.words, action: row.action, params };
}

// ── P1 teach (lane voice-p1-oauth-teach; owner 2026-10-12: nothing is written to Dropline without the person's press) ──
const TEACH_TEXT_MAX = 6000;                                       // /v1/context text (design §4)
const TERM_MAX = 60;
const NOT_A_FILE_RE = /\.(?:com|org|net|io|dev|app|ai|cn|jp|co|me|us|uk|de|fish)$/i; // host names are not file names
/** a term's kind: `file` (name.ext) | `ident` (camelCase / PascalCase / snake_case) | `name` (anything else, e.g. a
 *  Task Group name) — the per-project tier sends only `file` + `ident` without a card */
function termKind(term) {
  const w = str(term);
  if (/^[\w-]+\.[a-z][a-z0-9]{0,4}$/.test(w) && !NOT_A_FILE_RE.test(w)) return 'file';
  if (/^(?:[a-z]+(?:[A-Z][a-z0-9]*)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+|[a-z0-9]+(?:_[a-z0-9]+)+)$/.test(w)) return 'ident';
  return 'name';
}
/** PURE `termsOf` — the words worth proposing for the person's Dropline dictionary from THIS conversation: its text
 *  messages (frames stripped, secrets / e-mails scrubbed — the never-list), the file names it names (`files`), the
 *  Task Group name; minus `known` (the dictionary, GET /v1/vocabulary — case-insensitive), distinct, ≤ `max`. */
function termsOf({ messages = [], files = [], cwd = '', known = [], groupName = '', max = 50 } = {}) {
  const texts = dictationMessagesOf(messages).map((m) => scrubSecrets(m.text));
  const have = new Set((Array.isArray(known) ? known : []).map((k) => str(k).toLowerCase()));
  const out = [];
  const take = (w) => {
    const t = scrubSecrets(str(w)).trim();
    if (!t || t.length < 3 || t.length > TERM_MAX || /[\s/\\?=&]/.test(t) && termKind(t) !== 'name') return;
    if (/^https?:|[?=&@]/.test(t) || (/^[\w-]+\.[a-z]{2,4}$/.test(t) && NOT_A_FILE_RE.test(t))) return;
    if (have.has(t.toLowerCase()) || out.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    out.push(t);
  };
  for (const f of Array.isArray(files) ? files : []) take(baseName(f));
  for (const w of identifiersOf(texts, 200)) { if (termKind(w) !== 'name') take(w); }
  if (groupName) take(head(str(groupName).replace(/\s+/g, ' '), TERM_MAX));
  return out.slice(0, max);
}
const CODE_SPAN_RE = /```[^\n]*\n?([\s\S]*?)(?:```|$)|`([^`\n]+)`/g;
const PATH_RE = /(?:[\w.-]+\/)+[\w-]+\.[a-z][a-z0-9]{0,4}\b/g;
/** PURE `autoSourcesOf` — what the per-project tier may send WITHOUT a card, named by SOURCE (voice-verify F2), never by
 *  shape: the base names of `files` under `cwd`, the paths an AGENT message names, the identifiers inside an AGENT
 *  message's code spans (`…` / fenced). A word from the person's own sentences is never here — it stays a proposal. */
function autoSourcesOf({ messages = [], files = [], cwd = '' } = {}) {
  const out = new Set();
  const root = str(cwd).replace(/[\\/]+$/, '');
  for (const f of Array.isArray(files) ? files : []) { const p = str(f); if (root && p.startsWith(root + '/') && !p.split('/').includes('..')) out.add(baseName(p)); }
  for (const m of dictationMessagesOf(messages)) {
    if (m.role !== 'agent') continue;
    const text = scrubSecrets(m.text), spans = [];
    for (const c of text.matchAll(CODE_SPAN_RE)) spans.push(c[1] != null ? c[1] : c[2]);
    for (const w of identifiersOf(spans, 200)) out.add(w);
    for (const p of text.match(PATH_RE) || []) out.add(baseName(p));
  }
  return [...out];
}
// ── the proposal's candidates (lane voice-teach-candidates; userW 2026-10-13: a card of ~70 ticked API field names) ──
// lane voice-teach-ids-allowed (owner 2026-10-13: 没必要把 id 啥的从词库排除吧，毕竟 id 这种是最容易识别错的): a dictation dictionary
// is for words dictation gets WRONG — identifiers are its best case. SOURCE = the person's sentences + the agent's PROSE,
// inline `code` spans included (an id named in a sentence is a word someone will say); fenced blocks and URLs are cut
// (a command / code block is the per-project tier's domain). SHAPE_EXCLUSIONS = only what nobody dictates — the census
// test-voice-model ⑦ pins row by row: a secret-shaped VALUE, a placeholder, a vendor's opaque id VALUE, a URL / host / e-mail /
// digit run. SCORE = shape tier (a file name with a known extension, a PascalCase name) ≫ weight (seen + byPerson — the
// person's own words count double; a candidate needs weight ≥ 2) > pronounceable; `pick` (preselected) = the person wrote
// it, or it was seen ≥ 2 times as a file / PascalCase name / identifier (an agent-only plain word waits unticked).
const KNOWN_EXT_RE = /\.(?:py|js|mjs|cjs|ts|tsx|jsx|json|md|txt|csv|ya?ml|toml|sh|css|html|go|rs|java|kt|rb|php|c|h|cpp|swift|sql|ipynb|pdf|docx|xlsx|pptx|png|jpg|svg)$/i;
const VENDOR_ID_RE = /^(?:cli|ou|oc|om|on|app|cfg|usr|tenant)_(?:(?=[0-9a-z]*\d)[0-9a-z]{4,}|[0-9a-z]{8,})$/i; // ou_7565, cli_<hex> — not om_id
const SHAPE_EXCLUSIONS = Object.freeze([                         // [row, rejects(term, {byPerson})] — first match names the row
  ['secret', (w) => scrubSecrets(w) !== w || (/^[\w+/=-]{16,}$/.test(w) && /\d/.test(w) && !/[aeiou]/i.test(w))], // + a vowel-less key run
  ['placeholder', (w) => /(?:^|_)x{3,}(?:_|$)/i.test(w) || /^<[^<>]*>$/.test(w)],
  ['vendor-id', (w) => VENDOR_ID_RE.test(w)],
  ['url-email-digits', (w) => /^(?:https?:|www\.)|@/i.test(w) || /^\d+$/.test(w) || (/^[\w-]+\.[a-z]{2,4}$/i.test(w) && NOT_A_FILE_RE.test(w))],
]);
const exclusionOf = (term, c = {}) => { for (const [row, rejects] of SHAPE_EXCLUSIONS) if (rejects(str(term), c)) return row; return null; };
const NAME_RE = /\b[A-Z][a-z]{2,}\b/g;
const sentenceStart = (text, i) => { const pre = text.slice(Math.max(0, i - 4), i); return (i === pre.length && /^\s*$/.test(pre)) || /(?:[.!?。！？:：*#>•-]|\n)\s*$/.test(pre); };
/** PURE `proposalCandidates` — the words worth a card, ranked: [{term, score, why, seen, byPerson, kind, pick, occ}] (why =
 *  person | file | name | seen; kind = file | name | ident; occ = its occurrences [{key, byPerson}], `key` = the message's
 *  messageKey); minus `known` (case-insensitive); every term ≥ weight 2; and — given the EVIDENCE ledger below (lane
 *  voice-dictionary-nag) — through RULE 1 (`evidenceRule`): never only what the vendor knows. */
function proposalCandidates({ messages = [], files = [], cwd = '', known = [], groupName = '', ledger = null } = {}) {
  const have = new Set((Array.isArray(known) ? known : []).map((k) => str(k).toLowerCase()));
  const root = str(cwd).replace(/[\\/]+$/, '');
  const ownFiles = new Set((Array.isArray(files) ? files : []).map(str).filter((f) => root && f.startsWith(root + '/')).map(baseName));
  const unfence = (t) => t.replace(CODE_SPAN_RE, (all, fenced, inline) => (inline != null ? ` ${inline} ` : ' ')); // inline spans stay words
  const prose = dictationMessagesOf(messages).map((m) => ({ role: m.role, key: messageKey(m), text: scrubSecrets(unfence(m.text).replace(/\bhttps?:\/\/\S+/g, ' ')) }));
  const lower = new Set();
  for (const m of prose) for (const w of m.text.match(/\b[a-z]{3,}\b/g) || []) lower.add(w);
  const tally = new Map();                                       // term → {seen, byPerson, first, occ}
  const count = (w, byPerson, key) => {
    if (w.length < 3 || w.length > TERM_MAX || /^\d/.test(w) || /^(?:e\.g|i\.e|etc)\b/i.test(w)) return;
    const c = tally.get(w) || { seen: 0, byPerson: 0, first: tally.size, occ: [] };
    c.seen += 1; if (byPerson) c.byPerson += 1;
    c.occ.push({ key, byPerson: !!byPerson });
    tally.set(w, c);
  };
  for (const m of prose) {
    const mine = m.role === 'user';
    for (const x of m.text.match(IDENT_RE) || []) count(x.includes('/') ? x.slice(x.lastIndexOf('/') + 1) : x, mine, m.key);
    for (const x of m.text.matchAll(NAME_RE)) if (!sentenceStart(m.text, x.index) && !lower.has(x[0].toLowerCase())) count(x[0], mine, m.key);
  }
  const group = head(str(groupName).replace(/\s+/g, ' ').trim(), TERM_MAX);
  if (group.length >= 3 && !tally.has(group)) tally.set(group, { seen: 1, byPerson: 1, first: tally.size, occ: [{ key: 'group:' + group.toLowerCase(), byPerson: true }] }); // the person named their Task Group
  const out = [];
  for (const [term, c] of tally) {
    if (c.seen + c.byPerson < 2 || have.has(term.toLowerCase()) || exclusionOf(term, c)) continue;
    const k = termKind(term);
    const kind = k === 'file' ? 'file' : (k === 'name' || /^[A-Z]/.test(term)) ? 'name' : 'ident';
    const stem = term.replace(/\.[a-z0-9]+$/i, '');
    const letters = (stem.match(/[A-Za-z]/g) || []).length;
    const sayable = /[aeiouy]/i.test(stem) && stem.length >= 4 && stem.length <= 24 && letters >= 0.7 * stem.length;
    const tier = (kind === 'file' && (KNOWN_EXT_RE.test(term) || ownFiles.has(term))) || (kind === 'name' && /[a-z][A-Z]/.test(term)) ? 2 : kind === 'ident' ? 0 : 1;
    const why = c.byPerson ? 'person' : kind === 'file' ? 'file' : kind === 'name' ? 'name' : 'seen';
    out.push({ term, score: tier * 1000 + Math.min(c.seen + c.byPerson, 99) * 10 + (sayable ? 1 : 0), why, seen: c.seen, byPerson: c.byPerson, kind, pick: c.byPerson > 0 || (c.seen >= 2 && (tier === 2 || kind === 'ident')), first: c.first, occ: c.occ });
  }
  const ranked = out.sort((a, b) => b.score - a.score || a.first - b.first).map(({ first, ...c }) => c);
  return ledger ? evidenceRule(ranked, ledger) : ranked; // lane voice-dictionary-nag: RULE 1 — a dismissal consumed its evidence
}
// ── THE EVIDENCE LEDGER (lane voice-dictionary-nag — a fleet user 2026-10-21: 「一天到晚有这个 Dropline 让我发信息的消息,
// 站在我的 inbox 里」: 20 suggestions in 8 days, «CLAUDE.md» 7×, re-offered from the SAME messages after each dismissal,
// because the candidate rule above subtracted only what the VENDOR knows. The user (02:04Z / 02:06Z): no «never again», no
// timers — 「忽略过的永不再提也太极端了」 / 「你这逻辑也不太合理」). Per instance, per word (its lower case is the key):
// {term, evidence[], consumed[], suggestedAt[], dismissedAt[]} — `evidence` = the occurrences (message keys) it was shown
// on since its last dismissal; a DISMISSAL consumes them (they never count again), so a word comes back ONLY from NEW
// dictations — a message after the dismissal that says it. No quiet period, no retire count, no blacklist. 加入 ⇒ the word
// leaves the ledger (`known` holds it). Bounded: 2 000 words (the least recently touched out), ≤ 32 evidence keys and ≤ 64
// consumed keys a word (the oldest out). RULE 1 is ONE swappable function (`evidenceRule`) — the user's A/B/C answer is
// pending. The clock is handed in (`now`), never read here.
const SUGGEST_LIMITS = Object.freeze({ afterDismissMs: 24 * 3600e3, ledgerMax: 2000, evidenceMax: 32, consumedMax: 64, stampsMax: 8, itemTerms: 24 });
/** a message's identity for the ledger (PURE FNV-1a over role + text): the same message read again is the SAME evidence */
function messageKey(m) {
  const t = `${str(m && m.role)}\n${str(m && m.text)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'm' + h.toString(16).padStart(8, '0') + t.length.toString(36);
}
const keysOf = (xs, max) => { const out = []; for (const x of Array.isArray(xs) ? xs : []) if (typeof x === 'string' && x && !out.includes(x)) out.push(x); return out.slice(-max); };
const stampsOf = (xs) => (Array.isArray(xs) ? xs.filter((x) => Number.isFinite(x)).slice(-SUGGEST_LIMITS.stampsMax) : []);
const wordKey = (t) => str(t).trim().toLowerCase();
const touchedAt = (w) => Math.max(0, ...w.suggestedAt, ...w.dismissedAt);
function boundLedger(L) {
  const keys = Object.keys(L.words);
  if (keys.length <= SUGGEST_LIMITS.ledgerMax) return L;
  const keep = keys.sort((a, b) => touchedAt(L.words[b]) - touchedAt(L.words[a])).slice(0, SUGGEST_LIMITS.ledgerMax);
  return { words: Object.fromEntries(keep.map((k) => [k, L.words[k]])) };
}
/** a stored ledger (any shape — the plugin's own store file) → {words: {key: {term, evidence, consumed, suggestedAt,
 *  dismissedAt}}}; junk dropped, every list bounded */
function ledgerOf(raw) {
  const src = raw && typeof raw === 'object' && raw.words && typeof raw.words === 'object' && !Array.isArray(raw.words) ? raw.words : {};
  const words = {};
  for (const [k, w] of Object.entries(src)) {
    if (!w || typeof w !== 'object') continue;
    const term = head(str(w.term).trim(), TERM_MAX);
    if (!term || wordKey(term) !== k) continue;
    words[k] = { term, evidence: keysOf(w.evidence, SUGGEST_LIMITS.evidenceMax), consumed: keysOf(w.consumed, SUGGEST_LIMITS.consumedMax), suggestedAt: stampsOf(w.suggestedAt), dismissedAt: stampsOf(w.dismissedAt) };
  }
  return boundLedger({ words });
}
/** RULE 1 — THE ONE SWAPPABLE FUNCTION: ranked candidates (with their `occ`) + the ledger → the candidates the person has
 *  not put off. Today: an occurrence a dismissal CONSUMED never counts again — a word's weight (seen + byPerson ≥ 2, as
 *  proposalCandidates asks) is re-earned only from messages it was not dismissed on; `pick` follows the fresh counts. */
function evidenceRule(candidates, ledger) {
  const L = ledgerOf(ledger);
  const out = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const w = c && L.words[wordKey(c.term)];
    if (!w || !w.consumed.length) { out.push(c); continue; }
    const fresh = (Array.isArray(c.occ) ? c.occ : []).filter((o) => !w.consumed.includes(o.key));
    const seen = fresh.length, byPerson = fresh.filter((o) => o.byPerson).length;
    if (seen + byPerson < 2) continue;
    out.push({ ...c, seen, byPerson, pick: !!c.pick && (byPerson > 0 || seen >= 2), occ: fresh });
  }
  return out;
}
/** the evidence a word holds now — its occurrences shown since its last dismissal (the counts a dismissal resets) */
function evidenceOf(ledger, term) { const w = ledgerOf(ledger).words[wordKey(term)]; return w ? w.evidence.length : 0; }
const termsIn = (terms) => { const out = []; for (const t of Array.isArray(terms) ? terms : []) { const s = head(str(t).trim(), TERM_MAX); if (s && !out.some((x) => wordKey(x) === wordKey(s))) out.push(s); } return out; };
const entryOf = (L, term) => L.words[wordKey(term)] || (L.words[wordKey(term)] = { term, evidence: [], consumed: [], suggestedAt: [], dismissedAt: [] });
/** a batch was SHOWN (a For-you item filed or re-worded, a card on the sheet): candidates [{term, occ}] (or bare terms) —
 *  their occurrences become each word's evidence, at `now` */
function ledgerSuggested(ledger, candidates, now) {
  const L = ledgerOf(ledger);
  if (!Number.isFinite(now)) return L;
  const seenNow = new Set();
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const term = head(str(typeof c === 'string' ? c : c && c.term).trim(), TERM_MAX);
    if (!term || seenNow.has(wordKey(term))) continue;
    seenNow.add(wordKey(term));
    const w = entryOf(L, term);
    w.evidence = keysOf([...w.evidence, ...(c && Array.isArray(c.occ) ? c.occ.map((o) => o.key) : [])], SUGGEST_LIMITS.evidenceMax);
    w.suggestedAt = stampsOf([...w.suggestedAt, now]);
  }
  return boundLedger(L);
}
/** the person DISMISSED these words (✕, 忽略, 全部标为已看, a word's 忽略 in Settings): their evidence is CONSUMED — those
 *  occurrences never count again; the count starts from zero */
function ledgerDismissed(ledger, terms, now) {
  const L = ledgerOf(ledger);
  if (!Number.isFinite(now)) return L;
  for (const t of termsIn(terms)) {
    const w = entryOf(L, t);
    w.consumed = keysOf([...w.consumed, ...w.evidence], SUGGEST_LIMITS.consumedMax);
    w.evidence = [];
    w.dismissedAt = stampsOf([...w.dismissedAt, now]);
  }
  return boundLedger(L);
}
/** 加入: the words went to the vendor's dictionary — they leave the ledger (`known` holds them from now on) */
function ledgerAdded(ledger, terms) { const L = ledgerOf(ledger); for (const t of termsIn(terms)) delete L.words[wordKey(t)]; return L; }
/** THE PACING of the For-you item (PURE, the clock handed in): a suggestion item OPEN ⇒ 'update' (its words merge into it
 *  in place — never a second item); else a dismissal on this instance less than a day ago ⇒ 'wait' (+ `until`); else
 *  'file'. No clock ⇒ 'wait' (fail closed). */
function suggestionPace({ open = false, ledger = null, now } = {}) {
  if (open) return { act: 'update', why: 'one-open' };
  if (!Number.isFinite(now)) return { act: 'wait', why: 'no-clock' };
  let last = null;
  for (const w of Object.values(ledgerOf(ledger).words)) for (const d of w.dismissedAt) if (last == null || d > last) last = d;
  if (last != null && now - last < SUGGEST_LIMITS.afterDismissMs) return { act: 'wait', why: 'after-dismissal', until: last + SUGGEST_LIMITS.afterDismissMs };
  return { act: 'file', why: null };
}
/** the open item's words + a new batch's → ONE list (the item's first, deduped case-insensitively), ≤ itemTerms */
function mergeTerms(a, b) { return termsIn([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]).slice(0, SUGGEST_LIMITS.itemTerms); }
/** PURE `teachContextOf` — the /v1/context body: title = the conversation title (≤ 200), source = VibeSpace, text = the
 *  last agent message + the person's last 3 + the working directory + its file names (≤ 6 000) — the never-list holds:
 *  text blocks of THIS conversation only (no tool rows, attachments, other sessions), frames stripped, secrets cut. */
function teachContextOf({ title = '', messages = [], cwd = '', files = [] } = {}) {
  const msgs = dictationMessagesOf(messages);
  const lastAgent = [...msgs].reverse().find((m) => m.role === 'agent');
  const users = msgs.filter((m) => m.role === 'user').slice(-3);
  const fileNames = [...new Set([...(Array.isArray(files) ? files : []).map(baseName), ...identifiersOf(msgs.map((m) => m.text), 200).filter((w) => termKind(w) === 'file')])].slice(0, 40);
  const lines = [
    ...users.map((m) => `user: ${scrubSecrets(head(m.text, 1200)).replace(/\s+/g, ' ').trim()}`),
    ...(lastAgent ? [`agent: ${scrubSecrets(head(lastAgent.text, 3000)).replace(/\s+/g, ' ').trim()}`] : []),
    ...(cwd ? [`Working directory: ${scrubSecrets(baseName(cwd))}`] : []),
    ...(fileNames.length ? [`Files: ${scrubSecrets(fileNames.join(', '))}`] : []),
  ].filter((l) => !/^(?:user|agent): $/.test(l));
  return { title: head(scrubSecrets(str(title)).trim() || 'VibeSpace', 200), source: 'VibeSpace', text: head(lines.join('\n'), TEACH_TEXT_MAX) };
}

module.exports = {
  VOICE_LIMITS, LANGUAGES, DICTATE_PART_ORDER, RECORDER_MIME, RETRY_ONCE, VOICE_WORDS, VOICE_CODES,
  stripFrames, scrubSecrets, dictationMessagesOf, identifiersOf, contextText, beforeOf, contextBytes, dictationContext,
  contextFromClient, localeOf, languageOf, dictateRequestOf, dictateAnswerOf, failureCodeOf, voiceWords,
  TEACH_TEXT_MAX, termKind, termsOf, autoSourcesOf, teachContextOf, SHAPE_EXCLUSIONS, exclusionOf, proposalCandidates,
  SUGGEST_LIMITS, messageKey, ledgerOf, evidenceRule, evidenceOf, ledgerSuggested, ledgerDismissed, ledgerAdded, suggestionPace, mergeTerms,
};

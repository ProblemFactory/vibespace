'use strict';
/**
 * A SECRET AN AGENT ASKS THE OWNER TO PASTE (lane vault-paste-request — the owner 2026-10-23: 「应该允许你给我弹一个保险库
 * 输入框让我直接 paste 进去，省得我还得手动去保险库搞」) — PURE: the ask's rules, its card's words, the agent's receipt, a free
 * entry's facts. Imports only PURE modules (the integration registry for a field target, the hidden-character set, the
 * secret shapes, the peer-text belt); src/server/vault-paste-door.js is the ORCH (the For-you item, the owner's answer,
 * the ONE writer per target, the receipt's road).
 *
 *   · THE ASK — `vibespace-vault request "<what>" --purpose "<why>" [--into <row>.<field> | --kind api-key|password|secret]
 *     [--name <label>]`. The WORDS (what, in the owner's words) and the PURPOSE (why) are the agent's: one line each,
 *     bounded, a hidden or direction character refused by name, a secret shape in them «redacted» (an agent that holds the
 *     value has no need to ask). The TARGET is either a REGISTRY FIELD — a card row's `secret: true` field (`llm.apiKey`;
 *     an account-bound or a per-machine row is no card and is refused by name), written by the integration store's ONE
 *     writer and validated there by the field's own `validate` — or a FREE ENTRY: a new vault entry `secret:<10 hex>`
 *     (the HUB picks the id — an agent never names a vault entry) with its label, its kind and its note — or (lane
 *     login-request-card, B-a681 — the owner 2026-11-09 「agent 自助登录浏览器网站什么时候上线？」) A WEBSITE LOGIN: `--kind login
 *     --host <site>` — ONE site by THE add door's rule (src/browser-login.js originOf + secureOrigin: scheme + host + port as the
 *     fill compares them, https or this machine's localhost), the owner types the user name, the password and an optional
 *     two-step code's NAME into the add door's own fields on the card, and the web-login door's ONE writer lands ONE
 *     `web-login:<origin>#<user>` entry (src/server/browser-logins.js addOwn) — never a free entry beside it.
 *   · THE ITEM IS THE RECORD: the For-you item's action { type: 'secret-request', requestId, into, kind, conv, scope } — ids
 *     and the place only; the agent's words, purpose and a new entry's label are the item's own words (its i18n lines —
 *     wordsOfItem reads them back; "Clear content…" takes them with the rest). No value ever (the value rides the owner's
 *     POST body only, straight to the writer, and is never kept anywhere else).
 *   · THE RECEIPT — at the agent's next turn: what was stored, where, and for what — never the value; or that the owner
 *     refused it (the 拒绝 press, or the item leaving the tray by ✓ / ✕ without a paste), with how long not to ask again.
 *   · THE HOSTS AND THE 8-HOUR GRANT (lane vault-use-grants, the owner 2026-10-27 「每个密码请求都要我同意太麻烦了！」; round 6/7): a new
 *     entry's request may name the hosts it is for (`--host 192.168.1.1,router.lan` — host names / addresses, ≤ 8, never a
 *     wildcard). With them, and the setting `vault.requestGrantsRequester` on (default), the card SAYS the conversation that
 *     asked may use it in commands to those hosts for 8 HOURS — round 7 (MINOR): the grant is HOST-SCOPED, so a command TOWARD
 *     those hosts runs with no card while a command to any OTHER host still draws it (a request that named no hosts draws a card
 *     for every command); round 9/10 (BLOCKER): it runs with no card ONLY for a KNOWN tool whose destination the reader READ with
 *     certainty (shape.destKnown — ruling C, NOT shape.always) — a new KIND of command (a shell, an interpreter, an unknown program, a config-file read) still draws its
 *     card, so the secret never rides a run whose destination the reader cannot see; a vault lock ends it; the entry's own switch is untouched. The paste opens that run grant to the
 *     requesting conversation only; the receipt tells the agent. With the setting OFF the paste grants nothing.
 *   · THE WORDS OF AN ENTRY (lane vault-entry-description — the owner 2026-11-02: 「…compact 后或者共享给 context 不同的 agent，此时
 *     新的 agent 很难知道每个 key 是干啥的…第一次创建 + request key 的 agent 本身可以 request 同时直接加 description，后续修改需要我
 *     approve。名字也一样」): an entry's NAME is its box's `label` (one line, ≤ 80) and its DESCRIPTION its `note` (one paragraph,
 *     ≤ 400) — ONE validator (wordsOf) for every writer. The creator writes them free (`request … --name --note`, mint / put
 *     `--note`; the owner's paste box shows them, editable — the owner's edit wins); later an agent PROPOSES (`vibespace-vault describe`
 *     ⇒ a For-you card `vault-words-ask`, 允许 / 拒绝 — wordsCardOf) and the owner's Allow writes them through the engine's ONE
 *     writer (editEntryWords); every agent that may use the entry reads them in its list (agentEntryWords — the belt).
 */
const IR = require('./integration-registry.js');
const HC = require('./hidden-chars.js');
const SS = require('./secret-shapes.js');
const PT = require('./peer-text.js');
const GM = require('./grant-model.js');   // lane vault-use-grants: ONE spelling of a host (hostListOf)
const BL = require('./browser-login.js');   // lane login-request-card: THE site rule of a website login (originOf + secureOrigin — the add door's own)

const ACTION_TYPE = 'secret-request';
const REQUEST_ID_RE = /^sr-[0-9a-f]{12}$/;
/** lane vault-entry-description: an agent's PROPOSAL to change an entry's words (its For-you card) and its id. */
const WORDS_TYPE = 'vault-words-ask';
const PROPOSAL_ID_RE = /^ew-[0-9a-f]{12}$/;
/** A FREE ENTRY's vault name: `secret:` + the hub's 10 hex characters (src/server/vault-engine.js SECRET_RE holds the
 *  prefix); its inventory row's field is `secret` — the run door's reference `vault://secrets/secret:<id>/secret`. */
const ENTRY_PREFIX = 'secret:';
const FREE_ENTRY_RE = /^secret:[0-9a-f]{10}$/;
const ENTRY_FIELD = 'secret';
const LIMITS = Object.freeze({ words: 200, purpose: 200, name: 80, note: 400, value: 8192, openPerConversation: 4, openHubWide: 64, hosts: 8 });
/** After a refusal the same conversation does not ask for the same place again for this long (the run door's request rule). */
const QUIET_MS = 10 * 60e3;
/** A free entry's kinds (src/vault-inventory.js KINDS spells them; the CLI's `apikey` is `api-key`). */
const ENTRY_KINDS = Object.freeze(['api-key', 'password', 'secret']);
const KIND_ALIASES = Object.freeze({ apikey: 'api-key', 'api-key': 'api-key', key: 'api-key', password: 'password', secret: 'secret' });
/** lane login-request-card: A WEBSITE LOGIN — the request's third target (the action's `kind`; its site rides the action's `hosts`). */
const LOGIN_KIND = 'login';
const LOGIN_ALIASES = Object.freeze({ login: LOGIN_KIND, 'web-login': LOGIN_KIND });
/** lane totp-request-card (fb-251bb41646 — the owner 2026-11-11): A TWO-STEP CODE — the request's fourth target (the action's
 *  `kind`; a name the agent proposes rides the action's `totpName`, judged by THE two-step name rule — src/totp.js entryOf). */
const TOTP_KIND = 'totp';
const TOTP_ALIASES = Object.freeze({ totp: TOTP_KIND, 'two-step': TOTP_KIND, '2fa': TOTP_KIND });
const T = require('./totp.js');   // PURE: the two-step model (its name rule — the 两步验证… dialog's own)
/** A DECLARED human-visible string is a KEY (the registry's rule — scripts/i18n-extract.mjs collects i18nKey(…) beside t(…)):
 *  the card's lines are filed as `{key, params}` and the client says them in its language. */
const i18nKey = (s) => s;
/** The two card lines the request's purpose and a new entry's label ride (wordsOfItem reads them back by their keys). */
const PURPOSE_LINE = i18nKey('What for, in the agent\'s words: {purpose}');
const WHAT_LINE = i18nKey('What: {words}');
const ENTRY_LINE = i18nKey('Where it goes: a new vault entry «{label}» ({kind})');
/** lane vault-entry-description: the new entry's DESCRIPTION as the agent wrote it (read back by its key). */
const NOTE_LINE = i18nKey('Its description, in the agent\'s words: {note}');
/** lane vault-use-grants: the request box's line when the paste grants the asker (read back by its key: `grantOfItem`). */
/** The kind's words (English keys the page says in its language — the inventory's own KIND_WORDS spelling). */
const KIND_WORDS = Object.freeze({ 'api-key': i18nKey('API key'), password: i18nKey('Password'), secret: i18nKey('Secret') });

/** THE CODES and their words toward the AGENT (English — the agent's contract; the CLI prints them). */
const WORDS = Object.freeze({
  words_required: 'say what you need in the user\'s words: vibespace-vault request "<what>" --purpose "<why>"',
  words_too_long: `what you need is at most ${LIMITS.words} characters — the place and the purpose carry the rest`,
  purpose_required: 'say what it is for: --purpose "<what you will do with it>"',
  purpose_too_long: `the purpose is at most ${LIMITS.purpose} characters (one line)`,
  name_required: 'a label needs at least one character',
  name_too_long: `the label is at most ${LIMITS.name} characters`,
  note_too_long: `the note is at most ${LIMITS.note} characters`,
  hidden_chars: 'the request holds a hidden or direction character — the user would read something else than you wrote',
  bad_target: 'name ONE place: --into <row>.<field> (an Integrations field) or --kind api-key|password|secret (a new vault entry), login (a website login) or totp (a two-step code) — not both',
  unknown_row: 'no Integrations card has that id — the ids are the Integrations window\'s rows (e.g. llm, dropline, cloud:browserbase)',
  row_per_account: 'that row\'s OAuth client is chosen per account where the account is added — it is not a field you can ask for',
  row_per_machine: 'that row is kept per paired machine on the machine\'s own card — it is not a field you can ask for',
  unknown_field: 'that card has no such field',
  field_not_secret: 'that field is not a secret — the user types it on its card; a paste request is for a secret field',
  bad_kind: 'the kind is api-key, password or secret (a new vault entry), login (a website login — --host <site>) or totp (a two-step code)',
  // lane totp-request-card: a two-step code's ask
  totp_bad_name: 'a two-step code\'s name is 1–120 letters, digits, ".", "_" or "-" (the Vault\'s own rule) — e.g. --name github-ci',
  totp_words: 'a two-step code has no description of its own — its name says what it is; drop --note',
  totp_host: 'a two-step code is not used toward a host — drop --host (a website login\'s code: ask for the login, --kind login)',
  name_with_into: '--name labels a NEW vault entry; an Integrations field already has its name — drop --name or --into',
  value_required: 'paste the value first',
  value_too_long: `a value is at most ${LIMITS.value} characters`,
  bad_host: `--host names where the new entry is used: host names or addresses (e.g. 192.168.1.1,router.lan,*.amazonaws.com), at most ${LIMITS.hosts}, comma-separated — a *.domain wildcard is fine, a lone * or «any host» is not`,   // lane vault-use-grants
  hosts_with_into: '--host names where a NEW vault entry is used; an Integrations field is used by VibeSpace itself — drop --host or --into',
  // lane vault-entry-description: the words of an entry (its name and its description)
  note_with_into: '--note describes a NEW vault entry; an Integrations field is described by its card — drop --note or --into',
  note_lines: 'a description is one paragraph — no line breaks',
  note_secret: 'a description may not contain a secret — say what the key is for, never its value',
  name_secret: 'a name may not contain a secret — say what the key is, never its value',
  describe_required: 'say what changes: vibespace-vault describe <vault://…> --name "<new name>" and/or --note "<what it is for>"',
  words_same: 'nothing changes — that is already its name and description',
  words_not_here: 'that entry has no name or description of its own to change — its card, its site or VibeSpace names it',
  words_later: 'that entry already exists — a later change of its name or description waits for the user: vibespace-vault describe <its vault:// reference> --note "…" (a rotation without --note keeps its words)',   // r2 (MAJOR 2)
  // lane login-request-card: A WEBSITE LOGIN (`--kind login --host <site>`) — the site by the add door's rule, refused BY NAME before any card
  login_site_required: 'name the site the login is typed on: --kind login --host https://<host>[:port]',
  login_one_site: 'a login is typed on ONE site: --host https://<host>[:port] — one address, no list',
  login_bad_origin: 'a website address (https://host[:port])',
  login_words: 'a website login is named by its site and the user name the user types — no --name or --note',
  login_password_lines: 'a password holds no line break — a copied line\'s newline is not part of it; type or paste it again',
});
/** lane login-request-card: the add door's own words for a site that is not https (src/server/browser-logins.js addOwn). */
const LOGIN_INSECURE = 'a login is kept for an https site (plain http on this machine\'s localhost only)';
/** A text that holds a secret's SHAPE (a token's: PEM, JWT, a vendor prefix, key material — src/secret-shapes.js hasTokenShape;
 *  never the keyword rules, which read «the router password for 192.168.1.1» as one) — never a name or a description. */
const secretShaped = (s) => SS.hasTokenShape(s);
/** THE WORDS of an entry — ONE validator for every writer (lane vault-entry-description): `name` (the box's label: one line,
 *  ≤ 80, never empty) and `note` (its description: one paragraph, ≤ 400, '' clears it). A hidden or direction character, a line
 *  break in the description, a secret's shape in either ⇒ refused BY NAME. undefined / null = not given (kept). Plain text: the
 *  readers escape it (the page) or belt it (agentEntryWords). → { ok, name?, note? } | a refusal. */
function wordsOf({ name, note } = {}) {
  const out = { ok: true };
  if (name !== undefined && name !== null) {
    const s = String(name);
    if (s.length > 4 * LIMITS.name) return refuse('name_too_long');
    if (HC.hiddenCharsOf(s, { max: 1 }).length) return refuse('hidden_chars');
    const t = s.replace(/\s+/g, ' ').trim();
    if (!t) return refuse('name_required');
    if (t.length > LIMITS.name) return refuse('name_too_long');
    if (secretShaped(t)) return refuse('name_secret');
    out.name = t;
  }
  if (note !== undefined && note !== null) {
    const s = String(note);
    if (s.length > 4 * LIMITS.note) return refuse('note_too_long');
    const t = s.trim();
    if (/[\r\n\u2028\u2029]/.test(t)) return refuse('note_lines');   // a line break is said as one (before the hidden-character rule, which holds U+2028)
    if (HC.hiddenCharsOf(t, { max: 1 }).length) return refuse('hidden_chars');
    const f = t.replace(/\s+/g, ' ');
    if (f.length > LIMITS.note) return refuse('note_too_long');
    if (secretShaped(f)) return refuse('note_secret');
    out.note = f;
  }
  return out;
}
/** lane vault-use-grants: the request's hosts (a comma / space separated string, or a list) → the one spelling | null when
 *  absent | false when malformed. */
function hostsOf(raw) {
  if (raw == null || raw === '') return null;
  const list = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/).filter(Boolean);
  if (!list.length) return null;
  if (list.length > LIMITS.hosts || list.some((h) => String(h).trim() === '@entry')) return false;
  return GM.hostListOf(list) || false;
}
const refuse = (code, extra = {}) => ({ ok: false, code, words: WORDS[code] || code, ...extra });

/** ONE LINE of the agent's words → { ok, text } (bounded, folded to one line, a secret shape «redacted») | a refusal. */
function lineOf(raw, max, what) {
  const s = raw == null ? '' : String(raw);
  if (s.length > 4 * max) return refuse(`${what}_too_long`);
  if (HC.hiddenCharsOf(s, { max: 1 }).length) return refuse('hidden_chars');
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return refuse(`${what}_required`);
  if (t.length > max) return refuse(`${what}_too_long`);
  return { ok: true, text: SS.redactSecrets(t).text };
}

/** THE PLACE the value goes. `into` = `<row>.<field>` (a row id may hold `:` — the field is after the LAST dot); else a
 *  free entry of `kind` labelled `name` (no name: the words, cut to the label's bound). → { ok, target } | a refusal.
 *  target = { kind: 'field', row, field, rowLabel, fieldLabel } | { kind: 'entry', entryKind, label }. */
function targetOf({ into = null, kind = null, name = null, words = '', hosts = null } = {}) {
  const hasInto = into != null && String(into).trim() !== '', hasKind = kind != null && String(kind).trim() !== '';
  if (hasInto && hasKind) return refuse('bad_target');
  if (hasKind && LOGIN_ALIASES[String(kind).trim().toLowerCase()]) return loginTargetOf({ name, hosts });   // lane login-request-card
  if (hasKind && TOTP_ALIASES[String(kind).trim().toLowerCase()]) return totpTargetOf({ name, hosts, words });   // lane totp-request-card
  const hs = hostsOf(hosts);   // lane vault-use-grants
  if (hs === false) return refuse('bad_host');
  if (hasInto && hs) return refuse('hosts_with_into');
  if (hasInto) {
    if (name != null && String(name).trim() !== '') return refuse('name_with_into');
    const s = String(into).trim();
    const dot = s.lastIndexOf('.');
    if (s.length > 200 || dot <= 0 || dot === s.length - 1) return refuse('bad_target');
    const row = IR.rowById(s.slice(0, dot));
    if (!row) return refuse('unknown_row');
    if (row.bindsPerAccount) return refuse('row_per_account');
    if (row.bindsPerMachine) return refuse('row_per_machine');
    const f = (row.fields || []).find((x) => x.key === s.slice(dot + 1));
    if (!f) return refuse('unknown_field', { fields: (row.fields || []).filter((x) => x.secret).map((x) => `${row.id}.${x.key}`) });
    if (!f.secret) return refuse('field_not_secret');
    return { ok: true, target: { kind: 'field', row: row.id, field: f.key, rowLabel: row.label, fieldLabel: f.label } };
  }
  const k = hasKind ? KIND_ALIASES[String(kind).trim().toLowerCase()] : 'secret';
  if (!k) return refuse('bad_kind');
  const hasName = name != null && String(name).trim() !== '';
  const l = hasName ? (({ ok, name: text, ...r }) => (ok ? { ok, text } : { ok, ...r }))(wordsOf({ name })) : lineOf(String(words || '').slice(0, LIMITS.name), LIMITS.name, 'name');   // lane vault-entry-description: a name the agent gave is the words rule's (a secret's shape refused, never «redacted»)
  if (!l.ok) return l;
  return { ok: true, target: { kind: 'entry', entryKind: k, label: l.text, hosts: hs || [] } };
}

/** lane login-request-card: A WEBSITE LOGIN's target — the ONE site it is typed on, by THE add door's rule (BL.originOf: scheme
 *  + host + port as the fill compares them, a non-ASCII host in its punycode form; BL.secureOrigin: https, or plain http on this
 *  machine's localhost only). A web-login is named by its site and the user the owner types (the registry's `words` is NONE) —
 *  a --name is refused by name. → { ok, target: { kind: 'login', origin } } | a refusal. */
function loginTargetOf({ name = null, hosts = null } = {}) {
  if (name != null && String(name).trim() !== '') return refuse('login_words');
  const list = (Array.isArray(hosts) ? hosts : String(hosts == null ? '' : hosts).split(/[\s,]+/)).map((h) => String(h == null ? '' : h).trim()).filter(Boolean);
  if (!list.length) return refuse('login_site_required');
  if (list.length > 1) return refuse('login_one_site');
  const origin = BL.originOf(list[0]);
  if (!origin) return refuse('login_bad_origin');
  if (!BL.secureOrigin(origin)) return refuse('login_bad_origin', { words: LOGIN_INSECURE });
  return { ok: true, target: { kind: LOGIN_KIND, origin } };
}

/** lane totp-request-card: A TWO-STEP CODE's target — a name the agent PROPOSES (`--name`, judged by THE two-step name rule:
 *  src/totp.js entryOf — the 两步验证… dialog's own; a bad one is refused by name before any card exists), else none (the person
 *  names it on the card: the link's issuer / account, or typed). `label` = the name, else the agent's words (the place the
 *  request dedupes on). A two-step code is used toward no host — a --host is refused by name. → { ok, target } | a refusal. */
function totpTargetOf({ name = null, hosts = null, words = '' } = {}) {
  const hs = Array.isArray(hosts) ? hosts.filter((h) => String(h == null ? '' : h).trim() !== '') : String(hosts == null ? '' : hosts).trim();
  if (hs.length) return refuse('totp_host');
  const n = name != null ? String(name).trim() : '';
  if (n && !T.entryOf(n)) return refuse('totp_bad_name');
  const label = n || String(words || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
  return { ok: true, target: { kind: TOTP_KIND, name: n, label } };
}

/** THE ASK as the agent sent it → { ok, words, purpose, target } | a refusal (its code + its words). */
function requestVerdict({ words, purpose, into, kind, name, hosts, note } = {}) {
  const w = lineOf(words, LIMITS.words, 'words');
  if (!w.ok) return w;
  const p = lineOf(purpose, LIMITS.purpose, 'purpose');
  if (!p.ok) return p;
  const t = targetOf({ into, kind, name, words: w.text, hosts });
  if (!t.ok) return t;
  // lane vault-entry-description: a NEW entry's description (`--note`), the words rule's — '' / absent = none given
  const hasNote = note != null && String(note).trim() !== '';
  if (hasNote && t.target.kind === 'field') return refuse('note_with_into');
  if (hasNote && t.target.kind === LOGIN_KIND) return refuse('login_words');   // lane login-request-card
  if (hasNote && t.target.kind === TOTP_KIND) return refuse('totp_words');   // lane totp-request-card
  const n = hasNote ? wordsOf({ note }) : { ok: true };
  if (!n.ok) return n;
  return { ok: true, words: w.text, purpose: p.text, target: hasNote ? { ...t.target, note: n.note } : t.target };
}

/** `<row>.<field>` | the entry's label — the target in ONE short spelling (the item's action, the audit). */
const intoOf = (target) => (target && target.kind === 'field' ? `${target.row}.${target.field}` : '');

/** The request's words back from its item (the ITEM is the record): the agent's words (the text's `{words}`), its purpose
 *  and a new entry's label (the detail lines' `{purpose}` / `{label}`) — '' once a clear took them. */
function wordsOfItem(it) {
  const i = it && it.i18n, lines = (i && Array.isArray(i.detail)) ? i.detail : [];
  const param = (key, name) => { const l = lines.find((x) => x && x.key === key); const v = l && l.params && l.params[name]; return typeof v === 'string' ? v : ''; };
  const tp = (k) => { const v = i && i.text && i.text.params && i.text.params[k]; return typeof v === 'string' ? v : ''; };
  // lane totp-request-card: a two-step card's head carries the purpose; its words ride «What: {words}»
  return { words: tp('words') || param(WHAT_LINE, 'words'), purpose: param(PURPOSE_LINE, 'purpose') || tp('purpose'), label: param(ENTRY_LINE, 'label'), note: param(NOTE_LINE, 'note') };
}
/** The target back from an item (the ITEM is the record): its action's { into } ⇒ the field (re-judged against today's
 *  registry — a row that left the registry is no target), else { kind } + the label its words carry ⇒ the entry.
 *  → target | null (a cleared entry request has no label left: no target). */
function targetOfAction(a, { label = '', words = '' } = {}) {
  if (!a || a.type !== ACTION_TYPE || !REQUEST_ID_RE.test(String(a.requestId || ''))) return null;
  if (a.kind === TOTP_KIND) { const tt = targetOf({ kind: TOTP_KIND, name: a.totpName || null, words }); return tt.ok ? tt.target : null; }   // lane totp-request-card
  const t = a.into ? targetOf({ into: a.into }) : a.kind === LOGIN_KIND ? targetOf({ kind: LOGIN_KIND, hosts: a.hosts || '' }) : label ? targetOf({ kind: a.kind || 'secret', name: label, hosts: a.hosts || null }) : { ok: false };   // hosts: lane vault-use-grants (the action's space-joined scalar) — lane login-request-card: a login's ONE site, re-judged by today's rule
  return t.ok ? t.target : null;
}
/** lane vault-entry-description: the request's target with the description its words carry (wordsOfItem's `note`). */
const withNote = (target, note) => (target && target.kind === 'entry' && note ? { ...target, note } : target);

/** THE CARD: the item's text (the English dedupe key) + its words as lines (i18n keys; a row's / a field's / a kind's
 *  label rides as WORDS `{key}` — the client says it in its language). `replaces` = the field holds a value of the
 *  owner's now (the paste replaces it — said). */
function cardOf({ who, words, purpose, target, replaces = false, grant = null, site = null }) {
  if (target.kind === LOGIN_KIND) return loginCardOf({ who, words, purpose, target, site });   // lane login-request-card
  if (target.kind === TOTP_KIND) return totpCardOf({ who, words, purpose, target });   // lane totp-request-card
  const where = target.kind === 'field'
    ? { key: i18nKey('Where it goes: {row} › {field} on the Integrations card ({id})'), params: { row: { key: target.rowLabel }, field: { key: target.fieldLabel }, id: intoOf(target) } }
    : { key: ENTRY_LINE, params: { label: target.label, kind: { key: KIND_WORDS[target.entryKind] || 'Secret' } } };
  const lines = [
    { key: i18nKey('What: {words}'), params: { words } },
    { key: PURPOSE_LINE, params: { purpose } },
    where,
    ...(target.kind === 'entry' && target.note ? [{ key: NOTE_LINE, params: { note: target.note } }] : []),   // lane vault-entry-description
    ...(replaces ? [{ key: i18nKey('It replaces the value saved there now.') }] : []),
    // lane vault-use-grants round 5 (MAJOR item 2): said where the owner pastes — a paste opens ONLY an 8-hour run grant to
    // the conversation that asked (requestGrantsRequester, default on); the «Usable by agent runs» switch (who may use it without
    // a time limit, read again at the paste) is the owner's own act and nothing else flips it.
    ...(target.kind === 'entry' ? [grant
      ? (target.hosts && target.hosts.length
        ? { key: i18nKey('It said it needs it for: {hosts}. If you paste it, the conversation that asked may use it in commands to those hosts for 8 hours — a command to any other host still shows you its card, and a new kind of command whose destination cannot be read (a shell, an interpreter, an unknown program) still shows you its card too; a vault lock ends it. To let it be used without that limit, turn on «Usable by agent runs» on its row in the Vault window.'), params: { hosts: target.hosts.join(', ') } }
        : { key: i18nKey('If you paste it, the conversation that asked may use it, but every command still shows you its card (it named no hosts); a vault lock ends it. To let it be used without a card, turn on «Usable by agent runs» on its row in the Vault window.') })
      : { key: i18nKey('The conversation that asked is not allowed to use it in runs until you turn on «Usable by agent runs» on its row in the Vault window.') }] : []),
    { key: i18nKey('Paste it below and press Save to vault — it goes straight into the vault. The agent is told only that it is stored and where, never the value.') },
  ];
  const fill = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => { const v = l.params && l.params[k]; return v == null ? m : typeof v === 'object' ? String(v.key) : String(v); });
  return {
    text: `${who} asks you for a secret: ${words}`,
    detail: lines.map(fill).join('\n'),
    i18n: { text: { key: i18nKey('{who} asks you for a secret: {words}'), params: { who, words } }, detail: lines },
  };
}

/** lane login-request-card: THE SITE as the owner reads it — the origin the fill compares, and for a non-ASCII host (its punycode
 *  `xn--` labels) its Unicode form beside it, so a look-alike host never hides behind the letters it imitates. `toUnicode(host)` =
 *  the host's Unicode spelling (the ORCH door hands node's url.domainToUnicode — PURE takes the function). → string. */
function siteWords(origin, toUnicode = null) {
  const o = String(origin == null ? '' : origin), h = BL.hostOf(o);
  if (!h || !/(?:^|\.)xn--/.test(h) || typeof toUnicode !== 'function') return o;
  let u = ''; try { u = String(toUnicode(h) || ''); } catch { u = ''; }
  return u && u !== h ? `${o} (${o.replace(h, () => u)})` : o;
}
/** lane login-request-card: THE LOGIN CARD — its FIRST line says who asks, for which site, and that the login is typed only
 *  there (actor + verb + object: the conversation's name and the site's canonical spelling — never the agent's free words, which
 *  ride the lines below). The fields are the add door's own (src/lib/vault-login-row.js loginFields) in the box; `site` = siteWords. */
const LOGIN_HEAD = i18nKey('{who} asks you for a website login on {site} — it is typed only on that site');
const LOGIN_ONLY = i18nKey('Only the site itself (its exact address, over https) is ever filled with it — never another site, never a frame of one.');   // the add door's own line (src/lib/vault-login-row.js)
function loginCardOf({ who, words, purpose, target, site = null }) {
  const s = site || target.origin;
  const lines = [
    { key: i18nKey('What: {words}'), params: { words } },
    { key: PURPOSE_LINE, params: { purpose } },
    { key: LOGIN_ONLY },
    { key: i18nKey('Type its user name and password below — they go straight into the vault. The agent is told that it is stored and for which site, never the password.') },
  ];
  const fill = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => { const v = l.params && l.params[k]; return v == null ? m : String(v); });
  return {
    text: `${who} asks you for a website login on ${s} — it is typed only on that site`,
    detail: lines.map(fill).join('\n'),
    i18n: { text: { key: LOGIN_HEAD, params: { who, site: s } }, detail: lines },
  };
}

/** lane totp-request-card: THE TWO-STEP CARD — its FIRST line says who asks and for what (the conversation's name + the agent's
 *  purpose, belted); the lines below: the agent's words, the name it proposes (the person may change it), what Save does. The
 *  fields are the 两步验证… dialog's OWN (src/lib/vault-totp-row.js totpFields) in the box. */
const TOTP_HEAD = i18nKey('{who} asks you for a two-step code (TOTP) for: {purpose}');
const TOTP_NAME_LINE = i18nKey('The name it proposes: «{name}» — you may change it');
function totpCardOf({ who, words, purpose, target }) {
  const lines = [
    { key: WHAT_LINE, params: { words } },
    ...(target.name ? [{ key: TOTP_NAME_LINE, params: { name: target.name } }] : []),
    { key: i18nKey('Paste its otpauth link or type its seed below, preview it, then save — it goes straight into the vault. The agent is told that it is stored and under which name — never the seed, never a code.') },
  ];
  const fill = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => { const v = l.params && l.params[k]; return v == null ? m : String(v); });
  return {
    text: `${who} asks you for a two-step code (TOTP) for: ${purpose}`,
    detail: lines.map(fill).join('\n'),
    i18n: { text: { key: TOTP_HEAD, params: { who, purpose } }, detail: lines },
  };
}

/** lane vault-entry-description: AN AGENT'S PROPOSAL to change an entry's words — the card's words (head = the English dedupe
 *  key + its i18n line; the detail lines say the old → new; ≤ 400 each, the store's bounds). `from` = the words now, `to` =
 *  what changes ({ name?, note? } — absent = kept). The words ride the item's OWN lines (a clear takes them — the proposal
 *  then is gone); proposalOfItem reads them back by their keys. */
const RENAME_LINE = i18nKey('Name: «{old}» → «{new}»');
const NOTE_FROM_LINE = i18nKey('Description now: {note}');
const NOTE_TO_LINE = i18nKey('Description after: {note}');
const NOTE_NONE = i18nKey('(none)');
/** r2 (MAJOR 1): the description NOW when only the owner reads it (a note from before the rule) — the card never carries its text
 *  (the item rides the asking conversation's own list), the owner reads it in the Vault window. */
const NOTE_PRIVATE = i18nKey('Description now: only you read it (in the Vault window) — Allow replaces it');
function wordsCardOf({ who, ref, from = {}, to = {} }) {
  const old = String(from.name || ''), renames = to.name !== undefined && to.name !== old, redescribes = to.note !== undefined && (from.hidden === true || to.note !== String(from.note || ''));
  const head = renames && redescribes ? i18nKey('{who} wants to rename «{old}» to «{new}» and change its description') : renames ? i18nKey('{who} wants to rename «{old}» to «{new}»') : i18nKey('{who} wants to change the description of «{old}»');
  const hp = { who, old, ...(renames ? { new: to.name } : {}) };
  const noteParam = (n) => (n ? n : { key: NOTE_NONE });
  const lines = [
    ...(renames ? [{ key: RENAME_LINE, params: { old, new: to.name } }] : []),
    ...(redescribes ? [from.hidden ? { key: NOTE_PRIVATE } : { key: NOTE_FROM_LINE, params: { note: noteParam(String(from.note || '')) } }, { key: NOTE_TO_LINE, params: { note: noteParam(to.note) } }] : []),   // r3: `from.note` is the SHARED description only (sharedNoteOf); `hidden` = a private one exists
    { key: i18nKey('The entry: {ref}'), params: { ref } },
    { key: i18nKey('Allow writes these words on the entry; Deny keeps it as it is. Every agent that may use it reads its name and description in its list — never its value.') },
  ];
  const fill = (key, params) => key.replace(/\{(\w+)\}/g, (m, k) => { const v = params && params[k]; return v == null ? m : typeof v === 'object' ? String(v.key) : String(v); });
  return { text: fill(head, hp), detail: lines.map((l) => fill(l.key, l.params)).join('\n'), i18n: { text: { key: head, params: hp }, detail: lines }, renames, redescribes };
}
/** The proposal back from its item (the ITEM is the record): `to` = the words it would write — '' once a clear took them. */
function proposalOfItem(it) {
  const i = it && it.i18n, lines = (i && Array.isArray(i.detail)) ? i.detail : [];
  const line = (key) => lines.find((x) => x && x.key === key);
  const str = (l, k) => { const v = l && l.params && l.params[k]; return typeof v === 'string' ? v : v && typeof v === 'object' && v.key === NOTE_NONE ? '' : null; };
  const rn = line(RENAME_LINE), nt = line(NOTE_TO_LINE), nf = line(NOTE_FROM_LINE);
  const to = {};
  if (rn && typeof str(rn, 'new') === 'string') to.name = str(rn, 'new');
  if (nt && str(nt, 'note') !== null) to.note = str(nt, 'note');
  return { to, from: { name: (rn && str(rn, 'old')) || (i && i.text && i.text.params && typeof i.text.params.old === 'string' ? i.text.params.old : ''), note: nf ? str(nf, 'note') || '' : null } };
}
/** THE PROPOSAL'S RECEIPT at the asking conversation's next turn (English — the agent's contract; every piece belted). */
function wordsReceiptText(o = {}) {
  const piece = (s, max = 200) => PT.toAgentText(String(s == null ? '' : s), { max, kind: 'line' });
  const head = `[Vault] Your proposal ${piece(o.proposalId, 20)} (vibespace-vault describe) for ${piece(o.ref, 160)}`;
  // r2 (MAJOR 1): the receipt says only what the card showed — the words the proposal carried, never a description it did not write
  if (o.outcome === 'applied') { const t = o.to || {}; const said = [...(t.name !== undefined ? [`its name is «${piece(t.name, 80)}»`] : []), ...(t.note !== undefined ? [`its description: ${t.note ? `«${piece(t.note, 400)}»` : 'none'}`] : [])]; return `${head}: APPLIED — the user allowed it; ${said.join('; ') || 'nothing changed'}. Every agent that may use it reads its name and description in vibespace-vault list.`; }
  if (o.outcome === 'withdrawn') return `${head}: WITHDRAWN — the user locked the vault, which ends every open request. Nothing changed. Propose it again once the vault is unlocked (vibespace-vault status says so) — do not ask the user to unlock it.`;
  if (o.outcome === 'gone') return `${head}: NOT APPLIED — the entry is not in the vault any more.`;
  // r3 (MINOR b): the owner changed the words meanwhile — said as itself (the words DID change; there is no quiet period)
  if (o.outcome === 'edited') { const n = o.now || {}; return `${head}: WITHDRAWN — the user changed its name and description themselves meanwhile. Its words now: name «${piece(n.name, 80)}»${n.note ? `; description «${piece(n.note, 400)}»` : ''}. Propose again only if it still needs a change.`; }
  return `${head}: REFUSED — ${REFUSED_WHY[o.why] || REFUSED_WHY.denied}. Its name and description stay as they were. Do not propose it again in the next ${QUIET_MS / 60e3} minutes.`;
}
/** r2 (MINOR b): ONE open proposal per entry — the refusal names the conversation whose proposal waits (its name belted). */
function pendingWords(who) { return `a change of that entry's name or description by ${PT.toAgentText(String(who == null ? '' : who), { max: 80, kind: 'line' })} already waits on the user — wait for their answer`; }
/** lane vault-entry-description r3: THE GUARDED ACCESSOR of an entry's description — its text only when every agent that may use
 *  it reads it (`noteShared`), else '' (a note the owner wrote before the rule is the owner's alone). EVERY card, notice, receipt
 *  and answer that draws a description reads it through here (test-vault-entry-words ⑬ is the census); only the owner's own
 *  Vault-window surfaces read `row.note` itself. → string (≤ 400). */
const sharedNoteOf = (row) => (row && row.noteShared === true && row.note ? String(row.note).slice(0, LIMITS.note) : '');
/** …and whether the entry HAS a description only the owner reads (a card says so, never its text). */
const privateNoteOf = (row) => !!(row && row.note && row.noteShared !== true);
/** THE BELT where an entry's words reach an agent (`vibespace-vault list` / `uses`): its name and its description — words an
 *  agent or the owner wrote, read by ANOTHER agent — each ONE inline piece of the peer-text belt (bounded, folded,
 *  frame-inert). → { name, note } ('' when none). */
function agentEntryWords({ label, note } = {}) {   // the name's bound is an inventory row's own (120: a kind's row names a machine, a site…)
  return { name: PT.toAgentText(String(label == null ? '' : label), { max: 120, kind: 'line' }), note: note ? PT.toAgentText(String(note), { max: LIMITS.note, kind: 'line' }) : '' };
}

/** A REFUSAL's cause → its words toward the agent (the item's resolution: 拒绝, ✕, ✓ without a paste, a clear). */
const REFUSED_WHY = Object.freeze({
  edited: 'the user changed its name and description themselves meanwhile — read them in vibespace-vault list, and propose again only if it still needs a change',   // r2 (MINOR b)
  denied: 'the user pressed Refuse',
  dismissed: 'the user dismissed the request',
  done: 'the user marked it handled without pasting anything',
  cleared: 'the user cleared the request',
  gone: 'the request is gone',
});
/** THE RECEIPT the asking conversation reads at its next turn (English — the agent's contract). Every piece the agent or
 *  the owner wrote (the words, the purpose, the label) passes the peer-text belt as ONE inline piece. Never a value.
 *  o = { outcome: 'stored' | 'refused' | 'withdrawn' (a lock act), requestId, words, purpose, target, ref?, grantHours?, receipt?, why? } */
function receiptText(o = {}) {
  const piece = (s, max = 200) => PT.toAgentText(String(s == null ? '' : s), { max, kind: 'line' });
  const head = `[Vault] Your request ${piece(o.requestId, 20)} (vibespace-vault request)`;
  const t = o.target || {};
  if (o.outcome === 'stored' && t.kind === LOGIN_KIND) return loginReceiptText(head, o, piece);   // lane login-request-card
  if (o.outcome === 'stored' && t.kind === TOTP_KIND) return totpReceiptText(head, o, piece);   // lane totp-request-card
  if (o.outcome === 'stored') {
    const rc = o.receipt ? ` Receipt ${piece(o.receipt, 32)}.` : '';
    if (t.kind === 'field') return `${head}: STORED — «${piece(o.words)}» is saved in ${piece(intoOf(t), 200)} (${piece(t.rowLabel, 80)} › ${piece(t.fieldLabel, 80)}) for: ${piece(o.purpose)}. VibeSpace uses it there itself; you never see the value — never ask for it in the chat.${rc}`;
    // lane vault-use-grants round 7 (MINOR): the paste opens an 8-hour run grant (grantHours) to the requesting conversation,
    // HOST-SCOPED to the hosts it named — a command toward them runs with no card; a command elsewhere (or a request that named
    // no hosts) still draws the user's card. OFF ⇒ no grant, the receipt tells the agent to `request` it. (A vault lock ends it.)
    const use = o.grantHours
      ? (t.hosts && t.hosts.length
        ? `This conversation may use it in a command toward ${piece(t.hosts.join(', '), 120)} for ${Number(o.grantHours)} hours with a KNOWN tool whose destination is read (a vault lock ends it, so a hub restart does too; a command to another host, or a new kind of command whose destination cannot be read — a shell, an interpreter, an unknown program — still shows the user its card): vibespace-vault run --env NAME=${piece(o.ref, 120)} -- <command>.`
        : `This conversation may use it in a command for ${Number(o.grantHours)} hours, but each command still shows the user its card (the request named no hosts): vibespace-vault run --env NAME=${piece(o.ref, 120)} -- <command>.`)
      : `To use it in a command, ask for it: vibespace-vault request ${piece(o.ref, 120)} --for "<what you will run>".`;
    return `${head}: STORED — «${piece(t.label, 80)}» (${KIND_WORDS[t.entryKind] || 'Secret'}) is the vault entry ${piece(o.ref, 120)} for: ${piece(o.purpose)}. You never see the value. ${use}${rc}`;
  }
  if (o.outcome === 'withdrawn') return `${head}: WITHDRAWN — the user locked the vault, which ends every open request («${piece(o.words)}»). Nothing was stored. Ask again once the vault is unlocked (vibespace-vault status says so) — do not ask the user to unlock it.`;
  return `${head}: REFUSED — ${REFUSED_WHY[o.why] || REFUSED_WHY.denied} («${piece(o.words)}»). Do not ask for it again in the next ${QUIET_MS / 60e3} minutes; carry on without it, or ask the user in the chat what they prefer.`;
}

/** lane login-request-card: HOW AN AGENT USES A STORED WEBSITE LOGIN — today's words in ONE constant (the pivot chain «vault-login
 *  r24» changes it when its fill lands): a custom-kernel profile signs in with it; on standard Chrome the vault sign-in is paused
 *  since 2.369.364 (src/browser-login.js ROADS), so the next road is a person in the live view. {origin} / {user} filled per receipt. */
const LOGIN_USE = 'On a custom-kernel browser profile: vibespace-browser login {origin}{user} signs in (the browser types it — you never see it). On standard Chrome the vault sign-in is paused since 2.369.364: ask a person to sign in in the live view — vibespace-browser ask-human "<what you need>".';
/** lane login-request-card: the STORED receipt of a login — the site, the user name ONLY when this conversation may sign in with it
 *  (an agent that may fill a login reads its user in the login answer; one that may not never learns it), the grant in words
 *  (standing — master's browser-login grant has no end), and LOGIN_USE. `o.login` = { user, updated, allowed, asked } (the door's;
 *  `asked` = the owner ticked the grant — r3, law D). */
function loginReceiptText(head, o, piece) {
  const t = o.target || {}, l = o.login || {};
  const origin = piece(t.origin, 300), user = l.allowed && l.user ? piece(l.user, 160) : '';
  const rc = o.receipt ? ` Receipt ${piece(o.receipt, 32)}.` : '';
  const on = `${origin}${user ? ` (user ${user})` : ''}`;
  const what = l.updated ? `UPDATED — the website login for ${on} in the vault now has the password the user typed (the old one is kept one revision)` : `STORED — a website login for ${on} is in the vault`;
  const use = LOGIN_USE.replace('{origin}', () => origin).replace('{user}', () => (user ? ` --user ${user}` : ''));
  // r3 (law D): THREE outcomes, three sentences — granted · not ticked · ticked but the permission could not be written
  const may = l.allowed
    ? `The user allowed THIS conversation to sign in with it on ${origin} — standing, until they remove it in Vault ▸ Web logins ▸ Use for…. ${use}`
    : l.asked
      ? `The user ticked «Let this conversation sign in with it», but the permission could not be written — the login is stored, and they can allow it in Vault ▸ Web logins ▸ Use for… (this account); until then vibespace-browser login answers login_not_granted. Never ask for the login in the chat. Once it is allowed: ${use}`
      : `The user did not let this conversation sign in with it — they allow it in Vault ▸ Web logins ▸ Use for… (this account); until then vibespace-browser login answers login_not_granted. Never ask for the login in the chat. Once it is allowed: ${use}`;
  return `${head}: ${what} for: ${piece(o.purpose)}. You never see the password. ${may}${rc}`;
}
/** lane totp-request-card: HOW AN AGENT USES A STORED TWO-STEP CODE — ONE constant: the current code (never the seed), read
 *  through the agent door (GET /api/agent/vault/totp/:name — the entry's «Use for…» grant decides). {name} filled per receipt. */
const TOTP_USE = 'vibespace-vault totp {name} answers its current code (never the seed) — type it where the prompt asks, at once: a code lasts its step (30 s for most).';
/** lane totp-request-card: the STORED receipt of a two-step code — its name, the person's press in words (THE door's grant:
 *  the entry's «Use for…», held for THIS conversation's current RUN — a restart ends it), and TOTP_USE. Three outcomes, three
 *  sentences: given · ticked but not given (the conversation was not running, or the grant could not be written) · not ticked.
 *  `o.totp` = { name, allowed, asked, whyNot } (the door's). Never the seed, never a code. */
function totpReceiptText(head, o, piece) {
  const tt = o.totp || {};
  const name = piece(tt.name, 120);
  const rc = o.receipt ? ` Receipt ${piece(o.receipt, 32)}.` : '';
  const use = TOTP_USE.replace('{name}', () => name);
  const may = tt.allowed
    ? `The user allowed THIS conversation to read its current code while it runs — a restart of this conversation ends that; they give it again in Vault ▸ Two-step codes ▸ Use for…. ${use}`
    : tt.asked
      ? `The user ticked «Let this conversation read its code», but it was not given (${tt.whyNot === 'not_running' ? 'this conversation was not running at that moment' : 'the permission could not be written'}) — the code is stored; they give it in Vault ▸ Two-step codes ▸ Use for…; until then vibespace-vault totp ${name} answers not_granted. Never ask for the seed or a code in the chat.`
      : `The user did not let this conversation read its code — they give it in Vault ▸ Two-step codes ▸ Use for…; until then vibespace-vault totp ${name} answers not_granted. Never ask for the seed or a code in the chat. Once it is given: ${use}`;
  return `${head}: STORED — a two-step code «${name}» is in the vault for: ${piece(o.purpose)}. You never see the seed. ${may}${rc}`;
}

/** lane login-request-card: THE OWNER'S ANSWER to a login ask, BEFORE the web-login door's own validator (addOwn — the site, the
 *  user name, the password's bound, the two-step name's shape): the password is required and holds NO line break — a copied
 *  line's newline is refused BY NAME, never stripped silently (a page's password input cannot hold one: only a non-DOM client
 *  sends it); the two-step code is a NAME ('' = none). → { ok, username, password, totpName } | a refusal. */
function loginAnswerOf({ username, password, totpName } = {}) {
  if (typeof password !== 'string' || !password) return refuse('value_required', { words: 'type its password' });
  if (/[\r\n\u2028\u2029]/.test(password)) return refuse('login_password_lines');
  const tn = typeof totpName === 'string' ? totpName.trim() : '';
  return { ok: true, username: typeof username === 'string' ? username : '', password, totpName: tn || null };
}
/** lane login-request-card: a stored login's user (its entry name's — lower-cased by the add door's rule) | ''. */
const loginUserOf = (name) => { const p = BL.parseName(name); return p ? p.user : ''; };

/** A FREE ENTRY's facts (the paste box's, and 「其他密钥或密码…」's in the Vault window) → { ok, label, note, kind } | a
 *  refusal: its words by THE words rule (wordsOf — a name, a one-paragraph description; lane vault-entry-description: was
 *  «its own lines kept» — the page folds a line break before it posts), a kind of ENTRY_KINDS. */
function entryMetaOf({ label, note = '', kind = 'secret' } = {}) {
  const w = wordsOf({ name: label == null ? '' : label, note: note == null ? '' : note });
  if (!w.ok) return w;
  const k = KIND_ALIASES[String(kind == null || kind === '' ? 'secret' : kind).toLowerCase()];
  if (!k) return refuse('bad_kind');
  return { ok: true, label: w.name, note: w.note, kind: k };
}

/** THE VALUE as the owner pasted it → { ok, value } (its surrounding whitespace trimmed — a copied line's newline, as the
 *  registry's fields trim) | a refusal. Never logged, never echoed: the caller hands it to the writer and drops it. */
function valueOf(raw) {
  if (typeof raw !== 'string') return refuse('value_required');
  if (raw.length > LIMITS.value * 2) return refuse('value_too_long');
  const v = raw.trim();
  if (!v) return refuse('value_required');
  if (v.length > LIMITS.value) return refuse('value_too_long');
  return { ok: true, value: v };
}

module.exports = {
  ACTION_TYPE, REQUEST_ID_RE, ENTRY_PREFIX, FREE_ENTRY_RE, ENTRY_FIELD, LIMITS, QUIET_MS, ENTRY_KINDS, KIND_WORDS, WORDS, hostsOf,
  requestVerdict, targetOf, targetOfAction, wordsOfItem, intoOf, cardOf, receiptText, entryMetaOf, valueOf,
  WORDS_TYPE, PROPOSAL_ID_RE, wordsOf, withNote, wordsCardOf, proposalOfItem, wordsReceiptText, agentEntryWords, pendingWords, sharedNoteOf, privateNoteOf,   // lane vault-entry-description
  LOGIN_KIND, LOGIN_USE, siteWords, loginAnswerOf, loginUserOf,   // lane login-request-card
  TOTP_KIND, TOTP_USE,   // lane totp-request-card
};

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
 *     (the HUB picks the id — an agent never names a vault entry) with its label, its kind and its note.
 *   · THE ITEM IS THE RECORD: the For-you item's action { type: 'secret-request', requestId, into, kind, conv, scope } — ids
 *     and the place only; the agent's words, purpose and a new entry's label are the item's own words (its i18n lines —
 *     wordsOfItem reads them back; "Clear content…" takes them with the rest). No value ever (the value rides the owner's
 *     POST body only, straight to the writer, and is never kept anywhere else).
 *   · THE RECEIPT — at the agent's next turn: what was stored, where, and for what — never the value; or that the owner
 *     refused it (the 拒绝 press, or the item leaving the tray by ✓ / ✕ without a paste), with how long not to ask again.
 *   · THE HOSTS AND THE DEFAULT GRANT (lane vault-use-grants, the owner 2026-10-27 「每个密码请求都要我同意太麻烦了！」): a new entry's
 *     request may name the hosts it is for (`--host 192.168.1.1,router.lan` — host names / addresses, ≤ 8, never a
 *     wildcard). With them, and the setting `vault.requestGrantsRequester` on (default), the card SAYS that the conversation
 *     that asked will be allowed to use it for those hosts (the agent asked for it, the owner types it — one card he would
 *     otherwise press «Always» on), and the paste writes that vault-use grant; the receipt tells the agent.
 */
const IR = require('./integration-registry.js');
const HC = require('./hidden-chars.js');
const SS = require('./secret-shapes.js');
const PT = require('./peer-text.js');
const GM = require('./grant-model.js');   // lane vault-use-grants: ONE spelling of a host (hostListOf)

const ACTION_TYPE = 'secret-request';
const REQUEST_ID_RE = /^sr-[0-9a-f]{12}$/;
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
/** A DECLARED human-visible string is a KEY (the registry's rule — scripts/i18n-extract.mjs collects i18nKey(…) beside t(…)):
 *  the card's lines are filed as `{key, params}` and the client says them in its language. */
const i18nKey = (s) => s;
/** The two card lines the request's purpose and a new entry's label ride (wordsOfItem reads them back by their keys). */
const PURPOSE_LINE = i18nKey('What for, in the agent\'s words: {purpose}');
const ENTRY_LINE = i18nKey('Where it goes: a new vault entry «{label}» ({kind})');
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
  bad_target: 'name ONE place: --into <row>.<field> (an Integrations field) or --kind api-key|password|secret (a new vault entry) — not both',
  unknown_row: 'no Integrations card has that id — the ids are the Integrations window\'s rows (e.g. llm, dropline, cloud:browserbase)',
  row_per_account: 'that row\'s OAuth client is chosen per account where the account is added — it is not a field you can ask for',
  row_per_machine: 'that row is kept per paired machine on the machine\'s own card — it is not a field you can ask for',
  unknown_field: 'that card has no such field',
  field_not_secret: 'that field is not a secret — the user types it on its card; a paste request is for a secret field',
  bad_kind: 'the kind is api-key, password or secret',
  name_with_into: '--name labels a NEW vault entry; an Integrations field already has its name — drop --name or --into',
  value_required: 'paste the value first',
  value_too_long: `a value is at most ${LIMITS.value} characters`,
  bad_host: `--host names where the new entry is used: host names or addresses (e.g. 192.168.1.1,router.lan,*.amazonaws.com), at most ${LIMITS.hosts}, comma-separated — a *.domain wildcard is fine, a lone * or «any host» is not`,   // lane vault-use-grants
  hosts_with_into: '--host names where a NEW vault entry is used; an Integrations field is used by VibeSpace itself — drop --host or --into',
});
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
  const l = lineOf(hasName ? name : String(words || '').slice(0, LIMITS.name), LIMITS.name, 'name');
  if (!l.ok) return l;
  return { ok: true, target: { kind: 'entry', entryKind: k, label: l.text, hosts: hs || [] } };
}

/** THE ASK as the agent sent it → { ok, words, purpose, target } | a refusal (its code + its words). */
function requestVerdict({ words, purpose, into, kind, name, hosts } = {}) {
  const w = lineOf(words, LIMITS.words, 'words');
  if (!w.ok) return w;
  const p = lineOf(purpose, LIMITS.purpose, 'purpose');
  if (!p.ok) return p;
  const t = targetOf({ into, kind, name, words: w.text, hosts });
  if (!t.ok) return t;
  return { ok: true, words: w.text, purpose: p.text, target: t.target };
}

/** `<row>.<field>` | the entry's label — the target in ONE short spelling (the item's action, the audit). */
const intoOf = (target) => (target && target.kind === 'field' ? `${target.row}.${target.field}` : '');

/** The request's words back from its item (the ITEM is the record): the agent's words (the text's `{words}`), its purpose
 *  and a new entry's label (the detail lines' `{purpose}` / `{label}`) — '' once a clear took them. */
function wordsOfItem(it) {
  const i = it && it.i18n, lines = (i && Array.isArray(i.detail)) ? i.detail : [];
  const param = (key, name) => { const l = lines.find((x) => x && x.key === key); const v = l && l.params && l.params[name]; return typeof v === 'string' ? v : ''; };
  const w = i && i.text && i.text.params && i.text.params.words;
  return { words: typeof w === 'string' ? w : '', purpose: param(PURPOSE_LINE, 'purpose'), label: param(ENTRY_LINE, 'label') };
}
/** The target back from an item (the ITEM is the record): its action's { into } ⇒ the field (re-judged against today's
 *  registry — a row that left the registry is no target), else { kind } + the label its words carry ⇒ the entry.
 *  → target | null (a cleared entry request has no label left: no target). */
function targetOfAction(a, { label = '' } = {}) {
  if (!a || a.type !== ACTION_TYPE || !REQUEST_ID_RE.test(String(a.requestId || ''))) return null;
  const t = a.into ? targetOf({ into: a.into }) : label ? targetOf({ kind: a.kind || 'secret', name: label, hosts: a.hosts || null }) : { ok: false };   // hosts: lane vault-use-grants (the action's space-joined scalar)
  return t.ok ? t.target : null;
}

/** THE CARD: the item's text (the English dedupe key) + its words as lines (i18n keys; a row's / a field's / a kind's
 *  label rides as WORDS `{key}` — the client says it in its language). `replaces` = the field holds a value of the
 *  owner's now (the paste replaces it — said). */
function cardOf({ who, words, purpose, target, replaces = false, grant = null }) {
  const where = target.kind === 'field'
    ? { key: i18nKey('Where it goes: {row} › {field} on the Integrations card ({id})'), params: { row: { key: target.rowLabel }, field: { key: target.fieldLabel }, id: intoOf(target) } }
    : { key: ENTRY_LINE, params: { label: target.label, kind: { key: KIND_WORDS[target.entryKind] || 'Secret' } } };
  const lines = [
    { key: i18nKey('What: {words}'), params: { words } },
    { key: PURPOSE_LINE, params: { purpose } },
    where,
    ...(replaces ? [{ key: i18nKey('It replaces the value saved there now.') }] : []),
    // lane vault-use-grants round 5 (MAJOR item 2): said where the owner pastes — a paste opens ONLY an 8-hour run grant to
    // the conversation that asked (requestGrantsRequester, default on); the «Usable by agent runs» switch (who may use it without
    // a time limit, read again at the paste) is the owner's own act and nothing else flips it.
    ...(target.kind === 'entry' ? [grant
      ? (target.hosts && target.hosts.length
        ? { key: i18nKey('It said it needs it for: {hosts}. If you paste it, the conversation that asked may use it in commands for 8 hours (a vault lock ends it; a new kind of command still shows you its card). To let it be used without that limit, turn on «Usable by agent runs» on its row in the Vault window.'), params: { hosts: target.hosts.join(', ') } }
        : { key: i18nKey('If you paste it, the conversation that asked may use it in commands for 8 hours (a vault lock ends it; a new kind of command still shows you its card). To let it be used without that limit, turn on «Usable by agent runs» on its row in the Vault window.') })
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

/** A REFUSAL's cause → its words toward the agent (the item's resolution: 拒绝, ✕, ✓ without a paste, a clear). */
const REFUSED_WHY = Object.freeze({
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
  if (o.outcome === 'stored') {
    const rc = o.receipt ? ` Receipt ${piece(o.receipt, 32)}.` : '';
    if (t.kind === 'field') return `${head}: STORED — «${piece(o.words)}» is saved in ${piece(intoOf(t), 200)} (${piece(t.rowLabel, 80)} › ${piece(t.fieldLabel, 80)}) for: ${piece(o.purpose)}. VibeSpace uses it there itself; you never see the value — never ask for it in the chat.${rc}`;
    // lane vault-use-grants: the default grant landed ⇒ a STANDING approval for the hosts the request named
    const standing = o.standing && Array.isArray(o.standing.hosts) && o.standing.hosts.length ? `The user allowed this conversation to use it for ${piece(o.standing.hosts.join(', '), 300)} without asking (a standing approval they can change in the Vault window): vibespace-vault run --env NAME=${piece(o.ref, 120)} -- <command>. Another host still shows them its card.` : null;
    const use = standing || (o.grantHours ? `This conversation may use it in a command for ${Number(o.grantHours)} hours (a vault lock ends it; a new kind of command still shows the user its card): vibespace-vault run --env NAME=${piece(o.ref, 120)} -- <command>.` : `To use it in a command, ask for it: vibespace-vault request ${piece(o.ref, 120)} --for "<what you will run>".`);
    return `${head}: STORED — «${piece(t.label, 80)}» (${KIND_WORDS[t.entryKind] || 'Secret'}) is the vault entry ${piece(o.ref, 120)} for: ${piece(o.purpose)}. You never see the value. ${use}${rc}`;
  }
  if (o.outcome === 'withdrawn') return `${head}: WITHDRAWN — the user locked the vault, which ends every open request («${piece(o.words)}»). Nothing was stored. Ask again once the vault is unlocked (vibespace-vault status says so) — do not ask the user to unlock it.`;
  return `${head}: REFUSED — ${REFUSED_WHY[o.why] || REFUSED_WHY.denied} («${piece(o.words)}»). Do not ask for it again in the next ${QUIET_MS / 60e3} minutes; carry on without it, or ask the user in the chat what they prefer.`;
}

/** A FREE ENTRY's facts (the paste box's, and 「其他密钥或密码…」's in the Vault window) → { ok, label, note, kind } | a
 *  refusal: a label (one line, ≤ 80), an optional note (≤ 400, its own lines kept), a kind of ENTRY_KINDS. */
function entryMetaOf({ label, note = '', kind = 'secret' } = {}) {
  const l = lineOf(label, LIMITS.name, 'name');
  if (!l.ok) return l;
  const n = note == null ? '' : String(note);
  if (n.length > LIMITS.note) return refuse('note_too_long');
  if (HC.hiddenCharsOf(n, { max: 1 }).length) return refuse('hidden_chars');
  const k = KIND_ALIASES[String(kind == null || kind === '' ? 'secret' : kind).toLowerCase()];
  if (!k) return refuse('bad_kind');
  return { ok: true, label: l.text, note: n.trim(), kind: k };
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
};

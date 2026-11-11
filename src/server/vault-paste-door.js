'use strict';
/**
 * THE PASTE DOOR (lane vault-paste-request — the owner 2026-10-23: 「应该允许你给我弹一个保险库输入框让我直接 paste 进去，省得
 * 我还得手动去保险库搞」) — ORCH over PURE src/vault-paste.js. An AGENT asks for a secret (POST /api/agent/vault/secret-request
 * with its conversation's own vsst_ bearer — `vibespace-vault request "<what>" --purpose "<why>" …`); the OWNER pastes it
 * into the box its For-you item draws, or refuses (POST /api/vault/secret-requests/:id/answer — a person on this page only, any
 * bearer refused human_only); the value goes to the ONE writer of its place and nowhere else; the asking conversation
 * reads a receipt at its next turn (the delivery stash — free, no wake): what was stored where, never the value.
 *
 *   · THE ITEM IS THE REQUEST: ONE For-you action item (origin vault), action { type: 'secret-request', requestId, into,
 *     kind, conv, scope } — ids and the place; the agent's words ride the item's own words (P.wordsOfItem), never a value. It survives a restart (the owner may paste
 *     tomorrow): the index below is rebuilt from the store at the first call. ONE STATE: the item leaving 'open' by any
 *     other door (✓, ✕, a reopen elsewhere settled, a clear) is a REFUSAL the agent is told, with its cause.
 *   · THE WRITERS: a registry field ⇒ the integration store's setIntegration (trimmed and validated there by the field's
 *     own `validate`, sealed, its masked view broadcast — a refusal names the field and the rule, never the value); a free
 *     entry ⇒ the engine's secretPut under `secret:<10 hex>` (the label, the kind and a note naming who asked and why
 *     ride beside the box) — and, with the setting below on, the conversation that asked may use that NEW entry in runs for 8
 *     hours (the run door's grantPasted: a lock ends it, each new command shape still shows its card). A LOCKED vault ⇒ `vault_locked` by name,
 *     nothing written, the item stays (the box says it, 解锁… inline); NOT SET UP ⇒ a free entry `vault_not_set_up` (a
 *     field still goes to its store, which keeps its key beside its data until the vault is set up).
 *   · THE VALUE is a request body field the route took OFF the body before this door saw it: handed to the writer, then
 *     dropped — never on the item, the audit, a log line, a broadcast, an answer or the receipt.
 *   · THE USE LAW: a stored paste is a `vault-use` of its entry for the conversation that asked (door `paste`, its purpose,
 *     a receipt) — `vibespace-vault uses` reads it back; the agent's receipt names the same receipt.
 *   · THE 8-HOUR GRANT (lane vault-use-grants round 6/7): a new entry's request that names its hosts (`--host`) — and the setting
 *     `vault.requestGrantsRequester` on (default) — says on its card that the conversation that asked may use it in commands to
 *     those hosts for 8 HOURS; the paste opens that run grant (the run door's grantPasted, which is HANDED the hosts — round 7)
 *     to the REQUESTING conversation ONLY. HOST-SCOPED: a command TOWARD those hosts runs with no card; a command to any other
 *     host (or a request that named no hosts) still draws the card; a vault lock ends it; the entry's own «Usable by agent runs»
 *     switch is untouched — and the entry records the hosts and who asked (the Vault window's «filled by you · asked for by …»
 *     origin). The setting is read again at the paste: switched OFF meanwhile ⇒ NOTHING is granted — the receipt tells the agent
 *     to request the secret and the owner opens the entry in the Vault window.
 *   · BOUNDS: 4 open requests per conversation and 64 on the hub (then too_many_requests); the same conversation × place
 *     while one is open ⇒ its id again (already: 'open'); after a refusal the same place is quiet for 10 minutes
 *     (request_quiet — the agent was told so in its receipt).
 *   · THE WORDS OF AN ENTRY (lane vault-entry-description — the owner 2026-11-02: the first agent writes them free, later changes
 *     wait for the owner's approval, names too): a NEW entry's request carries its description (`--note`) beside its name; the paste box
 *     shows both, editable — the OWNER's words at the paste win. Later an agent PROPOSES (`vibespace-vault describe` — an entry
 *     it may reference, its list's): ONE For-you item `vault-words-ask` (允许 / 拒绝; it waits for the owner — a late answer counts; a
 *     lock withdraws it), the words on the item's own lines (old → new); the owner's Allow writes them through the engine's ONE writer
 *     (editEntryWords — proposedBy the agent, approvedBy the owner) and the agent reads a receipt at its next turn. The owner's own
 *     Edit… in the Vault window goes through the same writer (ownerWords). The creator has no later right of its own.
 *   · A WEBSITE LOGIN (lane login-request-card, B-a681): `--kind login --host <site>` is the same request on the same road — the
 *     same item, limits, quiet period and receipt road; its place is the site (`login:<origin>`), the action's `hosts` carries it.
 *     The owner types the add door's own fields on the card (src/lib/vault-login-row.js loginFields: the site fixed by the ask,
 *     the user name, the password, an optional two-step code's NAME — one that names no entry refused HERE by name, the add door
 *     checks its shape only); the answer goes to THE web-login door's ONE writer and validator (src/server/browser-logins.js
 *     addOwn — the site from the REQUEST, never the body) and lands ONE `web-login:<origin>#<user>` entry, no free entry. «Let it
 *     sign in» (ticked by default when `vault.requestGrantsRequester` is on) writes ONE STANDING grant row through the grants
 *     store's ONE writer (logins.grant: `conversation:<this conversation>` on `<origin>#<user>`, nothing wider) — master's
 *     browser-login grant has no time grain, so the card says «until you remove it» (revisited when the pivot lands one).
 */
const crypto = require('crypto');
const P = require('../vault-paste.js');   // PURE: the ask's rules, the card's words, the receipt, a free entry's facts
const VK = require('../vault-kinds.js');   // PURE (lane vault-entry-description): which kinds carry words (the `words` surface)
const VI = require('../vault-inventory.js');   // PURE: an entry's row (the name the window shows, its description)
const VB = require('../vault-blocked.js');   // PURE: a caller's name in words; THE words toward an agent on a locked refusal
const URL_ = require('url');   // lane login-request-card: a site's Unicode form beside its punycode one (P.siteWords takes the function)

const FROM_NAME = 'Vault';
const SETTLED_MAX = 256;
/** The door's own codes (the PURE module's are P.WORDS) — English, toward the agent or the owner's page. */
const MORE_WORDS = Object.freeze({
  unauthorized: 'only a running conversation asks for a secret, with its own session token',
  job_no_use: 'a Background Work job cannot ask the user for a secret — the conversation that owns the job asks',
  request_quiet: 'the user refused that a moment ago — do not ask again for 10 minutes; carry on without it',
  too_many_requests: `too many paste requests are waiting on the user (${P.LIMITS.openPerConversation} per conversation) — wait for their answers`,
  unfiled: 'the request could not be filed in the user\'s tray — nothing was asked',
  ask_unknown: 'that request is gone',
  ask_settled: 'that request was already answered',
  bad_answer: 'the answer is store (with the value) or deny',
  vault_locked: VB.agentWords('a person unlocks it on this instance\'s page'),
  vault_not_set_up: 'the vault is not set up yet — set the second password first (⚙ System ▸ Vault…), then save it',
  invalid_value: 'that value is not accepted by the field',
  store_failed: 'the value could not be saved — nothing changed',
  entry_unknown_id: 'that stored value is not there any more',
  entry_unknown: 'no entry this conversation may use has that reference — `vibespace-vault list` names them',   // lane vault-entry-description
  words_pending: 'a change of that entry\'s words already waits on the user — wait for their answer',
  // lane login-request-card
  login_no_door: 'this server keeps no website logins — nothing was asked',
  login_totp_unknown: 'no two-step code of that name is in the vault — pick one from its list, or add it with «Two-step code…»',
  // lane totp-request-card
  totp_no_door: 'this server keeps no two-step codes — nothing was asked',
});
const STATUS = Object.freeze({
  unauthorized: 401, job_no_use: 403, request_quiet: 429, too_many_requests: 429, unfiled: 503, ask_unknown: 404, ask_settled: 409,
  bad_answer: 400, vault_locked: 423, vault_not_set_up: 409, invalid_value: 400, store_failed: 500, value_required: 400, value_too_long: 400, entry_unknown_id: 404,
  entry_unknown: 404, words_not_here: 400, words_same: 409, words_pending: 409,   // lane vault-entry-description
  totp_no_door: 409, totp_bad_name: 400, totp_words: 400, totp_host: 400, exists: 409, bad_uri: 400, hotp_unsupported: 400, bad_seed: 400, seed_too_short: 400, bad_digits: 400, bad_period: 400, bad_algorithm: 400, bad_text: 400, bad_name: 400, name_required: 400, bad_way: 400,   // lane totp-request-card (the two-step add door's own codes)
  login_no_door: 409, login_totp_unknown: 400, login_site_required: 400, login_one_site: 400, login_bad_origin: 400, login_words: 400, login_password_lines: 400, login_bad_user: 400, bad_totp: 400, not_written: 500, unreadable: 500,   // lane login-request-card (+ the add door's own codes)
});
const named = (code, extra = {}) => ({ ok: false, code, words: MORE_WORDS[code] || P.WORDS[code] || code, ...extra });
const statusOf = (code) => STATUS[code] || 400;

/**
 * @param {object} o
 * @param {object} o.vault         src/server/vault-engine.js (state, secretPut, noteUse, audit, blocked)
 * @param {object} [o.integrations] src/server/integration-store.js (setIntegration — THE writer of a row's values; publicView)
 * @param {object} [o.userTodos]   the For-you store (the item IS the request)
 * @param {object} [o.deliver]     the delivery ladder (stashFor — the receipt rides the asking conversation's next turn)
 * @param {object} [o.vaultRun]    src/server/vault-run-door.js (grantPasted — the asker may use a NEW free entry in runs)
 * @param {object} [o.logins]      src/server/browser-logins.js (addOwn — THE web-login writer; grant — the 用于… row) — lane login-request-card
 */
function create({ vault, integrations = null, userTodos = null, deliver = null, vaultRun = null, useGrants = null, logins = null, totp = null, runOf = () => null, setting = () => undefined, log = () => {}, now = () => Date.now() } = {}) {   // totp + runOf: lane totp-request-card (src/server/vault-totp.js — addEntry, THE person's two-step writer; grant, the entry's «Use for…»; runOf = the wiring's: a running conversation's run)
  // lane vault-use-grants: does a request that names its hosts grant the asker? (Settings ▸ vault.requestGrantsRequester — default on)
  // lane vault-use-grants round 5 (MAJOR item 2): the setting gates the 8-HOUR run grant (via vaultRun.grantPasted) — it no
  // longer needs useGrants (r4's standing member, which did, is gone). Default on; off ⇒ the asker must `request` to use it.
  const grantsAsker = () => { let v; try { v = setting('vault.requestGrantsRequester'); } catch { v = undefined; } return v !== false && v !== 'false'; };
  if (!vault) throw new TypeError('vault-paste-door: vault is required');
  const open = new Map();      // requestId → { requestId, todoId, conv, scope, sessionKey, who, words, purpose, target, place }
  const quiet = new Map();     // `${conv}\n${place}` → until (after a refusal)
  const settled = new Set();   // requestIds answered here (ask_settled vs ask_unknown) — bounded
  const settling = new Set();  // item ids this door resolves itself (its own onStatus is not a refusal)
  let indexed = false;
  const audit = (event, line) => { try { vault.audit(event, line); } catch (e) { log(`the audit line could not be written (${e.message})`); } };
  const placeOf = (t) => (t.kind === 'field' ? `field:${P.intoOf(t)}` : t.kind === P.LOGIN_KIND ? `login:${t.origin}` : t.kind === P.TOTP_KIND ? `totp:${String(t.label).toLowerCase()}` : `entry:${String(t.label).toLowerCase()}`);   // totp: lane totp-request-card (its name, else the agent's words)   // login: lane login-request-card (its ONE site)
  const recordOf = (it) => {
    const a = it && it.action;
    if (!a || a.type !== P.ACTION_TYPE || !P.REQUEST_ID_RE.test(String(a.requestId || ''))) return null;
    const w = P.wordsOfItem(it);
    const target = P.withNote(P.targetOfAction(a, { label: w.label, words: w.words }), w.note);   // words: lane totp-request-card (a two-step ask with no name dedupes on them)   // lane vault-entry-description: + the description its words carry
    return { requestId: a.requestId, todoId: it.id, conv: String(a.conv || ''), scope: String(a.scope || a.conv || ''), sessionKey: it.sessionKey || null, who: String(it.sessionName || 'a conversation'),
      words: w.words, purpose: w.purpose, target, place: target ? placeOf(target) : null, grant: a.grant === true };
  };
  /** THE INDEX from the store (once — the items outlive a restart; a request is the item). */
  function index() {
    if (indexed || !userTodos) return;
    indexed = true;
    try { for (const it of (userTodos.snapshot?.() || {}).open || []) { const q = recordOf(it); if (q) open.set(q.requestId, q); const w = wrecordOf(it); if (w) wopen.set(w.proposalId, w); } } catch (e) { log(`the paste requests could not be read back: ${e.message}`); }
  }
  const forget = (q) => { open.delete(q.requestId); settled.add(q.requestId); while (settled.size > SETTLED_MAX) settled.delete(settled.values().next().value); };
  /** The receipt at the asking conversation's next turn (the stash: free, never a wake). */
  function tell(q, o) {
    if (!deliver || typeof deliver.stashFor !== 'function' || !q.conv) { log(`${q.who}: the receipt for ${q.requestId} has no road (no delivery stash)`); return false; }
    const text = P.receiptText({ ...o, requestId: q.requestId, words: q.words, purpose: q.purpose, target: q.target });
    try { const st = deliver.stashFor(q.conv, { source: 'agent', kind: 'notification', fromName: FROM_NAME, ref: q.requestId, text }); if (st && st.stored === false) log(`${q.who}: the receipt for ${q.requestId} is queued in memory only — ${st.why}`); return true; }
    catch (e) { log(`${q.who}: the receipt for ${q.requestId} could not be queued: ${e.message}`); return false; }
  }
  /** Close the item by THIS door (its resolution word = the outcome), forget the request, tell the agent. */
  function settle(q, outcome, extra = {}) {
    forget(q);
    if (outcome === 'refused') { quiet.set(`${q.conv}\n${q.place}`, now() + P.QUIET_MS); for (const [k, u] of quiet) if (!(u > now())) quiet.delete(k); }
    if (userTodos && q.todoId) {
      // r3 (lane wake-approve-card): the PERSON's answer carries the person verdict's mark — the record says «stored · 09:41»
      try { const it = userTodos.get?.(q.todoId); if (it && it.status === 'open') { settling.add(q.todoId); try { const by = outcome === 'stored' ? 'stored' : outcome === 'withdrawn' ? 'vault_locked' : (extra.why === 'gone' ? 'ask-over' : 'denied'); if (q.fact && typeof userTodos.resolveAnswered === 'function') userTodos.resolveAnswered([q.todoId], by, q.fact); else userTodos.setStatus(q.todoId, 'done', by); } finally { settling.delete(q.todoId); } } } catch (e) { log(`${q.who}: the item of ${q.requestId} could not be closed: ${e.message}`); }
    }
    tell(q, { outcome, ...extra });
  }
  /** Does the field hold a value of the owner's now? (the card says the paste replaces it) */
  const replacesOf = (t) => { if (t.kind !== 'field' || !integrations || typeof integrations.publicView !== 'function') return false; try { const v = integrations.publicView(t.row); return v.source === 'user' && !!(v.set && v.set[t.field]); } catch { return false; } };

  /**
   * AN AGENT ASKS. `caller` = { conversationId (the stash's id), scope (the use law's conv), sessionKey, name, job? };
   * words / purpose / into / kind / name as the CLI sent them. → { ok: true, requestId, target, already? } | a refusal.
   */
  function request({ caller = {}, words, purpose, into, kind, name, hosts, note } = {}) {
    if (caller.job) return named('job_no_use');
    if (!caller.conversationId) return named('unauthorized');
    const v = P.requestVerdict({ words, purpose, into, kind, name, hosts, note });   // note: lane vault-entry-description (`--note`)
    if (!v.ok) return v;
    if (!userTodos) return named('unfiled');
    if (v.target.kind === P.LOGIN_KIND && !(logins && typeof logins.addOwn === 'function')) return named('login_no_door');   // lane login-request-card
    if (v.target.kind === P.TOTP_KIND && !(totp && typeof totp.addEntry === 'function')) return named('totp_no_door');   // lane totp-request-card
    index();
    const conv = String(caller.conversationId), place = placeOf(v.target), target = publicTarget(v.target);
    for (const q of open.values()) if (q.conv === conv && q.place === place) return { ok: true, already: 'open', requestId: q.requestId, target };
    const qu = quiet.get(`${conv}\n${place}`);
    if (qu && qu > now()) return named('request_quiet', { until: new Date(qu).toISOString() });
    if ([...open.values()].filter((q) => q.conv === conv).length >= P.LIMITS.openPerConversation || open.size >= P.LIMITS.openHubWide) return named('too_many_requests');
    const requestId = `sr-${crypto.randomBytes(6).toString('hex')}`;
    const who = String(VB.actorName(caller.name, 'a conversation')).slice(0, 80);
    const grant = (v.target.kind === 'entry' || v.target.kind === P.LOGIN_KIND || v.target.kind === P.TOTP_KIND) && grantsAsker();   // totp: lane totp-request-card (the «Let it read its code» tick's default)   // lane vault-use-grants round 5: the paste gives the asker an 8-hour run grant (not a standing host-scoped member) — the card says so · lane login-request-card: a login's «Let it sign in» tick starts ticked (the owner's press decides)
    const card = P.cardOf({ who, words: v.words, purpose: v.purpose, target: v.target, replaces: replacesOf(v.target), grant: grant ? { hosts: v.target.hosts } : null, site: v.target.kind === P.LOGIN_KIND ? P.siteWords(v.target.origin, URL_.domainToUnicode) : null });
    const scope = String(caller.scope || conv);
    let it;
    try {
      it = userTodos.add(caller.sessionKey || 'vault', {
        origin: 'vault', kind: 'action', urgency: 'high', by: 'agent', sessionName: who,   // NO expiresAt: it waits for the owner (a restart keeps it)
        text: card.text, detail: card.detail, i18n: card.i18n,
        action: { type: 'secret-request', requestId, into: P.intoOf(v.target), kind: v.target.kind === 'entry' ? v.target.entryKind : v.target.kind === P.LOGIN_KIND ? P.LOGIN_KIND : v.target.kind === P.TOTP_KIND ? P.TOTP_KIND : '', conv, scope, ...(v.target.kind === 'entry' && v.target.hosts.length ? { hosts: v.target.hosts.join(' '), grant } : {}), ...(v.target.kind === P.LOGIN_KIND ? { hosts: v.target.origin, grant } : {}), ...(v.target.kind === P.TOTP_KIND ? { grant, ...(v.target.name ? { totpName: v.target.name } : {}) } : {}) },   // totp: lane totp-request-card (the proposed name, scalar)   // hosts + grant: lane vault-use-grants (scalars: the action's fields are)   // = P.ACTION_TYPE (spelled for the approval census's grep) — ids and the place; the words are the item's own (a clear takes them), never a value
      });
    } catch (e) { log(`${who}: the paste request could not be filed in For you: ${e.message}`); return named('unfiled'); }
    if (!it || !it.id) return named('unfiled');
    open.set(requestId, { requestId, todoId: it.id, conv, scope, sessionKey: caller.sessionKey || null, who, words: v.words, purpose: v.purpose, target: v.target, place, grant });
    audit('vault-secret-request', { by: { kind: 'agent', key: caller.sessionKey || null, name: caller.name || null }, conv: scope, place: v.target.kind === 'field' ? P.intoOf(v.target) : v.target.kind === P.LOGIN_KIND ? `a website login on ${v.target.origin}` : v.target.kind === P.TOTP_KIND ? 'a two-step code' : `a new ${v.target.entryKind} entry`, purpose: v.purpose, requestId });
    return { ok: true, requestId, target };
  }
  /** The target as an answer says it (no label of the owner's: the agent's own words and the registry's names). */
  function publicTarget(t) { if (t.kind === P.LOGIN_KIND) return { login: t.origin }; if (t.kind === P.TOTP_KIND) return { totp: t.name || null }; /* lane totp-request-card: the proposed name only */ return t.kind === 'field' ? { into: P.intoOf(t), row: t.rowLabel, field: t.fieldLabel } : { entry: 'new', kind: t.entryKind, label: t.label, ...(t.note ? { note: t.note } : {}), ...(t.hosts && t.hosts.length ? { hosts: t.hosts } : {}) }; }

  /**
   * THE OWNER ANSWERS (the route: a person on this page; the value already taken off the request body).
   * answer 'store' + value ⇒ the ONE writer of the place · 'deny' ⇒ refused. → { ok: true, outcome, … } | a refusal.
   */
  function answer(requestId, { answer: a, value = null, by = 'user', person = false, name, note, login = null, totp: two = null } = {}) {   // totp: lane totp-request-card — { uri | seed + digits / period / algorithm, name, allow } (the link and the seed taken off the body by the route)   // login: lane login-request-card — { username, password, totpName, allow } (the password taken off the body by the route)
    const id = String(requestId || '');
    index();
    const q = open.get(id);
    if (!q) return named(settled.has(id) ? 'ask_settled' : 'ask_unknown');
    const mark = () => { if (person) q.fact = { decidedBy: 'person', decidedAt: now() }; };   // r3: the person verdict's mark (the route's `person`) — the record's, never the agent's receipt
    // THE BELT: the item still open, still this request's (the owner answers what the tray shows — the item IS the record)
    const it = userTodos && typeof userTodos.get === 'function' ? userTodos.get(q.todoId) : null;
    if (!it || it.status !== 'open' || !it.action || it.action.type !== P.ACTION_TYPE || it.action.requestId !== id) { forget(q); return named('ask_settled'); }
    if (a === 'deny') { mark(); settle(q, 'refused', { why: 'denied' }); audit('vault-secret-refused', { by: String(by).slice(0, 40), conv: q.scope, requestId: id }); return { ok: true, outcome: 'refused' }; }
    if (a !== 'store') return named('bad_answer');
    if (q.target && q.target.kind === P.LOGIN_KIND) return answerLogin(q, id, login || {}, { by, mark });   // lane login-request-card
    if (q.target && q.target.kind === P.TOTP_KIND) return answerTotp(q, id, two || {}, { by, mark });   // lane totp-request-card
    const vv = P.valueOf(value);
    if (!vv.ok) return vv;
    if (!q.target) { settle(q, 'refused', { why: 'gone' }); return named('ask_unknown'); }   // its place left the registry since it was filed
    const st = vault.state();
    const who = VB.actorName(q.who, 'a conversation');
    let entry = null, ref = null, grantHours = null;
    if (q.target.kind === 'field') {
      if (st === 'locked') return named('vault_locked');   // the box says it, 解锁… inline — nothing written, the item stays
      if (!integrations || typeof integrations.setIntegration !== 'function') return named('store_failed');
      try { integrations.setIntegration(q.target.row, { [q.target.field]: vv.value }); }
      catch (e) {
        if (e && e.code === 'invalid-values') return named('invalid_value', { why: String((e.detail && e.detail[q.target.field]) || 'invalid').slice(0, 200) });   // the validator's rule — never the value
        if (/vault_locked/.test(String((e && e.message) || ''))) return named('vault_locked');
        log(`${q.requestId}: ${P.intoOf(q.target)} could not be saved (${(e && e.code) || 'error'})`);
        return named('store_failed');
      }
      entry = `integrations:${q.target.row}#${q.target.field}`;
      try { vault.contentsChanged && vault.contentsChanged('paste'); } catch { }   // lane vault-use-grants: every open Vault window re-reads (the field's row is new)
    } else {
      if (st !== 'unlocked') return named(st === 'locked' ? 'vault_locked' : 'vault_not_set_up');
      // lane vault-entry-description: the box showed the name and description the agent proposed, editable — the OWNER's words
      // win (the words rule's; an emptied name keeps the agent's, an emptied description says who asked and why)
      const ow = P.wordsOf({ name: name === '' ? undefined : name, note });
      if (!ow.ok) return ow;
      const label = ow.name !== undefined ? ow.name : q.target.label, desc = ow.note !== undefined ? ow.note : (q.target.note || '');
      entry = `${P.ENTRY_PREFIX}${crypto.randomBytes(5).toString('hex')}`;
      const r = vault.secretPut(entry, vv.value, { prov: 'owner', actor: who, label, kind: q.target.entryKind, note: (desc || `Asked for by ${who}: ${q.purpose}`).slice(0, P.LIMITS.note), noteShared: true, hosts: q.target.hosts || [], askedBy: { conv: q.conv, name: who } });
      if (!r || !r.ok) { const c = String((r && r.code) || ''); return named(c.includes('vault_locked') ? 'vault_locked' : c === 'vault_not_set_up' ? 'vault_not_set_up' : 'store_failed'); }
      ref = `vault://secrets/${entry}/${P.ENTRY_FIELD}`;
      // lane vault-use-grants round 5/7 (MAJOR item 2): THE PASTE OPENS NOTHING BUT ITS OWN 8-HOUR GRANT to the REQUESTING
      // conversation (grantPasted — scoped to q.scope, bounded, ended by a lock; round 7: HOST-SCOPED — a command toward a named
      // host runs with no card, a command elsewhere or a request that named no hosts still draws its card).
      // The entry's «Usable by agent runs» switch is the owner's 验证是你 act and NOTHING else flips it: r4 forged
      // `reauthed:true` here, so one paste opened the new secret to EVERY conversation's run door (ON is an allow-list). To let
      // it be used without the 8-hour limit (and by whoever the owner lists), the owner turns the switch on in the Vault window.
      if (grantsAsker() && vaultRun && typeof vaultRun.grantPasted === 'function') { try { const g = vaultRun.grantPasted({ scope: q.scope, ref, purpose: q.purpose, hosts: (q.target && q.target.hosts) || [], by, requestId: id }); if (g && g.ok) grantHours = g.hours; } catch (e) { log(`${q.requestId}: the run grant could not be written: ${e.message}`); } }   // round 7 (MINOR): the grant is HOST-SCOPED to the hosts the request named (the words say «to those hosts»)
    }
    let receipt = null;
    try { receipt = (vault.noteUse(entry, { by: 'agent', door: 'paste', conv: q.scope }, { outcome: 'ok', purpose: q.purpose, actor: who }) || {}).receipt || null; } catch { /* the store answered: the use line is the audit's */ }
    audit('vault-secret-stored', { by: String(by).slice(0, 40), conv: q.scope, requestId: id, place: q.target.kind === 'field' ? P.intoOf(q.target) : entry, receipt });
    mark();
    settle(q, 'stored', { ref, grantHours, receipt });
    return { ok: true, outcome: 'stored', ...(q.target.kind === 'field' ? { into: P.intoOf(q.target) } : { entry, ref }) };
  }

  /** lane login-request-card: THE OWNER TYPES A WEBSITE LOGIN on the card → THE web-login door's ONE writer and validator
   *  (logins.addOwn — the site from the REQUEST, never the body; the add door's own refusals by name). First, here: the vault's
   *  state, the password's line rule (P.loginAnswerOf) and a two-step NAME that names no entry (the add door checks its shape
   *  only). With «Let it sign in» ticked (`allow`): ONE standing grant row through the grants store's ONE writer (logins.grant
   *  — `session:<the asking conversation>` on this account of this site, nothing wider); a grant that cannot be written leaves
   *  the login stored and says so (the receipt names no user). Every refusal keeps the item open — the box keeps its fields. */
  function answerLogin(q, id, l, { by, mark }) {
    if (!logins || typeof logins.addOwn !== 'function') return named('login_no_door');
    const st = vault.state();
    if (st !== 'unlocked') return named(st === 'locked' ? 'vault_locked' : 'vault_not_set_up');
    const v = P.loginAnswerOf(l);
    if (!v.ok) return v;
    if (v.totpName) { let names = []; try { names = vault.secretNames() || []; } catch { names = []; } if (!names.some((s) => s && s.name === `totp:${v.totpName}`)) return named('login_totp_unknown'); }
    let r = null;
    try { r = logins.addOwn({ origin: q.target.origin, username: v.username, password: v.password, totpName: v.totpName }, { who: String(by).slice(0, 40) }); }
    catch (e) { log(`${q.requestId}: the website login could not be saved (${(e && e.code) || 'error'})`); return named('store_failed'); }
    if (!r || !r.ok) { const c = String((r && r.code) || 'store_failed'); return { ok: false, code: c, words: (r && r.error) || MORE_WORDS[c] || P.WORDS[c] || c }; }
    const entry = String(r.name), user = P.loginUserOf(entry);
    let allowed = false;
    if (l.allow === true && q.conv && typeof logins.grant === 'function') {
      try { const g = logins.grant(entry, 'this-account', `session:${q.conv}`, { by: String(by).slice(0, 40) }); allowed = !!(g && g.ok); if (!allowed) log(`${q.requestId}: the sign-in grant was not written (${(g && g.code) || 'error'}) — the login is stored`); }   // the request's id only — never the entry's name (its user)
      catch (e) { log(`${q.requestId}: the sign-in grant was not written (${(e && e.code) || 'error'}) — the login is stored`); }
    }
    try { vault.contentsChanged && vault.contentsChanged('paste'); } catch { }   // every open Vault window re-reads (its Web logins)
    // THE USE LAW FOR A LOGIN (r3, law A — the user name reaches the asker ONLY with the grant, on every road it can read):
    // storing a login is the OWNER's act; the asking conversation has USED nothing. So NO use line is written for it — a use
    // line names its entry (`web-login:<origin>#<user>`) and `vibespace-vault uses` reads it back to that conversation, the
    // user included. The asker learns the user from the receipt alone, and only when the grant was written; its first USE
    // of the login is its first fill, which the fill road notes itself. The owner-side audit (below, and the add door's own
    // `vault-web-login-saved`) names the entry as the add door always has — the owner's record, never an agent's road.
    // Every agent-readable answer is a census: scripts/test-vault-paste.mjs ⑩c.
    audit('vault-secret-stored', { by: String(by).slice(0, 40), conv: q.scope, requestId: id, place: entry, allowed });
    mark();
    settle(q, 'stored', { login: { user, updated: !!r.updated, allowed, asked: l.allow === true } });   // asked: the owner's tick (law D — granted / not ticked / ticked but not written)
    return { ok: true, outcome: 'stored', entry, updated: !!r.updated, allowed };
  }

  /** lane totp-request-card (fb-251bb41646): THE OWNER ADDS A TWO-STEP CODE on the card → THE two-step add door's ONE writer
   *  (totp.addEntry — the person's door POST /api/vault/totp writes through the same function: the link or the seed sealed as
   *  `totp:<name>` by: human; its own refusals by name — `exists` never overwrites, the person picks another name; a stale grant
   *  dropped first). Never a free `secret:` entry, never agentAdd (the agent-owned road). With «Let it read its code» ticked
   *  (`allow`): THE door that admits a conversation to a two-step entry's codes — totp.grant, the entry's «Use for…» — for THIS
   *  conversation, held for its CURRENT RUN (runOf; a conversation not running is refused not_running: the code is stored, not
   *  given, and the receipt says so). Every refusal keeps the item open — the box keeps its fields. The answer and the receipt
   *  carry its NAME only — never the seed, never a code. */
  function answerTotp(q, id, t, { by, mark }) {
    if (!totp || typeof totp.addEntry !== 'function') return named('totp_no_door');
    const st = vault.state();
    if (st !== 'unlocked') return named(st === 'locked' ? 'vault_locked' : 'vault_not_set_up');
    const input = typeof t.uri === 'string' && t.uri.trim()
      ? { uri: t.uri, name: t.name }
      : { seed: t.seed, digits: t.digits, period: t.period, algorithm: t.algorithm, name: t.name };
    let r = null;
    try { r = totp.addEntry(input, { who: String(by).slice(0, 40) }); }
    catch (e) { log(`${q.requestId}: the two-step code could not be saved (${(e && e.code) || 'error'})`); return named('store_failed'); }
    finally { input.seed = null; input.uri = null; }
    if (!r || !r.ok) { const c = String((r && r.code) || 'store_failed'); return { ok: false, code: c, words: (r && r.error) || MORE_WORDS[c] || P.WORDS[c] || c }; }
    const name = String(r.name);
    let allowed = false, whyNot = null;
    if (t.allow === true && q.conv && typeof totp.grant === 'function') {
      try { const g = totp.grant(name, [`session:${q.conv}`], { who: String(by).slice(0, 40), by: 'user', runOf }); allowed = !!(g && g.ok); if (!allowed) { whyNot = (g && g.code) || 'error'; log(`${q.requestId}: the code was not given to the conversation (${whyNot}) — the two-step code is stored`); } }
      catch (e) { whyNot = (e && e.code) || 'error'; log(`${q.requestId}: the code was not given to the conversation (${whyNot}) — the two-step code is stored`); }
    }
    try { vault.contentsChanged && vault.contentsChanged('paste'); } catch { }   // every open Vault window re-reads (its two-step codes)
    // THE USE LAW (as the login card's): storing a seed is the OWNER's act — no use line; the asker's first USE is its first
    // `vibespace-vault totp <name>`, which the agent door audits itself (vault-totp-use)
    audit('vault-secret-stored', { by: String(by).slice(0, 40), conv: q.scope, requestId: id, place: r.entry || `totp:${name}`, allowed });
    mark();
    settle(q, 'stored', { totp: { name, allowed, asked: t.allow === true, whyNot } });
    return { ok: true, outcome: 'stored', name, allowed, ...(whyNot ? { whyNot } : {}) };
  }

  // THE ITEM AND THE REQUEST ARE ONE STATE: the item leaving 'open' by another door is a refusal the agent is told
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it, { status, by } = {}) => {
      if (it && it.action && it.action.type === P.WORDS_TYPE && !settling.has(it.id)) { wonStatus(it, status, by); return; }   // lane vault-entry-description
      if (!it || !it.action || it.action.type !== P.ACTION_TYPE || settling.has(it.id)) return;
      index();
      const q = open.get(String(it.action.requestId || ''));
      if (status === 'open') { if (!q) { try { settling.add(it.id); userTodos.setStatus(it.id, 'done', 'ask-over'); } catch { } finally { settling.delete(it.id); } } return; }   // a reopen of one that is over goes back
      if (!q || q.todoId !== it.id) return;
      settle(q, 'refused', { why: status === 'dismissed' ? 'dismissed' : by === 'clear' ? 'cleared' : 'done' });
    });
  }
  // A LOCK ACT WITHDRAWS EVERY OPEN REQUEST (design q-043 decision ③ — the lock ends every unanswered ask): its item done
  // vault_locked, its asker told at its next turn that it may ask again once the vault is unlocked (no quiet: the owner did not
  // refuse it). A restart is no lock act — a request kept over it, or filed while locked, waits (its box: vault_locked, 解锁…)
  if (typeof vault.onLock === 'function') vault.onLock(() => { index(); for (const q of [...open.values()]) settle(q, 'withdrawn', { why: 'locked' }); for (const w of [...wopen.values()]) wsettle(w, 'withdrawn'); });   // + every proposal of an entry's words (lane vault-entry-description)
  /** 「其他密钥或密码…」 (the Vault window's 添加 menu — the owner 2026-10-23: 「我压根没法添加啊」): a FREE entry the owner adds —
   *  a label, a kind, a note and the value (taken off the body by the route) → `secret:<10 hex>`. Unlocked only. */
  function addEntry({ label, note = '', kind = 'secret', value = null, by = 'user' } = {}) {
    const m = P.entryMetaOf({ label, note, kind });
    if (!m.ok) return m;
    const vv = P.valueOf(value);
    if (!vv.ok) return vv;
    const st = vault.state();
    if (st !== 'unlocked') return named(st === 'locked' ? 'vault_locked' : 'vault_not_set_up');
    const entry = `${P.ENTRY_PREFIX}${crypto.randomBytes(5).toString('hex')}`;
    const r = vault.secretPut(entry, vv.value, { prov: 'owner', label: m.label, note: m.note, kind: m.kind, noteShared: true });   // noteShared: the dialog says agents that may use it read its description (lane vault-entry-description)
    if (!r || !r.ok) { const c = String((r && r.code) || ''); return named(c.includes('vault_locked') ? 'vault_locked' : 'store_failed'); }
    audit('vault-secret-added', { by: String(by).slice(0, 40), entry, kind: m.kind });   // the name and the kind — never the label's value, never the value
    return { ok: true, entry, ref: `vault://secrets/${entry}/${P.ENTRY_FIELD}`, label: m.label, kind: m.kind };
  }
  /** A free entry's delete door (its row's 删除 in the Vault window) — `id` = the part after `secret:`. A locked vault forgets too
   *  (the engine's secretDrop needs no key). */
  function dropEntry(id, { by = 'user' } = {}) {
    const entry = `${P.ENTRY_PREFIX}${String(id || '')}`;
    if (!/^secret:[\w.-]{1,160}$/.test(entry)) return named('entry_unknown_id');
    // lane vault-use-grants round 5 (MINOR item 6): the entry and WHO MAY USE IT go together — remove the vault-use grant row
    // FIRST (it refuses while locked, needing the generation sidecar). If it cannot (a locked vault), REFUSE the whole delete by
    // name, so an entry is never gone while its grant row dangles (r4 deleted the secret and silently ignored the row's refusal).
    if (useGrants) { let dr = null; try { dr = useGrants.drop(`secrets:${entry}#${P.ENTRY_FIELD}`, { by }); } catch (e) { log(`${entry}: its vault-use grant row could not be removed — ${e.message}`); return named('store_failed'); } if (dr && !dr.ok) return named(dr.code === 'vault_locked' ? 'vault_locked' : 'store_failed'); }
    const r = vault.secretDrop(entry);
    if (!r || !r.ok) return named('store_failed');
    if (r.already) return named('entry_unknown_id');
    audit('vault-secret-deleted', { by: String(by).slice(0, 40), entry });
    return { ok: true, entry };
  }
  // ── THE WORDS OF AN ENTRY (lane vault-entry-description) ──
  const wopen = new Map();   // proposalId → { proposalId, todoId, conv, scope, sessionKey, who, entry, ref, from, to }
  /** An entry's words NOW — its row's name and description (src/vault-inventory.js secretRowOf) — or null: no such entry, or
   *  a kind with no words of its own (the registry's `words` surface is NONE). */
  function wordsNow(entry) {
    const fam = VK.familyOf('secrets', entry), sw = fam && fam.surfaces && fam.surfaces.words;
    if (!sw || sw.none) return null;
    let s = null;
    try { s = (vault.secretNames() || []).find((x) => x && x.name === entry) || null; } catch { s = null; }
    const row = s ? VI.secretRowOf(s) : null;
    return row ? { name: String(row.label || ''), note: P.sharedNoteOf(row), hidden: P.privateNoteOf(row) } : null;   // r3: THE guarded accessor — a private description is `hidden`, never its text (the card, words_same, the receipt)
  }
  const wrecordOf = (it) => {
    const a = it && it.action;
    if (!a || a.type !== P.WORDS_TYPE || !P.PROPOSAL_ID_RE.test(String(a.askId || ''))) return null;
    const pw = P.proposalOfItem(it);
    return { proposalId: a.askId, todoId: it.id, conv: String(a.conv || ''), scope: String(a.scope || a.conv || ''), sessionKey: it.sessionKey || null, who: String(it.sessionName || 'a conversation'), entry: String(a.entry || ''), ref: String(a.ref || ''), from: pw.from, to: pw.to };
  };
  const wforget = (w) => { wopen.delete(w.proposalId); settled.add(w.proposalId); while (settled.size > SETTLED_MAX) settled.delete(settled.values().next().value); };
  function wtell(w, o) {
    if (!deliver || typeof deliver.stashFor !== 'function' || !w.conv) { log(`${w.who}: the receipt for ${w.proposalId} has no road (no delivery stash)`); return false; }
    try { deliver.stashFor(w.conv, { source: 'agent', kind: 'notification', fromName: FROM_NAME, ref: w.proposalId, text: P.wordsReceiptText({ ...o, proposalId: w.proposalId, ref: w.ref }) }); return true; }
    catch (e) { log(`${w.who}: the receipt for ${w.proposalId} could not be queued: ${e.message}`); return false; }
  }
  /** Close a proposal's item by THIS door, forget it, tell the agent. outcome: applied | refused | withdrawn | gone. */
  function wsettle(w, outcome, { why = 'denied', to = null, now: nowWords = null } = {}) {
    wforget(w);
    if (outcome === 'refused') quiet.set(`${w.conv}\nwords:${w.entry}`, now() + P.QUIET_MS);   // r3: the owner's own edit is its own outcome (`edited`) — no quiet
    if (userTodos && w.todoId) {
      try { const it = userTodos.get?.(w.todoId); if (it && it.status === 'open') { settling.add(w.todoId); try { const by = outcome === 'applied' ? 'allowed' : outcome === 'withdrawn' ? 'vault_locked' : outcome === 'gone' || outcome === 'edited' || why === 'gone' ? 'ask-over' : 'denied'; if (w.fact && typeof userTodos.resolveAnswered === 'function') userTodos.resolveAnswered([w.todoId], by, w.fact); else userTodos.setStatus(w.todoId, 'done', by); } finally { settling.delete(w.todoId); } } } catch (e) { log(`${w.who}: the item of ${w.proposalId} could not be closed: ${e.message}`); }
    }
    wtell(w, { outcome, why, to, now: nowWords });
  }
  function wonStatus(it, status, by) {
    index();
    const w = wopen.get(String(it.action.askId || ''));
    if (status === 'open') { if (!w) { try { settling.add(it.id); userTodos.setStatus(it.id, 'done', 'ask-over'); } catch { } finally { settling.delete(it.id); } } return; }
    if (!w || w.todoId !== it.id) return;
    wsettle(w, 'refused', { why: status === 'dismissed' ? 'dismissed' : by === 'clear' ? 'cleared' : 'done' });
  }
  /**
   * AN AGENT PROPOSES new words for an entry it may reference (`vibespace-vault describe <vault://…> --name … --note …`):
   * `entry` / `ref` = the entry and its canonical reference, `seen` = it is in the caller's own list (the route asks the run
   * door). Nothing is written: ONE For-you card, old → new. → { ok: true, proposalId, already? } | a refusal.
   */
  function propose({ caller = {}, entry, ref, seen = false, name, note } = {}) {
    if (caller.job) return named('job_no_use');
    if (!caller.conversationId) return named('unauthorized');
    if ((name === undefined || name === null) && (note === undefined || note === null)) return named('describe_required');
    const v = P.wordsOf({ name, note });
    if (!v.ok) return v;
    const st = vault.state();
    if (st !== 'unlocked') return named(st === 'locked' ? 'vault_locked' : 'vault_not_set_up');
    if (!seen || !entry) return named('entry_unknown');
    const from = wordsNow(String(entry));
    if (!from) return named('words_not_here');
    const to = {};
    if (v.name !== undefined && v.name !== from.name) to.name = v.name;
    if (v.note !== undefined && (from.hidden || v.note !== from.note)) to.note = v.note;   // r3 (MINOR c): never compared against a private note (no guess is confirmed)
    if (!Object.keys(to).length) return named('words_same');
    if (!userTodos) return named('unfiled');
    index();
    const conv = String(caller.conversationId);
    for (const w of wopen.values()) if (w.conv === conv && w.entry === entry) return { ok: true, already: 'open', proposalId: w.proposalId };
    for (const w of wopen.values()) if (w.entry === entry) return { ...named('words_pending'), words: P.pendingWords(w.who) };   // r2 (MINOR b): ONE open proposal per entry
    const qu = quiet.get(`${conv}\nwords:${entry}`);
    if (qu && qu > now()) return named('request_quiet', { until: new Date(qu).toISOString() });
    if ([...wopen.values()].filter((w) => w.conv === conv).length >= P.LIMITS.openPerConversation || wopen.size >= P.LIMITS.openHubWide) return named('too_many_requests');
    const proposalId = `ew-${crypto.randomBytes(6).toString('hex')}`;
    const who = String(VB.actorName(caller.name, 'a conversation')).slice(0, 80);
    const card = P.wordsCardOf({ who, ref: String(ref || ''), from, to });
    const scope = String(caller.scope || conv);
    let it;
    try {
      it = userTodos.add(caller.sessionKey || 'vault', {
        origin: 'vault', kind: 'action', urgency: 'normal', by: 'agent', sessionName: who,   // NO expiresAt: it waits for the owner (a late answer counts; a lock withdraws it)
        text: card.text, detail: card.detail, i18n: card.i18n,
        action: { type: 'vault-words-ask', askId: proposalId, entry: String(entry), ref: String(ref || ''), conv, scope },   // = P.WORDS_TYPE (spelled for the approval census's grep) — ids only (`askId`: the held-ask grammar every surface draws); the words are the item's own lines (a clear takes them)
      });
    } catch (e) { log(`${who}: the words proposal could not be filed in For you: ${e.message}`); return named('unfiled'); }
    if (!it || !it.id) return named('unfiled');
    wopen.set(proposalId, { proposalId, todoId: it.id, conv, scope, sessionKey: caller.sessionKey || null, who, entry: String(entry), ref: String(ref || ''), from, to });
    audit('vault-words-proposed', { by: { kind: 'agent', key: caller.sessionKey || null, name: caller.name || null }, conv: scope, entry: String(entry), proposalId });   // ids — the words ride the item and the writer's own line
    return { ok: true, proposalId, todoId: it.id, to };
  }
  /** THE OWNER ANSWERS a proposal (a person on this page): allow ⇒ the ONE writer (proposedBy the agent, approvedBy the owner) ·
   *  deny ⇒ refused. → { ok: true, outcome } | a refusal. */
  function answerWords(proposalId, { answer: a, by = 'user', person = false } = {}) {
    const id = String(proposalId || '');
    index();
    const w = wopen.get(id);
    if (!w) return named(settled.has(id) ? 'ask_settled' : 'ask_unknown');
    const it = userTodos && typeof userTodos.get === 'function' ? userTodos.get(w.todoId) : null;
    if (!it || it.status !== 'open' || !it.action || it.action.type !== P.WORDS_TYPE || it.action.askId !== id) { wforget(w); return named('ask_settled'); }
    if (a !== 'allow' && a !== 'deny') return named('bad_answer');
    if (person) w.fact = { decidedBy: 'person', decidedAt: now() };
    if (a === 'deny') { wsettle(w, 'refused', { why: 'denied' }); audit('vault-words-refused', { by: String(by).slice(0, 40), conv: w.scope, entry: w.entry, proposalId: id }); return { ok: true, outcome: 'refused' }; }
    const to = P.proposalOfItem(it).to;   // the words the card SHOWS (the item is the record — a clear took them: nothing to write)
    if (!Object.keys(to).length) { wsettle(w, 'refused', { why: 'cleared' }); return named('ask_unknown'); }
    if (!wordsNow(w.entry)) { wsettle(w, 'gone'); return named('entry_unknown'); }
    const r = vault.editEntryWords(w.entry, { label: to.name, note: to.note }, { proposedBy: w.who, approvedBy: String(by).slice(0, 40) });
    if (!r || !r.ok) { const c = String((r && r.code) || ''); return named(c.includes('vault_locked') ? 'vault_locked' : c === 'entry_unknown' ? 'entry_unknown' : 'store_failed'); }
    try { vault.contentsChanged && vault.contentsChanged('words'); } catch { }   // every open Vault window re-reads (its row's words)
    wsettle(w, 'applied', { to: { ...(to.name !== undefined ? { name: r.to.label } : {}), ...(to.note !== undefined ? { note: r.to.note } : {}) } });   // r2 (MAJOR 1): what the card showed
    return { ok: true, outcome: 'applied', entry: w.entry };
  }
  /** THE OWNER'S OWN EDIT (the Vault window's Edit… — a person on this page): the same writer, no card. */
  function ownerWords({ entry, name, note, by = 'user' } = {}) {
    const e = String(entry || '');
    const v = P.wordsOf({ name, note });
    if (!v.ok) return v;
    const st = vault.state();
    if (st !== 'unlocked') return named(st === 'locked' ? 'vault_locked' : 'vault_not_set_up');
    if (!wordsNow(e)) return named('words_not_here');
    const r = vault.editEntryWords(e, { label: v.name, note: v.note }, { proposedBy: String(by).slice(0, 40), approvedBy: String(by).slice(0, 40) });
    if (!r || !r.ok) return named(String((r && r.code) || '').includes('vault_locked') ? 'vault_locked' : 'store_failed');
    try { vault.contentsChanged && vault.contentsChanged('words'); } catch { }
    index();
    const nowW = wordsNow(e);
    for (const w of [...wopen.values()]) if (w.entry === e) wsettle(w, 'edited', { now: nowW ? { name: nowW.name, note: nowW.note } : null });   // r2 (MINOR b) + r3: the owner's edit withdraws a waiting proposal — its own receipt (the words now; the SHARED description only)
    return { ok: true, entry: e, name: r.to.label, note: r.to.note };
  }
  /** The open proposals (the Vault window's pending marker — ids and entries; the words are the items'). */
  function proposalsOpen() { index(); return [...wopen.values()].map((w) => ({ proposalId: w.proposalId, entry: w.entry, todoId: w.todoId })); }

  /** The open requests of ONE conversation (`vibespace-vault uses` — words, places, times; never a value). */
  function openFor(conv) { index(); return [...open.values()].filter((q) => q.conv === String(conv || '') || q.scope === String(conv || '')).map((q) => ({ requestId: q.requestId, words: q.words, purpose: q.purpose, place: q.target ? (q.target.kind === 'field' ? P.intoOf(q.target) : q.target.kind === P.LOGIN_KIND ? `a website login on ${q.target.origin}` : `a new ${q.target.entryKind} entry «${q.target.label}»`) : null })); }

  return { request, answer, addEntry, dropEntry, openFor, statusOf, words: (code) => MORE_WORDS[code] || P.WORDS[code] || code, propose, answerWords, ownerWords, proposalsOpen };
}

module.exports = { create, MORE_WORDS, STATUS, FROM_NAME };

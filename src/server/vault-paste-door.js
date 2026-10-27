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
 *     ride beside the box) — and the conversation that asked may use that NEW entry in runs for 8 hours (the run door's
 *     grantPasted: a lock ends it, each new command shape still shows its card). A LOCKED vault ⇒ `vault_locked` by name,
 *     nothing written, the item stays (the box says it, 解锁… inline); NOT SET UP ⇒ a free entry `vault_not_set_up` (a
 *     field still goes to its store, which keeps its key beside its data until the vault is set up).
 *   · THE VALUE is a request body field the route took OFF the body before this door saw it: handed to the writer, then
 *     dropped — never on the item, the audit, a log line, a broadcast, an answer or the receipt.
 *   · THE USE LAW: a stored paste is a `vault-use` of its entry for the conversation that asked (door `paste`, its purpose,
 *     a receipt) — `vibespace-vault uses` reads it back; the agent's receipt names the same receipt.
 *   · BOUNDS: 4 open requests per conversation and 64 on the hub (then too_many_requests); the same conversation × place
 *     while one is open ⇒ its id again (already: 'open'); after a refusal the same place is quiet for 10 minutes
 *     (request_quiet — the agent was told so in its receipt).
 */
const crypto = require('crypto');
const P = require('../vault-paste.js');   // PURE: the ask's rules, the card's words, the receipt, a free entry's facts
const VB = require('../vault-blocked.js');   // PURE: a caller's name in words; THE words toward an agent on a locked refusal

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
});
const STATUS = Object.freeze({
  unauthorized: 401, job_no_use: 403, request_quiet: 429, too_many_requests: 429, unfiled: 503, ask_unknown: 404, ask_settled: 409,
  bad_answer: 400, vault_locked: 423, vault_not_set_up: 409, invalid_value: 400, store_failed: 500, value_required: 400, value_too_long: 400, entry_unknown_id: 404,
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
 */
function create({ vault, integrations = null, userTodos = null, deliver = null, vaultRun = null, log = () => {}, now = () => Date.now() } = {}) {
  if (!vault) throw new TypeError('vault-paste-door: vault is required');
  const open = new Map();      // requestId → { requestId, todoId, conv, scope, sessionKey, who, words, purpose, target, place }
  const quiet = new Map();     // `${conv}\n${place}` → until (after a refusal)
  const settled = new Set();   // requestIds answered here (ask_settled vs ask_unknown) — bounded
  const settling = new Set();  // item ids this door resolves itself (its own onStatus is not a refusal)
  let indexed = false;
  const audit = (event, line) => { try { vault.audit(event, line); } catch (e) { log(`the audit line could not be written (${e.message})`); } };
  const placeOf = (t) => (t.kind === 'field' ? `field:${P.intoOf(t)}` : `entry:${String(t.label).toLowerCase()}`);
  const recordOf = (it) => {
    const a = it && it.action;
    if (!a || a.type !== P.ACTION_TYPE || !P.REQUEST_ID_RE.test(String(a.requestId || ''))) return null;
    const w = P.wordsOfItem(it);
    const target = P.targetOfAction(a, { label: w.label });
    return { requestId: a.requestId, todoId: it.id, conv: String(a.conv || ''), scope: String(a.scope || a.conv || ''), sessionKey: it.sessionKey || null, who: String(it.sessionName || 'a conversation'),
      words: w.words, purpose: w.purpose, target, place: target ? placeOf(target) : null };
  };
  /** THE INDEX from the store (once — the items outlive a restart; a request is the item). */
  function index() {
    if (indexed || !userTodos) return;
    indexed = true;
    try { for (const it of (userTodos.snapshot?.() || {}).open || []) { const q = recordOf(it); if (q) open.set(q.requestId, q); } } catch (e) { log(`the paste requests could not be read back: ${e.message}`); }
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
  function request({ caller = {}, words, purpose, into, kind, name } = {}) {
    if (caller.job) return named('job_no_use');
    if (!caller.conversationId) return named('unauthorized');
    const v = P.requestVerdict({ words, purpose, into, kind, name });
    if (!v.ok) return v;
    if (!userTodos) return named('unfiled');
    index();
    const conv = String(caller.conversationId), place = placeOf(v.target), target = publicTarget(v.target);
    for (const q of open.values()) if (q.conv === conv && q.place === place) return { ok: true, already: 'open', requestId: q.requestId, target };
    const qu = quiet.get(`${conv}\n${place}`);
    if (qu && qu > now()) return named('request_quiet', { until: new Date(qu).toISOString() });
    if ([...open.values()].filter((q) => q.conv === conv).length >= P.LIMITS.openPerConversation || open.size >= P.LIMITS.openHubWide) return named('too_many_requests');
    const requestId = `sr-${crypto.randomBytes(6).toString('hex')}`;
    const who = String(VB.actorName(caller.name, 'a conversation')).slice(0, 80);
    const card = P.cardOf({ who, words: v.words, purpose: v.purpose, target: v.target, replaces: replacesOf(v.target) });
    const scope = String(caller.scope || conv);
    let it;
    try {
      it = userTodos.add(caller.sessionKey || 'vault', {
        origin: 'vault', kind: 'action', urgency: 'high', by: 'agent', sessionName: who,   // NO expiresAt: it waits for the owner (a restart keeps it)
        text: card.text, detail: card.detail, i18n: card.i18n,
        action: { type: 'secret-request', requestId, into: P.intoOf(v.target), kind: v.target.kind === 'entry' ? v.target.entryKind : '', conv, scope },   // = P.ACTION_TYPE (spelled for the approval census's grep) — ids and the place; the words are the item's own (a clear takes them), never a value
      });
    } catch (e) { log(`${who}: the paste request could not be filed in For you: ${e.message}`); return named('unfiled'); }
    if (!it || !it.id) return named('unfiled');
    open.set(requestId, { requestId, todoId: it.id, conv, scope, sessionKey: caller.sessionKey || null, who, words: v.words, purpose: v.purpose, target: v.target, place });
    audit('vault-secret-request', { by: { kind: 'agent', key: caller.sessionKey || null, name: caller.name || null }, conv: scope, place: v.target.kind === 'field' ? P.intoOf(v.target) : `a new ${v.target.entryKind} entry`, purpose: v.purpose, requestId });
    return { ok: true, requestId, target };
  }
  /** The target as an answer says it (no label of the owner's: the agent's own words and the registry's names). */
  function publicTarget(t) { return t.kind === 'field' ? { into: P.intoOf(t), row: t.rowLabel, field: t.fieldLabel } : { entry: 'new', kind: t.entryKind, label: t.label }; }

  /**
   * THE OWNER ANSWERS (the route: a person on this page; the value already taken off the request body).
   * answer 'store' + value ⇒ the ONE writer of the place · 'deny' ⇒ refused. → { ok: true, outcome, … } | a refusal.
   */
  function answer(requestId, { answer: a, value = null, by = 'user', person = false } = {}) {
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
    } else {
      if (st !== 'unlocked') return named(st === 'locked' ? 'vault_locked' : 'vault_not_set_up');
      entry = `${P.ENTRY_PREFIX}${crypto.randomBytes(5).toString('hex')}`;
      const r = vault.secretPut(entry, vv.value, { prov: 'owner', actor: who, label: q.target.label, kind: q.target.entryKind, note: `Asked for by ${who}: ${q.purpose}`.slice(0, P.LIMITS.note) });
      if (!r || !r.ok) { const c = String((r && r.code) || ''); return named(c.includes('vault_locked') ? 'vault_locked' : c === 'vault_not_set_up' ? 'vault_not_set_up' : 'store_failed'); }
      ref = `vault://secrets/${entry}/${P.ENTRY_FIELD}`;
      if (vaultRun && typeof vaultRun.grantPasted === 'function') { try { const g = vaultRun.grantPasted({ scope: q.scope, ref, purpose: q.purpose, by, requestId: id }); if (g && g.ok) grantHours = g.hours; } catch (e) { log(`${q.requestId}: the run grant could not be written: ${e.message}`); } }
    }
    let receipt = null;
    try { receipt = (vault.noteUse(entry, { by: 'agent', door: 'paste', conv: q.scope }, { outcome: 'ok', purpose: q.purpose, actor: who }) || {}).receipt || null; } catch { /* the store answered: the use line is the audit's */ }
    audit('vault-secret-stored', { by: String(by).slice(0, 40), conv: q.scope, requestId: id, place: q.target.kind === 'field' ? P.intoOf(q.target) : entry, receipt });
    mark();
    settle(q, 'stored', { ref, grantHours, receipt });
    return { ok: true, outcome: 'stored', ...(q.target.kind === 'field' ? { into: P.intoOf(q.target) } : { entry, ref }) };
  }

  // THE ITEM AND THE REQUEST ARE ONE STATE: the item leaving 'open' by another door is a refusal the agent is told
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it, { status, by } = {}) => {
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
  if (typeof vault.onLock === 'function') vault.onLock(() => { index(); for (const q of [...open.values()]) settle(q, 'withdrawn', { why: 'locked' }); });
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
    const r = vault.secretPut(entry, vv.value, { prov: 'owner', label: m.label, note: m.note, kind: m.kind });
    if (!r || !r.ok) { const c = String((r && r.code) || ''); return named(c.includes('vault_locked') ? 'vault_locked' : 'store_failed'); }
    audit('vault-secret-added', { by: String(by).slice(0, 40), entry, kind: m.kind });   // the name and the kind — never the label's value, never the value
    return { ok: true, entry, ref: `vault://secrets/${entry}/${P.ENTRY_FIELD}`, label: m.label, kind: m.kind };
  }
  /** A free entry's delete door (its row's 删除 in the Vault window) — `id` = the part after `secret:`. A locked vault forgets too
   *  (the engine's secretDrop needs no key). */
  function dropEntry(id, { by = 'user' } = {}) {
    const entry = `${P.ENTRY_PREFIX}${String(id || '')}`;
    if (!/^secret:[\w.-]{1,160}$/.test(entry)) return named('entry_unknown_id');
    const r = vault.secretDrop(entry);
    if (!r || !r.ok) return named('store_failed');
    if (r.already) return named('entry_unknown_id');
    audit('vault-secret-deleted', { by: String(by).slice(0, 40), entry });
    return { ok: true, entry };
  }
  /** The open requests of ONE conversation (`vibespace-vault uses` — words, places, times; never a value). */
  function openFor(conv) { index(); return [...open.values()].filter((q) => q.conv === String(conv || '') || q.scope === String(conv || '')).map((q) => ({ requestId: q.requestId, words: q.words, purpose: q.purpose, place: q.target ? (q.target.kind === 'field' ? P.intoOf(q.target) : `a new ${q.target.entryKind} entry «${q.target.label}»`) : null })); }

  return { request, answer, addEntry, dropEntry, openFor, statusOf, words: (code) => MORE_WORDS[code] || P.WORDS[code] || code };
}

module.exports = { create, MORE_WORDS, STATUS, FROM_NAME };

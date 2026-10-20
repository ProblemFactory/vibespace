'use strict';
/**
 * VIBESPACE'S OWN AUTOMATION — the engine (ORCH; design q-046 L1, lane automation-keys-core). The rules are PURE
 * src/automation-keys.js; this file is the store, the vault entries, the audit, the first-use card and the verbs' doors.
 *
 *   · THE STORE data/automation-keys.json (0600, tmp `wx` + fsync + rename — writeJsonAtomic below): the keys' records
 *     (a sha256 DIGEST, never a value) and the grants. A key's VALUE is the vault entry `apikey:<id>` and lives nowhere
 *     else: `mint` seals it and forgets it; nothing here returns it (the Vault window's reveal is the one road out, to hand
 *     to an outside party — src/server/vault-contents.js, audited `vault-reveal`).
 *   · GRANTS are a PERSON's: the window's 授权给… and the answer to the first-use card (both cookie routes). An agent's
 *     session token never writes one (src/routes/automation.js refuses every bearer on those doors).
 *   · `use({caller, verb, args, want})` = ONE judgment on the hub (PURE useVerdict over the caller's session, its Task
 *     Groups, the key's scope and the vault's state), then the verb, then ONE audit line (data/automation-audit.jsonl,
 *     0600: {at, key, subject, verb, args — names and ids only, ok, code}). An existing key with no grant for the caller
 *     files ONE urgent For-you card per (key, subject) — 允许一次 / 一直 / 拒绝, 60 s, then refused; a refusal quiets the
 *     pair 10 minutes; the item and the ask are ONE state (hub-act-ask's discipline) — and the call waits for it.
 *   · THE VAULT LOCKED ⇒ every use answers 423 `vault_locked`, every use waiting on a card too (`onLock`); nothing is cached
 *     across a lock and `onOpen` warms nothing (a use never needs a value: the grant table decides).
 *   · THE VERBS are the closed table's (PURE SCOPES); `verbs` maps the WIRED ones to their server-side doors (L1:
 *     conversations.rename — src/server/conversation-ops.js); every other verb answers 501 `verb_not_wired` (L2 wires them).
 *   · THE LIMITS (lane automation-open-limits — the q-048 verify's M2): a conversations.open is judged against its key's
 *     limits (PURE openLimitsVerdict) over the EFFECTIVE open — the folder's real path (`openFacts.realpath`), the default
 *     account and model the spawn would use (`openFacts.defaults(backend)`) — AFTER the grant and BEFORE the grant is spent,
 *     the spend authorizer runs and anything spawns; the refusal is audited with its code and names the key's limits. An
 *     open its key may not make files no first-use card. 边界… (`setLimits`, a person's door) sets them.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('../automation-keys.js');

const ACTION_TYPE = 'automation-ask';
const SETTLED_MAX = 256, RECENT_MAX = 512, AUDIT_READ_MAX = 2000;
const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const named = (code, why = null, extra = {}) => ({ ok: false, code, ...(why ? { why } : {}), ...extra });
/** THE atomic persistence law: tmp opened `wx` 0600 (a planted file or link at its name is an error), fsync, rename. */
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeSync(fd, JSON.stringify(obj, null, 1)); try { fs.fsyncSync(fd); } catch { /* best effort */ } } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
}

/**
 * @param {object} o
 * @param {string} o.dataDir
 * @param {object} o.vault       src/server/vault-engine.js (state, secretPut, secretDrop, onLock)
 * @param {object} [o.userTodos] the For-you store (the first-use card)
 * @param {(token: string) => ({conversationId, sessionKey, name, live, groups: string[]} | null)} [o.callerOf]  a vsst_ → its conversation
 * @param {Object<string, (args: object, ctx: object) => (object|Promise<object>)>} [o.verbs]  the wired verbs' doors
 */
function create({ dataDir, vault, userTodos = null, verbs = {}, now = () => Date.now(), log = () => {}, randomBytes = crypto.randomBytes,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }, openFacts = {} } = {}) {
  if (!dataDir || !vault) throw new TypeError('automation-engine: dataDir and vault are required');
  // lane automation-open-limits: the facts an open's limits are judged over — a folder's real path (null = missing) and the
  // hub's defaults for what an open does not name (the wiring hands the account store's and the instance's)
  const realpath = typeof openFacts.realpath === 'function' ? openFacts.realpath : (p) => { try { return fs.realpathSync.native(p); } catch { return null; } };
  const FILE = path.join(dataDir, A.STORE_FILE), AUDIT = path.join(dataDir, A.AUDIT_FILE);
  const asks = new Map();      // askId → {askId, keyId, keyName, subject, sessionKey, who, verb, askedAt, waiters, todoId, timer}
  const byPair = new Map();    // `${keyId}|${subject}` → askId (ONE card per pair)
  const quiet = new Map();     // pair → until (a refusal / an expiry quiets it 10 minutes)
  const settled = new Map();   // askId → 'settled' | 'expired' (a second answer says which)

  // ── THE STORE ──
  function read() {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { if (!(e && e.code === 'ENOENT')) log(`automation-keys.json could not be read (${e.code || e.message}) — no key is usable until it is fixed`); return { keys: [], grants: [], bad: !(e && e.code === 'ENOENT') }; }
    const keys = (raw && Array.isArray(raw.keys) ? raw.keys : []).map(A.keyOf).filter(Boolean);
    const grants = (raw && Array.isArray(raw.grants) ? raw.grants : []).map(A.grantOf).filter((g) => g && g.id && keys.some((k) => k.id === g.keyId));
    return { keys, grants, bad: false };
  }
  let db = read();
  function write(next) {
    writeJsonAtomic(FILE, { v: 1, keys: next.keys, grants: next.grants });
    db = { keys: next.keys, grants: next.grants, bad: false };
  }
  const keyById = (id) => db.keys.find((k) => k.id === id) || null;
  function audit(line) {
    try { fs.appendFileSync(AUDIT, JSON.stringify(A.auditLine({ at: now(), ...line })) + '\n', { mode: 0o600 }); } catch (e) { log(`the automation audit line could not be written (${e.code || e.message})`); }
  }
  const vaultState = () => { try { return vault.state(); } catch { return 'locked'; } };
  const newId = (prefix) => `${prefix}-${randomBytes(6).toString('hex')}`;

  // ── THE OWNER'S DOORS (the cookie routes only) ──
  /** Mint a key: the value sealed as `apikey:<id>`, the record (digest only) written; the value is forgotten here. */
  function mint({ name, scopes, limits, by = 'user' } = {}) {
    if (vaultState() !== 'unlocked') return named(vaultState() === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked');
    if (db.bad) return named('failed', 'data/automation-keys.json could not be read — nothing is written over it');
    const plan = A.mintPlan({ name, scopes, limits, by, now: now(), randomBytes, sha256 });
    if (!plan.ok) return plan;
    if (db.keys.some((k) => !k.revokedAt && k.name === plan.record.name)) return named('bad_args', `a key named "${plan.record.name}" exists — names tell keys apart`);
    const put = vault.secretPut(plan.entry, plan.value);
    plan.value = null;
    if (!put || !put.ok) return named(put && /vault_locked/.test(String(put.code)) ? 'vault_locked' : 'failed', put && put.code);
    try { write({ keys: [...db.keys, plan.record], grants: db.grants }); }
    catch (e) { try { vault.secretDrop(plan.entry); } catch { } return named('failed', `the key list could not be written (${e.code || e.message})`); }
    audit({ keyId: plan.record.id, subject: 'owner', verb: 'key.mint', ok: true, by });
    return { ok: true, key: A.publicKey(plan.record) };
  }
  /** Revoke: the record keeps its history (revokedAt), the VALUE leaves the vault, every grant of it stops working, a
   *  card up for it settles refused. Works locked too (forgetting needs no DEK). */
  function revoke(keyId, { by = 'user' } = {}) {
    const k = keyById(keyId);
    if (!k) return named('not_found');
    if (k.revokedAt) return { ok: true, already: true, key: A.publicKey(k) };
    const next = { ...k, revokedAt: now() };
    try { write({ keys: db.keys.map((x) => (x.id === k.id ? next : x)), grants: db.grants.filter((g) => g.keyId !== k.id) }); }
    catch (e) { return named('failed', `the key list could not be written (${e.code || e.message})`); }
    try { const d = vault.secretDrop(A.entryOf(k.id)); if (d && !d.ok) log(`${k.id}: the vault entry could not be dropped (${d.code}) — the key is revoked all the same`); } catch { }
    for (const q of [...asks.values()]) if (q.keyId === k.id) settle(q, 'denied', { why: 'revoked' });
    audit({ keyId: k.id, subject: 'owner', verb: 'key.revoke', ok: true, by });
    return { ok: true, key: A.publicKey(next) };
  }
  /** Grant a key to subjects (a conversation `session:<id>` / a Task Group `group:<id>`) — `always` unless a card's once. */
  function grant(keyId, subjects, { by = 'user', mode = 'always', fromAsk = false } = {}) {
    const k = keyById(keyId);
    if (!k) return named('not_found');
    if (k.revokedAt) return named('key_revoked');
    const list = (Array.isArray(subjects) ? subjects : [subjects]).map(String);
    if (!list.length) return named('bad_args', 'name at least one conversation or task group');
    const badOne = list.find((s) => !A.isSubject(s) || s === 'external');
    if (badOne) return named('bad_args', badOne === 'external' ? 'an outside caller (external) is not grantable yet — L3' : `not a conversation or task group: "${String(badOne).slice(0, 80)}"`);
    if (!A.MODES.includes(mode)) return named('bad_args', 'mode is always or once');
    const t = now(), added = [];
    const grants = db.grants.slice();
    for (const s of list) {
      if (mode === 'always' && grants.some((g) => g.keyId === k.id && g.subject === s && g.mode === 'always')) continue;
      const g = { id: newId('ag'), keyId: k.id, subject: s, mode, at: t, by: String(by).slice(0, 60), spentAt: null };
      grants.push(g); added.push(g);
    }
    if (!added.length) return { ok: true, added: [], already: true };
    try { write({ keys: db.keys, grants }); } catch (e) { return named('failed', `the grants could not be written (${e.code || e.message})`); }
    for (const g of added) audit({ keyId: k.id, subject: g.subject, verb: 'key.grant', ok: true, by, ask: mode === 'once' ? 'once' : null });
    // a card up for a pair an ALWAYS grant now covers (the owner granted in the WINDOW meanwhile) settles allowed — a card's
    // own answer (once or always) settles only that card, in answer() (q-048 verify M3: one card per verb)
    if (mode === 'always' && !fromAsk) for (const q of [...asks.values()]) if (q.keyId === k.id && added.some((g) => g.subject === q.subject || q.groups.includes(g.subject))) settle(q, 'always', { answeredBy: by, why: 'granted' });
    return { ok: true, added };
  }
  /** 边界… (lane automation-open-limits — the owner's edit): the key's limits become his pick (PURE limitsPlan — refused by
   *  name, never trimmed); a key minted before limits gets its first ones HERE, never by a default. Audited `key.limits`. */
  function setLimits(keyId, limits, { by = 'user' } = {}) {
    if (vaultState() !== 'unlocked') return named(vaultState() === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked');
    db = read();
    if (db.bad) return named('failed', 'data/automation-keys.json could not be read — nothing is written over it');
    const k = keyById(keyId);
    if (!k) return named('not_found');
    if (k.revokedAt) return named('key_revoked');
    const plan = A.limitsPlan(limits, k.scopes);
    if (!plan.ok) return plan;
    const next = { ...k, limits: plan.limits };
    try { write({ keys: db.keys.map((x) => (x.id === k.id ? next : x)), grants: db.grants }); }
    catch (e) { return named('failed', `the key list could not be written (${e.code || e.message})`); }
    audit({ keyId: k.id, subject: 'owner', verb: 'key.limits', ok: true, by });
    return { ok: true, key: A.publicKey(next) };
  }
  /** Take a grant back (the window's ✕ on a 授权给 chip). */
  function ungrant(grantId, { by = 'user' } = {}) {
    const g = db.grants.find((x) => x.id === grantId);
    if (!g) return named('not_found');
    try { write({ keys: db.keys, grants: db.grants.filter((x) => x.id !== grantId) }); } catch (e) { return named('failed', `the grants could not be written (${e.code || e.message})`); }
    audit({ keyId: g.keyId, subject: g.subject, verb: 'key.ungrant', ok: true, by });
    return { ok: true };
  }
  /** The window's list: every key (public fields) with its grants (never a value, never a digest). */
  function list() {
    db = read();
    return { ok: true, state: vaultState(), keys: db.keys.map((k) => ({ ...A.publicKey(k), grants: db.grants.filter((g) => g.keyId === k.id).map((g) => ({ id: g.id, subject: g.subject, mode: g.mode, at: g.at, by: g.by, spentAt: g.spentAt })) })), asks: listAsks() };
  }
  /** The Vault window's inventory rows (src/server/vault-contents.js, group «Automation keys»): one row per live key —
   *  names and dates only; `vaultReveal` = its value, ONE per reveal (the contents' door audits it `vault-reveal`). */
  function vaultRows() {
    return db.keys.filter((k) => !k.revokedAt).map((k) => ({ entry: A.entryOf(k.id), field: 'key', kind: 'api-key', label: k.name, detail: 'Only to hand to an outside party', createdAt: k.createdAt, bytes: 48 }));
  }
  function vaultReveal(entry) {
    const id = A.keyIdOfEntry(entry);
    const k = id ? keyById(id) : null;
    if (!k || k.revokedAt) return null;
    const g = vault.secretGet(A.entryOf(k.id));
    if (!g || !g.ok) throw Object.assign(new Error((g && g.code) || 'error'), { code: (g && g.code) || 'error' });
    if (!g.value) return null;
    try { return g.value.toString('utf8'); } finally { g.value.fill(0); }
  }

  // ── THE FIRST-USE CARD (hub-act-ask's discipline) ──
  // q-048 verify M3: ONE CARD PER VERB — the pair is key × conversation × verb; a joined verb rode the first one's card
  // (it named only that verb) and an Always for a rename released a waiting billed open. Each answer releases its own
  const pairOf = (keyId, subject, verb) => `${keyId}|${subject}|${verb}`;
  function listAsks() { return [...asks.values()].map((q) => ({ askId: q.askId, keyId: q.keyId, key: q.keyName, subject: q.subject, who: q.who, verb: q.verb, waiting: q.waiters.length, askedAt: q.askedAt, expiresAt: q.askedAt + A.ASK_TTL_MS })); }
  function settle(q, outcome, { answeredBy = null, why = outcome } = {}) {
    if (!asks.has(q.askId)) return false;
    asks.delete(q.askId);
    if (byPair.get(q.pair) === q.askId) byPair.delete(q.pair);
    settled.set(q.askId, outcome === 'expired' ? 'expired' : 'settled');
    while (settled.size > SETTLED_MAX) settled.delete(settled.keys().next().value);
    try { timers.clear(q.timer); } catch { }
    if (outcome === 'denied' || outcome === 'expired') { quiet.set(q.pair, now() + A.ASK_QUIET_MS); while (quiet.size > RECENT_MAX) quiet.delete(quiet.keys().next().value); } else quiet.delete(q.pair);
    if (q.todoId && userTodos) { try { const it = userTodos.get?.(q.todoId); if (it && it.status === 'open') userTodos.setStatus(q.todoId, 'done', outcome === 'expired' ? 'ask-expired' : why === 'gone' ? 'ask-over' : outcome); } catch { } }
    log(`${q.who}: the ask to use key "${q.keyName}" for ${q.verb} ${outcome === 'expired' ? 'got no answer in 60 s' : outcome}${answeredBy ? ` by ${answeredBy}` : ''} (${q.waiters.length} call(s))`);
    for (const w of q.waiters) { try { w(outcome, answeredBy); } catch { } }
    return true;
  }
  /** Ask the owner (≤ 60 s). → Promise<{outcome, answeredBy}> (`allowed` | `always` | `denied` | `expired` | `unfiled` | `quiet` | `vault_locked` | `gone`).
   *  `signal` = the call's own (the door aborts it when the caller's request closes): q-048 verify M1 — a caller that went
   *  away is WITHDRAWN from the card, and its last waiter gone closes the card (ask-over), so an answer runs nothing */
  function ask({ key, caller, verb, signal = null }) {
    const subject = `session:${caller.conversationId}`, pair = pairOf(key.id, subject, verb);
    const q0 = quiet.get(pair);
    if (q0 && q0 > now()) return Promise.resolve({ outcome: 'quiet', until: q0 });
    if (signal && signal.aborted) return Promise.resolve({ outcome: 'gone' });
    return new Promise((resolve) => {
      const waiter = (outcome, answeredBy) => resolve({ outcome, answeredBy });
      const withdrawOn = (q) => signal && signal.addEventListener('abort', () => {
        if (!asks.has(q.askId) || !q.waiters.includes(waiter)) return;
        q.waiters = q.waiters.filter((x) => x !== waiter);
        resolve({ outcome: 'gone' });
        if (!q.waiters.length) settle(q, 'gone', { why: 'gone' });
      }, { once: true });
      const open = byPair.get(pair);
      if (open && asks.has(open)) { asks.get(open).waiters.push(waiter); withdrawOn(asks.get(open)); return; }
      const askId = randomBytes(16).toString('hex');
      const who = String(caller.name || caller.sessionKey || caller.conversationId).slice(0, 80);
      const q = { askId, pair, keyId: key.id, keyName: key.name, subject, groups: (caller.groups || []).map((g) => `group:${g}`), sessionKey: caller.sessionKey || null, who, verb, askedAt: now(), waiters: [waiter], todoId: null, timer: null };
      asks.set(askId, q); byPair.set(pair, askId);
      if (userTodos) {
        try {
          const verbWord = verb;   // the verb's id (a closed-table name — the same in every language; a parameter is never translated)
          const it = userTodos.add(caller.sessionKey || 'vault', {
            origin: 'vault', urgency: 'urgent', kind: 'action', by: 'agent', sessionName: who, expiresAt: q.askedAt + A.ASK_TTL_MS,
            text: `${who} wants to use the automation key "${key.name}" (${verbWord})`,
            detail: `Allow once lets this call go ahead. Always grants the key to this conversation (the Vault window lists it; take it back there). Deny refuses it and asks no more for 10 minutes. No answer in 60 s: refused. The key's value is never shown to the conversation.`,
            i18n: { text: { key: '{who} wants to use the automation key "{key}" ({verb})', params: { who, key: key.name, verb: verbWord } },
              detail: [{ key: 'Allow once lets this call go ahead. Always grants the key to this conversation (the Vault window lists it; take it back there). Deny refuses it and asks no more for 10 minutes. No answer in 60 s: refused. The key\'s value is never shown to the conversation.' }] },
            action: { type: 'automation-ask', askId, keyId: key.id, key: String(key.name).slice(0, 60), verb, subject },
          });
          q.todoId = it && it.id;
        } catch (e) {
          asks.delete(askId); byPair.delete(pair);
          log(`${who}: the ask to use key "${key.name}" could not be filed in For you: ${e.message}`);
          resolve({ outcome: 'unfiled' });
          return;
        }
      }
      q.timer = timers.set(() => settle(q, 'expired', { why: 'timeout' }), A.ASK_TTL_MS);
      q.timer?.unref?.();
      withdrawOn(q);
    });
  }
  /** A PERSON's answer (the cookie route): once ⇒ a once-grant spent by the waiting call(s) · always ⇒ an always-grant to
   *  the conversation · deny. → { ok, state } | a named refusal (ask_unknown / ask_settled / ask_expired). */
  function answer(askId, { answer: a, answeredBy = 'user' } = {}) {
    const id = String(askId || '');
    const q = asks.get(id);
    if (!q) return named(settled.get(id) === 'expired' ? 'ask_expired' : settled.has(id) ? 'ask_settled' : 'ask_unknown');
    if (now() - q.askedAt >= A.ASK_TTL_MS) { settle(q, 'expired', { why: 'timeout' }); return named('ask_expired'); }
    if (!['once', 'always', 'deny'].includes(a)) return named('bad_args', 'the answer is once, always or deny');
    if (a === 'deny') { settle(q, 'denied', { answeredBy, why: 'answered' }); return { ok: true, state: 'denied' }; }
    if (vaultState() !== 'unlocked') { settle(q, 'vault_locked', { answeredBy }); return named('vault_locked'); }
    const g = grant(q.keyId, [q.subject], { by: answeredBy, mode: a === 'always' ? 'always' : 'once', fromAsk: true });
    if (!g.ok) { settle(q, 'denied', { answeredBy, why: g.code }); return g; }
    settle(q, a === 'always' ? 'always' : 'allowed', { answeredBy, why: 'answered' });   // THIS card only (verify M3: another verb's card waits for its own answer)
    return { ok: true, state: a === 'always' ? 'always' : 'allowed' };
  }
  // THE ITEM AND THE ASK ARE ONE STATE: the item leaving 'open' by another door settles the ask refused; a reopen of an
  // ask that is over goes back to done
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it, { status, by }) => {
      if (!it || !it.action || it.action.type !== ACTION_TYPE) return;
      const q = asks.get(String(it.action.askId || ''));
      if (status === 'open') { if (!q) { try { userTodos.setStatus(it.id, 'done', 'ask-over'); } catch { } } return; }
      if (!q || q.todoId !== it.id) return;
      settle(q, by === 'expired' ? 'expired' : 'denied', { why: by === 'expired' ? 'timeout' : `item-${String(status)}-by-${String(by || 'user')}` });
    });
  }
  /** Boot: a card a previous process filed can never be answered (the call it held died with it). */
  function reconcile() {
    if (!userTodos) return 0;
    let n = 0;
    try { for (const it of (userTodos.snapshot?.() || {}).open || []) if (it && it.action && it.action.type === ACTION_TYPE && !asks.has(it.action.askId)) { try { userTodos.setStatus(it.id, 'done', 'ask-expired'); n++; } catch { } } } catch (e) { log(`automation ask reconcile failed: ${e.message}`); }
    return n;
  }
  // THE LOCK: every call waiting on a card answers 423 now; nothing is cached (a use reads the store and the vault's state each time)
  if (typeof vault.onLock === 'function') vault.onLock(() => { for (const q of [...asks.values()]) settle(q, 'vault_locked', { why: 'locked' }); });

  // ── THE LIMITS (lane automation-open-limits — the q-048 verify's M2) ──
  /** The EFFECTIVE open a call asks for — what the spawn would use: a value it does not name is the hub's default (the
   *  default account the create path bills, the instance's default model); no permission mode = the harness's own. */
  function effectiveOpen(args) {
    const a = args || {};
    const backend = a.backend || 'claude';
    let d = {};
    try { d = (typeof openFacts.defaults === 'function' && openFacts.defaults(backend)) || {}; } catch { d = {}; }
    return { backend, mode: a.mode || 'chat', cwd: a.cwd, accountId: a.pool || d.accountId || null, model: a.model || d.model || null, permissionMode: a.permission || null };
  }
  /** → { ok: true, args } (the open's args — its cwd the REAL folder judged, so the judged path is the opened one) | the
   *  named refusal, carrying the key's limits (names only: what the caller may ask for instead). */
  function limitsJudge(k, args) {
    const v = A.openLimitsVerdict(k.limits, effectiveOpen(args), { realpath });
    if (v.ok) return { ok: true, args: { ...args, cwd: v.cwd } };   // q-049 M1: no `unbounded` — null limits now refuse
    return { ...named(v.code, v.why, { field: v.field, limits: k.limits }), args };
  }

  // ── THE USE ──
  /**
   * ONE call through the door. `caller` = { conversationId, sessionKey, name, live, groups } (the vsst_'s conversation);
   * `want` = a key the caller names (id / name; null = the hub picks). → { ok: true, keyId, result } | { ok: false, code, why? }.
   */
  async function use({ caller, verb, args = {}, want = null, signal = null } = {}) {
    const t0 = now();
    const subject = caller && caller.conversationId ? `session:${caller.conversationId}` : null;
    const done = (r, keyId = null, extra = {}) => { audit({ keyId, subject: subject || 'unknown', verb, args: r.args || extra.args || null, ok: r.ok, code: r.code, ...(extra.ask ? { ask: extra.ask } : {}) }); return r; };
    if (!subject || !A.isSubject(subject)) return done(named('unauthorized', 'the calling conversation has no id yet — send it one message first'));
    const scope = A.scopeOf(verb);
    if (!scope) return done(named('unknown_verb', `no such verb (one of: ${A.VERBS.join(', ')})`));
    const v0 = scope.args(args);
    if (!v0.ok) return done(v0);
    const impl = verbs[verb];
    if (typeof impl !== 'function') return done(named('verb_not_wired', `${verb} is in the table but not wired yet (L2)`, { args: v0.args }), null, { args: v0.args });
    if (vaultState() !== 'unlocked') return done(named(vaultState() === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked', null, { args: v0.args }));
    db = read();
    const groups = Array.isArray(caller.groups) ? caller.groups : [];
    const pick = A.pickKey({ keys: db.keys, grants: db.grants, want, subject, subjectGroups: groups, verb });
    if (!pick.ok) return done({ ...named(pick.code, pick.code === 'key_ambiguous' ? `several keys hold ${verb} — name one with --key (${pick.names.join(', ')})` : null), args: v0.args });
    const key = pick.key;
    let verdict = A.useVerdict({ key, grants: db.grants, subject, subjectGroups: groups, subjectLive: caller.live !== false, verb, vaultState: vaultState() });
    let asked = null;
    if (!verdict.ok && (verdict.code === 'not_granted' || verdict.code === 'once_spent')) {
      // lane automation-open-limits: an open its key may not make files no card — the owner is never asked about it
      if (verb === 'conversations.open') { const pre = limitsJudge(key, v0.args); if (!pre.ok) return done(pre, key.id); }
      const r = await ask({ key, caller, verb, signal });
      asked = r.outcome;
      if (r.outcome === 'gone') return done({ ...named('caller_gone', 'the call went away while its card waited — nothing ran'), args: v0.args }, key.id, { ask: 'gone' });
      if (r.outcome === 'vault_locked') return done({ ...named('vault_locked'), args: v0.args }, key.id, { ask: 'locked' });
      if (r.outcome === 'quiet') return done({ ...named('ask_quiet', `the owner refused this key for this conversation a moment ago — asks again after ${new Date(r.until).toISOString()}`), args: v0.args }, key.id, { ask: 'quiet' });
      if (r.outcome === 'unfiled') return done({ ...named('ask_unfiled', 'the question could not be filed in For you'), args: v0.args }, key.id, { ask: 'unfiled' });
      if (r.outcome !== 'allowed' && r.outcome !== 'always') return done({ ...named(r.outcome === 'expired' ? 'ask_expired' : 'ask_denied'), args: v0.args }, key.id, { ask: r.outcome });
      db = read();
      verdict = A.useVerdict({ key: keyById(key.id), grants: db.grants, subject, subjectGroups: groups, subjectLive: caller.live !== false, verb, vaultState: vaultState() });
      // once: the grant the answer wrote — spent by THIS call (a joined call finds it spent and asks again)
    }
    if (!verdict.ok) return done({ ...named(verdict.code), args: v0.args }, key.id, asked ? { ask: asked } : {});
    // THE LIMITS (lane automation-open-limits — the q-048 verify's M2): WHAT an open asks for, against its key's limits as
    // they stand NOW (re-read — the owner may have edited them while a card waited): AFTER the grant, BEFORE the grant is
    // spent, the spend authorizer runs and anything spawns (impl → conversation-ops openConversation). A refused open is
    // never charged and never spends a once-grant; its audit line carries the code
    let runArgs = v0.args;
    if (verb === 'conversations.open') {
      const lim = limitsJudge(keyById(key.id) || key, v0.args);
      if (!lim.ok) return done(lim, key.id, asked ? { ask: asked } : {});
      runArgs = lim.args;
    }
    // THE GRANT IS SPENT BEFORE THE ACT (a once-grant never runs twice), lastUsedAt stamped
    try {
      const t = now();
      write({ keys: db.keys.map((k) => (k.id === key.id ? { ...k, lastUsedAt: t } : k)), grants: verdict.spend ? db.grants.map((g) => (g.id === verdict.grant.id ? { ...g, spentAt: t } : g)) : db.grants });
    } catch (e) { return done({ ...named('failed', `the key list could not be written (${e.code || e.message}) — nothing ran`), args: v0.args }, key.id); }
    let result;
    // REACH: a verb that names ANOTHER conversation may touch it only when the same key is granted to it (or to one of its
    // Task Groups) — the owner's grants bound what a key reaches, never the caller's say-so
    const reach = (conversationId, targetGroups = []) => !!conversationId && (conversationId === caller.conversationId
      || db.grants.some((g) => g.keyId === key.id && (g.subject === `session:${conversationId}` || (Array.isArray(targetGroups) && targetGroups.some((tg) => g.subject === `group:${tg}`)))));
    try { result = await impl(runArgs, { caller, keyId: key.id, identity: A.identityOf(key.id), grant: verdict.grant, reach }); }
    catch (e) { return done({ ...named('failed', String((e && e.message) || e).slice(0, 200)), args: v0.args }, key.id, asked ? { ask: asked } : {}); }
    // lane automation-verbs: a refusal keeps what the caller can act on — the spend bucket and when it frees, the field it names
    const keep = result && typeof result === 'object' ? Object.fromEntries(['bucket', 'retryAfter', 'field'].filter((k) => result[k] != null).map((k) => [k, result[k]])) : {};
    if (!result || result.ok === false) return done({ ...named((result && result.code) || 'failed', result && result.why), ...keep, args: v0.args }, key.id, asked ? { ask: asked } : {});
    done({ ok: true, args: v0.args }, key.id, asked ? { ask: asked } : {});
    return { ok: true, keyId: key.id, key: key.name, verb, result, ms: now() - t0 };
  }

  /** The keys THIS caller may use now (names + scopes + how it holds each — never a value). */
  function keysFor(caller) {
    db = read();
    const subject = caller && caller.conversationId ? `session:${caller.conversationId}` : null;
    if (!subject) return [];
    const mine = A.callerSubjects(caller.conversationId, caller.groups || []);
    return db.keys.filter((k) => !k.revokedAt).map((k) => {
      const gs = db.grants.filter((g) => g.keyId === k.id && mine.includes(g.subject) && !(g.mode === 'once' && g.spentAt));
      return gs.length ? { id: k.id, name: k.name, scopes: k.scopes.slice(), via: gs.map((g) => ({ subject: g.subject, mode: g.mode })), limits: k.limits } : null;
    }).filter(Boolean);
  }
  /** THIS caller's audit lines (its own conversation's), newest last — names and ids only. */
  function auditFor(caller, { key = null, since = null, limit = 50 } = {}) {
    const subject = caller && caller.conversationId ? `session:${caller.conversationId}` : null;
    if (!subject) return [];
    let text = '';
    try { text = fs.readFileSync(AUDIT, 'utf8'); } catch { return []; }
    const lines = text.split('\n').slice(-AUDIT_READ_MAX * 4).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.subject === subject);
    const s = since ? Date.parse(since) : NaN;
    const out = lines.filter((x) => (!key || x.key === key || (keyById(x.key) || {}).name === key) && (!Number.isFinite(s) || Date.parse(x.at) >= s));
    return out.slice(-Math.max(1, Math.min(500, Number(limit) || 50)));
  }

  /** The OWNER's audit view of one key (the Vault window's 审计… — lane automation-open-limits): its lines, newest first,
   *  names and ids only (a refused open with its code among them). */
  function auditOfKey(keyId, { limit = 50 } = {}) {
    db = read();
    if (!keyById(keyId)) return named('not_found');
    let text = '';
    try { text = fs.readFileSync(AUDIT, 'utf8'); } catch { return { ok: true, lines: [] }; }
    const lines = text.split('\n').slice(-AUDIT_READ_MAX * 4).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.key === keyId);
    return { ok: true, lines: lines.slice(-Math.max(1, Math.min(200, Number(limit) || 50))).reverse() };
  }

  return { list, mint, revoke, grant, ungrant, setLimits, use, answer, reconcile, keysFor, auditFor, auditOfKey, vaultRows, vaultReveal, listAsks, ACTION_TYPE, _asks: asks };
}

module.exports = { create, ACTION_TYPE };

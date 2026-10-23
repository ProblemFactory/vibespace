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
 *     across a lock and `onOpen` warms nothing (a use never needs a value: the grant table decides). A lock also spends every
 *     once-grant no call spent (lane vault-manual-and-lock — the lock ends every one-time grant).
 *   · THE VERBS are the closed table's (PURE SCOPES); `verbs` maps the WIRED ones to their server-side doors (L1:
 *     conversations.rename — src/server/conversation-ops.js); every other verb answers 501 `verb_not_wired` (L2 wires them).
 *   · THE LIMITS (lane automation-open-limits — the q-048 verify's M2): a conversations.open is judged against its key's
 *     limits (PURE openLimitsVerdict) over the EFFECTIVE open — the folder's real path (`openFacts.realpath`), the default
 *     account and model the spawn would use (`openFacts.defaults(backend)`) — AFTER the grant and BEFORE the grant is spent,
 *     the spend authorizer runs and anything spawns; the refusal is audited with its code and names the key's limits. An
 *     open its key may not make files no first-use card. 边界… (`setLimits`, a person's door) sets them.
 *   · `default` IS NOT A CAP (lane automation-open-permission-resolve — q-049 M2): an open that names no permission mode runs
 *     under the CLI's own setting, so `limitsJudge` RESOLVES it (`openFacts.permissionDefault(cwd, backend)` — the hub wires
 *     src/server/permission-rules.js resolveDefaultMode; nothing is required here) for the REAL folder the folder judge
 *     passed, AFTER that judge (the project layer follows the cwd; a folder outside the roots reads no config), and the
 *     RESOLVED mode must be in the key's list (PURE permissionResolvedVerdict) — else `permission_not_allowed` naming the
 *     mode and the layer. A read that throws refuses too (fail closed); no resolver wired = the harness's own, as before.
 *   · B-dbba: an open's first-use card says WHAT it would open — the name the caller gave and the folder (the name rides
 *     the create frame's `sessionName`, src/conversation-spec.js wireOf, so the conversation carries it from the start).
 *   · 编辑… (lane key-folder-picker-all — the owner 2026-10-21: a verb a later release added could not be given to a key
 *     minted before it): `edit(keyId, {scopes, limits})` = the SAME rules (PURE editPlan: mintPlan's scopesPlan + limitsPlan)
 *     and the SAME store write as 铸造…; the value, the digest and the grants never change. A verb removed is refused from
 *     the next call (`verb_not_in_scope`, by name); a verb added rides the key's existing grants (a grant is per key ×
 *     conversation) — no new card. Audited `key.scopes` («scopes changed by the owner: +… -…») and `key.limits`. An open's
 *     card names the key's folders too (「所有路径」 for `/`).
 *   · THE MAINTAINER KEY (lane fleet-feedback-marks): `useMaintainer({token, verb, args})` — PURE maintainerVerdict over
 *     the instance's env sha (`maintainerSha()`, VIBESPACE_MAINTAINER_KEY_SHA; the compare is pairing-token's
 *     tokenMatches), then the verb's OWN door with the maintainer as its caller (reach: the instance) — no store row, no
 *     grant, no card, no vault entry, so the lock does not stop it. ONE audit line, subject `maintainer` (a mark's note:
 *     «marked handled by the maintainer key · 2.369.NNN»); an unknown key is answered `maintainer_key_unknown`, not audited
 *     (the agent door's own rule for an unknown token).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('../automation-keys.js');
const { tokenMatches } = require('../pairing-token.js');   // lane fleet-feedback-marks: the maintainer key's sha, compared in constant time
const GM = require('../grant-model.js');   // lane grants-unify: THE grant model (admits)
const GS = require('./grants-store.js');   // lane grants-unify: a grant's WHO and REACH are rows of the ONE grants store
const VB = require('../vault-blocked.js');   // PURE: a refusal's actor name (lane vault-locked-refusal-notice)

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
function create({ dataDir, vault, userTodos = null, verbs = {}, now = () => Date.now(), log = () => {}, randomBytes = crypto.randomBytes, grants: grantsStore = null,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }, openFacts = {}, attention = null,
  maintainerSha = () => process.env[A.MAINTAINER_SHA_ENV] } = {}) {   // lane fleet-feedback-marks: the instance's maintainer key, by its sha
  if (!dataDir || !vault) throw new TypeError('automation-engine: dataDir and vault are required');
  // lane automation-open-limits: the facts an open's limits are judged over — a folder's real path (null = missing) and the
  // hub's defaults for what an open does not name (the wiring hands the account store's and the instance's)
  const realpath = typeof openFacts.realpath === 'function' ? openFacts.realpath : (p) => { try { return fs.realpathSync.native(p); } catch { return null; } };
  const FILE = path.join(dataDir, A.STORE_FILE), AUDIT = path.join(dataDir, A.AUDIT_FILE);
  // lane grants-unify: a grant's WHO (door automation-key-use) and its REACH (door automation-key-reach) are rows of the ONE grants
  // store, resource = the grant's id; the record here keeps only what is no who (key, mode, stamps, a spent once)
  const grantsOf = typeof grantsStore === 'function' ? grantsStore : () => grantsStore || GS.forDir(dataDir);
  let frozen = new Map();   // grant id → its record as read (a pre-unify record's own `subject` / `reach` stay on disk one release, unread)
  const asks = new Map();      // askId → {askId, keyId, keyName, subject, sessionKey, who, verb, askedAt, waiters, todoId, timer}
  const byPair = new Map();    // `${keyId}|${subject}` → askId (ONE card per pair)
  const quiet = new Map();     // pair → until (a refusal / an expiry quiets it 10 minutes)
  const settled = new Map();   // askId → 'settled' | 'expired' (a second answer says which)

  // ── THE STORE ──
  function read() {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { if (!(e && e.code === 'ENOENT')) log(`automation-keys.json could not be read (${e.code || e.message}) — no key is usable until it is fixed`); return { keys: [], grants: [], opened: [], bad: !(e && e.code === 'ENOENT') }; }
    const keys = (raw && Array.isArray(raw.keys) ? raw.keys : []).map(A.keyOf).filter(Boolean);
    // lane grants-unify: each grant HYDRATED from the store — its use row (a conversation / a Task Group grant with no row is no
    // grant: nobody), its reach row (none = 'opened'); an `external` grant (an outside caller, no conversation) keeps its mark
    const st = grantsOf();
    frozen = new Map();
    const grants = [];
    for (const r of raw && Array.isArray(raw.grants) ? raw.grants : []) {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string') continue;
      frozen.set(r.id, r);
      const reachRows = st ? st.rowsFor('automation-key-reach', r.id) : [];
      const reachRow = reachRows.length ? reachRows[0] : null;
      const { subject: _s, reach: _r, ...rest } = r;
      let h;
      if (r.subject === 'external') h = { ...rest, subject: 'external', reachRow };
      else { const useRows = st ? st.rowsFor('automation-key-use', r.id) : []; if (!useRows.length) continue; h = { ...rest, use: useRows[0], reachRow }; }
      const g = A.grantOf(h);
      if (g && g.id && keys.some((k) => k.id === g.keyId)) grants.push(g);
    }
    // lane conversations-archive-verb: the conversations each key OPENED (PURE reachVerdict's (a)) — persisted here, so the
    // opener still ends / archives its workers after a hub restart (a Map in memory lost them: the owner's hub, .331)
    const opened = (raw && Array.isArray(raw.opened) ? raw.opened : []).map(A.openedOf).filter((o) => o && keys.some((k) => k.id === o.keyId));
    return { keys, grants, opened, bad: false };
  }
  let db = read();
  /** A grant as the file keeps it (lane grants-unify): never its who / reach — the store's rows are — except an outside
   *  caller's `external` mark; a pre-unify record's own old fields are kept as they were (unread). */
  const recordOf = (g) => ({ ...(frozen.get(g.id) || {}), id: g.id, keyId: g.keyId, mode: g.mode, at: g.at, by: g.by, spentAt: g.spentAt, ...(g.subject === 'external' ? { subject: 'external' } : {}) });
  function write(next) {
    const opened = Array.isArray(next.opened) ? next.opened : db.opened || [];
    writeJsonAtomic(FILE, { v: 1, keys: next.keys, grants: next.grants.map(recordOf), opened });
    db = { keys: next.keys, grants: next.grants, opened, bad: false };
  }
  /** THE ONE WRITER for a grant's rows (lane grants-unify): `use` / `reach` = {to, except} (an empty one removes the row). */
  function writeRows(list, by) {
    const st = grantsOf();
    if (!st) return { ok: false, code: 'not_written', error: 'the grants store is not available' };
    return st.setMany(list, String(by || 'user'));
  }
  const dropRows = (gs, by) => writeRows(gs.flatMap((g) => [{ door: 'automation-key-use', resource: g.id, to: [], except: [] }, { door: 'automation-key-reach', resource: g.id, to: [], except: [] }]), by);
  const OPENED_MAX = 2000;   // rows kept, newest last (a dispatcher's workers over months — a few hundred)
  /** A successful open's row — or the conversation id learned later for a row that had only the webui id. Never throws. */
  function noteOpened({ keyId, webuiId = null, conversationId = null }) {
    if (!keyId || (!webuiId && !conversationId)) return;
    const had = db.opened.find((o) => o.keyId === keyId && webuiId && o.webuiId === webuiId);
    if (had && (had.conversationId || !conversationId)) return;   // known already
    const next = had ? db.opened.map((o) => (o === had ? { ...o, conversationId } : o)) : [...db.opened, { keyId, webuiId, conversationId, at: now() }].slice(-OPENED_MAX);
    try { write({ keys: db.keys, grants: db.grants, opened: next }); } catch (e) { log(`the opened row of ${keyId} could not be written (${e.code || e.message})`); }
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
    const goneGrants = db.grants.filter((g) => g.keyId === k.id);
    try { write({ keys: db.keys.map((x) => (x.id === k.id ? next : x)), grants: db.grants.filter((g) => g.keyId !== k.id) }); }
    catch (e) { return named('failed', `the key list could not be written (${e.code || e.message})`); }
    { const w = dropRows(goneGrants, by); if (!w.ok) log(`${k.id}: its grants' rows could not be removed (${w.code}) — the key is revoked all the same (a revoked key admits nobody)`); }
    try { const d = vault.secretDrop(A.entryOf(k.id)); if (d && !d.ok) log(`${k.id}: the vault entry could not be dropped (${d.code}) — the key is revoked all the same`); } catch { }
    for (const q of [...asks.values()]) if (q.keyId === k.id) settle(q, 'denied', { why: 'revoked' });
    audit({ keyId: k.id, subject: 'owner', verb: 'key.revoke', ok: true, by });
    return { ok: true, key: A.publicKey(next) };
  }
  /** Grant a key to subjects (a conversation `session:<id>` / a Task Group `group:<id>`) — `always` unless a card's once.
   *  `reach` (lane key-instance-scope): 'opened' (the default) | 'instance' | {taskGroups: [ids]} — PURE reachOf, refused by name. */
  function grant(keyId, subjects, { by = 'user', mode = 'always', fromAsk = false, reach = 'opened', except = [] } = {}) {
    const k = keyById(keyId);
    if (!k) return named('not_found');
    if (k.revokedAt) return named('key_revoked');
    const list = (Array.isArray(subjects) ? subjects : [subjects]).map(String);
    if (!list.length) return named('bad_args', 'name at least one conversation or task group');
    const badOne = list.find((s) => !A.isSubject(s) || s === 'external');
    if (badOne) return named('bad_args', badOne === 'external' ? 'an outside caller (external) is not grantable yet — L3' : `not a conversation or task group: "${String(badOne).slice(0, 80)}"`);
    if (!A.MODES.includes(mode)) return named('bad_args', 'mode is always or once');
    const rch = A.reachOf(reach);
    if (rch === null) return named('bad_args', 'reach is opened, instance or {taskGroups: [task ids]}');
    if (!Array.isArray(except)) return named('bad_args', 'except is a list of the conversations / Task Groups left out');
    const t = now(), added = [];
    const grants = db.grants.slice();
    const rows = [];
    for (const s of list) {
      if (mode === 'always' && grants.some((g) => g.keyId === k.id && g.subject === s && g.mode === 'always')) continue;
      const id = newId('ag');
      // lane grants-unify: the grant's WHO and REACH are rows of the ONE store (the record keeps the rest)
      // «除了»: a Task Group grant may leave members out (a conversation grant names no members — none ride it)
      const use0 = A.useRowForSubject(s), use = use0 && /^group:/.test(s) ? { ...use0, except } : use0, reachRow = A.reachRowFor(rch);
      rows.push({ door: 'automation-key-use', resource: id, ...use });
      if (reachRow) rows.push({ door: 'automation-key-reach', resource: id, ...reachRow });
      const g = A.grantOf({ id, keyId: k.id, mode, at: t, by: String(by).slice(0, 60), spentAt: null, use: { door: 'automation-key-use', resource: id, ...use }, reachRow: reachRow ? { door: 'automation-key-reach', resource: id, ...reachRow } : null });
      grants.push(g); added.push(g);
    }
    if (!added.length) return { ok: true, added: [], already: true };
    { const w = writeRows(rows, by); if (!w.ok) return named('failed', `the grants could not be written (${w.code}: ${w.error || ''})`); }
    try { write({ keys: db.keys, grants }); } catch (e) { dropRows(added, 'rollback'); return named('failed', `the grants could not be written (${e.code || e.message})`); }
    for (const g of added) audit({ keyId: k.id, subject: g.subject, verb: 'key.grant', ok: true, by, ask: mode === 'once' ? 'once' : null, args: { reach: A.reachKind(g.reach) } });
    // a card up for a pair an ALWAYS grant now covers (the owner granted in the WINDOW meanwhile) settles allowed — a card's
    // own answer (once or always) settles only that card, in answer() (q-048 verify M3: one card per verb)
    // lane grants-unify: «covers» is THE model's answer over the new grant's use row (its own conversation, one of its
    // Task Groups — minus the members the owner left out), never a hand-written membership test
    const covers = (g, q) => GM.admits([A.useRowOf(g)].filter(Boolean), { conversationKeys: [String(q.subject).replace(/^session:/, '')], groupIds: (q.groups || []).map((x) => String(x).replace(/^group:/, '')) }).ok;
    if (mode === 'always' && !fromAsk) for (const q of [...asks.values()]) if (q.keyId === k.id && added.some((g) => covers(g, q))) settle(q, 'always', { answeredBy: by, why: 'granted' });
    return { ok: true, added };
  }
  /** 编辑… (lane key-folder-picker-all — the owner's edit after minting): the key's verbs and limits become his pick through
   *  the mint's own rules (PURE editPlan — refused by name, never trimmed) and the mint's own store write; `scopes` / `limits`
   *  undefined = the key's own; a key minted before limits gets its first ones HERE, never by a default. The value, the
   *  digest and the grants are untouched. Audited `key.scopes` (the change in words) and `key.limits` (when limits came). */
  function edit(keyId, { scopes, limits } = {}, { by = 'user' } = {}) {
    if (vaultState() !== 'unlocked') return named(vaultState() === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked');
    db = read();
    if (db.bad) return named('failed', 'data/automation-keys.json could not be read — nothing is written over it');
    const k = keyById(keyId);
    if (!k) return named('not_found');
    if (k.revokedAt) return named('key_revoked');
    const plan = A.editPlan(k, { scopes, limits });
    if (!plan.ok) return plan;
    const next = { ...k, scopes: plan.scopes, limits: plan.limits };
    try { write({ keys: db.keys.map((x) => (x.id === k.id ? next : x)), grants: db.grants }); }
    catch (e) { return named('failed', `the key list could not be written (${e.code || e.message})`); }
    if (plan.added.length || plan.removed.length) audit({ keyId: k.id, subject: 'owner', verb: 'key.scopes', ok: true, by, note: A.scopesChangeWords(plan) });
    if (limits !== undefined) audit({ keyId: k.id, subject: 'owner', verb: 'key.limits', ok: true, by });
    return { ok: true, key: A.publicKey(next), added: plan.added, removed: plan.removed };
  }
  /** THE REACH OF A GRANT, changed (lane key-instance-scope — the Vault window's reach chip on a 授权给 chip): the same store
   *  write the first-use card makes, on an existing row; audited `key.reach`. → { ok, grant } | a named refusal. */
  function setReach(grantId, reach, { by = 'user' } = {}) {
    const g = db.grants.find((x) => x.id === grantId);
    if (!g) return named('not_found');
    const k = keyById(g.keyId);
    if (!k || k.revokedAt) return named('key_revoked');
    const rch = A.reachOf(reach);
    if (rch === null) return named('bad_args', 'reach is opened, instance or {taskGroups: [task ids]}');
    // lane grants-unify: the reach is the grant's reach row (the members it left out kept while the kind stays)
    const was = g.reachRow ? GM.normRow(g.reachRow) : null;
    const rr = A.reachRowFor(rch);
    const keepExcept = rr && was && was.ok && A.reachKind(rch) === A.reachKind(g.reach) ? was.row.except : [];
    { const w = writeRows([{ door: 'automation-key-reach', resource: g.id, to: rr ? rr.to : [], except: rr ? keepExcept : [] }], by); if (!w.ok) return named('failed', `the grants could not be written (${w.code}: ${w.error || ''})`); }
    const next = A.grantOf({ ...g, reach: undefined, reachRow: rr ? { door: 'automation-key-reach', resource: g.id, to: rr.to, except: keepExcept } : null });
    try { write({ keys: db.keys, grants: db.grants.map((x) => (x.id === g.id ? next : x)) }); } catch (e) { return named('failed', `the grants could not be written (${e.code || e.message})`); }
    audit({ keyId: g.keyId, subject: g.subject, verb: 'key.reach', ok: true, by, args: { reach: A.reachKind(rch) } });
    return { ok: true, grant: { id: next.id, subject: next.subject, mode: next.mode, at: next.at, by: next.by, spentAt: next.spentAt, reach: next.reach } };
  }
  /** «除了» (lane grants-unify): the members a Task Group grant leaves OUT (`except` — they never use the key through it) and
   *  the conversations its reach leaves out (`reachExcept`) — the grant's two rows rewritten through the ONE writer (a list
   *  absent = the row as it is); audited `key.except`. → { ok, grant } | a named refusal. */
  function setExcept(grantId, { except, reachExcept } = {}, { by = 'user' } = {}) {
    const g = db.grants.find((x) => x.id === grantId);
    if (!g) return named('not_found');
    const k = keyById(g.keyId);
    if (!k || k.revokedAt) return named('key_revoked');
    for (const [f, v] of [['except', except], ['reachExcept', reachExcept]]) if (v !== undefined && !Array.isArray(v)) return named('bad_args', `${f} is a list of the conversations / Task Groups left out`);
    if (except === undefined && reachExcept === undefined) return named('bad_args', 'name except and / or reachExcept');
    const rows = [];
    let use = g.use, reachRow = g.reachRow;
    if (except !== undefined) {
      const n = g.use ? GM.normRow(g.use) : null;
      if (!n || !n.ok) return named('failed', 'this grant\'s row cannot be read — take it back and grant it again');
      if (except.length && !n.row.to.some((e) => e.kind === 'group' || e.kind === 'everyone')) return named('bad_args', 'a grant to one conversation has no members to leave out');
      use = { door: 'automation-key-use', resource: g.id, to: n.row.to, except };
      rows.push(use);
    }
    if (reachExcept !== undefined) {
      const n = g.reachRow ? GM.normRow(g.reachRow) : null;
      if (!n || !n.ok) { if (reachExcept.length) return named('bad_args', 'this grant reaches only what it opened — nothing to leave out'); }
      else { reachRow = { door: 'automation-key-reach', resource: g.id, to: n.row.to, except: reachExcept }; rows.push(reachRow); }
    }
    if (rows.length) { const w = writeRows(rows, by); if (!w.ok) return named(w.code === 'bad_except' || w.code === 'except_conflicts' ? 'bad_args' : 'failed', `the exceptions could not be written (${w.code}: ${w.error || ''})`); }
    const next = A.grantOf({ ...g, reach: undefined, use, reachRow });
    if (next) db = { ...db, grants: db.grants.map((x) => (x.id === g.id ? next : x)) };
    audit({ keyId: g.keyId, subject: g.subject, verb: 'key.except', ok: true, by, args: { except: Array.isArray(except) ? except.length : null, reachExcept: Array.isArray(reachExcept) ? reachExcept.length : null } });
    return { ok: true, grant: { id: g.id, subject: g.subject } };
  }
  /** 边界… (lane automation-open-limits): the limits alone — the edit with the key's own verbs (limits are required here). */
  const setLimits = (keyId, limits, opts = {}) => edit(keyId, { limits: limits === undefined ? null : limits }, opts);
  /** Take a grant back (the window's ✕ on a 授权给 chip). */
  function ungrant(grantId, { by = 'user' } = {}) {
    const g = db.grants.find((x) => x.id === grantId);
    if (!g) return named('not_found');
    { const w = dropRows([g], by); if (!w.ok) return named('failed', `the grants could not be written (${w.code}: ${w.error || ''})`); }   // lane grants-unify: nobody, at once
    try { write({ keys: db.keys, grants: db.grants.filter((x) => x.id !== grantId) }); } catch (e) { return named('failed', `the grants could not be written (${e.code || e.message})`); }
    audit({ keyId: g.keyId, subject: g.subject, verb: 'key.ungrant', ok: true, by });
    return { ok: true };
  }
  /** 清理已结束的授权 (lane vault-key-row-compact — the key row's ONE cleanup door): take back EVERY grant of this key whose
   *  conversation is not running (PURE grantEnded over `live`, the running conversations' subjects the route read at the
   *  press — a grant to a conversation that is gone can never be used) — ONE store write and ONE audit line naming what
   *  went (`key.prune`, its note). → { ok, removed: [subjects] } (none ended ⇒ removed: []). */
  function pruneEnded(keyId, live, { by = 'user' } = {}) {
    const k = keyById(keyId);
    if (!k) return named('not_found');
    const gone = db.grants.filter((g) => g.keyId === k.id && A.grantEnded(g, live));
    if (!gone.length) return { ok: true, removed: [] };
    { const w = dropRows(gone, by); if (!w.ok) return named('failed', `the grants could not be written (${w.code}: ${w.error || ''})`); }
    try { write({ keys: db.keys, grants: db.grants.filter((g) => !gone.includes(g)) }); } catch (e) { return named('failed', `the grants could not be written (${e.code || e.message})`); }
    audit({ keyId: k.id, subject: 'owner', verb: 'key.prune', ok: true, by, note: A.pruneWords(gone.map((g) => g.subject)) });
    return { ok: true, removed: gone.map((g) => g.subject) };
  }
  /** The window's list: every key (public fields) with its grants (never a value, never a digest). */
  function list() {
    db = read();
    // lane grants-unify: + each grant's exceptions (the members its Task Group grant / its reach leaves out), as the store keeps them
    const exceptOf = (row) => { const n = row ? GM.normRow(row) : null; return n && n.ok ? n.row.except : []; };
    return { ok: true, state: vaultState(), keys: db.keys.map((k) => ({ ...A.publicKey(k), grants: db.grants.filter((g) => g.keyId === k.id).map((g) => ({ id: g.id, subject: g.subject, mode: g.mode, at: g.at, by: g.by, spentAt: g.spentAt, reach: g.reach, except: exceptOf(g.use), reachExcept: exceptOf(g.reachRow) })) })), asks: listAsks() };
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
  function ask({ key, caller, verb, signal = null, args = null }) {
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
          // B-dbba (lane automation-open-permission-resolve): an open's card says WHAT it would open — the name the caller gave and
          // the folder, as the audit line keeps them (names only, bounded); another verb's card is as before
          const openArgs = verb === 'conversations.open' && args && typeof args === 'object' ? { name: args.name ? String(args.name).slice(0, 60) : '', cwd: String(args.cwd || '').slice(0, 200) } : null;
          const openLine = openArgs ? (openArgs.name ? { key: 'This call would open "{name}" in {cwd}.', params: { name: openArgs.name, cwd: openArgs.cwd } } : { key: 'This call would open a conversation in {cwd}.', params: { cwd: openArgs.cwd } }) : null;
          // lane key-folder-picker-all: an open's card names the KEY's folders as well — 「所有路径」 for `/`, else each root
          // covering its subfolders (the owner decides with the bounds in view)
          const roots = openArgs ? ((A.limitsOf(key.limits) || {}).cwdRoots || []) : [];
          const rootsLine = !openArgs ? null : A.allPaths(key.limits) ? { key: "The key's folders: all paths — any folder on this VibeSpace." }
            : { key: "The key's folders: {roots} (with their subfolders).", params: { roots: roots.join(', ').slice(0, 300) } };
          const fill = (k, p) => k.replace(/\{(\w+)\}/g, (_, n) => (p && p[n] != null ? String(p[n]) : `{${n}}`));
          const D1 = 'Allow once lets this call go ahead. Always grants the key to this conversation (the Vault window lists it; take it back there). Deny refuses it and asks no more for 10 minutes. No answer in 60 s: refused. The key\'s value is never shown to the conversation.';
          const it = userTodos.add(caller.sessionKey || 'vault', {
            origin: 'vault', urgency: 'urgent', kind: 'action', by: 'agent', sessionName: who, expiresAt: q.askedAt + A.ASK_TTL_MS,
            text: `${who} wants to use the automation key "${key.name}" (${verbWord})`,
            detail: [openLine ? fill(openLine.key, openLine.params) : null, rootsLine ? fill(rootsLine.key, rootsLine.params) : null, D1, 'The reach says which other conversations it may rename, end or archive with this key: only the ones it opens (the default), the conversations of its Task Groups, or every conversation on this VibeSpace — change it later on the key\'s row in the Vault window.'].filter(Boolean).join('\n'),
            i18n: { text: { key: '{who} wants to use the automation key "{key}" ({verb})', params: { who, key: key.name, verb: verbWord } },
              detail: [...(openLine ? [openLine] : []), ...(rootsLine ? [rootsLine] : []), { key: D1 },
                // lane key-instance-scope: the card offers the grant's REACH beside its answers (the client draws the three choices off action.groups)
                { key: 'The reach says which other conversations it may rename, end or archive with this key: only the ones it opens (the default), the conversations of its Task Groups, or every conversation on this VibeSpace — change it later on the key\'s row in the Vault window.' }] },
            action: { type: 'automation-ask', askId, keyId: key.id, key: String(key.name).slice(0, 60), verb, subject, groups: q.groups.map((g) => g.slice('group:'.length)).slice(0, 8).join(' ') },   // the caller's Task Group ids, space-joined (an action field is a string; ids hold no space)
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
   *  the conversation · deny. `reach` (lane key-instance-scope): 'opened' (the default) | 'groups' (the caller's Task Groups
   *  — the card named them) | 'instance'. → { ok, state } | a named refusal (ask_unknown / ask_settled / ask_expired). */
  function answer(askId, { answer: a, answeredBy = 'user', reach = 'opened' } = {}) {
    const id = String(askId || '');
    const q = asks.get(id);
    if (!q) return named(settled.get(id) === 'expired' ? 'ask_expired' : settled.has(id) ? 'ask_settled' : 'ask_unknown');
    if (now() - q.askedAt >= A.ASK_TTL_MS) { settle(q, 'expired', { why: 'timeout' }); return named('ask_expired'); }
    if (!['once', 'always', 'deny'].includes(a)) return named('bad_args', 'the answer is once, always or deny');
    if (a === 'deny') { settle(q, 'denied', { answeredBy, why: 'answered' }); return { ok: true, state: 'denied' }; }
    const rk = reach == null || reach === '' ? 'opened' : reach;
    if (!A.REACHES.includes(rk)) return named('bad_args', 'the reach is opened, groups or instance');
    const groups = q.groups.map((s) => s.slice('group:'.length));
    if (rk === 'groups' && !groups.length) return named('bad_args', 'that conversation is in no Task Group — the reach is opened or instance');
    if (vaultState() !== 'unlocked') { settle(q, 'vault_locked', { answeredBy }); return named('vault_locked'); }
    const g = grant(q.keyId, [q.subject], { by: answeredBy, mode: a === 'always' ? 'always' : 'once', fromAsk: true, reach: rk === 'groups' ? { taskGroups: groups } : rk });
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
  // THE LOCK: every call waiting on a card answers 423 now; nothing is cached (a use reads the store and the vault's state each time).
  // lane vault-manual-and-lock (decision ③ — a lock ends every ONE-TIME grant): an «Allow once» its call never spent (the call
  // went away after the answer) is spent by the lock — the next use asks again; «Always» grants are the owner's and stay
  let lockedAt = null;   // the last lock act: a once-grant made at or before it is SPENT whatever the store says (a write that failed below)
  // q-043 L1 (int331 — BOOT IS A LOCK for once-grants): the vault is LOCKED after every start, so a once-grant PERSISTED from a
  // previous run (present in the store at construction) is spent at boot — else an unlock in THIS run would revive it. Captured by
  // identity (keyId·subject·at), so it survives db re-reads and never catches a grant made THIS run at the same (frozen-test) clock.
  const gkey = (g) => `${g.keyId}\u0000${g.subject}\u0000${g.at}`;
  const bootOnce = new Set(db.grants.filter((g) => g.mode === 'once' && !g.spentAt).map(gkey));
  const liveGrants = () => db.grants.map((g) => (g.mode === 'once' && !g.spentAt && ((lockedAt != null && Number(g.at) <= lockedAt) || bootOnce.has(gkey(g))) ? { ...g, spentAt: lockedAt || g.at } : g));
  if (typeof vault.onLock === 'function') vault.onLock(() => {
    for (const q of [...asks.values()]) settle(q, 'vault_locked', { why: 'locked' });
    const t = now(); lockedAt = t;
    const open = db.grants.filter((g) => g.mode === 'once' && !g.spentAt);
    if (!open.length || db.bad) return;
    try { write({ keys: db.keys, grants: db.grants.map((g) => (g.mode === 'once' && !g.spentAt ? { ...g, spentAt: t } : g)) }); }
    catch (e) { log(`the lock could not end ${open.length} unspent once-grant(s) (${e.code || e.message})`); return; }
    for (const g of open) audit({ keyId: g.keyId, subject: g.subject, verb: 'key.grant', ok: false, code: 'vault_locked', by: 'lock', ask: 'once' });
  });

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
  async function limitsJudge(k, args) {
    const eff = effectiveOpen(args);
    const v = A.openLimitsVerdict(k.limits, eff, { realpath });
    if (!v.ok) return { ...named(v.code, v.why, { field: v.field, limits: k.limits }), args };   // q-049 M1: no `unbounded` — null limits now refuse
    // q-049 M2 (lane automation-open-permission-resolve): no permission mode named ⇒ the CLI's own setting runs — resolved for
    // the REAL folder just judged (the folder judge runs FIRST: a folder outside the roots reads no config at all) and judged
    // against the key's list; a mode the open named was judged above by openLimitsVerdict
    if (!eff.permissionMode && typeof openFacts.permissionDefault === 'function') {
      let resolved = null;
      try { resolved = await openFacts.permissionDefault(v.cwd, eff.backend); }
      catch (e) { return { ...named(A.LIMIT_CODES.permissionModes, `the CLI's own permission setting for ${v.cwd} could not be read (${String((e && e.message) || e).slice(0, 120)}) — this key allows only what that setting is`, { field: 'permissionModes', limits: k.limits }), args }; }
      const pv = A.permissionResolvedVerdict(k.limits, resolved);
      if (!pv.ok) return { ...named(pv.code, pv.why, { field: pv.field, limits: k.limits, resolved: { mode: pv.resolved.mode, layer: pv.resolved.layer || null } }), args };
    }
    return { ok: true, args: { ...args, cwd: v.cwd } };
  }

  // ── THE USE ──
  /**
   * ONE call through the door. `caller` = { conversationId, sessionKey, name, live, groups } (the vsst_'s conversation);
   * `want` = a key the caller names (id / name; null = the hub picks). → { ok: true, keyId, result } | { ok: false, code, why? }.
   */
  async function use({ caller, verb, args = {}, want = null, signal = null } = {}) {
    const t0 = now();
    const subject = caller && caller.conversationId ? `session:${caller.conversationId}` : null;
    const done = (r, keyId = null, extra = {}) => {
      // lane vault-locked-refusal-notice: a LOCKED refusal is the signal — the vault's ONE helper notes the conversation by its NAME and the verb
      if (r && r.code === 'vault_locked' && typeof vault.blocked === 'function') { try { vault.blocked(VB.actorName(caller && caller.name, 'a conversation'), `vibespace-api ${verb}`); } catch { } }
      audit({ keyId, subject: subject || 'unknown', verb, args: r.args || extra.args || null, ok: r.ok, code: r.code, ...(extra.ask ? { ask: extra.ask } : {}) });
      // lane vault-window-v2 (design q-047 §3.4): a refusal the owner can act on (locked / not granted / expired) is a 「使用失败」
      // notice in For you — ONE per key per hour (src/server/vault-hooks.js createVaultAttention; the rule PURE in vault-inventory)
      // lane conversations-archive-verb: the notice names the VERB, the TARGET (its name when the verb found it, else the id the
      // caller gave, else the caller itself) and the REASON — one notice per key × verb × reason per hour
      if (!r.ok && attention && typeof attention.useFailed === 'function') { try { const k = keyId ? keyById(keyId) : null; attention.useFailed({ entry: keyId ? `apikey:${keyId}` : null, name: k ? k.name : null, code: r.code, who: caller && caller.name, verb, target: (r.target != null ? String(r.target) : null) || (args && args.target != null ? String(args.target) : null) || (caller && caller.name) || null, why: r.why || null, reach: r.reach || null }); } catch { } }   // lane key-instance-scope: a reach refusal names the reach
      return r;
    };
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
    // lane key-folder-picker-all: the keys this conversation holds lack the verb (the owner took it off, or never gave it) ⇒ said by name
    if (!pick.ok) return done({ ...named(pick.code, pick.code === 'key_ambiguous' ? `several keys hold ${verb} — name one with --key (${pick.names.join(', ')})` : pick.code === 'verb_not_in_scope' ? `the key${pick.names.length > 1 ? 's' : ''} granted to this conversation (${pick.names.join(', ')}) do${pick.names.length > 1 ? '' : 'es'} not hold ${verb} — the owner adds it with Edit… in the Vault window` : null), args: v0.args });
    const key = pick.key;
    let verdict = A.useVerdict({ key, grants: liveGrants(), subject, subjectGroups: groups, subjectLive: caller.live !== false, verb, vaultState: vaultState() });
    let asked = null;
    if (!verdict.ok && (verdict.code === 'not_granted' || verdict.code === 'once_spent')) {
      // lane automation-open-limits: an open its key may not make files no card — the owner is never asked about it
      if (verb === 'conversations.open') { const pre = await limitsJudge(key, v0.args); if (!pre.ok) return done(pre, key.id); }
      const r = await ask({ key, caller, verb, signal, args: v0.args });
      asked = r.outcome;
      if (r.outcome === 'gone') return done({ ...named('caller_gone', 'the call went away while its card waited — nothing ran'), args: v0.args }, key.id, { ask: 'gone' });
      if (r.outcome === 'vault_locked') return done({ ...named('vault_locked'), args: v0.args }, key.id, { ask: 'locked' });
      if (r.outcome === 'quiet') return done({ ...named('ask_quiet', `the owner refused this key for this conversation a moment ago — asks again after ${new Date(r.until).toISOString()}`), args: v0.args }, key.id, { ask: 'quiet' });
      if (r.outcome === 'unfiled') return done({ ...named('ask_unfiled', 'the question could not be filed in For you'), args: v0.args }, key.id, { ask: 'unfiled' });
      if (r.outcome !== 'allowed' && r.outcome !== 'always') return done({ ...named(r.outcome === 'expired' ? 'ask_expired' : 'ask_denied'), args: v0.args }, key.id, { ask: r.outcome });
      db = read();
      verdict = A.useVerdict({ key: keyById(key.id), grants: liveGrants(), subject, subjectGroups: groups, subjectLive: caller.live !== false, verb, vaultState: vaultState() });
      // once: the grant the answer wrote — spent by THIS call (a joined call finds it spent and asks again)
    }
    // lane grants-unify: a conversation the owner LEFT OUT of the key's Task Group grant is refused BY NAME — never a first-use card
    // asking the owner again about the very conversation he excluded
    if (!verdict.ok) return done({ ...named(verdict.code, verdict.code === 'verb_not_in_scope' ? `the key "${key.name}" does not hold ${verb} — the owner adds it with Edit… in the Vault window` : verdict.code === 'excepted' ? `the owner left this conversation out of the Task Group grant of the key "${key.name}" (an exception on the key's row in the Vault window) — ask the owner to lift it, or to grant the key to this conversation` : null), args: v0.args }, key.id, asked ? { ask: asked } : {});
    // THE LIMITS (lane automation-open-limits — the q-048 verify's M2): WHAT an open asks for, against its key's limits as
    // they stand NOW (re-read — the owner may have edited them while a card waited): AFTER the grant, BEFORE the grant is
    // spent, the spend authorizer runs and anything spawns (impl → conversation-ops openConversation). A refused open is
    // never charged and never spends a once-grant; its audit line carries the code
    let runArgs = v0.args;
    if (verb === 'conversations.open') {
      const lim = await limitsJudge(keyById(key.id) || key, v0.args);
      if (!lim.ok) return done(lim, key.id, asked ? { ask: asked } : {});
      runArgs = lim.args;
    }
    // THE GRANT IS SPENT BEFORE THE ACT (a once-grant never runs twice), lastUsedAt stamped
    try {
      const t = now();
      write({ keys: db.keys.map((k) => (k.id === key.id ? { ...k, lastUsedAt: t } : k)), grants: verdict.spend ? db.grants.map((g) => (g.id === verdict.grant.id ? { ...g, spentAt: t } : g)) : db.grants });
    } catch (e) { return done({ ...named('failed', `the key list could not be written (${e.code || e.message}) — nothing ran`), args: v0.args }, key.id); }
    let result;
    // REACH (lane conversations-archive-verb): a verb that names ANOTHER conversation may touch it by ONE PURE rule — the key
    // OPENED it (the store's rows), a grant of the key names it (the conversation or one of its Task Groups), or it is the
    // caller itself (A.reachVerdict) — the owner's grants and the key's own opens bound what it reaches, never the caller's say-so
    // + the GRANT'S REACH this use rides (lane key-instance-scope: the widest of the caller's always-grants, else the once-grant's — useVerdict)
    const reach = (target) => { const v = A.reachVerdict({ keyId: key.id, caller: caller.conversationId, target, grants: db.grants, opened: db.opened, reach: verdict.reach, reachRows: verdict.reachRows }); if (v.ok && v.by === 'opener' && target && target.webuiId && target.conversationId) noteOpened({ keyId: key.id, webuiId: target.webuiId, conversationId: target.conversationId }); return v; };
    try { result = await impl(runArgs, { caller, keyId: key.id, identity: A.identityOf(key.id), grant: verdict.grant, reach }); }
    catch (e) { return done({ ...named('failed', String((e && e.message) || e).slice(0, 200)), args: v0.args }, key.id, asked ? { ask: asked } : {}); }
    // THE OPENER'S ROW: a successful open is remembered by the key that made it (the webui id now, the conversation id when known)
    if (verb === 'conversations.open' && result && result.ok && result.sessionId) noteOpened({ keyId: key.id, webuiId: String(result.sessionId), conversationId: result.claudeSessionId ? String(result.claudeSessionId) : null });
    // lane automation-verbs: a refusal keeps what the caller can act on — the spend bucket and when it frees, the field it names
    const keep = result && typeof result === 'object' ? Object.fromEntries(['bucket', 'retryAfter', 'field', 'reach'].filter((k) => result[k] != null).map((k) => [k, result[k]])) : {};   // `reach`: a reach refusal's kind (lane key-instance-scope)
    if (!result || result.ok === false) return done({ ...named((result && result.code) || 'failed', result && result.why), ...keep, args: v0.args }, key.id, asked ? { ask: asked } : {});
    done({ ok: true, args: v0.args }, key.id, asked ? { ask: asked } : {});
    return { ok: true, keyId: key.id, key: key.name, verb, result, ms: now() - t0 };
  }

  // ── THE MAINTAINER KEY (lane fleet-feedback-marks — the header's last row) ──
  const MAINTAINER = Object.freeze({ maintainer: true, name: A.MAINTAINER_NAME, conversationId: null, sessionKey: null, live: true, groups: Object.freeze([]) });
  /** ONE maintainer call: the verdict (the key, then its two verbs), the args, the verb's own door. → use()'s answer shape. */
  async function useMaintainer({ token = '', verb = '', args = {} } = {}) {
    const t0 = now();
    let sha = null;
    try { sha = maintainerSha(); } catch { sha = null; }
    const v = A.maintainerVerdict({ token, sha, verb, matches: tokenMatches });
    if (!v.ok && v.code === 'maintainer_key_unknown') return named(v.code, v.why);   // an unknown bearer: answered, never audited
    const done = (r, a = null) => { audit({ keyId: null, subject: A.MAINTAINER_SUBJECT, verb, args: a, ok: r.ok, code: r.code, note: r.ok ? A.maintainerNote(verb, a) : null }); return r; };
    if (!v.ok) return done(named(v.code, v.why));
    const v0 = A.scopeOf(verb).args(args);
    if (!v0.ok) return done(v0);
    const impl = verbs[verb];
    if (typeof impl !== 'function') return done(named('verb_not_wired', `${verb} is not wired on this instance`), v0.args);
    let result;
    try { result = await impl(v0.args, { caller: MAINTAINER, keyId: null, identity: A.MAINTAINER_SUBJECT, grant: null, reach: () => ({ ok: true, by: 'instance' }) }); }
    catch (e) { return done(named('failed', String((e && e.message) || e).slice(0, 200)), v0.args); }
    if (!result || result.ok === false) return done(named((result && result.code) || 'failed', result && result.why), v0.args);
    done({ ok: true }, v0.args);
    return { ok: true, keyId: null, key: A.MAINTAINER_NAME, verb, result, ms: now() - t0 };
  }

  /** The keys THIS caller may use now (names + scopes + how it holds each — never a value). */
  function keysFor(caller) {
    db = read();
    const subject = caller && caller.conversationId ? `session:${caller.conversationId}` : null;
    if (!subject) return [];
    // lane grants-unify: THE ONE ADMISSION over each grant's use row (its own conversation, a Task Group — minus the members left out)
    const facts = { conversationKeys: [String(caller.conversationId)], groupIds: caller.groups || [] };
    return db.keys.filter((k) => !k.revokedAt).map((k) => {
      const gs = db.grants.filter((g) => g.keyId === k.id && g.subject !== 'external' && GM.admits([A.useRowOf(g)].filter(Boolean), facts).ok && !(g.mode === 'once' && g.spentAt));
      const always = gs.filter((g) => g.mode === 'always');
      return gs.length ? { id: k.id, name: k.name, scopes: k.scopes.slice(), via: gs.map((g) => ({ subject: g.subject, mode: g.mode, reach: g.reach })), limits: k.limits,
        reach: always.length ? A.widestReach(always.map((g) => g.reach)) : gs[0].reach } : null;   // lane key-instance-scope: the reach a use would ride (useVerdict's)
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

  return { list, mint, revoke, grant, ungrant, pruneEnded, setReach, setExcept, edit, setLimits, use, useMaintainer, answer, reconcile, keysFor, auditFor, auditOfKey, vaultRows, vaultReveal, listAsks, ACTION_TYPE, _asks: asks };
}

module.exports = { create, ACTION_TYPE };

'use strict';
/**
 * WEB LOGINS — the hub's half (lane browser-login, P3 of docs/design-custom-browser-plugin.zh.md §4; ORCH). The rules are PURE
 * src/browser-login.js; this file is THE ONE WRITER of the vault's `web-login:<origin>#<user>` entries (`writeEntry` — the
 * engine's secretPut, nothing else), the `browser-login` door's rows in the ONE grants store, the two-step code a login pairs
 * with (D3: the login grant COVERS it — no second grant), the use law's lines (the engine's noteUse) and the owner's words.
 *
 *   · THE FILL (planFill → the watch → VibeSpace.fillCredential → noteFill): the verdict over the forms the watch keeps, the
 *     vault's NAMES (no entry is opened to judge), the grant rows and the caller's facts, the vault's state; then ONE entry
 *     opened for this one fill — its values go to the watch, which hands them to the kernel on the loopback CDP socket and
 *     keeps none. A password the VAULT mints (a signup, a change) is SEALED BEFORE a byte reaches the kernel — the passkey
 *     road's rule: never a password we could not keep. Every fill is a USE (purpose «sign in at <origin>», a receipt).
 *   · THE SUBMISSION (submitted ← VibeSpace.credentialSubmitted): saveVerdict → the write (a vault-minted entry confirmed ·
 *     an update keeping the old password one revision · a password the agent typed itself, `agent-typed`) → ONE For-you NOTICE
 *     (informational — never an approval: the owner's D5). A person's own submission in a live-view takeover → the owner's
 *     `save-login` CARD (Save / Not now): only then is a password held in memory — until the card is answered, ≤ CARDS_MAX,
 *     CARD_MS, then forgotten. A submission while the vault is locked is held the same way and written at the next unlock
 *     (an account the agent made is never lost to a lock).
 *   · AN AGENT'S OWN (lane vault-agent-own — `vibespace-vault login add`, POST /api/agent/vault/login): a login the agent holds
 *     itself, sealed `agent-typed` with its `owner` = the storing conversation (its durable id); that conversation's fill needs
 *     no grant (fillVerdict `owners`), another's does; an agent never writes over a kept login (`login_exists`).
 *   · THE OWNER'S DOORS (cookie routes — src/routes/vault.js): add one (`by: 'owner'`), delete one (its own grant row with it),
 *     「用于…」 (grant / ungrant: this account, any account on this site, any site), the listing's facts (never a password).
 */
const crypto = require('crypto');
const BL = require('../browser-login.js');
const GM = require('../grant-model.js');

const CARDS_MAX = 4;
const CARD_MS = 10 * 60e3;
const HELD_MAX = 4;
const TYPED_MAX = 6;            // NEW agent-typed logins one site may add in TYPED_MS — a page that floods submissions never floods the vault
const TYPED_MS = 10 * 60e3;
const named = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });
const str = (v) => (v === undefined || v === null ? '' : String(v));

/**
 * @param {object} o
 * @param {object} o.vault  src/server/vault-engine.js (state, secretGet / secretPut / secretDrop / secretNames, noteUse, blocked, onOpen, audit)
 * @param {() => object} [o.grants]  the grants store (src/server/grants-store.js) — a getter
 * @param {(name: string, o: {conv}) => ({ok, code}|null)} [o.totpCode]  the paired two-step code (src/server/vault-totp.js codeForLogin)
 * @param {{add: (item) => string|null, resolve: (id) => void}} [o.forYou]  the owner's tray
 */
function create({ vault, grants = null, totpCode = null, forYou = null, now = () => Date.now(), randomBytes = crypto.randomBytes, log = () => {}, cardMs = CARD_MS } = {}) {
  if (!vault) throw new TypeError('browser-logins: a vault is required');
  const store = () => { const g = typeof grants === 'function' ? grants() : grants; return g || require('./grants-store.js').store(); };
  const cards = new Map();   // card id → {id, name, origin, username, password, existing, at, item, timer} — a person's own submission only
  const held = [];           // submissions that met a locked vault: [{name, origin, username, password, by, conv, convName, profileId, at}]
  const typedAt = new Map(); // origin → the instants its NEW agent-typed logins were saved (the flood guard)
  const vstate = () => { try { return vault.state(); } catch { return 'locked'; } };
  const say = (m) => { try { log(m); } catch { /* the journal's own failure */ } };

  /** The vault's web-login NAMES → [{name, origin, user, at, source, actor}] (no entry is opened). */
  function names() {
    let list = []; try { list = typeof vault.secretNames === 'function' ? vault.secretNames() || [] : []; } catch { list = []; }
    const out = [];
    for (const s of list) { const p = s && BL.parseName(s.name); if (p) out.push({ name: s.name, origin: p.origin, user: p.user, at: Number(s.at) || null, source: BL.SOURCES.includes(s.kind) ? s.kind : 'owner', actor: s.actor || null, owner: s.owner || null }); }   // owner: lane vault-agent-own
    return out;
  }
  /** ONE entry opened → {ok, rec} | {ok:true, rec:null} (none) | a named refusal. The value's Buffer is zeroed at once. */
  function open(name) {
    let g; try { g = vault.secretGet(name); } catch (e) { return named('unreadable', e && e.message); }
    if (!g || !g.ok) { const c = str(g && g.code); return named(/vault_locked/.test(c) ? 'vault_locked' : c === 'vault_not_set_up' ? 'vault_locked' : 'unreadable', c || 'unreadable'); }
    if (!g.value) return { ok: true, rec: null };
    let text; try { text = g.value.toString('utf8'); } finally { try { g.value.fill(0); } catch { /* */ } }
    const rec = BL.recordOf(text);
    return rec ? { ok: true, rec } : named('unreadable', 'the entry is not a web-login record');
  }
  /** THE ONE WRITER of a web-login entry: the record sealed under its name (the engine's secretPut — provenance as its `kind`,
   *  the conversation as its `actor`: words a person reads, never a value). */
  function writeEntry(name, rec, { actor = null, owner = null } = {}) {
    if (!BL.isEntryName(name)) return named('bad-name', 'not a web-login entry');
    let text; try { text = BL.textOf(rec); } catch (e) { return named('bad-record', e && e.message); }
    const r = vault.secretPut(name, text, { kind: rec.source, actor: actor ? str(actor).slice(0, 128) : null, owner: owner ? str(owner).slice(0, 128) : null });
    if (!r || !r.ok) { const c = str(r && r.code); return named(/vault_locked|vault_not_set_up/.test(c) ? 'vault_locked' : 'not_written', c || 'not written'); }
    return { ok: true };
  }
  const rowsOf = (resource) => { const g = store(); return g ? g.rowsFor(BL.DOOR, resource) : []; };
  const blocked = (actor, origin) => { try { vault.blocked?.(str(actor) || 'An agent', `a website login (${BL.hostOf(origin) || origin})`); } catch { /* the helper never throws; belt */ } };
  const use = (name, { conv = null, actor = null, outcome = 'ok', purpose = '' } = {}) => { try { return vault.noteUse(name, { by: 'agent', door: BL.DOOR, conv }, { outcome, purpose, actor }) || { receipt: null }; } catch (e) { say(`[browser-login] the use was not noted — ${e && e.message}`); return { receipt: null }; } };
  const purposeOf = (mode, origin) => `${mode === 'signup' ? 'register an account' : mode === 'change' ? 'change a password' : 'sign in'} at ${origin}`;

  /**
   * THE FILL'S PLAN for one `vibespace-browser login`: → `{ok:true, mode, origin, user, name, form, values, filled, length?,
   * otpMissing}` (the watch fills `values`, then calls noteFill) | a named refusal. `forms` = the tab's (oldest first),
   * `facts` = the caller's (GM.admits'), `conv` / `actor` = the conversation (its id / its name — the use line, the notice).
   */
  function planFill({ forms = [], origin = null, user = null, newUser = null, generate = false, facts = {}, conv = null, actor = null, owners = [] } = {}) {
    const v = BL.fillVerdict({ forms, origin, user, newUser, generate, entries: names(), grantRows: rowsOf, facts, vaultState: vstate(), owners });
    if (!v.ok) {
      if (v.code === 'vault_locked') blocked(actor, origin || (forms[forms.length - 1] || {}).pageOrigin || '');
      if (v.code === 'login_not_granted' && v.name) use(v.name, { conv, actor, outcome: 'not_granted', purpose: purposeOf(v.mode, v.origin) });   // a bearer's refused use is a line too (the use law)
      return v;
    }
    const base = { ok: true, mode: v.mode, origin: v.origin, user: v.user, name: v.name, form: v.form, purpose: purposeOf(v.mode, v.origin) };
    if (v.mode === 'login') {
      const o = open(v.name);
      if (!o.ok) { if (o.code === 'vault_locked') { blocked(actor, v.origin); return named('vault_locked', BL.LOCKED); } return named('login_no_entry', `the login for ${v.user} on ${v.origin} could not be read (${o.code}) — nothing was filled`); }
      if (!o.rec) return named('login_no_entry', `no saved login for ${v.user} on ${v.origin} is in the vault`);
      let otp = null, otpMissing = false;
      if (v.plan.otp.length) {
        if (o.rec.totpName && typeof totpCode === 'function') { let c = null; try { c = totpCode(o.rec.totpName, { conv, ...(v.grant && v.grant.via === 'own' ? { owners } : {}) }); } catch { c = null; } if (c && c.ok && c.code) otp = String(c.code); else otpMissing = true; }   // an OWN fill (no grant) gets only a code the caller owns too (the review)
        else otpMissing = true;
      }
      const { values, filled } = BL.valuesOf(v, { username: o.rec.username, password: o.rec.password, otp });
      return { ...base, values, filled, otpMissing };
    }
    const g = BL.generatePassword(v.constraints, randomBytes);
    if (!g.ok) return g;
    if (v.mode === 'signup') {
      const rec = BL.newRecord({ origin: v.origin, username: str(newUser).trim(), password: g.password, source: 'vault-minted', now: now(), conversation: actor || conv, pending: 'register' });
      const w = writeEntry(v.name, rec, { actor: actor || conv });   // SEALED FIRST — the kernel sees no byte the vault could not keep
      if (!w.ok) { if (w.code === 'vault_locked') blocked(actor, v.origin); return named(w.code === 'vault_locked' ? 'vault_locked' : 'not_written', w.code === 'vault_locked' ? 'the vault is locked — the owner has already been told; a person unlocks it on this instance\'s page; no account was registered (do not ask them to)' : `the new login could not be saved (${w.error}) — nothing was filled, so no account is made with a password nobody keeps`); }
      const { values, filled } = BL.valuesOf(v, { username: rec.username, newPassword: g.password });
      return { ...base, values, filled, length: g.length };
    }
    const o = open(v.name);
    if (!o.ok || !o.rec) return named(o.code === 'vault_locked' ? 'vault_locked' : 'login_no_entry', `the login for ${v.user} on ${v.origin} could not be read — nothing was changed`);
    const next = BL.changedRecord(o.rec, g.password, { now: now(), conversation: actor || conv });
    const w = writeEntry(v.name, next, { actor: actor || conv });
    if (!w.ok) return named(w.code === 'vault_locked' ? 'vault_locked' : 'not_written', `the new password could not be saved (${w.error}) — nothing was filled`);
    const { values, filled } = BL.valuesOf(v, { username: o.rec.username, password: o.rec.password, newPassword: g.password });
    return { ...base, values, filled, length: g.length };
  }
  /** The fill landed (or the kernel refused it): ONE use line through the engine's ONE writer → {receipt}. A signup / change
   *  the kernel refused leaves its sealed entry (pending — never lost; the next submission or the owner decides). */
  function noteFill(plan, { conv = null, actor = null, outcome = 'ok' } = {}) { return use(plan.name, { conv, actor, outcome, purpose: plan.purpose }); }

  function notice(state, { origin, username, conversation, profileId }) {
    const w = BL.noticeWords(state, { origin, username, conversation });
    if (!w || !forYou || typeof forYou.add !== 'function') return null;
    try { return forYou.add(profileId, { origin: 'browser', kind: 'notice', urgency: 'normal', text: w.text, detail: w.detail, i18n: w.i18n }); } catch (e) { say(`[browser-login] the notice was not filed — ${e && e.message}`); return null; }
  }
  /**
   * `VibeSpace.credentialSubmitted` (the watch hands what the kernel said, and the entry its own fill named, when one did) →
   * `{state, name?}`. `by` = 'agent' | 'human' (a person typing in a takeover); `password` crosses only the loopback socket and
   * is dropped here once written (or held for the owner's card / a locked vault — the only two holds).
   */
  function submitted({ origin, usernameHint = '', password = null, outcome = 'navigated', by = 'agent', name = null, conv = null, convName = null, profileId = null } = {}) {
    const o = BL.originOf(origin);
    if (!o || !BL.secureOrigin(o)) return { state: 'none', why: 'not an https site' };
    const n = name && BL.parseName(name) && BL.parseName(name).origin === o ? name : BL.entryName(o, usernameHint);
    if (!n) return { state: 'none', why: 'the submission named no user' };
    const username = str(usernameHint).trim() || BL.parseName(n).user;
    if (vstate() !== 'unlocked') {
      if (typeof password === 'string' && password) { held.push({ name: n, origin: o, username, password, outcome, by, conv, convName, profileId, at: now() }); while (held.length > HELD_MAX) held.shift(); }
      blocked(convName, o);
      return { state: 'held', name: n, why: 'vault_locked' };
    }
    const ex = open(n);
    if (!ex.ok) return { state: 'none', name: n, why: ex.code };
    const v = BL.saveVerdict({ existing: ex.rec, password, outcome, by });
    if (v.state === 'owner-card') return { state: 'owner-card', name: n, card: card({ name: n, origin: o, username, password, existing: !!ex.rec, profileId }) };
    if (v.state === 'agent-typed') {   // the flood guard: a page inventing submissions adds at most TYPED_MAX new logins a site in TYPED_MS
      const t = now(), recent = (typedAt.get(o) || []).filter((x) => t - x < TYPED_MS && t >= x);
      if (recent.length >= TYPED_MAX) { say(`[browser-login] ${o}: ${recent.length} new typed logins in 10 minutes — this one was not saved (a page flooding submissions)`); typedAt.set(o, recent); return { state: 'none', name: n, why: 'flood' }; }
      recent.push(t); typedAt.set(o, recent); if (typedAt.size > 256) typedAt.delete(typedAt.keys().next().value);
    }
    const next = BL.nextRecord(v, { existing: ex.rec, origin: o, username, password, now: now(), conversation: convName || conv });
    if (!next) return { state: v.state, name: n, ...(v.why ? { why: v.why } : {}) };
    const w = writeEntry(n, next, { actor: convName || conv });
    if (!w.ok) { say(`[browser-login] ${n}: the submission was not saved — ${w.error}`); return { state: 'none', name: n, why: w.code }; }
    const fy = notice(v.state, { origin: o, username: next.username, conversation: convName || '', profileId });
    return { state: v.state, name: n, ...(v.confirm ? { confirm: true } : {}), notice: fy };
  }
  /** The vault opened again: what a lock held is written now (the order it came in). */
  function flushHeld() {
    const list = held.splice(0, held.length);
    for (const h of list) { const { password, ...rest } = h; submitted({ ...rest, password, usernameHint: h.username }); }
    return list.length;
  }
  try { if (typeof vault.onOpen === 'function') vault.onOpen(() => { try { flushHeld(); } catch (e) { say(`[browser-login] held submissions not written — ${e && e.message}`); } }); } catch { /* an engine without hooks */ }

  // ── THE OWNER'S CARD (a person's own submission in a takeover) ──
  const shownOf = (c) => crypto.createHash('sha256').update(`${c.id}\u0000${c.name}\u0000${c.existing ? 'update' : 'new'}`).digest('hex').slice(0, 16);
  function card({ name, origin, username, password, existing, profileId }) {
    for (const c of cards.values()) if (c.name === name) dropCard(c.id);
    while (cards.size >= CARDS_MAX) dropCard(cards.keys().next().value);
    const id = 'sl-' + crypto.randomBytes(4).toString('hex');
    const c = { id, name, origin, username: str(username).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120), password, existing, at: now(), item: null, timer: null };   // the page's user name, clipped (it already passed userOf: no white space, no #)
    c.shown = shownOf(c);
    const site = BL.hostOf(origin) || origin;
    const text = existing ? 'Update the saved login {user} on {site}?' : 'Save the login {user} on {site} to the vault?';
    const detail = existing ? 'You signed in with a different password in the agent browser. Update keeps the old one in the entry for one revision.' : 'You signed in by hand in the agent browser. Saved logins can be filled by agents you allow — they never see the password.';
    if (forYou && typeof forYou.add === 'function') {
      try { c.item = forYou.add(profileId, { origin: 'browser', kind: 'action', urgency: 'normal', text: text.replace('{user}', c.username).replace('{site}', site), detail, i18n: { text: { key: text, params: { user: c.username, site } }, detail: [{ key: detail }] }, action: { type: 'save-login', id, shown: c.shown, update: !!existing } }); } catch (e) { say(`[browser-login] the save card was not filed — ${e && e.message}`); }
    }
    c.timer = setTimeout(() => dropCard(id), cardMs);
    if (c.timer.unref) c.timer.unref();
    cards.set(id, c);
    return { id, shown: c.shown, update: !!existing };
  }
  function dropCard(id) {
    const c = cards.get(id);
    if (!c) return false;
    cards.delete(id); clearTimeout(c.timer); c.password = null;
    if (c.item && forYou && typeof forYou.resolve === 'function') { try { forYou.resolve(c.item); } catch { /* the tray's own failure */ } }
    return true;
  }
  /** The owner's answer on the card (the cookie route): Save / Update ⇒ the ONE writer (`by: 'owner'`); Not now ⇒ forgotten. */
  function answerCard(id, { approve = false, shown = null } = {}) {
    const c = cards.get(str(id));
    if (!c) return named('card_gone', 'that card is no longer open — the password was not kept');
    if (str(shown) !== c.shown) return named('card_changed', 'that card changed after it was shown — nothing was saved; read it again');
    if (!approve) { dropCard(c.id); return { ok: true, saved: false }; }
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then save');
    const ex = open(c.name);
    if (!ex.ok) return named(ex.code, ex.error);
    const rec = ex.rec ? BL.recordOf({ ...ex.rec, password: c.password, submittedAt: now(), previous: { password: ex.rec.password, source: ex.rec.source, strength: ex.rec.strength, replacedAt: now() } }) : BL.newRecord({ origin: c.origin, username: c.username, password: c.password, source: 'owner', now: now() });
    const w = writeEntry(c.name, rec);
    if (!w.ok) return w;
    dropCard(c.id);
    return { ok: true, saved: true, name: c.name, updated: !!ex.rec };
  }

  // ── THE OWNER'S DOORS (the Vault window) ──
  /** The listing's facts (never a password): every web login + the grant rows that reach it. */
  function list() {
    const st = vstate();
    const g = store();
    const rowsAt = (r) => { const rows = g ? g.rowsFor(BL.DOOR, r) : []; return rows.map((x) => ({ resource: r, scope: BL.scopeOf(r), ...GM.publicRow(x) })); };
    const wild = rowsAt('*');
    return { ok: true, state: st, entries: st === 'locked' ? [] : names().map((e) => ({ ...e, grants: [...rowsAt(`${e.origin}#${e.user}`), ...rowsAt(`${e.origin}#*`), ...wild] })) };
  }
  /** The owner's own login (the Vault window's 「网站登录…」): origin, user name, password, an optional paired two-step entry. */
  function addOwn({ origin, username, password, totpName = null } = {}, { who = null } = {}) {
    const o = BL.originOf(origin);
    if (!o) return named('login_bad_origin', 'a website address (https://host[:port])');
    if (!BL.secureOrigin(o)) return named('login_bad_origin', 'a login is kept for an https site (plain http on this machine\'s localhost only)');
    const n = BL.entryName(o, username);
    if (!n) return named('login_bad_user', 'a user name (no spaces, no #)');
    if (typeof password !== 'string' || !password || password.length > 4096) return named('value_required', 'the password');
    if (totpName && !/^[\w.-]{1,120}$/.test(str(totpName))) return named('bad_totp', 'a two-step entry name from the Vault (letters, digits, . _ -)');
    if (vstate() !== 'unlocked') return named('vault_locked', 'the vault is locked — unlock it, then save');
    const ex = open(n);
    if (!ex.ok) return ex;
    const rec = ex.rec ? BL.recordOf({ ...ex.rec, username: str(username).trim(), password, ...(totpName ? { totpName } : {}), submittedAt: now(), ...(ex.rec.password !== password ? { previous: { password: ex.rec.password, source: ex.rec.source, strength: ex.rec.strength, replacedAt: now() } } : {}) }) : BL.newRecord({ origin: o, username, password, totpName, source: 'owner', now: now() });
    const w = writeEntry(n, rec);
    if (!w.ok) return w;
    try { vault.audit?.('vault-web-login-saved', { why: n, by: 'human', who: who ? str(who).slice(0, 40) : null }); } catch { /* */ }
    return { ok: true, name: n, updated: !!ex.rec };
  }
  /** lane vault-agent-own: AN AGENT stores a login it holds itself (`vibespace-vault login add`) — sealed `agent-typed`, its `owner`
   *  the storing conversation (its fill there needs no grant); a login already kept for that account is never written over by
   *  an agent. → {ok, name, origin, user} | a named refusal — never the password. */
  function addAgent({ origin, username, password, totpName = null } = {}, { owner = null, actor = null } = {}) {
    const o = BL.originOf(origin);
    if (!o) return named('login_bad_origin', 'a website address (https://host[:port])');
    if (!BL.secureOrigin(o)) return named('login_bad_origin', 'a login is kept for an https site (plain http on this machine\'s localhost only)');
    const n = BL.entryName(o, username);
    if (!n) return named('login_bad_user', 'a user name (no spaces, no #)');
    if (typeof password !== 'string' || !password || password.length > 4096) return named('value_required', 'the password (a 0600 file or stdin)');
    if (totpName && !/^[\w.-]{1,120}$/.test(str(totpName))) return named('bad_totp', 'a two-step entry name from the Vault (letters, digits, . _ -)');
    if (!owner) return named('unauthorized', 'the calling conversation has no id yet — send it one message first');
    if (vstate() !== 'unlocked') { blocked(actor, o); return named('vault_locked', BL.LOCKED); }
    // the review (HIGH): a login an agent stores may pair only a two-step entry THIS conversation added itself — its own fill
    // needs no grant, so pairing anyone else's seed would hand that code to a page the agent serves (http on localhost)
    if (totpName) { let tl = []; try { tl = vault.secretNames() || []; } catch { tl = []; } const t = tl.find((s) => s && s.name === `totp:${str(totpName)}`); if (!t || !t.owner || t.owner !== str(owner)) return named('bad_totp', `pair only a two-step entry this conversation added itself (vibespace-vault totp add ${str(totpName).slice(0, 120)}) — another one stays the user's`); }
    const ex = open(n);
    if (!ex.ok) return ex;
    const user = BL.parseName(n).user;
    if (ex.rec) return named('login_exists', `a login for ${user} on ${o} is already in the vault — sign in with it: vibespace-browser login ${o} --user ${user}`);
    const rec = BL.newRecord({ origin: o, username: str(username).trim(), password, source: 'agent-typed', now: now(), conversation: actor || owner, ...(totpName ? { totpName: str(totpName) } : {}) });
    const w = writeEntry(n, rec, { actor: actor || owner, owner });
    if (!w.ok) return w;
    try { vault.audit?.('vault-web-login-saved', { why: n, by: 'agent', who: actor ? str(actor).slice(0, 40) : null }); } catch { /* */ }
    return { ok: true, name: n, origin: o, user };
  }
  /** Delete one (a person's door): the entry, and its own grant row (the wildcards stay — they name no entry). */
  function drop(name, { who = null } = {}) {
    const p = BL.parseName(name);
    if (!p) return named('not_found', 'no such web login');
    const r = vault.secretDrop(name);
    if (r && r.ok === false) return named(r.code || 'not_written', r.error || 'not removed');
    try { const g = store(); if (g && g.rowsFor(BL.DOOR, `${p.origin}#${p.user}`).length) g.remove(BL.DOOR, `${p.origin}#${p.user}`, 'user'); } catch (e) { say(`[browser-login] ${name}: its grant row was not removed — ${e && e.message}`); }
    try { vault.audit?.('vault-web-login-removed', { why: name, by: 'human', who: who ? str(who).slice(0, 40) : null }); } catch { /* */ }
    return { ok: true, name };
  }
  /** 「用于…」: give ONE principal (a subject `session:<cid>` | `group:<gid>` | 'everyone') a scope of a login — `this-account`
   *  (`<origin>#<user>`), `any-account` (`<origin>#*`), `any-site` (`*`) — through the grants store's ONE writer. */
  function resourceFor(name, scope) { const p = BL.parseName(name); if (scope === 'any-site') return '*'; if (!p) return null; return scope === 'any-account' ? `${p.origin}#*` : `${p.origin}#${p.user}`; }
  function grant(name, scope, subject, { by = 'user' } = {}) {
    const resource = resourceFor(name, scope);
    if (!resource || !BL.resourceOk(resource)) return named('bad_resource', 'a login and a scope: this-account, any-account or any-site');
    const p = subject === 'everyone' ? { kind: 'everyone' } : GM.fromSubject(subject);
    if (!p) return named('bad_principal', 'a running conversation, a Task Group, or everyone');
    const g = store();
    const [row] = g.rowsFor(BL.DOOR, resource);
    const cur = row ? GM.publicRow(row) : { to: [], except: [] };
    if (cur.unknown) return named('unknown_shape', cur.why || 'that grant row could not be read');
    const key = GM.principalKey(p);
    if ((cur.to || []).some((e) => GM.principalKey(e) === key)) return { ok: true, resource, already: true };
    const w = g.set(BL.DOOR, resource, { to: [...(cur.to || []), p], except: (cur.except || []).filter((e) => GM.principalKey(e) !== key) }, by);
    return w && w.ok ? { ok: true, resource } : named((w && w.code) || 'not_written', (w && w.error) || 'not written');
  }
  function ungrant(resource, principalKey, { by = 'user' } = {}) {
    if (!BL.resourceOk(resource)) return named('bad_resource', 'not a web-login grant');
    const g = store();
    const [row] = g.rowsFor(BL.DOOR, resource);
    if (!row) return { ok: true, removed: false };
    const cur = GM.publicRow(row);
    if (cur.unknown) return named('unknown_shape', cur.why || 'that grant row could not be read');
    const to = (cur.to || []).filter((e) => GM.principalKey(e) !== str(principalKey));
    const w = to.length || (cur.except || []).length ? g.set(BL.DOOR, resource, { to, except: cur.except || [] }, by) : g.remove(BL.DOOR, resource, by);
    return w && w.ok ? { ok: true, removed: true } : named((w && w.code) || 'not_written', (w && w.error) || 'not written');
  }

  return { names, planFill, noteFill, submitted, flushHeld, answerCard, cardOf: (id) => { const c = cards.get(str(id)); return c ? { id: c.id, name: c.name, shown: c.shown, update: c.existing } : null; }, list, addOwn, addAgent, drop, grant, ungrant, _cards: cards, _held: held };
}

module.exports = { create, CARDS_MAX, CARD_MS, HELD_MAX, TYPED_MAX, TYPED_MS };

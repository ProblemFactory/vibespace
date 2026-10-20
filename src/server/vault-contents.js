'use strict';
/**
 * THE VAULT'S CONTENTS (lane vault-contents-window, 2026-10-19 — the owner: "vault 能不能加一个查看现在所有存储内容的功能，
 * 类似 google password manager，需要输入密码才能查看一段时间"). ORCH tier: the Vault window's server half.
 *
 *   · `list()` — every sealed store's masked rows (each store's own `vaultRows()`; src/vault-inventory.js makes the rows:
 *     named fields only, a length class for the value) while the vault is unlocked or not set up; LOCKED ⇒ no rows (the
 *     window says unlock first).
 *   · THE REVEAL WINDOW — `startReveal(who, password)`: the second password again (the engine's `confirm`: the unlock's
 *     pace and counters, nothing unlocked) opens a FIXED 5-minute window for ONE PAGE of one sign-in, in memory only:
 *     `who` = the sign-in cookie's handle (src/auth.js signInHandle), and the answer carries a random PAGE SECRET the page
 *     keeps in its memory (verify r1: a hub with no sign-in shared ONE window with every local process; a second tab of
 *     the same sign-in shared it too) — the window's key is (who, the secret's hash). Never extended by activity; a lock
 *     ends it (the window carries the engine's epoch, which moves at every lock and unlock); a wall clock stepped back
 *     cannot stretch it (a monotonic stamp bounds it too).
 *   · `reveal(who, page, id)` — inside the window, ONE value for ONE row reference (never a list), paced 20 a minute per
 *     sign-in and 60 for the whole vault, audited as `vault-reveal` {who, ip, store, entry, field} in
 *     data/vault-audit.jsonl — never the value. `revealRecord(who, page, store, entry)` = the same door for ONE record a
 *     store hands whole (a mount's edit dialog: audited with field `*`).
 *   · Nothing here broadcasts: a value rides its one HTTP answer and nothing else (no StateSync, no WS).
 */
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const VI = require('../vault-inventory.js');
const T = require('../totp.js');

/**
 * @param {object} o
 * @param {object} o.vault  the engine (src/server/vault-engine.js): state, epoch, confirm, lastUse, noteUse, audit
 * @param {Object<string, () => ({ vaultRows: () => object[], vaultReveal: (entry: string, field: string) => (string|null) } | null)>} o.sources
 *        per store id (src/vault-inventory.js STORES): a GETTER — a store this instance does not run answers null
 * @param {() => number} [o.mono]  a monotonic clock (ms) — suites pass their own
 */
function create({ vault, sources = {}, now = () => Date.now(), mono = () => performance.now() } = {}) {
  if (!vault) throw new TypeError('vault-contents: the vault engine is required');
  const windows = new Map();   // keyOf(who, page) → { who, startedAt, until, epoch, startedMono }
  const paced = new Map();     // who → the instants of its reveals answered in the last minute
  let all = [];                // the whole vault's (the ceiling)
  const sourceOf = (store) => { try { const g = sources[store]; const s = typeof g === 'function' ? g() : null; return s && typeof s.vaultRows === 'function' ? s : null; } catch { return null; } };
  const codeOf = (e) => String((e && (e.code || e.reason)) || 'error').slice(0, 60);
  const whoOf = (who) => String(who || 'sign-in-off').slice(0, 40);
  const pageOf = (page) => (typeof page === 'string' && VI.PAGE_RE.test(page) ? page : null);
  const keyOf = (who, page) => `${whoOf(who)}|${crypto.createHash('sha256').update(page).digest('hex').slice(0, 32)}`;
  function prune() {
    const t = now(), ep = vault.epoch(), m = mono();
    for (const [k, w] of windows) if (!(w.until > t) || w.epoch !== ep || !(m - w.startedMono < VI.REVEAL_MS)) windows.delete(k);
  }
  /** THIS page's window, or null — no page secret, no window (whatever the sign-in). */
  const windowOf = (who, page) => { prune(); const p = pageOf(page); return p ? windows.get(keyOf(who, p)) || null : null; };
  const verdictOf = (who, page) => VI.revealVerdict({ state: vault.state(), revealWindow: windowOf(who, page), epoch: vault.epoch(), now: now(), mono: mono() });

  /** This page's window as the page draws it: { open, leftMs }. */
  function windowFacts(who, page) {
    const v = verdictOf(who, page);
    return v.ok ? { open: true, leftMs: v.leftMs } : { open: false, leftMs: 0 };
  }

  function list() {
    const state = vault.state();
    if (state === 'locked') return { ok: true, state, stores: VI.GROUPS.map((s) => ({ store: s.store, label: s.label, count: 0, error: null, missing: false })), rows: [] };
    const listed = [], uses = {};
    for (const s of VI.GROUPS) {
      const src = sourceOf(s.store);
      if (!src) { listed.push({ store: s.store, rows: [], missing: true }); continue; }
      try { listed.push({ store: s.store, rows: src.vaultRows() || [] }); }
      catch (e) { listed.push({ store: s.store, rows: [], error: codeOf(e) }); }
      uses[s.store] = typeof vault.lastUse === 'function' ? vault.lastUse(s.store) : null;
    }
    return { ok: true, state, ...VI.inventoryOf(listed, { uses }) };
  }

  /** 「验证是你」: the second password again ⇒ a 5-minute window for THIS page (its secret is in the answer, once). */
  async function startReveal(who, password, { ip = null } = {}) {
    const st = vault.state();
    if (st === 'not_set_up') return { ok: false, code: 'vault_not_set_up' };
    if (st !== 'unlocked') return { ok: false, code: 'vault_locked' };
    const r = await vault.confirm(password, { ip, who: whoOf(who) });
    if (!r || !r.ok) return r || { ok: false, code: 'error' };
    const page = crypto.randomBytes(16).toString('hex');
    const t = now();
    windows.set(keyOf(who, page), { who: whoOf(who), startedAt: t, until: t + VI.REVEAL_MS, epoch: vault.epoch(), startedMono: mono() });
    vault.audit('vault-reveal-window', { who: whoOf(who), ip, by: 'human' });
    return { ok: true, leftMs: VI.REVEAL_MS, page };
  }

  /** The window + the pace for one answer. → { ok, leftMs } | the refusal. */
  function door(who, page, ip) {
    const v = verdictOf(who, page);
    if (!v.ok) return v;
    const t = now(), w = whoOf(who);
    const mine = (paced.get(w) || []).filter((x) => t - x < VI.REVEAL_PACE_MS && t >= x);
    all = all.filter((x) => t - x < VI.REVEAL_PACE_MS && t >= x);
    const p = VI.paceVerdict(mine, t);
    const c = p.ok ? VI.paceVerdict(all, t, VI.REVEAL_PACE_CEILING) : p;
    if (!c.ok) { paced.set(w, mine); vault.audit('vault-reveal-paced', { who: w, ip }); return c; }
    mine.push(t); all.push(t); paced.set(w, mine);
    return v;
  }

  /** ONE value for ONE row, inside this page's window. */
  function reveal(who, page, id, { ip = null } = {}) {
    const ref = VI.parseRef(id);
    if (!ref) return { ok: false, code: 'not_found' };
    if (!VI.revealableOf(ref.store, ref.entry)) {   // int317: a machine's link token / a sealed file's key — refused by name, whatever the window
      vault.audit('vault-reveal-refused', { who: whoOf(who), ip, store: ref.store, entry: ref.entry, field: ref.field, code: 'not_revealable' });
      return { ok: false, code: 'not_revealable' };
    }
    const v = door(who, page, ip);
    if (!v.ok) return v;
    const src = sourceOf(ref.store);
    let value = null;
    try { value = src && typeof src.vaultReveal === 'function' ? src.vaultReveal(ref.entry, ref.field) : null; }
    catch (e) { vault.audit('vault-reveal-unreadable', { who: whoOf(who), ip, store: ref.store, entry: ref.entry, field: ref.field, code: codeOf(e) }); return { ok: false, code: 'unreadable', why: codeOf(e) }; }
    if (typeof value !== 'string') return { ok: false, code: 'not_found' };
    if (typeof vault.noteUse === 'function') vault.noteUse(ref.store, 'human');
    vault.audit('vault-reveal', { who: whoOf(who), ip, by: 'human', store: ref.store, entry: ref.entry, field: ref.field });
    return { ok: true, id: VI.refOf(ref.store, ref.entry, ref.field), value, leftMs: v.leftMs };
  }

  /** The same door for ONE record a store hands whole (a mount's edit dialog prefill): the window, the pace, the audit
   *  (`field: '*'`) — the caller reads the record itself only on { ok: true }. */
  function revealRecord(who, page, store, entry, { ip = null } = {}) {
    if (!VI.refOf(store, entry, 'record')) return { ok: false, code: 'not_found' };
    const v = door(who, page, ip);
    if (!v.ok) return v;
    if (typeof vault.noteUse === 'function') vault.noteUse(store, 'human');
    vault.audit('vault-reveal', { who: whoOf(who), ip, by: 'human', store, entry: String(entry), field: '*' });
    return { ok: true, leftMs: v.leftMs };
  }

  /** 「隐藏全部」 / the window closed: this page's window ends now. */
  function endReveal(who, page) {
    const p = pageOf(page);
    return { ok: true, ended: p ? windows.delete(keyOf(who, p)) : false };
  }

  return { list, windowFacts, startReveal, reveal, revealRecord, endReveal, _windows: windows };
}

/** «Hub secrets» (int317): the engine's OWN secret entries as a source — `vaultRows` = their names and dates
 *  (VI.secretRowOf), `vaultReveal` = the relay token, or a two-step code's otpauth link (design q-047 L1 — owner decision ①
 *  amended: the seed and its settings, behind the second password, ONE value; never the record's other fields) — the
 *  never-shown ones are refused before a source is asked. */
function secretSource({ vault, machineName } = {}) {
  return {
    vaultRows: () => (typeof vault.secretNames === 'function' ? vault.secretNames() : []).map((s) => VI.secretRowOf(s, { machineName })).filter(Boolean),
    vaultReveal: (entry) => {
      if (!VI.revealableOf('secrets', entry)) return null;
      const g = vault.secretGet(entry);
      if (!g || !g.ok) throw Object.assign(new Error((g && g.code) || 'error'), { code: (g && g.code) || 'error' });
      if (!g.value) return null;
      let text;
      try { text = g.value.toString('utf8'); } finally { g.value.fill(0); }
      if (!String(entry).startsWith(T.ENTRY_PREFIX)) return text;
      const rec = T.recordOf(text);
      if (!rec) throw Object.assign(new Error('key-malformed'), { code: 'key-malformed' });
      return T.uriOf(rec, T.nameOfEntry(entry));
    },
  };
}

module.exports = { create, secretSource };

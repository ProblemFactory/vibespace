'use strict';
/**
 * THE VAULT-USE GRANTS — ORCH (lane vault-use-grants, 2026-10-27; the model is PURE src/vault-use-grant.js over
 * src/grant-model.js). The ONE writer of the grant door `vault-use` (who may use a vault entry in `vibespace-vault run` with
 * NO card, for which hosts, until when) — every write goes through the grants store's ONE writer (`set` / `remove` /
 * the rows are in data/grants.json beside every other door's, the `grants` StateSync mirror, the audit jsonl):
 *   · `setRow(id, {to, except}, {reauthed})` — the Vault window's «谁可以用…» picker saves the whole row (给谁 / 除了, each
 *     member its hosts and its end). A member with no host is refused `hosts_required` (never «any host»); a save that
 *     WIDENS (a new member, a new host, a later end, an exception taken away) needs the page's 验证是你 window — `reauthed`
 *     (the second password again, as «Usable by agent runs» and a request's grant do: a click alone is a header a local
 *     process can forge on a hub with no sign-in) — `reveal_needs_password`; a pure narrowing is a click;
 *   · `addMember(id, principal, {hosts, until})` — ONE member added or WIDENED (hosts ∪, the later end): the run card's
 *     «Always» (the press already passed 验证是你), the request box's default (the conversation that asked × the hosts it
 *     named — the owner typed the value for it), the carry of the old «always» rows;
 *   · `revoke(id, principalKey)` — ONE member out (the chip's ✕, a click); `drop(id)` — the entry deleted: its row goes.
 *   · `verdictFor(id, facts, run)` — the run door's question before it draws a card (src/server/vault-run-door.js);
 *   · `publicFor(id, counts)` — the row as the window draws it: each member's id, hosts, end, «used N× by M conversations».
 * Every landed write notifies the Vault window (`vault.contentsChanged` — the engine's ONE notify): every open window patches
 * the row's chips in place. test-architecture §97: the reader is src/vault-use-grant.js, every writer below calls the store.
 */
const GM = require('../grant-model.js');
const U = require('../vault-use-grant.js');
const GS = require('./grants-store.js');

const STATUS = Object.freeze({ hosts_required: 400, too_many_hosts: 400, bad_principal: 400, bad_resource: 400, bad_except: 400, except_conflicts: 400, too_many: 400, bad_row: 400, unknown_shape: 409, reveal_needs_password: 403, not_written: 500, store_unreadable: 503, entry_unknown: 404 });
const WORDS = Object.freeze({
  hosts_required: 'name the hosts it may be used for — a host name or address each (or «the hosts it was stored for»); never «any host»',
  too_many_hosts: `at most ${GM.HOSTS_MAX} hosts per member`,
  unknown_shape: 'that grant could not be read — it is refused as it is, never read wider; remove it and grant again',
  reveal_needs_password: 'giving a conversation more needs the second password again (验证是你)',
  entry_unknown: 'that stored value is not there any more',
});
const named = (code, extra = {}) => ({ ok: false, code, error: WORDS[code] || code, ...extra });

/** Does `next` give anybody MORE than `was`? (a new member, a host it did not have, a later or no end, an exception gone) */
function widens(was, next) {
  const w = was ? GM.publicRow(was) : { to: [], except: [] };
  if (w.unknown) return true;
  const byKey = new Map((w.to || []).map((e) => [GM.principalKey(e), e]));
  for (const e of next.to || []) {
    const o = byKey.get(GM.principalKey(e));
    if (!o) return true;
    if ((e.hosts || []).some((h) => !(o.hosts || []).includes(h))) return true;
    const oe = Number(o.until) > 0 ? Number(o.until) : null, ne = Number(e.until) > 0 ? Number(e.until) : null;
    if (oe != null && (ne == null || ne > oe)) return true;
  }
  const nx = new Set((next.except || []).map(GM.principalKey));
  return (w.except || []).some((x) => !nx.has(GM.principalKey(x)));
}

function create({ grants = () => GS.store(), vault = null, now = () => Date.now(), log = () => {} } = {}) {
  const store = () => (typeof grants === 'function' ? grants() : grants) || GS.store();
  const said = () => { try { vault && typeof vault.contentsChanged === 'function' && vault.contentsChanged('vault-use'); } catch { } };
  const rowOf = (id) => { const [r] = store().rowsFor(U.DOOR, String(id)); return r || null; };
  const okId = (id) => GM.resourceShapeOk(U.DOOR, String(id || ''));
  const landed = (w, extra = {}) => { if (w && w.ok) { said(); return { ok: true, ...extra }; } return named((w && w.code) || 'not_written', w && w.error ? { error: w.error } : {}); };

  /** The rows of one entry (the run door's facts). */
  const rowsOf = (id) => store().rowsFor(U.DOOR, String(id));
  /** THE QUESTION before a card: may THIS caller use entry `id` for this run with no card? (U.useVerdict) */
  const verdictFor = (id, facts = {}, run = {}) => U.useVerdict(rowsOf(id), facts, { ...run, now: now() });

  /** THE PICKER's save — the whole row. */
  function setRow(id, { to = [], except = [] } = {}, { by = 'user', reauthed = false } = {}) {
    if (!okId(id)) return named('bad_resource');
    for (const e of Array.isArray(to) ? to : []) if (!GM.hostListOf(e && e.hosts)) return named('hosts_required', { principal: GM.principalKey(GM.bareOf(e)) });
    const v = GM.validateWrite(U.DOOR, String(id), { to, except });
    if (!v.ok) return named(v.code, { error: v.error });
    const was = rowOf(id);
    if (widens(was, v.row) && !reauthed) return named('reveal_needs_password');
    const g = store();
    const w = v.row.to.length || v.row.except.length ? g.set(U.DOOR, String(id), { to: v.row.to, except: v.row.except }, by) : g.remove(U.DOOR, String(id), by);
    return landed(w, { id: String(id), members: v.row.to.length });
  }
  /** ONE member added or widened (the card's «Always», the request default, the carry). */
  function addMember(id, principal, { hosts = [], until = null } = {}, { by = 'user' } = {}) {
    if (!okId(id)) return named('bad_resource');
    const plan = U.withMember(rowOf(id), principal, { hosts, until });
    if (!plan.ok) return named(plan.code);
    const g = store();
    const w = g.set(U.DOOR, String(id), { to: plan.to, except: plan.except }, by);
    return landed(w, { id: String(id), grant: U.grantIdOf(String(id), GM.principalKey(GM.bareOf(principal))), widened: plan.widened, added: plan.added });
  }
  /** ONE member out (a click: a narrowing). */
  function revoke(id, principalKey, { by = 'user' } = {}) {
    if (!okId(id)) return named('bad_resource');
    const was = rowOf(id);
    if (!was) return { ok: true, removed: false };
    const plan = U.withoutMember(was, principalKey);
    if (!plan.ok) return named(plan.code);
    const g = store();
    const w = plan.to.length || plan.except.length ? g.set(U.DOOR, String(id), { to: plan.to, except: plan.except }, by) : g.remove(U.DOOR, String(id), by);
    return landed(w, { removed: plan.removed });
  }
  /** The entry is gone: its row goes too. */
  function drop(id, { by = 'user' } = {}) {
    if (!okId(id) || !rowOf(id)) return { ok: true, removed: false };
    const g = store();
    return landed(g.remove(U.DOOR, String(id), by), { removed: true });
  }
  /** THE CARRY: data/vault-run.json's «always» rows (read by the run door, its mark verified) → members, through the ONE
   *  writer, by 'migration'. → { carried, expired, hostless, failed }. */
  function carry(always, { resourceOf = (x) => x } = {}) {
    const plan = U.alwaysCarry(always, { now: now(), resourceOf });
    let carried = 0, failed = 0;
    for (const m of plan.members) {
      const r = addMember(m.resource, m.principal, { hosts: m.hosts, until: m.until }, { by: 'migration' });
      if (r.ok) carried++; else { failed++; log(`[vault-use] an «always» row could not be carried (${m.resource}: ${r.code})`); }
    }
    return { carried, expired: plan.expired, hostless: plan.hostless, failed };
  }
  /** The row as the window draws it (+ «used N× by M conversations» per member, from `counts` = VU.countsOf's entry row). */
  function publicFor(id, counts = null) {
    const p = U.publicGrants(rowOf(id), { now: now() });
    const by = (counts && counts.grants) || {};
    return { ...p, to: p.to.map((e) => ({ ...e, uses: (by[e.id] && by[e.id].uses) || 0, convs: (by[e.id] && by[e.id].convs) || 0 })) };
  }
  /** Every entry THIS caller holds a live member of (`vibespace-vault list`): [{id, grant, hosts, until}]. */
  function heldBy(facts = {}) {
    const out = [];
    for (const row of store().rowsOfDoor(U.DOOR)) {
      const v = U.useVerdict([row], facts, { destinationKnown: false, now: now() });
      if (U.holds(v)) out.push({ id: row.resource, grant: v.member.id, hosts: v.member.hosts, until: v.member.until });
    }
    return out;
  }
  return { rowsOf, verdictFor, heldBy, setRow, addMember, revoke, drop, carry, publicFor, statusOf: (code) => STATUS[code] || 400, words: (code) => WORDS[code] || code };
}

module.exports = { create, widens, STATUS, WORDS };

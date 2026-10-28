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
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const GM = require('../grant-model.js');
const U = require('../vault-use-grant.js');
const GS = require('./grants-store.js');

function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const STATUS = Object.freeze({ hosts_required: 400, too_many_hosts: 400, bad_principal: 400, bad_resource: 400, bad_except: 400, except_conflicts: 400, too_many: 400, bad_row: 400, unknown_shape: 409, reveal_needs_password: 403, vault_locked: 423, not_written: 500, store_unreadable: 503, entry_unknown: 404 });
const WORDS = Object.freeze({
  hosts_required: 'name the hosts it may be used for — a host name or address each (or «the hosts it was stored for»); never «any host»',
  too_many_hosts: `at most ${GM.HOSTS_MAX} hosts per member`,
  unknown_shape: 'that grant could not be read — it is refused as it is, never read wider; remove it and grant again',
  reveal_needs_password: 'giving a conversation more needs the second password again (验证是你)',
  vault_locked: 'the vault is locked — unlock it (验证是你) to change who may use a stored value',
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

function create({ grants = () => GS.store(), vault = null, now = () => Date.now(), log = () => {}, dataDir = null, onStale = null } = {}) {
  const store = () => (typeof grants === 'function' ? grants() : grants) || GS.store();
  const said = () => { try { vault && typeof vault.contentsChanged === 'function' && vault.contentsChanged('vault-use'); } catch { } };
  const rowOf = (id) => { const [r] = store().rowsFor(U.DOOR, String(id)); return r || null; };
  const okId = (id) => GM.resourceShapeOk(U.DOOR, String(id || ''));
  const unlocked = () => { try { return vault && typeof vault.state === 'function' ? vault.state() === 'unlocked' : true; } catch { return false; } };   // round 4 (item 4): a locked vault refuses a write BY NAME, never a half-written (mac:null) row
  const landed = (w, extra = {}) => { if (w && w.ok) { said(); return { ok: true, ...extra }; } return named((w && w.code) || 'not_written', w && w.error ? { error: w.error } : {}); };

  // ── THE MARK (round 3 item 7, round 4 item 4) ── data/grants.json is UNMARKED (an agent shares the hub's uid). The ONE
  // writer STAMPS each member with the vault's HMAC over the WHOLE canonical ROW — the resource, the member's own facts
  // (principal, hosts, the PER-HOST tool, end, name), the row's `except`, AND a monotonic GENERATION kept in a vault-marked
  // sidecar (data/vault-use-marks.json, per resource; the agent can write grants.json but cannot mint a vault mark). The ONE
  // reader admits a member only when its mac verifies at the row's CURRENT `except` + generation: a forged member (no valid
  // mac), a widened `except` (an exception deleted), or a REPLAYED older row (an owner write since bumped the generation) all
  // FAIL — dropped BY NAME (`grant_stale`), a For-you row filed once (onStale). A whole-data/ replay across a restart (the
  // sidecar AND grants.json both rolled back) is OUTSIDE the threat model — the kb says so; in-life `markGen` anti-replay holds.
  const MARK_FILE = dataDir ? path.join(dataDir, 'vault-use-marks.json') : null;
  const GEN_LABEL = 'vault-use-gen-v1';
  let genByRes = Object.create(null);   // resource → the generation its row was last written at
  let genSeq = 0;                       // the global monotonic counter (the newest generation minted)
  let markGen = 0;                      // the newest sidecar generation this hub read/wrote (in-life anti-replay)
  const staleNoted = new Set();         // resources a `grant_stale` For-you row already named (once, until the owner re-grants)
  const exceptCanon = (except) => (Array.isArray(except) ? except : []).map((x) => GM.principalKey(x)).filter(Boolean).sort();
  const genBody = (seq, res) => JSON.stringify({ v: 1, gen: Number(seq) || 0, res: Object.fromEntries(Object.keys(res).sort().map((k) => [k, Number(res[k]) || 0])) });
  const loadGen = () => {
    if (!MARK_FILE || !unlocked()) return;
    let raw = null; try { raw = JSON.parse(fs.readFileSync(MARK_FILE, 'utf-8')); } catch { return; }   // no sidecar yet / unreadable ⇒ keep our in-memory view (an unverifiable sidecar never lowers a generation — fail closed)
    if (!raw || typeof raw !== 'object') return;
    const res = raw.res && typeof raw.res === 'object' && !Array.isArray(raw.res) ? Object.fromEntries(Object.keys(raw.res).filter((k) => GM.resourceShapeOk(U.DOOR, k)).map((k) => [k, Number(raw.res[k]) || 0])) : {};
    const g = Number(raw.gen) || 0;
    let want = null; try { want = vault.macOf(GEN_LABEL, genBody(g, res)); } catch { want = null; }
    const got = typeof raw.mark === 'string' && /^[0-9a-f]{64}$/.test(raw.mark) ? raw.mark : null;
    if (!(want && got && g >= markGen && crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(want, 'hex')))) return;
    genSeq = Math.max(genSeq, g); markGen = g; genByRes = Object.assign(Object.create(null), res);
  };
  const saveGen = () => { if (!MARK_FILE) return; try { const body = genBody(genSeq, genByRes); const mark = vault.macOf(GEN_LABEL, body); if (!mark) return; writeJsonAtomic(MARK_FILE, { ...JSON.parse(body), mark }); markGen = genSeq; } catch (e) { log(`[vault-use] the mark generation could not be written (${e.message})`); } };
  const bumpGen = (id) => { loadGen(); genSeq = Math.max(genSeq, markGen) + 1; genByRes[String(id)] = genSeq; staleNoted.delete(String(id)); saveGen(); return genSeq; };   // a fresh owner write clears the stale notice for this resource

  const canonMember = (id, e, xc, gen) => JSON.stringify([String(id), GM.principalKey(GM.bareOf(e)) || '', (e.hosts || []).map(String).slice().sort(), e.toolFor && typeof e.toolFor === 'object' && !Array.isArray(e.toolFor) ? Object.keys(e.toolFor).sort().map((k) => [k, String(e.toolFor[k]).toLowerCase()]) : null, Number(e.until) > 0 ? Math.floor(Number(e.until)) : null, typeof e.name === 'string' ? e.name : null, Array.isArray(xc) ? xc : [], Number(gen) || 0]);
  const macFor = (id, e, xc, gen) => { try { return vault && typeof vault.macOf === 'function' ? vault.macOf('vault-use', canonMember(id, e, xc, gen)) : null; } catch { return null; } };
  const stamp = (id, to, except, gen) => { const xc = exceptCanon(except); return (Array.isArray(to) ? to : []).map((e) => { const m = macFor(id, e, xc, gen); const { mac, ...rest } = e; return m ? { ...rest, mac: m } : rest; }); };   // re-stamp every member over the WHOLE row (except + gen changed); a locked vault yields no mac (but a locked write is refused before this)
  const verifyMember = (id, e, xc, gen) => { const want = macFor(id, e, xc, gen); const got = e && typeof e.mac === 'string' && /^[0-9a-f]{64}$/.test(e.mac) ? e.mac : null; if (!want || !got) return false; try { return crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(want, 'hex')); } catch { return false; } };
  const verifiedRow = (row) => {
    if (!row) return row;
    loadGen();
    const xc = exceptCanon(row.except), gen = genByRes[row.resource] || 0;
    const to = (row.to || []).filter((e) => verifyMember(row.resource, e, xc, gen));
    if ((row.to || []).length && to.length < (row.to || []).length && typeof onStale === 'function' && !staleNoted.has(row.resource)) { staleNoted.add(row.resource); try { onStale(row.resource); } catch { } }   // a member dropped (forged / `except` widened / an older row replayed) ⇒ name it ONCE (round 4 item 4)
    return { ...row, to };
  };
  const verifiedRows = (rows) => (Array.isArray(rows) ? rows.map(verifiedRow) : []);

  /** The rows of one entry (the run door's facts), unverified members dropped. */
  const rowsOf = (id) => verifiedRows(store().rowsFor(U.DOOR, String(id)));
  /** THE QUESTION before a card: may THIS caller use entry `id` for this run with no card? (U.useVerdict) */
  const verdictFor = (id, facts = {}, run = {}) => U.useVerdict(rowsOf(id), facts, { ...run, now: now() });

  /** THE PICKER's save — the whole row. */
  function setRow(id, { to = [], except = [] } = {}, { by = 'user', reauthed = false } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');   // round 4 (item 4): a locked vault never writes mac:null — refuse by name
    for (const e of Array.isArray(to) ? to : []) if (!GM.hostListOf(e && e.hosts)) return named('hosts_required', { principal: GM.principalKey(GM.bareOf(e)) });
    const v = GM.validateWrite(U.DOOR, String(id), { to, except });
    if (!v.ok) return named(v.code, { error: v.error });
    const was = rowOf(id);
    if (widens(was, v.row) && !reauthed) return named('reveal_needs_password');
    const g = store();
    const gen = bumpGen(id);
    const w = v.row.to.length || v.row.except.length ? g.set(U.DOOR, String(id), { to: stamp(id, v.row.to, v.row.except, gen), except: v.row.except }, by) : g.remove(U.DOOR, String(id), by);
    return landed(w, { id: String(id), members: v.row.to.length });
  }
  /** ONE member added or widened (the card's «Always», the request default, the carry). `tool` scopes a wildcard PER HOST. */
  function addMember(id, principal, { hosts = [], until = null, tool = null } = {}, { by = 'user' } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const plan = U.withMember(verifiedRow(rowOf(id)), principal, { hosts, until, tool });
    if (!plan.ok) return named(plan.code);
    const g = store();
    const gen = bumpGen(id);
    const w = g.set(U.DOOR, String(id), { to: stamp(id, plan.to, plan.except, gen), except: plan.except }, by);
    return landed(w, { id: String(id), grant: U.grantIdOf(String(id), GM.principalKey(GM.bareOf(principal))), widened: plan.widened, added: plan.added });
  }
  /** ONE member out (a click: a narrowing). */
  function revoke(id, principalKey, { by = 'user' } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const was = verifiedRow(rowOf(id));
    if (!was) return { ok: true, removed: false };
    const plan = U.withoutMember(was, principalKey);
    if (!plan.ok) return named(plan.code);
    const g = store();
    const gen = bumpGen(id);
    const w = plan.to.length || plan.except.length ? g.set(U.DOOR, String(id), { to: stamp(id, plan.to, plan.except, gen), except: plan.except }, by) : g.remove(U.DOOR, String(id), by);
    return landed(w, { removed: plan.removed });
  }
  /** The entry is gone: its row goes too. */
  function drop(id, { by = 'user' } = {}) {
    if (!okId(id) || !rowOf(id)) return { ok: true, removed: false };
    if (!unlocked()) return named('vault_locked');
    const g = store();
    bumpGen(id);   // a dropped row cannot be replayed back: the generation moves on
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
    const p = U.publicGrants(verifiedRow(rowOf(id)), { now: now() });
    const by = (counts && counts.grants) || {};
    return { ...p, to: p.to.map((e) => ({ ...e, uses: (by[e.id] && by[e.id].uses) || 0, convs: (by[e.id] && by[e.id].convs) || 0 })) };
  }
  /** Every entry THIS caller holds a live member of (`vibespace-vault list`): [{id, grant, hosts, until}]. */
  function heldBy(facts = {}) {
    const out = [];
    for (const row of store().rowsOfDoor(U.DOOR)) {
      const v = U.useVerdict([verifiedRow(row)], facts, { destinationKnown: false, now: now() });
      if (U.holds(v)) out.push({ id: row.resource, grant: v.member.id, hosts: v.member.hosts, until: v.member.until });
    }
    return out;
  }
  return { rowsOf, verdictFor, heldBy, setRow, addMember, revoke, drop, carry, publicFor, statusOf: (code) => STATUS[code] || 400, words: (code) => WORDS[code] || code };
}

module.exports = { create, widens, STATUS, WORDS };

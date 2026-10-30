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

const STATUS = Object.freeze({ command_unreadable: 400, too_many_commands: 400, hosts_required: 400, tool_required: 400, too_many_hosts: 400, bad_principal: 400, bad_resource: 400, bad_except: 400, except_conflicts: 400, too_many: 400, bad_row: 400, unknown_shape: 409, reveal_needs_password: 403, vault_locked: 423, not_written: 500, store_unreadable: 503, entry_unknown: 404 });
const WORDS = Object.freeze({
  hosts_required: 'name the hosts it may be used for — a host name or address each (or «the hosts it was stored for»), or the command it may run; never «any host»',
  command_unreadable: 'that command could not be read as a program and its script — name them as they run (the program and its first argument)',
  too_many_commands: `at most ${GM.COMMANDS_MAX} commands per member`,
  tool_required: 'a wildcard host (like *.example.com) is scoped to the tool that first used it — it cannot be saved without one; add it from a run card with «Always»',
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
    const oc = new Set((o.commands || []).map((c) => GM.commandKeyOf(c)));   // lane vault-standing-request: a command it could not run before widens too
    if ((e.commands || []).some((c) => !oc.has(GM.commandKeyOf(c)))) return true;
    const oe = Number(o.until) > 0 ? Number(o.until) : null, ne = Number(e.until) > 0 ? Number(e.until) : null;
    if (oe != null && (ne == null || ne > oe)) return true;
    // lane vault-use-grants round 5 (MAJOR item 4): a wildcard's minting TOOL dropped or changed widens who may use it (one
    // CLI's `*.amazonaws.com` becoming every CLI's) ⇒ 验证是你. (A wildcard with NO tool at all is refused by name in setRow.)
    const ot = o.toolFor && typeof o.toolFor === 'object' ? o.toolFor : {}, nt = e.toolFor && typeof e.toolFor === 'object' ? e.toolFor : {};
    for (const h of e.hosts || []) if (String(h).startsWith('*.') && ot[h] && (!nt[h] || nt[h] !== ot[h])) return true;
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
  // lane vault-use-grants round 5 (MINOR, item 6): the generation moves in TWO steps — `nextGen` computes the generation a
  // write WILL take (it does NOT persist), and `commitGen` records it only AFTER the grants write landed. r4 bumped+persisted
  // BEFORE the write, so a refused 257th member (too_many) or a failed grants.json write invalidated every existing member of
  // the entry (their macs were made at the old generation, which no longer verified) ⇒ a false «forged» alarm.
  const nextGen = () => { loadGen(); return Math.max(genSeq, markGen) + 1; };
  const commitGen = (id, gen) => { const g = Number(gen) || 0; genSeq = Math.max(genSeq, g); genByRes[String(id)] = g; staleNoted.delete(String(id)); saveGen(); return g; };   // a fresh owner write clears the stale notice for this resource

  // lane vault-standing-request: a member's COMMANDS and its SOURCE (+ its `at`) are under the mac too — appended ONLY when the
  // member has them, so every member written before keeps the very canon (and mac) it was stamped with.
  const canonExtra = (e) => { const cs = Array.isArray(e.commands) ? e.commands.map((c) => GM.commandKeyOf(c)).sort() : []; return cs.length || e.source ? [{ c: cs, s: e.source || null, a: e.source && Number(e.at) > 0 ? Math.floor(Number(e.at)) : null }] : []; };
  const canonMember = (id, e, xc, gen) => JSON.stringify([String(id), GM.principalKey(GM.bareOf(e)) || '', (e.hosts || []).map(String).slice().sort(), e.toolFor && typeof e.toolFor === 'object' && !Array.isArray(e.toolFor) ? Object.keys(e.toolFor).sort().map((k) => [k, String(e.toolFor[k]).toLowerCase()]) : null, Number(e.until) > 0 ? Math.floor(Number(e.until)) : null, typeof e.name === 'string' ? e.name : null, Array.isArray(xc) ? xc : [], Number(gen) || 0, ...canonExtra(e)]);
  const macFor = (id, e, xc, gen) => { try { return vault && typeof vault.macOf === 'function' ? vault.macOf('vault-use', canonMember(id, e, xc, gen)) : null; } catch { return null; } };
  // re-stamp every member over the WHOLE row (except + gen changed); a locked vault yields no mac (but a locked write is
  // refused before this). round 5 (MINOR, item 6): the mac is computed over the member AS THE STORE WILL KEEP IT — each is run
  // through the store's ONE normaliser (GM.normEntry: cleanName on the name, normalised hosts/toolFor) FIRST, so a trailing
  // space or a control character in a conversation's name never leaves the stored (cleaned) member failing its own mac.
  const stamp = (id, to, except, gen) => { const xc = exceptCanon(except); return (Array.isArray(to) ? to : []).map((e0) => { const { mac, ...bare } = e0; const e = GM.normEntry(bare, U.DOOR) || bare; const m = macFor(id, e, xc, gen); return m ? { ...e, mac: m } : e; }); };
  const verifyMember = (id, e, xc, gen) => { const want = macFor(id, e, xc, gen); const got = e && typeof e.mac === 'string' && /^[0-9a-f]{64}$/.test(e.mac) ? e.mac : null; if (!want || !got) return false; try { return crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(want, 'hex')); } catch { return false; } };
  const verifiedRow = (row) => {
    if (!row) return row;
    // lane vault-use-grants round 5 (MINOR, item 6): a LOCKED vault cannot compute a mac (vault.macOf → null). That is «cannot
    // verify now», NOT «every member forged»: file NO stale alarm (only a COMPUTED mismatch below is forged / widened / replayed).
    // round 6 (MINOR item 6): a member that CANNOT be verified is never a HELD grant — while locked yield NO verified members
    // (heldBy / useVerdict list none, runs stay refused with vault_locked); publicFor shows them «unverified until unlocked».
    if (!unlocked()) return { ...row, to: [], unverifiedLocked: true };
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

  /** THE ROW RULES — what makes a row one the owner could SAVE (lane vault-standing-request r2, MAJOR 1: an agent's standing
   *  `--host '*.github.io'` went through addMember with no tool, so the stored member covered that domain for EVERY program
   *  and every later Save of the row failed `tool_required`). ONE validator: setRow (the owner's Save), addMember (every press,
   *  request, carry) and judgeMember (an agent's standing request, BEFORE its card is filed) read it — a row the owner could
   *  not save is never written. Every member names hosts or commands (never «any»); the model's own write rules; a wildcard
   *  host carries the tool that uses it. → { ok: true, row } | a named refusal. */
  function rowRules(id, { to = [], except = [] } = {}) {
    // lane vault-standing-request: a member names hosts, commands or both — an empty list is the field left out (never «any»)
    to = (Array.isArray(to) ? to : []).map((e) => { if (!e || typeof e !== 'object') return e; const x = { ...e }; for (const f of ['hosts', 'commands']) if (Array.isArray(x[f]) && !x[f].length) delete x[f]; return x; });
    for (const e of to) if (!GM.hostListOf(e && e.hosts) && !GM.commandListOf(e && e.commands)) return named('hosts_required', { principal: GM.principalKey(GM.bareOf(e)) });
    const v = GM.validateWrite(U.DOOR, String(id), { to, except });
    if (!v.ok) return named(v.code, { error: v.error });
    // lane vault-use-grants round 5 (MAJOR item 4): a wildcard host MUST carry the tool that minted it — a whole-row Save that
    // drops `toolFor` (the r4 picker rebuilt each member from principal + name + hosts + end only) is refused BY NAME, never
    // silently re-scoping `*.amazonaws.com` from aws to every tool.
    for (const e of v.row.to) for (const h of e.hosts || []) if (String(h).startsWith('*.') && !(e.toolFor && e.toolFor[h])) return named('tool_required', { principal: GM.principalKey(GM.bareOf(e)), host: h });
    return { ok: true, row: v.row };
  }
  /** THE PICKER's save — the whole row. */
  function setRow(id, { to = [], except = [] } = {}, { by = 'user', reauthed = false } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');   // round 4 (item 4): a locked vault never writes mac:null — refuse by name
    const v = rowRules(id, { to, except });
    if (!v.ok) return v;
    const was = rowOf(id);
    if (widens(was, v.row) && !reauthed) return named('reveal_needs_password');
    // lane vault-standing-request: a member this Save ADDS is the owner's («你设置的», now); one already there keeps its source
    const before = new Set(((was && GM.publicRow(was).to) || []).map((e) => GM.principalKey(e)));
    const rowTo = v.row.to.map((e) => (before.has(GM.principalKey(e)) ? e : { ...e, source: e.source || 'owner', at: Number(e.at) > 0 ? e.at : now() }));
    const g = store();
    const gen = nextGen();
    const w = rowTo.length || v.row.except.length ? g.set(U.DOOR, String(id), { to: stamp(id, rowTo, v.row.except, gen), except: v.row.except }, by) : g.remove(U.DOOR, String(id), by);
    if (w && w.ok) commitGen(id, gen);
    return landed(w, { id: String(id), members: v.row.to.length });
  }
  /** ONE member added or widened (the card's «Always», the request default, the carry, an agent's standing request the owner
   *  allowed). `tool` scopes a wildcard PER HOST; `commands` (lane vault-standing-request) the command shapes; `source` who. */
  function addMember(id, principal, { hosts = [], until = null, tool = null, commands = null, source = null } = {}, { by = 'user' } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const plan = U.withMember(verifiedRow(rowOf(id)), principal, { hosts, until, tool, commands, source, at: now() });
    if (!plan.ok) return named(plan.code);
    const v = rowRules(id, { to: plan.to, except: plan.except });   // round 5 (MINOR): validate the plan BEFORE any generation move (a bad plan never bumps the gen); r2 (MAJOR 1): the SAME rules the owner's Save reads
    if (!v.ok) return v;
    const g = store();
    const gen = nextGen();
    const w = g.set(U.DOOR, String(id), { to: stamp(id, plan.to, plan.except, gen), except: plan.except }, by);
    if (w && w.ok) commitGen(id, gen);
    return landed(w, { id: String(id), grant: U.grantIdOf(String(id), GM.principalKey(GM.bareOf(principal))), widened: plan.widened, added: plan.added });
  }
  /** r2 (MAJOR 1): THE QUESTION BEFORE A STANDING REQUEST'S CARD — would addMember write this member? (the plan + the row
   *  rules, nothing written) → { ok: true } | the named refusal the Allow would meet. */
  function judgeMember(id, principal, { hosts = [], until = null, tool = null, commands = null, source = null } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const plan = U.withMember(verifiedRow(rowOf(id)), principal, { hosts, until, tool, commands, source, at: now() });
    if (!plan.ok) return named(plan.code);
    const v = rowRules(id, { to: plan.to, except: plan.except });
    return v.ok ? { ok: true } : v;
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
    const gen = nextGen();
    const w = plan.to.length || plan.except.length ? g.set(U.DOOR, String(id), { to: stamp(id, plan.to, plan.except, gen), except: plan.except }, by) : g.remove(U.DOOR, String(id), by);
    if (w && w.ok) commitGen(id, gen);
    return landed(w, { removed: plan.removed });
  }
  /** The entry is gone: its row goes too. */
  function drop(id, { by = 'user' } = {}) {
    if (!okId(id) || !rowOf(id)) return { ok: true, removed: false };
    if (!unlocked()) return named('vault_locked');
    const g = store();
    const gen = nextGen();
    const w = g.remove(U.DOOR, String(id), by);
    if (w && w.ok) commitGen(id, gen);   // a dropped row cannot be replayed back: the generation moves on — but only once the removal landed
    return landed(w, { removed: true });
  }
  /** THE CARRY: data/vault-run.json's «always» rows (read by the run door, its mark verified) → members, through the ONE
   *  writer, by 'migration'. → { carried, expired, hostless, failed }. */
  function carry(always, { resourceOf = (x) => x } = {}) {
    const plan = U.alwaysCarry(always, { now: now(), resourceOf });
    let carried = 0, failed = 0;
    for (const m of plan.members) {
      const r = addMember(m.resource, m.principal, { hosts: m.hosts, until: m.until, tool: m.tool || null }, { by: 'migration' });   // r2: a carried wildcard keeps the CLI it was minted by (the row rules refuse one without)
      if (r.ok) carried++; else { failed++; log(`[vault-use] an «always» row could not be carried (${m.resource}: ${r.code})`); }
    }
    return { carried, expired: plan.expired, hostless: plan.hostless, failed };
  }
  /** The row as the window draws it (+ «used N× by M conversations» per member, from `counts` = VU.countsOf's entry row). */
  function publicFor(id, counts = null) {
    const raw = rowOf(id);
    // round 6 (MINOR item 6): while locked the members cannot be verified — list them «unverified until unlocked» (names/hosts,
    // never the value, never as a held grant), so a hand-written data/grants.json member is not shown as a real grant.
    if (raw && !unlocked()) { const p = U.publicGrants(raw, { now: now() }); return { ...p, unverified: true, to: (p.to || []).map((e) => ({ ...e, uses: 0, convs: 0 })) }; }
    const p = U.publicGrants(verifiedRow(raw), { now: now() });
    const by = (counts && counts.grants) || {};
    return { ...p, to: p.to.map((e) => ({ ...e, uses: (by[e.id] && by[e.id].uses) || 0, convs: (by[e.id] && by[e.id].convs) || 0 })) };
  }
  /** Every entry THIS caller holds a live member of (`vibespace-vault list`): [{id, grant, hosts, until}]. */
  function heldBy(facts = {}) {
    const out = [];
    for (const row of store().rowsOfDoor(U.DOOR)) {
      const v = U.useVerdict([verifiedRow(row)], facts, { destinationKnown: false, now: now() });
      if (U.holds(v)) out.push({ id: row.resource, grant: v.member.id, hosts: v.member.hosts, toolFor: v.member.toolFor || null, commands: v.member.commands, source: v.member.source, at: v.member.at, until: v.member.until });   // lane vault-standing-request: the scope + who wrote it + since when
    }
    return out;
  }
  return { rowsOf, verdictFor, heldBy, setRow, addMember, judgeMember, revoke, drop, carry, publicFor, statusOf: (code) => STATUS[code] || 400, words: (code) => WORDS[code] || code };
}

module.exports = { create, widens, STATUS, WORDS };

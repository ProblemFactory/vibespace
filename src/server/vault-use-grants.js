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
 *   · `addMember(id, principal, {hosts, until})` — ONE member's SCOPES written (lane vault-standing-request r4, THE ROOT
 *     MODEL: each host / command a scope with ITS OWN end — a scope it names is ADDED, or REPLACED when it is there with
 *     another end or has ended; no other scope is touched; `changes` says which): the run card's «Always» (the press already
 *     passed 验证是你), an agent's standing request the owner allowed, the carry of the old «always» rows;
 *   · `snapshotRow(id)` / `restoreRow(id, snap)` (r4, C) — the run door's ALL-OR-NOTHING: the row as it was (verified),
 *     written back RAW (no row rules — it restores what WAS, lawful when written; re-marked at a new generation);
 *   · `revoke(id, principalKey)` — ONE member out (the chip's ✕, a click); `drop(id)` — the entry deleted: its row goes.
 *   · r7 (lane vault-standing-request): a member's WINDOW scope (src/vault-use-grant.js — «any run until `until`», the owner's
 *     time-boxed trust of one conversation) is written by addMember ONLY (`window`: the run card's «Allow for 1 hour»); the
 *     owner's Save keeps one exactly as it is (its own end) and never mints or moves one — `window_card_only`.
 *     r8 (主开发's acceptance of r7): the Save sends NO window — the stored member's LIVE window rides it as it is (a dialog
 *     opened before a ✕ never brings a taken-back one back) and an ended one is pruned; `revokeWindow(id, principalKey)` takes
 *     back the window ONLY (its chip's ✕ — the host / command scopes stay); `revoke` returns the end of the live window it
 *     took (the door tells the press's record); every write prunes the row's ENDED windows (U.withoutEndedWindows), and
 *     `pruneWindows(id)` is the door's hour-end write (nothing to prune ⇒ nothing written).
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

const STATUS = Object.freeze({ window_end_required: 400, window_card_only: 400, window_too_long: 400, window_excepted: 409, command_unreadable: 400, too_many_commands: 400, hosts_required: 400, tool_required: 400, too_many_hosts: 400, bad_principal: 400, bad_resource: 400, bad_except: 400, except_conflicts: 400, too_many: 400, bad_row: 400, unknown_shape: 409, reveal_needs_password: 403, vault_locked: 423, not_written: 500, store_unreadable: 503, entry_unknown: 404 });
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
  window_end_required: 'a 1-hour approval needs its end in the future — nothing was written',   // r7
  window_card_only: 'a 1-hour approval is given from a run card only («Allow for 1 hour») — Save keeps one as it is and never makes or moves one',   // r7
  window_too_long: 'a 1-hour approval lasts one hour from the press — never longer; nothing was written',   // r8
  window_excepted: 'you excluded this conversation from this secret in the Vault window (除了) — a 1-hour approval is not given to it; nothing was written',   // r8
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
    // r4: PER SCOPE — a host or a command it did not hold, or a later (or no) end on one it held, widens
    const os = new Map(U.scopesOf(o).map((s) => [`${s.kind}\n${s.key}`, s]));
    for (const s of U.scopesOf(e)) {
      const p = os.get(`${s.kind}\n${s.key}`);
      if (!p) return true;
      if (p.until != null && (s.until == null || s.until > p.until)) return true;
      // lane vault-use-grants round 5 (MAJOR item 4): a wildcard's minting TOOL dropped or changed widens who may use it (one
      // CLI's `*.amazonaws.com` becoming every CLI's) ⇒ 验证是你. (A wildcard with NO tool at all is refused by name in setRow.)
      if (s.kind === 'host' && String(s.host).startsWith('*.') && p.tool && s.tool !== p.tool) return true;
    }
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
  // r4: THE CANON is PURE now (U.canonOf — over what a member MEANS: a one-end member and the scoped member it reshapes to are
  // the same bytes, so the per-scope migration keeps every mark; scopes with their own ends use the per-scope canon).
  const canonMember = (id, e, xc, gen) => U.canonOf(id, e, xc, gen);
  const macFor = (id, e, xc, gen) => { try { return vault && typeof vault.macOf === 'function' ? vault.macOf('vault-use', canonMember(id, e, xc, gen)) : null; } catch { return null; } };
  // re-stamp every member over the WHOLE row (except + gen changed); a locked vault yields no mac (but a locked write is
  // refused before this). round 5 (MINOR, item 6): the mac is computed over the member AS THE STORE WILL KEEP IT — each is run
  // through the store's ONE normaliser (GM.normEntry: cleanName on the name, normalised hosts/toolFor) FIRST, so a trailing
  // space or a control character in a conversation's name never leaves the stored (cleaned) member failing its own mac.
  const stamp = (id, to, except, gen) => { const xc = exceptCanon(except); return (Array.isArray(to) ? to : []).map((e0) => { const { mac, ...bare } = e0; const sc = U.scopedMember(bare); const e = (sc && GM.normEntry(sc, U.DOOR)) || GM.normEntry(bare, U.DOOR) || bare; const m = macFor(id, e, xc, gen); return m ? { ...e, mac: m } : e; }); };   // r4: every member the ONE writer writes is in the per-scope shape (its meaning unchanged)
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
   *  host carries the tool that uses it. → { ok: true, row } | a named refusal.
   *  r3 (MAJOR 1 — the acceptance: the shipped 2.369.363/.364 carry wrote legacy aws «always» members as `*.amazonaws.com` with
   *  NO tool, and r2 refused EVERY later write on that entry — another conversation's «Always» became a denied run, an agent's
   *  standing request was told to add a --tool it never asked about): the rules judge WHAT THIS WRITE BRINGS — the row as it
   *  becomes through it. A wildcard with no tool is refused only where the write puts it there; one the stored row (`was`)
   *  already held on the SAME member with no tool is a LEGACY member (a migration fact the carry names, never a refusal for
   *  anyone). `legacy` (the carry only): the write may itself carry a wildcard whose CLI nobody can name, as a legacy member. */
  function rowRules(id, { to = [], except = [] } = {}, { was = null, legacy = false } = {}) {
    // lane vault-standing-request: a member names hosts, commands or both — an empty list is the field left out (never «any»)
    to = (Array.isArray(to) ? to : []).map((e) => { if (!e || typeof e !== 'object') return e; const x = { ...e }; for (const f of ['hosts', 'commands', 'scopes']) if (Array.isArray(x[f]) && !x[f].length) delete x[f]; return x; });
    for (const e of to) if (!(e && Array.isArray(e.scopes) ? GM.scopeListOf(e.scopes) : (GM.hostListOf(e && e.hosts) || GM.commandListOf(e && e.commands)))) return named('hosts_required', { principal: GM.principalKey(GM.bareOf(e)) });   // r4: a member names scopes (hosts, commands — or `scopes`, each its own end)
    const v = GM.validateWrite(U.DOOR, String(id), { to, except });
    if (!v.ok) return named(v.code, { error: v.error });
    // lane vault-use-grants round 5 (MAJOR item 4): a wildcard host MUST carry the tool that minted it — a whole-row Save that
    // drops `toolFor` (the r4 picker rebuilt each member from principal + name + hosts + end only) is refused BY NAME, never
    // silently re-scoping `*.amazonaws.com` from aws to every tool.
    const held = new Set();   // r3: the stored row's own toolless wildcards — principal × host, as they were before this write
    for (const e of (was && Array.isArray(was.to) ? was.to : [])) for (const h of U.legacyWildOf(e)) held.add(`${GM.principalKey(GM.bareOf(e))}\n${h}`);
    for (const e of v.row.to) for (const s of U.scopesOf(e)) if (s.kind === 'host' && String(s.host).startsWith('*.') && !s.tool && !legacy && !held.has(`${GM.principalKey(GM.bareOf(e))}\n${s.host}`)) return named('tool_required', { principal: GM.principalKey(GM.bareOf(e)), host: s.host });   // r4: per host scope
    return { ok: true, row: v.row };
  }
  /** THE PICKER's save — the whole row. */
  function setRow(id, { to = [], except = [] } = {}, { by = 'user', reauthed = false } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');   // round 4 (item 4): a locked vault never writes mac:null — refuse by name
    const was = rowOf(id);
    // r7: a WINDOW scope is the CARD's (its «Allow for 1 hour») — a Save never mints one or moves its end (a page naming one the
    // stored member does not hold with that end is refused `window_card_only`). r8 (the r7 acceptance MINOR 4/5): the Save
    // SENDS none (src/lib/vault-use-row.js) — the stored member's LIVE window rides it exactly as it is (so a dialog opened
    // before a ✕ cannot bring a taken-back window back, and a window-only member is kept by a Save that names no scope for
    // it); an ENDED one is pruned (a member that held only that goes)
    const wasW = verifiedRow(was);
    const heldW = new Map(((wasW && GM.publicRow(wasW).to) || []).map((e) => [GM.principalKey(e), U.scopesOf(e).filter((s) => s.kind === 'window')]));
    const t0 = now();
    const pageTo = [];
    for (const e of Array.isArray(to) ? to : []) {
      if (!e || typeof e !== 'object' || !Array.isArray(e.scopes)) { pageTo.push(e); continue; }
      const pk = GM.principalKey(GM.bareOf(e)), held = heldW.get(pk) || [];
      for (const s of e.scopes.filter((x) => x && x.kind === 'window')) if (!held.some((h) => h.until === Number(s.until))) return named('window_card_only', { principal: pk });
      const keep = e.scopes.filter((x) => !(x && x.kind === 'window'));
      const liveW = held.filter((h) => h.until > t0).map((h) => ({ kind: 'window', until: h.until, ...(h.source ? { source: h.source } : {}), ...(h.at ? { at: h.at } : {}) }));
      if (!keep.length && !liveW.length && held.length) continue;   // it held only a window, and that has ended — pruned
      pageTo.push({ ...e, scopes: [...keep, ...liveW] });
    }
    to = pageTo;
    const v = rowRules(id, { to, except }, { was: wasW });   // r3: a Save that keeps a legacy wildcard as it was is a Save the owner can make
    if (!v.ok) return v;
    // lane vault-standing-request r4: the Save in the per-scope shape — a scope this Save ADDS or whose end / tool it CHANGES is
    // the owner's («你设置的», now); a scope it keeps as it was keeps its writer and time (a page's own `source` is never read)
    const wasV = verifiedRow(was);
    const before = new Map((((wasV && GM.publicRow(wasV).to) || [])).map((e) => [GM.principalKey(e), new Map(U.scopesOf(e).map((s) => [`${s.kind}\n${s.key}`, s]))]));
    const rowTo = v.row.to.map((e) => {
      const o = before.get(GM.principalKey(e)) || new Map();
      const sc = U.scopesOf(e).map((s) => { const p = o.get(`${s.kind}\n${s.key}`); return p && p.until === s.until && (p.tool || null) === (s.tool || null) ? { ...s, source: p.source, at: p.at } : { ...s, source: 'owner', at: now() }; });
      return U.scopedMember(e, sc);
    });
    if (widens(was, { to: rowTo, except: v.row.except }) && !reauthed) return named('reveal_needs_password');
    const g = store();
    const gen = nextGen();
    const w = rowTo.length || v.row.except.length ? g.set(U.DOOR, String(id), { to: stamp(id, rowTo, v.row.except, gen), except: v.row.except }, by) : g.remove(U.DOOR, String(id), by);
    if (w && w.ok) commitGen(id, gen);
    return landed(w, { id: String(id), members: v.row.to.length });
  }
  /** ONE member added or widened (the card's «Always», the request default, the carry, an agent's standing request the owner
   *  allowed). `tool` scopes a wildcard PER HOST; `commands` (lane vault-standing-request) the command shapes; `source` who. */
  function addMember(id, principal, { hosts = [], until = null, tool = null, commands = null, source = null, legacy = false, window = null } = {}, { by = 'user' } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const was = verifiedRow(rowOf(id));
    const plan = U.withMember(was, principal, { hosts, until, tool, commands, source, at: now(), now: now(), carry: by === 'migration', window });   // r7: `window` — the run card's «Allow for 1 hour» (its end)   // r4: per scope — a scope it names is added, or replaced when there with another end / ended; nothing else moves (the carry: the EARLIER end)
    if (!plan.ok) return named(plan.code);
    const v = rowRules(id, { to: plan.to, except: plan.except }, { was, legacy: legacy && by === 'migration' });   // round 5 (MINOR): validate the plan BEFORE any generation move (a bad plan never bumps the gen); r2 (MAJOR 1): the SAME rules the owner's Save reads; r3: judged on what THIS write brings
    if (!v.ok) return v;
    const g = store();
    const gen = nextGen();
    const w = g.set(U.DOOR, String(id), { to: stamp(id, plan.to, plan.except, gen), except: plan.except }, by);
    if (w && w.ok) commitGen(id, gen);
    return landed(w, { id: String(id), grant: U.grantIdOf(String(id), GM.principalKey(GM.bareOf(principal))), widened: plan.widened, added: plan.added, changes: plan.changes });
  }
  /** r2 (MAJOR 1): THE QUESTION BEFORE A STANDING REQUEST'S CARD — would addMember write this member? (the plan + the row
   *  rules, nothing written) → { ok: true } | the named refusal the Allow would meet. */
  function judgeMember(id, principal, { hosts = [], until = null, tool = null, commands = null, source = null, window = null } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const was = verifiedRow(rowOf(id));
    const plan = U.withMember(was, principal, { hosts, until, tool, commands, source, at: now(), now: now(), window });
    if (!plan.ok) return named(plan.code);
    const v = rowRules(id, { to: plan.to, except: plan.except }, { was });   // r3: THIS member, the row as it becomes through it — never another member's legacy wildcard
    return v.ok ? { ok: true, changes: plan.changes } : v;   // r4 (B): what the write WOULD change — the door's card words, drawn and compared at the press
  }
  /** r4 (C — the acceptance P4: the all-or-nothing restore went through setRow, judged against the row as the partial write
   *  left it, so a replaced legacy wildcard could not be put back and the refused press left its write): the row AS IT IS
   *  (its verified members, its exceptions) — what restoreRow puts back. → { ok: true, row: {to, except} | null } | vault_locked. */
  function snapshotRow(id) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const r = verifiedRow(rowOf(id));
    return { ok: true, row: r ? { to: (r.to || []).map((e) => JSON.parse(JSON.stringify(e))), except: (r.except || []).map((x) => ({ ...x })) } : null };
  }
  /** r4 (C): THE RESTORE — a snapshot written back RAW: no row rules, no widening check (it restores what WAS, lawful when it
   *  was written), every member re-marked at a NEW generation (the partial write's row can never be replayed over it); a row
   *  that was not there is removed. → { ok: true, restored: true } | a named refusal (the caller stops by name). */
  function restoreRow(id, snap, { by = 'user' } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const row = snap && snap.row ? snap.row : null;
    const to = row && Array.isArray(row.to) ? row.to : [], except = row && Array.isArray(row.except) ? row.except : [];
    const g = store();
    const gen = nextGen();
    const w = to.length || except.length ? g.set(U.DOOR, String(id), { to: stamp(id, to, except, gen), except }, by) : rowOf(id) ? g.remove(U.DOOR, String(id), by) : { ok: true };
    if (w && w.ok) commitGen(id, gen);
    return landed(w, { restored: true });
  }
  /** ONE member out (a click: a narrowing). */
  function revoke(id, principalKey, { by = 'user' } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const was = verifiedRow(rowOf(id));
    if (!was) return { ok: true, removed: false };
    const plan = U.withoutMember(was, principalKey, { now: now() });   // r8: the row's ended windows pruned with it
    if (!plan.ok) return named(plan.code);
    const g = store();
    const gen = nextGen();
    const w = plan.to.length || plan.except.length ? g.set(U.DOOR, String(id), { to: stamp(id, plan.to, plan.except, gen), except: plan.except }, by) : g.remove(U.DOOR, String(id), by);
    if (w && w.ok) commitGen(id, gen);
    return landed(w, { removed: plan.removed, window: plan.window });   // r8: the end of the live window it took (the door tells its record)
  }
  /** r8 (the r7 acceptance MINOR 4 — «nothing ends just the window early»): ONE member's WINDOW out (its chip's ✕, a click: a
   *  narrowing) — its host and command scopes stay, each with its own end; a member that held only the window goes.
   *  → { ok, removed, until (the window's end), memberGone, grant } | a named refusal. */
  function revokeWindow(id, principalKey, { by = 'user' } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const was = verifiedRow(rowOf(id));
    if (!was) return { ok: true, removed: false, until: null };
    const plan = U.withoutWindow(was, principalKey, { now: now() });
    if (!plan.ok) return named(plan.code);
    if (!plan.removed) return { ok: true, removed: false, until: null };
    const g = store();
    const gen = nextGen();
    const w = plan.to.length || plan.except.length ? g.set(U.DOOR, String(id), { to: stamp(id, plan.to, plan.except, gen), except: plan.except }, by) : g.remove(U.DOOR, String(id), by);
    if (w && w.ok) commitGen(id, gen);
    return landed(w, { removed: true, until: plan.until, memberGone: plan.memberGone, grant: U.grantIdOf(String(id), String(principalKey || '')) });
  }
  /** r8 (the r7 acceptance MINOR 5): THE HOUR-END PRUNE (the run door arms it at a window's end): the row's ENDED windows out —
   *  a write only when there is one (a locked vault writes nothing: the next write of the row prunes them). → { ok, swept } */
  function pruneWindows(id, { by = 'system' } = {}) {
    if (!okId(id)) return named('bad_resource');
    if (!unlocked()) return named('vault_locked');
    const was = verifiedRow(rowOf(id));
    if (!was) return { ok: true, swept: 0 };
    const sw = U.withoutEndedWindows(was.to || [], now());
    if (!sw.swept.length) return { ok: true, swept: 0 };
    const except = sw.to.length ? (was.except || []) : [];
    const g = store();
    const gen = nextGen();
    const w = sw.to.length || except.length ? g.set(U.DOOR, String(id), { to: stamp(id, sw.to, except, gen), except }, by) : g.remove(U.DOOR, String(id), by);
    if (w && w.ok) commitGen(id, gen);
    return landed(w, { swept: sw.swept.length });
  }
  /** r8: the end of the LIVE window `principalKey` holds on entry `id` (a verified member) — null when none. */
  function windowOf(id, principalKey) {
    const r = verifiedRow(rowOf(id));
    const e = r && (r.to || []).find((x) => GM.principalKey(x) === String(principalKey || ''));
    const t = now(), w = e && U.scopesOf(e).find((s) => s.kind === 'window' && s.until > t && s.until <= t + U.WINDOW_READ_MAX);
    return w ? w.until : null;
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
  function carry(always, { resourceOf = (x) => x, toolOfWild = null } = {}) {
    const plan = U.alwaysCarry(always, { now: now(), resourceOf, toolOfWild });
    let carried = 0, failed = 0, legacy = 0;
    for (const m of plan.members) {
      const r = addMember(m.resource, m.principal, { hosts: m.hosts, until: m.until, tool: m.tool || null, legacy: !!m.legacy }, { by: 'migration' });   // r2: a carried wildcard keeps the CLI it was minted by; r3: one whose CLI nobody can name is carried as a LEGACY member
      if (r.ok) { carried++; if (m.legacy) legacy++; } else { failed++; log(`[vault-use] an «always» row could not be carried (${m.resource}: ${r.code})`); }
    }
    return { carried, expired: plan.expired, hostless: plan.hostless, failed, legacy };
  }
  /** r3 (MAJOR 1): THE WILDCARD CARRY — every stored member's wildcard host with NO tool (the 2.369.363/.364 carry wrote them)
   *  gets the CLI the tool table names for it (`toolOfWild`), through the ONE writer, by 'migration'; one the table cannot name
   *  stays a LEGACY member (named on its row; the door tells the owner once). Run by the door at each unlock, after the carry.
   *  → { ok, healed: [{resource, principal, host, tool}], legacy: [{resource, principal, host}], failed } | vault_locked. */
  function carryWildcards(toolOfWild, { by = 'migration' } = {}) {
    if (!unlocked()) return named('vault_locked');
    const healed = [], legacy = []; let failed = 0;
    for (const raw of store().rowsOfDoor(U.DOOR)) {
      const id = raw && raw.resource;
      if (!okId(id)) continue;
      const was = verifiedRow(raw);
      const plan = U.withWildTools(was, toolOfWild, { now: now() });   // r4 (D): `legacy` names only a LIVE wildcard scope
      if (!plan.ok) continue;
      for (const l of plan.legacy) legacy.push({ resource: String(id), ...l });
      if (!plan.healed.length) continue;
      const v = rowRules(id, { to: plan.to, except: plan.except }, { was });
      if (!v.ok) { failed++; log(`[vault-use] a legacy wildcard could not be given its tool (${id}: ${v.code})`); continue; }
      const g = store();
      const gen = nextGen();
      const w = g.set(U.DOOR, String(id), { to: stamp(id, plan.to, plan.except, gen), except: plan.except }, by);
      if (w && w.ok) { commitGen(id, gen); for (const h of plan.healed) healed.push({ resource: String(id), ...h }); } else { failed++; log(`[vault-use] a legacy wildcard could not be given its tool (${id}: ${(w && w.code) || 'not_written'})`); }
    }
    if (healed.length) said();
    return { ok: true, healed, legacy, failed };
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
      if (U.holds(v) && v.member) out.push({ id: row.resource, grant: v.member.id, hosts: v.member.hosts, toolFor: v.member.toolFor || null, commands: v.member.commands, source: v.member.source, at: v.member.at, until: v.member.until, scopes: v.member.scopes.filter((s) => !s.expired) });   // lane vault-standing-request: the scope + who wrote it + since when; r4: the LIVE scopes, each its own end
    }
    return out;
  }
  return { rowsOf, verdictFor, heldBy, setRow, addMember, judgeMember, snapshotRow, restoreRow, revoke, revokeWindow, pruneWindows, windowOf, drop, carry, carryWildcards, publicFor, statusOf: (code) => STATUS[code] || 400, words: (code) => WORDS[code] || code };
}

module.exports = { create, widens, STATUS, WORDS };

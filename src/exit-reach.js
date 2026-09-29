'use strict';
/**
 * PURE (imports only the principal spelling of src/window-reach.js; CJS — the server's exit manager, its routes
 * and the browser bundle share it) — WHO MAY USE A MACHINE AS AN EXIT (lane-pairing ⑥, B-7007).
 *
 * Before this lane ONE boolean per machine (`allowExit`) opened it to EVERY conversation of the instance, for
 * both things an exit does: borrowing its network (vibespace-exit use / url — a SOCKS forward, the command runs
 * HERE) and running a shell command ON it as the machine's user (vibespace-exit run). Two different trusts, one
 * switch, no audit. Now a machine carries TWO lists, `use` and `run`, each `nobody | everyone | only [principals]`
 * (principals = conversations and Task Groups, spelled exactly as window-reach spells them), `run` with an
 * "ask me each time" switch. The browser lane's who-may-use model (spec-who-may-use §2), verbatim:
 *   · ONE reader (`exitAccessOf`) — every shape on disk, unknown rows DROPPED, a bad mode or a non-object grant
 *     makes the WHOLE access `unknown` and `unknown` refuses both grants (fail closed);
 *   · ONE verdict (`exitVerdict`) asked at EVERY call, Task Group membership read live by the caller at verb time
 *     (a store that throws is `groups_unreadable`, never "not in any group"); a pending fork answers only to its
 *     `webui:<id>` key — a parent's grant never reaches it (`fork_pending`);
 *   · a whole-list PATCH carries the `base` it read (`exitStamp`) — anything else is `list_changed` (the
 *     mirror-193 rule: a dialog drawn from a stale copy never overwrites a newer list);
 *   · a refusal names the grant it lacks and "the user" — never another conversation, a group title or a key.
 * Why not an extension of window-reach: that is a per-WINDOW record with one level and a share mode; this is
 * per-MACHINE with two independent grants, an "everyone" mode, an ask switch and a run ledger — two closed
 * censuses beat one open one; the principal spelling is shared, which is the part that must not fork.
 *
 * Gate: scripts/test-exit-reach.mjs (fast — the 84-cell grant × access × caller table, the words census with
 * poisoned names, the PATCH / base / ask / run-record tables, the real manager over fakes, patched-copy controls).
 */
const R = require('./window-reach.js');
const { sessionKeyOf, callerKeys, normPrincipal, principalKey, principalsNow } = R;

const GRANTS = Object.freeze(['use', 'run']);
const MODES = Object.freeze(['nobody', 'everyone', 'only']);
const WHO_MAX = 64;
const REFUSALS = Object.freeze(['not_granted', 'groups_unreadable', 'unknown_shape', 'fork_pending', 'no_machine', 'ambiguous',
  'no_exits', 'offline', 'ask_pending', 'ask_denied', 'ask_changed', 'ask_expired', 'ask_settled', 'ask_unfiled', 'human_only',
  'session_token_required', 'bad_command', 'bad_grant', 'bad_mode', 'bad_principal', 'empty_list',
  'too_many', 'list_changed', 'run_failed', 'conversation_gone', 'remote_session']);
/** THE run bound: the device daemon kills a `run-cmd` child at 30 s (src/agentd/agentd.js `Math.min(…, 30000)`);
 *  the exit route used to promise 120 s and never got it. ONE number: the daemon's cap, the CLI's help, the card
 *  (test-architecture pins the daemon's literal to this). */
const EXIT_RUN_TIMEOUT_MS = 30000;
const ASK_TTL_MS = 60000;          // an unanswered "ask me" item is refused by name
const CMD_MAX = 4096;              // bytes of `cmd`
const LAST_RUN_CMD_MAX = 120;      // the stored / shown head of a command
const WAY_OUT = 'the user can allow it under "Who can use it" on the machine row (Remote tab)';

function refuse(code, extra = {}) {
  if (!REFUSALS.includes(code)) throw new Error(`exit-reach: unknown refusal code ${code}`);
  return { ok: false, code, ...extra };
}
const cleanCmd = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
const cmdBytes = (s) => (typeof Buffer !== 'undefined' ? Buffer.byteLength(String(s), 'utf8') : unescape(encodeURIComponent(String(s))).length);
// verify-r5 X2 — CHARACTERS THAT CHANGE THE ORDER A COMMAND IS DISPLAYED IN ("Trojan Source": the Unicode bidi embedding /
// override / isolate controls U+202A–E and U+2066–9, the marks U+200E / U+200F / U+061C). `echo hi<RLO><LRI> ; touch ~/m
// <PDI><LRI> #<PDI><PDF>` DISPLAYS as "echo hi # ; touch ~/m" — the touch reads commented out — in the For-you row, the
// window and the chat card, and runs the touch (reproduced with a real Allow). A command is shown to a person before it
// runs (the ask) and after (the card, the row's last run, the audit): it may not carry them — refused bad_command
// (`hidden: true`), whatever the grant. → the code points found (hex), [] when none.
// verify-r6 Z2: THE SET is src/hidden-chars.js (one answer for every approval surface) — a command is judged strictly
// (no CR, no joiners): whatever the row / window / card would not show as itself is refused
const HC = require('./hidden-chars.js');
const hiddenOrderOf = (s) => HC.hiddenCharsOf(String(s == null ? '' : s), { max: 64 });

// ── the reader ──────────────────────────────────────────────────────────────
/** The rows a grant stores: closed kinds, well-formed ids, no name (a name is a live read), dedup, ≤ WHO_MAX. */
function normWho(list) {
  const out = [], seen = new Set();
  for (const row of Array.isArray(list) ? list : []) {
    const p = normPrincipal(row && { kind: row.kind, id: row.id });
    if (!p || seen.has(principalKey(p))) continue;
    seen.add(principalKey(p));
    out.push({ kind: p.kind, id: p.id });
    if (out.length >= WHO_MAX) break;
  }
  return out;
}
/** A stored grant normalized, or null (a non-object, a bad mode — the whole access is then `unknown`). */
function normGrant(g, grant) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
  if (!MODES.includes(g.mode)) return null;
  const out = { mode: g.mode, who: g.mode === 'only' ? normWho(g.who) : [] };
  if (grant === 'run') out.ask = g.ask === true;
  return out;
}
function normLastRun(x) {
  if (!x || typeof x !== 'object') return null;
  const by = x.by && typeof x.by === 'object' ? { key: String(x.by.key || '').slice(0, 200), name: cleanCmd(x.by.name, 120) } : null;
  return { at: Number(x.at) || 0, by, cmd: cleanCmd(x.cmd, LAST_RUN_CMD_MAX), code: Number.isFinite(Number(x.code)) ? Number(x.code) : null, ms: Number(x.ms) || 0, outcome: String(x.outcome || 'ran').slice(0, 20), ...(x.timedOut ? { timedOut: true } : {}), ...(x.revokedDuringRun ? { revokedDuringRun: true } : {}) };
}
/**
 * THE ONE READER of a host record's exit access (every shape on disk):
 *   `exit` present ⇒ normalized (a bad mode / a non-object grant ⇒ `{mode: 'unknown'}` — fail closed, BOTH grants);
 *   `exit` absent + `allowExit === true` ⇒ everyone / everyone (the pre-migration read, `legacy: true`);
 *   absent ⇒ nobody / nobody.
 */
function exitAccessOf(h) {
  if (!h || typeof h !== 'object') return { use: { mode: 'nobody', who: [] }, run: { mode: 'nobody', who: [], ask: false }, updatedAt: 0, lastRun: null };
  if (h.exit !== undefined) {
    const e = h.exit;
    if (!e || typeof e !== 'object' || Array.isArray(e)) return { mode: 'unknown' };
    const use = normGrant(e.use, 'use'), run = normGrant(e.run, 'run');
    if (!use || !run) return { mode: 'unknown', lastRun: normLastRun(e.lastRun) };
    return { use, run, updatedAt: Number(e.updatedAt) || 0, updatedBy: typeof e.updatedBy === 'string' ? e.updatedBy.slice(0, 20) : null, lastRun: normLastRun(e.lastRun) };
  }
  if (h.allowExit === true) return { use: { mode: 'everyone', who: [] }, run: { mode: 'everyone', who: [], ask: false }, updatedAt: 0, lastRun: null, legacy: true };
  return { use: { mode: 'nobody', who: [] }, run: { mode: 'nobody', who: [], ask: false }, updatedAt: 0, lastRun: null };
}
const isUnknown = (a) => !a || a.mode === 'unknown';

// ── the verdict ─────────────────────────────────────────────────────────────
/**
 * May THIS caller use `grant` on a machine with `access`? `ctx` = `{sessionKeys, groupIds, unreadable, forkPending}`
 * (the window-reach ctx shape; the caller reads membership live, at the verb).
 * → `{ok: true, via: 'everyone'|'session'|'group', row}` | `{ok: false, code, grant}` —
 *   nobody ⇒ not_granted; everyone ⇒ ok; only ⇒ a session row hit wins over a group row; no hit + a group row
 *   present + an unreadable store ⇒ groups_unreadable (never not_granted); a pending fork that nothing reached ⇒
 *   fork_pending; unknown ⇒ unknown_shape.
 */
function exitVerdict(access, grant, ctx = {}) {
  if (!GRANTS.includes(grant)) throw new Error(`exit-reach: unknown grant ${grant}`);
  if (isUnknown(access)) return refuse('unknown_shape', { grant });
  const g = access[grant];
  if (!g || !MODES.includes(g.mode)) return refuse('unknown_shape', { grant });
  if (g.mode === 'nobody') return refuse('not_granted', { grant });
  if (g.mode === 'everyone') return { ok: true, via: 'everyone', row: null };
  const keys = new Set((ctx && Array.isArray(ctx.sessionKeys) ? ctx.sessionKeys : []).map(String));
  const srow = g.who.find((p) => p.kind === 'session' && keys.has(p.id));
  if (srow) return { ok: true, via: 'session', row: srow };
  const gids = new Set((ctx && Array.isArray(ctx.groupIds) ? ctx.groupIds : []).map(String));
  const grow = g.who.find((p) => p.kind === 'group' && gids.has(p.id));
  if (grow) return { ok: true, via: 'group', row: grow };
  if (ctx && ctx.unreadable && g.who.some((p) => p.kind === 'group')) return refuse('groups_unreadable', { grant });
  if (ctx && ctx.forkPending) return refuse('fork_pending', { grant });
  return refuse('not_granted', { grant });
}
/** What an AGENT sees of a machine: its own two answers — never another principal, never a name. */
function agentView(access, ctx = {}) {
  const u = exitVerdict(access, 'use', ctx), r = exitVerdict(access, 'run', ctx);
  return {
    use: { you: !!u.ok, via: u.ok ? u.via : null },
    run: { you: !!r.ok, via: r.ok ? r.via : null, ask: !!(r.ok && !isUnknown(access) && access.run.ask) },
  };
}

// ── the stamp + the base ────────────────────────────────────────────────────
/** What a dialog READ, spelled so its whole-list write can prove it is still the list (channel-filter's stamp
 *  shape): one sorted JSON line per fact — each grant's mode, `run`'s ask, every principal. Order is not a change. */
function exitStamp(access) {
  if (isUnknown(access)) return JSON.stringify(['unknown']);
  const lines = [];
  for (const [p, g] of [['u', access.use], ['r', access.run]]) {
    lines.push(JSON.stringify([p, 'mode', g.mode]));
    if (p === 'r') lines.push(JSON.stringify([p, 'ask', g.ask ? 1 : 0]));
    for (const w of g.who) lines.push(JSON.stringify([p, `${w.kind}:${w.id}`]));
  }
  return lines.sort().join('\n');
}
/** The whole-list write's verdict on its base: absent = unconditional (a script); equal = ok; else list_changed
 *  naming the facts that differ (keys `use:<mode|principal>` / `run:…`). */
function exitBaseVerdict(access, base) {
  if (base === undefined || base === null) return { ok: true };
  const now = exitStamp(access);
  if (typeof base === 'string' && base === now) return { ok: true };
  const keysOf = (stamp) => new Set(String(stamp || '').split('\n').map((l) => {
    try { const v = JSON.parse(l); if (!Array.isArray(v)) return null; const g = v[0] === 'u' ? 'use' : v[0] === 'r' ? 'run' : v[0]; return v.length === 3 ? `${g}:${v[1]}=${v[2]}` : `${g}:${v[1]}`; } catch { return null; }
  }).filter(Boolean));
  const was = keysOf(typeof base === 'string' ? base : ''), is = keysOf(now);
  return refuse('list_changed', {
    error: 'the lists changed since they were read — read them again and save again (nothing was written)',
    added: [...is].filter((k) => !was.has(k)), removed: [...was].filter((k) => !is.has(k)),
  });
}

// ── the write ───────────────────────────────────────────────────────────────
/**
 * A PATCH body over the current access → `{ok: true, access, changed: {use, run}}` | a refusal. Order: shape →
 * base → per grant: mode (bad_mode) → rows (bad_principal) → dedup → WHO_MAX (too_many) → `only` with no row
 * (empty_list) → `ask` a boolean (bad_grant) → the new record (`updatedAt` = now, `lastRun` kept). A `who` row is
 * `{kind: 'session'|'group', id}` — a live-picked `{kind:'session', session:'<webui id>'}` is resolved to its key
 * by the route BEFORE this (arriving here it is bad_principal). A grant absent from the body is kept.
 */
function patchVerdict(current, body, { now = Date.now(), by = 'user' } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse('bad_grant', { error: 'send {use?: {mode, who?}, run?: {mode, who?, ask?}, base?}' });
  const extra = Object.keys(body).filter((k) => !['use', 'run', 'base'].includes(k));
  if (extra.length) return refuse('bad_grant', { error: extra.includes('on') ? 'exit access is two lists now — send use / run ({mode, who}), not {on}' : `unknown keys: ${extra.join(', ')} — send use / run / base` });
  if (!('use' in body) && !('run' in body)) return refuse('bad_grant', { error: 'send use and/or run' });
  const cur = current || exitAccessOf(null);
  const bv = exitBaseVerdict(cur, body.base);
  if (!bv.ok) return bv;
  if (isUnknown(cur) && !('use' in body && 'run' in body)) return refuse('bad_grant', { error: 'the stored access is unreadable — send both use and run to replace it' });
  const next = {};
  const changed = { use: false, run: false };
  for (const grant of GRANTS) {
    const was = isUnknown(cur) ? null : cur[grant];
    if (!(grant in body)) { next[grant] = was; continue; }
    const g = body[grant];
    if (!g || typeof g !== 'object' || Array.isArray(g)) return refuse('bad_grant', { grant, error: `${grant} must be {mode, who?${grant === 'run' ? ', ask?' : ''}}` });
    if (!MODES.includes(g.mode)) return refuse('bad_mode', { grant, error: `${grant}.mode is one of ${MODES.join(' | ')}` });
    let who = [];
    if (g.mode === 'only') {
      if (g.who != null && !Array.isArray(g.who)) return refuse('bad_principal', { grant, error: `${grant}.who must be a list` });
      const seen = new Set();
      for (const row of g.who || []) {
        const p = row && typeof row === 'object' && !('session' in row) ? normPrincipal({ kind: row.kind, id: row.id }) : null;
        if (!p) return refuse('bad_principal', { grant, error: `${JSON.stringify(row).slice(0, 80)} is not a conversation or a Task Group` });
        if (seen.has(principalKey(p))) continue;
        seen.add(principalKey(p));
        who.push({ kind: p.kind, id: p.id });
      }
      if (who.length > WHO_MAX) return refuse('too_many', { grant, error: `at most ${WHO_MAX} conversations and Task Groups per list` });
      if (!who.length) return refuse('empty_list', { grant, error: `${grant}: "only these" with nobody picked — choose nobody instead` });
    }
    const out = { mode: g.mode, who };
    if (grant === 'run') {
      if (g.ask !== undefined && typeof g.ask !== 'boolean') return refuse('bad_grant', { grant, error: 'run.ask must be true or false' });
      out.ask = g.ask !== undefined ? g.ask : !!(was && was.ask);
    }
    next[grant] = out;
    changed[grant] = !was || JSON.stringify(was) !== JSON.stringify(out);
  }
  const access = { use: next.use, run: next.run, updatedAt: Number(now) || Date.now(), updatedBy: by, lastRun: cur.lastRun || null };
  return { ok: true, access, changed };
}
/** The stored shape of an access (what hosts.json carries under `exit`). */
function storedExit(access) {
  return { use: { mode: access.use.mode, ...(access.use.mode === 'only' ? { who: access.use.who } : {}) },
    run: { mode: access.run.mode, ask: !!access.run.ask, ...(access.run.mode === 'only' ? { who: access.run.who } : {}) },
    updatedAt: access.updatedAt || 0, updatedBy: access.updatedBy || null, ...(access.lastRun ? { lastRun: access.lastRun } : {}) };
}

// ── "ask me each time" ──────────────────────────────────────────────────────
const ASK_STATES = Object.freeze(['pending', 'allowed', 'denied', 'expired']);
/** pending until answered; expired ⇔ unanswered and ≥ 60 s old. */
function askState({ askedAt, answeredAt, answer, now = Date.now() } = {}) {
  if (answeredAt) return answer === 'allow' ? 'allowed' : 'denied';
  return Number(now) - Number(askedAt) >= ASK_TTL_MS ? 'expired' : 'pending';
}
/** May this answer settle the ask? Only a person (`by: 'user'` — a cookie route), once, within 60 s. */
function answerVerdict(ask, { answer, by, now = Date.now() } = {}) {
  if (by !== 'user') return refuse('human_only', { error: 'only the user answers this — an agent cannot approve its own command' });
  if (!ask) return refuse('ask_expired', { error: 'that request is gone' });
  const st = askState({ ...ask, now });
  if (st === 'allowed' || st === 'denied') return refuse('ask_settled', { state: st, error: 'already answered' });
  if (st === 'expired') return refuse('ask_expired', { error: 'too late — it was refused after 60 s' });
  if (answer !== 'allow' && answer !== 'deny') return refuse('bad_grant', { error: 'answer is allow or deny' });
  return { ok: true, state: answer === 'allow' ? 'allowed' : 'denied' };
}

// ── the run ledger ──────────────────────────────────────────────────────────
/** The stored `lastRun` (the row's "last run"): the command's first 120 chars, control characters as spaces. */
function runRecord({ cmd, code = null, ms = 0, by = null, at = Date.now(), outcome = 'ran', timedOut = false, revokedDuringRun = false } = {}) {
  return normLastRun({ at, by, cmd, code, ms, outcome, timedOut, revokedDuringRun });
}

// ── machines ────────────────────────────────────────────────────────────────
/**
 * A machine ref (id / exact name / unique name-or-id substring; case-insensitive) over `hosts` (the list the
 * caller hands in — every machine for a named ref, so a refusal can name the GRANT; the machines open to the
 * caller for a bare one). → `{ok: true, host}` | `{ok: false, code: 'no_machine'|'ambiguous'|'no_exits', error}`.
 */
function resolveMachine(ref, hosts) {
  const all = (Array.isArray(hosts) ? hosts : []).filter((h) => h && h.id);
  const nameOf = (h) => h.name || h.id;
  if (ref == null || ref === '') {
    if (all.length === 1) return { ok: true, host: all[0] };
    if (!all.length) return refuse('no_exits', { error: `no machine is open to this conversation as an exit — ${WAY_OUT}` });
    return refuse('ambiguous', { error: `more than one exit machine — name one: ${all.map(nameOf).join(', ')}` });
  }
  const r = String(ref).toLowerCase();
  let m = all.find((h) => h.id === ref) || all.find((h) => nameOf(h).toLowerCase() === r);
  if (m) return { ok: true, host: m };
  const subs = all.filter((h) => nameOf(h).toLowerCase().includes(r) || String(h.id).toLowerCase().includes(r));
  if (subs.length === 1) return { ok: true, host: subs[0] };
  if (subs.length > 1) return refuse('ambiguous', { error: `"${String(ref).slice(0, 60)}" matches ${subs.length} machines — be more specific: ${subs.map(nameOf).join(', ')}` });
  return refuse('no_machine', { error: `no machine matches "${String(ref).slice(0, 60)}"` });
}

// ── words ───────────────────────────────────────────────────────────────────
const q = (s) => `"${String(s == null ? '' : s).slice(0, 60)}"`;
const head = (cmd, n = 80) => { const c = cleanCmd(cmd, 100000).replace(/`/g, "'"); return c.length > n ? c.slice(0, n - 1) + '…' : c; };
/**
 * THE agent-facing sentence of a refusal. Carries the MACHINE name and (for an ask) the caller's own command —
 * never another conversation's name, a Task Group title or a key (the words census poisons all three).
 * `has` = the other grant this caller DOES hold (`{use}` / `{run}`) — the sentence offers it.
 */
function refusalText(code, { machine = '', grant = 'run', has = {}, cmd = '', error = '', where = '', same = false, hidden = null } = {}) {
  const M = q(machine);
  switch (code) {
    case 'not_granted':
      if (grant === 'run') return has && has.use
        ? `machine ${M} is not open to this conversation for running commands — ${WAY_OUT}; you may still borrow its network (vibespace-exit use ${String(machine).slice(0, 60)})`
        : `machine ${M} is not open to this conversation — ${WAY_OUT}`;
      return `this conversation may not borrow ${M}'s network — ${WAY_OUT}${has && has.run ? '; you may run commands on it (vibespace-exit run)' : ''}`;
    case 'groups_unreadable': return `whether ${M} is open to you through a Task Group could not be judged — the Task Group list could not be read; run the same command again once`;
    case 'unknown_shape': return `${M}'s exit access could not be read — nothing is allowed until the user saves it again under "Who can use it" on the machine row (Remote tab)`;
    case 'fork_pending': return 'this conversation is a fork that has not announced its own id yet — run the same command again in a moment';
    case 'ask_pending': return `your previous command on ${M} still waits for the user — wait for it, then try again`;
    case 'ask_denied': return `the user did not allow \`${head(cmd)}\` on ${M}`;
    // verify-r6 W1: the user pressed Allow on a request whose shown command had changed under it — nothing ran
    case 'ask_changed': return `the request to run \`${head(cmd)}\` on ${M} changed after the user saw it — nothing ran; ask again`;
    case 'ask_expired': return `the user did not answer within 60 s — \`${head(cmd)}\` on ${M} was not run; ask them, then run it again`;
    // verify-r2 ask-a: the conversation that asked is gone (killed / ended / its call given up) — an Allow for it runs nothing
    case 'conversation_gone': return `the conversation that asked to run \`${head(cmd)}\` on ${M} has ended — nothing ran`;
    // the For-you store refused the item (the conversation already has its 20 open items) — never a silent 60 s wait
    case 'ask_unfiled': return `\`${head(cmd)}\` on ${M} needs the user's approval, but it could not be put in front of them (For you refused it: ${String(error || '').slice(0, 120)}) — nothing ran; ask the user in the chat, or resolve your open For-you items first`;
    // verify-r4 F2: a borrowed network is a port on the VibeSpace machine's OWN loopback (socks5h://…@127.0.0.1:<port>) —
    // a conversation running on another machine would be handed an address that names ITS loopback (nothing there, or
    // somebody else's service receiving the credentials). `where` = the machine the conversation runs on (a machine
    // name, never a conversation's)
    case 'remote_session': return same
      ? `this conversation already runs on ${M} — its commands already use ${M}'s network; run them directly (a borrowed network is a port on the VibeSpace machine only)`
      : `this conversation runs on ${where ? q(where) : 'another machine'}, not on the VibeSpace machine — a borrowed network is a port on the VibeSpace machine only, unreachable from there; ${has && has.run ? `run the command ON ${M} instead (vibespace-exit run ${String(machine).slice(0, 60)} -- <command>)` : `the user can open "Run commands on it" on ${M} for this conversation under "Who can use it" (Remote tab)`}`;
    case 'offline': return `${M} is offline — its daemon is not dialed in`;
    case 'session_token_required': return 'Background Work jobs cannot use exits — run it from a live conversation';
    case 'bad_command': return hidden && hidden.length
      ? `cmd carries characters that change the order it is displayed in or are not displayed at all (${hidden.slice(0, 6).join(', ')} — Unicode direction controls or invisible characters): the user would not read what runs; remove them`
      : `cmd (a shell command string, ≤ ${CMD_MAX} bytes) is required`;
    case 'run_failed': return `the link to ${M} failed while the command ran — it may or may not have run (${String(error || '').slice(0, 120)})`;
    case 'no_machine': case 'ambiguous': case 'no_exits': return String(error || '').slice(0, 300) || code;
    default: return String(error || code).slice(0, 300);
  }
}
const secs = (ms) => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} s`;
/** The chat card's words for one attempt (display-only, never billed, never in the transcript). */
function cardText(rec, { machine = '' } = {}) {
  const r = rec || {};
  const c = head(r.cmd);
  const tail = r.revokedDuringRun ? ' (access was removed while it ran)' : '';
  if (r.outcome === 'ran' && r.timedOut) return `ran \`${c}\` on ${machine} — timed out after ${EXIT_RUN_TIMEOUT_MS / 1000} s${tail}`;
  if (r.outcome === 'ran') return `ran \`${c}\` on ${machine} — exit ${r.code == null ? '?' : r.code} · ${secs(r.ms)}${tail}`;
  if (r.outcome === 'denied') return `did not run \`${c}\` on ${machine} — you denied it`;
  if (r.outcome === 'changed') return `did not run \`${c}\` on ${machine} — the request changed after it was shown`; // verify-r6 W1
  if (r.outcome === 'expired') return `did not run \`${c}\` on ${machine} — no answer in 60 s`;
  if (r.outcome === 'unfiled') return `did not run \`${c}\` on ${machine} — its approval could not be put in For you`;
  if (r.outcome === 'offline') return `did not run \`${c}\` on ${machine} — ${machine} is offline`;
  if (r.outcome === 'run_failed') return `could not finish \`${c}\` on ${machine} — the link was lost while it ran`;
  return `did not run \`${c}\` on ${machine} — this conversation may not run commands there`;
}
/** The CLI's stderr line for a terminal-mode session (no chat card). */
function cliLine(rec, { machine = '' } = {}) {
  const r = rec || {};
  if (r.outcome === 'ran') return `# ran on ${machine} — ${r.timedOut ? `timed out after ${EXIT_RUN_TIMEOUT_MS / 1000} s` : `exit ${r.code == null ? '?' : r.code}`}, ${secs(r.ms)}${r.truncated ? ' — OUTPUT CUT (the machine keeps 1 MiB of stdout / 64 KiB of stderr; the tail is missing)' : ''} (recorded)`;
  return `# did not run on ${machine} (recorded)`;
}
/** The row's numbers (the words are the client's, §11.3). */
function summaryOf(access) {
  if (isUnknown(access)) return { unknown: true, use: { mode: 'unknown', n: 0 }, run: { mode: 'unknown', n: 0, ask: false } };
  return { use: { mode: access.use.mode, n: access.use.who.length }, run: { mode: access.run.mode, n: access.run.who.length, ask: !!access.run.ask } };
}
/** Is anybody granted anything (the row's accent)? */
const anyGrant = (access) => !isUnknown(access) && (access.use.mode !== 'nobody' || access.run.mode !== 'nobody');

// ── the migration (2026-09-exit-access-lists) ───────────────────────────────
/** ONE record: `exit` present ⇒ kept; `allowExit === true` ⇒ everyone / everyone (behaviour unchanged — every
 *  agent could use and run before); else nobody / nobody. → `{kind: 'kept'|'converted'|'defaulted', exit}` —
 *  the caller archives `allowExit` first, then strips it. */
function migrateExitAccess(h, { now = Date.now() } = {}) {
  if (h && h.exit !== undefined) return { kind: 'kept', exit: h.exit };
  const on = !!(h && h.allowExit === true);
  const mode = on ? 'everyone' : 'nobody';
  return { kind: on ? 'converted' : 'defaulted', exit: { use: { mode }, run: { mode, ask: false }, updatedAt: Number(now) || Date.now(), updatedBy: 'migration' } };
}

module.exports = {
  GRANTS, MODES, WHO_MAX, REFUSALS, EXIT_RUN_TIMEOUT_MS, ASK_TTL_MS, CMD_MAX, LAST_RUN_CMD_MAX, ASK_STATES, WAY_OUT,
  sessionKeyOf, callerKeys, principalsNow, cmdBytes, hiddenOrderOf,
  exitAccessOf, exitVerdict, agentView, exitStamp, exitBaseVerdict, patchVerdict, storedExit,
  askState, answerVerdict, runRecord, resolveMachine, refusalText, cardText, cliLine, summaryOf, anyGrant, migrateExitAccess,
};

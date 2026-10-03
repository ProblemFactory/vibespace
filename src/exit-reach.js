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
 * ALL AGENTS (lane everyone-principal, 2026-10-02): the picker's "All agents" row IS the `everyone` mode — never a
 * second spelling (a `who` row of kind `everyone` is refused bad_principal at the write and dropped at the read). A
 * grant in `everyone` mode KEEPS the rows it was given (`who`, never consulted while everyone may — the verdict is
 * unchanged), so taking All away again restores exactly the conversations and Task Groups that were picked before it
 * (the owner: "never a silent loss of the per-principal rows"); `nobody` keeps none.
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
  'too_many', 'list_changed', 'run_failed', 'conversation_gone', 'remote_session', 'spawn_failed', 'device_agent_outdated']);
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
// lane-exit-run-output (2026-10-01): a command's OUTPUT is text a MACHINE wrote, toward the user (the card, the
// machine's command list) and toward agents (the CLI's `runs`) — it goes through THE belt (src/peer-text.js: bound →
// fold → frames inert) and browser-trace's URL-secret cut before it is stored; one writer (exit-proxy's audit line)
const PT = require('./peer-text.js');
const { withoutUrlSecrets } = require('./browser-trace.js');
// verify r1 F1 (2026-10-01): the stored heads redact SECRET SHAPES (a PEM block, `KEY=value`, a bearer, a known token
// prefix, `password <x>`) — the URL rule and the belt hid none of them; src/secret-shapes.js is THE one rule
const { redactSecrets, REDACTED } = require('./secret-shapes.js');
const XS = require('./exit-shell.js');
// re-exported under their own names as SHORTHAND entries below: node's CJS-to-ESM lexer (the client modules import this file
// as ESM in the suites) detects `{ a, b }`, never `{ a: X.a }`
const platformLabel = XS.platformLabel, interpreterOf = XS.interpreterOf, knownInterpreter = XS.knownInterpreter, spawnFailureText = XS.spawnFailureText, RUN_SHELL_CAP = XS.RUN_SHELL_CAP;
const OUTPUT_HEAD_BYTES = 4096;      // per stream, on the audit line / the card / the history row
const RUNS_DEFAULT = 50;             // the history's default length
const RUNS_MAX = 200;

// ── the reader ──────────────────────────────────────────────────────────────
/** The rows a grant stores: closed kinds, well-formed ids, no name (a name is a live read), dedup, ≤ WHO_MAX. An
 *  `everyone` row is never a row here (All agents is the `everyone` MODE — one spelling). */
function normWho(list) {
  const out = [], seen = new Set();
  for (const row of Array.isArray(list) ? list : []) {
    const p = row && row.kind !== 'everyone' ? normPrincipal({ kind: row.kind, id: row.id }) : null;
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
  // `everyone` keeps the rows it was given (restored when All is taken away); `nobody` keeps none
  const out = { mode: g.mode, who: g.mode === 'nobody' ? [] : normWho(g.who) };
  if (grant === 'run') out.ask = g.ask === true;
  return out;
}
/** A daemon's `spawnError` (the child never started) normalized to its two fields, or null (no code ⇒ nothing). */
function spawnErrorOf(x) {
  if (!x || typeof x !== 'object' || typeof x.code !== 'string' || !x.code) return null;
  // verify r1 F5a: the message is a DAEMON's words toward the user and the agent — the belt (invisibles folded, a frame inert)
  return { code: x.code.replace(/[^A-Z0-9_]/g, '').slice(0, 24) || 'ESPAWN', message: PT.toAgentText(cleanCmd(x.message, 200), { max: 200, kind: 'line' }) };
}
/** A daemon's stated version, bounded to a version's shape (a daemon's word toward the user and the agent) — else null. */
function agentVersionOf(v) { return typeof v === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/.test(v) ? v : null; }
/** lane device-upgrade-stuck — THE one step for an agent too old for what was asked: the device's install command. */
const reinstallStep = (machine) => `rerun the device's install command (Remote → ${String(machine || 'the machine').slice(0, 60)} → Pairing command)`;
function normLastRun(x) {
  if (!x || typeof x !== 'object') return null;
  const by = x.by && typeof x.by === 'object' ? { key: String(x.by.key || '').slice(0, 200), name: cleanCmd(x.by.name, 120) } : null;
  const sf = spawnErrorOf(x.spawnError);
  return { at: Number(x.at) || 0, by, cmd: cleanCmd(x.cmd, LAST_RUN_CMD_MAX), code: x.code === null || x.code === undefined ? null : (Number.isFinite(Number(x.code)) ? Number(x.code) : null), ms: Number(x.ms) || 0, outcome: String(x.outcome || 'ran').slice(0, 20), ...(x.timedOut ? { timedOut: true } : {}), ...(x.revokedDuringRun ? { revokedDuringRun: true } : {}), ...(sf ? { spawnError: sf } : {}), ...(knownInterpreter(x.interpreter) ? { interpreter: knownInterpreter(x.interpreter) } : {}), ...(agentVersionOf(x.agentVersion) ? { agentVersion: x.agentVersion } : {}) };
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
    if (g.mode === 'only' || g.mode === 'everyone') {
      if (g.who != null && !Array.isArray(g.who)) return refuse('bad_principal', { grant, error: `${grant}.who must be a list` });
      const seen = new Set();
      for (const row of g.who || []) {
        if (row && typeof row === 'object' && row.kind === 'everyone') return refuse('bad_principal', { grant, error: `${grant}: All agents is the mode "everyone", not a row of the list` });
        const p = row && typeof row === 'object' && !('session' in row) ? normPrincipal({ kind: row.kind, id: row.id }) : null;
        if (!p) return refuse('bad_principal', { grant, error: `${JSON.stringify(row).slice(0, 80)} is not a conversation or a Task Group` });
        if (seen.has(principalKey(p))) continue;
        seen.add(principalKey(p));
        who.push({ kind: p.kind, id: p.id });
      }
      if (who.length > WHO_MAX) return refuse('too_many', { grant, error: `at most ${WHO_MAX} conversations and Task Groups per list` });
      if (!who.length && g.mode === 'only') return refuse('empty_list', { grant, error: `${grant}: "only these" with nobody picked — choose nobody instead` });
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
/** The stored shape of an access (what hosts.json carries under `exit`) — `everyone` with the rows it keeps. */
function storedExit(access) {
  const kept = (g) => (g.mode === 'only' || (g.mode === 'everyone' && g.who.length) ? { who: g.who } : {});
  return { use: { mode: access.use.mode, ...kept(access.use) },
    run: { mode: access.run.mode, ask: !!access.run.ask, ...kept(access.run) },
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
function runRecord({ cmd, code = null, ms = 0, by = null, at = Date.now(), outcome = 'ran', timedOut = false, revokedDuringRun = false, spawnError = null, interpreter = null, agentVersion = null } = {}) {
  return normLastRun({ at, by, cmd, code, ms, outcome, timedOut, revokedDuringRun, spawnError, interpreter, agentVersion });
}

// ── the output (lane-exit-run-output, 2026-10-01) ────────────────────────────
/** The longest prefix of `s` within `n` UTF-8 bytes, never inside a code point (no Buffer: the bundle runs this too). */
function cutBytes(s, n) {
  const t = String(s == null ? '' : s);
  let bytes = 0, i = 0;
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    const b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + b > n) return { text: t.slice(0, i), cut: true };
    bytes += b; i += ch.length;
  }
  return { text: t, cut: false };
}
/**
 * THE STORED HEADS of a command's output: each stream cut to `bytes` (4 KiB) — the cut SAID, never silent —, the
 * secrets of any URL in it cut (browser-trace's rule: userinfo, a credential-named query / fragment), every SECRET
 * SHAPE redacted (src/secret-shapes.js: a PEM block, a secret-named `KEY=value`, a bearer, a known prefix — verify r1
 * F1: nine such shapes were stored verbatim), then THE belt
 * (peer-text: fold, frames inert per line). The ONE place the output is bounded and judged; the audit line, the card
 * and the history rows carry exactly this. → `{stdout, stderr, cut: {stdout, stderr}}`.
 */
function outputHeads({ stdout, stderr } = {}, { bytes = OUTPUT_HEAD_BYTES } = {}) {
  const one = (s) => {
    const pre = cutBytes(s, bytes * 2);                       // bound BEFORE the URL walk (a 1 MiB body is never regexed whole)
    // verify r2 F1: THE FOLD FIRST — the belt's fold (a NUL / control → a space, a format character out) ran AFTER the
    // secret rule, so what the rule judged was not what the reader saw: `cat /proc/<pid>/environ` (NUL-separated) hid
    // every variable but the first behind a byte the rule's boundary class does not know, and a zero-width character
    // inside a name (`SEC\u200bRET=`) split the name — the fold then revealed both whole. Folded ⇒ URL rule ⇒ shapes ⇒ cut
    const folded = PT.foldHidden(pre.text);
    const c = cutBytes(redactSecrets(withoutUrlSecrets(folded)).text, bytes);   // the URL rule, then the secret shapes (verify r1 F1), then the cut
    if (c.cut) c.text = withoutHalfMarker(c.text);                              // verify r3 F4: the cut never leaves half a marker
    const text = PT.toAgentText(c.text, { max: Math.max(1, c.text.length), kind: 'block' });
    return { text, cut: pre.cut || c.cut };
  };
  const o = one(stdout), e = one(stderr);
  return { stdout: o.text, stderr: e.text, cut: { stdout: o.cut, stderr: e.cut } };
}
/** What the card shows before "Show output": stderr when it has anything (the error is there), else stdout — the
 *  first `n` lines; `more` = lines beyond them, the other stream, or a cut. */
function outputPreview(heads, n = 3) {
  const h = heads && typeof heads === 'object' ? heads : {};
  const se = String(h.stderr || ''), so = String(h.stdout || '');
  const stream = se.trim() ? 'stderr' : so.trim() ? 'stdout' : null;
  if (!stream) return { stream: null, lines: [], more: false };
  const text = stream === 'stderr' ? se : so;
  const lines = text.replace(/\n+$/, '').split('\n');
  const cut = h.cut && typeof h.cut === 'object' ? h.cut : {};
  const other = stream === 'stderr' ? !!so.trim() : false;
  return { stream, lines: lines.slice(0, n), more: lines.length > n || other || !!cut.stdout || !!cut.stderr };
}
/** verify r1 F5b: a stored head is JUDGED ON THE WAY OUT — the fold, the secret rule, the belt again (all idempotent): a line
 *  on disk is never trusted because it is on disk (a hand-written frame in `stdout` was printed live by `vibespace-exit runs`). */
const judgeHead = (x) => {   // verify r2 F1: folded first, here too
  let t = redactSecrets(PT.foldHidden(String(x == null ? '' : x).slice(0, OUTPUT_HEAD_BYTES))).text;
  // verify r3 F4: a head that GREW under the rule (an older line stored before it: `token=a` → `token=«redacted»`, ten times
  // longer) is cut by the belt's rule (4 095 + …), never inside a marker
  if (t.length > OUTPUT_HEAD_BYTES) t = withoutHalfMarker(PT.cutText(t, OUTPUT_HEAD_BYTES).slice(0, -1)) + '…';
  return PT.toAgentText(t, { max: OUTPUT_HEAD_BYTES, kind: 'block' });
};
/** verify r3 F4: a cut never leaves HALF a marker — the byte cut fell inside `«redacted»` for ten of the pads before 4096 and the
 *  stored head ended `TOKEN=«redac` (no material, but a half marker reads as a value). A cut text ending in a proper prefix of the
 *  marker loses that prefix; the cut is said either way. */
function withoutHalfMarker(t) {
  const i = t.lastIndexOf('«');
  if (i < 0 || t.length - i >= REDACTED.length) return t;
  return REDACTED.startsWith(t.slice(i)) ? t.slice(0, i) : t;
}
/** The structured block the chat card carries beside its words (exit-proxy builds it, the renderer draws it). */
function cardOutput({ code = null, ms = 0, timedOut = false, truncated = false, spawnError = null, interpreter = null, heads = null } = {}) {
  const h = heads && typeof heads === 'object' ? heads : { stdout: '', stderr: '', cut: { stdout: false, stderr: false } };
  return {
    code: Number.isInteger(code) ? code : null, ms: Number(ms) || 0, timedOut: !!timedOut, truncated: !!truncated,
    spawnError: spawnErrorOf(spawnError), interpreter: knownInterpreter(interpreter),
    stdout: judgeHead(h.stdout), stderr: judgeHead(h.stderr),
    cut: { stdout: !!(h.cut && h.cut.stdout), stderr: !!(h.cut && h.cut.stderr) },
  };
}
/**
 * ONE history row off an audit line (the owner's `GET /api/hosts/:id/exit-runs`, the agent's `vibespace-exit runs`):
 * a `run` line with a command — ran / timed_out / spawn_failed / refused — re-bounded AND re-judged (verify r1 F5b: a
 * hand-written line is still a line, and its heads pass the belt + the secret rule again on the way out). `agent: true` drops the conversation's name and key (the agent's rows are its own). null = not a run.
 */
function runRow(l, { agent = false } = {}) {
  if (!l || typeof l !== 'object' || l.verb !== 'run' || typeof l.cmd !== 'string') return null;
  const sf = spawnErrorOf(l.spawnError);
  const refusal = typeof l.refusal === 'string' && l.refusal ? l.refusal.slice(0, 40) : null;
  const outcome = sf ? 'spawn_failed' : refusal && refusal !== 'spawn_failed' ? 'refused' : l.timedOut ? 'timed_out' : 'ran';
  const cut = l.cut && typeof l.cut === 'object' ? { stdout: !!l.cut.stdout, stderr: !!l.cut.stderr } : { stdout: false, stderr: false };
  return {
    id: typeof l.id === 'string' ? l.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || null : null,   // verify r2 F7: the line's own key (an older line has none)
    at: Number(l.at) || 0, hostId: typeof l.hostId === 'string' ? l.hostId.slice(0, 120) : null, machine: cleanCmd(l.machine, 120),
    ...(agent ? {} : { name: cleanCmd(l.name, 120), sessionKey: typeof l.sessionKey === 'string' ? l.sessionKey.slice(0, 200) : null }),
    cmd: cleanCmd(l.cmd, CMD_MAX), outcome,
    code: Number.isInteger(l.code) ? l.code : null, ms: Number(l.ms) || 0,
    timedOut: !!l.timedOut, truncated: !!l.truncated, asked: !!l.asked, revokedDuringRun: !!l['revoked-during-run'],
    refusal: outcome === 'refused' ? refusal : null, spawnError: sf,
    interpreter: knownInterpreter(l.interpreter),   // verify r1 F5a: the closed set, never a stored string as itself
    stdout: judgeHead(l.stdout), stderr: judgeHead(l.stderr), cut,   // verify r1 F5b: judged at read, never trusted raw
  };
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
function refusalText(code, { machine = '', grant = 'run', has = {}, cmd = '', error = '', where = '', same = false, hidden = null, spawnError = null, interpreter = null, platform = null, agentVersion = null } = {}) {
  const M = q(machine);
  switch (code) {
    // lane device-upgrade-stuck: a Windows agent without run-shell CANNOT run a line (no `sh` there; it cannot pick cmd.exe)
    // — refused BEFORE anything is sent, by name: the machine, its agent, the first agent that can, the one step
    case 'device_agent_outdated':
      return `did not run \`${head(cmd)}\` on ${M} — its device agent (${agentVersionOf(agentVersion) || 'an older version'}) cannot run commands on Windows; agents from ${XS.RUN_SHELL_SINCE} on can. Nothing ran. Ask the user to ${reinstallStep(machine)} — its automatic update did not take.`;
    // lane-exit-run-output: the child NEVER STARTED (the owner's Windows box had no `sh`) — why, that nothing ran, what
    // the machine runs commands under, and that an `sh` failure on a Windows machine means its agent is older than this
    // VibeSpace (an older daemon only knows the argv form the hub ran as `sh -lc`)
    case 'spawn_failed': {
      const sf = spawnErrorOf(spawnError);
      const interp = String(interpreter || XS.POSIX_SHELL);
      const label = platformLabel(platform);
      const own = platform ? XS.interpreterOf(platform) : null;
      return `could not start \`${head(cmd)}\` on ${M} — ${XS.spawnFailureText(sf, { interpreter: interp })}${sf && sf.code !== 'ESHELLLINE' ? ` (${sf.code})` : ''}; nothing ran.`
        + (label && own ? ` ${M} runs ${label}: commands there run under ${own}` : '')
        + (own && interp !== own ? ` — its agent is older than this VibeSpace (it ran \`${interp}\`): ask the user to update it (Remote tab → the machine row → Test connection)` : '');
    }
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
  // lane-exit-run-output: the child never started — the card says WHY (the owner read "exit 1 · 0.0 s" four times)
  if (r.outcome === 'spawn_failed') return `could not start \`${c}\` on ${machine} — ${XS.spawnFailureText(spawnErrorOf(r.spawnError), { interpreter: r.interpreter || XS.POSIX_SHELL })}`;
  // lane device-upgrade-stuck: refused before it was sent — never "exit 1"
  if (r.outcome === 'agent_outdated') return `did not run \`${c}\` on ${machine} — its agent${agentVersionOf(r.agentVersion) ? ' ' + r.agentVersion : ''} cannot run commands on Windows (${XS.RUN_SHELL_SINCE} or later can): ${reinstallStep(machine)}`;
  return `did not run \`${c}\` on ${machine} — this conversation may not run commands there`;
}
/** The CLI's stderr line for a terminal-mode session (no chat card). */
function cliLine(rec, { machine = '' } = {}) {
  const r = rec || {};
  if (r.outcome === 'ran') return `# ran on ${machine} — ${r.timedOut ? `timed out after ${EXIT_RUN_TIMEOUT_MS / 1000} s` : `exit ${r.code == null ? '?' : r.code}`}, ${secs(r.ms)}${r.truncated ? ' — OUTPUT CUT (the machine keeps 1 MiB of stdout / 64 KiB of stderr; the tail is missing)' : ''} (recorded)`;
  if (r.outcome === 'spawn_failed') return `# could not start on ${machine} — ${XS.spawnFailureText(spawnErrorOf(r.spawnError), { interpreter: r.interpreter || XS.POSIX_SHELL })} (recorded)`;
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
  agentVersionOf, reinstallStep,
  GRANTS, MODES, WHO_MAX, REFUSALS, EXIT_RUN_TIMEOUT_MS, ASK_TTL_MS, CMD_MAX, LAST_RUN_CMD_MAX, ASK_STATES, WAY_OUT,
  OUTPUT_HEAD_BYTES, RUNS_DEFAULT, RUNS_MAX, RUN_SHELL_CAP,
  sessionKeyOf, callerKeys, principalsNow, cmdBytes, hiddenOrderOf,
  exitAccessOf, exitVerdict, agentView, exitStamp, exitBaseVerdict, patchVerdict, storedExit,
  askState, answerVerdict, runRecord, resolveMachine, refusalText, cardText, cliLine, summaryOf, anyGrant, migrateExitAccess,
  spawnErrorOf, outputHeads, outputPreview, cardOutput, runRow, platformLabel, interpreterOf, knownInterpreter, spawnFailureText,
};

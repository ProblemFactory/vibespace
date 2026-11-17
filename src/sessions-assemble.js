'use strict';
/**
 * THE SESSION LIST'S ASSEMBLY — ONE copy for the main thread and the sweep's worker (B-360d / B-891e, lane bl-loop-a).
 * Moved verbatim out of src/routes/sessions.js: the row key (getSessionKey), the symlink-resolved cwd (realCwdOf), the
 * keyed row (withSessionKey), the kept metas' read-back (mergeKeptStopped) — and the route's merge (assembleSweep: the
 * first harness to name a key wins, a sign-in's own claude is never a row, the kept metas, the sort by startedAt) and the
 * answer's bytes (answerBytes: the JSON + its weak ETag, made ONCE per sweep). In the worker, setFacts hands it the main
 * thread's two answers realCwdOf asks (the witness's storage roots, the mount door's blocked roots), so a row is the
 * same row wherever it is built. `touched` counts the rows THIS thread built (the leg's count, law 2).
 */
const fs = require('fs');
const crypto = require('crypto');
const DOOR = require('./mount-door'); // B-afc4: the blocked-path door — asked BEFORE a user-path read
const SP = require('./storage-path.js'); // lane hub-fuse-sync-guard: is this path on a storage mount (the witness's roots)
const { onOtherMachine } = require('./task-membership.js'); // B-df5f: the ONE «another machine» predicate (withSessionKey) — PURE, imports nothing
let touched = 0;

function getSessionKey(session = {}) {
  const backend = session.backend || 'claude';
  const backendSessionId = session.backendSessionId || session.sessionId || session.claudeSessionId || null;
  return backendSessionId ? `${backend}:${backendSessionId}` : '';
}

// Symlink-resolved cwd (cached): a session opened under a symlinked path (e.g.
// claude-code-webui → vibespace) must still match a Task-Group folder set on the
// real path. Only stored when it actually differs from cwd.
const _realCwdCache = new Map();
function realCwdOf(cwd) {
  if (!cwd) return null;
  if (_realCwdCache.has(cwd)) return _realCwdCache.get(cwd);
  if (DOOR.blocked(cwd)) return null;   // B-afc4: a sync realpath into a dead FUSE would hang the event loop (not cached)
  if (SP.storageRootOf(cwd)) return null;   // lane hub-fuse-sync-guard: nor into a live storage mount — this runs on every /api/sessions rebuild
  let rp = null;
  try { const r = fs.realpathSync(cwd); if (r && r !== cwd) rp = r; } catch { /* gone/unreadable */ }
  _realCwdCache.set(cwd, rp);
  if (_realCwdCache.size > 4096) _realCwdCache.delete(_realCwdCache.keys().next().value);
  return rp;
}
// B-df5f cure (THE BOARD AND THE SERVER ANSWER THE SAME MEMBERSHIP): the HUB's real path is a fact of the hub's own folders,
// so a row that names another machine is never stamped with it. A GUARD: no producer of this route hands such a row today
// (discovery rows are local, kept-stopped rows are local metas); the road where the page met another machine's conversation
// with the hub's real path is its own merge, closed by task-membership membershipCwds
const namesOtherMachine = (s) => [s.host, s.hostId].some(onOtherMachine);
function withSessionKey(session = {}) {
  const rc = namesOtherMachine(session) ? null : realCwdOf(session.cwd);
  return {
    ...session,
    sessionKey: session.sessionKey || getSessionKey(session),
    ...(rc ? { realCwd: rc } : {}),
  };
}
/** THE READ-BACK (lane dead-socket-keeps-chat-meta), PURE over rows: the metas a boot kept for dead local sessions (ctx
 *  .stoppedSessions — boot-restore) merged into the discovered rows, `rows` grown in place. A harness's own STOPPED row of
 *  the same conversation takes why it stopped and when, and the name / account / mode the session had (the name the person
 *  knew wins over a CLI title; a row's own account stays); a live or external row is the conversation running — the meta
 *  adds nothing; no row (a harness with no discover, an index not read yet) ⇒ the meta's own row. */
function mergeKeptStopped(rows, kept) {
  const keyOf = (r) => `${r.backend || 'claude'}:${r.backendSessionId || r.sessionId}`;
  const byKey = new Map(rows.map((r) => [keyOf(r), r]));
  for (const k of kept || []) {
    if (k.forkPending) continue; // r2: a pending fork's copy carries its PARENT's id — never the parent's row, its name or its account
    const r = byKey.get(keyOf(k));
    if (!r) { const n = withSessionKey(k); touched++; rows.push(n); byKey.set(keyOf(k), n); continue; }
    if (r.status !== 'stopped') continue;
    Object.assign(r, { stopReason: k.stopReason, stoppedAt: k.stoppedAt, kept: k.kept, name: k.name || r.name, accountId: r.accountId || k.accountId || null, mode: r.mode || k.mode,
      ...(k.endedBy ? { endedBy: k.endedBy } : {}), ...(k.host && !r.host ? { host: k.host } : {}) }); // lane end-obeys-verdict: who ended it on purpose, and its machine, join the merge
  }
  return rows;
}

const seamFieldsOf = (r) => ({ status: r.status, forkPending: r.forkPending, backend: r.backend, backendSessionId: r.backendSessionId, sessionId: r.sessionId, accountId: r.accountId, name: r.name, mode: r.mode });
/** The route's merge, verbatim (src/routes/sessions.js before B-360d): `perHarness` = [{ id, entries }] in the registry's
 *  order; the first to name a session key wins; an entry whose pid is a sign-in's own process is never a row; then the
 *  kept metas; then the sort (newest startedAt first, stable). → the rows. */
function assembleSweep({ perHarness = [], signInPids = [], kept = [], discovered = null } = {}) {
  const sessions = [], seenSessionKeys = new Set(), signIn = new Set(signInPids);
  for (const h of perHarness) {
    for (const entry of h.entries || []) {
      if (entry && entry.pid && signIn.has(entry.pid)) continue;   // a sign-in's own claude (lane door-day-one-landing)
      const key = `${entry.backend || h.id}:${entry.backendSessionId || entry.sessionId}`;
      if (seenSessionKeys.has(key)) continue;
      seenSessionKeys.add(key);
      sessions.push(withSessionKey(entry)); touched++;
    }
  }
  // B-a5a4 follow-up r2/r3 (the resume seam merges the kept copies as they stand NOW into the rows AS DISCOVERED): `discovered`
  // (a Map) takes the stopped rows BEFORE the merge, by the seam's key — the fields its merge and heldAccountOf read
  if (discovered) for (const r of sessions) if (r && r.status === 'stopped') { const k = `${r.backend || 'claude'}:${r.backendSessionId || r.sessionId}`; (discovered.get(k) || discovered.set(k, []).get(k)).push(seamFieldsOf(r)); }
  try { mergeKeptStopped(sessions, kept); } catch (e) { console.warn('[sessions] the kept stopped metas:', e.message); }
  sessions.sort((a, b) => b.startedAt - a.startedAt);
  return sessions;
}
/** The rows a resume's account lookup (routes/sessions heldAccountOf) can answer from: a STOPPED row that is not a pending
 *  fork and names an account, or belongs to an account-bound harness (`bound` ids) — every other row answers as no row. */
function heldRowsOf(sessions, bound = []) {
  const b = new Set(bound);
  return sessions.filter((x) => x && x.status === 'stopped' && !x.forkPending && ((typeof x.accountId === 'string' && x.accountId) || b.has(x.backend || 'claude')))
    .map((x) => ({ status: x.status, backend: x.backend, backendSessionId: x.backendSessionId, sessionId: x.sessionId, accountId: x.accountId || null }));
}
/** The answer's bytes + its weak ETag — made once per sweep (B-360d rank 9). */
function answerBytes(sessions) {
  const buf = Buffer.from(JSON.stringify({ sessions }));
  return { buf, etag: `W/"${buf.length.toString(16)}-${crypto.createHash('sha1').update(buf).digest('base64').slice(0, 27)}"`, count: sessions.length };
}
/** The main thread's facts for this thread's realCwdOf (the sweep's worker): the witness's storage roots + their context,
 *  the mount door's blocked roots. */
function setFacts({ roots = null, blocked = null } = {}) {
  if (roots) SP.setRoots(roots.roots || [], roots);
  if (blocked) { const m = new Map(blocked); DOOR.register({ pathBlocked: (p) => { for (const [mp, until] of m) { if (Date.now() > until) continue; if (p === mp || String(p).startsWith(mp + '/')) return mp; } return false; } }); }
}

module.exports = { getSessionKey, realCwdOf, withSessionKey, mergeKeptStopped, assembleSweep, heldRowsOf, answerBytes, setFacts, touched: () => touched };

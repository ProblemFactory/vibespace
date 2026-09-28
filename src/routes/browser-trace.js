'use strict';
/**
 * BROWSER ACTION-TRACE + HOUSEKEEPING ROUTES (agent browser P5,
 * docs/design-agent-browser-v2.md §4.5 / §6.4 / §7.1 / §8 step 3, D7 / D8 /
 * D35). Thin: every decision is src/browser-trace.js's (PURE); the files, the
 * timers and the two seams are src/server/browser-trace.js's (ORCH); a route
 * decides nothing. `host` is a parameter refused by name (local-only).
 *
 *   UI (cookie-authed)
 *   GET    /api/browser/actions?sessionId=&conversation=&browserKey=&profile=&from=&to=&limit=
 *                                                 ONE conversation's actions — matched by its webui id OR by its browser key:
 *                                                 the key a LIVE session carries, the key the bindings store holds for a
 *                                                 `conversation` (the CLI's own id — a STOPPED conversation's cards still find
 *                                                 their actions, the point of a review), or a `browserKey` given outright (a
 *                                                 resume re-carries the key, the webui id churns); at least one of the three;
 *                                                 `profile` = a profile id, `ephemeral`, or empty for every scope; oldest first
 *   GET    /api/browser/sessions?conversation=&browserKey=&sessionId=&profile=&session=
 *                                                 (2026-09-27) the BROWSER SESSIONS — cookie only, the agent routes get
 *                                                 nothing new: one conversation's (matched like /actions: the live key, the
 *                                                 bindings store's key for `conversation`, a key given outright; its
 *                                                 helpers' browsers included) or one profile's (`profile` alone = every
 *                                                 conversation's sessions on it), newest first — `{traceOn, limit, browserKey,
 *                                                 keyFrom, sessions:[{id, implicit, browserKey, child, profileId, ephemeral,
 *                                                 label, startAt, endAt, open, reason, count, durationMs, frameEntries,
 *                                                 framesRemoved, frameBytes}], entries?, entriesTotal?}`; `session=bs-…` adds that
 *                                                 session's action list (`entries`, oldest first, the NEWEST 1000 — a cut is
 *                                                 named by `entriesTotal`; an entry's frames may be gone)
 *   GET    /api/browser/actions/:id                 one entry (never the bytes)
 *   GET    /api/browser/actions/:id/frame/:which    the before|after JPEG (image/jpeg, nosniff, private cache)
 *   GET    /api/browser/housekeeping              the panel: every registry row with its state + why + size, the ephemeral
 *                                                 trace digest, the adoptable orphans (§8 step 3), the forgotten ledger,
 *                                                 the last sweep, the limits — NOTHING here is a deletion
 *   POST   /api/browser/housekeeping/sweep        run the retention sweep now; answers what it removed and why
 *   GET    /api/browser/profiles/:id/use          "Who can use it" as the dialog draws it — FRESH (never the panel's copy):
 *                                                 {profile, use:{mode, who:[session rows (key, conversationId, live,
 *                                                 sessionId, name) | task rows (id, title, deleted)]}, base, usedBy, createdBy}
 *   PATCH  /api/browser/profiles/:id              { record?, label?, notes?, sharing?, use?, base? } — the editable fields;
 *                                                 "Who can use it" is a LIST (2026-09-27): `use` {mode:'all'} | {mode:'only',
 *                                                 who:[{kind:'task', id} | {kind:'session', key} | {kind:'session', session:
 *                                                 <webui id>}]} + the `base` stamp the dialog read (409 list-changed when the
 *                                                 list moved — nothing written); a picked live session is resolved to its
 *                                                 browser key by routes/browser.js's ONE resolver (one refusal ⇒ nothing
 *                                                 written); a narrowing detaches every lease the new list no longer admits
 *                                                 (each live one hears it on its next message), an unreadable Task Group list
 *                                                 keeps its lease (`undecided`); the 2.369.194 `scope`/`conversation` body is
 *                                                 refused by name; anything else refused by name
 *   POST   /api/browser/profiles/:id/forget       { release?, unpin? } archive-THEN-remove (the dir is moved beside itself, a
 *                                                 ledger row is filed BEFORE the record goes); 409 leased / running; 400 not_ours
 *                                                 by provider row; lane S2: a PINNED profile is refused `pinned` {count, names}
 *                                                 unless unpin. Owner ruling A (6): the row's Delete… sends release + unpin —
 *                                                 every lease detached by the user and the browser stopped first, then every pin
 *                                                 naming it cleared (lane S2's `unpinProfile`, the cleared MARK), then the set-aside
 *   POST   /api/browser/orphans/adopt             { dir, label }   label an unregistered directory in place
 *   POST   /api/browser/orphans/forget            { dir }          move an orphan aside + ledger row (never deleted by itself)
 *   POST   /api/browser/forgotten/:fid/delete     THE one permanent deletion — a human's click on a forgotten row
 *   GET    /api/browser/recordings/:profileId     the per-profile screencast files (D7 opt-in)
 *   GET    /api/browser/recordings/:profileId/:file   one file (video/webm | video/mp4)
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const T = require('../browser-trace.js');
const BS = require('../browser-sessions.js'); // 2026-09-27: the session ids and the pairing's shape
/** How many of one session's actions `GET /api/browser/sessions?session=` carries (the newest; `entriesTotal` says how many there are). */
const ENTRIES_MAX = 1000;
const B = require('../browser-profiles.js');
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }

const LOCAL = new Set(['', 'local']);
function hostOf(req) { const h = (req.method === 'GET' ? req.query.host : req.body?.host); return h == null ? '' : String(h); }
function refuseHost(req, res) {
  const h = hostOf(req);
  if (LOCAL.has(h)) return false;
  res.status(400).json({ error: `the browser action trace and its housekeeping are local-only in this release — host ${JSON.stringify(h)} refused`, code: 'unsupported-host' });
  return true;
}
const STATUS = {
  'not-found': 404, 'bad-request': 400, 'unsupported-host': 400, unavailable: 503, internal: 500,
  // the trace
  trace_off: 409, 'not-live': 409, ended: 409, refused: 409,
  // housekeeping (§7.1 / §8 / D8): the sweep's scope, the archive-before-remove rule
  not_ours: 400, leased: 409, running: 409, forget_failed: 500, delete_failed: 500, adopt_failed: 409, label_required: 400, label_taken: 409,
  // P6 (§6.2): `sharing` edits through PATCH — refused by the verdict (no proxy / paired machine / unknown value)
  sharing_refused: 400, pinned: 409, not_editable: 409,
  // "Who can use it" is a LIST (2026-09-27): the whole-list rule + the write's refusals + the resolver's
  'list-changed': 409, empty_list: 400, too_many: 400, unknown_task: 400, unknown_conversation: 400, no_browser_key: 409, 'session-gone': 410,
  // recording (D7)
  recording_off: 409, recording_floor: 409, recording_not_ours: 400, recording_not_local: 400, record_failed: 502, not_recording: 409, dir_unwritable: 500,
};
function fail(res, e) {
  const code = e?.code || null;
  res.status(STATUS[code] || 500).json({ error: String(e?.message || e), code, ...(e?.why ? { why: e.why } : {}),
    // list-changed names the rows that differ (the dialog re-opens on the fresh list and says so)
    ...(Array.isArray(e?.added) ? { added: e.added } : {}), ...(Array.isArray(e?.removed) ? { removed: e.removed } : {}) });
}
function traceOr503(res) {
  const tr = ctx?.trace || null;
  if (!tr) res.status(503).json({ error: 'the browser action trace is not available on this server', code: 'unavailable' });
  return tr;
}
function keeperOr503(res) {
  const k = ctx?.keeper || null;
  if (!k) res.status(503).json({ error: 'browser profiles are not available on this server', code: 'unavailable' });
  return k;
}
const PROFILE_ID_RE = /^bp-[0-9a-f]{8}$/;
const FORGOTTEN_ID_RE = /^fg-[0-9a-f]{8}$/;
/** The `profile` query → the ORCH `profileId` argument: '' = every scope, `ephemeral` = the no-profile scope, else an id. */
function scopeOf(q) {
  const v = q == null ? '' : String(q);
  if (!v) return { ok: true, profileId: undefined };
  if (v === T.EPHEMERAL_SCOPE) return { ok: true, profileId: null };
  if (PROFILE_ID_RE.test(v)) return { ok: true, profileId: v };
  return { ok: false, error: `profile must be a profile id, "${T.EPHEMERAL_SCOPE}" or empty — got ${JSON.stringify(v)}` };
}

// ── the trace ──
// THE PATH IS `actions`, NOT `trace` (2.369.145): EasyPrivacy carries the rule `/trace?sessionid=`
// (filters match case-insensitively), so the old `/api/browser/trace?sessionId=…` was blocked by
// every content blocker on the owner's browser — fetch threw, the card said "server unreachable".
router.get('/api/browser/actions', (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  const sessionId = req.query.sessionId == null ? '' : String(req.query.sessionId);
  const conversation = req.query.conversation == null ? '' : String(req.query.conversation);
  const givenKey = req.query.browserKey == null ? '' : String(req.query.browserKey);
  if (!sessionId && !conversation && !givenKey) return res.status(400).json({ error: 'one of sessionId, conversation or browserKey is required', code: 'bad-request' });
  if (givenKey && !B.isBrowserKey(givenKey)) return res.status(400).json({ error: `browserKey ${JSON.stringify(givenKey)} is not a browser key`, code: 'bad-request' });
  const sc = scopeOf(req.query.profile);
  if (!sc.ok) return res.status(400).json({ error: sc.error, code: 'bad-request' });
  const live = sessionId ? (ctx?.activeSessions?.get?.(sessionId) || null) : null;
  // the key: the live session's, else the bindings store's for the conversation (read off the file — a stopped conversation has no live record), else the one given
  let browserKey = live && live._browserKey ? String(live._browserKey) : null;
  let keyFrom = browserKey ? 'session' : null;
  if (!browserKey && conversation && ctx?.bindings?.lookup) { try { const k = ctx.bindings.lookup(conversation); if (k) { browserKey = k; keyFrom = 'conversation'; } } catch { /* the store is optional */ } }
  if (!browserKey && givenKey) { browserKey = givenKey; keyFrom = 'given'; }
  // nothing to match by (a conversation the store never bound, no live session) ⇒ an honest EMPTY answer, never "every entry"
  if (!sessionId && !browserKey) return res.json({ sessionId: null, conversation: conversation || null, browserKey: null, keyFrom: null, traceOn: tr.enabled(), entries: [] });
  try {
    const entries = tr.list({ sessionId: sessionId || null, browserKey, anyOf: true, profileId: sc.profileId, from: Number(req.query.from) || 0, to: req.query.to != null && req.query.to !== '' ? Number(req.query.to) : Infinity, limit: Number(req.query.limit) || 200 });
    res.json({ sessionId: sessionId || null, conversation: conversation || null, browserKey, keyFrom, traceOn: tr.enabled(), entries });
  } catch (e) { fail(res, e); }
});
router.get('/api/browser/sessions', (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  const sessionId = req.query.sessionId == null ? '' : String(req.query.sessionId);
  const conversation = req.query.conversation == null ? '' : String(req.query.conversation);
  const givenKey = req.query.browserKey == null ? '' : String(req.query.browserKey);
  const asked = req.query.session == null ? '' : String(req.query.session);
  if (givenKey && !B.isBrowserKey(givenKey)) return res.status(400).json({ error: `browserKey ${JSON.stringify(givenKey)} is not a browser key`, code: 'bad-request' });
  if (asked && !BS.isSessionId(asked)) return res.status(400).json({ error: `session ${JSON.stringify(asked)} is not a browser session id`, code: 'bad-request' });
  const sc = scopeOf(req.query.profile);
  if (!sc.ok) return res.status(400).json({ error: sc.error, code: 'bad-request' });
  if (!sessionId && !conversation && !givenKey && sc.profileId === undefined) return res.status(400).json({ error: 'one of sessionId, conversation, browserKey or profile is required', code: 'bad-request' });
  const live = sessionId ? (ctx?.activeSessions?.get?.(sessionId) || null) : null;
  let browserKey = live && B.isBrowserKey(live._browserKey) ? String(live._browserKey) : null;
  let keyFrom = browserKey ? 'session' : null;
  if (!browserKey && conversation && ctx?.bindings?.lookup) { try { const k = ctx.bindings.lookup(conversation); if (k) { browserKey = k; keyFrom = 'conversation'; } } catch { /* the store is optional */ } }
  if (!browserKey && givenKey) { browserKey = givenKey; keyFrom = 'given'; }
  const limit = typeof tr.bytesLimit === 'function' ? tr.bytesLimit() : T.TRACE_BYTES_PER_PROFILE;
  // a conversation this server cannot name (no live key, never bound) ⇒ an honest EMPTY list, never every session
  const conversationAsked = !!(sessionId || conversation || givenKey);
  if (conversationAsked && !browserKey && !sessionId) return res.json({ traceOn: tr.enabled(), limit, browserKey: null, keyFrom: null, sessions: [] });
  try {
    const list = tr.sessions({ browserKey, sessionId: conversationAsked ? sessionId || null : null, profileId: sc.profileId });
    const out = { traceOn: tr.enabled(), limit, browserKey, keyFrom, sessions: list };
    if (asked) {
      const s = list.find((x) => x.id === asked);
      // the LAST `ENTRIES_MAX` actions ride the answer; a cut is NAMED (`entriesTotal` > `entries.length`) — the window
      // says "last N of M", never a silent 1000 under a session row that says 5 000 (verifier 2026-09-28)
      const all = s ? tr.sessionEntries(asked, { scope: s.scope }) : [];
      out.entries = all.slice(-ENTRIES_MAX);
      out.entriesTotal = all.length;
      out.session = s || null;
    }
    res.json(out);
  } catch (e) { fail(res, e); }
});
router.get('/api/browser/actions/:id', (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  if (!T.isEntryId(req.params.id)) return res.status(400).json({ error: 'bad trace id', code: 'bad-request' });
  const e = tr.entry(req.params.id);
  if (!e) return res.status(404).json({ error: `no trace entry ${req.params.id}`, code: 'not-found' });
  res.json({ entry: e });
});
router.get('/api/browser/actions/:id/frame/:which', (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  if (!T.isEntryId(req.params.id)) return res.status(400).json({ error: 'bad trace id', code: 'bad-request' });
  const which = req.params.which === 'before' ? 'before' : req.params.which === 'after' ? 'after' : null;
  if (!which) return res.status(400).json({ error: 'which must be before or after', code: 'bad-request' });
  const fp = tr.framePath(req.params.id, which);
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: `no ${which} frame for ${req.params.id}`, code: 'not-found' });
  res.set('Content-Type', 'image/jpeg');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'private, max-age=3600'); // a frame never changes under its id; it is still a secret (§6.4)
  res.sendFile(path.resolve(fp));
});

// ── housekeeping (§6.4 / §7.1 / §8 step 3 / D8) ──
/** Owner ruling A: the panel names WHO USES each profile (the live conversations holding a lease or pinning it — the
 *  Delete… warning's count and the "Who can use it" options) and lists every live conversation that has a browser key
 *  (an "Only …" choice). Names are the user's own conversations — the panel is the user's, never an agent's. */
function conversationRows() {
  const out = [];
  for (const [id, s] of (ctx?.activeSessions || new Map())) {
    if (!s || !B.isBrowserKey(s._browserKey)) continue;
    out.push({ browserKey: s._browserKey, sessionId: id, name: String(s.webuiName || s.name || id), pinned: s._browserProfileId || null, lastActive: Number(s.createdAt || 0) || 0 });
  }
  return out.sort((a, b) => b.lastActive - a.lastActive);
}
/** The conversation id a live session is filed under (claude first, then the backend's own). */
const convIdOf = (s) => (s && (s.claudeSessionId || s.backendSessionId)) || null;
/** A live session on another machine carrying this browser key → {sessionId, name}, else null. */
function remoteHolderOf(key) {
  for (const [id, s] of (ctx?.activeSessions || new Map())) if (s && s._browserKey === key && (s.hostId || s.host)) return { sessionId: id, name: String(s.webuiName || s.name || id) };
  return null;
}
/** Live sessions by their browser key → {sessionId, name, backend, conversationId}. */
function liveByKey() {
  const out = new Map();
  for (const [id, s] of (ctx?.activeSessions || new Map())) {
    if (!s || !B.isBrowserKey(s._browserKey)) continue;
    out.set(s._browserKey, { sessionId: id, name: String(s.webuiName || s.name || id), backend: s.backend || null, conversationId: convIdOf(s) });
  }
  return out;
}
/**
 * "Who can use it" as the panel and the dialog draw it (§6.1): every row NAMED where this server can name it — a
 * conversation's live session (its name, its webui id) or, stopped, the conversation id the bindings store holds for its
 * key (the client names it from its own rows); a Task Group's title, `deleted` when the store no longer lists it,
 * `archived` when it does but its conversations no longer belong. `bindingsMap` is read at most once per request.
 */
function useViewOf(p, live, cache = {}) {
  const k = ctx?.keeper || null;
  const U = B.whoMayUse(p);
  if (!U || U.mode === 'all') return { mode: 'all' };
  if (U.mode === 'unknown') return { mode: 'unknown', who: [] };
  const convOf = (key) => {
    if (cache.byKey === undefined) { cache.byKey = null; try { cache.byKey = ctx?.bindings?.conversationsByKey ? ctx.bindings.conversationsByKey() : null; } catch { cache.byKey = null; } }
    return cache.byKey ? cache.byKey.get(key) || null : null;
  };
  return {
    mode: 'only',
    who: U.who.map((w) => {
      if (w.kind === 'session') {
        const l = live.get(w.id) || null;
        return { kind: 'session', key: w.id, conversationId: (l && l.conversationId) || convOf(w.id), live: !!l, sessionId: l ? l.sessionId : null, name: l ? l.name : null, backend: l ? l.backend : null };
      }
      const f = k && typeof k.taskInfo === 'function' ? k.taskInfo(w.id) : undefined;
      return { kind: 'task', id: w.id, title: f ? String(f.title || '') || null : null, deleted: f === null, archived: !!(f && f.archived), unreadable: f === undefined };
    }),
  };
}
function usedByOf(profileId, convs) {
  const k = ctx?.keeper || null;
  const byKey = new Map(convs.map((c) => [c.browserKey, c]));
  const out = new Map();
  const add = (bk, what) => { const c = byKey.get(bk) || null; const r = out.get(bk) || { browserKey: bk, sessionId: c ? c.sessionId : null, name: c ? c.name : null, leased: false, pinned: false }; r[what] = true; out.set(bk, r); };
  if (k) {
    for (const l of (typeof k.leasesOn === 'function' ? k.leasesOn(profileId) : [])) add(B.parentKeyOf(l.browserKey), 'leased');
    for (const x of (typeof k.pinnedBy === 'function' ? k.pinnedBy(profileId) : [])) add(x.browserKey, 'pinned');
  }
  for (const c of convs) if (c.pinned === profileId) add(c.browserKey, 'pinned');
  return [...out.values()];
}
router.get('/api/browser/housekeeping', async (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  try {
    const h = await tr.housekeeping();
    const convs = conversationRows();
    const k = ctx?.keeper || null;
    const live = liveByKey(), cache = {};
    for (const r of h.profiles || []) {
      const p = k && typeof k.profile === 'function' ? k.profile(r.id) : null;
      r.scope = p ? B.scopeOf(p) : null;
      // "Who can use it" (2026-09-27): the list, named (the panel's chips) — the dialog re-reads it FRESH (GET …/use)
      r.use = p ? useViewOf(p, live, cache) : null;
      r.createdBy = p ? p.createdBy || null : null;
      r.usedBy = usedByOf(r.id, convs);
    }
    res.json({ ...h, conversations: convs.map(({ pinned, lastActive, ...c }) => c) });
  } catch (e) { fail(res, e); }
});
router.post('/api/browser/housekeeping/sweep', (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  try { const r = tr.sweep(); res.json({ ok: true, removed: r.removed, bytesRemoved: r.bytesRemoved, recordingsRemoved: r.recordingsRemoved, recordingBytesRemoved: r.recordingBytesRemoved, plan: r.plan, recordings: r.recordings, at: r.at }); }
  catch (e) { fail(res, e); }
});
/** "Who can use it" as the dialog draws it — FRESH from the registry (mirror-193: never the panel's broadcast copy), with
 *  the `base` stamp the dialog's Save must send back, and who USES it now (the dialog's "will lose it" count: each
 *  holder's key, its live session, and the Task Groups it belongs to now). */
router.get('/api/browser/profiles/:id/use', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!PROFILE_ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const p = k.profile(req.params.id);
  if (!p) return res.status(404).json({ error: `no profile ${req.params.id}`, code: 'not-found' });
  if (B.isEphemeralProfile(p)) return res.status(409).json({ error: `"${p.label}" is a conversation's own temporary browser — it has no "Who can use it"`, code: 'not_editable' });
  try {
    const live = liveByKey(), cache = {};
    const use = useViewOf(p, live, cache);
    // `live` = a running session carries the key; a STOPPED holder's Task Groups are not readable now, so the dialog's
    // "will lose it" count mirrors the keeper's re-judge (kept, undecided, when a Task Group row could admit it)
    const usedBy = usedByOf(p.id, conversationRows()).map((u) => ({ key: u.browserKey, sessionId: u.sessionId, name: u.name, leased: !!u.leased, pinned: !!u.pinned, live: !!u.sessionId, taskIds: typeof k.taskIdsForKey === 'function' ? k.taskIdsForKey(u.browserKey).ids : [] }));
    let createdBy = null;
    if (p.createdBy) {
      const l = live.get(p.createdBy) || null;
      let cid = l ? l.conversationId : null;
      if (!cid) { try { cid = ctx?.bindings?.conversationOf ? ctx.bindings.conversationOf(p.createdBy) || null : null; } catch { cid = null; } }
      createdBy = { key: p.createdBy, conversationId: cid, live: !!l, sessionId: l ? l.sessionId : null, name: l ? l.name : null };
    }
    res.json({ profile: { id: p.id, label: p.label, legacy: !!p.legacy }, use, base: B.useStamp(p), usedBy, createdBy });
  } catch (e) { fail(res, e); }
});
router.patch('/api/browser/profiles/:id', async (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!PROFILE_ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (typeof k.updateProfile !== 'function') return res.status(503).json({ error: 'this keeper cannot edit a profile', code: 'unavailable' });
  const { host, ...patch } = req.body || {};
  try {
    // "Who can use it" (§6.2): shape → base → resolve the picked live sessions (the ONE resolver, routes/browser.js — one
    // refusal and NOTHING is written: a partial list is a list the user never saw) → the keeper validates the rows,
    // dedups, caps, RE-ASKS the base (after these awaits), applies, re-judges the leases, commits once
    const knownKeys = [];
    if (patch.use !== undefined && patch.scope === undefined && patch.conversation === undefined) {
      const sv = B.useShapeVerdict(patch.use);
      if (!sv.ok) return res.status(STATUS[sv.code] || 400).json({ error: sv.error, code: sv.code });
      const p0 = k.profile(req.params.id);
      if (!p0) return res.status(404).json({ error: `no profile ${req.params.id}`, code: 'not-found' });
      const bv = B.useBaseVerdict(p0, patch.base);
      if (!bv.ok) return res.status(STATUS[bv.code] || 409).json({ error: bv.error, code: bv.code, added: bv.added || [], removed: bv.removed || [] });
      const rows = [];
      for (const r of sv.rows) {
        if (r.kind === 'session' && r.session !== undefined) {
          const kr = typeof ctx?.keyForPickedSession === 'function' ? await ctx.keyForPickedSession(r.session) : { ok: false, code: 'no_browser_key', error: 'picked sessions cannot be resolved on this server' };
          if (!kr || !kr.ok) return res.status(STATUS[kr && kr.code] || 409).json({ error: (kr && kr.error) || 'that conversation could not be added', code: (kr && kr.code) || 'no_browser_key', session: r.session, name: (kr && kr.name) || null, ...(kr && kr.why ? { why: kr.why } : {}) });
          rows.push({ kind: 'session', key: kr.key }); knownKeys.push(kr.key);
        } else if (r.kind === 'session') {
          // a `key` row carried by a live session on ANOTHER machine is refused like a picked one (the Agent browser runs
          // on this machine only; the picker never offers it — a request naming its key is answered the same way)
          const rs = remoteHolderOf(r.key);
          if (rs) return res.status(STATUS.no_browser_key).json({ error: `"${rs.name}" runs on another machine — the Agent browser runs on this machine only`, code: 'no_browser_key', why: 'remote', key: r.key, name: rs.name });
          rows.push({ kind: 'session', key: r.key });
        } else rows.push({ kind: 'task', id: r.id });
      }
      patch.use = sv.mode === 'all' ? { mode: 'all' } : { mode: 'only', who: rows };
    }
    const r = k.updateProfile(req.params.id, patch, { knownKeys });
    // a narrowing's detached conversations each hear it on their next message (layer ②, zero billed turns)
    for (const d of r.detached || []) {
      const s = d.sessionId ? ctx?.activeSessions?.get?.(d.sessionId) : null;
      if (!s || typeof ctx?.notice !== 'function') continue;
      try { ctx.notice(d.sessionId, s, { ...B.profileChangeNotice({ was: r.profile.label, now: '', by: 'user', handles: [] }), kind: 'browser-profile' }); } catch { /* optional */ }
    }
    res.json(r);
  } catch (e) { fail(res, e); }
});
router.post('/api/browser/profiles/:id/forget', async (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  if (!PROFILE_ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  const release = req.body?.release === true, unpin = req.body?.unpin === true;
  try {
    // owner ruling A (6): Delete… — release every lease + stop the browser FIRST (a user act: the leases are what a plain
    // set-aside would be refused for), then lane S2's refuse-or-warn — the housekeeping verdict (leased / running / not
    // ours: never an unpin for a set-aside that cannot happen), a PINNED profile only with `unpin` (every pin cleared with
    // its MARK, each chat's browser chip says so; never a dangling pin) — THEN the set-aside (archive-before-remove)
    let released = null;
    if (release && typeof ctx?.releaseProfile === 'function') released = await ctx.releaseProfile(req.params.id);
    const kv = ctx.keeper && typeof ctx.keeper.removeVerdict === 'function' ? ctx.keeper.removeVerdict(req.params.id) : { ok: true };
    if (!kv.ok) return res.status(STATUS[kv.code] || 409).json({ error: kv.error, code: kv.code });
    const g = typeof ctx.pinGuard === 'function' ? ctx.pinGuard(req.params.id, unpin) : null;
    if (g) return res.status(409).json(g);
    const u = unpin && typeof ctx.unpinProfile === 'function' ? ctx.unpinProfile(req.params.id) : null;
    const r = await tr.forgetProfile(req.params.id, { unpin });
    res.json({ ...r, ...(released ? { detached: released.detached.length, stopped: released.stopped } : {}), unpinned: u ? u.cleared : 0 });
  } catch (e) { fail(res, e); }
});
router.post('/api/browser/orphans/adopt', (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  const dir = req.body?.dir == null ? '' : String(req.body.dir);
  const label = req.body?.label == null ? '' : String(req.body.label);
  if (!dir) return res.status(400).json({ error: 'dir is required', code: 'bad-request' });
  if (!label.trim()) return res.status(400).json({ error: 'a label is required', code: 'label_required' });
  try { res.json(tr.adoptOrphan({ dir, label })); } catch (e) { fail(res, e); }
});
router.post('/api/browser/orphans/forget', (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  const dir = req.body?.dir == null ? '' : String(req.body.dir);
  if (!dir) return res.status(400).json({ error: 'dir is required', code: 'bad-request' });
  try { res.json(tr.forgetOrphan(dir)); } catch (e) { fail(res, e); }
});
router.post('/api/browser/forgotten/:fid/delete', async (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  if (!FORGOTTEN_ID_RE.test(req.params.fid)) return res.status(400).json({ error: 'bad ledger id', code: 'bad-request' });
  try { res.json(await tr.deleteForgotten(req.params.fid)); } catch (e) { fail(res, e); }
});

// ── recordings (D7: opt-in per profile) ──
router.get('/api/browser/recordings/:profileId', (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  if (!PROFILE_ID_RE.test(req.params.profileId)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json({ profileId: req.params.profileId, recordings: tr.recordingsOf(req.params.profileId), live: tr.digest().recording[req.params.profileId] || null }); } catch (e) { fail(res, e); }
});
router.get('/api/browser/recordings/:profileId/:file', (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  const fp = tr.recordingPath(req.params.profileId, req.params.file);
  if (!fp) return res.status(400).json({ error: 'bad recording name', code: 'bad-request' });
  if (!fs.existsSync(fp)) return res.status(404).json({ error: `no recording ${req.params.file}`, code: 'not-found' });
  res.set('Content-Type', req.params.file.endsWith('.mp4') ? 'video/mp4' : 'video/webm');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'private, no-store'); // a recording of a logged-in profile is a secret (§6.4)
  res.sendFile(path.resolve(fp));
});

module.exports = { router, setup, STATUS };

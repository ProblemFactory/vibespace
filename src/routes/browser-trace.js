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
 *   GET    /api/browser/actions/:id                 one entry (never the bytes)
 *   GET    /api/browser/actions/:id/frame/:which    the before|after JPEG (image/jpeg, nosniff, private cache)
 *   GET    /api/browser/housekeeping              the panel: every registry row with its state + why + size, the ephemeral
 *                                                 trace digest, the adoptable orphans (§8 step 3), the forgotten ledger,
 *                                                 the last sweep, the limits — NOTHING here is a deletion
 *   POST   /api/browser/housekeeping/sweep        run the retention sweep now; answers what it removed and why
 *   PATCH  /api/browser/profiles/:id              { record?, label?, notes? } — the editable fields; anything else refused by name
 *   POST   /api/browser/profiles/:id/forget       archive-THEN-remove (the dir is moved beside itself, a ledger row is filed
 *                                                 BEFORE the record goes); 409 leased / running; 400 not_ours by provider row
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
  sharing_refused: 400, pinned: 409,
  // recording (D7)
  recording_off: 409, recording_floor: 409, recording_not_ours: 400, recording_not_local: 400, record_failed: 502, not_recording: 409, dir_unwritable: 500,
};
function fail(res, e) {
  const code = e?.code || null;
  res.status(STATUS[code] || 500).json({ error: String(e?.message || e), code, ...(e?.why ? { why: e.why } : {}) });
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
router.get('/api/browser/housekeeping', async (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  try { res.json(await tr.housekeeping()); } catch (e) { fail(res, e); }
});
router.post('/api/browser/housekeeping/sweep', (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  try { const r = tr.sweep(); res.json({ ok: true, removed: r.removed, bytesRemoved: r.bytesRemoved, recordingsRemoved: r.recordingsRemoved, recordingBytesRemoved: r.recordingBytesRemoved, plan: r.plan, recordings: r.recordings, at: r.at }); }
  catch (e) { fail(res, e); }
});
router.patch('/api/browser/profiles/:id', (req, res) => {
  if (refuseHost(req, res)) return;
  const k = keeperOr503(res); if (!k) return;
  if (!PROFILE_ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  if (typeof k.updateProfile !== 'function') return res.status(503).json({ error: 'this keeper cannot edit a profile', code: 'unavailable' });
  const { host, ...patch } = req.body || {};
  try { res.json(k.updateProfile(req.params.id, patch)); } catch (e) { fail(res, e); }
});
router.post('/api/browser/profiles/:id/forget', async (req, res) => {
  if (refuseHost(req, res)) return;
  const tr = traceOr503(res); if (!tr) return;
  if (!PROFILE_ID_RE.test(req.params.id)) return res.status(400).json({ error: 'bad id', code: 'bad-request' });
  try { res.json(await tr.forgetProfile(req.params.id)); } catch (e) { fail(res, e); }
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

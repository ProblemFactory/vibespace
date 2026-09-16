'use strict';
/**
 * INTEGRATIONS ROUTES (docs/design-communication-panel.zh.md §14.4).
 *
 * Every body a route returns is `publicView(id)` — THE masked view — and no
 * route ever returns a secret field's plaintext: not `GET`, and there is no
 * "show me". The UI offers REPLACE, never REVEAL: a secret that can be read
 * back is a secret one XSS or one mis-opened window can read back.
 *
 * All four sit behind the cookie auth (`app.use(auth.middleware())` runs
 * before any router is mounted). Every failure answers `{error, code}` so the
 * client can toast it — `fetchJson` never throws, and a 200-with-nothing would
 * be a silent failure of a user action (§14.11.6).
 *
 *   GET    /api/integrations            — every row's masked view
 *   GET    /api/integrations/:id        — one row's masked view
 *   PUT    /api/integrations/:id        — {values} | {use:'cluster'} | {clusterKey}
 *   POST   /api/integrations/:id/test   — the human's click; bounded
 *   DELETE /api/integrations/:id        — "drop my keys"; always allowed
 */
const express = require('express');
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }

function store() {
  const s = ctx && ctx.getStore && ctx.getStore();
  if (!s) { const e = new Error('Integrations are not available on this instance'); e.status = 503; e.code = 'unavailable'; throw e; }
  return s;
}
function fail(res, e) {
  return res.status(e && e.status ? e.status : 500).json({ error: String((e && e.message) || e), code: (e && e.code) || null, detail: (e && e.detail) || null });
}

router.get('/api/integrations', (req, res) => {
  try { res.json(store().list()); } catch (e) { fail(res, e); }
});

router.get('/api/integrations/:id', (req, res) => {
  try { res.json({ integration: store().publicView(req.params.id) }); } catch (e) { fail(res, e); }
});

/** ONE verb, three payload shapes, each routed to ITS function (§14.3's two
 *  intents are two functions; the selector is a third). */
router.put('/api/integrations/:id', (req, res) => {
  try {
    const s = store();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let view;
    if (body.use === 'cluster') view = s.useClusterDefault(req.params.id);
    else if (Object.prototype.hasOwnProperty.call(body, 'clusterKey')) view = s.setClusterKey(req.params.id, body.clusterKey);
    else if (body.values && typeof body.values === 'object') view = s.setIntegration(req.params.id, body.values);
    else { const e = new Error('expected {values} or {use:"cluster"} or {clusterKey}'); e.status = 400; e.code = 'bad-request'; throw e; }
    res.json({ ok: true, integration: view });
  } catch (e) { fail(res, e); }
});

router.post('/api/integrations/:id/test', async (req, res) => {
  try {
    const r = await store().test(req.params.id);
    res.json({ ...r, integration: store().publicView(req.params.id) });
  } catch (e) { fail(res, e); }
});

router.delete('/api/integrations/:id', (req, res) => {
  try { res.json({ ok: true, integration: store().clearUserValues(req.params.id) }); } catch (e) { fail(res, e); }
});

module.exports = { router, setup };

'use strict';
// THE GUIDED DOOR'S WAY ② (lane oat-add-door, 2.369.399 — the owner, 2026-11-13): the subscription type of an account whose
// long-lived token carries none, STATED BY THE PERSON. GET answers what this hub's Claude Code offers — src/plan-names.js
// planChoices over the binary's own values (cli-model-catalog plans: read from its bytes) and the scopes its own mint asks for
// (accounts.oatMintCaps: the measurement, per version) — and the row's shape with its provenance; POST {choice} writes it
// (accounts.setOatShapeByPerson, the file through the one queue). Not offered (no scopes measured for this CLI, its values not
// read, a version the two disagree on) ⇒ `choices: []` and `why` — the door says «sign in once». A person's door: an agent's
// bearer is refused by name. No vendor call anywhere in it. Mounted by src/server/account-usage-routes.js; the suites mount it
// as it is (test-oat-add-door, test-oat-add-door-chrome) with their own store and plan values.
const planNames = require('../plan-names.js');
const { pressBearer } = require('../write-origin.js');   // EVERY bearer (vsst_ / jbt_ / an automation key's vsak_) — acceptance r1 MUST 3

/** registerOatShapeRoutes(app, { accounts, isAgentBearer, plans? }) — `plans()` = the binary in use's plan values (default: the
 *  catalog reader's) */
function registerOatShapeRoutes(app, { accounts, isAgentBearer, plans: plansOf = null }) {
  const readPlans = () => { try { return typeof plansOf === 'function' ? plansOf() : require('./cli-model-catalog.js').plans(); } catch { return null; } };
  // THE ONE OFFER (acceptance r1): the store reads it too — the walls, ⟳ and the roster say «or choose it» exactly where this door does
  if (typeof accounts.setPlansReader === 'function') accounts.setPlansReader(readPlans);
  const shapeOffer = () => accounts.oatShapeOffer();
  // A PERSON'S DOOR: every bearer is refused by name — an agent's session or job token, and an automation key alike
  const refuseBearer = (req, res) => {
    const agent = isAgentBearer(req), other = !agent && pressBearer(req.headers || {});
    if (!agent && !other) return false;
    res.status(403).json({ error: 'a person’s door — no bearer token is accepted here', code: agent ? 'agent_forbidden' : 'human_only' });
    return true;
  };
  const shapeRowOf = (id) => { try { return (accounts.list().accounts || []).find((x) => x.id === id) || null; } catch { return null; } };
  app.get('/api/accounts/:id/oat-shape', (req, res) => {
    if (refuseBearer(req, res)) return;
    if (!accounts.get(req.params.id)) return res.status(404).json({ error: 'unknown account', code: 'unknown' });
    const o = shapeOffer();
    const row = shapeRowOf(req.params.id);
    res.json({ cli: o.mint.cli, choices: o.choices, ...(o.why ? { why: o.why } : {}), namesAt: planNames.PLAN_NAMES_AT, shape: (row && row.oatShape) || null, ...(row && row.oatShapeReplaced ? { replaced: row.oatShapeReplaced } : {}) });
  });
  app.post('/api/accounts/:id/oat-shape', async (req, res) => {
    if (refuseBearer(req, res)) return;
    const choice = typeof req.body?.choice === 'string' ? req.body.choice : '';
    if (!planNames.choiceIdOk(choice)) return res.status(400).json({ error: 'not a subscription type choice', code: 'bad_choice' });
    const o = shapeOffer();
    const shape = o.choices.length ? planNames.choiceShape(choice, o.plans, { scopes: o.mint.scopes }) : null;
    if (!shape) return res.status(409).json({ error: o.why ? 'this Claude Code does not offer a choice here — sign in once instead' : 'this Claude Code does not offer that type', code: 'not_offered', ...(o.why ? { why: o.why } : {}) });
    try { await accounts.setOatShapeByPerson(req.params.id, shape); }
    // a LOCKED vault answers as the vault does (MUST 2): 423, its code by name and its door — nothing was recorded
    catch (e) { return res.status(e.code === 'vault_locked' ? 423 : e.code === 'unknown' ? 404 : e.code === 'from_login' ? 409 : 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}), ...(e.door ? { door: e.door } : {}) }); }
    let f = null;
    try { f = await accounts.oatFileSettled(req.params.id); } catch { }
    const row = shapeRowOf(req.params.id);
    res.json({ success: true, shape: (row && row.oatShape) || null, ...(f ? { oatFile: f.verdict } : {}) });
  });
}

module.exports = { registerOatShapeRoutes };

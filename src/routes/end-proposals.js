'use strict';
/**
 * THE PROPOSAL CARD'S DOOR (lane login-request-card, majordomo piece 3b): the person's press on an agent's proposal to end
 * conversations — the person's own Terminate over the rows the person selected. Only the owner's own page (write-origin
 * src/routes/vault.js personVerdict — THE person verdict: no bearer, this page; no press is minted: nothing here starts a turn): a bearer (an agent, a job, an automation key) or a request with no mark of the page is refused
 * by name, nothing ended. Each selected row is judged again at the press (src/server/end-proposals.js answer).
 *   POST /api/end-proposals/:id/answer   { drawn: <the card's signature as drawn>, terminate: [key…], wakeTicks?: [{id, grant}…] }   (an empty list = «Keep all»; the ticks of the
 *                                        rows' jobs are stored through piece 7's person door BEFORE any end) → { ok, terminated, kept, changed, ended, open }
 *                                        the wake card (its second kind): { grant: [jobId…] } («Allow the ticked ones»; NO grant = «Keep all as
 *                                        they are» — nothing written) → { ok, granted, withdrawn, unchanged }
 */
const { personVerdict } = require('./vault.js');   // THE person verdict (a decision row's door asks it — one verdict, never a local copy)

function registerEndProposalRoutes(app, { proposals }) {
  app.post('/api/end-proposals/:id/answer', async (req, res) => {
    // THE PERSON on this instance's own page (any bearer ⇒ human_only, not this page ⇒ cross_site); no press is minted: nothing at
    // this door starts a turn (the answer is a stash entry for the proposer's next turn)
    const who = personVerdict(req);
    if (!who.ok) return res.status(403).json({ ok: false, code: 'person_only', why: `a proposal card is answered only by the person on the person's own page; ${who.code === 'human_only' ? 'a request carrying a bearer token' : 'a request with no mark of this page'} is refused` });
    const b = req.body || {};
    const terminate = Array.isArray(b.terminate) ? b.terminate.map(String).slice(0, 64) : [];
    const by = { kind: 'human', actBy: require('../device-audit.js').byOfReq(req) };
    try {
      const grant = Array.isArray(b.grant) ? b.grant.map(String).slice(0, 64) : null;   // the wake card's ticks (its second kind); none sent = keep all
      const wakeTicks = Array.isArray(b.wakeTicks) ? b.wakeTicks.slice(0, 64).map((x) => ({ id: String((x && x.id) || ''), grant: !!(x && x.grant === true) })).filter((x) => x.id) : null;
      const drawn = typeof b.drawn === 'string' ? b.drawn.slice(0, 32) : null;   // THE drawing the press answers (the cure's law 4): the store acts only when it is the card it holds
      const r = await proposals.answer(String(req.params.id || ''), { drawn, terminate, grant, wakeTicks }, by);
      res.status(r.ok ? 200 : r.code === 'not_found' ? 404 : 409).json(r);
    } catch (e) { res.status(500).json({ ok: false, code: 'answer-failed', why: e.message }); }
  });
}
module.exports = { registerEndProposalRoutes };

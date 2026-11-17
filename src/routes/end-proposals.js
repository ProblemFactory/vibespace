'use strict';
/**
 * THE PROPOSAL CARD'S DOOR (lane login-request-card, majordomo piece 3b): the person's press on an agent's proposal to end
 * conversations — the person's own Terminate over the rows the person selected. Only the owner's own page (write-origin
 * pageVerdict — no bearer + the strict page verdict, piece 7's person rule; no press is minted: nothing here starts a turn): a bearer (an agent, a job, an automation key) or a request with no mark of the page is refused
 * by name, nothing ended. Each selected row is judged again at the press (src/server/end-proposals.js answer).
 *   POST /api/end-proposals/:id/answer   { terminate: [key…], wakeTicks?: [{id, grant}…] }   (an empty list = «Keep all»; the ticks of the
 *                                        rows' jobs are stored through piece 7's person door BEFORE any end) → { ok, terminated, kept, changed, ended, open }
 *                                        the wake card (its second kind): { grant: [jobId…] } («Allow the ticked ones»; NO grant = «Keep all as
 *                                        they are» — nothing written) → { ok, granted, withdrawn, unchanged }
 */
function registerEndProposalRoutes(app, { proposals }) {
  const WO = () => require('../write-origin.js');
  app.post('/api/end-proposals/:id/answer', async (req, res) => {
    // THE PERSON on this instance's own page (no bearer + the strict page verdict — piece 7's personHere rule); no press is minted:
    // nothing at this door starts a turn (the answer is a stash entry for the proposer's next turn)
    const h = req.headers || {};
    const bearer = WO().pressBearer(h) || typeof (req.body && req.body.token) === 'string';
    const onPage = !bearer && WO().pageVerdict(h, WO().ownOriginOf(h, { encrypted: !!(req.socket && req.socket.encrypted) })).ok === true;
    if (!onPage) return res.status(403).json({ ok: false, code: 'person_only', why: `a proposal card is answered only by the person on the person's own page; ${bearer ? 'a request carrying a bearer token' : 'a request with no mark of this page'} is refused` });
    const b = req.body || {};
    const terminate = Array.isArray(b.terminate) ? b.terminate.map(String).slice(0, 64) : [];
    const by = { kind: 'human', actBy: require('../device-audit.js').byOfReq(req) };
    try {
      const grant = Array.isArray(b.grant) ? b.grant.map(String).slice(0, 64) : null;   // the wake card's ticks (its second kind); none sent = keep all
      const wakeTicks = Array.isArray(b.wakeTicks) ? b.wakeTicks.slice(0, 64).map((x) => ({ id: String((x && x.id) || ''), grant: !!(x && x.grant === true) })).filter((x) => x.id) : null;
      const r = await proposals.answer(String(req.params.id || ''), { terminate, grant, wakeTicks }, by);
      res.status(r.ok ? 200 : r.code === 'not_found' ? 404 : 409).json(r);
    } catch (e) { res.status(500).json({ ok: false, code: 'answer-failed', why: e.message }); }
  });
}
module.exports = { registerEndProposalRoutes };

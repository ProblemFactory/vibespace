'use strict';
// B-46fc part 2 — THE ONE «apply a layout save» (a page reloaded while its socket to the hub is not open lost its last layout change:
// the save rode the socket only). ws-handler hands its applyLayoutSync here at its registration; the socket's `layout-sync` case and
// POST /api/layout-sync (src/routes/persistence.js — the frames a page that LEAVES with its socket closed takes out of its queue,
// sent by a request that outlives the page) call the SAME function, so every rule of a save holds for both: the staleness gate
// (§6b guard 11 — a late save from a page that left never overwrites a newer record another writer stored), the shrink belt, the chain
// agreement, the layer gate, the storm limiter, the held store. The route's client is a stand-in: what the hub would have told the
// page's socket comes back in the HTTP answer; its writer is the page's own socket's when the frame names the page's writer token.
const MAX_BYTES = 256 * 1024;   // a frame's body, refused by name past it (413)
let _apply = null;
function set(fn) { _apply = typeof fn === 'function' ? fn : null; }
/** a request body's size → null (ok) or the refusal's words */
function sizeVerdict(bytes) { const n = Number(bytes); return n > MAX_BYTES ? (Number.isFinite(n) ? `a layout save of ${Math.round(n / 1024)} KB is over the ${MAX_BYTES / 1024} KB a page may hand off` : `a layout save is over the ${MAX_BYTES / 1024} KB a page may hand off`) : null; }
/** ONE frame through the one door → {status, answers}: the answers are the frames the hub would have sent the page's socket. */
function apply(data) {
  if (!_apply) return { status: 503, answers: [], error: 'the layout door is not ready' };
  if (!data || typeof data !== 'object' || data.type !== 'layout-sync') return { status: 400, answers: [], error: 'a layout-sync frame is asked' };
  const answers = [];
  const client = { readyState: 1, _layoutRoute: true, send: (m) => { try { answers.push(JSON.parse(m)); } catch { answers.push({ type: 'unreadable' }); } } };
  _apply(client, data);
  return { status: 200, answers };
}
module.exports = { set, apply, sizeVerdict, MAX_BYTES };

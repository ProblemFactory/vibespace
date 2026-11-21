// THE HAND-OFF OF A CLOSED SOCKET'S LAYOUT SAVES (B-46fc part 2) — CJS, imports nothing, so the page bundles it and the fast suite drives
// it with a stand-in queue and a stand-in post. At the leave (pagehide / hidden), the layout-sync frames a socket that is NOT open queued
// go to POST /api/layout-sync by a request that outlives the page. ITS ROUND (wgk4tnn0w, the MUST): a frame leaves the queue FOR GOOD only
// when the hub has TAKEN it — while the page lives, a hand-off that failed (no answer, a refused request) is OWED again: back in the queue
// (unless a newer frame of its desktop is already there), or straight onto the socket if it has opened meanwhile; and the hub's answers
// (the ack, a refusal, the held store) are HEARD by the page exactly as its socket's would be (the same handlers). A page that really
// unloads loses nothing more than at the release.
const BUDGET = 60 * 1024;      // the keepalive quota a page may use, counted with the frames still in flight
const DESK_OPS = new Set(['desktop-create', 'desktop-delete', 'desktop-rename', 'desktop-reorder']);
const frameOf = (text) => { try { return JSON.parse(text); } catch { return null; } };
const deskOf = (f) => (f && f.desktopId) || '';
const bytesOf = (text) => { const s = String(text); let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3; } return n; };
/** PURE: the queue → what may leave now: the NEWEST layout-sync frame of each desktop — never one a desktop change is queued AHEAD of (it
 *  would land before its desktop is made; it waits for the socket, in order), never one already in flight, within `budget` bytes.
 *  → {send: [text], keep: [text] (the queue the socket keeps: the older frames of a desktop whose newest leaves are superseded), waits: [{text, why}]} */
function handOffPlan(pending, { inFlight = new Set(), budget = BUDGET } = {}) {
  const list = Array.isArray(pending) ? pending : [];
  const newest = new Map();
  let deskOpAt = -1;
  list.forEach((text, i) => { const f = frameOf(text); if (!f) return; if (DESK_OPS.has(f.type)) { if (deskOpAt < 0) deskOpAt = i; return; } if (f.type === 'layout-sync') newest.set(deskOf(f), { text, i }); });
  const send = [], waits = [];
  let left = budget;
  for (const { text, i } of newest.values()) {
    if (inFlight.has(text)) continue;
    if (deskOpAt >= 0 && deskOpAt < i) { waits.push({ text, why: 'a desktop change is queued ahead of it' }); continue; }
    const n = bytesOf(text);
    if (n > left) { waits.push({ text, why: `${Math.round(n / 1024)} KB, over the hand-off budget` }); continue; }
    left -= n; send.push(text);
  }
  const leaving = new Set(send), sentDesks = new Set(send.map((t) => deskOf(frameOf(t))));
  const keep = list.filter((t) => { if (leaving.has(t)) return false; const f = frameOf(t); return !(f && f.type === 'layout-sync' && sentDesks.has(deskOf(f))); });
  return { send, keep, waits };
}
/** PURE: a hand-off that FAILED goes back to the queue's head — unless a NEWER frame of its desktop is already queued (it carries the act). */
function requeue(pending, text) {
  const list = Array.isArray(pending) ? pending : [], d = deskOf(frameOf(text));
  if (list.some((t) => { const g = frameOf(t); return g && g.type === 'layout-sync' && deskOf(g) === d; })) return list;
  return [text, ...list];
}
/** THE HAND-OFF. `sock` = the page's socket client {pending: [text], ws: {readyState, send}, heard(frame)}; `post(text)` → a Promise of
 *  {ok, status, json()}; `inFlight` = a Set kept by the caller across calls (pagehide and hidden both fire: a frame goes ONCE). → the
 *  promises of the frames sent (each settles: heard, or owed again). */
function handOff(sock, { post, inFlight = new Set(), warn = () => { }, budget = BUDGET } = {}) {
  if (!sock || !Array.isArray(sock.pending) || !sock.pending.length || (sock.ws && sock.ws.readyState === 1) || typeof post !== 'function') return [];
  let flying = 0; for (const t of inFlight) flying += bytesOf(t);
  const plan = handOffPlan(sock.pending, { inFlight, budget: budget - flying });
  for (const w of plan.waits) warn(`a layout save waits for the socket (${w.why})`);
  if (!plan.send.length) return [];
  sock.pending = plan.keep;
  return plan.send.map((text) => {
    inFlight.add(text);
    return Promise.resolve().then(() => post(text)).then(async (res) => {
      if (!res || !res.ok) throw new Error(`the hub answered ${res ? res.status : 'nothing'}`);
      const body = await res.json();
      for (const d of (body && Array.isArray(body.answers) ? body.answers : [])) { try { sock.heard(d); } catch { } }
      return true;
    }).catch((e) => {
      if (sock.ws && sock.ws.readyState === 1) { try { sock.ws.send(text); } catch { sock.pending = requeue(sock.pending, text); } }
      else sock.pending = requeue(sock.pending, text);
      warn(`a layout save handed off at the leave did not reach the hub (${(e && e.message) || e}) — it is owed again: it goes with the socket`);
      return false;
    }).finally(() => inFlight.delete(text));
  });
}
module.exports = { handOffPlan, requeue, handOff, bytesOf, BUDGET, DESK_OPS };

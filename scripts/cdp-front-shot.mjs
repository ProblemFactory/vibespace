// A PICTURE IS OF THE PAGE IN FRONT (主开发 r1109 / r1125, lane bl-tests-chrome, 2026-11-21). Headless Chrome paints only the tab in
// front of its window: a Page.captureScreenshot of a tab BEHIND another waits for a frame that tab may never make (2.369.414's
// mirror: test-oat-mint-ui's code.png timed out at 30 s on a background tab). A suite that holds more than one page keeps ONE
// front state and takes every picture through frontShot: the picture's page is brought to the front first (only when it is not
// already there), the capture is bounded, ONE retry is said by name, and the front is handed back to the page that had it, so
// every other leg runs with the page in front it had. test-ci-gate §2o names every script that captures without it.
//   frontState() → { front: null | { key, bring } }        the page in front (null: not known — the next picture brings its own)
//   becameFront(st, key, bring)                             a page came to the front (a new tab the suite opened, or its own bring)
//   pageClosed(st, key)                                     a tab the suite CLOSED: the front is not known (Chrome hands it to a NEIGHBOUR tab)
//   bringTab(cdpPort, targetId) → bring                     a tab brought through the browser's own door (/json/activate): no page socket
//   frontShot(st, key, bring, capture, { name, ms, say })   → capture()'s answer; key = the picture's page, bring() fronts it
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bounded = (p, ms, what) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`${what}: no answer in ${ms} ms`)), ms);   // kept REF'D: the bound must fire even when nothing else holds the loop (cleared once the call settles)
  Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});

export const frontState = () => ({ front: null });
export function becameFront(st, key, bring) { if (st) st.front = { key, bring }; }
// (r1354, lane bl-tests-e) closing the front tab hands its window's front to a NEIGHBOUR tab, not to the page behind it: the front
// is then not known, so the next picture brings its own page and hands nothing back to a page that is gone
export function pageClosed(st, key) { if (st && st.front && st.front.key === key) st.front = null; }
// (r1354) a bring through the BROWSER's own door, /json/activate/<id>: it needs no page socket, so a page whose socket the suite
// closed (a close() that drops only the socket: the tab stays, and can be the page in front) can still be brought, or handed the
// front back — a send on a closed socket answers nothing and would wait out the bound. A tab that is gone is refused by name.
export const bringTab = (cdpPort, targetId, { fetchFn = fetch } = {}) => () => fetchFn(`http://127.0.0.1:${cdpPort}/json/activate/${targetId}`)
  .then((r) => { if (!r.ok) throw new Error(`the tab ${targetId} could not be brought to the front (/json/activate answered ${r.status})`); return true; });

export async function frontShot(st, key, bring, capture, { name = 'a picture', ms = 10000, settleMs = 150, say = (m) => console.log(m), sleep = realSleep } = {}) {
  const was = st && st.front;
  let shot;
  for (let i = 0; i < 2; i++) {
    if (!st || !st.front || st.front.key !== key) { await bounded(bring(), ms, `${name}: bringing its page to the front`); becameFront(st, key, bring); await sleep(settleMs); }
    try {
      shot = await bounded(capture(), ms, name);
      if (i) say(`    (${name} came on its one retry, its page brought to the front again)`);
      break;
    } catch (e) {
      if (i) throw new Error(`${name} did not come twice, its page brought to the front each time — ${e && e.message}`);
      say(`    (${name}: ${e && e.message} — once more, its page brought to the front again)`);
      if (st) st.front = null;
    }
  }
  if (was && was.key !== key) {
    try { await bounded(was.bring(), ms, `${name}: handing the front back`); becameFront(st, was.key, was.bring); await sleep(settleMs); } catch (e) { say(`    (${name}: the front could not be handed back — ${e && e.message})`); if (st) st.front = null; }
  }
  return shot;
}

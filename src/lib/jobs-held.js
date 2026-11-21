'use strict';
// THE HELD DIGEST, KEPT ONCE A PAGE (B-360d unit 3, lane bl-keys-misc — the hub profile's rank 9: every chat view seeded its
// held-notifications chip with a GET /api/jobs, a snapshot of EVERY job on the hub's loop, 17 of them at one page load).
// Every 'jobs-updated' broadcast carries the digest (src/server/jobs-wiring.js `broadcast`); the app keeps the newest here and
// a view seeds from it. When none is kept yet — no broadcast since the page loaded, or since the socket came back — ONE
// GET /api/jobs/held (the digest alone) answers every view that asks meanwhile. Never the whole jobs list for a chip.
// PURE: no DOM, no socket; `fetchJson` is handed in (src/lib/utils.js's — it never throws).
/** → { note(msg), drop(), seed() → Promise<digest|null>, kept } */
function createHeldKeeper({ fetchJson }) {
  let kept = null, gen = 0, asking = null;
  return {
    /** a socket frame: a 'jobs-updated' one carries the newest digest */
    note(msg) { if (msg && msg.type === 'jobs-updated' && msg.held) { kept = msg.held; gen++; } },
    /** the socket went away: a frame may be missed meanwhile — the next seed asks again */
    drop() { kept = null; gen++; },
    /** the kept digest, else ONE ask in flight shared by every caller; a frame that arrives while it is out is newer and wins */
    seed() {
      if (kept) return Promise.resolve(kept);
      if (asking) return asking;
      const at = gen;
      const p = Promise.resolve().then(() => fetchJson('/api/jobs/held')).then((r) => {
        const got = r && r.held ? r.held : null;
        if (gen === at && got) kept = got;
        return kept || got;
      }, () => kept);
      asking = p.finally(() => { asking = null; });   // one ask at a time: its end frees the next
      return asking;
    },
    get kept() { return kept; },
  };
}
module.exports = { createHeldKeeper };

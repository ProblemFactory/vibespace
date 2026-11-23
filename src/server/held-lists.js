'use strict';
// THE FAMILY's ONE NOTICE — its hub half (B-f276 family unit B, 主开发 r3032, lane bl-phone-ui). A store whose file could not be read is
// HELD (src/store-read-hold.js, and the older holds bridged below): nothing is written over it, changes are refused, it is read again by
// itself. Each lane says it in its own corner; this module says it ONCE for the whole family: the list of every held list (what the
// page names it by — a store's file base name or an older hold's key; never a path, never a value), since when, the next try; ONE
// broadcast `held-lists` when the set changes; and ONE press «Read again now» — a person's (the route refuses an agent's token), paced:
// one press in flight, at most one press in PRESS_GAP_MS, every held list read again once.
const HOLD = require('../store-read-hold.js');

const PRESS_GAP_MS = 10000;

/** older: [{ key, facts() → { since, next } | null, readAgain?() → Promise<boolean>, onLift?(fn) }] — the holds made before the helper */
function create({ hold = HOLD, broadcast = () => { }, older = [], now = Date.now, log = () => { } } = {}) {   // hold: the helper (a leg's copy)
  let pressAt = 0, pressing = null, said = null;
  const factsOf = (o) => { try { return o.facts() || null; } catch { return null; } };
  function list() {
    const out = [];
    for (const h of hold.holds()) if (h && h.held) out.push({ key: 'store:' + h.file, what: h.file, since: h.since || null, next: h.next || null, readAgain: true });
    for (const o of older) { const f = factsOf(o); if (f) out.push({ key: String(o.key), what: String(o.key), since: f.since || null, next: f.next || null, readAgain: typeof o.readAgain === 'function' }); }
    return out;
  }
  /** the set's change → ONE broadcast (a change of what is held or since when; a next try's move alone is no change) */
  function say() {
    const lists = list(), digest = JSON.stringify(lists.map((r) => [r.key, r.since]));
    if (digest === said) return;
    said = digest;
    try { broadcast({ type: 'held-lists', lists }); } catch (e) { log(`[held-lists] the broadcast failed: ${(e && e.message) || e}`); }
  }
  const off = hold.onHoldsChange(say);
  for (const o of older) if (typeof o.onLift === 'function') { try { o.onLift(say); } catch (e) { log(`[held-lists] ${o.key}: its lift is not heard (${(e && e.message) || e})`); } }
  /** «Read again now» — every held list read again once (a person's press) → { ok, lists } | a refusal by name */
  async function readAgain() {
    if (pressing) return { ok: false, code: 'held_read_running', error: 'the lists are being read again right now', lists: list() };
    const at = now();
    if (pressAt && at - pressAt < PRESS_GAP_MS) return { ok: false, code: 'held_read_too_soon', retryAfterMs: PRESS_GAP_MS - (at - pressAt), error: 'the lists were read again a moment ago', lists: list() };
    pressAt = at;
    pressing = (async () => {
      for (const h of hold.holds()) if (h && h.held) { try { await hold.readAgainOf(h.file); } catch (e) { log(`[held-lists] ${h.file}: a read again failed (${(e && e.message) || e})`); } }
      for (const o of older) if (typeof o.readAgain === 'function' && factsOf(o)) { try { await o.readAgain(); } catch (e) { log(`[held-lists] ${o.key}: a read again failed (${(e && e.message) || e})`); } }
    })();
    try { await pressing; } finally { pressing = null; }
    say();
    const lists = list();
    return { ok: true, lists, read: lists.length === 0 };
  }
  return { list, say, readAgain, stop: () => off(), PRESS_GAP_MS };
}

module.exports = { create, PRESS_GAP_MS };

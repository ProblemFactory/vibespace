'use strict';
// THE FAMILY's ONE NOTICE — its hub half (B-f276 family unit B, 主开发 r3032, lane bl-phone-ui). A store whose file could not be read is
// HELD (src/store-read-hold.js, and the older holds bridged below): nothing is written over it, changes are refused, it is read again by
// itself. Each lane says it in its own corner; this module says it ONCE for the whole family: the list of every held list (what the
// page names it by — a store's file base name or an older hold's key; never a path, never a value), since when, the next try; ONE
// broadcast `held-lists` when the set changes; and ONE press «Read again now» — a person's (the route refuses an agent's token), paced:
// one press in flight, at most one press in PRESS_GAP_MS, every held list read again once.
const HOLD = require('../store-read-hold.js');

const PRESS_GAP_MS = 10000;
const PRESS_BOUND_MS = 15000;   // r3212: a press answers within this — a read that never answers (a hung mount) never holds the press, nor every later one

/** older: [{ key, facts() → { since, next } | null, readAgain?() → Promise<boolean>, onLift(fn, again) → true once armed }] — the holds made before
 *  the helper; EVERY bridged row hands a lift signal (r3212: a row without one would keep the chip after its store lifts by itself). `again()`
 *  is the row's to call when its store LET GO of the wait (r3284: the paired machines' waits are bounded): the row is armed again at once. */
function create({ hold = HOLD, broadcast = () => { }, older = [], now = Date.now, log = () => { }, boundMs = PRESS_BOUND_MS } = {}) {   // hold: the helper (a leg's copy)
  let pressAt = 0, pressing = null, said = null, seq = 0;
  // r3284: THE MARK of every list this answers — its start (epoch) and its broadcasts so far (seq): the page drops an answer made before
  // the last broadcast it took (a read sent at a reconnect and answered after a newer broadcast would put the older list back)
  const epoch = `${now()}-${Math.random().toString(36).slice(2, 8)}`;
  const mark = () => ({ epoch, seq });
  const factsOf = (o) => { try { return o.facts() || null; } catch { return null; } };
  function list() {
    arm();
    const out = [];
    for (const h of hold.holds()) if (h && h.held) out.push({ key: 'store:' + (h.key || h.file), what: h.file, since: h.since || null, next: h.next || null, readAgain: true });
    for (const o of older) { const f = factsOf(o); if (f) out.push({ key: String(o.key), what: String(o.key), since: f.since || null, next: f.next || null, readAgain: typeof o.readAgain === 'function' }); }
    return out;
  }
  /** the set's change → ONE broadcast (a change of what is held or since when; a next try's move alone is no change) */
  function say() {
    const lists = list(), digest = JSON.stringify(lists.map((r) => [r.key, r.since]));
    if (digest === said) return;
    said = digest; seq++;
    try { broadcast({ type: 'held-lists', lists, ...mark() }); } catch (e) { log(`[held-lists] the broadcast failed: ${(e && e.message) || e}`); }
  }
  const off = hold.onHoldsChange(say);
  // r3212: a bridged store's lift signal is armed LAZILY — its object may not exist yet when this is made (the Task Groups' manager comes
  // later at the hub's start): asked again at every list until it answers that it is armed
  const armed = new Set();
  const arm = () => { for (const o of older) if (!armed.has(o) && typeof o.onLift === 'function') { armed.add(o); let ok = false; try { ok = !!o.onLift(say, () => again(o)); } catch (e) { log(`[held-lists] ${o.key}: its lift is not heard yet (${(e && e.message) || e})`); } if (!ok) armed.delete(o); } };   // marked first: a signal that answers at once (not held) re-enters say → list → arm
  // r3284: a row whose store let go of its wait is armed again AT ONCE — its lift is never left untold (it waits again, the newest)
  const again = (o) => { armed.delete(o); arm(); };
  arm();
  /** «Read again now» — every held list read again once (a person's press) → { ok, lists } | a refusal by name. r3314: each helper hold
   *  is read again BY ITS ROW (the helper matches a row's own key; a base name two held stores share — each channel account's people
   *  file — matches neither), by its base name only where the helper's rows carry no key */
  async function readAgain() {
    if (pressing) return { ok: false, code: 'held_read_running', error: 'the lists are being read again right now', lists: list(), ...mark() };
    const at = now();
    if (pressAt && at - pressAt < PRESS_GAP_MS) return { ok: false, code: 'held_read_too_soon', retryAfterMs: PRESS_GAP_MS - (at - pressAt), error: 'the lists were read again a moment ago', lists: list(), ...mark() };
    pressAt = at;
    const pass = (async () => {
      for (const h of hold.holds()) if (h && h.held) { try { await hold.readAgainOf(h.key ? h : h.file); } catch (e) { log(`[held-lists] ${h.file}: a read again failed (${(e && e.message) || e})`); } }
      for (const o of older) if (typeof o.readAgain === 'function' && factsOf(o)) { try { await o.readAgain(); } catch (e) { log(`[held-lists] ${o.key}: a read again failed (${(e && e.message) || e})`); } }
    })();
    pressing = pass;
    let timedOut = false, timer = null;
    const bound = new Promise((r) => { timer = setTimeout(() => { timedOut = true; r(); }, boundMs); });   // held while a press is out (cleared at its answer)
    try { await Promise.race([pass.catch(() => { }), bound]); } finally { clearTimeout(timer); pressing = null; }   // a read still out stays the helper's (one in flight a store)
    say();
    const lists = list();
    return { ok: true, lists, read: lists.length === 0, ...(timedOut ? { timedOut: true } : {}), ...mark() };
  }
  return { list, mark, say, readAgain, stop: () => off(), PRESS_GAP_MS };
}

module.exports = { create, PRESS_GAP_MS, PRESS_BOUND_MS };

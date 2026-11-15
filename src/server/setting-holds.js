'use strict';
/**
 * ORCH — THE HOLDS of a one-press setting change (lane setting-doors pick 2, 主开发's GO 2026-11-15 14:03Z, amendments 3, 4, 6).
 * The owner pressed «Raise to 800 until 22:00» on an agent's ask (src/ask-setting.js built it from the schema): THIS store makes the
 * press ONE server act and owns the return.
 *   3. ONE ACT, THE HOLD FIRST: the hold is ON DISK (the store writer's `durable` — an answered act is on disk) BEFORE the value
 *      changes; a hold that cannot be made durable refuses the press (nothing changed, said on the card); a settings write that
 *      fails after it takes the hold back. Both happen or neither — never a raise with nothing that returns it.
 *   4. ONE HOLD PER ROW: a second press while a hold stands replaces its value and its moment and KEEPS the first «before»; «End
 *      now» and the return go back to it. A LASTING change pressed while a hold stands ends the hold (the row keeps the new value).
 *   6. THE RETURN IS QUIET: at its moment (re-armed at boot; a moment passed while the hub was down returns at once) the value
 *      goes back to «before» — ONLY if the row still holds the hold's value (a value the owner changed by hand in between is never
 *      overwritten: the hold just ends) — through the ONE settings writer (`patchSettings`, a server act: the every-writer census's
 *      row), with a toast on the open pages and a journal line. A For-you notice ONLY when the return could NOT be written or the
 *      holds could not be read at boot — a failed act reaches the owner, the row named with its link.
 */
const fs = require('fs');
const path = require('path');
const AS = require('../ask-setting.js');

const STORE_NAME = 'setting-holds.write';
// a return the settings file refused is tried again a minute later, RETRIES more times, before it is left to the next start
// (主开发's reading after the line, 2026-11-15: a failed return is not left to the boot at once; the owner's notice is filed ONCE)
const RETRY_MS = 60 * 1000, RETRIES = 3;
const NUM = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function create({ dataDir, readSettings, patchSettings, broadcast = () => { }, userTodos = null, log = () => { }, now = () => Date.now(), writer = null, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const file = path.join(dataDir, 'setting-holds.json');
  const W = () => writer || require('../store-writer.js').storeWriter();
  let holds = {};   // key → { key, value, before (the stored value; null = the row's default), untilAt, at }
  const timers = new Map();
  const tries = new Map();   // key → the failed returns of its hold so far (a minute apart; reset by a new press or a return)
  /** A FAILED ACT REACHES THE OWNER (amendment 6): ONE For-you notice in the Spending family (origin spend — test-user-todos-layout's
   *  producer census), the row named with its link. The only item this store files. */
  const notifyOwner = ({ text, detail }) => { try { if (userTodos) userTodos.add('accounts', { origin: 'spend', text: String(text).slice(0, 300), detail, urgency: 'high', by: 'agent', sessionName: 'Spending', kind: 'notice' }); } catch (e) { log(`[setting-holds] the owner's notice could not be filed: ${e && e.message}`); } };
  const produce = () => JSON.stringify({ v: 1, holds });
  /** the holds on disk — the store writer's own act; false = not durable (the caller refuses the press) */
  async function save() { try { W().dirty(file, { name: 'setting-holds.write', produce, allowEmpty: true }); return (await W().durable(file)) !== false; } catch { return false; } }
  const stored = (key) => { const s = readSettings() || {}; return Object.prototype.hasOwnProperty.call(s, key) ? s[key] : null; };
  const presentOf = (key) => { const v = stored(key); return NUM(v) != null ? v : AS.PROPOSABLE[key] ? AS.PROPOSABLE[key].def : null; };
  const disarm = (key) => { const t = timers.get(key); if (t) clearTimer(t); timers.delete(key); };
  function arm(key) {
    disarm(key); const h = holds[key]; if (!h) return;
    const wait = Math.max(0, h.untilAt - now());
    timers.set(key, setTimer(() => { timers.delete(key); returnHold(key, 'moment').catch((e) => log(`[setting-holds] return ${key} failed: ${e && e.message}`)); }, Math.min(wait, 2 ** 31 - 1)));
  }
  const list = () => Object.values(holds).map((h) => ({ ...h }));
  const tell = () => { try { broadcast({ type: 'setting-holds', holds: list() }); } catch { /* no clients */ } };

  /** THE RETURN (the moment, or «End now»): back to «before» only when the row still holds the hold's value. */
  async function returnHold(key, why) {
    const h = holds[key]; if (!h) return { ok: true, none: true };
    const cur = presentOf(key), byHand = cur !== h.value;
    if (!byHand) {
      try { patchSettings({ [key]: h.before }); }   // null = the row's default (a sparse store drops it)
      catch (e) {
        const msg = e && e.message;
        // «End now» is the owner's own press: its page says the refusal (the route answers it); the hold and its moment stand
        if (why === 'end') { log(`[setting-holds] End now ${key} → ${h.before} FAILED: ${msg}`); return { ok: false, code: 'return-failed', error: `the settings file could not be written (${msg}) — the hold still stands` }; }
        const n = (tries.get(key) || 0) + 1; tries.set(key, n);
        if (n <= RETRIES) {   // tried again in a minute, quietly (a return that then lands is the usual quiet return)
          disarm(key); timers.set(key, setTimer(() => { timers.delete(key); returnHold(key, why).catch((x) => log(`[setting-holds] return ${key} failed: ${x && x.message}`)); }, RETRY_MS));
          log(`[setting-holds] return ${key} → ${h.before} FAILED (${msg}) — try ${n + 1} of ${RETRIES + 1} in a minute`); return { ok: false, code: 'return-failed', retry: n };
        }
        tries.delete(key);   // left to the next start (the hold stays on disk); the owner is told ONCE
        notifyOwner({ key, text: `A held setting could not go back: ${key} stays at ${h.value}`, detail: `The hold you took said it would return to ${h.before == null ? 'its default' : h.before} at ${new Date(h.untilAt).toISOString()}; the settings file could not be written (${msg}) — tried ${RETRIES + 1} times, a minute apart. The next start of VibeSpace tries again. Change it on the row: ${AS.LINK(key)}` });
        log(`[setting-holds] return ${key} → ${h.before} FAILED ${RETRIES + 1} times: ${msg} — left to the next start`); return { ok: false, code: 'return-failed', left: 'start' };
      }
    }
    delete holds[key]; disarm(key); tries.delete(key);
    if (!(await save())) log(`[setting-holds] ${key}: the hold's end is not on disk yet — the next boot sees the row ${byHand ? 'changed by hand' : 'already returned'} and ends it`);
    log(`[setting-holds] ${key}: ${byHand ? `changed by hand (${cur}) — the hold ended without a return` : `back to ${h.before == null ? 'the default' : h.before}`} (${why})`);
    if (!byHand) {
      const back = h.before == null ? (AS.PROPOSABLE[key] ? AS.PROPOSABLE[key].def : null) : h.before;
      const i18n = { key: 'A held setting is back to {value} — the hold ended: {link}', params: { value: String(back), link: AS.LINK(key) } };
      try { broadcast({ type: 'server-notice', key: `setting-hold-return:${key}:${now()}`, level: 1, text: `A held setting is back to ${back} — the hold ended: ${AS.LINK(key)}`, i18n }); } catch { /* no clients */ }
    }
    tell();
    return { ok: true, returned: !byHand, value: byHand ? cur : h.before };
  }

  /**
   * THE TAKE — the owner's press, ONE act (named `take`: no server code calls a method named press — that word is the models
   *  door's mint, test-agy-models-door). `shown` = the value the card drew as NOW (a value that moved since is answered 409 moved, with
   *  the present one: the card says it and its words follow). */
  async function take({ key, value, untilRel = null, untilAt = null, shown }) {
    if (!AS.isProposable(key)) return { ok: false, status: 400, code: 'not-proposable', error: `${key} is not a row a press may change; ${AS.LINK(key)}` };
    const present = presentOf(key);
    if (NUM(Number(shown)) == null || Number(shown) !== present) return { ok: false, status: 409, code: 'moved', present, error: `it is ${present} now` };
    const v = AS.pressVerdict({ type: AS.TYPE, key, value, untilRel, untilAt }, { present, now: now() });
    if (!v.press) return { ok: false, status: 409, code: v.why, present, error: v.why === 'raise-needs-until' ? 'a raise is always time-boxed — this one names no «until»' : v.why === 'passed' ? 'the moment has passed' : v.why };
    const prior = holds[key] ? { ...holds[key] } : null;
    tries.delete(key);   // a new press: the old hold's failed returns are no longer counted
    if (v.untilAt != null) {
      holds[key] = { key, value: v.value, before: prior ? prior.before : stored(key), untilAt: v.untilAt, at: now() };   // 4: the FIRST «before» kept
      if (!(await save())) { if (prior) holds[key] = prior; else delete holds[key]; return { ok: false, status: 503, code: 'not-durable', error: 'the hold could not be written to disk, so the raise was not made — nothing changed' }; }
    } else if (prior) {   // a lasting change while a hold stands ends the hold
      delete holds[key];
      if (!(await save())) { holds[key] = prior; return { ok: false, status: 503, code: 'not-durable', error: 'the held row could not be released on disk — nothing changed' }; }
    }
    try { patchSettings({ [key]: v.value }); }
    catch (e) {   // the value could not be written: the hold is taken back (both or neither)
      if (prior) holds[key] = prior; else delete holds[key];
      await save();
      return { ok: false, status: 500, code: 'write-failed', error: `the setting could not be written (${e && e.message}) — nothing changed` };
    }
    if (holds[key]) arm(key); else disarm(key);
    log(`[setting-holds] ${key}: ${present} → ${v.value}${v.untilAt != null ? ` until ${new Date(v.untilAt).toISOString()} (then ${holds[key].before == null ? 'the default' : holds[key].before})` : ' (lasting)'}`);
    tell();
    return { ok: true, key, value: v.value, untilAt: v.untilAt, before: holds[key] ? holds[key].before : null, held: !!holds[key] };
  }

  /** the boot: the holds read back and re-armed; a moment already passed returns at once. Unreadable ⇒ the owner is told. */
  async function start() {
    let raw = null;
    try { raw = await fs.promises.readFile(file, 'utf8'); } catch (e) { if (e && e.code !== 'ENOENT') { notifyOwner({ key: null, text: 'The setting holds could not be read', detail: `data/setting-holds.json: ${e.message}. A raised ceiling may not return by itself — check the three ceilings: ${Object.keys(AS.PROPOSABLE).map(AS.LINK).join(' · ')}` }); log(`[setting-holds] unreadable: ${e.message}`); } return list(); }
    try { const j = JSON.parse(raw); holds = j && j.holds && typeof j.holds === 'object' ? j.holds : {}; }
    catch (e) { notifyOwner({ key: null, text: 'The setting holds could not be read', detail: `data/setting-holds.json is not whole (${e.message}). A raised ceiling may not return by itself — check the three ceilings: ${Object.keys(AS.PROPOSABLE).map(AS.LINK).join(' · ')}` }); holds = {}; return list(); }
    // a hold that cannot be kept (its row is no longer one a press may change, its moment is not a number, it is not whole) is
    // dropped — and SAID (主开发's reading after the line): a raised value it held may now stay; ONE notice names every such row
    const dropped = [];
    for (const k of Object.keys(holds)) {
      const h = holds[k], why = !h || typeof h !== 'object' ? 'it is not whole' : !AS.isProposable(k) ? 'it is no longer a row a press may change' : NUM(h.untilAt) == null ? 'its moment is not a number' : null;
      if (why) { dropped.push({ key: String(k).slice(0, 120), why, value: h && typeof h === 'object' ? h.value : undefined }); delete holds[k]; continue; }
      arm(k);
    }
    if (dropped.length) {
      notifyOwner({ key: null, text: `A held setting may not go back by itself: ${dropped.map((d) => d.key).join(', ')}`, detail: `At this start, data/setting-holds.json held ${dropped.length === 1 ? 'a hold that could not be kept' : `${dropped.length} holds that could not be kept`} — ${dropped.map((d) => `${d.key}${d.value !== undefined ? ` (held at ${d.value})` : ''}: ${d.why}`).join('; ')}. ${dropped.length === 1 ? 'It was' : 'They were'} dropped, so a raised value may stay where it is. Check it on the row: ${dropped.map((d) => AS.LINK(d.key)).join(' · ')}` });
      log(`[setting-holds] dropped at start: ${dropped.map((d) => `${d.key} (${d.why})`).join(', ')}`);
      await save();   // the store as kept — the next start does not say it again
    }
    return list();
  }
  const end = (key) => returnHold(key, 'end');
  const stop = () => { for (const k of [...timers.keys()]) disarm(k); };
  return { start, take, end, list, returnHold, stop, file };
}

module.exports = { create, STORE_NAME, RETRY_MS, RETRIES };

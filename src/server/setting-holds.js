'use strict';
/**
 * ORCH — THE HOLDS of a one-press setting change (lane setting-doors pick 2, 主开发's GO 2026-11-15 14:03Z, amendments 3, 4, 6; the
 * check's laws A, B, C, 2026-11-15 20:29Z). The owner pressed «Raise to 1600 for 6 h» on an agent's ask (src/ask-setting.js built it
 * from the schema): THIS store makes the press ONE server act and owns the return.
 *   B. A HOLD IS LIVE ONLY WHILE THE ROW HOLDS ITS VALUE (AS.holdIsLive). A row the owner changed by hand has no hold, for every
 *      reader at once: the hold ENDS WHERE THE HAND'S WRITE LANDS — the settings writer's change hook (server.js onSettingsWrite →
 *      noteSettingsWrite; the store's own writes are not a hand's) — on disk, in the journal, and to every page (`setting-holds`).
 *      The next press takes the row's value now as its «before»; no return ever writes over a hand's value; at a start a hold
 *      whose row moved while the hub was down ends the same way.
 *   A. WHILE A HOLD IS LIVE, THE ROW'S LASTING VALUE IS ITS «BEFORE» (AS.lastingOf): a lasting change above it is a raise and no
 *      press (raise-over-hold, the row's link); at or below it ends the hold and stays.
 *   3. ONE ACT, THE HOLD FIRST (a timed press): the hold is ON DISK (the store writer's `durable`) BEFORE the value changes; a hold
 *      that cannot be made durable refuses the press (nothing changed, said on the card); a settings write that fails after it
 *      takes the hold back. A SECOND timed press keeps the value it replaces as `pending` until its settings write lands — a crash
 *      between leaves the hold live on the old value (never a raise with nothing that returns it). A LASTING change writes the
 *      value FIRST and releases the hold after: a crash between leaves a hold the row no longer holds — ended, harmlessly.
 *   4. ONE HOLD PER ROW: a second timed press on a LIVE hold replaces its value and moment and KEEPS the first «before».
 *   6. THE RETURN IS QUIET: at its moment (re-armed at boot; passed while down ⇒ at once) or «End now»: back to «before» through
 *      the ONE settings writer (`patchSettings` — the every-writer census's row), a toast naming the row's label in the page's
 *      language, and a journal line. A refused return is tried again a minute later, RETRIES more times; only then ONE For-you
 *      notice, and the next start tries again. A For-you notice too when the holds cannot be read, or a hold cannot be kept at
 *      a start (its row off the list, its moment not a number) — each in three languages, the row named with its link.
 */
const fs = require('fs');
const path = require('path');
const AS = require('../ask-setting.js');

const STORE_NAME = 'setting-holds.write';
// a return the settings file refused is tried again a minute later, RETRIES more times, before it is left to the next start
// (主开发's reading after the line, 2026-11-15: a failed return is not left to the boot at once; the owner's notice is filed ONCE)
const RETRY_MS = 60 * 1000, RETRIES = 3;
const NUM = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** the row's label as an i18n WORDS param (said in the page's language before the sentence fills) — the raw key off the list */
const LABEL = (key) => (AS.PROPOSABLE[key] ? { key: AS.PROPOSABLE[key].label } : String(key).slice(0, 120));
const labelEn = (key) => (AS.PROPOSABLE[key] ? AS.PROPOSABLE[key].label : String(key).slice(0, 120));
// why a hold could not be kept at a start — each a fixed i18n key (scripts/i18n-check.mjs NOTICE_SRC reads this file)
const CANNOT_KEEP = {
  whole: { key: 'it is not whole' },
  list: { key: 'it is no longer a row a press may change' },
  moment: { key: 'its moment is not a number' },
};

function create({ dataDir, readSettings, patchSettings, broadcast = () => { }, userTodos = null, log = () => { }, now = () => Date.now(), writer = null, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const file = path.join(dataDir, 'setting-holds.json');
  const W = () => writer || require('../store-writer.js').storeWriter();
  let holds = {};   // key → { key, value, before (the stored value; null = the row's default), untilAt, at, pending? }
  const timers = new Map();
  const tries = new Map();   // key → the failed returns of its hold so far (a minute apart; reset by a new press or a return)
  let ownWrite = 0;   // the store's own settings write in flight — patchSettings is synchronous, the change hook fires inside it
  const write = (patch) => { ownWrite++; try { patchSettings(patch); } finally { ownWrite--; } };
  /** A FAILED ACT REACHES THE OWNER: a For-you notice in the Spending family (origin spend — the producer censuses), worded in the
   *  owner's language from its `i18n` lines, the row named by its label with its link. The only items this store files. */
  const notifyOwner = ({ text, detail, i18n }) => { try { if (userTodos) userTodos.add('accounts', { origin: 'spend', text: String(text).slice(0, 300), detail, urgency: 'high', by: 'agent', sessionName: 'Spending', kind: 'notice', ...(i18n ? { i18n } : {}) }); } catch (e) { log(`[setting-holds] the owner's notice could not be filed: ${e && e.message}`); } };
  const produce = () => JSON.stringify({ v: 1, holds });
  /** the holds on disk — the store writer's own act; false = not durable (the caller refuses the press) */
  async function save() { try { W().dirty(file, { name: 'setting-holds.write', produce, allowEmpty: true }); return (await W().durable(file)) !== false; } catch { return false; } }
  const saveLater = (what) => { save().then((ok) => { if (!ok) log(`[setting-holds] ${what} is not on disk yet — the next start reads the row and ends what it no longer holds`); }); };
  // B-0a33 cure (主开发 04:23Z): a ceiling the row holds with NO NUMBER (blank, a stored null, a text, a negative) is «no limit is set»
  // — refused, read 0 (as budgetLimits reads it), never the default; its «before» is BLANK, so a return writes it back as it was. null
  // stays «absent — the row's default» (a sparse store), the only value a return drops
  const noNumber = (v) => !(Number.isFinite(AS.NUM(v)) && AS.NUM(v) >= 0);
  const rawOf = (s, key) => (s && Object.prototype.hasOwnProperty.call(s, key) ? s[key] : undefined);   // cure 2: what liveness reads (AS.holdIsLive)
  const said = (raw) => (raw === undefined ? 'its default' : noNumber(raw) ? 'none' : raw);   // a row's raw value in a journal line
  const stored = (key) => { const s = readSettings() || {}; return Object.prototype.hasOwnProperty.call(s, key) ? (s[key] === null ? '' : s[key]) : null; };
  const valueIn = (s, key) => { const has = !!s && Object.prototype.hasOwnProperty.call(s, key), v = has ? s[key] : null; return NUM(v) != null && v >= 0 ? v : has && AS.PROPOSABLE[key] && noNumber(v) ? 0 : has && AS.PROPOSABLE[key] ? AS.NUM(v) : AS.PROPOSABLE[key] ? AS.PROPOSABLE[key].def : null; };
  const presentOf = (key) => valueIn(readSettings() || {}, key);
  const backOf = (key, h) => (h.before == null ? (AS.PROPOSABLE[key] ? AS.PROPOSABLE[key].def : null) : h.before);
  const disarm = (key) => { const t = timers.get(key); if (t) clearTimer(t); timers.delete(key); };
  function arm(key) {
    disarm(key); const h = holds[key]; if (!h) return;
    const wait = Math.max(0, h.untilAt - now());
    timers.set(key, setTimer(() => { timers.delete(key); returnHold(key, 'moment').catch((e) => log(`[setting-holds] return ${key} failed: ${e && e.message}`)); }, Math.min(wait, 2 ** 31 - 1)));
  }
  const list = () => Object.values(holds).map((h) => ({ ...h }));
  const tell = () => { try { broadcast({ type: 'setting-holds', holds: list() }); } catch { /* no clients */ } };
  /** LAW B — the row no longer holds the hold's value (the owner changed it by hand): the hold has ENDED, quietly (the owner did
   *  it), on disk, in the journal and to every page. It never goes back. */
  function endChangedByHand(key, cur, where) {
    if (!holds[key]) return;
    delete holds[key]; disarm(key); tries.delete(key);
    saveLater(`${key}: the hold's end`);
    log(`[setting-holds] ${key}: changed by hand (${cur}) — the hold ended (${where}); it will not go back`);
    tell();
  }
  /** THE HAND'S WRITE LANDED (server.js onSettingsWrite, after every write of data/settings.json): a held row whose value is no
   *  longer the hold's ends its hold here. The store's own writes (the press, the return) are not a hand's. */
  function noteSettingsWrite(next) {
    if (ownWrite) return;
    for (const key of Object.keys(holds)) { const raw = rawOf(next || {}, key); if (!AS.holdIsLive(holds[key], raw)) endChangedByHand(key, said(raw), 'when the hand\'s write landed'); }
  }
  /** the LIVE hold of a row (law B) with its lasting value (law A) — the agent's ask route judges against it; null = none */
  function holdOf(key) { const h = holds[key]; if (!h || !AS.holdIsLive(h, rawOf(readSettings() || {}, key))) return null; return { ...h, lasting: AS.lastingOf(key, h) }; }

  /** THE RETURN (the moment, or «End now»): back to «before» — only a LIVE hold; one the hand moved has already ended. */
  async function returnHold(key, why) {
    const h = holds[key]; if (!h) return { ok: true, none: true };
    const cur = presentOf(key), raw = rawOf(readSettings() || {}, key);
    if (!AS.holdIsLive(h, raw)) { endChangedByHand(key, said(raw), why === 'end' ? 'End now' : 'its moment'); return { ok: true, returned: false, changedByHand: true, value: cur }; }   // cure 2: a return never writes over a value it did not write
    try { write({ [key]: h.before }); }   // null = the row's default (a sparse store drops it)
    catch (e) {
      const msg = e && e.message;
      // «End now» is the owner's own press: its page says the refusal by its code (the route answers it); the hold and its moment stand
      if (why === 'end') { log(`[setting-holds] End now ${key} → ${h.before} FAILED: ${msg}`); return { ok: false, code: 'return-failed', value: cur, error: `the settings file could not be written (${msg}) — it stays at ${cur}; the hold still stands` }; }
      const n = (tries.get(key) || 0) + 1; tries.set(key, n);
      if (n <= RETRIES) {   // tried again in a minute, quietly (a return that then lands is the usual quiet return)
        disarm(key); timers.set(key, setTimer(() => { timers.delete(key); returnHold(key, why).catch((x) => log(`[setting-holds] return ${key} failed: ${x && x.message}`)); }, RETRY_MS));
        log(`[setting-holds] return ${key} → ${h.before} FAILED (${msg}) — try ${n + 1} of ${RETRIES + 1} in a minute`); return { ok: false, code: 'return-failed', retry: n, value: cur };
      }
      tries.delete(key);   // left to the next start (the hold stays on disk); the owner is told ONCE
      const back = backOf(key, h);
      notifyOwner({ text: `${labelEn(key)} could not go back: it stays at ${h.value}`, detail: `The hold said it would go back to ${back} at ${new Date(h.untilAt).toISOString()}; the settings file could not be written (${msg}) — tried ${RETRIES + 1} times, a minute apart. The next start of VibeSpace tries again. Change it on the row: ${AS.LINK(key)}`,
        i18n: { text: { key: '{label} could not go back: it stays at {value}', params: { label: LABEL(key), value: String(h.value) } }, detail: [{ key: 'The hold said it would go back to {back} at {at}; the settings file could not be written ({why}) — tried {n} times, a minute apart. The next start of VibeSpace tries again. Change it on the row: {link}', params: { back: String(back), at: { at: h.untilAt }, why: String(msg || ''), n: String(RETRIES + 1), link: AS.LINK(key) } }] } });
      log(`[setting-holds] return ${key} → ${h.before} FAILED ${RETRIES + 1} times: ${msg} — left to the next start`); return { ok: false, code: 'return-failed', left: 'start', value: cur };
    }
    delete holds[key]; disarm(key); tries.delete(key);
    saveLater(`${key}: the hold's end`);
    const back = backOf(key, h);
    const none = h.before != null && noNumber(h.before);   // B-0a33 cure: back to «no limit is set» — said as «none», never an empty value
    log(`[setting-holds] ${key}: back to ${h.before == null ? `the default (${back})` : none ? 'none (no number: every turn nobody typed refused)' : h.before} (${why})`);
    const i18n = none ? { key: '{label} is back to none — the hold ended: every turn nobody typed is held until a number is set: {link}', params: { label: LABEL(key), link: AS.LINK(key) } } : { key: '{label} is back to {value} — the hold ended: {link}', params: { label: LABEL(key), value: String(back), link: AS.LINK(key) } };
    try { broadcast({ type: 'server-notice', key: `setting-hold-return:${key}:${now()}`, level: 1, text: none ? `${labelEn(key)} is back to none — the hold ended: every turn nobody typed is held until a number is set: ${AS.LINK(key)}` : `${labelEn(key)} is back to ${back} — the hold ended: ${AS.LINK(key)}`, i18n }); } catch { /* no clients */ }
    tell();
    return { ok: true, returned: true, value: back };
  }

  /**
   * THE TAKE — the owner's press, ONE act (named `take`: no server code calls a method named press — that word is the models
   *  door's mint, test-agy-models-door). `shown` = the value the card drew as NOW (a value that moved since is answered 409 moved,
   *  with the present one: the card says it and its words follow). */
  async function take({ key, value, untilRel = null, untilAt = null, shown }) {
    if (!AS.isProposable(key)) return { ok: false, status: 400, code: 'not-proposable', error: `${key} is not a row a press may change; ${AS.LINK(key)}` };
    const present = presentOf(key);
    const presentNone = noNumber(rawOf(readSettings() || {}, key)) && rawOf(readSettings() || {}, key) !== undefined;   // cure 2: «none», never 0, in what the press answers
    if (NUM(Number(shown)) == null || Number(shown) !== present) return { ok: false, status: 409, code: 'moved', present, ...(presentNone ? { presentNone } : {}), error: `it is ${presentNone ? 'none' : present} now` };
    if (holds[key] && !AS.holdIsLive(holds[key], rawOf(readSettings() || {}, key))) endChangedByHand(key, said(rawOf(readSettings() || {}, key)), 'a press');   // law B's belt: the hand write's hook ends it first
    const prior = holds[key] ? { ...holds[key] } : null;   // LIVE (law B) — its «before» is the row's lasting value (law A)
    const v = AS.pressVerdict({ type: AS.TYPE, key, value, untilRel, untilAt }, { present, now: now(), lasting: prior ? AS.lastingOf(key, prior) : undefined });
    if (!v.press) return { ok: false, status: 409, code: v.why, present, ...(presentNone ? { presentNone } : {}), ...(v.lasting != null ? { lasting: v.lasting } : {}), ...(prior && prior.before != null && noNumber(prior.before) ? { lastingNone: true } : {}), error: v.why === 'raise-over-hold' ? `${value} is above ${v.lasting}, the value before the hold — a lasting raise needs its «until»` : v.why === 'raise-needs-until' ? 'a raise is always time-boxed — this one names no «until»' : v.why === 'passed' ? 'the moment has passed' : v.why };
    tries.delete(key);   // a new press: the old hold's failed returns are no longer counted
    if (v.untilAt != null) {   // TIMED: the hold on disk FIRST; a second press keeps the value it replaces as `pending` until its write lands
      holds[key] = { key, value: v.value, before: prior ? prior.before : stored(key), untilAt: v.untilAt, at: now(), ...(prior ? { pending: present } : {}) };   // 4: the FIRST «before» kept
      if (!(await save())) { if (prior) holds[key] = prior; else delete holds[key]; return { ok: false, status: 503, code: 'not-durable', error: 'the hold could not be written to disk, so nothing changed' }; }
      try { write({ [key]: v.value }); }
      catch (e) {   // the value could not be written: the hold is taken back (both or neither)
        if (prior) holds[key] = prior; else delete holds[key];
        await save();
        return { ok: false, status: 500, code: 'write-failed', error: `the setting could not be written (${e && e.message}) — nothing changed` };
      }
      if (holds[key].pending !== undefined) { delete holds[key].pending; saveLater(`${key}: the second press's landing`); }
      arm(key);
    } else {   // LASTING (law A: at or below the lasting value): the value FIRST, then the hold released
      try { write({ [key]: v.value }); }
      catch (e) { return { ok: false, status: 500, code: 'write-failed', error: `the setting could not be written (${e && e.message}) — nothing changed` }; }
      if (prior) { delete holds[key]; disarm(key); if (!(await save())) log(`[setting-holds] ${key}: the hold's release is not on disk yet — the next start sees the row moved and ends it`); }
    }
    log(`[setting-holds] ${key}: ${present} → ${v.value}${v.untilAt != null ? ` until ${new Date(v.untilAt).toISOString()} (then ${holds[key].before == null ? 'the default' : holds[key].before})` : prior ? ' (lasting — the hold ended)' : ' (lasting)'}`);
    tell();
    return { ok: true, key, value: v.value, untilAt: v.untilAt, before: holds[key] ? holds[key].before : null, held: !!holds[key], ...(v.endsHold && prior ? { endedHold: true } : {}) };
  }

  /** the boot: the holds read back; a hold the row no longer holds ends (law B, the journal); a hold that cannot be kept is said; the
   *  rest re-armed — a moment already passed returns at once. Unreadable ⇒ the owner is told. */
  async function start() {
    const unread = (why) => {
      notifyOwner({ text: 'The setting holds could not be read', detail: `data/setting-holds.json could not be read (${why}). A raised ceiling may not go back by itself — check the three ceilings: ${Object.keys(AS.PROPOSABLE).map(AS.LINK).join(' · ')}`,
        i18n: { text: { key: 'The setting holds could not be read' }, detail: [{ key: 'data/setting-holds.json could not be read ({why}). A raised ceiling may not go back by itself — check the three ceilings: {links}', params: { why: String(why), links: Object.keys(AS.PROPOSABLE).map(AS.LINK).join(' · ') } }] } });
      log(`[setting-holds] unreadable: ${why}`);
    };
    let raw = null;
    try { raw = await fs.promises.readFile(file, 'utf8'); } catch (e) { if (e && e.code !== 'ENOENT') unread(e.message); return list(); }
    try { const j = JSON.parse(raw); holds = j && j.holds && typeof j.holds === 'object' ? j.holds : {}; }
    catch (e) { unread(`not whole: ${e.message}`); holds = {}; return list(); }
    let changed = false;
    for (const k of Object.keys(holds)) {
      const h = holds[k], why = !h || typeof h !== 'object' ? CANNOT_KEEP.whole : !AS.isProposable(k) ? CANNOT_KEEP.list : NUM(h.untilAt) == null ? CANNOT_KEEP.moment : null;
      if (why) {   // dropped AND said (主开发's reading): a raised value it held may now stay — the row named with its link
        const held = h && typeof h === 'object' && h.value !== undefined ? String(h.value) : '?';
        notifyOwner({ text: `${labelEn(k)} may not go back by itself`, detail: `Its hold could not be kept at this start (${why.key}): it held ${held}. It was dropped, so a raised value may stay where it is. Check it on the row: ${AS.LINK(String(k).slice(0, 120))}`,
          i18n: { text: { key: '{label} may not go back by itself', params: { label: LABEL(k) } }, detail: [{ key: 'Its hold could not be kept at this start ({why}): it held {value}. It was dropped, so a raised value may stay where it is. Check it on the row: {link}', params: { why, value: held, link: AS.LINK(String(k).slice(0, 120)) } }] } });
        log(`[setting-holds] dropped at start: ${k} (${why.key})`);
        delete holds[k]; changed = true; continue;
      }
      const cur = rawOf(readSettings() || {}, k);   // cure 2: the RAW stored value decides liveness
      if (h.pending !== undefined) { if (NUM(h.pending) === cur) h.value = h.pending; delete h.pending; changed = true; }   // a second press that never landed: the hold stands on the old value
      if (!AS.holdIsLive(h, cur)) { log(`[setting-holds] ${k}: the row holds ${said(cur)}, not the hold's ${h.value} (changed while the hub was down, or a first press that never landed) — the hold ended; it will not go back`); delete holds[k]; changed = true; continue; }
      arm(k);
    }
    if (changed) await save();   // the store as kept — the next start does not say it again
    return list();
  }
  const end = (key) => returnHold(key, 'end');
  const stop = () => { for (const k of [...timers.keys()]) disarm(k); };
  return { start, take, end, list, returnHold, noteSettingsWrite, holdOf, stop, file };
}

module.exports = { create, STORE_NAME, RETRY_MS, RETRIES };

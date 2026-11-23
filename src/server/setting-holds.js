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
const SR = require('../store-read.js');
const HOLD = require('../store-read-hold.js');   // r3004 (lane bl-loop-b): data/setting-holds.json under the store-read law
// r3095: the «could not be read» notice's own key (a restart while held files the same item; the read that lifts it closes it) and the
// torn bytes' (a start that meets the same torn file again says it once)
const UNREAD_KEY = 'setting-holds-unread', TORN_KEY = 'setting-holds-torn';
const HOLDS_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && (v.holds === undefined || (!!v.holds && typeof v.holds === 'object' && !Array.isArray(v.holds)));

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

function create({ dataDir, readSettings, patchSettings, broadcast = () => { }, userTodos = null, log = () => { }, now = () => Date.now(), writer = null, setTimer = setTimeout, clearTimer = clearTimeout, settingsHeld = () => null } = {}) {
  // B-225b R11 (the persistence holds): data/settings.json HELD at the start — every row reads its DEFAULT, so no hold is judged
  // against it (liveness, a pending press): a hold is KEPT; its return is OWED (no retry used, no notice) and lands at the lift
  // (`atLift`, the settings store's lift hook) — before anything unattended spends; a press is refused by name meanwhile
  const isHeld = () => { try { return !!settingsHeld(); } catch { return false; } };
  const owed = new Set();
  const file = path.join(dataDir, 'setting-holds.json');
  const W = () => writer || require('../store-writer.js').storeWriter();
  let holds = {};   // key → { key, value, before (the stored value; null = the row's default), untilAt, at, pending? }
  const timers = new Map();
  const tries = new Map();   // key → the failed returns of its hold so far (a minute apart; reset by a new press or a return)
  let ownWrite = 0;   // the store's own settings write in flight — patchSettings is synchronous, the change hook fires inside it
  const write = (patch) => { ownWrite++; try { patchSettings(patch); } finally { ownWrite--; } };
  /** A FAILED ACT REACHES THE OWNER: a For-you notice in the Spending family (origin spend — the producer censuses), worded in the
   *  owner's language from its `i18n` lines, the row named by its label with its link. The only items this store files. → the item
   *  filed (r3095: a keyed notice's id, so its producer closes it), or null */
  const notifyOwner = ({ text, detail, i18n, itemKey = null }) => { try { if (userTodos) return userTodos.add('accounts', { origin: 'spend', text: String(text).slice(0, 300), detail, urgency: 'high', by: 'agent', sessionName: 'Spending', kind: 'notice', ...(i18n ? { i18n } : {}), ...(itemKey ? { itemKey } : {}) }) || null; } catch (e) { log(`[setting-holds] the owner's notice could not be filed: ${e && e.message}`); } return null; };
  const produce = () => JSON.stringify({ v: 1, holds });
  // r3004 (lane bl-loop-b): THE STORE-READ LAW (src/store-read-hold.js). The release read ANY failure of this file as «no hold» and the
  // owner's next timed raise saved only itself: every EARLIER raised ceiling lost its way back and stayed raised for good. HELD: no
  // hold is known, so no timed raise (and no «End now») is taken — refused by name; nothing is written over the file; it is read
  // again off the loop, and the owner is told each ceiling's value now. Torn bytes are kept aside once per content, then it starts
  // empty — said to the owner with each ceiling now. A restart while held reads the same file again. Nothing removes by this
  // store's silence (no sweep, no bound, no migration reads its names).
  // r3095 (主开发): EVERY WORD A PERSON READS is about the ceilings, never a file's path (the path and the copy's name are in the
  // journal): a notice names each ceiling with its value now and its default, and which stand raised (`ceilingLines`); torn bytes
  // file ONE notice (the lift's), never a «could not be read» before it; the «could not be read» notice is CLOSED by the read
  // that lifts the hold; the refusal says a ceiling can still be lowered on its row
  let liftP = null, unreadId = null;
  const hold = HOLD.create({ file, valid: HOLDS_SHAPE, code: 'setting_holds_unread', aside: (mark) => file + '.corrupt-' + mark,
    words: (h) => `the record of the raised ceilings could not be read (${h.code}) — while it cannot be read a raised ceiling does not go back by itself and no timed raise is taken; you can still lower a ceiling on its row. VibeSpace reads it again every few minutes and writes nothing over it`,
    log: (m) => log('[setting-holds] ' + m), onLift: (v, f) => { liftP = lifted(v, f).catch((e) => log(`[setting-holds] the lift failed: ${(e && e.message) || e}`)); } });
  /** the holds on disk — the store writer's own act; false = not durable (the caller refuses the press); held: nothing is written */
  async function save() { if (!hold.writable('a hold change')) return false; try { W().dirty(file, { name: 'setting-holds.write', produce, allowEmpty: true }); return (await W().durable(file)) !== false; } catch { return false; } }
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
    if (hold.held()) return { ok: false, status: 503, code: 'setting_holds_unread', error: hold.words() };   // r3004: no hold is known — never «no hold»
    const h = holds[key]; if (!h) return { ok: true, none: true };
    if (isHeld()) { owed.add(key); disarm(key); log(`[setting-holds] return ${key} → ${h.before} is OWED: the settings could not be read — it lands when they read`); return { ok: false, code: 'settings-unread', owed: true, value: null }; }
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
    if (isHeld()) return { ok: false, status: 503, code: 'store_unread', error: 'the settings could not be read — nothing was changed; press again once they read' };   // B-225b: never judged against the defaults
    if (hold.held()) return { ok: false, status: 503, code: 'setting_holds_unread', error: hold.words() };   // r3004: the earlier holds are unread — a press would write them away
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
    let read; try { read = { text: await fs.promises.readFile(file, 'utf8') }; } catch (error) { read = { error }; }
    const a0 = SR.storeAnswer(read, { valid: HOLDS_SHAPE });
    if (hold.start(a0) === 'held') {   // r3004: held — nothing known, nothing written
      // r3095 (2): TORN BYTES — their copy is made first, then it lifts: ONE notice (the lift's, each ceiling now), never a «could
      // not be read» before it; only a copy that cannot be made leaves it held, said as unread
      if (a0.state === 'corrupt' && (await hold.again())) { await liftP; return list(); }
      if (hold.held()) unread(hold.held().code);
      return list();
    }
    holds = a0.state === 'data' && a0.value.holds ? a0.value.holds : {};
    settleUnread();   // r3095 (1): a start that reads closes the notice an earlier start left open
    return adopt();
  }
  /** r3095: EACH CEILING as a person reads it — its value now, its default, and whether it stands RAISED (above its default). While
   *  the settings themselves cannot be read every row would read its default, so its value is «not known» (never a guess) */
  function ceilingLines() {
    const known = !isHeld(), s = known ? readSettings() || {} : {};
    return Object.keys(AS.PROPOSABLE).map((k) => {
      const def = String(AS.PROPOSABLE[k].def), link = AS.LINK(k);
      if (!known) return { raised: null, en: `${labelEn(k)}: not known now (the settings could not be read) — its default is ${def}: ${link}`, i18n: { key: '{label}: not known now (the settings could not be read) — its default is {def}: {link}', params: { label: LABEL(k), def, link } } };
      const raw = rawOf(s, k), none = raw !== undefined && noNumber(raw), v = valueIn(s, k), raised = !none && Number.isFinite(v) && v > AS.PROPOSABLE[k].def;
      const value = none ? { key: 'none' } : String(v), valueEn = none ? 'none' : String(v);
      return raised ? { raised, en: `${labelEn(k)}: ${valueEn} now, raised above its default ${def}: ${link}`, i18n: { key: '{label}: {value} now, raised above its default {def}: {link}', params: { label: LABEL(k), value, def, link } } }
        : { raised, en: `${labelEn(k)}: ${valueEn} now — its default is ${def}: ${link}`, i18n: { key: '{label}: {value} now — its default is {def}: {link}', params: { label: LABEL(k), value, def, link } } };
    });
  }
  /** the owner told ONCE a hold (its own key: a restart while held files the same item): the record could not be read — EACH
   *  ceiling with its value now and its default, the raised ones marked; closed by the read that lifts the hold (`settleUnread`) */
  function unread(why) {
    const rows = ceilingLines();
    const it = notifyOwner({ itemKey: UNREAD_KEY, text: 'The setting holds could not be read', detail: [`The record of the raised ceilings could not be read (${why}). While it cannot be read a raised ceiling does not go back by itself, no timed raise is taken and nothing is written over the record; VibeSpace reads it again every few minutes. You can still lower a ceiling on its row. Each ceiling now:`, ...rows.map((r) => r.en)].join('\n'),
      i18n: { text: { key: 'The setting holds could not be read' }, detail: [{ key: 'The record of the raised ceilings could not be read ({why}). While it cannot be read a raised ceiling does not go back by itself, no timed raise is taken and nothing is written over the record; VibeSpace reads it again every few minutes. You can still lower a ceiling on its row. Each ceiling now:', params: { why: String(why) } }, ...rows.map((r) => r.i18n)] } });
    if (it && it.id) unreadId = it.id;
    log(`[setting-holds] ${file} unreadable: ${why} — the owner is told each ceiling now (${rows.map((r) => r.en).join('; ')})`);
  }
  /** r3095 (1): the read that lifts the hold, or a start that reads, CLOSES the «could not be read» notice — this start's, or one an
   *  earlier start left open (its key finds it); a person's own resolve stands as it is */
  function settleUnread() {
    const ids = new Set(unreadId ? [unreadId] : []); unreadId = null;
    if (!userTodos || typeof userTodos.resolveAnswered !== 'function') return;
    try {
      if (typeof userTodos.openItems === 'function') for (const i of userTodos.openItems() || []) if (i && i.itemKey === UNREAD_KEY && i.sessionKey === 'accounts') ids.add(i.id);
      if (ids.size) userTodos.resolveAnswered([...ids], 'agent');
    } catch (e) { log(`[setting-holds] the «could not be read» notice could not be closed: ${(e && e.message) || e}`); }
  }
  /** r3004: THE HOLD LIFTED — the holds read (null: empty after torn bytes were kept aside); what the start skipped runs now.
   *  r3095: the «could not be read» notice closed (1); torn bytes said in ONE notice with each ceiling now (2) — the list damaged,
   *  WHERE its damaged bytes are kept (the copy's base name, never a path: r3104) and what the person can do, never «restore» it;
   *  the empty store written ONCE after their copy is made (4), so the next start reads it, never the torn
   *  bytes again; a moment that passed while held returns at once — the lift's own pass arms it, once */
  async function lifted(v, f) {
    holds = v && v.holds ? v.holds : {};
    settleUnread();
    if (f && f.setAside) {
      const rows = ceilingLines();
      log(`[setting-holds] ${file} did not parse: its bytes are kept aside as ${f.setAside} — it starts empty; the owner is told each ceiling now (${rows.map((r) => r.en).join('; ')})`);
      notifyOwner({ itemKey: TORN_KEY, text: 'The setting holds did not parse', detail: [`The record of the raised ceilings was damaged: it did not parse. Its damaged bytes are kept beside it as ${f.setAside}; putting them back would bring the damage back. It starts empty, so a raised ceiling does not go back by itself: lower it on its row, or raise it again for a time; or mend its file by hand and restart VibeSpace. Each ceiling now:`, ...rows.map((r) => r.en)].join('\n'),
        i18n: { text: { key: 'The setting holds did not parse' }, detail: [{ key: 'The record of the raised ceilings was damaged: it did not parse. Its damaged bytes are kept beside it as {copy}; putting them back would bring the damage back. It starts empty, so a raised ceiling does not go back by itself: lower it on its row, or raise it again for a time; or mend its file by hand and restart VibeSpace. Each ceiling now:', params: { copy: String(f.setAside) } }, ...rows.map((r) => r.i18n)] } });
    }
    await adopt();   // the lift's own pass (the start's): judged and re-armed
    if (f && f.setAside && !(await save())) log('[setting-holds] the empty store is not on disk yet after the torn bytes were kept aside — the next start meets them again (their copy is not made twice)');
    tell();
  }
  /** the holds as read: a hold the row no longer holds ends (law B), a hold that cannot be kept is said, the rest re-armed */
  async function adopt() {
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
      if (isHeld()) { arm(k); continue; }   // B-225b: the settings held — kept as it is, judged at the lift (atLift), never against the defaults
      const cur = rawOf(readSettings() || {}, k);   // cure 2: the RAW stored value decides liveness
      if (h.pending !== undefined) { if (NUM(h.pending) === cur) h.value = h.pending; delete h.pending; changed = true; }   // a second press that never landed: the hold stands on the old value
      if (!AS.holdIsLive(h, cur)) { log(`[setting-holds] ${k}: the row holds ${said(cur)}, not the hold's ${h.value} (changed while the hub was down, or a first press that never landed) — the hold ended; it will not go back`); delete holds[k]; changed = true; continue; }
      arm(k);
    }
    if (changed) await save();   // the store as kept — the next start does not say it again
    return list();
  }
  const end = (key) => returnHold(key, 'end');
  const stop = () => { for (const k of [...timers.keys()]) disarm(k); hold.stop(); };
  /** B-225b R11: THE SETTINGS READ AGAIN (their hold lifted) — what the start could not judge is judged now (a press that never
   *  landed, a row the hand moved), then every OWED return lands (synchronously: patchSettings is), before anything unattended spends */
  function atLift() {
    let changed = false;
    for (const k of Object.keys(holds)) {
      const h = holds[k], cur = rawOf(readSettings() || {}, k);
      if (h.pending !== undefined) { if (NUM(h.pending) === cur) h.value = h.pending; delete h.pending; changed = true; }
      if (!AS.holdIsLive(h, cur)) { log(`[setting-holds] ${k}: the row holds ${said(cur)}, not the hold's ${h.value} (changed while the settings could not be read) — the hold ended; it will not go back`); delete holds[k]; disarm(k); owed.delete(k); changed = true; }
    }
    if (changed) saveLater('the settings read again');
    const due = [...owed]; owed.clear();
    for (const k of due) returnHold(k, 'moment').catch((x) => log(`[setting-holds] return ${k} failed: ${x && x.message}`));
    if (changed) tell();
    return due.length;
  }
  return { start, take, end, list, returnHold, noteSettingsWrite, holdOf, stop, file, atLift, unreadWords: () => hold.words(), _hold: hold };   // _hold: the suites' seam (its read again)
}

module.exports = { create, STORE_NAME, RETRY_MS, RETRIES };

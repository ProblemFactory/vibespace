// B-225b (lane lg-store-writes, R4 / R7) — THE PAGE'S ONE FACE FOR A HELD STORE. A persistence store (the desktops, the
// conversation list, the settings, the bookmarks, the custom themes) the hub's START could not read is HELD: nothing is written
// over it and its doors refuse BY NAME (503 `store_unread` {held: file, kind, code, since, rung}). This page shows ONE strip
// naming every held store in plain words (the file and its code behind Details), kept for the whole hold. The first rungs are
// SILENT (a restart on slow storage must not flash a strip on every device): a hold is said only past them, or when a page
// cannot work without saying it (the desktops' scratch surface).
// What the strip knows: the hub's `store-held` word (a hold past its silent rungs), `store-lifted` (read again), a held answer
// any reader of this page met, and GET /api/stores/held — asked at the boot and at every reconnect (a word said while this page
// was away never arrives). The lift is ONE word, «read again»: each store's own reader fetches (onStoreLift).
// B-225b's SECOND HALF (主开发 r662): a store whose WRITE the storage refused is UNSAVED — its changes kept in the hub's memory and
// written again by the hold's ladder; the hub's `store-unsaved` word (past the silent rungs, or at once for a press) puts it on the
// same strip on EVERY page («changes are not being saved»), `store-saved` takes it off when a write lands; GET /api/stores/held
// carries `unsaved` beside `held` (a page that was away). Nothing is refused for it: what the page shows is what memory holds.
// A DAMAGED store has its one door here: a person's own whole replace — start it empty (POST /api/stores/<file>/empty: the bytes
// are set aside under a dated name first), an import of a backup, or (the desktops) a rollback point.
import { t } from './i18n.js';
import { fetchJson, showToast, showConfirmDialog, storeHeldWords, storeWhatOf, storeUnsavedWords, storeStopWords } from './utils.js';
import { UI_ICONS } from './icons.js';
import { stampAt } from './page-time.js';   // the ONE formatter of a time a person reads
// B-225b's REMAINDER (login-request-card, 主开发 r1310 / r1318): two more facts on the same strip. (1) The ROLLBACK POINTS' save the
// storage refused (or took too late) rides `store-unsaved` / `store-saved` by its own file name (`layout-history`) with its own
// sentence and the count it could not keep (`lost`) — it says nothing of the desktops, which their own row says (r1387 (4)). (2) THE LAST STOP, told at this start (`store-stop-unsaved`;
// GET /api/stores/held's `stop` for a page that was away): `known` — a layouts write was owed and did not land — stays until a PERSON
// presses «Understood» (POST /api/stores/layouts.json/stop-noted; every page told `store-stop-over`); `maynot` — no clean stop, nothing
// more known — is said QUIETLY (no alert, no press owed) and goes by itself at the hub's first landed layouts write (`store-stop-over`).

const HELD = new Map();   // file → { file, kind, code, since, rung }
const UNSAVED = new Map();   // file → { file, code, since, lost? } — a write the storage refused, said (B-225b's second half; `lost`: the rollback points')
let STOP = null;             // the last stop's fact (B-225b's remainder): null | { file, kind: 'known' | 'maynot', since, savedAt }
const pickUnsaved = (u) => ({ file: u.file, code: u.code || null, since: u.since || null, ...(Number(u.lost) > 0 ? { lost: Number(u.lost) } : {}) });
const pickStop = (f) => (f && typeof f === 'object' && (f.kind === 'known' || f.kind === 'maynot') ? { file: 'layouts.json', kind: f.kind, since: Number(f.since) || null, savedAt: Number(f.savedAt) || null, ...(f.kind === 'known' ? { cause: f.cause === 'late' ? 'late' : 'refused' } : {}) } : null);
const LIFTS = new Map();  // file → Set(fn): the store's own re-read at its lift
let gen = 0;              // bumped by every word: a refresh asked before one is older than what this page knows
let scratch = null;       // the desktops' scratch surface (a page opened during their hold): null | 'held' | 'lifted'
let doors = {};           // { importBackup(), rollback() } — the app's dialogs (setStoreDoors)
let detailsOpen = false;

const pick = (h) => ({ file: String(h.file), kind: h.kind || 'unreadable', code: h.code || null, since: h.since || null, rung: h.rung || 'said' });
/** the hold a refused body carries (`store_unread`), or null */
export const heldBodyOf = (b) => (b && typeof b === 'object' && b.code === 'store_unread' && b.held && typeof b.held === 'object' && typeof b.held.file === 'string' && b.held.file ? b.held : null);
/** past the silent rungs — a hold this page says */
export const saidRung = (h) => !!h && h.rung !== 'silent';
/** the hold of `file` this page knows (said), or null */
export const storeHeld = (file) => HELD.get(String(file || '')) || null;
// (round wyzvr7567's cure 1) the holds this page KNOWS in their silent rungs: never drawn (R7), but a PERSON'S OWN PRESS on such a
// store is refused before it is applied and said at the act — a press is no background read. Let go at the lift (every lift says
// `store-lifted`) and replaced by the hub's list at every reconnect
const QUIET = new Map();
/** the hold of `file` this page knows, said OR in its silent rungs, or null (a person's press asks this one) */
export const storeHeldKnown = (file) => HELD.get(String(file || '')) || QUIET.get(String(file || '')) || null;

/** A held answer or word. Said only past its silent rungs; `force` — a page that cannot work without saying it (the scratch
 *  surface). → true when the strip names it now */
export function noteStoreHeld(held, { force = false } = {}) {
  if (!held || typeof held !== 'object' || typeof held.file !== 'string' || !held.file) return false;
  if (!force && !saidRung(held) && !HELD.has(held.file)) { QUIET.set(held.file, { ...pick(held), rung: 'silent' }); return false; }   // R7: the silent rungs are never said (known, for a press)
  gen++;
  QUIET.delete(held.file);
  HELD.set(held.file, { ...(HELD.get(held.file) || {}), ...pick(held), ...(force ? { rung: 'said' } : {}) });
  draw();
  return true;
}
/** the hub read `file` again: the strip lets it go, and its readers fetch (whether or not this page had said it) */
export function noteStoreLifted(file) {
  const f = String(file || '');
  if (!f) return;
  gen++;
  HELD.delete(f); QUIET.delete(f);
  UNSAVED.delete(f);   // B-225b (round wg2vawd0o): a store read again owes no write of this page's — an owed write that ENDED BY NAME (the
                       // store held, a file that appeared) says only this word; its «not being saved» never stays up until a reconnect
  draw();
  for (const fn of [...(LIFTS.get(f) || [])]) { try { fn(); } catch (e) { console.warn(`[store-held] a reader of ${f} failed at its lift`, e); } }
}
/** the hub's word: `file`'s write is refused by the storage (its changes kept in memory) — on the strip until `store-saved` */
export function noteStoreUnsaved(u) {
  if (!u || typeof u !== 'object' || typeof u.file !== 'string' || !u.file) return false;
  gen++;
  UNSAVED.set(u.file, pickUnsaved(u));
  draw();
  return true;
}
/** the hub's word at its start: what the LAST stop lost, or may have lost (B-225b's remainder) → true when the strip says it */
export function noteStoreStop(f) { const p = pickStop(f); if (!p) return false; gen++; STOP = p; draw(); return true; }
/** the last stop's notice is over (a person noted it, or the hub's first landed write took a «may not» away) */
export function noteStoreStopOver() { if (!STOP) return; gen++; STOP = null; draw(); }

/** a write of `file` landed: the strip lets its «not being saved» go */
export function noteStoreSaved(file) { const f = String(file || ''); if (!f || !UNSAVED.has(f)) return; gen++; UNSAVED.delete(f); draw(); }
/** the stores this page says are not being saved (for a reader that asks) */
export const storesUnsaved = () => [...UNSAVED.values()];
/** a store's own re-read at its lift → the unsubscribe */
export function onStoreLift(file, fn) {
  if (typeof fn !== 'function') return () => {};
  const f = String(file || '');
  if (!LIFTS.has(f)) LIFTS.set(f, new Set());
  LIFTS.get(f).add(fn);
  return () => LIFTS.get(f)?.delete(fn);
}
/** The hub's list (the boot, every reconnect) REPLACES what this page knows — unless a word arrived while it was asked. A store
 *  this page held that the hub holds no more was read again while this page was away: its readers fetch (its lift). */
export async function refreshStoreHolds() {
  const asked = gen;
  const r = await fetchJson('/api/stores/held');
  if (!r || !Array.isArray(r.held) || asked !== gen) return false;
  const was = new Set(HELD.keys());
  HELD.clear(); QUIET.clear();
  UNSAVED.clear(); for (const u of Array.isArray(r.unsaved) ? r.unsaved : []) if (u && typeof u.file === 'string' && u.file) UNSAVED.set(u.file, pickUnsaved(u));   // the said owed writes (+ the rollback points')
  STOP = pickStop(r.stop);   // B-225b's remainder: the last stop's fact, as the hub knows it now (a page that was away)
  for (const h of r.held) if (h && typeof h.file === 'string' && h.file) { if (saidRung(h) || was.has(h.file) || (scratch === 'held' && h.file === 'layouts.json')) HELD.set(h.file, { ...pick(h), rung: 'said' }); else QUIET.set(h.file, { ...pick(h), rung: 'silent' }); }
  draw();
  for (const f of was) if (!HELD.has(f)) for (const fn of [...(LIFTS.get(f) || [])]) { try { fn(); } catch (e) { console.warn(`[store-held] a reader of ${f} failed at its lift`, e); } }
  return true;
}
/** the desktops' scratch surface: 'held' (this page opened during the hold — nothing it shows is saved), 'lifted' (they can be
 *  read again: the person loads them — the page's own boot load), null */
export function setScratch(state) { scratch = state === 'held' || state === 'lifted' ? state : null; draw(); }
export const scratchState = () => scratch;
/** the app's dialogs a damaged store's door opens: { importBackup, rollback } */
export function setStoreDoors(d) { doors = d && typeof d === 'object' ? d : {}; }

const KIND_WORDS = { unsaved: (code) => (code === 'queued' ? t('not saved yet — the storage has not taken the write in time') : t('not being saved — the storage refused the write')), damaged: () => t('damaged — not what it should be'), 'not-allowed': () => t('not allowed to read it'), unreadable: () => t('cannot be read right now') };
/** THE STRIP'S MODEL (PURE but for t): the holds → { text, rows, scratch } or null (nothing to say). Each row: what, file, kind
 *  in words, code, and the doors a damaged store has. */
export function stripModel(list, { scratch: sc = null, unsaved: unsavedList = [], stop = null } = {}) {
  const held = (list || []).filter((h) => h && h.file);
  const unsaved = (unsavedList || []).filter((u) => u && u.file && !held.some((h) => h.file === u.file));   // a held store has no write to owe
  const st = pickStop(stop);
  if (!held.length && !unsaved.length && sc !== 'lifted' && sc !== 'held' && !st) return null;
  const text = held.length === 1 ? storeHeldWords(held[0])
    : held.length > 1 ? t('VibeSpace cannot read {n} of its saved files right now — nothing is written over them (Details names them).', { n: held.length })
      : '';
  const scratchText = sc === 'held' ? t('This page is a scratch surface: windows opened here are not saved.')
    : sc === 'lifted' ? t('Your desktops can be read again — load them (the page reloads; windows opened here are not kept).') : '';
  const rows = held.map((h) => ({
    file: h.file, what: storeWhatOf(h.file), kind: h.kind, kindWords: (KIND_WORDS[h.kind] || KIND_WORDS.unreadable)(), code: h.code || null,
    doors: h.kind === 'damaged' ? ['empty', 'import', ...(h.file === 'layouts.json' ? ['rollback'] : [])] : [],
  }));
  for (const u of unsaved) rows.push({ file: u.file, what: storeWhatOf(u.file), kind: 'unsaved', kindWords: KIND_WORDS.unsaved(u.code), code: u.code || null, doors: [] });
  // r1595 (the round's should): the count sentence («kept here and written again») is the STORES' own — a refused rollback point is
  // let go, so the points' row says its own sentence beside it, never counted into «kept»
  const ownRows = unsaved.filter((u) => u.file !== 'layout-history'), pointRows = unsaved.filter((u) => u.file === 'layout-history');
  const unsavedText = [ownRows.length ? storeUnsavedWords(ownRows) : '', ...pointRows.map((u) => storeUnsavedWords(u))].filter(Boolean).join(' ');
  // the last stop (B-225b's remainder): `known` owes a person's «Understood»; `maynot` is QUIET (no press) — alone it is no alert
  const stopTime = st ? (st.kind === 'known' ? st.since : st.savedAt) : null;
  const stopText = st ? storeStopWords(st, stopTime ? stampAt(stopTime) : '') : '';
  const quiet = !!st && st.kind === 'maynot' && !held.length && !unsaved.length && sc !== 'lifted' && sc !== 'held';
  return { text, unsavedText, scratchText, stopText, stopKind: st ? st.kind : null, quiet, rows, scratch: sc, damaged: rows.some((r) => r.doors.length), unsaved: unsaved.map((u) => u.file) };
}

const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
const button = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; };

/** a damaged store started EMPTY — the person's own act, asked first (its bytes are set aside, never deleted) */
async function startEmpty(row) {
  const ok = await showConfirmDialog({
    title: t('Start {what} empty?', { what: row.what }),
    message: t('The damaged file ({file}) is set aside under a dated name — nothing is deleted. VibeSpace then starts this file empty; a backup can still be imported later.', { file: row.file }),
    confirmText: t('Start empty'), danger: true,
  });
  if (!ok) return;
  const r = await fetchJson(`/api/stores/${encodeURIComponent(row.file)}/empty`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (r && r.success) showToast(t('Started empty — the damaged file {file} was set aside.', { file: row.file }));
  else showToast((r && r.error) || t('It could not be started empty — nothing was changed.'), { type: 'error' });
}

/** «Understood» on the last stop's loss: the PERSON notes it (the hub tells every page `store-stop-over`) */
async function noteStopPressed() {
  const r = await fetchJson('/api/stores/layouts.json/stop-noted', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
  if (r && r.success) {
    noteStoreStopOver();
    // r1798 (1): noted here, but the note could not be written yet — the next start tells the loss again, and the press says so now
    if (r.recorded === false) showToast(t('Noted here, but VibeSpace could not record it yet: the storage did not take the write. It is recorded once the storage takes it; until then the next start tells it again.'), { type: 'error' });
  }
  else showToast((r && r.error) || t('It could not be noted — try again.'), { type: 'error' });
}

function draw() {
  if (typeof document === 'undefined') return;
  const m = stripModel([...HELD.values()], { scratch, unsaved: [...UNSAVED.values()], stop: STOP });
  let strip = document.getElementById('store-held-strip');
  if (!m) { strip?.remove(); detailsOpen = false; return; }
  const wrap = document.getElementById('main-wrapper');
  if (!wrap) return;
  if (!strip) {
    strip = el('div', 'store-held-strip');
    strip.id = 'store-held-strip';
    strip.setAttribute('role', 'status');
    // below the maintenance banner and the vault's lock strip (each a flex child at #main-wrapper's top), else the first strip
    const after = [document.getElementById('vault-lock-strip'), document.getElementById('maintenance-banner')].find((x) => x && x.parentNode === wrap);
    wrap.insertBefore(strip, after ? after.nextSibling : wrap.firstChild);
  }
  strip.dataset.held = m.rows.filter((r) => r.kind !== 'unsaved').map((r) => r.file).join(' ');
  strip.dataset.unsaved = m.unsaved.join(' ');
  strip.dataset.scratch = m.scratch || '';
  strip.dataset.stop = m.stopKind || '';
  strip.classList.toggle('is-quiet', !!m.quiet);
  strip.setAttribute('role', m.quiet ? 'note' : 'status');
  const line = el('div', 'shs-line');
  const ic = el('span', 'shs-ic'); ic.innerHTML = (m.quiet ? UI_ICONS.info : UI_ICONS.alert) || '';
  line.append(ic);
  if (m.text) line.append(el('span', 'shs-text', m.text));
  if (m.unsavedText) line.append(el('span', 'shs-text shs-unsaved', m.unsavedText));
  if (m.scratchText) line.append(el('span', 'shs-text shs-scratch', m.scratchText));
  if (m.stopText) line.append(el('span', `shs-text shs-stop shs-stop-${m.stopKind}`, m.stopText));
  if (m.stopKind === 'known') line.append(button('shs-btn shs-stop-noted', t('Understood'), () => noteStopPressed()));
  if (m.stopKind && typeof doors.rollback === 'function') line.append(button('shs-btn shs-stop-rollback', t('Restore a previous layout…'), () => doors.rollback()));   // r1387 (6): where to look
  if (m.scratch === 'lifted') line.append(button('shs-btn shs-load', t('Load my desktops'), () => location.reload()));
  if (m.rows.length) {
    const d = button('shs-btn shs-details', detailsOpen ? t('Hide details') : t('Details'), () => { detailsOpen = !detailsOpen; draw(); });
    d.setAttribute('aria-expanded', String(detailsOpen));
    line.append(d);
  }
  const parts = [line];
  if (detailsOpen && m.rows.length) {
    const list = el('ul', 'shs-rows');
    for (const r of m.rows) {
      const li = el('li', 'shs-row');
      li.dataset.file = r.file;
      li.append(el('span', 'shs-what', r.what), el('span', 'shs-file', ` — ${r.file}: ${r.kindWords}${r.code ? ` (${r.code})` : ''}`));
      if (r.doors.includes('rollback') && typeof doors.rollback === 'function') li.append(button('shs-btn', t('Restore a previous layout…'), () => doors.rollback()));
      if (r.doors.includes('import') && typeof doors.importBackup === 'function') li.append(button('shs-btn', t('Import a backup…'), () => doors.importBackup()));
      if (r.doors.includes('empty')) li.append(button('shs-btn shs-danger', t('Start empty…'), () => startEmpty(r)));
      list.append(li);
    }
    parts.push(list);
  }
  strip.replaceChildren(...parts);
}

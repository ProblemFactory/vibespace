// WHAT IS WAITING FOR THIS AGENT — the strip above the composer + the sidebar card's hint (the owner, 2026-09-27:
// "能看到，只是会堆积到我下次发消息给它，这个有点 confusing，因为我在界面里完全看不到'有消息在 queue'这件事情").
//
// The server publishes each live session's `stash` fact on the `active-sessions` payload (src/server/
// stash-handover.js → PURE src/stash-summary.js `summarize`; src/lib/sidebar.js LIVE_SESSION_FACTS, carried-only).
// This module draws it and decides nothing:
//   `createStashStrip({sessionId})` — ONE keyed strip per chat composer (ChatInput places it above the queue strip):
//     "3 notices are waiting for this agent's next turn: a channel receipt, a job result, a message from Ada" +
//     [Hand over now · starts a turn] (or "· joins the running turn" — the money word is ALWAYS on the button, verify
//     r4) + "3 more are held for the next hand-over"; `set(summary, {turn})` patches the text nodes in place (a
//     digest gate — the node is never rebuilt), hides it when nothing waits (the next user message drained it, or the
//     hand-over did). The button POSTs `/api/sessions/:id/stash/hand-over`; a refusal is SAID (a toast in the
//     device's words — the spend limit, an unreachable agent), never silent. On the phone (≤768px) it folds to the
//     head line + the button WITH its money word (the parts and the held count fold; the toast names the rest).
//   `stashHintChip(summary)` / `patchStashHints(listEl, sessions)` — the sidebar card's "N waiting" chip, drawn by
//     the card at build and PATCHED in place on every `active-sessions` (a stash change never re-renders the list).
// Every string is textContent (a peer's name is its own choice); the icons are the library's SVG.
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { stashSummaryWords, summaryDigest, previewDigest, previewWords, handedOverWords } from '../stash-summary.js';

const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; if (text != null) s.textContent = text; return s; };
const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };

/** A refused hand-over in the device's words (by the route's CODE; the English `error` is the contract). */
export function handOverRefusalText(r) {
  const code = r && r.code;
  if (code === 'spend_refused') return t('Not handed over — the limit for turns nobody typed is reached; the notices keep waiting for your next message');
  if (code === 'unreachable') return t('Not handed over — the agent could not be reached; the notices keep waiting for its next turn');
  if (code === 'in_flight') return t('A hand-over for this agent is already in progress');
  if (code === 'held_for_next_turn') return t('Not handed over — this agent’s process predates mid-turn notifications; the notices ride its next prompt (restart the session to receive them mid-turn)');
  if (code === 'nothing_waiting') return t('Nothing is waiting any more');
  if (code === 'restarting') return t('Not handed over — the server is restarting; the notices keep waiting for the agent’s next turn');   // verify r3: the door shut before the shutdown's wait
  if (code === 'no_session') return t('That agent session is no longer running');
  return t('Hand-over failed: {why}', { why: (r && r.error) || t('server unreachable') });
}

export function createStashStrip({ sessionId }) {
  const el = document.createElement('div');
  el.className = 'chat-stash-strip';
  el.hidden = true;
  el.setAttribute('role', 'status');
  const ic = span('chat-stash-icon'); ic.innerHTML = UI_ICONS.inbox;   // the library's own static SVG
  const text = span('chat-stash-text');
  const head = span('chat-stash-head', '');
  const parts = span('chat-stash-parts', '');
  text.append(head, parts);
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'chat-stash-go';
  const goLabel = span('chat-stash-go-label', '');
  const cost = span('chat-stash-cost', '');   // THE MONEY WORD, on the button — said on every width (verify r4: the phone hid it)
  go.append(goLabel, cost);
  const heldEl = span('chat-stash-held', '');   // what one hand-over would leave (named; folds on the phone — the toast names it after)
  el.append(ic, text, go, heldEl);
  const st = { key: '', summary: null, busy: false };
  go.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (st.busy || !st.summary) return;
    st.busy = true; go.disabled = true;
    const r = await fetchJson(`/api/sessions/${encodeURIComponent(sessionId)}/stash/hand-over`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    st.busy = false; go.disabled = !!(st.summary && (st.summary.inFlight || st.summary.reachable === false));
    if (!r || r.error || !r.ok) { showToast(handOverRefusalText(r), { type: r && r.code === 'nothing_waiting' ? 'info' : 'error' }); return; }
    showToast(handedOverWords(r, t), { duration: r.held ? 7000 : 4000 });   // verify r2: what is still held is named, never hidden in the count
  });
  const noBtn = span('chat-stash-nobutton', '');   // a harness with no live inbox: the sentence where the button would be
  noBtn.hidden = true;
  el.append(noBtn);
  // THE DETAILS (the owner, 2026-09-28: the strip said "2 notices are waiting" and nothing could open them): a house
  // text button toggles a list under the strip — one row per waiting entry (its kind + the first line of its text,
  // textContent: a head is peer-written), oldest first, and a last row naming how many more are not previewed.
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'chat-stash-more';
  more.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div');
  list.className = 'chat-stash-list';
  list.hidden = true;
  el.append(more, list);
  const det = { open: false, key: '' };
  const drawMore = () => { setText(more, det.open ? t('Hide details') : t('Details')); more.setAttribute('aria-expanded', det.open ? 'true' : 'false'); list.hidden = !det.open; };
  more.addEventListener('click', (ev) => { ev.stopPropagation(); det.open = !det.open; drawMore(); });
  const drawList = (summary) => {
    const key = previewDigest(summary);
    if (key === det.key) return;
    det.key = key;
    // rows are PATCHED in place (the strip's rule: a fact change writes text, it does not rebuild nodes under the
    // pointer): existing rows take the new words, extra rows are made only when the list grows, surplus rows leave
    const h = Number(summary && summary.previewsHeld) || 0;
    const words = ((summary && summary.previews) || []).map((p) => ({ cls: 'chat-stash-row', text: previewWords(p, t) }));
    if (h) words.push({ cls: 'chat-stash-row chat-stash-row-more', text: h === 1 ? t('1 more is waiting, not previewed') : t('{n} more are waiting, not previewed', { n: h }) });
    const rows = [...list.children];
    words.forEach((w, i) => {
      const r = rows[i] || list.appendChild(span('chat-stash-row', ''));
      if (r.className !== w.cls) r.className = w.cls;
      setText(r, w.text);
    });
    for (const r of rows.slice(words.length)) r.remove();
  };
  drawMore();
  /** The session's `stash` fact + its turn. The COST is the server's word (`summary.billed`: free only where the
   *  harness folds a notification into the running turn — a claude inbox is charged mid-turn too); a fact without it
   *  (an older server) falls back to the turn. verify r2: `inFlight` (another client's click is on its way — the
   *  button waits), `held` (what one hand-over would leave — named), `reachable` (no button for a stash-only lane). */
  function set(summary, { turn = null } = {}) {
    const billed = summary && typeof summary.billed === 'boolean' ? summary.billed : turn !== 'running';
    const inFlight = !!(summary && summary.inFlight);
    const held = Number(summary && summary.held) || 0;
    const reachable = summary && typeof summary.reachable === 'boolean' ? summary.reachable : true;
    const key = summary && summary.count ? summaryDigest(summary) + '|' + billed + '|' + inFlight + '|' + held + '|' + reachable + '|' + previewDigest(summary) : '';
    if (key === st.key) return;
    st.key = key;
    st.summary = key ? summary : null;
    if (!key) { el.hidden = true; return; }
    drawList(summary);
    const w = stashSummaryWords(summary, t, { billed, inFlight, held, reachable });
    setText(head, w.head);
    setText(parts, ': ' + w.parts.join(', '));
    setText(goLabel, w.button);
    setText(cost, w.cost ? ' · ' + w.cost : '');
    setText(heldEl, w.held || '');
    heldEl.hidden = !w.held;
    if (go.title !== w.title) go.title = w.title;
    go.disabled = st.busy || inFlight || !reachable;
    go.hidden = !reachable;
    setText(noBtn, w.noButton || '');
    noBtn.hidden = reachable;
    if (noBtn.title !== w.title) noBtn.title = w.title;
    if (el.title !== w.line) el.title = w.line;
    el.hidden = false;
  }
  return { el, set, state: () => ({ key: st.key, hidden: el.hidden, detailsOpen: det.open }) };
}

/** The sidebar card's "N waiting" chip (null when nothing waits). */
export function stashHintChip(summary) {
  if (!summary || !summary.count) return null;
  const c = span('sess-state-chip sess-state-derived sess-stash-chip');
  c.style.setProperty('--chip-color', 'var(--accent)');
  const ic = span('chip-icon'); ic.innerHTML = UI_ICONS.inbox;   // the library's own static SVG
  c.append(ic, span('chip-text', ''));
  patchHint(c, summary);
  return c;
}
function patchHint(chip, summary) {
  const w = stashSummaryWords(summary, t, { billed: true });
  setText(chip.querySelector('.chip-text'), t('{n} waiting', { n: summary.count }));
  chip.dataset.tip = w.line;
  chip.dataset.stashKey = summaryDigest(summary);
}
/** Every rendered card of a live session: add / patch / remove its hint from the broadcast's rows (by webui id). */
export function patchStashHints(listEl, sessions) {
  if (!listEl || !Array.isArray(sessions)) return;
  const by = new Map(sessions.filter((s) => s && s.id).map((s) => [s.id, s.stash || null]));
  for (const card of listEl.querySelectorAll('.session-item-card')) {
    const wid = card._webuiId;
    if (!wid) continue;
    const sum = by.has(wid) ? by.get(wid) : null;
    let chip = card.querySelector('.sess-stash-chip');
    if (!sum || !sum.count) { if (chip) chip.remove(); continue; }
    if (chip) { if (chip.dataset.stashKey !== summaryDigest(sum)) patchHint(chip, sum); continue; }
    chip = stashHintChip(sum);
    const anchor = card.querySelector('.sess-state-chip');
    if (anchor) anchor.after(chip);
  }
}

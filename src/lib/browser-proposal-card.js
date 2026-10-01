// THE PROPOSAL CARD — the DOM half (lane browser-propose step 3; the owner, 2026-09-30: the agent PROPOSES the switch,
// the user presses Approve — nothing switches by itself). The server sends the BLOCK (src/browser-switch.js
// proposalCardBlock: ids, codes, counts, bounded strings — never markup); the WORDS are the PURE `proposalLines` (who
// claims what + what Approve runs, line for line the same as the For-you row) and this file's state line, all through
// t(). Every string lands through textContent (XSS law: the claim's host / why / url are the agent's words).
// ONE element per proposal, PATCHED IN PLACE (feedback: a card re-created per update blinks): the head, the claim, the
// plan list, the state line and the action row are keyed children; a patch rewrites the text / toggles the buttons of
// the element it has. ONE primary button (Approve) + a quiet Reject — shown only while they WORK (open / failed);
// Approve sends the digest of the card it was pressed on (`shown`), so what runs is exactly what this card showed.
import { t } from './i18n.js';
import { fetchJson, showToast } from './utils.js';
import { UI_ICONS } from './icons.js';
import { btn, el } from './channel-chrome.js';
import * as SW from '../browser-switch.js';
import { pressVerdict } from './press-arm.js'; // verify r1: an Approve counts only once it sat still where it was read

// ── verify r1: THE PRESS-ARM RULE on the chat card (the outbox card's F6, the For-you rows' V1) — reproduced in chrome: a
// press the instant the card appeared under the pointer ran the whole proposal (the install, the site, the switch). An
// Approve counts only once it has stayed where it is ARM_MS since it appeared, moved (a scroll of the chat, a resize, a
// row landing above it) or changed its words; an earlier press does nothing and says so. Reject is never gated. ──
function armNow(btn) { btn._armSince = performance.now(); btn._armTop = btn.isConnected ? btn.getBoundingClientRect().top : null; }
function rearmIfMoved(btn) {
  if (!btn.isConnected) return;
  const top = btn.getBoundingClientRect().top;
  if (btn._armTop == null || Math.abs(top - btn._armTop) > 1) btn._armSince = performance.now();
  btn._armTop = top;
}
let armListening = false;
function listenArm() {
  if (armListening || typeof document === 'undefined') return;
  armListening = true;
  let queued = false;
  const pass = () => { queued = false; for (const b of document.querySelectorAll('.chat-browser-proposal-approve')) rearmIfMoved(b); };
  const soon = () => { if (!queued) { queued = true; requestAnimationFrame(pass); } };
  document.addEventListener('scroll', soon, { capture: true, passive: true });
  window.addEventListener('resize', soon, { passive: true });
}
/** May THIS press on `btn` decide now? A press within ARM_MS of it appearing / moving / changing does nothing but say so. */
function approveArmed(btn) {
  rearmIfMoved(btn); // a move no scroll event announced (a row landing above it) counts as a move now
  const v = pressVerdict({ since: btn._armSince ?? null, now: performance.now() });
  if (!v.ok) showToast(t('That Approve moved under the pointer just now — read it, then press it again'));
  return v.ok;
}

const i18nKey = (s) => s;
const say = (l, tt) => (l ? tt(l.key, l.params || {}) : '');
/** What an Approve is doing right now, or how the proposal ended — the card's ONE state line (null = nothing to add). */
export function proposalStateText(b, tt = t) {
  const x = b || {};
  const o = x.outcome || {};
  const pr = x.progress || {};
  if (x.state === 'open' || x.state === 'unavailable') return null;
  if (x.kind === 'site-reset') return siteResetStateText(x, tt); // lane site-reset: the same card, its own state words
  if (x.state === 'approved') {
    // verify r1 V3: a stalled download is SAID (it gives up by itself after 15 min; Approve again then starts it over)
    if (pr.step === 'install' && Number.isFinite(pr.stalledSec)) return Number.isFinite(pr.percent) ? tt(i18nKey('Approved — installing CloakBrowser: stuck at {percent} % — nothing has arrived for {sec} s. It gives up by itself after 15 min; Approve again then starts it over.'), { percent: pr.percent, sec: pr.stalledSec }) : tt(i18nKey('Approved — installing CloakBrowser: nothing has arrived for {sec} s. It gives up by itself after 15 min; Approve again then starts it over.'), { sec: pr.stalledSec });
    if (pr.step === 'install') return Number.isFinite(pr.percent) ? tt(i18nKey('Approved — installing CloakBrowser: downloading {percent} %'), { percent: pr.percent }) : tt(i18nKey('Approved — installing CloakBrowser…'));
    if (pr.step === 'site') return tt(i18nKey('Approved — adding {host} to the sites CloakBrowser may open…'), { host: x.site });
    if (pr.step === 'switch') return tt(i18nKey('Approved — switching the browser to CloakBrowser…'));
    if (pr.step === 'profile' || pr.step === 'open') return tt(i18nKey('Approved — opening the new CloakBrowser profile…'));
    if (pr.step === 'reopen') return tt(i18nKey('Approved — reopening the page…'));
    if (pr.step === 'tell') return tt(i18nKey('Approved — telling the agent…'));
    return tt(i18nKey('Approved — starting…'));
  }
  if (x.state === 'done') {
    const head = o.code === 'site-added' ? tt(i18nKey('Done — CloakBrowser may now open {host}.'), { host: x.site }) : o.newProfile ? tt(i18nKey('Done — this conversation now uses the new CloakBrowser profile "{label}".'), { label: o.label || '' }) : tt(i18nKey('Done — this conversation\'s browser "{label}" is now CloakBrowser.'), { label: o.label || '' });
    const told = o.told === 'steered' ? tt(i18nKey('The agent was told in its running turn.')) : o.told === 'stashed' || o.told === 'noticed' ? tt(i18nKey('The agent hears it with your next message.')) : tt(i18nKey('The agent could not be told — tell it yourself that its browser is CloakBrowser now.'));
    return `${head} ${told}`;
  }
  if (x.state === 'failed') {
    const where = o.step === 'install' ? tt(i18nKey('installing CloakBrowser')) : o.step === 'site' ? tt(i18nKey('adding the site')) : o.step === 'switch' ? tt(i18nKey('switching the browser')) : o.step === 'profile' || o.step === 'open' ? tt(i18nKey('opening the new profile')) : o.step === 'reopen' ? tt(i18nKey('reopening the page')) : tt(i18nKey('starting'));
    return tt(i18nKey('Failed while {step}: {error}'), { step: where, error: o.error || tt(i18nKey('no reason was given')) });
  }
  if (x.state === 'rejected') return x.told ? tt(i18nKey('Rejected — the agent was told.')) : tt(i18nKey('Rejected — the agent is told the next time it opens {host}.'), { host: x.site });
  return null;
}
/** lane site-reset: a site-reset proposal's state line (what its Approve is doing, or how it ended). */
function siteResetStateText(x, tt) {
  const o = x.outcome || {};
  const pr = x.progress || {};
  const profile = x.profileLabel || '';
  if (x.state === 'approved') {
    if (pr.step === 'start') return tt(i18nKey('Approved — starting the browser of "{profile}"…'), { profile });
    if (pr.step === 'clear') return tt(i18nKey('Approved — clearing {host}\'s login…'), { host: x.site });
    if (pr.step === 'tell') return tt(i18nKey('Approved — telling the agent…'));
    return tt(i18nKey('Approved — starting…'));
  }
  if (x.state === 'done') {
    const head = tt(i18nKey('Done — {host}\'s login was cleared in "{profile}" ({n} cookies).'), { host: x.site, profile, n: Number(o.cookies) || 0 });
    const told = o.told === 'steered' ? tt(i18nKey('The agent was told in its running turn.')) : o.told === 'stashed' || o.told === 'noticed' ? tt(i18nKey('The agent hears it with your next message.')) : tt(i18nKey('The agent could not be told — tell it yourself that the site\'s login was cleared.'));
    return `${head} ${told}`;
  }
  if (x.state === 'failed') {
    const where = o.step === 'start' ? tt(i18nKey('starting the browser')) : o.step === 'clear' ? tt(i18nKey('clearing the site')) : tt(i18nKey('starting'));
    return tt(i18nKey('Failed while {step}: {error}'), { step: where, error: o.error || tt(i18nKey('no reason was given')) });
  }
  if (x.state === 'rejected') return x.told ? tt(i18nKey('Rejected — the agent was told.')) : tt(i18nKey('Rejected — the agent is told the next time it opens {host}.'), { host: x.site });
  return null;
}
/** The words of a refusal the Approve / Reject route answered (a toast). */
function refusalText(r, tt = t) {
  const code = r && r.code;
  if (code === 'proposal_changed') return tt(i18nKey('That card changed after it was shown — nothing ran; read it again'));
  if (code === 'proposal_state') return tt(i18nKey('That proposal was already decided'));
  if (code === 'proposal_unavailable') return tt(i18nKey('Nothing can be approved here — the card says why'));
  if (code === 'agent_forbidden') return tt(i18nKey('Only you can approve this'));
  return (r && r.error) || tt(i18nKey('server unreachable'));
}
// ── the acts (the house fetch: never throws; a refusal is said) ──
const pressed = new Set(); // proposal ids THIS client approved — a failure of their run is toasted here
export async function approveProposal(b, tt = t) {
  pressed.add(b.id);
  const r = await fetchJson(`/api/browser/proposals/${encodeURIComponent(b.id)}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shown: b.digest }) });
  if (!r || r.error || !r.ok) { pressed.delete(b.id); showToast(refusalText(r, tt), { type: 'error' }); return false; }
  return true;
}
export async function rejectProposal(b, tt = t) {
  const r = await fetchJson(`/api/browser/proposals/${encodeURIComponent(b.id)}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!r || r.error || !r.ok) { showToast(refusalText(r, tt), { type: 'error' }); return false; }
  return true;
}
/** The broadcast a run's change sends (`browser-proposal-updated`): a FAILED run this client started is toasted by
 *  name (the card says it too). Installed once per app. */
let listening = false;
export function listenProposalUpdates(app) {
  if (listening || !app || !app.ws || typeof app.ws.onGlobal !== 'function') return;
  listening = true;
  app.ws.onGlobal((m) => {
    if (!m || m.type !== 'browser-proposal-updated' || !pressed.has(m.id)) return;
    if (m.state === 'failed') { pressed.delete(m.id); const why = (m.outcome && m.outcome.error) || t('no reason was given'); showToast(String(m.id).startsWith('sr-') ? t('Clearing the site\'s login failed: {error}', { error: why }) : t('Switching to CloakBrowser failed: {error}', { error: why }), { type: 'error' }); } // lane site-reset: its own words
    else if (m.state === 'done') pressed.delete(m.id);
  });
}

/** The card for a system message whose content[0] is the block. */
export function renderProposalCard(msg, { app = null } = {}) {
  listenProposalUpdates(app);
  const el0 = document.createElement('div');
  el0.className = 'chat-msg chat-msg-system chat-vs-notice chat-browser-proposal';
  el0._rawMsg = msg;
  const b = msg.content[0];
  el0.dataset.proposal = String(b.id || '');
  const head = el('div', 'chat-vs-notice-head');
  const ic = document.createElement('span'); ic.className = 'chat-browser-proposal-ic'; ic.innerHTML = UI_ICONS.browserLive || UI_ICONS.info || ''; ic.setAttribute('aria-hidden', 'true');
  head.appendChild(ic);
  head.appendChild(el('span', 'chat-vs-notice-title chat-browser-proposal-title', ''));
  el0.appendChild(head);
  el0.appendChild(el('div', 'chat-browser-proposal-claim', ''));
  el0.appendChild(el('div', 'chat-browser-proposal-evidence chat-status-dim', ''));
  const list = document.createElement('ul'); list.className = 'chat-browser-proposal-plan';
  el0.appendChild(list);
  el0.appendChild(el('div', 'chat-browser-proposal-none', ''));
  el0.appendChild(el('div', 'chat-browser-proposal-state', ''));
  const row = el('div', 'chat-browser-proposal-actions');
  const approve = btn(t('Approve'), () => { const cur = el0._rawMsg && el0._rawMsg.content && el0._rawMsg.content[0]; if (!cur) return; if (!approveArmed(approve)) return; approve.disabled = true; reject.disabled = true; approveProposal(cur).then((ok) => { if (!ok) { approve.disabled = false; reject.disabled = false; } }); }, 'mounts-btn-primary chat-browser-proposal-approve');
  const reject = btn(t('Reject'), () => { const cur = el0._rawMsg && el0._rawMsg.content && el0._rawMsg.content[0]; if (!cur) return; approve.disabled = true; reject.disabled = true; rejectProposal(cur).then((ok) => { if (!ok) { approve.disabled = false; reject.disabled = false; } }); }, 'chat-browser-proposal-reject');
  row.appendChild(approve); row.appendChild(reject);
  el0.appendChild(row);
  patchProposalCard(el0, msg);
  listenArm();
  armNow(approve); // it just APPEARED: armed ARM_MS from now; its first position is read once it is laid out
  requestAnimationFrame(() => { if (approve.isConnected) approve._armTop = approve.getBoundingClientRect().top; });
  return el0;
}
/** THE PATCH (every change of the proposal): the same element, its keyed children's text and the buttons' presence. */
export function patchProposalCard(el0, msg) {
  if (!el0 || !msg || !msg.content || !msg.content[0]) return;
  el0._rawMsg = msg;
  const b = msg.content[0];
  const set = (sel, text) => { const n = el0.querySelector(sel); if (!n) return; const v = text || ''; if (n.textContent !== v) n.textContent = v; n.style.display = v ? '' : 'none'; };
  const L = SW.proposalLines(b);
  el0.dataset.state = String(b.state || '');
  set('.chat-browser-proposal-title', t('VibeSpace · {what}', { what: b.kind === 'site-reset' ? t('The agent proposes clearing a site\'s stored login') : b.state === 'unavailable' ? t('The agent says a site refused its browser') : b.plan && b.plan.kind === 'site' ? t('The agent asks you to let CloakBrowser open {site}', { site: b.site }) : t('The agent proposes switching its browser to CloakBrowser') })); // lane site-reset: + its kind
  set('.chat-browser-proposal-claim', say(L.claim, t));
  set('.chat-browser-proposal-evidence', b.evidence ? t('What it saw: {evidence}', { evidence: b.evidence }) : '');
  // the plan list, keyed by line index — rewritten only where a line's words changed
  const list = el0.querySelector('.chat-browser-proposal-plan');
  if (list) {
    const words = L.plan.map((l) => say(l, t));
    while (list.children.length > words.length) list.lastChild.remove();
    words.forEach((w, i) => { let li = list.children[i]; if (!li) { li = document.createElement('li'); list.appendChild(li); } if (li.textContent !== w) li.textContent = w; });
    list.style.display = words.length ? '' : 'none';
  }
  set('.chat-browser-proposal-none', L.none ? say(L.none, t) : '');
  set('.chat-browser-proposal-state', proposalStateText(b, t));
  const st = el0.querySelector('.chat-browser-proposal-state');
  if (st) st.dataset.state = String(b.state || '');
  // ONE primary (Approve) + a quiet Reject — shown only while they work; "Approve again" after a failed run
  const decidable = b.state === 'open' || b.state === 'failed';
  const row = el0.querySelector('.chat-browser-proposal-actions');
  if (row) row.style.display = decidable ? '' : 'none';
  const ap = el0.querySelector('.chat-browser-proposal-approve');
  const rj = el0.querySelector('.chat-browser-proposal-reject');
  if (ap) {
    const label = b.state === 'failed' ? t('Approve again') : t('Approve');
    const shownNow = decidable && (ap.disabled || ap.textContent !== label); // it (re)appears or changes its words ⇒ armed afresh
    if (ap.textContent !== label) ap.textContent = label;
    ap.disabled = !decidable; ap.title = t('Runs exactly what this card says');
    if (shownNow) armNow(ap);
  }
  if (rj) rj.disabled = !decidable;
}

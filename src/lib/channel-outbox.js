// THE OUTBOX (docs/design-communication-panel.zh.md §9.2, §9.5, §10.1; P3;
// the a4 UI design docs/design-communication-panel-ui.md §4.2 / §4.3).
//
// ONE RECORD, TWO PLACES: the approval card below is rendered INLINE in the
// conversation window (context lives there) and in this Outbox window (the
// queue lives there) — both from the same server store, so they cannot
// disagree. Every fact on the card is the digest's STRUCTURE and the words
// are composed here in the device's language (the identity warning through
// `chanCaps.identityWarningText`, exactly as the composer does).
//
// THE CARD IS FIVE LINES (a1 C1): head (state pill · drafter · age) → the
// text → ONE meta line (why · needs approval · will send as · expires ·
// the sender line) → the identity warning ONCE, only when it warns → actions
// right-aligned with ONE primary (Approve). The outcome sentence and the
// reconcile / receipt facts are a quiet footer. State colour = meaning (C2):
// awaiting accent, sent green, failed red, UNKNOWN AMBER (the one state §9.4
// says is not a failure), rejected neutral.
//
// THE IDENTITY ROW (§9.5): "Will send as <user>" on every card; when the
// adapter's `identityMarking` is not `none` a WARNING beside it, showing the
// adapter's own verbatim sentence (or saying the attribution is unverified —
// `unknown` warns as loudly as `marked`). Honesty is owed to the one pressing
// Approve, never pushed into the recipient's message.
//
// THE OUTBOX WINDOW is a toolbar (summary + an Awaiting | All segment) over
// the cards: Awaiting = the queue; All = grouped by STATE with a dot per head
// (awaiting · unknown · failed · sent · rejected) so an `unknown` outcome is
// never buried under sent ones (the element borrowed from direction B).
//
// Every vendor / agent string is textContent (fence 5): a proposal's text is
// an agent's, the reason is an adapter's, the why is a label — none of it
// reaches innerHTML.
//
// 2026-09-27: WITHDRAWN — the drafting agent took its proposal back: a dim,
// settled card ("Withdrawn by <agent> · <why>"), no buttons. THE DELIVERY
// CHOICE ON THE ACTION (owner ruling): an agent's draft is decided with a
// SPLIT button — "Approve ▾" / "Reject ▾" — whose primary is this device's
// last-used choice ("tell the agent with your next message", free, or "wake
// the agent now", a started turn) and whose menu offers both (+ "Approve with
// edits…"). THE FATE LINE says whether the agent knows yet ("Handed to <agent>
// at 14:02" / "Waiting for <agent>'s next message" / "<agent> is gone —
// receipt kept"). CARDS ARE KEYED (`data-proposal` + a signature): a
// broadcast re-renders only a card whose record changed, a fate-only change
// patches the fate line in place, and a card the user is editing is left
// alone while its record stands.
//
// r6 verify (2026-09-28, "what you approve is what runs"): the ENVELOPE is one
// fact per wrapping line (where · To · Cc · Subject — never a clipped
// ellipsis), a reply says WHAT it answers ("In reply to <author> — <excerpt>")
// and, for mail, WHO receives it (resolved when it was proposed, sent
// verbatim); an invisible direction / zero-width character in the text is a
// visible mark; a card that just appeared or MOVED is inert for `P.ARM_MS`
// (`placeArmed`) and Approve posts `shown` = the PURE digest of the record the
// card showed — the engine refuses anything else (`changed-since-shown`).
//
// B-f467 (userW, 2026-10-03: the cards have "no visual centre of gravity —
// some things I want to see at a glance"; he pointed at the channel list):
// THE OUTBOX WINDOW LISTS ONE ROW PER PROPOSAL in the channel list's row
// grammar — the conversation's avatar wearing its account badge · WHO
// receives it and WHERE (+ the account at ≥ 2 of a vendor) · the time /
// the state pill · the first line of the text · the primary ("Approve…" on
// an awaiting one). The FULL CARD — this same renderer, the one
// implementation — opens under its row on click or Enter. "Approve…" opens
// the card and focuses ITS Approve: a decision is taken where the whole text,
// the identity warning and the delivery choice are drawn (§9.5, verify r3 —
// the approval rules are unchanged). The inline section keeps cards.
import { fetchJson, showToast, showContextMenu } from './utils.js';
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerCommand, registerMenuItem } from './contributions.js';
import { icon, el, btn, convAvatar } from './channel-chrome.js';
import { accountBadges } from './channel-avatar.js';   // B-f467: the row's avatar wears its account badge (B-5fe1)
import * as chanCaps from '../channel-caps.js';
// PURE, bundled (a3 i18n): the proposal's OUTCOME as structure → words here.
import * as P from '../channel-policy.js';
// a3 i18n: a route failure is worded by its CODE, never by the engine's sentence.
import { routeErrorText } from './channel-words.js';

const ICON = svgIcon16('<path d="M2.5 4.5h11v8h-11z"/><path d="M2.5 4.5l5.5 4 5.5-4"/><path d="M8 2v3"/>');
const JSON_HDR = { 'Content-Type': 'application/json' };
/** The Outbox's All view: the order states are grouped in (attention first). */
const STATE_ORDER = ['awaiting-approval', 'sending', 'unknown', 'failed', 'sent', 'rejected', 'expired', 'withdrawn', 'proposed'];
const STATE_TONE = { 'awaiting-approval': 'attn', sending: 'attn', unknown: 'warn', failed: 'bad', sent: 'ok', rejected: 'idle', expired: 'idle', withdrawn: 'idle', proposed: 'idle' };
/** This device's last-used receipt delivery (the split buttons' primary). */
const DELIVER_KEY = 'vibespace.channels.receiptDeliver';
export function rememberedDelivery() { try { return localStorage.getItem(DELIVER_KEY) === 'wake-now' ? 'wake-now' : 'next-turn'; } catch { return 'next-turn'; } }
function rememberDelivery(v) { try { localStorage.setItem(DELIVER_KEY, v === 'wake-now' ? 'wake-now' : 'next-turn'); } catch { } }
/** THE PRESS DOES WHAT THE BUTTON SAYS (verify r3, 2026-09-27): a primary
 *  Approve's delivery is read off the button's OWN `data-deliver` — the one
 *  fact its label was worded from — never off the remembered choice at click
 *  time. Reproduced: "Reject with a reason and wake now" picked on card A
 *  (the box opens, nothing is posted, no broadcast), then card B's primary
 *  still reading "Approve — tell the agent with your next message" posted
 *  `deliver: wake-now, expectWakes: 1` — a billed turn the words said was
 *  free. The remembered choice reaches every visible primary through
 *  `relabelPrimaries` the moment it moves. */
export function pressedDelivery(button) { return button && button.dataset && button.dataset.deliver === 'wake-now' ? 'wake-now' : 'next-turn'; }
/** Every visible agent-draft primary on this page follows the remembered choice, words and fact together. */
export function relabelPrimaries(want = rememberedDelivery(), root = document) {
  for (const b of root.querySelectorAll('.chan-prop button[data-approve][data-deliver]')) {
    if (b.dataset.deliver === want) continue;
    b.dataset.deliver = want;
    const card = b.closest('.chan-prop');
    b.textContent = approveLabel(want, { edited: !!(card && card.querySelector('.chan-prop-edit')) });
  }
}
/** The Approve words for a delivery choice — the COST in plain language. */
export function approveLabel(deliver, { edited = false } = {}) {
  if (deliver === 'wake-now') return edited ? t('Approve edited and wake the agent now (starts a turn)') : t('Approve and wake the agent now (starts a turn)');
  return edited ? t('Approve edited — tell the agent with your next message') : t('Approve — tell the agent with your next message');
}
/** The Reject menu's words and the reject box's button. */
export function rejectLabel(deliver, { box = false } = {}) {
  if (deliver === 'wake-now') return box ? t('Reject and wake now') : t('Reject with a reason and wake now');
  return box ? t('Reject') : t('Reject — tell on its next message');
}
/** Decided-and-closed cards the inline section keeps (the newest N). */
const INLINE_RECENT = 2;

/** O1 (r6 verify, 2026-09-28): `s` into `node` as text, each invisible direction / zero-width character drawn as a
 *  visible mark (`U+202E`) — never the character itself, so the line reads in the order it is SENT. Returns the
 *  marks' names (distinct). textContent only. */
function revealInto(node, s) {
  const names = [];
  for (const seg of P.revealSegments(s)) {
    if (seg.hidden) {
      const m = el('span', 'chan-prop-hidden', seg.hidden);
      m.title = t('An invisible character that changes how the text reads — it is sent as it is');
      node.appendChild(m);
      if (!names.includes(seg.hidden)) names.push(seg.hidden);
    } else node.appendChild(document.createTextNode(seg.text));
  }
  return names;
}
/** F4 (r6 verify): ONE envelope fact per line — its label, then its value, wrapping, never clipped. */
function envRow(cls, label, value) {
  const row = el('div', `chan-prop-env ${cls}`);
  row.appendChild(el('span', 'chan-prop-env-k', label));
  const v = el('span', 'chan-prop-env-v');
  revealInto(v, value);
  row.appendChild(v);
  return row;
}
/** F1 / F3 (r6 verify): what the reply ANSWERS (its author + an excerpt of the stored message) and, where the
 *  adapter derives them from it, WHO RECEIVES it — the recipients resolved when it was proposed, sent verbatim. */
function appendReplyTarget(card, p) {
  const a = p.replyAnchor;
  if (a && a.vendorId) {
    const au = a.author || {};
    const who = au.isSelf ? t('you') : (au.name || au.id || '');
    const row = el('div', 'chan-prop-env chan-prop-anchor');
    row.appendChild(el('span', 'chan-prop-env-k', t('In reply to')));
    const v = el('span', 'chan-prop-env-v');
    if (who) { const w = el('span', 'chan-prop-anchor-who'); revealInto(w, who); v.appendChild(w); v.appendChild(document.createTextNode(' — ')); }
    revealInto(v, a.excerpt || '');
    row.appendChild(v);
    row.title = t('message {id}', { id: a.vendorId });
    card.appendChild(row);
  }
  const e = p.replyEnvelope;
  if (e && e.to) {
    // B-a085: EVERY recipient before Approve — a reply-all's To and Cc in full, and apart the addresses the DRAFTER
    // added (`reply --cc`) beside the thread's own people
    const toRow = envRow('chan-prop-to', e.all ? t('To (reply all)') : t('To'), e.to);
    if (e.all) toRow.dataset.replyAll = '1';
    card.appendChild(toRow);
    if (e.cc) card.appendChild(envRow('chan-prop-cc', t('Cc'), e.cc));
    if (Array.isArray(e.added) && e.added.length) card.appendChild(envRow('chan-prop-added', t('Cc added by the drafter'), e.added.join(', ')));
    if (e.subject) card.appendChild(envRow('chan-prop-subject', t('Subject'), e.subject));
  }
}
/** F6 (r6 verify): a card that just appeared or moved takes no decision for `P.ARM_MS` — it LOOKS inert
 *  (`chan-prop-arming`) and a person's click on it does nothing but say so; the verdict is PURE (`P.armVerdict`). */
const ARMING_TITLE = () => t('Just appeared or moved — read it first, then decide');
function armCard(card, at = Date.now()) {
  card.dataset.armedAt = String(at + P.ARM_MS);
  card.classList.add('chan-prop-arming');
  const act = card.querySelector(':scope > .chan-prop-actions');
  if (act) act.title = ARMING_TITLE();
  clearTimeout(card._armTimer);
  card._armTimer = setTimeout(() => {
    if ((Number(card.dataset.armedAt) || 0) > Date.now()) return;
    card.classList.remove('chan-prop-arming');
    if (act && act.title === ARMING_TITLE()) act.title = '';
  }, P.ARM_MS + 30);
}
/** May THIS event decide on `card` now? A held click nudges the card (the look says why) and does nothing else. */
export function cardArmed(card, ev) {
  const v = P.armVerdict({ armedAt: Number(card && card.dataset && card.dataset.armedAt) || 0, now: Date.now(), trusted: !(ev && ev.isTrusted === false) });
  if (!v.armed && card) {
    card.classList.add('chan-prop-arming-nudge');
    setTimeout(() => card.classList.remove('chan-prop-arming-nudge'), 400);
  }
  return v.armed;
}

const stamp = (ms) => {
  if (!ms) return '';
  const d = new Date(Number(ms));
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The state chip's words. */
export function stateLabel(state) {
  switch (state) {
    case 'awaiting-approval': return t('awaiting your approval');
    case 'sending': return t('sending…');
    case 'sent': return t('sent');
    case 'failed': return t('failed');
    case 'unknown': return t('outcome unknown');
    case 'rejected': return t('rejected');
    case 'expired': return t('expired');
    case 'withdrawn': return t('withdrawn');
    case 'proposed': return t('proposed');
    default: return String(state || '');
  }
}
/** Why the policy sent this to review — the closed reason set, in words. */
export function reasonLabel(r) {
  switch (r) {
    case 'channel-policy': return t('this channel requires review');
    case 'links': return t('the text carries a link');
    case 'attachments': return t('it carries an attachment');
    case 'off-hours': return t('outside working hours');
    case 'authority': return t('the drafter holds draft authority only');
    case 'reaction-policy': return t('agent reactions need your approval on this account');
    default: return String(r || '');
  }
}
/** The drafter, in words. */
function drafterLabel(p) {
  const d = p.draftedBy || {};
  if (d.kind === 'agent') return t('drafted by {who}', { who: d.name || d.id || t('an agent') });
  return t('drafted by you');
}

async function post(pathname, body) {
  const r = await fetchJson(pathname, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body || {}) });
  if (!r || r.error) { showToast(routeErrorText(r), { type: 'error' }); return null; }
  return r;
}

/**
 * ONE approval card for ONE proposal. `opts.compact` = the inline form
 * (no adapter/conversation line — the window it sits in IS the
 * conversation). Decisions POST and let the broadcast repaint; nothing here
 * waits for the echo (the multi-client law).
 */
export function renderProposalCard(app, p, { compact = false } = {}) {
  const card = el('div', `chan-prop chan-prop-${p.state}`);
  card.dataset.proposal = p.id;
  // ── head: state pill · drafter · age ──
  const head = el('div', 'chan-prop-head');
  head.appendChild(el('span', `chan-prop-state chan-prop-state-${p.state}`, stateLabel(p.state)));
  head.appendChild(el('span', 'chan-prop-who', drafterLabel(p)));
  head.appendChild(el('span', 'chan-prop-when', stamp(p.updatedAt || p.at)));
  card.appendChild(head);
  // F4 (r6 verify, 2026-09-28): the envelope is ONE FACT PER LINE — where, then To / Cc / Subject (a compose)
  // or what it answers + its recipients (a reply) — each wrapping, nothing clipped (a 70-character subject used
  // to push the Cc out of a one-line ellipsis with no tooltip)
  if (!compact) {
    const where = el('div', 'chan-prop-where');
    if (p.compose) {
      // R4 (B-6acc): a NEW message — its envelope, and a link only once the vendor named its thread
      // B-f216 (userW pressed it 17 times): the envelope is WORDS — no link look without a target
      where.appendChild(el('span', 'chan-prop-env', `${p.adapterLabel || p.adapterId} · ${t('New message')}`));
      if (p.convId) { const link = el('a', 'chan-prop-link', t('Open the conversation')); link.href = '#'; link.onclick = (ev) => { ev.preventDefault(); app.openChannel(p.adapterId, p.convId); }; where.appendChild(document.createTextNode(' · ')); where.appendChild(link); }
    } else {
      const link = el('a', 'chan-prop-link', `${p.adapterLabel || p.adapterId} · ${p.title || p.convId}`);
      link.href = '#';
      link.onclick = (ev) => { ev.preventDefault(); app.openChannel(p.adapterId, p.convId); };
      where.appendChild(link);
    }
    card.appendChild(where);
  }
  if (p.compose) {
    card.appendChild(envRow('chan-prop-to', t('To'), (p.compose.to || []).join(', ')));
    if ((p.compose.cc || []).length) card.appendChild(envRow('chan-prop-cc', t('Cc'), p.compose.cc.join(', ')));
    card.appendChild(envRow('chan-prop-subject', t('Subject'), p.compose.subject || ''));
  } else appendReplyTarget(card, p);
  // lane channel-threads (spec §5.2) + 2026-09-28 THE PLACEMENT: a reply says WHERE it lands, above its text — a
  // quote shown in the chat, a reply in the thread, a thread reply also shown in the chat (PURE `placementText`
  // over the placement read through its alias — a proposal stored before the enum says `inThread`); a plain message
  // says nothing. ONE QUOTE (the .197 integration, pairing r6 × threads): the "In reply to" row above quotes the
  // answered message with every hidden character marked, so the placement line then names only WHERE — its own quote
  // is drawn only for a proposal with no anchor row (one stored before the anchor existed)
  const placement = P.placementOf(p);
  const anchored = !!(p.replyAnchor && p.replyAnchor.vendorId);
  const placeLine = P.placementText(placement, { t, quote: anchored ? null : (p.replyQuote || p.threadQuote || null) });
  if (placeLine) {
    const pe = el('div', 'chan-prop-thread chan-prop-place', placeLine);
    pe.dataset.placement = placement;
    card.appendChild(pe);
  }
  // ── THE BODY — an agent's text, plain (or the editor while editing); O1: every invisible direction / zero-width
  // character is a visible mark, and the card says so once; a REACTION's sentence (spec §5.3) ──
  const reaction = p.kind === 'reaction' && p.reaction ? p.reaction : null;
  const body = el('div', 'chan-prop-text' + (reaction ? ' chan-prop-reaction' : ''));
  let hiddenMarks = [];
  if (reaction) body.textContent = reactionCardText(p);
  else hiddenMarks = revealInto(body, p.text || '');
  card.appendChild(body);
  if (hiddenMarks.length) {
    const hw = el('div', 'chan-prop-idwarn chan-prop-hiddenwarn');
    hw.appendChild(icon('alert', 11));
    hw.appendChild(el('span', '', t('The text carries invisible characters that change how it reads ({list}) — each is shown as a mark and is sent as it is', { list: hiddenMarks.join(', ') })));
    card.appendChild(hw);
  }
  if (p.edited && p.originalText && p.originalText !== p.text) {
    const orig = el('details', 'chan-prop-orig');
    orig.appendChild(el('summary', '', t('Original text (before your edit)')));
    const origText = el('div', 'chan-prop-text chan-prop-text-orig');
    revealInto(origText, p.originalText);
    orig.appendChild(origText);
    card.appendChild(orig);
  }
  // ── ONE meta line: why · the policy verdict · the identity · expiry · the sender line ──
  const meta = el('div', 'chan-prop-meta');
  // WHY — a structured reference the panel can link, never an agent's sentence.
  if (p.why && (p.why.label || p.why.id)) {
    const why = el('span', 'chan-prop-why', t('Why: {ref}', { ref: p.why.label || p.why.id }));
    if (p.why.kind === 'record' && p.why.id) why.title = t('message {id}', { id: p.why.id });
    meta.appendChild(why);
  }
  // THE POLICY VERDICT — why it waits, or that it went directly.
  if (p.policy) {
    const pol = el('span', 'chan-prop-policy');
    if (p.policy.mode === 'direct') pol.textContent = t('Sent directly: the channel policy is "direct" and no guard applied.');
    else pol.textContent = t('Needs approval: {why}', { why: (p.policy.reasons || []).map(reasonLabel).join('; ') || t('review') });
    if (p.policy.detail && p.policy.detail.unknownPolicy) pol.textContent += ' ' + t('(the stored policy value was not understood — review, fail closed)');
    if (p.policy.detail && p.policy.detail.guardsUnparseable) pol.textContent += ' ' + t('(a guard setting could not be read: {why} — review, fail closed)', { why: p.policy.detail.guardsUnparseable });
    meta.appendChild(pol);
  }
  // THE IDENTITY ROW (§9.5): the fact on the meta line; the warning below, once.
  const asWho = p.sendAs === 'bot' ? t('the bot') : t('you');
  meta.appendChild(el('span', 'chan-prop-identity', reaction ? t('Reacts as you') : t('Will send as {who}', { who: asWho })));
  // r3: approving a send that starts a turn WAKES the agent — the cost, said before the click
  if (p.wakes && p.state === 'awaiting-approval') meta.appendChild(el('span', 'chan-prop-wakes chan-warn', t('Approving wakes this agent: 1 billed turn')));
  if (p.state === 'awaiting-approval' && p.ttlAt) meta.appendChild(el('span', 'chan-prop-ttl', t('Expires unapproved at {when}', { when: stamp(p.ttlAt) })));
  // THE SENDER HONESTY LINE (§9.5, P4): said BEFORE the approval when the
  // channel's switch is on, and recorded after the send. The line itself is
  // the adapter-neutral sentence the engine will append, shown verbatim.
  if (p.honestyLine) {
    const hl = el('span', 'chan-prop-honesty');
    hl.appendChild(el('span', '', (p.state === 'sent' ? t('A sender line was appended:') : t('A sender line will be appended (this channel\'s option is on):')) + ' '));
    hl.appendChild(el('code', 'chan-prop-honesty-line', p.honestyLine));
    meta.appendChild(hl);
  }
  card.appendChild(meta);
  // honesty is owed to the one pressing Approve (§9.5): the warning is drawn on the card that
  // still HAS an Approve — a decided card keeps its identity fact on the meta line and stops
  // repeating the warning (a1 C1: five cards, five amber walls; a2 §3: ONE warning in the Outbox)
  const deciding = p.state === 'awaiting-approval' || p.state === 'sending';
  const warnText = deciding && p.identityWarning ? chanCaps.identityWarningText(p.identityWarning, { t }) : null;
  if (warnText) {
    const w = el('div', 'chan-prop-idwarn');
    w.appendChild(icon('alert', 11));
    w.appendChild(el('span', '', warnText));
    card.appendChild(w);
  }
  // ── OUTCOME — the server's STRUCTURE worded here (a3 i18n): the sentence is
  // the device's, the adapter's / user's verbatim rides inside it, never as a
  // second English line. A digest from an older server (no `outcome`) still
  // shows its contract string rather than nothing. ──
  const outcome = p.outcome || P.outcomeOf(p);
  const outcomeLine = outcome ? P.outcomeText(outcome, { t, errorCodeText: chanCaps.errorCodeText, sendWhyText: chanCaps.sendWhyText }) : (p.reason || '');
  if (outcomeLine) card.appendChild(el('div', `chan-prop-reason${p.state === 'unknown' ? ' chan-warn' : ''}`, outcomeLine));
  if (p.state === 'unknown') card.appendChild(el('div', 'chan-prop-reason chan-warn', t('This send is never retried automatically. Check the conversation on the platform before proposing it again.')));
  // ── the quiet footer: reconcile facts, the receipt ──
  // RECONCILE (§9.4, P4): what the last check answered, and the control —
  // offered only when the adapter's declared idempotency can answer at all.
  if (p.reconcile && p.reconcile.n) {
    const ans = p.reconcile.lastAnswer === 'landed' ? t('it landed') : p.reconcile.lastAnswer === 'not-landed' ? t('it did not land') : p.reconcile.lastAnswer === 'not-available' ? t('this channel cannot be checked by the machine') : t('still unknown');
    card.appendChild(el('div', 'chan-prop-foot chan-prop-reconcile', t('Checked {n}× — last answer: {answer} ({when})', { n: p.reconcile.n, answer: ans, when: stamp(p.reconcile.lastAt) }) + (p.reconcile.lastWhy ? ` — ${p.reconcile.lastWhy}` : '')));
  }
  if (p.state === 'unknown' && !p.canReconcile && (p.reconcileWhy || p.reconcileWhyCode)) {
    // the refusal is a CODE (worded); the sentence beside it is the fallback
    card.appendChild(el('div', 'chan-prop-foot chan-prop-reason', t('Cannot be checked by the machine: {why}', { why: P.reconcileWhyText(p.reconcileWhyCode, { t }) || p.reconcileWhy })));
  }
  // THE FATE LINE (2026-09-27): does the drafting agent know yet? Its own
  // element, patched in place when only the fate moved (patchFate)
  const fateText = fateLineText(p);
  if (fateText) {
    const f = el('div', 'chan-prop-foot chan-prop-receipt chan-prop-fate', fateText);
    f.dataset.fate = (P.receiptFateOf(p) || {}).kind || '';
    card.appendChild(f);
  }
  // ── actions: right-aligned, ONE primary ──
  if (p.state === 'unknown' && p.canReconcile) {
    const act = el('div', 'chan-prop-actions');
    const chk = btn(t('Check outcome'), null);
    chk.dataset.reconcile = '1';
    chk.onclick = async () => {
      chk.disabled = true;
      const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/reconcile`, {});
      if (!r) { chk.disabled = false; return; }
      showToast(r.resolved ? (r.state === 'sent' ? t('It landed — marked as sent') : t('It never landed — marked as failed')) : t('Still unknown: {why}', { why: r.reason || t('no evidence either way') }), { type: r.resolved ? 'info' : 'warn' });
    };
    act.appendChild(chk);
    card.appendChild(act);
  }
  // DECISIONS — only while awaiting. An AGENT's draft is decided with the
  // split buttons (how it hears of the decision is chosen right here); a
  // user's own draft has nobody to tell — plain Approve / Reject….
  if (p.state === 'awaiting-approval') {
    const act = el('div', 'chan-prop-actions');
    const toAgent = !!(p.draftedBy && p.draftedBy.kind === 'agent');
    let editor = null;
    const reject = btn(t('Reject…'), null);
    reject.dataset.reject = '1';
    const edit = btn(t('Edit…'), null);
    edit.dataset.edit = '1';
    // a reaction has no text to edit and never wakes anyone (spec §5.3): plain Reject / Approve, the receipt rides the next turn
    if (reaction) {
      const approveR = btn(toAgent ? approveLabel('next-turn') : t('Approve'), null, 'mounts-btn-primary');
      approveR.dataset.approve = '1';
      approveR.dataset.deliver = 'next-turn';
      approveR.onclick = async () => {
        for (const b of act.querySelectorAll('button')) b.disabled = true;
        const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/approve`, { expectWakes: 0, ...(toAgent ? { deliver: 'next-turn' } : {}) });
        if (!r) { for (const b of act.querySelectorAll('button')) b.disabled = false; return; }
        const sent = !!(r.proposal && r.proposal.state === 'sent');
        const o = r.proposal ? (r.proposal.outcome || P.outcomeOf(r.proposal)) : null;
        showToast(sent ? t('Reaction added') : t('Not sent: {why}', { why: (o && P.outcomeText(o, { t, errorCodeText: chanCaps.errorCodeText })) || routeErrorText(r) }), { type: sent ? 'info' : 'error' });
      };
      reject.onclick = () => {
        const old = card.querySelector('.chan-prop-rejectbox');
        if (old) old.remove();
        const box = el('div', 'chan-prop-rejectbox');
        const inp = el('input', 'chan-opt-input');
        inp.type = 'text'; inp.placeholder = t('Reason (the agent reads it)');
        const go = btn(t('Reject'), null, 'mounts-btn-primary');
        go.onclick = async () => {
          go.disabled = true;
          const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/reject`, { reason: inp.value, ...(toAgent ? { deliver: 'next-turn', expectWakes: 0 } : {}) });
          if (!r) { go.disabled = false; return; }
          showToast(t('Rejected'));
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
        box.append(inp, go);
        act.after(box);
        inp.focus();
      };
      act.append(reject, approveR);
      card.appendChild(act);
      return card;
    }
    const approve = btn(toAgent ? approveLabel(rememberedDelivery()) : t('Approve'), null, 'mounts-btn-primary');
    approve.dataset.approve = '1';
    if (toAgent) approve.dataset.deliver = rememberedDelivery();
    const lock = (on) => { for (const b of act.querySelectorAll('button')) b.disabled = on; };
    const doApprove = async (deliver) => {
      lock(true);
      const text = editor ? editor.value : null;
      // r3: a send that starts a turn echoes the count the card SAID (`expectWakes`) — and a receipt woken now is one more
      const woke = toAgent && deliver === 'wake-now' ? 1 : 0;
      // r6 verify F6: `shown` = the digest of the record THIS card was drawn from — the engine refuses the
      // approval (409 changed-since-shown, nothing sent) when the proposal is no longer that record
      const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/approve`, { ...(text !== null && text !== p.text ? { text } : {}), expectWakes: (Number(p.wakes) || 0) + woke, ...(toAgent ? { deliver } : {}), shown: P.shownDigest(p) });
      if (!r) { lock(false); return; }
      const sent = !!(r.proposal && r.proposal.state === 'sent');
      const o = r.proposal ? (r.proposal.outcome || P.outcomeOf(r.proposal)) : null;
      showToast(sent ? t('Sent') : t('Not sent: {why}', { why: (o && P.outcomeText(o, { t, errorCodeText: chanCaps.errorCodeText, sendWhyText: chanCaps.sendWhyText })) || routeErrorText(r) }), { type: sent ? 'info' : 'error' });
      if (woke && r.proposal && r.proposal.receiptChoicePaced) showToast(t('The agent was not woken (paced: {why}) — it hears with its next message', { why: r.proposal.receiptChoicePaced }), { type: 'warn' });
    };
    approve.onclick = (ev) => { if (cardArmed(card, ev)) doApprove(toAgent ? pressedDelivery(approve) : null); };   // verify r3: what the button SAYS; r6 F6: armed only
    edit.onclick = () => {
      if (editor) return;
      editor = el('textarea', 'chan-prop-edit');
      editor.value = p.text || '';
      body.replaceWith(editor);
      approve.textContent = toAgent ? approveLabel(pressedDelivery(approve), { edited: true }) : t('Approve edited');
      edit.disabled = true;
      editor.focus();
    };
    const openReject = (deliver) => {
      const old = card.querySelector('.chan-prop-rejectbox');
      if (old) old.remove();
      const box = el('div', 'chan-prop-rejectbox');
      const inp = el('input', 'chan-opt-input');
      inp.type = 'text'; inp.placeholder = t('Reason (the agent reads it)');
      const go = btn(toAgent ? rejectLabel(deliver, { box: true }) : t('Reject'), null, 'mounts-btn-primary');
      if (toAgent) go.dataset.deliver = deliver;
      go.onclick = async (ev) => {
        if (!cardArmed(card, ev)) return;
        go.disabled = true;
        const woke = toAgent && deliver === 'wake-now' ? 1 : 0;
        const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/reject`, { reason: inp.value, ...(toAgent ? { deliver, expectWakes: woke } : {}) });
        if (!r) { go.disabled = false; return; }
        showToast(t('Rejected'));
        if (woke && r.proposal && r.proposal.receiptChoicePaced) showToast(t('The agent was not woken (paced: {why}) — it hears with its next message', { why: r.proposal.receiptChoicePaced }), { type: 'warn' });
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
      box.append(inp, go);
      act.after(box);
      inp.focus();
    };
    reject.onclick = (ev) => { if (cardArmed(card, ev)) openReject(toAgent ? rememberedDelivery() : null); };
    /** THE ▾ HALF of a split button: the menu of delivery choices. */
    const chevron = (kind, items) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'mounts-btn chan-split-more' + (kind === 'approve' ? ' mounts-btn-primary' : '');
      c.dataset.more = kind;
      c.title = kind === 'approve' ? t('More ways to approve') : t('More ways to reject');
      c.setAttribute('aria-label', c.title);
      c.appendChild(icon('chevronDown', 11));
      c.onclick = (ev) => {
        ev.stopPropagation();
        if (!cardArmed(card, ev)) return;
        const r = c.getBoundingClientRect();
        // ONE class name (the item class is derived from it); the modifier after
        const menu = showContextMenu(r.left, r.bottom + 2, items());
        if (menu) { menu.classList.add('chan-split-menu'); menu.dataset.menu = kind; }
      };
      return c;
    };
    if (toAgent) {
      // a pick is remembered AND said on every primary on this page at once (verify r3)
      const pick = (v) => { rememberDelivery(v); relabelPrimaries(v); };
      const approveItems = () => [
        { label: approveLabel('next-turn', { edited: !!editor }), action: () => { pick('next-turn'); doApprove('next-turn'); } },
        { label: approveLabel('wake-now', { edited: !!editor }), action: () => { pick('wake-now'); doApprove('wake-now'); } },
        ...(editor ? [] : [{ separator: true }, { label: t('Approve with edits…'), action: () => edit.onclick() }]),
      ];
      const rejectItems = () => [
        { label: rejectLabel('next-turn'), action: () => { pick('next-turn'); openReject('next-turn'); } },
        { label: rejectLabel('wake-now'), action: () => { pick('wake-now'); openReject('wake-now'); } },
      ];
      const rs = el('span', 'chan-split'); rs.append(reject, chevron('reject', rejectItems));
      const as = el('span', 'chan-split'); as.append(approve, chevron('approve', approveItems));
      act.append(rs, edit, as);
    } else act.append(reject, edit, approve);
    card.appendChild(act);
    armCard(card);
  }
  return card;
}

/** A reaction proposal's sentence (spec §5.3): "{agent} wants to react {glyph} to {author}: "{quote}"" — the glyph is
 *  CONTENT (text emoji, or `:key:` when the vocabulary has no glyph), every part textContent. */
export function reactionCardText(p) {
  const x = (p && p.reaction) || {};
  const d = (p && p.draftedBy) || {};
  const agent = d.kind === 'agent' ? (d.name || d.id || t('an agent')) : t('you');
  const glyph = x.glyph || `:${x.key || '?'}:`;
  const q = x.quote || {};
  return x.op === 'remove'
    ? t('{agent} wants to remove the reaction {glyph} from {author}: "{quote}"', { agent, glyph, author: q.author || '?', quote: q.text || '' })
    : t('{agent} wants to react {glyph} to {author}: "{quote}"', { agent, glyph, author: q.author || '?', quote: q.text || '' });
}
/** The fate line's words for one proposal ('' = none). */
function fateLineText(p) {
  const f = P.receiptFateOf(p);
  return f ? P.receiptFateText(f, { t, stamp: fateStamp, refusalText: (c) => chanCaps.wakeRefusalText(c, { t }) }) : '';
}
/** "14:02" today, "09-26 14:02" on another day (the owner's own example). */
function fateStamp(ms) {
  const d = new Date(Number(ms)), n = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === n.toDateString() ? hm : `${stamp(ms)}`;
}
/** A card's signature WITHOUT its fate (a fate-only change patches the line). */
function cardSig(p, compact) {
  const q = { ...p };
  delete q.receiptDelivery; delete q.receiptDrainedAt; delete q.receiptDrainedHow; delete q.receiptEvictedAt; delete q.receiptEvictedHeld;
  return JSON.stringify([q, !!compact, rememberedDelivery()]);
}
const fateSig = (p) => JSON.stringify([p.receiptDelivery || null, p.receiptDrainedAt || null, p.receiptDrainedHow || null, p.receiptEvictedAt || null]);
/** Is the user in the middle of deciding on this card (an editor or a reject box open)? */
const inUse = (card) => !!card.querySelector('.chan-prop-edit, .chan-prop-rejectbox');
/**
 * THE KEYED CARD FOR ONE PROPOSAL: the existing element when its record did
 * not change (its fate line patched in place when only the fate moved; left
 * alone while the user edits it and it still awaits), else a fresh one.
 */
function keyedCard(app, p, prev, { compact = false } = {}) {
  const sig = cardSig(p, compact);
  if (prev && (prev.dataset.sig === sig || (inUse(prev) && p.state === 'awaiting-approval' && prev.dataset.state === 'awaiting-approval'))) {
    if (prev.dataset.fateSig !== fateSig(p)) {
      const text = fateLineText(p);
      let line = prev.querySelector(':scope > .chan-prop-fate');
      if (text) {
        if (!line) { line = el('div', 'chan-prop-foot chan-prop-receipt chan-prop-fate'); const act = prev.querySelector(':scope > .chan-prop-actions'); if (act) prev.insertBefore(line, act); else prev.appendChild(line); }
        if (line.textContent !== text) line.textContent = text;
        line.dataset.fate = (P.receiptFateOf(p) || {}).kind || '';
      } else if (line) line.remove();
      prev.dataset.fateSig = fateSig(p);
    }
    // verify r2 (round 1 LOW 5): a card left alone while the user edits it keeps
    // its primary Approve; when this device's remembered choice moved meanwhile
    // (another card's menu), the label followed the OLD choice while the click
    // does the new one — patch the words in place, the editor untouched
    const want = rememberedDelivery();
    const approveBtn = prev.querySelector(':scope > .chan-prop-actions button[data-approve]');
    if (approveBtn && p.draftedBy && p.draftedBy.kind === 'agent' && approveBtn.dataset.deliver !== want) {
      approveBtn.dataset.deliver = want;
      approveBtn.textContent = approveLabel(want, { edited: !!prev.querySelector('.chan-prop-edit') });
    }
    return prev;
  }
  const card = renderProposalCard(app, p, { compact });
  card.dataset.sig = sig;
  card.dataset.fateSig = fateSig(p);
  card.dataset.state = p.state;
  return card;
}
/** Put `nodes` into `container` in order, moving a node only when it is out of place. */
function placeNodes(container, nodes) {
  const want = new Set(nodes);
  for (const c of [...container.children]) if (!want.has(c)) c.remove();
  nodes.forEach((n, i) => { if (container.children[i] !== n) container.insertBefore(n, container.children[i] || null); });
}
/** F6 (r6 verify): `placeNodes`, then every awaiting card that is NEW here or whose top MOVED (a card inserted or
 *  grown above it — the newest-first order puts a new or replacing proposal on top) is ARMED again: it was not where
 *  the pointer found it. The verdict is PURE (`P.rearmVerdict`). */
function placeArmed(container, nodes) {
  const isCard = (n) => n && n.classList && n.classList.contains('chan-prop');
  const before = new Map();
  for (const c of container.children) if (isCard(c)) before.set(c, c.getBoundingClientRect().top);
  placeNodes(container, nodes);
  const at = Date.now();
  for (const n of nodes) {
    if (!isCard(n) || !n.querySelector(':scope > .chan-prop-actions button[data-approve]')) continue;
    if (P.rearmVerdict({ isNew: !before.has(n), prevTop: before.get(n), top: n.getBoundingClientRect().top })) armCard(n, at);
  }
}

/** B-f467: a proposal's conversation, by the ladder name proposalView put on it NOW (③ the id only when nothing is known). */
const convNameOf = (p) => p.title || p.convId || '';
/** B-f467: WHO receives a proposal and WHERE it lands — `{who, where}` (either may be ''). A compose: its recipients,
 *  then its subject (or "New message"); a reply: the recipients the adapter resolved (mail), then the conversation. */
export function rowWhoWhere(p) {
  if (p && p.compose) return { who: (p.compose.to || []).join(', '), where: p.compose.subject || t('New message') };
  const e = (p && p.replyEnvelope) || null;
  return { who: e && e.to ? String(e.to) : '', where: convNameOf(p || {}) };
}
/** B-f467: the first line of what would be sent (a reaction: its sentence). */
export function rowFirstLine(p) {
  if (p && p.kind === 'reaction' && p.reaction) return reactionCardText(p);
  return String((p && p.text) || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
}
/**
 * B-f467: ONE ROW FOR ONE PROPOSAL (the Outbox window). `badge` = its account's (channel-avatar.js accountBadges);
 * `open` = its full card is drawn under it; `onToggle(id)` / `onReview(id)` = the window's (a kept row's handlers
 * call them with the id, never a stale record). Every string is textContent; the text's hidden characters are marks.
 */
export function renderProposalRow(app, p, { badge = null, open = false, onToggle = null, onReview = null } = {}) {
  const row = el('div', `chan-orow chan-orow-${p.state}`);
  row.dataset.orow = p.id;
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  const { who, where } = rowWhoWhere(p);
  row.appendChild(convAvatar({ key: p.convId ? `${p.adapterId}/${p.convId}` : `${p.adapterId}/compose`, title: who || where, kind: p.compose ? 'thread' : (p.convKind || ''), badge }, null, 'chan-orow-av'));
  const line = el('div', 'chan-orow-line');
  const title = el('span', 'chan-orow-title');
  if (who) title.appendChild(el('span', 'chan-orow-who', who));
  if (where) title.appendChild(el('span', 'chan-orow-where', who ? ` · ${where}` : where));
  title.title = [who, where].filter(Boolean).join(' · ');
  line.appendChild(title);
  if (badge && badge.multi) { const ac = el('span', 'chan-orow-acct', badge.label); ac.title = t('From your {label} account', { label: badge.label }); line.appendChild(ac); }
  line.appendChild(el('span', 'chan-orow-at', stamp(p.updatedAt || p.at)));
  line.appendChild(icon('chevronRight', 10, 'chan-orow-chev'));
  row.appendChild(line);
  const sub = el('div', 'chan-orow-sub');
  sub.appendChild(el('span', `chan-prop-state chan-prop-state-${p.state}`, stateLabel(p.state)));
  const text = el('span', 'chan-orow-text');
  revealInto(text, rowFirstLine(p).slice(0, 300));
  sub.appendChild(text);
  row.appendChild(sub);
  if (p.state === 'awaiting-approval') {
    const act = el('div', 'chan-orow-act');
    const rv = btn(t('Approve…'), () => { if (onReview) onReview(p.id); }, 'mounts-btn-primary');
    rv.dataset.review = '1';
    rv.title = t('Open the proposal to approve it');
    act.appendChild(rv);
    row.appendChild(act);
  }
  row.onclick = (ev) => { if (ev && ev.target && ev.target.closest && ev.target.closest('button')) return; if (onToggle) onToggle(p.id); };
  row.onkeydown = (ev) => { if (ev.target !== row || (ev.key !== 'Enter' && ev.key !== ' ')) return; ev.preventDefault(); if (onToggle) onToggle(p.id); };
  setRowOpen(row, open);
  return row;
}
/** A row's open state, patched IN PLACE (the row keeps its focus across a toggle). */
function setRowOpen(row, open) {
  row.classList.toggle('chan-orow-open', !!open);
  row.setAttribute('aria-expanded', open ? 'true' : 'false');
}
/** The signature of what a row PRINTS (its open state is patched, never rebuilt). */
function rowSig(p, badge) {
  return JSON.stringify([p.state, p.adapterId, p.convId || null, p.title || null, p.convKind || null, p.compose || null, p.replyEnvelope ? p.replyEnvelope.to || null : null, p.kind || null, p.reaction || null, p.text || '', p.updatedAt || p.at || 0, badge]);
}
function keyedRow(app, p, prev, opts) {
  const sig = rowSig(p, opts.badge);
  if (prev && prev.dataset.sig === sig) { setRowOpen(prev, opts.open); return prev; }
  const row = renderProposalRow(app, p, opts);
  row.dataset.sig = sig;
  return row;
}
/**
 * B-f467 THE OUTBOX LIST'S NODES for one store answer `ob` (`{proposals, accounts}`): the Awaiting view = its rows;
 * All = grouped by state with a head per state (the order of STATE_ORDER); each row followed by its FULL CARD when
 * `open` holds its id. `list` = the container whose kept rows / cards / heads are reused (keyed). Returns
 * `{nodes, view, awaiting, proposals}`; the caller places them (`placeArmed`).
 */
export function outboxNodes(app, list, ob, { view = null, open = new Set(), onToggle = null, onReview = null } = {}) {
  const ps = ((ob && ob.proposals) || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const awaiting = ps.filter((p) => p.state === 'awaiting-approval');
  const v = view || (awaiting.length ? 'awaiting' : 'all');
  const badges = accountBadges((ob && ob.accounts) || []);
  const kids = list ? [...list.children] : [];
  const cards = new Map(kids.filter((c) => c.classList.contains('chan-prop')).map((c) => [c.dataset.proposal, c]));
  const rows = new Map(kids.filter((c) => c.classList.contains('chan-orow')).map((c) => [c.dataset.orow, c]));
  const heads = new Map(kids.filter((c) => c.classList.contains('chan-outbox-sec')).map((h) => [h.dataset.state, h]));
  const nodes = [];
  const push = (p) => {
    const isOpen = open.has(p.id);
    nodes.push(keyedRow(app, p, rows.get(p.id) || null, { badge: badges.get(p.adapterId) || null, open: isOpen, onToggle, onReview }));
    if (isOpen) nodes.push(keyedCard(app, p, cards.get(p.id) || null));
  };
  if (!ps.length) nodes.push(el('div', 'empty-hint', t('When an agent proposes a reply with vibespace-channels, it waits here for you to approve, edit or reject it.')));
  else if (v === 'awaiting') {
    if (!awaiting.length) nodes.push(el('div', 'empty-hint', t('Nothing is waiting for your approval.')));
    for (const p of awaiting) push(p);
  } else {
    const known = new Set(STATE_ORDER);
    const groups = [...STATE_ORDER, ...ps.map((p) => p.state).filter((s) => !known.has(s))];
    for (const st of [...new Set(groups)]) {
      const mine = ps.filter((p) => p.state === st);
      if (!mine.length) continue;
      let h = heads.get(st);
      if (!h) {
        h = el('div', 'chan-outbox-sec');
        h.dataset.state = st;
        h.appendChild(el('span', `chan-dot chan-dot-${STATE_TONE[st] || 'idle'}`));
        h.appendChild(el('span', ''));
      }
      const words = `${stateLabel(st)} · ${mine.length}`;
      if (h.lastElementChild.textContent !== words) h.lastElementChild.textContent = words;
      nodes.push(h);
      for (const p of mine) push(p);
    }
  }
  return { nodes, view: v, awaiting, proposals: ps };
}

/** The section a conversation window draws above its composer (design C4):
 *  the cards that need the user — awaiting first, then an unknown or failed
 *  outcome — plus the newest two decided ones (the outcome of a click stays
 *  in view), with a link to the rest in the Outbox. Empty ⇒ nothing. */
export function renderInlineProposals(app, proposals, prev = null) {
  const all = (proposals || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  if (!all.length) return null;
  const awaiting = all.filter((p) => p.state === 'awaiting-approval' || p.state === 'sending');
  const attention = all.filter((p) => p.state === 'unknown' || p.state === 'failed');
  const recent = all.filter((p) => !awaiting.includes(p) && !attention.includes(p)).slice(0, INLINE_RECENT);
  const shown = [...awaiting, ...attention, ...recent];
  const hidden = all.length - shown.length;
  // KEYED (2026-09-27): the section a previous render drew is patched — its
  // head re-worded, each card kept unless its record changed
  const sec = prev && prev.classList && prev.classList.contains('chanwin-outbox') ? prev : el('div', 'chanwin-outbox');
  let head = sec.querySelector(':scope > .chanwin-outbox-head');
  if (!head) {
    head = el('div', 'chanwin-outbox-head');
    head.appendChild(el('span', 'chanwin-outbox-title'));
    const link = el('a', 'chan-prop-link');
    link.href = '#';
    link.onclick = (ev) => { ev.preventDefault(); app.openChannelOutbox(); };
    head.appendChild(link);
  }
  const title = awaiting.length ? `${t('Awaiting your approval')} · ${awaiting.length}` : t('Proposals for this conversation');
  const linkText = hidden > 0 ? t('{n} more in the Outbox', { n: hidden }) : t('Open the Outbox');
  if (head.firstElementChild.textContent !== title) head.firstElementChild.textContent = title;
  if (head.lastElementChild.textContent !== linkText) head.lastElementChild.textContent = linkText;
  const byId = new Map([...sec.querySelectorAll(':scope > .chan-prop')].map((c) => [c.dataset.proposal, c]));
  placeArmed(sec, [head, ...shown.map((p) => keyedCard(app, p, byId.get(p.id) || null, { compact: true }))]);
  return sec;
}

/** Open (or focus) THE Outbox window — a singleton kind. */
export function openChannelOutbox(app, opts = {}) {
  for (const [id, w] of app.wm.windows || []) if (w && w.type === 'channel-outbox') { app.wm.revealWindow(id, { replay: !!opts.syncId }); return w; }
  const winInfo = app.wm.createWindow({ title: t('Outbox'), type: 'channel-outbox', syncId: opts.syncId, openSpec: { action: 'openChannelOutbox' }, width: 560, height: 600 });
  const root = el('div', 'chanwin chan-outbox');
  winInfo.content.appendChild(root);
  const bar = el('div', 'jobs-toolbar');
  const summary = el('span', 'jobs-summary');
  bar.appendChild(summary);
  // the Awaiting | All segment (a1 C5): Awaiting = the queue; All = grouped by state
  const seg = el('div', 'chan-seg');
  const segAwait = el('button', 'jobs-btn', t('Awaiting'));
  segAwait.type = 'button'; segAwait.dataset.view = 'awaiting';
  const segAll = el('button', 'jobs-btn', t('All'));
  segAll.type = 'button'; segAll.dataset.view = 'all';
  seg.append(segAwait, segAll);
  bar.appendChild(seg);
  const list = el('div', 'chanwin-list chan-outbox-list');
  root.append(bar, list);
  /** `null` until the user picks — the store decides the first view. */
  let view = null;
  let last = null;
  /** B-f467: the proposals whose full card is open under their row (pruned as proposals leave). */
  const open = new Set();
  const onToggle = (id) => { if (open.has(id)) open.delete(id); else open.add(id); draw(last); };
  const onReview = (id) => {
    open.add(id);
    draw(last);
    const card = [...list.children].find((c) => c.classList.contains('chan-prop') && c.dataset.proposal === id);
    const primary = card && card.querySelector(':scope > .chan-prop-actions button[data-approve]');
    if (primary) primary.focus();
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
  };

  // KEYED (2026-09-27): a broadcast re-renders only the rows / cards whose record
  // changed; a card the user is editing is left alone; section heads are
  // re-worded in place (B-f467: the nodes are outboxNodes' — a row per proposal)
  function draw(ob) {
    last = ob;
    const r = outboxNodes(app, list, ob, { view, open, onToggle, onReview });
    for (const id of [...open]) if (!r.proposals.some((p) => p.id === id)) open.delete(id);
    segAwait.classList.toggle('chan-seg-on', r.view === 'awaiting');
    segAll.classList.toggle('chan-seg-on', r.view === 'all');
    summary.textContent = r.proposals.length ? t('{a} awaiting your approval · {n} proposals', { a: r.awaiting.length, n: r.proposals.length }) : t('No proposals yet');
    const nodes = r.nodes;
    placeArmed(list, nodes);
  }
  segAwait.onclick = () => { view = 'awaiting'; draw(last); };
  segAll.onclick = () => { view = 'all'; draw(last); };
  async function refresh() {
    const r = await fetchJson('/api/channels/outbox');
    if (!r || r.error) { summary.textContent = (r && r.error) || t('The outbox is not available.'); return; }
    draw(r);
  }
  const onBroadcast = (msg) => { if (msg.type === 'channel-outbox-updated' && msg.outbox) draw(msg.outbox); };
  app.ws.onGlobal(onBroadcast);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { app.ws.offGlobal(onBroadcast); } catch {} });
  refresh().catch(() => {});
  return winInfo;
}

registerWindowType({
  type: 'channel-outbox', label: t('Outbox'), icon: ICON, singleton: true,
  action: 'openChannelOutbox',
  replay: (app, spec, { syncId } = {}) => app.openChannelOutbox({ syncId }),
});
registerCommand({ id: 'channels.openOutbox', title: () => t('Outbox…'), run: (c) => c.app.openChannelOutbox() });
/** The ⚙ row beside "Channels…" — registered by the owning module. */
registerMenuItem({
  menu: 'gear', parent: 'comm', order: 20, // under Communication ▸ (gear-menu.js head 'comm'; Channels 10 · this 20 · Integrations 30)
  icon: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11v8h-11z"/><path d="M2.5 4.5l5.5 4 5.5-4"/></svg>',
  label: () => t('Outbox…'),
  run: (c) => c.app.openChannelOutbox(),
});

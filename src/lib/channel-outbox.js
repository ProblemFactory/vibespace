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
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerCommand, registerMenuItem } from './contributions.js';
import { icon, el, btn } from './channel-chrome.js';
import * as chanCaps from '../channel-caps.js';
// PURE, bundled (a3 i18n): the proposal's OUTCOME as structure → words here.
import * as P from '../channel-policy.js';
// a3 i18n: a route failure is worded by its CODE, never by the engine's sentence.
import { routeErrorText } from './channel-words.js';

const ICON = svgIcon16('<path d="M2.5 4.5h11v8h-11z"/><path d="M2.5 4.5l5.5 4 5.5-4"/><path d="M8 2v3"/>');
const JSON_HDR = { 'Content-Type': 'application/json' };
/** The Outbox's All view: the order states are grouped in (attention first). */
const STATE_ORDER = ['awaiting-approval', 'sending', 'unknown', 'failed', 'sent', 'rejected', 'expired', 'proposed'];
const STATE_TONE = { 'awaiting-approval': 'attn', sending: 'attn', unknown: 'warn', failed: 'bad', sent: 'ok', rejected: 'idle', expired: 'idle', proposed: 'idle' };
/** Decided-and-closed cards the inline section keeps (the newest N). */
const INLINE_RECENT = 2;

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
  if (!compact) {
    const where = el('div', 'chan-prop-where');
    const link = el('a', 'chan-prop-link', `${p.adapterLabel || p.adapterId} · ${p.title || p.convId}`);
    link.href = '#';
    link.onclick = (ev) => { ev.preventDefault(); app.openChannel(p.adapterId, p.convId); };
    where.appendChild(link);
    card.appendChild(where);
  }
  // ── THE BODY — an agent's text, plain (or the editor while editing) ──
  const body = el('div', 'chan-prop-text', p.text || '');
  card.appendChild(body);
  if (p.edited && p.originalText && p.originalText !== p.text) {
    const orig = el('details', 'chan-prop-orig');
    orig.appendChild(el('summary', '', t('Original text (before your edit)')));
    orig.appendChild(el('div', 'chan-prop-text chan-prop-text-orig', p.originalText));
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
  meta.appendChild(el('span', 'chan-prop-identity', t('Will send as {who}', { who: asWho })));
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
  const outcomeLine = outcome ? P.outcomeText(outcome, { t, errorCodeText: chanCaps.errorCodeText }) : (p.reason || '');
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
  if (p.receipt && p.draftedBy && p.draftedBy.kind === 'agent') {
    const d = p.receiptDelivery;
    card.appendChild(el('div', 'chan-prop-foot chan-prop-receipt', d
      ? (d.ok ? t('Receipt handed to the agent ({lane})', { lane: chanCaps.deliveryLaneText(d.lane, { t }) }) : d.stashed ? t('Receipt stored for the agent\'s next turn') : t('Receipt not delivered: {why}', { why: chanCaps.wakeRefusalText(d.refused, { t }) || d.why || '' }))
      : t('Receipt recorded')));
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
  // DECISIONS — only while awaiting.
  if (p.state === 'awaiting-approval') {
    const act = el('div', 'chan-prop-actions');
    let editor = null;
    const reject = btn(t('Reject…'), null);
    reject.dataset.reject = '1';
    const edit = btn(t('Edit…'), null);
    edit.dataset.edit = '1';
    const approve = btn(t('Approve'), null, 'mounts-btn-primary');
    approve.dataset.approve = '1';
    approve.onclick = async () => {
      approve.disabled = true; edit.disabled = true; reject.disabled = true;
      const text = editor ? editor.value : null;
      const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/approve`, text !== null && text !== p.text ? { text } : {});
      if (!r) { approve.disabled = false; edit.disabled = false; reject.disabled = false; return; }
      const sent = !!(r.proposal && r.proposal.state === 'sent');
      const o = r.proposal ? (r.proposal.outcome || P.outcomeOf(r.proposal)) : null;
      showToast(sent ? t('Sent') : t('Not sent: {why}', { why: (o && P.outcomeText(o, { t, errorCodeText: chanCaps.errorCodeText })) || routeErrorText(r) }), { type: sent ? 'info' : 'error' });
    };
    edit.onclick = () => {
      if (editor) return;
      editor = el('textarea', 'chan-prop-edit');
      editor.value = p.text || '';
      body.replaceWith(editor);
      approve.textContent = t('Approve edited');
      edit.disabled = true;
      editor.focus();
    };
    reject.onclick = () => {
      if (card.querySelector('.chan-prop-rejectbox')) return;
      const box = el('div', 'chan-prop-rejectbox');
      const inp = el('input', 'chan-opt-input');
      inp.type = 'text'; inp.placeholder = t('Reason (the agent reads it)');
      const go = btn(t('Reject'), null, 'mounts-btn-primary');
      go.onclick = async () => {
        go.disabled = true;
        const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/reject`, { reason: inp.value });
        if (!r) go.disabled = false; else showToast(t('Rejected'));
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
      box.append(inp, go);
      act.after(box);
      inp.focus();
    };
    act.append(reject, edit, approve);
    card.appendChild(act);
  }
  return card;
}

/** The section a conversation window draws above its composer (design C4):
 *  the cards that need the user — awaiting first, then an unknown or failed
 *  outcome — plus the newest two decided ones (the outcome of a click stays
 *  in view), with a link to the rest in the Outbox. Empty ⇒ nothing. */
export function renderInlineProposals(app, proposals) {
  const all = (proposals || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  if (!all.length) return null;
  const awaiting = all.filter((p) => p.state === 'awaiting-approval' || p.state === 'sending');
  const attention = all.filter((p) => p.state === 'unknown' || p.state === 'failed');
  const recent = all.filter((p) => !awaiting.includes(p) && !attention.includes(p)).slice(0, INLINE_RECENT);
  const shown = [...awaiting, ...attention, ...recent];
  const hidden = all.length - shown.length;
  const sec = el('div', 'chanwin-outbox');
  const head = el('div', 'chanwin-outbox-head');
  head.appendChild(el('span', '', awaiting.length ? `${t('Awaiting your approval')} · ${awaiting.length}` : t('Proposals for this conversation')));
  const link = el('a', 'chan-prop-link', hidden > 0 ? t('{n} more in the Outbox', { n: hidden }) : t('Open the Outbox'));
  link.href = '#';
  link.onclick = (ev) => { ev.preventDefault(); app.openChannelOutbox(); };
  head.appendChild(link);
  sec.appendChild(head);
  for (const p of shown) sec.appendChild(renderProposalCard(app, p, { compact: true }));
  return sec;
}

/** Open (or focus) THE Outbox window — a singleton kind. */
export function openChannelOutbox(app, opts = {}) {
  for (const [id, w] of app.wm.windows || []) if (w && w.type === 'channel-outbox') { app.wm.focusWindow(id); return w; }
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

  function draw(ob) {
    last = ob;
    list.textContent = '';
    const ps = ((ob && ob.proposals) || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
    const awaiting = ps.filter((p) => p.state === 'awaiting-approval');
    const v = view || (awaiting.length ? 'awaiting' : 'all');
    segAwait.classList.toggle('chan-seg-on', v === 'awaiting');
    segAll.classList.toggle('chan-seg-on', v === 'all');
    summary.textContent = ps.length ? t('{a} awaiting your approval · {n} proposals', { a: awaiting.length, n: ps.length }) : t('No proposals yet');
    if (!ps.length) { list.appendChild(el('div', 'empty-hint', t('When an agent proposes a reply with vibespace-channels, it waits here for you to approve, edit or reject it.'))); return; }
    if (v === 'awaiting') {
      if (!awaiting.length) list.appendChild(el('div', 'empty-hint', t('Nothing is waiting for your approval.')));
      for (const p of awaiting) list.appendChild(renderProposalCard(app, p));
      return;
    }
    const known = new Set(STATE_ORDER);
    const groups = [...STATE_ORDER, ...ps.map((p) => p.state).filter((s) => !known.has(s))];
    for (const st of [...new Set(groups)]) {
      const mine = ps.filter((p) => p.state === st);
      if (!mine.length) continue;
      const h = el('div', 'chan-outbox-sec');
      h.appendChild(el('span', `chan-dot chan-dot-${STATE_TONE[st] || 'idle'}`));
      h.appendChild(el('span', '', `${stateLabel(st)} · ${mine.length}`));
      list.appendChild(h);
      for (const p of mine) list.appendChild(renderProposalCard(app, p));
    }
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

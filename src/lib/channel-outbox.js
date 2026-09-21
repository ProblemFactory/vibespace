// THE OUTBOX (docs/design-communication-panel.zh.md §9.2, §9.5, §10.1; P3).
//
// ONE RECORD, TWO PLACES: the approval card below is rendered INLINE in the
// conversation window (context lives there) and in this Outbox window (the
// queue lives there) — both from the same server store, so they cannot
// disagree. Every fact on the card is the digest's STRUCTURE and the words
// are composed here in the device's language (the identity warning through
// `chanCaps.identityWarningText`, exactly as the composer does).
//
// THE IDENTITY ROW (§9.5): "Will send as <user>" on every card; when the
// adapter's `identityMarking` is not `none` a WARNING beside it, showing the
// adapter's own verbatim sentence (or saying the attribution is unverified —
// `unknown` warns as loudly as `marked`). Honesty is owed to the one pressing
// Approve, never pushed into the recipient's message.
//
// Every vendor / agent string is textContent (fence 5): a proposal's text is
// an agent's, the reason is an adapter's, the why is a label — none of it
// reaches innerHTML.
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerCommand, registerMenuItem } from './contributions.js';
import * as chanCaps from '../channel-caps.js';

const ICON = svgIcon16('<path d="M2.5 4.5h11v8h-11z"/><path d="M2.5 4.5l5.5 4 5.5-4"/><path d="M8 2v3"/>');
const JSON_HDR = { 'Content-Type': 'application/json' };

const stamp = (ms) => {
  if (!ms) return '';
  const d = new Date(Number(ms));
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

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
  if (!r || r.error) { showToast((r && r.error) || t('Request failed'), { type: 'error' }); return null; }
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
  const head = el('div', 'chan-prop-head');
  const st = el('span', `chan-prop-state chan-prop-state-${p.state}`, stateLabel(p.state));
  head.appendChild(st);
  const who = el('span', 'chan-prop-who', drafterLabel(p));
  head.appendChild(who);
  const when = el('span', 'chan-prop-when', stamp(p.updatedAt || p.at));
  head.appendChild(when);
  card.appendChild(head);
  if (!compact) {
    const where = el('div', 'chan-prop-where');
    const link = el('a', 'chan-prop-link', `${p.adapterLabel || p.adapterId} · ${p.title || p.convId}`);
    link.href = '#';
    link.onclick = (ev) => { ev.preventDefault(); app.openChannel(p.adapterId, p.convId); };
    where.appendChild(link);
    card.appendChild(where);
  }
  // WHY — a structured reference the panel can link, never an agent's sentence.
  if (p.why && (p.why.label || p.why.id)) {
    const why = el('div', 'chan-prop-why', t('Why: {ref}', { ref: p.why.label || p.why.id }));
    if (p.why.kind === 'record' && p.why.id) why.title = t('message {id}', { id: p.why.id });
    card.appendChild(why);
  }
  // THE BODY — an agent's text, plain.
  const body = el('div', 'chan-prop-text', p.text || '');
  card.appendChild(body);
  if (p.edited && p.originalText && p.originalText !== p.text) {
    const orig = el('details', 'chan-prop-orig');
    orig.appendChild(el('summary', '', t('Original text (before your edit)')));
    orig.appendChild(el('div', 'chan-prop-text chan-prop-text-orig', p.originalText));
    card.appendChild(orig);
  }
  // THE POLICY VERDICT — why it waits, or that it went directly.
  if (p.policy) {
    const pol = el('div', 'chan-prop-policy');
    if (p.policy.mode === 'direct') pol.textContent = t('Sent directly: the channel policy is "direct" and no guard applied.');
    else pol.textContent = t('Needs approval: {why}', { why: (p.policy.reasons || []).map(reasonLabel).join('; ') || t('review') });
    if (p.policy.detail && p.policy.detail.unknownPolicy) pol.textContent += ' ' + t('(the stored policy value was not understood — review, fail closed)');
    if (p.policy.detail && p.policy.detail.guardsUnparseable) pol.textContent += ' ' + t('(a guard setting could not be read: {why} — review, fail closed)', { why: p.policy.detail.guardsUnparseable });
    card.appendChild(pol);
  }
  // THE IDENTITY ROW (§9.5): calm when `none`, a warning otherwise.
  const idRow = el('div', 'chan-prop-identity');
  const asWho = p.sendAs === 'bot' ? t('the bot') : t('you');
  idRow.appendChild(el('span', '', t('Will send as {who}', { who: asWho })));
  const warnText = p.identityWarning ? chanCaps.identityWarningText(p.identityWarning, { t }) : null;
  if (warnText) idRow.appendChild(el('span', 'chan-prop-idwarn', warnText));
  card.appendChild(idRow);
  // THE SENDER HONESTY LINE (§9.5, P4): said BEFORE the approval when the
  // channel's switch is on, and recorded after the send. The line itself is
  // the adapter-neutral sentence the engine will append, shown verbatim.
  if (p.honestyLine) {
    const hl = el('div', 'chan-prop-honesty');
    hl.appendChild(el('span', '', p.state === 'sent' ? t('A sender line was appended:') : t('A sender line will be appended (this channel\'s option is on):')));
    hl.appendChild(el('code', 'chan-prop-honesty-line', p.honestyLine));
    card.appendChild(hl);
  }
  // OUTCOME — the reason verbatim (an adapter's or the user's), the receipt.
  if (p.reason) card.appendChild(el('div', `chan-prop-reason${p.state === 'unknown' ? ' chan-warn' : ''}`, p.reason));
  if (p.state === 'unknown') card.appendChild(el('div', 'chan-prop-reason chan-warn', t('This send is never retried automatically. Check the conversation on the platform before proposing it again.')));
  // RECONCILE (§9.4, P4): what the last check answered, and the control —
  // offered only when the adapter's declared idempotency can answer at all.
  if (p.reconcile && p.reconcile.n) {
    const rc = el('div', 'chan-prop-reconcile');
    const ans = p.reconcile.lastAnswer === 'landed' ? t('it landed') : p.reconcile.lastAnswer === 'not-landed' ? t('it did not land') : p.reconcile.lastAnswer === 'not-available' ? t('this channel cannot be checked by the machine') : t('still unknown');
    rc.textContent = t('Checked {n}× — last answer: {answer} ({when})', { n: p.reconcile.n, answer: ans, when: stamp(p.reconcile.lastAt) }) + (p.reconcile.lastWhy ? ` — ${p.reconcile.lastWhy}` : '');
    card.appendChild(rc);
  }
  if (p.state === 'unknown') {
    if (p.canReconcile) {
      const act = el('div', 'chan-prop-actions');
      const chk = el('button', 'chan-btn chan-btn-primary', t('Check outcome'));
      chk.type = 'button';
      chk.dataset.reconcile = '1';
      chk.onclick = async () => {
        chk.disabled = true;
        const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/reconcile`, {});
        if (!r) { chk.disabled = false; return; }
        showToast(r.resolved ? (r.state === 'sent' ? t('It landed — marked as sent') : t('It never landed — marked as failed')) : t('Still unknown: {why}', { why: r.reason || t('no evidence either way') }), { type: r.resolved ? 'info' : 'warn' });
      };
      act.appendChild(chk);
      card.appendChild(act);
    } else if (p.reconcileWhy) {
      card.appendChild(el('div', 'chan-prop-reason', t('Cannot be checked by the machine: {why}', { why: p.reconcileWhy })));
    }
  }
  if (p.receipt && p.draftedBy && p.draftedBy.kind === 'agent') {
    const d = p.receiptDelivery;
    const rc = el('div', 'chan-prop-receipt', d
      ? (d.ok ? t('Receipt handed to the agent ({lane})', { lane: d.lane }) : d.stashed ? t('Receipt stored for the agent\'s next turn') : t('Receipt not delivered: {why}', { why: d.why || '' }))
      : t('Receipt recorded'));
    card.appendChild(rc);
  }
  if (p.state === 'awaiting-approval' && p.ttlAt) card.appendChild(el('div', 'chan-prop-ttl', t('Expires unapproved at {when}', { when: stamp(p.ttlAt) })));

  // DECISIONS — only while awaiting.
  if (p.state === 'awaiting-approval') {
    const act = el('div', 'chan-prop-actions');
    let editor = null;
    const approve = el('button', 'chan-btn chan-btn-primary', t('Approve'));
    approve.type = 'button';
    approve.dataset.approve = '1';
    const edit = el('button', 'chan-btn', t('Edit…'));
    edit.type = 'button';
    const reject = el('button', 'chan-btn', t('Reject…'));
    reject.type = 'button';
    approve.onclick = async () => {
      approve.disabled = true; edit.disabled = true; reject.disabled = true;
      const text = editor ? editor.value : null;
      const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/approve`, text !== null && text !== p.text ? { text } : {});
      if (!r) { approve.disabled = false; edit.disabled = false; reject.disabled = false; return; }
      showToast(r.proposal && r.proposal.state === 'sent' ? t('Sent') : t('Not sent: {why}', { why: (r.proposal && r.proposal.reason) || r.error || '' }), { type: r.proposal && r.proposal.state === 'sent' ? 'info' : 'error' });
    };
    edit.onclick = () => {
      if (editor) return;
      editor = el('textarea', 'chan-prop-edit');
      editor.value = p.text || '';
      body.replaceWith(editor);
      approve.textContent = t('Approve edited');
      edit.disabled = true;
    };
    reject.onclick = () => {
      if (act.querySelector('.chan-prop-rejectbox')) return;
      const box = el('div', 'chan-prop-rejectbox');
      const inp = el('input', 'chan-opt-input');
      inp.type = 'text'; inp.placeholder = t('Reason (the agent reads it)');
      const go = el('button', 'chan-btn', t('Reject'));
      go.type = 'button';
      go.onclick = async () => {
        go.disabled = true;
        const r = await post(`/api/channels/outbox/${encodeURIComponent(p.id)}/reject`, { reason: inp.value });
        if (!r) go.disabled = false; else showToast(t('Rejected'));
      };
      box.append(inp, go);
      act.appendChild(box);
      inp.focus();
    };
    act.append(approve, edit, reject);
    card.appendChild(act);
  }
  return card;
}

/** The section a conversation window draws above its composer: this
 *  conversation's proposals, awaiting first. Empty ⇒ nothing (no element). */
export function renderInlineProposals(app, proposals) {
  const list = (proposals || []).slice().sort((a, b) => (a.state === 'awaiting-approval' ? -1 : 0) - (b.state === 'awaiting-approval' ? -1 : 0) || (b.at || 0) - (a.at || 0)).slice(0, 8);
  if (!list.length) return null;
  const sec = el('div', 'chanwin-outbox');
  sec.appendChild(el('div', 'chanwin-outbox-head', t('Outbox — proposals for this conversation')));
  for (const p of list) sec.appendChild(renderProposalCard(app, p, { compact: true }));
  return sec;
}

/** Open (or focus) THE Outbox window — a singleton kind. */
export function openChannelOutbox(app, opts = {}) {
  for (const [id, w] of app.wm.windows || []) if (w && w.type === 'channel-outbox') { app.wm.focusWindow(id); return w; }
  const winInfo = app.wm.createWindow({ title: t('Outbox'), type: 'channel-outbox', syncId: opts.syncId, openSpec: { action: 'openChannelOutbox' }, width: 560, height: 600 });
  const root = el('div', 'chanwin chan-outbox');
  winInfo.content.appendChild(root);
  const bar = el('div', 'chanwin-bar');
  const summary = el('span', 'chanwin-meta');
  bar.appendChild(summary);
  const list = el('div', 'chanwin-list chan-outbox-list');
  root.append(bar, list);

  function draw(ob) {
    list.textContent = '';
    const ps = (ob && ob.proposals) || [];
    const awaiting = ps.filter((p) => p.state === 'awaiting-approval');
    summary.textContent = ps.length
      ? t('{a} awaiting your approval · {n} proposals', { a: awaiting.length, n: ps.length })
      : t('No proposals yet. Agents propose replies with vibespace-channels; you approve, edit or reject them here.');
    const order = [...awaiting, ...ps.filter((p) => p.state !== 'awaiting-approval')];
    for (const p of order) list.appendChild(renderProposalCard(app, p));
  }
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
  type: 'channel-outbox', label: 'Outbox', icon: ICON, singleton: true,
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

// THE ASSIGN & FILTER EDITOR (docs/design-communication-panel.zh.md §7, §10;
// P2). One dialog per conversation: WHO is woken (an agent session or a task
// group — round-robin over its live members), WHAT wakes them (all messages
// or a filter of CLOSED rule kinds), HOW (a wake per batch or a digest per
// window), with WHAT authority (draft always; send only when BOTH caps allow
// it — otherwise the option is not drawn and the reason is), and how often
// at most (the per-assignment daily wake cap — pacing, not money).
//
// THE LIVE ESTIMATE IS HONEST AND MEASURED AFTER THE FACT (§7.1/§7.2): every
// edit re-asks the server (the corpus never reaches the browser) and the
// answer's `sampled` / `truncated` caveats are PRINTED; once an assignment
// exists the same line shows "estimated ~4/day when set; 6/day since",
// because a user asked to reason about a paid RATE is owed the measurement.
//
// THE LATENCY CLAIM IS PER LANE (§19 P2): "a wake arrives within ~N" is
// worded from the digest's structured `wakeLatency` — the push lane's
// coalescing window + ack budget, the poll lane's hot cadence, the scan
// lane's per-source latency, the reconcile cadence — never a fixed sentence.
//
// The rule kinds and their validation are the PURE module's own
// (src/channel-filter.js, bundled like channel-caps), so the editor cannot
// draw a rule the route would refuse.
import { fetchJson, showToast, createModalShell } from './utils.js';
import { t } from './i18n.js';
import * as F from '../channel-filter.js';
import * as chanCaps from '../channel-caps.js';

const RULE_LABELS = () => ({
  'mention': t('mentions'),
  'keyword': t('contains keyword'),
  'sender-in-group': t('sender is one of'),
  'from-address': t('from (name or address)'),
  'subject': t('subject contains'),
  'has-attachment': t('has an attachment'),
  'not-contains': t('does not contain'),
  'time-window': t('arrives between (HH:MM–HH:MM)'),
});

async function api(pathname, body, method = 'PUT') {
  const r = await fetchJson(pathname, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r || r.error) { showToast((r && r.error) || t('Request failed'), { type: 'error' }); return null; }
  return r;
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function fieldLabel(text) { return el('div', 'chan-opt-label', text); }
function selectBox(options, value) {
  const s = el('select', 'chan-opt-input');
  for (const o of options) { const op = el('option', '', o.label); op.value = o.value; if (o.value === value) op.selected = true; if (o.disabled) op.disabled = true; s.appendChild(op); }
  return s;
}
function textInput(value, placeholder = '') { const i = el('input', 'chan-opt-input'); i.type = 'text'; i.value = value || ''; i.placeholder = placeholder; return i; }
function numberInput(value, { min = 0, max = 1000, step = 1 } = {}) { const i = el('input', 'chan-opt-input'); i.type = 'number'; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(value); return i; }

/** The per-lane latency sentence from the digest's structure. */
export function wakeLatencyText(wl) {
  const w = wl || {};
  const age = (s) => chanCaps.humanAge(s);
  switch (w.lane) {
    case 'push': return w.coalesceSeconds > 0
      ? t('Wakes arrive within ~{age} — push carries messages here; hits are coalesced for {n} s so a burst is one wake', { age: age(w.seconds), n: w.coalesceSeconds })
      : t('Wakes arrive within ~{age} — push carries messages here, one wake per message (coalescing is off)', { age: age(w.seconds) });
    case 'scan': return w.seconds === null || w.seconds === undefined
      ? t('No wake latency can be claimed: this scan lane has no source right now ({why})', { why: w.why || 'unknown' })
      : t('Wakes arrive within ~{age} — this conversation is read by a scan of the local client ({source})', { age: age(w.seconds), source: w.source || '?' });
    case 'reconcile': return t('Wakes arrive within ~{age} — the poll is on its reconciliation cadence while push is declared exclusive', { age: age(w.seconds) });
    case 'poll': return w.kick
      ? t('Wakes arrive within ~{age} — push only kicks the cursor here; the poll carries the messages', { age: age(w.seconds) })
      : t('Wakes arrive within ~{age} — this conversation is polled', { age: age(w.seconds) });
    default: return t('Wake latency unknown');
  }
}

/** The estimate line with its caveats printed. */
function estimateText(e, atSet, stats) {
  if (!e) return t('Estimating…');
  const parts = [t('~{n}/day would wake (of ~{m}/day)', { n: e.matchedPerDay, m: e.totalPerDay })];
  if (e.truncated) parts.push(t('only {d} days of history are stored — the rate is over that span', { d: e.windowDays }));
  if (e.sampled) parts.push(t('only the newest {n} records were read; older ones exist unread', { n: e.total }));
  if (atSet && stats) parts.push(t('estimated ~{a}/day when set; actually {b}/day since (7-day measurement)', { a: atSet.matchedPerDay, b: Math.round((stats.hits7d / 7) * 10) / 10 }));
  return parts.join(' · ');
}

/**
 * Open the editor for one conversation summary `conv` (a digest row). Saves
 * the filter first (when filtered), then the assignment; unassign is its own
 * button. Re-renders nothing itself — the engine's broadcast repaints the
 * panel and the window.
 */
export function showAssignFilterDialog(app, conv) {
  const base = `/api/channels/${encodeURIComponent(conv.adapterId)}/${encodeURIComponent(conv.id)}`;
  const { body, close } = createModalShell({ id: 'chan-assign-dialog', title: t('Assign & filter — {title}', { title: conv.title || conv.id }), dialogClass: 'chan-options chan-assign', escapeToClose: true });
  const a = conv.assignment || null;
  const f = conv.filter || null;
  const caps = conv.authorityCaps || { offersSend: false, sendWhy: 'unknown', policyRequiresReview: true };

  // ── WHO ──
  body.appendChild(fieldLabel(t('Wake')));
  const live = (app.sidebar && app.sidebar._webuiSessions) || [];
  const groups = (app.sidebar && app.sidebar._tasks) || [];
  const who = [];
  for (const s of live) {
    const cid = s.backendSessionId || s.claudeSessionId;
    if (!cid) continue;
    who.push({ value: `agent:${cid}`, label: t('Agent · {name}', { name: s.name || cid }), kind: 'agent', id: cid, name: s.name || null });
  }
  for (const g of groups) if (g && g.id) who.push({ value: `group:${g.id}`, label: t('Group · {name} (round-robin over its live sessions)', { name: g.name || g.id }), kind: 'group', id: g.id, name: g.name || null });
  if (a && !who.some((w) => w.kind === a.principal.kind && w.id === a.principal.id)) who.unshift({ value: `${a.principal.kind}:${a.principal.id}`, label: t('{kind} · {name} (not live now)', { kind: a.principal.kind, name: a.principal.name || a.principal.id }), kind: a.principal.kind, id: a.principal.id, name: a.principal.name || null });
  if (!who.length) who.push({ value: '', label: t('No live agent session or task group to assign to'), disabled: true });
  const whoSel = selectBox(who, a ? `${a.principal.kind}:${a.principal.id}` : who[0].value);
  body.appendChild(whoSel);

  // ── WHAT ──
  body.appendChild(fieldLabel(t('On')));
  const modeSel = selectBox([{ value: 'all', label: t('every message') }, { value: 'filtered', label: t('messages matching a filter') }], a ? a.mode : (f ? 'filtered' : 'all'));
  body.appendChild(modeSel);
  const rulesBox = el('div', 'chan-af-rules');
  const matchRow = el('div', 'chan-af-row');
  matchRow.appendChild(el('span', 'chan-af-inline', t('Match')));
  const matchSel = selectBox([{ value: 'any', label: t('any rule') }, { value: 'every', label: t('every rule') }], (f && f.match) || 'any');
  matchRow.appendChild(matchSel);
  rulesBox.appendChild(matchRow);
  const rulesList = el('div', 'chan-af-list');
  rulesBox.appendChild(rulesList);
  const addRow = el('div', 'chan-af-row');
  const addKind = selectBox(F.RULE_KINDS.map((k) => ({ value: k, label: RULE_LABELS()[k] || k })), 'keyword');
  const addBtn = el('button', 'chan-btn', t('Add rule'));
  addBtn.type = 'button';
  addRow.append(addKind, addBtn);
  rulesBox.appendChild(addRow);
  body.appendChild(rulesBox);

  const rules = (f && Array.isArray(f.rules) ? f.rules : []).map((r) => ({ ...r }));
  function ruleRow(rule, idx) {
    const row = el('div', 'chan-af-rule');
    row.appendChild(el('span', 'chan-af-kind', RULE_LABELS()[rule.kind] || rule.kind));
    const fields = el('span', 'chan-af-fields');
    const bind = (inp, key, transform = (v) => v) => { inp.oninput = () => { rule[key] = transform(inp.value); reestimate(); }; fields.appendChild(inp); };
    switch (rule.kind) {
      case 'mention': bind(textInput(rule.value, t('name or id')), 'value'); break;
      case 'keyword': case 'not-contains': case 'subject': case 'from-address': bind(textInput(rule.value, t('text')), 'value'); break;
      case 'sender-in-group': bind(textInput(Array.isArray(rule.members) ? rule.members.join(', ') : (rule.value || ''), t('ids or names, comma-separated')), 'members', (v) => v.split(',').map((x) => x.trim()).filter(Boolean)); break;
      case 'has-attachment': break;
      case 'time-window': bind(textInput(rule.from || '09:00', 'HH:MM'), 'from'); bind(textInput(rule.to || '18:00', 'HH:MM'), 'to'); break;
      default: break;
    }
    row.appendChild(fields);
    const rm = el('button', 'chan-btn', t('Remove'));
    rm.type = 'button';
    rm.onclick = () => { rules.splice(idx, 1); drawRules(); reestimate(); };
    row.appendChild(rm);
    return row;
  }
  function drawRules() {
    rulesList.textContent = '';
    if (!rules.length) rulesList.appendChild(el('div', 'chan-flow-note', t('No rules yet — add one below. With no rule nothing matches (a wake is money, so the filter fails closed).')));
    rules.forEach((r, i) => rulesList.appendChild(ruleRow(r, i)));
  }
  addBtn.onclick = () => { const k = addKind.value; rules.push(k === 'time-window' ? { kind: k, from: '09:00', to: '18:00' } : k === 'sender-in-group' ? { kind: k, members: [] } : { kind: k, value: '' }); drawRules(); reestimate(); };
  drawRules();
  const syncMode = () => { rulesBox.style.display = modeSel.value === 'filtered' ? '' : 'none'; };
  modeSel.onchange = () => { syncMode(); reestimate(); };
  matchSel.onchange = () => reestimate();
  syncMode();

  // ── ESTIMATE (live) + MEASUREMENT (after the fact) ──
  const est = el('div', 'chan-flow-status', t('Estimating…'));
  body.appendChild(est);
  let lastEstimate = null;
  let estTimer = null;
  function currentFilter() {
    if (modeSel.value !== 'filtered') return null;
    return { match: matchSel.value, rules: rules.map((r) => ({ ...r })) };
  }
  function reestimate() {
    if (estTimer) clearTimeout(estTimer);
    estTimer = setTimeout(async () => {
      estTimer = null;
      const filter = currentFilter();
      if (filter) { const v = F.validateFilter(filter); if (!v.ok) { est.textContent = t('Filter is incomplete: {why}', { why: v.error }); lastEstimate = null; return; } }
      const r = await fetchJson(`${base}/estimate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter }) });
      if (!r || r.error) { est.textContent = (r && r.error) || t('Estimate failed'); lastEstimate = null; return; }
      lastEstimate = r.estimate;
      est.textContent = estimateText(r.estimate, a && a.estimateAtSet, conv.stats);
    }, 250);
  }
  reestimate();

  // ── HOW ──
  body.appendChild(fieldLabel(t('Deliver')));
  const notifySel = selectBox([{ value: 'wake', label: t('wake the agent per batch') }, { value: 'digest', label: t('one digest per window') }], a ? a.notify : 'wake');
  body.appendChild(notifySel);
  const digestRow = el('div', 'chan-af-row');
  digestRow.appendChild(el('span', 'chan-af-inline', t('Window (minutes)')));
  const digestMin = numberInput(a ? a.digestMinutes : F.DEFAULT_DIGEST_MINUTES, { min: F.MIN_DIGEST_MINUTES, max: F.MAX_DIGEST_MINUTES, step: 5 });
  digestRow.appendChild(digestMin);
  body.appendChild(digestRow);
  const syncNotify = () => { digestRow.style.display = notifySel.value === 'digest' ? '' : 'none'; };
  notifySel.onchange = syncNotify;
  syncNotify();
  // the honest per-lane latency claim
  body.appendChild(el('div', 'chan-flow-note', wakeLatencyText(conv.wakeLatency)));

  // ── AUTHORITY — drawn only when BOTH caps allow it, with the reason otherwise ──
  body.appendChild(fieldLabel(t('Authority')));
  const cap = F.authorityCap(caps);
  const authSel = selectBox(cap
    ? [{ value: 'draft', label: t('draft replies (the user approves)') }]
    : [{ value: 'draft', label: t('draft replies (the user approves)') }, { value: 'send', label: t('send replies directly') }],
    a && a.authority === 'send' && !cap ? 'send' : 'draft');
  body.appendChild(authSel);
  if (cap) body.appendChild(el('div', 'chan-flow-note', t('Direct send is not offered here: {why}', { why: cap })));
  if (a && a.authorityClamped) body.appendChild(el('div', 'chan-flow-note chan-warn', t('The stored authority is "send" but it reads as draft: {why}', { why: a.authorityWhy })));

  // ── PACING ──
  body.appendChild(fieldLabel(t('At most this many wakes per day (pacing — the account budget is the money bound)')));
  const capInp = numberInput(a ? a.dailyWakeCap : F.DEFAULT_DAILY_WAKE_CAP, { min: 0, max: F.MAX_DAILY_WAKE_CAP, step: 1 });
  body.appendChild(capInp);
  if (conv.stats && conv.stats.lastWake) {
    const lw = conv.stats.lastWake;
    body.appendChild(el('div', 'chan-flow-note', lw.ok
      ? t('Last wake: {n} message(s) delivered via {lane} — {why}', { n: lw.n, lane: lw.lane || 'message', why: lw.whys ? lw.whys.join(', ') : '' })
      : t('Last wake was held or stashed: {why}', { why: lw.why || '' })));
  }
  if (conv.stats && conv.stats.pending) body.appendChild(el('div', 'chan-flow-note', t('{n} matched message(s) are waiting for the next window or turn', { n: conv.stats.pending })));

  // ── RECEIPTS (P3, decision 8): the outbox receipt never wakes the agent
  //    by default — it rides the next turn. Opting in is a billed turn per
  //    approval, and it says so.
  const rwRow = el('label', 'chan-opt-check');
  const rwInp = el('input'); rwInp.type = 'checkbox'; rwInp.checked = !!(a && a.receiptWake);
  rwRow.append(rwInp, document.createTextNode(' ' + t('Wake the agent with each outbox receipt (a billed turn per approval; off = the receipt rides its next turn)')));
  body.appendChild(rwRow);

  // ── ACTIONS ──
  const actions = el('div', 'chan-flow-actions');
  const save = el('button', 'chan-btn chan-btn-primary', t('Save'));
  save.type = 'button';
  save.onclick = async () => {
    const w = who.find((x) => x.value === whoSel.value);
    if (!w || !w.kind) { showToast(t('Pick an agent or a group to wake.'), { type: 'error' }); return; }
    save.disabled = true;
    try {
      let filterId = null;
      const filter = currentFilter();
      if (modeSel.value === 'filtered') {
        const v = F.validateFilter(filter);
        if (!v.ok) { showToast(t('Filter is incomplete: {why}', { why: v.error }), { type: 'error' }); return; }
        const fr = await api(`${base}/filter`, { filter, estimate: lastEstimate });
        if (!fr) return;
        filterId = fr.filter && fr.filter.id;
      }
      const assignment = { principal: { kind: w.kind, id: w.id, name: w.name }, mode: modeSel.value, filterId, notify: notifySel.value, digestMinutes: Number(digestMin.value), authority: authSel.value, dailyWakeCap: Number(capInp.value), receiptWake: !!rwInp.checked };
      const ar = await api(`${base}/assignment`, { assignment, estimateAtSet: lastEstimate });
      if (!ar) return;
      showToast(t('Assigned: {name} wakes on this conversation', { name: w.name || w.id }));
      close();
    } finally { save.disabled = false; }
  };
  actions.appendChild(save);
  if (a) {
    const un = el('button', 'chan-btn', t('Unassign'));
    un.type = 'button';
    un.onclick = async () => { un.disabled = true; const r = await api(`${base}/assignment`, { assignment: null }); un.disabled = false; if (r) { showToast(t('Unassigned')); close(); } };
    actions.appendChild(un);
  }
  const cancel = el('button', 'chan-btn', t('Cancel'));
  cancel.type = 'button';
  cancel.onclick = () => close();
  actions.appendChild(cancel);
  body.appendChild(actions);
}

/** The one-line summary the panel row and the window bar draw. */
export function assignmentSummary(conv) {
  const a = conv && conv.assignment;
  if (!a) return '';
  const who = a.principal.name || a.principal.id;
  const what = a.mode === 'filtered' ? t('filtered') : t('all messages');
  const how = a.notify === 'digest' ? t('digest every {m} min', { m: a.digestMinutes }) : t('wake');
  const s = conv.stats || {};
  const measured = s.hits7d !== undefined ? t('{n} hits / 7d', { n: s.hits7d }) : '';
  return [t('→ {who}', { who }), what, how, a.authority === 'send' ? t('may send') : t('drafts'), measured].filter(Boolean).join(' · ');
}

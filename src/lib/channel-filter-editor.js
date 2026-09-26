// THE ASSIGN & FILTER EDITOR (docs/design-communication-panel.zh.md §7, §10;
// P2; the a4 UI design docs/design-communication-panel-ui.md — a1 A1–A6).
// One dialog per conversation: WHO is woken (an agent session or a task
// group — round-robin over its live members), WHAT wakes them (all messages
// or a filter of CLOSED rule kinds), HOW (a wake per batch or a digest per
// window), with WHAT authority (draft always; send only when BOTH caps allow
// it — otherwise the option is not drawn and the reason is), and how often
// at most (the per-assignment daily wake cap — pacing, not money).
//
// THE FORM HAS A RHYTHM (A3/A6): labels in the house 11/500, the short
// fields paired on a two-column grid (On / Deliver, Authority / Wakes per
// day), notes as 10px dim lines under the field they explain. RULE ROWS
// carry their own KIND SELECTOR (A4): `[kind ▾] [value…] [×]`, the add
// button under the list — never inside it at a rule's weight.
//
// THE LIVE ESTIMATE IS HONEST AND MEASURED AFTER THE FACT (§7.1/§7.2): every
// edit re-asks the server (the corpus never reaches the browser) and the
// answer is ONE compact stat line (`~4/day would wake · of ~12/day`) whose
// caveats (`sampled` / `truncated`, and once an assignment exists the
// measured rate since) are the HINT under it — a user asked to reason about
// a paid RATE is owed the measurement, not a paragraph.
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
import { icon, el, btn } from './channel-chrome.js';
import * as F from '../channel-filter.js';
import * as chanCaps from '../channel-caps.js';
// a3 i18n: route failures by CODE; a principal's kind and a Task Group's title in words.
import { routeErrorText, principalKindText, groupTitle } from './channel-words.js';

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
  if (!r || r.error) { showToast(routeErrorText(r), { type: 'error' }); return null; }
  return r;
}

function fieldLabel(text) { return el('div', 'chan-opt-label', text); }
function selectBox(options, value) {
  const s = el('select', 'chan-opt-input');
  for (const o of options) { const op = el('option', '', o.label); op.value = o.value; if (o.value === value) op.selected = true; if (o.disabled) op.disabled = true; s.appendChild(op); }
  return s;
}
function textInput(value, placeholder = '') { const i = el('input', 'chan-opt-input'); i.type = 'text'; i.value = value || ''; i.placeholder = placeholder; return i; }
function numberInput(value, { min = 0, max = 1000, step = 1 } = {}) { const i = el('input', 'chan-opt-input'); i.type = 'number'; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(value); return i; }
/** A labelled field on the two-column grid. */
function field(label, input) { const f = el('div', 'chan-af-field'); f.append(fieldLabel(label), input); return f; }
function noteEl(text, warn = false) { return el('div', 'chan-flow-note' + (warn ? ' chan-warn' : ''), text); }
/** A fresh rule of one kind (the shape the PURE validator expects). */
function freshRule(kind) { return kind === 'time-window' ? { kind, from: '09:00', to: '18:00' } : kind === 'sender-in-group' ? { kind, members: [] } : { kind, value: '' }; }

/** The per-lane latency sentence from the digest's structure. */
export function wakeLatencyText(wl) {
  const w = wl || {};
  const age = (s) => chanCaps.humanAge(s);
  switch (w.lane) {
    case 'push': return w.coalesceSeconds > 0
      ? t('Wakes arrive within ~{age} — push carries messages here; hits are coalesced for {n} s so a burst is one wake', { age: age(w.seconds), n: w.coalesceSeconds })
      : t('Wakes arrive within ~{age} — push carries messages here, one wake per message (coalescing is off)', { age: age(w.seconds) });
    case 'scan': return w.seconds === null || w.seconds === undefined
      ? t('No wake latency can be claimed: this scan lane has no source right now ({why})', { why: chanCaps.laneWhyText(w.why || 'no-source', { t }) })
      : t('Wakes arrive within ~{age} — this conversation is read by a scan of the local client ({source})', { age: age(w.seconds), source: chanCaps.scanSourceText(w.source, { t }) || '?' });
    case 'reconcile': return t('Wakes arrive within ~{age} — the poll is on its reconciliation cadence while push is declared exclusive', { age: age(w.seconds) });
    case 'poll': return w.kick
      ? t('Wakes arrive within ~{age} — push only kicks the cursor here; the poll carries the messages', { age: age(w.seconds) })
      : t('Wakes arrive within ~{age} — this conversation is polled', { age: age(w.seconds) });
    default: return t('Wake latency unknown');
  }
}

/** The estimate as ONE stat + its honesty hint. */
export function estimateParts(e, atSet, stats) {
  if (!e) return { stat: t('Estimating…'), hint: '' };
  const hints = [];
  if (e.truncated) hints.push(t('only {d} days of history are stored — the rate is over that span', { d: e.windowDays }));
  if (e.sampled) hints.push(t('only the newest {n} records were read; older ones exist unread', { n: e.total }));
  if (atSet && stats) hints.push(t('estimated ~{a}/day when set; actually {b}/day since (7-day measurement)', { a: atSet.matchedPerDay, b: Math.round((stats.hits7d / 7) * 10) / 10 }));
  return { stat: t('~{n}/day would wake (of ~{m}/day)', { n: e.matchedPerDay, m: e.totalPerDay }), hint: hints.join(' · ') };
}

/** The pattern rule labels (a CONVERSATION pattern, §7.3 — a closed set
 *  apart from the message rules above). */
const PATTERN_LABELS = () => ({
  'title': t('title contains'),
  'participant': t('includes the person'),
  'from-address': t('a message from (address or @domain)'),
  'kind': t('conversation kind is'),
});
const KIND_WORDS = () => ({ dm: t('direct message'), group: t('group'), thread: t('mail thread') });

/**
 * THE ONE FORM, used by all three grains (§7.3, 2026-09-26): WHO / WHAT /
 * HOW / AUTHORITY / PACING (+ receipts), the rule rows of a filtered
 * assignment, the live estimate line. `estimate(filter, form)` answers
 * `{stat, hint}` (the conversation reads its stored log; a scope reads its
 * conversations' logs server-side — the corpus never reaches the browser).
 * Returns `{ read(), reestimate, whoSel }`.
 */
function assignForm(app, body, { a = null, f = null, caps = { offersSend: false, sendWhy: 'unknown', policyRequiresReview: true }, estimate, latencyNote = null, stats = null, scope = 'conversation' } = {}) {
  // ── WHO ──
  const live = (app.sidebar && app.sidebar._webuiSessions) || [];
  const groups = (app.sidebar && app.sidebar._tasks) || [];
  const who = [];
  for (const s of live) {
    const cid = s.backendSessionId || s.claudeSessionId;
    if (!cid) continue;
    who.push({ value: `agent:${cid}`, label: t('Agent · {name}', { name: s.name || cid }), kind: 'agent', id: cid, name: s.name || null });
  }
  // a Task Group is named by its `title` (the field the store has; `name` was
  // never one, so every group showed as its id — a1 §2.4 A5); the
  // round-robin fact is the note under the field, not a parenthetical
  for (const g of groups) if (g && g.id) who.push({ value: `group:${g.id}`, label: t('Group · {name}', { name: groupTitle(g) }), kind: 'group', id: g.id, name: groupTitle(g) || null });
  if (a && !who.some((w) => w.kind === a.principal.kind && w.id === a.principal.id)) who.unshift({ value: `${a.principal.kind}:${a.principal.id}`, label: t('{kind} · {name} (not live now)', { kind: principalKindText(a.principal.kind), name: a.principal.name || a.principal.id }), kind: a.principal.kind, id: a.principal.id, name: a.principal.name || null });
  if (!who.length) who.push({ value: '', label: t('No live agent session or task group to assign to'), disabled: true });
  const whoSel = selectBox(who, a ? `${a.principal.kind}:${a.principal.id}` : who[0].value);
  body.appendChild(field(t('Wake'), whoSel));
  if (groups.length) body.appendChild(noteEl(t('A group wakes one of its live sessions in turn (round-robin).')));

  // ── WHAT + HOW on one grid ──
  const grid1 = el('div', 'chan-af-grid');
  const modeSel = selectBox([{ value: 'all', label: t('every message') }, { value: 'filtered', label: t('messages matching a filter') }], a ? a.mode : (f ? 'filtered' : 'all'));
  grid1.appendChild(field(t('On'), modeSel));
  const notifySel = selectBox([{ value: 'wake', label: t('wake the agent per batch') }, { value: 'digest', label: t('one digest per window') }], a ? a.notify : 'wake');
  grid1.appendChild(field(t('Deliver'), notifySel));
  body.appendChild(grid1);
  const digestRow = el('div', 'chan-af-row');
  digestRow.appendChild(el('span', 'chan-af-inline', t('Window (minutes)')));
  const digestMin = numberInput(a ? a.digestMinutes : F.DEFAULT_DIGEST_MINUTES, { min: F.MIN_DIGEST_MINUTES, max: F.MAX_DIGEST_MINUTES, step: 5 });
  digestRow.appendChild(digestMin);
  body.appendChild(digestRow);
  if (scope !== 'conversation') body.appendChild(noteEl(t('One digest per window for ALL the conversations this covers — never one per conversation.')));

  // ── THE FILTER: rule rows with their own kind selector, add under the list ──
  const rulesBox = el('div', 'chan-af-rules');
  const matchRow = el('div', 'chan-af-row');
  matchRow.appendChild(el('span', 'chan-af-inline', t('Match')));
  const matchSel = selectBox([{ value: 'any', label: t('any rule') }, { value: 'every', label: t('every rule') }], (f && f.match) || 'any');
  matchRow.appendChild(matchSel);
  rulesBox.appendChild(matchRow);
  const rulesList = el('div', 'chan-af-list');
  rulesBox.appendChild(rulesList);
  const addBtn = btn(t('Add rule'), null, 'chan-af-add');
  addBtn.prepend(icon('plus', 11));
  rulesBox.appendChild(addBtn);
  body.appendChild(rulesBox);

  const rules = (f && Array.isArray(f.rules) ? f.rules : []).map((r) => ({ ...r }));
  // a validator refusal in the device's words — its `code` (+ the rule kind, named
  // the way the row names it); the English `error` is the route's contract (a3 i18n)
  const problemWords = (v) => F.filterProblemText(v, { t, ruleLabel: (k) => RULE_LABELS()[k] || PATTERN_LABELS()[k] || k });
  function ruleRow(rule, idx) {
    const row = el('div', 'chan-af-rule');
    const kindSel = selectBox(F.RULE_KINDS.map((k) => ({ value: k, label: RULE_LABELS()[k] || k })), rule.kind);
    kindSel.title = t('Rule kind');
    kindSel.onchange = () => { rules[idx] = freshRule(kindSel.value); drawRules(); reestimate(); };
    row.appendChild(kindSel);
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
    if (fields.childNodes.length) row.appendChild(fields); else row.classList.add('chan-af-rule-nofield');
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'icon-btn chan-af-rm';
    rm.title = t('Remove');
    rm.appendChild(icon('close', 12));
    rm.onclick = () => { rules.splice(idx, 1); drawRules(); reestimate(); };
    row.appendChild(rm);
    return row;
  }
  function drawRules() {
    rulesList.textContent = '';
    if (!rules.length) rulesList.appendChild(noteEl(t('No rules yet — add one below. With no rule nothing matches (a wake is money, so the filter fails closed).')));
    rules.forEach((r, i) => rulesList.appendChild(ruleRow(r, i)));
  }
  addBtn.onclick = () => { rules.push(freshRule('keyword')); drawRules(); reestimate(); const last = rulesList.querySelector('.chan-af-rule:last-child input'); if (last) last.focus(); };
  drawRules();
  const syncMode = () => { rulesBox.style.display = modeSel.value === 'filtered' ? '' : 'none'; };
  modeSel.onchange = () => { syncMode(); reestimate(); };
  matchSel.onchange = () => reestimate();
  syncMode();

  // ── ESTIMATE (live) as ONE stat line + MEASUREMENT (after the fact) as its hint ──
  const est = el('div', 'chan-af-stat chan-flow-status', t('Estimating…'));
  const estHint = el('div', 'chan-af-stat-hint', '');
  body.append(est, estHint);
  let lastEstimate = null;
  let estTimer = null;
  function currentFilter() {
    if (modeSel.value !== 'filtered') return null;
    return { match: matchSel.value, rules: rules.map((r) => ({ ...r })) };
  }
  const capInpRef = { el: null };
  function reestimate() {
    if (estTimer) clearTimeout(estTimer);
    estTimer = setTimeout(async () => {
      estTimer = null;
      const filter = currentFilter();
      if (filter) { const v = F.validateFilter(filter); if (!v.ok) { est.className = 'chan-af-stat chan-flow-status chan-warn'; est.textContent = t('Filter is incomplete: {why}', { why: problemWords(v) }); estHint.textContent = ''; lastEstimate = null; return; } }
      const r = await estimate(filter, { notify: notifySel.value, digestMinutes: Number(digestMin.value), dailyWakeCap: capInpRef.el ? Number(capInpRef.el.value) : F.DEFAULT_DAILY_WAKE_CAP });
      if (!r || r.error) { est.className = 'chan-af-stat chan-flow-status chan-warn'; est.textContent = (r && r.error) || t('Estimate failed'); estHint.textContent = ''; lastEstimate = null; return; }
      lastEstimate = r.estimate;
      est.className = 'chan-af-stat chan-flow-status';
      est.textContent = r.stat;
      estHint.textContent = r.hint || '';
    }, 250);
  }
  notifySel.onchange = () => { syncNotify(); reestimate(); };
  const syncNotify = () => { digestRow.style.display = notifySel.value === 'digest' ? '' : 'none'; };
  syncNotify();
  digestMin.oninput = () => reestimate();
  if (latencyNote) body.appendChild(noteEl(latencyNote));

  // ── AUTHORITY + PACING on one grid ──
  const grid2 = el('div', 'chan-af-grid');
  // the cap is STRUCTURE (`{code, sendWhy}`) worded here with the device's `t`
  // (a3 i18n); the module's English `authorityCap()` sentence is the route's contract
  const capWords = (c) => F.authorityCapText(c, { t, sendWhyText: chanCaps.sendWhyText });
  const cap = F.authorityCapCode(caps);
  const authSel = selectBox(cap
    ? [{ value: 'draft', label: t('draft replies (the user approves)') }]
    : [{ value: 'draft', label: t('draft replies (the user approves)') }, { value: 'send', label: t('send replies directly') }],
    a && a.authority === 'send' && !cap ? 'send' : 'draft');
  grid2.appendChild(field(t('Authority'), authSel));
  const capInp = numberInput(a ? a.dailyWakeCap : F.DEFAULT_DAILY_WAKE_CAP, { min: 0, max: F.MAX_DAILY_WAKE_CAP, step: 1 });
  capInpRef.el = capInp;
  capInp.oninput = () => reestimate();
  grid2.appendChild(field(scope === 'conversation' ? t('Wakes per day (at most)') : t('Wakes per day (at most, for all of them together)'), capInp));
  body.appendChild(grid2);
  if (cap) body.appendChild(noteEl(t('Direct send is not offered here: {why}', { why: capWords(cap) })));
  if (a && a.authorityClamped) body.appendChild(noteEl(t('The stored authority is "send" but it reads as draft: {why}', { why: a.authorityWhyCap ? capWords(a.authorityWhyCap) : a.authorityWhy }), true));
  body.appendChild(noteEl(t('Pacing only — the account budget is the money bound.')));
  if (stats && stats.lastWake) {
    const lw = stats.lastWake;
    // the lane and the `refused` code are worded; the rule whys carry the
    // user's own rule values and stay verbatim (a3 i18n)
    body.appendChild(noteEl(lw.ok
      ? t('Last wake: {n} message(s) delivered via {lane} — {why}', { n: lw.n, lane: chanCaps.deliveryLaneText(lw.lane || 'message', { t }), why: lw.whys ? lw.whys.join(', ') : '' })
      : t('Last wake was held or stashed: {why}', { why: chanCaps.wakeRefusalText(lw.refused, { t }) || lw.why || '' }), !lw.ok));
  }
  if (stats && stats.pending) body.appendChild(noteEl(t('{n} matched message(s) are waiting for the next window or turn', { n: stats.pending })));

  // ── RECEIPTS (P3, decision 8): the outbox receipt never wakes the agent
  //    by default — it rides the next turn. Opting in is a billed turn per
  //    approval, and it says so (the house check row, a1 A2). ──
  const rwRow = el('label', 'dialog-check-row chan-opt-check');
  const rwInp = el('input'); rwInp.type = 'checkbox'; rwInp.checked = !!(a && a.receiptWake);
  rwRow.append(rwInp, el('span', '', t('Wake the agent with each outbox receipt')), el('span', 'dialog-check-hint', t('A billed turn per approval; off = the receipt rides its next turn.')));
  body.appendChild(rwRow);
  reestimate();

  function read() {
    const w = who.find((x) => x.value === whoSel.value);
    if (!w || !w.kind) return { error: t('Pick an agent or a group to wake.') };
    const filter = currentFilter();
    if (modeSel.value === 'filtered') { const v = F.validateFilter(filter); if (!v.ok) return { error: t('Filter is incomplete: {why}', { why: problemWords(v) }) }; }
    return { w, filter, lastEstimate, assignment: { principal: { kind: w.kind, id: w.id, name: w.name }, mode: modeSel.value, notify: notifySel.value, digestMinutes: Number(digestMin.value), authority: authSel.value, dailyWakeCap: Number(capInp.value), receiptWake: !!rwInp.checked } };
  }
  return { read, reestimate, whoSel };
}

/** The honest estimate as the form's ONE stat line (a conversation's). */
function statFor(e, atSet, stats) { return estimateParts(e, atSet, stats); }

/**
 * Open the editor for ONE conversation (the conversation grain). `conv` may
 * be a slim list row: the FULL view is fetched first (the list no longer
 * carries the filter, the caps, the latency or the measurement). Saves the
 * filter first (when filtered), then the assignment; unassign is its own
 * button. When the conversation has no assignment of its own, the grain it
 * INHERITS (the account's, a rule's) is said at the top.
 */
export async function showAssignFilterDialog(app, conv0) {
  const base = `/api/channels/${encodeURIComponent(conv0.adapterId)}/${encodeURIComponent(conv0.id)}`;
  const full = await fetchJson(base);
  if (!full || full.error) { showToast(routeErrorText(full), { type: 'error' }); return; }
  const conv = full.conversation;
  const { body, close } = createModalShell({ id: 'chan-assign-dialog', title: t('Assign & filter — {title}', { title: conv.title || conv.id }), dialogClass: 'chan-dialog chan-assign', escapeToClose: true });
  const a = conv.ownAssignment || null;
  const f = conv.filter || null;
  if (!a && conv.assignment && conv.assignment.source !== 'conversation') {
    const g = conv.assignment;
    body.appendChild(noteEl(g.source === 'account'
      ? t('Now this conversation follows the account\'s assignment ({who}). An assignment saved here takes over for this conversation only.', { who: g.principal.name || g.principal.id })
      : t('Now this conversation follows a rule ({rule} → {who}). An assignment saved here takes over for this conversation only.', { rule: g.patternLabel || '', who: g.principal.name || g.principal.id })));
  }
  const form = assignForm(app, body, {
    a, f, caps: conv.authorityCaps || undefined, stats: conv.stats, scope: 'conversation',
    latencyNote: wakeLatencyText(conv.wakeLatency),
    estimate: async (filter) => {
      const r = await fetchJson(`${base}/estimate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter }) });
      if (!r || r.error) return { error: (r && r.error) || t('Estimate failed') };
      const parts = statFor(r.estimate, a && a.estimateAtSet, conv.stats);
      return { estimate: r.estimate, stat: parts.stat, hint: parts.hint };
    },
  });

  // ── ACTIONS: Unassign left, Cancel + Save (primary) right ──
  const actions = el('div', 'chan-flow-actions');
  if (a) {
    const un = btn(t('Unassign'), null);
    un.onclick = async () => { un.disabled = true; const r = await api(`${base}/assignment`, { assignment: null }); un.disabled = false; if (r) { showToast(t('Unassigned')); close(); } };
    actions.appendChild(un);
    actions.appendChild(el('span', 'chan-sp'));
  }
  actions.appendChild(btn(t('Cancel'), close));
  const save = btn(t('Save'), null, 'mounts-btn-primary');
  save.onclick = async () => {
    const v = form.read();
    if (v.error) { showToast(v.error, { type: 'error' }); return; }
    save.disabled = true;
    try {
      let filterId = null;
      if (v.assignment.mode === 'filtered') {
        const fr = await api(`${base}/filter`, { filter: v.filter, estimate: v.lastEstimate });
        if (!fr) return;
        filterId = fr.filter && fr.filter.id;
      }
      const ar = await api(`${base}/assignment`, { assignment: { ...v.assignment, filterId }, estimateAtSet: v.lastEstimate });
      if (!ar) return;
      showToast(t('Assigned: {name} wakes on this conversation', { name: v.w.name || v.w.id }));
      close();
    } finally { save.disabled = false; }
  };
  actions.appendChild(save);
  body.appendChild(actions);
}

/**
 * THE ACCOUNT AND PATTERN GRAINS (2026-09-26, design §7.3) — the SAME form.
 * `scope.kind === 'account'`: the whole account (one per account).
 * `scope.kind === 'pattern'`: the conversations matching a rule over their
 * facts (title / a person / an address / the kind), now and later; `scope.id`
 * edits an existing rule. The estimate covers every conversation the grain
 * would own and folds notify + the daily cap into "about N wakes a day".
 */
export function showScopeAssignDialog(app, adapter, scope = { kind: 'account' }) {
  const kind = scope.kind === 'pattern' ? 'pattern' : 'account';
  const existing = kind === 'account' ? (adapter.assignment || null) : ((adapter.patterns || []).find((p) => p.id === scope.id) || null);
  const title = kind === 'account' ? t('Hand the whole account to an agent — {label}', { label: adapter.label || adapter.id }) : t('Conversations matching a rule — {label}', { label: adapter.label || adapter.id });
  const { body, close } = createModalShell({ id: 'chan-scope-assign-dialog', title, dialogClass: 'chan-dialog chan-assign', escapeToClose: true });
  body.appendChild(noteEl(kind === 'account'
    ? t('Every conversation of this account — now and later — wakes this agent, except one that has an assignment of its own or matches a rule. The agent can read all of them.')
    : t('Every conversation that matches the rule — now and later — wakes this agent, unless it has an assignment of its own. The agent can read exactly those.')));
  // THE PATTERN (conversation facts, a closed set) — only for the pattern grain
  const pat = existing && existing.pattern ? { match: existing.pattern.match, rules: existing.pattern.rules.map((r) => ({ ...r })) } : { match: 'any', rules: [{ kind: 'title', value: '' }] };
  let reest = () => {};
  if (kind === 'pattern') {
    const box = el('div', 'chan-af-rules chan-pat-rules');
    const mrow = el('div', 'chan-af-row');
    mrow.appendChild(el('span', 'chan-af-inline', t('Conversations where')));
    const msel = selectBox([{ value: 'any', label: t('any rule holds') }, { value: 'every', label: t('every rule holds') }], pat.match);
    msel.onchange = () => { pat.match = msel.value; reest(); };
    mrow.appendChild(msel);
    box.appendChild(mrow);
    const plist = el('div', 'chan-af-list');
    box.appendChild(plist);
    const padd = btn(t('Add rule'), null, 'chan-af-add');
    padd.prepend(icon('plus', 11));
    box.appendChild(padd);
    const draw = () => {
      plist.textContent = '';
      pat.rules.forEach((r, idx) => {
        const row = el('div', 'chan-af-rule');
        const ks = selectBox(F.CONV_RULE_KINDS.map((k) => ({ value: k, label: PATTERN_LABELS()[k] || k })), r.kind);
        ks.onchange = () => { pat.rules[idx] = { kind: ks.value, value: ks.value === 'kind' ? 'group' : '' }; draw(); reest(); };
        row.appendChild(ks);
        const fields = el('span', 'chan-af-fields');
        if (r.kind === 'kind') {
          const vs = selectBox(F.CONV_KINDS.map((k) => ({ value: k, label: KIND_WORDS()[k] || k })), r.value || 'group');
          vs.onchange = () => { r.value = vs.value; reest(); };
          fields.appendChild(vs);
        } else {
          const inp = textInput(r.value, r.kind === 'from-address' ? 'name@example.com / @example.com' : t('text'));
          inp.oninput = () => { r.value = inp.value; reest(); };
          fields.appendChild(inp);
        }
        row.appendChild(fields);
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'icon-btn chan-af-rm'; rm.title = t('Remove');
        rm.appendChild(icon('close', 12));
        rm.onclick = () => { pat.rules.splice(idx, 1); draw(); reest(); };
        row.appendChild(rm);
        plist.appendChild(row);
      });
    };
    padd.onclick = () => { pat.rules.push({ kind: 'title', value: '' }); draw(); reest(); };
    draw();
    body.appendChild(field(t('Which conversations'), box));
  }
  const patternWords = (v) => F.filterProblemText(v, { t, ruleLabel: (k) => PATTERN_LABELS()[k] || k });
  const form = assignForm(app, body, {
    a: existing, f: existing && existing.filter ? existing.filter : null, scope: kind,
    caps: { offersSend: (adapter.sendAs || []).length > 0, sendWhy: (adapter.sendAs || []).length ? null : 'read-only-adapter', policyRequiresReview: true },
    estimate: async (filter, how) => {
      if (kind === 'pattern') { const pv = F.validatePattern(pat); if (!pv.ok) return { error: t('The rule is incomplete: {why}', { why: patternWords(pv) }) }; }
      const r = await fetchJson(`/api/channels/adapters/${encodeURIComponent(adapter.id)}/estimate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: { kind }, pattern: kind === 'pattern' ? pat : undefined, filter, ...how }) });
      if (!r || r.error) return { error: (r && r.error) || t('Estimate failed') };
      const e = r.estimate;
      const hints = [t('over {n} conversations', { n: e.conversations })];
      if (e.sampled) hints.push(t('sampled — {k} of them read, the newest records only', { k: e.covered }));
      if (e.truncated) hints.push(t('only {d} days of history are stored — the rate is over that span', { d: e.windowDays }));
      return { estimate: { ...e, conversations: e.conversations }, stat: t('about {n} wakes a day (~{m} matching messages a day)', { n: Math.round(r.expectedWakesPerDay * 10) / 10, m: e.matchedPerDay }), hint: hints.join(' · ') };
    },
  });
  reest = () => form.reestimate();
  const actions = el('div', 'chan-flow-actions');
  const base = kind === 'account' ? `/api/channels/adapters/${encodeURIComponent(adapter.id)}/assignment` : `/api/channels/adapters/${encodeURIComponent(adapter.id)}/patterns`;
  if (existing) {
    const un = btn(kind === 'account' ? t('Stop handing the account') : t('Remove the rule'), null);
    un.onclick = async () => {
      un.disabled = true;
      const r = kind === 'account' ? await api(base, { assignment: null }) : await api(`${base}/${encodeURIComponent(existing.id)}`, {}, 'DELETE');
      un.disabled = false;
      if (r) { showToast(t('Unassigned')); close(); }
    };
    actions.appendChild(un);
    actions.appendChild(el('span', 'chan-sp'));
  }
  actions.appendChild(btn(t('Cancel'), close));
  const save = btn(t('Save'), null, 'mounts-btn-primary');
  save.onclick = async () => {
    const v = form.read();
    if (v.error) { showToast(v.error, { type: 'error' }); return; }
    if (kind === 'pattern') { const pv = F.validatePattern(pat); if (!pv.ok) { showToast(t('The rule is incomplete: {why}', { why: patternWords(pv) }), { type: 'error' }); return; } }
    save.disabled = true;
    try {
      const assignment = { ...v.assignment, ...(v.assignment.mode === 'filtered' ? { filter: v.filter } : {}), ...(kind === 'pattern' ? { pattern: pat } : {}) };
      const r = kind === 'account'
        ? await api(base, { assignment, estimateAtSet: v.lastEstimate })
        : existing ? await api(`${base}/${encodeURIComponent(existing.id)}`, { assignment, estimateAtSet: v.lastEstimate })
          : await api(base, { assignment, estimateAtSet: v.lastEstimate }, 'POST');
      if (!r) return;
      showToast(kind === 'account' ? t('The account is handed to {name}', { name: v.w.name || v.w.id }) : t('The rule is saved: matching conversations wake {name}', { name: v.w.name || v.w.id }));
      close();
    } finally { save.disabled = false; }
  };
  actions.appendChild(save);
  body.appendChild(actions);
}

/** The one-line summary the panel row and the window bar draw — the
 *  assignment IN EFFECT; an inherited one says where from (2026-09-26:
 *  "(account)" / "(rule)"). */
export function assignmentSummary(conv) {
  const a = conv && conv.assignment;
  if (!a) return '';
  const who = a.principal.name || a.principal.id;
  const what = a.mode === 'filtered' ? t('filtered') : t('all messages');
  const how = a.notify === 'digest' ? t('digest every {m} min', { m: a.digestMinutes }) : t('wake');
  const s = conv.stats || {};
  const hits = a.hits7d !== undefined ? a.hits7d : s.hits7d;
  const measured = hits !== undefined ? t('{n} hits / 7d', { n: hits }) : '';
  const from = a.source === 'account' ? t('(account)') : a.source === 'pattern' ? t('(rule)') : '';
  // no leading '→': the row and the chip prepend an SVG glyph (§17 — never a text symbol)
  return [who, what, how, a.authority === 'send' ? t('may send') : t('drafts'), measured, from].filter(Boolean).join(' · ');
}

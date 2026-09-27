// ACCESS AND NOTIFICATION — TWO OPERATIONS, ACCESS FIRST (R4, the owner
// 2026-09-27: "你之前的交互的问题是把'让agent能访问对话'和'让agent会被通知'
// 耦合在一起了" / "这实际上应该是两种不同的操作，前者是后者的前提"; docs/
// design-communication-panel.zh.md §7.3 R4). Two dialogs, one per operation,
// at each of the three grains (a conversation, the whole account, the
// conversations a rule matches):
//
//  · GRANT ACCESS… (`showGrantAccessDialog`) — who may SEE and ACT: a row per
//    agent session or Task Group with its authority (draft — the user
//    approves; send — directly, only where both caps allow it, otherwise the
//    option is not drawn and the reason is). Access alone wakes nobody. A
//    rule's pattern is edited here (the rule IS its access grain).
//  · NOTIFY… (`showNotifyDialog`) — who is WOKEN and on what: a row per
//    watcher whose picker offers ONLY the principals that already hold access
//    at this grain (none ⇒ the empty state points at Grant access…); each row
//    carries the pre-R4 fields — On (every message / a filter of CLOSED rule
//    kinds), Deliver (a wake per batch / one digest per window), the window,
//    the per-watcher daily cap (its OWN ledger), the receipt opt-in — and its
//    own honest estimate; the total sums every row's ceiling. A number past
//    its bound (window 1440 min, cap 1000/day) is CLAMPED VISIBLY: the field
//    says "kept at the maximum, N" (the 2026-09-26 hotfix found the owner's
//    9999 silently read as 1440).
//
// THE FORM HAS A RHYTHM (A3/A6): labels in the house 11/500, the short
// fields paired on a two-column grid, notes as 10px dim lines under the
// field they explain; RULE ROWS carry their own KIND SELECTOR (A4). THE
// LIVE ESTIMATE IS HONEST AND MEASURED AFTER THE FACT (§7.1/§7.2): every edit
// re-asks the server (the corpus never reaches the browser). THE LATENCY
// CLAIM IS PER LANE (§19 P2). Every string is textContent (channel-chrome's
// primitives), never innerHTML. The rule kinds and their validation are the
// PURE module's own (src/channel-filter.js, bundled like channel-caps), so a
// dialog cannot draw a rule — or a watcher without access — the route would
// refuse.
import { fetchJson, showToast, createModalShell, showContextMenu } from './utils.js';
import { t } from './i18n.js';
import { icon, el, btn } from './channel-chrome.js';
import * as F from '../channel-filter.js';
import * as chanCaps from '../channel-caps.js';
// a3 i18n: route failures by CODE; a principal's kind and a Task Group's title in words.
import { routeErrorText, principalKindText, groupTitle, principalText, accessAuthorityText, watcherHowText, grainSummaryText, clampNoteText } from './channel-words.js';

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
const pkOf = (p) => (p && p.kind && p.id ? `${p.kind}:${p.id}` : '');
const JSON_HDR = { 'Content-Type': 'application/json' };

/** Every principal the owner may give access to: the live agent sessions
 *  and the Task Groups (named by their `title` — a1 §2.4 A5), plus any
 *  principal a stored row names that is not live now (kept, said so). */
function principalChoices(app, stored = []) {
  const live = (app.sidebar && app.sidebar._webuiSessions) || [];
  const groups = (app.sidebar && app.sidebar._tasks) || [];
  const out = [];
  for (const s of live) {
    const cid = s.backendSessionId || s.claudeSessionId;
    if (!cid || out.some((w) => w.kind === 'agent' && w.id === cid)) continue;
    out.push({ value: `agent:${cid}`, label: t('Agent · {name}', { name: s.name || cid }), kind: 'agent', id: cid, name: s.name || null });
  }
  for (const g of groups) if (g && g.id) out.push({ value: `group:${g.id}`, label: t('Group · {name}', { name: groupTitle(g) }), kind: 'group', id: g.id, name: groupTitle(g) || null });
  for (const r of stored) {
    const p = r && r.principal;
    if (!p || out.some((w) => w.kind === p.kind && w.id === p.id)) continue;
    out.unshift({ value: pkOf(p), label: t('{kind} · {name} (not live now)', { kind: principalKindText(p.kind), name: p.name || p.id }), kind: p.kind, id: p.id, name: p.name || null });
  }
  return out;
}

/**
 * Where a grain lives + its two lists NOW (the dialogs re-read before they
 * draw): `target` = `{kind:'conversation', conv}` | `{kind:'account',
 * adapter}` | `{kind:'pattern', adapter, id?}` (no id = a NEW rule).
 */
async function grainState(target) {
  if (target.kind === 'conversation') {
    const c0 = target.conv;
    const base = `/api/channels/${encodeURIComponent(c0.adapterId)}/${encodeURIComponent(c0.id)}`;
    const full = await fetchJson(base);
    if (!full || full.error) { showToast(routeErrorText(full), { type: 'error' }); return null; }
    const conv = full.conversation;
    const own = conv.own || { access: [], watchers: [] };
    return {
      kind: 'conversation', target, conv, name: conv.title || conv.id, base,
      access: own.access || [], watchers: own.watchers || [],
      caps: conv.authorityCaps || { offersSend: false, sendWhy: 'unknown', policyRequiresReview: true },
      latencyNote: wakeLatencyText(conv.wakeLatency), stats: conv.stats || null,
      inherited: (conv.watchers || []).filter((w) => w.source && w.source !== 'conversation'),
      accessUrl: `${base}/access`, watchersUrl: `${base}/watchers`,
      estimate: async (filter) => {
        const r = await fetchJson(`${base}/estimate`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ filter }) });
        if (!r || r.error) return { error: (r && r.error) || t('Estimate failed') };
        const parts = estimateParts(r.estimate, null, conv.stats);
        return { estimate: r.estimate, stat: parts.stat, hint: parts.hint };
      },
    };
  }
  const a = target.adapter;
  const aid = encodeURIComponent(a.id);
  const caps = { offersSend: (a.sendAs || []).length > 0, sendWhy: (a.sendAs || []).length ? null : 'read-only-adapter', policyRequiresReview: !(a.policy && a.policy.mode === 'direct') };
  const scopeEstimate = (kind, pattern) => async (filter, how, principal) => {
    if (kind === 'pattern') { const pv = F.validatePattern(pattern()); if (!pv.ok) return { error: t('The rule is incomplete: {why}', { why: F.filterProblemText(pv, { t, ruleLabel: (k) => PATTERN_LABELS()[k] || k }) }) }; }
    const r = await fetchJson(`/api/channels/adapters/${aid}/estimate`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ scope: { kind }, pattern: kind === 'pattern' ? pattern() : undefined, filter, ...how, principal }) });
    if (!r || r.error) return { error: (r && r.error) || t('Estimate failed') };
    const e = r.estimate;
    const hints = [t('over {n} conversations', { n: e.conversations })];
    if (e.sampled) hints.push(t('sampled — {k} of them read, the newest records only', { k: e.covered }));
    if (e.truncated) hints.push(t('only {d} days of history are stored — the rate is over that span', { d: e.windowDays }));
    return { estimate: e, expected: r.expectedWakesPerDay, stat: t('about {n} wakes a day (~{m} matching messages a day)', { n: Math.round(r.expectedWakesPerDay * 10) / 10, m: e.matchedPerDay }), hint: hints.join(' · ') };
  };
  if (target.kind === 'account') {
    const g = a.accountGrain || { access: [], watchers: [] };
    return { kind: 'account', target, adapter: a, name: a.label || a.id, access: g.access || [], watchers: g.watchers || [], caps, accessUrl: `/api/channels/adapters/${aid}/access`, watchersUrl: `/api/channels/adapters/${aid}/watchers`, estimate: scopeEstimate('account') };
  }
  const pa = target.id ? (a.patterns || []).find((p) => p.id === target.id) : null;
  if (target.id && !pa) { showToast(t('That rule no longer exists'), { type: 'error' }); return null; }
  const pat = pa && pa.pattern ? { match: pa.pattern.match, rules: pa.pattern.rules.map((r) => ({ ...r })) } : { match: 'any', rules: [{ kind: 'title', value: '' }] };
  return {
    kind: 'pattern', target, adapter: a, id: pa ? pa.id : null, name: a.label || a.id, pattern: pat, patternLabel: pa ? pa.patternLabel : null,
    access: pa ? (pa.access || []) : [], watchers: pa ? (pa.watchers || []) : [], caps,
    accessUrl: pa ? `/api/channels/adapters/${aid}/patterns/${encodeURIComponent(pa.id)}/access` : `/api/channels/adapters/${aid}/patterns`,
    watchersUrl: pa ? `/api/channels/adapters/${aid}/patterns/${encodeURIComponent(pa.id)}/watchers` : null,
    estimate: scopeEstimate('pattern', () => pat),
  };
}
async function put(url, body, method = 'PUT') {
  const r = await fetchJson(url, { method, headers: JSON_HDR, body: JSON.stringify(body) });
  if (!r || r.error) { showToast(routeErrorText(r, { ruleLabel: (k, which) => (which === 'pattern' ? PATTERN_LABELS()[k] : RULE_LABELS()[k]) || k }), { type: 'error' }); return null; }
  return r;
}
const grainTitle = (st, what) => (st.kind === 'conversation'
  ? (what === 'access' ? t('Grant access — {title}', { title: st.name }) : t('Notify — {title}', { title: st.name }))
  : st.kind === 'account'
    ? (what === 'access' ? t('Grant access to the whole account — {label}', { label: st.name }) : t('Notify on the whole account — {label}', { label: st.name }))
    : (what === 'access' ? t('Grant access to the conversations matching a rule — {label}', { label: st.name }) : t('Notify on the conversations matching a rule — {label}', { label: st.name })));

/** The rule editor of a PATTERN grain (conversation facts, a closed set). */
function patternEditor(body, pat, onChange) {
  const box = el('div', 'chan-af-rules chan-pat-rules');
  const mrow = el('div', 'chan-af-row');
  mrow.appendChild(el('span', 'chan-af-inline', t('Conversations where')));
  const msel = selectBox([{ value: 'any', label: t('any rule holds') }, { value: 'every', label: t('every rule holds') }], pat.match);
  msel.onchange = () => { pat.match = msel.value; onChange(); };
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
      ks.onchange = () => { pat.rules[idx] = { kind: ks.value, value: ks.value === 'kind' ? 'group' : '' }; draw(); onChange(); };
      row.appendChild(ks);
      const fields = el('span', 'chan-af-fields');
      if (r.kind === 'kind') {
        const vs = selectBox(F.CONV_KINDS.map((k) => ({ value: k, label: KIND_WORDS()[k] || k })), r.value || 'group');
        vs.onchange = () => { r.value = vs.value; onChange(); };
        fields.appendChild(vs);
      } else {
        const inp = textInput(r.value, r.kind === 'from-address' ? 'name@example.com / @example.com' : t('text'));
        inp.oninput = () => { r.value = inp.value; onChange(); };
        fields.appendChild(inp);
      }
      row.appendChild(fields);
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'icon-btn chan-af-rm'; rm.title = t('Remove');
      rm.appendChild(icon('close', 12));
      rm.onclick = () => { pat.rules.splice(idx, 1); draw(); onChange(); };
      row.appendChild(rm);
      plist.appendChild(row);
    });
  };
  padd.onclick = () => { pat.rules.push({ kind: 'title', value: '' }); draw(); onChange(); };
  draw();
  body.appendChild(field(t('Which conversations'), box));
}

/**
 * GRANT ACCESS… — the FIRST operation. One row per agent or group with its
 * authority; Add / Remove; Save writes the grain's whole access list (a rule
 * with its pattern). Removing a principal's access removes its notification
 * in the same write (said under the rows before the save).
 */
export async function showGrantAccessDialog(app, target) {
  const st = await grainState(target);
  if (!st) return;
  const { body, close } = createModalShell({ id: 'chan-access-dialog', title: grainTitle(st, 'access'), dialogClass: 'chan-dialog chan-assign chan-access', escapeToClose: true });
  body.appendChild(noteEl(st.kind === 'account'
    ? t('Who may see every conversation of this account — now and later — and act on them: read, search, refresh, reply (and write a new message where the account can). Access alone never wakes anyone.')
    : st.kind === 'pattern'
      ? t('Who may see the conversations that match the rule — now and later — and act on them. Access alone never wakes anyone.')
      : t('Who may see this conversation and act on it: read, search, refresh and reply. Access alone never wakes anyone.')));
  if (st.kind === 'pattern') patternEditor(body, st.pattern, () => {});
  const choices = principalChoices(app, st.access);
  const cap = F.authorityCapCode(st.caps);
  const capWords = (c) => F.authorityCapText(c, { t, sendWhyText: chanCaps.sendWhyText });
  const rows = st.access.map((r) => ({ key: pkOf(r.principal), authority: r.authority === 'send' && !cap ? 'send' : 'draft' }));
  if (!rows.length && choices.length) rows.push({ key: choices[0].value, authority: 'draft' });
  const list = el('div', 'chan-access-list');
  body.appendChild(fieldLabel(t('Access')));
  body.appendChild(list);
  const addB = btn(t('Add an agent or group'), null, 'chan-af-add');
  addB.prepend(icon('plus', 11));
  body.appendChild(addB);
  const watchedNote = noteEl('', true);
  body.appendChild(watchedNote);
  if (cap) body.appendChild(noteEl(t('Direct send is not offered here: {why}', { why: capWords(cap) })));
  for (const r of st.access) if (r.authorityClamped) body.appendChild(noteEl(`${principalText(r.principal)}: ${t('The stored authority is "send" but it reads as draft: {why}', { why: r.authorityWhyCap ? capWords(r.authorityWhyCap) : r.authorityWhy })}`, true));
  const draw = () => {
    list.textContent = '';
    if (!rows.length) list.appendChild(noteEl(t('Nobody has access — saving removes everyone\'s access (and their notifications).')));
    rows.forEach((r, i) => {
      const row = el('div', 'chan-access-row');
      row.dataset.principal = r.key;
      const used = new Set(rows.filter((x, j) => j !== i).map((x) => x.key));
      const who = selectBox(choices.filter((c) => !used.has(c.value)).map((c) => ({ value: c.value, label: c.label })), r.key);
      who.onchange = () => { r.key = who.value; draw(); };
      who.title = t('Agent or group');
      const auth = selectBox(cap ? [{ value: 'draft', label: t('draft replies (the user approves)') }] : [{ value: 'draft', label: t('draft replies (the user approves)') }, { value: 'send', label: t('send replies directly') }], r.authority);
      auth.onchange = () => { r.authority = auth.value; };
      auth.title = t('Authority');
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'icon-btn chan-af-rm'; rm.title = t('Remove'); rm.setAttribute('aria-label', t('Remove'));
      rm.appendChild(icon('close', 12));
      rm.onclick = () => { rows.splice(i, 1); draw(); };
      row.append(who, auth, rm);
      list.appendChild(row);
    });
    const free = choices.filter((c) => !rows.some((r) => r.key === c.value));
    addB.style.display = free.length ? '' : 'none';
    const gone = st.watchers.filter((w) => !rows.some((r) => r.key === pkOf(w.principal)));
    watchedNote.textContent = gone.length ? t('Removing access also removes the notification of: {list}', { list: gone.map((w) => principalText(w.principal)).join(', ') }) : '';
    watchedNote.style.display = gone.length ? '' : 'none';
  };
  addB.onclick = () => { const free = choices.find((c) => !rows.some((r) => r.key === c.value)); if (free) { rows.push({ key: free.value, authority: 'draft' }); draw(); } };
  draw();
  const actions = el('div', 'chan-flow-actions');
  if (st.kind === 'pattern' && st.id) {
    const rmRule = btn(t('Remove the rule'), async () => { rmRule.disabled = true; const r = await put(`/api/channels/adapters/${encodeURIComponent(st.adapter.id)}/patterns/${encodeURIComponent(st.id)}`, {}, 'DELETE'); rmRule.disabled = false; if (r) { showToast(t('The rule is removed — its access and notifications with it')); close(); } });
    actions.append(rmRule, el('span', 'chan-sp'));
  }
  if (st.access.length && (st.kind !== 'pattern' || st.id)) {
    const notify = btn(t('Notify…'), () => { close(); showNotifyDialog(app, target); });
    actions.append(notify, el('span', 'chan-sp'));
  }
  actions.appendChild(btn(t('Cancel'), close));
  const save = btn(t('Save'), null, 'mounts-btn-primary');
  save.onclick = async () => {
    const access = rows.map((r) => { const c = choices.find((x) => x.value === r.key); return c ? { principal: { kind: c.kind, id: c.id, name: c.name }, authority: r.authority } : null; }).filter(Boolean);
    const v = F.validateAccess(access, st.caps);
    if (!v.ok) { showToast(routeErrorText({ code: v.code, error: v.error, why: v.why, principal: v.principal }), { type: 'error' }); return; }
    if (st.kind === 'pattern') { const pv = F.validatePattern(st.pattern); if (!pv.ok) { showToast(t('The rule is incomplete: {why}', { why: F.filterProblemText(pv, { t, ruleLabel: (k) => PATTERN_LABELS()[k] || k }) }), { type: 'error' }); return; } }
    if (st.kind === 'pattern' && !access.length) { showToast(t('A rule needs at least one agent or group with access'), { type: 'error' }); return; }
    save.disabled = true;
    try {
      const r = st.kind === 'pattern'
        ? (st.id ? await put(st.accessUrl, { access, pattern: st.pattern }) : await put(st.accessUrl, { pattern: st.pattern, access }, 'POST'))
        : await put(st.accessUrl, { access });
      if (!r) return;
      const names = access.map((a) => principalText(a.principal)).join(', ');
      showToast(access.length ? t('Access saved: {list} — nobody is woken unless you add a notification (Notify…)', { list: names }) : t('Access removed'));
      close();
    } finally { save.disabled = false; }
  };
  actions.appendChild(save);
  body.appendChild(actions);
}

/** One WATCHER row of the Notify dialog — the pre-R4 form's fields for ONE
 *  principal the grain already gave access to. */
function watcherRow(host, { w = null, f = null, st, principals, onAnyChange, onRemove }) {
  const box = el('div', 'chan-watch-row');
  const head = el('div', 'chan-watch-head');
  const whoSel = el('select', 'chan-opt-input');
  whoSel.title = t('Who is notified');
  const rm = document.createElement('button');
  rm.type = 'button'; rm.className = 'icon-btn chan-af-rm'; rm.title = t('Remove this notification'); rm.setAttribute('aria-label', t('Remove this notification'));
  rm.appendChild(icon('close', 12));
  rm.onclick = () => onRemove();
  head.append(whoSel, rm);
  box.appendChild(head);
  let key = w ? pkOf(w.principal) : '';
  const authNote = noteEl('');
  let whoSig = null;
  const setWho = (usedByOthers) => {
    // rebuild the options only when what they offer changed (an estimate
    // landing must not close a dropdown the user has open)
    const sig = `${key}|${[...usedByOthers].sort().join(',')}`;
    if (sig === whoSig) return;
    whoSig = sig;
    whoSel.textContent = '';
    for (const p of principals) {
      if (usedByOthers.has(p.value) && p.value !== key) continue;
      const op = el('option', '', p.label); op.value = p.value; if (p.value === key) op.selected = true; whoSel.appendChild(op);
    }
    if (!key && whoSel.options.length) { key = whoSel.options[0].value; whoSel.value = key; }
    const p = principals.find((x) => x.value === key);
    authNote.textContent = p ? t('Authority comes from its access: {authority}', { authority: accessAuthorityText(p.authority) }) : '';
  };
  whoSel.onchange = () => { key = whoSel.value; onAnyChange(); reestimate(); };
  // ── WHAT + HOW on one grid ──
  const grid1 = el('div', 'chan-af-grid');
  const modeSel = selectBox([{ value: 'all', label: t('every message') }, { value: 'filtered', label: t('messages matching a filter') }], w ? w.mode : 'all');
  grid1.appendChild(field(t('On'), modeSel));
  const notifySel = selectBox([{ value: 'wake', label: t('wake the agent per batch') }, { value: 'digest', label: t('one digest per window') }], w ? w.notify : 'wake');
  grid1.appendChild(field(t('Deliver'), notifySel));
  box.appendChild(grid1);
  const digestRow = el('div', 'chan-af-row');
  digestRow.appendChild(el('span', 'chan-af-inline', t('Window (minutes)')));
  const digestMin = numberInput(w ? w.digestMinutes : F.DEFAULT_DIGEST_MINUTES, { min: F.MIN_DIGEST_MINUTES, max: F.MAX_DIGEST_MINUTES, step: 5 });
  digestRow.appendChild(digestMin);
  box.appendChild(digestRow);
  const digestClamp = noteEl('', true);
  digestClamp.dataset.clamp = 'digest';
  box.appendChild(digestClamp);
  if (st.kind !== 'conversation') box.appendChild(noteEl(t('One digest per window for ALL the conversations this covers — never one per conversation.')));
  // ── THE FILTER ──
  const rulesBox = el('div', 'chan-af-rules');
  const matchRow = el('div', 'chan-af-row');
  matchRow.appendChild(el('span', 'chan-af-inline', t('Match')));
  const matchSel = selectBox([{ value: 'any', label: t('any rule') }, { value: 'every', label: t('every rule') }], (f && f.match) || 'any');
  matchRow.appendChild(matchSel);
  rulesBox.appendChild(matchRow);
  const rulesList = el('div', 'chan-af-list');
  rulesBox.appendChild(rulesList);
  const addRule = btn(t('Add rule'), null, 'chan-af-add');
  addRule.prepend(icon('plus', 11));
  rulesBox.appendChild(addRule);
  box.appendChild(rulesBox);
  const rules = (f && Array.isArray(f.rules) ? f.rules : []).map((r) => ({ ...r }));
  const problemWords = (v) => F.filterProblemText(v, { t, ruleLabel: (k) => RULE_LABELS()[k] || PATTERN_LABELS()[k] || k });
  function ruleRow(rule, idx) {
    const row = el('div', 'chan-af-rule');
    const kindSel = selectBox(F.RULE_KINDS.map((k) => ({ value: k, label: RULE_LABELS()[k] || k })), rule.kind);
    kindSel.title = t('Rule kind');
    kindSel.onchange = () => { rules[idx] = freshRule(kindSel.value); drawRules(); reestimate(); };
    row.appendChild(kindSel);
    const fields = el('span', 'chan-af-fields');
    const bind = (inp, k, transform = (v) => v) => { inp.oninput = () => { rule[k] = transform(inp.value); reestimate(); }; fields.appendChild(inp); };
    switch (rule.kind) {
      case 'mention': bind(textInput(rule.value, t('name or id')), 'value'); break;
      case 'keyword': case 'not-contains': case 'subject': case 'from-address': bind(textInput(rule.value, t('text')), 'value'); break;
      case 'sender-in-group': bind(textInput(Array.isArray(rule.members) ? rule.members.join(', ') : (rule.value || ''), t('ids or names, comma-separated')), 'members', (v) => v.split(',').map((x) => x.trim()).filter(Boolean)); break;
      case 'has-attachment': break;
      case 'time-window': bind(textInput(rule.from || '09:00', 'HH:MM'), 'from'); bind(textInput(rule.to || '18:00', 'HH:MM'), 'to'); break;
      default: break;
    }
    if (fields.childNodes.length) row.appendChild(fields); else row.classList.add('chan-af-rule-nofield');
    const rmR = document.createElement('button');
    rmR.type = 'button'; rmR.className = 'icon-btn chan-af-rm'; rmR.title = t('Remove');
    rmR.appendChild(icon('close', 12));
    rmR.onclick = () => { rules.splice(idx, 1); drawRules(); reestimate(); };
    row.appendChild(rmR);
    return row;
  }
  function drawRules() {
    rulesList.textContent = '';
    if (!rules.length) rulesList.appendChild(noteEl(t('No rules yet — add one below. With no rule nothing matches (a wake is money, so the filter fails closed).')));
    rules.forEach((r, i) => rulesList.appendChild(ruleRow(r, i)));
  }
  addRule.onclick = () => { rules.push(freshRule('keyword')); drawRules(); reestimate(); const last = rulesList.querySelector('.chan-af-rule:last-child input'); if (last) last.focus(); };
  drawRules();
  const syncMode = () => { rulesBox.style.display = modeSel.value === 'filtered' ? '' : 'none'; };
  modeSel.onchange = () => { syncMode(); reestimate(); };
  matchSel.onchange = () => reestimate();
  syncMode();
  // ── ESTIMATE (live) ──
  const est = el('div', 'chan-af-stat chan-flow-status', t('Estimating…'));
  const estHint = el('div', 'chan-af-stat-hint', '');
  box.append(est, estHint);
  const state = { lastEstimate: null, expected: 0 };
  let estTimer = null;
  const currentFilter = () => (modeSel.value !== 'filtered' ? null : { match: matchSel.value, rules: rules.map((r) => ({ ...r })) });
  // ── PACING (its OWN cap) + the authority its access carries ──
  const grid2 = el('div', 'chan-af-grid');
  const capInp = numberInput(w ? w.dailyWakeCap : F.DEFAULT_DAILY_WAKE_CAP, { min: 0, max: F.MAX_DAILY_WAKE_CAP, step: 1 });
  grid2.appendChild(field(st.kind === 'conversation' ? t('Wakes per day (at most)') : t('Wakes per day (at most, for all of them together)'), capInp));
  box.appendChild(grid2);
  const capClamp = noteEl('', true);
  capClamp.dataset.clamp = 'cap';
  box.appendChild(capClamp);
  box.appendChild(authNote);
  // CLAMPED VISIBLY (the hotfix's finding: 9999 silently read as 1440)
  const clampOf = (inp, min, max) => { const n = Number(inp.value); if (!Number.isFinite(n) || inp.value === '') return { value: null, note: '' }; if (n > max) return { value: max, note: clampNoteText(max, 'max') }; if (n < min) return { value: min, note: clampNoteText(min, 'min') }; return { value: Math.round(n), note: '' }; };
  const syncClamps = () => {
    const d = clampOf(digestMin, F.MIN_DIGEST_MINUTES, F.MAX_DIGEST_MINUTES);
    digestClamp.textContent = notifySel.value === 'digest' ? d.note : '';
    digestClamp.style.display = digestClamp.textContent ? '' : 'none';
    const c = clampOf(capInp, 0, F.MAX_DAILY_WAKE_CAP);
    capClamp.textContent = c.note;
    capClamp.style.display = capClamp.textContent ? '' : 'none';
  };
  function reestimate() {
    syncClamps();
    if (estTimer) clearTimeout(estTimer);
    estTimer = setTimeout(async () => {
      estTimer = null;
      const filter = currentFilter();
      if (filter) { const v = F.validateFilter(filter); if (!v.ok) { est.className = 'chan-af-stat chan-flow-status chan-warn'; est.textContent = t('Filter is incomplete: {why}', { why: problemWords(v) }); estHint.textContent = ''; state.lastEstimate = null; onAnyChange(); return; } }
      const p = principals.find((x) => x.value === key);
      const r = await st.estimate(filter, { notify: notifySel.value, digestMinutes: Number(digestMin.value), dailyWakeCap: Number(capInp.value) }, p ? { kind: p.kind, id: p.id } : null);
      if (!r || r.error) { est.className = 'chan-af-stat chan-flow-status chan-warn'; est.textContent = (r && r.error) || t('Estimate failed'); estHint.textContent = ''; state.lastEstimate = null; onAnyChange(); return; }
      state.lastEstimate = r.estimate;
      est.className = 'chan-af-stat chan-flow-status';
      est.textContent = r.stat;
      estHint.textContent = r.hint || '';
      onAnyChange();
    }, 250);
  }
  const syncNotify = () => { digestRow.style.display = notifySel.value === 'digest' ? '' : 'none'; };
  notifySel.onchange = () => { syncNotify(); reestimate(); };
  syncNotify();
  digestMin.oninput = () => reestimate();
  capInp.oninput = () => reestimate();
  // ── RECEIPTS (P3, decision 8) — a billed turn per approval, said out loud ──
  const rwRow = el('label', 'dialog-check-row chan-opt-check');
  const rwInp = el('input'); rwInp.type = 'checkbox'; rwInp.checked = !!(w && w.receiptWake);
  rwRow.append(rwInp, el('span', '', t('Wake the agent with each outbox receipt')), el('span', 'dialog-check-hint', t('A billed turn per approval; off = the receipt rides its next turn.')));
  box.appendChild(rwRow);
  host.appendChild(box);
  reestimate();
  return {
    box,
    key: () => key,
    setWho,
    expected() {
      const e = state.lastEstimate;
      return { notify: notifySel.value, digestMinutes: clampOf(digestMin, F.MIN_DIGEST_MINUTES, F.MAX_DIGEST_MINUTES).value || F.DEFAULT_DIGEST_MINUTES, matchedPerDay: e ? e.matchedPerDay : 0, dailyWakeCap: clampOf(capInp, 0, F.MAX_DAILY_WAKE_CAP).value ?? F.DEFAULT_DAILY_WAKE_CAP };
    },
    read() {
      const p = principals.find((x) => x.value === key);
      if (!p) return { error: t('Pick who is notified.') };
      const filter = currentFilter();
      if (filter) { const v = F.validateFilter(filter); if (!v.ok) return { error: t('Filter is incomplete: {why}', { why: problemWords(v) }) }; }
      const d = clampOf(digestMin, F.MIN_DIGEST_MINUTES, F.MAX_DIGEST_MINUTES);
      const c = clampOf(capInp, 0, F.MAX_DAILY_WAKE_CAP);
      if (d.value !== null) digestMin.value = String(d.value);
      if (c.value !== null) capInp.value = String(c.value);
      return { watcher: { principal: { kind: p.kind, id: p.id, name: p.name }, mode: modeSel.value, notify: notifySel.value, digestMinutes: d.value ?? F.DEFAULT_DIGEST_MINUTES, dailyWakeCap: c.value ?? F.DEFAULT_DAILY_WAKE_CAP, receiptWake: !!rwInp.checked, ...(filter ? { filter } : {}), estimateAtSet: state.lastEstimate }, clamped: !!(d.note || c.note) };
    },
  };
}

/**
 * NOTIFY… — the SECOND operation. Its picker offers ONLY the principals that
 * hold access at this grain; with none it says so and points at Grant
 * access…. One row per watcher; Add / Remove; the total sums each row's own
 * ceiling (every watcher has its own cap). Save writes the grain's whole
 * watchers list — nobody listed = nobody is woken.
 */
export async function showNotifyDialog(app, target) {
  const st = await grainState(target);
  if (!st) return;
  const { body, close } = createModalShell({ id: 'chan-notify-dialog', title: grainTitle(st, 'notify'), dialogClass: 'chan-dialog chan-assign chan-notify', escapeToClose: true });
  const principals = st.access.map((r) => ({ value: pkOf(r.principal), label: principalText(r.principal), kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null, authority: r.authority }));
  if (!principals.length) {
    const empty = el('div', 'chan-notify-empty');
    empty.appendChild(noteEl(t('Grant access first — use "Grant access…". Only an agent or group with access here can be notified.')));
    const go = btn(t('Grant access…'), () => { close(); showGrantAccessDialog(app, target); }, 'mounts-btn-primary');
    go.dataset.grantAccess = '1';
    empty.appendChild(go);
    body.appendChild(empty);
    const actions = el('div', 'chan-flow-actions');
    actions.appendChild(btn(t('Cancel'), close));
    body.appendChild(actions);
    return;
  }
  body.appendChild(noteEl(t('Who is woken when new messages arrive here, and on what. Only the agents and groups with access are listed; nobody listed = nobody is woken.')));
  if (st.kind === 'conversation' && st.inherited.length) body.appendChild(noteEl(t('Also notified here through the account or a rule: {list}. A notification saved here replaces that agent\'s own for this conversation only.', { list: st.inherited.map((w) => principalText(w.principal)).join(', ') })));
  if (st.latencyNote) body.appendChild(noteEl(st.latencyNote));
  if (principals.some((p) => p.kind === 'group')) body.appendChild(noteEl(t('A group wakes one of its live sessions in turn (round-robin).')));
  const lw = st.stats && st.stats.lastWake;
  if (lw) body.appendChild(noteEl(lw.ok
    ? t('Last wake: {n} message(s) delivered via {lane} — {why}', { n: lw.n, lane: chanCaps.deliveryLaneText(lw.lane || 'message', { t }), why: lw.whys ? lw.whys.join(', ') : '' })
    : t('Last wake was held or stashed: {why}', { why: chanCaps.wakeRefusalText(lw.refused, { t }) || lw.why || '' }), !lw.ok));
  if (st.stats && st.stats.pending) body.appendChild(noteEl(t('{n} matched message(s) are waiting for the next window or turn', { n: st.stats.pending })));
  const list = el('div', 'chan-watch-list');
  body.appendChild(list);
  const rows = [];
  const total = el('div', 'chan-af-stat chan-watch-total', '');
  const addB = btn(t('Add a notification'), null, 'chan-af-add');
  addB.prepend(icon('plus', 11));
  const syncAll = () => {
    const used = new Set(rows.map((r) => r.key()));
    for (const r of rows) r.setWho(used);
    addB.style.display = principals.some((p) => !rows.some((r) => r.key() === p.value)) ? '' : 'none';
    total.textContent = rows.length ? t('In all: about {n} wakes a day — each notification has its own cap', { n: F.expectedWakesTotal(rows.map((r) => r.expected())) }) : t('Nobody is notified — saving wakes nobody (access stays).');
  };
  const addRow = (w) => {
    const filter = w && w.filter ? w.filter : null;
    const r = watcherRow(list, { w, f: filter, st, principals, onAnyChange: () => syncAll(), onRemove: () => { const i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); r.box.remove(); syncAll(); } });
    rows.push(r);
    syncAll();
    return r;
  };
  for (const w of st.watchers) addRow(w);
  if (!st.watchers.length) addRow(null);
  addB.onclick = () => { addRow(null); };
  body.append(addB, total, noteEl(t('Pacing only — the account budget is the money bound.')));
  const actions = el('div', 'chan-flow-actions');
  const grant = btn(t('Grant access…'), () => { close(); showGrantAccessDialog(app, target); });
  actions.append(grant, el('span', 'chan-sp'));
  actions.appendChild(btn(t('Cancel'), close));
  const save = btn(t('Save'), null, 'mounts-btn-primary');
  save.onclick = async () => {
    const watchers = [];
    let clamped = false;
    for (const r of rows) { const v = r.read(); if (v.error) { showToast(v.error, { type: 'error' }); return; } watchers.push(v.watcher); clamped = clamped || v.clamped; }
    const vw = F.validateWatchers(watchers.map((w) => ({ ...w, ...(w.filter ? { filterId: 'inline' } : {}) })), st.access);
    if (!vw.ok) { showToast(routeErrorText({ code: vw.code, error: vw.error, why: vw.why, principal: vw.principal }), { type: 'error' }); return; }
    save.disabled = true;
    try {
      if (!st.watchersUrl) { showToast(t('Save the rule\'s access first'), { type: 'error' }); return; }
      const r = await put(st.watchersUrl, { watchers });
      if (!r) return;
      showToast(watchers.length ? t('Notifications saved: {list}', { list: watchers.map((w) => `${principalText(w.principal)} ${watcherHowText(w)}`).join(', ') }) + (clamped ? ' · ' + t('numbers past their bounds were kept at the bound') : '') : t('Nobody is notified here any more'));
      close();
    } finally { save.disabled = false; }
  };
  actions.appendChild(save);
  body.appendChild(actions);
}

/** The two operations as a small menu at a point (a grain line's click, a
 *  row chip) — access first. */
export function showGrainMenu(app, target, x, y) {
  const items = [
    { label: t('Grant access…'), action: () => showGrantAccessDialog(app, target) },
    { label: t('Notify…'), action: () => showNotifyDialog(app, target) },
  ];
  if (target.kind === 'pattern' && target.id) {
    items.push({ separator: true });
    items.push({ label: t('Remove the rule'), action: async () => { const r = await put(`/api/channels/adapters/${encodeURIComponent(target.adapter.id)}/patterns/${encodeURIComponent(target.id)}`, {}, 'DELETE'); if (r) showToast(t('The rule is removed — its access and notifications with it')); } });
  }
  showContextMenu(x, y, items);
}

/** The conversation window's chip (and any caller holding a row): the
 *  conversation's OWN access exists ⇒ Notify…, else ⇒ Grant access… (each
 *  dialog links to the other). */
export async function showAssignFilterDialog(app, conv) {
  const own = conv && conv.own ? conv.own : null;
  const hasOwn = own ? own.access.length > 0 : ((conv && conv.access) || []).some((a) => a.source === 'conversation');
  return hasOwn ? showNotifyDialog(app, { kind: 'conversation', conv }) : showGrantAccessDialog(app, { kind: 'conversation', conv });
}
/** The pre-R4 entry for the account / rule grains ⇒ Grant access…. */
export function showScopeAssignDialog(app, adapter, scope = { kind: 'account' }) {
  return showGrantAccessDialog(app, scope.kind === 'pattern' ? { kind: 'pattern', adapter, id: scope.id || null } : { kind: 'account', adapter });
}

/** The one-line summary the panel row and the window chip draw — WHO HAS
 *  ACCESS and WHO IS NOTIFIED, each principal once (its finest grain); an
 *  inherited one says where from ("(account)" / "(rule)"). */
export function assignmentSummary(conv) {
  if (!conv) return '';
  const access = Array.isArray(conv.access) ? conv.access : [];
  const watchers = Array.isArray(conv.watchers) ? conv.watchers : [];
  if (!access.length && !watchers.length) return '';
  const a = conv.assignment;
  const from = a && a.source === 'account' ? t('(account)') : a && a.source === 'pattern' ? t('(rule)') : '';
  return [grainSummaryText({ access, watchers }), from].filter(Boolean).join(' ');
}

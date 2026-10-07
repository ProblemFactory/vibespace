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
import { routeErrorText, wakeWhyText, principalKindText, groupTitle, principalText, accessAuthorityText, watcherHowText, grainSummaryText, clampNoteText, notifySentence, notifyAnswers, watcherOfAnswers } from './channel-words.js';
// the ONE principal picker (search + list, keyed, recent picks) — never a <select> of the whole roster
import { principalPicker, rosterFromApp } from './principal-picker.js';

const RULE_LABELS = () => ({
  'mention': t('mentions'),
  'keyword': t('contains keyword'),
  'regex': t('matches the regular expression'),
  'sender-in-group': t('sender is one of'),
  'from-address': t('from (name or address)'),
  'subject': t('subject contains'),
  'has-attachment': t('has an attachment'),
  'not-contains': t('does not contain'),
  'time-window': t('arrives between (HH:MM–HH:MM)'),
  // lane channel-threads (spec §5.4): the two PLACE rules — a reply to the user's / this agent's message, a thread it is in.
  // Owner decision A (2026-09-28): a thread is a real TOPIC (a quote chain never is), and a QUOTE of my message counts
  // under both — said on the row, so the rule reads as what it does
  'reply-to-mine': t('replies to or quotes a message of mine'),
  'in-thread-with-me': t('is in a thread I am in, or quotes a message of mine'),
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
function freshRule(kind) { return kind === 'time-window' ? { kind, from: '09:00', to: '18:00' } : kind === 'sender-in-group' ? { kind, members: [] } : F.PLACE_RULE_KINDS.includes(kind) || kind === 'has-attachment' ? { kind } : { kind, value: '' }; }

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

/** Every principal the owner may give access to: ALL AGENTS (lane
 *  everyone-principal — every conversation, now and later), the live agent
 *  sessions and the Task Groups (named by their `title` — a1 §2.4 A5), plus
 *  any principal a stored row names that is not live now (kept, said so). */
const EVERYONE_KEY = 'everyone:*';
function principalChoices(app, stored = []) {
  const live = (app.sidebar && app.sidebar._webuiSessions) || [];
  const groups = (app.sidebar && app.sidebar._tasks) || [];
  const out = [{ value: EVERYONE_KEY, label: t('All agents'), kind: 'everyone', id: '*', name: null }];
  for (const s of live) {
    const cid = s.backendSessionId || s.claudeSessionId;
    if (!cid || out.some((w) => w.kind === 'agent' && w.id === cid)) continue;
    out.push({ value: `agent:${cid}`, label: t('Agent · {name}', { name: s.name || cid }), kind: 'agent', id: cid, name: s.name || null });
  }
  for (const g of groups) if (g && g.id) out.push({ value: `group:${g.id}`, label: t('Group · {name}', { name: groupTitle(g) }), kind: 'group', id: g.id, name: groupTitle(g) || null });
  for (const r of stored) {
    const p = r && r.principal;
    if (!p || p.kind === 'everyone' || out.some((w) => w.kind === p.kind && w.id === p.id)) continue;
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
  const st = await readGrain(target);
  // the STAMP of the two lists as drawn (mirror-193, PURE `grainStamp`) — every whole-list save sends it as `base`
  if (st) st.stamp = F.grainStamp({ access: st.access, watchers: st.watchers });
  return st;
}
async function readGrain(target) {
  if (target.kind === 'conversation') {
    const c0 = target.conv;
    const base = `/api/channels/${encodeURIComponent(c0.adapterId)}/${encodeURIComponent(c0.id)}`;
    const full = await fetchJson(base);
    if (!full || full.error) { showToast(routeErrorText(full), { type: 'error' }); return null; }
    const conv = full.conversation;
    const own = conv.own || { access: [], watchers: [] };
    return {
      kind: 'conversation', target, conv, name: conv.title || conv.id, base,
      // the account's own sign-in name — "Only when this name is mentioned" starts from it
      selfName: (full.adapter && full.adapter.auth && full.adapter.auth.user) || '',
      access: own.access || [], watchers: own.watchers || [],
      // lane channel-agent-watch W3: who holds access ABOVE this chat (the account, a rule, an approved request) — Notify…
      // may name them without a per-chat access row (the PURE rule `validateWatchers` judges by the same list)
      eligibleAbove: Array.isArray(conv.eligibleAbove) ? conv.eligibleAbove : [],
      caps: conv.authorityCaps || { offersSend: false, sendWhy: 'unknown', policyRequiresReview: true },
      latencyNote: wakeLatencyText(conv.wakeLatency), stats: conv.stats || null,
      inherited: (conv.watchers || []).filter((w) => w.source && w.source !== 'conversation'),
      accessUrl: `${base}/access`, watchersUrl: `${base}/watchers`,
      preview: (rule) => fetchJson(`${base}/rules/preview`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ rule }) }),
      estimate: async (filter) => {
        const r = await fetchJson(`${base}/estimate`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ filter }) });
        if (!r || r.error) return { error: (r && r.error) || t('Estimate failed') };
        const parts = estimateParts(r.estimate, null, conv.stats);
        return { estimate: r.estimate, stat: parts.stat, hint: parts.hint };
      },
    };
  }
  // THE ACCOUNT AND RULE GRAINS ARE RE-READ TOO (mirror-193): `target.adapter` is the panel's broadcast-fed copy,
  // a frame behind any write it has not heard of yet — drawn from it, the dialog showed (and its whole-list save
  // WROTE) a list the server had already moved on from: a principal granted a moment earlier lost its access.
  const fresh = await fetchJson(`/api/channels/adapters/${encodeURIComponent(target.adapter.id)}/view`);
  if (!fresh || fresh.error || !fresh.adapter) { showToast(routeErrorText(fresh), { type: 'error' }); return null; }
  const a = fresh.adapter;
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
  // lane notify-rules-r2: the rule preview over the grain's conversations (the local logs, zero vendor calls)
  const scopePreview = (kind, pattern) => (rule) => fetchJson(`/api/channels/adapters/${aid}/rules/preview`, { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ rule, scope: { kind }, ...(kind === 'pattern' ? { pattern: pattern() } : {}) }) });
  if (target.kind === 'account') {
    const g = a.accountGrain || { access: [], watchers: [] };
    return { kind: 'account', target, adapter: a, name: a.label || a.id, selfName: (a.auth && a.auth.user) || '', access: g.access || [], watchers: g.watchers || [], caps, accessUrl: `/api/channels/adapters/${aid}/access`, watchersUrl: `/api/channels/adapters/${aid}/watchers`, preview: scopePreview('account', null), estimate: scopeEstimate('account') };
  }
  const pa = target.id ? (a.patterns || []).find((p) => p.id === target.id) : null;
  if (target.id && !pa) { showToast(t('That rule no longer exists'), { type: 'error' }); return null; }
  const pat = pa && pa.pattern ? { match: pa.pattern.match, rules: pa.pattern.rules.map((r) => ({ ...r })) } : { match: 'any', rules: [{ kind: 'title', value: '' }] };
  return {
    kind: 'pattern', target, adapter: a, id: pa ? pa.id : null, name: a.label || a.id, selfName: (a.auth && a.auth.user) || '', pattern: pat, patternLabel: pa ? pa.patternLabel : null,
    access: pa ? (pa.access || []) : [], watchers: pa ? (pa.watchers || []) : [], caps,
    accessUrl: pa ? `/api/channels/adapters/${aid}/patterns/${encodeURIComponent(pa.id)}/access` : `/api/channels/adapters/${aid}/patterns`,
    watchersUrl: pa ? `/api/channels/adapters/${aid}/patterns/${encodeURIComponent(pa.id)}/watchers` : null,
    estimate: scopeEstimate('pattern', () => pat),
    preview: scopePreview('pattern', () => pat),
  };
}
/** `onChanged` (mirror-193): a whole-list write refused `grain-changed` — the lists moved since the dialog read
 *  them — is not an error to read and dismiss: the caller re-opens the dialog on the lists as they are now. */
async function put(url, body, method = 'PUT', { onChanged = null } = {}) {
  const r = await fetchJson(url, { method, headers: JSON_HDR, body: JSON.stringify(body) });
  if (r && r.code === 'grain-changed' && onChanged) { showToast(t('The list changed while this dialog was open (another window, or an agent) — here it is as it is now; nothing was saved'), { type: 'error' }); onChanged(); return null; }
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
/** A REFUSED SAVE KEEPS THE KEYBOARD (verify round 5, 2026-09-27): disabling the focused Save button (or the picker's
 *  box while the write is in flight) drops the focus to `body`, and a dialog whose Esc listens on its own overlay is
 *  then deaf to the keyboard — a keyboard user who Tabbed to Save and pressed Enter could not leave a failed save
 *  without the mouse. When the focus fell out of the dialog, it goes back to the button (a no-op once the dialog closed). */
function refocus(btn) {
  try { if (btn && btn.isConnected && (document.activeElement === document.body || !btn.closest('.dialog-overlay')?.contains(document.activeElement))) btn.focus({ preventScroll: true }); } catch {}
}
export async function showGrantAccessDialog(app, target) {
  const st = await grainState(target);
  if (!st) return;
  // plain words (channel-polish, 2026-09-27): the dialog ASKS its question; the grain is said under it
  // the picker's roster listener ends WITH the dialog (verify round 2: it used to live until the next broadcast)
  let picker = null;
  const { body, close } = createModalShell({ id: 'chan-access-dialog', title: t('Who may read and act here?'), dialogClass: 'chan-dialog chan-assign chan-access', escapeToClose: true, onClose: () => { if (picker) picker.close(); } });
  body.appendChild(el('div', 'chan-dialog-sub', st.kind === 'conversation' ? st.name : st.kind === 'account' ? t('The whole account — {label}', { label: st.name }) : t('The conversations matching a rule — {label}', { label: st.name })));
  body.appendChild(noteEl(st.kind === 'account'
    ? t('Who may see every conversation of this account — now and later — and act on them: read, search, refresh, reply (and write a new message where the account can). Access alone never wakes anyone.')
    : st.kind === 'pattern'
      ? t('Who may see the conversations that match the rule — now and later — and act on them. Access alone never wakes anyone.')
      : t('Who may see this conversation and act on it: read, search, refresh and reply. Access alone never wakes anyone.')));
  if (st.kind === 'pattern') patternEditor(body, st.pattern, () => {});
  const cap = F.authorityCapCode(st.caps);
  const capWords = (c) => F.authorityCapText(c, { t, sendWhyText: chanCaps.sendWhyText });
  const rows = st.access.map((r) => ({ key: pkOf(r.principal), authority: r.authority === 'send' && !cap ? 'send' : 'draft' }));
  // ALL AGENTS's row first (the chips put it first; the rows follow)
  rows.sort((a, b) => (b.key === EVERYONE_KEY) - (a.key === EVERYONE_KEY));
  // WHO (the ONE picker, multi-select — chips, the box focused on open): the live roster + every principal
  // that already holds access here but is not live now (said on its row); a pick adds its authority row
  const pickRows = () => {
    const live = rosterFromApp(app);
    const have = new Set(live.map((r) => r.key));
    for (const c of principalChoices(app, st.access)) if (c.kind !== 'everyone' && !have.has(c.value)) live.unshift({ key: c.value, kind: c.kind === 'group' ? 'group' : 'agent', id: c.id, name: c.name || c.id, hint: t('not live now'), groupIds: [], groupNames: [] });
    return live;
  };
  body.appendChild(fieldLabel(t('Access')));
  picker = principalPicker({
    items: pickRows, app, multi: true, selected: rows.map((r) => r.key), autofocus: true,
    placeholder: t('Add an agent or group…'), label: t('Add an agent or group'),
    // ALL AGENTS (lane everyone-principal): the first row — every conversation may see and act here, now and later
    everyone: { key: EVERYONE_KEY },
    onChange: (keys) => {
      for (let i = rows.length - 1; i >= 0; i--) if (!keys.includes(rows[i].key)) rows.splice(i, 1);
      for (const k of keys) if (!rows.some((r) => r.key === k)) { if (k === EVERYONE_KEY) rows.unshift({ key: k, authority: 'draft' }); else rows.push({ key: k, authority: 'draft' }); }
      draw();
    },
  });
  picker.el.classList.add('chan-access-pick');
  body.appendChild(picker.el);
  const list = el('div', 'chan-access-list');
  body.appendChild(list);
  const watchedNote = noteEl('', true);
  body.appendChild(watchedNote);
  // verify r1 T2 ⑥: authority is the MAX over every row naming the agent — a draft-only row beside an All row that
  // may send is MOOT, and the owner who added it wanting LESS must be told so (never a silent widening)
  const mootNote = noteEl('', true);
  body.appendChild(mootNote);
  const syncMoot = () => {
    const all = rows.find((r) => r.key === EVERYONE_KEY);
    const names = all && all.authority === 'send' ? rows.filter((r) => r.key !== EVERYONE_KEY && r.authority === 'draft').map((r) => picker.nameOf(r.key)) : [];
    mootNote.textContent = names.length ? t('All agents may reply directly here, so a draft-only row beside it changes nothing: {names} may reply directly too (set All agents to draft, or remove it, to narrow).', { names: names.join(', ') }) : '';
    mootNote.style.display = names.length ? '' : 'none';
  };
  if (cap) body.appendChild(noteEl(t('Direct send is not offered here: {why}', { why: capWords(cap) })));
  for (const r of st.access) if (r.authorityClamped) body.appendChild(noteEl(`${principalText(r.principal)}: ${t('The stored authority is "send" but it reads as draft: {why}', { why: r.authorityWhyCap ? capWords(r.authorityWhyCap) : r.authorityWhy })}`, true));
  const draw = () => {
    list.textContent = '';
    if (!rows.length) list.appendChild(noteEl(t('Nobody has access — saving removes everyone\'s access (and their notifications).')));
    rows.forEach((r, i) => {
      const row = el('div', 'chan-access-row');
      row.dataset.principal = r.key;
      const who = el('span', 'chan-access-who', picker.nameOf(r.key));
      who.title = picker.nameOf(r.key);
      // the AUTHORITY as two plain answers (the wire's draft | send); where direct sending is not offered
      // only the first is drawn — the note under the rows says why, once
      const auth = el('div', 'chan-access-auth');
      auth.setAttribute('role', 'radiogroup');
      auth.setAttribute('aria-label', t('Authority'));
      const opts = cap ? [['draft', t('May draft replies (you approve)')]] : [['draft', t('May draft replies (you approve)')], ['send', t('May reply directly')]];
      for (const [value, words] of opts) {
        const lab = el('label', 'dialog-check-row chan-radio-row');
        const inp = document.createElement('input');
        inp.type = 'radio'; inp.name = `chan-auth-${i}-${r.key}`; inp.value = value; inp.checked = r.authority === value;
        inp.onchange = () => { if (inp.checked) { r.authority = value; syncMoot(); } };
        lab.append(inp, el('span', 'chan-radio-words', words));
        auth.appendChild(lab);
      }
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'icon-btn chan-af-rm'; rm.title = t('Remove'); rm.setAttribute('aria-label', t('Remove'));
      rm.appendChild(icon('close', 12));
      rm.onclick = () => { rows.splice(i, 1); picker.setSelected(rows.map((x) => x.key)); draw(); };
      row.append(who, auth, rm);
      list.appendChild(row);
    });
    const gone = st.watchers.filter((w) => !rows.some((r) => r.key === pkOf(w.principal)));
    watchedNote.textContent = gone.length ? t('Removing access also removes the notification of: {list}', { list: gone.map((w) => principalText(w.principal)).join(', ') }) : '';
    watchedNote.style.display = gone.length ? '' : 'none';
    syncMoot();
  };
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
    // the payload's principals come from the SAME choices as before (kind, id, name) — the wire is unchanged;
    // re-read at the click (a session that went live after the dialog opened is in it)
    const choices = principalChoices(app, st.access);
    const access = rows.map((r) => { const c = choices.find((x) => x.value === r.key); return c ? { principal: { kind: c.kind, id: c.id, name: c.name }, authority: r.authority } : null; }).filter(Boolean);
    const v = F.validateAccess(access, st.caps);
    if (!v.ok) { showToast(routeErrorText({ code: v.code, error: v.error, why: v.why, principal: v.principal }), { type: 'error' }); return; }
    if (st.kind === 'pattern') { const pv = F.validatePattern(st.pattern); if (!pv.ok) { showToast(t('The rule is incomplete: {why}', { why: F.filterProblemText(pv, { t, ruleLabel: (k) => PATTERN_LABELS()[k] || k }) }), { type: 'error' }); return; } }
    if (st.kind === 'pattern' && !access.length) { showToast(t('A rule needs at least one agent or group with access'), { type: 'error' }); return; }
    save.disabled = true;
    // THE LIST IN FLIGHT IS THE LIST SAVED (verify round 4, r3's LOW): a chip removed while the write is in flight was
    // lost silently (the dialog closed on the earlier payload) — the picker and every row stop taking input until the
    // write answers, so what the person sees IS what was written
    picker.setBusy(true);
    const rowBtns = [...list.querySelectorAll('button, input')];
    for (const b of rowBtns) b.disabled = true;
    try {
      // the STAMP of the lists this dialog drew rides with the whole list (mirror-193): a grain that moved since is
      // refused by name and the dialog re-opens on it — never written over
      const again = { onChanged: () => { close(); showGrantAccessDialog(app, target); } };
      const r = st.kind === 'pattern'
        ? (st.id ? await put(st.accessUrl, { access, pattern: st.pattern, base: st.stamp }, 'PUT', again) : await put(st.accessUrl, { pattern: st.pattern, access }, 'POST'))
        : await put(st.accessUrl, { access, base: st.stamp }, 'PUT', again);
      if (!r) return;
      const names = access.map((a) => principalText(a.principal)).join(', ');
      showToast(access.length ? t('Access saved: {list} — nobody is woken unless you add a notification (Notify…)', { list: names }) : t('Access removed'));
      close();
    } finally { save.disabled = false; picker.setBusy(false); for (const b of rowBtns) b.disabled = false; refocus(save); }
  };
  actions.appendChild(save);
  body.appendChild(actions);
}

/** One WATCHER row of the Notify dialog — the pre-R4 form's fields for ONE
 *  principal the grain already gave access to. */
let cardSeq = 0;
/** One NOTIFICATION as THREE PLAIN QUESTIONS (channel-polish, 2026-09-27 — the owner: "那个通知配置项目本身就有
 *  点 confusing"): ① Who gets woken? (the principal picker, over the principals that hold access here) ② On
 *  which messages? (Every message / Only messages matching a rule… — the filter editor folded under it / Only
 *  when … is mentioned) ③ How often at most? (Right away, every time / A digest every N minutes — and, its OWN
 *  line under both, At most N times a day), the clamps said under the field, the live estimate, and ONE preview
 *  sentence at the bottom that says the whole thing back (PURE `notifySentence`). The WIRE is the watcher's
 *  unchanged shape {principal, mode, notify, digestMinutes, dailyWakeCap, receiptWake, filter?}, and the
 *  answers map onto it ONE TO ONE (PURE `notifyAnswers` / `watcherOfAnswers`, channel-words.js — verify round 2:
 *  the cap was a third exclusive answer, so a digest's cap sat in a disabled field). The per-notification
 *  receipt switch is gone from the dialog and NO control sets `receiptWake` today (lane channel-withdraw
 *  retires the field; the engine still honours a stored `true`); a stored value rides through untouched. */
function watcherRow(host, { w = null, f = null, st, principals, onAnyChange, onRemove }) {
  const seq = ++cardSeq;
  const box = el('div', 'chan-watch-row');
  const q = (text) => el('div', 'chan-q', text);
  // ── ① WHO ──
  const head = el('div', 'chan-watch-head');
  let key = w ? pkOf(w.principal) : '';
  let usedNow = new Set();
  // ALL AGENTS here is a principal that HOLDS ACCESS (a notification needs it): the roster carries its row — drawn first,
  // its hint the money sentence (every running conversation gets a billed turn on each hit)
  const whoItems = () => principals.filter((p) => !(usedNow.has(p.value) && p.value !== key)).map((p) => (p.kind === 'everyone'
    ? { key: p.value, kind: 'everyone', id: '*', name: t('All agents'), groupIds: [], groupNames: [], hint: t('every running conversation gets a billed turn on each hit') }
    : { key: p.value, kind: p.kind === 'group' ? 'group' : 'agent', id: p.id, name: p.name || p.label, groupIds: [], groupNames: [], hint: accessAuthorityText(p.authority) }));
  const whoPick = principalPicker({ items: whoItems, compact: true, selected: key ? [key] : [], placeholder: t('Who gets woken?'), label: t('Who gets woken?'), everyone: 'roster', onChange: (keys) => { key = keys[0] || ''; authLine(); changed(); } });
  whoPick.el.classList.add('chan-watch-who');
  const rm = document.createElement('button');
  rm.type = 'button'; rm.className = 'icon-btn chan-af-rm'; rm.title = t('Remove this notification'); rm.setAttribute('aria-label', t('Remove this notification'));
  rm.appendChild(icon('close', 12));
  rm.onclick = () => onRemove();
  head.append(whoPick.el, rm);
  box.append(q(t('Who gets woken?')), head);
  const authNote = noteEl('');
  const authLine = () => { const p = principals.find((x) => x.value === key); authNote.textContent = p ? t('Authority comes from its access: {authority}', { authority: accessAuthorityText(p.authority) }) : ''; };
  let whoSig = null;
  const setWho = (usedByOthers) => {
    // re-read the picker's rows only when what they offer changed (the picker patches its rows in place —
    // an estimate landing never closes the list the person has open)
    const sig = `${key}|${[...usedByOthers].sort().join(',')}`;
    if (sig === whoSig) return;
    whoSig = sig;
    usedNow = usedByOthers;
    if (!key) { const free = principals.find((p) => !usedByOthers.has(p.value)); if (free) key = free.value; }
    whoPick.setSelected(key ? [key] : []);
    whoPick.refresh();
    authLine();
    syncShape();   // the preview names who was just chosen (setWho runs after the card is built)
  };
  /** A radio row: `label.dialog-check-row` (the house row — box · words · an inline field) */
  const radio = (group, value, words, checked, extra = null) => {
    const lab = el('label', 'dialog-check-row chan-radio-row');
    const inp = document.createElement('input');
    inp.type = 'radio'; inp.name = `${group}-${seq}`; inp.value = value; inp.checked = !!checked;
    lab.append(inp, el('span', 'chan-radio-words', words));
    if (extra) lab.appendChild(extra);
    return { lab, inp };
  };
  /** A radio row whose words hold a FIELD where the sentence has its placeholder — ONE key per language, the
   *  field set where that language puts the number (en "A digest every [30] minutes", zh "每 [30] 分钟一份摘要") */
  const radioWith = (group, value, words, checked, field) => {
    const [before, after] = String(words('\u0000')).split('\u0000');
    const r = radio(group, value, (before || '').trim(), checked);
    if (!(before || '').trim()) r.lab.querySelector('.chan-radio-words').remove();
    r.lab.appendChild(field);
    if ((after || '').trim()) r.lab.appendChild(el('span', 'chan-radio-words', after.trim()));
    return r;
  };
  // ── ② ON WHICH MESSAGES ──
  const selfName = st.selfName || '';
  // the stored watcher AS ANSWERS (PURE — the same function the round-trip gate walks)
  const a0 = notifyAnswers(w ? { ...w, filter: f } : null);
  const mention0 = a0.mention || null;
  const what0 = a0.what;
  // a filtered watcher whose rule the store no longer holds (a damaged store — the engine wakes nobody on it, fail
  // closed): SAID, not blamed on the person's input (verify round 3)
  const lostRule = !!(w && w.mode === 'filtered' && w.filterId && !f);
  const mentionInp = textInput(mention0 || selfName, t('name'));
  mentionInp.classList.add('chan-radio-field');
  const wAll = radio('what', 'all', t('Every message'), what0 === 'all');
  const wRule = radio('what', 'rule', t('Only messages matching a rule…'), what0 === 'rule');
  const wMen = radioWith('what', 'mention', (x) => t('Only when {name} is mentioned', { name: x }), what0 === 'mention', mentionInp);
  box.append(q(t('On which messages?')));
  if (lostRule) box.appendChild(noteEl(t('This notification\'s rule is missing from the store — nobody is woken by it until you pick the messages again.'), true));
  box.append(wAll.lab, wRule.lab);
  // THE FILTER (folded under "Only messages matching a rule…")
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
  box.append(rulesBox, wMen.lab);
  const rules = (what0 === 'rule' && f && Array.isArray(f.rules) ? f.rules : []).map((r) => ({ ...r }));
  const problemWords = (v) => F.filterProblemText(v, { t, ruleLabel: (k) => RULE_LABELS()[k] || PATTERN_LABELS()[k] || k });
  function ruleRow(rule, idx) {
    const row = el('div', 'chan-af-rule');
    const kindSel = selectBox(F.RULE_KINDS.map((k) => ({ value: k, label: RULE_LABELS()[k] || k })), rule.kind);
    kindSel.title = t('Rule kind');
    kindSel.onchange = () => { rules[idx] = freshRule(kindSel.value); drawRules(); changed(); };
    row.appendChild(kindSel);
    const fields = el('span', 'chan-af-fields');
    const bind = (inp, k, transform = (v) => v) => { inp.oninput = () => { rule[k] = transform(inp.value); changed(); }; fields.appendChild(inp); };
    switch (rule.kind) {
      case 'mention': bind(textInput(rule.value, t('name or id')), 'value'); break;
      case 'keyword': case 'not-contains': case 'subject': case 'from-address': bind(textInput(rule.value, t('text')), 'value'); break;
      case 'regex': bind(textInput(rule.value, t('regular expression, e.g. invoice\\s*#?\\d+')), 'value'); break;
      case 'sender-in-group': bind(textInput(Array.isArray(rule.members) ? rule.members.join(', ') : (rule.value || ''), t('ids or names, comma-separated')), 'members', (v) => v.split(',').map((x) => x.trim()).filter(Boolean)); break;
      case 'has-attachment': case 'reply-to-mine': case 'in-thread-with-me': break;
      case 'time-window': bind(textInput(rule.from || '09:00', 'HH:MM'), 'from'); bind(textInput(rule.to || '18:00', 'HH:MM'), 'to'); break;
      default: break;
    }
    if (fields.childNodes.length) row.appendChild(fields); else row.classList.add('chan-af-rule-nofield');
    const rmR = document.createElement('button');
    rmR.type = 'button'; rmR.className = 'icon-btn chan-af-rm'; rmR.title = t('Remove'); rmR.setAttribute('aria-label', t('Remove'));
    rmR.appendChild(icon('close', 12));
    rmR.onclick = () => { rules.splice(idx, 1); drawRules(); changed(); };
    row.appendChild(rmR);
    // lane notify-rules-r2: a keyword / regex rule previews the newest ≤ 10 stored messages it matches, as it is typed
    if ((rule.kind === 'keyword' || rule.kind === 'regex') && typeof st.preview === 'function') row._preview = rulePreview(st, rule, row);
    return row;
  }
  function drawRules() {
    rulesList.textContent = '';
    if (!rules.length) rulesList.appendChild(noteEl(t('No rules yet — add one below. With no rule nothing matches (a wake is money, so the filter fails closed).')));
    rules.forEach((r, i) => { const row = ruleRow(r, i); rulesList.appendChild(row); if (row._preview) rulesList.appendChild(row._preview.el); });
  }
  addRule.onclick = () => { rules.push(freshRule('keyword')); drawRules(); changed(); const last = [...rulesList.querySelectorAll('.chan-af-rule')].pop(); const inp = last && last.querySelector('input'); if (inp) inp.focus(); };
  drawRules();
  const whatNow = () => (wRule.inp.checked ? 'rule' : wMen.inp.checked ? 'mention' : 'all');
  // ── ② b WHEN (lane channel-agent-watch W5, the owner 2026-10-01: "notify配置的时候也不能调整是下一回合还是立刻唤醒") ──
  // next turn = free (the news rides the agent's next turn); wake now = a billed turn under the cap below. A row saved
  // before the choice existed reads (and is shown as) wake — what it always did; a NEW row starts at next turn.
  const when0 = w ? F.deliveryModeOf(w) : 'next-turn';
  const wNext = radio('when', 'next-turn', t('On its next turn (free)'), when0 === 'next-turn');
  const wWake = radio('when', 'wake', t('Wake it now (a billed turn)'), when0 === 'wake');
  if (w && F.watchOriginOf(w) === 'agent') box.appendChild(noteEl(t('Set by the agent — it asked to be told about this. Remove it here if you do not want that.')));
  box.append(q(t('When is it told?')), wNext.lab, wWake.lab);
  const whenNow = () => (wWake.inp.checked ? 'wake' : 'next-turn');
  // ── ③ HOW OFTEN AT MOST ──
  const cap0 = a0.cap;
  const how0 = a0.how;
  const digestMin = numberInput(how0 === 'digest' ? a0.digestMinutes : F.DEFAULT_DIGEST_MINUTES, { min: F.MIN_DIGEST_MINUTES, max: F.MAX_DIGEST_MINUTES, step: 5 });
  digestMin.classList.add('chan-radio-field');
  const capInp = numberInput(cap0, { min: 0, max: F.MAX_DAILY_WAKE_CAP, step: 1 });
  capInp.classList.add('chan-radio-field');
  const hNow = radio('how', 'now', t('Right away, every time'), how0 === 'now');
  const hDig = radioWith('how', 'digest', (x) => t('A digest every {n} minutes', { n: x }), how0 === 'digest', digestMin);
  // THE CAP IS ITS OWN LINE under both answers (it bounds a digest as it bounds a wake) — the same words, the
  // field where the language puts the number, ALWAYS editable
  const capRow = el('label', 'dialog-check-row chan-radio-row chan-cap-row');
  {
    const [before, after] = String(st.kind === 'conversation' ? t('At most {n} times a day', { n: '\u0000' }) : t('At most {n} times a day, for all of them together', { n: '\u0000' })).split('\u0000');
    if ((before || '').trim()) capRow.appendChild(el('span', 'chan-radio-words', before.trim()));
    capRow.appendChild(capInp);
    if ((after || '').trim()) capRow.appendChild(el('span', 'chan-radio-words', after.trim()));
  }
  const digestClamp = noteEl('', true);
  digestClamp.dataset.clamp = 'digest';
  const capClamp = noteEl('', true);
  capClamp.dataset.clamp = 'cap';
  box.append(q(t('How often at most?')), hNow.lab, hDig.lab, digestClamp, capRow, capClamp);
  if (st.kind !== 'conversation') box.appendChild(noteEl(t('One digest per window for ALL the conversations this covers — never one per conversation.')));
  const howNow = () => (hDig.inp.checked ? 'digest' : 'now');
  // ── ESTIMATE (live) + the authority its access carries ──
  const est = el('div', 'chan-af-stat chan-flow-status', t('Estimating…'));
  const estHint = el('div', 'chan-af-stat-hint', '');
  box.append(est, estHint, authNote);
  // ── THE PREVIEW: the whole notification said back ──
  const preview = el('div', 'chan-notify-preview');
  preview.setAttribute('aria-live', 'polite');
  box.appendChild(preview);
  const state = { lastEstimate: null, expected: 0 };
  let estTimer = null;
  // CLAMPED VISIBLY (the hotfix's finding: 9999 silently read as 1440)
  const clampOf = (inp, min, max) => { const n = Number(inp.value); if (!Number.isFinite(n) || inp.value === '') return { value: null, note: '' }; if (n > max) return { value: max, note: clampNoteText(max, 'max') }; if (n < min) return { value: min, note: clampNoteText(min, 'min') }; return { value: Math.round(n), note: '' }; };
  const currentFilter = () => {
    const wn = whatNow();
    // the stored filter's NAME rides through (verify round 3: every save wrote `name: null` over it)
    if (wn === 'rule') return { ...(f && f.name ? { name: f.name } : {}), match: matchSel.value, rules: rules.map((r) => ({ ...r })) };
    if (wn === 'mention') return { match: 'any', rules: [{ kind: 'mention', value: mentionInp.value.trim() }] };
    return null;
  };
  /** The watcher as the dialog holds it right now (the wire's shape). */
  const current = () => {
    const p = principals.find((x) => x.value === key);
    const d = clampOf(digestMin, F.MIN_DIGEST_MINUTES, F.MAX_DIGEST_MINUTES);
    const c = clampOf(capInp, 0, F.MAX_DAILY_WAKE_CAP);
    const wn = whatNow();
    // the answers → the watcher through the ONE PURE mapping (the clamped numbers; an empty field = the default)
    return watcherOfAnswers(
      { what: wn, mention: mentionInp.value, how: howNow(), digestMinutes: d.value, cap: c.value },
      { principal: p ? { kind: p.kind, id: p.id, name: p.name || (p.label || null) } : null, ruleFilter: wn === 'rule' ? currentFilter() : null, stored: w },
    );
  };
  const syncShape = () => {
    rulesBox.style.display = whatNow() === 'rule' ? '' : 'none';
    mentionInp.disabled = whatNow() !== 'mention';
    digestMin.disabled = howNow() !== 'digest';
    const d = clampOf(digestMin, F.MIN_DIGEST_MINUTES, F.MAX_DIGEST_MINUTES);
    digestClamp.textContent = howNow() === 'digest' ? d.note : '';
    digestClamp.style.display = digestClamp.textContent ? '' : 'none';
    const c = clampOf(capInp, 0, F.MAX_DAILY_WAKE_CAP);
    capClamp.textContent = c.note;
    capClamp.style.display = capClamp.textContent ? '' : 'none';
    preview.textContent = notifySentence(current(), t, { scope: st.kind });
  };
  function changed() { syncShape(); onAnyChange(); reestimate(); }
  function reestimate() {
    if (estTimer) clearTimeout(estTimer);
    estTimer = setTimeout(async () => {
      estTimer = null;
      const filter = currentFilter();
      if (filter) { const v = F.validateFilter(filter); if (!v.ok) { est.className = 'chan-af-stat chan-flow-status chan-warn'; est.textContent = t('Filter is incomplete: {why}', { why: problemWords(v) }); estHint.textContent = ''; state.lastEstimate = null; onAnyChange(); return; } }
      const cur = current();
      const r = await st.estimate(filter, { notify: cur.notify, digestMinutes: cur.digestMinutes, dailyWakeCap: cur.dailyWakeCap }, cur.principal ? { kind: cur.principal.kind, id: cur.principal.id } : null);
      if (!r || r.error) { est.className = 'chan-af-stat chan-flow-status chan-warn'; est.textContent = (r && r.error) || t('Estimate failed'); estHint.textContent = ''; state.lastEstimate = null; onAnyChange(); return; }
      state.lastEstimate = r.estimate;
      est.className = 'chan-af-stat chan-flow-status';
      est.textContent = r.stat;
      estHint.textContent = r.hint || '';
      onAnyChange();
    }, 250);
  }
  for (const r of [wAll, wRule, wMen, hNow, hDig]) r.inp.onchange = () => changed();
  matchSel.onchange = () => changed();
  mentionInp.oninput = () => changed();
  digestMin.oninput = () => changed();
  capInp.oninput = () => changed();
  host.appendChild(box);
  syncShape();
  reestimate();
  return {
    box,
    key: () => key,
    setWho,
    expected() {
      const e = state.lastEstimate;
      const cur = current();
      return { notify: cur.notify, digestMinutes: cur.digestMinutes, matchedPerDay: e ? e.matchedPerDay : 0, dailyWakeCap: cur.dailyWakeCap, principal: cur.principal || null };
    },
    read() {
      const p = principals.find((x) => x.value === key);
      if (!p) return { error: t('Pick who gets woken.') };
      // THE WIRE IS THE PURE MAPPING'S ANSWER (`current()` = watcherOfAnswers) — its filter too
      const cur = current();
      const filter = cur.filter || null;
      if (filter) { const v = F.validateFilter(filter); if (!v.ok) return { error: t('Filter is incomplete: {why}', { why: problemWords(v) }) }; }
      const d = clampOf(digestMin, F.MIN_DIGEST_MINUTES, F.MAX_DIGEST_MINUTES);
      const c = clampOf(capInp, 0, F.MAX_DAILY_WAKE_CAP);
      if (d.value !== null) digestMin.value = String(d.value);
      if (c.value !== null) capInp.value = String(c.value);
      return { watcher: { principal: { kind: p.kind, id: p.id, name: p.name }, delivery: whenNow(), ...(w && F.watchOriginOf(w) === 'agent' ? { origin: 'agent' } : {}), mode: cur.mode, notify: cur.notify, digestMinutes: cur.digestMinutes, dailyWakeCap: cur.dailyWakeCap, receiptWake: cur.receiptWake, ...(filter ? { filter } : {}), estimateAtSet: state.lastEstimate }, clamped: !!((howNow() === 'digest' && d.note) || c.note) };
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
/**
 * THE RULE PREVIEW under one keyword / regex rule row (lane notify-rules-r2): judged here first (a refused regex says
 * why under the box and asks nothing), then — 300 ms after the last keystroke, one request in flight, the last one
 * wins — the grain's preview route lists the newest ≤ 10 stored messages it matches: sender · time · the line with
 * the match marked (textContent + a <mark>, never markup from a message) and "showing n of N".
 */
function rulePreview(st, rule, row) {
  const box = el('div', 'chan-rule-preview');
  let timer = null, seq = 0;
  const say = (text, warn = false) => { box.textContent = ''; if (text) box.appendChild(noteEl(text, warn)); };
  const run = async () => {
    const my = ++seq;
    const v = F.validateRule(rule);
    if (!v.ok) { say(rule.value ? F.filterProblemText(v, { t, ruleLabel: (k) => RULE_LABELS()[k] || k }) : '', !!rule.value); box.dataset.state = rule.value ? 'refused' : 'empty'; return; }
    box.dataset.state = 'loading';
    const r = await st.preview(v.rule);
    if (my !== seq) return;
    if (!r || r.error) { say(r && r.why ? F.filterProblemText({ ok: false, code: r.why, error: r.error, piece: r.piece, max: r.max, kind: r.rule }, { t, ruleLabel: (k) => RULE_LABELS()[k] || k }) : routeErrorText(r || { error: t('Preview failed') }), true); box.dataset.state = 'refused'; return; }
    box.textContent = '';
    box.dataset.state = 'ready';
    box.dataset.shown = String(r.shown);
    box.dataset.matched = String(r.matched);
    if (!r.hits.length) { say(t('No stored message matches yet.')); box.dataset.state = 'ready'; return; }
    box.appendChild(el('div', 'chan-rule-preview-head', t('Matching messages stored here, newest first — showing {n} of {total}', { n: r.shown, total: r.matched })));
    const list = el('ul', 'chan-rule-preview-list');
    for (const h of r.hits) {
      const li = el('li', 'chan-rule-preview-hit');
      const who = [h.author, st.kind === 'conversation' ? null : h.title, h.at ? new Date(h.at).toLocaleString() : null].filter(Boolean).join(' · ');
      li.appendChild(el('div', 'chan-rule-preview-who', who));
      const line = el('div', 'chan-rule-preview-line');
      const mark = document.createElement('mark');
      mark.textContent = h.match;
      line.append(document.createTextNode(h.before), mark, document.createTextNode(h.after));
      li.appendChild(line);
      list.appendChild(li);
    }
    box.appendChild(list);
  };
  const kick = () => { clearTimeout(timer); timer = setTimeout(() => { run().catch(() => say(t('Preview failed'), true)); }, 300); };
  const inp = row.querySelector('input');
  if (inp) inp.addEventListener('input', kick);
  if (rule.value) kick();
  return { el: box };
}

export async function showNotifyDialog(app, target) {
  const st = await grainState(target);
  if (!st) return;
  const { body, close } = createModalShell({ id: 'chan-notify-dialog', title: grainTitle(st, 'notify'), dialogClass: 'chan-dialog chan-assign chan-notify', escapeToClose: true });
  const principals = st.access.map((r) => ({ value: pkOf(r.principal), label: principalText(r.principal), kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null, authority: r.authority }));
  for (const r of st.eligibleAbove || []) if (r && r.principal && !principals.some((x) => x.value === pkOf(r.principal))) principals.push({ value: pkOf(r.principal), label: `${principalText(r.principal)} ${r.via === 'pattern' ? t('(rule)') : r.via === 'grant' ? t('(approved request)') : t('(account)')}`, kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null, authority: null });
  // lane notify-rules-r2 (owner inc-muxt96t5-pk42): a group that holds access reaches its MEMBER SESSIONS — each is
  // offered as itself (its own row, cap and ledger); the server re-judges the membership at save and on every wake
  const memberOf = new Map();
  for (const g of principals.filter((p) => p.kind === 'group')) {
    for (const s of rosterFromApp(app, { groups: false })) {
      if (!(s.groupIds || []).includes(g.id) || principals.some((x) => x.value === s.key)) continue;
      principals.push({ value: s.key, label: t('Agent · {name} (in {group})', { name: s.name, group: g.name || g.id }), kind: 'agent', id: s.id, name: s.name || null, authority: g.authority, via: g.id });
      memberOf.set(g.id, g.name || g.id);
    }
  }
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
  if (memberOf.size) body.appendChild(noteEl(t('Sessions of {groups} inherit its access — pick one to wake it as itself, under its own daily cap.', { groups: [...memberOf.values()].join(', ') })));
  if (principals.some((p) => p.kind === 'everyone')) body.appendChild(noteEl(t('All agents wakes every running conversation — a billed turn for each, each under its own daily cap.'), true));
  const lw = st.stats && st.stats.lastWake;
  if (lw) body.appendChild(noteEl(lw.ok
    ? t('Last wake: {n} message(s) delivered via {lane} — {why}', { n: lw.n, lane: chanCaps.deliveryLaneText(lw.lane || 'message', { t }), why: lw.whys ? lw.whys.map((w) => wakeWhyText(w)).join(', ') : '' })
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
    // ALL AGENTS is one cap PER RUNNING CONVERSATION — counted that way (the roster's agent conversations now), and
    // the MULTIPLIER is said (verify r1 T2 ①: the owner must see "N conversations now × the cap", not one product)
    const running = ((app.sidebar && app.sidebar._webuiSessions) || []).filter((s) => s && (s.backendSessionId || s.claudeSessionId)).length;
    const expected = rows.map((r) => r.expected());
    const allRow = expected.find((e) => e && e.principal && e.principal.kind === 'everyone');
    total.textContent = !rows.length ? t('Nobody is notified — saving wakes nobody (access stays).')
      : allRow ? t('In all: about {n} wakes a day — {running} conversation(s) running now, All agents is at most {cap} a day for EACH of them (a conversation started later gets its own); every notification has its own cap', { n: F.expectedWakesTotal(expected, { running }), running, cap: F.digestCap(allRow) })
        : t('In all: about {n} wakes a day — each notification has its own cap', { n: F.expectedWakesTotal(expected, { running }) });
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
    const members = principals.filter((p) => p.via).map((p) => ({ cid: p.id, groups: [p.via] }));
    const vw = F.validateWatchers(watchers.map((w) => ({ ...w, ...(w.filter ? { filterId: 'inline' } : {}) })), st.access, { inherited: st.eligibleAbove || [], members });
    if (!vw.ok) { showToast(routeErrorText({ code: vw.code, error: vw.error, why: vw.why, principal: vw.principal }), { type: 'error' }); return; }
    save.disabled = true;
    try {
      if (!st.watchersUrl) { showToast(t('Save the rule\'s access first'), { type: 'error' }); return; }
      const r = await put(st.watchersUrl, { watchers, base: st.stamp }, 'PUT', { onChanged: () => { close(); showNotifyDialog(app, target); } });
      if (!r) return;
      showToast(watchers.length ? t('Notifications saved: {list}', { list: watchers.map((w) => `${principalText(w.principal)} ${watcherHowText(w)}`).join(', ') }) + (clamped ? ' · ' + t('numbers past their bounds were kept at the bound') : '') : t('Nobody is notified here any more'));
      close();
    } finally { save.disabled = false; refocus(save); }
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

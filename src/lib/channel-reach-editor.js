// THE AGENT REACH + SENDING POLICY DIALOG (docs/design-communication-panel.zh.md
// §8, §9.1, §10.1; P3; the a4 UI design — a1 R1–R4). One dialog per
// conversation, from the row menu:
//
//   REACH — every grant on this conversation WITH its origin (user /
//   assignment / request — who wrote it, so the panel can say WHY a principal
//   sees this) as ONE bordered list whose rows put the fact that matters
//   first (who, 12px) beside a neutral level pill (`visible` / `may request`
//   — never the panel's green, which means "live"), the origin dim, and the
//   user's own rows removable with an × (an assignment's row belongs to the
//   assignment; a request's to the approval); a user-written grant added for
//   a live agent session or a Task Group at `visible` or `requestable`; the
//   OPEN ACCESS REQUESTS with the agent's stated reason — approve = exactly
//   ONE visible grant, deny = nothing changes.
//
//   POLICY — direct / review / the adapter's default, the guards that stack
//   on top named beside it (they can only tighten it).
//
// Every string from the server is textContent. Decisions PUT/POST and let the
// broadcast repaint — nothing waits for its echo.
//
// 2026-09-26 (§8, three homes): the rows come from the FULL view (the list's
// slim rows carry no reach) — the conversation's own rows, the ACCOUNT-scope
// row an account assignment wrote ("the whole account") and the rows a
// matching RULE implies ("by a rule", derived, never stored).
import { fetchJson, showToast, createModalShell } from './utils.js';
import { t } from './i18n.js';
import { icon, el, btn } from './channel-chrome.js';
// a3 i18n: route failures by CODE; the policy mode and a Task Group's title in words.
import { routeErrorText, policyModeText, groupTitle } from './channel-words.js';
// the ONE principal picker (search + list, keyed, recent picks) — never a <select> of the whole roster
import { principalPicker, rosterFromApp } from './principal-picker.js';
// lane account-policy-door: the ONE policy row model, and the account door's section 2 = the Grant access body itself
import * as P from '../channel-policy.js';
import { grainState, grantAccessBody, showNotifyDialog } from './channel-filter-editor.js';

const JSON_HDR = { 'Content-Type': 'application/json' };
async function api(pathname, body, method = 'PUT') {
  const r = await fetchJson(pathname, { method, headers: JSON_HDR, body: JSON.stringify(body || {}) });
  if (!r || r.error) { showToast(routeErrorText(r), { type: 'error' }); return null; }
  return r;
}
function originLabel(o) {
  switch (o) {
    case 'user': return t('you granted it');
    case 'access': case 'assignment': return t('by an access grant');
    case 'request': return t('you approved a request');
    default: return String(o || '');
  }
}
function levelLabel(l) {
  switch (l) {
    case 'visible': return t('visible');
    case 'requestable': return t('may request');
    case 'hidden': return t('hidden');
    default: return String(l || '');
  }
}

/** The live sessions + task groups a grant can name — the SAME roster the
 *  Assign editor draws from (the sidebar's live list + its task store), so
 *  the two dialogs cannot name different principals. */
function principals(app) {
  // ALL AGENTS (lane everyone-principal): every conversation, now and later — the picker's first row
  const out = [{ kind: 'everyone', id: '*', name: t('All agents') }];
  const live = (app.sidebar && app.sidebar._webuiSessions) || [];
  const groups = (app.sidebar && app.sidebar._tasks) || [];
  for (const s of live) {
    const cid = s.backendSessionId || s.claudeSessionId;
    if (!cid) continue;
    out.push({ kind: 'agent', id: cid, name: s.name || cid });
  }
  for (const g of groups) if (g && g.id) out.push({ kind: 'group', id: g.id, name: groupTitle(g) });   // the store's `title`, never a `name` it lacks
  return out;
}

/** The guards as the client holds them (Settings → Channels) — the row model's guards line; never fetched here. */
export function policyGuards(app) {
  const g = (k) => { try { return app && app.settings ? app.settings.get(k) : undefined; } catch { return undefined; } };
  return { linksReview: g('channels.guardLinksReview') !== false, attachmentsReview: g('channels.guardAttachmentsReview') !== false, offHoursTz: g('channels.offHoursTz') || '' };
}
/** THE POLICY ROW as drawn (lane account-policy-door): ONE renderer over the PURE `policyRowModel` — the account's
 *  Reach & policy… and a conversation's draw the same select, the same words, the same source + guards lines.
 *  `onPick(mode | null, model, select)`. */
export function policyRowEl(app, { grain, policy, onPick }) {
  const m = P.policyRowModel({ grain, policy, guards: policyGuards(app), t, modeText: policyModeText });
  const box = el('div', 'chan-policy-row');
  box.dataset.policySource = m.source;
  box.dataset.policyMode = m.mode;
  box.appendChild(el('div', 'chan-opt-label', t('Sending policy')));
  const sel = el('select', 'chan-opt-input chan-policy-pick');
  const modeRows = m.choices;   // policy modes, not principals (the principal-picker census reads a `choices` loop as a roster)
  for (const c of modeRows) { const op = el('option', '', c.label); op.value = c.value || ''; sel.appendChild(op); }
  sel.value = m.value || '';
  sel.onchange = () => onPick(sel.value === '' ? null : sel.value, m, sel);
  box.appendChild(sel);
  box.appendChild(el('div', 'chan-flow-note chan-policy-source', m.sourceText));
  if (!m.offersDirect) box.appendChild(el('div', 'chan-flow-note', t('This channel offers no “send directly”: every message an agent drafts here waits for your approval on the Outbox card.')));
  box.appendChild(el('div', 'chan-flow-note chan-policy-guards', m.guardsText));
  return box;
}

/** THE WHOLE ACCOUNT's REACH & POLICY… (lane account-policy-door, userW 2026-10-07 "想给整个 Lark 配置可见性与策略，但
 *  配不了": the account's policy had a route and no door) — ONE dialog at the account grain: ① the sending policy (the
 *  SAME row as a conversation's; a pick PUTs `{policy, base}` — moved since ⇒ 409 `policy-changed`, re-read), ② who
 *  may read and act = the Grant access body itself (imported, never a copy — a `send` pick is offered the moment ①
 *  reads direct, in place, no reopen), ③ who is woken = a line + the Notify… door (not a second copy). */
export async function showAccountReachDialog(app, adapter) {
  const target = { kind: 'account', adapter };
  const st = await grainState(target);
  if (!st) return;
  const aid = encodeURIComponent(adapter.id);
  let part = null;
  const { body, close } = createModalShell({ id: 'chan-account-reach-dialog', title: t('Reach & policy — {title}', { title: st.name }), dialogClass: 'chan-dialog chan-assign chan-access chan-reach', escapeToClose: true, onClose: () => { if (part) part.picker.close(); } });
  let pol = st.adapter.policy || null;
  const polHost = el('div', 'chan-account-policy');
  const drawPolicy = () => {
    polHost.textContent = '';
    polHost.appendChild(policyRowEl(app, { grain: 'account', policy: pol, onPick: async (mode, m, sel) => {
      sel.disabled = true;
      const r = await fetchJson(`/api/channels/adapters/${aid}`, { method: 'PUT', headers: JSON_HDR, body: JSON.stringify({ policy: mode, base: m.own }) });
      if (!r || r.error) showToast(routeErrorText(r), { type: 'error' }); else showToast(t('Policy saved'));
      // the value as it is NOW (saved, or moved since by the other door) — ② re-draws its authority choices in place
      const fresh = await fetchJson(`/api/channels/adapters/${aid}/view`);
      if (fresh && fresh.adapter && fresh.adapter.policy) pol = fresh.adapter.policy;
      drawPolicy();
      if (part) part.setCaps({ ...st.caps, policyRequiresReview: !(pol && pol.mode === 'direct') });
    } }));
  };
  drawPolicy();
  body.appendChild(polHost);
  const sec2 = el('div', 'chan-account-access');
  body.appendChild(sec2);
  part = grantAccessBody(app, st, sec2, { close, target, notify: false, reopen: () => showAccountReachDialog(app, adapter) });
  const n = (st.watchers || []).length;
  body.appendChild(el('div', 'chan-opt-label', t('Who is woken')));
  const wk = el('div', 'chan-flow-actions chan-account-woken');
  wk.append(el('span', 'chan-flow-note', n ? t('{n} notification(s) on the whole account — access alone never wakes anyone', { n }) : t('Nobody is woken by this account yet — access alone never wakes anyone')), btn(t('Notify…'), () => { close(); showNotifyDialog(app, target); }));
  body.appendChild(wk);
}

export async function showReachDialog(app, conv0) {
  const base = `/api/channels/${encodeURIComponent(conv0.adapterId)}/${encodeURIComponent(conv0.id)}`;
  const full = await fetchJson(base);
  if (!full || full.error) { showToast(routeErrorText(full), { type: 'error' }); return; }
  const conv = full.conversation;
  // the picker's roster listener (and its open popover) end WITH the dialog (verify round 2)
  let who = null;
  const { body, close } = createModalShell({ id: 'chan-reach-dialog', title: t('Reach & policy — {title}', { title: conv.title || conv.id }), dialogClass: 'chan-dialog chan-reach', bodyClass: 'chan-flow-body', escapeToClose: true, onClose: () => { if (who) who.close(); } });
  let current = conv;
  // "Grant reach to…": ONE picker for the dialog's life (a repaint re-appends it — never re-created, a
  // popover the person has open survives a broadcast); its rows are the live roster, re-read on its broadcasts
  who = principalPicker({ items: () => rosterFromApp(app), app, compact: true, placeholder: t('Grant reach to…'), label: t('Grant reach to…'), everyone: { key: 'everyone:*' } });
  who.el.classList.add('chan-reach-who-pick');

  function draw() {
    body.textContent = '';
    // ── POLICY ── (lane account-policy-door: the SAME row as the account's door; its source said — "inherits the
    // account (direct)" — and "Use the account's" = PUT null)
    body.appendChild(policyRowEl(app, { grain: 'conversation', policy: current.policy, onPick: async (mode) => { const r = await api(`${base}/policy`, { mode }); if (r) showToast(t('Policy saved')); } }));

    // ── REACH ──
    body.appendChild(el('div', 'chan-opt-label', t('Who can see this conversation')));
    const entries = (current.reach && current.reach.entries) || [];
    const roster = principals(app);
    // a grant an ASSIGNMENT wrote carries only {kind, id}: the name is the
    // roster's (a Task Group's `title`), never the id on screen (a1 A5)
    const nameOf = (pr) => (pr.kind === 'everyone' ? t('All agents') : pr.name || (roster.find((x) => x.kind === pr.kind && x.id === pr.id) || {}).name || pr.id);
    if (!entries.length) body.appendChild(el('div', 'chan-flow-note', t('Nobody yet — every agent is hidden from it by default.')));
    else {
      const listEl = el('div', 'chan-reach-list');
      // ALL AGENTS first (the cards put the All chip first)
      for (const g of [...entries.filter((x) => x.principal && x.principal.kind === 'everyone'), ...entries.filter((x) => !(x.principal && x.principal.kind === 'everyone'))]) {
        const row = el('div', 'chan-reach-row');
        row.dataset.grant = g.id;
        const who = el('span', 'chan-reach-who');
        if (g.principal.kind !== 'everyone') who.appendChild(el('span', 'chan-reach-kind', g.principal.kind === 'group' ? t('group') : t('agent')));   // "All agents" names itself
        who.appendChild(el('span', '', nameOf(g.principal)));
        const lv = el('span', `chan-reach-level chan-reach-level-${g.level}`, levelLabel(g.level));
        // WHERE the row lives (§8, 2026-09-26): the whole account, a rule, or this conversation
        const org = el('span', 'chan-reach-origin', g.scope && g.scope.kind === 'adapter' ? `${originLabel(g.origin)} · ${t('the whole account')}` : g.pattern ? `${originLabel(g.origin)} · ${t('by a rule')}` : originLabel(g.origin));
        row.append(who, lv, org);
        if (g.origin === 'user') {
          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'icon-btn chan-reach-rm';
          rm.title = t('Remove');
          rm.appendChild(icon('close', 12));
          rm.onclick = async () => { rm.disabled = true; const r = await api(`${base}/reach`, { principal: g.principal, level: null }); if (!r) rm.disabled = false; };
          row.appendChild(rm);
        } else {
          const n = el('span', 'chan-reach-note', g.origin === 'access' || g.origin === 'assignment' ? (g.pattern ? t('removed with the rule\'s access') : g.scope && g.scope.kind === 'adapter' ? t('removed with the account\'s access (Grant access…)') : t('removed with its access (Grant access…)')) : t('a request you approved'));
          row.appendChild(n);
        }
        listEl.appendChild(row);
      }
      body.appendChild(listEl);
      // verify r1 T2 ⑥: reach is the MAX over the rows naming the agent — a requestable row beside a VISIBLE All row
      // changes nothing, and the owner who added it wanting less is told so
      const allVisible = entries.some((g) => g.principal && g.principal.kind === 'everyone' && g.level === 'visible');
      const moot = allVisible ? entries.filter((g) => g.principal && g.principal.kind !== 'everyone' && g.level !== 'visible').map((g) => nameOf(g.principal)) : [];
      if (moot.length) body.appendChild(el('div', 'chan-flow-note chan-reach-moot', t('All agents is visible here, so a requestable row beside it changes nothing: {names} can already see it (remove the All agents row to narrow).', { names: moot.join(', ') })));
    }
    // add a grant
    const add = el('div', 'chan-reach-add');
    const lvSel = el('select', 'chan-opt-input');
    for (const o of [{ value: 'visible', label: t('visible') }, { value: 'requestable', label: t('may request') }]) { const op = el('option', '', o.label); op.value = o.value; lvSel.appendChild(op); }
    const go = btn(t('Grant'), null, 'mounts-btn-primary');
    go.onclick = async () => {
      // the picker's key IS the old option value (`agent:<cid>` / `group:<id>`) — the wire is unchanged
      const k = who.selected()[0];
      const p = principals(app).find((x) => `${x.kind}:${x.id}` === k);
      if (!p) { showToast(t('Pick an agent or a group.'), { type: 'error' }); return; }
      go.disabled = true;
      const r = await api(`${base}/reach`, { principal: { kind: p.kind, id: p.id, name: p.kind === 'everyone' ? null : p.name }, level: lvSel.value });
      go.disabled = false;
      if (r) { showToast(t('Reach granted')); who.setSelected([]); }
    };
    add.append(who.el, lvSel, go);
    body.appendChild(add);

    // ── REQUESTS ──
    const reqs = ((current.reach && current.reach.requests) || []).filter((r) => r.status === 'open');
    if (reqs.length) {
      body.appendChild(el('div', 'chan-opt-label', t('Access requests')));
      for (const rq of reqs) {
        const row = el('div', 'chan-reach-req');
        row.dataset.request = rq.id;
        row.appendChild(el('div', 'chan-reach-who', t('{who} asks: {why}', { who: nameOf(rq.principal), why: rq.why || '' })));
        const acts = el('div', 'chan-flow-actions');
        const no = btn(t('Deny'), null);
        no.onclick = async () => { no.disabled = true; const r = await api(`/api/channels/reach-requests/${encodeURIComponent(rq.id)}/deny`, {}, 'POST'); if (!r) no.disabled = false; };
        const ok = btn(t('Approve (this session, this conversation)'), null, 'mounts-btn-primary');
        ok.onclick = async () => { ok.disabled = true; const r = await api(`/api/channels/reach-requests/${encodeURIComponent(rq.id)}/approve`, {}, 'POST'); if (!r) ok.disabled = false; else showToast(t('Approved')); };
        acts.append(no, ok);
        row.appendChild(acts);
        body.appendChild(row);
      }
    }
    const actions = el('div', 'chan-flow-actions');
    actions.appendChild(btn(t('Close'), close));
    body.appendChild(actions);
  }
  draw();
  // repaint when the broadcast names THIS conversation (or is a whole
  // digest): re-read its FULL view — the list's rows carry no reach
  const key = `${conv.adapterId}/${conv.id}`;
  const onBroadcast = (msg) => {
    if (msg.type !== 'channels-updated') return;
    if (!document.getElementById('chan-reach-dialog')) { try { app.ws.offGlobal(onBroadcast); } catch {} return; }
    if (msg.partial && !(Array.isArray(msg.changedKeys) && msg.changedKeys.includes(key))) return;
    fetchJson(base).then((r) => { if (r && !r.error && r.conversation && document.getElementById('chan-reach-dialog')) { current = r.conversation; draw(); } }).catch(() => {});
  };
  app.ws.onGlobal(onBroadcast);
}

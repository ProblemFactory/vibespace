// THE AGENT REACH + SENDING POLICY DIALOG (docs/design-communication-panel.zh.md
// §8, §9.1, §10.1; P3). One dialog per conversation, from the row menu:
//
//   REACH — every grant on this conversation WITH its origin (user /
//   assignment / request — who wrote it, so the panel can say WHY a principal
//   sees this), a user-written grant added for a live agent session or a
//   Task Group at `visible` or `requestable`, the user's own rows removable
//   (an assignment's row belongs to the assignment; a request's to the
//   approval), and the OPEN ACCESS REQUESTS with the agent's stated reason —
//   approve = exactly ONE visible grant, deny = nothing changes.
//
//   POLICY — direct / review / the adapter's default, the guards that stack
//   on top named beside it (they can only tighten it).
//
// Every string from the server is textContent. Decisions PUT/POST and let the
// broadcast repaint — nothing waits for its echo.
import { fetchJson, showToast, createModalShell } from './utils.js';
import { t } from './i18n.js';

const JSON_HDR = { 'Content-Type': 'application/json' };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
async function api(pathname, body, method = 'PUT') {
  const r = await fetchJson(pathname, { method, headers: JSON_HDR, body: JSON.stringify(body || {}) });
  if (!r || r.error) { showToast((r && r.error) || t('Request failed'), { type: 'error' }); return null; }
  return r;
}
function originLabel(o) {
  switch (o) {
    case 'user': return t('you granted it');
    case 'assignment': return t('by assignment');
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
  const out = [];
  const live = (app.sidebar && app.sidebar._webuiSessions) || [];
  const groups = (app.sidebar && app.sidebar._tasks) || [];
  for (const s of live) {
    const cid = s.backendSessionId || s.claudeSessionId;
    if (!cid) continue;
    out.push({ kind: 'agent', id: cid, name: s.name || cid });
  }
  for (const g of groups) if (g && g.id) out.push({ kind: 'group', id: g.id, name: g.name || g.id });
  return out;
}

export function showReachDialog(app, conv) {
  const base = `/api/channels/${encodeURIComponent(conv.adapterId)}/${encodeURIComponent(conv.id)}`;
  const { body, close } = createModalShell({ id: 'chan-reach-dialog', title: t('Reach & policy — {title}', { title: conv.title || conv.id }), bodyClass: 'chan-flow-body', minWidth: 'min(560px, 92vw)', escapeToClose: true });
  let current = conv;

  function draw() {
    body.textContent = '';
    // ── POLICY ──
    body.appendChild(el('div', 'chan-opt-label', t('Sending policy')));
    const pol = current.policy || { mode: 'review', source: 'default' };
    const sel = el('select', 'chan-opt-input');
    for (const o of [
      { value: 'review', label: t('review — every proposal waits for your approval') },
      { value: 'direct', label: t('direct — a proposal with send authority goes out at once (guards still apply)') },
      { value: '', label: t('the adapter\'s default') },
    ]) { const op = el('option', '', o.label); op.value = o.value; sel.appendChild(op); }
    sel.value = pol.source === 'conversation' ? pol.mode : '';
    sel.onchange = async () => { const r = await api(`${base}/policy`, { mode: sel.value === '' ? null : sel.value }); if (r) showToast(t('Policy saved')); };
    body.appendChild(sel);
    body.appendChild(el('div', 'chan-flow-note', t('Reads as: {mode} ({source}). Guards on top can only tighten it: a link, an attachment or off-hours always needs your approval (Settings → Channels).', { mode: pol.mode, source: pol.source === 'conversation' ? t('set here') : pol.source === 'adapter-default' ? t('the adapter\'s default') : t('the default: review') })));

    // ── REACH ──
    body.appendChild(el('div', 'chan-opt-label', t('Who can see this conversation')));
    const entries = (current.reach && current.reach.entries) || [];
    if (!entries.length) body.appendChild(el('div', 'chan-flow-note', t('Nobody yet — every agent is hidden from it by default.')));
    for (const g of entries) {
      const row = el('div', 'chan-reach-row');
      row.dataset.grant = g.id;
      const who = el('span', 'chan-reach-who', `${g.principal.kind === 'group' ? t('group') : t('agent')} ${g.principal.name || g.principal.id}`);
      const lv = el('span', `chan-chip chan-reach-level-${g.level}`, levelLabel(g.level));
      const org = el('span', 'chan-reach-origin', originLabel(g.origin));
      row.append(who, lv, org);
      if (g.origin === 'user') {
        const rm = el('button', 'chan-btn', t('Remove'));
        rm.type = 'button';
        rm.onclick = async () => { rm.disabled = true; const r = await api(`${base}/reach`, { principal: g.principal, level: null }); if (!r) rm.disabled = false; };
        row.appendChild(rm);
      } else {
        row.appendChild(el('span', 'chan-reach-note', g.origin === 'assignment' ? t('removed with the assignment') : t('a request you approved')));
      }
      body.appendChild(row);
    }
    // add a grant
    const add = el('div', 'chan-reach-add');
    const whoSel = el('select', 'chan-opt-input');
    const ph = el('option', '', t('Grant reach to…')); ph.value = ''; whoSel.appendChild(ph);
    const lvSel = el('select', 'chan-opt-input');
    for (const o of [{ value: 'visible', label: t('visible') }, { value: 'requestable', label: t('may request') }]) { const op = el('option', '', o.label); op.value = o.value; lvSel.appendChild(op); }
    const go = el('button', 'chan-btn chan-btn-primary', t('Grant'));
    go.type = 'button';
    const roster = principals(app);
    for (const p of roster) { const op = el('option', '', `${p.kind === 'group' ? t('group') : t('agent')}: ${p.name}`); op.value = `${p.kind}:${p.id}`; whoSel.appendChild(op); }
    go.onclick = async () => {
      const p = roster.find((x) => `${x.kind}:${x.id}` === whoSel.value);
      if (!p) { showToast(t('Pick an agent or a group.'), { type: 'error' }); return; }
      go.disabled = true;
      const r = await api(`${base}/reach`, { principal: { kind: p.kind, id: p.id, name: p.name }, level: lvSel.value });
      go.disabled = false;
      if (r) showToast(t('Reach granted'));
    };
    add.append(whoSel, lvSel, go);
    body.appendChild(add);

    // ── REQUESTS ──
    const reqs = ((current.reach && current.reach.requests) || []).filter((r) => r.status === 'open');
    if (reqs.length) {
      body.appendChild(el('div', 'chan-opt-label', t('Access requests')));
      for (const rq of reqs) {
        const row = el('div', 'chan-reach-req');
        row.dataset.request = rq.id;
        row.appendChild(el('div', 'chan-reach-who', t('{who} asks: {why}', { who: rq.principal.name || rq.principal.id, why: rq.why || '' })));
        const acts = el('div', 'chan-flow-actions');
        const ok = el('button', 'chan-btn chan-btn-primary', t('Approve (this session, this conversation)'));
        ok.type = 'button';
        ok.onclick = async () => { ok.disabled = true; const r = await api(`/api/channels/reach-requests/${encodeURIComponent(rq.id)}/approve`, {}, 'POST'); if (!r) ok.disabled = false; else showToast(t('Approved')); };
        const no = el('button', 'chan-btn', t('Deny'));
        no.type = 'button';
        no.onclick = async () => { no.disabled = true; const r = await api(`/api/channels/reach-requests/${encodeURIComponent(rq.id)}/deny`, {}, 'POST'); if (!r) no.disabled = false; };
        acts.append(ok, no);
        row.appendChild(acts);
        body.appendChild(row);
      }
    }
    const actions = el('div', 'chan-flow-actions');
    const done = el('button', 'chan-btn', t('Close'));
    done.type = 'button';
    done.onclick = () => close();
    actions.appendChild(done);
    body.appendChild(actions);
  }
  draw();
  // repaint from the broadcast digest (this row's fresh reach + policy)
  const onBroadcast = (msg) => {
    if (msg.type !== 'channels-updated' || !msg.digest) return;
    const fresh = (msg.digest.conversations || []).find((c) => c.adapterId === conv.adapterId && c.id === conv.id);
    if (!fresh) return;
    current = fresh;
    if (document.getElementById('chan-reach-dialog')) draw(); else { try { app.ws.offGlobal(onBroadcast); } catch {} }
  };
  app.ws.onGlobal(onBroadcast);
}

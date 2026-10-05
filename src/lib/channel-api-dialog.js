// THE RAW API — the user's side (B-2198, docs/design-channel-raw-api.md §3). ONE dialog per credential, opened from the
// account card's "API access…" (and from a chat's API call row): the credential (one picker, labelled by source — a
// Channels account or a Google storage mount, D3), who may call it at which tier (a new pick starts at Read, D1), the
// vendor's sensitive list (always asks), the call shapes the user always allowed (revocable, D2), the calls waiting for
// the user (the proposal card: what you approve is what runs) and the API log. Every row keyed; words zh/ja.
import { fetchJson, createModalShell, showToast } from './utils.js';
import { t } from './i18n.js';
import { principalPicker, rosterFromApp } from './principal-picker.js';
import { renderApiCard } from './channel-api-card-view.js';   // B-2198 part 2: the ONE card (chat · Outbox · For you · here)

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const button = (label, onClick, cls = 'mounts-btn') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', onClick); return b; };
const TIER_WORDS = () => [['read', t('Read')], ['write-ask', t('Read + write, ask each')], ['write-auto', t('Read + write, auto (sensitive still asks)')]];
const clock = (at) => new Date(Number(at) || 0).toLocaleString();
// the vendor's sensitive list as a person reads it (lane channel-api-chrome: the dialog printed the regex sources) —
// `^\/api\/admin\.` ⇒ "/api/admin.…", `\.(delete|remove)$` ⇒ "….(delete|remove)"
export const sensitiveWords = (src) => { const s = String(src || ''); return `${s.startsWith('^') ? '' : '…'}${s.replace(/^\^/, '').replace(/\$$/, '').replace(/\\(.)/g, '$1')}${s.endsWith('$') ? '' : '…'}`; };
// the API log's verdict as a word (the audit line keeps its id)
const VERDICT_WORD = { ok: 'ran', proposed: 'asked you', approved: 'approved by you', rejected: 'rejected', refused: 'refused', withheld: 'withheld' };

/** Open the dialog on one credential (`cred` = an account id or `mount:<id>`). */
export async function showApiAccessDialog(app, cred) {
  let view;
  try { view = await fetchJson('/api/channels/api'); } catch (e) { showToast(String((e && e.message) || e)); return; }
  const creds = view.creds || [];
  let cur = creds.find((c) => c.id === cred) || creds[0];
  if (!cur) { showToast(t('Agents cannot call this API until you grant it')); return; }
  const { body, dialog, close } = createModalShell({ id: 'chan-api-dialog', title: t('API access'), dialogClass: 'chan-api-dialog', minWidth: 'min(560px, 96vw)' });
  const draw = () => {
    body.textContent = '';
    // THE CREDENTIAL — one picker, labelled by source
    const pick = el('select', 'chan-api-cred');
    pick.setAttribute('aria-label', t('Credential'));
    for (const c of creds) { const o = el('option', '', `${c.source === 'mount' ? t('Storage mount') : t('Channels')} · ${c.label}`); o.value = c.id; if (c.id === cur.id) o.selected = true; pick.appendChild(o); }
    pick.addEventListener('change', () => { cur = creds.find((c) => c.id === pick.value) || cur; draw(); });
    body.append(el('div', 'dialog-label', t('Credential')), pick);
    // WHO, AT WHICH TIER
    const rows = (cur.grants || []).map((g) => ({ key: `${g.principal.kind}:${g.principal.id}`, principal: g.principal, tier: g.tier, perDay: g.perDay, allWrite: g.principal.kind === 'everyone' && g.tier !== 'read' }));
    if (!rows.length) body.appendChild(el('div', 'chan-api-none chat-status-dim', t('Agents cannot call this API until you grant it')));
    const list = el('div', 'chan-api-rows');
    const drawRows = () => {
      list.textContent = '';
      for (const r of rows) {
        const row = el('div', 'chan-api-row'); row.dataset.key = r.key;
        const roster = rosterFromApp(app).find((x) => x.key === r.key);
        const name = el('span', 'chan-api-who', r.key === 'everyone:*' ? t('All agents') : (roster && roster.name) || r.principal.name || r.principal.id);
        const sel = el('select', 'chan-api-tier'); sel.setAttribute('aria-label', t('API access'));
        for (const [v, w] of TIER_WORDS()) { const o = el('option', '', w); o.value = v; if (v === r.tier) o.selected = true; sel.appendChild(o); }
        sel.addEventListener('change', () => { r.tier = sel.value; if (r.key === 'everyone:*') { r.allWrite = false; drawRows(); } });
        const cap = el('input', 'chan-api-cap'); cap.type = 'number'; cap.min = '1'; cap.placeholder = '1000'; cap.value = r.perDay ? String(r.perDay) : ''; cap.title = t('Calls a day'); cap.setAttribute('aria-label', t('Calls a day'));
        cap.addEventListener('change', () => { r.perDay = Number(cap.value) > 0 ? Number(cap.value) : null; });
        row.append(name, sel, cap);
        list.appendChild(row);
        // ALL AGENTS: Read at most by default (src/channel-api.js EVERYONE_TIER) — a write tier for everyone is its own tick
        if (r.key === 'everyone:*' && r.tier !== 'read') {
          const lab = el('label', 'chan-api-allwrite'); const tick = el('input'); tick.type = 'checkbox'; tick.checked = !!r.allWrite;
          tick.addEventListener('change', () => { r.allWrite = tick.checked; });
          lab.append(tick, el('span', '', t('Let every agent write through this account — every conversation, not only the ones you picked')));
          list.appendChild(lab);
        }
      }
    };
    const picker = principalPicker({
      items: () => rosterFromApp(app), app, multi: true, selected: rows.map((r) => r.key), placeholder: t('Add an agent or group…'), label: t('Add an agent or group'), everyone: { key: 'everyone:*' },
      onChange: (keys) => {
        for (let i = rows.length - 1; i >= 0; i--) if (!keys.includes(rows[i].key)) rows.splice(i, 1);
        for (const k of keys) if (!rows.some((r) => r.key === k)) { const i = k.indexOf(':'); rows.push({ key: k, principal: { kind: k.slice(0, i), id: k.slice(i + 1) }, tier: 'read', perDay: null }); }   // D1: a new principal starts at Read
        drawRows();
      },
    });
    body.append(picker.el, list);
    drawRows();
    // THE SENSITIVE LIST (read-only)
    const sens = el('div', 'chan-api-sensitive chat-status-dim', `${t('DELETE and these paths always ask')}: ${(cur.sensitive || []).map(sensitiveWords).join(' · ')}`);
    body.appendChild(sens);
    // ALWAYS ALLOWED (per conversation, revocable)
    body.appendChild(el('div', 'dialog-label', t('Always allowed')));
    if (!(cur.shapes || []).length) body.appendChild(el('div', 'chat-status-dim', t('No call shapes are always allowed')));
    for (const s of cur.shapes || []) {
      const r = el('div', 'chan-api-shape'); r.dataset.key = s.id;
      r.append(el('code', '', s.shape), el('span', 'chat-status-dim', ` · ${s.principalName || s.principal}`), button(t('Revoke'), async () => { await fetchJson(`/api/channels/api/shapes/${encodeURIComponent(s.id)}`, { method: 'DELETE' }); await refresh(); }));
      body.appendChild(r);
    }
    // WAITING FOR YOU — the proposal cards of this credential
    body.appendChild(el('div', 'dialog-label', t('Waiting for you')));
    const mine = (view.cards || []).filter((p) => p.cred === cur.id && p.status === 'pending');
    if (!mine.length) body.appendChild(el('div', 'chat-status-dim', t('Nothing waits for you')));
    for (const p of mine) body.appendChild(renderApiCard(p));
    // THE API LOG
    body.appendChild(el('div', 'dialog-label', t('API log')));
    const logEl = el('div', 'chan-api-log');
    body.appendChild(logEl);
    fetchJson(`/api/channels/api/${encodeURIComponent(cur.id)}/log?n=20`).then((j) => {
      const lines = (j && j.lines) || [];
      if (!lines.length) logEl.appendChild(el('div', 'chat-status-dim', t('No calls yet')));
      for (const l of lines.slice().reverse()) { const r = el('div', 'chan-api-logrow'); r.dataset.key = `${l.at}|${l.proposal || ''}|${l.path}`; r.textContent = `${clock(l.at)} · ${(l.principal && l.principal.name) || ''} · ${l.method} ${l.path} · ${l.status || '—'} · ${VERDICT_WORD[l.verdict] ? t(VERDICT_WORD[l.verdict]) : l.verdict}${l.code ? ` ${l.code}` : ''}`; logEl.appendChild(r); }
    }).catch(() => {});
    const foot = el('div', 'dialog-footer');
    foot.append(button(t('Cancel'), () => close()), button(t('Save'), async () => {
      try { await fetchJson(`/api/channels/api/${encodeURIComponent(cur.id)}/grants`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grants: rows.map((r) => ({ principal: r.principal, tier: r.tier, perDay: r.perDay, allWrite: !!r.allWrite })) }) }); close(); }
      catch (e) { showToast(String((e && e.message) || e)); }
    }, 'mounts-btn mounts-btn-primary'));
    body.appendChild(foot);
  };
  const refresh = async () => { try { view = await fetchJson('/api/channels/api'); const c = (view.creds || []).find((x) => x.id === cur.id); if (c) cur = c; draw(); } catch {} };
  draw();
  return dialog;
}


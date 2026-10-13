// The Voice input · Dropline plugin card (design q-029 §1, P0 = the key tier): the key field (secret, `dl_` check),
// Test (= the `dropline` registry row's credential-exchange: ONE GET /v1/me → "Connected: <name> · <team>"), the
// on-switch (refused by the server until a key is saved) and the language preference (auto | zh | en). The key goes
// to the integration store (PUT /api/integrations/dropline) — never into the plugin record.
// Layout (lane voice-card-polish, the Settings card grammar): the HEADER holds the title, the status chip and the
// card's own switch; a labelled grid below — 账号 (Connect primary + the key behind "or paste a key ▸"), the key row
// (Save + Test on one row), 语言 — then the teach subsection (voice-teach-ui.js). Narrow cards stack (chat.css).
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { renderAccountRow, renderTeachSection } from './voice-teach-ui.js'; // P1: Connect with Fish Audio + teach

const KEY_RE = /^dl_[A-Za-z0-9_-]{8,}$/;
const integ = (tail = '', opts = {}) => fetchJson(`/api/integrations/dropline${tail}`, { headers: { 'Content-Type': 'application/json' }, ...opts })
  .then((x) => { if (!x) throw new Error(t('Server unreachable — nothing was changed')); if (x.error) throw new Error(x.error.message || x.error); return x; });
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/** one labelled row of the card's grid: the label column (96 px; above the control on a narrow card) + the control */
function gridRow(grid, cls, label, forId) {
  const row = el('div', `voice-row ${cls}`);
  const lbl = el(forId ? 'label' : 'div', 'voice-row-label', label);
  if (forId) lbl.htmlFor = forId;
  const ctl = el('div', 'voice-row-ctl');
  row.append(lbl, ctl);
  grid.appendChild(row);
  return { row, ctl };
}
let seq = 0;

export function renderDictationCard({ p, head, actions, cfgBox, api, rerender }) {
  const box = el('div', 'plugin-cfg voice-cfg');
  // ── the header: title, the status chip (its words come from /api/voice/status below), the card's own switch ──
  const chip = el('span', 'plugin-state voice-state', t('Not connected'));
  const cb = el('input', 'voice-toggle voice-sw');
  cb.type = 'checkbox'; cb.setAttribute('role', 'switch'); cb.checked = !!p.enabled; cb.disabled = !p.configured;
  cb.title = t('Use voice input in the chat box'); cb.setAttribute('aria-label', cb.title);
  cb.onchange = () => api('enabled', { body: JSON.stringify({ enabled: cb.checked }) }).then(() => rerender())
    .catch((e) => { cb.checked = !!p.enabled; showToast(e.message, { type: 'error' }); });
  const end = el('span', 'voice-head-end');
  end.append(chip, cb);
  if (head) {
    head.classList.add('voice-head');
    const name = head.querySelector('.plugin-name');
    if (name && name.lastChild) name.lastChild.textContent = t('Voice input · Dropline');
    const old = head.querySelector('.plugin-state');
    if (old) old.replaceWith(end); else head.appendChild(end);
  } else actions.appendChild(end);
  // ── the grid: 账号 / Dropline key (folded) / 语言 ──
  const grid = el('div', 'voice-grid');
  const acctRow = gridRow(grid, 'voice-account-cell', t('Account'));
  const acct = el('div', 'voice-account-box');
  const fold = el('button', 'voice-key-fold');
  fold.type = 'button';
  acctRow.ctl.append(acct);
  const keyId = `voice-key-${++seq}`;
  const keyRow = gridRow(grid, 'voice-key-cell', t('Dropline key'), keyId);
  const key = el('input', 'plugin-cfg-input voice-key');
  key.id = keyId; key.type = 'password'; key.autocomplete = 'off'; key.spellcheck = false;
  key.placeholder = p.configured ? t('Saved — paste a new key to replace it') : 'dl_…';
  const save = el('button', 'mounts-btn mounts-btn-primary voice-key-save', t('Save key'));
  const test = el('button', 'mounts-btn voice-key-test', t('Test connection'));
  test.disabled = !p.configured;
  const keyLine = el('div', 'plugin-cfg-row voice-key-line');
  keyLine.append(key, save, test);
  const verdict = el('div', 'plugin-detail voice-verdict');
  keyRow.ctl.append(keyLine, verdict);
  const setFold = (open) => {
    keyRow.row.hidden = !open;
    fold.setAttribute('aria-expanded', String(open));
    fold.textContent = `${t('or paste a key')} ${open ? '▾' : '▸'}`;
  };
  fold.onclick = () => { setFold(keyRow.row.hidden); if (!keyRow.row.hidden) key.focus(); };
  setFold(false);
  save.onclick = async () => {
    const v = key.value.trim();
    if (!KEY_RE.test(v)) { verdict.className = 'plugin-detail plugin-cfg-warn voice-verdict'; verdict.textContent = t('A Dropline key starts with dl_'); return; }
    save.disabled = true;
    try { await integ('', { method: 'PUT', body: JSON.stringify({ values: { apiKey: v } }) }); key.value = ''; showToast(t('Saved')); rerender(); } catch (e) { showToast(e.message, { type: 'error' }); } finally { save.disabled = false; }
  };
  test.onclick = async () => {
    test.disabled = true; verdict.className = 'plugin-detail voice-verdict'; verdict.textContent = t('Testing…');
    try {
      const r = await integ('/test', { method: 'POST' });
      verdict.className = 'plugin-detail voice-verdict ' + (r.ok ? 'voice-ok' : 'plugin-cfg-warn');
      verdict.textContent = r.ok ? t('Connected: {account}', { account: r.detail || '' }) : (r.error || t('Failed'));
    } catch (e) { verdict.className = 'plugin-detail plugin-cfg-warn voice-verdict'; verdict.textContent = e.message; } finally { test.disabled = false; }
  };
  const langRow = gridRow(grid, 'voice-lang', t('Language'), `voice-lang-${seq}`);
  const sel = el('select', 'plugin-cfg-input voice-lang-select');
  sel.id = `voice-lang-${seq}`;
  for (const [v, l] of [['auto', t('Any language (auto)')], ['zh', t('Chinese')], ['en', t('English')]]) { const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o); }
  sel.value = p.language || 'auto';
  sel.onchange = () => api('config', { body: JSON.stringify({ language: sel.value }) }).catch((e) => showToast(e.message, { type: 'error' }));
  langRow.ctl.appendChild(sel);
  box.appendChild(grid);
  cfgBox.appendChild(box);
  // P1 (lane voice-p1-oauth-teach): the OAuth account row in the 账号 cell; the teach section once connected
  fetchJson('/api/voice/status').then((st) => {
    if (!st || st.error) return;
    const a = st.account || {};
    renderAccountRow(acct, st, rerender);
    if (a.tier === 'key') acct.appendChild(el('div', 'plugin-detail voice-account-words voice-ok', t('Key saved')));
    const oauthOn = a.tier === 'oauth' && a.state === 'connected';
    chip.classList.toggle('voice-ok', oauthOn || a.tier === 'key');
    chip.textContent = oauthOn ? t('Connected: {account}', { account: `${a.name || ''}${a.team ? ' · ' + a.team : ''}` }) : a.tier === 'key' ? t('Key saved') : t('Not connected');
    if (a.tier === 'oauth') { key.placeholder = 'dl_…'; test.disabled = true; } // connected by OAuth: no key is saved
    if (!oauthOn) { // the alternative to Connect, folded — open when the key IS the account or Connect cannot work here
      (acct.querySelector('.voice-account') || acct).appendChild(fold);
      if (a.tier === 'key' || !st.connectVia) setFold(true);
    }
    if (st.connected) renderTeachSection(box, rerender);
  }).catch(() => { });
}

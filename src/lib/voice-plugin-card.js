// The Voice input · Dropline plugin card (design q-029 §1, P0 = the key tier): the key field (secret, `dl_` check),
// Test (= the `dropline` registry row's credential-exchange: ONE GET /v1/me → "Connected: <name> · <team>"), the
// on-switch (refused by the server until a key is saved) and the language preference (auto | zh | en). The key goes
// to the integration store (PUT /api/integrations/dropline) — never into the plugin record.
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { renderAccountRow, renderTeachSection } from './voice-teach-ui.js'; // P1: Connect with Fish Audio + teach

const KEY_RE = /^dl_[A-Za-z0-9_-]{8,}$/;
const integ = (tail = '', opts = {}) => fetchJson(`/api/integrations/dropline${tail}`, { headers: { 'Content-Type': 'application/json' }, ...opts })
  .then((x) => { if (!x) throw new Error(t('Server unreachable — nothing was changed')); if (x.error) throw new Error(x.error.message || x.error); return x; });

export function renderDictationCard({ p, actions, cfgBox, api, rerender }) {
  const box = document.createElement('div');
  box.className = 'plugin-cfg voice-cfg';
  const keyRow = document.createElement('div');
  keyRow.className = 'plugin-cfg-row';
  const key = document.createElement('input');
  key.type = 'password'; key.className = 'plugin-cfg-input voice-key'; key.autocomplete = 'off'; key.spellcheck = false;
  key.placeholder = p.configured ? t('Saved — paste a new key to replace it') : 'dl_…';
  const save = document.createElement('button');
  save.className = 'mounts-btn mounts-btn-primary voice-key-save'; save.textContent = t('Save key');
  const test = document.createElement('button');
  test.className = 'mounts-btn voice-key-test'; test.textContent = t('Test connection'); test.disabled = !p.configured;
  const verdict = document.createElement('div');
  verdict.className = 'plugin-detail voice-verdict';
  keyRow.append(key, save, test);
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
  const lbl = document.createElement('label');
  lbl.className = 'plugin-boot';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.className = 'voice-toggle'; cb.checked = !!p.enabled; cb.disabled = !p.configured;
  cb.onchange = () => api('enabled', { body: JSON.stringify({ enabled: cb.checked }) }).then(() => rerender())
    .catch((e) => { cb.checked = !!p.enabled; showToast(e.message, { type: 'error' }); });
  lbl.append(cb, document.createTextNode(' ' + t('Use voice input in the chat box')));
  const langRow = document.createElement('label');
  langRow.className = 'plugin-cfg-row voice-lang';
  const sel = document.createElement('select');
  sel.className = 'plugin-cfg-input';
  for (const [v, l] of [['auto', t('Any language (auto)')], ['zh', t('Chinese')], ['en', t('English')]]) { const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o); }
  sel.value = p.language || 'auto';
  sel.onchange = () => api('config', { body: JSON.stringify({ language: sel.value }) }).catch((e) => showToast(e.message, { type: 'error' }));
  langRow.append(document.createTextNode(t('Language') + ' '), sel);
  const acct = document.createElement('div');
  acct.className = 'voice-account-box';
  box.append(acct, keyRow, verdict, langRow);
  actions.appendChild(lbl);
  cfgBox.appendChild(box);
  // P1 (lane voice-p1-oauth-teach): the OAuth account row above the key; the teach section once connected
  fetchJson('/api/voice/status').then((st) => {
    if (!st || st.error) return;
    renderAccountRow(acct, st, rerender);
    if (st.account && st.account.tier === 'oauth') { key.placeholder = 'dl_…'; test.disabled = true; } // connected by OAuth: no key is saved
    if (st.connected) renderTeachSection(box, rerender);
  }).catch(() => { });
}

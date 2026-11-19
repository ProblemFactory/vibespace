// THE THIRD-PARTY PROVIDERS IN A ROSTER (lane lg-providers, B-d578 U5 — design q-045 §3 «花名册行»): under a harness's
// account roster in Manage agents, one row per provider that serves this harness — its name, ••••<last four>, its model,
// the line «no usage reading · paid by use · tested …», and ⋯: Test · Models… · Rename · New key · Remove. The doors are
// /api/providers (src/routes/providers.js); this file draws and asks, it decides nothing.
import { t } from './i18n.js';
import { agoText, createModalShell, escHtml, fetchJson, showConfirmDialog, showContextMenu, showInputDialog, showToast } from './utils.js';
import { VERDICT_WORDS, refusalWords } from '../provider-test-model.js';
import { KEY_ERRORS, conversationsOn } from '../model-providers.js';
import { openAccountModelsDialog } from './account-models.js';
import { nameHelpers } from './browser-who-dialog.js';   // the name a conversation wears in the sidebar (the remove confirm names it so)

/** the page's live conversations with the names the SIDEBAR shows them by → [{ accountId, name }] (the remove confirms read it) */
export function namedLiveRows(app) {
  const sb = (app && app.sidebar) || {};
  let names = null;
  try { names = nameHelpers(app); } catch { names = null; }
  return (Array.isArray(sb._webuiSessions) ? sb._webuiSessions : []).map((s) => ({ accountId: s && s.accountId, name: (names && (() => { try { return names.nameOfLive(s); } catch { return ''; } })()) || (s && s.name) || '' }));
}
/** the sentence both remove doors add — the roster's Remove… and the Vault window's (one wording) — or '' when none runs on it */
export function runningOnWords(rows, providerId) {
  const on = conversationsOn(rows, providerId);
  return on.n ? ' ' + t('Running on it now: {names}', { names: on.names.join(', ') + (on.more ? ' ' + t('and {n} more', { n: on.more }) : '') }) : '';
}
/** THE REMOVE CONFIRM — ONE for both doors: the roster's Remove… (`p` = the provider's row, { id, label }) and the Vault window's
 *  Remove of «Model provider key · <name>» (`p` = its row, { entry: 'provider:<id>', label }: the provider is named by the part
 *  after the kind, never «Model provider key · …» as a name); `rows` = namedLiveRows(app) → { title, message, confirm } */
/** the Test's toast words (exported: the Test door's leg drives it): the verdict's words, or the refusal's with the file filled
 *  (refusalWords — the wizard's row says the same) */
export const testToastWords = (x) => (x && x.ok ? t(VERDICT_WORDS[x.verdict] || x.verdict) : refusalWords(x, t, 'failed'));
export function providerRemoveWords(p, rows) {
  const vaultRow = !!p && typeof p.entry === 'string' && p.entry.startsWith('provider:');
  const id = vaultRow ? p.entry.slice('provider:'.length) : String((p && p.id) || '');
  const raw = String((p && p.label) || '');
  const name = vaultRow && raw.includes(' · ') ? raw.slice(raw.indexOf(' · ') + 3) : raw;
  return {
    title: t('Remove the model provider "{name}"?', { name: name || id }),
    message: t('Its key leaves the vault and the provider leaves every agent\'s account list. Conversations already running on it keep working until they restart.') + runningOnWords(rows, id),
    confirm: t('Remove'),
  };
}

// the roster's own ⋯ (manage-agents ROSTER_ICONS.DOTS, the same marks — not imported: manage-agents imports this file)
const DOTS = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="3" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/><circle cx="13" cy="8" r="1.3" fill="currentColor" stroke="none"/></svg>';
const PLUG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4"/></svg>';
const send = (url, method, body) => fetchJson(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const words = (r) => (r && Array.isArray(r.errors) && r.errors.length ? r.errors.map((e) => t(KEY_ERRORS[e.code] || e.code)).join(' · ') : t((r && r.error) || 'Something went wrong'));

/** the row's small line: no reading, paid by use, the last test */
function rowLine(p, backend) {
  const tr = p.tested && p.tested[backend];
  const tested = tr ? (tr.verdict === 'ok' ? t('tested {ago}', { ago: agoText(tr.at) }) : t('last test: {words}', { words: t(VERDICT_WORDS[tr.verdict] || tr.verdict) })) : t('not tested yet');
  return [t('No usage reading'), t('paid by use'), tested].join(' · ');
}

/** a new key, typed once into a password field (never shown again) */
function askKey(id, name) {
  return new Promise((resolve) => {
    let settled = false, holder = null;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const keyEl = () => (holder ? holder.querySelector('.pw-key-input') : null);
    // the unsaved rule (test-dialog-unsaved-census): a typed key is kept by Save, cleared from the page by Discard
    const { body, close, raised } = createModalShell({ id: 'provider-new-key', key: id, title: t('New key for {name}', { name }), minWidth: 'min(460px, 92vw)', kind: 'form', onClose: () => finish(null),
      unsaved: { isDirty: () => !!(keyEl() && keyEl().value.trim()), save: () => { finish(keyEl().value); return true; }, discard: () => { if (keyEl()) keyEl().value = ''; } } });
    if (raised) { finish(null); return; }
    holder = body;
    body.innerHTML = `<label class="pw-field"><span>${escHtml(t('Key'))}</span><input class="pw-key-input" type="password" autocomplete="off" spellcheck="false"></label>
      <div class="pw-actions"><button type="button" class="agent-btn primary pw-save">${escHtml(t('Save'))}</button></div>`;
    body.querySelector('.pw-save').onclick = () => { finish(keyEl().value); close(); };
  });
}

export async function renderProviderRows(body, backend, { refresh = () => { }, sessions = () => [] } = {}) {   // sessions: the page's live rows (the remove confirm names those on a provider)
  // the section's PLACE is taken now, right under its roster (the read below is async — appended later it would land under
  // whatever the card drew meanwhile: another harness's heading, adversarial read r1); it stays empty and hidden until filled
  const sec = document.createElement('div');
  sec.className = 'ob-backend acct-section acct-providers';
  sec.dataset.backend = backend;
  sec.hidden = true;
  body.appendChild(sec);
  const r = await fetchJson('/api/providers/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });   // a person's read (U1 cure (B))
  const rows = (r && Array.isArray(r.providers) ? r.providers : []).filter((p) => p.fits && p.fits[backend] && p.fits[backend].ok);
  if (!rows.length || !sec.isConnected) { sec.remove(); return; }   // no provider serves this harness: no section (the add door is the roster's own)
  const head = document.createElement('div'); head.className = 'acct-providers-head';
  head.innerHTML = `<b>${escHtml(t('Third-party models'))}</b>`;
  sec.append(head);
  sec.hidden = false;
  for (const p of rows) {
    const el = document.createElement('div'); el.className = 'acct-key-row acct-provider-row'; el.dataset.provider = p.id;
    el.innerHTML = `<span class="acct-provider-icon">${PLUG}</span><span class="acct-name">${escHtml(t('{name} (third party)', { name: p.label }))}</span>
      ${p.tail ? `<span class="acct-tail">••••${escHtml(p.tail)}</span>` : ''}${p.defaultModel ? `<span class="acct-model-chip">${escHtml(p.defaultModel)}</span>` : ''}
      <span class="acct-provider-line">${escHtml(rowLine(p, backend))}</span><button type="button" class="agent-btn acct-provider-more" aria-label="${escHtml(t('More'))}">${DOTS}</button>`;
    el.querySelector('.acct-provider-more').onclick = (e) => {
      const b = e.currentTarget.getBoundingClientRect();
      showContextMenu(b.left, b.bottom + 4, [
        { label: t('Test'), action: async () => { if (el.dataset.testing) return; el.dataset.testing = '1'; showToast(t('Testing…')); const x = await send(`/api/providers/${encodeURIComponent(p.id)}/test`, 'POST', { harness: backend }); showToast(testToastWords(x), { type: x && x.ok && x.verdict === 'ok' ? 'info' : 'error' }); delete el.dataset.testing; refresh(); } },
        { label: t('Models…'), action: () => openAccountModelsDialog({ accountId: p.id, name: p.label }) },
        { label: t('Rename…'), action: async () => { const n = await showInputDialog({ title: t('Rename'), label: t('Name'), value: p.label }); if (n == null) return; const x = await send(`/api/providers/${encodeURIComponent(p.id)}`, 'PATCH', { label: n }); if (!x || !x.ok) showToast(words(x), { type: 'error' }); refresh(); } },
        { label: t('New key…'), action: async () => { const k = await askKey(p.id, p.label); if (!k) return; const x = await send(`/api/providers/${encodeURIComponent(p.id)}/key`, 'POST', { key: k }); showToast(x && x.ok ? t('The new key is kept in the vault') : words(x), { type: x && x.ok ? 'info' : 'error' }); refresh(); } },
        { separator: true },
        { label: t('Remove…'), action: async () => {
          // the conversations it would leave without a provider at their next start — named as the sidebar names them (one wording with the Vault window's Remove)
          const w = providerRemoveWords(p, (() => { try { return sessions(); } catch { return []; } })());
          const yes = await showConfirmDialog({ title: w.title, message: w.message, confirmText: w.confirm, danger: true });
          if (!yes) return;
          const x = await send(`/api/providers/${encodeURIComponent(p.id)}`, 'DELETE');
          if (!x || !x.ok) showToast(words(x), { type: 'error' });
          refresh();
        } },
      ]);
    };
    sec.append(el);
  }
}

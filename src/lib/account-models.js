// THE ACCOUNT DIALOG'S MODEL SECTION (design q-053 r1 §3, lane provider-record) — ⋯ → 模型… on every account row of
// Manage agents (and, once Train 2's wizard projects one, a third-party row). It NAMES the account's provider (its kind)
// and where the rows come from: a listed provider's rows are shown as they are (the harness or the provider owns them), a
// configured one's are entered here — id · label · context · caps — checked by the PURE rules (src/model-providers.js)
// before the save and again by the route (src/routes/account-models.js), each refusal written under its own field.
// 「测试」 on a row runs the roster's own Test with THAT row's id (the test verb is q-045 ④'s; this dialog hands it the id).
// Nothing is greyed: a control that cannot act is not drawn; a press that cannot act says why.
import { t } from './i18n.js';
import { createModalShell, escHtml, fetchJson, showToast } from './utils.js';
import { getBackendMeta } from './agent-meta.js';
import { CAPS, CAP_WORDS, MODEL_ERRORS, REFRESH_WORDS, kindOf, refreshable, sourceOf, validateModelRow, validateModels, formatContext } from '../model-providers.js'; // PURE: the record's rules (test-model-providers)

const EXAMPLE_ID = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-5.5', google: 'gemini-3-pro-preview', openrouter: 'deepseek/deepseek-chat', any: 'llama3.1:8b' };
const errText = (e, k) => (e.code === 'id-pattern' && k ? `${t(MODEL_ERRORS[e.code])} — ${t(k.idHint)}` : t(MODEL_ERRORS[e.code] || e.code));

/** Open the dialog for one account (a roster id, or a projected `pv-…` row). `onTest(modelId)` = the roster's Test with
 *  that model; without it no 「测试」 is drawn. `onClose()` = after it closes (the New Session menu redraws — lane
 *  models-at-session). A provider that lists its own models (OpenRouter, an OpenAI-compatible /models) has its refresh door
 *  here: a person's press, the vault open, once a minute; the list it answered is kept, with when. */
export async function openAccountModelsDialog({ accountId, name = '', onTest = null, onClose = null } = {}) {
  // lane dialog-unsaved-guard: a model typed / removed / a capability ticked and not saved ⇒ ✕ / Esc / the backdrop asks
  const guard = { dirty: () => false, save: async () => true };
  const { body, close, raised } = createModalShell({ id: 'account-models-dialog', key: accountId, title: t('Models — {name}', { name }), minWidth: 'min(660px, 94vw)', escapeToClose: true, onClose,
    unsaved: { isDirty: () => guard.dirty(), save: () => guard.save() }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  body.classList.add('am-body');
  body.textContent = t('Loading…');
  const r = await fetchJson(`/api/accounts/${encodeURIComponent(accountId)}/models`);
  if (!body.isConnected) return null;
  if (!r || r.error || !r.provider) {
    body.textContent = r && r.provider === null ? t('This account’s harness has no model provider') : t('Could not read the models — {reason}', { reason: (r && r.error) || t('server unreachable') });
    return null;
  }
  let seq = 0;
  const st = { provider: r.provider, editable: !!r.editable, rows: [], errors: [], aliases: { ...(r.provider.aliases || {}) } };
  const fromProvider = (p) => {
    st.provider = p;
    st.aliases = { ...(p.aliases || {}) };
    st.rows = (p.models || []).map((m) => ({ key: ++seq, id: m.id, label: m.label === m.id ? '' : m.label, context: formatContext(m.context), caps: [...(m.caps || [])] }));
    st.errors = [];
  };
  fromProvider(r.provider);
  const k = () => kindOf(st.provider.kind);
  const harnessName = (id) => (id ? getBackendMeta(id).label || id : '');
  const rowOut = (row) => ({ id: row.id.trim(), label: row.label.trim(), context: row.context.trim(), caps: row.caps.slice() });
  const drawn = () => JSON.stringify({ models: st.rows.map(rowOut), aliases: st.aliases });
  let base = drawn();
  guard.dirty = () => st.editable && drawn() !== base;

  const capsHtml = (row, edit) => CAPS.map((c) => (edit
    ? `<button type="button" class="am-cap" data-cap="${c}" aria-pressed="${row.caps.includes(c)}">${escHtml(t(CAP_WORDS[c]))}</button>`
    : (row.caps.includes(c) ? `<span class="am-cap" aria-pressed="true">${escHtml(t(CAP_WORDS[c]))}</span>` : ''))).join('');
  const testHtml = (row) => (onTest ? `<button type="button" class="agent-btn am-test" data-key="${row.key}" title="${escHtml(t('Test this account with this model (one terminal session)'))}">${escHtml(t('Test'))}</button>` : '');
  const listedRow = (row) => `
    <div class="am-row" data-key="${row.key}" role="row">
      <code class="am-id" role="cell">${escHtml(row.id)}</code>
      <span class="am-label" role="cell">${escHtml(row.label || row.id)}</span>
      <span class="am-ctx" role="cell">${escHtml(row.context || '—')}</span>
      <span class="am-caps" role="cell">${capsHtml(row, false)}</span>
      <span class="am-acts" role="cell">${testHtml(row)}</span>
    </div>`;
  const editRow = (row) => `
    <div class="am-row am-edit" data-key="${row.key}" role="row">
      <input class="am-id" data-f="id" value="${escHtml(row.id)}" placeholder="${escHtml(EXAMPLE_ID[k().family] || '')}" aria-label="${escHtml(t('Model id'))}" spellcheck="false" autocomplete="off">
      <input class="am-label" data-f="label" value="${escHtml(row.label)}" placeholder="${escHtml(t('Same as the id'))}" aria-label="${escHtml(t('Display name'))}" autocomplete="off">
      <input class="am-ctx" data-f="context" value="${escHtml(row.context)}" placeholder="200k" aria-label="${escHtml(t('Context window'))}" autocomplete="off">
      <span class="am-caps" role="group" aria-label="${escHtml(t('Capabilities'))}">${capsHtml(row, true)}</span>
      <span class="am-acts">${testHtml(row)}<button type="button" class="agent-btn am-del" data-key="${row.key}" title="${escHtml(t('Remove this model'))}" aria-label="${escHtml(t('Remove this model'))}">✕</button></span>
      <div class="am-err" role="alert"></div>
    </div>`;
  const draw = () => {
    const p = st.provider;
    const src = sourceOf(p);
    const words = t(src.key, { ...src.params, harness: harnessName(src.params.harness) });
    const note = st.editable
      ? t('Enter the models this account may use, with the id the provider expects. New sessions on this account offer exactly these.')
      : p.modelsSource === 'listed' ? t('The provider lists these — new sessions on this account offer them. They are not entered here.') : '';
    const aliasNames = Object.keys(st.aliases);
    body.innerHTML = `
      <div class="am-prov"><span class="am-kind" title="${escHtml(t('Model provider'))}">${escHtml(t(p.label))}${p.label !== k()?.label ? ` <span class="am-kind-of">${escHtml(t(k()?.label || p.kind))}</span>` : ''}</span><span class="am-source" data-source="${escHtml(p.modelsSource)}">${escHtml(words)}</span>${refreshable(p) ? `<span class="am-fetched">${escHtml(p.fetchedAt ? t('Fetched {time}', { time: new Date(p.fetchedAt).toLocaleString() }) : t('Not fetched yet'))}</span><button type="button" class="agent-btn am-refresh" title="${escHtml(t('Ask the provider for its model list now (at most once a minute)'))}">${escHtml(t('Refresh the list'))}</button>` : ''}</div>
      ${note ? `<div class="usage-note am-note">${escHtml(note)}</div>` : ''}
      ${st.rows.length ? `<div class="am-table${st.editable ? ' am-editable' : ''}" role="table" aria-label="${escHtml(t('Models'))}">
        <div class="am-head" role="row"><span role="columnheader">${escHtml(t('Model id'))}</span><span role="columnheader">${escHtml(t('Display name'))}</span><span role="columnheader">${escHtml(t('Context window'))}</span><span role="columnheader">${escHtml(t('Capabilities'))}</span><span></span></div>
        ${st.rows.map((row) => (st.editable ? editRow(row) : listedRow(row))).join('')}
      </div>` : `<div class="empty-hint am-empty">${escHtml(t('No models configured for this provider'))}${st.editable ? ' — ' + escHtml(t('add the ones this account may use')) : ''}</div>`}
      ${st.editable && aliasNames.length ? `<div class="am-aliases"><span class="am-aliases-h">${escHtml(t('Aliases'))}</span>${aliasNames.map((a) => `<span class="am-alias" data-alias="${escHtml(a)}">${escHtml(a)} → ${escHtml(st.aliases[a])}<button type="button" class="am-alias-del" data-alias="${escHtml(a)}" aria-label="${escHtml(t('Remove alias {name}', { name: a }))}" title="${escHtml(t('Remove alias {name}', { name: a }))}">✕</button></span>`).join('')}</div>` : ''}
      <div class="am-form-err" role="alert"></div>
      ${st.editable ? `<div class="dialog-buttons"><button type="button" class="agent-btn am-add">+ ${escHtml(t('Add a model'))}</button><button type="button" class="btn-create am-save">${escHtml(t('Save'))}</button></div>` : ''}`;
    showErrors();
  };
  // each refusal under its own row and field (the route's answer and the dialog's own check speak alike)
  const showErrors = () => {
    for (const el of body.querySelectorAll('.am-row .am-err')) el.textContent = '';
    for (const el of body.querySelectorAll('.am-row [data-f]')) el.removeAttribute('aria-invalid');
    const general = [];
    for (const e of st.errors) {
      const row = Number.isInteger(e.index) ? st.rows[e.index] : null;
      const el = row && body.querySelector(`.am-row[data-key="${row.key}"]`);
      if (!el) { general.push(e.alias ? `${e.alias}: ${errText(e, k())}` : errText(e, k())); continue; }
      el.querySelector(`[data-f="${e.field}"]`)?.setAttribute('aria-invalid', 'true');
      const box = el.querySelector('.am-err');
      box.textContent = [box.textContent, errText(e, k())].filter(Boolean).join(' · ');
    }
    const fe = body.querySelector('.am-form-err');
    if (fe) fe.textContent = general.join(' · ');
  };
  const rowOf = (el) => st.rows.find((x) => String(x.key) === el.closest('.am-row')?.dataset.key);
  body.addEventListener('input', (e) => {
    const f = e.target.dataset?.f;
    const row = f && rowOf(e.target);
    if (!row) return;
    row[f] = e.target.value;
    const i = st.rows.indexOf(row);
    st.errors = st.errors.filter((x) => !(x.index === i && x.field === f));
    showErrors();
  });
  body.addEventListener('click', async (e) => {
    const cap = e.target.closest('button.am-cap');
    if (cap) { const row = rowOf(cap); const c = cap.dataset.cap; row.caps = row.caps.includes(c) ? row.caps.filter((x) => x !== c) : CAPS.filter((x) => x === c || row.caps.includes(x)); cap.setAttribute('aria-pressed', String(row.caps.includes(c))); return; }
    const del = e.target.closest('.am-del');
    if (del) { st.rows = st.rows.filter((x) => String(x.key) !== del.dataset.key); st.errors = []; draw(); return; }
    const aliasDel = e.target.closest('.am-alias-del');
    if (aliasDel) { delete st.aliases[aliasDel.dataset.alias]; st.errors = st.errors.filter((x) => x.alias !== aliasDel.dataset.alias); draw(); return; }
    if (e.target.closest('.am-add')) {
      st.rows.push({ key: ++seq, id: '', label: '', context: '', caps: [] });
      draw();
      body.querySelector(`.am-row[data-key="${seq}"] .am-id`)?.focus();
      return;
    }
    const refresh = e.target.closest('.am-refresh');
    if (refresh) {
      if (refresh.dataset.busy) return;
      refresh.dataset.busy = '1';
      const ans = await fetchJson(`/api/providers/${encodeURIComponent(st.provider.id)}/models/refresh`, { method: 'POST' });
      delete refresh.dataset.busy;
      if (!body.isConnected) return;
      if (ans && ans.ok && ans.provider) { fromProvider(ans.provider); base = drawn(); draw(); showToast(t('The provider listed {n} model(s)', { n: ans.listed })); return; }
      showToast(ans && REFRESH_WORDS[ans.code] ? t(REFRESH_WORDS[ans.code], { s: Math.ceil((ans.retryAfterMs || 0) / 1000), status: ans.status || '' }) : t('Could not read the models — {reason}', { reason: (ans && ans.error) || t('server unreachable') }), { type: 'error' });
      return;
    }
    const test = e.target.closest('.am-test');
    if (test) {
      const row = st.rows.find((x) => String(x.key) === test.dataset.key);
      if (!row) return;
      if (st.editable) {
        // the id as typed is the id tested — one the provider would refuse is said here, not sent
        const errs = validateModelRow(st.provider.kind, rowOut(row)).filter((x) => x.field === 'id');
        if (errs.length) { const i = st.rows.indexOf(row); st.errors = [...st.errors.filter((x) => !(x.index === i && x.field === 'id')), ...errs.map((x) => ({ index: i, ...x }))]; showErrors(); return; }
      }
      close();
      onTest(row.id.trim());
      return;
    }
    if (e.target.closest('.am-save')) await guard.save();
  });
  // Save (the button, and the unsaved sheet's) → true when it landed, else the refusal's words (shown under the rows too)
  guard.save = async () => {
    const input = { models: st.rows.map(rowOut), aliases: st.aliases, defaultModel: st.rows.some((x) => x.id.trim() === st.provider.defaultModel) ? st.provider.defaultModel : '' };
    const v = validateModels(st.provider.kind, input);
    if (!v.ok) { st.errors = v.errors; showErrors(); return v.errors.map((x) => errText(x, k())).join(' · ') || false; }
    const ans = await fetchJson(`/api/accounts/${encodeURIComponent(accountId)}/models`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!body.isConnected) return true;
    if (ans && ans.ok && ans.provider) { fromProvider(ans.provider); base = drawn(); draw(); showToast(t('Saved')); return true; }
    st.errors = ans && Array.isArray(ans.errors) && ans.errors.length ? ans.errors : [{ code: (ans && ans.error) || t('server unreachable') }];
    showErrors();
    return st.errors.map((x) => errText(x, k())).join(' · ') || false;
  };
  draw();
  return { close };
}

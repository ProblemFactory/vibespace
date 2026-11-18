// THE THIRD-PARTY PROVIDER WIZARD (lane lg-providers, B-d578 U5 — design q-045 §3, the owner's «傻瓜化»: nobody faces a pile
// of environment variables). FOUR SCREENS, no technical word on the first: ① pick a provider (cards: a name and one
// sentence — and, for the agent the person came from, «not for <agent>» on a card that cannot serve it) → ② paste its key
// (+ the region where the vendor has two; a self-hosted one: its address, the interface it speaks, a model) → «Save and
// test»: the key is sealed in the vault, then each agent that can use it says «ok» to it once (the provider Test, U4) —
// once a model exists (OpenRouter lists its models first) → ③ the model new conversations use → ④ which agents can use it.
// The technical details are FOLDED under ②–④. The doors are /api/providers (src/routes/providers.js); nothing here
// decides — the PURE record does.
import { t } from './i18n.js';
import { createModalShell, escHtml, fetchJson } from './utils.js';
import { enterSubmits } from './chat-enter-keys.js';   // an Enter that is not an IME's commit (test-enter-census)
import { REGION_WORDS, KEY_ERRORS, MODEL_ERRORS, FIT_WORDS, WIRES, fits } from '../model-providers.js';
import { VERDICT_WORDS, REFUSAL_WORDS } from '../provider-test-model.js';
import { BACKEND_META, getBackendMeta } from './agent-meta.js';

const harnessName = (h) => getBackendMeta(h)?.label || h;
const WIRE_WORDS = Object.freeze({ 'anthropic-messages': 'Anthropic Messages (/v1/messages)', 'openai-responses': 'OpenAI Responses (/v1/responses)', 'openai-chat': 'OpenAI Chat Completions (/v1/chat/completions)' });
// a self-hosted one's first guess: the interface the opening agent can use (read off `fits`, never a table of agents here)
const wireFor = (h) => WIRES.find((w) => (fits({ kind: 'self-hosted', wire: w })[h] || {}).ok) || WIRES[0];
const post = (url, body, method = 'POST') => fetchJson(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
/** a refusal's words: by field (the record's codes, the model rows' codes), else the door's sentence — each a dictionary key */
const codeWords = (c) => t(KEY_ERRORS[c] || MODEL_ERRORS[c] || REFUSAL_WORDS[c] || c);
const errorWords = (r) => (r && Array.isArray(r.errors) && r.errors.length ? r.errors.map((e) => codeWords(e.code)).join(' · ') : (r && r.code && (REFUSAL_WORDS[r.code] || KEY_ERRORS[r.code]) ? codeWords(r.code) : t((r && r.error) || 'Something went wrong')));
const fitLine = (fit, h) => (fit && fit.ok ? '' : t(FIT_WORDS[fit && fit.code] || FIT_WORDS.wire, { harness: harnessName(h) }));

export async function openProviderWizard({ backend, onDone = null } = {}) {   // backend: the roster it was opened from (always named by the caller)
  const { body, close, raised, ready, live } = createModalShell({ id: 'provider-wizard', key: backend, title: t('Add a third-party model'), minWidth: 'min(620px, 94vw)', kind: 'form' });
  if (raised) return;
  if (!(await ready)) return;
  const list = await fetchJson('/api/providers');
  if (!live()) return;
  if (!list || list.error || !Array.isArray(list.shipped)) { body.textContent = t('Could not read the providers — {reason}', { reason: (list && list.error) || t('server unreachable') }); return; }
  const fitsHere = (s) => !!(s.fits && s.fits[backend] && s.fits[backend].ok);
  const cards = [...list.shipped].sort((a, b) => Number(fitsHere(b)) - Number(fitsHere(a)));   // the ones the opening agent can use first
  const st = { step: 'pick', preset: null, region: 'global', provider: null, tests: {}, testedModel: null, busy: false, error: '', draft: {} };
  const done = () => { try { onDone && onDone(); } catch { } };
  const fold = (rows) => `<details class="pw-tech"><summary>${escHtml(t('Technical details'))}</summary>${rows.map((r) => `<div class="pw-tech-row">${r}</div>`).join('')}</details>`;
  const techRows = () => {
    const p = st.provider, s = st.preset;
    const base = p ? p.baseUrl : (s && s.bases[0] && s.bases[0].url) || '';
    return [
      `${escHtml(t('Address'))}: <code>${escHtml(base || '—')}</code>`,
      `${escHtml(t('How the key reaches the program'))}: ${Object.entries((p && p.keyVars) || {}).map(([h, v]) => `${escHtml(harnessName(h))} <code>${escHtml(v)}</code>`).join(' · ')}${p && p.keyVars && Object.keys(p.keyVars).length ? ' — ' : ''}${escHtml(t('an environment variable of that conversation only, never its command line'))}`,   // the variable each agent reads (the server asks each descriptor's own plan)
      escHtml(t('Codex sends this provider its installation id and session id with each request')),
      escHtml(t('This provider’s model runs the agent’s tools in its conversations — pick one you trust')),
    ];
  };
  const focusFirst = () => { const f = body.querySelector('input:not([type="radio"]), select, .pw-card, button.primary'); if (f) try { f.focus(); } catch { } };
  /** each agent that can use it says «ok» once — only while the form is open, one at a time */
  const runTests = async () => {
    const p = st.provider;
    st.tests = {};
    st.testedModel = p.defaultModel || null;
    for (const h of Object.keys(p.fits || {})) {
      if (!p.fits[h].ok || !BACKEND_META[h]) continue;
      if (!live()) return;
      st.tests[h] = { busy: true };
      draw();
      const x = await post(`/api/providers/${encodeURIComponent(p.id)}/test`, { harness: h });
      if (!live()) return;
      st.tests[h] = x && x.ok ? { verdict: x.verdict, words: t(VERDICT_WORDS[x.verdict] || x.verdict), detail: x.detail || '' } : { verdict: 'refused', words: errorWords(x), detail: '' };
      draw();
    }
  };
  const hasModel = (p) => !!(p && (p.defaultModel || (Array.isArray(p.models) && p.models.length)));
  const draw = () => {
    if (!live()) return;
    if (st.step === 'pick') {
      body.innerHTML = `<p class="pw-lead">${escHtml(t('Pick who serves the model — you pay them by use, with your own key'))}</p>
        <div class="pw-cards">${cards.map((s) => `<button type="button" class="pw-card${fitsHere(s) ? '' : ' pw-card-off'}" data-preset="${escHtml(s.id)}"><b>${escHtml(t(s.label))}</b><span>${escHtml(t(s.blurb))}</span>${fitsHere(s) ? '' : `<em>${escHtml(t('Not for {harness}', { harness: harnessName(backend) }))}</em>`}</button>`).join('')}</div>`;
      body.querySelectorAll('.pw-card').forEach((b) => { b.onclick = () => { st.preset = list.shipped.find((x) => x.id === b.dataset.preset); st.region = 'global'; st.step = 'key'; st.error = ''; st.draft = {}; draw(); }; });
      focusFirst();
      return;
    }
    if (st.step === 'key') {
      const s = st.preset, d = st.draft;
      const regions = s.bases.length > 1 ? `<div class="pw-field"><span>${escHtml(t('Where your account is'))}</span>${s.bases.map((b) => `<label class="pw-radio"><input type="radio" name="pw-region" value="${escHtml(b.region)}" ${b.region === st.region ? 'checked' : ''}> ${escHtml(t(REGION_WORDS[b.region] || b.region))}</label>`).join('')}</div>` : '';
      const wire0 = d.wire || wireFor(backend);
      const own = s.baseRequired ? `<label class="pw-field"><span>${escHtml(t('Address of your service'))}</span><input class="pw-base" type="url" placeholder="https://…/v1" autocomplete="off" value="${escHtml(d.baseUrl || '')}"></label>
        <label class="pw-field"><span>${escHtml(t('What it speaks'))}</span><select class="pw-wire">${WIRES.map((w) => `<option value="${escHtml(w)}" ${w === wire0 ? 'selected' : ''}>${escHtml(WIRE_WORDS[w])}</option>`).join('')}</select></label>
        <label class="pw-field"><span>${escHtml(t('Model id'))}</span><input class="pw-model" type="text" autocomplete="off" value="${escHtml(d.model || '')}"></label>` : '';
      body.innerHTML = `<p class="pw-lead">${escHtml(t('Paste your {provider} key', { provider: t(s.label) }))}${s.console ? ` · <a href="${escHtml(s.console)}" target="_blank" rel="noopener noreferrer">${escHtml(t('Where to get a key'))}</a>` : ''}</p>
        ${regions}${own}
        <label class="pw-field"><span>${escHtml(t('Key'))}</span><input class="pw-key" type="password" autocomplete="off" spellcheck="false"></label>
        <p class="pw-note">${escHtml(t('The key is kept in the vault. The test sends the provider one short message with it — it costs a fraction of a cent.'))}</p>
        <div class="pw-error" role="alert">${escHtml(st.error)}</div>
        <div class="pw-actions"><button type="button" class="agent-btn pw-back">${escHtml(t('Back'))}</button><button type="button" class="agent-btn primary pw-save">${escHtml(t('Save and test'))}</button></div>
        ${fold(techRows())}`;
      const keyEl = body.querySelector('.pw-key');
      if (d.key) keyEl.value = d.key;   // a refused save keeps what was typed (it is in this page's memory only, never drawn as text)
      body.querySelectorAll('input[name="pw-region"]').forEach((r) => { r.onchange = () => { st.region = r.value; }; });
      body.querySelector('.pw-back').onclick = () => { st.step = 'pick'; draw(); };
      const save = async () => {
        if (st.busy) return;
        const extra = s.baseRequired ? { baseUrl: body.querySelector('.pw-base').value.trim(), wire: body.querySelector('.pw-wire').value, model: body.querySelector('.pw-model').value.trim() } : { region: st.region };
        st.draft = { ...extra, key: keyEl.value };
        st.busy = true; body.querySelector('.pw-save').disabled = true;
        const r = await post('/api/providers', { preset: s.id, key: keyEl.value, ...extra });
        st.busy = false;
        if (!live()) return;
        if (!r || !r.ok) { st.error = errorWords(r); draw(); return; }
        st.draft = {};
        st.provider = r.provider; st.tests = {}; st.error = '';
        done();
        if (hasModel(r.provider)) { st.step = 'test'; draw(); await runTests(); }
        else { st.step = 'model'; draw(); }   // OpenRouter: its models are listed first, then each agent is tested with one
      };
      body.querySelector('.pw-save').onclick = save;
      keyEl.onkeydown = (e) => { if (enterSubmits(e)) { e.preventDefault(); save(); } };
      focusFirst();
      return;
    }
    const p = st.provider;
    const fitsHtml = () => Object.entries(p.fits || {}).filter(([h]) => !!BACKEND_META[h]).map(([h, f]) => {   // the harnesses this hub has
      const tr = st.tests[h];
      const mark = f.ok ? (tr && tr.busy ? '…' : tr && tr.verdict === 'ok' ? '✓' : tr ? '!' : '·') : '✗';
      const words = f.ok ? (tr ? (tr.busy ? t('Testing…') : tr.words) : t('not tested yet')) : fitLine(f, h);
      return `<div class="pw-fit" data-harness="${escHtml(h)}"><b>${escHtml(harnessName(h))}</b> <span class="pw-mark">${mark}</span> ${escHtml(words)}${tr && tr.detail ? `<pre class="pw-detail">${escHtml(tr.detail)}</pre>` : ''}</div>`;
    }).join('');
    const anyBusy = () => Object.values(st.tests).some((x) => x.busy);
    const refused = () => Object.values(st.tests).some((x) => x.verdict === 'key-refused');
    if (st.step === 'test') {
      body.innerHTML = `<p class="pw-lead">${escHtml(t('{provider} is saved. Each agent that can use it is tested once:', { provider: p.label }))}</p>${fitsHtml()}
        ${refused() && !anyBusy() ? `<label class="pw-field"><span>${escHtml(t('Paste the key again'))}</span><input class="pw-rekey" type="password" autocomplete="off" spellcheck="false"></label><div class="pw-error" role="alert">${escHtml(st.error)}</div>` : ''}
        <div class="pw-actions">${refused() && !anyBusy() ? `<button type="button" class="agent-btn pw-retry">${escHtml(t('Save the key and test again'))}</button>` : ''}<button type="button" class="agent-btn primary pw-next" ${anyBusy() ? 'disabled' : ''}>${escHtml(t('Next'))}</button></div>${fold(techRows())}`;
      const nx = body.querySelector('.pw-next'); if (nx) nx.onclick = () => { st.step = 'model'; st.error = ''; draw(); };
      const rt = body.querySelector('.pw-retry');
      if (rt) rt.onclick = async () => { if (st.busy) return; st.busy = true; rt.disabled = true; const x = await post(`/api/providers/${encodeURIComponent(p.id)}/key`, { key: body.querySelector('.pw-rekey').value }); st.busy = false; if (!live()) return; if (!x || !x.ok) { st.error = errorWords(x); draw(); return; } st.provider = { ...p, ...x.provider }; st.error = ''; await runTests(); };
      if (!anyBusy()) focusFirst();
      return;
    }
    if (st.step === 'model') {
      const rows = p.models || [];
      const listed = p.modelsSource === 'listed';
      body.innerHTML = `<p class="pw-lead">${escHtml(t('Which model answers in new conversations'))}</p>
        ${rows.length ? `<label class="pw-field"><span>${escHtml(t('Model'))}</span><select class="pw-pick">${rows.map((m) => `<option value="${escHtml(m.id)}" ${m.id === p.defaultModel ? 'selected' : ''}>${escHtml(m.label || m.id)}</option>`).join('')}</select></label>` : ''}
        ${listed ? `<button type="button" class="agent-btn pw-list">${escHtml(t('Get the model list from {provider}', { provider: p.label }))}</button>` : `<label class="pw-field"><span>${escHtml(t('Other model id (optional)'))}</span><input class="pw-other" type="text" autocomplete="off"></label>`}
        <div class="pw-error" role="alert">${escHtml(st.error)}</div>
        <div class="pw-actions"><button type="button" class="agent-btn primary pw-done">${escHtml(t('Done'))}</button></div>${fold(techRows())}`;
      const lb = body.querySelector('.pw-list');
      if (lb) lb.onclick = async () => { if (st.busy) return; st.busy = true; lb.disabled = true; const x = await fetchJson(`/api/providers/${encodeURIComponent(p.id)}/models/refresh`, { method: 'POST' }); st.busy = false; if (!live()) return; if (x && x.ok) { st.provider = { ...p, ...x.provider, fits: p.fits }; st.error = ''; } else st.error = errorWords(x); draw(); };
      const dn = body.querySelector('.pw-done');
      dn.onclick = async () => {
        if (st.busy) return;
        const other = body.querySelector('.pw-other') ? body.querySelector('.pw-other').value.trim() : '';
        const pick = body.querySelector('.pw-pick') ? body.querySelector('.pw-pick').value : '';
        st.busy = true; dn.disabled = true;
        let r = { ok: true }, model = p.defaultModel;
        if (other && !rows.some((m) => m.id === other)) { r = await post(`/api/accounts/${encodeURIComponent(p.id)}/models`, { models: [...rows, { id: other }], aliases: p.aliases || {}, defaultModel: other }, 'PUT'); model = other; }
        else if (pick && pick !== p.defaultModel) { r = await post(`/api/providers/${encodeURIComponent(p.id)}`, { defaultModel: pick }, 'PATCH'); model = pick; }
        st.busy = false;
        if (!live()) return;
        if (!r || (r.ok === false) || r.error) { st.error = errorWords(r); draw(); return; }
        if (r.provider) st.provider = { ...st.provider, ...r.provider, fits: p.fits };
        st.provider.defaultModel = model || st.provider.defaultModel;
        done();
        st.step = 'done';
        if (hasModel(st.provider) && st.testedModel !== (st.provider.defaultModel || null)) { draw(); await runTests(); }   // the model changed (or none was tested yet): each agent once more
        draw();
      };
      focusFirst();
      return;
    }
    body.innerHTML = `<p class="pw-lead">${escHtml(t('{provider} is ready. It can be used by:', { provider: p.label }))}</p>${fitsHtml()}
      <p class="pw-note">${escHtml(t('Pick it in the account row of New Session. It has no usage reading — you pay {provider} by use.', { provider: p.label }))}</p>
      <div class="pw-actions"><button type="button" class="agent-btn primary pw-close" ${anyBusy() ? 'disabled' : ''}>${escHtml(t('Close'))}</button></div>${fold(techRows())}`;
    body.querySelector('.pw-close').onclick = () => close();
    if (!anyBusy()) focusFirst();
  };
  draw();
}

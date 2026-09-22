// THE INTEGRATIONS WINDOW — ⚙ → Integrations (集成与密钥)
// (docs/design-communication-panel.zh.md §14.5; docs/design-agent-browser-v2.md
// §7.5 consumes the same window through `app.openIntegration(id)`).
//
// ONE CARD PER REGISTRY ROW, in the Plugins card language (`plugin-card`), and
// the order inside a card is load-bearing:
//
//   1. the SOURCE CHIP — your own / cluster default · <label> / not configured
//      (read from `source` + `clusterKey`, never guessed);
//   2. the SETUP BLOCK, ABOVE THE FIELDS — the callback URL as copyable
//      monospace text WITH a copy button, the note saying which console page
//      it goes to, and the prerequisites checklist. Above, because a user who
//      has filled two inputs and seen a green tick does not scroll back up;
//   3. who serves this row — a pair of radios (cluster default, greyed WITH
//      THE REASON when there is none / my own key), or for a delegating row a
//      dropdown of the cluster's presets plus "my own key";
//   4. the declared fields — a SET secret shows its mask (`••••1234`) and a
//      REPLACE button, never a value (Replace, never Reveal);
//   5. Test — the button's wording comes from `test.kind`, and the verdict is
//      ALWAYS drawn beside `test.caveat`: a bare green tick on a check that
//      proves less than the reader assumes is the mirror-image lie of a
//      "Test connection" that never went online;
//   6. "where this key is used", from `consumers` (or the phase it is wired in).
//
// XSS LAW: every string here is either ours or a vendor's error text; all of
// it renders through textContent. No innerHTML with dynamic content on any
// path. Failures reach the user: a failed PUT/DELETE is a toast, a failed
// Test is a line on the card with the vendor's own words.
//
// The window is a registered SINGLETON type (layout restore, cross-client
// sync, tab groups, taskbar for free); `openSpec` is `{openIntegrations,
// focus}` and a `focus` naming a row that no longer exists opens the window
// with nothing highlighted, never a throw — a removed row must not fail a
// layout restore.
import { fetchJson, showToast, showConfirmDialog, copyText } from './utils.js';
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerMenuItem } from './contributions.js';
// the shared chrome primitives (a4): one SVG helper — the copy glyph, the info affordance
import { icon } from './channel-chrome.js';
// PURE, bundled (a3 i18n): the registry DECLARES keys (label / help / notes /
// prerequisites / caveats) and `credentialWhyText` words a `whyCode`; the
// card renders every declared string through t().
import * as R from '../integration-registry.js';
// a3 i18n: a route failure is worded by its CODE, never by the store's sentence.
import { routeErrorText } from './channel-words.js';

const ICON = svgIcon16('<circle cx="5" cy="11" r="3"/><path d="M7.5 8.5L13 3M11 5l2 2M9 7l1.5 1.5"/>');
const FOCUS_MS = 2500;

const ago = (ms) => {
  const m = Math.round(Math.abs(ms) / 60000);
  return m < 1 ? t('just now') : m < 60 ? t('{n} min ago', { n: m }) : m < 1440 ? t('{n} h ago', { n: Math.round(m / 60) }) : t('{n} d ago', { n: Math.round(m / 1440) });
};

/** The Test button's words follow `testKind` (design §14.2's closed set). */
const TEST_LABEL = {
  'credential-exchange': () => t('Test connection'),
  'shape-only': () => t('Check format (no network)'),
  'reachability': () => t('Test reachability'),
};

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** A user-action call: `fetchJson` never throws, so the `{error}` body is the
 *  failure and it must reach the user (§14.11.6). Returns null on failure. */
async function call(url, init, what) {
  const r = await fetchJson(url, init);
  // the CODE is worded (a3 i18n); a refused VALUE keeps the validator's own
  // field + rule inside the sentence — that detail no dictionary could hold
  if (!r || r.error) { showToast(t('{what} — {reason}', { what, reason: r ? routeErrorText(r) : t('server unreachable') }), { type: 'error' }); return null; }
  return r;
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

/** `storeError` names WHICH file failed — the STORE (data/integrations.json,
 *  unreadable ⇒ every write refused), the secret KEY file, or (per row, r3)
 *  THIS row's stored values, which the current key file cannot open — by its
 *  `code`. The row's `why` says the fact; this line says the remedy. */
function storeErrorText(err) {
  const reason = (err && err.message) || '';
  // the CODE picks the sentence (a3 i18n); the OS/parse detail rides after it
  // only where it is the fact (an unreadable file's errno)
  if (err && err.code === 'store-unreadable') return t('The integrations store could not be read: {reason}', { reason });
  if (err && err.code === 'values-undecryptable') return t('The keys stored for this row cannot be decrypted with the current key file — restore the key file this instance had when they were entered, or clear the keys and enter them again.');
  return t('The secret key file could not be read: {reason}', { reason });
}
/** A row's `why` in the device's words — the store's `whyCode` + params (a3 i18n). */
const whyWords = (v, fallback) => R.credentialWhyText({ whyCode: v.whyCode, whyParams: v.whyParams, why: fallback === undefined ? v.why : fallback }, { t });

const undecryptable = (v) => !!(v.storeError && v.storeError.code === 'values-undecryptable');
function sourceChip(v) {
  const chip = el('span', 'integ-chip');
  if (undecryptable(v)) { chip.classList.add('integ-chip-bad'); chip.textContent = t('Cannot be decrypted'); }
  else if (v.source === 'user') { chip.classList.add('integ-chip-user'); chip.textContent = t('Your own'); }
  else if (v.source === 'cluster') {
    chip.classList.add('integ-chip-cluster');
    chip.textContent = v.clusterLabel ? t('Cluster default · {label}', { label: v.clusterLabel }) : t('Cluster default');
  } else { chip.classList.add('integ-chip-none'); chip.textContent = t('Not configured'); }
  if (v.why) chip.title = whyWords(v);
  return chip;
}

/** ONE card. `refresh(id)` re-fetches and re-renders just this row. */
function renderCard(app, v, { refresh, focus }) {
  const card = el('div', 'plugin-card integ-card');
  card.dataset.integ = v.id;

  // ── 1. head: label + source chip + wired-in note ──
  const head = el('div', 'plugin-head');
  const name = el('div', 'plugin-name');
  // the registry DECLARES keys; the words are the device's (a brand label
  // without an entry falls back to itself)
  name.append(el('span', null, t(v.label)), sourceChip(v));
  head.appendChild(name);
  if (v.wiredIn) head.appendChild(el('span', 'plugin-state', t('Not wired until {phase}', { phase: t(v.wiredIn) })));
  card.appendChild(head);
  // the undecryptable row says ONE sentence under its state chip (a1 I3: the
  // `why` said the same fact a second time above a chip that contradicted both)
  if (v.why && v.source === 'none' && !undecryptable(v)) card.appendChild(el('div', 'plugin-detail plugin-cfg-warn integ-why', whyWords(v)));
  // A `cluster` answer carries a `why` only when the saved default was re-keyed
  // to the instance's only one — said on the card, not only in the chip's title.
  if (v.why && v.source === 'cluster') card.appendChild(el('div', 'plugin-detail integ-why', whyWords(v)));
  if (v.storeError) card.appendChild(el('div', 'plugin-detail plugin-cfg-warn integ-why', storeErrorText(v.storeError)));

  // ── 2. SETUP BLOCK, ABOVE THE FIELDS ──
  if (v.setup) {
    const setup = el('div', 'integ-setup');
    setup.appendChild(el('div', 'integ-setup-title', t('Before connecting')));
    if (v.setup.callbackUrl) {
      const row = el('div', 'integ-cb-row');
      row.appendChild(el('span', 'plugin-cfg-label', t('Callback URL')));
      const code = el('code', 'integ-cb-url', v.setup.callbackUrl);
      const copy = el('button', 'mounts-btn integ-copy');
      const copyLabel = el('span', null, t('Copy'));
      copy.append(icon('copy', 11), copyLabel);
      copy.title = t('Copy the callback URL');
      copy.onclick = async () => {
        await copyText(v.setup.callbackUrl);
        copyLabel.textContent = t('Copied'); copy.dataset.copied = '1';
        showToast(t('Copied: {text}', { text: v.setup.callbackUrl }));
        setTimeout(() => { copyLabel.textContent = t('Copy'); delete copy.dataset.copied; }, 1500);
      };
      row.append(code, copy);
      setup.appendChild(row);
      if (v.setup.callbackNote) setup.appendChild(el('div', 'plugin-detail', t(v.setup.callbackNote)));
    }
    if (v.setup.prerequisites && v.setup.prerequisites.length) {
      const ul = el('ul', 'integ-prereq');
      for (const p of v.setup.prerequisites) ul.appendChild(el('li', null, t(p)));
      setup.appendChild(ul);
    }
    card.appendChild(setup);
  }

  // ── 3. who serves this row ──
  const choice = el('div', 'integ-choice');
  const ownMode = v.source === 'user' || (v.source === 'none' && !v.clusterAvailable) || (v.source === 'none' && v.hasOwnValues) || (v.source === 'none' && !v.savedClusterKey);
  if (v.delegate && v.delegate.multi) {
    // THE ACCOUNT MODEL (2026-09-22): this pick is the DEFAULT a NEW channel
    // account is bound to — an existing account keeps the credential it was
    // minted under (its own row in the Channels panel says which)
    const lbl = el('span', 'plugin-cfg-label', t('Default for new accounts'));
    const sel = el('select', 'plugin-cfg-select integ-preset');
    for (const o of v.clusterOptions || []) { const op = el('option', null, t('Cluster preset · {label}', { label: o.label })); op.value = o.key; sel.appendChild(op); }
    const own = el('option', null, t('Use my own key')); own.value = '__own__'; sel.appendChild(own);
    sel.value = v.source === 'cluster' && v.clusterKey ? v.clusterKey : '__own__';
    if (!(v.clusterOptions || []).length) sel.title = v.clusterWhy ? R.credentialWhyText({ whyCode: v.clusterWhyCode, whyParams: v.clusterWhyParams, why: v.clusterWhy }, { t }) : '';
    sel.onchange = async () => {
      const key = sel.value === '__own__' ? null : sel.value;
      const r = await call(`/api/integrations/${encodeURIComponent(v.id)}`, json('PUT', { clusterKey: key }), t('Could not update'));
      if (r) refresh(v.id);
    };
    choice.append(lbl, sel);
    if (v.delegate.prefer && (v.clusterOptions || []).length > 1) choice.appendChild(el('span', 'plugin-cfg-hint', t('Preferred preset: {key}', { key: v.delegate.prefer })));
  } else {
    const mk = (value, label, checked, disabled, why) => {
      const wrap = el('label', 'integ-radio' + (disabled ? ' integ-radio-off' : ''));
      const r = el('input'); r.type = 'radio'; r.name = `integ-src-${v.id}`; r.value = value; r.checked = checked; r.disabled = !!disabled;
      wrap.append(r, el('span', null, label));
      if (why) wrap.appendChild(el('span', 'plugin-cfg-hint', why));
      return { wrap, r };
    };
    const cluster = mk('cluster', t('Use cluster default'), v.source === 'cluster', !v.clusterAvailable, v.clusterAvailable ? null : (v.clusterWhy ? R.credentialWhyText({ whyCode: v.clusterWhyCode, whyParams: v.clusterWhyParams, why: v.clusterWhy }, { t }) : t('no cluster default on this instance')));
    const own = mk('own', t('Use my own key'), v.source !== 'cluster', false, null);
    cluster.r.onchange = async () => {
      if (!cluster.r.checked) return;
      const r = await call(`/api/integrations/${encodeURIComponent(v.id)}`, json('PUT', { use: 'cluster' }), t('Could not switch to the cluster default'));
      if (r) refresh(v.id); else own.r.checked = true;
    };
    own.r.onchange = () => { if (own.r.checked) { card.dataset.ownMode = '1'; drawFields(); } };
    choice.append(cluster.wrap, own.wrap);
  }
  card.appendChild(choice);

  // ── 4. the declared fields (own mode only — a cluster row has nothing to type) ──
  const fields = el('div', 'plugin-config integ-fields');
  card.appendChild(fields);
  function drawFields() {
    fields.textContent = '';
    const show = card.dataset.ownMode === '1' || ownMode;
    if (!show) { fields.appendChild(el('div', 'plugin-detail', t('Provided by the cluster'))); return; }
    for (const f of v.fields) {
      const row = el('div', 'plugin-cfg-row integ-field');
      row.dataset.field = f.key;
      const lbl = el('span', 'plugin-cfg-label integ-field-label', t(f.label));   // a declared KEY, worded here
      row.appendChild(lbl);
      let helpLine = null;
      if (f.help) {
        // the help is an AFFORDANCE, not a paragraph under every field (a1 I4):
        // the tooltip says it on hover, a click/tap shows the line for touch
        const info = el('button', 'icon-btn integ-info');
        info.type = 'button';
        info.title = t(f.help);
        info.setAttribute('aria-label', t('Help'));
        info.appendChild(icon('info', 12));
        info.onclick = (ev) => { ev.preventDefault(); if (helpLine) helpLine.classList.toggle('integ-help-open'); };
        lbl.appendChild(info);
      }
      const isSet = !!(v.set && v.set[f.key]);
      const missing = (v.missing || []).includes(f.key);
      const editor = () => {
        const inp = el('input', 'plugin-cfg-flags integ-input');
        inp.type = f.secret ? 'password' : 'text';
        inp.placeholder = f.placeholder || '';
        inp.autocomplete = 'off';
        if (!f.secret && isSet) inp.value = v.values[f.key] || '';
        const save = el('button', 'mounts-btn mounts-btn-primary', t('Save'));
        const cancel = el('button', 'mounts-btn', t('Cancel'));
        const wrap = el('span', 'integ-editing');
        wrap.append(inp, save, cancel);
        const done = () => { wrap.remove(); staticView(); if (card.dataset.stale === '1') { delete card.dataset.stale; refresh(v.id); } };
        cancel.onclick = done;
        save.onclick = async () => {
          const r = await call(`/api/integrations/${encodeURIComponent(v.id)}`, json('PUT', { values: { [f.key]: inp.value } }), t('Could not save'));
          if (!r) return;
          // The OPEN EDITOR is exactly what `refreshOne` defers on (it must
          // not tear a field out from under a user mid-typing), so it is
          // retired BEFORE the re-render is asked for — with it still in the
          // DOM, neither this refresh nor the broadcast's ever repainted the
          // row, and the mask + chip stayed stale after every Save (measured
          // in headless chrome, test-integrations-ui ③).
          wrap.remove(); delete card.dataset.stale;
          showToast(t('Saved'));
          refresh(v.id);
        };
        inp.onkeydown = (e) => { if (e.key === 'Enter') save.onclick(); if (e.key === 'Escape') done(); };
        row.appendChild(wrap);
        inp.focus();
      };
      let staticEl = null;
      const staticView = () => {
        if (staticEl) staticEl.remove();
        staticEl = el('span', 'integ-field-value');
        if (f.secret) {
          // the MASK is monospace (it is a value); an unset secret is a plain "Not set" like any other field (round 2, the light Gmail card)
          const m = isSet ? el('code', 'integ-mask', (v.masked && v.masked[f.key]) || '••••') : el('span', 'integ-plain', t('Not set'));
          const btn = el('button', 'mounts-btn integ-replace', isSet ? t('Replace') : t('Set'));
          btn.onclick = () => { staticEl.remove(); staticEl = null; editor(); };
          staticEl.append(m, btn);
        } else {
          const val = el('span', 'integ-plain', isSet ? v.values[f.key] : t('Not set'));
          const btn = el('button', 'mounts-btn integ-replace', isSet ? t('Edit') : t('Set'));
          btn.onclick = () => { staticEl.remove(); staticEl = null; editor(); };
          staticEl.append(val, btn);
        }
        if (missing) staticEl.appendChild(el('span', 'integ-missing', t('required')));
        row.appendChild(staticEl);
      };
      staticView();
      if (f.help) { helpLine = el('div', 'plugin-cfg-hint integ-help', t(f.help)); row.appendChild(helpLine); }
      fields.appendChild(row);
    }
    // the trim rule ONCE per card (it used to ride on every field's help — a1 §2.8 I4)
    fields.appendChild(el('div', 'plugin-cfg-hint integ-help integ-trim-note', t(R.TRIM_NOTE)));
  }
  drawFields();

  // ── 5. Test + verdict + caveat (ALWAYS together) ──
  const actions = el('div', 'plugin-actions integ-actions');
  const testBtn = el('button', 'mounts-btn integ-test', (TEST_LABEL[v.testKind] || TEST_LABEL['shape-only'])());
  testBtn.title = v.testDescribe ? t(v.testDescribe) : '';
  const result = el('div', 'integ-test-result');
  const drawVerdict = (ok, testedAt, error) => {
    result.textContent = '';
    if (ok === null || ok === undefined) { result.appendChild(el('span', 'plugin-detail', t('Not tested yet'))); }
    else {
      const line = el('div', 'integ-verdict-line');
      line.appendChild(el('span', 'integ-verdict ' + (ok ? 'integ-ok' : 'integ-bad'), ok ? t('Passed') : t('Failed')));
      if (testedAt) line.appendChild(el('span', 'plugin-detail', '· ' + ago(Date.now() - testedAt)));
      if (!ok && error) line.appendChild(el('span', 'plugin-detail plugin-cfg-warn integ-test-error', '— ' + error));
      result.appendChild(line);
    }
    if (v.testCaveat) result.appendChild(el('div', 'plugin-detail integ-caveat', t(v.testCaveat)));
  };
  drawVerdict(v.lastOk, v.testedAt, v.lastError);
  testBtn.onclick = async () => {
    testBtn.disabled = true; const was = testBtn.textContent; testBtn.textContent = t('Testing…');
    try {
      const r = await fetchJson(`/api/integrations/${encodeURIComponent(v.id)}/test`, { method: 'POST' });
      if (!r || (r.error && r.ok !== false && !('testedAt' in r))) {
        // a REFUSAL (not-wired / no runner / 503): it is a line on the card, not a verdict
        result.textContent = '';
        // OUR sentence (worded by code) under its own class: `.integ-test-error` is the runner's / vendor's verbatim, which the i18n census excuses by path
        result.appendChild(el('div', 'plugin-detail plugin-cfg-warn integ-test-refusal', t('Test could not run — {reason}', { reason: r ? routeErrorText(r) : t('server unreachable') })));
        if (v.testCaveat) result.appendChild(el('div', 'plugin-detail integ-caveat', t(v.testCaveat)));
        return;
      }
      drawVerdict(!!r.ok, r.testedAt || Date.now(), r.error || null);
    } finally { testBtn.disabled = false; testBtn.textContent = was; }
  };
  actions.appendChild(testBtn);
  if (v.hasOwnValues) {
    const clear = el('button', 'mounts-btn mounts-btn-danger integ-clear', t('Clear my keys'));
    clear.onclick = async () => {
      const yes = await showConfirmDialog({ title: t('Clear my keys'), message: t('Clear the keys you entered for {label}? The row falls back to the cluster default when one exists.', { label: v.label }), confirmText: t('Clear'), danger: true });
      if (!yes) return;
      const r = await call(`/api/integrations/${encodeURIComponent(v.id)}`, { method: 'DELETE' }, t('Could not clear'));
      if (r) { showToast(t('Keys cleared')); refresh(v.id); }
    };
    actions.appendChild(clear);
  }
  card.append(actions, result);

  // ── 6. where this key is used — a human phrase the row DECLARES (`usedBy`),
  //      never a source path (a1 §2.8 I1); the docs line only when it is a
  //      link a user can open (a repo path is a developer's, not a user's) ──
  const used = el('div', 'plugin-detail integ-used');
  used.textContent = v.usedBy
    ? t(v.usedBy)
    : (v.consumers && v.consumers.length ? t('Used by this instance') : t('Not wired until {phase} — this card only stores the values.', { phase: v.wiredIn ? t(v.wiredIn) : '?' }));
  card.appendChild(used);
  if (v.docs && /^https?:\/\//.test(v.docs)) {
    const d = el('div', 'plugin-detail');
    const a = el('a', 'integ-docs', t('Vendor documentation'));
    a.href = v.docs; a.target = '_blank'; a.rel = 'noopener';
    d.appendChild(a);
    card.appendChild(d);
  }

  if (focus === v.id) {
    card.classList.add('integ-focus');
    setTimeout(() => card.classList.remove('integ-focus'), FOCUS_MS);
  }
  return card;
}

/** Open (or focus) THE window; `focus` scrolls to and highlights one card. */
export function openIntegrationsWindow(app, opts = {}) {
  const focus = opts.focus || null;
  for (const [, w] of app.wm.windows) {
    if (w.type === 'integrations') {
      app.wm.focusWindow(w.id);
      if (focus && w._integFocus) w._integFocus(focus);
      return w;
    }
  }
  const winInfo = app.wm.createWindow({ title: t('Integrations & keys'), type: 'integrations', syncId: opts.syncId, openSpec: { action: 'openIntegrations', focus }, width: 720, height: 560 });
  const shell = el('div', 'integ-win');
  const bar = el('div', 'jobs-toolbar');
  bar.appendChild(el('span', 'jobs-summary', t('Your own key wins over the cluster default. Secrets are never shown again after saving — only replaced.')));
  const root = el('div', 'jobs-body integ-body');
  shell.append(bar, root);
  winInfo.content.appendChild(shell);

  let pendingFocus = focus;
  const cards = new Map();

  function scrollTo(id) {
    const card = cards.get(id);
    if (!card) return false;
    card.classList.add('integ-focus');
    setTimeout(() => card.classList.remove('integ-focus'), FOCUS_MS);
    try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch { card.scrollIntoView(); }
    return true;
  }
  winInfo._integFocus = (id) => { if (!scrollTo(id)) pendingFocus = id; };

  async function refreshOne(id) {
    const r = await fetchJson(`/api/integrations/${encodeURIComponent(id)}`);
    if (!r || !r.integration) return;
    const old = cards.get(id);
    if (old && old.querySelector('.integ-editing')) { old.dataset.stale = '1'; return; }
    const fresh = renderCard(app, r.integration, { refresh: refreshOne, focus: null });
    if (old) old.replaceWith(fresh); else root.appendChild(fresh);
    cards.set(id, fresh);
  }

  async function render() {
    const r = await fetchJson('/api/integrations');
    root.textContent = '';
    cards.clear();
    if (!r || r.error || !Array.isArray(r.integrations)) {
      const e = el('div', 'jobs-empty', (r && r.error) || t('Could not load integrations — the server did not answer.'));
      e.style.color = 'var(--red)';
      root.appendChild(e);
      const again = el('button', 'mounts-btn', t('Retry')); again.onclick = render; root.appendChild(again);
      return;
    }
    if (r.storeError) root.appendChild(el('div', 'plugin-detail plugin-cfg-warn', storeErrorText(r.storeError)));
    for (const v of r.integrations) {
      const card = renderCard(app, v, { refresh: refreshOne, focus: null });
      cards.set(v.id, card);
      root.appendChild(card);
    }
    if (pendingFocus) { const id = pendingFocus; pendingFocus = null; scrollTo(id); }
  }
  render();

  // Live: another client's change re-renders that one card (never a fetch of
  // everything for one row). Removed BY NAME when the window closes.
  const off = app.ws.onGlobal((msg) => { if (msg && msg.type === 'integrations-updated' && msg.id) refreshOne(msg.id); });
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { off?.(); } catch {} });
  return winInfo;
}

registerWindowType({
  type: 'integrations', label: t('Integrations & keys'), singleton: true, icon: ICON,
  action: 'openIntegrations',
  replay: (app, spec, { syncId } = {}) => app.openIntegration(spec && spec.focus, { syncId }),
});

registerMenuItem({
  menu: 'gear', parent: 'comm', order: 30, icon: ICON, // under Communication ▸ (gear-menu.js head 'comm'; Channels 10 · Outbox 20 · this 30)
  label: () => t('Integrations…'),
  run: (c) => c.app.openIntegration(),
});

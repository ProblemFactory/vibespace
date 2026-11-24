// B-9584 U3 — «Environment…» — a browser profile's time zone, language and location (and the sites that may read its place), the
// PERSON's setting (主开发 r2311 / r2497 / r2595). The form model is PURE (src/lib/browser-environment-form.js: U1's own verdict and
// resolver), the words the page's by code (src/lib/browser-environment-words.js); the save is the keeper's ONE door (POST
// /api/browser/profiles/:id/environment — an agent's token is refused by the route), applied at the browser's next start like the
// proxy. «Automatic» says what it means RIGHT NOW from the kept exit; location «this machine's» or «Blocked» drops the list of sites.
// No control is greyed: a choice the profile cannot hold is refused in words at the save (the owner's rule).
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';
import { btn, el, noteLine, noteText } from './channel-chrome.js';
import { fieldsOf, bodyOf, checkOf, autoSaidOf, changedFrom, leakWatch, SITES_LIMIT } from './browser-environment-form.js';
import { envWords, autoWords, placeLeakWords } from './browser-environment-words.js';

const SAVED = new WeakSet();   // as the proxy dialog (B-acb9): a second open RAISES the live form; 'done' only after ITS own save
const selectOf = (cls, label, options, value) => {
  const sel = document.createElement('select');
  sel.className = `benv-mode ${cls}`; sel.setAttribute('aria-label', label);
  for (const [v, text] of options) { const o = document.createElement('option'); o.value = v; o.textContent = text; sel.appendChild(o); }
  sel.value = options.some(([v]) => v === value) ? value : options[0][0];
  return sel;
};
const inputOf = (cls, label, value, placeholder = '') => {
  const i = document.createElement('input');
  i.type = 'text'; i.className = `benv-input ${cls}`; i.value = value; i.placeholder = placeholder; i.autocomplete = 'off'; i.spellcheck = false; i.setAttribute('aria-label', label);
  return i;
};

export function openEnvironmentDialog(app, r, { onDone = null, onClose = null } = {}) {
  let sh = null;
  const label = String((r && (r.label || r.id)) || '');
  const f0 = fieldsOf(r), auto = autoSaidOf(r);
  let read = () => f0;
  let watch = null;   // B-9584 r3795: the place sentence's watch (started once the form opens, stopped when it closes)
  const shell = createModalShell({ id: 'browser-env-dialog', key: String(r.id), opener: 'person', title: t('Environment of {label}', { label }), dialogClass: 'bwho-dialog benv-dialog',
    onClose: () => { try { if (watch) watch.stop(); } catch { /* none */ } try { onClose?.(sh && SAVED.has(sh.overlay) ? 'done' : 'cancelled'); } catch { /* the caller's own */ } },
    unsaved: { isDirty: () => changedFrom(r, read()), save: () => doSave() }, kind: 'form' });
  sh = shell;
  if (shell.raised) return shell;
  const body = shell.body;
  body.appendChild(el('div', 'bnew-hint', t('What this profile\'s browser tells the sites it opens: its time zone, its language and where it is.')));
  body.appendChild(el('div', 'bnew-hint', t('Applied at the browser\'s next start.')));
  // the time zone and the language: this machine's · Automatic (said now, from the kept exit) · a value of the person's
  const plain = (key, head, placeholder) => {
    const row = el('div', `bnew-field benv-row benv-${key}`);
    row.appendChild(el('span', 'bnew-field-head', head));
    const sel = selectOf(`benv-${key}-mode`, head, [['machine', t('This machine\'s')], ['auto', t('Automatic')], ['value', t('Set by you')]], f0[key].mode);
    const inp = inputOf(`benv-${key}-value`, head, f0[key].value, placeholder);
    const said = el('div', 'bnew-hint benv-auto', autoWords(auto[key], t));
    const show = () => { inp.style.display = sel.value === 'value' ? '' : 'none'; said.style.display = sel.value === 'auto' ? '' : 'none'; };
    sel.addEventListener('change', show); show();
    row.append(sel, inp, said);
    body.appendChild(row);
    return () => ({ mode: sel.value, value: inp.value });
  };
  const readTz = plain('timezone', t('Time zone'), 'Europe/Paris');
  const readLang = plain('language', t('Language'), 'fr-FR');
  // the location: this machine's · Blocked · a place (and the sites that may read it — only these, every other site denied, no prompt)
  const lrow = el('div', 'bnew-field benv-row benv-location');
  lrow.appendChild(el('span', 'bnew-field-head', t('Location')));
  const lsel = selectOf('benv-location-mode', t('Location'), [['machine', t('This machine\'s')], ['block', t('Blocked')], ['value', t('A place')]], f0.location.mode);
  const place = el('div', 'benv-place');
  const lat = inputOf('benv-lat', t('Latitude'), f0.location.latitude, t('Latitude'));
  const lng = inputOf('benv-lng', t('Longitude'), f0.location.longitude, t('Longitude'));
  const acc = inputOf('benv-acc', t('Accuracy in metres'), f0.location.accuracy, t('Accuracy in metres'));
  const sitesHead = el('span', 'bnew-field-head benv-sites-head', t('Sites that may read the place'));
  const sites = document.createElement('textarea');
  sites.className = 'benv-sites'; sites.rows = 4; sites.value = f0.location.sites; sites.spellcheck = false; sites.setAttribute('aria-label', t('Sites that may read the place')); sites.placeholder = 'https://maps.example.com';
  const sitesHint = el('div', 'bnew-hint benv-sites-hint', t('One web address a line, at most {n}. Only these sites read the place; every other site is denied the location, with no prompt.', { n: SITES_LIMIT }));
  place.append(lat, lng, acc, sitesHead, sites, sitesHint);
  const blocked = el('div', 'bnew-hint benv-blocked', t('Every site is denied the location.'));
  const lshow = () => { place.style.display = lsel.value === 'value' ? '' : 'none'; blocked.style.display = lsel.value === 'block' ? '' : 'none'; };
  lsel.addEventListener('change', lshow); lshow();
  // B-9584, the owner's decision (r2911 / r2916 / r3795): ONE plain sentence on whether this browser can give a site this machine's real
  // place — a fact said once, never a greyed control or a refusal. «Cannot leak» only on the SERVER's verdict for this profile (what
  // runs now and what starts next); the weaker sentence until it answers and on any failure; asked again only on a move of THIS profile
  // (Change build…, its browser started or stopped) or of the engines' kernels, never on another profile's; a profile on stock Chrome
  // asks nothing (r3946); the first ask waits for the form to OPEN (§103 r4)
  const leak = el('div', 'bnew-hint benv-leak', placeLeakWords(false, t));
  watch = leakWatch({ id: String(r.id), choice: r.browser || null, ask: () => fetchJson(`/api/browser/engines?profile=${encodeURIComponent(r.id)}`), say: (iso) => { leak.textContent = placeLeakWords(iso, t); }, on: (h) => app.ws?.onGlobal?.(h), off: (h) => app.ws?.offGlobal?.(h) });
  shell.ready.then((s) => { if (s) watch.start(); });   // once it opens (r4: a queued form waits behind the open one's ask)
  lrow.append(lsel, place, blocked, leak);
  body.appendChild(lrow);
  read = () => ({ timezone: readTz(), language: readLang(), location: { mode: lsel.value, latitude: lat.value, longitude: lng.value, accuracy: acc.value, sites: sites.value } });
  const refusal = noteLine('bwho-refusal bnew-refusal', '', { warn: true });
  refusal.style.display = 'none';
  const notes = el('div', 'bwho-notes'); notes.append(refusal);
  const say = (text) => { noteText(refusal, text || ''); refusal.style.display = text ? '' : 'none'; };
  const sayCode = (code, detail = '') => { const w = envWords(code, t, { limit: SITES_LIMIT }); say(detail ? `${w.text} (${detail})` : w.text); };
  const footer = el('div', 'dialog-footer bwho-footer');
  const cancel = btn(t('Cancel'), () => shell.close(), 'bnew-cancel');
  const save = btn(t('Save'), () => doSave(), 'mounts-btn-primary benv-save');
  footer.append(cancel, save);
  shell.dialog.append(notes, footer);
  let busy = false;
  async function doSave() {
    if (busy) return;
    busy = true; save.disabled = true;
    try {
      const f = read(), v = checkOf(f);
      if (!v.ok) { sayCode(v.code); return; }   // the page's own check (the server judges again); its words by code, never the typed text echoed (r2767)
      const res = await fetchJson(`/api/browser/profiles/${encodeURIComponent(r.id)}/environment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyOf(f)) });
      if (!res || res.error || res.ok === false) { sayCode(res && res.code, ''); return; }
      showToast(res.restartNeeded ? t('{label} takes its environment at its next start', { label }) : t('{label}\'s environment is saved', { label }), { duration: 5000 });
      SAVED.add(shell.overlay);
      shell.close();
      try { onDone?.(); } catch { /* the panel reloads on its own */ }
    } finally { busy = false; save.disabled = false; }
  }
  return shell;
}

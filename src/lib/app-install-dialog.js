// INSTALL AN APP (Layer 0 of docs/design-app-persistence.zh.md §3.1) — the user's door (owner D3): the Desktop apps
// dialog's "Your apps" section and the dialogs it opens. Every install, removal, package source, Refresh and Adopt is
// shown and run by THE install dialog component (src/lib/desktop-app-launcher.js `showInstallDialog(m, {what: 'app',
// request | proposalId})` — the same component as "Install xpra on {machine}…": the PLAN first, every command, the
// packages, a new source's key fingerprint, the sizes, how the app comes back after the machine is rebuilt, then the run
// with its log streamed). Nothing here installs anything by itself.
//   · renderAppsSection(app, el, {host, machine, onChange}) — the section: the apps installed through VibeSpace (Remove…),
//     open proposals from agents (Install… / Not now), "N updates · last refreshed N days ago" + Refresh…, the drift
//     tripwire ("installed outside VibeSpace" + Adopt…), the buttons Install an app… / Install from a .deb file… / Add a
//     package source… / Let an agent help…. Every string an agent or a package wrote is drawn as textContent.
//   · openAppSearch / openDebInstall / openSourceDialog / openAgentHelp — the four doors.
// Every failure reaches the user (a toast or the dialog's own line); fetchJson never throws, so every answer is checked.
import { t } from './i18n.js';
import { createModalShell, fetchJson, showToast } from './utils.js';
import { showInstallDialog, machineName, machineInSentence } from './desktop-app-launcher.js';
import { fmtBytes } from '../app-manifest.js';

const el = (tag, cls = '', text = null) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const btn = (label, cls = 'file-tool-btn', title = '') => { const b = el('button', cls, label); b.type = 'button'; b.style.cssText = 'width:auto;padding:0 10px'; if (title) b.title = title; return b; };
const q = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

/** A refusal code → the user's words (a plan the machine refused, a run that could not start). '' = none of ours. */
export function appRefusalText(code) {
  switch (code) {
    case 'needs_snap': return t('This package is only a placeholder for a snap — snaps do not run here. Install the program another way (a .deb file, or another package).');
    case 'conflict': return t('apt cannot install it together with what is already installed.');
    case 'removes': return t('Installing it would remove other packages — VibeSpace never removes a package to install another.');
    case 'not_found': return t('There is no such package in this machine’s package sources.');
    case 'bad_name': return t('That is not a package name.');
    case 'bad_source': return t('That package source cannot be added — it must be an https address with its signing key.');
    case 'no_sudo': return t('This machine has no passwordless sudo — run the commands below yourself.');
    case 'no_apt': return t('This machine has no apt-get — VibeSpace installs apps with apt only.');
    case 'disk': return t('There is not enough free disk space.');
    case 'shared': return t('Another of your apps needs it, so it cannot be removed alone.');
    case 'nothing': return t('Nothing to put back.');
    case 'busy': return t('An install is already running on this machine — wait for it to finish, then try again.');
    case 'plan_changed': return t('What would run changed after it was shown — nothing ran. Read the new plan, then press the button again.');
    case 'not_run': return t('Another install was running on this machine — it has finished; press the button again.');
    case 'refused': return t('The machine refused to run it — the log says why.');
    case 'not_recorded': return t('It ran, but the machine did not record it — the log says why.');
    case 'host_needs_daemon': return t('The VibeSpace agent on that machine is too old to install apps — reconnect the machine to upgrade it.');
    case 'proposal_state': return t('That proposal was already decided.');
    case 'install_timeout': return t('It did not finish in time and is still running on the machine — VibeSpace never stops apt halfway. Check again once it ends.');
    case 'install_link_lost': return t('The link to the machine dropped during the install. It keeps running there — check again once the machine is back.');
    case 'install_failed': return t('The install failed — the log above says why.');
    default: return '';
  }
}
/** The dialog's title for a request (or a proposal's request). */
export function appDialogTitle(request, name) {
  const r = request || {};
  if (r.kind === 'remove') return t('Remove {app} from {machine}', { app: r.entryId || '', machine: name });
  if (r.kind === 'refresh') return t('Refresh the apps on {machine}', { machine: name });
  if (r.kind === 'adopt') return t('Keep these packages on {machine}', { machine: name });
  if (r.kind === 'source') return t('Add a package source to {machine}', { machine: name });
  if (r.kind === 'source-remove') return t('Remove a package source from {machine}', { machine: name });
  if (r.kind === 'deb') return t('Install a .deb file on {machine}', { machine: name });
  if (r.kind === 'replay') return t('Put your apps back on {machine}', { machine: name });
  return t('Install {app} on {machine}', { app: (r.packages || []).join(' '), machine: name });
}
/** The go button's label for a plan. */
export function appGoLabel(plan) {
  const k = plan && plan.kind;
  return k === 'remove' || k === 'source-remove' ? t('Remove') : k === 'refresh' ? t('Refresh') : k === 'adopt' ? t('Keep them') : k === 'source' ? t('Add the source') : k === 'replay' ? t('Put back') : t('Install');
}
/** The sentence above the commands. */
export function appPlanNote(plan, name) {
  return t('These commands run on {machine} as root:', { machine: name });
}
/** verify-r1 F6: packages a run could not save a .deb for — the replay can never put them back (said, never silent). */
export function unsavedText(pkgs) {
  const list = [...new Set((pkgs || []).map((x) => (typeof x === 'string' ? x : x && x.package)).filter(Boolean))];
  return list.length ? t('No saved package for {pkgs} — it will not come back after this machine is rebuilt', { pkgs: list.slice(0, 12).join(' ') + (list.length > 12 ? ` (+${list.length - 12})` : '') }) : '';
}
/** The finished run, in words. */
export function appDoneText(end, name) {
  if (!end) return '';
  const unsaved = unsavedText(end.run && end.run.missing);
  if (unsaved) return `${appDoneText({ ...end, run: null }, name)} — ${unsaved}`;
  if (end.kind === 'remove') return t('{app} is removed from {machine}', { app: end.label || end.entryId || '', machine: name });
  if (end.kind === 'refresh') return t('The apps on {machine} are refreshed', { machine: name });
  if (end.kind === 'source') return t('The package source {app} is added to {machine}', { app: end.label || '', machine: name });
  if (end.kind === 'source-remove') return t('The package source {app} is removed', { app: end.label || '' });
  if (end.kind === 'replay') return t('Your apps are back on {machine}', { machine: name });
  return (end.rows || []).length ? t('{app} is installed on {machine} — it is in the Applications list', { app: end.rows.map((r) => r.label).join(', '), machine: name }) : t('{app} is installed on {machine}', { app: end.label || '', machine: name });
}

/** THE PLAN'S FACTS (the block above the commands): who proposed it and why, the packages, the sizes, a source's key
 *  fingerprint, a .deb's own install scripts, and how the app comes back after a rebuild. textContent only. */
export function appPlanBlock(plan, { proposal = null } = {}) {
  const box = el('div', 'app-plan-facts');
  const line = (text, cls = '') => { const p = el('div', 'app-plan-line' + (cls ? ' ' + cls : ''), text); box.appendChild(p); return p; };
  if (proposal && proposal.by) {
    line(t('{name} proposed this.', { name: proposal.by.name || t('An agent') }), 'app-plan-by');
    if (proposal.why) line(t('Why: {why}', { why: proposal.why }), 'app-plan-why');
  }
  const k = plan.kind;
  if (k === 'apt' || k === 'deb' || k === 'adopt') {
    const n = (plan.closure || []).length;
    if (k !== 'adopt') line(n ? t('{n} packages · {download} to download · {disk} on disk', { n, download: fmtBytes(plan.downloadBytes || 0), disk: fmtBytes(Math.max(0, plan.installedBytes || 0)) }) : t('Already installed — VibeSpace keeps it so it comes back after a rebuild.'));
    if ((plan.origins || []).length) line(t('From: {origins}', { origins: plan.origins.join(', ') }));
    if (k === 'deb' && plan.deb) {
      line(t('File: {name} · sha256 {sha}', { name: plan.deb.name, sha: plan.deb.sha256 }), 'app-plan-mono');
      if ((plan.deb.scripts || []).length) line(t('It runs its own install scripts as root: {scripts}', { scripts: plan.deb.scripts.join(', ') }), 'app-plan-warn');
    }
    const names = k === 'adopt' ? (plan.packages || []) : (plan.closure || []).map((c) => c.package);
    if (names.length) {
      const d = el('details', 'app-plan-pkgs');
      d.appendChild(el('summary', '', t('Packages ({n})', { n: names.length })));
      d.appendChild(el('div', 'app-plan-pkg-list', names.join(' ')));
      box.appendChild(d);
    }
    line(t('After this machine is rebuilt, VibeSpace puts it back from its saved packages — about {s} s after the server starts.', { s: plan.replaySeconds || 1 }), 'app-plan-replay');
  } else if (k === 'source' && plan.sourceSpec) {
    line(t('Address: {uri}', { uri: plan.sourceSpec.uris.join(' ') }), 'app-plan-mono');
    line(t('Suites: {suites}', { suites: [...plan.sourceSpec.suites, ...(plan.sourceSpec.components || [])].join(' ') }), 'app-plan-mono');
    line(t('Key fingerprint: {fpr}', { fpr: (plan.sourceSpec.fingerprints || []).join(' ') }), 'app-plan-mono app-plan-fpr');
    line(t('Compare the fingerprint with the one the publisher shows. Packages come from this source only when you install them later.'), 'app-plan-warn');
  } else if (k === 'remove') {
    line((plan.removes || []).length ? t('Removes: {pkgs}', { pkgs: plan.removes.join(' ') }) : t('Its packages stay (another of your apps uses them); only the record goes.'));
  } else if (k === 'refresh') {
    const u = plan.updates || [];
    line(u.length ? t('{n} updates: {list}', { n: u.length, list: u.slice(0, 30).map((x) => `${x.package} ${x.from} → ${x.to}`).join(', ') }) : t('Everything is up to date — Refresh still checks again and saves the packages.'));
  }
  return box;
}

/** "N updates · last refreshed N days ago" (D5) — never an automatic upgrade. */
export function updatesChipText(st, now = Date.now()) {
  const n = st && st.updates && Number.isFinite(st.updates.count) ? st.updates.count : null;
  const at = st && st.refreshedAt;
  const days = at ? Math.floor((now - at) / 86400000) : null;
  const ago = days == null ? t('never refreshed') : days === 0 ? t('last refreshed today') : t('last refreshed {n} d ago', { n: days });
  return n == null ? ago : n === 0 ? t('up to date · {ago}', { ago }) : t('{n} updates · {ago}', { n, ago });
}

/**
 * THE "YOUR APPS" SECTION of the Desktop apps dialog, for ONE machine. Keyed by the machine; re-renders from
 * GET /api/apps on open and on every `apps-updated` broadcast for that machine. Returns {refresh, dispose}.
 */
export function renderAppsSection(app, root, { host = 'local', machine = null, onChange = () => { } } = {}) {
  const m = machine || { hostId: host };
  const name = () => machineInSentence(m);
  let alive = true, last = null;
  const done = () => { refresh(); onChange(); };
  const head = el('div', 'app-sec-head');
  const chip = el('span', 'app-sec-updates');
  const refreshBtn = btn(t('Refresh…'), 'file-tool-btn app-sec-refresh', t('Shows the plan first — nothing runs until you confirm'));
  refreshBtn.onclick = () => showInstallDialog(m, { what: 'app', request: { kind: 'refresh' }, onDone: done });
  head.append(chip, refreshBtn);
  const actions = el('div', 'app-sec-actions');
  const bInstall = btn(t('Install an app…'), 'btn-create app-sec-install');
  bInstall.onclick = () => openAppSearch(app, m, { onDone: done });
  const bDeb = btn(t('Install from a .deb file…'), 'file-tool-btn app-sec-deb');
  bDeb.onclick = () => openDebInstall(app, m, { onDone: done });
  const bSrc = btn(t('Add a package source…'), 'file-tool-btn app-sec-source');
  bSrc.onclick = () => openSourceDialog(app, m, { onDone: done });
  const bHelp = btn(t('Let an agent help…'), 'file-tool-btn app-sec-help', t('Starts a temporary helper conversation that knows how to install apps — it can only propose; you approve'));
  bHelp.onclick = () => openAgentHelp(app, m);
  actions.append(bInstall, bDeb, bSrc, bHelp);
  const status = el('div', 'app-sec-status');
  const back = el('div', 'app-sec-back'); // verify-r1 F4: apps root keeps that are not on this machine — the user's door to put them back
  const props = el('div', 'app-sec-proposals');
  const drift = el('div', 'app-sec-drift');
  const list = el('div', 'app-sec-list');
  root.replaceChildren(head, actions, status, back, props, drift, list);
  const render = (st) => {
    if (!alive || !root.isConnected) return;
    if (!st || st.error) {
      chip.textContent = '';
      status.textContent = st && st.code === 'host_needs_daemon' ? appRefusalText('host_needs_daemon') : t('Could not read the apps on {machine}: {why}', { machine: name(), why: (st && st.error) || t('server unreachable') });
      status.classList.add('is-bad');
      back.replaceChildren(); props.replaceChildren(); drift.replaceChildren(); list.replaceChildren();
      return;
    }
    status.classList.remove('is-bad');
    chip.textContent = updatesChipText(st);
    refreshBtn.disabled = !(st.manifest && st.manifest.entries || []).length;
    status.textContent = st.replaying ? t('Putting your apps back after this machine was rebuilt…') : st.manifestError ? t('The apps list on this machine could not be read: {why}', { why: st.manifestError }) : '';
    // verify-r1 F4: entries root keeps that are not installed here (a replay that could not put them back, a paired machine
    // rebuilt, an install that ran before the boot replay) — "Put back" runs the replay through THE install dialog
    back.replaceChildren();
    const rp = st.replay || {};
    if (!st.replaying && rp.decision && rp.decision.run && (rp.missing || []).length) {
      const row = el('div', 'app-sec-row app-sec-back-row');
      row.appendChild(el('span', 'app-sec-label', appDialogTitle({ kind: 'replay' }, name())));
      row.appendChild(el('span', 'app-sec-sub', rp.missing.join(' ')));
      const go = btn(t('Put back'), 'btn-create app-sec-putback');
      go.onclick = () => showInstallDialog(m, { what: 'app', request: { kind: 'replay' }, onDone: done });
      row.appendChild(go);
      back.appendChild(row);
    }
    // open proposals from agents (each = one For-you item too)
    props.replaceChildren();
    for (const p of st.proposals || []) {
      const row = el('div', 'app-sec-row app-sec-proposal');
      const words = p.kind === 'remove' ? t('{name} wants to remove {app}', { name: (p.by && p.by.name) || t('An agent'), app: p.label }) : p.kind === 'source' ? t('{name} wants to add the package source {app}', { name: (p.by && p.by.name) || t('An agent'), app: p.label }) : t('{name} wants to install {app}', { name: (p.by && p.by.name) || t('An agent'), app: p.label });
      row.appendChild(el('span', 'app-sec-label', words));
      if (p.state === 'installing') row.appendChild(el('span', 'app-sec-state', t('installing…')));
      else {
        const go = btn(t('Install…'), 'btn-create app-sec-go'); go.onclick = () => showInstallDialog(m, { what: 'app', proposalId: p.id, onDone: done });
        const no = btn(t('Not now'), 'file-tool-btn app-sec-no');
        no.onclick = async () => { no.disabled = true; const r = await fetchJson(`/api/apps/proposals/${encodeURIComponent(p.id)}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (!r || r.error) { showToast(appRefusalText(r && r.code) || (r && r.error) || t('server unreachable'), { type: 'error' }); no.disabled = false; } else { showToast(t('Declined — the agent is told on its next turn')); refresh(); } };
        row.append(go, no);
      }
      props.appendChild(row);
    }
    // the drift tripwire
    drift.replaceChildren();
    if (st.drift && st.drift.drift && (st.drift.added || []).length) {
      const pk = st.drift.added.map((x) => x.package);
      const row = el('div', 'app-sec-row app-sec-drift-row');
      row.appendChild(el('span', 'app-sec-label', t('Installed outside VibeSpace — lost when this machine is rebuilt: {pkgs}', { pkgs: pk.slice(0, 12).join(' ') + (pk.length > 12 ? ` (+${pk.length - 12})` : '') })));
      const ad = btn(t('Adopt…'), 'file-tool-btn app-sec-adopt', t('Keeps them: VibeSpace saves their packages so they come back after a rebuild'));
      ad.onclick = () => showInstallDialog(m, { what: 'app', request: { kind: 'adopt', packages: pk.slice(0, 32) }, onDone: done });
      row.appendChild(ad);
      drift.appendChild(row);
    }
    // the installed entries + package sources
    list.replaceChildren();
    const entries = (st.manifest && st.manifest.entries) || [];
    const sources = (st.manifest && st.manifest.sources) || [];
    if (!entries.length && !sources.length) list.appendChild(el('div', 'desktop-launch-empty', t('Nothing installed through VibeSpace yet. An app you install here comes back after this machine is rebuilt.')));
    for (const e of entries) {
      const row = el('div', 'app-sec-row app-sec-entry');
      row.dataset.entry = e.id;
      const rows = (st.rows || []).filter((r) => r.app === e.id);
      row.appendChild(el('span', 'app-sec-label', rows.length ? rows.map((r) => r.label).join(', ') : (e.label || e.packages.join(' '))));
      row.appendChild(el('span', 'app-sec-sub', [e.packages.join(' '), e.kind === 'deb' ? t('from a .deb file') : '', e.by && e.by.kind === 'agent' ? t('proposed by {name}', { name: e.by.name || t('an agent') }) : ''].filter(Boolean).join(' · ')));
      const unsaved = unsavedText(((st.entries || []).find((x) => x.id === e.id) || {}).uncached);
      if (unsaved) row.appendChild(el('span', 'app-sec-sub app-plan-warn app-sec-unsaved', unsaved));
      const rm = btn(t('Remove…'), 'file-tool-btn app-sec-remove');
      rm.onclick = () => showInstallDialog(m, { what: 'app', request: { kind: 'remove', entryId: e.id }, onDone: done });
      row.appendChild(rm);
      list.appendChild(row);
    }
    for (const s of sources) {
      const row = el('div', 'app-sec-row app-sec-source-row');
      row.appendChild(el('span', 'app-sec-label', t('Package source {app}', { app: s.id })));
      row.appendChild(el('span', 'app-sec-sub app-plan-mono', `${s.uris.join(' ')} · ${(s.fingerprints || []).join(' ')}`));
      const rm = btn(t('Remove…'), 'file-tool-btn app-sec-remove');
      rm.onclick = () => showInstallDialog(m, { what: 'app', request: { kind: 'source-remove', sourceId: s.id }, onDone: done });
      row.appendChild(rm);
      list.appendChild(row);
    }
  };
  const refresh = async () => {
    const st = await fetchJson(`/api/apps?${q({ host })}`);
    last = st;
    render(st);
    return st;
  };
  const off = app.ws && typeof app.ws.onGlobal === 'function' ? app.ws.onGlobal((msg) => { if (msg && msg.type === 'apps-updated' && (msg.host || 'local') === host && alive && root.isConnected) refresh(); }) : null;
  refresh();
  return { refresh, last: () => last, dispose: () => { alive = false; try { off?.(); } catch { } } };
}

/** "Install an app…" — search this machine's package sources, pick one, see THE plan. */
export function openAppSearch(app, m, { onDone = null } = {}) {
  const { body, close } = createModalShell({ id: 'app-search-dialog', title: t('Install an app on {machine}', { machine: machineInSentence(m) }), dialogClass: 'desktop-install app-search', escapeToClose: true });
  const intro = el('p', 'app-search-intro', t('Search the package sources of {machine}. Nothing is installed until you read its plan and press Install.', { machine: machineInSentence(m) }));
  const form = el('form', 'app-search-form');
  const input = el('input', 'app-search-input'); input.type = 'search'; input.placeholder = t('An app or a package name — gimp, inkscape…'); input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('aria-label', t('Search'));
  const go = btn(t('Search'), 'btn-create app-search-go'); go.type = 'submit';
  form.append(input, go);
  const note = el('div', 'desktop-install-note app-search-note');
  const results = el('div', 'app-search-results');
  body.append(intro, form, note, results);
  const pick = (pkg) => { close(); showInstallDialog(m, { what: 'app', request: { kind: 'apt', packages: [pkg] }, onDone }); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const words = input.value.trim();
    if (!words) { input.focus(); return; }
    go.disabled = true; note.textContent = t('Searching…'); note.classList.remove('is-bad'); results.replaceChildren();
    const r = await fetchJson(`/api/apps/search?${q({ host: m.hostId, q: words })}`);
    go.disabled = false;
    if (!r || r.error) { note.textContent = appRefusalText(r && r.code) || (r && r.error) || t('server unreachable'); note.classList.add('is-bad'); return; }
    const exact = /^[a-z0-9][a-z0-9+.-]{1,63}$/.test(words);
    note.textContent = r.results.length ? t('{n} found — pick one to see its plan', { n: r.results.length }) : exact ? '' : t('Nothing found for “{q}”', { q: words });
    if (exact && !r.results.some((x) => x.package === words)) { const b = el('button', 'app-search-result app-search-exact'); b.type = 'button'; b.append(el('span', 'app-search-pkg', words), el('span', 'app-search-sum', t('Plan this exact package name'))); b.onclick = () => pick(words); results.appendChild(b); }
    for (const x of r.results) { const b = el('button', 'app-search-result'); b.type = 'button'; b.dataset.pkg = x.package; b.append(el('span', 'app-search-pkg', x.package), el('span', 'app-search-sum', x.summary)); b.onclick = () => pick(x.package); results.appendChild(b); }
  };
  setTimeout(() => input.focus({ preventScroll: true }), 0);
  return { close };
}

/** "Install from a .deb file…" (owner D4) — a .deb ON THAT MACHINE by its path: THE plan (dpkg-deb -I + the
 *  simulation), the same approval, and the file copied into the machine's package cache with its sha256. */
export function openDebInstall(app, m, { onDone = null, path = '' } = {}) {
  const { body, close } = createModalShell({ id: 'app-deb-dialog', title: t('Install a .deb file on {machine}', { machine: machineInSentence(m) }), dialogClass: 'desktop-install app-deb', escapeToClose: true });
  body.appendChild(el('p', 'app-search-intro', t('The .deb file’s full path on {machine} — in Files, right-click a .deb file and choose “Install this package…”, or type its path. Its plan shows what it installs and whether it runs its own install scripts.', { machine: machineInSentence(m) })));
  const form = el('form', 'app-search-form');
  const input = el('input', 'app-search-input app-deb-path'); input.type = 'text'; input.placeholder = '/home/…/package.deb'; input.value = path || ''; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('aria-label', t('Path'));
  const go = btn(t('Show the plan'), 'btn-create'); go.type = 'submit';
  form.append(input, go);
  body.appendChild(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    const p = input.value.trim();
    if (!p.startsWith('/') || !p.endsWith('.deb')) { showToast(t('Type the full path of a .deb file (it starts with / and ends with .deb)'), { type: 'error' }); input.focus(); return; }
    close();
    showInstallDialog(m, { what: 'app', request: { kind: 'deb', debPath: p }, onDone });
  };
  setTimeout(() => input.focus({ preventScroll: true }), 0);
  return { close };
}

/** "Add a package source…" (owner D4) — a third-party apt source is its OWN plan: its https address and its signing
 *  key's fingerprint, approved before any package comes from it. */
export function openSourceDialog(app, m, { onDone = null } = {}) {
  const { body, close } = createModalShell({ id: 'app-source-dialog', title: t('Add a package source to {machine}', { machine: machineInSentence(m) }), dialogClass: 'desktop-install app-source', escapeToClose: true });
  body.appendChild(el('p', 'app-search-intro', t('A publisher’s own apt repository (for example a browser or an editor vendor). Its key is fetched and its fingerprint shown before anything is added.')));
  const form = el('form', 'app-source-form');
  const field = (label, cls, ph) => { const l = el('label', 'desktop-launch-field'); l.appendChild(el('span', '', label)); const i = el('input', cls); i.type = 'text'; i.placeholder = ph; i.autocomplete = 'off'; i.spellcheck = false; l.appendChild(i); form.appendChild(l); return i; };
  const nm = field(t('Name'), 'app-source-name', 'vendor');
  const uri = field(t('Address (https)'), 'app-source-uri', 'https://packages.example.com/apt');
  const suites = field(t('Suite'), 'app-source-suites', 'stable');
  const comps = field(t('Components'), 'app-source-components', 'main');
  const key = field(t('Signing key address (https)'), 'app-source-key', 'https://packages.example.com/key.asc');
  const go = btn(t('Show the plan'), 'btn-create'); go.type = 'submit';
  form.appendChild(go);
  body.appendChild(form);
  form.onsubmit = (e) => {
    e.preventDefault();
    const source = { id: nm.value.trim().toLowerCase(), uris: [uri.value.trim()], suites: suites.value.trim().split(/\s+/).filter(Boolean), components: comps.value.trim().split(/\s+/).filter(Boolean), key: key.value.trim() };
    if (!source.id || !source.uris[0] || !source.suites.length || !source.key) { showToast(t('Fill in the name, the address, the suite and the key address'), { type: 'error' }); return; }
    close();
    showInstallDialog(m, { what: 'app', request: { kind: 'source', source }, onDone });
  };
  setTimeout(() => nm.focus({ preventScroll: true }), 0);
  return { close };
}

/** "Let an agent help…" (owner D3) — a TEMPORARY helper conversation, through the existing new-session + first-message
 *  path: its first prompt is the user's request + the whole apps manual + this machine's facts (the server composes it).
 *  It can only PROPOSE; the user approves in For you or here. It is marked as a helper (not a standing conversation). */
export function openAgentHelp(app, m) {
  const { body, close } = createModalShell({ id: 'app-help-dialog', title: t('Let an agent help install an app'), dialogClass: 'desktop-install app-help', escapeToClose: true });
  body.appendChild(el('p', 'app-search-intro', t('Starts a temporary helper conversation that knows how to install apps on {machine}. It can only propose an install — you approve it in For you. Close it when it says done.', { machine: machineInSentence(m) })));
  const form = el('form', 'app-search-form');
  const input = el('input', 'app-search-input app-help-request'); input.type = 'text'; input.placeholder = t('What do you want to install? (e.g. an image editor that opens PSD files)'); input.autocomplete = 'off';
  input.setAttribute('aria-label', t('What do you want to install?'));
  const go = btn(t('Start the helper'), 'btn-create'); go.type = 'submit';
  form.append(input, go);
  body.appendChild(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const request = input.value.trim();
    go.disabled = true;
    const r = await fetchJson(`/api/apps/helper-prompt?${q({ host: m.hostId, q: request })}`);
    if (!r || r.error || !r.prompt) { go.disabled = false; showToast(t('Could not start the helper: {why}', { why: (r && r.error) || t('server unreachable') }), { type: 'error' }); return; }
    close();
    if (typeof app.createSession !== 'function') { showToast(t('Could not start the helper: {why}', { why: 'no session' }), { type: 'error' }); return; }
    app.createSession({ cwd: '', name: t('App install helper'), mode: 'chat', backend: 'claude', hostId: m.hostId && m.hostId !== 'local' ? m.hostId : undefined, initialMessage: r.prompt,
      onCreateResult: async (okd, msg) => {
        if (!okd || !msg || !msg.sessionId) return;
        const h = await fetchJson('/api/apps/helpers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: m.hostId, sessionId: msg.sessionId, request }) });
        if (!h || h.error) showToast(t('The helper started, but it could not be marked as a helper: {why}', { why: (h && h.error) || t('server unreachable') }), { type: 'error' });
      } });
  };
  setTimeout(() => input.focus({ preventScroll: true }), 0);
  return { close };
}

export { machineName };

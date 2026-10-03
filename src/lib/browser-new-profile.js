// THE NEW PROFILE… DIALOG (lane browser-admin, 2026-10-01 — the owner: "不能手动创建profile"). ONE dialog, two doors:
// the Agent browser panel's "New profile…" and a conversation's picker rows "New persistent profile…" (which open it
// with the conversation's name prefilled and POST to the adopt route, so the conversation's own browser — and on the
// per-conversation-directory rung its logins — become the profile, exactly as before).
//
//   · name · the browser (every provider a row: its verdict for the chosen machine, in words; CloakBrowser offered once
//     installed, else its Install… behind the download confirm) · the machine (this one / a paired machine, greyed WITH
//     the reason when the browser cannot run there) · the Chrome build (lane browser-admin 2a) · who can use it (THE
//     principal picker; default every conversation — owner ruling A);
//   · ONE POST with the fields (the existing route), a refusal said by its CODE beside the footer, the panel's list
//     gains the row in place (its keyed rows) and the new row is focused.
//
// The arithmetic is PURE (src/lib/browser-new-profile-model.js); the words are the device's t().
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell, showConfirmDialog, copyText } from './utils.js';
import { btn, el, noteLine, noteText } from './channel-chrome.js';
import { principalPicker } from './principal-picker.js';
import { folderTail } from './principal-picker-model.js';
import { pickerRows, draftWho, EVERYONE_KEY } from './browser-who-model.js';
import { nameHelpers } from './browser-who-dialog.js';
import { installConfirmWords, installOutcomeWords } from './browser-switcher-model.js';
import { providerChoices, machineChoices, createBody, createRefusalWords, adoptFormOf } from './browser-new-profile-model.js';
import { buildRows, choiceOfRow, installHint, buildRefusalWords } from './browser-build-model.js'; // lane browser-admin 2a: the build section
import { downloadRow, mountDownloadPicker } from './browser-build-dialog.js'; // lane chrome-builds-download: "Download another build…"

const DIALOG_ID = 'browser-new-profile-dialog';
const jsonPost = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

/**
 * Open the dialog. `{label, fromSession, onCreated}` — `fromSession` = a live session row (the picker's door): the
 * POST goes to the adopt route with its id, and on the per-conversation-directory rung (`browserVariant === 'C'`) the
 * browser and machine are the conversation's own (said, not offered). Returns the handle (the heavy suite drives it).
 */
export function openNewProfileDialog(app, { label = '', fromSession = null, onCreated = null, onDismissed = null } = {}) {
  const adopt = adoptFormOf(fromSession); // verify r1 (F7): the server's plan (the picker asked it), never the rung's guess
  const st = { providers: [], install: null, machines: [{ hostId: 'local' }], hostRows: null, provider: 'chromium', host: null, busy: false, closed: false, created: false, handoff: false, builds: null, buildsFor: undefined, buildKey: 'default', buildHint: null };
  const names = nameHelpers(app);
  const sb = (app && app.sidebar) || {};
  const shell = createModalShell({ id: DIALOG_ID, title: adopt ? t('New persistent profile') : t('New profile'), dialogClass: 'bwho-dialog bnew-dialog', bodyClass: 'bwho-body bnew-body', escapeToClose: true,
    onClose: () => { st.closed = true; try { picker.close(); } catch { /* none */ } try { app.ws?.offGlobal?.(onGlobal); } catch { /* none */ } if (!st.created && !st.handoff) { try { onDismissed?.(); } catch { /* none */ } } } }); // (verify r3: a handoff to the reopened dialog is no dismissal)
  const body = shell.body;

  // ── the name ──
  const nameRow = el('label', 'bnew-field');
  nameRow.appendChild(el('span', 'bnew-field-head', t('Name')));
  const nameInput = document.createElement('input');
  nameInput.type = 'text'; nameInput.className = 'bnew-label'; nameInput.maxLength = 80; nameInput.value = String(label || '');
  nameInput.placeholder = t('e.g. Work account');
  nameInput.setAttribute('aria-label', t('Name'));
  nameRow.appendChild(nameInput);
  body.appendChild(nameRow);

  // ── the browser + the machine (an adopted directory keeps both: said, not offered) ──
  const provWrap = el('div', 'bnew-section');
  const machWrap = el('div', 'bnew-section');
  const portRow = el('label', 'bnew-field bnew-port-row');
  const portInput = document.createElement('input');
  portInput.type = 'text'; portInput.inputMode = 'numeric'; portInput.className = 'bnew-port'; portInput.placeholder = '9222';
  portRow.append(el('span', 'bnew-field-head', t('Debugging port')), portInput);
  if (adopt === 'keep') {
    body.appendChild(el('div', 'bnew-keep chat-status-dim', t("Keeps this conversation's browser and its logins — Chromium on this computer.")));
  } else {
    // verify r2 (H3): the empty form says so too — the picker's row no longer claims either
    if (adopt === 'empty') body.appendChild(el('div', 'bnew-keep chat-status-dim', t("A new, empty profile — this conversation's own browser is not moved; you sign in once in the new one.")));
    provWrap.appendChild(el('div', 'bnew-section-head', t('Browser')));
    const provList = el('div', 'bwho-answers bnew-providers'); provList.setAttribute('role', 'radiogroup'); provList.setAttribute('aria-label', t('Browser'));
    provWrap.appendChild(provList);
    provWrap.appendChild(portRow);
    machWrap.appendChild(el('div', 'bnew-section-head', t('Runs on')));
    const machList = el('div', 'bwho-answers bnew-machines'); machList.setAttribute('role', 'radiogroup'); machList.setAttribute('aria-label', t('Runs on'));
    machWrap.appendChild(machList);
    body.append(provWrap, machWrap);
  }
  // ── lane browser-admin 2a: the Chrome build (a Chromium profile only; the chosen machine's builds) ──
  const buildWrap = el('div', 'bnew-section bnew-builds-wrap');
  const buildList = el('div', 'bwho-answers bnew-builds'); buildList.setAttribute('role', 'radiogroup'); buildList.setAttribute('aria-label', t('Chrome build'));
  const buildHint = el('div', 'bbuild-hint chat-status-dim');
  buildWrap.append(el('div', 'bnew-section-head', t('Chrome build')), buildList, buildHint);
  // lane chrome-builds-download: the picker opens in the build section (the rows step aside); a landed build comes back picked
  const buildPicker = el('div', 'bbuild-picker'); buildPicker.style.display = 'none'; buildWrap.appendChild(buildPicker);
  let buildPick = null;
  const openBuildPicker = () => { buildList.style.display = 'none'; buildHint.style.display = 'none'; buildPicker.style.display = ''; buildPick = mountDownloadPicker(buildPicker, { onBack: () => closeBuildPicker(), onDownloaded: (v) => { closeBuildPicker(); st.buildKey = 'v:' + v; st.buildsFor = undefined; loadBuilds(); } }); };
  const closeBuildPicker = () => { buildPick?.stop(); buildPick = null; buildPicker.replaceChildren(); buildPicker.style.display = 'none'; buildList.style.display = ''; drawBuilds(); };
  let buildPath = null;
  if (adopt !== 'keep') body.appendChild(buildWrap);

  // ── who can use it (THE principal picker, as in the who dialog) ──
  const whoHead = el('div', 'bnew-section-head', t('Who can use it'));
  // ONE control, as in "Who can use it" (lane everyone-principal, folded in at the 2.369.202 integration — the two radios
  // "All my conversations" / "Only these" are gone): THE principal picker, ALL AGENTS first and picked by default
  // (= the profile's `use.mode:'all'`); the sentence above it says what the pick means
  const meaning = el('div', 'bwho-meaning agents-note');
  body.append(whoHead, meaning);
  let model = null;
  const rowsNow = () => {
    model = pickerRows({ use: { mode: 'all' }, usedBy: [] }, {
      sessions: (sb._webuiSessions || []).map((s) => ({ ...s, name: names.nameOfLive(s) || s.name })),
      groups: sb._tasks || [], groupsOfSession: (s) => (typeof sb._getSessionTaskGroups === 'function' ? sb._getSessionTaskGroups(s) || [] : []),
      folderTail, nameOfConversation: names.nameOfConversation, t,
    });
    return model.rows;
  };
  rowsNow();
  // the picker's door: the conversation that asked is the first pick when the list is narrowed
  const initial = fromSession && fromSession.webuiId ? [`session:${fromSession.webuiId}`].filter((k) => model.wire.has(k)) : [];
  const pickWrap = el('div', 'bwho-pick');
  const picker = principalPicker({ items: () => rowsNow(), app, multi: true, selected: [...model.selected, ...initial],
    placeholder: t('Add a conversation or Task Group…'), label: t('Who can use it'),
    emptyText: t('No conversation is running and there is no Task Group to pick'),
    everyone: { key: EVERYONE_KEY },
    onChange: () => syncWho() });
  pickWrap.appendChild(picker.el);
  body.appendChild(pickWrap);
  const whoMode = () => (picker.selected().includes(EVERYONE_KEY) ? 'all' : 'only');
  const syncWho = () => {
    const sentence = whoMode() === 'all'
      ? t('Any of your conversations can use this browser and its logins — one browser, each conversation in its own tab.')
      : t('Pick conversations and Task Groups. A Task Group means every conversation in it — bound to it or started in its folders — now or later.');
    if (meaning.textContent !== sentence) meaning.textContent = sentence;
  };
  syncWho();

  // ── the refusal line + the footer ──
  const refusal = noteLine('bwho-refusal bnew-refusal', '', { warn: true });
  refusal.style.display = 'none';
  const notes = el('div', 'bwho-notes'); notes.appendChild(refusal);
  const footer = el('div', 'dialog-footer bwho-footer');
  const cancel = btn(t('Cancel'), () => shell.close(), 'bnew-cancel');
  const create = btn(adopt ? t('Create and use it here') : t('Create'), () => doCreate(), 'mounts-btn-primary bnew-create');
  footer.append(cancel, create);
  shell.dialog.append(notes, footer);
  const say = (text) => { noteText(refusal, text || ''); refusal.style.display = text ? '' : 'none'; notes.style.display = text ? '' : 'none'; };
  say('');

  // ── drawing the two lists (keyed by id: a re-draw after a broadcast patches the rows, the choice stays) ──
  function providerRowsNow() {
    const rows = st.host ? (st.hostRows || st.providers) : st.providers;
    return providerChoices({ providers: rows, install: st.install, host: st.host, t });
  }
  function drawProviders() {
    if (adopt === 'keep') return;
    const list = provWrap.querySelector('.bnew-providers');
    const choices = providerRowsNow();
    if (!choices.some((c) => c.id === st.provider && c.pickable)) st.provider = (choices.find((c) => c.pickable) || { id: 'chromium' }).id;
    const keep = new Map([...list.children].map((n) => [n.dataset.provider, n]));
    const order = [];
    for (const c of choices) {
      let row = keep.get(c.id);
      if (!row) {
        row = el('label', 'bwho-answer bnew-provider'); row.dataset.provider = c.id;
        const input = document.createElement('input'); input.type = 'radio'; input.name = 'bnew-provider'; input.value = c.id; input.className = 'bwho-radio';
        input.onchange = () => { st.provider = c.id; drawProviders(); drawMachines(); drawBuilds(); };
        const text = el('span', 'bwho-answer-text');
        text.append(el('span', 'bwho-answer-head'), el('span', 'bwho-answer-sub bnew-blurb'), el('span', 'bwho-answer-sub bnew-note'));
        row.append(input, text);
      }
      const input = row.querySelector('input');
      input.disabled = !c.pickable; input.checked = c.pickable && c.id === st.provider;
      row.classList.toggle('is-off', !c.pickable);
      row.dataset.state = c.state;
      const [head, blurb, note] = row.querySelectorAll('.bwho-answer-text > span');
      if (head.textContent !== c.name) head.textContent = c.name;
      const bl = c.blurb || ''; if (blurb.textContent !== bl) blurb.textContent = bl; blurb.style.display = bl ? '' : 'none';
      const nt = c.note || ''; if (note.textContent !== nt) note.textContent = nt; note.style.display = nt ? '' : 'none';
      // CloakBrowser not installed: its ONE step, behind the download confirm (the switch dialog's / Manage agents' words)
      let ib = row.querySelector('.bnew-install');
      if (c.offer && !ib) { ib = btn('', () => installCloak(), 'bnew-install'); row.querySelector('.bwho-answer-text').appendChild(ib); }
      if (ib) { ib.style.display = c.offer ? '' : 'none'; ib.textContent = c.offer === 'install-again' ? t('Install again…') : t('Install…'); }
      order.push(row);
    }
    list.replaceChildren(...order);
    portRow.style.display = st.provider === 'cdp' ? '' : 'none';
  }
  function drawMachines() {
    if (adopt === 'keep') return;
    const list = machWrap.querySelector('.bnew-machines');
    const chosen = (st.hostRows || []).find((r) => r && r.id === st.provider);
    const choices = machineChoices({ machines: st.machines, providerOnHost: chosen ? (chosen.onHost || null) : null, ready: st.ready || null, t });
    if (!choices.some((m) => m.hostId === st.host && m.pickable)) st.host = null;
    const keep = new Map([...list.children].map((n) => [n.dataset.host, n]));
    const order = [];
    for (const m of choices) {
      const key = m.hostId || 'local';
      let row = keep.get(key);
      if (!row) {
        row = el('label', 'bwho-answer bnew-machine'); row.dataset.host = key;
        const input = document.createElement('input'); input.type = 'radio'; input.name = 'bnew-machine'; input.value = key; input.className = 'bwho-radio';
        input.onchange = () => { st.host = m.hostId; drawProviders(); drawMachines(); loadBuilds(); };
        const text = el('span', 'bwho-answer-text'); text.append(el('span', 'bwho-answer-head'), el('span', 'bwho-answer-sub bnew-note'));
        row.append(input, text);
      }
      const input = row.querySelector('input');
      input.disabled = !m.pickable; input.checked = m.pickable && (m.hostId || null) === (st.host || null);
      row.classList.toggle('is-off', !m.pickable);
      row.dataset.state = m.state;
      const [head, note] = row.querySelectorAll('.bwho-answer-text > span');
      if (head.textContent !== m.name) head.textContent = m.name;
      const nt = m.note || ''; if (note.textContent !== nt) note.textContent = nt; note.style.display = nt ? '' : 'none';
      // lane remote-profile-start: no browser there — the ONE command for that machine, shown and copyable
      let sp = row.querySelector('.bnew-step');
      if (m.step && !sp) { sp = el('span', 'bwho-answer-sub bnew-step'); const code = el('code', 'bnew-step-cmd'); const cp = btn(t('Copy'), () => { copyText(code.textContent || ''); showToast(t('Copied'), { duration: 2000 }); }, 'bnew-step-copy'); sp.append(code, ' ', cp); row.querySelector('.bwho-answer-text').appendChild(sp); }
      if (sp) { sp.style.display = m.step ? '' : 'none'; const code = sp.querySelector('.bnew-step-cmd'); const cmd = m.step ? m.step.command : ''; if (code.textContent !== cmd) code.textContent = cmd; }
      order.push(row);
    }
    list.replaceChildren(...order);
    // one machine (this one) says nothing worth a choice — the section is shown only when there is something to pick
    machWrap.style.display = choices.length > 1 ? '' : 'none';
  }

  function drawBuilds() {
    if (adopt === 'keep') return;
    const show = st.provider === 'chromium';
    buildWrap.style.display = show ? '' : 'none';
    if (!show) return;
    const rows = buildRows(st.builds, { choice: null, local: !st.host, machine: st.host || '', t, download: st.buildDownload || null });
    if (!rows.some((r) => r.key === st.buildKey && r.pickable)) st.buildKey = 'default';
    const keep = new Map([...buildList.children].map((n) => [n.dataset.key, n]));
    const order = [];
    for (const r of rows) {
      let row = keep.get(r.key);
      if (r.kind === 'note') { if (!row) { row = el('div', 'bbuild-note chat-status-dim'); row.dataset.key = r.key; } if (row.textContent !== r.label) row.textContent = r.label; order.push(row); continue; }
      if (r.kind === 'download') { order.push(row || downloadRow(r, openBuildPicker)); continue; }
      if (!row) {
        row = el('label', 'bwho-answer bnew-build'); row.dataset.key = r.key;
        const input = document.createElement('input'); input.type = 'radio'; input.name = 'bnew-build'; input.value = r.key; input.className = 'bwho-radio';
        input.onchange = () => { st.buildKey = r.key; if (r.kind === 'path' && buildPath) buildPath.focus(); };
        const text = el('span', 'bwho-answer-text'); text.append(el('span', 'bwho-answer-head'), el('span', 'bwho-answer-sub bnew-note'));
        if (r.kind === 'path') { buildPath = document.createElement('input'); buildPath.type = 'text'; buildPath.className = 'bbuild-path'; buildPath.placeholder = '/opt/chrome/chrome'; buildPath.addEventListener('focus', () => { st.buildKey = 'path'; const i = row.querySelector('input[type=radio]'); if (i) i.checked = true; }); text.appendChild(buildPath); }
        row.append(input, text);
      }
      const input = row.querySelector('input[type=radio]');
      input.disabled = !r.pickable; input.checked = r.pickable && r.key === st.buildKey;
      row.classList.toggle('is-off', !r.pickable);
      const [head, note] = row.querySelectorAll('.bwho-answer-text > span');
      if (head.textContent !== r.label) head.textContent = r.label;
      const nt = r.note || ''; if (note.textContent !== nt) note.textContent = nt; note.style.display = nt ? '' : 'none';
      order.push(row);
    }
    buildList.replaceChildren(...order);
    const h = installHint({ command: st.buildHint, local: !st.host, download: st.buildDownload || null }, t) || '';
    if (buildHint.textContent !== h) buildHint.textContent = h;
    buildHint.style.display = h ? '' : 'none';
  }
  /** the chosen machine's builds (asked again when the machine changes; a paired machine's through its agent) */
  async function loadBuilds() {
    if (adopt === 'keep') return;
    const h = st.host || null;
    if (st.buildsFor === h) { drawBuilds(); return; }
    st.buildsFor = h;
    const r = await fetchJson('/api/browser/builds' + (h ? `?host=${encodeURIComponent(h)}` : ''));
    if (st.closed || st.buildsFor !== h) return;
    st.builds = r && !r.error ? r.listing : (r && r.code ? { ok: false, code: r.code, error: r.error } : null);
    st.buildHint = r && !r.error ? r.installCommand : null;
    st.buildDownload = r && !r.error ? r.download || null : null;
    drawBuilds();
  }
  async function installCloak() {
    const iv = st.install;
    if (!(await showConfirmDialog({ ...installConfirmWords('CloakBrowser', t, iv) }))) return;
    const r = await fetchJson('/api/browser/install', jsonPost({}));
    const o = installOutcomeWords(r, { t, name: 'CloakBrowser' });
    showToast(o.text, { type: o.tone === 'error' ? 'error' : o.tone === 'warn' ? 'warn' : 'info', duration: 9000 });
    await loadFacts();
  }
  async function loadFacts() {
    const [pv, iv, mv] = await Promise.all([fetchJson('/api/browser/providers'), fetchJson('/api/browser/install'), fetchJson('/api/desktop/machines')]);
    if (st.closed) return;
    st.providers = pv && Array.isArray(pv.providers) ? pv.providers : [];
    st.install = iv && !iv.error ? iv : null;
    st.machines = mv && Array.isArray(mv.machines) ? mv.machines : [{ hostId: 'local' }];
    // a paired machine's verdicts (the structural rules — a key that cannot leave this computer, a browser with no remote
    // transport — are the same on every paired machine): asked once, of the first machine that could run one
    const remote = st.machines.find((m) => m && m.hostId && m.hostId !== 'local');
    if (remote) { const hv = await fetchJson(`/api/browser/providers?host=${encodeURIComponent(remote.hostId)}`); if (st.closed) return; st.hostRows = hv && Array.isArray(hv.providers) ? hv.providers : null; }
    // lane remote-profile-start: can a browser run on each paired machine at all (its CLI, a Chrome) — its own answer, asked once per open
    const serving = st.machines.filter((m) => m && m.hostId && m.hostId !== 'local' && m.connected && Array.isArray(m.capabilities) && m.capabilities.includes('browser-serve'));
    if (serving.length) { const rs = await Promise.all(serving.map((m) => fetchJson(`/api/browser/builds?host=${encodeURIComponent(m.hostId)}`))); if (st.closed) return; st.ready = {}; serving.forEach((m, i) => { const r = rs[i]; if (r && !r.error && r.ready) st.ready[m.hostId] = r.ready; }); }
    if (!st.providers.length && !(pv && pv.error)) st.providers = [{ id: 'chromium', control: { ok: true } }];
    if (pv && pv.error) say(t('Could not read which browsers this VibeSpace offers — {reason}', { reason: String(pv.error) }));
    drawProviders(); drawMachines(); loadBuilds();
  }
  const onGlobal = (m) => { if (!st.closed && m && m.type === 'browser-profiles-updated') loadFacts(); };
  app.ws?.onGlobal?.(onGlobal);

  async function doCreate() {
    if (st.busy) return;
    const sel = picker.selected();
    const who = whoMode() === 'only' ? draftWho(sel, model.wire) : [];
    // lane browser-admin 2a: the build chosen for a Chromium profile (a path row with no absolute path is said, nothing sent)
    let browser = null;
    if (adopt !== 'keep' && st.provider === 'chromium' && st.buildKey !== 'default') {
      const row = buildRows(st.builds, { choice: null, local: !st.host, t }).find((r) => r.key === st.buildKey);
      browser = choiceOfRow(row, buildPath ? buildPath.value : '');
      if (!browser) { say(buildRefusalWords({ code: 'browser_choice_invalid' }, t)); if (buildPath) buildPath.focus(); return; }
    }
    const c = createBody({ label: nameInput.value, provider: st.provider, host: st.host, cdpPort: portInput.value, mode: whoMode(), who, adopt, browser });
    if (!c.ok) { say(createRefusalWords({ code: c.code }, t)); (c.field === 'label' ? nameInput : c.field === 'cdpPort' ? portInput : picker).focus(); return; }
    st.busy = true; create.disabled = true; cancel.disabled = true; picker.setBusy(true);
    const r = fromSession
      ? await fetchJson('/api/browser/adopt', jsonPost({ sessionId: fromSession.webuiId, ...c.body }))
      : await fetchJson('/api/browser/profiles', jsonPost(c.body));
    if (st.closed) return;
    st.busy = false; create.disabled = false; cancel.disabled = false; picker.setBusy(false);
    if (!r || r.error) {
      // verify r3 (Y4): the conversation's browser changed since this dialog drew its form (409 adopt_form_changed) — the
      // dialog is REOPENED on the form the server names now (`now`), the typed name kept, the same doors; never left on a
      // form every Create would refuse again (the user had to Cancel and find the row himself)
      if (r && r.code === 'adopt_form_changed' && fromSession && (r.now === 'keep' || r.now === 'empty')) {
        showToast(createRefusalWords(r, t), { type: 'warn', duration: 8000 });
        st.handoff = true; shell.close();
        openNewProfileDialog(app, { label: nameInput.value, fromSession: { ...fromSession, adoptKeeps: r.now === 'keep' }, onCreated, onDismissed });
        return;
      }
      say(createRefusalWords(r, t) || buildRefusalWords(r, t) || (t('Could not create the profile') + ' — ' + ((r && r.error) || t('server unreachable'))));
      if (r && (r.code === 'label_required' || r.code === 'label_taken')) nameInput.focus();
      return;
    }
    const lbl = String((r.profile && r.profile.label) || c.body.label);
    showToast(fromSession
      ? (r.adopted ? t('{label} keeps this conversation\'s logins — every conversation you allowed can use it', { label: lbl }) : t('{label} was created empty — the agent\'s next browser command opens it and you sign in there once', { label: lbl }))
      : t('Created {label}', { label: lbl }), { duration: 7000 });
    st.created = true;
    shell.close();
    try { onCreated?.(r.profile || null, r); } catch (e) { console.warn('[browser] new profile onCreated', e); }
  }
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); doCreate(); } });
  drawProviders(); drawMachines(); drawBuilds();
  loadFacts();
  setTimeout(() => { try { nameInput.focus(); nameInput.select(); } catch { /* none */ } }, 0);
  return { shell, picker, create: doCreate, close: () => shell.close(), state: () => ({ provider: st.provider, host: st.host, adopt, build: st.buildKey }) };
}

// CHANGE BUILD… — which Chrome build a profile runs (lane browser-admin 2a, 2026-10-01 — the owner: "不能pin指定版本").
// Opened from the Agent browser panel row and from the switch dialog's build line. Drawn from a FRESH
// GET /api/browser/profiles/:id/builds (the profile's machine's builds, its choice, the build its browser runs, who
// would be told); ONE POST /api/browser/profiles/:id/build {choice, confirmed?}. Every build is a row (one that cannot run
// greyed WITH its reason); a running browser restarts — the sentence above the button says so and who is told; a build
// nobody can judge against the profile's last Chrome asks one tick ("use it anyway"); a refusal is said by its CODE.
// How to ADD a build is said as the command the user runs (installing a Chrome build is held for a later lane).
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';
import { btn, el, noteLine, noteText } from './channel-chrome.js';
import { buildRows, choiceOfRow, choiceWords, cardBuildLine, changeSentences, installHint, changedWords, buildRefusalWords } from './browser-build-model.js';

const DIALOG_ID = 'browser-build-dialog';

export async function openBuildDialog(app, profileId, { label = '', onDone = null } = {}) {
  const id = String(profileId || '');
  const view = await fetchJson(`/api/browser/profiles/${encodeURIComponent(id)}/builds`);
  if (!view || view.error) { showToast(t('Could not read the Chrome builds') + ' — ' + ((view && view.error) || t('server unreachable')), { type: 'error', duration: 9000 }); return null; }
  const name = String(view.label || label || id);
  const local = !view.host;
  const st = { busy: false, closed: false, picked: null, confirm: false };
  const shell = createModalShell({ id: DIALOG_ID, title: t('Chrome build for {label}', { label: name }), dialogClass: 'bwho-dialog bbuild-dialog', bodyClass: 'bwho-body bbuild-body', escapeToClose: true, onClose: () => { st.closed = true; } });
  shell.dialog.dataset.profileId = id;
  const body = shell.body;
  const now = cardBuildLine({ provider: view.provider, choice: view.choice, running: view.running, missing: view.missing, live: view.live }, t);
  if (now) body.appendChild(el('div', 'bbuild-now' + (now.warn ? ' chan-warn' : ''), now.text));
  const rows = buildRows(view.listing, { choice: view.choice, lastChromiumMajor: view.lastChromiumMajor, local, machine: view.host || '', t });
  const list = el('div', 'bwho-answers bbuild-rows'); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', t('Chrome build'));
  let pathInput = null;
  for (const r of rows) {
    if (r.kind === 'note') { list.appendChild(el('div', 'bbuild-note chat-status-dim', r.label)); continue; }
    const row = el('label', 'bwho-answer bbuild-row' + (r.pickable ? '' : ' is-off')); row.dataset.key = r.key;
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'bbuild'; input.value = r.key; input.className = 'bwho-radio';
    input.disabled = !r.pickable; input.checked = r.current && r.pickable;
    if (input.checked) st.picked = r;
    input.onchange = () => { st.picked = r; st.confirm = false; syncConfirm(); say(''); if (r.kind === 'path' && pathInput) pathInput.focus(); };
    const text = el('span', 'bwho-answer-text');
    text.appendChild(el('span', 'bwho-answer-head', r.current ? t('{build} · in use now', { build: r.label }) : r.label));
    if (r.note) text.appendChild(el('span', 'bwho-answer-sub', r.note));
    if (r.kind === 'path') {
      pathInput = document.createElement('input'); pathInput.type = 'text'; pathInput.className = 'bbuild-path'; pathInput.placeholder = '/opt/chrome/chrome'; pathInput.value = r.path || '';
      pathInput.addEventListener('focus', () => { if (!input.checked) { input.checked = true; st.picked = r; } });
      text.appendChild(pathInput);
    }
    row.append(input, text);
    list.appendChild(row);
  }
  body.appendChild(list);
  const hint = installHint({ command: view.installCommand, local }, t);
  if (hint) body.appendChild(el('div', 'bbuild-hint chat-status-dim', hint));
  for (const s of changeSentences({ live: view.live, holders: view.holders, driven: view.driven || null }, t)) body.appendChild(el('div', 'bbuild-change' + (s.warn ? ' chan-warn' : ''), s.text));
  // "use it anyway" — shown only after the server said it cannot judge the ladder (downgrade_unknown)
  const confirmRow = el('label', 'bbuild-confirm');
  const confirmBox = document.createElement('input'); confirmBox.type = 'checkbox';
  confirmBox.onchange = () => { st.confirm = confirmBox.checked; };
  confirmRow.append(confirmBox, document.createTextNode(' ' + t('Use it anyway')));
  confirmRow.style.display = 'none';
  body.appendChild(confirmRow);
  const syncConfirm = () => { if (!st.confirm) confirmBox.checked = false; };
  const refusal = noteLine('bwho-refusal bbuild-refusal', '', { warn: true });
  const notes = el('div', 'bwho-notes'); notes.appendChild(refusal);
  const say = (text) => { noteText(refusal, text || ''); refusal.style.display = text ? '' : 'none'; notes.style.display = text ? '' : 'none'; };
  say('');
  const footer = el('div', 'dialog-footer bwho-footer');
  const cancel = btn(t('Cancel'), () => shell.close(), 'bbuild-cancel');
  const change = btn(view.live ? t('Change and restart') : t('Change'), () => doChange(), 'mounts-btn-primary bbuild-change-btn');
  footer.append(cancel, change);
  shell.dialog.append(notes, footer);

  async function doChange() {
    if (st.busy) return;
    const choice = choiceOfRow(st.picked, pathInput ? pathInput.value : '');
    if (!choice) { say(st.picked && st.picked.kind === 'path' ? buildRefusalWords({ code: 'browser_choice_invalid' }, t) : t('Pick a build.')); return; }
    st.busy = true; change.disabled = true; cancel.disabled = true;
    const r = await fetchJson(`/api/browser/profiles/${encodeURIComponent(id)}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice, ...(st.confirm ? { confirmed: true } : {}) }) });
    if (st.closed) return;
    st.busy = false; change.disabled = false; cancel.disabled = false;
    if (!r || r.error) {
      if (r && r.code === 'downgrade_unknown') confirmRow.style.display = '';
      const w = buildRefusalWords(r, t);
      say((w || (t('Could not change the build') + ' — ' + ((r && r.error) || t('server unreachable')))) + (r && r.restored === false ? ' ' + t('The browser did not start again — its next command starts it.') : ''));
      return;
    }
    showToast(changedWords({ label: name, to: r.to || choice, restarted: !!r.restarted, told: Array.isArray(r.told) ? r.told.length : 0 }, t), { duration: 7000 });
    shell.close();
    try { onDone?.(r); } catch (e) { console.warn('[browser] build dialog onDone', e); }
  }
  return { shell, change: doChange, close: () => shell.close(), view, words: { choice: choiceWords(view.choice, t) } };
}

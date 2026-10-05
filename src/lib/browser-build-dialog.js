// CHANGE BUILD… — which Chrome build a profile runs (lane browser-admin 2a, 2026-10-01 — the owner: "不能pin指定版本").
// Opened from the Agent browser panel row and from the switch dialog's build line. Drawn from a FRESH
// GET /api/browser/profiles/:id/builds (the profile's machine's builds, its choice, the build its browser runs, who
// would be told); ONE POST /api/browser/profiles/:id/build {choice, confirmed?}. Every build is a row (one that cannot run
// greyed WITH its reason); a running browser restarts — the sentence above the button says so and who is told; a build
// nobody can judge against the profile's last Chrome asks one tick ("use it anyway"); a refusal is said by its CODE.
// How to ADD a build is said as the command the user runs (installing a Chrome build is held for a later lane).
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell, showConfirmDialog } from './utils.js';
import { btn, el, noteLine, noteText } from './channel-chrome.js';
import { buildRows, choiceOfRow, choiceWords, cardBuildLine, changeSentences, installHint, changedWords, buildRefusalWords,
  pickerIntro, channelLabel, majorLabel, verdictLines, downloadConfirmWords, downloadRefusalWords, downloadProgressWords, installedWords, freeWords, removeConfirmWords, removedWords } from './browser-build-model.js';

const DIALOG_ID = 'browser-build-dialog';

export async function openBuildDialog(app, profileId, { label = '', onDone = null, pick = null } = {}) {
  const id = String(profileId || '');
  const view = await fetchJson(`/api/browser/profiles/${encodeURIComponent(id)}/builds`);
  if (!view || view.error) { showToast(t('Could not read the Chrome builds') + ' — ' + ((view && view.error) || t('server unreachable')), { type: 'error', duration: 9000 }); return null; }
  const name = String(view.label || label || id);
  const local = !view.host;
  const st = { busy: false, closed: false, picked: null, confirm: false, picker: null };
  const shell = createModalShell({ id: DIALOG_ID, title: t('Chrome build for {label}', { label: name }), dialogClass: 'bwho-dialog bbuild-dialog', bodyClass: 'bwho-body bbuild-body', escapeToClose: true, onClose: () => { st.closed = true; if (st.picker) st.picker.stop(); } });
  shell.dialog.dataset.profileId = id;
  const body = shell.body;
  const now = cardBuildLine({ buildChoice: view.buildChoice, choice: view.choice, running: view.running, missing: view.missing, live: view.live }, t);
  if (now) body.appendChild(el('div', 'bbuild-now' + (now.warn ? ' chan-warn' : ''), now.text));
  const rows = buildRows(view.listing, { choice: view.choice, lastChromiumMajor: view.lastChromiumMajor, local, machine: view.host || '', t, download: view.download || null });
  const list = el('div', 'bwho-answers bbuild-rows'); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', t('Chrome build'));
  let pathInput = null;
  for (const r of rows) {
    if (r.kind === 'note') { list.appendChild(el('div', 'bbuild-note chat-status-dim', r.label)); continue; }
    if (r.kind === 'download') { list.appendChild(downloadRow(r, () => openPicker())); continue; } // lane chrome-builds-download
    const row = el('label', 'bwho-answer bbuild-row' + (r.pickable ? '' : ' is-off')); row.dataset.key = r.key;
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'bbuild'; input.value = r.key; input.className = 'bwho-radio';
    input.disabled = !r.pickable; input.checked = pick ? r.pickable && r.key === 'v:' + pick : r.current && r.pickable;
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
  const hint = installHint({ command: view.installCommand, local, download: view.download || null }, t);
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
  // lane chrome-builds-download: the picker opens IN this dialog (the rows step aside); a finished download reopens Change build… with the new build picked
  const openPicker = () => { st.picker = pickerInDialog(body, [footer, notes], { profileId: id, onDownloaded: (v) => { shell.close(); openBuildDialog(app, id, { label, onDone, pick: v }); } }); };
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

/** THE PICKER IN A DIALOG: every other part of `body` (and `extra`, the footer + notes) steps aside while it is open; Back
 *  puts them back. → `{stop}`. */
function pickerInDialog(body, extra, { profileId = null, onDownloaded = null } = {}) {
  const box = el('div', 'bbuild-picker');
  const aside = [...body.children, ...extra].map((n) => [n, n.style.display]);
  for (const [n] of aside) n.style.display = 'none';
  body.appendChild(box);
  const back = () => { p.stop(); box.remove(); for (const [n, was] of aside) n.style.display = was; };
  const p = mountDownloadPicker(box, { profileId, onBack: back, onDownloaded });
  return p;
}

/** The "Download another build…" row (Change build… and New profile…'s build section): an act that opens the picker. */
export function downloadRow(r, open) {
  const row = el('div', 'bwho-answer bbuild-row bbuild-download'); row.dataset.key = r.key; row.setAttribute('role', 'button'); row.tabIndex = 0;
  const text = el('span', 'bwho-answer-text');
  text.appendChild(el('span', 'bwho-answer-head', r.label));
  if (r.note) text.appendChild(el('span', 'bwho-answer-sub', r.note));
  row.appendChild(text);
  row.onclick = () => open();
  row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  return row;
}
/**
 * THE PICKER (lane chrome-builds-download, design 004): Google's four channel rows (read FRESH when this opens — a person
 * opened it), "Older versions…" (majors → versions), every version's compatibility in words before anything downloads, the
 * builds on this computer with their sizes and Remove where allowed, the free space. Picking a row asks ONE HEAD (its size +
 * the disk row), then THE CONFIRM, then POST /api/browser/builds/download; the progress line polls the slot (no list is
 * re-read). `onDownloaded(version)` once the build landed. → `{stop}`.
 */
export function mountDownloadPicker(box, { profileId = null, onBack = null, onDownloaded = null } = {}) {
  const st = { stopped: false, busy: false, watching: null, timer: null, facts: null };
  const q = (extra = {}) => '/api/browser/builds/available?' + new URLSearchParams({ ...(profileId ? { profile: String(profileId) } : {}), ...extra }).toString();
  box.replaceChildren();
  const wrap = el('div', 'bdl-picker');
  wrap.appendChild(el('div', 'bdl-intro chat-status-dim', pickerIntro(t)));
  const progress = noteLine('bdl-progress', '', { warn: false }); progress.style.display = 'none';
  const again = btn(t('Try again'), () => { const v = st.watching; st.watching = null; if (v) pick({ version: v }); }, 'bdl-again'); again.style.display = 'none';
  const refusal = noteLine('bwho-refusal bdl-refusal', '', { warn: true }); refusal.style.display = 'none';
  const say = (text) => { noteText(refusal, text || ''); refusal.style.display = text ? '' : 'none'; };
  const list = el('div', 'bwho-answers bdl-rows'); list.appendChild(el('div', 'bbuild-note chat-status-dim', t("Reading Google's list…")));
  const olderBtn = btn(t('Older versions…'), () => loadOlder(), 'bdl-older-btn');
  const older = el('div', 'bwho-answers bdl-older');
  const installed = el('div', 'bwho-answers bdl-installed');
  const freeLine = el('div', 'bdl-free chat-status-dim');
  const footer = el('div', 'dialog-footer bwho-footer');
  footer.append(btn(t('Back'), () => { stop(); onBack?.(); }, 'bdl-back'));
  wrap.append(progress, again, refusal, list, olderBtn, older, el('div', 'bnew-section-head', t('On this computer')), installed, freeLine, footer);
  box.appendChild(wrap);
  function stop() { st.stopped = true; if (st.timer) clearTimeout(st.timer); st.timer = null; }
  function rowEl(item, head) {
    const v = item.verdict || {};
    const row = el('div', 'bwho-answer bdl-row' + (v.offer ? '' : ' is-off')); row.dataset.version = String(item.version || item.newest || '');
    const text = el('span', 'bwho-answer-text');
    text.appendChild(el('span', 'bwho-answer-head', head));
    for (const w of verdictLines(v, t)) text.appendChild(el('span', 'bwho-answer-sub bdl-chip' + (w.warn ? ' chan-warn' : ''), w.text));
    row.appendChild(text);
    if (v.offer) { row.setAttribute('role', 'button'); row.tabIndex = 0; row.onclick = () => pick(item); row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(item); } }; }
    return row;
  }
  function drawFacts(f) {
    st.facts = f;
    installed.replaceChildren();
    for (const b of f.installed || []) {
      const w = installedWords(b, t);
      const row = el('div', 'bwho-answer bdl-have'); row.dataset.version = b.version;
      const text = el('span', 'bwho-answer-text'); text.append(el('span', 'bwho-answer-head', t('Chrome {version}', { version: b.version })), el('span', 'bwho-answer-sub', w.text));
      row.appendChild(text);
      if (w.remove) row.appendChild(btn(t('Remove'), () => remove(b), 'bdl-remove'));
      installed.appendChild(row);
    }
    if (!(f.installed || []).length) installed.appendChild(el('div', 'bbuild-note chat-status-dim', t('No Chrome builds are installed there yet.')));
    const fw = freeWords(f, t) || ''; freeLine.textContent = fw; freeLine.style.display = fw ? '' : 'none';
    const p = downloadProgressWords(f.install, t);
    noteText(progress, p ? p.text : ''); progress.style.display = p ? '' : 'none'; progress.classList.toggle('chan-warn', !!(p && p.warn));
    again.style.display = p && p.failed && st.watching ? '' : 'none';
  }
  async function poll() {
    if (st.stopped || !box.isConnected) { stop(); return; }
    const f = await fetchJson(q());
    if (st.stopped) return;
    if (f && !f.error) {
      drawFacts(f);
      const i = f.install || {};
      if (!i.running && st.watching && i.done === st.watching) { const v = st.watching; st.watching = null; stop(); onDownloaded?.(v); return; }
      if (i.running && !st.watching && i.version) st.watching = i.version; // a download already running (the dialog was closed and reopened)
      if (!i.running && !i.other) { if (!(i.failed && st.watching)) st.watching = null; return; }
    }
    st.timer = setTimeout(poll, 1000);
  }
  async function pick(item) {
    if (st.busy || st.stopped) return;
    st.busy = true; say('');
    const h = await fetchJson(q({ version: String(item.version) }));
    st.busy = false;
    if (st.stopped) return;
    if (!h || h.error) { say(downloadRefusalWords(h, t) || ((h && h.error) || t('server unreachable'))); return; }
    if (h.verdict && !h.verdict.ok) { say(verdictLines(h.verdict, t).filter((x) => x.hard).map((x) => x.text).join(' ')); return; }
    if (!(await showConfirmDialog({ ...downloadConfirmWords({ version: String(item.version), host: h.host, bytes: h.bytes, root: h.root, becomesDefault: !!(h.verdict && (h.verdict.chips || []).some((c) => c.kind === 'default')) }, t) }))) return;
    if (st.stopped) return;
    const r = await fetchJson('/api/browser/builds/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: String(item.version) }) });
    if (st.stopped) return;
    if (!r || r.error) { say(downloadRefusalWords(r, t) || ((r && r.error) || t('server unreachable'))); return; }
    st.watching = String(item.version); again.style.display = 'none';
    if (st.timer) clearTimeout(st.timer);
    poll();
  }
  async function remove(b) {
    if (!(await showConfirmDialog({ ...removeConfirmWords(b, t) }))) return;
    const r = await fetchJson('/api/browser/builds/' + encodeURIComponent(b.version), { method: 'DELETE' });
    if (st.stopped) return;
    if (!r || r.error) { say(downloadRefusalWords(r, t) || ((r && r.error) || t('server unreachable'))); return; }
    showToast(removedWords(b.version, t), { duration: 5000 });
    const f = await fetchJson(q()); if (!st.stopped && f && !f.error) drawFacts(f);
  }
  async function loadOlder() {
    olderBtn.disabled = true; say('');
    const r = await fetchJson(q({ lists: 'older' }));
    if (st.stopped) return;
    olderBtn.disabled = false;
    if (!r || r.error) { say(downloadRefusalWords(r, t) || ((r && r.error) || t('server unreachable'))); return; }
    olderBtn.style.display = 'none';
    older.replaceChildren();
    for (const m of r.majors || []) {
      const row = rowEl({ ...m, version: m.newest }, majorLabel(m, t));
      row.classList.add('bdl-major'); row.dataset.major = String(m.major);
      const sub = el('div', 'bwho-answers bdl-versions');
      const head = row.querySelector('.bwho-answer-head');
      head.setAttribute('role', 'button'); head.tabIndex = 0;
      head.onclick = async (e) => { e.stopPropagation(); if (sub.childElementCount) { sub.replaceChildren(); return; } const rv = await fetchJson(q({ major: String(m.major) })); if (st.stopped) return; if (!rv || rv.error) { say(downloadRefusalWords(rv, t) || ((rv && rv.error) || t('server unreachable'))); return; } for (const v of rv.versions || []) sub.appendChild(rowEl(v, t('Chrome {version}', { version: v.version }))); };
      older.append(row, sub);
    }
  }
  (async () => {
    const f = await fetchJson(q());
    if (st.stopped) return;
    if (f && !f.error) { drawFacts(f); if (f.install && (f.install.running || f.install.other)) { if (f.install.running) st.watching = f.install.version; poll(); } }
    const c = await fetchJson(q({ lists: 'channels' }));
    if (st.stopped) return;
    list.replaceChildren();
    if (!c || c.error) { list.appendChild(el('div', 'bbuild-note chat-warn chan-warn', downloadRefusalWords(c, t) || ((c && c.error) || t('server unreachable')))); return; }
    for (const r of c.channels || []) list.appendChild(rowEl(r, channelLabel(r)));
  })();
  return { stop, pick };
}

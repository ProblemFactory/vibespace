// "WHO CAN USE IT" — THE DIALOG (2026-09-27; the owner: a profile for SEVERAL conversations and/or Task Groups, and
// the old native dropdown offered no Task Group and one choice). Opened by the Agent browser panel's "Change…" (one
// entry point); drawn from a FRESH `GET /api/browser/profiles/:id/use` — never the panel's broadcast copy (mirror-193:
// a list drawn a frame behind a write would overwrite the newer one) — and saved as ONE whole-list PATCH carrying the
// `base` stamp it read (409 list-changed ⇒ the sentence, and the dialog re-opens on the list as it is now).
//
//   · ONE control (lane everyone-principal, 2026-10-02 — the two radios "All my conversations" / "Only these" are gone):
//     THE principal picker (src/lib/principal-picker.js — chips above a search box, ALL AGENTS first, Recent, Task
//     Groups, sessions under their Task Group, Other; keyboard; rows patched in place on the roster broadcasts). ALL
//     AGENTS picked = `use.mode:'all'` (the default; the rows picked beside it are KEPT for when All is taken away);
//     otherwise every Task Group, every live local agent session (by its webui id — the server resolves it to the
//     conversation's browser key), and every row of the current list the roster does not cover (a stopped
//     conversation, a deleted Task Group), checked;
//   · the "will lose it" sentence, live from who uses it now vs the draft (no second confirm — the sentence IS the
//     warning); the empty list refused in place; Esc = the picker's own contract (a query first, then the dialog).
//
// The arithmetic is src/lib/browser-who-model.js (PURE); the words are the device's t(), by the server's CODE.
import { t } from './i18n.js';
import { fetchJson, showToast, createModalShell } from './utils.js';
import { btn, el, noteLine, noteText } from './channel-chrome.js';
import { principalPicker } from './principal-picker.js';
import { folderTail } from './principal-picker-model.js';
import { pickerRows, draftWho, draftUse, loseCount, saveWords, refusalWords, EVERYONE_KEY } from './browser-who-model.js';

const DIALOG_ID = 'browser-who-dialog';

/** The client's own names (the session cards' rule: the user's rename, else the harness's name, else the folder). */
export function nameHelpers(app) {
  const sb = (app && app.sidebar) || {};
  const display = (row) => {
    if (!row) return '';
    let custom = '';
    try { custom = typeof sb.getCustomName === 'function' ? sb.getCustomName(row) || '' : ''; } catch { custom = ''; }
    const folder = row.cwd ? String(row.cwd).replace(/\/+$/, '').split('/').pop() : '';
    return String(custom || row.name || row.webuiName || folder || '');
  };
  const all = () => (Array.isArray(sb._allSessions) ? sb._allSessions : []);
  return {
    /** A conversation (stopped or live) by its conversation id — '' when this client does not list it. */
    nameOfConversation: (cid) => { const c = String(cid || ''); if (!c) return ''; return display(all().find((x) => x && (x.sessionId === c || x.backendSessionId === c || x.claudeSessionId === c))); },
    /** A live session row (`_webuiSessions`) as the sidebar names it. */
    nameOfLive: (s) => display(all().find((x) => x && x.webuiId === s.id) || s),
    taskOf: (id) => { const g = (Array.isArray(sb._tasks) ? sb._tasks : []).find((x) => x && x.id === id); return g ? { title: String(g.title || g.name || ''), archived: !!g.archived } : null; },
  };
}

/**
 * Open the dialog for one profile. `{onSaved(answer)}` runs after a write the server accepted. Returns a promise of the
 * dialog handle (null when the fresh read failed — said to the user).
 */
export async function openWhoDialog(app, profileId, { onSaved = null, label = '' } = {}) {
  const id = String(profileId || '');
  const view = await fetchJson(`/api/browser/profiles/${encodeURIComponent(id)}/use`);
  if (!view || view.error) {
    showToast(t('Could not change who can use it') + ' — ' + ((view && view.error) || t('server unreachable')), { type: 'error', duration: 9000 });
    return null;
  }
  const names = nameHelpers(app);
  const title = String((view.profile && view.profile.label) || label || id);
  const sb = (app && app.sidebar) || {};
  let closed = false;
  const shell = createModalShell({ id: DIALOG_ID, title: t('Who can use {label}?', { label: title }), dialogClass: 'bwho-dialog', bodyClass: 'bwho-body', escapeToClose: true,
    onClose: () => { closed = true; try { picker.close(); } catch { /* none */ } } });
  shell.dialog.dataset.profileId = id;
  const body = shell.body;

  // what the pick MEANS, one sentence above the picker (rebuilt as the pick changes)
  const meaning = el('div', 'bwho-meaning agents-note');
  // the rows picked beside All agents are KEPT — said on their own line (a sentence of its own in every language)
  const keptLine = el('div', 'bwho-meaning bwho-kept agents-note');
  body.append(meaning, keptLine);

  // THE principal picker — ALL AGENTS first; its rows re-read on the roster's broadcasts (the picker's own subscription)
  let model = null;
  const rowsNow = () => {
    model = pickerRows(view, {
      sessions: (sb._webuiSessions || []).map((s) => ({ ...s, name: names.nameOfLive(s) || s.name })),
      groups: sb._tasks || [],
      groupsOfSession: (s) => (typeof sb._getSessionTaskGroups === 'function' ? sb._getSessionTaskGroups(s) || [] : []),
      folderTail, nameOfConversation: names.nameOfConversation, t,
    });
    return model.rows;
  };
  rowsNow();
  const initial = model.selected.slice();
  const pickWrap = el('div', 'bwho-pick');
  const picker = principalPicker({
    items: () => rowsNow(), app, multi: true, selected: initial,
    placeholder: t('Add a conversation or Task Group…'), label: t('Who can use it'),
    emptyText: t('No conversation is running and there is no Task Group to pick'),
    // ALL AGENTS = "every conversation of yours, now and later" — the profile's `all` (lane everyone-principal)
    everyone: { key: EVERYONE_KEY },
    onChange: () => refresh(),
  });
  pickWrap.appendChild(picker.el);
  const remoteLine = el('div', 'bwho-remote chat-status-dim', t('Conversations on other machines are not listed — the Agent browser runs on this machine only.'));
  pickWrap.appendChild(remoteLine);
  body.appendChild(pickWrap);
  // the two notes sit OUTSIDE the scrolling body, right above the footer (the naive-user verifier, 2026-09-28: on a phone
  // the list fills the body, and a note at its end was below the fold — the warning the Save button acts on, and the
  // refusal it just caused, must be on screen beside it)
  const lose = noteLine('bwho-lose', '', { warn: true });
  const refusal = noteLine('bwho-refusal', '', { warn: true });
  const notes = el('div', 'bwho-notes');
  notes.append(lose, refusal);
  const syncNotes = () => { notes.style.display = lose.style.display === 'none' && refusal.style.display === 'none' ? 'none' : ''; };

  // the footer: Cancel · Save (house text buttons; Save the ONE primary)
  const footer = el('div', 'dialog-footer bwho-footer');
  const cancel = btn(t('Cancel'), () => shell.close());
  const save = btn(t('Save'), () => doSave(), 'mounts-btn-primary');
  footer.append(cancel, save);
  shell.dialog.append(notes, footer);

  const mode = () => (picker.selected().includes(EVERYONE_KEY) ? 'all' : 'only');
  function draft() {
    const sel = picker.selected();
    const who = draftWho(sel, model.wire);
    const keys = sel.map((k) => model.keyOfPick.get(k)).filter(Boolean);
    const taskIds = who.filter((w) => w.kind === 'task').map((w) => w.id);
    return { sel, who, keys, taskIds };
  }
  function refresh() {
    const d = draft();
    const n = loseCount(view.usedBy, { mode: mode(), keys: d.keys, taskIds: d.taskIds });
    noteText(lose, n ? t('{n} conversation(s) using it now will lose it when you save (their pages in it close).', { n }) : '');
    lose.style.display = n ? '' : 'none';
    remoteLine.style.display = mode() === 'only' && model.remote ? '' : 'none';
    const sentence = mode() === 'all'
      ? t('Any of your conversations can use this browser and its logins — one browser, each conversation in its own tab.')
      : t('Pick conversations and Task Groups. A Task Group means every conversation in it — bound to it or started in its folders — now or later.');
    if (meaning.textContent !== sentence) meaning.textContent = sentence;
    const kept = mode() === 'all' && d.who.length ? t('The others you picked are kept for when you take All agents away.') : '';
    if (keptLine.textContent !== kept) keptLine.textContent = kept;
    keptLine.style.display = kept ? '' : 'none';
    if (d.sel.length) { refusal.style.display = 'none'; noteText(refusal, ''); }
    syncNotes();
  }
  refresh();
  refusal.style.display = 'none';
  syncNotes();

  async function doSave() {
    const d = draft();
    const use = draftUse(d.sel, model.wire);   // ALL AGENTS ⇒ {mode:'all'} (+ the rows kept beside it); nothing ⇒ refused
    if (!use) {
      noteText(refusal, refusalWords({ code: 'empty_list' }, t));
      refusal.style.display = '';
      syncNotes();
      picker.focus();
      return;
    }
    const namesPicked = mode() === 'only' ? picker.selectedRows().map((r) => r.name) : [];
    save.disabled = true; cancel.disabled = true; picker.setBusy(true);
    const r = await fetchJson(`/api/browser/profiles/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ use, base: view.base }) });
    if (closed) return;
    save.disabled = false; cancel.disabled = false; picker.setBusy(false);
    if (!r || r.error) {
      const words = refusalWords(r, t);
      if (r && r.code === 'list-changed') {
        showToast(words, { type: 'warn', duration: 9000 });
        shell.close();
        openWhoDialog(app, id, { onSaved, label: title });
        return;
      }
      if (r && r.code === 'empty_list') { noteText(refusal, words); refusal.style.display = ''; syncNotes(); return; }
      showToast(words || (t('Could not change who can use it') + ' — ' + ((r && r.error) || t('server unreachable'))), { type: 'error', duration: 9000 });
      try { save.focus(); } catch { /* none */ }
      return;
    }
    showToast(saveWords({ label: String((r.profile && r.profile.label) || title), mode: use.mode, names: namesPicked }, t) + (r.detached && r.detached.length ? ' · ' + t('{n} other conversation(s) no longer use {label}', { n: r.detached.length, label: String((r.profile && r.profile.label) || title) }) : ''), { duration: 7000 });
    shell.close();
    try { onSaved?.(r); } catch (e) { console.warn('[browser] who-can-use onSaved', e); }
  }
  setTimeout(() => { try { picker.focus(); } catch { /* none */ } }, 0);
  return { shell, picker, view, save: doSave, close: () => shell.close() };
}

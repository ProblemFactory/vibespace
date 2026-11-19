// THE NEED LINE (lane ui-needs-a-button — the owner 2026-11-13: «你看看这个界面是不是应该优化下，最好走查一下所有界面找到可优化的
// 布局，提示文本等»; the walk's largest pattern: a sentence that says something is needed, failed or off — or «change it in
// Settings › …» — with no button on its line). THE RULE: a sentence says the STATE; the button ON ITS LINE does the ACT. It never
// routes a person by a menu path («设置 → 集成 → …») or a direction («下方»): the door carries the way.
//
// ONE row shape on screen:
//   needLine({ words, doors, tone })  → <div class="need-line" data-tone>  <span class="need-words">…</span>
//                                                                         <span class="need-doors"><button…>…</span></div>
//   A door = { label, run, kind: 'primary' | 'secondary' | 'danger', title?, door? } (the house button, .mounts-btn); the first is
//   the act the sentence asks for. The doors wrap under the words on a narrow screen; the words are never cut.
// THE DOOR MAKERS — each over the opener the tree already has, never a copy:
//   settingsDoor(app, path, { label, section }) → Settings searched for that schema row's own words ({section}: its whole section) (src/lib/settings-ui.js open({search}):
//                                         a searched row is drawn even when it is advanced or its `when` hides it — then with its
//                                         «not in use here: …» chip, which names the switch that gates it)
//   integrationDoor(app, id, { label }) → the Integrations window at that card (app.openIntegration; no id = the window)
//   reloadDoor({ label })               → the page reloaded (a setting that takes effect on the next load)
//   pairDoor(app, host, { label })      → the pairing sheet of that machine (none = a new pairing; app.sidebar._showDevicePairDialog)
// THE CENSUS (scripts/test-needs-doors.mjs over src/ui-needs.js): a need sentence the net catches is a row; a row whose door is
// present is drawn through this file on every surface that states it.
import { t } from './i18n.js';
import { SETTINGS_SCHEMA } from './settings-schema.js';

export const NEED_TONES = Object.freeze(['need', 'fail', 'off', 'info']);
const KINDS = Object.freeze({ primary: ' mounts-btn-primary', secondary: '', danger: ' mounts-btn-danger' });

/** ONE door as the house button. A door whose `run` is missing is never drawn (a dead button is worse than none). */
export function needDoorButton(door, doc = document) {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'mounts-btn need-door' + (KINDS[door.kind] ?? '');
  b.textContent = String(door.label || '');
  if (door.title) b.title = String(door.title);
  if (door.door) b.dataset.door = String(door.door);
  b.onclick = (ev) => { ev.stopPropagation(); try { door.run(ev); } catch (e) { console.warn('[need-line] door', e); } };
  return b;
}

/** THE NEED LINE: the words and the doors on ONE line (a node). `words` is text (never HTML); `doors` = [door…]. */
export function needLine({ words = '', doors = [], tone = 'need', cls = '' } = {}, doc = document) {
  const line = doc.createElement('div');
  line.className = 'need-line' + (cls ? ' ' + cls : '');
  line.dataset.tone = NEED_TONES.includes(tone) ? tone : 'need';
  const w = doc.createElement('span');
  w.className = 'need-words';
  w.textContent = String(words || '');
  line.appendChild(w);
  const live = (Array.isArray(doors) ? doors : []).filter((d) => d && typeof d.run === 'function' && d.label);
  if (live.length) {
    const ds = doc.createElement('span');
    ds.className = 'need-doors';
    for (const d of live) ds.appendChild(needDoorButton(d, doc));
    line.appendChild(ds);
  }
  return line;
}

/** A door to ONE setting: Settings opened and searched for the row's own words (its label) — never a menu path in a sentence. */
export function settingsDoor(app, path, { label = '', kind = 'primary', section = false } = {}) {
  const row = SETTINGS_SCHEMA[path];
  if (!row || !app || !app._settingsUI) return null;
  // `section` — the row's whole Settings section (a need several rows answer together, e.g. the Spending limits)
  const run = section && row.category ? () => app._settingsUI.open({ category: String(row.category) }) : () => app._settingsUI.open({ search: String(row.label || path) });
  return { label: label || t('Open in Settings…'), kind, door: 'settings:' + path, title: String(row.label || ''), run };
}
/** A door to ONE card of the Integrations window (a key, a sign-in, a relay). */
export function integrationDoor(app, id, { label = '', kind = 'primary' } = {}) {
  if (!app || typeof app.openIntegration !== 'function') return null;   // no id ⇒ the window, nothing highlighted
  return { label: label || t('Open Integrations…'), kind, door: 'integration:' + (id || '*'), run: () => app.openIntegration(id || null) };
}
/** The pairing sheet (lane pair-dialog-polish's dialog, opened — never changed): `host` = that machine's own sheet (its state,
 *  a new command), none = a new pairing. Four surfaces need it: a machine row that is offline, a mount onto an offline
 *  machine, the agents panel with no machine, the elevate dialog's «run the pairing command again». */
export function pairDoor(app, host = null, { label = '', kind = 'primary' } = {}) {
  const sb = app && app.sidebar;
  if (!sb || typeof sb._showDevicePairDialog !== 'function') return null;
  return { label: label || (host ? t('Show the pairing command…') : t('Pair a device…')), kind, door: 'pair' + (host ? ':' + String(host.id || '') : ''), run: () => sb._showDevicePairDialog(host || null) };
}
/** A door to ONE plugin's own settings (its rows in Settings; a plugin without rows ⇒ the Plugins list — app.openPluginDoor). */
export function pluginDoor(app, id, { label = '', kind = 'primary' } = {}) {
  if (!app || !id || (typeof app.openPluginDoor !== 'function' && typeof app._openPluginSettings !== 'function')) return null;
  return { label: label || t('Plugin settings…'), kind, door: 'plugin:' + id, run: () => (typeof app.openPluginDoor === 'function' ? app.openPluginDoor({ plugin: String(id) }) : app._openPluginSettings(String(id))) };
}
/** A door to the Plugins list (a plugin to turn on, restart or answer). `install` (B-d073): the install form itself, when the app
 *  has it — the Integrations window's Test that waits for a first install — else the list. */
export function pluginsDoor(app, { label = '', kind = 'primary', install = false } = {}) {
  if (!app || typeof app.openPluginsDialog !== 'function') return null;
  if (install && typeof app._pluginInstallDialog === 'function') return { label: label || t('Install plugin…'), kind, door: 'plugins', run: () => app._pluginInstallDialog(() => { }) };
  return { label: label || t('Plugins…'), kind, door: 'plugins', run: () => app.openPluginsDialog() };
}
/** The page reloaded — a setting that takes effect on the next load. */
export function reloadDoor({ label = '', kind = 'primary' } = {}) {
  return { label: label || t('Reload now'), kind, door: 'reload', run: () => { try { location.reload(); } catch { /* not in a page */ } } };
}
/** A door that could not do its act SAYS why on its own line (never a silent press — the verifier's list for picks 3–6): the
 *  line's `.need-said` words (role=alert), replaced on the next say; '' takes them away. Returns the words' node (or null). */
export function sayOnLine(line, words = '', doc = document) {
  if (!line || typeof line.appendChild !== 'function') return null;
  let said = [...(line.children || [])].find((c) => c && c.classList && c.classList.contains('need-said')) || null;
  if (!words) { if (said) said.remove(); return null; }
  if (!said) { said = doc.createElement('span'); said.className = 'need-said'; said.setAttribute('role', 'alert'); line.appendChild(said); }
  said.textContent = String(words);
  return said;
}

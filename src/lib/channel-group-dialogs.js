// THE AGENT-GROUP DIALOGS (design-communication-panel.zh.md §22.5, chunk g3):
// New group (name + members picked from LIVE sessions grouped by Task Group,
// never selected whole + an optional opening context + "Wake now"), Invite…
// (the same dialog minus the name), and the group DETAIL (members with their
// notify mode — the owner may change anyone's — Remove, Invite…, Rename…,
// Archive; the owner drawn as "You (observer)").
//
// XSS LAW: a group name, a member name and a context text are AGENT-controlled
// (an agent creates and names groups with vibespace-msg) and sync to every
// client, so every one of them goes through textContent (`el()`), the dialog
// title through createModalShell's own textContent. No innerHTML here beyond
// the icon library's static SVG.
//
// MULTI-CLIENT: every change is a POST whose engine broadcasts
// `channel-groups-updated`; a dialog never waits for that echo (the select
// already shows the new mode, the toast already says the wake count), and an
// open detail dialog repaints IN PLACE from the broadcast's list.
import { fetchJson, showToast, createModalShell, showConfirmDialog, showInputDialog } from './utils.js';
import { t } from './i18n.js';
import { icon, el, btn, noteLine } from './channel-chrome.js';
import { groupErrorText, notifyModeText, wakeEchoText, groupTitle } from './channel-words.js';
import { pickerSections, memberRows, NOTIFY_MODES, GROUP_ADAPTER_ID } from './channel-groups-view.js';

const JSON_HDR = { 'Content-Type': 'application/json' };
/** POST a group verb; a refusal is TOASTED by its code (no silent failure)
 *  and answers null. */
export async function groupPost(pathname, body) {
  const r = await fetchJson(pathname, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body || {}) });
  if (!r || r.error) { showToast(groupErrorText(r), { type: 'error' }); return null; }
  return r;
}
const gpath = (id, verb) => `/api/channel-groups/${encodeURIComponent(id)}/${verb}`;

/** The live sessions the owner may pick + the Task Groups that title them. */
async function loadRoster(app) {
  const r = await fetchJson('/api/channel-groups/roster');
  if (!r || r.error) { showToast(groupErrorText(r), { type: 'error' }); return null; }
  const tasks = ((app.sidebar && app.sidebar._tasks) || []).map((g) => ({ id: g.id, title: groupTitle(g) }));
  return { sessions: Array.isArray(r.sessions) ? r.sessions : [], tasks };
}

/**
 * The member PICKER: one section per Task Group (its title, or "No task
 * group"), a checkbox per live session — never a whole-group checkbox (D1).
 * Returns `{node, selected(), onChange(fn)}`.
 */
function memberPicker(sections) {
  const node = el('div', 'chan-gpick');
  const boxes = [];
  let changed = () => {};
  if (!sections.length) node.appendChild(el('div', 'empty-hint empty-hint-inline', t('No live agent session to add — start one, then come back.')));
  for (const sec of sections) {
    node.appendChild(el('div', 'chan-gpick-sec', sec.title === null ? t('No task group') : sec.title));
    for (const s of sec.sessions) {
      const lab = el('label', 'dialog-check-row chan-gpick-item');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = s.cid; cb.disabled = !!s.disabled;
      cb.onchange = () => changed();
      const name = el('span', 'chan-gpick-name', s.name);
      name.title = s.cid;
      lab.append(cb, name);
      if (s.disabled) { lab.classList.add('chan-gpick-member'); lab.appendChild(el('span', 'dialog-check-hint', t('already a member'))); }
      node.appendChild(lab);
      boxes.push(cb);
    }
  }
  return { node, selected: () => boxes.filter((b) => b.checked && !b.disabled).map((b) => b.value), onChange: (fn) => { changed = fn; } };
}

/**
 * NEW GROUP (`group === null`) or INVITE… (`group` = the group view): one
 * dialog. The echo under "Wake now" says the cost BEFORE the click — "will
 * wake N agents (N billed turns)" — and the toast after it says what the
 * server actually did (the engine's woke/refused counts).
 */
export async function showGroupMembersDialog(app, { group = null } = {}) {
  const invite = !!group;
  const roster = await loadRoster(app);
  if (!roster) return;
  const existing = invite ? (group.members || []).map((m) => m.member) : [];
  const sections = pickerSections(roster.sessions, roster.tasks, { exclude: existing });
  const shell = createModalShell({ id: 'chan-group-new-dialog', title: invite ? t('Invite to {name}', { name: group.name }) : t('New group'), dialogClass: 'chan-dialog chan-group-new', escapeToClose: true });
  const { body, close } = shell;
  let nameInput = null;
  if (!invite) {
    body.appendChild(el('div', 'chan-opt-label', t('Name')));
    nameInput = document.createElement('input');
    nameInput.type = 'text'; nameInput.className = 'chan-opt-input chan-group-name'; nameInput.maxLength = 80; nameInput.spellcheck = false;
    nameInput.placeholder = t('e.g. api lane');
    body.appendChild(nameInput);
  }
  body.appendChild(el('div', 'chan-opt-label', invite ? t('Agents to invite') : t('Members')));
  body.appendChild(el('div', 'chan-flow-note', t('Live agent sessions, by Task Group. Pick each one — a Task Group is never added whole.')));
  const picker = memberPicker(sections);
  body.appendChild(picker.node);
  body.appendChild(el('div', 'chan-opt-label', t('Opening context (optional)')));
  const ctx = document.createElement('textarea');
  ctx.className = 'chan-opt-input chan-group-context'; ctx.rows = 3; ctx.maxLength = 4000;
  ctx.placeholder = t('Why they are here — the first thing each new member reads');
  body.appendChild(ctx);
  const wakeRow = el('label', 'dialog-check-row chan-group-wake');
  const wake = document.createElement('input');
  wake.type = 'checkbox'; wake.checked = true;
  wakeRow.append(wake, el('span', '', t('Wake now')));
  const echo = el('span', 'dialog-check-hint chan-group-echo', '');
  wakeRow.appendChild(echo);
  body.appendChild(wakeRow);
  const status = el('div', 'chan-flow-status', '');
  const actions = el('div', 'chan-flow-actions');
  const go = btn(invite ? t('Invite') : t('Create'), null, 'mounts-btn-primary');
  go.dataset.groupSubmit = '1';
  actions.append(btn(t('Cancel'), close), go);
  body.append(actions, status);
  const need = invite ? 1 : 2;
  const refresh = () => {
    const n = picker.selected().length;
    echo.textContent = wake.checked
      ? t('will wake {n} agent(s) ({n} billed turn(s))', { n })
      : t('nobody is woken — they read it on their next turn');
    const nameOk = invite || (nameInput && nameInput.value.trim().length > 0);
    go.disabled = n < need || !nameOk;
    status.className = 'chan-flow-status';
    status.textContent = n < need ? (invite ? t('Pick at least one agent') : t('Pick at least two agents')) : (!nameOk ? t('Give the group a name') : '');
  };
  picker.onChange(refresh);
  wake.onchange = refresh;
  if (nameInput) nameInput.oninput = refresh;
  refresh();
  go.onclick = async () => {
    go.disabled = true;
    const members = picker.selected();
    // the echo said "will wake N" — N travels with the act (r2 consent echo)
    const payload = { members, context: ctx.value, quiet: !wake.checked, expectWakes: wake.checked ? members.length : 0 };
    const r = invite
      ? await groupPost(gpath(group.id, 'invite'), payload)
      : await groupPost('/api/channel-groups', { ...payload, name: nameInput.value });
    if (!r) { refresh(); return; }
    close();
    const nm = (r.group && r.group.name) || (group && group.name) || '';
    showToast(`${invite ? t('Invited to "{name}"', { name: nm }) : t('Created "{name}"', { name: nm })} — ${wakeEchoText(r)}`);
    // the UI action chained after the write does NOT wait for the broadcast echo
    if (!invite && r.group && r.group.id) app.openChannel(GROUP_ADAPTER_ID, r.group.id);
  };
  setTimeout(() => (nameInput || ctx).focus({ preventScroll: true }), 0);
}

export async function renameGroup(group) {
  const name = await showInputDialog({ title: t('Rename group'), label: t('Name'), value: group.name || '' });
  if (name === null || name === undefined || !String(name).trim() || name === group.name) return;
  await groupPost(gpath(group.id, 'rename'), { name });
}
export async function archiveGroup(group) {
  const yes = await showConfirmDialog({ title: t('Archive group'), message: t('Archive "{name}"? Nobody can post to it afterwards; the log is kept and stays readable.', { name: group.name }), confirmText: t('Archive'), danger: true });
  if (yes) await groupPost(gpath(group.id, 'archive'), {});
}

/**
 * THE GROUP DETAIL: the member list — the owner first as "You (observer)",
 * then every member with its notify mode (a select; the owner may set ANY
 * member's) and Remove — then Invite… / Rename… / Archive. Repaints in place
 * from `channel-groups-updated`. `getGroup()` returns the freshest view the
 * caller holds; the dialog keeps its own copy from the broadcast afterwards.
 */
export function showGroupDetail(app, group0) {
  let group = group0;
  const shell = createModalShell({ id: 'chan-group-dialog', title: t('Group — {name}', { name: group.name }), dialogClass: 'chan-dialog chan-group-detail', escapeToClose: true, onClose: () => off() });
  const { body, close } = shell;
  const h3 = shell.dialog.querySelector('.dialog-header h3');
  function draw() {
    body.textContent = '';
    if (h3) h3.textContent = t('Group — {name}', { name: group.name });
    const archived = !!group.archivedAt;
    body.appendChild(el('div', 'chan-flow-note', group.pair
      ? t('A direct conversation between two agents — it takes no third member.')
      : t('Each member chooses when it is woken; you can change anyone\'s mode. A wake is a billed turn.')));
    if (archived) body.appendChild(noteLine('chan-flow-note', t('Archived — the log is kept, nothing new can be posted.'), { warn: true }));
    const list = el('div', 'chan-gm-list');
    for (const m of memberRows(group)) {
      const row = el('div', 'chan-gm-row' + (m.owner ? ' chan-gm-owner' : ''));
      row.dataset.member = m.member;
      const who = el('div', 'chan-gm-who');
      who.appendChild(icon(m.owner ? 'reach' : 'robot', 12));
      const name = el('span', 'chan-gm-name', m.owner ? t('You (observer)') : m.name);
      who.appendChild(name);
      if (!m.owner && m.creator) who.appendChild(el('span', 'chan-chip', t('creator')));
      if (!m.owner && !m.live) { const off = el('span', 'chan-gm-off', t('not running')); off.title = t('The session is not live — a wake waits for its next report'); who.appendChild(off); }
      row.appendChild(who);
      if (m.owner) {
        row.appendChild(el('span', 'chan-gm-hint', t('sees everything, never woken')));
      } else {
        const sel = document.createElement('select');
        sel.className = 'chan-opt-input chan-gm-notify';
        sel.disabled = archived;
        for (const mode of NOTIFY_MODES) { const o = document.createElement('option'); o.value = mode; o.textContent = notifyModeText(mode); sel.appendChild(o); }
        sel.value = m.notify;
        sel.onchange = async () => {
          const was = m.notify;
          sel.disabled = true;
          const r = await groupPost(gpath(group.id, 'notify'), { member: m.member, notify: sel.value });
          sel.disabled = false;
          if (!r) sel.value = was;   // refused: the toast said why, the select says the truth
        };
        row.appendChild(sel);
        if (!archived) {
          const rm = btn(t('Remove'), async () => {
            const msg = group.pair
              ? t('Remove {name}? A direct conversation that loses a side is archived (the log is kept).', { name: m.name })
              : t('Remove {name} from "{group}"?', { name: m.name, group: group.name });
            if (await showConfirmDialog({ title: t('Remove member'), message: msg, confirmText: t('Remove'), danger: true })) await groupPost(gpath(group.id, 'kick'), { member: m.member });
          });
          rm.classList.add('chan-gm-remove');
          row.appendChild(rm);
        }
      }
      list.appendChild(row);
    }
    body.appendChild(list);
    const actions = el('div', 'chan-flow-actions');
    if (!archived) {
      if (!group.pair) { const inv = btn(t('Invite…'), () => showGroupMembersDialog(app, { group })); inv.prepend(icon('plus', 11)); actions.appendChild(inv); }
      actions.appendChild(btn(t('Rename…'), () => renameGroup(group)));
      actions.appendChild(btn(t('Archive'), () => archiveGroup(group), 'mounts-btn-danger'));
    }
    actions.appendChild(el('span', 'chan-sp'));
    actions.appendChild(btn(t('Done'), close, 'mounts-btn-primary'));
    body.appendChild(actions);
  }
  const onBroadcast = (msg) => {
    if (msg.type !== 'channel-groups-updated' || !Array.isArray(msg.groups)) return;
    const g = msg.groups.find((x) => x.id === group.id);
    if (!g) return;
    group = g;
    // keep a focused select's interaction alive: repaint only when the user is not mid-choice
    if (shell.dialog.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    draw();
  };
  const off = () => { try { app.ws.offGlobal(onBroadcast); } catch {} };
  app.ws.onGlobal(onBroadcast);
  draw();
  return { close };
}

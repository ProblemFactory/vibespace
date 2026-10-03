// "WHO CAN USE <machine>?" (lane-pairing ⑥, B-7007). Before this lane a paired machine's exit was ONE toggle that
// opened it to every conversation for both things an exit does. The dialog edits the machine's TWO lists (PURE
// src/exit-reach.js), each Nobody / the agents you pick (ALL AGENTS the picker's first row — lane everyone-principal: it
// IS the `everyone` mode, never a second spelling; the rows picked beside it are kept for when All is taken away):
//   · Borrow its network — `vibespace-exit use / url` (the command runs here, only its traffic leaves there)
//   · Run commands on it — `vibespace-exit run` (a shell command ON the machine, as the user, up to 30 s),
//     with "Ask me each time" (every command waits for the user's Allow in For you, 60 s, then refused)
// "Only these" is THE principal picker (src/lib/principal-picker.js — conversations and Task Groups; a Task Group
// means every conversation in it, now or later) plus every row of the CURRENT list the live roster does not
// cover (a stopped conversation "not running now", a deleted Task Group). The dialog draws from a FRESH
// GET /api/hosts/:id/exit-access — never the row's broadcast copy (mirror-193) — and saves ONE PATCH with the
// `base` it read: a list changed meanwhile ⇒ 409, the sentence, the dialog re-drawn from the list as it is.
// Every peer-controlled string (a conversation name, a group title) is textContent only.
import { t } from './i18n.js';
import { createModalShell, showToast } from './utils.js';
import { principalPicker, rosterFromApp } from './principal-picker.js';
import { agoText } from './user-todos-row.js';
import { exitAccessOf, summaryOf, spawnFailureText } from '../exit-reach.js';
import { openExitRunsDialog } from './exit-runs-dialog.js'; // lane-exit-run-output E4: the machine's command list

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
// TWO answers: Nobody / Agents you pick (the radio's value stays `only`; ALL AGENTS is the picker's first row and maps
// to the stored `everyone` mode — lane everyone-principal)
const MODE_WORDS = { nobody: () => t('Nobody'), only: () => t('Agents you pick') };
const EVERYONE_KEY = 'everyone:*';

/** The words of one grant's summary (row, toast): nobody · everyone · {n} picked (+ " (ask me)" for run). */
function grantWords(g, { ask = false } = {}) {
  const base = g.mode === 'everyone' ? t('All agents') : g.mode === 'only' ? t('{n} picked', { n: g.n }) : g.mode === 'unknown' ? t('unreadable') : t('nobody');
  return base + (ask && g.mode !== 'nobody' ? t(' (ask me)') : '');
}
/** The machine row's line: `Exit: network — everyone · commands — 2 picked (ask me)`. `exit` = the stored record. */
export function exitSummaryText(exit) {
  const s = summaryOf(exitAccessOf({ exit }));
  return t('Exit: network — {a} · commands — {b}', { a: grantWords(s.use), b: grantWords(s.run, { ask: s.run.ask }) });
}
/** `Last run: ping -c1 … — 运维管理, 3 min ago, exit 0` (the whole command rides the title). */
export function lastRunText(lr) {
  if (!lr) return t('No command has run here yet');
  const cmd = String(lr.cmd || '');
  const head = cmd.length > 40 ? cmd.slice(0, 39) + '…' : cmd;
  // lane-exit-run-output E2: a child that never started says why on the row too (it read "exit 1")
  if (lr.outcome === 'spawn_failed') return t('Last run: {cmd} — {who}, {when}, could not start — {why}', { cmd: head, who: (lr.by && lr.by.name) || '?', when: lr.at ? agoText(lr.at, t) : '', why: spawnFailureText(lr.spawnError, { interpreter: lr.interpreter || 'sh' }) });
  // lane device-upgrade-stuck: refused before it was sent (a Windows agent without run-shell) — never "exit ?"
  if (lr.outcome === 'agent_outdated') return t('Last run: {cmd} — {who}, {when}, not run — agent {v} cannot run commands on Windows; rerun the install command (Pairing command)', { cmd: head, who: (lr.by && lr.by.name) || '?', when: lr.at ? agoText(lr.at, t) : '', v: lr.agentVersion || '?' });
  const code = lr.timedOut ? t('timed out') : (lr.code == null ? (lr.outcome === 'offline' ? t('offline') : '?') : lr.code);
  return t('Last run: {cmd} — {who}, {when}, exit {code}', { cmd: head, who: (lr.by && lr.by.name) || '?', when: lr.at ? agoText(lr.at, t) : '', code });
}
/** lane device-upgrade-stuck — the machine row's line while its agent's update has failed (`agentUpgrade` on the /api/hosts
 *  row, src/server/device-upgrade-watch.js), until the device reports the version; '' otherwise. */
export function agentUpgradeText(h) {
  const u = h && h.agentUpgrade;
  if (!u || !u.from || !u.to) return '';
  return u.lost === 'commands' ? t('Agent {from} — its update to {to} failed, so commands cannot run here; rerun the install command (Pairing command)', { from: u.from, to: u.to }) : t('Agent {from} — its update to {to} failed; rerun the install command (Pairing command)', { from: u.from, to: u.to });
}
/** The cookie routes' codes in the device's words (§11.5). */
function codeWords(code, extra = {}) {
  switch (code) {
    case 'list_changed': return t('The lists changed while this dialog was open (another window) — here they are as they are now; nothing was saved');
    case 'empty_list': return t('Pick All agents or at least one conversation or Task Group, or choose Nobody.');
    case 'too_many': return t('At most 64 conversations and Task Groups per list');
    case 'session-gone': return t('"{name}" is not running any more — pick it again when it is', { name: extra.name || '' });
    case 'ask_settled': return t('Already answered');
    case 'ask_expired': return t('Too late — it was refused after 60 s');
    case 'ask_unknown': return t('That request is gone');
    case 'host_needs_daemon': return t('Update the agent on this machine first');
    default: return extra.error || t('Could not change who can use it');
  }
}
export { codeWords as exitCodeWords };

/** GET the fresh view. → the body, or throws with `.code`. */
async function fetchView(hostId) {
  const res = await fetch(`/api/hosts/${encodeURIComponent(hostId)}/exit-access`, { headers: { 'Content-Type': 'application/json' } });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.error) throw Object.assign(new Error(d.error || `HTTP ${res.status}`), { code: d.code });
  return d;
}

/**
 * Open the dialog on `hostId`. `app` gives the live roster (sidebar sessions + Task Groups). Resolves when drawn.
 */
export async function openExitAccessDialog(app, { hostId, name = '' } = {}) {
  const { body, close, dialog } = createModalShell({ id: 'exit-access-dialog', title: t('Who can use {machine}?', { machine: name || hostId }), dialogClass: 'exit-access-dialog', bodyClass: 'exit-access-body', escapeToClose: true });
  body.textContent = t('Loading…');
  let data;
  try { data = await fetchView(hostId); }
  catch (e) { body.textContent = e.message || t('Could not change who can use it'); showToast(codeWords(e.code, { error: e.message }), { type: 'error' }); return; }
  const machine = (data.machine && data.machine.name) || name || hostId;
  const hdr = dialog.querySelector('.dialog-header h3'); if (hdr) hdr.textContent = t('Who can use {machine}?', { machine });
  draw(data);

  function draw(d) {
    body.textContent = '';
    const access = d.access || {};
    const unknown = access.mode === 'unknown';
    if (unknown) body.appendChild(el('p', 'agents-note exit-access-warn', t('The stored access could not be read — nothing is allowed until you save it again.')));
    const roster = () => rosterFromApp(app);
    const sections = {};
    for (const grant of ['use', 'run']) {
      const g = unknown ? { mode: 'nobody', who: [], ask: false } : (access[grant] || { mode: 'nobody', who: [] });
      const sec = el('section', 'exit-access-sec');
      sec.dataset.grant = grant;
      sec.appendChild(el('h4', 'exit-access-title', grant === 'use' ? t('Borrow its network') : t('Run commands on it')));
      sec.appendChild(el('p', 'agents-note', grant === 'use'
        ? t('An agent points one command at this machine\'s network (vibespace-exit use / url) — the command runs here, only its traffic leaves from {machine}.', { machine })
        : t('An agent runs a shell command ON {machine}, as you, up to 30 s (vibespace-exit run).', { machine })));
      const radios = el('div', 'exit-access-modes');
      radios.setAttribute('role', 'radiogroup');
      radios.setAttribute('aria-label', grant === 'use' ? t('Borrow its network') : t('Run commands on it'));
      // the stored `everyone` mode is the "Agents you pick" answer with ALL AGENTS picked (its kept rows beside it)
      let mode = g.mode === 'everyone' ? 'only' : g.mode;
      const radioEls = {};
      for (const m of ['nobody', 'only']) {
        const lab = el('label', 'exit-access-mode');
        const r = document.createElement('input');
        r.type = 'radio'; r.name = `exit-${grant}-mode`; r.value = m; r.checked = mode === m;
        r.onchange = () => { mode = m; syncSec(); };
        lab.append(r, el('span', null, MODE_WORDS[m]()));
        radios.appendChild(lab);
        radioEls[m] = r;
      }
      sec.appendChild(radios);
      // the picker: the live roster + every row of the CURRENT list the roster does not cover
      const stored = Array.isArray(g.who) ? g.who : [];
      const live = roster();
      const extra = [];
      const selected = g.mode === 'everyone' ? [EVERYONE_KEY] : [];
      for (const p of stored) {
        if (p.kind === 'group') {
          const k = `group:${p.id}`;
          if (!live.some((r) => r.key === k)) extra.push({ key: k, kind: 'group', id: p.id, name: p.name || p.id, hint: t('a deleted Task Group'), groupIds: [], groupNames: [] });
          selected.push(k);
        } else {
          const cid = String(p.id).includes(':') ? String(p.id).slice(String(p.id).indexOf(':') + 1) : p.id;
          const backend = String(p.id).split(':')[0];
          const hit = live.find((r) => r.kind === 'agent' && (backend === 'webui' ? String(r.webuiId) === cid : (r.id === cid && (r.backend || 'claude') === backend)));
          if (hit) selected.push(hit.key);
          else { const k = `session:${p.id}`; extra.push({ key: k, kind: 'agent', id: p.id, name: p.name || cid.slice(0, 8), hint: t('not running now'), groupIds: [], groupNames: [] }); selected.push(k); }
        }
      }
      const items = () => [...roster(), ...extra.filter((x) => !roster().some((r) => r.key === x.key))];
      const pickerWrap = el('div', 'exit-access-picker');
      pickerWrap.appendChild(el('p', 'agents-note', t('Pick All agents, or conversations and Task Groups. A Task Group means every conversation in it — now or later.')));
      const picker = principalPicker({ items, app, multi: true, selected, placeholder: t('Search sessions and groups…'), label: grant === 'use' ? t('Borrow its network') : t('Run commands on it'), emptyText: t('No agent session is running'), everyone: { key: EVERYONE_KEY }, onChange: () => { refuseLine.textContent = ''; syncCount(); } });
      pickerWrap.appendChild(picker.el);
      // verify r1 T2 ④: with ALL AGENTS picked the sentence says what that IS — every conversation, the ones started
      // later included, as you — per grant; the run sentence follows "Ask me each time"
      const allLine = el('p', 'agents-note exit-access-all');
      pickerWrap.appendChild(allLine);
      sec.appendChild(pickerWrap);
      let askBox = null, askLab = null, askNote = null;
      if (grant === 'run') {
        askLab = el('label', 'exit-access-ask');
        askBox = document.createElement('input');
        askBox.type = 'checkbox'; askBox.checked = !!g.ask;
        askLab.append(askBox, el('span', null, t('Ask me each time')));
        sec.appendChild(askLab);
        askNote = el('p', 'agents-note exit-access-ask-note', t('Every command waits for your Allow in "For you" (60 s, then it is refused).'));
        sec.appendChild(askNote);
      }
      const countLine = el('p', 'agents-note exit-access-count');
      sec.appendChild(countLine);
      body.appendChild(sec);
      const syncSec = () => {
        pickerWrap.style.display = mode === 'only' ? '' : 'none';
        // naive-user N-greyed: under Nobody there is nothing to ask about — the switch is NOT SHOWN (it used to sit there
        // greyed out and did nothing when clicked: the owner's no-greyed-controls rule); its ticked state is kept
        if (askLab) { askLab.style.display = mode === 'nobody' ? 'none' : ''; askNote.style.display = askLab.style.display; }
        refuseLine.textContent = '';
        syncCount();
      };
      // "{n} conversation(s) using it now will lose it when you save" (the GET's usedBy, judged against the pick)
      const syncCount = () => {
        const used = (d.usedBy && d.usedBy[grant]) || [];
        const sel = new Set(picker.selected());
        const covered = (sid) => {
          if (mode === 'nobody') return false;
          if (sel.has(EVERYONE_KEY)) return true;   // ALL AGENTS covers every conversation
          const r = roster().find((x) => String(x.webuiId) === String(sid));
          return !!r && (sel.has(r.key) || (r.groupIds || []).some((gid) => sel.has(`group:${gid}`)));
        };
        const n = used.filter((u) => !covered(u.sessionId)).length;
        countLine.textContent = n > 0 ? t('{n} conversation(s) using it now will lose it when you save', { n }) : '';
        const allOn = mode === 'only' && sel.has(EVERYONE_KEY);
        allLine.textContent = !allOn ? ''
          : grant === 'use' ? t('Every conversation — the ones you start later included — can borrow the network of {machine}.', { machine })
            : askBox && askBox.checked ? t('Every conversation — the ones you start later included — can run commands on {machine} as you, each after your Allow.', { machine })
              : t('Every conversation — the ones you start later included — can run commands on {machine} as you, without asking.', { machine });
        allLine.style.display = allOn ? '' : 'none';
      };
      if (askBox) askBox.onchange = () => syncCount();
      sections[grant] = { get mode() { return mode; }, picker, askBox, syncSec, radioEls };
    }
    const lr = el('p', 'agents-note exit-access-last', lastRunText(d.lastRun));
    if (d.lastRun && d.lastRun.cmd) lr.title = d.lastRun.cmd;
    // lane-exit-run-output E4: the machine's command list (the last 50 runs with their output) — human-triggered
    const runsBtn = el('button', 'btn-cancel exit-access-runs', t('Recent commands…'));
    runsBtn.type = 'button';
    runsBtn.onclick = (e) => { e.preventDefault(); openExitRunsDialog(app, { hostId, name: machine }); };
    lr.appendChild(document.createTextNode(' '));
    lr.appendChild(runsBtn);
    const refuseLine = el('div', 'exit-access-refuse');
    refuseLine.setAttribute('role', 'alert');
    const actions = el('div', 'dialog-actions exit-access-actions');
    const cancel = el('button', 'btn-cancel', t('Cancel'));
    cancel.onclick = () => close();
    const save = el('button', 'btn-create exit-access-save', t('Save'));
    actions.append(cancel, save);
    body.append(lr, refuseLine, actions);
    for (const g of Object.values(sections)) g.syncSec();

    save.onclick = async () => {
      const out = { base: d.base };
      for (const grant of ['use', 'run']) {
        const s = sections[grant];
        const g = { mode: s.mode };
        if (s.mode === 'only') {
          const all = s.picker.selected().includes(EVERYONE_KEY);
          const keys = s.picker.selected().filter((k) => k !== EVERYONE_KEY);
          if (!all && !keys.length) { refuseLine.textContent = t('Pick All agents or at least one conversation or Task Group, or choose Nobody.'); return; }
          // ALL AGENTS = the stored `everyone` mode; the rows picked beside it ride along (kept, restored when All goes)
          if (all) g.mode = 'everyone';
          const rows = roster();
          g.who = keys.map((k) => {
            if (k.startsWith('group:')) return { kind: 'group', id: k.slice('group:'.length) };
            if (k.startsWith('session:')) return { kind: 'session', id: k.slice('session:'.length) };
            const r = rows.find((x) => x.key === k);
            return r && r.webuiId ? { kind: 'session', session: String(r.webuiId), name: r.name } : null;
          }).filter(Boolean);
        }
        if (grant === 'run') g.ask = !!(s.askBox && s.askBox.checked);
        out[grant] = g;
      }
      save.disabled = true;
      let res, j;
      try {
        res = await fetch(`/api/hosts/${encodeURIComponent(hostId)}/exit-access`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) });
        j = await res.json().catch(() => ({}));
      } catch (e) { j = { error: e.message }; res = { ok: false, status: 0 }; }
      save.disabled = false;
      if (res.ok && !j.error) {
        const s = summaryOf(exitAccessOf({ exit: { use: j.access.use, run: j.access.run } }));
        showToast(t('Who can use {machine}: network — {a}; commands — {b}', { machine, a: grantWords(s.use), b: grantWords(s.run, { ask: s.run.ask }) }));
        close();
        return;
      }
      if (j.code === 'list_changed') {
        // the list moved under us: say so, and draw it AS IT IS NOW (a fresh GET) — nothing was written
        showToast(codeWords('list_changed'), { type: 'error' });
        try { const fresh = await fetchView(hostId); draw(fresh); } catch { }
        const again = body.querySelector('.exit-access-refuse'); if (again) again.textContent = codeWords('list_changed');
        return;
      }
      const w = codeWords(j.code, { error: j.error });
      refuseLine.textContent = w;
      showToast(t('Could not change who can use it') + (j.code ? ` — ${w}` : ''), { type: 'error' });
    };
  }
}

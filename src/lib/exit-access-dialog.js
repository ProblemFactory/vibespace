// "WHO CAN USE <machine>?" (lane-pairing ⑥, B-7007). Before this lane a paired machine's exit was ONE toggle that
// opened it to every conversation for both things an exit does. The dialog edits the machine's TWO lists (PURE
// src/exit-reach.js), each Nobody / the agents you pick (ALL AGENTS the picker's first row — lane everyone-principal: it
// IS the `everyone` mode, never a second spelling; the rows picked beside it are kept for when All is taken away):
//   · Borrow its network — `vibespace-exit use / url` (the command runs here, only its traffic leaves there)
//   · Run commands on it — `vibespace-exit run` (a shell command ON the machine, as the user, up to 30 s),
//     with "Ask me each time" (every command waits for the user's Allow in For you, 60 s, then refused)
//   · Hub automation (lane hub-act-ask, design q-042 D4) — what VibeSpace itself, its background jobs and agents' OTHER tools
//     do on the machine without a person's click: Never / Ask me each time / Always allow (PURE src/hub-act-policy.js);
//     not set ⇒ the instance's default (a cluster instance asks, a local one does not), said under the radios
// "Only these" is THE principal picker (src/lib/principal-picker.js — conversations and Task Groups; a Task Group
// means every conversation in it, now or later) plus every row of the CURRENT list the live roster does not
// cover (a stopped conversation "not running now", a deleted Task Group). The dialog draws from a FRESH
// GET /api/hosts/:id/exit-access — never the row's broadcast copy (mirror-193) — and saves ONE PATCH with the
// `base` it read: a list changed meanwhile ⇒ 409, the sentence, the dialog re-drawn from the list as it is.
// Every peer-controlled string (a conversation name, a group title) is textContent only.
// «除了» (lane grants-unify): with a Task Group or All agents picked, the picker's folded exception row leaves members
// out of that list (the grant model's `except` — they are refused `excepted` by name); the lists live in the ONE grants
// store, the view arrives in the model's spelling (`{kind:'conversation', key}` / `{kind:'group', id}`), drawn and
// saved through the picker model's `rowToPick` / the live-session resolution below.
import { t } from './i18n.js';
import { createModalShell, showToast } from './utils.js';
import { principalPicker, rosterFromApp } from './principal-picker.js';
import { agoText } from './user-todos-row.js';
import { accessOfView, summaryOf, spawnFailureText } from '../exit-reach.js';
import { rowToPick } from './principal-picker-model.js';
import { openExitRunsDialog } from './exit-runs-dialog.js'; // lane-exit-run-output E4: the machine's command list

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
// TWO answers: Nobody / Agents you pick (the radio's value stays `only`; ALL AGENTS is the picker's first row and maps
// to the stored `everyone` mode — lane everyone-principal)
const MODE_WORDS = { nobody: () => t('Nobody'), only: () => t('Agents you pick') };
const EVERYONE_KEY = 'everyone:*';
// lane hub-act-ask: the third list's three answers (stored `nobody | ask | everyone`)
const HUB_WORDS = { nobody: () => t('Never'), ask: () => t('Ask me each time'), everyone: () => t('Always allow') };
/** Why the radios show what they show when the machine never set its list (the GET's `hub`: source, instance kind). */
function hubDefaultText(info) {
  if (!info || info.stored) return '';
  if (info.source === 'setting') return t('Not set — the default in Settings applies (Integration → Hub automation on paired machines).');
  if (info.source === 'instance') return info.instanceKind === 'cluster' ? t('Not set — this cluster instance asks by default.') : t('Not set — this local instance allows by default.');
  return '';
}

/** The words of one grant's summary (row, toast): nobody · everyone · {n} picked (+ " (ask me)" for run). */
function grantWords(g, { ask = false } = {}) {
  const base = g.mode === 'everyone' ? t('All agents') : g.mode === 'only' ? t('{n} picked', { n: g.n }) : g.mode === 'unknown' ? t('unreadable') : t('nobody');
  return base + (g.x ? t(', {n} left out', { n: g.x }) : '') + (ask && g.mode !== 'nobody' ? t(' (ask me)') : '');
}
/** The machine row's line: `Exit: network — everyone · commands — 2 picked (ask me)`. `exit` = the row's served view
 *  (GET /api/hosts — its lists from the grants store). */
export function exitSummaryText(exit) {
  const s = summaryOf(accessOfView(exit));
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
  // lane device-bundle-signing (design q-042 D2): the device refused the bundle's signature / this hub's build is unsigned
  if (u.refused === 'downgrade') return t('Agent {from} — REFUSED {to}: an older version than one it already ran; see For you', { from: u.from, to: u.to }); // fix r2
  if (u.refused) return t('Agent {from} — REFUSED the update to {to}: its release signature did not check ({code}); see For you', { from: u.from, to: u.to, code: u.refused });
  if (u.unsigned) return t("Agent {from} — not updated to {to}: this VibeSpace's agent build is not the signed release (sign it before a release)", { from: u.from, to: u.to });
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
  // lane dialog-unsaved-guard: who / commands / the hub's answer changed and not saved ⇒ ✕ / Esc / the backdrop asks
  let dirtyNow = () => false; let saveNow = async () => true;
  const { body, close, dialog, raised, ready } = createModalShell({ id: 'exit-access-dialog', key: hostId, title: t('Who can use {machine}?', { machine: name || hostId }), dialogClass: 'exit-access-dialog', bodyClass: 'exit-access-body', escapeToClose: true,
    unsaved: { isDirty: () => dirtyNow(), save: () => saveNow() }, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  body.textContent = t('Loading…');
  let data;
  try { data = await fetchView(hostId); }
  catch (e) { body.textContent = e.message || t('Could not change who can use it'); showToast(codeWords(e.code, { error: e.message }), { type: 'error' }); return; }
  if (!(await ready)) return null;   // r4: queued behind another machine's open form (its ask) — drawn when it opens; null: the person kept that one
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
      // the picker: the live roster + every row of the CURRENT list the roster does not cover (and its exceptions)
      const pick = rowToPick({ to: [...(g.mode === 'everyone' ? [{ kind: 'everyone' }] : []), ...(g.mode === 'nobody' ? [] : g.who || [])], except: g.mode === 'nobody' ? [] : g.except || [] },
        roster(), { everyoneKey: EVERYONE_KEY, notRunning: t('not running now'), deletedGroup: t('a deleted Task Group') });
      const extra = pick.extra;
      const selected = pick.selected;
      const items = () => [...roster(), ...extra.filter((x) => !roster().some((r) => r.key === x.key))];
      const pickerWrap = el('div', 'exit-access-picker');
      pickerWrap.appendChild(el('p', 'agents-note', t('Pick All agents, or conversations and Task Groups. A Task Group means every conversation in it — now or later.')));
      const picker = principalPicker({ items, app, multi: true, selected, placeholder: t('Search sessions and groups…'), label: grant === 'use' ? t('Borrow its network') : t('Run commands on it'), emptyText: t('No agent session is running'), everyone: { key: EVERYONE_KEY }, onChange: () => { refuseLine.textContent = ''; syncCount(); },
        except: { selected: pick.except, extra } });   // «除了» — members left out of a picked Task Group / All agents
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
        const out = new Set(picker.except());
        const covered = (sid) => {
          if (mode === 'nobody') return false;
          const r = roster().find((x) => String(x.webuiId) === String(sid));
          if (r && sel.has(r.key)) return true;               // its own place in the list
          if (r && out.has(r.key)) return false;              // «除了» — left out
          if (sel.has(EVERYONE_KEY)) return true;   // ALL AGENTS covers every conversation
          return !!r && (r.groupIds || []).some((gid) => sel.has(`group:${gid}`));
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
    // lane hub-act-ask: THE THIRD LIST — never vibespace-exit (the two lists above decide it), never your own clicks
    const hubInfo = d.hub || null;
    const hubStored = !unknown && access.hub && access.hub.mode !== 'default' ? access.hub.mode : null;
    let hubMode = hubStored || (hubInfo && hubInfo.policy) || 'ask', hubTouched = false;
    const hubSec = el('section', 'exit-access-sec exit-access-hub');
    hubSec.dataset.grant = 'hub';
    hubSec.appendChild(el('h4', 'exit-access-title', t('Hub automation')));
    hubSec.appendChild(el('p', 'agents-note', t('What VibeSpace does on {machine} when no person clicked: its own upkeep, background jobs, and agents\' tools other than the two lists above. Ask me each time = an urgent card in "For you" (one per kind, 60 s, then refused). Your own clicks never ask.', { machine })));
    const hubRadios = el('div', 'exit-access-modes');
    hubRadios.setAttribute('role', 'radiogroup');
    hubRadios.setAttribute('aria-label', t('Hub automation'));
    const hubDefault = el('p', 'agents-note exit-access-hub-default', hubDefaultText(hubInfo));
    for (const m of ['nobody', 'ask', 'everyone']) {
      const lab = el('label', 'exit-access-mode');
      const r = document.createElement('input');
      r.type = 'radio'; r.name = 'exit-hub-mode'; r.value = m; r.checked = hubMode === m;
      r.onchange = () => { hubMode = m; hubTouched = true; hubDefault.textContent = ''; };
      lab.append(r, el('span', null, HUB_WORDS[m]()));
      hubRadios.appendChild(lab);
    }
    hubSec.appendChild(hubRadios);
    hubSec.appendChild(hubDefault);
    const waiting = hubInfo && Array.isArray(hubInfo.asks) ? hubInfo.asks.length : 0;
    if (waiting) hubSec.appendChild(el('p', 'agents-note exit-access-hub-waiting', t('{n} act(s) wait for your answer in "For you"', { n: waiting })));
    body.appendChild(hubSec);
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
          // a LIVE conversation is sent by its webui id (the route resolves its conversation key — a pending fork's own);
          // a stored one not running now as the key it has; a Task Group by its id
          const wire = (k) => {
            if (k.startsWith('group:')) return { kind: 'group', id: k.slice('group:'.length) };
            const r = rows.find((x) => x.key === k);
            if (r && r.webuiId) return { kind: 'session', session: String(r.webuiId), name: r.name };
            const x = extra.find((e) => e.key === k);
            return x && x.kind === 'agent' ? { kind: 'conversation', key: String(x.id) } : null;
          };
          g.who = keys.map(wire).filter(Boolean);
          g.except = s.picker.except().map(wire).filter(Boolean);   // «除了»
        }
        if (grant === 'run') g.ask = !!(s.askBox && s.askBox.checked);
        out[grant] = g;
      }
      if (hubTouched) out.hub = { mode: hubMode }; // lane hub-act-ask: written only when picked (not set = the instance's default)
      save.disabled = true;
      let res, j;
      try {
        res = await fetch(`/api/hosts/${encodeURIComponent(hostId)}/exit-access`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) });
        j = await res.json().catch(() => ({}));
      } catch (e) { j = { error: e.message }; res = { ok: false, status: 0 }; }
      save.disabled = false;
      if (res.ok && !j.error) {
        const s = summaryOf(accessOfView(j.access));
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
    // what the person changed, against what this draw showed (a fresh draw — the list moved — starts a new base)
    const drawn = () => JSON.stringify({ sec: ['use', 'run'].map((g) => { const s = sections[g]; return [s.mode, s.picker && typeof s.picker.selected === 'function' ? s.picker.selected().slice().sort() : null, !!(s.askBox && s.askBox.checked)]; }), hub: hubTouched ? hubMode : null });
    const base = drawn();
    dirtyNow = () => drawn() !== base;
    saveNow = async () => { await save.onclick(); return body.querySelector('.exit-access-refuse')?.textContent || undefined; };
  }
}

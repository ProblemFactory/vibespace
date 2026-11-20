// WHAT THIS VIBESPACE DID ON A MACHINE (lane device-act-audit, design q-042 D4, 2026-10-19). "Activity…" on the Machines card
// lists the last 50 acts the hub took on that machine — a command, a file written, a secret placed, keys typed, a socket to
// another host, an agent update — each with WHO asked (a person's sign-in, a conversation, a job, VibeSpace itself), what
// (a bounded, secret-free summary), the verdict and the duration; a row opens its output head (≤ 200 bytes, redacted).
// Drawn from a FRESH `GET /api/hosts/:id/device-acts` (never a broadcast copy), then KEYED ROWS PATCHED IN PLACE on every
// `device-audit` broadcast (the ONE audit writer notifies — the exit list's rule); a filter by who asked re-reads. Every
// string of a line is textContent (judged again by the PURE row rule) — never innerHTML.
import { t, deviceLocale } from './i18n.js';
import { stampAt as when } from './page-time.js'; // lane ui-language: the ONE formatter of a time / number a person reads
import { createModalShell, showToast, heldWordsOf } from './utils.js';
import { rowOf, kindOf, BY_KINDS } from '../device-acts.js';
import { nameOrGone } from './plain-words.js';

const LIMIT = 50;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const whenText = (at) => when(Number(at) || 0, { seconds: true });
const durationText = (ms) => { if (ms == null) return ''; const s = (Math.max(0, Number(ms) || 0) / 1000).toFixed(1); return Number(s) === 0 ? '<0.1 s' : `${s} s`; };
/** WHO asked, in a person's words (lane ui-plain-words M2a: names, never ids — the raw subject is in the row's opened
 *  line): this hub's own sign-in is «你», another sign-in its name, a conversation by its name (`nameOf(id)`, the sidebar's),
 *  a job and VibeSpace by their words. */
export function whoText(by, nameOf = () => '') {
  const k = kindOf(by);
  if (!k) return t('nobody named');
  const id = by.slice(k.length + 1);
  if (k === 'human') return id === 'local' ? t('You') : id || t('a person');
  if (k === 'agent' && (id === 'unknown' || !id)) return t('an agent VibeSpace could not identify'); // closure 2: never «no longer listed» for a requester the hub did not know
  if (k === 'agent') { const n = nameOrGone('conversation', id, nameOf(id)); return n === nameOrGone('conversation', id, '') ? n : t('conversation “{name}”', { name: n }); } // id = '<backend>:<sid>' | 'webui:<id>' (sessionNameOf parses it)
  return k === 'job' ? t('a job') : t('VibeSpace, by itself');
}
/** WHAT was done, in a person's words (closure C2): ONE exact word per op / op:action of device-acts.js's TABLE (and link-token) —
 *  no prefix fallback, and an act never reads as a read word (scripts/test-plain-words.mjs: every key has its row; an act or code
 *  row never names a read word); the raw op stays in the row's opened line. */
const ACT_WORDS = {
  'sysinfo': 'Read system information', 'display-facts': 'Read system information', 'stream-facts': 'Read system information', 'remoteapp-facts': 'Read system information',
  'desktop-apps-list': 'List its apps', 'discovery-snapshot': 'Read its conversations', 'discovery-claims': 'Read its conversations', 'discovery-watch': 'Read its conversations',
  'session-events-watch': 'Read its conversations', 'usage-scan': 'Read usage', 'usage-events-watch': 'Read usage', 'usage-events-ack': 'Read usage', 'pool-orders-log-ack': 'Read usage',
  'stream-offer': 'Stream its screen', 'stream-answer': 'Stream its screen', 'stream-stop': 'Stream its screen', 'stream-stats': 'Stream its screen', 'stream-windows': 'Stream its screen',
  'stream-audio': 'Stream its screen', 'window-track': 'Stream its screen', 'window-untrack': 'Stream its screen', 'proc-list': 'Read system information', 'left-behind': 'Read system information',
  'dial-status': 'Read system information', 'probe-cli': 'Read system information', 'probe-creds': 'Read system information', 'ping-info': 'Read system information',
  'ok': 'Read system information', 'transcript-op': 'Read its conversations', 'peer-state': 'Read its conversations', 'quota-refresh': 'Read usage', 'tcp-connect:loopback': 'Connect to a port', 'fs-op:stat': 'Read files',
  'fs-op:list': 'Read files', 'fs-op:read-range': 'Read files', 'fs-op:home': 'Read files', 'fs-op:du': 'Read files', 'design-fs:read': 'Read files', 'design-fs:meta': 'Read files',
  'design-fs:tokens': 'Read files', 'desktop-serve:facts': 'Read system information', 'desktop-serve:status': 'Read system information', 'desktop-serve:list': 'Read system information',
  'desktop-serve:windows': 'Read system information', 'desktop-serve:app-status': 'Read system information', 'desktop-serve:app-plan': 'Read system information',
  'desktop-serve:app-refresh': 'Read system information', 'browser-serve:version': 'Read system information', 'browser-serve:status': 'Read system information',
  'browser-serve:cdp-url': 'Read system information', 'browser-serve:builds': 'Read system information', 'stream-mic:facts': 'Read system information', 'hello': 'Run a terminal session',
  'open-session': 'Run a terminal session', 'resize-session': 'Run a terminal session', 'kill-session': 'Run a terminal session', 'open-pipe-session': 'Run a terminal session',
  'attach-pipe-session': 'Run a terminal session', 'kill-pipe-session': 'Run a terminal session', 'opencode-serve': 'Run a terminal session', 'tcp-listen': 'Forward a port',
  'tcp-unlisten': 'Forward a port', 'unserve-folder': 'Share a folder', 'unserve-socks': 'Forward a port', 'desktop-serve:launch': 'Start its desktop', 'desktop-serve:relaunch': 'Start its desktop',
  'desktop-serve:stop': 'Stop its desktop', 'desktop-serve:close-asked': 'Stop its desktop', 'desktop-serve:fit': 'Use its desktop', 'desktop-serve:keep-alive': 'Use its desktop',
  'desktop-serve:pin': 'Use its desktop', 'desktop-serve:app-unstage': 'Use its desktop', 'desktop-serve:app-forget': 'Use its desktop', 'desktop-serve:app-adopt-drift': 'Use its desktop',
  'browser-serve:stop': 'Stop a browser', 'browser-serve:end-daemon': 'Stop a browser', 'run-cmd': 'Run a command', 'run-stream': 'Run a command', 'place-secret': 'Place a secret',
  'input-events': 'Type and click', 'tcp-connect': 'Connect to a port', 'serve-socks': 'Forward a port', 'serve-folder': 'Share a folder', 'fs-op:write': 'Write a file',
  'fs-op:rm': 'Delete a file', 'fs-op:rename': 'Move a file', 'fs-op:mkdir': 'Make a folder', 'fs-op:copy': 'Copy a file', 'fs-op:move': 'Move a file', 'fs-op:write-stream': 'Write a file',
  'design-fs:write-user': 'Write a file', 'desktop-serve:app-install': 'Install an app', 'desktop-serve:app-remove': 'Remove an app', 'desktop-serve:app-fetch': 'Download an app',
  'browser-serve:start': 'Start a browser', 'browser-serve:remove': 'Remove a browser', 'peer-post': 'Send to another VibeSpace', 'pool-orders': 'Manage accounts',
  'settings-open': 'Open settings', 'window-pin': 'Pin a window', 'desktop-grab': 'Take a screenshot', 'desktop-input': 'Type and click', 'stream-mic:default': 'Change the default microphone',
  'upgrade': 'Update VibeSpace on it', 'link-token': 'Give a conversation access to it',
};
export function actWords(op) {
  const w = Object.prototype.hasOwnProperty.call(ACT_WORDS, String(op || '')) ? ACT_WORDS[String(op)] : null;
  return w ? t(w) : t('an act'); // an op this table does not know is «an act» — never a family's word
}
/** The sidebar's name for a conversation id (a rename first) — '' when it is not listed. */
/** closure C1: the hub's agent subjects are `agent:<backend>:<sid>` and `agent:webui:<id>` (exit-proxy keyOf / window-reach
 *  sessionKeyOf) — the prefix is parsed, then the sidebar is asked by the matching id; «gone» only when that misses. */
export function agentSubjectOf(id) {
  const s = String(id || ''), i = s.indexOf(':');
  if (i < 0) return { kind: 'any', id: s };
  return s.slice(0, i) === 'webui' ? { kind: 'webui', id: s.slice(i + 1) } : { kind: 'backend', id: s.slice(i + 1) };
}
export const sessionNameIn = (sessions, getCustomName) => (id) => {
  const a = agentSubjectOf(id);
  const s0 = (sessions || []).find((x) => (a.kind !== 'backend' && x.webuiId === a.id) || (a.kind !== 'webui' && (x.claudeSessionId === a.id || x.backendSessionId === a.id)));
  return s0 ? ((getCustomName && getCustomName(s0)) || s0.webuiName || s0.name || '') : '';
};
const sessionNameOf = (app) => (id) => {
  try { return sessionNameIn(app?.sidebar?._allSessions || [], app?.sidebar?.getCustomName ? (x) => app.sidebar.getCustomName(x) : null)(id); } catch { return ''; }
};
/** The verdict of an act in the device's words. */
export function actVerdictText(r) {
  if (!r) return '';
  if (r.code === 'act_without_by') return t('refused: nobody was named for it — never sent');
  if (r.code === 'op-not-allowed') return t('refused: the machine’s own allow list leaves it off'); // lane device-allow-flags (the head says the re-run)
  if (r.code === 'policy_is_the_devices') return t('refused: that is the machine’s own allow list');
  if (r.ok === false) return typeof r.code === 'number' ? t('exit {code}', { code: r.code }) : t('failed ({code})', { code: r.code || '?' });
  if (typeof r.code === 'number') return t('exit {code}', { code: r.code });
  return r.ok === true ? t('ok') : '';
}
export const actKeyOf = (r) => (r.id ? `id:${r.id}` : `${Number(r.at) || 0}:${r.op}:${r.by || ''}:${String(r.summary || '').slice(0, 120)}`);

/** B-f7a6: the record's lines the hub DROPPED since it started (they could not be written in time: the queue keeps at most
 *  4 MB) — one record for every machine, so a list may miss them. '' when none. The Commands list (exit-runs-dialog.js) says
 *  the same of its own record. */
export function lostLine(lost) {
  const n = lost && Number(lost.total) > 0 ? Math.floor(Number(lost.total)) : 0;
  if (!n) return '';
  return n === 1 ? t('Since the hub started, this VibeSpace’s record (shared by all machines) dropped 1 line, at {when}: it could not be written in time and may be from any machine — this list may miss it', { when: when(Number(lost.lastAt) || 0, { seconds: true, words: true }) })
    : t('Since the hub started, this VibeSpace’s record (shared by all machines) dropped {n} lines, the last at {when}: they could not be written in time and may be from any machine — this list may miss some', { n, when: when(Number(lost.lastAt) || 0, { seconds: true, words: true }) });
}
/** The ONE row painter (keyed; an existing node is re-worded in place). */
export function paintActRow(node, r, nameOf = () => '') {
  node.dataset.key = actKeyOf(r);
  node.dataset.layer = r.layer || '';
  node.dataset.ok = r.ok == null ? '' : String(!!r.ok);
  let sum = node.querySelector(':scope > summary');
  if (!sum) { sum = el('summary', 'exit-runs-sum device-acts-sum'); node.appendChild(sum); }
  sum.textContent = '';
  sum.append(el('span', 'exit-runs-when', whenText(r.at)), el('span', 'exit-runs-who device-acts-who', whoText(r.by, nameOf)));
  const main = el('div', 'exit-runs-main');
  const outcome = el('div', 'exit-runs-outcome');
  outcome.append(el('span', 'device-acts-op', actWords(r.op)), ' · ', el('span', 'exit-runs-verdict', actVerdictText(r)));
  if (r.ms != null) outcome.append(' · ', el('span', 'exit-runs-ms', durationText(r.ms)));
  if (r.repeats) outcome.append(' · ', el('span', 'device-acts-repeats', t('{n} more since {time}', { n: r.repeats, time: when(Number(r.since || r.at) || 0, { seconds: true, words: true }) })));   // B-c632: this line stands for N more refusals of the same act since the line before
  main.append(el('code', 'exit-runs-cmd device-acts-what', r.summary || ''), outcome);
  sum.append(main);
  let body = node.querySelector(':scope > .exit-runs-out');
  if (!body) { body = el('div', 'exit-runs-out'); node.appendChild(body); }
  body.textContent = '';
  body.appendChild(el('div', 'exit-runs-flags', `${t('Who asked')}: ${r.by || t('nobody named')} · ${r.op || ''} · ${r.layer === 'code' ? t('new agent code') : t('an act')}`));
  if (r.outHead) { body.appendChild(el('div', 'exit-runs-stream', t('output head'))); body.appendChild(el('pre', 'exit-runs-pre chat-pre-wrapped', r.outHead)); }
  else body.appendChild(el('div', 'exit-runs-none', t('no output kept')));
  return node;
}

/** Open the activity list of `hostId`. Resolves when drawn. */
export async function openDeviceActsDialog(app, { hostId, name = '' } = {}) {
  const nameOf = sessionNameOf(app);
  let upsert = null, kind = '';
  const queued = [];
  // armed BEFORE the GET (the exit list's verify r1 F3): a line that lands during the read is applied after it
  const off = app && app.ws && typeof app.ws.onGlobal === 'function' ? app.ws.onGlobal((m) => {
    if (!m || m.type !== 'device-audit' || !m.line || String(m.line.hostId || '') !== String(hostId)) return;
    const r = rowOf(m.line);
    if (!r || (kind && kindOf(r.by) !== kind)) return;
    if (upsert) upsert(r); else queued.push(r);
  }) : null;
  const unhook = () => { try { off?.(); } catch { } };
  const title = (m) => t('Activity on {machine}', { machine: m || hostId });
  const { body, close, dialog, raised, ready } = createModalShell({ id: 'device-acts-dialog', key: hostId, title: title(name), dialogClass: 'exit-runs-dialog device-acts-dialog', bodyClass: 'exit-runs-body', escapeToClose: true, onClose: unhook, kind: 'form' });
  if (raised) return null;   // raised: the same subject's form, as it was
  const note = el('p', 'agents-note exit-runs-note', t('The last 50 things this VibeSpace did on {machine}, newest first, each with who asked; a row opens its output head.', { machine: name || hostId }));
  const lostNote = el('p', 'agents-note device-acts-lost'); lostNote.hidden = true;   // B-f7a6: lines the record dropped
  const bar = el('div', 'device-acts-filter');
  const pick = el('select', 'device-acts-kind');
  pick.setAttribute('aria-label', t('Who asked'));
  for (const [v, w] of [['', t('Everyone')], ['human', t('People')], ['agent', t('Conversations')], ['job', t('Jobs')], ['system', t('VibeSpace itself')]]) { if (v && !BY_KINDS.includes(v)) continue; const o = el('option', null, w); o.value = v; pick.appendChild(o); }
  bar.append(el('label', 'device-acts-kind-label', t('Who asked')), pick);
  const list = el('div', 'exit-runs-list device-acts-list');
  list.setAttribute('role', 'list');
  const empty = el('p', 'agents-note exit-runs-empty', t('Nothing has been done on this machine yet'));
  const rows = new Map();
  const syncEmpty = () => { empty.style.display = rows.size ? 'none' : ''; };
  const place = (r) => {
    const key = actKeyOf(r);
    const had = rows.get(key);
    if (had) { paintActRow(had, r, nameOf); return had; }
    const node = paintActRow(document.createElement('details'), r, nameOf);
    node.className = 'exit-runs-row device-acts-row';
    node.setAttribute('role', 'listitem');
    node._at = Number(r.at) || 0;
    const after = [...list.children].find((n) => (n._at || 0) < node._at);
    if (after) list.insertBefore(node, after); else list.appendChild(node);
    rows.set(key, node);
    while (list.children.length > LIMIT) { const last = list.lastElementChild; rows.delete(last.dataset.key); last.remove(); }
    syncEmpty();
    return node;
  };
  async function load() {
    upsert = null;
    list.textContent = ''; rows.clear();
    const q = new URLSearchParams({ limit: String(LIMIT), ...(kind ? { kind } : {}) });
    let d = null;
    try {
      const res = await fetch(`/api/hosts/${encodeURIComponent(hostId)}/device-acts?${q}`);
      d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) throw new Error(heldWordsOf(d) || d.error || `HTTP ${res.status}`);   // a hold by its code: the page's sentence
    } catch (e) {
      body.textContent = t('Could not load the activity') + (e && e.message ? ` — ${e.message}` : '');
      showToast(t('Could not load the activity'), { type: 'error' });
      return false;
    }
    const machine = (d.machine && d.machine.name) || name || hostId;
    const hdr = dialog.querySelector('.dialog-header h3'); if (hdr) hdr.textContent = title(machine);
    note.textContent = t('The last 50 things this VibeSpace did on {machine}, newest first, each with who asked; a row opens its output head.', { machine });
    lostNote.textContent = lostLine(d.lost); lostNote.hidden = !lostNote.textContent;
    for (const r0 of [...(d.acts || [])].reverse()) { const r = rowOf(r0); if (r) place(r); }
    for (const r of queued.splice(0)) place(r);
    upsert = place;
    syncEmpty();
    return true;
  }
  body.textContent = t('Loading…');
  pick.onchange = () => { kind = pick.value; queued.length = 0; load(); };
  const drawn = await (async () => { body.textContent = ''; body.append(note, lostNote, bar, list, empty); return load(); })();
  if (!drawn || !(await ready)) { unhook(); return null; }   // r4: a queued form opens when the open one's ask lets it — null: the person kept that one
  return { close, upsert: (r) => upsert && upsert(r), rows };
}

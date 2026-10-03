// THE MACHINE'S COMMAND LIST (lane-exit-run-output E4, 2026-10-01 — the owner: "侧边栏也看不到指令和结果历史"). "Commands…"
// on a machine (the "Who can use it" dialog's button, the Machines card's button) lists the last 50 commands agents ran
// there — the time, the conversation, the command's head, the verdict (exit N / could not start — why / timed out /
// refused), the duration — and a row opens its output: the first 4 KiB of stdout and stderr the audit line keeps (cut
// SAID). Drawn from a FRESH `GET /api/hosts/:id/exit-runs` (never a broadcast copy), then KEYED ROWS PATCHED IN PLACE
// on every `exit-audit` broadcast (the ONE audit writer notifies — the 2.309.0 rule): a new run lands on top, a row of
// the same key is re-worded without being re-created (an open expander stays open), the list keeps 50. Every string
// of a run (the command, the output, a conversation's name) is textContent — never innerHTML.
import { t, deviceLocale } from './i18n.js';
import { createModalShell, showToast } from './utils.js';
import { runRow, spawnFailureText, platformLabel, RUNS_DEFAULT, EXIT_RUN_TIMEOUT_MS } from '../exit-reach.js';

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const secs = (ms) => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} s`;
const CMD_HEAD = 80;

/** The verdict of a run in the device's words. */
export function runVerdictText(r) {
  if (!r) return '';
  if (r.outcome === 'spawn_failed') return t('could not start — {why}', { why: spawnFailureText(r.spawnError, { interpreter: r.interpreter || 'sh' }) });
  if (r.outcome === 'timed_out') return t('timed out after {s} s', { s: EXIT_RUN_TIMEOUT_MS / 1000 });
  if (r.outcome === 'refused' && r.refusal === 'device_agent_outdated') return t('not run — the agent is too old to run commands on Windows; rerun the install command'); // lane device-upgrade-stuck
  if (r.outcome === 'refused') return t('refused ({code})', { code: r.refusal || '?' });
  return t('exit {code}', { code: r.code == null ? '?' : r.code });
}
/** The row's KEY: the audit line's own id (verify r2 F7 — two runs of one command in the same millisecond were one row);
 *  a line from before the id: the instant + the conversation + the command. */
export const runKeyOf = (r) => (r.id ? `id:${r.id}` : `${Number(r.at) || 0}:${r.sessionKey || ''}:${String(r.cmd || '').slice(0, 200)}`);
const whenText = (at) => { try { return new Date(Number(at) || 0).toLocaleString(deviceLocale(), { hour12: false }); } catch { return new Date(Number(at) || 0).toISOString(); } };

/** The ONE row painter (keyed; `patchRow` re-words an existing node in place). */
function paintRow(node, r) {
  node.dataset.key = runKeyOf(r);
  node.dataset.outcome = r.outcome;
  let sum = node.querySelector(':scope > summary');
  if (!sum) { sum = el('summary', 'exit-runs-sum'); node.appendChild(sum); }
  sum.textContent = '';
  sum.append(el('span', 'exit-runs-when', whenText(r.at)), el('span', 'exit-runs-who', r.name || '?'));
  const cmd = String(r.cmd || '');
  const code = el('code', 'exit-runs-cmd', cmd.length > CMD_HEAD ? cmd.slice(0, CMD_HEAD - 1) + '…' : cmd);
  code.title = cmd;
  sum.append(code, el('span', 'exit-runs-verdict', runVerdictText(r)), el('span', 'exit-runs-ms', secs(r.ms)));
  let body = node.querySelector(':scope > .exit-runs-out');
  if (!body) { body = el('div', 'exit-runs-out'); node.appendChild(body); }
  body.textContent = '';
  const flags = [r.asked ? t('asked you first') : '', r.revokedDuringRun ? t('access was removed while it ran') : '', r.interpreter ? r.interpreter : ''].filter(Boolean);
  if (flags.length) body.appendChild(el('div', 'exit-runs-flags', flags.join(' · ')));
  const any = (r.stdout && r.stdout.trim()) || (r.stderr && r.stderr.trim());
  for (const stream of ['stderr', 'stdout']) {
    const text = String(r[stream] || '');
    if (!text.trim()) continue;
    body.appendChild(el('div', 'exit-runs-stream', stream));
    body.appendChild(el('pre', 'exit-runs-pre', text));
    if (r.cut && r.cut[stream]) body.appendChild(el('div', 'exit-runs-cut', t('cut at 4 KiB')));
  }
  // verify r1 F4: blank-only output is said as such, and its cut too
  if (!any) body.appendChild(el('div', 'exit-runs-none', ((r.stdout || r.stderr) ? t('no visible output') : t('no output')) + ((r.cut && (r.cut.stdout || r.cut.stderr)) ? ` · ${t('cut at 4 KiB')}` : '')));
  return node;
}

/** Open the command list of `hostId`. Resolves when drawn. */
export async function openExitRunsDialog(app, { hostId, name = '' } = {}) {
  let off = null, upsert = null;
  const queued = []; // verify r1 F3: lines that land while the fresh GET is in flight (applied after it; the keyed upsert dedups)
  // verify r1 F3: the listener is armed BEFORE the GET — pre-fix it was armed after the list was drawn, so a run that
  // landed during the GET was in no row until the dialog was reopened (the broadcast missed, the GET too early)
  off = app && app.ws && typeof app.ws.onGlobal === 'function' ? app.ws.onGlobal((m) => {
    if (!m || m.type !== 'exit-audit' || !m.line || String(m.line.hostId || '') !== String(hostId)) return;
    const r = runRow(m.line);   // the ONE audit writer's line, judged by the PURE row rule (never trusted raw)
    if (!r) return;
    if (upsert) upsert(r); else queued.push(r);
  }) : null;
  const unhook = () => { try { off?.(); } catch { } off = null; };
  const { body, close, dialog } = createModalShell({ id: 'exit-runs-dialog', title: t('Commands run on {machine}', { machine: name || hostId }), dialogClass: 'exit-runs-dialog', bodyClass: 'exit-runs-body', escapeToClose: true, onClose: unhook });
  body.textContent = t('Loading…');
  let d = null;
  try {
    const res = await fetch(`/api/hosts/${encodeURIComponent(hostId)}/exit-runs?limit=${RUNS_DEFAULT}`);
    d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`);
  } catch (e) {
    unhook();
    body.textContent = t('Could not load the command list') + (e && e.message ? ` — ${e.message}` : '');
    showToast(t('Could not load the command list'), { type: 'error' });
    return;
  }
  const machine = (d.machine && d.machine.name) || name || hostId;
  const hdr = dialog.querySelector('.dialog-header h3'); if (hdr) hdr.textContent = t('Commands run on {machine}', { machine });
  body.textContent = '';
  const note = el('p', 'agents-note exit-runs-note', t('The last 50 commands agents ran on {machine}, newest first; a row opens its output (the first 4 KiB of each stream).', { machine }));
  body.appendChild(note);
  const plat = d.machine && platformLabel(d.machine.platform);
  if (plat && d.machine.interpreter) body.appendChild(el('p', 'agents-note exit-runs-platform', t('Commands run under {interpreter} ({platform})', { interpreter: d.machine.interpreter, platform: plat })));
  const list = el('div', 'exit-runs-list');
  list.setAttribute('role', 'list');
  const empty = el('p', 'agents-note exit-runs-empty', t('No command has run here yet'));
  body.append(list, empty);
  const rows = new Map(); // key → node
  const syncEmpty = () => { empty.style.display = rows.size ? 'none' : ''; };
  /** KEYED, IN PLACE: an existing row is re-worded (its open state kept), a new one lands by its instant; 50 kept. */
  const place = (r) => {
    const key = runKeyOf(r);
    const had = rows.get(key);
    if (had) { paintRow(had, r); return had; }
    const node = paintRow(document.createElement('details'), r);
    node.className = 'exit-runs-row';
    node.setAttribute('role', 'listitem');
    node._at = Number(r.at) || 0;
    const after = [...list.children].find((n) => (n._at || 0) < node._at);
    if (after) list.insertBefore(node, after); else list.appendChild(node);
    rows.set(key, node);
    while (list.children.length > RUNS_DEFAULT) { const last = list.lastElementChild; rows.delete(last.dataset.key); last.remove(); }
    syncEmpty();
    return node;
  };
  // the fresh list, newest first as the server answers it; then the lines that landed during the GET (keyed: a row
  // the GET already carried is re-worded in place, never doubled); from here the listener places directly
  for (const r of [...(d.runs || [])].reverse()) place({ ...r });
  for (const r of queued.splice(0)) place(r);
  upsert = place;
  syncEmpty();
  return { close, upsert: place, rows };
}

// WHAT THIS VIBESPACE DID ON A MACHINE (lane device-act-audit, design q-042 D4, 2026-10-19). "Activity…" on the Machines card
// lists the last 50 acts the hub took on that machine — a command, a file written, a secret placed, keys typed, a socket to
// another host, an agent update — each with WHO asked (a person's sign-in, a conversation, a job, VibeSpace itself), what
// (a bounded, secret-free summary), the verdict and the duration; a row opens its output head (≤ 200 bytes, redacted).
// Drawn from a FRESH `GET /api/hosts/:id/device-acts` (never a broadcast copy), then KEYED ROWS PATCHED IN PLACE on every
// `device-audit` broadcast (the ONE audit writer notifies — the exit list's rule); a filter by who asked re-reads. Every
// string of a line is textContent (judged again by the PURE row rule) — never innerHTML.
import { t, deviceLocale } from './i18n.js';
import { createModalShell, showToast } from './utils.js';
import { rowOf, kindOf, BY_KINDS } from '../device-acts.js';

const LIMIT = 50;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const whenText = (at) => { try { return new Date(Number(at) || 0).toLocaleString(deviceLocale(), { hour12: false }); } catch { return new Date(Number(at) || 0).toISOString(); } };
const durationText = (ms) => { if (ms == null) return ''; const s = (Math.max(0, Number(ms) || 0) / 1000).toFixed(1); return Number(s) === 0 ? '<0.1 s' : `${s} s`; };
/** WHO asked, in the device's words: the kind's name + the subject's own id. */
export function whoText(by) {
  const k = kindOf(by);
  if (!k) return t('nobody named');
  const id = by.slice(k.length + 1);
  const name = k === 'human' ? t('a person') : k === 'agent' ? t('a conversation') : k === 'job' ? t('a job') : t('VibeSpace');
  return `${name} · ${id}`;
}
/** The verdict of an act in the device's words. */
export function actVerdictText(r) {
  if (!r) return '';
  if (r.code === 'act_without_by') return t('refused: nobody was named for it — never sent');
  if (r.ok === false) return typeof r.code === 'number' ? t('exit {code}', { code: r.code }) : t('failed ({code})', { code: r.code || '?' });
  if (typeof r.code === 'number') return t('exit {code}', { code: r.code });
  return r.ok === true ? t('ok') : '';
}
export const actKeyOf = (r) => (r.id ? `id:${r.id}` : `${Number(r.at) || 0}:${r.op}:${r.by || ''}:${String(r.summary || '').slice(0, 120)}`);

/** The ONE row painter (keyed; an existing node is re-worded in place). */
export function paintActRow(node, r) {
  node.dataset.key = actKeyOf(r);
  node.dataset.layer = r.layer || '';
  node.dataset.ok = r.ok == null ? '' : String(!!r.ok);
  let sum = node.querySelector(':scope > summary');
  if (!sum) { sum = el('summary', 'exit-runs-sum device-acts-sum'); node.appendChild(sum); }
  sum.textContent = '';
  sum.append(el('span', 'exit-runs-when', whenText(r.at)), el('span', 'exit-runs-who device-acts-who', whoText(r.by)));
  const main = el('div', 'exit-runs-main');
  const outcome = el('div', 'exit-runs-outcome');
  outcome.append(el('span', 'device-acts-op', r.op), ' · ', el('span', 'exit-runs-verdict', actVerdictText(r)));
  if (r.ms != null) outcome.append(' · ', el('span', 'exit-runs-ms', durationText(r.ms)));
  main.append(el('code', 'exit-runs-cmd device-acts-what', r.summary || ''), outcome);
  sum.append(main);
  let body = node.querySelector(':scope > .exit-runs-out');
  if (!body) { body = el('div', 'exit-runs-out'); node.appendChild(body); }
  body.textContent = '';
  body.appendChild(el('div', 'exit-runs-flags', `${t('Who asked')}: ${r.by || t('nobody named')} · ${r.layer === 'code' ? t('new agent code') : t('an act')}`));
  if (r.outHead) { body.appendChild(el('div', 'exit-runs-stream', t('output head'))); body.appendChild(el('pre', 'exit-runs-pre chat-pre-wrapped', r.outHead)); }
  else body.appendChild(el('div', 'exit-runs-none', t('no output kept')));
  return node;
}

/** Open the activity list of `hostId`. Resolves when drawn. */
export async function openDeviceActsDialog(app, { hostId, name = '' } = {}) {
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
  const { body, close, dialog } = createModalShell({ id: 'device-acts-dialog', title: title(name), dialogClass: 'exit-runs-dialog device-acts-dialog', bodyClass: 'exit-runs-body', escapeToClose: true, onClose: unhook });
  const note = el('p', 'agents-note exit-runs-note', t('The last 50 things this VibeSpace did on {machine}, newest first, each with who asked; a row opens its output head.', { machine: name || hostId }));
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
    if (had) { paintActRow(had, r); return had; }
    const node = paintActRow(document.createElement('details'), r);
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
      if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`);
    } catch (e) {
      body.textContent = t('Could not load the activity') + (e && e.message ? ` — ${e.message}` : '');
      showToast(t('Could not load the activity'), { type: 'error' });
      return false;
    }
    const machine = (d.machine && d.machine.name) || name || hostId;
    const hdr = dialog.querySelector('.dialog-header h3'); if (hdr) hdr.textContent = title(machine);
    note.textContent = t('The last 50 things this VibeSpace did on {machine}, newest first, each with who asked; a row opens its output head.', { machine });
    for (const r0 of [...(d.acts || [])].reverse()) { const r = rowOf(r0); if (r) place(r); }
    for (const r of queued.splice(0)) place(r);
    upsert = place;
    syncEmpty();
    return true;
  }
  body.textContent = t('Loading…');
  pick.onchange = () => { kind = pick.value; queued.length = 0; load(); };
  const drawn = await (async () => { body.textContent = ''; body.append(note, bar, list, empty); return load(); })();
  if (!drawn) { unhook(); return null; }
  return { close, upsert: (r) => upsert && upsert(r), rows };
}

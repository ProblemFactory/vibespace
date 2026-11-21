// THE VAULT ROW'S BACKGROUND JOBS (lane vault-job-approval — design-vault-service-secret L2, the owner's decisions ③ ④). An
// entry a Background job is approved to use (its vault-job grant row — src/server/vault-job-door.js rowFacts, the contents
// list's `row.jobs`) shows ONE chip per job: «Background job: <name> · running / waiting for the unlock / stopped · started
// N×» — the state a CODE the hub sends, worded here in the viewer's language — each with its ✕. The ✕ TAKES IT BACK and STOPS
// the job at once (POST /api/vault/job/revoke — a person's click: narrowing asks no second password); its confirm says so,
// and that a value the program already read cannot be taken back (rotate the key at its provider). A lock stops nothing — the
// chip says «running» while the vault is locked. Nothing here holds a value: names, ids, codes, counts.
import { t } from './i18n.js';
import { fetchJson, showToast, showConfirmDialog } from './utils.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const STATE_CLS = Object.freeze({ running: 'vw-job-running', 'waiting-vault': 'vw-job-waiting-vault', 'waiting-approval': 'vw-job-waiting-approval', scheduled: 'vw-job-scheduled', stopped: 'vw-job-stopped' });
const STATES = Object.keys(STATE_CLS);
const stateWord = (s) => (s === 'running' ? t('running') : s === 'waiting-vault' ? t('waiting for the unlock') : s === 'waiting-approval' ? t('waiting for your approval') : s === 'scheduled' ? t('scheduled') : t('stopped'));
/** the ✕: confirm (what it does, what it cannot undo), then the hub's take-back — the entry and the job captured BEFORE the
 *  dialog opens (the approval census's capture rule: a broadcast redraws the row while it is open) */
export async function takeBackJob(entry, job, name, refresh) {   // + the job card's ✕ (src/lib/jobs-panel.js)
  const ok = await showConfirmDialog({ title: t('Take it back from «{name}»?', { name }), message: t('It stops the job now. A value it already read cannot be taken back — rotate the key at its provider to end it.'), confirmText: t('Take back and stop'), danger: true });
  if (!ok) return;
  const r = await fetchJson('/api/vault/job/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry, job }) });
  if (r && r.ok) { showToast(r.stopped ? t('Taken back — the job is stopped') : t('Taken back — its next start asks you again')); if (typeof refresh === 'function') refresh(); return; }
  // the approvals' store unreadable (主开发 r850 item 4): the job DID stop and nothing was written — said in the person's language, never the bare code
  if (r && r.code === 'store_unreadable') { showToast(r.stopped ? t('The job is stopped — but the approvals could not be read, so nothing was written; its next start asks you again') : t('The approvals could not be read — nothing was written; try again in a moment'), { type: 'warn', duration: 9000 }); if (typeof refresh === 'function') refresh(); return; }
  showToast((r && r.error) || t('server unreachable'), { type: 'error' });
}
/** The row's job chips → { box } (empty box when the row has none) */
export function jobExtras(row, { refresh } = {}) {
  const box = el('div', 'vw-ak-grants vw-job-chips');
  const entry = String((row && row.id) || '');
  for (const j of Array.isArray(row && row.jobs) ? row.jobs : []) {
    if (!j || typeof j !== 'object' || !/^jb-[0-9a-f]{8}$/.test(String(j.id || ''))) continue;
    const state = STATES.includes(j.state) ? j.state : 'stopped', name = String(j.name || j.id), id = String(j.id);
    const chip = el('span', `vw-ak-chip vw-job-chip ${STATE_CLS[state]}`);
    chip.append(el('span', 'vw-job-chip-words', [t('Background job: {name}', { name }), stateWord(state), ...(Number(j.starts) > 0 ? [t('started {n}×', { n: Number(j.starts) })] : [])].join(' · ')));
    chip.title = id;
    const x = el('button', 'vw-ak-x vw-job-x', '✕');
    x.type = 'button'; x.title = t('Take it back — the job stops now'); x.setAttribute('aria-label', x.title);
    x.onclick = (ev) => { ev.stopPropagation(); takeBackJob(entry, id, name, refresh); };
    chip.append(x);
    box.append(chip);
  }
  return { box };
}

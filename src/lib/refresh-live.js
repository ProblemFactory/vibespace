// 「刷新所有活着的会话」 — the session list's ⋯ menu entry and its confirm (lane refresh-live-sessions, userW's ask
// inc-mv8jk9wy-35s1; the owner 2026-10-15: a MANUAL press only, no automatic skill detection).
//
// The press opens ONE modal: the count of live sessions the note will reach (and of the open stopped / read-only
// ones it skips), the note itself — editable, pre-filled in the device's language — and 确定 / 取消. 确定 POSTs
// `/api/sessions/refresh-note`; the server queues the note into each live conversation's stash (src/server/
// stash-handover.js `refreshLive`), so it rides that conversation's NEXT turn: free, never a wake. Every client's
// strip above the composer shows it through the existing `stash` fact. The count here and the server's queue are the
// SAME PURE rule (src/refresh-note.js `refreshPlan`); the toast says what the server actually queued.
import { createModalShell, fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { attachDictation, voiceField } from './voice-input.js'; // the microphone on every message box (lane voice-everywhere)
import { enterSubmits } from './chat-enter-keys.js';
import { REFRESH_NOTE_MAX, noteText, refreshPlan } from '../refresh-note.js';

export const REFRESH_ICON = UI_ICONS.refresh;

/** The note's default words, in the device's language. */
export const defaultNote = () => t('Shared skills / context were updated: re-read the skills and CLAUDE.md you use, then continue.');

/** The plan's rows on THIS client: every live session the server listed (the `active-sessions` payload), and every
 *  open window on a conversation that is not live — a history view (read-only) or a session that ended (stopped). */
export function refreshRows(app) {
  const rows = [];
  for (const s of (app && app.sidebar && app.sidebar._webuiSessions) || []) {
    if (!s || !s.id) continue;
    rows.push({ id: s.id, conversationId: s.backendSessionId || s.claudeSessionId || null, state: 'live' });
  }
  const wins = app && app.wm && app.wm.windows;
  for (const w of wins && typeof wins.values === 'function' ? wins.values() : []) {
    const spec = w && w._openSpec;
    const cid = spec && (spec.backendSessionId || spec.claudeSessionId);
    if (!cid || (spec.action !== 'viewSession' && spec.action !== 'attachSession')) continue;
    const view = app.sessions && app.sessions.get(w.id);
    if (spec.action === 'viewSession') rows.push({ id: 'win:' + w.id, conversationId: cid, state: 'read-only' });
    else if (view && view._readOnly) rows.push({ id: 'win:' + w.id, conversationId: cid, state: 'stopped' });
  }
  return rows;
}

/** The toast after the server answered. */
export function refreshDoneWords(r) {
  const n = Number(r && r.queued) || 0, m = Number(r && r.skipped) || 0;
  return m ? t('Queued for {n}, skipped {m} stopped', { n, m }) : t('Queued for {n} live session(s) — on their next turn', { n });
}

/** Open the confirm. Resolves with the server's answer, or null when cancelled. */
export function openRefreshLive(app) {
  return new Promise((resolve) => {
    const rows = refreshRows(app);
    const probe = refreshPlan(rows, 'x');   // the counts (the note is judged below, as it is typed)
    let done = false;
    let voice = null;
    const finish = (v) => { if (done) return; done = true; try { voice && voice.destroy(); } catch { } resolve(v); };
    // one subject: every live session at once — one refresh at a time
    const { overlay, dialog, body, close, raised } = createModalShell({ id: 'refresh-live-dialog', title: t('Refresh all live sessions'), dialogClass: 'refresh-live-dialog', escapeToClose: true, onClose: () => finish(null), kind: 'form' });
    if (raised) return null;   // raised: the same subject's form, as it was
    const p = (cls, text) => { const e = document.createElement('p'); e.className = cls; e.textContent = text; return e; };
    const n = probe.queue.length, m = probe.skipped.length;
    body.append(p('dialog-hint refresh-live-count', n
      ? t('{n} live session(s) will be reminded (on their next turn — no wake, no charge)', { n })
      : t('No session is live right now — nothing to remind')));
    if (m) body.append(p('dialog-hint refresh-live-skip', t('{n} open session(s) that stopped or are read-only will be skipped', { n: m })));
    const label = document.createElement('label');
    label.className = 'refresh-live-label';
    label.append(document.createTextNode(t('The note (each session reads it on its next turn)')));
    const box = document.createElement('textarea');
    box.className = 'refresh-live-note';
    box.rows = 4;
    box.value = defaultNote();
    voice = attachDictation(box);
    label.append(voiceField(box, voice));
    const meta = document.createElement('div');
    meta.className = 'refresh-live-meta';
    const err = p('dialog-hint dialog-error refresh-live-error', '');
    err.setAttribute('role', 'alert');
    const count = p('refresh-live-chars', '');
    meta.append(err, count);
    body.append(label, meta);
    const footer = document.createElement('div');
    footer.className = 'dialog-footer';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn-cancel'; cancel.textContent = t('Cancel');
    const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn-create'; ok.textContent = t('OK');
    footer.append(cancel, ok);
    dialog.append(footer);
    const judge = () => {
      const v = noteText(box.value);
      count.textContent = `${[...v.text].length} / ${REFRESH_NOTE_MAX}`;
      const why = v.error === 'empty' ? t('Write the note first') : v.error === 'too-long' ? t('The note is longer than {n} characters', { n: REFRESH_NOTE_MAX }) : '';
      err.textContent = why;
      err.hidden = !why;
      ok.disabled = !!why || !n;
      return !why && !!n;
    };
    box.addEventListener('input', judge);
    judge();
    cancel.onclick = () => close();
    const submit = async () => {
      if (!judge() || ok.disabled) return;
      ok.disabled = true; cancel.disabled = true;
      // RE-READ at the answer (lane dialog-yield r2): a form stays open beside the work — the windows that stopped or opened
      // meanwhile are the ones skipped now (the server counts the live ones itself; the toast says what it queued)
      const rowsNow = refreshRows(app), planNow = refreshPlan(rowsNow, 'x');
      const othersNow = rowsNow.filter((x) => x.state !== 'live' && planNow.skipped.includes(x.id)).map((x) => ({ conversationId: x.conversationId, state: x.state }));
      const r = await fetchJson('/api/sessions/refresh-note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: box.value, others: othersNow }) });
      if (!r || r.error || !r.ok) {
        ok.disabled = false; cancel.disabled = false;
        showToast(t('Refresh not queued: {why}', { why: (r && r.error) || t('server unreachable') }), { type: 'error' });
        return;
      }
      overlay.remove();
      finish(r);
      showToast(refreshDoneWords(r) + (r.failed ? ' · ' + t('{n} could not be queued', { n: r.failed }) : ''), { type: r.failed ? 'error' : 'info', duration: 6000 });
    };
    ok.onclick = submit;
    box.addEventListener('keydown', (e) => { if (enterSubmits(e) && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
    setTimeout(() => { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }, 0);
  });
}

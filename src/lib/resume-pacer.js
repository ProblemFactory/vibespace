// THE BULK RESUME, PACED (lane resume-all-paced, L1 — the field incident of 2026-11-16, twice on one fleet instance: after a
// restart the boot offer's «Resume all» fired one resume every 400 ms on a fixed clock whatever the hub had answered; 68
// conversations were created in five minutes, about forty of them with transcripts of 100–184 MB; the hub's main loop was held
// 10–139 s, its memory went from 2.3 to 18 GiB, the sign-in page went unanswered for five minutes and the instance's liveness
// probe restarted it — every conversation just resumed died again. The sidebar's group button fired every resume in ONE
// synchronous loop.)
//
// THE LAW: a bulk resume never floods the hub. ONE create in flight: the next conversation is resumed when the previous one's
// create has ENDED — the hub's answer (created, or refused), an error the hub sent, the window closed, or a socket lost with no
// resend (createSession's `onCreateEnd`) — never on a clock, and never at the 15 s reply watchdog: a hub too slow to answer is
// a hub not to feed. One in flight, not a few: the hub does a resume's pre-resume read and continuity check on its main thread,
// so two creates in flight hold its loop twice as long and save the person nothing (the creates are answered one by one).
// The person sees it as it goes («Resuming 12 of 68…») and can stop it; a refusal or a failure of one is said and the rest go on.
import { showToast } from './utils.js';
import { t } from './i18n.js';

const FOREVER_MS = 24 * 3600e3;   // the progress line stays until the bulk ends (a toast's timer must stay under 2^31 ms)
const LIST_MAX = 5;               // the names a failure line lists before «and N more»

/** One resume through the app's ONE door, and its create's END → Promise<{how, msg, row}>. `how`: 'created' | 'refused' |
 *  'error' | 'lost' | 'closed' (createSession's onCreateEnd), 'none' (no create was sent: the conversation runs live and its
 *  row was attached, it was focused, or another resume of it is in flight), 'threw'. */
export function resumeAndWait(app, d, extra = {}) {
  return new Promise((resolve) => {
    let done = false;
    const end = (how, msg = null, row = null) => { if (!done) { done = true; resolve({ how, msg, row }); } };
    const opts = d.opts || {};
    const backend = opts.backend || 'claude', cid = opts.backendSessionId || d.sessionId;
    let r = null;
    try {
      r = app.resumeSession(d.sessionId, d.cwd, d.name, { ...opts, ...extra, onCreateEnd: (how, msg) => end(how, msg, r && r.row ? r.row : null) });
    } catch (e) { end('threw', { error: (e && e.message) || String(e) }); return; }
    const row = r && r.row ? r.row : null;
    // a create in flight is the pending resume of THIS conversation (createSession's _resumeWins) — and not one we joined
    const sent = !(r && r.pending) && !!(app._pendingResumeWin && app._pendingResumeWin(backend, cid));
    if (!sent) end('none', null, row);
  });
}

/** Resume `items` ({sessionId, cwd, name, opts}) ONE AT A TIME, each when the previous one's create has ended; the progress
 *  said as it goes, Stop at hand. → {total, resumed, rows, failed: [{name, why}], stopped} */
export async function resumePaced(app, items, { extra = { stay: true } } = {}) {
  const list = (items || []).filter(Boolean), n = list.length;
  const out = { total: n, resumed: 0, rows: 0, failed: [], stopped: false };
  if (!n) return out;
  let el = null, body = null, stop = false;
  const shown = (e) => !!e && e.isConnected !== false && !e.removed;   // a burst of toasts can push it out (showToast caps the stack): then a new one
  const words = (i) => (out.failed.length
    ? t('Resuming {i} of {n} — {f} could not be resumed', { i, n, f: out.failed.length })
    : t('Resuming {i} of {n}…', { i, n }));
  const say = (i) => {
    if (n < 2) return;
    if (shown(el) && body) { body.textContent = words(i); return; }   // ONE line, updated in place
    el = showToast(words(i), { type: 'info', duration: FOREVER_MS, actions: [{ label: t('Stop'), run: () => { stop = true; } }] });   // a click on Stop closes it (showToast's action)
    body = el ? [...(el.children || [])].find((c) => /(^| )global-toast-body( |$)/.test(String(c.className || ''))) || null : null;
    if (el && el.dataset) el.dataset.progress = 'resume-all';
  };
  for (let i = 0; i < n; i++) {
    if (stop) { out.stopped = true; break; }
    say(i + 1);
    const d = list[i];
    const r = await resumeAndWait(app, d, extra);
    if (r.row) out.rows++;
    const code = r.msg && r.msg.code;
    if (r.how === 'created' || r.how === 'none' || (r.how === 'refused' && code === 'resume-already-live')) out.resumed++;
    else if (r.how === 'closed') { /* the person closed its window while it started: theirs, not a failure */ }
    else out.failed.push({ name: String(d.name || d.sessionId || '').slice(0, 80), why: String((r.msg && (r.msg.error || r.msg.message || r.msg.code)) || r.how).slice(0, 160) });
  }
  if (shown(el)) el.remove();
  if (out.failed.length) {
    const names = out.failed.slice(0, LIST_MAX).map((f) => `${f.name} (${f.why})`).join('; ') + (out.failed.length > LIST_MAX ? ' ' + t('and {n} more', { n: out.failed.length - LIST_MAX }) : '');
    showToast(t('{f} of {n} conversations could not be resumed: {list}', { f: out.failed.length, n, list: names }), { type: 'error', duration: 15000 });
  }
  if (out.stopped) {
    const done = out.resumed + out.failed.length;
    showToast(t('Stopped: {done} of {n} resumed — the other {left} were not started.', { done: out.resumed, n, left: n - done }), { type: 'info', duration: 8000 });
  }
  return out;
}

/** THE SIDEBAR'S GROUP BUTTON («Resume all sessions in …», sidebar-tasks.js): a live member is attached and a tmux one opened
 *  at once (no create); every STOPPED member is resumed through the same pace. → resumePaced's answer */
export function resumeGroup(app, sessions, { nameOf = (s) => s.name } = {}) {
  const stopped = [];
  for (const s of sessions || []) {
    const agentOpts = {
      backend: s.backend || 'claude', backendSessionId: s.backendSessionId || s.sessionId,
      agentKind: s.agentKind || 'primary', agentRole: s.agentRole || '',
      agentNickname: s.agentNickname || '', sourceKind: s.sourceKind || '',
      parentThreadId: s.parentThreadId || null,
      hostId: s.host || undefined, keeperSid: s.keeperSid || undefined, // remote members resume ON their host
    };
    if (s.status === 'stopped') stopped.push({ sessionId: s.sessionId, cwd: s.cwd, name: nameOf(s) || s.name, opts: agentOpts });
    else if (s.status === 'live' && s.webuiId) app.attachSession(s.webuiId, s.webuiName || s.name, s.cwd, { mode: s.webuiMode, ...agentOpts });
    else if (s.status === 'tmux') app.attachTmuxSession(s.tmuxTarget, s.name, s.cwd);
  }
  return resumePaced(app, stopped, { extra: {} });   // a press on a group's button: each resume as a press would (no `stay`)
}

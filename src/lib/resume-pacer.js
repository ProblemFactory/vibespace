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

/** B-f64b cure (主开发 11:47Z, as if a must): a row whose LIVENESS is not known yet (codex: the liveness walk has not answered —
 *  a codex the person runs in another terminal may be it) is NEVER started by anything automatic (the paced resume, the boot's
 *  «resume all», a layout restore): only a person's own press on that one row, after «still checking» was said. */
export const livenessUnknown = (s) => !!s && s.status === 'stopped' && s.liveness === 'unknown';
export const unknownRowOf = (rows, backend, id) => (rows || []).find((s) => livenessUnknown(s) && (s.backend || 'claude') === (backend || 'claude') && (s.backendSessionId || s.sessionId) === id) || null;

const FOREVER_MS = 24 * 3600e3;   // the progress line stays until the bulk ends (a toast's timer must stay under 2^31 ms)
const LIST_MAX = 3;               // the names a failure line lists before «and N more» (S3: one phone screen)

/** ONE LANE FOR EVERY BULK CREATE (B-864f): the pace's resumes and the resumes a conversation waiting for the vault starts by
 *  itself at the unlock (src/lib/session-lifecycle.js) take their turns in ONE queue — `fn` starts when the previous turn's
 *  create has ended (its promise settled), so two bulk roads never have two creates in flight. → fn's promise */
let lane = Promise.resolve();
export function inTurn(fn) {
  const run = lane.then(() => fn());
  lane = run.then(() => { }, () => { });
  return run;
}

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
    if (r && r.checking) { end('checking', null, row); return; }   // B-f64b cure 2: held by the backstop — not resumed, and named
    // a create in flight is the pending resume of THIS conversation (createSession's _resumeWins) — and not one we joined
    const sent = !(r && r.pending) && !!(app._pendingResumeWin && app._pendingResumeWin(backend, cid));
    if (!sent) end('none', null, row);
  });
}

/** WHY ONE WAS NOT RESUMED, in the person's words (M4 of 主开发's look, 19:11Z): the hub's own text when it sent one; else a sentence of
 *  ours for each end — never the pace's end word or a page's exception text */
function whyNotResumed(r) {
  // B-864f: a folder on a mount that waits — the page's words (the hub's sentence is long, and a person's tray is no log)
  if (r.how === 'refused' && r.msg && r.msg.code === 'vault_locked' && r.msg.cwd) return t('its folder waits for the vault');
  if (r.how === 'refused' && r.msg && r.msg.code === 'mount_down') return t('its folder is on a mount that is not up');
  const hub = r.how !== 'threw' && r.msg && (r.msg.error || r.msg.message);
  if (hub) return String(hub);
  switch (r.how) {
    case 'lost': return t('the connection dropped before the server answered');
    case 'error': return t('the server reported an error without a reason');
    case 'refused': return t('the server refused it without a reason');
    case 'threw': return t('it could not be started on this page');
    case 'checking': return t('still checking whether it runs in another terminal');
    default: return t('it was not resumed');
  }
}
const NAME_MAX = 40, WHY_MAX = 60;   // S3: the failure line reads on one phone screen (3 names × (40 + 60) characters at most)
const cut = (x, n) => { const v = String(x || ''); return v.length > n ? v.slice(0, n - 1) + '…' : v; };

/** Resume `items` ({sessionId, cwd, name, opts}) ONE AT A TIME, each when the previous one's create has ended; the progress
 *  said as it goes, Stop at hand. `extra` = the first resume's options, `later` = every later one's (M2: only the press acts as a
 *  press — a group's later members start after the press's moment and take neither the focus nor the desktop on show).
 *  → {total, resumed, rows, failed: [{name, why}], closed, stopped} */
export async function resumePaced(app, items, { extra = { stay: true }, later = null } = {}) {
  const list = (items || []).filter(Boolean), n = list.length;
  const out = { total: n, resumed: 0, rows: 0, failed: [], closed: 0, waiting: 0, stopped: false };
  if (!n) return out;
  let el = null, body = null, stopping = null, stop = false;
  const shown = (e) => !!e && e.isConnected !== false && !e.removed;   // a burst of toasts can push it out (showToast caps the stack): then a new one
  const words = (i) => (out.failed.length
    ? t('Resuming {i} of {n} — {f} could not be resumed', { i, n, f: out.failed.length })
    : t('Resuming {i} of {n}…', { i, n }));
  // S1: Stop is answered where it was pressed, at once — the create now starting finishes (minutes on a slow hub), nothing follows
  const onStop = () => {
    stop = true;
    if (!stopping) { stopping = showToast(t('Stopping after the conversation now starting…'), { type: 'info', duration: FOREVER_MS }); if (stopping && stopping.dataset) stopping.dataset.progress = 'resume-all-stopping'; }
  };
  const say = (i) => {
    if (n < 2 || stop) return;
    if (shown(el) && body) { body.textContent = words(i); return; }   // ONE line, updated in place
    el = showToast(words(i), { type: 'info', duration: FOREVER_MS, actions: [{ label: t('Stop'), run: onStop }] });   // a click on Stop closes it (showToast's action)
    body = el ? [...(el.children || [])].find((c) => /(^| )global-toast-body( |$)/.test(String(c.className || ''))) || null : null;
    if (el && el.dataset) el.dataset.progress = 'resume-all';
  };
  for (let i = 0; i < n; i++) {
    if (stop) { out.stopped = true; break; }
    say(i + 1);
    const d = list[i];
    const r = await inTurn(() => resumeAndWait(app, d, i > 0 && later ? later : extra));
    if (r.row) out.rows++;
    const code = r.msg && r.msg.code;
    if (r.how === 'created' || r.how === 'none' || (r.how === 'refused' && code === 'resume-already-live')) out.resumed++;
    else if (r.how === 'closed') out.closed++;   // the person closed its window while it started: theirs, not a failure
    else if (r.how === 'refused' && r.msg && r.msg.resumesAtUnlock) out.waiting++;   // B-864f: its window resumes it at the unlock
    else out.failed.push({ name: cut(d.name || d.sessionId, NAME_MAX), why: cut(whyNotResumed(r), WHY_MAX) });
  }
  if (stop && !out.stopped && out.resumed + out.failed.length + out.closed + out.waiting < n) out.stopped = true;
  if (shown(el)) el.remove();
  if (shown(stopping)) stopping.remove();
  if (out.failed.length) {
    const names = out.failed.slice(0, LIST_MAX).map((f) => t('{name} ({why})', { name: f.name, why: f.why })).join(t(', ')) + (out.failed.length > LIST_MAX ? ' ' + t('and {n} more', { n: out.failed.length - LIST_MAX }) : '');   // each language its own brackets and separator
    showToast(t('{f} of {n} conversations could not be resumed: {list}', { f: out.failed.length, n, list: names }), { type: 'error', duration: 15000 });
  }
  if (out.waiting) showToast(t('{w} of {n} conversations wait for the vault \u2014 while this page is open, each resumes by itself once you unlock it.', { w: out.waiting, n }), { type: 'info', duration: 15000 });
  if (out.stopped) {
    // S2: the three numbers add up to the total — resumed, not resumed (refused, failed, or closed by the person), not started
    const notResumed = out.failed.length + out.closed + out.waiting, left = n - out.resumed - notResumed;
    showToast(t('Stopped: {r} of {n} resumed, {x} not resumed, {left} not started.', { r: out.resumed, n, x: notResumed, left }), { type: 'info', duration: 8000 });
  }
  return out;
}

/** THE SIDEBAR'S GROUP BUTTON («Resume all sessions in …», sidebar-tasks.js): a live member is attached and a tmux one opened
 *  at once (no create); every STOPPED member is resumed through the same pace — the FIRST in the press's own moment, as the press
 *  (its window raised, its row's desktop shown, as one press of one member would); every later one QUIET (`stay`: drawn, never
 *  focused, no desktop switch — it starts seconds or minutes after the press, while the person works elsewhere). → resumePaced's answer */
export function resumeGroup(app, sessions, { nameOf = (s) => s.name } = {}) {
  const stopped = [], checking = [];
  for (const s of sessions || []) {
    if (livenessUnknown(s)) { checking.push(nameOf(s) || s.name); continue; }   // B-f64b cure: never started by a group press
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
  if (checking.length) showToast(t('{n} not resumed: still checking whether they run in another terminal — resume each one by itself', { n: checking.length }), { type: 'info', duration: 6000 });
  return resumePaced(app, stopped, { extra: {}, later: { stay: true } });
}

/** the group button's press: the pace started, and anything thrown inside it SAID (S3 — never an unhandled rejection) */
export function pressResumeGroup(app, sessions, opts) {
  let p;
  try { p = resumeGroup(app, sessions, opts); } catch (e) { p = Promise.reject(e); }
  return Promise.resolve(p).catch((e) => {
    console.warn('[resume-all] the group\'s resume stopped early:', e);
    showToast(t('Resuming the group stopped early because of an error on this page.'), { type: 'error', duration: 8000 });
    return null;
  });
}

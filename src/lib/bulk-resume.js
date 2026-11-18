// THE TWO BULK ACTS, ON THE PAGE (lane auto-resume-bulk, .349 — userW's fleet, 2026-10-23: dozens of conversations
// stopped on usage walls the same day with auto-resume off, and nobody will open and resume them one by one).
//   setAutoResumeForAll(app, on)  «对所有会话开启自动继续» / «全部关闭» — the server flips every live session (the
//                                 per-session setEnabled road, one list broadcast); the RESUME CARRIER of every session
//                                 the sidebar knows (live or stopped — user-state sessionConfigs.autoResume) is written
//                                 in ONE push, so a later resume keeps the choice. The instance default for NEW sessions
//                                 (Settings → `claude.autoResumeOnLimit`) is never changed by it.
//   openResumeStoppedDialog(app)  «恢复所有因用量/过载停止的会话 (N)» — the confirm says the batch's expected COST before
//                                 anything runs (src/bulk-resume-cost.js: dollars + the 5 h window share per member),
//                                 then ONE POST (the person's own press — attended, the owner's ruling 2026-11-18) and the paced
//                                 continues' progress until the outcome line («恢复了 29 个 · 跳过 8 个（仍在限额内）· 拒绝 0»).
// Both are reached from Settings → Spending (the auto-resume row) and the session list's ⋯ menu.
import { t } from './i18n.js';
import { api, fetchJson, createModalShell, showToast } from './utils.js';
import { autoResumeAllWords, resumeButtonWords, waitingCount, skipGroups, summaryWords, refusedWords, memberWords } from '../stopped-by.js';
import { costWords } from '../bulk-resume-cost.js';
import { stampAt } from './page-time.js';   // the ONE formatter of a time a person reads
import { autoResumeCapsFor } from './agent-meta.js';

const POLL_MS = 1000;

/** GET the plan the row and the dialog show first: {ok, counts, eligible, skipped, estimate, running}. */
export function fetchStoppedPlan() { return fetchJson('/api/sessions/stopped'); }

/** Flip auto-resume for every session (live: the server; live AND stopped: the resume carrier, one push). */
export async function setAutoResumeForAll(app, on) {
  const r = await api('/api/sessions/auto-resume-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !!on }) });
  const sb = app && app.sidebar;
  let carriers = 0;
  if (sb && typeof sb.setSessionConfigs === 'function') {
    const pairs = [];
    for (const s of sb._allSessions || []) {
      // VibeSpace's own sessions only (a webui id: live, or stopped and kept) — never an archived one or a transcript the
      // walk merely found (turning those on would make a months-old conversation continue by itself when next resumed)
      if (!s.webuiId || (typeof sb.isArchived === 'function' && sb.isArchived(s))) continue;
      if (!autoResumeCapsFor(s.backend || 'claude').supported) continue;   // no resume verb ⇒ nothing to turn on
      const cfg = (sb.getSessionConfig && sb.getSessionConfig(s)) || {};
      if (cfg.autoResume === !!on) continue;
      pairs.push([s, { autoResume: !!on }]);   // a PATCH — setSessionConfigs writes it over the saved config
    }
    if (pairs.length) sb.setSessionConfigs(pairs);
    carriers = pairs.length;
  }
  return { ...r, carriers };
}

/** The Settings row's / the menu's words for the current plan. */
export function planWords(plan) {
  if (!plan || !plan.ok) return null;
  const counts = autoResumeAllWords({ total: plan.counts ? plan.counts.total : 0, on: plan.counts ? plan.counts.on : 0 }, t);
  const n = plan.eligible ? plan.eligible.length : 0;
  const cw = n ? costWords(plan.estimate, t) : null;
  return { ...counts, n, resumeButton: resumeButtonWords(n, t, { waiting: waitingCount(plan.skipped) }), passive: cw ? cw.passive : null };
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

/** A door's refusal code (a plan read keeps it; a refused POST reaches here through api() as its message alone). */
function codeOf(r) {
  const msg = r && r.message ? String(r.message) : '';
  return (r && r.code) || (msg === 'a resume of the stopped sessions is already running' ? 'in_flight' : msg === 'auto-continue is not running' ? 'not_running' : msg === 'the bulk acts are pressed on this instance’s own page' ? 'not_a_page' : null);
}
/** A door's refusal in the person's words, by its code (never the hub's English sentence). */
function answerWords(r) {
  const code = codeOf(r);
  if (code === 'not_running') return t('Auto-continue is not running on this hub — reopen VibeSpace and try again.');
  if (code === 'in_flight') return t('A resume of these sessions is already running — following it here.');
  if (code === 'not_a_page') return t('The bulk acts are pressed on this VibeSpace page only.');
  return null;
}
/** The spend ceiling's refusal of a WHOLE batch, in the person's words: the bucket, what it has left, what the batch needs. */
/** …and WHERE that ceiling is changed (U2 cure: a refusal that names a value names its door — the Settings row's own label). */
function capDoorWords(why) {
  const setting = why === 'hour-cap' ? t('Unattended turns per account per hour') : why === 'day-cap' ? t('Unattended turns per account per day') : why === 'instance-cap' ? t('Unattended turns for this instance per day')
    : why === 'overage-in-use' ? t('\u26a0 Allow unattended turns while an account bills paid overage') : null;   // form two: the door where the person changes it
  return setting ? ' ' + t('Change it in Settings → Spending → «{setting}».', { setting }) : '';
}
function batchRefusalWords(f) {
  if (!f) return '';
  const who = (f.identity && f.identity.name) ? memberWords(f.identity.name, t) : t('this account');   // the machine's own login in words, never its key
  const left = Number.isFinite(f.left) ? f.left : null, need = Number.isFinite(f.need) ? f.need : f.n;
  const where = capDoorWords(f.why);
  // EVERY account refused (form two): the press starts nothing and names each one
  if (Array.isArray(f.slots) && f.slots.length > 1) return f.slots.map((x) => t('The spend guard refused it on {member} ({why}).', { member: x.name ? memberWords(x.name, t) : t('this account'), why: refusedWords(x.why, t) || x.why || '?' })).join(' ') + capDoorWords(f.slots.some((x) => x.why === 'overage-in-use') ? 'overage-in-use' : null);
  if (f.why === 'hour-cap' && left !== null) return t('{member} can take {left} more turns nobody typed this hour; this batch needs {need}.', { member: who, left, need }) + where;
  if (f.why === 'day-cap' && left !== null) return t('{member} can take {left} more turns nobody typed today; this batch needs {need}.', { member: who, left, need }) + where;
  if (f.why === 'instance-cap' && left !== null) return t('This VibeSpace can take {left} more turns nobody typed today; this batch needs {need}.', { left, need }) + where;
  return t('The spend guard refused it on {member} ({why}).', { member: who, why: refusedWords(f.why, t) || f.why || '?' }) + where;   // the account BY NAME (paid overage, a credential, the spend control)
}

/** The confirm → the batch → its outcome. Resolves with the final batch record (null = nothing ran). */
export async function openResumeStoppedDialog(app, { plan = null, onDone = null } = {}) {
  const p = plan || await fetchStoppedPlan();
  let closed = false, resolveOuter = null;   // Escape / Close / the backdrop: the poll below stops, the promise settles
  let runningId = null;                      // a batch this dialog follows that has not ended (U2 cure, law 3: Close SAYS it keeps running)
  const shell = createModalShell({ id: 'resume-stopped-dialog', title: t('Resume sessions a limit or overload stopped'), dialogClass: 'resume-stopped-dialog', escapeToClose: true, kind: 'decision', onClose: () => {
    closed = true;
    if (runningId) showToast(t('The resume keeps running — reopen it from the session list’s ⋯ menu or Settings → Spending to stop it.'));
    try { resolveOuter && resolveOuter(null); } catch { }
  } }); // decision: a consent — N billed turns go out when the person presses (their own act, the owner's ruling 2026-11-18), after the cost is shown
  const { body, dialog, close } = shell;
  const footer = el('div', 'dialog-footer');
  dialog.appendChild(footer);
  const cancel = el('button', 'btn-cancel', t('Close'));
  cancel.onclick = () => close();
  if (!p || !p.ok) {
    body.appendChild(el('p', 'dialog-hint', answerWords(p) || t('Could not read the stopped sessions — try again.')));
    footer.appendChild(cancel);
    return null;
  }
  const n = p.eligible.length;
  // EVERY skipped row, grouped by its reason with the count (U2 cure: never cut with «and n more»; the box scrolls)
  const skippedList = (rows) => {
    if (!rows || !rows.length) return null;
    const box = el('div', 'resume-stopped-skipped');
    box.appendChild(el('div', 'resume-stopped-sub', t('Skipped ({n}):', { n: rows.length })));
    const ul = el('ul', 'dialog-list resume-stopped-groups');
    for (const g of skipGroups(rows, t)) {
      const li = el('li', 'resume-stopped-group');
      li.appendChild(el('div', 'resume-stopped-group-head', g.head));
      const door = g.rows[0] && g.rows[0].why === 'account-refused' ? capDoorWords(g.rows[0].reason).trim() : '';   // form two: where the person changes it
      if (door) li.appendChild(el('div', 'dialog-hint', door));
      const names = el('ul', 'resume-stopped-names');
      for (const s of g.rows) names.appendChild(el('li', null, s.until ? `${s.name || s.id} — ${t('until {time}', { time: stampAt(s.until, { now: Date.now(), words: true }) })}` : (s.name || s.id)));
      li.appendChild(names);
      ul.appendChild(li);
    }
    box.appendChild(ul);
    return box;
  };
  if (!n && !p.running) {   // (a batch RUNNING with nothing left to plan still gets its Stop door and its progress — below)
    // NOTHING GREYED WITH A HINT: an empty set SAYS so (and why the ones it has are not resumable now)
    body.appendChild(el('p', 'resume-stopped-empty', resumeButtonWords(0, t, { waiting: waitingCount(p.skipped) })));
    const sk = skippedList(p.skipped); if (sk) body.appendChild(sk);
    footer.appendChild(cancel);
    return null;
  }
  // THE OVERAGE SENTENCE IS TRUE ON EVERY INSTANCE (the cure): where the instance allows turns in paid overage, the press bills it — said
  const overAllowed = !!(p.overage && p.overage.allowed);
  if (n) body.appendChild(el('p', 'resume-stopped-lead', overAllowed ? t('{n} sessions will be continued, earliest stopped first — each one is a billed turn. This press is your own: it is not counted against the limits on turns nobody typed. This instance allows turns in paid overage (Settings → Spending), so a continue on an account in paid overage bills it; you can stop the rest at any time.', { n }) : t('{n} sessions will be continued, earliest stopped first — each one is a billed turn. This press is your own: it is not counted against the limits on turns nobody typed; an account in paid overage is still refused, and you can stop the rest at any time.', { n })));
  const cw = costWords(p.estimate, t);
  if (cw) {
    const cost = el('div', 'resume-stopped-cost');
    cost.appendChild(el('div', 'resume-stopped-dollars', cw.dollars));
    cost.appendChild(el('div', 'resume-stopped-basis', cw.allowance));
    for (const m of cw.members) {
      cost.appendChild(el('div', 'resume-stopped-member', m.line));
      if (m.basis) cost.appendChild(el('div', 'resume-stopped-basis', m.basis));
    }
    if (cw.unknown) cost.appendChild(el('div', 'resume-stopped-basis', cw.unknown));
    if (cw.unpriced) cost.appendChild(el('div', 'resume-stopped-basis', cw.unpriced));
    for (const b of overAllowed && Array.isArray(p.overage.billed) ? p.overage.billed : []) cost.appendChild(el('div', 'resume-stopped-member', t('{member}: {n} of these continues bill paid overage', { member: memberWords(b.name, t), n: b.n })));   // the cost line names it (the cure)
    body.appendChild(cost);
  }
  let skBox = skippedList(p.skipped); if (skBox) body.appendChild(skBox);
  const status = el('p', 'resume-stopped-status');
  body.appendChild(status);
  // WHILE A BATCH RUNS (U2 cure, law 3): a Stop door, and Close says in words that it keeps running and where to stop it
  const stopBtn = el('button', 'btn-create resume-stopped-stop', t('Stop the rest'));
  const keepHint = el('p', 'dialog-hint resume-stopped-keep', t('Closing leaves the resume running — reopen this from the session list’s ⋯ menu or Settings → Spending to stop it.'));
  let stopping = false;
  const showRunning = (batchId) => {
    runningId = batchId;
    if (!stopping && !stopBtn.isConnected) footer.prepend(stopBtn);
    cancel.textContent = t('Close — it keeps running');
    if (!keepHint.isConnected) body.insertBefore(keepHint, status.nextSibling);
  };
  const hideRunning = () => { runningId = null; stopBtn.remove(); keepHint.remove(); };
  stopBtn.onclick = async () => {
    if (!runningId || stopping) return;
    stopping = true; stopBtn.remove();
    status.textContent = t('Stopping — nothing more is started.');
    try { await api('/api/sessions/resume-stopped/' + encodeURIComponent(runningId) + '/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
    catch (e) { stopping = false; status.textContent = answerWords(e) || t('Could not stop it — try again.'); if (runningId) footer.prepend(stopBtn); }
  };
  const all = el('button', 'btn-create resume-stopped-all', cw ? cw.allButton : t('Resume all ({n})', { n }));
  footer.append(all, cancel);   // one press starts all N (the owner's ruling 2026-11-18) — no «only the first K»
  setTimeout(() => all.focus(), 0);
  return await new Promise((resolve) => {
    resolveOuter = resolve;
    // ONE press runs: while a batch is asked for or running, its two buttons are not drawn (a choice nobody can make now)
    let busy = false;
    const hideActs = () => { all.remove(); };
    const showActs = () => { footer.prepend(all); };
    const run = async (limit) => {
      if (busy) return;
      busy = true; hideActs();
      status.textContent = t('Authorizing the batch…');
      let rec = null;
      try {
        const ids = p.eligible.slice(0, limit === null || limit === undefined ? p.eligible.length : limit).map((e) => e.id);   // exactly the rows shown, earliest first
        rec = await api('/api/sessions/resume-stopped', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      } catch (e) {
        // A RETRY THAT MEETS A BATCH ALREADY RUNNING FOLLOWS IT (U2 cure): the words say «following it here» — and it does
        if (codeOf(e) === 'in_flight') {
          let p2 = null; try { p2 = await fetchStoppedPlan(); } catch { p2 = null; }
          if (p2 && p2.ok && p2.running) {
            status.textContent = answerWords(e);   // «following it here» — said only when it IS followed (it may have ended meanwhile)
            let r2 = null; try { r2 = await fetchJson('/api/sessions/resume-stopped/' + encodeURIComponent(p2.running)); } catch { r2 = null; }
            await follow(r2 && !r2.error ? r2 : { batchId: p2.running, done: false, planned: 0 });
            return;
          }
        }
        status.textContent = answerWords(e) || t('Could not start the resume — try again.');
        busy = false; showActs();
        return;
      }
      await follow(rec);
    };
    // the batch as it goes, to its outcome line (also a batch another page started: one batch at a time)
    const follow = async (rec) => {
      let misses = 0, lost = false;
      while (rec && !rec.done && !closed) {
        showRunning(rec.batchId);
        status.textContent = rec.stopAsked || stopping ? t('Stopping — nothing more is started.') : t('Resuming… {done} of {n} continued', { done: (rec.resumed || []).length, n: rec.planned });
        await new Promise((r) => setTimeout(r, POLL_MS));
        const next = await fetchJson('/api/sessions/resume-stopped/' + encodeURIComponent(rec.batchId));
        if (next && !next.error) { rec = next; misses = 0; continue; }
        // a network blip is asked again; no record for a while (the hub restarted — batches live in its memory) = lost
        if (++misses >= 10) { lost = true; break; }
      }
      if (closed) { resolve(rec); return; }
      hideRunning();
      if (lost) { status.textContent = t('The batch was lost (VibeSpace restarted) — reopen this to see which sessions are still stopped.'); status.classList.add('done'); all.remove(); cancel.textContent = t('Done'); resolve(rec); return; }
      const refused = rec && rec.refused ? rec.refused.n || rec.planned || 0 : 0;
      const done = (rec && rec.resumed || []).length, failedN = (rec && rec.failed || []).length, stoppedN = (rec && rec.stopped || []).length;
      // the batch's OWN skips = its skipped list past the plan's (the record says how many the plan skipped — a batch another page
      // started has another plan than this page's)
      const ownSkips = Number.isFinite(rec && rec.planSkipped) ? Math.max(0, (rec.skipped || []).length - rec.planSkipped) : (rec && rec.skipped || []).filter((x) => !(p.skipped || []).some((y) => y.id === x.id)).length;
      const notReached = rec && !rec.refused ? Math.max(0, (rec.planned || 0) - done - failedN - stoppedN - ownSkips) : 0;
      const line = summaryWords({ resumed: done, skipped: rec ? rec.skipped : [], refused, failed: failedN, notReached, stopped: stoppedN }, t);
      // the batch's OWN skips (a refusal re-asked before its continue, a wall that stood) join the list — every one, by reason
      if (rec && Array.isArray(rec.skipped) && rec.skipped.length) { const nb = skippedList(rec.skipped); if (nb) { if (skBox) skBox.replaceWith(nb); else body.insertBefore(nb, status); skBox = nb; } }
      status.textContent = line;
      status.classList.add('done');
      if (rec && rec.refused) {
        const why = el('p', 'resume-stopped-refused', t('The whole batch was refused — nothing was resumed: {detail}', { detail: batchRefusalWords(rec.refused) }));
        body.insertBefore(why, status.nextSibling);
      }
      all.remove();
      cancel.textContent = t('Done');
      showToast(line, { type: rec && rec.refused ? 'error' : 'info' });
      try { onDone && onDone(rec); } catch { }
      if (!(rec && rec.refused)) resolve(rec);
    };
    all.onclick = () => run(null);
    cancel.addEventListener('click', () => resolve(null), { once: true });
    if (p.running) {
      // ONE batch at a time: a resume already running (another tab, another press) is followed, never doubled
      busy = true; hideActs(); showRunning(p.running);
      status.textContent = t('A resume of these sessions is already running — following it here.');
      fetchJson('/api/sessions/resume-stopped/' + encodeURIComponent(p.running)).then((rec) => follow(rec && !rec.error ? rec : { batchId: p.running, done: false, planned: 0 }));
    }
  });
}

/** The Settings row's fact block: the counts, the two flip buttons, the resume button and the passive cost line. */
export function renderAutoResumeBulk(container, app) {
  const box = el('div', 'settings-row-fact auto-resume-bulk');
  container.appendChild(box);
  const paint = async () => {
    const plan = await fetchStoppedPlan();
    const w = planWords(plan);
    box.textContent = '';
    if (!w) { box.appendChild(el('span', 'settings-fact-text', t('Could not read the sessions — reopen Settings to retry.'))); return; }
    box.appendChild(el('div', 'settings-fact-text auto-resume-bulk-counts', w.line));
    const row = el('div', 'auto-resume-bulk-buttons');
    const onBtn = el('button', 'btn-create auto-resume-all-on', w.onButton);
    const offBtn = el('button', 'btn-cancel auto-resume-all-off', w.offButton);
    let flipping = false;   // one flip at a time — a second press while the first is out does nothing; paint() redraws the row after
    const flip = async (on) => {
      if (flipping) return;
      flipping = true;
      try {
        const r = await setAutoResumeForAll(app, on);
        showToast(on ? t('Auto-continue is on for {n} more sessions', { n: r.changed || 0 }) : t('Auto-continue is off for {n} sessions', { n: r.changed || 0 }) + (r.stoppedBatch ? ' ' + t('The running resume of stopped sessions was stopped.') : ''));
      } catch (e) { showToast(t('Could not change auto-continue: {why}', { why: e.message }), { type: 'error' }); }
      paint();
    };
    onBtn.onclick = () => flip(true);
    offBtn.onclick = () => flip(false);
    const resumeBtn = el('button', 'btn-cancel resume-stopped-open', w.resumeButton);
    resumeBtn.onclick = () => openResumeStoppedDialog(app, { plan: null, onDone: () => paint() });   // a fresh plan at the press
    row.append(onBtn, offBtn, resumeBtn);
    box.appendChild(row);
    if (w.passive) box.appendChild(el('div', 'settings-fact-text auto-resume-bulk-passive', w.passive));
    box.appendChild(el('div', 'settings-fact-text auto-resume-bulk-note', t('These buttons change the sessions you have now — the default above decides for new ones.')));
  };
  paint();
  return box;
}


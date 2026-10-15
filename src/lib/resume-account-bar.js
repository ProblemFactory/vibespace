// THE RESUME BAR'S ACCOUNT REFUSAL (lane resume-account-door, owner 2026-10-15 「无法 resume 一个对话」). The pinned
// account cannot serve ⇒ the bar says so — the PURE verdict's sentence (src/resume-account.js: the account, why, since
// when) — with its two doors: log it in again (Manage agents' own re-login door) and use another account (a picker
// PRE-FILLED with the first candidate, the pool when one can serve; its confirm resumes at once). Never a toast that
// ends there, and never a silent switch: the conversation keeps its pin until the owner picks.
import { t, deviceLocale } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { billingRow } from './agent-meta.js';
import { resumeAccountWords, candidateLabel } from '../resume-account.js';

const dayOf = (ms) => {
  try { return new Date(ms).toLocaleDateString(deviceLocale(), { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return new Date(ms).toISOString().slice(0, 10); }
};
const button = (cls, icon, label) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chat-resume-btn ' + cls;
  b.innerHTML = `${icon || ''} <span></span>`;
  b.querySelector('span').textContent = label;
  return b;
};

/** The refusal bar for `verdict` (a refused resumeAccountVerdict). `relogin(door)` runs the relogin door; `resume(id)`
 *  resumes on the picked account. The caller puts the bar where the Resume bar was. */
export function resumeAccountBar(verdict, { backend = 'claude', hostName = '', relogin, resume } = {}) {
  const words = resumeAccountWords(verdict, { t, date: dayOf, hostName });
  const bar = document.createElement('div');
  bar.className = 'chat-resume-bar chat-account-bar';
  bar.dataset.why = verdict.why;
  const note = document.createElement('div');
  note.className = 'chat-resume-note';
  note.innerHTML = `${UI_ICONS.alert || ''}<span></span>`;
  note.querySelector('span').textContent = words.sentence;
  const doors = document.createElement('div');
  doors.className = 'chat-account-doors';
  const re = verdict.doors.find((d) => d.kind === 'relogin');
  const sw = verdict.doors.find((d) => d.kind === 'switch') || { to: [] };
  if (re && words.relogin) {
    const b = button('chat-account-relogin', UI_ICONS.wrench, words.relogin);
    b.onclick = () => relogin?.(re);
    doors.append(b);
  }
  const swBtn = button('chat-account-switch' + (re ? ' secondary' : ''), UI_ICONS.swap, words.switch);
  doors.append(swBtn);
  const pick = document.createElement('div');
  pick.className = 'chat-account-pick';
  pick.hidden = true;
  const sel = document.createElement('select');
  sel.className = 'session-config-select';
  sel.setAttribute('aria-label', words.switch);
  const machine = billingRow(backend).globalLogin;
  for (const c of sw.to) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = candidateLabel(c, { t, machine });
    sel.append(o);
  }
  if (sw.to.length) sel.value = sw.to[0].id; // PRE-FILLED: the first candidate (the pool when one can serve)
  const go = button('chat-account-go', UI_ICONS.refresh, t('Resume on this account'));
  go.onclick = () => {
    if (!sel.value) return;
    go.disabled = true;
    resume?.(sel.value);
  };
  const cancel = button('chat-account-cancel secondary', '', t('Cancel'));
  cancel.onclick = () => { pick.hidden = true; swBtn.setAttribute('aria-expanded', 'false'); };
  pick.append(sel, go, cancel);
  if (sw.to.length) {
    swBtn.setAttribute('aria-expanded', 'false');
    swBtn.onclick = () => {
      pick.hidden = !pick.hidden;
      swBtn.setAttribute('aria-expanded', String(!pick.hidden));
      if (!pick.hidden) sel.focus();
    };
  } else {
    swBtn.disabled = true;
    swBtn.title = words.none;
  }
  bar.append(note, doors, pick);
  if (words.none) {
    const none = document.createElement('div');
    none.className = 'chat-account-none';
    none.textContent = words.none;
    bar.append(none);
  }
  return bar;
}

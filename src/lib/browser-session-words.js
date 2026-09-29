// THE WORDS OF A BROWSER SESSION (2026-09-27, the owner: "在聊天界面和浏览器查看界面两个地方都能看到 session 的开始和结束，
// 以及每个浏览器 session 的回放"). The server sends STRUCTURE (src/browser-sessions.js: ids, instants, counts, kinds);
// this is the ONE place the device says them (en / zh / ja through t()) — the chat's two cards, the live view's
// dividers and Sessions list, Session properties' row and the replay window all read these functions, so a card and
// a list row can never say the same session two ways. Plain words only: no ids, no reasons in code form.
import { t, deviceLocale } from './i18n.js';
import { durationParts } from '../browser-sessions.js';

/** "42 s" / "3 min" / "1 h 5 min" in the device's words. */
export function durationText(ms) {
  const p = durationParts(ms);
  if (p.h !== undefined) return p.m ? t('{h} h {m} min', { h: p.h, m: p.m }) : t('{h} h', { h: p.h });
  if (p.m !== undefined) return t('{n} min', { n: p.m });
  return t('{n} sec', { n: p.s });
}
/** An instant as a surface prints it: the time today, the date and time before today. */
export function whenText(at, now = Date.now()) {
  const d = new Date(Number(at) || 0);
  const n = new Date(Number(now) || Date.now());
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  try {
    return sameDay ? d.toLocaleTimeString(deviceLocale(), { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString(deviceLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d.toISOString().slice(0, 16).replace('T', ' '); }
}
/** Which browser a session ran: its profile's name, or the conversation's own temporary one. */
export function browserNameText(s) { return s && s.label ? String(s.label) : t('a browser of its own'); }
/** "{n} actions" — the count every surface prints. */
export function actionsText(n) { return Number(n) === 1 ? t('1 action') : t('{n} actions', { n: Number(n) || 0 }); }

/** The chat's START card head. */
export function startCardText(b) { return t('Browser session started · {profile} · {time}', { profile: browserNameText(b), time: whenText(b && b.at) }); }
/** Why a session ended, in words (the closed set src/browser-sessions.js END_REASONS; '' for anything else). */
export function endReasonText(reason) {
  switch (String(reason || '')) {
    case 'released': return t('the conversation stopped using this browser'); // a detach: the user's, the agent's, or "who can use it" narrowed
    case 'dropped': return t('the conversation stopped'); // the keeper's reconcile: the conversation's key is no longer live
    case 'stopped': return t('the browser was stopped');
    case 'switched': return t('the browser was switched');
    case 'restart': return t('VibeSpace restarted');
    case 'left': return t('you closed your browsing window'); // BROWSE YOURSELF (B-6ae8): the user's own session, its away clock ran out
    default: return '';
  }
}
/** The chat's END card head — its duration, its actions and WHY it ended (the naive-user verifier, 2026-09-28: three
 *  switches wrote six cards that never said why). */
export function endCardText(b) {
  const n = Number(b && b.count) || 0;
  const head = n === 1 ? t('Browser session ended · {duration} · 1 action', { duration: durationText(b && b.durationMs) }) : t('Browser session ended · {duration} · {n} actions', { duration: durationText(b && b.durationMs), n });
  const why = endReasonText(b && b.reason);
  return why ? `${head} · ${why}` : head;
}
/** Does an end card offer Replay? Only when there is something to watch — a session the agent never acted in says so on
 *  its card and offers nothing (its replay could only say "the agent did not act"). */
export function endCardReplays(b) { return (Number(b && b.count) || 0) > 0; }
/** The end card's second line when the session's frames went to the size limit. */
export function framesGoneText(limitBytes) { return t('Frames of this session were removed to stay under the {size} limit; the action list is kept', { size: sizeText(limitBytes) }); }
/** The live view's divider between two sessions' actions. */
export function dividerText(k, at) { return t('Session {k} · started {time}', { k, time: whenText(at) }); }
/** One row of a Sessions list: when, how long, how many. BROWSE YOURSELF (B-6ae8): the user's own browsing reads
 *  "You · 14:02 · 4 min" (+ its actions when they were recorded — the owner: "你 · 14:02 · 4 分钟" and its replay). */
export function sessionRowText(s) {
  const when = whenText(s && s.startAt);
  const dur = s && s.open ? t('running') : durationText(s && s.durationMs);
  if (s && s.holder === 'user') { const head = t('You · {time} · {dur}', { time: when, dur }); return (Number(s.count) || 0) > 0 ? `${head} · ${actionsText(s.count)}` : head; }
  return `${when} · ${dur} · ${actionsText(s && s.count)}`;
}
/** Does a Sessions-list row offer Replay? Only a session with actions — the user's own too (the owner: recorded like an agent's). */
export function sessionReplays(s) { return !!s && (Number(s.count) || 0) > 0; }
/** A size limit as the words say it ("1 GB", "512 MB"). */
export function sizeText(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1073741824 && b % 1073741824 === 0) return `${b / 1073741824} GB`;
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  return `${Math.round(b / 1048576)} MB`;
}
/** The retention sentence every surface repeats (the owner: by size, 1 GB per profile — never by age). */
export function retentionText(limitBytes) { return t('Frames are kept until this profile\'s records reach {size}; the oldest are removed first.', { size: sizeText(limitBytes) }); }
/** A replay pane's empty state by NAME (src/browser-sessions.js replayEmpty). */
export function emptyText(kind, { limit = 0 } = {}) {
  if (kind === 'no-sessions') return t('No browser sessions recorded for this conversation');
  if (kind === 'trace-off') return t('Action trace is off — Settings → Agent browser');
  if (kind === 'frames-removed') return framesGoneText(limit);
  if (kind === 'no-actions') return t('The agent did not act in this browser session');
  if (kind === 'yours-not-recorded') return t('Only when you started and stopped is kept.'); // BROWSE YOURSELF (B-6ae8): "Also record my own actions" was off
  if (kind === 'yours-no-actions') return t('You did not act on the page in this session');
  return '';
}
/** The replay window's title. */
export function replayTitle(name) { return name ? t('Browser replay · {name}', { name }) : t('Browser replay'); }

// PURE — THE WORDS OF A MODEL MENU WHOSE CLI REPORTS ITS OWN MODELS (lane agy-models-report; the owner 2026-11-10: «Antigravity
// 支持的模型为什么是写死的呀？不应该从 Antigravity 自己汇报吗？»). The menu answer's `report` (src/routes/provider-models.js:
// { source: 'reported' | 'shipped', listedAt, lastError, listing, host }) → the ONE line under the menu, its door, the explicit
// row's label — in the device's words (`t`); a moment said by the client's relative-time helper (`ago` = user-todos-row's
// agoText). One spelling for the New Session model field and a chat's model menu — and ONE rule for both (opensFor,
// notInReport, rowsSig). No DOM.

/** Why a listing failed, in words. */
export function whyText(code, t) {
  if (code === 'signed-out') return t('signed out');
  if (code === 'timeout') return t('no answer in 20 s');
  if (code === 'not-installed') return t('not installed');
  if (code === 'spawn-failed') return t('it could not start');
  if (code === 'unreadable') return t('an answer VibeSpace could not read');
  return t('a failure VibeSpace does not know ({code})', { code: String(code || '?') }); // a code it does not know names itself
}

/** May a menu ask the CLI for its models? — a report of THIS machine's CLI; another machine's is not read (one rule, both
 *  surfaces: the New Session field and a chat's menu send nothing for another machine). */
export const opensFor = (report) => !!(report && typeof report === 'object' && !report.host);

/** A model the person chose (a saved default, a pick, a conversation's model) that the report does not list — kept, and said. */
export const notInReport = (t, harness, model) => t('{model} — not in {harness}’s report', { model, harness });

/** → { text, tone: 'dim' | 'warn', door: 'sign-in' | null } | null (a harness that reports nothing: no line). */
export function reportLine(report, { t, ago, harness, machine = '' }) {
  if (!report || typeof report !== 'object') return null;
  if (report.host) return { text: t('On {machine}: VibeSpace’s list — that machine’s {harness} is not read yet', { machine: machine || report.host, harness }), tone: 'dim', door: null };
  if (report.listing) return { text: t('Asking {harness} for its models…', { harness }), tone: 'dim', door: null };
  const le = report.lastError;
  if (le) {
    const why = whyText(le.code, t);
    const text = report.source === 'reported' && report.listedAt
      ? t('{harness} could not list its models ({why}) — showing the last list it reported ({when})', { harness, why, when: ago(report.listedAt) })
      : t('{harness} could not list its models ({why}) — showing VibeSpace’s list', { harness, why });
    return { text, tone: 'warn', door: le.code === 'signed-out' ? 'sign-in' : null };
  }
  if (report.source === 'reported' && report.listedAt) return { text: t('As reported by {harness} {when}', { harness, when: ago(report.listedAt) }), tone: 'dim', door: null };
  return { text: t('VibeSpace’s list — {harness} has not reported yet', { harness }), tone: 'dim', door: null };
}

export const refreshLabel = (t, harness) => t('Refresh from {harness}', { harness });
export const signInLabel = (t, harness) => t('Sign in to {harness}', { harness });
/** A refusal of the opening / the explicit row, in the device's words — every code its own sentence, never the server's
 *  English (round 2 law F); a code this client does not know is named. */
export function refusalText(r, t, harness = 'the CLI') {
  const code = r && r.code;
  if (code === 'throttled') return t('Asked less than a minute ago — try again in {s} s', { s: Math.max(1, Math.ceil(((r && r.retryInMs) || 0) / 1000)) });
  if (code === 'daily-bound') {
    const ms = Math.max(0, (r && r.retryInMs) || 0), n = (r && r.asked) || 24;
    return ms < 3600 * 1000 ? t('Asked {n} times in 24 hours — the next ask is possible in {m} min', { n, m: Math.max(1, Math.ceil(ms / 60000)) })
      : t('Asked {n} times in 24 hours — the next ask is possible in {h} h', { n, h: Math.ceil(ms / 3600000) });
  }
  if (!r || !code) return t('{harness} did not answer', { harness }); // no answer at all: its own sentence, never an English placeholder
  if (code === 'human_only' || code === 'cross_site' || code === 'no-press' || code === 'press-not-for-this' || code === 'press-expired') return t('Only a person on this page can ask {harness} for its models', { harness });
  if (code === 'no-report') return t('This menu is not {harness}’s own list', { harness });
  if (code === 'unknown-account' || code === 'unknown') return t('That account is no longer here');
  if (code === 'other-machine') return t('That machine’s {harness} is not read yet', { harness });
  return t('{harness} could not be asked ({code})', { harness, code: String(code) });
}
/** A menu's rows as drawn — a redraw is skipped when the answer changed nothing (an open native menu is never rebuilt for nothing). */
export const rowsSig = (ans) => JSON.stringify([!!(ans && ans.open), !!(ans && ans.empty), ((ans && ans.models) || []).map((m) => [m.id, m.label || ''])]);

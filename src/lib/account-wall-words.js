// THE ACCOUNT'S WALLS AND RESETS IN A PERSON'S WORDS (lane account-reset-door, the owner 2026-11-11: a red toast with the
// SAME English sentence fourteen times, in a Chinese UI, with no button — and «the vault is locked» while it was open).
// PURE: every surface that says why an account cannot be used now (⟳'s refusal, «Refresh all», the pool's gather, a reset
// claim's answer) words the POOL'S verdict here — the server sends the cause as a CODE (accounts.placeWallOf / the roster's
// `why`), never a sentence a person must read in English. ONE sentence for many accounts with the same cause (its count),
// and the door that ends it (`door`: 'unlock' = the vault's Unlock…, 'relogin' = Manage agents' re-login, 'oat-shape' = the
// guided door of a token with no subscription type yet (lane oat-add-door), null = nothing
// to press — it ends by itself, and the sentence says when). The reset claim's words live here too.
import { durationMark, clockOf } from './page-time.js'; // THE ONE MARK (lane ui-language, 主开发's ruling 2026-11-14): m / h / d in every language
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
const id = (s, p) => fill(s, p);
/** THE MARK'S t (hotfix 2.369.401 — the owner 2026-11-13 under a picture of the roster: «不如还是继续用 h/d»): a MARK — a ring's age
 *  badge, a row's age, the switch menu's age, the counts under the rings — says m / h / d in every language: the English key filled,
 *  no dictionary («41h», «2d», «97m»). A SENTENCE a person reads (a tooltip, the popup's «read … ago», a dialog line) keeps the
 *  interface's words through the real t. ONE mark function on the page: page-time's `mark` (主开发 2026-11-14 — the hotfix's own
 *  key-filling road and the lane ui-language formatter made one); `markT` is the token a caller hands in to ask for a MARK. */
export const markT = id;

/** The words for ONE wall code, for one named account (`name`) or `n` accounts sharing it → { text, door } */
export function wallWords(wall, { t = id, name = null, n = 1 } = {}) {
  const w = wall && typeof wall === 'object' ? wall : { code: String(wall || '') };
  const cli = typeof w.cli === 'string' && /^[0-9A-Za-z.+-]{1,40}$/.test(w.cli) ? w.cli : '?';
  const many = n > 1;
  const who = many ? null : (name || t('This account'));
  switch (w.code) {
    case 'vault-locked': return { door: 'unlock', text: many ? t('The vault is locked — {n} accounts’ readings cannot be refreshed for now · Unlock… (For you names what is waiting on it)', { n }) : t('The vault is locked — {name}’s reading cannot be refreshed for now · Unlock… (For you names what is waiting on it)', { name: who }) };
    // the pool's own sentence by the check's state (account-pool-auto unplaceableText; r3): checking ⇒ it rejoins by itself;
    // a failed / impossible check or no record ⇒ a re-login uses it now (never «wait for the measurement» — the owner, 2026-11-09)
    case 'cli-unmeasured': {
      const l = w.local && typeof w.local === 'object' ? w.local : null;
      const min = l && Number.isFinite(l.typicalMin) ? l.typicalMin : 5;
      if (l && l.state === 'checking') return { door: null, text: many ? t('{n} accounts rejoin once Claude Code {cli} has been checked on this machine (about {min} min)', { n, cli, min }) : t('{name} rejoins once Claude Code {cli} has been checked on this machine (about {min} min)', { name: who, cli, min }) };
      if (l && l.state === 'fail') return { door: 'relogin', text: many ? t('Claude Code {cli} uses long-lived tokens differently — re-login these {n} accounts to use them now', { n, cli }) : t('Claude Code {cli} uses long-lived tokens differently — re-login {name} to use it now', { name: who, cli }) };
      if (l && (l.state === 'cannot-run' || l.state === 'aborted')) return { door: 'relogin', text: many ? t('VibeSpace could not check Claude Code {cli} on this machine (For you says why) — re-login these {n} accounts to use them now', { n, cli }) : t('VibeSpace could not check Claude Code {cli} on this machine (For you says why) — re-login {name} to use it now', { name: who, cli }) };
      return { door: 'relogin', text: many ? t('Claude Code {cli} is not in this VibeSpace’s records yet — re-login these {n} accounts, or a VibeSpace update places them', { n, cli }) : t('Claude Code {cli} is not in this VibeSpace’s records yet — re-login {name}, or a VibeSpace update places it', { name: who, cli }) };
    }
    // NO TYPE YET (lane oat-add-door, acceptance r1 MUST 1): the guided door — sign in once, or choose the type where this hub
    // offers it (`choose`) — never «re-login», never the re-login door alone
    case 'oat-not-in-folder': if (w.reason === 'no-scopes') return { door: 'oat-shape', text: w.choose
        ? (many ? t('{n} accounts’ long-lived tokens have no subscription type yet — sign in once, or choose the type', { n }) : t('{name}’s long-lived token has no subscription type yet — sign in once, or choose the type', { name: who }))
        : (many ? t('{n} accounts’ long-lived tokens have no subscription type yet — sign in once', { n }) : t('{name}’s long-lived token has no subscription type yet — sign in once', { name: who })) };
      return w.reason === 'pending'
      ? { door: null, text: many ? t('{n} accounts’ long-lived tokens are written to their folders within a minute', { n }) : t('{name}’s long-lived token is written to its folder within a minute', { name: who }) }
      : { door: 'relogin', text: many ? t('{n} accounts need a re-login', { n }) : t('{name} needs a re-login', { name: who }) };
    case 'auth-failed': return { door: null, text: many ? t('{n} accounts were refused by Anthropic — asked again after 10 minutes', { n }) : t('{name} was refused by Anthropic — asked again after 10 minutes', { name: who }) };
    case 'lapsed': return { door: null, text: many ? t('{n} accounts’ subscriptions are inactive — each comes back once it answers again', { n }) : t('{name}’s subscription is inactive — it comes back once it answers again', { name: who }) };
    case 'held-out': return { door: null, text: many ? t('{n} accounts are left out of this pool’s decisions', { n }) : t('{name} is left out of this pool’s decisions', { name: who }) };
    case 'oat-expired': return { door: 'relogin', text: many ? t('{n} accounts’ logins and long-lived tokens have both ended — re-login', { n }) : t('{name}’s login and long-lived token have both ended — re-login', { name: who }) };
    case 'oat-mismatch': return { door: 'relogin', text: many ? t('{n} accounts hold another account’s long-lived token — re-mint it', { n }) : t('{name} holds another account’s long-lived token — re-mint it', { name: who }) };
    case 'unreadable': return { door: null, text: many ? t('{n} accounts’ logins could not be read', { n }) : t('{name}’s login could not be read', { name: who }) };
    default: return { door: 'relogin', text: many ? t('{n} accounts need a re-login', { n }) : t('{name} needs a re-login', { name: who }) };
  }
}

/** Many refusals → ONE sentence per SENTENCE, each with its count (r2: the pool's login codes — no file, signed out, expired,
 *  no login… — all say «needs a re-login»; grouped by code they were six identical toasts): [{ wall, name }] →
 *  [{ code, n, text, door, names }] */
export function groupWalls(items, { t = id } = {}) {
  const by = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !it.wall) continue;
    const w = wallWords(it.wall, { t, n: 2 });   // the sentence as many accounts share it — its identity, whatever the count
    const k = `${w.door || ''}|${w.text}`;
    if (!by.has(k)) by.set(k, { wall: it.wall, names: [] });
    by.get(k).names.push(it.name || '?');
  }
  return [...by.values()].map(({ wall, names }) => ({ code: typeof wall === 'object' ? wall.code : wall, n: names.length, names, ...wallWords(wall, { t, n: names.length, name: names[0] }) }));
}

/** A lane in words — quota-model's limit ids: 'plan:5h' · 'plan:7d' · 'model:fable' (a model cap, by its own name) */
export function laneWords(lane, { t = id, capName = null } = {}) {
  if (lane === 'plan:5h') return t('the 5-hour limit');
  if (lane === 'plan:7d') return t('the weekly limit');
  const n = capName || String(lane || '').replace(/^model:/, '').replace(/-/g, ' ');
  // ui-words: a model family's name (a brand: «Opus») inside a worded sentence
  return t('the {name} weekly limit', { name: n ? n.charAt(0).toUpperCase() + n.slice(1) : '?' });
}

/** What a claim's outcome says, once, where the claim was made → text | '' */
export function outcomeText(o, { t = id, name = null, capName = null } = {}) {
  if (!o || !o.lane) return '';
  const what = laneWords(o.lane, { t, capName });
  const who = name || t('This account');
  if (o.state === 'reset-seen') return t('{name}: {what} has been reset — a reading shows it ({before}% → {after}%)', { name: who, what, before: Math.round(o.before), after: Math.round(o.usedPct) });
  if (o.state === 'fall-unconfirmed') return t('{name}: {what} fell from {before}% to {after}% in one reading — not confirmed yet; it counts as {before}% until a reading confirms it', { name: who, what, before: Math.round(o.before), after: Math.round(o.usedPct) });
  if (o.state === 'contradicted') return t('{name}: the reset you marked for {what} is not confirmed — its reading still says {pct}% used', { name: who, what, pct: Math.round(o.usedPct) });
  if (o.state === 'confirmed') return t('{name}: the reset you marked for {what} is confirmed by its reading ({pct}% used)', { name: who, what, pct: Math.round(o.usedPct) });
  return '';
}

/** The press's confirm words: one lane (`lane`) or the whole account (`lane` null) */
export function claimConfirmWords({ t = id, name = null, lane = null, capName = null } = {}) {
  const what = lane ? laneWords(lane, { t, capName }) : t('every limit of {name}', { name: name || t('this account') });
  return {
    title: lane ? t('Did you reset {what} on Anthropic’s site?', { what }) : t('Did you reset {name} on Anthropic’s site?', { name: name || t('this account') }),
    message: t('VibeSpace marks {what} as reset — unconfirmed — and, if a stopped conversation waits on this account, checks it and continues ONE now as a test. The next reading (a refresh of this account, or the test\'s own) confirms or corrects the mark; a wrong mark ends at that reading.', { what }),
    confirmText: t('Mark as reset'),
  };
}

/** A PERSON'S ACT NOT ON DISK YET IS SAID (K2 — store-writer law F): the release's one sentence (the status route's, the
 *  channels index's — src/lib/channel-words.js), or '' when the answer is not `not-durable`. */
export function notOnDiskWords(r, { t = id } = {}) {
  return r && r.code === 'not-durable' ? t('Saved, but not on disk yet — the storage has not written it (it is slow or failing). It stays in memory and is written when the storage can; a restart before then loses it.') : '';
}
/** WHAT THE PAGE SAYS ONCE A CLAIM ANSWERED (K2): the limit is marked reset — unconfirmed (a wall that is not a quota beside
 *  it) — and, when the claim did not reach the disk, that too: `disk`, its own toast (both facts, never one).
 *  {text, type, duration, door, disk} */
/** B-9a24 U1 (主开发 r4778 / r5330) — WHAT THE PRESS's ONE TEST DID, said in one sentence from the claim's answer `test` (facts on
 *  record, never a promise: «being tried» only once its continue was asked inside the press). `test.code` →
 *  'tried' {n} · 'out' {at, until} (a continue onto this account recorded, not answered) · 'recent' {n} (each tried in the last
 *  minutes) · 'quarantined' {n} · 'loop-cap' {n} (the breaker's own reasons) · 'cap' {n, cap} (a mark on a model's cap: no test, the law
 *  of 2026-11-18) · 'nobody' {m} (none lands on it; m parked elsewhere) · 'other-limit' · 'overage-in-use' · 'paying-unknown' (a test that can
 *  bill proves nothing: r5474) · 'refused' {why: the attended door's code} ·
 *  'not-pressed' (the continue could not start inside the press: NOTHING was sent). `when(ms)` words a time. No account name. */
export function claimTestWords(test, { t = id, when = clockOf } = {}) {
  const c = test && typeof test === 'object' ? String(test.code || '') : '';
  const n = Math.max(0, Math.floor(Number(test && test.n) || 0)), m = Math.max(0, Math.floor(Number(test && test.m) || 0));
  const cap = String((test && test.cap) || '').slice(0, 60);
  switch (c) {
    case 'tried': return n > 1 ? t('One of {n} stopped conversations is being checked on it, then tried; the others continue once a reading confirms the reset.', { n }) : t('The stopped conversation waiting on it is being checked, then tried.');
    case 'out': return t('A continue on this account was recorded at {at} and has not answered. If nothing has started by {until}, mark it again.', { at: when(test.at), until: when(test.until) });
    case 'recent': return n > 1 ? t('None of the {n} stopped conversations could be tried now: each was tried in the last minutes.', { n }) : t('The stopped conversation could not be tried now: it was tried in the last minutes.');
    case 'cap': return n > 1 ? t('{n} conversations were stopped by the {cap} limit. A mark alone does not continue them; they continue when a reading shows that limit reset. Refresh reads it now.', { n, cap }) : t('The conversation was stopped by the {cap} limit. A mark alone does not continue it; it continues when a reading shows that limit reset. Refresh reads it now.', { cap });
    case 'nobody': return m > 1 ? t('No stopped conversation is waiting on this account right now; {m} it stopped are parked on other accounts and move here once a reading confirms.', { m }) : m === 1 ? t('No stopped conversation is waiting on this account right now; one it stopped is parked on another account and moves here once a reading confirms.') : t('No stopped conversation is waiting on this account right now.');
    case 'other-limit': return t('Nothing was sent: another limit of this account is still used up.');
    case 'quarantined': return n > 1 ? t('None of the {n} stopped conversations is tried now: this account refused them in the last minutes.', { n }) : t('The stopped conversation is not tried now: this account refused it in the last minutes.');
    case 'loop-cap': return n > 1 ? t('None of the {n} stopped conversations is tried now: their automatic continues for this hour are used up.', { n }) : t('The stopped conversation is not tried now: its automatic continues for this hour are used up.');
    case 'overage-in-use': return t('Nothing was sent: this account is paying for overage now, so a test there would be paid for instead of showing a reset. Read the account\'s usage first, then mark it again.');
    case 'paying-unknown': return t('Nothing was sent: whether this account would pay for a test cannot be read. Read the account\'s usage first, then mark it again.');
    case 'refused': {   // the attended door's own refusals (spend-authorizer.js: a press still never pays overage, nor buys a refused request)
      const w = String((test && test.why) || '');
      const why = w === 'identity-cannot-serve' ? t('its sign-in cannot serve a request right now') : w === 'spend-control-reached' ? t('the account has reached its spend control') : w === 'overage-in-use' ? t('the account is billing paid overage, and a press never opts in to paying it') : w === 'identity-unknown' ? t('the account a continue would bill could not be told') : t('it could not be authorized right now');
      return t('Nothing was sent: {why}.', { why });
    }
    case 'not-pressed': return t('Nothing was sent: a continue can start only inside your press, and this one could not. Mark it again to try.');
    default: return '';
  }
}
export function claimAnsweredWords(r, { t = id, what = '', name = null, when = clockOf } = {}) {
  const disk = notOnDiskWords(r, { t });
  if (r && r.wall) { const w = wallWords(r.wall, { t, name }); return { text: t('Marked {what} as reset — unconfirmed. It still cannot be used now: {why}', { what, why: w.text }), type: 'error', duration: 10000, door: w.door, disk }; }
  // B-9a24 U1: the press's one test said beside the mark (a refusal or nothing sent reads as an error); no test ⇒ the release's sentence
  const tw = r && r.test ? claimTestWords(r.test, { t, when }) : '';
  if (tw) return { text: `${t('Marked {what} as reset — unconfirmed.', { what })} ${tw}`, type: /^(refused|not-pressed|other-limit|overage-in-use|paying-unknown)$/.test(String(r.test.code)) ? 'error' : null, duration: 10000, door: null, disk };
  return { text: t('Marked {what} as reset — unconfirmed until its next reading', { what }), type: null, duration: 7000, door: null, disk };
}

/** A LANE OLDER THAN ITS SIBLINGS SAYS SO ON ITSELF (L3): its reading `readAt` is more than STALE_LANE_MS older than the
 *  freshest lane of the same account → its age in short words, else ''. */
export const STALE_LANE_MS = 30 * 60e3;
export function staleLaneAge(readAt, freshestAt, nowMs = Date.now(), { t = id } = {}) {
  const r = Number(readAt) || 0, f = Number(freshestAt) || 0;
  if (!r || !f || f - r <= STALE_LANE_MS) return '';
  const min = Math.max(1, Math.round((Number(nowMs) - r) / 60000));
  // a MARK (the caller handed markT): page-time's mark — the same letters in every language, the roster's thresholds
  if (t === markT) return durationMark(min * 60000, { hoursFrom: 120, daysFrom: 48 * 60 });
  // a SENTENCE: the interface's words for the same short age
  return min < 120 ? t('{n}m', { n: min }) : min < 48 * 60 ? t('{n}h', { n: Math.round(min / 60) }) : t('{n}d', { n: Math.round(min / 1440) });
}

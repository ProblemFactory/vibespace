// THE ACCOUNT'S WALLS AND RESETS IN A PERSON'S WORDS (lane account-reset-door, the owner 2026-11-11: a red toast with the
// SAME English sentence fourteen times, in a Chinese UI, with no button — and «the vault is locked» while it was open).
// PURE: every surface that says why an account cannot be used now (⟳'s refusal, «Refresh all», the pool's gather, a reset
// claim's answer) words the POOL'S verdict here — the server sends the cause as a CODE (accounts.placeWallOf / the roster's
// `why`), never a sentence a person must read in English. ONE sentence for many accounts with the same cause (its count),
// and the door that ends it (`door`: 'unlock' = the vault's Unlock…, 'relogin' = Manage agents' re-login, 'oat-shape' = the
// guided door of a token with no subscription type yet (lane oat-add-door), null = nothing
// to press — it ends by itself, and the sentence says when). The reset claim's words live here too.
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
const id = (s, p) => fill(s, p);
/** THE MARK'S t (hotfix 2.369.401 — the owner 2026-11-13 under a picture of the roster: «不如还是继续用 h/d»): a MARK — a ring's age
 *  badge, a row's age, the switch menu's age, the counts under the rings — says m / h / d in every language: the English key filled,
 *  no dictionary («41h», «2d», «97m»). A SENTENCE a person reads (a tooltip, the popup's «read … ago», a dialog line) keeps the
 *  interface's words through the real t. */
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
  return t('the {name} weekly limit', { name: n ? n.charAt(0).toUpperCase() + n.slice(1) : '?' });
}

/** What a claim's outcome says, once, where the claim was made → text | '' */
export function outcomeText(o, { t = id, name = null, capName = null } = {}) {
  if (!o || !o.lane) return '';
  const what = laneWords(o.lane, { t, capName });
  const who = name || t('This account');
  if (o.state === 'reset-seen') return t('{name}: {what} has been reset — a reading shows it ({before}% → {after}%)', { name: who, what, before: Math.round(o.before), after: Math.round(o.usedPct) });
  if (o.state === 'contradicted') return t('{name}: the reset you marked for {what} is not confirmed — its reading still says {pct}% used', { name: who, what, pct: Math.round(o.usedPct) });
  if (o.state === 'confirmed') return t('{name}: the reset you marked for {what} is confirmed by its reading ({pct}% used)', { name: who, what, pct: Math.round(o.usedPct) });
  return '';
}

/** The press's confirm words: one lane (`lane`) or the whole account (`lane` null) */
export function claimConfirmWords({ t = id, name = null, lane = null, capName = null } = {}) {
  const what = lane ? laneWords(lane, { t, capName }) : t('every limit of {name}', { name: name || t('this account') });
  return {
    title: lane ? t('Did you reset {what} on Anthropic’s site?', { what }) : t('Did you reset {name} on Anthropic’s site?', { name: name || t('this account') }),
    message: t('VibeSpace then shows {what} as reset — unconfirmed — and the pool may use it. The next refresh of this account reads it and confirms or corrects it; a wrong mark ends at that reading.', { what }),
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
export function claimAnsweredWords(r, { t = id, what = '', name = null } = {}) {
  const disk = notOnDiskWords(r, { t });
  if (r && r.wall) { const w = wallWords(r.wall, { t, name }); return { text: t('Marked {what} as reset — unconfirmed. It still cannot be used now: {why}', { what, why: w.text }), type: 'error', duration: 10000, door: w.door, disk }; }
  return { text: t('Marked {what} as reset — unconfirmed until its next reading', { what }), type: null, duration: 7000, door: null, disk };
}

/** A LANE OLDER THAN ITS SIBLINGS SAYS SO ON ITSELF (L3): its reading `readAt` is more than STALE_LANE_MS older than the
 *  freshest lane of the same account → its age in short words, else ''. */
export const STALE_LANE_MS = 30 * 60e3;
export function staleLaneAge(readAt, freshestAt, nowMs = Date.now(), { t = id } = {}) {
  const r = Number(readAt) || 0, f = Number(freshestAt) || 0;
  if (!r || !f || f - r <= STALE_LANE_MS) return '';
  const min = Math.max(1, Math.round((Number(nowMs) - r) / 60000));
  // the keys every short age uses: a MARK passes markT (m / h / d in every language), a sentence the interface's t
  return min < 120 ? t('{n}m', { n: min }) : min < 48 * 60 ? t('{n}h', { n: Math.round(min / 60) }) : t('{n}d', { n: Math.round(min / 1440) });
}

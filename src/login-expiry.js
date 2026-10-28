'use strict';
/**
 * LOGIN EXPIRY — PURE (imports NOTHING; safe in any process, incl. the browser
 * bundle and the device daemon).
 *
 * THE FACT (measured on a live instance, 2026-09-07): a Claude subscription's
 * `.credentials.json` carries `claudeAiOauth.refreshTokenExpiresAt` — the
 * ABSOLUTE end of the LOGIN SESSION. It does NOT move when the access token is
 * refreshed (a member refreshed 30 min ago still showed an expiry 17 h out
 * while siblings showed 5 and 16 days), so it is a real deadline the user can
 * see coming. When the access token expires past that point the CLI's refresh
 * gets `invalid_grant`, prints "Failed to authenticate: OAuth session expired
 * and could not be refreshed", and BLANKS accessToken/refreshToken/expiresAt
 * in the file while KEEPING refreshTokenExpiresAt + scopes — that wiped shape
 * is what "logged out" looks like on disk.
 *
 * Before this module VibeSpace only reacted AFTER a failed turn (the pool's
 * auth-failure eviction): the user saw a dead turn, then it "worked again" on
 * another member, and nobody was ever told to re-login. Everything here is
 * derived from the file's own numbers — there is no probe, no vendor call and
 * no timer in this module (§ban-safety: the whole feature is passive by
 * construction).
 *
 * VOCABULARY (the five states are exhaustive; 'unknown' means NO CLAIM and
 * every consumer must treat it as "do not block on this"):
 *   ok          a refresh-token deadline exists and is comfortably ahead
 *   expiring    < EXPIRING_MS away — still works, say so while there is time
 *   expired     the deadline has passed; the CLI's next refresh will fail
 *   logged-out  the CLI already wiped the tokens (the shape above)
 *   unknown     no deadline readable — never 'ok', never a reason to block
 *   oat-only    the login is dead (expired / logged-out) but the account
 *               holds a VALID long-lived token (B-211a): its own sessions
 *               spawn on the token, only the quota refresh needs the login
 *               (2026-10-13 owner: "都绑定长期token了，怎么还提示过期").
 *               LOGIN and TOKEN are two facts; a row lives by the better one.
 *               Produced when the caller passes `opts.oat` — a pool SLOT
 *               reads the credential FILE through a symlink and can never be
 *               handed the token, so slot callers never pass it — OR when the
 *               FILE itself is the token VibeSpace MATERIALIZED there (lane
 *               pool-oat-materialize, design q-035 A): our `vibespaceOat`
 *               mark + an access token + no refresh token, dated by the
 *               file's own expiresAt (= mint + OAT_TTL). Such a slot serves
 *               a pooled session; `login: 'none'`, `oatFile: true`.
 */

// The chip / first inbox warning: a login with less than a day left is worth
// interrupting the user for (re-login is a browser round-trip they must plan).
const EXPIRING_MS = 24 * 3600e3;
// A conversation must never be MOVED onto a login that is about to die: a
// switch buys the session a fresh account, and 30 min of remaining login is
// not a fresh account. Deliberately much shorter than EXPIRING_MS — a member
// with 20 h left still serves its own conversation fine (that is why
// loginUsable and loginSwitchTarget are two different questions).
const NEAR_MS = 30 * 60e3;
// A LOGIN SESSION shorter than this is not how Claude subscriptions normally
// behave (the deadlines measured on this instance were 5, 9, 12 and 16 DAYS
// out) — it is what an org-level SSO session policy looks like from the
// outside. It is a HINT, never a claim: it is only ever spoken about a span
// this watch actually MEASURED (see measureLoginSpan in the watch), because
// the only clock on disk — the credential file's mtime — also moves on every
// access-token refresh and would otherwise report a 30-day session as a
// 20-hour one.
const SHORT_SESSION_MS = 36 * 3600e3;
// Warning ladder, most-lenient first. 'expired' is the terminal rung (it
// fires once, when the login actually dies).
// 'oat-only' is the most lenient rung (a LOW notice: the row still serves,
// only the usage refresh needs a re-login); on an oat-only row the 24h / 1h
// rungs count down the TOKEN's own end, and 'expired' fires when both died.
const OAT_ONLY = 'oat-only';
const WARN_STAGES = Object.freeze([OAT_ONLY, '24h', '1h', 'expired']);
const STAGE_MS = Object.freeze({ '24h': EXPIRING_MS, '1h': 3600e3 });
const DEAD_STATES = Object.freeze(['expired', 'logged-out']);

/** The oauth record inside a parsed `.credentials.json` — callers holding
 *  either the whole file object or the inner object both work. Anything else
 *  (null, a string, `{}` — the shape a Console /login wipe leaves) yields
 *  null, i.e. NO CLAIM. */
function oauthOf(creds) {
  if (!creds || typeof creds !== 'object' || Array.isArray(creds)) return null;
  const inner = creds.claudeAiOauth;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner;
  for (const k of ['accessToken', 'refreshToken', 'refreshTokenExpiresAt', 'expiresAt', 'scopes', 'subscriptionType']) {
    if (Object.prototype.hasOwnProperty.call(creds, k)) return creds;
  }
  return null;
}

const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const UNKNOWN = Object.freeze({ state: 'unknown', refreshExpiresAt: null, accessExpiresAt: null, msLeft: null });

// THE MATERIALIZED LONG-LIVED TOKEN (lane pool-oat-materialize, design q-035 A,
// measured on CLI 2.1.296 — scripts/fixtures/oat-in-file.json): accounts.setOat
// may write the row's oat into the member's own .credentials.json in the CLI's
// login shape ({claudeAiOauth: {accessToken, expiresAt = mint + OAT_TTL, scopes,
// subscriptionType, rateLimitTier?}}, NO refreshToken) so a POOLED session —
// which reads that file through its symlink — can spend it. The top-level
// `vibespaceOat` key is OUR MARK. The CLI's store is a bag of top-level keys
// (claudeAiOauth, mcpOAuth, designOauth …) and its own writes spread the bag
// ({...G, claudeAiOauth}), so the mark can outlive a `claude login` on top of
// our file: the file is OURS only while it ALSO has no refresh token, and the
// mark names THIS row (verify r1 F3: ownership is the mark's, never the token
// value's — an older token of the same row is ours and is replaced in place).
// The bag's other keys are the CLI's (verify r1 F1): we replace claudeAiOauth
// and the mark, and keep every other key (oatFileMerge / credsRestOf).
const OAT_FILE_MARK = 'vibespaceOat';
/** The materialized-token file's oauth record, or null: OUR mark + an access token + no refresh token. */
function oatFileOf(creds) {
  if (!creds || typeof creds !== 'object' || Array.isArray(creds) || !creds[OAT_FILE_MARK]) return null;
  const o = creds.claudeAiOauth;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (typeof o.accessToken !== 'string' || !o.accessToken || o.refreshToken) return null;
  return o;
}
/** OURS for row `id`: our materialized file (oatFileOf) whose mark names this row. */
function oatFileOurs(creds, id) {
  if (!id || !oatFileOf(creds)) return false;
  const mark = creds[OAT_FILE_MARK];
  return !!mark && typeof mark === 'object' && mark.account === id;
}
/** The CLI's OTHER top-level credentials in a file (mcpOAuth, designOauth …): every
 *  key but claudeAiOauth and our mark, as they are. {} for anything not an object. */
function credsRestOf(creds) {
  if (!creds || typeof creds !== 'object' || Array.isArray(creds)) return {};
  const out = {};
  // defineProperty, not `out[k] =`: JSON.parse makes "__proto__" an OWN key, and assignment would set the prototype
  for (const k of Object.keys(creds)) if (k !== 'claudeAiOauth' && k !== OAT_FILE_MARK) Object.defineProperty(out, k, { value: creds[k], enumerable: true, writable: true, configurable: true });
  return out;
}
/** What the store writes over `creds` (the file it read): ONLY claudeAiOauth + our mark
 *  replaced, every other key of the CLI's bag kept. */
function oatFileMerge(creds, body) {
  return { ...credsRestOf(creds), claudeAiOauth: body.claudeAiOauth, [OAT_FILE_MARK]: body[OAT_FILE_MARK] };
}
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x));
/** OURS already says exactly `body` — judged on claudeAiOauth + the mark only (the CLI's
 *  other keys are never a reason to write). */
function oatFileCurrent(creds, body) {
  if (!creds || typeof creds !== 'object' || !body) return false;
  return canon(creds.claudeAiOauth) === canon(body.claudeAiOauth) && canon(creds[OAT_FILE_MARK]) === canon(body[OAT_FILE_MARK]);
}
/** The subscription SHAPE a CLI-shaped file must carry (measured: a file without
 *  scopes / subscriptionType reads "Not logged in"), read off a login file — live,
 *  dead, or the wiped residue (the CLI blanks the tokens and KEEPS scopes +
 *  subscriptionType). null = not known. */
function oatShapeOf(creds) {
  const o = oauthOf(creds);
  if (!o) return null;
  const scopes = Array.isArray(o.scopes) ? o.scopes.filter((x) => typeof x === 'string' && x) : [];
  const subscriptionType = typeof o.subscriptionType === 'string' && o.subscriptionType ? o.subscriptionType : null;
  if (!scopes.length || !subscriptionType) return null;
  return { scopes, subscriptionType, ...(typeof o.rateLimitTier === 'string' && o.rateLimitTier ? { rateLimitTier: o.rateLimitTier } : {}) };
}
/** The file we write: the measured shape + our mark (naming the row). Never a refreshToken. */
function oatFileBody(token, { expiresAt, shape, mintedAt = null, account = null } = {}) {
  return {
    claudeAiOauth: { accessToken: String(token), expiresAt: Number(expiresAt), scopes: shape.scopes.slice(), subscriptionType: shape.subscriptionType, ...(shape.rateLimitTier ? { rateLimitTier: shape.rateLimitTier } : {}) },
    [OAT_FILE_MARK]: { v: 1, mintedAt: Number(mintedAt) || null, ...(account ? { account: String(account) } : {}) },
  };
}
/** OUR file, dated by ITS OWN expiresAt (the token's death): 'oat-only' while it
 *  lives — usable, ranked below an equal healthy login, the 24h / 1h rungs count
 *  the TOKEN down, and it never refreshes (there is nothing to refresh with) —
 *  'expired' after. */
function oatFileState(o, now) {
  const exp = finite(o.expiresAt);
  if (exp == null) return { ...UNKNOWN, oatFile: true };
  const base = { refreshExpiresAt: null, accessExpiresAt: exp, oatValidUntil: exp, msLeft: exp - now, login: 'none', oatFile: true };
  return exp > now ? { state: OAT_ONLY, ...base } : { state: 'expired', ...base, oatExpired: true };
}

/**
 * withOat(info, oat, now) — fold the account's LONG-LIVED TOKEN into a login
 * verdict. `oat` = { present, validUntil } (validUntil = minted + OAT_TTL_MS)
 * or null. A live / unknown login speaks for itself (the token adds nothing to
 * "will a session start"); a DEAD login with a valid token is 'oat-only'
 * (msLeft = the TOKEN's time left, so the switch / ladder rules count it
 * down); a dead login whose token ALSO ended stays dead and says so
 * (oatExpired — 'oat-expired' stays the spawn reason).
 */
function withOat(info, oat, now = Date.now()) {
  // …and over a MISSING credential file (lane pool-silent-members R1, inc-mvsjhna7): the 2.1.312 take-back left six rows
  // reading 'unknown' — «not logged in» to the probe loop and the ⟳ door — while each held a valid long-lived token its
  // own sessions spawned on. A missing file + a live token IS «long-lived token only» (login 'none', like our own file)
  const absent = !!info && info.state === 'unknown' && info.absent === true;
  if (!info || !(DEAD_STATES.includes(info.state) || absent)) return info;
  const validUntil = oat && oat.present ? finite(oat.validUntil) : null;
  if (validUntil == null) return info;
  if (absent) return validUntil > now ? { ...info, state: OAT_ONLY, login: 'none', oatValidUntil: validUntil, msLeft: validUntil - now } : info;
  if (validUntil > now) return { ...info, state: OAT_ONLY, login: info.state, oatValidUntil: validUntil, msLeft: validUntil - now };
  return { ...info, oatValidUntil: validUntil, oatExpired: true };
}

/**
 * loginState(creds, now, { oat }) → { state, refreshExpiresAt, accessExpiresAt, msLeft }
 * The ONE reading of a credential file's login lifetime. Never throws.
 * `opts.oat` folds the account's long-lived token in (withOat above).
 */
function loginState(creds, now = Date.now(), opts = {}) {
  return withOat(loginFileState(creds, now), opts && opts.oat, now);
}
function loginFileState(creds, now) {
  const mat = oatFileOf(creds);
  if (mat) return oatFileState(mat, now);
  const o = oauthOf(creds);
  if (!o) return { ...UNKNOWN };
  const refreshExpiresAt = finite(o.refreshTokenExpiresAt);
  const accessExpiresAt = finite(o.expiresAt);
  const hasTokens = !!(o.accessToken || o.refreshToken);
  if (!hasTokens) {
    // The wiped shape: tokens blanked, refreshTokenExpiresAt + scopes kept.
    // A file with NOTHING left in it (no deadline, no scopes) is not evidence
    // of a wipe — it is no evidence at all.
    const residue = refreshExpiresAt != null || (Array.isArray(o.scopes) && o.scopes.length > 0);
    if (!residue) return { ...UNKNOWN };
    return { state: 'logged-out', refreshExpiresAt, accessExpiresAt, msLeft: refreshExpiresAt == null ? null : refreshExpiresAt - now };
  }
  // Tokens present but no deadline in the file: we know nothing about the
  // login session's end. 'unknown', NEVER 'ok' — claiming health we cannot
  // read is exactly how the old behaviour surprised people.
  if (refreshExpiresAt == null) return { ...UNKNOWN, accessExpiresAt };
  const msLeft = refreshExpiresAt - now;
  if (msLeft <= 0) return { state: 'expired', refreshExpiresAt, accessExpiresAt, msLeft };
  return { state: msLeft < EXPIRING_MS ? 'expiring' : 'ok', refreshExpiresAt, accessExpiresAt, msLeft };
}

/** Can this login serve AT ALL? 'unknown' says yes — no claim never blocks. */
function loginUsable(info) { return !DEAD_STATES.includes(info?.state); }

/** May a conversation be MOVED onto this login? Dead => no; inside the NEAR
 *  window => no (a switch target must outlive the switch). */
function loginSwitchTarget(info) {
  if (!loginUsable(info)) return false;
  const ms = info?.msLeft;
  return !(typeof ms === 'number' && ms < NEAR_MS);
}

/** Ranking penalty: 0 ok/unknown, 1 expiring, 2 near-expiry, 3 dead. Used as
 *  the LAST tiebreak, so an 'expiring' member ranks below an EQUAL 'ok' one
 *  and nothing else about the ordering changes. */
function loginRank(info) {
  if (!loginUsable(info)) return 3;
  if (!loginSwitchTarget(info)) return 2;
  // an oat-only row serves, but ranks below an EQUAL healthy one (its quota
  // cannot be refreshed and its token is the last channel left)
  return info?.state === 'expiring' || info?.state === OAT_ONLY ? 1 : 0;
}

/** The named bucket a blocked decision must SPEAK (null when nothing to say). */
function loginBlockReason(info) {
  if (info?.state === 'expired') return 'login-expired';
  if (info?.state === 'logged-out') return 'login-signed-out';
  if (!loginSwitchTarget(info)) return 'login-near-expiry';
  return null;
}

/** Compact English duration for server-side notices/labels ("17 h", "42 min",
 *  "5 days"). The CLIENT formats its own translated copy — this is for the
 *  notice/journal strings that are English everywhere else in the engine. */
function loginAgeText(ms) {
  const v = Math.abs(Number(ms) || 0);
  if (v < 90 * 1000) return `${Math.max(1, Math.round(v / 1000))} s`;
  if (v < 90 * 60e3) return `${Math.round(v / 60e3)} min`;
  if (v < 36 * 3600e3) return `${Math.round(v / 3600e3)} h`;
  return `${Math.round(v / 86400e3)} days`;
}

/** One-line bucket label for the SPEAK rule (deadBuckets et al). */
function loginBucketLabel(info) {
  switch (info?.state) {
    case 'expired': return 'login expired';
    case 'logged-out': return 'login signed out';
    case 'expiring': return `login expires in ${loginAgeText(info.msLeft)}`;
    case OAT_ONLY: return `login expired · long-lived token ends in ${loginAgeText(info.msLeft)}`;
    default: return 'login';
  }
}

/** How to SAY one login-blocked member in a notice. Round 1 wrote ONE sentence
 *  ("their login session has expired or is about to") over a list that mixes
 *  three different facts, so a member with 20 min of login left was reported as
 *  expired. Each member states its OWN fact; the caller only joins them. */
function loginBlockedPhrase(m) {
  if (m?.state === 'expired') return 'login expired';
  if (m?.state === 'logged-out') return 'signed out';
  const ms = m?.msLeft;
  if (m?.state === OAT_ONLY) return typeof ms === 'number' && ms > 0 ? `long-lived token ends in ${loginAgeText(ms)}` : 'long-lived token ending';
  if (typeof ms === 'number' && ms > 0) return `login expires in ${loginAgeText(ms)}`;
  return 'login expiring';
}
/** "Fish Max (signed out), B-Stack Max (login expires in 20 min)" */
function loginBlockedText(list) {
  return (list || []).map((m) => `${m?.name || m?.id || 'a member'} (${loginBlockedPhrase(m)})`).join(', ');
}

/** How to say the CURRENT member's OWN dead login inside a sentence that has
 *  already named the account ("Fish Max's <phrase> — no member can take
 *  over"). Round-3 verifier: the current member's dead login used to be
 *  smuggled into `deadBuckets`, where the notice rendered it as a SPENT QUOTA
 *  BUCKET ("spent: login signed out") and prescribed the quota remedy — the
 *  word "re-login" never appeared, and the one account the user had to act on
 *  was the only one the notice could not name. loginBucketLabel is a LIST-ITEM
 *  label; this one is a CLAUSE, so it reads with the possessive. */
function loginWallPhrase(info) {
  if (info?.state === 'logged-out') return 'login is signed out';
  if (info?.state === 'expired') return 'login session expired';
  return 'login session is unusable'; // never reached through loginUsable(), but never silent either
}

/**
 * reloggedIn(info, prevExp) — did a REAL new login session start since the
 * deadline `prevExp` was recorded?
 *
 * Three clauses, each load-bearing:
 *  · the login must be ALIVE again ('ok'/'expiring'). A wiped file keeps
 *    refreshTokenExpiresAt and that deadline can be in the FUTURE (the round-3
 *    shape), so "the number went up" alone would read a signed-out account as
 *    recovered — and silently drop the warning that is still true.
 *  · there must be a readable deadline now. A live token with no deadline is
 *    'unknown' = NO CLAIM, and no claim never overrides a warning we filed
 *    from a fact.
 *  · the deadline must be DIFFERENT from the recorded one. A login session's
 *    deadline is fixed for its whole life, so a change can only come from a
 *    new session; a REWRITE that keeps it (an access-token refresh, a creds
 *    file copied between machines, an import) is the SAME session — nothing
 *    was fixed, so nothing may be cleared. This is the load-bearing negative.
 * `prevExp == null` with a live deadline now IS a re-login: the recorded row
 * was the un-datable wiped shape and there is a session again.
 *
 * NOT "strictly newer" — that reading is wrong in exactly the case the
 * session-policy hint exists for. An org with a 24 h SSO policy hands back a
 * deadline 24 h out; if we warned at the 24 h rung with 20 h still on the
 * clock, the new session's deadline is EARLIER than the one we warned about,
 * and a `>` test would leave that now-false item open forever — the very
 * defect this is fixing. Retraction is safe in the other direction too: the
 * warning ladder re-arms on the new deadline in the SAME sweep, so an item
 * that is still deserved is re-filed immediately, with the right numbers.
 */
function reloggedIn(info, prevExp = null) {
  if (info?.state !== 'ok' && info?.state !== 'expiring') return false;
  const exp = info?.refreshExpiresAt ?? null;
  if (exp == null) return false;
  return exp !== prevExp;
}

/** Is a MEASURED login-session length short enough to be worth mentioning as
 *  a possible org session policy? Never true for a missing measurement. */
function shortSession(spanMs) {
  return typeof spanMs === 'number' && Number.isFinite(spanMs) && spanMs > 0 && spanMs < SHORT_SESSION_MS;
}

/** The most urgent warning rung this login currently qualifies for, or null. */
function warnStageFor(info) {
  if (!loginUsable(info)) return 'expired';
  const ms = info?.msLeft;
  if (typeof ms !== 'number') return null;
  if (ms < STAGE_MS['1h']) return '1h';
  if (ms < STAGE_MS['24h']) return '24h';
  // the LOW "the login ended, the token carries its sessions" rung is the ROW's news;
  // a materialized file (oatFile) has no login to have ended — its row says the
  // token sits in the folder, and only the token's own 24h / 1h / expired rungs speak — nor does a MISSING file folded in
  // (lane pool-silent-members R1: `absent` — no login there to have ended)
  return info?.state === OAT_ONLY && !info.oatFile && !info.absent ? OAT_ONLY : null;
}

/** The deadline a warning LEDGER is keyed by. A login's own deadline, except:
 *  an oat-only row counts down its TOKEN (a new ledger, so the LOW rung and
 *  the token's 24h / 1h rungs fire after the login's own rungs were spent),
 *  and a row whose token also ended died at the LATER of the two instants —
 *  the pre-existing gate must date the death by the token, or a token that
 *  died NOW behind a login that died months ago would be filed as old news. */
function ledgerExp(info) {
  if (info?.state === OAT_ONLY) return finite(info.oatValidUntil);
  const exp = info?.refreshExpiresAt ?? null;
  const oat = info?.oatExpired ? finite(info.oatValidUntil) : null;
  return oat != null && (exp == null || oat > exp) ? oat : exp;
}

/**
 * reviewWarnings(info, entry, now) -> { emit, entry }
 *
 * The ONCE-PER-MEMBER-PER-THRESHOLD ledger, as a pure transition. `entry` is
 * the persisted record for this member ({ exp, sent[] }) or null.
 *
 *  · A DIFFERENT refreshTokenExpiresAt than the one the ledger recorded is a
 *    RE-LOGIN: the ledger for the old deadline is dropped, so a member that
 *    was re-logged-in goes silent (and a re-login that only bought a few
 *    hours legitimately warns again, about the NEW deadline).
 *  · Skipping a rung (server was off across the 24 h mark) does not fire a
 *    stale "expires in 24 h" — the most urgent qualifying rung fires and the
 *    ones below it are marked as done. Warning about a threshold that is
 *    already history is worse than not warning.
 *  · `emit` is null on every other tick, so a restart replays nothing: the
 *    caller persists `entry` and hands it back next sweep.
 *  · PRE-EXISTING DEATHS (round-2 verifier, measured on the instance this was
 *    built on): the terminal rung had no staleness gate, so the FIRST sweep
 *    after the upgrade filed an `urgent` item for every login that had died
 *    long before the feature existed — three of them here, dead 15 h, 116 h
 *    and 700 h, none of them a routing member. `opts.watchingSince` is when
 *    this ledger started watching; a death that happened BEFORE we were
 *    watching AND is no longer recent is a PRE-EXISTING CONDITION, whose
 *    surface is the permanent red chip in Manage Agents, not an event inbox.
 *    It is recorded as done and never spoken. Both clauses are load-bearing:
 *    a death inside STALE_GRACE_MS is still news on a fresh install, and a
 *    death AFTER watchingSince is one WE missed (server was off) — reporting
 *    that is the whole promise. Omit `watchingSince` and this gate is inert.
 *    A logged-out record with NO readable deadline cannot be dated, so it is
 *    never suppressed — firing is the fail-safe direction.
 */
// "Before we were watching" is not enough on its own: a fresh install that
// boots 20 minutes after a login died must still say so. One day is the same
// horizon EXPIRING_MS already uses for "worth interrupting the user".
const STALE_GRACE_MS = EXPIRING_MS;
function reviewWarnings(info, entry, now = Date.now(), opts = {}) {
  const exp = ledgerExp(info);
  const sameLedger = !!entry && (entry.exp ?? null) === exp;
  const sent = sameLedger && Array.isArray(entry.sent) ? entry.sent.filter((s) => WARN_STAGES.includes(s)) : [];
  const stage = warnStageFor(info, now);
  if (!stage) return { emit: null, entry: sent.length ? { exp, sent } : null };
  if (sent.includes(stage)) return { emit: null, entry: { exp, sent } };
  const watchingSince = typeof opts.watchingSince === 'number' && Number.isFinite(opts.watchingSince) ? opts.watchingSince : null;
  if (stage === 'expired' && watchingSince != null && exp != null && exp < watchingSince && now - exp > STALE_GRACE_MS) {
    return { emit: null, entry: { exp, sent: [...WARN_STAGES] }, suppressed: 'pre-existing' };
  }
  const idx = WARN_STAGES.indexOf(stage);
  const nextSent = [...new Set([...sent, ...WARN_STAGES.slice(0, idx + 1)])];
  return { emit: stage, entry: { exp, sent: nextSent } };
}

/**
 * materializeVerdict(member, now) — may the row's long-lived token be written into
 * its member dir's .credentials.json (lane pool-oat-materialize; the owner's two
 * decisions: A only, and ONLY for a member with no usable login). The caller
 * (accounts.syncOatFile) reads the file and the store and hands in:
 *   file / fileState  the parsed .credentials.json; 'absent' | 'unreadable' (read, not a JSON object) |
 *                     'read-failed' (the READ failed: any errno but ENOENT) | 'present'
 *   dirState          'symlink' = the member dir is a symlink (never written through)
 *   oat               { present, validUntil, readable } (accounts._oatFact + whether it decrypts) or null
 *   ours              the file is OURS: our mark naming this row, no refresh token (oatFileOurs)
 *   current           …and its claudeAiOauth + mark already say exactly what we would write
 *   shape             { scopes, subscriptionType, rateLimitTier? } — the row's recorded one, else the file's
 *   caps              { ok, known } — cliCaps.oatInFile(the hub's CLI version, the fixture); known = a version was read
 *   linked            a session's pool link (or a pool's default link) names this member right now
 * → { verdict, archive, cleanup, held?, reason? }:
 *   none            no valid token: nothing written; `cleanup` = take OUR file back (never another).
 *                   reason 'oat-unreadable': the stored token does not decrypt — nothing moves, the row says re-mint
 *   read-failed     the file could not be READ (EACCES / EIO / EMFILE …): refused by name, nothing archived or written
 *   dir-symlink     the member dir is a symlink: refused, nothing written through it
 *   keep-login      a live OAuth login (a refresh token, loginUsable): the login is the authority
 *   cli-unmeasured  this CLI version was never measured: nothing new is written, and NOTHING IS TAKEN BACK — our
 *                   file stays (`held`) whether a link names the member or not, for a known version and an unknown
 *                   one alike (lane pool-silent-members R1, inc-mvsjhna7: the take-back on the 2.1.312 auto-update
 *                   deleted six members' files with no word said, and the pool lost them as «not logged in»; the
 *                   pool still places nothing new on it — accounts._placeable — and names it unplaceable WITH its
 *                   reason). A STALE ours (an older token of this row) is still replaced in place while a link names
 *                   it or the version is unknown: the window stops writes, never the swap of our own token
 *   no-scopes       no subscription shape known (the CLI would read "Not logged in"): refused; cleanup ours
 *   written         our file already holds exactly this: nothing to do
 *   materialize     write it (the CLI's other keys kept); `archive` = rename the login there first (dead / wiped /
 *                   foreign / unreadable bytes — never lost); a file with no login in it is merged, not archived
 */
function materializeVerdict(member, now = Date.now()) {
  const m = member || {};
  const ours = !!m.ours;
  if (m.oat && m.oat.present && m.oat.readable === false) return { verdict: 'none', archive: false, cleanup: false, reason: 'oat-unreadable' };
  const validUntil = m.oat && m.oat.present ? finite(m.oat.validUntil) : null;
  if (validUntil == null || validUntil <= now) return { verdict: 'none', archive: false, cleanup: ours };
  if (m.dirState === 'symlink') return { verdict: 'dir-symlink', archive: false, cleanup: false };
  if (m.fileState === 'read-failed') return { verdict: 'read-failed', archive: false, cleanup: false };
  const f = m.fileState === 'present' ? m.file : null;
  const o = oauthOf(f);
  if (!ours && o && typeof o.refreshToken === 'string' && o.refreshToken && loginUsable(loginFileState(f, now))) return { verdict: 'keep-login', archive: false, cleanup: false };
  const sh = m.shape;
  const shaped = !!sh && Array.isArray(sh.scopes) && sh.scopes.length > 0 && !!sh.subscriptionType;
  if (!(m.caps && m.caps.ok === true)) {
    const known = !!(m.caps && m.caps.known);
    if (ours && !m.current && shaped && !(known && !m.linked)) return { verdict: 'materialize', archive: false, cleanup: false };
    // a CLI update never shrinks a pool in silence (R1): the file the sessions and the roster read is never taken
    // back for a version reason — `held` whenever it is ours, linked or not
    return { verdict: 'cli-unmeasured', archive: false, cleanup: false, ...(ours ? { held: true } : {}) };
  }
  if (!shaped) return { verdict: 'no-scopes', archive: false, cleanup: ours };
  if (ours && m.current) return { verdict: 'written', archive: false, cleanup: false };
  return { verdict: 'materialize', archive: !ours && (m.fileState === 'unreadable' || !!o), cleanup: false };
}

module.exports = {
  OAT_FILE_MARK, oatFileOf, oatFileOurs, credsRestOf, oatFileMerge, oatFileCurrent, oatShapeOf, oatFileBody, materializeVerdict,
  EXPIRING_MS, NEAR_MS, WARN_STAGES, STAGE_MS, DEAD_STATES, STALE_GRACE_MS, SHORT_SESSION_MS, OAT_ONLY,
  loginState, withOat, ledgerExp, loginUsable, loginSwitchTarget, loginRank, loginBlockReason,
  loginAgeText, loginBucketLabel, loginBlockedPhrase, loginBlockedText, loginWallPhrase,
  warnStageFor, reviewWarnings, reloggedIn, shortSession,
};

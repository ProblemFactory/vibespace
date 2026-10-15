'use strict';
/**
 * RESUME ACCOUNT — PURE (imports only login-expiry, PURE → PURE; the bundle's resume bar and the suite share it).
 *
 * THE INCIDENT (owner 2026-10-15 「无法 resume 一个对话」): a stopped conversation whose per-session config pins a
 * subscription whose login was WIPED three days earlier. Pressing Resume ran the create, `resolveForSpawn` threw
 * "subscription not logged in: <name>", and the owner got a red toast over an unchanged Resume bar — nothing to click;
 * the ways out (Manage agents → log in, Session Properties → another account) were two menus away and unnamed.
 *
 * THE VERDICT: the resume press asks this FIRST, from facts the page already holds — the accounts list's `loginState`
 * (src/login-expiry.js, the long-lived token folded in), the usage route's `logins` (src/login-state.js, account level,
 * with the instant it stopped serving), the host's account verdicts for a remote conversation (evaluateOnHost) — and
 * never a second reading of a credentials file. A refusal names the account, why, and since when, and carries the two
 * doors: log it in again, or resume on another account (the pool first when one can serve). It mirrors the create's own
 * ladder (accounts.resolveForSpawn / evaluateOnHost); a fact the page does not hold is no claim and never blocks — the
 * create stays the judge, and its toast names the doors too.
 *
 * NO SILENT SWITCHING: the verdict only says; the conversation keeps its pin until the owner picks.
 */
const { loginUsable } = require('./login-expiry.js');

/** Every reason a pinned account cannot serve a resume — each has a sentence below. */
const RESUME_ACCOUNT_WHYS = Object.freeze(['wiped', 'never-logged-in', 'expired', 'oat-expired', 'missing-account', 'remote-cannot-ship', 'pool-no-target']);
/** The per-session config's word for the machine's (or host's) own CLI login — session-props / the billing switcher. */
const MACHINE_LOGIN = 'subscription';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isPool = (a) => !!(a && (a.pooled || a.type === 'pooled'));
const typeRank = (a) => (isPool(a) ? 0 : a.type === 'subscription' ? 1 : 2); // the Manage agents roster's order
const byRoster = (a, b) => typeRank(a) - typeRank(b) || String(a.name || '').localeCompare(String(b.name || ''));

/** Can this account row run a conversation HERE? → { ok } | { ok: false, why, since }. */
function rowServes(a, { host = null, verdicts = null, logins = null } = {}) {
  if (!a) return { ok: false, why: 'missing-account', since: null };
  if (host) {
    // a pool switches a credentials dir on THIS machine — it never runs on a host (evaluateOnHost 'pool-local-only')
    if (isPool(a)) return { ok: false, why: 'remote-cannot-ship', since: null };
    const v = verdicts && verdicts[a.id];
    if (!v) return { ok: true, unjudged: true }; // the host has not answered yet: no claim (the create judges)
    if (v.usable) return { ok: true };
    if (v.reason === 'oat-expired') return { ok: false, why: 'oat-expired', since: null };
    if (v.reason === 'never-signed-in') return { ok: false, why: 'never-logged-in', since: null };
    return { ok: false, why: 'remote-cannot-ship', since: null, reason: v.reason || null };
  }
  // a pool serves while ANY member can: the create re-points a dead target to a live member (resolveForSpawn's
  // self-heal) — `memberOptions` is the list of members with a valid login (poolMembers)
  if (isPool(a)) return (a.current && a.loggedIn) || (Array.isArray(a.memberOptions) && a.memberOptions.length) ? { ok: true } : { ok: false, why: 'pool-no-target', since: null };
  if (a.type !== 'subscription') return { ok: true }; // an API key always serves on this machine
  const ls = a.loginState && typeof a.loginState === 'object' ? a.loginState : null;
  const cred = (logins && logins[a.id]) || null;
  if (ls && ls.state === 'oat-only') return { ok: true }; // a dead login, a live token: the token is the spawn
  const days = num(a.oatDaysLeft);
  const oatLive = !!a.oat && (days == null || days >= 0);
  if (a.loggedIn) {
    if (!ls || loginUsable(ls)) return { ok: true };
    // the login's refresh deadline passed: it still parses loggedIn, and the CLI's first refresh fails
    return { ok: false, why: 'expired', since: num(cred && cred.state === 'expired' ? cred.since : null) ?? num(ls.refreshExpiresAt) };
  }
  if (oatLive) return { ok: true };
  if (a.oat) return { ok: false, why: 'oat-expired', since: num(ls && ls.oatValidUntil) ?? num(cred && cred.since) };
  if ((ls && ls.state === 'logged-out') || (cred && cred.state === 'wiped')) return { ok: false, why: 'wiped', since: num(cred && cred.since) };
  if ((ls && ls.state === 'expired') || (cred && cred.state === 'expired')) return { ok: false, why: 'expired', since: num(cred && cred.since) ?? num(ls && ls.refreshExpiresAt) };
  return { ok: false, why: 'never-logged-in', since: null };
}

/**
 * resumeAccountVerdict({ pinned, accounts, loginStates, poolAvailable, defaults })
 *   pinned       { account, backend, host } — `account` = the conversation's per-session config ('' = the default account,
 *                MACHINE_LOGIN = the CLI's own login, else an account id); `host` = the machine it resumes on (null = here)
 *   accounts     the accounts list's rows (GET /api/accounts / accounts-updated)
 *   loginStates  the usage route's `logins` map: id → { state, usable, since } (src/login-state.js)
 *   poolAvailable false ⇒ no pool is offered (default: a pool may serve a conversation on this machine)
 *   defaults     { defaultAccountId, machineLogin: { loggedIn }, hostVerdicts: id → evaluateOnHost verdict }
 * → { ok: true } | { ok: false, why, account: { id, name }, since, viaDefault, doors: [relogin?, switch] }
 */
function resumeAccountVerdict({ pinned = {}, accounts = [], loginStates = null, poolAvailable, defaults = {} } = {}) {
  const backend = pinned.backend || 'claude';
  const host = pinned.host || null;
  const rows = (Array.isArray(accounts) ? accounts : []).filter((a) => a && (a.backend || 'claude') === backend);
  const facts = { host, verdicts: defaults.hostVerdicts || null, logins: loginStates || null };
  const raw = typeof pinned.account === 'string' ? pinned.account : '';
  const viaDefault = !raw;
  const id = raw || defaults.defaultAccountId || null;
  if (!id || id === MACHINE_LOGIN) return { ok: true }; // the CLI's own login: nothing here can read it
  const row = rows.find((a) => a.id === id) || null; // a pinned (or default) id no row carries: the create throws "unknown account"
  const judged = rowServes(row, facts);
  if (judged.ok) return judged.unjudged ? { ok: true, unjudged: true } : { ok: true };
  const pools = poolAvailable !== false && !host;
  // a switch target must SERVE, not merely be unjudged: a row the host has not answered for is read by its local facts
  const canTake = (a) => {
    const r = rowServes(a, facts);
    return r.ok && (!r.unjudged || (!isPool(a) && rowServes(a, { ...facts, host: null }).ok));
  };
  const to = [];
  const add = (a, kind) => {
    if (!a || a.id === id || to.some((x) => x.id === a.id) || (isPool(a) && !pools) || !canTake(a)) return;
    to.push({ id: a.id, name: a.name || a.id, kind });
  };
  for (const a of rows.filter(isPool).sort(byRoster)) add(a, 'pool');
  add(rows.find((a) => a.id === defaults.defaultAccountId), 'default');
  for (const a of rows.filter((x) => !isPool(x)).sort(byRoster)) add(a, 'account');
  if (!host && defaults.machineLogin && defaults.machineLogin.loggedIn) to.push({ id: MACHINE_LOGIN, name: null, kind: 'machine' });
  const doors = [];
  if (row) doors.push({ kind: 'relogin', accountId: row.id, via: isPool(row) || judged.why === 'remote-cannot-ship' ? 'manage' : 'login' });
  doors.push({ kind: 'switch', to });
  return { ok: false, why: judged.why, account: { id, name: row ? row.name || id : null }, since: judged.since ?? null, viaDefault, ...(host ? { host } : {}), doors };
}

const fill = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : String(s));
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * The refusal's words, in the page's language (`t` = the bundle's i18n; `date` formats the stop instant):
 * → { sentence, relogin (the first button's label, null when there is no account to log in), switch, none }
 * `none` is said when no other account can run the conversation (the switch door then has nothing to offer).
 */
function resumeAccountWords(v, { t = fill, date = isoDay, hostName = '' } = {}) {
  if (!v || v.ok) return null;
  const name = (v.account && v.account.name) || '';
  const when = num(v.since) != null ? date(v.since) : '';
  let sentence;
  switch (RESUME_ACCOUNT_WHYS.includes(v.why) ? v.why : '') {
    case 'wiped': sentence = when
      ? t('“{name}” was signed out on {date} — its login on this machine is gone, so this conversation can’t resume on it.', { name, date: when })
      : t('“{name}” was signed out — its login on this machine is gone, so this conversation can’t resume on it.', { name }); break;
    case 'never-logged-in': sentence = t('“{name}” has no login on this machine, so this conversation can’t resume on it.', { name }); break;
    case 'expired': sentence = when
      ? t('“{name}”’s login expired on {date}, so this conversation can’t resume on it.', { name, date: when })
      : t('“{name}”’s login has expired, so this conversation can’t resume on it.', { name }); break;
    case 'oat-expired': sentence = when
      ? t('“{name}”’s long-lived token ended on {date} and it has no working login, so this conversation can’t resume on it.', { name, date: when })
      : t('“{name}”’s long-lived token has ended and it has no working login, so this conversation can’t resume on it.', { name }); break;
    case 'missing-account': sentence = t('The account this conversation resumes on was removed, so it can’t resume until you pick another.'); break;
    case 'remote-cannot-ship': sentence = t('“{name}” can’t run on {host}, so this conversation can’t resume there.', { name, host: hostName || t('this machine') }); break;
    case 'pool-no-target': sentence = t('The pool “{name}” has no member that can serve right now, so this conversation can’t resume on it.', { name }); break;
    default: sentence = t('“{name}” can’t serve right now, so this conversation can’t resume on it.', { name });
  }
  const re = (v.doors || []).find((d) => d.kind === 'relogin');
  const sw = (v.doors || []).find((d) => d.kind === 'switch');
  return {
    sentence,
    relogin: re ? (re.via === 'login' ? t('Log in to {name} again', { name }) : t('Open {name} in Manage agents', { name })) : null,
    switch: t('Use another account'),
    none: sw && sw.to.length ? null : t('No other account can run it right now — add one in Manage agents.'),
  };
}

/** A switch candidate's label in the picker (`machine` = the billing row's word for the CLI's own login). */
function candidateLabel(c, { t = fill, machine = 'CLI login' } = {}) {
  if (!c) return '';
  if (c.kind === 'machine') return t(machine);
  if (c.kind === 'pool') return t('{name} (pool)', { name: c.name });
  if (c.kind === 'default') return t('{name} (default account)', { name: c.name });
  return c.name;
}

module.exports = { RESUME_ACCOUNT_WHYS, MACHINE_LOGIN, rowServes, resumeAccountVerdict, resumeAccountWords, candidateLabel };

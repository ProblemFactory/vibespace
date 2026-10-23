'use strict';
// DAY ONE (lane door-day-one-landing — two naive-user studies on fleet pods, 2.369.342: seven testers met a welcome written
// for coding agents, an SSO sentence after a password, a second password before anything was stored, a folder box that
// asked them to type a path, sessions they never made, the first chat called «Session 3» and an unlabelled rail). Day one
// asks ONE thing — what to work on — and lands in a chat on the folder that holds the person's files; the rest waits until
// it is needed. Each of those questions is decided HERE, once (scripts/test-day-one.mjs drives every rule):
//   · tourSteps — the welcome tour's steps: welcome → connect → protect → start; `protect` only on a workspace nobody
//     protects yet (SSO or a sign-in password already set ⇒ the admin owns the sign-in: the step, and its SSO sentence, leave);
//   · folderChips — the folder chips of the New Session dialog and of the tour's start step: a Task Group's own folders,
//     the home's folders WITH files (most files first, at most HOME_CHIPS), «the last one you used», the home's other
//     folders, the other recent folders. The field itself is never pre-filled from another area — a chip fills it;
//   · firstFilesFolder — the folder the tour starts the first chat in (the one holding the most files);
//   · vaultSetupAsk — the vault's second password is asked ONLY once a secret is stored (the hub's facts say
//     `secretWaiting`), never on day one; «Later» snoozes it for VAULT_LATER_MS on this device;
//   · railLabels / railUsed — the rail's words under its icons: the first week, or until every door was used once;
//   · gitIdentityPlan — git's name and email default from the sign-in's account, only where git has none;
//   · SIGN_IN — the purpose a sign-in terminal carries: it is not a session row (the sidebar, the live count).
// PURE: imports nothing (scripts/test-architecture.mjs PURE set) — the bundle and the hub share it.

const DAY_MS = 24 * 3600e3;
const RAIL_WEEK_MS = 7 * DAY_MS;
const VAULT_LATER_MS = 3 * DAY_MS;
const MAX_CHIPS = 8;      // chips beyond a Task Group's own folders
const HOME_CHIPS = 4;     // of them, the home's folders
const SIGN_IN = 'sign-in';
const RAIL_DONE = 'done';
const STEPS = Object.freeze(['welcome', 'connect', 'protect', 'start']);

/** The welcome tour's steps, in order. `protect` (the sign-in password; the SSO sentence) only where nothing protects the
 *  workspace yet — a pod the admin provisioned already has its sign-in. */
function tourSteps({ ssoEnabled = false, authEnabled = false } = {}) {
  return STEPS.filter((s) => s !== 'protect' || (!ssoEnabled && !authEnabled));
}

const normPath = (p) => { const s = String(p == null ? '' : p).trim(); return s.length > 1 ? s.replace(/\/+$/, '') : s; };
const countOf = (f) => (f && f.files != null && Number.isFinite(Number(f.files)) ? Number(f.files) : null);

/** THE FOLDER CHIPS, in order. `folders` = the home's folders from GET /api/home-folders ([{ name, path, files, more,
 *  mount }] — `files` null = not counted), `recent` = the folders of this machine's sessions, newest first, `task` = the
 *  picked Task Group's folders ([{ path, tip, color }]). → [{ path, kind: 'task' | 'files' | 'last' | 'folder' |
 *  'recent', name?, files?, more?, last?, tip?, color? }] — a path once; a Task Group's folders all, the rest ≤ max. */
function folderChips({ folders = [], recent = [], task = [], max = MAX_CHIPS, homeMax = HOME_CHIPS } = {}) {
  const out = [];
  const seen = new Set();
  let rest = 0;
  const add = (chip, bounded = true) => {
    const p = normPath(chip.path);
    if (!p || seen.has(p) || (bounded && rest >= max)) return null;
    seen.add(p);
    if (bounded) rest++;
    const c = { ...chip, path: p };
    out.push(c);
    return c;
  };
  for (const t of Array.isArray(task) ? task : []) if (t && t.path) add({ path: t.path, kind: 'task', tip: t.tip || '', color: t.color || '' }, false);
  const home = (Array.isArray(folders) ? folders : []).filter((f) => f && f.path && f.name && !String(f.name).startsWith('.'));
  const withFiles = home.filter((f) => countOf(f) > 0)
    .sort((a, b) => countOf(b) - countOf(a) || String(a.name).localeCompare(String(b.name)));
  let n = 0;
  for (const f of withFiles) {
    if (n >= homeMax) break;
    if (add({ path: f.path, kind: 'files', name: String(f.name), files: countOf(f), more: !!f.more })) n++;
  }
  const recents = (Array.isArray(recent) ? recent : []).map(normPath).filter(Boolean);
  const last = recents[0];
  if (last) {
    const had = out.find((c) => c.path === last);
    if (had) had.last = true;
    else add({ path: last, kind: 'last', last: true });
  }
  for (const f of home) {
    if (n >= homeMax) break;
    if (countOf(f) > 0) continue;
    if (add({ path: f.path, kind: 'folder', name: String(f.name), files: countOf(f) })) n++;
  }
  for (const r of recents.slice(1)) add({ path: r, kind: 'recent' });
  return out;
}

/** The folder the tour's first chat starts in: the home's folder holding the most files — null when none holds any. */
function firstFilesFolder(chips) {
  const c = (Array.isArray(chips) ? chips : []).find((x) => x && x.kind === 'files');
  return c ? c.path : null;
}

/** May the page ask for the vault's second password now? Only while the vault is not set up AND a secret is stored (or a
 *  store was refused for want of a vault) — `secretWaiting` from the hub's facts — and «Later» has not snoozed it. Day one
 *  stores nothing, so day one never asks. A set-up vault's unlock ask is src/vault-loud.js's, not this. */
function vaultSetupAsk({ facts = null, snoozedUntil = 0, now = Date.now() } = {}) {
  if (!facts || facts.state !== 'not_set_up') return false;
  if (!facts.secretWaiting) return false;
  return !(Number(snoozedUntil) > now);
}
/** «Later» on the setup ask: the epoch ms until which this device is not asked again. */
const vaultLaterUntil = (now = Date.now()) => now + VAULT_LATER_MS;

/** The rail's record (localStorage `vs-rail-labels`): RAIL_DONE, or { since, used: [door] }. → { show, record } — `record`
 *  is what to keep (the first sight starts the week). The words show for the first week, or until every door was used. */
function railLabels({ record = null, now = Date.now(), doors = [] } = {}) {
  if (record === RAIL_DONE || (record && record.done)) return { show: false, record: RAIL_DONE, why: 'done' };
  const since = record && Number.isFinite(Number(record.since)) && Number(record.since) > 0 ? Number(record.since) : now;
  const used = record && Array.isArray(record.used) ? [...new Set(record.used.map(String))] : [];
  if (now - since >= RAIL_WEEK_MS) return { show: false, record: RAIL_DONE, why: 'week' };
  const all = (Array.isArray(doors) ? doors : []).map(String);
  if (all.length && all.every((d) => used.includes(d))) return { show: false, record: RAIL_DONE, why: 'used' };
  return { show: true, record: { since, used } };
}
/** A door was used: the record with it (RAIL_DONE stays done). */
function railUsed(record, door) {
  if (record === RAIL_DONE || (record && record.done)) return RAIL_DONE;
  const since = record && Number(record.since) > 0 ? Number(record.since) : null;
  const used = record && Array.isArray(record.used) ? record.used.map(String) : [];
  const d = String(door || '');
  return { since, used: d && !used.includes(d) ? [...used, d] : used };
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
/** git's identity, defaulted from the sign-in's account. `configured` = { name, email } git already has (global / system),
 *  `account` = { email, name } of the Claude sign-in. → { name?, email? } to set, or null. Never overrides what git has;
 *  never mixes two people (a configured email that is not the account's ⇒ nothing). */
function gitIdentityPlan({ configured = {}, account = null } = {}) {
  const email = String((account && account.email) || '').trim();
  if (!EMAIL_RE.test(email)) return null;
  const name = String((account && account.name) || '').trim().replace(/[\r\n<>]/g, '') || email.split('@')[0];
  const haveEmail = String((configured && configured.email) || '').trim();
  const haveName = String((configured && configured.name) || '').trim();
  if (haveEmail && haveEmail.toLowerCase() !== email.toLowerCase()) return null;
  const set = {};
  if (!haveEmail) set.email = email;
  if (!haveName) set.name = name;
  return Object.keys(set).length ? set : null;
}

/** A live row a sign-in opened (its terminal) — never a session row. */
const isSignInRow = (row) => !!row && row.purpose === SIGN_IN;

module.exports = {
  DAY_MS, RAIL_WEEK_MS, VAULT_LATER_MS, MAX_CHIPS, HOME_CHIPS, SIGN_IN, RAIL_DONE, STEPS,
  tourSteps, folderChips, firstFilesFolder, vaultSetupAsk, vaultLaterUntil, railLabels, railUsed, gitIdentityPlan, isSignInRow,
};

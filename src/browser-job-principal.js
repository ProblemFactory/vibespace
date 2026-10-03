'use strict';
/**
 * browser-job-principal.js — A BACKGROUND WORK JOB BROWSES AS ITS OWNER CONVERSATION (lane jobs-browser, B-dbc1,
 * 2026-10-02). PURE: imports only the PURE browser-profiles.js (its key shapes).
 *
 * WHY. A user's daily reconciliation job could not leave the old desktop Chromium: every /api/agent/browser/* route
 * refused a job's `jbt_` token (only `vsst_` was admitted), so a scheduled job had no way to use the logged-in profile
 * its conversation uses. Every other agent route already admits a job AS THE CONVERSATION THAT OWNS IT (vibespace-msg,
 * vibespace-channels withdraw, vibespace-docs) — the browser now does too, under the same rules.
 *
 * THE PRINCIPAL — jobPrincipalOf({job, ownerKey}):
 *   ADMISSION = the OWNER conversation's: the job's lease key is a CHILD HANDLE of the owner's browser key
 *     (`bk-<owner>.<n>`, recorded with `job: <jobId>`), and every admission rule judges a child key as its parent
 *     (browser-profiles mayAttach / whoMayUse via parentKeyOf). A conversation that may not use a profile ⇒ its job is
 *     refused by the same name (`not_owner`). A job never widens anything: it cannot pin, attach, create, detach, switch
 *     a backend, file a claim or reset a site (JOB_ROUTES_REFUSED — refused `job_token`).
 *   THE PROFILE = the owner conversation's CURRENT pin / default attachment (jobResolveVerdict): same profile, same
 *     logins. No pin and no attachment ⇒ `job_no_profile` (the owner's own temporary browser is never a job's).
 *   ITS OWN WINDOW: its own lease in that profile's browser (one window per holder, lane browser-windows) — like a helper.
 *   LIFETIME: the lease lives while the job RUNS (state starting | up — RUNNING_STATES): the keeper counts a running
 *     job's handle as carried, so a job whose owner conversation is GONE (killed, archived) keeps browsing until the
 *     job ends (the kept-logins rule is unchanged — the profile's logins are the profile's). The run's finalize
 *     releases it at once; the boot reconcile drops the handle of any job that is not running (jobChildrenToRelease).
 *   NAMES: a job's NAME is never persisted with its browsing (lane-redact verify r9: a copy of its words the job's
 *     "Clear content…" never reaches) — the trace stores `job: <jobId>`, the name is read live (jobLabelOf).
 */
const B = require('./browser-profiles.js');

const RUNNING_STATES = Object.freeze(['starting', 'up']);
/** The /api/agent/browser/<route> verbs a job may call: read, act, answer a dialog. */
const JOB_ROUTES_ALLOWED = Object.freeze(['profiles', 'status', 'providers', 'resolve', 'audit', 'tab', 'dialog', 'direct']);
/** …and the ones that would change the conversation's browsers — refused by name. Any route in neither list is refused too. */
const JOB_ROUTES_REFUSED = Object.freeze(['use', 'pin', 'new', 'new-child', 'detach', 'backend', 'blocked', 'site-hint', 'site-reset', 'resume']);

function isRunningJob(job) { return !!job && typeof job === 'object' && RUNNING_STATES.includes(job.state); }
function ownerConversationOf(job) {
  const cid = job && job.owner && job.owner.conversation && job.owner.conversation.id;
  return typeof cid === 'string' && cid ? cid : null;
}
/** The words a surface shows for a job (read live — never stored with its browsing). */
function jobLabelOf(job) {
  if (!job) return 'job';
  const name = typeof job.name === 'string' ? job.name.trim().slice(0, 40) : '';
  return 'job ' + (name || String(job.id || '?'));
}

/**
 * → {ok:true, principal:{kind:'job', jobId, ownerConversationId, ownerKey}} | {ok:false, code, error}.
 * `ownerKey` = the owner conversation's browser key (its live session's, else its recorded binding), '' when none.
 */
function jobPrincipalOf({ job = null, ownerKey = '' } = {}) {
  if (!job || typeof job !== 'object' || !job.id) return { ok: false, code: 'unauthorized', error: 'unknown job token' };
  if (!isRunningJob(job)) return { ok: false, code: 'job_not_running', error: `${jobLabelOf(job)} is not running — a job uses the browser only while its run is alive` };
  const cid = ownerConversationOf(job);
  if (!cid) return { ok: false, code: 'job_no_owner', error: 'this job has no owner conversation — a job uses the browser as the conversation that created it; run vibespace-browser from a conversation' };
  if (!B.isBrowserKey(ownerKey)) {
    return { ok: false, code: 'no_browser_key', error: 'this job\'s conversation has no browser of its own yet — use vibespace-browser once from that conversation (pin the profile the job needs), then the job can use it' };
  }
  return { ok: true, principal: { kind: 'job', jobId: String(job.id), ownerConversationId: cid, ownerKey: String(ownerKey) } };
}

/** May a job call this route? Fail closed: only JOB_ROUTES_ALLOWED. */
function jobRouteVerdict(route) {
  const r = String(route || '');
  if (JOB_ROUTES_ALLOWED.includes(r)) return { ok: true };
  return { ok: false, code: 'job_token', error: `a Background Work job uses the browser as its conversation but never changes that conversation's browsers — "${r || '?'}" is refused for a job; run it from the conversation` };
}

/**
 * Which profile a job's command runs in: the OWNER's resolve verdict over the owner's set (browser-profiles
 * resolveHandle) → {ok:true, profileId} | a refusal. The owner's pin or attachment (by its handle or the default) is
 * the job's profile; the owner's temporary browser and a helper's handle never are.
 */
function jobResolveVerdict(v) {
  if (!v || typeof v !== 'object') return { ok: false, code: 'job_no_profile', error: 'this job\'s conversation has no profile to browse in' };
  if (!v.ok) return v;
  if (v.kind === 'attachment' && v.attachment && typeof v.attachment.profileId === 'string') return { ok: true, profileId: v.attachment.profileId };
  if (v.kind === 'pin' && typeof v.profileId === 'string') return { ok: true, profileId: v.profileId };
  if (v.kind === 'child') return { ok: false, code: 'job_no_profile', error: 'a job uses its conversation\'s profile — a helper\'s handle is not one; drop --profile, or name one of the conversation\'s profiles' };
  return { ok: false, code: 'job_no_profile', error: 'this job\'s conversation has no profile pinned — a job browses in its conversation\'s pinned profile (the same logins): pin one from the conversation (vibespace-browser pin <profile>)' };
}

/** The job's existing handle under this owner, or null (one handle per job per owner key). */
function jobHandleOf(children, jobId, ownerKey) {
  for (const [h, c] of Object.entries(children || {})) {
    if (c && c.job === String(jobId) && c.parent === ownerKey && B.isChildKey(h) && B.parentKeyOf(h) === ownerKey) return h;
  }
  return null;
}
/** Every job handle in the registry with its job id: [{handle, jobId}]. */
function jobHandles(children) {
  return Object.entries(children || {}).filter(([h, c]) => c && typeof c.job === 'string' && c.job && B.isChildKey(h)).map(([h, c]) => ({ handle: h, jobId: c.job }));
}
/** The handles a running job carries (the keeper adds them to its live set). `isRunning(jobId)` asks the jobs engine. */
function carriedJobHandles(children, isRunning) {
  const out = new Set();
  for (const { handle, jobId } of jobHandles(children)) { let on = false; try { on = !!isRunning(jobId); } catch { on = false; } if (on) out.add(handle); }
  return out;
}
/** THE RELEASE RULE (evidence, never a name): a job handle whose job is not running — finished, archived, unknown. */
function jobChildrenToRelease(children, isRunning) {
  const carried = carriedJobHandles(children, isRunning);
  return jobHandles(children).filter((x) => !carried.has(x.handle));
}

module.exports = {
  RUNNING_STATES, JOB_ROUTES_ALLOWED, JOB_ROUTES_REFUSED,
  isRunningJob, ownerConversationOf, jobLabelOf, jobPrincipalOf, jobRouteVerdict, jobResolveVerdict,
  jobHandleOf, jobHandles, carriedJobHandles, jobChildrenToRelease,
};

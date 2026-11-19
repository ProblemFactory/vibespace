'use strict';
// A PUBLISHED SERVICE'S NOTICES ARE STATE CHANGES (lane job-notice-dedupe — three agent feedback records, the owner:
// 「注意看一下 agent 给的 CLI 反馈」). A `--keep-up --publish` service whose publish failed for a cause only the owner can
// clear (the vault locked at every restart) said the SAME «public URL … is DOWN — publish failed: the vault is locked» to
// its conversation at every server restart (fb-4ff6e673ad, fb-a001be4917). The verdict over the job's persisted down
// record (`publishDown` — it survives a restart, which is when the repeat came) and ONE publish outcome (the job's own
// attempt, or the relay's success the Ports manager adopted):
//   · none → failed(X)       ONE «DOWN» notice naming X — only when there is a URL to be down (a first publish that never
//                            had one is the creator's poll, as before)
//   · failed(X) → failed(X)  nothing: the record counts (`attempts`) and keeps when the cause began (`sinceAt`)
//   · failed(X) → failed(Y)  ONE «DOWN» notice naming Y
//   · failed → published     ONE «back UP» notice — only when a DOWN was said in this episode (`said`, sticky)
//   · none → published       nothing here (a URL that CHANGED is said by the job's own proven check — urlChangeVerdict)
// A URL CHANGE IS SAID ONLY WHEN PROVEN (B-74f5 — fb-71b12fb3cd, fb-197c3042ca, fb-9efc35787c: at the 01:14Z restart three
// conversations were told «public URL CHANGED to tcp://…, the old link no longer works» while the https address kept answering
// and the tcp one answered nothing): after the restart's grace, the new address answered AND the old one failed. A web address
// (http / https) read as tcp:// — the http probe misfired while the service or the relay came back — is not the job's until then.
// THE VAULT CLASS IS NEVER SAID PER JOB: the vault's own For-you item carries it (the owner is the one who can clear it);
// the job's status says it is waiting for the vault. Nor is THE DROPPED LOGIN (lane frp-token-proof — the relay takes this
// instance's login and closes it at once: frpc runs without the shared token it still requires): the frp plugin's ONE
// For-you item carries it, the job's status says it is waiting for the relay — never «DNS» nor «a port in use». Causes are CLASSES by name (`causeOf`), so a relay sentence that
// carries a port number or a time is still the same cause on the next attempt.
// PURE: imports nothing (scripts/test-architecture.mjs PURE set); unit-pinned by scripts/test-job-notice.mjs.

const CAUSE_RULES = [   // first match wins; the sentences are src/plugins/frp.js's and src/port-forward.js's own
  ['vault_locked', (code, msg) => code === 'vault_locked' || /\bvault is locked\b/i.test(msg)],
  ['relay_login_dropped', (code, msg) => code === 'relay_login_dropped' || /closes the connection right after/i.test(msg)],   // before the generic texts: nothing was refused
  ['relay_not_configured', (code, msg) => /relay is not configured|public URLs are not available/i.test(msg)],
  ['port_in_use', (code, msg) => /could not allocate a public port/i.test(msg)],
  ['subdomain_refused', (code, msg) => /could not publish the subdomain/i.test(msg)],
  ['forward_inactive', (code, msg) => /forward is not active|no such forward/i.test(msg)],
  ['relay_unreachable', (code, msg) => /frpc (reload failed|not installed)|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|timed? ?out/i.test(msg)],
];
const CLASSES = Object.freeze(CAUSE_RULES.map(([c]) => c));
const OWNER_CLASSES = ['vault_locked', 'relay_login_dropped'];   // the owner already has ONE item for each — never said per job
const SAID_PER_JOB = (cause) => !OWNER_CLASSES.includes(cause);
// the status words of the vault class (the agent is told the owner already has it — never asked to pass it on)
const VAULT_WAIT = 'waiting for the vault — it is locked; the owner has the unlock item (For you) and unlocks it on this instance\'s page; this republishes by itself when it opens';
// lane frp-token-proof: the dropped login's — the relay's own words (the error) follow it
const RELAY_WAIT = 'waiting for the relay — it drops this instance\'s login (frpc runs without the shared relay token it still requires); the owner has the item (For you); this republishes by itself once frpc carries the token';
const ERROR_MAX = 300;

const clip = (s, n) => ([...String(s)].length <= n ? String(s) : [...String(s)].slice(0, n - 1).join('') + '…');
const errorText = (e) => clip(String((e && typeof e === 'object' ? e.message : e) || 'publish failed'), ERROR_MAX);
const when = (at) => (Number(at) > 0 ? new Date(Number(at)).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '?');

/** the CLASS of a publish failure; anything else is its own sentence (numbers folded) — same words, same cause */
function causeOf(err) {
  const code = err && typeof err === 'object' ? String(err.code || '') : '';
  const msg = String((err && typeof err === 'object' ? err.message : err) || '');
  for (const [cause, hit] of CAUSE_RULES) if (hit(code, msg)) return cause;
  return 'other:' + msg.toLowerCase().replace(/\d+/g, 'N').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** what a job's status says about its down record: the cause's words (the relay's sentence; the vault class its wait) */
function whyOf(rec) {
  if (!rec || !rec.cause) return null;
  return rec.cause === 'vault_locked' ? VAULT_WAIT : rec.cause === 'relay_login_dropped' ? `${RELAY_WAIT} (${rec.error || rec.cause})` : (rec.error || rec.cause);
}

/**
 * prev = the job's down record { cause, error, sinceAt, downAt, attempts, said } or null (published / never failed)
 * next = { ok: true, url } | { ok: false, error, cause? } — ONE publish outcome
 * url  = the URL that is down (the job's lastPublicUrl) or null
 * → { record: the new down record or null, notice: null | { kind: 'down' | 'recovered', cause, what } }
 */
function noticeVerdict({ prev = null, next, url = null, at = 0 } = {}) {
  const p = prev && typeof prev === 'object' && prev.cause ? prev : null;
  if (next && next.ok) {
    if (!p || !p.said) return { record: null, notice: null };   // nothing was said ⇒ neither is the recovery
    const to = next.url || null, since = when(p.downAt || p.sinceAt);
    const what = to && url && to !== url   // B-74f5: never «the old link no longer works» here — the proven check says a change
      ? `public URL is back UP at ${to} (it was published at ${url}); it was down since ${since}`
      : `public URL ${to || url} is back UP — published again (down since ${since})`;
    return { record: null, notice: { kind: 'recovered', cause: p.cause, what, since } };   // `since`: the change check's one notice says it (B-74f5 r2)
  }
  const n = next || {};
  const cause = typeof n.cause === 'string' && n.cause ? n.cause : causeOf(n.error);
  const error = errorText(n.error);
  if (p && p.cause === cause) return { record: { ...p, error, attempts: (Number(p.attempts) || 1) + 1, lastAt: at }, notice: null };
  const say = SAID_PER_JOB(cause) && !!url;
  const record = { cause, error, sinceAt: at, downAt: (p && p.downAt) || at, lastAt: at, attempts: 1, said: !!(p && p.said) || say };
  return { record, notice: say ? { kind: 'down', cause, what: `public URL ${url} is DOWN — publish failed: ${error} (said once: the next notice is when it is back, or a different cause)` } : null };
}

const isWeb = (u) => /^https?:\/\//i.test(String(u || ''));
/** B-74f5: a web address followed by a tcp:// one — the web address stays the job's until the change is proven */
function keepsWebUrl(from, to) { return isWeb(from) && /^tcp:\/\//i.test(String(to || '')); }

/**
 * B-74f5 — ONE check of a URL change, made after the restart's grace: from = the job's last URL, to = the relay's new one,
 * toAnswers / fromAnswers = what one look at each address found
 * → { say, adopt, again, why }: say = the change is proven (the new answered, the old failed); adopt = the job takes `to`
 *   (a web address read as tcp:// only when proven); again = look once more later (neither answered yet: the relay may still
 *   be coming back); why = the journal's words when nothing is said
 */
function urlChangeVerdict({ from = null, to = null, toAnswers = false, fromAnswers = true } = {}) {
  const seen = { toAnswers: !!toAnswers, fromAnswers: !!fromAnswers };
  if (!from || !to || from === to) return { say: false, adopt: true, again: false, why: 'no change', ...seen };
  if (toAnswers && !fromAnswers) return { say: true, adopt: true, again: false, why: 'proven', ...seen };
  const adopt = !keepsWebUrl(from, to);
  if (fromAnswers) return { say: false, adopt, again: false, why: toAnswers ? 'both addresses answer' : 'the old address still answers', ...seen };
  return { say: false, adopt, again: true, why: 'neither address answers yet', ...seen };
}

/**
 * B-74f5 r2 — ONE WAKE A CHANGE: the words of the check's end (null = nothing said). `recovered` = { since } when a «DOWN» was said
 * and the relay published again at another address: the recovery waited for this check and is said HERE, once — never a «back
 * UP» and then a «CHANGED» (two turns nobody typed). Without a recovery only a proven change is said.
 */
function urlChangeWords({ from, to, verdict, recovered = null } = {}) {
  const down = recovered && recovered.since ? `; it was down since ${recovered.since}` : '';
  if (verdict && verdict.say) return recovered
    ? `public URL is back UP at a NEW address: ${from} → ${to} (the old link no longer works — share the new one)${down}`
    : `public URL CHANGED: ${from} → ${to} (the old link no longer works — share the new one)`;
  if (!recovered) return null;
  if (verdict && verdict.again) return `public URL is published again (the relay gives ${to}; it was ${from}) — neither address answered a check yet${down}`;
  const also = verdict && verdict.toAnswers && !keepsWebUrl(from, to) ? ` (${to} answers too)` : '';
  return `public URL ${from} is back UP — published again${also}${down}`;
}

module.exports = { causeOf, whyOf, noticeVerdict, keepsWebUrl, urlChangeVerdict, urlChangeWords, CLASSES, VAULT_WAIT, RELAY_WAIT, SAID_PER_JOB };

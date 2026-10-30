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
//   · none → published       nothing here (a URL that CHANGED is said by the job's own adopt, as before)
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
    const what = to && url && to !== url
      ? `public URL is back UP at a NEW address: ${url} → ${to} (the old link no longer works — share the new one); it was down since ${since}`
      : `public URL ${to || url} is back UP — published again (down since ${since})`;
    return { record: null, notice: { kind: 'recovered', cause: p.cause, what } };
  }
  const n = next || {};
  const cause = typeof n.cause === 'string' && n.cause ? n.cause : causeOf(n.error);
  const error = errorText(n.error);
  if (p && p.cause === cause) return { record: { ...p, error, attempts: (Number(p.attempts) || 1) + 1, lastAt: at }, notice: null };
  const say = SAID_PER_JOB(cause) && !!url;
  const record = { cause, error, sinceAt: at, downAt: (p && p.downAt) || at, lastAt: at, attempts: 1, said: !!(p && p.said) || say };
  return { record, notice: say ? { kind: 'down', cause, what: `public URL ${url} is DOWN — publish failed: ${error} (said once: the next notice is when it is back, or a different cause)` } : null };
}

module.exports = { causeOf, whyOf, noticeVerdict, CLASSES, VAULT_WAIT, RELAY_WAIT, SAID_PER_JOB };

'use strict';
/**
 * server-root.js — IS THIS SERVER THE OWNER'S INSTANCE? (lane hook-root-guard,
 * B-c77a, 2026-10-02). PURE: imports nothing; the caller reads the facts.
 *
 * WHY. Twice a server booted from a lane WORKTREE wrote the owner's real CLI
 * config: on 2026-07-21 a /tmp rail-smoke worktree pointed every hook in
 * ~/.claude/settings.json at its own /tmp path (MODULE_NOT_FOUND for two days
 * after the worktree was removed), and on 2026-10-01 a verify round's worktree
 * under /var/tmp registered its hooks into ~/.claude/settings.json and
 * ~/.codex/hooks.json. The old guard knew only "under os.tmpdir() or /tmp/";
 * a worktree under /var/tmp or beside the checkout passed it. The rule here:
 * A SERVER'S ROOT IS JUDGED BEFORE ANY OWNER-FILE WRITE, and only a plain
 * checkout is the owner's instance.
 *
 * THE VERDICT — rootVerdict(facts), first match wins:
 *   1. no absolute root                  → refused, kind 'unknown' (fail closed)
 *   1b. `error` (verify r1 F1): the facts could NOT be read — a stat / read failure on `.git`, on the gitdir it names or on
 *      its `commondir` (EACCES, EIO: an NFS hiccup) → refused, kind 'unknown' (fail CLOSED; the ORCH never caches an
 *      erroring read, so the next writer and the hook-health probe judge again — a transient error is never remembered).
 *      ENOENT on `.git` is not an error (the docker image has no git); a gone gitdir of the `<common>/worktrees/<name>`
 *      layout is a DANGLING worktree — the reader infers the common dir, so it stays rule 2 (it shipped as a checkout)
 *   2. a git WORKTREE: `.git` is a FILE whose gitdir sits under
 *      <common>/worktrees/ (git's own linked-worktree layout; a submodule's
 *      gitdir under .git/modules/ and a --separate-git-dir clone have no
 *      `commondir`, so their gitDir IS the common dir — both stay checkouts)
 *                                        → refused, kind 'worktree', names the checkout
 *   3. under a TMP root (os.tmpdir(), /tmp, /var/tmp — the caller passes them;
 *      every `vs-` scratch dir scripts/scratch.mjs mints lives under one, so
 *      the scratch prefix is covered by construction; a `vs-` name ELSEWHERE is
 *      not judged — a user's clone may be called anything)
 *                                        → refused, kind 'tmp'
 *   4. VIBESPACE_SKIP_AGENT_HOOKS=1      → refused, kind 'override' (one rule
 *      of four, never the only one — the 2026-10-01 server did not set it)
 *   5. otherwise                         → ok, kind 'checkout'
 * A refusal is lifted ONLY by VIBESPACE_FORCE_AGENT_HOOKS=1 AND a HOME that is
 * itself under a tmp root (a suite registering into its OWN scratch home) →
 * ok, kind 'forced'. FORCE with a real HOME is ignored and the why says so: no
 * env var can aim a worktree's writes at the owner's files again.
 *
 * refusalLine(v) is THE journal sentence (one per boot, the ORCH half logs it);
 * the client words live in src/lib/cli-config-chips.js refusalLine.
 */

const OVERRIDE_ENV = 'VIBESPACE_SKIP_AGENT_HOOKS';
const FORCE_ENV = 'VIBESPACE_FORCE_AGENT_HOOKS';
const KINDS = ['checkout', 'forced', 'worktree', 'tmp', 'override', 'unknown'];

/** '/a/b/' → '/a/b'; keeps '/' itself. Non-strings → ''. */
function trimSlash(p) {
  if (typeof p !== 'string') return '';
  let s = p;
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}
const isAbs = (p) => typeof p === 'string' && p.startsWith('/');
/** Is `p` the directory `dir` or inside it (segment boundary — /tmpx is not under /tmp)? */
function isUnder(p, dir) {
  const a = trimSlash(p), d = trimSlash(dir);
  if (!isAbs(a) || !isAbs(d)) return false;
  if (d === '/') return true;
  return a === d || a.startsWith(d + '/');
}
/** The `gitdir: <path>` line of a worktree's (or submodule's) `.git` FILE, or null. */
function parseGitFile(text) {
  const m = /^gitdir:[ \t]*(.+?)[ \t]*$/m.exec(String(text == null ? '' : text));
  return m ? m[1] : null;
}
/** The checkout a common dir belongs to: '/x/repo/.git' → '/x/repo'; a bare
 *  common dir ('/x/repo.git') names itself. */
function checkoutOfCommonDir(common) {
  const c = trimSlash(common);
  return c.endsWith('/.git') ? (c.slice(0, -5) || '/') : c;
}
/** Is the git dir a LINKED WORKTREE of the common dir? */
function isLinkedWorktree(gitDir, gitCommonDir) {
  const g = trimSlash(gitDir), c = trimSlash(gitCommonDir);
  if (!isAbs(g) || !isAbs(c) || g === c) return false;
  return isUnder(g, c + '/worktrees') && g !== c + '/worktrees';
}

function rootVerdict({ root, gitCommonDir = null, gitDir = null, tmpRoots = [], envOverride = false, force = false, home = null, error = null } = {}) {
  const r = trimSlash(root);
  const roots = (Array.isArray(tmpRoots) ? tmpRoots : []).filter(isAbs).map(trimSlash);
  let refused = null;
  if (!isAbs(r)) {
    refused = { ok: false, kind: 'unknown', root: r || null, why: 'the server root is not an absolute path' };
  } else if (typeof error === 'string' && error) {
    // verify r1 F1: facts that could not be read never pass as "no git" — refused until a read succeeds
    refused = { ok: false, kind: 'unknown', root: r, why: `the server root could not be judged: ${error}` };
  } else if (isLinkedWorktree(gitDir, gitCommonDir)) {
    const checkout = checkoutOfCommonDir(gitCommonDir);
    refused = { ok: false, kind: 'worktree', root: r, checkout, why: `this server runs from a git worktree of ${checkout}` };
  } else {
    const tmp = roots.find((t) => isUnder(r, t));
    if (tmp) refused = { ok: false, kind: 'tmp', root: r, tmpRoot: tmp, why: `this server runs from a temporary folder (${r} is under ${tmp})` };
    else if (envOverride === true) refused = { ok: false, kind: 'override', root: r, why: `${OVERRIDE_ENV}=1 is set for this server` };
  }
  if (!refused) return { ok: true, kind: 'checkout', root: r };
  if (force === true) {
    const h = trimSlash(home);
    if (isAbs(h) && roots.some((t) => isUnder(h, t))) return { ok: true, kind: 'forced', root: r, why: `${FORCE_ENV}=1 under the scratch HOME ${h}` };
    return { ...refused, why: `${refused.why} (${FORCE_ENV}=1 is honoured only under a scratch HOME — ${isAbs(h) ? h : 'this HOME'} is not one)` };
  }
  return refused;
}

/** THE journal sentence for a refused verdict (null for an ok one). */
function refusalLine(v) {
  if (!v || v.ok) return null;
  const tail = v.kind === 'worktree'
    ? ` — the owner's CLI config belongs to that checkout's instance`
    : v.kind === 'tmp' ? ` — a throwaway server never writes the owner's CLI config`
      : v.kind === 'unknown' ? ' — nothing is written until the root can be judged (the facts are read again at the next writer and the hook-health probe)' : '';
  return `hooks not registered: ${v.why}${tail}`;
}

/** verify r2 ① (lane hook-root-guard): an `unknown` verdict at boot is RE-JUDGED WITH BACKOFF — not left to the hook-health
 *  probe's 60 s + 6 h (a session started meanwhile gets no hooks and its agent never learns the tools: the userZ class by our
 *  own hand). The ladder, then the cap for ever; `attempt` 0-based. */
const REJUDGE_BACKOFF_MS = Object.freeze([30 * 1000, 60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000]);
function nextRejudgeDelay(attempt) { const i = Math.max(0, Math.floor(Number(attempt) || 0)); return REJUDGE_BACKOFF_MS[Math.min(i, REJUDGE_BACKOFF_MS.length - 1)]; }
/** verify r2 ③: facts read WITHOUT error are kept this long — a `.git` converted in place (a checkout turned into a worktree
 *  while the server runs) is seen within a minute, not at the next restart. An erroring read is never kept (verify r1 F1). */
const ROOT_FACTS_TTL_MS = 60 * 1000;
/** verify r2 ①: the unknown notice is posted ONCE PER CAUSE until the verdict changes — never once per boot. `memo` = the
 *  persisted {cause} of the last notice the owner saw (null = none) → {post, memo}: post only when the cause is new. */
function unknownNoticeDue(memo, cause) {
  const c = String(cause || '').trim();
  if (!c) return { post: false, memo: (memo && typeof memo === 'object') ? memo : null };
  if (memo && typeof memo === 'object' && memo.cause === c) return { post: false, memo };
  return { post: true, memo: { cause: c } };
}
/** THE words of the recovery (the server notice; the Settings chip words the same fact with t()). */
function registeredAfterErrorLine({ time = '?', error = '' } = {}) {
  return `VibeSpace registered the agent hooks at ${time} after an earlier read error (${String(error || '').slice(0, 200)}) — sessions started since then have the tools; sessions started during the error pick them up after a restart or compaction.`;
}

module.exports = { OVERRIDE_ENV, FORCE_ENV, KINDS, REJUDGE_BACKOFF_MS, ROOT_FACTS_TTL_MS, trimSlash, isUnder, parseGitFile, checkoutOfCommonDir, isLinkedWorktree, rootVerdict, refusalLine, nextRejudgeDelay, unknownNoticeDue, registeredAfterErrorLine };

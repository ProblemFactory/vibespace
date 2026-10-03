'use strict';
/**
 * THE BOOT AUTO-UPDATE (moved out of server.js; lane cluster-presets P6, the
 * owner 2026-10-01 23:45 PDT: "为啥每次在集群部署都提示 ⚠ ff pull failed —
 * realigning to origin/master (fresh instance)").
 *
 * THE CHECKOUT STAYS CLEAN. Two TRACKED files are rewritten by the steps that
 * follow a pull: `package-lock.json` (npm 10 under node 22 — the fleet image —
 * rewrites the lockfile npm 11 wrote: one `"peer": true` dropped, measured on a
 * fleet pod 2026-10-02 04:43Z, `npm install --no-audit --no-fund` right after
 * the pull) and `src/agentd/version.js` (`npm run build:agentd` stamps the
 * package version). Left modified, the NEXT bare `git pull --ff-only` — this
 * one at the next boot, or an admin's tool — aborts "local changes would be
 * overwritten", and the admin's tool falls back to `reset --hard` with a
 * warning. So, per path (one bad pathspec never wedges the other — the
 * scripts/update.sh lesson): reset BEFORE the pull, and reset AGAIN after the
 * build. The second reset changes nothing a running process uses: the
 * installed tree is the lock's (the rewrite is metadata), and the daemon
 * bundle was already built from the stamped version.js.
 *
 * `npm install`, never `npm ci`, ON PURPOSE: `npm ci` deletes node_modules
 * before it installs, so a registry hiccup during a boot update would leave
 * the server unable to start; `npm install` keeps what it had, and the reset
 * makes the tree clean either way. Anything ELSE still modified after the
 * build is a tracked file a build rewrites that this list does not name: ONE
 * line names it (never a failed boot) — the fix is to add it here, in
 * scripts/update.sh and in deploy/docker/Dockerfile's seed step (the census in
 * scripts/test-fleet-image-seed.mjs keeps the three lists equal).
 */
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

/** The TRACKED files a pull's install + build rewrite (the ONE list). */
const BUILD_REWRITTEN_TRACKED = Object.freeze(['package-lock.json', 'src/agentd/version.js']);
/** Where the BEFORE-PULL reset keeps what it replaced (gitignored by `data/*`): ONE copy per file, the newest. */
const KEEP_DIR = 'data/auto-update';
const keptPath = (repoDir, f) => path.join(repoDir, KEEP_DIR, path.basename(f) + '.pre-reset');

/** The modified file, copied aside before `git checkout` discards it; false when it could not be (a deleted path). */
function keepCopy(repoDir, f) {
  try { fs.mkdirSync(path.join(repoDir, KEEP_DIR), { recursive: true }); fs.copyFileSync(path.join(repoDir, f), keptPath(repoDir, f)); return true; } catch { return false; }
}

/** Reset each path on its own; returns the paths that were reset (were modified).
 *  THE REPLACED COPY IS KEPT when `keep` is set (verify r1 ⑤): this module
 *  cannot tell a build's rewrite from a user's OWN edit of the same file (a
 *  fork pinning a dependency in its lockfile — reproduced: discarded with no
 *  copy, and the line blamed the build), so the BEFORE-PULL reset copies the
 *  modified file to data/auto-update/<name>.pre-reset first and the journal
 *  line names it. The after-build reset never keeps one — by construction
 *  nothing of the user's lands between the pull and the build, and a copy
 *  there would overwrite the one that matters. */
function resetRewritten(repoDir, { exec, files = BUILD_REWRITTEN_TRACKED, keep = false } = {}) {
  const reset = [];
  for (const f of files) {
    try {
      const modified = exec('git', ['-C', repoDir, 'status', '--porcelain', '--untracked-files=no', '--', f], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      if (!modified) continue;
      if (keep) keepCopy(repoDir, f);
      exec('git', ['-C', repoDir, 'checkout', 'HEAD', '--', f], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
      reset.push(f);
    } catch { /* an untracked / absent path: nothing to reset */ }
  }
  return reset;
}
/** The TRACKED helpers under data/bin/ the server re-generates at BOOT (e.g.
 *  data/bin/vibespace-hook-register.mjs, src/server/agent-tool-generators.js):
 *  identical to the commit unless a release forgot to regenerate one — then
 *  modified, and the next pull would abort on it. Reset per path BEFORE the
 *  pull only (the running server keeps what it generated) — the same rule as
 *  scripts/update.sh's `git ls-files -m data/bin/`. */
function generatedModified(repoDir, { exec }) {
  try {
    return exec('git', ['-C', repoDir, 'ls-files', '-m', '--', 'data/bin/'], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }).split('\n').filter(Boolean);
  } catch { return []; }
}
/** The tracked files still modified (`git status --porcelain`, untracked ignored). */
function modifiedTracked(repoDir, { exec }) {
  try {
    return exec('git', ['-C', repoDir, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] })
      .split('\n').filter(Boolean).map((l) => l.slice(3));
  } catch { return null; }
}

/** Pull + install + build when the pull brought something. Never throws.
 *  Returns `{pulled, reset: {before, after}, leftover, skipped}`. */
function autoUpdate({ repoDir, env = process.env, execPath = process.execPath, log = console, exec = childProcess.execFileSync } = {}) {
  const out = { pulled: false, reset: { before: [], after: [] }, leftover: [], skipped: null };
  try {
    // Ensure Homebrew/nvm paths are in PATH for child processes (macOS non-login shells)
    const envPath = [path.dirname(execPath), env.PATH].filter(Boolean).join(path.delimiter);
    const spawnEnv = { ...env, PATH: envPath };
    out.reset.before = resetRewritten(repoDir, { exec, files: [...BUILD_REWRITTEN_TRACKED, ...generatedModified(repoDir, { exec })], keep: true });
    if (out.reset.before.length) log.log(`[auto-update] reset ${out.reset.before.join(', ')} to the commit's so the pull can fast-forward — the last install / build's own rewrite, or a local edit: the replaced copy is at ${KEEP_DIR}/<name>.pre-reset`);
    const result = String(exec('git', ['-C', repoDir, 'pull', '--ff-only'], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }) || '').trim();
    if (result && !result.includes('Already up to date')) {
      out.pulled = true;
      log.log('[auto-update] git pull:', result);
      try {
        exec('npm', ['install', '--no-audit', '--no-fund'], { cwd: repoDir, encoding: 'utf-8', timeout: 60000, stdio: 'inherit', env: spawnEnv });
        exec('npm', ['run', 'build'], { cwd: repoDir, encoding: 'utf-8', timeout: 30000, stdio: 'inherit', env: spawnEnv });
        log.log('[auto-update] rebuilt successfully');
      } finally {
        // AFTER A PULL, WHATEVER HAPPENED: a failed / timed-out install or
        // build may have rewritten the files already — the next pull must
        // still find a clean checkout
        out.reset.after = resetRewritten(repoDir, { exec });
        const left = modifiedTracked(repoDir, { exec });
        out.leftover = left || [];
        if (left && left.length) log.log(`[auto-update] the checkout is still modified after the build: ${left.join(', ')} — a tracked file a build rewrites that src/server/auto-update.js BUILD_REWRITTEN_TRACKED does not name (the next bare pull will abort on it)`);
      }
    }
  } catch (e) { out.skipped = String((e && e.message) || e).split('\n')[0]; log.log('[auto-update] skipped:', out.skipped); }
  return out;
}

module.exports = { autoUpdate, resetRewritten, modifiedTracked, generatedModified, keptPath, BUILD_REWRITTEN_TRACKED, KEEP_DIR };

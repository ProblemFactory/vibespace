// scripts/tracked-files.mjs — THE ONE reader of "what source files exist" for a census (lane fence-hygiene, B-abd8).
// A census LISTS FILES VIA git, never a directory walk over data/bin: the product drops UNTRACKED runtime artifacts
// there (installRclone's ~64 MB rclone ELF, rclone-dl.zip, the generated vibespace-agentd bundle), and a readdir
// picks them up — test-sock-path once went RED on a push when boot-copied data/bin files were walked (.197), and
// the NUL-byte census read the 64 MB rclone in full before it moved to git ls-files (test-architecture §42 round 5).
// `git ls-files` answers "what is SOURCE" structurally, which puts every gitignored / generated artifact out of
// scope BY CONSTRUCTION — never by an extension blocklist the next big download would evade. The git env is
// sanitized through gitEnvFrom: this helper runs inside the pre-push hook, whose GIT_DIR / GIT_INDEX_FILE / … would
// otherwise re-point `git ls-files` at a different repository (test-architecture §42 round 6).
import { execFileSync } from 'node:child_process';
import { gitEnvFrom } from './git-env.mjs';

/**
 * The repo-relative paths git tracks under `pathspecs` (default: the whole index), NUL-split so a path with an odd
 * byte is never mis-cut. Throws if git cannot answer (a tarball / export) — a caller that must survive that wraps it.
 * @param {string} repo  absolute path to the checkout
 * @param {...string} pathspecs  git pathspecs (e.g. 'data/bin', 'src', 'server.js'); none = the whole index
 * @returns {string[]} repo-relative tracked paths
 */
export function trackedFiles(repo, ...pathspecs) {
  return execFileSync('git', ['-C', repo, 'ls-files', '-z', '--', ...pathspecs],
    { encoding: 'utf8', env: gitEnvFrom(process.env), maxBuffer: 1 << 28 })
    .split('\0').filter(Boolean);
}

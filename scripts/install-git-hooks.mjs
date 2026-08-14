#!/usr/bin/env node
// Installs the tracked release-gate hook into .git/hooks (npm postinstall).
// The global repo-guard core.hooksPath hook chains to .git/hooks/pre-push, so
// installing here composes with the secret scan instead of replacing it.
// MUST never fail an npm install: tarball installs have no .git, users who
// never push lose nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
try {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const gitDir = path.join(repo, '.git');
  if (!fs.statSync(gitDir).isDirectory()) process.exit(0); // worktrees: .git is a file — their pushes run from the main checkout anyway
  const src = path.join(repo, 'scripts', 'git-hooks', 'pre-push');
  const dst = path.join(gitDir, 'hooks', 'pre-push');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  fs.chmodSync(dst, 0o755);
} catch { /* no .git / read-only — fine */ }

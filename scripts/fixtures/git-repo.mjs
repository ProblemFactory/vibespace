// A LOCAL GIT REPOSITORY OF PLUGIN PACKAGES + A RECORDING git (lane engine-distribution) — the plugin installer's git source
// walked for real without a network: a bare repository whose commits hold the packages a suite names (tags / branches), and
// a `git` wrapper the installer is handed as `gitBin` that RECORDS each call (argv, every env value, what GIT_ASKPASS answers,
// the credential files' modes, a hard-link WITNESS of the value file — after a shred its inode holds other bytes) and runs
// the real git with the test host (`https://repo.test/…`, `git@repo.test:…`) mapped to the bare repository. `mode.json`
// beside it bends a network call: {fail: 'auth'} (git's own refusal words) · {fail: 'hang'} (no answer for 3 s).
// Used by test-plugin-trust ③b and test-plugin-loader ④.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const HOST = 'repo.test';
export const URL_HTTPS = `https://${HOST}/acme/private.git`;
export const URL_SSH = `git@${HOST}:acme/private.git`;

/** `commits` = [{files: {rel: text | {link: target}}, tag?, branch?: <a branch made from main for this commit>}] → the facts. */
export function gitRepoFixture(dir, commits) {
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const genv = { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const gitc = (args, cwd) => execFileSync(realGit, args, { cwd, env: genv, encoding: 'utf8' }).trim();
  const work = path.join(dir, 'work'), bin = path.join(dir, 'bin'), bare = path.join(bin, 'bare.git');
  fs.mkdirSync(bin, { recursive: true });
  gitc(['init', '-q', '-b', 'main', work]);
  const shas = [];
  for (const c of commits) {
    if (c.branch) gitc(['checkout', '-q', '-B', c.branch, 'main'], work);
    for (const [rel, v] of Object.entries(c.files || {})) {
      const f = path.join(work, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.rmSync(f, { force: true });
      if (v && typeof v === 'object' && v.link) fs.symlinkSync(v.link, f); else fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2));
    }
    gitc(['add', '-A'], work);
    gitc(['commit', '-qm', `commit ${shas.length + 1}`], work);
    if (c.tag) gitc(['tag', c.tag], work);
    shas.push(gitc(['rev-parse', 'HEAD'], work));
    if (c.branch) gitc(['checkout', '-q', 'main'], work);
  }
  gitc(['clone', '-q', '--bare', work, bare]);
  gitc(['config', 'uploadpack.allowAnySHA1InWant', 'true'], bare);
  const WRAP = path.join(bin, 'git');
  fs.writeFileSync(WRAP, `#!/usr/bin/env node
const fs = require('fs'), path = require('path'), { spawnSync, execFileSync } = require('child_process');
const D = ${JSON.stringify(bin)}, argv = process.argv.slice(2), env = process.env;
const rec = { argv, env: { ...env } };
const stat = (f) => { try { return (fs.statSync(f).mode & 0o777).toString(8); } catch { return null; } };
const witness = (f) => { const w = path.join(D, 'witness-' + process.pid + '-' + path.basename(f)); try { fs.linkSync(f, w); return w; } catch { return null; } };
if (env.GIT_ASKPASS) { const a = env.GIT_ASKPASS, d = path.dirname(a); rec.ask = { path: a, dir: d, dirMode: stat(d), mode: stat(a), script: fs.readFileSync(a, 'utf8'), user: execFileSync(a, ["Username for 'https://${HOST}': "], { encoding: 'utf8' }), pass: execFileSync(a, ["Password for 'https://x@${HOST}': "], { encoding: 'utf8' }), files: fs.readdirSync(d).map((n) => [n, stat(path.join(d, n))]), witness: witness(path.join(d, 'token')) }; }
const m = /-i '([^']+)'/.exec(env.GIT_SSH_COMMAND || '');
if (m) rec.key = { path: m[1], dir: path.dirname(m[1]), mode: stat(m[1]), dirMode: stat(path.dirname(m[1])), text: fs.readFileSync(m[1], 'utf8'), witness: witness(m[1]) };
fs.appendFileSync(path.join(D, 'calls.jsonl'), JSON.stringify(rec) + '\\n');
let mode = {}; try { mode = JSON.parse(fs.readFileSync(path.join(D, 'mode.json'), 'utf8')); } catch {}
const net = argv.includes('fetch') || argv.includes('ls-remote');
if (net && mode.fail === 'auth') { process.stderr.write("fatal: Authentication failed for '${URL_HTTPS}/'\\n"); process.exit(128); }
if (net && mode.fail === 'hang') { const t = Date.now(); while (Date.now() - t < 3000) {} process.exit(1); }
const mapped = argv.map((a) => (a.startsWith('https://${HOST}/') || a.startsWith('git@${HOST}:') ? 'file://' + path.join(D, 'bare.git') : a));
const r = spawnSync(${JSON.stringify(realGit)}, mapped, { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
`, { mode: 0o755 });
  const callsFile = path.join(bin, 'calls.jsonl');
  return {
    WRAP, bare, work, bin, shas, realGit,
    calls: () => { try { return fs.readFileSync(callsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } },
    resetCalls: () => fs.rmSync(callsFile, { force: true }),
    setMode: (m) => (m ? fs.writeFileSync(path.join(bin, 'mode.json'), JSON.stringify(m)) : fs.rmSync(path.join(bin, 'mode.json'), { force: true })),
    /** add a commit on main after the fact (the fleet moving its pin) → its sha */
    commit: (files, tag = null) => { for (const [rel, v] of Object.entries(files)) fs.writeFileSync(path.join(work, rel), typeof v === 'string' ? v : JSON.stringify(v, null, 2)); gitc(['add', '-A'], work); gitc(['commit', '-qm', 'more'], work); if (tag) gitc(['tag', tag], work); gitc(['push', '-q', bare, 'main', ...(tag ? [tag] : [])], work); const s = gitc(['rev-parse', 'HEAD'], work); shas.push(s); return s; },
  };
}

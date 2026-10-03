#!/usr/bin/env node
// Self-upgrade re-exec must PRESERVE the original argv (2.185.2, real
// owner↔Mac dial outage). The dial transport reads `--dial <url>
// --dial-token <t>` from process.argv; the upgrade re-exec used to spawn the
// new bundle with NO args → a DIAL device came back in default LISTEN mode: it
// stopped dialing the instance AND held the singleton so launchd couldn't
// relaunch the real --dial daemon (userW-class wedge, usually masked by the
// launchd relaunch winning the race — lost under rapid upgrade churn).
//
// A live /proc-cmdline check is unreliable here: the daemon sets
// process.title = 'vibespace-device', which clobbers argv memory on Linux. So
// this proves (a) the pure helper preserves every flag, and (b) beginUpgrade
// actually WIRES reExecArgv into the spawn (guards against reverting to the
// bare `[newPath]` array), verified in the ESBUILD BUNDLE too so a broken
// require can't slip through.
// Run: node scripts/test-agentd-reexec-argv.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };

// ── (a) the pure helper preserves flags ──
const { reExecArgv } = require('../src/agentd/reexec.js');
{
  const argv = ['/usr/bin/node', '/old/2.0.0/agentd.js', '--dial', 'wss://x/agentd-dial', '--dial-token', 'TK', '--host-token', 'HT'];
  const out = reExecArgv('/new/2.1.0/agentd.js', argv);
  check('NEW script path is first', out[0] === '/new/2.1.0/agentd.js');
  check('--dial + url preserved', out[1] === '--dial' && out[2] === 'wss://x/agentd-dial');
  check('--dial-token + value preserved', out.includes('--dial-token') && out.includes('TK'));
  check('--host-token preserved', out.includes('--host-token') && out.includes('HT'));
  check('OLD script path dropped', !out.includes('/old/2.0.0/agentd.js'));
  check('a no-flags daemon re-execs cleanly (listen mode unchanged)',
    JSON.stringify(reExecArgv('/new/a.js', ['/usr/bin/node', '/old/a.js'])) === JSON.stringify(['/new/a.js']));
}

// ── (b) beginUpgrade WIRES reExecArgv into the re-exec spawn ──
{
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf-8');
  // the spawn must go through reExecArgv, NOT a bare `[path.join(dir, ...)]`
  const reExecLine = src.split('\n').find((l) => l.includes('spawn(process.execPath') && l.includes('reExecArgv'));
  check('agentd.js re-exec spawns via reExecArgv', !!reExecLine, 'the upgrade spawn no longer preserves argv');
  check('agentd.js imports reExecArgv from the side-effect-free module', /require\(['"]\.\/reexec['"]\)/.test(src));
  // the old bare-array form must be GONE from the upgrade spawn
  check('no bare-array spawn in the upgrade path', !/spawn\(process\.execPath,\s*\[path\.join\(dir,/.test(src));
}

// ── (c) the ESBUILD bundle inlines reexec.js (a broken require would fail) ──
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-reexec-bundle-'));
  const out = path.join(tmp, 'agentd.js');
  const version = require('../package.json').version;
  fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
  execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${out}`], { cwd: repo });
  const bundle = fs.readFileSync(out, 'utf-8');
  check('bundle builds and contains the reExecArgv helper', bundle.includes('reExecArgv') && bundle.includes('argv.slice(2)'));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

// ── (d) lane device-upgrade-stuck: the `current` repoint on WINDOWS' rules. No Windows box ran this lane: the rules are
// MODELLED from the platform's documented behaviour (a directory symlink needs SeCreateSymbolicLinkPrivilege; a junction
// needs none — the installer's own "no admin needed, unlike symlinks"; MoveFileEx cannot replace a directory; unlink
// removes a junction or symlink, never its target) — stated here and in src/agentd/reexec.js ──
{
  const { repointCurrent } = require('../src/agentd/reexec.js');
  const winFs = ({ devMode = false } = {}) => {
    const ents = new Map(); // path → { kind: 'dir'|'junction'|'symlink'|'file', target }
    const err = (code, msg) => Object.assign(new Error(`${code}: ${msg}`), { code });
    return { ents,
      symlinkSync(target, p, type) { if (ents.has(p)) throw err('EEXIST', 'symlink'); if (type !== 'junction' && !devMode) throw err('EPERM', 'operation not permitted, symlink'); ents.set(p, { kind: type === 'junction' ? 'junction' : 'symlink', target }); },
      renameSync(a, b) { if (!ents.has(a)) throw err('ENOENT', 'rename'); const t = ents.get(b); if (t && t.kind !== 'file') throw err('EPERM', 'operation not permitted, rename'); ents.set(b, ents.get(a)); ents.delete(a); },
      unlinkSync(p) { const e = ents.get(p); if (!e) throw err('ENOENT', 'unlink'); if (e.kind === 'dir') throw err('EPERM', 'unlink'); ents.delete(p); },
      rmdirSync(p) { const e = ents.get(p); if (!e) throw err('ENOENT', 'rmdir'); ents.delete(p); },
    };
  };
  const pw = path.win32, root = 'C:\\Users\\o\\.vibespace\\device@h', dir = pw.join(root, '2.369.203');
  const installed = (o) => { const f = winFs(o); f.ents.set(pw.join(root, 'standalone'), { kind: 'dir' }); f.ents.set(pw.join(root, 'current'), { kind: 'junction', target: pw.join(root, 'standalone') }); f.ents.set(dir, { kind: 'dir' }); return f; };
  // the PRE-FIX repoint (the POSIX swap, run on Windows) — the cause, both ways
  const preFix = (f) => { const curTmp = pw.join(root, '.current.tmp'); try { f.unlinkSync(curTmp); } catch { } f.symlinkSync(dir, curTmp); f.renameSync(curTmp, pw.join(root, 'current')); };
  const codeOf = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
  check('CAUSE (modelled): the pre-fix repoint throws EPERM on Windows for a normal user (a directory symlink needs a privilege)', codeOf(() => preFix(installed())) === 'EPERM');
  check('CAUSE (modelled): …and with Developer Mode on — rename cannot replace the installer\'s `current` junction', codeOf(() => preFix(installed({ devMode: true }))) === 'EPERM');
  for (const devMode of [false, true]) {
    const f = installed({ devMode });
    const c = codeOf(() => repointCurrent(f, { root, dir, platform: 'win32' }, pw));
    const cur = f.ents.get(pw.join(root, 'current'));
    check(`FIX (devMode ${devMode}): current is a JUNCTION to the new version, no .current.tmp left, the old version dir untouched`, c === null && cur && cur.kind === 'junction' && cur.target === dir && !f.ents.has(pw.join(root, '.current.tmp')) && f.ents.get(pw.join(root, 'standalone')).kind === 'dir', c);
  }
  { const f = winFs(); f.ents.set(dir, { kind: 'dir' }); const c = codeOf(() => repointCurrent(f, { root, dir, platform: 'win32' }, pw)); check('FIX: no `current` at all ⇒ one is made', c === null && f.ents.get(pw.join(root, 'current')).target === dir, c); }
  { const f = installed(); f.ents.set(pw.join(root, '.current.tmp'), { kind: 'junction', target: 'x' }); const c = codeOf(() => repointCurrent(f, { root, dir, platform: 'win32' }, pw)); check('FIX: a .current.tmp left by an earlier failed attempt is cleared first', c === null && f.ents.get(pw.join(root, 'current')).target === dir, c); }
  // POSIX on the REAL fs: the atomic symlink swap, unchanged
  const tmpR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-repoint-'));
  try {
    fs.mkdirSync(path.join(tmpR, '1.0.0')); fs.mkdirSync(path.join(tmpR, '2.0.0')); fs.symlinkSync(path.join(tmpR, '1.0.0'), path.join(tmpR, 'current'));
    repointCurrent(fs, { root: tmpR, dir: path.join(tmpR, '2.0.0'), platform: 'linux' });
    check('POSIX (real fs): current → the new version by the symlink swap', fs.readlinkSync(path.join(tmpR, 'current')) === path.join(tmpR, '2.0.0') && !fs.existsSync(path.join(tmpR, '.current.tmp')));
  } finally { try { fs.rmSync(tmpR, { recursive: true, force: true }); } catch { } }
  // the daemon WIRES it and SAYS a failure; the re-exec's console is hidden
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf-8');
  check('agentd.js lands the repoint through repointCurrent (no inline symlink swap left)', src.includes('repointCurrent(fs, { root: ROOT, dir });') && !src.includes('fs.symlinkSync(dir, curTmp)'));
  check('agentd.js says a failed landing: its log + `upgrade-failed` to the hub', /log\(`upgrade to \$\{version\} FAILED/.test(src) && src.includes("mux.control({ op: 'upgrade-failed', version, error: why })"));
  check('the re-exec spawn hides its console on Windows (windowsHide)', src.includes("detached: true, stdio: 'ignore', windowsHide: true,"));
  // CONTROL (scripts/mutant-copy.mjs): the Windows branch removed (the pre-fix repoint everywhere) — the FIX legs go red
  const rsrc = fs.readFileSync(path.join(repo, 'src/agentd/reexec.js'), 'utf-8');
  const mut = rsrc.replace("if (platform === 'win32') {", 'if (false) {');
  check('(control) the patch applies', mut !== rsrc);
  const M = mutantCopies('reexec', repo).load('src/agentd/reexec.js', mut, 'nowin');
  check('CONTROL: without the Windows branch the repoint throws EPERM on Windows\' rules — the FIX legs go red', codeOf(() => M.repointCurrent(installed(), { root, dir, platform: 'win32' }, pw)) === 'EPERM');
}

console.log(failed ? `\n${failed} FAILED` : '\nre-exec argv test passed');
process.exit(failed ? 1 : 0);

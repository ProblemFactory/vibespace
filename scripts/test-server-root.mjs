#!/usr/bin/env node
// lane hook-root-guard (B-c77a) — THE ROOT VERDICT gate (fast, in-process).
// src/server-root.js decides whether this server is the owner's instance before
// any write into the owner's CLI config (~/.claude/settings.json,
// ~/.codex/hooks.json, ~/.codex/config.toml). Twice a lane WORKTREE server
// wrote them; the old guard knew only /tmp. This suite:
//   ① the verdict TABLE (every kind, the boundaries, the FORCE rule)
//   ② parseGitFile / refusalLine / purity
//   ③ three MUTANT-COPY controls — a weakened copy of the module must turn
//      named rows of the same table red (scripts/mutant-copy.mjs, out of tree)
//   ④ THE WRITER CENSUS — every line in server.js + src/ (not src/lib) that can
//      write the owner's CLI config is a named row and asks the verdict first
//   ⑤ the wiring and the words (the status surfaces say the refusal)
//   ⑥ verify r1: REAL filesystem shapes (git under scratch) through the SHIPPED reader — a dangling worktree is a
//      worktree, an unreadable .git fails CLOSED (`unknown`) and is read again; the facts equal git rev-parse
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SR = require(path.join(REPO, 'src/server-root.js'));

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); }
}

const TMP = ['/tmp', '/var/tmp'];
const CO = '/home/u/vibespace';
// [name, facts, expected kind, extra check?]
const ROWS = [
  ['the production checkout (.git is a directory)', { root: CO, gitDir: CO + '/.git', gitCommonDir: CO + '/.git', tmpRoots: TMP }, 'checkout'],
  ['a checkout with a trailing slash', { root: CO + '/', gitDir: CO + '/.git/', gitCommonDir: CO + '/.git', tmpRoots: TMP }, 'checkout'],
  ['a tree with no .git at all (the docker image, a tarball install)', { root: '/app', tmpRoots: TMP }, 'checkout'],
  ['a WORKTREE beside the checkout (not under any tmp root — the old guard passed it)', { root: '/home/u/wt-lane', gitDir: CO + '/.git/worktrees/wt-lane', gitCommonDir: CO + '/.git', tmpRoots: TMP }, 'worktree', (v) => v.checkout === CO],
  ['a WORKTREE under /var/tmp (the 2026-10-01 incident shape) — worktree outranks tmp', { root: '/var/tmp/vibespace-lanes/wt-notify-retry', gitDir: CO + '/.git/worktrees/wt-notify-retry', gitCommonDir: CO + '/.git', tmpRoots: TMP }, 'worktree', (v) => v.checkout === CO],
  ['a WORKTREE under /tmp/vs-* (every ci.mjs scratch server)', { root: `${TMP[0]}/vs-int-123`, gitDir: CO + '/.git/worktrees/vs-int-123', gitCommonDir: CO + '/.git', tmpRoots: TMP }, 'worktree'],
  ['a worktree of a BARE repo names the bare dir', { root: '/srv/main', gitDir: '/srv/vibespace.git/worktrees/main', gitCommonDir: '/srv/vibespace.git', tmpRoots: TMP }, 'worktree', (v) => v.checkout === '/srv/vibespace.git'],
  ['a SUBMODULE checkout (gitdir under .git/modules, no commondir) is a checkout', { root: '/home/u/super/vibespace', gitDir: '/home/u/super/.git/modules/vibespace', gitCommonDir: '/home/u/super/.git/modules/vibespace', tmpRoots: TMP }, 'checkout'],
  ['a --separate-git-dir clone is a checkout', { root: CO, gitDir: '/home/u/gits/vibespace.git', gitCommonDir: '/home/u/gits/vibespace.git', tmpRoots: TMP }, 'checkout'],
  ['a gitdir equal to <common>/worktrees itself is not a worktree', { root: CO, gitDir: CO + '/.git/worktrees', gitCommonDir: CO + '/.git', tmpRoots: TMP }, 'checkout'],
  ['a gitdir under ANOTHER repo\'s worktrees/ is not this common dir\'s worktree', { root: CO, gitDir: '/x/.git/worktrees/a', gitCommonDir: CO + '/.git', tmpRoots: TMP }, 'checkout'],
  ['a plain copy under /tmp/vs-* (no git)', { root: '/tmp/vs-rail-9', tmpRoots: TMP }, 'tmp', (v) => v.tmpRoot === '/tmp'],
  ['a plain dir under /var/tmp', { root: '/var/tmp/x/vibespace', tmpRoots: TMP }, 'tmp', (v) => v.tmpRoot === '/var/tmp'],
  ['the root IS a tmp root', { root: '/tmp', tmpRoots: TMP }, 'tmp'],
  ['a custom os.tmpdir() the caller passed (TMPDIR=/run/user/1000/tmp)', { root: '/run/user/1000/tmp/vs-y', tmpRoots: [...TMP, '/run/user/1000/tmp'] }, 'tmp'],
  ['a tmp root with a trailing slash still judges', { root: '/scratch/a', tmpRoots: ['/scratch/'] }, 'tmp'],
  ['SEGMENT BOUNDARY: /tmpx is not under /tmp', { root: '/tmpx/vibespace', tmpRoots: TMP }, 'checkout'],
  ['SEGMENT BOUNDARY: /var/tmpfoo is not under /var/tmp', { root: '/var/tmpfoo/vibespace', tmpRoots: TMP }, 'checkout'],
  ['a vs- name OUTSIDE the tmp roots is a user\'s folder, not judged', { root: '/home/u/vs-tools/vibespace', gitDir: '/home/u/vs-tools/vibespace/.git', gitCommonDir: '/home/u/vs-tools/vibespace/.git', tmpRoots: TMP }, 'checkout'],
  ['a relative tmp root is ignored (never a prefix match on a relative string)', { root: '/home/u/tmp/x', tmpRoots: ['tmp', 'home'] }, 'checkout'],
  ['VIBESPACE_SKIP_AGENT_HOOKS=1 on a checkout', { root: CO, gitDir: CO + '/.git', gitCommonDir: CO + '/.git', tmpRoots: TMP, envOverride: true }, 'override'],
  ['the override is ONE rule, never the only one: a worktree with it set still says worktree', { root: '/home/u/wt', gitDir: CO + '/.git/worktrees/wt', gitCommonDir: CO + '/.git', tmpRoots: TMP, envOverride: true }, 'worktree'],
  ['the override must be a boolean true (the caller compares the env to "1")', { root: CO, tmpRoots: TMP, envOverride: '1' }, 'checkout'],
  ['no root at all fails CLOSED', { tmpRoots: TMP }, 'unknown'],
  ['a relative root fails CLOSED', { root: 'vibespace', tmpRoots: TMP }, 'unknown'],
  ['FORCE under a scratch HOME lifts a worktree refusal (a suite registering into its own home)', { root: `${TMP[0]}/vs-it-1`, gitDir: CO + '/.git/worktrees/vs-it-1', gitCommonDir: CO + '/.git', tmpRoots: TMP, force: true, home: `${TMP[0]}/vs-it-1-home` }, 'forced'],
  ['FORCE under the lane\'s scratch HOME (/var/tmp/…/home) lifts a tmp refusal', { root: '/var/tmp/l/wt', tmpRoots: TMP, force: true, home: '/var/tmp/l/home' }, 'forced'],
  ['FORCE with the REAL HOME is ignored — a worktree still refused, and the why says so', { root: '/home/u/wt', gitDir: CO + '/.git/worktrees/wt', gitCommonDir: CO + '/.git', tmpRoots: TMP, force: true, home: '/home/u' }, 'worktree', (v) => /honoured only under a scratch HOME — \/home\/u is not one/.test(v.why)],
  ['FORCE with no HOME is ignored', { root: '/tmp/vs-a', tmpRoots: TMP, force: true }, 'tmp', (v) => /this HOME is not one/.test(v.why)],
  ['FORCE under a scratch HOME also lifts the override', { root: CO, tmpRoots: TMP, envOverride: true, force: true, home: '/tmp/vs-h' }, 'forced'],
  ['FORCE on a plain checkout changes nothing', { root: CO, tmpRoots: TMP, force: true, home: '/home/u' }, 'checkout'],
  ['FORCE must be a boolean true', { root: '/tmp/vs-a', tmpRoots: TMP, force: '1', home: '/tmp/h' }, 'tmp'],
  // verify r1 F1: the facts could not be read ⇒ fail CLOSED
  ['a read ERROR on the facts fails CLOSED: unknown, by name (the caller reads again)', { root: CO, tmpRoots: TMP, error: CO + '/.git cannot be read (EIO)' }, 'unknown', (v) => /could not be judged: .*EIO/.test(v.why)],
  ['an error outranks the tmp and override rules (nothing is known about the root)', { root: '/tmp/vs-x', tmpRoots: TMP, envOverride: true, error: 'boom' }, 'unknown'],
  ['an error with FORCE under a scratch HOME is lifted (a suite on a half-built scratch tree)', { root: '/tmp/vs-x', tmpRoots: TMP, error: 'boom', force: true, home: '/tmp/vs-h' }, 'forced'],
  ['an empty error string is no error', { root: CO, tmpRoots: TMP, error: '' }, 'checkout'],
  ['a DANGLING worktree (the reader inferred the common dir from git\'s layout) is a worktree', { root: '/home/u/wt-gone', gitDir: CO + '/.git/worktrees/wt-gone', gitCommonDir: CO + '/.git', dangling: true, tmpRoots: TMP }, 'worktree', (v) => v.checkout === CO],
];

function runTable(mod, rows = ROWS) {
  return rows.map(([name, facts, want, extra]) => {
    let v; try { v = mod.rootVerdict(facts); } catch (e) { v = { threw: e.message }; }
    const good = v && v.kind === want && v.ok === (want === 'checkout' || want === 'forced') && (!extra || extra(v)) && (v.ok || typeof v.why === 'string');
    return { name, want, got: v, good };
  });
}

console.log('— ① the verdict table');
const results = runTable(SR);
for (const r of results) ok(r.good, `${r.name} → ${r.want}`, r.got);
const kindsSeen = new Set(results.map((r) => r.want));
ok(SR.KINDS.every((k) => kindsSeen.has(k)) && SR.KINDS.length === 6, `the table covers every kind the module declares (${SR.KINDS.join(', ')}) — ${ROWS.length} rows`);
ok(ROWS.length >= 30, `the table is not vacuous (${ROWS.length} rows)`);

console.log('— ② gitdir parsing, the journal sentence, purity');
ok(SR.parseGitFile('gitdir: /h/v/.git/worktrees/a\n') === '/h/v/.git/worktrees/a', 'parseGitFile reads the gitdir line');
ok(SR.parseGitFile('gitdir: ../.git/worktrees/a\r\n') === '../.git/worktrees/a', '…keeps a relative gitdir verbatim (the caller resolves it against the root) and drops a CR');
ok(SR.parseGitFile('ref: refs/heads/x') === null && SR.parseGitFile('') === null && SR.parseGitFile(null) === null, '…and anything else is null (never a guess)');
ok(SR.checkoutOfCommonDir('/h/v/.git') === '/h/v' && SR.checkoutOfCommonDir('/srv/v.git/') === '/srv/v.git', 'checkoutOfCommonDir: <repo>/.git names the repo, a bare dir names itself');
const wtLine = SR.refusalLine(SR.rootVerdict(ROWS[4][1]));
ok(wtLine === "hooks not registered: this server runs from a git worktree of /home/u/vibespace — the owner's CLI config belongs to that checkout's instance", 'refusalLine: THE worktree journal sentence, word for word', wtLine);
ok(/^hooks not registered: this server runs from a temporary folder \(\/tmp\/vs-rail-9 is under \/tmp\) — a throwaway server never writes the owner's CLI config$/.test(SR.refusalLine(SR.rootVerdict(ROWS[11][1]))), 'refusalLine: the tmp sentence names the root and its tmp root');
ok(/^hooks not registered: VIBESPACE_SKIP_AGENT_HOOKS=1 is set for this server$/.test(SR.refusalLine(SR.rootVerdict(ROWS[20][1]))), 'refusalLine: the override sentence names the env var');
ok(SR.refusalLine(SR.rootVerdict(ROWS[0][1])) === null && SR.refusalLine(null) === null, 'refusalLine: an ok verdict has no sentence');
const src = fs.readFileSync(path.join(REPO, 'src/server-root.js'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
ok(!/\brequire\s*\(|^\s*import\b|\bprocess\.|\bfs\./m.test(code), 'src/server-root.js imports nothing and reads no env / fs (PURE — the ORCH half reads the facts)');

console.log('— ③ mutant-copy controls (a weakened rule must turn named rows red)');
const M = mutantCopies('server-root', REPO);
const CONTROLS = [
  { what: 'tmp prefix WITHOUT the segment boundary', needle: "return a === d || a.startsWith(d + '/');", repl: 'return a === d || a.startsWith(d);', reds: ['SEGMENT BOUNDARY: /tmpx is not under /tmp', 'SEGMENT BOUNDARY: /var/tmpfoo is not under /var/tmp'] },
  { what: 'the worktree rule dropped (the old /tmp-only guard)', needle: "  } else if (isLinkedWorktree(gitDir, gitCommonDir)) {", repl: '  } else if (false) {', reds: ['a WORKTREE beside the checkout (not under any tmp root — the old guard passed it)', 'a WORKTREE under /var/tmp (the 2026-10-01 incident shape) — worktree outranks tmp'] },
  { what: 'FORCE honoured whatever the HOME', needle: 'if (isAbs(h) && roots.some((t) => isUnder(h, t))) return', repl: 'if (true) return', reds: ['FORCE with the REAL HOME is ignored — a worktree still refused, and the why says so', 'FORCE with no HOME is ignored'] },
];
for (const c of CONTROLS) {
  ok(src.includes(c.needle), `control "${c.what}": the needle is in the shipped source (a stale control would prove nothing)`);
  const mod = M.load('src/server-root.js', src.replace(c.needle, c.repl), c.what.replace(/\W+/g, '-').slice(0, 24));
  const red = runTable(mod).filter((r) => !r.good).map((r) => r.name);
  ok(c.reds.every((n) => red.includes(n)), `control "${c.what}": the named rows go RED on the weakened copy (${red.length} red)`, red);
}
for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 3 })) ok(row.pass, row.name, row.detail);

console.log('— ④ THE WRITER CENSUS: every site that can write the owner\'s CLI config asks the root verdict first');
// DERIVED from the source: a line that calls a CLI-config writer (the CAS
// writers, the plan applier, the hook-file patch) or RUNS the register helper
// is a WRITER; each must carry a guard on its line or in the 12 lines before
// it, and each must be a named row below — a new writer without a row is red.
// verify r1 ②: + any raw writeFileSync whose target is a CLI config file NAME — each such line is a NOT_A_WRITE row with its reason, or a writer
const WRITER = /writeJsonManaged\(|writeTomlManaged\(|applyConfigPlan\(|ensureCliConfig\(|_patchHookFile\(|vibespace-hook-register\.mjs"|writeFileSync\(.*?'(?:config\.toml|settings\.json|hooks\.json|\.claude\.json)'/;
const NOT_A_WRITE = [
  [/--status/, 'the READ-ONLY receipts probe'],
  [/grep -q VIBESPACE_CLI_CONFIG/, 'a grep of the shipped helper (read-only)'],
  [/^const _patchHookFile = /, 'the alias definition (its two calls are rows)'],
  [/__applier\./, "the generated helper's own text (runs only where a gated site runs it)"],
  [/writeFileSync\(path\.join\(shared, 'config\.toml'\), ''\)/, 'codex seedDir: an EMPTY symlink target created only when absent (a harness prerequisite, never content — verify r1 ②)'],
  [/writeFileSync\(path\.join\(dir, '\.claude\.json'\)/, "claude seedDir: an ISOLATED login dir's .claude.json (never ~/.claude.json)"],
  [/writeFileSync\(path\.join\(probeConfigDir, '\.claude\.json'\)/, "the /usage probe's ISOLATED config dir (B-855a c1)"],
];
const GUARD = /ownerWriteRefusal\(\)|refuseOwnerWrite\(\)|refusalNow\(\)|\(refused \? /;
const SITES = [
  { file: 'src/server/agent-tool-generators.js', re: /_patchHookFile\(def\.file\(\), def\.createIfMissing/, what: 'ensureAgentHooks — register our hook entries in ~/.claude/settings.json + ~/.codex/hooks.json' },
  { file: 'src/server/agent-tool-generators.js', re: /_patchHookFile\(def\.file\(\), false/, what: 'stripAgentHookEntries — strip them (Integration OFF / Remove)' },
  { file: 'src/server/harness-config-sync.js', re: /applyConfigPlan\(plan, \{ home \}\)/, what: 'syncCliConfig — the managed keys at boot and on every settings write (onSettingsWrite)' },
  { file: 'src/hosts.js', re: /VIBESPACE_CLI_CONFIG=\$\{this\._cliConfigPlanB64\(\)\} "\$VS_NODE" "\$HOME\/\.vibespace\/bin\/vibespace-hook-register\.mjs" 2>/, what: 'hosts.installAgentTools — the remote register' },
  { file: 'src/hosts.js', re: /vibespace-hook-register\.mjs" --uninstall/, what: 'hosts.uninstallAgentTools — the remote strip' },
  { file: 'src/spawn/ssh.js', re: /VIBESPACE_CLI_CONFIG=\$\{cliConfigPlanB64\(\)\} "\$VS_NODE" "\$HOME\/\.vibespace\/bin\/vibespace-hook-register\.mjs"/, what: 'the ssh per-spawn prelude' },
  { file: 'src/spawn/dial.js', re: /"\$\{bin\}\/vibespace-hook-register\.mjs" 2>\/dev\/null \|\| true/, what: 'the dial device setup (the device-side register)' },
];
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) out.push(...walk(rel));
    else if (/\.(c|m)?js$/.test(e.name)) out.push(rel);
  }
  return out;
}
function writersIn(rel, text) {
  const lines = text.split('\n'), found = [];
  lines.forEach((l, i) => {
    if (!WRITER.test(l) || NOT_A_WRITE.some(([re]) => re.test(l.trim()))) return;
    const ctx = lines.slice(Math.max(0, i - 12), i + 1).join('\n');
    found.push({ file: rel, line: i + 1, text: l.trim(), guarded: GUARD.test(ctx) });
  });
  return found;
}
// src/harness-config.js IS the applier (its definitions call each other); lib/ is the browser
const SCOPE = ['server.js', ...walk('src').filter((f) => f !== 'src/harness-config.js' && !f.startsWith('src/lib/'))];
const writers = SCOPE.flatMap((f) => writersIn(f, fs.readFileSync(path.join(REPO, f), 'utf8')));
ok(writers.length === SITES.length, `the census finds exactly the ${SITES.length} named writers (${writers.length} found over ${SCOPE.length} files)`, writers.map((w) => `${w.file}:${w.line}`));
for (const site of SITES) {
  const hit = writers.filter((w) => w.file === site.file && site.re.test(w.text));
  ok(hit.length === 1 && hit[0].guarded, `${site.what} asks the root verdict first (${site.file}${hit[0] ? ':' + hit[0].line : ' — NOT FOUND'})`, hit);
}
const unlisted = writers.filter((w) => !SITES.some((x) => x.file === w.file && x.re.test(w.text)));
ok(unlisted.length === 0, 'no writer outside the table', unlisted);
{ // NEGATIVE CONTROL: the census can go red
  const planted = writersIn('src/x.js', "function f() {\n  writeJsonManaged(file, {}, m);\n}\n");
  const guarded = writersIn('src/x.js', "function f() {\n  if (refuseOwnerWrite()) return;\n  writeJsonManaged(file, {}, m);\n}\n");
  const probe = writersIn('src/x.js', 'x + `"$VS_NODE" "$HOME/.vibespace/bin/vibespace-hook-register.mjs" --status`;\n');
  ok(planted.length === 1 && !planted[0].guarded && guarded.length === 1 && guarded[0].guarded && probe.length === 0,
    'NEGATIVE CONTROL: an unguarded writer is found and unguarded, a guarded one passes, the --status probe is not a writer');
}
{ // CONTROL (verify r1 ②): a mutant COPY of the REAL cli-config sync with every guard spelling removed is found UNGUARDED by the census
  const syncSrc = fs.readFileSync(path.join(REPO, 'src/server/harness-config-sync.js'), 'utf8');
  const lost = syncSrc.replace(/refusalNow\(\)|ownerWriteRefusal\(\)|refuseOwnerWrite\(\)|\(refused \? /g, (m) => (m === '(refused ? ' ? '(false ? ' : 'null'));
  const f = M.write('src/server/harness-config-sync.js', lost, 'no-guard');
  const w = writersIn('src/server/harness-config-sync.js', fs.readFileSync(f, 'utf8'));
  ok(lost !== syncSrc && w.length === 1 && !w[0].guarded && /applyConfigPlan\(plan, \{ home \}\)/.test(w[0].text), 'CONTROL: a copy of harness-config-sync.js without its guard is found UNGUARDED (the census goes red on a real file)', w);
  const nameHit = writersIn('src/x.js', "  fs.writeFileSync(path.join(os.homedir(), '.codex', 'config.toml'), toml);\n");
  ok(nameHit.length === 1 && !nameHit[0].guarded, 'CONTROL: a raw writeFileSync toward a CLI config file NAME is a writer (unguarded, no row)');
}

console.log('— ⑤ wiring + the words: the status surfaces say the refusal, never "registered"');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const srv = read('server.js'), gen = read('src/server/agent-tool-generators.js'), sync = read('src/server/harness-config-sync.js');
ok(/rootVerdict\(\{\s*\.\.\._rootFacts,\s*tmpRoots: \[realOr\(os\.tmpdir\(\)\), \.\.\.TMP_ROOTS\.map\(realOr\)\],\s*envOverride: process\.env\[serverRoot\.OVERRIDE_ENV\] === '1',\s*force: process\.env\[serverRoot\.FORCE_ENV\] === '1',\s*home: realOr\(os\.homedir\(\)\),/.test(gen),
  "the ORCH reads os.tmpdir() + fixture-guard's TMP_ROOTS, both env flags as booleans, and the real HOME — all realpath'd");
ok(/if \(st\.isDirectory\(\)\) \{ facts\.gitDir = facts\.gitCommonDir = realOr\(dotGit\); return facts; \}/.test(gen) && /path\.join\(facts\.gitDir, 'commondir'\)/.test(gen) && !/execFileSync\('git'/.test(gen.slice(gen.indexOf('function readRootFacts'), gen.indexOf('function rootVerdict'))),
  'the facts come from fs: .git dir → checkout, .git file → gitdir + commondir (never a git child at boot)');
ok(/if \(r && !_refusalSaid\) \{ _refusalSaid = true; console\.log\(r\.line\); \}/.test(gen), 'ONE journal line per boot: the first refused writer says it, the latch keeps the rest quiet');
ok(/function hookRegistrationSafe\(\) \{ return rootVerdict\(\)\.ok; \}/.test(gen) && !/here\.startsWith\(tmp\)/.test(gen), 'hookRegistrationSafe() IS the verdict now (the old /tmp-only prefix test is gone)');
ok(/refused: ownerWriteRefusal\(\), registeredAfterError: _registeredAfterError \};/.test(gen) && /const refused = refusalNow\(\);\n\s*return \{ safe: !refused, refused, registeredAfterError: recoveryNow\(\), files:/.test(sync), 'agentHooksStatus and cliConfigStatus carry the refusal (verify r2: and the recovery fact)');
ok(/hookRegistrationSafe, ownerWriteRefusal, refuseOwnerWrite, rootRecovery,\n\s*log:/.test(srv) && /hosts\.ownerWriteRefusal = refuseOwnerWrite;/.test(srv) && /cliConfigPlanB64, ownerWriteRefusal: refuseOwnerWrite,/.test(srv),
  'server.js hands the verdict to the cli-config sync, to hosts and to the ws ctx');
ok(/'cliConfigPlanB64', 'ownerWriteRefusal',/.test(read('src/ws-handler.js')) && /cliConfigPlanB64, ownerWriteRefusal,\n/.test(read('src/ws-create.js')), 'ownerWriteRefusal is in WS_CTX_CONTRACT and ws-create destructures it');
ok(/if \(results\.refused\) return res\.status\(409\)\.json\(\{ error: results\.refused\.line, refused: results\.refused/.test(srv), 'the explicit Install route refuses by name (409 + the sentence), never "installed"');
ok(/refused: this\._ownerWriteRefusal\(\) \};/.test(read('src/hosts.js')), "a host's agent-tools status carries the refusal too");
const ma = read('src/lib/manage-agents.js'), su = read('src/lib/settings-ui.js');
ok(/\} else if \(hs\.refused\) \{[\s\S]{0,600}refusalLine\(hs\.refused, \{ t \}\)\.text[\s\S]{0,300}row\.append\(left\);/.test(ma) && !/\} else if \(hs\.refused\) \{[\s\S]{0,700}installBtn/.test(ma),
  'Manage Agents: a refused root shows the refusal and NO Install / Remove (no ✓ read off the owner\'s file)');
ok(/if \(cc\.refused\) lines\.push\(refusalLine\(cc\.refused, \{ t, remote \}\)\)/.test(ma) && /refused: rs\.refused \|\| null/.test(ma), 'the chips lead with the refusal, on this machine and on a host row');
ok(/if \(cc\.refused\) addLine\(refusalLine\(cc\.refused, \{ t \}\)\)/.test(su) && /if \(own && own\.cliConfig && own\.cliConfig\.refused\) addLine\(refusalLine\(own\.cliConfig\.refused, \{ t, remote: true \}\)\)/.test(su),
  'Settings: the cli-config chip and "Check machines…" say the refusal');
const chips = await import(path.join(REPO, 'src/lib/cli-config-chips.js'));
const tt = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] != null ? p[k] : `{${k}}`));
const words = Object.fromEntries(['worktree', 'tmp', 'override', 'unknown'].map((k) => [k, chips.refusalLine({ kind: k, checkout: '/home/u/vibespace' }, { t: tt })]));
ok(Object.values(words).every((w) => w.tone === 'warn' && /^Not registered — /.test(w.text) && !/\bregistered\b(?<!Not registered)/.test(w.text.slice(15))), 'every refusal kind has its line, each starts "Not registered —" and none says registered', words);
ok(words.worktree.text.includes('/home/u/vibespace') && /git worktree/.test(words.worktree.text) && /temporary folder/.test(words.tmp.text) && /VIBESPACE_SKIP_AGENT_HOOKS=1/.test(words.override.text), '…naming the checkout, the temporary folder, the env var', words);
ok(/other machines either/.test(chips.refusalLine({ kind: 'tmp' }, { t: tt, remote: true }).text) && chips.refusalLine(null, { t: tt }) === null, '…a remote surface adds "no CLI config on other machines either"; no refusal → no line');
const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
const keysUsed = [...read('src/lib/cli-config-chips.js').matchAll(/t\('((?:Not registered|It writes no CLI config)[^']*)'/g)].map((m) => m[1]);
ok(keysUsed.length === 5 && keysUsed.every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')), `the ${keysUsed.length} new words have zh + ja entries`, keysUsed);

console.log('— ⑦ verify r2: the unknown verdict is RE-JUDGED with backoff, said ONCE PER CAUSE, the recovery said once and shown on the chip; the facts age out; FORCE and the device daemon censused');
{
  const watchSrc = read('src/server/hook-root-watch.js');
  ok(JSON.stringify(SR.REJUDGE_BACKOFF_MS) === JSON.stringify([30000, 60000, 120000, 300000, 600000, 1800000]) && [0, 1, 2, 3, 4, 5, 6, 40].map(SR.nextRejudgeDelay).join() === '30000,60000,120000,300000,600000,1800000,1800000,1800000' && SR.nextRejudgeDelay(-3) === 30000 && SR.nextRejudgeDelay('x') === 30000, 'PURE: the re-judge ladder 30 s → 60 s → 2 → 5 → 10 → 30 min, then the cap for ever; a bad attempt reads as the first');
  ok(SR.ROOT_FACTS_TTL_MS === 60000, 'PURE: facts read without error are kept 60 s at most');
  const d1 = SR.unknownNoticeDue(null, 'the server root could not be judged: /x/.git cannot be read (EIO)');
  ok(d1.post === true && d1.memo.cause.startsWith('the server root') && SR.unknownNoticeDue(d1.memo, d1.memo.cause).post === false && SR.unknownNoticeDue(d1.memo, 'another cause').post === true && SR.unknownNoticeDue({ cause: 'x' }, '').post === false && SR.unknownNoticeDue('garbage', 'c').post === true, 'PURE: the unknown notice is due once per CAUSE — the same cause again (the next boot) posts nothing, a new cause posts, no cause posts nothing, a garbage memo is no memo');
  ok(/^VibeSpace registered the agent hooks at 09:41 after an earlier read error \(EIO on \.git\) — sessions started since then have the tools; sessions started during the error pick them up after a restart or compaction\.$/.test(SR.registeredAfterErrorLine({ time: '09:41', error: 'EIO on .git' })), 'PURE: the recovery sentence names the time and the earlier error');
  ok(/if \(!v\.ok && v\.kind === 'unknown'\) _lastRootError = \{ at: t, error: _rootFacts\.error \|\| v\.why \};/.test(gen) && /if \(_lastRootError && !_registeredAfterError && Object\.values\(results\)\.some\(\(x\) => x && x\.ok\)\) _registeredAfterError = \{ at: Date\.now\(\), error: _lastRootError\.error, since: _lastRootError\.at \};/.test(gen) && /function rootRecovery\(\) \{ return \{ lastError: _lastRootError, registeredAfterError: _registeredAfterError \}; \}/.test(gen) && /readRootFacts, rootRecovery,/.test(gen), 'ORCH: the last unknown is remembered, a registration after it is the recovery fact (set once), rootRecovery() exports both');
  ok(/const due = serverRoot\.unknownNoticeDue\(memo, refused\.why \|\| refused\.line\);/.test(watchSrc) && /posted = Number\(seen\) > 0;\n\s*if \(posted\) \{ try \{ writeJsonAtomic\(memoFile, due\.memo\); \}/.test(watchSrc) && /const \{ writeJsonAtomic \} = require\('\.\.\/channel-store\.js'\);/.test(watchSrc), 'the watch: the unknown notice is posted once per cause — the memo persisted through THE atomic writer, written only when a client saw the toast');
  // THE REAL LEG: the watch over fake timers + a scripted ensureAgentHooks + a recording serverNotice + a scratch data dir
  const HW = require(path.join(REPO, 'src/server/hook-root-watch.js'));
  const wdir = fs.mkdtempSync(path.join('/tmp', 'vs-srvroot-watch-')); process.on('exit', () => { try { fs.rmSync(wdir, { recursive: true, force: true }); } catch { } });
  const timers = []; const notices = []; let verdict = { refused: { kind: 'unknown', why: 'the server root could not be judged: /x/.git cannot be read (EIO)', line: 'hooks not registered: the server root could not be judged: /x/.git cannot be read (EIO)' } };
  let registered = null; let clients = 1;
  const w = HW.create({ dataDir: wdir, ensureAgentHooks: () => (verdict.refused ? { skipped: true, refused: verdict.refused } : { claude: { ok: true } }), rootRecovery: () => ({ lastError: null, registeredAfterError: registered }), ownerWriteRefusal: () => verdict.refused || null, integrationEnabled: () => true, serverNotice: (key, text, o) => { notices.push({ key, text, i18n: o && o.i18n }); return clients; }, setTimer: (fn, ms) => { const h = { fn, ms, unref() { } }; timers.push(h); return h; }, now: () => 0 });
  const fire = () => { const h = timers.shift(); if (h) h.fn(); };
  w.sync();
  ok(notices.length === 1 && notices[0].key === 'hook-root-unknown' && notices[0].i18n && notices[0].i18n.key === HW.UNKNOWN_KEY && /EIO/.test(notices[0].i18n.params.error) && fs.existsSync(w.memoFile) && JSON.parse(fs.readFileSync(w.memoFile, 'utf8')).cause === verdict.refused.why && timers.length === 1 && timers[0].ms === 30000, 'REAL: a boot unknown posts ONE notice (i18n, the error named), writes the memo (a client saw it) and arms the first re-judge at 30 s', { notices, timers: timers.map((t) => t.ms), memo: fs.existsSync(w.memoFile) });
  fire(); fire(); fire(); fire();
  ok(notices.length === 1 && w._state.delays.join() === '30000,60000,120000,300000,600000', 'REAL: four re-judges later the SAME cause posted nothing more and the ladder climbed 30 s → 60 s → 2 → 5 → 10 min', { notices: notices.length, delays: w._state.delays });
  const w2 = HW.create({ dataDir: wdir, ensureAgentHooks: () => ({ skipped: true, refused: verdict.refused }), rootRecovery: () => ({}), ownerWriteRefusal: () => verdict.refused, serverNotice: (key) => { notices.push({ key, boot: 2 }); return 1; }, setTimer: (fn, ms) => ({ fn, ms, unref() { } }) });
  w2.sync();
  ok(notices.length === 1, 'REAL: the NEXT BOOT under the same cause (a fresh watch, the memo on disk) posts NOTHING — never one per boot', notices);
  verdict = { refused: { kind: 'unknown', why: 'the server root could not be judged: /x/.git/commondir cannot be read (EACCES)', line: 'hooks not registered: …' } };
  fire();
  ok(notices.length === 2 && notices[1].key === 'hook-root-unknown' && JSON.parse(fs.readFileSync(w.memoFile, 'utf8')).cause === verdict.refused.why, 'REAL: a NEW cause posts again and replaces the memo', notices.length);
  clients = 0; fs.rmSync(w.memoFile, { force: true }); verdict = { refused: { kind: 'unknown', why: 'the server root could not be judged: nobody watching', line: 'x' } };
  fire();
  ok(notices.length === 3 && !fs.existsSync(w.memoFile), 'REAL: a notice nobody saw (no client) does not burn the memo — the next judge may say it to someone', { memo: fs.existsSync(w.memoFile) });
  clients = 1; verdict = {}; registered = { at: new Date(2026, 9, 2, 9, 41).getTime(), error: '/x/.git cannot be read (EIO)', since: 0 };
  fire();
  ok(notices.length === 4 && notices[3].key === 'hook-root-registered' && notices[3].i18n.key === HW.REGISTERED_KEY && notices[3].i18n.params.time === '09:41' && /09:41 after an earlier read error \(\/x\/\.git cannot be read \(EIO\)\)/.test(notices[3].text) && !fs.existsSync(w.memoFile) && w._state.attempt === 0 && timers.length === 0, 'REAL: the recovery — the registration after the error said ONCE (i18n, HH:MM + the error), the memo gone, the ladder reset, no timer left', { notices: notices.slice(3), attempt: w._state.attempt, timers: timers.length });
  w.sync(); w.recovered();
  ok(notices.length === 4 && w.probeMayRun() === true && w.saidRecoveryInstead({ stale: false }, false) === true && w.saidRecoveryInstead({ stale: true }, false) === false && notices.length === 4, 'REAL: said once only; the probe may run on a judged root; after a self-heal the recovery is "said instead" of repaired (unless the file was stale) — without a second toast');
  verdict = { refused: { kind: 'unknown', why: 'again', line: 'x' } };
  ok(w.probeMayRun() === false && timers.length === 1 && timers[0].ms === 30000 && w.probeMayRun() === false && timers.length === 1, 'REAL: the probe on an unjudgeable root arms the loop (from the reset ladder: 30 s) and never a second timer');
  verdict = { refused: { kind: 'tmp', why: 'tmp', line: 'x' } };
  ok(w.probeMayRun() === false && timers.length === 1, 'REAL: a refusal that is not unknown stops the probe and arms nothing');
  const rl = chips.recoveredLine({ at: new Date(2026, 9, 2, 9, 41).getTime(), error: 'EIO on .git' }, { t: tt });
  ok(rl && rl.tone === 'ok' && rl.text === 'Registered at 09:41 after an earlier read error (EIO on .git) — sessions started since then have the tools.' && chips.recoveredLine(null, { t: tt }) === null, "the chip's recovery line names the time and the error; no fact → no line", rl);
  ok(/else if \(cc\.registeredAfterError\) addLine\(recoveredLine\(cc\.registeredAfterError, \{ t \}\)\);/.test(su) && /else if \(own && own\.cliConfig && own\.cliConfig\.registeredAfterError\) addLine\(recoveredLine\(own\.cliConfig\.registeredAfterError, \{ t \}\)\);/.test(su) && /else if \(cc\.registeredAfterError\) lines\.push\(recoveredLine\(cc\.registeredAfterError, \{ t \}\)\);/.test(ma), 'Settings (the chip + "Check machines…") and Manage Agents show the recovery line when there is no refusal');
  const K2 = ['Registered at {time} after an earlier read error ({error}) — sessions started since then have the tools.', 'VibeSpace could not tell which folder it runs from ({error}) — the agent hooks are not registered; it reads again with backoff (30 s to 30 min) and registers them as soon as it can.', 'VibeSpace registered the agent hooks at {time} after an earlier read error ({error}) — sessions started since then have the tools; sessions started during the error pick them up after a restart or compaction.'];
  ok(K2.every((k) => zh.includes(JSON.stringify(k) + ':')) && K2.every((k) => ja.includes(JSON.stringify(k) + ':')) && /i18nKey\('VibeSpace could not tell which folder it runs from \(\{error\}\)/.test(watchSrc) && /i18nKey\('VibeSpace registered the agent hooks at \{time\}/.test(watchSrc), 'the two server notices and the chip line have zh + ja entries (the watch declares the server keys through the i18nKey marker)');
  const forceSites = execFileSync('git', ['grep', '-n', '-e', 'FORCE_AGENT_HOOKS', '-e', 'FORCE_ENV', '--', 'src', 'server.js', 'data/bin'], { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter((l) => !l.startsWith('src/server-root.js:'));
  ok(forceSites.length === 2 && forceSites.every((l) => l.startsWith('src/server/agent-tool-generators.js:')) && forceSites.some((l) => /force: process\.env\[serverRoot\.FORCE_ENV\] === '1',/.test(l)), 'FORCE census (④): outside src/server-root.js the knob is spelled only in agent-tool-generators (the one env read + its comment) — no production path forces', forceSites);
  const agentd = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  const cliFile = /(\.claude\b|\.codex\b|hooks\.json|settings\.json|config\.toml|\.claude\.json)/;
  const isWrite = (l) => /\b(writeFileSync|appendFileSync|writeFile)\s*\(/.test(l) && cliFile.test(l);
  const writes = agentd.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => isWrite(l));
  ok(writes.length === 0 && (agentd.match(/\bwriteFileSync\s*\(/g) || []).length > 5, "the device daemon (⑤, src/agentd/agentd.js) has no write toward a CLI config file — the hub's verdict is the only gate a host needs", writes);
  ok(isWrite("fs.writeFileSync(path.join(home, '.claude', 'settings.json'), x)") && !isWrite("fs.writeFileSync(path.join(dir, 'pid.json'), x)"), 'CONTROL: a planted settings.json write is caught by the census pattern, a pid file is not');
  const Gm = require(path.join(REPO, 'src/server/agent-tool-generators.js'));
  const R7 = fs.mkdtempSync(path.join('/tmp', 'vs-srvroot7-')); process.on('exit', () => { try { fs.rmSync(R7, { recursive: true, force: true }); } catch { } });
  const ttlRoot = path.join(R7, 'ttl'); fs.mkdirSync(path.join(ttlRoot, '.git', 'refs'), { recursive: true }); fs.mkdirSync(path.join(ttlRoot, 'data'), { recursive: true }); fs.writeFileSync(path.join(ttlRoot, '.git', 'HEAD'), 'ref: refs/heads/master\n');
  const common = path.join(R7, 'ttl-main', '.git'); fs.mkdirSync(path.join(common, 'worktrees', 'ttl'), { recursive: true }); fs.writeFileSync(path.join(common, 'worktrees', 'ttl', 'commondir'), '../..\n');
  const convert = () => { fs.rmSync(path.join(ttlRoot, '.git'), { recursive: true, force: true }); fs.writeFileSync(path.join(ttlRoot, '.git'), `gitdir: ${path.join(common, 'worktrees', 'ttl')}\n`); };
  const restore = () => { fs.rmSync(path.join(ttlRoot, '.git'), { force: true }); fs.mkdirSync(path.join(ttlRoot, '.git', 'refs'), { recursive: true }); fs.writeFileSync(path.join(ttlRoot, '.git', 'HEAD'), 'ref: refs/heads/master\n'); };
  const origTtl = SR.ROOT_FACTS_TTL_MS; const quiet = console.warn; console.warn = () => {};
  try {
    SR.ROOT_FACTS_TTL_MS = -1; const g = Gm.create({ rootDir: ttlRoot, port: 0 }); const k1 = g.rootVerdict().kind; convert(); const k2 = g.rootVerdict().kind;
    ok(k1 === 'tmp' && k2 === 'worktree', `③ the shipped ORCH re-reads aged facts: a .git converted in place moves the verdict (${k1} → ${k2}; under a tmp root the worktree rule outranks tmp)`, { k1, k2 });
    restore(); SR.ROOT_FACTS_TTL_MS = Infinity; const g2 = Gm.create({ rootDir: ttlRoot, port: 0 }); const c1 = g2.rootVerdict().kind; convert(); const c2 = g2.rootVerdict().kind;
    ok(c1 === 'tmp' && c2 === 'tmp', 'CONTROL: facts that never age keep the pre-conversion verdict (the r1 shape — stale until a restart)', { c1, c2 });
  } finally { SR.ROOT_FACTS_TTL_MS = origTtl; console.warn = quiet; }
}
console.log('— ⑥ REAL filesystem shapes through the SHIPPED reader (verify r1 F1): a dangling worktree is a worktree, an unreadable .git fails CLOSED');
{
  let gitOk = true; try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitOk = false; }
  if (!gitOk) console.log('  SKIP (LOUD): git is not on PATH — the real-filesystem leg did not run');
  else {
    const S = scratch('server-root-fs'); fs.rmSync(S, { recursive: true, force: true }); fs.mkdirSync(S, { recursive: true });
    const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=v', '-c', 'user.email=v@v', '-c', 'protocol.file.allow=always', '-c', 'init.defaultBranch=main', ...a], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    const mkclone = (name) => { const d = path.join(S, name); fs.mkdirSync(d); git(d, 'init', '-q'); fs.writeFileSync(path.join(d, 'f'), 'x'); git(d, 'add', '.'); git(d, 'commit', '-qm', 'c'); return d; };
    // linked worktrees are built BY HAND in git's own layout (<common>/worktrees/<name>/{HEAD,commondir,gitdir} + the root's
    // .git file) — a fast suite never runs the worktree verb (THE TIER RULE); git rev-parse reads the layout, so parity holds
    const mkWorktree = (common, name, root) => { const gd = path.join(common, 'worktrees', name); fs.mkdirSync(gd, { recursive: true }); fs.writeFileSync(path.join(gd, 'HEAD'), 'ref: refs/heads/main\n'); fs.writeFileSync(path.join(gd, 'commondir'), '../..\n'); fs.writeFileSync(path.join(gd, 'gitdir'), path.join(root, '.git') + '\n'); fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, '.git'), `gitdir: ${gd}\n`); return root; };
    const clone = mkclone('clone');
    fs.mkdirSync(path.join(clone, 'src')); for (const f of ['browser-verbs.js', 'browser-stuck.js']) fs.writeFileSync(path.join(clone, 'src', f), ''); // the generator copies these beside its tools at create()
    mkWorktree(path.join(clone, '.git'), 'wt', path.join(S, 'wt'));
    const clone2 = mkclone('clone2'); mkWorktree(path.join(clone2, '.git'), 'wt-gone', path.join(S, 'wt-gone')); fs.rmSync(clone2, { recursive: true, force: true });
    const bare = path.join(S, 'bare.git'); git(S, 'clone', '-q', '--bare', clone, bare); mkWorktree(bare, 'bare-wt', path.join(S, 'bare-wt'));
    const sup = mkclone('super'); fs.mkdirSync(path.join(sup, 'sub')); fs.mkdirSync(path.join(sup, '.git', 'modules'), { recursive: true }); git(path.join(sup, 'sub'), 'init', '-q', '--separate-git-dir', path.join(sup, '.git', 'modules', 'sub')); // a submodule's layout: a .git FILE naming .git/modules/sub, no commondir
    fs.symlinkSync(clone, path.join(S, 'link'));
    const nogit = path.join(S, 'nogit'); fs.mkdirSync(nogit);
    const eacces = mkWorktree(path.join(clone, '.git'), 'wt-eacces', path.join(S, 'wt-eacces'));
    const ATG = require(path.join(REPO, 'src/server/agent-tool-generators.js'));
    const readRootFacts = ATG.create({ rootDir: clone, port: 0 }).readRootFacts; // the scratch clone is the generator's rootDir (it makes data/ dirs there)
    ok(typeof readRootFacts === 'function', 'agent-tool-generators exports readRootFacts (the SHIPPED reader is what this leg judges)');
    const real = (p) => fs.realpathSync(p);
    const judge = (d) => { const f = readRootFacts(d); return { f, v: SR.rootVerdict({ ...f, tmpRoots: [] }) }; }; // tmpRoots [] isolates the git rules (every shape sits under the tmp dir)
    const gitSays = (d) => execFileSync('git', ['-C', d, 'rev-parse', '--git-dir', '--git-common-dir'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim().split('\n').map((p) => real(path.resolve(d, p))).join(',');
    let r = judge(clone); ok(r.v.kind === 'checkout' && r.f.gitDir === real(clone + '/.git') && gitSays(clone) === [r.f.gitDir, r.f.gitCommonDir].join(','), 'a. a plain clone (.git a directory) ⇒ checkout; the facts equal git rev-parse', r);
    r = judge(path.join(S, 'wt')); ok(r.v.kind === 'worktree' && r.v.checkout === real(clone) && gitSays(path.join(S, 'wt')) === [r.f.gitDir, r.f.gitCommonDir].join(','), 'b. a linked worktree ⇒ worktree naming the clone; the facts equal git rev-parse', r);
    r = judge(path.join(S, 'wt-gone')); ok(r.v.kind === 'worktree' && r.f.dangling === true && /clone2$/.test(r.v.checkout), "c. a worktree whose checkout is GONE (dangling gitdir) ⇒ still a worktree, the checkout inferred from git's layout (it shipped as a checkout: every writer wrote)", r);
    r = judge(path.join(S, 'bare-wt')); ok(r.v.kind === 'worktree' && r.v.checkout === real(bare), 'd. a worktree of a bare repo ⇒ worktree naming the bare dir', r);
    r = judge(path.join(sup, 'sub')); ok(r.v.kind === 'checkout' && r.f.gitDir === r.f.gitCommonDir && /\/\.git\/modules\/sub$/.test(r.f.gitDir), 'e. a submodule checkout (.git file, gitdir under .git/modules/, no commondir) ⇒ checkout', r);
    r = judge(path.join(S, 'link')); ok(r.v.kind === 'checkout' && r.f.root === real(clone), 'f. a clone reached through a symlink ⇒ checkout, the root its real path', r);
    r = judge(nogit); ok(r.v.kind === 'checkout' && !r.f.error, 'h. a tree with no .git (ENOENT is not an error: the docker image) ⇒ checkout', r);
    if (typeof process.getuid === 'function' && process.getuid() === 0) console.log('  SKIP (LOUD): running as root — chmod 000 refuses no read, the EACCES cell did not run');
    else { fs.chmodSync(path.join(eacces, '.git'), 0o000); r = judge(eacces); fs.chmodSync(path.join(eacces, '.git'), 0o644); ok(r.v.kind === 'unknown' && /cannot be read \(EACCES\)/.test(r.f.error || '') && /could not be judged/.test(r.v.why), 'g. an UNREADABLE .git (EACCES stands in for an NFS hiccup) ⇒ the error fact ⇒ unknown, refused by name (it shipped as a checkout)', r); }
    const gd = fs.readFileSync(path.join(eacces, '.git'), 'utf8'); fs.writeFileSync(path.join(eacces, '.git'), 'ref: nothing\n');
    r = judge(eacces); ok(r.v.kind === 'unknown' && /without a gitdir: line/.test(r.f.error || ''), 'a .git FILE without a gitdir: line ⇒ unknown (never "no git")', r);
    fs.writeFileSync(path.join(eacces, '.git'), gd);
    ok(SR.refusalLine(SR.rootVerdict({ root: '/x', error: 'boom', tmpRoots: TMP })).startsWith('hooks not registered: the server root could not be judged: boom — nothing is written until the root can be judged'), 'the unknown sentence: nothing is written until the root can be judged');
    fs.rmSync(S, { recursive: true, force: true });
  }
  // the ORCH: an erroring read is never cached (read again at the next writer), and the owner is told at boot
  ok(/if \(!_rootFacts \|\| _rootFacts\.error \|\| t - _rootFactsAt > serverRoot\.ROOT_FACTS_TTL_MS\) \{ _rootFacts = readRootFacts\(rootDir\); _rootFactsAt = t; \}/.test(gen), 'wiring: the facts are cached only when read without error, and for ROOT_FACTS_TTL_MS at most — a transient error is judged again at the next writer, a changed .git within a minute (verify r2 ③)');
  ok(/if \(e && e\.code === 'ENOENT'\) return facts; facts\.error = /.test(gen) && /facts\.dangling = true; return facts;/.test(gen) && /if \(!\(e && e\.code === 'ENOENT'\)\) \{ facts\.error = /.test(gen), 'wiring: ENOENT on .git is "no git"; any other read error is the error fact; a gone gitdir of the worktrees layout is a dangling worktree; a missing commondir is a submodule');
  const watchSrc = read('src/server/hook-root-watch.js');
ok(/if \(integrationEnabled\(\)\) hookRootWatch\.sync\(\);/.test(srv) && /if \(!hookRootWatch\.probeMayRun\(\) \|\| !integrationEnabled\(\) \|\| fs\.existsSync\(HOOK_OPTOUT_FILE\)\) return;/.test(srv) && /if \(!hookRootWatch\.saidRecoveryInstead\(info, scriptMissing\)\) serverNotice\(`hook-health-\$\{key\}`,/.test(srv) && /require\('\.\/src\/server\/hook-root-watch\.js'\)\.create\(\{ dataDir: path\.join\(__dirname, 'data'\), ensureAgentHooks, rootRecovery, ownerWriteRefusal, integrationEnabled: \(\) => integrationEnabled\(\), serverNotice: \(\.\.\.a\) => serverNotice\(\.\.\.a\) \}\)/.test(srv), 'server.js: the boot / toggle sync, the probe\'s gate and the probe\'s words all go through THE hook-root watch (src/server/hook-root-watch.js) — verify r2 ①');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

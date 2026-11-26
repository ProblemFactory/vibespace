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
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
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
  ['a plain copy under /tmp/vs-* (no git), handed a temp home (a suite\'s scratch copy)', { root: '/tmp/vs-rail-9', tmpRoots: TMP, home: '/tmp/vs-rail-9-home' }, 'tmp', (v) => v.tmpRoot === '/tmp'],
  ['a plain dir under /var/tmp, handed a temp home', { root: '/var/tmp/x/vibespace', tmpRoots: TMP, home: '/var/tmp/x/home' }, 'tmp', (v) => v.tmpRoot === '/var/tmp'],
  ['r1278: a person\'s CLONE under /var/tmp, run with their OWN home, is a real hub (rule 3 asks the one test: both signs)', { root: '/var/tmp/x/vibespace', gitDir: '/var/tmp/x/vibespace/.git', gitCommonDir: '/var/tmp/x/vibespace/.git', tmpRoots: TMP, home: '/home/u' }, 'checkout'],
  ['r1278: a copy under /tmp with NO home read is never «tmp» (no answer is never throwaway)', { root: '/tmp/vs-z', tmpRoots: TMP }, 'checkout'],
  ['r1278: …nor with the disk\'s root as its home', { root: '/tmp/vs-z', tmpRoots: TMP, home: '/' }, 'checkout'],
  ['the root IS a tmp root (a temp home)', { root: '/tmp', tmpRoots: TMP, home: '/tmp/h' }, 'tmp'],
  ['a custom os.tmpdir() the caller passed (TMPDIR=/run/user/1000/tmp), a home under it', { root: '/run/user/1000/tmp/vs-y', tmpRoots: [...TMP, '/run/user/1000/tmp'], home: '/run/user/1000/tmp/h' }, 'tmp'],
  ['a tmp root with a trailing slash still judges', { root: '/scratch/a', tmpRoots: ['/scratch/'], home: '/scratch/h' }, 'tmp'],
  ['SEGMENT BOUNDARY: /tmpx is not under /tmp', { root: '/tmpx/vibespace', tmpRoots: TMP, home: '/tmp/h' }, 'checkout'],   // a temp home: only the boundary decides (r1278: the tmp kind needs one)
  ['SEGMENT BOUNDARY: /var/tmpfoo is not under /var/tmp', { root: '/var/tmpfoo/vibespace', tmpRoots: TMP, home: '/var/tmp/h' }, 'checkout'],
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
  ['FORCE with no HOME: no home read is never «tmp» (r1278), so a copy under /tmp is a checkout and FORCE changes nothing', { root: '/tmp/vs-a', tmpRoots: TMP, force: true }, 'checkout'],
  ['FORCE with no HOME on a WORKTREE is ignored — still refused', { root: '/home/u/wt2', gitDir: CO + '/.git/worktrees/wt2', gitCommonDir: CO + '/.git', tmpRoots: TMP, force: true }, 'worktree'],
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
const wtLine = SR.refusalLine(SR.rootVerdict(ROWS.find(([n]) => n.startsWith('a WORKTREE under /var/tmp (the 2026-10-01 incident shape)'))[1]));
ok(wtLine === "hooks not registered: this server runs from a git worktree of /home/u/vibespace — the owner's CLI config belongs to that checkout's instance", 'refusalLine: THE worktree journal sentence, word for word', wtLine);
ok(/^hooks not registered: this server runs from a temporary folder \(\/tmp\/vs-rail-9 is under \/tmp\) — a throwaway server never writes the owner's CLI config$/.test(SR.refusalLine(SR.rootVerdict(ROWS.find(([n]) => n.startsWith('a plain copy under /tmp/vs-* (no git)'))[1]))), 'refusalLine: the tmp sentence names the root and its tmp root');
ok(/^hooks not registered: VIBESPACE_SKIP_AGENT_HOOKS=1 is set for this server$/.test(SR.refusalLine(SR.rootVerdict(ROWS.find(([n]) => n.startsWith('VIBESPACE_SKIP_AGENT_HOOKS=1 on a checkout'))[1]))), 'refusalLine: the override sentence names the env var');
ok(SR.refusalLine(SR.rootVerdict(ROWS[0][1])) === null && SR.refusalLine(null) === null, 'refusalLine: an ok verdict has no sentence');
const src = fs.readFileSync(path.join(REPO, 'src/server-root.js'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
ok(!/\brequire\s*\(|^\s*import\b|\bprocess\.|\bfs\./m.test(code), 'src/server-root.js imports nothing and reads no env / fs (PURE — the ORCH half reads the facts)');

console.log('— ③ mutant-copy controls (a weakened rule must turn named rows red)');
const M = mutantCopies('server-root', REPO);
const CONTROLS = [
  { what: 'tmp prefix WITHOUT the segment boundary', needle: "return a === d || a.startsWith(d + '/');", repl: 'return a === d || a.startsWith(d);', reds: ['SEGMENT BOUNDARY: /tmpx is not under /tmp', 'SEGMENT BOUNDARY: /var/tmpfoo is not under /var/tmp'] },
  { what: 'the worktree rule dropped (the old /tmp-only guard)', needle: "  } else if (isLinkedWorktree(gitDir, gitCommonDir)) {", repl: '  } else if (false) {', reds: ['a WORKTREE beside the checkout (not under any tmp root — the old guard passed it)', 'a WORKTREE under /var/tmp (the 2026-10-01 incident shape) — worktree outranks tmp'] },
  { what: 'FORCE honoured whatever the HOME', needle: 'if (isAbs(h) && roots.some((t) => isUnder(h, t))) return', repl: 'if (true) return', reds: ['FORCE with the REAL HOME is ignored — a worktree still refused, and the why says so', 'FORCE with no HOME on a WORKTREE is ignored — still refused'] },
];
for (const c of CONTROLS) {
  ok(src.includes(c.needle), `control "${c.what}": the needle is in the shipped source (a stale control would prove nothing)`);
  const mod = M.load('src/server-root.js', editAnchor(src, c.needle, c.repl, "src/server-root.js"), c.what.replace(/\W+/g, '-').slice(0, 24));
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
const WRITER = /writeJsonManaged\(|writeTomlManaged\(|applyConfigPlan\(|ensureCliConfig\(|_patchHookFile\(|applyThisMachine\(\{|cliRunner\.apply\(|vibespace-hook-register\.mjs"|writeFileSync\(.*?'(?:config\.toml|settings\.json|hooks\.json|\.claude\.json)'/;
const NOT_A_WRITE = [
  [/--status/, 'the READ-ONLY receipts probe'],
  [/grep -q VIBESPACE_CLI_CONFIG/, 'a grep of the shipped helper (read-only)'],
  [/^function applyThisMachine\(\{/, 'the ONE write road of this machine (B-ddf3 unit 2 line 1): its three callers are rows, each guarded'],
  [/return cliRunner\.apply\(\(\) => encodePlan\(/, 'the road\'s own run (reached only through its guarded callers)'],
  [/__applier\./, "the generated helper's own text (runs only where a gated site runs it)"],
  [/writeFileSync\(path\.join\(shared, 'config\.toml'\), ''\)/, 'codex seedDir: an EMPTY symlink target created only when absent (a harness prerequisite, never content — verify r1 ②)'],
  [/writeFileSync\(path\.join\(dir, '\.claude\.json'\)/, "claude seedDir: an ISOLATED login dir's .claude.json (never ~/.claude.json)"],
  [/writeFileSync\(path\.join\(probeConfigDir, '\.claude\.json'\)/, "the /usage probe's ISOLATED config dir (B-855a c1)"],
  [/const homeConfig = \(home, extra = \{\}\) => fs\.writeFileSync\(path\.join\(home, '\.claude\.json'\)/, "the long-lived-token measurement's per-variant SCRATCH HOME (src/claude-oat-probe.js, lane cli-self-measure — a fake account label under its own scratch, never ~/.claude.json)"],
];
const GUARD = /ownerWriteRefusal\(\)|refuseOwnerWrite\(\)|refusalNow\(\)|\(refused \? /;
const SITES = [
  // B-ddf3 unit 2 line 1: THIS machine's writes all go through applyThisMachine (the shipped helper, through the starter)
  { file: 'src/server/agent-tool-generators.js', re: /applyThisMachine\(\{ reason: auto \? 'hooks'/, what: 'ensureAgentHooks — register our hook entries in ~/.claude/settings.json + ~/.codex/hooks.json (through the shipped helper)' },
  { file: 'src/server/agent-tool-generators.js', re: /applyThisMachine\(\{ reason: ifOptedOut \? 'hooks removed \(a start: still opted out\)' : 'hooks removed', strip: true,/, what: 'stripAgentHookEntries — strip them (Integration OFF / Remove; the helper\'s --uninstall)' },
  { file: 'src/server/harness-config-sync.js', re: /return applyThisMachine\(\{ reason \}\)/, what: 'syncCliConfig — the managed keys at boot and on every settings write (onSettingsWrite; through the shipped helper)' },
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
  const lost = editAnchor(syncSrc, /refusalNow\(\)|ownerWriteRefusal\(\)|refuseOwnerWrite\(\)|\(refused \? /g, (m) => (m === '(refused ? ' ? '(false ? ' : 'null'), "src/server/harness-config-sync.js");
  const f = M.write('src/server/harness-config-sync.js', lost, 'no-guard');
  const w = writersIn('src/server/harness-config-sync.js', fs.readFileSync(f, 'utf8'));
  ok(lost !== syncSrc && w.length === 1 && !w[0].guarded && /return applyThisMachine\(\{ reason \}\)/.test(w[0].text), 'CONTROL: a copy of harness-config-sync.js without its guard is found UNGUARDED (the census goes red on a real file)', w);
  const nameHit = writersIn('src/x.js', "  fs.writeFileSync(path.join(os.homedir(), '.codex', 'config.toml'), toml);\n");
  ok(nameHit.length === 1 && !nameHit[0].guarded, 'CONTROL: a raw writeFileSync toward a CLI config file NAME is a writer (unguarded, no row)');
}

console.log('— ⑤ wiring + the words: the status surfaces say the refusal, never "registered"');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const srv = read('server.js'), gen = read('src/server/agent-tool-generators.js'), sync = read('src/server/harness-config-sync.js');
ok(/rootVerdict\(\{\s*\.\.\.f,\s*tmpRoots: f\.tmpRoots \|\| tmpSpellings\(\),\s*envOverride: process\.env\[serverRoot\.OVERRIDE_ENV\] === '1',\s*force: process\.env\[serverRoot\.FORCE_ENV\] === '1',\s*home: f\.home \|\| os\.homedir\(\),/.test(gen)
  && gen.includes("const tmpSpellings = () => require('./throwaway-root.js').tmpRootsOf({ home: os.homedir(), realpath: (p) => p });") && !/\bTMP_ROOTS\b/.test(gen) && /for \(const t of tmpSpellings\(\)\) tmp\.push\(await realOr\(t\)\);\n\s*facts\.tmpRoots = tmp; facts\.home = await realOr\(os\.homedir\(\)\);/.test(gen),
  "the ORCH reads THE one list of temp roots as spelled (src/server/throwaway-root.js tmpRootsOf — B-ba47 shape H r1278), both env flags as booleans, and the real HOME — realpath'd in the facts' own read (B-1425: off the loop)");
ok(/if \(st\.isDirectory\(\)\) \{ facts\.gitDir = facts\.gitCommonDir = await realOr\(dotGit\); return facts; \}/.test(gen) && /path\.join\(facts\.gitDir, 'commondir'\)/.test(gen) && !/execFileSync\('git'/.test(gen.slice(gen.indexOf('function readRootFacts'), gen.indexOf('function rootVerdict'))),
  'the facts come from fs: .git dir → checkout, .git file → gitdir + commondir (never a git child at boot)');
ok(/const k = r && !r\.pending \? `\$\{r\.kind\}\|\$\{r\.why\}` : null;\n  if \(k && _refusalSaid !== k\) \{ _refusalSaid = k; console\.log\(r\.line\); \}/.test(gen), 'ONE journal line per refusal: the first refused writer says it, the latch keeps the rest quiet — never spent on «not judged yet» (B-1425 r827)');
ok(/function hookRegistrationSafe\(\) \{ return rootVerdict\(\)\.ok; \}/.test(gen) && !/here\.startsWith\(tmp\)/.test(gen), 'hookRegistrationSafe() IS the verdict now (the old /tmp-only prefix test is gone)');
ok(/refused: ownerWriteRefusal\(\), registeredAfterError: _registeredAfterError \};/.test(gen) && /const refused = refusalNow\(\);\n\s*return \{ safe: !refused, refused, registeredAfterError: recoveryNow\(\), files:/.test(sync), 'agentHooksStatus and cliConfigStatus carry the refusal (verify r2: and the recovery fact)');
ok(/hookRegistrationSafe, ownerWriteRefusal, refuseOwnerWrite, rootRecovery,\n\s*log:/.test(srv) && /hosts\.ownerWriteRefusal = refuseOwnerWrite;/.test(srv) && /cliConfigPlanB64, cliConfigGate: \(\) => harnessConfig\.startGate\(\), ownerWriteRefusal: refuseOwnerWrite,/.test(srv),
  'server.js hands the verdict to the cli-config sync, to hosts and to the ws ctx');
ok(/'cliConfigPlanB64', 'cliConfigGate', 'ownerWriteRefusal',/.test(read('src/ws-handler.js')) && /cliConfigPlanB64, cliConfigGate, ownerWriteRefusal,\n/.test(read('src/ws-create.js')), 'ownerWriteRefusal is in WS_CTX_CONTRACT and ws-create destructures it');
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
  ok(/if \(!v\.ok && v\.kind === 'unknown' && !f\.pending\) _lastRootError = \{ at: t, error: f\.error \|\| v\.why \};/.test(gen) && /if \(_lastRootError && !_registeredAfterError && Object\.values\(results\)\.some\(\(x\) => x && x\.ok\)\) _registeredAfterError = \{ at: Date\.now\(\), error: _lastRootError\.error, since: _lastRootError\.at \};/.test(gen) && /function rootRecovery\(\) \{ return \{ lastError: _lastRootError, registeredAfterError: _registeredAfterError \}; \}/.test(gen) && /readRootFacts, rootRecovery,/.test(gen), 'ORCH: the last unknown is remembered, a registration after it is the recovery fact (set once), rootRecovery() exports both');
  ok(/const due = serverRoot\.unknownNoticeDue\(memo, refused\.why \|\| refused\.line\);/.test(watchSrc) && /posted = Number\(seen\) > 0;\n\s*if \(posted\) \{ remember\(due\.memo\); if \(hold\.writable\('a write of the hooks notice record'\)\) writeMemo\(due\.memo\); \}/.test(watchSrc) && /function writeMemo\(m\) \{ try \{ writeJsonAtomic\(memoFile, m\); \}/.test(watchSrc) && /const \{ writeJsonAtomic \} = require\('\.\.\/channel-store\.js'\);/.test(watchSrc), 'the watch: the unknown notice is posted once per cause — the memo persisted through THE atomic writer, written only when a client saw the toast (B-f276: and never over a memo that could not be read)');
  // THE REAL LEG: the watch over fake timers + a scripted ensureAgentHooks + a recording serverNotice + a scratch data dir
  const HW = require(path.join(REPO, 'src/server/hook-root-watch.js'));
  const wdir = fs.mkdtempSync(path.join('/tmp', 'vs-srvroot-watch-')); process.on('exit', () => { try { fs.rmSync(wdir, { recursive: true, force: true }); } catch { } });
  const timers = []; const notices = []; let verdict = { refused: { kind: 'unknown', why: 'the server root could not be judged: /x/.git cannot be read (EIO)', line: 'hooks not registered: the server root could not be judged: /x/.git cannot be read (EIO)' } };
  let registered = null; let clients = 1;
  const w = HW.create({ dataDir: wdir, ensureAgentHooks: () => (verdict.refused ? { skipped: true, refused: verdict.refused } : { claude: { ok: true } }), rootRecovery: () => ({ lastError: null, registeredAfterError: registered }), ownerWriteRefusal: () => verdict.refused || null, integrationEnabled: () => true, serverNotice: (key, text, o) => { notices.push({ key, text, i18n: o && o.i18n }); return clients; }, setTimer: (fn, ms) => { const h = { fn, ms, unref() { } }; timers.push(h); return h; }, now: () => 0 });
  const fire = async () => { const h = timers.shift(); if (h) h.fn(); await new Promise((r) => setImmediate(r)); };   // (B-ddf3 u2 line 1: sync() lands a moment later — a Promise)
  await w.sync();
  ok(notices.length === 1 && notices[0].key === 'hook-root-unknown' && notices[0].i18n && notices[0].i18n.key === HW.UNKNOWN_KEY && /EIO/.test(notices[0].i18n.params.error) && fs.existsSync(w.memoFile) && JSON.parse(fs.readFileSync(w.memoFile, 'utf8')).cause === verdict.refused.why && timers.length === 1 && timers[0].ms === 30000, 'REAL: a boot unknown posts ONE notice (i18n, the error named), writes the memo (a client saw it) and arms the first re-judge at 30 s', { notices, timers: timers.map((t) => t.ms), memo: fs.existsSync(w.memoFile) });
  await fire(); await fire(); await fire(); await fire();
  ok(notices.length === 1 && w._state.delays.join() === '30000,60000,120000,300000,600000', 'REAL: four re-judges later the SAME cause posted nothing more and the ladder climbed 30 s → 60 s → 2 → 5 → 10 min', { notices: notices.length, delays: w._state.delays });
  const w2 = HW.create({ dataDir: wdir, ensureAgentHooks: () => ({ skipped: true, refused: verdict.refused }), rootRecovery: () => ({}), ownerWriteRefusal: () => verdict.refused, serverNotice: (key) => { notices.push({ key, boot: 2 }); return 1; }, setTimer: (fn, ms) => ({ fn, ms, unref() { } }) });
  await w2.sync();
  ok(notices.length === 1, 'REAL: the NEXT BOOT under the same cause (a fresh watch, the memo on disk) posts NOTHING — never one per boot', notices);
  verdict = { refused: { kind: 'unknown', why: 'the server root could not be judged: /x/.git/commondir cannot be read (EACCES)', line: 'hooks not registered: …' } };
  await fire();
  ok(notices.length === 2 && notices[1].key === 'hook-root-unknown' && JSON.parse(fs.readFileSync(w.memoFile, 'utf8')).cause === verdict.refused.why, 'REAL: a NEW cause posts again and replaces the memo', notices.length);
  clients = 0; fs.rmSync(w.memoFile, { force: true }); verdict = { refused: { kind: 'unknown', why: 'the server root could not be judged: nobody watching', line: 'x' } };
  await fire();
  ok(notices.length === 3 && !fs.existsSync(w.memoFile), 'REAL: a notice nobody saw (no client) does not burn the memo — the next judge may say it to someone', { memo: fs.existsSync(w.memoFile) });
  clients = 1; verdict = {}; registered = { at: new Date(2026, 9, 2, 9, 41).getTime(), error: '/x/.git cannot be read (EIO)', since: 0 };
  await fire();
  ok(notices.length === 4 && notices[3].key === 'hook-root-registered' && notices[3].i18n.key === HW.REGISTERED_KEY && notices[3].i18n.params.time === '09:41' && /09:41 after an earlier read error \(\/x\/\.git cannot be read \(EIO\)\)/.test(notices[3].text) && !fs.existsSync(w.memoFile) && w._state.attempt === 0 && timers.length === 0, 'REAL: the recovery — the registration after the error said ONCE (i18n, HH:MM + the error), the memo gone, the ladder reset, no timer left', { notices: notices.slice(3), attempt: w._state.attempt, timers: timers.length });
  await w.sync(); w.recovered();
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
  const forceSites = execFileSync('git', ['grep', '-n', '-e', 'FORCE_AGENT_HOOKS', '-e', 'FORCE_ENV', '--', 'src', 'server.js', 'data/bin'], { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter((l) => !l.startsWith('src/server-root.js:') && !l.startsWith('src/hub-env-knobs.json:'));   // the knob file NAMES every name the hub's code reads (B-ba47 shape H, derived): no path forces through it
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
    SR.ROOT_FACTS_TTL_MS = -1; const g = Gm.create({ rootDir: ttlRoot, port: 0 }); await g.rootFactsNow(); const k1 = g.rootVerdict().kind; convert(); await g.rootFactsNow(); const k2 = g.rootVerdict().kind;   // B-1425: each read off the loop, awaited
    ok(k1 === 'tmp' && k2 === 'worktree', `③ the shipped ORCH re-reads aged facts: a .git converted in place moves the verdict (${k1} → ${k2}; under a tmp root the worktree rule outranks tmp)`, { k1, k2 });
    restore(); SR.ROOT_FACTS_TTL_MS = Infinity; const g2 = Gm.create({ rootDir: ttlRoot, port: 0 }); await g2.rootFactsNow(); const c1 = g2.rootVerdict().kind; convert(); await g2.rootFactsNow(); const c2 = g2.rootVerdict().kind;
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
    const judge = async (d) => { const f = await readRootFacts(d); return { f, v: SR.rootVerdict({ ...f, tmpRoots: [] }) }; };   // B-1425: the shipped reader runs off the loop // tmpRoots [] isolates the git rules (every shape sits under the tmp dir)
    const gitSays = (d) => execFileSync('git', ['-C', d, 'rev-parse', '--git-dir', '--git-common-dir'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim().split('\n').map((p) => real(path.resolve(d, p))).join(',');
    let r = await judge(clone); ok(r.v.kind === 'checkout' && r.f.gitDir === real(clone + '/.git') && gitSays(clone) === [r.f.gitDir, r.f.gitCommonDir].join(','), 'a. a plain clone (.git a directory) ⇒ checkout; the facts equal git rev-parse', r);
    r = await judge(path.join(S, 'wt')); ok(r.v.kind === 'worktree' && r.v.checkout === real(clone) && gitSays(path.join(S, 'wt')) === [r.f.gitDir, r.f.gitCommonDir].join(','), 'b. a linked worktree ⇒ worktree naming the clone; the facts equal git rev-parse', r);
    r = await judge(path.join(S, 'wt-gone')); ok(r.v.kind === 'worktree' && r.f.dangling === true && /clone2$/.test(r.v.checkout), "c. a worktree whose checkout is GONE (dangling gitdir) ⇒ still a worktree, the checkout inferred from git's layout (it shipped as a checkout: every writer wrote)", r);
    r = await judge(path.join(S, 'bare-wt')); ok(r.v.kind === 'worktree' && r.v.checkout === real(bare), 'd. a worktree of a bare repo ⇒ worktree naming the bare dir', r);
    r = await judge(path.join(sup, 'sub')); ok(r.v.kind === 'checkout' && r.f.gitDir === r.f.gitCommonDir && /\/\.git\/modules\/sub$/.test(r.f.gitDir), 'e. a submodule checkout (.git file, gitdir under .git/modules/, no commondir) ⇒ checkout', r);
    r = await judge(path.join(S, 'link')); ok(r.v.kind === 'checkout' && r.f.root === real(clone), 'f. a clone reached through a symlink ⇒ checkout, the root its real path', r);
    r = await judge(nogit); ok(r.v.kind === 'checkout' && !r.f.error, 'h. a tree with no .git (ENOENT is not an error: the docker image) ⇒ checkout', r);
    if (typeof process.getuid === 'function' && process.getuid() === 0) console.log('  SKIP (LOUD): running as root — chmod 000 refuses no read, the EACCES cell did not run');
    else { fs.chmodSync(path.join(eacces, '.git'), 0o000); r = await judge(eacces); fs.chmodSync(path.join(eacces, '.git'), 0o644); ok(r.v.kind === 'unknown' && /cannot be read \(EACCES\)/.test(r.f.error || '') && /could not be judged/.test(r.v.why), 'g. an UNREADABLE .git (EACCES stands in for an NFS hiccup) ⇒ the error fact ⇒ unknown, refused by name (it shipped as a checkout)', r); }
    const gd = fs.readFileSync(path.join(eacces, '.git'), 'utf8'); fs.writeFileSync(path.join(eacces, '.git'), 'ref: nothing\n');
    r = await judge(eacces); ok(r.v.kind === 'unknown' && /without a gitdir: line/.test(r.f.error || ''), 'a .git FILE without a gitdir: line ⇒ unknown (never "no git")', r);
    fs.writeFileSync(path.join(eacces, '.git'), gd);
    ok(SR.refusalLine(SR.rootVerdict({ root: '/x', error: 'boom', tmpRoots: TMP })).startsWith('hooks not registered: the server root could not be judged: boom — nothing is written until the root can be judged'), 'the unknown sentence: nothing is written until the root can be judged');
    fs.rmSync(S, { recursive: true, force: true });
  }
  // the ORCH: an erroring read is never cached (read again at the next writer), and the owner is told at boot
  ok(/const rootStale = \(t = Date\.now\(\)\) => !_rootFacts \|\| !!_rootFacts\.error \|\| t - _rootFactsAt > serverRoot\.ROOT_FACTS_TTL_MS;/.test(gen) && /if \(rootStale\(t\)\) startRootRead\(\);/.test(gen) && /\.then\(\(f\) => \{ _rootFacts = f; _rootFactsAt = Date\.now\(\);/.test(gen), 'wiring (B-1425: the refresh runs off the loop, single-flight): the facts are cached only when read without error, and for ROOT_FACTS_TTL_MS at most — a transient error is judged again at the next writer, a changed .git within a minute (verify r2 ③)');
  ok(/if \(e && e\.code === 'ENOENT'\) return facts; facts\.error = /.test(gen) && /facts\.dangling = true; return facts;/.test(gen) && /if \(!\(e && e\.code === 'ENOENT'\)\) \{ facts\.error = /.test(gen), 'wiring: ENOENT on .git is "no git"; any other read error is the error fact; a gone gitdir of the worktrees layout is a dangling worktree; a missing commondir is a submodule');
  const watchSrc = read('src/server/hook-root-watch.js');
ok(/if \(integrationEnabled\(\)\) return hookRootWatch\.sync\(\);/.test(srv) && /if \(!hookRootWatch\.probeMayRun\(\) \|\| !integrationEnabled\(\) \|\| optOutMarkNow\(\) !== 'not'\) return;/.test(srv) && / && !hookRootWatch\.saidRecoveryInstead\(info, scriptMissing\)\) serverNotice\(`hook-health-\$\{key\}`,/.test(srv) && /require\('\.\/src\/server\/hook-root-watch\.js'\)\.create\(\{ dataDir: path\.join\(__dirname, 'data'\), ensureAgentHooks, rootRecovery, ownerWriteRefusal, factsNow: rootFactsNow, integrationEnabled: \(\) => integrationEnabled\(\), serverNotice: \(\.\.\.a\) => serverNotice\(\.\.\.a\) \}\)/.test(srv), 'server.js: the boot / toggle sync, the probe\'s gate and the probe\'s words all go through THE hook-root watch (src/server/hook-root-watch.js) — verify r2 ①');
}

// B-9dd0 (主开发 r321): THE «under a temp root» verdict, one spelling (the update check, the boot's runtime check)
{
  const T = ['/tmp', '/var/tmp'];
  const rows = [
    [{ root: '/var/tmp/vs-lane/wt', tmpRoots: T }, '/var/tmp', 'a lane worktree under /var/tmp'],
    [{ root: '/var/tmpfoo/wt', tmpRoots: T }, null, '/var/tmpfoo is not under /var/tmp (segment boundary)'],
    [{ root: '/tmp', tmpRoots: T }, '/tmp', 'the temp root itself'],
    [{ root: '/srv/link/wt', realRoot: '/tmp/real/wt', tmpRoots: T }, '/tmp', 'a root reached through a link: its REAL path is judged'],
    [{ root: '/private/tmp/wt', tmpRoots: ['/tmp'], realTmps: ['/private/tmp'] }, '/private/tmp', 'a temp root\'s REAL path counts too (macOS /tmp → /private/tmp)'],
    [{ root: '/home/u/vibespace', realRoot: '/home/u/vibespace', tmpRoots: T }, null, 'a person\'s checkout'],
    [{ root: 'relative/wt', tmpRoots: ['tmp'] }, null, 'relative paths are never judged under'],
    [{ root: '/home/u/vibespace', realRoot: '/home/u/vibespace', tmpRoots: ['/', '/tmp'] }, null, 'r468: the DISK\'S ROOT is never a temp root (a temp folder variable set to /)'],
    [{ root: '/home/u/vibespace', tmpRoots: ['/tmp'], realTmps: ['//'] }, null, 'r468: …nor a real path that resolves to it'],
  ];
  for (const [arg, want, what] of rows) { const got = SR.tmpRootUnder(arg); ok(got === want, `B-9dd0 tmpRootUnder: ${what} → ${got}`, `want ${want}`); }
  // r528 (ruled in): rule 3 of rootVerdict is the same rule — the disk's root as a temp root (the incident's own hub, TMPDIR=/) never
  // makes a person's checkout «kind tmp» (its CLI hooks would never be registered); CONTROL: a real temp root above it still does
  const ck = { root: '/home/u/vibespace', gitCommonDir: '/home/u/vibespace/.git', gitDir: '/home/u/vibespace/.git' };
  const vRoot = SR.rootVerdict({ ...ck, tmpRoots: ['/', '/tmp'], home: '/home/u' }), vCtl = SR.rootVerdict({ ...ck, tmpRoots: ['/home', '/tmp'], home: '/home/u' });   // r1278: the control's home lies under its temp root too
  console.log(`  (rootVerdict with tmpRoots [/, /tmp]: ${vRoot.kind} — ${vRoot.why || 'ok'}; with [/home, /tmp]: ${vCtl.kind})`);
  ok(vRoot.kind !== 'tmp' && vCtl.kind === 'tmp' && vCtl.tmpRoot === '/home', 'B-9dd0 r528: rootVerdict\'s rule 3 never calls a checkout «tmp» for the disk\'s root (TMPDIR=/); CONTROL: a temp root above the checkout still does');
  ok(/const tmp = tmpRootUnder\(\{ root: r, tmpRoots: roots \}\);/.test(fs.readFileSync(path.join(REPO, 'src/server-root.js'), 'utf8')), 'B-9dd0 r528: rule 3 IS tmpRootUnder (one rule, no second spelling)');
  const ops = fs.readFileSync(path.join(REPO, 'src/server/ops-routes.js'), 'utf8'), rb = fs.readFileSync(path.join(REPO, 'src/server/runtime-boot.js'), 'utf8');
  ok(/throwaway = \(\) => require\('\.\/throwaway-root\.js'\)\.throwaway\(rootDir\)/.test(ops) && /throwaway\(\) === false \? null/.test(ops) && /throwawayOf = \(r\) => require\('\.\/throwaway-root\.js'\)\.throwaway\(r\)/.test(rb) && /throwawayOf\(rootDir\) === false/.test(rb)
    && !/tmpRootUnder/.test(ops) && !/tmpRootUnder/.test(rb),
    'B-9dd0 → B-ba47 shape H (主开发 r1278: rule 3 asks THE ONE TEST): the update check and the boot\'s runtime check both ask src/server/throwaway-root.js throwaway — one verdict for every gate, no second spelling; only a judged «false» is online');
}

// ── ⑧ B-1425 (主开发 r640 / r647): THE ROOT FACTS OFF THE HUB'S LOOP — LAW 1 (one read in flight, ever), LAW 2 (who waits) ──
console.log('— ⑧ B-1425: the root facts are read off the loop — one read in flight, ever; a caller that can wait, waits');
{
  const Gm = require(path.join(REPO, 'src/server/agent-tool-generators.js'));
  const R8 = fs.mkdtempSync(path.join('/tmp', 'vs-srvroot8-')); process.on('exit', () => { try { fs.rmSync(R8, { recursive: true, force: true }); } catch { } });
  // a stand-in for the reader's file calls: its .git stat is HELD until released (the shape of a stat on a mount that does not answer)
  let release = null; const held = new Promise((r) => { release = r; }); const asked = [];
  const stand = { realpath: async (q) => q, stat: async (q) => { asked.push(q); await held; throw Object.assign(new Error('no .git'), { code: 'ENOENT' }); }, readFile: async () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }); } };
  // the reader's deadline timer is unref'd (it never keeps a hub alive); here a held stand-in read is the only thing out, so the
  // section keeps the loop alive itself while it waits (a node with nothing pending would end with an unsettled await)
  const keep8 = setInterval(() => { }, 1000);
  const G = Gm.create({ rootDir: R8, port: 0 });
  G._setRootFs(stand); G._setRootReadMs(30);
  const v0 = G.rootVerdict();   // the cache is empty: it starts the ONE read and answers «not read yet» — no file call
  const s0 = G.rootReadStats();
  const f1 = await G.rootFactsNow();   // a caller that waits: bounded by the deadline counted from the read's start
  // THREE BACKOFF STEPS PASS while the held read is still out: each asks again (the cache, and a caller that waits)
  const steps = [];
  for (let k = 0; k < 3; k++) { steps.push(G.rootVerdict().kind); steps.push((await G.rootFactsNow()).late === true); }
  const s1 = G.rootReadStats(), vLate = G.rootVerdict(), rec = G.rootRecovery();
  console.log(`  (at rest before the release: ${JSON.stringify(s0)} → ${JSON.stringify(s1)}; first verdict ${v0.kind} «${String(v0.why).slice(0, 90)}»; the waiting caller got late=${f1.late} «${String(f1.error).slice(0, 90)}»; the steps ${JSON.stringify(steps)}; .git stats asked ${asked.length})`);
  ok(v0.kind === 'unknown' && /not judged yet/.test(v0.why) && s0.started === 1 && s0.inFlight === true, 'B-1425: the first verdict reads the cache only — it STARTS the read off the loop and answers «not judged yet» (no file call on the loop)', { v0, s0 });
  ok(f1.late === true && /did not answer in 0\.03 s/.test(f1.error), 'B-1425: a caller that waits past the deadline gets a NAMED fact («… did not answer in N s»), never a hold', f1);
  ok(s1.started === 1 && s1.ended === 0 && s1.inFlight === true && asked.length === 1, 'B-1425 LAW 1: the held read still out, THREE backoff steps pass — exactly ONE read was ever started (never a second beside it: a hung mount would take every file thread)', { s1, asked: asked.length });
  ok(vLate.kind === 'unknown' && /did not answer in/.test(vLate.why) && rec.lastError && /did not answer in/.test(rec.lastError.error), 'B-1425: the cache verdict past the deadline is the NAMED late fact (the callers\' refusal road), and it is the recorded read error (the recovery words name it)', { vLate, rec });
  release();   // the held stat comes back (an answer: no .git)
  for (let i = 0; i < 500 && G.rootReadStats().ended < 1; i++) await new Promise((r) => setImmediate(r));   // the read's own end, bounded
  const s2 = G.rootReadStats(), vBack = G.rootVerdict();
  const origTtl = SR.ROOT_FACTS_TTL_MS; SR.ROOT_FACTS_TTL_MS = -1;
  try { G.rootVerdict(); G.rootVerdict(); } finally { SR.ROOT_FACTS_TTL_MS = origTtl; }
  const s3 = G.rootReadStats();
  for (let i = 0; i < 500 && G.rootReadStats().ended < 2; i++) await new Promise((r) => setImmediate(r));
  console.log(`  (after the release: ${JSON.stringify(s2)}, verdict ${vBack.kind}; then two aged asks: ${JSON.stringify(s3)})`);
  ok(s2.ended === 1 && s2.inFlight === false && s2.cached === true && vBack.kind !== 'unknown', 'B-1425: once the read CAME BACK its facts are the verdict (here the scratch root: judged, not unknown)', { s2, vBack });
  ok(s3.started === 2, 'B-1425 LAW 1: the NEXT read starts only after the last came back — two aged asks at once start ONE new read', s3);
  // the watch's re-judge AWAITS the facts before its sync (a fake timer; the order recorded)
  const HW = require(path.join(REPO, 'src/server/hook-root-watch.js'));
  const order = []; let fire = null;
  const w = HW.create({ dataDir: R8, ensureAgentHooks: () => { order.push('sync'); return { ok: true }; }, rootRecovery: () => null, ownerWriteRefusal: () => null, factsNow: () => { order.push('facts'); return Promise.resolve(); }, serverNotice: () => 0, setTimer: (fn) => { fire = fn; return { unref() { } }; }, log: () => { } });
  w.arm(); fire();
  for (let i = 0; i < 20 && order.length < 2; i++) await new Promise((r) => setImmediate(r));
  ok(order.join(',') === 'facts,sync', `B-1425 LAW 2: the watch's re-judge awaits the root facts before it registers (${order.join(' → ')})`, order);
  // LAW 2 — WHO WAITS (the roads that can await do): pinned at their sources
  const srv8 = read('server.js'), dial8 = read('src/spawn/dial.js'), ssh8 = read('src/spawn/ssh.js'), hosts8 = read('src/hosts.js'), late8 = read('src/server/hooks-late.js'), watch8 = read('src/server/hook-root-watch.js');
  const waits = [
    ['the boot\'s hook registration', /\nrootFactsNow\(\)\.then\(syncHookRegistration\)\.catch\(\(e\) => console\.warn\(/.test(srv8)],
    ['the boot\'s cli-config sync', /rootFactsNow\(\)\.then\(\(\) => harnessConfig\.syncCliConfig\(\{ reason: 'boot' \}\)\)\.catch\(/.test(srv8)],
    ['the integration switch\'s sync', /const toggled = was !== now \? rootFactsNow\(\)\.then\(syncHookRegistration\)\.catch\(\(e\) => \{ console\.warn\(/.test(srv8)],   // B-ddf3 unit 2: the switch's sync rides back to the settings answer
    ['the hook-health probe (60 s, then 6 h)', /setTimeout\(\(\) => rootFactsNow\(\)\.then\(checkAgentHookHealth\)\.catch\([^\n]*\), 60000\)/.test(srv8) && /setInterval\(\(\) => rootFactsNow\(\)\.then\(checkAgentHookHealth\)\.catch\([^\n]*\), 6 \* 3600 \* 1000\)/.test(srv8)],
    ['GET /api/agent-hooks', /app\.get\('\/api\/agent-hooks', async \(req, res\) => \{ try \{ await rootFactsNow\(\); res\.json\(/.test(srv8)],
    ['the install route', /app\.post\('\/api\/agent-hooks\/install', async \(req, res\) => \{[\s\S]{0,2000}?await rootFactsNow\(\); createHookHelper\(\);/.test(srv8)],
    ['the uninstall route', /app\.post\('\/api\/agent-hooks\/uninstall', async \(req, res\) => \{ try \{\n\s*await rootFactsNow\(\); const landing = await removeAgentHooks\(\);/.test(srv8)],   // B-ddf3 unit 2: answered at the removal's landing
    ['the Apply route (hooks-late)', /app\.post\('\/api\/cli-config\/apply', async \(req, res\) => \{ try \{[^\n]*\n\s*if \(typeof rootFactsNow === 'function'\) await rootFactsNow\(\);/.test(late8) && /hookRegistrationSafe, rootFactsNow \}\);/.test(srv8)],
    ['a paired machine\'s conversation start (spawn/dial.js)', /if \(typeof rootFactsNow === 'function'\) await rootFactsNow\(\);[^\n]*\n\s*await dm\.runCmd\('sh', \['-c',/.test(dial8)],
    ['an ssh machine\'s conversation start (spawn/ssh.js)', /if \(typeof rootFactsNow === 'function'\) await rootFactsNow\(\);[^\n]*\n\s*prelude \+= \(ownerWriteRefusal\(\)/.test(ssh8)],
    ['a machine\'s agent-tools install (hosts.js)', /async installAgentTools\(id, toolDir\) \{\n\s*if \(typeof this\.rootFactsNow === 'function'\) await this\.rootFactsNow\(\);/.test(hosts8) && /hosts\.rootFactsNow = rootFactsNow;/.test(srv8)],
    ['the watch\'s re-judge timer', /if \(typeof factsNow === 'function'\) Promise\.resolve\(\)\.then\(factsNow\)\.then\(run, run\);/.test(watch8) && /factsNow: rootFactsNow,/.test(srv8)],
  ];
  console.log(`  (the roads that wait: ${waits.map(([n, k]) => `${n} ${k ? '✓' : '✗'}`).join(' · ')})`);
  ok(waits.every(([, k]) => k), 'B-1425 LAW 2: every road that can wait AWAITS the facts — the boot, the switch, the probe, the routes, both remote conversation starts, the tools install, the watch', waits.filter(([, k]) => !k).map(([n]) => n));
  const gen8 = read('src/server/agent-tool-generators.js'), body8 = gen8.slice(gen8.indexOf('const realOr = async'), gen8.indexOf('function rootRecovery()'));
  ok(body8.length > 500 && !/fs\.(statSync|readFileSync|realpathSync|existsSync|readdirSync)\(/.test(body8) && /if \(_rootRead\) return _rootRead;/.test(body8), 'B-1425: the root reader and the verdict hold NO synchronous file call, and the read is single-flight at its one door', body8.length);
  // r827: the hosts' status and uninstall await the facts; an UNKNOWN root's uninstall is refused BY NAME (never a half uninstall)
  waits.push(['a machine\'s agent-tools status / uninstall (hosts.js)', /async agentToolsStatus\(id\) \{\n\s*if \(typeof this\.rootFactsNow === 'function'\) await this\.rootFactsNow\(\);/.test(hosts8) && /async uninstallAgentTools\(id\) \{\n\s*if \(typeof this\.rootFactsNow === 'function'\) await this\.rootFactsNow\(\);/.test(hosts8)]);
  ok(waits[waits.length - 1][1], 'B-1425 r827: a machine\'s agent-tools status and uninstall await the facts too (the list of the roads that wait)');
  {
    const { HostManager: HM8 } = require(path.join(REPO, 'src/hosts.js'));
    const hm = new HM8({ dataDir: path.join(R8, 'hosts') }); let factsAsked = 0;
    hm.rootFactsNow = async () => { factsAsked++; }; hm.ownerWriteRefusal = () => ({ kind: 'unknown', why: 'the checkout\'s .git did not answer in 2 s', line: 'x' });
    let e8 = null; try { await hm.uninstallAgentTools('h-none'); } catch (e) { e8 = e; }
    console.log(`  (an unknown root's uninstall: ${e8 ? `${e8.code} «${e8.message}»` : 'not refused'}; the facts asked ${factsAsked}×)`);
    ok(!!e8 && e8.code === 'root_unknown' && /were not removed: the checkout's \.git did not answer/.test(e8.message) && factsAsked === 1, 'B-1425 r827: an UNKNOWN root\'s uninstall is refused BY NAME before anything is removed (the facts awaited first)', e8 && e8.message);
  }
  // r827: the journal's once-a-boot line is never spent on «not judged yet»: a pending refusal is not said, the real one is, once
  {
    let rel2 = null; const held2 = new Promise((r) => { rel2 = r; });
    const G2 = Gm.create({ rootDir: R8, port: 0 });   // (its create's own [tools] lines come before the journal is listened to)
    G2._setRootFs({ realpath: async (q) => q, stat: async () => { await held2; throw Object.assign(new Error('no .git'), { code: 'ENOENT' }); }, readFile: async () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }); } });
    G2._setRootReadMs(5000);
    const say = []; const log0 = console.log; console.log = (...a) => { say.push(a.join(' ')); };
    let pend = null, real = null, again = null;
    try {
      pend = G2.refuseOwnerWrite();   // the read just started: «not judged yet»
      const saidPend = say.length;
      rel2();
      for (let i = 0; i < 500 && G2.rootReadStats().ended < 1; i++) await new Promise((r) => setImmediate(r));
      real = G2.refuseOwnerWrite(); again = G2.refuseOwnerWrite();
      console.log = log0;
      console.log(`  (the latch: pending ${pend && pend.pending ? 'refusal (pending)' : JSON.stringify(pend)} said ${saidPend}×; then the landed verdict ${real ? real.kind : 'ok'} — the journal said ${say.length} line(s): ${say.map((x) => '«' + x.slice(0, 80) + '»').join(' ')})`);
      ok(!!pend && pend.pending === true && saidPend === 0 && (!real || say.length === 1), 'B-1425 r827: a «not judged yet» refusal is never journaled (the once-a-boot line is kept for the real verdict, said once)', { pend, real, say });
    } finally { console.log = log0; }
  }
  // the BOOT WITH FACTS THAT NEVER COME: the watch's sync over a held read — the owner notice names the late fact, the re-judge finds
  // the read still out (no second read, no pile of timers), and nothing is registered
  {
    let rel3 = null; const held3 = new Promise((r) => { rel3 = r; });
    const G3 = Gm.create({ rootDir: R8, port: 0 });
    G3._setRootFs({ realpath: async (q) => q, stat: async () => { await held3; throw Object.assign(new Error('no .git'), { code: 'ENOENT' }); }, readFile: async () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }); } });
    G3._setRootReadMs(30);
    const notes = [], timers = [];
    const log0 = console.log; console.log = () => { };
    const W3 = HW.create({ dataDir: path.join(R8, 'w3'), ensureAgentHooks: G3.ensureAgentHooks, rootRecovery: G3.rootRecovery, ownerWriteRefusal: G3.ownerWriteRefusal, factsNow: G3.rootFactsNow, serverNotice: (key, text) => { notes.push(`${key}: ${text}`); return 1; }, setTimer: (fn) => { timers.push(fn); return { unref() { } }; }, log: () => { } });
    fs.mkdirSync(path.join(R8, 'w3'), { recursive: true });
    try {
      await G3.rootFactsNow();   // the boot's await: past the deadline, the named late fact
      const tSync = Date.now();
      const r1 = await W3.sync();   // B-ddf3 unit 2: the watch's sync answers at the registration's landing (a Promise)
      const t1 = timers.length;
      timers.shift()();   // the first re-judge: it awaits the facts (still out), then syncs again
      // r3301 (B-3dbd unit 2): the re-judge first AWAITS the root facts (a road through the thread pool), then syncs, then arms —
      // fifty loop turns were a clock on a loaded machine. The wait ends on the FACT (its timer armed), bounded by a wall time read
      // from this run: twenty of the first sync's own time, at least 2 s
      const syncMs = Date.now() - tSync, rejudgeBound = Math.max(2000, 20 * syncMs);
      for (const tEnd = Date.now() + rejudgeBound; timers.length < 1 && Date.now() < tEnd;) await new Promise((r) => setTimeout(r, 5));
      const st3 = G3.rootReadStats();
      console.log = log0;
      console.log(`  (the boot with facts that never come: the sync ${r1 && r1.refused ? r1.refused.kind : JSON.stringify(r1)}; notices ${JSON.stringify(notes.map((x) => x.slice(0, 120)))}; timers armed ${t1} then ${timers.length} (waited at most ${rejudgeBound} ms, the first sync ${syncMs} ms); reads ${JSON.stringify(st3)})`);
      ok(!!r1 && r1.skipped === true && r1.refused && r1.refused.kind === 'unknown' && notes.length === 1 && /did not answer in/.test(notes[0]) && t1 === 1 && timers.length === 1 && st3.started === 1 && st3.inFlight === true,
        'B-1425 r827: a BOOT whose facts never come registers nothing, posts ONE owner notice naming the late fact, and its re-judge (one timer at a time) starts NO second read', { r1, notes, t1, timers: timers.length, st3 });
    } finally { console.log = log0; rel3(); }
  }
  // r827 THE MUST — the person's CLI index at listen. Its role is fixed for the WHOLE run from the owner verdict it is handed
  // (src/server/local-index.js: `owner.kind` ⇒ a throwaway, placed under the hub's own root, the person's CLI not installed)
  {
    const LIsrc = read('src/server/local-index.js');
    ok(/const role = throwaway \? \(typeof throwaway === 'string' \? throwaway : 'tmp'\) : owner && owner\.kind \? String\(owner\.kind\) : false;/.test(LIsrc),
      'B-1425 r827: the index takes ANY owner kind as its role for the run (the rule the scene below reads)');
    waits.push(['the person\'s CLI index at listen (server.js)', /\n  rootFactsNow\(\)\.then\(\(\) => \{ try \{ require\('\.\/src\/server\/local-index\.js'\)\.configure\(\{[^\n]*owner: \(\(\) => \{ try \{ return ownerWriteRefusal\(\); \}/.test(srv8)]);
    ok(waits[waits.length - 1][1], 'B-1425 r827: the index\'s configure at listen is among the roads that WAIT (rootFactsNow first, then the owner verdict)');
    let rel9 = null; const held9 = new Promise((r) => { rel9 = r; });
    const G9 = Gm.create({ rootDir: R8, port: 0 });
    G9._setRootFs({ realpath: async (q) => q, stat: async () => { await held9; throw Object.assign(new Error('no .git'), { code: 'ENOENT' }); }, readFile: async () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }); } });
    G9._setRootReadMs(5000);
    const roleOf = (owner) => (owner && owner.kind ? String(owner.kind) : false);   // the index's own rule, as pinned above
    // THE SCENE (r827): no live conversation, the listen fires before the first read lands — THE RELEASE'S ROAD reads the verdict
    // synchronously there: RED — «not judged yet» would be the index's role for the whole run
    G9.rootVerdict();   // the boot's first read is out (rootFactsNow at the top of the boot)
    const sync9 = G9.ownerWriteRefusal();
    // THE CURE'S ROAD: the listen awaits the facts, then reads the verdict
    let settled9 = null; const p9 = G9.rootFactsNow().then(() => { settled9 = G9.ownerWriteRefusal(); return settled9; });
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    const beforeLand = settled9;
    rel9();
    const landed9 = await p9;
    console.log(`  (r827's scene, the first read held: the release's synchronous read at listen ⇒ ${JSON.stringify(sync9 && { kind: sync9.kind, pending: !!sync9.pending })} — the index's role would be «${roleOf(sync9)}» for the run; the waiting road while held: ${beforeLand === null ? 'not answered yet' : JSON.stringify(beforeLand)}; once landed: ${landed9 ? `${landed9.kind}${landed9.pending ? ' (pending)' : ''}` : 'no refusal (a checkout)'})`);
    ok(!!sync9 && sync9.kind === 'unknown' && sync9.pending === true && roleOf(sync9) === 'unknown', 'B-1425 r827 RED (the release\'s road): the synchronous read at listen, the first read not landed, hands the index «not judged yet» — its role would be «unknown» for the whole run', sync9);
    ok(beforeLand === null && (!landed9 || (landed9.pending !== true && landed9.kind !== 'unknown')), 'B-1425 r827: the cure\'s road does not answer while the first read is held, and once it lands the index is handed the LANDED verdict — never «not judged yet»', { beforeLand, landed9 });
    // a read that never answers inside the bound: the index gets the NAMED late fact (a real unknown), never «not yet»
    const G10 = Gm.create({ rootDir: R8, port: 0 });
    G10._setRootFs({ realpath: async (q) => q, stat: () => new Promise(() => { }), readFile: async () => { throw new Error('no'); } });
    G10._setRootReadMs(30);
    const late10 = await G10.rootFactsNow().then(() => G10.ownerWriteRefusal());
    console.log(`  (a first read that never answers: the index is handed ${JSON.stringify(late10 && { kind: late10.kind, pending: !!late10.pending, why: String(late10.why).slice(0, 90) })})`);
    ok(!!late10 && late10.kind === 'unknown' && late10.pending !== true && /did not answer in/.test(late10.why), 'B-1425 r827: a first read past the bound hands the index the NAMED late fact (a real unknown, said) — never «not judged yet»', late10);
    // r872 (the gate's box zone found it: the deadline timer and Date.now() can differ by a millisecond, and the cache then answered
    // «not judged yet» right after a LATE answer). The skew PLANTED: the deadline raised after the late answer, so the clock alone says
    // «not past it yet» — the verdict must stay the named late fact (the read is marked late when a waiting caller was told so)
    G10._setRootReadMs(60000);
    const skew10 = G10.ownerWriteRefusal();
    console.log(`  (the planted skew — the clock says the read is not past its bound, a caller was already told late: ${JSON.stringify(skew10 && { kind: skew10.kind, pending: !!skew10.pending })})`);
    ok(!!skew10 && skew10.kind === 'unknown' && skew10.pending !== true && /did not answer in/.test(skew10.why), 'B-1425 r872: once a waiting caller was told LATE, the cache says late too — never «not judged yet» after it, whatever the clock reads (a flag, not a second clock read)', skew10);
  }
  // r872 (narrow round wudero5nj, THE MUST): a PIN THAT READS THE PARSED TREE, NOT THE TEXT. The cure's first form put its note as a
  // `//` comment in the MIDDLE of the listen step's last line: every call after it on that line became a comment — the boot timers,
  // bootRestored, the first sessions sweep, bootPhase.arm — and every text pin stayed green (the text was all there). server.js is
  // parsed (the tree's own parser, acorn); the listen step's turns are found as code and their CALLS read
  {
    const acorn = require('acorn');
    const nameOfC = (c) => (c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' ? c.property.name : null);
    const kids = (n) => Object.keys(n).flatMap((k) => { const v = n[k]; return Array.isArray(v) ? v.filter((x) => x && typeof x.type === 'string') : v && typeof v.type === 'string' ? [v] : []; });
    const isTurn = (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && nameOfC(n.callee) === 'turn' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'hub' && !!n.arguments[0] && /Function/.test(n.arguments[0].type);
    const callsIn = (node, skip) => { const out = []; (function walk(n) { if (n === skip) return; if (n.type === 'CallExpression') { out.push(nameOfC(n.callee)); for (const x of n.arguments) if (x.type === 'Identifier') out.push('→' + x.name); } kids(n).forEach(walk); })(node); return out; };
    const turnsOf = (src) => {
      const ast = acorn.parse(src.replace(/^#!.*/, ''), { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
      let found = null;
      (function walk(n) {
        if (found) return;
        if (isTurn(n)) { let inner = null; (function w2(m) { if (inner) return; if (m !== n && isTurn(m)) { inner = m; return; } kids(m).forEach(w2); })(n.arguments[0].body); if (inner && callsIn(n.arguments[0].body, inner).includes('restoreSessions')) { found = { restore: callsIn(n.arguments[0].body, inner), last: callsIn(inner.arguments[0].body, null), lastNode: inner.arguments[0].body }; return; } }
        kids(n).forEach(walk);
      })(ast);
      return found;
    };
    const LAST = ['configure', 'initAfterListen', 'afterListen', 'bootEngineDistribution', 'bootRestored', 'warmSessions', '→bootSessionsIndexed', 'arm'];
    const T = turnsOf(srv8), lostT = T ? LAST.filter((k) => !T.last.includes(k)) : LAST;
    console.log(`  (the parsed listen step: the restore turn calls ${T ? T.restore.filter(Boolean).join(', ') : '—'}; the LAST turn calls ${T ? T.last.filter(Boolean).join(', ') : '—'})`);
    // r980 (the narrow round wd0silov9's small): EACH of those calls is made ONCE, and the three boot timers keep their delays
    const onceT = T ? LAST.map((k) => [k, T.last.filter((x) => x === k).length]) : [];
    const timersT = []; if (T) (function walk(n) { if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'setTimeout' && n.arguments[0] && /Function/.test(n.arguments[0].type) && n.arguments[1] && n.arguments[1].type === 'Literal') { const inner = n.arguments[0].body.type === 'CallExpression' ? nameOfC(n.arguments[0].body.callee) : null; timersT.push(`${inner}@${n.arguments[1].value}`); } kids(n).forEach(walk); })(T.lastNode);
    console.log(`  (the last turn's calls, each counted: ${onceT.map(([k, c]) => `${k}×${c}`).join(' ')}; its timers: ${timersT.join(', ') || 'none'})`);
    ok(onceT.length === LAST.length && onceT.every(([, c]) => c === 1) && ['initAfterListen@1500', 'afterListen@2500', 'bootEngineDistribution@4000'].every((x) => timersT.includes(x)),
      'B-1425 r980: each call of the last turn is made ONCE, and the three boot timers keep the release\'s delays (jobs 1.5 s, apps 2.5 s, the engine distribution 4 s)', { onceT, timersT });
    ok(!!T && T.restore.includes('restoreSessions') && !lostT.length, 'B-1425 r872: the listen step\'s LAST turn CALLS, as code (the parsed tree, never the text), the index\'s configure, the three boot timers\' callees, bootRestored, the first sessions sweep (bootSessionsIndexed at its end) and bootPhase.arm — and the turn before it calls restoreSessions', lostT);
    // RED CONTROL: the cure's first note put back where it stood (mid-line, after the index wait's catch) — the calls after it are LOST, by name
    const anchorT = "}).catch((e) => console.warn('[local-index] not started: ' + (e && e.message)));";
    const badT = srv8.replace(anchorT, anchorT + " // B-1425 (r827): the index WAITS for the root's facts (off the loop, ≤ 2 s; landed already ⇒ this very turn) — «not judged yet» is never its role for the run, a real unknown (a read error, the named late fact) is ·");   // stale-pins: kept (the OLD note, rebuilt for the pin's red control)
    const TB = badT !== srv8 ? turnsOf(badT) : null, lostB = TB ? LAST.filter((k) => !TB.last.includes(k)) : [];
    console.log(`  (RED: the first form's mid-line note put back — the last turn LOSES ${lostB.join(', ') || 'nothing'})`);
    ok(!!TB && lostB.join(',') === 'initAfterListen,afterListen,bootEngineDistribution,bootRestored,warmSessions,→bootSessionsIndexed,arm', 'B-1425 r872 RED CONTROL: the cure\'s first note put back mid-line turns the pin red BY THE NAME of each lost call (the three timers\' callees, bootRestored, the sessions sweep, bootPhase.arm) — the text pins stayed green over it', lostB);
  }
  // r993 THE ROLE FOLLOWS A LATER READ (主开发's ruling: no row — build it): a first read that came LATE handed the index «unknown»; when
  // a LATER read lands with the facts, the index (src/server/local-index.js, its one writer) is configured AGAIN with them, once per change
  {
    const LIm = require(path.join(REPO, 'src/server/local-index.js'));
    const roleOfLI = (o) => (o && o.kind ? String(o.kind) : false);
    const scene11 = async (subscribe) => {
      let rel = null; const held = new Promise((r) => { rel = r; });
      const G = Gm.create({ rootDir: R8, port: 0 });
      // the checkout's facts land OUTSIDE any temp folder (a person's checkout), after the first read was told late
      G._setRootFs({ realpath: async (q) => (q === R8 ? '/home/u/vibespace-standin' : q), stat: async () => { await held; throw Object.assign(new Error('no .git'), { code: 'ENOENT' }); }, readFile: async () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }); } });
      G._setRootReadMs(30);
      await G.rootFactsNow();   // the first read LATE: the named late fact
      const first = G.ownerWriteRefusal(), lines = [];
      const logL = { log: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)), error: () => { } };
      LIm._reset();
      LIm.configure({ rootDir: R8, sessions: () => new Map(), log: logL, home: path.join(R8, 'li-home'), mountinfo: '', heartbeatMs: 3600000, install: false, owner: first, ...(subscribe ? { ownerNow: G.ownerWriteRefusal, onOwnerChange: G.onRootLanded } : {}) });
      await LIm.ready();
      const roleLate = LIm.hubFactsOf().throwaway;
      rel();   // the held read LANDS
      for (let i = 0; i < 500 && G.rootReadStats().ended < 1; i++) await new Promise((r) => setImmediate(r));
      await LIm.reconfigured(); await LIm.ready();
      const landed = G.ownerWriteRefusal(), roleAfter = LIm.hubFactsOf().throwaway;
      // a SECOND landed read with the same verdict: no second re-configure (once per change)
      const ttl0 = SR.ROOT_FACTS_TTL_MS; SR.ROOT_FACTS_TTL_MS = -1; try { G.rootVerdict(); } finally { SR.ROOT_FACTS_TTL_MS = ttl0; }
      for (let i = 0; i < 500 && G.rootReadStats().ended < 2; i++) await new Promise((r) => setImmediate(r));
      await LIm.reconfigured();
      const placedAgain = lines.filter((l) => /the index is placed again/.test(l)).length;
      LIm.stop(); LIm._reset();
      return { first: first && first.kind, roleLate, landed: landed ? landed.kind : null, roleAfter, placedAgain };
    };
    const red11 = await scene11(false), cure11 = await scene11(true);
    console.log(`  (a late first read, then a landing — RED (not told of the landing, r980's «it stays»): ${JSON.stringify(red11)}; THE CURE: ${JSON.stringify(cure11)})`);
    ok(red11.roleLate === 'unknown' && red11.roleAfter === 'unknown' && red11.landed !== 'unknown', 'B-1425 r993 RED (r980\'s behaviour): an index never told of the landing keeps «unknown» for the run though the read landed with the facts', red11);
    ok(cure11.roleLate === 'unknown' && cure11.roleAfter === roleOfLI(cure11.landed === null ? null : { kind: cure11.landed }) && cure11.roleAfter !== 'unknown' && cure11.placedAgain === 1, 'B-1425 r993: when a LATER read lands with the facts, the index is configured AGAIN with them and holds the LANDED role — once per change of the verdict (a second landing with the same verdict places nothing again)', cure11);
    const LIsrc2 = read('src/server/local-index.js');
    ok(/if \(!lastOpts \|\| shutDown\) return null;/.test(LIsrc2) && /stop: \(\) => \{ shutDown = true; return stop\(\); \}/.test(LIsrc2) && /reconfP = \(reconfP \|\| bootP \|\| Promise\.resolve\(\)\)\.then\(/.test(LIsrc2) && /ownerNow: ownerWriteRefusal, onOwnerChange: onRootLanded,/.test(srv8),
      'B-1425 r993: the re-configure is the index\'s own (after the boot in flight, the old place marked stopped), never after the hub\'s stop; server.js hands it the verdict and the landing');
  }
  clearInterval(keep8);
}


// ── B-ba47 shape H, 主开发 r1278 ── (1) RULE 3 ASKS THE ONE TEST — THE ROW EITHER WAY: over real layouts, the boot's runtime check
// (the update check's own verdict) is ARMED exactly when the one test says REAL, and never for a throwaway one: a linked worktree
// anywhere and a temp root handed a temp home are offline; a person's own clone under a temp root, run with their own home, is a
// real hub and asks (the incident's second half). RED at the tip before this move: there the check judged the place alone.
// (2) THE LAW: the owner's production hub — a clone, its own data folder, started by the service — is never judged throwaway by
// any input it can be handed: a temp variable at the disk's root, relative, above its checkout or holding its home; no home; a
// symlinked checkout; a .git that cannot be read (no answer is never «throwaway»); an env name a parent left.
{
  const TR = require(path.join(REPO, 'src/server/throwaway-root.js')), RB = require(path.join(REPO, 'src/server/runtime-boot.js'));
  const L = fs.mkdtempSync(path.join('/tmp', 'vs-srvroot-h-')); process.on('exit', () => { try { fs.chmodSync(path.join(L, 'locked'), 0o700); } catch { } try { fs.rmSync(L, { recursive: true, force: true }); } catch { } });
  const T = path.join(L, 'tmpA'), OUT = path.join(L, 'out'), PERSON = '/home/vs-srvroot-person-nonexistent';
  const mkClone = (d) => { fs.mkdirSync(path.join(d, '.git'), { recursive: true }); return d; };
  const mkWt = (d) => { const gd = path.join(L, 'common', '.git', 'worktrees', path.basename(d)); fs.mkdirSync(gd, { recursive: true }); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(gd, 'commondir'), '../..\n'); fs.writeFileSync(path.join(d, '.git'), `gitdir: ${gd}\n`); return d; };
  fs.mkdirSync(path.join(T, 'home'), { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  // a tree before r1278 has no tmpRootsOf: its own list is read instead, so its rows run and say by name where it differs
  const rootsOf = TR.tmpRootsOf || (() => TR.tmpRoots());
  const roots = rootsOf({ fixed: [T], tmpdir: '/' });   // THE TEMP ROOTS of this table: tmpA alone (the lane's own /tmp is «outside» here)
  const rows = [
    ['a linked worktree OUTSIDE every temp root, a person\'s home (a lane\'s hub never calls out)', mkWt(path.join(OUT, 'wt1')), PERSON, true],
    ['a linked worktree under a temp root, a temp home', mkWt(path.join(T, 'wt2')), path.join(T, 'home'), true],
    ['a scratch clone under a temp root, a temp home (a suite\'s hub)', mkClone(path.join(T, 'clone3')), path.join(T, 'home'), true],
    ['a person\'s CLONE under a temp root, their OWN home — a real hub: its update check works', mkClone(path.join(T, 'clone4')), PERSON, false],
    ['a person\'s clone outside every temp root', mkClone(path.join(OUT, 'clone5')), PERSON, false],
  ];
  for (const [what, root, home, want] of rows) {
    const j = TR.judge(root, home, { roots }), v = await RB.runtimeCheckArmed({ rootDir: root, env: {}, throwawayOf: (r) => TR.judge(r, home, { roots }).throwaway });
    ok(j.throwaway === want && v.armed === !want, `r1278 THE ROW EITHER WAY — ${what}: the one test ${j.throwaway ? 'THROWAWAY (' + j.rootVerdict.kind + ')' : 'REAL'}, the runtime check ${v.armed ? 'ARMED' : 'off'}`, { kind: j.rootVerdict.kind, armed: v.armed, why: v.why });
  }
  // (2) THE LAW: a production-shaped clone outside every temp root, each input it can be handed
  const PROD = mkClone(path.join(OUT, 'vibespace')), LINK = path.join(T, 'linked-checkout'); fs.symlinkSync(PROD, LINK);
  const locked = path.join(L, 'locked'), BAD = path.join(OUT, 'unreadable'); fs.mkdirSync(path.join(locked, 'gd'), { recursive: true }); fs.mkdirSync(BAD, { recursive: true });
  fs.writeFileSync(path.join(BAD, '.git'), `gitdir: ${path.join(locked, 'gd')}\n`); fs.chmodSync(locked, 0o000);
  const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
  const LAW = [
    ['a temp variable set to the disk\'s root (TMPDIR=/)', PROD, PERSON, { tmpdir: '/' }],
    ['a RELATIVE temp variable (TMPDIR=.) — never resolved to the hub\'s own folder', PROD, PERSON, { tmpdir: '.' }],
    ['a temp variable ABOVE the checkout (TMPDIR=its parent)', PROD, PERSON, { tmpdir: OUT }],
    ['a temp variable that HOLDS the home (TMPDIR=/home)', PROD, PERSON, { tmpdir: '/home' }],
    ['no home handed (HOME unset)', PROD, undefined, { tmpdir: OUT }],
    ['the disk\'s root as its home', PROD, '/', { tmpdir: OUT }],
    ['a SYMLINKED checkout: spelled under a temp root, it lies outside', LINK, PERSON, {}],
    ['a .git that cannot be read (no answer is never «throwaway»)', BAD, PERSON, { tmpdir: OUT }],
  ];
  for (const [what, root, home, o] of LAW) {
    const r = rootsOf({ fixed: [T], home, realpath: real, ...o }), j = TR.judge(root, home, { roots: r });
    ok(j.throwaway === false && !r.includes('/') && r.every((t) => t.startsWith('/')), `r1278 THE LAW — the production hub is never throwaway: ${what} ⇒ ${j.rootVerdict.kind}`, { roots: r, kind: j.rootVerdict.kind, why: j.rootVerdict.why });
  }
  { // an env name a parent left: the one test reads HOME, the temp variable and VIBESPACE_REAL_INSTALL alone — nothing else it is handed
    // through the BOOT's own verdict (r1952 (2): throwaway() answers the declared hub's root alone — a bare ask about another is refused)
    const child = execFileSync(process.execPath, ['-e', `const T = require(${JSON.stringify(path.join(REPO, 'src/server/throwaway-root.js'))}); T.rehomeAtBoot({ root: ${JSON.stringify(PROD)}, env: process.env }); process.stdout.write(String(T.throwaway(${JSON.stringify(PROD)})) + ' ' + String(T.throwaway('/nonexistent-vs-srvroot-other')))`],
      { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: PERSON, TMPDIR: '/', VIBESPACE_FORCE_AGENT_HOOKS: '1', VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_REAL_INSTALL: '0', VIBESPACE_API: 'http://127.0.0.1:1', NODE_ENV: 'test' } });
    ok(child === 'false false', 'r1278 THE LAW — env names a parent left (the hook switches, an override that is not «1», a conversation\'s address) make the production hub nothing but real, by the boot\'s own verdict; and another root is never judged (r1952 (2))', child);
  }
  const rf = fs.readFileSync(path.join(REPO, 'src/server/root-facts.js'), 'utf8');
  ok(!/['"`]data['"`]|dataDir/.test(rf), 'r1278 THE LAW — the one test reads the root\'s .git alone: no data folder (a slow or silent mount there answers nothing it asks)');
  // shape H on the root (主开发 r1597): the boot's read of the hub's own tree has ONE asker — every conversation's root is read by the
  // ORCH's own reader, off the loop (B-1425), never by this synchronous one
  const askers = [], RF_REQ = /require\(\s*['"](?:\.{1,2}\/)+(?:server\/)?root-facts(?:\.js)?['"]\s*\)/;
  const walkSrc = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) walkSrc(r); else if (/\.c?js$/.test(e.name) && RF_REQ.test(read(r))) askers.push(r); } };
  walkSrc('src'); if (/root-facts/.test(srv)) askers.push('server.js');
  ok(askers.join() === 'src/server/throwaway-root.js' && !/root-facts/.test(gen) && RF_REQ.test("const { readRootFacts } = require('./root-facts');") && !RF_REQ.test("require('./root-facts-x')"),
    'shape H on the root: only the boot\'s one test (src/server/throwaway-root.js) asks root-facts.js — the ORCH reads every conversation\'s root with its own asynchronous reader (B-1425)', askers);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

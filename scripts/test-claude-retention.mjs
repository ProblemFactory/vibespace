#!/usr/bin/env node
// TRANSCRIPT RETENTION (2.369.118, owner: "claude code 默认会删除旧对话…把默认值配成
// 100 年") — kept by NAME since 2.369.123 (docs/design-harness-settings.zh.md §8)
// and grown: Claude Code sweeps transcripts older than cleanupPeriodDays (its own
// default 30) at every start. `claude.transcriptRetentionDays` (default 36500) is
// now the claude table's cli-config ROW (src/harness-settings.js), written into
// ~/.claude/settings.json through the SHARED applier (src/harness-config.js:
// ensureCliConfig = the CAS writer) at boot + on change, and onto every other
// machine by the shipped register helper driven by ONE env, VIBESPACE_CLI_CONFIG
// (the base64 plan) — at install, at every ssh spawn, at every dial spawn.
// Scratch dirs only; the real HOME is never touched.
// Run: node scripts/test-claude-retention.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const root = scratch('claude-retention');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const { HARNESS_SETTINGS, buildConfigPlan } = require(path.join(repo, 'src/harness-settings.js'));
const { ensureCliConfig, encodePlan } = require(path.join(repo, 'src/harness-config.js'));
require(path.join(repo, 'src/server/agent-tool-generators.js')).create({ rootDir: root, port: 0 });
// the plan for ONE value of the retention row (the hooks ride the same file)
const planFor = (days, { hooks = true } = {}) => buildConfigPlan([{ harness: 'claude', table: HARNESS_SETTINGS.claude, files: { settings: { createIfMissing: false, ...(hooks ? { hooks: { events: HARNESS_SETTINGS.claude.rows.length ? ['SessionStart', 'UserPromptSubmit', 'Stop'] : [] } } : {}) } }, values: { transcriptRetentionDays: days } }]);
const applied = (r) => r.receipts.find((x) => x.key === 'transcriptRetentionDays');

console.log('§1 ensureCliConfig({plan}) on a scratch settings.json (never the real HOME)');
{
  const home = path.join(root, 'h1'); fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const f = path.join(home, '.claude', 'settings.json');
  fs.writeFileSync(f, JSON.stringify({ hooks: { Stop: [] }, permissions: { allow: ['Bash(ls:*)'] }, cleanupPeriodDays: 30 }, null, 2) + '\n');
  let r = ensureCliConfig({ plan: planFor(36500), home });
  let j = JSON.parse(fs.readFileSync(f, 'utf8'));
  ok('36500 days written, everything else untouched', applied(r).state === 'applied' && j.cleanupPeriodDays === 36500 && j.permissions.allow[0] === 'Bash(ls:*)' && Array.isArray(j.hooks.Stop), { r, j });
  r = ensureCliConfig({ plan: planFor(36500), home });
  ok('idempotent: the same value is not rewritten', applied(r).state === 'unchanged' && r.files[0].written === false, r);
  r = ensureCliConfig({ plan: planFor('90'), home });
  ok('a string setting value is coerced; a change is written', applied(r).state === 'applied' && JSON.parse(fs.readFileSync(f, 'utf8')).cleanupPeriodDays === 90, r);
  r = ensureCliConfig({ plan: planFor(0), home });
  ok("0 = leave the CLI's own value alone ('off': not in the plan, nothing written)", !applied(r) && planFor(0).files[0].set.length === 0 && JSON.parse(fs.readFileSync(f, 'utf8')).cleanupPeriodDays === 90, r);
  ok('a negative value clamps to 0 (off); unset / unreadable fall back to the default 36500 (the ONE home of the default)', planFor(-5).files[0].set.length === 0 && planFor(undefined).files[0].set[0].value === 36500 && planFor('x').files[0].set[0].value === 36500);
  fs.writeFileSync(f, '{ not json');
  r = ensureCliConfig({ plan: planFor(36500), home });
  ok('a hand-broken settings.json is refused by name, never overwritten', applied(r).state === 'refused' && /not valid JSON/.test(applied(r).reason) && fs.readFileSync(f, 'utf8') === '{ not json', r);
  fs.rmSync(f);
  r = ensureCliConfig({ plan: planFor(36500), home });
  ok('a missing settings.json is reported, not created (the CLI creates its own)', applied(r).state === 'missing' && /not found/.test(applied(r).reason) && !fs.existsSync(f), r);
}

const helper = path.join(root, 'data', 'bin', 'vibespace-hook-register.mjs');
const run = (args, env, home) => execFileSync(process.execPath, [helper, ...args], { env: { ...process.env, HOME: home, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const b64 = (days) => encodePlan(planFor(days));

console.log('§2 the shipped register helper carries VIBESPACE_CLI_CONFIG to a remote HOME');
{
  ok('the helper is generated by create()', fs.existsSync(helper));
  const home = path.join(root, 'h2');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const sf = path.join(home, '.claude', 'settings.json');
  fs.writeFileSync(sf, JSON.stringify({ cleanupPeriodDays: 30, permissions: { allow: ['Read'] } }, null, 2));
  let out = run([], { VIBESPACE_CLI_CONFIG: b64(36500) }, home);
  let j = JSON.parse(fs.readFileSync(sf, 'utf8'));
  ok('install with the env: hooks registered AND cleanupPeriodDays lifted to 36500, permissions untouched', j.cleanupPeriodDays === 36500 && j.hooks && Array.isArray(j.hooks.Stop) && j.hooks.Stop[0].hooks[0].command.includes('vibespace-hook.mjs') && j.permissions.allow[0] === 'Read', j);
  ok('…and prints a CFG receipt line for the managed key', /^CFG\|claude\|transcriptRetentionDays\|applied\|/m.test(out), out);
  out = run([], { VIBESPACE_CLI_CONFIG: b64(36500) }, home);
  ok('re-install is idempotent (receipt unchanged)', JSON.parse(fs.readFileSync(sf, 'utf8')).cleanupPeriodDays === 36500 && /\|unchanged\|/.test(out));
  run([], { VIBESPACE_CLI_CONFIG: b64(0) }, home);
  ok('env with the setting OFF leaves the value alone', JSON.parse(fs.readFileSync(sf, 'utf8')).cleanupPeriodDays === 36500);
  fs.writeFileSync(sf, JSON.stringify({ ...JSON.parse(fs.readFileSync(sf, 'utf8')), cleanupPeriodDays: 30 }, null, 2));
  run([], {}, home);
  ok('no env (an older server): the embedded hooks-only DEFAULT_PLAN registers hooks and never touches the value', JSON.parse(fs.readFileSync(sf, 'utf8')).cleanupPeriodDays === 30 && Array.isArray(JSON.parse(fs.readFileSync(sf, 'utf8')).hooks.Stop));
  run(['--uninstall'], { VIBESPACE_CLI_CONFIG: b64(36500) }, home);
  j = JSON.parse(fs.readFileSync(sf, 'utf8'));
  ok('--uninstall strips only our hook entries; a managed key is never touched by an uninstall', !(j.hooks.Stop && j.hooks.Stop.length) && j.cleanupPeriodDays === 30, j);
  const codexHooks = path.join(home, '.codex', 'hooks.json');
  ok('the codex hooks file never receives cleanupPeriodDays (a claude row)', !fs.existsSync(codexHooks) || !('cleanupPeriodDays' in JSON.parse(fs.readFileSync(codexHooks, 'utf8'))));
  // the codex config.toml row rides the SAME env/helper (D4: the TOML writer)
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  const cf = path.join(home, '.codex', 'config.toml');
  fs.writeFileSync(cf, '# mine\nmodel = "x"\n\n[history]\npersistence = "none" # off\n');
  const full = encodePlan(buildConfigPlan([{ harness: 'codex', table: HARNESS_SETTINGS.codex, files: { config: { createIfMissing: true } }, values: { historyPersistence: 'save-all' } }]));
  out = run([], { VIBESPACE_CLI_CONFIG: full }, home);
  ok('codex [history] persistence rewritten in place, comments preserved, receipt applied', fs.readFileSync(cf, 'utf8') === '# mine\nmodel = "x"\n\n[history]\npersistence = "save-all" # off\n' && /CFG\|codex\|historyPersistence\|applied\|/.test(out), fs.readFileSync(cf, 'utf8'));
  // the dotfiles pattern THROUGH THE HELPER (2026-09-21): a symlinked settings.json stays a symlink, the target carries the key, its mode survives
  const dot = path.join(home, 'dotfiles'); fs.mkdirSync(dot, { recursive: true });
  const target = path.join(dot, 'claude.json');
  fs.writeFileSync(target, JSON.stringify({ cleanupPeriodDays: 30 }, null, 2)); fs.chmodSync(target, 0o600);
  fs.rmSync(sf); fs.symlinkSync(target, sf);
  out = run([], { VIBESPACE_CLI_CONFIG: b64(36500) }, home);
  const tj = JSON.parse(fs.readFileSync(target, 'utf8'));
  ok('a symlinked ~/.claude/settings.json is written THROUGH by the helper: still a symlink, the dotfile target carries 36500 + our hooks, 0600 kept', fs.lstatSync(sf).isSymbolicLink() && tj.cleanupPeriodDays === 36500 && Array.isArray(tj.hooks && tj.hooks.Stop) && (fs.statSync(target).mode & 0o777) === 0o600 && /\|applied\|/.test(out), { out, tj });
  // a plan whose rel escapes HOME is dropped by decodePlan: the helper falls back to its hooks-only DEFAULT_PLAN, nothing lands outside HOME
  const escaped = encodePlan({ v: 1, files: [{ harness: 'zed', id: 'cfg', rel: ['..', 'esc-outside', 'pwned.json'], format: 'json', createIfMissing: true, set: [{ key: 'k', path: ['a'], value: 'x' }] }] });
  out = run([], { VIBESPACE_CLI_CONFIG: escaped }, home);
  ok('a rel with `..` never reaches the applier through the env: no CFG|zed receipt, no file outside HOME', !/CFG\|zed\|/.test(out) && !fs.existsSync(path.join(root, 'esc-outside')) && !fs.existsSync(path.join(home, '..', 'esc-outside', 'pwned.json')), out);
}

console.log('§3 --status is READ-ONLY: receipts printed, file bytes + mtime unchanged');
{
  const home = path.join(root, 'h3');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const sf = path.join(home, '.claude', 'settings.json');
  fs.writeFileSync(sf, '{\n  "cleanupPeriodDays": 30\n}\n');
  const before = fs.readFileSync(sf, 'utf8'), mtime = fs.statSync(sf).mtimeMs;
  const out = run(['--status'], { VIBESPACE_CLI_CONFIG: b64(36500) }, home);
  const line = out.split('\n').find((l) => l.startsWith('CFG|claude|transcriptRetentionDays|'));
  ok('prints CFG|claude|transcriptRetentionDays|differs|30|36500', line && line.startsWith('CFG|claude|transcriptRetentionDays|differs|') && decodeURIComponent(line.split('|')[4]) === '30' && decodeURIComponent(line.split('|')[5]) === '36500', out);
  ok('the file is byte-identical and its mtime unchanged', fs.readFileSync(sf, 'utf8') === before && fs.statSync(sf).mtimeMs === mtime);
  fs.rmSync(sf);
  ok('a missing file reads as missing', /\|missing\|/.test(run(['--status'], { VIBESPACE_CLI_CONFIG: b64(36500) }, home)));
}

console.log('§4 the helper embeds the SHARED applier from the module file text and parses');
{
  const text = fs.readFileSync(helper, 'utf8');
  const applier = read('src/harness-config.js');
  ok('the applier source is embedded verbatim (file text, not Function.toString)', text.includes(applier));
  ok('the helper is ESM with createRequire (require is a real binding, not a free identifier)', /^import \{ createRequire \} from 'module';$/m.test(text) && /const require = createRequire\(import\.meta\.url\)/.test(text));
  const chk = spawnSync(process.execPath, ['--check', helper], { encoding: 'utf8' });
  ok('node --check passes on the generated helper', chk.status === 0, chk.stderr);
  ok('the helper knows the plan env by NAME (the grep gate hosts.agentToolsStatus relies on)', text.includes('VIBESPACE_CLI_CONFIG'));
}

console.log('§5 wiring pins (the 2.355.0 lesson: a pure fix without its call site is dead)');
{
  const srv = read('server.js'), hosts = read('src/hosts.js'), wsc = read('src/ws-create.js'), sync = read('src/server/harness-config-sync.js');
  ok('the claude table declares transcriptRetentionDays as a cli-config row (number, default 36500 → cleanupPeriodDays, off 0)', (() => { const r = HARNESS_SETTINGS.claude.rows.find((x) => x.key === 'transcriptRetentionDays'); return r && r.type === 'number' && r.default === 36500 && r.apply.kind === 'cli-config' && r.apply.path.join('.') === 'cleanupPeriodDays' && r.apply.off === 0 && r.apply.onUninstall === 'keep'; })());
  ok('server.js syncs the plan at boot (skipped under VIBESPACE_SKIP_AGENT_HOOKS, the worktree-smoke guard)', /if \(!process\.env\.VIBESPACE_SKIP_AGENT_HOOKS\) harnessConfig\.syncCliConfig\(\{ reason: 'boot' \}\);/.test(srv));
  ok('…and the sync itself honours hookRegistrationSafe() (a /tmp server never writes the real HOME)', /if \(!hookRegistrationSafe\(\)\) \{ log\(`\[cli-config\] skipped/.test(sync));
  ok('server.js re-syncs on a settings write through the ONE diff hook', /harnessConfig\.onSettingsWrite\(next, prev\);/.test(srv) && /cliConfigKeys\(\)\.some\(\(k\) => n\[k\] !== p\[k\]\)\) syncCliConfig/.test(sync));
  ok('server.js exports no literal-key retention reader any more (claudeKeepDays gone)', !/claudeKeepDays|ensureClaudeRetention|syncClaudeRetention/.test(srv));
  ok('site 1: hosts.installAgentTools sends VIBESPACE_CLI_CONFIG to the register helper', /VIBESPACE_CLI_CONFIG=\$\{this\._cliConfigPlanB64\(\)\} "\$VS_NODE" "\$HOME\/\.vibespace\/bin\/vibespace-hook-register\.mjs" 2>\/dev\/null; echo VS-INSTALLED/.test(hosts) && /hosts\.cliConfigPlanB64 = cliConfigPlanB64/.test(srv));
  ok('site 2: the ssh per-spawn prelude sends the same env (a spawned-into host gets the keys too)', /VIBESPACE_CLI_CONFIG=\$\{cliConfigPlanB64\(\)\} "\$VS_NODE" "\$HOME\/\.vibespace\/bin\/vibespace-hook-register\.mjs"/.test(wsc));
  ok('site 3: the dial run-cmd carries it in the daemon env merge (no new op)', /vibespace-hook-register\.mjs" 2>\/dev\/null \|\| true`\],\s*(?:\/\/[^\n]*\n\s*)*\{ env: \{ VIBESPACE_CLI_CONFIG: cliConfigPlanB64\(\) \}, timeoutMs: 12000 \}/.test(wsc));
  ok('hosts.agentToolsStatus asks --status ONLY behind the grep gate on the env NAME', /if grep -q VIBESPACE_CLI_CONFIG "\$HOME\/\.vibespace\/bin\/vibespace-hook-register\.mjs" 2>\/dev\/null; then/.test(hosts) && /vibespace-hook-register\.mjs" --status 2>\/dev\/null/.test(hosts) && /echo "CFG\|\*\|\*\|unknown"/.test(hosts));
  // the retired env is gone from every CODE file (docs/changelog keep the history)
  const tracked = execFileSync('git', ['ls-files', 'server.js', 'src', 'scripts', 'data/bin', 'public/index.html'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
  const stale = tracked.filter((f) => /\.(js|mjs|cjs|sh|html)$/.test(f) && f !== 'scripts/test-claude-retention.mjs' && read(f).includes('VIBESPACE_CLAUDE_KEEP_DAYS'));
  ok(`VIBESPACE_CLAUDE_KEEP_DAYS is gone from every tracked code file (${tracked.length} scanned)`, stale.length === 0, stale);
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

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
import { scratch, scratchDir } from './scratch.mjs';
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

// ════════════════════════════════════════════════════════════════════════════
// lane hooks-create (2026-10-01, a fleet user whose agents never learned the tools: the CLI never wrote
// ~/.claude/settings.json, so VibeSpace's hooks were never registered). Kept in THIS suite by the coordinator's rule —
// the brief named test-harness-config / test-agent-hooks, which do not exist; this is the suite that already drives
// the applier (src/harness-config.js) and the generator (ensureAgentHooks) on a scratch HOME. Every write below lands
// under /tmp/vs-hkc-<pid>; the owner's real CLI config is HASHED before §6 and after §9 and must be byte-identical.
// ════════════════════════════════════════════════════════════════════════════
const os = (await import('node:os')).default;
const crypto = (await import('node:crypto')).default;
const HKC = scratchDir('hkc');
const ENV_HOME = process.env.HOME;
const OWNER_HOME = os.homedir(); // 2.369.200 integration: the home through $HOME only (test-architecture §68, lane profile-lock-roll) — the product's own reach past a pinned HOME is §68's src census
const OWNER_FILES = [...new Set([OWNER_HOME, ENV_HOME])].flatMap((h) => ['.claude/settings.json', '.codex/hooks.json', '.codex/config.toml'].map((r) => path.join(h, r)));
const fp = (f) => { try { const b = fs.readFileSync(f); return crypto.createHash('sha256').update(b).digest('hex') + ':' + fs.statSync(f).mtimeMs; } catch { return 'absent'; } };
const ownerBefore = OWNER_FILES.map(fp);
const ownerDirsBefore = [...new Set([OWNER_HOME, ENV_HOME])].map((h) => ['.claude', '.codex'].map((d) => fs.existsSync(path.join(h, d))).join(','));
const HC = require(path.join(repo, 'src/harness-config.js'));
const modeOf = (f) => fs.statSync(f).mode & 0o777;
const mkHome = (name, dirs = []) => { const h = path.join(HKC, name); fs.mkdirSync(h, { recursive: true }); for (const d of dirs) fs.mkdirSync(path.join(h, d), { recursive: true }); return h; };
const regHooks = (root) => HC.registerHookEntries(root, ['SessionStart', 'UserPromptSubmit', 'Stop'], '/usr/bin/node /x/vibespace-hook.mjs');

console.log("§6 THE CREATE RULE — createIfMissing ∈ {false, 'dir-exists'}: the FILE when its directory exists, never the directory");
// the judge, run on the real module AND on patched copies (the controls)
function ruleHolds(M, base) {
  const h1 = path.join(base, 'nodir'); fs.mkdirSync(h1, { recursive: true });
  const f1 = path.join(h1, '.claude', 'settings.json');
  let e1 = null; try { M.writeJsonManaged(f1, { createIfMissing: 'dir-exists' }, regHooks); } catch (e) { e1 = e; }
  const noDir = !!e1 && e1.missing === 'no-dir' && /the CLI has not run on this machine; nothing is created/.test(e1.message) && !fs.existsSync(path.join(h1, '.claude'));
  const h2 = path.join(base, 'withdir'); fs.mkdirSync(path.join(h2, '.claude'), { recursive: true });
  const f2 = path.join(h2, '.claude', 'settings.json');
  let w2 = null; try { w2 = M.writeJsonManaged(f2, { createIfMissing: 'dir-exists' }, regHooks); } catch { w2 = null; }
  const created = w2 === 'created' && fs.existsSync(f2) && (fs.statSync(f2).mode & 0o777) === 0o600 && JSON.parse(fs.readFileSync(f2, 'utf8')).hooks.Stop[0].hooks[0].command.includes('vibespace-hook.mjs');
  return { noDir, created };
}
{
  ok("the rule's closed set: false | 'dir-exists'; the legacy true reads as 'dir-exists'; anything else is false (never a guess that creates)",
    JSON.stringify(HC.CREATE_RULES) === '[false,"dir-exists"]' && HC.createRule(true) === 'dir-exists' && HC.createRule('dir-exists') === 'dir-exists' && HC.createRule(false) === false && HC.createRule('yes') === false && HC.createRule(undefined) === false && HC.createRule(1) === false);
  const real = ruleHolds(HC, path.join(HKC, 'rule-real'));
  ok('dir missing ⇒ refused by name (missing: no-dir, "the CLI has not run on this machine; nothing is created"), the directory NOT created', real.noDir, real);
  ok('dir present + file missing ⇒ CREATED (the writer answers "created"), mode 0600, our hooks registered', real.created, real);
  const h = mkHome('rule-more', ['.claude']);
  const f = path.join(h, '.claude', 'settings.json');
  fs.writeFileSync(f, JSON.stringify({ permissions: { allow: ['Read'] } }, null, 2) + '\n'); fs.chmodSync(f, 0o644);
  const w1 = HC.writeJsonManaged(f, { createIfMissing: 'dir-exists' }, regHooks);
  const w2 = HC.writeJsonManaged(f, { createIfMissing: 'dir-exists' }, regHooks);
  ok('file present ⇒ the CAS path: written once (true, never "created"), then unchanged (false); the user key kept, its 0644 mode kept', w1 === true && w2 === false && JSON.parse(fs.readFileSync(f, 'utf8')).permissions.allow[0] === 'Read' && modeOf(f) === 0o644, { w1, w2, mode: modeOf(f) });
  const dot = path.join(h, 'dotfiles'); fs.mkdirSync(dot);
  const tgt = path.join(dot, 'claude.json'); fs.writeFileSync(tgt, '{}\n'); fs.chmodSync(tgt, 0o600);
  fs.rmSync(f); fs.symlinkSync(tgt, f);
  const w3 = HC.writeJsonManaged(f, { createIfMissing: 'dir-exists' }, regHooks);
  ok('a symlinked settings.json is written THROUGH (still a link, the target carries our hooks, 0600 kept) — never "created" over the link', w3 === true && fs.lstatSync(f).isSymbolicLink() && Array.isArray(JSON.parse(fs.readFileSync(tgt, 'utf8')).hooks.Stop) && modeOf(tgt) === 0o600, w3);
  const h4 = mkHome('rule-notours', ['.claude']);
  let e4 = null; try { HC.writeJsonManaged(path.join(h4, '.claude', 'settings.json'), { createIfMissing: false }, regHooks); } catch (e) { e4 = e; }
  ok('rule false + dir present ⇒ refused (missing: not-ours), nothing created', !!e4 && e4.missing === 'not-ours' && !fs.existsSync(path.join(h4, '.claude', 'settings.json')), e4 && e4.message);
  const h5 = mkHome('rule-noop', ['.claude']);
  const w5 = HC.writeJsonManaged(path.join(h5, '.claude', 'settings.json'), { createIfMissing: 'dir-exists' }, () => false);
  ok('a no-op mutate on a missing file creates nothing (false, no file)', w5 === false && !fs.existsSync(path.join(h5, '.claude', 'settings.json')));
  // THE GAP: the CLI writes its own settings.json between our re-read and our create — never clobbered, merged on a re-read
  const h6 = mkHome('rule-race', ['.claude']);
  const f6 = path.join(h6, '.claude', 'settings.json');
  const realLink = fs.linkSync; let raced = 0;
  fs.linkSync = function (a, b) { if (!raced++ && b === f6) fs.writeFileSync(f6, JSON.stringify({ theme: 'cli-wrote-this' }) + '\n'); return realLink.apply(fs, arguments); };
  let w6; try { w6 = HC.writeJsonManaged(f6, { createIfMissing: 'dir-exists' }, regHooks); } finally { fs.linkSync = realLink; }
  const j6 = JSON.parse(fs.readFileSync(f6, 'utf8'));
  ok("a file the CLI wrote in the create gap is NEVER replaced: the exclusive link refuses, the loop re-reads it and merges (the CLI's key + our hooks; true, not \"created\"; no tmp left)", raced === 1 && w6 === true && j6.theme === 'cli-wrote-this' && Array.isArray(j6.hooks.Stop) && !fs.existsSync(f6 + '.tmp'), { w6, j6 });
  // a filesystem WITHOUT hard links (some FUSE / network mounts): link fails EPERM ⇒ the create falls back to the rename,
  // still 0600, still never over a file that exists
  const h6b = mkHome('rule-linkless', ['.claude']);
  const f6b = path.join(h6b, '.claude', 'settings.json');
  fs.linkSync = function () { const e = new Error('EPERM: operation not permitted, link'); e.code = 'EPERM'; throw e; };
  let w6b; try { w6b = HC.writeJsonManaged(f6b, { createIfMissing: 'dir-exists' }, regHooks); } finally { fs.linkSync = realLink; }
  ok('a filesystem without hard links (link → EPERM): the create falls back to the rename — created 0600, hooks registered, no tmp left', w6b === 'created' && modeOf(f6b) === 0o600 && Array.isArray(JSON.parse(fs.readFileSync(f6b, 'utf8')).hooks.Stop) && !fs.existsSync(f6b + '.tmp'), w6b);
  const h7 = mkHome('rule-toml', ['.codex']);
  const f7 = path.join(h7, '.codex', 'config.toml');
  const w7 = HC.writeTomlManaged(f7, { createIfMissing: 'dir-exists' }, [{ path: ['history', 'persistence'], value: 'save-all' }]);
  ok('the TOML writer follows the same rule: created 0600 when ~/.codex exists', w7 === 'created' && fs.readFileSync(f7, 'utf8') === '[history]\npersistence = "save-all"\n' && modeOf(f7) === 0o600, w7);
  // readConfigPlan names WHY a file is missing — the code the chips word (and the only free field a remote CFG line carries)
  const plan = buildConfigPlan([{ harness: 'claude', table: HARNESS_SETTINGS.claude, files: { settings: { createIfMissing: 'dir-exists' } }, values: { transcriptRetentionDays: 36500 } }]);
  const planF = buildConfigPlan([{ harness: 'claude', table: HARNESS_SETTINGS.claude, files: { settings: { createIfMissing: false } }, values: { transcriptRetentionDays: 36500 } }]);
  const rr = (p, home) => HC.readConfigPlan(p, { home })[0];
  ok("readConfigPlan: missing + dir ⇒ reason 'will-create'; no dir ⇒ 'no-dir'; rule false ⇒ 'not-ours' (and the plan carries the rule by name)",
    plan.files[0].createIfMissing === 'dir-exists' && planF.files[0].createIfMissing === false
    && rr(plan, mkHome('rp-a', ['.claude'])).reason === 'will-create' && rr(plan, mkHome('rp-b')).reason === 'no-dir' && rr(planF, mkHome('rp-c', ['.claude'])).reason === 'not-ours');
  const lines = HC.parseReceiptLines(HC.formatReceiptLines([rr(plan, mkHome('rp-d', ['.claude']))]));
  ok("…and the reason survives a remote helper's CFG line (the chip reads it there)", lines[0].state === 'missing' && lines[0].reason === 'will-create', lines);
  const ap = HC.applyConfigPlan(plan, { home: mkHome('ap-a', ['.claude']) });
  ok('applyConfigPlan: the boot plan alone (cleanupPeriodDays) creates the file when ~/.claude exists and says created', ap.files[0].created === true && ap.receipts[0].state === 'applied', ap);
  const apn = HC.applyConfigPlan(plan, { home: mkHome('ap-b') });
  ok("…and with no ~/.claude: receipt missing (missing: no-dir), no directory made", apn.receipts[0].state === 'missing' && apn.receipts[0].missing === 'no-dir' && !fs.existsSync(path.join(HKC, 'ap-b', '.claude')), apn);
  // CONTROL ① a patched copy whose create path MAKES the directory (the scope guard's failure) ⇒ the rule judge goes red
  const src = read('src/harness-config.js');
  const needle = "if (!fs.existsSync(path.dirname(file))) return 'no-dir';";
  const mutSrc = src.replace(needle, "if (!fs.existsSync(path.dirname(file))) fs.mkdirSync(path.dirname(file), { recursive: true });");
  const mutFile = path.join(HKC, 'harness-config-mkdir-control.cjs');
  fs.writeFileSync(mutFile, mutSrc);
  const MUT = require(mutFile);
  const mut = ruleHolds(MUT, path.join(HKC, 'rule-mut'));
  ok('CONTROL: a patched copy that creates the DIRECTORY fails the no-dir leg (the judge is not vacuous)', mutSrc !== src && mut.noDir === false && fs.existsSync(path.join(HKC, 'rule-mut', 'nodir', '.claude')), mut);
  // CONTROL ② the pre-lane rule (claude's createIfMissing: false) on the incident's shape: ~/.claude exists, no settings.json ⇒ nothing registered
  const hz = mkHome('incident', ['.claude', '.claude/projects']);
  let ez = null; try { HC.writeJsonManaged(path.join(hz, '.claude', 'settings.json'), { createIfMissing: false }, regHooks); } catch (e) { ez = e; }
  ok("CONTROL: the pre-lane rule reproduces the incident (~/.claude with projects/, no settings.json ⇒ refused, never registered)", !!ez && !fs.existsSync(path.join(hz, '.claude', 'settings.json')));
}

console.log('§7 ensureAgentHooks on a scratch HOME (~/.claude present and absent) — the generator the boot runs');
const created = [];
const logs = [];
let GEN;
{
  process.env.HOME = path.join(HKC, 'home-gen');
  fs.mkdirSync(process.env.HOME, { recursive: true });
  ok('the scratch HOME is the one every write resolves (os.homedir() === /tmp/vs-hkc-<pid>/home-gen)', os.homedir() === process.env.HOME && process.env.HOME.startsWith(HKC + path.sep));
  const genRoot = path.join(HKC, 'gen-root'); fs.mkdirSync(path.join(genRoot, 'data'), { recursive: true });
  GEN = require(path.join(repo, 'src/server/agent-tool-generators.js')).create({ rootDir: genRoot, port: 0, onHookFileCreated: (ev) => created.push(ev) });
  const origLog = console.log;
  const run = (fn) => { console.log = (...a) => { logs.push(a.join(' ')); }; try { return fn(); } finally { console.log = origLog; } };
  // the belt holds as before: VIBESPACE_SKIP_AGENT_HOOKS=1 (this suite's env) ⇒ nothing written
  const skipped = run(() => GEN.ensureAgentHooks({ auto: true }));
  ok('hookRegistrationSafe unchanged: under VIBESPACE_SKIP_AGENT_HOOKS=1 the registration is skipped, nothing created', !!skipped.skipped && !fs.existsSync(path.join(process.env.HOME, '.claude')));
  process.env.VIBESPACE_FORCE_AGENT_HOOKS = '1';
  try {
    const st0 = GEN.agentHooksStatus();
    const r0 = run(() => GEN.ensureAgentHooks({ auto: true }));
    ok('~/.claude ABSENT ⇒ skipped and said (missing: no-dir), the directory never created, no callback', r0.claude && r0.claude.ok === false && r0.claude.missing === 'no-dir' && !fs.existsSync(path.join(process.env.HOME, '.claude')) && created.length === 0 && st0.claude.dirExists === false && st0.claude.creatable === false, { r0, st0: st0.claude });
    ok('…the journal says why (the CLI has not run on this machine)', logs.some((l) => /Hook registration \(claude\) skipped: .*\.claude not found — the CLI has not run on this machine; nothing is created/.test(l)), logs);
    fs.mkdirSync(path.join(process.env.HOME, '.claude', 'projects'), { recursive: true }); // the incident's shape: the CLI ran, wrote projects/, never settings.json
    const st1 = GEN.agentHooksStatus();
    ok('~/.claude present, settings.json missing ⇒ the status says creatable (the chip offers Apply)', st1.claude.fileExists === false && st1.claude.dirExists === true && st1.claude.creatable === true, st1.claude);
    logs.length = 0;
    const r1 = run(() => GEN.ensureAgentHooks({ auto: true }));
    const sf = path.join(process.env.HOME, '.claude', 'settings.json');
    const j = JSON.parse(fs.readFileSync(sf, 'utf8'));
    const cmd = (ev) => j.hooks[ev] && j.hooks[ev][0].hooks[0].command;
    ok('…ensureAgentHooks CREATES it (created: true), mode 0600, SessionStart/UserPromptSubmit/Stop registered with our absolute command', r1.claude.ok && r1.claude.created === true && modeOf(sf) === 0o600 && ['SessionStart', 'UserPromptSubmit', 'Stop'].every((ev) => /vibespace-hook\.mjs$/.test(cmd(ev) || '')), { r1, j });
    ok('…the journal line: "created ~/.claude/settings.json (the CLI had never written one) and registered VibeSpace hooks"', logs.includes('created ~/.claude/settings.json (the CLI had never written one) and registered VibeSpace hooks'), logs);
    ok('…onHookFileCreated fired ONCE with {harness: claude, rel: .claude/settings.json, file, at}', created.length === 1 && created[0].harness === 'claude' && created[0].rel === '.claude/settings.json' && created[0].file === sf && created[0].at > 0, created);
    const st2 = GEN.agentHooksStatus();
    ok('…the status now reads installed, not creatable', st2.claude.installed === true && st2.claude.creatable === false);
    const r2 = run(() => GEN.ensureAgentHooks({ auto: true }));
    ok('a second registration over the created file: ok, never "created" again, no second callback', r2.claude.ok && !r2.claude.created && created.length === 1, r2);
    // the boot CLI-config plan follows the same rule (cleanupPeriodDays alone creates the file — e.g. the hooks were Removed)
    const homeB = mkHome('home-sync', ['.claude']);
    const sync = require(path.join(repo, 'src/server/harness-config-sync.js')).create({ serverSetting: () => undefined, harnesses: require(path.join(repo, 'src/harnesses/index.js')), adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home: homeB, log: (m) => logs.push(m), warn: (m) => logs.push('WARN ' + m) });
    logs.length = 0;
    const rs = sync.syncCliConfig({ reason: 'boot' });
    const sfB = path.join(homeB, '.claude', 'settings.json');
    ok("the boot cli-config plan follows the same rule: ~/.claude present ⇒ settings.json created with cleanupPeriodDays 36500 (0600), journal says created", fs.existsSync(sfB) && JSON.parse(fs.readFileSync(sfB, 'utf8')).cleanupPeriodDays === 36500 && modeOf(sfB) === 0o600 && logs.some((l) => /\[cli-config\] created ~\/\.claude\/settings\.json \(the CLI had never written one\) \(boot\)/.test(l)) && rs.receipts.some((x) => x.key === 'transcriptRetentionDays' && x.state === 'applied'), logs);
    const st = sync.cliConfigStatus();
    ok("…and its status receipt reads applied afterwards (and a fresh HOME without ~/.claude reads missing: no-dir)", st.receipts.find((x) => x.key === 'transcriptRetentionDays').state === 'applied');
  } finally { delete process.env.VIBESPACE_FORCE_AGENT_HOOKS; }
}

console.log('§8 the conversations that predate a created hook file (src/server/hooks-late.js + PURE src/hooks-late.js)');
{
  const HL = require(path.join(repo, 'src/hooks-late.js'));
  const { SessionStatusManager } = require(path.join(repo, 'src/session-status.js'));
  const { UserTodoManager } = require(path.join(repo, 'src/user-todos.js'));
  const harnesses = require(path.join(repo, 'src/harnesses/index.js'));
  const dd = path.join(HKC, 'data'); fs.mkdirSync(dd, { recursive: true });
  const st = new SessionStatusManager({ dataDir: dd, onChange: () => {} });
  const todos = new UserTodoManager({ dataDir: dd, onChange: () => {} });
  const keyOf = (s, id) => { const b = s && (s.backendSessionId || s.claudeSessionId); return b ? `${s.backend || 'claude'}:${b}` : `webui:${id}`; };
  const sessions = new Map([
    ['sess-1-1', { backend: 'claude', mode: 'chat', claudeSessionId: 'c-1', name: 'Fix the login page' }],
    ['sess-2-2', { backend: 'claude', mode: 'terminal', name: 'Terminal claude' }],
    ['sess-3-3', { backend: 'claude', mode: 'chat', host: 'box-a', claudeSessionId: 'c-3', name: 'Remote one' }],
    ['sess-4-4', { backend: 'codex', mode: 'chat', backendSessionId: 't-4', name: 'Codex chat' }],
    ['sess-5-5', { backend: 'claude', mode: 'chat', _dialDeviceId: 'mac', claudeSessionId: 'c-5', name: 'Dialed one' }],
    ['sess-6-6', { mode: 'chat', claudeSessionId: 'c-6', name: 'Legacy (no backend field)' }],
  ]);
  const lines = [];
  const hl = require(path.join(repo, 'src/server/hooks-late.js')).create({ activeSessions: sessions, getSessionStatus: () => st, getUserTodos: () => todos, sessionStatusKey: keyOf, harnesses, log: (m) => lines.push(m), warn: (m) => lines.push('WARN ' + m) });
  const ev = { harness: 'claude', file: '/x/.claude/settings.json', rel: '.claude/settings.json', at: Date.now() };
  ok('codex chat injects through its wrapper (the reason it is excluded below)', harnesses.get('codex').inject.kind === 'wrapper' && harnesses.get('claude').inject.kind === 'hooks');
  ok('a creation noted BEFORE the boot restore is held (nothing queued, no For-you line) until ready()', hl.noteCreated(ev) === null && st.pendingNotices('claude:c-1').length === 0 && todos.snapshot().open.length === 0);
  hl.ready();
  const pend = (k) => st.pendingNotices(k);
  ok('ready(): ONE note for each running LOCAL claude session — chat (by its conversation key), terminal (webui key), a legacy record with no backend field',
    pend('claude:c-1').length === 1 && pend('webui:sess-2-2').length === 1 && pend('claude:c-6').length === 1, { c1: pend('claude:c-1'), s2: pend('webui:sess-2-2') });
  ok('…never a remote (ssh) session, a dialed device\'s session, or a wrapper-injected codex chat (none of them reads this file)', pend('claude:c-3').length === 0 && pend('claude:c-5').length === 0 && pend('codex:t-4').length === 0);
  const n1 = pend('claude:c-1')[0];
  ok("the note carries its process (webuiId) and renders EXACTLY the one sentence as a system reminder", n1.kind === 'hooks-late' && n1.webuiId === 'sess-1-1' && SessionStatusManager.renderNotice(n1) === "<system-reminder>\nVibeSpace's hooks were registered after this conversation started — Terminate and Resume it to get the tools context\n</system-reminder>", n1);
  const open = todos.snapshot().open;
  const item = open[0];
  ok('ONE For-you line for the owner (origin agent) naming how many: "3 running Claude Code conversations started before VibeSpace registered its hooks — Terminate and Resume them …"',
    open.length === 1 && item.origin === 'agent' && item.text === '3 running Claude Code conversations started before VibeSpace registered its hooks — Terminate and Resume them to give their agents the VibeSpace tools' && /Fix the login page/.test(item.detail) && /Terminal claude/.test(item.detail) && !/Remote one|Codex chat|Dialed one/.test(item.detail), item);
  ok('…its words ride as structure the client words in zh/ja ({n}, {label} params, the detail lines, the source)', item.i18n && item.i18n.text.params.n === 3 && item.i18n.text.params.label === 'Claude Code' && /\{n\} running \{label\} conversations/.test(item.i18n.text.key) && item.i18n.source.key === 'VibeSpace integration' && item.i18n.detail.length >= 2, item.i18n);
  const one = HL.forYouItem({ count: 1, label: 'Claude Code', rel: '.claude/settings.json', names: ['x'] });
  ok('one conversation reads in the singular ("1 running … conversation … Terminate and Resume it")', /^1 running Claude Code conversation started .* Terminate and Resume it to give its agent/.test(one.text) && /^1 running \{label\} conversation/.test(one.i18n.text.key));
  // once per session: a second creation (the file removed by hand and re-created) tells nobody twice and files no second line
  hl.noteCreated({ ...ev, at: Date.now() + 1 });
  ok('ONCE per session: a second creation queues no second note and files no new For-you line', pend('claude:c-1').length === 1 && pend('webui:sess-2-2').length === 1 && todos.snapshot().open.length === 1);
  // a session that started after the creation is not told (it has the hooks)
  sessions.set('sess-7-7', { backend: 'claude', mode: 'chat', claudeSessionId: 'c-7', name: 'Started later' });
  ok('a session spawned after the registration is never told (nothing re-announces it)', pend('claude:c-7').length === 0);
  // THE STALE DROP at the drain (agent-routes' order): the SAME process keeps it; a resumed process of the same conversation drops it unread
  const drain = (key, id) => { for (const k of [key, `webui:${id}`]) st.dropNotices(k, (n) => HL.hooksLateStale(n, id)); return st.pendingNotices(key).map((n) => SessionStatusManager.renderNotice(n)).join('\n'); };
  ok('the same process (sess-1-1) asking: the note rides', /Terminate and Resume it to get the tools context/.test(drain('claude:c-1', 'sess-1-1')));
  ok('a Terminate + Resume (a NEW webui id, the same conversation key) asking: the note is dropped unread — a resumed session never reads "Terminate and Resume it"', drain('claude:c-1', 'sess-9-9') === '' && pend('claude:c-1').length === 0);
  ok('PURE stale rule: only a hooks-late note of ANOTHER webui id is stale; other kinds never', HL.hooksLateStale({ kind: 'hooks-late', webuiId: 'a' }, 'b') && !HL.hooksLateStale({ kind: 'hooks-late', webuiId: 'a' }, 'a') && !HL.hooksLateStale({ kind: 'browser-pin', webuiId: 'a' }, 'b') && !HL.hooksLateStale(null, 'b'));
  // nothing running ⇒ no For-you line at all
  const st2 = new SessionStatusManager({ dataDir: path.join(HKC, 'data2'), onChange: () => {} });
  const todos2 = new UserTodoManager({ dataDir: path.join(HKC, 'data2'), onChange: () => {} });
  const hl2 = require(path.join(repo, 'src/server/hooks-late.js')).create({ activeSessions: new Map(), getSessionStatus: () => st2, getUserTodos: () => todos2, sessionStatusKey: keyOf, harnesses, log: () => {}, warn: () => {} });
  hl2.ready(); hl2.noteCreated(ev);
  ok('no running session ⇒ no For-you line (nothing to do)', todos2.snapshot().open.length === 0);
  // NEVER A BILLED TURN: the module and the PURE words call no sender, no ladder, no wake
  const orch = read('src/server/hooks-late.js'), pure = read('src/hooks-late.js');
  ok('never a billed turn: neither module calls sendToSession / formatChatInput / deliver / a ladder / billedWake / spendGuard', ![orch, pure].some((t) => /sendToSession|formatChatInput|\bdeliver\s*\(|ladder\s*\(|billedWake|spendGuard|sendChatInput/.test(t)));
  // the Apply route (human-triggered): the boot path on demand, honouring the belt, the master switch and the Remove opt-out
  const routes = {};
  const app = { post: (p, h) => { routes[p] = h; } };
  const calls = [];
  const deps = (o = {}) => ({ ensureAgentHooks: (a) => { calls.push(['ensure', a]); return { claude: { ok: true, created: true } }; }, agentHooksStatus: () => ({ claude: { installed: true } }), integrationEnabled: () => o.on !== false, harnessConfig: { syncCliConfig: (a) => { calls.push(['sync', a]); return { receipts: [] }; }, cliConfigStatus: () => ({ receipts: [{ state: 'applied' }] }) }, hookRegistrationSafe: () => o.safe !== false });
  const call = (o) => { const out = {}; const res = { status: (c) => { out.code = c; return res; }, json: (j) => { out.body = j; return res; } }; hl.registerApplyRoute(app, deps(o)); routes['/api/cli-config/apply']({ body: {} }, res); return out; };
  calls.length = 0; const a1 = call({});
  ok('POST /api/cli-config/apply: the registration with auto:true (a Remove opt-out still holds) + the CLI-config plan, fresh status back', a1.body.ok === true && calls.length === 2 && calls[0][0] === 'ensure' && calls[0][1].auto === true && calls[1][0] === 'sync' && calls[1][1].reason === 'Apply' && a1.body.cliConfig.receipts[0].state === 'applied', { a1, calls });
  calls.length = 0; const a2 = call({ on: false });
  ok('…with the master switch off: no hook registration, the managed keys only', a2.body.ok === true && calls.length === 1 && calls[0][0] === 'sync', calls);
  calls.length = 0; const a3 = call({ safe: false });
  ok('…a throwaway/temp server root refuses by name (409 unsafe_root) and writes nothing', a3.code === 409 && a3.body.code === 'unsafe_root' && calls.length === 0, a3);
  st.flush(); todos.flush(); st2.flush(); todos2.flush();
}

console.log('§9 wiring pins (a fix without its call site is dead)');
{
  const srv = read('server.js'), ar = read('src/agent-routes.js'), gen = read('src/server/agent-tool-generators.js'), ss = read('src/session-status.js');
  ok("claude's settings.json is declared 'dir-exists'; codex's two files the same rule by name", /cliConfigFile\(HARNESS_SETTINGS\.claude\.files\.settings, \{ createIfMissing: 'dir-exists' \}\)/.test(read('src/harnesses/claude.js')) && (read('src/harnesses/codex.js').match(/createIfMissing: 'dir-exists'/g) || []).length === 2);
  ok('server.js constructs hooksLate BEFORE the generators and hands ensureAgentHooks its callback', srv.indexOf("require('./src/server/hooks-late.js').create(") > 0 && srv.indexOf("require('./src/server/hooks-late.js').create(") < srv.indexOf("require('./src/server/agent-tool-generators.js').create(") && /agent-tool-generators\.js'\)\.create\(\{ rootDir: __dirname, port: PORT, onHookFileCreated: \(ev\) => hooksLate\.noteCreated\(ev\) \}\);/.test(srv));
  ok('…calls hooksLate.ready() right after restoreSessions() — as CODE, before the line comment (§48)', /^\s*restoreSessions\(\);[^\n/]*hooksLate\.ready\(\); \/\//m.test(srv));
  ok('…and registers the Apply route with the belt, the master switch and the plan', /hooksLate\.registerApplyRoute\(app, \{ ensureAgentHooks, agentHooksStatus, integrationEnabled, harnessConfig, hookRegistrationSafe \}\);/.test(srv));
  ok('the generator calls onHookFileCreated only on "created" and logs the journal line', /if \(w === 'created'\) \{/.test(gen) && /onHookFileCreated\(\{ harness: key, file: def\.file\(\), rel, at: Date\.now\(\) \}\)/.test(gen));
  const di = ar.indexOf('sessionStatus.dropNotices(k, (n) => hooksLateStale(n, id));'), pi = ar.indexOf('for (const k of keys) for (const n of (sessionStatus.pendingNotices(k)');
  ok('agent-routes drops a stale late-hooks note at the drain BEFORE the queue is peeked (both keys)', di > 0 && pi > di && ar.slice(di - 400, di).includes('const keys = [key, `webui:${id}`];'));
  ok("session-status renders the kind through the PURE module (the queue refuses an unknown kind at push)", /'hooks-late': \(n\) => require\('\.\/hooks-late'\)\.renderHooksLateNotice\(n\)/.test(ss));
}

process.env.HOME = ENV_HOME;
{
  const ownerAfter = OWNER_FILES.map(fp);
  const ownerDirsAfter = [...new Set([OWNER_HOME, ENV_HOME])].map((h) => ['.claude', '.codex'].map((d) => fs.existsSync(path.join(h, d))).join(','));
  ok(`the owner's HOME is untouched: ${OWNER_FILES.length} real CLI config files (${OWNER_HOME} + the env HOME) byte- and mtime-identical, no ~/.claude or ~/.codex created`, JSON.stringify(ownerAfter) === JSON.stringify(ownerBefore) && JSON.stringify(ownerDirsAfter) === JSON.stringify(ownerDirsBefore), { OWNER_FILES, ownerBefore, ownerAfter });
}
fs.rmSync(HKC, { recursive: true, force: true });

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

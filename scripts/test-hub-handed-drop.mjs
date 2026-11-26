#!/usr/bin/env node
// r2271 (lane lg-group-parents), its clause corrected by r2505 — A HUB's OWN ENVIRONMENT NEVER HOLDS WHAT A PARENT CONVERSATION,
// JOB OR APP HANDED. A hub started inside a VibeSpace finds the handed mark (src/conversation-env.js HANDED_MARK, names only) and,
// at its BOOT before any child, drops ONLY WHAT WAS HANDED: every name the mark lists, the mark, the app's process mark and the two
// page-helper names (src/server/throwaway-root.js dropHandedAtBoot, called by src/server/runtime-boot.js right after the re-home).
// No catch-all by family. Never dropped, even when a mark lists it: the person's session names, the hub's credential rows (no
// road hands one), the pod's instance name (the stricter kind). A hub with no mark changes nothing; the job names go always.
//  ① a conversation's child env, marked by the real road helper, in a shell where the person typed their own hub's sign-in, its
//     TLS pair, a port and a VibeSpace word of their own: everything handed goes (the address, the bearer, the task, the keeper's
//     folder, the device and daemon roots, the page helpers, the CLI home, the app mark, the job names); every word the person
//     typed stays, and so do the hub's knob, its kit switch, the session names and the pod's instance name; the line: names only
//  ② NO mark (the service start): nothing changes
//  ③ PINS: runtime-boot calls the act right after the re-home and says its line; the desktop app road writes the mark; the two
//     raw sites take a built env
//  ④ THE ROADS' CENSUS: its wall is test-architecture §112 (its sites, the roads that finish a child's env and write the mark, each
//     site's road — a site with no road is red there); the desktop app road is joined to all three; and the remote shell's TYPED
//     mark is driven here over the dial road's REAL prelude: every name its real command line exports is in the mark it carries.
//  ⑤ THE ROADS ON THE PLAIN SANITIZED ENV (r2607), which §112 cannot see: the OpenCode terminal marks its shell with the floor's
//     mark (a hub started there drops the floor names, the device roots with them; the instance name stays); the two services
//     (the OpenCode serve, the plugin loader) and the two roads that hand a shell no VibeSpace name (the Desktop start, the tmux
//     attach) each have their row, held to their spawn's shape.
//  ③ B-2c5c (4c): a VibeSpace started INSIDE a job says its bound in force, what passing it does and its start again by RUNG
//     (r4564, r4673); its REDS are placed in a copy of src/job-model.js (the start again by holder alone, the spawn figure cut, a
//     cron read as itself)
//  REDS (ten plants, nine checks): the act ignoring the mark; the family catch-all back; each fixed clause cut (the app mark, the
//  page helpers); each exemption cut (the session names, the credential rows, the instance name); a name the prelude exports and a
//  prefix assignment on the program, neither in the mark; the Desktop start handed the agent env.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('hub-handed-drop');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const { ok, report } = checker();
const TR = require(path.join(REPO, 'src/server/throwaway-root.js'));
const CE = require(path.join(REPO, 'src/conversation-env.js'));
const A = require(path.join(REPO, 'src/agent-env.js'));
const RS = require(path.join(REPO, 'src/remote-shell.js'));
const KNOB = 'VIBESPACE_JOBS_GRACE_MS', SWITCH = 'VIBESPACE_SKIP_AGENT_HOOKS', OWN_WORD = 'VIBESPACE_MY_OWN_WORD';
const PW = ['pw', 'typed', 'by', 'hand'].join('-');   // the person's own sign-in declaration (a fixture built at runtime)
// the hub that started the conversation (the OUTER hub's own env: on a pod, its instance name and its device / daemon roots) and
// the conversation's child env, marked by the road's helper
const outerHub = { PATH: '/usr/bin', HOME: '/home/userL', LANG: 'C.UTF-8', [KNOB]: '9000', VIBESPACE_INSTANCE_NAME: 'pod-a',
  VIBESPACE_DEVICE_ROOT: '/outer/device', VIBESPACE_AGENTD_ROOT: '/outer/agentd', VIBESPACE_KEEPER_DIR: '/outer/keeper' };
const base = A.agentEnv(outerHub);
const handed = { ...base, VIBESPACE_API: 'http://outer-hub.invalid', VIBESPACE_SESSION_TOKEN: ['vsst', 'planted'].join('_'), VIBESPACE_TASK_ID: 'T-outer',
  CLAUDE_WEBUI_SESSION_ID: 'outer-sid', CLAUDE_WEBUI_PORT: 'outer-port', CODEX_HOME: '/outer/data/codex-subs/acct', VIBESPACE_DESKTOP_APP: 'app-outer' };
const child = CE.withHandedMark(handed, base);
const listed = CE.namesOfMark(child[CE.HANDED_MARK]);
// ① the inner hub's env = that shell's env + what the person typed for their own hub + a job's names
const TYPED = { VIBESPACE_PASSWORD: PW, VIBESPACE_TLS_CERT: '/own/cert.pem', VIBESPACE_TLS_KEY: '/own/key.pem', PORT: '4600', [OWN_WORD]: 'mine', [KNOB]: '100', [SWITCH]: '1' };
const scene = (Mod) => {
  const env = { ...child, ...TYPED, VIBESPACE_JOB_ID: 'jb-outer', VIBESPACE_JOB_TOKEN: 'jbt' };
  const r = Mod.dropHandedAtBoot({ env });
  return { env, r };
};
const GONE = ['VIBESPACE_API', 'VIBESPACE_SESSION_TOKEN', 'VIBESPACE_TASK_ID', 'VIBESPACE_KEEPER_DIR', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT', 'CLAUDE_WEBUI_SESSION_ID', 'CLAUDE_WEBUI_PORT', 'CODEX_HOME', 'VIBESPACE_DESKTOP_APP', CE.HANDED_MARK, 'VIBESPACE_JOB_ID', 'VIBESPACE_JOB_TOKEN'];
const typedStays = (env) => Object.entries(TYPED).every(([k, v]) => env[k] === v);
{
  const { env, r } = scene(TR);
  ok(!!(['VIBESPACE_API', 'CODEX_HOME', 'CLAUDE_WEBUI_PORT', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_INSTANCE_NAME'].every((k) => listed.includes(k)) && !listed.includes('PATH') && !listed.includes('HOME') && !listed.includes('VIBESPACE_PASSWORD')), `① the road's mark names what it handed (the address, the CLI home, the page helpers, the hub's floor names) and no session name, no credential (${listed.length} names)`, listed);
  ok(!!(r.by === 'mark' && GONE.every((k) => !(k in env))), `① a hub started inside a conversation drops what it was handed: ${r.dropped.length} names — the device and daemon roots among them (an inner hub never shares the outer's device root), the mark and the job names`, r);
  ok(!!(typedStays(env) && env.PATH === '/usr/bin' && env.HOME === '/home/userL' && env.LANG === 'C.UTF-8'), '① every word the person typed for their own hub STAYS — its sign-in, its TLS pair, its port, its knob, its kit switch and a VibeSpace word that is no row and not in the mark — and so do the session names', env);
  ok(!!(env.VIBESPACE_INSTANCE_NAME === 'pod-a'), '① the pod\'s instance name stays although the mark lists it: the inner hub started by hand on a pod stays a «cluster» hub (the stricter kind)', env);
  ok(!!(/started inside a VibeSpace/.test(TR.handedLine(r) || '') && !/vsst_planted|T-outer|outer-hub\.invalid|\/outer\/|pw-typed/.test(TR.handedLine(r) || '')), '① the boot says it once, names only — never a value');
}
{
  // ② NO mark: the production start — an operator's own values stand
  const env = { PATH: '/usr/bin', HOME: '/home/userL', VIBESPACE_API: 'http://inner-hub.invalid', [KNOB]: '5', VIBESPACE_PASSWORD: PW, CLAUDE_WEBUI_PORT: 'inner-port' };
  const before = JSON.stringify(env);
  const r = TR.dropHandedAtBoot({ env });
  ok(!!(r.by === 'none' && JSON.stringify(env) === before && TR.handedLine(r) === null), '② a hub with no handed mark (the service start) changes nothing: an operator\'s own values stand');
}
// the FIXED clauses: a mark that lists only the address — the app's mark and the page helpers go by their own clause
const fixedScene = (Mod) => {
  const env = { PATH: '/usr/bin', HOME: '/home/userL', VIBESPACE_API: 'http://outer-hub.invalid', VIBESPACE_DESKTOP_APP: 'app-outer', CLAUDE_WEBUI_SESSION_ID: 'outer-sid', CLAUDE_WEBUI_PORT: 'outer-port', [CE.HANDED_MARK]: CE.markOf(['VIBESPACE_API']) };
  Mod.dropHandedAtBoot({ env });
  return env;
};
// a FORGED mark (written by hand: the helpers never list a session name) that lists a session name, a credential and the instance name
const forgedScene = (Mod) => {
  const env = { PATH: '/usr/bin', HOME: '/home/userL', VIBESPACE_PASSWORD: PW, VIBESPACE_INSTANCE_NAME: 'pod-a', [CE.HANDED_MARK]: 'HOME,PATH,VIBESPACE_INSTANCE_NAME,VIBESPACE_PASSWORD' };
  Mod.dropHandedAtBoot({ env });
  return env;
};
{
  const f = fixedScene(TR);
  ok(!!(!('VIBESPACE_DESKTOP_APP' in f) && !('CLAUDE_WEBUI_SESSION_ID' in f) && !('CLAUDE_WEBUI_PORT' in f) && !('VIBESPACE_API' in f)), '① the app\'s mark and the two page-helper names go by their own clause, even when the mark does not list them', f);
  const g = forgedScene(TR);
  ok(!!(g.PATH === '/usr/bin' && g.HOME === '/home/userL' && g.VIBESPACE_PASSWORD === PW && g.VIBESPACE_INSTANCE_NAME === 'pod-a'), '① a forged mark that lists a session name, a credential and the instance name drops none of them (no road hands a credential: one beside a mark is the person\'s own)', g);
}
{
  // ③ the order and the roads
  const RB = fs.readFileSync(path.join(REPO, 'src/server/runtime-boot.js'), 'utf8');
  ok(!!(RB.includes('  TR.rehomeAtBoot({ root: rootDir, env });\n  TR.dropHandedAtBoot({ env });') && RB.indexOf('TR.dropHandedAtBoot({ env });') < RB.indexOf('booted = create({') && RB.includes('TR.handedLine()')), '③ PIN: the boot runs the act right after the re-home, before anything is created, and says its line');
  const DS = fs.readFileSync(path.join(REPO, 'src/desktop-serve.js'), 'utf8');
  ok(!!(DS.includes('appEnv[CE.HANDED_MARK] = CE.markOf(CE.handedNames(appEnv, env()));')), '③ PIN: the desktop app road writes the handed mark on the app\'s env (a hub started from its terminal drops what the app was handed)');
  const UR = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8'), CT = fs.readFileSync(path.join(REPO, 'src/codex-thread-read.js'), 'utf8');
  ok(!!(UR.includes("const env = require('./agent-env.js').agentEnv(process.env);") && !UR.includes('const env = { ...process.env };') && CT.includes("readThreadViaAppServer(threadId, { codexCmd, timeoutMs, env: require('./agent-env.js').agentEnv(process.env) })")), '③ PIN: the usage probe and the codex thread read take a built env, never the hub\'s whole one');   // stale-pins: kept (the usage probe's release copy)
}
// ④ THE ROADS' CENSUS (r2505). Its wall is test-architecture §112, ONE list read from the tree: SITES112 (every site that writes a
// conversation's names), ROADS112 (every road that finishes a child's env — each must still write the mark, by its own line) and
// SITE_ROAD112 (each site's road, or why no conversation runs in its child — a site with no road is red there, its controls with
// it). The desktop app road is JOINED to all three (r2505). What §112 cannot see, held here: the remote shell's mark is a TYPED
// list, so every name its real command line sets is checked against the mark the same line carries.
const ARCH = fs.readFileSync(path.join(REPO, 'scripts/test-architecture.mjs'), 'utf8');
const blockOf = (text, head) => { const at = text.indexOf(head); return at < 0 ? '' : text.slice(at, text.indexOf('});', at)); };
const joined = ['const SITES112 = Object.freeze({', 'const ROADS112 = Object.freeze({', 'const SITE_ROAD112 = Object.freeze({'].map((h) => blockOf(ARCH, h).includes("'src/desktop-serve.js':"));
// the remote shell's TYPED mark, driven: every name its REAL command line EXPORTS to the program is in the mark the same line
// carries — over the dial road's REAL prelude (r2613: an assignment exported there was not seen before). Exported = an `export
// NAME` / `export NAME=…` anywhere before the program, the prefix assignments of the command that runs it (after the last `; `),
// its `exec env` pairs; never a shell-local assignment (the node finder's VS_NODE) nor a session name (the act never drops one)
const shq = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;
const REAL_PRE = RS.buildRemoteShellPrelude({ toolsOnPath: true, withNodeFinder: true });
const lineWith = (pre) => RS.buildRemoteExec({ cwd: '/w', shq, pre, browser: 'export AGENT_BROWSER_PROFILE=p; ', tokenAssign: RS.acctSecretAssign('CLAUDE_CODE_OAUTH_TOKEN', '/r/tok'),
  acctEnv: RS.acctFolderAssign('CLAUDE_CONFIG_DIR', '$HOME/.claude-acct'), parts: [`VIBESPACE_API=${shq('http://outer-hub.invalid')}`, `CLAUDE_WEBUI_SESSION_ID=${shq('sid')}`, 'claude', '--print'] });
const remoteLine = lineWith(REAL_PRE);
const exportedNames = (l) => {
  const at = l.indexOf('exec env '), head = at < 0 ? l : l.slice(0, at), names = new Set();
  for (const m of head.matchAll(/(?:^|[\s;])export\s+([^;]*)/g)) for (const w of m[1].trim().split(/\s+/)) { const n = /^([A-Za-z_][A-Za-z0-9_]*)(?:=|$)/.exec(w); if (n) names.add(n[1]); }
  for (const m of head.slice(head.lastIndexOf('; ') + 2).matchAll(/(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=/g)) names.add(m[1]);
  if (at >= 0) for (const p of l.slice(at + 9).split(' ')) { const m = /^'?([A-Za-z_][A-Za-z0-9_]*)=/.exec(p); if (!m) break; names.add(m[1]); }
  names.delete(CE.HANDED_MARK); for (const k of CE.PERSON_SESSION_ENV) names.delete(k);
  return [...names].sort();
};
const typedGap = (l) => { const m = new RegExp(CE.HANDED_MARK + "='([^']*)'").exec(l); if (!m) return ['no mark on the remote command line']; const marked = CE.namesOfMark(m[1]); return exportedNames(l).filter((k) => !marked.includes(k)); };
{
  const gap = typedGap(remoteLine), set = exportedNames(remoteLine);
  ok(!!joined.every(Boolean), `④ the desktop app road is joined to test-architecture §112's three lists — its sites, its roads (the app's mark by its own line) and each site's road (${JSON.stringify(joined)})`, joined);
  ok(!!(!gap.length && set.length === 6 && ['VIBESPACE_SESSION_CWD', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR', 'AGENT_BROWSER_PROFILE', 'VIBESPACE_API', 'CLAUDE_WEBUI_SESSION_ID'].every((k) => set.includes(k)) && /VS_NODE=/.test(REAL_PRE)), `④ the remote shell's typed mark over the dial road's REAL prelude: every name its command line exports (${set.length}: the cwd export, the browser export, the token and account assignments, the env pairs — the prelude's PATH a session name, its VS_NODE shell-local) is in the mark it carries`, { set, gap });
  const plantedPre = typedGap(lineWith(REAL_PRE + 'export VIBESPACE_EXTRA=1; '));
  const plantedPair = typedGap(remoteLine.replace('exec env ', 'VIBESPACE_EXTRA2=1 exec env '));
  ok(!!(plantedPre.includes('VIBESPACE_EXTRA') && plantedPair.includes('VIBESPACE_EXTRA2')), 'CONTROLS (the typed mark\'s census): a name the prelude exports and a prefix assignment on the program, neither in the mark, are each red by name', { plantedPre, plantedPair });
}
// ⑤ THE ROADS ON THE PLAIN SANITIZED ENV (r2607): they write no conversation name, so §112 cannot see them; each has its row here.
// The one that gives a PERSON a shell holding the hub's floor names — the OpenCode terminal — marks it (the floor's mark rides its
// request); the two services are left (nobody types a hub start there); the Desktop start and the tmux attach hand a person's
// shell no VibeSpace name at all (said by their spawn's own shape, which each row holds)
const readTree = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { return ''; } };
const FLOOR = { PATH: '/usr/bin', HOME: '/home/userL', VIBESPACE_KEEPER_DIR: '/outer/keeper', VIBESPACE_DEVICE_ROOT: '/outer/device', VIBESPACE_AGENTD_ROOT: '/outer/agentd', VIBESPACE_INSTANCE_NAME: 'pod-a', VIBESPACE_TASK_ID: 'T-outer', [KNOB]: '5' };
const PLAIN = Object.freeze([
  ['the OpenCode terminal', 'src/opencode-serve.js', 'MARKED (r2607): the serve\'s shell carries the floor names; the floor\'s mark rides the /pty request', /mark = CE\.floorMarkOf\(process\.env\); if \(mark\) env = \{ \.\.\.\(env && typeof env === 'object' \? env : \{\}\), \[CE\.HANDED_MARK\]: mark \}; \}\s*\n\s*const client = await userClient\(timeoutMs\);/],
  ['the OpenCode serve', 'src/opencode-serve.js', 'a SERVICE: nobody types a hub start in it (r2607) — its terminal is the row above', /env: env\(\), stdio: 'ignore', detached: true/],
  ['the plugin loader', 'src/server/plugin-loader.js', 'a SERVICE: a plugin process, nobody types a hub start in it (r2607)', /const env = \{ \.\.\.agentEnv\(\), VIBESPACE_PLUGIN_ID: rec\.id/],
  ['the Desktop start', 'src/vnc.js', 'hands NO VibeSpace name: its session env is serviceEnv (the service keep, LC_*, USER / LOGNAME / SHELL, DISPLAY)', /const env = serviceEnv\(process\.env, \{ keep: \['USER', 'LOGNAME', 'SHELL'\], add: \{ DISPLAY: this\.display \} \}\);/],
  ['the tmux attach', 'src/ws-handler.js', 'a tmux CLIENT: its env never reaches a pane a person types in (tmux copies only its update-environment list into a session — no VibeSpace name on it)', /pty\.spawn\('tmux', \['attach-session', '-t', tmuxTarget\], \{\s*\n[^\n]*\n\s*env: \{ \.\.\.agentEnv\(\), TERM: 'xterm-256color', COLORTERM: 'truecolor' \},/],
]);
const plainRed = (read) => PLAIN.filter(([, f, , re]) => !re.test(read(f))).map(([road, f]) => `${road} (${f}): its spawn is no longer the shape its row judged — class it again`);
{
  const fm = CE.floorMarkOf(FLOOR);
  ok(!!(fm === 'VIBESPACE_AGENTD_ROOT,VIBESPACE_DEVICE_ROOT,VIBESPACE_INSTANCE_NAME,VIBESPACE_KEEPER_DIR,VIBESPACE_TASK_ID' && CE.floorMarkOf({ PATH: '/usr/bin', [KNOB]: '5' }) === ''), `⑤ the floor's mark names the hub's floor names an env holds — no session name, no knob («${fm}»), and none for an env with none`, fm);
  const env = { ...FLOOR, [CE.HANDED_MARK]: fm };
  TR.dropHandedAtBoot({ env });
  ok(!!(!('VIBESPACE_KEEPER_DIR' in env) && !('VIBESPACE_DEVICE_ROOT' in env) && !('VIBESPACE_AGENTD_ROOT' in env) && !('VIBESPACE_TASK_ID' in env) && env.VIBESPACE_INSTANCE_NAME === 'pod-a' && env[KNOB] === '5' && env.PATH === '/usr/bin'), '⑤ a hub started by hand in the OpenCode terminal drops the floor names it was handed, the device roots with them; the instance name stays (kept), and so do its own knob and the session names', env);
  const red = plainRed(readTree);
  ok(!!(!red.length && PLAIN.length === 5), `⑤ the five roads on the plain sanitized env each have their row (${PLAIN.map(([r, , w]) => `${r}: ${w.split(':')[0]}`).join(' · ')})`, red);
  const planted = plainRed((f) => (f === 'src/vnc.js' ? readTree(f).replace("serviceEnv(process.env, { keep: ['USER', 'LOGNAME', 'SHELL']", "agentEnv({ keep: ['USER', 'LOGNAME', 'SHELL']") : readTree(f)));
  ok(!!planted.some((x) => x.startsWith('the Desktop start')), 'CONTROL (the plain roads\' census): the Desktop start handed the agent env instead is red by name — its row must be judged again', planted);
}
{
  const M = mutantCopies('hub-handed-drop', REPO);
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/throwaway-root.js'), 'utf8');
  const cut = (from, to, why, tag) => M.load('src/server/throwaway-root.js', anchored(SRC, from, to, why), tag);
  const Blind = cut('  const has = Object.prototype.hasOwnProperty.call(env, CE.HANDED_MARK);\n', '  const has = false;\n', 'the act ignoring the mark', 'blind');
  const b = scene(Blind);
  ok(!!(b.env.VIBESPACE_API === 'http://outer-hub.invalid' && b.env.VIBESPACE_SESSION_TOKEN), 'CONTROL (the act ignoring the mark): the outer hub\'s address and its conversation\'s bearer stay in the inner hub\'s env — every child takes them — red');
  const CatchAll = cut('PAGE_HELPER_ENV.includes(k));\n', "PAGE_HELPER_ENV.includes(k) || (k.startsWith('VIBESPACE_') && !HV.HUB_ROWS.some((r) => r && r.name === k)));\n", 'the family catch-all back', 'catch-all');
  const c = scene(CatchAll);
  ok(!!(!(OWN_WORD in c.env)), 'CONTROL (the family catch-all back — r2271\'s clause): the person\'s own VibeSpace word that is no row and not in the mark is dropped — red', c.env);
  const AppCut = cut(' || k === APP_MARK_ENV', '', 'the app mark clause cut', 'app-cut');
  ok(!!(fixedScene(AppCut).VIBESPACE_DESKTOP_APP === 'app-outer'), 'CONTROL (the app\'s mark clause cut): the outer app\'s process mark stays when the mark does not list it — red');
  const PageCut = cut(' || PAGE_HELPER_ENV.includes(k)', '', 'the page-helper clause cut', 'page-cut');
  ok(!!(fixedScene(PageCut).CLAUDE_WEBUI_SESSION_ID === 'outer-sid'), 'CONTROL (the page-helper clause cut): the outer conversation\'s page id stays when the mark does not list it — red');
  const PersonCut = cut('    if (person.has(k)) continue;\n', '', 'the session names exemption cut', 'person-cut');
  ok(!!(!('PATH' in forgedScene(PersonCut))), 'CONTROL (the session names exemption cut): a forged mark takes PATH away — red');
  const CredCut = cut('    if (creds.has(k)) continue;\n', '', 'the credential rows exemption cut', 'cred-cut');
  ok(!!(!('VIBESPACE_PASSWORD' in forgedScene(CredCut))), 'CONTROL (the credential rows exemption cut): a mark that lists the sign-in takes the person\'s own sign-in away — red');
  const KeptCut = cut('    if (kept.has(k)) continue;\n', '', 'the instance name exemption cut', 'kept-cut');
  ok(!!(!('VIBESPACE_INSTANCE_NAME' in forgedScene(KeptCut)) && !('VIBESPACE_INSTANCE_NAME' in scene(KeptCut).env)), 'CONTROL (the instance name exemption cut): the inner hub on a pod loses its instance name and judges itself «local» — red');
}
// ③ B-2c5c (4c), 主开发 r4380: A VIBESPACE STARTED AS A BACKGROUND JOB lives under that job's memory bound — past it the whole job is
// stopped (its scope's OOMPolicy=stop), VibeSpace with it, and nothing starts it again. The drop KEEPS the job's id (a name, never a
// value) and the boot says it ONCE in the journal, where the job's record is read (src/server/jobs-wiring.js); the manual says it too.
// (The card and the job's notification already name a memory-bound end with its size: src/lib/jobs-layout.js, src/job-model.js
// memoryEndWhat.)
{
  const M = require(path.join(REPO, 'src/job-model.js'));
  const env = { PATH: '/usr/bin', HOME: '/home/userL', VIBESPACE_JOB_ID: 'jb-made-up-1', VIBESPACE_JOB_TOKEN: ['jbt', 'made', 'up'].join('-') };
  const r = TR.dropHandedAtBoot({ env });
  ok(!!(typeof TR.handedJobId === 'function' && TR.handedJobId(r) === 'jb-made-up-1' && !('VIBESPACE_JOB_ID' in env) && !('VIBESPACE_JOB_TOKEN' in env)), '③ a hub started INSIDE a job keeps that job\'s ID for its boot line (the names are still dropped from its env) — RED: the job is forgotten at the drop', { kept: typeof TR.handedJobId === 'function' ? TR.handedJobId(r) : null });
  const none = TR.dropHandedAtBoot({ env: { PATH: '/usr/bin', HOME: '/home/userL' } });
  const odd = TR.dropHandedAtBoot({ env: { PATH: '/usr/bin', VIBESPACE_JOB_ID: 'not a job id; rm -rf' } });
  ok(!!(typeof TR.handedJobId === 'function' && TR.handedJobId(none) === null && TR.handedJobId(odd) === null), '③ CONTROL: the service start keeps no job; a handed id of another shape is never kept (a name only, from a fixed alphabet)');
  // r4564 (line 1031's cure): LEGS OF BEHAVIOUR over REAL record shapes — the bound IN FORCE (the last run's own record, else the tree's
  // one bound function) and the consequence TRUE TO ITS RUNG; the holder's start-again; the card's note by the same law
  const say = typeof M.startedInJobLine === 'function' ? M.startedInJobLine : () => '';
  const inForce = typeof M.boundInForceOf === 'function' ? M.boundInForceOf : () => ({ mb: 0, by: null, why: '' });
  const CG_POLICY = 'a scope of the user systemd (vs-job-x.scope, MemoryMax, OOMPolicy=stop)', CG_OLD = 'a scope of the user systemd (vs-job-x.scope, MemoryMax; systemd 249 has no OOMPolicy for a scope)';
  const jobOf = (bound, extra = {}) => ({ id: 'jb-made-up-1', name: 'build-box', runs: bound === undefined ? [] : [{ startedAt: 1, memoryBound: bound }], ...extra });
  // M1: a job with NO figure of its own, its run holding the ladder's default bound — the line says that size
  const j1 = jobOf({ mb: 4096, by: 'cgroup', why: CG_POLICY }), b1 = inForce(j1, {}), l1 = say('jb-made-up-1', { label: 'build box', mainIsHub: true, ...b1 });
  ok(!!(b1.mb === 4096 && /started INSIDE the background job "build box" \(jb-made-up-1\)/.test(l1) && /its memory bound of 4 GB holds VibeSpace and every conversation it starts — past it the whole job is stopped, VibeSpace and every conversation with it/.test(l1) && /VibeSpace does not start again by itself/.test(l1) && /«VibeSpace itself is never a job»/.test(l1)),
    '③ M1 + the cgroup rung with OOMPolicy=stop: a job with NO figure of its own whose run holds 4096 — the line says «4 GB» and the WHOLE job stopped (true there) — RED: no size', { line: l1 });
  const tipMb = (j1.memoryBound && j1.memoryBound.mb) || j1.memoryMb, lTip = say('jb-made-up-1', { label: 'build box', mb: tipMb });
  ok(!!(!(tipMb > 0) && !/4 GB/.test(lTip)), '③ M1 RED CONTROL: the first form read the RECORD (job.memoryBound, job.memoryMb) — such a job got no size at all', { tipMb });
  const b0 = inForce(jobOf(undefined), {}), l0 = say('jb-made-up-1', { label: 'fresh', ...b0 });
  ok(!!(b0.mb === 4096 && b0.by === null && /its memory bound of 4 GB can end VibeSpace and the conversations it started/.test(l0) && !/whole job is stopped/.test(l0)), '③ M1: no run record yet — the size from the tree\'s ONE bound function (memoryMbOf: the ladder\'s 4096), the consequence the SOFT sentence (its rung not read)', { b0, line: l0 });
  const bCap = inForce(jobOf(undefined, { memoryMb: 16384 }), { instanceMb: 8192 }), bLow = inForce(jobOf(undefined, { memoryMb: 100 }), {});
  ok(!!(bCap.mb === 6144 && bLow.mb === 256), '③ M1: a figure the instance\'s cap lowered is said lowered (16 GB asked, 6 GB in force on an 8 GB instance), a stored figure under the floor is said at the floor (100 → 256 MB) — never raw', { bCap, bLow });
  // M2: one leg a rung
  const lP = say('jb-made-up-1', { label: 'old scope', ...inForce(jobOf({ mb: 4096, by: 'cgroup', why: CG_OLD }), {}) });
  ok(!!(/past it the kernel stops ONE of them, which can be VibeSpace or a conversation/.test(lP) && !/whole job is stopped/.test(lP)), '③ M2 the cgroup rung WITHOUT OOMPolicy=stop (systemd < 253): the kernel stops ONE process — never «the whole job»', { line: lP });
  const lR = say('jb-made-up-1', { label: 'pod', ...inForce(jobOf({ mb: 4096, by: 'rlimit-data', why: 'RLIMIT_DATA on each process (no user systemd)' }), {}) });
  ok(!!(/its memory bound of 4 GB is each of its processes' own limit \(RLIMIT_DATA\) — a process that passes it fails its own allocation, VibeSpace's too/.test(lR) && !/whole job is stopped/.test(lR) && !/holds VibeSpace and every conversation/.test(lR)), '③ M2 the rlimit-data rung (a pod): each process its own limit, a process that passes it fails its own allocation — nothing «holds» them together', { line: lR });
  const lN = say('jb-made-up-1', { label: 'free', ...inForce(jobOf({ mb: 0, by: 'none', why: 'unbounded (the owner set 0)' }), {}) });
  ok(!!(/it runs under no memory bound of its own/.test(lN) && !/start again/.test(lN) && !/stopped/.test(lN)), '③ M2 no bound (the owner\'s 0): said unbounded — no consequence claimed', { line: lN });
  const lU = say('jb-made-up-2', null);
  ok(!!(/jb-made-up-2 \(a job this VibeSpace does not hold now: another VibeSpace's, or one it archived\)/.test(lU) && /its memory bound can end VibeSpace and the conversations it started/.test(lU) && !/whole job is stopped/.test(lU)),
    '③ the small: a job this VibeSpace does not hold NOW (another\'s, or one it archived) — the soft sentence', { line: lU });
  // r4673 (line 1031's cure round 2): THE START AGAIN is the RUNG's as well as the holder's. A launcher in the job (./run.sh: a
  // `while true` loop that runs the hub again after each exit) lives on where ONE process ends — the kernel's pick in an older scope,
  // a process's own data limit, a rung not read — and brings VibeSpace back inside the same scope or under the same inherited limit;
  // only a scope stopped WHOLE takes the launcher with it, and only a run whose main WAS this hub is never started again by itself
  const LAUNCH = "; if the job's own command starts VibeSpace again (a launcher such as ./run.sh), it comes back under the same bound.";
  const RL_WHY = 'RLIMIT_DATA on each process (no user systemd)';
  const SEEN_OWN = { label: 'pod', mainIsHub: true, ...inForce(jobOf({ mb: 4096, by: 'rlimit-data', why: RL_WHY }), {}) };
  const SEEN_OLD = { label: 'old scope', mainIsHub: true, ...inForce(jobOf({ mb: 4096, by: 'cgroup', why: CG_OLD }), {}) };
  const launcherSaid = (l) => l.includes(LAUNCH) && !/does not start again by itself/.test(l) && !/only that job's own VibeSpace may start it again/.test(l);
  const legA = (f) => launcherSaid(f('jb-made-up-1', SEEN_OWN)), legB = (f) => launcherSaid(f('jb-made-up-2', null)), legC = (f) => launcherSaid(f('jb-made-up-1', SEEN_OLD));
  ok(legA(say), '③ r4673 (a) the data-limit rung (a pod): ONE process passes its own limit, the launcher lives — the line says a launcher brings VibeSpace back under the same bound, never «does not start again by itself» — RED: the tip\'s holder sentence', { line: say('jb-made-up-1', SEEN_OWN) });
  ok(legB(say), '③ r4673 (b) a job this VibeSpace does not hold (its rung never read): the launcher clause, never «only that job\'s own VibeSpace may start it again» — RED: the tip\'s holder sentence', { line: lU });
  ok(legC(say) && launcherSaid(l0), '③ r4673 (c) an older scope (systemd < 253: the kernel stops ONE process) and a rung not read yet: the same launcher clause', { old: say('jb-made-up-1', SEEN_OLD), unread: l0 });
  const lW0 = say('jb-made-up-1', { label: 'build box', ...b1 }), lW2 = say('jb-made-up-1', { label: 'build box', mainIsHub: false, ...b1 });
  ok(!!(/; VibeSpace does not start again by itself\./.test(l1) && !l1.includes(LAUNCH) && ![lW0, lW2].some((l) => /start again by itself/.test(l) || l.includes(LAUNCH)) && !/start again|starts VibeSpace again/.test(lN)),
    '③ r4673 (d) a scope stopped WHOLE (the launcher stopped with it): «does not start again by itself» only when the run\'s main WAS this hub (the engine\'s hub-main fact); without that fact no restart is claimed; unbounded claims none', { l1, lW0, lW2 });
  // r4673's shoulds (lens two): a run not adopted yet holds the figure recorded AT ITS SPAWN; a cron's figure is its task's
  const SPAWNED = () => ({ id: 'jb-made-up-1', memoryMb: 16384, runs: [{ startedAt: 1, memoryMb: 6144, memoryAskedMb: 16384, memoryCap: { limitMb: 8192 } }] });
  const CRON = () => ({ id: 'jb-made-up-3', kind: 'cron', action: { task: { memoryMb: 2048 } }, runs: [] });
  const spawnLeg = (f) => f(SPAWNED(), { instanceMb: 32768 }).mb === 6144, cronLeg = (f) => f(CRON(), {}).mb === 2048;
  ok(spawnLeg(inForce) && cronLeg(inForce), '③ r4673 the bound in force with no wrapper record yet: the run\'s OWN spawn figure (6 GB, capped on the 8 GB instance it started on), never today\'s ladder (16 GB on a 32 GB instance); a cron\'s figure is its task\'s (2 GB), never the ladder\'s default', { spawned: inForce(SPAWNED(), { instanceMb: 32768 }), cron: inForce(CRON(), {}) });
  // THE REDS, placed in a copy of src/job-model.js (anchored edits): the tip 847a3050a's start again by its holder alone, on every rung;
  // the spawn figure's line cut; a cron read as itself
  {
    const JMSRC = fs.readFileSync(path.join(REPO, 'src/job-model.js'), 'utf8'), MJ = mutantCopies('hub-handed-drop-again', REPO);
    const AGAIN = `  const again = rung === 'none' ? '' : rung !== 'whole' ? "; if the job's own command starts VibeSpace again (a launcher such as ./run.sh), it comes back under the same bound"\n    : held && seen.mainIsHub === true ? '; VibeSpace does not start again by itself' : '';`;
    const TIP = `  const again = rung === 'none' ? '' : held ? '; VibeSpace does not start again by itself' : "; only that job's own VibeSpace may start it again";`;
    const Holder = MJ.load('src/job-model.js', anchored(JMSRC, AGAIN, TIP, 'r4673: the start again by its holder alone (847a3050a)'), 'again-holder');
    const reds = { a: !legA(Holder.startedInJobLine), b: !legB(Holder.startedInJobLine), c: !legC(Holder.startedInJobLine) };
    ok(!!(reds.a && reds.b && reds.c && /does not start again by itself/.test(Holder.startedInJobLine('jb-made-up-1', SEEN_OWN)) && /only that job's own VibeSpace may start it again/.test(Holder.startedInJobLine('jb-made-up-2', null))),
      'CONTROL (r4673): the tip\'s clause placed back (the holder alone, on every rung) — legs (a), (b) and (c) are red: «does not start again by itself» on the data-limit rung and in an older scope, «only that job\'s own VibeSpace may start it again» for a job not held', reds);
    const SpawnCut = MJ.load('src/job-model.js', anchored(JMSRC, "  if (run && finiteMb(run.memoryMb) !== null) return { mb: finiteMb(run.memoryMb), by: null, why: '' };\n", '', 'r4673: the spawn figure cut'), 'spawn-cut');
    const CronSelf = MJ.load('src/job-model.js', anchored(JMSRC, '  const m = memoryMbOf(own, ctx || {});', '  const m = memoryMbOf(job, ctx || {});', 'r4673: a cron read as itself'), 'cron-self');
    ok(!!(!spawnLeg(SpawnCut.boundInForceOf) && !cronLeg(CronSelf.boundInForceOf)), 'CONTROL (r4673\'s shoulds): the spawn figure\'s line cut reads today\'s ladder (16 GB), a cron read as itself the ladder\'s default (4 GB) — red', { spawnCut: SpawnCut.boundInForceOf(SPAWNED(), { instanceMb: 32768 }), cronSelf: CronSelf.boundInForceOf(CRON(), {}) });
  }
  const lNL = say('jb-made-up-1', { label: 'two\nlines', ...b1 });
  ok(!!(!/\n/.test(lNL) && /"two lines"/.test(lNL) && !/jbt-made-up/.test(l1 + l0 + lP + lR + lN + lU)), '③ one journal line: a label\'s line break is folded (never a second, forged line); never a value');
  // the CARD's hub note, by the same law (src/lib/jobs-layout.js hubBoundNote; the view carries the run's memoryBound)
  const JL = await import(new URL('../src/lib/jobs-layout.js', import.meta.url).href);
  const tt = (x) => x, card = (b, c = false) => (typeof JL.hubBoundNote === 'function' ? JL.hubBoundNote({ runsHub: true, memoryBound: b }, tt, c) : null);
  const cW = card({ mb: 4096, by: 'cgroup', why: CG_POLICY }), cP = card({ mb: 4096, by: 'cgroup', why: CG_OLD }), cR = card({ mb: 4096, by: 'rlimit-data', why: 'x' }), cU = card(null), cN = card({ mb: 0, by: 'none', why: 'x' });
  ok(!!(cW && /they all end together/.test(cW) && /kernel stops one of its processes/.test(cP || '') && !/end together/.test(cP || '') && /gets no more memory/.test(cR || '') && /can end VibeSpace/.test(cU || '') && cN === ''
    && card({ mb: 4096, by: 'cgroup', why: CG_POLICY }, true) === 'Runs VibeSpace: its memory bound ends it whole.' && card({ mb: 4096, by: 'rlimit-data', why: 'x' }, true) === 'Runs VibeSpace: its memory bound can end it.'),
    '③ THE CARD (B-2c5c r1263 / r1610), by the same law: «they all end together» only on a scope stopped whole; one process in an older scope; each process its own limit on RLIMIT_DATA; the soft sentence with no record; nothing unbounded — RED: «they all end together» on every rung', { cW, cP, cR, cU, cN });
  ok(!!(card({ mb: 4096, by: 'cgroup', why: CG_OLD }, true) === 'Runs VibeSpace: its memory bound can end it.' && card(null, true) === 'Runs VibeSpace: its memory bound can end it.' && card({ mb: 0, by: 'none', why: 'x' }, true) === ''),
    '③ r4673 (lens one\'s should) THE CARD\'s compact form on the older scope and with no record: «can end it», never «ends it whole»; nothing unbounded');
  // r4673 (both lenses' should): THE RUNG LAW is written twice — src/job-model.js boundRungOf (CJS) and the card's hubBoundNote (ESM,
  // imports nothing). The same record shapes, odd ones too, fed to both: one law
  const NOTE = { whole: /they all end together/, process: /kernel stops one of its processes/, own: /gets no more memory/, unknown: /its memory bound can end VibeSpace and the conversations it started/ };
  const noteRung = (b) => { const c = card(b); return c === '' ? 'none' : Object.keys(NOTE).find((k) => NOTE[k].test(c || '')) || '?'; };
  const rungOf = typeof M.boundRungOf === 'function' ? M.boundRungOf : () => '?';
  const SHAPES = [null, { mb: 4096, by: 'cgroup', why: CG_POLICY }, { mb: 4096, by: 'cgroup', why: CG_OLD }, { mb: 4096, by: 'rlimit-data', why: RL_WHY }, { mb: 0, by: 'none', why: 'x' }, { mb: 4096, by: 'none', why: 'x' }, { mb: 0, by: 'cgroup', why: CG_POLICY },
    { mb: 4096, by: null, why: '' }, { by: 'cgroup', why: CG_POLICY }, { mb: 0.5, by: 'rlimit-data', why: RL_WHY }, { mb: -1, by: 'cgroup', why: CG_OLD }, { mb: 4096, by: 'other', why: CG_POLICY }];
  const drift = SHAPES.map((b) => [JSON.stringify(b), rungOf(b), noteRung(b)]).filter(([, a, c]) => a !== c);
  ok(!!(drift.length === 0 && new Set(SHAPES.map((b) => rungOf(b))).size === 5), '③ r4673 THE RUNG LAW is one law: the journal\'s rung (boundRungOf) and the card\'s (hubBoundNote) agree on all twelve record shapes, the five rungs among them', drift);
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/jobs-wiring.js'), 'utf8'), manual = fs.readFileSync(path.join(REPO, 'docs/agent/background-work-manual.md'), 'utf8'), panel = fs.readFileSync(path.join(REPO, 'src/lib/jobs-panel.js'), 'utf8');
  const iInit = wiring.indexOf("try { jm.init(); } catch (e) { log('[jobs] init threw (isolated):', e.message); }"), iSay = wiring.indexOf("M.startedInJobLine(id, job ? { label: jm.labelOf(job), mainIsHub: !!(run && typeof jm._hubMainOf === 'function' && jm._hubMainOf(run, null)), ...M.boundInForceOf(job,");
  ok(!!(iInit > 0 && iSay > iInit && iSay - iInit < 800 && wiring.split('M.startedInJobLine(').length === 2 && /catch \(e\) \{ log\('\[jobs\] the boot could not say which job holds this VibeSpace —', e && e\.message\); \}/.test(wiring) && panel.includes('hubBoundNote(j, t, compact)')),
    '③ production\'s names: the line is said ONCE (one call), right after the job engine\'s init, with the bound IN FORCE (boundInForceOf over the engine\'s context), the name through labelOf and the run\'s hub-main fact through the engine\'s one accessor (r4673); its failure is logged; the card takes the note by rung');
  ok(!!(manual.includes('### VibeSpace itself is never a job') && /the whole job is stopped, VibeSpace and every\s+conversation it started together/.test(manual) && /in an older scope, the kernel stops ONE of the job's processes/.test(manual) && /RLIMIT_DATA, as on a pod/.test(manual) && /another VibeSpace's service job may be,\s+once/.test(manual) && /Where ONE process ends \(an older scope, or RLIMIT_DATA\), a launcher in the job such as `\.\/run\.sh` \(it starts VibeSpace again\s+after each exit\) can bring VibeSpace back, under the same bound; where the scope is stopped whole, the launcher ends with it\./.test(manual) && /on a pod, the pod's own restart/.test(manual) && /another checkout's VibeSpace/.test(manual) && /clock steps\n?\s*forward/.test(manual) && /lost from the job's log/.test(manual)),
    '③ the Background Work manual, by the same law: what passing the bound does, rung by rung; a launcher\'s start again where one process ends (r4673); the job\'s start-again by holder; a pod\'s own restart; another checkout, a clock step, its output');
}
report();

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
  const say = typeof M.startedInJobLine === 'function' ? M.startedInJobLine : () => '';
  const known = say('jb-made-up-1', { label: 'build box', mb: 4096 }), unknown = say('jb-made-up-2', null), nobound = say('jb-made-up-3', { label: 'no bound', mb: 0 });
  ok(!!(/started INSIDE the background job "build box" \(jb-made-up-1\)/.test(known) && /its memory bound of 4 GB holds VibeSpace and every conversation it starts/.test(known) && /the whole job is stopped, VibeSpace with it, and nothing starts it again/.test(known) && /«VibeSpace itself is never a job»/.test(known)
    && /a job this VibeSpace does not know: another VibeSpace's/.test(unknown) && /where it has one/.test(nobound) && !/jbt-made-up/.test(known + unknown + nobound)),
    '③ THE LAW: the boot\'s line names the job, its bound with its size, what passing it does (the whole job stopped, VibeSpace with it, nothing starts it again) and the sanctioned start; a job this hub does not know is said so; never a value — RED: nothing said', { known, unknown });
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/jobs-wiring.js'), 'utf8'), manual = fs.readFileSync(path.join(REPO, 'docs/agent/background-work-manual.md'), 'utf8');
  const iInit = wiring.indexOf("try { jm.init(); } catch (e) { log('[jobs] init threw (isolated):', e.message); }"), iSay = wiring.indexOf("require('./throwaway-root.js').handedJobId(); if (id) { const job = jm.jobs && jm.jobs.get(id); log(M.startedInJobLine(id, job ? { label: jm.labelOf(job), mb: (job.memoryBound && job.memoryBound.mb) || job.memoryMb } : null)); }");
  ok(!!(iInit > 0 && iSay > iInit && iSay - iInit < 600), '③ production\'s names: the job engine says the line once, right after its init read the job\'s record — its name through labelOf, the ONE accessor (src/server/jobs-wiring.js)', { iInit, iSay });
  ok(!!(manual.includes('### VibeSpace itself is never a job') && /Past it, the whole job is stopped/.test(manual) && /another checkout's VibeSpace/.test(manual) && /clock steps\n?\s*forward/.test(manual) && /lost from the job's log/.test(manual)),
    '③ the Background Work manual says it: VibeSpace is its service, never a job — the bound, another checkout, a clock step, its output (主开发 r4380: (3), (4b), (4c), (4d))');
}
report();

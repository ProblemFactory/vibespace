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
//     mark is driven here: every name its real command line sets is in the mark it carries.
//  REDS: the act ignoring the mark; the family catch-all back; each fixed clause cut (the app mark, the page helpers); each
//  exemption cut (the session names, the credential rows, the instance name); a remote assignment its mark does not list.
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
// the remote shell's TYPED mark, driven: every name its REAL command line sets (the assignments before the program and its env
// pairs) is in the mark the same line carries
const shq = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;
const remoteLine = RS.buildRemoteExec({ cwd: '/w', shq, browser: 'export AGENT_BROWSER_PROFILE=p; ', tokenAssign: RS.acctSecretAssign('CLAUDE_CODE_OAUTH_TOKEN', '/r/tok'),
  acctEnv: RS.acctFolderAssign('CLAUDE_CONFIG_DIR', '$HOME/.claude-acct'), parts: [`VIBESPACE_API=${shq('http://outer-hub.invalid')}`, `CLAUDE_WEBUI_SESSION_ID=${shq('sid')}`, 'claude', '--print'] });
const setNames = (l) => {
  const at = l.indexOf('exec env '), names = new Set();
  for (const m of l.slice(0, at < 0 ? l.length : at).matchAll(/(?:^|[\s;])(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/g)) names.add(m[1]);
  if (at >= 0) for (const p of l.slice(at + 9).split(' ')) { const m = /^'?([A-Za-z_][A-Za-z0-9_]*)=/.exec(p); if (!m) break; names.add(m[1]); }
  names.delete(CE.HANDED_MARK);
  return [...names].sort();
};
const typedGap = (l) => { const m = new RegExp(CE.HANDED_MARK + "='([^']*)'").exec(l); if (!m) return ['no mark on the remote command line']; const marked = CE.namesOfMark(m[1]); return setNames(l).filter((k) => !marked.includes(k)); };
{
  const gap = typedGap(remoteLine), set = setNames(remoteLine);
  ok(!!joined.every(Boolean), `④ the desktop app road is joined to test-architecture §112's three lists — its sites, its roads (the app's mark by its own line) and each site's road (${JSON.stringify(joined)})`, joined);
  ok(!!(!gap.length && set.length >= 6 && ['VIBESPACE_SESSION_CWD', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR', 'AGENT_BROWSER_PROFILE', 'VIBESPACE_API', 'CLAUDE_WEBUI_SESSION_ID'].every((k) => set.includes(k))), `④ the remote shell's typed mark: every name its real command line sets (${set.length}: the cwd export, the token and account assignments, the browser export, the env pairs) is in the mark it carries`, { set, gap });
  const plantedGap = typedGap(remoteLine.replace('exec env ', 'VIBESPACE_EXTRA=1 exec env '));
  ok(!!plantedGap.includes('VIBESPACE_EXTRA'), 'CONTROL (the typed mark\'s census): a remote assignment its mark does not list is red by name', plantedGap);
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
report();

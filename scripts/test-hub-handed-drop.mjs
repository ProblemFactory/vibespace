#!/usr/bin/env node
// r2271 (lane lg-group-parents) — A HUB's OWN ENVIRONMENT NEVER HOLDS WHAT A PARENT CONVERSATION, JOB OR APP HANDED. A hub started
// inside a VibeSpace finds the handed mark (src/conversation-env.js HANDED_MARK, names only) and, at its BOOT before any child,
// drops every name the mark lists, the mark, the app's process mark, the two page-helper names and every VibeSpace name that is
// not its own knob row (src/server/throwaway-root.js dropHandedAtBoot, called by src/server/runtime-boot.js right after the
// re-home). A hub with no mark changes nothing (the production start). The job names go in every case (moved from the jobs engine).
//  ① a conversation's child env, marked by the real road helper: everything handed goes; the hub's knobs, its kit switch and the
//     person's session names stay; a credential of a person's own hub goes too (not a knob row: the throwaway start's rule)
//  ② NO mark (the service start): nothing changes but job names
//  ③ the order and the roads: runtime-boot calls the act right after the re-home and says its line; the desktop app road writes
//     the mark; the two raw sites take a built env
//  RED: the act ignoring the mark; the act keeping every VibeSpace name
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
const KNOB = 'VIBESPACE_JOBS_GRACE_MS', SWITCH = 'VIBESPACE_SKIP_AGENT_HOOKS', CRED = 'VIBESPACE_FRPS_TOKEN';
// the hub that started the conversation (the OUTER hub's own env) and the conversation's child env, marked by the road's helper
const outerHub = { PATH: '/usr/bin', HOME: '/home/userL', LANG: 'C.UTF-8', [KNOB]: '9000' };
const base = A.agentEnv(outerHub);
const handed = { ...base, VIBESPACE_API: 'http://outer-hub.invalid', VIBESPACE_SESSION_TOKEN: ['vsst', 'planted'].join('_'), VIBESPACE_TASK_ID: 'T-outer', VIBESPACE_KEEPER_DIR: '/outer/keeper',
  CLAUDE_WEBUI_SESSION_ID: 'outer-sid', CLAUDE_WEBUI_PORT: 'outer-port', CODEX_HOME: '/outer/data/codex-subs/acct', VIBESPACE_DESKTOP_APP: 'app-outer' };
const child = CE.withHandedMark(handed, base);
const listed = CE.namesOfMark(child[CE.HANDED_MARK]);
// ① the inner hub's env = the conversation's child env + what the operator set for the inner hub (its knob, its kit switch, a credential) + a job's names
const scene = (Mod) => {
  const env = { ...child, [KNOB]: '100', [SWITCH]: '1', [CRED]: 'x', VIBESPACE_JOB_ID: 'jb-outer', VIBESPACE_JOB_TOKEN: 'jbt' };
  const r = Mod.dropHandedAtBoot({ env });
  return { env, r };
};
{
  const { env, r } = scene(TR);
  const gone = ['VIBESPACE_API', 'VIBESPACE_SESSION_TOKEN', 'VIBESPACE_TASK_ID', 'VIBESPACE_KEEPER_DIR', 'CLAUDE_WEBUI_SESSION_ID', 'CLAUDE_WEBUI_PORT', 'CODEX_HOME', 'VIBESPACE_DESKTOP_APP', CE.HANDED_MARK, 'VIBESPACE_JOB_ID', 'VIBESPACE_JOB_TOKEN'];
  ok(!!(listed.includes('VIBESPACE_API') && listed.includes('CODEX_HOME') && listed.includes('CLAUDE_WEBUI_PORT') && !listed.includes('PATH') && !listed.includes('HOME')), `① the road's mark names what it handed (the address, the bearer, the folder, the CLI home, the page helpers) and no session name (${listed.length} names)`, listed);
  ok(!!(r.by === 'mark' && gone.every((k) => !(k in env))), `① a hub started inside a conversation drops what it was handed: ${r.dropped.length} names, the mark and the job names among them`, r);
  ok(!!(env[KNOB] === '100' && env[SWITCH] === '1' && env.PATH === '/usr/bin' && env.HOME === '/home/userL' && env.LANG === 'C.UTF-8'), '① its own knob, the kit\'s switch for the hubs it starts and the person\'s session names stay', env);
  ok(!!(!(CRED in env)), '① a credential of a person\'s own hub is not a knob row: it goes too (the throwaway start\'s rule, applied to the environment alone)');
  ok(!!(/started inside a VibeSpace/.test(TR.handedLine(r) || '') && !/vsst_planted|T-outer|outer-hub\.invalid/.test(TR.handedLine(r) || '')), '① the boot says it once, names only — never a value');
}
{
  // ② NO mark: the production start — an operator's own values stand
  const env = { PATH: '/usr/bin', HOME: '/home/userL', VIBESPACE_API: 'http://inner-hub.invalid', [KNOB]: '5', [CRED]: 'x', CLAUDE_WEBUI_PORT: 'inner-port' };
  const before = JSON.stringify(env);
  const r = TR.dropHandedAtBoot({ env });
  ok(!!(r.by === 'none' && JSON.stringify(env) === before && TR.handedLine(r) === null), '② a hub with no handed mark (the service start) changes nothing: an operator\'s own values stand');
}
{
  // ③ the order and the roads
  const RB = fs.readFileSync(path.join(REPO, 'src/server/runtime-boot.js'), 'utf8');
  ok(!!(RB.includes('  TR.rehomeAtBoot({ root: rootDir, env });\n  TR.dropHandedAtBoot({ env });') && RB.indexOf('TR.dropHandedAtBoot({ env });') < RB.indexOf('booted = create({') && RB.includes('TR.handedLine()')), '③ PIN: the boot runs the act right after the re-home, before anything is created, and says its line');
  const DS = fs.readFileSync(path.join(REPO, 'src/desktop-serve.js'), 'utf8');
  ok(!!(DS.includes('appEnv[CE.HANDED_MARK] = CE.markOf(CE.handedNames(appEnv, env()));')), '③ PIN: the desktop app road writes the handed mark on the app\'s env (a hub started from its terminal drops what the app was handed)');
  const UR = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8'), CT = fs.readFileSync(path.join(REPO, 'src/codex-thread-read.js'), 'utf8');
  ok(!!(UR.includes("const env = require('./agent-env.js').agentEnv(process.env);") && !UR.includes('const env = { ...process.env };') && CT.includes("readThreadViaAppServer(threadId, { codexCmd, timeoutMs, env: require('./agent-env.js').agentEnv(process.env) })")), '③ PIN: the usage probe and the codex thread read take a built env, never the hub\'s whole one');   // stale-pins: kept (a deliberate absence check)
}
{
  const M = mutantCopies('hub-handed-drop', REPO);
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/throwaway-root.js'), 'utf8');
  const Blind = M.load('src/server/throwaway-root.js', anchored(SRC, '  const has = Object.prototype.hasOwnProperty.call(env, CE.HANDED_MARK);\n', '  const has = false;\n', 'the act ignoring the mark'), 'blind');
  const b = scene(Blind);
  ok(!!(b.env.VIBESPACE_API === 'http://outer-hub.invalid' && b.env.VIBESPACE_SESSION_TOKEN), 'CONTROL (the act ignoring the mark): the outer hub\'s address and its conversation\'s bearer stay in the inner hub\'s env — every child takes them — red');
  const Keep = M.load('src/server/throwaway-root.js', anchored(SRC, " || (k.startsWith('VIBESPACE_') && !rows.has(k))", '', 'the act keeping every VibeSpace name'), 'keep-all');
  const k = scene(Keep);
  ok(!!(k.env[CRED] === 'x'), 'CONTROL (the act keeping every VibeSpace name not on the mark): a name outside the hub\'s own rows stays — red');
}
report();

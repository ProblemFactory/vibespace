/**
 * THE SESSION SPAWN LINE (lane antigravity-spawn-argv, 2026-10-21) — PURE. The ONE builder of what a local session's
 * dtach (or the R6 daemon pipe) runs, for every harness — claude, codex, the ACP agents, antigravity, a shell terminal,
 * the remote roads' local ssh:
 *
 *     node <wrapper> <bufferFile> <metaFile> <ONE executable> …its args          + the session's env
 *
 * THE WRAPPER CONTRACT (data/bin/*-wrapper.js): argv[4] is ONE executable and argv[5…] are ITS args. chat-wrapper
 * appends its stream flags after them; agy-wrapper puts its own flags FIRST (`agy --input-format stream-json … <the
 * settings row's extra args>`). Both read argv[4] as the program they run.
 *
 * THE SESSION'S NAMES RIDE THE SPAWN'S ENV, NEVER THE LINE. EDITOR, the session id and token, PATH, the display, the
 * browser pairs and the adapter's env all go there. The wrapper is born with that env and hands it to its CLI
 * (`env: process.env`).
 *
 * Until 2.369.336 they rode the line as an `env K=V … <cli>` prefix INSIDE the wrapper's argv. That made `/usr/bin/env`
 * the program agy-wrapper ran, with agy's flags in front of the assignments (`env --input-format …` ⇒ env's usage exit
 * 125), so every Antigravity conversation died at its start. It also put the session token in /proc/<pid>/cmdline,
 * which every user of the machine can read, for the whole life of every session (and into the wrappers' spawn logs).
 * test-session-spawn-line is the table and its mutant.
 */
'use strict';

const ASSIGN = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/;

/** `K=V` strings (the pairs the create path collects) → an env object; a later pair wins, as `env K=V` did. */
function pairsEnv(pairs) {
  const out = {};
  for (const p of pairs || []) {
    const m = ASSIGN.exec(String(p));
    if (!m) throw new Error(`session spawn line: not a NAME=value pair: ${String(p).slice(0, 80)}`);
    out[m[1]] = m[2];
  }
  return out;
}

/** Why `exe` cannot be the line's executable, or null. A launcher (`env`) or an assignment in the executable's place
 *  is the shape that killed every Antigravity start: refused here, by name, before anything spawns. */
function exeRefusal(exe) {
  const s = exe == null ? '' : String(exe);
  if (!s.trim()) return 'session spawn line: no executable';
  if (ASSIGN.test(s)) return `session spawn line: an env assignment where the executable goes: ${s.split('=')[0]}=…`;
  if (/(^|\/)env$/.test(s)) return `session spawn line: ${s} is a launcher, not the agent's executable — the session's names ride the spawn's env`;
  return null;
}

/** THE LINE: { argv, env } — argv for dtach's tail / the daemon pipe, env for that spawn's `env` option.
 *  `env` = the base the create built (agentEnv + the session's names); `pairs` join it (a later pair wins). */
function sessionSpawnLine({ node, wrapper, bufFile, metaFile, exe, args = [], env = {}, pairs = [] }) {
  const why = exeRefusal(exe);
  if (why) throw new Error(why);
  return {
    argv: [node, wrapper, bufFile, metaFile, String(exe), ...(args || []).map(String)],
    env: { ...env, ...pairsEnv(pairs) },
  };
}

module.exports = { sessionSpawnLine, pairsEnv, exeRefusal };

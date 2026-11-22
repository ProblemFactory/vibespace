#!/usr/bin/env node
// THE DEVICE AGENT'S SESSIONS — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED
// VERBATIM from the heavy scripts/test-agentd-session.mjs, whose real daemons, the env strip and its PRE-FIX control stay
// there: the wiring pins — the three daemon birth sites name the sanitizer, and no raw process.env env literal survives in the
// daemon tier (with the raw-literal rule's own control). Each reads the file it pins BY NAME, so ci.mjs's affected rule selects
// this suite on a change of that file.
// UNCONDITIONAL HERE, ON PURPOSE (a stronger gate than the heavy's): in the heavy these pins sat in the `else` branch of
// `if (!fs.existsSync('/proc/self/environ'))`, so a host without procfs skipped them with the environ legs. They read only
// source text, which every host has, so here they run on every host.
// Run: node scripts/test-agentd-session-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');

let failed = 0;
const check = (name, cond, extra) => { if (typeof name !== 'string') throw new TypeError(`check(): the name is a ${typeof name} — swapped arguments (B-1747: a swap is a crash, never a green leg)`);
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};

console.log('— the daemon is a second holder: a cluster secret in the server env reaches neither the daemon nor its children —');
{
  const ANCHOR = 'const merged = { ...daemonEnv(process.env), ...(extra || {}) };';

  // wiring pins: the three daemon birth sites + the child base name the sanitizer, and no raw process.env env literal survives in the daemon tier
  const clientSrc = fs.readFileSync(path.join(repo, 'src/agentd/client.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const daemonSrc = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  // B-6be2 (lane jobenv-strip-census): the daemon birth also drops the harness credential names — `daemonEnv(process.env, { drop: … })`
  check('WIRING: _spawnLocal spawns the daemon from daemonEnv(process.env[, { drop }])', /env:\s*\{\s*\.\.\.daemonEnv\(process\.env(?:\)|,\s*\{\s*drop:)/.test(clientSrc));
  // r2224 (4): the hub's own local daemon is born WITHOUT the hub's inherited address — a pipe session's env is laid over the daemon's
  // own, so a start with Integration OFF (which hands none) would get back the address of a VibeSpace the hub was started inside
  const NO_API = /daemonEnv\(process\.env,\s*\{\s*drop:\s*[^\n]*\.concat\('VIBESPACE_API'\)\s*\}\)/;
  check('WIRING (r2224 (4)): _spawnLocal drops VIBESPACE_API from the local daemon\'s birth env', NO_API.test(clientSrc));
  check('CONTROL: the drop rule is red on the birth line without the name', !NO_API.test(clientSrc.replace(".concat('VIBESPACE_API')", '')));
  check('WIRING: spawnEnv() merges over daemonEnv(process.env), and the --stdio bridge + the upgrade re-exec are born from it too', daemonSrc.includes(ANCHOR) && (daemonSrc.match(/daemonEnv\(process\.env\)/g) || []).length >= 3);
  const RAW = /env:\s*(?:process\.env\b|\{\s*\.\.\.process\.env\b)/;
  check('WIRING: no `env: process.env` / `env: { ...process.env` literal survives in src/agentd/{client,agentd}.js', !RAW.test(clientSrc) && !RAW.test(daemonSrc));
  check('CONTROL: the raw-literal rule matches the retired spellings', RAW.test('spawn(x, [], { env: { ...process.env, A: 1 } })') && RAW.test('{ detached: true, stdio: "ignore", env: process.env,') && !RAW.test('env: daemonEnv(process.env)') && !RAW.test('env: spawnEnv(msg.env)'));
}

console.log(failed ? `\n${failed} FAILED` : '\nagentd session text pins passed');
process.exit(failed ? 1 : 0);

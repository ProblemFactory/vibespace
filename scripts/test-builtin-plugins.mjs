#!/usr/bin/env node
// BUILT-IN PLUGINS — ONE REGISTRY, NO ID DISPATCH (lane dc-plugins, 2026-10-04; rv-server H3 + rv-client F9).
// A built-in plugin is ONE file src/plugins/<id>.js + ONE line in src/plugins/index.js; src/plugins.js keeps the
// generic lifecycle and hands every verb to the plugin that declares it.
//   ① the contract: a broken plugin is refused BY NAME when the manager registers the list
//   ② THE PROOF: a fake built-in plugin file registered through THE list (a copy of src/plugins/index.js with ONE
//      added line) drives install / start / status / setup / config / enabled / boot replay / stop through the
//      REAL, unedited src/plugins.js; an undeclared verb and an unknown id are refused by name
//   ③ the relay surface (frpPublish / frpUnpublish / setSelfDialSub) reaches whichever plugin DECLARES 'relay'
//   ④ CONTROL: a copy of src/plugins.js with the pre-fix id dispatch restored in start() (`if (id === 'frp') …`
//      + `if (id !== 'tailscale') throw`) ⇒ the fake's start is refused ⇒ ② goes red
// The static half (no member id in src/plugins.js or the client, derived from the list) is test-architecture §80.
// Run: node scripts/test-builtin-plugins.mjs   (in-process: no network, no daemon, a scratch HOME)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); }
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-bip-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
// a scratch HOME (the plugin root is ~/.vibespace/plugins) and no cluster relay env (frp's default-on replay)
process.env.HOME = path.join(tmp, 'home');
for (const k of Object.keys(process.env)) if (/^VIBESPACE_FRP/.test(k)) delete process.env[k];
const FAKE_SERVE = { facts: () => null, serveEnvOverride: () => null }; // the opencode-serve plugin never reaches a real keeper

// ── the fake built-in plugin FILE (what a new member would add) ──
const ACME = path.join(tmp, 'acme-tunnel.js');
fs.writeFileSync(ACME, `const calls = [];
module.exports = {
  id: 'acme-tunnel', label: 'Acme tunnel', description: 'a fake built-in plugin (test-builtin-plugins)', provides: ['tunnel'],
  calls,
  create(h) {
    let up = false;
    return {
      async install() { calls.push('install'); h.rec().installedAt = 1; h.save(); h.notify(); return { installed: true, dir: h.dir }; },
      start() { calls.push('start'); up = true; h.rec().desiredUp = true; h.save(); h.notify(); return { starting: true }; },
      stop() { calls.push('stop'); up = false; h.rec().desiredUp = false; h.save(); h.notify(); return { stopped: true }; },
      status() { const r = h.peek(); return { installed: !!r.installedAt, running: up, desiredUp: !!r.desiredUp, configured: true }; },
      setup() { calls.push('setup'); return Promise.resolve({ authUrl: 'https://acme.invalid/login' }); },
      config(patch) { calls.push('config'); h.rec().config = { token: String(patch.token || '') }; h.save(); h.notify(); return { saved: true }; },
    };
  },
};
`);
const ID = 'acme-tunnel';
const acme = require(ACME);

// ── registration through THE list: a copy of src/plugins/index.js with ONE added line, standing in for the real one ──
const M = mutantCopies('builtin-plugins', REPO);
const LIST_REL = 'src/plugins/index.js', CORE_REL = 'src/plugins.js';
const listSrc = fs.readFileSync(path.join(REPO, LIST_REL), 'utf8');
const listMut = listSrc.replace(/\];\s*$/, `  require(${JSON.stringify(ACME)}),\n];\n`);
const added = listMut.split('\n').filter((l) => !listSrc.split('\n').includes(l));
ok('the registration is ONE added line in src/plugins/index.js', added.length === 1 && added[0].includes(ACME), added);
const listCopy = M.load(LIST_REL, listMut, 'acme');
const realList = require.resolve(path.join(REPO, LIST_REL)), realCore = require.resolve(path.join(REPO, CORE_REL));
delete require.cache[realCore];
require.cache[realList] = { id: realList, filename: realList, loaded: true, exports: listCopy, children: [], paths: [] };
const core = require(realCore); // the REAL src/plugins.js — not one byte edited
ok('src/plugins.js is loaded from the tree, unedited (zero core edits for a new member)', require.cache[realCore]?.exports === core && fs.readFileSync(realCore, 'utf8') === fs.readFileSync(path.join(REPO, CORE_REL), 'utf8'));

console.log('① the contract is checked at registration, refusals BY NAME');
{
  const { PluginManager, validatePlugin } = core;
  const dataDir = fs.mkdtempSync(path.join(tmp, 'contract-'));
  const refuse = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
  const verbs = { install: async () => ({}), start: () => ({}), stop: () => ({}), status: () => ({}) };
  const def = (o) => ({ id: 'acme-x', label: 'Acme X', description: 'x', provides: [], create: () => ({ ...verbs }), ...o });
  const reg = (o) => refuse(() => new PluginManager({ dataDir, plugins: [def(o)] }));
  ok('a valid member registers', reg({}) === null, reg({}));
  ok('an id that is not a kebab word', /built-in plugin Acme X: id must be a kebab-case word/.test(reg({ id: 'Acme X' }) || ''), reg({ id: 'Acme X' }));
  ok('no label', /built-in plugin acme-x: label missing/.test(reg({ label: '' }) || ''), reg({ label: '' }));
  ok('provides is not a list of capability words', /acme-x: provides must be/.test(reg({ provides: 'relay' }) || ''), reg({ provides: 'relay' }));
  ok('a required verb missing (stop)', /acme-x: verb stop\(\) missing/.test(reg({ create: () => ({ ...verbs, stop: undefined }) }) || ''));
  ok('a declared capability obliges its verbs (relay ⇒ publish)', /acme-x: verb publish\(\) missing/.test(reg({ provides: ['relay'] }) || ''));
  ok('an optional verb that is not a function', /acme-x: setup must be a function/.test(reg({ create: () => ({ ...verbs, setup: 'yes' }) }) || ''));
  ok('the same id twice', /acme-x: registered twice/.test(refuse(() => new PluginManager({ dataDir, plugins: [def({}), def({})] })) || ''));
  ok('validatePlugin is the ONE check (exported for the static shape)', refuse(() => validatePlugin(def({}))) === null && /create\(h\) missing/.test(refuse(() => validatePlugin(def({ create: null }))) || ''));
  const builtins = ['tailscale', 'frp', 'opencode-serve'].map((f) => require(path.join(REPO, `src/plugins/${f}.js`)));
  const real = new PluginManager({ dataDir, opencodeServe: FAKE_SERVE, plugins: builtins });
  const d = real.defs();
  ok('the three built-ins declare their capability (tunnel / relay / serve)', d.tailscale?.provides?.join() === 'tunnel' && d.frp?.provides?.join() === 'relay' && d['opencode-serve']?.provides?.join() === 'serve', d);
}

// ② the drive: every verb of the fake through the generic manager
async function drive(PluginManager, tag) {
  acme.calls.length = 0;
  const dataDir = fs.mkdtempSync(path.join(tmp, tag + '-'));
  const seen = [];
  const pm = new PluginManager({ dataDir, broadcast: (m) => seen.push(m), opencodeServe: FAKE_SERVE });
  const out = {};
  const step = async (k, fn) => { try { out[k] = await fn(); } catch (e) { out[k] = { error: e.message }; } };
  await step('install', () => pm.install(ID));
  await step('start', () => pm.start(ID));
  await step('status', () => pm.status(ID));
  await step('setup', () => pm.loginStart(ID));
  await step('config', () => pm.setConfig(ID, { token: 't1' }));
  await step('enabled', () => { pm.setEnabled(ID, true); return true; });
  await step('mode', () => pm.setMode(ID, 'auto'));
  await step('unknown', () => pm.start('no-such-plugin'));
  await step('row', () => pm.list().find((p) => p.id === ID) || null);
  await step('service', () => pm.serviceState(ID));
  out.saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'plugins.json'), 'utf8')).plugins[ID];
  // a restart: a NEW manager over the same state replays the enabled + desiredUp member (the generic replay)
  const before = acme.calls.length;
  await step('replay', () => { new PluginManager({ dataDir, broadcast: () => {}, opencodeServe: FAKE_SERVE }).bootReplay(); return acme.calls.slice(before); });
  await step('stop', () => pm.stop(ID));
  out.after = JSON.parse(fs.readFileSync(path.join(dataDir, 'plugins.json'), 'utf8')).plugins[ID];
  out.broadcasts = seen.filter((m) => m.type === 'plugins-updated' && Array.isArray(m.plugins) && m.plugins.some((p) => p.id === ID)).length;
  out.calls = [...acme.calls];
  return out;
}
const judge = (o) => [
  ['install answers through the generic code, in the member\'s own dir', o.install?.installed === true && o.install.dir === path.join(process.env.HOME, '.vibespace', 'plugins', ID)],
  ['start', o.start?.starting === true],
  ['status', o.status?.installed === true && o.status.running === true],
  ['setup (the guided-setup verb behind /login)', o.setup?.authUrl === 'https://acme.invalid/login'],
  ['config is the member\'s and persists in data/plugins.json', o.config?.saved === true && o.saved?.config?.token === 't1'],
  ['the enabled switch is the generic boot flag', o.enabled === true && o.saved?.enabled === true],
  ['an undeclared verb is refused BY NAME', /the Acme tunnel plugin has no mode step/.test(o.mode?.error || '')],
  ['an unknown id is refused by name', o.unknown?.error === 'unknown plugin: no-such-plugin'],
  ['the panel row carries the declared label + provides', o.row?.label === 'Acme tunnel' && o.row.provides?.join() === 'tunnel' && o.row.enabled === true && o.row.running === true],
  ['the compact service row', o.service?.id === ID && o.service.installed === true && o.service.running === true],
  ['boot replay: enabled + desiredUp ⇒ the generic replay starts it', Array.isArray(o.replay) && o.replay.join() === 'start'],
  ['stop clears desiredUp', o.stop?.stopped === true && o.after?.desiredUp === false],
  ['every state change broadcasts plugins-updated with the member\'s row', o.broadcasts >= 4],
];

console.log('② THE PROOF: a fake member registered through the one list drives the generic lifecycle');
const real = await drive(core.PluginManager, 'real');
for (const [n, c] of judge(real)) ok(n, c, c ? undefined : real);
ok('…and every verb reached the member\'s own file', ['install', 'start', 'setup', 'config', 'start', 'stop'].every((v) => real.calls.includes(v)), real.calls);

console.log('③ the relay surface reaches whichever plugin DECLARES relay');
{
  const calls = [];
  const base = { install: async () => ({}), start: () => ({}), stop: () => ({}), status: () => ({}) };
  const relay = { id: 'acme-relay', label: 'Acme relay', description: 'x', provides: ['relay'], create: () => ({ ...base,
    publish: async (n, p, o) => { calls.push(['publish', n, p, o?.proto]); return { url: 'https://r.invalid/' + n }; },
    unpublish: async (n) => { calls.push(['unpublish', n]); return { ok: true }; },
    setSelfDialSub: (s) => { calls.push(['sub', s]); } }) };
  const dataDir = fs.mkdtempSync(path.join(tmp, 'relay-'));
  const pm = new core.PluginManager({ dataDir, plugins: [relay] });
  const pub = await pm.frpPublish('svc', 8080, { proto: 'http' });
  await pm.frpUnpublish('svc'); pm.setSelfDialSub('stable');
  ok('providerId(relay) names the declaring member', pm.providerId('relay') === 'acme-relay' && pm.providerId('tunnel') === null);
  ok('publish / unpublish / setSelfDialSub land on it', pub?.url === 'https://r.invalid/svc' && JSON.stringify(calls) === JSON.stringify([['publish', 'svc', 8080, 'http'], ['unpublish', 'svc'], ['sub', 'stable']]), calls);
  const none = new core.PluginManager({ dataDir, plugins: [{ ...relay, id: 'acme-plain', provides: [] }] });
  let err = null; try { await none.frpPublish('svc', 8080); } catch (e) { err = e.message; }
  ok('no relay member ⇒ refused by name', /no plugin on this instance provides relay/.test(err || ''), err);
}

console.log('④ CONTROL: the pre-fix id dispatch restored in a copy of src/plugins.js');
{
  const src = fs.readFileSync(realCore, 'utf8');
  const a = "  start(id) { return this._verb(id, 'start')(); }\n";
  const b = "  start(id) {\n    if (id === 'frp') return this._verb(id, 'start')();\n    if (id !== 'tailscale') throw new Error('unknown plugin: ' + id);\n    return this._verb(id, 'start')();\n  }\n";
  ok('CONTROL: the patch applies (start only)', src.split(a).length === 2);
  const mut = M.load(CORE_REL, src.replace(a, b), 'id-dispatch');
  const red = await drive(mut.PluginManager, 'control');
  const failed = judge(red).filter(([, c]) => !c).map(([n]) => n);
  ok('CONTROL: the fake member\'s start is refused by the id branch ⇒ ② goes RED', red.start?.error === 'unknown plugin: acme-tunnel' && failed.length > 0, { start: red.start, failed });
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 2, label: 'mutant-copy (builtin-plugins): ' })) ok(r.name, r.pass, r.detail);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

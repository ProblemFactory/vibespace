#!/usr/bin/env node
// THE VAULT LAW (lane vault-e2e-password; it REPLACES the key-file law's files — docs/kb-design-lessons.md «The vault law»):
// a store key is never minted or read outside the vault; a locked vault answers vault_locked by name; NO AUTO-UNLOCK
// EXISTS. Fast tier: acorn tokens over src/ + server.js + data/bin (comments never count), mutants judged in memory, and
// the real stores over a real engine.
//   ① NO AUTO-UNLOCK SHAPE anywhere: no VAULT_PASSWORD / VIBESPACE_VAULT_* / vault.password / unlockWith / autoUnlock
//      name or string; no vault door fed from process.env, a file read or a cluster preset
//   ② THE ONLY CALLERS: `vault.unlock(` / `.setup(` / `.change(` in src/routes/vault.js only, each fed by `take(req, …)`
//      (the request body); `V.unlock(` / `V.setup(` / `V.changePassword(` in src/server/vault-engine.js only
//   ③ NO STORE KEY OUTSIDE THE VAULT: the key-file law's legacy branch (loadOrMintKey / mintKeyFile) runs only inside
//      secret-box's lawfulKey AFTER it asked the dir's vault; a box never caches a vault-held key; every store key name
//      in src/ is a vault STORE_KEYS row (and the reverse)
//   ④ the agent CLI has no unlock / setup / change door; the agent routes have none either; lane vault-run-door: the agent's
//      `run` door answers ONLY scrubbed text (every byte of stdout / stderr went through the scrubber, then secret-shapes) and
//      `runnable` names entries, never a value — pinned, with a mutant (a stream handed on raw ⇒ RED)
//   ⑤ MUTANTS (each judged by the same census ⇒ RED): an env-var auto-unlock in the engine, a password file read at boot,
//      a route feeding unlock from process.env, a cluster-preset unlock, a store reading its key file directly, a box
//      caching a vault key, lawfulKey going legacy before asking the vault
//   ⑥ THE REAL STORES (accounts, mounts, integrations, app-secrets) across the states: a secret sealed before setup;
//      setup; read; lock ⇒ vault_locked (the row says it); unlock ⇒ read; a restart (a new engine) ⇒ locked
//   ⑦ THE AUTOMATION KEYS (design q-046): a key's value never reaches an agent; everything stops while the vault is locked
//   ⑧ THE NAMED EXCEPTION the owner decided (design q-051, 2026-10-20): the per-instance relay token is NOT a vault entry —
//      SECRETS_AT_REST names it with the decision, its date and its reason; it is no store key (no STORE_KEYS row, no
//      key-file name); the shared relay token stays the vault's `frp:token` until it retires (the row says when)
//   ⑨ THE USE LAW (lane vault-use-law, design q-043 D1 「用途，不给值」): every CLI verb, agent vault route and engine key
//      CLASSIFIED (purpose-door / receipt / refusal / owner-only / hub-only + the ONE exception, the link-token door); an
//      agent route reaches no owner-only / hub-only key; the SENTINEL SWEEP (every route × bearer, every verb, every
//      broadcast ⇒ no stored value in any form, the exception's own answer the positive control); MUTANTS: a planted
//      agent route answering a value, a planted CLI verb printing one ⇒ RED
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const acorn = require('acorn');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []));
const tree = new Map(walk(path.join(REPO, 'src')).filter((f) => !f.includes(`${path.sep}lib${path.sep}i18n-`)).map((f) => [path.relative(REPO, f), fs.readFileSync(f, 'utf8')]));
tree.set('server.js', read('server.js'));
for (const f of fs.readdirSync(path.join(REPO, 'data/bin'))) {
  const p = path.join(REPO, 'data/bin', f);
  if (!fs.statSync(p).isFile() || fs.statSync(p).size > 400e3) continue;   // the bundles are built from src/ (judged there)
  const t = fs.readFileSync(p, 'utf8');
  if (/^#!.*node/.test(t) || f.endsWith('.js') || f.endsWith('.mjs')) tree.set('data/bin/' + f, t);
}
const TOKS = new Map(); // text → its tokens (the census and the store-key pass ask the same text)
function tokensOf(text) {
  const memo = TOKS.get(text); if (memo) return memo;
  const out = [];
  try { for (const t of acorn.tokenizer(text.replace(/^#![^\n]*/, ''), { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowImportExportEverywhere: true })) out.push(t); }
  catch (e) { const r = { err: e.message, toks: out }; TOKS.set(text, r); return r; }
  const r = { toks: out }; TOKS.set(text, r); return r;
}
const isName = (t, v) => !!t && t.type.label === 'name' && (v == null || t.value === v);
const isPunc = (t, l) => !!t && t.type.label === l;
/** the source text of a call's argument list starting at the `(` after token i */
function argsText(text, toks, i) {
  if (!isPunc(toks[i + 1], '(')) return null;
  let depth = 0;
  for (let j = i + 1; j < toks.length; j++) {
    const l = toks[j].type.label;
    if (l === '(' || l === '[' || l === '{' || l === '${') depth++;
    if (l === ')' || l === ']' || l === '}') { depth--; if (depth === 0) return text.slice(toks[i + 1].end, toks[j].start); }
  }
  return null;
}

const AUTO_NAME = /^(VAULT_PASSWORD|VIBESPACE_VAULT\w*|vaultPassword|vault_password|unlockWith\w*|autoUnlock\w*|auto_unlock\w*)$/i;
const AUTO_STR = /VAULT_PASSWORD|VIBESPACE_VAULT|vault[-_.]?password|auto[-_ ]?unlock|unlockWith/i;
const DOOR_RECEIVERS = /^(vault|engine|eng|VE|vaultEngine)$/;
const FEEDS = /process\.env|readFileSync|readFile\(|clusterPreset|presets?\.|argv/;
/** THE JUDGE: → red lines for a tree (Map rel → text). */
/** per file, memoised on its TEXT (lane fast-tier-ratchet): every mutant below re-judges the whole tree with ONE file planted —
 *  the other ~430 files' red lines are the same text's, so only the planted file is tokenized again (was 12 × the tree) */
const FILE_RED = new Map();
function judge(files) {
  const red = [];
  for (const [rel, text] of files) {
    const hit = FILE_RED.get(rel);
    if (hit && hit.text === text) { red.push(...hit.red); continue; }
    const mine = [];
    const { toks, err } = tokensOf(text);
    if (err) { mine.push(`${rel}: could not tokenize (${err})`); FILE_RED.set(rel, { text, red: mine }); red.push(...mine); continue; }
    const knowsVault = rel === 'src/server/vault-engine.js' || /require\(\s*['"][./]*(server\/)?vault(-engine)?(\.js)?['"]\s*\)/.test(text);   // the vault's own files and every file that requires them
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      // ① an auto-unlock shape: a name or a string (comments never count)
      if (isName(t) && AUTO_NAME.test(t.value)) mine.push(`${rel}: the name ${t.value} — an auto-unlock shape`);
      if ((t.type.label === 'string' || t.type.label === 'template') && AUTO_STR.test(String(t.value)) && rel !== 'src/routes/vault.js') mine.push(`${rel}: the string ${JSON.stringify(String(t.value).slice(0, 60))} — an auto-unlock shape`);
      // ② a vault door called from anywhere but the routes (and fed by anything but the request body)
      if (isPunc(toks[i - 1], '.') && isName(t) && /^(unlock|setup|change)$/.test(t.value) && isName(toks[i - 2]) && DOOR_RECEIVERS.test(toks[i - 2].value) && isPunc(toks[i + 1], '(')) {
        const a = argsText(text, toks, i) || '';
        if (rel !== 'src/routes/vault.js') mine.push(`${rel}: ${toks[i - 2].value}.${t.value}(${a.slice(0, 50)}) — a vault door called outside src/routes/vault.js`);
        else {
          const line = text.slice(text.lastIndexOf('\n', t.start) + 1, text.indexOf('\n', t.start));
          if (!/take\(req, /.test(line) || FEEDS.test(a)) mine.push(`${rel}: ${toks[i - 2].value}.${t.value}(${a.slice(0, 50)}) — its password is not the request body's (take(req, …))`);
        }
      }
      if (isPunc(toks[i - 1], '.') && isName(toks[i - 2], 'V') && isName(t) && /^(unlock|setup|changePassword)$/.test(t.value) && isPunc(toks[i + 1], '(') && rel !== 'src/server/vault-engine.js') mine.push(`${rel}: V.${t.value}( — the record's verdicts are the engine's alone`);
      // a BARE door call (the engine unlocking / setting itself up): only src/vault.js's changePassword re-runs its own unlock
      if (knowsVault && isName(t) && /^(unlock|setup)$/.test(t.value) && isPunc(toks[i + 1], '(') && !isPunc(toks[i - 1], '.') && !(toks[i - 1] && toks[i - 1].type.keyword === 'function') && !isName(toks[i - 1], 'async') && rel !== 'src/vault.js') mine.push(`${rel}: a bare ${t.value}( call — nothing but a person's door (src/routes/vault.js → the engine object) opens the vault`);
      // a key file read by name (balanced arguments: a path built through require('path').join(…) too)
      if (isName(t) && /^(readFileSync|readFile|openSync|createReadStream)$/.test(t.value) && isPunc(toks[i + 1], '(') && rel !== 'src/secret-box.js' && rel !== 'src/server/vault-engine.js') { const a = argsText(text, toks, i) || ''; const m = /(['"`])(\.[a-z][a-z0-9-]*-key|[a-z][a-z0-9-]*\.key)\1/.exec(a); if (m) mine.push(`${rel}: ${t.value}(… '${m[2]}') — a key file read outside the vault`); }
      // any vault door fed from the environment / a file / a preset, anywhere
      if (isName(t) && /^(unlock|setup)$/.test(t.value) && isPunc(toks[i + 1], '(')) { const a = argsText(text, toks, i) || ''; if (FEEDS.test(a)) mine.push(`${rel}: ${t.value}(${a.slice(0, 60)}) — a password fed from the environment, a file or a preset`); }
      // ③ the key-file law's legacy branch only inside secret-box
      if (isName(t) && /^(loadOrMintKey|mintKeyFile)$/.test(t.value) && isPunc(toks[i + 1], '(') && rel !== 'src/secret-box.js' && !(toks[i - 1] && toks[i - 1].type.keyword === 'function')) mine.push(`${rel}: ${t.value}( — the key-file law runs inside secret-box's lawfulKey only (after the vault)`);
    }
    // an agent tool never names a person's vault door
    if (rel.startsWith('data/bin/') && /\/api\/(agent\/)?vault\/(unlock|setup|change|idle)/.test(text)) mine.push(`${rel}: names a person's vault door (unlock / setup / change / idle are never an agent's)`);
    FILE_RED.set(rel, { text, red: mine });
    red.push(...mine);
  }
  // ③ lawfulKey asks the vault BEFORE the legacy law; a box never caches a vault-held key
  const sb = files.get('src/secret-box.js') || '';
  const lk = sb.slice(sb.indexOf('function lawfulKey('), sb.indexOf('\n}\n', sb.indexOf('function lawfulKey(')));
  const iv = lk.indexOf('const v = vaultOf(keyFile);'), il = lk.indexOf('legacy()');   // the FIRST run of the key-file law comes after the vault was asked
  if (!(iv > 0 && il > iv && /if \(v\) return v\.keyFor\(/.test(lk) && /return sealedHere\(keyFile\) \? \{ ok: false, code: KF\.VAULT_LOCKED \} : legacy\(\);/.test(lk))) red.push('src/secret-box.js: lawfulKey does not ask the dir\'s vault before the key-file law (or falls to the files over a sealed dir)');
  if (!/if \(cached && !vaultOf\(keyFile\)\) return cached;/.test(sb) || !/if \(vaultOf\(keyFile\)\) return r\.key;/.test(sb)) red.push('src/secret-box.js: a box caches a vault-held key (lock() would not reach it)');
  return red;
}

console.log('① ② ③ THE CENSUS over the shipped tree');
const red0 = judge(tree);
ok(tree.size > 400 && [...tree.keys()].some((k) => k.startsWith('data/bin/')), `the census reads ${tree.size} files (src/, server.js, data/bin)`);
ok(red0.length === 0, 'no auto-unlock shape; the vault doors are called only from src/routes/vault.js with the request body; the key-file law only behind the vault', red0.join(' | '));
{
  const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
  const names = new Set();
  for (const [rel, text] of tree) {
    if (!rel.startsWith('src/') || rel.startsWith('src/lib/')) continue;
    const { toks } = tokensOf(text);
    for (const t of toks) if ((t.type.label === 'string') && /^(\.[a-z][a-z0-9-]*-key|[a-z][a-z0-9-]*\.key)$/.test(String(t.value))) names.add(String(t.value));
  }
  const rows = new Set(VE.STORE_KEYS.map((k) => k.name));
  const missing = [...names].filter((x) => !rows.has(x)), stale = [...rows].filter((x) => !names.has(x));
  ok(!missing.length && !stale.length && rows.size === 6, `every store key name in src/ is a vault row and every row is named (${[...rows].join(', ')})`, { missing, stale });
  ok(VE.STORE_KEYS.filter((k) => k.raw).map((k) => k.name).join() === 'browser-passkeys.key', 'the one raw-bytes key is the passkey store\'s (the rest are 64 hex)');
}

console.log('④ the agent side has no unlock');
{
  const cli = tree.get('data/bin/vibespace-vault') || '';
  ok(cli.length > 0 && /\/api\/agent\/vault\/state/.test(cli) && /\/api\/agent\/vault\/lock/.test(cli) && !/\/api\/(agent\/)?vault\/(unlock|setup|change)/.test(cli), 'data/bin/vibespace-vault calls state and lock — never unlock / setup / change');
  const routes = tree.get('src/routes/vault.js') || '';
  const agentDoors = [...routes.matchAll(/app\.(get|post)\('(\/api\/agent\/vault\/[^']+)'/g)].map((m) => m[2]);
  // lane vault-e2e-password-fix-r2: + the LINK TOKEN door — a remote session's attach child asks for ITS machine's device
  // token (its own session token names the session; the engine is never asked to unlock: LOCKED ⇒ 423 vault_locked)
  ok(agentDoors.join() === '/api/agent/vault/totp/:name,/api/agent/vault/state,/api/agent/vault/lock,/api/agent/vault/mint,/api/agent/vault/put,/api/agent/vault/link-token,/api/agent/vault/run,/api/agent/vault/runnable,/api/agent/vault/request,/api/agent/vault/uses', `the agent doors are the two-step code, state, lock, mint, put, the session's own link token, run and runnable only (${agentDoors.join(', ')})`);
  // design q-047 L1 (lane vault-totp): + the TWO-STEP CODE door — a GET answering a granted entry's CURRENT code (never the
  // seed: its answer is built from named fields only — test-vault-routes ⑨ plants a seed and ⑩'s mutant leaks it ⇒ RED)
  const codeDoor = (() => { const i = routes.indexOf("app.get('/api/agent/vault/totp/:name'"); const j = routes.indexOf('\n    });', i); return i > 0 && j > i ? routes.slice(i, j) : ''; })();
  ok(/res\.json\(\{ ok: true, name: r\.name, code: r\.code, secondsLeft: r\.secondsLeft, period: r\.period \}\)/.test(codeDoor) && !/seed|secretGet|reveal|unlock/.test(codeDoor) && /callerOf\(token\)/.test(codeDoor),
    'the two-step code door answers NAMED fields only (name, code, secondsLeft, period) — no seed, no secretGet, no reveal, no unlock; its caller is the session token\'s conversation');
  // lane vault-run-door: + RUN (the hub spawns the command with the value injected; the answer is the SCRUBBED output) and
  // RUNNABLE (the entries a run may reference — names, never a value)
  const cliRuns = /\/api\/agent\/vault\/run'/.test(cli) && /\/api\/agent\/vault\/runnable'/.test(cli);
  ok(cliRuns, 'data/bin/vibespace-vault calls run and runnable (lane vault-run-door) — and still no unlock / setup / change (above)');
  // THE RUN DOOR'S ANSWER (lane vault-run-door): every chunk of the child's stdout / stderr reaches `parts` only through the
  // run's scrubber, the tail at the end too; the answer's two streams are those parts through secret-shapes — nothing else.
  // Lane vault-scrub-forms: ONE scrubber per run (createRunMasker, both pipes in arrival order — one window): `parts` is
  // written in ONE place, `handOn`, and `handOn` is handed only what that scrubber's push / end answer
  const door = tree.get('src/server/vault-run-door.js') || '';
  const scrubbedOnly = (t) => {
    const writes = [...t.matchAll(/parts(?:\[k\]|\.out|\.err)\.push\([^;]*\);/g)].map((m) => m[0]);
    const handed = [...t.matchAll(/handOn\(([^;]*)\);/g)].map((m) => m[1]);
    return writes.join(' ') === 'parts.out.push(o.out); parts.err.push(o.err);'
      && /const handOn = \(o\) => \{ parts\.out\.push\(o\.out\); parts\.err\.push\(o\.err\); \};/.test(t)
      && handed.length === 3 && handed.every((a) => /^scrub\.(push|end)\(/.test(a)) && /scrub = VR\.createRunMasker\(secrets, \['out', 'err'\]\)/.test(t)
      && /const outT = redactLong\(parts\.out\.join\(''\)\), errT = redactLong\(parts\.err\.join\(''\)\);/.test(t)
      && /stdout: outT\.text, stderr: errT\.text/.test(t) && !/stdout: (?!outT\.text|utf8Head\(outT\.text\))/.test(t) && !/stderr: (?!errT\.text|utf8Head\(errT\.text\))/.test(t);
  };
  ok(scrubbedOnly(door), 'the run door hands the agent ONLY scrubbed text: each stream chunk enters its parts through the run\'s ONE scrubber (createRunMasker\'s push, the end\'s tail too — one place, handOn), the answer\'s stdout / stderr are those parts through secret-shapes — no other stdout / stderr field');
  ok(!scrubbedOnly(door.replace('if (text) handOn(scrub.push(k, text));', 'if (text) parts[k].push(text);')) && !scrubbedOnly(door.replace('if (text) handOn(scrub.push(k, text));', "if (text) handOn({ out: k === 'out' ? text : '', err: k === 'err' ? text : '' });")),
    'MUTANTS: a stream chunk handed on without the scrubber (straight into parts, or into handOn) ⇒ RED');
  ok(!/vaultReveal|valueOf\(/.test(routes.slice(routes.indexOf("'/api/agent/vault/runnable'"), routes.indexOf("'/api/agent/vault/runnable'") + 700)), 'runnable answers names — it never asks a store for a value');
  // lane vault-mint-put (q-043 §9): + MINT / PUT — CREATE-only doors in the session's OWN namespace; neither reads a value
  // back (there is no agent reveal door; the owner reveals in the Vault window), and both refuse a locked vault by name.
  ok(!/app\.get\('\/api\/agent\/vault\/(mint|put)'/.test(routes) && !/res\.json\(\{[^}]*\bvalue\s*:/.test(routes.slice(routes.indexOf("'/api/agent/vault/mint'"), routes.indexOf("'/api/agent/vault/link-token'"))), 'mint / put are POST-only and their answer carries no `value:` field (create, never read — the q-043 ① law)');
  const lt = routes.slice(routes.indexOf("'/api/agent/vault/link-token'"));
  ok(lt.length > 0 && !/vault\.(unlock|setup|change)\(/.test(lt.slice(0, lt.indexOf('\n  });'))) && /vsst_/.test(lt.slice(0, 900)) && /_agentdSession/.test(lt.slice(0, 900)),
    'the link-token door answers a session token (vsst_) of a session on a paired machine only, and never unlocks / sets up / changes');
  const personDoors = [...routes.matchAll(/app\.post\('(\/api\/vault\/[^']+)', person\(/g)].map((m) => m[1]);
  ok(['setup', 'unlock', 'change', 'lock', 'idle', 'active'].every((d) => personDoors.includes('/api/vault/' + d)), `every person door is wrapped in person() (human_only + same-origin): ${personDoors.join(', ')}`);
}

console.log('⑤ MUTANTS — each RED');
{
  const plant = (label, rel, edit) => {
    const m = new Map(tree);
    const before = m.get(rel) || '';
    const after = edit(before);
    m.set(rel, after);
    const r = judge(m);
    ok(after !== before && r.length > 0, `RED: ${label}${r.length ? ' ⇒ ' + r[0].slice(0, 120) : ''}`);
  };
  const E = 'src/server/vault-engine.js', R = 'src/routes/vault.js';
  plant('the engine unlocks from an env var at create', E, (s) => s.replace('  load();\n', "  load();\n  if (process.env.VIBESPACE_VAULT_PASSWORD) unlock(process.env.VIBESPACE_VAULT_PASSWORD);\n"));
  plant('the engine reads a password file at boot', E, (s) => s.replace('  load();\n', "  load();\n  try { const pwFile = fs.readFileSync(path.join(dataDir, 'vault.pw'), 'utf8'); unlock(pwFile); } catch { }\n"));
  plant('a wiring unlocks with a cluster preset at boot', 'src/server/mounts-plugins-wiring.js', (s) => s.replace("require('../routes/vault.js').registerVaultRoutes(", "vault.unlock(presets.vault, {});\nrequire('../routes/vault.js').registerVaultRoutes("));
  plant('the route feeds unlock from process.env', R, (s) => s.replace("const [pw] = take(req, 'password'); return vault.unlock(pw, { ip: ipOf(req) });", "return vault.unlock(process.env.X, { ip: ipOf(req) });"));
  plant('a helper named autoUnlock', 'src/server/boot-phase.js', (s) => s + '\nfunction autoUnlock() {}\n');
  plant('a store reads its key file directly', 'src/server/channels-engine.js', (s) => s + "\nconst peek = (d) => require('fs').readFileSync(require('path').join(d, '.channels-key'));\n");
  plant('a box caches a vault-held key', 'src/secret-box.js', (s) => s.replace('if (cached && !vaultOf(keyFile)) return cached;', 'if (cached) return cached;'));
  plant('lawfulKey goes to the files before asking the vault', 'src/secret-box.js', (s) => s.replace('  const v = vaultOf(keyFile);\n  if (v) return v.keyFor(', '  const lr = legacy(); if (lr.ok) return lr;\n  const v = vaultOf(keyFile);\n  if (v) return v.keyFor('));
  plant('a second module runs the key-file law', 'src/accounts.js', (s) => s + "\nconst again = (f) => require('./key-file.js').loadOrMintKey({ readKey: () => '', mintKey: () => null, hasCiphertext: () => true });\n");
  plant('the agent CLI grows an unlock verb', 'data/bin/vibespace-vault', (s) => s.replace("if (cmd === 'lock')", "if (cmd === 'unlock') return call('POST', '/api/vault/unlock');\n  if (cmd === 'lock')"));
  const quiet = new Map(tree); quiet.set(E, quiet.get(E) + '\n// a comment that says VIBESPACE_VAULT_PASSWORD and vault.unlock(process.env.X) is no code\n');
  ok(judge(quiet).length === 0, 'quiet: the same shapes inside a comment are no code');
}

console.log('⑥ THE REAL STORES across the states');
{
  const ROOT = scratch('vault-law');
  fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
  const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
  const KF = require(path.join(REPO, 'src/key-file.js'));
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
  const IS = require(path.join(REPO, 'src/server/integration-store.js'));
  const AS = require(path.join(REPO, 'src/app-secrets.js'));
  const quiet = { log() {}, warn() {}, error() {} };
  const d = path.join(ROOT, 'data'); fs.mkdirSync(d);
  const PW = 'the law\'s second password';
  const mk = () => VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  let eng = mk();
  // sealed BEFORE the setup (the key files minted beside the data, as on every instance today)
  const acc = new AccountManager({ dataDir: d });
  const a = acc.add({ name: 'law', key: 'sk-ant-law-' + crypto.randomBytes(4).toString('hex') });
  const mm = new MountManager({ dataDir: d, broadcast: () => {}, getSetting: () => undefined });
  const mid = 'law1'; mm._state.mounts.push({ id: mid, name: 'law', type: 's3', endpoint: 'https://s3.example.invalid', bucket: 'b', accessKey: 'AK', secretKeyEnc: mm._enc('mount-secret') }); mm._save();
  const is = IS.create({ dataDir: d, env: {}, now: () => Date.now(), broadcast: () => {}, log: quiet });
  is.setIntegration('cloud:browserless', { apiKey: 'law-api-key', apiUrl: 'https://chrome.example.net' });
  const master0 = AS.appSecretsMaster({ dataDir: d }).master;
  ok(['.accounts-key', '.mounts-key', '.integrations-key', '.app-secrets-key'].every((k) => fs.existsSync(path.join(d, k))), 'not set up: the four stores minted their key FILES (the migration window)');
  const reads = () => ({
    acc: (() => { try { acc._key(); return acc.getKey(a.id); } catch (e) { return e.code; } })(),   // getKey answers null on any refusal; the spawn path names it (`account key unavailable — the vault is locked …`)
    mnt: (() => { try { return mm._dec(mm._state.mounts.find((m) => m.id === mid).secretKeyEnc); } catch (e) { return e.reason || e.code; } })(),
    mntRow: (mm.list().find((x) => x.id === mid) || {}).keyFile || null,
    int: JSON.stringify(is.resolveIntegration('cloud:browserless')).includes('law-api-key') ? 'law-api-key' : (is.publicView('cloud:browserless').storeError || {}).reason || 'refused',
    app: (() => { const r = AS.appSecretsMaster({ dataDir: d }); return r.master ? (r.master.equals(master0) ? 'master' : 'OTHER') : r.refused.code; })(),
  });
  ok((await eng.setup(PW)).ok, 'setup seals them');
  const r1 = reads();
  ok(r1.acc === a.key || (typeof r1.acc === 'string' && r1.acc.startsWith('sk-ant-law-')), 'unlocked: accounts reads its key', r1);
  ok(r1.mnt === 'mount-secret' && r1.mntRow === null && r1.int === 'law-api-key' && r1.app === 'master', 'unlocked: mounts, integrations and app-secrets read theirs (the same master)', r1);
  eng.lock();
  const r2 = reads();
  ok(r2.acc === KF.VAULT_LOCKED && r2.mnt === KF.VAULT_LOCKED && r2.mntRow && r2.mntRow.code === KF.VAULT_LOCKED && /vault_locked/.test(r2.int) && r2.app === KF.VAULT_LOCKED, 'LOCKED: every store refuses key-unreadable:vault_locked — and the mounts row says it', r2);
  ok(['.accounts-key', '.mounts-key', '.integrations-key', '.app-secrets-key'].every((k) => !fs.existsSync(path.join(d, k))), 'locked: no store minted a key file beside the vault');
  await eng.unlock(PW);
  const r3 = reads();
  ok(r3.mnt === 'mount-secret' && r3.int === 'law-api-key' && r3.app === 'master', 'unlock ⇒ every store reads again', r3);
  eng.close(); eng = mk();
  const r4 = reads();
  ok(r4.mnt === KF.VAULT_LOCKED && r4.app === KF.VAULT_LOCKED && eng.state() === 'locked', 'a RESTART (a new engine) ⇒ locked again: nothing opens until a person unlocks', r4);
  eng.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
}

console.log('⑦ THE AUTOMATION KEYS (design q-046) — a key\'s value never reaches an agent; everything stops while the vault is locked');
{
  const routes = tree.get('src/routes/automation.js') || '', engine = tree.get('src/server/automation-engine.js') || '';
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-api'), 'utf8');
  // THE CENSUS: no agent door, no CLI verb, no engine answer reaches a value — the ONE reader of `apikey:<id>` is the
  // engine's vaultReveal, and only the Vault window's reveal (src/server/vault-contents.js, people-only) calls it
  const census = (rt, en, cl) => {
    const bad = [];
    const agentPart = rt.slice(rt.indexOf('// ── agents'));
    if (!agentPart || /secretGet|vaultReveal|revealValue|\/api\/vault\/reveal/.test(agentPart)) bad.push('an agent door reads a value');
    if (/\/api\/automation\/|\/api\/vault\/reveal|secret/i.test(cl.replace(/^\s*\/\/.*$/gm, '').replace(/\/\/[^\n]*$/gm, ''))) bad.push('the CLI reaches an owner door or a secret');
    const gets = [...en.matchAll(/vault\.secretGet\(/g)].length;
    if (gets !== 1 || !/function vaultReveal\(entry\) \{[\s\S]{0,260}vault\.secretGet\(/.test(en)) bad.push(`the engine reads a value outside vaultReveal (${gets} reads)`);
    if (/value:\s*plan\.value|\{\s*ok:\s*true,\s*value/.test(en)) bad.push('an engine answer carries a value');
    return bad;
  };
  ok(routes && engine && cli && census(routes, engine, cli).length === 0, 'THE CENSUS: the agent doors and vibespace-api never reach a value; the engine reads `apikey:<id>` ONLY in vaultReveal (the Vault window\'s people-only reveal)', census(routes, engine, cli));
  const plant = routes.replace("res.json({ ok: true, keys: engine.keysFor(caller),", "res.json({ ok: true, value: engine.vaultReveal(caller.want), keys: engine.keysFor(caller),");
  ok(plant !== routes && census(plant, engine, cli).includes('an agent door reads a value'), 'MUTANT RED: an agent door that answers a key\'s value (vaultReveal in /api/agent/automation/keys) is caught by the census');
  const plant2 = engine.replace("return { ok: true, key: A.publicKey(plan.record) };", "return { ok: true, key: A.publicKey(plan.record), value: plan.value };");
  ok(plant2 !== engine && census(routes, plant2, cli).includes('an engine answer carries a value'), 'MUTANT RED: a mint that answers its value is caught by the census');
  // THE REAL ENGINE across the states: nothing cached across a lock, a restart is locked, the unlock resumes
  const ROOT = scratch('vault-law-ak');
  fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
  const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
  const AE = require(path.join(REPO, 'src/server/automation-engine.js'));
  const quiet = { log() {}, warn() {}, error() {} };
  const PW = 'the law\'s second password';
  const mk = () => VE.create({ dataDir: ROOT, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, register: false });
  let v = mk();
  await v.setup(PW, {});
  const verbs = { 'conversations.rename': () => ({ ok: true }) };
  let e = AE.create({ dataDir: ROOT, vault: v, verbs });
  const k = e.mint({ name: 'law key', scopes: ['conversations.rename'] });
  e.grant(k.key.id, ['session:c-law']);
  const caller = { conversationId: 'c-law', sessionKey: 'claude:c-law', name: 'law', live: true, groups: [] };
  const ok1 = await e.use({ caller, verb: 'conversations.rename', args: { name: 'x' } });
  v.lock('door');
  const locked = await e.use({ caller, verb: 'conversations.rename', args: { name: 'x' } });
  v.close(); v = mk(); e = AE.create({ dataDir: ROOT, vault: v, verbs });
  const restarted = await e.use({ caller, verb: 'conversations.rename', args: { name: 'x' } });
  await v.unlock(PW, {});
  const again = await e.use({ caller, verb: 'conversations.rename', args: { name: 'x' } });
  ok(ok1.ok && locked.code === 'vault_locked' && restarted.code === 'vault_locked' && v.state() === 'unlocked' && again.ok, 'granted ⇒ runs · LOCKED ⇒ vault_locked · a RESTART (a new engine) ⇒ locked, vault_locked · the person\'s unlock ⇒ it runs again (no key value was ever needed)', { ok1: ok1.ok, locked: locked.code, restarted: restarted.code, again: again.ok || again.code });
  v.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
}

console.log('⑧ THE NAMED EXCEPTION — the per-instance relay token (design q-051, the owner\'s decision 2026-10-20)');
{
  const V = require(path.join(REPO, 'src/vault.js'));
  const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
  const RT = require(path.join(REPO, 'src/relay-token.js'));
  const row = V.SECRETS_AT_REST.find((r) => r.where === 'data/' + RT.FILE);
  ok(!!row && !row.entry && typeof row.exception === 'string' && /q-051/.test(row.exception) && /owner/.test(row.exception) && /2026-10-20/.test(row.exception) && /without the second password/.test(row.exception) && /public names only/.test(row.exception) && /never the hub/.test(row.exception) && /revocable/.test(row.exception),
    'SECRETS_AT_REST names data/relay-token.json as an EXCEPTION: the owner\'s decision (q-051, 2026-10-20), why (a restart re-publishes without the second password), its blast radius (that instance\'s public names, never the hub), revocable', row);
  const frpRow = V.SECRETS_AT_REST.find((r) => r.entry === 'frp:token');
  ok(!!frpRow && /grace/.test(frpRow.what) && /2026-10-relay-token-per-instance/.test(frpRow.retires || ''), 'the shared relay token stays the vault\'s frp:token — the knock during the relay\'s grace — and its row says when it retires', frpRow);
  const STORE_KEYS = Object.keys(VE.STORE_KEYS || {}).concat(Array.isArray(VE.STORE_KEYS) ? VE.STORE_KEYS.map((k) => k.name || k) : []);
  ok(!STORE_KEYS.some((k) => String(k).includes('relay')) && !/\.key$|-key$/.test(RT.FILE) && !VE.isSecretName('relay:token'), 'the relay token is no store key (no STORE_KEYS row, no key-file name) and no vault secret name (relay: is not a secret prefix)', STORE_KEYS);
  const frpSrc = read('src/plugins/frp.js');
  ok(!/secretPut\([^)]*relay|secretGet\([^)]*relay/i.test(frpSrc) && /replaceShredding\(relayFile\(\), RT\.serialize\(rec\)\)/.test(frpSrc), 'the frp plugin writes it to its file (0600, atomic, the old bytes overwritten) — never into the vault', null);
}

console.log('⑨ THE USE LAW (lane vault-use-law — design q-043 D1 「用途，不给值」): no route, no CLI verb, no broadcast answers an entry\'s bytes to a BEARER');
// THE CENSUS (a) every verb data/bin/vibespace-vault exposes, every `/api/agent/vault/*` route the tree registers and every
// key of the engine — each CLASSIFIED below, a new one unclassified is RED: purpose-door (does a thing for the caller,
// answers a receipt), receipt (facts, names, receipts), refusal (only refuses / notes a refusal), owner-only (a person's
// cookie doors behind 验证是你), hub-only (answers bytes to the hub's OWN code — a store, the dial, the relay), and ONE
// exception (the link-token door: a conversation's attach child gets ITS machine's link token). The sibling lanes' doors
// (vault-mint-put, vault-run-door) are classified here before they land and COUNTED once they do (the integrator re-runs
// it). (b) REACH: an agent route's handler (and the helpers of its file it names) reaches only receipt / purpose-door /
// refusal engine keys — never owner-only or hub-only. (c) THE SENTINEL SWEEP: the REAL routes over a REAL engine holding a
// sentinel in every entry (each store key, two machines' link tokens, the relay token, a sealed file key, an automation
// key): every agent route × every bearer (a local session, a session on a machine, a job, an automation key, a body token,
// none) × its methods, the CLI's every verb, every broadcast frame ⇒ 0 hits in any form (raw, hex, base64, base64url) —
// but the exception's own answer, which is the positive control (the sweep sees a value when one is there).
// (d) MUTANTS, each RED: a planted agent route answering a stored value (unclassified ⇒ a; classified ⇒ b and c), a
// planted CLI verb printing the link token (⇒ a and c).
{
  const SIB = (lane) => ({ sibling: lane });
  const CLI_VERBS = {
    status: ['receipt', 'the vault\'s state in words and since when (GET /api/agent/vault/state)'],
    lock: ['purpose-door', 'locks the vault for the caller (a suspected leak, the end of a task); the answer is the state'],
    totp: ['receipt', 'the CURRENT two-step code of an entry the user granted this conversation (name, code, secondsLeft, period) — never the seed (the entry\'s bytes); the hub reads the seed and computes the code at its clock (design q-047 L1, lane vault-totp)'],
    help: ['receipt', 'the usage text'], '-h': ['receipt', 'the usage text'], '--help': ['receipt', 'the usage text'],
    mint: ['purpose-door', 'the hub makes and seals a random value; the answer is the entry name + its vault:// reference', SIB('vault-mint-put')],
    put: ['purpose-door', 'seals a value the agent already has (a 0600 file or stdin, never argv); the answer is the name + reference', SIB('vault-mint-put')],
    run: ['purpose-door', 'the hub runs a command with the entry injected and masks it in the output; the answer is the masked output + a receipt', SIB('vault-run-door')],    list: ['receipt', 'the entries open for this conversation\'s runs — a reference, a label and a kind each, never a value (GET /api/agent/vault/runnable)', SIB('vault-run-door')],
    // lane vault-manual-and-lock (design D4): the agent ASKS the owner for an entry (a For-you question — no value moves) and
    // reads its own grants, open requests and vault-use lines back (names, purposes, codes, receipts)
    request: ['purpose-door', 'files ONE For-you question naming the agent, the entry and its purpose; the answer is the question\'s id (or that the entry is open already)'],
    uses: ['receipt', 'this conversation\'s grants, open requests and own vault-use lines — references, purposes, times, outcomes, receipts (GET /api/agent/vault/uses)'],
  };
  const AGENT_ROUTES = {
    'GET /api/agent/vault/state': ['receipt', 'the state, setUpAt, lockedSince and the key count — facts'],
    'POST /api/agent/vault/lock': ['purpose-door', 'the lock act; the answer is the facts'],
    'GET /api/agent/vault/totp/:name': ['receipt', 'the granted entry\'s current code + secondsLeft / period — named fields, never the seed (design q-047 L1, lane vault-totp)'],
    'GET /api/agent/vault/link-token': ['exception', 'THE ONE NAMED EXCEPTION (int317): a remote conversation\'s attach child asks with its session token for ITS OWN machine\'s link token (memory only, never printed) — the device holds the same value; a session on no machine, a job or an unknown token is refused'],
    'POST /api/agent/vault/mint': ['purpose-door', 'mint: name + reference, never the value', SIB('vault-mint-put')],
    'POST /api/agent/vault/put': ['purpose-door', 'put: name + reference, never the value', SIB('vault-mint-put')],
    'POST /api/agent/vault/run': ['purpose-door', 'run: the masked output + a receipt', SIB('vault-run-door')],
    'GET /api/agent/vault/runnable': ['receipt', 'runnable: the entries a run may reference — names and references, never a value', SIB('vault-run-door')],
    'POST /api/agent/vault/request': ['purpose-door', 'request: a For-you question to the owner — the answer is its id, never a value'],
    'GET /api/agent/vault/uses': ['receipt', 'uses: this conversation\'s grants, requests and vault-use lines — names, codes, receipts'],
  };
  const ENGINE_KEYS = {
    dataDir: 'receipt', file: 'receipt', state: 'receipt', facts: 'receipt', epoch: 'receipt', hasEntry: 'receipt', peek: 'receipt', lastUse: 'receipt', secretNames: 'receipt', blockedSummary: 'receipt',
    lock: 'purpose-door', noteUse: 'purpose-door', agentMint: 'purpose-door', agentPut: 'purpose-door',
    blocked: 'refusal',
    setup: 'owner-only', unlock: 'owner-only', change: 'owner-only', confirm: 'owner-only', setIdleLock: 'owner-only', touch: 'owner-only',
    keyFor: 'hub-only', secretGet: 'hub-only', secretPut: 'hub-only', secretDrop: 'hub-only', secretAdopt: 'hub-only', resumeSeal: 'hub-only', audit: 'hub-only', idleTick: 'hub-only', close: 'hub-only',
    onUnlock: 'hub-only', onOpen: 'hub-only', onLock: 'hub-only', onBlocked: 'hub-only', onFailing: 'hub-only',
    macOf: 'hub-only',
    usesOf: 'receipt',   // lane vault-manual-and-lock: ONE conversation's own vault-use lines (closed fields — never a value)   // lane vault-run-door: a mark over the run door's own store under a DEK-derived key — the hub's code only
  };
  const SIBLING_KEYS = new Set(['agentMint', 'agentPut']);
  const REACHABLE_OK = new Set(['receipt', 'purpose-door', 'refusal']);
  const ROUTE_RE = /^\/api\/agent\/vault\//;
  /** the statements names are defined by in a file (`const|let|var NAME =` … `;` at depth 0, `function NAME(` … its body),
   *  each with its BLOCK depth (how many `{` hold it) → Map name → [{ range, depth }] */
  const defsOf = (toks) => {
    const out = new Map();
    let block = 0;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], l0 = t.type.label;
      if (l0 === '{' || l0 === '${') block++;
      if (l0 === '}') block--;
      let start = -1;
      if ((t.type.keyword === 'const' || t.type.keyword === 'let' || t.type.keyword === 'var') && isName(toks[i + 1]) && isPunc(toks[i + 2], '=')) start = i + 1;
      else if (t.type.keyword === 'function' && isName(toks[i + 1])) start = i + 1;
      if (start < 0) continue;
      let depth = 0, j = start + 1, seenBody = false;
      for (; j < toks.length; j++) {
        const l = toks[j].type.label;
        if (l === '(' || l === '[' || l === '{' || l === '${') { depth++; if (l === '{') seenBody = true; }
        if (l === ')' || l === ']' || l === '}') { depth--; if (depth === 0 && t.type.keyword === 'function' && seenBody && l === '}') break; }
        if (depth === 0 && l === ';') break;
      }
      const name = toks[start].value;
      if (!out.has(name)) out.set(name, []);
      out.get(name).push({ range: [start, j], depth: block });
    }
    return out;
  };
  const blockDepthAt = (toks, at) => { let b = 0; for (let i = 0; i < at; i++) { const l = toks[i].type.label; if (l === '{' || l === '${') b++; if (l === '}') b--; } return b; };
  /** every `vault.<key>` a token range names, following the helpers of its file it names that are defined in a scope that
   *  holds the route (block depth ≤ the route's — never a local of another function) — a fixpoint */
  const reachOf = (toks, defs, range, maxDepth) => {
    const keys = new Set(), seen = new Set(), todo = [range];
    while (todo.length) {
      const [a, b] = todo.pop();
      for (let i = a; i < b && i < toks.length; i++) {
        if (isName(toks[i], 'vault') && isPunc(toks[i + 1], '.') && isName(toks[i + 2])) keys.add(toks[i + 2].value);
        if (!isName(toks[i]) || isPunc(toks[i - 1], '.') || seen.has(toks[i].value)) continue;
        const d = (defs.get(toks[i].value) || []).find((x) => x.depth <= maxDepth && !(x.range[0] >= range[0] && x.range[0] < range[1]));
        if (d) { seen.add(toks[i].value); todo.push(d.range); }
      }
    }
    return keys;
  };
  /** THE CENSUS over a tree → { red, verbs, routes } (extra = rows a mutant adds to the tables) */
  function useCensus(files, { engineKeys = null, extraRoutes = {}, extraVerbs = {} } = {}) {
    const red = [], routes = new Map(), verbs = new Set();
    const routeRows = { ...AGENT_ROUTES, ...extraRoutes }, verbRows = { ...CLI_VERBS, ...extraVerbs };
    // the CLI's verbs: every string `cmd` is compared with, and its default
    const cli = files.get('data/bin/vibespace-vault') || '';
    const ct = tokensOf(cli).toks;
    for (let i = 0; i < ct.length; i++) {
      if (isName(ct[i], 'cmd') && (isPunc(ct[i + 1], '==/!=/===/!==') || ct[i + 1]?.value === '===') && ct[i + 2] && ct[i + 2].type.label === 'string') verbs.add(String(ct[i + 2].value));
      if (isName(ct[i], 'cmd') && isPunc(ct[i + 1], '=') && ct[i + 2] && ct[i + 2].type.label === 'string') verbs.add(String(ct[i + 2].value));
    }
    for (const v of verbs) if (!verbRows[v]) red.push(`data/bin/vibespace-vault: the verb "${v}" is not classified (purpose-door / receipt / refusal / owner-only) — the use law's census`);
    for (const [v, row] of Object.entries(verbRows)) if (!verbs.has(v) && !(row[2] && row[2].sibling)) red.push(`data/bin/vibespace-vault: a classified verb "${v}" is gone — retire its row`);
    // every agent vault route the tree registers, wherever it lives
    for (const [rel, text] of files) {
      if (!rel.startsWith('src/') && rel !== 'server.js') continue;
      if (!text.includes('/api/agent/vault/')) continue;
      const { toks } = tokensOf(text);
      let defs = null;
      for (let i = 0; i + 4 < toks.length; i++) {
        if (!(isPunc(toks[i + 1], '.') && isName(toks[i + 2]) && /^(get|post|put|delete|patch|all|use)$/.test(toks[i + 2].value) && isPunc(toks[i + 3], '(') && toks[i + 4].type.label === 'string' && ROUTE_RE.test(String(toks[i + 4].value)))) continue;
        const key = `${toks[i + 2].value.toUpperCase()} ${toks[i + 4].value}`;
        let depth = 0, j = i + 3;
        for (; j < toks.length; j++) { const l = toks[j].type.label; if (l === '(' || l === '[' || l === '{' || l === '${') depth++; if (l === ')' || l === ']' || l === '}') { depth--; if (depth === 0) break; } }
        defs = defs || defsOf(toks);
        const reach = reachOf(toks, defs, [i + 4, j], blockDepthAt(toks, i));
        routes.set(key, { rel, reach: [...reach] });
        const row = routeRows[key];
        if (!row) { red.push(`${rel}: the agent route ${key} is not classified (purpose-door / receipt / refusal / owner-only) — the use law's census`); continue; }
        for (const k of reach) {
          const c = (engineKeys || ENGINE_KEYS)[k];
          if (!c) red.push(`${rel}: ${key} reaches vault.${k} — an engine key the census does not know`);
          else if (!REACHABLE_OK.has(c) && row[0] !== 'exception') red.push(`${rel}: ${key} reaches vault.${k} (${c}) — an agent route never names an owner-only or a hub-only key`);
        }
      }
    }
    for (const [k, row] of Object.entries(routeRows)) if (!routes.has(k) && !(row[2] && row[2].sibling)) red.push(`a classified agent route ${k} is gone — retire its row`);
    const exceptions = Object.entries(routeRows).filter(([, r]) => r[0] === 'exception').map(([k]) => k);
    if (exceptions.join() !== 'GET /api/agent/vault/link-token') red.push(`THE exception is the link-token door alone — found: ${exceptions.join(', ') || 'none'}`);
    return { red, verbs: [...verbs], routes };
  }
  // (a) + (b) over the shipped tree, and the engine's own keys
  const VE8 = require(path.join(REPO, 'src/server/vault-engine.js'));
  const ROOT8 = scratch('vault-law-use');
  fs.rmSync(ROOT8, { recursive: true, force: true }); fs.mkdirSync(ROOT8, { recursive: true });
  const quiet8 = { log() {}, warn() {}, error() {} };
  const probeEng = VE8.create({ dataDir: path.join(ROOT8, 'keys'), log: quiet8, idleTimer: false, register: false });
  const liveKeys = Object.keys(probeEng); probeEng.close();
  const unclassified = liveKeys.filter((k) => !ENGINE_KEYS[k]), staleKeys = Object.keys(ENGINE_KEYS).filter((k) => !liveKeys.includes(k) && !SIBLING_KEYS.has(k));
  const byClass = {}; for (const k of liveKeys) if (ENGINE_KEYS[k]) byClass[ENGINE_KEYS[k]] = (byClass[ENGINE_KEYS[k]] || 0) + 1;
  ok(!unclassified.length && !staleKeys.length, `(a) every key of the engine (${liveKeys.length}) is classified — ${Object.entries(byClass).map(([c, n]) => `${c} ${n}`).join(', ')}`, { unclassified, stale: staleKeys });
  const c0 = useCensus(tree);
  ok(c0.red.length === 0, `(a) every verb of data/bin/vibespace-vault (${c0.verbs.join(', ')}) and every agent vault route (${[...c0.routes.keys()].join(', ')}) is classified; the link-token door is THE one exception`, c0.red);
  const reachRows = [...c0.routes].map(([k, r]) => `${k} → ${r.reach.join('+') || '∅'}`);
  ok(c0.routes.size >= 3 && [...c0.routes.values()].some((r) => r.reach.includes('facts')) && [...c0.routes.values()].some((r) => r.reach.includes('lock')), `(b) REACH: the agent routes name only receipt / purpose-door / refusal keys (${reachRows.join(' · ')})`, reachRows);

  // (c) THE SENTINEL SWEEP — the real routes over a real engine with a sentinel in every entry
  const express8 = require(path.join(REPO, 'node_modules/express'));
  const HT8 = require(path.join(REPO, 'src/server/host-tokens.js'));
  const d8 = path.join(ROOT8, 'data'); fs.mkdirSync(d8, { recursive: true });
  const PW8 = 'the use law\'s second password';
  const frames = [];
  const eng8 = VE8.create({ dataDir: d8, kdf: { N: 1024, r: 8, p: 1 }, log: quiet8, idleTimer: false, bcast: (m) => frames.push(JSON.stringify(m)) });
  await eng8.setup(PW8, {});
  const sentinels = [];   // [label, Buffer]
  for (const k of VE8.STORE_KEYS) { const r = eng8.keyFor(k.name, { keyFile: path.join(d8, k.name), raw: !!k.raw, hasCiphertext: () => false }); if (r.ok) sentinels.push([`store key ${k.store}`, Buffer.from(r.key)]); }
  const ht8 = HT8.create({ dataDir: d8, nameOf: () => 'the law machine', log: quiet8 });
  const OWN = ht8.tokenFor('dial-devA'), OTHER = ht8.tokenFor('host-0123abcd');
  sentinels.push(['link token (own machine)', Buffer.from(OWN)], ['link token (another machine)', Buffer.from(OTHER)]);
  for (const [entry, label] of [['frp:token', 'relay token'], ['file:law-pair', 'sealed file key'], ['apikey:ak-law', 'automation key']]) {
    const v = `law-${label.replace(/\W/g, '')}-${crypto.randomBytes(12).toString('hex')}`;
    ok(eng8.secretPut(entry, v).ok, `the sweep's sentinel sealed: ${label}`);
    sentinels.push([label, Buffer.from(v)]);
  }
  ok(sentinels.length === VE8.STORE_KEYS.length + 5, `${sentinels.length} sentinels: every store key, two machines' link tokens, the relay token, a sealed file key, an automation key`);
  const formsOf = (b) => [b.toString('hex'), b.toString('base64'), b.toString('base64url'), ...(/^[\x20-\x7e]+$/.test(b.toString('latin1')) ? [b.toString('latin1')] : [])].filter((x) => x.length >= 12);
  const hitsOf = (text) => sentinels.filter(([, b]) => formsOf(b).some((f) => text.includes(f))).map(([l]) => l);
  const T = (p) => p + crypto.randomBytes(16).toString('hex');
  const TOK = { local: T('vsst_'), dial: T('vsst_'), job: T('jbt_') };
  const sessions8 = new Map([
    ['s-local', { name: 'Law local', agentToken: TOK.local, _webuiId: 'c-local' }],
    ['s-dial', { name: 'Law on a machine', agentToken: TOK.dial, _webuiId: 'c-dial', _agentdSession: true, _dialDeviceId: 'devA' }],
  ]);
  const jobs8 = { ready: true, jobByToken: (t) => (t === TOK.job ? { id: 'j-law', name: 'Law job' } : null) };
  const BEARERS = [
    ['a local session (vsst_)', { authorization: 'Bearer ' + TOK.local }],
    ['a session on a machine (vsst_)', { authorization: 'Bearer ' + TOK.dial }],
    ['a job (jbt_)', { authorization: 'Bearer ' + TOK.job }],
    ['an automation key', { authorization: 'Bearer ' + 'vsak_' + crypto.randomBytes(32).toString('base64url') }],
    ['a body token', null, { token: TOK.dial }],
    ['no bearer', {}],
  ];
  const listen = (app) => new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const call = (port, method, p, headers, body) => new Promise((res) => {
    const data = JSON.stringify(body || {});
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers } }, (rs) => { let b = ''; rs.setEncoding('latin1'); rs.on('data', (c) => { b += c; }); rs.on('end', () => res({ status: rs.statusCode, body: b })); });
    r.on('error', (e) => res({ status: 0, body: String(e.message) }));
    r.end(data);
  });
  const runCli = (cliPath, args, port, token) => new Promise((res) => {
    const p = spawn(process.execPath, [cliPath, ...args], { env: { PATH: process.env.PATH, HOME: ROOT8, VIBESPACE_API: `http://127.0.0.1:${port}`, VIBESPACE_SESSION_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; p.stdout.on('data', (c) => { out += c.toString('latin1'); }); p.stderr.on('data', (c) => { out += c.toString('latin1'); });
    const k = setTimeout(() => p.kill('SIGKILL'), 15000);
    p.on('close', (code) => { clearTimeout(k); res({ code, out }); });
  });
  /** ONE sweep: the routes `register` puts on a fresh app × every bearer × every method; the CLI's verbs (`cli`) → leaks */
  async function sweep(register, { cli = path.join(REPO, 'data/bin/vibespace-vault'), verbs = null } = {}) {
    const app = express8(); app.use(express8.json());
    register(app, { vault: eng8, activeSessions: sessions8, getJobs: () => jobs8, linkTokenFor: (hostKey, who) => ht8.tokenFor(hostKey, who), auditLink: () => {} });
    const srv = await listen(app); const port = srv.address().port;
    const routes = app._router.stack.filter((l) => l.route && ROUTE_RE.test(l.route.path)).flatMap((l) => Object.keys(l.route.methods).map((m) => [m.toUpperCase(), l.route.path]));
    const leaks = [], seen = { own: false, calls: 0 }, bodies = [];   // bodies: every answer, re-read below against what the sweep itself made
    frames.length = 0;
    for (const [method, p] of routes) for (const [who, headers, body] of BEARERS) {
      if (eng8.state() !== 'unlocked') await eng8.unlock(PW8, {});
      const r = await call(port, method, p, headers || {}, body || { name: 'law', id: 'secrets:frp:token#token', value: 'x' });
      seen.calls++;
      bodies.push([`${method} ${p} × ${who}`, r.body]);
      const hits = hitsOf(r.body);
      const own = `${method} ${p}` === 'GET /api/agent/vault/link-token' && /machine/.test(who) && hits.join() === 'link token (own machine)';
      if (own) seen.own = true;
      else if (hits.length) leaks.push(`${method} ${p} × ${who} ⇒ ${hits.join(', ')}`);
    }
    for (const f of frames) { const h = hitsOf(f); if (h.length) leaks.push(`a broadcast frame ⇒ ${h.join(', ')}`); }
    const cliVerbs = verbs || useCensus(new Map([['data/bin/vibespace-vault', fs.readFileSync(cli, 'utf8')]])).verbs;
    for (const v of [...cliVerbs, '']) {
      if (eng8.state() !== 'unlocked') await eng8.unlock(PW8, {});
      const r = await runCli(cli, v ? [v] : [], port, TOK.dial);
      seen.calls++;
      bodies.push([`vibespace-vault ${v || '(no verb)'}`, r.out]);
      const h = hitsOf(r.out);
      if (h.length) leaks.push(`vibespace-vault ${v || '(no verb)'} ⇒ ${h.join(', ')}`);
    }
    // a door that MADE a value during the sweep (a mint, when it lands) — its value is in no answer either
    if (eng8.state() !== 'unlocked') await eng8.unlock(PW8, {});
    const made = eng8.secretNames().filter((x) => /^agent:/.test(x.name)).map((x) => [x.name, eng8.secretGet(x.name).value]).filter(([, b]) => b && b.length >= 12);
    for (const [where, text] of bodies) for (const [name, b] of made) if (formsOf(b).some((f) => text.includes(f))) leaks.push(`${where} ⇒ the value of ${name}, made during the sweep`);
    seen.made = made.length;
    await new Promise((res) => srv.close(res));
    return { leaks, routes: routes.map((x) => x.join(' ')), ...seen };
  }
  const { registerVaultRoutes: reg8 } = require(path.join(REPO, 'src/routes/vault.js'));
  const s0 = await sweep(reg8);
  ok(s0.leaks.length === 0 && s0.calls >= 20, `(c) THE SWEEP: ${s0.routes.length} agent routes × ${BEARERS.length} bearers + the CLI's verbs + every broadcast frame (${s0.calls} answers) ⇒ no stored value in any form`, s0.leaks);
  ok(s0.own, '(c) …the POSITIVE CONTROL: the exception\'s own answer (a session on a machine asking its link-token door) carries its own machine\'s token — the sweep sees a value when one is there');
  const auditUse = fs.readFileSync(path.join(d8, VE8.AUDIT_FILE), 'utf8');
  ok(/"event":"vault-use"[^\n]*"door":"link-token"[^\n]*"outcome":"ok"/.test(auditUse) && hitsOf(auditUse).length === 0, 'the link-token answers are USES in the audit (door link-token, outcome ok) — and the audit holds no stored value in any form', hitsOf(auditUse));

  // (d) THE MUTANTS
  const Module8 = require('module');
  const loadAs = (rel, src) => { const abs = path.join(REPO, rel); const m = new Module8(abs, null); m.filename = abs; m.paths = Module8._nodeModulePaths(path.dirname(abs)); m._compile(src, abs); return m.exports; };
  const RV = 'src/routes/vault.js';
  const routesSrc = tree.get(RV);
  const anchor8 = '  // ── agents: the state and the lock — never unlock ──\n';
  const planted = routesSrc.replace(anchor8, "  app.get('/api/agent/vault/peek', (req, res) => { if (!agentOk(req)) return answer(res, { ok: false, code: 'unauthorized' }); const g = vault.secretGet('frp:token'); res.json({ ok: true, peek: g.ok && g.value ? g.value.toString('utf8') : null }); });\n" + anchor8);
  ok(planted !== routesSrc, 'the mutant\'s anchor is in src/routes/vault.js');
  const mt = new Map(tree); mt.set(RV, planted);
  const m1 = useCensus(mt);
  ok(m1.red.some((l) => /GET \/api\/agent\/vault\/peek is not classified/.test(l)), `MUTANT RED (a): a planted agent route that answers a stored value, unclassified ⇒ ${m1.red[0] || 'GREEN'}`);
  const m2 = useCensus(mt, { extraRoutes: { 'GET /api/agent/vault/peek': ['receipt', 'a lie'] } });
  ok(m2.red.some((l) => /reaches vault\.secretGet \(hub-only\)/.test(l)), `MUTANT RED (b): the same route classified as a receipt — its handler reaches a hub-only key ⇒ ${m2.red[0] || 'GREEN'}`);
  const s1 = await sweep(loadAs(RV, planted).registerVaultRoutes);
  ok(s1.leaks.some((l) => /peek[^\n]*relay token/.test(l)), `MUTANT RED (c): the sweep over the planted route finds the relay token in its answer ⇒ ${s1.leaks[0] || 'GREEN'}`);
  const cliSrc = tree.get('data/bin/vibespace-vault');
  const plantedCli = cliSrc.replace("  if (cmd === 'lock')", "  if (cmd === 'peek') { const d = await call('GET', '/api/agent/vault/link-token'); console.log(d.token); return; }\n  if (cmd === 'lock')");
  ok(plantedCli !== cliSrc, 'the CLI mutant\'s anchor is in data/bin/vibespace-vault');
  const mc = new Map(tree); mc.set('data/bin/vibespace-vault', plantedCli);
  const m3 = useCensus(mc);
  ok(m3.red.some((l) => /the verb "peek" is not classified/.test(l)), `MUTANT RED (a): a planted CLI verb, unclassified ⇒ ${m3.red[0] || 'GREEN'}`);
  const cliCopy = path.join(ROOT8, 'vibespace-vault-peek'); fs.writeFileSync(cliCopy, plantedCli, { mode: 0o700 });
  const s2 = await sweep(reg8, { cli: cliCopy });
  ok(s2.leaks.some((l) => /vibespace-vault peek ⇒ link token \(own machine\)/.test(l)), `MUTANT RED (c): the planted verb run against the real doors prints the machine's link token ⇒ ${s2.leaks[0] || 'GREEN'}`);
  eng8.close();
  fs.rmSync(ROOT8, { recursive: true, force: true });
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

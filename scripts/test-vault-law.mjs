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
//   ⑧ THE NAMED EXCEPTION the owner decided (design q-051, 2026-10-20): the per-instance relay token is NOT a vault entry —
//      SECRETS_AT_REST names it with the decision, its date and its reason; it is no store key (no STORE_KEYS row, no
//      key-file name); the shared relay token stays the vault's `frp:token` until it retires (the row says when)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
  ok(agentDoors.join() === '/api/agent/vault/totp/:name,/api/agent/vault/state,/api/agent/vault/lock,/api/agent/vault/mint,/api/agent/vault/put,/api/agent/vault/link-token,/api/agent/vault/run,/api/agent/vault/runnable', `the agent doors are the two-step code, state, lock, mint, put, the session's own link token, run and runnable only (${agentDoors.join(', ')})`);
  // design q-047 L1 (lane vault-totp): + the TWO-STEP CODE door — a GET answering a granted entry's CURRENT code (never the
  // seed: its answer is built from named fields only — test-vault-routes ⑨ plants a seed and ⑩'s mutant leaks it ⇒ RED)
  const codeDoor = (() => { const i = routes.indexOf("app.get('/api/agent/vault/totp/:name'"); const j = routes.indexOf('\n    });', i); return i > 0 && j > i ? routes.slice(i, j) : ''; })();
  ok(/res\.json\(\{ ok: true, name: r\.name, code: r\.code, secondsLeft: r\.secondsLeft, period: r\.period \}\)/.test(codeDoor) && !/seed|secretGet|reveal|unlock/.test(codeDoor) && /callerOf\(token\)/.test(codeDoor),
    'the two-step code door answers NAMED fields only (name, code, secondsLeft, period) — no seed, no secretGet, no reveal, no unlock; its caller is the session token\'s conversation');
  // lane vault-run-door: + RUN (the hub spawns the command with the value injected; the answer is the SCRUBBED output) and
  // RUNNABLE (the entries a run may reference — names, never a value)
  const cliRuns = /\/api\/agent\/vault\/run'/.test(cli) && /\/api\/agent\/vault\/runnable'/.test(cli);
  ok(cliRuns, 'data/bin/vibespace-vault calls run and runnable (lane vault-run-door) — and still no unlock / setup / change (above)');
  // THE RUN DOOR'S ANSWER (lane vault-run-door): every chunk of the child's stdout / stderr reaches `parts` only through its
  // stream's scrubber, the tail at the end too; the answer's two streams are those parts through secret-shapes — nothing else
  const door = tree.get('src/server/vault-run-door.js') || '';
  const scrubbedOnly = (t) => {
    const pushes = [...t.matchAll(/parts\[k\]\.push\(([^;]*)\);/g)].map((m) => m[1]);
    return pushes.length === 2 && pushes.every((a) => /^masks\[k\]\.push\(/.test(a))
      && /const outT = redactLong\(parts\.out\.join\(''\)\), errT = redactLong\(parts\.err\.join\(''\)\);/.test(t)
      && /stdout: outT\.text, stderr: errT\.text/.test(t) && !/stdout: (?!outT\.text|utf8Head\(outT\.text\))/.test(t) && !/stderr: (?!errT\.text|utf8Head\(errT\.text\))/.test(t);
  };
  ok(scrubbedOnly(door), 'the run door hands the agent ONLY scrubbed text: each stream chunk enters its parts through createMasker\'s push (the end\'s tail too), the answer\'s stdout / stderr are those parts through secret-shapes — no other stdout / stderr field');
  ok(!scrubbedOnly(door.replace('if (text) parts[k].push(masks[k].push(text));', 'if (text) parts[k].push(text);')), 'MUTANT: a stream chunk handed on without its scrubber ⇒ RED');
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

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

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
//   ⑩ THE AGY LOGIN FILE (lane agy-subagent-cards): the subagent reader (data/bin/agy-wrapper.js over src/agy-store.js)
//      never opens antigravity-oauth-token — its verdict refuses the name, no reader spells it, and END TO END the real
//      wrapper + the fake agy over a store whose every tailed file is a LINK to the login file (which holds a canary in all
//      three shapes the reader parses) journal no byte of it; the hub's reader of a sub that already ran (src/agy-backfill.js,
//      the cards' addendum) over the same store draws none either — both read through ONE gate, src/agy-store-fs.js;
//      RED: that gate as a copy that follows links ⇒ the wrapper journals the canary and the hub's reader draws it
//   ⑪ lane passkey-sink: A KERNEL PASSKEY SIGNATURE IS A USE — the watch's ONE use seam (pkUse → the wiring's vault.noteUse); the real
//      watch over the fake kernel with the passkeys' key in a REAL vault: one vault-use line per new key / signature (purpose +
//      receipt, never the key / its blob / the signature); the vault locked ⇒ webauthn_key_locked, nothing signed
//   ⑫ lane browser-login: A WEB LOGIN IS A VAULT ENTRY, ITS FILL A USE — `web-login:<origin>#<user>` is an ENTRY (SECRET_RE), never a
//      store key; the ONE writer (src/server/browser-logins.js) seals it, the engine's noteUse is its ONE use writer (purpose «sign in
//      at <origin>» + a receipt, the closed key set); THE SENTINEL SWEEP over the REAL route + watch + fake kernel + a REAL vault: every
//      answer of `POST /api/agent/browser/login` (a fill, a signup, each refusal) holds no password in any form; MUTANT: a watch copy
//      that answers the values plus a route copy that passes the answer on ⇒ the sweep is RED (and the real route alone, over that
//      leaking watch, still answers none — its named fields are a second belt)
//   ⑬ lane engine-distribution: THE PLUGIN GIT CREDENTIAL IS THE VAULT'S — the `plugin-git` token sealed by the REAL integration
//      store (its key the vault's, lawfulKey), resolved by the installer at the clone (git reads it from the askpass file only);
//      the vault LOCKED ⇒ plugin_git_credential «the vault is locked», git never runs, no key file minted around it
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';   // lane browser-login: ⑫'s leaking watch / route copies (never src/)
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
  // lane vault-paste-request (the owner's ⑥ 「其他密钥或密码…」): THE SECRET KINDS — every entry-name prefix the engine's SECRET_RE
  // names is a row here with who holds it and who may read it back; a kind without its row (or a row with no kind) is RED
  const SECRET_KINDS = {
    host: 'a paired machine\'s link token — host-tokens; the link-token door is the ONE named exception (its own machine\'s attach child); never shown',
    frp: 'the relay token — the frp plugin; the owner reveals it',
    file: 'a sealed file\'s key — sealed-json; never shown',
    apikey: 'VibeSpace\'s own automation key (design q-046) — automation-engine; the owner reveals it to hand it out, an agent uses it by grant',
    totp: 'a two-step code\'s seed (design q-047 L1) — vault-totp; an agent gets the current code by grant, never the seed',
    secret: 'a FREE entry (lane vault-paste-request) — pasted by the owner into For you at an agent\'s request, or added in the Vault window; the owner reveals it (验证是你), an agent uses it by purpose (a run by reference — never its bytes)',
    'web-login': 'a website login (lane browser-login) — the sealed record of PURE src/browser-login.js, written by ONE writer (src/server/browser-logins.js); the custom kernel fills it, an agent never gets its bytes (purpose + receipt — ⑫); the owner reveals its password (验证是你)',
  };
  // the head alternation `^(?:a|b|…):` + every further anchored kind `|^<kind>:` of the same literal (lane browser-login's web-login)
  const kindsOf = (src) => { const m = /const SECRET_RE = \/\^\(\?:([a-z|]+)\):([^\n]*)/.exec(src); return m ? [...m[1].split('|'), ...[...m[2].matchAll(/\|\^([a-z][a-z-]*):/g)].map((x) => x[1])] : []; };
  const engSrc = tree.get('src/server/vault-engine.js') || '';
  const kinds = kindsOf(engSrc);
  const noRow = kinds.filter((k) => !SECRET_KINDS[k]), noKind = Object.keys(SECRET_KINDS).filter((k) => !kinds.includes(k));
  ok(kinds.length >= 6 && !noRow.length && !noKind.length && VE.isSecretName('secret:0a1b2c3d4e') && !VE.isSecretName('secret:') && !VE.isSecretName('secrets:x'), `every secret kind of the engine is a row here — ${kinds.join(', ')} (+ agent:<scope>/<name>, lane vault-mint-put) — none unclassified, none dead`, { noRow, noKind });
  const planted = kindsOf(engSrc.replace('|totp|secret):', '|totp|secret|note):'));
  ok(planted.includes('note') && planted.filter((k) => !SECRET_KINDS[k]).join() === 'note', 'CONTROL: a planted kind (`note:`) in SECRET_RE is a kind with no row — RED');
}

console.log('④ the agent side has no unlock');
{
  const cli = tree.get('data/bin/vibespace-vault') || '';
  ok(cli.length > 0 && /\/api\/agent\/vault\/state/.test(cli) && /\/api\/agent\/vault\/lock/.test(cli) && !/\/api\/(agent\/)?vault\/(unlock|setup|change)/.test(cli), 'data/bin/vibespace-vault calls state and lock — never unlock / setup / change');
  const routes = tree.get('src/routes/vault.js') || '';
  const agentDoors = [...routes.matchAll(/app\.(get|post)\('(\/api\/agent\/vault\/[^']+)'/g)].map((m) => m[2]);
  // lane vault-e2e-password-fix-r2: + the LINK TOKEN door — a remote session's attach child asks for ITS machine's device
  // token (its own session token names the session; the engine is never asked to unlock: LOCKED ⇒ 423 vault_locked)
  // lane vault-paste-request: + the PASTE REQUEST door — an agent asks the owner to paste a secret (ONE For-you item; the answer
  // is the request's id, never a value — the owner's paste goes to the one writer of its place through a person's door)
  ok(agentDoors.join() === '/api/agent/vault/totp/:name,/api/agent/vault/state,/api/agent/vault/lock,/api/agent/vault/mint,/api/agent/vault/put,/api/agent/vault/link-token,/api/agent/vault/secret-request,/api/agent/vault/run,/api/agent/vault/runnable,/api/agent/vault/request,/api/agent/vault/uses', `the agent doors are the two-step code, state, lock, mint, put, the session's own link token, the paste request, run and runnable only (${agentDoors.join(', ')})`);
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
    // lane vault-paste-request: the agent ASKS the owner to paste a secret it does not have — one For-you item with a masked box;
    // the answer is the request's id and the place it names; the value goes to its writer through the owner's cookie door only
    'POST /api/agent/vault/secret-request': ['purpose-door', 'secret-request: a For-you paste box for the owner — the answer is the request\'s id and its place, never a value (the receipt at the next turn names where, never what)'],
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
  for (const [entry, label] of [['frp:token', 'relay token'], ['file:law-pair', 'sealed file key'], ['apikey:ak-law', 'automation key'], ['secret:0a1b2c3d4e', 'free entry']]) {   // lane vault-paste-request: + a free entry (the owner's paste)
    const v = `law-${label.replace(/\W/g, '')}-${crypto.randomBytes(12).toString('hex')}`;
    ok(eng8.secretPut(entry, v).ok, `the sweep's sentinel sealed: ${label}`);
    sentinels.push([label, Buffer.from(v)]);
  }
  ok(sentinels.length === VE8.STORE_KEYS.length + 6, `${sentinels.length} sentinels: every store key, two machines' link tokens, the relay token, a sealed file key, an automation key, a free entry`);
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
    // lane vault-paste-request: the paste door too (its agent route is swept like every other; a real For-you store under it)
    const paste8 = require(path.join(REPO, 'src/server/vault-paste-door.js')).create({ vault: eng8, userTodos: new (require(path.join(REPO, 'src/user-todos.js')).UserTodoManager)({ dataDir: d8, expirySweepMs: 0 }), deliver: { stashFor: (cid, e) => { frames.push(JSON.stringify(e)); return { stored: true }; } } });
    register(app, { vault: eng8, activeSessions: sessions8, getJobs: () => jobs8, linkTokenFor: (hostKey, who) => ht8.tokenFor(hostKey, who), auditLink: () => {}, paste: paste8 });
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
  const cliCopy = path.join(ROOT8, 'vibespace-vault-peek'); fs.writeFileSync(cliCopy, plantedCli, { mode: 0o700 }); fs.copyFileSync(path.join(REPO, 'src/cli-call.js'), path.join(ROOT8, 'cli-call.js'));   // lane cli-call-timeouts: a copy outside the checkout reads THE ONE CALL beside it
  const s2 = await sweep(reg8, { cli: cliCopy });
  ok(s2.leaks.some((l) => /vibespace-vault peek ⇒ link token \(own machine\)/.test(l)), `MUTANT RED (c): the planted verb run against the real doors prints the machine's link token ⇒ ${s2.leaks[0] || 'GREEN'}`);
  eng8.close();
  fs.rmSync(ROOT8, { recursive: true, force: true });
}

console.log('⑩ THE AGY LOGIN FILE (lane agy-subagent-cards): the subagent reader never opens antigravity-oauth-token');
{
  const AS = require(path.join(REPO, 'src/agy-store.js'));
  const H8 = require(path.join(REPO, 'src/harnesses/antigravity.js'));
  const P = '9c0f0000-0000-4000-8000-0000000000a1', S = '49120000-0000-4000-8000-0000000000b1', M1 = 'c0000000-0000-4000-8000-0000000000c1', SG = '.system_generated';
  ok(AS.TOKEN_FILE === path.basename(H8.TOKEN_REL) && !AS.storeReadable(AS.TOKEN_FILE) && !AS.storeReadable(`brain/${S}/${SG}/messages/${AS.TOKEN_FILE}.json`) && !AS.storeReadable(`brain/${S}/${SG}/logs/../../../${AS.TOKEN_FILE}`),
    'the reader\'s verdict refuses the login file by its name (the name the descriptor\'s TOKEN_REL only ever stats)');
  ok(['data/bin/agy-wrapper.js', 'src/agy-store-fs.js', 'src/agy-backfill.js'].every((f) => !read(f).includes(AS.TOKEN_FILE)) && !/require\(['"](?:node:)?fs['"]\)/.test(read('src/agy-store.js')), 'no reader spells the file: the wrapper, the ONE gate (agy-store-fs) and the hub\'s reader (agy-backfill) name it nowhere; agy-store holds no fs');
  const ROOT10 = scratch('vault-law-agy');
  fs.mkdirSync(path.join(ROOT10, 'data', 'bin'), { recursive: true });
  // the scratch root's src = the repo's, entry by entry, so ONE module can be a mutant copy (the gate, below)
  fs.mkdirSync(path.join(ROOT10, 'src'));
  for (const n of fs.readdirSync(path.join(REPO, 'src'))) if (n !== 'agy-store-fs.js') fs.symlinkSync(path.join(REPO, 'src', n), path.join(ROOT10, 'src', n));
  const CANARY = 'TOKEN-CANARY-' + crypto.randomBytes(6).toString('hex');
  // ONE object that parses as a subagent row, a message row AND a transcript step — whichever read follows a link shows it
  const bait = JSON.stringify({ conversationId: S, subagentDescriptor: { typeName: 'self', role: CANARY }, state: 'SUBAGENT_STATE_ALIVE', id: M1, recipient: S, sender: P, timestamp: '2026-10-21T14:32:32Z', content: CANARY, renderDetails: { messageTitle: CANARY }, sourceMetadata: { tool: { conversationId: P, stepIndex: 6, toolCall: { name: 'invoke_subagent', argumentsJson: '{}' } } }, step_index: 0, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-10-21T14:32:33Z' }) + '\n';
  const run = async (tag, wrapper) => {
    const home = path.join(ROOT10, tag), store = path.join(home, '.gemini', 'antigravity-cli'), tok = path.join(store, AS.TOKEN_FILE);
    for (const d of [`brain/${P}/${SG}/subagents`, `brain/${S}/${SG}/messages`, `brain/${S}/${SG}/logs`]) fs.mkdirSync(path.join(store, d), { recursive: true });
    fs.writeFileSync(tok, bait, { mode: 0o600 });
    for (const rel of [`brain/${P}/${SG}/subagents/${S}.json`, `brain/${S}/${SG}/messages/${M1}.json`, `brain/${S}/${SG}/logs/transcript.jsonl`]) fs.symlinkSync(tok, path.join(store, rel));
    const dir = path.join(ROOT10, tag + '-w'); fs.mkdirSync(dir);
    const env = { ...process.env, HOME: home, AGY_WEBUI_CWD: dir, AGY_WEBUI_BACKEND: 'antigravity', AGY_WEBUI_RESUME_ID: P, AGY_STUB_SPAWN_STEP: '6', AGY_WEBUI_SUB_TAIL_MS: '200', AGY_WEBUI_SUB_LOOK_MS: '1500', AGY_WEBUI_AUTH_GRACE_MS: '300' };
    for (const k of Object.keys(env)) if (/^VIBESPACE_|^CLAUDE_CODE_/.test(k)) delete env[k];
    const child = spawn(process.execPath, [wrapper, path.join(dir, 's.buf'), path.join(dir, 's.json'), path.join(REPO, 'scripts/fixtures/antigravity-agy')], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    const logOf = () => { try { return fs.readFileSync(path.join(dir, 'agy-wrapper.log'), 'utf8'); } catch { return ''; } };
    const t0 = Date.now();
    while (!/"kind":"session"/.test(out) && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 30));
    child.stdin.write(JSON.stringify({ type: 'chat-input', text: 'please start a subagent', msgId: 'v1' }) + '\n');
    while (!/subagent tail off/.test(logOf()) && Date.now() - t0 < 12000) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    let buf = ''; try { buf = fs.readFileSync(path.join(dir, 's.buf'), 'utf8'); } catch { }
    return { all: out + buf + logOf(), log: logOf(), turned: /"kind":"prompt_end"/.test(out) };
  };
  const real = await run('real', path.join(REPO, 'data/bin/agy-wrapper.js'));
  ok(real.turned && !real.all.includes(CANARY) && /refused \(a link in the store\)/.test(real.log) && /subagent tail off/.test(real.log),
    'END TO END: every file the tail opens is a link to the login file — the real wrapper says it refused the link, journals and logs NO byte of the canary, and its look ends', real.log.split('\n').filter((l) => /store|subagent/.test(l)).slice(0, 6));
  // the hub's reader of a sub that ALREADY RAN (src/agy-backfill.js, the cards' addendum) over the SAME store: no canary
  const { storeReader } = require(path.join(REPO, 'src/agy-store-fs.js'));
  const hubLog = [];
  const snapOf = (sr) => JSON.stringify(AS.snapshotOf(sr, { parentId: P, toolCallId: `${P}:6`, step: 6 }));
  const hub = snapOf(storeReader(path.join(ROOT10, 'real'), { log: (l) => hubLog.push(l) }));
  ok(!hub.includes(CANARY) && hubLog.some((l) => /refused \(a link in the store\)/.test(l)), 'THE HUB\'S READER (a sub that already ran) over the same store: the SAME gate refuses the links — no byte of the canary in what it would draw', hubLog.slice(0, 3));
  // RED: the ONE gate (src/agy-store-fs.js) as a copy that follows links — the wrapper (unchanged) and the hub both leak
  const gate = read('src/agy-store-fs.js');
  const cut1 = "      if (fs.realpathSync(abs) !== want) { log(`store ${why} refused (a link in the store): ${rel}`); return null; }\n", cut2 = ' | (fs.constants.O_NOFOLLOW || 0)';
  fs.writeFileSync(path.join(ROOT10, 'src', 'agy-store-fs.js'), gate.replace(cut1, '').replace(cut2, ''));
  const mutated = path.join(ROOT10, 'data', 'bin', 'agy-wrapper.js');
  fs.copyFileSync(path.join(REPO, 'data/bin/agy-wrapper.js'), mutated);
  const red = await run('red', mutated);
  ok(gate.includes(cut1) && gate.includes(cut2) && red.all.includes(CANARY), 'RED CONTROL: with the gate as a copy that follows links (no realpath check, no O_NOFOLLOW) the wrapper journals the canary — the leg above can go red', red.all.includes(CANARY) ? 'canary seen' : red.log.slice(-400));
  const redHub = snapOf(require(path.join(ROOT10, 'src', 'agy-store-fs.js')).storeReader(path.join(ROOT10, 'red')));
  ok(redHub.includes(CANARY), 'RED CONTROL: …and the hub\'s reader through that copy draws the canary — its leg can go red too', redHub.slice(0, 200));
  fs.rmSync(ROOT10, { recursive: true, force: true });
}

console.log('⑪ lane passkey-sink: A KERNEL PASSKEY SIGNATURE IS A USE — the real watch over the fake kernel, the passkeys\' key in a REAL vault, the engine\'s ONE use writer');
{
  // the census: the watch notes a use through ONE seam (pkUse → the injected vaultUse), and the wiring hands it the engine's noteUse
  const dsrc = read('src/server/browser-dialogs.js'), wsrc = read('src/server/mounts-plugins-wiring.js');
  const calls = dsrc.match(/\bvaultUse\(/g) || [];
  ok(calls.length === 1 && /function pkUse\([\s\S]{0,600}vaultUse\('passkeys', \{ by: rec\.by === 'human' \? 'human' : 'agent', door: 'passkey'/.test(dsrc) && /vaultUse: \(entry, use, o\) => vault\.noteUse\(entry, use, o\)/.test(wsrc),
    'ONE use seam in the watch (pkUse → vaultUse(\'passkeys\', {by, door: passkey, conv}, {purpose})) and the wiring hands it the engine\'s noteUse — no second use writer', calls.length);
  const ROOT11 = scratch('vault-law-pk');
  fs.rmSync(ROOT11, { recursive: true, force: true }); fs.mkdirSync(ROOT11, { recursive: true });
  const VE = require(path.join(REPO, 'src/server/vault-engine.js')), SB = require(path.join(REPO, 'src/secret-box.js')), KF = require(path.join(REPO, 'src/key-file.js'));
  const PS = require(path.join(REPO, 'src/browser-passkey-store.js')), WA = require(path.join(REPO, 'src/webauthn-sign.js')), Dm = require(path.join(REPO, 'src/server/browser-dialogs.js'));
  const { startFakeKernel } = await import('./fixtures/fake-kernel.mjs');
  const quiet = { log() {}, warn() {}, error() {} };
  const d = path.join(ROOT11, 'data'); fs.mkdirSync(d);
  const eng = VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  ok((await eng.setup('the passkey law\'s second password')).ok, 'a vault set up over this data dir (the passkeys\' key lives in it)');
  // the wiring's own passkeys handle (mounts-plugins-wiring: data/browser-passkeys.json 0600 + browser-passkeys.key through lawfulKey)
  const file = path.join(d, 'browser-passkeys.json'), keyFile = path.join(d, 'browser-passkeys.key');
  const withCipher = (op) => { const k = SB.lawfulKey(keyFile, { raw: true, hasCiphertext: () => SB.holdsCiphertext({ files: [file], re: /v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\./ }) }); if (!k.ok) return { ok: false, code: k.code, file: path.basename(keyFile), words: KF.refusalWords(k.code, path.basename(keyFile)) }; const c = PS.cipherOf(crypto, k.key); try { return op(c); } finally { if (SB.vaultHeld(keyFile)) k.key.fill(0); } };
  const passkeys = { read: () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }, write: (o) => fs.writeFileSync(file, JSON.stringify(o), { mode: 0o600 }), cipher: { seal: (x) => withCipher((c) => c.seal(x)), open: (x) => withCipher((c) => c.open(x)) } };
  const k = await startFakeKernel({ firstUrl: 'https://example.test/' });
  const items = [];
  const w = Dm.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: k.wsUrl }), onLease: () => () => {} }, log: quiet, enableTimeoutMs: 300, holdersOf: () => [{ browserKey: 'bk-1', sessionId: 'conv-pk-1' }], leaseCountOf: () => 1, labelOf: () => 'Work',
    passkeys, takeoverOf: () => false, forYou: { add: (pid, it) => { items.push(it); return 'fy-' + items.length; }, resolve() {} }, vaultUse: (entry, use, o) => eng.noteUse(entry, use, o) });
  try {
    await w.arm('bp-1');
    const T = { profileId: 'bp-1', browserKey: 'bk-1', sessionId: 'conv-pk-1' };
    const reg = await w.passkeyRegister({ ...T, rpId: 'example.test', user: 'alice' });
    w.answerPasskey(reg.proposal.id, { choice: 'once', shown: reg.proposal.shown });
    const c1 = k.triggerWebAuthn({ op: 'create', origin: 'https://example.test', user: { id: Buffer.from('u1').toString('base64url'), name: 'alice', displayName: 'Alice' } });
    const a1 = await c1.answerPromise;
    const row = PS.profileOf(passkeys.read(), 'bp-1').rows[0];
    w.passkeyPolicy('bp-1', row.credentialId.slice(0, 8), 'yes');
    const c2 = k.triggerWebAuthn({ op: 'get', origin: 'https://example.test' });
    const a2 = await c2.answerPromise;
    const pkcs8 = passkeys.cipher.open(row.keySealed);
    const good = a2.outcome === 'completed' && crypto.verify('sha256', Buffer.concat([Buffer.from(a2.get.authenticatorData, 'base64url'), Buffer.from(c2.request.clientDataHash, 'base64url')]), WA.publicKeyOf({ crypto, privateKeyPkcs8: pkcs8 }).publicKey, Buffer.from(a2.get.signature, 'base64url'));
    ok(a1.outcome === 'completed' && good && !fs.existsSync(keyFile) && (fs.statSync(file).mode & 0o777) === 0o600, 'register + sign-in on the kernel with the passkeys\' key HELD BY THE VAULT (no key file beside the data); the signature verifies', { a1: a1.outcome, a2: a2.outcome, keyFile: fs.existsSync(keyFile) });
    await new Promise((r) => setTimeout(r, 50));
    const audit = fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8');
    const lines = audit.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.event === 'vault-use' && l.door === 'passkey');
    ok(lines.length === 2 && lines.every((l) => l.entry === 'browser-passkeys.key' && l.by === 'agent' && l.conv === 'conv-pk-1' && l.outcome === 'ok' && /^vr-[0-9a-f]{12}$/.test(l.receipt) && Object.keys(l).join() === 'at,event,entry,purpose,by,door,conv,actor,outcome,receipt,ip')
      && /register a passkey on example\.test/.test(lines[0].purpose) && /sign in to example\.test with a passkey/.test(lines[1].purpose),
      'THE USE LAW: the new key and the signature are ONE vault-use line each (entry browser-passkeys.key, door passkey, the conversation, the purpose, a receipt — the closed key set)', lines);
    const sentinels = [pkcs8, Buffer.from(pkcs8, 'base64').toString('hex'), Buffer.from(pkcs8, 'base64').toString('base64url'), row.keySealed, a2.get.signature];
    ok(sentinels.every((s) => s && !audit.includes(s)) && !JSON.stringify(eng.usesOf('conv-pk-1')).includes(pkcs8) && eng.usesOf('conv-pk-1').filter((x) => x.door === 'passkey').length === 2, 'no line carries the key (PKCS#8 raw / hex / base64url), its sealed blob, nor the signature — purposes and receipts only; the agent\'s own `uses` reads them back', eng.usesOf('conv-pk-1').length);
    eng.lock();
    const c3 = k.triggerWebAuthn({ op: 'get', origin: 'https://example.test' });
    const a3 = await c3.answerPromise;
    await new Promise((r) => setTimeout(r, 50));
    const after = fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.event === 'vault-use' && l.door === 'passkey');
    ok(a3.outcome === 'cancelled' && a3.error === 'NotAllowedError' && after.length === 2 && /on this instance's page/.test(w.passkeyIn('bp-1', null).text || '') && items.some((i) => /browser-passkeys\.key/.test(i.text || '') && /vault_locked/.test(i.text || '')),
      'the vault LOCKED ⇒ the next sign-in is refused webauthn_key_locked (the page told NotAllowedError, nothing signed, no use line), the key For-you line names the file', { a3, items: items.map((i) => i.text) });
  } finally { w.shutdown(); await k.close(); eng.close(); fs.rmSync(ROOT11, { recursive: true, force: true }); }
}

console.log('⑫ lane browser-login: A WEB LOGIN IS A VAULT ENTRY, ITS FILL A USE — the real route + watch + fake kernel over a REAL vault; the sentinel sweep; a leaking copy is RED');
{
  const VE = require(path.join(REPO, 'src/server/vault-engine.js')), BL = require(path.join(REPO, 'src/browser-login.js')), Lm = require(path.join(REPO, 'src/server/browser-logins.js'));
  const Dm = require(path.join(REPO, 'src/server/browser-dialogs.js')), GS = require(path.join(REPO, 'src/server/grants-store.js')), Rm = require(path.join(REPO, 'src/routes/browser.js'));
  const express = require(path.join(REPO, 'node_modules/express'));
  const { startFakeKernel } = await import('./fixtures/fake-kernel.mjs');
  const quiet = { log() {}, warn() {}, error() {} };
  const NAME = BL.entryName('https://shop.example.test', 'alice');
  ok(VE.isSecretName(NAME) && !VE.STORE_KEYS.some((k) => k.name === NAME || NAME.startsWith(k.name)) && /web-login:/.test(read('src/server/vault-engine.js').match(/const SECRET_RE = [^\n]*/)[0]),
    'a web login is a vault ENTRY (`web-login:<origin>#<user>` — SECRET_RE), never a STORE_KEYS row (no key file, no lawfulKey road)');
  // the ONE writer: only browser-logins.js seals a web-login entry (its writeEntry → secretPut), nothing else in src/ names the prefix in a put
  const putters = [...tree.entries()].filter(([rel, t]) => rel !== 'src/server/browser-logins.js' && /secretPut\([^)\n]*web-login/.test(t)).map(([rel]) => rel);
  const wsrc = read('src/server/browser-logins.js');
  ok(!putters.length && (wsrc.match(/\bvault\.secretPut\(/g) || []).length === 1 && /function writeEntry\([\s\S]{0,500}vault\.secretPut\(name, text, \{ kind: rec\.source/.test(wsrc) && (wsrc.match(/\bvault\.noteUse\(/g) || []).length === 1,
    'THE ONE WRITER: browser-logins.js seals a web login through ONE secretPut (writeEntry) and notes every use through ONE noteUse — nothing else in src/ writes the prefix', putters);
  const ROOT12 = scratch('vault-law-wl');
  fs.rmSync(ROOT12, { recursive: true, force: true }); fs.mkdirSync(ROOT12, { recursive: true });
  const d = path.join(ROOT12, 'data'); fs.mkdirSync(d);
  const eng = VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  ok((await eng.setup('the web login law\'s second password')).ok, 'a vault set up over this data dir');
  const grants = GS.create({ memory: true });
  const logins = Lm.create({ vault: eng, grants: () => grants, forYou: { add: () => 'fy', resolve() {} } });
  const PW = ['wl', crypto.randomBytes(8).toString('hex'), 'Zz'].join('-');   // built at run time
  const forms = (pw) => [pw, Buffer.from(pw).toString('hex'), Buffer.from(pw).toString('base64'), Buffer.from(pw).toString('base64url')];
  ok(logins.addOwn({ origin: 'https://shop.example.test', username: 'alice', password: PW }).ok && eng.secretNames().some((x) => x.name === NAME) && !fs.readFileSync(path.join(d, fs.readdirSync(d).find((f) => /vault/.test(f) && f.endsWith('.json')) || 'vault.json'), 'utf8').includes(PW), 'the owner\'s login is sealed under its entry (the record on disk holds no password in the clear)');
  grants.set('browser-login', 'https://shop.example.test#*', { to: [{ kind: 'conversation', key: 'conv-wl-1' }] });
  const k = await startFakeKernel({ firstUrl: 'https://shop.example.test/login' });
  const PID = 'bp-e0000c01', KEY = 'bk-0000c10a', TOKEN = 'vsst_vault_law_wl';
  const mkWatch = (Dmod) => Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: k.wsUrl }), onLease: () => () => {} }, log: quiet, enableTimeoutMs: 300, holdersOf: () => [{ browserKey: KEY, sessionId: 'sess-wl' }], leaseCountOf: () => 1, labelOf: () => 'Work', logins, conversationOf: () => ({ cid: 'conv-wl-1', name: 'Chat' }) });
  const effProfile = { id: PID, ephemeral: true, owner: { kind: 'conversation', id: KEY }, provider: 'chromium', sharing: 'owner', label: '(ephemeral) Chat', dir: null };
  const stubKeeper = { resolveFor: () => ({ ok: true, kind: 'none', handles: [] }), ensureEphemeral: async () => ({ profile: { id: PID, label: effProfile.label }, browser: { state: 'ready' }, lease: {}, created: false }), socketRootOf: () => ({ socketDir: path.join(ROOT12, 'sock'), runtimeDir: null }), configFileFor: () => path.join(ROOT12, 'cfg.json'), clock: () => Date.now(),
    profile: (id) => (id === PID ? effProfile : null), profileByRef: () => null, setFor: () => ({ attachments: [], handles: [] }), audit() {}, noteLeaseUrl() {}, leasesFor: () => [], inputStateFor: () => ({ input: 'agent', takenAt: 0 }), ephemeralFor: (bk) => (bk === KEY ? { profileId: PID, sessionId: 'sess-wl' } : null), cdpEndpointFor: async (pid) => (pid === PID ? { ok: true, url: k.wsUrl } : { ok: false }), onLease: () => () => {} };
  const sessions = new Map([['sess-wl', { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'Chat', cwd: ROOT12, backendSessionId: 'conv-wl-1' }]]);
  const serve = async (R, w) => { R.setup({ keeper: stubKeeper, activeSessions: sessions, dialogs: w, logins, tasksForSession: () => [] }); const app = express(); app.use(express.json()); app.use(R.router); const srv = http.createServer(app); const port = await freePort(); await new Promise((r) => srv.listen(port, '127.0.0.1', r)); return { srv, url: `http://127.0.0.1:${port}/api/agent/browser/login` }; };
  const ask = async (url, body) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ profile: PID, ...body }) }); return { status: r.status, text: await r.text() }; };
  const MUT = mutantCopies('vault-law-wl', REPO);
  const servers = [];
  const watches = [];
  try {
    const w = mkWatch(Dm); watches.push(w);
    await w.arm(PID);
    const tid = k.targets()[0].targetId;
    k.detectCredentialForm({ targetId: tid, kind: 'login' });
    k.detectCredentialForm({ targetId: tid, kind: 'signup', surfaceId: 'surf-cred-signup' });
    for (let i = 0; i < 100 && w.loginForms(PID).length < 2; i++) await new Promise((r) => setTimeout(r, 10));
    const real = await serve(Rm, w); servers.push(real.srv);
    const answers = [await ask(real.url, { user: 'alice' }), await ask(real.url, { user: 'alice', submit: true }), await ask(real.url, { user: 'nobody' }), await ask(real.url, { origin: 'https://other.example.test' }), await ask(real.url, { newUser: 'bob', generate: true })];
    const bob = eng.secretGet(BL.entryName('https://shop.example.test', 'bob'));
    const bobPw = bob.ok && bob.value ? BL.recordOf(bob.value.toString('utf8')).password : null;
    const sentinels = [...forms(PW), ...(bobPw ? forms(bobPw) : [])];
    ok(answers[0].status === 200 && answers[4].status === 200 && answers[2].status === 404 && answers[3].status === 403 && bobPw && k.filledCredentials().length >= 3, 'the route answers a fill, a submitted fill, a signup and two refusals (login_no_entry 404 · login_phishing 403)', answers.map((a) => [a.status, a.text.slice(0, 160)]));
    ok(answers.every((a) => sentinels.every((x) => !a.text.includes(x))), 'THE SENTINEL SWEEP: no answer of the route holds a password (the owner\'s or the one the vault minted) — raw, hex, base64 or base64url');
    const lines = fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.event === 'vault-use' && l.door === 'browser-login');
    ok(lines.length >= 3 && lines.every((l) => /^web-login:https:\/\/shop\.example\.test#/.test(l.entry) && l.by === 'agent' && l.conv === 'conv-wl-1' && Object.keys(l).join() === 'at,event,entry,purpose,by,door,conv,actor,outcome,receipt,ip') && lines.some((l) => l.purpose === 'sign in at https://shop.example.test' && l.outcome === 'ok') && lines.some((l) => /register an account/.test(l.purpose)) && sentinels.every((x) => !fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8').includes(x)),
      'THE USE LAW: every fill is ONE vault-use line through the engine\'s noteUse (the entry, door browser-login, the conversation, the purpose, a receipt — the closed key set), never a password', lines.map((l) => [l.entry, l.purpose, l.outcome]));
    // MUTANT: a watch copy that answers the values, a route copy that passes the answer on
    const dsrc = read('src/server/browser-dialogs.js'), rsrc = read('src/routes/browser.js');
    const leakD = dsrc.replace('    plan.values = null; // handed to the kernel — kept by no one here\n', '').replace("return { ok: true, mode: plan.mode, origin: plan.origin, user: plan.user, filled: plan.filled,", "return { ok: true, values: plan.values, mode: plan.mode, origin: plan.origin, user: plan.user, filled: plan.filled,");
    const leakR = rsrc.replace("res.json({ ok: true, mode: r.mode, origin: r.origin, user: r.user, filled: r.filled, submitted: !!r.submitted, receipt: r.receipt || null, text });", "res.json({ ok: true, ...r, text });");
    ok(leakD !== dsrc && leakR !== rsrc, 'the two mutation anchors are found (the watch\'s answer, the route\'s named fields)');
    const DL = MUT.load('src/server/browser-dialogs.js', leakD, 'leakwatch');
    const wl = mkWatch(DL); watches.push(wl);
    await wl.arm(PID);
    k.detectCredentialForm({ targetId: tid, kind: 'login', surfaceId: 'surf-cred-again' });
    for (let i = 0; i < 100 && !wl.loginForms(PID).length; i++) await new Promise((r) => setTimeout(r, 10));
    const half = await serve(Rm, wl); servers.push(half.srv);
    const a1 = await ask(half.url, { user: 'alice' });
    ok(a1.status === 200 && forms(PW).every((x) => !a1.text.includes(x)), 'the REAL route over a leaking watch still answers no value — its named fields are a second belt');
    const RL = MUT.load('src/routes/browser.js', leakR, 'leakroute');
    const both = await serve(RL, wl); servers.push(both.srv);
    const a2 = await ask(both.url, { user: 'alice' });
    ok(a2.status === 200 && forms(PW).some((x) => a2.text.includes(x)), 'MUTANT RED: a watch copy that answers the values + a route copy that passes the answer on ⇒ the sweep sees the password (the sweep bites)');
  } finally {
    for (const x of servers) { try { x.close(); } catch {} }
    for (const x of watches) { try { x.shutdown(); } catch {} }
    await k.close(); eng.close(); fs.rmSync(ROOT12, { recursive: true, force: true });
  }
}

// ═══ ⑬ lane engine-distribution: THE PLUGIN GIT CREDENTIAL IS THE VAULT'S — sealed by the integration store's key (lawfulKey),
// resolved at the clone, refused BY NAME while the vault is locked (never read around it) ═══
console.log('⑬ lane engine-distribution: the plugin-git credential through the REAL integration store over a REAL vault — sealed, used at the clone, locked ⇒ refused');
{
  const ROOT13 = scratch('vault-law-git');
  fs.rmSync(ROOT13, { recursive: true, force: true }); fs.mkdirSync(ROOT13, { recursive: true });
  const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
  const IS = require(path.join(REPO, 'src/server/integration-store.js'));
  const PI = require(path.join(REPO, 'src/server/plugin-install.js'));
  const { gitRepoFixture, URL_HTTPS } = await import('./fixtures/git-repo.mjs');
  const quiet = { log() {}, warn() {}, error() {} };
  const d = path.join(ROOT13, 'data'); fs.mkdirSync(path.join(d, 'plugins'), { recursive: true });
  const eng = VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  const VPW = ['law', crypto.randomBytes(4).toString('hex'), 'git'].join(' ');
  ok((await eng.setup(VPW)).ok, 'a REAL vault, set up (the integration store\'s key is the vault\'s from here — lawfulKey)');
  const is = IS.create({ dataDir: d, env: {}, now: () => Date.now(), broadcast: () => {}, log: quiet });
  const TOK = ['law', 'pat', crypto.randomBytes(5).toString('hex')].join('-'); // built at runtime
  is.setIntegration('plugin-git', { host: 'repo.test', token: TOK });
  const onDisk = fs.readFileSync(path.join(d, 'integrations.json'), 'utf8');
  ok(!onDisk.includes(TOK) && !fs.existsSync(path.join(d, '.integrations-key')), 'the token is SEALED in data/integrations.json (no clear text, no key file beside the vault)');
  const FX = gitRepoFixture(path.join(ROOT13, 'repo'), [{ files: { 'vibespace-plugin.json': { id: 'acme.lawgit', version: '1.0.0', engines: { vibespace: '2.369.24' } } }, tag: 'v1' }]);
  const ins = PI.create({ rootDir: ROOT13, log: quiet, integrations: () => is, gitBin: FX.WRAP });
  FX.resetCalls();
  const r1 = await ins.install({ source: 'git', value: URL_HTTPS, ref: 'v1', credential: 'plugin-git' });
  const f1 = FX.calls().find((c) => c.argv.includes('fetch'));
  ok(r1.id === 'acme.lawgit' && f1 && f1.ask && f1.ask.pass === TOK && !f1.argv.some((a) => a.includes(TOK)) && !Object.values(f1.env).some((v) => String(v).includes(TOK)), 'unlocked: the installer resolves the sealed token through the store at the clone — git reads it from the askpass file only');
  eng.lock();
  FX.resetCalls();
  let e2 = null; try { await ins.install({ source: 'git', value: URL_HTTPS, ref: 'v1', credential: 'plugin-git' }); } catch (e) { e2 = e; }
  ok(e2 && e2.code === 'plugin_git_credential' && /vault is locked/i.test(e2.message) && FX.calls().length === 0 && !fs.existsSync(path.join(d, '.integrations-key')), 'LOCKED: the install is refused plugin_git_credential, «the vault is locked» — git never ran, no key file was minted to read around it', e2 && e2.message);
  let e2a = null; try { await ins.install({ source: 'git', value: URL_HTTPS, ref: 'v1', credential: 'auto' }); } catch (e) { e2a = e; }
  ok(e2a && e2a.code === 'plugin_git_credential' && FX.calls().length === 0, 'LOCKED + the fleet\'s \'auto\': refused by name too — never an anonymous clone that would only fail as «auth» and hide the locked vault', e2a && e2a.message);
  await eng.unlock(VPW);
  const r3 = await ins.install({ source: 'git', value: URL_HTTPS, ref: 'v1', credential: 'plugin-git' });
  ok(r3.id === 'acme.lawgit', 'unlock ⇒ the credential serves the clone again');
  eng.close(); fs.rmSync(ROOT13, { recursive: true, force: true });
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

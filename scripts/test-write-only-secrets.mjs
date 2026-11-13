#!/usr/bin/env node
// THE WRITE-ONLY LAW — a secret field's bytes never ride a GET answer (lane ui-controls-and-bugs; 主开发's rulings 2026-11-13).
// The UI walk found the storage Edit dialog showing a Google Drive record's OAuth token in an edit box. The dialog is fed by
// GET /api/mounts/:id/config, so the defect was the ROUTE. The channel accounts' GET /api/channels/adapters/:id/config did
// the same with a custom app secret. THE LAW, one census over the TABLES that mark a field secret:
//   · the storage records — a secret is what a record SEALS (every `<cell>Enc`; a raw rclone parameter by its name,
//     MountManager.SECRET_PARAM);
//   · the integration registry — every row field `secret: true` (the channel vendors' client secrets are rows here too);
//   · the channel accounts — a vendor's client secret (R.clientFieldsOf(row).secretKey), held on the account.
// A GET answer says a secret is SET (`held` / `set` / `client.secretSet`) and never carries its bytes; the forms draw
// «已保存» + «替换…» (an empty box, sent only when typed). The integrations mask keeps ONLY its declared tail
// (R.MASK_TAIL_MIN: the last 4 — «masking permits 4»). Fast tier, in-process, no server. Every leg is derived from the
// tables, so the next secret field / row / route is RED until its answer obeys:
// ① STORAGE: every sealed cell named in the tree × every provider row (+ a child), masked and not — no byte; `held` names it
// ② the rclone PARAMETER rule: secret names held and blank, the others keep their value
// ③ INTEGRATIONS: every registry row's every secret field, planted as a company preset — list() and publicView() carry at
//    most its declared tail; `set` says it is set
// ④ CHANNEL ACCOUNTS: every vendor row with a client secret — an account holding a planted custom secret: adapterConfig,
//    adapterView and the accounts digest carry no byte; `client.secretSet` says it is held
// ⑤ THE ROUTES: every GET handler in the tree that decrypts (`.dec(` / `_dec(` / `oauthTokenOf` / `oauthClientOf`) is a
//    named, reasoned site; `mounts.config(` has ONE caller
// ⑥ THE PAGES: the storage Edit dialog (heldFields / wireHeld / the submit's skip, SECRET_FIELD covers ①'s cells) and
//    the shared field renderer (`held` → «已保存» + «替换…»); the channel dialogs never read `client.appSecret`
// ⑦ CONTROLS: copies without the law (storage writeOnly / channels' adapterConfig answering the secret) are RED
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const ROOT = scratch('write-only-secrets');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
for (const k of Object.keys(process.env)) if (/^VIBESPACE_(INTEGRATION|GDRIVE|PRESETS)/.test(k)) delete process.env[k];
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const PROV = require(path.join(REPO, 'src/mount-providers/index.js'));
const R = require(path.join(REPO, 'src/integration-registry.js'));
const STORE = require(path.join(REPO, 'src/server/integration-store.js'));
const ENG_PATH = path.join(REPO, 'src/server/channels-engine.js');
const { secretBox } = require(path.join(REPO, 'src/secret-box.js'));
const MC = mutantCopies('write-only-secrets', REPO);
const quiet = { log() {}, info() {}, warn() {}, error() {}, debug() {} };

// ── ① ② STORAGE ──────────────────────────────────────────────────────────────────────────────────────────────────
const PROVIDER_FILES = fs.readdirSync(path.join(REPO, 'src/mount-providers')).filter((f) => f.endsWith('.js')).map((f) => `src/mount-providers/${f}`);
const CELLS = [...new Set(['src/mounts.js', ...PROVIDER_FILES].flatMap((f) => [...read(f).matchAll(/\b([a-z][A-Za-z]*)Enc\b/g)].map((m) => m[1])))]
  .filter((c) => c !== 'params' && c !== 'extraParams').sort();
const plantOf = (c) => `wo-${c}-7f3a`;
const PARAMS = { token: 'wo-p-tok-7f3a', client_secret: 'wo-p-cs-7f3a', pass: 'wo-p-pw-7f3a', secret_access_key: 'wo-p-sak-7f3a', service_account_credentials: 'wo-p-sac-7f3a',
  team_drive: 'kept-team-drive', access_key_id: 'kept-akid', key_file: '/kept/key/file' };
const SECRET_P = Object.keys(PARAMS).filter((p) => MountManager.SECRET_PARAM(p)), PLAIN_P = Object.keys(PARAMS).filter((p) => !MountManager.SECRET_PARAM(p));
const decOf = (id) => { let s = ''; try { s = read(`src/mount-providers/${id}.js`); } catch {} return [...s.matchAll(/(\w+):\s*(?:this\.)?_?dec\(m\.(\w+)Enc\)/g)].map((m) => m[1]); };
function plantMounts(MM, tag) {
  const dir = path.join(ROOT, tag); fs.mkdirSync(dir, { recursive: true });
  const mm = new MM({ dataDir: dir });
  const out = { answered: 0, leaks: [], held: {}, params: {}, errors: [] };
  const secrets = [...CELLS.map(plantOf), ...SECRET_P.map((p) => PARAMS[p]), 'wo-x-tok-7f3a'];
  PROV.rows.forEach((r, i) => {
    const id = `mnt-wo${String(i).padStart(2, '0')}parent`, kid = `mnt-wo${String(i).padStart(2, '0')}child`;
    const rec = { id, name: 'wo-' + r.id, type: r.id, origin: 'manual', mode: 'rw', rcloneType: 'drive', backend: 'dropbox', clientId: 'cid.apps.example.test', createdAt: 0,
      paramsEnc: Object.fromEntries(Object.entries(PARAMS).map(([k, v]) => [k, mm._enc(v)])), extraParamsEnc: { token: mm._enc('wo-x-tok-7f3a'), region: mm._enc('kept-region') } };
    for (const c of CELLS) rec[c + 'Enc'] = mm._enc(plantOf(c));
    mm._state.mounts.push(rec);
    mm._state.mounts.push({ id: kid, name: 'wo-' + r.id + '-child', type: r.id, parentId: id, origin: 'manual', mode: 'rw', createdAt: 0 });
    for (const [rid, label] of [[id, r.id], [kid, r.id + ' (child)']]) for (const masked of [false, true]) {
      let a; try { a = mm.config(rid, { masked }); } catch (e) { out.errors.push(`${label}: ${e.message}`); continue; }
      out.answered++;
      const text = JSON.stringify(a);
      for (const v of secrets) if (text.includes(v)) out.leaks.push(`${label}${masked ? ' (outside the window)' : ' (inside the window)'} carried ${v}`);
      if (!masked && rid === id) { out.held[r.id] = a.held || []; out.params[r.id] = a.params || null; }
    }
  });
  return out;
}
console.log('① STORAGE — every sealed cell × every provider row: no byte, inside the vault\'s reveal window or out of it');
ok(CELLS.length >= 7 && ['token', 'clientSecret', 'secretKey', 'pass'].every((c) => CELLS.includes(c)), `the sealed cells are read from the tree (${CELLS.join(', ')})`);
const mt = plantMounts(MountManager, 'mounts');
ok(mt.answered >= PROV.rows.length * 4, `config() answered for every row and its child, masked and not (${mt.answered} answers over ${PROV.rows.length} rows)`, mt.errors.join(' ; '));
ok(mt.leaks.length === 0, `none of the ${CELLS.length} planted cells, the ${SECRET_P.length} secret parameters or the extra-parameter token reached an answer`, mt.leaks.slice(0, 6).join(' ; '));
for (const r of PROV.rows) { const cells = decOf(r.id); if (cells.length) ok(cells.every((c) => (mt.held[r.id] || []).includes(c)), `${r.id}: every cell its config hook decrypts (${cells.join(', ')}) is named in \`held\``, JSON.stringify(mt.held[r.id])); }
console.log('② THE rclone PARAMETER RULE');
const raw = PROV.rows.find((r) => r.rawRclone), rp = raw && mt.params[raw.id];
ok(!!rp && SECRET_P.length >= 4 && SECRET_P.every((p) => rp[p] === '' && (mt.held[raw.id] || []).includes('param:' + p)), `${raw && raw.id}: the secret parameters (${SECRET_P.join(', ')}) are blank and held`, JSON.stringify(rp));
ok(!!rp && PLAIN_P.length >= 3 && PLAIN_P.every((p) => rp[p] === PARAMS[p]), `${raw && raw.id}: the others (${PLAIN_P.join(', ')}) keep their value inside the window`, JSON.stringify(rp));

// ── ③ INTEGRATIONS ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('③ INTEGRATIONS — every registry row\'s every secret field (a company preset): at most its declared tail');
const accountBound = (row) => { try { return !!R.bindsPerAccount(row.id); } catch { return false; } };   // its secret lives on each ACCOUNT (④), not on a card
const perMachine = (row) => { try { return !!R.bindsPerMachine(row.id); } catch { return row.bindsPerMachine === true; } };   // kept per paired machine (③b)
const secretRows = R.ROWS.filter((row) => (row.fields || []).some((f) => f.secret) && !accountBound(row) && !perMachine(row));
const machineRows = R.ROWS.filter((row) => (row.fields || []).some((f) => f.secret) && perMachine(row));
const iIdx = new Map(); const iPlant = (row, f) => { const k = row.id + '.' + f.key; if (!iIdx.has(k)) iIdx.set(k, iIdx.size); return `wQ${iIdx.get(k).toString(36)}x7f3a9c1d2e8b5`; };   // opaque: no word of a field name inside
const windows = (p, n = 6) => Array.from({ length: p.length - n + 1 }, (_, i) => p.slice(i, i + n));   // every 6-window reaches past a 4-char tail
const entries = secretRows.map((row) => ({ id: row.id, key: 'wo', label: 'Write-only census', values: Object.fromEntries(row.fields.map((f) => [f.key, f.secret ? iPlant(row, f) : 'wo-plain'])) }));
const istore = STORE.create({ dataDir: path.join(ROOT, 'istore'), env: { VIBESPACE_INTEGRATIONS: JSON.stringify(entries) }, log: quiet });
let iviews = [], ilist = null;
try { ilist = istore.list(); } catch (e) { ilist = { error: e.message }; }
for (const row of secretRows) { try { iviews.push([row, istore.publicView(row.id)]); } catch (e) { iviews.push([row, { error: e.message }]); } }
const iText = JSON.stringify(ilist) + JSON.stringify(iviews.map(([, v]) => v));
const fieldsCount = secretRows.reduce((n, row) => n + row.fields.filter((f) => f.secret).length, 0);
ok(secretRows.length >= 8 && fieldsCount >= 9, `the secret fields are read from the registry (${fieldsCount} fields over ${secretRows.length} rows: ${secretRows.map((r) => r.id).join(', ')})`);
const iLeaks = secretRows.flatMap((row) => row.fields.filter((f) => f.secret).map((f) => [row, f, iPlant(row, f)])).filter(([, , p]) => windows(p).some((w) => iText.includes(w)));
ok(iLeaks.length === 0, 'list() and every publicView() carry at most a secret\'s last 4 characters (the declared mask tail) — never more', iLeaks.slice(0, 4).map(([r, f]) => `${r.id}.${f.key}`).join(', '));
const planted = iviews.filter(([row, v]) => v && v.set && row.fields.filter((f) => f.secret).every((f) => v.set[f.key] === true));
ok(planted.length === secretRows.length, `every row SAYS its planted secrets are set (\`set\`) — the census planted what it judged (${planted.length}/${secretRows.length})`, iviews.filter(([r, v]) => !planted.some(([p]) => p === r)).map(([r, v]) => `${r.id}: ${v.error || JSON.stringify(v.set)}`).join(' ; '));

console.log('③b PER-MACHINE ROWS — a machine\'s record (machineView): not even a tail');
const CAND = { user: ['wouser'], domain: [''], certFp: [Array(32).fill('ab').join(':')], auth: ['vnc', 'password', 'user-password', 'vnc-password', 'none', 'userpass'] };
const mPlant = (row, f) => `wM${row.id.length.toString(36)}${f.key.length.toString(36)}x7f3a9c1d2e8b5q`;
const mviews = [];
for (const row of machineRows) {
  const plain = row.fields.filter((f) => !f.secret), combos = plain.reduce((acc, f) => acc.flatMap((c) => (CAND[f.key] || ['wo-plain']).map((v) => ({ ...c, [f.key]: v }))), [{}]);
  let view = null, why = 'no accepted combination';
  for (const c of combos) {
    const vals = { ...c, ...Object.fromEntries(row.fields.filter((f) => f.secret).map((f) => [f.key, mPlant(row, f)])) };
    try { istore.setMachineValues(row.id, 'host-wo', vals); view = istore.machineView(row.id, 'host-wo'); break; } catch (e) { why = e.message; }
  }
  mviews.push([row, view, why]);
}
ok(machineRows.length >= 2 && mviews.every(([row, v]) => v && row.fields.filter((f) => f.secret).every((f) => v.set[f.key] === true)), `every per-machine row holds its planted secrets and SAYS so (${machineRows.map((r) => r.id).join(', ')})`, mviews.filter(([, v]) => !v).map(([r, , w]) => `${r.id}: ${w}`).join(' ; '));
const mText = JSON.stringify(mviews.map(([, v]) => v));
ok(mviews.every(([, v]) => !!v) && machineRows.every((row) => row.fields.filter((f) => f.secret).every((f) => !windows(mPlant(row, f), 4).some((w) => mText.includes(w)))), 'machineView carries none of a secret — not even a 4-character tail');

// ── ④ CHANNEL ACCOUNTS ────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ CHANNEL ACCOUNTS — every vendor row with a client secret: an account holding a planted custom secret');
const vendorRows = R.ROWS.filter((row) => { try { const cf = R.clientFieldsOf(row); return accountBound(row) && cf && cf.secretKey && (row.fields || []).some((f) => f.key === cf.secretKey && f.secret) && fs.existsSync(path.join(REPO, 'src/channels', row.id, 'manifest.js')); } catch { return false; } });
async function plantChannels(enginePath, tag) {
  const dir = path.join(ROOT, tag); fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  const box = secretBox(path.join(dir, '.channels-key'));
  const plants = {};
  const adapters = vendorRows.map((row) => {
    plants[row.id] = `wC${row.id.length.toString(36)}x7f3a9c1d2e8b5k`;   // opaque: no word of the JSON inside
    return { id: `acc-wo-${row.id}`, kind: row.id, label: `WO ${row.id}`, enabled: true, credentialKey: 'custom', credential: { appId: `woapp-${row.id}`, appSecretEnc: box.enc(plants[row.id]) },
      auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, scan: null };
  });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters }));
  const ENG = require(enginePath);
  const integrations = STORE.create({ dataDir: path.join(dir, 'istore'), env: {}, log: quiet });
  const e = ENG.create({ dataDir: dir, env: {}, serverSetting: () => undefined, broadcast: () => {}, liveSessions: () => [], integrations, log: quiet });
  const out = { answered: 0, leaks: [], said: {}, errors: [] };
  for (const row of vendorRows) {
    const id = `acc-wo-${row.id}`;
    const answers = [];
    try { const c = e.adapterConfig(id); answers.push(c); out.said[row.id] = !!(c && c.client && c.client.secretSet === true); } catch (er) { out.errors.push(`${row.id} config: ${er.message}`); }
    try { const rec = e.adapterRecords().adapters.find((x) => x.id === id); answers.push(e.adapterView(rec)); } catch (er) { out.errors.push(`${row.id} view: ${er.message}`); }
    out.answered += answers.length;
    if (windows(plants[row.id], 4).some((w) => JSON.stringify(answers).includes(w))) out.leaks.push(`${row.id}: an answer carried the custom secret (or a tail of it)`);
  }
  try { const d = JSON.stringify(e.digest({ scope: 'accounts' })); for (const [k, p] of Object.entries(plants)) if (windows(p, 4).some((w) => d.includes(w))) out.leaks.push(`the accounts digest carried ${k}'s secret (or a tail)`); out.answered++; } catch (er) { out.errors.push(`digest: ${er.message}`); }
  try { await e.stop(); } catch {}
  return out;
}
ok(vendorRows.length >= 3, `the account-bound vendor rows with a client secret are read from the registry (${vendorRows.map((r) => r.id).join(', ')})`);
const ch = await plantChannels(ENG_PATH, 'channels');
ok(ch.answered >= vendorRows.length * 2 && ch.errors.length === 0, `adapterConfig + adapterView answered for every vendor, and the digest (${ch.answered} answers)`, ch.errors.join(' ; '));
ok(ch.leaks.length === 0, 'no answer carries an account\'s custom client secret — not even a 4-character tail (only an Integrations card keeps one)', ch.leaks.join(' ; '));
ok(vendorRows.every((row) => ch.said[row.id]), 'adapterConfig SAYS the secret is held (client.secretSet) — the Edit dialog\'s «已保存» stands on it', JSON.stringify(ch.said));

// ── ⑤ THE ROUTES ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑤ THE ROUTES — a GET handler that decrypts is a named site; mounts.config( has one caller');
const files = execFileSync('git', ['ls-files', 'src', 'server.js'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((f) => /\.(c|m)?js$/.test(f));
const DECRYPTING_GETS = { // file → why its GET handler may decrypt (it never answers the bytes)
};
const getsThatDecrypt = [];
for (const f of files) {
  const src = read(f);
  const re = /\b(?:router|app)\.get\(\s*['"`]([^'"`]+)['"`]/g; let m; const starts = [];
  while ((m = re.exec(src))) starts.push([m.index, m[1]]);
  starts.forEach(([at, route], i) => {
    const body = src.slice(at, i + 1 < starts.length ? starts[i + 1][0] : Math.min(src.length, at + 4000)).split(/\n(?:router|app)\.(?:post|put|patch|delete|use)\(/)[0];
    if (/\b(?:box|_box)?\.?_?dec\(|\.oauth(?:Token|Client)Of\(/.test(body.replace(/\/\/[^\n]*/g, ''))) getsThatDecrypt.push(`${f} GET ${route}`);
  });
}
ok(getsThatDecrypt.every((s) => DECRYPTING_GETS[s.split(' GET ')[0]]), `no GET handler decrypts in its own body (${getsThatDecrypt.length} found${getsThatDecrypt.length ? ': ' + getsThatDecrypt.join(', ') : ''}) — a secret reaches a page only through the checked answers above`);
const cfgSites = files.filter((f) => f !== 'src/mounts.js' && /\bmounts\.config\(/.test(read(f)));
ok(cfgSites.length === 1 && cfgSites[0] === 'src/server/mounts-plugins-wiring.js' && (read(cfgSites[0]).match(/\bmounts\.config\(/g) || []).length === 1, 'mounts.config( has ONE caller — GET /api/mounts/:id/config', cfgSites.join(', '));
const adSites = files.filter((f) => f !== 'src/server/channels-auth.js' && /\.adapterConfig\(/.test(read(f)) && !/src\/adapters\//.test(f));
ok(adSites.length === 1 && adSites[0] === 'src/routes/channels.js', 'adapterConfig( has ONE caller — GET /api/channels/adapters/:id/config', adSites.join(', '));
const SERVER_ONLY = { 'src/server/channel-api.js': 'the channel API\'s ONE fetch site — the token goes to Google, never to a page', 'src/server/channels-wiring.js': 'a channel account borrowing a storage mount\'s client (server-side)' };
const readers = files.filter((f) => f !== 'src/mounts.js' && /\.oauth(Token|Client)Of\b/.test(read(f)));
ok(readers.length > 0 && readers.every((f) => SERVER_ONLY[f]), `the server-only readers of a storage OAuth secret are only the named sites (${readers.join(', ')})`, readers.filter((f) => !SERVER_ONLY[f]).join(', '));

// ── ⑥ THE PAGES ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ THE PAGES — a held secret is «已保存» + «替换…», never its value');
const SM = read('src/lib/sidebar-mounts.js');
const meth = SM.slice(SM.indexOf('    async _showEditMountDialog(m) {'), SM.indexOf('    _showMintShareDialog('));
ok(meth.length > 1000 && /maskVaultFields\(fields, cfg\);[^\n]*\n\s*heldFields\(fields, cfg,/.test(meth) && /if \(opts\?\.html\) return opts\.html;/.test(meth) && /wireHeld\(form\)/.test(meth), 'the storage Edit dialog runs every field through heldFields() before it draws, draws its html and wires «替换…»');
ok(/const box = form\.querySelector\(`\[name="\$\{k\}"\]`\);\s*\n\s*if \(!box\) continue;/.test(meth), 'its submit skips a field with no box (the token\'s sign-in line sends nothing)');
const hf = SM.slice(SM.indexOf('const SECRET_FIELD = '), SM.indexOf('function wireHeld('));
const sets = [...hf.matchAll(/f\[3\]\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
ok(hf.length > 400 && sets.length >= 2 && sets.every((v) => v === "''") && /tr\('Authorized · \{provider\}'/.test(hf) && /tr\('Saved'\)/.test(hf) && /tr\('Replace…'\)/.test(hf), 'heldFields never prefills a secret, says «已保存» + «替换…», and the token is the «已授权 · …» line');
const cellRe = (hf.match(/const SECRET_FIELD = \(k\) => \/(\^\([^)]*\)\$)\//) || [])[1];
const FIELD = cellRe ? new RegExp(cellRe) : null;
ok(!!FIELD && CELLS.every((c) => FIELD.test(c)), `SECRET_FIELD names every sealed cell of ① (missing: ${CELLS.filter((c) => !FIELD || !FIELD.test(c)).join(', ') || 'none'})`);
ok(CELLS.every((c) => !new RegExp(`\\bcfg\\.${c}\\b`).test(SM)), 'no line of src/lib/sidebar-mounts.js reads cfg.<a secret cell>');
const MD = read('src/lib/mounts-dialog.js');
ok(/const heldRow = f\.held && el\.tagName === 'INPUT' \? heldSecretRow\(el\) : null;/.test(MD) && /function heldSecretRow\(input\)[\s\S]{0,400}input\.value = ''; input\.hidden = true;/.test(MD) && /tr\('Saved'\)/.test(MD) && /tr\('Replace…'\)/.test(MD), 'the shared field renderer draws a `held` field as «已保存» + «替换…» over an EMPTY, hidden box');
const CAD = read('src/lib/channel-account-dialogs.js');
ok(!/\bclient\.appSecret\b|cfg\.client\.appSecret|c\.appSecret/.test(CAD) && (CAD.match(/held: !!(?:c\.secretSet|cfg\.client\.secretSet)/g) || []).length === 3, 'the channel dialogs never read the answer\'s secret — the custom client is {appId, held} from client.secretSet (Edit, Re-authorize, Duplicate)');

// ── ⑦ CONTROLS ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑦ CONTROLS — the law removed, the census is RED');
const mSrc = read('src/mounts.js');
ok((mSrc.match(/return writeOnly\(out, m\);/g) || []).length === 1, 'src/mounts.js calls the storage law exactly once (config()\'s return)');
const mRed = plantMounts(MC.load('src/mounts.js', mSrc.replace('return writeOnly(out, m);', 'return out;'), 'no-law').MountManager, 'mounts-no-law');
ok(mRed.leaks.length >= 10, `a mounts.js without it answers the planted bytes (${mRed.leaks.length} leaks) ⇒ ① red`);
const aSrc = read('src/server/channels-auth.js');
const NEEDLE = 'client = { appId: String(rec.credential.appId || \'\'), secretSet: !!rec.credential.appSecretEnc, undecryptable };';
ok(aSrc.split(NEEDLE).length === 2, 'channels-auth.js answers the custom client as {appId, secretSet, undecryptable} exactly once');
const authMut = MC.write('src/server/channels-auth.js', aSrc.replace(NEEDLE, "client = { appId: String(rec.credential.appId || ''), appSecret: box.dec(rec.credential.appSecretEnc), undecryptable };"), 'no-law');
const engMut = MC.write('src/server/channels-engine.js', read('src/server/channels-engine.js').replace("require('./channels-auth.js')", `require(${JSON.stringify(authMut)})`), 'no-law');
const cRed = await plantChannels(engMut, 'channels-no-law');
ok(cRed.leaks.length >= vendorRows.length, `a channels-auth.js answering the secret is caught (${cRed.leaks.length} leaks) ⇒ ④ red`, cRed.errors.join(' ; '));
const iSrc = read('src/server/integration-store.js');
const MASK_LINE = 'if (f.secret) masked[f.key] = set[f.key] ? R.maskValue(v) : null;';
ok(iSrc.split(MASK_LINE).length === 2, 'integration-store.js masks a card\'s secret through R.maskValue exactly once (publicView)');
const StoreMut = MC.load('src/server/integration-store.js', iSrc.replace(MASK_LINE, 'if (f.secret) masked[f.key] = set[f.key] ? String(v) : null;'), 'no-law');
const redStore = StoreMut.create({ dataDir: path.join(ROOT, 'istore-no-law'), env: { VIBESPACE_INTEGRATIONS: JSON.stringify(entries) }, log: quiet });
const redText = JSON.stringify(secretRows.map((row) => { try { return redStore.publicView(row.id); } catch (e) { return e.message; } }));
const redI = secretRows.flatMap((row) => row.fields.filter((f) => f.secret).map((f) => iPlant(row, f))).filter((p) => windows(p).some((w) => redText.includes(w)));
ok(redI.length >= 8, `an integration store answering a secret whole is caught (${redI.length} leaks) ⇒ ③ red`);
const eSrc = read('src/server/channels-engine.js');
const VIEW_LINE = "return { appId: String(rec.credential.appId || ''), secretSet: !!rec.credential.appSecretEnc, undecryptable };";
ok(eSrc.split(VIEW_LINE).length === 2, 'channels-engine.js answers an account\'s own client as {appId, secretSet, undecryptable} exactly once (customClientView)');
const engTail = MC.write('src/server/channels-engine.js', eSrc.replace(VIEW_LINE, "return { appId: String(rec.credential.appId || ''), secretSet: !!rec.credential.appSecretEnc, secretMasked: R.maskValue(box.dec(rec.credential.appSecretEnc)), undecryptable };"), 'tail');
const tRed = await plantChannels(engTail, 'channels-tail');
ok(tRed.leaks.length >= vendorRows.length, `a channels-engine.js whose account view carries the mask tail is caught (${tRed.leaks.length} leaks) ⇒ ④ red on a TAIL`, tRed.errors.join(' ; '));
for (const row of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 5 })) ok(row.pass, row.name, row.detail);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

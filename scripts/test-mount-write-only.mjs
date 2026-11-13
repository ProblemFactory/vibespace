#!/usr/bin/env node
// THE WRITE-ONLY LAW — a storage record's secret bytes never reach the page (lane ui-controls-and-bugs; 主开发's ruling
// 2026-11-13). The UI walk found the storage Edit dialog showing a Google Drive record's OAuth token in an edit box; the
// dialog is fed by GET /api/mounts/:id/config, so the defect was the ROUTE (it answered the record decrypted). The law: a
// secret is what the record SEALS (every `<cell>Enc`; a raw rclone parameter by its name, MountManager.SECRET_PARAM);
// config() — the route's one answer, for the owner's cookie too, inside the vault's reveal window and out — names the
// secrets a record HOLDS in `held` and never sends one; the Edit dialog draws «已保存» + «替换…» / the OAuth sign-in line.
// Fast tier, in-process, no server. Every leg is derived from the tree, so the next cell / row / route / field is red:
// ① EVERY sealed cell the tree knows (every `<k>Enc` named in src/mounts.js + src/mount-providers/*.js), planted with its own
//    bytes into a record of EVERY registry row (+ a child): no planted byte in any answer, masked or not; `held` names each
//    cell the row's config hook would have answered
// ② THE PARAMETER RULE: a raw rclone record's secret-named parameters (token, client_secret, pass, secret_access_key, …) are
//    held and blank; its other parameters (team_drive, access_key_id, key_file, …) keep their value
// ③ THE ROUTES: `mounts.config(` has ONE caller (the Edit dialog's route); the server-only readers of the same bytes
//    (`oauthTokenOf` / `oauthClientOf`) only at the named sites
// ④ THE PAGE: the Edit dialog runs every field through heldFields() before it draws, draws its html, wires «替换…», its
//    submit skips a field with no box; SECRET_FIELD names every sealed cell of ①; no line reads cfg.<a secret cell>
// ⑤ CONTROL: a copy of src/mounts.js with the law's one call removed answers the planted bytes ⇒ ① red
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
const ROOT = scratch('mount-write-only');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const PROV = require(path.join(REPO, 'src/mount-providers/index.js'));
const MC = mutantCopies('mount-write-only', REPO);

// every sealed CELL the tree names (a bag — params / extraParams — is planted below by parameter name)
const PROVIDER_FILES = fs.readdirSync(path.join(REPO, 'src/mount-providers')).filter((f) => f.endsWith('.js')).map((f) => `src/mount-providers/${f}`);
const CELLS = [...new Set(['src/mounts.js', ...PROVIDER_FILES].flatMap((f) => [...read(f).matchAll(/\b([a-z][A-Za-z]*)Enc\b/g)].map((m) => m[1])))]
  .filter((c) => c !== 'params' && c !== 'extraParams').sort();
const plantOf = (c) => `wo-${c}-7f3a`;   // planted bytes: unique per cell, none a real credential's shape
const PARAMS = { token: 'wo-p-tok-7f3a', client_secret: 'wo-p-cs-7f3a', pass: 'wo-p-pw-7f3a', secret_access_key: 'wo-p-sak-7f3a', service_account_credentials: 'wo-p-sac-7f3a',
  team_drive: 'kept-team-drive', access_key_id: 'kept-akid', key_file: '/kept/key/file' };
const SECRET_P = Object.keys(PARAMS).filter((p) => MountManager.SECRET_PARAM(p)), PLAIN_P = Object.keys(PARAMS).filter((p) => !MountManager.SECRET_PARAM(p));
const decOf = (id) => { let s = ''; try { s = read(`src/mount-providers/${id}.js`); } catch {} return [...s.matchAll(/(\w+):\s*(?:this\.)?_?dec\(m\.(\w+)Enc\)/g)].map((m) => m[1]); };

/** Plant every cell + bag into a record of each row (and a child) in a fresh manager of class MM; answer what config() carried. */
function plantRun(MM, tag) {
  const dir = path.join(ROOT, tag);
  fs.mkdirSync(dir, { recursive: true });
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
    for (const [rid, label] of [[id, r.id], [kid, r.id + ' (child)']]) {
      for (const masked of [false, true]) {
        let a;
        try { a = mm.config(rid, { masked }); } catch (e) { out.errors.push(`${label}${masked ? ' masked' : ''}: ${e.message}`); continue; }
        out.answered++;
        const text = JSON.stringify(a);
        for (const v of secrets) if (text.includes(v)) out.leaks.push(`${label}${masked ? ' (outside the window)' : ' (inside the window)'} carried ${v}`);
        if (!masked && rid === id) { out.held[r.id] = a.held || []; out.params[r.id] = a.params || null; }
      }
    }
  });
  return out;
}

console.log('① EVERY SEALED CELL × EVERY ROW — no secret byte in the answer, inside the reveal window or out of it');
ok(CELLS.length >= 7 && ['token', 'clientSecret', 'secretKey', 'pass'].every((c) => CELLS.includes(c)), `the sealed cells are read from the tree (${CELLS.join(', ')})`);
const tree = plantRun(MountManager, 'tree');
ok(tree.answered >= PROV.rows.length * 4, `config() answered for every row and its child, masked and not (${tree.answered} answers over ${PROV.rows.length} rows)`, tree.errors.join(' ; '));
ok(tree.leaks.length === 0, `none of the ${CELLS.length} planted cells, the ${SECRET_P.length} secret parameters or the extra-parameter token reached an answer`, tree.leaks.slice(0, 6).join(' ; '));
for (const r of PROV.rows) {
  const cells = decOf(r.id);
  if (cells.length) ok(cells.every((c) => (tree.held[r.id] || []).includes(c)), `${r.id}: every cell its config hook decrypts (${cells.join(', ')}) is named in \`held\` — the dialog's «已保存» / «已授权» stand on it`, JSON.stringify(tree.held[r.id]));
}

console.log('② THE PARAMETER RULE — a raw rclone record seals every parameter; a secret one is held by its name, the rest stay readable');
const raw = PROV.rows.find((r) => r.rawRclone), rp = raw && tree.params[raw.id];
ok(!!rp && SECRET_P.length >= 4 && SECRET_P.every((p) => rp[p] === '' && (tree.held[raw.id] || []).includes('param:' + p)), `${raw && raw.id}: the secret parameters (${SECRET_P.join(', ')}) are blank and held (the key stays — its field)`, JSON.stringify(rp));
ok(!!rp && PLAIN_P.length >= 3 && PLAIN_P.every((p) => rp[p] === PARAMS[p]), `${raw && raw.id}: the others (${PLAIN_P.join(', ')}) keep their value inside the window`, JSON.stringify(rp));

console.log('③ THE ROUTES — one answers config(), the server-only readers are named');
const files = execFileSync('git', ['ls-files', 'src', 'server.js'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((f) => /\.(c|m)?js$/.test(f));
const sitesOf = (re) => files.filter((f) => f !== 'src/mounts.js' && re.test(read(f)));
const cfgSites = sitesOf(/\bmounts\.config\(/);
ok(cfgSites.length === 1 && cfgSites[0] === 'src/server/mounts-plugins-wiring.js' && (read(cfgSites[0]).match(/\bmounts\.config\(/g) || []).length === 1,
  'mounts.config( has ONE caller — GET /api/mounts/:id/config (the Edit dialog\'s route)', cfgSites.join(', '));
const SERVER_ONLY = { 'src/server/channel-api.js': 'the channel API\'s ONE fetch site (B-2198 D3) — the token goes to Google, never to a page',
  'src/server/channels-wiring.js': 'the channel account borrowing a storage mount\'s OAuth client (server-side consent)' };
const readers = sitesOf(/\.oauth(Token|Client)Of\b/);
ok(readers.length > 0 && readers.every((f) => SERVER_ONLY[f]), `the server-only readers of the same bytes are only the named sites (${readers.join(', ')})`, readers.filter((f) => !SERVER_ONLY[f]).join(', '));

console.log('④ THE PAGE — the Edit dialog draws a secret as «已保存» + «替换…» (the token: the sign-in line), never its value');
const SM = read('src/lib/sidebar-mounts.js');
const meth = SM.slice(SM.indexOf('    async _showEditMountDialog(m) {'), SM.indexOf('    _showMintShareDialog('));
ok(meth.length > 1000 && /maskVaultFields\(fields, cfg\);[^\n]*\n\s*heldFields\(fields, cfg,/.test(meth), 'the dialog runs every field through heldFields() right after the vault mask, before it draws');
ok(/if \(opts\?\.html\) return opts\.html;/.test(meth) && /wireHeld\(form\)/.test(meth), 'the drawing takes the helper\'s html, and «替换…» is wired');
ok(/const box = form\.querySelector\(`\[name="\$\{k\}"\]`\);\s*\n\s*if \(!box\) continue;/.test(meth), 'the submit skips a field with no box (the token\'s sign-in line sends nothing)');
const hf = SM.slice(SM.indexOf('const SECRET_FIELD = '), SM.indexOf('function wireHeld('));
const sets = [...hf.matchAll(/f\[3\]\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
ok(hf.length > 400 && sets.length >= 2 && sets.every((v) => v === "''") && /tr\('Authorized · \{provider\}'/.test(hf) && /tr\('Saved'\)/.test(hf) && /tr\('Replace…'\)/.test(hf),
  'heldFields never prefills a secret (f[3] only ever \'\'), says «已保存» + «替换…», and the token becomes the «已授权 · …» line');
const cellRe = (hf.match(/const SECRET_FIELD = \(k\) => \/(\^\([^)]*\)\$)\//) || [])[1];
const FIELD = cellRe ? new RegExp(cellRe) : null;
ok(!!FIELD && CELLS.every((c) => FIELD.test(c)), `SECRET_FIELD names every sealed cell of ① (missing: ${CELLS.filter((c) => !FIELD || !FIELD.test(c)).join(', ') || 'none'})`);
const reads = CELLS.filter((c) => new RegExp(`\\bcfg\\.${c}\\b`).test(SM));
ok(reads.length === 0, 'no line of src/lib/sidebar-mounts.js reads cfg.<a secret cell>', reads.join(', '));

console.log('⑤ CONTROL — the law\'s one call removed');
const mSrc = read('src/mounts.js');
ok((mSrc.match(/return writeOnly\(out, m\);/g) || []).length === 1, 'src/mounts.js calls the law exactly once (config()\'s return)');
const NoLaw = MC.load('src/mounts.js', mSrc.replace('return writeOnly(out, m);', 'return out;'), 'no-law').MountManager;
const red = plantRun(NoLaw, 'no-law');
ok(red.leaks.length >= 10, `the copy without it answers the planted bytes (${red.leaks.length} leaks) ⇒ ① would be red`, red.leaks.slice(0, 3).join(' ; '));
for (const row of copiesCensus(MC.files, MC.dir, REPO, { minCopies: 1 })) ok(row.pass, row.name, row.detail);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

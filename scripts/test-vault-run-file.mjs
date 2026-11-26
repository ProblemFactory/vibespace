#!/usr/bin/env node
// test-vault-run-file — THE VAULT's FILE KIND in `vibespace-vault run` (lane lg-vault-file, B-0830): its own legs, moved WORD FOR WORD
// out of the one test-vault-run they were written in (主开发 r5138 / r5251), into a FOURTH suite over the ONE world
// scripts/vault-run-world.mjs that the B-54a9 split's three suites share (placed in test-vault-run-seal and -grants they took both past
// THE TIER RULE's 10 s: seal 15.1 s / 12.2 s, grants 11.2 s / 13.1 s alone). Fast tier, in-process.
//   ⑦ (its round-3 red) MUTANT «caller_gone burned whatever happened»: the round-2 door gives a once-grant back after its child RAN
//   ⑩ (round 3) a once-grant whose child RAN, then its caller went away ⇒ caller_gone `killed`, the grant SPENT (ended «used»)
//   ⑳ A FILE ENTRY — a run gets it as a 0600 file named for it, masked whole and line by line, never as text; the one scrubber;
//      «as it is» set by the file road alone; the file figure (24 KB) and its refusal by name
//   ㉑ THE CURE OF LINE 1043 — the checks after the read, the figure on the sum, no facts before the use, the give-back on the codes
import crypto from 'node:crypto';   // the bound's ㉑ leg (主开发 r4774 A) builds a text value at run time (test-vault-run imports it at the top too)
import fs from 'node:fs';
import path from 'node:path';
import { anchored } from './scratch.mjs';   // FIRST after node's own (§113)
import { require, REPO, R, pass, fail, ok, sleep, DOOR, VR, M, NODE, PRINTER, BIN, GHBIN, FILESHOW, ROWS, world, cardsOf, runAnswered, openRow, leaks, runDirs, onceGoneLeg } from './vault-run-world.mjs';   // THE ONE WORLD (imported, never copied)

console.log('⑦ (moved, round 3) MUTANT «caller_gone burned whatever happened» — the once-gone leg on the round-2 door');
{
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const mutate = (from, to, tag) => { const n = SRC.split(from).length - 1; return { n, mod: M.load('src/server/vault-run-door.js', anchored(SRC, from, to, `test-vault-run ⑦ ${tag}`), tag) }; }; // B-0d3e: a moved anchor fails BY NAME (it built nothing in silence)
  // ROUND 3 of the U1a cure (its second read, BLOCKER): a caller_gone whose child RAN, burned like one where nothing ran, gives the
  // owner's «Allow once» back — card-free for 8 hours to an agent that kills its own CLI after the work
  const m7 = mutate('BURNED.has(r.code) && !r.killed;', 'BURNED.has(r.code);', 'gonekilled');   // stale-pins: kept (the replacement IS the round-2 door)
  let r7 = null;
  if (m7.mod) r7 = await onceGoneLeg(await world({ doorMod: m7.mod }));
  ok(m7.n === 1 && r7 && r7.ran && r7.code === 'caller_gone' && r7.grants === 1, 'MUTANT «caller_gone burned whatever happened» (the round-2 cure): the patch hits once and the leg goes RED — the once-grant CAME BACK after its child ran; the shipped door ends it as used', r7);
}

console.log('⑩ (moved, round 3) a once-grant whose child RAN and whose caller then went away is SPENT');
{
  const w = await world();
  // ROUND 3 of the U1a cure (its second read, BLOCKER): a once-grant whose child RAN and whose caller then went away is SPENT — the run
  // answers caller_gone `killed`, the grant ends «used» (the round-2 cure had put it back: card-free for 8 hours to an agent that kills
  // its own CLI after the work); its red control is ⑦'s «caller_gone burned whatever happened»
  const og = await onceGoneLeg(w);
  console.log(`    judged (the grant's record): ended by ${JSON.stringify(og.endedBy)} · ${og.grants} grant(s) left · ${og.code}${og.killed ? ' killed' : ''}`);   // r111 (b): what the leg read from the record, green or red
  ok(og.granted && og.ran && og.code === 'caller_gone' && og.killed && og.grants === 0 && og.endedBy === 'used',
    'round 3 (BLOCKER): a once-grant whose child RAN, then its caller went away ⇒ caller_gone `killed`, the grant SPENT (ended «used») — never given back', og);
}

console.log('⑳ A FILE ENTRY (lane lg-vault-file, B-0830): a run gets it as a 0600 file named for it, masked whole and line by line — never as text');
{
  const w = await world();
  const crypto = require('node:crypto');
  const b64 = (n) => crypto.randomBytes(n).toString('base64');
  const KEY = Buffer.from(['apiVersion: v1', 'kind: Config', `client-key-data: ${b64(45)}`, `  token: ${crypto.randomBytes(24).toString('hex')}`, ...Array.from({ length: 6 }, () => b64(48)), ''].join('\n'));
  const LONG = KEY.toString().split('\n').map((l) => l.trim()).filter((l) => Buffer.byteLength(l) >= 16);
  const put = (await w.vault.agentFilePut('agent:conv-1/deploy-key', KEY, { filename: 'id_ed25519', actor: 'Lane X' }));
  ROWS.secrets.push({ entry: 'agent:conv-1/deploy-key', field: 'secret', label: 'Agent secret · deploy-key', bytes: KEY.length, provenance: { by: 'agent', prov: 'stored', sawPlaintext: true, actor: 'Lane X' } });
  ok(put.ok && put.ref === 'vault://agent:conv-1/deploy-key', 'an agent puts a FILE of its own (put --file)', put);
  const { r, card } = await runAnswered(w, ['--file', 'K=vault://agent:conv-1/deploy-key', '--', NODE, FILESHOW, '$VAULT_FILE{K}']);
  const out = (r.stdout || '') + (r.stderr || '');
  const head = /FILE (\d+) (\S+) (\d+)/.exec(out);
  ok(r.ok && !card && head && head[1] === '600' && /^f\d+-id_ed25519$/.test(head[2]) && Number(head[3]) === KEY.length && /DONE fileshow/.test(out),
    'its own file runs with no card: the program reads a 0600 file named f<slot>-<its name> (a tool that wants its extension gets it) holding the very bytes', { code: r.code, head: head && head.slice(1) });
  const lk = [...LONG.flatMap((l) => leaks(out, l)), ...leaks(out, KEY.toString())];
  const ph = (out.match(/\[vault:agent:conv-1\/deploy-key\]/g) || []).length;
  ok(lk.length === 0 && ph >= 4 + LONG.length, `cat, base64 at 76 columns, xxd -p at 60, upper hex and every long line by itself ⇒ 0 bytes reach the agent (${ph} placeholders)`, { lk, ph });
  ok(runDirs(w).length === 0, 'the run folder is shredded with the file in it');
  // a FILE rides a run as a file only: an env value, stdin, a template's $VAULT{…} are refused BY NAME before any card
  fs.writeFileSync(path.join(w.work, 'tmpl-file.txt'), 'key=$VAULT{agent:conv-1/deploy-key}\n');
  const bad = [];
  for (const args of [['--env', 'T=vault://agent:conv-1/deploy-key', '--', NODE, PRINTER, 'env'], ['--stdin', 'vault://agent:conv-1/deploy-key', '--', NODE, PRINTER, 'stdin'], ['--file', 'CFG=@tmpl-file.txt', '--', NODE, PRINTER, 'template', '$VAULT_FILE{CFG}']]) bad.push(await w.door.run({ caller: w.caller, args, cwd: w.work }));
  ok(bad.every((x) => x.code === 'file_needs_file' && /a 0600 file only/.test(x.words) && x.words.includes("--file KEY=vault://agent:conv-1/deploy-key -- <command> … '$VAULT_FILE{KEY}'") && x.ref === 'vault://agent:conv-1/deploy-key') && !cardsOf(w).length && runDirs(w).length === 0,
    'a file entry as --env, --stdin or inside a template ⇒ file_needs_file BY NAME — the reference named and the EXACT flag to use instead (--file KEY=<it> … $VAULT_FILE{KEY}), no card, nothing ran', bad.map((x) => [x.code, x.words]));
  // THE CURE (the acceptance read): a sealed file that cannot be opened reaches the agent BY ITS OWN NAME, with its door — it was
  // «entry_unknown» (the engine's code kept only in the audit's why)
  {
    const fid = w.vault.fileOf('agent:conv-1/deploy-key').id, vf = path.join(w.dataDir, 'vault-files', `${fid}.vfile`), keep = fs.readFileSync(vf);
    fs.rmSync(vf);
    const miss = await w.door.run({ caller: w.caller, args: ['--file', 'K=vault://agent:conv-1/deploy-key', '--', NODE, FILESHOW, '$VAULT_FILE{K}'], cwd: w.work });
    fs.writeFileSync(vf, keep, { mode: 0o600 });
    ok(!miss.ok && miss.code === 'file_missing' && /restore data\/vault-files from the same backup as data\/vault\.json/.test(miss.words || '') && miss.ref === 'vault://agent:conv-1/deploy-key' && runDirs(w).length === 0,   // stale-pins: kept (it reads the run's ANSWER words at runtime — VF.WORDS — not a file's text)
      'a sealed file gone from the disk ⇒ the run is refused file_missing BY NAME, its door said (restore data/vault-files …) — never «entry_unknown»; nothing ran', { code: miss.code, words: miss.words });
  }
  // ROUND 3 (the cure's second read): a sealed file's read that HANGS (a network mount) never keeps the run's slot — the read is raced
  // against a bound (fileReadMs: 30 s, here 60 ms) ⇒ file_unreadable, and against the caller's signal ⇒ caller_gone; nothing ran
  {
    const keepOpen = w.vault.fileOpen;
    let opens = 0;
    w.vault.fileOpen = () => { opens++; return new Promise(() => {}); };   // the mount never answers (each read counted: the abort below waits for its run's own)
    const dh = w.mk(DOOR, { fileReadMs: 60 });
    const args = ['--file', 'K=vault://agent:conv-1/deploy-key', '--', NODE, FILESHOW, '$VAULT_FILE{K}'];
    const hung = await Promise.all(Array.from({ length: 5 }, () => dh.run({ caller: w.caller, args, cwd: w.work })));
    const ac = new AbortController(), o0 = opens;
    const pg = dh.run({ caller: w.caller, args, cwd: w.work, signal: ac.signal });
    for (let n = 0; n < 400 && opens === o0; n++) await sleep(5);   // the abort waits for the run's OWN read to start — never a fixed sleep
    const reading = opens > o0; ac.abort();
    const gone = await pg;
    w.vault.fileOpen = keepOpen;
    const after = await dh.run({ caller: w.caller, args, cwd: w.work });
    const codes = hung.map((r) => r.code).sort();
    ok(codes.join() === 'file_unreadable,file_unreadable,file_unreadable,file_unreadable,too_many_runs' && reading && gone.code === 'caller_gone' && !gone.killed && after.ok && runDirs(w).length === 0,
      'round 3: a sealed file whose read HANGS ⇒ file_unreadable after the bound (the four slots it held counted — a fifth run too_many_runs — and given back: the next run runs); a caller gone while it read ⇒ caller_gone at once, nothing ran', { codes, reading, gone: gone.code, after: after.code });
  }
  // ROUND 4 (the third read: the cure-read-2 MINOR-2 cure had no leg): a LOCK the file's read meets names the run in the lock's
  // blocked list (as every other lock refusal of the door does), and the run answers vault_locked — nothing ran (a fresh world: the
  // read here locks the vault for real, then answers as a locked engine does)
  {
    const wl = await world();
    ok((await wl.vault.agentFilePut('agent:conv-1/deploy-key', KEY, { filename: 'id_ed25519', actor: 'Lane X' })).ok, 'a file to read (a fresh world)');
    const keepOpen = wl.vault.fileOpen;
    wl.vault.fileOpen = async () => { wl.vault.lock('agent'); return { ok: false, code: 'key-unreadable:vault_locked' }; };
    const rl = await wl.door.run({ caller: wl.caller, args: ['--file', 'K=vault://agent:conv-1/deploy-key', '--', NODE, FILESHOW, '$VAULT_FILE{K}'], cwd: wl.work });
    wl.vault.fileOpen = keepOpen;
    const bs = wl.vault.blockedSummary();
    console.log(`    judged (the lock's blocked list): ${JSON.stringify((bs.actors || []).map((x) => x.verbs))}`);   // r111 (b): what the leg read, green or red
    ok(rl.code === 'vault_locked' && !rl.killed && runDirs(wl).length === 0 && (bs.actors || []).some((x) => (x.verbs || []).includes('vibespace-vault run')),
      'round 4: a lock the file\'s read met ⇒ vault_locked (nothing ran) and the run is NAMED in the lock\'s blocked list', { code: rl.code, actors: (bs.actors || []).map((x) => x.verbs) });
    wl.door.closeAll && wl.door.closeAll();
  }
  // THE OWNER'S FILE (`keyfile:<id>`, vault://secrets/keyfile:<id>/file): closed until the owner opens it, then used as a file
  const KEY2 = Buffer.from([`server: https://cluster.example.test`, `certificate-authority-data: ${b64(60)}`, `client-key-data: ${b64(60)}`, ''].join('\n'));
  ok((await w.vault.filePut('keyfile:0a0b0c0d0e', KEY2, { filename: 'kubeconfig.yaml', prov: 'uploaded', label: 'Cluster' })).ok, 'the owner\'s file is sealed (filePut — the Vault window\'s door, U1b)');
  ROWS.secrets.push({ entry: 'keyfile:0a0b0c0d0e', field: 'file', label: 'Cluster', bytes: KEY2.length });
  const REF2 = 'vault://secrets/keyfile:0a0b0c0d0e/file';
  const closed = await w.door.run({ caller: w.caller, args: ['--file', 'K=' + REF2, '--', NODE, FILESHOW, '$VAULT_FILE{K}'], cwd: w.work });
  ok(closed.code === 'entry_not_runnable' && closed.ref === REF2 && !cardsOf(w).length, 'the owner\'s file is a RUNNABLE kind (never «its own door»), closed until the owner opens it — entry_not_runnable by name', closed.code);
  ok(DOOR.classOf(VR.parseRef(REF2)).cls === 'file' && DOOR.classOf(VR.parseRef(REF2)).runnable === true && VR.ownDoorOf(VR.parseRef(REF2)) === null && VR.ownDoorOf(VR.parseRef('vault://secrets/keyfile:0a0b0c0d0e/secret')) !== null,
    'classOf says file / runnable; ownDoorOf opens only the `file` field of a keyfile entry');
  openRow(w, 'secrets:keyfile:0a0b0c0d0e#file');
  const o = await runAnswered(w, ['--file', 'K=' + REF2, '--', NODE, FILESHOW, '$VAULT_FILE{K}']);
  const out2 = (o.r.stdout || '') + (o.r.stderr || '');
  const h2 = /FILE (\d+) (\S+) (\d+)/.exec(out2);
  const lk2 = [...KEY2.toString().split('\n').filter((l) => l.length >= 16).flatMap((l) => leaks(out2, l)), ...leaks(out2, KEY2.toString())];
  ok(o.r.ok && !!o.card && h2 && h2[1] === '600' && /^f\d+-kubeconfig\.yaml$/.test(h2[2]) && lk2.length === 0 && /\[vault:secrets\/keyfile:0a0b0c0d0e\/file\]/.test(out2),
    'opened (and allowed once on its card), the owner\'s file runs as f<slot>-kubeconfig.yaml, 0600, and its output carries none of it', { code: o.r.code, lk2 });
  // adversarial read r1: a short TOKEN file printed the way $(cat "$VAULT_FILE{K}") hands it on — its newline dropped, one line under 16 bytes
  ok((await w.vault.agentFilePut('agent:conv-1/licence-token', Buffer.from('TK-7f3a-91bc-x2\n'), { filename: 'token.txt', actor: 'Lane X' })).ok, 'a 16-byte token file (15 characters + its newline)');
  ROWS.secrets.push({ entry: 'agent:conv-1/licence-token', field: 'secret', label: 'Agent secret · licence-token', bytes: 16, provenance: { by: 'agent', prov: 'stored', sawPlaintext: true, actor: 'Lane X' } });
  const tk = await runAnswered(w, ['--file', 'K=vault://agent:conv-1/licence-token', '--', NODE, FILESHOW, '$VAULT_FILE{K}', 'trim']);
  const tkOut = (tk.r.stdout || '') + (tk.r.stderr || '');
  ok(tk.r.ok && /X-Key: \[vault:agent:conv-1\/licence-token\]/.test(tkOut) && !tkOut.includes('TK-7f3a-91bc-x2') && leaks(tkOut, 'TK-7f3a-91bc-x2').length === 0, 'its trimmed whole is masked in every spelling — the token never reaches the agent', tkOut.slice(0, 200));
  // ROUND 2 of the cure (its read, BLOCKER 3): a ONE-LINE token file of 16 bytes or more — lines are spelled as themselves only now, so
  // its trimmed whole carries every formsOf spelling: a Basic header built from it (curl -u) and its bare base64 (kubectl -o yaml) are masked
  const GHP = ['ghp', '_' + crypto.randomBytes(18).toString('hex')].join('');   // built at runtime — never a token-shaped literal
  ok((await w.vault.agentFilePut('agent:conv-1/gh-token', Buffer.from(GHP + '\n'), { filename: 'gh.token', actor: 'Lane X' })).ok, 'a one-line token file (41 bytes)');
  ROWS.secrets.push({ entry: 'agent:conv-1/gh-token', field: 'secret', label: 'Agent secret · gh-token', bytes: GHP.length + 1, provenance: { by: 'agent', prov: 'stored', sawPlaintext: true, actor: 'Lane X' } });
  const gb = await runAnswered(w, ['--file', 'K=vault://agent:conv-1/gh-token', '--', NODE, FILESHOW, '$VAULT_FILE{K}', 'basic']);
  const gbOut = (gb.r.stdout || '') + (gb.r.stderr || '');
  ok(gb.r.ok && /DONE fileshow/.test(gbOut) && !gbOut.includes(Buffer.from(GHP).toString('base64').slice(4, 36)) && leaks(gbOut, GHP).length === 0,
    'a one-line token file\'s Basic header and its bare base64 are masked (its trimmed whole spelled every way — the round-2 read leaked both)', gbOut.slice(0, 240));
  // 主开发 r4378 — THE CURE's NEW SHAPE: ONE SCRUBBER. A file's pieces are spelled in the run's scan WORKER, never on the hub's loop:
  // the run door hands the file's BYTES with the run's values (scrub.give, once) and holds no piece of its mask; the worker turns
  // them into values (src/vault-file.js runValuesOf) for its one createRunMasker. THE 11-18 MUST 1 («a file's mask on the hub's
  // loop») is this leg's red control: a door that spells a file's pieces itself (the shape of the 11-18 door) is RED.
  const VF = R('src/vault-file.js');
  const VALUE20 = 'mv' + crypto.randomBytes(12).toString('hex');   // made up: a text value
  const DSRC20 = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8'), WSRC20 = fs.readFileSync(path.join(REPO, 'src/server/vault-run-scrub-worker.js'), 'utf8');
  const code20 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');   // comments out: the prose names the functions
  const spellsOnLoop = (t) => /\b(?:maskSetOf|runValuesOf|maskFormsOf|compileFormsStepped|stepMasker|compileForms|formsOf)\(/.test(code20(t));
  const workerSpells = (t) => /for \(const p of VF\(\)\.runValuesOf\(s\.file\)\)/.test(t) && /createRunMasker\(valuesOf\(msg\.secrets\)/.test(t) && /s\.file\.fill\(0\)/.test(t);
  const oldDoor20 = anchored(DSRC20, '    scrub.give(secrets);', '    const spelled = secrets.flatMap((s) => (s.file ? VF.runValuesOf(s.file) : [])); scrub.give(secrets);', 'test-vault-run ⑳ a door that spells a file on the loop');
  ok(!spellsOnLoop(DSRC20) && workerSpells(WSRC20) && spellsOnLoop(oldDoor20) && /\{ ref: r, file: v \}/.test(DSRC20),
    'MUST 1 (11-18): nothing of a file\'s mask is built on the hub\'s loop — the run door hands the file\'s bytes ({ref, file}) to the run\'s worker, which spells its pieces (runValuesOf) for its one createRunMasker and zeroes its copy; red control: a door that spells the pieces itself', { door: spellsOnLoop(DSRC20), worker: workerSpells(WSRC20) });
  // 主开发 r4413 (B), LAW 1 — ONLY THE FILE ROAD SETS «AS IT IS»: a value may enter the scrubber's compile as its own text alone
  // (`asIs`) — a file's encoded pieces and its lines take it (src/vault-file.js runValuesOf); a TEXT value never does. The census
  // reads every src file's CODE (comments out) for `asIs`: the scrubber READS it once, runValuesOf SETS it, the run's worker passes a
  // file's flag on and builds a text value from its own two fields; red control: a planted second caller (the run door setting it)
  const VS20 = R('src/vault-scrubber.js');
  const srcFiles20 = (dir) => fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? srcFiles20(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []));
  const asIsUses = (over = {}) => { const out = {}; for (const f of srcFiles20('src')) { const t = code20(over[f] != null ? over[f] : fs.readFileSync(path.join(REPO, f), 'utf8')); const n = (t.match(/\basIs\b/g) || []).length; if (n) out[f] = n; } return out; };
  const uses20 = asIsUses();
  const lawful20 = (u) => Object.keys(u).sort().join() === ['src/server/vault-run-scrub-worker.js', 'src/vault-file.js', 'src/vault-scrubber.js'].join()
    && /s\.asIs === true \? \[\{ form: 'raw', text: v \}\] : formsOf\(v\)/.test(fs.readFileSync(path.join(REPO, 'src/vault-scrubber.js'), 'utf8')) && u['src/vault-scrubber.js'] === 1
    && /const \{ asIs: _never, \.\.\.text \} = s; out\.push\(text\);/.test(WSRC20) && /asIs: p\.asIs === true/.test(WSRC20);
  const second20 = asIsUses({ 'src/server/vault-run-door.js': DSRC20.replace("Buffer.isBuffer(v) ? { ref: r, file: v } : { ref: r, value: v }", "Buffer.isBuffer(v) ? { ref: r, file: v } : { ref: r, value: v, asIs: true }") });
  const one20 = VS20.compileForms([{ label: 'a', value: VALUE20, asIs: true }]).size, all20 = VS20.compileForms([{ label: 'a', value: VALUE20 }]).size;
  ok(lawful20(uses20) && !lawful20(second20) && one20 === 1 && all20 > 1,
    `LAW 1 (r4413): «as it is» is set by the file road alone — the scrubber reads it once, runValuesOf sets it, the worker passes a file's flag and drops the flag from every text value (${JSON.stringify(uses20)}); a value as it is is ONE form, spelled it is ${all20}; red control: a planted second caller (the door on a text value) is counted`, { uses20, second: Object.keys(second20) });
  // THE FILE FIGURE (主开发 r4378 (a)(b)(c)): a file past what a run can carry is KEPT, its facts say at once that a run cannot carry
  // it (the page's row and the upload door read `forRun`), and a run that names it is refused BY NAME before any card — the file,
  // its line count, the figure and what still works, in one breath
  const line64 = () => b64(48);   // 64 base64 characters: a certificate chain's line
  const OVERN = Math.ceil((VF.RUN_FILE_BYTES_MAX + 4096) / 65);
  const OVER = Buffer.from(Array.from({ length: OVERN }, line64).join('\n') + '\n');
  ok(OVER.length > VF.RUN_FILE_BYTES_MAX && (await w.vault.agentFilePut('agent:conv-1/over-file', OVER, { filename: 'chain.pem', actor: 'Lane X' })).ok, `a file past the run figure (${OVER.length} bytes > ${VF.RUN_FILE_BYTES_MAX}) is KEPT — the vault keeps files up to 1 MB`);
  ROWS.secrets.push({ entry: 'agent:conv-1/over-file', field: 'secret', label: 'Agent secret · over-file', bytes: OVER.length, provenance: { by: 'agent', prov: 'stored', sawPlaintext: true, actor: 'Lane X' } });
  const pubO = VF.publicFactsOf(w.vault.fileOf('agent:conv-1/over-file')), pubK = VF.publicFactsOf(w.vault.fileOf('agent:conv-1/deploy-key'));
  ok(pubO && pubO.lines === OVERN && pubO.forRun && pubO.forRun.fits === false && pubO.forRun.max === VF.RUN_FILE_BYTES_MAX && pubK && pubK.forRun && pubK.forRun.fits === true,
    'its public facts carry its line count and `forRun` — a run cannot carry it, the small key file it can: the page says it where the file appears', { over: pubO && { lines: pubO.lines, forRun: pubO.forRun }, key: pubK && pubK.forRun });
  const cards0 = cardsOf(w).length;
  const ARGS_OVER = ['--file', 'K=vault://agent:conv-1/over-file', '--', NODE, FILESHOW, '$VAULT_FILE{K}'];
  const ov = await w.door.run({ caller: w.caller, args: ARGS_OVER, cwd: w.work });
  console.log(`    judged (the refusal's words): ${JSON.stringify(ov.words)}`);
  ok(!ov.ok && ov.code === 'file_too_large_for_a_run' && DOOR.statusOf('file_too_large_for_a_run') === 413 && ov.file === 'chain.pem' && ov.lines === OVERN && ov.figure === VF.RUN_FILE_BYTES_MAX
    && (ov.words || '').includes('«chain.pem»') && (ov.words || '').includes(`${OVERN} lines`) && (ov.words || '').includes(`${Math.round(VF.RUN_FILE_BYTES_MAX / 1024)} KB`) && /download/.test(ov.words || '') && /ask the owner/.test(ov.words || '')
    && cardsOf(w).length === cards0 && runDirs(w).length === 0,
    'a run naming it ⇒ file_too_large_for_a_run (413) BY NAME before any card — the file, its line count and the figure named, the owner\'s download and an agent\'s ask said in the same breath; nothing ran', { code: ov.code, file: ov.file, lines: ov.lines, figure: ov.figure });
  const noFigure = M.load('src/server/vault-run-door.js', anchored(anchored(DSRC20, '    const tooLarge = fileTooLargeOf(spec, usableFile);', '    const tooLarge = null;', 'test-vault-run ⑳ a door without the figure (the verdict)'),
    '    const lateLarge = fileTooLargeOf(spec, (r) => Buffer.isBuffer(values.get(r.ref)), (r) => values.get(r.ref).length);', '    const lateLarge = null;', 'test-vault-run ⑳ a door without the figure (after the read)'), 'nofigure');
  const ovRed = await w.mk(noFigure).run({ caller: w.caller, args: ARGS_OVER, cwd: w.work });
  ok(ovRed.code !== 'file_too_large_for_a_run', `red control: «a door without the file figure» takes the run on (${ovRed.code || (ovRed.ok ? 'ran' : '?')})`, ovRed.code);
  // a file AT the figure runs, and none of it reaches the agent (cat, base64, xxd and line by line) — the scrubber's own forms
  const ATN = Math.floor((VF.RUN_FILE_BYTES_MAX - 64) / 65);
  const AT = Buffer.from(Array.from({ length: ATN }, line64).join('\n') + '\n');
  ok(AT.length <= VF.RUN_FILE_BYTES_MAX && (await w.vault.agentFilePut('agent:conv-1/at-file', AT, { filename: 'bundle.pem', actor: 'Lane X' })).ok, `a file at the figure (${AT.length} bytes) is kept`);
  ROWS.secrets.push({ entry: 'agent:conv-1/at-file', field: 'secret', label: 'Agent secret · at-file', bytes: AT.length, provenance: { by: 'agent', prov: 'stored', sawPlaintext: true, actor: 'Lane X' } });
  const at = await runAnswered(w, ['--file', 'K=vault://agent:conv-1/at-file', '--', NODE, FILESHOW, '$VAULT_FILE{K}']);
  const outAt = (at.r.stdout || '') + (at.r.stderr || '');
  const sampleAt = AT.toString().split('\n').filter((l, i) => l && i % 37 === 0);
  ok(at.r.ok && /DONE fileshow/.test(outAt) && sampleAt.every((l) => !outAt.includes(l)) && !outAt.includes(AT.toString('base64').slice(1000, 1100)),
    `a file at the figure (${ATN} lines) printed whole, wrapped and line by line ⇒ none of it reaches the agent — its pieces masked by the run's one scrubber in its worker`, { code: at.r.code });
}
// 主开发 r4625 (line 1043's cure, its GO r4628): the two checks ASKED AGAIN AFTER THE READ (a re-put PLACED in the window), the
// figure on the SUM, a file's facts told only to a caller shown to have its use, a TEXT value beside a FILE still masked in every
// spelling, the once-grant given back on each new BURNED code (and a lock's «lock»), a long text value as at the release
console.log('㉑ THE CURE OF LINE 1043 (主开发 r4625): the checks after the read, the figure on the sum, no facts before the use, the give-back on the new codes');
{
  const w = await world();
  const crypto = require('node:crypto');
  const VF = R('src/vault-file.js');
  const DSRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const line64 = () => crypto.randomBytes(48).toString('base64');
  const fileOf = (bytes) => Buffer.from(Array.from({ length: Math.max(1, Math.floor(bytes / 65)) }, line64).join('\n') + '\n');   // 64-character lines, about `bytes` long
  const row = (entry, bytes, label, field = 'secret', agent = true, v = undefined) => ROWS.secrets.push({ entry, field, label, bytes, ...(agent ? { provenance: { by: 'agent', prov: 'stored', sawPlaintext: true, actor: 'Lane X' } } : {}), ...(v != null ? { v } : {}) });   // a TEXT row's value is its `v` (the suite's sources answer the door's reads)
  const own = async (name, buf, filename) => { const r = await w.vault.agentFilePut(`agent:conv-1/${name}`, buf, { filename, actor: 'Lane X' }); row(`agent:conv-1/${name}`, buf.length, `Agent secret · ${name}`); return r; };
  const outOf = (r) => (r.stdout || '') + (r.stderr || '');
  // THE FIGURE ON THE SUM (law 5): two files of about 16 KiB each run alone; together they pass the figure
  const FA = fileOf(16 * 1024), FB = fileOf(16 * 1024);
  ok((await own('sum-a', FA, 'a.pem')).ok && (await own('sum-b', FB, 'b.pem')).ok && FA.length <= VF.RUN_FILE_BYTES_MAX && FB.length <= VF.RUN_FILE_BYTES_MAX && FA.length + FB.length > VF.RUN_FILE_BYTES_MAX,
    `two files of about 16 KiB (${FA.length} + ${FB.length} bytes; the figure ${VF.RUN_FILE_BYTES_MAX})`);
  const SUM1 = ['--file', 'A=vault://agent:conv-1/sum-a', '--', NODE, FILESHOW, '$VAULT_FILE{A}'];
  const SUM2 = ['--file', 'A=vault://agent:conv-1/sum-a', '--file', 'B=vault://agent:conv-1/sum-b', '--', NODE, FILESHOW, '$VAULT_FILE{A}'];
  const alone = await w.door.run({ caller: w.caller, args: SUM1, cwd: w.work });
  const both = await w.door.run({ caller: w.caller, args: SUM2, cwd: w.work });
  ok(alone.ok && !both.ok && both.code === 'file_too_large_for_a_run' && runDirs(w).length === 0, 'THE FIGURE ON THE SUM: each file alone runs; the two together pass it ⇒ file_too_large_for_a_run before any card, nothing ran', [alone.code || 'ran', both.code]);
  const perFile = M.load('src/server/vault-run-door.js', anchored(DSRC, 'total += size;', 'total = Math.max(total, size);', 'test-vault-run ㉑ the figure judged per file'), 'perfile');
  const bothRed = await w.mk(perFile).run({ caller: w.caller, args: SUM2, cwd: w.work });
  ok(bothRed.code !== 'file_too_large_for_a_run', `red control: «the figure judged per file» takes the two on (${bothRed.code || (bothRed.ok ? 'ran' : '?')})`, bothRed.code);
  // LAW 3: a TEXT value beside a FILE in one run — «as it is» turns off nothing of the text value: every spelling still masked
  const TXT = 'tb' + crypto.randomBytes(14).toString('hex');   // made up at run time
  row('agent:conv-1/beside-text', TXT.length, 'Agent secret · beside-text', 'secret', true, TXT);
  const bs = await w.door.run({ caller: w.caller, args: ['--env', 'T=vault://agent:conv-1/beside-text', '--file', 'K=vault://agent:conv-1/sum-a', '--', NODE, PRINTER, 'env'], cwd: w.work });
  const bsOut = outOf(bs), b0 = Buffer.from(TXT);
  ok(bs.ok && leaks(bsOut, TXT).length === 0 && !bsOut.includes(b0.toString('base64').replace(/=+$/, '')) && !bsOut.includes(b0.toString('hex').toUpperCase()) && !bsOut.includes(JSON.stringify(TXT)) && /\[vault:agent:conv-1\/beside-text\]/.test(bsOut),
    'a TEXT value beside a FILE in one run is still masked in every spelling the printer makes (base64, URL, JSON escape, hex …) — the file\'s «as it is» weakens no other value', { code: bs.code, leaks: leaks(bsOut, TXT) });
  // A LONG TEXT VALUE (r4625 (3): the unit's lower cap is taken out): 10 000 characters are stored, run and masked as at the release
  const LONGV = 'L' + crypto.randomBytes(7500).toString('base64').slice(0, 9999);
  row('agent:conv-1/long-text', LONGV.length, 'Agent secret · long-text', 'secret', true, LONGV);   // its put is test-vault-routes' leg (stored as at the release)
  const lr = await w.door.run({ caller: w.caller, args: ['--env', 'T=vault://agent:conv-1/long-text', '--', NODE, PRINTER, 'drip'], cwd: w.work });
  const lrOut = outOf(lr);
  ok(lr.ok && /\[vault:agent:conv-1\/long-text\]/.test(lrOut) && !lrOut.includes(LONGV.slice(4000, 4100)), 'it runs and is masked, as at the release', { code: lr.code });
  // A REFUSAL TELLS NOTHING OF A FILE THE CALLER MAY NOT USE (r4625 (4)): the owner's CLOSED file past the figure ⇒ the release's
  // own answer — no name, no lines, no size; red control: the figure asked before the use tells all three
  const BIG = fileOf(VF.RUN_FILE_BYTES_MAX + 4096);
  ok((await w.vault.filePut('keyfile:3a3b3c3d3e', BIG, { filename: 'owner-chain.pem', prov: 'uploaded', label: 'Owner chain' })).ok, 'the owner\'s file past the figure, CLOSED');
  row('keyfile:3a3b3c3d3e', BIG.length, 'Owner chain', 'file', false);
  const ARGSC = ['--file', 'K=vault://secrets/keyfile:3a3b3c3d3e/file', '--', NODE, FILESHOW, '$VAULT_FILE{K}'];
  const told = (x) => JSON.stringify(x || {}).includes('owner-chain.pem') || (x && (x.lines != null || x.size != null || x.file != null));
  const cl = await w.door.run({ caller: w.caller, args: ARGSC, cwd: w.work });
  ok(cl.code === 'entry_not_runnable' && !told(cl), 'the owner\'s CLOSED file past the figure ⇒ entry_not_runnable, the release\'s own answer — its name, lines and size are not told', cl);
  const before = M.load('src/server/vault-run-door.js', anchored(DSRC, '    const tooLarge = fileTooLargeOf(spec, usableFile);', '    const tooLarge = fileTooLargeOf(spec);', 'test-vault-run ㉑ the figure asked before the use'), 'beforeuse');
  const clRed = await w.mk(before).run({ caller: w.caller, args: ARGSC, cwd: w.work });
  ok(clRed.code === 'file_too_large_for_a_run' && told(clRed), `red control: «the figure asked before the use» tells the closed file's name, lines and size (${clRed.code})`, clRed.code);
  // THE CHECKS ASKED AGAIN AFTER THE READ (r4625 (1)), each with a re-put of the same name PLACED while the run waits on its card:
  // (a) a TEXT reference whose entry becomes a FILE ⇒ file_needs_file; (b) a file grown past the figure ⇒ file_too_large_for_a_run
  const flipText = 'ft' + crypto.randomBytes(14).toString('hex');
  row('secret:flip-token', flipText.length, 'Flip token', 'secret', false, flipText);   // an owner's free TEXT entry, opened for runs
  openRow(w, 'secrets:secret:flip-token#secret');
  const FLIP = fileOf(2048);
  const flipLeg = async (door) => {
    const p = await runAnswered(w, ['--env', 'T=vault://secrets/secret:flip-token/secret', '--', NODE, PRINTER, 'env'], { answer: null, door });
    if (!p.card) { await p.r; return { code: 'no card' }; }
    const put = await w.vault.filePut('secret:flip-token', FLIP, { filename: 'flip.pem', prov: 'uploaded', label: 'Flip token' });   // the same name, now a FILE in the vault
    door.answer(p.card.action.askId, { answer: 'once' });
    const r = await p.r;
    w.vault.secretDrop('secret:flip-token'); await w.vault.filesSettled();   // back as it was (a text entry)
    return { code: r.code, put: put.ok, out: outOf(r) };
  };
  const fl = await flipLeg(w.door);
  ok(fl.put && fl.code === 'file_needs_file' && runDirs(w).length === 0, '(a) a text reference whose entry was re-put as a FILE while the run waited on its card ⇒ file_needs_file after the read, nothing materialized', fl.code);
  const noLate = M.load('src/server/vault-run-door.js', anchored(DSRC, '    const late = fileMisuseOf(spec, (r) => Buffer.isBuffer(values.get(r.ref)));', '    const late = null;', 'test-vault-run ㉑ no misuse check after the read'), 'nolate');
  const flr = await flipLeg(w.mk(noLate));
  ok(flr.code !== 'file_needs_file' && flr.code !== 'no card' && flr.put, `red control: «no misuse check after the read» hands the file's bytes on as an environment value (${flr.code || 'ran'})`, flr.code);
  ok((await w.vault.filePut('keyfile:5a5b5c5d5e', fileOf(2048), { filename: 'grow.pem', prov: 'uploaded', label: 'Grow chain' })).ok, 'an owner\'s small file, opened for runs');
  row('keyfile:5a5b5c5d5e', 2048, 'Grow chain', 'file', false);
  openRow(w, 'secrets:keyfile:5a5b5c5d5e#file');
  const growLeg = async (door) => {
    const p = await runAnswered(w, ['--file', 'K=vault://secrets/keyfile:5a5b5c5d5e/file', '--', NODE, FILESHOW, '$VAULT_FILE{K}'], { answer: null, door });
    if (!p.card) { await p.r; return { code: 'no card' }; }
    const put = await w.vault.filePut('keyfile:5a5b5c5d5e', BIG, { filename: 'grow.pem', prov: 'uploaded', label: 'Grow chain' });   // re-put past the figure
    door.answer(p.card.action.askId, { answer: 'once' });
    const r = await p.r;
    await w.vault.filePut('keyfile:5a5b5c5d5e', fileOf(2048), { filename: 'grow.pem', prov: 'uploaded', label: 'Grow chain' });   // back as it was
    return { code: r.code, put: put.ok };
  };
  const gr = await growLeg(w.door);
  ok(gr.put && gr.code === 'file_too_large_for_a_run' && runDirs(w).length === 0, '(b) a file re-put past the figure while the run waited on its card ⇒ file_too_large_for_a_run after the read (the read bytes\' sum held against the figure)', gr.code);
  const noLateLarge = M.load('src/server/vault-run-door.js', anchored(DSRC, '    const lateLarge = fileTooLargeOf(spec, (r) => Buffer.isBuffer(values.get(r.ref)), (r) => values.get(r.ref).length);', '    const lateLarge = null;', 'test-vault-run ㉑ no figure after the read'), 'nolatelarge');
  const grr = await growLeg(w.mk(noLateLarge));
  ok(grr.code !== 'file_too_large_for_a_run' && grr.code !== 'no card' && grr.put, `red control: «no figure after the read» runs the grown file (${grr.code || 'ran'})`, grr.code);
  w.door.closeAll && w.door.closeAll();
  // LAW 8: THE ONCE-GRANT on each NEW code — given back when nothing ran (BURNED: file_missing, file_unreadable, caller_gone before
  // the spawn, file_too_large_for_a_run after the read), ended «lock» by a lock in the read (its own rule)
  const c8 = { ...w.caller, conversationId: 'conv-8', sessionKey: 'claude:conv-8', name: 'Lane Eight', scope: 'webui-8' };
  const SMALL = fileOf(2048), REFO = 'vault://secrets/keyfile:6a6b6c6d6e/file', ARGSO = ['--file', 'K=' + REFO, '--', NODE, FILESHOW, '$VAULT_FILE{K}'];
  row('keyfile:6a6b6c6d6e', SMALL.length, 'Service chain', 'file', false);
  const onceLeg = async (fault, doorOpts = null, { mod = DOOR, entries = [REFO] } = {}) => {
    const wo = await world();
    if (doorOpts || mod !== DOOR) wo.door = wo.mk(mod, doorOpts || {});
    const put = await wo.vault.filePut('keyfile:6a6b6c6d6e', SMALL, { filename: 'svc.pem', prov: 'uploaded', label: 'Service chain' });
    for (const entry of entries) { const q = wo.door.request({ caller: c8, entry, purpose: 'a run whose file read fails' }); wo.door.answerRequest(q.askId, { answer: 'once', reauthed: true, person: true }); }
    const keepOpen = wo.vault.fileOpen;
    let r;
    try { r = await fault(wo, keepOpen); } finally { wo.vault.fileOpen = keepOpen; }
    const back = [...wo.door._grants.values()].filter((g) => g.conv === c8.scope && g.once && !g.spent);
    const out = { put: put.ok, code: r.code, killed: !!r.killed, back: back.length, spent: back.some((g) => g.spent === true), ended: (wo.door.usesFor(c8).ended[0] || {}).endedBy || null, dirs: runDirs(wo).length };
    try { wo.door.closeAll && wo.door.closeAll(); } catch { }
    return out;
  };
  const run8 = async (wo, extra = {}, args = ARGSO) => {   // a card, if one is drawn, is answered «once» (the request's grant may or may not admit without one)
    let settled = false;
    const p = wo.door.run({ caller: c8, args, cwd: wo.work, ...extra }).then((r) => { settled = true; return r; });
    for (const t0 = Date.now(); !settled && Date.now() - t0 < 3000;) { const c = cardsOf(wo); if (c.length) { wo.door.answer(c[c.length - 1].action.askId, { answer: 'once' }); break; } await sleep(5); }
    return p;
  };
  const FAULTS = [
    ['file_missing', async (wo) => { fs.rmSync(path.join(wo.dataDir, 'vault-files', `${wo.vault.fileOf('keyfile:6a6b6c6d6e').id}.vfile`)); return run8(wo); }],
    ['file_unreadable', async (wo) => { wo.vault.fileOpen = () => new Promise(() => { }); return run8(wo); }, { fileReadMs: 60 }],
    ['caller_gone', async (wo) => { let opened = false; wo.vault.fileOpen = () => { opened = true; return new Promise(() => { }); }; const ac = new AbortController(); const p = run8(wo, { signal: ac.signal }); for (let n = 0; n < 400 && !opened; n++) await sleep(5); ac.abort(); return p; }],
    ['file_too_large_for_a_run', async (wo, keepOpen) => { wo.vault.fileOpen = async (name) => { wo.vault.fileOpen = keepOpen; await wo.vault.filePut('keyfile:6a6b6c6d6e', BIG, { filename: 'svc.pem', prov: 'uploaded', label: 'Service chain' }); return keepOpen(name); }; return run8(wo); }],
  ];
  // the round's should (r4676 page): file_needs_file AFTER the read, with once-grants — the spec reads --file before --stdin, so the
  // file's read re-puts the stdin's owner TEXT entry as a FILE under the same name; the stdin then carries a file's bytes
  const flip2 = 'f2' + crypto.randomBytes(14).toString('hex');
  row('secret:flip-two', flip2.length, 'Flip two', 'secret', false, flip2);
  const REFT = 'vault://secrets/secret:flip-two/secret', ARGSN = ['--file', 'K=' + REFO, '--stdin', REFT, '--', NODE, FILESHOW, '$VAULT_FILE{K}'];
  const needsFault = async (wo, keepOpen) => { wo.vault.fileOpen = async (name) => { wo.vault.fileOpen = keepOpen; await wo.vault.filePut('secret:flip-two', fileOf(2048), { filename: 'flip2.pem', prov: 'uploaded', label: 'Flip two' }); return keepOpen(name); }; return run8(wo, {}, ARGSN); };
  const gb = [];
  for (const [code, fault, opts] of FAULTS) { const x = await onceLeg(fault, opts || null); gb.push([code, x]); }
  { const x = await onceLeg(needsFault, null, { entries: [REFO, REFT] }); gb.push(['file_needs_file', { ...x, back: x.back === 2 ? 1 : x.back }]); }   // its two once-grants (the file's and the text's) both come back
  console.log(`    judged (the once-grant per code): ${JSON.stringify(gb.map(([c, x]) => [c, x.code, x.back, x.spent, x.ended]))}`);
  ok(gb.every(([c, x]) => x.put && x.code === c && !x.killed && x.back === 1 && !x.spent && x.dirs === 0), 'each new BURNED code, met with a ONCE-GRANT spent: nothing ran, and the once-grant is GIVEN BACK unspent (file_missing · file_unreadable · caller_gone before the spawn · file_too_large_for_a_run and file_needs_file after the read)', gb);
  const lk = await onceLeg(async (wo) => { wo.vault.fileOpen = async () => { wo.vault.lock('agent'); return { ok: false, code: 'key-unreadable:vault_locked' }; }; return run8(wo); });
  ok(lk.put && lk.code === 'vault_locked' && lk.back === 0 && lk.ended === 'lock' && lk.dirs === 0, 'a lock in the file\'s read: vault_locked, nothing ran — its once-grant ENDS «lock» (never «used», never given back across a lock)', lk);
  const keepBurned = M.load('src/server/vault-run-door.js', anchored(DSRC, ", 'file_needs_file', 'file_too_large_for_a_run']);", ", 'file_needs_file']);", 'test-vault-run ㉑ file_too_large_for_a_run not BURNED'), 'notburned');
  const noNeeds = M.load('src/server/vault-run-door.js', anchored(DSRC, ", 'file_needs_file', 'file_too_large_for_a_run']);", ", 'file_too_large_for_a_run']);", 'test-vault-run ㉑ file_needs_file not BURNED'), 'noneeds');
  const nn = await onceLeg(needsFault, null, { mod: noNeeds, entries: [REFO, REFT] });
  ok(nn.code === 'file_needs_file' && nn.back === 0, `red control: «file_needs_file not BURNED» ends both once-grants «used» for a run that never ran (${JSON.stringify(nn)})`, nn);
  const big8 = await (async () => { const wo = await world(); wo.door = wo.mk(keepBurned); await wo.vault.filePut('keyfile:6a6b6c6d6e', SMALL, { filename: 'svc.pem', prov: 'uploaded', label: 'Service chain' }); const q = wo.door.request({ caller: c8, entry: REFO, purpose: 'a run whose file grows' }); wo.door.answerRequest(q.askId, { answer: 'once', reauthed: true, person: true }); const keepOpen = wo.vault.fileOpen; wo.vault.fileOpen = async (name) => { wo.vault.fileOpen = keepOpen; await wo.vault.filePut('keyfile:6a6b6c6d6e', BIG, { filename: 'svc.pem', prov: 'uploaded', label: 'Service chain' }); return keepOpen(name); }; const r = await run8(wo); const back = [...wo.door._grants.values()].filter((g) => g.conv === c8.scope && g.once).length; try { wo.door.closeAll && wo.door.closeAll(); } catch { } return { code: r.code, back }; })();
  ok(big8.code === 'file_too_large_for_a_run' && big8.back === 0, `red control: «file_too_large_for_a_run not BURNED» ends the once-grant «used» for a run that never ran — nothing given back (${JSON.stringify(big8)})`, big8);
}
try { fs.chmodSync(BIN, 0o755); } catch { }   // the read-only bin given back (the scratch dir is removed)
try { fs.chmodSync(GHBIN, 0o755); } catch { }   // B-f1d3: GHBIN too
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);

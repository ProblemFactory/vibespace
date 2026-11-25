#!/usr/bin/env node
// test-vault-run — THE DOOR's legs of `vibespace-vault run`: the switch, the scrub, the card, the lock, the audit, the timeout,
// the mutants, the pins, the card on the page (B-54a9 split, 主开发 r3540 / r4355; lane bl-tests-a, 2026-11-25). The first of
// three fast suites over ONE world, scripts/vault-run-world.mjs; its twins test-vault-run-grants (⑩, ⑩b) and test-vault-run-seal
// (⑥b, ⑥c, ⑪, ⑫'s seal) carry the rest. Every leg moved word for word, in its old order.
// The words of the one suite it came from:
// test-vault-run — THE DOOR of `vibespace-vault run` (lane vault-run-door, design q-043 §8 + §5 P0-f): src/server/vault-run-door.js
// over the PURE src/vault-run.js, a REAL vault engine on a scratch dir, the REAL For-you store, and REAL children (a fake
// printer that leaks the value in every form, split across pipe chunks). Fast tier, in-process.
//   ① THE SWITCH (decision ⑤) — off by default ⇒ entry_not_runnable BY NAME; ON needs 验证是你; a login / pairing / channel
//      token, a hub secret, a sign-in kind is refused BY NAME on the switch AND at the run — even when the store is forced
//      'opened', even when the model's ownDoorOf is made to say yes (the engine's own class check); the store is MARKED by the
//      vault (a hand edit reads as empty, said in the audit)
//   ② THE SCRUB — env / a 0600 file ($VAULT_FILE) / a template / stdin: the child prints the value raw, base64 (std / URL /
//      inside `Basic user:pass`), percent, JSON and hex (upper / lower) and — lane vault-scrub-forms — UTF-16 LE / BE (bytes),
//      base32, quoted-printable, a Python bytes repr, HTML entities, colour escapes and wrapped base64, every one cut across
//      two pipe chunks, on stdout AND stderr ⇒ an independent decoding oracle (every view: colours stripped, lines joined, QP /
//      \xNN / entities decoded, NULs dropped) finds 0 bytes of it in what the agent gets; ONE WINDOW PER RUN: a value split
//      between stdout and stderr is masked; a long new form across the 2 MiB cut is dropped whole; the file is 0600 in a 0700 dir
//      and gone after the run; the exit code passes; 2 MiB cut; the refusals (argv, a print tool, a short value, a hidden
//      character, a cut card, a job, a remote conversation, --on, a cwd or a template outside the fence, no such tool)
//   ③ THE CARD (decisions ② ④) — a NEW shape draws the card on a cluster AND a local instance; a local one runs a SEEN shape
//      without asking, a cluster asks every time; «always» (验证是你 first; never for a shell / an interpreter) runs the
//      shape without asking; deny / no answer / the card closed by another door / a changed item / a second run of the same
//      shape / the caller gone / a lock — each refused by name, nothing runs; the card shows the whole run, never a value
//   ④ THE LOCK (decision ③) — a lock mid-run: the child (deaf to SIGTERM) is gone within its bound, the answer is
//      vault_locked, the run folder is gone, the owner's For-you list names the conversation; a locked vault refuses first
//   ⑤ THE AUDIT — one vault-run line per run and refusal: the actor, the shape, the entries, the exit, the scrubbed bytes —
//      the oracle finds no value in data/vault-audit.jsonl, data/user-todos.json or data/vault-run.json
//   ⑥ THE TIMEOUT — `--timeout 1` stops the child, said
//   ⑦ MUTANTS — patched copies of the door RED: a new shape without a card; an audit line carrying a value; two scrubbers
//      (one per pipe — the split leaks); a cut that flushes the held tail (the edge leaks)
//   ⑧ PINS — the headers (the three holes, the sieve, write-then-cat accepted and audited), the wiring
//   ⑨ THE CARD ON THE PAGE — the For-you window's buttons (PURE itemView: Allow once / Always for this shape / Deny, no
//      «always» when not offered), the popup row, «always» and the switch asking 验证是你 FIRST, a typed reply never answering
//   ⑮ THE SPLIT (B-54a9) — the pin in the old file: each moved section stands once in its twin and never here (a header written
//      back is red by name, its RED control plants one); the three suites import the one world
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { anchored } from './scratch.mjs';   // FIRST after node's own (§113)
import { copiesCensus } from './mutant-copy.mjs';
import { require, REPO, R, pass, fail, ok, editAnchor, sleep, DOOR, VR, DETAIL_MAX, M, PW, VALUE, VALUE2, BIN, PRINTER, CURL, NODE, GHBIN, leaks, ROWS, CALLER, world, cardsOf, waitCard, runAnswered, openRow, ENV, auditOf, runLines, runDirs, alive, PH1, splitLeg, doorCopy, workerCopy, SMALL } from './vault-run-world.mjs';   // THE ONE WORLD of the three suites (B-54a9, 主开发 r4355)
ok(leaks('a ' + VALUE + ' b', VALUE).length && leaks(Buffer.from('user:' + VALUE).toString('base64'), VALUE).includes('base64') && leaks(Buffer.from(VALUE).toString('hex').toUpperCase(), VALUE).includes('hex') && leaks(encodeURIComponent(VALUE), VALUE).includes('percent') && leaks(JSON.stringify({ v: VALUE }), VALUE).includes('json') && !leaks('[vault:mounts/m1/secretKey] nothing here', VALUE).length,
  'THE ORACLE (independent of the scrubber): Node\'s own decoders find the value raw, in base64 inside Basic, upper hex, percent and JSON — and nothing in a placeholder');
{ const v = VALUE2, u16 = (x) => { const d = new (require('node:string_decoder').StringDecoder)('utf8'); return d.write(x) + d.end(); };
  const seen = [[u16(Buffer.from(v, 'utf16le')), 'UTF-16LE'], [[...v].map((c) => '&#' + c.codePointAt(0) + ';').join(''), 'entities'], [[...v].map((c, i) => (i && i % 4 === 0 ? '\x1b[0m' : '') + c).join(''), 'colours'], [[...Buffer.from(v)].map((x) => '=' + x.toString(16).toUpperCase()).join('').replace(/^(.{30})/, '$1=\r\n'), 'quoted-printable'], [[...Buffer.from(v)].map((x) => '\\x' + x.toString(16)).join(''), '\\xNN'], [Buffer.from(v).toString('base64').replace(/(.{8})/g, '$1\n'), 'wrapped base64']];
  const miss = seen.filter(([x]) => !leaks(x, v).length).map(([, n]) => n);
  ok(!miss.length && leaks('JZTW4ZDPOU', 'not-there').length === 0, 'THE ORACLE reads the new spellings in the clear too (UTF-16LE, entities, colours, quoted-printable, \\xNN, wrapped base64) — so a 0 below is not vacuous', miss); }

console.log('① THE SWITCH — the owner opens an entry for runs; a login / pairing / channel token never');
{
  const w = await world();
  const r0 = await w.door.run({ caller: w.caller, args: ENV('env'), cwd: w.work });
  ok(r0.code === 'entry_not_runnable' && r0.ref === 'vault://mounts/m1/secretKey' && /Usable by agent runs/.test(r0.words) && !cardsOf(w).length, 'an entry NOT opened for runs ⇒ entry_not_runnable BY NAME (the reference, the Vault window\'s switch) — no card, nothing ran', r0);
  ok(w.door.rowFacts({ id: 'mounts:m1#secretKey', store: 'mounts' }).open === false && w.door.rowFacts({ id: 'mounts:m1#secretKey', store: 'mounts' }).can === true, 'the switch is OFF by default (the Vault window\'s row: can, not open)');
  const s1 = w.door.setRunnable({ id: 'mounts:m1#secretKey', on: true });
  ok(s1.code === 'reveal_needs_password', 'switching ON needs this page\'s 验证是你 window (the second password again) — refused without it', s1);
  ok(openRow(w).open === true && w.door.rowFacts({ id: 'mounts:m1#secretKey' }).open === true, 'with it: ON (the row says so)');
  const own = [['accounts:acct1#apiKey', 'login'], ['channels:lark1#token', 'channel'], ['secrets:host:dev1#token', 'pairing'], ['mounts:m4#session', 'login']];
  const sw = own.map(([id]) => w.door.setRunnable({ id, on: true, reauthed: true }));
  ok(sw.every((x) => x.code === 'entry_has_its_own_door' && /own door/.test(x.words)), 'a LOGIN key, a CHANNEL token, a PAIRING (machine link) token and a sign-in kind on a storage row cannot be switched on — entry_has_its_own_door by name', sw);
  // FORCED 'opened': a store the vault marks, holding the ids anyway (what a bug or a hand would leave)
  const body = JSON.stringify({ v: 1, gen: 99, runnable: ['accounts:acct1#apiKey', 'channels:lark1#token', 'mounts:m1#secretKey', 'mounts:m4#session', 'secrets:host:dev1#token'], always: [] });
  fs.writeFileSync(path.join(w.dataDir, DOOR.STORE_FILE), JSON.stringify({ ...JSON.parse(body), mark: w.vault.macOf(DOOR.MARK_LABEL, body) }));
  const forced = w.mk();
  const refs = [['--env', 'T=vault://accounts/acct1/apiKey'], ['--env', 'T=vault://channels/lark1/token'], ['--env', 'T=vault://secrets/host:dev1/token'], ['--env', 'T=vault://mounts/m4/session']];
  const fr = [];
  for (const e of refs) fr.push(await forced.run({ caller: w.caller, args: [...e, '--', NODE, PRINTER, 'env'], cwd: w.work }));
  ok(fr.every((x) => x.code === 'entry_has_its_own_door' && typeof x.door === 'string' && x.words.includes(x.door)) && !cardsOf(w).length, 'FORCED open: a login / channel / pairing token and a sign-in kind are refused BY NAME at the run, naming their door — no card, nothing ran', fr.map((x) => [x.code, x.door]));
  // the ENGINE'S OWN check: the model's ownDoorOf made to say yes for everything — the door still refuses by its own table
  const keep = VR.ownDoorOf; VR.ownDoorOf = () => null;
  const fr2 = [];
  try { for (const e of refs.slice(0, 3)) fr2.push(await forced.run({ caller: w.caller, args: [...e, '--', NODE, PRINTER, 'env'], cwd: w.work })); } finally { VR.ownDoorOf = keep; }
  ok(fr2.every((x) => x.code === 'entry_has_its_own_door') && Object.keys(DOOR.RUN_CLASS).sort().join() === 'app-secrets,mounts' && ['accounts', 'channels', 'integrations', 'passkeys', 'automation', 'secrets'].every((s) => DOOR.NEVER_CLASS[s]), 'the ENGINE\'s entry-class check alone (the model\'s table made to say yes) still refuses them — two tables say no (RUN_CLASS: storage and app logins only)', fr2.map((x) => x.code));
  // THE MARK: a hand edit of the store (no mark that verifies) reads as EMPTY
  const raw = JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8'));
  fs.writeFileSync(path.join(w.dataDir, DOOR.STORE_FILE), JSON.stringify({ ...raw, runnable: [...raw.runnable, 'app-secrets:app1#item.0.1'] }));
  const edited = w.mk();
  const re = await edited.run({ caller: w.caller, args: ENV('env'), cwd: w.work });
  ok(re.code === 'entry_not_runnable' && /vault-run-store-refused/.test(auditOf(w)), 'a HAND-EDITED store (its mark no longer verifies — an agent shares the uid, never the DEK) reads as EMPTY: every entry closed, said in the audit', re.code);
  ok(DOOR.DETAIL_MAX === DETAIL_MAX, 'the card bound is the For-you store\'s own detail bound (a cut card would differ from what runs)');
}

console.log('② THE SCRUB — every form of the value, cut across chunks, on both streams ⇒ 0 bytes reach the agent');
{
  const w = await world();
  openRow(w); openRow(w, 'app-secrets:app1#item.0.1');
  const legs = [
    ['env', ENV('env')],
    ['file', ['--file', 'K=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'file', '$VAULT_FILE{K}']],
    ['file (a reference in $VAULT_FILE)', ['--', NODE, PRINTER, 'file', '$VAULT_FILE{mounts/m1/secretKey}']],
    ['stdin', ['--stdin', 'vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'stdin']],
  ];
  fs.writeFileSync(path.join(w.work, 'tmpl.txt'), 'token=$VAULT{mounts/m1/secretKey}\n');
  legs.push(['template', ['--file', 'CFG=@tmpl.txt', '--', NODE, PRINTER, 'template', '$VAULT_FILE{CFG}']]);
  for (const [name, args] of legs) {
    const { r, card } = await runAnswered(w, args);
    const out = (r.stdout || '') + (r.stderr || '');
    const lk = leaks(out, VALUE);
    ok(r.ok && r.exit === 3 && !lk.length && (out.match(/\[vault:mounts\/m1\/secretKey\]/g) || []).length >= 40 && /DONE/.test(r.stdout) && r.scrubbed.hits >= 40 && r.scrubbed.bytes > 40 * VALUE.length && !!card,
      `${name}: the child printed the value in 21 spellings (the 12 + UTF-16 LE / BE bytes, base32 ×2, quoted-printable, a Python bytes repr, HTML entities, colour escapes, wrapped base64), each cut across two chunks on stdout AND stderr at once (the other pipe's half between them) — the oracle finds NOTHING (0 bytes; the whole percent line lower-cased changes the value's own letters — a case swap, never masked, never the value), ${r.scrubbed && r.scrubbed.hits} placeholders, ${r.scrubbed && r.scrubbed.bytes} bytes scrubbed; the exit code (3) passes`, { lk, code: r.code, exit: r.exit, out: out.slice(0, 400) });
    if (name === 'file') {
      const m = /FILE (\d+) (\d+) (\S+)/.exec(r.stdout || '');
      ok(m && m[1] === '600' && m[2] === '700' && m[3].startsWith(w.runRoot + '/' + DOOR.RUN_DIR_PREFIX) && !fs.existsSync(m[3]) && !runDirs(w).length, 'the file is 0600 in a 0700 run folder under the run root — and the folder is SHREDDED and gone once the child is', m && m.slice(1));
    }
  }
  ok(!runDirs(w).length, 'no run folder is left after five runs');
  const big = await runAnswered(w, ENV('big'));
  ok(big.r.ok && big.r.truncated === true && Buffer.byteLength(big.r.stdout) <= VR.OUTPUT_MAX_BYTES && !leaks(big.r.stdout.slice(-200), VALUE).length, 'the output is cut at 2 MiB (said: truncated) — the value printed past the cut never arrives', { truncated: big.r.truncated, len: big.r.stdout && big.r.stdout.length });
  const edge = await runAnswered(w, ENV('edge'));
  const tail = (edge.r.stdout || '').slice(-400);
  ok(edge.r.ok && edge.r.truncated === true && !leaks(tail, VALUE).length && !tail.includes(VALUE.slice(0, 12)) && !tail.includes(VALUE.slice(0, 6)), 'a value printed ACROSS the 2 MiB cut: its first 12 bytes are inside the bound — the scrubber\'s held tail is DROPPED at a cut, never flushed (not even 6 bytes of it arrive)', { truncated: edge.r.truncated, tail: tail.slice(-60) });
  // ONE WINDOW PER RUN (the desk's q-043 M1): the run's ONE scrubber reads both pipes in arrival order
  const sp = await splitLeg(w);
  ok(sp.ok && sp.so === '<' + PH1 + ' tail\n' && sp.se === PH1 + '>\n' && !sp.lk.length, 'ONE WINDOW PER RUN: the child printed half the value on stdout and the rest on stderr — the run\'s one scrubber saw it whole: stdout «<[vault:…] tail», stderr «[vault:…]>» (each pipe shows where its part was), 0 bytes of it', sp);
  for (const [mode, what, dec] of [['edge2', 'its HTML entities (~200 characters, 60 inside the bound)', (s) => s.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))], ['edge3', 'its UTF-16LE bytes (40 inside the bound)', (s) => s.replace(/\0/g, '')]]) {
    const e2 = await runAnswered(w, ENV(mode));
    const t2 = (e2.r.stdout || '').slice(-1200), d2 = dec(t2);
    ok(e2.r.ok && e2.r.truncated === true && !leaks(t2, VALUE).length && !d2.includes(VALUE.slice(0, 6)) && t2.endsWith('[vault:\u2026]'), `a value printed ACROSS the 2 MiB cut as ${what}: round 21 («never drop a byte») — the held tail (the window where a value is HALF present in that VIEW) is FLUSHED as ONE placeholder [vault:…] (not dropped silently, not half a value), not even 6 characters of it arrive`, { truncated: e2.r.truncated, tailDropped: e2.r.tailDropped, tail: JSON.stringify(t2.slice(-80)) });
  }
  const app = await runAnswered(w, ['--env', 'T=vault://app-secrets/app1/item.0.1', '--', NODE, PRINTER, 'env']);
  ok(app.r.ok && !leaks(app.r.stdout + app.r.stderr, VALUE2).length && /\[vault:app-secrets\/app1\/item\.0\.1\]/.test(app.r.stdout), 'an app login opened for runs: the same — its placeholder, 0 bytes of it', app.r.code);
  // the refusals — each BY NAME, before anything is read or spawned
  openRow(w, 'mounts:m2#secretKey');
  const REF = [
    [['--', NODE, PRINTER, 'env', 'vault://mounts/m1/secretKey'], 'argv_refused', 'a value on the command line (/proc/<pid>/cmdline)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', 'cat', '/etc/hostname'], 'tool_prints_secrets', 'a print tool (cat)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', 'sudo', 'true'], 'tool_wraps_another', 'a wrapper (sudo)'],
    [['--env', 'T=vault://mounts/m2/secretKey', '--', NODE, PRINTER, 'env'], 'entry_too_short_to_mask', 'a value under 8 bytes (it could not be scrubbed)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env\u202e'], 'hidden_chars', 'a direction mark in the command (the card would show another order)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', 'no-such-tool-vrd'], 'tool_not_found', 'a program not on the PATH (a bare name is never looked up in the cwd)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--on', 'mac', '--', NODE, PRINTER, 'env'], 'device_road_later', '--on a machine (P1 vault-run-device)'],
    [['--env', 'LD_PRELOAD=/tmp/x.so', '--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env'], 'env_refused', 'a hijack env name (LD_PRELOAD)'],
    [['--file', 'CFG=@/etc/hostname', '--', NODE, PRINTER, 'template', '$VAULT_FILE{CFG}'], 'template_refused', 'a template outside the project / temp / Downloads fence'],
    [['--env', 'T=vault://mounts/m9/secretKey', '--', NODE, PRINTER, 'env'], 'entry_unknown', 'an entry that is not there'],
  ];
  const before = cardsOf(w).length;
  const got = [];
  for (const [args, code] of REF) got.push((await w.door.run({ caller: w.caller, args, cwd: w.work })).code);
  ok(REF.every(([, code], i) => got[i] === code) && cardsOf(w).length === before, `refused BY NAME, no card, nothing spawned: ${REF.map(([, c, why], i) => `${why} ⇒ ${got[i]}`).join(' · ')}`, got);
  // round 17 (item 1): a template within the card render bound is shown IN FULL — TWO such templates together overflow DETAIL_MAX ⇒ card_too_long (a single over-bound template is now a short note, below)
  fs.writeFileSync(path.join(w.work, 'long1.txt'), 'x'.repeat(3900) + '$VAULT{mounts/m1/secretKey}');
  fs.writeFileSync(path.join(w.work, 'long2.txt'), 'y'.repeat(3900) + '$VAULT{mounts/m1/secretKey}');
  const cut = await w.door.run({ caller: w.caller, args: ['--file', 'C1=@long1.txt', '--file', 'C2=@long2.txt', '--', NODE, PRINTER, 'template', '$VAULT_FILE{C1}', '$VAULT_FILE{C2}'], cwd: w.work });
  const job = await w.door.run({ caller: { job: true, name: 'nightly' }, args: ENV('env'), cwd: w.work });
  const remote = await w.door.run({ caller: { ...w.caller, remote: true }, args: ENV('env'), cwd: w.work });
  const fence = await w.door.run({ caller: w.caller, args: ENV('env'), cwd: '/etc' });
  ok(cut.code === 'card_too_long' && job.code === 'job_no_use' && remote.code === 'device_road_later' && fence.code === 'cwd_refused', 'a card that would be cut ⇒ card_too_long · a Background Work job ⇒ job_no_use · a conversation on a paired machine ⇒ device_road_later · a cwd outside the fence ⇒ cwd_refused', [cut.code, job.code, remote.code, fence.code]);
}

console.log('②b AN AGENT\'S OWN ENTRY (vault-mint-put\'s mint / put) — opened by the owner, used by its conversation only');
{
  const w = await world();
  const id = 'secrets:agent:conv-1/gh-token#secret';
  ok(w.door.rowFacts({ id }).can === false && w.door.rowFacts({ id }).own === true, 'lane vault-agent-own: the Vault window\'s row of an agent\'s own entry carries NO switch — its conversation runs it by construction, no other may');
  const r0 = await w.door.run({ caller: w.caller, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(r0.ok && r0.by === 'own' && !cardsOf(w).length, 'lane vault-agent-own: never opened, never granted ⇒ ITS conversation runs it with no card (was entry_not_runnable — decision ⑤ no longer holds for an entry it stored itself)', r0.code || r0.by);
  const own = await runAnswered(w, ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'env']);
  ok(own.r.ok && !leaks(own.r.stdout + own.r.stderr, 'agent-minted-value-0123456789').length && /\[vault:agent:conv-1\/gh-token\]/.test(own.r.stdout), 'ITS conversation runs with it, spelled as mint hands it out — scrubbed to [vault:agent:conv-1/gh-token]', own.r.code);
  const other = await w.door.run({ caller: { ...w.caller, conversationId: 'conv-2', sessionKey: 'claude:conv-2', name: 'Lane Y' }, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(other.code === 'use_not_granted' && !cardsOf(w).length, 'ANOTHER conversation ⇒ use_not_granted, by name — no card, nothing read', other.code);
}

console.log('②c B-bc3b — the owner SHARES an agent\'s own entry through its grant row («Who may use it…»): another conversation runs it ONLY as the row says');
{
  const VUG = R('src/server/vault-use-grants.js'), GS = R('src/server/grants-store.js');
  const ID = 'secrets:agent:conv-1/gh-token#secret', REF = 'vault://agent:conv-1/gh-token';
  async function shareWorld(doorMod = DOOR, { askMs = 50, now = null } = {}) {   // `now`: ONE clock for the door and the grants (the expired-window leg)
    const w = await world({ doorMod, askMs });   // the read: a mutant that lets a card through ends it in 50 ms, never the real 60 s
    const gs = GS.create({ memory: true }), groups = new Map();
    const ug = VUG.create({ grants: () => gs, vault: w.vault, dataDir: w.dataDir, log: (m) => w.logs.push(String(m)), ...(now ? { now } : {}) });
    const door = w.mk(doorMod, { useGrants: ug, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: groups.get(c.conversationId) || [] }), ...(now ? { now } : {}) });
    const as = (cid) => ({ ...w.caller, conversationId: cid, sessionKey: `claude:${cid}`, name: `Lane ${cid}` });
    const runAs = (cid, args) => door.run({ caller: as(cid), args, cwd: w.work });
    return { w, ug, groups, door, as, runAs };
  }
  const TO = (host) => ['--env', `T=${REF}`, '--', 'curl', '-s', `https://${host}/v1/items`];
  const s = await shareWorld();
  const f0 = s.door.rowFacts({ id: ID });
  ok(f0.own === true && f0.can === false && f0.use && f0.use.own === true && !(f0.use.to || []).length, 'the agent\'s row carries its `use` with NO member — the window draws «Who may use it…» on it (the owner shares it there); still no switch', f0);
  const before = await s.runAs('conv-2', TO('api.example.com'));
  ok(before.code === 'use_not_granted' && !cardsOf(s.w).length, 'NOT shared ⇒ another conversation is refused use_not_granted, by name — no card (as before)', before.code);
  const add = s.ug.addMember(ID, { kind: 'conversation', key: 'conv-2', name: 'Lane conv-2' }, { hosts: ['api.example.com'] });
  const shared = await s.runAs('conv-2', TO('api.example.com'));
  ok(add && add.ok && shared.ok && shared.by === 'grant' && !cardsOf(s.w).length && !leaks(shared.stdout + shared.stderr, 'agent-minted-value-0123456789').length,
    'SHARED with conv-2 for api.example.com ⇒ conv-2 runs it there BY THE GRANT, no card — the value scrubbed from what comes back', { add: add && add.ok, ok: shared.ok, by: shared.by, code: shared.code });
  const away = await s.runAs('conv-2', TO('elsewhere.example.test'));
  const blind = await s.runAs('conv-2', ['--env', `T=${REF}`, '--', NODE, PRINTER, 'env']);
  const third = await s.runAs('conv-3', TO('api.example.com'));
  ok(away.code === 'use_not_granted' && blind.code === 'use_not_granted' && third.code === 'use_not_granted' && !cardsOf(s.w).length,
    '…ONLY as the row says: another host, a command whose destination cannot be told, a conversation the row does not name ⇒ use_not_granted, no card (what an agent stored never reaches anyone by a card)', { away: away.code, blind: blind.code, third: third.code });
  const own = await s.runAs('conv-1', TO('api.example.com'));
  ok(own.ok && own.by === 'own', 'its own conversation still runs it by construction (own)', own.code || own.by);
  const l2 = s.door.runnableFor(s.as('conv-2')), l3 = s.door.runnableFor(s.as('conv-3'));
  const e2 = (l2.entries || []).find((x) => x.ref === REF);
  ok(e2 && e2.by === 'standing' && !e2.paused && (e2.hosts || []).includes('api.example.com') && !(l3.entries || []).some((x) => x.ref === REF), 'the list: conv-2 SEES the shared entry (standing, its hosts — not «paused»: no switch is its), conv-3 does not', { e2, l3: (l3.entries || []).map((x) => x.ref) });
  s.groups.set('conv-4', ['g-team']);
  s.ug.addMember(ID, { kind: 'group', id: 'g-team', name: 'Team' }, { hosts: ['api.example.com'] });
  const viaGroup = await s.runAs('conv-4', TO('api.example.com'));
  ok(viaGroup.ok && viaGroup.by === 'grant', 'shared with a Task Group ⇒ its member conv-4 runs it for the row\'s host', viaGroup.code || viaGroup.by);
  // the read (r1): a MIXED run — the shared entry + a free entry the owner switched ON but granted conv-2 nothing for — never draws
  // a card (an «Always» there would write conv-2 a member the owner never gave). B-bc3b (the cure): each entry by ITS OWN rule —
  // the free entry has no standing grant for conv-2, so IT is the one named (run_not_admitted), never the shared one it was before
  s.door.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });
  const MIXED = ['--env', `T=${REF}`, '--env', 'U=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/items'];
  const mixed = await s.runAs('conv-2', MIXED);
  ok(mixed.code === 'run_not_admitted' && mixed.ref === 'vault://mounts/m1/secretKey' && /^«vault:\/\/mounts\/m1\/secretKey» is not admitted in this run: no standing approval of the user's lets this conversation use it for api\.example\.com \(an approval of a request — once or for 8 hours — or a pasted one is not read in a run that names a shared entry\)\. /.test(mixed.words || '') && !cardsOf(s.w).length,
    'a MIXED run naming the shared entry (+ a free entry with no grant for conv-2) ⇒ run_not_admitted naming the FREE entry (the one not admitted) and why, NO card — a card there could widen the share', { code: mixed.code, ref: mixed.ref, words: mixed.words, cards: cardsOf(s.w).length });
  // B-bc3b (the cure, 主开发 r840) — THE CALLER'S OWN ENTRY + A SHARED ONE: each admitted by its own rule (ownership · the grant row)
  const OWN_ROWS = [{ entry: 'agent:conv-2/own-put', field: 'secret', label: 'Agent secret · own-put', bytes: 30, v: 'conv2-put-value-0123456789ab' },
    { entry: 'agent:conv-2/own-mint', field: 'secret', label: 'Agent secret · own-mint', bytes: 30, provenance: { by: 'agent', prov: 'minted', sawPlaintext: false, actor: 'Lane conv-2', forHost: 'own.example.test' }, v: 'conv2-mint-value-0123456789ab' },
    { entry: 'agent:conv-2/own-here', field: 'secret', label: 'Agent secret · own-here', bytes: 30, provenance: { by: 'agent', prov: 'minted', sawPlaintext: false, actor: 'Lane conv-2', forHost: 'api.example.com' }, v: 'conv2-here-value-0123456789ab' }];
  ROWS.secrets.push(...OWN_ROWS);
  try {
    const ownSolo = await s.runAs('conv-2', ['--env', 'U=vault://agent:conv-2/own-put', '--', 'curl', '-s', 'https://api.example.com/v1/items']);
    ok(ownSolo.ok && ownSolo.by === 'own', 'the plant proves itself: conv-2\'s OWN put entry runs alone by ownership (own), the shared entry alone by its grant (above)', ownSolo.code || ownSolo.by);
    const OWNMIX = ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-put', '--', 'curl', '-s', 'https://api.example.com/v1/items'];
    const om = await s.runAs('conv-2', OWNMIX);
    ok(om.ok && om.by === 'grant' && !cardsOf(s.w).length && !leaks((om.stdout || '') + (om.stderr || ''), 'agent-minted-value-0123456789').length && !leaks((om.stdout || '') + (om.stderr || ''), 'conv2-put-value-0123456789ab').length,
      'B-bc3b (the cure): its OWN put entry + the entry SHARED with it, to the shared row\'s host ⇒ RUNS by:grant with NO card (each admitted by its own rule) — neither value in what comes back (the release refused it naming the shared entry)', { ok: om.ok, by: om.by, code: om.code, words: om.words });
    const mintAway = await s.runAs('conv-2', ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-mint', '--', 'curl', '-s', 'https://api.example.com/v1/items']);
    ok(mintAway.code === 'run_not_admitted' && mintAway.ref === 'vault://agent:conv-2/own-mint' && /minted for own\.example\.test and this run goes to api\.example\.com/.test(mintAway.words || '') && !cardsOf(s.w).length,
      'its OWN value minted for another host + the shared entry ⇒ run_not_admitted naming the OWN entry (its own road would draw its card; a run naming a shared entry never does), NO card', { code: mintAway.code, ref: mintAway.ref, words: mintAway.words });
    const mintHere = await s.runAs('conv-2', ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-here', '--', 'curl', '-s', 'https://api.example.com/v1/items']);
    ok(mintHere.ok && mintHere.by === 'grant' && !cardsOf(s.w).length, 'its OWN value minted FOR this run\'s host + the shared entry ⇒ runs by:grant, no card (its own road admits it where it was minted for)', { ok: mintHere.ok, by: mintHere.by, code: mintHere.code, words: mintHere.words });
    // a THIRD kind beside them — the owner's entry, ON, with a STANDING grant for conv-2 to the same host — is admitted by that grant
    const m1g = s.ug.addMember('mounts:m1#secretKey', { kind: 'conversation', key: 'conv-2', name: 'Lane conv-2' }, { hosts: ['api.example.com'] });
    const three = await s.runAs('conv-2', [...OWNMIX.slice(0, 4), '--env', 'V=vault://mounts/m1/secretKey', ...OWNMIX.slice(4)]);
    const tl = runLines(s.w).pop() || {};
    ok(m1g && m1g.ok && three.ok && three.by === 'grant' && (tl.grants || []).length === 2 && !cardsOf(s.w).length && !leaks((three.stdout || '') + (three.stderr || ''), VALUE).length,
      'shared + its OWN put entry + the owner\'s entry under a STANDING grant for conv-2 ⇒ runs by:grant, no card — the run line names the TWO grants (the shared row\'s, the owner\'s entry\'s); the own entry needs none', { ok: three.ok, by: three.by, code: three.code, grants: tl.grants });
    // the 1-hour WINDOW still says itself in a mixed run, and ENDS there with its hour (its own world: ②c's cards end in 50 ms by
    // design; ONE clock for the door and the grants, so the hour's end is reached by the clock, never by waiting)
    const bounded = (p, ms, why) => { let t = null; return Promise.race([p, new Promise((res) => { t = setTimeout(() => res({ ok: false, code: why }), ms); })]).finally(() => clearTimeout(t)); };   // a bound whose timer is CLEARED: a leg that passed leaves nothing pending
    const MIX3 = [...OWNMIX.slice(0, 4), '--env', 'V=vault://mounts/m1/secretKey', ...OWNMIX.slice(4)];
    async function windowMix(doorMod) {
      let clk = Date.now();
      const hw = await shareWorld(doorMod, { askMs: null, now: () => clk });
      hw.ug.addMember(ID, { kind: 'conversation', key: 'conv-2', name: 'Lane conv-2' }, { hosts: ['api.example.com'] });
      hw.door.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });
      const M1RUN = ['--env', 'V=vault://mounts/m1/secretKey', '--', '/bin/sh', '-c', 'true'];   // a card that offers NO «Always» is the one that offers «Allow for 1 hour» (the door's winWould) — a shell's
      const p = hw.door.run({ caller: hw.as('conv-2'), args: M1RUN, cwd: hw.w.work });
      const c = await waitCard(hw.w);
      const ans = c ? hw.door.answer(c.action.askId, { answer: 'window', reauthed: true, person: true }) : null;
      const first = await bounded(p, 5000, 'the card was never settled (5 s)');   // a bound: a card left waiting is a red by name, never a hang
      const mixW = await bounded(hw.runAs('conv-2', MIX3), 5000, 'the mixed run never settled (5 s)');
      const wl = runLines(hw.w).pop() || {};
      const notice = !!mixW.receipt && hw.w.logs.some((l) => l.includes(`a run under the 1-hour approval (${mixW.receipt})`));   // no client in the world: the window's one notice per use is its log line
      clk += R('src/vault-use-grant.js').WINDOW_MS + 1000;   // past the hour's end (the PURE grant's own length), by the one clock
      const late = await bounded(hw.runAs('conv-2', MIX3), 5000, 'the late run never settled (5 s)');
      const cardsLate = cardsOf(hw.w).length;
      for (const x of cardsOf(hw.w)) { try { hw.door.answer(x.action.askId, { answer: 'deny', reauthed: true, person: true }); } catch { } }   // a red's card is closed here: its run never outlives the leg by the real 60 s
      return { card: !!c, answered: !!(ans && ans.ok), first, mixW, wl, notice, late, cardsLate };
    }
    {
      const r = await windowMix(DOOR);
      ok(r.card && r.first.ok && r.mixW.ok && r.mixW.by === 'grant' && r.wl.receipt === r.mixW.receipt && r.wl.scope === 'window' && Number(r.wl.windowLeft) === 60 && r.notice, 'shared + own + the owner\'s entry under its 1-HOUR WINDOW ⇒ runs, its OWN run line says scope «window» with the minutes left (60 on the one clock), and the window\'s one notice per use is said (kept in a mixed run)', { card: r.card, answered: r.answered, first: r.first.ok && r.first.by, mix: r.mixW.ok && r.mixW.by, code: r.mixW.code, receipt: r.mixW.receipt, line: r.wl.receipt, scope: r.wl.scope, left: r.wl.windowLeft, notice: r.notice });
      ok(r.late.code === 'run_not_admitted' && r.late.ref === 'vault://mounts/m1/secretKey' && /is not admitted in this run: no standing approval of the user's/.test(r.late.words || '') && r.cardsLate === 0,
        'the same mixed run AFTER the hour (the one clock past its end) ⇒ run_not_admitted naming the owner\'s entry, no card — the window ends in a mixed run as it does alone', { code: r.late.code, ref: r.late.ref, words: r.late.words, cards: r.cardsLate });
      // RED — the mixed block's window lines taken away: the same mixed run still runs by:grant (the plant proves itself) but its
      // run line no longer says «window» — the leg above goes red there
      const SRCw = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
      const noWin = M.load('src/server/vault-run-door.js', anchored(SRCw, '        if (winsM.length) {', '        if (false) {', 'test-vault-run ②c bc3b-no-window'), 'bc3b-no-window');
      const rw = noWin ? await windowMix(noWin) : null;
      ok(!!noWin && rw && rw.first.ok && rw.mixW.ok && rw.mixW.by === 'grant' && rw.wl.receipt === rw.mixW.receipt && rw.wl.scope !== 'window' && !rw.notice, 'RED — the mixed block\'s window lines off: the mixed run under the window still RUNS by:grant (the plant is where it claims) but its OWN run line says no «window» and no notice is said — the window leg goes red there', rw && { first: rw.first.ok, mix: rw.mixW.ok && rw.mixW.by, line: rw.wl.receipt === rw.mixW.receipt, scope: rw.wl.scope, notice: rw.notice });
    }
    // RED — the release's rule (a run naming a shared entry is refused, naming the shared entry, whenever the verdict asks)
    const SRCm = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const oldRule = M.load('src/server/vault-run-door.js', anchored(SRCm, '        const r0 = spec.refs.find((r) => whyNot(r) !== null);', "        const r0 = spec.refs.find((r) => sharedIds.has(r.id)); if (r0) { note('use_not_granted', { ...head, ref: r0.ref }); return named('use_not_granted', { ref: r0.ref }); }", 'test-vault-run ②c bc3b-old-rule'), 'bc3b-old-rule');
    let ro = null;
    if (oldRule) { const m = await shareWorld(oldRule); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); const solo = await m.runAs('conv-2', TO('api.example.com')); const x = await m.runAs('conv-2', OWNMIX); ro = { solo: solo.ok && solo.by, code: x.code, ref: x.ref }; }
    ok(!!oldRule && ro && ro.solo === 'grant' && ro.code === 'use_not_granted' && ro.ref === REF, 'RED — the release\'s rule (the patched copy\'s plant proves itself: its shared run alone still runs by:grant): the OWN + SHARED run is refused naming the SHARED entry — the cure\'s leg above goes red there', ro);
    // RED — the own road's MINTED rule taken away (every own entry admitted by ownership alone): its value minted for another
    // host RUNS beside the shared entry — the mintAway leg above goes red there
    const SRCo = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const ownAll = M.load('src/server/vault-run-door.js', anchored(SRCo, '          if (ownIds.has(r.id)) {', '          if (ownIds.has(r.id)) { return null;', 'test-vault-run ②c bc3b-own-all'), 'bc3b-own-all');
    let oa = null;
    if (ownAll) { const m = await shareWorld(ownAll); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); const solo = await m.runAs('conv-2', TO('api.example.com')); const x = await m.runAs('conv-2', ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-mint', '--', 'curl', '-s', 'https://api.example.com/v1/items']); oa = { solo: solo.ok && solo.by, run: x.ok ? x.by : x.code }; }
    ok(!!ownAll && oa && oa.solo === 'grant' && oa.run === 'grant', 'RED — the own road\'s minted rule off (the copy\'s shared run alone still runs by:grant): the OWN value minted for own.example.test RUNS to api.example.com beside the shared entry — the mintAway leg goes red there', oa);
    // THE FAIL-CLOSED ARM (a belt: runVerdict names `away` on both of its asks, so only a verdict with no hosts reaches it): a copy
    // whose verdict reads as naming none ⇒ the caller's own entry is NOT admitted («its own road could not be judged») — and its
    // RED, the same copy with the belt taken away ⇒ an own value minted for another host is admitted blind
    const SRCb = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const BLIND = ['        const awayKnown = Array.isArray(verdict.away),', '        const awayKnown = Array.isArray(verdict.awayNamedNone),', 'test-vault-run ②c bc3b-blind'];
    const blindV = M.load('src/server/vault-run-door.js', anchored(SRCb, ...BLIND), 'bc3b-blind');
    const blindNoBelt = M.load('src/server/vault-run-door.js', anchored(anchored(SRCb, ...BLIND), "            if (!awayKnown) return 'its own road could not be judged in this run';", '', 'test-vault-run ②c bc3b-blind (belt)'), 'bc3b-blind-nobelt');
    const blindRun = async (mod) => { const m = await shareWorld(mod); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); const solo = await m.runAs('conv-2', TO('api.example.com')); const x = await m.runAs('conv-2', ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-mint', '--', 'curl', '-s', 'https://api.example.com/v1/items']); return { solo: solo.ok && solo.by, run: x.ok ? x.by : x.code, ref: x.ref, words: x.words, cards: cardsOf(m.w).length }; };
    const bv = blindV ? await blindRun(blindV) : null, bn = blindNoBelt ? await blindRun(blindNoBelt) : null;
    ok(!!blindV && bv && bv.solo === 'grant' && bv.run === 'run_not_admitted' && bv.ref === 'vault://agent:conv-2/own-mint' && /its own road could not be judged in this run/.test(bv.words || '') && bv.cards === 0,
      'the fail-closed arm: a verdict naming no hosts (a copy; the shared run alone still runs by:grant) ⇒ the OWN entry is not admitted («its own road could not be judged»), no card', bv);
    ok(!!blindNoBelt && bn && bn.solo === 'grant' && bn.run === 'grant', 'RED — the same blind copy with the belt taken away: the own value minted for another host RUNS by:grant — the fail-closed leg goes red there', bn);
  } finally { for (const x of OWN_ROWS) ROWS.secrets.splice(ROWS.secrets.indexOf(x), 1); }
  // B-bc3b (the row's missing leg) — `&& !refused` on a SHARED entry: a store that fails its mark closes it too. The store is read
  // ONCE PER UNLOCK, so the leg needs a lock cycle: the hand edit alone changes nothing on this door (the plant proves itself first)
  {
    const sf = path.join(s.w.dataDir, DOOR.STORE_FILE), raw = JSON.parse(fs.readFileSync(sf, 'utf8'));
    fs.writeFileSync(sf, JSON.stringify({ ...raw, runnable: [...(raw.runnable || []), 'app-secrets:app1#item.0.1'] }));   // a hand edit: its mark no longer verifies
    const cached = await s.runAs('conv-2', TO('api.example.com'));
    s.w.vault.lock('door'); await s.w.vault.unlock(PW);
    const closed = await s.runAs('conv-2', TO('api.example.com'));
    const lr = (s.door.runnableFor(s.as('conv-2')).entries || []).find((x) => x.ref === REF);
    ROWS.secrets.push(OWN_ROWS[0]);
    let mixClosed = null;
    try { mixClosed = await s.runAs('conv-2', ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-put', '--', 'curl', '-s', 'https://api.example.com/v1/items']); } finally { ROWS.secrets.splice(ROWS.secrets.indexOf(OWN_ROWS[0]), 1); }
    ok(mixClosed && !mixClosed.ok && mixClosed.code === 'entry_not_runnable' && !cardsOf(s.w).length, 'under the refused store an OWN + SHARED run is closed too, by the shared entry\'s own refusal (entry_not_runnable: the verdict closes it before the admission — one code, so a later move of the refusal is seen)', mixClosed && mixClosed.code);
    ok(cached.ok && cached.by === 'grant' && closed.code === 'entry_not_runnable' && /vault-run-store-refused/.test(auditOf(s.w)) && lr && lr.paused === true && !cardsOf(s.w).length,
      'B-bc3b: a hand-edited store (its mark fails) — read once per unlock: the SAME door still runs the shared entry before a lock (its cached store: the plant is where it claims), after a lock + unlock the shared entry is CLOSED (entry_not_runnable, said in the audit) and its list row paused — no card', { cached: cached.ok && cached.by, closed: closed.code, listed: lr && { paused: lr.paused } });
    // RED — both guards of a refused store taken away (the entry's `&& !refused` and the admission's belt): the shared entry RUNS
    // over a store that failed its mark — the leg above goes red there
    const SRCf = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const noRefuse = M.load('src/server/vault-run-door.js', anchored(anchored(SRCf, '(sharedIds.has(r.id) && !refused)', 'sharedIds.has(r.id)', 'test-vault-run ②c bc3b-refused (open)'), "return refused ? 'the vault\\'s run store failed its mark", "return false ? 'the vault\\'s run store failed its mark", 'test-vault-run ②c bc3b-refused (belt)'), 'bc3b-refused');
    let rr = null;
    if (noRefuse) {
      const m = await shareWorld(noRefuse); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] });
      const before = await m.runAs('conv-2', TO('api.example.com'));
      m.door.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });   // a fresh world has no store file until a switch writes one (its mark) — the plant needs it
      const mf = path.join(m.w.dataDir, DOOR.STORE_FILE), mraw = JSON.parse(fs.readFileSync(mf, 'utf8'));
      fs.writeFileSync(mf, JSON.stringify({ ...mraw, runnable: [...(mraw.runnable || []), 'app-secrets:app1#item.0.1'] }));
      m.w.vault.lock('door'); await m.w.vault.unlock(PW);
      const x = await m.runAs('conv-2', TO('api.example.com'));
      rr = { before: before.ok && before.by, refusedSaid: /vault-run-store-refused/.test(auditOf(m.w)), after: x.ok ? x.by : x.code };
    }
    ok(!!noRefuse && rr && rr.before === 'grant' && rr.refusedSaid && rr.after === 'grant', 'RED — both refused-store guards removed (its plant proves itself: the store was refused, said in its audit): the shared entry RUNS by:grant over a store that failed its mark', rr);
  }
  const rv = s.ug.revoke(ID, 'conversation:conv-2');
  const after = await s.runAs('conv-2', TO('api.example.com'));
  ok(rv && rv.ok && after.code === 'use_not_granted', 'the owner\'s ✕ takes it back ⇒ conv-2 is refused again', { rv: rv && rv.ok, code: after.code });
  // RED CONTROLS — patched copies of the door
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const patch = (from, to, tag) => M.load('src/server/vault-run-door.js', anchored(SRC, from, to, `test-vault-run ② ${tag}`), tag); // B-0d3e: a moved anchor fails BY NAME (it answered null in silence)
  const oldEarly = patch('if (foreignRefs.length && !useGrants) {', 'if (foreignRefs.length) {', 'bc3b-early');
  let r1 = null;
  if (oldEarly) { const m = await shareWorld(oldEarly); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); r1 = await m.runAs('conv-2', TO('api.example.com')); }
  ok(!!oldEarly && r1 && r1.code === 'use_not_granted', 'RED — the door before B-bc3b (another conversation refused before its grant is read): the SHARED conv-2 is refused — the share leg above goes red there', r1 && r1.code);
  // an admit on ANY verdict alone is still refused there by the no-card rule (each guard alone refuses conv-3 — the restack's tb
  // run showed the one-guard copy refusing): this RED takes BOTH away; the mixed-run RED below shows the no-card rule's own
  const SRC2 = anchored(SRC, '      if (!verdict.ok && verdict.ask && sharedIds.size) {', '      if (false) {', 'test-vault-run ② bc3b-anyrow (no card)');
  const anyRow = M.load('src/server/vault-run-door.js', anchored(SRC2, "if (!(v && v.ok === true)) { note('use_not_granted'", "if (!v) { note('use_not_granted'", 'test-vault-run ② bc3b-anyrow (any verdict)'), 'bc3b-anyrow');
  let r2 = null;
  if (anyRow) { const m = await shareWorld(anyRow); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); r2 = await m.runAs('conv-3', TO('api.example.com')); r2 = { code: r2.code, ok: r2.ok, cards: cardsOf(m.w).length }; }
  ok(!!anyRow && r2 && !(r2.code === 'use_not_granted' && !r2.cards), 'RED — a door that admits on ANY verdict (the row exists for someone) AND draws cards for a shared entry: conv-3, whom the row does not name, reaches a card naming it — the «only as the row says» leg goes red there', r2);
  const cardOk = patch('      if (!verdict.ok && verdict.ask && sharedIds.size) {', '      if (false) {', 'bc3b-card');
  let r3 = null;
  if (cardOk) { const m = await shareWorld(cardOk); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); m.door.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }); const x = await m.runAs('conv-2', MIXED); r3 = { code: x.code, cards: cardsOf(m.w).length + (m.w.userTodos.snapshot().resolved || []).filter((i) => i.action && i.action.type === 'vault-run-ask').length }; }
  ok(!!cardOk && r3 && r3.cards > 0, 'RED — the door without «never a card for a shared entry»: the mixed run DRAWS a card naming the shared entry (where «Always» would widen the share)', r3);
}

console.log('③ THE CARD — a NEW shape draws the card; cluster asks every time, local allows a SEEN shape; «always»');
/** THE LEG the card mutant is judged by: a NEW shape on a LOCAL instance (the default that allows) must draw the card. */
async function newShapeCards(doorMod) {
  const w = await world({ doorMod });
  openRow(w);
  const { r, card } = await runAnswered(w, ENV('env'), { answer: 'once' });
  return { card: !!card, ran: !!(r && r.ok), by: r && r.by };
}
{
  const local = await newShapeCards(DOOR);
  ok(local.card && local.ran && local.by === 'once', 'a NEW shape draws the card on a LOCAL instance (decision ②: a local instance allows only after one 允许) — answered once, it ran', local);
  const w = await world();
  openRow(w);
  const first = await runAnswered(w, ENV('env'));
  const it = first.card;
  ok(!!it && it.urgency === 'urgent' && it.text === 'Lane X wants to run a command with a stored secret' && it.detail.split('\n')[0].includes(PRINTER) && /Secrets: vault:\/\/mounts\/m1\/secretKey/.test(it.detail) && /Given as: env:T/.test(it.detail) && /Folder: /.test(it.detail) && /This shape = this whole command line/.test(it.detail) && /«Always» is not offered: an interpreter/.test(it.detail) && it.action.always === false,
    'the card: urgent, the asking conversation by name, the WHOLE run (the command with its references, the secrets, how each is given, the folder, what this shape means) — an interpreter offers no «always»', it && it.detail);
  ok(!leaks(JSON.stringify(it), VALUE).length, 'the card carries no byte of the value (its text, detail and action)');
  const again = await runAnswered(w, ENV('env'));
  ok(again.r.ok && again.r.by === 'seen' && !again.card, 'LOCAL: the same shape again runs without a card (seen this unlock — still scrubbed, still audited)', [again.r.by, !!again.card]);
  const other = await runAnswered(w, ENV('env', 'extra-arg'));
  ok(!!other.card && other.r.ok && other.r.by === 'once', 'LOCAL: an interpreter\'s other command line is a NEW shape ⇒ the card again', [!!other.card, other.r.by]);
  // «always»: a known tool naming a host (the fake curl)
  const CURLARGS = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/items'];
  const c1 = await runAnswered(w, CURLARGS, { answer: null });
  ok(!!c1.card && c1.card.action.always === true && /Hosts: api\.example\.com/.test(c1.card.detail) && /the tool \+ its flags \+ the hosts \+ the secrets; positional arguments may change/.test(c1.card.detail), 'a known tool naming a host: the card offers «always» and says what this shape is (tool + flags + hosts + secrets; positionals may change)', c1.card && c1.card.detail);
  const noRe = w.door.answer(c1.card.action.askId, { answer: 'always' });
  ok(noRe.code === 'reveal_needs_password' && cardsOf(w).length === 1, '«always» WITHOUT 验证是你 ⇒ reveal_needs_password — the card stays up', noRe);
  const yes = w.door.answer(c1.card.action.askId, { answer: 'always', reauthed: true });
  const c1r = await c1.r;
  ok(yes.ok && yes.outcome === 'always' && yes.ttl === '30d' && c1r.ok && c1r.by === 'always' && /curl got \[vault:mounts\/m1\/secretKey\]/.test(c1r.stdout), '«always» WITH it (30 days, the default) ⇒ it ran, scrubbed', [yes, c1r.by]);
  const c2 = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/other']);
  ok(c2.r.ok && c2.r.by === 'always' && !c2.card, 'the same shape with another positional runs without a card (by «always»)', [c2.r.by, !!c2.card]);
  const c3 = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://elsewhere.example.net/x'], { answer: 'deny' });
  ok(!!c3.card && c3.r.code === 'ask_denied', 'another HOST is another shape ⇒ the card; Deny ⇒ ask_denied, nothing ran', [!!c3.card, c3.r.code]);
  const st = JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8'));
  ok(st.always.length === 1 && st.always[0].conv === 'conv-1' && typeof st.mark === 'string' && st.mark.length === 64 && !leaks(JSON.stringify(st), VALUE).length, 'the «always» is kept in data/vault-run.json under the vault\'s mark — the conversation and the shape key, never a value', st);
  const sh = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'bash', '-c', 'curl https://api.example.com'], { answer: null });
  const shAlways = w.door.answer(sh.card.action.askId, { answer: 'always', reauthed: true });
  w.door.answer(sh.card.action.askId, { answer: 'deny' }); await sh.r;
  ok(sh.card.action.always === false && shAlways.code === 'always_not_offered', 'a SHELL\'s card offers no «always» (its whole script is its shape) — asked for anyway ⇒ always_not_offered', shAlways);
  // CLUSTER: asks EVERY time
  const cw = await world({ instance: 'cluster' });
  openRow(cw);
  const k1 = await runAnswered(cw, ENV('env')), k2 = await runAnswered(cw, ENV('env'));
  ok(!!k1.card && !!k2.card && k1.r.ok && k2.r.ok && k2.r.by === 'once', 'CLUSTER: a new shape asks, and the SAME shape asks AGAIN (decision ②: every run asks by default)', [!!k1.card, !!k2.card, k2.r.by]);
  // the card closed by another door / a changed item / no answer / a second run / the caller gone
  const d1 = cw.door.run({ caller: cw.caller, args: ENV('env', 'closed'), cwd: cw.work });
  const it1 = await waitCard(cw);
  // lane wake-approve-card r3: A DECISION ROW HAS ITS OWN VERBS — the ✓ on the row / Mark all seen are refused BY NAME (the run
  // still waits on its card), its own Deny ends it
  let cc1 = null; try { cw.userTodos.setStatus(it1.id, 'done', 'user'); } catch (x) { cc1 = x.code; }
  const m1 = cw.userTodos.setStatusMany([it1.id], 'dismissed', 'user');
  ok(cc1 === 'decision_row' && m1.changed.length === 0 && m1.decisions.includes(it1.id) && cw.userTodos.get(it1.id).status === 'open', 'the card closed by another door (the ✓ on the row, Mark all seen) ⇒ refused BY NAME (decision_row) / passed by — the run still waits on its card', { cc1, m1 });
  cw.door.answer(it1.action.askId, { answer: 'deny', person: true });
  const d1r = await d1;
  const r1 = cw.userTodos.get(it1.id);
  ok(d1r.code === 'ask_denied' && r1.resolvedBy === 'denied' && r1.resolvedFact && r1.resolvedFact.decidedBy === 'person', 'its own Deny (the person\'s) ⇒ ask_denied, nothing ran; the record «denied» with the person\'s mark', { code: d1r.code, by: r1.resolvedBy, fact: r1.resolvedFact });
  const d2 = cw.door.run({ caller: cw.caller, args: ENV('env', 'changed'), cwd: cw.work });
  const it2 = await waitCard(cw);
  const held = cw.userTodos._state.items.find((x) => x.id === it2.id); held.detail = held.detail.replace('changed', 'Changed');
  const d2a = cw.door.answer(it2.action.askId, { answer: 'once' });
  const d2r = await d2;
  ok(d2a.code === 'ask_changed' && d2r.code === 'ask_changed', 'an Allow on an item whose detail changed after it was shown ⇒ ask_changed, nothing ran (the belt)', [d2a.code, d2r.code]);
  const d3 = cw.door.run({ caller: cw.caller, args: ENV('env', 'twice'), cwd: cw.work });
  await waitCard(cw);
  const d3b = await cw.door.run({ caller: cw.caller, args: ENV('env', 'twice'), cwd: cw.work });
  ok(d3b.code === 'ask_pending' && cardsOf(cw).length === 1, 'a second run of a shape whose card is up ⇒ ask_pending (one card per conversation × shape)', d3b.code);
  const it3 = cardsOf(cw)[0]; cw.door.answer(it3.action.askId, { answer: 'deny' }); await d3;
  const ac = new AbortController();
  const d4 = cw.door.run({ caller: cw.caller, args: ENV('env', 'gone'), cwd: cw.work, signal: ac.signal });
  const it4 = await waitCard(cw); ac.abort();
  const d4r = await d4;
  ok(d4r.code === 'caller_gone' && !cardsOf(cw).length && cw.userTodos.get(it4.id).status !== 'open', 'the caller went away while its card waited ⇒ caller_gone, the card closes', d4r.code);
  const ew = await world({ instance: 'cluster', askMs: 80 });
  openRow(ew);
  const ex = await runAnswered(ew, ENV('env'), { answer: null });
  const exR = await ex.r;
  const lateCard = cardsOf(ew)[0];
  ok(exR.code === 'ask_expired' && !!lateCard && lateCard.status === 'open' && lateCard.action.late === true && typeof lateCard.action.lateAt === 'number' && typeof lateCard.action.shapeId === 'string' && lateCard.expiresAt === lateCard.action.lateAt + DOOR.LATE_TTL_MS,
    'round 20b (the owner ruled A): no answer in 60 s ⇒ the COMMAND is ask_expired (nothing ran), but the CARD stays OPEN as `late` (action.late/lateAt/shapeId; expiresAt → +24 h) — on 54f757df the item vanished', { code: exR.code, late: lateCard && lateCard.action });
  // a late «allow once» writes a one-run pass: the NEXT identical run passes ONCE with no card (by: late), audited; the same shape after that asks again; a late card offers no «always»
  ok(ew.door.answer(lateCard.action.askId, { answer: 'always', reauthed: true }).code === 'always_not_offered', 'round 20b: a late card offers no «always» (allow once / deny only)');
  const la = ew.door.answer(lateCard.action.askId, { answer: 'once' });
  const settledLate = ew.userTodos.get(lateCard.id);
  ok(la.ok && la.outcome === 'late-allowed' && !cardsOf(ew).length && settledLate.status === 'done' && settledLate.resolvedBy === 'allowed' && settledLate.resolvedFact && settledLate.resolvedFact.late === true && settledLate.resolvedFact.decidedBy === 'person', 'round 23 (MAJOR #5): a late «allow once» settles resolvedBy="allowed" + resolvedFact {late:true, decidedBy:"person"} — the SHAPE wake-approve-card 2a5e9ce8 reads (on 4ff55fb4 it was resolvedBy="user", outcome in resolvedFact ⇒ the client rendered «settled»)', [la, settledLate.resolvedBy, settledLate.resolvedFact]);
  const otherShape = await runAnswered(ew, ENV('env', 'a-different-shape'), { answer: 'deny' });
  ok(!!otherShape.card && !otherShape.card.action.late && otherShape.r.code === 'ask_denied', 'round 20b: a DIFFERENT shape still asks (its own card) — the late pass is for the one shape', [!!otherShape.card, otherShape.r.code]);
  const pass1 = await runAnswered(ew, ENV('env'), { answer: null });
  const pass1R = await pass1.r;
  ok(pass1R.ok && pass1R.by === 'late' && !pass1.card && /vault-run-late-allow/.test(auditOf(ew)), 'round 20b: the NEXT identical run passes ONCE with no card (by: late), the pass consumed and audited vault-run-late-allow', [pass1R.by, !!pass1.card]);
  const reRun = await runAnswered(ew, ENV('env'), { answer: null });
  ok(!!reRun.card && !reRun.card.action.late && reRun.card.action.askId !== lateCard.action.askId, 'round 20b: the pass is ONE run — the same shape after it draws a fresh LIVE card again (no standing pass)');
  ew.door.answer(reRun.card.action.askId, { answer: 'deny' }); await reRun.r;
  // a SECOND run while a late card is open ⇒ ask_pending, no second card, the open card's 24 h countdown restarts
  const sw = await world({ instance: 'cluster', askMs: 60 }); openRow(sw);
  const se = await runAnswered(sw, ENV('env'), { answer: null }); await se.r;
  const lc = cardsOf(sw)[0]; const at0 = lc.action.lateAt;
  await sleep(5);
  const sec = await sw.door.run({ caller: sw.caller, args: ENV('env'), cwd: sw.work });
  const lc2 = cardsOf(sw)[0];
  ok(sec.code === 'ask_pending' && cardsOf(sw).length === 1 && lc2.id === lc.id && lc2.action.lateAt === at0, 'round 23: a second run while the late card is open ⇒ ask_pending, the ONE card stays (no second card), and its 24 h does NOT extend — it counts from the FIRST expiry (an agent retrying cannot keep the card alive forever)', [sec.code, cardsOf(sw).length, lc2.action.lateAt === at0]);

  // round 23 (MAJOR #6, the CONFIRMED over-permit): a late «allow once» is for THIS EXACT command — a DIFFERENT command of the SAME shape draws its own card
  {
    const xw = await world({ instance: 'cluster', askMs: 60 }); openRow(xw);
    const CURL = (seg) => ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/api/' + seg];
    const statKey = VR.shapeKeyOf(VR.shapeOf(VR.planOf({ argv: ['curl', '-s', 'https://api.example.com/api/stat'], env: [['T', 'vault://mounts/m1/secretKey']] })));
    const delKey = VR.shapeKeyOf(VR.shapeOf(VR.planOf({ argv: ['curl', '-s', 'https://api.example.com/api/DELETE-everything'], env: [['T', 'vault://mounts/m1/secretKey']] })));
    ok(statKey === delKey, 'round 23 #6 (the premise): `curl …/api/stat` and `curl …/api/DELETE-everything` share ONE shape key — the shape abstracts the path, so a shape-keyed pass over-permits', [statKey === delKey]);
    const e1 = await runAnswered(xw, CURL('stat'), { answer: null }); await e1.r;   // the card for …/api/stat → no answer → late
    const c1 = cardsOf(xw)[0];
    const allow = xw.door.answer(c1.action.askId, { answer: 'once' });
    ok(allow.ok && allow.outcome === 'late-allowed', 'round 23 #6: the late card for `curl …/api/stat` is allowed once (a pass for THIS exact command)');
    const diff = await runAnswered(xw, CURL('DELETE-everything'), { answer: 'deny' });   // the ASK path (deny) — nothing spawns
    ok(!!diff.card && !diff.card.action.late && diff.r.code === 'ask_denied', 'round 23 (MAJOR #6, RED on 4ff55fb4): a DIFFERENT command of the SAME shape (`…/api/DELETE-everything`) draws its OWN live card — the pass is keyed on the EXACT command (exactKeyOf), never the shape alone (4ff55fb4 let the DELETE run by:late on a pass minted for stat)', [!!diff.card, diff.r.code]);

    ok(xw.door._lateOnce.size === 1, 'round 23 #6: the pass for `…/api/stat` is UNTOUCHED by the different-command run (it is still there for its own exact command)', xw.door._lateOnce.size);
  }

  // round 25 (minor 6b): a near-identical rerun's card NAMES the ONE difference from the last late-allowed command (facts.whyAgain — a CODE the client renders). RED on a1f79c42: the rerun drew a card but named no reason. A capturing store keeps `facts` (this tree's real store drops an unknown field, r20).
  {
    const items = new Map(); let n = 0; const subs = [];
    const store = {
      add: (k, v) => { const id = 'b' + (++n); items.set(id, { id, status: 'open', ...v }); return { id }; },
      get: (id) => { const it = items.get(id); return it ? { ...it } : null; },
      setStatus: (id, st, by) => { const it = items.get(id); if (it) { it.status = st; subs.forEach((f) => { try { f({ ...it }, { status: st, by }); } catch {} }); } },
      resolveAnswered: (ids, outcome, fact) => { for (const id of ids) { const it = items.get(id); if (it) { it.status = 'done'; it.resolvedBy = outcome; it.resolvedFact = fact; } } },
      reshapeItems: (fn) => { for (const it of items.values()) { try { fn(it); } catch {} } },
      snapshot: () => ({ open: [...items.values()].filter((x) => x.status === 'open').map((x) => ({ ...x })) }),
      onStatus: (f) => subs.push(f),
    };
    const bw = await world({ instance: 'cluster', askMs: 60 });
    // B-7f97: THE VERDICT DOES NOT FOLLOW THE MACHINE'S TEMP FOLDER — this door is given a temp folder of its own (as a test
    // machine's private TMPDIR /tmp/vt-XXXXXX gives it), and the rerun's folder is INSIDE the conversation's project folder, which
    // the fence admits wherever the temp folder is; the folder BESIDE it (the leg as it was) was admitted only through the door's
    // default os.tmpdir() = /tmp, the scratch root's parent — under a private TMPDIR it was refused cwd_refused and no card came
    const privTmp = path.join(bw.dir, 'private-tmp'); fs.mkdirSync(privTmp, { recursive: true });
    const bd = bw.mk(DOOR, { userTodos: store, tmpDir: privTmp });
    bd.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });   // open the entry for runs (the capStore door shares the vault with world)
    const other = path.join(bw.work, 'elsewhere'); fs.mkdirSync(other, { recursive: true });
    const A = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/api/stat'];
    const openAsk = () => store.snapshot().open.find((x) => x.action && x.action.type === 'vault-run-ask');
    let dA = false; const pA = bd.run({ caller: bw.caller, args: A, cwd: bw.work }).then((r) => (dA = true, r));
    for (let i = 0; i < 400 && !openAsk(); i++) await sleep(5);
    await pA;   // askMs 60 ⇒ A is refused ask_expired and its card goes `late`
    const late = store.snapshot().open.find((x) => x.action && x.action.late);
    bd.answer(late.action.askId, { answer: 'once' });   // mint a pass for A's EXACT command (carrying A's parts)
    let dB = false; const pB = bd.run({ caller: bw.caller, args: A, cwd: other }).then((r) => (dB = true, r));   // the SAME command in a DIFFERENT folder (same shape key, different exact)
    let cb = null; for (let i = 0; i < 400 && !cb; i++) { cb = store.snapshot().open.find((x) => x.action && x.action.type === 'vault-run-ask' && !x.action.late && x.facts); if (!cb) await sleep(5); }
    if (cb) bd.answer(cb.action.askId, { answer: 'deny' });
    await pB;
    const wa = cb && cb.facts && cb.facts.whyAgain;
    ok(!!cb && !!wa && wa.code === 'folder', 'round 25 (minor 6b): the SAME command rerun in a DIFFERENT folder draws a card whose facts.whyAgain names the one difference (folder) — a1f79c42 drew the card but named no reason', { card: !!cb, whyAgain: wa });
    const beside = path.join(bw.dir, 'elsewhere'); fs.mkdirSync(beside, { recursive: true });
    const asWas = await bd.run({ caller: bw.caller, args: A, cwd: beside });
    ok(asWas.code === 'cwd_refused', 'CONTROL B-7f97: the folder BESIDE the project (the leg as it was) under that temp folder is refused cwd_refused — no card, no reason: the leg stood on the machine\'s TMPDIR (red)', asWas.code);
  }

  // round 26 (minor): a rerun that differs ONLY by SPACING (same tokens, same order) names 'arg-space', not 'arg-order'. RED on 75ef16b09: arg-order was tested first and a spacing-only rerun has equal sorted word-lists too, so 'arg-space' was unreachable (the card said 参数顺序 for a pure spacing change).
  {
    const items = new Map(); let n = 0; const subs = [];
    const store = {
      add: (k, v) => { const id = 'b' + (++n); items.set(id, { id, status: 'open', ...v }); return { id }; },
      get: (id) => { const it = items.get(id); return it ? { ...it } : null; },
      setStatus: (id, st, by) => { const it = items.get(id); if (it) { it.status = st; subs.forEach((f) => { try { f({ ...it }, { status: st, by }); } catch {} }); } },
      resolveAnswered: (ids, outcome, fact) => { for (const id of ids) { const it = items.get(id); if (it) { it.status = 'done'; it.resolvedBy = outcome; it.resolvedFact = fact; } } },
      reshapeItems: (fn) => { for (const it of items.values()) { try { fn(it); } catch {} } },
      snapshot: () => ({ open: [...items.values()].filter((x) => x.status === 'open').map((x) => ({ ...x })) }),
      onStatus: (f) => subs.push(f),
    };
    const bw = await world({ instance: 'cluster', askMs: 60 });
    const bd = bw.mk(DOOR, { userTodos: store });
    bd.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });
    const A = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', '-H', 'X-A: 1', 'https://api.example.com/api/stat'];
    const A2 = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', '-H', 'X-A:  1', 'https://api.example.com/api/stat'];   // the SAME header, one extra space in its value (same shape key, exact argv differs only by spacing)
    const openAsk = () => store.snapshot().open.find((x) => x.action && x.action.type === 'vault-run-ask');
    const pA = bd.run({ caller: bw.caller, args: A, cwd: bw.work });
    for (let i = 0; i < 400 && !openAsk(); i++) await sleep(5);
    await pA;
    const late = store.snapshot().open.find((x) => x.action && x.action.late);
    bd.answer(late.action.askId, { answer: 'once' });
    const pB = bd.run({ caller: bw.caller, args: A2, cwd: bw.work });
    let cb = null; for (let i = 0; i < 400 && !cb; i++) { cb = store.snapshot().open.find((x) => x.action && x.action.type === 'vault-run-ask' && !x.action.late && x.facts); if (!cb) await sleep(5); }
    if (cb) bd.answer(cb.action.askId, { answer: 'deny' });
    await pB;
    const wa = cb && cb.facts && cb.facts.whyAgain;
    ok(!!cb && !!wa && wa.code === 'arg-space', 'round 26 (minor): a rerun differing ONLY by spacing names facts.whyAgain=arg-space (not arg-order) — arg-space is now tested before arg-order', { card: !!cb, whyAgain: wa });
  }

  // round 23 (MAJOR #5): the settled late record read by wake-approve-card 2a5e9ce8's own reader (copied) — a late allow stamps «allowed:late», a deny «denied by person», the vault's 24 h / lock stamp NOTHING (decidedBy ≠ person)
  {
    const wakeStamp = (rec) => { const by = rec.resolvedBy, fact = rec.resolvedFact; if (!fact || fact.decidedBy !== 'person') return null; return by === 'allowed' && fact.late === true ? 'allowed:late' : by; };
    const aw = await world({ instance: 'cluster', askMs: 60 }); openRow(aw);
    const ae = await runAnswered(aw, ENV('env'), { answer: null }); await ae.r;
    const ac = cardsOf(aw)[0];
    aw.door.answer(ac.action.askId, { answer: 'once' });
    const allowedRec = aw.userTodos.get(ac.id);
    const dw = await world({ instance: 'cluster', askMs: 60 }); openRow(dw);
    const de = await runAnswered(dw, ENV('env'), { answer: null }); await de.r;
    const dc = cardsOf(dw)[0];
    dw.door.answer(dc.action.askId, { answer: 'deny' });
    const deniedRec = dw.userTodos.get(dc.id);
    ok(wakeStamp(allowedRec) === 'allowed:late' && wakeStamp(deniedRec) === 'denied' && wakeStamp({ resolvedBy: 'expired', resolvedFact: { late: true, decidedBy: null } }) === null && wakeStamp({ resolvedBy: 'vault_locked', resolvedFact: { late: true, decidedBy: null } }) === null,
      'round 23 (MAJOR #5): fed to wake-approve-card 2a5e9ce8’s reader, a late allow stamps «allowed:late», a late deny «denied», and the vault’s 24 h / lock stamp NOTHING (decidedBy ≠ person) — the two lanes cannot drift', [wakeStamp(allowedRec), wakeStamp(deniedRec)]);
  }

  // round 23 (MINOR): a late «allow once» for an ENDED conversation mints NO pass — conversation_gone (as the live path refuses)
  {
    const gw = await world({ askMs: 60 }); let live = true;
    const gd = gw.mk(DOOR, { liveOf: () => live });
    openRow(gw);
    const ge = await runAnswered(gw, ENV('env'), { answer: null, door: gd }); await ge.r;
    const gc = cardsOf(gw)[0];
    live = false;
    const ans = gd.answer(gc.action.askId, { answer: 'once' });
    const goneRec = gw.userTodos.get(gc.id);
    ok(ans.ok === false && ans.code === 'conversation_gone' && gd._lateOnce.size === 0 && goneRec.status === 'done' && goneRec.resolvedBy === 'conversation-gone' && goneRec.resolvedFact && goneRec.resolvedFact.decidedBy === null, 'round 23 + round 25 (minor 6c): a late «allow once» for an ENDED conversation mints NO pass (conversation_gone) AND the item settles resolvedBy="conversation-gone" + decidedBy null — the end wake-approve-card reads, not "denied" (a1f79c42: settled "denied")', { ans, by: goneRec.resolvedBy, fact: goneRec.resolvedFact });
  }

  // the card closed by another door — the gate's words, again on a LOCAL instance
  const lw = await world();
  openRow(lw);
  const l1 = lw.door.run({ caller: lw.caller, args: ENV('ran', path.join(lw.work, 'ran.txt')), cwd: lw.work });
  const li = await waitCard(lw); let liCode = null; try { lw.userTodos.setStatus(li.id, 'dismissed', 'user'); } catch (x) { liCode = x.code; }   // int361: wake-approve-card's leg in vault-agent-own's late-card scope (its `lc` is the late card) — renamed
  lw.door.answer(li.action.askId, { answer: 'deny' });   // r3: the ✕ is refused by name; its own Deny ends it
  ok(liCode === 'decision_row' && (await l1).code === 'ask_denied' && !fs.existsSync(path.join(lw.work, 'ran.txt')), 'the card\'s ✕ refused by name on a local instance, its Deny ends it: nothing ran (the child never started)', liCode);
}

console.log('⑫ THE CARD FACTS (lane vault-agent-own r20; the owner «这个卡片的可读性很差») — the door hands the For-you record a structured `facts` (codes, never prose); `detail` stays as today');
{
  const w = await world(); openRow(w);
  const EQ = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const CURLARGS = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/items'];
  // a capturing For-you store: it records the RAW item the door hands add() (this tree's real store drops an unknown `facts`
  // field — lane wake-approve-card's user-todos.js keeps it — so the door's wiring is proven here, not via the stored item)
  const added = [];
  const capStub = { add: (k, v) => { added.push(v); return { id: 'cap-' + added.length }; }, get: () => null, setStatus: () => {}, snapshot: () => ({ open: [] }), onStatus: () => {} };
  const capDoor = w.mk(DOOR, { userTodos: capStub });
  const ac = new AbortController();
  const p = capDoor.run({ caller: w.caller, args: CURLARGS, cwd: w.work, signal: ac.signal });
  let it = null; const t0 = Date.now();
  while (!it && Date.now() - t0 < 3000) { it = added.find((x) => x.action && x.action.type === 'vault-run-ask'); if (!it) await sleep(5); }
  const f = it && it.facts;
  ac.abort(); await p.catch(() => {});
  ok(!!f && f.v === 2 && f.who === 'Lane X' && f.tool.name === 'curl' && f.tool.writable === false && typeof f.cmd === 'string' && f.cmd.includes('curl') && f.cmd.includes('https://api.example.com/v1/items')
    && f.shape === 'tool' && f.masking === 'common-encodings' && f.hosts.known === true && EQ(f.hosts.list, ['api.example.com']) && f.always.offered === true && f.always.why === null && f.always.directive === null
    && Array.isArray(f.env) && f.reason && f.reason.notOwn === true && f.reason.away.length === 0
    && f.secrets.length === 1 && f.secrets[0].entry === 'm1' && f.secrets[0].name === 'my bucket' && f.secrets[0].ref === 'vault://mounts/m1/secretKey' && EQ(f.secrets[0].as, { kind: 'env', name: 'T' }) && f.secrets[0].provenance === 'granted' && f.secrets[0].sendsTo === null,
    'round 23: the door hands userTodos.add a structured `facts` (v2) beside `detail`: who, tool, the RAW command (the agent\'s own bytes shown, value-based), the secret\'s { kind, name }+provenance, plain env, reason, hosts, «always», masking — codes, never prose', f);
  ok(!!f && !leaks(JSON.stringify(f), VALUE).length, 'the facts carry no byte of the value — a reference, a display name and a host are not the secret');
  // r27 (by lane wake-approve-card — its r11 acceptance): a run in a LONG working folder — the door's facts carry the folder's
  // whole through the producer's clipFold (folderCut + folderFull; b034bdf64: clipped to 2 000 with no marker, its tail lost)
  { const deep = path.join(w.work, ...Array.from({ length: 140 }, (_, k) => `nested-level-${String(k).padStart(3, '0')}-dir`));
    fs.mkdirSync(deep, { recursive: true });
    const before = added.length, ac2 = new AbortController();
    const p2 = capDoor.run({ caller: w.caller, args: CURLARGS, cwd: deep, signal: ac2.signal });
    let it2 = null; const t2 = Date.now();
    while (!it2 && Date.now() - t2 < 3000) { it2 = added.slice(before).find((x) => x.action && x.action.type === 'vault-run-ask'); if (!it2) await sleep(5); }
    const f2 = it2 && it2.facts;
    ac2.abort(); await p2.catch(() => {});
    const whole = f2 && Array.isArray(f2.folderFull) ? f2.folderFull.join('') : '';
    ok(!!f2 && deep.length > VR.CARD_STRING_MAX && f2.folder.length === VR.CARD_STRING_MAX && f2.folderCut === true && whole.length > VR.CARD_STRING_MAX && whole.endsWith('/nested-level-139-dir') && f2.folderFull.every((c) => c.length <= VR.CARD_STRING_MAX),
      `r27 (by wake-approve-card): a run in a ${deep.length}-character folder — the door's facts carry folderCut + a folderFull that ends at the folder's own tail (b034bdf64: «folder» clipped to ${VR.CARD_STRING_MAX}, no marker, the tail nowhere)`, f2 && { folder: f2.folder.length, cut: f2.folderCut, whole: whole.length }); }
  ok(!!f && (f.always.why === null || VR.ALWAYS_WHY.includes(f.always.why)) && (f.hosts.known || VR.HOSTS_WHY.includes(f.hosts.why)) && VR.MASKING.includes(f.masking) && VR.CARD_SHAPES.includes(f.shape) && f.secrets.every((x) => ['env', 'file', 'stdin', 'arg'].includes(x.as.kind)),
    'every code the door emits is a member of its exported table (the keys wake-approve-card r7 must carry: always.why ∈ ALWAYS_WHY, hosts.why ∈ HOSTS_WHY, masking ∈ MASKING, shape ∈ CARD_SHAPES, as.kind ∈ env/file/stdin/arg)');
  // DETAIL UNCHANGED (the control): the real For-you record keeps today's prose `detail` byte-for-byte — a change to detail (e.g. replacing it with `facts`) fails here and in ③; facts is ADDITIVE
  const real = await runAnswered(w, CURLARGS, { answer: 'deny' });
  const rc = real.card;
  ok(!!rc && /^curl /.test(rc.detail.split('\n')[0]) && /Hosts: api\.example\.com/.test(rc.detail) && /the tool \+ its flags \+ the hosts \+ the secrets; positional arguments may change/.test(rc.detail) && /Folder: /.test(rc.detail),
    'detail stays as today for older clients: the For-you record keeps the full prose `detail` (the command, the hosts, the shape, the folder) unchanged — facts is an ADDITIVE field, never a replacement', rc && rc.detail);
}

console.log('⑬ THE LATE CARD past its life — the 24 h end (said), the lock, the boot reconcile (lane vault-agent-own r20b)');
{
  // the 24 h: a late card with no answer settles from `late` to expired (SAID, not silent) — status done, resolvedFact outcome 'expired'
  const w = await world({ instance: 'cluster', askMs: 40, lateMs: 80 }); openRow(w);
  const e = await runAnswered(w, ENV('env'), { answer: null }); await e.r;
  const card = cardsOf(w)[0];
  ok(!!card && card.action.late, 'the card went late');
  const t = Date.now(); while (Date.now() - t < 400) { const it = w.userTodos.get(card.id); if (it.status !== 'open') break; await sleep(10); }
  const done = w.userTodos.get(card.id);
  ok(done.status === 'done' && done.resolvedBy === 'expired' && done.resolvedFact && done.resolvedFact.late === true && done.resolvedFact.decidedBy === null && !w.door._lateAsks.size, 'round 23 (MAJOR #5): a late card unanswered for 24 h settles resolvedBy="expired" + resolvedFact {late:true, decidedBy:null} (the vault, not a person) and the in-memory late ask is gone', { status: done.status, by: done.resolvedBy, fact: done.resolvedFact });

  // a late DENY settles the card denied; the next run asks (no pass)
  const wd = await world({ instance: 'cluster', askMs: 40 }); openRow(wd);
  const ed = await runAnswered(wd, ENV('env'), { answer: null }); await ed.r;
  const dc = cardsOf(wd)[0];
  const dr = wd.door.answer(dc.action.askId, { answer: 'deny' });
  ok(dr.ok && dr.outcome === 'denied' && !cardsOf(wd).length && !wd.door._lateOnce.size, 'round 20b: a late «deny» settles the card denied, writes no pass');
  const next = await runAnswered(wd, ENV('env'), { answer: 'deny' });
  ok(!!next.card && next.r.code === 'ask_denied', 'round 20b: after a late deny the same shape asks again (no standing pass)');

  // a LOCK ends every late pass and settles every open late card vault_locked (as it does shortAlways)
  const wl = await world({ instance: 'cluster', askMs: 40 }); openRow(wl);
  const a1 = await runAnswered(wl, ENV('env'), { answer: null }); await a1.r;   // a late card, then ALLOWED -> a pass waiting to be consumed
  wl.door.answer(cardsOf(wl)[0].action.askId, { answer: 'once' });
  const a2 = await runAnswered(wl, ENV('env', 'two'), { answer: null }); await a2.r;   // a late card left UNANSWERED
  const openLate = cardsOf(wl)[0];
  ok(wl.door._lateAsks.size === 1 && wl.door._lateOnce.size === 1 && openLate.action.askId === a2.card.action.askId, 'one unanswered late card + one late pass');
  wl.door.onLocked('test');
  const lockedItem = wl.userTodos.get(openLate.id);
  ok(!wl.door._lateAsks.size && !wl.door._lateOnce.size && lockedItem.status === 'done' && lockedItem.resolvedBy === 'vault_locked' && lockedItem.resolvedFact && lockedItem.resolvedFact.late === true && lockedItem.resolvedFact.decidedBy === null, 'round 23 (MAJOR #5): a LOCK settles every open late card resolvedBy="vault_locked" + resolvedFact {late:true, decidedBy:null} and ends every late pass (as it does shortAlways)', { lateAsks: wl.door._lateAsks.size, lateOnce: wl.door._lateOnce.size, by: lockedItem.resolvedBy, fact: lockedItem.resolvedFact });

  // the BOOT reconcile KEEPS a late card (the owner may still allow one run); a LIVE card a dead process left is settled ask-expired
  const wr = await world({ instance: 'cluster', askMs: 40 }); openRow(wr);
  const er = await runAnswered(wr, ENV('env'), { answer: null }); await er.r;   // -> a late card
  const lateId = cardsOf(wr)[0].id;
  const fake = wr.userTodos.add(wr.caller.sessionKey, { origin: 'vault', text: 'x', urgency: 'urgent', kind: 'action', by: 'agent', action: { type: 'vault-run-ask', askId: 'reconcile-live-fake', always: false } });   // an open vault-run-ask card a dead process left (no backing q, not late)
  const fresh = wr.mk();   // a NEW door over the SAME For-you store — a restart
  fresh.reconcile();
  const keptLate = wr.userTodos.get(lateId), deadLive = wr.userTodos.get(fake.id);
  ok(keptLate.status === 'open' && keptLate.action.late === true && fresh._lateAsks.size === 1 && deadLive.status === 'done' && deadLive.resolvedBy === 'ask-expired', 'round 20b: the boot reconcile KEEPS a late card open (re-registered, still answerable) while a LIVE card a dead process left is settled ask-expired', { late: keptLate.status, live: deadLive.status, lateAsks: fresh._lateAsks.size })
}

console.log('⑭ THE RUN OUTPUT IS VALUE-ONLY (lane vault-agent-own r21; fb-93219e801a) — the injected values go, the tool\'s own named fields stay, no byte dropped');
{
  const w = await world(); openRow(w);
  const j = await runAnswered(w, ENV('json'), { answer: 'once' });
  const out = (await j.r).stdout || '';
  ok(/"key":"deadbeefcafef00dba5eba11"/.test(out) && /"use_auth":false/.test(out) && /"ok":true\}/.test(out) && out.trim().endsWith('}'), 'round 21: the tool\'s OWN fields named key / use_auth survive and the one-line JSON is WHOLE (ends "ok":true}) — the value scrubber never name-redacts, never swallows (54f757df redacted key/auth by name and cut the JSON to 1008 bytes)', out.slice(0, 160));
  ok(/"auth":"\[vault:/.test(out) && /"raw":"\[vault:/.test(out) && !leaks(out, VALUE).length, 'round 21: the INJECTED value (raw AND base64) is redacted to [vault:…] in both fields — the value scrubber masks the values and their encodings, nothing of the value leaks', out.slice(0, 200));

  // the held-tail flush on a CUT (the value across the 2 MiB bound): the tail is FLUSHED scrubbed (tailDropped false now), the value never leaks
  const bw = await world(); openRow(bw);
  const e = await runAnswered(bw, ENV('edge'), { answer: 'once' });
  const er = await e.r;
  ok(er.truncated === true && (er.stdout || '').endsWith('[vault:\u2026]') && !leaks((er.stdout || '').slice(-400), VALUE).length, 'round 21 («never drop a byte»): a CUT stream FLUSHES its held tail SCRUBBED (it ends with the [vault:…] placeholder, not a silent drop) and the value split by the 2 MiB cut never leaks', { truncated: er.truncated, tail: (er.stdout || '').slice(-30) });

  // RED CONTROL (the 54f757df behaviour): a door that runs the name-based redactLong over the run output over-redacts the tool's fields and/or swallows the one-line JSON
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const FROM = "const outT = { text: parts.out.join(''), redacted: 0 }, errT = { text: parts.err.join(''), redacted: 0 };";
  const nm = SRC.split(FROM).length - 1;
  const mod = nm === 1 ? M.load('src/server/vault-run-door.js', editAnchor(SRC, FROM, "const outT = redactLong(parts.out.join('')), errT = redactLong(parts.err.join(''));", "src/server/vault-run-door.js"), 'nameredact') : null;
  let mout = null;
  if (mod) { const mw = await world({ doorMod: mod }); openRow(mw); const mj = await runAnswered(mw, ENV('json'), { answer: 'once' }); mout = (await mj.r).stdout || ''; }
  ok(nm === 1 && mout && (/"key":"«redacted»"/.test(mout) || !/"ok":true\}/.test(mout)), 'MUTANT «the name-based pass runs over the run output» (the 54f757df behaviour): the patch hits once and the leg goes RED — the tool\'s key field is name-redacted and/or the one-line JSON is swallowed; the shipped door leaves them whole', { keyRedacted: /"key":"«redacted»"/.test(mout || ''), whole: /"ok":true\}/.test(mout || '') });
}

console.log('④ THE LOCK — a lock mid-run ends the child within its bound; the answer is vault_locked');
{
  const w = await world({ killGraceMs: 400 });
  openRow(w);
  const pidFile = path.join(w.work, 'pid.txt');
  const p = runAnswered(w, ENV('hang', pidFile));
  let pid = null; const t0 = Date.now();
  while (!pid && Date.now() - t0 < 5000) { try { pid = Number(fs.readFileSync(pidFile, 'utf8')) || null; } catch { } await sleep(10); }
  ok(!!pid && alive(pid) && runDirs(w).length === 1, 'the child (deaf to SIGTERM) runs, its run folder beside it', pid);
  const armed = w.timerLog.length;
  w.vault.lock('door');
  const { r } = await p;
  const killed = runLines(w).find((x) => x.outcome === 'vault_locked' && x.killed === true);
  ok(r.code === 'vault_locked' && r.killed === true && /already been told/.test(r.words) && !alive(pid) && w.timerLog.slice(armed).includes(400) && killed && killed.signal === 'SIGKILL',
    'a LOCK mid-run: the child (deaf to SIGTERM) is GONE within its bound — the lock armed the 400 ms grace and the SIGKILL after it ended the child (its line says signal SIGKILL); the agent\'s answer is vault_locked (the user was told)', { code: r.code, killed: r.killed, signal: killed && killed.signal, alive: alive(pid), timers: w.timerLog.slice(armed) });
  ok(!runDirs(w).length && !!killed, 'its run folder is gone; its audit line says vault_locked, killed');
  ok(JSON.stringify(w.vault.blockedSummary()).includes('Lane X'), 'the owner\'s For-you list of who the lock stopped names the conversation (the vault\'s one helper)', w.vault.blockedSummary());
  const lockedRun = await w.door.run({ caller: w.caller, args: ENV('env'), cwd: w.work });
  ok(lockedRun.code === 'vault_locked' && !cardsOf(w).length, 'a LOCKED vault refuses a run FIRST — no card, nothing read', lockedRun.code);
  // a lock with a card up
  await w.vault.unlock(PW);
  const c = w.door.run({ caller: w.caller, args: ENV('env', 'card-up'), cwd: w.work });
  await waitCard(w);
  w.vault.lock('agent');
  ok((await c).code === 'vault_locked' && !cardsOf(w).length, 'a lock while a card is up settles it: vault_locked, the card closes');
  await w.vault.unlock(PW);
  const after = await runAnswered(w, ENV('env'));
  ok(!!after.card && after.r.ok, 'after the lock the SEEN shapes are forgotten — the same shape asks again (the lock ends the unlock\'s allowances)', [!!after.card, after.r.by]);
}

console.log('⑤ THE AUDIT — one line per run and refusal, never a value');
/** THE LEG the audit mutant is judged by: a run, then every byte the door wrote — the audit, the For-you store, its own store. */
async function auditClean(doorMod) {
  const w = await world({ doorMod });
  openRow(w);
  const { r } = await runAnswered(w, ENV('env'));
  const files = ['vault-audit.jsonl', 'user-todos.json', DOOR.STORE_FILE].map((f) => { try { return fs.readFileSync(path.join(w.dataDir, f), 'utf8'); } catch { return ''; } }).join('\n');
  return { ran: !!(r && r.ok), receipt: r && r.receipt, leaks: leaks(files, VALUE), lines: runLines(w) };
}
{
  const a = await auditClean(DOOR);
  const ran = a.lines.find((x) => x.outcome === 'ran');
  ok(a.ran && !a.leaks.length, 'every byte the door wrote (data/vault-audit.jsonl, data/user-todos.json, data/vault-run.json) — the oracle finds NO value', a.leaks);
  ok(!!ran && ran.by.kind === 'agent' && ran.by.name === 'Lane X' && ran.entries[0] === 'vault://mounts/m1/secretKey' && /^[0-9a-f]{16}$/.test(ran.shapeId) && ran.exit === 3 && ran.allowedBy === 'once' && ran.scrubbed.bytes > 0 && ran.scrubbed.hits > 0 && Array.isArray(ran.injection) && typeof ran.cmd === 'string' && typeof ran.ms === 'number' && /\[vault:mounts\/m1\/secretKey\]/.test(ran.stdout),
    'the run\'s line: the actor, the entries (references), the shape, the injection, the command, what allowed it, the exit code, the time, the scrubbed bytes, the scrubbed head of the output', ran);
  ok(/^vr-[0-9a-f]{16}$/.test(ran.receipt) && a.receipt === ran.receipt, 'the agent\'s answer and the audit line carry ONE receipt (design D1: a use + a receipt)', [a.receipt, ran.receipt]);
  ok(!('withheld' in ran.scrubbed), 'a run whose scrubbing stayed within its work bound carries no `withheld` on its line (主开发 r1216: the field is the fact, said only when met)', ran.scrubbed);
}
// THE OWNER'S RECORD OF THE WORK BOUND (主开发 r1216): a run whose scrubbing met its work bound says so — ONE field, `withheld:
// 'scrub_work_bound'`, on the audit line and in the answer. The door's own figure is out of a fast leg's reach (an ordinary output
// never meets it), so the door plants a turn's figure of 64 steps on its scrubber worker (its seam `scrubSteps`).
{
  const boundLeg = async (mod) => {
    const wb = await world({ doorMod: mod, doorExtra: SMALL }); openRow(wb);
    const { r } = await runAnswered(wb, ENV('env'));
    const ran = runLines(wb).find((x) => x.outcome === 'ran'), out = (r && (r.stdout || '') + (r.stderr || '')) || '';
    return { ok: !!(r && r.ok), said: out.includes('(scrub_work_bound)]'), answer: r && r.scrubbed ? r.scrubbed.withheld : null, line: ran && ran.scrubbed ? ran.scrubbed.withheld : null, leaks: leaks(out, VALUE).length, live: wb.door.scrubLive() };
  };
  const rb = await boundLeg(DOOR);
  ok(rb.ok && rb.said && rb.answer === 'scrub_work_bound' && rb.line === 'scrub_work_bound' && rb.leaks === 0 && rb.live === 0, 'THE OWNER\'S RECORD: a run whose scrubbing met its work bound (a planted figure) — the output says so by name, the answer and the audit line each carry `withheld: \'scrub_work_bound\'`, nothing of the value in the output', rb);
  const rg = await boundLeg(doorCopy("...(e.lost ? { withheld: 'scrub_worker_gone' } : c.over ? { withheld: 'scrub_work_bound' } : {}) };", "...(e.lost ? { withheld: 'scrub_worker_gone' } : {}) };", 'the work bound not on the record'));
  ok(rg.said && !rg.line && !rg.answer, 'MUTANT «the work bound not on the record»: the patch hits once and the leg goes RED — the output said the words, the audit line and the answer carry no `withheld`; the shipped door writes the one field', rg);
}

// THE SCAN OFF THE LOOP's legs (one scrubber worker a run — 主开发 r1505 / r1573 / r1919 / r2161) are scripts/test-vault-run-offloop.mjs,
// their own fast suite and row since 主开发 r2322 «THE COST». The work bound's record (above) stays here.

console.log('⑥ THE TIMEOUT');
{
  const w = await world({ runBoundMs: 50 });   // B-54a9: the armed 1 s bound fires at 50 ms (the printer's «sleep» never ends by itself)
  openRow(w);
  const { r } = await runAnswered(w, ['--timeout', '1', ...ENV('sleep', path.join(w.work, 'p2.txt'))]);
  ok(r.ok && r.timedOut === true && r.signal === 'SIGTERM' && w.timerLog.includes(1000), '--timeout 1: the door armed its 1 s bound, the child was stopped there (SIGTERM) and the answer says timedOut', { timedOut: r.timedOut, signal: r.signal, timers: w.timerLog });
}

console.log('⑦ MUTANTS — patched copies of the door, each RED on its leg');
{
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const mutate = (from, to, tag) => { const n = SRC.split(from).length - 1; return { n, mod: M.load('src/server/vault-run-door.js', anchored(SRC, from, to, `test-vault-run ⑦ ${tag}`), tag) }; }; // B-0d3e: a moved anchor fails BY NAME (it built nothing in silence)
  const m1 = mutate('seen: seen.has(pair)', 'seen: true', 'nocard');
  const r1 = m1.mod ? await newShapeCards(m1.mod) : null;
  ok(m1.n === 1 && r1 && !r1.card && r1.ran, `MUTANT «a new shape without a card» (seen read as true): the patch hits once and the leg goes RED — it ran with NO card (${r1 && r1.by}); the shipped door draws one`, r1);
  const m2 = mutate('const line = { ...head, receipt, allowedBy: verdict.by,', 'const line = { ...head, receipt, env: m.env, allowedBy: verdict.by,', 'auditvalue');
  const r2 = m2.mod ? await auditClean(m2.mod) : null;
  ok(m2.n === 1 && r2 && r2.leaks.length > 0, `MUTANT «an audit line carrying a value» (the child's env on the line): the patch hits once and the leg goes RED (the oracle finds ${r2 && r2.leaks.join(', ')}); the shipped door writes none`, r2 && r2.leaks);
  // lane vault-scrub-forms: ONE scrubber per run — two (one per pipe, the shape before) let a split value by
  const twoW = workerCopy("m = VR.createRunMasker(msg.secrets, ['out', 'err'], msg.steps ? { steps: msg.steps } : {});", "m = ((a, b) => ({ push: (k, x) => (k === 'out' ? { out: a.push(x), err: '' } : { out: '', err: b.push(x) }), end: () => ({ out: a.end(), err: b.end() }), hits: 0, bytes: 0, byForm: {}, over: false, withheld: 0 }))(VR.createMasker(msg.secrets), VR.createMasker(msg.secrets));", 'two scrubbers one per pipe');
  const w3 = await world({ doorExtra: { scrubWorkerFile: twoW } }); openRow(w3); const r3 = await splitLeg(w3);
  ok(r3 && r3.lk.length > 0, `MUTANT «two scrubbers, one per pipe» (the pre-lane shape, in the run's worker): the split leg goes RED (the oracle finds ${r3 && r3.lk.join(', ')}); the shipped worker's ONE scrubber masks it`, r3);
  // a CUT keeps the held tail back: flushed, a long new form begun inside the bound would arrive in part
  const m4 = mutate('scrub.end(cut).then((e) => {', 'scrub.end().then((e) => {', 'cutflush');   // round 21: dropping the cut arg flushes the held tail RAW (cut=false ⇒ no maskTail) and leaks the half value
  let r4 = null;
  if (m4.mod) { const w4 = await world({ doorMod: m4.mod }); openRow(w4); const e = await runAnswered(w4, ENV('edge2')); const tl = (e.r.stdout || '').slice(-1200); r4 = { truncated: e.r.truncated, lk: leaks(tl, VALUE), head: tl.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).includes(VALUE.slice(0, 6)) }; }
  ok(m4.n === 1 && r4 && r4.truncated && (r4.lk.length > 0 || r4.head), 'MUTANT «a cut flushes the held tail»: the patch hits once and the edge leg goes RED (the first characters of the value\'s entities arrive); the shipped door drops them', r4);
  // round 20b: the base behaviour (54f757df) is RED — the card vanishes on expiry, and a late answer answers ask_expired
  const m5 = mutate('q.timer = timers.set(() => goLate(q), VR.ASK_TTL_MS)', "q.timer = timers.set(() => settle(q, 'expired', 'timeout'), VR.ASK_TTL_MS)", 'nolate');
  let r5 = null;
  if (m5.mod) { const w5 = await world({ instance: 'cluster', askMs: 60, doorMod: m5.mod }); openRow(w5); const e5 = await runAnswered(w5, ENV('env'), { answer: null }); await e5.r; r5 = { cards: cardsOf(w5).length }; }
  ok(m5.n === 1 && r5 && r5.cards === 0, 'MUTANT «expiry settles the card done» (the 54f757df behaviour): the patch hits once and the leg goes RED — the card VANISHED on expiry; the shipped door keeps it as a late card', r5);
  const m6 = mutate('if (!q) { const lq = lateAsks.get(id); if (lq) return answerLate(lq, { answer: a, reauthed, by }); return', 'if (!q) { return', 'nolateanswer');
  let r6 = null;
  if (m6.mod) { const w6 = await world({ instance: 'cluster', askMs: 60, doorMod: m6.mod }); openRow(w6); const e6 = await runAnswered(w6, ENV('env'), { answer: null }); await e6.r; const c6 = cardsOf(w6)[0]; r6 = { ans: c6 ? w6.door.answer(c6.action.askId, { answer: 'once' }) : null }; }
  ok(m6.n === 1 && r6 && r6.ans && r6.ans.ok === false && (r6.ans.code === 'ask_expired' || r6.ans.code === 'ask_unknown'), 'MUTANT «a late answer is not handled» (the 54f757df behaviour): the patch hits once and the leg goes RED — a late «allow once» is REFUSED (no pass written); the shipped door writes a one-run pass', r6);
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);
}

console.log('⑧ PINS — the headers say the holes; the wiring');
{
  const door = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const routes = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8');
  const wire = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/THE SCRUBBER IS A SIEVE/.test(door) && /WRITE-THEN-CAT IS ACCEPTED AND AUDITED/.test(door) && /NOT isolation/.test(door) && /egress fence is P1/.test(door), 'the door\'s header names §8.6\'s three holes: the same uid (not isolation), a tool sending it elsewhere (P1 egress), THE SCRUBBER IS A SIEVE — write-then-cat accepted and audited');
  const manual = fs.readFileSync(path.join(REPO, 'docs/agent/vault-manual.md'), 'utf8').replace(/\s+/g, ' ');
  ok(manual.includes('the output is scrubbed of the value\'s common spellings; a command that re-encodes it can still show it — the owner sees the whole command before it runs') && /A part of a value is never blanked; a value under 8 bytes is never used at all/.test(manual), 'the manual says what scrubbing does not promise in ONE sentence (lane vault-scrub-forms, the desk\'s q-043 M1) — and states the floor');
  ok(/THE THREE HOLES this door does NOT close/.test(routes) && /THE SCRUBBER IS A SIEVE/.test(routes) && /write-then-cat is accepted and audited/.test(routes), 'the route\'s header restates them');
  ok(/require\('\.\/vault-run-door\.js'\)\.create\(\{ dataDir: path\.join\(rootDir, 'data'\), vault, sources: vaultSources, userTodos,/.test(wire) && /agentEnv: \(\) => require\('\.\.\/agent-env\.js'\)\.agentEnv\(process\.env, \{ drop: require\('\.\.\/harness-env\.js'\)\.agentCredentialEnvNames/.test(wire) && /registerVaultRoutes\(app, \{[^\n]*run: vaultRun,/.test(wire) && /process\.once\('exit', \(\) => \{ try \{ vaultRun\.closeAll\(\); \} catch \{ \} \}\);/.test(wire) && /instanceKindOf\(process\.env/.test(wire),
    'the hub wires the door: the vault, the Vault window\'s sources, For you, agentEnv() (the harness credentials dropped), the instance\'s kind, the routes — and every child ends with the hub');
}

console.log('⑨ THE CARD ON THE PAGE — the For-you window, the popup row, the Vault window\'s switch');
{
  const L = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const view = (always) => L.itemView({ id: 'ut-1', sessionKey: 'claude:conv-1', text: 'Lane X wants to run a command with a stored secret', detail: 'curl -s https://api.example.com', urgency: 'urgent', kind: 'action', status: 'open', createdAt: 1, options: null, reply: null,
    action: { type: 'vault-run-ask', askId: 'a'.repeat(32), always, tool: 'curl' } }, { t: (x) => x, words: 'w', detail: 'd', name: 'Lane X', origin: { origin: 'vault', label: 'Vault' }, notice: false, reply: { show: false }, ago: () => '', expires: () => '', resolvedBy: () => '' });
  const a1 = view(true).actions, a0 = view(false).actions;
  ok(a1.slice(0, 3).join() === 'hub-once,shape-always,hub-deny' && a0.slice(0, 2).join() === 'hub-once,hub-deny' && !a0.includes('shape-always') && !a1.includes('reply'), 'the For-you window: Allow once / Always for this shape / Deny first — no «always» button when the card does not offer it, no reply box', { a1, a0 });
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  const row = read('src/lib/user-todos-row.js'), win = read('src/lib/inbox-window.js'), act = read('src/lib/user-todos-actions.js'), vw = read('src/lib/vault-window.js');
  ok(/const HELD_ASKS = \['hub-act-ask', 'automation-ask', 'pool-cross-provider', 'vault-run-ask', 'vault-grant-ask', 'vault-words-ask', 'vault-job-ask'\];/.test(row) && /heldAnswers\(i\)\.map/.test(row) && /type === 'vault-run-ask' \? t\('Always let this conversation use it \(these hosts\)'\)/.test(row) && /i\.action\.type === 'vault-run-ask' && i\.action\.always === false/.test(row), 'the popup row: Allow once / Always (lane vault-use-grants: «Always let this conversation use it (these hosts)» — a standing approval; not when the card offers none) / Deny');
  ok(/'shape-always': \(it\) => \(it && it\.action && it\.action\.command \? actBtn\('shape-always'.*: actBtn\('shape-always'/.test(win) && /a === 'auto-always' \|\| a === 'pool-always' \|\| a === 'shape-always' \? 'always'/.test(win), 'the For-you window\'s «Always for this shape» answers always');
  ok(/if \(\(answer === 'always' \|\| answer === 'window'\) && !revealLeftMs\(\) && !\(await askRevealPassword\(\)\)\) return false;/.test(act) && /\/api\/vault\/run\/asks\//.test(act) && /\.\.\.\(answer === 'always' \|\| answer === 'window' \? revealHeaders\(\) : \{\}\)/.test(act) && /r\.outcome === 'always'/.test(act), '«always» (and lane vault-standing-request r7\'s «Allow for 1 hour») opens 验证是你 FIRST, in the press\'s own task, and sends this page\'s window; the answer reads `outcome`');
  ok(/if \(row\.run && row\.run\.can\)/.test(vw) && /if \(on && !revealLeftMs\(\) && !\(await askRevealPassword\(\)\)\) \{ box\.checked = false; return; \}/.test(vw) && /fetchJson\('\/api\/vault\/runnable'/.test(vw), 'the Vault window: «Usable by agent runs» on a row that can be opened; ON asks 验证是你 first, OFF never');
  ok(R('src/inbox-reply.js').ANSWER_ACTION_TYPES.includes('vault-run-ask'), 'a typed reply never answers the run card — its buttons do');
  // lane vault-scrub-forms (q-043 verify M1): the card says what scrubbing does NOT promise — on the row, in the window, in three languages
  const NOTE = 'The output is scrubbed of the secret\'s common spellings; a command that re-encodes it can still show it — read the whole command before you allow it.';
  const call = "t('" + NOTE.replace(/'/g, "\\'") + "')", zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok(row.includes("(i.action.type === 'vault-run-ask' ? `<div class=\"ut-exit-note\">${escHtml(" + call + ")}</div>` : '')") && win.includes("if (!card && it.action && it.action.type === 'vault-run-ask') c.detail.append(mk('div', 'iw-run-note', " + call + "));")
    && zh.includes(JSON.stringify(NOTE) + ': "') && ja.includes(JSON.stringify(NOTE) + ': "'), 'the RUN card says what the scrubbing does not promise («…a command that re-encodes it can still show it — read the whole command before you allow it») — on the popup row and under the For-you window\'s detail, with its Chinese and Japanese');
}

console.log('⑮ THE SPLIT (B-54a9, 主开发 r3540 / r4355) — the moved sections stand in their twins, once each, never here');
{
  // THE PIN IN THE OLD FILE: ⑥b ⑥c ⑩ ⑩b ⑪ and ⑫'s seal moved word for word to test-vault-run-grants and test-vault-run-seal, the three
  // suites over ONE world (scripts/vault-run-world.mjs). A section header written back into this file, or lost from its twin, is red by name
  const read = (f) => fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8');
  const MOVED = { 'test-vault-run-grants.mjs': ["console.log('⑩ THE REQUEST AND ITS GRANT", "console.log('⑩b THE CAP"],
    'test-vault-run-seal.mjs': ["console.log('⑥b A RUN ENDS WHOLE", "console.log('⑥c THE STORE READ", "console.log('⑪ THE OWN ROAD", '// ⑫ THE OWNERSHIP SEAL'] };
  const count = (t, h) => t.split('\n').filter((l) => l.startsWith(h)).length;
  const judge = (self) => Object.entries(MOVED).flatMap(([f, hs]) => hs.filter((h) => count(read(f), h) !== 1 || count(self, h) !== 0).map((h) => `${f}: ${h}`));
  const self = read('test-vault-run.mjs'), bad = judge(self);
  ok(bad.length === 0, 'B-54a9 THE SPLIT: every moved section stands once in its twin and never in this file (⑩ ⑩b in test-vault-run-grants; ⑥b ⑥c ⑪ and ⑫\'s seal in test-vault-run-seal)', bad);
  const planted = judge(self + "\nconsole.log('⑩ THE REQUEST AND ITS GRANT (planted back)');");
  ok(planted.length === 1 && /^test-vault-run-grants\.mjs: console\.log\('⑩ THE REQUEST/.test(planted[0]), 'RED control: the same check over this file with ⑩\'s header written back reads that one section red, by name', planted);
  ok(['test-vault-run.mjs', 'test-vault-run-grants.mjs', 'test-vault-run-seal.mjs'].every((f) => /^import \{[^}]*\} from '\.\/vault-run-world\.mjs';/m.test(read(f))),
    'the three suites import the ONE world, scripts/vault-run-world.mjs — none builds a copy of its own');
}
try { fs.chmodSync(BIN, 0o755); } catch { }   // the read-only bin given back (the scratch dir is removed)
try { fs.chmodSync(GHBIN, 0o755); } catch { }   // B-f1d3: GHBIN too — left 0555 its gh could not be unlinked and the scratch dir outlived the suite (the test machine's LEFTOVERS)
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);

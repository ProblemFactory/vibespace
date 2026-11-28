#!/usr/bin/env node
// A BACKGROUND JOB'S VAULT VALUES — src/vault-job.js, the PURE half of `vibespace-job run … --vault NAME=vault://…` (lane
// vault-job-road, design-vault-service-secret L1a). Fast tier, in-process; nothing is spawned, nothing is written. Every table:
//   ① THE GRAMMAR — NAME=vault://… (≤ 8, the NAME rule, a NAME given twice, its NAME_FD refused by the run door's env table,
//      never VIBESPACE_*, never one the job's env sets); a refusal names the POSITION, never the text typed (a pasted value)
//   ② THE FAMILIES — a free entry, the owner's own agent entry (by its durable id or its registered one); another
//      conversation's ⇒ use_not_granted; every other store ⇒ entry_not_for_jobs
//   ③ THE VERDICT — locked / not set up / own put / own minted / free, a `vault-job` row naming this job, another job, another
//      conversation, a cron's row for its run, an entry gone, one of two missing
//   ④ THE FD PLAN — NAME → 4 + i (fd 3 is the memory gate's), the env holds NAME_FD only, the spec holds names and fds only
//   ⑤ THE FRAME — the round trip, every bad shape refused in words that hold no byte of it, the 64 KiB bound
//   ⑤b ROUND 2 (the acceptance) — THE WORDS OF A WAIT: the lock's name where a person unlocks it (and the TOLD clause); the
//      approval's promise NO card this version lacks and name the door that works now. A USE IS A HAND-OVER THAT COMPLETED:
//      the wrapper's exit record → `refused:<its code>` (an update window, a stop, a code, nothing written), never `ok`; such a
//      line is never counted as the actor's failure (src/vault-use.js counts — a refusal of the actor's still is)
//   ⑥ MUTANTS — each rule's copy (compiled at the real path) is RED: a lock that goes, a minted value as the agent's own, an
//      approval of any job, the values at fd 3, the approval's r1 words
import './scratch.mjs';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SRC = path.join(REPO, 'src/vault-job.js');
const VJ = require(SRC);
const GM = require(path.join(REPO, 'src/grant-model.js'));
const FREE = 'vault://secrets/secret:k1/secret', OWN = 'vault://agent:conv-a/tok', OTHER = 'vault://agent:conv-b/tok';
const job = (o = {}) => ({ id: 'jb-0000aaaa', kind: 'service', owner: { conversation: { id: 'conv-a' }, sessionId: 'w-a', createdBy: 'agent' }, vault: [{ name: 'TOK', ref: OWN }], ...o });
const row = (resource, to) => GM.validateWrite('vault-job', resource, { to }).row;

console.log('① THE GRAMMAR');
{
  const p = VJ.parseVault(['TOK=' + OWN, 'API_KEY=' + FREE]);
  ok(gateOf(p.ok) && verdictOf(eq(p.refs, [{ name: 'TOK', ref: OWN }, { name: 'API_KEY', ref: FREE }])), 'NAME=vault://… → the references in their canonical spelling, in order', p);
  ok(VJ.parseVault(['X=vault://secrets/secret%3Ak1/secret']).refs[0].ref === FREE, 'an encoded spelling is stored canonical');
  ok(gateOf(eq(VJ.parseVault(undefined), { ok: true, refs: [] })) && verdictOf(eq(VJ.parseVault(null), { ok: true, refs: [] })), 'no --vault ⇒ no values');
  ok(VJ.parseVault(Array.from({ length: 9 }, (_, i) => `N${i}=${FREE}`)).code === 'vault_too_many' && verdictOf(VJ.parseVault(Array.from({ length: 8 }, (_, i) => `N${i}=${FREE}`)).ok), `at most ${VJ.MAX} values (8 pass, 9 refused)`);
  for (const [n, why] of [['tok', 'lower case'], ['1TOK', 'a digit first'], ['T'.repeat(65), '65 characters'], ['TO-K', 'a dash'], ['', 'empty']]) ok(VJ.parseVault([`${n}=${FREE}`]).code === (n === '' ? 'vault_bad_spec' : 'vault_bad_name'), `a NAME with ${why} is refused by name`);
  ok(verdictOf(VJ.parseVault(['T'.repeat(64) + '=' + FREE]).ok), 'a 64-character NAME passes');
  ok(VJ.parseVault(['TOK=' + FREE, 'TOK=' + OWN]).code === 'vault_dup_name', 'a NAME given twice is refused');
  ok(verdictOf(['VIBESPACE_JOB', 'LD', 'DYLD', 'GIT_CONFIG', 'BASH_FUNC_X'].every((n) => VJ.parseVault([`${n}=${FREE}`]).code === 'vault_name_refused')), 'a NAME whose NAME_FD is a VibeSpace name or one the env table refuses (LD_FD, DYLD_FD, GIT_CONFIG_FD, …) is refused');
  ok(VJ.parseVault(['TOK=' + FREE], { env: { TOK_FD: '9' } }).code === 'vault_name_refused' && verdictOf(VJ.parseVault(['TOK=' + FREE], { env: { OTHER: '1' } }).ok), 'a NAME_FD the job\'s own env sets is refused');
  const pasted = 'sk-live-' + 'q'.repeat(12) + '7f3';
  const r = VJ.parseVault(['TOK=' + OWN, 'KEY=' + pasted]);
  ok(r.code === 'vault_bad_ref' && r.at === 2 && !JSON.stringify(r).includes(pasted) && !JSON.stringify(VJ.parseVault([pasted])).includes(pasted), 'a VALUE pasted where a reference belongs: refused at its POSITION (#2), its text never echoed', r);
  ok(gateOf(VJ.parseVault([{ name: 'TOK', ref: OWN }]).ok) && VJ.parseVault([{ name: 'TOK', ref: 'nope' }]).code === 'vault_bad_ref', 'the record\'s own {name, ref} re-reads through the same grammar');
  ok(gateOf(eq(VJ.refsOf({ action: { task: { vault: [{ name: 'A', ref: FREE }] } } }), [{ name: 'A', ref: FREE }])) && verdictOf(eq(VJ.refsOf({}), [])), 'refsOf: a job\'s values, a scheduled run\'s from its task');
}

console.log('② THE FAMILIES');
{
  const o = VJ.ownerOf(job());
  ok(verdictOf(eq(o, { scope: 'w-a', conv: 'conv-a' })), 'the owner = its registered id + its durable conversation id', o);
  ok(VJ.familyOf(FREE, o).family === 'free', 'a free entry (vault://secrets/secret:…) is a job\'s family');
  ok(VJ.familyOf(OWN, o).family === 'own' && VJ.familyOf('vault://agent:w-a/tok', o).family === 'own', 'the owner\'s own agent entry — by its durable id and by its registered id');
  ok(VJ.familyOf(OTHER, o).code === 'use_not_granted', 'another conversation\'s agent entry ⇒ use_not_granted');
  ok(verdictOf(['vault://accounts/acct_1/key', 'vault://mounts/m1/secretKey', 'vault://secrets/host:dev1/secret', 'vault://secrets/frp:token/secret', 'vault://secrets/apikey:a1/secret'].every((x) => { const f = VJ.familyOf(x, o); return !f.ok && (f.code === 'entry_not_for_jobs' || f.code === 'vault_bad_ref'); })), 'a sign-in, a mount, a pairing, the relay, an automation key ⇒ refused by name (never a job\'s)');
  ok(VJ.familyOf(OWN, VJ.ownerOf({ owner: { createdBy: 'user' } })).code === 'use_not_granted', 'a job with no owner conversation owns no agent entry');
}

console.log('③ THE VERDICT');
{
  const put = { prov: 'stored' }, minted = { prov: 'minted' };
  const v = (j, o) => VJ.verdictOf(j, { state: 'unlocked', entryOf: () => put, rowsFor: () => [], ...o });
  ok(verdictOf(eq(VJ.verdictOf(job(), { state: 'locked' }), { wait: 'vault' })), 'locked ⇒ WAIT for the vault (never a start, never a failure)');
  ok(VJ.verdictOf(job(), { state: 'not_set_up' }).code === 'vault_not_set_up', 'not set up ⇒ refused by name');
  const g = v(job());
  ok(gateOf(g.go) && g.refs[0].by === 'own' && g.refs[0].entry === 'agent:conv-a/tok' && verdictOf(eq(g.plan, [{ name: 'TOK', fd: 4, env: 'TOK_FD' }])), 'the agent\'s own PUT value ⇒ go, no card (it saw it)', g);
  ok(verdictOf(eq(v(job(), { entryOf: () => minted }), { wait: 'approval', missing: ['TOK'] })), 'a value the hub MINTED ⇒ wait for the owner\'s approval (the agent never saw it)');
  const id = 'secrets:agent:conv-a/tok#secret';
  const mine = row(id, [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000aaaa'] }]);
  ok(v(job(), { entryOf: () => minted, rowsFor: (x) => (x === id ? [mine] : []) }).refs[0].by === 'grant', 'minted + a vault-job row naming THIS job ⇒ go (by the grant)');
  ok(v(job(), { entryOf: () => minted, rowsFor: () => [row(id, [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000bbbb'] }])] }).wait === 'approval', 'a row naming ANOTHER job approves nothing here');
  ok(v(job(), { entryOf: () => minted, rowsFor: () => [row(id, [{ kind: 'conversation', key: 'conv-z', jobs: ['jb-0000aaaa'] }])] }).wait === 'approval', 'a row of ANOTHER conversation approves nothing here');
  ok(v(job(), { entryOf: () => minted, rowsFor: () => [row(id, [{ kind: 'conversation', key: 'conv-a' }])] }).wait === 'approval', 'a member with no jobs list approves no job');
  const fj = job({ vault: [{ name: 'K', ref: FREE }] }), fid = 'secrets:secret:k1#secret';
  ok(v(fj).wait === 'approval' && verdictOf(v(fj, { rowsFor: () => [row(fid, [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000aaaa'] }])] }).go), 'a free entry ⇒ an approval first; with its row ⇒ go');
  const child = job({ id: 'jb-0000cccc', kind: 'task', cronParent: 'jb-0000aaaa', vault: [{ name: 'K', ref: FREE }] });
  ok(verdictOf(v(child, { rowsFor: () => [row(fid, [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000aaaa'] }])] }).go), 'a scheduled run reads its CRON\'s approval (every fire)');
  ok(v(job(), { entryOf: () => null }).code === 'entry_unknown' && v(job(), { entryOf: () => null }).key === 'TOK', 'an entry gone ⇒ refused by name (the NAME, never a value)');
  ok(v(job({ vault: [{ name: 'TOK', ref: OTHER }] })).code === 'use_not_granted', 'another conversation\'s entry ⇒ refused at the spawn too');
  const two = job({ vault: [{ name: 'TOK', ref: OWN }, { name: 'K', ref: FREE }] });
  ok(verdictOf(eq(v(two), { wait: 'approval', missing: ['K'] })), 'one of two missing ⇒ wait, naming the missing one');
  ok(verdictOf(eq(VJ.verdictOf({ id: 'jb-1' }, { state: 'locked' }), { go: true, refs: [], plan: [] })), 'a job with no --vault is never judged by the vault (locked or not)');
}

console.log('④ THE FD PLAN');
{
  const plan = VJ.fdPlan([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  ok(gateOf(eq(plan.map((p) => p.fd), [4, 5, 6])) && VJ.FD_BASE === 4, 'NAME → fd 4 + i — fd 3 stays the memory gate\'s');
  ok(verdictOf(eq(VJ.envOf(plan), { A_FD: '4', B_FD: '5', C_FD: '6' })), 'the env gets NAME_FD only');
  ok(verdictOf(eq(VJ.specOf(plan), [{ name: 'A', fd: 4 }, { name: 'B', fd: 5 }, { name: 'C', fd: 6 }])), 'the spec file gets the names and the fds only');
  ok(!!VJ.planOfSpec(VJ.specOf(plan)) && VJ.planOfSpec([{ name: 'A', fd: 3 }]) === null && VJ.planOfSpec([{ name: 'A', fd: 4 }, { name: 'A', fd: 5 }]) === null && VJ.planOfSpec([{ name: 'a', fd: 4 }]) === null && VJ.planOfSpec([]) === null, 'the wrapper reads only a plan of this shape (fd 4 + i, unique upper-case names)');
}

console.log('⑤ THE FRAME');
{
  const sent = Buffer.from('sentinel-value-ü-' + 'x'.repeat(40));
  const plan = VJ.fdPlan([{ name: 'A' }, { name: 'B' }]);
  const f = VJ.encodeFrame([{ name: 'A', value: sent }, { name: 'B', value: Buffer.from('second-value-123') }]);
  const d = VJ.decodeFrame(f, plan);
  ok(gateOf(d.ok) && gateOf(d.values[0].equals(sent)) && d.values[1].toString() === 'second-value-123', 'the round trip: each value, byte for byte');
  ok(f.toString('latin1').indexOf(sent.toString('latin1')) === 4 + 1 + 1 + 1 + 4 && !f.includes(Buffer.from(JSON.stringify(sent.toString()))), 'the bytes ride RAW after their length — never a JSON string (a copy that can be zeroed)');
  const bads = [['magic', Buffer.concat([Buffer.from('XXXX'), f.subarray(4)])], ['count', VJ.encodeFrame([{ name: 'A', value: sent }])], ['names', VJ.encodeFrame([{ name: 'B', value: sent }, { name: 'A', value: sent }])], ['cut', f.subarray(0, f.length - 3)], ['tail', Buffer.concat([f, Buffer.from('z')])], ['empty', Buffer.alloc(0)]];
  for (const [n, b] of bads) { const r = VJ.decodeFrame(b, plan); ok(!r.ok && !r.why.includes('sentinel') && !r.why.includes('second'), `a frame with a bad ${n} is refused in words that hold none of it (${r.why})`); }
  let big = null; try { VJ.encodeFrame([{ name: 'A', value: Buffer.alloc(VJ.PAYLOAD_MAX) }]); } catch (e) { big = e.code; }
  ok(big === 'payload_too_large', `a frame past ${VJ.PAYLOAD_MAX / 1024} KiB is refused`);
}

console.log('⑤b THE WORDS OF A WAIT · A USE IS A HAND-OVER THAT COMPLETED (round 2)');
{
  const VU = require(path.join(REPO, 'src/vault-use.js'));
  const lock = VJ.waitWords('vault'), appr = VJ.waitWords('approval');
  ok(gateOf(/once a person unlocks it on this instance's page \(⚙ System ▸ Vault…\)/.test(lock)) && gateOf(/already been told/.test(lock)) && verdictOf(/never a failure/.test(lock)), 'the lock\'s wait names where a person unlocks it (⚙ System ▸ Vault…) and that the user was told — a wait, never a failure', lock);
  ok(gateOf(/at its start ONE card naming its entries asks the user in their For-you tray \(a schedule: at its first fire\)/.test(appr)) && gateOf(/the job starts by itself once they allow it, and is refused if they deny it/.test(appr)) && gateOf(/vibespace-vault put <name> --stdin/.test(appr)) && gateOf(/vault:\/\/agent:<this conversation>\/<name>/.test(appr)) && !/later VibeSpace update/.test(appr) && !/nothing can approve it/.test(appr), 'lane vault-job-approval: the approval\'s wait names the card that exists now (in the user\'s For-you tray), what each answer does, and the door that needs none (an entry the agent puts, referenced by vault://agent:…) — never the L1a words of a card to come', appr);   // stale-pins: kept (an absence check: L1a's words must be gone)
  ok(VJ.ACK === 0x06, 'the hand-over\'s acknowledgement is ONE byte (0x06) — never a value');
  const cases = [[null, 'refused:not_started'], [{ code: 75, reason: 'update_window' }, 'refused:update_window'], [{ code: null, stop: 'SIGTERM' }, 'refused:stopped'], [{ code: 2, refused: 'masker_missing' }, 'refused:masker_missing'], [{ code: 2, refused: 'Bad Code!' }, 'refused:not_started'], [{ code: 2 }, 'refused:not_started']];
  const bad = typeof VJ.refusedOutcome !== 'function' ? ['(src/vault-job.js has no refusedOutcome — every start is written `ok`)'] : cases.filter(([e, want]) => VJ.refusedOutcome(e) !== want).map(([e, want]) => `${JSON.stringify(e)} → ${VJ.refusedOutcome(e)} (want ${want})`);
  ok(!bad.length, 'a start the wrapper never acknowledged → `refused:<why>` from its exit record (an update window, a stop, its code; a code of another shape or no record: not_started) — never ok', bad.join(' | '));
  ok(VU.outcomeOf('refused:masker_missing') === 'refused:masker_missing' && !VU.counts('refused:masker_missing') && !VU.counts('refused:update_window') && gateOf(VU.counts('not_granted')) && verdictOf(VU.counts('wrong_password')), 'a `refused:<code>` line is the hub\'s own (no program got the value) — never counted as the actor\'s failure; the actor\'s own refusals still are (the controls)');
}

console.log('⑥ MUTANTS (each a copy compiled at the real path — RED)');
{
  const Module = require('module');
  const real = fs.readFileSync(SRC, 'utf8');
  const mutant = (from, to) => {
    const n = real.split(from).length - 1;
    // B-0d3e: the anchor judged BY NAME — a moved or doubled anchor is a red row naming it and the file (then { anchor: n }: the
    // control's own row reds «its anchor found n×» too, nothing crashes)
    if (n !== 1) { ok(false, `ANCHOR (src/vault-job.js): ${JSON.stringify(from).slice(0, 100)} — found ${n} times, one meant: the copy builds nothing`); return { anchor: n }; }
    const m = new Module(SRC, null); m.filename = SRC; m.paths = Module._nodeModulePaths(path.dirname(SRC));
    m._compile(real.replace(from, to), SRC);
    return m.exports;
  };
  const minted = { prov: 'minted' }, put = { prov: 'stored' };
  const legs = [
    ['the lock is a start', "if (state !== 'unlocked') return { wait: 'vault' };", "if (false) return { wait: 'vault' };", (M) => !!M.verdictOf(job(), { state: 'locked', entryOf: () => put }).go],
    ['a minted value is the agent\'s own', "e.prov !== 'minted'", 'true', (M) => !!M.verdictOf(job(), { state: 'unlocked', entryOf: () => minted, rowsFor: () => [] }).go],
    ['an approval of ANY job', 'h.entry.jobs.some((id) => jobIds.includes(id))', 'true', (M) => M.approvedBy([row('secrets:secret:k1#secret', [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000bbbb'] }])], { keys: ['conv-a'], jobIds: ['jb-0000aaaa'] })],
    ['the values at fd 3 (the gate\'s)', 'const FD_BASE = 4;', 'const FD_BASE = 3;', (M) => M.fdPlan([{ name: 'A' }])[0].fd === 3],
    ['lane vault-job-approval: L1a\'s approval words (a card that arrives in a later update — false now that it exists)', "  wait_approval: 'waiting for the user\\'s approval", "  wait_approval: 'waiting for the user\\'s approval of this job\\'s vault values — the approval card arrives in a later VibeSpace update, so in this version nothing can approve it', _l1a: 'waiting for the user\\'s approval", (M) => /later VibeSpace update/.test(M.waitWords('approval')) && !/For-you tray/.test(M.waitWords('approval'))],   // stale-pins: kept (a mutant that puts L1a's words back)
    ['lane vault-job-approval: an allow that REPLACES the member\'s jobs (the ids it named before dropped)', 'm.jobs = [...jobs, jobId];', 'm.jobs = [jobId];', (M) => { const r = M.memberWith({ to: [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000cccc'] }] }, 'conv-a', 'jb-0000aaaa'); return !!r && JSON.stringify(r.to[0].jobs) !== '["jb-0000cccc","jb-0000aaaa"]'; }],
    ['lane vault-job-approval: a card that says nothing of a program an agent can change', "f.program.writable ? { key: i18nKey('Program: {path} — an agent can change this program.'), params: { path: f.program.path } } : ", 'false ? null : ', (M) => !/an agent can change this program/.test(M.askCardOf({ program: { path: '/home/u/bot', writable: true } }).detail)],
  ];
  for (const [n, from, to, red] of legs) {
    const M = mutant(from, to);
    ok(gateOf(M) && M.anchor === undefined && gateOf(red(M)) && !red(VJ), `CONTROL — ${n}: the copy is RED, the real module green`, M && M.anchor !== undefined ? `its anchor found ${M.anchor}×` : undefined);   // an anchor found 0× is no copy
  }
}

console.log('⑦ THE APPROVAL CARD (lane vault-job-approval, design-vault-service-secret L1b)');
{
  // stage L3's F1 (主开发 r2528): ONE card a JOB — its entries, what is new, what stands (since when); its name first, no internal id
  const c = VJ.askCardOf({ who: 'Chat A', job: { label: 'tg-bot', kind: 'service' }, entries: [{ name: 'TG_TOKEN', label: 'Telegram bot' }, { name: 'WX', label: 'Weather API', isNew: true }], standing: [{ label: 'Mail login', since: Date.UTC(2026, 10, 20, 9, 5) }], program: { path: '/usr/bin/python3', writable: false }, script: { path: '/home/u/bot.py', writable: true }, folder: '/home/u', command: 'python3 bot.py' });
  const f = c.facts;
  ok(f.v === 2 && f.job.kind === 'service' && f.job.name === 'tg-bot' && !('id' in f.job) && f.entries.length === 2 && f.entries[0].var === 'TG_TOKEN_FD' && !f.entries[0].new && f.entries[1].new === true && f.standing.length === 1 && f.standing[0].since === Date.UTC(2026, 10, 20, 9, 5) && f.dest === 'unknown' && f.program.writable === false && f.script.writable === true && f.folder === '/home/u' && f.command === 'python3 bot.py' && !/vault:\/\/|jb-/.test(JSON.stringify(f)), 'the facts (v 2) are closed codes and names: the kind, the job\'s NAME (no id), every entry with its fd NAME_FD and what is new, what stands since when, the destination unknown, who can change the program and the script — no reference, no job id', f);
  ok(c.text === 'Background job «tg-bot» asks to use «Telegram bot», «Weather API» — set up by Chat A' && gateOf(/^A service: it starts again by itself when it stops/m.test(c.detail)) && gateOf(/^It will use: «Telegram bot», «Weather API»$/m.test(c.detail)) && gateOf(/^New on this card since it was last drawn: «Weather API»$/m.test(c.detail)) && gateOf(/^Already allowed for this job \(they stand\): «Mail login» \(2026-11-20 09:05 UTC\)$/m.test(c.detail)) && gateOf(/\(TG_TOKEN_FD, WX_FD\)/.test(c.detail)) && gateOf(/^Program: \/usr\/bin\/python3$/m.test(c.detail)) && gateOf(/^Script: \/home\/u\/bot\.py — an agent can change this script\.$/m.test(c.detail)) && !/an agent can change this program/.test(c.detail) && gateOf(/^Where it sends the secrets: unknown/m.test(c.detail)) && gateOf(/^Locking the vault stops nothing that runs/m.test(c.detail)) && !/vault:\/\/|jb-/.test(c.text + c.detail),
    'the words: the job\'s OWN NAME FIRST and what it will use, then who set it up; what its kind means, what is new on the card, what stands (which, since when), the fds it reads, a script an agent can change said as a plain fact (a root-owned program says nothing), the destination unknown, what a lock and a take-back do — no reference, no job id', c.detail);
  const plain = VJ.askCardOf({ job: { label: 'one' }, entries: [{ name: 'A', label: 'Alpha', isNew: true }] });
  ok(!/^New on this card/m.test(plain.detail) && !/^Already allowed/m.test(plain.detail), 'a card whose every entry is «new» (its first drawing) and that has none standing says neither line', plain.detail);
  const fill = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m));
  ok(gateOf(c.i18n.detail.every((l) => typeof l.key === 'string' && l.key.length > 0)) && c.i18n.detail.map(fill).join('\n') === c.detail && fill(c.i18n.text) === c.text, 'the i18n lines ARE the detail and the text (every surface draws them in the viewer\'s language — never a sentence of its own)');
  const never = VJ.askCardOf({ job: { kind: 'service', restart: 'never' } }), onFail = VJ.askCardOf({ job: { kind: 'service', restart: 'on-failure' } }), anon = VJ.askCardOf({});
  ok(gateOf(/^A service that is not restarted by itself — each start gets the secret\.$/m.test(never.detail)) && never.facts.job.restart === 'never' && gateOf(/^A service: it starts again by itself when it stops,/m.test(onFail.detail)) && !/when it stops/.test(never.detail),
    'the adversarial reads: a service\'s line follows its restart policy — `never` does not «start again by itself»; any other policy restarts it at ANY exit (src/jobs.js onServiceExit reads no exit code), so «when it stops»', [never.detail.split('\n')[1], onFail.detail.split('\n')[1]]);
  const most = VJ.askCardOf({ who: 'x', job: { label: 'j', kind: 'service' }, entries: Array.from({ length: 8 }, (_, i) => ({ name: `K${i}`, label: `k${i}`, isNew: i > 3 })), standing: [{ label: 's', since: 1 }], program: { path: '/p', unread: true }, script: { path: '/s', writable: true }, held: true, folder: '/f', command: 'c' });
  ok(anon.facts.who === '' && gateOf(/^Background job «» asks to use/.test(anon.text)) && !anon.i18n.text.params.who && Math.max(...[c, never, onFail, anon, most].map((x) => x.i18n.detail.length)) <= 12 && most.i18n.detail.length === 12, 'an unknown asker is left out of the words (facts.who empty); no card is past the store\'s 12 i18n lines (src/user-todos.js normalizeI18n) — the fullest one (new, standing, a script, a held read) is exactly 12', { who: anon.facts.who, lines: most.i18n.detail.length });
  const cron = VJ.askCardOf({ job: { kind: 'cron' } }), odd = VJ.askCardOf({ job: { kind: 'rocket' } });
  ok(gateOf(/^A scheduled job: each run on its schedule gets the secret\.$/m.test(cron.detail)) && odd.facts.job.kind === 'task' && verdictOf(/^A task: it runs once/m.test(odd.detail)), 'a schedule says each run gets it; a kind outside the closed set is drawn as a task (never an unknown code on the card)');
  const long = VJ.askCardOf({ command: 'x'.repeat(5000), folder: 'a\nb\u0007c' });
  ok(long.facts.command.length === 400 && gateOf(long.facts.command.endsWith('…')) && !/[\n\u0007]/.test(long.facts.folder) && !/[\u0007]/.test(long.detail), 'a command past 400 characters is cut with its mark; a control character never reaches the card');
  const rlo = VJ.askCardOf({ job: { label: 'bot\u202egnp.exe' }, command: 'run\u200bme' });
  ok(rlo.facts.job.name === 'bot⟦U+202E⟧gnp.exe' && rlo.facts.command === 'run⟦U+200B⟧me' && !/[\u202e\u200b]/.test(JSON.stringify(rlo)), 'a reordering / invisible character an agent put in a job\'s name or command is SHOWN as ⟦U+XXXX⟧ (src/hidden-chars.js — the one door), never drawn', rlo.facts);
  const GM = require(path.join(REPO, 'src/grant-model.js'));
  const m1 = VJ.memberWith(null, 'conv-a', 'jb-0000aaaa');
  const m2 = VJ.memberWith({ to: [{ kind: 'conversation', key: 'conv-b', jobs: ['jb-0000bbbb'] }, { kind: 'conversation', key: 'conv-a', jobs: ['jb-0000cccc'] }], except: [{ kind: 'conversation', key: 'conv-x' }] }, 'conv-a', 'jb-0000aaaa');
  const m3 = VJ.memberWith({ to: [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000aaaa'] }] }, 'conv-a', 'jb-0000aaaa');
  const full = VJ.memberWith({ to: [{ kind: 'conversation', key: 'conv-a', jobs: Array.from({ length: 64 }, (_, i) => `jb-${(0x10000000 + i).toString(16)}`) }] }, 'conv-a', 'jb-0000aaaa');
  const t1 = VJ.memberWith(null, 'conv-a', 'jb-0000aaaa', { at: 1700000000000 }), t2 = VJ.memberWith({ to: t1.to }, 'conv-a', 'jb-0000bbbb', { at: 1700000001000 }), t3 = VJ.memberWithout({ to: t2.to }, 'jb-0000aaaa');
  ok(JSON.stringify(t1.to[0].since) === '{"jb-0000aaaa":1700000000000}' && JSON.stringify(t2.to[0].since) === '{"jb-0000aaaa":1700000000000,"jb-0000bbbb":1700000001000}' && JSON.stringify(t3.to[0]) === '{"kind":"conversation","key":"conv-a","jobs":["jb-0000bbbb"],"since":{"jb-0000bbbb":1700000001000}}' && !('since' in m1.to[0]),
    'stage L3\'s F1: an approval carries WHEN it was given (`since`, per job — the card says what stands since when); a take-back takes its time with it; no time given = none written', { t1: t1.to, t2: t2.to, t3: t3.to });
  ok(gateOf(GM.validateWrite('vault-job', 'secrets:secret:k1#secret', { to: t2.to, except: [] }, { at: 1, by: 'user' }).ok) && !GM.validateWrite('vault-job', 'secrets:secret:k1#secret', { to: [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000aaaa'], since: { 'not-a-job': 5 } }], except: [] }, { at: 1, by: 'user' }).ok, 'the ONE grant model accepts a member\'s `since` (job ids → instants) and refuses one keyed by what is no job id', null);
  ok(verdictOf(/«k1» already has 64 Background jobs of this conversation allowed — nothing was written; take one back \(✕ on its row in the Vault window\), then press Allow again/.test(VJ.fullRowWords('k1'))), 'F1 (b): a full row\'s refusal names its entry and what to do in ONE sentence (the recipe, not only the refusal)', VJ.fullRowWords('k1'));
  ok(JSON.stringify(m1.to) === '[{"kind":"conversation","key":"conv-a","jobs":["jb-0000aaaa"]}]' && !m1.same && JSON.stringify(m2.to[0]) === '{"kind":"conversation","key":"conv-b","jobs":["jb-0000bbbb"]}' && JSON.stringify(m2.to[1].jobs) === '["jb-0000cccc","jb-0000aaaa"]' && JSON.stringify(m2.except) === '[{"kind":"conversation","key":"conv-x"}]' && m3.same === true && full === null,
    'memberWith: the owner\'s member gains the job (made when there is none), every other member and every exception kept as they are, a job named already = nothing to write, 64 = the bound', { m1, m2, m3, full });
  ok(verdictOf(GM.validateWrite('vault-job', 'secrets:secret:k1#secret', { to: m2.to, except: m2.except }, { at: 1, by: 'user' }).ok), 'what memberWith writes is a row the ONE grant model accepts (door vault-job, the job ids its `jobs` field)');
  ok(VJ.ASK_TYPE === 'vault-job-ask' && VJ.ASKS_PER_CONV === 4 && VJ.ASKS_MAX === 64 && VJ.DENY_QUIET_MS === 600000 && gateOf(VJ.ASK_ID_RE.test('vj-0123456789abcdef')) && !VJ.ASK_ID_RE.test('vj-0123') && VJ.askJobIdOf({ id: 'jb-0000aaaa', cronParent: 'jb-0000bbbb' }) === 'jb-0000bbbb' && VJ.askJobIdOf({ id: 'jb-0000aaaa' }) === 'jb-0000aaaa', 'the card\'s numbers (4 per conversation, 64 on the hub, 10 minutes after a Deny), its id, and a scheduled run\'s approval is its cron\'s');
  ok(verdictOf(['vault_denied', 'ask_quiet', 'too_many_asks', 'too_many_asks_hub', 'ask_unfiled', 'ask_closed'].every((k) => typeof VJ.WORDS[k] === 'string' && /not started/.test(VJ.WORDS[k]))), 'every refusal of the card says the job was not started (never a silent wait)');
}

console.log('⑧ TAKEN BACK — the member without the job, the row\'s entry, the notices (lane vault-job-approval)');
{
  const row = { to: [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000aaaa', 'jb-0000bbbb'] }, { kind: 'conversation', key: 'conv-b', jobs: ['jb-0000aaaa'] }, { kind: 'conversation', key: 'conv-c', jobs: ['jb-0000cccc'] }], except: [{ kind: 'conversation', key: 'conv-x' }] };
  const w = VJ.memberWithout(row, 'jb-0000aaaa'), none = VJ.memberWithout(row, 'jb-0000dddd');
  ok(gateOf(w.changed) && JSON.stringify(w.to) === '[{"kind":"conversation","key":"conv-a","jobs":["jb-0000bbbb"]},{"kind":"conversation","key":"conv-c","jobs":["jb-0000cccc"]}]' && JSON.stringify(w.except) === '[{"kind":"conversation","key":"conv-x"}]' && !none.changed && none.to.length === 3,
    'memberWithout: the job leaves EVERY member naming it, a member left with none leaves, every other member and every exception kept; a job named nowhere changes nothing', w);
  ok(VJ.entryOfRow('secrets:secret:k1#secret') === 'secret:k1' && VJ.entryOfRow('secrets:agent:conv-a/tok#secret') === 'agent:conv-a/tok' && VJ.entryOfRow('mounts:m1#secretKey') === null && VJ.entryOfRow('') === null, 'entryOfRow: a vault-job row\'s entry name — none for another store');
  const long = 'L'.repeat(150), rv = VJ.stopWords('revoked', long), dl = VJ.stopWords('deleted', long);
  ok(rv.length <= 200 && dl.length <= 200 && gateOf(/a value it read cannot be taken back/.test(rv)) && gateOf(/a start asks again$/.test(rv)) && verdictOf(/cannot start again with it$/.test(dl)), 'the take-back notices stay within the 200 characters the owner\'s notice keeps (src/job-model.js agentPiece) whatever the entry\'s name — what cannot be undone, and that a start asks again, never cut', [rv.length, dl.length]);
  const pr = VJ.memberWith({ to: [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-dead0001', 'jb-0000cccc'] }] }, 'conv-a', 'jb-0000aaaa', { keep: (id) => id !== 'jb-dead0001' });
  ok(JSON.stringify(pr.to[0].jobs) === '["jb-0000cccc","jb-0000aaaa"]' && pr.same === false, 'memberWith keep: the ids of jobs gone leave the member as it is written', pr);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';

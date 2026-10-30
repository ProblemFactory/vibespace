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
//   ⑥ MUTANTS — each rule's copy (compiled at the real path) is RED: a lock that goes, a minted value as the agent's own, an
//      approval of any job, the values at fd 3
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
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
  ok(p.ok && eq(p.refs, [{ name: 'TOK', ref: OWN }, { name: 'API_KEY', ref: FREE }]), 'NAME=vault://… → the references in their canonical spelling, in order', p);
  ok(VJ.parseVault(['X=vault://secrets/secret%3Ak1/secret']).refs[0].ref === FREE, 'an encoded spelling is stored canonical');
  ok(eq(VJ.parseVault(undefined), { ok: true, refs: [] }) && eq(VJ.parseVault(null), { ok: true, refs: [] }), 'no --vault ⇒ no values');
  ok(VJ.parseVault(Array.from({ length: 9 }, (_, i) => `N${i}=${FREE}`)).code === 'vault_too_many' && VJ.parseVault(Array.from({ length: 8 }, (_, i) => `N${i}=${FREE}`)).ok, `at most ${VJ.MAX} values (8 pass, 9 refused)`);
  for (const [n, why] of [['tok', 'lower case'], ['1TOK', 'a digit first'], ['T'.repeat(65), '65 characters'], ['TO-K', 'a dash'], ['', 'empty']]) ok(VJ.parseVault([`${n}=${FREE}`]).code === (n === '' ? 'vault_bad_spec' : 'vault_bad_name'), `a NAME with ${why} is refused by name`);
  ok(VJ.parseVault(['T'.repeat(64) + '=' + FREE]).ok, 'a 64-character NAME passes');
  ok(VJ.parseVault(['TOK=' + FREE, 'TOK=' + OWN]).code === 'vault_dup_name', 'a NAME given twice is refused');
  ok(['VIBESPACE_JOB', 'LD', 'DYLD', 'GIT_CONFIG', 'BASH_FUNC_X'].every((n) => VJ.parseVault([`${n}=${FREE}`]).code === 'vault_name_refused'), 'a NAME whose NAME_FD is a VibeSpace name or one the env table refuses (LD_FD, DYLD_FD, GIT_CONFIG_FD, …) is refused');
  ok(VJ.parseVault(['TOK=' + FREE], { env: { TOK_FD: '9' } }).code === 'vault_name_refused' && VJ.parseVault(['TOK=' + FREE], { env: { OTHER: '1' } }).ok, 'a NAME_FD the job\'s own env sets is refused');
  const pasted = 'sk-live-' + 'q'.repeat(12) + '7f3';
  const r = VJ.parseVault(['TOK=' + OWN, 'KEY=' + pasted]);
  ok(r.code === 'vault_bad_ref' && r.at === 2 && !JSON.stringify(r).includes(pasted) && !JSON.stringify(VJ.parseVault([pasted])).includes(pasted), 'a VALUE pasted where a reference belongs: refused at its POSITION (#2), its text never echoed', r);
  ok(VJ.parseVault([{ name: 'TOK', ref: OWN }]).ok && VJ.parseVault([{ name: 'TOK', ref: 'nope' }]).code === 'vault_bad_ref', 'the record\'s own {name, ref} re-reads through the same grammar');
  ok(eq(VJ.refsOf({ action: { task: { vault: [{ name: 'A', ref: FREE }] } } }), [{ name: 'A', ref: FREE }]) && eq(VJ.refsOf({}), []), 'refsOf: a job\'s values, a scheduled run\'s from its task');
}

console.log('② THE FAMILIES');
{
  const o = VJ.ownerOf(job());
  ok(eq(o, { scope: 'w-a', conv: 'conv-a' }), 'the owner = its registered id + its durable conversation id', o);
  ok(VJ.familyOf(FREE, o).family === 'free', 'a free entry (vault://secrets/secret:…) is a job\'s family');
  ok(VJ.familyOf(OWN, o).family === 'own' && VJ.familyOf('vault://agent:w-a/tok', o).family === 'own', 'the owner\'s own agent entry — by its durable id and by its registered id');
  ok(VJ.familyOf(OTHER, o).code === 'use_not_granted', 'another conversation\'s agent entry ⇒ use_not_granted');
  ok(['vault://accounts/acct_1/key', 'vault://mounts/m1/secretKey', 'vault://secrets/host:dev1/secret', 'vault://secrets/frp:token/secret', 'vault://secrets/apikey:a1/secret'].every((x) => { const f = VJ.familyOf(x, o); return !f.ok && (f.code === 'entry_not_for_jobs' || f.code === 'vault_bad_ref'); }), 'a sign-in, a mount, a pairing, the relay, an automation key ⇒ refused by name (never a job\'s)');
  ok(VJ.familyOf(OWN, VJ.ownerOf({ owner: { createdBy: 'user' } })).code === 'use_not_granted', 'a job with no owner conversation owns no agent entry');
}

console.log('③ THE VERDICT');
{
  const put = { prov: 'stored' }, minted = { prov: 'minted' };
  const v = (j, o) => VJ.verdictOf(j, { state: 'unlocked', entryOf: () => put, rowsFor: () => [], ...o });
  ok(eq(VJ.verdictOf(job(), { state: 'locked' }), { wait: 'vault' }), 'locked ⇒ WAIT for the vault (never a start, never a failure)');
  ok(VJ.verdictOf(job(), { state: 'not_set_up' }).code === 'vault_not_set_up', 'not set up ⇒ refused by name');
  const g = v(job());
  ok(g.go && g.refs[0].by === 'own' && g.refs[0].entry === 'agent:conv-a/tok' && eq(g.plan, [{ name: 'TOK', fd: 4, env: 'TOK_FD' }]), 'the agent\'s own PUT value ⇒ go, no card (it saw it)', g);
  ok(eq(v(job(), { entryOf: () => minted }), { wait: 'approval', missing: ['TOK'] }), 'a value the hub MINTED ⇒ wait for the owner\'s approval (the agent never saw it)');
  const id = 'secrets:agent:conv-a/tok#secret';
  const mine = row(id, [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000aaaa'] }]);
  ok(v(job(), { entryOf: () => minted, rowsFor: (x) => (x === id ? [mine] : []) }).refs[0].by === 'grant', 'minted + a vault-job row naming THIS job ⇒ go (by the grant)');
  ok(v(job(), { entryOf: () => minted, rowsFor: () => [row(id, [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000bbbb'] }])] }).wait === 'approval', 'a row naming ANOTHER job approves nothing here');
  ok(v(job(), { entryOf: () => minted, rowsFor: () => [row(id, [{ kind: 'conversation', key: 'conv-z', jobs: ['jb-0000aaaa'] }])] }).wait === 'approval', 'a row of ANOTHER conversation approves nothing here');
  ok(v(job(), { entryOf: () => minted, rowsFor: () => [row(id, [{ kind: 'conversation', key: 'conv-a' }])] }).wait === 'approval', 'a member with no jobs list approves no job');
  const fj = job({ vault: [{ name: 'K', ref: FREE }] }), fid = 'secrets:secret:k1#secret';
  ok(v(fj).wait === 'approval' && v(fj, { rowsFor: () => [row(fid, [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000aaaa'] }])] }).go, 'a free entry ⇒ an approval first; with its row ⇒ go');
  const child = job({ id: 'jb-0000cccc', kind: 'task', cronParent: 'jb-0000aaaa', vault: [{ name: 'K', ref: FREE }] });
  ok(v(child, { rowsFor: () => [row(fid, [{ kind: 'conversation', key: 'conv-a', jobs: ['jb-0000aaaa'] }])] }).go, 'a scheduled run reads its CRON\'s approval (every fire)');
  ok(v(job(), { entryOf: () => null }).code === 'entry_unknown' && v(job(), { entryOf: () => null }).key === 'TOK', 'an entry gone ⇒ refused by name (the NAME, never a value)');
  ok(v(job({ vault: [{ name: 'TOK', ref: OTHER }] })).code === 'use_not_granted', 'another conversation\'s entry ⇒ refused at the spawn too');
  const two = job({ vault: [{ name: 'TOK', ref: OWN }, { name: 'K', ref: FREE }] });
  ok(eq(v(two), { wait: 'approval', missing: ['K'] }), 'one of two missing ⇒ wait, naming the missing one');
  ok(eq(VJ.verdictOf({ id: 'jb-1' }, { state: 'locked' }), { go: true, refs: [], plan: [] }), 'a job with no --vault is never judged by the vault (locked or not)');
}

console.log('④ THE FD PLAN');
{
  const plan = VJ.fdPlan([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  ok(eq(plan.map((p) => p.fd), [4, 5, 6]) && VJ.FD_BASE === 4, 'NAME → fd 4 + i — fd 3 stays the memory gate\'s');
  ok(eq(VJ.envOf(plan), { A_FD: '4', B_FD: '5', C_FD: '6' }), 'the env gets NAME_FD only');
  ok(eq(VJ.specOf(plan), [{ name: 'A', fd: 4 }, { name: 'B', fd: 5 }, { name: 'C', fd: 6 }]), 'the spec file gets the names and the fds only');
  ok(!!VJ.planOfSpec(VJ.specOf(plan)) && VJ.planOfSpec([{ name: 'A', fd: 3 }]) === null && VJ.planOfSpec([{ name: 'A', fd: 4 }, { name: 'A', fd: 5 }]) === null && VJ.planOfSpec([{ name: 'a', fd: 4 }]) === null && VJ.planOfSpec([]) === null, 'the wrapper reads only a plan of this shape (fd 4 + i, unique upper-case names)');
}

console.log('⑤ THE FRAME');
{
  const sent = Buffer.from('sentinel-value-ü-' + 'x'.repeat(40));
  const plan = VJ.fdPlan([{ name: 'A' }, { name: 'B' }]);
  const f = VJ.encodeFrame([{ name: 'A', value: sent }, { name: 'B', value: Buffer.from('second-value-123') }]);
  const d = VJ.decodeFrame(f, plan);
  ok(d.ok && d.values[0].equals(sent) && d.values[1].toString() === 'second-value-123', 'the round trip: each value, byte for byte');
  ok(f.toString('latin1').indexOf(sent.toString('latin1')) === 4 + 1 + 1 + 1 + 4 && !f.includes(Buffer.from(JSON.stringify(sent.toString()))), 'the bytes ride RAW after their length — never a JSON string (a copy that can be zeroed)');
  const bads = [['magic', Buffer.concat([Buffer.from('XXXX'), f.subarray(4)])], ['count', VJ.encodeFrame([{ name: 'A', value: sent }])], ['names', VJ.encodeFrame([{ name: 'B', value: sent }, { name: 'A', value: sent }])], ['cut', f.subarray(0, f.length - 3)], ['tail', Buffer.concat([f, Buffer.from('z')])], ['empty', Buffer.alloc(0)]];
  for (const [n, b] of bads) { const r = VJ.decodeFrame(b, plan); ok(!r.ok && !r.why.includes('sentinel') && !r.why.includes('second'), `a frame with a bad ${n} is refused in words that hold none of it (${r.why})`); }
  let big = null; try { VJ.encodeFrame([{ name: 'A', value: Buffer.alloc(VJ.PAYLOAD_MAX) }]); } catch (e) { big = e.code; }
  ok(big === 'payload_too_large', `a frame past ${VJ.PAYLOAD_MAX / 1024} KiB is refused`);
}

console.log('⑥ MUTANTS (each a copy compiled at the real path — RED)');
{
  const Module = require('module');
  const real = fs.readFileSync(SRC, 'utf8');
  const mutant = (from, to) => {
    const n = real.split(from).length - 1;
    if (n !== 1) return { anchor: n };
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
  ];
  for (const [n, from, to, red] of legs) {
    const M = mutant(from, to);
    ok(M && !M.anchor && red(M) && !red(VJ), `CONTROL — ${n}: the copy is RED, the real module green`, M && M.anchor);
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

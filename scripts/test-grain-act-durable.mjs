#!/usr/bin/env node
// test-grain-act-durable — lane lg-group-parents (B-526c, unit 1): AN ACCESS-DIALOG SAVE IS APPLIED AT ONCE. FAST (real processes,
// no server, no browser).
// The person's symptom: on slow storage a NEW watcher or rule in the Access dialog read «Saving…» for 4–9 s — every grain save
// waited for the channel index's durable write. Now the act's durable half is the GRANTS RECORD (synchronous, before the answer):
// the watch row's entries carry each watcher's SETTINGS (an inline filter's body with it), a rule's rows its account and pattern,
// the watch row the agents whose own watch the person removed; the index's copy follows at its pace, and the boot completes an
// act the stop cut short — ONCE, said in the journal.
//   ① PURE — the model: the carried fields typed; an OLDER record (a bare entry) reads exactly as before; an OLDER model (no
//      channel-watch fields) reads a newer record's WHO the same; `rule` / `blocks` kept on their rows only, a bad one refused at
//      the write by name and dropped at the read; the store keeps a row that holds only a block and lands a change of it alone;
//      a watcher → its entry → the watcher (the settings round-trip)
//   ② THE ANSWER BEFORE THE INDEX'S DISK — a REAL process whose store writer never writes: the person's two acts (a NEW rule with a
//      filtered digest watcher; Notify… saved without the agent's own row) are answered; grants.json holds both; the index files
//      hold neither. RED: the old spelling (the index's durable write awaited) — no answer
//   ③ THE KILL BETWEEN THE TWO WRITES — that process SIGKILLed right after its answers; a SECOND real process boots over the same
//      data folder: the journal says the completion once; the rule matches its pattern and its watcher wakes with its settings
//      (only the message its filter names is held, its digest delivers it); the agent's own re-watch is refused (the block came
//      back). A THIRD boot completes nothing. RED: a boot without the completion — no rule, nothing held, the re-watch let through
// Run: node scripts/test-grain-act-durable.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SELF = fileURLToPath(import.meta.url);
const A = 'fake-poll', C = 'fake-poll-ops', KEY = `${A}/${C}`;
const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker' }, OTHER = { kind: 'agent', id: 'agent-2', name: 'Other' };
const AG = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: [], msgLevelFor: () => 'none' };
const acc = (p) => ({ principal: p, authority: 'draft' });
const RULE = { match: 'any', rules: [{ kind: 'title', value: 'Ops' }] };
const FILTER = { match: 'any', rules: [{ kind: 'keyword', value: 'deploy' }] };
const J = (x) => JSON.stringify(x);
const say = (o) => fs.writeSync(1, 'FACTS ' + J(o) + '\n');   // synchronous: a SIGKILL right after never loses it

// ── THE CHILD: one process of the world (`write` — the person's acts, then the kill; `boot` — a start over the same folder) ──
if (process.argv[2] === '--child') {
  const [, , , role, dataDir, mutant, boundMs] = process.argv;
  // a stand-in for the process's store writer: the real one until HELD — then the index's writes never happen (the pace
  // never comes, a durable write never settles): the stop lands between the grants record and the index's copy
  const SWM = require(path.join(REPO, 'src/store-writer.js'));
  const real = SWM.storeWriter();
  let held = false;
  const stand = new Proxy(real, { get(t, k) {
    if (held && k === 'dirty') return () => {};
    if (held && k === 'durable') return () => new Promise(() => {});
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
  SWM.storeWriter = () => stand;
  // a RED control's patched copy stands in for its module (`<file>=<copy>`): installed in the require cache before the engine loads
  if (mutant) { const [rel, copy] = mutant.split('='); const realPath = path.join(REPO, rel); require.cache[realPath] = { id: realPath, filename: realPath, loaded: true, exports: require(copy), children: [], paths: [] }; }
  const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const FAKE = require(path.join(REPO, 'src/channels/fake.js'));
  const { createChannelRegistry } = require(path.join(REPO, 'src/channels/index.js'));
  const t0 = Date.now(), clock = () => t0 + (Date.now() - t0);
  const registry = createChannelRegistry();
  registry.register(FAKE.makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'], now: clock }));
  const lines = [], delivered = [];
  const log = { log: (x) => lines.push(String(x)), warn: (x) => lines.push(String(x)), error: (x) => lines.push(String(x)) };
  const deliver = { deliverToConversation: async (cid, text) => { delivered.push({ cid, text }); return { ok: true }; }, stashFor: () => ({ stored: true }) };
  const eng = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, registry, broadcast: () => {}, userTodos: new UserTodoManager({ dataDir, now: clock }), deliver, now: clock, log, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }, { cid: 'agent-2', name: 'Other', groups: [] }] });
  const bound = (p, ms) => Promise.race([p.then((v) => ({ answered: true, v })), new Promise((r) => { setTimeout(() => r({ answered: false }), ms); })]);   // the bound keeps the process up (an answer that never comes is the RED's fact, never an exit)
  const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  const grantsRows = () => { try { return JSON.parse(read(path.join(dataDir, 'grants.json'))).rows || []; } catch { return []; } };
  const indexText = () => read(path.join(dataDir, 'channels', 'index.json')) + read(path.join(dataDir, 'channels', 'index-acts.ndjson'));
  if (role === 'write') {
    await eng.pass(A, { force: true });
    await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT), acc(OTHER)] });
    const own = await eng.agentWatch(AG, KEY, { delivery: 'next-turn' });   // the agent's OWN row on the room (the person removes it below)
    eng.store.index.flush();   // the world as a running hub has it on disk
    held = true;
    const ms = Number(boundMs) || 5000;
    const a0 = Date.now();
    const r1 = await bound(eng.setGrain(A, { kind: 'pattern' }, { pattern: RULE, access: [acc(OTHER)], watchers: [{ principal: AGENT, delivery: 'wake', notify: 'digest', digestMinutes: 45, dailyWakeCap: 7, mode: 'filtered', filter: FILTER }] }, { by: 'user' }), ms);
    const r1ms = Date.now() - a0;
    const pid = r1.answered && r1.v && r1.v.grain ? r1.v.grain.id : null;
    const r2 = r1.answered ? await bound(eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [] }, { by: 'user' }), ms) : { answered: false, skipped: true };
    const rows = grantsRows();
    const ruleRows = rows.filter((r) => pid && r.resource === `rule:${pid}`);
    const watchRule = ruleRows.find((r) => r.door === 'channel-watch') || null, roomWatch = rows.find((r) => r.door === 'channel-watch' && r.resource === `conversation:${KEY}`) || null;
    const ix = indexText();
    say({ role, own: { ok: !!own.ok, code: own.code || null }, act1: { answered: r1.answered, ok: !!(r1.v && r1.v.ok), ms: r1ms, pid }, act2: { answered: r2.answered, ok: !!(r2.v && r2.v.ok) },
      grants: { ruleRows: ruleRows.map((r) => r.door).sort(), rule: watchRule && watchRule.rule ? { adapterId: watchRule.rule.adapterId, pattern: watchRule.rule.pattern } : null, entry: watchRule && watchRule.to[0] ? (({ kind, key, notify, mode, digestMinutes, dailyWakeCap, delivery, filterId, filter }) => ({ kind, key, notify, mode, digestMinutes, dailyWakeCap, delivery, filterId: !!filterId, filter }))(watchRule.to[0]) : null, roomBlocks: roomWatch ? roomWatch.blocks || null : null, roomTo: roomWatch ? roomWatch.to.length : null },
      index: { rule: !!pid && ix.includes(pid), filter: ix.includes('"deploy"'), block: ix.includes('agentWatchBlocks') } });
    process.kill(process.pid, 'SIGKILL');
  }
  if (role === 'boot') {
    eng.start();
    await eng.store.index.update(() => {}); await eng.store.index.update(() => {});   // behind the boot's own queued completion
    const pas = eng.store.index.table('patternAssignments') || {};
    const pid = Object.keys(pas).find((k) => pas[k] && pas[k].adapterId === A) || null;
    const pa = pid ? pas[pid] : null;
    const w = pa && Array.isArray(pa.watchers) ? pa.watchers.find((x) => x && x.principal && x.principal.id === 'agent-1') : null;
    const filters = eng.store.index.table('filters') || {};
    const blocks = eng.store.index.table('agentWatchBlocks') || {};
    const roomWatchers = ((eng.store.index.live()[KEY] || {}).watchers || []).map((x) => x && x.principal && x.principal.id);
    // the wake, by the reader that fires: two fresh messages on the room — only the one the watcher's filter names is held for it
    const rec = eng.adapterRecords().adapters.find((r) => r.id === A);
    const base = (() => { const m = eng.messages(A, C, { limit: 1 }); return ((m && m.records) || m || [])[0] || {}; })();
    const fresh = [{ ...base, id: `${C}-b526c-1`, vendorId: 'b526c-1', text: 'deploy at noon', at: clock() }, { ...base, id: `${C}-b526c-2`, vendorId: 'b526c-2', text: 'lunch at noon', at: clock() + 1 }];
    await eng.onFresh(rec, C, fresh, { origin: 'test' });
    if (eng.settleWakes) await eng.settleWakes();
    const held = ((eng.store.index.live()[KEY] || {}).pending || []).filter((x) => x && x.for === 'agent:agent-1').map((x) => x.record && x.record.text);
    const fl = pid ? await eng.flushScope(A, 'pattern', pid, 'agent:agent-1') : null;
    if (eng.settleWakes) await eng.settleWakes();
    const rewatch = await eng.agentWatch(AG, KEY, { delivery: 'next-turn' });
    eng.stop();
    say({ role, journal: lines.filter((l) => /grain|completed|carried|without access/.test(l)), roomWatchers, rule: pa ? { pattern: pa.pattern } : null,
      watcher: w ? { notify: w.notify, mode: w.mode, digestMinutes: w.digestMinutes, dailyWakeCap: w.dailyWakeCap, delivery: w.delivery || null, filter: w.filterId && filters[w.filterId] ? filters[w.filterId].rules : null } : null,
      block: Object.keys(blocks).filter((k) => k.endsWith('|agent:agent-1')), held, flushed: fl ? !!fl.ok : null, delivered: delivered.filter((d) => d.cid === 'agent-1').map((d) => /deploy at noon/.test(d.text) && !/lunch at noon/.test(d.text)), rewatch: { ok: !!rewatch.ok, code: rewatch.code || null } });
    process.exit(0);
  }
}

// ── THE SUITE ──
const { ok, report } = checker();
const ROOT = scratch('grain-act-durable');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const MUT = mutantCopies('grain-act-durable', REPO);
const GM = require(path.join(REPO, 'src/grant-model.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const CGM = require(path.join(REPO, 'src/server/channels-grants.js'));
const F = require(path.join(REPO, 'src/channel-filter.js'));

console.log('① PURE: what the record carries — typed, an older record read as before, an older model reads WHO the same');
{
  const entry = { kind: 'conversation', key: 'agent-1', name: 'Worker', notify: 'digest', mode: 'filtered', digestMinutes: 45, dailyWakeCap: 0, receiptWake: false, delivery: 'wake', filterId: 'f-pattern-pa-1|agent:agent-1', filter: FILTER, at: 7, by: 'user' };
  const w = GM.validateWrite('channel-watch', 'rule:pa-1', { to: [entry], rule: { adapterId: A, pattern: RULE, at: 7 }, blocks: [{ key: 'agent:agent-2', at: 6, by: 'user' }] });
  const kept = w.ok ? w.row.to[0] : null;
  const facts = { ok: w.ok, entry: kept, rule: w.ok ? w.row.rule : null, blocks: w.ok ? w.row.blocks : null };
  console.log('    the written row: ' + J(facts));
  ok(!!(w.ok && kept.notify === 'digest' && kept.mode === 'filtered' && kept.digestMinutes === 45 && kept.dailyWakeCap === 0 && !('receiptWake' in kept) && kept.delivery === 'wake' && J(kept.filter) === J(FILTER) && kept.at === 7
    && J(w.row.rule) === J({ adapterId: A, pattern: RULE, at: 7 }) && J(w.row.blocks) === J([{ key: 'agent:agent-2', at: 6, by: 'user' }])),
    'a watch entry carries its watcher\'s settings (a daily cap of 0 kept, a false flag not stored, the inline filter\'s body); a rule row its record; a watch row its blocks', facts);
  const bad = [['dailyWakeCap', -1], ['digestMinutes', 0], ['notify', 'loud'], ['mode', 'some'], ['receiptWake', 'yes'], ['filter', [1]], ['filterId', 'a\nb'], ['via', 'x'.repeat(513)], ['filter', { rules: ['x'.repeat(GM.BLOB_MAX)] }]]
    .map(([f, v]) => [f, GM.validateWrite('channel-watch', 'account:a', { to: [{ kind: 'everyone', [f]: v }] }).code]);
  console.log('    each bad setting at the write: ' + J(bad));
  ok(!!(bad.every(([, c]) => c === 'bad_principal')), 'a setting that cannot be read refuses the WRITE by name (bad_principal) — a negative cap, a 0-minute digest, a word outside the set, a list as a filter, a control character, an over-bound text or body', bad);
  const rf = [GM.validateWrite('channel-watch', 'account:a', { to: [], rule: { adapterId: A, pattern: RULE } }).code, GM.validateWrite('channel-api', 'acct-1', { to: [], blocks: [{ key: 'agent:x' }] }).code, GM.validateWrite('channel-watch', 'account:a', { to: [], blocks: [{ key: 'nobody' }] }).code];
  const readBack = GM.normRow({ door: 'channel-reach', resource: 'account:a', to: [{ kind: 'everyone' }], except: [], rule: { adapterId: A, pattern: RULE }, blocks: [{ key: 'agent:x' }] });
  console.log('    a row field off its row: ' + J({ writes: rf, read: readBack.row }));
  ok(!!(J(rf) === J(['bad_row', 'bad_row', 'bad_row']) && readBack.ok && !('rule' in readBack.row) && !('blocks' in readBack.row) && readBack.row.to.length === 1),
    '`rule` only on a rule:<id> row, `blocks` only on a watch row, a block a principal key — refused at the write (bad_row), DROPPED at the read (the lists still read)', { rf, read: readBack.row });
  // AN OLDER RECORD: a bare watch entry — read exactly as it was written (nothing invented)
  const older = { door: 'channel-watch', resource: 'conversation:fake-poll/c1', to: [{ kind: 'conversation', key: 'agent-1', name: 'Worker' }, { kind: 'group', id: 'g1' }], except: [], at: 3, by: 'user' };
  const ro = GM.normRow(older);
  console.log('    an older record read: ' + J(ro.row));
  ok(!!(ro.ok && J(ro.row) === J(older)), 'an OLDER record (a bare principal per entry, no carried field) reads exactly as written', ro.row);
  // AN OLDER MODEL reading a newer record: no channel-watch fields — the entry's WHO the same, its settings dropped (never the entry)
  const gsrc = fs.readFileSync(path.join(REPO, 'src/grant-model.js'), 'utf8');
  const OLD = MUT.load('src/grant-model.js', anchored(gsrc, /\n  'channel-watch': Object\.freeze\(\{ notify:[^\n]*\n/, '\n', 'an older model: no channel-watch fields'), 'older-model');
  const newer = { door: 'channel-watch', resource: 'rule:pa-1', to: [entry], except: [], rule: { adapterId: A, pattern: RULE } };
  const nOld = OLD.normRow(newer), nNew = GM.normRow(newer);
  const facts2 = { old: nOld.row && nOld.row.to, oldAdmits: OLD.admits([nOld.row], { conversationKey: 'agent-1', groupIds: [] }).ok, newAdmits: GM.admits([nNew.row], { conversationKey: 'agent-1', groupIds: [] }).ok, otherOld: OLD.admits([nOld.row], { conversationKey: 'agent-9', groupIds: [] }).ok };
  console.log('    an older model reads the newer record: ' + J(facts2));
  ok(!!(nOld.ok && nOld.row.to.length === 1 && J(Object.keys(nOld.row.to[0]).sort()) === J(['at', 'by', 'key', 'kind', 'name']) && facts2.oldAdmits && facts2.newAdmits && !facts2.otherOld),
    'an OLDER model (no channel-watch fields) keeps the entry — its WHO judged exactly as this release judges it — and drops the settings it cannot read', facts2);
  // THE STORE: a row holding only a block is a row; a change of what it carries alone lands
  const s = GS.create({ memory: true });
  const b1 = s.setMany([{ door: 'channel-watch', resource: 'account:a', to: [], except: [], blocks: [{ key: 'agent:x', at: 1 }] }], 'user');
  const kept1 = s.rowsFor('channel-watch', 'account:a').length;
  const p1 = s.setMany([{ door: 'channel-reach', resource: 'rule:pa-1', to: [{ kind: 'everyone' }], except: [], rule: { adapterId: A, pattern: RULE } }], 'user');
  const p2 = s.setMany([{ door: 'channel-reach', resource: 'rule:pa-1', to: [{ kind: 'everyone' }], except: [], rule: { adapterId: A, pattern: { match: 'any', rules: [{ kind: 'title', value: 'Dev' }] } } }], 'user');
  const p3 = s.setMany([{ door: 'channel-reach', resource: 'rule:pa-1', to: [{ kind: 'everyone' }], except: [], rule: { adapterId: A, pattern: { match: 'any', rules: [{ kind: 'title', value: 'Dev' }] } } }], 'user');
  const gone = s.setMany([{ door: 'channel-watch', resource: 'account:a', to: [], except: [] }], 'user');
  const facts3 = { blockOnly: b1.changed && b1.changed.length, kept1, patternChange: p2.changed && p2.changed.length, same: p3.changed && p3.changed.length, removed: gone.changed && gone.changed.length, after: s.rowsFor('channel-watch', 'account:a').length };
  console.log('    the store: ' + J(facts3));
  ok(!!(facts3.blockOnly === 1 && kept1 === 1 && p1.ok && facts3.patternChange === 1 && facts3.same === 0 && facts3.removed === 1 && facts3.after === 0),
    'the ONE writer keeps a watch row that holds only a block (the person removed the agent\'s only watch there), lands a rule\'s pattern changed alone, writes nothing for the same record, removes the row when nothing is carried', facts3);
  // THE ROUND TRIP: a validated watcher → its carried entry → the watcher the boot writes
  const cg = CGM.create({ grants: s });
  const vw = F.validateWatcher({ principal: AGENT, notify: 'digest', mode: 'filtered', filterId: 'f-x|agent:agent-1', digestMinutes: 45, dailyWakeCap: 7, receiptWake: true, delivery: 'next-turn', origin: 'agent' }).watcher;
  const row0 = { ...vw, createdAt: 5, updatedAt: 9, createdBy: 'agent:agent-1' };
  const e0 = cg.entryOfWatch(row0, FILTER, []), back = cg.watcherOfEntry(e0, null);
  const pick = (x) => J(['notify', 'mode', 'filterId', 'digestMinutes', 'dailyWakeCap', 'receiptWake', 'delivery', 'origin'].map((k) => x[k]));
  console.log('    round trip: ' + J({ entry: e0, back }));
  ok(!!(pick(back) === pick(row0) && back.updatedAt === 9 && back.principal.id === 'agent-1' && J(e0.filter) === J(FILTER) && cg.watcherOfEntry({ kind: 'conversation', key: 'agent-1' }) === null),
    'a watcher → its entry → the watcher: every setting the same (its updatedAt the entry\'s `at`); a bare entry stands for no settings (null)', { e0, back });
  const short = [];
  const big = cg.entryOfWatch({ ...row0, mode: 'filtered' }, { rules: ['x'.repeat(GM.BLOB_MAX)] }, short);
  ok(!!(J(Object.keys(big).sort()) === J(['key', 'kind', 'name']) && J(short) === J(['conversation:agent-1'])),
    'a filter body over the bound is not carried: the BARE principal, its key named in `short` (that act waits for the index\'s disk)', { big, short });
}

/** run ONE child of the world (a process this suite starts — the only one it may signal: its own bound) → its FACTS + how it ended */
function child(role, dir, { mutant = '', boundMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [SELF, '--child', role, dir, mutant, String(boundMs)], { env: { ...process.env, VS_NO_REAL_CLI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const bound = setTimeout(() => c.kill('SIGKILL'), 60000);
    c.on('close', (status, signal) => {
      clearTimeout(bound);
      const line = out.split('\n').find((l) => l.startsWith('FACTS '));
      let facts = null; try { facts = line ? JSON.parse(line.slice(6)) : null; } catch { }
      resolve({ facts, status, signal, err: err.slice(-1200) });
    });
  });
}
const asrc = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf8');
// the two RED copies (each built by its anchor — gone or twice ⇒ the suite stops by name)
const OLD_DURABLE = MUT.write('src/server/channels-access.js', anchored(asrc, '    else await store.index.update(writeIndex);', '    else await store.index.update(writeIndex, { durable: true });', 'the old spelling: the answer waits for the index\'s disk'), 'old-durable');
const NO_COMPLETION = MUT.write('src/server/channels-access.js', anchored(asrc, '  async function completeGrainActs() {\n', '  async function completeGrainActs() {\n    return { completed: [], skipped: [] };\n', 'no boot completion'), 'no-completion');
const NO_REMOVAL = MUT.write('src/server/channels-access.js', anchored(asrc, '            if (apply && gone.length) holder.watchers = holder.watchers.filter((w) => !gone.includes(w));\n', '', 'the completion keeps a removed watcher'), 'no-removal');
const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
const SWEEP_FIRST = MUT.write('src/server/channels-engine.js', anchored(esrc, '    if (owedAtBoot) track(completing.then(sweepNow)); else sweepNow();\n', '    sweepNow();\n', 'the boot sweep before the completion'), 'sweep-first');
const ACC = (f) => `src/server/channels-access.js=${f}`, ENGF = (f) => `src/server/channels-engine.js=${f}`;
// THREE independent worlds at once: the kill and two boots · the RED writer · the RED boot (after its own kill)
const D1 = path.join(ROOT, 'w1'), D2 = path.join(ROOT, 'w2'), D3 = path.join(ROOT, 'w3'), D4 = path.join(ROOT, 'w4');
const t0 = Date.now();
const killThenBoot = async (dir, mutant) => { const w2 = await child('write', dir); const b = await child('boot', dir, { mutant }); return { w2, b }; };
const [W1, RED_W, RED_B, RED_R, RED_S] = await Promise.all([
  (async () => { const w = await child('write', D1); const b1 = await child('boot', D1); const b2 = await child('boot', D1); return { w, b1, b2 }; })(),
  child('write', path.join(ROOT, 'w-red'), { mutant: ACC(OLD_DURABLE), boundMs: 2500 }),
  killThenBoot(D2, ACC(NO_COMPLETION)), killThenBoot(D3, ACC(NO_REMOVAL)), killThenBoot(D4, ENGF(SWEEP_FIRST)),
]);
console.log(`    (the five worlds, ten processes, in ${Date.now() - t0} ms)`);

console.log('② THE ANSWER BEFORE THE INDEX\'S DISK — a real process whose store writer never writes');
const w1 = W1.w;
console.log('    the writer: ' + J({ facts: w1.facts, signal: w1.signal }) + (w1.facts ? '' : ' — stderr: ' + w1.err));
{
  const f = w1.facts || {};
  ok(!!(f.act1 && f.act1.answered && f.act1.ok && f.act2 && f.act2.answered && f.act2.ok && f.own && f.own.ok),
    `the person's two acts are ANSWERED with the index's writes held (the new rule in ${f.act1 && f.act1.ms} ms; Notify… saved without the agent's own row) — no answer waits for the index's disk`, f);
  ok(!!(f.grants && J(f.grants.ruleRows) === J(['channel-reach', 'channel-watch']) && f.grants.rule && J(f.grants.rule.pattern) === J(RULE) && f.grants.rule.adapterId === A
    && f.grants.entry && f.grants.entry.notify === 'digest' && f.grants.entry.digestMinutes === 45 && f.grants.entry.dailyWakeCap === 7 && f.grants.entry.mode === 'filtered' && f.grants.entry.filterId && J(f.grants.entry.filter) === J({ name: null, ...FILTER })
    && J(f.grants.roomBlocks && f.grants.roomBlocks.map((b) => b.key)) === J(['agent:agent-1']) && f.grants.roomTo === 0),
    'grants.json holds the WHOLE act at the answer: the rule\'s two rows with its account and pattern, the watcher\'s settings and filter body on its entry, the room\'s watch row holding the agent\'s block', f.grants);
  ok(!!(f.index && !f.index.rule && !f.index.filter && !f.index.block), 'the channel index on disk holds none of it — the stop below lands BETWEEN the two writes (read from the disk, not assumed)', f.index);
  ok(!!(w1.signal === 'SIGKILL'), `the writer process was killed by SIGKILL right after its answers (${w1.signal})`);
}
{ // RED: the old spelling — the index's durable write awaited — never answers while the index's disk never writes
  const r = RED_W;
  console.log('    RED writer: ' + J({ act1: r.facts && r.facts.act1, signal: r.signal }));
  ok(!!(r.facts && r.facts.act1 && r.facts.act1.answered === false), 'RED «the answer waits for the index\'s disk» (the durable spelling restored): the new rule gets NO answer within 2.5 s — the person\'s «Saving…»', r.facts || r.err);
}

console.log('③ THE KILL BETWEEN THE TWO WRITES — a second real process boots over the same folder');
{
  const b1 = W1.b1;
  const f = b1.facts || {};
  console.log('    the boot: ' + J(f) + (b1.facts ? '' : ' — stderr: ' + b1.err));
  const done = (f.journal || []).filter((l) => /boot: completed \d+ parts? of the Access dialog's acts the stop cut short/.test(l));
  ok(!!(done.length === 1 && /rule pa-[^ ]+ \(its record\)/.test(done[0]) && /agent:agent-1 on rule:pa-/.test(done[0]) && /filter f-pattern-pa-/.test(done[0]) && /agent:agent-1's own watch on conversation:fake-poll\/fake-poll-ops \(its block\)/.test(done[0])),
    'the journal says the completion ONCE, naming each part: the rule\'s record, its watcher, its filter, the agent\'s block', f.journal);
  ok(!!(f.rule && J(f.rule.pattern) === J(RULE) && f.watcher && f.watcher.notify === 'digest' && f.watcher.digestMinutes === 45 && f.watcher.dailyWakeCap === 7 && f.watcher.mode === 'filtered' && f.watcher.delivery === 'wake' && J(f.watcher.filter) === J(FILTER.rules)),
    'the rule is back with its pattern and its watcher with EVERY setting — never who without its settings', { rule: f.rule, watcher: f.watcher });
  ok(!!(J(f.held) === J(['deploy at noon']) && f.flushed === true && J(f.delivered) === J([true])),
    'the watcher WAKES with its settings: of two fresh messages on «Ops room» only the one its filter names is held for it, and its digest delivers exactly that', { held: f.held, flushed: f.flushed, delivered: f.delivered });
  ok(!!(f.rewatch && f.rewatch.code === 'removed-by-user' && J(f.block) === J(['conversation:fake-poll/fake-poll-ops|agent:agent-1'])), 'the agent\'s own re-watch on the room is refused «removed-by-user» — the block the person\'s save left came back with the act', { rewatch: f.rewatch, block: f.block });
  ok(!!(done.length === 1 && /agent:agent-1 on conversation:fake-poll\/fake-poll-ops \(removed\)/.test(done[0]) && J(f.roomWatchers) === J([]) && !(f.journal || []).some((l) => /without access/.test(l))),
    'the agent\'s own row the person removed LEAVES the index with the act (the room stores no watcher) — and the boot\'s census, read after the completion, reports no row without access', { roomWatchers: f.roomWatchers, journal: f.journal });
  const b2 = W1.b2;
  const g = b2.facts || {};
  console.log('    a third boot: ' + J({ journal: g.journal, rule: !!g.rule, watcher: !!g.watcher }));
  ok(!!(b2.facts && !(g.journal || []).some((l) => /completed|not completed/.test(l)) && g.rule && g.watcher && g.watcher.notify === 'digest'), 'a THIRD boot completes nothing (idempotent — the journal says nothing) and the act stands', g);
}
{ // RED: a boot without the completion — the record is ahead of the index for good
  const { w2, b } = RED_B;
  const f = b.facts || {};
  console.log('    RED boot: ' + J({ writer: w2.facts && w2.facts.act1, boot: f }));
  ok(!!(w2.facts && w2.facts.act1 && w2.facts.act1.ok && b.facts && !f.rule && !f.watcher && J(f.held) === J([]) && f.rewatch && f.rewatch.ok === true),
    'RED «no boot completion»: the same kill ⇒ no rule, nothing held for the watcher, the agent\'s own re-watch let through — the act half on disk, half lost', f);
}
{ // RED: the completion keeps a removed watcher — the person's removal half done
  const f = (RED_R.b && RED_R.b.facts) || {};
  console.log('    RED boot (no removal): ' + J({ roomWatchers: f.roomWatchers, journal: f.journal }));
  ok(!!(RED_R.b.facts && J(f.roomWatchers) === J(['agent-1']) && f.rule && f.rewatch && f.rewatch.code === 'removed-by-user'), 'RED «the completion keeps a removed watcher»: the agent\'s own row the person removed stays stored on the room (the rest completed)', f);
}
{ // RED: the boot sweep before the completion — its census reads the index the stop left
  const f = (RED_S.b && RED_S.b.facts) || {};
  console.log('    RED boot (the sweep first): ' + J({ journal: f.journal }));
  ok(!!(RED_S.b.facts && (f.journal || []).some((l) => /notification row\(s\) without access.*agent:agent-1 on conversation fake-poll\/fake-poll-ops/.test(l)) && J(f.roomWatchers) === J([])),
    'RED «the boot sweep before the completion»: its census reports the removed row as a notification «without access» — a row the completion takes away a moment later', f.journal);
}

report();

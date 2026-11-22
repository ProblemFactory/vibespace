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
//      THE RELEASE's model is the release's OWN file (a3f329c05's src/grant-model.js bytes, their sha256 pinned — r2541 (b))
//   ② THE ANSWER BEFORE THE INDEX'S DISK — a REAL process whose store writer never writes: the person's two acts (a NEW rule with a
//      filtered digest watcher; Notify… saved without the agent's own row) are answered; grants.json holds both; the index files
//      hold neither. RED: the old spelling (the index's durable write awaited) — no answer
//   ③ THE KILL BETWEEN THE TWO WRITES — that process SIGKILLed right after its answers; a SECOND real process boots over the same
//      data folder: the journal says the completion once; the rule matches its pattern and its watcher wakes with its settings
//      (only the message its filter names is held, its digest delivers it); the agent's own re-watch is refused (the block came
//      back). A THIRD boot completes nothing. RED: a boot without the completion — no rule, nothing held; the re-watch is still
//      refused by the RECORD's block (r937 (a)) — and with the index-only check, let through
//   ④ r937 — THE LAW: an act told «done» is at every instant either on the index's disk or completable from the record; after a
//      completed boot the count an agent's own limit (and its wake-ask card) is judged by EQUALS the record's. Real killed
//      processes, each with its red: MUST 1 an agent's own watch on a conversation BORN inside the pace (its act keeps the
//      durable write: the row rides its journal line); MUST 2 an agent's own unwatch that EMPTIES the row (kept `cleared`, the
//      boot redoes the removal); (b) an edit across a clock that stepped back (its stamp monotonic); a body over its bound waits
//      for the index's disk; (c) a row the boot cannot complete is said ONCE
//   ⑤ r1040 (the follow) — a row written short (its blocks past what the record carries) LIFTS NOTHING at a boot; «last» for the act's
//      stamp is the grain's newest over the index's rows AND the record's own (a watch removed and set again inside the pace, the
//      clock stepped back, a kill); a conversation's own filter, edited through its route, is never put back at a boot (inline ids
//      are only those with the bar). Real processes, each with its red
// Run: node scripts/test-grain-act-durable.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  const [, , , role, dataDir, mutant, boundMs, holdMode] = process.argv;
  // a stand-in for the process's store writer: the real one until HELD — then the index's writes never happen (the pace
  // never comes, a durable write never settles): the stop lands between the grants record and the index's copy
  const SWM = require(path.join(REPO, 'src/store-writer.js'));
  const real = SWM.storeWriter();
  let held = false;
  // `index` mode (r937 legs): only the index FILE's paced writes are held — an act's journal line lands (a durable act is on disk)
  const onlyIndex = holdMode === 'index';
  const stand = new Proxy(real, { get(t, k) {
    if (held && k === 'dirty') return onlyIndex ? (file, o) => (/index\.json$/.test(String(file)) ? undefined : t.dirty(file, o)) : () => {};
    if (held && k === 'durable' && !onlyIndex) return () => new Promise(() => {});
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
  SWM.storeWriter = () => stand;
  // a RED control's patched copy stands in for its module (`<file>=<copy>`): installed in the require cache before the engine loads
  if (mutant) { for (const one of mutant.split(',').filter(Boolean)) { const [rel, copy] = one.split('='); const realPath = path.join(REPO, rel); require.cache[realPath] = { id: realPath, filename: realPath, loaded: true, exports: require(copy), children: [], paths: [] }; } }
  const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const FAKE = require(path.join(REPO, 'src/channels/fake.js'));
  const { createChannelRegistry } = require(path.join(REPO, 'src/channels/index.js'));
  const t0 = Date.now();
  let skew = 0;
  const clock = () => t0 + (Date.now() - t0) + skew;   // r937 (b): a leg may step the clock BACK
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
  const NEW = 'fake-poll-b526c-new', KEY_NEW = `${A}/${NEW}`;
  const recordCount = () => grantsRows().filter((r) => r.door === 'channel-watch').reduce((n, r) => n + (r.to || []).filter((e) => e && e.kind === 'conversation' && e.key === 'agent-1' && e.origin === 'agent').length, 0);
  const seed = async () => { await eng.pass(A, { force: true }); await eng.setGrain(A, { kind: 'account' }, { access: [acc(AGENT), acc(OTHER)] }); };
  const ms = Number(boundMs) || 5000;
  if (role === 'write-new') {   // MUST 1: an agent's own watch on a conversation the hub met inside the pace
    await seed(); eng.store.index.flush(); held = true;
    await eng.store.index.update(() => { const e = eng.store.index.entry(A, NEW); e.title = 'Fresh room'; e.kind = 'group'; });   // a row born, only queued
    const landedBefore = typeof eng.store.index.landed === 'function' ? eng.store.index.landed(KEY_NEW) : null;
    const r = await bound(eng.agentWatch(AG, KEY_NEW, { delivery: 'next-turn' }), ms);
    const ix = read(path.join(dataDir, 'channels', 'index.json')), acts = read(path.join(dataDir, 'channels', 'index-acts.ndjson'));
    say({ role, landedBefore, watch: { answered: r.answered, ok: !!(r.v && r.v.ok), code: r.v && r.v.code }, inIndexFile: ix.includes(NEW), inJournal: acts.includes(NEW), recordCount: recordCount() });
    process.kill(process.pid, 'SIGKILL');
  }
  if (role === 'write-unwatch') {   // MUST 2: an agent's own unwatch that EMPTIES the room's watch row
    await seed();
    const own = await eng.agentWatch(AG, KEY, { delivery: 'next-turn' });
    eng.store.index.flush(); held = true;
    const r = await bound(eng.agentUnwatch(AG, KEY), ms);
    const row = grantsRows().find((x) => x.door === 'channel-watch' && x.resource === `conversation:${KEY}`) || null;
    say({ role, own: !!own.ok, unwatch: { answered: r.answered, ok: !!(r.v && r.v.ok), removed: !!(r.v && r.v.removed) }, row: row ? { to: row.to.length, cleared: !!row.cleared } : null, recordCount: recordCount(), countNow: eng.agentWatchCount ? eng.agentWatchCount('agent:agent-1') : null });
    process.kill(process.pid, 'SIGKILL');
  }
  if (role === 'write-edit') {   // (b): the person's edit across a clock that stepped back an hour
    await seed();
    await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'wake', notify: 'wake', dailyWakeCap: 7 }] }, { by: 'user' });
    eng.store.index.flush(); held = true;
    skew = -3600e3;
    const r = await bound(eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'next-turn', notify: 'digest', digestMinutes: 30, dailyWakeCap: 1 }] }, { by: 'user' }), ms);
    say({ role, edit: { answered: r.answered, ok: !!(r.v && r.v.ok) } });
    process.kill(process.pid, 'SIGKILL');
  }
  if (role === 'write-big') {   // a body over its bound is not carried: that save waits for the index's disk, as before
    await seed(); eng.store.index.flush(); held = true;
    const big = { match: 'any', rules: Array.from({ length: 40 }, (_, i) => ({ kind: 'keyword', value: `w${i}-` + 'x'.repeat(480) })) };
    const r = await bound(eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'wake', mode: 'filtered', filter: big }] }, { by: 'user' }), ms);
    say({ role, bodyBytes: Buffer.byteLength(JSON.stringify(big)), big: { answered: r.answered } });
    process.kill(process.pid, 'SIGKILL');
  }
  if (role === 'write-gone') {   // (c): a carrying row whose conversation the index no longer lists (its row removed, on disk)
    await seed(); await eng.agentWatch(AG, KEY, { delivery: 'next-turn' }); eng.store.index.flush();
    await eng.store.index.update((ix) => { delete ix.conversations[KEY]; }); eng.store.index.flush(); eng.stop();
    say({ role, gone: !eng.store.index.peek(KEY) });
    process.exit(0);
  }
  const F1 = { match: 'any', rules: [{ kind: 'keyword', value: 'alpha' }] }, F2 = { match: 'any', rules: [{ kind: 'keyword', value: 'beta' }] }, F3 = { match: 'any', rules: [{ kind: 'keyword', value: 'gamma' }] };
  if (role === 'write-blockshort') {   // r1040 1: a block the record cannot carry — the save is written short (durable), nothing is lifted
    await seed();
    await eng.agentWatch(AG, KEY, { delivery: 'next-turn' });
    await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [] }, { by: 'user' });   // the person removes the agent's own row: its block
    await eng.store.index.update((ix) => { ix.agentWatchBlocks[`conversation:${KEY}|not a key`] = { at: clock(), by: 'user' }; });   // a key the record cannot read
    eng.store.index.flush(); held = true;
    const r = await bound(eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: OTHER, delivery: 'next-turn' }] }, { by: 'user' }), ms);
    const row = grantsRows().find((x) => x.door === 'channel-watch' && x.resource === `conversation:${KEY}`) || null;
    say({ role, save: { answered: r.answered, ok: !!(r.v && r.v.ok) }, rowBlocks: row ? ('blocks' in row ? row.blocks : 'absent') : null });
    process.kill(process.pid, 'SIGKILL');
  }
  if (role === 'write-reset') {   // r1040 2: a watch removed, then set again inside the pace — the clock an hour back between them
    await seed();
    await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'wake', notify: 'wake', dailyWakeCap: 7 }] }, { by: 'user' });
    eng.store.index.flush(); held = true;
    const r1 = await bound(eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [] }, { by: 'user' }), ms);
    skew = -3600e3;
    const r2 = await bound(eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'next-turn', notify: 'digest', digestMinutes: 30, dailyWakeCap: 1 }] }, { by: 'user' }), ms);
    say({ role, removed: !!(r1.v && r1.v.ok), set: !!(r2.v && r2.v.ok) });
    process.kill(process.pid, 'SIGKILL');
  }
  if (role === 'write-filter') {   // r1040 3: the conversation's own filter, then an inline one for its watcher, then the route edits its own
    await seed();
    await eng.setFilter(A, C, F1);
    const fid = (eng.store.index.peek(KEY) || {}).filterId;
    await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'wake', mode: 'filtered', filterId: fid }] }, { by: 'user' });
    const inl = await eng.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'wake', mode: 'filtered', filter: F2 }] }, { by: 'user' });
    const ed = await eng.setFilter(A, C, F3);
    eng.store.index.flush(); eng.stop();
    const w = ((eng.store.index.peek(KEY) || {}).watchers || []).find((x) => x && x.principal && x.principal.id === 'agent-1') || {};
    say({ role, fid, inline: !!(inl && inl.ok), edit: !!(ed && ed.ok), editCode: ed && ed.code, watcherFilter: w.filterId || null });
    process.exit(0);
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
    const count = eng.agentWatchCount ? eng.agentWatchCount('agent:agent-1') : null, recCount = recordCount();
    const convFilter = filters[`f-${KEY}`] ? filters[`f-${KEY}`].rules.map((r) => r.value) : null;
    const newRow = eng.store.index.live()[KEY_NEW] || null;
    const room = ((eng.store.index.live()[KEY] || {}).watchers || []).find((x) => x && x.principal && x.principal.id === 'agent-1') || null;
    const rewatch = await eng.agentWatch(AG, KEY, { delivery: 'next-turn' });
    eng.stop();
    say({ role, count, recCount, convFilter, newRow: newRow ? { watchers: (newRow.watchers || []).map((x) => x && x.principal && x.principal.id) } : null, roomW: room ? { notify: room.notify, delivery: room.delivery || null, digestMinutes: room.digestMinutes, dailyWakeCap: room.dailyWakeCap } : null,
      journal: lines.filter((l) => /grain|completed|carried|without access/.test(l)), roomWatchers, rule: pa ? { pattern: pa.pattern } : null,
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
  // THE RELEASE's model (主开发 r2541 (b)): the release 2.369.415's OWN src/grant-model.js — its bytes, held under
  // scripts/fixtures/grain-act-durable/release-a3f329c05/ and pinned by their sha256 (git show a3f329c05:src/grant-model.js), never an
  // older tree's copy (the leg read one until r2541: 62583 bytes, not the release's 74663) — reads the newer record
  const REL_FILE = path.join(REPO, 'scripts/fixtures/grain-act-durable/release-a3f329c05/src/grant-model.js.frozen');
  const REL_SHA = 'a5c14770c7e3564d5b98b3ce5313a1788d4432147ef4d57f28cb2d8c7d55f539';
  const relBytes = fs.readFileSync(REL_FILE);
  const relSha = createHash('sha256').update(relBytes).digest('hex');
  ok(!!(relSha === REL_SHA && relBytes.length === 74663), `THE RELEASE's model is the release's own file: a3f329c05's src/grant-model.js, ${relBytes.length} bytes, sha256 ${relSha.slice(0, 16)}… (pinned)`, relSha);
  const REL = MUT.load('src/grant-model.js', relBytes.toString('utf8'), 'release-model');
  const nRel = REL.normRow({ ...newer, blocks: [{ key: 'agent:agent-2' }], cleared: 9 });
  console.log('    the release model reads the newer record: ' + J(nRel.row));
  ok(!!(nRel.ok && J(Object.keys(nRel.row).sort()) === J(['door', 'except', 'resource', 'to']) && nRel.row.to.length === 1 && !('notify' in nRel.row.to[0]) && REL.admits([nRel.row], { conversationKey: 'agent-1', groupIds: [] }).ok),
    'THE RELEASE\'s model (its own bytes, a3f329c05): the row\'s rule / blocks / cleared dropped, the entry kept with its settings dropped, WHO judged the same', nRel.row);
  const FW = GM.ENTRY_FIELDS['channel-watch'];
  ok(!!(J(FW.notify) === J(F.NOTIFY_MODES) && J(FW.mode) === J(F.ASSIGN_MODES) && J(FW.delivery) === J(F.DELIVERY_MODES) && J(FW.origin) === J(F.WATCH_ORIGINS.filter((o) => o !== 'user'))), 'the carried closed sets are channel-filter\'s own (notify, mode, delivery; origin less its default)', { FW, F: [F.NOTIFY_MODES, F.ASSIGN_MODES, F.DELIVERY_MODES, F.WATCH_ORIGINS] });
  const UD = path.join(ROOT, 'unreadable'); fs.mkdirSync(UD, { recursive: true }); fs.writeFileSync(path.join(UD, 'grants.json'), '{ not json');
  const us = GS.create({ dataDir: UD }), uc = CGM.create({ grants: us });
  ok(!!(us.health().readable === false && J(uc.rowsCarrying()) === J([])), 'an UNREADABLE grants record: the boot\'s completion reads no row (nothing completed, nothing erased)', { health: us.health(), rows: uc.rowsCarrying() });
  {
    const bs = GS.create({ memory: true }), bc = CGM.create({ grants: bs });
    const body = { match: 'any', rules: Array.from({ length: 30 }, (_, i) => ({ kind: 'keyword', value: `k${i}-` + 'y'.repeat(480) })) };
    const fid = 'f-account-a|agent:agent-1', bodies = new Map([[fid, body]]);
    const w0 = { principal: AGENT, notify: 'wake', mode: 'filtered', filterId: fid, digestMinutes: 30, dailyWakeCap: 40, receiptWake: false, updatedAt: 5 };
    const shorts = [];
    for (let i = 0; i < 20; i++) shorts.push((bc.setGrainRows(`account:a${i}`, { watchers: [w0], bodies, clearedAt: 5 }, 'user').short || []).includes('bodies'));
    const first = shorts.indexOf(true), bytes = Buffer.byteLength(JSON.stringify(body));
    console.log('    the bodies bound: ' + J({ bytes, bound: bc.CARRY_BODIES_MAX, firstShort: first }));
    ok(!!(bytes < GM.BLOB_MAX && first > 0 && first === Math.floor(bc.CARRY_BODIES_MAX / bytes) && shorts.slice(first).every(Boolean)), `the carried bodies' TOTAL bound (${bc.CARRY_BODIES_MAX} bytes): the write that would pass it (the ${first + 1}th of ${bytes}-byte bodies) carries none of its bodies — that save waits for the index's disk`, { first, bytes });
  }
  const csa = fs.readFileSync(path.join(REPO, 'src/server/channels-access.js'), 'utf8');
  ok(!!(/const own = agentWatchCount\(pkR\);/.test(csa) && /agentWatchCount\(pk\) >= F\.MAX_AGENT_WATCHES/.test(csa)), 'the wake-ask card and the agent\'s own limit read ONE count (agentWatchCount) — the count the ④ legs judge');
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
function child(role, dir, { mutant = '', boundMs = 5000, mode = 'all' } = {}) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [SELF, '--child', role, dir, mutant, String(boundMs), mode], { env: { ...process.env, VS_NO_REAL_CLI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
const CA = '  async function completeGrainActs(owed = grainActsOwedNow()) {\n';
const NO_COMPLETION = MUT.write('src/server/channels-access.js', anchored(asrc, CA, CA + '    return { completed: [], skipped: [] };\n', 'no boot completion'), 'no-completion');
const OWN_BLK = "  const ownWatchBlockOf = (scope, res, pk) => agentWatchBlockOf(scope, pk) || (((res ? CG.rowOf('channel-watch', res).blocks : null) || []).find((x) => x.key === pk) || null);\n";
const INDEX_ONLY = MUT.write('src/server/channels-access.js', anchored(anchored(asrc, CA, CA + '    return { completed: [], skipped: [] };\n', 'no boot completion (a)'), OWN_BLK, '  const ownWatchBlockOf = (scope, res, pk) => agentWatchBlockOf(scope, pk);\n', 'the refusal reads the index alone'), 'index-only');
const MUST1_OFF = MUT.write('src/server/channels-access.js', anchored(asrc, "    const unlandedRow = kind === 'conversation' && typeof store.index.landed === 'function' && !store.index.landed(site.key);\n", '    const unlandedRow = false;\n', 'an act on a conversation the disk does not list, paced'), 'must1-off');
const csrc = fs.readFileSync(path.join(REPO, 'src/server/channels-grants.js'), 'utf8');
const MUST2_OFF = MUT.write('src/server/channels-grants.js', anchored(csrc, '      const emptied = !ch.to.length && clearedAt && doorIndex(DOORS.watch).rows.has(String(res));\n', '      const emptied = false;\n', 'an emptied watch row deleted from the record'), 'must2-off');
const BY_CLOCK = MUT.write('src/server/channels-access.js', anchored(asrc, 'updatedAt: stamp,', 'updatedAt: t,', 'the stamp the bare clock (not monotonic)'), 'by-clock');
const LIFT_ALL = MUT.write('src/server/channels-access.js', anchored(asrc, '          for (const pk of Array.isArray(row.blocks) ? scopeBlocksOf(scope).keys() : []) {\n', '          for (const pk of scopeBlocksOf(scope).keys()) {\n', 'a row written short lifts its scope\'s blocks'), 'lift-all');   // stale-pins: kept — the RED plants the cure's lift-every-block walk back
const INDEX_LAST = MUT.write('src/server/channels-access.js', anchored(asrc, /    const recordLast = Math\.max\(0, [^\n]*\n/, '    const recordLast = 0;\n', '«last» read from the index alone'), 'index-last');
const REUSE_ANY = MUT.write('src/server/channels-access.js', anchored(anchored(asrc, ' && /\\|/.test(prevWatcher.filterId)) return prevWatcher.filterId;', ') return prevWatcher.filterId;', 'any f- id reused as an inline id'), '  const inlineFilterId = (fid) => /\\|/.test(fid);', '  const inlineFilterId = (fid) => /\\|/.test(fid) || /^f-/.test(fid);', 'any f- body carried'), 'reuse-any');
const NO_REMOVAL = MUT.write('src/server/channels-access.js', anchored(asrc, '            if (apply && gone.length) holder.watchers = holder.watchers.filter((w) => !gone.includes(w));\n', '', 'the completion keeps a removed watcher'), 'no-removal');
const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
const SWEEP_FIRST = MUT.write('src/server/channels-engine.js', anchored(esrc, '    if (owedAtBoot.completed.length) track(completing.then(sweepNow)); else sweepNow();\n', '    sweepNow();\n', 'the boot sweep before the completion'), 'sweep-first');
const ACC = (f) => `src/server/channels-access.js=${f}`, ENGF = (f) => `src/server/channels-engine.js=${f}`, CGF = (f) => `src/server/channels-grants.js=${f}`;
// THREE independent worlds at once: the kill and two boots · the RED writer · the RED boot (after its own kill)
const D1 = path.join(ROOT, 'w1');
const t0 = Date.now();
const killThenBoot = async (dir, mutant, { role = 'write', wm = '', mode = 'all', boots = 1 } = {}) => { const w2 = await child(role, path.join(ROOT, dir), { mutant: wm, mode }); const b = await child('boot', path.join(ROOT, dir), { mutant }); const b2 = boots > 1 ? await child('boot', path.join(ROOT, dir)) : null; return { w2, b, b2 }; };
// THE WORLDS, at most FOUR at once (each a real node process or a chain of them)
const pool = async (jobs, n) => { const out = new Array(jobs.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); } })); return out; };
const [W1, RED_W, RED_B, RED_R, RED_S, RED_A, M1, M1R, M2, M2R, BE, BER, BIG, GONE, BS, BSR, RS, RSR, FL, FLR] = await pool([
  async () => { const w = await child('write', D1); const b1 = await child('boot', D1); const b2 = await child('boot', D1); return { w, b1, b2 }; },
  () => child('write', path.join(ROOT, 'w-red'), { mutant: ACC(OLD_DURABLE), boundMs: 2500 }),
  () => killThenBoot('w2', ACC(NO_COMPLETION)), () => killThenBoot('w3', ACC(NO_REMOVAL)), () => killThenBoot('w4', ENGF(SWEEP_FIRST)), () => killThenBoot('w5', ACC(INDEX_ONLY)),
  () => killThenBoot('m1', '', { role: 'write-new', mode: 'index' }), () => killThenBoot('m1r', '', { role: 'write-new', mode: 'index', wm: ACC(MUST1_OFF) }),
  () => killThenBoot('m2', '', { role: 'write-unwatch' }), () => killThenBoot('m2r', '', { role: 'write-unwatch', wm: CGF(MUST2_OFF) }),
  () => killThenBoot('be', '', { role: 'write-edit' }), () => killThenBoot('ber', '', { role: 'write-edit', wm: ACC(BY_CLOCK) }),   // the stamp is the WRITER's
  () => child('write-big', path.join(ROOT, 'big'), { boundMs: 2500 }),
  () => killThenBoot('gone', '', { role: 'write-gone', boots: 2 }),
  () => killThenBoot('bs', '', { role: 'write-blockshort', mode: 'index' }), () => killThenBoot('bsr', ACC(LIFT_ALL), { role: 'write-blockshort', mode: 'index' }),
  () => killThenBoot('rs', '', { role: 'write-reset' }), () => killThenBoot('rsr', '', { role: 'write-reset', wm: ACC(INDEX_LAST) }),
  () => killThenBoot('fl', '', { role: 'write-filter', boots: 2 }), () => killThenBoot('flr', '', { role: 'write-filter', wm: ACC(REUSE_ANY) }),
], 4);
console.log(`    (the fourteen worlds, at most four at once, in ${Date.now() - t0} ms)`);

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
  ok(!!(w2.facts && w2.facts.act1 && w2.facts.act1.ok && b.facts && !f.rule && !f.watcher && J(f.held) === J([]) && f.rewatch && f.rewatch.code === 'removed-by-user'),
    'RED «no boot completion»: the same kill ⇒ no rule, nothing held for the watcher — and still (r937 (a)) the agent\'s own re-watch refused by the RECORD\'s block, whatever the boot completed', f);
  const fa = (RED_A.b && RED_A.b.facts) || {};
  console.log('    RED boot (no completion, the refusal reading the index alone): ' + J({ rewatch: fa.rewatch }));
  ok(!!(RED_A.b.facts && fa.rewatch && fa.rewatch.ok === true), 'RED «the refusal reads the index alone» (r937 (a)): with the completion not run, the agent\'s re-watch is let through — the person\'s removal undone by the start order', fa.rewatch);
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

console.log('④ r937 — the law: an act told «done» is on the index\'s disk or completable from the record; the counts equal the record\'s');
{
  const w = M1.w2.facts || {}, b = M1.b.facts || {}, rb = M1R.b.facts || {};
  console.log('    MUST 1 writer: ' + J(w) + ' · boot: ' + J({ newRow: b.newRow, count: b.count, recCount: b.recCount }) + ' · RED boot: ' + J({ newRow: rb.newRow, count: rb.count, recCount: rb.recCount }));
  ok(!!(w.landedBefore === false && w.watch && w.watch.answered && w.watch.ok && w.inIndexFile === false && w.inJournal === true && M1.w2.signal === 'SIGKILL'),
    'MUST 1: an agent\'s own watch on a conversation the disk\'s index does not list yet (born inside the pace) is ANSWERED only with its act on disk — the row in the act\'s journal line, not in the index file; then SIGKILL', w);
  ok(!!(b.newRow && J(b.newRow.watchers) === J(['agent-1']) && b.count === 1 && b.recCount === 1), `MUST 1: the boot finds the conversation with the agent's watcher; the count its limit is judged by (${b.count}) EQUALS the record's (${b.recCount})`, b);
  ok(!!(rb.newRow === null && rb.recCount === 1 && rb.count === 0), `RED «that act paced» (the cut): the same kill ⇒ no conversation row, the watcher never reaches the index — the count ${rb.count} against the record's ${rb.recCount}`, rb);
  const u = M2.w2.facts || {}, ub = M2.b.facts || {}, ur = M2R.b.facts || {}, uw = M2R.w2.facts || {};
  console.log('    MUST 2 writer: ' + J(u) + ' · boot: ' + J({ count: ub.count, recCount: ub.recCount, roomWatchers: ub.roomWatchers, journal: ub.journal }) + ' · RED: ' + J({ row: uw.row, count: ur.count, recCount: ur.recCount }));
  ok(!!(u.own && u.unwatch && u.unwatch.answered && u.unwatch.ok && u.unwatch.removed && u.row && u.row.to === 0 && u.row.cleared && u.recordCount === 0 && M2.w2.signal === 'SIGKILL'),
    'MUST 2: the agent\'s own unwatch that empties the room\'s watch row is answered — the record KEEPS the row, emptied and stamped `cleared`; then SIGKILL', u);
  ok(!!(ub.count === 0 && ub.recCount === 0 && J(ub.roomWatchers) === J([]) && (ub.journal || []).some((l) => /agent:agent-1 on conversation:fake-poll\/fake-poll-ops \(removed\)/.test(l))), `MUST 2: the boot redoes the removal from the kept row — the count (${ub.count}) EQUALS the record's (${ub.recCount}); the room stores no watcher`, ub);
  ok(!!(uw.row === null && ur.count === 1 && ur.recCount === 0), `RED «the emptied row deleted from the record»: the same kill ⇒ the boot cannot read the removal back — the count ${ur.count} against the record's ${ur.recCount} (a slot the agent was told it freed)`, { uw, ur });
  const e = BE.b.facts || {}, er = BER.b.facts || {};
  console.log('    (b) edit across a clock stepped back: ' + J({ writer: BE.w2.facts, boot: e.roomW, red: er.roomW }));
  ok(!!(BE.w2.facts && BE.w2.facts.edit && BE.w2.facts.edit.ok && J(e.roomW) === J({ notify: 'digest', delivery: 'next-turn', digestMinutes: 30, dailyWakeCap: 1 })), '(b) the person\'s edit, saved an hour «earlier» by a clock that stepped back, is what the boot completes (its stamp monotonic: never older than the row it replaces)', e.roomW);
  ok(!!(er.roomW && er.roomW.notify === 'wake' && er.roomW.dailyWakeCap === 7), 'RED «the stamp the bare clock» (not monotonic): the same kill ⇒ the boot keeps the settings the person had replaced', er.roomW);
  const g = BIG.facts || {};
  ok(!!(g.bodyBytes > 16384 && g.big && g.big.answered === false), `a filter body over its bound (${g.bodyBytes} bytes) is not carried: that save waits for the index's disk, as before (no answer while the index never writes)`, g);
  const g1 = (GONE.b && GONE.b.facts) || {}, g2 = (GONE.b2 && GONE.b2.facts) || {};
  const once = (j) => (j || []).filter((l) => /not completed \(said once a version\).*the index lists no such conversation/.test(l)).length;
  console.log('    (c) a row the boot cannot complete: ' + J({ first: g1.journal, second: g2.journal }));
  ok(!!(GONE.w2.facts && GONE.w2.facts.gone && once(g1.journal) === 1 && once(g2.journal) === 0), '(c) a carrying row whose conversation the index no longer lists is said ONCE — the first boot says it, the next says nothing', { first: g1.journal, second: g2.journal });
}
console.log('⑤ r1040 (the follow): a row written short lifts nothing; one stamp an act over the index AND the record; a conversation\'s own filter is its own');
{
  const w = BS.w2.facts || {}, b = BS.b.facts || {}, r = BSR.b.facts || {};
  console.log('    1. the writer: ' + J(w) + ' · boot: ' + J({ block: b.block, rewatch: b.rewatch }) + ' · RED: ' + J({ block: r.block, rewatch: r.rewatch }));
  ok(!!(w.save && w.save.answered && w.save.ok && w.rowBlocks === 'absent' && b.rewatch && b.rewatch.code === 'removed-by-user' && J(b.block) === J(['conversation:fake-poll/fake-poll-ops|agent:agent-1'])),
    '1. a save whose blocks the record cannot carry (a key it cannot read) is written SHORT — no blocks on the row — and the boot LIFTS NOTHING: the agent\'s own re-watch still refused, its block stands', { w, b });
  ok(!!(r.rewatch && r.rewatch.ok === true && J(r.block) === J([])), 'RED «a row written short lifts its scope\'s blocks»: the boot deletes the person\'s block and the agent watches again', r);
  const rb = RS.b.facts || {}, rr = RSR.b.facts || {};
  console.log('    2. removed then set again (the clock an hour back), a kill: ' + J({ writer: RS.w2.facts, boot: rb.roomW, red: rr.roomW }));
  ok(!!(RS.w2.facts && RS.w2.facts.removed && RS.w2.facts.set && J(rb.roomW) === J({ notify: 'digest', delivery: 'next-turn', digestMinutes: 30, dailyWakeCap: 1 })), '2. a watch removed and set again inside the pace, the clock an hour back between: the boot completes the person\'s LAST act — its stamp after the record\'s own (the removal\'s `cleared`)', rb.roomW);
  ok(!!(rr.roomW && rr.roomW.notify === 'wake' && rr.roomW.dailyWakeCap === 7), 'RED «last read from the index alone»: the boot keeps the removed settings — a billed wake where the person chose next turn', rr.roomW);
  const fw = FL.w2.facts || {}, f1 = FL.b.facts || {}, f2 = (FL.b2 && FL.b2.facts) || {}, fr = FLR.b.facts || {};
  console.log('    3. the conversation\'s own filter: ' + J({ writer: fw, boot1: f1.convFilter, boot2: f2.convFilter, red: fr.convFilter, redWriter: FLR.w2.facts }));
  ok(!!(fw.inline && fw.edit && /^f-/.test(fw.fid || '') && !/\|/.test(fw.fid || '') && /\|/.test(fw.watcherFilter || '') && J(f1.convFilter) === J(['gamma']) && J(f2.convFilter) === J(['gamma'])),
    '3. the conversation\'s own filter (its route\'s id, no bar) is never an inline id: the watcher\'s inline filter gets its own; the route\'s edit stands at EVERY boot', { fw, f1: f1.convFilter, f2: f2.convFilter });
  ok(!!(fr.convFilter && J(fr.convFilter) !== J(['gamma'])), 'RED «any f- id reused and carried»: the route\'s edit is put back to the record\'s older body at the boot', fr.convFilter);
}
report();

#!/usr/bin/env node
// test-watch-door — A WATCH THAT CANNOT BE ARMED NEVER ENDS THE HUB AND NEVER ENDS ITS FEATURE (主开发 2026-11-19 01:17Z: the
// production hub ended at 01:14Z — the machine's inotify watches used up by other programs, the hub armed one more for a helper
// conversation's transcript from a retry TIMER, fs.watch threw ENOSPC, nothing caught it).
//   §1 THE DOOR (src/watch-door.js) with stand-in fs modules — no real watch is armed, no real limit touched (主开发 01:30Z: the
//      notice never flaps — lifted only after 3 arms in a row and 10 quiet minutes, at most one item an hour, CONTROL the hotfix's
//      rule flaps; the pollers bounded — at most LIMITS.inflight (2: half the default thread pool) file calls in flight across all, counted by the stand-in, CONTROL unbounded):
//      a refused watch (ENOSPC) is a bounded poll that still calls the listener; a watcher whose 'error' fires after it was
//      armed is swapped to the poll, never an uncaught 'error'; a listener that throws is caught; the limit is said ONCE
//      (journal + ONE For-you notice in en, its zh / ja rows in the dictionaries) and LIFTED when a watch arms again; close()
//      ends the poll
//   §2 THE CENSUS: no fs.watch of the hub's code outside the door (comments stripped; src/agentd/ is the device agent's own
//      process — its watches sit in a try) — a bare one is red by name; CONTROL: a planted bare watch is caught
//   §3 THE REAL PARSER'S ROAD (src/server/stdout/claude-stream-json.js) through the RETRY TIMER that ended the hub, with a
//      stand-in fs.watch that throws ENOSPC: the hub's road goes on, the helper's records still arrive (the poll), the notice
//      is filed once; CONTROL (in memory, never a file in src/): the release's two lines put back (the bare timer, the bare
//      watch) — the ENOSPC throws OUT of the timer (caught here as an uncaught exception, as it ended the hub)
// Run: node scripts/test-watch-door.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { scratchHome, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { stripComments } from './ci.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();   // THE ONE assertion helper (scripts/lib/check.mjs): the condition first, a boolean
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, rounds = 60, every = 50) => { for (let i = 0; i < rounds; i++) { if (pred()) return true; await sleep(every); } return pred(); };   // a bounded wait for an EVENT — no verdict on the clock
const WD = require(path.join(REPO, 'src/watch-door.js'));
const enospc = () => { const e = new Error('ENOSPC: System limit for number of file watchers reached'); e.code = 'ENOSPC'; e.errno = -28; return e; };
const todosStub = () => { const T = { adds: [], done: [], items: new Map(), add(key, it) { const id = 'fy-' + (T.adds.length + 1); T.adds.push({ key, ...it }); T.items.set(id, { id, status: 'open' }); return { id }; }, get(id) { return T.items.get(id) || null; }, setStatus(id, st, by) { T.done.push({ id, st, by }); const x = T.items.get(id); if (x) x.status = st; } }; return T; };
const HOME = scratchHome('watch-door');
const TMP = path.join(HOME, 'files'); fs.mkdirSync(TMP, { recursive: true });

console.log('§1 the door — a refused watch is a poll; the limit said once, never flapping; the pollers bounded');
{
  WD.resetForTest();
  let T0 = 1e12; const clock = () => T0;
  const T = todosStub(), said = [];
  WD.configure({ getUserTodos: () => T, log: (l) => said.push(l), clock, container: false, limitNow: () => 65536 });
  const refusing = { ...fs, watch() { throw enospc(); } };
  const f = path.join(TMP, 'a.jsonl'); fs.writeFileSync(f, 'one\n');
  const heard = [];
  const w1 = WD.watch(f, () => heard.push('a'), { fs: refusing });
  const w2 = WD.watch(path.join(TMP, 'b.jsonl'), () => {}, { fs: refusing });
  await w1.ready;   // the poll's baseline taken — a FACT, never a sleep (its readers' 6)
  fs.appendFileSync(f, 'two\n');
  const got = await until(() => heard.length >= 1);
  ok(w1.polled && w2.polled && got && typeof w1.close === 'function' && WD.status().limited === true,
    `a watch the system refuses (ENOSPC) is a bounded POLL standing in — its listener heard the file grow (${heard.length}), nothing thrown`, { st: WD.status(), heard });
  ok(T.adds.length === 1 && T.adds[0].key === WD.NOTICE_KEY && /limit of file watches is reached/.test(T.adds[0].text) && T.adds[0].detail.includes(WD.LIMIT_NAME) && T.adds[0].detail.includes(WD.raiseCmd(65536)) && WD.raiseCmd(65536).endsWith('=524288') && said.filter((l) => /limit of file watches is reached \(/.test(l)).length === 1,
    `two refusals: ONE For-you notice (the limit's name, the one command that raises it) and ONE journal line`, { adds: T.adds.map((a) => a.text), said });
  { // (its readers' 4) THE WORDS SAY ONLY WHAT IS TRUE: no claim of who holds the watches; every few seconds at most; a container's limit is its host's
    const host = WD.noticeItem({ container: false, current: 65536 }), pod = WD.noticeItem({ container: true, current: 65536 });
    ok(!/other program/i.test(host.detail + pod.detail) && /every few seconds at most/.test(host.detail) && host.detail.includes(WD.raiseCmd(65536)) && !/sysctl/.test(pod.detail) && /in a container: the limit belongs to its host and is raised there/.test(pod.detail) && pod.detail.includes(WD.LIMIT_NAME),
      'the words: no claim about who holds the watches, «every few seconds at most»; the command offered on a machine, NEVER in a container (its host raises it)', { host: host.detail, pod: pod.detail }); }
  { // (主开发 01:57Z, its reader's S2) THE COMMAND NEVER LOWERS THE LIMIT: double the machine's current value, never under 524 288
    const big = WD.noticeItem({ container: false, current: 1048576 }), unread = WD.noticeItem({ container: false, current: null });
    const FIXED = 'fs.inotify.max_user_watches=524288';
    ok(big.detail.includes('fs.inotify.max_user_watches=2097152') && !big.detail.includes(FIXED) && unread.detail.includes(FIXED) && WD.raiseCmd(300000).endsWith('=600000'),
      `a machine at 1 048 576 (this owner's since today) is offered ${WD.raiseCmd(1048576).split(' ').pop()} — never the fixed 524 288 that would halve it; an unread limit falls back to 524 288`, { big: big.detail, unread: unread.detail });
    // CONTROL (in memory, never a file in src/): the hotfix's fixed number put back into the door — the same machine is offered 524 288
    const DSRC = fs.readFileSync(path.join(REPO, 'src/watch-door.js'), 'utf8'), RC = "const raiseCmd = (current) => `sudo sysctl -w ${LIMIT_NAME}=${Math.max(524288, 2 * (Number(current) > 0 ? Math.floor(Number(current)) : 0))}`;";
    let mx = null; try { mx = mutantCopies('watch-door-fixed', REPO).load('src/watch-door.js', anchored(DSRC, RC, 'const raiseCmd = () => `sudo sysctl -w ${LIMIT_NAME}=524288`;', 'the fixed command'), 'fixed'); } catch (e) { ok(false, `the control «the fixed command» built nothing — ${e && e.message}`); }
    if (mx) {
      const mb = mx.noticeItem({ container: false, current: 1048576 });
      ok(mb.detail.includes(FIXED) && !mb.detail.includes('=2097152'), 'CONTROL (the hotfix\'s fixed number put back): a machine at 1 048 576 is offered 524 288 — the leg above is red on it', mb.detail);
    }
  }
  // (主开发 01:30Z, 1) THE NOTICE NEVER FLAPS: at the limit's edge watches arm and are refused in turn
  let fake = null;
  const arming = { ...fs, watch() { fake = new EventEmitter(); fake.close = () => {}; return fake; } };
  const flap = (n) => { const ws = []; for (let i = 0; i < n; i++) { ws.push(WD.watch(f, () => {}, { fs: arming })); ws.push(WD.watch(f, () => {}, { fs: refusing })); } return ws; };
  const fw = flap(10);
  ok(T.adds.length === 1 && !T.done.length && WD.status().limited, `ten armed-then-refused turns at the limit's edge: still ONE item, never lifted (${T.adds.length} filed, ${T.done.length} lifted)`, WD.status());
  // the lift: LIMITS.liftArms armed IN A ROW and LIMITS.liftQuietMs since the last refusal
  const ws3 = [WD.watch(f, () => {}, { fs: arming }), WD.watch(f, () => {}, { fs: arming }), WD.watch(f, () => {}, { fs: arming })];
  const notYet = WD.status().limited;
  T0 += WD.LIMITS.liftQuietMs;
  const w3 = WD.watch(f, () => {}, { fs: arming });
  ok(notYet && !WD.status().limited && T.done.length === 1 && T.done[0].st === 'done', `three arms in a row are not enough inside the quiet time (still limited: ${notYet}); armed again after ${WD.LIMITS.liftQuietMs / 60e3} quiet minutes, the notice resolves itself`, { done: T.done, st: WD.status() });
  // at most ONE item an hour: a refusal right after the lift is said, not filed; filed once the hour has passed
  T0 += 60e3;
  const w5 = WD.watch(f, () => {}, { fs: refusing });
  const heldBack = T.adds.length === 1 && WD.status().filesDue && said.some((l) => /filed again once the hour has passed/.test(l));
  T0 += WD.LIMITS.fileGapMs;
  const w6 = WD.watch(f, () => {}, { fs: refusing });
  ok(heldBack && T.adds.length === 2, `a refusal a minute after the lift is said in the journal and NOT filed (at most one item an hour); after the hour, filed (${T.adds.length} in all)`, WD.status());
  let threw = null; try { fake.emit('error', enospc()); } catch (e) { threw = e; }
  ok(!threw && w3.polled, `an armed watcher's own 'error' (ENOSPC) after it was armed: no throw, the poll stands in`, { threw: threw && threw.message });
  // a listener that throws is caught
  const g = path.join(TMP, 'c.jsonl'); fs.writeFileSync(g, 'x\n');
  let calls = 0;
  const w4 = WD.watch(g, () => { calls++; throw new Error('a listener bug'); }, { fs: refusing });
  await w4.ready; fs.appendFileSync(g, 'y\n');
  await until(() => calls >= 1);
  ok(calls >= 1 && said.some((l) => /listener threw/.test(l)), `a listener that throws inside the poll is caught and said once — the poll goes on (${calls} calls)`);
  for (const w of [w1, w2, w3, w4, w5, w6, ...fw, ...ws3]) w.close();
  ok(WD.status().pollers === 0, `close() ends every poll (${WD.status().pollers} left)`);
  { // (its readers' 5) A LIMIT MET BEFORE THE STORE, AND A FILING THAT FAILED, ARE FILED LATER — never lost
    WD.resetForTest();
    const early = WD.watch(f, () => {}, { fs: refusing });   // no store yet
    const T3 = todosStub(); WD.configure({ getUserTodos: () => T3, log: () => {}, clock, container: false });
    const filedAtConfigure = T3.adds.length;
    WD.resetForTest();
    let fails = 1; const T4 = todosStub(); const add0 = T4.add; T4.add = (k, it) => { if (fails-- > 0) throw new Error('the store is busy'); return add0(k, it); };
    WD.configure({ getUserTodos: () => T4, log: () => {}, clock, container: false });
    const a1 = WD.watch(f, () => {}, { fs: refusing }), afterFail = T4.adds.length, due = WD.status().filesDue;
    const a2 = WD.watch(f, () => {}, { fs: refusing });
    ok(filedAtConfigure === 1 && afterFail === 0 && due && T4.adds.length === 1, `a limit met before the For-you store files its notice when the store arrives (${filedAtConfigure}); a filing that threw is marked due and filed at the next refusal (${T4.adds.length})`, { filedAtConfigure, afterFail, due });
    for (const w of [early, a1, a2]) w.close();
  }
  // CONTROL of the flap: the hotfix's rule (lift at the first arm, file at every refusal) — the same ten turns file ten items
  WD.resetForTest();
  const T2 = todosStub(); WD.configure({ getUserTodos: () => T2, log: () => {}, clock, container: false });
  Object.assign(WD.LIMITS, { liftArms: 1, liftQuietMs: 0, fileGapMs: 0 });
  WD.watch(f, () => {}, { fs: refusing }).close();
  for (const w of flap(10)) w.close();
  ok(T2.adds.length >= 10, `CONTROL (the hotfix's rule: lifted at the first arm, filed at every refusal): the same turns FLAP — ${T2.adds.length} items filed`, T2.adds.length);
  WD.resetForTest();
}
{ // (主开发 01:30Z, 2) THE POLLERS ARE BOUNDED — the stand-in's OWN count of file calls in flight, never the door's word
  const run = async (limits) => {
    WD.resetForTest(); WD.configure({ log: () => {} });
    if (limits) Object.assign(WD.LIMITS, limits);
    let cur = 0, peak = 0, calls = 0;
    const slow = { ...fs, watch() { throw enospc(); }, promises: { stat: async () => { cur++; calls++; if (cur > peak) peak = cur; await sleep(4); cur--; return { isDirectory: () => false, size: 1, mtimeMs: 1 }; }, readdir: async () => [] } };
    const ws = []; for (let i = 0; i < 120; i++) ws.push(WD.watch(path.join(TMP, `p${i}`), () => {}, { fs: slow }));
    await Promise.all(ws.map((w) => w.ready));   // every poll's baseline taken — a fact
    const r = { peak, calls, pollers: WD.status().pollers, cadence: WD.cadenceFor(WD.status().pollers), slowest: Math.min(...ws.map((w) => w.cadenceMs)) };
    for (const w of ws) w.close();
    WD.resetForTest();
    return r;
  };
  const b = await run(null), c = await run({ inflight: 1e9, running: 1e9 });
  ok(b.calls >= 120 && b.peak <= WD.LIMITS.inflight && b.pollers === 120 && b.cadence > WD.ACTIVE_MS && b.slowest >= b.cadence,
    `120 refused watches: every poll read its file (${b.calls} calls) with at most ${b.peak} in flight at once (the bound ${WD.LIMITS.inflight}, counted by the stand-in itself); every poll's own cadence (its seam) is at least the slowed ${b.cadence} ms (the least: ${b.slowest} ms)`, b);
  ok(c.peak > WD.LIMITS.inflight, `CONTROL (the bounds lifted): the same 120 polls put ${c.peak} file calls in flight at once — the count can see an unbounded pool`, c);
}

console.log('§1b the block\'s follow (its readers\' S1 / S3 / N4 / N8 / N9 / N10) — a notice adopted after a restart; the probe, the arms in a row and the running bound each with a control');
{
  const M = mutantCopies('watch-door-follow', REPO);
  const DSRC = fs.readFileSync(path.join(REPO, 'src/watch-door.js'), 'utf8');
  const mutant = (anchor, to, name) => { try { return M.load('src/watch-door.js', anchored(DSRC, anchor, to, name), name.replace(/\W+/g, '-')); } catch (e) { return { error: String((e && e.message) || e).slice(0, 160) }; } };
  const f = path.join(TMP, 'follow.jsonl'); fs.writeFileSync(f, 'one\n');
  const refusing = { ...fs, watch() { throw enospc(); } };
  const arming = { ...fs, watch() { const e = new EventEmitter(); e.close = () => {}; return e; } };
  { // S1 A NOTICE THAT OUTLIVED A RESTART is adopted: no second item; lifted by the same rule (arms in a row after the quiet time)
    const adopt = (D) => {
      D.resetForTest(); let T0 = 1e12;
      const T = todosStub(); T.items.set('fy-before', { id: 'fy-before', status: 'open' }); T.openItems = () => [{ id: 'fy-before', sessionKey: D.NOTICE_KEY, status: 'open' }];
      D.configure({ getUserTodos: () => T, log: () => {}, clock: () => T0, container: false, limitNow: () => 65536 });
      const at = D.status(), w0 = D.watch(f, () => {}, { fs: refusing });   // the limit still met: no second item
      T0 += D.LIMITS.liftQuietMs; const ws = [1, 2, 3].map(() => D.watch(f, () => {}, { fs: arming }));
      const out = { itemId: at.itemId, limited: at.limited, adds: T.adds.length, done: T.done.map((d) => d.id) };
      for (const w of [w0, ...ws]) w.close(); D.resetForTest();
      return out;
    };
    const a = adopt(WD);
    ok(a.itemId === 'fy-before' && a.limited === true && a.adds === 0 && a.done.join() === 'fy-before',
      'S1: the open watch-limit item from before a restart is ADOPTED (its id, the limit taken as met) — no second item filed at the next refusal; three arms in a row after the quiet time lift THAT item', a);
    const cut = mutant('  if (!open) return true;\n', '  return true;\n', 'S1 adoption cut');
    const c = cut.error ? null : adopt(cut);
    ok(!!c && (c.itemId !== 'fy-before' || c.adds > 0) && !c.done.includes('fy-before'),
      `CONTROL (the adoption cut${cut.error ? ` — NOT BUILT: ${cut.error}` : ''}): the restart's item is never lifted and a second one is filed beside it`, c);
  }
  { // S1 (its second reader's must) THE STORE ARRIVES AFTER configure() — as in the hub's boot, where the system-resource module
    // configures the door before the store exists (its getter throws until then): the item is adopted at the next turns
    const late = async (D) => {
      D.resetForTest(); let ready = false;
      const T = todosStub(); T.items.set('fy-before', { id: 'fy-before', status: 'open' }); T.openItems = () => [{ id: 'fy-before', sessionKey: D.NOTICE_KEY, status: 'open' }];
      D.configure({ getUserTodos: () => { if (!ready) throw new ReferenceError('Cannot access \'userTodos\' before initialization'); return T; }, log: () => {}, container: false });
      const before = D.status().itemId;
      ready = true;
      await until(() => D.status().itemId === 'fy-before', 40, 10);
      const out = { before, after: D.status().itemId, limited: D.status().limited, adds: T.adds.length };
      D.resetForTest();
      return out;
    };
    const l = await late(WD);
    ok(l.before === null && l.after === 'fy-before' && l.limited === true && l.adds === 0, 'S1 the store that is not there at configure() (its getter throws, as in the hub\'s boot) is asked again at the next turns: the item from before the restart is adopted then', l);
    const cutLate = mutant('  if (!adoptOpen()) adoptSoon(0);\n', '  adoptOpen();\n', 'S1 the later turns cut');
    const cl = cutLate.error ? null : await late(cutLate);
    ok(!!cl && cl.after !== 'fy-before', `CONTROL (adoption tried at configure() only${cutLate.error ? ` — NOT BUILT: ${cutLate.error}` : ''}): the item is never adopted — the reader's must, as it shipped in the first form`, cl);
  }
  { // S1 an adopted item on a machine that ARMS NOTHING ELSE is lifted by the PROBE alone (the limit fine after the restart)
    const byProbe = async (D) => {
      D.resetForTest(); let tries = 0;
      const T = todosStub(); T.items.set('fy-before', { id: 'fy-before', status: 'open' }); T.openItems = () => [{ id: 'fy-before', sessionKey: D.NOTICE_KEY, status: 'open' }];
      Object.assign(D.LIMITS, { probeMs: 5, liftArms: 3, liftQuietMs: 0 });
      D.configure({ getUserTodos: () => T, log: () => {}, container: false, probeFs: { ...arming, watch(...a) { tries++; return arming.watch(...a); } } });
      await until(() => !D.status().limited || tries >= 6, 60, 10);
      const out = { tries, limited: D.status().limited, done: T.done.map((d) => d.id) };
      D.resetForTest();
      return out;
    };
    const p = await byProbe(WD);
    ok(p.limited === false && p.done.join() === 'fy-before' && p.tries >= 3, `S1 the adopted item on a machine that arms nothing else: ${p.tries} probe watches lift it`, p);
    const cutP = mutant("log('[watch] a watch-limit notice from before the restart is kept until watches have been set again for a while'); armProbe(); }", "log('[watch] a watch-limit notice from before the restart is kept until watches have been set again for a while'); }", 'S1 the adoption probe cut');
    const cp = cutP.error ? null : await byProbe(cutP);
    ok(!!cp && cp.limited === true && cp.tries === 0 && !cp.done.length, `CONTROL (the adoption arms no probe${cutP.error ? ` — NOT BUILT: ${cutP.error}` : ''}): nothing lifts the item`, cp);
  }
  { // S3 (a) THE PROBE: a hub that arms nothing else still learns the limit cleared — one watch tried every probeMs and closed at once
    const probe = async (D, pf) => {
      D.resetForTest(); let tries = 0;
      const counted = { ...pf, watch(...a) { tries++; return pf.watch(...a); } };
      D.configure({ getUserTodos: () => todosStub(), log: () => {}, container: false, probeFs: counted });
      Object.assign(D.LIMITS, { probeMs: 5, liftArms: 3, liftQuietMs: 0 });
      const w = D.watch(f, () => {}, { fs: refusing });
      await until(() => tries >= 4 || !D.status().limited, 200, 10);
      const out = { tries, limited: D.status().limited, lifted: D.status().lifted };
      w.close(); D.resetForTest();
      return out;
    };
    const lifted = await probe(WD, arming), held = await probe(WD, refusing);
    ok(lifted.tries >= 3 && lifted.limited === false && lifted.lifted === 1 && held.tries >= 4 && held.limited === true,
      `S3 (a) the probe: nothing else arms, yet ${lifted.tries} probe watches armed in a row lift the limit; CONTROL — a probe the system still refuses (${held.tries} tries) keeps it`, { lifted, held });
  }
  { // S3 (b) THE ARMS COUNT IN A ROW: a refusal between them starts the count again
    const row = (D) => {
      D.resetForTest(); let T0 = 1e12;
      D.configure({ getUserTodos: () => todosStub(), log: () => {}, clock: () => T0, container: false });
      const ws = [D.watch(f, () => {}, { fs: refusing })];
      T0 += D.LIMITS.liftQuietMs;
      ws.push(D.watch(f, () => {}, { fs: arming }), D.watch(f, () => {}, { fs: arming }));
      ws.push(D.watch(f, () => {}, { fs: refusing }));   // the row broken
      T0 += D.LIMITS.liftQuietMs;
      ws.push(D.watch(f, () => {}, { fs: arming }));      // three arms in all since the quiet time, one in a row
      const broken = D.status().limited;
      ws.push(D.watch(f, () => {}, { fs: arming }), D.watch(f, () => {}, { fs: arming }));
      const out = { brokenStillLimited: broken, liftedAfterRow: !D.status().limited };
      for (const w of ws) w.close(); D.resetForTest();
      return out;
    };
    const r = row(WD);
    ok(r.brokenStillLimited === true && r.liftedAfterRow === true, 'S3 (b) a refusal between the arms starts the count again: three arms with one refusal among them keep the limit; three IN A ROW lift it', r);
    const cut = mutant('  state.lastRefusalAt = now(); state.armsInRow = 0;\n  if (!state.limited) {', '  state.lastRefusalAt = now();\n  if (!state.limited) {', 'S3b the row reset cut');
    const c = cut.error ? null : row(cut);
    ok(!!c && c.brokenStillLimited === false, `CONTROL (a refusal no longer resets the count${cut.error ? ` — NOT BUILT: ${cut.error}` : ''}): the broken row lifts the limit`, c);
  }
  { // S3 (c) THE RUNNING BOUND: at most LIMITS.running polls' ticks at once — counted by the stand-in itself (a tick = its folder's
    // stat … its entry's stat), the in-flight bound lifted so only the running one holds
    const run = async (limits) => {
      WD.resetForTest(); WD.configure({ log: () => {} }); Object.assign(WD.LIMITS, { inflight: 1e9, ...limits });
      let open = 0, peak = 0;
      const dirs = { ...fs, watch() { throw enospc(); }, promises: {
        stat: async (p) => { const entry = String(p).endsWith(`${path.sep}e`); if (!entry) { open++; if (open > peak) peak = open; } await sleep(3); if (entry) open--; return entry ? { isDirectory: () => false, size: 1, mtimeMs: 1 } : { isDirectory: () => true, size: 1, mtimeMs: 1 }; },
        readdir: async () => ['e'] } };
      const ws = []; for (let i = 0; i < 120; i++) ws.push(WD.watch(path.join(TMP, `r${i}`), () => {}, { fs: dirs }));
      await Promise.all(ws.map((w) => w.ready));
      for (const w of ws) w.close(); WD.resetForTest();
      return { peak };
    };
    const b = await run({}), c = await run({ running: 1e9 });
    ok(b.peak <= 32 && b.peak >= 2 && c.peak > 32, `S3 (c) 120 polls of folders: at most ${b.peak} ticks at once (the bound 32, counted by the stand-in); CONTROL — the bound lifted: ${c.peak} at once`, { b, c });
  }
  { // N10 (its delta reader's F2) A RESET WHILE TICKS HOLD THEIR TURNS gives the new state nothing: two polls' first ticks take
    // their turns at once, they close and the reset lands BEFORE their continuations run; 120 polls of folders then start in the
    // same turn — at most 32 ticks at once (counted by the stand-in). The order of S3 (b) then (c) found it; this leg names it
    const n10 = async (D) => {
      D.resetForTest(); D.configure({ log: () => {} });
      const old = [D.watch(f, () => {}, { fs: refusing }), D.watch(f, () => {}, { fs: refusing })];
      for (const w of old) w.close();
      D.resetForTest(); D.configure({ log: () => {} }); Object.assign(D.LIMITS, { inflight: 1e9 });
      let open = 0, peak = 0;
      const dirs = { ...fs, watch() { throw enospc(); }, promises: {
        stat: async (p) => { const entry = String(p).endsWith(`${path.sep}e`); if (!entry) { open++; if (open > peak) peak = open; } await sleep(3); if (entry) open--; return { isDirectory: () => !entry, size: 1, mtimeMs: 1 }; },
        readdir: async () => ['e'] } };
      const ws = []; for (let i = 0; i < 120; i++) ws.push(D.watch(path.join(TMP, `n${i}`), () => {}, { fs: dirs }));
      await Promise.all(ws.map((w) => w.ready));
      for (const w of ws) w.close(); D.resetForTest();
      return { peak };
    };
    const r = await n10(WD);
    ok(r.peak <= 32 && r.peak >= 2, `N10 two ticks holding their turns at a reset give the new state nothing: 120 polls then run at most ${r.peak} at once (the bound 32)`, r);
    const back = mutant('    if (g !== gen) return;   // a reset came while it held its turn', '    if (g !== gen) { give(runWait, \'running\', gen); return; }   // a reset came while it held its turn', 'N10 the turn handed to the new state');
    const c = back.error ? null : await n10(back);
    ok(!!c && c.peak > 32, `CONTROL (the stale turn handed to the new state, as this unit's first cure had it${back.error ? ` — NOT BUILT: ${back.error}` : ''}): ${c && c.peak} at once — over the bound`, c);
  }
  { // (主开发 09:53Z, 1) THE IN-FLIGHT CAP IS AT MOST HALF THE THREAD POOL: a child with the runtime's default pool (UV_THREADPOOL_SIZE=4)
    // polls six refused watches through a stand-in whose stat NEVER returns on its own — it opens a FIFO nobody writes, which holds a
    // REAL pool thread (a wedged mount's stat). With the door's cap, two are stuck and a file call of the child's own still answers;
    // CONTROL: the cap at 4 — four threads stuck, the child's own call waits (the hub-freeze class). The FIFOs are opened for writing
    // at the end, so every stuck thread returns before the child exits
    const mk = spawnSync('mkfifo', ['--version'], { stdio: 'ignore' });
    if (mk.status !== 0 && mk.error) console.log('  ⊘ SKIP the thread-pool leg — no mkfifo on this machine');
    else {
      const PD = path.join(HOME, 'pool'); fs.mkdirSync(PD, { recursive: true });
      const KIDP = path.join(PD, 'kid-pool.cjs');
      fs.writeFileSync(KIDP, [
        "'use strict';",
        "const fs = require('fs'), path = require('path');",
        "const [door, dir, cap, n] = process.argv.slice(2);",
        "const WD = require(door); WD.configure({ log: () => {} });   // a fresh process: the DECLARED limits (no reset)",
        "if (cap !== 'default') WD.LIMITS.inflight = Number(cap);",
        "const fifos = Array.from({ length: Number(n) }, (_, i) => path.join(dir, 'fifo' + i));",
        "let started = 0;",
        "const stuck = { ...fs, watch() { const e = new Error('ENOSPC'); e.code = 'ENOSPC'; throw e; }, promises: { stat: async () => { const f = fifos[started++ % fifos.length]; const h = await fs.promises.open(f, 'r'); await h.close(); return { isDirectory: () => false, size: 1, mtimeMs: 1 }; }, readdir: async () => [] } };",
        "const ws = fifos.map((_, i) => WD.watch(path.join(dir, 'p' + i), () => {}, { fs: stuck }));",
        "const turn = () => new Promise((r) => setTimeout(r, 10));",
        "(async () => {",
        "  for (let i = 0; i < 100 && started < Math.min(fifos.length, WD.LIMITS.inflight); i++) await turn();",
        "  let answered = false; fs.promises.stat(__filename).then(() => { answered = true; }, () => { answered = true; });",
        "  for (let i = 0; i < 100 && !answered; i++) await turn();",
        "  process.stdout.write(JSON.stringify({ started, answered, cap: WD.LIMITS.inflight }) + '\\n');",
        "  const held = []; for (const f of fifos) { try { held.push(fs.openSync(f, 'r+')); } catch { } }   // O_RDWR: a writer at once (never ENXIO), kept until the exit so a late open never blocks",
        "  for (const w of ws) w.close();",
        "  process.exit(0);",
        "})();",
      ].join('\n'));
      const runPool = (cap) => {
        const dir = fs.mkdtempSync(path.join(PD, `c${cap}-`)), n = 6;
        const made = Array.from({ length: n }, (_, i) => spawnSync('mkfifo', [path.join(dir, 'fifo' + i)]).status === 0);
        if (!made.every(Boolean)) return { mkfifo: 'failed', made };
        const r = spawnSync(process.execPath, [KIDP, path.join(REPO, 'src/watch-door.js'), dir, String(cap), String(n)], { encoding: 'utf8', timeout: 20000, env: { PATH: process.env.PATH, UV_THREADPOOL_SIZE: '4' } });
        let out = null; try { out = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch { out = { raw: String(r.stdout || '').slice(0, 200), err: String(r.stderr || '').slice(0, 300) }; }
        return { ...out, status: r.status, signal: r.signal };   // a child that had to be killed (its exit hung on a pool thread) is red
      };
      const dflt = runPool('default'), four = runPool(4);
      ok(WD.DEFAULT_LIMITS.inflight === 2 && WD.LIMITS.inflight === 2 && !!dflt && dflt.cap === 2 && dflt.started === 2 && dflt.answered === true && dflt.status === 0 && !dflt.signal,
        `THE POOL (主开发 09:53Z, 1): with the door's cap (${dflt && dflt.cap}) a wedged stat holds ${dflt && dflt.started} of the 4 pool threads — a file call of the process's own still answers`, dflt);
      ok(!!four && four.cap === 4 && four.started === 4 && four.answered === false && four.status === 0 && !four.signal,
        `CONTROL (the cap at 4, the whole default pool): ${four && four.started} threads stuck — the process's own file call waits (the hub-freeze class)`, four);
    }
  }
  { // (主开发 09:53Z, 2) THE LAST ADOPTION TRY'S FAILURE IS SAID — never a silent give-up
    const lastTry = async (D) => {
      D.resetForTest(); const said = [];
      Object.assign(D.LIMITS, { adoptRetryMs: [0, 5, 5] });
      D.configure({ getUserTodos: () => { throw new ReferenceError('no store yet'); }, log: (l) => said.push(l), container: false });
      await until(() => said.some((l) => /did not answer during the start/.test(l)), 40, 10);
      const out = { lines: said.filter((l) => /did not answer during the start/.test(l)).length };
      D.resetForTest();
      return out;
    };
    const l = await lastTry(WD);
    ok(l.lines === 1, 'the store that never answers during the start: after the last adoption try, ONE journal line says the old notice was not looked for', l);
    const cut = mutant("    log('[watch] the For-you store did not answer during the start", "    void ('[watch] the For-you store did not answer during the start", 'the last try line cut');
    const c = cut.error ? null : await lastTry(cut);
    ok(!!c && c.lines === 0, `CONTROL (the line cut${cut.error ? ` — NOT BUILT: ${cut.error}` : ''}): the give-up is silent`, c);
  }
  { // (主开发 09:53Z, 4) THE TAILER KEEPS NO SECOND POLL — by behaviour: the door refuses (fs.watch throws ENOSPC), the tailer arms on
    // an existing folder; the door's poll is closed (its pollers back to 0) and the tailer's own poll carries the folder
    const TSRC = fs.readFileSync(path.join(REPO, 'src/workflow-usage-tailer.js'), 'utf8');
    const tailerRun = (mod) => {
      WD.resetForTest(); WD.configure({ log: () => {} });
      const dir = fs.mkdtempSync(path.join(TMP, 'tail-'));
      const saved = fs.watch; fs.watch = () => { throw enospc(); };
      let t = null, out = null;
      try { t = mod.createWorkflowTailer({ dir, onRecord: () => {}, pollMs: 60000 }); out = { armed: t.armed(), pollers: WD.status().pollers, ownPoll: !!t._state.poll, watcher: t._state.watcher }; }
      finally { fs.watch = saved; try { t && t.stop(); } catch { } WD.resetForTest(); }
      return out;
    };
    const real = tailerRun(require(path.join(REPO, 'src/workflow-usage-tailer.js')));
    ok(!!real && real.armed && real.pollers === 0 && real.ownPoll && real.watcher === null, 'N8 by behaviour: the door refuses, the tailer arms — the door\'s poll is closed (0 pollers) and the tailer\'s own poll carries the folder', real);
    let ct = null; try { ct = M.load('src/workflow-usage-tailer.js', anchored(TSRC, '      if (st.watcher && st.watcher.polled) { st.watcher.close(); st.watcher = null; }', '', 'the tailer\'s close cut'), 'tailer-no-close'); } catch (e) { ct = { error: String((e && e.message) || e).slice(0, 160) }; }
    const c = ct.error ? null : tailerRun(ct);
    ok(!!c && c.pollers === 1, `CONTROL (the tailer's close cut${ct.error ? ` — NOT BUILT: ${ct.error}` : ''}): the door's poll stays beside the tailer's own (${c && c.pollers} poller)`, c);
  }
  { // N4 «every few seconds at most» stays true however many poll; N9 a filing that keeps failing is said ONCE a limit
    const NS = [1, 16, 17, 200, 319, 320, 321, 640, 5000, 1e6], rate = NS.map((n) => n * 1000 / WD.cadenceFor(n));
    ok(WD.cadenceFor(1) === WD.ACTIVE_MS && WD.cadenceFor(320) === WD.CADENCE_MAX_MS && WD.CADENCE_MAX_MS <= 5000 && NS.filter((n) => n <= 320).every((n) => WD.cadenceFor(n) <= WD.CADENCE_MAX_MS) && WD.cadenceFor(640) === 10000 && rate.every((r) => r <= WD.TICKS_PER_S_MAX + 1e-9),
      `N4 the cadence: never over ${WD.CADENCE_MAX_MS} ms up to 320 pollers («every few seconds at most»), and above it the TOTAL tick rate held at ${WD.TICKS_PER_S_MAX} a second (主开发 09:53Z, 3: 640 pollers ⇒ ${WD.cadenceFor(640)} ms; a million ⇒ ${WD.cadenceFor(1e6)} ms)`, { NS, cad: NS.map((n) => WD.cadenceFor(n)), rate });
    WD.resetForTest(); const said = [];
    const T = todosStub(); T.add = () => { throw new Error('the store is busy'); };
    WD.configure({ getUserTodos: () => T, log: (l) => said.push(l), container: false });
    const ws = [1, 2, 3].map(() => WD.watch(f, () => {}, { fs: refusing }));
    ok(said.filter((l) => /was not filed/.test(l)).length === 1 && WD.status().filesDue, 'N9 a filing that keeps failing is said ONCE while the limit lasts (three refusals, one journal line), still due', said);
    for (const w of ws) w.close(); WD.resetForTest();
  }
  { // N8 the tailer keeps no second poll beside its own; N10 a reset's generation — source pins (the tailer reads the real directory)
    const TAIL = fs.readFileSync(path.join(REPO, 'src/workflow-usage-tailer.js'), 'utf8');
    ok(/if \(st\.watcher && st\.watcher\.polled\) \{ st\.watcher\.close\(\); st\.watcher = null; \}/.test(TAIL) && /const give = \(q, key, g\) => \{ if \(g !== gen\) return;/.test(DSRC) && /gen\+\+; Object\.assign\(state, fresh\(\)\)/.test(DSRC),
      'N8 the workflow tailer closes a door poll that stands in (its own poll carries the folder); N10 a tick of an older reset never gives a slot into the new one (its generation)');
  }
}

console.log('§2 the census — no fs.watch of the hub\'s code outside the door');
{
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) { if (r !== path.join('src', 'agentd')) walk(r); } else if (/\.(c?js|mjs)$/.test(e.name)) files.push(r); } };
  walk('src'); files.push('server.js');
  // (its readers' 6) the census also sees fs.watchFile, a watch required inline, and a destructured watch
  const BARE = /\bfs\.watch(File)?\s*\(|=\s*fs\.watch(File)?\b|\bfs\.promises\.watch\s*\(|\bfsp\.watch\s*\(|require\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)\.watch(File)?\b|\{[^}]*\bwatch(File)?\b[^}]*\}\s*=\s*(?:require\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)|fs\b|fsp\b)/;
  // EXEMPT BY NAME (主开发 01:35Z / 01:40Z — the hotfix never touched the device agent's SIGNED bundle): src/desktop-serve.js
  // and src/opencode-events.js ride that bundle (each watch in a try WITH its error listener — neither can end the hub; the lane's
  // caller src/opencode-serve.js rides it too, so no hub-only file can hand the door in), beside the device agent's own src/agentd/
  const SHARED = ['src/desktop-serve.js', 'src/opencode-events.js'];
  const EXEMPT = new Set([path.join('src', 'watch-door.js'), ...SHARED.map((r) => path.join(...r.split('/')))]);
  const bareIn = (list) => list.filter(([rel, src]) => !EXEMPT.has(rel) && BARE.test(stripComments(src)));
  const tree = files.map((rel) => [rel, fs.readFileSync(path.join(REPO, rel), 'utf8')]);
  const found = bareIn(tree).map(([rel]) => rel);
  ok(files.length > 200 && !found.length, `every file watch of the hub's code goes through src/watch-door.js — ${files.length} files read, ${found.length} bare (src/agentd/ is the device agent's own process)`, found);
  const PLANTS = ["const w = fs.watch(dir, () => {});", "fs.watchFile(f, () => {});", "const w = require('fs').watch(dir);", "const { watch } = require('node:fs'); watch(dir);", "const { readFileSync, watch } = fs;"];
  const planted = PLANTS.map((src, i) => bareIn([[`src/server/planted-${i}.js`, src]]).length);
  ok(planted.every((n) => n === 1), `CONTROL: each planted bare watch is red by name (a call, watchFile, an inline require, two destructurings): ${planted.join(' ')}`, planted);
  { // THE DEVICE AGENT ASKED NOTHING OF THIS DOOR — restated for the train (主开发 2026-11-19 09:03Z: a train signs its bundle again,
    // so one release's bytes are no law). What holds in every tree: the door's file is NOT among the device bundle's inputs — read
    // from the bundle's OWN input list, package.json's build:agentd through esbuild's metafile (test-architecture §107's build) — and
    // the two shared files that keep their own watches ARE (the reason they are exempt), each with its watch's error listener
    const esbuild = require('esbuild');
    const script = (JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).scripts || {})['build:agentd'] || '';
    const m = /esbuild src\/agentd\/agentd\.js ([^&]*?)--outfile=/.exec(script), flags = m ? m[1] : '';
    const external = [...flags.matchAll(/--external:(\S+)/g)].map((x) => x[1]);
    let inputs = null, why = null;
    try {
      const r = await esbuild.build({ entryPoints: [path.join(REPO, 'src/agentd/agentd.js')], absWorkingDir: REPO, bundle: true, platform: 'node', external, preserveSymlinks: /--preserve-symlinks/.test(flags), write: false, metafile: true, logLevel: 'silent' });
      inputs = Object.keys(r.metafile.inputs);
    } catch (e) { why = String((e && e.message) || e).slice(0, 200); }
    const DOOR_FILE = 'src/watch-door.js';
    const judge = (list) => ({ door: list.filter((k) => k === DOOR_FILE), shared: SHARED.filter((r) => list.includes(r)) });
    const j = inputs ? judge(inputs) : null;
    const errOn = SHARED.filter((r) => /\.on\??\.?\(\s*'error'/.test(fs.readFileSync(path.join(REPO, r), 'utf8')));
    ok(!!m && !!j && inputs.length > 50 && j.door.length === 0 && j.shared.length === SHARED.length && errOn.length === SHARED.length,
      `the device agent asked nothing of the watch door: ${DOOR_FILE} is not among the device bundle's ${inputs ? inputs.length : '?'} inputs (its own list: package.json's build:agentd through esbuild's metafile); the two shared files that keep their own watches are (${j ? j.shared.join(', ') : '–'}), each with its watch's error listener`,
      { why, buildAgentd: !!m, door: j && j.door, shared: j && j.shared, errOn });
    const planted = j ? judge([...inputs, DOOR_FILE]) : null, dropped = j ? judge(inputs.filter((k) => k !== SHARED[0])) : null;
    ok(!!planted && planted.door.length === 1 && !!dropped && dropped.shared.length === SHARED.length - 1,
      'CONTROL: an input list holding the door\'s file is red by name, and one without a shared file no longer holds the exemption\'s reason', { planted: planted && planted.door, dropped: dropped && dropped.shared });
  }
  const sites = ['src/server/stdout/claude-stream-json.js', 'src/workflow-usage-tailer.js', 'src/server/cluster-presets.js'];
  const through = sites.filter((rel) => /\bWD\.watch\b/.test(fs.readFileSync(path.join(REPO, rel), 'utf8')));
  ok(through.length === sites.length, `the three hub-only watch sites of the release read the door (${through.join(', ')}); desktop-serve.js and opencode-events.js exempt by name (the device agent's bundle)`, sites.filter((s) => !through.includes(s)));
}

console.log('§3 the REAL parser\'s road — the retry timer that ended the hub, with a stand-in fs.watch that throws ENOSPC');
const realWatch = fs.watch;
async function parserRoad(consumer, { control = false } = {}) {
  WD.resetForTest();
  const T = todosStub();
  WD.configure({ getUserTodos: () => T, log: () => {} });
  const oldHome = process.env.HOME; process.env.HOME = HOME;
  const csSrc = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8');
  const engine = { _vsuPending: new Map(), resolveUsageKey: () => '__global__', usageEstimator: { noteLive() {} }, modelsMatch: () => false, servedDefinesModel: () => false, rerouteAnnouncedBy: () => null };
  for (const part of (/const \{([^}]*)\} = engine;/.exec(csSrc) || ['', ''])[1].split(',')) { const name = part.split(':')[0].replace(/\/\/.*$/, '').trim(); if (/^[A-Za-z_$][\w$]*$/.test(name) && !(name in engine)) engine[name] = () => {}; }
  const activeSessions = new Map();
  const { attach } = consumer.create({ activeSessions, engine, CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result', 'control_request', 'control_response', 'control_cancel_request']), _seenStreamTypes: new Set(),
    USAGE_SCANNER_PATH: path.join(HOME, 'none'), checkClaudeGoalStatus() {}, noteModelSeen() {}, sbSeenFirst: () => true, hosts: null, usageHistory: null, pagesRef: { current: null } });
  const N = require(path.join(REPO, 'src/normalizers.js'));
  const { MessageManager } = require(path.join(REPO, 'src/message-manager.js'));
  const bcast = [];
  const helpers = { feedLive: N.feedLive, broadcastToSession: (x, id, m) => bcast.push(m), broadcastActiveSessions() {}, readSessionMeta: () => ({}), writeSessionMeta() {}, updateSessionTodos() {}, applyTaskToolUpdate() {} };
  const id = control ? 'sess-wd-ctl' : 'sess-wd', sid = control ? 'e2e00000-0000-4000-8000-000000000d02' : 'e2e00000-0000-4000-8000-000000000d01', cwd = path.join(HOME, 'proj');
  const s = { mode: 'chat', backend: 'claude', name: 'wd', cwd, host: null, claudeSessionId: sid, backendSessionId: null, sockName: 'cw-' + id, buffer: '', createdAt: Date.now(), _webuiId: id, _taskRecords: {} };
  s._normalizer = new MessageManager(id);
  activeSessions.set(id, s);
  const h = { data: null, onData(cb) { h.data = cb; }, onExit() {} };
  const { cwdToProjectDir } = require(path.join(REPO, 'src/session-store.js'));
  const sub = path.join(HOME, '.claude', 'projects', cwdToProjectDir(cwd), sid, 'subagents'), file = path.join(sub, 'agent-ag1.jsonl');
  const rec = (n) => JSON.stringify({ type: 'assistant', uuid: `wd-${control ? 'c' : 'r'}-${n}`, message: { role: 'assistant', content: [{ type: 'text', text: `helper says ${n}` }] } }) + '\n';
  const uncaught = [];
  const onUncaught = (e) => uncaught.push(e);
  process.on('uncaughtException', onUncaught);
  fs.watch = () => { throw enospc(); };   // THE STAND-IN: the machine's limit reached — no real watch, no real limit touched
  const warn = console.warn; console.warn = () => {};
  const r = {};
  try {
    attach(s, id, h, helpers);
    // the helper starts BEFORE its transcript exists: the parser's RETRY TIMER arms the watch (the road that ended the hub)
    h.data(JSON.stringify({ type: 'system', subtype: 'task_started', task_type: 'local_agent', task_id: 'ag1', tool_use_id: 'tu-wd-1' }) + '\n');
    fs.mkdirSync(sub, { recursive: true }); fs.writeFileSync(file, rec(1));
    const armed = await until(() => { const e = s.subagentWatchers && s.subagentWatchers.get('tu-wd-1'); return !!(e && e.watcher) || uncaught.length > 0; }, 80, 50);   // the timer fires after ~1 s
    r.armed = armed; r.uncaught = uncaught.map((e) => e && e.code);
    const helperMsgs = () => bcast.filter((m) => m && m.type === 'subagent-message' && m.parentToolUseId === 'tu-wd-1').map((m) => m.message && m.message.uuid);
    if (!control) {
      let baseTaken = false; Promise.resolve(((s.subagentWatchers.get('tu-wd-1') || {}).watcher || {}).ready).then(() => { baseTaken = true; });
      await until(() => baseTaken, 80, 25);   // (its reader's S4) the poll's baseline taken — a fact, never a fixed wait; bounded, so a poll that never takes it is a named red, never a hang
      fs.appendFileSync(file, rec(2));
      await until(() => helperMsgs().length >= 2, 80, 50);
    }
    r.helper = helperMsgs();
    r.polled = !!(s.subagentWatchers.get('tu-wd-1') || {}).watcher?.polled;
    r.notices = T.adds.length; r.alive = activeSessions.has(id);
  } finally {
    console.warn = warn; fs.watch = realWatch;
    process.removeListener('uncaughtException', onUncaught);
    activeSessions.delete(id);
    try { for (const w of (s.subagentWatchers || new Map()).values()) { if (w && w.retry) clearTimeout(w.retry); if (w && w.watcher && w.watcher.close) try { w.watcher.close(); } catch { } } } catch { }
    process.env.HOME = oldHome;
    WD.resetForTest();
  }
  return r;
}
{
  const consumer = require(path.join(REPO, 'src/server/stdout/claude-stream-json.js'));
  const a = await parserRoad(consumer);
  ok(a.armed && !a.uncaught.length && a.polled && a.alive, `the helper's transcript watch armed from the retry timer under ENOSPC: NOTHING thrown out of the timer, a poll stands in, the conversation goes on`, a);
  ok(a.helper.length === 2 && a.helper[0] === 'wd-r-1' && a.helper[1] === 'wd-r-2', `the helper's records still ARRIVE — the one there at the start and the one written after (by the poll): ${JSON.stringify(a.helper)}`, a);
  ok(a.notices === 1, `the limit's For-you notice is filed ONCE (${a.notices})`, a);
  // CONTROL — the release's two lines put back, compiled IN MEMORY beside the real file (its requires resolve as the real one's)
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/stdout/claude-stream-json.js'), 'utf8');
  const ANCHORS = [
    ["        const retry = setTimeout(() => { try { session.subagentWatchers.delete(toolUseId); if (!activeSessions.has(id)) return; startSubagentWatcher(toolUseId, agentId, attempt + 1); } catch (e) { console.warn(`[stream] a helper's transcript watch could not start (${e && e.message}) — caught`); } }, delay);\n",
     "        const retry = setTimeout(() => { session.subagentWatchers.delete(toolUseId); if (!activeSessions.has(id)) return; startSubagentWatcher(toolUseId, agentId, attempt + 1); }, delay);\n"],   // stale-pins: kept — the release's own line, put back by the control
    ["      const watcher = WD.watch(watchFile, () => {", "      const watcher = fs.watch(watchFile, () => {"],   // stale-pins: kept — the release's own line, put back by the control
  ];
  const missing = ANCHORS.filter(([from]) => SRC.split(from).length !== 2).map(([from]) => from.trim().slice(0, 60));
  ok(!missing.length, `the control's anchors are in the source, once each${missing.length ? ' — MISSING: ' + missing.join(' | ') : ''}`);
  let mut = null;
  if (!missing.length) {
    const Module = require('node:module');
    const fake = path.join(REPO, 'src/server/stdout/claude-stream-json.release-mutant.js');
    let src = SRC; for (const [from, to] of ANCHORS) src = src.replace(from, () => to);
    const m = new Module(fake, null); m.filename = fake; m.paths = Module._nodeModulePaths(path.dirname(fake)); m._compile(src, fake);
    mut = m.exports;
  }
  const c = mut ? await parserRoad(mut, { control: true }) : null;
  ok(!!c && c.uncaught.includes('ENOSPC'), `CONTROL (the release's bare timer and bare watch): the ENOSPC throws OUT of the retry timer — the uncaught exception that ended the hub (${c && JSON.stringify(c.uncaught)})`, c);
}

report();

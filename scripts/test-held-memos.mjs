#!/usr/bin/env node
// test-held-memos — B-f276 (lane hub-loop-stalls, 主开发 r4719, the slice «said-once-memos»): FOUR SMALL «ALREADY SAID» RECORDS ARE
// HELD when they cannot be read — never «not said yet». Each through its REAL module over a scratch data folder; the unreadable file is
// a PLACED refusal of the read call (the module's one read and the helper's read again answer EIO — never a mount, never a mode
// change), a torn file its own bytes:
//   ① data/hook-root-notice.json (src/server/hook-root-watch.js): HELD ⇒ the hooks notice is said ONCE a hold (memory only) and
//      nothing is written over the memo; LIFTED ⇒ what was said is the memo (written once), the next judgement says nothing
//   ② data/tls/state.json (src/server/tls.js): HELD ⇒ the HTTPS For-you item is neither filed nor resolved and the record is not
//      written (the status names the hold); LIFTED ⇒ the record read — the item it opened stands, none filed again
//   ③ data/browser-login-reminders.json (src/server/browser-logins.js): HELD ⇒ no reminder, nothing written; LIFTED ⇒ the marks read
//      and the pass run — the reminder already filed is not filed again
//   ④ data/cli-registration.json (src/server/cli-registration.js): HELD ⇒ a build already said is not said again (kept in memory),
//      nothing written; LIFTED ⇒ merged (the older first-seen wins), ONLY a build the record never had is said, written once
//   TORN (each): the bytes kept aside ONCE beside the store (byte for byte), then an empty start
//   RED (each): the tip's read planted back in a copy — the failed read is «not said yet»: said again, and written over
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('held-memos');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(path.join(ROOT, 'home'), { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
process.env.HOME = path.join(ROOT, 'home');
const { ok, report } = checker();
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const SRH = require(path.join(REPO, 'src/store-read-hold.js'));
const M = mutantCopies('held-memos', REPO);
let n = 0;
const dataDir = (tag) => { const d = path.join(ROOT, `${tag}-${++n}`, 'data'); fs.mkdirSync(d, { recursive: true }); return d; };
const fresh = (rel) => { delete require.cache[require.resolve(path.join(REPO, rel))]; return require(path.join(REPO, rel)); };

// THE PLACED REFUSAL: the read call of a refused path answers EIO (the module's sync read, the helper's read again off the loop)
const REFUSED = new Set();
const eio = (p) => Object.assign(new Error(`EIO: i/o error, open '${p}'`), { code: 'EIO', errno: -5, syscall: 'open', path: String(p) });
const realSync = fs.readFileSync, realAsync = fs.promises.readFile;
fs.readFileSync = function (p, ...rest) { if (REFUSED.has(String(p))) throw eio(p); return realSync.call(this, p, ...rest); };
fs.promises.readFile = function (p, ...rest) { if (REFUSED.has(String(p))) return Promise.reject(eio(p)); return realAsync.call(this, p, ...rest); };
const heldNamed = (base) => SRH.holds().filter((h) => h.file === base && h.held).length;
const liftOf = async (file) => { REFUSED.delete(file); return SRH.readAgainOf(path.basename(file)); };
/** a torn store: its bytes kept aside, then lifted as empty — waited on (the hold's own copy, off the loop), a named line at the bound */
const liftedTorn = async (base, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (!SRH.holds().some((h) => h.file === base && h.held)) return true; await new Promise((r) => setTimeout(r, 20)); }
  ok(false, `harness: the torn ${base} was not kept aside and lifted within ${ms / 1000} s`);
  return false;
};
const asideOf = (file) => fs.readdirSync(path.dirname(file)).filter((f) => f.startsWith(path.basename(file) + '.corrupt-'));
const bytesOf = (file) => { try { return realSync(file, 'utf8'); } catch { return null; } };

console.log('① the hooks notice\'s memo (data/hook-root-notice.json)');
{
  const REL = 'src/server/hook-root-watch.js';
  // the world is said under cause A; the held judgements ask cause B — a write while held, or none at the lift, shows in the bytes
  const CAUSE = 'the server root could not be judged: /x/.git cannot be read (EIO)', CAUSE_B = 'the server root could not be judged: /x/.git/commondir cannot be read (EIO)';
  const refusedOf = (c) => ({ kind: 'unknown', why: c, line: 'hooks not registered: ' + c });
  const refused = refusedOf(CAUSE), refusedB = refusedOf(CAUSE_B);
  const rig = (Mod, dir, why = refused) => {
    const notices = [], lines = [];
    const w = Mod.create({ dataDir: dir, ensureAgentHooks: () => ({ skipped: true, refused: why }), rootRecovery: () => ({}), ownerWriteRefusal: () => null,
      serverNotice: (key) => { notices.push(key); return 1; }, setTimer: () => ({ unref() { } }), log: (...a) => lines.push(a.join(' ')) });
    return { w, notices, lines };
  };
  const world = async () => { const dir = dataDir('hook'); const r = rig(fresh(REL), dir); await r.w.sync(); return { dir, file: r.w.memoFile, bytes: bytesOf(r.w.memoFile), said: r.notices.length }; };
  {
    const wd = await world();
    const r = rig(fresh(REL), wd.dir); await r.w.sync();
    ok(wd.said === 1 && r.notices.length === 0, 'control: a readable memo — the next boot under the same cause says nothing', { world: wd.said, now: r.notices });
  }
  {
    const wd = await world();
    REFUSED.add(wd.file);
    const r = rig(fresh(REL), wd.dir, refusedB); await r.w.sync();
    const first = r.notices.length;
    r.w.unknown(refusedB); r.w.unknown(refusedB);
    const held = r.w.held();
    ok(first === 1 && r.notices.length === 1 && bytesOf(wd.file) === wd.bytes && JSON.parse(bytesOf(wd.file)).cause === CAUSE && heldNamed('hook-root-notice.json') === 1 && !!held,
      'HELD (EIO): a new cause\'s notice is said ONCE a hold — two more judgements say nothing more — and nothing is written over the memo (it still holds the earlier cause); the family\'s list names it (a safety notice is never hidden by an unread memo: said once a hold, never at every turn)', { notices: r.notices.length, held });
    const lifted = await liftOf(wd.file);
    r.w.unknown(refusedB);
    ok(lifted === true && r.notices.length === 1 && JSON.parse(bytesOf(wd.file)).cause === CAUSE_B && heldNamed('hook-root-notice.json') === 0,
      'LIFTED by the family\'s read again: what was said while held is the memo (written once at the lift — the earlier cause replaced by the newer), the next judgement says nothing', { lifted, notices: r.notices.length, memo: bytesOf(wd.file) });
  }
  {
    const dir = dataDir('hook'), file = path.join(dir, 'hook-root-notice.json'), TORN = '{"cause": "the server root could';
    fs.writeFileSync(file, TORN);
    const r = rig(fresh(REL), dir); await r.w.sync();
    const lifted = await liftedTorn('hook-root-notice.json');
    const aside = asideOf(file);
    r.w.unknown(refused);
    ok(lifted && aside.length === 1 && bytesOf(path.join(dir, aside[0])) === TORN && r.notices.length === 1 && JSON.parse(bytesOf(file)).cause === CAUSE,
      'TORN: kept aside ONCE (byte for byte), then an empty start — the notice said once, its memo written at the lift, the next judgement says nothing', { aside, notices: r.notices.length });
  }
  {
    const wd = await world();
    REFUSED.add(wd.file);
    const OLD = "    let memo = null; try { memo = JSON.parse(fs.readFileSync(memoFile, 'utf-8')); } catch { memo = null; }\n";   // stale-pins: kept (the tip's read, planted back as the red)
    const Red = M.load(REL, anchored(read(REL), '    const memo = memoNow();\n', OLD, 'the tip\'s read'), 'tip-read');
    const r = rig(Red, wd.dir); await r.w.sync(); r.w.unknown(refused);
    REFUSED.delete(wd.file);
    ok(r.notices.length === 2, `RED (the tip's read planted back, in a copy): the failed read is «not said yet» — the notice is said at EVERY judgement (${r.notices.length}), the memo written over each time`, r.notices);
  }
}

console.log('② the HTTPS record (data/tls/state.json)');
{
  const REL = 'src/server/tls.js';
  const express = require(path.join(REPO, 'node_modules/express'));
  const DNS = 'box.tail0000.ts.net';
  const STATUS = JSON.stringify({ BackendState: 'Running', Self: { DNSName: DNS + '.' }, CertDomains: [] });   // the tailnet's HTTPS certificates off: the owner's step
  const run = async (bin, args) => (args[0] === 'status' ? { code: 0, out: STATUS, err: '', ms: 1 } : { code: 1, out: '', err: 'not asked', ms: 1 });
  const rig = (Mod, dir, tag = 'it') => {
    const items = [], lines = [];
    const todos = { add: (k, it) => { items.push(it); return { id: `${tag}-${items.length}` }; }, get: () => ({ status: 'open' }), setStatus: () => { } };
    const h = Mod.create({ app: express(), httpServer: http.createServer(), dataDir: dir, port: 3456, tailscaleBin: 'tailscale-stand-in', run, env: {},
      serverSetting: () => 'auto', timers: { setTimeout: () => ({ unref() { } }), clearTimeout: () => { } }, getUserTodos: () => todos, log: { log: (s) => lines.push(s), warn: (s) => lines.push(s) } });
    return { h, items, lines };
  };
  // the world: the item filed, and a cert answer the record keeps (the lift must never reset it from the failed read)
  const world = async () => { const dir = dataDir('tls'); const r = rig(fresh(REL), dir); await r.h.pass(); const file = path.join(dir, 'tls', 'state.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(bytesOf(file)), certAnswer: 'the record\'s own cert answer' }, null, 2)); return { dir, file, bytes: bytesOf(file), filed: r.items.length }; };
  {
    const wd = await world();
    const r = rig(fresh(REL), wd.dir); await r.h.pass();
    ok(wd.filed === 1 && r.items.length === 0 && JSON.parse(wd.bytes).itemId === 'it-1', 'control: a readable record — the next start files no second HTTPS item (the open one stands)', { world: wd.filed, now: r.items.length });
  }
  {
    const wd = await world();
    REFUSED.add(wd.file);
    const r = rig(fresh(REL), wd.dir); await r.h.pass();
    const st = r.h.status();
    ok(r.items.length === 0 && bytesOf(wd.file) === wd.bytes && heldNamed('state.json') === 1 && !!st.recordHeld && st.recordHeld.code === 'tls_state_unread' && r.lines.some((l) => /the HTTPS For-you item waits/.test(l)),
      'HELD (EIO): the HTTPS item is neither filed nor resolved, nothing is written over the record; the status and the journal name the hold', { items: r.items.length, recordHeld: st.recordHeld });
    const lifted = await liftOf(wd.file);
    ok(lifted === true && r.items.length === 0 && bytesOf(wd.file) === wd.bytes && !r.h.status().recordHeld && heldNamed('state.json') === 0,
      'LIFTED by the family\'s read again: the record read — the item it opened stands, none filed again, nothing rewritten (its cert answer kept: never reset by the failed read)', { lifted, items: r.items.length, rec: bytesOf(wd.file) });
  }
  {
    const dir = dataDir('tls'), file = path.join(dir, 'tls', 'state.json'), TORN = '{"domain": "box.tail0000.ts.net", "noticed": "https-';
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, TORN);
    const r = rig(fresh(REL), dir); await r.h.pass();
    const lifted = await liftedTorn('state.json');
    const aside = asideOf(file);
    ok(lifted && aside.length === 1 && bytesOf(path.join(path.dirname(file), aside[0])) === TORN && r.items.length === 1 && JSON.parse(bytesOf(file)).itemId === 'it-1',
      'TORN: kept aside ONCE (byte for byte), then an empty start — the item filed once and the record written', { aside, items: r.items.length });
  }
  {
    const wd = await world();
    REFUSED.add(wd.file);
    const NEW = "  { let read; try { read = { text: fs.readFileSync(stateFile, 'utf8') }; } catch (error) { read = { error }; }\n    const a = SR.storeAnswer(read, { valid: isState });   // the HTTPS record: THE ANCHOR (test-data-store-census)\n    if (stateHold.start(a) === 'data') Object.assign(state, a.value); }\n";
    const OLD = "  try { Object.assign(state, JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {}); } catch { }\n";   // stale-pins: kept (the tip's read, planted back as the red)
    const Red = M.load(REL, anchored(read(REL), NEW, OLD, 'the tip\'s read'), 'tip-read');
    const r = rig(Red, wd.dir, 'red'); await r.h.pass();
    REFUSED.delete(wd.file);
    const after = bytesOf(wd.file);
    ok(r.items.length === 1 && after !== wd.bytes && JSON.parse(after).itemId === 'red-1', `RED (the tip's read planted back, in a copy): a first run — the HTTPS item filed AGAIN (${r.items.length}) and the record written over (the open item's id lost: ${JSON.parse(wd.bytes).itemId} → ${JSON.parse(after).itemId})`, { items: r.items.length });
  }
}

console.log('③ the sign-in reminders\' ledger (data/browser-login-reminders.json)');
{
  const REL = 'src/server/browser-logins.js';
  const DAY = 86_400_000, T0 = 1_800_000_000_000;
  const NAME = 'web-login:https://shop.example.test#bob';
  const REC = { v: 1, schema: 2, origin: 'https://shop.example.test', username: 'bob', rev: 1, current: null, pending: { kind: 'register', password: 'Pw-memo-7731', createdAt: T0 } };
  const OLD_MARK = 'ab'.repeat(16);   // a past episode's mark the ledger keeps (the tip's write over it drops it)
  const vaultOf = (dir) => ({ dataDir: dir, state: () => 'unlocked', secretNames: () => [{ name: NAME, at: T0, kind: 'owner', pending: 'register', rev: 1 }],
    secretGet: () => ({ ok: true, value: Buffer.from(JSON.stringify(REC)) }), macOf: (p, rk) => crypto.createHash('sha256').update(`${p}\0${rk}`).digest('hex') });
  const rig = (Mod, dir) => {
    const items = [], lines = [];
    const forYou = { add: (pid, it) => { items.push(it); return 'fy-' + items.length; }, resolve: () => { }, get: () => null, list: () => [] };
    const L = Mod.create({ vault: vaultOf(dir), dataDir: dir, forYou, now: () => T0 + 8 * DAY, log: (l) => lines.push(String(l)) });
    return { L, items, lines };
  };
  const world = async () => {
    const dir = dataDir('remind'), file = path.join(dir, 'browser-login-reminders.json');
    const r = rig(fresh(REL), dir); const reminded = r.L.maybeRemindPending();
    const led = JSON.parse(bytesOf(file)); fs.writeFileSync(file, JSON.stringify({ v: 1, reminded: [OLD_MARK, ...led.reminded] }));
    return { dir, file, bytes: bytesOf(file), reminded };
  };
  {
    const wd = await world();
    const r = rig(fresh(REL), wd.dir);
    ok(wd.reminded === 1 && r.L.maybeRemindPending() === 0 && r.items.length === 0, 'control: a readable ledger — the next start reminds nothing already reminded', { world: wd.reminded, now: r.items.length });
  }
  {
    const wd = await world();
    REFUSED.add(wd.file);
    const r = rig(fresh(REL), wd.dir);
    const now = r.L.maybeRemindPending();
    ok(now === 0 && r.items.length === 0 && bytesOf(wd.file) === wd.bytes && heldNamed('browser-login-reminders.json') === 1 && r.lines.some((l) => /the pending sign-in reminders wait/.test(l)) && r.L._pendingCards.size === 1,
      'HELD (EIO): the pass reminds nothing and writes nothing, yet the pending card is still REGISTERED (a later Confirm or Discard resolves the card an earlier run filed); the journal and the family\'s list name the hold', { now, items: r.items.length, cards: r.L._pendingCards.size });
    const lifted = await liftOf(wd.file);
    ok(lifted === true && r.items.length === 0 && bytesOf(wd.file) === wd.bytes && heldNamed('browser-login-reminders.json') === 0,
      'LIFTED by the family\'s read again: the marks read and the pass run — the reminder already filed is not filed again, the ledger untouched', { lifted, items: r.items.length });
  }
  {
    const dir = dataDir('remind'), file = path.join(dir, 'browser-login-reminders.json'), TORN = '{"v": 1, "reminded": ["abab';
    fs.writeFileSync(file, TORN);
    const r = rig(fresh(REL), dir);
    const during = r.L.maybeRemindPending();
    const lifted = await liftedTorn('browser-login-reminders.json');
    const aside = asideOf(file);
    const led = (() => { try { return JSON.parse(bytesOf(file)); } catch { return null; } })();
    ok(during === 0 && lifted && aside.length === 1 && bytesOf(path.join(dir, aside[0])) === TORN && r.items.length === 1 && !!led && led.reminded.length === 1,
      'TORN: nothing reminded while held; kept aside ONCE (byte for byte), then an empty start — the pass at the lift reminds once and writes the ledger', { during, aside, items: r.items.length });
  }
  {
    const wd = await world();
    REFUSED.add(wd.file);
    const NEW = "    let read; try { read = { text: fs.readFileSync(remindFile, 'utf8') }; } catch (error) { read = { error }; }\n    const a = SR.storeAnswer(read, { valid: isLedger });   // the sign-in reminders' ledger: THE ANCHOR (test-data-store-census)\n    if (remindHold.start(a) === 'data') addDigests(a.value);\n";
    const OLD = "    let raw;\n    try { raw = fs.readFileSync(remindFile, 'utf8'); } catch { return; }\n    let parsed;\n    try { parsed = JSON.parse(raw); } catch { return; }\n    addDigests(parsed);\n";   // stale-pins: kept (the tip's read, planted back as the red)
    const Red = M.load(REL, anchored(read(REL), NEW, OLD, 'the tip\'s read'), 'tip-read');
    const r = rig(Red, wd.dir);
    const again = r.L.maybeRemindPending();
    REFUSED.delete(wd.file);
    const after = JSON.parse(bytesOf(wd.file));
    ok(again === 1 && r.items.length === 1 && !after.reminded.includes(OLD_MARK), `RED (the tip's read planted back, in a copy): «nobody reminded yet» — the reminder filed AGAIN (${r.items.length}) and the ledger written over (the past episode's mark lost)`, after.reminded);
  }
}

console.log('④ the record of the claude builds said (data/cli-registration.json)');
{
  const REL = 'src/server/cli-registration.js';
  const PIN = ['2.1.300'], V = '2.1.999', V2 = '2.1.1000', T1 = 1_700_000_000_000;
  const rig = (Mod, dir, at) => {
    const events = [], lines = [];
    const reg = Mod.create({ dataDir: dir, rootDir: REPO, pinned: PIN, log: (l) => lines.push(String(l)), event: (k, d) => events.push(d), now: () => at });
    return { reg, events, lines };
  };
  const world = () => { const dir = dataDir('clireg'), file = path.join(dir, 'cli-registration.json'); const r = rig(fresh(REL), dir, T1); r.reg.note(V, 'hub'); return { dir, file, bytes: bytesOf(file), said: r.events.length }; };
  {
    const wd = world();
    const r = rig(fresh(REL), wd.dir, T1 + 1000); const a = r.reg.note(V, 'hub');
    ok(wd.said === 1 && r.events.length === 0 && a.said === false, 'control: a readable record — the next start does not say the same build again', { world: wd.said, now: r.events });
  }
  {
    const wd = world();
    REFUSED.add(wd.file);
    const r = rig(fresh(REL), wd.dir, T1 + 1000);
    const a = r.reg.note(V, 'hub'), b = r.reg.note(V2, 'conversation');
    const st = r.reg.status();
    ok(a.held === true && b.held === true && r.events.length === 0 && bytesOf(wd.file) === wd.bytes && heldNamed('cli-registration.json') === 1 && !!st.held && st.held.code === 'cli_registration_unread',
      'HELD (EIO): neither the build already said nor a new one is said, nothing is written over the record; the status and the family\'s list name the hold', { events: r.events, held: st.held });
    const lifted = await liftOf(wd.file);
    const rec = JSON.parse(bytesOf(wd.file));
    ok(lifted === true && r.events.length === 1 && r.events[0].includes(V2) && rec.seen[V].firstSeen === T1 && rec.seen[V2].firstSeen === T1 + 1000 && heldNamed('cli-registration.json') === 0,
      'LIFTED by the family\'s read again: merged — ONLY the build the record never had is said, the older first-seen kept, written once', { lifted, events: r.events, seen: rec.seen });
  }
  {
    const dir = dataDir('clireg'), file = path.join(dir, 'cli-registration.json'), TORN = '{"v": 1, "seen": {"2.1.999": {"firstSeen": 17';
    fs.writeFileSync(file, TORN);
    const r = rig(fresh(REL), dir, T1);
    r.reg.note(V, 'hub');
    const lifted = await liftedTorn('cli-registration.json');
    const aside = asideOf(file);
    const rec = (() => { try { return JSON.parse(bytesOf(file)); } catch { return null; } })();
    ok(lifted && aside.length === 1 && bytesOf(path.join(dir, aside[0])) === TORN && r.events.length === 1 && !!rec && !!rec.seen[V],
      'TORN: kept aside ONCE (byte for byte), then an empty start — the build seen meanwhile said once at the lift and written', { aside, events: r.events });
  }
  {
    const wd = world();
    REFUSED.add(wd.file);
    const NEW = "  { let read; try { read = { text: fs.readFileSync(stateFile, 'utf8') }; } catch (error) { read = { error }; }\n    const a = SR.storeAnswer(read, { valid: isRecord });   // the record of the builds said: THE ANCHOR (test-data-store-census)\n    if (hold.start(a) === 'data') seen = prune(isRecord(a.value.seen) ? a.value.seen : {}); }\n";
    const OLD = "  try { const j = JSON.parse(fs.readFileSync(stateFile, 'utf8')); if (j && j.seen && typeof j.seen === 'object') seen = j.seen; } catch { }\n  prune(seen);\n";   // stale-pins: kept (the tip's read, planted back as the red)
    const Red = M.load(REL, anchored(read(REL), NEW, OLD, 'the tip\'s read'), 'tip-read');
    const r = rig(Red, wd.dir, T1 + 5000); r.reg.note(V, 'hub');
    REFUSED.delete(wd.file);
    const rec = JSON.parse(bytesOf(wd.file));
    ok(r.events.length === 1 && rec.seen[V].firstSeen === T1 + 5000, `RED (the tip's read planted back, in a copy): «no build seen» — the build said AGAIN (${r.events.length}) and the record written over (its first-seen reset: ${T1} → ${rec.seen[V].firstSeen})`, r.events);
  }
}

report();

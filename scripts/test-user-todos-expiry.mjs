#!/usr/bin/env node
// test-user-todos-expiry — "SPEND NOTICES LIVED FOREVER AS ACTIONS" (2.369.152).
// The owner's inbox held 13 spend warnings about hour/day windows that had
// closed 137–288 h earlier: filed before the notice lane existed, never
// migrated, never expiring. The fix has three halves and every one is driven
// here against the REAL module, each leg beside a negative control — a patched
// copy of the same module with the fix taken out, on which the leg's own
// assertion must FAIL (a leg that passes on the broken code proves nothing):
//   ① UserTodoManager.add() takes an optional `expiresAt` (a future ms epoch,
//     else ignored); a merge into an OPEN item keeps the LATER end
//   ② expireDue() resolves every due OPEN item 'expired' — one save, one
//     broadcast, a count — and never an item without expiresAt or one already
//     resolved; the manager runs it at load and on an unref'd 5-min timer
//   ③ spend-guard stamps every inbox item by what it is ABOUT: the hour
//     warning +60 min, the day warning +24 h, the refusal +6 h
// (the migration of what the store already held is a leg of test-migrations).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cleanup = [];
process.on('exit', () => { for (const f of cleanup) { try { fs.rmSync(f, { recursive: true, force: true }); } catch { } } });
const tmpdir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ut-expiry-')); cleanup.push(d); return d; };
// A PATCHED COPY written beside the original (so its relative requires still
// resolve), removed on exit. Every needle must exist — a control whose edit
// silently missed would be the real module wearing a control's name.
let mutN = 0;
function mutant(rel, edits) {
  let src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  for (const [from, to] of edits) {
    if (!src.includes(from)) throw new Error(`control needle missing in ${rel}: ${from.slice(0, 70)}`);
    src = src.split(from).join(to);
  }
  const f = path.join(REPO, path.dirname(rel), `vs-ut-expiry-mut-${process.pid}-${++mutN}.js`);
  fs.writeFileSync(f, src); cleanup.push(f);
  return require(f);
}

const UT = require(path.join(REPO, 'src/user-todos.js'));
const guardMod = require(path.join(REPO, 'src/server/spend-guard.js'));
const MIN = 60 * 1000, HOUR = 60 * MIN;
const mk = (Mod, opts = {}) => { const d = tmpdir(); const m = new Mod.UserTodoManager({ dataDir: d, expirySweepMs: 0, ...opts }); return { m, d }; };

try {
  // ── ① add() validation ────────────────────────────────────────────────────
  console.log('\n① add() takes an optional expiresAt — a future ms epoch, anything else ignored');
  const addLeg = (Mod) => {
    const { m } = mk(Mod);
    const now = Date.now();
    const fut = m.add('accounts', { text: 'future', expiresAt: now + HOUR });
    const past = m.add('accounts', { text: 'past', expiresAt: now - 1 });
    const nan = m.add('accounts', { text: 'nan', expiresAt: NaN });
    const str = m.add('accounts', { text: 'str', expiresAt: String(now + HOUR) });
    const none = m.add('accounts', { text: 'none' });
    return { fut: fut.expiresAt, past: past.expiresAt, nan: nan.expiresAt, str: str.expiresAt, none: none.expiresAt, now };
  };
  const a = addLeg(UT);
  ok(a.fut === a.now + HOUR, 'a future expiresAt is stored as given', a);
  ok(a.past === null && a.nan === null && a.str === null, 'a past, NaN or string expiresAt is IGNORED (null) — never an item dead on arrival, never a throw', a);
  ok(a.none === null, 'no expiresAt ⇒ null (a lasting item)', a);
  const aCtl = addLeg(mutant('src/user-todos.js', [["    expiresAt = validExpiry(expiresAt);\n", "    expiresAt = expiresAt == null ? null : expiresAt;\n"]]));
  ok(!(aCtl.past === null && aCtl.nan === null && aCtl.str === null), 'CONTROL: without validExpiry the past/NaN/string values reach the store (the validation leg fails on it)', aCtl);
  const aPre = addLeg(mutant('src/user-todos.js', [['      expiresAt, // ms epoch', '      // expiresAt dropped (pre-fix) // ms epoch']]));
  ok(aPre.fut !== aPre.now + HOUR, 'CONTROL: a store that never records the field (the pre-fix shape) loses the stamp', aPre);

  // ── ① merge takes the LATER end ─────────────────────────────────────────────
  console.log('\n① a re-file merges into the open item and keeps the LATER expiresAt');
  const mergeLeg = (Mod) => {
    const { m } = mk(Mod);
    const now = Date.now();
    m.add('accounts', { text: 'w', expiresAt: now + HOUR });
    const later = m.add('accounts', { text: 'w', expiresAt: now + 3 * HOUR }).expiresAt;
    const earlier = m.add('accounts', { text: 'w', expiresAt: now + 2 * HOUR }).expiresAt;
    m.add('accounts', { text: 'lasting' });
    const lasting = m.add('accounts', { text: 'lasting', expiresAt: now + HOUR }).expiresAt;
    // a RESOLVED item re-filed is a new filing: its own end, or none
    const r = m.add('accounts', { text: 'r', expiresAt: now + HOUR });
    m.setStatus(r.id, 'done', 'user');
    const reopenedWith = m.add('accounts', { text: 'r', expiresAt: now + 5 * HOUR });
    m.setStatus(r.id, 'done', 'user');
    const reopenedWithout = m.add('accounts', { text: 'r' });
    return { now, later, earlier, lasting, reopenedWith: reopenedWith.expiresAt, reopenedStatus: reopenedWith.status, reopenedWithout: reopenedWithout.expiresAt };
  };
  const g = mergeLeg(UT);
  ok(g.later === g.now + 3 * HOUR, 'a later re-file extends the open item', g);
  ok(g.earlier === g.now + 3 * HOUR, 'an EARLIER re-file never shortens it', g);
  ok(g.lasting === null, 'an open item with no expiresAt is lasting — a re-file never makes it expire', g);
  ok(g.reopenedWith === g.now + 5 * HOUR && g.reopenedStatus === 'open', 'a resolved item re-filed reopens with the NEW end', g);
  ok(g.reopenedWithout === null, '…and re-filed with none it is lasting again (the old, past end would kill it on the next sweep)', g);
  const gCtl = mergeLeg(mutant('src/user-todos.js', [['expiresAt && existing.expiresAt != null && expiresAt > existing.expiresAt', 'expiresAt']]));
  ok(!(gCtl.earlier === gCtl.now + 3 * HOUR && gCtl.lasting === null), 'CONTROL: "the newest filing wins" shortens the item and ends a lasting one (the merge leg fails on it)', gCtl);

  // ── ② expireDue ───────────────────────────────────────────────────────────
  console.log('\n② expireDue resolves only due OPEN items — one save, one broadcast, a count');
  const dueLeg = (Mod) => {
    let broadcasts = 0;
    const { m, d } = mk(Mod, { onChange: () => { broadcasts++; } });
    const now = Date.now();
    const due1 = m.add('accounts', { text: 'due1', expiresAt: now + MIN });
    const due2 = m.add('accounts', { text: 'due2', expiresAt: now + 2 * MIN });
    const later = m.add('accounts', { text: 'later', expiresAt: now + HOUR });
    const lasting = m.add('accounts', { text: 'lasting' });
    const done = m.add('accounts', { text: 'done', expiresAt: now + MIN });
    m.setStatus(done.id, 'done', 'user');
    const doneAt = m.get(done.id).resolvedAt;
    const b0 = broadcasts;
    const at = now + 3 * MIN;
    const n = m.expireDue(at);
    const b1 = broadcasts - b0;
    const n2 = m.expireDue(at);
    const b2 = broadcasts - b0 - b1;
    m.flush();
    const disk = JSON.parse(fs.readFileSync(path.join(d, 'user-todos.json'), 'utf8')).items;
    const g1 = m.get(due1.id), g2 = m.get(due2.id);
    return {
      n, b1, n2, b2,
      due: [g1, g2].every((x) => x.status === 'done' && x.resolvedBy === 'expired' && x.resolvedAt === at),
      later: m.get(later.id).status, lasting: m.get(lasting.id).status,
      done: { by: m.get(done.id).resolvedBy, at: m.get(done.id).resolvedAt === doneAt },
      disk: disk.filter((x) => x.resolvedBy === 'expired').length,
      open: m.snapshot().open.map((x) => x.text).sort().join(','),
    };
  };
  const e = dueLeg(UT);
  ok(e.n === 2 && e.due, 'the two due items are resolved done/expired at the sweep instant; the count is returned', e);
  ok(e.b1 === 1, 'ONE broadcast for the whole sweep', e);
  ok(e.n2 === 0 && e.b2 === 0, 'a second sweep finds nothing and says nothing', e);
  ok(e.later === 'open' && e.lasting === 'open', 'an item not yet due and an item with NO expiresAt stay open', e);
  ok(e.done.by === 'user' && e.done.at, 'an already-resolved item is never touched (its resolvedBy/resolvedAt kept)', e);
  ok(e.disk === 2, 'the sweep is persisted through the store\'s own writer', e);
  ok(e.open === 'lasting,later', 'the open listing (the badge\'s input) no longer carries them', e);
  const eCtl1 = dueLeg(mutant('src/user-todos.js', [["      if (it.status !== 'open') continue;\n      if (!(typeof it.expiresAt", "      if (!(typeof it.expiresAt"]]));
  ok(!(eCtl1.done.by === 'user' && eCtl1.done.at), 'CONTROL: without the open-only guard a resolved item is re-resolved "expired" (the leg fails on it)', eCtl1.done);
  const eCtl2 = dueLeg(mutant('src/user-todos.js', [["      n++;\n    }\n    if (n) { this._save(); this._notify(); }\n    return n;\n  }\n\n  /** THE store's door", "      n++; this._save(); this._notify();\n    }\n    return n;\n  }\n\n  /** THE store's door"]]));
  ok(eCtl2.b1 !== 1, 'CONTROL: a broadcast per item is caught (2 broadcasts for 2 items)', eCtl2);
  const eCtl3 = dueLeg(mutant('src/user-todos.js', [["if (!(typeof it.expiresAt === 'number' && Number.isFinite(it.expiresAt)) || it.expiresAt > now) continue;", "if (Number(it.expiresAt) > now) continue;"]]));
  ok(eCtl3.lasting !== 'open', 'CONTROL: judging a missing expiresAt as 0 expires the lasting item (the leg fails on it)', eCtl3);

  // ── ② at load + on an unref'd timer ─────────────────────────────────────────
  console.log('\n② the store sweeps at load and on an unref\'d interval; stop() clears it');
  {
    const d = tmpdir();
    const now = Date.now();
    fs.writeFileSync(path.join(d, 'user-todos.json'), JSON.stringify({ items: [
      { id: 'ut-a', sessionKey: 'accounts', text: 'went while down', status: 'open', kind: 'notice', expiresAt: now - HOUR, createdAt: now - 2 * HOUR, resolvedAt: null, resolvedBy: null },
      { id: 'ut-b', sessionKey: 'accounts', text: 'lasting', status: 'open', createdAt: now - 300 * HOUR, resolvedAt: null, resolvedBy: null },
    ] }));
    const m = new UT.UserTodoManager({ dataDir: d });
    ok(m.get('ut-a').resolvedBy === 'expired' && m.get('ut-b').status === 'open', 'an item that expired while the server was down goes AT LOAD; a lasting one stays', [m.get('ut-a'), m.get('ut-b')].map((x) => [x.status, x.resolvedBy]));
    ok(m._expiryTimer && typeof m._expiryTimer.hasRef === 'function' && m._expiryTimer.hasRef() === false, 'the default 5-min timer exists and is unref\'d (it never holds the process open)');
    ok(UT.EXPIRY_SWEEP_MS === 5 * MIN, 'the cadence is 5 minutes', UT.EXPIRY_SWEEP_MS);
    m.stop();
    ok(m._expiryTimer === null, 'stop() clears it');
    m.flush();
    // the interval actually sweeps
    const { m: m2 } = mk(UT, { expirySweepMs: 25 });
    const it = m2.add('accounts', { text: 'soon', expiresAt: Date.now() + 30 });
    await sleep(120);
    ok(m2.get(it.id).resolvedBy === 'expired', 'the interval resolves an item once it is due, with nobody calling expireDue', m2.get(it.id));
    m2.stop(); m2.flush();
    const Ctl = mutant('src/user-todos.js', [['      if (this._expiryTimer.unref) this._expiryTimer.unref();\n', '']]);
    const c = new Ctl.UserTodoManager({ dataDir: tmpdir() });
    ok(c._expiryTimer.hasRef() === true, 'CONTROL: without unref() the timer holds a ref (the leg\'s assertion fails on it)');
    c.stop();
    const Ctl2 = mutant('src/user-todos.js', [['    this.expireDue();\n    if (expirySweepMs > 0) {', '    if (expirySweepMs > 0) {']]);
    const d2 = tmpdir();
    fs.writeFileSync(path.join(d2, 'user-todos.json'), JSON.stringify({ items: [{ id: 'ut-a', sessionKey: 'accounts', text: 'x', status: 'open', expiresAt: now - HOUR, createdAt: now - 2 * HOUR }] }));
    const c2 = new Ctl2.UserTodoManager({ dataDir: d2, expirySweepMs: 0 });
    ok(c2.get('ut-a').status === 'open', 'CONTROL: without the load-time sweep the stale item survives the boot');
  }

  // ── reopen by the user makes it lasting ────────────────────────────────────
  {
    const { m } = mk(UT);
    const i = m.add('accounts', { text: 'x', expiresAt: Date.now() + MIN });
    m.expireDue(Date.now() + 2 * MIN);
    m.setStatus(i.id, 'open', 'user');
    const n = m.expireDue(Date.now() + 3 * MIN);
    ok(n === 0 && m.get(i.id).status === 'open' && m.get(i.id).expiresAt === null, 'a user REOPEN of an expired item makes it lasting (the next sweep does not take it back)', m.get(i.id));
  }

  // ── ③ spend-guard stamps by what the notice is about ────────────────────────
  console.log('\n③ spend-guard stamps every inbox item with the end of the window it is about');
  const stampLeg = (G) => {
    const inbox = [];
    const run = (settings, drive) => {
      const d = tmpdir();
      const guard = G.create({
        dataDir: d, serverSetting: (k) => settings[k],
        identityOf: (s) => (s && s.id ? { key: s.id, name: s.id.toUpperCase() } : null),
        getUserTodos: () => ({ add: (key, item) => { inbox.push({ key, ...item }); return { id: 'ut-' + inbox.length }; } }),
        log: () => { },
      });
      const t0 = Date.now();
      drive(guard, t0);
      return t0;
    };
    const S = { id: 'sub-a' };
    const tHour = run({ 'spend.unattendedPerIdentityHour': 10 }, (g, t) => { for (let i = 0; i < 8; i++) g.note({ reason: 'stop-nudge', session: S, now: t }); });
    const hour = inbox.find((i) => /this hour/.test(i.text));
    const tDay = run({ 'spend.unattendedPerIdentityHour': 200, 'spend.unattendedPerIdentityDay': 10 }, (g, t) => { for (let i = 0; i < 8; i++) g.note({ reason: 'stop-nudge', session: S, now: t }); });
    const day = inbox.find((i) => /today/.test(i.text));
    const tRef = run({ 'spend.unattendedPerIdentityHour': 2 }, (g, t) => { g.note({ reason: 'auto-resume', session: S, now: t }); g.note({ reason: 'auto-resume', session: S, now: t }); g.authorize({ reason: 'auto-resume', session: S, now: t }); });
    const ref = inbox.find((i) => /VibeSpace refused/.test(i.text));
    return { hour: hour && hour.expiresAt - tHour, day: day && day.expiresAt - tDay, ref: ref && ref.expiresAt - tRef, kinds: inbox.map((i) => i.kind), n: inbox.length };
  };
  const s = stampLeg(guardMod);
  ok(s.hour === HOUR, 'the hour-window warning expires 60 min after it is filed', s);
  ok(s.day === 24 * HOUR, 'the day-window warning expires 24 h after it is filed', s);
  ok(s.ref === 6 * HOUR && guardMod.REFUSE_INBOX_MS === 6 * HOUR, 'the refusal expires after 6 h — its own re-file cadence', s);
  ok(s.kinds.length >= 3 && s.kinds.every((k) => k === 'notice'), 'every one stays kind notice', s.kinds);
  const sCtl = stampLeg(mutant('src/server/spend-guard.js', [["kind: 'notice', expiresAt });", "kind: 'notice' });"]]));
  ok(!(sCtl.hour === HOUR || sCtl.day === 24 * HOUR || sCtl.ref === 6 * HOUR), 'CONTROL: the pre-fix fileInbox (no expiresAt) fails all three stamps', sCtl);
  const sCtl2 = stampLeg(mutant('src/server/spend-guard.js', [["noticeExpiry(r.warn.scope, now)", "noticeExpiry('day', now)"]]));
  ok(sCtl2.hour !== HOUR, 'CONTROL: stamping every warning with the day window is caught by the hour leg', sCtl2);

  // ── ③ end to end: the real guard into the real store ────────────────────────
  console.log('\n③ end to end: the real guard files into the real store, and the notice dies with its hour');
  {
    const { m } = mk(UT);
    const d = tmpdir();
    const guard = guardMod.create({ dataDir: d, serverSetting: (k) => ({ 'spend.unattendedPerIdentityHour': 10 })[k], identityOf: () => ({ key: 'sub-z', name: 'Z' }), getUserTodos: () => m, log: () => { } });
    const t0 = Date.now();
    for (let i = 0; i < 8; i++) guard.note({ reason: 'stop-nudge', session: { id: 'x' }, now: t0 });
    guard.flush();
    const item = m.snapshot().open.find((i) => i.sessionName === 'Spending');
    ok(item && item.kind === 'notice' && item.expiresAt === t0 + HOUR, 'the warning lands in the store as a notice carrying its hour\'s end', item);
    ok(m.expireDue(t0 + HOUR - 1) === 0 && m.get(item.id).status === 'open', 'a minute before the end it is still open');
    ok(m.expireDue(t0 + HOUR) === 1 && m.get(item.id).resolvedBy === 'expired', 'at the end of its hour it is resolved expired');
    m.flush();
  }
} catch (err) {
  fail++; console.log('  ✗ the suite threw: ' + (err && err.stack || err));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

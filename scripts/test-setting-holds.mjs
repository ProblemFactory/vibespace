#!/usr/bin/env node
// lane setting-doors pick 2 (主开发's GO 2026-11-15 14:03Z, seven amendments) — A PROPOSED CHANGE THE OWNER TAKES IN ONE PRESS.
// `vibespace-ask "…" --propose <row>=<value> [--until …]`: the action built by the hub from the schema's own facts (src/ask-setting.js),
// the owner's ONE press = ONE server act (src/server/setting-holds.js: the hold on disk BEFORE the value), a raise always time-boxed,
// one hold per row keeping the first «before», the quiet return that never overwrites a hand change. PURE + in-process.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ownerPageHeaders, scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 900)); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const AS = require(path.join(REPO, 'src/ask-setting.js'));
const SH = require(path.join(REPO, 'src/server/setting-holds.js'));
const DAY = 'spend.unattendedPerInstanceDay', HOUR = 'spend.unattendedPerIdentityHour';
const NOW = Date.UTC(2026, 10, 15, 14, 0);   // 06:00 in the owner's zone (UTC−8)
const PT = -480;
const ROOT = scratch('setting-holds'); fs.mkdirSync(ROOT, { recursive: true });   // ended at exit (scratch.mjs)
let nDir = 0;
const dirOf = () => { const d = path.join(ROOT, String(++nDir)); fs.mkdirSync(d, { recursive: true }); return d; };

console.log('① the closed list and the ask\'s verdict (src/ask-setting.js, PURE)');
{
  const sch = read('src/lib/settings-schema.js');
  const marked = [...sch.matchAll(/^  '([\w.]+)': \{\n\s+type: 'number', default: (\d+), min: (\d+), max: (\d+), step: (\d+), proposable: true,/gm)].map((m) => ({ key: m[1], def: +m[2], min: +m[3], max: +m[4], step: +m[5] }));
  ok(marked.length === 3 && JSON.stringify(Object.keys(AS.PROPOSABLE).sort()) === JSON.stringify(marked.map((x) => x.key).sort()) && verdictOf(marked.every((x) => { const p = AS.PROPOSABLE[x.key]; return p.def === x.def && p.min === x.min && p.max === x.max && p.step === x.step; })),
    'the closed list IS the schema rows marked `proposable: true` — the three ceilings on turns nobody typed, key, default, min, max and step equal', marked);
  ok(AS.LINK(DAY) === require(path.join(REPO, 'src/internal-link.js')).settingLink(DAY), 'its link is the scheme\'s spelling (src/internal-link.js)');
  const r = (o, p = 800) => AS.askVerdict(o, { present: p, now: NOW, tzOffsetMin: PT });
  const raise = r({ propose: `${DAY}=1600`, until: '6h' });
  ok(gateOf(raise.ok) && raise.action.type === 'setting-change' && raise.action.key === DAY && raise.action.value === 1600 && raise.action.was === 800 && raise.action.untilRel === 6 * 3600e3 && raise.action.askedAt === NOW, 'a raise with --until 6h ⇒ the action: the row, the value, the value when asked, a stretch counted from the PRESS', raise);
  const noUntil = r({ propose: `${DAY}=1600` });
  ok(!noUntil.ok && noUntil.code === 'raise-needs-until' && verdictOf(noUntil.error.includes(`vibespace://settings/${DAY}`)), 'amendment 1: a RAISE with no «until» is refused by name, with the row\'s link (a lasting raise is the row\'s own)', noUntil);   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  ok(gateOf(r({ propose: `${DAY}=400` }).ok) && verdictOf(r({ propose: `${DAY}=400`, until: '2h' }).ok), 'a LOWER may last, or carry an «until»');
  ok(r({ propose: `${DAY}=800` }).code === 'propose-same', 'a value equal to the present one is refused (nothing to change)');
  const off = r({ propose: 'chat.uploadDir=1' }), judge = r({ propose: 'plugin.llm.dailyBudgetUsd=5', until: '1h' });
  ok(off.code === 'propose-not-allowed' && gateOf(off.error.includes('vibespace://settings/chat.uploadDir')) && judge.code === 'propose-not-allowed', 'amendment 7: a row off the closed list (the judge\'s daily cap too) is refused by name with ITS link', { off, judge });
  ok(r({ propose: `${DAY}=20000`, until: '1h' }).code === 'propose-range' && r({ propose: `${DAY}=abc` }).code === 'propose-bad' && r({ propose: 'x' }).code === 'propose-bad', 'a value out of the row\'s range, not a number, or no `=` — refused by name');
  ok(AS.parseUntil('4m', { now: NOW }).code === 'until-range' && AS.parseUntil('49h', { now: NOW }).code === 'until-range' && AS.parseUntil('3d', { now: NOW }).code === 'until-range' && gateOf(AS.parseUntil('5m', { now: NOW }).ok) && verdictOf(AS.parseUntil('48h', { now: NOW }).ok),
    'amendment 2: «until» is 5 minutes to 48 hours away (4 m, 49 h, 3 d refused; 5 m, 48 h taken)');
  const clock = AS.parseUntil('22:00', { now: NOW, tzOffsetMin: PT }), iso = AS.parseUntil('2026-11-15T20:00:00Z', { now: NOW });
  ok(clock.untilAt === Date.UTC(2026, 10, 16, 6, 0) && iso.untilAt === Date.UTC(2026, 10, 15, 20, 0), 'a clock time is the NEXT such moment on the owner\'s clock (22:00 in UTC−8 = 06:00 UTC tomorrow); an ISO moment as written', { clock, iso });
  ok(AS.parseUntil('soon', { now: NOW }).code === 'until-bad' && AS.parseUntil('25:00', { now: NOW }).code === 'until-bad', 'an «until» that is no moment is refused by name');
}

console.log('② the press\'s verdict — judged again at the PRESS (amendments 1, 5)');
{
  const a = { type: 'setting-change', key: DAY, value: 1600, untilRel: 6 * 3600e3 };
  const p1 = AS.pressVerdict(a, { present: 800, now: NOW + 3600e3 });
  ok(gateOf(p1.press) && gateOf(p1.raise) && p1.untilAt === NOW + 3600e3 + 6 * 3600e3, 'amendment 5: a RELATIVE «until» counts from the PRESS (pressed an hour later, it still runs six hours)', p1);
  const at = { type: 'setting-change', key: DAY, value: 1600, untilAt: NOW + 3600e3 };
  ok(AS.pressVerdict(at, { present: 800, now: NOW + 2 * 3600e3 }).why === 'passed', 'a CLOCK moment passed when the owner looks ⇒ no press');
  ok(AS.pressVerdict({ type: 'setting-change', key: DAY, value: 1600 }, { present: 800, now: NOW }).why === 'raise-needs-until', 'amendment 1 at the press: a value that became a raise (no «until») is no press — a ceiling is never left raised with nothing to return it');
  const lastLower = AS.pressVerdict({ type: 'setting-change', key: DAY, value: 400, untilRel: null, untilAt: null }, { present: 800, now: NOW });
  ok(gateOf(lastLower.press) && lastLower.untilAt === null && !lastLower.raise, 'an ABSENT «until» (null on the wire) is no moment — a lasting lower presses (Number(null) is 0: never a moment «now»)', lastLower);
  ok(AS.pressVerdict(a, { present: 1600, now: NOW }).why === 'same' && AS.pressVerdict({ ...a, key: 'chat.uploadDir' }, { present: 0, now: NOW }).why === 'not-proposable', 'already the value ⇒ no press; a row off the list ⇒ no press');
}

console.log('③ THE HOLD STORE — one act, the hold on disk FIRST; one hold per row; the quiet return (src/server/setting-holds.js)');
{
  const mk = ({ durable = true, patchThrows = false, settings = {}, file = null } = {}) => {
    const dir = dirOf();
    const st = { ...settings }, order = [], told = [], owner = [], logs = [], timers = [];
    let t = NOW;
    const writer = { dirty: (f, o) => { order.push('hold-written'); st.__lastHold = JSON.parse(o.produce()); }, durable: async () => (typeof durable === 'function' ? durable() : durable) };
    const H = SH.create({ dataDir: dir, readSettings: () => st, patchSettings: (p) => { if (patchThrows) throw new Error('disk full'); order.push('value-changed'); for (const [k, v] of Object.entries(p)) { if (v === null) delete st[k]; else st[k] = v; } },
      broadcast: (m) => told.push(m), userTodos: { add: (key, n) => { owner.push({ key, ...n }); return { id: 'n1' }; } }, log: (m) => logs.push(m), now: () => t, writer,
      setTimer: (fn, ms) => { const h = { fn, ms }; timers.push(h); return h; }, clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); } });
    if (file !== null) fs.writeFileSync(path.join(dir, 'setting-holds.json'), file);
    return { H, st, order, told, owner, logs, timers, dir, at: (ms) => { t = ms; } };
  };
  {
    const k = mk({ settings: { [DAY]: 800 } });
    const r = await k.H.take({ key: DAY, value: 1600, untilRel: 6 * 3600e3, shown: 800 });
    ok(gateOf(r.ok) && gateOf(r.held) && r.before === 800 && k.st[DAY] === 1600 && JSON.stringify(k.order) === JSON.stringify(['hold-written', 'value-changed']) && k.timers.length === 1 && k.timers[0].ms === 6 * 3600e3,
      'amendment 3: ONE act — the hold written (and durable) BEFORE the value changes; the return armed for the press + 6 h', { r, order: k.order });
    ok(verdictOf(k.told.some((m) => m.type === 'setting-holds' && m.holds.length === 1)), 'the open pages are told (setting-holds broadcast)');
    const r2 = await k.H.take({ key: DAY, value: 2000, untilRel: 2 * 3600e3, shown: 1600 });
    ok(gateOf(r2.ok) && k.H.list()[0].value === 2000 && k.H.list()[0].before === 800 && k.timers.length === 1 && k.timers[0].ms === 2 * 3600e3, 'amendment 4: ONE hold per row — a second press replaces the value and the moment and KEEPS the first «before»', k.H.list());
    k.at(NOW + 2 * 3600e3); await k.H.returnHold(DAY, 'moment');
    ok(k.st[DAY] === 800 && k.H.list().length === 0 && k.owner.length === 0 && gateOf(k.told.some((m) => m.type === 'server-notice' && m.i18n && m.i18n.params.value === '800' && m.i18n.params.link === `vibespace://settings/${DAY}`)) && verdictOf(k.logs.some((l) => /back to 800/.test(l))),   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
      'amendment 6: THE RETURN — back to the FIRST «before» at its moment, a toast on the open pages (its row\'s link) and a journal line, NO For-you item', { st: k.st[DAY], owner: k.owner });
  }
  {
    const k = mk({ settings: {} });   // the row at its default (sparse store)
    await k.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    await k.H.returnHold(DAY, 'moment');
    ok(!Object.prototype.hasOwnProperty.call(k.st, DAY) && k.H.list().length === 0, 'a row that was at its DEFAULT returns to it (the stored key removed — null to the one writer)');
  }
  {
    const k = mk({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    k.st[DAY] = 1200;   // the owner changed it by hand on the row
    await k.H.returnHold(DAY, 'moment');
    ok(k.st[DAY] === 1200 && k.H.list().length === 0 && !k.told.some((m) => m.type === 'server-notice') && k.owner.length === 0 && verdictOf(k.logs.some((l) => /changed by hand \(1200\)/.test(l))),
      'a value CHANGED BY HAND in between is NEVER overwritten — the hold just ends (a journal line, no toast, no notice)');
  }
  {
    const k = mk({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilAt: NOW + 3 * 3600e3, shown: 800 });
    const e = await k.H.end(DAY);
    ok(gateOf(e.ok) && gateOf(e.returned) && k.st[DAY] === 800 && k.H.list().length === 0 && k.timers.length === 0, '«End now» returns the value at once and disarms the moment');
  }
  {
    const k = mk({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    const r = await k.H.take({ key: DAY, value: 400, shown: 1600 });
    ok(gateOf(r.ok) && !r.held && k.st[DAY] === 400 && k.H.list().length === 0 && k.timers.length === 0, 'a LASTING lower pressed while a hold stands ends the hold — the row keeps the new value');
  }
  {
    const k = mk({ settings: { [DAY]: 800 }, durable: false });
    const r = await k.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    ok(!r.ok && r.status === 503 && r.code === 'not-durable' && k.st[DAY] === 800 && k.H.list().length === 0 && !k.order.includes('value-changed'), 'amendment 3: a hold that cannot be made durable REFUSES the raise — nothing changed, said', r);
  }
  {
    const k = mk({ settings: { [DAY]: 800 }, patchThrows: true });
    const r = await k.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    ok(!r.ok && r.code === 'write-failed' && k.H.list().length === 0, 'both or neither: a settings write that fails after the hold takes the hold back', r);
  }
  {
    const k = mk({ settings: { [DAY]: 900 } });
    const r = await k.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    ok(!r.ok && r.status === 409 && r.code === 'moved' && r.present === 900 && k.st[DAY] === 900, 'a value that MOVED since the card drew it ⇒ 409 moved with the present value (the card says it; nothing written)', r);
    const r2 = await k.H.take({ key: DAY, value: 1600, shown: 900 });
    ok(!r2.ok && r2.code === 'raise-needs-until', 'the server judges the press again: a raise with no «until» is no press', r2);
    const r3 = await k.H.take({ key: 'chat.uploadDir', value: 1, untilRel: 3600e3, shown: 0 });
    ok(!r3.ok && r3.code === 'not-proposable', 'a row off the list is no press');
  }
  {
    // a return the file refuses: tried again a minute later, RETRIES more times; ONE notice when the last fails; a retry that lands is quiet
    const failing = (failures) => { const k = mk({ settings: { [DAY]: 1600 } }); let n = 0; const tm = [];
      const H = SH.create({ dataDir: k.dir, readSettings: () => k.st, patchSettings: (p) => { n++; if (n <= failures) throw new Error('read-only'); Object.assign(k.st, p); }, userTodos: { add: (key, x) => { k.owner.push({ key, ...x }); return { id: 'n1' }; } }, log: () => { }, now: () => NOW, writer: { dirty: () => { }, durable: async () => true }, setTimer: (fn, ms) => { const h = { fn, ms }; tm.push(h); return h; }, clearTimer: (h) => { const x = tm.indexOf(h); if (x >= 0) tm.splice(x, 1); } });
      fs.writeFileSync(path.join(k.dir, 'setting-holds.json'), JSON.stringify({ v: 1, holds: { [DAY]: { key: DAY, value: 1600, before: 800, untilAt: NOW + 3600e3, at: NOW } } }));
      return { k, H, tm, writes: () => n }; };
    {
      const { k, H, tm, writes } = failing(99);
      await H.start(); tm.length = 0;
      const r1 = await H.returnHold(DAY, 'moment');
      ok(!r1.ok && r1.retry === 1 && k.owner.length === 0 && tm.length === 1 && tm[0].ms === SH.RETRY_MS && SH.RETRY_MS === 60e3 && SH.RETRIES === 3, 'a return the settings file refuses is NOT left to the boot: tried again in a minute, nothing filed yet', { r1, owner: k.owner, tm: tm.map((x) => x.ms) });
      for (let i = 0; i < SH.RETRIES; i++) { const t = tm.shift(); if (!t) break; await t.fn(); await new Promise((r) => setTimeout(r, 5)); }
      ok(writes() === SH.RETRIES + 1 && k.owner.length === 1 && tm.length === 0 && H.list().length === 1 && k.st[DAY] === 1600, `…${SH.RETRIES + 1} tries a minute apart, then left to the next start: the hold stays on disk, ONE notice`, { writes: writes(), owner: k.owner.length, timers: tm.length });
      ok(gateOf(k.owner[0].detail.includes(`vibespace://settings/${DAY}`)) && gateOf(k.owner[0].text.includes(AS.PROPOSABLE[DAY].label)) && gateOf(k.owner[0].i18n) && k.owner[0].i18n.text.params.label.key === AS.PROPOSABLE[DAY].label && gateOf(/tried 4 times, a minute apart/.test(k.owner[0].detail)) && gateOf(/next start of VibeSpace tries again/.test(k.owner[0].detail)) && k.owner[0].origin === 'spend' && k.owner[0].kind === 'notice' && k.owner[0].key === 'accounts', 'the ONE notice (the Spending family: origin spend) names the row with its link, the tries, and that the next start tries again', k.owner[0]);   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
    }
    {
      const { k, H, tm, writes } = failing(2);
      await H.start(); tm.length = 0;
      await H.returnHold(DAY, 'moment');
      for (let i = 0; i < 2 && tm.length; i++) { const t = tm.shift(); await t.fn(); await new Promise((r) => setTimeout(r, 5)); }
      ok(writes() === 3 && k.st[DAY] === 800 && H.list().length === 0 && k.owner.length === 0 && tm.length === 0, 'a retry that lands is the usual QUIET return — back to 800, no notice', { writes: writes(), st: k.st[DAY], owner: k.owner.length });
    }
    {
      const { k, H } = failing(99);
      await H.start(); const e = await H.end(DAY);
      ok(!e.ok && gateOf(/the hold still stands/.test(e.error)) && k.owner.length === 0 && H.list().length === 1, '«End now» refused by the file: the owner\'s own page says it (the route answers it), no notice, the hold still stands', e);
    }
  }
  {
    const k = mk({ settings: { [DAY]: 1600 }, file: JSON.stringify({ v: 1, holds: { [DAY]: { key: DAY, value: 1600, before: 800, untilAt: NOW - 1000, at: NOW - 9e6 }, 'chat.uploadDir': { key: 'chat.uploadDir', value: 1, before: 0, untilAt: NOW + 1, at: NOW } } }) });
    await k.H.start();
    ok(k.timers.length === 1 && k.timers[0].ms === 0 && !k.H.list().some((h) => h.key === 'chat.uploadDir'), 'THE BOOT: holds read back and re-armed — a moment passed while the hub was down returns at ONCE; a row off the list is dropped', k.H.list());
    ok(k.owner.length === 1 && gateOf(/chat\.uploadDir/.test(k.owner[0].text)) && gateOf(k.owner[0].detail.includes('vibespace://settings/chat.uploadDir')) && gateOf(/no longer a row a press may change/.test(k.owner[0].detail)) && verdictOf(/a raised value may stay/.test(k.owner[0].detail)), '…and SAID: ONE notice names the dropped row with its link and why (a raised value may stay)', k.owner);
    await k.timers[0].fn(); await new Promise((r) => setTimeout(r, 10));
    ok(k.st[DAY] === 800, '…and the overdue hold returned');
  }
  {
    const k = mk({ settings: { [HOUR]: 60 }, file: JSON.stringify({ v: 1, holds: { [HOUR]: { key: HOUR, value: 60, before: 30, untilAt: 'tonight', at: NOW } } }) });
    let saved = null; const w0 = { dirty: (f, o) => { saved = JSON.parse(o.produce()); }, durable: async () => true };
    const H = SH.create({ dataDir: k.dir, readSettings: () => k.st, patchSettings: () => { }, userTodos: { add: (key, x) => { k.owner.push({ key, ...x }); return { id: 'n1' }; } }, now: () => NOW, writer: w0, setTimer: () => ({}), clearTimer: () => { } });
    await H.start();
    ok(H.list().length === 0 && k.owner.length === 1 && gateOf(k.owner[0].text.includes(AS.PROPOSABLE[HOUR].label)) && gateOf(k.owner[0].detail.includes(`vibespace://settings/${HOUR}`)) && gateOf(/its moment is not a number/.test(k.owner[0].detail)) && gateOf(/it held 60/.test(k.owner[0].detail)) && gateOf(saved) && Object.keys(saved.holds).length === 0, 'a hold whose moment is not a number is dropped AND said (the row, the value it held, its link); the store is saved as kept, so the next start says nothing again', { owner: k.owner, saved });   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  }
  {
    const k = mk({ file: '{ not json' });
    await k.H.start();
    ok(k.owner.length === 1 && gateOf(/did not parse/.test(k.owner[0].text)) && verdictOf(Object.keys(AS.PROPOSABLE).every((key) => k.owner[0].detail.includes(`vibespace://settings/${key}`))), 'holds that cannot be read at boot reach the owner (a raised ceiling may not return by itself) — each of the three ceilings with its link (r3095 (2): torn bytes file ONE notice, the lift\'s «did not parse»)', k.owner);   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  }
}

console.log('④ the door — the owner\'s page only (the pick 0 verdict, ownerPageWhy)');
{
  const express = require(path.join(REPO, 'node_modules/express'));
  const st = { [DAY]: 800 };
  const H = SH.create({ dataDir: dirOf(), readSettings: () => st, patchSettings: (p) => Object.assign(st, p), writer: { dirty: () => { }, durable: async () => true }, setTimer: () => ({}), clearTimer: () => { } });
  const app = express(); app.use(express.json()); require(path.join(REPO, 'src/routes/setting-holds.js')).registerSettingHoldRoutes(app, { holds: H });
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const send = (p, body, headers = {}) => new Promise((resolve) => { const d = Buffer.from(JSON.stringify(body)); const q = http.request(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': d.length, ...headers } }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(t || '{}') })); }); q.write(d); q.end(); });
  const press = { key: DAY, value: 1600, untilRel: 3600e3, shown: 800 };
  const a = await send('/api/setting-holds/press', press, { Authorization: 'Bearer vsst_fixture_agent' }), b = await send('/api/setting-holds/press', press, {});
  ok(a.status === 403 && a.json.why === 'bearer' && b.status === 403 && b.json.why === 'no-browser' && st[DAY] === 800, 'an agent\'s token and a request with no mark of the page are refused by name — nothing written', { a: a.json, b: b.json });
  const c = await send('/api/setting-holds/press', press, ownerPageHeaders(base));
  ok(c.status === 200 && gateOf(c.json.ok) && st[DAY] === 1600, 'the owner\'s page presses: 200, the value written', c.json);
  const e = await send('/api/setting-holds/end', { key: DAY }, { Authorization: 'Bearer jbt_fixture_job' });
  ok(e.status === 403 && st[DAY] === 1600, '«End now» is the owner\'s too');
  srv.close();
}

console.log('⑤ the agent\'s ask — the route builds the action, or refuses by name and files NOTHING (src/agent-routes/status.js)');
{
  const express = require(path.join(REPO, 'node_modules/express'));
  const filed = [], settings = { [DAY]: 800 };
  const app = express(); app.use(express.json());
  const deps5 = {
    activeSessions: new Map(), sessionStatus: { get: () => null }, sessionStatusKey: (s, id) => `claude:${id}`, clearAsAgent: () => { }, bookkept: () => { },
    agentSession: () => [{ name: 'lane', cwd: '/tmp', host: 'local' }, 'w-fixture'], toolOn: () => true, toolDisabled: (res) => res.status(403).end(), handoverItems: () => [],
    serverSetting: (k) => settings[k],
    userTodos: { rekey: () => { }, add: (key, o) => { const it = { id: `t${filed.length + 1}`, key, ...o }; filed.push(it); return it; }, forSession: () => [], idsWhere: () => [], get: () => null },
  };
  require(path.join(REPO, 'src/agent-routes/status.js')).register(app, deps5);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const ask = (add) => new Promise((resolve) => { const d = Buffer.from(JSON.stringify({ add: { text: 'The lanes hit today\'s ceiling — raise it?', ...add } })); const q = http.request(`${base}/api/agent/user-todo`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': d.length } }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 300) }; } resolve({ status: res.statusCode, json: j }); }); }); q.write(d); q.end(); });
  const a = await ask({ propose: `${DAY}=1600` });
  ok(a.status === 400 && a.json.code === 'raise-needs-until' && gateOf(a.json.error.includes(`vibespace://settings/${DAY}`)) && filed.length === 0, 'a raise with no --until: 400 by name with the row\'s link, NOTHING filed (the present value is the hub\'s own reading)', a.json);   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  const b = await ask({ propose: 'plugin.llm.dailyBudgetUsd=9', until: '2h' });
  ok(b.status === 400 && b.json.code === 'propose-not-allowed' && filed.length === 0, 'the judge\'s daily cap is not on the list (amendment 7) — refused, nothing filed', b.json);
  const c = await ask({ until: '6h' });
  ok(c.status === 400 && gateOf(/--until goes with --propose/.test(c.json.error)) && filed.length === 0, '--until with no --propose is refused by name', c.json);
  settings[DAY] = 1200;
  const d = await ask({ propose: `${DAY}=1600`, until: '6h' });
  ok(filed.length === 1 && gateOf(filed[0].action) && filed[0].action.type === 'setting-change' && filed[0].action.key === DAY && filed[0].action.value === 1600 && filed[0].action.was === 1200 && filed[0].action.untilRel === 6 * 3600e3 && verdictOf(filed[0].text.startsWith('The lanes')),
    'a whole ask is filed with its ACTION, built from the hub\'s facts (`was` = the hub\'s reading at the ask, 1200)', { status: d.status, action: filed[0] && filed[0].action });
  ok(d.status === 200 && typeof d.json.proposed === 'string' && gateOf(d.json.proposed.startsWith(`proposed: ${DAY} → 1600 for 6 h from the owner's press`)) && verdictOf(/goes back by itself/.test(d.json.proposed)), 'the agent\'s answer carries the hub\'s line for the change (vibespace-ask prints it; the CLI never branches on the action)', d.json.proposed);
  // LAW A at the ask: a live hold (the store on app.locals, as the wiring hands it) — a lasting value above its «before» is refused
  app.locals.settingHolds = { holdOf: (k) => (k === DAY ? { key: DAY, value: 1600, before: 800, untilAt: NOW + 3600e3, lasting: 800 } : null) };
  settings[DAY] = 1600; const n0 = filed.length;
  const e = await ask({ propose: `${DAY}=1200` });
  ok(e.status === 400 && e.json.code === 'raise-over-hold' && gateOf(e.json.error.includes(`vibespace://settings/${DAY}`)) && filed.length === n0, 'LAW A at the ask: on a held raise (1600, before 800) a lasting 1200 is refused raise-over-hold by name, with the row\'s link, nothing filed', e.json);   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  const f = await ask({ propose: `${DAY}=800` });
  ok(filed.length === n0 + 1 && filed[filed.length - 1].action.value === 800, '…while a lasting 800 (at the «before») is filed', { status: f.status });
  // r3104 (a): THE HOLDS UNREAD — the store's list reads EMPTY (holdOf: null for every row); the ask is refused by the hold's own
  // words, never judged as «no hold» (a lasting 1200 over a raise whose «before» is 800 would be filed as a plain lower)
  const UW = 'the record of the raised ceilings could not be read (EIO) — a stand-in of the held words';
  const unreadHolds = { holdOf: () => null, unreadWords: () => UW };
  app.locals.settingHolds = unreadHolds;
  const n1 = filed.length;
  const g = await ask({ propose: `${DAY}=1200` });
  ok(g.status === 503 && g.json.code === 'setting_holds_unread' && gateOf(g.json.error.startsWith(UW)) && gateOf(/Nothing was filed/.test(g.json.error)) && filed.length === n1,
    'r3104 (a): the holds UNREAD — an agent\'s ask to change a ceiling is refused 503 by the hold\'s own words, nothing filed (never judged as «no hold»)', g.json);
  delete app.locals.settingHolds;
  srv.close();
  {   // RED in a copy of the route without the check: the same ask is FILED as a plain lasting lower (the release's lookup through an empty list)
    const Module = require('node:module'), f5 = path.join(REPO, 'src/agent-routes/status.js');
    let src5 = read('src/agent-routes/status.js'); const cut5 = "        if (shUnread) return res.status(503).json({ error: `${shUnread}. Nothing was filed — ask again once it reads`, code: 'setting_holds_unread' });\n";
    const has5 = src5.includes(cut5); src5 = src5.replace(cut5, '');
    const m5 = new Module(f5, null); m5.filename = f5; m5.paths = Module._nodeModulePaths(path.dirname(f5)); m5._compile(src5, f5);
    const app2 = express(); app2.use(express.json()); m5.exports.register(app2, deps5); app2.locals.settingHolds = unreadHolds;
    const srv2 = await new Promise((r) => { const s2 = app2.listen(0, '127.0.0.1', () => r(s2)); });
    const base2 = `http://127.0.0.1:${srv2.address().port}`;
    const g2 = await new Promise((resolve) => { const d = Buffer.from(JSON.stringify({ add: { text: 'The lanes hit today\'s ceiling — lower it?', propose: `${DAY}=1200` } })); const q = http.request(`${base2}/api/agent/user-todo`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': d.length } }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 300) }; } resolve({ status: res.statusCode, json: j }); }); }); q.write(d); q.end(); });
    srv2.close();
    ok(gateOf(has5) && g2.status === 200 && filed.length === n1 + 1 && filed[filed.length - 1].action.value === 1200, 'RED control (the route asks no hold — the release\'s lookup through the empty list): the lasting 1200 is FILED as a plain lower (red)', { has5, status: g2.status });
  }
}

console.log('⑥ the wiring and the words (pins)');
{
  const st = read('src/agent-routes/status.js'), cli = read('data/bin/vibespace-ask'), fa = require(path.join(REPO, 'src/foryou-actions.js'));
  ok(gateOf(/const v = AS\.askVerdict\(\{ propose: add\.propose, until: add\.until \}/.test(st)) && gateOf(/grantFields \|\| proposeFields \|\| \{\}/.test(st)) && verdictOf(/one ask carries one action — --grant or --propose, not both/.test(st)), 'the agent route builds the action from the schema\'s own facts; one ask, one action');
  ok(gateOf(/if \(answer\.proposed\) console\.log\('  ' \+ answer\.proposed\);/.test(cli)) && !/'setting-change'/.test(cli), 'vibespace-ask prints the hub\'s line, never its own branch on the action');
  ok(gateOf(/const propose = opt\('propose'\), until = opt\('until'\);/.test(cli)) && verdictOf(/--propose <row>=<value> \[--until 22:00\|6h\|90m\]/.test(cli)), 'vibespace-ask: --propose / --until, and its usage teaches them');
  ok(fa.ACTION_IDENTITY['setting-change'] === 'key', 'the For-you action census has its row (setting-change, identity = the row)');
  ok(gateOf(/'setting-holds\.write': row\('write', 'setting-holds', 'src\/server\/setting-holds\.js', \['save'\]\)/.test(read('src/timed-sync.js'))) && verdictOf(/W\(\)\.dirty\(file, \{ name: 'setting-holds\.write'/.test(read('src/server/setting-holds.js'))), 'the hold store writes through the store writer (its store-timing row)');
  ok(gateOf(/registerSettingHoldRoutes\(app, \{ holds: settingHolds \}\)/.test(read('src/server/mounts-plugins-wiring.js'))) && verdictOf(/settingHolds\.start\(\)/.test(read('src/server/mounts-plugins-wiring.js'))), 'the hub wires the store (started at boot) and its door');
}

console.log('⑦ THE CHECK\'S LAWS (主开发 2026-11-15 20:29Z) — A: a live hold\'s «before» is the row\'s lasting value; B: a hold is live only while the row holds its value; the smalls');
{
  // a store whose settings writer calls the hand-write hook as server.js does (onSettingsWrite inside writeSettings, after every write)
  const mkH = ({ settings = {}, durable = true } = {}) => {
    const dir = dirOf(), st = { ...settings }, order = [], told = [], owner = [], logs = [], timers = [], snaps = [];
    let t = NOW, H = null;
    const writer = { dirty: (f, o) => { const j = JSON.parse(o.produce()); snaps.push(j); order.push('hold-written'); }, durable: async () => durable };
    H = SH.create({ dataDir: dir, readSettings: () => st, patchSettings: (p) => { order.push('value-changed'); for (const [k, v] of Object.entries(p)) { if (v === null) delete st[k]; else st[k] = v; } H.noteSettingsWrite({ ...st }); },
      broadcast: (m) => told.push(m), userTodos: { add: (key, n) => { owner.push({ key, ...n }); return { id: 'n' + owner.length }; } }, log: (m) => logs.push(m), now: () => t, writer,
      setTimer: (fn, ms) => { const h = { fn, ms }; timers.push(h); return h; }, clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); } });
    const hand = (v) => { st[DAY] = v; H.noteSettingsWrite({ ...st }); };   // the owner's own write of the row (PATCH /api/settings) — the hook runs after it
    return { H, st, order, told, owner, logs, timers, snaps, dir, hand, at: (ms) => { t = ms; } };
  };
  // ── LAW A (M1 / store-1 / words-3): a lasting change is judged against the hold's «before», never the held value
  {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 2 * 3600e3, shown: 800 });
    const r = await k.H.take({ key: DAY, value: 1200, shown: 1600 });
    ok(!r.ok && r.status === 409 && r.code === 'raise-over-hold' && r.lasting === 800 && k.st[DAY] === 1600 && k.H.list().length === 1 && k.H.list()[0].before === 800, 'LAW A: on a held raise (1600, before 800) a lasting «lower» to 1200 is a LASTING RAISE over 800 — no press, 409 raise-over-hold, the hold and the row unchanged', r);
    const pv = AS.pressVerdict({ type: 'setting-change', key: DAY, value: 1200 }, { present: 1600, now: NOW, lasting: 800 });
    ok(!pv.press && pv.why === 'raise-over-hold' && pv.lasting === 800, '…the same verdict the card draws (pressVerdict with the lasting value)', pv);
    const a = AS.askVerdict({ propose: `${DAY}=1200` }, { present: 1600, now: NOW, lasting: 800 });
    ok(!a.ok && a.code === 'raise-over-hold' && gateOf(a.error.includes(`vibespace://settings/${DAY}`)) && verdictOf(/goes back to 800/.test(a.error)), '…and the ASK is refused by name with the row\'s link (nothing filed)', a);   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
    const r2 = await k.H.take({ key: DAY, value: 800, shown: 1600 });
    ok(gateOf(r2.ok) && !r2.held && gateOf(r2.endedHold) && k.st[DAY] === 800 && k.H.list().length === 0 && k.timers.length === 0, 'a lasting change AT the «before» (800) ends the hold and stays', r2);
  }
  {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 2 * 3600e3, shown: 800 });
    k.order.length = 0;
    const r = await k.H.take({ key: DAY, value: 400, shown: 1600 });
    ok(gateOf(r.ok) && k.st[DAY] === 400 && k.H.list().length === 0 && JSON.stringify(k.order) === JSON.stringify(['value-changed', 'hold-written']), 'a lasting change BELOW the «before» ends the hold — the VALUE FIRST, the hold released after (store-2: a crash between leaves a hold the row no longer holds, ended harmlessly)', k.order);
  }
  {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 400, untilRel: 2 * 3600e3, shown: 800 });   // a held LOWER (400, before 800)
    const r = await k.H.take({ key: DAY, value: 600, shown: 400 });
    ok(gateOf(r.ok) && k.st[DAY] === 600 && k.H.list().length === 0, 'on a held LOWER (400, before 800) a lasting 600 is at or below the lasting value — taken, the hold ends, 600 stays', r);
    const pv = AS.pressVerdict({ type: 'setting-change', key: DAY, value: 900 }, { present: 400, now: NOW, lasting: 800 });
    ok(!pv.press && pv.why === 'raise-over-hold', '…while 900 would be over the lasting 800 — no press', pv);
  }
  // ── LAW B (M2 / words-1, M3 / words-2): a hand change ENDS the hold where the hand's write lands — the next press takes the row's value
  for (const handV of [1200, 400]) {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3 * 3600e3, shown: 800 });
    k.told.length = 0;
    k.hand(handV);
    ok(k.H.list().length === 0 && k.timers.length === 0 && gateOf(k.told.some((m) => m.type === 'setting-holds' && m.holds.length === 0)) && gateOf(k.logs.some((l) => new RegExp(`changed by hand \\(${handV}\\) — the hold ended \\(when the hand's write landed\\); it will not go back`).test(l))) && k.owner.length === 0,
      `LAW B: the owner sets the held row to ${handV} by hand ⇒ the hold ENDS where the write lands — off disk, a journal line, every page told (setting-holds), no notice`, { holds: k.H.list(), told: k.told.map((m) => m.type) });
    const r = await k.H.take({ key: DAY, value: 2000, untilRel: 2 * 3600e3, shown: handV });
    ok(gateOf(r.ok) && r.before === handV && k.H.list()[0].before === handV, `…the NEXT timed press takes the row's value now (${handV}) as its «before», never the ended hold's 800`, r);
    k.at(NOW + 3 * 3600e3); await k.timers[k.timers.length - 1].fn(); await new Promise((x) => setTimeout(x, 5));
    ok(k.st[DAY] === handV, `…and at its moment the row goes back to the hand's ${handV} — never over it (and never UP from it)`, k.st[DAY]);
  }
  {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3 * 3600e3, shown: 800 });
    const before = k.H.list().length;
    await k.H.take({ key: DAY, value: 2000, untilRel: 2 * 3600e3, shown: 1600 });
    ok(before === 1 && k.H.list().length === 1 && k.H.list()[0].before === 800 && k.H.list()[0].value === 2000, 'the store\'s OWN writes are not a hand\'s: a second timed press on a live hold keeps the first «before» (amendment 4)', k.H.list());
  }
  {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3 * 3600e3, shown: 800 });
    k.st[DAY] = 1200;   // a write the hook did not see (the belt)
    const e = await k.H.end(DAY);
    ok(gateOf(e.ok) && !e.returned && gateOf(e.changedByHand) && e.value === 1200 && k.st[DAY] === 1200 && k.H.list().length === 0, '«End now» on a hold the row no longer holds writes NOTHING — it says the owner changed it; the hold ends', e);
    const k2 = mkH({ settings: { [DAY]: 800 } });
    await k2.H.take({ key: DAY, value: 1600, untilRel: 3 * 3600e3, shown: 800 });
    k2.st[DAY] = 1200;
    const r = await k2.H.take({ key: DAY, value: 2000, untilRel: 2 * 3600e3, shown: 1200 });
    ok(gateOf(r.ok) && r.before === 1200, 'a press on a hold the row no longer holds (a write the hook missed) reads it as NO hold — «before» = the row now', r);
  }
  // ── store-2: a second timed press keeps the value it replaces as `pending` until its write lands — a crash between never strands it
  {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3 * 3600e3, shown: 800 });
    k.snaps.length = 0;
    await k.H.take({ key: DAY, value: 2000, untilRel: 2 * 3600e3, shown: 1600 });
    const first = k.snaps[0] && k.snaps[0].holds[DAY];
    ok(gateOf(first) && first.value === 2000 && first.pending === 1600 && first.before === 800 && !('pending' in k.H.list()[0]), 'the second press\'s hold goes to disk with `pending` = the value it replaces (1600), cleared once its write lands', { first, now: k.H.list()[0] });
    const crashed = mkH({ settings: { [DAY]: 1600 } });
    fs.writeFileSync(path.join(crashed.dir, 'setting-holds.json'), JSON.stringify({ v: 1, holds: { [DAY]: { ...first } } }));
    await crashed.H.start();
    const h = crashed.H.list()[0];
    ok(gateOf(h) && h.value === 1600 && h.before === 800 && !('pending' in h) && crashed.timers.length === 1, '…a crash before the write (the row still 1600): the next start keeps the hold LIVE on 1600 — it still goes back to 800 (never a raise left with nothing to return it)', h);
    const moved = mkH({ settings: { [DAY]: 1200 } });
    fs.writeFileSync(path.join(moved.dir, 'setting-holds.json'), JSON.stringify({ v: 1, holds: { [DAY]: { key: DAY, value: 1600, before: 800, untilAt: NOW + 3600e3, at: NOW } } }));
    await moved.H.start();
    ok(moved.H.list().length === 0 && moved.owner.length === 0 && moved.timers.length === 0 && gateOf(moved.logs.some((l) => /the hold ended; it will not go back/.test(l))) && moved.snaps.length === 1, 'a start where the row holds another value (changed while down, or a FIRST press that never landed) ends the hold quietly — a journal line, saved, nothing raised', moved.logs);
  }
  // ── store-4: the press's own bounds; store-5: a store unreadable for another reason than missing
  {
    const far = AS.pressVerdict({ type: 'setting-change', key: DAY, value: 1600, untilRel: 49 * 3600e3 }, { present: 800, now: NOW });
    const near = AS.pressVerdict({ type: 'setting-change', key: DAY, value: 1600, untilRel: 4 * 60e3 }, { present: 800, now: NOW });
    const k = mkH({ settings: { [DAY]: 800 } });
    const r = await k.H.take({ key: DAY, value: 1600, untilRel: 49 * 3600e3, shown: 800 }), r2 = await k.H.take({ key: DAY, value: 1600, untilRel: 4 * 60e3, shown: 800 });
    ok(far.why === 'too-far' && near.why === 'too-near' && r.code === 'too-far' && r2.code === 'too-near' && k.st[DAY] === 800, 'AT THE PRESS too: 49 h is refused (too-far), a relative 4 min is refused (too-near) — the ask\'s bounds, nothing written', { far, near, r: r.code, r2: r2.code });
    const kd = mkH(); fs.mkdirSync(path.join(kd.dir, 'setting-holds.json'));
    await kd.H.start();
    ok(kd.owner.length === 1 && gateOf(/could not be read/.test(kd.owner[0].text)) && verdictOf(Object.keys(AS.PROPOSABLE).every((key) => kd.owner[0].detail.includes(`vibespace://settings/${key}`))), 'a holds file that is unreadable for ANOTHER reason than missing (a folder: EISDIR) reaches the owner — ONE notice, the three ceilings with their links', kd.owner);   // stale-pins: kept — the scheme's link text as this suite's input — src/setting-links.js was created and folded into src/internal-link.js inside this range; not a pin
  }
  // ── words-9 / words-7: the notices and the toast name the row's LABEL in three languages; End now refused carries the value
  {
    const sch = read('src/lib/settings-schema.js');
    ok(verdictOf(Object.entries(AS.PROPOSABLE).every(([key, row]) => new RegExp(`'${key.replace(/\./g, '\\.')}': \\{\\n[^\\n]*\\n\\s+label: t\\('${row.label}'\\),`).test(sch))), 'ask-setting\'s labels ARE the schema rows\' labels (the notices name the row the owner reads)');
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    await k.H.end(DAY);
    const toast = k.told.find((m) => m.type === 'server-notice');
    ok(gateOf(toast) && toast.i18n.key === '{label} is back to {value} — the hold ended: {link}' && toast.i18n.params.label.key === AS.PROPOSABLE[DAY].label && toast.i18n.params.value === '800' && verdictOf(toast.text.startsWith(AS.PROPOSABLE[DAY].label)), 'the return\'s toast names the row by its LABEL (words, said in the page\'s language)', toast);
    const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js'), src = read('src/server/setting-holds.js');
    const keys = [...src.matchAll(/key: '((?:[^'\\]|\\.)+)'/g)].map((m) => m[1].replace(/\\'/g, '\'')).filter((x) => !/^accounts$/.test(x));
    ok(keys.length >= 9 && gateOf(keys.every((x) => zh.includes(JSON.stringify(x) + ':') && ja.includes(JSON.stringify(x) + ':'))) && verdictOf(/'src\/server\/setting-holds\.js'/.test(read('scripts/i18n-check.mjs'))), `every words key the hold store files (${keys.length}) has zh and ja — and scripts/i18n-check.mjs reads the store as a notice source`, keys.filter((x) => !(zh.includes(JSON.stringify(x) + ':') && ja.includes(JSON.stringify(x) + ':'))));
    const kf = mkH({ settings: { [DAY]: 800 } }); await kf.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    const SH2 = SH.create({ dataDir: kf.dir, readSettings: () => kf.st, patchSettings: () => { throw new Error('EROFS'); }, now: () => NOW, writer: { dirty: () => { }, durable: async () => true }, setTimer: () => ({}), clearTimer: () => { } });
    fs.writeFileSync(path.join(kf.dir, 'setting-holds.json'), JSON.stringify({ v: 1, holds: { [DAY]: kf.H.list()[0] } })); await SH2.start();
    const e = await SH2.end(DAY);
    ok(!e.ok && e.code === 'return-failed' && e.value === 1600 && verdictOf(/it stays at 1600/.test(e.error)), '«End now» refused by the file answers return-failed WITH the value it stays at (the page words it by its code — never «unreachable»)', e);
  }
  // ── store-6 and the one writer: no synchronous fs in the store; exactly three settings writes, all through `write`
  {
    const src = read('src/server/setting-holds.js');
    const calls = [...src.matchAll(/\bwrite\(\{ \[key\]: (v\.value|h\.before) \}\)/g)].map((m) => m[1]);
    ok(!/Sync\(/.test(src) && (src.match(/\bpatchSettings\(/g) || []).length === 1 && JSON.stringify(calls) === JSON.stringify(['h.before', 'v.value', 'v.value']), 'the hold store has NO synchronous fs call; ONE patchSettings site (`write`, marked as the store\'s own) and exactly three writes: the return, the timed press, the lasting press', calls);
  }
}

console.log('⑧ THE CARD\'S WORDS against what the press sends — the REAL row renderer in en, zh and ja (esbuild → node, DOM shimmed)');
{
  const esbuild = createRequire(path.join(REPO, 'package.json'))('esbuild');
  const noop = () => { };
  const mkEl = () => ({ className: '', dataset: {}, style: {}, classList: { add() { }, remove() { }, contains() { return false; }, toggle() { } }, append() { }, appendChild(k) { return k; }, addEventListener() { }, setAttribute() { }, querySelector: () => null, querySelectorAll: () => [], closest: () => null });
  for (const [k, v] of Object.entries({ addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), getComputedStyle: () => ({}) })) { try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch { } }
  class NoopObserver { observe() { } unobserve() { } disconnect() { } takeRecords() { return []; } }
  for (const k of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) { try { Object.defineProperty(globalThis, k, { value: NoopObserver, configurable: true, writable: true }); } catch { } }
  globalThis.window = globalThis;
  globalThis.document = { createElement: mkEl, createTextNode: (x) => ({ textContent: String(x) }), getElementById: () => null, body: mkEl(), documentElement: mkEl(), head: mkEl(), addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [] };
  try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true, writable: true }); } catch { }
  let LANG = 'en';
  globalThis.localStorage = { getItem: (k) => (k === 'vibespace.lang' ? LANG : null), setItem() { }, removeItem() { } };
  const plug = { name: 'sh', setup(b) {
    b.onResolve({ filter: /(build-version|safe-html)\.js$/ }, (x) => ({ path: path.basename(x.path), namespace: 'sh-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'sh-stub' }, (x) => ({ contents: x.path === 'safe-html.js' ? 'export const sanitizeHtml = (h) => h; export const sanitizeDiagramSvg = () => \'\';' : "export const BUILD_VERSION = 'test';", loader: 'js' }));
  } };
  const SCR = dirOf();
  const VERB = { en: { raise: 'Raise to', lower: 'Lower to', set: 'Set to' }, zh: { raise: '提高到', lower: '降低到', set: '改为' }, ja: { raise: '上げる', lower: '下げる', set: '変更' } };
  const T6 = 6 * 3600e3;
  for (const lang of ['en', 'zh', 'ja']) {
    LANG = lang;
    const out = path.join(SCR, `row-${lang}.mjs`);
    await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/user-todos-row.js')], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [plug] });
    const R = await import(out);
    const I18N = await import(out.replace(/row-/, 'i18n-')).catch(() => null);
    const { t } = await (async () => { const o2 = path.join(SCR, `i18n-${lang}.mjs`); await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/i18n.js')], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: o2, logLevel: 'silent' }); return import(o2); })();
    void I18N;
    const facts = { values: { [DAY]: 800 }, holds: {} };
    R.registerSettingFacts({ value: (k) => facts.values[k], holdOf: (k) => facts.holds[k] || null, present: noop });
    const item = (action) => ({ id: 'it-' + Math.random().toString(36).slice(2), createdAt: NOW, action: { type: 'setting-change', key: DAY, askedAt: NOW, ...action } });
    const card = (action) => R.settingCardOf(item(action), t, { now: NOW });
    const V = VERB[lang];
    // R: a relative raise · L: a lasting lower · T: a timed lower — the button names the amount the press posts (card.value = the action's)
    const cr = card({ value: 1600, was: 800, untilRel: T6 }), cl = card({ value: 400, was: 800 }), ct = card({ value: 400, was: 800, untilRel: 2 * 3600e3 });
    ok(gateOf(cr.button) && cr.value === 1600 && gateOf(cr.button.raise) && gateOf(cr.button.words.includes(V.raise)) && gateOf(cr.button.words.includes('1600')) && gateOf(/6/.test(cr.button.words)) && !cr.button.words.includes(V.lower), `${lang}: a raise for 6 h — the ONE button says the raise verb, 1600 and the 6 h it posts`, cr.button);
    ok(gateOf(cl.button) && !cl.button.raise && gateOf(cl.button.words.includes(V.lower)) && gateOf(cl.button.words.includes('400')) && !cl.button.words.includes(V.raise), `${lang}: a lasting lower — the lower verb and 400`, cl.button);
    ok(gateOf(ct.button) && !ct.button.raise && gateOf(ct.button.words.includes(V.lower)) && gateOf(ct.button.words.includes('400')) && !ct.button.words.includes(V.raise), `${lang}: a TIMED lower is drawn with the lower verb (never the raise words)`, ct.button);
    // H: a live hold (1600, before 800) — LAW A on the card; I: a hand change — LAW B / C on the card and the Settings line
    facts.values[DAY] = 1600; facts.holds[DAY] = { key: DAY, value: 1600, before: 800, untilAt: NOW + 3 * 3600e3, at: NOW };
    const ch = card({ value: 1200, was: 1600 }), ce = card({ value: 800, was: 1600 });
    ok(!ch.button && ch.verdict.why === 'raise-over-hold' && gateOf(ch.whyWords.includes('1200')) && gateOf(ch.whyWords.includes('800')) && verdictOf(ch.whyLink), `${lang}: on a held raise a lasting 1200 draws NO button — the reason names 1200 and the 800 it would stay above, with the row\'s link`, { why: ch.whyWords });
    ok(gateOf(ce.button) && gateOf(ce.button.words.includes(V.set)) && gateOf(ce.button.words.includes('800')) && verdictOf(R.holdWords(DAY, t, { now: NOW }).includes('800')), `${lang}: a lasting 800 on the held row says «${V.set}» 800 and that the hold ends; Settings\' held line says «then 800»`, ce.button);
    facts.values[DAY] = 1200;   // the owner typed 1200 into the held row
    const ci = card({ value: 2000, was: 1200, untilRel: 2 * 3600e3 });
    const html = R.settingCardHtml(item({ value: 2000, was: 1200, untilRel: 2 * 3600e3 }), t);
    ok(R.holdWords(DAY, t, { now: NOW }) === '' && !ci.held && ci.heldWords === '' && ci.back === 1200 && !html.includes('ut-sc-held') && gateOf(ci.vol.prop.includes('1200')) && !ci.vol.prop.includes('800'), `${lang}: after a HAND change no word of the hold is drawn — no Settings line, no held line, the proposal goes back to the hand's 1200 (never «then 800»)`, { holdWords: R.holdWords(DAY, t, { now: NOW }), prop: ci.vol.prop });
    delete facts.holds[DAY]; facts.values[DAY] = 800;
    // B-0a33 cure 2 (主开发 04:51Z): a row the store holds with NO NUMBER (blank) — the card says «none» (never the default, never 0) and any
    // value over it is a raise; a hold whose «before» is blank says «then none»; a hold at 0 under a row cleared by hand is NO hold (raw liveness)
    facts.values[DAY] = '';
    const cn = card({ value: 400, was: 0, untilRel: T6 }), noneW = t('none');
    ok(gateOf(cn.nowWords.includes(noneW)) && !cn.nowWords.includes('800') && !/(^|\D)0(\D|$)/.test(cn.nowWords) && !!cn.button && verdictOf(cn.button.raise), `${lang}: over a BLANK row the card says «${cn.nowWords}» — «${noneW}», never the default or 0 — and 400 is a raise`, { now: cn.nowWords, button: cn.button });
    facts.values[DAY] = 400; facts.holds[DAY] = { key: DAY, value: 400, before: '', untilAt: NOW + 3 * 3600e3, at: NOW };
    const hw = R.holdWords(DAY, t, { now: NOW });
    ok(gateOf(hw.includes(noneW)) && !hw.includes('800'), `${lang}: a hold whose «before» is blank says «then ${noneW}» on the Settings line`, hw);
    facts.values[DAY] = ''; facts.holds[DAY] = { key: DAY, value: 0, before: 30, untilAt: NOW + 3 * 3600e3, at: NOW };
    ok(R.holdWords(DAY, t, { now: NOW }) === '', `${lang}: a hold at 0 under a row cleared by hand is NO hold — the raw blank is not the 0 it wrote`, R.holdWords(DAY, t, { now: NOW }));
    delete facts.holds[DAY]; facts.values[DAY] = 800;
  }
  // the press posts exactly what the card names: the action's value and its «until» AS IS (never re-derived from the ask's instant)
  const acts = read('src/lib/user-todos-actions.js');
  // B-0a33 (owed 08:03Z): a same-value press over a row holding no number — the hub answers presentNone; the press hands the card NO said 0
  // (the page kept it a moment as the row's present value: «Now: 0» where the row says «none»)
  ok(verdictOf(/if \(r && !r\.presentNone && Number\.isFinite\(num\(r\.present\)\)\) noteSettingPresent\(key, num\(r\.present\)\);/.test(acts)), 'a press the hub answers over a row holding no number (presentNone) never hands the card a said 0 — the card keeps «none»');
  ok(gateOf(/const body = \{ key, value: card\.value, shown: showed, \.\.\.\(Number\.isFinite\(num\(a\.untilRel\)\) \? \{ untilRel: num\(a\.untilRel\) \} : Number\.isFinite\(num\(a\.untilAt\)\) \? \{ untilAt: num\(a\.untilAt\) \} : \{\}\) \};/.test(acts)) && verdictOf(/const p = \{ value, time: at != null \? untilClock\(at, t, \{ now \}\) : '', span: rel != null \? spanWords\(rel, t\) : '' \};/.test(read('src/lib/user-todos-row.js'))),
    'the press\'s body is the card\'s value and the action\'s untilRel / untilAt as is; the button\'s words fill from the SAME value and stretch');
  // words-10: each button key says its verb in zh and ja (a «Lower» that said 提高 was green before)
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const said = (dict, k) => { const m = new RegExp(`^  ${JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ("(?:[^"\\\\]|\\\\.)*")`, 'm').exec(dict); return m ? JSON.parse(m[1]) : null; };
  const BUTTONS = [['Raise to {value} until {time}', 'raise'], ['Raise to {value} for {span}', 'raise'], ['Lower to {value} until {time}', 'lower'], ['Lower to {value} for {span}', 'lower'], ['Lower to {value}', 'lower'], ['Set to {value} for good — the hold ends', 'set']];
  const bad = BUTTONS.flatMap(([k, v]) => [['zh', zh], ['ja', ja]].filter(([lg, d]) => { const w = said(d, k); const other = v === 'raise' ? VERB[lg].lower : v === 'lower' ? VERB[lg].raise : null; return !w || !w.includes(VERB[lg][v]) || (other && w.includes(other)); }).map(([lg]) => `${lg}: ${k}`));
  ok(bad.length === 0, 'every button key says its own verb in zh (提高到 / 降低到 / 改为) and ja (上げる / 下げる / 変更), never the other', bad);
  // words-5: the tray's setting button keeps its mis-press guard (armed like the grant's) — pinned
  const panel = read('src/lib/user-todos-panel.js');
  ok(gateOf(/const setBtn = e\.target\.closest\('\.ut-action-setting'\);\n\s+if \(setBtn\) \{\n(?:\s+\/\/[^\n]*\n)*\s+armExitButtons\(\);\n\s+const pv = pressVerdict\(\{ since: setBtn\._armSince \?\? null, now: performance\.now\(\) \}\);\n\s+if \(!pv\.ok\) \{ showToast\(/.test(panel)) && verdictOf(/\.ut-action-grant, \.ut-action-setting'\)\)/.test(panel)), 'the tray\'s setting button is armed (in armExitButtons) and its press asks pressVerdict first — a button that appeared or moved within ARM_MS is not pressed');
}

console.log('⑨ r3004 THE STORE-READ LAW — a failed read HOLDS the holds: no timed raise taken over unread holds, nothing written over them, read again (src/store-read-hold.js)');
{
  const Module = require('node:module');
  // a copy of the store with text replaced (the RED controls) — null when an anchor is missing
  const mutantSH = (reps) => { const f = path.join(REPO, 'src/server/setting-holds.js'); let src = read('src/server/setting-holds.js'); for (const [a, b] of reps) { if (!src.includes(a)) return null; src = src.replace(a, b); } const m = new Module(f, null); m.filename = f; m.paths = Module._nodeModulePaths(path.dirname(f)); m._compile(src, f); return m.exports; };
  const IDAY = 'spend.unattendedPerIdentityDay', H = 3600e3;
  const turns = async (n = 200, until = () => false) => { for (let i = 0; i < n && !until(); i++) await new Promise((r) => setImmediate(r)); };
  // the store writer stood in by one that WRITES what the store produces (what the real writer lands) — the file is read back
  // r3095: the For-you stand-in files each notice under its own id and records the producer's closes; `settingsHeld` / `readSt` =
  // data/settings.json held (a held settings store reads every row at its default: {}); a recording timer and a driven clock
  const mk9 = (M = SH, { bytes = null, settingsHeld = () => null, readSt = null, open = [] } = {}) => {
    const dir = dirOf(), file = path.join(dir, 'setting-holds.json');
    const earlier = { v: 1, holds: { [DAY]: { key: DAY, value: 1600, before: 800, untilAt: NOW + 6 * H, at: NOW - H }, [HOUR]: { key: HOUR, value: 60, before: 30, untilAt: NOW + 4 * H, at: NOW - H } } };
    fs.writeFileSync(file, bytes != null ? bytes : JSON.stringify(earlier));
    const st = { [DAY]: 1600, [HOUR]: 60, [IDAY]: 200 }, owner = [], logs = [], closed = [], patches = [], armed = [];
    let clock = NOW;
    const writer = { dirty: (f, o) => { fs.writeFileSync(f, o.produce()); }, durable: async () => true };
    const S = M.create({ dataDir: dir, readSettings: () => (readSt ? readSt() : st), patchSettings: (pt) => { patches.push(pt); for (const [k, v] of Object.entries(pt)) { if (v === null) delete st[k]; else st[k] = v; } },
      userTodos: { add: (key, n) => { owner.push({ ...n, sessionKey: key }); return { id: 'ut-' + owner.length }; }, openItems: () => open, resolveAnswered: (ids, by) => { closed.push(...ids.map((id) => ({ id, by }))); return ids; } },
      log: (m) => logs.push(m), now: () => clock, writer, settingsHeld,
      setTimer: (fn, ms) => { const x = { fn, ms, live: true }; armed.push(x); return x; }, clearTimer: (x) => { if (x) x.live = false; } });
    return { S, dir, file, st, owner, logs, closed, patches, armed, setClock: (v) => { clock = v; }, before: fs.readFileSync(file) };
  };
  // r3095 (5): NO FILE PATH in a person's words — the notices (text, detail, every i18n line and param), the refusal, the GET words
  const pathIn = (...xs) => xs.map((x) => JSON.stringify(x === undefined ? null : x)).filter((j) => /setting-holds\.json|data\/|\.corrupt-/.test(j));
  const lineOf = (n, key) => ((n && n.i18n && n.i18n.detail) || []).find((l) => l && l.params && l.params.link === `vibespace://settings/${key}`) || null;   // stale-pins: kept — the scheme's link text as this suite's input
  const RAISED = '{label}: {value} now, raised above its default {def}: {link}', AT = '{label}: {value} now — its default is {def}: {link}', UNKNOWN = '{label}: not known now (the settings could not be read) — its default is {def}: {link}';
  // the PLACED refusal of the store's own read (its one readFile of this file answers EIO; no mount, no mode change)
  const refused = async (k, fn) => { const rf0 = fs.promises.readFile; fs.promises.readFile = async function (f, ...a) { if (String(f) === k.file) throw Object.assign(new Error('EIO: a placed refusal'), { code: 'EIO' }); return rf0.call(this, f, ...a); }; try { return await fn(); } finally { fs.promises.readFile = rf0; } };
  const raise = (k) => k.S.take({ key: IDAY, value: 400, untilRel: 2 * H, shown: 200 });
  {
    const k = mk9();
    await refused(k, () => k.S.start());
    const r = await raise(k), e = await k.S.end(DAY);
    const same = fs.readFileSync(k.file).equals(k.before);
    const n = k.owner[0] || {}, lines = (n.i18n && n.i18n.detail) || [];
    ok(!r.ok && r.status === 503 && r.code === 'setting_holds_unread' && gateOf(/could not be read \(EIO\)/.test(r.error)) && !e.ok && e.code === 'setting_holds_unread' && gateOf(same) && k.st[IDAY] === 200 && k.st[DAY] === 1600 && k.S.list().length === 0,
      'r3004: the holds\' read REFUSED (EIO) — the next timed raise is REFUSED by name (setting_holds_unread), «End now» too; NOTHING is written over the file (its bytes as they were); no ceiling moved', { r, e, same });
    const lD = lineOf(n, DAY), lH = lineOf(n, HOUR), lI = lineOf(n, IDAY);
    ok(k.owner.length === 1 && n.text === 'The setting holds could not be read' && n.itemKey === 'setting-holds-unread' && lines.length === 1 + Object.keys(AS.PROPOSABLE).length
      && gateOf(lD) && lD.key === RAISED && lD.params.value === '1600' && lD.params.def === '800' && gateOf(lH) && lH.key === RAISED && lH.params.value === '60' && lH.params.def === '30' && gateOf(lI) && lI.key === AT && lI.params.value === '200' && lI.params.def === '200',
      'r3095: the owner is told ONCE (its own key): EACH ceiling with its value now and its default — the two above it marked raised, the one at it not', lines.map((l) => [l.key.slice(0, 24), l.params && l.params.value]));
    const leak = pathIn(n.text, n.detail, n.i18n, r.error, e.error, k.S.unreadWords());
    ok(leak.length === 0 && gateOf(/you can still lower a ceiling on its row/.test(r.error)) && gateOf(/You can still lower a ceiling on its row/.test(n.detail)) && verdictOf(k.logs.some((m) => m.includes(k.file))),
      'r3095: NO FILE PATH in a person\'s words (the notice, the refusal, the held words) — the refusal says a ceiling can still be lowered on its row; the path is in the journal', leak);
    const lifted = await k.S._hold.again();   // the read again, off the loop — the file reads now
    await turns(50);
    ok(gateOf(lifted) && k.closed.length === 1 && k.closed[0].id === 'ut-1',
      'r3095 (1): the read that lifts the hold CLOSES the «could not be read» notice — the producer\'s own answer to its own item', k.closed);
    const r2 = await raise(k), after = JSON.parse(fs.readFileSync(k.file, 'utf8'));
    ok(gateOf(lifted) && k.S._hold.held() === null && gateOf(r2.ok) && gateOf(after.holds[DAY]) && gateOf(after.holds[HOUR]) && gateOf(after.holds[IDAY]) && after.holds[DAY].before === 800 && after.holds[HOUR].before === 30,
      'the file READS AGAIN — the hold lifts, the two earlier holds are back with their way back (800, 30), and the next timed raise keeps all three', Object.keys(after.holds));
    const mR = mutantSH([["    if (hold.held()) return { ok: false, status: 503, code: 'setting_holds_unread', error: hold.words() };   // r3004: the earlier holds are unread — a press would write them away\n", ''], ["if (!hold.writable('a hold change')) return false; ", '']]);
    const kx = mR ? mk9(mR) : null;
    if (kx) await refused(kx, () => kx.S.start());
    const rx = kx ? await raise(kx) : null, ax = kx ? JSON.parse(fs.readFileSync(kx.file, 'utf8')) : null;
    ok(!!rx && gateOf(rx.ok) && !ax.holds[DAY] && !ax.holds[HOUR], 'RED control (the press and the save not held — the release): the timed raise is taken and the file then holds ONLY the new hold — the earlier ceilings lose their way back (red)', ax && Object.keys(ax.holds));
    const mC = mutantSH([['    holds = v && v.holds ? v.holds : {};\n    settleUnread();\n', '    holds = v && v.holds ? v.holds : {};\n']]);
    const kc = mC ? mk9(mC) : null;
    if (kc) { await refused(kc, () => kc.S.start()); await kc.S._hold.again(); await turns(50); }
    ok(!!kc && kc.owner.length === 1 && kc.S._hold.held() === null && kc.closed.length === 0, 'RED control (the lift closes nothing — the release\'s notice): the holds read again, and the «could not be read» notice stays open for good (red)', kc && kc.closed);
    const mP = mutantSH([["    words: (h) => `the record", "    words: (h) => file + ` — the record"]]);
    const kp = mP ? mk9(mP) : null;
    if (kp) await refused(kp, () => kp.S.start());
    const rp = kp ? await raise(kp) : null;
    ok(!!rp && pathIn(rp.error).length === 1, 'RED control (the held words name the file): the census above sees the path in the refusal (red)', rp && rp.error);
  }
  {   // r3095 (3): THE SETTINGS THEMSELVES HELD at the start too — every row would read its default: each value is «not known», never a guess
    const k = mk9(SH, { settingsHeld: () => ({ code: 'EIO' }), readSt: () => ({}) });
    await refused(k, () => k.S.start());
    const n = k.owner[0] || {}, rows = ((n.i18n && n.i18n.detail) || []).slice(1);
    ok(k.owner.length === 1 && rows.length === Object.keys(AS.PROPOSABLE).length && verdictOf(rows.every((l) => l.key === UNKNOWN && l.params.value === undefined && l.params.def === String(AS.PROPOSABLE[l.params.link.split('/').pop()].def))),
      'r3095 (3): data/settings.json held as well — each ceiling\'s value is said «not known now», with its default; never the default as its value', rows.map((l) => l.key.slice(0, 30)));
    k.S.stop();
    const mK = mutantSH([['    const known = !isHeld(), s = ', '    const known = true, s = ']]);
    const kk = mK ? mk9(mK, { settingsHeld: () => ({ code: 'EIO' }), readSt: () => ({}) }) : null;
    if (kk) await refused(kk, () => kk.S.start());
    const rk = kk ? ((kk.owner[0] && kk.owner[0].i18n.detail) || []).slice(1) : [];
    ok(rk.length > 0 && verdictOf(rk.every((l) => l.key === AT && l.params.value === l.params.def)), 'RED control (the held settings read as known): each ceiling is said AT ITS DEFAULT — a guess, the raised ones hidden (red)', rk.map((l) => l.params && l.params.value));
    if (kk) kk.S.stop();
  }
  {   // r3095 (7): A MOMENT PASSES WHILE HELD — nothing is armed on a guess; at the lift the return fires at once, ONCE
    const run = async (M) => {
      const k = mk9(M);
      await refused(k, () => k.S.start());
      const armedHeld = k.armed.length;
      k.setClock(NOW + 5 * H);   // HOUR's moment (NOW + 4 h) passes while held; DAY's (NOW + 6 h) not yet
      await k.S._hold.again(); await turns(50);
      const fire = async () => { const due = k.armed.filter((x) => x.live && x.ms === 0); for (const x of due) { x.live = false; x.fn(); } await turns(50); return due.length; };
      const first = await fire();
      await k.S._hold.again(); const again = await fire();   // a later read again (not held) and the due waits fired again
      const dayWait = k.armed.find((x) => x.live && x.ms === H);
      return { k, armedHeld, first, again, back: k.patches.filter((p) => Object.prototype.hasOwnProperty.call(p, HOUR)), dayWait, after: JSON.parse(fs.readFileSync(k.file, 'utf8')) };
    };
    const o = await run(SH);
    ok(o.armedHeld === 0 && o.first === 1 && o.again === 0 && o.back.length === 1 && o.back[0][HOUR] === 30 && o.k.st[HOUR] === 30 && o.k.st[DAY] === 1600 && !!o.dayWait && !o.after.holds[HOUR] && !!o.after.holds[DAY],
      'r3095 (7): a hold whose moment PASSED WHILE HELD — nothing armed while held; at the lift it goes back at once (60 → 30), ONCE; the other hold waits its hour; the file then holds only it', { armedHeld: o.armedHeld, first: o.first, again: o.again, back: o.back, st: o.k.st });
    const mA = mutantSH([['    await adopt();   // the lift\'s own pass (the start\'s): judged and re-armed\n', '']]);
    const ox = mA ? await run(mA) : null;
    ok(!!ox && ox.first === 0 && ox.back.length === 0 && ox.k.st[HOUR] === 60, 'RED control (the lift re-arms nothing): the passed moment never comes — the ceiling stays raised at 60 (red)', ox && ox.k.st);
  }
  {   // A RESTART while held reads the same file again: nothing was written, so the holds come back whole
    const k = mk9();
    await refused(k, () => k.S.start()); k.S.stop();
    const k2 = { ...k, owner: [], closed: [] };
    const left = [{ id: 'ut-left', itemKey: 'setting-holds-unread', sessionKey: 'accounts', status: 'open' }];   // the notice the held start filed, still open
    const mk2 = (M) => M.create({ dataDir: k.dir, readSettings: () => k.st, patchSettings: () => { }, userTodos: { add: (key, n) => { k2.owner.push(n); return { id: 'n' }; }, openItems: () => left, resolveAnswered: (ids) => { k2.closed.push(...ids); return ids; } }, now: () => NOW, writer: { dirty: (f, o) => fs.writeFileSync(f, o.produce()), durable: async () => true }, setTimer: () => ({}), clearTimer: () => { } });
    const S2 = mk2(SH);
    await S2.start();
    ok(S2.list().length === 2 && S2._hold.held() === null && k2.owner.length === 0, 'a RESTART while held reads the same file again — the two holds whole, nothing said (nothing was lost)', S2.list().map((h) => h.key));
    ok(k2.closed.length === 1 && k2.closed[0] === 'ut-left', 'r3095 (1): the restart\'s read CLOSES the «could not be read» notice the held start left open (found by its key)', k2.closed);
    S2.stop();
    const mS = mutantSH([['    settleUnread();   // r3095 (1): a start that reads closes', '    // r3095 (1): a start that reads closes']]);
    k2.closed = [];
    const S3 = mS ? mk2(mS) : null;
    if (S3) { await S3.start(); S3.stop(); }
    ok(!!S3 && k2.closed.length === 0, 'RED control (a start that reads closes nothing): the earlier start\'s notice stays open for good (red)', k2.closed);
  }
  {   // TORN BYTES: kept aside ONCE (byte for byte) before the start answers, then it starts empty — ONE notice with each ceiling now
    const torn = '{"v":1,"holds":{"' + DAY + '":{"key":';
    const tornRun = async (M) => {
      const k = mk9(M, { bytes: torn });
      await k.S.start();
      const atStart = k.S._hold.held() === null;
      { const t0 = Date.now(); while (k.S._hold.held() !== null && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 10)); }   // the copy is real I/O: ends on the FACT, bounded at 20 s — never a count of turns
      await turns(50);
      const copies = fs.readdirSync(k.dir).filter((f) => f.startsWith('setting-holds.json.corrupt-'));
      return { k, atStart, copies, now: fs.readFileSync(k.file, 'utf8') };
    };
    const o = await tornRun(SH), k = o.k;
    const said = k.owner.find((n) => n.text === 'The setting holds did not parse');
    const lD = lineOf(said, DAY), lI = lineOf(said, IDAY);
    ok(gateOf(o.atStart) && o.copies.length === 1 && fs.readFileSync(path.join(k.dir, o.copies[0]), 'utf8') === torn && k.owner.length === 1 && !!said && said.itemKey === 'setting-holds-torn'
      && gateOf(lD) && lD.key === RAISED && lD.params.value === '1600' && gateOf(lI) && lI.key === AT && ((said.i18n.detail || []).length === 1 + Object.keys(AS.PROPOSABLE).length),
      'r3095 (2): TORN BYTES — kept aside once (byte for byte) BEFORE the start answers, then it starts empty; ONE notice (never a «could not be read» before it), naming each ceiling now with its default, the raised one marked', { copies: o.copies, owner: k.owner.map((n) => n.text) });
    const head = (said && said.i18n.detail[0]) || {}, words = [said && said.text, said && said.detail, said && said.i18n].map((x) => JSON.stringify(x === undefined ? null : x));
    ok(!words.some((j) => j.includes(k.dir) || /data\//.test(j)) && gateOf(head.params) && head.params.copy === o.copies[0] && gateOf(said.detail.includes(`kept beside it as ${o.copies[0]}`)) && !/restore/i.test(words.join(' ')) && gateOf(/mend its file by hand and restart/.test(said.detail)) && gateOf(/lower it on its row, or raise it again/.test(said.detail)) && verdictOf(k.logs.some((m) => m.includes(o.copies[0]))),
      'r3095 (5) + r3104: the torn notice says the list was DAMAGED and WHERE its damaged bytes are kept — the copy by its base name, never a path — and what the person can do (lower or raise again; or mend its file by hand and restart), never «restore» it', said && said.detail);
    ok(JSON.stringify(JSON.parse(o.now)) === JSON.stringify({ v: 1, holds: {} }), 'r3095 (4): after the torn lift the EMPTY store is written ONCE (the copy made first) — the next start reads it, never the torn bytes again', o.now);
    k.S.stop();
    const m2 = mutantSH([['      if (a0.state === \'corrupt\' && (await hold.again())) { await liftP; return list(); }\n', '']]);
    const o2 = m2 ? await tornRun(m2) : null;
    ok(!!o2 && o2.k.owner.length === 2 && o2.k.owner[0].text === 'The setting holds could not be read', 'RED control (the start does not wait for the copy): TWO notices — a «could not be read» before the «did not parse» (red)', o2 && o2.k.owner.map((n) => n.text));
    if (o2) o2.k.S.stop();
    const m4 = mutantSH([["    if (f && f.setAside && !(await save())) log(", "    if (false && !(await save())) log("]]);
    const o4 = m4 ? await tornRun(m4) : null;
    ok(!!o4 && o4.now === torn, 'RED control (no save after the torn lift): the torn bytes stay at the name — the next start meets them again (red)', o4 && o4.now);
    if (o4) o4.k.S.stop();
  }
  {   // r3095 (6): the words a person reads at the two presses — the card's by its code, «End now» its own sentence (zh + ja beside each)
    const acts = read('src/lib/user-todos-actions.js'), ui = read('src/lib/settings-ui.js'), zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
    const CARD = 'the record of raised ceilings could not be read — no timed raise is taken until it reads; you can still lower a ceiling on its row';
    const END = 'the record of raised ceilings could not be read, so the hold cannot end until it reads — you can still lower it on its row';
    const inDict = (d, k2) => d.includes('\n  ' + JSON.stringify(k2) + ': ');
    ok(gateOf(acts.includes(`setting_holds_unread: () => t('${CARD}')`)) && gateOf(ui.includes(`r.code === 'setting_holds_unread' ? t('${END}')`)) && verdictOf([CARD, END].every((k2) => inDict(zh, k2) && inDict(ja, k2))),
      'r3095 (6): the card says a ceiling can still be lowered on its row, and «End now» has its own sentence for the held code — each in zh and ja');
  }
}

console.log(fail ? `✗ test-setting-holds: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';

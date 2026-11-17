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
const ok = (c, name, info) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); if (info !== undefined) console.log('    ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 900)); } };
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
  ok(marked.length === 3 && JSON.stringify(Object.keys(AS.PROPOSABLE).sort()) === JSON.stringify(marked.map((x) => x.key).sort()) && marked.every((x) => { const p = AS.PROPOSABLE[x.key]; return p.def === x.def && p.min === x.min && p.max === x.max && p.step === x.step; }),
    'the closed list IS the schema rows marked `proposable: true` — the three ceilings on turns nobody typed, key, default, min, max and step equal', marked);
  ok(AS.LINK(DAY) === require(path.join(REPO, 'src/internal-link.js')).settingLink(DAY), 'its link is the scheme\'s spelling (src/internal-link.js)');
  const r = (o, p = 800) => AS.askVerdict(o, { present: p, now: NOW, tzOffsetMin: PT });
  const raise = r({ propose: `${DAY}=1600`, until: '6h' });
  ok(raise.ok && raise.action.type === 'setting-change' && raise.action.key === DAY && raise.action.value === 1600 && raise.action.was === 800 && raise.action.untilRel === 6 * 3600e3 && raise.action.askedAt === NOW, 'a raise with --until 6h ⇒ the action: the row, the value, the value when asked, a stretch counted from the PRESS', raise);
  const noUntil = r({ propose: `${DAY}=1600` });
  ok(!noUntil.ok && noUntil.code === 'raise-needs-until' && noUntil.error.includes(`vibespace://settings/${DAY}`), 'amendment 1: a RAISE with no «until» is refused by name, with the row\'s link (a lasting raise is the row\'s own)', noUntil);
  ok(r({ propose: `${DAY}=400` }).ok && r({ propose: `${DAY}=400`, until: '2h' }).ok, 'a LOWER may last, or carry an «until»');
  ok(r({ propose: `${DAY}=800` }).code === 'propose-same', 'a value equal to the present one is refused (nothing to change)');
  const off = r({ propose: 'chat.uploadDir=1' }), judge = r({ propose: 'plugin.llm.dailyBudgetUsd=5', until: '1h' });
  ok(off.code === 'propose-not-allowed' && off.error.includes('vibespace://settings/chat.uploadDir') && judge.code === 'propose-not-allowed', 'amendment 7: a row off the closed list (the judge\'s daily cap too) is refused by name with ITS link', { off, judge });
  ok(r({ propose: `${DAY}=20000`, until: '1h' }).code === 'propose-range' && r({ propose: `${DAY}=abc` }).code === 'propose-bad' && r({ propose: 'x' }).code === 'propose-bad', 'a value out of the row\'s range, not a number, or no `=` — refused by name');
  ok(AS.parseUntil('4m', { now: NOW }).code === 'until-range' && AS.parseUntil('49h', { now: NOW }).code === 'until-range' && AS.parseUntil('3d', { now: NOW }).code === 'until-range' && AS.parseUntil('5m', { now: NOW }).ok && AS.parseUntil('48h', { now: NOW }).ok,
    'amendment 2: «until» is 5 minutes to 48 hours away (4 m, 49 h, 3 d refused; 5 m, 48 h taken)');
  const clock = AS.parseUntil('22:00', { now: NOW, tzOffsetMin: PT }), iso = AS.parseUntil('2026-11-15T20:00:00Z', { now: NOW });
  ok(clock.untilAt === Date.UTC(2026, 10, 16, 6, 0) && iso.untilAt === Date.UTC(2026, 10, 15, 20, 0), 'a clock time is the NEXT such moment on the owner\'s clock (22:00 in UTC−8 = 06:00 UTC tomorrow); an ISO moment as written', { clock, iso });
  ok(AS.parseUntil('soon', { now: NOW }).code === 'until-bad' && AS.parseUntil('25:00', { now: NOW }).code === 'until-bad', 'an «until» that is no moment is refused by name');
}

console.log('② the press\'s verdict — judged again at the PRESS (amendments 1, 5)');
{
  const a = { type: 'setting-change', key: DAY, value: 1600, untilRel: 6 * 3600e3 };
  const p1 = AS.pressVerdict(a, { present: 800, now: NOW + 3600e3 });
  ok(p1.press && p1.raise && p1.untilAt === NOW + 3600e3 + 6 * 3600e3, 'amendment 5: a RELATIVE «until» counts from the PRESS (pressed an hour later, it still runs six hours)', p1);
  const at = { type: 'setting-change', key: DAY, value: 1600, untilAt: NOW + 3600e3 };
  ok(AS.pressVerdict(at, { present: 800, now: NOW + 2 * 3600e3 }).why === 'passed', 'a CLOCK moment passed when the owner looks ⇒ no press');
  ok(AS.pressVerdict({ type: 'setting-change', key: DAY, value: 1600 }, { present: 800, now: NOW }).why === 'raise-needs-until', 'amendment 1 at the press: a value that became a raise (no «until») is no press — a ceiling is never left raised with nothing to return it');
  const lastLower = AS.pressVerdict({ type: 'setting-change', key: DAY, value: 400, untilRel: null, untilAt: null }, { present: 800, now: NOW });
  ok(lastLower.press && lastLower.untilAt === null && !lastLower.raise, 'an ABSENT «until» (null on the wire) is no moment — a lasting lower presses (Number(null) is 0: never a moment «now»)', lastLower);
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
    ok(r.ok && r.held && r.before === 800 && k.st[DAY] === 1600 && JSON.stringify(k.order) === JSON.stringify(['hold-written', 'value-changed']) && k.timers.length === 1 && k.timers[0].ms === 6 * 3600e3,
      'amendment 3: ONE act — the hold written (and durable) BEFORE the value changes; the return armed for the press + 6 h', { r, order: k.order });
    ok(k.told.some((m) => m.type === 'setting-holds' && m.holds.length === 1), 'the open pages are told (setting-holds broadcast)');
    const r2 = await k.H.take({ key: DAY, value: 2000, untilRel: 2 * 3600e3, shown: 1600 });
    ok(r2.ok && k.H.list()[0].value === 2000 && k.H.list()[0].before === 800 && k.timers.length === 1 && k.timers[0].ms === 2 * 3600e3, 'amendment 4: ONE hold per row — a second press replaces the value and the moment and KEEPS the first «before»', k.H.list());
    k.at(NOW + 2 * 3600e3); await k.H.returnHold(DAY, 'moment');
    ok(k.st[DAY] === 800 && k.H.list().length === 0 && k.owner.length === 0 && k.told.some((m) => m.type === 'server-notice' && m.i18n && m.i18n.params.value === '800' && m.i18n.params.link === `vibespace://settings/${DAY}`) && k.logs.some((l) => /back to 800/.test(l)),
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
    ok(k.st[DAY] === 1200 && k.H.list().length === 0 && !k.told.some((m) => m.type === 'server-notice') && k.owner.length === 0 && k.logs.some((l) => /changed by hand \(1200\)/.test(l)),
      'a value CHANGED BY HAND in between is NEVER overwritten — the hold just ends (a journal line, no toast, no notice)');
  }
  {
    const k = mk({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilAt: NOW + 3 * 3600e3, shown: 800 });
    const e = await k.H.end(DAY);
    ok(e.ok && e.returned && k.st[DAY] === 800 && k.H.list().length === 0 && k.timers.length === 0, '«End now» returns the value at once and disarms the moment');
  }
  {
    const k = mk({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    const r = await k.H.take({ key: DAY, value: 400, shown: 1600 });
    ok(r.ok && !r.held && k.st[DAY] === 400 && k.H.list().length === 0 && k.timers.length === 0, 'a LASTING lower pressed while a hold stands ends the hold — the row keeps the new value');
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
      ok(k.owner[0].detail.includes(`vibespace://settings/${DAY}`) && k.owner[0].text.includes(AS.PROPOSABLE[DAY].label) && k.owner[0].i18n && k.owner[0].i18n.text.params.label.key === AS.PROPOSABLE[DAY].label && /tried 4 times, a minute apart/.test(k.owner[0].detail) && /next start of VibeSpace tries again/.test(k.owner[0].detail) && k.owner[0].origin === 'spend' && k.owner[0].kind === 'notice' && k.owner[0].key === 'accounts', 'the ONE notice (the Spending family: origin spend) names the row with its link, the tries, and that the next start tries again', k.owner[0]);
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
      ok(!e.ok && /the hold still stands/.test(e.error) && k.owner.length === 0 && H.list().length === 1, '«End now» refused by the file: the owner\'s own page says it (the route answers it), no notice, the hold still stands', e);
    }
  }
  {
    const k = mk({ settings: { [DAY]: 1600 }, file: JSON.stringify({ v: 1, holds: { [DAY]: { key: DAY, value: 1600, before: 800, untilAt: NOW - 1000, at: NOW - 9e6 }, 'chat.uploadDir': { key: 'chat.uploadDir', value: 1, before: 0, untilAt: NOW + 1, at: NOW } } }) });
    await k.H.start();
    ok(k.timers.length === 1 && k.timers[0].ms === 0 && !k.H.list().some((h) => h.key === 'chat.uploadDir'), 'THE BOOT: holds read back and re-armed — a moment passed while the hub was down returns at ONCE; a row off the list is dropped', k.H.list());
    ok(k.owner.length === 1 && /chat\.uploadDir/.test(k.owner[0].text) && k.owner[0].detail.includes('vibespace://settings/chat.uploadDir') && /no longer a row a press may change/.test(k.owner[0].detail) && /a raised value may stay/.test(k.owner[0].detail), '…and SAID: ONE notice names the dropped row with its link and why (a raised value may stay)', k.owner);
    await k.timers[0].fn(); await new Promise((r) => setTimeout(r, 10));
    ok(k.st[DAY] === 800, '…and the overdue hold returned');
  }
  {
    const k = mk({ settings: { [HOUR]: 60 }, file: JSON.stringify({ v: 1, holds: { [HOUR]: { key: HOUR, value: 60, before: 30, untilAt: 'tonight', at: NOW } } }) });
    let saved = null; const w0 = { dirty: (f, o) => { saved = JSON.parse(o.produce()); }, durable: async () => true };
    const H = SH.create({ dataDir: k.dir, readSettings: () => k.st, patchSettings: () => { }, userTodos: { add: (key, x) => { k.owner.push({ key, ...x }); return { id: 'n1' }; } }, now: () => NOW, writer: w0, setTimer: () => ({}), clearTimer: () => { } });
    await H.start();
    ok(H.list().length === 0 && k.owner.length === 1 && k.owner[0].text.includes(AS.PROPOSABLE[HOUR].label) && k.owner[0].detail.includes(`vibespace://settings/${HOUR}`) && /its moment is not a number/.test(k.owner[0].detail) && /it held 60/.test(k.owner[0].detail) && saved && Object.keys(saved.holds).length === 0, 'a hold whose moment is not a number is dropped AND said (the row, the value it held, its link); the store is saved as kept, so the next start says nothing again', { owner: k.owner, saved });
  }
  {
    const k = mk({ file: '{ not json' });
    await k.H.start();
    ok(k.owner.length === 1 && /could not be read/.test(k.owner[0].text) && Object.keys(AS.PROPOSABLE).every((key) => k.owner[0].detail.includes(`vibespace://settings/${key}`)), 'holds that cannot be read at boot reach the owner (a raised ceiling may not return by itself) — each of the three ceilings with its link', k.owner);
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
  ok(c.status === 200 && c.json.ok && st[DAY] === 1600, 'the owner\'s page presses: 200, the value written', c.json);
  const e = await send('/api/setting-holds/end', { key: DAY }, { Authorization: 'Bearer jbt_fixture_job' });
  ok(e.status === 403 && st[DAY] === 1600, '«End now» is the owner\'s too');
  srv.close();
}

console.log('⑤ the agent\'s ask — the route builds the action, or refuses by name and files NOTHING (src/agent-routes/status.js)');
{
  const express = require(path.join(REPO, 'node_modules/express'));
  const filed = [], settings = { [DAY]: 800 };
  const app = express(); app.use(express.json());
  require(path.join(REPO, 'src/agent-routes/status.js')).register(app, {
    activeSessions: new Map(), sessionStatus: { get: () => null }, sessionStatusKey: (s, id) => `claude:${id}`, clearAsAgent: () => { }, bookkept: () => { },
    agentSession: () => [{ name: 'lane', cwd: '/tmp', host: 'local' }, 'w-fixture'], toolOn: () => true, toolDisabled: (res) => res.status(403).end(), handoverItems: () => [],
    serverSetting: (k) => settings[k],
    userTodos: { rekey: () => { }, add: (key, o) => { const it = { id: `t${filed.length + 1}`, key, ...o }; filed.push(it); return it; }, forSession: () => [], idsWhere: () => [], get: () => null },
  });
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const ask = (add) => new Promise((resolve) => { const d = Buffer.from(JSON.stringify({ add: { text: 'The lanes hit today\'s ceiling — raise it?', ...add } })); const q = http.request(`${base}/api/agent/user-todo`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': d.length } }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 300) }; } resolve({ status: res.statusCode, json: j }); }); }); q.write(d); q.end(); });
  const a = await ask({ propose: `${DAY}=1600` });
  ok(a.status === 400 && a.json.code === 'raise-needs-until' && a.json.error.includes(`vibespace://settings/${DAY}`) && filed.length === 0, 'a raise with no --until: 400 by name with the row\'s link, NOTHING filed (the present value is the hub\'s own reading)', a.json);
  const b = await ask({ propose: 'plugin.llm.dailyBudgetUsd=9', until: '2h' });
  ok(b.status === 400 && b.json.code === 'propose-not-allowed' && filed.length === 0, 'the judge\'s daily cap is not on the list (amendment 7) — refused, nothing filed', b.json);
  const c = await ask({ until: '6h' });
  ok(c.status === 400 && /--until goes with --propose/.test(c.json.error) && filed.length === 0, '--until with no --propose is refused by name', c.json);
  settings[DAY] = 1200;
  const d = await ask({ propose: `${DAY}=1600`, until: '6h' });
  ok(filed.length === 1 && filed[0].action && filed[0].action.type === 'setting-change' && filed[0].action.key === DAY && filed[0].action.value === 1600 && filed[0].action.was === 1200 && filed[0].action.untilRel === 6 * 3600e3 && filed[0].text.startsWith('The lanes'),
    'a whole ask is filed with its ACTION, built from the hub\'s facts (`was` = the hub\'s reading at the ask, 1200)', { status: d.status, action: filed[0] && filed[0].action });
  ok(d.status === 200 && typeof d.json.proposed === 'string' && d.json.proposed.startsWith(`proposed: ${DAY} → 1600 for 6 h from the owner's press`) && /goes back by itself/.test(d.json.proposed), 'the agent\'s answer carries the hub\'s line for the change (vibespace-ask prints it; the CLI never branches on the action)', d.json.proposed);
  // LAW A at the ask: a live hold (the store on app.locals, as the wiring hands it) — a lasting value above its «before» is refused
  app.locals.settingHolds = { holdOf: (k) => (k === DAY ? { key: DAY, value: 1600, before: 800, untilAt: NOW + 3600e3, lasting: 800 } : null) };
  settings[DAY] = 1600; const n0 = filed.length;
  const e = await ask({ propose: `${DAY}=1200` });
  ok(e.status === 400 && e.json.code === 'raise-over-hold' && e.json.error.includes(`vibespace://settings/${DAY}`) && filed.length === n0, 'LAW A at the ask: on a held raise (1600, before 800) a lasting 1200 is refused raise-over-hold by name, with the row\'s link, nothing filed', e.json);
  const f = await ask({ propose: `${DAY}=800` });
  ok(filed.length === n0 + 1 && filed[filed.length - 1].action.value === 800, '…while a lasting 800 (at the «before») is filed', { status: f.status });
  delete app.locals.settingHolds;
  srv.close();
}

console.log('⑥ the wiring and the words (pins)');
{
  const st = read('src/agent-routes/status.js'), cli = read('data/bin/vibespace-ask'), fa = require(path.join(REPO, 'src/foryou-actions.js'));
  ok(/const v = AS\.askVerdict\(\{ propose: add\.propose, until: add\.until \}/.test(st) && /grantFields \|\| proposeFields \|\| \{\}/.test(st) && /one ask carries one action — --grant or --propose, not both/.test(st), 'the agent route builds the action from the schema\'s own facts; one ask, one action');
  ok(/if \(answer\.proposed\) console\.log\('  ' \+ answer\.proposed\);/.test(cli) && !/'setting-change'/.test(cli), 'vibespace-ask prints the hub\'s line, never its own branch on the action');
  ok(/const propose = opt\('propose'\), until = opt\('until'\);/.test(cli) && /--propose <row>=<value> \[--until 22:00\|6h\|90m\]/.test(cli), 'vibespace-ask: --propose / --until, and its usage teaches them');
  ok(fa.ACTION_IDENTITY['setting-change'] === 'key', 'the For-you action census has its row (setting-change, identity = the row)');
  ok(/'setting-holds\.write': row\('write', 'setting-holds', 'src\/server\/setting-holds\.js', \['save'\]\)/.test(read('src/timed-sync.js')) && /W\(\)\.dirty\(file, \{ name: 'setting-holds\.write'/.test(read('src/server/setting-holds.js')), 'the hold store writes through the store writer (its store-timing row)');
  ok(/registerSettingHoldRoutes\(app, \{ holds: settingHolds \}\)/.test(read('src/server/mounts-plugins-wiring.js')) && /settingHolds\.start\(\)/.test(read('src/server/mounts-plugins-wiring.js')), 'the hub wires the store (started at boot) and its door');
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
    ok(!a.ok && a.code === 'raise-over-hold' && a.error.includes(`vibespace://settings/${DAY}`) && /goes back to 800/.test(a.error), '…and the ASK is refused by name with the row\'s link (nothing filed)', a);
    const r2 = await k.H.take({ key: DAY, value: 800, shown: 1600 });
    ok(r2.ok && !r2.held && r2.endedHold && k.st[DAY] === 800 && k.H.list().length === 0 && k.timers.length === 0, 'a lasting change AT the «before» (800) ends the hold and stays', r2);
  }
  {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 2 * 3600e3, shown: 800 });
    k.order.length = 0;
    const r = await k.H.take({ key: DAY, value: 400, shown: 1600 });
    ok(r.ok && k.st[DAY] === 400 && k.H.list().length === 0 && JSON.stringify(k.order) === JSON.stringify(['value-changed', 'hold-written']), 'a lasting change BELOW the «before» ends the hold — the VALUE FIRST, the hold released after (store-2: a crash between leaves a hold the row no longer holds, ended harmlessly)', k.order);
  }
  {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 400, untilRel: 2 * 3600e3, shown: 800 });   // a held LOWER (400, before 800)
    const r = await k.H.take({ key: DAY, value: 600, shown: 400 });
    ok(r.ok && k.st[DAY] === 600 && k.H.list().length === 0, 'on a held LOWER (400, before 800) a lasting 600 is at or below the lasting value — taken, the hold ends, 600 stays', r);
    const pv = AS.pressVerdict({ type: 'setting-change', key: DAY, value: 900 }, { present: 400, now: NOW, lasting: 800 });
    ok(!pv.press && pv.why === 'raise-over-hold', '…while 900 would be over the lasting 800 — no press', pv);
  }
  // ── LAW B (M2 / words-1, M3 / words-2): a hand change ENDS the hold where the hand's write lands — the next press takes the row's value
  for (const handV of [1200, 400]) {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3 * 3600e3, shown: 800 });
    k.told.length = 0;
    k.hand(handV);
    ok(k.H.list().length === 0 && k.timers.length === 0 && k.told.some((m) => m.type === 'setting-holds' && m.holds.length === 0) && k.logs.some((l) => new RegExp(`changed by hand \\(${handV}\\) — the hold ended \\(when the hand's write landed\\); it will not go back`).test(l)) && k.owner.length === 0,
      `LAW B: the owner sets the held row to ${handV} by hand ⇒ the hold ENDS where the write lands — off disk, a journal line, every page told (setting-holds), no notice`, { holds: k.H.list(), told: k.told.map((m) => m.type) });
    const r = await k.H.take({ key: DAY, value: 2000, untilRel: 2 * 3600e3, shown: handV });
    ok(r.ok && r.before === handV && k.H.list()[0].before === handV, `…the NEXT timed press takes the row's value now (${handV}) as its «before», never the ended hold's 800`, r);
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
    ok(e.ok && !e.returned && e.changedByHand && e.value === 1200 && k.st[DAY] === 1200 && k.H.list().length === 0, '«End now» on a hold the row no longer holds writes NOTHING — it says the owner changed it; the hold ends', e);
    const k2 = mkH({ settings: { [DAY]: 800 } });
    await k2.H.take({ key: DAY, value: 1600, untilRel: 3 * 3600e3, shown: 800 });
    k2.st[DAY] = 1200;
    const r = await k2.H.take({ key: DAY, value: 2000, untilRel: 2 * 3600e3, shown: 1200 });
    ok(r.ok && r.before === 1200, 'a press on a hold the row no longer holds (a write the hook missed) reads it as NO hold — «before» = the row now', r);
  }
  // ── store-2: a second timed press keeps the value it replaces as `pending` until its write lands — a crash between never strands it
  {
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3 * 3600e3, shown: 800 });
    k.snaps.length = 0;
    await k.H.take({ key: DAY, value: 2000, untilRel: 2 * 3600e3, shown: 1600 });
    const first = k.snaps[0] && k.snaps[0].holds[DAY];
    ok(first && first.value === 2000 && first.pending === 1600 && first.before === 800 && !('pending' in k.H.list()[0]), 'the second press\'s hold goes to disk with `pending` = the value it replaces (1600), cleared once its write lands', { first, now: k.H.list()[0] });
    const crashed = mkH({ settings: { [DAY]: 1600 } });
    fs.writeFileSync(path.join(crashed.dir, 'setting-holds.json'), JSON.stringify({ v: 1, holds: { [DAY]: { ...first } } }));
    await crashed.H.start();
    const h = crashed.H.list()[0];
    ok(h && h.value === 1600 && h.before === 800 && !('pending' in h) && crashed.timers.length === 1, '…a crash before the write (the row still 1600): the next start keeps the hold LIVE on 1600 — it still goes back to 800 (never a raise left with nothing to return it)', h);
    const moved = mkH({ settings: { [DAY]: 1200 } });
    fs.writeFileSync(path.join(moved.dir, 'setting-holds.json'), JSON.stringify({ v: 1, holds: { [DAY]: { key: DAY, value: 1600, before: 800, untilAt: NOW + 3600e3, at: NOW } } }));
    await moved.H.start();
    ok(moved.H.list().length === 0 && moved.owner.length === 0 && moved.timers.length === 0 && moved.logs.some((l) => /the hold ended; it will not go back/.test(l)) && moved.snaps.length === 1, 'a start where the row holds another value (changed while down, or a FIRST press that never landed) ends the hold quietly — a journal line, saved, nothing raised', moved.logs);
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
    ok(kd.owner.length === 1 && /could not be read/.test(kd.owner[0].text) && Object.keys(AS.PROPOSABLE).every((key) => kd.owner[0].detail.includes(`vibespace://settings/${key}`)), 'a holds file that is unreadable for ANOTHER reason than missing (a folder: EISDIR) reaches the owner — ONE notice, the three ceilings with their links', kd.owner);
  }
  // ── words-9 / words-7: the notices and the toast name the row's LABEL in three languages; End now refused carries the value
  {
    const sch = read('src/lib/settings-schema.js');
    ok(Object.entries(AS.PROPOSABLE).every(([key, row]) => new RegExp(`'${key.replace(/\./g, '\\.')}': \\{\\n[^\\n]*\\n\\s+label: t\\('${row.label}'\\),`).test(sch)), 'ask-setting\'s labels ARE the schema rows\' labels (the notices name the row the owner reads)');
    const k = mkH({ settings: { [DAY]: 800 } });
    await k.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    await k.H.end(DAY);
    const toast = k.told.find((m) => m.type === 'server-notice');
    ok(toast && toast.i18n.key === '{label} is back to {value} — the hold ended: {link}' && toast.i18n.params.label.key === AS.PROPOSABLE[DAY].label && toast.i18n.params.value === '800' && toast.text.startsWith(AS.PROPOSABLE[DAY].label), 'the return\'s toast names the row by its LABEL (words, said in the page\'s language)', toast);
    const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js'), src = read('src/server/setting-holds.js');
    const keys = [...src.matchAll(/key: '((?:[^'\\]|\\.)+)'/g)].map((m) => m[1].replace(/\\'/g, '\'')).filter((x) => !/^accounts$/.test(x));
    ok(keys.length >= 9 && keys.every((x) => zh.includes(JSON.stringify(x) + ':') && ja.includes(JSON.stringify(x) + ':')) && /'src\/server\/setting-holds\.js'/.test(read('scripts/i18n-check.mjs')), `every words key the hold store files (${keys.length}) has zh and ja — and scripts/i18n-check.mjs reads the store as a notice source`, keys.filter((x) => !(zh.includes(JSON.stringify(x) + ':') && ja.includes(JSON.stringify(x) + ':'))));
    const kf = mkH({ settings: { [DAY]: 800 } }); await kf.H.take({ key: DAY, value: 1600, untilRel: 3600e3, shown: 800 });
    const SH2 = SH.create({ dataDir: kf.dir, readSettings: () => kf.st, patchSettings: () => { throw new Error('EROFS'); }, now: () => NOW, writer: { dirty: () => { }, durable: async () => true }, setTimer: () => ({}), clearTimer: () => { } });
    fs.writeFileSync(path.join(kf.dir, 'setting-holds.json'), JSON.stringify({ v: 1, holds: { [DAY]: kf.H.list()[0] } })); await SH2.start();
    const e = await SH2.end(DAY);
    ok(!e.ok && e.code === 'return-failed' && e.value === 1600 && /it stays at 1600/.test(e.error), '«End now» refused by the file answers return-failed WITH the value it stays at (the page words it by its code — never «unreachable»)', e);
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
    ok(cr.button && cr.value === 1600 && cr.button.raise && cr.button.words.includes(V.raise) && cr.button.words.includes('1600') && /6/.test(cr.button.words) && !cr.button.words.includes(V.lower), `${lang}: a raise for 6 h — the ONE button says the raise verb, 1600 and the 6 h it posts`, cr.button);
    ok(cl.button && !cl.button.raise && cl.button.words.includes(V.lower) && cl.button.words.includes('400') && !cl.button.words.includes(V.raise), `${lang}: a lasting lower — the lower verb and 400`, cl.button);
    ok(ct.button && !ct.button.raise && ct.button.words.includes(V.lower) && ct.button.words.includes('400') && !ct.button.words.includes(V.raise), `${lang}: a TIMED lower is drawn with the lower verb (never the raise words)`, ct.button);
    // H: a live hold (1600, before 800) — LAW A on the card; I: a hand change — LAW B / C on the card and the Settings line
    facts.values[DAY] = 1600; facts.holds[DAY] = { key: DAY, value: 1600, before: 800, untilAt: NOW + 3 * 3600e3, at: NOW };
    const ch = card({ value: 1200, was: 1600 }), ce = card({ value: 800, was: 1600 });
    ok(!ch.button && ch.verdict.why === 'raise-over-hold' && ch.whyWords.includes('1200') && ch.whyWords.includes('800') && ch.whyLink, `${lang}: on a held raise a lasting 1200 draws NO button — the reason names 1200 and the 800 it would stay above, with the row\'s link`, { why: ch.whyWords });
    ok(ce.button && ce.button.words.includes(V.set) && ce.button.words.includes('800') && R.holdWords(DAY, t, { now: NOW }).includes('800'), `${lang}: a lasting 800 on the held row says «${V.set}» 800 and that the hold ends; Settings\' held line says «then 800»`, ce.button);
    facts.values[DAY] = 1200;   // the owner typed 1200 into the held row
    const ci = card({ value: 2000, was: 1200, untilRel: 2 * 3600e3 });
    const html = R.settingCardHtml(item({ value: 2000, was: 1200, untilRel: 2 * 3600e3 }), t);
    ok(R.holdWords(DAY, t, { now: NOW }) === '' && !ci.held && ci.heldWords === '' && ci.back === 1200 && !html.includes('ut-sc-held') && ci.vol.prop.includes('1200') && !ci.vol.prop.includes('800'), `${lang}: after a HAND change no word of the hold is drawn — no Settings line, no held line, the proposal goes back to the hand's 1200 (never «then 800»)`, { holdWords: R.holdWords(DAY, t, { now: NOW }), prop: ci.vol.prop });
    delete facts.holds[DAY]; facts.values[DAY] = 800;
  }
  // the press posts exactly what the card names: the action's value and its «until» AS IS (never re-derived from the ask's instant)
  const acts = read('src/lib/user-todos-actions.js');
  ok(/const body = \{ key, value: card\.value, shown: showed, \.\.\.\(Number\.isFinite\(num\(a\.untilRel\)\) \? \{ untilRel: num\(a\.untilRel\) \} : Number\.isFinite\(num\(a\.untilAt\)\) \? \{ untilAt: num\(a\.untilAt\) \} : \{\}\) \};/.test(acts) && /const p = \{ value, time: at != null \? untilClock\(at, t, \{ now \}\) : '', span: rel != null \? spanWords\(rel, t\) : '' \};/.test(read('src/lib/user-todos-row.js')),
    'the press\'s body is the card\'s value and the action\'s untilRel / untilAt as is; the button\'s words fill from the SAME value and stretch');
  // words-10: each button key says its verb in zh and ja (a «Lower» that said 提高 was green before)
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const said = (dict, k) => { const m = new RegExp(`^  ${JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ("(?:[^"\\\\]|\\\\.)*")`, 'm').exec(dict); return m ? JSON.parse(m[1]) : null; };
  const BUTTONS = [['Raise to {value} until {time}', 'raise'], ['Raise to {value} for {span}', 'raise'], ['Lower to {value} until {time}', 'lower'], ['Lower to {value} for {span}', 'lower'], ['Lower to {value}', 'lower'], ['Set to {value} for good — the hold ends', 'set']];
  const bad = BUTTONS.flatMap(([k, v]) => [['zh', zh], ['ja', ja]].filter(([lg, d]) => { const w = said(d, k); const other = v === 'raise' ? VERB[lg].lower : v === 'lower' ? VERB[lg].raise : null; return !w || !w.includes(VERB[lg][v]) || (other && w.includes(other)); }).map(([lg]) => `${lg}: ${k}`));
  ok(bad.length === 0, 'every button key says its own verb in zh (提高到 / 降低到 / 改为) and ja (上げる / 下げる / 変更), never the other', bad);
  // words-5: the tray's setting button keeps its mis-press guard (armed like the grant's) — pinned
  const panel = read('src/lib/user-todos-panel.js');
  ok(/const setBtn = e\.target\.closest\('\.ut-action-setting'\);\n\s+if \(setBtn\) \{\n(?:\s+\/\/[^\n]*\n)*\s+armExitButtons\(\);\n\s+const pv = pressVerdict\(\{ since: setBtn\._armSince \?\? null, now: performance\.now\(\) \}\);\n\s+if \(!pv\.ok\) \{ showToast\(/.test(panel) && /\.ut-action-grant, \.ut-action-setting'\)\)/.test(panel), 'the tray\'s setting button is armed (in armExitButtons) and its press asks pressVerdict first — a button that appeared or moved within ARM_MS is not pressed');
}

console.log(fail ? `✗ test-setting-holds: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

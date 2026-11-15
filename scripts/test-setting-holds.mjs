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
  ok(AS.LINK(DAY) === require(path.join(REPO, 'src/setting-links.js')).settingLink(DAY), 'its link is the setting-links spelling');
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
      ok(k.owner[0].detail.includes(`vibespace://settings/${DAY}`) && k.owner[0].text.includes(DAY) && /tried 4 times, a minute apart/.test(k.owner[0].detail) && /next start of VibeSpace tries again/.test(k.owner[0].detail) && k.owner[0].origin === 'spend' && k.owner[0].kind === 'notice' && k.owner[0].key === 'accounts', 'the ONE notice (the Spending family: origin spend) names the row with its link, the tries, and that the next start tries again', k.owner[0]);
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
    ok(H.list().length === 0 && k.owner.length === 1 && k.owner[0].text.includes(HOUR) && /its moment is not a number/.test(k.owner[0].detail) && /held at 60/.test(k.owner[0].detail) && saved && Object.keys(saved.holds).length === 0, 'a hold whose moment is not a number is dropped AND said (the row, the value it held, its link); the store is saved as kept, so the next start says nothing again', { owner: k.owner, saved });
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

console.log(fail ? `✗ test-setting-holds: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// THE LEARNED VENDOR BUDGET (lane gmail-quota-share, 2026-10-05; src/channel-budget.js — gate row `test-channel-budget`).
//
// One Google mailbox on TWO instances (one OAuth client = one vendor bucket of 6 000 units/min) with a default budget
// of 3 000 each tripped Gmail three times an afternoon. The rule: a refusal burst HALVES the account's ceiling (floor
// 10 % of the setting, one read at least), a quiet minute creeps it back by a tenth of the setting (one step under
// the refused ceiling for an hour), the ceiling is persisted beside the account, and discovery names a thread with
// the cheapest read and never re-reads a named one.
//   ① the PURE table   ② a seeded 5 000-step walk   ③ two REAL engines over ONE fake vendor bucket for an hour
//   ④ the ceiling survives a restart   ⑤ the words   ⑥ Gmail's discovery page metered before/after
//   ⑦ controls: no halve / no creep / no wall / not persisted / a named thread re-read — each RED
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const B = require(path.join(REPO, 'src/channel-budget.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const gmail = require(path.join(REPO, 'src/channels/gmail.js'));
const caps = require(path.join(REPO, 'src/channel-caps.js'));
const ROOT = scratch('chan-budget');
fs.rmSync(ROOT, { recursive: true, force: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });
const M = mutantCopies('chan-budget', REPO);
const T0 = Date.UTC(2026, 9, 5, 14, 0, 5);
const F = (now, extra = {}) => ({ setting: 3000, minUnit: 40, now, ...extra });

console.log('① the PURE table');
{
  let r = B.budgetStep(null, 'boot', F(T0));
  ok(r.state.ceiling === 3000 && r.full && B.EVENTS.join() === 'refused,quiet-minute,setting-changed,boot', 'boot with nothing persisted = the setting (the closed events: refused, quiet-minute, setting-changed, boot)');
  r = B.budgetStep(r.state, 'refused', F(T0));
  ok(r.halved && r.state.ceiling === 1500 && r.state.wall === 3000 && !r.loud, 'a burst\'s first strike HALVES the ceiling (3 000 → 1 500) and remembers the refused 3 000 as the wall');
  const r2 = B.budgetStep(r.state, 'refused', F(T0 + 20e3, { burstStart: false }));
  ok(!r2.halved && r2.state.ceiling === 1500 && r2.state.refusedAt === T0 + 20e3, 'the burst\'s later strikes do not halve again — they restart the quiet clock');
  const r3 = B.budgetStep(r2.state, 'refused', F(T0 + 30 * 60e3));
  ok(r3.halved && r3.loud && r3.state.halvesToday === 2 && !B.budgetStep(r3.state, 'refused', F(T0 + 40 * 60e3)).loud, 'the day\'s SECOND halving is loud (the one "For you" item); the third is not');
  let s = r.state; for (let i = 0; i < 12; i++) s = B.budgetStep(s, 'refused', F(T0 + i * 120e3)).state;
  ok(s.ceiling === 300 && B.floorOf(3000, 40) === 300 && B.floorOf(100, 40) === 40 && B.floorOf(30, 40) === 30, 'the floor: 10 % of the setting (300 of 3 000), never below one read (40 of a 100 setting), never above the setting');
  const q1 = B.budgetStep(r.state, 'quiet-minute', F(T0 + 59e3)); const q2 = B.budgetStep(r.state, 'quiet-minute', F(T0 + 60e3));
  ok(!q1.changed && q2.crept && q2.state.ceiling === 1800, 'a quiet MINUTE creeps by a tenth of the setting (1 500 → 1 800); 59 s is not a minute');
  const q3 = B.budgetStep(r.state, 'quiet-minute', F(T0 + 30 * 60e3));
  ok(q3.state.ceiling === 2700, 'while the wall stands (an hour) the creep stops ONE step under the refused ceiling (2 700, not 3 000)');
  const q4 = B.budgetStep(q3.state, 'quiet-minute', F(T0 + 60.5 * 60e3)); const q5 = B.budgetStep(q4.state, 'quiet-minute', F(T0 + 62 * 60e3));
  ok(q4.state.ceiling === 2700 && q4.state.wall === null && q5.state.ceiling === 3000 && q5.full, 'the wall falls after the hour; the minutes under it do not bank — the next quiet minute brings the setting back');
  const sc = B.budgetStep(r.state, 'setting-changed', F(T0, { setting: 6000 }));
  ok(sc.state.ceiling === 3000 && sc.state.setting === 6000 && sc.state.wall === 6000, 'setting-changed keeps the learned FRACTION (half of 6 000) — the setting stays the cap');
  const bt = B.budgetStep({ ceiling: 99999, setting: 3000, day: '2026-10-04', halvesToday: 2 }, 'boot', F(T0));
  ok(bt.state.ceiling === 3000 && bt.state.halvesToday === 0 && bt.state.day === '2026-10-05' && B.budgetStep({ ceiling: 'x' }, 'boot', F(T0)).state.ceiling === 3000, 'boot clamps a persisted ceiling to the setting, rolls the day, and a corrupt state is the setting');
  ok(B.fullAtOf(r.state, F(T0)) === T0 + 60 * 60e3 + 60e3 && B.fullAtOf(q5.state, F(T0)) === null && B.ratioOf(r.state) === 0.5, 'back-at-the-setting time = the wall\'s end + the last step; the pace scales by the ceiling\'s ratio (0.5)');
}

console.log('② a seeded 5 000-step walk');
{
  let seed = 20261005; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  let s = null, t = T0, bad = [], rises = 0, setting = 3000;
  for (let i = 0; i < 5000; i++) {
    t += Math.floor(rnd() * 90e3);
    const x = rnd(); const ev = x < 0.05 ? 'refused' : x < 0.9 ? 'quiet-minute' : x < 0.95 ? 'setting-changed' : 'boot';
    if (ev === 'setting-changed') setting = [600, 1500, 3000, 6000][Math.floor(rnd() * 4)];
    const before = s ? B.normalise(s, { setting, minUnit: 40, now: t }).ceiling : setting;
    const r = B.budgetStep(s, ev, { setting, minUnit: 40, now: t, burstStart: rnd() < 0.7 });
    const c = r.state.ceiling; const fl = B.floorOf(setting, 40);
    if (!(c <= setting && c >= fl)) bad.push(`${i} ${ev} ${c} ∉ [${fl}, ${setting}]`);
    if (c > before) { rises++; if (ev !== 'quiet-minute') bad.push(`${i} rose on ${ev}`); }
    s = r.state;
  }
  ok(bad.length === 0 && rises > 100, `5 000 random steps: the ceiling stays within [floor, setting] and rises ONLY on a quiet minute (${rises} rises)`, bad.slice(0, 3).join('; '));
}

// ── two REAL engines in-process over ONE fake vendor bucket of 6 000 units a minute (the measured shape) ──
const ADAPTER = { id: 'qv', kind: 'qv', label: 'qv', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null }, scan: null };
function world() {
  const w = { clock: T0, win: -1, spent: 0, refusals: [] };
  w.spend = (who, u) => { const m = Math.floor(w.clock / 60e3); if (m !== w.win) { w.win = m; w.spent = 0; } if (w.spent + u > 6000) { w.refusals.push({ who, at: w.clock }); throw new CH.ChannelError('rate-limited', "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'", { retryable: true, detail: { retryAfterSec: null } }); } w.spent += u; };
  return w;
}
const qvMod = (w, who) => ({ kind: 'qv', caps: { ...fake.fakePoll.caps, sendAs: [], identityMarking: 'none', threads: { ...fake.fakePoll.caps.threads, replyInto: false, placements: [], rootReply: null }, budget: { unit: 'quota-unit', metered: true, default: 3000 } },
  create(rec, deps) { return {
    auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['qv'], why: null }; } },
    async listConversations() { deps.meter(10); w.spend(who, 10); return { conversations: Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, vendorId: `c${i}`, title: `c${i}`, kind: 'group', participants: '', lastAt: null })), cursor: null, complete: true }; },
    async convCaps() { return { read: 'yes', sendAs: [], why: null, at: Date.now() }; },
    // a backlog no pass finishes: every pass wants more than its minute (the 10 040-thread mailbox)
    async history() { deps.meter(200); w.spend(who, 200); return { records: [], anchor: null, reachedAnchor: false, complete: false }; },
  }; } });
let dirSeq = 0;
/** Two instances, one bucket, passes every 20 s for `minutes`; B restarts at `restartAt` (a new engine over its data dir). */
async function pair(Eng = ENG, { minutes = 60, restartAt = null, EngAfter = null } = {}) {
  const w = world(); const tag = `p${++dirSeq}`;
  const mk = (who, E) => { const dataDir = path.join(ROOT, tag, who); if (!fs.existsSync(dataDir)) { fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true }); fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [ADAPTER] })); } const registry = CH.createChannelRegistry(); registry.register(qvMod(w, who)); return { who, dataDir, eng: E.create({ dataDir, env: {}, registry, broadcast: () => {}, now: () => w.clock }) }; };
  const ins = [mk('A', Eng), mk('B', Eng)];
  const lim = (x) => x.eng.digest().adapters.find((a) => a.id === 'qv').budget;
  let atRestart = null;
  for (let s = 0; s < minutes * 3; s++) {
    if (restartAt !== null && s === restartAt * 3) { const old = ins[1]; if (old.eng.stop) await old.eng.stop(); ins[1] = mk('B', EngAfter || Eng); atRestart = lim(ins[1]); }
    for (const x of ins) await x.eng.pass('qv', { force: true });
    w.clock += 20e3;
  }
  const out = { refusals: w.refusals, budgets: ins.map(lim), atRestart, disk: JSON.parse(fs.readFileSync(path.join(ins[1].dataDir, 'channels', 'adapters.json'), 'utf8')).adapters[0].budgetLearned };
  for (const x of ins) if (x.eng.stop) await x.eng.stop();
  return out;
}
const bursts = (refs, who) => refs.filter((r) => r.who === who).filter((r, i, a) => i === 0 || r.at - a[i - 1].at > 120e3).length;

console.log('③ two engines, one vendor bucket, an hour');
const real = await pair(ENG, { minutes: 60 });
{
  const late = real.refusals.filter((r) => r.at - T0 > 10 * 60e3);
  ok(real.refusals.length >= 1 && bursts(real.refusals, 'A') <= 2 && bursts(real.refusals, 'B') <= 2 && late.length === 0, `the measured shape (2 × 3 000 over a 6 000 bucket): ${real.refusals.length} refusal(s), ${bursts(real.refusals, 'A')}+${bursts(real.refusals, 'B')} burst(s), then NEITHER trips again within the hour`, JSON.stringify(real.refusals.map((r) => [r.who, (r.at - T0) / 1e3])));
  const lb = real.budgets.find((b) => b.learned);
  ok(lb && lb.limit === 2700 && lb.learned.setting === 3000 && lb.learned.refusedAt === real.refusals[0].at && lb.learned.fullAt > T0 + 60 * 60e3, `the refused instance polls at 2 700 of 3 000 (one step under the wall) and says when it is back (${lb && JSON.stringify(lb.learned)})`);
}
console.log('④ the ceiling survives a restart');
const rs = await pair(ENG, { minutes: 30, restartAt: 15 });
ok(rs.atRestart && rs.atRestart.limit < 3000 && rs.refusals.every((r) => r.at - T0 < 15 * 60e3) && rs.disk && rs.disk.ceiling === rs.atRestart.limit, `restarted at minute 15, B boots at its persisted ${rs.atRestart && rs.atRestart.limit} (adapters.json, beside the account) and nothing trips after the restart`, JSON.stringify(rs.refusals.map((r) => [r.who, (r.at - T0) / 1e3])));

console.log('⑤ the words');
{
  const b = { unit: 'quota-unit', learned: { ceiling: 1500, setting: 3000, refusedAt: new Date(2026, 9, 5, 16, 2).getTime(), fullAt: new Date(2026, 9, 5, 17, 3).getTime() } };
  const en = caps.learnedBudgetText(b, { vendor: 'Google' });
  ok(en === "Polling at 1500 of 3000 quota units/min — Google refused this account's quota at 16:02; another instance may be polling the same account · back to 3000 by 17:03", 'en: the ceiling of the setting, WHEN Google refused, the shared bucket as a possibility, back by', en);
  ok(caps.learnedBudgetText({ unit: 'quota-unit', learned: null }) === '' && caps.learnedBudgetText({ unit: 'request', learned: { ceiling: 3, setting: 3 } }) === '', 'nothing said at the setting');
  const keys = ["Polling at {n} of {m} {unit}/min — {vendor} refused this account's quota at {time}; another instance may be polling the same account · back to {m} by {back}", 'Polling at {n} of {m} {unit}/min · back to {m} by {back}', 'Channel {label}: {vendor} refused its quota twice today — polling slowed to {n} of {m} a minute'];
  const missing = [];
  for (const lang of ['zh', 'ja']) { const src = fs.readFileSync(path.join(REPO, `src/lib/i18n-${lang}.js`), 'utf8'); for (const k of keys) if (!src.includes(JSON.stringify(k) + ':')) missing.push(`${lang}: ${k.slice(0, 30)}`); }
  ok(missing.length === 0, 'zh + ja carry the card sentence, its short form and the For-you headline', missing.join('; '));
  const panel = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf8');
  ok((panel.match(/chanCaps\.learnedBudgetText\(a\.budget/g) || []).length === 2, 'the account card AND the Channels panel row say it');
}

console.log('⑥ Gmail discovery: the naming read, metered before/after');
// the BEFORE side is the base's own gmail.js (2.369.218); a shallow clone without that object says SKIP by name (§75)
let BASE = null;
try { BASE = execFileSync('git', ['-C', REPO, 'show', 'd232f8b72:src/channels/gmail.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { console.log('  SKIP ⑥ before-side: d232f8b72 is not in this clone (shallow) — only the after-side prices are judged'); }
async function gmailPages(mod) {
  const names = new Set(); let units = 0; let clock = T0;
  const fetchFn = async (url) => { const u = new URL(String(url)); const p = u.pathname.replace('/gmail/v1/users/me', ''); const msg = (id) => ({ id, threadId: id, internalDate: String(T0), payload: { headers: [{ name: 'Subject', value: `Subject ${id}` }, { name: 'From', value: `Ada <ada@example.com>` }] } }); const body = p === '/threads' ? { threads: Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, snippet: `s${i}`, historyId: '1' })) } : /^\/messages\//.test(p) ? msg(p.split('/')[2]) : { id: p.split('/')[2], messages: [msg(p.split('/')[2])] }; return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) }; };
  const mkA = () => { const tok = { read() { return { token: { access_token: 'ya', expiresAt: clock + 3600e3, refresh_token: 'r', scopes: [gmail.SCOPE], email: 'me@example.com' }, why: null }; }, async write() {}, async clear() {} }; return mod.create({ id: 'gmail', options: {} }, { now: () => clock, fetch: fetchFn, tokens: tok, resolveIntegration: () => ({ values: { clientId: 'c', clientSecret: 's' }, why: null }), log: { warn() {}, log() {} }, meter: (n) => { units += n; }, named: (id) => names.has(id) }); };
  const listOnce = async (a) => { const u0 = units; const r = await a.listConversations({ limit: 100 }); for (const c of r.conversations) if (c.standIn === false) names.add(c.id); return units - u0; };
  const first = await listOnce(mkA());
  clock += 7 * 3600e3;   // a restart / the 6 h title memo gone
  const again = await listOnce(mkA());
  return { first, again };
}
const before = BASE ? await gmailPages(M.load('src/channels/gmail.js', BASE, 'gmail-base')) : { first: 410, again: 410 };   // SKIP: the base's declared price
const after = await gmailPages(gmail);
ok(before.first === 410 && after.first === 210, `the first listing of a page (10 threads, every one named once): ${before.first} → ${after.first} units (ten naming reads at 20, were 40)`);
ok(before.again === 410 && after.again === 10, `the same page listed again after a restart: ${before.again} → ${after.again} units (a named thread is never re-read)`);
ok((after.first + after.again) <= 0.5 * (before.first + before.again), `discovery per page ≥ 50 % less: ${before.first + before.again} → ${after.first + after.again} units over the two listings (−${Math.round(100 - 100 * (after.first + after.again) / (before.first + before.again))} %)`);
ok(gmail.caps.pace.cost.discover === 210 && !('recentRoots' in (gmail.create ? {} : {})) && !/recentRoots/.test(fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf8')), 'the drain\'s discover row is the real price (10 + 10 × 20); Gmail has no recent-roots recheck to pay a thread read');

console.log('⑦ controls');
const BSRC = fs.readFileSync(path.join(REPO, 'src/channel-budget.js'), 'utf8');
const ESRC = engineSource(REPO);   // .219 dc-channels-seams: the engine + its three family files as one text (a patched copy loads as ONE closed world)
const GSRC = fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf8');
const REQ = "const Budget = require('../channel-budget.js');";
const engOver = (bsrc, tag) => { const bp = M.write('src/channel-budget.js', bsrc, tag); return M.load('src/server/channels-engine.js', ESRC.replace(REQ, `const Budget = require(${JSON.stringify(bp)});`), `eng-${tag}`); };
const HALVE = '      s.ceiling = Math.max(floor, Math.floor(s.ceiling / 2));\n';
const CREEP = '      const next = Math.min(cap, s.ceiling + k * step);\n';
const WALL = '      const walled = !!(s.wall && s.wallUntil > t);\n';
ok(ESRC.includes(REQ) && [HALVE, CREEP, WALL].every((a) => BSRC.split(a).length === 2), 'CONTROL anchors are in the files');
{
  const c = await pair(engOver(BSRC.replace(HALVE, ''), 'nohalve'), { minutes: 20 });
  ok(c.refusals.length >= 10, `CONTROL no halve: the refused instance trips every pass (${c.refusals.length} refusals in 20 min) — RED`);
  const Bc = M.load('src/channel-budget.js', BSRC.replace(CREEP, '      const next = s.ceiling;\n'), 'nocreep');
  let s = null; for (let i = 0; i < 5; i++) s = Bc.budgetStep(s, 'refused', F(T0 + i * 120e3)).state; for (let i = 1; i <= 180; i++) s = Bc.budgetStep(s, 'quiet-minute', F(T0 + 600e3 + i * 60e3)).state;
  ok(s.ceiling === 300, `CONTROL no creep: three quiet hours later the ceiling is still the floor (${s.ceiling}) — RED`);
  const nw = await pair(engOver(BSRC.replace(WALL, '      const walled = false;\n'), 'nowall'), { minutes: 60 });
  ok(nw.refusals.some((r) => r.at - T0 > 10 * 60e3), `CONTROL no wall: the creep returns to the refused ceiling and trips again within the hour (${nw.refusals.length} refusals) — RED`);
  const mem = (tag) => M.load('src/server/channels-engine.js', ESRC.replace(REQ, `${REQ}\nconst MEMK = Symbol('learned');`).replaceAll('rec.budgetLearned', 'rec[MEMK]'), tag);   // on the record in memory, never in its JSON
  const np = await pair(mem('eng-mem-1'), { minutes: 30, restartAt: 15, EngAfter: mem('eng-mem-2') });
  ok(np.atRestart && np.atRestart.limit === 3000 && np.refusals.some((r) => r.at - T0 >= 15 * 60e3), `CONTROL ceiling not persisted: the restarted instance boots at 3 000 and trips again (${np.refusals.length} refusals) — RED`);
  const KEEP = '        const keep = !m && named(id);\n';
  const g = await gmailPages(M.load('src/channels/gmail.js', GSRC.replace(KEEP, '        const keep = false;\n'), 'gmail-reread'));
  ok(GSRC.includes(KEEP) && g.again === 210, `CONTROL discovery re-reads a named thread: the re-listing meters ${g.again} units, not 10 — RED`);
}
const cc = copiesCensus(M.files, M.dir, REPO, { minCopies: 6, label: 'test-channel-budget' });
for (const c of cc) ok(c.pass, c.name, c.detail);
console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

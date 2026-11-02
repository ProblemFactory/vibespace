#!/usr/bin/env node
// AN ANTIGRAVITY USAGE WALL BECOMES A READING (lane agy-wall-signal; the owner 2026-11-02: «antigravity会话撞墙了但是用量
// 一直没刷新出来，一直显示0%，我刚才手动刷新才刷出来»). The incident's three wrapper records (the notice, the prompt_end, the
// usage — userW's account shape agy-<12hex>, model gemini-4-argon-high) and the fake agy answering the on-demand read are
// the ONLY inputs: no real agy, no vendor, no timer.
//   ① the parser (src/harnesses/antigravity-wall.js): the notice and the prompt_end → ONE typed signal each (the Gemini
//     group, the weekly window, resetsAt = ts + «90h39m34s», 100 %, source 'stream'); everything else → null;
//   ② the duration grammar («90h39m34s» «4h12m» «59s» «1d2h») — any other spelling is NO signal ('unread'), never a guess;
//   ③ the group: gemini-* ⇒ Gemini Models, claude-* / gpt-* ⇒ Claude and GPT models, anything else ⇒ no signal;
//   ④ the window rule at 5 h ± 1 s;  ⑤ the notice + its prompt_end are ONE wall;
//   ⑥ THE WRITE (src/server/stream-wall.js → the one write path): the walled window at 100 % until its reset, the 5h window
//     and the other group UNTOUCHED, agy's window names carried, the session's ACCOUNT (never the machine login);
//     a newer measured reading wins, a late wall changes nothing;
//   ⑦ THE ROOM SENTENCE: only with the other group's weekly window READ under 90 %; the notice card carries the facts;
//     en / zh / ja say it;
//   ⑧ THE ONE-SHOT (the owner's ruling «A»): one spawn of the on-demand argv per account per wall, the reading replaces
//     the 100 %; the same wall twice ⇒ one; a second window ⇒ a second; 'turn-started' ⇒ nothing written + disarmed;
//     'auth-required' ⇒ one line, no retry; a harness without `onDemand.onWallSignal` ⇒ zero spawns; 24 h with no wall
//     ⇒ zero spawns; a replayed (not live) wall ⇒ zero spawns;
//   ⑨ THE REAL CONSUMER (src/server/stdout/acp-events.js) fed the incident's three records writes the wall;
//   ⑩ the gauge law: a window that states no spend draws no donut (onDemandUsageView).
// Run: node scripts/test-agy-wall-signal.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } return !!c; };
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }

const AW = require(path.join(REPO, 'src/harnesses/antigravity-wall.js'));
const SW = require(path.join(REPO, 'src/server/stream-wall.js'));
const QM = require(path.join(REPO, 'src/quota-model.js'));
const U = require(path.join(REPO, 'src/harnesses/antigravity-usage.js'));
const W = require(path.join(REPO, 'src/usage-cache-write.js'));
const harnesses = require(path.join(REPO, 'src/harnesses'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const G = AW.GEMINI_GROUP, C = AW.CLAUDE_GPT_GROUP;
// THE INCIDENT (brief facts; the conversation id and account are shapes only)
const TS = '2026-11-02T13:21:36.043Z', T = Date.parse(TS);
const TEXT = 'Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 90h39m34s.';
const NOTICE = { ts: TS, type: 'acp', kind: 'notice', level: 'error', text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): ' + TEXT, noticeKind: 'agy-error' };
const PEND = { ts: '2026-11-02T13:21:36.045Z', type: 'acp', kind: 'prompt_end', promptId: 'p39-3287287', stopReason: 'error', error: { message: TEXT, status: 'ERROR' } };
const USAGE = { ts: '2026-11-02T13:21:36.053Z', type: 'acp', kind: 'usage', sessionId: '00000000-0000-4000-8000-000000000000', total: {}, turn: {}, last: {}, model: 'gemini-4-argon-high', modelFrom: 'agy', durationSeconds: 808712.58 };
const RESET = 1793952070; // the re-check's Gemini weekly reset — exactly ts + 90h39m34s
const MODEL = { model: 'gemini-4-argon-high' };

console.log('① the three record shapes → one signal each (or none)');
{
  const n = AW.signalFromStream(NOTICE, MODEL), e = AW.signalFromStream(PEND, MODEL);
  ok('the notice → the Gemini group\'s WEEKLY window, 100 %, resetsAt = ts + 90h39m34s (the re-check\'s own reset, to the second), source stream', n && n.kind === 'exhausted' && n.source === 'stream' && n.limitId === G && n.window === '7d' && n.usedPct === 100 && n.resetsAt === RESET && n.measuredAt === T, JSON.stringify(n));
  ok('…the prompt_end → the same wall (its promptId kept)', e && e.limitId === G && e.window === '7d' && e.resetsAt === RESET && e.promptId === 'p39-3287287', JSON.stringify(e));
  ok('the usage record, an ordinary turn end, another notice kind, a non-quota error → null', [USAGE, { ...PEND, stopReason: 'end_turn', error: null }, { ...NOTICE, noticeKind: 'agy-system' }, { ...NOTICE, text: 'Antigravity: UNAVAILABLE (code 503): try again. Resets in 5m.' }, { ...PEND, error: { message: 'stream disconnected' } }, null, {}].every((r) => AW.signalFromStream(r, MODEL) === null));
  ok('the descriptor carries it: antigravity\'s quota.signalFromStream IS the parser (not NULL_QUOTA\'s)', harnesses.get('antigravity').quota.signalFromStream === AW.signalFromStream && harnesses.hasLimitSignal(harnesses.get('antigravity').quota));
}

console.log('② the duration grammar');
{
  const pins = { '90h39m34s': 326374, '4h12m': 15120, '59s': 59, '1d2h': 93600, '90h39m34s.': 326374 };
  ok('pinned spellings parse exactly', Object.entries(pins).every(([k, v]) => AW.parseResetDuration(k) === v), JSON.stringify(Object.fromEntries(Object.keys(pins).map((k) => [k, AW.parseResetDuration(k)]))));
  const bad = ['', 'soon', '90h39m34', '1.5h', '90 h', 'h', '-5s', '5x', '2h1d', 'tomorrow', '3600'];
  ok('every other spelling → null (never a guess)', bad.every((s) => AW.parseResetDuration(s) === null), JSON.stringify(bad.map((s) => AW.parseResetDuration(s))));
  const u = AW.signalFromStream({ ...NOTICE, text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in a while.' }, MODEL);
  ok('a wall whose countdown is unreadable → kind unread (why duration), no limit, no reset', u && u.kind === 'unread' && u.why === 'duration' && !('resetsAt' in u), JSON.stringify(u));
}

console.log('③ the model group');
{
  ok('gemini-* ⇒ Gemini Models; claude-* / gpt-* ⇒ Claude and GPT models (the names the on-demand reading uses)', AW.modelGroupOf('gemini-4-argon-high') === G && AW.modelGroupOf('Gemini-3.1-pro') === G && AW.modelGroupOf('claude-sonnet-4-6') === C && AW.modelGroupOf('gpt-oss-120b') === C);
  const fx = JSON.parse(read('scripts/fixtures/antigravity-usage-1.4.3.json'));
  ok('…both names are the capture\'s own group names', JSON.stringify(fx.envelope.command.data.groups.map((g) => g.name)) === JSON.stringify([G, C]));
  ok('an unknown model / none ⇒ null', [null, '', 'default', 'llama-3', 'models/gemini-x', 'agemini-x'].every((m) => AW.modelGroupOf(m) === null));
  const u = AW.signalFromStream(NOTICE, { model: 'llama-3' }), v = AW.signalFromStream(NOTICE, {});
  ok('…and the wall is then NO signal (why model) — never the wrong bucket', u && u.kind === 'unread' && u.why === 'model' && v && v.why === 'model', JSON.stringify([u, v]));
}

console.log('④ the window rule: a reset more than 5 h away is the weekly window');
{
  ok('5 h − 1 s and 5 h ⇒ 5h; 5 h + 1 s ⇒ 7d', AW.windowKindFor(17999) === '5h' && AW.windowKindFor(18000) === '5h' && AW.windowKindFor(18001) === '7d');
  const at = (d) => AW.signalFromStream({ ...NOTICE, text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in ' + d + '.' }, MODEL);
  ok('…through the parser: «5h» → 5h, «5h0m1s» → 7d, «4h12m» → 5h (its reset at ts + 15120 s)', at('5h').window === '5h' && at('5h0m1s').window === '7d' && at('4h12m').window === '5h' && at('4h12m').resetsAt === Math.floor((T + 15120e3) / 1000));
}

console.log('⑤ one wall, said twice');
{
  const n = AW.signalFromStream(NOTICE, MODEL), e = AW.signalFromStream(PEND, MODEL);
  ok('the notice and its prompt_end (2 ms apart) are ONE wall', SW.sameWall(n, e));
  const later = AW.signalFromStream({ ...NOTICE, ts: new Date(T + 3000).toISOString() }, MODEL);
  ok('3 s apart with no shared prompt → two walls; another window → two walls', !SW.sameWall(n, later) && !SW.sameWall(n, { ...e, window: '5h' }));
  ok('the same prompt id → one wall whatever the gap', SW.sameWall({ ...e, measuredAt: T + 60000 }, e));
}

// ── the world for ⑥ – ⑨: a real accounts store, the real door, the fake agy ──
const ROOT = scratch('agy-wall');
fs.rmSync(ROOT, { recursive: true, force: true });
const MACHINE = path.join(ROOT, 'machine-home'), DATA = path.join(ROOT, 'data'), CACHE = path.join(DATA, 'usage-cache'), LOG = path.join(ROOT, 'agy.log'), ENV_FILE = path.join(ROOT, 'incident-usage.json');
for (const d of [MACHINE, CACHE]) fs.mkdirSync(d, { recursive: true });
process.env.HOME = MACHINE;
const STUB = path.join(REPO, 'scripts/fixtures/antigravity-agy');
const AGY = require(path.join(REPO, 'src/harnesses/antigravity.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const am = new AccountManager({ dataDir: DATA });
const mkAcct = (name) => { const a = am.createHomeSubscription('antigravity', { name }); fs.writeFileSync(path.join(a.dir, AGY.TOKEN_REL), 'LOGIN', { mode: 0o600 }); am.finalizeHomeSubscription(a.id); return a; };
const A = mkAcct('Personal Ultra'), B = mkAcct('Second'), Cc = mkAcct('Third'), D = mkAcct('Fourth');
const runs = () => { try { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.argv && x.argv[0] === '-p'); } catch { return []; } };
// the on-demand envelope (agy 1.4.3's usage-groups shape) at the incident's numbers
const FIX = JSON.parse(read('scripts/fixtures/antigravity-usage-1.4.3.json'));
function envelope({ g7, g7r, g5, g5r, c7, c7r, c5, c5r }) {
  const env = clone(FIX.envelope);
  const set = (g, win, used, r) => { const b = env.command.data.groups.find((x) => x.name === g).buckets.find((x) => x.window === win); b.remaining_fraction = Math.round((1 - used / 100) * 1e4) / 1e4; b.reset_time = new Date(r * 1000).toISOString(); };
  set(G, 'weekly', g7, g7r); set(G, '5h', g5, g5r); set(C, 'weekly', c7, c7r); set(C, '5h', c5, c5r);
  return env;
}
const sec = (ms) => Math.floor(ms / 1000);
const INCIDENT = envelope({ g7: 99.22, g7r: RESET, g5: 27.51, g5r: sec(T) + 3 * 3600, c7: 0, c7r: sec(T) + 7 * 86400, c5: 0, c5r: sec(T) + 5 * 3600 });
fs.writeFileSync(ENV_FILE, JSON.stringify(INCIDENT));
// the reading the account held BEFORE the wall (a Re-check two days earlier)
const seed = (key, at, env) => { const j = U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(env), measuredAt: at }); return W.writeReading({ cacheDir: CACHE, key, set: { ...j.reading, identity: key }, extras: { backend: 'antigravity' }, source: 'cli-usage', backend: 'antigravity' }); };
const BEFORE = envelope({ g7: 40, g7r: RESET, g5: 10, g5r: sec(T) + 3600, c7: 0, c7r: sec(T - 2 * 86400) + 7 * 86400, c5: 0, c5r: sec(T) + 4 * 3600 });
const disk = (key) => W.readCacheObject(CACHE, key);
const lim = (o, id) => (o && o.limits || []).find((l) => l.limitId === id);
const win = (o, id, k) => QM.windowOfKind(lim(o, id), k);

const clock = { t: T + 50 };
let usageMode = 'file:' + ENV_FILE;
const logs = [];
const DOOR = require(path.join(REPO, 'src/server/cli-usage-door.js'));
const mkDoor = (harnessOf = (id) => harnesses.get(id)) => DOOR.createCliUsageDoor({
  accounts: am, harnessOf, cacheDir: CACHE,
  cliCmds: { check: async (be, o) => (be === 'antigravity' && o && o.force === true ? STUB : null) },
  agentEnv: () => ({ PATH: process.env.PATH, AGY_STUB_LOG: LOG, AGY_STUB_USAGE: usageMode }),
  setting: () => 'manual', now: () => clock.t, log: (l) => logs.push(l),
});
const door = mkDoor();
const mkRoad = (o = {}) => SW.createStreamWallRoad({ harnessOf: (id) => harnesses.get(id), cacheDir: CACHE, door, now: () => clock.t, log: (l) => logs.push(l), ...o });
const sess = (acct, model = 'gemini-4-argon-high') => ({ backend: 'antigravity', _accountId: acct ? acct.id : null, _spawnModel: model });
const modelOf = (s) => () => s._spawnModel;

console.log('⑥ THE WRITE: the walled window, nothing else');
{
  seed(A.id, T - 2 * 86400, BEFORE);
  const before = disk(A.id);
  const road = mkRoad({ door: null });
  const s = sess(A);
  const r = road.onRecord(s, NOTICE, { modelOf: modelOf(s) });
  const after = disk(A.id);
  const g7 = win(after, G, '7d');
  ok('the Gemini weekly window: 100 %, its reset the one agy named, measured at the wall', g7 && g7.usedPct === 100 && g7.resetsAt === RESET && g7.measuredAt === T && g7.state === 'running', JSON.stringify(g7));
  ok('…the Gemini 5h window UNTOUCHED (the merge is per window)', JSON.stringify(win(after, G, '5h')) === JSON.stringify(win(before, G, '5h')));
  ok('…the Claude and GPT limit UNTOUCHED (the merge is per limit)', JSON.stringify(lim(after, C)) === JSON.stringify(lim(before, C)));
  ok('…the Gemini limit says who measured it last (stream) and the file keeps the backend + agy\'s window names', lim(after, G).source === 'stream' && after.backend === 'antigravity' && after.windowNames?.['Gemini Models/7d'] === 'Weekly Limit Remaining' && after.source === 'stream');
  // THE AGE RULE (r2): the row's age label is the file's fetchedAt — a wall never moves it (it stamps only its own window)
  const MA0 = await import(path.join(REPO, 'src/lib/manage-agents.js'));
  ok('…the file\'s fetchedAt (the row\'s age label) stays the STALE reading\'s — the untouched windows keep their age; the walled window carries the wall\'s own measuredAt', after.fetchedAt === before.fetchedAt && after.fetchedAt === T - 2 * 86400 && MA0.onDemandUsageView({ limits: after.limits, fetchedAt: after.fetchedAt }).fetchedAt === T - 2 * 86400, JSON.stringify([before.fetchedAt, after.fetchedAt]));
  ok('the answer names the room (the other group\'s weekly window read at 0 %)', r && r.wallRoom && r.wallRoom.name === C && r.wallRoom.usedPct === 0, JSON.stringify(r && r.wallRoom));
  const mid = fs.readFileSync(W.cacheFileFor(CACHE, A.id), 'utf8');
  ok('the prompt_end of the same wall writes nothing more', road.onRecord(s, PEND, { modelOf: modelOf(s) }) === null && fs.readFileSync(W.cacheFileFor(CACHE, A.id), 'utf8') === mid);
  // the machine's own login: no account row reads it
  const m0 = fs.readdirSync(CACHE).length, n0 = logs.length;
  const road2 = mkRoad({ door: null });
  ok('a session on the machine\'s own login (no account): nothing written, ONE line', road2.onRecord(sess(null), NOTICE, { modelOf: () => 'gemini-4-argon-high' }) === null && road2.onRecord(sess(null), { ...NOTICE, ts: new Date(T + 9000).toISOString() }, { modelOf: () => 'gemini-4-argon-high' }) === null && fs.readdirSync(CACHE).length === m0 && logs.slice(n0).filter((l) => /machine's own login/.test(l)).length === 1, logs.slice(n0).join(' | '));
  // an unknown model: nothing, one line
  const n1 = logs.length, b0 = fs.readFileSync(W.cacheFileFor(CACHE, A.id), 'utf8');
  const road3 = mkRoad({ door: null });
  road3.onRecord(sess(A, 'llama-3'), NOTICE, { modelOf: () => 'llama-3' }); road3.onRecord(sess(A, 'llama-3'), PEND, { modelOf: () => 'llama-3' });
  ok('a model of no known group: nothing written, the refusal said ONCE', fs.readFileSync(W.cacheFileFor(CACHE, A.id), 'utf8') === b0 && logs.slice(n1).filter((l) => /not read \(model\)/.test(l)).length === 1, logs.slice(n1).join(' | '));
  // the stream's model when the session names none: the last `usage` record
  const road4 = mkRoad({ door: null });
  const s4 = sess(B, null);
  road4.onRecord(s4, USAGE, { modelOf: () => null });
  road4.onRecord(s4, NOTICE, { modelOf: () => null });
  ok('a session with no chosen model: the model agy\'s own usage record named decides the group', win(disk(B.id), G, '7d')?.usedPct === 100);
}

console.log('⑥b provenance: the newest measurement wins, a late wall changes nothing');
{
  // a measured reading taken AFTER a wall: written later, newer ⇒ it replaces the 100 %
  const after = U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(INCIDENT), measuredAt: T + 5000 });
  W.writeReading({ cacheDir: CACHE, key: A.id, set: { ...after.reading, identity: A.id }, extras: { backend: 'antigravity', windowNames: after.reading.extra.windowNames }, source: 'cli-usage', backend: 'antigravity' });
  ok('a measured reading after the wall REPLACES its 100 % (Gemini weekly 99.22 %, source cli-usage)', win(disk(A.id), G, '7d').usedPct === 99.22 && lim(disk(A.id), G).source === 'cli-usage');
  // a LATE wall record (stamped before that reading) arrives now: nothing changes
  const road = mkRoad({ door: null });
  const b = fs.readFileSync(W.cacheFileFor(CACHE, A.id), 'utf8');
  const r = road.onRecord(sess(A), { ...NOTICE, ts: new Date(T + 1000).toISOString() }, { modelOf: () => 'gemini-4-argon-high' });
  const g = win(disk(A.id), G, '7d');
  ok('a wall stamped BEFORE the stored reading never overwrites it (and says so)', r === null && g.usedPct === 99.22 && g.measuredAt === T + 5000 && logs.some((l) => /a newer reading of Gemini Models 7d stands/.test(l)), JSON.stringify(g));
  ok('…the file\'s other limits are as they were', JSON.stringify(lim(disk(A.id), C)) === JSON.stringify(lim(JSON.parse(b), C)));
  // a wall whose reset already passed says nothing about now
  clock.t = T + 3600e3; // read an hour after a wall that lifted 59 s after it
  ok('a wall whose reset is already past (59 s, read 1 h later) writes nothing', mkRoad({ door: null }).onRecord(sess(D), { ...NOTICE, text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 59s.' }, { modelOf: () => 'gemini-4-argon-high' }) === null && disk(D.id) === null);
  clock.t = T + 50;
}

console.log('⑦ the room sentence');
{
  const lims = (c7, c7r, at = T) => { const j = U.judgeUsageAnswer({ code: 0, stdout: JSON.stringify(envelope({ g7: 99, g7r: RESET, g5: 1, g5r: sec(T) + 3600, c7, c7r, c5: 0, c5r: sec(T) + 3600 })), measuredAt: at }); return j.reading.limits; };
  ok('the other group\'s weekly window read at 0 % → «Claude and GPT models», 0', JSON.stringify(SW.roomOf(lims(0, sec(T) + 7 * 86400), G, T)) === JSON.stringify({ name: C, usedPct: 0 }));
  ok('…at 42.6 % → 43 (a whole percent)', SW.roomOf(lims(42.6, sec(T) + 3 * 86400), G, T)?.usedPct === 43);
  ok('…at 90 % or more → no sentence', SW.roomOf(lims(90, sec(T) + 3 * 86400), G, T) === null && SW.roomOf(lims(97, sec(T) + 3 * 86400), G, T) === null);
  ok('…its reset already LANDED (shown reset, unconfirmed) → no sentence (never a guess)', SW.roomOf(lims(10, sec(T) - 3600, T - 6 * 86400), G, T) === null);
  ok('…no other group read, or only the walled one → no sentence', SW.roomOf([], G, T) === null && SW.roomOf(lims(0, sec(T) + 86400).filter((l) => l.limitId === G), G, T) === null);
  // the normalizer carries the facts onto the notice card; garbage never rides
  const { AcpMessageManager } = require(path.join(REPO, 'src/acp-message-manager.js'));
  const mm = new AcpMessageManager();
  mm._processNotice({ ...NOTICE, wallRoom: { name: C, usedPct: 0 } }, false);
  mm._processNotice({ ...NOTICE, wallRoom: { name: '<b>x</b>'.repeat(30), usedPct: 'NaN' } }, false);
  mm._processNotice({ ...NOTICE }, false);
  const all = [...(mm.messages || mm._messages || mm.getMessages?.() || [])];
  const [c1, c2, c3] = all.slice(-3);
  ok('the wall notice card keeps its words and carries { name, usedPct } — and nothing for a malformed or absent room', c1 && c1.noticeKind === 'agy-error' && c1.status === 'error' && c1.content[0].text === 'Error: ' + NOTICE.text && JSON.stringify(c1.content[0].wallRoom) === JSON.stringify({ name: C, usedPct: 0 }) && c2 && !('wallRoom' in c2.content[0]) && c3 && !('wallRoom' in c3.content[0]), JSON.stringify(all.slice(-3).map((m) => m && m.content)));
  // the words: en literal = the zh / ja key; both translated
  const KEY = '{name}: weekly limit {pct} % used — switch this conversation’s model to continue';
  const CR = read('src/lib/chat-renderers.js');
  ok('the client says it through t() with the one key (beside the wall notice and as its own line)', CR.includes(`t('${KEY}'`) && /const room = msg\.content\?\.\[0\]\?\.wallRoom;/.test(CR) && /msg\.noticeKind === 'usage-wall-room' && msg\.content\?\.\[0\]\?\.wallRoom/.test(CR));
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const zt = zh && zh[KEY], jt = ja && ja[KEY];
  ok('en / zh / ja keys load, each with both placeholders', typeof zt === 'string' && typeof jt === 'string' && [zt, jt].every((s) => s.includes('{name}') && s.includes('{pct}')), JSON.stringify([zt, jt]));
  const rn = SW.roomNotice({ name: C, usedPct: 0 });
  ok('the after-read line is a notice record the journal shape knows (info, usage-wall-room) with the brief\'s English', rn.type === 'acp' && rn.kind === 'notice' && rn.level === 'info' && rn.noticeKind === 'usage-wall-room' && rn.text === "Claude and GPT models: weekly limit 0 % used — switch this conversation's model to continue");
}

console.log('⑧ THE ONE-SHOT (owner\'s ruling A): one read per account per wall');
{
  fs.rmSync(LOG, { force: true });
  for (const a of [A, B, Cc, D]) fs.rmSync(W.cacheFileFor(CACHE, a.id), { force: true });
  seed(A.id, T - 2 * 86400, BEFORE);
  clock.t = T + 50;
  const said = [];
  const road = mkRoad();
  const s = sess(A);
  const r1 = road.onRecord(s, NOTICE, { modelOf: modelOf(s), say: (x) => said.push(x) });
  const r2 = road.onRecord(s, PEND, { modelOf: modelOf(s), say: (x) => said.push(x) });
  await (r1 && r1.oneShot);
  const run = runs();
  ok('a wall ⇒ EXACTLY ONE spawn of the on-demand argv, in the account\'s own HOME root', run.length === 1 && JSON.stringify(run[0].argv) === JSON.stringify(U.USAGE_ARGV) && run[0].home === A.dir && run[0].bus === 'disabled:', JSON.stringify(run));
  ok('…the notice\'s prompt_end fires nothing more', r2 === null);
  const g7 = win(disk(A.id), G, '7d'), g5 = win(disk(A.id), G, '5h');
  ok('…the reading REPLACES the stream\'s 100 % — every window as agy says (Gemini weekly 99.22 %, 5h 27.51 %, the same reset)', g7.usedPct === 99.22 && g7.resetsAt === RESET && g5.usedPct === 27.51 && lim(disk(A.id), G).source === 'cli-usage', JSON.stringify([g7, g5]));
  ok('…the room was known at the wall, so the notice carries it and no second line is said', r1.wallRoom && r1.wallRoom.name === C && said.length === 0);
  // a retry hitting the SAME wall later (agy counts down: the same reset instant, ±1 s) — nothing
  clock.t = T + 10 * 60e3;
  const retry = road.onRecord(s, { ...NOTICE, ts: new Date(T + 10 * 60e3).toISOString(), text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 90h29m35s.' }, { modelOf: modelOf(s) });
  await (retry && retry.oneShot);
  ok('a retry on the SAME wall (same reset) ⇒ the wall rewritten, NO second spawn', runs().length === 1 && retry && !retry.oneShot && win(disk(A.id), G, '7d').usedPct === 100, JSON.stringify(runs().length));
  // a SECOND window (the Gemini 5h wall) — another wall ⇒ a second spawn (the door's minute has passed)
  clock.t = T + 12 * 60e3;
  const w5 = road.onRecord(s, { ...NOTICE, ts: new Date(clock.t).toISOString(), text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 2h48m.' }, { modelOf: modelOf(s) });
  await (w5 && w5.oneShot);
  ok('a SECOND window (the 5h wall) ⇒ a second spawn', runs().length === 2 && w5 && !!w5.oneShot, String(runs().length));
  // the room unknown at the wall, known after the read ⇒ ONE line said into the chat
  const s2 = sess(B), said2 = [];
  clock.t = T + 50;
  const rb = road.onRecord(s2, NOTICE, { modelOf: modelOf(s2), say: (x) => said2.push(x) });
  await (rb && rb.oneShot);
  ok('an account with NO earlier reading: no room at the wall; the one-shot reads it and ONE room line is said (the 0 % group)', rb && rb.wallRoom === null && said2.length === 1 && said2[0].noticeKind === 'usage-wall-room' && said2[0].wallRoom.name === C && said2[0].wallRoom.usedPct === 0 && runs().length === 3, JSON.stringify(said2));
}

console.log('⑧b the judge\'s STOP, a refusal, the capability row, no timer, no replay');
{
  // 'turn-started' ⇒ nothing written, the one-shot disarmed for that account, said by name
  usageMode = 'turn';
  const road = mkRoad();
  const s = sess(Cc);
  clock.t = T + 50;
  const r = road.onRecord(s, NOTICE, { modelOf: modelOf(s) });
  const before = fs.readFileSync(W.cacheFileFor(CACHE, Cc.id), 'utf8');
  await (r && r.oneShot);
  ok('a turn-shaped answer ⇒ the stream\'s wall stands (nothing more written) and the road says STOP / DISARMED', runs().length === 4 && fs.readFileSync(W.cacheFileFor(CACHE, Cc.id), 'utf8') === before && logs.some((l) => /STOP — the wall re-check is DISARMED until the hub restarts/.test(l)));
  clock.t = T + 30 * 60e3;
  const r2 = road.onRecord(s, { ...NOTICE, ts: new Date(clock.t).toISOString(), text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 3h.' }, { modelOf: modelOf(s) });
  ok('…a NEW wall on that account still writes, but fires NOTHING (disarmed until the hub restarts)', r2 && r2.oneShot === null && runs().length === 4 && win(disk(Cc.id), G, '5h')?.usedPct === 100);
  // 'auth-required' ⇒ nothing, one line, no retry; a later wall may try again
  usageMode = 'auth';
  const s4 = sess(D);
  clock.t = T + 50;
  const n0 = logs.length;
  const a1 = road.onRecord(s4, NOTICE, { modelOf: modelOf(s4) });
  await (a1 && a1.oneShot);
  const d0 = fs.readFileSync(W.cacheFileFor(CACHE, D.id), 'utf8');
  ok('agy says not signed in ⇒ nothing written beyond the wall, ONE line naming it', runs().length === 5 && logs.slice(n0).filter((l) => /re-check read nothing \(login-needed/.test(l)).length === 1, logs.slice(n0).join(' | '));
  clock.t = T + 5 * 60e3;
  const a2 = road.onRecord(s4, { ...NOTICE, ts: new Date(clock.t).toISOString(), text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 90h34m36s.' }, { modelOf: modelOf(s4) });
  ok('…the same wall again ⇒ NO retry', a2 && a2.oneShot === null && runs().length === 5);
  usageMode = 'file:' + ENV_FILE;
  clock.t = T + 20 * 60e3;
  const a3 = road.onRecord(s4, { ...NOTICE, ts: new Date(clock.t).toISOString(), text: 'Antigravity: RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 4h.' }, { modelOf: modelOf(s4) });
  await (a3 && a3.oneShot);
  ok('…a NEW wall may try again (one attempt never decides for ever)', runs().length === 6 && fs.readFileSync(W.cacheFileFor(CACHE, D.id), 'utf8') !== d0);
  // the capability row: a harness WITH a stream wall but WITHOUT onDemand.onWallSignal ⇒ written, zero spawns
  const fake = { id: 'fake-wall', quota: { ...harnesses.get('antigravity').quota, onDemand: { ...harnesses.get('antigravity').quota.onDemand, onWallSignal: undefined } } };
  const fakeAcct = { id: 'fake-acct-1' };
  const road2 = mkRoad({ harnessOf: (id) => (id === 'fake-wall' ? fake : harnesses.get(id)) });
  clock.t = T + 50;
  const f1 = road2.onRecord({ backend: 'fake-wall', _accountId: fakeAcct.id }, NOTICE, { modelOf: () => 'gemini-4-argon-high' });
  ok('a harness whose onDemand does NOT declare onWallSignal: the wall written, ZERO spawns (the capability row, never a name)', f1 && f1.oneShot === null && win(disk(fakeAcct.id), G, '7d')?.usedPct === 100 && runs().length === 6);
  // claude / codex accounts: their signal never reads an agy-shaped record; the door refuses a wall read for them
  const claudeRoad = mkRoad();
  ok('a claude or codex session fed the same records: no signal, nothing written, nothing spawned', ['claude', 'codex'].every((be) => claudeRoad.onRecord({ backend: be, _accountId: 'acct-' + be }, NOTICE, { modelOf: () => 'gemini-4-argon-high' }) === null && claudeRoad.onRecord({ backend: be, _accountId: 'acct-' + be }, PEND, {}) === null && disk('acct-' + be) === null) && runs().length === 6);
  const doorNo = mkDoor((id) => (id === 'antigravity' ? fake : harnesses.get(id)));
  clock.t = T + 3 * 3600e3;
  const dn = await doorNo.read(A.id, { wall: true });
  ok('…and the DOOR refuses a wall read where the descriptor does not declare it (400 no-wall-read), agy never runs', dn.status === 400 && dn.code === 'no-wall-read' && runs().length === 6, JSON.stringify(dn));
  const da = await door.read(A.id, {});
  ok('…a call that is neither a person nor a wall is refused 403 as before', da.status === 403 && runs().length === 6);
  // never a timer: 24 h of records that are no wall ⇒ zero spawns; the road holds no timer
  const road3 = mkRoad();
  const s5 = sess(B);
  const answers = [];
  for (let h = 0; h < 24; h++) { clock.t = T + 4 * 3600e3 + h * 3600e3; answers.push(road3.onRecord(s5, { ...USAGE, ts: new Date(clock.t).toISOString() }, {}), road3.onRecord(s5, { ...PEND, ts: new Date(clock.t).toISOString(), stopReason: 'end_turn', error: null }, {})); }
  await new Promise((r) => setImmediate(r));
  ok('a fake clock advanced 24 h with no wall ⇒ ZERO spawns (48 records, no answer, no read); the road and the door hold no interval / no timer of their own', answers.every((x) => x === null) && runs().length === 6 && !/setInterval|setTimeout/.test(read('src/server/stream-wall.js')) && !/setInterval/.test(read('src/server/cli-usage-door.js')));
  // a REPLAYED wall (stamped long ago, its reset still ahead): written, never a trigger
  fs.rmSync(W.cacheFileFor(CACHE, B.id), { force: true });
  const s6 = sess(B);
  const road4 = mkRoad();
  clock.t = T + 6 * 60e3;
  const old = road4.onRecord(s6, NOTICE, { modelOf: modelOf(s6) });
  ok('a wall record stamped longer ago than the live bound (a replay) ⇒ written, NO spawn', old && old.oneShot === null && win(disk(B.id), G, '7d')?.usedPct === 100 && runs().length === 6, JSON.stringify(old));
}

console.log('⑨ THE REAL CONSUMER (acp-events) under server.js\'s REAL engine literal');
{
  // r2 (the acceptance's MAJOR): the consumer gets the engine server.js HANDS it — its literal's keys, parsed from the shipped
  // file (never a hand-made engine that happens to carry what the road reads). Each key is a no-op except the model accessor,
  // which answers the pool engine's own ladder (lock › newest pick › spawn) — and only when the literal carries it.
  const srv = read('server.js');
  const i = srv.indexOf("require('./src/server/session-stdout.js').create({"), j = srv.indexOf('engine: {', i);
  let d = 0, k = j + 8; for (; k < srv.length; k++) { if (srv[k] === '{') d++; else if (srv[k] === '}' && !--d) break; }
  const KEYS = [...new Set((srv.slice(j + 9, k).replace(/\/\/.*$/gm, '').match(/[A-Za-z_$][\w$]*/g) || []))];
  const LADDER = (s) => (s._modelLocked && s._lockedModel) || s._pickedModel || s._spawnModel || null;
  const engineOf = (keys) => Object.fromEntries(keys.map((n) => [n, n === 'sessionModelFor' ? LADDER : () => { }]));
  ok('server.js\'s session-stdout literal parsed (' + KEYS.length + ' keys) and it CARRIES sessionModelFor', KEYS.length > 20 && KEYS.includes('sessionModelFor') && KEYS.includes('noteTurnEnd'), KEYS.join(','));
  const { AcpMessageManager } = require(path.join(REPO, 'src/acp-message-manager.js'));
  const AE = require(path.join(REPO, 'src/server/stdout/acp-events.js'));
  const drive = (s, recs, keys = KEYS) => {
    const consumer = AE.create({ engine: engineOf(keys), noteHarnessModels() { }, deliverRef: {}, permissionRulesRef: {} });
    const fed = [], pty = { onData(fn) { this.fn = fn; } };
    consumer.attach(s, 'w-' + Math.random().toString(36).slice(2, 8), pty, { feedLive: (_s, m) => fed.push(m), broadcastToSession() { }, broadcastActiveSessions() { }, readSessionMeta: () => null, writeSessionMeta() { }, updateSessionTodos() { } });
    pty.fn(recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
    return fed;
  };
  const rooms = (fed) => new AcpMessageManager('x').convertHistory(fed).filter((m) => m && m.content && m.content[0] && m.content[0].wallRoom);
  const fresh = (acct, extra = {}) => ({ backend: 'antigravity', _accountId: acct.id, buffer: '', name: 'wall', ...extra });
  SW.configure({ harnessOf: (id) => harnesses.get(id), cacheDir: CACHE, door: null, now: () => clock.t, log: (l) => logs.push(l) });
  clock.t = T + 50;
  // the FIRST wall of a session (a restart / a new conversation on an exhausted account): no `usage` record has spoken yet
  fs.rmSync(W.cacheFileFor(CACHE, A.id), { force: true }); seed(A.id, T - 2 * 86400, BEFORE);
  const fed = drive(fresh(A, { _spawnModel: 'gemini-4-argon-high' }), [NOTICE, PEND, USAGE]);
  const g7 = win(disk(A.id), G, '7d');
  ok('THE FIRST WALL of a session (notice → prompt_end → usage: no usage record yet) is WRITTEN — the session\'s own model names the group', g7 && g7.usedPct === 100 && g7.resetsAt === RESET, JSON.stringify(g7));
  const n = fed.find((m) => m.kind === 'notice');
  ok('…the three records all reach the normalizer; the notice keeps its words and carries the room facts', fed.length === 3 && n && n.text === NOTICE.text && n.wallRoom && n.wallRoom.name === C && n.wallRoom.usedPct === 0, JSON.stringify(fed.map((m) => m.kind)));
  ok('…EXACTLY ONE room line through the real normalizer (notice first)', rooms(fed).length === 1);
  // the same, without the engine key at all: the session record itself is read (a missing key never drops a wall)
  fs.rmSync(W.cacheFileFor(CACHE, B.id), { force: true });
  drive(fresh(B, { _spawnModel: 'gemini-4-argon-high' }), [NOTICE, PEND], KEYS.filter((x) => x !== 'sessionModelFor'));
  ok('…and with an engine that LACKS the accessor, the session record\'s own model still writes the wall (the fallback)', win(disk(B.id), G, '7d')?.usedPct === 100);
  // the prompt_end FIRST (agy\'s stdout result read before its stderr line): the room rides the prompt_end, said once
  fs.rmSync(W.cacheFileFor(CACHE, Cc.id), { force: true }); seed(Cc.id, T - 2 * 86400, BEFORE);
  const fed2 = drive(fresh(Cc, { _spawnModel: 'gemini-4-argon-high' }), [PEND, NOTICE, USAGE]);
  const pe = fed2.find((m) => m.kind === 'prompt_end');
  ok('PROMPT_END FIRST: the prompt_end carries the room, the later notice none — EXACTLY ONE room line through the real normalizer', pe && pe.wallRoom && pe.wallRoom.name === C && !fed2.find((m) => m.kind === 'notice').wallRoom && rooms(fed2).length === 1, JSON.stringify(rooms(fed2).map((m) => m.content[0])));
  // a MODEL SWITCH before the wall: the NEW model\'s group (never the group the last usage record named)
  fs.rmSync(W.cacheFileFor(CACHE, D.id), { force: true });
  const s4 = fresh(D, { _spawnModel: 'claude-sonnet-4-6' });
  drive(s4, [{ ...USAGE, model: 'claude-sonnet-4-6', ts: new Date(T - 600e3).toISOString() }]);   // the previous turn ran claude
  s4._pickedModel = 'gemini-4-argon-high'; s4._pickedModelAt = T - 60e3;                               // the person switched
  drive(s4, [NOTICE, PEND]);
  ok('A WALL AFTER A MODEL SWITCH lands on the NEW model\'s group (Gemini), the old group untouched', win(disk(D.id), G, '7d')?.usedPct === 100 && !lim(disk(D.id), C), JSON.stringify(disk(D.id)?.limits?.map((l) => l.limitId)));
  // no model fact anywhere ⇒ still no signal, said
  const n0 = logs.length;
  const fake = { ...A, id: 'agy-no-model-acct' };
  drive(fresh(fake), [NOTICE, PEND]);
  ok('a session that names NO model anywhere (no lock, pick, spawn or usage record) ⇒ no signal, the line — never a guess', disk(fake.id) === null && logs.slice(n0).some((l) => /not read \(model\)/.test(l)), logs.slice(n0).join(' | '));
}

console.log('⑨b the on-demand setting says the truth (the owner\'s ruling A)');
{
  const src = read('src/lib/settings-schema.js');
  const OPT = 'Manual (⟳ button) — plus ONE automatic read after a usage wall', DESC = 'Manual = when you click ⟳, and once by itself when an Antigravity conversation hits a usage wall;';
  ok('the «manual» option and the description name the one automatic read after a wall', src.includes(`{ value: 'manual', label: t('${OPT}') }`) && src.includes(DESC) && !src.includes('Manual only (⟳ button)') && !src.includes('Manual = only when you click ⟳'));
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const dk = Object.keys(zh).find((k) => k.includes(DESC));
  ok('…in zh and ja too (the option, and the description\'s manual clause)', !!zh[OPT] && !!ja[OPT] && !!dk && /Antigravity/.test(zh[dk]) && /Antigravity/.test(ja[dk]), JSON.stringify([zh[OPT], ja[OPT]]));
  ok('…and the door\'s behaviour is unchanged by the words: «off» still refuses a wall read', /if \(mode === 'off'\) return \{ ok: false, status: 403, code: 'refresh-off'/.test(read('src/server/cli-usage-door.js')));
}

console.log('⑩ the gauge law on the account row');
{
  const MA = await import(path.join(REPO, 'src/lib/manage-agents.js'));
  const v = MA.onDemandUsageView({ limits: [{ limitId: G, name: G, windows: [{ kind: '7d', minutes: 10080, usedPct: null, resetsAt: RESET, measuredAt: T }, { kind: '5h', minutes: 300, usedPct: 27.51, resetsAt: sec(T) + 3600, measuredAt: T }] }] });
  ok('a window that states no spend draws NO donut (Number(null) is 0 — it drew a 0 % one); a stated one still draws', v && v.windows.length === 1 && v.windows[0].kind === 'fiveHour', JSON.stringify(v));
  const w = MA.onDemandUsageView({ limits: [{ limitId: G, name: G, windows: [{ kind: '7d', minutes: 10080, usedPct: 100, resetsAt: RESET, measuredAt: T }] }] });
  ok('the wall as the ring draws it: 100 % with its reset', w && w.windows[0].utilization === 1 && w.windows[0].resetsAt === RESET);
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);

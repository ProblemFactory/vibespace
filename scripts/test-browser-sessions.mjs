#!/usr/bin/env node
// BROWSER SESSIONS, THEIR REPLAY, AND RETENTION BY SIZE (2026-09-27 — the owner: "最关键是能在聊天界面和浏览器查看界面两个地方
// 都能看到 session 的开始和结束，以及每个浏览器 session 的回放" / "记录不要按照 7 天上限，而是按照容量，每个浏览器 profile 最多
// 保留 1GB 记录"). The fast gate (the chrome one is test-browser-replay-ui):
//   ① PURE session arithmetic (src/browser-sessions.js): start/end pairing, an open session, a restart end, an action
//      before any start is its own session (untagged records split at the gap), tagged records with no marker, duration
//      and count, the ordinals, which session an entry belongs to, the chat's cards (own key only, stable ids, sanitized
//      blocks), which keeper stops end a session (idle never);
//   ② PURE retention BY SIZE (src/browser-trace.js): the 1 GiB default + the 64 MB floor of the setting, the plan (the
//      oldest CLOSED sessions' frames first, whole; an open session last and partly; lists never; old records under the
//      limit untouched) — CONTROLS: a patched copy that also sweeps by AGE ⇒ red; a patched copy of the recorder whose
//      sweep DROPS the lists ⇒ red; the census: no age rule in either browser-trace.js, `TRACE_RETENTION_MS` nowhere;
//   ③ the REAL recorder (src/server/browser-trace.js) over a fake bridge + a stub keeper: the lease seam writes the
//      markers (attach / launch / verb open; detach / dropped / stop / switch close; idle and turn-idle never), every
//      action carries its session, an action with none opens one, a restart re-opens a session whose lease came back and
//      ends the rest with `restart` at their last action, trace OFF opens nothing (an open one still ends), the hook and
//      the broadcast see every marker, the sweep over real files (frames unlinked, every index line kept, stamped);
//   ④ the normalizers: the cards placed BY TIME between real transcript records (claude, and codex's empty-history
//      shape), the live feed's gate (queued while a rebuild runs, nothing before the first attach, an op once loaded,
//      ONE card when the rebuild and the live feed both carry it);
//   ⑤ the route GET /api/browser/sessions in-process (by live session, by conversation through the bindings, by a key
//      given, by profile, `session=` adds its actions, bad ids 400, an unknown conversation EMPTY);
//   ⑥ the replay model (keys, the 1 s play that stops at the last action, the picks, the named empty states);
//   ⑦ the words: en through the real module, zh + ja for every key in the dictionaries with the owner's words.
// ~2 s, port 0, scratch dirs only, no browser, no vendor call.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const BS = require('../src/browser-sessions.js');
const T = require('../src/browser-trace.js');
const R = require('../src/server/browser-trace.js');
const N = require('../src/normalizers.js');
const express = require('express');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const quiet = { log() { }, warn() { } };
const MB = 1048576, DAY = 86400000, MIN = 60000;
const ROOT = scratch('browser-sessions');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const servers = [];
process.on('exit', () => { for (const s of servers) { try { s.close(); } catch { } } fs.rmSync(ROOT, { recursive: true, force: true }); });
const M = mutantCopies('browser-sessions', REPO);
const KA = 'bk-0000000a', KB = 'bk-0000000b', KC = 'bk-0000000a.1';
const P1 = 'bp-00000001';

// ═══ ① PURE: the session arithmetic ═══════════════════════════════════════════
console.log('— ① sessions: pairing, open, restart, the implicit ones, the cards');
{
  const t0 = 1000 * DAY;
  const m = (phase, id, at, x = {}) => BS.markerFor({ phase, id, browserKey: KA, profileId: P1, at, label: 'work', ...x });
  const e = (id, at, x = {}) => ({ id, at, browserKey: KA, profileId: P1, browserSession: null, before: { file: id + '-before.jpg', bytes: 10 }, after: { file: id + '-after.jpg', bytes: 20 }, ...x });
  const markers = [m('start', 'bs-00000001', t0), m('end', 'bs-00000001', t0 + 10 * MIN, { count: 2, durationMs: 10 * MIN, reason: 'released' }), m('start', 'bs-00000002', t0 + DAY)];
  const entries = [e('tr-000000000001', t0 + MIN, { browserSession: 'bs-00000001' }), e('tr-000000000002', t0 + 2 * MIN, { browserSession: 'bs-00000001' }), e('tr-000000000003', t0 + DAY + MIN, { browserSession: 'bs-00000002' }),
    // pre-session records (no tag): two runs 2 h apart ⇒ two implicit sessions; an action before any start is its own session
    e('tr-0000000000a1', t0 - 5 * DAY), e('tr-0000000000a2', t0 - 5 * DAY + 5 * MIN), e('tr-0000000000b1', t0 - 5 * DAY + 2 * 60 * MIN),
    // a tagged record whose markers are gone
    e('tr-0000000000c1', t0 + 2 * DAY, { browserSession: 'bs-000000cc' })];
  const ss = BS.pairSessions({ markers, entries, now: t0 + DAY + 30 * MIN });
  const by = Object.fromEntries(ss.map((s) => [s.id, s]));
  ok(ss.length === 5 && ss[0].id === 'bs-000000cc' && ss.map((s) => s.startAt).every((v, i, a) => i === 0 || a[i - 1] >= v), `five sessions, NEWEST first (${ss.map((s) => s.id).join(' ')})`);
  ok(by['bs-00000001'].open === false && by['bs-00000001'].count === 2 && by['bs-00000001'].durationMs === 10 * MIN && by['bs-00000001'].reason === 'released' && by['bs-00000001'].label === 'work' && !by['bs-00000001'].implicit, 'a start + an end pair: closed, its two actions, 10 min, why it ended, the profile\'s name at the start');
  ok(by['bs-00000002'].open === true && by['bs-00000002'].count === 1 && by['bs-00000002'].durationMs === 30 * MIN && by['bs-00000002'].endAt === null, 'a start with no end is OPEN — its duration runs to now');
  const imp = ss.filter((s) => s.implicit && s.id !== 'bs-000000cc');
  ok(imp.length === 2 && imp.every((s) => /^bs-[0-9a-f]{8}$/.test(s.id)) && imp.map((s) => s.count).sort().join() === '1,2' && imp.every((s) => s.open === false && s.reason === null), 'untagged (pre-session) records form IMPLICIT sessions, split at the 30-min gap — an action before any start is its own session, closed');
  ok(by['bs-000000cc'].implicit && by['bs-000000cc'].count === 1 && by['bs-000000cc'].startAt === t0 + 2 * DAY, 'a tagged record whose markers are gone makes its session from its entries');
  const ord = BS.sessionOrdinals(ss);
  ok(ord.get(imp.sort((a, b) => a.startAt - b.startAt)[0].id) === 1 && ord.get('bs-00000001') === 3 && ord.get('bs-000000cc') === 5, 'the ordinals count OLDEST first (Session 1 is the first)');
  ok(BS.sessionOfEntry(entries[0], ss) === 'bs-00000001' && BS.sessionOfEntry(entries[4], ss) === imp.find((s) => s.count === 2).id && BS.sessionOfEntry({ id: 'x', at: 1, browserKey: KA, profileId: P1 }, ss) === null, 'which session an entry belongs to: its tag, else the implicit span of its browser, else none');
  // restart end + a start at boot
  const rs = BS.pairSessions({ markers: [m('start', 'bs-00000009', t0), m('end', 'bs-00000009', t0 + 3 * MIN, { reason: 'restart', count: 4, durationMs: 3 * MIN })], entries: [] });
  ok(rs[0].reason === 'restart' && rs[0].count === 4 && rs[0].open === false, 'an end written at boot says `restart` and keeps the count its marker carried');
  ok(BS.markerFor({ phase: 'end', id: 'bs-00000001', browserKey: KA, at: 5, reason: 'weird' }).reason === 'stopped' && BS.END_REASONS.join() === 'released,dropped,stopped,switched,restart', 'an end reason is from the closed set');
  // the keeper's stops: idle never ends a session
  ok(BS.endReasonFor({ kind: 'browser-stopped', why: 'idle' }) === null && BS.endReasonFor({ kind: 'browser-stopped', why: 'turn-idle' }) === null && BS.endReasonFor({ kind: 'browser-stopped', why: 'user' }) === 'stopped' && BS.endReasonFor({ kind: 'browser-stopped', why: 'switch' }) === 'switched' && BS.endReasonFor({ kind: 'detach' }) === 'released' && BS.endReasonFor({ kind: 'lease-dropped' }) === 'dropped' && BS.endReasonFor({ kind: 'attach' }) === null, 'IDLE is not an end (idle, turn-idle); a person\'s stop, a switch, a detach and a dropped lease are');
  // the chat's cards: this conversation's own key only
  const withHelper = [...ss, ...BS.pairSessions({ markers: [BS.markerFor({ phase: 'start', id: 'bs-000000dd', browserKey: KC, at: t0 + 5 * MIN }), BS.markerFor({ phase: 'start', id: 'bs-000000ee', browserKey: KB, at: t0 + 6 * MIN })] })];
  const cards = BS.chatCardsFor(withHelper, KA, { limit: 1024 * MB });
  ok(cards.map((c) => c.id).join() === 'bs:bs-00000001:start,bs:bs-00000001:end,bs:bs-00000002:start', `the chat gets start + end per MARKED session of its own key, oldest first — no implicit one, no helper's (${KC}), no other conversation's (${cards.map((c) => c.id).join(' ')})`);
  ok(cards[1].durationMs === 10 * MIN && cards[1].count === 2 && cards[1].reason === 'released' && cards[1].limit === 1024 * MB && cards[0].label === 'work' && cards[0].profileId === P1, 'the end card carries the duration, the count, the reason and the limit; the start card the profile');
  ok(BS.sessionsOfKey(withHelper, KA).some((s) => s.id === 'bs-000000dd') && !BS.sessionsOfKey(withHelper, KA).some((s) => s.id === 'bs-000000ee'), '…while the conversation\'s LIST includes its helpers\' browsers (not another conversation\'s)');
  const blk = BS.cardBlock({ phase: 'start', session: 'bs-00000001', at: 5, browserKey: KA, profileId: P1, label: '<img src=x onerror=alert(1)>' });
  ok(blk && blk.type === 'browser_session' && blk.label === '<img src=x onerror=alert(1)>' && BS.cardBlock({ phase: 'start', session: 'bs-1', at: 5 }) === null && BS.cardBlock({ phase: 'middle', session: 'bs-00000001' }) === null && BS.cardBlock({ phase: 'end', session: 'bs-00000001', browserKey: 'x', profileId: '../p', reason: 'x' }).reason === 'stopped', 'a card block: a label stays TEXT (the renderer sets textContent), a bad id / phase is refused, a bad key / profile / reason never passes');
  // a session that ended in the SAME millisecond the next one started: its end, then the next start — never two starts
  const tie = BS.pairSessions({ markers: [BS.markerFor({ phase: 'start', id: 'bs-000000f1', browserKey: KA, at: 7 }), BS.markerFor({ phase: 'end', id: 'bs-000000f1', browserKey: KA, at: 9, reason: 'released' }), BS.markerFor({ phase: 'start', id: 'bs-000000f2', browserKey: KA, at: 9 }), BS.markerFor({ phase: 'end', id: 'bs-000000f2', browserKey: KA, at: 9, reason: 'stopped' }), BS.markerFor({ phase: 'start', id: 'bs-000000f3', browserKey: KA, at: 9 })] });
  ok(BS.chatCardsFor(tie, KA).map((c) => c.id.replace('bs:bs-000000', '')).join() === 'f1:start,f1:end,f2:start,f2:end,f3:start' && tie.map((s) => s.id.slice(3)).join() === '000000f3,000000f2,000000f1', 'three sessions in one millisecond keep the order they happened in (start, end, start, end, start) — the marker file\'s order breaks the tie');
  ok(BS.durationParts(42000).s === 42 && BS.durationParts(3 * MIN).m === 3 && BS.durationParts(65 * MIN).h === 1 && BS.durationParts(65 * MIN).m === 5, 'durations in parts: seconds, minutes, hours + minutes');
}

// ═══ ② PURE: retention BY SIZE ═══════════════════════════════════════════════
console.log('— ② retention by size: the plan, the setting, the controls');
/** The plan's legs, run against a module (the real one, then a patched copy that must fail one). */
function planLegs(TT, tag = '') {
  const res = [];
  const L = (c, n) => res.push({ c: !!c, n: tag + n });
  const sess = (id, startAt, open, list) => ({ id, startAt, open, entries: list.map(([eid, at, fb]) => ({ id: eid, at, frameBytes: fb, listBytes: 1000 })) });
  const now = 5000 * DAY;
  // a scope far OVER the limit and one far under — with records 2 years old in the one under
  const over = { key: P1, sessions: [sess('bs-00000003', now - DAY, true, [['tr-3a', now - DAY, 300 * MB], ['tr-3b', now - DAY + 1, 300 * MB]]), sess('bs-00000001', now - 30 * DAY, false, [['tr-1a', now - 30 * DAY, 200 * MB], ['tr-1b', now - 30 * DAY + 1, 200 * MB]]), sess('bs-00000002', now - 20 * DAY, false, [['tr-2a', now - 20 * DAY, 250 * MB]])] };
  const under = { key: 'ephemeral', sessions: [sess('bs-00000009', now - 730 * DAY, false, [['tr-9a', now - 730 * DAY, 5 * MB]])] };
  const p = TT.traceSizePlan({ scopes: [over, under], bytesPerScope: 1024 * MB, now });
  const ids = (p.removeFrames || []).map((r) => r.id);
  L(ids.slice(0, 2).join() === 'tr-1a,tr-1b', 'over 1 GiB: the OLDEST closed session\'s frames go first, the whole session');
  L(!ids.includes('tr-2a') || ids.indexOf('tr-2a') > ids.indexOf('tr-1b'), '…then the next oldest, never out of order');
  L(!ids.includes('tr-3a') && !ids.includes('tr-3b'), 'an OPEN session keeps its frames while the closed ones can pay');
  L(!ids.includes('tr-9a'), 'a scope UNDER the limit keeps a record two years old — no age rule');
  const k = (p.kept || []).find((x) => x.key === P1);
  L(k && k.used <= 1024 * MB && k.listBytes === 5000, 'after the plan the profile fits, its five lists still counted');
  // only open sessions over: partial, oldest action first, newest kept
  const p2 = TT.traceSizePlan({ scopes: [{ key: P1, sessions: [sess('bs-00000004', now, true, [['tr-4a', now, 400 * MB], ['tr-4b', now + 1, 400 * MB], ['tr-4c', now + 2, 400 * MB]])] }], bytesPerScope: 1024 * MB, now });
  L((p2.removeFrames || []).map((r) => r.id).join() === 'tr-4a', 'an open session alone over the limit loses its OLDEST action\'s frames only — the newest stay');
  // the lists alone over the limit: every frame goes, the lists stay, the overage is said
  const p3 = TT.traceSizePlan({ scopes: [{ key: P1, sessions: [{ id: 'bs-00000005', startAt: 1, open: false, entries: [{ id: 'tr-5a', at: 1, frameBytes: 10, listBytes: 2 * MB }] }] }], bytesPerScope: MB, now });
  L((p3.kept || [])[0] && p3.kept[0].overBy === MB && p3.removeFrames.length === 1 && /the lists stay/.test(p3.kept[0].why), 'lists alone over the limit: every frame goes, the lists stay, the overage is named');
  return res;
}
{
  for (const x of planLegs(T)) ok(x.c, x.n);
  ok(T.traceBytesLimit(undefined) === 1024 * MB && T.traceBytesLimit('') === 1024 * MB && T.traceBytesLimit('nope') === 1024 * MB && T.traceBytesLimit(0) === 1024 * MB, 'the setting unset / garbage ⇒ the 1 GiB default (browser.traceBytesPerProfile, MB)');
  ok(T.traceBytesLimit(512) === 512 * MB && T.traceBytesLimit(10) === 64 * MB && T.traceBytesLimit(64) === 64 * MB && T.TRACE_BYTES_FLOOR === 64 * MB && T.TRACE_BYTES_SETTING === 'browser.traceBytesPerProfile', 'a set value in MB, never below the 64 MB floor');
  ok(T.entryFrameBytes({ before: { file: 'a.jpg', bytes: 7 }, after: { file: 'a.jpg', bytes: 7 } }) === 7 && T.entryFrameBytes({ before: { file: 'a.jpg', bytes: 7 }, after: { file: 'b.jpg', bytes: 5 } }) === 12 && T.entryFrameBytes({ before: null, after: null, framesRemoved: {} }) === 0, 'an entry\'s frame bytes count each FILE once (an unchanged after IS the before file)');
  // the schema row matches the PURE constants
  const schema = fs.readFileSync(path.join(REPO, 'src/lib/settings-schema.js'), 'utf8');
  ok(/'browser\.traceBytesPerProfile': \{[\s\S]{0,600}?type: 'number', default: 1024, min: 64,/.test(schema), 'the setting row: number, default 1024 MB, min 64 — the same numbers the PURE limit reads');
  // CONTROL (a): a patched copy that ALSO sweeps by age ⇒ the legs go red
  const src = fs.readFileSync(path.join(REPO, 'src/browser-trace.js'), 'utf8');
  const needle = '    for (const s of order) {\n      if (frames + lists <= limit) break;';
  ok(src.includes(needle), 'the control\'s anchor is in the plan (else the control would judge nothing)');
  const aged = M.load('src/browser-trace.js', src.replace(needle, "    for (const s of sessions) for (const e of s.entries) if ((Number(e.frameBytes) || 0) && (Date.now() - (Number(e.at) || 0) > 7 * 86400000 || (arguments[0].now && arguments[0].now - (Number(e.at) || 0) > 7 * 86400000))) { removeFrames.push({ key, id: e.id, session: s.id, bytes: Number(e.frameBytes) || 0, why: 'older than 7 d' }); frames -= Number(e.frameBytes) || 0; e.frameBytes = 0; }\n" + needle), 'by-age');
  const agedLegs = planLegs(aged, '[age copy] ');
  ok(agedLegs.some((x) => !x.c), `CONTROL: a copy that also sweeps by AGE fails the legs (${agedLegs.filter((x) => !x.c).map((x) => x.n.replace('[age copy] ', '')).join(' | ')})`);
  // the census: no age rule in either browser-trace.js; TRACE_RETENTION_MS nowhere in the product
  const pureTxt = src, orchTxt = fs.readFileSync(path.join(REPO, 'src/server/browser-trace.js'), 'utf8');
  // (the stale-PROFILE listing's "unused for N d" is a label on a row nobody deletes by itself — not a record rule)
  const ageRe = /RETENTION_MS|retentionMs|older than/;
  const code = (tx) => tx.replace(/^\s*(\/\/|\*).*$/gm, '');
  const planBody = (() => { const i = pureTxt.indexOf('function traceSizePlan('); return i < 0 ? '' : pureTxt.slice(i, pureTxt.indexOf('\n}\n', i)); })();
  ok(!ageRe.test(code(pureTxt)) && !ageRe.test(code(orchTxt).replace(/RR\.RECORDING_RETENTION_MS/g, '')) && planBody.length > 500 && !/\bnow\b|Date\.now|86400000/.test(code(planBody)), 'no age rule anywhere in src/browser-trace.js or src/server/browser-trace.js — the size plan reads no clock at all (the recordings\' bound is src/browser-recording-retention.js, named from outside)');
  const hits = [];
  const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, n.name); if (n.isDirectory()) walk(f); else if (/\.(m?js)$/.test(n.name) && fs.readFileSync(f, 'utf8').includes('TRACE_RETENTION_MS')) hits.push(path.relative(REPO, f)); } };
  walk(path.join(REPO, 'src'));
  ok(hits.length === 0, `TRACE_RETENTION_MS is gone from src/ (${hits.join(' ') || 'none'})`);
  const RRm = require('../src/browser-recording-retention.js');
  const rp = RRm.recordingRetentionPlan({ groups: [{ key: P1, entries: [{ id: 'a.webm', at: 0, bytes: 1 }, { id: 'b.webm', at: 9 * DAY, bytes: 5 }] }], now: 10 * DAY });
  ok(rp.remove.length === 1 && rp.remove[0].id === 'a.webm' && /older than 7 d/.test(rp.remove[0].why) && RRm.RECORDING_BYTES_PER_PROFILE === 200 * MB, 'the VIDEO recordings keep their own bound, unchanged (7 d / 200 MB, oldest first)');
}

// ═══ ③ the REAL recorder: markers on the lease seam, tags, restart, the sweep ═══
console.log('— ③ the recorder: the markers, the tags, a restart, the sweep over real files');
function world(name) {
  const DATA = path.join(ROOT, name, 'data'); fs.mkdirSync(DATA, { recursive: true });
  const reg = { profiles: [{ id: P1, label: 'work', provider: 'chromium', dir: path.join(ROOT, name, 'p1'), record: false, host: null }, { id: 'bp-000000e1', label: '(ephemeral)', provider: 'chromium', ephemeral: true, owner: { kind: 'conversation', id: KB } }], leases: [], browsers: { [P1]: { state: 'ready', pid: 1 } } };
  const fns = new Set();
  const keeper = {
    profile: (id) => reg.profiles.find((p) => p.id === id) || null, browserOf: (id) => reg.browsers[id] || null,
    leasesOn: (id) => reg.leases.filter((l) => l.profileId === id), _reg: () => reg, isEphemeral: (id) => id === 'bp-000000e1',
    onLease: (fn) => { fns.add(fn); return () => fns.delete(fn); }, addDigest: () => () => { }, list: () => ({ profiles: reg.profiles }),
    holdersFor: () => [],
  };
  const taps = new Map();
  const bridge = { _relays: new Map(), async tap(sessionId, ref, fn) { const key = `${sessionId}|${ref}`; taps.set(key, fn); this._relays.set(key, { key, sessionId, browserKey: sessionId === 's-b' ? KB : KA, target: { kind: ref === P1 ? 'attachment' : 'ephemeral', profileId: ref === P1 ? P1 : null } }); return { ok: true, key, untap: () => taps.delete(key) }; }, broadcastTo() { return 1; } };
  const emit = (ev) => { const out = []; for (const f of fns) out.push(f(ev)); return Promise.all(out.filter(Boolean)); };
  const push = (key, msg) => { const fn = taps.get(key); if (!fn) throw new Error('no tap ' + key); fn(msg, JSON.stringify(msg), bridge._relays.get(key)); };
  return { DATA, reg, keeper, bridge, emit, push, taps };
}
let clock = 2000 * DAY;
const now = () => clock;
const settings = { 'browser.actionTrace': true };
const w1 = world('w1');
const bc1 = [], hook1 = [];
const mk = (w, bc, hook) => R.create({ dataDir: w.DATA, homeDir: path.join(ROOT, 'home'), keeper: w.keeper, bridge: w.bridge, serverSetting: (k) => settings[k], broadcast: (m) => bc.push(m), log: quiet, now, sweepEveryMs: 0, onSession: (m) => hook.push(m), execFileImpl: (c, a, o, cb) => setTimeout(() => cb(null, '', ''), 1) });
const tr1 = mk(w1, bc1, hook1);
tr1.install();
const markersOn = (w, scope) => { try { return fs.readFileSync(path.join(w.DATA, 'browser-trace', scope, BS.MARKERS_FILE), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const jpeg = (tag) => Buffer.from('JPEG-' + tag).toString('base64');
async function click(w, key, id) {
  w.push(key, { type: 'frame', seq: 1, data: jpeg(id + 'b'), metadata: { deviceWidth: 800, deviceHeight: 600 } });
  w.push(key, { type: 'command', id, action: 'click', params: { x: 5, y: 6 } });
  clock += 10; w.push(key, { type: 'result', id, action: 'click', data: {} });
  clock += 500; w.push(key, { type: 'frame', seq: 2, data: jpeg(id + 'a'), metadata: { deviceWidth: 800, deviceHeight: 600 } });
}
{
  // the profile's lease: attach opens, the actions carry it, an idle stop does not end it, a detach does
  w1.reg.leases.push({ profileId: P1, browserKey: KA, sessionId: 's-a' });
  await w1.emit({ kind: 'attach', browserKey: KA, profileId: P1, sessionId: 's-a' });
  let ms = markersOn(w1, P1);
  ok(ms.length === 1 && ms[0].phase === 'start' && BS.isSessionId(ms[0].id) && ms[0].browserKey === KA && ms[0].label === 'work' && ms[0].webuiSessionId === 's-a' && ms[0].reason === 'attach', 'an ATTACH (the lease granted) writes the session\'s start marker — its id, key, profile name, the conversation\'s live id');
  const sid = ms[0].id;
  ok(hook1.length === 1 && hook1[0].id === sid && bc1.some((m) => m.type === 'browser-sessions-updated' && m.marker.id === sid && m.browserKey === KA), 'the wiring\'s hook and every client hear the marker (browser-sessions-updated)');
  await w1.emit({ kind: 'browser-ready', profileId: P1 });
  ok(markersOn(w1, P1).length === 1, 'the browser starting under the open session opens nothing new (one lease, one session)');
  await click(w1, `s-a|${P1}`, 'c1'); await click(w1, `s-a|${P1}`, 'c2');
  const es = tr1.list({ profileId: P1 });
  ok(es.length === 2 && es.every((e) => e.browserSession === sid), 'every action of the run carries the session id (`browserSession`)');
  await w1.emit({ kind: 'browser-stopped', profileId: P1, why: 'idle' });
  await w1.emit({ kind: 'browser-stopped', profileId: P1, why: 'turn-idle' });
  ok(markersOn(w1, P1).length === 1, 'an IDLE stop (idle, turn-idle) ends nothing — the lease lives, so the session does');
  clock += 5 * MIN;
  await w1.emit({ kind: 'detach', browserKey: KA, profileId: P1, sessionId: 's-a' });
  ms = markersOn(w1, P1);
  ok(ms.length === 2 && ms[1].phase === 'end' && ms[1].id === sid && ms[1].reason === 'released' && ms[1].count === 2 && ms[1].durationMs > 5 * MIN, 'a DETACH writes the end: released, its 2 actions, its duration');
  // a person's stop and a switch end it; an action with no open session opens one
  await w1.emit({ kind: 'attach', browserKey: KA, profileId: P1, sessionId: 's-a' });
  await w1.emit({ kind: 'browser-stopped', profileId: P1, why: 'user' });
  await w1.emit({ kind: 'attach', browserKey: KA, profileId: P1, sessionId: 's-a' });
  await w1.emit({ kind: 'browser-stopped', profileId: P1, why: 'switch' });
  ms = markersOn(w1, P1);
  ok(ms.filter((m) => m.phase === 'end').map((m) => m.reason).join() === 'released,stopped,switched', 'a person\'s Stop ends it (stopped), a backend switch too (switched)');
  await tr1.watch({ sessionId: 's-a', profileId: P1 }); // a tap alive with no open session (a pre-session lease)
  await click(w1, `s-a|${P1}`, 'c3');
  ms = markersOn(w1, P1);
  const actionStart = ms[ms.length - 1];
  ok(actionStart.phase === 'start' && actionStart.reason === 'action' && tr1.list({ profileId: P1 }).slice(-1)[0].browserSession === actionStart.id, 'an ACTION with no open session opens one (it is its own session) and is tagged with it');
  // the ephemeral seam: launch / verb open, dropped closes; a helper's key is its own
  await w1.emit({ kind: 'browser-ready', profileId: 'bp-000000e1', ephemeral: true, browserKey: KB, sessionId: 's-b' });
  await w1.emit({ kind: 'verb', profileId: 'bp-000000e1', ephemeral: true, browserKey: KB, sessionId: 's-b' });
  await w1.emit({ kind: 'browser-stopped', profileId: 'bp-000000e1', ephemeral: true, browserKey: KB, sessionId: 's-b', why: 'idle' });
  await w1.emit({ kind: 'lease-dropped', profileId: 'bp-000000e1', ephemeral: true, browserKey: KB, sessionId: 's-b', why: 'session gone' });
  const em = markersOn(w1, 'ephemeral');
  ok(em.map((m) => m.phase + ':' + (m.reason || '')).join() === 'start:launch,end:dropped' && em[0].profileId === null && em[0].ephemeral === true, 'a conversation\'s own browser: its launch opens (a verb on it opens nothing new, its idle stop ends nothing), its dropped lease ends it');
  // trace OFF: nothing new opens, an open one still ends
  settings['browser.actionTrace'] = false;
  const before = markersOn(w1, P1).length;
  await w1.emit({ kind: 'detach', browserKey: KA, profileId: P1, sessionId: 's-a' });
  ok(markersOn(w1, P1).length === before + 1 && markersOn(w1, P1).slice(-1)[0].phase === 'end', 'trace OFF: an open session still gets its end');
  await w1.emit({ kind: 'attach', browserKey: KA, profileId: P1, sessionId: 's-a' });
  ok(markersOn(w1, P1).length === before + 1, '…and nothing new opens (OFF means nothing is recorded)');
  settings['browser.actionTrace'] = true;
  // the readers
  const sl = tr1.sessions({ browserKey: KA });
  ok(sl.length === 4 && sl.every((s) => s.browserKey === KA) && sl[0].startAt >= sl[1].startAt && tr1.sessions({ profileId: null }).length === 1, `the reader: this conversation's sessions newest first (${sl.length}); one scope alone (the ephemeral one: 1)`);
  ok(tr1.sessionEntries(sid).length === 2 && tr1.sessionEntries(sid).every((e) => e.browserSession === sid) && tr1.sessionEntries('bs-deadbeef').length === 0 && tr1.sessionEntries('x').length === 0, '…one session\'s actions, oldest first; an unknown / bad id none');
  const cc = tr1.chatCardsFor(KA);
  ok(cc.length === 8 && cc[0].id === `bs:${sid}:start` && cc[1].id === `bs:${sid}:end` && cc.every((c) => c.browserKey === KA) && tr1.chatCardsFor('nope').length === 0, `the chat cards of the conversation (${cc.length}: start + end of its four sessions, oldest first)`);
}
{
  // A RESTART: a session left open whose lease came back is RE-OPENED (no end); one without a lease ends `restart` at its last action
  const w2 = world('w2');
  const lastAt = clock + 3 * MIN;
  const o1 = BS.markerFor({ phase: 'start', id: 'bs-0000aaaa', browserKey: KA, profileId: P1, at: clock, label: 'work' });
  const o2 = BS.markerFor({ phase: 'start', id: 'bs-0000bbbb', browserKey: KB, profileId: P1, at: clock, label: 'work' });
  const sd = path.join(w2.DATA, 'browser-trace', P1); fs.mkdirSync(sd, { recursive: true });
  fs.writeFileSync(path.join(sd, BS.MARKERS_FILE), JSON.stringify(o1) + '\n' + JSON.stringify(o2) + '\n');
  const ent = T.entryFor({ id: 'tr-00000000bb01', at: lastAt, browserKey: KB, profileId: P1, browserSession: 'bs-0000bbbb', command: { action: 'click', params: { x: 1, y: 1 } }, position: { kind: 'point', x: 1, y: 1 } });
  fs.writeFileSync(path.join(sd, R.INDEX_FILE), JSON.stringify(ent) + '\n');
  w2.reg.leases.push({ profileId: P1, browserKey: KA, sessionId: 's-a' }); // KA's lease came back; KB's did not
  clock += 60 * MIN;
  const bc2 = [], hook2 = [];
  const tr2 = mk(w2, bc2, hook2);
  const b = await tr2.boot();
  const ms = markersOn(w2, P1);
  ok(b.reopened === 1 && b.endedAtBoot === 1, `boot: one session re-opened (its lease came back), one ended (${JSON.stringify({ reopened: b.reopened, ended: b.endedAtBoot })})`);
  ok(ms.length === 3 && ms[2].id === 'bs-0000bbbb' && ms[2].phase === 'end' && ms[2].reason === 'restart' && ms[2].at === lastAt && ms[2].count === 1, 'the one without a lease ends with reason `restart` AT ITS LAST ACTION (never the downtime), its count read back from the index');
  ok(!ms.some((m) => m.id === 'bs-0000aaaa' && m.phase === 'end') && tr2._openSessions.get(BS.sessionKey(KA, P1)).id === 'bs-0000aaaa', 'the re-opened one has no end — and its next action joins it');
  ok(hook2.length === 1 && hook2[0].reason === 'restart', 'the restart end reaches the chat hook too');
}
{
  // THE SWEEP over real files: a 64 MB setting, the oldest session's frames go, every index line stays, the entry stamped
  const w3 = world('w3');
  const sd = path.join(w3.DATA, 'browser-trace', P1); fs.mkdirSync(sd, { recursive: true });
  const lines = [], marks = [];
  const mkE = (id, sidx, at, bytes) => { const e = T.entryFor({ id, at, browserKey: KA, profileId: P1, browserSession: sidx, command: { action: 'click', params: { x: 1, y: 1 } }, position: { kind: 'point', x: 1, y: 1 }, before: { file: id + '-before.jpg', bytes, w: 10, h: 10 }, after: { file: id + '-after.jpg', bytes, w: 10, h: 10 } }); fs.writeFileSync(path.join(sd, id + '-before.jpg'), 'b'); fs.writeFileSync(path.join(sd, id + '-after.jpg'), 'a'); fs.writeFileSync(path.join(sd, id + '.json'), JSON.stringify(e)); lines.push(JSON.stringify(e)); };
  marks.push(BS.markerFor({ phase: 'start', id: 'bs-00000011', browserKey: KA, profileId: P1, at: 100 }), BS.markerFor({ phase: 'end', id: 'bs-00000011', browserKey: KA, profileId: P1, at: 200, count: 2, durationMs: 100, reason: 'released' }));
  marks.push(BS.markerFor({ phase: 'start', id: 'bs-00000022', browserKey: KA, profileId: P1, at: 300 }), BS.markerFor({ phase: 'end', id: 'bs-00000022', browserKey: KA, profileId: P1, at: 400, count: 1, durationMs: 100, reason: 'released' }));
  mkE('tr-000000001101', 'bs-00000011', 110, 20 * MB); mkE('tr-000000001102', 'bs-00000011', 120, 20 * MB); mkE('tr-000000002201', 'bs-00000022', 310, 10 * MB);
  fs.writeFileSync(path.join(sd, R.INDEX_FILE), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(sd, BS.MARKERS_FILE), marks.map((m) => JSON.stringify(m)).join('\n') + '\n');
  settings['browser.traceBytesPerProfile'] = 64; // MB: 100 MB of frames ⇒ the oldest session (80 MB) goes
  const legs = (RR2) => {
    const bc3 = [];
    const tr3 = RR2.create({ dataDir: w3.DATA, homeDir: path.join(ROOT, 'home'), keeper: w3.keeper, bridge: w3.bridge, serverSetting: (k) => settings[k], broadcast: (m) => bc3.push(m), log: quiet, now, sweepEveryMs: 0 });
    const sw = tr3.sweep();
    const idx = fs.readFileSync(path.join(sd, R.INDEX_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const e1 = idx.find((e) => e.id === 'tr-000000001101');
    return [
      { c: sw.removed === 2 && sw.plan.removeFrames.map((r) => r.id).join() === 'tr-000000001101,tr-000000001102', n: 'the 64 MB setting: the OLDEST session\'s two actions lose their frames' },
      { c: idx.length === 3 && ['tr-000000001101', 'tr-000000001102', 'tr-000000002201'].every((id) => idx.some((e) => e.id === id)), n: 'EVERY action list stays — the index keeps its three lines' },
      { c: !fs.existsSync(path.join(sd, 'tr-000000001101-before.jpg')) && !fs.existsSync(path.join(sd, 'tr-000000001101-after.jpg')) && fs.existsSync(path.join(sd, 'tr-000000002201-after.jpg')), n: 'the frame FILES of the old session are unlinked; the newer session\'s stay' },
      { c: !!(e1 && e1.framesRemoved && e1.framesRemoved.why === 'size' && e1.framesRemoved.limit === 64 * MB && e1.before === null && e1.after === null && e1.action === 'click'), n: 'the swept entry keeps what the agent did and says its frames went to the size limit' },
      { c: !!(tr3.sessions({ profileId: P1 }).find((s) => s.id === 'bs-00000011') || {}).framesRemoved && BS.replayEmpty({ sessions: tr3.sessions({ profileId: P1 }), session: tr3.sessions({ profileId: P1 }).find((s) => s.id === 'bs-00000011'), entries: tr3.sessionEntries('bs-00000011') }) === 'frames-removed', n: 'the replay of that session says so by name (frames-removed), its list intact' },
      { c: bc3.some((m) => m.type === 'browser-housekeeping-updated' && m.sweep && m.sweep.framesRemoved === 2 && m.sweep.limit === 64 * MB), n: 'the sweep is broadcast with what it removed and the limit' },
    ];
  };
  // CONTROL (b) FIRST, on a copy of the files: a recorder whose sweep DROPS the lists must fail the legs
  const osrc = fs.readFileSync(path.join(REPO, 'src/server/browser-trace.js'), 'utf8');
  const needle = '      rewriteIndex(sc, list);\n    }\n    // recordings: their own bound';
  ok(osrc.includes(needle), 'the list-dropping control\'s anchor is in the sweep');
  const snap = fs.mkdtempSync(path.join(ROOT, 'snap-'));
  fs.cpSync(sd, snap, { recursive: true });
  const dropper = M.load('src/server/browser-trace.js', osrc.replace(needle, '      rewriteIndex(sc, list.filter((e) => !gone.has(e.id)));\n    }\n    // recordings: their own bound'), 'drops-lists');
  const bad = legs(dropper);
  ok(bad.some((x) => !x.c), `CONTROL: a sweep that DROPS the swept actions' lists fails (${bad.filter((x) => !x.c).map((x) => x.n).join(' | ')})`);
  fs.rmSync(sd, { recursive: true, force: true }); fs.cpSync(snap, sd, { recursive: true });
  for (const x of legs(R)) ok(x.c, x.n);
  delete settings['browser.traceBytesPerProfile'];
  const hk = await mk(w3, [], []).housekeeping();
  const row = hk.profiles.find((r) => r.id === P1);
  ok(row && row.trace.limit === 1024 * MB && row.trace.used > 0 && row.trace.used === row.trace.frameBytes + row.trace.listBytes && hk.limits.bytesPerProfile === 1024 * MB, 'the panel row says what the records use against the limit ({used} of {size})');
}

// ═══ ④ the normalizers: by time, and the live gate ═══════════════════════════
console.log('— ④ the chat cards in the normalizers: by time on a rebuild, gated live');
{
  const iso = (ms) => new Date(ms).toISOString();
  const t0 = Date.UTC(2026, 8, 27, 10, 0, 0);
  const rec = (i, role, at, text) => (role === 'user' ? { type: 'user', uuid: `u-000${i}`, timestamp: iso(at), message: { role: 'user', content: text } } : { type: 'assistant', uuid: `a-000${i}`, timestamp: iso(at), message: { id: `msg_${i}`, role: 'assistant', content: [{ type: 'text', text }] } });
  const records = [rec(1, 'user', t0, 'open the site'), rec(2, 'assistant', t0 + 1000, 'opening it'), rec(3, 'assistant', t0 + 60000, 'done with it'), rec(4, 'user', t0 + 120000, 'thanks')];
  const cards = [{ id: 'bs:bs-00000001:end', phase: 'end', at: t0 + 90000, session: 'bs-00000001', browserKey: KA, durationMs: 88000, count: 3, reason: 'released' }, { id: 'bs:bs-00000001:start', phase: 'start', at: t0 + 2000, session: 'bs-00000001', browserKey: KA, label: 'work', profileId: P1 }];
  const mm = N.createMessageManager('claude', 'sess-x');
  await N.convertWithCards(mm, records, cards);
  const shape = mm.messages.map((m) => (m.noticeKind === 'browser-session' ? `[${m.content[0].phase}]` : m.role));
  ok(shape.join(' ') === 'user assistant [start] assistant [end] user', `the cards land BY TIME between the transcript's records (${shape.join(' ')})`);
  const startMsg = mm.messages.find((m) => m.noticeKind === 'browser-session');
  ok(startMsg.id === 'sess-x:bs:bs-00000001:start' && startMsg.role === 'system' && startMsg.ts === t0 + 2000 && startMsg.content[0].type === 'browser_session' && startMsg.content[0].label === 'work', 'a card is a SYSTEM message (never agent text, never a turn), its id the session\'s own, its instant the marker\'s');
  ok(N.placeBrowserCard(mm, cards[1]) === null && mm.messages.filter((m) => m.noticeKind === 'browser-session').length === 2, 'placing the same card again is a no-op (one card per id)');
  const mm0 = N.createMessageManager('claude', 'sess-y');
  await N.convertWithCards(mm0, [{ type: 'system', subtype: 'init', session_id: 'x' }], cards);
  ok(mm0.messages.filter((m) => m.noticeKind === 'browser-session').map((m) => m.content[0].phase).join() === 'start,end', 'records without an instant (a stdout ring) never move a card — the cards follow them, oldest first');
  const cx = N.createMessageManager('codex', 'sess-c');
  await N.convertWithCards(cx, [], cards);
  ok(cx.messages.length === 2 && cx.messages[0].content[0].phase === 'start', 'the codex normalizer takes the same cards (every harness: one writer)');
  // the live gate
  const ops = [];
  const live = { _normalizer: N.createMessageManager('claude', 'sess-l'), _historyLoaded: false };
  live._normalizer.onOp((o) => ops.push(o));
  ok(N.feedBrowserCard(live, cards[1]) === false && live._normalizer.messages.length === 0, 'before the first attach nothing is written (that attach\'s rebuild derives it from the marker)');
  // a rebuild that READS the marker (the card source) while the SAME card is fed live into its queue ⇒ ONE card
  N.setBrowserCardSource(() => [cards[1]]);
  const pr = N.rebuildHistory(live, 'sess-l', records, {});
  ok(N.feedBrowserCard(live, cards[1]) === true && live._rebuildQueue.length === 1 && live._rebuildQueue[0].kind === 'bcard', 'while a rebuild runs the live card waits in its queue');
  await pr;
  N.setBrowserCardSource(null);
  const n1 = live._normalizer.messages.filter((m) => m.noticeKind === 'browser-session').length;
  ok(n1 === 1 && live._historyLoaded === true, `the rebuild placed it from the markers and the drained queue did not draw it again (${n1} card)`);
  const ops2 = [];
  live._normalizer.onOp((o) => ops2.push(o));
  ok(N.feedBrowserCard(live, cards[1]) === false && N.feedBrowserCard(live, cards[0]) === true && ops2.length === 1 && ops2[0].op === 'create' && ops2[0].message.content[0].phase === 'end', 'once loaded: the end card is a live `create` op; the start card the rebuild already placed is not drawn twice');
  const src = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  ok(/await convertWithCards\(mm, sm\.raw\(\), browserCardsFor\(\{ conversationId: backendSessionId \}\)\)/.test(src), 'a view-only history (a stopped conversation) places its cards the same way — wiring pin in ws-handler');
  // the tool card's window ends at the NEXT MESSAGE — a session card lands inside the call that started the browser, so
  // ending there cut off the call's own actions (test-browser-live's lane H leg went red on it: the navigation 3 s after)
  const tv = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  ok(/n\.classList\.contains\('chat-browser-session'\) \? 0 : Number\(n\.dataset && n\.dataset\.ts\)/.test(tv), 'a tool card\'s actions window skips a browser-session card (it is not the next message) — wiring pin in createCardTraceLoader.windowOf');
  const wir = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/N\.setBrowserCardSource\(/.test(wir) && /onSession\s*\}\)/.test(wir) && /N\.feedBrowserCard\(s, cardOfMarker\(m\)\)/.test(wir), 'the wiring: the recorder\'s hook feeds the live card, the card source reads the markers (bindings for a stopped one)');
}

// ═══ ⑤ the route, in-process ═══════════════════════════════════════════════════
console.log('— ⑤ GET /api/browser/sessions');
{
  const { router, setup } = require('../src/routes/browser-trace.js');
  const activeSessions = new Map([['s-a', { _browserKey: KA }]]);
  setup({ keeper: w1.keeper, trace: tr1, activeSessions, bindings: { lookup: (c) => (c === 'conv-a' ? KA : '') } });
  const app = express(); app.use(express.json()); app.use(router);
  const srv = http.createServer(app); servers.push(srv);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const get = async (q) => { const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/browser/sessions${q}`); return { status: r.status, body: await r.json() }; };
  const a = await get('?sessionId=s-a');
  ok(a.status === 200 && a.body.sessions.length === 4 && a.body.browserKey === KA && a.body.keyFrom === 'session' && a.body.limit === 1024 * MB && a.body.traceOn === true && !('entries' in a.body), 'by a live session: its conversation\'s sessions, the limit, no actions unless asked');
  const c = await get('?conversation=conv-a');
  ok(c.status === 200 && c.body.sessions.length === 4 && c.body.keyFrom === 'conversation', 'by a STOPPED conversation\'s id, through the bindings store');
  ok((await get(`?browserKey=${KA}`)).body.keyFrom === 'given' && (await get('?conversation=conv-nope')).body.sessions.length === 0, 'by a key given outright; an unknown conversation is EMPTY, never every session');
  const one = a.body.sessions.find((s) => s.count === 2);
  const s = await get(`?sessionId=s-a&session=${one.id}`);
  ok(s.status === 200 && s.body.entries.length === 2 && s.body.entries.every((e) => e.browserSession === one.id) && s.body.session.id === one.id, '`session=` adds that session\'s actions (oldest first)');
  ok(s.body.entriesTotal === 2, 'a session under the cap: `entriesTotal` equals the actions carried (no cut to name)');
  // verifier 2026-09-28: a long session's answer carries the NEWEST 1 000 actions and NAMES the cut — the window used to say
  // "Actions (1000)" under a session row saying 5 000, a silent cut
  {
    const long = markersOn(w1, P1).find((m) => m.phase === 'start' && m.id === one.id);
    const scopeDir = path.join(w1.DATA, 'browser-trace', P1);
    const t1 = Number(long.at) + 1;
    const extra = [];
    for (let i = 0; i < 1198; i++) extra.push(JSON.stringify(T.entryFor({ id: T.mintEntryId('c0ffee' + String(i).padStart(6, '0')), at: t1 + i, sessionId: 's-a', browserKey: KA, profileId: P1, browserSession: one.id, command: { action: 'click', params: { x: i, y: 1 } }, result: { ok: true }, position: { kind: 'point', x: i, y: 1 } })));
    fs.appendFileSync(path.join(scopeDir, 'index.ndjson'), extra.join('\n') + '\n');
    const tr5 = mk(w1, [], []); // a fresh recorder reads the index again
    setup({ keeper: w1.keeper, trace: tr5, activeSessions, bindings: { lookup: (c) => (c === 'conv-a' ? KA : '') } });
    const l = await get(`?sessionId=s-a&session=${one.id}`);
    ok(l.status === 200 && l.body.entries.length === 1000 && l.body.entriesTotal === 1200 && l.body.entries[999].at === Math.max(...l.body.entries.map((e) => e.at)) && l.body.entries.every((e) => e.browserSession === one.id), `a 1 200-action session: the NEWEST 1 000 ride the answer and \`entriesTotal\` names the whole (${l.body.entries.length} of ${l.body.entriesTotal})`);
    setup({ keeper: w1.keeper, trace: tr1, activeSessions, bindings: { lookup: (c) => (c === 'conv-a' ? KA : '') } });
  }
  const p = await get(`?profile=${P1}`);
  ok(p.status === 200 && p.body.sessions.length === 4 && (await get('?profile=ephemeral')).body.sessions.length === 1, 'by profile alone: every conversation\'s sessions on it (the Agent browser panel\'s Replay…)');
  ok((await get('')).status === 400 && (await get('?session=bs-1&sessionId=s-a')).status === 400 && (await get('?browserKey=nope')).status === 400 && (await get('?sessionId=s-a&host=h1')).body.code === 'unsupported-host', 'nothing asked / a bad session id / a bad key are 400; a host is refused by name');
  const auth = fs.readFileSync(path.join(REPO, 'src/auth.js'), 'utf8');
  ok(/if \(p\.startsWith\('\/api\/agent\/'\)\) return next\(\);/.test(auth) && !fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8').includes('/api/agent/browser/sessions'), 'cookie only: the route is not under /api/agent/ (the only prefix the bearer tokens pass) and the agent routes got nothing new');
}

// ═══ ⑥ the replay model ═══════════════════════════════════════════════════════
console.log('— ⑥ the replay model');
{
  let st = { index: 0, playing: false };
  st = BS.replayKey(st, 'ArrowLeft', 5); ok(st.index === 0 && !st.playing, '← at the first action stays');
  st = BS.replayKey(st, 'ArrowRight', 5); st = BS.replayKey(st, 'ArrowRight', 5); ok(st.index === 2, '→ steps');
  st = BS.replayKey(st, 'End', 5); ok(st.index === 4, 'End = the last');
  st = BS.replayKey(st, 'Home', 5); ok(st.index === 0, 'Home = the first');
  st = BS.replayKey(st, ' ', 5); ok(st.playing && st.index === 0, 'Space plays');
  const seen = [st.index];
  for (let i = 0; i < 10 && st.playing; i++) { st = BS.playTick(st, 5); seen.push(st.index); }
  ok(seen.join() === '0,1,2,3,4' && st.playing === false, `play steps one action at a time and STOPS at the last (${seen.join(' ')}) — ${BS.PLAY_STEP_MS} ms a step`);
  st = BS.replayKey(st, ' ', 5); ok(st.playing && st.index === 0, 'Space at the last action plays it again from the start');
  st = BS.replayKey(st, ' ', 5); ok(!st.playing, 'Space while playing pauses');
  st = BS.replayKey({ index: 3, playing: true }, 'ArrowLeft', 5); ok(!st.playing && st.index === 2, 'a step key stops the play');
  ok(!BS.replayKey({ index: 0 }, ' ', 1).playing && !BS.replayKey({ index: 0 }, ' ', 0).playing, 'one action (or none) has nothing to play');
  const ss = [{ id: 'bs-00000003', startAt: 300, endAt: 400 }, { id: 'bs-00000002', startAt: 200, endAt: 250 }, { id: 'bs-00000001', startAt: 100, endAt: 150 }];
  ok(BS.pickSession(ss).id === 'bs-00000003' && BS.pickSession(ss, 'bs-00000001').id === 'bs-00000001' && BS.pickSession(ss, 'bs-0000000f', 210).id === 'bs-00000002' && BS.pickSession([], 'x') === null, 'the session opened: the one asked for, else the one holding `at`, else the newest');
  ok(BS.pickIndex([{ at: 10 }, { at: 20 }, { at: 30 }], 25) === 1 && BS.pickIndex([{ at: 10 }], null) === 0 && BS.pickIndex([], 5) === 0, 'the action opened: the last one at or before `at`');
  const fr = (id, x = {}) => ({ id, at: 1, before: { file: id + '-b.jpg' }, after: { file: id + '-a.jpg' }, ...x });
  const gone = (id) => ({ id, at: 1, before: null, after: null, framesRemoved: { why: 'size' } });
  ok(BS.replayEmpty({ sessions: [] }) === 'no-sessions' && BS.replayEmpty({ sessions: [], traceOn: false }) === 'trace-off', 'no sessions ⇒ "No browser sessions recorded…", the trace off ⇒ "Action trace is off…"');
  ok(BS.replayEmpty({ sessions: ss, session: { id: 'x', count: 0 }, entries: [] }) === 'no-actions' && BS.replayEmpty({ sessions: ss, session: { id: 'x', count: 0 }, entries: [], traceOn: false }) === 'trace-off' && BS.replayEmpty({ sessions: ss, session: { id: 'x', count: 3 }, entries: [] }) === null, 'a session with no actions says so (or that the trace was off); a list still coming says nothing');
  ok(BS.replayEmpty({ sessions: ss, session: { id: 'x', count: 2 }, entries: [gone('a'), gone('b')] }) === 'frames-removed' && BS.replayEmpty({ sessions: ss, session: { id: 'x', count: 2 }, entries: [gone('a'), fr('b')] }) === null, 'every frame swept ⇒ the named state; some left ⇒ the picture');
  ok(BS.frameState(fr('a'), 'after') === 'frame' && BS.frameState(gone('a'), 'after') === 'removed' && BS.frameState({ id: 'a', before: null, after: null }, 'before') === 'none', 'one action\'s frame: shown / removed by the size limit / never taken');
}

// ═══ ⑦ the words ═══════════════════════════════════════════════════════════════
console.log('— ⑦ the words (en through the module; zh + ja in the dictionaries)');
{
  const W = await import('../src/lib/browser-session-words.js');
  ok(W.durationText(42000) === '42 sec' && W.durationText(3 * MIN) === '3 min' && W.durationText(65 * MIN) === '1 h 5 min' && W.durationText(120 * MIN) === '2 h', 'durations: 42 sec · 3 min · 1 h 5 min · 2 h');
  ok(W.sizeText(1024 * MB) === '1 GB' && W.sizeText(64 * MB) === '64 MB' && W.sizeText(1536 * MB) === '1.5 GB', 'sizes: 1 GB · 64 MB · 1.5 GB');
  ok(/^Browser session started · work · /.test(W.startCardText({ label: 'work', at: Date.now() })) && /^Browser session started · a browser of its own · /.test(W.startCardText({ at: Date.now() })), 'the start card: "Browser session started · {profile} · {time}", an ephemeral one "a browser of its own"');
  // the end card says WHY it ended (the naive-user verifier, 2026-09-28), one word per END_REASONS entry; Replay only with actions
  const REASONS = { released: 'the conversation stopped using this browser', dropped: 'the conversation stopped', stopped: 'the browser was stopped', switched: 'the browser was switched', restart: 'VibeSpace restarted' };
  ok(BS.END_REASONS.every((r) => W.endReasonText(r) === REASONS[r]) && Object.keys(REASONS).length === BS.END_REASONS.length && W.endReasonText('zz') === '' && W.endCardText({ durationMs: 125000, count: 4, reason: 'switched' }) === 'Browser session ended · 2 min · 4 actions · the browser was switched',
    'the end card names why the session ended — every reason of the closed set has its words, an unknown one says nothing');
  ok(W.endCardReplays({ count: 3 }) === true && W.endCardReplays({ count: 0 }) === false && W.endCardReplays({}) === false, 'an end card offers Replay only when the agent acted (a 0-action replay could only say "the agent did not act")');
  const chatR = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8');
  ok(/if \(!endCardReplays\(b\)\) return el;/.test(chatR), 'WIRING: the chat\'s end card asks endCardReplays before it draws Replay');
  ok(W.endCardText({ durationMs: 125000, count: 4 }) === 'Browser session ended · 2 min · 4 actions' && W.endCardText({ durationMs: 5000, count: 1 }) === 'Browser session ended · 5 sec · 1 action', 'the end card: "Browser session ended · {duration} · {n} actions" (one action singular)');
  ok(W.retentionText(1024 * MB) === "Frames are kept until this profile's records reach 1 GB; the oldest are removed first." && W.framesGoneText(1024 * MB) === 'Frames of this session were removed to stay under the 1 GB limit; the action list is kept', 'the retention sentence and the swept-frames state, word for word');
  ok(W.emptyText('no-sessions') === 'No browser sessions recorded for this conversation' && W.emptyText('trace-off') === 'Action trace is off — Settings → Agent browser' && W.replayTitle('Fix login') === 'Browser replay · Fix login' && /^Session 3 · started /.test(W.dividerText(3, Date.now())), 'the empty states, the title, the divider');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const OWNER = {
    'Browser session started · {profile} · {time}': ['浏览器会话开始 · {profile} · {time}', 'ブラウザセッション開始 · {profile} · {time}'],
    'Browser session ended · {duration} · {n} actions': ['浏览器会话结束 · 用时 {duration} · {n} 步操作', 'ブラウザセッション終了 · {duration} · {n} 操作'],
    'a browser of its own': ['自己的临时浏览器', '専用ブラウザ'],
    'Replay': ['回放', '再生'],
    'Session {k} · started {time}': ['第 {k} 次会话 · {time} 开始', null],
    'Browser replay · {name}': ['浏览回放 · {name}', null],
    'No browser sessions recorded for this conversation': ['这个会话还没有浏览记录', null],
    'Frames of this session were removed to stay under the {size} limit; the action list is kept': ['为了不超过 {size} 的上限，这次会话的截图已被清理；操作列表保留', null],
    // ja says スクリーンショット like zh's 截图 (the naive-user verifier, 2026-09-28: フレーム is jargon)
    "Frames are kept until this profile's records reach {size}; the oldest are removed first.": [null, 'スクリーンショットはこのプロファイルの記録が {size} に達するまで保存され、古いものから削除されます。'],
    'frames removed': ['截图已清理', 'スクリーンショット削除済み'],
  };
  const bad = Object.entries(OWNER).filter(([k, [z, j]]) => (z && zh[k] !== z) || (j && ja[k] !== j) || !zh[k] || !ja[k]);
  ok(bad.length === 0, 'the owner\'s own words in zh and ja (the spec\'s table)', bad.map(([k]) => k));
  const words = fs.readFileSync(path.join(REPO, 'src/lib/browser-session-words.js'), 'utf8') + fs.readFileSync(path.join(REPO, 'src/lib/browser-replay-window.js'), 'utf8');
  const keys = [...words.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  const missing = keys.filter((k) => !zh[k] || !ja[k]);
  ok(keys.length > 30 && missing.length === 0, `every word of the session surfaces is in zh AND ja (${keys.length} keys)`, missing);
  const retired = ['Frames of a logged-in page are secrets: kept {days} days or {mb} MB per profile, whichever comes first, then removed by the sweep.', 'Traces and recordings are kept {days} days or {mb} MB per profile, whichever comes first; frames of a logged-in page are secrets. Nothing here deletes a profile by itself: setting one aside moves its directory beside itself, and only your click on a set-aside row deletes it.'];
  ok(retired.every((k) => !zh[k] && !ja[k]), 'the retired "kept 7 days" sentences are gone from both dictionaries');
}

for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

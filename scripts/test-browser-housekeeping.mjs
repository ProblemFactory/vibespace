#!/usr/bin/env node
// AGENT BROWSER P5 — THE ACTION TRACE, THE PER-PROFILE SCREENCAST AND THE
// HOUSEKEEPING (docs/design-agent-browser-v2.md §4.5 / §6.4 / §7.1 / §8 step 3,
// D7 / D8 / D35). FAST.
//
//   ① PURE (src/browser-trace.js): the action table (an observation — get /
//      snapshot / launch — is never traced), the redaction (a fill's value and
//      a type's text become «N chars»), the command text, the position kinds,
//      the after-frame pick matrix (settled / latest / same / wait), the
//      retention PLAN (age first, then size, every removal naming its rule),
//      the recording gate refusing BY NAME (off / not ours / not local / floor),
//      the sweep SCOPE = exactly the provider rows with `ownsDir: true` with
//      the cloud:* / local-window / cdp / remote records refused `not_ours` as
//      the negative control, the housekeeping verdict that never answers
//      "delete" and names the in-flight grace with its age, forget refused while
//      leased or running, the orphan candidates and the path verdict, the
//      overlay geometry, the tool card's window + command gate.
//   ② THE REAL RECORDER (src/server/browser-trace.js) over a fake bridge and a
//      stub keeper: boot arms one tap per live lease; a traced `command` takes
//      the LAST frame as the before-picture; the after-frame is the first
//      settled one (or the latest by the deadline, or the before-frame itself
//      when nothing repainted); the element box is asked through the runtime
//      as `get box <selector>` under the lease's own session; the entry lands
//      as 0600 files + an index line + a broadcast + a live-view record; the
//      fill's value is absent from EVERY byte on disk; tap-end finalizes what
//      is pending; the lease seam arms and disarms; the setting gates; the
//      sweep removes by age and by size and rewrites the index; recording
//      starts/stops through the lease's session and is refused below the floor.
//   ③ HOUSEKEEPING on real directories: the panel's rows with their state and
//      why (a cloud row is not-ours), the orphans (a marker dir listed, a
//      registered one and a marker-less one not), forget = RENAME beside +
//      ledger row BEFORE the record goes (refused while leased), orphans
//      adopted / forgotten, the ONE permanent deletion refusing anything that is
//      not a `.forgotten-` directory under the base.
//   ④ THE ROUTES in-process: session-id OR browser-key match, the frame served
//      image/jpeg + nosniff, PATCH's editable fields (an unknown one refused by
//      name), housekeeping / sweep / forget / forgotten-delete, host refused.
//   ⑤ THE REAL KEEPER'S SEAM over the fake `agent-browser`: attach ⇒ the
//      recorder's tap is armed through `onLease`; updateProfile ⇒
//      `profile-updated` with was/now; detach ⇒ the tap is gone; the digest
//      hook is merged into `list()`.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const T = require('../src/browser-trace.js');
const B = require('../src/browser-profiles.js');
const R = require('../src/server/browser-trace.js');
const K = require('../src/server/browser-keeper.js');
const F = require('../src/browser-facts.js');
const express = require('express');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 4000, every = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };
const quiet = { log() { }, warn() { }, error() { } };

// ── scratch world ──
const ROOT = scratch('browser-housekeeping');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const NODE_DIR = path.dirname(process.execPath);
const PATH_ENV = `${BIN}:${NODE_DIR}:${process.env.PATH || '/usr/bin:/bin'}`;
process.env.PATH = PATH_ENV;
// The fake agent-browser (the takeover suite's: a daemon that is a real `sleep`).
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s }) + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19222/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'get' && b === 'box') { out({ success: true, data: { x: 10, y: 20, width: 100, height: 30 } }); process.exit(0); }
if (a === 'record') { fs.appendFileSync(path.join(st, 'records.log'), JSON.stringify({ argv, ns, session: process.env.AGENT_BROWSER_SESSION || null }) + '\\n'); out({ success: true, data: {} }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const launches = () => { try { return fs.readFileSync(path.join(AB_STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const spawnedPids = new Set();
function reapAll() { for (const l of launches()) if (l.pid) spawnedPids.add(l.pid); for (const pid of spawnedPids) { try { process.kill(pid, 'SIGKILL'); } catch { } } }
const servers = [];
let realKeeper = null;
function cleanup() { try { realKeeper?.shutdown?.(); } catch { } reapAll(); for (const s of servers) { try { s.close(); } catch { } } fs.rmSync(ROOT, { recursive: true, force: true }); }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

const KEY_A = 'bk-0000000a', KEY_B = 'bk-0000000b';
let clock = Date.now(); // the injected clock starts at the real one: the directories the suite creates carry REAL mtimes, and their age is measured against this clock (no calendar date is pinned)
const now = () => clock;
const jpeg = (tag) => Buffer.from('JPEG-BYTES-' + tag).toString('base64');

// ═══ ① PURE ═══════════════════════════════════════════════════════════════
console.log('— ① the trace model, the retention plan, the recording gate, the sweep scope (PURE)');
{
  ok(T.classifyAction('click') === 'target' && T.classifyAction('press') === 'keys' && T.classifyAction('mousemove') === 'point' && T.classifyAction('scroll') === 'scroll' && T.classifyAction('navigate') === 'navigation', 'the action table names the kind of position each traced action records');
  ok(T.classifyAction('get') === null && T.classifyAction('snapshot') === null && T.classifyAction('launch') === null && T.classifyAction('boundingbox') === null && T.classifyAction('screenshot') === null, 'an OBSERVATION (get / snapshot / launch / boundingbox / screenshot) is never traced');
  ok(T.isTracedCommand({ type: 'command', id: 'c1', action: 'click' }) && !T.isTracedCommand({ type: 'command', id: 'c2', action: 'launch' }) && !T.isTracedCommand({ type: 'result', id: 'c1', action: 'click' }) && !T.isTracedCommand({ type: 'command', action: 'click' }), 'a traced command is a `command` record with an id and a traced action');
  const rf = T.redactParams('fill', { selector: '#pw', value: 'hunter2', id: 'x', action: 'fill' });
  ok(rf.value === '«7 chars»' && rf.selector === '#pw' && rf.id === undefined && rf.action === undefined, "a fill's value is replaced by its length (the §3.7 audit rule applies to the trace)");
  ok(T.redactParams('type', { text: 'こんにちは' }).text === '«5 chars»', "a type's text too — counted in code points");
  ok(T.redactParams('upload', { files: ['/home/u/secret-dir/report.pdf'] }).files[0] === 'report.pdf', 'an upload keeps the file NAME, never its path');
  // 2026-09-21 (the verifier's finding): a secret typed key-by-key or chosen from a list was stored verbatim
  ok(T.redactParams('press', { key: 'h' }).key === '«1 key»' && T.redactParams('keydown', { key: 'ü' }).key === '«1 key»' && T.redactParams('keyup', { key: '7' }).key === '«1 key»', 'a single-character press / keydown / keyup is «1 key» — a secret typed one key at a time leaves no characters behind');
  ok(T.redactParams('press', { key: 'Enter' }).key === 'Enter' && T.redactParams('press', { key: 'Control+a' }).key === 'Control+a', 'a NAMED key or chord stays (a gesture, not content)');
  ok(T.redactParams('select', { selector: '#plan', value: 'gold-tier' }).value === '«9 chars»' && T.redactParams('select', { selector: '#plan', values: ['a', 'b'] }).values === '«2 values»' && T.redactParams('select', { selector: '#plan', label: 'Secret option' }).label === '«13 chars»' && T.redactParams('select', { selector: '#plan', value: 'x' }).selector === '#plan', 'a select\'s value / values / label are lengths; its selector stays');
  ok(T.commandText('press', T.redactParams('press', { key: 'h' })) === 'agent-browser press «1 key»' || /«1 key»/.test(T.commandText('press', T.redactParams('press', { key: 'h' }))), 'the command text is rebuilt from the REDACTED params');
  ok(T.commandText('fill', rf) === 'agent-browser fill #pw «7 chars»' && T.commandText('click', { selector: '@e1' }) === 'agent-browser click @e1' && T.commandText('mouseclick', { x: 12, y: 34 }) === 'agent-browser mouseclick 12 34', 'the command text is rebuilt from the REDACTED params');
  ok(T.positionOf({ kind: 'point', params: { x: 3, y: 4 } }).kind === 'point' && T.positionOf({ kind: 'point', params: {} }).kind === 'input', 'a point needs coordinates; without them the position says so');
  const pb = T.positionOf({ kind: 'target', params: { selector: '#go' }, box: { x: 1, y: 2, width: 3, height: 4 } });
  ok(pb.kind === 'box' && pb.selector === '#go' && pb.box.width === 3, 'a target with a resolved box is a box');
  ok(T.positionOf({ kind: 'target', params: { selector: '#go' }, boxWhy: 'timed out' }).why === 'timed out' && T.positionOf({ kind: 'target', params: { selector: '#go' } }).box === null, 'a target without one says why');
  ok(T.positionOf({ kind: 'keys', params: { key: 'Enter' } }).keys === 'Enter' && T.positionOf({ kind: 'navigation', params: { url: 'https://x.test' } }).url === 'https://x.test' && T.positionOf({ kind: 'scroll', params: { direction: 'up', amount: 300 } }).amount === 300, 'keys / navigation / scroll positions');
  ok(T.resultOk({ success: false, data: { ok: true } }) === true && T.resultOk({ success: true, error: 'boom' }) === false && T.resultError({ error: { message: 'x' } }) === 'x' && T.resultOk(null) === null, 'a result is judged by its ERROR, never by `success` (false on every 0.32.0 result)');
  // the after-frame pick
  const frames = [{ at: 1100, seq: 2 }, { at: 1450, seq: 3 }];
  ok(T.afterFramePick({ resultAt: 1000, frames, beforeSeq: 1, now: 1460 }).pick === 'frame' && T.afterFramePick({ resultAt: 1000, frames, beforeSeq: 1, now: 1460 }).index === 1, 'the after-frame is the first one ≥ settle after the result');
  ok(T.afterFramePick({ resultAt: 1000, frames: [frames[0]], beforeSeq: 1, now: 1300 }).pick === 'wait', '…before the deadline with no settled frame: wait');
  const late = T.afterFramePick({ resultAt: 1000, frames: [frames[0]], beforeSeq: 1, now: 2600 });
  ok(late.pick === 'latest' && late.index === 0 && late.same === false, '…past the deadline: the latest frame seen');
  const same = T.afterFramePick({ resultAt: 1000, frames: [{ at: 1100, seq: 1 }], beforeSeq: 1, now: 2600 });
  ok(same.pick === 'latest' && same.same === true && T.afterFramePick({ resultAt: 1000, frames: [], now: 2600 }).same === true, '…and a page that did not repaint is marked `same`');
  const e = T.entryFor({ id: 'tr-0123456789ab', at: 5, sessionId: 's1', browserKey: KEY_A, profileId: 'bp-00000001', command: { action: 'fill', params: { selector: '#pw', value: 'hunter2' } }, result: { duration_ms: 12 }, position: pb });
  ok(e.scope === 'bp-00000001' && e.kind === 'target' && e.params.value === '«7 chars»' && !JSON.stringify(e).includes('hunter2') && e.durationMs === 12 && e.ok === true, 'the entry never carries the fill value; it carries the scope, the kind, the duration');
  ok(T.entryFor({ id: 'tr-0123456789ab', at: 5, command: { action: 'click', params: {} } }).scope === T.EPHEMERAL_SCOPE, 'no profile ⇒ the ephemeral scope');
  ok(T.isEntryId('tr-0123456789ab') && !T.isEntryId('tr-01') && !T.isEntryId('../x') && T.mintEntryId('ABCDEF0123456789') === 'tr-abcdef012345', 'entry ids are a closed shape');
  ok(T.timelineLabel(e) === 'fill #pw' && T.timelineLabel({ action: 'press', position: { kind: 'keys', keys: 'Enter' } }) === 'press Enter' && T.timelineLabel({ action: 'click', ok: false, position: { kind: 'point', x: 1, y: 2 } }) === 'click 1,2 ✗', 'the one-line label');
  ok(T.commandDrivesBrowser('agent-browser click #go') && T.commandDrivesBrowser('cd /x && vibespace-browser -- fill #a b') && !T.commandDrivesBrowser('ls -la') && !T.commandDrivesBrowser('cat agent-browser.log'), 'the tool card gates its entry on a command that DRIVES the browser');
  const w = T.traceWindowFor({ ts: 10000, nextTs: 15000, now: 99999 });
  ok(w.from === 8000 && w.to === 17000 && T.traceWindowFor({ ts: 10000, now: 11000 }).to === 12000 && T.traceWindowFor({ ts: 10000, now: 50000 }).to === 50000, "the card's window: 2 s before the call, to the next message + 2 s (or now)");
  ok(T.entriesInWindow([{ sessionId: 's1', at: 5, profileId: null }, { sessionId: 's2', at: 6 }], { sessionId: 's1', from: 0, to: 10 }).length === 1 && T.entriesInWindow([{ sessionId: 's1', at: 5, profileId: 'bp-1' }], { profileId: null }).length === 0, 'entriesInWindow filters by session / window / scope');
  const g = T.overlayGeometry({ position: { kind: 'point', x: 100, y: 50 }, frame: { w: 1000, h: 500, scale: 1, scrollX: 0, scrollY: 0 }, drawn: { left: 0, top: 0, width: 500, height: 250 } });
  ok(g && g.shape === 'dot' && g.left === 50 && g.top === 25, 'the overlay maps a CSS-px point into the drawn picture');
  const gr = T.overlayGeometry({ position: { kind: 'box', box: { x: 10, y: 10, width: 100, height: 20 } }, frame: { w: 1000, h: 500, scale: 2 }, drawn: { left: 0, top: 0, width: 1000, height: 500 } });
  ok(gr && gr.shape === 'rect' && gr.left === 20 && gr.width === 200 && T.overlayGeometry({ position: { kind: 'keys' }, frame: { w: 1, h: 1 }, drawn: { width: 1, height: 1 } }) === null, '…a box scales by the page scale factor; keys draw nothing');
  // retention: age first, then size — every removal names its rule
  const DAY = 86400000;
  const plan = T.traceRetentionPlan({ groups: [{ key: 'bp-00000001', entries: [{ id: 'tr-000000000001', at: 0, bytes: 10 }, { id: 'tr-000000000002', at: 2 * DAY, bytes: 150 * 1048576 }, { id: 'tr-000000000003', at: 3 * DAY, bytes: 100 * 1048576 }, { id: 'tr-000000000004', at: 4 * DAY, bytes: 5 }] }, { key: T.EPHEMERAL_SCOPE, entries: [] }], now: 8 * DAY });
  ok(plan.remove.length === 2 && plan.remove[0].id === 'tr-000000000001' && /older than 7 d \(8 d\)/.test(plan.remove[0].why) && plan.remove[1].id === 'tr-000000000002' && /over 200 MB for this profile \(oldest first\)/.test(plan.remove[1].why), 'age removes the 8-day-old entry; size removes the OLDEST of the rest until the profile fits 200 MB');
  ok(plan.kept.length === 2 && plan.kept[0].n === 2 && /2 entries/.test(plan.kept[0].why) && plan.kept[1].why === 'empty' && plan.bytesRemoved === 10 + 150 * 1048576, 'every kept group says what it holds and why');
  ok(T.traceRetentionPlan({ groups: [{ key: 'x', entries: [{ id: 'a', at: 0, bytes: 1 }] }], now: 1000 }).remove.length === 0, 'nothing within the limits is ever removed');
  // recording (D7): refused BY NAME
  const chrom = { id: 'bp-00000001', label: 'Work', provider: 'chromium', dir: '/d', record: true, host: null };
  ok(T.recordingVerdict({ version: '0.38.0', profile: { ...chrom, record: false } }).code === 'recording_off', 'recording is a per-profile OPT-IN');
  ok(T.recordingVerdict({ version: '0.38.0', profile: { ...chrom, provider: 'cdp' } }).code === 'recording_not_ours', 'a browser nobody of ours starts cannot be recorded');
  ok(T.recordingVerdict({ version: '0.38.0', profile: { ...chrom, host: 'h1' } }).code === 'recording_not_local', 'a paired-machine profile: local-only in this release');
  ok(T.recordingVerdict({ version: '0.32.0', profile: chrom }).code === 'recording_floor' && /0\.37\.0/.test(T.recordingVerdict({ version: '0.32.0', profile: chrom }).error) && T.recordingVerdict({ version: undefined, profile: chrom }).code === 'recording_floor', 'below 0.37.0 (record start) the refusal names the floor; unknown version too');
  ok(T.recordingVerdict({ version: '0.38.0', profile: chrom }).ok, '…and 0.38.0 with record on is ok');
  ok(T.isRecordingFile('sess-1-1700000000000.webm') && !T.isRecordingFile('../x.webm') && !T.isRecordingFile('a.txt') && T.recordingFileFor({ profileId: 'bp-00000001', sessionId: 'sess/1', at: 5 }) === 'bp-00000001/sess_1-5.webm', 'recording file names are a closed shape');
  // the sweep scope (§7.1): EXACTLY the ownsDir rows — negative control the cloud:* / local-window / cdp / remote records
  const onePerRow = B.providerRows().map((r) => ({ id: 'bp-' + r.id.replace(/[^a-z]/g, '').padEnd(8, '0').slice(0, 8), label: r.id, provider: r.id, dir: '/d/' + r.id, host: null }));
  const expected = B.providerRows().filter((r) => r.ownsDir).map((r) => r.id).sort();
  const got = T.sweepScope(onePerRow).map((p) => p.provider).sort();
  ok(JSON.stringify(got) === JSON.stringify(expected) && expected.includes('chromium') && expected.includes('cloak') && !expected.includes('cdp') && !expected.includes('local-window') && !expected.some((x) => x.startsWith('cloud:')), `the sweep's scope IS the ownsDir rows: ${expected.join(', ')}`);
  ok(T.sweepScope([{ ...chrom, host: 'h1' }]).length === 0, 'a chromium profile on a paired machine is not in scope either — that directory is that machine\'s');
  for (const prov of ['cloud:browserbase', 'local-window', 'cdp']) { const v = T.queueVerdict({ ...chrom, provider: prov }); ok(!v.ok && v.code === 'not_ours' && /not a directory we own|ownsDir/.test(v.error), `queuing a ${prov} record for the sweep is refused not_ours (negative control)`); }
  ok(T.queueVerdict({ ...chrom, provider: 'nope' }).code === 'not_ours' && T.queueVerdict({ ...chrom, host: 'h1' }).code === 'not_ours' && T.queueVerdict({ ...chrom, dir: '' }).code === 'not_ours' && T.queueVerdict(chrom).ok, 'unknown provider / remote / no dir refused; a local chromium is ours');
  // the housekeeping verdict never answers "delete"
  const t0 = 100 * DAY;
  const rows = T.housekeepingVerdict({ profiles: [chrom, { ...chrom, id: 'bp-00000002', label: 'Held' }, { ...chrom, id: 'bp-00000003', label: 'Live' }, { ...chrom, id: 'bp-00000004', label: 'Fresh', lastUsedAt: t0 - 60000 }, { ...chrom, id: 'bp-00000005', label: 'Old', lastUsedAt: t0 - 40 * DAY }, { ...chrom, id: 'bp-00000006', label: 'Cloud', provider: 'cloud:browserbase' }], leases: [{ profileId: 'bp-00000002', browserKey: KEY_A }], browsers: { 'bp-00000003': { state: 'ready', pid: 1 } }, dirFacts: { 'bp-00000001': { bytes: 4096, mtime: t0 - 3 * 3600000 } }, now: t0 });
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  ok(rows.every((r) => r.state !== 'delete' && !/delete/.test(r.state)), 'no row is ever "delete" (D8: deletion is a human act)');
  ok(by.Held.state === 'in-use' && by.Held.canForget === false && /1 session/.test(by.Held.why) && by.Live.state === 'live' && by.Live.canForget === false, 'held / live rows say so and cannot be forgotten');
  ok(by.Fresh.state === 'recent' && /written 1 min ago — may be in flight \(grace 10 min\)/.test(by.Fresh.why), 'a directory written inside the grace window is spared WITH its age');
  ok(by.Old.state === 'stale' && /unused for 40 d/.test(by.Old.why) && /never deleted by itself/.test(by.Old.why), 'a stale row is listed, never deleted by itself');
  ok(by.Work.state === 'kept' && by.Work.bytes === 4096 && /last used 3 h ago/.test(by.Work.why), 'a kept row carries its size and its age');
  ok(by.Cloud.state === 'not-ours' && by.Cloud.canForget === false && by.Cloud.bytes === null, 'a cloud row is not ours — no size, no forget');
  ok(T.forgetVerdict({ profile: chrom, leases: [{ profileId: 'bp-00000001', browserKey: KEY_A }] }).code === 'leased' && T.forgetVerdict({ profile: chrom, browsers: { 'bp-00000001': { state: 'ready', pid: 2 } } }).code === 'running' && T.forgetVerdict({ profile: { ...chrom, provider: 'cdp' } }).code === 'not_ours' && T.forgetVerdict({ profile: chrom }).ok, 'forget is refused while leased / running / not ours');
  ok(T.forgottenDirName('/h/.agent-browser/x', 5) === '/h/.agent-browser/x.forgotten-5' && T.isForgottenName('/h/.agent-browser/x.forgotten-5') && !T.isForgottenName('/h/.agent-browser/x'), 'a forgotten directory is renamed beside itself');
  const cands = T.orphanCandidates({ base: '/h/.agent-browser', registeredDirs: ['/h/.agent-browser/known'], now: t0, names: [{ name: 'known', isDir: true, markers: ['Default'], mtime: 1 }, { name: 'orphan', isDir: true, markers: ['Local State'], mtime: t0 - DAY }, { name: 'plain', isDir: true, markers: [], mtime: 1 }, { name: 'x.forgotten-1', isDir: true, markers: ['Default'], mtime: 1 }, { name: 'file', isDir: false, markers: ['Default'], mtime: 1 }] });
  ok(cands.length === 1 && cands[0].name === 'orphan' && cands[0].dir === '/h/.agent-browser/orphan' && cands[0].ageMs === DAY, 'an orphan is a marker-carrying dir no record names — registered / marker-less / forgotten / files are not');
  ok(T.orphanPathVerdict({ dir: '/h/.agent-browser/o', base: '/h/.agent-browser' }).ok && T.orphanPathVerdict({ dir: '/h/.agent-browser/../etc', base: '/h/.agent-browser' }).code === 'not_ours' && T.orphanPathVerdict({ dir: '/h/.agent-browser/a/b', base: '/h/.agent-browser' }).code === 'not_ours' && T.orphanPathVerdict({ dir: '/etc', base: '/h/.agent-browser' }).code === 'not_ours' && T.orphanPathVerdict({ dir: '/h/.agent-browser/o.forgotten-1', base: '/h/.agent-browser' }).code === 'bad-request', 'only a top-level directory under the base may be adopted or forgotten');
  ok(T.scopeDigest([{ at: 5, before: { bytes: 10 }, after: { bytes: 20 } }, { at: 9, before: { bytes: 1 } }]).bytes === 31 && T.scopeDigest([]).n === 0, 'the per-scope digest sums the frames');
}

// ═══ ② THE REAL RECORDER over a fake bridge + a stub keeper ═══════════════
console.log('— ② the recorder: before/after frames, the box probe, the files, the seam, the sweep, the recording');
const P1 = 'bp-00000001', P2 = 'bp-00000002', P3 = 'bp-00000003';
const AB = path.join(HOME, '.agent-browser');
const dirOf = (n) => path.join(AB, n);
const profiles = [
  { id: P1, label: 'Work', provider: 'chromium', dir: dirOf('work'), record: false, lastUsedAt: clock - 3600000, host: null, notes: '' },
  { id: P2, label: 'Cloud', provider: 'cloud:browserbase', dir: null, record: false, lastUsedAt: 0, host: null, notes: '' },
  { id: P3, label: 'Idle', provider: 'chromium', dir: dirOf('idle'), record: false, lastUsedAt: clock - 40 * 86400000, host: null, notes: '' },
];
for (const d of ['work', 'idle', 'orphan-one', 'plain']) fs.mkdirSync(dirOf(d), { recursive: true });
fs.writeFileSync(path.join(dirOf('work'), 'Local State'), '{}'); fs.mkdirSync(path.join(dirOf('idle'), 'Default'));
fs.utimesSync(dirOf('idle'), (clock - 40 * 86400000) / 1000, (clock - 40 * 86400000) / 1000); // the Idle profile's directory was last written 40 days ago
fs.writeFileSync(path.join(dirOf('orphan-one'), 'Local State'), '{}'); fs.writeFileSync(path.join(dirOf('orphan-one'), 'cookie'), 'x'.repeat(100));
fs.writeFileSync(path.join(dirOf('plain'), 'readme'), 'not a profile');
const reg = { profiles, leases: [{ profileId: P1, browserKey: KEY_A, sessionId: 'sess-1' }], browsers: { [P1]: { state: 'ready', pid: 1 } }, pins: {} };
const leaseFns = new Set(), digestFns = new Set();
const execLog = [];
let version = '0.38.0';
let recordAnswer = { ok: true, json: { success: true } };
const stubKeeper = {
  profile: (id) => profiles.find((p) => p.id === id) || null,
  browserOf: (id) => reg.browsers[id] || null,
  leasesOn: (id) => reg.leases.filter((l) => l.profileId === id),
  _reg: () => reg,
  onLease: (fn) => { leaseFns.add(fn); return () => leaseFns.delete(fn); },
  addDigest: (fn) => { digestFns.add(fn); return () => digestFns.delete(fn); },
  list: () => ({ profiles: profiles.slice(), ...Object.assign({}, ...[...digestFns].map((f) => f())) }),
  removeProfile: (id) => { const i = profiles.findIndex((p) => p.id === id); if (i < 0) throw Object.assign(new Error('no profile'), { code: 'not-found' }); const p = profiles[i]; profiles.splice(i, 1); return { removed: id, dir: p.dir }; },
  adoptDirectory: ({ label, dir }) => { const p = { id: 'bp-0000000a', label, provider: 'chromium', dir, record: false, lastUsedAt: 0, host: null, notes: '' }; profiles.push(p); return { profile: p }; },
  updateProfile: (id, patch) => { const p = profiles.find((x) => x.id === id); if (!p) throw Object.assign(new Error('no profile'), { code: 'not-found' }); const bad = Object.keys(patch).filter((k) => !['record', 'label', 'notes'].includes(k)); if (bad.length) throw Object.assign(new Error(`these fields cannot be changed here: ${bad.join(', ')}`), { code: 'bad-request' }); const changed = {}; if ('record' in patch) { changed.record = { was: !!p.record, now: !!patch.record }; p.record = !!patch.record; } for (const fn of leaseFns) fn({ kind: 'profile-updated', profileId: id, changed }); return { profile: { ...p }, changed }; },
  _facts: { lastVersion: () => version },
  _runtime: { exec: async (ns, argv, opts) => { execLog.push({ ns, argv: argv.slice(), opts: { ...opts } }); if (argv[0] === 'get' && argv[1] === 'box') return argv[2] === '#nobox' ? { ok: false, json: null, error: 'fake: element not found', stderr: '' } : { ok: true, json: { success: true, data: { x: 10, y: 20, width: 100, height: 30 } } }; if (argv[0] === 'record') return recordAnswer; return { ok: true, json: {} }; } },
};
const pushed = [], bcast = [];
function fakeBridge() {
  const taps = new Map();
  const b = {
    taps, _relays: new Map(),
    async tap(sessionId, profileRef, fn) {
      const key = `${sessionId}|${profileRef || T.EPHEMERAL_SCOPE}`;
      taps.set(key, fn);
      const target = profileRef ? { kind: 'attachment', profileId: profileRef, ns: 'vs-' + profileRef, sessionName: 'vs-' + (sessionId === 'sess-1' ? KEY_A : KEY_B), dir: dirOf('work') } : { kind: 'ephemeral', profileId: null, ns: 'vs-' + KEY_A, sessionName: 'vs-' + KEY_A, envPairs: [['AGENT_BROWSER_SESSION', KEY_A]] };
      b._relays.set(key, { key, sessionId, browserKey: sessionId === 'sess-1' ? KEY_A : KEY_B, target });
      return { ok: true, key, untap: () => { taps.delete(key); }, target: { kind: target.kind, profileId: target.profileId } };
    },
    push(key, msg) { const fn = taps.get(key); if (!fn) throw new Error('no tap ' + key); fn(msg, JSON.stringify(msg), b._relays.get(key)); },
    broadcastTo(sessionId, profileId, obj) { pushed.push({ sessionId, profileId, obj }); return 1; },
  };
  return b;
}
const bridge = fakeBridge();
const settings = { 'browser.actionTrace': true };
const fakeDu = (cmd, args, opts, cb) => { const dirs = args.slice(args.indexOf('--') + 1); setTimeout(() => cb(null, dirs.map((d) => `4096\t${d}`).join('\n'), ''), 1); };
const trace = R.create({ dataDir: DATA, homeDir: HOME, keeper: stubKeeper, bridge, serverSetting: (k) => settings[k], broadcast: (m) => bcast.push(m), log: quiet, now, execFileImpl: fakeDu, sweepEveryMs: 0 });
const K1 = `sess-1|${P1}`;
{
  const b = await trace.boot();
  ok(b.armed === 1 && bridge.taps.has(K1) && trace._taps.size === 1, 'boot arms ONE tap per persisted lease whose browser is live');
  ok(leaseFns.size === 1 && digestFns.size === 1, '…and hangs on the keeper\'s lease seam + digest hook (install is idempotent)');
  trace.install();
  ok(leaseFns.size === 1 && digestFns.size === 1, 'install() after boot adds no second listener');
  // frames arrive; a launch pair and an observation are never traced
  bridge.push(K1, { type: 'url', url: 'https://example.test/login' });
  bridge.push(K1, { type: 'frame', seq: 1, data: jpeg('f1'), metadata: { deviceWidth: 1280, deviceHeight: 720, pageScaleFactor: 1, scrollOffsetX: 0, scrollOffsetY: 0 } });
  bridge.push(K1, { type: 'command', id: 'l0', action: 'launch', params: {} }); bridge.push(K1, { type: 'result', id: 'l0', action: 'launch', success: false, data: { reused: true } });
  bridge.push(K1, { type: 'command', id: 'g0', action: 'get', params: { what: 'text' } }); bridge.push(K1, { type: 'result', id: 'g0', action: 'get', success: false, data: 'hi' });
  ok(trace._taps.get(K1).pending.size === 0, 'a launch pair and a `get` leave nothing pending');
  // a click: before = the last frame; result; a settled frame ⇒ after; the box through the runtime
  bridge.push(K1, { type: 'command', id: 'c1', action: 'click', params: { action: 'click', selector: '#go' }, timestamp: clock });
  ok(trace._taps.get(K1).pending.get('c1').before.seq === 1, 'a traced command snapshots the LAST frame as its before-picture');
  clock += 50;
  bridge.push(K1, { type: 'result', id: 'c1', action: 'click', success: false, data: { clicked: true }, duration_ms: 42, timestamp: clock });
  clock += 100;
  bridge.push(K1, { type: 'frame', seq: 2, data: jpeg('f2'), metadata: { deviceWidth: 1280, deviceHeight: 720 } });
  ok(trace._taps.get(K1).pending.get('c1').afterDone === false, 'a frame 100 ms after the result is not yet the after-picture (settle 400 ms)');
  clock += 400;
  bridge.push(K1, { type: 'frame', seq: 3, data: jpeg('f3'), metadata: { deviceWidth: 1280, deviceHeight: 720 } });
  await until(() => trace.list({ sessionId: 'sess-1', profileId: P1 }).length === 1);
  const [e1] = trace.list({ sessionId: 'sess-1', profileId: P1 });
  ok(!!e1 && e1.action === 'click' && e1.kind === 'target' && e1.ok === true && e1.durationMs === 42 && e1.url === 'https://example.test/login' && e1.browserKey === KEY_A && e1.profileId === P1, 'the entry: click, ok, its duration, the URL at the time, the key, the profile');
  ok(e1.position.kind === 'box' && e1.position.selector === '#go' && e1.position.box.width === 100, 'the position is the element BOX the runtime answered');
  const probe = execLog.find((x) => x.argv[0] === 'get' && x.argv[1] === 'box');
  ok(!!probe && probe.argv[2] === '#go' && probe.ns === 'vs-' + P1 && probe.opts.session === 'vs-' + KEY_A && probe.opts.dir === dirOf('work') && probe.opts.timeout === T.BOX_PROBE_TIMEOUT_MS, 'the box is asked as `get box <selector>` under the LEASE\'s own session, in the profile\'s namespace, bounded');
  ok(e1.before && e1.before.file === e1.id + '-before.jpg' && e1.after && e1.after.file === e1.id + '-after.jpg' && e1.after.seq === 3 && e1.afterSame === false, 'before = seq 1, after = the first SETTLED frame (seq 3), two files');
  const sdir = path.join(trace.traceRoot, P1);
  const mode = (f) => (fs.statSync(path.join(sdir, f)).mode & 0o777);
  ok(fs.readFileSync(path.join(sdir, e1.before.file)).toString() === 'JPEG-BYTES-f1' && fs.readFileSync(path.join(sdir, e1.after.file)).toString() === 'JPEG-BYTES-f3' && mode(e1.before.file) === 0o600 && mode(e1.id + '.json') === 0o600 && (fs.statSync(sdir).mode & 0o777) === 0o700, 'the frames are the bytes the stream carried, 0600, in a 0700 scope dir');
  ok(fs.readFileSync(path.join(sdir, R.INDEX_FILE), 'utf8').trim().split('\n').length === 1 && JSON.parse(fs.readFileSync(path.join(sdir, e1.id + '.json'), 'utf8')).id === e1.id, 'one index line + the entry file');
  ok(bcast.filter((m) => m.type === 'browser-trace-appended').length === 1 && bcast.find((m) => m.type === 'browser-trace-appended').entry.id === e1.id && !('before' in bcast.find((m) => m.type === 'browser-trace-appended').entry), 'every client is told an entry was appended — without the bytes');
  ok(pushed.length === 1 && pushed[0].sessionId === 'sess-1' && pushed[0].profileId === P1 && pushed[0].obj.type === 'trace' && pushed[0].obj.entry.id === e1.id, 'the live view\'s viewers get the `trace` record');
  // a fill whose value must never reach the disk; no repaint ⇒ afterSame (the
  // real deadline timer fires — no frame may arrive before it, so the press waits)
  bridge.push(K1, { type: 'command', id: 'c2', action: 'fill', params: { action: 'fill', selector: '#pw', value: 'hunter2' } });
  clock += 10;
  bridge.push(K1, { type: 'result', id: 'c2', action: 'fill', success: false, data: {} });
  await until(() => trace.list({ sessionId: 'sess-1', profileId: P1 }).length === 2, 4000);
  // a press with ONE early frame ⇒ latest by the deadline
  bridge.push(K1, { type: 'command', id: 'c3', action: 'press', params: { action: 'press', key: 'Enter' } });
  clock += 10;
  bridge.push(K1, { type: 'result', id: 'c3', action: 'press', success: false, data: {} });
  clock += 100;
  bridge.push(K1, { type: 'frame', seq: 4, data: jpeg('f4'), metadata: { deviceWidth: 1280, deviceHeight: 720 } });
  await until(() => trace.list({ sessionId: 'sess-1', profileId: P1 }).length === 3, 4000);
  const all = trace.list({ sessionId: 'sess-1', profileId: P1 });
  const eFill = all.find((x) => x.action === 'fill'), ePress = all.find((x) => x.action === 'press');
  ok(!!eFill && eFill.params.value === '«7 chars»' && eFill.text === 'agent-browser fill #pw «7 chars»', 'the fill entry keeps «7 chars»');
  const everyByte = fs.readdirSync(sdir).map((f) => fs.readFileSync(path.join(sdir, f), 'latin1')).join('\n');
  ok(!everyByte.includes('hunter2'), 'the fill\'s value is absent from EVERY byte under the scope directory (files + index)');
  ok(eFill.afterSame === true && eFill.after && eFill.after.file === eFill.before.file && !fs.existsSync(path.join(sdir, eFill.id + '-after.jpg')), 'a page that did not repaint: after IS the before-frame (no second file)');
  ok(!!ePress && ePress.position.kind === 'keys' && ePress.position.keys === 'Enter' && ePress.after && ePress.after.seq === 4 && ePress.afterSame === false, 'the press: keys position, the LATEST frame by the deadline');
  // a target whose box is not answered says why; then tap-end finalizes what is pending
  bridge.push(K1, { type: 'command', id: 'c4', action: 'hover', params: { action: 'hover', selector: '#nobox' } });
  bridge.push(K1, { type: 'result', id: 'c4', action: 'hover', success: false, data: {} });
  await until(() => trace.list({ sessionId: 'sess-1', profileId: P1 }).length === 4, 4000); // the probe answers, the deadline passes
  bridge.push(K1, { type: 'command', id: 'c5', action: 'type', params: { action: 'type', text: 'secret words' } });
  bridge.push(K1, { type: 'tap-end', code: 1000 });
  await until(() => trace.list({ sessionId: 'sess-1', profileId: P1 }).length === 5, 4000);
  const eH = trace.list({ sessionId: 'sess-1', profileId: P1 }).find((x) => x.action === 'hover'), eT = trace.list({ sessionId: 'sess-1', profileId: P1 }).find((x) => x.action === 'type');
  ok(!!eH && eH.position.kind === 'target' && eH.position.box === null && /element not found/.test(eH.position.why), 'a box the daemon could not answer: the position says why');
  ok(!!eT && eT.params.text === '«12 chars»' && eT.ok === null && /the stream ended/.test(eT.position.why || '') && trace._taps.size === 0, 'tap-end finalizes the pending type (no result ⇒ ok null, why = the stream ended) and forgets the tap');
  // the lease seam
  reg.leases.push({ profileId: P1, browserKey: KEY_B, sessionId: 'sess-2' });
  for (const fn of leaseFns) fn({ kind: 'attach', browserKey: KEY_B, profileId: P1, sessionId: 'sess-2', created: true });
  await until(() => bridge.taps.has(`sess-2|${P1}`));
  ok(bridge.taps.has(`sess-2|${P1}`) && trace._taps.size === 1, 'an attach arms a tap for that session on that profile');
  for (const fn of leaseFns) fn({ kind: 'detach', browserKey: KEY_B, profileId: P1, sessionId: 'sess-2' });
  ok(!bridge.taps.has(`sess-2|${P1}`) && trace._taps.size === 0, 'a detach disarms it');
  for (const fn of leaseFns) fn({ kind: 'browser-ready', profileId: P1, why: 'attach', local: true });
  await until(() => bridge.taps.has(K1) && bridge.taps.has(`sess-2|${P1}`));
  ok(bridge.taps.has(K1) && bridge.taps.has(`sess-2|${P1}`), 'browser-ready arms a tap for EVERY lease on the profile');
  for (const fn of leaseFns) fn({ kind: 'browser-stopped', profileId: P1, why: 'idle' });
  ok(trace._taps.size === 0 && !bridge.taps.has(K1), 'browser-stopped disarms every tap on the profile');
  reg.browsers[P3] = { state: 'starting', pid: 2 };
  ok((await trace.watch({ sessionId: 'sess-9', profileId: P3 })).code === 'not-live', 'a tap never STARTS a browser: a profile whose browser is not ready is refused not-live');
  delete reg.browsers[P3];
  settings['browser.actionTrace'] = false;
  ok((await trace.watch({ sessionId: 'sess-1', profileId: P1 })).code === 'trace_off' && trace.enabled() === false, 'the setting gates the whole thing (browser.actionTrace)');
  settings['browser.actionTrace'] = true;
  ok((await trace.watch({ sessionId: 'sess-1', profileId: P1 })).ok && trace._taps.size === 1, '…and on again, a watch arms');
  // the sweep: age, then size — with the index rewritten
  const old = T.entryFor({ id: 'tr-0000000000aa', at: clock - 8 * 86400000, sessionId: 'sess-old', profileId: P1, command: { action: 'click', params: {} }, position: { kind: 'input' }, before: { file: 'tr-0000000000aa-before.jpg', bytes: 5 } });
  fs.writeFileSync(path.join(sdir, 'tr-0000000000aa-before.jpg'), 'old');
  const big = T.entryFor({ id: 'tr-0000000000bb', at: clock - 3600000, sessionId: 'sess-big', profileId: P1, command: { action: 'click', params: {} }, position: { kind: 'input' }, before: { file: 'tr-0000000000bb-before.jpg', bytes: 250 * 1048576 } });
  fs.appendFileSync(path.join(sdir, R.INDEX_FILE), JSON.stringify(old) + '\n' + JSON.stringify(big) + '\n');
  trace.unwatch({ sessionId: 'sess-1', profileId: P1 });
  const fresh = R.create({ dataDir: DATA, homeDir: HOME, keeper: stubKeeper, bridge, serverSetting: (k) => settings[k], broadcast: (m) => bcast.push(m), log: quiet, now, execFileImpl: fakeDu, sweepEveryMs: 0 });
  const sw = fresh.sweep();
  ok(sw.removed === 2 && sw.plan.remove.some((r) => r.id === 'tr-0000000000aa' && /older than 7 d/.test(r.why)) && sw.plan.remove.some((r) => r.id === 'tr-0000000000bb' && /over 200 MB/.test(r.why)), 'the sweep removes the 8-day-old entry by AGE and the 250 MB one by SIZE, each naming its rule');
  ok(!fs.existsSync(path.join(sdir, 'tr-0000000000aa-before.jpg')) && fresh.list({ profileId: P1 }).length === 5 && fs.readFileSync(path.join(sdir, R.INDEX_FILE), 'utf8').trim().split('\n').length === 5, 'its files are gone and the index is rewritten to the 5 kept entries');
  ok(bcast.some((m) => m.type === 'browser-housekeeping-updated' && m.sweep && m.sweep.removed === 2), 'the sweep result is broadcast');
  ok(fresh.entry(e1.id) && fresh.entry(e1.id).id === e1.id && fresh.framePath(e1.id, 'before') === path.join(sdir, e1.before.file) && fresh.framePath('tr-0000000000aa', 'before') === null, 'a fresh recorder reads the index back; a removed entry has no frame');
  // recording (D7): through the lease's session, refused below the floor
  const r0 = await fresh.maybeStartRecording(P1, KEY_A, 'sess-1');
  ok(r0.code === 'recording_off' && fresh._recordings.size === 0, 'a profile with record off is not recorded');
  profiles[0].record = true;
  reg.browsers[P1] = { state: 'ready', pid: 1 };
  execLog.length = 0;
  const r1 = await fresh.maybeStartRecording(P1, KEY_A, 'sess-1');
  const rs = execLog.find((x) => x.argv[0] === 'record' && x.argv[1] === 'start');
  ok(r1.ok && !!rs && rs.ns === 'vs-' + P1 && rs.opts.session === 'vs-' + KEY_A && rs.opts.dir === dirOf('work') && rs.argv[2].startsWith(path.join(fresh.recRoot, P1) + '/') && /^sess-1-\d+\.webm$/.test(path.basename(rs.argv[2])), 'record start <file> runs under the LEASE\'s session in the profile\'s namespace, into data/browser-recordings/<profile>/<session>-<ts>.webm');
  ok(fresh._recordings.size === 1 && fresh.digest().recording[P1] && fresh.digest().recording[P1].browserKey === KEY_A && (await fresh.maybeStartRecording(P1, KEY_A, 'sess-1')).already === true, 'the digest names the recording; starting again is idempotent');
  const r2 = await fresh.stopRecording(P1, KEY_A, 'detach');
  ok(r2.ok && r2.stopped && execLog.some((x) => x.argv[0] === 'record' && x.argv[1] === 'stop') && fresh._recordings.size === 0, 'record stop runs the same way and the digest forgets it');
  version = '0.32.0';
  const r3 = await fresh.maybeStartRecording(P1, KEY_A, 'sess-1');
  ok(r3.code === 'recording_floor' && fresh.digest().recordingRefused[P1] && fresh.digest().recordingRefused[P1].code === 'recording_floor', 'below the floor the refusal is recorded so the panel can say why');
  version = '0.38.0';
  ok((await fresh.maybeStartRecording(P2, KEY_A, 'sess-1')).code === 'recording_off' && (await fresh.maybeStartRecording(P2 + '', KEY_A)).code === 'recording_off', 'a cloud profile with record off: off first (the gate\'s order)');
  profiles[0].record = false;
  fresh.shutdown();
}

// ═══ ③ HOUSEKEEPING on real directories ════════════════════════════════════
console.log('— ③ housekeeping: the rows, the orphans, forget = rename + ledger, the one deletion');
const hk = R.create({ dataDir: DATA, homeDir: HOME, keeper: stubKeeper, bridge, serverSetting: (k) => settings[k], broadcast: (m) => bcast.push(m), log: quiet, now, execFileImpl: fakeDu, sweepEveryMs: 0 });
{
  const v = await hk.housekeeping();
  const by = Object.fromEntries(v.profiles.map((r) => [r.id, r]));
  ok(by[P1].state === 'in-use' && by[P1].bytes === 4096 && by[P1].trace.n === 5 && by[P1].canForget === false, 'the Work row: in use, its size measured in a child, its trace digest');
  ok(by[P2].state === 'not-ours' && by[P2].bytes === null && /ownsDir/.test(by[P2].why), 'the Cloud row: not ours (never measured, never swept)');
  ok(by[P3].state === 'stale' && by[P3].canForget === true, 'the Idle row: stale, may be forgotten by a human');
  ok(v.orphans.length === 1 && v.orphans[0].name === 'orphan-one' && v.orphans[0].bytes === 4096 && v.orphansBase === AB, 'the orphans: the marker dir nobody names — not the registered ones, not the marker-less one');
  ok(v.ephemeral.scope === T.EPHEMERAL_SCOPE && v.limits.retentionMs === T.TRACE_RETENTION_MS && v.limits.bytesPerProfile === T.TRACE_BYTES_PER_PROFILE && v.traceOn === true && Array.isArray(v.forgotten), 'the panel also gets the ephemeral digest, the limits, the setting and the ledger');
  let err = null; try { await hk.forgetProfile(P1); } catch (e) { err = e; }
  ok(err && err.code === 'leased' && fs.existsSync(dirOf('work')), 'forget refuses a leased profile — the directory is untouched');
  reg.browsers[P3] = { state: 'ended', pid: null };
  const f = await hk.forgetProfile(P3);
  ok(f.ok && f.removed === P3 && f.to === dirOf('idle') + T.FORGOTTEN_SUFFIX + clock && fs.existsSync(f.to) && !fs.existsSync(dirOf('idle')) && !profiles.some((p) => p.id === P3), 'forget = the directory RENAMED beside itself, then the record removed');
  const ledger = JSON.parse(fs.readFileSync(hk.forgottenFile, 'utf8'));
  ok(ledger.forgotten.length === 1 && ledger.forgotten[0].id === f.ledger.id && ledger.forgotten[0].from === dirOf('idle') && ledger.forgotten[0].dir === f.to && ledger.forgotten[0].deletedAt === null, 'the ledger row was filed (from → to, not deleted)');
  const o = hk.forgetOrphan(dirOf('orphan-one'));
  ok(o.ok && fs.existsSync(o.to) && !fs.existsSync(dirOf('orphan-one')) && JSON.parse(fs.readFileSync(hk.forgottenFile, 'utf8')).forgotten.length === 2, 'an orphan is forgotten the same way');
  err = null; try { hk.forgetOrphan('/etc'); } catch (e) { err = e; }
  ok(err && err.code === 'not_ours', 'a path outside ~/.agent-browser is refused not_ours');
  err = null; try { hk.forgetOrphan(dirOf('work')); } catch (e) { err = e; }
  ok(err && err.code === 'leased' && fs.existsSync(dirOf('work')), 'a registered directory cannot be forgotten as an orphan');
  fs.mkdirSync(dirOf('adopt-me')); fs.mkdirSync(path.join(dirOf('adopt-me'), 'Default'));
  const a = hk.adoptOrphan({ dir: dirOf('adopt-me'), label: 'Adopted' });
  ok(a.profile && a.profile.label === 'Adopted' && profiles.some((p) => p.dir === dirOf('adopt-me')) && (await hk.orphans()).orphans.length === 0, 'adopting an orphan registers it in place (it stops being an orphan)');
  const d = await hk.deleteForgotten(f.ledger.id);
  ok(d.ok && !fs.existsSync(f.to) && d.row.deletedAt === clock && JSON.parse(fs.readFileSync(hk.forgottenFile, 'utf8')).forgotten.find((r) => r.id === f.ledger.id).deletedAt === clock, 'the ONE permanent deletion removes a forgotten directory and stamps the row');
  ok((await hk.deleteForgotten(f.ledger.id)).already === true, '…idempotent');
  const rows = JSON.parse(fs.readFileSync(hk.forgottenFile, 'utf8')); rows.forgotten.push({ id: 'fg-deadbeef', profileId: null, label: 'x', from: dirOf('work'), dir: dirOf('work'), bytes: null, at: clock, why: 'planted', deletedAt: null });
  fs.writeFileSync(hk.forgottenFile, JSON.stringify(rows));
  const hk2 = R.create({ dataDir: DATA, homeDir: HOME, keeper: stubKeeper, bridge, serverSetting: (k) => settings[k], broadcast: () => { }, log: quiet, now, execFileImpl: fakeDu, sweepEveryMs: 0 });
  err = null; try { await hk2.deleteForgotten('fg-deadbeef'); } catch (e) { err = e; }
  ok(err && err.code === 'not_ours' && fs.existsSync(dirOf('work')), 'a ledger row that does not name a `.forgotten-` directory can NEVER delete (a planted row is refused)');
  err = null; try { await hk2.deleteForgotten('fg-00000000'); } catch (e) { err = e; }
  ok(err && err.code === 'not-found', 'an unknown ledger id is not-found');
}

// ═══ ④ THE ROUTES in-process ════════════════════════════════════════════════
console.log('— ④ the routes: the session-or-key match, the frame, PATCH, housekeeping, host refused');
{
  const { router, setup } = require('../src/routes/browser-trace.js');
  const activeSessions = new Map([['sess-1', { _browserKey: KEY_A }], ['sess-resumed', { _browserKey: KEY_A }]]);
  // the bindings READER (P0 r5/r7's store, stubbed): a STOPPED conversation has no live record — its key is looked up by the CLI's own id
  const bindings = { lookup: (c) => (c === 'conv-a' ? KEY_A : '') };
  setup({ keeper: stubKeeper, trace: hk, activeSessions, bindings });
  const app = express(); app.use(express.json()); app.use(router);
  const srv = http.createServer(app); servers.push(srv);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, p, body) => { const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const ct = r.headers.get('content-type') || ''; return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : await r.arrayBuffer() }; };
  const l1 = await call('GET', `/api/browser/trace?sessionId=sess-1`);
  ok(l1.status === 200 && l1.body.entries.length === 5 && l1.body.browserKey === KEY_A && l1.body.traceOn === true, 'GET /api/browser/trace?sessionId= answers that session\'s entries (all scopes)');
  const l2 = await call('GET', `/api/browser/trace?sessionId=sess-resumed`);
  ok(l2.status === 200 && l2.body.entries.length === 5, 'a RESUMED session (new webui id, same browser key) finds the same entries — the key matches, not the id');
  const l3 = await call('GET', `/api/browser/trace?sessionId=sess-unknown`);
  ok(l3.status === 200 && l3.body.entries.length === 0 && l3.body.browserKey === null, 'a session that is not live and recorded nothing: empty, honestly');
  // the client half (P5): a STOPPED conversation's cards ask by the CLI's conversation id — the bindings store answers the key
  const lc = await call('GET', `/api/browser/trace?conversation=conv-a`);
  ok(lc.status === 200 && lc.body.entries.length === 5 && lc.body.browserKey === KEY_A && lc.body.keyFrom === 'conversation' && lc.body.sessionId === null, 'GET …/trace?conversation= finds a STOPPED conversation\'s actions through the bindings store (keyFrom: conversation)');
  ok((await call('GET', `/api/browser/trace?conversation=conv-unknown`)).body.entries.length === 0 && (await call('GET', `/api/browser/trace?conversation=conv-unknown`)).body.browserKey === null, 'an unbound conversation: empty, key null');
  const lk = await call('GET', `/api/browser/trace?browserKey=${KEY_A}`);
  ok(lk.status === 200 && lk.body.entries.length === 5 && lk.body.keyFrom === 'given', 'a browserKey given outright matches too (keyFrom: given)');
  ok((await call('GET', `/api/browser/trace?browserKey=nope`)).status === 400 && (await call('GET', `/api/browser/trace?sessionId=sess-1&browserKey=nope`)).status === 400, 'a malformed browserKey is 400 even beside a good sessionId');
  const lp = await call('GET', `/api/browser/trace?sessionId=sess-1&conversation=conv-a`);
  ok(lp.status === 200 && lp.body.keyFrom === 'session' && lp.body.entries.length === 5, 'a LIVE session\'s own key wins over the conversation lookup (keyFrom: session)');
  const first = l1.body.entries[0];
  const l4 = await call('GET', `/api/browser/trace?sessionId=sess-1&from=${first.at}&to=${first.at}&limit=1`);
  ok(l4.status === 200 && l4.body.entries.length === 1 && l4.body.entries[0].id === first.id, 'the window and the limit apply');
  ok((await call('GET', `/api/browser/trace?sessionId=sess-1&profile=${T.EPHEMERAL_SCOPE}`)).body.entries.length === 0 && (await call('GET', `/api/browser/trace?sessionId=sess-1&profile=nope`)).status === 400 && (await call('GET', `/api/browser/trace`)).status === 400, 'profile = ephemeral | id | empty; a bad one and a missing sessionId are 400');
  ok((await call('GET', `/api/browser/trace?sessionId=sess-1&host=h1`)).status === 400 && (await call('GET', `/api/browser/trace?sessionId=sess-1&host=h1`)).body.code === 'unsupported-host', 'host is refused by name');
  const one = await call('GET', `/api/browser/trace/${first.id}`);
  ok(one.status === 200 && one.body.entry.id === first.id && (await call('GET', `/api/browser/trace/tr-000000000000`)).status === 404 && (await call('GET', `/api/browser/trace/x`)).status === 400, 'one entry; unknown 404; a bad id 400');
  const fr = await call('GET', `/api/browser/trace/${first.id}/frame/before`);
  ok(fr.status === 200 && fr.headers.get('content-type') === 'image/jpeg' && fr.headers.get('x-content-type-options') === 'nosniff' && Buffer.from(fr.body).toString() === 'JPEG-BYTES-f1', 'the before frame is served image/jpeg + nosniff — the bytes the stream carried');
  ok((await call('GET', `/api/browser/trace/${first.id}/frame/middle`)).status === 400 && (await call('GET', `/api/browser/trace/tr-000000000000/frame/after`)).status === 404, 'which ∈ {before, after}; a gone entry is 404');
  const pt = await call('PATCH', `/api/browser/profiles/${P1}`, { record: true });
  ok(pt.status === 200 && pt.body.changed.record && pt.body.changed.record.now === true && profiles[0].record === true, 'PATCH edits `record` through the keeper');
  await call('PATCH', `/api/browser/profiles/${P1}`, { record: false });
  const bad = await call('PATCH', `/api/browser/profiles/${P1}`, { dir: '/etc' });
  ok(bad.status === 400 && /dir/.test(bad.body.error), 'an unknown field is refused BY NAME');
  ok((await call('PATCH', `/api/browser/profiles/bp-00000099`, { record: true })).status === 404 && (await call('PATCH', `/api/browser/profiles/x`, {})).status === 400, 'unknown profile 404; bad id 400');
  const h = await call('GET', `/api/browser/housekeeping`);
  ok(h.status === 200 && Array.isArray(h.body.profiles) && Array.isArray(h.body.orphans) && Array.isArray(h.body.forgotten) && h.body.limits.staleDays === T.STALE_PROFILE_DAYS, 'GET /api/browser/housekeeping is the panel\'s view');
  const sw = await call('POST', `/api/browser/housekeeping/sweep`);
  ok(sw.status === 200 && sw.body.ok && sw.body.removed === 0 && Array.isArray(sw.body.plan.kept), 'POST …/sweep runs it now and answers the plan');
  const fg = await call('POST', `/api/browser/profiles/${P1}/forget`);
  ok(fg.status === 409 && fg.body.code === 'leased', 'forget on a leased profile is 409 leased');
  ok((await call('POST', `/api/browser/forgotten/fg-00000000/delete`)).status === 404 && (await call('POST', `/api/browser/forgotten/nope/delete`)).status === 400, 'forgotten delete: unknown 404, bad id 400');
  ok((await call('POST', `/api/browser/orphans/adopt`, { dir: dirOf('x') })).status === 400 && (await call('POST', `/api/browser/orphans/forget`, { dir: '/etc' })).status === 400 && (await call('POST', `/api/browser/orphans/forget`, { dir: '/etc' })).body.code === 'not_ours', 'adopt needs a label; forgetting /etc is not_ours');
  const rl = await call('GET', `/api/browser/recordings/${P1}`);
  ok(rl.status === 200 && Array.isArray(rl.body.recordings) && rl.body.live === null && (await call('GET', `/api/browser/recordings/${P1}/../x.webm`)).status !== 200 && (await call('GET', `/api/browser/recordings/${P1}/nope-1.webm`)).status === 404, 'the recordings list; a bad name never resolves; a missing file is 404');
  srv.close();
}

// ═══ ⑤ THE REAL KEEPER'S SEAM over the fake agent-browser ═══════════════════
console.log('— ⑤ the real keeper: onLease + addDigest + updateProfile');
{
  const rtEnv = { FAKE_AB_STATE: AB_STATE, PATH: PATH_ENV, HOME };
  const DATA2 = path.join(ROOT, 'data2'); fs.mkdirSync(DATA2, { recursive: true });
  const keeper = K.create({
    dataDir: DATA2, homeDir: HOME, env: () => rtEnv, broadcast: () => { }, serverSetting: (k) => settings[k], serverNotice: null, getTelemetry: () => null,
    liveKeys: () => new Set([KEY_A, KEY_B]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }),
    log: quiet, now, install: false,
  });
  realKeeper = keeper;
  const events = [];
  keeper.onLease((ev) => events.push(ev));
  const rb = fakeBridge();
  const rec = R.create({ dataDir: DATA2, homeDir: HOME, keeper, bridge: rb, serverSetting: (k) => settings[k], broadcast: () => { }, log: quiet, now, execFileImpl: fakeDu, sweepEveryMs: 0 });
  rec.install();
  const p = keeper.createProfile({ label: 'Seam' }, { owner: { kind: 'session', id: KEY_A } });
  await keeper.attach({ profileId: p.id, browserKey: KEY_A, sessionId: 'sess-1' });
  ok(events.some((e) => e.kind === 'browser-ready' && e.profileId === p.id) && events.some((e) => e.kind === 'attach' && e.profileId === p.id && e.browserKey === KEY_A && e.sessionId === 'sess-1' && e.created === true), 'attach emits browser-ready (from the start) and attach (created)');
  ok(events.findIndex((e) => e.kind === 'browser-ready') < events.findIndex((e) => e.kind === 'attach'), '…in that order: the browser is up before the lease is announced');
  await until(() => rb.taps.has(`sess-1|${p.id}`));
  ok(rb.taps.has(`sess-1|${p.id}`) && rec._taps.size === 1, 'the recorder\'s tap is armed through the seam');
  const u = keeper.updateProfile(p.id, { record: true });
  ok(u.changed.record && u.changed.record.was === false && u.changed.record.now === true && keeper.profile(p.id).record === true && events.some((e) => e.kind === 'profile-updated' && e.changed.record), 'updateProfile flips record and announces was → now');
  let err = null; try { keeper.updateProfile(p.id, { dir: '/etc', provider: 'cdp' }); } catch (e) { err = e; }
  ok(err && err.code === 'bad-request' && /dir, provider/.test(err.message), 'anything but record / label / notes is refused by name');
  ok(keeper.updateProfile(p.id, { label: 'Seam' }).changed.label === undefined && keeper.updateProfile(p.id, { label: 'Seam 2' }).changed.label.now === 'Seam 2', 'the label validates like a create; the same label changes nothing');
  const dirBefore = keeper.profile(p.id).dir;
  const pl = keeper.updateProfile(p.id, { label: '/etc/passwd' });
  ok(pl.changed.label && keeper.profile(p.id).dir === dirBefore && keeper.profile(p.id).dir !== '/etc/passwd', 'a label is free text and NEVER reaches the directory (the dir derives from the id — the registry\'s own rule)');
  ok(keeper.list().recording && keeper.list().traceOn === true && typeof keeper.list().traceTaps === 'number', 'the recorder\'s digest is merged into list() (recording / traceOn / traceTaps)');
  keeper.detach({ profileId: p.id, browserKey: KEY_A });
  ok(events.some((e) => e.kind === 'detach' && e.profileId === p.id) && !rb.taps.has(`sess-1|${p.id}`) && rec._taps.size === 0, 'detach emits detach and the tap is gone');
  await keeper.stop(p.id, { why: 'test' });
  ok(events.some((e) => e.kind === 'browser-stopped' && e.profileId === p.id), 'stop emits browser-stopped');
  rec.shutdown();
  keeper.shutdown();
  realKeeper = null;
}

// ═══ ⑥ THE CLIENT HALF: the PURE helpers the tool card / the timeline / the panel draw with, and the WIRING PINS ═══
console.log('— ⑥ the client half: the PURE card helpers, the wiring pins, the i18n census');
{
  ok(T.bytesText(0) === '0 B' && T.bytesText(1536) === '1.5 KB' && T.bytesText(3 * 1048576) === '3.0 MB' && T.bytesText(2.5 * 1073741824) === '2.50 GB' && T.bytesText(null) === '—' && T.bytesText(-1) === '—', 'bytesText: units, and — for an unmeasured size');
  ok(T.toolCommandText({ command: 'agent-browser click #go' }) === 'agent-browser click #go' && T.toolCommandText({ command: ['bash', '-lc', 'vibespace-browser click @e1'] }) === 'bash -lc vibespace-browser click @e1' && T.toolCommandText({ cmd: 'x' }) === 'x' && T.toolCommandText({}) === '' && T.toolCommandText(null) === '', "toolCommandText: claude's string, codex's argv array, nothing for a non-shell tool");
  ok(T.commandDrivesBrowser(T.toolCommandText({ command: ['bash', '-lc', 'cd /w && agent-browser open https://x'] })) && !T.commandDrivesBrowser(T.toolCommandText({ command: 'ls -la' })) && !T.commandDrivesBrowser('echo agent-browsers'), 'the card gate over both shapes; a word that merely contains the name is not a drive');
  const s1 = T.traceSummary([{ id: 'tr-1', at: 10, ok: true }, { id: 'tr-2', at: 30, ok: false }, { id: 'tr-3', at: 20, ok: null }]);
  ok(s1.n === 3 && s1.failed === 1 && s1.first === 10 && s1.last === 30 && T.traceSummary([]).n === 0 && T.traceSummary(null).n === 0, 'traceSummary: count, failures, first/last');
  ok(JSON.stringify(T.unionWindow([{ from: 5, to: 9 }, { from: 1, to: 3 }, null])) === '{"from":1,"to":9}' && T.unionWindow([]) === null, 'unionWindow: ONE fetch window over many cards');
  // the distribution: adjacent cards' windows overlap by their pads — an entry lands on exactly one card, the one RUNNING when it happened
  const W = [{ id: 'a', ts: 2000, ...T.traceWindowFor({ ts: 2000, nextTs: 5000 }) }, { id: 'b', ts: 5000, ...T.traceWindowFor({ ts: 5000, nextTs: 9000 }) }, { id: 'c', ts: 9000, ...T.traceWindowFor({ ts: 9000, now: 12000 }) }];
  const E = [{ id: 'tr-1', at: 2500 }, { id: 'tr-2', at: 4400 }, { id: 'tr-3', at: 5100 }, { id: 'tr-4', at: 6500 }, { id: 'tr-5', at: 9200 }, { id: 'tr-6', at: 12500 }, { id: 'tr-7', at: 100 }];
  const D = T.assignEntriesToWindows(W, E);
  ok(D.a.map((e) => e.id).join() === 'tr-7,tr-1,tr-2' && D.b.map((e) => e.id).join() === 'tr-3,tr-4' && D.c.map((e) => e.id).join() === 'tr-5', 'each entry on exactly one card: 4400 belongs to the call at 2000 (the one at 5000 was not running yet — 600 ms is beyond skew), 5100 to the call at 5000, 100 to the first card\'s pad, nothing twice');
  ok(!Object.values(D).flat().some((e) => e.id === 'tr-6') && Object.keys(D).length === 3 && Object.values(D).flat().length === 6, 'an entry outside every window lands nowhere; every card is present (an empty list is an answer)');
  const skew = T.assignEntriesToWindows([{ id: 'a', ts: 2000, from: 0, to: 7000 }, { id: 'b', ts: 5000, from: 3000, to: 9000 }], [{ id: 'tr-1', at: 4700 }]);
  ok(skew.b.length === 1 && skew.a.length === 0, 'clock skew: an action 300 ms before a card\'s own ts still belongs to that card (skew 500 ms)');
  const only = T.assignEntriesToWindows([{ id: 'b', ts: 5000, from: 3000, to: 9000 }], [{ id: 'tr-1', at: 3500 }]);
  ok(only.b.length === 1, 'an entry only LATER cards can hold goes to the earliest of them (a card whose ts lags the daemon clock)');
  ok(T.positionText({ kind: 'point', x: 12, y: 34 }) === '12,34' && T.positionText({ kind: 'box', selector: '#go', box: { x: 10.4, y: 20, width: 100, height: 30 } }) === '#go 100×30 @ 10,20' && T.positionText({ kind: 'target', selector: '@e1', why: 'timed out' }) === '@e1 (timed out)' && T.positionText({ kind: 'keys', keys: 'Enter' }) === 'Enter' && T.positionText({ kind: 'scroll', direction: 'down', amount: 300 }) === 'down 300' && T.positionText({ kind: 'navigation', url: 'https://x' }) === 'https://x' && T.positionText({ kind: 'input', why: 'no coordinates' }) === 'no coordinates' && T.positionText(null) === '', 'positionText: one line per kind');
  ok(T.frameUrl('tr-0123456789ab', 'before') === '/api/browser/trace/tr-0123456789ab/frame/before' && T.frameUrl('tr-0123456789ab', 'middle') === '' && T.frameUrl('../x', 'after') === '', 'frameUrl: only an entry id, only before|after (drawn through .src, never markup)');
  ok(Array.isArray(T.HOUSEKEEPING_STATES) && T.HOUSEKEEPING_STATES.length === 6 && Object.isFrozen(T.HOUSEKEEPING_STATES), 'HOUSEKEEPING_STATES is a closed frozen set of 6');
  // every state housekeepingVerdict can answer is in the closed set (the panel's phrase table is pinned to it)
  const NOW = 100 * 86400000;
  const states = new Set(T.housekeepingVerdict({ profiles: [{ id: 'bp-00000001', label: 'a', provider: 'cloud:x', dir: '/d' }, { id: 'bp-00000002', label: 'b', provider: 'chromium', dir: '/d2', lastUsedAt: 1000 }, { id: 'bp-00000003', label: 'c', provider: 'chromium', dir: '/d3' }, { id: 'bp-00000004', label: 'd', provider: 'chromium', dir: '/d4', lastUsedAt: NOW - 1000 }, { id: 'bp-00000005', label: 'e', provider: 'chromium', dir: '/d5', lastUsedAt: NOW - 3 * 86400000 }, { id: 'bp-00000006', label: 'f', provider: 'chromium', dir: '/d6', lastUsedAt: NOW - 40 * 86400000 }], leases: [{ profileId: 'bp-00000002' }], browsers: { 'bp-00000003': { state: 'ready', pid: process.pid } }, now: NOW }).map((r) => r.state));
  ok([...states].every((st) => T.HOUSEKEEPING_STATES.includes(st)) && states.size === 6, `every verdict state is in the closed set (saw ${[...states].join(', ')})`);

  // ── WIRING PINS (the 2.355.0 lesson: a PURE fix with an unstaged caller is dead code with a green suite) ──
  const read = (f) => fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', f), 'utf8');
  const renderers = read('src/lib/chat-renderers.js');
  ok(/import \{ commandDrivesBrowser, toolCommandText \} from '\.\.\/browser-trace\.js'/.test(renderers) && /export function browserTraceHolderHtml\(block, msg\)/.test(renderers), 'chat-renderers imports the PURE gate and exports the holder builder');
  ok((renderers.match(/\$\{browserTraceHolderHtml\(block, msg\)\}/g) || []).length === 3, 'the holder is on all THREE card shapes (pending / error / generic)');
  ok(/class="chat-browser-trace" data-trace-ts=/.test(renderers) && /chat-browser-trace-btn/.test(renderers) && /chat-browser-trace-strip/.test(renderers) && /chat-browser-trace-list/.test(renderers), 'the holder carries its ts, the button, the strip and the list');
  const view = read('src/lib/chat-view.js');
  ok(/this\._browserTrace = createCardTraceLoader\(this\)/.test(view) && /this\._browserTrace\?\.observe\(el\)/.test(view) && (view.match(/browser-trace-appended/g) || []).length >= 2 && /this\._browserTrace\?\.dispose\(\)/.test(view), 'chat-view: ONE loader per view, observe() inside _applyElementMarks (the hook every element-making path calls), the broadcast on BOTH handlers, dispose');
  const marks = view.slice(view.indexOf('  _applyElementMarks(el, msg) {'), view.indexOf('  _markRewoundEl(el, kind) {'));
  ok(/this\._browserTrace\?\.observe\(el\)/.test(marks), 'observe() lives in _applyElementMarks itself (create / swap / gap all pass through it)');
  const tv = read('src/lib/browser-trace-view.js');
  ok(/export function createCardTraceLoader\(view\)/.test(tv) && /export function createTraceTimeline\(app/.test(tv) && /export function openTraceEntryDialog\(app, entry, list/.test(tv) && /export function renderTraceStrip\(container, entries/.test(tv), 'the client module exports the loader, the timeline, the dialog and the strip');
  ok(/img\.src = frameUrl\(/.test(tv) && !/innerHTML\s*=/.test(tv), 'frames are drawn through .src (never markup) and the module never assigns innerHTML');
  ok(/overlayGeometry\(\{ position: entry\.position, frame, drawn:/.test(tv), 'the overlay geometry comes from the PURE rule, in the drawn picture\'s px');
  ok(/from '\.\.\/browser-trace\.js'/.test(tv) && /assignEntriesToWindows\(windows\.map/.test(tv) && /unionWindow\(windows\.map/.test(tv), 'the loader distributes with the PURE assignment over ONE union fetch');
  ok(/q\.set\('conversation'/.test(tv) && /startsWith\('view-'\)/.test(tv), 'a view-only (stopped) conversation asks by its conversation id, never by its `view-…` window id');
  // the i18n census: every t('…') literal in the client module has a zh AND a ja entry (the a3 rule — no Latin-only chrome in zh/ja)
  const lits = [...tv.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  const dict = (f) => new Set([...read(f).matchAll(/^  (?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'): /gm)].map((m) => (m[1] !== undefined ? m[1] : m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"')));
  const zh = dict('src/lib/i18n-zh.js'), ja = dict('src/lib/i18n-ja.js');
  const missing = lits.filter((k) => !zh.has(k) || !ja.has(k));
  ok(lits.length >= 30 && missing.length === 0, `every t() literal in browser-trace-view.js has zh + ja entries (${lits.length} literals)`, missing.join(' | '));
  // the live view (P5 part 2): the Actions pane + the recording indicator
  const lw = read('src/lib/browser-live-window.js');
  ok(/import \{ createTraceTimeline \} from '\.\/browser-trace-view\.js'/.test(lw) && /const timeline = createTraceTimeline\(app, \{ sessionId \}\)/.test(lw) && /traceBtn\.dataset\.pane = 'trace'/.test(lw) && /side\.append\(tabsPane, consPane, tracePane\)/.test(lw), 'the live view mounts the timeline as its third pane');
  ok(/case 'trace': if \(m\.entry && timeline\.push\(m\.entry\)\)/.test(lw) && /renderRec\(\); syncTrace\(\);/.test(lw) && /timeline\.clear\(\); renderTraceBtn\(\);/.test(lw), "the stream's `trace` record grows it, every hello re-seeds the pane's scope, a pane switch clears it");
  ok(/d\.recording \? d\.recording\[pid\]/.test(lw) && /d\.recordingRefused \? d\.recordingRefused\[pid\]/.test(lw) && /app\.openBrowserProfiles\(\{ focus: pid \}\)/.test(lw) && !/fetchJson\([^)]*recordings/.test(lw), 'the recording indicator reads the DIGEST (recording / recordingRefused), never fetches, and its click opens the Browser profiles panel');
  // the profiles panel (P5 part 3): the closed state set is WORDED in full, the window type + the ⚙ row + the install are wired, every action goes through a confirm dialog (never a native one)
  ok(T.HOUSEKEEPING_STATES.every((st) => new RegExp(`case '${st}': return t\\(`).test(tv)), `stateText words every HOUSEKEEPING_STATES entry (${T.HOUSEKEEPING_STATES.join(', ')})`);
  ok(/registerWindowType\(\{\s*type: 'browser-profiles', label: 'Browser profiles', singleton: true/.test(tv) && /const PANEL_TYPE = 'browser-profiles'/.test(tv) && /action: 'openBrowserProfiles'/.test(tv), 'the panel is a singleton window type with a replayable openSpec action');
  ok(/registerMenuItem\(\{ menu: 'gear', parent: 'tools', order: 35/.test(tv) && /label: \(\) => t\('Browser profiles…'\)/.test(tv) && /when: \(c\) => !!c\.app\._browserProfiles/.test(tv), 'the ⚙ row files under Tools at 35 (between Desktop apps 30 and Plugins 40), gated on the profile digest');
  ok(/export function installBrowserTrace\(App\)/.test(tv) && /App\.prototype\.openBrowserProfiles = function/.test(tv) && /installBrowserTrace\(App\);/.test(read('src/lib/app.js')) && /import \{ installBrowserTrace \} from '\.\/browser-trace-view\.js'/.test(read('src/lib/app.js')), 'app.openBrowserProfiles is installed from app.js (the mixin tail)');
  ok(!/\b(?:window\.)?(?:confirm|prompt|alert)\(/.test(tv) && (tv.match(/showConfirmDialog\(/g) || []).length >= 3 && /showInputDialog\(/.test(tv), 'set aside / delete / adopt each go through the in-app dialogs — never a native confirm/prompt');
  ok(/danger: true/.test(tv) && /forgotten\/\$\{encodeURIComponent\(f\.id\)\}\/delete/.test(tv) && !/orphans\/delete|profiles\/[^`]*\/delete/.test(tv), 'the ONE permanent deletion is the forgotten row\'s click (danger-styled confirm); no other route here deletes');
  ok(/'browser-housekeeping-updated' \|\| m\.type === 'browser-profiles-updated' \|\| m\.type === 'browser-trace-appended'/.test(tv) && /app\.ws\?\.offGlobal\?\.\(onGlobal\)/.test(tv), 'the panel re-renders from the three broadcasts and removes its ws handler on close');
  ok(/\{ record: cb\.checked \}/.test(tv) && /method: 'PATCH'|jsonInit\('PATCH'/.test(tv), 'the per-profile screencast opt-in is the PATCH the keeper answers (D7)');
  const llits = [...lw.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  const lmissing = llits.filter((k) => !zh.has(k) || !ja.has(k));
  ok(llits.length >= 40 && lmissing.length === 0, `every t() literal in browser-live-window.js has zh + ja entries (${llits.length} literals)`, lmissing.join(' | '));
  const rlits = [...renderers.slice(renderers.indexOf('export function browserTraceHolderHtml'), renderers.indexOf('export function browserTraceHolderHtml') + 1400).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  ok(rlits.length >= 3 && rlits.every((k) => zh.has(k) && ja.has(k)), `the holder's own strings too (${rlits.length})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
